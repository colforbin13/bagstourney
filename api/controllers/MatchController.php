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

        $formatStmt = $this->db->prepare('SELECT format FROM tournaments WHERE id = ?');
        $formatStmt->execute([$tournamentId]);
        $formatRow = $formatStmt->fetch();
        $format = $formatRow && $formatRow['format'] ? $formatRow['format'] : 'single';

        // Grouped by bracket side first, then round. Round numbers restart per side in
        // double elimination, so grouping on `round` alone — as this used to — merges
        // winners round 2 with losers round 2 and renders them as one column.
        $bySide = [];
        foreach ($matches as $match) {
            $side = isset($match['bracket_side']) && $match['bracket_side'] ? $match['bracket_side'] : 'winners';
            $bySide[$side][(int)$match['round']][] = $match;
        }

        $sides = [];
        foreach (['winners', 'losers', 'grand_final'] as $side) {
            if (empty($bySide[$side])) {
                continue;
            }
            ksort($bySide[$side]);
            $rounds = [];
            foreach ($bySide[$side] as $round => $group) {
                // Rounds are emitted as an ordered list rather than an object keyed by round
                // number: a losers bracket whose first round collapsed away starts at round
                // 2, and consumers care about a round's *position* within its side, not the
                // structural number.
                $rounds[] = ['round' => $round, 'matches' => $group];
            }
            $sides[] = ['side' => $side, 'rounds' => $rounds];
        }

        $payload = ['format' => $format, 'sides' => $sides];

        if ($format !== 'double') {
            // Legacy shape, for a client cached before the two-tree response existed. It is
            // exactly right for single elimination and meaningless for double, so it is
            // omitted there rather than shipped wrong.
            $legacy = [];
            foreach ($matches as $match) {
                $legacy[$match['round']][] = $match;
            }
            $payload['rounds'] = $legacy;
        }

        echo json_encode($payload);
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

            // Advance the winner, and in double elimination drop the loser into the losers
            // bracket. cascadePropagate() places both and re-evaluates whether each target
            // is now playable.
            $this->cascadePropagate($matchId);

            // Whether this finished the tournament is no longer something the match's own
            // shape can answer: in double elimination a grand final may or may not be the
            // last match, depending on which side won it. Ask for the champion instead.
            $championId = $this->championOf((int)$match['tournament_id']);

            if (!$wasComplete) {
                if ($championId !== null) {
                    $this->enqueueTournamentFinalizedNotifications($match, $matchId);
                } else {
                    $this->enqueueRoundCompletedNotifications($match);
                }
            }

            // Deriving the status here, rather than only when the last match is played, is
            // what makes editing an earlier score reopen a finished tournament: that edit
            // clears the deciding match via cascadeClearDownstream(), which previously left
            // the tournament marked 'complete' with no champion.
            $this->syncTournamentStatus((int)$match['tournament_id'], $championId);

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

    /**
     * Undo the downstream effects of a result that is being replaced.
     *
     * Follows *both* forward edges — where the winner advanced and where the loser dropped.
     * In double elimination those two paths re-converge at the grand final, so a match can be
     * reached twice; $visited keeps that from doing the work twice.
     *
     * The walk is driven by the data rather than the structure: a slot is cleared only when a
     * team is actually sitting in it, and the recursion continues only when the match it just
     * touched actually had a result to lose.
     *
     * Worth being precise about what that buys, because it is tempting to assume more. In a
     * fully-played bracket it is *equivalent* to blindly walking every downstream edge, since
     * each slot has exactly one feeder and a match cannot hold a result unless both slots were
     * filled — so nothing downstream can survive an ancestor being withdrawn. The guards earn
     * their place by stopping the walk the moment a branch was never populated (fewer queries,
     * and no writes to matches that had nothing to undo) and by staying correct if a
     * partially-populated shape ever appears — a losers-bracket walkover, say, which
     * BracketBuilder currently designs out but nothing in this method depends on.
     */
    private function cascadeClearDownstream(int $matchId, array &$visited = []): void {
        if (isset($visited[$matchId])) return;
        $visited[$matchId] = true;

        $stmt = $this->db->prepare('
            SELECT next_match_id, next_match_slot, loser_match_id, loser_match_slot
            FROM matches WHERE id = ?
        ');
        $stmt->execute([$matchId]);
        $source = $stmt->fetch();
        if (!$source) return;

        $edges = [
            [$source['next_match_id'], $source['next_match_slot']],
            [$source['loser_match_id'], $source['loser_match_slot']],
        ];

        foreach ($edges as $edge) {
            list($targetId, $targetSlot) = $edge;
            if (!$targetId) continue;

            $targetId = (int)$targetId;
            $column = (int)$targetSlot === 1 ? 'team1_id' : 'team2_id';

            $read = $this->db->prepare('SELECT team1_id, team2_id, winner_id FROM matches WHERE id = ?');
            $read->execute([$targetId]);
            $target = $read->fetch();

            // Nothing ever propagated into this slot, so nothing beyond it depends on us.
            // Each slot is fed by exactly one edge, so anything sitting here came from this
            // match and is ours to withdraw.
            if (!$target || $target[$column] === null) continue;

            $hadResult = $target['winner_id'] !== null;

            $this->db->prepare("
                UPDATE matches
                SET {$column} = NULL, winner_id = NULL, team1_score = NULL, team2_score = NULL, status = 'pending'
                WHERE id = ?
            ")->execute([$targetId]);

            // The opponent may still be in place, which makes the match playable again as
            // soon as the corrected result advances into it.
            $this->refreshReadiness($targetId);

            if ($hadResult) {
                // That result was played with a team that has just been withdrawn, so its own
                // winner and loser both have to be taken back too.
                $this->cascadeClearDownstream($targetId, $visited);
            }
        }
    }

    /**
     * After a match completes, place its winner into the match it advances to and, in double
     * elimination, its loser into the losers-bracket match it drops to.
     *
     * The grand final is the one special case. It feeds the reset match through both edges,
     * but the reset is played only when the losers-bracket side (slot 2) wins it — at that
     * point both teams carry a single loss. If the winners-bracket side holds, the tournament
     * is over and nothing carries across.
     */
    private function cascadePropagate(int $sourceMatchId): void {
        $stmt = $this->db->prepare('
            SELECT team1_id, team2_id, winner_id, bracket_side, is_reset,
                   next_match_id, next_match_slot, loser_match_id, loser_match_slot
            FROM matches WHERE id = ?
        ');
        $stmt->execute([$sourceMatchId]);
        $match = $stmt->fetch();
        if (!$match || !$match['winner_id']) return;
        if ($this->grandFinalEndsHere($match)) return;

        $winnerId = (int)$match['winner_id'];
        $loserId = $winnerId === (int)$match['team1_id'] ? $match['team2_id'] : $match['team1_id'];

        $this->placeTeam($match['next_match_id'], $match['next_match_slot'], $winnerId);
        $this->placeTeam($match['loser_match_id'], $match['loser_match_slot'], $loserId);
    }

    /**
     * True when $match is a grand final that the winners-bracket side has just won, so the
     * reset it points at must not be played.
     */
    private function grandFinalEndsHere(array $match): bool {
        return ($match['bracket_side'] ?? 'winners') === 'grand_final'
            && !(int)($match['is_reset'] ?? 0)
            && (int)$match['winner_id'] === (int)$match['team1_id'];
    }

    /** Put a team into one slot of a target match, then re-evaluate whether it can be played. */
    private function placeTeam($targetId, $targetSlot, $teamId): void {
        if (!$targetId || $teamId === null) return;

        $targetId = (int)$targetId;
        $column = (int)$targetSlot === 1 ? 'team1_id' : 'team2_id';
        $this->db->prepare("UPDATE matches SET {$column} = ? WHERE id = ?")
            ->execute([(int)$teamId, $targetId]);

        $this->refreshReadiness($targetId);
    }

    /**
     * A match with both entrants present is playable; with fewer it is still waiting. Never
     * touches a match that already has a result — reopening one is cascadeClearDownstream()'s
     * job, and only when a participant was actually withdrawn.
     */
    private function refreshReadiness(int $matchId): void {
        $stmt = $this->db->prepare('SELECT team1_id, team2_id, winner_id FROM matches WHERE id = ?');
        $stmt->execute([$matchId]);
        $match = $stmt->fetch();
        if (!$match || $match['winner_id'] !== null) return;

        $status = ($match['team1_id'] && $match['team2_id']) ? 'ready' : 'pending';
        $this->db->prepare('UPDATE matches SET status = ? WHERE id = ?')->execute([$status, $matchId]);
    }

    /**
     * The tournament's champion, or null while it is still being decided.
     *
     * Single elimination: the winner of the one match with no next_match_id.
     *
     * Double elimination: "no next match" stops meaning "the end", because the grand final
     * points at a reset. The champion is the reset's winner when the reset was played, and
     * otherwise the grand final's winner — but only if the winners-bracket side (slot 1) took
     * it. A losers-bracket win levels the tournament at one loss each and sends it to the
     * reset, so at that moment there is no champion yet.
     */
    private function championOf(int $tournamentId): ?int {
        $stmt = $this->db->prepare('
            SELECT is_reset, team1_id, winner_id
            FROM matches
            WHERE tournament_id = ? AND bracket_side = "grand_final"
            ORDER BY is_reset
        ');
        $stmt->execute([$tournamentId]);
        $grandFinals = $stmt->fetchAll();

        if ($grandFinals) {
            $grandFinal = $grandFinals[0];
            $reset = isset($grandFinals[1]) ? $grandFinals[1] : null;

            if ($reset && $reset['winner_id']) {
                return (int)$reset['winner_id'];
            }
            if ($grandFinal['winner_id'] && (int)$grandFinal['winner_id'] === (int)$grandFinal['team1_id']) {
                return (int)$grandFinal['winner_id'];
            }
            return null;
        }

        $stmt = $this->db->prepare('
            SELECT winner_id FROM matches
            WHERE tournament_id = ? AND next_match_id IS NULL
        ');
        $stmt->execute([$tournamentId]);
        $final = $stmt->fetch();

        return $final && $final['winner_id'] ? (int)$final['winner_id'] : null;
    }

    /**
     * Derive the tournament's status from whether a champion exists. Deliberately only moves
     * between 'active' and 'complete' — a tournament still in 'setup' has no bracket to read
     * and must be left alone.
     */
    private function syncTournamentStatus(int $tournamentId, ?int $championId): void {
        $this->db->prepare('
            UPDATE tournaments SET status = ?
            WHERE id = ? AND status IN ("active", "complete")
        ')->execute([$championId === null ? 'active' : 'complete', $tournamentId]);
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
    //
    // The round must be scoped by bracket_side as well. Round numbers restart per side in
    // double elimination, so winners round 2 and losers round 2 are different rounds that
    // finish at different times; matching on round alone would treat them as one and
    // suppress both notifications until the later of the two completed.
    private function enqueueRoundCompletedNotifications(array $match): void {
        if (!NOTIFY_ROUND_COMPLETED_ENABLED) return;
        $bracketSide = isset($match['bracket_side']) ? $match['bracket_side'] : 'winners';
        $remaining = $this->db->prepare('
            SELECT COUNT(*) FROM matches
            WHERE tournament_id = ? AND round = ? AND bracket_side = ?
              AND status NOT IN ("complete", "bye")
        ');
        $remaining->execute([$match['tournament_id'], $match['round'], $bracketSide]);
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

    // Called only when championOf() has just returned a winner, so this and
    // enqueueRoundCompletedNotifications() never both fire for the same match. Notifies
    // every confirmed, opted-in participant tournament-wide.
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
