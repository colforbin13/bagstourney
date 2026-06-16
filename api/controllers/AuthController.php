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
            echo json_encode(['error' => 'Username and password required']);
            return;
        }

        $stmt = $this->db->prepare('SELECT id, username, password_hash FROM admins WHERE username = ?');
        $stmt->execute([$username]);
        $admin = $stmt->fetch();
        $verify = password_hash($password, PASSWORD_DEFAULT);
		// error_log('admin hash: ' . $verify, 0);
		// error_log('DB hash: ' . $admin['password_hash'], 0);

        if (!$admin || !password_verify($password, $admin['password_hash'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Invalid credentials']);
            return;
        }

        $token = generateJWT($admin['id'], $admin['username']);
        echo json_encode(['token' => $token, 'username' => $admin['username']]);
    }
}

?>