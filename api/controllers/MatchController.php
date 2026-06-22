<?php
// api/controllers/MatchController.php

class MatchController {
    public function __construct(PDO $db) {
		$this->db = $db;
	}

    public function bracket(int $tournamentId): void {
        $stmt = $this->db->prepare('
            SELECT 
                m.*,
                t1.name as team1_name,
                t2.name as team2_name,
                tw.name as winner_name
            FROM matches m
            LEFT JOIN teams t1 ON m.team1_id  = t1.id
            LEFT JOIN teams t2 ON m.team2_id  = t2.id
            LEFT JOIN teams tw ON m.winner_id  = tw.id
            WHERE m.tournament_id = ?
            ORDER BY m.round ASC, m.match_number ASC
        ');
        $stmt->execute([$tournamentId]);
        $matches = $stmt->fetchAll();

        // Group by round
        $rounds = [];
        foreach ($matches as $match) {
            $rounds[$match['round']][] = $match;
        }

        echo json_encode(['rounds' => $rounds]);
    }

    public function updateScore(int $matchId, array $body): void {
        $team1Score = $body['team1_score'] ?? null;
        $team2Score = $body['team2_score'] ?? null;

        if ($team1Score === null || $team2Score === null) {
            http_response_code(400);
            echo json_encode(['error' => 'team1_score and team2_score required']);
            return;
        }

        $team1Score = (int)$team1Score;
        $team2Score = (int)$team2Score;

        if ($team1Score === $team2Score) {
            http_response_code(400);
            echo json_encode(['error' => 'Scores cannot be tied; there must be a winner']);
            return;
        }

        $stmt = $this->db->prepare('SELECT * FROM matches WHERE id = ?');
        $stmt->execute([$matchId]);
        $match = $stmt->fetch();

        if (!$match) {
            http_response_code(404);
            echo json_encode(['error' => 'Match not found']);
            return;
        }

        // Allow updates for matches that are ready or already complete (editing past results)
        if (!in_array($match['status'], ['ready', 'complete'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Match is not ready to play']);
            return;
        }

        $winnerId = $team1Score > $team2Score ? $match['team1_id'] : $match['team2_id'];

        $this->db->beginTransaction();
        try {
            // Update the match
            $this->db->prepare('
                UPDATE matches 
                SET team1_score = ?, team2_score = ?, winner_id = ?, status = "complete"
                WHERE id = ?
            ')->execute([$team1Score, $team2Score, $winnerId, $matchId]);

            // Advance winner to next match
            if ($match['next_match_id']) {
                $col = $match['next_match_slot'] === 1 ? 'team1_id' : 'team2_id';
                $this->db->prepare("UPDATE matches SET $col = ? WHERE id = ?")
                    ->execute([$winnerId, $match['next_match_id']]);

                // Check if next match now has both teams → mark ready
                $stmt = $this->db->prepare('SELECT team1_id, team2_id FROM matches WHERE id = ?');
                $stmt->execute([$match['next_match_id']]);
                $next = $stmt->fetch();
                if ($next && $next['team1_id'] && $next['team2_id']) {
                    $this->db->prepare('UPDATE matches SET status = "ready" WHERE id = ?')
                        ->execute([$match['next_match_id']]);
                }

                // Cascade-propagate winners through chained byes so a completed match advances properly.
                $this->cascadePropagate($matchId);
            } else {
                // No next match → this was the final, mark tournament complete
                $stmt = $this->db->prepare('SELECT tournament_id FROM matches WHERE id = ?');
                $stmt->execute([$matchId]);
                $m = $stmt->fetch();
                if ($m) {
                    $this->db->prepare('UPDATE tournaments SET status = "complete" WHERE id = ?')
                        ->execute([$m['tournament_id']]);
                }
            }

            $this->db->commit();

            // Return updated match
            $stmt = $this->db->prepare('
                SELECT m.*, t1.name as team1_name, t2.name as team2_name, tw.name as winner_name
                FROM matches m
                LEFT JOIN teams t1 ON m.team1_id = t1.id
                LEFT JOIN teams t2 ON m.team2_id = t2.id
                LEFT JOIN teams tw ON m.winner_id = tw.id
                WHERE m.id = ?
            ');
            $stmt->execute([$matchId]);
            echo json_encode($stmt->fetch());

        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    // Clears downstream propagation of a match's winner by nulling the appropriate slot
    // and recursively clearing any matches that were advanced from it. This allows
    // editing of completed matches without leaving inconsistent downstream results.
    private function cascadeClearDownstream(int $matchId): void {
        // Get next match info for this match
        $stmt = $this->db->prepare('SELECT next_match_id, next_match_slot FROM matches WHERE id = ?');
        $stmt->execute([$matchId]);
        $m = $stmt->fetch();
        if (!$m || !$m['next_match_id']) return;

        $nextId = (int)$m['next_match_id'];
        $slot = (int)$m['next_match_slot'];
        $col = $slot === 1 ? 'team1_id' : 'team2_id';

        // Clear the slot in the next match and reset its result/status
        $this->db->prepare("UPDATE matches SET $col = NULL, winner_id = NULL, team1_score = NULL, team2_score = NULL, status = 'pending' WHERE id = ?")
            ->execute([$nextId]);

        // Recurse to clear any further propagation from the next match
        $this->cascadeClearDownstream($nextId);
    }

    /**
     * After a match completes, propagate its winner forward and cascade through
     * subsequent rounds when target matches have only one team (byes). Do NOT
     * auto-declare the final: final matches (next_match_id IS NULL) are left to play.
     */
    private function cascadePropagate(int $sourceMatchId): void {
        // Propagate only one round after a match completes: place the winner into the immediate
        // next match slot. Do NOT auto-declare winners or cascade through multiple rounds here.
        $stmt = $this->db->prepare('SELECT winner_id, next_match_id, next_match_slot FROM matches WHERE id = ?');
        $stmt->execute([$sourceMatchId]);
        $m = $stmt->fetch();
        if (!$m || !$m['next_match_id'] || !$m['winner_id']) return;

        $nextId = (int)$m['next_match_id'];
        $slot = (int)$m['next_match_slot'];
        $col = $slot === 1 ? 'team1_id' : 'team2_id';

        // Place winner into next match slot
        $this->db->prepare("UPDATE matches SET $col = ? WHERE id = ?")->execute([$m['winner_id'], $nextId]);

        // Check target match and mark ready only when both slots are present.
        $stmt2 = $this->db->prepare('SELECT team1_id, team2_id FROM matches WHERE id = ?');
        $stmt2->execute([$nextId]);
        $nm = $stmt2->fetch();
        if ($nm && $nm['team1_id'] && $nm['team2_id']) {
            $this->db->prepare('UPDATE matches SET status = "ready" WHERE id = ?')->execute([$nextId]);
        }
    }
}

?>