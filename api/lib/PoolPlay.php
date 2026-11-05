<?php
// api/lib/PoolPlay.php

/**
 * Pool play: a few games for every team before the bracket, whose standings become the
 * bracket's seeds (FEATURE_TRACKER.md item 18).
 *
 * Pure: team ids and scores in, schedules and standings out. Persisting them is
 * PoolController's job. Both halves decide who ends up as the 1 seed, and a mistake in
 * either is silent — a rematch nobody notices, a tiebreak applied backwards — so they live
 * here, where they can be tested without a database.
 *
 * Targets PHP 8.1+, as does the rest of `api/` (see AGENTS.md).
 */
final class PoolPlay
{
    const MIN_GAMES = 2;
    const MAX_GAMES = 5;
    const DEFAULT_GAMES = 3;

    /**
     * Pool rounds for $teamIds: every team plays at most once per round, and no pairing is
     * ever repeated.
     *
     * This is a round robin across the whole field (the circle method: fix one team, rotate
     * the rest one place per round), stopped after $games rounds. Stopping a round robin
     * early is what guarantees no rematches without any bookkeeping.
     *
     * With an odd number of teams, one team sits out each round, so across a short pool some
     * teams play one game fewer than others. Standings rank by win percentage for exactly
     * that reason.
     *
     * A field too small for $games distinct rounds plays every distinct round it has (a
     * full round robin) rather than repeating a pairing; roundsFor() says how many that is.
     *
     * @param int[] $teamIds In the order to schedule them. The caller passes them in draw
     *                       order, which for a blind draw is already random.
     * @return array<int, array<int, array{0: int, 1: int}>> Round number (1-based) => list
     *         of [team1Id, team2Id] pairs. Teams sitting out are simply absent.
     */
    public static function schedule(array $teamIds, int $games): array
    {
        $teamIds = array_values(array_map('intval', $teamIds));
        if (count($teamIds) < 2) {
            throw new InvalidArgumentException('Pool play needs at least 2 teams');
        }
        if (count(array_unique($teamIds)) !== count($teamIds)) {
            throw new InvalidArgumentException('Team ids must be unique');
        }

        $ring = $teamIds;
        if (count($ring) % 2 === 1) {
            $ring[] = null; // the bye slot: whoever is paired with it sits the round out
        }
        $n = count($ring);
        $rounds = self::roundsFor(count($teamIds), $games);

        $schedule = [];
        for ($r = 1; $r <= $rounds; $r++) {
            $pairs = [];
            for ($i = 0; $i < $n / 2; $i++) {
                $a = $ring[$i];
                $b = $ring[$n - 1 - $i];
                if ($a === null || $b === null) continue;
                $pairs[] = [$a, $b];
            }
            $schedule[$r] = $pairs;

            // Rotate everything but the first slot one place clockwise.
            $last = array_pop($ring);
            array_splice($ring, 1, 0, [$last]);
        }
        return $schedule;
    }

    /** How many pool rounds $teamCount teams can play without a rematch, capped at $games. */
    public static function roundsFor(int $teamCount, int $games): int
    {
        $distinct = $teamCount % 2 === 0 ? $teamCount - 1 : $teamCount;
        return max(0, min($games, $distinct));
    }

