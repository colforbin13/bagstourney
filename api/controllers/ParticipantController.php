<?php
// api/controllers/ParticipantController.php

class ParticipantController {
    // Excludes notification_confirm_token_hash / notification_confirm_token_expires_at —
    // once those columns exist, a bare SELECT * here would leak the confirm token hash to
    // every participant list/edit response.
    const SAFE_COLUMNS = 'id, tournament_id, name, registration_status, email, notification_lifecycle,
        notify_match_completed, notify_round_completed, notify_tournament_finalized,
        notification_confirmed_at, notification_manage_token_version, created_at';

    // Soft cap on self-registration so a scripted flood (or a bored attendee mashing the
    // button) can't blow up a tournament's roster. Organizer-added participants are not
    // capped — this only guards the public, unauthenticated self-register endpoint.
    const MAX_PARTICIPANTS_PER_TOURNAMENT = 64;

    public function __construct(PDO $db) {
		$this->db = $db;
	}

    public function listByTournament(int $tournamentId): void {
        $stmt = $this->db->prepare(
            'SELECT ' . self::SAFE_COLUMNS . ' FROM participants WHERE tournament_id = ? ORDER BY name ASC'
        );
        $stmt->execute([$tournamentId]);
        echo json_encode($stmt->fetchAll());
    }

    public function create(array $body): void {
        $tournamentId = (int)($body['tournament_id'] ?? 0);
        $name = trim($body['name'] ?? '');

        if (!$tournamentId || !$name) {
            http_response_code(400);
            echo json_encode(['error' => 'tournament_id and name required']);
            return;
        }

        // Ensure tournament is still in setup phase and teams haven't been drawn yet —
        // manual seeding leaves a tournament in 'setup' with teams already formed while
        // awaiting bracket generation, and the roster must be locked for that window too,
        // not just once the tournament goes 'active'.
        $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        $t = $stmt->fetch();
        if (!$t || $t['status'] !== 'setup' || $this->teamsExist($tournamentId)) {
            http_response_code(400);
            echo json_encode(['error' => 'Tournament is not in setup phase']);
            return;
        }

        $stmt = $this->db->prepare(
            'INSERT INTO participants (tournament_id, name) VALUES (?, ?)'
        );
        $stmt->execute([$tournamentId, $name]);
        $id = (int)$this->db->lastInsertId();

        echo json_encode(['id' => $id, 'tournament_id' => $tournamentId, 'name' => $name, 'registration_status' => 'approved']);
    }

    public function delete(int $id): void {
        // Lookup participant and tournament
        $stmt = $this->db->prepare('SELECT tournament_id FROM participants WHERE id = ?');
        $stmt->execute([$id]);
        $p = $stmt->fetch();
        if (!$p) {
            http_response_code(404);
            echo json_encode(['error' => 'Participant not found']);
            return;
        }
        $tournamentId = (int)$p['tournament_id'];

        // Ensure tournament is still in setup phase
        $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        $t = $stmt->fetch();
        if (!$t) {
            http_response_code(404);
            echo json_encode(['error' => 'Tournament not found']);
            return;
        }
        if ($t['status'] !== 'setup' || $this->teamsExist($tournamentId)) {
            http_response_code(400);
            echo json_encode(['error' => 'Cannot delete participant after teams have been drawn']);
            return;
        }

        $this->db->prepare('DELETE FROM participants WHERE id = ?')->execute([$id]);
        echo json_encode(['success' => true]);
    }

