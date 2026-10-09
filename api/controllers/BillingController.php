<?php
// api/controllers/BillingController.php
//
// Stripe billing for the organizer-pays-the-platform tiers (FEATURE_TRACKER.md items
// 12/13). Single merchant, hosted Checkout — the organizer's card never touches this
// server. Participant registration fees (items 10/11) are a separate Connect build and
// nothing here anticipates them.
//
// This controller only ever writes two things that matter: users.plan and
// tournaments.paid_override. Every gate that reads them — effectiveParticipantCap(),
// tournamentHasPaidFeatures(), formatRequiresPaidPlan() — is untouched by this feature and
// keeps working identically whether a flag was set by Stripe or by a super admin's hand.
//
// Two rules run through the whole file:
//
//   1. A grant is resolved from OUR rows, never from the request. When a webhook says a
//      session was paid, we look that session up in billing_checkouts to learn whose plan
//      to raise. The signature already proves the event came from Stripe; sourcing the
//      target locally means metadata is corroboration rather than authority.
//
//   2. Stripe may only revoke what Stripe granted. plan_source / paid_override_source
//      record who made each grant, so a cancelled subscription or a refund cannot strip a
//      comped account a super admin set up by hand.

require_once __DIR__ . '/../lib/StripeSignature.php';
require_once __DIR__ . '/../lib/BillingIntent.php';
require_once __DIR__ . '/../services/StripeClient.php';

class BillingController {
    private StripeClient $stripe;

    public function __construct(private PDO $db) {
        $this->stripe = new StripeClient(STRIPE_SECRET_KEY, STRIPE_API_VERSION);
    }

    // ----------------------------------------------------------------------------------
    // Organizer-facing reads
    // ----------------------------------------------------------------------------------

    /**
     * GET /billing/status — everything the account's billing screen needs, in one call and
     * with no request to Stripe, so it is cheap enough to load on any screen that wants to
     * show whether the user is on a paid plan.
     */
    public function status(array $actor): void {
        $row = $this->userBillingRow((int)$actor['id']);

        echo json_encode([
            // "Can this install sell anything right now" — false when the keys are absent
            // or the kill switch is off. The frontend hides its upgrade buttons on this
            // rather than offering a checkout that would 503.
            'billing_enabled' => $this->billingEnabled(),
            'test_mode' => $this->stripe->isTestMode(),
            'plan' => $row['plan'] ?? 'free',
            // 'manual' means a super admin granted it; the UI says so instead of offering
            // to manage a subscription that does not exist.
            'plan_source' => $row['plan_source'] ?? 'manual',
            'plan_expires_at' => $row['plan_expires_at'] ?? null,
            'has_subscription' => !empty($row['stripe_subscription_id']),
            // The Stripe billing portal needs a customer; a user who has never checked out
            // does not have one yet.
            'can_manage_billing' => !empty($row['stripe_customer_id']),
            'offers' => [
                'tournament_unlock' => STRIPE_PRICE_TOURNAMENT_UNLOCK !== '',
                'subscription_monthly' => STRIPE_PRICE_SUBSCRIPTION_MONTHLY !== '',
                'subscription_annual' => STRIPE_PRICE_SUBSCRIPTION_ANNUAL !== '',
            ],
            'free_participant_cap' => FREEMIUM_FREE_TIER_MAX_PARTICIPANTS,
            'paid_participant_cap' => FREEMIUM_PAID_TIER_MAX_PARTICIPANTS,
        ]);
    }

