<?php
// tests/LinkPreviewTest.php

use PHPUnit\Framework\TestCase;

/**
 * Covers the Open Graph metadata shared bracket links carry.
 *
 * The consequences of getting this wrong are invisible in the app itself — a bad tag shows
 * up only in someone else's chat window, days later — so the rules are pinned down here
 * rather than left to a manual check.
 */
final class LinkPreviewTest extends TestCase
{
    private const URL = 'https://bracketway.com/bracket/abc-123';
    private const IMAGE = 'https://bracketway.com/assets/og-card.png';

    private function tournament(array $over = []): array
    {
        return array_merge([
            'id' => 7,
            'uuid' => 'abc-123',
            'name' => 'Apple Lane Bags Championship',
            'status' => 'active',
            'team_count' => 16,
            'total_rounds' => 4,
            'current_round' => 3,
            'champion_name' => null,
        ], $over);
    }

    // ------------------------------------------------------------------------ describe()

    public function testDescribesALiveTournamentByItsProgress(): void
    {
        $this->assertSame('16 teams · Round 3 of 4', LinkPreview::describe($this->tournament()));
    }

    public function testDescribesAFinishedTournamentByItsWinner(): void
    {
        $this->assertSame(
            '16 teams · Won by The Ringers',
            LinkPreview::describe($this->tournament([
                'status' => 'complete',
                'current_round' => null,
                'champion_name' => 'The Ringers',
            ]))
        );
    }

    public function testFallsBackWhenAFinishedTournamentHasNoRecordedChampion(): void
    {
        $this->assertSame(
            '16 teams · Final results',
            LinkPreview::describe($this->tournament(['status' => 'complete', 'champion_name' => null]))
        );
    }

    public function testDescribesATournamentThatHasNotStarted(): void
    {
        $this->assertSame(
            'Starting soon',
            LinkPreview::describe($this->tournament(['status' => 'setup', 'team_count' => 0]))
        );
    }

    public function testDescribesALiveTournamentWithNoRoundInformation(): void
    {
        // A double-elimination tournament past its winners bracket reports no current round.
        $this->assertSame(
            '4 teams · In progress',
            LinkPreview::describe($this->tournament([
                'team_count' => 4, 'current_round' => null, 'total_rounds' => 3,
            ]))
        );
    }

    public function testUsesSingularForASingleTeam(): void
    {
        $this->assertStringStartsWith('1 team ·', LinkPreview::describe($this->tournament(['team_count' => 1])));
    }

    // ---------------------------------------------------------------------------- tags()

    public function testTitlesThePreviewWithTheTournamentName(): void
    {
        $tags = LinkPreview::tags($this->tournament(), self::URL, self::IMAGE);

        $this->assertSame('Apple Lane Bags Championship', $tags['og:title']);
        $this->assertSame('Apple Lane Bags Championship', $tags['twitter:title']);
        $this->assertSame(self::URL, $tags['og:url']);
        $this->assertSame(self::IMAGE, $tags['og:image']);
        $this->assertSame('summary_large_image', $tags['twitter:card']);
    }

    public function testDeclaresTheImageDimensionsCrawlersAskFor(): void
    {
        // Without these some crawlers skip the image rather than fetch it to measure.
        $tags = LinkPreview::tags($this->tournament(), self::URL, self::IMAGE);

        $this->assertSame('1200', $tags['og:image:width']);
        $this->assertSame('630', $tags['og:image:height']);
    }

    public function testFallsBackToTheAppNameForATournamentWithNoName(): void
    {
        $tags = LinkPreview::tags($this->tournament(['name' => '   ']), self::URL, self::IMAGE);
        $this->assertSame('Bracketway', $tags['og:title']);
    }

    // -------------------------------------------------------------------------- render()

    public function testUsesPropertyForOpenGraphAndNameForTwitter(): void
    {
        $html = LinkPreview::render([
            'og:title' => 'Finals Night',
            'twitter:card' => 'summary_large_image',
        ]);

        $this->assertStringContainsString('<meta property="og:title" content="Finals Night" />', $html);
        $this->assertStringContainsString('<meta name="twitter:card" content="summary_large_image" />', $html);
    }

    public function testEscapesATournamentNameSoItCannotBreakOutOfTheAttribute(): void
    {
        // Tournament names are free text typed by organizers.
        $html = LinkPreview::render(LinkPreview::tags(
            $this->tournament(['name' => 'Dave\'s "Big" <script>alert(1)</script> Tourney']),
            self::URL,
            self::IMAGE
        ));

        $this->assertStringNotContainsString('<script>', $html);
        $this->assertStringNotContainsString('" content="', str_replace('" content="', '', $html) . 'x');
        $this->assertStringContainsString('&lt;script&gt;', $html);
        $this->assertStringContainsString('&quot;Big&quot;', $html);
    }

    // ---------------------------------------------------------------------- injectInto()

    private function shell(): string
    {
        return "<!doctype html>\n<html lang=\"en\">\n<head>\n"
            . "  <meta charset=\"utf-8\" />\n  <title>Bracketway</title>\n"
            . "</head>\n<body><app-root></app-root></body>\n</html>";
    }

    public function testInsertsTheTagsIntoTheHead(): void
    {
        $tags = LinkPreview::tags($this->tournament(), self::URL, self::IMAGE);
        $out = LinkPreview::injectInto($this->shell(), $tags);

        $this->assertStringContainsString('<meta property="og:title"', $out);
        $this->assertLessThan(
            strpos($out, '</head>'),
            strpos($out, '<meta property="og:title"'),
            'tags must land inside the head'
        );
        // The app itself must still boot.
        $this->assertStringContainsString('<app-root></app-root>', $out);
    }

    public function testReplacesTheGenericTitleRatherThanLeavingItStale(): void
    {
        $out = LinkPreview::injectInto($this->shell(), LinkPreview::tags($this->tournament(), self::URL, self::IMAGE));

        // Several crawlers prefer <title> over og:title.
        $this->assertStringContainsString('<title>Apple Lane Bags Championship</title>', $out);
        $this->assertStringNotContainsString('<title>Bracketway</title>', $out);
    }

    public function testLeavesUnfamiliarMarkupAlone(): void
    {
        // Degrading to today's behaviour beats serving something broken.
        $html = '<html><body>no head here</body></html>';
        $out = LinkPreview::injectInto($html, LinkPreview::tags($this->tournament(), self::URL, self::IMAGE));

        $this->assertSame($html, $out);
    }

    public function testInjectingIsIdempotentEnoughToNotCorruptTheDocument(): void
    {
        $tags = LinkPreview::tags($this->tournament(), self::URL, self::IMAGE);
        $once = LinkPreview::injectInto($this->shell(), $tags);
        $twice = LinkPreview::injectInto($once, $tags);

        $this->assertSame(1, substr_count($twice, '</head>'));
        $this->assertSame(1, substr_count($twice, '<title>'));
    }
}
