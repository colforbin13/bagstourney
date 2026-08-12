-- Deleting a tournament now soft-deletes it (sets deleted_at) instead of cascading a
-- hard DELETE through matches/teams/participants, so a super admin can recover it.
-- Children are left untouched — they're never queried outside a tournament_id context,
-- so once the tournament itself is filtered out of every read path, they're already
-- unreachable through it. NULL means "not deleted"; existing tournaments are unaffected.

ALTER TABLE tournaments
  ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER visibility;
