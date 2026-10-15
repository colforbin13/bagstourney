<?php
// tests/NameListTest.php

use PHPUnit\Framework\TestCase;

/**
 * Covers the paste-a-list parser behind fast blind-draw setup.
 *
 * A wrong split here doesn't error, it quietly puts the wrong people in the draw: "Smith,
 * John" becoming two players, or a list number becoming part of a name on the bracket.
 */
final class NameListTest extends TestCase
{
    public function testOneNamePerLine(): void
    {
        $r = NameList::parse("Ann\nBob\nCara\nDev");
        $this->assertSame(['Ann', 'Bob', 'Cara', 'Dev'], $r['names']);
        $this->assertSame([], $r['duplicates']);
    }

    public function testWindowsAndOldMacLineEndings(): void
    {
        $this->assertSame(['Ann', 'Bob', 'Cara'], NameList::parse("Ann\r\nBob\rCara")['names']);
    }

    public function testBlankLinesAndSurroundingSpaceAreIgnored(): void
    {
        $this->assertSame(['Ann', 'Bob'], NameList::parse("\n  Ann  \n\n\t\n Bob\n\n")['names']);
    }

    public function testASingleLineSplitsOnCommasAndSemicolons(): void
    {
        $this->assertSame(['Ann', 'Bob', 'Cara', 'Dev'], NameList::parse('Ann, Bob,Cara; Dev')['names']);
    }

    public function testCommasDoNotSplitWhenThereAreSeveralLines(): void
    {
        $r = NameList::parse("Smith, John\nDoe, Jane");
        $this->assertSame(['Smith, John', 'Doe, Jane'], $r['names']);
    }

    public function testTabsSplitASpreadsheetRow(): void
    {
        $this->assertSame(['Ann', 'Bob', 'Cara'], NameList::parse("Ann\tBob\tCara")['names']);
    }

    public function testListMarkersAreStripped(): void
    {
        $r = NameList::parse("1. Ann\n2) Bob\n- Cara\n* Dev\n• Eve\n10.Finn");
        $this->assertSame(['Ann', 'Bob', 'Cara', 'Dev', 'Eve', 'Finn'], $r['names']);
    }

    public function testANameStartingWithANumberIsLeftAlone(): void
    {
        $this->assertSame(['3 Putt Pete', 'Ann'], NameList::parse("3 Putt Pete\nAnn")['names']);
    }

    public function testInternalWhitespaceIsCollapsed(): void
    {
        $this->assertSame(['Ann Marie Smith', 'Bob'], NameList::parse("Ann   Marie\u{00A0}Smith\nBob")['names']);
    }

    public function testRepeatsInThePasteAreSkippedCaseInsensitively(): void
    {
        $r = NameList::parse("Ann\nBob\nann\nBOB\nAnn  ");
        $this->assertSame(['Ann', 'Bob'], $r['names']);
        $this->assertSame(['ann', 'BOB', 'Ann'], $r['duplicates']);
    }

    public function testNamesAlreadyOnTheRosterAreSkipped(): void
    {
        $r = NameList::parse("Ann\nBob\nCara", ['bob', 'Zed']);
        $this->assertSame(['Ann', 'Cara'], $r['names']);
        $this->assertSame(['Bob'], $r['duplicates']);
    }

    public function testUnicodeNamesSurviveAndCompareCaseInsensitively(): void
    {
        $r = NameList::parse("José\nZoë\nJOSÉ");
        $this->assertSame(['José', 'Zoë'], $r['names']);
        $this->assertSame(['JOSÉ'], $r['duplicates']);
    }

    public function testOverlongNamesAreReportedNotTruncated(): void
    {
        $long = str_repeat('a', NameList::MAX_NAME_LENGTH + 1);
        $exact = str_repeat('b', NameList::MAX_NAME_LENGTH);
        $r = NameList::parse("Ann\n$long\n$exact");
        $this->assertSame(['Ann', $exact], $r['names']);
        $this->assertSame([$long], $r['too_long']);
    }

    public function testEmptyInputGivesNothing(): void
    {
        $this->assertSame(['names' => [], 'duplicates' => [], 'too_long' => []], NameList::parse(" \n\n ,  "));
    }

    public function testAMarkerAloneIsNotAName(): void
    {
        $this->assertSame(['Ann'], NameList::parse("Ann\n-\n3.")['names']);
    }
}
