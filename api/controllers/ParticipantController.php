<?php
// api/controllers/ParticipantController.php

class ParticipantController {
    public function __construct(PDO $db) {
		$this->db = $db;
	}

    public function listByTournament(int $tournamentId): void {
        $stmt = $this->db->prepare(
            'SELECT * FROM participants WHERE tournament_id = ? ORDER BY name ASC'
        );
        $stmt->execute([$tournamentId]);
        echo json_encode($stmt->fetchAll());
    }

    public function create(array $body): void {
        $tournamentId = (int)($body['tournament_id'] ?? 0);
        $name = trim($body['name'] ?? '');

        if (!$tournamentId || !$name) {
            http_response_code(400);
            echo json_encode(['error' => 'tournament_id and name required']);
            return;
        }

        // Ensure tournament is still in setup phase
        $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        $t = $stmt->fetch();
        if (!$t || $t['status'] !== 'setup') {
            http_response_code(400);
            echo json_encode(['error' => 'Tournament is not in setup phase']);
            return;
        }

        $stmt = $this->db->prepare(
            'INSERT INTO participants (tournament_id, name) VALUES (?, ?)'
        );
        $stmt->execute([$tournamentId, $name]);
        $id = (int)$this->db->lastInsertId();

        echo json_encode(['id' => $id, 'tournament_id' => $tournamentId, 'name' => $name]);
    }

    public function delete(int $id): void {
        // Lookup participant and tournament
        $stmt = $this->db->prepare('SELECT tournament_id FROM participants WHERE id = ?');
        $stmt->execute([$id]);
        $p = $stmt->fetch();
        if (!$p) {
            http_response_code(404);
            echo json_encode(['error' => 'Participant not found']);
            return;
        }
        $tournamentId = (int)$p['tournament_id'];

        // Ensure tournament is still in setup phase
        $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        $t = $stmt->fetch();
        if (!$t) {
            http_response_code(404);
            echo json_encode(['error' => 'Tournament not found']);
            return;
        }
        if ($t['status'] !== 'setup') {
            http_response_code(400);
            echo json_encode(['error' => 'Cannot delete participant after teams have been drawn']);
            return;
        }

        $this->db->prepare('DELETE FROM participants WHERE id = ?')->execute([$id]);
        echo json_encode(['success' => true]);
    }

    public function update(int $id, array $body): void {
        $name = trim($body['name'] ?? '');
        if (!$name) {
            http_response_code(400);
            echo json_encode(['error' => 'name required']);
            return;
        }
        $this->db->prepare('UPDATE participants SET name = ? WHERE id = ?')->execute([$name, $id]);
        $stmt = $this->db->prepare('SELECT * FROM participants WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode($stmt->fetch());
    }
}

?>