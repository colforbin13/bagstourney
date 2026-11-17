<?php
// tests/SponsorImageTest.php

use PHPUnit\Framework\TestCase;

/**
 * Covers api/lib/SponsorImage.php, the only thing between an organizer's upload and a public
 * page. The type must come from the bytes (not the claimed type or the file name), SVG and
 * other documents must never get through, and a link must never be anything but http(s).
 */
final class SponsorImageTest extends TestCase
{
    // 1x1 images, the smallest real files of each allowed type.
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const WEBP = 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

    public function testAcceptsEachAllowedType(): void
    {
        foreach (['image/png' => self::PNG, 'image/jpeg' => self::JPEG, 'image/webp' => self::WEBP] as $mime => $b64) {
            $img = SponsorImage::decode($b64);
            $this->assertIsArray($img, $mime);
            $this->assertSame($mime, $img['mime']);
            $this->assertSame([1, 1], [$img['width'], $img['height']]);
        }
    }

    public function testAcceptsADataUrl(): void
    {
        $this->assertIsArray(SponsorImage::decode('data:image/png;base64,' . self::PNG));
    }

    public function testTheTypeComesFromTheBytesNotTheClaim(): void
    {
        // A PNG labelled as JPEG is still a PNG.
        $img = SponsorImage::decode('data:image/jpeg;base64,' . self::PNG);
        $this->assertSame('image/png', $img['mime']);
    }

    public function testRefusesSvg(): void
    {
        $svg = base64_encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        $this->assertIsString(SponsorImage::decode('data:image/svg+xml;base64,' . $svg));
    }

    public function testRefusesHtmlDressedAsAnImage(): void
    {
        $this->assertIsString(SponsorImage::decode(base64_encode('<html><script>alert(1)</script></html>')));
    }

    public function testRefusesAFileWithTheRightMagicBytesButNoImage(): void
    {
        // PNG signature, then junk: the header passes, the image doesn't.
        $this->assertIsString(SponsorImage::decode(base64_encode("\x89PNG\r\n\x1a\n" . str_repeat('x', 64))));
    }

    public function testRefusesAnythingOverTheSizeLimit(): void
    {
        $big = base64_decode(self::PNG) . str_repeat("\0", SponsorImage::MAX_BYTES);
        $this->assertStringContainsString('1 MB', SponsorImage::decode(base64_encode($big)));
    }

    public function testRefusesEmptyOrBrokenInput(): void
    {
        $this->assertIsString(SponsorImage::decode(''));
        $this->assertIsString(SponsorImage::decode(null));
        $this->assertIsString(SponsorImage::decode('not base64!!'));
    }

    public function testTidiesAndRequiresAName(): void
    {
        $this->assertSame("Joe's Pub", SponsorImage::normalizeName("  Joe's   Pub "));
        $this->assertIsArray(SponsorImage::normalizeName('   '));
        $this->assertIsArray(SponsorImage::normalizeName(str_repeat('x', SponsorImage::MAX_NAME + 1)));
    }

    public function testALinkIsOptional(): void
    {
        $this->assertNull(SponsorImage::normalizeUrl(null));
        $this->assertNull(SponsorImage::normalizeUrl('  '));
    }

    public function testKeepsAWebAddress(): void
    {
        $this->assertSame('https://joespub.com/menu', SponsorImage::normalizeUrl('https://joespub.com/menu'));
        $this->assertSame('http://joespub.com', SponsorImage::normalizeUrl('http://joespub.com'));
    }

    public function testAddsHttpsToABareDomain(): void
    {
        $this->assertSame('https://joespub.com', SponsorImage::normalizeUrl('joespub.com'));
    }

    public function testRefusesAnythingButAWebLink(): void
    {
        foreach (['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://joespub.com',
                  'mailto:joe@joespub.com', 'https://localhost', 'joe s pub', 'https://'] as $bad) {
            $this->assertIsArray(SponsorImage::normalizeUrl($bad), $bad);
        }
    }
}
