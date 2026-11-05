-- Stripe billing for the organizer-pays-the-platform monetization chain
-- (FEATURE_TRACKER.md items 12 and 13). This is purely the *billing* half: the
-- enforcement half — users.plan, tournaments.paid_override, effectiveParticipantCap()
-- and formatRequiresPaidPlan() — shipped in migration 013 and is already live, driven by
-- super-admin flags set by hand. What follows lets Stripe flip those same two flags
-- instead, without changing a line of the gating logic that reads them.
--
-- Single merchant, hosted Stripe Checkout: the organizer pays us directly. No Connect, no
-- payouts to third parties, no card data anywhere near this database (items 10/11's
-- registration-fee marketplace is a separate, much larger build and is NOT this).
--
-- Two independent levers, matching how 013 already models them:
--   * a recurring subscription on the organizer account  -> users.plan            (item 12)
--   * a one-time purchase against a single tournament    -> tournaments.paid_override (item 13)

-- --------------------------------------------------------------------------------------
-- Account-level subscription state
-- --------------------------------------------------------------------------------------

-- plan_source is the reason this migration is not just two id columns. A super admin can
-- grant `plan = 'paid'` by hand (comped account, testing, an organizer we owe a favour),
-- and Stripe must never revoke a grant it did not make: a cancelled subscription webhook
-- downgrades only rows whose plan_source is 'stripe'. Every existing row is 'manual',
-- which is exactly right — every paid account today was set by hand.
--
-- Stripe identifier columns are VARCHAR(191) rather than 255: they are indexed, and 191
-- is the widest utf8mb4 column that fits an index key under every InnoDB configuration
-- including the old 767-byte limit. Stripe's longest id here is a Checkout Session at
-- roughly 66 characters, so this is not close to binding.
ALTER TABLE users
  ADD COLUMN plan_source ENUM('manual', 'stripe') NOT NULL DEFAULT 'manual' AFTER plan,
  ADD COLUMN stripe_customer_id VARCHAR(191) NULL AFTER plan_source,
  ADD COLUMN stripe_subscription_id VARCHAR(191) NULL AFTER stripe_customer_id,
  -- Display only — "renews on", "access until". NOT an enforcement lever: Stripe holds a
  -- cancelled-at-period-end subscription in status 'active' until the period actually
  -- ends and then sends customer.subscription.deleted, so the webhook is the source of
  -- truth for access and no cron job is needed to expire anyone.
  ADD COLUMN plan_expires_at DATETIME NULL AFTER stripe_subscription_id,
  -- Nullable UNIQUE: MySQL permits any number of NULLs, so unpurchased accounts are fine,
  -- while a Stripe customer can never end up mapped to two of our users.
  ADD UNIQUE INDEX idx_users_stripe_customer (stripe_customer_id);

-- --------------------------------------------------------------------------------------
-- Tournament-level one-time unlock
-- --------------------------------------------------------------------------------------

-- Same manual/stripe distinction, same reason: a refund must not clear an override a
-- super admin granted by hand, and TournamentController::update()'s existing rule that
-- only a genuine super_admin may set paid_override stays untouched.
ALTER TABLE tournaments
  ADD COLUMN paid_override_source ENUM('manual', 'stripe') NOT NULL DEFAULT 'manual' AFTER paid_override;

-- --------------------------------------------------------------------------------------
-- Checkout sessions we started
-- --------------------------------------------------------------------------------------

-- One row per Checkout Session, written *before* redirecting the organizer to Stripe.
-- This is what makes fulfilment safe: when the webhook arrives, we look the purchase up by
-- session id in our own table to learn who bought what, rather than trusting the user and
-- tournament ids echoed back in the event's metadata.
--
-- It doubles as the reconciliation trail — every abandoned, expired and refunded attempt
-- stays visible next to the successful ones, which is what you want the first time a
-- payment lands and the plan does not.
CREATE TABLE billing_checkouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stripe_session_id VARCHAR(191) NOT NULL UNIQUE,
  kind ENUM('tournament_unlock', 'subscription') NOT NULL,
  user_id INT NOT NULL,
  -- NULL for a subscription, which is bought against the account rather than one event.
  tournament_id INT NULL,
  -- Populated from the webhook once Stripe assigns them. The payment intent is the join
  -- key a later refund or chargeback arrives on — a dispute names the charge's payment
  -- intent and nothing else we would recognise.
  stripe_payment_intent_id VARCHAR(191) NULL,
  stripe_subscription_id VARCHAR(191) NULL,
  -- Minor units (cents), exactly as Stripe reports them. Recorded for the audit trail, not
  -- read back for any decision — the price of record lives in Stripe, so changing a price
  -- in the dashboard never disagrees with a historical row here.
  amount_total INT NULL,
  currency VARCHAR(10) NULL,
  status ENUM('open', 'paid', 'expired', 'failed', 'reversed') NOT NULL DEFAULT 'open',
  fulfilled_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_billing_checkouts_user (user_id),
  INDEX idx_billing_checkouts_tournament (tournament_id),
  INDEX idx_billing_checkouts_payment_intent (stripe_payment_intent_id),
  CONSTRAINT fk_billing_checkouts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  -- SET NULL rather than CASCADE: if a tournament is hard-deleted we still want the
  -- payment record, because the money was real even when the event it bought is gone.
  CONSTRAINT fk_billing_checkouts_tournament
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
);

-- --------------------------------------------------------------------------------------
-- Webhook idempotency
-- --------------------------------------------------------------------------------------

-- Stripe guarantees at-least-once delivery, retries for up to three days, and can deliver
-- the same event more than once even without a failure. Every handler here is written to
-- be idempotent anyway, but claiming the event id first makes that structural rather than
-- a property each branch has to preserve.
--
-- The primary key is Stripe's event id, so the claim is a plain INSERT: a duplicate
-- delivery collides and is answered 200 without being processed twice. A row left in
-- 'error' is deliberately reprocessable, so a handler that failed on a transient fault
-- still succeeds when Stripe retries it — see BillingController::claimEvent().
CREATE TABLE billing_events (
  stripe_event_id VARCHAR(191) PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  status ENUM('received', 'processed', 'ignored', 'error') NOT NULL DEFAULT 'received',
  -- Why it was ignored, or what went wrong. Read by a human staring at a payment that did
  -- not grant anything; never shown to the caller.
  detail VARCHAR(500) NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  INDEX idx_billing_events_received (received_at)
);
