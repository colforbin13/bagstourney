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
 * the refactor could plausibly go wrong, and it is invisible to BracketBuilderTest. A
 * recording PDO double lets us assert the exact statement sequence with no database.
 */
final class BracketPersistenceTest extends TestCase
{
    /** @var array<int, array{sql: string, params: ?array}> */
    private array $log = [];

    /** Stands in for AUTO_INCREMENT; the first inserted match becomes id 1001. */
    private int $lastInsertId = 1000;

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

    private function generateBracketFor(int $numTeams): array
    {
        $teams = [];
        for ($seed = 1; $seed <= $numTeams; $seed++) {
            $teams[] = ['id' => 100 + $seed, 'seed' => $seed];
        }

        $controller = new TeamController($this->recordingPdo());

        $method = new ReflectionMethod(TeamController::class, 'generateBracket');
        $method->invoke($controller, 7, $teams);

        return $teams;
    }

    private function statementsMatching(string $needle): array
    {
        return array_values(array_filter($this->log, function (array $entry) use ($needle): bool {
            return stripos($entry['sql'], $needle) !== false;
        }));
    }

    public function testInsertsOneRowPerPlannedMatchInPlanOrder(): void
    {
        $this->generateBracketFor(5);

        $plan = BracketBuilder::singleElimination([1 => 101, 2 => 102, 3 => 103, 4 => 104, 5 => 105]);
        $inserts = $this->statementsMatching('INSERT INTO matches');

        $this->assertCount(count($plan), $inserts);

        foreach ($plan as $index => $match) {
            $this->assertSame(
                [
                    7, // tournament id
                    $match['round'],
                    $match['match_number'],
                    $match['team1_id'],
                    $match['team2_id'],
                    $match['winner_id'],
                    $match['status'],
                ],
                $inserts[$index]['params'],
                "Insert params for plan index {$index}"
            );
        }
    }

    public function testForwardPointerIndexesAreResolvedToInsertedMatchIds(): void
    {
        $this->generateBracketFor(5);

        $plan = BracketBuilder::singleElimination([1 => 101, 2 => 102, 3 => 103, 4 => 104, 5 => 105]);
        $links = $this->statementsMatching('UPDATE matches SET next_match_id');

        $expected = [];
        foreach ($plan as $index => $match) {
            if ($match['next_match'] === null) {
                continue;
            }
            // Plan index N was inserted Nth, so it holds id 1001 + N.
            $expected[] = [
                1001 + $match['next_match'],
                $match['next_match_slot'],
                1001 + $index,
            ];
        }

        $this->assertSame($expected, array_column($links, 'params'));
    }

    public function testFinalMatchIsNeverGivenAForwardPointer(): void
    {
        $this->generateBracketFor(8);

        $links = $this->statementsMatching('UPDATE matches SET next_match_id');
        $inserts = $this->statementsMatching('INSERT INTO matches');

        // An 8-team bracket has 7 matches; every one but the final is linked forward.
        $this->assertCount(7, $inserts);
        $this->assertCount(6, $links);
    }

    public function testEachStatementIsPreparedOnlyOnce(): void
    {
        $this->generateBracketFor(16);

        $distinctSql = array_unique(array_column($this->log, 'sql'));

        // One INSERT shape and one UPDATE shape, reused across every row — the previous
        // implementation re-prepared inside the loop and issued an extra SELECT per match.
        $this->assertCount(2, $distinctSql);
        $this->assertSame([], $this->statementsMatching('SELECT'), 'Persisting a bracket should not read back');
    }

    public function testGappedSeedsAreRejectedBeforeAnythingIsWritten(): void
    {
        $controller = new TeamController($this->recordingPdo());
        $method = new ReflectionMethod(TeamController::class, 'generateBracket');

        try {
            $method->invoke($controller, 7, [
                ['id' => 101, 'seed' => 1],
                ['id' => 102, 'seed' => 2],
                ['id' => 104, 'seed' => 4],
            ]);
            $this->fail('Expected gapped seeds to be rejected');
        } catch (InvalidArgumentException $e) {
            $this->assertStringContainsString('contiguous', $e->getMessage());
        }

        $this->assertSame([], $this->log, 'No rows may be written for an invalid draw');
    }
}
