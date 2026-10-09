<?php
// api/lib/BillingIntent.php
//
// Translates a verified Stripe webhook event into what it *means for us*, as a pure
// function of the event array — no PDO, no network. Unit tested in
// tests/BillingIntentTest.php.
//
// The deliberate design point: this decides the KIND of thing that happened and hands back
// Stripe's own identifiers, but it never decides *whose* plan to change. Ownership is
// resolved by BillingController from rows we wrote ourselves (billing_checkouts.user_id,
// users.stripe_customer_id) rather than from metadata echoed back by the request. A forged
// event cannot get past StripeSignature, but keeping the grant target sourced from our own
// tables means metadata is corroboration rather than authority.

final class BillingIntent {
    // Nothing to do — an event type we subscribe to but that carries no state change for
    // us (dunning retries), or one that is not yet final (an async payment still settling).
    const ACTION_IGNORE = 'ignore';
    // A Checkout Session is paid and its purchase should be granted.
    const ACTION_FULFILL_CHECKOUT = 'fulfill_checkout';
    // A Checkout Session ended without payment; close out our row, grant nothing.
    const ACTION_CLOSE_CHECKOUT = 'close_checkout';
    // A subscription's lifecycle moved; 'grant' says which way.
    const ACTION_SYNC_SUBSCRIPTION = 'sync_subscription';
    // Money came back (refund or chargeback) — undo the one-time tournament unlock that
    // the originating payment bought.
    const ACTION_REVERSE_PAYMENT = 'reverse_payment';

