<?php
// api/lib/LinkPreview.php

/**
 * Builds the Open Graph / Twitter Card metadata that messaging apps read when someone
 * shares a bracket link.
 *
 * Pure: takes a tournament row and returns strings. Fetching the row and serving the page
 * is api/preview.php's job.
 *
 * Why this exists at all: the app is an Angular SPA served from one static index.html, so
 * every URL returns identical markup with a single generic <title>. iMessage, Slack,
 * WhatsApp and the rest do not execute JavaScript — they read the HTML as served. Without
 * server-side tags, every shared bracket previews the same way, or not at all.
 *
 * PHP 7.2-compatible: production still runs 7.2 (see AGENTS.md).
 */
final class LinkPreview
{
    /** Open Graph wants at least 600x315; 1200x630 is the widely-recommended size. */
    const IMAGE_WIDTH = 1200;
    const IMAGE_HEIGHT = 630;

    const SITE_NAME = 'Bracketway';
    const FALLBACK_TITLE = 'Bracketway';
    const FALLBACK_DESCRIPTION = 'Follow a live tournament bracket.';

    /**
     * One line describing where the tournament has got to.
     *
     * Deliberately reads the same stats the tournament list already shows, so a preview and
     * the home page never disagree. Every part is optional — a tournament with no bracket
     * yet has no rounds, and a finished one has no current round.
     *
     * @param array $tournament Row with name/status, optionally team_count, current_round,
     *                          total_rounds and champion_name.
     */
    public static function describe(array $tournament): string
    {
        $parts = [];

        $teamCount = isset($tournament['team_count']) ? (int)$tournament['team_count'] : 0;
        if ($teamCount > 0) {
            $parts[] = $teamCount . ' ' . ($teamCount === 1 ? 'team' : 'teams');
        }

        $status = isset($tournament['status']) ? $tournament['status'] : 'setup';
        $champion = isset($tournament['champion_name']) ? trim((string)$tournament['champion_name']) : '';

        if ($status === 'complete' && $champion !== '') {
            $parts[] = 'Won by ' . $champion;
        } elseif ($status === 'complete') {
            $parts[] = 'Final results';
        } elseif ($status === 'setup') {
            $parts[] = 'Starting soon';
        } else {
            $current = isset($tournament['current_round']) ? (int)$tournament['current_round'] : 0;
            $total = isset($tournament['total_rounds']) ? (int)$tournament['total_rounds'] : 0;
            if ($current > 0 && $total > 0) {
                $parts[] = 'Round ' . $current . ' of ' . $total;
            } else {
                $parts[] = 'In progress';
            }
        }

        if (!$parts) {
            return self::FALLBACK_DESCRIPTION;
        }
        return implode(' · ', $parts);
    }

    /**
     * The tag set for one tournament, as name => content.
     *
     * Private tournaments are described exactly like public ones: knowing the link already
     * grants full access to the bracket (see requireTournamentVisible()), so withholding the
     * name from the preview would protect nothing while making a deliberately shared link
     * look broken.
     */
    public static function tags(array $tournament, string $pageUrl, string $imageUrl): array
    {
        $name = isset($tournament['name']) ? trim((string)$tournament['name']) : '';
        $title = $name !== '' ? $name : self::FALLBACK_TITLE;
        $description = self::describe($tournament);

        return [
            'og:type' => 'website',
            'og:site_name' => self::SITE_NAME,
            'og:title' => $title,
            'og:description' => $description,
            'og:url' => $pageUrl,
            'og:image' => $imageUrl,
            'og:image:width' => (string)self::IMAGE_WIDTH,
            'og:image:height' => (string)self::IMAGE_HEIGHT,
            'og:image:alt' => self::SITE_NAME . ' tournament bracket',
            'twitter:card' => 'summary_large_image',
            'twitter:title' => $title,
            'twitter:description' => $description,
            'twitter:image' => $imageUrl,
        ];
    }

    /**
     * Render tags as HTML. Open Graph uses `property`, Twitter uses `name`; some crawlers
     * are strict about which, so each gets the attribute it expects.
     */
    public static function render(array $tags): string
    {
        $out = '';
        foreach ($tags as $key => $value) {
            $attribute = strpos($key, 'og:') === 0 ? 'property' : 'name';
            $out .= sprintf(
                '<meta %s="%s" content="%s" />' . "\n",
                $attribute,
                htmlspecialchars($key, ENT_QUOTES, 'UTF-8'),
                htmlspecialchars($value, ENT_QUOTES, 'UTF-8')
            );
        }
        return $out;
    }

    /**
     * Put the tags into the document head, and replace the generic <title> with the
     * tournament's own — several crawlers prefer <title> over og:title, and a stale
     * "Bracketway" there would undo the rest.
     *
     * Returns $html unchanged if there is no </head> to insert before, so a malformed or
     * unexpected shell degrades to today's behaviour rather than to a broken page.
     */
    public static function injectInto(string $html, array $tags): string
    {
        $meta = self::render($tags);
        if ($meta === '') {
            return $html;
        }

        if (isset($tags['og:title'])) {
            $title = '<title>' . htmlspecialchars($tags['og:title'], ENT_QUOTES, 'UTF-8') . '</title>';
            $replaced = preg_replace('#<title>.*?</title>#is', $title, $html, 1, $count);
            if ($replaced !== null && $count > 0) {
                $html = $replaced;
            }
        }

        $position = stripos($html, '</head>');
        if ($position === false) {
            return $html;
        }

        return substr($html, 0, $position) . $meta . substr($html, $position);
    }
}
