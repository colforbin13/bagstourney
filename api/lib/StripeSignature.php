<?php
// api/lib/StripeSignature.php
//
// Verification of Stripe's `Stripe-Signature` webhook header. Pure — no PDO, no network,
// no globals — so it is unit tested in tests/StripeSignatureTest.php.
//
// This is the whole security boundary of the webhook endpoint. The endpoint is public and
// unauthenticated by necessity (Stripe cannot hold a session), so the only thing standing
// between a forged POST and a granted paid plan is this HMAC. It is deliberately the one
// piece of the billing integration extracted into api/lib/ with its own test battery: see
// AGENTS.md's rule that logic worth testing lives here and the controller stays thin.
//
// The header looks like:
//     t=1614556800,v1=5257a869e7...,v1=e2f5b4c1a3...
// where the signed payload is the literal string "<t>.<raw request body>" and each v1 is
// hex HMAC-SHA256 of that string under the endpoint's signing secret (whsec_...). More
// than one v1 appears while a secret is being rotated in the Stripe dashboard, so any
// single match is enough. Unknown schemes (v0, used only for Connect) are ignored.

final class StripeSignature {
    // Stripe's own libraries default to 5 minutes. The timestamp check is what stops a
    // captured-and-replayed request from being accepted forever; it is not optional.
    const DEFAULT_TOLERANCE_SECONDS = 300;

    /**
     * Returns ['valid' => bool, 'error' => ?string]. The error string is for the server
     * log only — never echo it to the caller, since it describes exactly which check a
     * forgery attempt failed.
     *
     * $payload MUST be the raw request body, byte for byte. Re-encoding a decoded array
     * changes key order and whitespace and will never match.
     */
    public static function verify(
        string $payload,
        string $header,
        string $secret,
        int $tolerance = self::DEFAULT_TOLERANCE_SECONDS,
        ?int $now = null
    ): array {
        if ($secret === '') {
            return ['valid' => false, 'error' => 'No webhook signing secret configured'];
        }

        $parsed = self::parseHeader($header);
        if ($parsed['timestamp'] === null) {
            return ['valid' => false, 'error' => 'Signature header has no timestamp'];
        }
        if (!$parsed['signatures']) {
            return ['valid' => false, 'error' => 'Signature header has no v1 signature'];
        }

        $now = $now ?? time();
        // Absolute difference, not just "too old": a timestamp far in the future is as much
        // a sign of a forged header as a stale one, and accepting it would hand an attacker
        // a signature that stays valid indefinitely.
        if ($tolerance > 0 && abs($now - $parsed['timestamp']) > $tolerance) {
            return ['valid' => false, 'error' => 'Signature timestamp outside tolerance'];
        }

        $expected = hash_hmac('sha256', $parsed['timestamp'] . '.' . $payload, $secret);

        foreach ($parsed['signatures'] as $candidate) {
            // hash_equals, not ===: string comparison short-circuits on the first differing
            // byte, which leaks the correct prefix to an attacker timing the responses.
            if (hash_equals($expected, $candidate)) {
                return ['valid' => true, 'error' => null];
            }
        }

        return ['valid' => false, 'error' => 'No signature matched the signing secret'];
    }

    /**
     * Splits the header into its timestamp and its v1 signatures.
     * Returns ['timestamp' => ?int, 'signatures' => string[]].
     */
    public static function parseHeader(string $header): array {
        $timestamp = null;
        $signatures = [];

        foreach (explode(',', $header) as $part) {
            $pair = explode('=', trim($part), 2);
            if (count($pair) !== 2) {
                continue;
            }
            [$key, $value] = [trim($pair[0]), trim($pair[1])];

            if ($key === 't') {
                // ctype_digit rather than (int): "abc" would cast to 0, which is a valid
                // -looking timestamp that the tolerance check would then reject for the
                // wrong reason, and a leading-numeric "123abc" would silently truncate.
                $timestamp = ctype_digit($value) ? (int)$value : null;
            } elseif ($key === 'v1' && $value !== '') {
                $signatures[] = $value;
            }
        }

        return ['timestamp' => $timestamp, 'signatures' => $signatures];
    }
}
