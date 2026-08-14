-- Adds email verification for public organizer self-registration
-- (FEATURE_TRACKER.md item 9). AuthController::register() now creates the account with
-- status = 'disabled' (the existing enum value already used for admin-deactivated
-- accounts — login already rejects any non-'active' user, so this alone blocks access
-- until verified) plus a hashed, expiring verification token, instead of an immediately
-- active account. AuthController::verifyEmail() consumes the token and flips status to
-- 'active'. Same hashed-token convention as password_reset_tokens
-- (005_hash_password_reset_tokens.sql): only SHA-256 of the token is stored, never the
-- plaintext value.

ALTER TABLE users
  ADD COLUMN email_verify_token_hash CHAR(64) NULL AFTER status,
  ADD COLUMN email_verify_token_expires_at DATETIME NULL AFTER email_verify_token_hash,
  ADD INDEX idx_users_email_verify_token_hash (email_verify_token_hash);
