<?php
// Super-admin account management. Tournament roles remain in tournament_members.

class UserController {
    private $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    public function list(): void {
        requireSuperAdmin($this->db);
        $stmt = $this->db->query('SELECT id, username, email, role, status, plan, created_at FROM users ORDER BY created_at DESC');
        echo json_encode($stmt->fetchAll());
    }

    // Any authenticated user can look up an existing account by username/email — used by
    // tournament owners (who are not necessarily super admins) to find a user to add as
    // tournament staff. Deliberately minimal: no status/created_at, only active accounts,
    // and a short result cap so it can't be used to enumerate the full user directory.
    public function search(string $query): void {
        requireCurrentUser($this->db);
        $query = trim($query);
        if (strlen($query) < 2) {
            echo json_encode([]);
            return;
        }
        // Escape LIKE wildcards in the user-supplied text so e.g. searching "%" doesn't
        // match every active user.
        $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $query);
        $like = '%' . $escaped . '%';
        $stmt = $this->db->prepare("
            SELECT id, username, email, role
            FROM users
            WHERE status = 'active' AND (username LIKE ? OR email LIKE ?)
            ORDER BY username
            LIMIT 10
        ");
        $stmt->execute([$like, $like]);
        echo json_encode($stmt->fetchAll());
    }

    public function create(array $body): void {
        $actor = requireSuperAdmin($this->db);
        $username = trim($body['username'] ?? '');
        $email = strtolower(trim($body['email'] ?? ''));
        $password = $body['password'] ?? '';
        $role = $body['role'] ?? 'organizer';

        if (!$username || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 12 || !in_array($role, ['organizer', 'super_admin'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Username, valid email, password of at least 12 characters, and a valid role are required']);
            return;
        }

        try {
            $stmt = $this->db->prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)');
            $stmt->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT), $role]);
            $userId = (int)$this->db->lastInsertId();
            writeAuditLog($this->db, null, (int)$actor['id'], 'user_account_created', 'user', (string)$userId, ['role' => $role]);
            http_response_code(201);
            echo json_encode(['id' => $userId, 'username' => $username, 'email' => $email, 'role' => $role, 'status' => 'active', 'plan' => 'free']);
        } catch (PDOException $e) {
            http_response_code(409);
            echo json_encode(['error' => 'That username or email address is already registered']);
        }
    }

    public function update(int $id, array $body): void {
        $actor = requireSuperAdmin($this->db);
        $stmt = $this->db->prepare('SELECT id, role, status FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $target = $stmt->fetch();
        if (!$target) {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
            return;
        }

        $fields = [];
        $params = [];
        $demotesOrDisablesSuperAdmin = false;
        if (isset($body['role'])) {
            if (!in_array($body['role'], ['super_admin', 'organizer'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid global role']);
                return;
            }
            if ($target['role'] === 'super_admin' && $body['role'] !== 'super_admin') $demotesOrDisablesSuperAdmin = true;
            $fields[] = 'role = ?';
            $params[] = $body['role'];
        }
        if (isset($body['status'])) {
            if (!in_array($body['status'], ['active', 'disabled'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid account status']);
                return;
            }
            if ($target['role'] === 'super_admin' && $body['status'] !== 'active') $demotesOrDisablesSuperAdmin = true;
            $fields[] = 'status = ?';
            $params[] = $body['status'];
        }
        if (isset($body['plan'])) {
            // FEATURE_TRACKER item 12 plumbing: no billing exists yet, so this is a
            // manual stand-in for what Stripe will flip automatically once it ships.
            if (!in_array($body['plan'], ['free', 'paid'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid plan']);
                return;
            }
            $fields[] = 'plan = ?';
            $params[] = $body['plan'];
        }
        if (!$fields) {
            http_response_code(400);
            echo json_encode(['error' => 'Nothing to update']);
            return;
        }

        $params[] = $id;

        // Run the last-super-admin check and the update in the same transaction, with a
        // locking read, so two concurrent demote/disable requests can't both pass the
        // check before either commits and leave zero active super admins.
        $this->db->beginTransaction();
        try {
            if ($demotesOrDisablesSuperAdmin) {
                $this->ensureAnotherSuperAdmin($id);
            }
            $this->db->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
            writeAuditLog($this->db, null, (int)$actor['id'], 'user_account_updated', 'user', (string)$id, $body);
            $this->db->commit();
        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
            return;
        }

        $stmt = $this->db->prepare('SELECT id, username, email, role, status, plan, created_at FROM users WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode($stmt->fetch());
    }

    private function ensureAnotherSuperAdmin(int $targetUserId): void {
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM users WHERE role = "super_admin" AND status = "active" AND id <> ? FOR UPDATE');
        $stmt->execute([$targetUserId]);
        if ((int)$stmt->fetchColumn() === 0) {
            throw new Exception('At least one active super admin is required');
        }
    }

    public function resetPassword(int $id): void {
        $actor = requireSuperAdmin($this->db);
        $stmt = $this->db->prepare('SELECT id, email FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        if (!$user) {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
            return;
        }

        // Generate a secure random token (64 hex chars = 256 bits)
        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $expiresAt = date('Y-m-d H:i:s', time() + 86400); // 24 hours

        // Clear any existing tokens for this user
        $this->db->prepare('DELETE FROM password_reset_tokens WHERE user_id = ?')->execute([$id]);

        // Store only the token hash; the plaintext token is returned once and not persisted
        try {
            $stmt = $this->db->prepare('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)');
            $stmt->execute([$id, $tokenHash, $expiresAt]);
            writeAuditLog($this->db, null, (int)$actor['id'], 'password_reset_initiated', 'user', (string)$id);
            http_response_code(200);
            echo json_encode(['token' => $token, 'expires_at' => $expiresAt]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to generate reset token']);
        }
    }
}
