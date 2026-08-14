<?php
// api/services/BrevoClient.php
//
// Minimal wrapper around Brevo's transactional send endpoint, used for bulk notification
// mail (api/scripts/send_notifications.php). Auth mail stays on Postmark — see
// api/services/PostmarkClient.php. No SDK dependency, just curl, matching the rest of
// this codebase's no-external-library approach.
//
// One meaningful difference from PostmarkClient: Brevo's free tier caps sending at 300
// emails/day (shared between transactional and marketing sends) and answers 429 once that
// is exhausted, so send() also reports how long to wait via 'retry_after'. The worker
// parks that row rather than spending one of its finite retries on a limit that will
// clear on its own.

class BrevoClient {
    // Used when a 429 arrives without a usable reset header — long enough not to hammer a
    // limit that may not reset until midnight, short enough to recover the same day.
    const DEFAULT_RETRY_AFTER = 3600;

    private $apiKey;
    private $fromEmail;
    private $fromName;

    public function __construct(string $apiKey, string $fromEmail, string $fromName) {
        $this->apiKey = $apiKey;
        $this->fromEmail = $fromEmail;
        $this->fromName = $fromName;
    }

    public function isConfigured(): bool {
        return $this->apiKey !== '' && $this->fromEmail !== '';
    }

    /**
     * Sends one email. Returns
     * ['success' => bool, 'message_id' => ?string, 'error' => ?string, 'retry_after' => ?int].
     *
     * 'retry_after' is set only when the send failed against a rate/quota limit; it is the
     * number of seconds to wait before retrying this row, and signals the caller to park
     * rather than count the attempt.
     */
    public function send(string $toEmail, string $subject, string $htmlBody, string $textBody, string $tag): array {
        if (!$this->isConfigured()) {
            return ['success' => false, 'message_id' => null, 'error' => 'Brevo is not configured', 'retry_after' => null];
        }

        $payload = json_encode([
            'sender' => ['email' => $this->fromEmail, 'name' => $this->fromName],
            'to' => [['email' => $toEmail]],
            'subject' => $subject,
            'htmlContent' => $htmlBody,
            'textContent' => $textBody,
            'tags' => [$tag],
        ]);

        // Brevo reports the remaining wait on a limited response in a header rather than
        // the body, so capture it as the response streams in.
        $retryAfter = null;

        $ch = curl_init('https://api.brevo.com/v3/smtp/email');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Content-Type: application/json',
                'api-key: ' . $this->apiKey,
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HEADERFUNCTION => function ($curlHandle, $header) use (&$retryAfter) {
                $parts = explode(':', $header, 2);
                if (count($parts) === 2) {
                    $name = strtolower(trim($parts[0]));
                    if ($name === 'x-sib-ratelimit-reset' || $name === 'retry-after') {
                        $value = (int)trim($parts[1]);
                        if ($value > 0) {
                            $retryAfter = $value;
                        }
                    }
                }
                // curl requires the byte count of the header it just handed us.
                return strlen($header);
            },
        ]);

        $responseBody = curl_exec($ch);
        $curlError = curl_error($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($responseBody === false) {
            return ['success' => false, 'message_id' => null, 'error' => 'cURL error: ' . $curlError, 'retry_after' => null];
        }

        $response = json_decode($responseBody, true);

        // Brevo answers 201 Created on a successful send, not 200 like Postmark.
        if ($statusCode === 201 || $statusCode === 200) {
            return [
                'success' => true,
                'message_id' => isset($response['messageId']) ? $response['messageId'] : null,
                'error' => null,
                'retry_after' => null,
            ];
        }

        $message = is_array($response) && isset($response['message']) ? $response['message'] : $responseBody;

        if ($statusCode === 429) {
            return [
                'success' => false,
                'message_id' => null,
                'error' => "HTTP 429 (rate/quota limit): {$message}",
                'retry_after' => $retryAfter ?: self::DEFAULT_RETRY_AFTER,
            ];
        }

        return ['success' => false, 'message_id' => null, 'error' => "HTTP {$statusCode}: {$message}", 'retry_after' => null];
    }
}

?>
