<?php
// api/controllers/MatchController.php

class MatchController {
    private $db;

    public function __construct(PDO $db) {
		$this->db = $db;
	}

    // Resolves a uuid to its tournament before delegating to bracket() — no visibility
    // check here, matching TournamentController::getByUuid(): knowing the uuid is itself
    // the access grant for a private tournament.
    public function bracketByUuid(string $uuid): void {
        $stmt = $this->db->prepare('SELECT id FROM tournaments WHERE uuid = ?');
        $stmt->execute([$uuid]);
        $t = $stmt->fetch();
        if (!$t) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }
        $this->bracket((int)$t['id']);
    }

    public function bracket(int $tournamentId): void {
        $stmt = $this->db->prepare('
            SELECT
                m.*,
                t1.name as team1_name,
                t2.name as team2_name,
                tw.name as winner_name,
                t1p1.name as team1_participant1_name,
                t1p2.name as team1_participant2_name,
                t2p1.name as team2_participant1_name,
                t2p2.name as team2_participant2_name
            FROM matches m
            LEFT JOIN teams t1 ON m.team1_id  = t1.id
            LEFT JOIN teams t2 ON m.team2_id  = t2.id
            LEFT JOIN teams tw ON m.winner_id  = tw.id
            LEFT JOIN participants t1p1 ON t1.participant1_id = t1p1.id
            LEFT JOIN participants t1p2 ON t1.participant2_id = t1p2.id
            LEFT JOIN participants t2p1 ON t2.participant1_id = t2p1.id
            LEFT JOIN participants t2p2 ON t2.participant2_id = t2p2.id
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

    public function updateScore(int $matchId, array $body, array $actor): void {
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

        $this->db->beginTransaction();
        try {
            // Lock the match row for the rest of this transaction so two concurrent
            // submissions for the same match can't both read status='ready' here and both
            // take the first-completion branch below (which would double-enqueue
            // notification emails) — the second request blocks on this SELECT until the
            // first commits, then sees the already-updated status.
            $stmt = $this->db->prepare('SELECT * FROM matches WHERE id = ? FOR UPDATE');
            $stmt->execute([$matchId]);
            $match = $stmt->fetch();

            if (!$match) {
                $this->db->rollBack();
                http_response_code(404);
                echo json_encode(['error' => 'Match not found']);
                return;
            }

            // Allow updates for matches that are ready or already complete (editing past results)
            if (!in_array($match['status'], ['ready', 'complete'])) {
                $this->db->rollBack();
                http_response_code(400);
                echo json_encode(['error' => 'Match is not ready to play']);
                return;
            }

            $winnerId = $team1Score > $team2Score ? $match['team1_id'] : $match['team2_id'];
            $wasComplete = $match['status'] === 'complete';

            // Update the match
            $this->db->prepare('
                UPDATE matches
                SET team1_score = ?, team2_score = ?, winner_id = ?, status = "complete"
                WHERE id = ?
            ')->execute([$team1Score, $team2Score, $winnerId, $matchId]);

            if ($wasComplete) {
                // Editing an already-completed match: clear any downstream results that
                // were built on the previous winner before advancing the (possibly
                // different) winner below, so the bracket doesn't show two teams as
                // having won the same slot.
                $this->cascadeClearDownstream($matchId);
            } else {
                // Only a first-time completion notifies participants — corrections stay
                // silent so editing an old score doesn't re-blast an email that looks like
                // a duplicate.
                $this->enqueueMatchCompletedNotifications($match, $matchId);
            }

            // Advance winner to next match. cascadePropagate() places the winner, marks the
            // target ready once both slots are filled, and follows any chained byes — this
            // used to be duplicated inline here as well, which meant two copies of the
            // advance rule to keep in step.
            if ($match['next_match_id']) {
                $this->cascadePropagate($matchId);

                if (!$wasComplete) {
                    $this->enqueueRoundCompletedNotifications($match);
                }
            } else {
                if (!$wasComplete) {
                    $this->enqueueTournamentFinalizedNotifications($match, $matchId);
                }
            }

            // A tournament is complete exactly when its final has a winner. Deriving the
            // status here, rather than only setting it in the final's branch above, is what
            // makes editing an earlier score reopen a finished tournament: that edit clears
            // the final via cascadeClearDownstream(), which previously left the tournament
            // marked 'complete' with no champion.
            $this->syncTournamentStatus((int)$match['tournament_id']);

            $this->db->commit();

            $isCorrection = $match['status'] === 'complete'
                && ((int)$match['team1_score'] !== $team1Score || (int)$match['team2_score'] !== $team2Score);
            writeAuditLog(
                $this->db,
                (int)$match['tournament_id'],
                (int)$actor['id'],
                $isCorrection ? 'match_score_corrected' : 'match_score_recorded',
                'match',
                (string)$matchId,
                ['team1_score' => $team1Score, 'team2_score' => $team2Score]
            );

            // Return updated match
            $stmt = $this->db->prepare('
                SELECT
                    m.*,
                    t1.name as team1_name,
                    t2.name as team2_name,
                    tw.name as winner_name,
                    t1p1.name as team1_participant1_name,
                    t1p2.name as team1_participant2_name,
                    t2p1.name as team2_participant1_name,
                    t2p2.name as team2_participant2_name
                FROM matches m
                LEFT JOIN teams t1 ON m.team1_id = t1.id
                LEFT JOIN teams t2 ON m.team2_id = t2.id
                LEFT JOIN teams tw ON m.winner_id = tw.id
                LEFT JOIN participants t1p1 ON t1.participant1_id = t1p1.id
                LEFT JOIN participants t1p2 ON t1.participant2_id = t1p2.id
                LEFT JOIN participants t2p1 ON t2.participant1_id = t2p1.id
                LEFT JOIN participants t2p2 ON t2.participant2_id = t2p2.id
                WHERE m.id = ?
            ');
            $stmt->execute([$matchId]);
            echo json_encode($stmt->fetch());

        } catch (Exception $e) {
            // writeAuditLog() and the final SELECT above run after commit() succeeds but are
            // still inside this try block; if either of them throws, there is no longer an
            // active transaction, and calling rollBack() would itself throw and mask the
            // real error. Only roll back if a transaction is actually still open.
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
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

    /**
     * Derive the tournament's status from its final match: 'complete' once the final has a
     * winner, 'active' while it does not. Deliberately only moves between those two — a
     * tournament still in 'setup' has no bracket to read and must be left alone.
     *
     * Single elimination has exactly one match with no next_match_id, so that identifies
     * the final. Double elimination (FEATURE_TRACKER.md item 16) breaks that assumption —
     * a grand final may be followed by a reset match — which is precisely why the rule
     * lives in one place instead of being inlined at the call site.
     */
    private function syncTournamentStatus(int $tournamentId): void {
        $stmt = $this->db->prepare('
            SELECT winner_id FROM matches
            WHERE tournament_id = ? AND next_match_id IS NULL
        ');
        $stmt->execute([$tournamentId]);
        $final = $stmt->fetch();
        if (!$final) return;

        $status = $final['winner_id'] ? 'complete' : 'active';
        $this->db->prepare('
            UPDATE tournaments SET status = ?
            WHERE id = ? AND status IN ("active", "complete")
        ')->execute([$status, $tournamentId]);
    }

    // Notifies the 4 participants (2 per team) of this specific match. $match is the
    // pre-update row fetched at the top of updateScore(), so its tournament_id/round/
    // team1_id/team2_id reflect this match regardless of what the score update changed.
    private function enqueueMatchCompletedNotifications(array $match, int $matchId): void {
        if (!NOTIFY_MATCH_COMPLETED_ENABLED) return;
        $stmt = $this->db->prepare('
            SELECT DISTINCT p.id, p.email
            FROM participants p
            JOIN teams t ON p.id = t.participant1_id OR p.id = t.participant2_id
            WHERE t.id IN (?, ?)
              AND p.notification_lifecycle = "confirmed"
              AND p.notify_match_completed = 1
        ');
        $stmt->execute([$match['team1_id'], $match['team2_id']]);
        $insert = $this->db->prepare('
            INSERT INTO notification_queue (tournament_id, match_id, round, participant_id, email, event_type)
            VALUES (?, ?, ?, ?, ?, "match_completed")
        ');
        foreach ($stmt->fetchAll() as $recipient) {
            $insert->execute([$match['tournament_id'], $matchId, (int)$match['round'], $recipient['id'], $recipient['email']]);
        }
    }

    // Fires only when every match in this match's round is now complete or a bye — byes
    // are resolved entirely at draw time (TeamController::generateBracket()) and never
    // reach this method, so a round completed purely via byes will not notify (accepted
    // limitation). Notifies every confirmed, opted-in participant in the whole tournament,
    // not just this match's own participants or those advancing.
    private function enqueueRoundCompletedNotifications(array $match): void {
        if (!NOTIFY_ROUND_COMPLETED_ENABLED) return;
        $remaining = $this->db->prepare('
            SELECT COUNT(*) FROM matches
            WHERE tournament_id = ? AND round = ? AND status NOT IN ("complete", "bye")
        ');
        $remaining->execute([$match['tournament_id'], $match['round']]);
        if ((int)$remaining->fetchColumn() !== 0) return;

        $stmt = $this->db->prepare('
            SELECT id, email FROM participants
            WHERE tournament_id = ? AND notification_lifecycle = "confirmed" AND notify_round_completed = 1
        ');
        $stmt->execute([$match['tournament_id']]);
        $insert = $this->db->prepare('
            INSERT INTO notification_queue (tournament_id, round, participant_id, email, event_type)
            VALUES (?, ?, ?, ?, "round_completed")
        ');
        foreach ($stmt->fetchAll() as $recipient) {
            $insert->execute([$match['tournament_id'], (int)$match['round'], $recipient['id'], $recipient['email']]);
        }
    }

    // Called only from the "no next_match_id" branch, which is structurally always the
    // championship match — so this and enqueueRoundCompletedNotifications() never both
    // fire for the same match. Notifies every confirmed, opted-in participant tournament-wide.
    private function enqueueTournamentFinalizedNotifications(array $match, int $matchId): void {
        if (!NOTIFY_TOURNAMENT_FINALIZED_ENABLED) return;
        $stmt = $this->db->prepare('
            SELECT id, email FROM participants
            WHERE tournament_id = ? AND notification_lifecycle = "confirmed" AND notify_tournament_finalized = 1
        ');
        $stmt->execute([$match['tournament_id']]);
        $insert = $this->db->prepare('
            INSERT INTO notification_queue (tournament_id, match_id, round, participant_id, email, event_type)
            VALUES (?, ?, ?, ?, ?, "tournament_finalized")
        ');
        foreach ($stmt->fetchAll() as $recipient) {
            $insert->execute([$match['tournament_id'], $matchId, (int)$match['round'], $recipient['id'], $recipient['email']]);
        }
    }
}

?>
