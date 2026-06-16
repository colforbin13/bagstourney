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

    public function create(array $body): void {
        $name = trim($body['name'] ?? '');
        if (!$name) { http_response_code(400); echo json_encode(['error' => 'Name required']); return; }
        $stmt = $this->db->prepare('INSERT INTO tournaments (name) VALUES (?)');
        $stmt->execute([$name]);
        $this->get((int)$this->db->lastInsertId());
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