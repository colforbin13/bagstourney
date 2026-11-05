<?php
// tests/StripeSignatureTest.php

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Covers the whole security boundary of the Stripe webhook endpoint.
 *
 * /billing/webhook is public and unauthenticated — Stripe cannot present a token — so this
 * HMAC is the only thing between a forged POST and a granted paid plan. Every test below
 * is an attack the verifier has to refuse, not a nicety: a pass here that should have
 * failed means anyone who can reach the URL can upgrade any account for free.
 *
 * Validated by mutation, per AGENTS.md: dropping the timestamp-tolerance check, swapping
 * hash_equals for ===, signing the payload without the "t." prefix, or accepting a
 * signature under any secret each fails at least one of these.
 */
final class StripeSignatureTest extends TestCase
{
    private const SECRET = 'whsec_test_2ULkNvKgQ4WzC1nT8bRmX7pJ';
    private const PAYLOAD = '{"id":"evt_1","type":"checkout.session.completed","data":{"object":{"id":"cs_test_1"}}}';
    private const NOW = 1_757_000_000;

    /** Builds the header exactly as Stripe does, so a passing test proves the real format. */
    private function header(string $payload, string $secret, int $timestamp): string
    {
        $signature = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
        return "t={$timestamp},v1={$signature}";
    }

    public function testAcceptsAGenuineSignature(): void
    {
        $header = $this->header(self::PAYLOAD, self::SECRET, self::NOW);
        $result = StripeSignature::verify(self::PAYLOAD, $header, self::SECRET, 300, self::NOW);

        $this->assertTrue($result['valid']);
        $this->assertNull($result['error']);
    }

    public function testRejectsATamperedPayload(): void
    {
        // The exact attack the signature exists to stop: a real captured event with the
        // amount, or here the session id, edited before replay.
        $header = $this->header(self::PAYLOAD, self::SECRET, self::NOW);
        $tampered = str_replace('cs_test_1', 'cs_test_attacker', self::PAYLOAD);

        $result = StripeSignature::verify($tampered, $header, self::SECRET, 300, self::NOW);
        $this->assertFalse($result['valid']);
    }

    public function testRejectsASignatureMadeWithADifferentSecret(): void
    {
        $header = $this->header(self::PAYLOAD, 'whsec_someone_elses_secret', self::NOW);

        $result = StripeSignature::verify(self::PAYLOAD, $header, self::SECRET, 300, self::NOW);
        $this->assertFalse($result['valid']);
    }

    public function testRejectsAnExpiredSignature(): void
    {
        // A signature captured from a genuine delivery stays cryptographically valid
        // forever; only the timestamp window stops it being replayed tomorrow.
        $header = $this->header(self::PAYLOAD, self::SECRET, self::NOW - 3600);

        $result = StripeSignature::verify(self::PAYLOAD, $header, self::SECRET, 300, self::NOW);
        $this->assertFalse($result['valid']);
        $this->assertSame('Signature timestamp outside tolerance', $result['error']);
    }

    public function testRejectsASignatureFromTheFuture(): void
    {
        // Symmetry matters: accepting a far-future timestamp would hand an attacker who
        // once obtained a signing secret a signature valid indefinitely.
        $header = $this->header(self::PAYLOAD, self::SECRET, self::NOW + 3600);

        $result = StripeSignature::verify(self::PAYLOAD, $header, self::SECRET, 300, self::NOW);
        $this->assertFalse($result['valid']);
        $this->assertSame('Signature timestamp outside tolerance', $result['error']);
    }

    public function testAcceptsASignatureInsideTheToleranceWindow(): void
    {
        $header = $this->header(self::PAYLOAD, self::SECRET, self::NOW - 299);

        $result = StripeSignature::verify(self::PAYLOAD, $header, self::SECRET, 300, self::NOW);
        $this->assertTrue($result['valid']);
    }

    public function testAcceptsAnyOneOfSeveralSignatures(): void
    {
        // Stripe sends two v1 values while a signing secret is being rotated in the
        // dashboard. Refusing the second would break the rotation window.
        $old = hash_hmac('sha256', self::NOW . '.' . self::PAYLOAD, 'whsec_the_old_secret');
        $new = hash_hmac('sha256', self::NOW . '.' . self::PAYLOAD, self::SECRET);
        $header = 't=' . self::NOW . ',v1=' . $old . ',v1=' . $new;

        $result = StripeSignature::verify(self::PAYLOAD, $header, self::SECRET, 300, self::NOW);
        $this->assertTrue($result['valid']);
    }

