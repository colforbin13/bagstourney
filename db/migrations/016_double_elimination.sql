-- Schema for double-elimination brackets (FEATURE_TRACKER.md item 16).
--
-- Additive and defaulted so every existing row keeps today's behaviour exactly: existing
-- tournaments are 'single', existing matches are 'winners' with no loser edge. Applying
-- this migration on its own changes nothing observable — the API has no way to set
-- tournaments.format yet, by design. Exposing the choice waits until the two-edge score
-- cascade and the paid-tier gating are in place; a tournament created as 'double' before
-- then would generate a correct bracket that score entry could not advance.
--
-- Column shapes here follow what BracketBuilder::doubleElimination() actually produces,
-- rather than being guessed ahead of the engine.

ALTER TABLE tournaments
  ADD COLUMN format ENUM('single', 'double') NOT NULL DEFAULT 'single' AFTER status;

-- The crux of double elimination: matches need a *second* forward edge. next_match_id has
-- always meant "where the winner advances to"; loser_match_id is "where the loser drops
-- to", null in single elimination and for matches whose loser is eliminated outright.
--
-- The grand final uses both edges to feed the reset match — winner into slot 1, loser into
-- slot 2 — so the reset needs no special-case plumbing of its own.
ALTER TABLE matches
  ADD COLUMN loser_match_id INT DEFAULT NULL AFTER next_match_slot,
  ADD COLUMN loser_match_slot TINYINT DEFAULT NULL AFTER loser_match_id;

-- Mirrors the existing self-referencing FK on next_match_id. Both depend on the same quiet
-- invariant: BracketBuilder emits matches in an order where every edge points strictly
-- forward, and generateBracket() inserts them in that order, so a match's id is always
-- lower than the ids of whatever it feeds. That is what lets the bulk
-- "DELETE FROM matches WHERE tournament_id = ?" in TeamController::draw() (a redraw)
-- succeed — InnoDB deletes in ascending primary-key order, so a referencing row is always
-- gone before the row it references. tests/BracketDoubleEliminationTest.php asserts the
-- forward-pointing property directly.
ALTER TABLE matches
  ADD CONSTRAINT fk_matches_loser_match FOREIGN KEY (loser_match_id) REFERENCES matches(id);

-- round alone cannot order two trees: a winners round 2 and a losers round 2 would collide
-- into one group in MatchController::bracket(), which groups purely by round, and render as
-- the same column. bracket_side separates them.
--
-- is_reset marks the second grand final, played only when the losers-bracket side wins the
-- first one (at which point both teams have a single loss). It is always created and simply
-- goes unplayed otherwise, which keeps bracket generation a single static insert.
ALTER TABLE matches
  ADD COLUMN bracket_side ENUM('winners', 'losers', 'grand_final') NOT NULL DEFAULT 'winners' AFTER match_number,
  ADD COLUMN is_reset TINYINT(1) NOT NULL DEFAULT 0 AFTER bracket_side;
