<?php
// api/controllers/TeamController.php

class TeamController {
    public function __construct(private readonly PDO $db) {}

    // Every team response carries its two players' names; this is the one query for it. A
    // solo team (item 19) has no second player, so its participant2_name comes back null.
    private const TEAM_SELECT = '
        SELECT t.*, p1.name as participant1_name, p2.name as participant2_name
        FROM teams t
        JOIN participants p1 ON t.participant1_id = p1.id
        LEFT JOIN participants p2 ON t.participant2_id = p2.id
    ';

    /** A tournament's teams in seed order. */
    private function teamsWithNames(int $tournamentId): array {
        $stmt = $this->db->prepare(self::TEAM_SELECT . ' WHERE t.tournament_id = ? ORDER BY t.seed');
        $stmt->execute([$tournamentId]);
        return $stmt->fetchAll();
    }

    /** One team, or false if it does not exist. */
    private function teamWithNames(int $id): array|false {
        $stmt = $this->db->prepare(self::TEAM_SELECT . ' WHERE t.id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch();
    }

    public function listByTournament(int $tournamentId): void {
        echo json_encode($this->teamsWithNames($tournamentId));
    }

    /**
     * POST /teams — draw teams from all participants, then seed them, then generate the
     * bracket structure. BlindDraw::pair() does the pairing: a plain random draw, or the
     * balanced A/B draw when tournaments.draw_mode says so.
     *
     * An odd field gives the odd player out a ghost partner, a team of one (item 19), but
     * only when the request says `allow_solo`: the organizer confirms it at the draw, and an
     * older client that never asks still gets the old "even number" refusal.
     */
    public function draw(array $body): void {
        $tournamentId = (int)($body['tournament_id'] ?? 0);
        if (!$tournamentId) {
            http_response_code(400);
            echo json_encode(['error' => 'tournament_id required']);
            return;
        }

        $this->db->beginTransaction();
        try {
            // Validate tournament
            $stmt = $this->db->prepare('SELECT * FROM tournaments WHERE id = ?');
            $stmt->execute([$tournamentId]);
            $tournament = $stmt->fetch();
            if (!$tournament || $tournament['status'] !== 'setup') {
                throw new Exception('Tournament is not in setup phase');
            }
            if (($tournament['team_entry_mode'] ?? 'auto_draft') !== 'auto_draft') {
                throw new Exception('This tournament uses direct team entry — teams are created individually, not drawn');
            }

            // Get participants — only 'approved' rows (self-registered walk-ups start
            // 'pending' and must never end up on a team without the organizer having
            // reviewed them first).
            $stmt = $this->db->prepare('SELECT * FROM participants WHERE tournament_id = ? AND registration_status = "approved"');
            $stmt->execute([$tournamentId]);
            $participants = $stmt->fetchAll();

            $pendingCount = $this->db->prepare('SELECT COUNT(*) FROM participants WHERE tournament_id = ? AND registration_status = "pending"');
            $pendingCount->execute([$tournamentId]);
            if ((int)$pendingCount->fetchColumn() > 0) {
                throw new Exception('Approve or reject all pending self-registrations before drawing teams');
            }

            $count = count($participants);
            if ($count % 2 !== 0 && empty($body['allow_solo'])) {
                throw new Exception('Need an even number of participants to form teams');
            }
            if ($count < 3) {
                // Fewer than three can't form two teams, even with a solo one: generateBracket()
                // creates zero matches for a single team, so the tournament could never be
                // played or reach 'complete'.
                throw new Exception('Need at least 3 participants to form at least two teams');
            }

            // Clear any existing teams/matches for this tournament
            $this->db->prepare('DELETE FROM matches WHERE tournament_id = ?')->execute([$tournamentId]);
            $this->db->prepare('DELETE FROM pool_matches WHERE tournament_id = ?')->execute([$tournamentId]);
            $this->db->prepare('DELETE FROM teams WHERE tournament_id = ?')->execute([$tournamentId]);

            // Pair participants into teams
            $teams = [];
            $pairs = BlindDraw::pair($participants, $tournament['draw_mode'] ?? 'random');
            foreach ($pairs as $i => $pair) {
                $teamName = SoloTeam::defaultName($pair[0]['name'], $pair[1]['name'] ?? null);
                $seed = $i + 1;
                $stmt = $this->db->prepare(
                    'INSERT INTO teams (tournament_id, name, participant1_id, participant2_id, seed) VALUES (?, ?, ?, ?, ?)'
                );
                $stmt->execute([$tournamentId, $teamName, $pair[0]['id'], $pair[1]['id'] ?? null, $seed]);
                $teams[] = [
                    'id'   => (int)$this->db->lastInsertId(),
                    'name' => $teamName,
                    'seed' => $seed,
                ];
            }

            // Manual seeding stops here: teams are formed (seeded in draw order as a
            // starting point) but the bracket isn't generated and the tournament stays in
            // 'setup' until the organizer confirms a seed order via generateBracketAction().
            // Automatic seeding (the default) generates the bracket immediately, unchanged.
            if (($tournament['seeding_mode'] ?? 'automatic') === 'automatic') {
                $this->requireFormatAllowed($tournamentId, $tournament['format'] ?? 'single');
                $this->generateBracket($tournamentId, $teams, $tournament['format'] ?? 'single');
                $this->db->prepare('UPDATE tournaments SET status = ? WHERE id = ?')
                    ->execute(['active', $tournamentId]);
                (new BoardController($this->db))->reconcile($tournamentId);
            } elseif ($tournament['seeding_mode'] === 'pool_play') {
                // Like automatic seeding, one step: the draw forms teams and starts the
                // pool, and the tournament goes live. The bracket comes after the pool.
                (new PoolController($this->db))->start($tournamentId);
            }

            $this->db->commit();

            // Return teams
            echo json_encode($this->teamsWithNames($tournamentId));

        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            // Separate from the catch above, not merged into it: an Error is not a validation
            // failure and must not be echoed as a 400 message, but it still has to unwind the
            // transaction before reaching the router's 500 handler. See AGENTS.md.
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * POST /teams/direct — create one team at a time by typing both member names
     * directly (direct team-entry mode). Creates two new participant rows (immediately
     * approved — there's no separate roster-building step to review against here, unlike
     * auto-draft's pending self-registrations) plus the team row, appended at the next
     * seed position so teams keep arriving in entry order until reordered or generated.
     */
    public function createDirect(array $body): void {
        $tournamentId = (int)($body['tournament_id'] ?? 0);
        $teamName = trim($body['team_name'] ?? '');
        $p1Name = trim($body['participant1_name'] ?? '');
        $p2Name = trim($body['participant2_name'] ?? '');

        if (!$tournamentId || !$teamName || !$p1Name || !$p2Name) {
            http_response_code(400);
            echo json_encode(['error' => 'tournament_id, team_name, participant1_name, and participant2_name are required']);
            return;
        }

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('SELECT * FROM tournaments WHERE id = ?');
            $stmt->execute([$tournamentId]);
            $tournament = $stmt->fetch();
            if (!$tournament || $tournament['status'] !== 'setup') {
                throw new Exception('Tournament is not in setup phase');
            }
            if (($tournament['team_entry_mode'] ?? 'auto_draft') !== 'direct') {
                throw new Exception('This tournament uses blind draw team entry — add participants and draw teams instead');
            }

            $cap = effectiveParticipantCap($this->db, $tournamentId);
            $countStmt = $this->db->prepare('SELECT COUNT(*) FROM participants WHERE tournament_id = ?');
            $countStmt->execute([$tournamentId]);
            if ((int)$countStmt->fetchColumn() + 2 > $cap) {
                throw new Exception("This tournament has reached its {$cap}-participant plan limit. Upgrade to add more.");
            }

            $insertParticipant = $this->db->prepare('INSERT INTO participants (tournament_id, name) VALUES (?, ?)');
            $insertParticipant->execute([$tournamentId, $p1Name]);
            $p1Id = (int)$this->db->lastInsertId();
            $insertParticipant->execute([$tournamentId, $p2Name]);
            $p2Id = (int)$this->db->lastInsertId();

            $seedCount = $this->db->prepare('SELECT COUNT(*) FROM teams WHERE tournament_id = ?');
            $seedCount->execute([$tournamentId]);
            $seed = (int)$seedCount->fetchColumn() + 1;

            $stmt = $this->db->prepare(
                'INSERT INTO teams (tournament_id, name, participant1_id, participant2_id, seed) VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$tournamentId, $teamName, $p1Id, $p2Id, $seed]);
            $teamId = (int)$this->db->lastInsertId();

            $this->db->commit();

            echo json_encode($this->teamWithNames($teamId));

        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            // Separate from the catch above, not merged into it: an Error is not a validation
            // failure and must not be echoed as a 400 message, but it still has to unwind the
            // transaction before reaching the router's 500 handler. See AGENTS.md.
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * PUT /teams/reorder — persist a drag-and-drop seed reorder (manual seeding only).
     * Takes the full ordered list of team ids top-to-bottom and assigns seed = position,
     * rather than trusting client-supplied seed numbers directly.
     */
    public function reorder(array $body): void {
        $tournamentId = (int)($body['tournament_id'] ?? 0);
        $teamIds = $body['team_ids'] ?? null;
        if (!$tournamentId || !is_array($teamIds) || !$teamIds) {
            http_response_code(400);
            echo json_encode(['error' => 'tournament_id and team_ids required']);
            return;
        }

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('SELECT status, seeding_mode FROM tournaments WHERE id = ?');
            $stmt->execute([$tournamentId]);
            $tournament = $stmt->fetch();
            $this->requireSeedsOpen($tournamentId, $tournament, 'Teams can only be reordered before the bracket is generated');

            $stmt = $this->db->prepare('SELECT id FROM teams WHERE tournament_id = ?');
            $stmt->execute([$tournamentId]);
            $existingIds = array_map('intval', array_column($stmt->fetchAll(), 'id'));
            $submittedIds = array_map('intval', $teamIds);

            $sortedExisting = $existingIds;
            sort($sortedExisting);
            $sortedSubmitted = $submittedIds;
            sort($sortedSubmitted);
            if ($sortedExisting !== $sortedSubmitted) {
                throw new Exception('team_ids must match exactly the tournament\'s current teams');
            }

            foreach ($submittedIds as $i => $teamId) {
                $this->db->prepare('UPDATE teams SET seed = ? WHERE id = ? AND tournament_id = ?')
                    ->execute([$i + 1, $teamId, $tournamentId]);
            }

            $this->db->commit();

            echo json_encode($this->teamsWithNames($tournamentId));

        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            // Separate from the catch above, not merged into it: an Error is not a validation
            // failure and must not be echoed as a 400 message, but it still has to unwind the
            // transaction before reaching the router's 500 handler. See AGENTS.md.
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * POST /teams/generate-bracket — finalize manual seeding: build the bracket from
     * teams' current seed order (set via reorder(), or left at the draw()-assigned
     * default) and activate the tournament. Automatic-seeding tournaments never reach
     * here — draw() already generated their bracket and activated them in one step.
     */
    public function generateBracketAction(array $body): void {
        $tournamentId = (int)($body['tournament_id'] ?? 0);
        if (!$tournamentId) {
            http_response_code(400);
            echo json_encode(['error' => 'tournament_id required']);
            return;
        }

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('SELECT status, format, seeding_mode FROM tournaments WHERE id = ?');
            $stmt->execute([$tournamentId]);
            $tournament = $stmt->fetch();
            $this->requireSeedsOpen($tournamentId, $tournament, 'Tournament is not awaiting bracket generation');

            $stmt = $this->db->prepare('SELECT id, seed FROM teams WHERE tournament_id = ? ORDER BY seed');
            $stmt->execute([$tournamentId]);
            $teams = $stmt->fetchAll();
            if (count($teams) < 2) {
                // draw() already enforces this for auto-draft (>= 4 participants -> >= 2
                // teams) before it ever reaches this action, but direct entry has no such
                // upfront check — an organizer could try to generate with a single team and
                // no opponent, which is exactly the "tournament active with zero matches"
                // bug a prior review found and fixed for the auto-draft path.
                throw new Exception('Need at least 2 teams to generate a bracket');
            }

            $this->requireFormatAllowed($tournamentId, $tournament['format'] ?? 'single');
            $this->generateBracket($tournamentId, $teams, $tournament['format'] ?? 'single');

            $this->db->prepare('UPDATE tournaments SET status = ? WHERE id = ?')
                ->execute(['active', $tournamentId]);
            (new BoardController($this->db))->reconcile($tournamentId);

            $this->db->commit();

            echo json_encode($this->teamsWithNames($tournamentId));

        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            // Separate from the catch above, not merged into it: an Error is not a validation
            // failure and must not be echoed as a 400 message, but it still has to unwind the
            // transaction before reaching the router's 500 handler. See AGENTS.md.
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    public function update(int $id, array $body): void {
        $name = trim($body['name'] ?? '');
        if (!$name) {
            http_response_code(400);
            echo json_encode(['error' => 'name required']);
            return;
        }
        $this->db->prepare('UPDATE teams SET name = ? WHERE id = ?')->execute([$name, $id]);
        echo json_encode($this->teamWithNames($id));
    }

    /**
     * PUT /teams/{id}/partner — swap a latecomer in for a solo team's ghost (item 19).
     *
     * Creates the new player (approved: the organizer is typing them in) and fills the empty
     * slot, so the team becomes an ordinary pair; a team still carrying its default
     * "Sam (solo)" name becomes "Sam & Lee". Allowed until the team's first game is scored, in
     * the pool or the bracket, since after that the team's record was earned one player short.
     * Counts toward the plan's player cap like any other player.
     */
    public function addPartner(int $id, array $body): void {
        $name = trim(preg_replace('/\s+/', ' ', (string)($body['name'] ?? '')));
        if ($name === '' || mb_strlen($name) > 255) {
            http_response_code(400);
            echo json_encode(['error' => "Enter the new player's name"]);
            return;
        }

        $this->db->beginTransaction();
        try {
            $team = $this->teamWithNames($id);
            if (!$team) {
                throw new Exception('Team not found');
            }
            if ($team['participant2_id'] !== null) {
                throw new Exception('This team already has two players');
            }
            $tournamentId = (int)$team['tournament_id'];

            $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
            $stmt->execute([$tournamentId]);
            if ($stmt->fetchColumn() === 'complete') {
                throw new Exception('The tournament is over');
            }

            $played = $this->db->prepare('
                SELECT (SELECT COUNT(*) FROM matches
                         WHERE (team1_id = ? OR team2_id = ?) AND status = "complete")
                     + (SELECT COUNT(*) FROM pool_matches
                         WHERE (team1_id = ? OR team2_id = ?) AND status = "complete")
            ');
            $played->execute([$id, $id, $id, $id]);
            if ((int)$played->fetchColumn() > 0) {
                throw new Exception('This team has already played, so it finishes solo');
            }

            $cap = effectiveParticipantCap($this->db, $tournamentId);
            $countStmt = $this->db->prepare('SELECT COUNT(*) FROM participants WHERE tournament_id = ?');
            $countStmt->execute([$tournamentId]);
            if ((int)$countStmt->fetchColumn() + 1 > $cap) {
                throw new Exception("This tournament has reached its {$cap}-participant plan limit. Upgrade to add more.");
            }

            $this->db->prepare('INSERT INTO participants (tournament_id, name) VALUES (?, ?)')
                ->execute([$tournamentId, $name]);
            $partnerId = (int)$this->db->lastInsertId();

            $rename = $team['name'] === SoloTeam::defaultName($team['participant1_name'], null);
            $this->db->prepare('UPDATE teams SET participant2_id = ?, name = ? WHERE id = ?')->execute([
                $partnerId,
                $rename ? SoloTeam::defaultName($team['participant1_name'], $name) : $team['name'],
                $id,
            ]);

            $this->db->commit();
            echo json_encode($this->teamWithNames($id));

        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            // An Error is not a validation failure: unwind, then let the router 500. AGENTS.md.
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * DELETE /teams/{id} — undo a direct-entry team: removes the team and the two
     * participant rows created solely for it (direct entry has no standalone "unpaired
     * participant" concept, unlike auto-draft), then re-numbers the remaining teams'
     * seeds so they stay contiguous.
     */
    public function delete(int $id): void {
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('SELECT * FROM teams WHERE id = ?');
            $stmt->execute([$id]);
            $team = $stmt->fetch();
            if (!$team) {
                throw new Exception('Team not found');
            }
            $tournamentId = (int)$team['tournament_id'];

            $stmt = $this->db->prepare('SELECT status, team_entry_mode FROM tournaments WHERE id = ?');
            $stmt->execute([$tournamentId]);
            $tournament = $stmt->fetch();
            if (!$tournament || $tournament['status'] !== 'setup') {
                throw new Exception('Cannot delete a team after the bracket has been generated');
            }
            if (($tournament['team_entry_mode'] ?? 'auto_draft') !== 'direct') {
                throw new Exception('Teams can only be deleted individually in direct-entry tournaments');
            }

            $this->db->prepare('DELETE FROM teams WHERE id = ?')->execute([$id]);
            $this->db->prepare('DELETE FROM participants WHERE id IN (?, ?)')
                ->execute([$team['participant1_id'], $team['participant2_id']]);

            // Re-number remaining teams' seeds so they stay contiguous (1..N in their
            // existing seed order). generateBracket() treats a gap in seed numbers as an
            // implicit bye at that specific bracket position, which would silently
            // reshuffle who plays whom rather than just shrinking the field by one team.
            $remaining = $this->db->prepare('SELECT id FROM teams WHERE tournament_id = ? ORDER BY seed');
            $remaining->execute([$tournamentId]);
            foreach ($remaining->fetchAll() as $i => $row) {
                $this->db->prepare('UPDATE teams SET seed = ? WHERE id = ?')->execute([$i + 1, $row['id']]);
            }

            $this->db->commit();
            echo json_encode(['success' => true]);

        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            // Separate from the catch above, not merged into it: an Error is not a validation
            // failure and must not be echoed as a 400 message, but it still has to unwind the
            // transaction before reaching the router's 500 handler. See AGENTS.md.
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * The second half of the paid-tier format gate (TournamentController::create()/update()
     * is the first): re-checked here because the format could have been chosen while the
     * plan was active and the bracket generated after it lapsed.
     *
     * Deliberately the *last* moment it is ever checked. Once the bracket exists nothing
     * re-validates it, so a lapsed plan can never break a tournament that is already being
     * played — the worst available failure mode is a live bracket dying at a venue mid-event.
     *
     * Throwing leaves the caller's transaction to roll back, so a tournament that fails here
     * still has no teams and no bracket, and stays in 'setup' where its format can be
     * switched back to single elimination.
     */
    /**
     * Seeds can be set, and the bracket generated from them, in two windows: a manual or
     * direct-entry tournament still in setup, and a pool-play tournament whose pool is
     * finished (it is 'active' by then, so spectators could follow the pool). A pool-play
     * tournament in setup has not played its pool yet, so it is refused, as is one whose
     * pool still has games left: its seeds are still moving.
     */
    private function requireSeedsOpen(int $tournamentId, $tournament, string $closedMessage): void {
        if (!$tournament) throw new Exception($closedMessage);
        if (($tournament['seeding_mode'] ?? '') === 'pool_play') {
            if ($tournament['status'] === 'setup') {
                throw new Exception('Start pool play first. The pool standings set the seeds.');
            }
            if (!PoolController::inPoolStage($this->db, $tournamentId)) {
                throw new Exception($closedMessage);
            }
            if (!PoolController::poolComplete($this->db, $tournamentId)) {
                throw new Exception('Finish every pool game first. The standings set the seeds.');
            }
            return;
        }
        if ($tournament['status'] !== 'setup') {
            throw new Exception($closedMessage);
        }
    }

    private function requireFormatAllowed(int $tournamentId, string $format): void {
        if (formatRequiresPaidPlan($format) && !tournamentHasPaidFeatures($this->db, $tournamentId)) {
            throw new Exception(
                'Double elimination is a Pro feature. Upgrade, or switch this tournament to single elimination.'
            );
        }
    }

    /**
     * Persist a bracket for $teams.
     *
     * The bracket's *shape* — pairings, byes, where winners advance, where losers drop — is
     * computed by BracketBuilder, which is pure and unit-tested in
     * tests/BracketBuilderTest.php and tests/BracketDoubleEliminationTest.php. This method
     * only writes that shape out. Keep the split: bracket logic that lives here cannot be
     * tested without a database, which is what made this the riskiest code in the repo to
     * change (see FEATURE_TRACKER.md item 16).
     *
     * @param array  $teams  Rows with at least 'id' and 'seed'.
     * @param string $format 'single' or 'double'. Anything else is treated as 'single', so a
     *                       row predating the format column can never be read as double.
     */
    private function generateBracket(int $tournamentId, array $teams, string $format = 'single'): void {
        $seedToTeamId = [];
        foreach ($teams as $team) {
            $seedToTeamId[(int)$team['seed']] = (int)$team['id'];
        }

        // Throws on a field smaller than two teams or on gapped seeds. Both surface through
        // the caller's catch block as a 400 instead of silently producing a wrong draw.
        $plan = $format === 'double'
            ? BracketBuilder::doubleElimination($seedToTeamId)
            : BracketBuilder::singleElimination($seedToTeamId);

        $insert = $this->db->prepare('
            INSERT INTO matches
                (tournament_id, round, match_number, bracket_side, is_reset, team1_id, team2_id, winner_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $matchIds = [];
        foreach ($plan as $index => $match) {
            $insert->execute([
                $tournamentId,
                $match['round'],
                $match['match_number'],
                $match['bracket_side'],
                $match['is_reset'] ? 1 : 0,
                $match['team1_id'],
                $match['team2_id'],
                $match['winner_id'],
                $match['status'],
            ]);
            $matchIds[$index] = (int)$this->db->lastInsertId();
        }

        // Second pass: the builder's forward pointers are array indexes, which can only be
        // resolved to real match ids once every row above exists. Both edges are written in
        // one statement so a match is never left half-linked.
        $link = $this->db->prepare('
            UPDATE matches
            SET next_match_id = ?, next_match_slot = ?, loser_match_id = ?, loser_match_slot = ?
            WHERE id = ?
        ');
        foreach ($plan as $index => $match) {
            if ($match['next_match'] === null && $match['loser_match'] === null) {
                continue;
            }
            $link->execute([
                $match['next_match'] === null ? null : $matchIds[$match['next_match']],
                $match['next_match_slot'],
                $match['loser_match'] === null ? null : $matchIds[$match['loser_match']],
                $match['loser_match_slot'],
                $matchIds[$index],
            ]);
        }
    }
}

?>