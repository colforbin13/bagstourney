<?php
// tests/BracketDoubleEliminationTest.php

use PHPUnit\Framework\TestCase;

/**
 * Invariant tests for double-elimination bracket construction.
 *
 * The suite leans on playing brackets out rather than asserting shapes, because the
 * properties that actually matter are behavioural: every eliminated team took exactly two
 * losses, exactly one champion emerges, and the reset match happens when — and only when —
 * the losers-bracket side wins the grand final.
 *
 * Fields run 2..48 teams. That covers every structural case (2-team degenerate with no
 * losers bracket, powers of two with no byes, and every bye count in between) while
 * keeping the suite instant.
 */
final class BracketDoubleEliminationTest extends TestCase
{
    private const TEAM_ID_BASE = 100;
    private const MAX_FIELD = 48;

    private function seeds(int $numTeams): array
    {
        $map = [];
        for ($seed = 1; $seed <= $numTeams; $seed++) {
            $map[$seed] = self::TEAM_ID_BASE + $seed;
        }
        return $map;
    }

    /** Lower team id wins — i.e. the better seed always advances. */
    private function chalk(): callable
    {
        return function (array $match): int {
            return min($match['team1_id'], $match['team2_id']);
        };
    }

    /**
     * Chalk everywhere except the grand final, which the losers-bracket side steals. That
     * is the only way to force the reset match to be played.
     */
    private function upsetInGrandFinal(): callable
    {
        return function (array $match): int {
            if ($match['bracket_side'] === BracketBuilder::SIDE_GRAND_FINAL && !$match['is_reset']) {
                return $match['team2_id'];
            }
            return min($match['team1_id'], $match['team2_id']);
        };
    }

    /**
     * Play a whole bracket in one forward pass and report what happened.
     *
     * @return array{champion: int, games: int, losses: array<int,int>, played: array<int,bool>}
     */
    private function playOut(array $matches, callable $pickWinner): array
    {
        $losses = [];
        $games = 0;
        $champion = null;
        $played = [];
        $skipped = [];

        foreach ($matches as $i => $ignored) {
            if (isset($skipped[$i])) {
                continue;
            }
            $match = $matches[$i];

            if ($match['status'] === BracketBuilder::STATUS_BYE) {
                $winnerId = $match['winner_id'];
                $loserId = null;
            } else {
                $this->assertNotNull($match['team1_id'], "Match {$i} slot 1 unresolved when reached");
                $this->assertNotNull($match['team2_id'], "Match {$i} slot 2 unresolved when reached");

                $winnerId = $pickWinner($match);
                $loserId = $winnerId === $match['team1_id'] ? $match['team2_id'] : $match['team1_id'];
                $losses[$loserId] = ($losses[$loserId] ?? 0) + 1;
                $games++;
                $played[$i] = true;
            }
            $matches[$i]['winner_id'] = $winnerId;

            $isGrandFinal = $match['bracket_side'] === BracketBuilder::SIDE_GRAND_FINAL;

            if ($isGrandFinal && $match['is_reset']) {
                $champion = $winnerId;
                continue;
            }

            if ($isGrandFinal && $winnerId === $match['team1_id']) {
                // The winners-bracket side won, so both of the loser's losses are in and the
                // reset is moot. Nothing carries into it.
                $champion = $winnerId;
                if ($match['next_match'] !== null) {
                    $skipped[$match['next_match']] = true;
                }
                continue;
            }

            if ($match['next_match'] !== null) {
                $slot = $match['next_match_slot'] === 1 ? 'team1_id' : 'team2_id';
                $matches[$match['next_match']][$slot] = $winnerId;
            }
            if ($match['loser_match'] !== null && $loserId !== null) {
                $slot = $match['loser_match_slot'] === 1 ? 'team1_id' : 'team2_id';
                $matches[$match['loser_match']][$slot] = $loserId;
            }
        }

        return ['champion' => $champion, 'games' => $games, 'losses' => $losses, 'played' => $played];
    }

