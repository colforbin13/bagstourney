<?php
// tests/BracketPersistenceTest.php

use PHPUnit\Framework\TestCase;

// TeamController.php defines a class and nothing else — no config, no connection, no
// side effects at load time — so requiring it here keeps tests/bootstrap.php free of
// anything that would need a database.
require_once __DIR__ . '/../api/controllers/TeamController.php';

/**
 * Covers the thin persistence half of TeamController::generateBracket().
 *
 * BracketBuilder returns forward pointers as array indexes, because real match ids do not
 * exist until the rows are inserted. Translating those indexes into ids is the one place
 * the refactor could plausibly go wrong, and it is invisible to the builder's own tests. A
 * recording PDO double lets us assert the exact statement sequence with no database.
 */
final class BracketPersistenceTest extends TestCase
{
    /** @var array<int, array{sql: string, params: ?array}> */
    private array $log = [];

    /** Stands in for AUTO_INCREMENT; the first inserted match becomes id 1001. */
    private int $lastInsertId = 1000;

    private const FIRST_ID = 1001;
    private const TOURNAMENT_ID = 7;

    private function recordingPdo(): PDO
    {
        $pdo = $this->createMock(PDO::class);

        $pdo->method('prepare')->willReturnCallback(function (string $sql) {
            $statement = $this->createMock(PDOStatement::class);
            $statement->method('execute')->willReturnCallback(function (?array $params = null) use ($sql): bool {
                $this->log[] = [
                    'sql' => preg_replace('/\s+/', ' ', trim($sql)),
                    'params' => $params,
                ];
                if (stripos($sql, 'INSERT INTO matches') !== false) {
                    $this->lastInsertId++;
                }
                return true;
            });
            return $statement;
        });

        $pdo->method('lastInsertId')->willReturnCallback(function (): string {
            return (string)$this->lastInsertId;
        });

        return $pdo;
    }

    private function seedRows(int $numTeams): array
    {
        $teams = [];
        for ($seed = 1; $seed <= $numTeams; $seed++) {
            $teams[] = ['id' => 100 + $seed, 'seed' => $seed];
        }
        return $teams;
    }

    private function seedMap(int $numTeams): array
    {
        $map = [];
        for ($seed = 1; $seed <= $numTeams; $seed++) {
            $map[$seed] = 100 + $seed;
        }
        return $map;
    }

    private function generateBracketFor(int $numTeams, string $format = 'single'): void
    {
        $controller = new TeamController($this->recordingPdo());
        $method = new ReflectionMethod(TeamController::class, 'generateBracket');
        $method->invoke($controller, self::TOURNAMENT_ID, $this->seedRows($numTeams), $format);
    }

    private function statementsMatching(string $needle): array
    {
        return array_values(array_filter($this->log, function (array $entry) use ($needle): bool {
            return stripos($entry['sql'], $needle) !== false;
        }));
    }

    /** The params generateBracket() should insert for one planned match. */
    private function expectedInsert(array $match): array
    {
        return [
            self::TOURNAMENT_ID,
            $match['round'],
            $match['match_number'],
            $match['bracket_side'],
            $match['is_reset'] ? 1 : 0,
            $match['team1_id'],
            $match['team2_id'],
            $match['winner_id'],
            $match['status'],
        ];
    }

    /** The link params for one planned match, or null when it has no outgoing edge. */
    private function expectedLink(array $match, int $index): ?array
    {
        if ($match['next_match'] === null && $match['loser_match'] === null) {
            return null;
        }
        return [
            $match['next_match'] === null ? null : self::FIRST_ID + $match['next_match'],
            $match['next_match_slot'],
            $match['loser_match'] === null ? null : self::FIRST_ID + $match['loser_match'],
            $match['loser_match_slot'],
            self::FIRST_ID + $index,
        ];
    }

    private function expectedLinks(array $plan): array
    {
        $expected = [];
        foreach ($plan as $index => $match) {
            $link = $this->expectedLink($match, $index);
            if ($link !== null) {
                $expected[] = $link;
            }
        }
        return $expected;
    }

    // ----------------------------------------------------------------- single elimination

    public function testInsertsOneRowPerPlannedMatchInPlanOrder(): void
    {
        $this->generateBracketFor(5);

        $plan = BracketBuilder::singleElimination($this->seedMap(5));
        $inserts = $this->statementsMatching('INSERT INTO matches');

        $this->assertCount(count($plan), $inserts);
        foreach ($plan as $index => $match) {
            $this->assertSame($this->expectedInsert($match), $inserts[$index]['params'], "insert {$index}");
        }
    }

    public function testForwardPointerIndexesAreResolvedToInsertedMatchIds(): void
    {
        $this->generateBracketFor(5);

        $plan = BracketBuilder::singleElimination($this->seedMap(5));
        $links = $this->statementsMatching('UPDATE matches SET next_match_id');

        $this->assertSame($this->expectedLinks($plan), array_column($links, 'params'));
    }

    public function testSingleEliminationWritesNoLoserEdges(): void
    {
        $this->generateBracketFor(8);

        $links = $this->statementsMatching('UPDATE matches SET next_match_id');
        $this->assertNotEmpty($links);
        foreach ($links as $link) {
            $this->assertNull($link['params'][2], 'loser_match_id must stay null in single elimination');
            $this->assertNull($link['params'][3], 'loser_match_slot must stay null in single elimination');
        }
    }

