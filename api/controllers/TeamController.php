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

            // Get participants
            $stmt = $this->db->prepare('SELECT * FROM participants WHERE tournament_id = ? ORDER BY RAND()');
            $stmt->execute([$tournamentId]);
            $participants = $stmt->fetchAll();

            if (count($participants) < 2) {
                throw new Exception('Need at least 2 participants');
            }
            if (count($participants) % 2 !== 0) {
                throw new Exception('Need an even number of participants to form teams');
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

            // Generate bracket
            $this->generateBracket($tournamentId, $teams);

            // Advance tournament status
            $this->db->prepare('UPDATE tournaments SET status = ? WHERE id = ?')
                ->execute(['active', $tournamentId]);

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

            // Auto-advance winners and byes from previous round into this round.
            // We allow propagation for matches marked 'complete' (played) and 'bye' (single-team auto-wins),
            // but we only call maybeMarkReady automatically for genuinely 'complete' matches to avoid cascading
            // byes multiple rounds ahead. 'bye' propagation will fill the slot; if both slots end up filled,
            // the target match will be marked 'ready' but it will not be marked 'complete' automatically.
            foreach ($prevRoundMatches as $mn => $matchId) {
                $stmt = $this->db->prepare('SELECT winner_id, status FROM matches WHERE id = ?');
                $stmt->execute([$matchId]);
                $m = $stmt->fetch();
                if ($m && in_array($m['status'], ['complete', 'bye']) && $m['winner_id']) {
                    $nextMn = (int)ceil($mn / 2);
                    $slot   = ($mn % 2 === 1) ? 1 : 2;
                    $nextMatchId = $currentRoundMatches[$nextMn];
                    $col = $slot === 1 ? 'team1_id' : 'team2_id';
                    $this->db->prepare("UPDATE matches SET $col = ? WHERE id = ?")
                        ->execute([$m['winner_id'], $nextMatchId]);
                    // If the source match was fully played, allow auto-marking the target as ready when both slots present.
                    if ($m['status'] === 'complete') {
                        $this->maybeMarkReady($nextMatchId);
                    } else {
                        // For byes, check if both slots are now filled; if so, mark ready.
                        $stmt2 = $this->db->prepare('SELECT team1_id, team2_id FROM matches WHERE id = ?');
                        $stmt2->execute([$nextMatchId]);
                        $nm = $stmt2->fetch();
                        if ($nm && $nm['team1_id'] && $nm['team2_id']) {
                            $this->db->prepare('UPDATE matches SET status = "ready" WHERE id = ?')->execute([$nextMatchId]);
                        }
                    }
                }
            }

            $prevRoundMatches = $currentRoundMatches;
        }
    }

    private function maybeMarkReady(int $matchId): void {
        $stmt = $this->db->prepare('SELECT team1_id, team2_id FROM matches WHERE id = ?');
        $stmt->execute([$matchId]);
        $m = $stmt->fetch();
        if ($m && $m['team1_id'] && $m['team2_id']) {
            $this->db->prepare('UPDATE matches SET status = "ready" WHERE id = ?')->execute([$matchId]);
        }
    }

    /** Standard bracket seeding: 1 vs n, 2 vs n-1, etc., recursively halved */
    private function buildSeededMatchups(array $seeds): array {
        if (count($seeds) === 2) {
            return [[$seeds[0], $seeds[1]]];
        }
        $half = count($seeds) / 2;
        $top = array_slice($seeds, 0, $half);
        $bottom = array_slice($seeds, $half);
        $bottom = array_reverse($bottom);
        $pairs = [];
        for ($i = 0; $i < $half; $i++) {
            $pairs[] = [$top[$i], $bottom[$i]];
        }
        // Interleave to maintain bracket order
        $result = [];
        $leftPairs  = $this->buildSeededMatchups(array_map(function($p) { return $p[0]; }, $pairs));
        $rightPairs = $this->buildSeededMatchups(array_map(function($p) { return $p[1]; }, $pairs));
        // Merge alternating so bracket halves are correct
        $n = count($leftPairs);
        for ($i = 0; $i < $n; $i++) {
            $result[] = $leftPairs[$i];
            $result[] = $rightPairs[$i];
        }
        return $result;
    }
}

?>