<?php
// tests/PoolPlayTest.php

use PHPUnit\Framework\TestCase;

/**
 * Covers pool-play scheduling and standings (FEATURE_TRACKER.md item 18).
 *
 * The standings order becomes the bracket's seed order, so a wrong tiebreak quietly hands
 * someone the 1 seed. The scheduling properties are checked exhaustively over field sizes
 * rather than by example, since a rematch only shows up for some sizes.
 */
final class PoolPlayTest extends TestCase
{
    // ------------------------------------------------------------------------ schedule()

    public function testEveryTeamPlaysOncePerRoundWithAnEvenField(): void
    {
        $s = PoolPlay::schedule([1, 2, 3, 4, 5, 6, 7, 8], 3);
        $this->assertCount(3, $s);
        foreach ($s as $pairs) {
            $this->assertCount(4, $pairs);
            $teams = array_merge(...$pairs);
            sort($teams);
            $this->assertSame([1, 2, 3, 4, 5, 6, 7, 8], $teams);
        }
    }

    public function testOneTeamSitsOutEachRoundWithAnOddField(): void
    {
        $s = PoolPlay::schedule([1, 2, 3, 4, 5], 3);
        $sitOuts = [];
        foreach ($s as $pairs) {
            $this->assertCount(2, $pairs);
            $playing = array_merge(...$pairs);
            $missing = array_values(array_diff([1, 2, 3, 4, 5], $playing));
            $this->assertCount(1, $missing);
            $sitOuts[] = $missing[0];
        }
        $this->assertCount(3, array_unique($sitOuts), 'a different team sits out each round');
    }

    public function testNoRematchesAndCorrectGameCountsForEveryFieldSize(): void
    {
        for ($teams = 2; $teams <= 40; $teams++) {
            for ($games = PoolPlay::MIN_GAMES; $games <= PoolPlay::MAX_GAMES; $games++) {
                $ids = range(101, 100 + $teams);
                $s = PoolPlay::schedule($ids, $games);
                $rounds = PoolPlay::roundsFor($teams, $games);
                $this->assertCount($rounds, $s, "$teams teams, $games games");

                $seen = [];
                $played = array_fill_keys($ids, 0);
                foreach ($s as $round => $pairs) {
                    $inRound = [];
                    foreach ($pairs as [$a, $b]) {
                        $this->assertNotSame($a, $b);
                        $key = min($a, $b) . '-' . max($a, $b);
                        $this->assertArrayNotHasKey($key, $seen, "rematch $key with $teams teams");
                        $seen[$key] = true;
                        $this->assertArrayNotHasKey($a, $inRound, "team $a twice in round $round");
                        $this->assertArrayNotHasKey($b, $inRound, "team $b twice in round $round");
                        $inRound[$a] = $inRound[$b] = true;
                        $played[$a]++;
                        $played[$b]++;
                    }
                }
                foreach ($played as $id => $n) {
                    $min = $teams % 2 === 0 ? $rounds : $rounds - 1;
                    $this->assertGreaterThanOrEqual($min, $n, "team $id, $teams teams, $games games");
                    $this->assertLessThanOrEqual($rounds, $n);
                }
            }
        }
    }

    public function testASmallFieldPlaysAFullRoundRobinInsteadOfRepeating(): void
    {
        $this->assertSame(1, PoolPlay::roundsFor(2, 3));
        $this->assertSame(3, PoolPlay::roundsFor(3, 5));
        $this->assertSame(3, PoolPlay::roundsFor(4, 5));
        $this->assertSame(3, PoolPlay::roundsFor(16, 3));
        $this->assertCount(1, PoolPlay::schedule([1, 2], 3));
    }

    public function testRejectsTooFewOrDuplicateTeams(): void
    {
        $this->expectException(InvalidArgumentException::class);
        PoolPlay::schedule([1], 3);
    }

    public function testRejectsDuplicateTeams(): void
    {
        $this->expectException(InvalidArgumentException::class);
        PoolPlay::schedule([1, 2, 2, 3], 3);
    }

    // ------------------------------------------------------------------------ standings()

    private function game(int $t1, int $s1, int $t2, int $s2): array
    {
        return ['team1_id' => $t1, 'team2_id' => $t2, 'team1_score' => $s1, 'team2_score' => $s2];
    }

    private function order(array $standings): array
    {
        return array_column($standings, 'team_id');
    }

    public function testRanksByWins(): void
    {
        $s = PoolPlay::standings([1, 2, 3, 4], [
            $this->game(1, 21, 2, 5), $this->game(3, 21, 4, 19),
            $this->game(1, 21, 3, 10), $this->game(2, 21, 4, 20),
        ], 7);
        $this->assertSame(1, $s[0]['team_id']);
        $this->assertSame(2, $s[0]['wins']);
        $this->assertSame(4, $s[3]['team_id']);
        $this->assertSame([1, 2, 3, 4], array_column($s, 'rank'));
    }

