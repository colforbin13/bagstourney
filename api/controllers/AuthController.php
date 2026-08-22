<?php
// api/controllers/AuthController.php

require_once __DIR__ . '/../services/PostmarkClient.php';

class AuthController {
    private $db;

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

        // Every column publicUser() emits has to be selected here — it is the only query
        // that feeds it. `plan` was added to the payload without being added here, so the
        // session always reported 'free' and the paid-tier UI never unlocked.
        $stmt = $this->db->prepare('SELECT id, username, email, password_hash, role, status, plan FROM users WHERE username = ? OR email = ? LIMIT 1');
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

        // Fail closed rather than open: if verification email can't be sent, don't create
        // a live account the security control was meant to gate (FEATURE_TRACKER item 9).
        $postmark = new PostmarkClient(POSTMARK_API_TOKEN, POSTMARK_FROM_EMAIL, POSTMARK_MESSAGE_STREAM);
        if (!$postmark->isConfigured()) {
            http_response_code(500);
            echo json_encode(['error' => 'Account registration is temporarily unavailable. Please try again later.']);
            return;
        }

        $verifyToken = bin2hex(random_bytes(32));
        $verifyTokenHash = hash('sha256', $verifyToken);
        $expiresAt = date('Y-m-d H:i:s', time() + 72 * 3600);

        try {
            $stmt = $this->db->prepare('
                INSERT INTO users (username, email, password_hash, role, status, email_verify_token_hash, email_verify_token_expires_at)
                VALUES (?, ?, ?, "organizer", "disabled", ?, ?)
            ');
            $stmt->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT), $verifyTokenHash, $expiresAt]);
            $userId = (int)$this->db->lastInsertId();
        } catch (PDOException $e) {
            http_response_code(409);
            echo json_encode(['error' => 'That username or email address is already registered']);
            return;
        }

        $verifyUrl = rtrim(APP_PUBLIC_URL, '/') . '/verify-email?token=' . $verifyToken;
        $content = $this->buildVerificationEmail($username, $verifyUrl);
        $result = $postmark->send($email, $content['subject'], $content['html'], $content['text'], 'organizer_verification');

        if (!$result['success']) {
            // No resend flow exists yet, so a stuck 'disabled' row with no way to activate
            // it is worse than failing the request — undo the insert instead.
            $this->db->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
            http_response_code(500);
            echo json_encode(['error' => 'Could not send the verification email. Please try again later.']);
            return;
        }

        http_response_code(201);
        echo json_encode(['message' => 'Account created. Check your email to verify your address before signing in.']);
    }

    public function verifyEmail(array $body): void {
        $token = $body['token'] ?? '';

        if (!$token) {
            http_response_code(400);
            echo json_encode(['error' => 'Verification token is required']);
            return;
        }

        $tokenHash = hash('sha256', $token);
        $stmt = $this->db->prepare('
            SELECT id FROM users WHERE email_verify_token_hash = ? AND email_verify_token_expires_at > NOW()
        ');
        $stmt->execute([$tokenHash]);
        $user = $stmt->fetch();

        // Same generic error for an unknown, expired, or already-used token so a caller
        // cannot distinguish those cases, matching the password-reset endpoint's convention.
        if (!$user) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid or expired verification link']);
            return;
        }

        $this->db->prepare('
            UPDATE users
            SET status = "active", email_verify_token_hash = NULL, email_verify_token_expires_at = NULL
            WHERE id = ?
        ')->execute([$user['id']]);

        writeAuditLog($this->db, null, (int)$user['id'], 'organizer_email_verified', 'user', (string)$user['id']);

        http_response_code(200);
        echo json_encode(['message' => 'Email verified. You can now sign in.']);
    }

    private function buildVerificationEmail(string $username, string $verifyUrl): array {
        $accent = '#BC3A1C';
        $ink = '#FFF8EF';
        $text = '#22261F';
        $textDim = '#5B5A4E';
        $font = "Arial,Helvetica,sans-serif";

        $html = '<div style="font-family:' . $font . ';font-size:15px;line-height:1.6;color:' . $text . ';max-width:480px;">' .
            '<p style="margin:0 0 16px;font-weight:700;">Bracketway</p>' .
            '<p style="margin:0 0 16px;">Hi ' . htmlspecialchars($username) . ',</p>' .
            '<p style="margin:0 0 20px;">Confirm your email address to activate your organizer account.</p>' .
            '<p style="margin:0 0 20px;"><a href="' . htmlspecialchars($verifyUrl) . '" style="display:inline-block;background:' . $accent . ';color:' . $ink . ';font-weight:700;text-decoration:none;padding:11px 22px;border-radius:4px;">Verify email address</a></p>' .
            '<p style="margin:0;font-size:13px;color:' . $textDim . ';">This link expires in 72 hours. If you did not create this account, you can ignore this email.</p>' .
            '</div>';

        $plainText = "Hi {$username},\n\nConfirm your email address to activate your Bracketway organizer account:\n{$verifyUrl}\n\nThis link expires in 72 hours. If you did not create this account, you can ignore this email.\n\n— Bracketway";

        return ['subject' => 'Verify your Bracketway account', 'html' => $html, 'text' => $plainText];
    }

    private function publicUser(array $user): array {
        return [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'role' => $user['role'],
            // Lets the UI reflect paid-tier entitlements (FEATURE_TRACKER item 16's format
            // selector). Presentation only — every paid feature is gated server-side too,
            // so a stale cached profile can mislead the UI but never grant anything.
            // Defaulted for legacy 'admins' rows migrated on first login, which predate the
            // column.
            'plan' => isset($user['plan']) ? $user['plan'] : 'free',
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
