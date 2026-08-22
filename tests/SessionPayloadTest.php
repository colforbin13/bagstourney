<?php
// tests/SessionPayloadTest.php

use PHPUnit\Framework\TestCase;

// AuthController.php pulls in PostmarkClient.php, which reads no config and opens nothing
// at load time, so the class can be required standalone. Nothing here touches a database,
// the network, or credentials.
require_once __DIR__ . '/../api/controllers/AuthController.php';

/**
 * Guards the login response payload.
 *
 * This exists because of a real bug: `plan` was added to publicUser() so the frontend could
 * unlock paid-tier UI, but the login query that feeds it was left selecting its original
 * column list. The field was therefore always absent, publicUser()'s fallback reported
 * 'free' for everyone, and no amount of flipping the flag or signing back in helped.
 *
 * The failure mode is structural — a payload field added without the query behind it — so
 * the check is structural too: every column publicUser() emits must appear in the SELECT.
 */
final class SessionPayloadTest extends TestCase
{
    /** A users row as the login query returns it. */
    private function userRow(array $over = []): array
    {
        return array_merge([
            'id' => '7',
            'username' => 'organizer1',
            'email' => 'organizer1@example.com',
            'password_hash' => 'irrelevant',
            'role' => 'organizer',
            'status' => 'active',
            'plan' => 'paid',
        ], $over);
    }

    private function publicUser(array $row): array
    {
        $controller = new AuthController($this->createMock(PDO::class));
        $method = new ReflectionMethod(AuthController::class, 'publicUser');
        return $method->invoke($controller, $row);
    }

    /** The column list from the one query that feeds publicUser(). */
    private function loginSelectColumns(): array
    {
        $source = file_get_contents(__DIR__ . '/../api/controllers/AuthController.php');
        $this->assertNotFalse($source);

        $matched = preg_match('/SELECT\s+(.+?)\s+FROM users WHERE username = \? OR email = \?/i', $source, $m);
        $this->assertSame(1, $matched, 'could not find the login query — has it been rewritten?');

        return array_map('trim', explode(',', $m[1]));
    }

    public function testPublicUserCarriesThePlanSoTheUiCanUnlockPaidFeatures(): void
    {
        $payload = $this->publicUser($this->userRow());

        $this->assertSame('paid', $payload['plan']);
        $this->assertSame(7, $payload['id'], 'id should be cast to an int');
    }

    public function testPublicUserNeverLeaksThePasswordHash(): void
    {
        $payload = $this->publicUser($this->userRow());

        $this->assertArrayNotHasKey('password_hash', $payload);
        $this->assertNotContains('irrelevant', $payload, 'no field may carry the hash');
    }

    public function testPublicUserFallsBackToFreeForARowWithoutAPlan(): void
    {
        // A legacy `admins` account migrated on first login predates the column.
        $row = $this->userRow();
        unset($row['plan']);

        $this->assertSame('free', $this->publicUser($row)['plan']);
    }

    public function testEveryFieldInTheSessionPayloadIsActuallySelected(): void
    {
        $columns = $this->loginSelectColumns();
        $payload = $this->publicUser($this->userRow());

        foreach (array_keys($payload) as $field) {
            $this->assertContains(
                $field,
                $columns,
                "publicUser() emits '{$field}' but the login query does not select it, so it "
                . 'will silently fall back to its default for every session'
            );
        }
    }
}