    public function testComputesTheTotals(): void
    {
        $s = PoolPlay::standings([1, 2], [$this->game(1, 21, 2, 15), $this->game(2, 21, 1, 18)], 7);
        $byId = array_column($s, null, 'team_id');
        $this->assertSame(['played' => 2, 'wins' => 1, 'losses' => 1, 'points_for' => 39, 'points_against' => 36, 'point_diff' => 3],
            array_intersect_key($byId[1], array_flip(['played', 'wins', 'losses', 'points_for', 'points_against', 'point_diff'])));
        $this->assertSame(0.5, $byId[1]['win_pct']);
    }

    public function testWinPercentageNotRawWinsSoSittingOutCostsNothing(): void
    {
        // Team 1 is 2-0 having sat out a round; team 2 is 2-1. Team 1 ranks higher.
        $s = PoolPlay::standings([1, 2, 3, 4, 5], [
            $this->game(1, 21, 3, 0), $this->game(1, 21, 4, 0),
            $this->game(2, 21, 3, 0), $this->game(2, 21, 4, 0), $this->game(5, 21, 2, 10),
        ], 7);
        $this->assertSame([1, 5, 2], array_slice($this->order($s), 0, 3));
    }

    public function testPointDifferentialBreaksAWinTie(): void
    {
        $s = PoolPlay::standings([1, 2, 3, 4], [
            $this->game(1, 21, 3, 20), // +1
            $this->game(2, 21, 4, 5),  // +16
        ], 7);
        $this->assertSame([2, 1, 3, 4], $this->order($s));
    }

    public function testPointDifferentialIsPerGame(): void
    {
        // Team 1 is 1-0 at +8 (it sat out); team 2 is 2-0 at +12 total, +6 per game. Both
        // are unbeaten, and per game team 1 has the better differential despite the
        // smaller total.
        $s = PoolPlay::standings([1, 2, 3, 4, 5], [
            $this->game(1, 21, 3, 13),
            $this->game(2, 21, 4, 15), $this->game(2, 21, 5, 15),
        ], 7);
        $this->assertSame([1, 2], array_slice($this->order($s), 0, 2));
    }

    public function testPointsScoredBreaksAPointDifferentialTie(): void
    {
        $s = PoolPlay::standings([1, 2, 3, 4], [
            $this->game(1, 21, 3, 11), // +10, scored 21
            $this->game(2, 15, 4, 5),  // +10, scored 15
        ], 7);
        $this->assertSame([1, 2], array_slice($this->order($s), 0, 2));
    }

    public function testHeadToHeadBreaksATwoWayTie(): void
    {
        // 4 goes 2-0 and 3 goes 0-2. Teams 1 and 2 both finish 1-1, +0, 32 points scored:
        // level on everything but their meeting, which 2 won. Every salt is tried so the
        // test cannot pass by luck of the final draw.
        foreach (range(1, 12) as $salt) {
            $s = PoolPlay::standings([1, 2, 3, 4], [
                $this->game(2, 21, 1, 11),
                $this->game(1, 21, 3, 11),
                $this->game(2, 11, 4, 21),
                $this->game(4, 21, 3, 1),
            ], $salt);
            $this->assertSame([4, 2, 1, 3], $this->order($s), "salt $salt");
        }
    }

    public function testHeadToHeadIsSkippedForAThreeWayTie(): void
    {
        // A beats B, B beats C, C beats A, all by the same margin: head-to-head is circular,
        // so the draw decides, and it must still produce a complete, stable order.
        $games = [$this->game(1, 21, 2, 11), $this->game(2, 21, 3, 11), $this->game(3, 21, 1, 11)];
        $first = $this->order(PoolPlay::standings([1, 2, 3], $games, 5));
        $this->assertEqualsCanonicalizing([1, 2, 3], $first);
        $this->assertSame($first, $this->order(PoolPlay::standings([1, 2, 3], $games, 5)));
    }

    public function testTheFinalDrawIsStableForATournamentButVariesAcrossThem(): void
    {
        $ids = range(1, 12);
        $first = $this->order(PoolPlay::standings($ids, [], 42));
        $this->assertSame($first, $this->order(PoolPlay::standings($ids, [], 42)));
        $this->assertSame($first, $this->order(PoolPlay::standings(array_reverse($ids), [], 42)), 'independent of input order');

        $orders = [];
        foreach (range(1, 20) as $salt) {
            $orders[implode(',', $this->order(PoolPlay::standings($ids, [], $salt)))] = true;
        }
        $this->assertGreaterThan(10, count($orders));
        $this->assertNotSame($ids, $first, 'not simply team-id order');
    }

    public function testTeamsWithNoGamesSortWithTheWinless(): void
    {
        // 3 has not played; 2 lost by 21. Both are winless, and 3's 0 per game beats -21.
        $s = PoolPlay::standings([1, 2, 3], [$this->game(1, 21, 2, 0)], 7);
        $this->assertSame([1, 3, 2], $this->order($s));
    }

    public function testIgnoresTiedAndForeignResults(): void
    {
        $s = PoolPlay::standings([1, 2], [$this->game(1, 10, 2, 10), $this->game(1, 21, 99, 0)], 7);
        $this->assertSame([0, 0], array_column($s, 'played'));
    }
}