    // ------------------------------------------------------------------ input validation

    public function testRejectsFewerThanTwoTeams(): void
    {
        $this->expectException(InvalidArgumentException::class);
        BracketBuilder::doubleElimination($this->seeds(1));
    }

    public function testRejectsGappedSeeds(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/contiguous/');
        BracketBuilder::doubleElimination([1 => 101, 2 => 102, 4 => 104]);
    }

    // ------------------------------------------------------------------- known layouts

    public function testTwoTeamFieldHasNoLosersBracket(): void
    {
        // The only loss drops straight into the grand final, which is a rematch.
        $matches = BracketBuilder::doubleElimination($this->seeds(2));

        $this->assertCount(3, $matches);
        $this->assertSame(BracketBuilder::SIDE_WINNERS, $matches[0]['bracket_side']);
        $this->assertSame(BracketBuilder::SIDE_GRAND_FINAL, $matches[1]['bracket_side']);
        $this->assertTrue($matches[2]['is_reset']);

        // Both edges of the opening match land in the grand final: winner slot 1, loser slot 2.
        $this->assertSame([1, 1], [$matches[0]['next_match'], $matches[0]['next_match_slot']]);
        $this->assertSame([1, 2], [$matches[0]['loser_match'], $matches[0]['loser_match_slot']]);
    }

    public function testFourTeamFieldHasTheTextbookSevenMatches(): void
    {
        $matches = BracketBuilder::doubleElimination($this->seeds(4));

        // 2B-1 for B=4: three winners, two losers, grand final, reset.
        $this->assertCount(7, $matches);
        $this->assertSame(3, $this->countSide($matches, BracketBuilder::SIDE_WINNERS));
        $this->assertSame(2, $this->countSide($matches, BracketBuilder::SIDE_LOSERS));
        $this->assertSame(2, $this->countSide($matches, BracketBuilder::SIDE_GRAND_FINAL));
    }

    public function testMajorLosersRoundTakesItsDropsInReverseOrder(): void
    {
        // With a full 8-team field nothing collapses, so losers-round numbering is the raw
        // structural numbering and the crossing is directly observable. Without it, the
        // loser of winners match i would drop onto the survivor of the very losers match
        // that its own two feeders fell into.
        $matches = BracketBuilder::doubleElimination($this->seeds(8));

        $drops = [];
        foreach ($matches as $match) {
            if ($match['bracket_side'] !== BracketBuilder::SIDE_WINNERS || $match['round'] !== 2) {
                continue;
            }
            $target = $matches[$match['loser_match']];
            $this->assertSame(BracketBuilder::SIDE_LOSERS, $target['bracket_side']);
            $this->assertSame(2, $target['round'], 'Winners round 2 drops into the first major losers round');
            $drops[$match['match_number']] = $target['match_number'];
        }

        $this->assertSame([1 => 2, 2 => 1], $drops);
    }

    public function testByesOccurOnlyInTheFirstWinnersRound(): void
    {
        // A winners round-1 bye has no loser to drop, and every later winners match is a
        // real game, so the losers bracket never contains a walkover.
        for ($numTeams = 2; $numTeams <= self::MAX_FIELD; $numTeams++) {
            foreach (BracketBuilder::doubleElimination($this->seeds($numTeams)) as $i => $match) {
                if ($match['status'] !== BracketBuilder::STATUS_BYE) {
                    continue;
                }
                $this->assertSame(BracketBuilder::SIDE_WINNERS, $match['bracket_side'], "match {$i}, {$numTeams} teams");
                $this->assertSame(1, $match['round'], "match {$i}, {$numTeams} teams");
            }
        }
    }

    // ------------------------------------------------------ structural invariants, 2..48

