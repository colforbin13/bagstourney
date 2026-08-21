<?php
// api/controllers/TeamController.php

class TeamController {
    private $db;

    public function __construct(PDO $db) {
		$this->db = $db;
	}

    public function listByTournament(int $tournamentId): void {
        $stmt = $this->db->prepare('
            SELECT t.*, 
                   p1.name as participant1_name, 
                   p2.name as participant2_name
            FROM teams t
            JOIN participants p1 ON t.participant1_id = p1.id
            JOIN participants p2 ON t.participant2_id = p2.id
            WHERE t.tournament_id = ?
            ORDER BY t.seed ASC
        ');
        $stmt->execute([$tournamentId]);
        echo json_encode($stmt->fetchAll());
    }

    /**
     * POST /teams — draw teams randomly from all participants, then seed them,
     * then generate the single-elimination bracket structure.
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
            $stmt = $this->db->prepare('SELECT * FROM participants WHERE tournament_id = ? AND registration_status = "approved" ORDER BY RAND()');
            $stmt->execute([$tournamentId]);
            $participants = $stmt->fetchAll();

            $pendingCount = $this->db->prepare('SELECT COUNT(*) FROM participants WHERE tournament_id = ? AND registration_status = "pending"');
            $pendingCount->execute([$tournamentId]);
            if ((int)$pendingCount->fetchColumn() > 0) {
                throw new Exception('Approve or reject all pending self-registrations before drawing teams');
            }

            if (count($participants) < 2) {
                throw new Exception('Need at least 2 participants');
            }
            if (count($participants) % 2 !== 0) {
                throw new Exception('Need an even number of participants to form teams');
            }
            if (count($participants) < 4) {
                // Exactly 2 participants form a single team with no opponent: generateBracket()
                // creates zero matches for that case, so the tournament could never be played
                // or reach 'complete'.
                throw new Exception('Need at least 4 participants to form at least two teams');
            }

            // Clear any existing teams/matches for this tournament
            $this->db->prepare('DELETE FROM matches WHERE tournament_id = ?')->execute([$tournamentId]);
            $this->db->prepare('DELETE FROM teams WHERE tournament_id = ?')->execute([$tournamentId]);

            // Pair participants into teams
            $teams = [];
            $chunks = array_chunk($participants, 2);
            foreach ($chunks as $i => $pair) {
                $teamName = $pair[0]['name'] . ' & ' . $pair[1]['name'];
                $seed = $i + 1;
                $stmt = $this->db->prepare(
                    'INSERT INTO teams (tournament_id, name, participant1_id, participant2_id, seed) VALUES (?, ?, ?, ?, ?)'
                );
                $stmt->execute([$tournamentId, $teamName, $pair[0]['id'], $pair[1]['id'], $seed]);
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
                $this->generateBracket($tournamentId, $teams);
                $this->db->prepare('UPDATE tournaments SET status = ? WHERE id = ?')
                    ->execute(['active', $tournamentId]);
            }

            $this->db->commit();

            // Return teams
            $stmt = $this->db->prepare('
                SELECT t.*, p1.name as participant1_name, p2.name as participant2_name
                FROM teams t
                JOIN participants p1 ON t.participant1_id = p1.id
                JOIN participants p2 ON t.participant2_id = p2.id
                WHERE t.tournament_id = ?
                ORDER BY t.seed
            ');
            $stmt->execute([$tournamentId]);
            echo json_encode($stmt->fetchAll());

        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
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
                throw new Exception('This tournament uses auto-draft team entry — add participants and draw teams instead');
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

            $stmt = $this->db->prepare('
                SELECT t.*, p1.name as participant1_name, p2.name as participant2_name
                FROM teams t
                JOIN participants p1 ON t.participant1_id = p1.id
                JOIN participants p2 ON t.participant2_id = p2.id
                WHERE t.id = ?
            ');
            $stmt->execute([$teamId]);
            echo json_encode($stmt->fetch());

        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
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
            $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
            $stmt->execute([$tournamentId]);
            $tournament = $stmt->fetch();
            if (!$tournament || $tournament['status'] !== 'setup') {
                throw new Exception('Teams can only be reordered before the bracket is generated');
            }

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

            $stmt = $this->db->prepare('
                SELECT t.*, p1.name as participant1_name, p2.name as participant2_name
                FROM teams t
                JOIN participants p1 ON t.participant1_id = p1.id
                JOIN participants p2 ON t.participant2_id = p2.id
                WHERE t.tournament_id = ?
                ORDER BY t.seed
            ');
            $stmt->execute([$tournamentId]);
            echo json_encode($stmt->fetchAll());

        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
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
            $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
            $stmt->execute([$tournamentId]);
            $tournament = $stmt->fetch();
            if (!$tournament || $tournament['status'] !== 'setup') {
                throw new Exception('Tournament is not awaiting bracket generation');
            }

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

            $this->generateBracket($tournamentId, $teams);

            $this->db->prepare('UPDATE tournaments SET status = ? WHERE id = ?')
                ->execute(['active', $tournamentId]);

            $this->db->commit();

            $stmt = $this->db->prepare('
                SELECT t.*, p1.name as participant1_name, p2.name as participant2_name
                FROM teams t
                JOIN participants p1 ON t.participant1_id = p1.id
                JOIN participants p2 ON t.participant2_id = p2.id
                WHERE t.tournament_id = ?
                ORDER BY t.seed
            ');
            $stmt->execute([$tournamentId]);
            echo json_encode($stmt->fetchAll());

        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
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
        $stmt = $this->db->prepare('SELECT t.*, p1.name as participant1_name, p2.name as participant2_name FROM teams t JOIN participants p1 ON t.participant1_id = p1.id JOIN participants p2 ON t.participant2_id = p2.id WHERE t.id = ?');
        $stmt->execute([$id]);
        echo json_encode($stmt->fetch());
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
        }
    }

    /**
     * Persist a single-elimination bracket for $teams.
     *
     * The bracket's *shape* — pairings, byes, where winners advance — is computed by
     * BracketBuilder, which is pure and unit-tested in tests/BracketBuilderTest.php. This
     * method only writes that shape out. Keep the split: bracket logic that lives here
     * cannot be tested without a database, which is what made this the riskiest code in
     * the repo to change (see FEATURE_TRACKER.md item 16).
     *
     * @param array $teams Rows with at least 'id' and 'seed'.
     */
    private function generateBracket(int $tournamentId, array $teams): void {
        $seedToTeamId = [];
        foreach ($teams as $team) {
            $seedToTeamId[(int)$team['seed']] = (int)$team['id'];
        }

        // Throws on a field smaller than two teams or on gapped seeds. Both surface through
        // the caller's catch block as a 400 instead of silently producing a wrong draw.
        $plan = BracketBuilder::singleElimination($seedToTeamId);

        $insert = $this->db->prepare('
            INSERT INTO matches (tournament_id, round, match_number, team1_id, team2_id, winner_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ');
        $matchIds = [];
        foreach ($plan as $index => $match) {
            $insert->execute([
                $tournamentId,
                $match['round'],
                $match['match_number'],
                $match['team1_id'],
                $match['team2_id'],
                $match['winner_id'],
                $match['status'],
            ]);
            $matchIds[$index] = (int)$this->db->lastInsertId();
        }

        // Second pass: the builder's forward pointers are array indexes, which can only be
        // resolved to real match ids once every row above exists.
        $link = $this->db->prepare('UPDATE matches SET next_match_id = ?, next_match_slot = ? WHERE id = ?');
        foreach ($plan as $index => $match) {
            if ($match['next_match'] === null) {
                continue;
            }
            $link->execute([$matchIds[$match['next_match']], $match['next_match_slot'], $matchIds[$index]]);
        }
    }
}

?>