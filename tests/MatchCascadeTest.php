<?php
// tests/MatchCascadeTest.php

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../api/controllers/TeamController.php';
require_once __DIR__ . '/../api/controllers/MatchController.php';

/**
 * Exercises the match-state machine — cascadePropagate(), cascadeClearDownstream() and
 * championOf() — against a real SQL engine.
 *
 * These are the methods the double-elimination scope flagged as silent-data-loss territory:
 * with two forward edges per match, the winner's path and the loser's path re-converge at
 * the grand final, and a clear that over-reaches wipes results in the other tree that never
 * depended on the edited match. That is not something a statement recorder can catch,
 * because the logic reads back the state it just wrote — so this file uses an in-memory
 * SQLite database instead. Still no external database, no network and no credentials.
 *
 * The schema below mirrors the MySQL one after db/migrations/016_double_elimination.sql. It
 * is a deliberate duplicate: keep it in step when the real schema changes. What it proves is
 * the *logic*, not the production DDL — that is verified live against MySQL.
 */
final class MatchCascadeTest extends TestCase
{
    private const TOURNAMENT_ID = 1;

    private PDO $db;
    private MatchController $matches;
    private TeamController $teams;

    protected function setUp(): void
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('pdo_sqlite is not loaded; run via run-php-tests.ps1');
        }

        $this->db = new PDO('sqlite::memory:');
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        $this->db->exec('
            CREATE TABLE tournaments (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT "setup",
                format TEXT NOT NULL DEFAULT "single"
            )
        ');
        $this->db->exec('
            CREATE TABLE matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournament_id INTEGER NOT NULL,
                round INTEGER NOT NULL,
                match_number INTEGER NOT NULL,
                bracket_side TEXT NOT NULL DEFAULT "winners",
                is_reset INTEGER NOT NULL DEFAULT 0,
                team1_id INTEGER, team2_id INTEGER,
                team1_score INTEGER, team2_score INTEGER,
                winner_id INTEGER,
                next_match_id INTEGER, next_match_slot INTEGER,
                loser_match_id INTEGER, loser_match_slot INTEGER,
                status TEXT NOT NULL DEFAULT "pending"
            )
        ');
        // bracket() joins these for display names. Minimal shapes; only the columns the
        // query actually selects are needed.
        $this->db->exec('CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT, participant1_id INTEGER, participant2_id INTEGER)');
        $this->db->exec('CREATE TABLE participants (id INTEGER PRIMARY KEY, name TEXT)');
        $this->db->exec('INSERT INTO tournaments (id, name, status) VALUES (1, "Verification", "active")');

        $this->matches = new MatchController($this->db);
        $this->teams = new TeamController($this->db);
    }

    // ------------------------------------------------------------------------- helpers

    private function call(object $target, string $method, array $args)
    {
        $reflection = new ReflectionMethod(get_class($target), $method);
        return $reflection->invokeArgs($target, $args);
    }

    private function buildBracket(int $numTeams, string $format): void
    {
        $this->db->prepare('UPDATE tournaments SET format = ? WHERE id = ?')
            ->execute([$format, self::TOURNAMENT_ID]);

        $rows = [];
        for ($seed = 1; $seed <= $numTeams; $seed++) {
            $rows[] = ['id' => 100 + $seed, 'seed' => $seed];
        }
        $this->call($this->teams, 'generateBracket', [self::TOURNAMENT_ID, $rows, $format]);
    }

    private function allMatches(): array
    {
        return $this->db->query('SELECT * FROM matches ORDER BY id')->fetchAll();
    }

    private function match(int $id): array
    {
        $stmt = $this->db->prepare('SELECT * FROM matches WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch();
    }

    /** Find a match by its position in the bracket. */
    private function find(string $side, int $round, int $matchNumber): array
    {
        $stmt = $this->db->prepare('
            SELECT * FROM matches WHERE bracket_side = ? AND round = ? AND match_number = ?
        ');
        $stmt->execute([$side, $round, $matchNumber]);
        $row = $stmt->fetch();
        $this->assertNotFalse($row, "no {$side} r{$round}m{$matchNumber}");
        return $row;
    }

    private function recordResult(int $matchId, int $winnerId): void
    {
        $match = $this->match($matchId);
        $isTeam1 = (int)$match['team1_id'] === $winnerId;

        $this->db->prepare('
            UPDATE matches SET team1_score = ?, team2_score = ?, winner_id = ?, status = "complete"
            WHERE id = ?
        ')->execute([$isTeam1 ? 21 : 15, $isTeam1 ? 15 : 21, $winnerId, $matchId]);

        $this->call($this->matches, 'cascadePropagate', [$matchId]);
    }

    /** Chalk: the better seed (lower team id) always wins. */
    private function chalk(): callable
    {
        return function (array $match): int {
            return min((int)$match['team1_id'], (int)$match['team2_id']);
        };
    }

    /** Chalk everywhere except the grand final, which the losers-bracket side steals. */
    private function upsetInGrandFinal(): callable
    {
        return function (array $match): int {
            if ($match['bracket_side'] === 'grand_final' && !(int)$match['is_reset']) {
                return (int)$match['team2_id'];
            }
            return min((int)$match['team1_id'], (int)$match['team2_id']);
        };
    }

    /** Play every match that becomes ready until none are left. Returns the game count. */
    private function playOut(callable $pick, bool $includeReset = true): int
    {
        $games = 0;
        for ($guard = 0; $guard < 500; $guard++) {
            $ready = $this->db->query('SELECT id FROM matches WHERE status = "ready" ORDER BY id')->fetchAll();
            if (!$ready) {
                return $games;
            }
            foreach ($ready as $row) {
                $match = $this->match((int)$row['id']);
                if ($match['status'] !== 'ready') {
                    continue; // an earlier result in this pass changed it
                }
                if (!$includeReset && (int)$match['is_reset']) {
                    return $games;
                }
                $this->recordResult((int)$match['id'], $pick($match));
                $games++;
            }
        }
        $this->fail('play-out did not settle');
    }

    private function champion(): ?int
    {
        return $this->call($this->matches, 'championOf', [self::TOURNAMENT_ID]);
    }

    private function tournamentStatus(): string
    {
        return $this->db->query('SELECT status FROM tournaments WHERE id = 1')->fetch()['status'];
    }

    // ------------------------------------------------------------- single elimination

    public function testSingleEliminationStillPlaysOutToOneChampion(): void
    {
        $this->buildBracket(8, 'single');

        $this->assertSame(7, $this->playOut($this->chalk()));
        $this->assertSame(101, $this->champion());

        foreach ($this->allMatches() as $match) {
            $this->assertContains($match['status'], ['complete', 'bye'], "match {$match['id']}");
        }
    }

    public function testSingleEliminationWithByesPlaysOut(): void
    {
        $this->buildBracket(5, 'single');

        $this->assertSame(4, $this->playOut($this->chalk()));
        $this->assertSame(101, $this->champion());
    }

    // ------------------------------------------------------------- double elimination

    public function testDoubleEliminationChalkRunSkipsTheReset(): void
    {
        $this->buildBracket(8, 'double');

        // 2N-2 games when the winners-bracket side holds the grand final.
        $this->assertSame(14, $this->playOut($this->chalk()));
        $this->assertSame(101, $this->champion());

        $reset = $this->db->query('SELECT * FROM matches WHERE is_reset = 1')->fetch();
        $this->assertNull($reset['winner_id'], 'the reset must not be played');
        $this->assertNull($reset['team1_id'], 'nothing may carry into an unplayed reset');
        $this->assertNull($reset['team2_id']);
    }

    public function testDoubleEliminationWithByesPlaysOut(): void
    {
        $this->buildBracket(5, 'double');

        $this->assertSame(8, $this->playOut($this->chalk()));
        $this->assertSame(101, $this->champion());
    }

    public function testGrandFinalWonByLosersSideLeavesNoChampionUntilTheResetIsPlayed(): void
    {
        $this->buildBracket(8, 'double');

        $played = $this->playOut($this->upsetInGrandFinal(), false);

        $grandFinal = $this->find('grand_final', 1, 1);
        $this->assertSame('complete', $grandFinal['status']);
        $this->assertSame(
            (int)$grandFinal['team2_id'],
            (int)$grandFinal['winner_id'],
            'the losers-bracket side should have taken it'
        );

        // Both teams now carry one loss, so the tournament is not decided.
        $this->assertNull($this->champion(), 'no champion until the reset is played');

        $reset = $this->db->query('SELECT * FROM matches WHERE is_reset = 1')->fetch();
        $this->assertSame('ready', $reset['status'], 'the reset must be playable');
        $this->assertSame((int)$grandFinal['winner_id'], (int)$reset['team1_id']);
        $this->assertSame((int)$grandFinal['team1_id'], (int)$reset['team2_id']);

        // Finish it.
        $this->recordResult((int)$reset['id'], (int)$reset['team2_id']);
        $this->assertSame((int)$reset['team2_id'], $this->champion());
        $this->assertSame(15, $played + 1, '2N-1 games when the reset is needed');
    }

    // --------------------------------------------- re-scoring: the two-edge clear

    public function testRescoringAWinnersMatchClearsBothItsPathsButNothingElse(): void
    {
        $this->buildBracket(8, 'double');
        $this->playOut($this->chalk());
        $this->assertSame(101, $this->champion());

        // Independent branches, captured before the edit: neither descends from winners r1m1.
        $keepWinners = $this->find('winners', 1, 3);
        $keepWinnersRound2 = $this->find('winners', 2, 2);
        $keepLosers = $this->find('losers', 1, 2);
        foreach ([$keepWinners, $keepWinnersRound2, $keepLosers] as $match) {
            $this->assertSame('complete', $match['status'], "expected a played match to start from");
        }

        $edited = $this->find('winners', 1, 1);
        $this->assertSame('complete', $edited['status']);

        // Flip it: the team that lost now wins.
        $newWinner = (int)$edited['winner_id'] === (int)$edited['team1_id']
            ? (int)$edited['team2_id']
            : (int)$edited['team1_id'];

        $this->call($this->matches, 'cascadeClearDownstream', [(int)$edited['id']]);
        $this->recordResult((int)$edited['id'], $newWinner);

        // The winner path and the loser path both ran through the grand final, so it is gone.
        $grandFinal = $this->find('grand_final', 1, 1);
        $this->assertNull($grandFinal['winner_id'], 'grand final must be invalidated');
        $this->assertNull($this->champion(), 'tournament must have no champion again');

        // Everything that did not descend from the edited match keeps its result. This is the
        // assertion that fails if the clear walks the structure instead of the data.
        $this->assertSame(
            $keepWinners['winner_id'],
            $this->match((int)$keepWinners['id'])['winner_id'],
            'an unrelated winners round-1 result was wiped'
        );
        $this->assertSame(
            $keepWinnersRound2['winner_id'],
            $this->match((int)$keepWinnersRound2['id'])['winner_id'],
            'an unrelated winners round-2 result was wiped'
        );
        $this->assertSame(
            $keepLosers['winner_id'],
            $this->match((int)$keepLosers['id'])['winner_id'],
            'an unrelated losers-bracket result was wiped'
        );
    }

    public function testRescoringLeavesTheBracketPlayableAgain(): void
    {
        $this->buildBracket(8, 'double');
        $this->playOut($this->chalk());

        $edited = $this->find('winners', 1, 1);
        $newWinner = (int)$edited['team2_id'];

        $this->call($this->matches, 'cascadeClearDownstream', [(int)$edited['id']]);
        $this->recordResult((int)$edited['id'], $newWinner);

        // Replaying settles on a champion again, and nothing is left dangling.
        $this->playOut($this->chalk());
        $this->assertNotNull($this->champion(), 'bracket must reach a champion again');

        foreach ($this->allMatches() as $match) {
            if ((int)$match['is_reset']) {
                continue; // legitimately unplayed when the winners side holds
            }
            $this->assertContains(
                $match['status'],
                ['complete', 'bye'],
                "match {$match['id']} ({$match['bracket_side']} r{$match['round']}m{$match['match_number']}) left unplayed"
            );
        }
    }

    public function testRescoringDoesNotStrandTeamsInDownstreamSlots(): void
    {
        $this->buildBracket(8, 'double');
        $this->playOut($this->chalk());

        $edited = $this->find('winners', 1, 1);
        $oldWinner = (int)$edited['winner_id'];
        $oldLoser = (int)$edited['team1_id'] === $oldWinner ? (int)$edited['team2_id'] : (int)$edited['team1_id'];

        $this->call($this->matches, 'cascadeClearDownstream', [(int)$edited['id']]);

        // Before the corrected result is advanced, neither of the withdrawn teams may still
        // be sitting in a downstream slot.
        foreach ($this->allMatches() as $match) {
            if ((int)$match['id'] === (int)$edited['id']) {
                continue;
            }
            foreach (['team1_id', 'team2_id'] as $column) {
                $this->assertNotSame($oldWinner, (int)$match[$column], "stale winner in match {$match['id']}");
                $this->assertNotSame($oldLoser, (int)$match[$column], "stale loser in match {$match['id']}");
            }
        }
    }

    // --------------------------------------------------------------- bracket response

    /** Call bracket() and decode what it echoes. */
    private function bracketResponse(): array
    {
        ob_start();
        $this->matches->bracket(self::TOURNAMENT_ID);
        return json_decode(ob_get_clean(), true);
    }

    public function testSingleEliminationResponseKeepsTheLegacyRoundsShape(): void
    {
        $this->buildBracket(8, 'single');
        $response = $this->bracketResponse();

        $this->assertSame('single', $response['format']);
        // A client cached before the two-tree response existed still has to render.
        $this->assertArrayHasKey('rounds', $response);
        $this->assertSame([4, 2, 1], [
            count($response['rounds'][1]),
            count($response['rounds'][2]),
            count($response['rounds'][3]),
        ], 'legacy rounds should hold 4/2/1 matches');

        $this->assertCount(1, $response['sides']);
        $this->assertSame('winners', $response['sides'][0]['side']);
        $this->assertCount(3, $response['sides'][0]['rounds']);
    }

    public function testDoubleEliminationResponseSplitsTheTwoTrees(): void
    {
        $this->buildBracket(8, 'double');
        $response = $this->bracketResponse();

        $this->assertSame('double', $response['format']);
        // Omitted rather than shipped wrong: there is no correct single-tree shape here.
        $this->assertArrayNotHasKey('rounds', $response);

        $sides = array_column($response['sides'], 'side');
        $this->assertSame(['winners', 'losers', 'grand_final'], $sides);

        $counts = [];
        foreach ($response['sides'] as $side) {
            $counts[$side['side']] = array_map(function (array $round): int {
                return count($round['matches']);
            }, $side['rounds']);
        }

        $this->assertSame([4, 2, 1], $counts['winners']);
        // The losers bracket alternates minor/major rounds, so sizes halve every *two*
        // rounds rather than every round — the assumption the old grouping baked in.
        $this->assertSame([2, 2, 1, 1], $counts['losers']);
        $this->assertSame([1, 1], $counts['grand_final'], 'grand final plus its reset');
    }

    public function testWinnersAndLosersRoundTwoAreNoLongerMerged(): void
    {
        // The regression this grouping exists to prevent: both sides have a round 2, and
        // keying purely on round number rendered them as one column.
        $this->buildBracket(8, 'double');
        $response = $this->bracketResponse();

        $roundTwos = [];
        foreach ($response['sides'] as $side) {
            foreach ($side['rounds'] as $round) {
                if ((int)$round['round'] === 2) {
                    $roundTwos[$side['side']] = count($round['matches']);
                }
            }
        }

        $this->assertSame(['winners' => 2, 'losers' => 2, 'grand_final' => 1], $roundTwos);
    }

    public function testLosersRoundsKeepTheirStructuralNumbering(): void
    {
        // With byes the first losers round collapses away entirely, so the side starts at
        // round 2. Consumers label by position within the side, not by this number.
        $this->buildBracket(5, 'double');
        $response = $this->bracketResponse();

        $losers = null;
        foreach ($response['sides'] as $side) {
            if ($side['side'] === 'losers') {
                $losers = $side;
            }
        }

        $this->assertNotNull($losers);
        $this->assertSame([2, 3, 4], array_map(function (array $r): int {
            return (int)$r['round'];
        }, $losers['rounds']));
    }

    // ------------------------------------------------------------- tournament status

    public function testTournamentStatusFollowsTheChampion(): void
    {
        $this->buildBracket(8, 'double');
        $this->playOut($this->chalk());

        $this->call($this->matches, 'syncTournamentStatus', [self::TOURNAMENT_ID, $this->champion()]);
        $this->assertSame('complete', $this->tournamentStatus());

        $edited = $this->find('winners', 1, 1);
        $this->call($this->matches, 'cascadeClearDownstream', [(int)$edited['id']]);
        $this->recordResult((int)$edited['id'], (int)$edited['team2_id']);

        $this->call($this->matches, 'syncTournamentStatus', [self::TOURNAMENT_ID, $this->champion()]);
        $this->assertSame('active', $this->tournamentStatus(), 'an upstream edit must reopen the tournament');
    }
}
