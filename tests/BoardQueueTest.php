<?php
// tests/BoardQueueTest.php

use PHPUnit\Framework\TestCase;

/**
 * Covers board assignment (FEATURE_TRACKER.md item 8). A wrong answer here sends two teams
 * to the same board, pulls a team off a board mid-game, or leaves a board sitting empty
 * while teams wait, all of which an organizer sees at the venue immediately.
 */
final class BoardQueueTest extends TestCase
{
    private static function game(string $key, int $t1, int $t2, int $round = 1, int $seq = 1, ?int $board = null): array
    {
        return ['key' => $key, 'team1' => $t1, 'team2' => $t2, 'round' => $round, 'seq' => $seq, 'board' => $board];
    }

    /** Apply assign() back onto the games, as BoardController does. */
    private static function applied(int $boards, array $games): array
    {
        $result = BoardQueue::assign($boards, $games);
        foreach ($games as &$g) $g['board'] = $result[$g['key']];
        return $games;
    }

    // -------------------------------------------------------------------------- assign()

    public function testFreeBoardsGoToTheQueueInOrder(): void
    {
        $result = BoardQueue::assign(2, [
            self::game('c', 5, 6, 1, 3),
            self::game('a', 1, 2, 1, 1),
            self::game('b', 3, 4, 1, 2),
        ]);
        $this->assertSame(['a' => 1, 'b' => 2, 'c' => null], $result);
    }

    public function testEarlierRoundsGoFirst(): void
    {
        $result = BoardQueue::assign(1, [
            self::game('r2', 1, 2, 2, 1),
            self::game('r1', 3, 4, 1, 9),
        ]);
        $this->assertSame(1, $result['r1']);
        $this->assertNull($result['r2']);
    }

    public function testAGameOnABoardKeepsIt(): void
    {
        // b already holds board 1. a is first in the queue but must not bump it.
        $result = BoardQueue::assign(2, [
            self::game('a', 1, 2, 1, 1),
            self::game('b', 3, 4, 1, 2, 1),
        ]);
        $this->assertSame(1, $result['b']);
        $this->assertSame(2, $result['a']);
    }

    public function testTheLowestFreeBoardIsUsed(): void
    {
        $result = BoardQueue::assign(3, [
            self::game('a', 1, 2, 1, 1, 2),
            self::game('b', 3, 4, 1, 2),
            self::game('c', 5, 6, 1, 3),
        ]);
        $this->assertSame(['a' => 2, 'b' => 1, 'c' => 3], $result);
    }

    public function testATeamNeverHoldsTwoBoards(): void
    {
        // Pool play: team 1 has two unplayed games in the same round range.
        $result = BoardQueue::assign(4, [
            self::game('a', 1, 2, 1, 1),
            self::game('b', 1, 3, 1, 2),
        ]);
        $this->assertSame(1, $result['a']);
        $this->assertNull($result['b']);
    }

    public function testATeamDoesNotPlayALaterRoundBeforeAnEarlierOne(): void
    {
        // Team 1's round 1 game is stuck behind a busy opponent (team 2 is on board 1 in
        // another game). Its round 2 game against free team 3 must still wait.
        $result = BoardQueue::assign(3, [
            self::game('busy', 2, 9, 1, 1, 1),
            self::game('r1', 1, 2, 1, 2),
            self::game('r2', 1, 3, 2, 1),
        ]);
        $this->assertNull($result['r1'], 'team 2 is busy');
        $this->assertNull($result['r2'], 'team 1 still owes a round 1 game');
    }

    public function testALaterRoundGameStartsOnceBothTeamsAreThroughTheEarlierOne(): void
    {
        // Round 1 is down to one game (5 v 6). Teams 1 and 3 are done with round 1, so
        // their round 2 game takes the free board rather than waiting for the whole round.
        $result = BoardQueue::assign(2, [
            self::game('r1', 5, 6, 1, 3, 1),
            self::game('r2', 1, 3, 2, 1),
            self::game('r2b', 5, 2, 2, 2),
        ]);
        $this->assertSame(2, $result['r2']);
        $this->assertNull($result['r2b'], 'team 5 is still playing round 1');
    }

    public function testFewerBoardsReleasesGamesOnBoardsThatNoLongerExist(): void
    {
        $result = BoardQueue::assign(2, [
            self::game('a', 1, 2, 1, 1, 1),
            self::game('b', 3, 4, 1, 2, 4),
            self::game('c', 5, 6, 1, 3),
        ]);
        // b's board 4 is gone; b is first in line for the free board 2, ahead of c.
        $this->assertSame(['a' => 1, 'b' => 2, 'c' => null], $result);
    }

    public function testTwoGamesClaimingOneBoardKeepTheEarlierOne(): void
    {
        $result = BoardQueue::assign(2, [
            self::game('a', 1, 2, 1, 1, 1),
            self::game('b', 3, 4, 1, 2, 1),
        ]);
        $this->assertSame(['a' => 1, 'b' => 2], $result);
    }

