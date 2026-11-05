-- What a tournament calls its playing spots (FEATURE_TRACKER.md item 8): board for bags,
-- court for pickleball, lane, table, pit or field for other games. Only the word changes;
-- assignment works the same. Defaulted, so existing tournaments keep saying "Board".
-- Allowed values live in BoardController::LABELS.

ALTER TABLE tournaments
  ADD COLUMN board_label VARCHAR(16) NOT NULL DEFAULT 'board' AFTER boards;