    /**
     * Rank teams by their pool results. The returned order *is* the seed order.
     *
     * Ranked by win percentage, so a team that sat out a round is neither helped nor hurt
     * by it. Teams level on win percentage are separated by, in order:
     *
     *  1. point differential per game played,
     *  2. points scored per game played,
     *  3. head-to-head, only when exactly two teams are still level and they met,
     *  4. a draw that is random across tournaments but stable within one, so standings do
     *     not reshuffle every time they are read.
     *
     * Per game rather than totals so that sitting out a round does not cost a team points it
     * never had the chance to score. When everyone has played the same number of games the
     * two orders are identical.
     *
     * A team with no games yet has a win percentage of 0 and sorts with the winless teams.
     *
     * @param int[] $teamIds
     * @param array $results Completed games: each ['team1_id', 'team2_id', 'team1_score',
     *                       'team2_score']. Ties are not possible (score entry refuses them)
     *                       and a tied row is ignored rather than guessed at.
     * @param int   $salt    Seeds the final random draw. Pass the tournament id.
     * @return array List of rows in rank order: team_id, rank (1-based), played, wins,
     *               losses, points_for, points_against, point_diff, win_pct.
     */
    public static function standings(array $teamIds, array $results, int $salt): array
    {
        $rows = [];
        foreach ($teamIds as $id) {
            $id = (int)$id;
            $rows[$id] = [
                'team_id' => $id, 'played' => 0, 'wins' => 0, 'losses' => 0,
                'points_for' => 0, 'points_against' => 0,
            ];
        }

        // Who beat whom, for the head-to-head step. Keyed "winner:loser".
        $beat = [];
        foreach ($results as $g) {
            $t1 = (int)$g['team1_id'];
            $t2 = (int)$g['team2_id'];
            $s1 = (int)$g['team1_score'];
            $s2 = (int)$g['team2_score'];
            if (!isset($rows[$t1], $rows[$t2]) || $s1 === $s2) continue;

            foreach ([[$t1, $s1, $s2], [$t2, $s2, $s1]] as [$team, $for, $against]) {
                $rows[$team]['played']++;
                $rows[$team]['points_for'] += $for;
                $rows[$team]['points_against'] += $against;
                $rows[$team][$for > $against ? 'wins' : 'losses']++;
            }
            $beat[$s1 > $s2 ? "$t1:$t2" : "$t2:$t1"] = true;
        }

        foreach ($rows as &$row) {
            $p = $row['played'];
            $row['point_diff'] = $row['points_for'] - $row['points_against'];
            $row['win_pct'] = $p ? $row['wins'] / $p : 0.0;
            $row['_diff_pg'] = $p ? $row['point_diff'] / $p : 0.0;
            $row['_for_pg'] = $p ? $row['points_for'] / $p : 0.0;
            $row['_draw'] = crc32($salt . ':' . $row['team_id']);
        }
        unset($row);

        $rows = array_values($rows);

        // Steps 1-2 (and win percentage before them) are plain comparisons, so sort on them
        // first, then settle each remaining level group with head-to-head and the draw.
        usort($rows, fn($a, $b) => self::compareStats($a, $b));

        $ordered = [];
        $i = 0;
        $count = count($rows);
        while ($i < $count) {
            $group = [$rows[$i]];
            while ($i + count($group) < $count && self::compareStats($rows[$i], $rows[$i + count($group)]) === 0) {
                $group[] = $rows[$i + count($group)];
            }
            $i += count($group);

            usort($group, fn($a, $b) => $b['_draw'] <=> $a['_draw'] ?: $a['team_id'] <=> $b['team_id']);
            if (count($group) === 2) {
                [$x, $y] = $group;
                if (isset($beat["{$y['team_id']}:{$x['team_id']}"])) {
                    $group = [$y, $x];
                }
            }
            foreach ($group as $row) $ordered[] = $row;
        }

        $out = [];
        foreach ($ordered as $n => $row) {
            unset($row['_diff_pg'], $row['_for_pg'], $row['_draw']);
            $row['rank'] = $n + 1;
            $row['win_pct'] = round($row['win_pct'], 3);
            $out[] = $row;
        }
        return $out;
    }

    private static function compareStats(array $a, array $b): int
    {
        // Floats compared with a tolerance: 2/3 and 4/6 must count as level.
        foreach (['win_pct', '_diff_pg', '_for_pg'] as $key) {
            if (abs($a[$key] - $b[$key]) > 1e-9) {
                return $b[$key] <=> $a[$key];
            }
        }
        return 0;
    }
}
