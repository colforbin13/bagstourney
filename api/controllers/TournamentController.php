<?php
// api/controllers/TournamentController.php

class TournamentController {
    public function __construct(PDO $db) {
		$this->db = $db;
	}

    public function list(): void {
        $stmt = $this->db->query('SELECT * FROM tournaments ORDER BY created_at DESC');
        echo json_encode($stmt->fetchAll());
    }

    public function get(int $id): void {
        $stmt = $this->db->prepare('SELECT * FROM tournaments WHERE id = ?');
        $stmt->execute([$id]);
        $t = $stmt->fetch();
        if (!$t) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }
        echo json_encode($t);
    }

    public function create(array $body, array $actor): void {
        $name = trim($body['name'] ?? '');
        if (!$name) { http_response_code(400); echo json_encode(['error' => 'Name required']); return; }
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('INSERT INTO tournaments (name, created_by_user_id) VALUES (?, ?)');
            $stmt->execute([$name, $actor['id']]);
            $id = (int)$this->db->lastInsertId();
            $this->db->prepare('INSERT INTO tournament_members (tournament_id, user_id, role, granted_by_user_id) VALUES (?, ?, "owner", ?)')
                ->execute([$id, $actor['id'], $actor['id']]);
            writeAuditLog($this->db, $id, (int)$actor['id'], 'tournament_created', 'tournament', (string)$id);
            $this->db->commit();
            $this->get($id);
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function update(int $id, array $body): void {
        $fields = [];
        $params = [];
        if (isset($body['name'])) { $fields[] = 'name = ?'; $params[] = trim($body['name']); }
        if (isset($body['status'])) { $fields[] = 'status = ?'; $params[] = $body['status']; }
        if (!$fields) { http_response_code(400); echo json_encode(['error' => 'Nothing to update']); return; }
        $params[] = $id;
        $this->db->prepare('UPDATE tournaments SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
        $this->get($id);
    }

    public function delete(int $id): void {
        $this->db->prepare('DELETE FROM matches WHERE tournament_id = ?')->execute([$id]);
        $this->db->prepare('DELETE FROM teams WHERE tournament_id = ?')->execute([$id]);
        $this->db->prepare('DELETE FROM participants WHERE tournament_id = ?')->execute([$id]);
        $this->db->prepare('DELETE FROM tournaments WHERE id = ?')->execute([$id]);
        echo json_encode(['success' => true]);
    }
}

?>
