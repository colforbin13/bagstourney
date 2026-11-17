-- Odd player handling (FEATURE_TRACKER item 19). A blind draw with an odd number of players
-- gives the odd one out a "ghost" partner: a team whose second player slot is empty
-- (teams.participant2_id NULL), shown as "Sam (solo)". There is deliberately no ghost row in
-- participants, so nothing that counts, lists or emails players can mistake it for a person.
-- The organizer can later swap a latecomer into the empty slot. Logic in api/lib/SoloTeam.php.
--
-- ghost_rule is how a solo team plays, shown to players on the bracket, score entry and TV:
--   walk       the solo player throws both turns, walking between ends (free, the default)
--   four_bags  the solo player throws only their own four bags each inning (Pro)
--   sub        the organizer picks a player to throw the empty turn each game (Pro)
--   custom     ghost_rule_text, the organizer's own one-line house rule (Pro)
-- The app only records final scores, so a rule changes what players are told, not scoring.
--
-- Both default to today's behavior for every existing tournament: no team is solo, and the
-- rule is the free one.

ALTER TABLE teams
  MODIFY COLUMN participant2_id INT NULL;

ALTER TABLE tournaments
  ADD COLUMN ghost_rule ENUM('walk', 'four_bags', 'sub', 'custom') NOT NULL DEFAULT 'walk' AFTER draw_mode,
  ADD COLUMN ghost_rule_text VARCHAR(120) NULL AFTER ghost_rule;
