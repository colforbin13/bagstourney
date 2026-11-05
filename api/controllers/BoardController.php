<?php
// api/controllers/BoardController.php

/**
 * Board assignments (FEATURE_TRACKER.md item 8). The rules live in api/lib/BoardQueue.php;
 * this reads the playable games, hands them over, and writes back what changed.
 *
 * Assignment is derived from current state every time anything changes (a score, a new
 * bracket, a pool starting, the board count), rather than kept as a schedule that has to
 * be patched. That is what lets a re-scored match, a regenerated bracket or a bye need no
 * manual cleanup: the next reconcile simply sees the games as they now are.
 */
class BoardController {
    /**
     * What a tournament may call its playing spots. Only the word on screen changes. The
     * frontend mirrors this list in shared/board-labels.ts.
     */
    public const LABELS = ['board', 'court', 'lane', 'table', 'pit', 'field'];

    public function __construct(private readonly PDO $db) {}

    /**
     * Bring board assignments in line with the tournament's current games. Call inside the
     * transaction that changed them. Safe to call for any tournament: with boards off, or
     * a tournament that is not live, it just clears any boards left over.
     */
    public function reconcile(int $tournamentId): void {
        $count = $this->lockAndCount($tournamentId);

        // A game holds a board only while it is being played.
        $this->db->prepare("UPDATE matches SET board_number = NULL WHERE tournament_id = ? AND status <> 'ready' AND board_number IS NOT NULL")
            ->execute([$tournamentId]);
        $this->db->prepare("UPDATE pool_matches SET board_number = NULL WHERE tournament_id = ? AND status <> 'ready' AND board_number IS NOT NULL")
            ->execute([$tournamentId]);

        $games = $this->games($tournamentId);
        $this->write($games, BoardQueue::assign($count, $games));
    }

    /** PUT /boards/{tournamentId} — staff move a game to a board by hand. */
    public function moveAction(int $tournamentId, array $body, array $actor): void {
        $kind = $body['kind'] ?? '';
        $gameId = (int)($body['id'] ?? 0);
        $board = (int)($body['board'] ?? 0);
        if (!in_array($kind, ['match', 'pool'], true) || !$gameId) {
            http_response_code(400);
            echo json_encode(['error' => 'kind (match or pool) and id required']);
            return;
        }
        $key = ($kind === 'pool' ? 'p' : 'b') . $gameId;

        $this->db->beginTransaction();
        try {
            $count = $this->lockAndCount($tournamentId);
            if ($count === 0) {
                throw new Exception('Board assignments are off for this tournament');
            }
            $games = $this->games($tournamentId);
            try {
                $moved = BoardQueue::move($count, $games, $key, $board);
            } catch (InvalidArgumentException $e) {
                throw new Exception($e->getMessage());
            }
            $boards = [];
            foreach ($moved as $g) $boards[$g['key']] = $g['board'];
            $this->write($games, $boards);
            // A swap can leave the displaced game waiting while a board is free; fill it.
            $this->reconcile($tournamentId);
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

        writeAuditLog($this->db, $tournamentId, (int)$actor['id'], 'board_moved',
            $kind === 'pool' ? 'pool_match' : 'match', (string)$gameId, ['board' => $board]);
        echo json_encode($this->summary($tournamentId));
    }

    /**
     * What the screens need beyond each game's own board_number: the board count and the
     * up-next order. Null when boards are off. Embedded in GET /matches.
     */
    public function summary(int $tournamentId): ?array {
        $stmt = $this->db->prepare('SELECT boards, board_label FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        $t = $stmt->fetch();
        $count = $t ? (int)$t['boards'] : 0;
        if ($count === 0) return null;
        $label = in_array($t['board_label'] ?? null, self::LABELS, true) ? $t['board_label'] : 'board';

        $games = $this->games($tournamentId);
        $playing = [];
        foreach ($games as $g) {
            if ($g['board'] !== null) $playing[] = ['board' => $g['board'], 'key' => $g['key']];
        }
        usort($playing, fn ($a, $b) => $a['board'] <=> $b['board']);
        return ['count' => $count, 'label' => $label, 'playing' => $playing, 'up_next' => BoardQueue::upNext($games)];
    }

    /**
     * Lock the tournament row so two scores entered at the same moment can't both see the
     * same free board, and return the board count (0 when off or not live).
     */
    private function lockAndCount(int $tournamentId): int {
        // SQLite (the cascade test suite) has no row locks and a single writer anyway.
        $lock = $this->db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
        $stmt = $this->db->prepare('SELECT status, boards FROM tournaments WHERE id = ?' . $lock);
        $stmt->execute([$tournamentId]);
        $t = $stmt->fetch();
        return $t && $t['status'] === 'active' ? (int)$t['boards'] : 0;
    }

    /** Every playable, unplayed game, pool and bracket, in BoardQueue's shape. */
    private function games(int $tournamentId): array {
        $games = [];
        $stmt = $this->db->prepare("
            SELECT id, round, match_number, team1_id, team2_id, board_number FROM pool_matches
            WHERE tournament_id = ? AND status = 'ready'
        ");
        $stmt->execute([$tournamentId]);
        foreach ($stmt->fetchAll() as $r) {
            $games[] = $this->game('p', $r, (int)$r['match_number']);
        }

        // Bracket rounds restart per side in double elimination; within a round, winners
        // games queue ahead of losers games, and the grand final comes last.
        $sideRank = ['winners' => 0, 'losers' => 1, 'grand_final' => 2];
        $stmt = $this->db->prepare("
            SELECT id, round, match_number, bracket_side, team1_id, team2_id, board_number FROM matches
            WHERE tournament_id = ? AND status = 'ready' AND team1_id IS NOT NULL AND team2_id IS NOT NULL
        ");
        $stmt->execute([$tournamentId]);
        foreach ($stmt->fetchAll() as $r) {
            $rank = $sideRank[$r['bracket_side'] ?? 'winners'] ?? 0;
            $games[] = $this->game('b', $r, $rank * 1000 + (int)$r['match_number']);
        }
        return $games;
    }

    private function game(string $prefix, array $r, int $seq): array {
        return [
            'key' => $prefix . (int)$r['id'],
            'team1' => (int)$r['team1_id'],
            'team2' => (int)$r['team2_id'],
            'round' => (int)$r['round'],
            'seq' => $seq,
            'board' => $r['board_number'] === null ? null : (int)$r['board_number'],
        ];
    }

    /** Write only the games whose board changed. */
    private function write(array $games, array $boards): void {
        $match = $this->db->prepare('UPDATE matches SET board_number = ? WHERE id = ?');
        $pool = $this->db->prepare('UPDATE pool_matches SET board_number = ? WHERE id = ?');
        foreach ($games as $g) {
            $new = $boards[$g['key']] ?? null;
            if ($new === $g['board']) continue;
            $stmt = $g['key'][0] === 'p' ? $pool : $match;
            $stmt->execute([$new, (int)substr($g['key'], 1)]);
        }
    }
}
