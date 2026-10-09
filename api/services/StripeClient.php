<?php
// api/services/StripeClient.php
//
// Minimal wrapper around the three Stripe REST endpoints this integration needs, using
// curl and no SDK — matching PostmarkClient/BrevoClient and the rest of the codebase's
// no-external-library approach. Raised and decided deliberately (AGENTS.md asks for that
// before adding Composer): with hosted Checkout, no card data ever reaches this server, so
// there is no PCI surface to get wrong, and the one security-critical piece — webhook
// signature verification — is extracted into api/lib/StripeSignature.php with its own
// unit tests rather than being trusted to a dependency.
//
// Everything here speaks Stripe's form-encoded request format and JSON responses. Every
// method returns ['success' => bool, 'data' => ?array, 'error' => ?string] so a caller
// never has to catch anything to handle a declined or misconfigured request.

class StripeClient {
    const API_BASE = 'https://api.stripe.com/v1';
    const TIMEOUT_SECONDS = 20;

    public function __construct(
        private readonly string $secretKey,
        // Empty means "use whatever API version this Stripe account defaults to", which is
        // the safe default: a pin to a version the account has not been migrated to would
        // break every call at once. Set it in config only to deliberately freeze the
        // response shape. BillingIntent already reads both the old and new shape of
        // current_period_end, so an unpinned account upgrading under us is handled.
        private readonly string $apiVersion = '',
    ) {}

    public function isConfigured(): bool {
        return $this->secretKey !== '';
    }

    /**
     * True when the configured key is a test-mode key. Surfaced to super admins in the
     * billing status endpoint, because "why did my real card not get charged" is otherwise
     * a genuinely confusing half hour.
     */
    public function isTestMode(): bool {
        return str_starts_with($this->secretKey, 'sk_test_') || str_starts_with($this->secretKey, 'rk_test_');
    }

    /**
     * Finds or creates the Stripe Customer for an organizer. Done explicitly rather than
     * letting Checkout create one implicitly: mode=payment sessions do not create a
     * customer by default, and without a stable customer id we could neither open the
     * billing portal nor map an incoming subscription event back to a user.
     */
    public function createCustomer(string $email, string $name, array $metadata = []): array {
        return $this->post('/customers', [
            'email' => $email,
            'name' => $name,
            'metadata' => $metadata,
        ]);
    }

    public function retrieveCustomer(string $customerId): array {
        return $this->get('/customers/' . urlencode($customerId));
    }

    /**
     * Creates a hosted Checkout Session. $params is passed through to Stripe as-is, so the
     * caller owns the difference between a one-time unlock and a subscription — see
     * BillingController, which builds both.
     *
     * $idempotencyKey makes a retried or double-clicked request return the *same* session
     * instead of creating a second one. Stripe honours it for 24 hours.
     */
    public function createCheckoutSession(array $params, string $idempotencyKey): array {
        return $this->post('/checkout/sessions', $params, $idempotencyKey);
    }

    /**
     * Reads a session back. Used by the post-payment return page so a paid organizer sees
     * their plan unlocked immediately rather than waiting on webhook delivery — Stripe
     * itself recommends handling both paths, since the redirect and the webhook race and
     * either can win.
     */
    public function retrieveCheckoutSession(string $sessionId): array {
        return $this->get('/checkout/sessions/' . urlencode($sessionId));
    }

    /**
     * Opens Stripe's hosted billing portal, where an organizer updates their card or
     * cancels. Deliberately not rebuilt in our own UI: cancellation, proration and invoice
     * history are Stripe's job, and every screen we do not write is a screen that cannot
     * disagree with what Stripe actually did.
     */
    public function createBillingPortalSession(string $customerId, string $returnUrl): array {
        return $this->post('/billing_portal/sessions', [
            'customer' => $customerId,
            'return_url' => $returnUrl,
        ]);
    }

    public function retrieveSubscription(string $subscriptionId): array {
        return $this->get('/subscriptions/' . urlencode($subscriptionId));
    }

