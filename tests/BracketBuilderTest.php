<?php
// tests/BracketBuilderTest.php

use PHPUnit\Framework\TestCase;

/**
 * Characterisation + invariant tests for the single-elimination bracket builder.
 *
 * These lock in today's behaviour before double elimination (FEATURE_TRACKER.md item 16)
 * adds a second forward edge per match. The point is that any red here during that work
 * means the new code broke the existing format, not that the test is out of date.
 *
 * The largest field is 64 teams — the current paid-tier participant cap is 256
 * participants, i.e. 128 teams, but 64 already exercises every structural case (7 rounds,
 * byes at every offset) and keeps the suite instant.
 */
final class BracketBuilderTest extends TestCase
{
    /** Team ids are offset from seeds so an id/seed mix-up cannot pass silently. */
    private const TEAM_ID_BASE = 100;

    private function seeds(int $numTeams): array
    {
        $map = [];
        for ($seed = 1; $seed <= $numTeams; $seed++) {
            $map[$seed] = self::TEAM_ID_BASE + $seed;
        }
        return $map;
    }

    private function bracketSizeFor(int $numTeams): int
    {
        $size = 1;
        while ($size < $numTeams) {
            $size *= 2;
        }
        return $size;
    }

    // ---------------------------------------------------------------- input validation

    public function testRejectsFewerThanTwoTeams(): void
    {
        $this->expectException(InvalidArgumentException::class);
        BracketBuilder::singleElimination($this->seeds(1));
    }

    public function testRejectsEmptyField(): void
    {
        $this->expectException(InvalidArgumentException::class);
        BracketBuilder::singleElimination([]);
    }

    public function testRejectsGappedSeeds(): void
    {
        // Seed 3 missing. Treated as an implicit bye by the old code, which silently
        // reshuffled the draw instead of shrinking the field.
        $gapped = [1 => 101, 2 => 102, 4 => 104];

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/contiguous/');
        BracketBuilder::singleElimination($gapped);
    }

    public function testRejectsSeedsNotStartingAtOne(): void
    {
        $this->expectException(InvalidArgumentException::class);
        BracketBuilder::singleElimination([2 => 102, 3 => 103]);
    }

    // ------------------------------------------------------------------- known layouts

    public function testTwoTeamsProduceASinglePlayableFinal(): void
    {
        $matches = BracketBuilder::singleElimination($this->seeds(2));

        $this->assertCount(1, $matches);
        $this->assertSame(1, $matches[0]['round']);
        $this->assertSame(101, $matches[0]['team1_id']);
        $this->assertSame(102, $matches[0]['team2_id']);
        $this->assertSame(BracketBuilder::STATUS_READY, $matches[0]['status']);
        $this->assertNull($matches[0]['winner_id']);
        $this->assertNull($matches[0]['next_match']);
    }

    public function testEightTeamFirstRoundUsesStandardSeedPairings(): void
    {
        $matches = BracketBuilder::singleElimination($this->seeds(8));
        $firstRound = array_values(array_filter($matches, function (array $m): bool {
            return $m['round'] === 1;
        }));

        // Standard bracket: 1v8, 4v5, 2v7, 3v6 — top seeds in opposite halves.
        $expected = [[1, 8], [4, 5], [2, 7], [3, 6]];
        foreach ($expected as $i => $pair) {
            $this->assertSame(
                [self::TEAM_ID_BASE + $pair[0], self::TEAM_ID_BASE + $pair[1]],
                [$firstRound[$i]['team1_id'], $firstRound[$i]['team2_id']],
                'Round 1 match ' . ($i + 1) . ' pairing'
            );
            $this->assertSame($i + 1, $firstRound[$i]['match_number']);
        }
    }

    public function testFiveTeamsGiveTheTopThreeSeedsByes(): void
    {
        $matches = BracketBuilder::singleElimination($this->seeds(5));

        // 5 teams round up to an 8 bracket, so 3 positions are empty.
        $byes = array_values(array_filter($matches, function (array $m): bool {
            return $m['status'] === BracketBuilder::STATUS_BYE;
        }));
        $this->assertCount(3, $byes);

        $byeWinners = array_map(function (array $m): int {
            return $m['winner_id'];
        }, $byes);
        sort($byeWinners);
        $this->assertSame([101, 102, 103], $byeWinners, 'Byes should fall to the top seeds');

        // The one real first-round game is 4v5.
        $ready = array_values(array_filter($matches, function (array $m): bool {
            return $m['round'] === 1 && $m['status'] === BracketBuilder::STATUS_READY;
        }));
        $this->assertCount(1, $ready);
        $this->assertSame([104, 105], [$ready[0]['team1_id'], $ready[0]['team2_id']]);
    }

