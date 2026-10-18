<?php
// api/controllers/ParticipantController.php

class ParticipantController {
    // Excludes notification_confirm_token_hash / notification_confirm_token_expires_at —
    // once those columns exist, a bare SELECT * here would leak the confirm token hash to
    // every participant list/edit response.
    const SAFE_COLUMNS = 'id, tournament_id, name, registration_status, draw_group, email, notification_lifecycle,
        notify_match_completed, notify_round_completed, notify_tournament_finalized,
        notification_confirmed_at, notification_manage_token_version, created_at';

    /** A few hundred names is well past the 256-player paid cap; this only stops abuse. */
    const MAX_BULK_TEXT_BYTES = 65536;

    public function __construct(private readonly PDO $db) {}

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

        $error = $this->rosterClosedReason($tournamentId);
        if ($error !== null) {
            http_response_code(400);
            echo json_encode(['error' => $error]);
            return;
        }

        $cap = effectiveParticipantCap($this->db, $tournamentId);
        if ($this->participantCount($tournamentId) >= $cap) {
            http_response_code(400);
            echo json_encode(['error' => "This tournament has reached its {$cap}-participant plan limit. Upgrade to add more."]);
            return;
        }

        $stmt = $this->db->prepare(
            'INSERT INTO participants (tournament_id, name) VALUES (?, ?)'
        );
        $stmt->execute([$tournamentId, $name]);
        $id = (int)$this->db->lastInsertId();

