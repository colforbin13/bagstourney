<?php
// api/controllers/TeamController.php

class TeamController {
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
     * Build a standard single-elimination bracket.
     * Teams are seeded: 1v(last), 2v(last-1), etc.
     */
    private function generateBracket(int $tournamentId, array $teams): void {
        $numTeams = count($teams);

        // Round up to next power of 2 for bracket size
        $bracketSize = 1;
        while ($bracketSize < $numTeams) $bracketSize *= 2;

        // Compute number of rounds (log base 2). Use safe formula to avoid relying on optional log($value, $base) overloads.
        $numRounds = (int)(log($bracketSize) / log(2));

        // Build seeded matchups using standard bracket seeding
        // Seed 1 vs last, 2 vs second-last, etc.
        $seeds = range(1, $bracketSize);
        $matchups = $this->buildSeededMatchups($seeds);

        // Map seed → team (null = bye)
        $seedMap = [];
        foreach ($teams as $team) {
            $seedMap[$team['seed']] = $team;
        }

        // Create all matches for all rounds, starting from round 1
        // matchNumber within a round determines bracket position
        $matchesPerRound = [];
        for ($r = 1; $r <= $numRounds; $r++) {
            $matchesPerRound[$r] = $bracketSize / pow(2, $r);
        }

        // Insert round 1 matches first (without next_match_id links yet)
        $round1Matches = [];
        foreach ($matchups as $i => $pair) {
            $matchNumber = $i + 1;
            $team1 = $seedMap[$pair[0]] ?? null;
            $team2 = $seedMap[$pair[1]] ?? null;

            $team1Id = $team1['id'] ?? null;
            $team2Id = $team2['id'] ?? null;

            // Determine status
            $status = 'pending';
            $winnerId = null;

            // Handle byes: if one team is null, mark as a bye (auto-win) but don't mark as 'complete'
            // We store winner_id so we can place the team into the next round, but use 'bye' to prevent
            // cascading propagation beyond the immediate next round during bracket construction.
            if ($team1Id && !$team2Id) {
                $status = 'bye';
                $winnerId = $team1Id;
            } elseif (!$team1Id && $team2Id) {
                $status = 'bye';
                $winnerId = $team2Id;
            } elseif ($team1Id && $team2Id) {
                $status = 'ready';
            }

            $stmt = $this->db->prepare('
                INSERT INTO matches (tournament_id, round, match_number, team1_id, team2_id, winner_id, status)
                VALUES (?, 1, ?, ?, ?, ?, ?)
            ');
            $stmt->execute([$tournamentId, $matchNumber, $team1Id, $team2Id, $winnerId, $status]);
            $round1Matches[$matchNumber] = (int)$this->db->lastInsertId();
        }

        // Insert subsequent rounds
        $prevRoundMatches = $round1Matches;
        for ($r = 2; $r <= $numRounds; $r++) {
            $count = $matchesPerRound[$r];
            $currentRoundMatches = [];
            for ($mn = 1; $mn <= $count; $mn++) {
                $stmt = $this->db->prepare('
                    INSERT INTO matches (tournament_id, round, match_number, status)
                    VALUES (?, ?, ?, "pending")
                ');
                $stmt->execute([$tournamentId, $r, $mn]);
                $currentRoundMatches[$mn] = (int)$this->db->lastInsertId();
            }

            // Link previous round matches to this round
            foreach ($prevRoundMatches as $mn => $matchId) {
                $nextMn = (int)ceil($mn / 2);
                $slot   = ($mn % 2 === 1) ? 1 : 2;
                $this->db->prepare('UPDATE matches SET next_match_id = ?, next_match_slot = ? WHERE id = ?')
                    ->execute([$currentRoundMatches[$nextMn], $slot, $matchId]);
            }

            // Place bye winners into the next round's slots only — no cascading.
            foreach ($prevRoundMatches as $mn => $matchId) {
                $stmt = $this->db->prepare('SELECT winner_id, next_match_id, next_match_slot FROM matches WHERE id = ?');
                $stmt->execute([$matchId]);
                $m = $stmt->fetch();
                if (!$m || !$m['next_match_id'] || !$m['winner_id']) continue;

                $col = (int)$m['next_match_slot'] === 1 ? 'team1_id' : 'team2_id';
                $this->db->prepare("UPDATE matches SET $col = ? WHERE id = ?")
                    ->execute([$m['winner_id'], $m['next_match_id']]);

                $this->maybeMarkReady((int)$m['next_match_id']);
            }

            $prevRoundMatches = $currentRoundMatches;
        }

        // Safety: ensure final match is not auto-declared a winner due to chained byes.
        // Clear any 'bye' status and winner_id on final matches so the championship must be played.
        $this->db->prepare('UPDATE matches SET status = "pending", winner_id = NULL WHERE tournament_id = ? AND next_match_id IS NULL AND status = "bye"')
            ->execute([$tournamentId]);
    }

    private function maybeMarkReady(int $matchId): void {
        $stmt = $this->db->prepare('SELECT team1_id, team2_id FROM matches WHERE id = ?');
        $stmt->execute([$matchId]);
        $m = $stmt->fetch();
        if ($m && $m['team1_id'] && $m['team2_id']) {
            $this->db->prepare('UPDATE matches SET status = "ready" WHERE id = ?')->execute([$matchId]);
        }
    }

    /**
     * Propagate the winner from a source match into its next match slot and cascade
     * through subsequent rounds when the target match has only one team (a bye).
     */
    private function propagateWinnerFromMatchToNext(int $sourceMatchId): void {
        $stmt = $this->db->prepare('SELECT winner_id, next_match_id, next_match_slot FROM matches WHERE id = ?');
        $stmt->execute([$sourceMatchId]);
        $m = $stmt->fetch();
        if (!$m || !$m['next_match_id'] || !$m['winner_id']) return;

        $nextId = (int)$m['next_match_id'];
        $slot   = (int)$m['next_match_slot'];
        $col    = $slot === 1 ? 'team1_id' : 'team2_id';

        $this->db->prepare("UPDATE matches SET $col = ? WHERE id = ?")
            ->execute([$m['winner_id'], $nextId]);

        $stmt2 = $this->db->prepare('SELECT team1_id, team2_id, status FROM matches WHERE id = ?');
        $stmt2->execute([$nextId]);
        $nm = $stmt2->fetch();

        if ($nm && $nm['team1_id'] && $nm['team2_id']) {
            $this->db->prepare('UPDATE matches SET status = "ready" WHERE id = ?')->execute([$nextId]);
        } elseif ($nm && ($nm['team1_id'] || $nm['team2_id'])) {
            // Only one team in the next match — it's itself a bye, keep cascading
            $byeWinnerId = $nm['team1_id'] ?? $nm['team2_id'];
            $this->db->prepare('UPDATE matches SET status = "bye", winner_id = ? WHERE id = ?')
                ->execute([$byeWinnerId, $nextId]);
            $this->propagateWinnerFromMatchToNext($nextId); // recurse
        }
    }

    private function buildSeededMatchups(array $seeds): array {
        $size = count($seeds);
        if ($size < 2) return [];
        $order = $this->seedOrder($size);
        $matchups = [];
        for ($i = 0; $i < $size; $i += 2) {
            $matchups[] = [$seeds[$order[$i] - 1], $seeds[$order[$i + 1] - 1]];
        }
        return $matchups;
    }

    /**
     * Standard single-elimination seeding order for a bracket of $size (a power of 2),
     * as a permutation of positions 1..$size. Built recursively so that seed 1 and seed 2
     * can only meet in the final, {1,2} and {3,4} can only meet in the semifinal, and so on —
     * i.e. top seeds are placed in opposite bracket halves rather than paired sequentially.
     */
    private function seedOrder(int $size): array {
        if ($size <= 1) return [1];
        $prev = $this->seedOrder((int)($size / 2));
        $order = [];
        foreach ($prev as $s) {
            $order[] = $s;
            $order[] = $size + 1 - $s;
        }
        return $order;
    }
}

?>