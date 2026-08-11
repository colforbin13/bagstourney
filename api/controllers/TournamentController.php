<?php
// api/controllers/TournamentController.php

class TournamentController {
    public function __construct(PDO $db) {
		$this->db = $db;
	}

    public function list(?array $actor = null): void {
        if ($actor) {
            $stmt = $this->db->query('SELECT * FROM tournaments ORDER BY created_at DESC');
        } else {
            // Public listing: hide tournaments still in setup (no bracket generated yet).
            $stmt = $this->db->query("SELECT * FROM tournaments WHERE visibility = 'public' AND status != 'setup' ORDER BY created_at DESC");
        }
        echo json_encode($stmt->fetchAll());
    }

    public function get(int $id, ?array $actor = null): void {
        $stmt = $this->db->prepare('SELECT * FROM tournaments WHERE id = ?');
        $stmt->execute([$id]);
        $t = $stmt->fetch();
        if (!$t) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }

        $capabilities = tournamentCapabilities($this->db, $id, $actor);
        // A private tournament is only reachable by numeric id for staff/super_admin;
        // everyone else must use its uuid (getByUuid()) — knowing the uuid is itself the
        // access grant. 404 rather than 403 so the id doesn't reveal a private tournament exists.
        if ($t['visibility'] === 'private' && !$capabilities['role'] && !$capabilities['is_super_admin']) {
            http_response_code(404); echo json_encode(['error' => 'Not found']); return;
        }

        $t['capabilities'] = $capabilities;
        echo json_encode($t);
    }

    public function getByUuid(string $uuid, ?array $actor = null): void {
        $stmt = $this->db->prepare('SELECT * FROM tournaments WHERE uuid = ?');
        $stmt->execute([$uuid]);
        $t = $stmt->fetch();
        if (!$t) { http_response_code(404); echo json_encode(['error' => 'Not found']); return; }
        $t['capabilities'] = tournamentCapabilities($this->db, (int)$t['id'], $actor);
        echo json_encode($t);
    }

    public function create(array $body, array $actor): void {
        $name = trim($body['name'] ?? '');
        if (!$name) { http_response_code(400); echo json_encode(['error' => 'Name required']); return; }
        $visibility = in_array($body['visibility'] ?? null, ['public', 'private'], true) ? $body['visibility'] : 'public';
        $seedingMode = in_array($body['seeding_mode'] ?? null, ['automatic', 'manual'], true) ? $body['seeding_mode'] : 'automatic';
        $teamEntryMode = in_array($body['team_entry_mode'] ?? null, ['auto_draft', 'direct'], true) ? $body['team_entry_mode'] : 'auto_draft';
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('INSERT INTO tournaments (name, uuid, visibility, seeding_mode, team_entry_mode, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)');
            $stmt->execute([$name, $this->generateUuidV4(), $visibility, $seedingMode, $teamEntryMode, $actor['id']]);
            $id = (int)$this->db->lastInsertId();
            $this->db->prepare('INSERT INTO tournament_members (tournament_id, user_id, role, granted_by_user_id) VALUES (?, ?, "owner", ?)')
                ->execute([$id, $actor['id'], $actor['id']]);
            writeAuditLog($this->db, $id, (int)$actor['id'], 'tournament_created', 'tournament', (string)$id);
            $this->db->commit();
            $this->get($id, $actor);
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function update(int $id, array $body, array $actor): void {
        $fields = [];
        $params = [];
        if (isset($body['name'])) { $fields[] = 'name = ?'; $params[] = trim($body['name']); }
        if (isset($body['status'])) {
            // 'setup' is entered only at creation; allowing it here would let a caller
            // reset an active/complete tournament back to setup, which POST /teams treats
            // as a signal to wipe and redraw all existing teams and matches.
            if (!in_array($body['status'], ['active', 'complete'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid tournament status']);
                return;
            }
            $fields[] = 'status = ?';
            $params[] = $body['status'];
        }
        if (isset($body['visibility'])) {
            if (!in_array($body['visibility'], ['public', 'private'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid tournament visibility']);
                return;
            }
            $fields[] = 'visibility = ?';
            $params[] = $body['visibility'];
        }
        if (isset($body['seeding_mode'])) {
            if (!in_array($body['seeding_mode'], ['automatic', 'manual'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid seeding mode']);
                return;
            }
            // Only changeable before teams exist — once teams are drawn, flipping modes
            // would leave a half-formed manual seed order or silently skip the seeding
            // step the organizer already committed to.
            $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
            $stmt->execute([$id]);
            $t = $stmt->fetch();
            if (!$t || $t['status'] !== 'setup') {
                http_response_code(400);
                echo json_encode(['error' => 'Seeding mode can only be changed during setup']);
                return;
            }
            $teamCount = $this->db->prepare('SELECT COUNT(*) FROM teams WHERE tournament_id = ?');
            $teamCount->execute([$id]);
            if ((int)$teamCount->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Cannot change seeding mode after teams have been drawn']);
                return;
            }
            $fields[] = 'seeding_mode = ?';
            $params[] = $body['seeding_mode'];
        }
        if (isset($body['team_entry_mode'])) {
            if (!in_array($body['team_entry_mode'], ['auto_draft', 'direct'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid team entry mode']);
                return;
            }
            // Same reasoning as seeding_mode above: only changeable before teams exist.
            $stmt = $this->db->prepare('SELECT status FROM tournaments WHERE id = ?');
            $stmt->execute([$id]);
            $t = $stmt->fetch();
            if (!$t || $t['status'] !== 'setup') {
                http_response_code(400);
                echo json_encode(['error' => 'Team entry mode can only be changed during setup']);
                return;
            }
            $teamCount = $this->db->prepare('SELECT COUNT(*) FROM teams WHERE tournament_id = ?');
            $teamCount->execute([$id]);
            if ((int)$teamCount->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Cannot change team entry mode after teams have been created']);
                return;
            }
            $fields[] = 'team_entry_mode = ?';
            $params[] = $body['team_entry_mode'];
        }
        if (!$fields) { http_response_code(400); echo json_encode(['error' => 'Nothing to update']); return; }
        $params[] = $id;
        $this->db->prepare('UPDATE tournaments SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
        writeAuditLog($this->db, $id, (int)$actor['id'], 'tournament_updated', 'tournament', (string)$id, $body);
        $this->get($id, $actor);
    }

    // Version-4 (random) UUID, same random_bytes()-based approach as the password-reset
    // token in UserController::resetPassword() — no ext-uuid dependency needed.
    private function generateUuidV4(): string {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    public function delete(int $id, array $actor): void {
        $stmt = $this->db->prepare('SELECT name FROM tournaments WHERE id = ?');
        $stmt->execute([$id]);
        $tournament = $stmt->fetch();
        if (!$tournament) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }

        writeAuditLog($this->db, $id, (int)$actor['id'], 'tournament_deleted', 'tournament', (string)$id, ['name' => $tournament['name']]);

        $this->db->prepare('DELETE FROM matches WHERE tournament_id = ?')->execute([$id]);
        $this->db->prepare('DELETE FROM teams WHERE tournament_id = ?')->execute([$id]);
        $this->db->prepare('DELETE FROM participants WHERE tournament_id = ?')->execute([$id]);
        $this->db->prepare('DELETE FROM tournaments WHERE id = ?')->execute([$id]);
        echo json_encode(['success' => true]);
    }
}

?>