    /**
     * GET /billing/plans — the price of each configured offer, read live from Stripe.
     *
     * Deliberately not cached in our config: an amount duplicated here is an amount that
     * can disagree with what the customer is actually charged. Stripe is the price of
     * record, so changing what you charge is a dashboard edit with no deploy. This is the
     * only endpoint that calls out to Stripe on a page load, and only the upgrade screen
     * calls it.
     */
    public function plans(array $actor): void {
        if (!$this->billingEnabled()) {
            http_response_code(503);
            echo json_encode(['error' => 'Billing is not available']);
            return;
        }

        $wanted = [
            'tournament_unlock' => STRIPE_PRICE_TOURNAMENT_UNLOCK,
            'subscription_monthly' => STRIPE_PRICE_SUBSCRIPTION_MONTHLY,
            'subscription_annual' => STRIPE_PRICE_SUBSCRIPTION_ANNUAL,
        ];

        $plans = [];
        foreach ($wanted as $key => $priceId) {
            if ($priceId === '') {
                continue;
            }
            $result = $this->stripe->retrievePrice($priceId);
            if (!$result['success']) {
                // One misconfigured price id must not blank the whole screen — the other
                // offers are still sellable, so log this one and carry on.
                error_log("BillingController::plans: could not load price for {$key}: " . $result['error']);
                continue;
            }
            $price = $result['data'];
            $plans[] = [
                'key' => $key,
                // Minor units, exactly as Stripe reports. Formatting is the frontend's job
                // — it already knows the viewer's locale and we do not.
                'unit_amount' => isset($price['unit_amount']) ? (int)$price['unit_amount'] : null,
                'currency' => $price['currency'] ?? null,
                'interval' => $price['recurring']['interval'] ?? null,
                'interval_count' => isset($price['recurring']['interval_count']) ? (int)$price['recurring']['interval_count'] : null,
            ];
        }

        echo json_encode(['plans' => $plans]);
    }

    // ----------------------------------------------------------------------------------
    // Starting a checkout
    // ----------------------------------------------------------------------------------

    /**
     * POST /billing/checkout/subscription — item 12. Raises the cap on every tournament
     * the organizer owns, for as long as the subscription runs.
     */
    public function startSubscriptionCheckout(array $body, array $actor): void {
        if (!$this->requireBillingAvailable()) {
            return;
        }

        $interval = $body['interval'] ?? 'monthly';
        $priceId = $interval === 'annual' ? STRIPE_PRICE_SUBSCRIPTION_ANNUAL : STRIPE_PRICE_SUBSCRIPTION_MONTHLY;
        if ($priceId === '') {
            http_response_code(400);
            echo json_encode(['error' => 'That subscription option is not available']);
            return;
        }

        $row = $this->userBillingRow((int)$actor['id']);
        if (!empty($row['stripe_subscription_id'])) {
            // Second subscription on one account would double-charge for an entitlement
            // that is already boolean. Send them to the portal to change or cancel instead.
            http_response_code(409);
            echo json_encode(['error' => 'This account already has an active subscription. Manage it from the billing portal.']);
            return;
        }

        $customerId = $this->ensureStripeCustomer($actor, $row);
        if ($customerId === null) {
            http_response_code(502);
            echo json_encode(['error' => 'Could not reach the payment provider. Please try again.']);
            return;
        }

        $params = [
            'mode' => 'subscription',
            'customer' => $customerId,
            'line_items' => [['price' => $priceId, 'quantity' => 1]],
            'success_url' => $this->appUrl('/admin/billing?session_id={CHECKOUT_SESSION_ID}'),
            'cancel_url' => $this->appUrl('/admin/billing?checkout=cancelled'),
            'client_reference_id' => (string)$actor['id'],
            'metadata' => ['bb_kind' => 'subscription', 'bb_user_id' => (string)$actor['id']],
            // Copied onto the subscription itself, so a subscription.updated event arriving
            // months later is still traceable to a user in the Stripe dashboard by eye.
            // Not what the handler resolves against — that is users.stripe_customer_id.
            'subscription_data' => ['metadata' => ['bb_user_id' => (string)$actor['id']]],
            'allow_promotion_codes' => true,
        ];

        $this->createSessionAndRespond($params, 'subscription', (int)$actor['id'], null);
    }

