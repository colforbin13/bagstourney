<?php
// api/controllers/PoolController.php

/**
 * Pool play (FEATURE_TRACKER.md item 18): a few games for every team before the bracket,
 * with the standings deciding the bracket's seeds.
 *
 * The lifecycle, for a tournament whose seeding_mode is 'pool_play':
 *
 *   setup  -> teams formed (blind draw or direct entry) -> start(): pool games scheduled,
 *             tournament goes 'active' so spectators can follow along
 *   active, no bracket yet  = "in pool play": pool scores entered here, and every result
 *             rewrites teams.seed from the standings
 *   all pool games played   -> organizer may drag a tweak (TeamController::reorder()), then
 *             TeamController::generateBracketAction() builds the bracket from the seeds
 *   active, bracket exists  -> pool results are locked; the bracket plays as normal
 *
 * Scheduling and standings are pure and tested (api/lib/PoolPlay.php); this class only
 * reads and writes rows.
 */
class PoolController {
    public function __construct(private readonly PDO $db) {}

    /**
     * Schedule the pool for a tournament whose teams exist, and make it live. Runs inside
     * the caller's transaction: TeamController::draw() for a blind draw (teams and pool in
     * one step, like automatic seeding), or startAction() for direct entry.
     *
     * @throws Exception on a validation failure, for the caller to report as a 400.
     */
    public function start(int $tournamentId): void {
        $stmt = $this->db->prepare('SELECT status, seeding_mode, pool_games FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        $t = $stmt->fetch();
        if (!$t || $t['status'] !== 'setup') {
            throw new Exception('Pool play can only start during setup');
        }
        if ($t['seeding_mode'] !== 'pool_play') {
            throw new Exception('This tournament does not use pool play');
        }
        if (!tournamentHasPaidFeatures($this->db, $tournamentId)) {
            throw new Exception(POOL_PLAY_PAID_MESSAGE);
        }

        $stmt = $this->db->prepare('SELECT id FROM teams WHERE tournament_id = ? ORDER BY seed, id');
        $stmt->execute([$tournamentId]);
        $teamIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        if (count($teamIds) < 2) {
            throw new Exception('Need at least 2 teams to start pool play');
        }

        $this->db->prepare('DELETE FROM pool_matches WHERE tournament_id = ?')->execute([$tournamentId]);
        $insert = $this->db->prepare('
            INSERT INTO pool_matches (tournament_id, round, match_number, team1_id, team2_id)
            VALUES (?, ?, ?, ?, ?)
        ');
        foreach (PoolPlay::schedule($teamIds, (int)$t['pool_games']) as $round => $pairs) {
            foreach ($pairs as $i => [$a, $b]) {
                $insert->execute([$tournamentId, $round, $i + 1, $a, $b]);
            }
        }

        $this->db->prepare('UPDATE tournaments SET status = ? WHERE id = ?')->execute(['active', $tournamentId]);
        $this->syncSeeds($tournamentId);
    }

    /** POST /pool/start — direct entry's "Start pool play" button. */
    public function startAction(array $body, array $actor): void {
        $tournamentId = (int)($body['tournament_id'] ?? 0);
        $this->db->beginTransaction();
        try {
            $this->db->prepare('SELECT id FROM tournaments WHERE id = ? FOR UPDATE')->execute([$tournamentId]);
            $this->start($tournamentId);
            $this->db->commit();
        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
            return;
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
        writeAuditLog($this->db, $tournamentId, (int)$actor['id'], 'pool_play_started', 'tournament', (string)$tournamentId);
        echo json_encode($this->payload($tournamentId));
    }

    /** PUT /pool/{poolMatchId} — record or correct a pool game's score. */
    public function updateScore(int $poolMatchId, array $body, array $actor): void {
        $s1 = $body['team1_score'] ?? null;
        $s2 = $body['team2_score'] ?? null;
        if ($s1 === null || $s2 === null || !is_numeric($s1) || !is_numeric($s2)) {
            http_response_code(400);
            echo json_encode(['error' => 'team1_score and team2_score required']);
            return;
        }
        $s1 = (int)$s1;
        $s2 = (int)$s2;
        if ($s1 < 0 || $s2 < 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Scores cannot be negative']);
            return;
        }
        if ($s1 === $s2) {
            http_response_code(400);
            echo json_encode(['error' => 'Scores cannot be tied; there must be a winner']);
            return;
        }

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('SELECT * FROM pool_matches WHERE id = ? FOR UPDATE');
            $stmt->execute([$poolMatchId]);
            $match = $stmt->fetch();
            if (!$match) {
                $this->db->rollBack();
                http_response_code(404);
                echo json_encode(['error' => 'Pool game not found']);
                return;
            }
            $tournamentId = (int)$match['tournament_id'];
            // Locked once the bracket exists: its seeds were taken from these results, and a
            // late correction would leave the bracket disagreeing with the standings shown.
            if (!self::inPoolStage($this->db, $tournamentId)) {
                throw new Exception('Pool results are locked once the bracket is generated');
            }

            $winnerId = $s1 > $s2 ? $match['team1_id'] : $match['team2_id'];
            $this->db->prepare('
                UPDATE pool_matches SET team1_score = ?, team2_score = ?, winner_id = ?, status = "complete"
                WHERE id = ?
            ')->execute([$s1, $s2, $winnerId, $poolMatchId]);

            // Seeds always mirror the current standings, so a correction re-ranks them too.
            // That overrides any drag tweak made after the pool finished, which is the
            // right call: the tweak was made against results that have since changed.
            $this->syncSeeds($tournamentId);
            $this->db->commit();
        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
            return;
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }

        $isCorrection = $match['status'] === 'complete';
        writeAuditLog($this->db, $tournamentId, (int)$actor['id'],
            $isCorrection ? 'pool_score_corrected' : 'pool_score_recorded',
            'pool_match', (string)$poolMatchId, ['team1_score' => $s1, 'team2_score' => $s2]);

        echo json_encode($this->payload($tournamentId));
    }

    /**
     * Everything a screen needs to show the pool: the games by round and the standings.
     * Null for a tournament that does not use pool play. Embedded in GET /matches so the
     * bracket page, score entry and manage screen get it from the request they already make.
     */
    public function payload(int $tournamentId): ?array {
        $stmt = $this->db->prepare('SELECT seeding_mode, pool_games FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        $t = $stmt->fetch();
        if (!$t || $t['seeding_mode'] !== 'pool_play') return null;

        $stmt = $this->db->prepare('
            SELECT pm.id, pm.round, pm.match_number, pm.team1_id, pm.team2_id,
                   pm.team1_score, pm.team2_score, pm.winner_id, pm.status,
                   t1.name AS team1_name, t2.name AS team2_name
            FROM pool_matches pm
            JOIN teams t1 ON t1.id = pm.team1_id
            JOIN teams t2 ON t2.id = pm.team2_id
            WHERE pm.tournament_id = ?
            ORDER BY pm.round, pm.match_number
        ');
        $stmt->execute([$tournamentId]);
        $games = $stmt->fetchAll();

        $rounds = [];
        $played = 0;
        foreach ($games as $g) {
            foreach (['id', 'round', 'match_number', 'team1_id', 'team2_id'] as $k) $g[$k] = (int)$g[$k];
            foreach (['team1_score', 'team2_score', 'winner_id'] as $k) $g[$k] = $g[$k] === null ? null : (int)$g[$k];
            $rounds[$g['round']][] = $g;
            if ($g['status'] === 'complete') $played++;
        }
        $roundList = [];
        foreach ($rounds as $round => $list) {
            $roundList[] = ['round' => $round, 'matches' => $list];
        }

        $standings = [];
        foreach ($this->standings($tournamentId) as $row) {
            $standings[] = $row;
        }

        return [
            'games_per_team' => (int)$t['pool_games'],
            'started' => count($games) > 0,
            'games_played' => $played,
            'games_total' => count($games),
            'complete' => count($games) > 0 && $played === count($games),
            'locked' => count($games) > 0 && !self::inPoolStage($this->db, $tournamentId),
            'rounds' => $roundList,
            'standings' => $standings,
        ];
    }

    /** Standings rows in rank order, with team and player names attached. */
    private function standings(int $tournamentId): array {
        $stmt = $this->db->prepare('
            SELECT t.id, t.name, p1.name AS participant1_name, p2.name AS participant2_name
            FROM teams t
            LEFT JOIN participants p1 ON p1.id = t.participant1_id
            LEFT JOIN participants p2 ON p2.id = t.participant2_id
            WHERE t.tournament_id = ?
        ');
        $stmt->execute([$tournamentId]);
        $teams = [];
        foreach ($stmt->fetchAll() as $row) $teams[(int)$row['id']] = $row;
        if (!$teams) return [];

        $stmt = $this->db->prepare('
            SELECT team1_id, team2_id, team1_score, team2_score FROM pool_matches
            WHERE tournament_id = ? AND status = "complete"
        ');
        $stmt->execute([$tournamentId]);

        $rows = [];
        foreach (PoolPlay::standings(array_keys($teams), $stmt->fetchAll(), $tournamentId) as $row) {
            $team = $teams[$row['team_id']];
            $row['team_name'] = $team['name'];
            $row['participant1_name'] = $team['participant1_name'];
            $row['participant2_name'] = $team['participant2_name'];
            $rows[] = $row;
        }
        return $rows;
    }

    /** Rewrite teams.seed to match the standings: rank 1 is seed 1. */
    private function syncSeeds(int $tournamentId): void {
        $update = $this->db->prepare('UPDATE teams SET seed = ? WHERE id = ? AND tournament_id = ?');
        foreach ($this->standings($tournamentId) as $row) {
            $update->execute([$row['rank'], $row['team_id'], $tournamentId]);
        }
    }

    /**
     * True while pool games are being played: a pool-play tournament that has started but
     * has no bracket yet. The bracket's existence, not a stored flag, is what ends the pool,
     * so there is no second piece of state to fall out of step.
     */
    public static function inPoolStage(PDO $db, int $tournamentId): bool {
        $stmt = $db->prepare('
            SELECT t.seeding_mode, t.status,
                   EXISTS(SELECT 1 FROM matches m WHERE m.tournament_id = t.id) AS has_bracket
            FROM tournaments t WHERE t.id = ?
        ');
        $stmt->execute([$tournamentId]);
        $t = $stmt->fetch();
        return $t
            && $t['seeding_mode'] === 'pool_play'
            && $t['status'] === 'active'
            && !(int)$t['has_bracket'];
    }

    /** True when every scheduled pool game has a result. */
    public static function poolComplete(PDO $db, int $tournamentId): bool {
        $stmt = $db->prepare('
            SELECT COUNT(*) AS total, SUM(status = "complete") AS played
            FROM pool_matches WHERE tournament_id = ?
        ');
        $stmt->execute([$tournamentId]);
        $r = $stmt->fetch();
        return (int)$r['total'] > 0 && (int)$r['total'] === (int)$r['played'];
    }
}
