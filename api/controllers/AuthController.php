<?php
// api/controllers/AuthController.php

class AuthController {
    public function __construct(PDO $db) {
		$this->db = $db;
	}

    public function login(array $body): void {
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';

        if (!$username || !$password) {
            http_response_code(400);
            echo json_encode(['error' => 'Email or username and password required']);
            return;
        }

        $stmt = $this->db->prepare('SELECT id, username, email, password_hash, role, status FROM users WHERE username = ? OR email = ? LIMIT 1');
        $stmt->execute([$username, $username]);
        $user = $stmt->fetch();

        // Preserve access for a legacy administrator if its row was missed by
        // the one-time migration. A successful legacy login creates the
        // equivalent active super-admin account for all future requests.
        if (!$user) {
            $legacy = $this->db->prepare('SELECT username, password_hash FROM admins WHERE username = ? LIMIT 1');
            $legacy->execute([$username]);
            $admin = $legacy->fetch();

            if ($admin && password_verify($password, $admin['password_hash'])) {
                $insert = $this->db->prepare("INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, 'super_admin', 'active')");
                try {
                    $insert->execute([$admin['username'], $admin['password_hash']]);
                } catch (PDOException $e) {
                    // Another request may have created the matching account.
                }
                $stmt->execute([$username, $username]);
                $user = $stmt->fetch();
            }
        }

        if (!$user || $user['status'] !== 'active' || !password_verify($password, $user['password_hash'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Invalid credentials']);
            return;
        }

        $token = generateJWT((int)$user['id'], $user['username'] ?? $user['email'], $user['role']);
        echo json_encode(['token' => $token, 'user' => $this->publicUser($user)]);
    }

    public function register(array $body): void {
        $username = trim($body['username'] ?? '');
        $email = strtolower(trim($body['email'] ?? ''));
        $password = $body['password'] ?? '';

        if (!$username || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 12) {
            http_response_code(400);
            echo json_encode(['error' => 'Username, valid email, and a password of at least 12 characters are required']);
            return;
        }

        try {
            $stmt = $this->db->prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, "organizer")');
            $stmt->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT)]);
            $user = [
                'id' => (int)$this->db->lastInsertId(),
                'username' => $username,
                'email' => $email,
                'role' => 'organizer',
                'status' => 'active',
            ];
            $token = generateJWT($user['id'], $username, 'organizer');
            echo json_encode(['token' => $token, 'user' => $this->publicUser($user)]);
        } catch (PDOException $e) {
            http_response_code(409);
            echo json_encode(['error' => 'That username or email address is already registered']);
        }
    }

    private function publicUser(array $user): array {
        return [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'role' => $user['role'],
        ];
    }

    public function changePassword(array $body, array $actor): void {
        $currentPassword = $body['current_password'] ?? '';
        $newPassword = $body['new_password'] ?? '';

        if (!$currentPassword || strlen($newPassword) < 12) {
            http_response_code(400);
            echo json_encode(['error' => 'Current password and new password of at least 12 characters are required']);
            return;
        }

        // Verify current password against database
        $stmt = $this->db->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([(int)$actor['id']]);
        $user = $stmt->fetch();
        
        if (!$user || !password_verify($currentPassword, $user['password_hash'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Current password is incorrect']);
            return;
        }

        // Update password
        $stmt = $this->db->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $stmt->execute([password_hash($newPassword, PASSWORD_DEFAULT), (int)$actor['id']]);
        
        // Audit the change (don't log password or hash)
        writeAuditLog($this->db, null, (int)$actor['id'], 'user_password_changed', 'user', (string)$actor['id']);
        
        http_response_code(200);
        echo json_encode(['message' => 'Password changed successfully']);
    }

    public function resetPassword(array $body): void {
        $token = $body['token'] ?? '';
        $newPassword = $body['new_password'] ?? '';

        if (!$token || strlen($newPassword) < 12) {
            http_response_code(400);
            echo json_encode(['error' => 'Reset token and a new password of at least 12 characters are required']);
            return;
        }

        $tokenHash = hash('sha256', $token);
        $stmt = $this->db->prepare('SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()');
        $stmt->execute([$tokenHash]);
        $reset = $stmt->fetch();

        // Same generic error for an unknown, expired, and already-used token so a
        // caller cannot distinguish those cases.
        if (!$reset) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid or expired reset token']);
            return;
        }

        $stmt = $this->db->prepare('SELECT id, status FROM users WHERE id = ?');
        $stmt->execute([$reset['user_id']]);
        $user = $stmt->fetch();
        if (!$user || $user['status'] !== 'active') {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid or expired reset token']);
            return;
        }

        $this->db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($newPassword, PASSWORD_DEFAULT), $user['id']]);
        $this->db->prepare('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?')
            ->execute([$reset['id']]);

        writeAuditLog($this->db, null, (int)$user['id'], 'password_reset_completed', 'user', (string)$user['id']);

        http_response_code(200);
        echo json_encode(['message' => 'Password reset successfully']);
    }
}

?>
