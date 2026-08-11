---
name: run-bag-bracket
description: Launch a local Bracketway dev stack (Angular frontend + PHP API) against the production database on the local network, for browser-based verification of UI/API changes before deploying.
---

# Running Bracketway locally

This repo's API talks to a MySQL database that normally only production
touches, reachable over the local network at `192.168.1.18:3306`. This
skill runs a local frontend + local API against that same database, so
changes can be verified in a real browser before `deploy.ps1` ships them.

## Prerequisites (one-time, already true on this machine)

- `api/config/database.php` exists locally (git-ignored — see
  `.gitignore`) and already contains working credentials for the
  production DB. If it's missing, copy it from wherever `deploy.ps1`
  seeds it (`\\192.168.1.18\www\bags\api\config\database.php`) or ask
  the user — do not fabricate credentials.
- The local PHP CLI ships `pdo_mysql` but it's disabled by default in
  `php.ini`. Don't edit `php.ini` (it's under `Program Files`, needs
  admin rights, and touching it changes PHP globally for this machine).
  Load the extension per-invocation instead — see below.

## Start the API

From the repo root, in the background:

```bash
php -d extension=pdo_mysql -d date.timezone=UTC -S localhost:8080 -t api
```

Smoke-test it before moving on:

```bash
curl -s -X POST http://localhost:8080/auth/login -H "Content-Type: application/json" \
  -d '{"username":"<user>","password":"<password>"}'
```

A JWT back means it reached the production DB successfully. See memory
for a super-admin test account already provisioned for this — don't ask
the user to re-share it, and don't commit it anywhere in this repo.

## Start the frontend

`frontend/src/environments/environment.ts` (dev-only; production builds
use `environment.prod.ts` via the `fileReplacements` rule in
`angular.json`, so this never affects `deploy.ps1`) already points
`apiUrl` at `http://localhost:8080`. If it's ever pointed elsewhere,
that's the one line to fix.

```bash
npm start --prefix frontend
```

Serves on `http://localhost:4200`.

## Driving it

Use the `claude-in-chrome` skill. Routes like `/admin/users` are gated
behind `authGuard` + `superAdminGuard`, so log in at `/admin/login`
first. Avoid taking real actions (password resets, role changes,
disables) against any account other than the designated test account —
this stack is wired to real production data, not a sandbox.

## Shutting down

Both processes are backgrounded tasks; stop them with `TaskStop` (or
just let the session end) rather than leaving them running indefinitely.
