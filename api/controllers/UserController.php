<?php
// Super-admin account management. Tournament roles remain in tournament_members.

class UserController {
    private $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    public function list(): void {
        requireSuperAdmin($this->db);
        $stmt = $this->db->query('SELECT id, username, email, role, status, created_at FROM users ORDER BY created_at DESC');
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
            echo json_encode(['id' => $userId, 'username' => $username, 'email' => $email, 'role' => $role, 'status' => 'active']);
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
        if (isset($body['role'])) {
            if (!in_array($body['role'], ['super_admin', 'organizer'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid global role']);
                return;
            }
            if ($target['role'] === 'super_admin' && $body['role'] !== 'super_admin') $this->ensureAnotherSuperAdmin($id);
            $fields[] = 'role = ?';
            $params[] = $body['role'];
        }
        if (isset($body['status'])) {
            if (!in_array($body['status'], ['active', 'disabled'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid account status']);
                return;
            }
            if ($target['role'] === 'super_admin' && $body['status'] !== 'active') $this->ensureAnotherSuperAdmin($id);
            $fields[] = 'status = ?';
            $params[] = $body['status'];
        }
        if (!$fields) {
            http_response_code(400);
            echo json_encode(['error' => 'Nothing to update']);
            return;
        }

        $params[] = $id;
        $this->db->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
        writeAuditLog($this->db, null, (int)$actor['id'], 'user_account_updated', 'user', (string)$id, $body);
        $stmt = $this->db->prepare('SELECT id, username, email, role, status, created_at FROM users WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode($stmt->fetch());
    }

    private function ensureAnotherSuperAdmin(int $targetUserId): void {
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM users WHERE role = "super_admin" AND status = "active" AND id <> ?');
        $stmt->execute([$targetUserId]);
        if ((int)$stmt->fetchColumn() === 0) {
            http_response_code(400);
            echo json_encode(['error' => 'At least one active super admin is required']);
            exit;
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