    /**
     * Reads a Price so the upgrade screen can show what something costs. Fetched rather
     * than duplicated into our config on purpose: an amount stored here is an amount that
     * can silently disagree with what the customer is actually charged.
     */
    public function retrievePrice(string $priceId): array {
        return $this->get('/prices/' . urlencode($priceId));
    }

    // ----------------------------------------------------------------------------------
    // Transport
    // ----------------------------------------------------------------------------------

    private function get(string $path): array {
        return $this->request('GET', $path, null, null);
    }

    private function post(string $path, array $params, ?string $idempotencyKey = null): array {
        return $this->request('POST', $path, $params, $idempotencyKey);
    }

    private function request(string $method, string $path, ?array $params, ?string $idempotencyKey): array {
        if (!$this->isConfigured()) {
            return ['success' => false, 'data' => null, 'error' => 'Stripe is not configured'];
        }

        $headers = [
            'Authorization: Bearer ' . $this->secretKey,
            'Content-Type: application/x-www-form-urlencoded',
        ];
        if ($this->apiVersion !== '') {
            $headers[] = 'Stripe-Version: ' . $this->apiVersion;
        }
        if ($idempotencyKey !== null && $idempotencyKey !== '') {
            $headers[] = 'Idempotency-Key: ' . $idempotencyKey;
        }

        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => self::TIMEOUT_SECONDS,
            CURLOPT_HTTPHEADER => $headers,
        ];
        if ($method === 'POST') {
            $options[CURLOPT_POST] = true;
            $options[CURLOPT_POSTFIELDS] = self::formEncode($params ?? []);
        }

        // One retry, and only for a failure that could not have been applied: a connection
        // that never completed, or a 5xx. Both carry the same Idempotency-Key, so even a
        // request Stripe did process before the connection dropped cannot be applied twice.
        $attempts = 0;
        do {
            $attempts++;
            $ch = curl_init(self::API_BASE . $path);
            curl_setopt_array($ch, $options);
            $responseBody = curl_exec($ch);
            $curlError = curl_error($ch);
            $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            $shouldRetry = ($responseBody === false || $statusCode >= 500) && $attempts < 2;
        } while ($shouldRetry);

        if ($responseBody === false) {
            return ['success' => false, 'data' => null, 'error' => 'cURL error: ' . $curlError];
        }

        $decoded = json_decode($responseBody, true);
        if (!is_array($decoded)) {
            return ['success' => false, 'data' => null, 'error' => "HTTP {$statusCode}: unparseable response from Stripe"];
        }

        if ($statusCode >= 200 && $statusCode < 300) {
            return ['success' => true, 'data' => $decoded, 'error' => null];
        }

        // Stripe puts a human-readable explanation on error.message and a stable machine
        // code on error.code; log both, because the message alone often omits which
        // parameter was wrong.
        $message = $decoded['error']['message'] ?? $responseBody;
        $code = $decoded['error']['code'] ?? ($decoded['error']['type'] ?? 'unknown');
        return ['success' => false, 'data' => $decoded, 'error' => "HTTP {$statusCode} ({$code}): {$message}"];
    }

    /**
     * Stripe takes nested parameters as bracketed form fields — line_items[0][price] —
     * which is exactly http_build_query's output, so the nesting needs no hand-rolling.
     * Two adjustments it does need: PHP booleans encode as "1"/"0", which Stripe's parser
     * does not read as booleans, and nulls must be dropped rather than sent as empty
     * strings (an empty string is how you *clear* a field in Stripe's API, which is a
     * different request from not mentioning it).
     */
    public static function formEncode(array $params): string {
        return http_build_query(self::normalize($params), '', '&', PHP_QUERY_RFC3986);
    }

    private static function normalize(array $params): array {
        $out = [];
        foreach ($params as $key => $value) {
            if ($value === null) {
                continue;
            }
            if (is_bool($value)) {
                $out[$key] = $value ? 'true' : 'false';
            } elseif (is_array($value)) {
                $nested = self::normalize($value);
                // An array that normalized to nothing would otherwise emit no field at all
                // but still occupy a key; skipping it keeps the encoded output minimal.
                if ($nested !== []) {
                    $out[$key] = $nested;
                }
            } else {
                $out[$key] = $value;
            }
        }
        return $out;
    }
}
