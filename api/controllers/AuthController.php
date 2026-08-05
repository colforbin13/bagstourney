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
}

?>
