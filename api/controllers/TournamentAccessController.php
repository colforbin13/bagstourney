<?php
// Tournament-scoped member and ownership management.

class TournamentAccessController {
    private $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    public function listMembers(int $tournamentId): void {
        requireTournamentRole($this->db, $tournamentId, ['owner']);
        $stmt = $this->db->prepare('
            SELECT tm.user_id, tm.role, tm.created_at, u.username, u.email, u.role AS global_role
            FROM tournament_members tm
            JOIN users u ON u.id = tm.user_id
            WHERE tm.tournament_id = ?
            ORDER BY FIELD(tm.role, "owner", "manager", "scorekeeper"), u.username
        ');
        $stmt->execute([$tournamentId]);
        echo json_encode($stmt->fetchAll());
    }

    public function addMember(int $tournamentId, array $body): void {
        $actor = requireTournamentRole($this->db, $tournamentId, ['owner']);
        $userId = (int)($body['user_id'] ?? 0);
        $role = $body['role'] ?? '';
        if (!$userId || !in_array($role, ['manager', 'scorekeeper'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'An existing user_id and a manager or scorekeeper role are required']);
            return;
        }
        try {
            $this->upsertMember($tournamentId, $userId, $role, (int)$actor['id']);
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
            return;
        }
        writeAuditLog($this->db, $tournamentId, (int)$actor['id'], 'tournament_member_granted', 'user', (string)$userId, ['role' => $role]);
        http_response_code(201);
        echo json_encode(['success' => true]);
    }

    public function updateMember(int $tournamentId, int $userId, array $body): void {
        $actor = requireTournamentRole($this->db, $tournamentId, ['owner']);
        $role = $body['role'] ?? '';
        if (!in_array($role, ['manager', 'scorekeeper'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Role must be manager or scorekeeper']);
            return;
        }

        // A role-change PUT must not be able to demote the current owner — that must go
        // through transferOwnership() instead, same as removeMember() already requires below.
        $stmt = $this->db->prepare('SELECT role FROM tournament_members WHERE tournament_id = ? AND user_id = ?');
        $stmt->execute([$tournamentId, $userId]);
        if (($stmt->fetch()['role'] ?? null) === 'owner') {
            http_response_code(400);
            echo json_encode(['error' => "Transfer ownership before changing the owner's role"]);
            return;
        }

        try {
            $this->upsertMember($tournamentId, $userId, $role, (int)$actor['id']);
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
            return;
        }
        writeAuditLog($this->db, $tournamentId, (int)$actor['id'], 'tournament_member_updated', 'user', (string)$userId, ['role' => $role]);
        echo json_encode(['success' => true]);
    }

    public function removeMember(int $tournamentId, int $userId): void {
        $actor = requireTournamentRole($this->db, $tournamentId, ['owner']);
        $stmt = $this->db->prepare('SELECT role FROM tournament_members WHERE tournament_id = ? AND user_id = ?');
        $stmt->execute([$tournamentId, $userId]);
        if (($stmt->fetch()['role'] ?? null) === 'owner') {
            http_response_code(400);
            echo json_encode(['error' => 'Transfer ownership before removing an owner']);
            return;
        }
        $this->db->prepare('DELETE FROM tournament_members WHERE tournament_id = ? AND user_id = ?')->execute([$tournamentId, $userId]);
        writeAuditLog($this->db, $tournamentId, (int)$actor['id'], 'tournament_member_removed', 'user', (string)$userId);
        echo json_encode(['success' => true]);
    }

    public function transferOwnership(int $tournamentId, array $body): void {
        $actor = requireTournamentRole($this->db, $tournamentId, ['owner']);
        $userId = (int)($body['user_id'] ?? 0);
        if (!$userId) {
            http_response_code(400);
            echo json_encode(['error' => 'user_id required']);
            return;
        }
        $this->db->beginTransaction();
        try {
            $this->db->prepare('UPDATE tournament_members SET role = "manager" WHERE tournament_id = ? AND role = "owner"')->execute([$tournamentId]);
            $this->upsertMember($tournamentId, $userId, 'owner', (int)$actor['id']);
            $this->db->prepare('UPDATE tournaments SET created_by_user_id = ? WHERE id = ?')->execute([$userId, $tournamentId]);
            writeAuditLog($this->db, $tournamentId, (int)$actor['id'], 'tournament_ownership_transferred', 'user', (string)$userId);
            $this->db->commit();
            echo json_encode(['success' => true]);
        } catch (InvalidArgumentException $e) {
            $this->db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    private function upsertMember(int $tournamentId, int $userId, string $role, int $actorUserId): void {
        $user = $this->db->prepare('SELECT id FROM users WHERE id = ? AND status = "active"');
        $user->execute([$userId]);
        if (!$user->fetch()) throw new InvalidArgumentException('User not found or inactive');
        $stmt = $this->db->prepare('
            INSERT INTO tournament_members (tournament_id, user_id, role, granted_by_user_id)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE role = VALUES(role), granted_by_user_id = VALUES(granted_by_user_id)
        ');
        $stmt->execute([$tournamentId, $userId, $role, $actorUserId]);
    }
}
