<?php
// api/lib/BoardQueue.php

/**
 * Board assignment (FEATURE_TRACKER.md item 8): which game is on which board, and what is
 * up next. Pure, so the rules that decide who walks to which board are tested without a
 * database (tests/BoardQueueTest.php); BoardController only reads and writes rows.
 *
 * A "game" here is any playable, unplayed game, pool or bracket alike:
 *
 *   ['key' => 'b12', 'team1' => 5, 'team2' => 9, 'round' => 2, 'seq' => 3, 'board' => null]
 *
 * `round` and `seq` order the queue (earliest round first, then seq). `board` is the board
 * the game holds now, or null while it waits.
 *
 * The rules:
 *   - A game that already holds a board keeps it. Nobody gets moved mid-game because a
 *     score came in somewhere else.
 *   - A free board goes to the first waiting game in queue order whose teams are both free.
 *   - A team never holds two boards, and never plays a later round before an earlier one.
 *     (Only pool play has several unplayed games per team; in a bracket each team has at
 *     most one, so that rule never bites there.)
 */
final class BoardQueue
{
    public const MAX_BOARDS = 24;

    /**
     * Fill free boards from the queue.
     *
     * @param int   $boards How many boards the venue has; boards are numbered 1..$boards.
     * @param array $games  Every playable, unplayed game, in any order.
     * @return array<string, ?int> Game key => board, for every game given.
     */
    public static function assign(int $boards, array $games): array
    {
        $games = self::sorted($games);
        $result = [];
        $usedBoards = [];
        $busy = [];

        // Keep what is already on a board, as long as the board still exists. A duplicate
        // (two games on one board, which only a race could cause) keeps the earlier game.
        foreach ($games as $g) {
            $board = $g['board'] ?? null;
            if ($board !== null && $board >= 1 && $board <= $boards
                && !isset($usedBoards[$board])
                && !isset($busy[$g['team1']]) && !isset($busy[$g['team2']])) {
                $usedBoards[$board] = true;
                $busy[$g['team1']] = true;
                $busy[$g['team2']] = true;
                $result[$g['key']] = $board;
            } else {
                $result[$g['key']] = null;
            }
        }

        $free = [];
        for ($b = 1; $b <= $boards; $b++) {
            if (!isset($usedBoards[$b])) $free[] = $b;
        }

        $earliest = self::earliestWaitingRound($games, $result);
        foreach ($games as $g) {
            if (!$free) break;
            if ($result[$g['key']] !== null) continue;
            if (isset($busy[$g['team1']]) || isset($busy[$g['team2']])) continue;
            if (!self::isTeamsTurn($g, $earliest)) continue;

            $result[$g['key']] = array_shift($free);
            $busy[$g['team1']] = true;
            $busy[$g['team2']] = true;
        }

        return $result;
    }

    /**
     * The waiting games that are next in line, in the order they will get a board: games
     * whose teams are both free first (they take the next board that opens), then games
     * waiting on a team that is still playing. Later-round pool games that a team cannot
     * play yet are left out; they appear once that team's earlier game is done.
     *
     * @param array $games Games with `board` already set by assign().
     * @return string[] Game keys.
     */
    public static function upNext(array $games): array
    {
        $games = self::sorted($games);
        $boards = [];
        $busy = [];
        foreach ($games as $g) {
            $boards[$g['key']] = $g['board'] ?? null;
            if ($boards[$g['key']] !== null) {
                $busy[$g['team1']] = true;
                $busy[$g['team2']] = true;
            }
        }
        $earliest = self::earliestWaitingRound($games, $boards);

        $ready = [];
        $blocked = [];
        foreach ($games as $g) {
            if ($boards[$g['key']] !== null || !self::isTeamsTurn($g, $earliest)) continue;
            if (isset($busy[$g['team1']]) || isset($busy[$g['team2']])) {
                $blocked[] = $g['key'];
            } else {
                $ready[] = $g['key'];
            }
        }
        return array_merge($ready, $blocked);
    }

    /**
     * Staff moving a game to a board by hand: a broken board, a team that walked off, or
     * just running the room their own way. If another game holds that board the two swap,
     * so the displaced game takes the moved game's old board, or goes back to waiting.
     *
     * @return array The games with `board` updated.
     * @throws InvalidArgumentException When the board does not exist, the game is unknown,
     *         or the move would put a team on two boards at once.
     */
    public static function move(int $boards, array $games, string $key, int $board): array
    {
        if ($board < 1 || $board > $boards) {
            throw new InvalidArgumentException("Board {$board} does not exist");
        }
        $index = null;
        $occupant = null;
        foreach ($games as $i => $g) {
            if ($g['key'] === $key) $index = $i;
            elseif (($g['board'] ?? null) === $board) $occupant = $i;
        }
        if ($index === null) {
            throw new InvalidArgumentException('That game is not waiting or being played');
        }

        $moving = $games[$index];
        $from = $moving['board'] ?? null;
        if ($from === $board) return $games;

        // Neither team may already be playing elsewhere, other than in the game being
        // swapped out (whose teams are about to leave this board anyway).
        foreach ($games as $i => $g) {
            if ($i === $index || $i === $occupant || ($g['board'] ?? null) === null) continue;
            $teams = [$g['team1'], $g['team2']];
            if (in_array($moving['team1'], $teams, true) || in_array($moving['team2'], $teams, true)) {
                throw new InvalidArgumentException('One of those teams is already playing on another board');
            }
        }
        // No such check is needed for the occupant: it was on a board, so its teams were
        // playing nowhere else, and it only trades boards with the game it swaps with.
        $games[$index]['board'] = $board;
        if ($occupant !== null) $games[$occupant]['board'] = $from;
        return $games;
    }

    /** Queue order: earliest round, then seq, then key so the order is total. */
    private static function sorted(array $games): array
    {
        $games = array_values($games);
        usort($games, function (array $a, array $b): int {
            return [$a['round'], $a['seq'], $a['key']] <=> [$b['round'], $b['seq'], $b['key']];
        });
        return $games;
    }

    /**
     * Each team's earliest round among its *waiting* games. A game on a board makes its
     * teams busy instead, which blocks them just as well, so only waiting games count.
     */
    private static function earliestWaitingRound(array $games, array $boards): array
    {
        $earliest = [];
        foreach ($games as $g) {
            if ($boards[$g['key']] !== null) continue;
            foreach ([$g['team1'], $g['team2']] as $team) {
                if (!isset($earliest[$team]) || $g['round'] < $earliest[$team]) {
                    $earliest[$team] = $g['round'];
                }
            }
        }
        return $earliest;
    }

    private static function isTeamsTurn(array $g, array $earliest): bool
    {
        return $g['round'] === ($earliest[$g['team1']] ?? $g['round'])
            && $g['round'] === ($earliest[$g['team2']] ?? $g['round']);
    }
}