    // Subscription statuses that hold the paid plan open. past_due is deliberately
    // included: Stripe is still retrying the card during dunning, and pulling an
    // organizer's plan the hour a renewal blips — potentially mid-event — is a worse
    // failure than carrying them through the retry window. Stripe emits a further
    // customer.subscription.updated with 'canceled' or 'unpaid' when dunning gives up, and
    // that one revokes.
    const SUBSCRIPTION_ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];
    // Terminal statuses that revoke. 'incomplete' is deliberately in neither list — the
    // first payment has not settled, so there is nothing yet to grant or to revoke.
    const SUBSCRIPTION_ENDED_STATUSES = ['canceled', 'unpaid', 'incomplete_expired'];

    /**
     * Returns an intent array. Always carries 'action' and 'reason'; the remaining keys
     * depend on the action and are documented per branch below.
     */
    public static function forEvent(array $event): array {
        $type = (string)($event['type'] ?? '');
        $object = $event['data']['object'] ?? [];
        if (!is_array($object)) {
            $object = [];
        }

        switch ($type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
                return self::forCheckoutSession($type, $object);

            case 'checkout.session.expired':
                return [
                    'action' => self::ACTION_CLOSE_CHECKOUT,
                    'reason' => 'Checkout session expired before payment',
                    'session_id' => (string)($object['id'] ?? ''),
                    'checkout_status' => 'expired',
                ];

            case 'checkout.session.async_payment_failed':
                return [
                    'action' => self::ACTION_CLOSE_CHECKOUT,
                    'reason' => 'Delayed payment method failed',
                    'session_id' => (string)($object['id'] ?? ''),
                    'checkout_status' => 'failed',
                ];

            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                return self::forSubscription($type, $object);

            case 'charge.refunded':
                // A partial refund leaves 'refunded' false. Our checkout cannot produce
                // one — the unlock is a single flat line item — so if a partial appears it
                // was issued by hand in the dashboard, and a human should decide what it
                // meant rather than us silently stripping a paid tournament.
                if (empty($object['refunded'])) {
                    return [
                        'action' => self::ACTION_IGNORE,
                        'reason' => 'Partial refund — leaving access in place for manual review',
                    ];
                }
                return [
                    'action' => self::ACTION_REVERSE_PAYMENT,
                    'reason' => 'Charge fully refunded',
                    'payment_intent_id' => self::idOf($object['payment_intent'] ?? null),
                    'reversal' => 'refund',
                ];

            case 'charge.dispute.created':
                // A chargeback is the money withdrawn plus a fee. Same undo path as a
                // refund: the dispute points at the charge's payment intent, which is how
                // we find our own billing_checkouts row.
                return [
                    'action' => self::ACTION_REVERSE_PAYMENT,
                    'reason' => 'Payment disputed (chargeback)',
                    'payment_intent_id' => self::idOf($object['payment_intent'] ?? null),
                    'reversal' => 'dispute',
                ];

            case 'invoice.payment_failed':
                // A real state change, but not ours to make: Stripe is mid-dunning and will
                // emit customer.subscription.updated when the status actually moves.
                return [
                    'action' => self::ACTION_IGNORE,
                    'reason' => 'Dunning in progress; awaiting subscription status change',
                ];

            default:
                return ['action' => self::ACTION_IGNORE, 'reason' => "Unhandled event type: {$type}"];
        }
    }

    private static function forCheckoutSession(string $type, array $object): array {
        $paymentStatus = (string)($object['payment_status'] ?? '');

        // 'unpaid' on a completed session means a delayed payment method (a bank debit) is
        // still settling. Granting here would hand out a paid plan for money that may never
        // arrive; checkout.session.async_payment_succeeded is the event that means it did.
        if ($paymentStatus !== 'paid' && $paymentStatus !== 'no_payment_required') {
            return [
                'action' => self::ACTION_IGNORE,
                'reason' => "Checkout session not paid (payment_status={$paymentStatus})",
            ];
        }

        return [
            'action' => self::ACTION_FULFILL_CHECKOUT,
            'reason' => "Checkout session paid via {$type}",
            'session_id' => (string)($object['id'] ?? ''),
            'mode' => (string)($object['mode'] ?? ''),
            'customer_id' => self::idOf($object['customer'] ?? null),
            'subscription_id' => self::idOf($object['subscription'] ?? null),
            'payment_intent_id' => self::idOf($object['payment_intent'] ?? null),
            'amount_total' => isset($object['amount_total']) ? (int)$object['amount_total'] : null,
            'currency' => isset($object['currency']) ? (string)$object['currency'] : null,
        ];
    }

    private static function forSubscription(string $type, array $object): array {
        $status = (string)($object['status'] ?? '');

        // A deleted subscription revokes regardless of the status field it carries — that
        // is 'canceled' in practice, but the event type is the authority here.
        if ($type === 'customer.subscription.deleted') {
            $grant = false;
        } elseif (in_array($status, self::SUBSCRIPTION_ACTIVE_STATUSES, true)) {
            $grant = true;
        } elseif (in_array($status, self::SUBSCRIPTION_ENDED_STATUSES, true)) {
            $grant = false;
        } else {
            return [
                'action' => self::ACTION_IGNORE,
                'reason' => "Subscription status not yet decisive (status={$status})",
            ];
        }

        return [
            'action' => self::ACTION_SYNC_SUBSCRIPTION,
            'reason' => "Subscription {$type} with status={$status}",
            'grant' => $grant,
            'status' => $status,
            'customer_id' => self::idOf($object['customer'] ?? null),
            'subscription_id' => (string)($object['id'] ?? ''),
            'current_period_end' => self::currentPeriodEnd($object),
        ];
    }

    /**
     * The end of the paid-through window as a unix timestamp, or null if absent.
     *
     * Stripe moved this from the subscription onto its individual items in the 2025 API
     * versions, so read both: the top-level field for an account still pinned to an older
     * version, the first item's otherwise. We only ever sell single-item subscriptions, so
     * "the first item" is the whole subscription.
     */
    private static function currentPeriodEnd(array $object): ?int {
        if (isset($object['current_period_end']) && is_numeric($object['current_period_end'])) {
            return (int)$object['current_period_end'];
        }
        $item = $object['items']['data'][0] ?? null;
        if (is_array($item) && isset($item['current_period_end']) && is_numeric($item['current_period_end'])) {
            return (int)$item['current_period_end'];
        }
        return null;
    }

    /**
     * Stripe sends a related object as a bare id string normally, or as the whole expanded
     * object when the request asked for it to be expanded. Accept either shape.
     */
    private static function idOf($value): ?string {
        if (is_string($value) && $value !== '') {
            return $value;
        }
        if (is_array($value) && isset($value['id']) && is_string($value['id'])) {
            return $value['id'];
        }
        return null;
    }
}
