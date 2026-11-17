# 03 — Wire the page in as a prerendered public page

Status: resolved
Type: task
Blocked by: 02

Route `/cornhole-score-keeper`, wired in everywhere `/blind-draw-generator` is:

- `app.routes.ts`: lazy route with a `title` and `data.description` (for SEO and the share card).
- `app.routes.server.ts`: `RenderMode.Prerender`.
- `frontend/src/.htaccess` page list and `frontend/src/sitemap.xml`. The flatten script
  fails the build if either is missing.
- `api/lib/PageView.php` `PAGES`, plus a case in `tests/PageViewTest.php`.
- A display name in `admin/traffic.component.ts`.
- `FOOT_LINKS` in `shared/components/footer.component.ts` (+ spec). No home page tab yet.

Verify with `npm run build:prod` (the prerendered `cornhole-score-keeper.html` should exist
and contain the rules text), `npm run test:ci`, `.\run-php-tests.ps1`, and `php -l` on
`PageView.php`. When it ships, summarise it into `FEATURE_TRACKER.md` Done and
`FEATURE_ARCHIVE.md`.

## Answer

Done 2026-11-17. Wired in at every point listed above. The footer index notes it as "Keep
score of a game of cornhole". Joining `FOOT_LINKS` also makes the page end on the sheet foot,
which matches its sheet head. The footer spec's index count now follows `FOOT_LINKS` rather
than a hard-coded 4.

Verified: `php -l` clean, 218 PHP tests and 587 frontend tests pass, and `npm run build:prod`
prerenders 11 routes. `cornhole-score-keeper.html` has its title, description, canonical,
`og:image`, the large Twitter card and the rules text, and its sheet foot indexes the other
five pages. Summarised into `FEATURE_TRACKER.md` (Done, not yet deployed),
`FEATURE_ARCHIVE.md` and CLAUDE.md's prerendered page list.
