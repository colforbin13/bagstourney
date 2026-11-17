# Feature Archive

Detailed implementation notes, design decisions, and verification history for shipped
items. `FEATURE_TRACKER.md` lists these in one line each with a link into this file;
this is where the "how" and "how it was verified" live.

### Sponsor logos

`FEATURE_TRACKER.md` item 20, built and deployed 2026-11-17. Board sponsors are how fundraisers
raise money, and the fundraiser guide tells organizers to sell them; this puts the sponsor on
the screen everyone watches.

**Decisions** (with Matt): no board-tied sponsors; Pro only, with no free logo; a logo may
carry a link, opened in a new tab. Placement changed during design: first the TV boards
column, but that only exists when boards are on and the tournament is live, so instead a
narrow bar across the bottom of every bracket page and of TV mode, the same spot in every view.

**Display.** `shared/components/sponsor-bar.component.ts`. On the page the bar is fixed to the
bottom of the window (56px, 48px on a phone); a sticky bar was tried first and sat mid-screen
on a short bracket. The view toggles `body.has-sponsor-bar`, which pads the page so the footer
clears it and lifts toasts above it. On a TV it is a 76px band, the last row of the kiosk
layout, with plain images (nobody taps a TV); more than five take turns in even groups (8
shows 4 and 4) every 12 seconds. Shown in setup, play and after the final. No sponsors, no bar.

**Upload and storage.** The app's first file upload. Images are stored in
`tournament_sponsors` (migration `024`), not on disk, because `deploy.ps1` mirrors the web root
and would delete uploaded files; this also puts them in the database backups. Uploads come as a
base64 data URL inside JSON, so the router needed no multipart handling. `api/lib/SponsorImage.php`
(`tests/SponsorImageTest.php`, 13 tests) takes the type from the bytes, never the claimed type,
allows PNG, JPEG and WebP only (no SVG, which can carry script), caps files at 1 MB and 4000px a
side, and only stores http(s) links (a bare domain gets https://). `GET /sponsors/{id}/image?t=`
serves the logo with the sniffed type, `nosniff`, `default-src 'none'` and a one-year immutable
cache; the random token is both the access check and the cache key, since logos are never
replaced in place. The bracket response carries the list without image bytes.

**Plan.** `tournamentHasPaidFeatures()` is checked only when a logo is added. Rename, link edit,
reorder and remove work on any plan, and logos keep showing if the plan lapses. Max 8.

**Manage screen.** A Sponsors fold beside Staff & access, loaded on first open (no request for
organizers who never open it): thumbnails, editable links, up/down, remove, and an add form with
a client-side type and size check that only saves a round trip.

**Marketing.** Pricing (both paid tiers), How it works (TV chapter), the fundraiser guide's
board-sponsors tip, and the Scoreholio comparison (new row; Scoreholio's one-free-logo fact is
from the October 2026 research). The same pass fixed How it works still saying a draw needs an
even number of players, wrong since item 19.

**Verified.** PHP 243 and frontend 668 passing. 30 end-to-end API checks on tournament 79,
restored from the deleted list for the purpose: upload and exact bytes back, response headers,
wrong or missing token, refusals (SVG, HTML as PNG, `javascript:` link, blank name, no image,
over 1 MB, anonymous, a ninth logo), bracket payload, reorder, link edits, and the lapsed-plan
rules. Then the bracket page, TV band and manage fold in Chrome. Tournament 79 was left live
with 7 sample logos for a look on production.

### Odd player handling (ghost partner)

`FEATURE_TRACKER.md` item 19, built and deployed 2026-11-17, from the Scoreholio comparison.
A blind draw refused an odd number of players, so the organizer had to turn someone away or
find a filler at the door.

**Model.** The odd player out gets a team of one: `teams.participant2_id` NULL (migration
`023` makes it nullable), named "Sam (solo)" by `SoloTeam::defaultName()`
(`api/lib/SoloTeam.php`, `tests/SoloTeamTest.php`). Chosen over a fake ghost participant,
which would have leaked into rosters, counts, the plan cap and notification emails. Every
query that joins a team's second player is a `LEFT JOIN` (`TeamController::TEAM_SELECT` and
`ParticipantController`'s rename were the two inner joins). A rename of the solo player keeps
"(solo)" on a still-default team name; `teamParticipants()` on the frontend mirrors the rule
and shows "Sam (solo)" under a renamed solo team.

**Draw.** `BlindDraw::pair()` pairs an odd one out with null. In a random draw the team order
is shuffled again only when the field is odd, so the solo team is not always the bottom seed
(which could never get a bye) while an even draw is unchanged. In a balanced draw the ghost
joins the smaller group, which is the same as one leftover player from the larger group going
solo, so every other team stays A-with-B. `TeamController::draw()` does this only when the
request carries `allow_solo`, which the manage screen sends after the organizer confirms; an
older client still gets the "even number" refusal. The floor is now three players.

**Rule.** `tournaments.ghost_rule` (`walk`, `four_bags`, `sub`, `custom`) plus
`ghost_rule_text` (custom only, 120 characters, whitespace tidied; any other rule clears it).
Decided with Matt: walking is the free default, the rest are Pro, checked when chosen in
`TournamentController::update()` like every paid feature, never during play; going back to
walking is always allowed. The app records only final scores, so a rule changes what players
are told, not scoring: one sentence from `shared/solo-team.ts` on the bracket page, under the
TV title bar, and on that team's score cards (`soloTeams()` finds solo teams from the bracket
matches and pool standings, since pool games carry no player names). The picker sits in the
draw box, above the button, and in the solo team's panel, rather than in Settings.

**Latecomer.** `PUT /teams/{id}/partner` creates the player (approved) and fills the slot;
"Sam (solo)" becomes "Sam & Lee" unless renamed. Refused once the team has a completed match
or pool game, after the tournament ends, for a full team, or over the plan's player cap.

**Free generator.** `shared/blind-draw.ts` mirrors the draw: a null partner, the same
reshuffle, "Sam (solo)", a three-player floor, and copy that explains the ghost.

**Verified.** PHP 230 and frontend 650 passing; removing the odd-field reshuffle fails a test.
Migration applied to production 2026-11-17. 23 end-to-end API checks against the local stack
as the plain organizer test account (draw with and without `allow_solo`, no ghost participant,
rule validation and the free-plan 403, Pro after a plan override, rename, partner swap and its
refusals including after a scored game, three- and two-player fields), then the manage screen,
bracket, TV, score entry and free generator in Chrome. Test tournaments 75 to 80 were deleted
(soft delete, so their rows remain).

### Bracket and TV mode sections

`FEATURE_TRACKER.md` item 25, built and deployed 2026-11-17. A double-elimination bracket,
more so with pool play in front of it, was one very long page (pool, winners, losers, grand
final stacked), and TV mode scaled all of it onto one screen until nothing was readable; at
1080p the double-elimination example sat small under the boards band with much of the screen
unused.

**Sections.** `shared/bracket-sections.ts` (pure, `bracket-sections.spec.ts`) lists a
bracket's sections in play order: `pool` when the pool has started, then `bracket` for single
elimination or `winners` / `losers` / `finals` for double. Each carries `done` (every match
complete or bye; for finals and single elimination, the champion rule from `championName()`,
because the deciding match is never played when the winners side takes the grand final) and
`waiting` (no team placed anywhere in it yet). `liveSection()` is the first not done, else the
last. Single elimination without pool play has one section, so no buttons and the old page.

**Page.** A row of buttons under the header; the default is the live section, and a pick is
written to `?view=` so a link keeps it. Once the bracket exists the pool is a section of its
own (it used to sit under the bracket) and no longer says the bracket is coming.

**TV.** Decided with Matt: 30 seconds per section; `rotationSections()` skips finished
sections and ones still all TBD (a losers bracket or final with nobody in it has nothing to
read), falling back to the open ones, then to the last section, so a decided tournament
settles on the champion. The title bar names the section with a dot per rotation step. The
boards panel moved from a band across the top to a fixed column on the right
(`BoardsPanelComponent` `column` input), since a 16:9 screen has width to spare and the
bracket needs the height. `?kiosk=1&view=losers` pins a screen to one section; the TV mode
button clears any page pick so the TV rotates.

**Mirroring.** The winners tree of double elimination is a true halving tree, so it reuses
the single-elimination mirrored layout (labels via `roundLabel(..., 'winners', format)`, no
champion line in the middle, which is the winners final). The losers bracket never mirrors.
On the page the rule is the old one: mirrored unless narrow. On a TV, mirroring only pays when
the tree is limited by height with width to spare, which the boards column changes, so
`shared/bracket-fit.ts` (`bracket-fit.spec.ts`) estimates the other layout from the measured
one (column width and non-grid height recovered from the measurement) and `recomputeFit()`
switches when the other scales at least 5% larger, one switch per fit, so it cannot oscillate.
The estimate ignores extras such as the trophy line, which can make it under-guess a stacked
width by up to about 20%; it still picked correctly in every case checked.

**Verified.** Frontend suite 627 passing. Mutation checks: dropping the done filter, the
TBD filter, the champion rule for finals, and the 5% margin each fail at least one test. In
Chrome at 1080p: Legion Hall example sections and pinning; its 16-team winners bracket
mirrored at 0.84x beside the boards (stacked estimated 0.75x); the 8-team Labor Day example
mirrored at 1.43x on the full width and switched to stacked at 1.42x when the stage was
narrowed to 1400px (mirrored about 1.03x). Phone width was not checked in the browser.

### Free cornhole score keeper

`FEATURE_TRACKER.md` item 24: a free public page for keeping score of one game of bags, which
doubles as a search landing page ("cornhole score keeper") ending in an invite to run a
tournament, the same job the blind draw generator does. Added and built 2026-11-17 per Matt;
spec and tickets in `.scratch/bags-scorekeeper/`.

**What changed.** `/cornhole-score-keeper` (`bracket/bags-scorekeeper.component.ts`). Two team
cards side by side, each with an editable name, the running score and 44px steppers for bags
in the hole and on the board (+ stops at four bags a side). A line under the board previews
the round before it is scored. Undo drops the last round and puts its bags back on the
steppers, so a miscounted round is fixed rather than retyped. Settings (scoring mode, play-to,
going over) show until the first round, then collapse to a summary. "New game" mid-game takes
a second tap; after a win it keeps the names. Prerendered with the rules as copy (points,
cancellation, straight, busting, how to use it), and wired in like the generator: server
route, `.htaccess` page list, sitemap, `PageView::PAGES`, the Traffic page name, and
`FOOT_LINKS`, which also makes it end on the sheet foot.

**Rules.** The logic is pure in `shared/bags-score.ts`: `scoreGame(settings, rounds)` replays
a whole game. In = 3, on = 1. Cancellation (default) awards only the difference to the side
ahead; straight keeps both. Target editable, default 21. Without a bust rule, reaching or
passing the target wins. With one, a side must land on the target exactly, and going over
sets it back to 13, 15 or its score before the round (a 13/15 set-back must be below the
target; lowering the target under it switches to "previous score"). Under straight scoring
both sides can finish together: the higher total wins, and a tie goes to extra rounds played
without the bust rule until a round separates them. Without that exemption, two sides tied
at the target under "previous score" could never separate.

**Design decisions.** Settings are fixed once the first round is scored, so the round history
always matches the score. The stored game is `{ v: 1, settings, names, rounds }` under
`bb_bags_game`, read only in the browser and replayed through `scoreGame`, so a corrupt or
hand-edited value fails validation and starts a fresh game rather than showing a wrong score.
Nothing reaches the server. No home page tab yet; revisit if Traffic shows it earning one.

**Entry points for players mid-tournament.** Players at an event never see the marketing
pages, so the page is also linked from the quiet footer's link row (under every public
bracket, the sign-up page and the working screens) and from the sign-up confirmation
("Keeping score? Try our free score keeper."). Both use neutral wording: PRODUCT.md keeps
the app sport-neutral, and the page they open is the one that names cornhole. A "Keep score"
link on each now-playing board, with team names prefilled, was considered and declined by
Matt for the same reason: the bracket page serves any doubles game, and gating it on the
venue label "board" would still send darts players to a cornhole page. Revisit if the app
ever records a tournament's sport.

**Verified.** `bags-score.spec.ts` (27 specs), mutation-checked: removing cancellation, the
"previous score" set-back, the tie rule, the extra-rounds bust exemption or the four-bag cap
each fails at least one (requiring an exact hit vs. `>=` is an equivalent mutant, since a bust
already pulls the score under the target). `bags-scorekeeper.component.spec.ts` (13 specs:
scoring, the cap, undo, winner and new game, locked settings, a straight game with a bust,
the two-tap clear, reload restore, corrupt storage, no storage while prerendering). 587
frontend tests and 218 PHP tests pass. Production build prerenders 11 routes and flattens
`cornhole-score-keeper.html`, which carries its title, description, canonical, share card
and rules text, and ends on the sheet foot without listing itself. In Chrome at 402x680 the
whole tool through "Score round" fits the first screen with no sideways scroll; played to a
win, reloaded mid-game and got it back, no console errors.

### Decluttered tournament management screen

2026-11-17. Commit `41a0515`, plus the follow-up that fixed button heights, trimmed the
stylesheet and recorded these notes. Came out of an Impeccable audit (11/20) prompted by
"multiple action buttons, long lists of participants and teams, all starts to feel too
cluttered", then distill, layout, adapt, harden and polish run in that order.

**One roster.** The screen used to show the participant list and the team list together once
teams were drawn: 48 players and 24 teams on a finished tournament, each a boxed card with its
own Edit button. Once teams exist the Teams list is now the only list. Opening a team
(`toggleTeam()`, one open at a time) shows a rename field and each player with "Edit player";
players are looked up through the `participantById` map. Team names became editable during
setup as a side effect: the row is the same in every phase, and `TeamController::update` had
always allowed it. In setup, before the draw, the player list is still the roster: pending
sign-ups sort first (`rosterInOrder`), replacing the separate pending banner, and a row opens
the editor with "Remove player" inside it, replacing the red ✕ beside Edit.

**Order.** Toolbar, then the champion (finished only), then the task for the phase (setup
checklist and add-players, or pool standings, or Teams), then the folds. Settings (entry,
seeding, format, boards) folds to one line whose summary is `settingsSummary`; it is hidden on
a finished tournament. Staff & access folds below it, open while a user is being picked.
Transfer ownership moved to its own line with "You'll become a manager", away from the Add
buttons, since it hands the tournament over in one tap.

**Toolbar.** Badges are status, visibility and cap only; format and seeding badges were cut
because the settings line says the same. The super-admin plan override moved from a badge-row
button into the Actions menu. Upgrade is a link beside the cap rather than a black button.

**Harden.** The Actions trigger has `aria-expanded`/`aria-controls`, Escape closes it and
returns focus (`onEscape()`, which otherwise closes the QR dialog), and its caret is a drawn
SVG. `showToast()` takes a kind; every failure call site passes `'error'`, since errors had been
showing in success green. The QR modal is `role="dialog"`. Long names wrap
(`overflow-wrap: anywhere`) instead of overflowing or truncating.

**Two traps worth knowing.** A `cdkDragHandle` inside a shared `ng-template` resolves its
injector where the template is declared, so it can't find its `cdkDrag` parent; the manual
seeding handle sits in the drag wrapper, outside the shared `#teamRow` template. CDK's drag
preview attaches to `<body>`, so component-encapsulated styles never reach it; the global
stylesheet already styles it, and copies in the component were dead.

