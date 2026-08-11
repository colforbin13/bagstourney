# AGENTS.md

## Project overview

Bracketway is a mobile-first single-elimination tournament manager.

- `api/` contains the PHP JSON API and front controller.
- `frontend/` contains the Angular application.
- `db/schema.sql` initializes the legacy database schema.
- `db/migrations/` contains numbered, forward-only application migrations.
- `dist/` is generated Angular output and should not be edited by hand or committed.
- `deploy.ps1` and `deploy.sh` contain deployment helpers.

## Runtime compatibility

The production server runs PHP 7.x. Keep backend code compatible with PHP 7 syntax.
In particular, do not use PHP 8-only features such as constructor property promotion,
union/intersection types, attributes, named arguments, or `match` expressions. Use a
normal property declaration and constructor assignment instead:

```php
private $db;

public function __construct(PDO $db) {
    $this->db = $db;
}
```

The API requires the `pdo_mysql` extension. The database is MySQL 5.7+ with `utf8mb4`.
Angular development/build tooling requires Node 20+ and uses Angular 21, TypeScript 5.9,
and RxJS 7.8.

## Backend conventions

- `api/index.php` is the only API router. Add endpoint dispatch there and keep controllers
  focused on one resource or concern.
- Controllers receive a `PDO` connection and use prepared statements for values. Do not
  interpolate request data into SQL.
- JSON responses are emitted by controllers; return appropriate HTTP status codes for
  validation failures, authentication failures, conflicts, and missing records.
- Authentication uses JWTs from `api/middleware/auth.php`. Passwords must be stored with
  `password_hash()` and checked with `password_verify()`; never log credentials or hashes.
- Use `requireCurrentUser()`, `requireSuperAdmin()`, and `requireTournamentRole()` for
  authorization. Do not rely on frontend role checks as security controls.
- Tournament mutations should record sensitive actions with `writeAuditLog()` where the
  surrounding feature already does so.
- Preserve the existing `/bags/api` deployment prefix handling in `api/index.php`.
- Configuration and secrets belong in environment variables or local untracked config;
  never commit production database credentials or JWT secrets.

## Database and migrations

- Use `db/schema.sql` only for a new database. Use `php db/migrate.php` for changes to an
  existing installation.
- Name migrations with a zero-padded sequence and descriptive suffix, for example
  `003_add_notifications.sql`.
- Migrations are applied once according to `schema_migrations`; they are forward-only.
  Make them safe to run in the expected deployed state and preserve existing user data.
- Back up production before applying migrations. Deploy the migration file before running
  the migration command.
- Existing legacy `admins` accounts are migrated into `users`; do not remove compatibility
  behavior without a deliberate account-migration plan.

## Frontend conventions

- Use standalone Angular components and lazy-loaded routes in `frontend/src/app/app.routes.ts`.
- Put API calls in shared services, not directly in components. Keep domain interfaces in
  `frontend/src/app/shared/models/`.
- Prefer Angular signals for local component state and the existing `@if`/`@for` template
  control-flow syntax.
- Use `AuthService` and the existing auth interceptor for sessions. Tokens are stored in
  `localStorage`; do not add alternate token storage without documenting the security impact.
- Keep component styles scoped. Shared colors, spacing, typography, and radii belong in
  `frontend/src/assets/styles/global.scss` and should use the existing CSS variables.
- Production is deployed below `/bags/`; keep `baseHref` and the production API URL as
  configured in `angular.json` and `environment.prod.ts`.

## Unit testing requirements

All new frontend components, services, and guards **must include unit tests**. Use Karma/Jasmine:

- **Test file location:** Place `.spec.ts` files in the same directory as the component/service
- **Test structure:** Use `describe()` blocks for the class, `it()` blocks for individual scenarios
- **Mocking:** Use `HttpClientTestingModule` for services that call APIs; use `TestBed` for dependency injection
- **Coverage expectations:** Aim for at least 60% statement coverage; 50% is the minimum acceptable

### Writing tests

Create test files following this pattern:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MyService } from './my.service';

describe('MyService', () => {
  let service: MyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [MyService]
    });
    service = TestBed.inject(MyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify(); // ensure no outstanding HTTP requests
  });

  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

### Running tests

```powershell
npm.cmd run test --prefix frontend           # Interactive mode (Chrome, auto-reload) - local development only
npm.cmd run test:ci --prefix frontend        # CI mode (headless, code coverage) - use for automated checks and agents
```

**Important:** When running test verification from agents or automated tasks, always use `test:ci` to run headless. Do not use the interactive `test` command from agents as it will attempt to launch a browser.

Code coverage reports are generated in `frontend/coverage/` (in `.gitignore`). Review the HTML report at
`frontend/coverage/bracketway/index.html` to identify uncovered code paths.

## Verification

Before handing off backend changes, run PHP syntax checks on changed files, for example:

```powershell
php -l api\controllers\AuthController.php
php -l api\index.php
```

For frontend changes, **always include unit tests for new code**. Then run:

```powershell
npm.cmd ci --prefix frontend
npm.cmd run test:ci --prefix frontend        # Verify tests pass and check coverage
npm.cmd run build:prod --prefix frontend     # Verify production build succeeds
```

Also run `git diff --check`. A local PHP CLI without `pdo_mysql` cannot exercise database
queries; note that limitation rather than weakening the production database checks.

## Change and deployment hygiene

- Preserve unrelated working-tree changes.
- Do not use destructive Git commands such as `reset --hard` or broad recursive deletes.
- Do not edit generated `dist/` files directly; rebuild and deploy the generated output.
- When a change includes a migration, clearly call out the required deployment order:
  deploy API/files, run `php db/migrate.php`, then deploy or refresh the frontend as needed.