    public function testByeWinnersAreAdvancedIntoTheNextRound(): void
    {
        $matches = BracketBuilder::singleElimination($this->seeds(5));

        foreach ($matches as $match) {
            if ($match['status'] !== BracketBuilder::STATUS_BYE) {
                continue;
            }
            $next = $matches[$match['next_match']];
            $slot = $match['next_match_slot'] === 1 ? 'team1_id' : 'team2_id';
            $this->assertSame(
                $match['winner_id'],
                $next[$slot],
                'A bye winner must already occupy its next-round slot'
            );
        }
    }

    public function testTheTwoByeWinnersMeetingInRoundTwoMakeThatMatchReady(): void
    {
        // Seeds 2 and 3 both get byes and converge on the same semifinal, which is
        // therefore immediately playable rather than pending.
        $matches = BracketBuilder::singleElimination($this->seeds(5));

        $roundTwoReady = array_values(array_filter($matches, function (array $m): bool {
            return $m['round'] === 2 && $m['status'] === BracketBuilder::STATUS_READY;
        }));

        $this->assertCount(1, $roundTwoReady);
        $this->assertSame([102, 103], [$roundTwoReady[0]['team1_id'], $roundTwoReady[0]['team2_id']]);
    }

    public function testDeterministic(): void
    {
        $this->assertSame(
            BracketBuilder::singleElimination($this->seeds(11)),
            BracketBuilder::singleElimination($this->seeds(11))
        );
    }

    // ------------------------------------------------------ structural invariants, 2..64

    public function testMatchCountIsBracketSizeMinusOne(): void
    {
        for ($numTeams = 2; $numTeams <= 64; $numTeams++) {
            $matches = BracketBuilder::singleElimination($this->seeds($numTeams));
            $this->assertCount(
                $this->bracketSizeFor($numTeams) - 1,
                $matches,
                "Match count for {$numTeams} teams"
            );
        }
    }

    public function testExactlyOneFinalAndItIsPlayable(): void
    {
        for ($numTeams = 2; $numTeams <= 64; $numTeams++) {
            $matches = BracketBuilder::singleElimination($this->seeds($numTeams));

            $finals = array_values(array_filter($matches, function (array $m): bool {
                return $m['next_match'] === null;
            }));

            $this->assertCount(1, $finals, "Exactly one final for {$numTeams} teams");
            $this->assertNotSame(
                BracketBuilder::STATUS_BYE,
                $finals[0]['status'],
                "The final must be played, not walked over ({$numTeams} teams)"
            );
            $this->assertNull($finals[0]['winner_id'], "No pre-declared champion ({$numTeams} teams)");
        }
    }

    public function testNoMatchIsEverCompletelyEmpty(): void
    {
        for ($numTeams = 2; $numTeams <= 64; $numTeams++) {
            $matches = BracketBuilder::singleElimination($this->seeds($numTeams));

            foreach ($matches as $i => $match) {
                if ($match['round'] !== 1) {
                    continue;
                }
                $this->assertNotNull(
                    $match['team1_id'] ?? $match['team2_id'],
                    "Round 1 match {$i} has no entrant at all ({$numTeams} teams)"
                );
            }
        }
    }

    public function testEveryTeamAppearsExactlyOnceInRoundOne(): void
    {
        for ($numTeams = 2; $numTeams <= 64; $numTeams++) {
            $matches = BracketBuilder::singleElimination($this->seeds($numTeams));

            $seen = [];
            foreach ($matches as $match) {
                if ($match['round'] !== 1) {
                    continue;
                }
                foreach ([$match['team1_id'], $match['team2_id']] as $teamId) {
                    if ($teamId !== null) {
                        $seen[] = $teamId;
                    }
                }
            }

            sort($seen);
            $this->assertSame(
                array_values($this->seeds($numTeams)),
                $seen,
                "Every team entered exactly once for {$numTeams} teams"
            );
        }
    }

    public function testForwardPointersAlwaysAdvanceExactlyOneRound(): void
    {
        for ($numTeams = 2; $numTeams <= 64; $numTeams++) {
            $matches = BracketBuilder::singleElimination($this->seeds($numTeams));

            foreach ($matches as $i => $match) {
                if ($match['next_match'] === null) {
                    $this->assertNull($match['next_match_slot']);
                    continue;
                }

                $this->assertGreaterThan(
                    $i,
                    $match['next_match'],
                    "Match {$i} must feed a later array index ({$numTeams} teams)"
                );
                $this->assertSame(
                    $match['round'] + 1,
                    $matches[$match['next_match']]['round'],
                    "Match {$i} must feed the very next round ({$numTeams} teams)"
                );
                $this->assertContains($match['next_match_slot'], [1, 2]);
            }
        }
    }