**Button heights.** `.btn` set no line height, so an `<a class="btn">` (body line height 1.5)
was about 4px taller than a `<button class="btn">` (browser default, about 1.2). Most visible
as the Actions button beside Enter scores and View bracket. `.btn` now sets 1.2, which matches
the 57 real buttons and shortens the 11 link-buttons. Measured: small link 32.7px and button
28px before, both 29px after.

**CSS budget.** The component stylesheet passed the 10kB `anyComponentStyle` error limit.
Dead code went first (`border-radius` rules, which are all 0 because `--radius` is `0px`, a
duplicate `.team-players`, `.section-label` properties already global): 9.90kB to 9.61kB. The
error limit in `angular.json` is now 16kB; the 5kB warning stays, and was already exceeded by
this screen, the public tournament list and the bracket view.

**Verified.** 547 frontend tests (10 new: one roster, Actions menu, error toast, plan
override). Phone-width (402px) full-page captures of two real tournaments, before (committed
code) and after, against the production database:

| Screen | Before | After |
|---|---|---|
| Live, 32 players: page height | 4,181px | 1,757px |
| Live: Teams list starts | 826px | 273px |
| Finished, 48 players: page height | 5,602px | 2,251px |
| Finished: champion | 5,250px down | 313px down |

Coarse-pointer targets measured at 44px or more. Deployed and checked on production by Matt
2026-11-17. **Not checked in a browser:** the setup phase, since writing a test tournament to
the production database was blocked; it is covered by unit tests only.

**Open.** Delete is still on every dashboard row, including the public examples for an
organizer who doesn't own them (the Door Flyer follow-ups note; Manage is gone now).

### Door Flyer follow-ups

2026-11-16, the evening after the redesign shipped. Commits `84fb6bf` through `c08e0f4`.

**Flyer on the public pages** (`84fb6bf`). How it works, Pricing, Sports, the blind draw
generator, the fundraiser guide and the Scoreholio comparison share the global `.sheet-head`,
`.sheet-body`, `.measure` and `.ruled` classes. They first ended on a tear-off strip with the
footer flush beneath; Matt felt it was off, and it was: tabs only make sense hanging from the
bottom of a green sheet that fills the screen, and under white stock the strip read as a
second footer with the real one repeating its links. It became the **sheet foot**, drawn by
`<app-footer>` itself and picked by route (`SHEET_PAGES` / `endsOnSheet()`): one closing line
and hero action, the other marketing pages as ruled rows with a few words each (`FOOT_LINKS`),
the wordmark and legal links. It is the only ending those pages have. The home page keeps its
own tab strip; brackets, working screens and the legal pages keep the quiet footer.

**Tour video** (`e10dc1a`). The How it works video was the September `/brag` render in the
old look. Re-skinned with the same storyboard, timing and audio; source and renders are in the
git-ignored `brag-output-2026-11-16-210908/`. The 1280x720 `brag-web.mp4` and its poster are
what ship as `assets/bracketway-tour.mp4` / `.jpg`.

**Plain-language pass** (`c06620f`). An audit for copy that read as playful or machine-written
found the site mostly plain, with How it works the outlier (about fourteen em dashes). Changed:
em dashes recast, stock phrases ("in one place", "for good reason", "an honest look") cut,
"Step 01" labels replaced by numerals beside the titles, and three lines removed that implied
an existing customer base ("See what people run", "the ones organizers actually run", "Where
most Bracketway tournaments happen"), which PRODUCT.md rules out. "Two-person teams" is
"two-player teams" everywhere. Kept on purpose: "Tournaments in play", and How it works'
closing joke about arguing over the semifinal.

**Link preview image everywhere** (`e7dcdbd`). Only shared bracket links had `og:image`; the
home page previewed as text. `SeoTitleStrategy` now adds the card and a large Twitter card to
every described page. Verified on production after deploy, including as Facebook's, Twitter's
and Slack's crawlers. A preview cached before the deploy keeps showing no image; a changed
URL (`?v=2`) or the platform's own re-scrape tool refreshes it.

**Example brackets band** (`b2c5ff7`, `c08e0f4`). With no real tournaments yet, "Tournaments in
play" was only ever the five examples, labelled by status and start date. They moved into a
band under the three steps, each row named for what it shows by `exampleShows()` (read off the
tournament's settings) beside the made-up event, simplest format first. The real list follows
and is left out when empty; the last hero tab reads "Examples" until something real is live.
`/tournaments` keeps them as a group in its list. How it works and Pricing link to the double
elimination and pool play examples through `EXAMPLE_BRACKETS`, written down because those
pages are prerendered; update it if an example is reseeded. Anchor scrolling was off app-wide
(`app.config.ts`), so the old "Live brackets" tab had never scrolled. An example's own bracket
page and TV view said "Live" on the pink badge; they now say "In progress", as the list did.

**Open from this pass.** The double-elimination example in TV mode at 1080p renders the bracket
very small under the boards panel. The organizer dashboard shows Manage and Delete on the
public examples for an organizer who doesn't own them; not checked whether they work.

### New look: "The Door Flyer"

The cream, brick-red and Bebas Neue look read as generic. The replacement came out of the
Impeccable direction round (seed `387d4f9edd498049`, candidate 4 of 7, built code-led with no
comp round): the flyer taped to the bar door, one bright green sheet and one black ink. The
direction contract is `.impeccable/surfaces/app-bracket-tournament-list-component-ts-8fa58068.md`;
the rules are `DESIGN.md`, the product framing `PRODUCT.md`. Commit `9bf7b48` is the build.

**Rules worth not re-deriving.** Pink means live right now and nothing else, so a made-up
example tournament never takes it, whatever its seeded state ("In progress", outlined).
Marker green means won or confirmed, including "Won by" lines on the home page; the finish
review asked for those in black and Matt declined, because it is documented. Shadows exist
only at a sheet's edge: the sign-up sheet, and the menu edge on every dropdown and modal. The
display voice runs at one width (106%); only the wordmark goes wider.

**Signed-in screens** (`e76a563`). Reviewed in a browser at desktop and phone width.
Fixes: admin tables (users, audit log, traffic) ran to the window edge and now use
`.page-table` on the header's `--page-gutter`; `.field-hint` lived only in the dashboard, so
the manage page's hints rendered at 16px, and it is now global; Billing and Deleted
tournaments had their title right-aligned beside the back link; Restore buttons were solid
black on every row; the Actions menu and both modals used an off-rule shadow; change
password overrode the global input, losing the focus ring and dropping to 0.9rem (iOS zooms
below 16px); QR modal titles were title case.

**Emails** (`e76a563`, `f24540f`). Notification and verification emails take the palette:
green header band, white card under a toner rule, square black button, sentence-case labels.
While restyling, the round labels turned out wrong for double elimination: "Round 2" doesn't
say which bracket, and the round-complete email's "next round" query mixed winners and losers
matches that share a number. `api/lib/RoundLabel.php` mirrors the frontend's `roundLabel()`
(`tests/RoundLabelTest.php`); round-complete queue rows now record the finishing match in the
existing `match_id` column so the email can read `bracket_side`. Rows queued before that
deploy have no match and read as the winners side. Verified with a read-only dry run of the
builders against tournament 67; nothing was sent.

**Finish review** (`3ce9f54`). First pass: `fix`, five findings. Applied: examples off pink,
the phone sheet tightened so the draw bar and caption clear the 844px fold, steps and list
moved onto `--page-gutter`, one display width, `text-wrap: pretty`, and a 4+3 features
grid. Declined: "Won by" in black (see above). Verdict pass on recaptures: `ship`, covering
those fixes. Separately, Matt made the Apple Lane tournament private, whose real winning
team, "Sponsored by Xfinity", read as an endorsement on the home page.

**Phone fold, after deploy.** On a real iPhone 16 Pro the six names fit but Safari's bottom
toolbar covered "Draw the teams": the 844px viewport used in review is not what Safari leaves
clear on first load (about 680px on a 402px-wide phone). The phone rules were tightened
again (headline, call to action, sheet line height, draw bar) so the bar ends at 655px at
402x680. At 390px wide the lede wraps one line longer and the bar ends at 679px, mostly
clear. Check the fold against Safari's visible height, not the device viewport.

**Recapturing for review.** The Chrome extension window can't be resized when maximised, so
review captures were taken with headless Chrome over the DevTools protocol at a real
viewport (1440x900, 390x844 mobile) and captured full page, saved as
`.impeccable/review/desktop.png` and `mobile.png`.

### Traffic page for super admins

Matt asked (2026-10-23, after the AlternativeTo listing went live) how to see what traffic the
site gets: Google Analytics, our own logs, or a dashboard under admin.

**Why not Google Analytics.** The privacy policy promised "no advertising or analytics
trackers"; GA would have meant rewriting that, a third-party script on every page, and a
cookie notice for EU visitors. What Matt needs (is anyone coming, from where, to which page,
and do they sign up) fits in one small table. Google Search Console, which Matt already uses,
covers the one thing we can't see: the search terms.

**What's counted.** `TrafficService` (frontend) sends a beacon on every `NavigationEnd`, in
the browser only. The first page of a tab's session is a *visit* (in memory for in-app
navigation, `sessionStorage` `bb_visit` across reloads) and carries `document.referrer` plus
any `utm_source`. Nothing is sent for `/admin/*` (except sign-in and create-account) or
while a super admin is signed in. `api/lib/PageView.php` decides the bucket: known public
pages as themselves, id pages as `/bracket/:id` etc., anything else `/(other)`, so the public
endpoint can't grow the table with made-up paths. User agents matching a bot pattern (which
includes `HeadlessChrome`, so a Playwright check needs a normal UA) are dropped.
`page_views` (migration 022) is one row per day/path/source with `visits` and `views`
counters, written with `INSERT … ON DUPLICATE KEY UPDATE`. No IP, no user agent, no cookie.

**The page.** `GET /analytics?days=7|30|90` (super admin) returns daily totals with empty
days filled (`PageView::fillDays`), the previous period's visits for the up/down note, top 15
pages and sources, and organizer activity counted from `users`, `tournaments` and
`participants`. Dates come from MySQL's `CURDATE()` so the PHP timezone can't shift a day.

**Known limits.** A visitor who blocks `sendBeacon` or JavaScript isn't counted. Anyone can
post junk to the beacon; paths are bounded by the bucket list, sources only by length (60
characters). Privacy policy wording and effective date updated (October 23, 2026).

**Verified.** `tests/PageViewTest.php` (11 tests; every guard was broken in turn and a test
failed each time). Frontend specs for the service and page. End to end against MariaDB with
the production build: a visit from AlternativeTo, a QR-tagged visit plus reload (one visit,
two views), and a super admin's own browsing (not counted) produced exactly the expected rows.

### Balanced (A/B) blind draw

Prompted by a 2026-10-18 r/Cornhole thread ("Question about blind draw"): an organizer with 26
players (14 A, 7 B, 5 C) worried a random draw would stack teams. The top replies suggested
seeding upper/lower brackets from rounders PPR and pairing with the "50/50 method": split the
field into a top and bottom half, then pair one random player from each.

What shipped is the 50/50 pairing, as an opt-in:

- `tournaments.draw_mode` (`random` default, `balanced`) and `participants.draw_group` (`B`
  default, `A`), migration 021. Defaults keep every existing tournament drawing exactly as
  before, and self-registered or newly added players land in B.
- `api/lib/BlindDraw.php` does all pairing now (TeamController::draw() used to `ORDER BY RAND()`
  and `array_chunk`). Balanced: shuffle each group, pair A[i] with B[i], pair any leftovers
  within their group, then shuffle the team order, since that order is the seed order and a
  leftover A-A team shouldn't always be the bottom seed. `tests/BlindDrawTest.php`, mutation
  checked (dropping the final shuffle, the B shuffle, or the group test each fails a test).
- Uneven groups draw rather than error. Matt asked to keep the plain draw simple, and a hard
  "groups must be equal" stop at the door is the opposite of that; the page shows the counts
  and says how many players will pair within their group.
- UI: Matt asked for no clutter. The option sits in a collapsed "Advanced" disclosure on the
  Team Entry card; only when it's on do the participant rows grow an A/B button and the
  label show "2 A · 4 B". `draw_mode` changes only during setup; `draw_group` changes during
  setup (PUT /participants/{id} with just `draw_group`), so a regroup-and-redraw works.
- The free generator mirrors it (`pairBalanced()` in `shared/blind-draw.ts`): an Advanced
  checkbox swaps the one list for an A list and a B list.