    public function testExactlyOneGrandFinalAndOneReset(): void
    {
        for ($numTeams = 2; $numTeams <= self::MAX_FIELD; $numTeams++) {
            $matches = BracketBuilder::doubleElimination($this->seeds($numTeams));

            $grandFinals = 0;
            $resets = 0;
            foreach ($matches as $match) {
                if ($match['bracket_side'] !== BracketBuilder::SIDE_GRAND_FINAL) {
                    continue;
                }
                if ($match['is_reset']) {
                    $resets++;
                } else {
                    $grandFinals++;
                }
            }

            $this->assertSame(1, $grandFinals, "grand finals for {$numTeams} teams");
            $this->assertSame(1, $resets, "reset matches for {$numTeams} teams");
        }
    }

    public function testWinnersBracketIsAFullSingleEliminationTree(): void
    {
        for ($numTeams = 2; $numTeams <= self::MAX_FIELD; $numTeams++) {
            $bracketSize = 1;
            while ($bracketSize < $numTeams) {
                $bracketSize *= 2;
            }

            $matches = BracketBuilder::doubleElimination($this->seeds($numTeams));
            $this->assertSame(
                $bracketSize - 1,
                $this->countSide($matches, BracketBuilder::SIDE_WINNERS),
                "winners-bracket size for {$numTeams} teams"
            );
        }
    }

    public function testEveryEdgePointsStrictlyForward(): void
    {
        // This is what makes a single forward pass a valid simulation — and what lets the
        // persistence layer insert rows and resolve pointers in two simple passes.
        for ($numTeams = 2; $numTeams <= self::MAX_FIELD; $numTeams++) {
            $matches = BracketBuilder::doubleElimination($this->seeds($numTeams));

            foreach ($matches as $i => $match) {
                foreach (['next_match' => 'next_match_slot', 'loser_match' => 'loser_match_slot'] as $edge => $slotKey) {
                    if ($match[$edge] === null) {
                        $this->assertNull($match[$slotKey], "match {$i} {$slotKey} ({$numTeams} teams)");
                        continue;
                    }
                    $this->assertGreaterThan($i, $match[$edge], "match {$i} {$edge} ({$numTeams} teams)");
                    $this->assertContains($match[$slotKey], [1, 2], "match {$i} {$slotKey} ({$numTeams} teams)");
                }
            }
        }
    }

    public function testNoTwoMatchesClaimTheSameSlot(): void
    {
        for ($numTeams = 2; $numTeams <= self::MAX_FIELD; $numTeams++) {
            $matches = BracketBuilder::doubleElimination($this->seeds($numTeams));

            $claims = [];
            $edgeCount = 0;
            foreach ($matches as $i => $match) {
                foreach (['next_match' => 'next_match_slot', 'loser_match' => 'loser_match_slot'] as $edge => $slotKey) {
                    if ($match[$edge] === null) {
                        continue;
                    }
                    $edgeCount++;
                    $key = $match[$edge] . ':' . $match[$slotKey];
                    if (isset($claims[$key])) {
                        $this->fail("matches {$claims[$key]} and {$i} both feed slot {$key} ({$numTeams} teams)");
                    }
                    $claims[$key] = $i;
                }
            }

            $this->assertSame(count($claims), $edgeCount, "every edge claims a distinct slot ({$numTeams} teams)");
            $this->assertGreaterThan(0, $edgeCount, "bracket should have edges ({$numTeams} teams)");
        }
    }

    public function testLosersBracketMatchNumbersAreContiguousWithinEachRound(): void
    {
        for ($numTeams = 2; $numTeams <= self::MAX_FIELD; $numTeams++) {
            $byRound = [];
            foreach (BracketBuilder::doubleElimination($this->seeds($numTeams)) as $match) {
                if ($match['bracket_side'] !== BracketBuilder::SIDE_LOSERS) {
                    continue;
                }
                $byRound[$match['round']][] = $match['match_number'];
            }

            foreach ($byRound as $round => $numbers) {
                $this->assertSame(
                    range(1, count($numbers)),
                    $numbers,
                    "losers round {$round} numbering for {$numTeams} teams"
                );
            }
        }
    }

