-- Balanced (A/B) blind draw. The organizer tags their stronger players A, and the draw pairs
-- every A with a random B, so a lopsided field can't produce one stacked team and one hopeless
-- one. Pairing lives in api/lib/BlindDraw.php.
--
-- Both default to today's behavior: a plain random draw, and every player in group B, so
-- existing tournaments and newly added players draw exactly as before. Free on every plan.

ALTER TABLE tournaments
  ADD COLUMN draw_mode ENUM('random', 'balanced') NOT NULL DEFAULT 'random' AFTER team_entry_mode;

ALTER TABLE participants
  ADD COLUMN draw_group ENUM('A', 'B') NOT NULL DEFAULT 'B' AFTER registration_status;