        echo json_encode(['id' => $id, 'tournament_id' => $tournamentId, 'name' => $name, 'registration_status' => 'approved']);
    }

    /**
     * POST /participants/bulk — fast blind-draw setup: add a whole pasted list of players
     * in one request. NameList::parse() does the splitting and cleanup; names already on
     * the roster (or repeated in the paste) are skipped and reported rather than added
     * twice, since pasting the same sign-up sheet again is a likelier mistake than two
     * players sharing a name — a genuine second "Mike" can still be added one at a time.
     *
     * All or nothing against the plan cap: a list that would overflow it adds no one and
     * says how many would fit, rather than silently cutting off whoever came last.
     */
    public function bulkCreate(array $body): void {
        $tournamentId = (int)($body['tournament_id'] ?? 0);
        $text = $body['text'] ?? '';
        if (!$tournamentId || !is_string($text) || trim($text) === '') {
            http_response_code(400);
            echo json_encode(['error' => 'tournament_id and text required']);
            return;
        }
        if (strlen($text) > self::MAX_BULK_TEXT_BYTES) {
            http_response_code(400);
            echo json_encode(['error' => 'That list is too long. Paste fewer names at a time.']);
            return;
        }

        $this->db->beginTransaction();
        try {
            // Lock the tournament row so a concurrent add or self-registration can't slip
            // in between the cap check and the inserts below.
            $this->db->prepare('SELECT id FROM tournaments WHERE id = ? FOR UPDATE')->execute([$tournamentId]);

            $error = $this->rosterClosedReason($tournamentId);
            if ($error !== null) throw new Exception($error);

            $stmt = $this->db->prepare('SELECT name FROM participants WHERE tournament_id = ?');
            $stmt->execute([$tournamentId]);
            $existing = $stmt->fetchAll(PDO::FETCH_COLUMN);

            $parsed = NameList::parse($text, $existing);
            if (!$parsed['names']) {
                throw new Exception($parsed['duplicates']
                    ? 'Everyone on that list is already in this tournament.'
                    : 'No names found. Put one name on each line.');
            }

            $cap = effectiveParticipantCap($this->db, $tournamentId);
            $room = max(0, $cap - count($existing));
            if (count($parsed['names']) > $room) {
                $n = count($parsed['names']);
                throw new Exception($room === 0
                    ? "This tournament has reached its {$cap}-participant plan limit. Upgrade to add more."
                    : "That list has {$n} new players, but this tournament has room for {$room} more under its {$cap}-participant plan limit. Upgrade to add more, or trim the list.");
            }

            $insert = $this->db->prepare('INSERT INTO participants (tournament_id, name) VALUES (?, ?)');
            $added = [];
            foreach ($parsed['names'] as $name) {
                $insert->execute([$tournamentId, $name]);
                $added[] = [
                    'id' => (int)$this->db->lastInsertId(),
                    'tournament_id' => $tournamentId,
                    'name' => $name,
                    'registration_status' => 'approved',
                ];
            }

            $this->db->commit();
        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
            return;
        } catch (Throwable $e) {
            // Separate from the catch above: an Error is not a validation failure and must
            // not be echoed as a 400, but it still has to unwind the transaction. See AGENTS.md.
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }

        echo json_encode([
            'added' => $added,
            'skipped_duplicates' => $parsed['duplicates'],
            'skipped_too_long' => count($parsed['too_long']),
        ]);
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
        if (array_key_exists('draw_group', $body) && !array_key_exists('name', $body)) {
            $this->setDrawGroup($id, $body['draw_group']);
            return;
        }
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

    /**
     * PUT /participants/{id} with only `draw_group` — tags a player A or B for the balanced
     * draw (BlindDraw). Allowed whenever the roster is still drawable, including after a
     * draw, since the organizer may retag and redraw before the bracket starts.
     */
    private function setDrawGroup(int $id, mixed $group): void {
        if (!in_array($group, BlindDraw::GROUPS, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'draw_group must be A or B']);
            return;
        }
        $stmt = $this->db->prepare('SELECT t.status FROM participants p JOIN tournaments t ON t.id = p.tournament_id WHERE p.id = ?');
        $stmt->execute([$id]);
        $status = $stmt->fetchColumn();
        if ($status === false) {
            http_response_code(404);
            echo json_encode(['error' => 'Participant not found']);
            return;
        }
        if ($status !== 'setup') {
            http_response_code(400);
            echo json_encode(['error' => 'Players can only be regrouped before the tournament starts']);
            return;
        }
        $this->db->prepare('UPDATE participants SET draw_group = ? WHERE id = ?')->execute([$group, $id]);
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

        $stmt = $this->db->prepare('SELECT id, status, team_entry_mode FROM tournaments WHERE uuid = ?');
        $stmt->execute([$uuid]);
        $tournament = $stmt->fetch();
        if (!$tournament) {
            http_response_code(404);
            echo json_encode(['error' => 'Tournament not found']);
            return;
        }
        $tournamentId = (int)$tournament['id'];
        if ($tournament['status'] !== 'setup' || $this->teamsExist($tournamentId)
            || ($tournament['team_entry_mode'] ?? 'auto_draft') !== 'auto_draft') {
            // Direct-entry tournaments have no unpaired-participant pool for a
            // self-registered walk-up to later join — nothing for the organizer to do
            // with a pending row here.
            http_response_code(400);
            echo json_encode(['error' => 'Registration is closed for this tournament']);
            return;
        }

        // Same freemium cap organizer-added participants are held to (effectiveParticipantCap()
        // in api/middleware/auth.php) — this used to be a separate, higher, self-registration-only
        // abuse cap, but the freemium ceiling now supersedes it for both paths.
        $countStmt = $this->db->prepare('SELECT COUNT(*) FROM participants WHERE tournament_id = ?');
        $countStmt->execute([$tournamentId]);
        if ((int)$countStmt->fetchColumn() >= effectiveParticipantCap($this->db, $tournamentId)) {
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
    /**
     * Why players can't be added to this tournament right now, or null if they can.
     *
     * The roster locks once teams exist, not only once the tournament goes 'active':
     * manual seeding leaves a tournament in 'setup' with teams already formed while it
     * awaits bracket generation. Direct-entry tournaments create both members of a team
     * together via TeamController::createDirect(), so there's no unpaired-participant pool
     * for a lone player to join.
     */
    private function rosterClosedReason(int $tournamentId): ?string {
        $stmt = $this->db->prepare('SELECT status, team_entry_mode FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        $t = $stmt->fetch();
        if (!$t || $t['status'] !== 'setup' || $this->teamsExist($tournamentId)) {
            return 'Tournament is not in setup phase';
        }
        if (($t['team_entry_mode'] ?? 'auto_draft') !== 'auto_draft') {
            return 'This tournament uses direct team entry — add teams directly instead';
        }
        return null;
    }

    private function participantCount(int $tournamentId): int {
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM participants WHERE tournament_id = ?');
        $stmt->execute([$tournamentId]);
        return (int)$stmt->fetchColumn();
    }

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