    public function testEachMatchIsFedByExactlyTwoEarlierMatches(): void
    {
        for ($numTeams = 2; $numTeams <= 64; $numTeams++) {
            $matches = BracketBuilder::singleElimination($this->seeds($numTeams));

            $feederCount = [];
            $slotsTaken = [];
            foreach ($matches as $match) {
                if ($match['next_match'] === null) {
                    continue;
                }
                $target = $match['next_match'];
                $feederCount[$target] = ($feederCount[$target] ?? 0) + 1;
                $slotsTaken[$target][] = $match['next_match_slot'];
            }

            foreach ($matches as $i => $match) {
                if ($match['round'] === 1) {
                    $this->assertArrayNotHasKey($i, $feederCount, "Round 1 match {$i} must have no feeders");
                    continue;
                }
                $this->assertSame(2, $feederCount[$i] ?? 0, "Match {$i} feeder count ({$numTeams} teams)");

                $slots = $slotsTaken[$i];
                sort($slots);
                $this->assertSame([1, 2], $slots, "Match {$i} feeders must claim distinct slots");
            }
        }
    }

    public function testTopTwoSeedsCanOnlyMeetInTheFinal(): void
    {
        for ($numTeams = 4; $numTeams <= 64; $numTeams++) {
            $matches = BracketBuilder::singleElimination($this->seeds($numTeams));

            $pathOne = $this->pathToFinal($matches, $this->firstRoundIndexOf($matches, 101));
            $pathTwo = $this->pathToFinal($matches, $this->firstRoundIndexOf($matches, 102));

            $shared = array_values(array_intersect($pathOne, $pathTwo));
            $this->assertCount(
                1,
                $shared,
                "Seeds 1 and 2 share more than the final for {$numTeams} teams"
            );
            $this->assertNull(
                $matches[$shared[0]]['next_match'],
                "The one shared match must be the final ({$numTeams} teams)"
            );
        }
    }

    // ------------------------------------------------------------------- full play-out

    public function testPlayingEveryBracketToCompletionYieldsOneChampion(): void
    {
        for ($numTeams = 2; $numTeams <= 64; $numTeams++) {
            $matches = BracketBuilder::singleElimination($this->seeds($numTeams));

            $gamesPlayed = 0;
            $losers = [];
            $champion = null;

            // Matches are ordered feeders-first, so a single forward pass is a valid
            // simulation: both entrants are always resolved by the time we reach a match.
            foreach ($matches as $i => $match) {
                $match = $matches[$i];

                if ($match['status'] === BracketBuilder::STATUS_BYE) {
                    $winnerId = $match['winner_id'];
                } else {
                    $this->assertNotNull(
                        $match['team1_id'],
                        "Match {$i} slot 1 unresolved when reached ({$numTeams} teams)"
                    );
                    $this->assertNotNull(
                        $match['team2_id'],
                        "Match {$i} slot 2 unresolved when reached ({$numTeams} teams)"
                    );

                    // Better seed wins, which for our id scheme is the lower team id.
                    $winnerId = min($match['team1_id'], $match['team2_id']);
                    $losers[] = max($match['team1_id'], $match['team2_id']);
                    $gamesPlayed++;
                    $matches[$i]['winner_id'] = $winnerId;
                }

                if ($match['next_match'] === null) {
                    $champion = $winnerId;
                    continue;
                }

                $slot = $match['next_match_slot'] === 1 ? 'team1_id' : 'team2_id';
                $matches[$match['next_match']][$slot] = $winnerId;
            }

            // Every game eliminates exactly one team, so N teams need exactly N-1 games —
            // byes are not games and must not inflate the count.
            $this->assertSame($numTeams - 1, $gamesPlayed, "Games played for {$numTeams} teams");
            $this->assertSame(
                $numTeams - 1,
                count(array_unique($losers)),
                "Each team may be eliminated at most once ({$numTeams} teams)"
            );
            $this->assertNotNull($champion, "No champion for {$numTeams} teams");
            $this->assertNotContains($champion, $losers, "Champion was also eliminated ({$numTeams} teams)");

            // Top seed always wins under a better-seed-always-wins simulation.
            $this->assertSame(101, $champion, "Seed 1 should win a chalk bracket ({$numTeams} teams)");
        }
    }

    // ------------------------------------------------------------------------- helpers

    private function firstRoundIndexOf(array $matches, int $teamId): int
    {
        foreach ($matches as $i => $match) {
            if ($match['round'] === 1 && ($match['team1_id'] === $teamId || $match['team2_id'] === $teamId)) {
                return $i;
            }
        }
        $this->fail('Team ' . $teamId . ' is not in the first round');
    }

    /** Indexes of every match on the path from $index to the final, inclusive. */
    private function pathToFinal(array $matches, int $index): array
    {
        $path = [];
        while ($index !== null) {
            $path[] = $index;
            $index = $matches[$index]['next_match'];
        }
        return $path;
    }
}
