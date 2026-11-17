<?php
// api/controllers/SponsorController.php

/**
 * Sponsor logos (FEATURE_TRACKER item 20): a bar across the bottom of the public bracket and
 * of TV mode. Validation lives in api/lib/SponsorImage.php; this stores and serves.
 *
 * Pro only, and checked at exactly one moment: adding a logo. Editing a name or link,
 * reordering and removing stay open on any plan, and logos already up keep showing if the
 * plan lapses, so nothing about a live event changes because a subscription did.
 */
class SponsorController {
    public function __construct(private readonly PDO $db) {}

    /**
     * A tournament's sponsors for display, without the image bytes: name, link, size, and a
     * URL to fetch the logo from (relative to the API root). Used by the bracket response and
     * by GET /sponsors/{tournamentId}.
     */
    public function listFor(int $tournamentId): array {
        $stmt = $this->db->prepare(
            'SELECT id, name, url, width, height, token FROM tournament_sponsors
             WHERE tournament_id = ? ORDER BY position, id'
        );
        $stmt->execute([$tournamentId]);
        return array_map(fn(array $row) => [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'url' => $row['url'],
            'width' => (int)$row['width'],
            'height' => (int)$row['height'],
            'image_url' => "sponsors/{$row['id']}/image?t={$row['token']}",
        ], $stmt->fetchAll());
    }

    /** GET /sponsors/{tournamentId} */
    public function list(int $tournamentId): void {
        echo json_encode($this->listFor($tournamentId));
    }

    /** POST /sponsors — { tournament_id, name, url?, image (base64 or data: URL) } */
    public function create(array $body): void {
        $tournamentId = (int)($body['tournament_id'] ?? 0);
        if (!tournamentHasPaidFeatures($this->db, $tournamentId)) {
            http_response_code(403);
            echo json_encode(['error' => SponsorImage::PAID_MESSAGE]);
            return;
        }

        $name = SponsorImage::normalizeName($body['name'] ?? null);
        $url = SponsorImage::normalizeUrl($body['url'] ?? null);
        $image = SponsorImage::decode($body['image'] ?? null);
        foreach ([$name, $url] as $field) {
            if (is_array($field)) {
                http_response_code(400);
                echo json_encode($field);
                return;
            }
        }
        if (is_string($image)) {
            http_response_code(400);
            echo json_encode(['error' => $image]);
            return;
        }

        $count = $this->db->prepare('SELECT COUNT(*), COALESCE(MAX(position), 0) FROM tournament_sponsors WHERE tournament_id = ?');
        $count->execute([$tournamentId]);
        [$existing, $lastPosition] = $count->fetch(PDO::FETCH_NUM);
        if ((int)$existing >= SponsorImage::MAX_SPONSORS) {
            http_response_code(400);
            echo json_encode(['error' => 'A tournament can show up to ' . SponsorImage::MAX_SPONSORS . ' sponsor logos. Remove one first.']);
            return;
        }

        $stmt = $this->db->prepare(
            'INSERT INTO tournament_sponsors (tournament_id, name, url, mime, image, width, height, token, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->bindValue(1, $tournamentId, PDO::PARAM_INT);
        $stmt->bindValue(2, $name);
        $stmt->bindValue(3, $url);
        $stmt->bindValue(4, $image['mime']);
        $stmt->bindValue(5, $image['bytes'], PDO::PARAM_LOB);
        $stmt->bindValue(6, $image['width'], PDO::PARAM_INT);
        $stmt->bindValue(7, $image['height'], PDO::PARAM_INT);
        $stmt->bindValue(8, bin2hex(random_bytes(16)));
        $stmt->bindValue(9, (int)$lastPosition + 1, PDO::PARAM_INT);
        $stmt->execute();

        echo json_encode($this->listFor($tournamentId));
    }

    /** PUT /sponsors/{id} — { name?, url? }. Open on any plan: fixing a typo isn't a new logo. */
    public function update(int $id, array $body): void {
        $fields = [];
        $params = [];
        if (array_key_exists('name', $body)) {
            $name = SponsorImage::normalizeName($body['name']);
            if (is_array($name)) { http_response_code(400); echo json_encode($name); return; }
            $fields[] = 'name = ?';
            $params[] = $name;
        }
        if (array_key_exists('url', $body)) {
            $url = SponsorImage::normalizeUrl($body['url']);
            if (is_array($url)) { http_response_code(400); echo json_encode($url); return; }
            $fields[] = 'url = ?';
            $params[] = $url;
        }
        if ($fields) {
            $params[] = $id;
            $this->db->prepare('UPDATE tournament_sponsors SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
        }
        echo json_encode($this->listFor($this->tournamentOf($id)));
    }

    /** PUT /sponsors/reorder — { tournament_id, sponsor_ids } in display order. */
    public function reorder(array $body): void {
        $tournamentId = (int)($body['tournament_id'] ?? 0);
        $ids = array_map('intval', is_array($body['sponsor_ids'] ?? null) ? $body['sponsor_ids'] : []);

        $stmt = $this->db->prepare('SELECT id FROM tournament_sponsors WHERE tournament_id = ?');
        $stmt->execute([$tournamentId]);
        $existing = array_map('intval', array_column($stmt->fetchAll(), 'id'));
        $sortedExisting = $existing; sort($sortedExisting);
        $sortedIds = $ids; sort($sortedIds);
        if ($sortedIds !== $sortedExisting) {
            http_response_code(400);
            echo json_encode(['error' => "sponsor_ids must list exactly this tournament's sponsors"]);
            return;
        }
        $update = $this->db->prepare('UPDATE tournament_sponsors SET position = ? WHERE id = ? AND tournament_id = ?');
        foreach ($ids as $i => $sponsorId) {
            $update->execute([$i + 1, $sponsorId, $tournamentId]);
        }
        echo json_encode($this->listFor($tournamentId));
    }

    /** DELETE /sponsors/{id} — open on any plan. */
    public function delete(int $id): void {
        $tournamentId = $this->tournamentOf($id);
        $this->db->prepare('DELETE FROM tournament_sponsors WHERE id = ?')->execute([$id]);
        echo json_encode($this->listFor($tournamentId));
    }

    /**
     * GET /sponsors/{id}/image?t={token} — the logo itself, public. The token has to match,
     * so logos can't be enumerated by id, and the URL is immutable, so it is cached for a year.
     * Served with the type sniffed at upload, `nosniff` and a locked-down CSP, so the bytes
     * can only ever be treated as the image they were checked to be.
     */
    public function image(int $id, string $token): void {
        $stmt = $this->db->prepare('SELECT mime, image, token FROM tournament_sponsors WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row || !hash_equals($row['token'], $token)) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }
        header('Content-Type: ' . $row['mime']);
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'");
        header('Cache-Control: public, max-age=31536000, immutable');
        header('Content-Length: ' . strlen($row['image']));
        echo $row['image'];
    }

    private function tournamentOf(int $id): int {
        $stmt = $this->db->prepare('SELECT tournament_id FROM tournament_sponsors WHERE id = ?');
        $stmt->execute([$id]);
        return (int)($stmt->fetchColumn() ?: 0);
    }
}
