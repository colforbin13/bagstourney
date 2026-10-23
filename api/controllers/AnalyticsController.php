<?php
// api/controllers/AnalyticsController.php
//
// Self-hosted traffic counting. POST /analytics/pageview is the public beacon every page
// view sends (frontend shared/services/traffic.service.ts); GET /analytics is the super-admin
// Traffic page's summary. What gets counted, and how, is decided in api/lib/PageView.php.

class AnalyticsController {
    const RANGES = [7, 30, 90];
    const TOP = 15;

    public function __construct(private readonly PDO $db) {}

    /**
     * Counts one page view. Always answers 204, counted or not: the beacon ignores the
     * response, and a page view must never surface an error to a visitor.
     */
    public function record(array $body): void {
        http_response_code(204);

        if (PageView::isBot($_SERVER['HTTP_USER_AGENT'] ?? null)) {
            return;
        }
        $path = PageView::path((string)($body['path'] ?? ''));
        if ($path === null) {
            return;
        }
        $visit = !empty($body['visit']) ? 1 : 0;
        $source = $visit
            ? PageView::source(
                is_string($body['referrer'] ?? null) ? $body['referrer'] : null,
                is_string($body['utm_source'] ?? null) ? $body['utm_source'] : null,
                ['bracketway.com', (string)($_SERVER['HTTP_HOST'] ?? '')]
            )
            : '';

        $this->db->prepare('
            INSERT INTO page_views (day, path, source, visits, views)
            VALUES (CURDATE(), ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE visits = visits + VALUES(visits), views = views + 1
        ')->execute([$path, $source, $visit]);
    }

    public function summary(array $query): void {
        requireSuperAdmin($this->db);

        $days = (int)($query['days'] ?? 30);
        if (!in_array($days, self::RANGES, true)) {
            $days = 30;
        }

        // Dates come from MySQL, the same clock CURDATE() counts with, so a PHP timezone that
        // differs from the database's can't shift the chart by a day.
        $stmt = $this->db->prepare('
            SELECT CURDATE() AS today,
                   DATE_SUB(CURDATE(), INTERVAL ? DAY) AS from_day,
                   DATE_SUB(CURDATE(), INTERVAL ? DAY) AS prev_from_day
        ');
        $stmt->execute([$days - 1, 2 * $days - 1]);
        ['today' => $today, 'from_day' => $from, 'prev_from_day' => $prevFrom] = $stmt->fetch(PDO::FETCH_ASSOC);

        $stmt = $this->db->prepare('
            SELECT day, SUM(visits) AS visits, SUM(views) AS views
            FROM page_views WHERE day >= ? GROUP BY day
        ');
        $stmt->execute([$from]);
        $byDay = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $byDay[$row['day']] = $row;
        }
        $daily = PageView::fillDays($byDay, $from, $today);

        $stmt = $this->db->prepare('SELECT COALESCE(SUM(visits), 0) FROM page_views WHERE day >= ? AND day < ?');
        $stmt->execute([$prevFrom, $from]);
        $previousVisits = (int)$stmt->fetchColumn();

        $stmt = $this->db->prepare('
            SELECT path, SUM(views) AS views, SUM(visits) AS visits
            FROM page_views WHERE day >= ?
            GROUP BY path ORDER BY views DESC, path LIMIT ' . self::TOP
        );
        $stmt->execute([$from]);
        $pages = array_map(fn($r) => [
            'path' => $r['path'], 'views' => (int)$r['views'], 'visits' => (int)$r['visits'],
        ], $stmt->fetchAll(PDO::FETCH_ASSOC));

        // Only visits carry a source, so '' here is genuinely direct or unknown traffic.
        $stmt = $this->db->prepare('
            SELECT source, SUM(visits) AS visits
            FROM page_views WHERE day >= ? AND visits > 0
            GROUP BY source ORDER BY visits DESC, source LIMIT ' . self::TOP
        );
        $stmt->execute([$from]);
        $sources = array_map(fn($r) => [
            'source' => $r['source'], 'visits' => (int)$r['visits'],
        ], $stmt->fetchAll(PDO::FETCH_ASSOC));

        echo json_encode([
            'days'            => $days,
            'from'            => $from,
            'to'              => $today,
            'visits'          => array_sum(array_column($daily, 'visits')),
            'views'           => array_sum(array_column($daily, 'views')),
            'previous_visits' => $previousVisits,
            'daily'           => $daily,
            'pages'           => $pages,
            'sources'         => $sources,
            'activity'        => $this->activity($from),
        ]);
    }

    /** What organizers did in the range, from the real tables rather than page views. */
    private function activity(string $from): array {
        $count = function (string $sql, array $params = []): int {
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            return (int)$stmt->fetchColumn();
        };
        return [
            'new_organizers'       => $count('SELECT COUNT(*) FROM users WHERE created_at >= ?', [$from]),
            'tournaments_created'  => $count('SELECT COUNT(*) FROM tournaments WHERE created_at >= ?', [$from]),
            'players_added'        => $count('SELECT COUNT(*) FROM participants WHERE created_at >= ?', [$from]),
            'pro_subscribers'      => $count("SELECT COUNT(*) FROM users WHERE plan = 'paid' AND plan_source = 'stripe'"),
            'upgraded_tournaments' => $count("SELECT COUNT(*) FROM tournaments WHERE paid_override = 1 AND paid_override_source = 'stripe'"),
        ];
    }
}