Not built, from the same thread: upper/lower brackets (two tournaments already does it) and
rounders/PPR seeding (needs per-player stats, rotating partners and bag-level scoring; it is
the marketing plan's "rotating partners" item).

### Free blind draw generator

Marketing handoff item 3: a free public tool that pairs names into random teams and shows a
preview bracket, ending in a "Run it live" button to sign-up, indexable by search engines.
Added 2026-10-18 per Matt, right after the pricing fix below.

**What changed.** `/blind-draw-generator` (`bracket/blind-draw-generator.component.ts`). Paste
names (parsed by the same `shared/name-list.ts` as the fast blind-draw paste box, so repeats
are skipped the same way), draw, see the teams by seed and a single-elimination preview, copy
the teams, draw again. 4 to 64 players, even numbers only, matching the app's own draw rule.
The logic is pure in `shared/blind-draw.ts`: a crypto-random Fisher-Yates shuffle, pairs in
order seeded 1, 2, 3 like `TeamController::draw()`, and 1 v N seeding with byes to the top
seeds using the same `seedOrder` recursion and bracket size as `BracketBuilder`, so the preview
is the bracket a real tournament would get. Byes advance into round 2 in the preview, as the
live bracket does. Prerendered with explanatory copy ("How a blind draw works", "Running a
blind draw cornhole tournament"), added to the sitemap, the `.htaccess` page list and the
footer links.

**Design decisions.** Nothing is saved and nothing leaves the browser: no API, no account,
no abuse surface. The draw only happens on a click, never at build time, so the prerendered
page can't ship a frozen result. "Run it live" goes to sign-up (signed-out) or the dashboard;
carrying the names over into a new tournament is a possible follow-up.

**Pricing in the prerendered page.** The build has no API, so `/pricing` was prerendered with
plan names but no prices. `pricing.component.ts` now starts from `FALLBACK_PLANS` ($9.99/mo,
$99.99/yr, $12.99 one tournament, per Matt); the API's answer still replaces them in the
browser, an explicit "billing is off" still hides them, and a failed request now keeps them
rather than blanking the prices. The page description names the prices too.

**Verified.** 488 frontend tests pass (new: `blind-draw.spec.ts` for shuffle, pairing, seed
order, byes and match numbering; `blind-draw-generator.component.spec.ts`; pricing specs for
the built-in prices). Production build prerenders 8 routes; `pricing.html` contains all three
prices. On local Apache 2.4 with the real `.htaccess`: `/blind-draw-generator` 200 with its
own title, trailing slash 301s once. Headless Chromium at 390px and 1280px: 12 names drew 6
teams, quarterfinals/semifinals/final with seeds 1 and 2 on byes, no console errors; with the
API unreachable, `/pricing` still shows $9.99 / $99.99 / $12.99.

### Prerendered public pages for search

Every URL used to return the same empty `index.html` with a bare `<title>Bracketway</title>`,
so search engines that don't run JavaScript saw nothing, and even Google saw one title for the
whole site. The marketing handoff (`Bracketway Marketing → Code Handoff.md`, item 4) names
prerendering as the prerequisite for any page ranking. Added 2026-10-17 per Matt.

**What changed.** `angular.json` builds with `outputMode: "static"` and a build-time entry
(`src/main.server.ts`). `app.routes.server.ts` prerenders `/`, `/how-it-works`, `/pricing`,
`/sports`, `/terms`, `/refunds` and `/privacy`; everything else stays client-rendered. Each
route now carries a `title` and `data.description`, which `SeoTitleStrategy`
(`shared/seo.ts`) turns into the page title, meta description, canonical link and basic Open
Graph tags, at build time and on every client navigation. `sitemap.xml` and `robots.txt` are
new build assets.

**Design decisions.**
- **Static files, not a Node server.** The host is Apache with PHP; build-time output deploys
  through the existing `deploy.ps1` unchanged. Tournament pages are not prerendered: their
  content changes by the minute, and `/bracket/...` already gets per-tournament tags from
  `api/preview.php`.
- **The build makes no API calls.** A server-only `HttpBackend` completes every request empty,
  so nothing from build day (a stale tournament list, an error) is frozen into the HTML. The
  catch: Pro prices on `/pricing` come from Stripe through the API, so they appear only once
  the page loads in a browser. The page's description names the plans instead.
- **Prerendered as signed out, hydrated in the browser.** `provideClientHydration()` adopts
  the HTML instead of redrawing it. Signed-in visitors see the nav and buttons swap once the
  app is stable. That exposed a real problem: `AuthService`'s 8-hour session-expiry timer kept
  the app permanently unstable, so the signed-out footer link never went away for signed-in
  users. The timer now runs outside Angular's zone.
- **`index.html` is the landing page now; the empty shell is `index.csr.html`.** `.htaccess`
  serves a prerendered folder's `index.html` for its route (301ing a trailing slash away so
  each page has one URL) and falls back to `index.csr.html`. Falling back to `index.html`
  would flash the landing page before every admin screen. `preview.php` reads
  `index.csr.html`, falling back to `index.html` for an older build.

**Verified.** 472 frontend unit tests pass (new: `seo.spec.ts`; an `AuthService` case for
build time; the footer spec now matches Matt's wording change). `npm run build:prod` reports
7 prerendered routes, each with its own title, description and canonical in the HTML. Driven
in headless Chromium against the production build, with a mock API and routing that mirrors
`.htaccess`: prerendered pages serve their own file and client routes get the shell; signed-in
visitors get the signed-in nav, hero buttons and no footer sign-up link; live prices load;
client navigation updates title and canonical; no console errors beyond fonts the sandbox
blocks. `ng serve` still works. Not verified against real Apache: the rewrite rules were
checked by reading only, so check `/pricing`, `/pricing/` and `/admin` after the first deploy.

**Canonical cleanup (2026-10-26).** Search Console reported "Duplicate without user-selected
canonical" and "Google chose different canonical than user". The live site answered
`https://www.bracketway.com/...` with no redirect, and `/pricing.html`, `/index.html` and
`/index.csr.html` were reachable beside their clean addresses. `.htaccess` now 301s www to the
bare host, http to https (only for the real host names, and not when a proxy header says
https already), and the built `.html` files to their clean URLs. Bracket pages had no canonical
at all, so `?tv=1` and trailing-slash variants looked like duplicates: `preview.php` now serves
`<link rel="canonical">` to the uuid URL and the bracket page sets the same in the browser.
`/tournaments` got a description, which gives it a canonical. Rewrites verified on a local
Apache 2.4 against the production build.

**Fixed after the first deploy (2026-10-17).** That unverified rewrite was wrong. On the live
site `/pricing` looped forever: Apache's mod_dir redirected the folder `/pricing` to
`/pricing/` before mod_rewrite ran, and the rule removing the trailing slash sent it back.
Reproduced on a local Apache 2.4. Rather than `DirectorySlash Off`, which needs an
`AllowOverride` the host may not grant and would 500 the whole site if refused, the build
now flattens each page to a file (`scripts/flatten-prerendered.mjs`, run by `build:prod`):
`/pricing` serves `pricing.html` from an explicit page list in `.htaccess`. The script also
fails the build when a prerendered route is missing from that list or from `sitemap.xml`
(mutation-checked by dropping `terms`). Verified on the same Apache with the real `.htaccess`
and `api/.htaccess`: all seven pages return 200 with their own titles, `/pricing/` 301s once
to `/pricing`, query strings pass through, `/admin`, `/tournaments` and unknown paths get the
shell, `/bracket/...` still reaches `preview.php`, `/api/...` reaches `index.php`; headless
Chromium loaded each page with no console errors.

### Board assignments

FEATURE_TRACKER item 8 (its board half), chosen by Matt 2026-10-16 as the next feature after
pool play: at a busy venue the biggest question is where to go and when. Pro, without the
"you're up" email for v1.

**Shape.** `tournaments.boards` (0 = off, up to `BoardQueue::MAX_BOARDS` = 24) and a nullable
`board_number` on `matches` and `pool_matches`, set only while a game is being played
(migration `019_boards.sql`, additive and defaulted). No start times: bar nights run on
boards freeing up, not on a clock.

**Rules** are pure, in `api/lib/BoardQueue.php`, with 20 tests in `tests/BoardQueueTest.php`
(including a whole 12-team, 3-game pool on 4 boards), each rule mutation-checked:
- A game on a board keeps it; nobody is moved mid-game.
- A free board goes to the first waiting game in queue order (earliest round, then match
  number; winners before losers within a round) whose teams are both free.
- A team never holds two boards and never starts a later pool round while it owes an
  earlier one. Eligibility counts only *waiting* games, since a game on a board already
  makes its teams busy; that keeps the up-next list useful.
- `upNext()` lists games that can start now first, then games waiting on a team still
  playing.
- `move()` is the staff override: onto a free board, or a swap with the game there (a
  waiting game moved onto a busy board sends the other back to the front of the queue).
  Refused if it would put a team on two boards.

**Derived, not scheduled.** `BoardController::reconcile()` recomputes assignments from current
state after every change: a bracket or pool score, bracket generation, pool start, the board
count, or a manual status change. So a re-scored match, a regenerated bracket or a bye needs
no cleanup. It locks the tournament row so two scores entered at once can't take the same
free board. A non-live tournament or 0 boards just clears any boards left.

**API.** `PUT /tournaments/{id}` takes `boards` (Pro to turn on or change, never to turn off).
`PUT /boards/{tournamentId}` `{kind: match|pool, id, board}` moves a game (owner, manager or
scorekeeper; audit `board_moved`). `GET /matches` carries `board_number` on each game and a
`boards` summary `{count, playing, up_next}`, null when off.

**Frontend.** Manage screen Boards card (setup and live). Score entry orders games by board,
then the queue, with a Board N / Up next tag and a Move to select. Shared
`BoardsPanelComponent` (Now playing tiles, Up next list) on the public bracket and, in larger
type, under the TV bar. Live bracket cards get a Board N strip; pool games show their board.
`/how-it-works` and `/pricing` copy updated.

**Naming (added 2026-10-16 per Matt).** Not every game has boards, so each tournament picks
the word: board, court, lane, table, pit or field (`tournaments.board_label`, migration
`020_board_label.sql`, default `board`). Deliberately a word choice rather than a sport field,
in keeping with the sport-neutral design: nothing else changes. Allowed values are
`BoardController::LABELS`, mirrored by `shared/board-labels.ts`; the API sends it as
`boards.label` and an unknown value falls back to board. Changing it is free on any plan.
API error messages from a move avoid the word "board" so they read right for courts too.

**Verified** 2026-10-16: PHP suite including SQLite tests that play a whole 12-team double
elimination bracket on 3 boards checking every invariant after each game; API end to end on
MariaDB (pool play on 3 boards, scoring frees and refills, moves and swaps, bad board,
moving a finished game refused, shrinking to 2 boards, Pro gate, turning off while free,
anonymous 401, bracket after the pool); browser at phone, desktop and 1920x1080 TV.

### Pool play to set bracket seeds

FEATURE_TRACKER item 18, added and built 2026-10-15 per Matt: give every team more games
for the night and make bracket seeding earned rather than drawn.

**Decisions (Matt, 2026-10-15).** Pro feature (and the one-time upgrade), gated through
`tournamentHasPaidFeatures()` like double elimination. 2 to 5 pool games per team, default
3. Everyone advances; standings only set seeds. The tournament goes `active` (Live) when
the pool starts. Tiebreakers: win % first, then point differential per game, points scored
per game, head-to-head when exactly two teams are tied, then a stable random draw. Matt
dropped win % *as a tiebreaker* from the first proposal, since teams tied on it are by
definition equal there; it is the primary ranking instead (needed because an odd field
gives teams different numbers of games).

**Schedule and standings** are pure, in `api/lib/PoolPlay.php`, with 17 PHPUnit tests in
`tests/PoolPlayTest.php` (including an exhaustive no-rematch check for 2 to 40 teams),
proven to fail when the code is broken. `schedule()` is the circle method stopped after N
rounds; rounds are `min(games, n-1)` for an even field and `min(games, n)` for an odd one.
`standings()` breaks the final draw with `crc32(tournamentId:teamId)`, so it never shuffles
between page loads.

**Data model: a separate `pool_matches` table, not a stage column on `matches`.** The scope
proposed `matches.stage`, but every reader of `matches` (champion detection, the score
cascade, list stats, link previews, round-completed notifications) assumes it holds the
bracket, and a missed filter would give a silent wrong answer. A separate table needs no
change to any of them. There is no stored "stage" either: a pool-play tournament that is
`active` with no bracket rows is in the pool (`PoolController::inPoolStage()`).
Migration `018_pool_play.sql` adds `pool_play` to `seeding_mode`, `tournaments.pool_games`
and the `pool_matches` table. Additive; no existing tournament changes.

**Flow.** Blind draw: "Draw Teams & Start Pool" forms teams and schedules the pool in one
transaction (`TeamController::draw()` calls `PoolController::start()`). Direct entry: a
"Start Pool Play" button (`POST /pool/start`). Scores go through `PUT /pool/{id}` (owner,
manager or scorekeeper; ties and negatives refused) and every result rewrites `teams.seed`
from the standings. Reorder and Generate Bracket are refused until every pool game is
played; after that the organizer can drag a tweak and generate as with manual seeding. Any
later pool correction re-syncs seeds and so discards a drag tweak, on purpose. Once the
bracket exists pool results are locked. `pool_games` can only change during setup; the
bracket format can still change during the pool. Pool games send no email notifications.
The pool rides along on `GET /matches` as `pool` (null for other modes), so no screen
makes an extra request.

**Frontend.** Create form and manage screen get the Pool play option (disabled with a
"(paid plan)" note on free) and a games picker. Shared `PoolStandingsComponent` (W-L, +/-,
PF, progress line, tiebreak note) on the manage screen, the public bracket page (pool view
before the bracket, final standings under it afterwards) and the TV view (current round
only, larger type). Score entry lists pool games first and hides them once locked. The
tournament list and link previews say "Pool round X of Y" or "Pool play finished".
`/how-it-works` and `/pricing` copy updated.

**Verified** 2026-10-15: PHP 155/155, frontend 444/444, production build clean. API end to
end against local MariaDB (Pro gate on create and update, bad `pool_games` refused,
generate refused before start and before completion, tied score refused, seeds sync,
reorder and generate after completion, pool locked after the bracket, direct-entry start,
double start refused, team add after start refused, scoring after a plan lapse, anonymous
401). Browser at phone width and 1920x1080 TV: 12 players pasted, drawn, pool scored,
public and TV views, bracket generated with seeds 1 and 2 on byes, final standings under
the bracket.

### Fast blind-draw setup

Getting from "new tournament" to a drawn bracket meant typing every player into a single
name box and pressing Add, once per player. For a 24-player bar night that is the slowest
part of setup by far, and the marketing handoff (`Bracketway Marketing → Code Handoff.md`,
item 2) set a target of under two minutes from start to bracket. Added 2026-10-15 per
Matt, ahead of pool play (item 18).

**What changed.** The manage screen's add-players card has a paste box. It is the default
while the roster is empty; once players exist the single-name box comes back, with a
"Paste a list of names" link either way. The preview line counts new players, says how
many are already listed and will be skipped, and shows the resulting team count or an
odd-number warning. Adding reloads the tournament so the `n/32 participants` badge recounts.

**Parsing rules** (`api/lib/NameList.php`, mirrored in `frontend/src/app/shared/name-list.ts`):

- One name per line, or tab-separated (a spreadsheet row). A single line splits on commas
  and semicolons. Once there are several lines each line is one name, so "Smith, John"
  pasted one-per-line stays one person.
- Leading list markers (`1.`, `2)`, `-`, `*`, `•`) are stripped; a digit only counts as a
  marker when punctuation follows, so "3 Putt Pete" keeps his name. Runs of whitespace,
  including non-breaking spaces from web pages, collapse to one space.
- Repeats are skipped case-insensitively, against the existing roster and within the
  paste. Pasting the same sign-up sheet twice is a likelier mistake than two players
  sharing a name; a genuine second "Mike" can still be added one at a time.
- Names over 255 characters (the column width) are reported, not truncated.

The server parse is authoritative; the TypeScript copy only drives the preview, so drift
between them costs a count, never a wrong roster. Both test files carry the same cases.

**Endpoint.** `POST /participants/bulk` `{tournament_id, text}`, owner/manager only, same
roster-open rules as the single add (setup phase, no teams yet, blind draw mode only; the
shared checks moved into `ParticipantController::rosterClosedReason()`). It runs in a
transaction holding the tournament row `FOR UPDATE`, so a concurrent add or
self-registration cannot slip past the cap check. **All or nothing against the plan cap:**
a list that would overflow it adds no one and says how many would fit, rather than
silently dropping whoever came last. Input over 64 KB is refused. No audit-log entry,
matching the single add.

**Blind draw label.** The UI called the random-pairing mode "Auto-draft". It now says
"Blind draw" on the create form, the manage screen, `/how-it-works`, the home page and the
one API error that named it, per the marketing handoff. The stored value is still
`auto_draft`; only display text changed.

**Verification.** PHPUnit 136/136 (15 new, and breaking the single-line comma rule and the
case-folding fails 12 of them). Frontend 419/419 headless (22 new across the parser and
the manage screen), production build clean. API smoke-tested against a local MariaDB with
every migration applied: markers stripped and a repeat skipped; a re-paste refused as
"already in this tournament"; a 40-name paste on a 5-player free tournament refused with
"room for 27 more" and nothing inserted; exactly filling to 32 accepted and the 33rd
refused; a direct-entry tournament and a drawn tournament both refused; unauthenticated
call 401. Browser-checked at phone width: paste nine names with one repeat, preview reads
"8 new players · 1 already listed · 4 teams", Add, then Draw Teams & Start produces four
teams and an active tournament.

### Sport-neutral copy and the /sports page

The public copy still described Bracketway as a bag-toss tool — "Bag toss tournament
manager" in the home hero, "Settle it on the boards", and four more "boards"/"throws"
references across the landing steps and `/how-it-works`. Nothing in the app was ever
sport-specific (no sport column, no branching on game type; the engine draws pairs, seeds,
brackets, and stores two scores per match), so the copy was narrower than the product.
Added 2026-08-17 per Matt's request.

- **Existing copy went sport-neutral**, not sport-plural: "boards" → "at the venue" /
  "while you're still setting up" / "as each game finishes", "between throws" → "between
  games", and the Step 05 heading "Score it from the boards" → "Score it as you play".
  The hero eyebrow is now "Tournament manager for two-player teams" — the actual product
  boundary, and the one constraint that is real.
- **One deliberate exception to the neutrality**, a new `.hero-sports` line under the
  home lede naming six games (bags, KanJam, pickleball, horseshoes, darts, euchre) and
  linking to the new page. Fully generic copy tested badly against the obvious failure
  mode: a visitor who runs cornhole and sees no game named anywhere assumes the product
  isn't for them. Naming a few examples in exactly one high-traffic spot fixes that
  without re-narrowing every page.
- **New public `/sports` page** (`bracket/sports.component.ts`), lazy-loaded like every
  other route, grouping 21 games into Yard & tailgate / Racket & net — doubles / Bar &
  table / Cards — partners. Group list chosen by Matt 2026-08-17 (widest of three options
  offered — the card games are in deliberately: partner euchre/spades has the identical
  shape and is a real bracket people run). The groups are a plain `SportGroup[]` field on
  the component rendered with `@for`, so adding a game is a one-line edit and the page
  can't drift out of sync with itself.
- The page's closing "Don't see yours?" aside is load-bearing, not filler — a list of
  named sports reads as a whitelist unless it says outright that there is no sport field
  and nothing behaves differently per game. There's a test asserting that copy survives.
- Cross-linked from the home hero and from the `/how-it-works` lede. Deliberately **not**
  added to the nav: `/how-it-works` isn't in the nav either, and the nav is already at
  three items plus two dropdowns for a signed-in organizer. Both pages are aimed at
  visitors deciding whether to sign up, and both are reachable from the landing they'd
  actually land on. Revisit if the nav ever grows a proper marketing section.
- **KanJam is one word** — Matt called this out specifically. `sports.component.spec.ts`
  asserts both that the string appears and that "Kan Jam"/"Can Jam" appear nowhere, so a
  future edit can't silently reintroduce the wrong spelling.
- `README.md`'s one-line description and two stale code comments in
  `score-entry.component.ts` ("a phone at the boards", "the far set of boards") updated
  to match. Infrastructure names that happen to say "bags" were left alone on purpose —
  the `beanbag_tournament` database, the `bagsdbuser` account, the `/bags/api` router
  prefix, and the `bags-notifications` cron entry are all deployment facts, and renaming
  any of them is a production migration with no user-visible benefit.

Status: Built and browser-verified 2026-08-17 against the `run-bag-bracket` local stack —
`/sports` renders all four groups, and both cross-links route correctly from `/` and
`/how-it-works`. No backend change, no migration, no API surface touched: this is copy
plus one new lazy-loaded frontend route. 311/311 frontend tests passing (9 new — 7 for the
new component, plus one each locking the hero sports link and the how-it-works link),
`npm run build:prod` clean with `sports-component` as its own lazy chunk (4.77 kB),
`git diff --check` clean. Deployed by 2026-11-16.

### Landing content and richer tournament list on the main page

`/` was a bare `<h1>Tournaments</h1>` over one row per tournament (name, status badge,
arrow). Two problems fell out of that: a first-time visitor to bracketway.com had no way
to tell what the product was — and if no public tournament happened to be running, the
entire page read "No tournaments yet" — while the rows themselves carried no information
beyond a name and a status word. Added 2026-08-14 per Matt's request, explicitly wanted
regardless of monetization (see [[bag_bracket_monetization_priority]]).

- `TournamentController::list()` now selects a block of per-row aggregates
  (`LIST_STATS_SQL`) alongside `tournaments.*`: team count, playable-match count,
  matches played, total rounds, current round, and the champion's team name.
  Correlated subqueries rather than `GROUP BY` joins — the counts come from three
  different filters over `matches`, and the list is tens of rows at most.
- **Byes are excluded from both sides of the match-progress fraction.** They're
  auto-advance bracket placeholders that are never played and never reach `'complete'`
  (`TeamController::generateBracket()` sets `status = 'bye'`), so counting them in the
  denominator would leave every tournament permanently short of 100%. Verified against
  real data: production's "Test 7" is a 9-team bracket — 4 rounds, 15 total match rows,
  8 of them playable after 7 byes — and reports "2 of 8 matches", not "2 of 15".
- `champion_name` resolves the winner of the final via `next_match_id IS NULL`, which is
  structurally the only match with no successor; the bracket generator explicitly clears
  any `bye` status off a final match so the championship must actually be played.
- `withListStats()` moves those columns into a nested `stats` object and casts them to
  numbers — an unprepared `query()` returns every column as a string and the frontend
  does arithmetic on them. `current_round`/`champion_name` stay nullable (no bracket
  yet; nothing left to play). Modelled as optional `stats?: TournamentStats` on the
  frontend `Tournament` interface, and every read of it in the component is guarded, so
  a response from an older API build degrades to the old bare row rather than breaking.
  `listDeleted()` deliberately does not carry stats — the recovery screen doesn't use them.
- Frontend `TournamentListComponent` gained landing content: hero with value proposition
  and a "Create a tournament" CTA, a three-step how-it-works strip, and a mono feature
  row naming things that already ship but were invisible from this page (public bracket
  link, QR sign-up, email score updates, scorekeeper accounts).
- **The landing content is route-based, not session-based.** `showLanding` reads
  `data: { landing }` off the route rather than `auth.isLoggedIn()`, so `/` is the same
  full page for everyone, signed in or not, and a new `/tournaments` route renders the
  same component with the hero suppressed — the bare grouped list under a plain
  `<h1>Tournaments</h1>`. The signed-in nav's "Tournaments" link points at
  `/tournaments`; the brand mark and every "Return to home" link still point at `/`, as
  does `AuthService.logout()`, which is what you want — signing out lands you on the
  pitch. (First built keyed on `isLoggedIn()`, then changed per Matt: an organizer
  should still be able to see the front page, just not be forced through it.)
- The only part of the page that differs by session is the pair of hero buttons, because
  sending a signed-in organizer to the register/sign-in screens is a dead end: they get
  "Create a tournament" → `/admin` and "Your tournaments" → `/tournaments` instead.
  The list's empty state is likewise keyed on the session, not the route — an organizer
  with nothing yet gets the "Create your first one" shortcut wherever they're standing.
- No Apache change needed for the new route: the deployed `.htaccess` already rewrites
  any non-file, non-directory URL to `index.html`, so `/tournaments` deep-links and
  survives a hard refresh.
- Rows are grouped Live now → In setup → Completed, with empty groups omitted. `'setup'`
  only ever surfaces for a signed-in user; the public list endpoint filters it out.
  Each row gains a mono meta line (team count · round X of Y · N of M matches ·
  relative start date), a marker-coloured left edge and a progress bar for live
  tournaments, and a 🏆 champion line for completed ones. Status words are relabelled
  for a public audience — Live / Setup / Final — while keeping the existing
  `badge-{{status}}` classes.
- A name filter appears once the list exceeds 6 rows; below that it's noise.
- Decoration reuses the existing design language rather than adding to it: the hero's
  bracket watermark is the nav mark's geometry drawn at three rounds, in `--border`, and
  everything else runs on the existing `--surface`/`--marker`/`--accent` tokens and the
  Bebas/DM Mono pairing.

Status: Built and verified 2026-08-14 against the production database via the
`run-bag-bracket` local stack. `php -l` clean; 220/220 frontend tests passing (25 new in
`tournament-list.component.spec.ts`, which had no spec at all before); `npm run
build:prod` clean; `git diff --check` clean. All four route/session combinations checked
in a real browser: `/` anonymous and signed-in (hero present both times, correct CTA
destinations each way), `/tournaments` anonymous (public rows only) and signed-in (adds
the In setup group), with the nav link confirmed to land on `/tournaments` and highlight. No migration — read-only additions to an
existing endpoint. The champion path had no real data to exercise (production has no
completed tournaments), so a throwaway 4-participant tournament was created, played to a
final, confirmed to report `champion_name`, screenshotted, and then soft-deleted.
Anonymous and signed-in views were both checked in a real browser at desktop width;
**the narrow/mobile layout was not browser-verified** — `resize_window` reported success
but the viewport stayed at 1920px, so the responsive rules (grid collapse, hidden
watermark, wrapping header) are CSS review only. Deployed by 2026-11-16.

### 16. Double-elimination brackets (paid feature)

Let an organizer choose double elimination when creating a tournament. Single elimination
stays the default and stays free; double elimination is gated to the paid tier. Added
2026-08-17 per Matt's request — it's the first *feature* gate for the paid tier, where
items 12/13 gate only a numeric cap, so it's what actually makes a subscription worth
buying rather than just raising a ceiling.

The engine is single-elimination throughout, not by configuration but by structure, so
this is the largest item in the tracker by implementation risk. Scoped below against the
code as it stands.

**Schema.** Three additions, all defaulting to today's behavior:

- `tournaments.format ENUM('single','double') NOT NULL DEFAULT 'single'` — follows the
  existing mode-column pattern (`seeding_mode`, `team_entry_mode`) and leaves every
  existing row on single elimination.
- `matches.loser_match_id` / `matches.loser_match_slot` — the crux. `matches` today has
  exactly **one** forward pointer (`next_match_id`/`next_match_slot`, "where winner
  advances to"). Double elimination needs a second edge for where the loser drops to.
- `matches.bracket_side ENUM('winners','losers','grand_final') NOT NULL DEFAULT 'winners'`
  — `round` alone can't order two trees. `MatchController::bracket()` groups results
  purely by `round`, so a winners round 2 and a losers round 2 would collide into one
  group and render as the same column.

**Backend.** `TeamController::generateBracket()` builds one tree; the losers tree is new
construction, not a variation:

- A losers bracket has 2×(rounds−1) rounds alternating *minor* rounds (losers-bracket
  survivors play each other) and *major* rounds (survivors play a team just dropped from
  the winners bracket). The drop-slot mapping has to be crossed/reversed on alternating
  rounds or teams get an immediate rematch of the game that dropped them.
- **Byes get materially harder.** Today the bracket rounds up to a power of two and byes
  exist only in round 1, handled inline. In double elimination a bye'd team that loses
  later drops into a losers round that may have no opponent waiting, so byes propagate
  into the losers tree as well.
- `cascadePropagate()` places the winner into one slot; it needs to place the loser too.
- **`cascadeClearDownstream()` is where the real bug risk is.** It's a single-pointer walk
  today. With two edges, editing an already-scored match must invalidate the winner's path
  *and* the loser's path — and those paths **re-converge** at the grand final. A naive
  recursive clear across both edges will wipe results in the other tree that never actually
  depended on the edited match. Build the affected set by walking both edges to a fixed
  point and clearing only matches whose current participants are genuinely descendants of
  the edited one. This is silent data-loss territory and needs tests, not a smoke check.
- **Finality detection changes.** `enqueueTournamentFinalizedNotifications()` is called
  from the `next_match_id IS NULL` branch, whose comment states that is "structurally
  always the final". That stops being true: the grand final may need a **reset match** —
  if the team arriving from the losers bracket wins, both sides have one loss and a second
  grand final is played. "No next match" no longer implies "tournament over", so the
  champion and the `status = 'complete'` transition need an explicit rule. Decide whether
  the reset match is always created and skipped, or created on demand.
- `TournamentController::list()`'s `LIST_STATS_SQL` aggregates (total rounds, current
  round, champion) assume a single tree and will misreport on the landing/tournament list.

**Frontend.**

- `bracket-view.component.ts` mirrors one tree into two halves for TV mode with
  hand-computed SVG connector geometry (`mirrorLayout()`, `mirrorConnectors()`). Showing
  a winners tree plus a losers tree is a real layout change, and kiosk mode's auto-fit
  scaling assumes one bracket's natural dimensions. Likely the single biggest chunk of
  frontend work in the item — consider stacked winners/losers sections rather than trying
  to extend the mirrored geometry.
- `roundLabel()` in `shared/bracket-labels.ts` counts back from the end (Final /
  Semifinal / Quarterfinal). It needs losers-bracket naming and grand-final/reset labels.
  That file exists specifically so the bracket view and score-entry screen can't disagree
  about presentation, so both consume the change automatically — but it does mean the
  labelling has to make sense in both places at once.

**Gating.** Reuse the item 12/13 mechanism rather than inventing one:

- A sibling helper to `effectiveParticipantCap()` in `api/middleware/auth.php`, reading
  the same `users.plan` and `tournaments.paid_override` flags. **This can ship before real
  billing exists**, gated on the manual super-admin flags, exactly as the cap enforcement
  did — so it is not blocked on Stripe.
- Enforce server-side at tournament creation *and* again at bracket generation; the
  frontend selector is UX only, per the standing rule that the backend is the authorization
  boundary.
- Format locks at bracket generation, same as `seeding_mode`/`team_entry_mode` — the
  `/how-it-works` page already tells organizers two of the creation choices lock when teams
  are drawn, so this needs adding to that copy and to the create-form hint text.
- **Open question — downgrade semantics.** If a subscription lapses or a super admin clears
  `paid_override` while a double-elimination tournament is in flight, does it keep working?
  Recommendation: **yes** — gate the *choice* at generation time, never the *running
  tournament*. A lapsed card breaking a live bracket mid-event at a venue is the worst
  available failure mode, and the tournament is already built by then.
- **Open question — which paid lever unlocks it.** Item 13's own open question is "which
  limits/features make sense as a one-time per-tournament unlock"; double elimination is
  the natural first answer, since the once-a-year big event is exactly when an organizer
  wants it and exactly who doesn't want a subscription. Suggest both levers unlock it,
  matching how the participant cap already works.

**Testing gap — now closed for single elimination (2026-08-21).** The original note here
said there was no PHP test framework and that `php -l` plus manual smoke tests would not be
enough for losers-bracket routing or the two-edge cascade-clear. That prerequisite has been
built as its own slice, ahead of any double-elimination logic:

- `api/lib/BracketBuilder.php` — bracket *shape* extracted out of
  `TeamController::generateBracket()` as a pure function with no PDO. The controller now
  only persists the returned plan (insert rows, then rewrite array indexes into match ids).
  This is the seam the losers bracket gets added to.
- PHPUnit via `tools/phpunit.phar` and `.\run-php-tests.ps1`, no Composer (production is
  still PHP 7.2). `tests/BracketBuilderTest.php` builds every field from 2 to 64 teams,
  plays each one out, and asserts the invariants: exactly N−1 games for N teams, one
  champion, each team eliminated at most once, every team entered exactly once, forward
  pointers always advancing exactly one round, and seeds 1 and 2 meeting only in the final.
  `tests/BracketPersistenceTest.php` covers the index → id translation with a recording PDO
  double. 23 tests, ~18k assertions, runs in ~20ms.

Double elimination adds its cases to this suite rather than starting from nothing: two
losses to elimination, byes dropping into the losers tree, and re-scoring a winners-bracket
match after the grand final is populated.

**When it ships**, update `AGENTS.md` and `README.md` — both currently describe Bracketway
flatly as a "single-elimination tournament manager", which stops being accurate.

Status: **Feature complete — all 5 slices done (2026-08-21/22).** Double elimination can be
chosen, generated, scored, and rendered. Migration `016` is applied to production and slices
2–3 are deployed; slices 4 and 5 were deployed by 2026-11-16.

Slice 4 added the paid-tier gate: `formatRequiresPaidPlan()` +
`tournamentHasPaidFeatures()` / `userHasPaidPlan()` in `api/middleware/auth.php`, reusing
items 12/13's `users.plan` and `tournaments.paid_override` levers (`effectiveParticipantCap()`
was refactored onto the same helper so there is one source of truth). Enforced at the two
moments the scope called for — choosing the format and generating the bracket — and never
while a tournament is being played. Plus the create-form and manage-screen selectors, a
`double elimination` badge, `plan` on the session payload, and `/how-it-works` copy.

One correction to the scope while implementing it: format must **not** lock on team count the
way `seeding_mode`/`team_entry_mode` do. Teams are drawn while a manual-seeding tournament is
still in `setup`, so a double-elimination tournament whose plan lapsed in that window could
neither generate its bracket nor drop back to single elimination — a dead end. It locks on
`status` leaving `'setup'` instead, which is exactly "before the bracket exists".

Slice 5 reshaped the bracket API to group by side then round, fixed champion detection in
`LIST_STATS_SQL` (which found the champion via `next_match_id IS NULL` — in double
elimination that is the *reset*, usually unplayed, so a finished tournament reported no
champion at all), taught `roundLabel()` to qualify both trees and name the grand final and
its deciding match, moved champion detection into the shared `bracket-labels.ts` alongside it,
and rendered the two trees as stacked sections. Single elimination still renders through the
mirrored/column layouts untouched.

The stacked layout is deliberately not an extension of the mirrored geometry, which assumes a
perfect halving tree; the losers bracket halves every *two* rounds. Rows are apportioned from
each round's real match count (which reduces to the same placement for a perfect tree) and
connectors are derived from real `next_match_id` links, since a losers major round takes only
one entrant from the previous round.

**Bug found in testing (2026-08-22, fixed):** `plan` was added to the login payload in
`AuthController::publicUser()` so the UI could unlock paid-tier controls, but the login query
feeding it was left selecting its original column list. The field was therefore always
missing, the fallback reported `free` for every session, and flipping a user to paid had no
visible effect on the create form no matter how many times they signed back in.
`tests/SessionPayloadTest.php` now asserts every field `publicUser()` emits is actually
selected — a structural check, because the failure mode is structural.

**Known follow-up, not blocking:** TV/kiosk mode fits the whole three-section stack correctly
but scales it down noticeably, because stacking triples the height while leaving most of the
width unused. Placing the winners and losers brackets side by side in kiosk mode would roughly
double the on-screen size. Worth doing if double elimination gets real TV use.

Slice 2 (2026-08-21) added migration `016_double_elimination.sql` —
`tournaments.format ENUM('single','double') DEFAULT 'single'`, `matches.loser_match_id` /
`loser_match_slot` (+ self-FK), `matches.bracket_side ENUM('winners','losers','grand_final')
DEFAULT 'winners'`, and `matches.is_reset`. All additive and defaulted, so every existing
row keeps today's behaviour. `TeamController::generateBracket()` now takes a `$format`
argument, branches to the right builder, and writes both edges in one UPDATE; an
unrecognised value falls back to single elimination so a pre-migration row can never be read
as double. `TournamentController` deliberately does **not** accept `format` on create or
update — exposing it before slice 3 would let an organizer build a bracket that score entry
cannot advance.

Sequenced deliberately engine-first rather than schema-first (2026-08-21, per Matt): the
migration's column shape falls out of what the engine actually needs, and migrations here
are append-only files applied to prod, so a guessed shape would cost a corrective migration.
Slice 1 touched no schema and shipped nothing.

Slices 4 (gating + UI) and 5 (two-tree rendering) are described in the status note above.

Slice 3 (2026-08-21) made the match-state machine two-edge aware. `cascadePropagate()` now
places the loser as well as the winner, and stops short of the reset when the winners-bracket
side wins the grand final. `cascadeClearDownstream()` follows both edges with a visited guard
(they re-converge at the grand final) and recurses only where a team was actually withdrawn.
Finality moved out of the `next_match_id IS NULL` rule into `championOf()` — reset winner if
the reset was played, else the grand final's winner but only when the winners-bracket side
took it. `enqueueRoundCompletedNotifications()` is now scoped by `bracket_side`, since round
numbers restart per side and matching on `round` alone would treat winners round 2 and losers
round 2 as one round.

Tested in `tests/MatchCascadeTest.php` against an in-memory SQLite database — the cascade
reads back state it just wrote, which a statement recorder cannot cover. **Validated by
mutation**, which is worth repeating for any future change here: breaking the loser edge in
the clear, removing the loser drop, removing the reset guard, or letting `championOf()` ignore
the reset each fails at least one test.

One correction to the scope's framing, found during that mutation run: a *naive* clear that
walks every downstream edge regardless of state turns out to be **equivalent** to the
data-driven one in any reachable state, because each slot has exactly one feeder and a match
cannot hold a result unless both slots were filled — so nothing downstream survives an
ancestor being withdrawn. The data-driven guards are worth keeping (they stop the walk early
and stay correct if a partially-populated shape ever appears), but they are not fixing a live
bug, and the scope's "silent data-loss territory" warning was aimed at a risk that the
single-feeder-per-slot invariant already rules out. The real regressions to guard against are
the four the mutation battery covers.

What slice 1 settled, which slice 2's migration followed:

- `matches.loser_match_id` / `loser_match_slot` — as scoped. The grand final uses **both**
  edges to feed the reset match (winner into slot 1, loser into slot 2), so the reset needs
  no special-case source plumbing.
- `matches.bracket_side ENUM('winners','losers','grand_final')` — as scoped, plus a flag
  distinguishing the reset from the grand final itself (`is_reset`, or a fourth enum value).
- **The reset match is always created**, answering the open question in the scope above. It
  simply goes unplayed when the winners-bracket side wins the grand final, which is a
  runtime decision, so the builder stays a static structure and persistence stays a
  straight insert of what it returns.
- **Byes turned out to be far less invasive than feared.** Because seeds are contiguous,
  every winners round-1 match has at least one entrant, so every later winners match is a
  real game with a real loser — meaning only winners round 1 can produce byes, and the
  shortfall reaches at most two losers rounds. Losers matches that can only ever receive one
  team are removed outright and their live feeder is rerouted to that match's own target, so
  there are **no run-time walkovers in the losers tree at all**. The two-edge cascade in
  slice 3 does not need to handle them.
- One scoped invariant is **false and should not be asserted**: "no team meets the same
  opponent twice before the grand final" is impossible in double elimination — in a 4-team
  field the losers final is necessarily a rematch of a winners round-1 game. What the
  reversal actually guarantees, and what the suite asserts, is that a team dropping from
  winners round r does not land on the survivor of the losers match its own two feeders fell
  into.

Verified: 38 tests / 45,665 assertions across the three bracket test files, ~80ms. Double
elimination is played out at every field size from 2 to 48 under two scenarios (chalk, and
a losers-bracket win in the grand final), asserting exactly 2N−2 games without a reset and
2N−1 with one, every eliminated team on exactly two losses, one champion, every edge
pointing strictly forward, and no two matches feeding the same slot.

Earlier prerequisite work: the pure-function extraction and PHPUnit harness (see the
testing-gap note above) shipped and was verified against production 2026-08-21.

Verified live against the production database 2026-08-21 via the `run-bag-bracket` stack,
using throwaway private tournaments driven through the real HTTP API at three field shapes
— 5 teams (3 byes), 8 teams (no byes), 9 teams (7 byes). Every persisted row matched
`BracketBuilder`'s plan exactly, including `next_match_id` after the array-index → id
translation. Also confirmed live: playing out gives N−1 games for N teams; re-scoring a
round-1 match in a finished tournament clears the final's winner **and** reopens the
tournament to `active` (the pre-existing status bug fixed by `syncTournamentStatus()`);
replaying re-completes it. All test data hard-deleted afterwards — row counts and max ids
back to baseline, and a SHA-256 fingerprint of every pre-existing row in `tournaments` /
`participants` / `teams` / `matches` was identical before and after, with no orphans left
in `tournament_members`, `audit_log`, or `notification_queue`. Deployed by 2026-11-16.

Priority note: placed after items 12/13 because it's the feature that gives their paid tier
something worth paying for, but it is **not blocked by them** — it can ship against the
existing manual `users.plan`/`paid_override` flags and start earning the moment billing
lands. Placed ahead of items 10/11 since those are the much larger Stripe Connect
marketplace build. Be aware this is a bigger engine change than anything shipped so far;
if it needs to be split, the natural seam is single-elimination-preserving schema and
gating first, then the losers-bracket construction, then the two-tree rendering.

_Moved here from FEATURE_TRACKER.md on 2026-11-17, unchanged, when the item was found still listed under Planned._

### Score-entry screen and spectator bracket QR

Two event-day gaps, both asked for 2026-08-14.

**Dedicated score-entry screen** (`/admin/tournament/:id/score`,
`score-entry.component.ts`). Scores could already be entered from the bracket view, but
that means finding the right card inside a whole bracket — awkward on a phone, outdoors,
which is exactly where scores get entered. The new screen lists only `ready` matches,
largest tap targets first.

- Filtered client-side from the existing `GET /matches/:id`; no API change was needed.
  Byes never appear — they're auto-advanced placeholders with no score to enter.
- After a successful save it reloads rather than patching state, because saving a result
  can make the *next* match ready (verified: scoring both semifinals made the final appear
  on its own) and editing a finished one clears results downstream.
- Completed matches are available behind a toggle, newest first, for fixing a typo'd
  score — the correction a scorekeeper actually needs is almost always the one just
  entered.
- Refreshes itself every 30s so a second scorekeeper's results show up. Typed-but-unsaved
  scores survive it: `applyBracket()` only seeds a row that has no entry yet, the same
  guard the bracket view uses.
- Ties are rejected client-side as well as server-side, so the message lands next to the
  inputs instead of arriving as a toast after a round trip.
- Route carries only `authGuard`; scorekeepers are ordinary organizers with a role on one
  tournament. The component checks `can_score` and the backend enforces it on every PUT.
- Linked from the manage screen's action row, shown only when the viewer can score *and*
  the tournament is active.

**Spectator bracket QR.** There was already a registration QR, but nothing for people who
just want to watch. The existing modal was generalized from a boolean to
`qrKind: 'registration' | 'bracket' | null`, with the title, hint, download filename, and
target URL derived from it. The bracket QR points at the **uuid** form of the link, not
the numeric id — that's the form that needs no account and the only one that works for a
private tournament. Unlike the registration QR, which is gated on setup-with-no-teams, it
stays available for the whole tournament, since watching is useful long after sign-up
closes. Added a Copy link button and the URL in plain text alongside, for reading out.

**Printable venue sign** (`/poster/:uuid/:kind`, `poster.component.ts`), added
2026-08-14 so an organizer doesn't have to download a PNG and build their own document.
Two variants — the bracket (watch-along) sign and the sign-up sign — each a full sheet
with the tournament name, an instruction, a large QR, and the URL in text for anyone who
can't scan.

- **Produced through the browser's print dialog rather than a PDF library.** Every desktop
  and mobile browser offers "Save as PDF" as a print destination, so this still yields a
  file for anyone who wants one, while also printing directly — which is what actually
  gets it onto a wall — and without adding a rendering dependency for a page used a
  handful of times per tournament. The on-page tip names the Save-as-PDF option so it
  isn't a hidden trick.
- Public by uuid, consistent with the bracket and sign-up pages: knowing the uuid is
  already the access grant, so the sign grants nothing new.
- QR is rendered into a 1024px canvas and displayed at 108mm, roughly 240dpi on paper. A
  screen-sized QR would come out visibly blocky at sign scale.
- **Bug found while measuring the output:** `qrcode` writes its render size onto the
  element as an inline style (`width: 1024px; height: 1024px`), which outranks the
  stylesheet. That pinned the QR at 1024px on screen *and* would have ignored the print
  size entirely, so the printed sheet would have been wrong. The inline width/height are
  now removed after generation; the bitmap stays 1024 for sharpness and CSS governs the
  displayed size.
- **Bug found in review:** the switch between the two signs did nothing. Both variants are
  the same route with a different `:kind`, so Angular reuses the component instance and
  never re-runs `ngOnInit` — reading the parameter from `route.snapshot` once left the page
  stuck on whichever sign you arrived at. Now subscribed to `route.paramMap`, redrawing the
  QR on each change and refetching only when the uuid itself changes. Three regression
  tests cover it, driving the param map directly rather than through a navigation.
- **Does not auto-open the print dialog**, though a dedicated print page is the usual
  place for that. A dialog on load blocks reading the sign, switching to the other
  variant, and choosing paper size, and it reappears on every navigation between the two.
  (It also hard-blocks browser automation, which is how it got noticed.)
- Page height is a fixed `240mm`, not `96vh`. Browsers disagree about whether `vh` in
  print means the page box or the on-screen viewport, and guessing wrong pushes the sign
  onto a second sheet. 240mm clears US Letter's ~255mm printable area as well as A4's
  ~273mm.
- New global `@media print` rules hide `app-nav`, `app-footer`, and anything marked
  `.no-print`, and set a 12mm page margin — sensible for the whole app, not just here.

Print output verified by extracting the `@media print` rules and applying them
unconditionally, then measuring: nav, footer and controls all `display: none`, QR exactly
108mm, sheet exactly 240mm — inside both Letter and A4 printable areas — on both variants,
with the sign-up variant's QR correctly pointing at `/register/`. The dialog itself could
not be opened under automation (it blocks), so the paper result is measured rather than
eyeballed.

**Landing page updated to sell the venue story.** Matt asked whether TV mode was worth
highlighting on the main page. Verdict: yes, but as a supporting detail rather than a
headline, and phrased concretely ("Bracket on the TV") rather than as jargon ("kiosk
mode") — the buying decision is still whether the app can run a tournament, and TV mode
only pays off if there's a screen at the venue, which plenty of backyard events won't
have. The broader point was that the feature strip had gone stale: it listed four items
and mentioned neither the printable signs nor the score-entry screen, so it wasn't telling
the story those three now add up to — that Bracketway furnishes the room, not just the
bracket.

- Feature strip reordered and expanded to six, leading with "Bracket on the TV" and
  "Printable QR signs" as the differentiated ones.
- New walkthrough chapter, "Put it on the wall", covering TV mode and the printable signs,
  leaning on what makes it easy — no app, no cast, bookmark it once. The existing final
  chapter renumbered to Step 07, with a test asserting the step numbers stay consecutive
  so an inserted chapter can't silently duplicate one again (it did, on the first pass).
- Score-entry screen also gets a mention in the scoring chapter.

**Shared display rules extracted** to `shared/bracket-labels.ts` — `roundLabel()` and
`teamParticipants()` were both about to be duplicated into the new screen. Both components
now delegate, keeping the "don't repeat the team name back at me" rule in one place.

Verified 2026-08-14 in a browser: the screen against production's Test 7 (read-only —
three ready quarterfinals listed correctly, tie rejected without a network call), then a
full play-through on a throwaway 8-player tournament (since deleted) covering save, the
final becoming ready, the correction flow seeding existing scores, and the QR modal
rendering a real canvas with the right URL. Confirmed Test 7's stats are unchanged
afterwards. 285/285 frontend tests passing, 24 new — including the first coverage the QR
modal has ever had.

#### Follow-on: mirrored bracket layout

Kiosk mode fit the bracket to the screen but had to shrink it to 0.75× to do it, because
the bracket was tall and narrow — it used about a third of the screen's width and all of
its height. Matt asked for the printed-bracket shape instead: both halves of round 1
starting at the outside edges and playing inward to the final in the middle. **This is the
layout for every bracket view, not just kiosk** (asked for explicitly), with the phone
layout left exactly as it was.

- `mirrorLayout()` splits each round in half by `match_number` — the left half takes
  1..perSide, the right takes the rest, which is the same split a printed bracket makes,
  so pairings stay intact. The right half is rendered inner-to-outer so it reads as a
  reflection. The final sits in a middle column, spanning every row so it lines up with
  the connectors arriving from both sides.
- The arithmetic that makes it work: round `pos` has `2^(n-pos)` matches, so each side
  takes `2^(n-pos-1)` of them, each spanning `2^(pos-1)` rows — a constant `2^(n-2)` rows
  per side, exactly half the `2^(n-1)` a single-sided bracket needs. Every round column
  stays the same height on both sides, which is what keeps the connector maths honest.
- Connectors reuse the existing derivation, just indexed within the half. The round before
  the final has one match per side, which falls out as `y1 === y2 === mid` — a straight
  line into the final, correct because that match spans every row and so shares the
  final's centre. **The right half's SVGs are the left's paths flipped with
  `transform: scaleX(-1)`** rather than a second set of geometry.
- The match card was extracted into a single `ng-template` shared by both layouts, so the
  two can't drift apart.
- **Mobile is untouched, and the switch had to move from CSS into the markup to keep it
  that way.** Collapsing the mirrored DOM into one column would read round 1, round 2,
  final, round 2, round 1 down the page instead of grouping each round together. So
  `useMirrorLayout()` watches a `matchMedia('(max-width: 600px)')` signal — kept in step
  with the CSS breakpoint by hand — and renders the original single-column markup below
  it. Kiosk ignores the width, since a stick browser reporting narrow is still a TV.
- Also skipped for a 2-team bracket, where round 1 *is* the final and there is nothing to
  mirror.

Measured against production's Test 7 (9 teams, 4 rounds), which is what prompted this:

| | before | after |
|---|---|---|
| natural size | 899 × 1231 | 1595 × 631 |
| scale at 1920×1031 | 0.75 (shrunk) | 1.17 (enlarged) |
| width of screen used | ~35% | 97% |
| effective team-name text | ~10.8px | 17.8px |
| scale at 1280×720 (Fire TV) | 0.50 | 0.77 |
| effective text at 1280×720 | ~7.6px | 11.7px |

Verified 2026-08-14 in a browser at both sizes, plus a completed 4-team tournament on a
throwaway (since deleted) to check the champion banner and trophy render under the middle
final. 261/261 frontend tests passing, 12 new covering the split, the ordering, the
per-side row heights, the pair-merge coordinates, the straight run into the final, the
narrow-screen fallback, and the kiosk override.

#### Follow-on: TV / kiosk mode for the bracket view

Matt wanted the bracket on a TV at the tournament, driven by a Fire TV stick, and the
whole thing wasn't visible without scrolling. Real numbers from production's Test 7: the
bracket's natural size is 899×1231, against roughly 982px of usable height on a 1080p
screen — so it was cut off by a full round's worth of height, and nobody is going to
scroll a television.

- New mode on `/bracket/:id`, entered with `?kiosk=1`. **Query-param-driven on purpose**:
  a bookmarkable URL is the only practical way onto a TV, since typing an address once
  beats hunting for a toggle with a remote. A "TV mode" button and Escape-to-exit exist
  for anyone driving it with a mouse and keyboard; both just rewrite the query string, so
  there's one code path.
- Fitting is a CSS `transform: scale()` on a wrapper (`.fit-inner`) inside the available
  box (`.fit-stage`), computed in `recomputeFit()` as `min(availW/naturalW,
  availH/naturalH)`. A transform rather than a font/size rework because it scales the
  connector SVGs and the grid maths along with the text, so the bracket keeps exactly the
  proportions it was designed with. Worth remembering: `offsetWidth`/`offsetHeight` report
  the *pre-transform* box, so re-fitting never has to reset the scale and measure again.
  Re-fits on resize, on query-param change, and after every data load.
- Margin of 28px on each side, deliberately generous because many TVs overscan and crop a
  few percent off every edge. Enlargement is capped at 2.5× so a four-team bracket doesn't
  fill a 65" screen with soft, blown-up text.
- Chrome is hidden via a `kiosk-mode` class on `<body>` (nav and footer live in
  AppComponent, outside this component, so it has to be done from `global.scss`), cleared
  on destroy.
- Kiosk suppresses score entry via `showScoring()` even for staff, so a screen in a
  crowded room is never one stray click from rewriting a result. `canScore()` itself is
  untouched — this is presentation, not permission.
- The mobile breakpoint is explicitly opted out of under `.kiosk`: a stick browser
  reporting a narrow CSS viewport would otherwise get the stacked phone list, which defeats
  the entire point. It gets the real bracket shape and is scaled to fit regardless.

**Bug fixed alongside, and the more consequential half of this:** `autoReload` defaulted
to `true` and the checkbox rendered ticked, but `startAutoReload()` was only ever called
from the checkbox's `(change)` handler — so a freshly loaded bracket *never actually
refreshed* until you toggled it off and on again. The default state was a lie, and a
bracket left on a wall all afternoon would have shown a frozen score while claiming to
update every 60s. `ngOnInit` now starts the timer; `startAutoReload()` gained an
`immediate` flag so startup doesn't double-load (covered by a test asserting exactly one
request pair on init).

