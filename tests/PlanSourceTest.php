<?php
// tests/PlanSourceTest.php

use PHPUnit\Framework\TestCase;

// Stand-ins for the middleware and config the controllers below expect. The real
// api/middleware/auth.php cannot be loaded here: it pulls in api/config/database.php, and
// nothing in tests/ may touch credentials. These carry no logic that is under test.
if (!function_exists('writeAuditLog')) {
    function writeAuditLog(...$args): void {}
}
if (!function_exists('requireSuperAdmin')) {
    function requireSuperAdmin(PDO $db): array {
        return ['id' => 1, 'role' => 'super_admin'];
    }
}
if (!function_exists('tournamentCapabilities')) {
    function tournamentCapabilities(PDO $db, int $tournamentId, ?array $user): array {
        return [];
    }
}
foreach (['STRIPE_SECRET_KEY', 'STRIPE_API_VERSION'] as $name) {
    if (!defined($name)) {
        define($name, '');
    }
}

require_once __DIR__ . '/../api/controllers/BillingController.php';
require_once __DIR__ . '/../api/controllers/UserController.php';
require_once __DIR__ . '/../api/controllers/TournamentController.php';

/**
 * Guards the billing invariant that Stripe may only revoke what Stripe granted.
 *
 * users.plan_source and tournaments.paid_override_source record who made a grant, and a
 * cancellation or refund only undoes a grant marked 'stripe'. That only holds if every
 * writer keeps the marker honest, and two did not:
 *
 *   - The super-admin levers (UserController::update(), TournamentController::update())
 *     changed the flag and left the marker alone, so a grant made by hand on a row Stripe
 *     had once touched was still recorded as Stripe's — and a later refund or cancellation
 *     took it away.
 *   - A subscription grant overwrote the marker unconditionally, so a comped account that
 *     subscribed anyway lost the comp when that subscription ended.
 *
 * The state is read back after it is written, across three controllers, so this uses an
 * in-memory SQLite database like MatchCascadeTest. The schema is a hand-kept mirror of the
 * columns these paths touch (migrations 013 and 017).
 *
 * One engine difference matters: within a single UPDATE, MySQL lets a later assignment see
 * an earlier one's result and SQLite does not. The grants are written source-first so both
 * engines read the *old* flag, which is the only order that is correct on MySQL.
 */
final class PlanSourceTest extends TestCase
{
    private const ADMIN = ['id' => 1, 'role' => 'super_admin'];
    private const USER_ID = 7;
    private const TOURNAMENT_ID = 3;
    private const CUSTOMER = 'cus_test';
    private const SUBSCRIPTION = 'sub_test';
    private const PAYMENT = 'pi_test';

    private PDO $db;
    private BillingController $billing;

