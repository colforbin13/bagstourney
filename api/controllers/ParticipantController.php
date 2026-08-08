<?php
// api/controllers/ParticipantController.php

class ParticipantController {
    // Excludes notification_confirm_token_hash / notification_confirm_token_expires_at —
    // once those columns exist, a bare SELECT * here would leak the confirm token hash to
    // every participant list/edit response.
    const SAFE_COLUMNS = 'id, tournament_id, name, email, notification_lifecycle,
        notify_match_completed, notify_round_completed, notify_tournament_finalized,
        notification_confirmed_at, notification_manage_token_version, created_at';

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

        // Ensure tournament is still in setup phase
        $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        $t = $stmt->fetch();
        if (!$t || $t['status'] !== 'setup') {
            http_response_code(400);
            echo json_encode(['error' => 'Tournament is not in setup phase']);
            return;
        }

        $stmt = $this->db->prepare(
            'INSERT INTO participants (tournament_id, name) VALUES (?, ?)'
        );
        $stmt->execute([$tournamentId, $name]);
        $id = (int)$this->db->lastInsertId();

        echo json_encode(['id' => $id, 'tournament_id' => $tournamentId, 'name' => $name]);
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
        if ($t['status'] !== 'setup') {
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

        $suppressed = $this->db->prepare('SELECT 1 FROM notification_suppressions WHERE email = ?');
        $suppressed->execute([$email]);
        if ($suppressed->fetchColumn()) {
            $this->db->prepare('
                UPDATE participants
                SET email = ?, notification_lifecycle = "suppressed",
                    notification_confirm_token_hash = NULL, notification_confirm_token_expires_at = NULL
                WHERE id = ?
            ')->execute([$email, $id]);

            writeAuditLog($this->db, $tournamentId, (int)$actor['id'], 'participant_notification_email_set', 'participant', (string)$id, ['email' => $email, 'suppressed' => true]);

            $result = $this->getSafeParticipant($id);
            $result['warning'] = 'This address has previously bounced or complained and will not receive email.';
            echo json_encode($result);
            return;
        }

        $rawToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawToken);
        $expiresAt = date('Y-m-d H:i:s', time() + 72 * 3600);
        $emailChanged = $email !== $participant['email'];

        $this->db->beginTransaction();
        try {
            $this->db->prepare('
                UPDATE participants
                SET email = ?, notification_lifecycle = "pending",
                    notification_confirm_token_hash = ?, notification_confirm_token_expires_at = ?,
                    notification_manage_token_version = notification_manage_token_version + ?
                WHERE id = ?
            ')->execute([$email, $tokenHash, $expiresAt, $emailChanged ? 1 : 0, $id]);

            $this->db->prepare('
                INSERT INTO notification_queue (tournament_id, participant_id, email, event_type, token_plaintext)
                VALUES (?, ?, ?, "confirmation", ?)
            ')->execute([$tournamentId, $id, $email, $rawToken]);

            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        writeAuditLog($this->db, $tournamentId, (int)$actor['id'], 'participant_notification_email_set', 'participant', (string)$id, ['email' => $email]);

        echo json_encode($this->getSafeParticipant($id));
    }

    private function getSafeParticipant(int $id): array {
        $stmt = $this->db->prepare('SELECT ' . self::SAFE_COLUMNS . ' FROM participants WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch();
    }
}

?>