    public function testIgnoresNonV1Schemes(): void
    {
        // v0 signatures appear on Connect payloads and are not ours to check; a header
        // carrying only those must not be mistaken for a valid one.
        $header = 't=' . self::NOW . ',v0=' . str_repeat('a', 64);

        $result = StripeSignature::verify(self::PAYLOAD, $header, self::SECRET, 300, self::NOW);
        $this->assertFalse($result['valid']);
        $this->assertSame('Signature header has no v1 signature', $result['error']);
    }

    public function testRejectsAnEmptySigningSecret(): void
    {
        // The dangerous misconfiguration: an unset secret must never make verification
        // vacuously succeed, because that is the state a fresh deploy starts in.
        $header = $this->header(self::PAYLOAD, '', self::NOW);

        $result = StripeSignature::verify(self::PAYLOAD, $header, '', 300, self::NOW);
        $this->assertFalse($result['valid']);
        $this->assertSame('No webhook signing secret configured', $result['error']);
    }

    #[DataProvider('malformedHeaders')]
    public function testRejectsMalformedHeaders(string $header): void
    {
        $result = StripeSignature::verify(self::PAYLOAD, $header, self::SECRET, 300, self::NOW);
        $this->assertFalse($result['valid'], "Should have rejected: {$header}");
    }

    public static function malformedHeaders(): array
    {
        $signature = hash_hmac('sha256', self::NOW . '.' . self::PAYLOAD, self::SECRET);

        return [
            'empty' => [''],
            'no timestamp' => ['v1=' . $signature],
            'non-numeric timestamp' => ['t=not-a-number,v1=' . $signature],
            // The timestamp is deliberately one that WOULD be in tolerance if it were cast
            // rather than validated, and the signature is genuinely correct for its numeric
            // part — so a loose (int) parse accepts this header outright. An earlier version
            // of this case used "t=123abc", which a loose parse also rejected, but only
            // because 123 is far outside the tolerance window; it therefore passed against
            // the broken implementation too and proved nothing.
            'trailing junk on the timestamp' => ['t=' . self::NOW . 'abc,v1=' . $signature],
            'no signature value' => ['t=' . self::NOW . ',v1='],
            'not key=value at all' => ['garbage'],
            'timestamp only' => ['t=' . self::NOW],
        ];
    }

    public function testToleratesWhitespaceAroundHeaderParts(): void
    {
        // Proxies and some test tooling re-space header values; the signature is still good.
        $signature = hash_hmac('sha256', self::NOW . '.' . self::PAYLOAD, self::SECRET);
        $header = 't = ' . self::NOW . ' , v1 = ' . $signature;

        $result = StripeSignature::verify(self::PAYLOAD, $header, self::SECRET, 300, self::NOW);
        $this->assertTrue($result['valid']);
    }

    public function testSignatureIsOverTimestampAndPayloadTogether(): void
    {
        // Signing only the body would let an attacker replay a captured signature under any
        // timestamp they liked, defeating the expiry check entirely.
        $bodyOnly = hash_hmac('sha256', self::PAYLOAD, self::SECRET);
        $header = 't=' . self::NOW . ',v1=' . $bodyOnly;

        $result = StripeSignature::verify(self::PAYLOAD, $header, self::SECRET, 300, self::NOW);
        $this->assertFalse($result['valid']);
    }

    public function testByteForByteBodyMatters(): void
    {
        // Why index.php keeps the raw string: json_decode + json_encode round-trips to
        // equivalent JSON with different whitespace, and that must not verify. This is the
        // mistake that would otherwise be found only in production.
        $header = $this->header(self::PAYLOAD, self::SECRET, self::NOW);
        $reencoded = json_encode(json_decode(self::PAYLOAD, true), JSON_PRETTY_PRINT);

        $result = StripeSignature::verify($reencoded, $header, self::SECRET, 300, self::NOW);
        $this->assertFalse($result['valid']);
    }

    public function testParseHeaderExposesItsParts(): void
    {
        $parsed = StripeSignature::parseHeader('t=1757000000,v1=aaa,v0=bbb,v1=ccc');

        $this->assertSame(1_757_000_000, $parsed['timestamp']);
        $this->assertSame(['aaa', 'ccc'], $parsed['signatures']);
    }
}
