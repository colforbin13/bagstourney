<?php
// api/controllers/NotificationController.php
//
// Public, unauthenticated endpoints for the participant notification-email feature
// (FEATURE_TRACKER.md item 1): confirming a double opt-in, per-category one-click
// unsubscribe, viewing/editing all preferences, and Postmark's bounce/spam-complaint
// webhooks. Participants have no login — every action here is gated by a token, not a
// session (see api/middleware/auth.php::notificationManageToken()).

class NotificationController {
    public function __construct(PDO $db) {
        $this->db = $db;
    }

    public function confirm(array $body): void {
        $participantId = (int)($body['participant_id'] ?? 0);
        $token = $body['token'] ?? '';

        if (!$participantId || !$token) {
            http_response_code(400);
            echo json_encode(['error' => 'participant_id and token are required']);
            return;
        }

        $stmt = $this->db->prepare('
            SELECT id, tournament_id, notification_lifecycle, notification_confirm_token_hash,
                   notification_confirm_token_expires_at, notification_manage_token_version
            FROM participants WHERE id = ?
        ');
        $stmt->execute([$participantId]);
        $participant = $stmt->fetch();

        // Double-clicking an already-confirmed link is treated as success without
        // re-validating the token (the confirm token is cleared on first use, so a second
        // click would otherwise always fail with a confusing error).
        if ($participant && $participant['notification_lifecycle'] === 'confirmed') {
            echo json_encode([
                'message' => 'Your subscription is already confirmed.',
                'manage_preferences_url' => $this->managePreferencesUrl($participant),
            ]);
            return;
        }

        $valid = $participant
            && $participant['notification_lifecycle'] === 'pending'
            && $participant['notification_confirm_token_hash'] !== null
            && hash_equals($participant['notification_confirm_token_hash'], hash('sha256', $token))
            && $participant['notification_confirm_token_expires_at'] !== null
            && strtotime($participant['notification_confirm_token_expires_at']) > time();

        // Same generic error for unknown/expired/wrong token so a caller can't distinguish
        // those cases, matching the password-reset endpoint's convention.
        if (!$valid) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid or expired confirmation link']);
            return;
        }

        $this->db->prepare('
            UPDATE participants
            SET notification_lifecycle = "confirmed", notification_confirmed_at = NOW(),
                notification_confirm_token_hash = NULL, notification_confirm_token_expires_at = NULL
            WHERE id = ?
        ')->execute([$participantId]);

        writeAuditLog($this->db, (int)$participant['tournament_id'], null, 'participant_notification_confirmed', 'participant', (string)$participantId);

        echo json_encode([
            'message' => 'Subscription confirmed.',
            'manage_preferences_url' => $this->managePreferencesUrl($participant),
        ]);
    }

    public function unsubscribeCategory(array $body): void {
        $participantId = (int)($body['participant_id'] ?? 0);
        $token = $body['token'] ?? '';
        $category = $body['category'] ?? '';

        if (!isset(NOTIFICATION_CATEGORY_COLUMNS[$category])) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid category']);
            return;
        }

        $participant = $this->fetchParticipantForToken($participantId);
        if (!$participant || !$this->verifyManageToken($participant, $token)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid or expired link']);
            return;
        }

        $column = NOTIFICATION_CATEGORY_COLUMNS[$category];
        $this->db->prepare("UPDATE participants SET $column = 0 WHERE id = ?")->execute([$participantId]);

        writeAuditLog($this->db, (int)$participant['tournament_id'], null, 'participant_notification_unsubscribed', 'participant', (string)$participantId, ['category' => $category]);

        echo json_encode(['message' => 'You will no longer receive these emails.']);
    }

