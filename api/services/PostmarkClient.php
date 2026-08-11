<?php
// api/services/PostmarkClient.php
//
// Minimal wrapper around Postmark's single-email send endpoint. No SDK dependency —
// just curl, matching the rest of this codebase's no-external-library approach.

class PostmarkClient {
    private $apiToken;
    private $fromEmail;
    private $messageStream;

    public function __construct(string $apiToken, string $fromEmail, string $messageStream) {
        $this->apiToken = $apiToken;
        $this->fromEmail = $fromEmail;
        $this->messageStream = $messageStream;
    }

    public function isConfigured(): bool {
        return $this->apiToken !== '' && $this->fromEmail !== '';
    }

    /**
     * Sends one email. Returns ['success' => bool, 'message_id' => ?string, 'error' => ?string].
     */
    public function send(string $toEmail, string $subject, string $htmlBody, string $textBody, string $tag): array {
        if (!$this->isConfigured()) {
            return ['success' => false, 'message_id' => null, 'error' => 'Postmark is not configured'];
        }

        $payload = json_encode([
            'From' => $this->fromEmail,
            'To' => $toEmail,
            'Subject' => $subject,
            'HtmlBody' => $htmlBody,
            'TextBody' => $textBody,
            'MessageStream' => $this->messageStream,
            'Tag' => $tag,
        ]);

        $ch = curl_init('https://api.postmarkapp.com/email');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Content-Type: application/json',
                'X-Postmark-Server-Token: ' . $this->apiToken,
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);

        $responseBody = curl_exec($ch);
        $curlError = curl_error($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($responseBody === false) {
            return ['success' => false, 'message_id' => null, 'error' => 'cURL error: ' . $curlError];
        }

        $response = json_decode($responseBody, true);

        if ($statusCode !== 200) {
            $message = is_array($response) && isset($response['Message']) ? $response['Message'] : $responseBody;
            return ['success' => false, 'message_id' => null, 'error' => "HTTP {$statusCode}: {$message}"];
        }

        return ['success' => true, 'message_id' => $response['MessageID'] ?? null, 'error' => null];
    }
}

?>