    /**
     * POST /billing/checkout/tournament — item 13. A one-time purchase against a single
     * tournament, independent of any account subscription.
     */
    public function startTournamentUnlockCheckout(array $body, array $actor): void {
        if (!$this->requireBillingAvailable()) {
            return;
        }
        if (STRIPE_PRICE_TOURNAMENT_UNLOCK === '') {
            http_response_code(400);
            echo json_encode(['error' => 'The per-tournament upgrade is not available']);
            return;
        }

        $tournamentId = isset($body['tournament_id']) ? (int)$body['tournament_id'] : 0;
        if ($tournamentId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'A tournament is required']);
            return;
        }

        // Owner only, not manager: this spends the organizer's money. requireTournamentRole
        // exits with 403 on its own, and lets a super admin through, which is what we want
        // for support-assisted purchases.
        requireTournamentRole($this->db, $tournamentId, ['owner']);

        $stmt = $this->db->prepare('SELECT id, name, paid_override, deleted_at FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        $tournament = $stmt->fetch();
        if (!$tournament || $tournament['deleted_at'] !== null) {
            http_response_code(404);
            echo json_encode(['error' => 'Tournament not found']);
            return;
        }
        if ((int)$tournament['paid_override'] === 1) {
            http_response_code(409);
            echo json_encode(['error' => 'This tournament is already upgraded']);
            return;
        }

        $customerId = $this->ensureStripeCustomer($actor, $this->userBillingRow((int)$actor['id']));
        if ($customerId === null) {
            http_response_code(502);
            echo json_encode(['error' => 'Could not reach the payment provider. Please try again.']);
            return;
        }

        $params = [
            'mode' => 'payment',
            'customer' => $customerId,
            'line_items' => [['price' => STRIPE_PRICE_TOURNAMENT_UNLOCK, 'quantity' => 1]],
            'success_url' => $this->appUrl('/admin/tournament/' . $tournamentId . '?session_id={CHECKOUT_SESSION_ID}'),
            'cancel_url' => $this->appUrl('/admin/tournament/' . $tournamentId . '?checkout=cancelled'),
            'client_reference_id' => (string)$actor['id'],
            'metadata' => [
                'bb_kind' => 'tournament_unlock',
                'bb_user_id' => (string)$actor['id'],
                'bb_tournament_id' => (string)$tournamentId,
                // Named on the Stripe payment so a dashboard refund request months later is
                // legible without cross-referencing our database.
                'bb_tournament_name' => mb_substr((string)$tournament['name'], 0, 200),
            ],
            'payment_intent_data' => [
                'metadata' => [
                    'bb_kind' => 'tournament_unlock',
                    'bb_tournament_id' => (string)$tournamentId,
                ],
            ],
            // A one-off business purchase; organizers running a club or a bar league will
            // want the receipt, and Stripe generating it costs us nothing.
            //
            // Removed automatically under Managed Payments, which forbids it because Stripe
            // issues the invoice and receipt itself as merchant of record — see
            // applyManagedPayments().
            'invoice_creation' => ['enabled' => true],
            'allow_promotion_codes' => true,
        ];

        $this->createSessionAndRespond($params, 'tournament_unlock', (int)$actor['id'], $tournamentId);
    }

    /**
     * Creates the session at Stripe, records it, and returns the redirect URL.
     *
     * Order matters: the billing_checkouts row is written BEFORE the URL is handed back, so
     * there is no state in which an organizer can reach Stripe's payment page for a session
     * we have no record of. If the insert fails the caller gets a 500 and never gets the
     * URL, leaving an unused session to expire on its own — the safe direction to fail.
     */
    /**
     * Turns a Checkout Session request into a Managed Payments one.
     *
     * Managed Payments makes Stripe the merchant of record: it calculates, collects and
     * remits sales tax/VAT/GST, absorbs fraud and dispute liability, and answers buyer
     * support, for 3.5% above standard processing. Chosen 2026-09-08 — at validation volume
     * the fee is a few dollars a month, and it removes the entire category of compliance
     * work rather than deferring it.
     *
     * Because Stripe controls the parts of the session that follow from being merchant of
     * record, some parameters must be *absent* rather than merely unused — sending them is
     * an error, not a no-op. Only the ones this integration actually sets are stripped here:
     *
     *   invoice_creation   Stripe issues the invoice and receipt itself.
     *
     * We deliberately never set automatic_tax, tax_id_collection, payment_method_types,
     * shipping_*, adaptive_pricing or any Connect parameter, so there is nothing else to
     * remove. If a future change adds one of those, this is the function that has to learn
     * about it — see docs/stripe-setup.md for the full list Stripe forbids.
     */
    private function applyManagedPayments(array $params): array {
        if (!STRIPE_MANAGED_PAYMENTS) {
            return $params;
        }
        $params['managed_payments'] = ['enabled' => true];
        unset($params['invoice_creation']);
        return $params;
    }

    private function createSessionAndRespond(array $params, string $kind, int $userId, ?int $tournamentId): void {
        $params = $this->applyManagedPayments($params);

        // Same user, same purchase, same minute collapses to one session rather than
        // creating a second on a double-click or an impatient retry. Stripe honours the key
        // for 24 hours; a minute bucket is short enough that a genuine second purchase
        // later in the day still works.
        $idempotencyKey = 'bb_' . $kind . '_' . $userId . '_' . ($tournamentId ?? 0) . '_' . floor(time() / 60);

        $result = $this->stripe->createCheckoutSession($params, $idempotencyKey);
        if (!$result['success']) {
            error_log('BillingController: checkout session creation failed: ' . $result['error']);
            http_response_code(502);
            echo json_encode(['error' => 'Could not start checkout. Please try again.']);
            return;
        }

        $session = $result['data'];
        $sessionId = (string)($session['id'] ?? '');
        $url = (string)($session['url'] ?? '');
        if ($sessionId === '' || $url === '') {
            error_log('BillingController: Stripe returned a session with no id or url');
            http_response_code(502);
            echo json_encode(['error' => 'Could not start checkout. Please try again.']);
            return;
        }

        // ON DUPLICATE KEY: the idempotency key above means a retried request gets the same
        // session back from Stripe, so the row may already exist. That is success, not a
        // conflict.
        $insert = $this->db->prepare('
            INSERT INTO billing_checkouts (stripe_session_id, kind, user_id, tournament_id, amount_total, currency, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
        ');
        $insert->execute([
            $sessionId,
            $kind,
            $userId,
            $tournamentId,
            isset($session['amount_total']) ? (int)$session['amount_total'] : null,
            $session['currency'] ?? null,
            'open',
        ]);

        writeAuditLog($this->db, $tournamentId, $userId, 'billing_checkout_started', 'billing_checkout', $sessionId, [
            'kind' => $kind,
            'amount_total' => $session['amount_total'] ?? null,
            'currency' => $session['currency'] ?? null,
        ]);

        echo json_encode(['url' => $url, 'session_id' => $sessionId]);
    }

    /**
     * POST /billing/portal — hands the organizer over to Stripe's hosted portal to update a
     * card, see invoices, or cancel. We deliberately host none of that ourselves.
     */
    public function openPortal(array $actor): void {
        if (!$this->requireBillingAvailable()) {
            return;
        }

        $row = $this->userBillingRow((int)$actor['id']);
        if (empty($row['stripe_customer_id'])) {
            http_response_code(404);
            echo json_encode(['error' => 'There is nothing to manage on this account yet']);
            return;
        }

        $result = $this->stripe->createBillingPortalSession($row['stripe_customer_id'], $this->appUrl('/admin/billing'));
        if (!$result['success']) {
            error_log('BillingController: portal session failed: ' . $result['error']);
            http_response_code(502);
            echo json_encode(['error' => 'Could not open the billing portal. Please try again.']);
            return;
        }

        echo json_encode(['url' => $result['data']['url'] ?? null]);
    }

    // ----------------------------------------------------------------------------------
    // Coming back from Checkout
    // ----------------------------------------------------------------------------------

    /**
     * GET /billing/confirm?session_id=... — reconciles the session the organizer just
     * returned from.
     *
     * This exists because the redirect back and the webhook race, and either can win. If we
     * relied on the webhook alone, an organizer would land on their tournament page having
     * just paid and see nothing different for however long delivery took. Fulfilment is
     * idempotent, so whichever arrives second is a no-op.
     */
    public function confirm(array $query, array $actor): void {
        $sessionId = trim((string)($query['session_id'] ?? ''));
        if ($sessionId === '') {
            http_response_code(400);
            echo json_encode(['error' => 'A session id is required']);
            return;
        }

        $checkout = $this->checkoutBySessionId($sessionId);
        // 404 rather than 403 on someone else's session: confirming that a session id
        // exists is itself information, and the caller has no legitimate use for it.
        if (!$checkout || (int)$checkout['user_id'] !== (int)$actor['id']) {
            http_response_code(404);
            echo json_encode(['error' => 'Checkout not found']);
            return;
        }

        if ($checkout['status'] === 'paid') {
            echo json_encode(['status' => 'paid', 'kind' => $checkout['kind'], 'already_fulfilled' => true]);
            return;
        }

        $result = $this->stripe->retrieveCheckoutSession($sessionId);
        if (!$result['success']) {
            error_log('BillingController::confirm: ' . $result['error']);
            // Not an error the organizer can act on, and the webhook will still land, so
            // report the honest in-between state rather than failing the page.
            echo json_encode(['status' => 'pending', 'kind' => $checkout['kind'], 'already_fulfilled' => false]);
            return;
        }

        $intent = BillingIntent::forEvent(['type' => 'checkout.session.completed', 'data' => ['object' => $result['data']]]);
        if ($intent['action'] !== BillingIntent::ACTION_FULFILL_CHECKOUT) {
            echo json_encode(['status' => 'pending', 'kind' => $checkout['kind'], 'already_fulfilled' => false]);
            return;
        }

        $this->fulfillCheckout($intent, 'return_page');
        echo json_encode(['status' => 'paid', 'kind' => $checkout['kind'], 'already_fulfilled' => false]);
    }

    // ----------------------------------------------------------------------------------
    // Webhook
    // ----------------------------------------------------------------------------------

    /**
     * POST /billing/webhook — public and unauthenticated by necessity; Stripe cannot hold a
     * session. StripeSignature is the entire access control, which is why it lives in
     * api/lib/ with its own test battery rather than being inlined here.
     *
     * $rawBody must be the unmodified request body. Re-encoding a decoded array changes
     * whitespace and key order, and the HMAC would never match.
     */
    public function webhook(string $rawBody, string $signatureHeader): void {
        $check = StripeSignature::verify($rawBody, $signatureHeader, STRIPE_WEBHOOK_SECRET);
        if (!$check['valid']) {
            // The reason goes to the log, never the response: it says precisely which check
            // a forgery failed, which is a hint we have no reason to hand out.
            error_log('BillingController::webhook: rejected signature — ' . $check['error']);
            http_response_code(400);
            echo json_encode(['error' => 'Invalid signature']);
            return;
        }

        $event = json_decode($rawBody, true);
        if (!is_array($event) || empty($event['id']) || empty($event['type'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Malformed event']);
            return;
        }

        $eventId = (string)$event['id'];
        $eventType = (string)$event['type'];

        if (!$this->claimEvent($eventId, $eventType)) {
            // Already handled. 200 so Stripe stops redelivering.
            echo json_encode(['ok' => true, 'duplicate' => true]);
            return;
        }

        $intent = BillingIntent::forEvent($event);

        try {
            $outcome = $this->applyIntent($intent);
        } catch (Throwable $e) {
            // Leave the row in 'error', which claimEvent() treats as reprocessable, and 500
            // so Stripe retries. A transient database blip therefore self-heals instead of
            // permanently swallowing a payment.
            $this->finishEvent($eventId, 'error', $e->getMessage());
            error_log("BillingController::webhook: {$eventType} ({$eventId}) failed: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Handler failed']);
            return;
        }

        $this->finishEvent($eventId, $outcome['handled'] ? 'processed' : 'ignored', $outcome['detail']);
        echo json_encode(['ok' => true]);
    }

    /**
     * Routes a decoded intent to its handler. Returns
     * ['handled' => bool, 'detail' => string] — 'handled' false means the event was
     * understood and deliberately did nothing, which is a normal outcome, not a failure.
     */
    private function applyIntent(array $intent): array {
        switch ($intent['action']) {
            case BillingIntent::ACTION_FULFILL_CHECKOUT:
                return $this->fulfillCheckout($intent, 'webhook');

            case BillingIntent::ACTION_CLOSE_CHECKOUT:
                $stmt = $this->db->prepare("
                    UPDATE billing_checkouts SET status = ? WHERE stripe_session_id = ? AND status = 'open'
                ");
                $stmt->execute([$intent['checkout_status'], $intent['session_id']]);
                return ['handled' => $stmt->rowCount() > 0, 'detail' => $intent['reason']];

            case BillingIntent::ACTION_SYNC_SUBSCRIPTION:
                return $this->syncSubscription($intent);

            case BillingIntent::ACTION_REVERSE_PAYMENT:
                return $this->reversePayment($intent);

            default:
                return ['handled' => false, 'detail' => $intent['reason']];
        }
    }

    // ----------------------------------------------------------------------------------
    // Fulfilment — every one of these is idempotent
    // ----------------------------------------------------------------------------------

    /**
     * Grants what a paid Checkout Session bought.
     *
     * The purchase is resolved from our own billing_checkouts row, not from the event's
     * metadata. A session with no row means we never issued it — which our own ordering
     * makes impossible for a session anyone could have paid — so it is logged loudly and
     * granted nothing.
     */
    private function fulfillCheckout(array $intent, string $via): array {
        $checkout = $this->checkoutBySessionId($intent['session_id']);
        if (!$checkout) {
            error_log("BillingController: paid session {$intent['session_id']} has no billing_checkouts row; granting nothing");
            return ['handled' => false, 'detail' => 'No local record of this checkout session'];
        }

        if ($checkout['status'] === 'paid') {
            return ['handled' => false, 'detail' => 'Checkout already fulfilled'];
        }

        $this->db->beginTransaction();
        try {
            $update = $this->db->prepare("
                UPDATE billing_checkouts
                SET status = 'paid',
                    stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
                    stripe_subscription_id = COALESCE(?, stripe_subscription_id),
                    amount_total = COALESCE(?, amount_total),
                    currency = COALESCE(?, currency),
                    fulfilled_at = NOW()
                WHERE id = ? AND status <> 'paid'
            ");
            $update->execute([
                $intent['payment_intent_id'] ?? null,
                $intent['subscription_id'] ?? null,
                $intent['amount_total'] ?? null,
                $intent['currency'] ?? null,
                (int)$checkout['id'],
            ]);

            // Lost the race to the other of {webhook, return page}: the row was already
            // flipped between our read and this write. Nothing left to do, and the winner
            // granted the entitlement.
            if ($update->rowCount() === 0) {
                $this->db->rollBack();
                return ['handled' => false, 'detail' => 'Checkout already fulfilled'];
            }

            if ($checkout['kind'] === 'subscription') {
                $this->grantSubscription(
                    (int)$checkout['user_id'],
                    $intent['subscription_id'] ?? null,
                    $intent['customer_id'] ?? null,
                    null
                );
                writeAuditLog($this->db, null, (int)$checkout['user_id'], 'billing_subscription_started', 'user', (string)$checkout['user_id'], [
                    'via' => $via,
                    'session_id' => $intent['session_id'],
                ]);
            } else {
                $this->grantTournamentUnlock((int)$checkout['tournament_id']);
                writeAuditLog($this->db, (int)$checkout['tournament_id'], (int)$checkout['user_id'], 'billing_tournament_unlocked', 'tournament', (string)$checkout['tournament_id'], [
                    'via' => $via,
                    'session_id' => $intent['session_id'],
                ]);
            }

            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return ['handled' => true, 'detail' => "Fulfilled {$checkout['kind']} via {$via}"];
    }

    /**
     * Applies a subscription lifecycle change to the owning account.
     *
     * The user is found by stripe_customer_id — a mapping we wrote in ensureStripeCustomer()
     * — so an event for a customer we do not know about changes nothing.
     */
    private function syncSubscription(array $intent): array {
        if (empty($intent['customer_id'])) {
            return ['handled' => false, 'detail' => 'Subscription event carried no customer'];
        }

        $stmt = $this->db->prepare('SELECT id, plan, plan_source, stripe_subscription_id FROM users WHERE stripe_customer_id = ?');
        $stmt->execute([$intent['customer_id']]);
        $user = $stmt->fetch();
        if (!$user) {
            return ['handled' => false, 'detail' => 'No user mapped to customer ' . $intent['customer_id']];
        }

        if ($intent['grant']) {
            $this->grantSubscription(
                (int)$user['id'],
                $intent['subscription_id'],
                $intent['customer_id'],
                $intent['current_period_end'] ?? null
            );
            writeAuditLog($this->db, null, null, 'billing_subscription_active', 'user', (string)$user['id'], [
                'status' => $intent['status'],
                'subscription_id' => $intent['subscription_id'],
            ]);
            return ['handled' => true, 'detail' => "Plan held open (status={$intent['status']})"];
        }

        // Revoke, but only a grant Stripe itself made, and only for the subscription this
        // event is actually about — otherwise cancelling an old subscription could strip a
        // plan a newer one is paying for.
        $revoke = $this->db->prepare("
            UPDATE users
            SET plan = 'free', plan_source = 'manual', stripe_subscription_id = NULL, plan_expires_at = NULL
            WHERE id = ? AND plan_source = 'stripe' AND stripe_subscription_id = ?
        ");
        $revoke->execute([(int)$user['id'], $intent['subscription_id']]);

        if ($revoke->rowCount() === 0) {
            return ['handled' => false, 'detail' => 'Nothing to revoke (plan was not granted by this subscription)'];
        }

        writeAuditLog($this->db, null, null, 'billing_subscription_ended', 'user', (string)$user['id'], [
            'status' => $intent['status'],
            'subscription_id' => $intent['subscription_id'],
        ]);

        // Note what is deliberately NOT done here: nothing touches tournaments the organizer
        // already owns. A lapsed plan stops them starting new paid work; it never rewrites a
        // bracket that is already built or deletes participants already entered. Breaking a
        // live event at a venue over a card that expired is the worst failure available, and
        // the existing gates only ever read the plan at the moment of a new choice.
        return ['handled' => true, 'detail' => "Plan revoked (status={$intent['status']})"];
    }

    /**
     * Undoes a one-time tournament unlock when the money goes back.
     *
     * Subscription payments reverse through their own lifecycle events, so a refund against
     * one is left alone here.
     */
    private function reversePayment(array $intent): array {
        if (empty($intent['payment_intent_id'])) {
            return ['handled' => false, 'detail' => 'Reversal carried no payment intent'];
        }

        $stmt = $this->db->prepare('SELECT id, kind, tournament_id, user_id FROM billing_checkouts WHERE stripe_payment_intent_id = ?');
        $stmt->execute([$intent['payment_intent_id']]);
        $checkout = $stmt->fetch();
        if (!$checkout) {
            return ['handled' => false, 'detail' => 'No local checkout for that payment'];
        }
        if ($checkout['kind'] !== 'tournament_unlock' || empty($checkout['tournament_id'])) {
            return ['handled' => false, 'detail' => 'Reversal is not against a tournament unlock'];
        }

        $this->db->beginTransaction();
        try {
            $this->db->prepare("UPDATE billing_checkouts SET status = 'reversed' WHERE id = ?")
                ->execute([(int)$checkout['id']]);

            // Only clears an override Stripe granted, so a refund cannot strip a comped
            // tournament a super admin unlocked by hand.
            $clear = $this->db->prepare("
                UPDATE tournaments
                SET paid_override = 0, paid_override_source = 'manual'
                WHERE id = ? AND paid_override_source = 'stripe'
            ");
            $clear->execute([(int)$checkout['tournament_id']]);
            $cleared = $clear->rowCount() > 0;

            writeAuditLog($this->db, (int)$checkout['tournament_id'], null, 'billing_tournament_unlock_reversed', 'tournament', (string)$checkout['tournament_id'], [
                'reversal' => $intent['reversal'],
                'payment_intent_id' => $intent['payment_intent_id'],
                'override_cleared' => $cleared,
            ]);

            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return ['handled' => true, 'detail' => $cleared ? 'Tournament unlock reversed' : 'Payment reversed; override was manual and left in place'];
    }

    private function grantSubscription(int $userId, ?string $subscriptionId, ?string $customerId, ?int $periodEnd): void {
        $stmt = $this->db->prepare("
            UPDATE users
            SET plan = 'paid',
                plan_source = 'stripe',
                stripe_subscription_id = COALESCE(?, stripe_subscription_id),
                stripe_customer_id = COALESCE(stripe_customer_id, ?),
                plan_expires_at = COALESCE(?, plan_expires_at)
            WHERE id = ?
        ");
        $stmt->execute([
            $subscriptionId,
            $customerId,
            $periodEnd !== null ? gmdate('Y-m-d H:i:s', $periodEnd) : null,
            $userId,
        ]);
    }

    private function grantTournamentUnlock(int $tournamentId): void {
        // The CASE keeps paid_override_source at 'manual' when a super admin had already
        // unlocked this tournament by hand, so a later refund of this payment does not
        // revoke their grant. Paying for something already comped is a wasted purchase, not
        // a bug — the checkout endpoint refuses it up front; this only covers the race.
        $stmt = $this->db->prepare("
            UPDATE tournaments
            SET paid_override = 1,
                paid_override_source = CASE WHEN paid_override = 1 THEN paid_override_source ELSE 'stripe' END
            WHERE id = ?
        ");
        $stmt->execute([$tournamentId]);
    }

    // ----------------------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------------------

    /**
     * Claims an event id, returning false if it has already been handled.
     *
     * A row left in 'error' is deliberately reclaimable: Stripe retries a 500 for up to
     * three days, and a handler that failed on a transient fault should succeed on one of
     * those retries rather than being locked out by its own failed attempt.
     */
    private function claimEvent(string $eventId, string $type): bool {
        $stmt = $this->db->prepare("
            INSERT INTO billing_events (stripe_event_id, type, status)
            VALUES (?, ?, 'received')
            ON DUPLICATE KEY UPDATE
                status = IF(status = 'error', 'received', status),
                detail = IF(status = 'error', NULL, detail)
        ");
        $stmt->execute([$eventId, $type]);

        // A fresh insert reports 1 affected row; an ON DUPLICATE KEY UPDATE that actually
        // changed something reports 2; one that changed nothing reports 0. So 1 or 2 both
        // mean "ours to process", and 0 means a duplicate we already dealt with.
        return $stmt->rowCount() !== 0;
    }

    private function finishEvent(string $eventId, string $status, ?string $detail): void {
        $stmt = $this->db->prepare('UPDATE billing_events SET status = ?, detail = ?, processed_at = NOW() WHERE stripe_event_id = ?');
        $stmt->execute([$status, $detail !== null ? mb_substr($detail, 0, 500) : null, $eventId]);
    }

    private function checkoutBySessionId(string $sessionId): ?array {
        $stmt = $this->db->prepare('SELECT * FROM billing_checkouts WHERE stripe_session_id = ?');
        $stmt->execute([$sessionId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private function userBillingRow(int $userId): array {
        $stmt = $this->db->prepare('
            SELECT id, email, username, plan, plan_source, stripe_customer_id, stripe_subscription_id, plan_expires_at
            FROM users WHERE id = ?
        ');
        $stmt->execute([$userId]);
        return $stmt->fetch() ?: [];
    }

    /**
     * Returns the account's Stripe customer id, creating one on first purchase.
     *
     * Created explicitly rather than letting Checkout do it implicitly: a mode=payment
     * session does not create a customer at all by default, and without a stable id we
     * could neither open the billing portal nor map an incoming subscription event back to
     * a user.
     */
    private function ensureStripeCustomer(array $actor, array $row): ?string {
        if (!empty($row['stripe_customer_id'])) {
            return $row['stripe_customer_id'];
        }

        $result = $this->stripe->createCustomer(
            (string)($row['email'] ?? $actor['email'] ?? ''),
            (string)($row['username'] ?? $actor['username'] ?? ''),
            ['bb_user_id' => (string)$actor['id']]
        );
        if (!$result['success'] || empty($result['data']['id'])) {
            error_log('BillingController: customer creation failed: ' . ($result['error'] ?? 'no id returned'));
            return null;
        }

        $customerId = (string)$result['data']['id'];
        // Only fills an empty column. If a concurrent request won the race we keep the id
        // it stored and quietly abandon this one — an unused Stripe customer is free, and
        // two ids mapped to one user is not something we can recover from later.
        $stmt = $this->db->prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL');
        $stmt->execute([$customerId, (int)$actor['id']]);
        if ($stmt->rowCount() === 0) {
            $fresh = $this->userBillingRow((int)$actor['id']);
            return $fresh['stripe_customer_id'] ?? $customerId;
        }

        return $customerId;
    }

    private function billingEnabled(): bool {
        return STRIPE_BILLING_ENABLED && $this->stripe->isConfigured() && STRIPE_WEBHOOK_SECRET !== '';
    }

    /**
     * Guards every endpoint that would take money. The webhook secret counts as required
     * here: without it nothing could be fulfilled, so selling would mean charging for
     * something the organizer never receives.
     */
    private function requireBillingAvailable(): bool {
        if ($this->billingEnabled()) {
            return true;
        }
        http_response_code(503);
        echo json_encode(['error' => 'Billing is not available on this installation']);
        return false;
    }

    private function appUrl(string $path): string {
        return rtrim(APP_PUBLIC_URL, '/') . $path;
    }
}
