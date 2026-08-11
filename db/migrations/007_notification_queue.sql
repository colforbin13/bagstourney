-- Participant email opt-in (double opt-in via a hashed, expiring confirm token — same
-- convention as password_reset_tokens: bin2hex(random_bytes(32)) generated in PHP, only
-- the SHA-256 hash stored here), three independently toggleable notification categories,
-- a send queue, and a global bounce/complaint suppression list, for the score-notification
-- email feature (FEATURE_TRACKER item 1).
--
-- notification_lifecycle and the three notify_* booleans are intentionally orthogonal
-- columns, not one combined status, so "never opted in" (none), "opted in but every
-- category off" (confirmed + 0/0/0), and "hard-suppressed via bounce/complaint"
-- (suppressed) are all distinguishable.
--
-- There is no stored "management token" value anywhere. It's a deterministic HMAC of
-- (participant id, notification_manage_token_version, a server secret) recomputed on
-- demand by both the worker (building links) and the public endpoints (validating a
-- submitted token) — see api/middleware/auth.php::notificationManageToken(). This departs
-- from the password-reset convention (hash of a random value) because this token must be
-- reconstructed by a detached CLI worker for as long as the participant stays confirmed,
-- not consumed once immediately after issuance. Bumping the version column invalidates
-- every previously issued link for that participant (used when their email changes).
--
-- Fan-out (which participants get queued for a given event) is decided entirely in
-- application code (MatchController::updateScore(), ParticipantController) — every
-- notification_queue row is already resolved to one participant/email/event at INSERT
-- time.

ALTER TABLE participants
  ADD COLUMN email VARCHAR(255) NULL AFTER name,
  ADD COLUMN notification_lifecycle ENUM('none', 'pending', 'confirmed', 'suppressed')
    NOT NULL DEFAULT 'none' AFTER email,
  ADD COLUMN notify_match_completed TINYINT(1) NOT NULL DEFAULT 1 AFTER notification_lifecycle,
  ADD COLUMN notify_round_completed TINYINT(1) NOT NULL DEFAULT 1 AFTER notify_match_completed,
  ADD COLUMN notify_tournament_finalized TINYINT(1) NOT NULL DEFAULT 1 AFTER notify_round_completed,
  ADD COLUMN notification_confirm_token_hash CHAR(64) NULL AFTER notify_tournament_finalized,
  ADD COLUMN notification_confirm_token_expires_at DATETIME NULL AFTER notification_confirm_token_hash,
  ADD COLUMN notification_confirmed_at DATETIME NULL AFTER notification_confirm_token_expires_at,
  ADD COLUMN notification_manage_token_version INT NOT NULL DEFAULT 1 AFTER notification_confirmed_at,
  ADD INDEX idx_participants_notification_confirm_token_hash (notification_confirm_token_hash);

-- Global, email-address-keyed suppression list mirroring Postmark's own suppression at the
-- app level, so a hard bounce or spam complaint on one participant row blocks that address
-- everywhere (e.g. the same person entered in a later tournament). Deliberately does NOT
-- include an 'unsubscribe' reason: turning off some or all of a participant's three
-- categories is a per-participant preference (the notify_* columns), not a global
-- suppression — someone who opted out of one tournament's emails should not be silently
-- blocked from ever opting in to a different one.
CREATE TABLE notification_suppressions (
  email VARCHAR(255) NOT NULL PRIMARY KEY,
  reason ENUM('bounce', 'spam_complaint') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notification_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NOT NULL,
  match_id INT NULL,
  round INT NULL,
  participant_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  event_type ENUM('confirmation', 'match_completed', 'round_completed', 'tournament_finalized') NOT NULL,
  -- Only ever populated for event_type = 'confirmation'; the worker nulls this out right
  -- after its terminal attempt (success or final failure). Never select this column into
  -- any admin-facing response.
  token_plaintext VARCHAR(64) NULL,
  status ENUM('pending', 'sent', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error VARCHAR(500) NULL,
  postmark_message_id VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  INDEX idx_notification_queue_status (status)
);