    protected function setUp(): void
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('pdo_sqlite is not loaded; run via run-php-tests.ps1');
        }

        $this->db = new PDO('sqlite::memory:');
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        $this->db->exec("
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                username TEXT, email TEXT,
                role TEXT NOT NULL DEFAULT 'organizer',
                status TEXT NOT NULL DEFAULT 'active',
                plan TEXT NOT NULL DEFAULT 'free',
                plan_source TEXT NOT NULL DEFAULT 'manual',
                stripe_customer_id TEXT,
                stripe_subscription_id TEXT,
                plan_expires_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ");
        $this->db->exec("
            CREATE TABLE tournaments (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'setup',
                visibility TEXT NOT NULL DEFAULT 'public',
                deleted_at TEXT,
                created_by_user_id INTEGER,
                paid_override INTEGER NOT NULL DEFAULT 0,
                paid_override_source TEXT NOT NULL DEFAULT 'manual'
            )
        ");
        $this->db->exec("
            CREATE TABLE billing_checkouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                tournament_id INTEGER,
                stripe_payment_intent_id TEXT,
                status TEXT NOT NULL DEFAULT 'open'
            )
        ");

        $this->db->prepare('INSERT INTO users (id, username, email, stripe_customer_id) VALUES (?, ?, ?, ?)')
            ->execute([self::USER_ID, 'organizer1', 'organizer1@example.com', self::CUSTOMER]);
        $this->db->prepare('INSERT INTO tournaments (id, name, created_by_user_id) VALUES (?, ?, ?)')
            ->execute([self::TOURNAMENT_ID, 'Verification', self::USER_ID]);
        $this->db->prepare("
            INSERT INTO billing_checkouts (kind, user_id, tournament_id, stripe_payment_intent_id, status)
            VALUES ('tournament_unlock', ?, ?, ?, 'paid')
        ")->execute([self::USER_ID, self::TOURNAMENT_ID, self::PAYMENT]);

        $this->billing = new BillingController($this->db);
    }

    // ------------------------------------------------------------------------- helpers

    private function billing(string $method, array $args)
    {
        $reflection = new ReflectionMethod(BillingController::class, $method);
        return $reflection->invokeArgs($this->billing, $args);
    }

    /** A customer.subscription.* event, as BillingIntent hands it to syncSubscription(). */
    private function subscriptionEvent(bool $active): void
    {
        $this->billing('syncSubscription', [[
            'customer_id' => self::CUSTOMER,
            'subscription_id' => self::SUBSCRIPTION,
            'grant' => $active,
            'status' => $active ? 'active' : 'canceled',
            'current_period_end' => null,
        ]]);
    }

    private function stripeUnlocksTournament(): void
    {
        $this->billing('grantTournamentUnlock', [self::TOURNAMENT_ID]);
    }

    private function refund(): void
    {
        $this->billing('reversePayment', [[
            'payment_intent_id' => self::PAYMENT,
            'reversal' => 'refund',
        ]]);
    }

    /** The super admin's plan dropdown on the Users screen. */
    private function adminSetsPlan(string $plan): void
    {
        ob_start();
        (new UserController($this->db))->update(self::USER_ID, ['plan' => $plan]);
        ob_end_clean();
    }

    /** The super admin's "Grant / Remove plan override" button on a tournament. */
    private function adminSetsOverride(bool $on): void
    {
        ob_start();
        (new TournamentController($this->db))->update(self::TOURNAMENT_ID, ['paid_override' => $on], self::ADMIN);
        ob_end_clean();
    }

    private function user(): array
    {
        return $this->db->query('SELECT plan, plan_source FROM users WHERE id = ' . self::USER_ID)->fetch();
    }

    private function tournament(): array
    {
        return $this->db->query('SELECT paid_override, paid_override_source FROM tournaments WHERE id = ' . self::TOURNAMENT_ID)->fetch();
    }

    // --------------------------------------------------------------------- tournaments

    public function testRefundClearsAnUnlockStripeGranted(): void
    {
        $this->stripeUnlocksTournament();
        $this->assertSame(['paid_override' => 1, 'paid_override_source' => 'stripe'], $this->tournament());

        $this->refund();

        $this->assertSame(0, $this->tournament()['paid_override']);
    }

    public function testRefundLeavesAnOverrideGrantedByHandBeforeThePurchase(): void
    {
        $this->adminSetsOverride(true);
        $this->stripeUnlocksTournament();

        $this->refund();

        $this->assertSame(1, $this->tournament()['paid_override']);
    }

    public function testRefundLeavesAnOverrideASuperAdminGrantedAfterRemovingThePurchasedOne(): void
    {
        $this->stripeUnlocksTournament();
        $this->adminSetsOverride(false);
        $this->adminSetsOverride(true);
        $this->assertSame('manual', $this->tournament()['paid_override_source']);

        $this->refund();

        $this->assertSame(1, $this->tournament()['paid_override'], 'a refund revoked a grant a super admin made by hand');
    }

    // ------------------------------------------------------------------------ accounts

    public function testCancellationRevokesAPlanStripeGranted(): void
    {
        $this->subscriptionEvent(true);
        $this->assertSame(['plan' => 'paid', 'plan_source' => 'stripe'], $this->user());

        $this->subscriptionEvent(false);

        $this->assertSame(['plan' => 'free', 'plan_source' => 'manual'], $this->user());
    }

    public function testCancellationLeavesACompedAccountThatSubscribedAnyway(): void
    {
        $this->adminSetsPlan('paid');
        $this->subscriptionEvent(true);
        $this->assertSame('manual', $this->user()['plan_source']);

        $this->subscriptionEvent(false);

        $this->assertSame('paid', $this->user()['plan'], 'a cancellation revoked a comped account');
    }

    public function testCancellationLeavesAPlanASuperAdminSetByHandOnASubscriber(): void
    {
        $this->subscriptionEvent(true);
        $this->adminSetsPlan('free');
        $this->adminSetsPlan('paid');
        $this->assertSame('manual', $this->user()['plan_source']);

        // A renewal lands before the cancellation; it must not hand the grant back to Stripe.
        $this->subscriptionEvent(true);
        $this->subscriptionEvent(false);

        $this->assertSame('paid', $this->user()['plan'], 'a cancellation revoked a plan a super admin set by hand');
    }

    public function testASubscriberDowngradedByHandIsRestoredByStripeAndStillRevocable(): void
    {
        // Setting a paying subscriber to free by hand does not cancel anything at Stripe, so
        // the next subscription event restores the plan — as Stripe's grant, not a comp.
        $this->subscriptionEvent(true);
        $this->adminSetsPlan('free');

        $this->subscriptionEvent(true);
        $this->assertSame(['plan' => 'paid', 'plan_source' => 'stripe'], $this->user());

        $this->subscriptionEvent(false);
        $this->assertSame('free', $this->user()['plan']);
    }
}
