-- Lets organizers choose manual seeding (drag-and-drop reorder before bracket generation)
-- instead of always seeding teams in random draw order. Defaults to 'automatic' so
-- existing tournaments and the create-tournament flow are unaffected unless changed.

ALTER TABLE tournaments
  ADD COLUMN seeding_mode ENUM('automatic', 'manual') NOT NULL DEFAULT 'automatic' AFTER visibility;
