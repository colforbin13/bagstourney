# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Repo-wide conventions — PHP 7 compatibility, backend/frontend patterns, migration rules, unit test requirements, and verification/deployment hygiene — live in `AGENTS.md`. Read that file too; this one focuses on commands and architecture.

## Commands

### Frontend (Angular, run from `frontend/`)

- Install: `npm ci`
- Dev server: `npm start` (`ng serve`, http://localhost:4200)
- Dev build: `npm run build`
- Production build: `npm run build:prod` → outputs to `dist/browser/` at the repo root (not `frontend/dist/`)
- All tests, headless with coverage (use this for CI/agent verification): `npm run test:ci`
- All tests, interactive (local only — opens a real Chrome window): `npm run test`
- Single test file: `npm run test -- --include='**/user-management.component.spec.ts' --watch=false --browsers=ChromeHeadless`
- Coverage report after `test:ci`: `frontend/coverage/bracketway/index.html`

### Backend (PHP)

- Syntax-check a changed file: `php -l api/controllers/AuthController.php`
- Local dev server: `php -S localhost:8080 -t api`
- The API requires the `pdo_mysql` extension. If it's present but disabled in `php.ini`, load it per-invocation rather than editing the (often admin-protected) global ini: `php -d extension=pdo_mysql -S localhost:8080 -t api`
- Apply migrations: `php db/migrate.php` — idempotent, tracks applied files in the `schema_migrations` table
- PHP unit tests: `.\run-php-tests.ps1` (downloads `tools/phpunit.phar` on first run — no Composer, no `vendor/`). Pass PHPUnit flags straight through, e.g. `.\run-php-tests.ps1 --filter BracketBuilder`.
- Test scope is deliberately narrow: `tests/` covers pure logic in `api/lib/` and the thin persistence layer that writes it, using a recording PDO double. Nothing in `tests/` touches a database, network, or credentials, so the suite is safe to run anywhere. Controllers' request/response handling is still verified by `php -l` plus manual API/browser smoke tests.

### Deployment

- `deploy.ps1` (Windows) builds the frontend via `npm run build:prod`, then robocopies `dist/browser/` and `api/` to `$DEPLOY_PATH`/`$DEPLOY_API_PATH` (default `\\192.168.1.18\www\bags` and `...\bags\api`). It never overwrites the already-deployed `api/config/database.php`.
- When a change includes a migration, the required order is: deploy API files → run `php db/migrate.php` on the target → deploy/refresh the frontend.

## Architecture

### Request flow

`frontend/` (Angular SPA) talks REST/JSON to `api/index.php`, a single front-controller router, which dispatches to `api/controllers/*.php`, which talk to MySQL via PDO.

`api/index.php` splits the URL into `resource/id/action` segments (e.g. `/users/5/password-reset` → resource `users`, id `5`, action `password-reset`) and dispatches per resource with an if/elseif chain keyed on HTTP method. It strips an optional `/bags/api` or `/api` prefix, so the same router code serves both the local PHP built-in server and the Apache production deployment.

Note that despite the `/bags` deploy path, **production actually serves the API at `https://bracketway.com/api/...`, not `/bags/api/...`** — verified live 2026-08-13 by probing both (`/bags/api/...` returns the Angular app's `index.html` instead of the API). Use `/api/...` for any externally-registered callback URL, such as an email provider's webhook.

### Auth

JWTs are hand-rolled HS256 (`api/middleware/auth.php`: `generateJWT`/`verifyJWT` — no external JWT library), signed with `JWT_SECRET` and expiring after `JWT_EXPIRY` (8h). There's no middleware chain; controllers/router code call one of three helpers explicitly per endpoint:

- `requireCurrentUser($db)` — valid token + active user, any role.
- `requireSuperAdmin($db)` — role must be `super_admin`.
- `requireTournamentRole($db, $tournamentId, $roles)` — checks `tournament_members` for a scoped role (`owner`/`manager`/`scorekeeper`) on that tournament; `super_admin` always passes.

On the frontend, `AuthService` keeps the JWT and user profile in signals backed by `localStorage` (`bb_token`, `bb_user`, `bb_user_profile`). `auth.interceptor.ts` attaches `Authorization: Bearer <token>` to every request and force-logs-out on any `401`. `auth.guard.ts`/`superadmin.guard.ts` gate routes client-side — per `AGENTS.md`, these are UX only; the backend is the real authorization boundary.

### Data model

Core tournament tables (`db/schema.sql`): `tournaments` → `participants` → `teams` (drawn/paired from participants) → `matches` (bracket, grouped by round; supports a `bye` status for auto-advance). Access-control tables (added by `db/migrations/001_access_control.sql`): `users` (global role `super_admin`/`organizer`), `tournament_members` (per-tournament scoped role), `audit_log` (written via `writeAuditLog()` for sensitive actions). Legacy `admins` rows are migrated into `users` both by a one-time migration and, defensively, again on first legacy login (`AuthController::login`).

### Bracket generation

`api/lib/BracketBuilder.php` computes bracket *shape* as a pure function: given a seed → team-id map it returns match descriptors (round, match number, `bracket_side`, entrants, status, and forward pointers expressed as **array indexes**, since real match ids don't exist yet). `TeamController::generateBracket()` only persists that plan — insert every row, then a second pass rewriting indexes into ids.

Keep the split. Bracket logic that lives in the controller can't be tested without a database.

Two formats, one descriptor shape:

- `singleElimination()` — one forward edge (`next_match`), `bracket_side` always `winners`.
- `doubleElimination()` — adds the loser edge (`loser_match`), a losers tree, a grand final, and a reset match.

`generateBracket()` picks the format from `tournaments.format` (migration `016`), defaulting to single elimination for any value it doesn't recognise. Double elimination is a **paid-plan feature**, gated by `formatRequiresPaidPlan()` + `tournamentHasPaidFeatures()` / `userHasPaidPlan()` in `api/middleware/auth.php` — the same `users.plan` / `tournaments.paid_override` levers the participant cap uses.

The gate is checked at exactly two moments: choosing the format (`TournamentController::create()`/`update()`) and generating the bracket (`TeamController::requireFormatAllowed()`). Never while a tournament is being played — a lapsed plan must not break a live bracket at a venue mid-event. Format locks when `status` leaves `'setup'`, which is a *weaker* lock than `seeding_mode`/`team_entry_mode` (they also lock once teams exist); see the comment in `update()` for why copying them would strand manual-seeding organizers.

Two things about the double-elimination shape are worth knowing before touching it. Each major (even-numbered) losers round takes its winners-bracket drops in **reversed** order, so a dropped team can't immediately replay the match that dropped it. And a losers match that can only ever receive one team is **removed**, with its live feeder routed straight to that match's target — so byes exist only in winners round 1, and there are no run-time walkovers in the losers tree. Losers round *numbers* keep their structural value (even = major), which means a field with byes can start at losers round 2 with no round 1.

Tests: `tests/BracketBuilderTest.php` (single elimination, fields 2–64), `tests/BracketDoubleEliminationTest.php` (double elimination, fields 2–48, including full play-outs that assert every team is eliminated after exactly two losses and that the reset fires only when the losers side wins the grand final), and `tests/BracketPersistenceTest.php` (index → id translation, recording PDO double).

Match/tournament state transitions live in `MatchController`:

- `cascadePropagate()` advances the winner and, in double elimination, drops the loser. It stops short of the reset match when the winners-bracket side wins the grand final, since the reset is then moot.
- `cascadeClearDownstream()` unwinds results when a completed match is re-scored, following **both** edges; it recurses only where a team was actually withdrawn.
- `championOf()` answers "is this tournament decided", replacing the old `next_match_id IS NULL` rule — in double elimination that no longer means "the end". `syncTournamentStatus()` just writes what it returns.
- `enqueueRoundCompletedNotifications()` scopes its round by `bracket_side`; round numbers restart per side.
- `bracket()` returns `{ format, sides: [{ side, rounds: [{ round, matches }] }] }`, grouped by bracket side and *then* round — grouping on `round` alone merged winners round 2 with losers round 2 into one column. It also still emits the legacy `rounds` map, but **only for single elimination**, where it is exactly right; there is no correct single-tree shape for a two-tree bracket, so it is omitted rather than shipped wrong.

On the frontend, `shared/bracket-labels.ts` owns the derived presentation all three screens share: `roundLabel()` (which labels by a round's *position within its side*, hiding the gap left when a losers round collapses away) and `championName()` — which mirrors `championOf()` and must be kept in step with it. `bracket-view` renders single elimination through its existing mirrored/column layouts untouched, and double elimination through `sideLayouts()`: stacked winners → losers → grand final sections whose rows are apportioned from each round's real match count, since the losers bracket halves every *two* rounds rather than every round.

`tests/MatchCascadeTest.php` covers all of this against an in-memory SQLite database, because the cascade reads back state it just writes. It was validated by mutation — breaking the loser edge, the loser drop, the reset guard, or the champion rule each fails at least one test.

### Link previews

`/bracket/...` is rewritten to `api/preview.php` (see the rewrite in `frontend/src/.htaccess`), which serves the built `index.html` with per-tournament Open Graph and Twitter Card tags injected, and replaces the generic `<title>`. Messaging apps don't run JavaScript, so a single-page app's tags have to be in the HTML as served — otherwise every shared bracket previews identically as "Bracketway".

The tag-building is pure and lives in `api/lib/LinkPreview.php` (tested in `tests/LinkPreviewTest.php`); `preview.php` only fetches the row and serves the page. It **fails safe**: no shell, no database, unknown tournament, or any exception all fall through to serving `index.html` untouched, which is exactly the pre-existing behavior. A link preview is never worth taking the bracket page down for.

Private tournaments are described like public ones — knowing the link already grants full access to the bracket, so withholding the name would protect nothing while making a deliberately shared link look broken.

`og:image` is a static brand card at `frontend/src/assets/og-card.png`, generated once with GD from the favicon's geometry and Bebas Neue. Production needs neither GD nor the font. Both the PNG and `.htaccess` are Angular assets, so they land in `dist/browser/` and survive `deploy.ps1`'s mirrored copy of the web root — which deletes anything not in the build output.

### Frontend structure

- `admin/` — authenticated screens: dashboard, login/register, user management, tournament management, password change/reset.
- `bracket/` — public tournament list and bracket view; no auth required, reachable by tournament ID.
- `shared/services/` — one API client per resource area. `tournament.service.ts` is the general-purpose API client despite its name — it also covers users, tournament membership, and auth actions like password reset. `auth.service.ts`/`auth.guard.ts`/`auth.interceptor.ts` handle session state.
- `shared/models/` — TypeScript interfaces mirroring the API's JSON shapes.
- `app.routes.ts` — every route is lazy-loaded (`loadComponent`); guards are applied per-route, not on a shared parent route.

### Roadmap docs

`FEATURE_TRACKER.md` lists planned work in priority order, with shipped work summarized
in one line each and researched-then-rejected ideas under Evaluated and declined (check
there before proposing a direction — each entry records what would have to change to flip
the call). `FEATURE_ARCHIVE.md` holds the full implementation notes, design
decisions, and verification history for every shipped item — check it for prior art
before touching an area again. `USER_MANAGEMENT_PLAN.md` is the detailed design doc for
the (now-complete) role-based access and user-management work, kept as historical
reference. Check `FEATURE_TRACKER.md` before starting new work to avoid duplicating or
conflicting with what's planned.