Verified 2026-08-14 against production's Test 7 (9 teams, 4 rounds — the awkward case,
with byes). At 1920×1031 it scales to 0.75 and fits; at a simulated 1280×720 Fire TV
viewport it scales to 0.50 and fits. Confirmed the page itself doesn't scroll, nav is
`display:none`, Escape exits and restores normal mode with no transform, and the button
round-trips the URL. 249/249 frontend tests passing, 12 new. One caveat worth knowing:
fitting a 4-round bracket to a 720p output makes the text genuinely small — that's
inherent to "show everything at once", and a bigger bracket on a 720p stick would want a
per-round paging mode instead.

#### Follow-on: onboarding for new organizers

Matt asked whether a tutorial would help — possibly a click-through demo on fake data.
Rejected the sandbox on cost-versus-drift grounds (it means a parallel mock layer for
participants/teams/matches that rots as the real flow changes) and, more importantly,
because the friction here isn't *where do I click* — the dashboard puts the create form
at the top of the page — it's *what do these words mean and what happens next*. Built
guidance at the decision points plus a static walkthrough instead.

- **The two mode dropdowns on the create form were explained only by `title` tooltips**,
  which never fire on touch. On a mobile-first app that meant the primary platform got no
  explanation at all of two choices that lock once teams are drawn. Replaced with hint
  lines that re-render with the selection, so the text describes what you actually picked.
  The auto-draft-only constraint on the player sign-up link is called out here, since it's
  enforced server-side but was invisible at the moment of choosing.
