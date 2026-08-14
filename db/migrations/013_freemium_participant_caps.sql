-- Adds account-level and tournament-level tiering for the freemium participant cap
-- (FEATURE_TRACKER.md item 12/13 plumbing, built ahead of real billing). No payment
-- integration exists yet, so both flags are set manually by a super admin for now,
-- standing in for what Stripe will flip automatically once payment integration
-- (item 10/12) ships — the gating logic itself (effectiveParticipantCap() in
-- api/middleware/auth.php) doesn't change either way.
--
-- users.plan is the account-level lever (item 12: an organizer subscription raises the
-- cap on every tournament they own). tournaments.paid_override is the per-tournament
-- lever (item 13: a one-time per-tournament unlock) and works independently of the
-- owner's plan, so a free-plan organizer can still unlock a single big event.

ALTER TABLE users
  ADD COLUMN plan ENUM('free', 'paid') NOT NULL DEFAULT 'free' AFTER role;

ALTER TABLE tournaments
  ADD COLUMN paid_override TINYINT(1) NOT NULL DEFAULT 0 AFTER status;
