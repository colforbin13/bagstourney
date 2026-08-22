# Bracketway

A mobile-first tournament bracket manager — single or double elimination — for events played by
two-person teams — bags (cornhole), KanJam, pickleball doubles, darts, partner card games,
and anything else with the same shape. Nothing in the app is sport-specific; the frontend
lists representative games at `/sports` purely as copy.

Technology
- Frontend: Angular 21 (TypeScript, SCSS) — Node 20+ and TypeScript 5.9+ recommended
- Backend: PHP 7.x (PDO) + MySQL 5.7+ (`utf8mb4`)
- Deployment: Apache (recommended) or PHP built-in server for development

Overview
This repository contains a tournament manager that supports:

Running an event
- Creating tournaments, public (listed for anyone to follow) or private (unlisted, reachable only by link)
- Adding players by name, or sharing a public sign-up link and QR code so attendees can add themselves
- A separate bracket QR code for spectators, who can scan it to follow along without signing up for anything
- Print-ready signs for both QR codes, sized to a sheet of paper for the venue wall (print directly, or choose Save as PDF in the print dialog for a file)
- Self sign-ups arrive pending and join the roster only once an organizer approves them
- Two ways to form teams: auto-draft (players enter individually and are randomly paired) or direct entry (you type in each team)
- Two ways to seed: automatic at the draw, or a drag-and-drop ladder you arrange yourself
- Auto-generated bracket, rounding up to the next power of two, with byes for the unfilled slots
- Entering and editing match scores, with downstream consistency handling
- A dedicated score-entry screen for organizers and scorekeepers, listing only the matches playable right now instead of the whole bracket
- Soft-deleted tournaments, recoverable by a super admin

Viewing a bracket
- Mirrored bracket layout: both halves of round one start at the outside edges and play inward to the final in the middle, which keeps brackets short enough to read on one screen
- Phones get a stacked, round-by-round layout instead
- TV mode (`?kiosk=1` on any bracket URL) hides the app chrome and scales the whole bracket to fill a screen — intended for a television or projector at the venue. Bookmark the URL to point a streaming stick straight at it; Escape or the on-screen button leaves
- Public brackets auto-refresh, so a bracket left on a screen keeps up with play

Accounts and notifications
- Role-based access: super admins, organizers, and per-tournament owners, managers, and scorekeepers
- Registration requires confirming an emailed verification link before the account activates
- Players can opt in to emailed score updates (double opt-in, unsubscribe from any message)
- Organizers with pending sign-ups get a daily digest
- Audit log of sensitive actions, readable by super admins
- Per-account and per-tournament participant caps, ahead of real billing

Repository layout
- api/ — PHP API source (controllers, routing, config)
- frontend/ — Angular source
- dist/browser/ — Angular production build output (generated; do not edit by hand)
- db/schema.sql — SQL schema for initializing a new database
- db/migrations/ — numbered, forward-only migrations for existing databases
- deploy.ps1 / deploy.sh — deployment helpers

Planning docs
- `FEATURE_TRACKER.md` — planned work in priority order, plus a one-line summary of everything shipped
- `FEATURE_ARCHIVE.md` — full implementation notes, design decisions, and verification history per feature
- `AGENTS.md` / `CLAUDE.md` — repo conventions and commands for contributors and coding agents

Getting started (local)
1. Database
   - Create the DB and tables: `mysql -u root -p < db/schema.sql`
   - Edit `api/config/database.php` with your DB credentials and set a strong `JWT_SECRET`. Start from `api/config/database.php.example`.
   - Apply application migrations: `php db/migrate.php`. Back up production databases before applying migrations.

2. Run the API
   - With PHP built-in server for quick local testing:
     ```bash
     php -S localhost:8080 -t api
     ```
   - If `pdo_mysql` is installed but disabled in your `php.ini`, load it per-invocation rather than editing the global config:
     ```bash
     php -d extension=pdo_mysql -S localhost:8080 -t api
     ```
   - Or configure Apache to serve the `api/` directory. `api/index.php` strips an optional
     `/bags/api` or `/api` prefix, so the same code serves both setups — note that the
     production deployment answers at `/api`, not `/bags/api`, which matters for any
     externally registered callback URL such as an email provider's webhook.

3. Run the frontend
   ```bash
   cd frontend
   npm ci
   npm start         # runs `ng serve` on default port (4200)
   ```
   - Update `frontend/src/environments/environment.ts` if your API base path differs.

Testing
```bash
cd frontend
npm run test:ci      # headless Chrome with coverage — use this for CI and automation
npm run test         # interactive; opens a real browser, local development only
```
- Coverage report lands in `frontend/coverage/bracketway/index.html`.
- There is no PHP test framework configured; `php -l` on changed files plus manual API checks are the available backend verification.

