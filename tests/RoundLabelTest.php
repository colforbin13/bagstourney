<?php
// tests/RoundLabelTest.php

use PHPUnit\Framework\TestCase;

/**
 * RoundLabel mirrors frontend/src/app/shared/bracket-labels.ts roundLabel(); the cases
 * below are the same ones that function documents, so the email and the bracket page
 * cannot name a round differently.
 */
final class RoundLabelTest extends TestCase
{
    public function testSingleEliminationNamesTheLastThreeRounds(): void
    {
        $this->assertSame('Round 1', RoundLabel::label(1, 5));
        $this->assertSame('Round 2', RoundLabel::label(2, 5));
        $this->assertSame('Quarterfinal', RoundLabel::label(3, 5));
        $this->assertSame('Semifinal', RoundLabel::label(4, 5));
        $this->assertSame('Final', RoundLabel::label(5, 5));
    }

    public function testDoubleEliminationQualifiesEachSide(): void
    {
        $this->assertSame('Winners round 1', RoundLabel::label(1, 4, 'winners', 'double'));
        $this->assertSame('Winners semifinal', RoundLabel::label(3, 4, 'winners', 'double'));
        $this->assertSame('Winners final', RoundLabel::label(4, 4, 'winners', 'double'));
        $this->assertSame('Losers round 2', RoundLabel::label(2, 6, 'losers', 'double'));
        $this->assertSame('Losers final', RoundLabel::label(6, 6, 'losers', 'double'));
    }

    public function testGrandFinalAndDecidingMatch(): void
    {
        $this->assertSame('Grand final', RoundLabel::label(1, 2, 'grand_final', 'double'));
        $this->assertSame('Deciding match', RoundLabel::label(2, 2, 'grand_final', 'double'));
    }

    public function testForRoundLabelsByPositionNotStoredNumber(): void
    {
        // A losers bracket whose round 1 collapsed away starts at stored round 2; it is
        // still the side's first round.
        $losers = [2, 3, 4, 5];
        $this->assertSame('Losers round 1', RoundLabel::forRound(2, $losers, 'losers', 'double'));
        $this->assertSame('Losers final', RoundLabel::forRound(5, $losers, 'losers', 'double'));
    }

    public function testForRoundToleratesUnsortedDuplicatesAndStrings(): void
    {
        $this->assertSame('Semifinal', RoundLabel::forRound(2, ['3', '1', '2', '2', '1']));
    }

    public function testForRoundFallsBackForAnUnknownRound(): void
    {
        $this->assertSame('Round 9', RoundLabel::forRound(9, [1, 2, 3]));
    }

    public function testNextRoundSkipsGapsAndEndsAtTheLast(): void
    {
        $this->assertSame(4, RoundLabel::nextRound(2, [2, 4, 5]));
        $this->assertSame(5, RoundLabel::nextRound(4, [5, 2, 4]));
        $this->assertNull(RoundLabel::nextRound(5, [2, 4, 5]));
    }
}
