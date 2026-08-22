<?php
// api/preview.php
//
// Serves the Angular shell for /bracket/... URLs with Open Graph tags for that specific
// tournament, so a link shared in iMessage, Slack or WhatsApp previews as the tournament
// rather than as an unlabelled app. None of those crawlers run JavaScript, so the tags have
// to be in the HTML as served.
//
// Reached via the rewrite in the deployed .htaccess (frontend/src/.htaccess). Real browsers
// get the same shell they always did plus some extra <meta> tags, which Angular ignores.
//
// Fails safe: any problem at all — no shell, no database, unknown tournament — falls through
// to serving index.html untouched, which is exactly today's behaviour. A link preview is
// never worth taking the bracket page down for.

require_once __DIR__ . '/lib/LinkPreview.php';

/** The built SPA shell sits one level up, at the web root. */
function previewShellPath(): string {
    return __DIR__ . '/../index.html';
}

function serveShell(string $html): void {
    header('Content-Type: text/html; charset=UTF-8');
    // Short, not zero: a crawler re-fetching after a score changes should see fresh details,
    // but a burst of previews for the same link shouldn't hit the database every time.
    header('Cache-Control: public, max-age=300');
    echo $html;
}

$html = @file_get_contents(previewShellPath());
if ($html === false) {
    http_response_code(404);
    echo 'Not found';
    return;
}

// Everything from here on is best-effort decoration.
try {
    require_once __DIR__ . '/config/database.php';

    // The route is /bracket/{id-or-uuid}: numeric ids come from the admin UI, uuids from a
    // shared public link. Taken from the path rather than a query string so the rewrite can
    // stay a plain internal redirect.
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    $key = '';
    // Delimiter is ~ rather than # — the character class contains a #, which would end the
    // pattern early and make this silently never match.
    if (is_string($path) && preg_match('~/bracket/([^/?#]+)~', $path, $m)) {
        $key = urldecode($m[1]);
    }

    if ($key === '') {
        serveShell($html);
        return;
    }

    $db = getDB();
    $stmt = $db->prepare('
        SELECT t.id, t.uuid, t.name, t.status,
               (SELECT COUNT(*) FROM teams tm WHERE tm.tournament_id = t.id) AS team_count,
               (SELECT MAX(m.round) FROM matches m
                  WHERE m.tournament_id = t.id AND m.bracket_side = "winners") AS total_rounds,
               (SELECT MIN(m.round) FROM matches m
                  WHERE m.tournament_id = t.id AND m.bracket_side = "winners"
                    AND m.status IN ("pending", "ready")) AS current_round,
               (SELECT w.name FROM matches m JOIN teams w ON w.id = m.winner_id
                  WHERE m.tournament_id = t.id AND m.winner_id IS NOT NULL
                    AND (
                          m.is_reset = 1
                       OR (m.bracket_side = "grand_final" AND m.winner_id = m.team1_id)
                       OR (m.bracket_side <> "grand_final" AND m.next_match_id IS NULL)
                    )
                  ORDER BY m.is_reset DESC, m.round DESC
                  LIMIT 1) AS champion_name
        FROM tournaments t
        WHERE (t.uuid = ? OR (t.id = ? AND ? REGEXP "^[0-9]+$")) AND t.deleted_at IS NULL
        LIMIT 1
    ');
    $stmt->execute([$key, (int)$key, $key]);
    $tournament = $stmt->fetch();

    if (!$tournament) {
        // A deleted or mistyped link previews as the app itself rather than leaking that an
        // id does or doesn't exist.
        serveShell($html);
        return;
    }

    $base = rtrim(defined('APP_PUBLIC_URL') ? APP_PUBLIC_URL : '', '/');
    $pageUrl = $base . '/bracket/' . rawurlencode($tournament['uuid']);
    $imageUrl = $base . '/assets/og-card.png';

    serveShell(LinkPreview::injectInto($html, LinkPreview::tags($tournament, $pageUrl, $imageUrl)));
} catch (Throwable $e) {
    error_log('preview.php: ' . $e->getMessage());
    serveShell($html);
}