    public function testNoBoardsAssignsNothing(): void
    {
        $result = BoardQueue::assign(0, [self::game('a', 1, 2, 1, 1, 1)]);
        $this->assertSame(['a' => null], $result);
    }

    public function testAFullPoolNeverDoubleBooksATeamOrABoard(): void
    {
        // Simulate a whole 12-team, 3-game pool on 4 boards: repeatedly finish the game on
        // the lowest board and reassign. Every game must get played, and at no point may a
        // team or a board appear twice.
        $ids = range(1, 12);
        $games = [];
        foreach (PoolPlay::schedule($ids, 3) as $round => $pairs) {
            foreach ($pairs as $i => [$a, $b]) {
                $games[] = self::game("p{$round}-{$i}", $a, $b, $round, $i + 1);
            }
        }
        $played = 0;
        $total = count($games);
        for ($guard = 0; $guard < 100 && $games; $guard++) {
            $games = self::applied(4, $games);
            $onBoard = array_filter($games, fn ($g) => $g['board'] !== null);
            $this->assertNotEmpty($onBoard, 'games are waiting but no board is in use');

            $boards = array_column($onBoard, 'board');
            $this->assertSame(count($boards), count(array_unique($boards)), 'board used twice');
            $teams = array_merge(array_column($onBoard, 'team1'), array_column($onBoard, 'team2'));
            $this->assertSame(count($teams), count(array_unique($teams)), 'team on two boards');

            usort($onBoard, fn ($x, $y) => $x['board'] <=> $y['board']);
            $done = $onBoard[0]['key'];
            $games = array_values(array_filter($games, fn ($g) => $g['key'] !== $done));
            $played++;
        }
        $this->assertSame($total, $played);
    }

    // -------------------------------------------------------------------------- upNext()

    public function testUpNextPutsGamesThatCanStartNowFirst(): void
    {
        $games = self::applied(1, [
            self::game('playing', 1, 2, 1, 1),
            self::game('waitsOnTeam1', 1, 3, 1, 2),
            self::game('free', 4, 5, 1, 3),
        ]);
        $this->assertSame(['free', 'waitsOnTeam1'], BoardQueue::upNext($games));
    }

    public function testUpNextLeavesOutGamesATeamCannotPlayYet(): void
    {
        $games = self::applied(1, [
            self::game('r1a', 1, 2, 1, 1),
            self::game('r1b', 3, 4, 1, 2),
            self::game('r2', 1, 3, 2, 1),
        ]);
        // r2 waits for r1b (team 3's round 1 game), which is itself waiting.
        $this->assertSame(['r1b'], BoardQueue::upNext($games));
    }

    // ---------------------------------------------------------------------------- move()

    public function testMovingAWaitingGameOntoAFreeBoard(): void
    {
        $games = [self::game('a', 1, 2, 1, 1, 1), self::game('b', 3, 4, 1, 2)];
        $moved = BoardQueue::move(3, $games, 'b', 3);
        $this->assertSame([1, 3], array_column($moved, 'board'));
    }

    public function testMovingOntoABusyBoardSwaps(): void
    {
        $games = [self::game('a', 1, 2, 1, 1, 1), self::game('b', 3, 4, 1, 2, 2)];
        $moved = BoardQueue::move(2, $games, 'b', 1);
        $this->assertSame([2, 1], array_column($moved, 'board'));
    }

    public function testMovingAWaitingGameOntoABusyBoardSendsTheOtherBackToWaiting(): void
    {
        $games = [self::game('a', 1, 2, 1, 1, 1), self::game('b', 3, 4, 1, 2)];
        $moved = BoardQueue::move(1, $games, 'b', 1);
        $this->assertSame([null, 1], array_column($moved, 'board'));
    }

    public function testAMoveCannotPutATeamOnTwoBoards(): void
    {
        $games = [self::game('a', 1, 2, 1, 1, 1), self::game('b', 1, 3, 2, 1)];
        $this->expectException(InvalidArgumentException::class);
        BoardQueue::move(2, $games, 'b', 2);
    }

    public function testAMoveToABoardThatDoesNotExistIsRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        BoardQueue::move(2, [self::game('a', 1, 2)], 'a', 3);
    }

    public function testAMoveOfAnUnknownGameIsRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        BoardQueue::move(2, [self::game('a', 1, 2)], 'zzz', 1);
    }

    public function testAManualMoveSurvivesTheNextAssignment(): void
    {
        $games = self::applied(3, [self::game('a', 1, 2, 1, 1), self::game('b', 3, 4, 1, 2)]);
        $games = BoardQueue::move(3, $games, 'a', 3);
        $this->assertSame(['a' => 3, 'b' => 2], BoardQueue::assign(3, $games));
    }
}