- New setup checklist at the top of the manage screen's setup phase. Its length varies by
  mode, which is the part nobody could have guessed: auto-draft plus automatic seeding is
  two steps (the draw seeds, builds, and starts play in one action), while manual seeding
  or direct entry adds an explicit generate step. Steps mark done/current/todo off real
  state, and the first step surfaces a pending self-sign-up count when there is one.
- Dead-end empty states now point somewhere: "No players yet" offers to copy the sign-up
  link, and the dashboard's empty tournament list links to the walkthrough.
- New public `/how-it-works` page — six chapters covering creation choices, roster,
  the draw, bracket construction, live scoring, and finishing, plus a note on
  manager/scorekeeper roles. Public on purpose: it's most useful to someone deciding
  whether to sign up. Linked from the landing page's step strip and the dashboard.
- It documents **byes**, which nothing in the app explained anywhere. Bracket size rounds
  up to the next power of two (`TeamController` line ~393), so a 9-team tournament fills a
  16-slot bracket and seven teams advance without playing. Verified against the generator
  rather than assumed, and consistent with production's Test 7 (9 teams, 4 rounds, 15
  match rows, 8 playable).

- **Scroll restoration turned on app-wide** (`app.config.ts`) while testing this. The
  router had no scrolling configuration at all, so Angular's default of keeping the window
  scroll position across navigations meant following the walkthrough link from halfway
  down the home page landed you halfway down the walkthrough. This was never specific to
  that link — every navigation in the app behaved this way. Chose
  `scrollPositionRestoration: 'enabled'` over `'top'` so browser back/forward still
  restores where you were, which matters now that there are long pages worth returning to.
  Not unit-tested: router provider configuration isn't practically assertable from a spec,
  so this one rests on the browser check below.