Build & deploy
- Production frontend build:
  ```bash
  cd frontend
  npm ci
  npm run build:prod   # output → dist/browser/ at the repository root
  ```
- Deploy with the provided PowerShell script (Windows): `.\deploy.ps1`.
  - Override destinations with environment variables: `DEPLOY_PATH`, `DEPLOY_API_PATH`.
  - The script never overwrites the already-deployed `api/config/database.php`.
- When a change includes a migration, the required order is: deploy API files → run `php db/migrate.php` on the target → deploy or refresh the frontend.

Frontend routes
- `/` — landing page and list of public tournaments
- `/tournaments` — the same list without the landing content
- `/how-it-works` — walkthrough of running a tournament end to end
- `/bracket/:id` — public bracket, by numeric id or by UUID (append `?kiosk=1` for TV mode)
- `/register/:uuid` — public player sign-up for a tournament
- `/poster/:uuid/:kind` — printable venue sign for the bracket or sign-up QR (`kind` is `bracket` or `register`)
- `/admin`, `/admin/tournament/:id` — organizer dashboard and tournament management
- `/admin/tournament/:id/score` — score entry, showing only currently playable matches
- `/admin/users`, `/admin/deleted-tournaments`, `/admin/audit-log` — super admin screens

API (key endpoints)
- POST /auth/login — authenticate; returns JWT. Also /auth/register, /auth/verify-email, /auth/reset-password, /auth/change-password
- GET /tournaments, POST /tournaments, PUT/DELETE /tournaments/:id
  - The list response carries per-tournament summary stats (team count, round and match progress, champion)
- GET /tournaments/by-uuid/:uuid — public access by the non-guessable link
- GET /tournaments/deleted, POST /tournaments/:id/restore — super admin recovery
- GET /participants/:tournamentId, POST /participants, PUT/DELETE /participants/:id
- POST /participants/self-register — public, unauthenticated player sign-up
- PUT /participants/:id/approve — organizer approval of a pending sign-up
- GET /teams/:tournamentId, POST /teams (draw teams), POST /teams/direct, POST /teams/generate-bracket, PUT /teams/reorder
- GET /matches/:tournamentId (bracket grouped by round)
- PUT /matches/:id — submit or edit scores (payload: `{ team1_score, team2_score }`)
- /notifications/* — subscription confirm, unsubscribe, preferences, and provider webhooks
- GET /audit-log — super admin only; searchable, filterable, sortable, paginated

Authorization
- Existing `admins` are copied to active `super_admin` users by migration `001_access_control.sql`.
- Migration `002_backfill_legacy_admins.sql` re-checks legacy admins, so apply migrations again after deploying this change if an existing account was missed.
- New registrations create `organizer` accounts. An organizer becomes the `owner` of each tournament they create.
- Tournament owners can grant `manager` and `scorekeeper` access. Managers can manage setup; scorekeepers can submit scores.
- Existing tournaments have no inferred owner because the original schema did not record one; super admins retain access and can assign ownership.
- Frontend route guards are a convenience only. Every endpoint enforces access server-side.

Role-management API
- POST /auth/register creates an organizer account (username, email, password).
- GET/POST /tournament-members/:tournamentId lists or adds tournament staff (owner only).
- PUT/DELETE /tournament-members/:tournamentId/:userId updates or removes tournament staff (owner only).
- PUT /tournament-ownership/:tournamentId transfers ownership with `{ user_id }`.
- GET /users and PUT /users/:id list and manage organizer accounts (super admin only).

Editing scores & consistency
- The API allows editing completed matches. When an edited match had previously advanced a winner, downstream slots/results are cleared (recursively) so the bracket remains consistent. Re-enter downstream scores as needed.

Email
- Account mail (verification, password reset) sends through Postmark and is deliberately kept on its own provider, so exhausting a bulk quota can never block registration.
- Bulk notification mail (score updates, digests) sends through Brevo via a cron worker, with per-category kill switches in `api/config/database.php`.

Styling & theming
- Global SCSS variables live in `frontend/src/assets/styles/global.scss` for quick theme tweaks (colors, radius, fonts).

Session handling
- Frontend uses JWT stored in localStorage. On 401 responses the app clears session and redirects to the login page with a toast explaining session expiry.

Contributing
- Fork and open PRs. Follow existing conventions: keep styles scoped, use CSS variables, and add unit tests for new components, services, and guards. See `AGENTS.md` for the full conventions.

Notes
- Ensure PHP has `pdo_mysql` enabled. Use HTTPS and a strong `JWT_SECRET` in production.
- Keep backend code PHP 7 compatible — the production host runs PHP 7.x.

License
- MIT License — see the included LICENSE file in the repository.

Contact
- Open issues for bugs or feature requests.
