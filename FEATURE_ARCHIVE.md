# Feature Archive

Detailed implementation notes, design decisions, and verification history for shipped
items. `FEATURE_TRACKER.md` lists these in one line each with a link into this file;
this is where the "how" and "how it was verified" live.

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
`git diff --check` clean. **Not yet deployed.**

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
watermark, wrapping header) are CSS review only. **Not yet deployed.**

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
