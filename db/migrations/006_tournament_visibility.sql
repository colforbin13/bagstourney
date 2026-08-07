-- Adds a stable, non-guessable public identifier (uuid) and a visibility setting to
-- tournaments, so organizers can keep a tournament unlisted from the public home screen
-- while still allowing anyone with the direct (uuid) link to view it. Existing rows get
-- a backfilled UUID via MySQL's UUID() so the column can be made NOT NULL + unique.

ALTER TABLE tournaments
  ADD COLUMN uuid CHAR(36) NULL AFTER id,
  ADD COLUMN visibility ENUM('public', 'private') NOT NULL DEFAULT 'public' AFTER status;

UPDATE tournaments SET uuid = UUID() WHERE uuid IS NULL;

ALTER TABLE tournaments
  MODIFY COLUMN uuid CHAR(36) NOT NULL,
  ADD UNIQUE INDEX idx_tournaments_uuid (uuid);
