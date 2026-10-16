-- Board assignments (FEATURE_TRACKER.md item 8).
--
-- The organizer says how many boards the venue has, and each playable game is put on the
-- next free board automatically (api/lib/BoardQueue.php). Additive and defaulted: 0 boards
-- means the feature is off, which is every existing tournament.

ALTER TABLE tournaments
  ADD COLUMN boards TINYINT NOT NULL DEFAULT 0 AFTER pool_games;

-- The board a game is on right now. Set only while the game is being played and cleared
-- the moment it has a result, so "which boards are busy" is a plain IS NOT NULL.
ALTER TABLE matches
  ADD COLUMN board_number TINYINT DEFAULT NULL AFTER status;

ALTER TABLE pool_matches
  ADD COLUMN board_number TINYINT DEFAULT NULL AFTER status;