Verified 2026-08-14 in a browser: the walkthrough page, the create-form hints, and the
checklist in two different mode combinations (auto-draft/automatic on a real setup
tournament — view only, no mutations; direct/manual on a throwaway, since deleted).
Scroll behaviour checked directly: 185px down the home page → click through → lands at 0;
back restores 185; forward restores 900 on the walkthrough.
239/239 frontend tests passing, 19 new. One gotcha worth remembering: adding a *static*
`routerLink` to the dashboard made RouterLink instantiate at construction rather than only
when a list row rendered, so its spec needed an `ActivatedRoute` provider it had never
needed before.

#### Follow-on: instructions on the self-registration page

Same session, same reasoning applied to `/register/:uuid` — the other page a stranger
lands on cold, usually straight off a QR code at the venue. It previously showed the
tournament name over two unexplained inputs.

- Two things now appear above the form. First, **teams are drawn at random** — the page
  never said so, and a bag-toss player's default assumption is that they sign up *with*
  their partner. This is safe to state unconditionally here because `selfRegister()`
  rejects anything but `auto_draft`, so every registration that succeeds on this page is
  randomly paired. Second, the pending-approval gate, which used to be revealed only
  *after* submitting.
- The email field's label was `Email (optional — get match updates)`, which didn't hint
  at the double opt-in; a hint line now says the address is used for this tournament's
  results only and that one confirmation link will need tapping.
- The success state adds "No need to register again — the organizer can see your name."
  There is **no duplicate check server-side** (`selfRegister()` inserts unconditionally),
  so registering twice silently creates two participant rows and two roster entries for
  one person. The copy is a mitigation, not a fix — a real dedupe is still open.
- The closed message now says the teams have already been drawn and to check with the
  organizer, rather than just "Registration is closed for this tournament."
- **Bug fixed along the way:** the frontend gate only checked `status !== 'setup'`, while
  the backend also rejects direct-entry tournaments. A `direct` tournament in setup
  therefore rendered a working-looking form that could only fail on submit. `ngOnInit`
  now mirrors the backend condition, defaulting a missing `team_entry_mode` to
  `auto_draft` exactly as the backend's `?? 'auto_draft'` does.
- Still mismatched, and not fixed: the backend also rejects once `teamsExist()`, which
  can be true while status is still `setup` (auto-draft + manual seeding draws teams
  before the bracket is generated). The frontend can't see that from the tournament row,
  so that narrow window still shows a form that fails on submit. Would need the
  by-uuid response to carry a "registration open" flag.

Verified 2026-08-14 in a real browser against the local stack: form copy, the direct-entry
closed path, and the success state (registered a throwaway participant on a throwaway
private tournament, then soft-deleted it — confirmed no stray rows landed on the real
"2026 Apple Lane Bags Championship"). 216/216 frontend tests passing, 6 new.

### 15. Super-admin audit log viewer

The `audit_log` table (written via `writeAuditLog()` throughout the backend since the
RBAC work) had no read path at all — only queryable by hand against the database.
Added 2026-08-13 per Matt's direct request, same deliberate small-exception basis as
item 14 (see [[bag_bracket_monetization_priority]]).

- New `GET /audit-log` (`AuditLogController::list()`, super-admin only), searchable
  (free text across action/target/actor username+email/tournament name/`details_json`),
  filterable by exact action, sortable (`created_at`/`action`/`actor`/`tournament`, both
  directions — sort key whitelisted server-side against a fixed column map so it can
  never be interpolated as an arbitrary SQL identifier), and paginated (25/50/100/200
  per page, capped at 200).
- Joins in actor username/email and tournament name so entries are readable without
  cross-referencing IDs by hand; both are `LEFT JOIN`s since `actor_user_id`/
  `tournament_id` can be legitimately null (public/participant-initiated actions,
  historical entries whose tournament was hard-deleted before item 11's soft-delete
  existed) — confirmed this renders as `—` rather than breaking.
- `details_json` decoded and shown as `key: value` lines rather than raw JSON.
- Frontend: new `/admin/audit-log` page (table + the same search/filter/sort/paginate
  controls), linked from the Admin nav dropdown, gated by the existing `superAdminGuard`
  — action-type filter dropdown is a hardcoded list of the ~24 action strings that
  actually appear in the codebase today (not worth a round trip to populate).

Status: Built and live-tested against the production database 2026-08-13 via the
`run-bag-bracket` local stack. No migration — purely a new read endpoint, no schema
changes. Verified against real production audit history (124 real entries at time of
testing): search, single-action filtering, sort-by-actor (confirmed correct alphabetical
grouping), and pagination totals all checked via curl; then the actual page checked in
a real browser — nav dropdown link present only for a super admin, search/sort/pagination
all interactively exercised and correct, non-super-admin `GET /audit-log` confirmed 403.
`php -l` clean, 192/192 frontend tests passing (19 new/changed), `npm run build:prod`
clean (`audit-log-component` builds as its own lazy chunk), `git diff --check` clean.
**Deployed to the production host 2026-08-13/14**, as part of the full `deploy.ps1` run
that shipped the email provider split — that deploy carried every then-pending item
(12/13/14/15) to production at once.

### 14. Daily digest for organizers with pending self-registration approvals

Self-registered participants (item 6) land `pending` until an owner/manager approves
them, but nothing ever told the organizer one was waiting — they'd only notice by
opening the tournament's manage page. Added 2026-08-13 per Matt's request, and built
immediately as a deliberate small exception to the "no feature work until monetization
has a clear path" rule (see [[bag_bracket_monetization_priority]]) — small, self-contained,
and doesn't compete for time with the Stripe work, which is blocked on Matt regardless.

- One email per recipient per day, batched across every tournament they own/manage with
  at least one pending row — not per-registration (would be noisy) and not a delta since
  the last digest (always the current snapshot), so an ignored approval keeps surfacing
  daily until it's acted on rather than being mentioned once and forgotten.
- Recipients are `tournament_members` with role `owner` or `manager` (the same roles
  `PUT /participants/:id/approve` already requires) — not blanket-sent to every super
  admin.
- **Scheduling: piggybacks on the existing 3-minute notification cron instead of adding
  a second crontab entry.** Migration `014_scheduled_jobs.sql` adds a small
  `scheduled_jobs` table (`job_name` primary key, `last_run_at`, `next_run_at`,
  `interval_hours`) — deliberately *not* a generic pluggable "worker type" framework,
  since there's exactly one scheduled job today; generalize the dispatch in
  `send_notifications.php`'s new `runDueScheduledJobs()` if/when a second one is ever
  needed, not before. `api/scripts/send_notifications.php` (previously scoped
  single-purpose to item 1's queue) now also checks this table on every invocation and
  runs anything due — its header comment was updated to describe both jobs it now
  covers. Reuses that file's existing branded-email helpers (`emailLayout()`,
  `emailButton()`, etc.) directly, which is the main reason the digest logic lives there
  rather than a separate script.
- Sent synchronously (not queued) — organizer-account volume is tiny compared to the
  per-participant fan-out item 1 was built for, so the queue/worker split wasn't needed
  here.

Status: Done — migration applied to the production database and live-tested against it
2026-08-13 via the `run-bag-bracket` local stack. Verified: a lone pending tournament
produces a correctly-worded singular-subject email; adding a second pending tournament
for the same organizer and forcing the job due again correctly batches both into one
plural-subject email listing both, each with a working link to that tournament's manage
page; running the worker again immediately after (simulating the next 3-minute cron
tick) does **not** re-send — confirmed via Postmark's message count staying flat —
proving the 24h gate actually works, which was the entire point. One real bug caught
during this testing: top-level `const` declarations in PHP execute in file position,
not hoisted like function declarations — the email-color constants were originally left
in their old position (after where the new scheduled-job code needed them), which threw
an `Undefined constant` fatal the first time the digest ran before ever reaching that
part of the file. Fixed by moving the `const` block itself up near the top of the file,
before any top-level code runs; the functions that reference them were unaffected (function
declarations *are* hoisted). Test tournaments/participants fully deleted afterward,
`tournaments`/`users` row counts confirmed back to baseline. `php -l` clean, `git diff
--check` clean. No frontend changes — this is backend/worker-only.

