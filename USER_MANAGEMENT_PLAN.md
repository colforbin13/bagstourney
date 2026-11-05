# User management and account administration plan

## Goal

Provide a complete, secure way to manage site accounts and tournament access after
the authorization foundation is in place.

The current system has the underlying account APIs and a super-admin create-user
form, but it does not yet provide a user list/editor, password reset workflows, or
a tournament staff-management interface.

## Current state

Implemented:

- `users` table with `super_admin` and `organizer` roles.
- Active/disabled account status.
- Public organizer registration at `/admin/register`.
- Super-admin `POST /users` account creation.
- Super-admin `GET /users` account listing API.
- Super-admin `PUT /users/:id` role/status update API.
- Tournament membership APIs for owner, manager, and scorekeeper roles.
- Audit logging for account and membership changes.

Missing or incomplete:

- Password recovery through email (deferred until Postmark integration; admin-initiated
  reset below covers the interim case).

Implemented since this was written — phases 1 through 4 are all done:

- Dashboard user list and edit controls (`UserManagementComponent`).
- Admin-initiated password reset, end to end: `POST /users/:id/password-reset` generates
  a one-time token (stored only as a SHA-256 hash, with `used_at` tracked to prevent
  reuse) and `POST /auth/reset-password` consumes it to set a new password. The admin
  shares the token with the account holder out of band; `ResetPasswordComponent` at
  `/reset-password` is the redemption UI, linked from the login page.
