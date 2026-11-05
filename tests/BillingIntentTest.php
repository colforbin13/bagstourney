<?php
// tests/BillingIntentTest.php

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Covers how a Stripe webhook event is read as an instruction.
 *
 * The failure modes worth guarding are asymmetric. Granting when we should not means
 * giving away the paid tier; revoking when we should not means pulling an organizer's plan
 * — possibly the evening of their event — over a payment blip Stripe was still retrying.
 * The second is the one that is hard to notice and impossible to apologise for, so several
 * tests below exist purely to pin down what does NOT revoke.
 */
final class BillingIntentTest extends TestCase
{
    private function event(string $type, array $object): array
    {
        return ['id' => 'evt_test', 'type' => $type, 'data' => ['object' => $object]];
    }

    private function session(array $over = []): array
    {
        return array_merge([
            'id' => 'cs_test_123',
            'mode' => 'payment',
            'payment_status' => 'paid',
            'customer' => 'cus_123',
            'payment_intent' => 'pi_123',
            'amount_total' => 1500,
            'currency' => 'usd',
        ], $over);
    }

    private function subscription(array $over = []): array
    {
        return array_merge([
            'id' => 'sub_123',
            'status' => 'active',
            'customer' => 'cus_123',
            'current_period_end' => 1_760_000_000,
        ], $over);
    }

    // ----------------------------------------------------------------------------------
    // Checkout
    // ----------------------------------------------------------------------------------

    public function testPaidCheckoutSessionFulfils(): void
    {
        $intent = BillingIntent::forEvent($this->event('checkout.session.completed', $this->session()));

        $this->assertSame(BillingIntent::ACTION_FULFILL_CHECKOUT, $intent['action']);
        $this->assertSame('cs_test_123', $intent['session_id']);
        $this->assertSame('pi_123', $intent['payment_intent_id']);
        $this->assertSame('cus_123', $intent['customer_id']);
        $this->assertSame(1500, $intent['amount_total']);
        $this->assertSame('usd', $intent['currency']);
    }

    public function testUnpaidCheckoutSessionGrantsNothing(): void
    {
        // A delayed payment method (a bank debit) completes the session before the money
        // moves. Granting here would hand out the paid tier for a payment that can still
        // fail; checkout.session.async_payment_succeeded is what means it landed.
        $intent = BillingIntent::forEvent($this->event('checkout.session.completed', $this->session(['payment_status' => 'unpaid'])));

        $this->assertSame(BillingIntent::ACTION_IGNORE, $intent['action']);
    }

    public function testAsyncPaymentSucceededFulfils(): void
    {
        $intent = BillingIntent::forEvent($this->event('checkout.session.async_payment_succeeded', $this->session()));

        $this->assertSame(BillingIntent::ACTION_FULFILL_CHECKOUT, $intent['action']);
        $this->assertSame('cs_test_123', $intent['session_id']);
    }

    public function testFreeCheckoutFulfils(): void
    {
        // A 100% promotion code produces a paid session with nothing to charge. It is still
        // a completed purchase and must still unlock what it bought.
        $intent = BillingIntent::forEvent($this->event('checkout.session.completed', $this->session([
            'payment_status' => 'no_payment_required',
            'amount_total' => 0,
        ])));

        $this->assertSame(BillingIntent::ACTION_FULFILL_CHECKOUT, $intent['action']);
    }

    public function testSubscriptionCheckoutCarriesTheSubscriptionId(): void
    {
        $intent = BillingIntent::forEvent($this->event('checkout.session.completed', $this->session([
            'mode' => 'subscription',
            'subscription' => 'sub_123',
            'payment_intent' => null,
        ])));

        $this->assertSame(BillingIntent::ACTION_FULFILL_CHECKOUT, $intent['action']);
        $this->assertSame('subscription', $intent['mode']);
        $this->assertSame('sub_123', $intent['subscription_id']);
        $this->assertNull($intent['payment_intent_id']);
    }