**Deployed to the production host 2026-08-13/14** by the full `deploy.ps1` run that
shipped the email provider split. Note that this job's mail now goes out through **Brevo**,
not Postmark — `sendOrganizerPendingDigest()` lives in the cron worker, so it followed the
worker to the new provider (see the email provider split entry in the archive). One side
effect of the earlier testing directly against production: the `scheduled_jobs` row's
`next_run_at` reflects that test run rather than a fresh `NOW()` — confirmed still set to
2026-08-14 16:48 as of the deploy, so the first real digest fires on that schedule rather
than immediately. Harmless, just worth knowing if a digest doesn't show up right away.

### Tournament soft-delete and recovery

Previously, deleting a tournament (`TournamentController::delete()`) cascaded hard
`DELETE`s through `matches`, `teams`, `participants`, and the tournament row itself —
irreversible, with no recovery path if an owner deleted the wrong tournament.

- Migration `011_soft_delete_tournaments.sql` adds `tournaments.deleted_at` (`DATETIME
  NULL`). Children (`matches`/`teams`/`participants`) are left untouched by design —
  they're never queried outside a `tournament_id` context, so once the tournament itself
  is filtered out of every read path, they're already unreachable through it; restoring
  the tournament row brings everything back automatically.
- `delete()` now sets `deleted_at = NOW()` instead of cascading deletes.
- Every read path that returns tournaments (`list()`, `get()`, `getByUuid()`) filters out
  or 404s on `deleted_at IS NOT NULL` — for everyone, including super admins; treating
  "deleted" as fully gone until an explicit restore, not implicit read access, was a
  deliberate choice.
- `requireTournamentRole()` and `requireTournamentVisible()` (`api/middleware/auth.php`)
  also 404 on a soft-deleted tournament before checking role/visibility — checked
  *before* the `super_admin` bypass in `requireTournamentRole()`, so a soft-deleted
  tournament's matches/teams/participants stay untouchable via any per-child-row
  endpoint even for a super admin, until it's explicitly restored.
- New super-admin-only endpoints: `GET /tournaments/deleted`
  (`TournamentController::listDeleted()`) and `POST /tournaments/:id/restore`
  (`restore()`). Restoring always resets `visibility` to `private` regardless of its
  visibility before deletion, so a recovered tournament doesn't silently reappear in the
  public list without a deliberate decision.
- Frontend: new `DeletedTournamentsComponent` (`/admin/deleted-tournaments`, gated by
  `authGuard` + `superAdminGuard`) lists deleted tournaments with their delete date and a
  confirm-gated Restore button. `nav.component.ts` reworked the single "Admin" link into
  two dropdowns — Admin (Active Tournaments / Users / Deleted Tournaments) and the
  existing profile menu — to fit the new destination without cluttering the top-level
  nav.
- Existing tournament-delete confirmation copy in `admin-dashboard.component.ts` and
  `tournament-manage.component.ts` updated from "This cannot be undone" to note that a
  super admin can restore it, since that's no longer true.

Status: Done. Verified against the live stack (`run-bag-bracket`) under the `claude`
super-admin test account: created a throwaway tournament, deleted it via both the API
directly and the admin UI, confirmed it disappeared from the active list and 404s by id,
confirmed it appeared in `GET /tournaments/deleted` / the Deleted Tournaments screen, and
confirmed restore brought it back private via both the API and the UI restore button
(toast + list update).

### 9. Prevent bot/abusive organizer self-registration

The public `/admin/register` page previously created an immediately-active `organizer`
account for any name/email/password that passed basic validation — no verification, no
CAPTCHA, no rate limiting, no approval step, live and able to create/manage real
tournaments the instant the form was submitted.

- CAPTCHA, rate limiting, and an approval/invite-only gate were all considered and
  deliberately not built for this pass — see the option breakdown that was in
  `FEATURE_TRACKER.md` item 9 (now superseded by this entry) if revisiting.
- **Decided: email verification**, reusing existing infrastructure rather than adding
  new pieces. `AuthController::register()` now inserts the account with
  `status = 'disabled'` — reusing the enum value already used for admin-deactivated
  accounts, since `login()` already rejects any non-`active` user on every request, not
  just at login — plus a hashed, 72h-expiring verification token (same
  hash-of-random-value convention as `password_reset_tokens`). It sends the
  verification email **synchronously** via the existing `PostmarkClient`, a departure
  from item 1's notification emails (which go through `notification_queue` + the CLI
  cron worker) — appropriate here since it's one email to one recipient, not a fan-out,
  and gives the registering user immediate pass/fail feedback instead of a queue-delay
  window.
- Fails closed, not open: if Postmark isn't configured or the send fails, the
  newly-inserted user row is deleted and the request 500s, rather than leaving a
  permanently-stuck `disabled` account (no resend flow exists) or — worse — silently
  falling back to the old instant-active behavior the fix exists to close.
- New `POST /auth/verify-email` (`AuthController::verifyEmail()`) consumes the token and
  flips `status` to `active`; same generic "invalid or expired" error for
  unknown/expired/already-used tokens as the password-reset endpoint, so a caller can't
  distinguish those cases. Migration `012_organizer_email_verification.sql` adds
  `email_verify_token_hash`/`email_verify_token_expires_at` to `users`.
- Frontend: `RegisterComponent` no longer auto-logs-in on success (it can't — the
  account is disabled until verified) and instead shows a "check your email" message.
  New `VerifyEmailComponent` at the public `/verify-email` route auto-confirms on load,
  mirroring the existing `ConfirmSubscriptionComponent` pattern from item 1.

Status: Done. Migration applied to the production database and the code deployed
(commit `bb541e4`, 2026-08-12). Verified twice against the live production database via
the `run-bag-bracket` local stack — once via curl, once through the real Angular UI —
using two throwaway `claude-verify-test*` accounts (deleted afterward, along with their
`audit_log` rows; `users` row count confirmed back to its pre-test baseline): register →
account created `disabled` → login correctly rejected (401) before verification →
verification email actually sent through Postmark, with its plaintext link recovered via
Postmark's Messages API rather than needing inbox access → clicking the link flips the
account active → login then succeeds → a replayed token is correctly rejected. `users`
table was backed up to a local JSON snapshot before the migration ran, per `AGENTS.md`.
`php -l` clean, 177/177 frontend tests passing (10 new), `npm run build:prod` clean,
`git diff --check` clean.

Two things confirmed/found along the way, worth remembering:
- Postmark's synchronous curl call **does** work from a web-triggered PHP request (with
  the same `curl.cainfo` flag the CLI cron worker needed) — resolves a concern raised
  when this was scoped, that every prior Postmark call had only ever run from the CLI
  worker and the web SAPI might need separate `php.ini` configuration. Confirmed for the
  local PHP built-in server; the production host runs a different SAPI
  (Apache/php-fpm), so this is worth a quick re-check there if a future Postmark-from-web
  call ever misbehaves.
- Postmark now sends from `support@bracketway.com`, not the bare `irishguys.org` address
  recorded when item 1 was built — the sending domain has evidently been migrated since,
  consistent with the app's rebrand to Bracketway.

### Role-based access and tournament permissions

Introduced account roles and tournament-scoped permissions before expanding other organizer-facing features.

- **Super admin:** manage organizer accounts, all tournaments, and system-wide settings.
- **Tournament organizer:** registered account that can create tournaments and manage the tournaments it owns.
- **Tournament manager:** optional organizer invited to manage a specific tournament without ownership-level actions.
- **Scorekeeper/referee:** optional limited role that can enter or correct scores for assigned tournaments only.
- Only a tournament owner may delete a tournament, transfer ownership, or manage tournament managers.
- Record an audit trail for score corrections, visibility changes, ownership transfers, and role assignments.

Status: Done. All four phases of the detailed plan are complete — super admin/organizer/
manager/scorekeeper roles, tournament ownership and staff management (`/admin/users` +
the tournament Staff & Access panel), and capability-aware frontend behavior (controls
are hidden based on what the backend says the current user can actually do, not just
whether they're logged in).

Two roles from the original scope were **not** built here and live under Planned in
`FEATURE_TRACKER.md` instead: **Subscriber** is part of item "Participant score-update
email notifications", and **Unauthenticated viewer via direct UUID/GUID link** is part
of "Public and private tournament visibility". General anonymous viewing of public
brackets already works today and isn't blocked on either of those.

Detailed plan (all four phases): [USER_MANAGEMENT_PLAN.md](USER_MANAGEMENT_PLAN.md)

### 2. Display participant names for custom-named teams

When a team name has been edited from its generated default (`Participant 1 & Participant 2`), show the participant names beneath the custom team name wherever teams are displayed in the bracket.

- Keep generated default team names as the sole label so participant names are not repeated.
- Identify whether a team name is custom by comparing it with its generated participant-name label.
- Render participant names as a smaller, muted secondary label to avoid clutter.
- Apply the same display rule consistently in score-entry and read-only bracket views.
- Do not rely solely on a hover tooltip, because bracket viewing must work on touch devices.

Status: Done. `MatchController::bracket()` and `updateScore()` (`api/controllers/MatchController.php`)
now join each match's teams to their participants and return `team{1,2}_participant{1,2}_name`
alongside the existing `team{1,2}_name`. `BracketViewComponent.teamParticipants()`
(`frontend/src/app/bracket/bracket-view.component.ts`) reuses the same default-name-reconstruction
check as `ParticipantController::update()` (`${p1} & ${p2}` equality) to decide whether a team's
name is custom, and the template renders the participant names as a muted `.team-participants`
label stacked under the team name — same markup path for both score-entry and read-only bracket
views (`canScore()` only gates the score input/button, not the name display). Verified live against
a drawn tournament: an unrenamed team ("Bob & Carol") shows no sub-label, a renamed one
("The Champions") shows "Dave · Alice" beneath it.

### 4. Public and private tournament visibility

Allow organizers to choose whether a tournament is listed publicly or viewable only by people who have its direct link.

- Add a visibility setting during tournament creation and management: **public** or **private**.
- Exclude private tournaments from the public home-screen tournament list.
- Give every tournament a stable, non-guessable UUID/GUID for public bracket URLs instead of exposing its sequential numeric database ID.
- Resolve public bracket pages by UUID/GUID; keep numeric IDs for internal database relationships and authenticated admin routes.
- A private tournament remains viewable to anyone who has its direct link; it is not password-protected or authenticated access control.
- Ensure public tournament links and existing bracket navigation use the new public identifier consistently.

Status: Done. Migration `006_tournament_visibility.sql` added `tournaments.uuid`
(v4, generated in `TournamentController::generateUuidV4()`) and `tournaments.visibility`
(`public`/`private`, default `public`). `TournamentController::list()` filters to
`visibility = 'public'` for anonymous callers only — authenticated callers (the admin
dashboard) still see everything, unchanged. `GET /tournaments/by-uuid/{uuid}` (new
`getByUuid()`) resolves a tournament by its uuid with no visibility gate — knowing the
uuid is the access grant, per spec.

The part the original scope note didn't cover: `MatchController::bracket()`,
`TeamController::listByTournament()`, and `ParticipantController::listByTournament()`
had **no visibility/auth check at all** before this — a private tournament's numeric ID
would still work as a bypass. Added `requireTournamentVisible()`
(`api/middleware/auth.php`) and call it from `api/index.php` before each of those three
GET-by-tournament-id branches (and inline in `TournamentController::get()`): private
tournaments 404 for anonymous callers and non-staff, everyone else unaffected.

Frontend: `BracketViewComponent` (`frontend/src/app/bracket/bracket-view.component.ts`)
branches on whether the `:id` route param is numeric or a uuid — numeric keeps the
original parallel tournament+bracket fetch, a uuid resolves via `getTournamentByUuid()`
first (sequential, since the bracket fetch needs the resolved numeric id).
`tournament-list.component.ts` (public home screen) now links tournaments by `t.uuid`.
`admin-dashboard.component.ts` and `tournament-manage.component.ts`'s "View bracket"
link stay on the numeric id (authenticated admin routes, per spec). Added a
Public/Private toggle + "Copy link" control to `tournament-manage.component.ts`,
gated by `canManageSetup()`, plus a visibility selector on the creation form in
`admin-dashboard.component.ts` — without either, there'd be no way to actually set or
retrieve the shareable link.

Verified live: `schema_migrations` was unexpectedly empty despite the schema already
reflecting 001/004/005 (confirmed with Matt before backfilling those three rows so
`migrate.php` could run 006 cleanly). Then confirmed end-to-end against the real DB: a
private tournament disappears from the anonymous tournament list, its numeric-id
tournament/matches/teams/participants endpoints all 404 anonymously, its
`/bracket/{uuid}` link still loads with no auth, and the owner (via numeric id) is
unaffected throughout.

### Email provider split — bulk notification mail moved to Brevo

Bulk notification mail (item 1's queue plus item 14's organizer digest) now sends through
Brevo; auth mail stays on Postmark. Added 2026-08-13 per Matt, driven by cost: Postmark's
free tier is 100 emails/month, which had already forced item 1's `match_completed`
category to be switched off. The goal was staying on a free tier until there's revenue
(see [FEATURE_TRACKER.md](FEATURE_TRACKER.md) items 12/13), not the ~$6/mo difference
between paid plans.

- **Split by email class, not a runtime provider switch.** `AuthController::register()`'s
  verification email is fail-closed — a send failure blocks account creation — so it stays
  on Postmark where bulk volume can never exhaust its quota. Everything the cron worker
  sends goes through Brevo. The two call sites already live in separate files, so each
  constructs the client it wants; deliberately **no** `EmailClient` interface or factory,
  since an abstraction would only earn its keep for deploy-free provider switching or
  fallback chaining.
- **Provider choice.** Brevo's free tier is 300 emails/day (9k/mo). Mailjet was evaluated
  and rejected: only 200/day, and it *queues* overflow to the next day (dropped after 3),
  which is actively harmful for time-sensitive "here's your next matchup" mail. Resend
  (100/day) and MailerSend (100/day free) were too tight; SES was rejected because
  hand-rolling SigV4 signing on PHP 7.2 with no Composer is the one integration where the
  no-SDK convention genuinely hurts.
- **Why the daily cap is survivable.** Item 12's `FREEMIUM_FREE_TIER_MAX_PARTICIPANTS = 32`
  bounds a free tournament to ~160 emails (4 rounds × 32 + 32 finalized, with
  `match_completed` off) — about half the daily cap. A paid-tier tournament (256
  participants, ~2,050 emails) blows through it 7×, but that's exactly when there's
  revenue to pay for email. The two caps are naturally coupled. The realistic failure mode
  is two free tournaments finishing the same day.
- **`api/services/BrevoClient.php`** mirrors `PostmarkClient`'s shape (raw curl, no SDK).
  Differences handled: Brevo answers **201**, not 200, on success; `sender`/`to` are
  objects/arrays rather than flat strings; and `send()` returns a fourth field,
  `retry_after`, read from the `x-sib-ratelimit-reset` header via a curl header callback.
- **Migration `015_brevo_bulk_email.sql`** adds `notification_queue.next_attempt_at` and
  `provider`, renames `postmark_message_id` → `provider_message_id` (widened to 255 —
  Brevo returns a full angle-bracketed message-id, not a short uuid), backfills existing
  rows as `provider = 'postmark'`, and widens `notification_suppressions.reason` to
  include `invalid_address` and `blocked` (Brevo reports two permanently-undeliverable
  outcomes Postmark folded into its bounce webhook; without this the insert fails under
  strict mode).
- **The `next_attempt_at` column is the point of the migration.** Brevo answers **429**
  when the daily cap is exhausted. Without a way to park a row, the worker would spend all
  `MAX_ATTEMPTS` (5) within ~15 minutes of the 3-minute cron and mark the email
  permanently failed, hours before the quota reset — silently losing the tail of a
  tournament's mail. `processRow()` now parks the row without consuming an attempt, and
  the batch short-circuits on the first 429 (all 50 rows would hit the same cap, so
  parking each individually would waste 50 calls against Brevo's daily *request* budget).
- **Webhooks.** Brevo posts *every* subscribed event to a single URL, unlike Postmark's
  one-endpoint-per-event, so `NotificationController::webhookBrevo()` switches on the
  payload's `event` field and suppresses only permanent failures (`hardBounce`, `spam`,
  `invalid`, `blocked`) — soft bounces and deferrals are transient and Brevo retries them
  itself. It returns 200 for events it ignores, since Brevo disables webhooks that keep
  failing. Two gotchas: Brevo names events camelCase when subscribing (`hardBounce`) but
  snake_case in the delivered payload (`hard_bounce`), and its payload field is lowercase
  `email` where Postmark's is `Email`. `checkWebhookAuth()` was refactored to take the
  expected credentials as arguments so each provider has independent webhook logins.
- **Brevo's API is more capable than its web UI**, worth remembering: the UI has no `spam`
  option (it's labeled "Complaint") and rejects credentials embedded in the destination
  URL, while the API accepts both without complaint.

Status: Done — deployed to the production host and migration applied 2026-08-13/14.
`bracketway.com` is authenticated and verified in Brevo via DNS, coexisting with
Postmark's records (DKIM selectors are per-provider subdomains and don't collide; each
provider's custom Return-Path subdomain keeps its SPF off the apex record). Verified:
a direct `BrevoClient` send delivered; the deployed worker runs clean against the new
schema; and the **real cron worker** sent a `confirmation` and a `round_completed`
through Brevo (`provider = 'brevo'`, 0 attempts, no errors), confirming
queue → cron → Brevo end to end with genuine production data. The migration backfill was
confirmed correct against real rows — pre-switch entries kept `provider = 'postmark'` with
their original short uuids. `php -l` clean on all six changed files, `git diff --check`
clean. Backend/worker-only; no frontend changes.

**One item still unproven:** whether Brevo's outbound webhook call actually carries the
URL-embedded credentials. The endpoint provably rejects unauthenticated calls (401) and
accepts the registered ones (200), and only one auth mechanism is configured, so the risk
is low — but no real suppressing event has fired yet to confirm it. Two probe attempts
failed to trigger one for legitimate reasons worth remembering: `irishguys.org` still has
a **catch-all** (it survived the Gmail migration — a bogus local part gets `delivered`,
not bounced), and Brevo classifies an unresolvable MX (e.g. a `.invalid` domain) as a
**soft** bounce, which is deliberately not subscribed. The deterministic test is to
blocklist a throwaway address in the Brevo **UI** — there is no API to *add* blocklist
entries, only `GET` and `DELETE` — and then send to it, which emits a subscribed
`blocked` event.

### 1. Participant score-update email notifications

Allow participants to opt in to tournament updates and receive an email whenever a match score is recorded or corrected.

- Use Postmark for transactional email delivery.
- Capture participant email addresses and subscription consent, using double opt-in.
- Include an unsubscribe link in every notification.
- Queue notifications in the database, send them from a scheduled worker, and retry transient failures.
- Process Postmark delivery, bounce, and spam-complaint webhooks; suppress addresses that should no longer receive messages.
- Include the tournament, round, teams, score, winner, and a link to the public bracket in each email.

Status: Done. The shipped design refined the original single-email-type scope into three
independently opt-out-able categories, per Matt's spec during planning: **match
completed** (to the 4 participants of that specific match), **round completed** (to
every confirmed participant tournament-wide, with next-round matchups, once every match
in a round is `complete`/`bye`), and **tournament finalized** (to every confirmed
participant, on the championship match). One deliberate deviation from the original
bullet list above: score **corrections** do not send a notification — only a match's
first completion does, to avoid re-blasting an email that looks like a duplicate.

Migration `007_notification_queue.sql` adds `participants.email` plus an orthogonal
`notification_lifecycle` (none/pending/confirmed/suppressed) and three `notify_*`
booleans (default on), so "never opted in," "opted in but a category is off," and
"hard-suppressed via bounce/complaint" are all distinguishable. Enqueueing lives in three
private helpers on `MatchController` (`enqueue{Match,Round,Tournament}...Notifications()`),
called from `updateScore()` and gated on `!$wasComplete`. New
`api/controllers/NotificationController.php` handles confirm / per-category unsubscribe /
preferences / both Postmark webhooks — all public and token- or Basic-Auth-gated, since
participants have no login. Per-participant "manage my preferences" links use no stored
token at all: `notificationManageToken()` (`api/middleware/auth.php`) is a deterministic
HMAC of participant id + a version counter + a server secret, recomputed on demand rather
than persisted, so bumping the version instantly invalidates old links (used when an
email address changes). `api/scripts/send_notifications.php` is the CLI worker;
`api/services/PostmarkClient.php` is a small curl wrapper with no SDK dependency.

Known accepted limitation: a round that completes entirely via byes (no actual score
entry) does not trigger a round-completed email, since byes resolve at draw time in
`TeamController::generateBracket()` and never touch `updateScore()`.

**Operational addition (2026-08-10):** per-category kill switches
(`BB_NOTIFY_{MATCH_COMPLETED,ROUND_COMPLETED,TOURNAMENT_FINALIZED}_ENABLED` env vars,
defined as `NOTIFY_*_ENABLED` constants in `api/config/database.php`) let an operator
disable a category app-wide — e.g. to stay under a Postmark plan's monthly send limit —
independent of any participant's own per-category opt-out. Checked in two places:
`MatchController`'s three `enqueue*Notifications()` helpers (skip enqueueing entirely)
and `send_notifications.php`'s `processRow()` (re-checked at send time, in case a
category was disabled after a row was already queued; marks such rows `skipped` with
reason "This notification category is currently disabled"). Verified against the real
production DB via a throwaway tournament (`ZZ_CLAUDE_TEST_KILLSWITCH`, deleted after):
confirmed the enqueue-time guard both for the current local default
(`match_completed` off, `round_completed`/`tournament_finalized` on) and for an env-var
override forcing all three on; confirmed the send-time guard by disabling
`round_completed`/`tournament_finalized` after enqueueing and observing both rows marked
`skipped` with the expected reason, no Postmark call attempted. Still uncommitted on
`feature/tournament-enhancements`.

Verified live end-to-end against the real production DB (migration applied, `participants`
backed up first): all four email types (confirmation, match/round/tournament) sent via a
real Postmark send and received; the correction-guard, per-category unsubscribe, and both
webhook endpoints (bounce `Inactive` distinction, spam-complaint, Basic Auth) all checked
directly against the database. The worker now runs from `/etc/cron.d/bags-notifications`
every 3 minutes (wrapped in `flock -n` — the worker has no row-locking between separate
invocations, so this guards against a double-send if one run ever overran the interval),
logging to `/var/log/bags-notifications.log`. Getting cron running surfaced two real
production gaps worth remembering: `php7.2-curl` wasn't installed on the host (nothing in
this app had needed curl before Postmark), and `/etc/cron.d/` entries need a username
field a personal `crontab -e` entry doesn't, plus a trailing newline or cron silently
drops the whole file.

