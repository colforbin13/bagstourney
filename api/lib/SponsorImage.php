<?php
// api/lib/SponsorImage.php

/**
 * Sponsor logos (FEATURE_TRACKER item 20): validating what an organizer uploads.
 *
 * Pure, so the checks that stand between a public page and an uploaded file are tested
 * without a database (tests/SponsorImageTest.php). SponsorController persists and serves.
 *
 * The image type is decided from the file's own bytes, never from its name or the type the
 * browser claims, and only PNG, JPEG and WebP are allowed. SVG is refused outright: it is
 * a document that can carry script, and it would be served from the API's origin. The logo is
 * served back with exactly the type found here and `nosniff`, so a file can't pass as one type
 * and be run as another.
 *
 * The link is only ever http(s). A bare "joespub.com" gets https:// in front, which is what an
 * organizer typing it means; anything with another scheme (javascript:, data:) is refused.
 *
 * Targets PHP 8.1+, as does the rest of `api/` (see AGENTS.md).
 */
final class SponsorImage
{
    const MAX_BYTES = 1048576;           // 1 MB
    const MAX_SPONSORS = 8;              // per tournament; a TV bar still reads at this count
    const MAX_NAME = 120;
    const MAX_URL = 500;
    const MAX_SIDE = 4000;               // pixels; a bigger image is a photo, not a logo
    const PAID_MESSAGE = 'Sponsor logos are a Pro feature. Upgrade to add them.';

    /**
     * The image type from the file's magic bytes, or null if it isn't an allowed type.
     */
    public static function sniffType(string $bytes): ?string
    {
        if (strncmp($bytes, "\x89PNG\r\n\x1a\n", 8) === 0) return 'image/png';
        if (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) return 'image/jpeg';
        if (strlen($bytes) >= 12 && substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP') return 'image/webp';
        return null;
    }

    /**
     * Decodes and checks an uploaded logo: base64 (optionally a data: URL) in, the bytes, type
     * and size out, or an error message for the organizer.
     *
     * @return array{bytes: string, mime: string, width: int, height: int}|string
     */
    public static function decode(mixed $data): array|string
    {
        if (!is_string($data) || $data === '') {
            return 'Choose an image for the logo';
        }
        if (preg_match('#^data:[^,]*;base64,#', $data, $m)) {
            $data = substr($data, strlen($m[0]));
        }
        // A base64 string a third bigger than the limit can't decode to within it.
        if (strlen($data) > intdiv(self::MAX_BYTES * 4, 3) + 8) {
            return 'That image is over 1 MB. Use a smaller logo.';
        }
        $bytes = base64_decode($data, true);
        if ($bytes === false || $bytes === '') {
            return 'That file could not be read as an image';
        }
        if (strlen($bytes) > self::MAX_BYTES) {
            return 'That image is over 1 MB. Use a smaller logo.';
        }
        $mime = self::sniffType($bytes);
        if ($mime === null) {
            return 'Use a PNG, JPEG or WebP image';
        }
        $size = @getimagesizefromstring($bytes);
        if (!$size || ($size['mime'] ?? '') !== $mime || $size[0] < 1 || $size[1] < 1) {
            return 'That file could not be read as an image';
        }
        if ($size[0] > self::MAX_SIDE || $size[1] > self::MAX_SIDE) {
            return 'That image is too large. Use a logo under ' . self::MAX_SIDE . ' pixels on each side.';
        }
        return ['bytes' => $bytes, 'mime' => $mime, 'width' => (int)$size[0], 'height' => (int)$size[1]];
    }

    /** The sponsor's name, tidied, or an error message. */
    public static function normalizeName(mixed $name): string|array
    {
        $name = is_string($name) ? trim(preg_replace('/\s+/', ' ', $name)) : '';
        if ($name === '') return ['error' => "Enter the sponsor's name"];
        if (mb_strlen($name) > self::MAX_NAME) return ['error' => 'Keep the name to ' . self::MAX_NAME . ' characters'];
        return $name;
    }

    /**
     * The sponsor's link: null for none, an https/http URL, or ['error' => ...].
     *
     * @return string|null|array{error: string}
     */
    public static function normalizeUrl(mixed $url): string|null|array
    {
        if ($url === null) return null;
        if (!is_string($url)) return ['error' => 'That link is not a web address'];
        $url = trim($url);
        if ($url === '') return null;
        if (!preg_match('#^[a-z][a-z0-9+.-]*:#i', $url)) {
            $url = 'https://' . $url;
        }
        if (mb_strlen($url) > self::MAX_URL) return ['error' => 'That link is too long'];
        $parts = parse_url($url);
        $scheme = strtolower($parts['scheme'] ?? '');
        $host = $parts['host'] ?? '';
        if (!in_array($scheme, ['http', 'https'], true) || $host === '' || !str_contains($host, '.')
            || preg_match('/\s/', $url)) {
            return ['error' => 'That link is not a web address'];
        }
        return $url;
    }
}