- Self-service password change (`POST /auth/change-password`, `ChangePasswordComponent`).
- Tournament member management UI (`TournamentManageComponent`'s Staff & Access panel) —
  see phase 3 below.
- Capability-aware frontend behavior (setup/staff/score controls hidden per-tournament
  role, not just per-login-status) — see phase 4 below.

The only remaining item from this plan is the deferred email-based password recovery,
which explicitly waits on the Postmark integration tracked separately in
`FEATURE_TRACKER.md`.

## Phase 1: super-admin user management UI

Add a user-management section or dedicated `/admin/users` route, visible only to
super admins.

Features:

- List username, email, global role, status, and created date.
- Change `organizer` versus `super_admin` role.
- Disable and reactivate accounts.
- Prevent disabling or demoting the last active super admin.
- Show success and validation/error messages.
- Refresh the list after mutations.
- Do not display password hashes or other sensitive fields.

Frontend work:

- Add `UserManagementComponent` or extend the existing admin dashboard.
- Add typed user-management methods to a shared service.
- Add a route guard/capability check for super-admin-only screens.
- Keep the existing standalone-component, signals, and scoped-style conventions.

Backend work:

- Reuse `GET /users` and `PUT /users/:id`.
- Verify that every mutation remains protected by `requireSuperAdmin()`.
- Return the updated public user representation only.

Acceptance criteria:

- A super admin can list, promote, demote, disable, and reactivate users.
- An organizer cannot access the screen or APIs.
- The final active super admin cannot be removed or disabled.

## Phase 2: password management — done except email-based recovery (deferred, see below)

### Admin-initiated reset

Add a super-admin endpoint such as `POST /users/:id/password-reset`.

- Generate a strong one-time reset token or a temporary password.
- Prefer a one-time, expiring reset token over displaying a generated password.
- Store only a hash of the reset token, with an expiration and used timestamp.
- Invalidate existing reset tokens when a new one is created.
- Audit who initiated the reset and for which account.
- Do not include the password or token in audit logs.

### Self-service password change

Add an authenticated endpoint such as `POST /auth/change-password`.

- Require the current password.
- Require a new password of at least 12 characters.
- Verify the current user from the database, not only JWT claims.
- Hash with `password_hash($password, PASSWORD_DEFAULT)`.
- Consider invalidating existing sessions after a successful change.
- Audit the password-change event without recording secrets.

### Password recovery

This is optional until transactional email is available, but should use the planned
Postmark integration rather than SMTP credentials embedded in the application.

- `POST /auth/forgot-password` accepts an email address.
- Always return a generic response whether the address exists.
- Email a short-lived, single-use reset link.
- `POST /auth/reset-password` consumes the token and sets a new password.
- Rate-limit requests and avoid account-enumeration messages.

Database migration likely needed:

```text
password_reset_tokens
- id
- user_id
- token_hash
- expires_at
- used_at
- created_at
```

Acceptance criteria:

- Passwords and reset tokens are never stored in plaintext.
- Expired or used reset links cannot be reused.
- Reset and change-password actions are auditable.
- Existing login behavior remains compatible with migrated legacy accounts.

## Phase 3: tournament staff-management UI — done except capability info/legacy-tournament confirmation

Add a staff/access panel to tournament management, visible to the tournament owner
and super admins.

Features (implemented in `TournamentManageComponent`):

- List current members and their tournament role.
- Add an existing site user as `manager` or `scorekeeper`.
- Change a member’s role.
- Remove a member.
- Transfer tournament ownership.
- Prevent removal or demotion of the current owner without an explicit ownership
  transfer operation.
- Show the distinction between global role and tournament-scoped role.

Backend endpoints:

- `GET /tournament-members/:tournamentId`
- `POST /tournament-members/:tournamentId`
- `PUT /tournament-members/:tournamentId/:userId`
- `DELETE /tournament-members/:tournamentId/:userId`
- `PUT /tournament-ownership/:tournamentId`
- `GET /users/search?q=` — new; any authenticated user (not just super admins) can look
  up an existing active account by username/email, since a tournament owner is not
  necessarily a super admin. Minimum 2-character query, capped at 10 results, LIKE
  wildcards in the query are escaped.

Backend improvements made before UI work:

- `upsertMember()`'s `InvalidArgumentException` (bad/inactive target user) is now caught
  in `addMember()`, `updateMember()`, and `transferOwnership()` and returned as 400
  instead of propagating to the router's generic 500 handler.
- `updateMember()` now blocks changing the current owner's role via a role-change PUT
  (previously only `removeMember()` blocked *removing* the owner — a role-change PUT
  could silently demote them without going through `transferOwnership()`). Must transfer
  ownership first, same as removal.
- `listMembers()` now also selects `u.role AS global_role` so the UI can show the
  distinction between site-wide role and tournament-scoped role.

Not done — deferred, not required for the UI to function:

- Explicit capability information for the current tournament (phase 4 territory).
- Confirming super-admin access is intentional for legacy tournaments without an owner
  (no code change was needed either way; worth a deliberate decision later).

Acceptance criteria:

- Owners can manage membership for tournaments they own.
- Super admins can manage any tournament.
- Managers and scorekeepers cannot grant themselves additional access.
- Scorekeeper access is sufficient for score entry but not tournament setup.
- Every membership and ownership mutation appears in the audit log.

## Phase 4: capability-aware frontend behavior — done

The backend remains the source of truth, but the frontend should avoid presenting
controls that the current user cannot use.

- Add a capability model to the authenticated user/tournament response. Done:
  `GET /tournaments/:id` now includes a `capabilities` object (`role`, `is_super_admin`,
  `can_manage_setup`, `can_manage_staff`, `can_score`, `can_delete`), computed by
  `tournamentCapabilities()` in `api/middleware/auth.php` from the caller's
  `tournament_members` row (or super-admin status). The endpoint stays usable by
  anonymous callers (the public bracket view) via `currentUserOrNull()` — a missing or
  invalid token yields an all-false/`null`-role capability object instead of an error.
- Hide setup controls from scorekeepers. Done: `TournamentManageComponent`'s add/edit/
  delete-participant, draw-teams, and edit-team-name controls are now gated on
  `capabilities.can_manage_setup` instead of being shown to any logged-in viewer of the
  page regardless of their actual role on that specific tournament.
- Hide staff-management controls from managers and scorekeepers. Done: the phase 3
  Staff & Access panel now decides whether to even request the member list based on
  `capabilities.can_manage_staff`, rather than firing the request and reacting to a 403.
- Score entry was also brought in line with this, even though it isn't spelled out
  above as its own bullet: `BracketViewComponent`'s score inputs/save/edit controls used
  to show for *any* logged-in user (`auth.isLoggedIn()`), not just someone with an actual
  role on that tournament. Switched to `capabilities.can_score`.
- Keep handling 401/403 responses gracefully in case permissions change in another
  session. Done: `TournamentManageComponent.load()` previously had no error handler at
  all on its `getTournament()` call (a 403/404 left the page silently spinning forever);
  it now shows an inline "not found or no access" state. `BracketViewComponent.load()`
  got the same treatment for its tournament fetch.
- Do not encode authorization decisions only in local storage or route guards.
  Capabilities are read fresh from each `GET /tournaments/:id` response and held only in
  component state — never written to `localStorage` or cached across navigations.

## Security and operational requirements

- Continue supporting the production PHP 7.x runtime; avoid PHP 8-only syntax such as
  constructor property promotion, union types, attributes, named arguments, and
  `match` expressions.
- Use prepared PDO statements for all request-derived values.
- Enforce authorization in API middleware/controller paths, not only Angular UI.
- Use generic password-recovery responses to prevent account enumeration.
- Rate-limit login, registration, and reset operations before exposing them publicly.
- Use HTTPS in production and keep `JWT_SECRET` and database credentials outside the
  repository.
- Back up production before adding password-token tables or other migrations.

## Suggested implementation order

1. Add frontend user list/edit screen using the existing APIs.
2. Add password-change endpoint and UI for the signed-in user.
3. Add admin-initiated reset endpoint and UI.
4. Add reset-token migration and Postmark delivery workflow.
5. Add tournament staff-management UI.
6. Add capability-aware control visibility and focused API tests.

## Verification checklist

- Run `php -l` on every changed PHP file.
- Run `npm.cmd run build:prod --prefix frontend`.
- Run `git diff --check`.
- Test organizer, super-admin, manager, scorekeeper, disabled, and unauthenticated
  scenarios.
- Test last-super-admin protection.
- Test expired, reused, and invalid password-reset tokens.
- Confirm migrations apply cleanly on a copy of the production schema.