    public function testExpiredAndFailedSessionsCloseWithoutGranting(): void
    {
        $expired = BillingIntent::forEvent($this->event('checkout.session.expired', ['id' => 'cs_test_123']));
        $this->assertSame(BillingIntent::ACTION_CLOSE_CHECKOUT, $expired['action']);
        $this->assertSame('expired', $expired['checkout_status']);

        $failed = BillingIntent::forEvent($this->event('checkout.session.async_payment_failed', ['id' => 'cs_test_123']));
        $this->assertSame(BillingIntent::ACTION_CLOSE_CHECKOUT, $failed['action']);
        $this->assertSame('failed', $failed['checkout_status']);
    }

    public function testExpandedRelatedObjectsAreReadAsIds(): void
    {
        // Stripe sends a related object as a bare id normally, but as a whole object when
        // the request expanded it. Reading the expanded shape as null would silently lose
        // the customer mapping every subscription grant depends on.
        $intent = BillingIntent::forEvent($this->event('checkout.session.completed', $this->session([
            'customer' => ['id' => 'cus_expanded', 'object' => 'customer'],
        ])));

        $this->assertSame('cus_expanded', $intent['customer_id']);
    }

    // ----------------------------------------------------------------------------------
    // Subscription lifecycle
    // ----------------------------------------------------------------------------------

    #[DataProvider('grantingStatuses')]
    public function testStatusesThatHoldThePlanOpen(string $status): void
    {
        $intent = BillingIntent::forEvent($this->event('customer.subscription.updated', $this->subscription(['status' => $status])));

        $this->assertSame(BillingIntent::ACTION_SYNC_SUBSCRIPTION, $intent['action']);
        $this->assertTrue($intent['grant'], "status={$status} should keep the plan");
    }

    public static function grantingStatuses(): array
    {
        return [
            'active' => ['active'],
            'trialing' => ['trialing'],
            // The one that matters most. past_due means a renewal failed and Stripe is
            // still retrying the card. Revoking here would cut an organizer off days before
            // Stripe has given up, potentially mid-event, over a payment that usually
            // succeeds on retry.
            'past_due' => ['past_due'],
        ];
    }

    #[DataProvider('revokingStatuses')]
    public function testTerminalStatusesRevoke(string $status): void
    {
        $intent = BillingIntent::forEvent($this->event('customer.subscription.updated', $this->subscription(['status' => $status])));

        $this->assertSame(BillingIntent::ACTION_SYNC_SUBSCRIPTION, $intent['action']);
        $this->assertFalse($intent['grant'], "status={$status} should end the plan");
    }

    public static function revokingStatuses(): array
    {
        return [
            'canceled' => ['canceled'],
            'unpaid' => ['unpaid'],
            'incomplete_expired' => ['incomplete_expired'],
        ];
    }

    public function testIncompleteSubscriptionDoesNothingEitherWay(): void
    {
        // The first payment has not settled. There is nothing to grant, and revoking would
        // be wrong for an organizer who is mid-checkout on a card that is about to clear.
        $intent = BillingIntent::forEvent($this->event('customer.subscription.created', $this->subscription(['status' => 'incomplete'])));

        $this->assertSame(BillingIntent::ACTION_IGNORE, $intent['action']);
    }

    public function testDeletedSubscriptionRevokesWhateverStatusItCarries(): void
    {
        $intent = BillingIntent::forEvent($this->event('customer.subscription.deleted', $this->subscription(['status' => 'active'])));

        $this->assertSame(BillingIntent::ACTION_SYNC_SUBSCRIPTION, $intent['action']);
        $this->assertFalse($intent['grant']);
    }

    public function testReadsPeriodEndFromTheSubscription(): void
    {
        $intent = BillingIntent::forEvent($this->event('customer.subscription.updated', $this->subscription()));

        $this->assertSame(1_760_000_000, $intent['current_period_end']);
    }

    public function testReadsPeriodEndFromTheFirstItemWhenAbsentFromTheSubscription(): void
    {
        // Stripe moved current_period_end onto individual items in the 2025 API versions.
        // We sell single-item subscriptions only, so the first item is the whole thing.
        $subscription = $this->subscription();
        unset($subscription['current_period_end']);
        $subscription['items'] = ['data' => [['current_period_end' => 1_770_000_000]]];

        $intent = BillingIntent::forEvent($this->event('customer.subscription.updated', $subscription));

        $this->assertSame(1_770_000_000, $intent['current_period_end']);
    }

