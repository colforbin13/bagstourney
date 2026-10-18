<?php
// api/controllers/TournamentController.php

class TournamentController {
    public function __construct(private readonly PDO $db) {}

    // Per-row summary stats for the tournament list, so a row can say "Round 3 of 4 ·
     // 11 of 15 matches" or name a champion without the client fetching each bracket.
    // Correlated subqueries rather than GROUP BY joins: the counts come from three
    // different filters over `matches`, and the list is small enough (tens of rows) that
    // the extra clarity is worth more than the join gymnastics.
    //
    // Byes are deliberately excluded from both sides of the match progress fraction —
    // they're auto-advanced bracket placeholders, never played, and never reach
    // 'complete' (see TeamController::generateBracket), so counting them would leave
    // every tournament stuck short of 100%.
    const LIST_STATS_SQL = "
        (SELECT COUNT(*) FROM teams tm WHERE tm.tournament_id = t.id) AS team_count,
        -- Pool play (item 18): pool games live in their own table, so the bracket stats
        -- below never see them. A live tournament with pool rounds and no bracket yet is
        -- in its pool.
        (SELECT MAX(pm.round) FROM pool_matches pm WHERE pm.tournament_id = t.id) AS pool_rounds,
        (SELECT MIN(pm.round) FROM pool_matches pm WHERE pm.tournament_id = t.id AND pm.status = 'ready') AS pool_current_round,
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id AND m.status <> 'bye') AS match_count,
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id AND m.status = 'complete') AS matches_played,
        (SELECT MAX(m.round) FROM matches m WHERE m.tournament_id = t.id AND m.bracket_side = 'winners') AS total_rounds,
        (SELECT MIN(m.round) FROM matches m
            WHERE m.tournament_id = t.id AND m.bracket_side = 'winners'
              AND m.status IN ('pending', 'ready')) AS current_round,
        -- Champion detection has to understand both formats. In single elimination the one
        -- match with no next_match_id is the final. In double elimination that match is the
        -- *reset*, which usually goes unplayed — so a finished tournament would report no
        -- champion at all. Take the reset's winner when it was played, otherwise the grand
        -- final's, and fall back to the single-elimination rule when there is no grand final.
        (SELECT w.name FROM matches m JOIN teams w ON w.id = m.winner_id
            WHERE m.tournament_id = t.id AND m.winner_id IS NOT NULL
              AND (
                    m.is_reset = 1
                 OR (m.bracket_side = 'grand_final' AND m.winner_id = m.team1_id)
                 OR (m.bracket_side <> 'grand_final' AND m.next_match_id IS NULL)
              )
            ORDER BY m.is_reset DESC, m.round DESC
            LIMIT 1) AS champion_name
    ";

    public function list(?array $actor = null): void {
        if ($actor) {
            $stmt = $this->db->query('SELECT t.*, ' . self::LIST_STATS_SQL . ' FROM tournaments t WHERE t.deleted_at IS NULL ORDER BY t.created_at DESC');
        } else {
            // Public listing: hide tournaments still in setup (no bracket generated yet).
            $stmt = $this->db->query("SELECT t.*, " . self::LIST_STATS_SQL . " FROM tournaments t WHERE t.visibility = 'public' AND t.status <> 'setup' AND t.deleted_at IS NULL ORDER BY t.created_at DESC");
        }

        $rows = [];
        foreach ($stmt->fetchAll() as $row) {
            $rows[] = $this->withListStats($row);
        }
        echo json_encode($rows);
    }

    // Moves the flat stats columns off the tournament row and into a nested `stats`
    // object, casting them to numbers — an unprepared query() returns every column as a
    // string, and the frontend does arithmetic on these. `current_round` and
    // `champion_name` stay nullable: a tournament with no bracket yet has neither, and a
    // finished one has no current round.
    private function withListStats(array $row): array {
        $stats = [
            'team_count'     => (int)$row['team_count'],
            'match_count'    => (int)$row['match_count'],
            'matches_played' => (int)$row['matches_played'],
            'total_rounds'   => (int)$row['total_rounds'],
            'current_round'  => $row['current_round'] === null ? null : (int)$row['current_round'],
            'champion_name'  => $row['champion_name'],
            'pool_rounds'    => (int)$row['pool_rounds'],
            'pool_current_round' => $row['pool_current_round'] === null ? null : (int)$row['pool_current_round'],
        ];
        foreach (array_keys($stats) as $key) {
            unset($row[$key]);
        }
        $row['stats'] = $stats;
        return $row;
    }

    public function get(int $id, ?array $actor = null): void {
        $stmt = $this->db->prepare('SELECT * FROM tournaments WHERE id = ?');
        $stmt->execute([$id]);
        $t = $stmt->fetch();
        // Soft-deleted is treated as gone here too, super admins included — the recovery
        // screen uses listDeleted()/restore() instead of this endpoint.
        if (!$t || $t['deleted_at'] !== null) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }

        $capabilities = tournamentCapabilities($this->db, $id, $actor);
        // A private tournament is only reachable by numeric id for staff/super_admin;
        // everyone else must use its uuid (getByUuid()) — knowing the uuid is itself the
        // access grant. 404 rather than 403 so the id doesn't reveal a private tournament exists.
        if ($t['visibility'] === 'private' && !$capabilities['role'] && !$capabilities['is_super_admin']) {
            http_response_code(404); echo json_encode(['error' => 'Not found']); return;
        }

        $t['capabilities'] = $capabilities;
        echo json_encode($t);
    }

    public function getByUuid(string $uuid, ?array $actor = null): void {
        $stmt = $this->db->prepare('SELECT * FROM tournaments WHERE uuid = ?');
        $stmt->execute([$uuid]);
        $t = $stmt->fetch();
        if (!$t || $t['deleted_at'] !== null) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }
        $t['capabilities'] = tournamentCapabilities($this->db, (int)$t['id'], $actor);
        echo json_encode($t);
    }

    // Super-admin only (enforced by the router). Powers the "recover a deleted
    // tournament" screen — matches/teams/participants are never soft-deleted
    // themselves (see migration 011), so restoring just the tournament row brings
    // everything back automatically.
    public function listDeleted(): void {
        $stmt = $this->db->query('SELECT * FROM tournaments WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
        echo json_encode($stmt->fetchAll());
    }

    public function restore(int $id, array $actor): void {
        $stmt = $this->db->prepare('SELECT name, deleted_at FROM tournaments WHERE id = ?');
        $stmt->execute([$id]);
        $tournament = $stmt->fetch();
        if (!$tournament || $tournament['deleted_at'] === null) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }

        // Recovered tournaments come back private, regardless of their visibility before
        // deletion — an owner shouldn't have a tournament silently reappear in the public
        // list without deciding to make it public again.
        $this->db->prepare("UPDATE tournaments SET deleted_at = NULL, visibility = 'private' WHERE id = ?")->execute([$id]);
        writeAuditLog($this->db, $id, (int)$actor['id'], 'tournament_restored', 'tournament', (string)$id, ['name' => $tournament['name']]);

        $stmt = $this->db->prepare('SELECT * FROM tournaments WHERE id = ?');
        $stmt->execute([$id]);
        $t = $stmt->fetch();
        $t['capabilities'] = tournamentCapabilities($this->db, $id, $actor);
        echo json_encode($t);
    }

    public function create(array $body, array $actor): void {
        $name = trim($body['name'] ?? '');
        if (!$name) { http_response_code(400); echo json_encode(['error' => 'Name required']); return; }
        $visibility = in_array($body['visibility'] ?? null, ['public', 'private'], true) ? $body['visibility'] : 'public';
        $seedingMode = in_array($body['seeding_mode'] ?? null, ['automatic', 'manual', 'pool_play'], true) ? $body['seeding_mode'] : 'automatic';
        $poolGames = $this->parsePoolGames($body['pool_games'] ?? PoolPlay::DEFAULT_GAMES);
        if ($poolGames === null) {
            http_response_code(400);
            echo json_encode(['error' => 'Pool games must be between ' . PoolPlay::MIN_GAMES . ' and ' . PoolPlay::MAX_GAMES]);
            return;
        }
        $teamEntryMode = in_array($body['team_entry_mode'] ?? null, ['auto_draft', 'direct'], true) ? $body['team_entry_mode'] : 'auto_draft';
        $format = in_array($body['format'] ?? null, ['single', 'double'], true) ? $body['format'] : 'single';

        // Paid-tier feature gate. The frontend hides the option, but that is UX only — this
        // is the authorization boundary. Only the account plan can be consulted here: the
        // tournament does not exist yet, so it cannot carry a per-tournament override. An
        // organizer with an override but a free plan can still create as single and switch
        // via update() once the row exists.
        if (formatRequiresPaidPlan($format) && !userHasPaidPlan($this->db, (int)$actor['id'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Double elimination is a paid-plan feature. Upgrade to use it.']);
            return;
        }
        if (seedingModeRequiresPaidPlan($seedingMode) && !userHasPaidPlan($this->db, (int)$actor['id'])) {
            http_response_code(403);
            echo json_encode(['error' => POOL_PLAY_PAID_MESSAGE]);
            return;
        }

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('INSERT INTO tournaments (name, uuid, visibility, seeding_mode, pool_games, team_entry_mode, format, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$name, $this->generateUuidV4(), $visibility, $seedingMode, $poolGames, $teamEntryMode, $format, $actor['id']]);
            $id = (int)$this->db->lastInsertId();
            $this->db->prepare('INSERT INTO tournament_members (tournament_id, user_id, role, granted_by_user_id) VALUES (?, ?, "owner", ?)')
                ->execute([$id, $actor['id'], $actor['id']]);
            writeAuditLog($this->db, $id, (int)$actor['id'], 'tournament_created', 'tournament', (string)$id);
            $this->db->commit();
            $this->get($id, $actor);
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function update(int $id, array $body, array $actor): void {
        $fields = [];
        $params = [];
        if (isset($body['name'])) { $fields[] = 'name = ?'; $params[] = trim($body['name']); }
        if (isset($body['status'])) {
            // 'setup' is entered only at creation; allowing it here would let a caller
            // reset an active/complete tournament back to setup, which POST /teams treats
            // as a signal to wipe and redraw all existing teams and matches.
            if (!in_array($body['status'], ['active', 'complete'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid tournament status']);
                return;
            }
            $fields[] = 'status = ?';
            $params[] = $body['status'];
        }
        if (isset($body['visibility'])) {
            if (!in_array($body['visibility'], ['public', 'private'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid tournament visibility']);
                return;
            }
            $fields[] = 'visibility = ?';
            $params[] = $body['visibility'];
        }
        if (isset($body['seeding_mode'])) {
            if (!in_array($body['seeding_mode'], ['automatic', 'manual', 'pool_play'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid seeding mode']);
                return;
            }
            if (seedingModeRequiresPaidPlan($body['seeding_mode']) && !tournamentHasPaidFeatures($this->db, $id)) {
                http_response_code(403);
                echo json_encode(['error' => POOL_PLAY_PAID_MESSAGE]);
                return;
            }
            // Only changeable before teams exist — once teams are drawn, flipping modes
            // would leave a half-formed manual seed order or silently skip the seeding
            // step the organizer already committed to.
            $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
            $stmt->execute([$id]);
            $t = $stmt->fetch();
            if (!$t || $t['status'] !== 'setup') {
                http_response_code(400);
                echo json_encode(['error' => 'Seeding mode can only be changed during setup']);
                return;
            }
            $teamCount = $this->db->prepare('SELECT COUNT(*) FROM teams WHERE tournament_id = ?');
            $teamCount->execute([$id]);
            if ((int)$teamCount->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Cannot change seeding mode after teams have been drawn']);
                return;
            }
            $fields[] = 'seeding_mode = ?';
            $params[] = $body['seeding_mode'];
        }
        if (isset($body['pool_games'])) {
            $poolGames = $this->parsePoolGames($body['pool_games']);
            if ($poolGames === null) {
                http_response_code(400);
                echo json_encode(['error' => 'Pool games must be between ' . PoolPlay::MIN_GAMES . ' and ' . PoolPlay::MAX_GAMES]);
                return;
            }
            // Fixed once the pool is scheduled, which is when the tournament leaves setup.
            $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
            $stmt->execute([$id]);
            $t = $stmt->fetch();
            if (!$t || $t['status'] !== 'setup') {
                http_response_code(400);
                echo json_encode(['error' => 'Pool games can only be changed before pool play starts']);
                return;
            }
            $fields[] = 'pool_games = ?';
            $params[] = $poolGames;
        }
        $boardsChanged = false;
        if (isset($body['boards'])) {
            // Board assignments (item 8). Changeable at any time, mid-event included: a board
            // breaks, or a second room opens up. The Pro check applies to turning boards on or
            // changing the count, never to turning them off, so a lapsed plan can always drop
            // back to no boards.
            $boards = is_numeric($body['boards']) ? (int)$body['boards'] : -1;
            if ($boards < 0 || $boards > BoardQueue::MAX_BOARDS) {
                http_response_code(400);
                echo json_encode(['error' => 'Boards must be between 0 and ' . BoardQueue::MAX_BOARDS]);
                return;
            }
            if ($boards > 0 && !tournamentHasPaidFeatures($this->db, $id)) {
                http_response_code(403);
                echo json_encode(['error' => BOARDS_PAID_MESSAGE]);
                return;
            }
            $fields[] = 'boards = ?';
            $params[] = $boards;
            $boardsChanged = true;
        }
        if (isset($body['board_label'])) {
            // Just the word for a playing spot (board, court, lane...). Free to change at
            // any time and on any plan: it gates nothing.
            if (!in_array($body['board_label'], BoardController::LABELS, true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid name for the playing spots']);
                return;
            }
            $fields[] = 'board_label = ?';
            $params[] = $body['board_label'];
        }
        if (isset($body['team_entry_mode'])) {
            if (!in_array($body['team_entry_mode'], ['auto_draft', 'direct'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid team entry mode']);
                return;
            }
            // Same reasoning as seeding_mode above: only changeable before teams exist.
            $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
            $stmt->execute([$id]);
            $t = $stmt->fetch();
            if (!$t || $t['status'] !== 'setup') {
                http_response_code(400);
                echo json_encode(['error' => 'Team entry mode can only be changed during setup']);
                return;
            }
            $teamCount = $this->db->prepare('SELECT COUNT(*) FROM teams WHERE tournament_id = ?');
            $teamCount->execute([$id]);
            if ((int)$teamCount->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Cannot change team entry mode after teams have been created']);
                return;
            }
            $fields[] = 'team_entry_mode = ?';
            $params[] = $body['team_entry_mode'];
        }
        if (isset($body['draw_mode'])) {
            if (!in_array($body['draw_mode'], BlindDraw::MODES, true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid draw mode']);
                return;
            }
            // Only matters at the moment teams are drawn, and a redraw is allowed while the
            // tournament is in setup, so it stays changeable for exactly that long.
            $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
            $stmt->execute([$id]);
            $t = $stmt->fetch();
            if (!$t || $t['status'] !== 'setup') {
                http_response_code(400);
                echo json_encode(['error' => 'The draw can only be changed during setup']);
                return;
            }
            $fields[] = 'draw_mode = ?';
            $params[] = $body['draw_mode'];
        }
        if (isset($body['format'])) {
            if (!in_array($body['format'], ['single', 'double'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid tournament format']);
                return;
            }
            // Locked once the bracket exists, which is exactly when status leaves 'setup'.
            //
            // Note this is a *weaker* lock than seeding_mode/team_entry_mode above, which
            // also refuse once teams exist. Those two govern how teams are formed, so they
            // are already spent by then; format governs the bracket, which does not exist
            // yet. Locking format on team count too would strand manual-seeding organizers:
            // teams are drawn while the tournament stays in 'setup', so a double-elimination
            // tournament whose plan lapsed in that window could neither generate its bracket
            // nor drop back to single elimination.
            // A pool-play tournament is 'active' during its pool but has no bracket yet, so
            // its format stays open until the bracket is generated from the standings.
            $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
            $stmt->execute([$id]);
            $t = $stmt->fetch();
            if (!$t || ($t['status'] !== 'setup' && !PoolController::inPoolStage($this->db, $id))) {
                http_response_code(400);
                echo json_encode(['error' => 'Tournament format can only be changed before the bracket is generated']);
                return;
            }
            // Unlike create(), both levers are available here — the tournament row exists, so
            // a super-admin-granted paid_override counts as well as the owner's account plan.
            if (formatRequiresPaidPlan($body['format']) && !tournamentHasPaidFeatures($this->db, $id)) {
                http_response_code(403);
                echo json_encode(['error' => 'Double elimination is a paid-plan feature. Upgrade to use it.']);
                return;
            }
            $fields[] = 'format = ?';
            $params[] = $body['format'];
        }
        if (isset($body['paid_override'])) {
            // FEATURE_TRACKER item 13 plumbing: a one-time per-tournament unlock, set
            // manually by a super admin until real billing exists. Super-admin only —
            // requireTournamentRole() lets an owner/manager reach update() too, and
            // letting either self-grant this would let any organizer unlock their own cap.
            if ($actor['role'] !== 'super_admin') {
                http_response_code(403);
                echo json_encode(['error' => 'Only a super admin can change this tournament\'s plan override']);
                return;
            }
            $fields[] = 'paid_override = ?';
            $params[] = !empty($body['paid_override']) ? 1 : 0;
        }
        if (!$fields) { http_response_code(400); echo json_encode(['error' => 'Nothing to update']); return; }
        $params[] = $id;
        $this->db->beginTransaction();
        try {
            $this->db->prepare('UPDATE tournaments SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
            // More boards fill from the queue at once; fewer send the games on the removed
            // boards back to the front of it.
            // A manual status change (ending a tournament early) frees its boards too.
            if ($boardsChanged || isset($body['status'])) (new BoardController($this->db))->reconcile($id);
            $this->db->commit();
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
        writeAuditLog($this->db, $id, (int)$actor['id'], 'tournament_updated', 'tournament', (string)$id, $body);
        $this->get($id, $actor);
    }

    // Version-4 (random) UUID, same random_bytes()-based approach as the password-reset
    // token in UserController::resetPassword() — no ext-uuid dependency needed.
    private function parsePoolGames($value): ?int {
        if (!is_numeric($value)) return null;
        $n = (int)$value;
        return $n >= PoolPlay::MIN_GAMES && $n <= PoolPlay::MAX_GAMES ? $n : null;
    }

    private function generateUuidV4(): string {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    // Soft-delete: sets deleted_at rather than removing the row, and leaves
    // matches/teams/participants untouched (see migration 011) so a super admin can
    // recover the tournament — with its full bracket data intact — via restore().
    public function delete(int $id, array $actor): void {
        $stmt = $this->db->prepare('SELECT name FROM tournaments WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$id]);
        $tournament = $stmt->fetch();
        if (!$tournament) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }

        writeAuditLog($this->db, $id, (int)$actor['id'], 'tournament_deleted', 'tournament', (string)$id, ['name' => $tournament['name']]);

        $this->db->prepare('UPDATE tournaments SET deleted_at = NOW() WHERE id = ?')->execute([$id]);
        echo json_encode(['success' => true]);
    }
}

?>
