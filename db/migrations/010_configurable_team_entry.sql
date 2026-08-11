-- Lets organizers create teams by typing both member names directly, instead of always
-- adding individual participants and letting the app randomly pair them. Defaults to
-- 'auto_draft' so existing tournaments and the create-tournament flow are unaffected
-- unless changed. Independent of seeding_mode (006/009) by design -- team-entry and
-- seeding are two separate axes.

ALTER TABLE tournaments
  ADD COLUMN team_entry_mode ENUM('auto_draft', 'direct') NOT NULL DEFAULT 'auto_draft' AFTER seeding_mode;