    public function testMissingPeriodEndIsNullRatherThanZero(): void
    {
        // Zero would render as 1970 in the "renews on" line — a wrong date is worse than
        // no date, since the UI can omit what it does not know.
        $subscription = $this->subscription();
        unset($subscription['current_period_end']);

        $intent = BillingIntent::forEvent($this->event('customer.subscription.updated', $subscription));

        $this->assertNull($intent['current_period_end']);
    }

    // ----------------------------------------------------------------------------------
    // Money going back
    // ----------------------------------------------------------------------------------

    public function testFullRefundReversesThePayment(): void
    {
        $intent = BillingIntent::forEvent($this->event('charge.refunded', [
            'id' => 'ch_123',
            'payment_intent' => 'pi_123',
            'refunded' => true,
            'amount_refunded' => 1500,
        ]));

        $this->assertSame(BillingIntent::ACTION_REVERSE_PAYMENT, $intent['action']);
        $this->assertSame('pi_123', $intent['payment_intent_id']);
        $this->assertSame('refund', $intent['reversal']);
    }

    public function testPartialRefundLeavesAccessAlone(): void
    {
        // Our checkout sells one flat line item, so a partial refund can only have been
        // issued by hand in the dashboard. Guessing that it meant "revoke" could strip a
        // tournament from an organizer who was given a goodwill discount.
        $intent = BillingIntent::forEvent($this->event('charge.refunded', [
            'id' => 'ch_123',
            'payment_intent' => 'pi_123',
            'refunded' => false,
            'amount_refunded' => 500,
        ]));

        $this->assertSame(BillingIntent::ACTION_IGNORE, $intent['action']);
    }

    public function testChargebackReversesThePayment(): void
    {
        $intent = BillingIntent::forEvent($this->event('charge.dispute.created', [
            'id' => 'dp_123',
            'payment_intent' => 'pi_123',
        ]));

        $this->assertSame(BillingIntent::ACTION_REVERSE_PAYMENT, $intent['action']);
        $this->assertSame('pi_123', $intent['payment_intent_id']);
        $this->assertSame('dispute', $intent['reversal']);
    }

    public function testFailedInvoiceChangesNothingByItself(): void
    {
        // Stripe is mid-dunning; customer.subscription.updated is what reports where it
        // landed. Acting on this event as well would revoke on the first failed retry.
        $intent = BillingIntent::forEvent($this->event('invoice.payment_failed', ['id' => 'in_123']));

        $this->assertSame(BillingIntent::ACTION_IGNORE, $intent['action']);
    }

    // ----------------------------------------------------------------------------------
    // Everything else
    // ----------------------------------------------------------------------------------

    public function testUnknownEventTypesAreIgnoredNotFatal(): void
    {
        // Stripe adds event types, and a dashboard subscription can be widened by accident.
        // An unrecognised type must be a no-op, never an exception that 500s the endpoint
        // into an endless Stripe retry loop.
        $intent = BillingIntent::forEvent($this->event('customer.updated', ['id' => 'cus_123']));

        $this->assertSame(BillingIntent::ACTION_IGNORE, $intent['action']);
        $this->assertStringContainsString('customer.updated', $intent['reason']);
    }

    public function testStructurallyEmptyEventIsIgnored(): void
    {
        $this->assertSame(BillingIntent::ACTION_IGNORE, BillingIntent::forEvent([])['action']);
        $this->assertSame(BillingIntent::ACTION_IGNORE, BillingIntent::forEvent(['type' => 'checkout.session.completed'])['action']);
    }

    public function testEveryIntentCarriesAnActionAndAReason(): void
    {
        // The reason string is written to billing_events.detail, which is where a human
        // looks when a payment landed and nothing was granted. An intent without one is a
        // dead end at exactly the wrong moment.
        $types = [
            'checkout.session.completed', 'checkout.session.expired',
            'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
            'customer.subscription.created', 'customer.subscription.updated',
            'customer.subscription.deleted', 'charge.refunded', 'charge.dispute.created',
            'invoice.payment_failed', 'something.unknown',
        ];

        foreach ($types as $type) {
            $intent = BillingIntent::forEvent($this->event($type, $this->session(['status' => 'active'])));
            $this->assertArrayHasKey('action', $intent, $type);
            $this->assertArrayHasKey('reason', $intent, $type);
            $this->assertNotSame('', $intent['reason'], $type);
        }
    }
}
