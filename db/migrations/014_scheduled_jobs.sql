-- Minimal scheduled-job tracking so a daily organizer digest (pending self-registration
-- approvals) can piggyback on the existing 3-minute notification cron
-- (/etc/cron.d/bags-notifications running api/scripts/send_notifications.php) instead of
-- adding a second crontab entry — crontab setup has bitten us before (missing username
-- field, missing trailing newline silently disabling the whole file; see
-- db/migrations/007_notification_queue.sql's era of notes).
--
-- One row per named job; job_name is the primary key since each job is a singleton.
-- Deliberately NOT a generic pluggable "worker type" registry — there is exactly one
-- scheduled job today. If a second one is ever needed, that's the point to generalize
-- the dispatch logic in send_notifications.php, not before.

CREATE TABLE scheduled_jobs (
  job_name VARCHAR(100) PRIMARY KEY,
  last_run_at DATETIME NULL,
  next_run_at DATETIME NOT NULL,
  interval_hours INT NOT NULL DEFAULT 24
);

-- next_run_at starts at NOW() so the digest fires on the very next cron tick after
-- deploy (useful to confirm it actually works), then settles into its 24h cadence.
INSERT INTO scheduled_jobs (job_name, next_run_at, interval_hours)
VALUES ('organizer_pending_digest', NOW(), 24);
