# Bag Bracket

A mobile-first, single-elimination tournament bracket manager.

Technology
- Frontend: Angular 21 (TypeScript, SCSS) — Node 20+ and TypeScript 5.9+ recommended
- Backend: PHP (PDO) + MySQL
- Deployment: Apache (recommended) or PHP built-in server for development

Overview
This repository contains a simple tournament manager that supports:
- Creating tournaments and adding participants
- Drawing teams (random pairing + seeding) and auto-generating a bracket
- Entering and editing match scores (with downstream consistency handling)
- Responsive bracket UI with mobile-friendly score entry

Repository layout
- api/ — PHP API source (controllers, routing, config)
- frontend/ — Angular source
- dist/browser/ — Angular production build output (generated)
- db/schema.sql — SQL schema for initializing the database
- deploy.ps1 — Windows deployment helper (builds frontend and syncs files)

Getting started (local)
1. Database
   - Create the DB and tables: `mysql -u root -p < db/schema.sql`
   - Edit `api/config/database.php` with your DB credentials and set a strong `JWT_SECRET`.
   - Apply application migrations: `php db/migrate.php`. Back up production databases before applying migrations.

2. Run the API
   - With PHP built-in server for quick local testing:
     ```bash
     php -S localhost:8080 -t api
     ```
   - Or configure Apache to serve `/bags/api` from the `api/` directory.

3. Run the frontend
   ```bash
   cd frontend
   npm ci
   npm start         # runs `ng serve` on default port (4200)
   ```
   - Update `frontend/src/environments/environment.ts` if your API base path differs.

Build & deploy
- Production frontend build:
  ```bash
  cd frontend
  npm ci
  npm run build:prod   # output → dist/browser/
  ```
- Deploy with the provided PowerShell script (Windows): `.build\deploy.ps1`.
  - Override destinations with environment variables: `DEPLOY_PATH`, `DEPLOY_API_PATH`.

API (key endpoints)
- POST /auth/login — authenticate; returns JWT
- GET /tournaments, POST /tournaments, PUT/DELETE /tournaments/:id
- GET /participants/:tournamentId, POST /participants, DELETE /participants/:id
- GET /teams/:tournamentId, POST /teams (draw teams & generate bracket)
- GET /matches/:tournamentId (bracket grouped by round)
- PUT /matches/:id — submit or edit scores (payload: { team1_score, team2_score })

Authorization
- Existing `admins` are copied to active `super_admin` users by migration `001_access_control.sql`.
- Migration `002_backfill_legacy_admins.sql` re-checks legacy admins, so apply migrations again after deploying this change if an existing account was missed.
- New registrations create `organizer` accounts. An organizer becomes the `owner` of each tournament they create.
- Tournament owners can grant `manager` and `scorekeeper` access. Managers can manage setup; scorekeepers can submit scores.
- Existing tournaments have no inferred owner because the original schema did not record one; super admins retain access and can assign ownership.

Role-management API
- POST /auth/register creates an organizer account (username, email, password).
- GET/POST /tournament-members/:tournamentId lists or adds tournament staff (owner only).
- PUT/DELETE /tournament-members/:tournamentId/:userId updates or removes tournament staff (owner only).
- PUT /tournament-ownership/:tournamentId transfers ownership with `{ user_id }`.
- GET /users and PUT /users/:id list and manage organizer accounts (super admin only).

Editing scores & consistency
- The API allows editing completed matches. When an edited match had previously advanced a winner, downstream slots/results are cleared (recursively) so the bracket remains consistent. Re-enter downstream scores as needed.

Styling & theming
- Global SCSS variables live in `frontend/src/assets/styles/global.scss` for quick theme tweaks (colors, radius, fonts).

Session handling
- Frontend uses JWT stored in localStorage. On 401 responses the app clears session and redirects to the login page with a toast explaining session expiry.

Contributing
- Fork and open PRs. Follow existing conventions: keep styles scoped, use CSS variables, and add unit or integration tests where appropriate.

Notes
- Ensure PHP has `pdo_mysql` enabled. Use HTTPS and a strong `JWT_SECRET` in production.

License
- MIT License — see the included LICENSE file in the repository.

Contact
- Open issues for bugs or feature requests.
