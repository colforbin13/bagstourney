-- Migration 005: Correct password_reset_tokens to store a hash instead of the
-- plaintext token, and add used_at so a token cannot be replayed after use.
--
-- Migration 004 was already applied to production before this fix landed, so
-- this migration alters the existing table in place rather than editing 004
-- (which is forward-only and already recorded in schema_migrations).
-- Any outstanding token is preserved by hashing its current plaintext value
-- before the plaintext column is dropped.

ALTER TABLE password_reset_tokens
  ADD COLUMN token_hash VARCHAR(64) NULL AFTER user_id,
  ADD COLUMN used_at DATETIME NULL AFTER expires_at;

UPDATE password_reset_tokens
SET token_hash = SHA2(token, 256)
WHERE token_hash IS NULL;

ALTER TABLE password_reset_tokens
  MODIFY COLUMN token_hash VARCHAR(64) NOT NULL,
  ADD UNIQUE INDEX idx_token_hash (token_hash),
  DROP COLUMN token;
