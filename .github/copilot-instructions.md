# Copilot instructions for Bag Bracket repository

Purpose
- Short, focused guide for future Copilot/assistant sessions to find build/test commands, high-level architecture, and repo-specific conventions.

Build, run, test, and lint commands

Frontend (Angular)
- Install: cd frontend && npm ci
- Dev server: npm start  # runs `ng serve` (default port 4200)
- Build (dev): npm run build  # output under frontend/dist/
- Build (prod): npm run build:prod  # outputs to dist/browser/
- Tests/lint: No test or lint scripts are provided in package.json. Add `ng test` or linters if introducing tests.

Backend (PHP + MySQL)
- DB schema: mysql -u root -p < db/schema.sql
- Config: copy api/config/database.php.example → api/config/database.php or set environment variables (BB_DB_HOST, BB_DB_NAME, BB_DB_USER, BB_DB_PASS, BB_JWT_SECRET)
- Run API (dev): php -S localhost:8080 -t api
- Production: serve `api/` from Apache or equivalent; README shows recommended Apache setup and examples.

Deployment
- Frontend production build writes to dist/browser/ (deployed asset location)
- Provided helpers: deploy.ps1 (Windows) and deploy.sh (Unix). Check these scripts for env overrides (DEPLOY_PATH, DEPLOY_API_PATH).

High-level architecture (big picture)
- frontend/ (Angular SPA) communicates with api/ (PHP) over REST JSON.
- api/ is a small front-controller router (api/index.php) that maps resource paths to controllers in api/controllers/*.  It strips an optional /bags/api prefix so the app can be deployed under /bags/api or /api.
- Authentication: JWT-based, implemented in api/middleware/auth.php. Tokens are HS256-like HMAC signatures and expiry is controlled by JWT_EXPIRY/JWT_SECRET.
- Data store: MySQL, schema in db/schema.sql. api/config/database.php (or env variables) configures PDO connection.

Key repository conventions and patterns
- Routing & controllers
  - Single entrypoint: api/index.php. Routes are resource-first (e.g., /tournaments, /participants, /matches).
  - Controller classes live in api/controllers/ and expose methods called by the router (e.g., TournamentController::create).
  - Mutating endpoints call requireAuth() from api/middleware/auth.php; expect `Authorization: Bearer <token>` header.
- Auth & JWT
  - JWT creation/verification is in api/middleware/auth.php. Use BB_JWT_SECRET (or JWT_SECRET defined in api config) and respect JWT_EXPIRY.
  - Frontend stores JWT in localStorage and clears session on 401 (see frontend auth.service / interceptor).
- Database access
  - Use PDO prepared statements (fetch mode: FETCH_ASSOC). See api/config/database.php.example for getDB() helper.
- Frontend env & base path
  - API base URL may be set in frontend/src/environments/environment.ts; update before building for production if API path differs.
- Build artifacts
  - Production frontend build target: dist/browser/ (matches README). Deploy that directory to web server root or appropriate static asset host.

Files to open first when onboarding a Copilot session
- README.md — project overview and quickstart
- frontend/package.json and frontend/src/environments/* — frontend commands and API base path
- api/index.php — routing/endpoint mapping (central to backend behavior)
- api/middleware/auth.php — JWT format and requireAuth behavior
- db/schema.sql — data model and table layout
- api/config/database.php.example — DB env vars and PDO config

AI config files
- No specialized AI assistant config files (CLAUDE.md, AGENTS.md, .cursorrules, etc.) were found. If added later, surface any important rules here.

Notes for Copilot sessions (how to reason about changes)
- Small PHP fixes: prefer editing controller methods and preserving existing PDO usage. Avoid changing the routing shape unless needed across controllers.
- When changing API surface, update frontend environment and any hard-coded paths in frontend components (search for "/api" or "/bags/api").
- No automated tests present—exercise caution and manually smoke-test API + frontend after changes.

If you edit or add tests/linting, update this file with commands for running a single test and the test runner configuration.

---

MCP servers (end-to-end / browser testing)

- Recommended: Playwright for cross-browser E2E testing (works well with Angular). Suggested quick setup steps:
  1. cd frontend
  2. npm install -D @playwright/test
  3. npx playwright install            # downloads browsers
  4. Add a script to frontend/package.json: "test:e2e": "playwright test"
  5. Optional: add playwright.config.ts with `use: { baseURL: process.env.BASE_URL || 'http://localhost:4200' }` so tests run against local dev server or CI-deployed preview.
  6. Running a single test file: npx playwright test tests/example.spec.ts
  7. Running a single test by name: npx playwright test -g "test name"

- Notes:
  - Ensure the frontend dev server or a preview build is available (npm start or serve dist/browser) before running Playwright tests.
  - If CI is added, run `npx playwright install --with-deps` on runners that require system dependencies.

(End of instructions)