    // -------------------------------------------------------------------- full play-out

    public function testChalkBracketEliminatesEveryTeamAfterExactlyTwoLosses(): void
    {
        for ($numTeams = 2; $numTeams <= self::MAX_FIELD; $numTeams++) {
            $matches = BracketBuilder::doubleElimination($this->seeds($numTeams));
            $result = $this->playOut($matches, $this->chalk());

            $this->assertSame(101, $result['champion'], "top seed should win a chalk bracket ({$numTeams} teams)");
            $this->assertArrayNotHasKey(101, $result['losses'], "champion should be unbeaten ({$numTeams} teams)");

            $this->assertCount(
                $numTeams - 1,
                $result['losses'],
                "every team but the champion must be eliminated ({$numTeams} teams)"
            );
            foreach ($result['losses'] as $teamId => $count) {
                $this->assertSame(2, $count, "team {$teamId} took {$count} loss(es) ({$numTeams} teams)");
            }

            // Each game produces exactly one loss, and elimination needs two, so a field of
            // N settled without a reset takes exactly 2N-2 games.
            $this->assertSame($numTeams * 2 - 2, $result['games'], "games played ({$numTeams} teams)");
        }
    }

    public function testLosersBracketWinTriggersTheResetAndOneExtraGame(): void
    {
        for ($numTeams = 2; $numTeams <= self::MAX_FIELD; $numTeams++) {
            $matches = BracketBuilder::doubleElimination($this->seeds($numTeams));
            $result = $this->playOut($matches, $this->upsetInGrandFinal());

            $resetIndex = null;
            foreach ($matches as $i => $match) {
                if ($match['is_reset']) {
                    $resetIndex = $i;
                }
            }

            $this->assertArrayHasKey(
                $resetIndex,
                $result['played'],
                "the reset must be played when the losers side wins the grand final ({$numTeams} teams)"
            );
            $this->assertSame($numTeams * 2 - 1, $result['games'], "games played with a reset ({$numTeams} teams)");

            // Unlike the chalk run, the champion here carries a loss — the grand final it
            // lost before winning the reset — so it appears in the tally too.
            $eliminated = [];
            foreach ($result['losses'] as $teamId => $count) {
                if ($teamId === $result['champion']) {
                    $this->assertSame(1, $count, "champion should carry exactly one loss ({$numTeams} teams)");
                    continue;
                }
                $this->assertSame(2, $count, "team {$teamId} took {$count} loss(es) ({$numTeams} teams)");
                $eliminated[] = $teamId;
            }
            $this->assertCount($numTeams - 1, $eliminated, "eliminated teams ({$numTeams} teams)");
            $this->assertSame(1, $result['losses'][$result['champion']] ?? 0, "champion's losses ({$numTeams} teams)");
        }
    }

    public function testResetIsSkippedWhenTheWinnersSideTakesTheGrandFinal(): void
    {
        for ($numTeams = 2; $numTeams <= self::MAX_FIELD; $numTeams++) {
            $matches = BracketBuilder::doubleElimination($this->seeds($numTeams));
            $result = $this->playOut($matches, $this->chalk());

            foreach ($matches as $i => $match) {
                if ($match['is_reset']) {
                    $this->assertArrayNotHasKey(
                        $i,
                        $result['played'],
                        "the reset must not be played when the winners side holds ({$numTeams} teams)"
                    );
                }
            }
        }
    }

    public function testDeterministic(): void
    {
        $this->assertSame(
            BracketBuilder::doubleElimination($this->seeds(13)),
            BracketBuilder::doubleElimination($this->seeds(13))
        );
    }

    // ------------------------------------------------------------------------- helpers

    private function countSide(array $matches, string $side): int
    {
        $count = 0;
        foreach ($matches as $match) {
            if ($match['bracket_side'] === $side) {
                $count++;
            }
        }
        return $count;
    }
}