    public function testFinalMatchIsNeverGivenAForwardPointer(): void
    {
        $this->generateBracketFor(8);

        // An 8-team single-elimination bracket has 7 matches; every one but the final links on.
        $this->assertCount(7, $this->statementsMatching('INSERT INTO matches'));
        $this->assertCount(6, $this->statementsMatching('UPDATE matches SET next_match_id'));
    }

    public function testEachStatementIsPreparedOnlyOnce(): void
    {
        $this->generateBracketFor(16);

        $distinctSql = array_unique(array_column($this->log, 'sql'));

        // One INSERT shape and one UPDATE shape, reused across every row — the pre-refactor
        // implementation re-prepared inside the loop and issued an extra SELECT per match.
        $this->assertCount(2, $distinctSql);
        $this->assertSame([], $this->statementsMatching('SELECT'), 'Persisting a bracket should not read back');
    }

    public function testGappedSeedsAreRejectedBeforeAnythingIsWritten(): void
    {
        $controller = new TeamController($this->recordingPdo());
        $method = new ReflectionMethod(TeamController::class, 'generateBracket');

        try {
            $method->invoke($controller, self::TOURNAMENT_ID, [
                ['id' => 101, 'seed' => 1],
                ['id' => 102, 'seed' => 2],
                ['id' => 104, 'seed' => 4],
            ], 'single');
            $this->fail('Expected gapped seeds to be rejected');
        } catch (InvalidArgumentException $e) {
            $this->assertStringContainsString('contiguous', $e->getMessage());
        }

        $this->assertSame([], $this->log, 'No rows may be written for an invalid draw');
    }

    // ----------------------------------------------------------------- double elimination

    public function testDoubleEliminationInsertsEveryPlannedMatch(): void
    {
        $this->generateBracketFor(8, 'double');

        $plan = BracketBuilder::doubleElimination($this->seedMap(8));
        $inserts = $this->statementsMatching('INSERT INTO matches');

        $this->assertCount(count($plan), $inserts);
        foreach ($plan as $index => $match) {
            $this->assertSame($this->expectedInsert($match), $inserts[$index]['params'], "insert {$index}");
        }
    }

    public function testDoubleEliminationResolvesBothEdgesToMatchIds(): void
    {
        $this->generateBracketFor(8, 'double');

        $plan = BracketBuilder::doubleElimination($this->seedMap(8));
        $links = $this->statementsMatching('UPDATE matches SET next_match_id');

        $this->assertSame($this->expectedLinks($plan), array_column($links, 'params'));

        // Sanity: the fixture must actually exercise loser edges, or the assertion above
        // would pass on a bracket that never wrote one.
        $withLoserEdge = array_filter($links, function (array $link): bool {
            return $link['params'][2] !== null;
        });
        $this->assertNotEmpty($withLoserEdge);
    }

    public function testDoubleEliminationPersistsBracketSideAndResetFlag(): void
    {
        $this->generateBracketFor(8, 'double');

        $sides = [];
        $resets = 0;
        foreach ($this->statementsMatching('INSERT INTO matches') as $insert) {
            $side = $insert['params'][3];
            $sides[$side] = ($sides[$side] ?? 0) + 1;
            $resets += $insert['params'][4];
        }

        $this->assertSame(7, $sides[BracketBuilder::SIDE_WINNERS]);
        $this->assertSame(6, $sides[BracketBuilder::SIDE_LOSERS]);
        $this->assertSame(2, $sides[BracketBuilder::SIDE_GRAND_FINAL]);
        $this->assertSame(1, $resets, 'exactly one reset match, flagged');
    }

    public function testTheGrandFinalCarriesBothParticipantsIntoTheReset(): void
    {
        $plan = BracketBuilder::doubleElimination($this->seedMap(8));

        $grandFinal = null;
        $resetIndex = null;
        foreach ($plan as $index => $match) {
            if ($match['bracket_side'] !== BracketBuilder::SIDE_GRAND_FINAL) {
                continue;
            }
            if ($match['is_reset']) {
                $resetIndex = $index;
            } else {
                $grandFinal = $match;
            }
        }

        // Winner into slot 1, loser into slot 2 — the ordinary two-edge pair, which is why
        // the reset needs no special-case source plumbing.
        $this->assertSame($resetIndex, $grandFinal['next_match']);
        $this->assertSame(1, $grandFinal['next_match_slot']);
        $this->assertSame($resetIndex, $grandFinal['loser_match']);
        $this->assertSame(2, $grandFinal['loser_match_slot']);
    }

    public function testUnknownFormatFallsBackToSingleElimination(): void
    {
        // A row written before the format column existed, or any value the enum later grows,
        // must never be read as double elimination.
        $this->generateBracketFor(8, 'something-else');

        $inserts = $this->statementsMatching('INSERT INTO matches');
        $this->assertCount(7, $inserts);
        foreach ($inserts as $insert) {
            $this->assertSame(BracketBuilder::SIDE_WINNERS, $insert['params'][3]);
        }
    }
}