    public function getPreferences(array $query): void {
        $participantId = (int)($query['pid'] ?? 0);
        $token = $query['token'] ?? '';

        $stmt = $this->db->prepare('
            SELECT p.id, p.tournament_id, p.email, p.notification_lifecycle, p.notification_manage_token_version,
                   p.notify_match_completed, p.notify_round_completed, p.notify_tournament_finalized,
                   t.name AS tournament_name
            FROM participants p
            JOIN tournaments t ON p.tournament_id = t.id
            WHERE p.id = ?
        ');
        $stmt->execute([$participantId]);
        $participant = $stmt->fetch();

        if (!$participant || !$this->verifyManageToken($participant, $token)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid or expired link']);
            return;
        }

        echo json_encode([
            'email' => $participant['email'],
            'tournament_name' => $participant['tournament_name'],
            'categories' => [
                'match_completed' => (bool)$participant['notify_match_completed'],
                'round_completed' => (bool)$participant['notify_round_completed'],
                'tournament_finalized' => (bool)$participant['notify_tournament_finalized'],
            ],
        ]);
    }

    public function updatePreferences(array $body): void {
        $participantId = (int)($body['participant_id'] ?? 0);
        $token = $body['token'] ?? '';

        $participant = $this->fetchParticipantForToken($participantId);
        if (!$participant || !$this->verifyManageToken($participant, $token)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid or expired link']);
            return;
        }

        $fields = [];
        $params = [];
        $applied = [];
        foreach (NOTIFICATION_CATEGORY_COLUMNS as $category => $column) {
            if (array_key_exists($category, $body)) {
                $value = !empty($body[$category]) ? 1 : 0;
                $fields[] = "$column = ?";
                $params[] = $value;
                $applied[$category] = (bool)$value;
            }
        }

        if (!$fields) {
            http_response_code(400);
            echo json_encode(['error' => 'No preference fields provided']);
            return;
        }

        $params[] = $participantId;
        $this->db->prepare('UPDATE participants SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

        writeAuditLog($this->db, (int)$participant['tournament_id'], null, 'participant_notification_preferences_updated', 'participant', (string)$participantId, $applied);

        echo json_encode(['message' => 'Preferences updated.']);
    }

    public function webhookBounce(array $body): void {
        if (!$this->checkWebhookAuth()) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $email = strtolower(trim($body['Email'] ?? ''));
        // Postmark distinguishes transient bounces it will retry from ones it has
        // permanently deactivated; only the latter should suppress the address here.
        if ($email && !empty($body['Inactive'])) {
            $this->suppressEmail($email, 'bounce');
        }

        http_response_code(200);
        echo json_encode(['ok' => true]);
    }

    public function webhookComplaint(array $body): void {
        if (!$this->checkWebhookAuth()) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $email = strtolower(trim($body['Email'] ?? ''));
        if ($email) {
            $this->suppressEmail($email, 'spam_complaint');
        }

        http_response_code(200);
        echo json_encode(['ok' => true]);
    }

    private function suppressEmail(string $email, string $reason): void {
        $this->db->prepare('
            INSERT INTO notification_suppressions (email, reason) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE reason = VALUES(reason)
        ')->execute([$email, $reason]);

        $this->db->prepare('UPDATE participants SET notification_lifecycle = "suppressed" WHERE email = ?')
            ->execute([$email]);

        writeAuditLog($this->db, null, null, 'participant_notification_suppressed', 'email', $email, ['reason' => $reason]);
    }

    private function checkWebhookAuth(): bool {
        $user = $_SERVER['PHP_AUTH_USER'] ?? null;
        $pass = $_SERVER['PHP_AUTH_PW'] ?? null;

        // Some server configs (FastCGI/CGI in particular) don't populate PHP_AUTH_*;
        // fall back to parsing the raw Authorization header, same as requireAuth().
        if ($user === null) {
            $headers = getallheaders();
            $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
            if (strpos($auth, 'Basic ') === 0) {
                $decoded = base64_decode(substr($auth, 6));
                if ($decoded !== false && strpos($decoded, ':') !== false) {
                    [$user, $pass] = explode(':', $decoded, 2);
                }
            }
        }

        return $user !== null && $pass !== null
            && hash_equals(POSTMARK_WEBHOOK_USER, $user)
            && hash_equals(POSTMARK_WEBHOOK_PASS, $pass);
    }

    private function verifyManageToken(array $participant, string $token): bool {
        if ($participant['notification_lifecycle'] !== 'confirmed') return false;
        $expected = notificationManageToken((int)$participant['id'], (int)$participant['notification_manage_token_version']);
        return hash_equals($expected, $token);
    }

    private function managePreferencesUrl(array $participant): string {
        $token = notificationManageToken((int)$participant['id'], (int)$participant['notification_manage_token_version']);
        return rtrim(APP_PUBLIC_URL, '/') . '/notifications/preferences?pid=' . $participant['id'] . '&token=' . $token;
    }

    private function fetchParticipantForToken(int $participantId): ?array {
        if (!$participantId) return null;
        $stmt = $this->db->prepare('
            SELECT id, tournament_id, notification_lifecycle, notification_manage_token_version
            FROM participants WHERE id = ?
        ');
        $stmt->execute([$participantId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }
}

?>
