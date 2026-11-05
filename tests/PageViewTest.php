<?php
// tests/PageViewTest.php

use PHPUnit\Framework\TestCase;

/**
 * Covers what the public page-view beacon is allowed to count. The endpoint takes anyone's
 * input, so the bucketing is the guard against a table full of junk paths.
 */
final class PageViewTest extends TestCase
{
    public function testKnownPagesCountAsThemselves(): void
    {
        $this->assertSame('/', PageView::path('/'));
        $this->assertSame('/', PageView::path(''));
        $this->assertSame('/pricing', PageView::path('/pricing'));
        $this->assertSame('/pricing', PageView::path('/Pricing/'));
        $this->assertSame('/admin/register', PageView::path('/admin/register'));
        $this->assertSame('/notifications/confirm', PageView::path('/notifications/confirm'));
    }

    public function testQueryStringsAndFragmentsAreDropped(): void
    {
        $this->assertSame('/pricing', PageView::path('/pricing?utm_source=reddit#plans'));
        $this->assertSame('/reset-password', PageView::path('/reset-password?token=secret'));
    }

    public function testPagesWithAnIdAreCountedTogether(): void
    {
        $this->assertSame('/bracket/:id', PageView::path('/bracket/42'));
        $this->assertSame('/bracket/:id', PageView::path('/bracket/42/whatever'));
        $this->assertSame('/register/:id', PageView::path('/register/3f2a9c1e-uuid'));
        $this->assertSame('/poster/:id', PageView::path('/poster/abc/tv'));
    }

    public function testAdminScreensAreNotCounted(): void
    {
        $this->assertNull(PageView::path('/admin'));
        $this->assertNull(PageView::path('/admin/tournament/7/score'));
        $this->assertNull(PageView::path('/admin/users'));
    }

    public function testUnknownPathsShareOneBucket(): void
    {
        $this->assertSame(PageView::OTHER, PageView::path('/wp-login.php'));
        $this->assertSame(PageView::OTHER, PageView::path('/pricing/extra'));
        $this->assertSame(PageView::OTHER, PageView::path('/' . str_repeat('x', 500)));
        // A known page name as a prefix doesn't make the path known.
        $this->assertSame(PageView::OTHER, PageView::path('/terms-and-more'));
    }

    public function testBotsAreRecognised(): void
    {
        $this->assertTrue(PageView::isBot(null));
        $this->assertTrue(PageView::isBot(''));
        $this->assertTrue(PageView::isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'));
        $this->assertTrue(PageView::isBot('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0'));
        $this->assertTrue(PageView::isBot('facebookexternalhit/1.1'));
        $this->assertFalse(PageView::isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'));
        $this->assertFalse(PageView::isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'));
    }

    public function testSourceIsTheReferringHost(): void
    {
        $own = ['bracketway.com'];
        $this->assertSame('google.com', PageView::source('https://www.google.com/', null, $own));
        $this->assertSame('alternativeto.net', PageView::source('https://alternativeto.net/software/challonge/', '', $own));
        $this->assertSame('facebook.com', PageView::source('https://l.facebook.com/l.php?u=x', null, $own));
        $this->assertSame('facebook.com', PageView::source('https://m.facebook.com/', null, $own));
        // Only the mobile/redirect prefixes fold; other subdomains are kept as sent.
        $this->assertSame('old.reddit.com', PageView::source('https://old.reddit.com/r/cornhole', null, $own));
    }

    public function testInternalAndMissingReferrersAreDirect(): void
    {
        $own = ['bracketway.com', 'localhost:4200'];
        $this->assertSame('', PageView::source(null, null, $own));
        $this->assertSame('', PageView::source('', null, $own));
        $this->assertSame('', PageView::source('not a url', null, $own));
        $this->assertSame('', PageView::source('https://bracketway.com/pricing', null, $own));
        $this->assertSame('', PageView::source('https://www.bracketway.com/', null, $own));
        $this->assertSame('', PageView::source('http://localhost:4200/', null, $own));
    }

    public function testACampaignTagWinsOverTheReferrer(): void
    {
        $own = ['bracketway.com'];
        $this->assertSame('qr', PageView::source('https://www.google.com/', 'QR', $own));
        $this->assertSame('reddit', PageView::source(null, ' reddit ', $own));
        // Only a safe character set, and a bounded length, from a value anyone can post.
        $this->assertSame('scriptalert1script', PageView::source(null, '<script>alert(1)</script>', $own));
        $this->assertSame(PageView::MAX_SOURCE, strlen(PageView::source(null, str_repeat('a', 500), $own)));
        $this->assertSame(PageView::MAX_SOURCE, strlen(PageView::source('https://' . str_repeat('a', 300) . '.com/', null, $own)));
        // A tag that sanitises to nothing falls back to the referrer.
        $this->assertSame('google.com', PageView::source('https://google.com/', '<>', $own));
    }

    public function testFillDaysAddsZeroDays(): void
    {
        $days = PageView::fillDays(
            ['2026-10-21' => ['visits' => 3, 'views' => 5]],
            '2026-10-20',
            '2026-10-22'
        );
        $this->assertSame([
            ['day' => '2026-10-20', 'visits' => 0, 'views' => 0],
            ['day' => '2026-10-21', 'visits' => 3, 'views' => 5],
            ['day' => '2026-10-22', 'visits' => 0, 'views' => 0],
        ], $days);
    }

    public function testFillDaysCrossesMonthEnds(): void
    {
        $days = PageView::fillDays([], '2026-02-27', '2026-03-02');
        $this->assertSame(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'], array_column($days, 'day'));
    }
}