    public function update(int $id, array $body): void {
        $name = trim($body['name'] ?? '');
        if (!$name) {
            http_response_code(400);
            echo json_encode(['error' => 'name required']);
            return;
        }

        $stmt = $this->db->prepare('SELECT id FROM participants WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Participant not found']);
            return;
        }

        // Participant names can be corrected even after teams are drawn. Capture any
        // already-drawn team's current state first, so that once the rename happens below
        // we can tell whether the team's name is still the auto-generated "P1 & P2" default
        // (safe to refresh) or was manually customized by the organizer (left alone) —
        // otherwise a post-draw rename silently diverges from the team/bracket display.
        $stmt = $this->db->prepare('
            SELECT t.id, t.name, t.participant1_id, t.participant2_id,
                   p1.name AS participant1_name, p2.name AS participant2_name
            FROM teams t
            JOIN participants p1 ON t.participant1_id = p1.id
            JOIN participants p2 ON t.participant2_id = p2.id
            WHERE t.participant1_id = ? OR t.participant2_id = ?
        ');
        $stmt->execute([$id, $id]);
        $teams = $stmt->fetchAll();

        $this->db->beginTransaction();
        try {
            $this->db->prepare('UPDATE participants SET name = ? WHERE id = ?')->execute([$name, $id]);

            foreach ($teams as $team) {
                $oldDefaultName = $team['participant1_name'] . ' & ' . $team['participant2_name'];
                if ($team['name'] !== $oldDefaultName) continue; // organizer customized this team's name

                $p1 = (int)$team['participant1_id'] === $id ? $name : $team['participant1_name'];
                $p2 = (int)$team['participant2_id'] === $id ? $name : $team['participant2_name'];
                $this->db->prepare('UPDATE teams SET name = ? WHERE id = ?')->execute([$p1 . ' & ' . $p2, $team['id']]);
            }

            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        echo json_encode($this->getSafeParticipant($id));
    }

    // Organizer-initiated: sets/updates a participant's notification email and (re)starts
    // the double opt-in flow. Re-submitting the same address while already confirmed is a
    // no-op success — that's also how a stuck 'pending' participant gets a resend, since
    // there's no separate resend endpoint.
    public function setNotificationEmail(int $id, array $body, array $actor): void {
        $email = strtolower(trim($body['email'] ?? ''));

        $stmt = $this->db->prepare('SELECT tournament_id, email, notification_lifecycle FROM participants WHERE id = ?');
        $stmt->execute([$id]);
        $participant = $stmt->fetch();
        if (!$participant) {
            http_response_code(404);
            echo json_encode(['error' => 'Participant not found']);
            return;
        }

        if ($email === '') {
            // Clear a previously-set email entirely — there was otherwise no way to
            // remove one once set, since a blank submission used to just fail
            // FILTER_VALIDATE_EMAIL with a generic error.
            if ($participant['email'] === null) {
                echo json_encode($this->getSafeParticipant($id));
                return;
            }
            $this->db->prepare('
                UPDATE participants
                SET email = NULL, notification_lifecycle = "none",
                    notification_confirm_token_hash = NULL, notification_confirm_token_expires_at = NULL,
                    notification_confirmed_at = NULL
                WHERE id = ?
            ')->execute([$id]);
            writeAuditLog($this->db, (int)$participant['tournament_id'], (int)$actor['id'], 'participant_notification_email_cleared', 'participant', (string)$id);
            echo json_encode($this->getSafeParticipant($id));
            return;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'A valid email address is required']);
            return;
        }

        if ($participant['notification_lifecycle'] === 'confirmed' && $participant['email'] === $email) {
            echo json_encode($this->getSafeParticipant($id));
            return;
        }

        $tournamentId = (int)$participant['tournament_id'];
        $warning = $this->startEmailOptIn($id, $tournamentId, $email, (int)$actor['id']);

        $result = $this->getSafeParticipant($id);
        if ($warning) $result['warning'] = $warning;
        echo json_encode($result);
    }

    // Public, unauthenticated: a coordinator shares a tournament's uuid link/QR at an
    // event and attendees add themselves. Self-registered rows start 'pending' —
    // TeamController::draw() excludes them, and the organizer approves/rejects (reject
    // reuses delete()) before they count toward the roster.
    public function selfRegister(array $body): void {
        // Honeypot: a real registration form never fills this hidden field, so a
        // non-empty value means a bot filled every field it could find. Report success
        // without touching the database so the bot doesn't learn it was rejected.
        if (trim($body['website'] ?? '') !== '') {
            echo json_encode(['success' => true]);
            return;
        }

        $uuid = trim($body['tournament_uuid'] ?? '');
        $name = trim($body['name'] ?? '');
        $email = strtolower(trim($body['email'] ?? ''));

        if (!$uuid || !$name) {
            http_response_code(400);
            echo json_encode(['error' => 'A tournament and name are required']);
            return;
        }

        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'That does not look like a valid email address']);
            return;
        }

        $stmt = $this->db->prepare('SELECT id, status FROM tournaments WHERE uuid = ?');
        $stmt->execute([$uuid]);
        $tournament = $stmt->fetch();
        if (!$tournament) {
            http_response_code(404);
            echo json_encode(['error' => 'Tournament not found']);
            return;
        }
        $tournamentId = (int)$tournament['id'];
        if ($tournament['status'] !== 'setup' || $this->teamsExist($tournamentId)) {
            http_response_code(400);
            echo json_encode(['error' => 'Registration is closed for this tournament']);
            return;
        }

        $countStmt = $this->db->prepare('SELECT COUNT(*) FROM participants WHERE tournament_id = ?');
        $countStmt->execute([$tournamentId]);
        if ((int)$countStmt->fetchColumn() >= self::MAX_PARTICIPANTS_PER_TOURNAMENT) {
            http_response_code(400);
            echo json_encode(['error' => 'This tournament has reached its participant limit. Contact the organizer.']);
            return;
        }

        $this->db->prepare('INSERT INTO participants (tournament_id, name, registration_status) VALUES (?, ?, "pending")')
            ->execute([$tournamentId, $name]);
        $id = (int)$this->db->lastInsertId();

        if ($email !== '') {
            $this->startEmailOptIn($id, $tournamentId, $email, null);
        }

        writeAuditLog($this->db, $tournamentId, null, 'participant_self_registered', 'participant', (string)$id, ['name' => $name]);

        echo json_encode(['success' => true, 'name' => $name]);
    }

    // Organizer-initiated: moves a pending self-registration onto the live roster.
    // Rejecting one is just delete() — a pending row is a real row.
    public function approve(int $id, array $actor): void {
        $stmt = $this->db->prepare('SELECT tournament_id, registration_status FROM participants WHERE id = ?');
        $stmt->execute([$id]);
        $participant = $stmt->fetch();
        if (!$participant) {
            http_response_code(404);
            echo json_encode(['error' => 'Participant not found']);
            return;
        }

        if ($participant['registration_status'] === 'approved') {
            echo json_encode($this->getSafeParticipant($id));
            return;
        }

        $this->db->prepare('UPDATE participants SET registration_status = "approved" WHERE id = ?')->execute([$id]);
        writeAuditLog($this->db, (int)$participant['tournament_id'], (int)$actor['id'], 'participant_approved', 'participant', (string)$id);

        echo json_encode($this->getSafeParticipant($id));
    }

    // Shared by setNotificationEmail() (organizer, has an actor) and selfRegister()
    // (public, no actor — audit log records null). Returns a warning string if the
    // address is suppressed (participant is marked suppressed instead of pending), or
    // null on a normal confirmation-email-queued path.
    private function startEmailOptIn(int $id, int $tournamentId, string $email, ?int $actorUserId): ?string {
        $suppressed = $this->db->prepare('SELECT 1 FROM notification_suppressions WHERE email = ?');
        $suppressed->execute([$email]);
        if ($suppressed->fetchColumn()) {
            $this->db->prepare('
                UPDATE participants
                SET email = ?, notification_lifecycle = "suppressed",
                    notification_confirm_token_hash = NULL, notification_confirm_token_expires_at = NULL
                WHERE id = ?
            ')->execute([$email, $id]);

            writeAuditLog($this->db, $tournamentId, $actorUserId, 'participant_notification_email_set', 'participant', (string)$id, ['email' => $email, 'suppressed' => true]);
            return 'This address has previously bounced or complained and will not receive email.';
        }

        $rawToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawToken);
        $expiresAt = date('Y-m-d H:i:s', time() + 72 * 3600);

        $this->db->beginTransaction();
        try {
            $this->db->prepare('
                UPDATE participants
                SET email = ?, notification_lifecycle = "pending",
                    notification_confirm_token_hash = ?, notification_confirm_token_expires_at = ?,
                    notification_manage_token_version = notification_manage_token_version + 1
                WHERE id = ?
            ')->execute([$email, $tokenHash, $expiresAt, $id]);

            $this->db->prepare('
                INSERT INTO notification_queue (tournament_id, participant_id, email, event_type, token_plaintext)
                VALUES (?, ?, ?, "confirmation", ?)
            ')->execute([$tournamentId, $id, $email, $rawToken]);

            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        writeAuditLog($this->db, $tournamentId, $actorUserId, 'participant_notification_email_set', 'participant', (string)$id, ['email' => $email]);
        return null;
    }

    // 'setup' status alone no longer means "roster is still editable": manual seeding
    // (TeamController::draw()) leaves a tournament in 'setup' with teams already formed
    // while it awaits bracket generation via generateBracketAction().
    private function teamsExist(int $tournamentId): bool {
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM teams WHERE tournament_id = ?');
        $stmt->execute([$tournamentId]);
        return (int)$stmt->fetchColumn() > 0;
    }

    private function getSafeParticipant(int $id): array {
        $stmt = $this->db->prepare('SELECT ' . self::SAFE_COLUMNS . ' FROM participants WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch();
    }
}

?>