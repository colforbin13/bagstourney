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
- No PHPUnit or other PHP test framework is set up. `php -l` plus manual API/browser smoke tests are the only local verification available.

### Deployment

- `deploy.ps1` (Windows) builds the frontend via `npm run build:prod`, then robocopies `dist/browser/` and `api/` to `$DEPLOY_PATH`/`$DEPLOY_API_PATH` (default `\\192.168.1.18\www\bags` and `...\bags\api`). It never overwrites the already-deployed `api/config/database.php`.
- When a change includes a migration, the required order is: deploy API files → run `php db/migrate.php` on the target → deploy/refresh the frontend.

## Architecture

### Request flow

`frontend/` (Angular SPA) talks REST/JSON to `api/index.php`, a single front-controller router, which dispatches to `api/controllers/*.php`, which talk to MySQL via PDO.

`api/index.php` splits the URL into `resource/id/action` segments (e.g. `/users/5/password-reset` → resource `users`, id `5`, action `password-reset`) and dispatches per resource with an if/elseif chain keyed on HTTP method. It strips an optional `/bags/api` or `/api` prefix, so the same router code serves the unprefixed local PHP built-in server and the Apache production deployment under `/bags/api`.

### Auth

JWTs are hand-rolled HS256 (`api/middleware/auth.php`: `generateJWT`/`verifyJWT` — no external JWT library), signed with `JWT_SECRET` and expiring after `JWT_EXPIRY` (8h). There's no middleware chain; controllers/router code call one of three helpers explicitly per endpoint:

- `requireCurrentUser($db)` — valid token + active user, any role.
- `requireSuperAdmin($db)` — role must be `super_admin`.
- `requireTournamentRole($db, $tournamentId, $roles)` — checks `tournament_members` for a scoped role (`owner`/`manager`/`scorekeeper`) on that tournament; `super_admin` always passes.

On the frontend, `AuthService` keeps the JWT and user profile in signals backed by `localStorage` (`bb_token`, `bb_user`, `bb_user_profile`). `auth.interceptor.ts` attaches `Authorization: Bearer <token>` to every request and force-logs-out on any `401`. `auth.guard.ts`/`superadmin.guard.ts` gate routes client-side — per `AGENTS.md`, these are UX only; the backend is the real authorization boundary.

### Data model

Core tournament tables (`db/schema.sql`): `tournaments` → `participants` → `teams` (drawn/paired from participants) → `matches` (bracket, grouped by round; supports a `bye` status for auto-advance). Access-control tables (added by `db/migrations/001_access_control.sql`): `users` (global role `super_admin`/`organizer`), `tournament_members` (per-tournament scoped role), `audit_log` (written via `writeAuditLog()` for sensitive actions). Legacy `admins` rows are migrated into `users` both by a one-time migration and, defensively, again on first legacy login (`AuthController::login`).

### Frontend structure

- `admin/` — authenticated screens: dashboard, login/register, user management, tournament management, password change/reset.
- `bracket/` — public tournament list and bracket view; no auth required, reachable by tournament ID.
- `shared/services/` — one API client per resource area. `tournament.service.ts` is the general-purpose API client despite its name — it also covers users, tournament membership, and auth actions like password reset. `auth.service.ts`/`auth.guard.ts`/`auth.interceptor.ts` handle session state.
- `shared/models/` — TypeScript interfaces mirroring the API's JSON shapes.
- `app.routes.ts` — every route is lazy-loaded (`loadComponent`); guards are applied per-route, not on a shared parent route.

### Roadmap docs

`FEATURE_TRACKER.md` lists planned work in priority order, with shipped work summarized
in one line each. `FEATURE_ARCHIVE.md` holds the full implementation notes, design
decisions, and verification history for every shipped item — check it for prior art
before touching an area again. `USER_MANAGEMENT_PLAN.md` is the detailed design doc for
the (now-complete) role-based access and user-management work, kept as historical
reference. Check `FEATURE_TRACKER.md` before starting new work to avoid duplicating or
conflicting with what's planned.
