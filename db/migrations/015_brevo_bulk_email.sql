-- Moves bulk notification email (api/scripts/send_notifications.php) from Postmark to
-- Brevo's free tier. Auth mail (AuthController::register) deliberately stays on Postmark,
-- so a bulk-send quota exhaustion can never block account registration.
--
-- Two changes to notification_queue:
--
-- 1. next_attempt_at — Brevo's free tier caps sending at 300 emails/day and answers HTTP
--    429 once that is exhausted. Without a way to park a row, the worker would spend all
--    MAX_ATTEMPTS (5) retries within ~15 minutes of a 3-minute cron and mark the email
--    permanently failed, hours before the quota actually resets. Rows with a future
--    next_attempt_at are passed over by the worker's SELECT without consuming an attempt.
--
-- 2. postmark_message_id -> provider_message_id, plus a provider column, since this column
--    now holds Brevo ids for everything the worker sends. Widened to 255 because Brevo
--    returns a full angle-bracketed message-id rather than a short uuid like Postmark.
--    Existing rows keep their values; they predate the switch and are all Postmark ids,
--    which is what the backfill below records.

ALTER TABLE notification_queue
  ADD COLUMN next_attempt_at TIMESTAMP NULL DEFAULT NULL AFTER attempts,
  ADD COLUMN provider VARCHAR(20) NULL AFTER next_attempt_at,
  CHANGE COLUMN postmark_message_id provider_message_id VARCHAR(255) NULL;

UPDATE notification_queue
  SET provider = 'postmark'
  WHERE provider_message_id IS NOT NULL;

-- Brevo reports two permanently-undeliverable outcomes that Postmark folded into its
-- bounce webhook: 'invalid' (address is malformed or does not exist) and 'blocked' (on
-- Brevo's own blocklist). Both should suppress locally, but the existing enum has no
-- value for them and would reject the insert under strict mode. Widening rather than
-- remapping them onto 'bounce' keeps the reason column useful for diagnosing why an
-- address stopped receiving mail. Existing rows are unaffected.
ALTER TABLE notification_suppressions
  MODIFY COLUMN reason ENUM('bounce', 'spam_complaint', 'invalid_address', 'blocked') NOT NULL;
