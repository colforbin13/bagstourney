<?php
// api/lib/PageView.php

/**
 * Turns a page-view beacon into the row it counts toward, for AnalyticsController.
 *
 * Bracketway counts its own traffic rather than embedding a third-party tracker: no cookies,
 * no IP addresses stored, nothing sent anywhere else. What's kept is one counter per day, page
 * and source (migration 022), which is all the super-admin Traffic page needs.
 *
 * Pure: everything that decides what gets counted lives here, so it can be tested without a
 * database. The beacon endpoint is public and unauthenticated, which shapes two choices:
 *
 * - Paths are bucketed to a fixed list. A bracket's id becomes /bracket/:id, and anything
 *   that isn't a known public page becomes /(other), so nobody can grow the table without
 *   bound by posting made-up paths. Signed-in admin screens aren't counted at all; organizer
 *   activity is measured from the real tables instead.
 * - Crawlers are dropped by user agent. It's a coarse filter, but most bots don't run the
 *   app's JavaScript in the first place, so they never send a beacon.
 *
 * Targets PHP 8.1+, as does the rest of `api/` (see AGENTS.md).
 */
final class PageView
{
    const OTHER = '/(other)';

    /** Public pages, counted as themselves. Keep in step with frontend app.routes.ts. */
    const PAGES = [
        '/', '/tournaments', '/how-it-works', '/pricing', '/sports', '/blind-draw-generator',
        '/cornhole-fundraiser', '/scoreholio-alternative', '/terms', '/refunds', '/privacy',
        '/admin/login', '/admin/register', '/reset-password', '/verify-email',
        '/notifications/confirm', '/notifications/unsubscribe', '/notifications/preferences',
    ];

    /** Pages with an id in the URL, counted together. First path segment => bucket. */
    const PARAM_PAGES = [
        'bracket'  => '/bracket/:id',
        'register' => '/register/:id',
        'poster'   => '/poster/:id',
    ];

    const BOT_PATTERN = '/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|java\/|go-http|okhttp|axios|node-fetch|scrapy/i';

    const MAX_SOURCE = 60;

    public static function isBot(?string $userAgent): bool
    {
        $userAgent = trim((string)$userAgent);
        return $userAgent === '' || preg_match(self::BOT_PATTERN, $userAgent) === 1;
    }

    /**
     * The bucket a URL path counts toward, or null for a page that isn't counted (the
     * signed-in admin screens).
     */
    public static function path(string $url): ?string
    {
        $path = strtolower((string)parse_url($url, PHP_URL_PATH));
        $path = '/' . trim($path, '/');

        if (in_array($path, self::PAGES, true)) {
            return $path;
        }
        $first = explode('/', ltrim($path, '/'))[0];
        if ($first === 'admin') {
            return null;
        }
        return self::PARAM_PAGES[$first] ?? self::OTHER;
    }

    /**
     * Where a visit came from: the campaign tag if the link carried one (?utm_source=qr), else
     * the referring site's host, else '' for direct or unknown. Links within the site, and the
     * mobile/redirect subdomains big sites send through (m.facebook.com, l.facebook.com), are
     * folded so one site reads as one source.
     *
     * @param string[] $ownHosts this site's hosts, whose referrals are internal
     */
    public static function source(?string $referrer, ?string $utmSource, array $ownHosts): string
    {
        $tag = strtolower(trim((string)$utmSource));
        $tag = preg_replace('/[^a-z0-9._-]/', '', $tag);
        if ($tag !== '') {
            return substr($tag, 0, self::MAX_SOURCE);
        }

        $host = strtolower((string)parse_url(trim((string)$referrer), PHP_URL_HOST));
        if ($host === '') {
            return '';
        }
        $own = array_map(fn($h) => self::bareHost(strtolower($h)), $ownHosts);
        $host = self::bareHost($host);
        if (in_array($host, $own, true)) {
            return '';
        }
        return substr($host, 0, self::MAX_SOURCE);
    }

    /**
     * Fills the gaps in a run of daily totals, so a day nobody visited shows as zero rather
     * than vanishing from the chart.
     *
     * @param array<string, array{visits: int, views: int}> $byDay keyed 'Y-m-d'
     * @return array<int, array{day: string, visits: int, views: int}> oldest first, every day
     *         from $from to $to inclusive
     */
    public static function fillDays(array $byDay, string $from, string $to): array
    {
        $days = [];
        $day = new DateTimeImmutable($from);
        $end = new DateTimeImmutable($to);
        while ($day <= $end) {
            $key = $day->format('Y-m-d');
            $days[] = [
                'day'    => $key,
                'visits' => (int)($byDay[$key]['visits'] ?? 0),
                'views'  => (int)($byDay[$key]['views'] ?? 0),
            ];
            $day = $day->modify('+1 day');
        }
        return $days;
    }

    private static function bareHost(string $host): string
    {
        $host = preg_replace('/:\d+$/', '', $host);
        return preg_replace('/^(?:www|m|l|lm|mobile)\./', '', $host);
    }
}
