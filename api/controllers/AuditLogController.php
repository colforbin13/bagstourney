<?php
// api/controllers/AuditLogController.php
//
// Read-only, super-admin-only view over audit_log — written to via writeAuditLog()
// (api/middleware/auth.php) throughout the other controllers, but never previously
// readable except by querying the database directly.

class AuditLogController {
    private $db;

    const DEFAULT_PAGE_SIZE = 50;
    const MAX_PAGE_SIZE = 200;

    // Whitelisted so a sort key can never be interpolated as an arbitrary column name.
    const SORTABLE_COLUMNS = [
        'created_at' => 'al.created_at',
        'action'     => 'al.action',
        'actor'      => 'u.username',
        'tournament' => 't.name',
    ];

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    public function list(array $query): void {
        requireSuperAdmin($this->db);

        $page = max(1, (int)($query['page'] ?? 1));
        $pageSize = min(self::MAX_PAGE_SIZE, max(1, (int)($query['page_size'] ?? self::DEFAULT_PAGE_SIZE)));
        $offset = ($page - 1) * $pageSize;

        $sortColumn = self::SORTABLE_COLUMNS[$query['sort'] ?? ''] ?? self::SORTABLE_COLUMNS['created_at'];
        $sortDir = strtolower($query['dir'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';

        $where = [];
        $params = [];

        $search = trim($query['search'] ?? '');
        if ($search !== '') {
            $like = '%' . $search . '%';
            $where[] = '(al.action LIKE ? OR al.target_type LIKE ? OR al.target_id LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR t.name LIKE ? OR al.details_json LIKE ?)';
            array_push($params, $like, $like, $like, $like, $like, $like, $like);
        }

        if (!empty($query['action'])) {
            $where[] = 'al.action = ?';
            $params[] = $query['action'];
        }

        if (!empty($query['tournament_id'])) {
            $where[] = 'al.tournament_id = ?';
            $params[] = (int)$query['tournament_id'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
        $joinSql = '
            FROM audit_log al
            LEFT JOIN users u ON u.id = al.actor_user_id
            LEFT JOIN tournaments t ON t.id = al.tournament_id
        ';

        $countStmt = $this->db->prepare("SELECT COUNT(*) $joinSql $whereSql");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare("
            SELECT al.id, al.created_at, al.action, al.target_type, al.target_id, al.details_json,
                   al.tournament_id, t.name AS tournament_name,
                   al.actor_user_id, u.username AS actor_username, u.email AS actor_email
            $joinSql
            $whereSql
            ORDER BY $sortColumn $sortDir, al.id $sortDir
            LIMIT ? OFFSET ?
        ");
        $i = 1;
        foreach ($params as $p) {
            $stmt->bindValue($i++, $p);
        }
        $stmt->bindValue($i++, $pageSize, PDO::PARAM_INT);
        $stmt->bindValue($i++, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        foreach ($rows as &$row) {
            $row['details'] = $row['details_json'] !== null ? json_decode($row['details_json'], true) : null;
            unset($row['details_json']);
        }

        echo json_encode([
            'rows' => $rows,
            'total' => $total,
            'page' => $page,
            'page_size' => $pageSize,
        ]);
    }
}