### 6. Participant self-registration

Let a coordinator share a tournament's link (or a QR code, generated externally from that
same link for now) at an event so attendees can add themselves to the roster, rather than
the organizer typing in every name.

- A public, unauthenticated registration page keyed on the tournament's uuid, reusing the
  same "uuid is the access grant" convention as the bracket-view link — works for private
  tournaments too.
- Self-registered participants land as `pending`, not immediately on the live roster.
  `TeamController::draw()` excludes them (both client-side and server-side — the draw
  endpoint itself now rejects a draw attempt while any pending registration exists), so a
  walk-up entry can never silently end up on a team without the organizer having reviewed
  it.
- Approve moves a participant to the live roster (`PUT /participants/{id}/approve`);
  reject reuses the existing delete endpoint — a pending row is a real row.
- Abuse mitigations sized to the actual threat model (a link/QR shown at one physical
  event, not an internet-facing form): a soft per-tournament cap
  (`ParticipantController::MAX_PARTICIPANTS_PER_TOURNAMENT`, 64) and a honeypot field that
  silently fake-succeeds instead of erroring, so a bot that fills every field it finds
  doesn't learn it was rejected. Deliberately did not add IP-based rate limiting or a
  CAPTCHA — there's no rate-limiting infrastructure anywhere in this app today, and
  building it for a threat that hasn't materialized isn't worth it; revisit if it ever is.
- Self-registration accepts an optional email, which runs through the exact same
  double-opt-in flow as organizer-entered emails (`ParticipantController::startEmailOptIn()`,
  extracted from `setNotificationEmail()` so both paths share one implementation) — no new
  consent model to build.

Status: Done. Migration `008_participant_self_registration.sql` adds
`participants.registration_status` (`approved`/`pending`, default `approved` so existing
organizer-added rows are unaffected). New public endpoint
`POST /participants/self-register` (routed before the generic authenticated `POST
/participants` in `api/index.php` — ordering matters, same lesson as the earlier
`notification-email` sub-route). New admin-facing page under `tournament-manage.component.ts`:
a pending-approvals banner, Approve/Reject controls per pending row (Reject's confirmation
dialog is worded differently from a normal delete), and a "Copy registration link" button
next to the existing "Copy link" (shown only during `setup`, same as when registration is
actually open).

Verified live end-to-end against the real production DB: self-register happy path
(including the email opt-in queuing a real confirmation send), honeypot correctly
blocking a filled-decoy-field submission with no row created, validation errors (missing
name, invalid email, unknown/closed tournament), the server-side pending-blocks-draw
guard, approve promoting a participant onto a successful draw, and reject (delete)
removing a pending row — all checked directly against the database, plus the public
registration page and the admin approve/reject UI confirmed in a real browser. Test data
fully deleted afterward.

### 3. Configurable team entry and seeding

Let organizers choose how each tournament bracket is created rather than always using the original random participant draft and automatic seeding.

- During tournament setup, choose one team-entry mode:
  - **Direct team entry:** create teams by entering team names directly.
  - **Auto-draft:** add individual participants, randomly pair them into teams, and generate default team names.
- Choose seeding independently from team entry:
  - **Automatic seeding:** assign seeds automatically.
  - **Manual seeding:** let the organizer set or reorder each team's seed before the bracket is generated.
- Persist the selected setup options with the tournament and validate the selected data before generating the bracket.
- Preserve the original auto-draft plus automatic-seeding behavior as the default.

Status: Done. Shipped in two phases, per the 2026-08-10 planning note that split
this item — deliberately the biggest structural change of the four Planned items,
landing squarely in `TeamController::draw()`/`generateBracket()`, the exact area a
prior codebase review found two real bugs in (bad seed-splitting, a 2-participant
tournament reaching `active` with zero matches). Both phases leaned on careful
manual/live verification against the real database rather than automated backend
tests, since the PHP side still has no test framework (`AGENTS.md`: `php -l` only).

**Phase 1 — Manual seeding.** `teams.seed` and `generateBracket()`'s `seedOrder()`
already handled arbitrary seed → bracket-position mapping (including byes), so this
was just letting the organizer set/reorder seed before bracket generation instead of
it being assigned by draw order.

Migration `009_configurable_seeding.sql` adds `tournaments.seeding_mode`
(`automatic`/`manual`, default `automatic`). `TeamController::draw()` only
auto-generates the bracket and activates the tournament when `seeding_mode` is
`automatic`; under `manual` it stops after forming teams, leaving the tournament in
`setup` with teams already drawn. `TeamController::reorder()` (`PUT /teams/reorder`)
persists a drag-and-drop seed order; `generateBracketAction()` (`POST
/teams/generate-bracket`) finalizes the bracket from the current seed order.

Frontend: `tournament-manage.component.ts` gained a seeding-mode selector (locked
once teams exist), phase-aware draw-button copy, and a drag-and-drop seed list using
`@angular/cdk/drag-drop` (touch-capable out of the box, unlike native HTML5
drag-and-drop) with a dedicated `cdkDragHandle` per row rather than a whole-row drag,
so scrolling the list on a phone doesn't get mistaken for a drag.

Verified live end-to-end against the real production DB: created a manual-seeding
tournament, drew teams, dragged a team to re-rank it, confirmed the new order
survived a page reload, generated the bracket, and confirmed the reordered top seed
correctly received the bracket bye.

**Phase 2 — Direct team entry.** Bigger, because `teams.participant1_id`/
`participant2_id` are `NOT NULL` — every team is assumed to be exactly 2 named
participants, an invariant both the notification feature (item 1, "the 4
participants of that match") and the custom-team-name participant display (item 2)
depend on. Decided during planning: direct entry keeps that invariant rather than
allowing participant-less teams — the organizer types both member names directly
when creating a team, rather than adding participants individually and letting the
app randomize pairing. Avoids nullable participant columns and keeps both dependent
features working unchanged; deliberately does not solve variable team sizes for
other formats/sports (split out as item 7 instead).

Migration `010_configurable_team_entry.sql` adds `tournaments.team_entry_mode`
(`auto_draft`/`direct`, default `auto_draft`). New `TeamController::createDirect()`
(`POST /teams/direct`) creates both participant rows plus the team in one step,
appended at the next seed position; new `TeamController::delete()` (`DELETE
/teams/{id}`) undoes a mistakenly-entered team — removing it and its two
participants together, then re-numbering the remaining teams' seeds so they stay
contiguous (a gap in seed numbers reads as an implicit bye at that bracket position,
which would silently reshuffle who plays whom otherwise). `draw()` and
`createDirect()` now reject being called against a tournament configured for the
other mode. `generateBracketAction()` gained a `>= 2 teams` check — direct entry has
no upfront participant-count gate the way `draw()` does, so it could otherwise reach
this action with a single team and no opponent, the same "active with zero matches"
bug class item 3 had already fixed once for auto-draft.
`ParticipantController::create()`/`selfRegister()` now also reject direct-entry
tournaments outright — that mode has no unpaired-participant pool for a lone
add-participant or self-registration to join.

Frontend: `tournament-manage.component.ts` gained a team-entry-mode selector
(locked once teams exist, alongside the existing seeding-mode selector) and an "Add
Team" form (team name + both member names) for direct entry. The seed-order list
built for manual seeding was generalized to serve both team-entry modes and both
seeding modes at once — `[cdkDragDisabled]="!isManualSeeding()"` toggles
drag-ability rather than duplicating the list markup, and a per-team delete button
appears only in direct-entry mode. Automatic-seeding direct entry has no natural
"draw" event to trigger bracket generation the way auto-draft's single button does,
so `generateBracketAction()` is now the terminal action for direct entry regardless
of seeding mode, gated on `>= 2 teams` client-side to match the backend check.

Verified live end-to-end against the real production DB in both seeding-mode
combinations: created a direct-entry/manual tournament, added three teams, dragged
to reorder, deleted the middle team and confirmed the remaining two teams'
seeds re-numbered to 1/2, generated the bracket, and confirmed the reordered top
seed received the bye — then separately created a direct-entry/automatic
tournament, added two teams, and generated immediately, confirming the
already-shipped participant rename UI (Active-phase participants list) worked
unmodified against direct-entry-created participants. Test tournaments deleted
afterward.
