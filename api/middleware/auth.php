<?php
// api/middleware/auth.php

require_once __DIR__ . '/../config/database.php';

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
}

function generateJWT(int $userId, string $username, string $role): string {
    $header  = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = base64url_encode(json_encode([
        'sub' => $userId,
        'username' => $username,
        'role' => $role,
        'iat' => time(),
        'exp' => time() + JWT_EXPIRY,
    ]));
    $sig = base64url_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    return "$header.$payload.$sig";
}

function currentUser(PDO $db, array $claims): ?array {
    $stmt = $db->prepare('SELECT id, username, email, role, status FROM users WHERE id = ?');
    $stmt->execute([(int)$claims['sub']]);
    $user = $stmt->fetch();
    return $user && $user['status'] === 'active' ? $user : null;
}

function requireCurrentUser(PDO $db): array {
    $claims = requireAuth();
    $user = currentUser($db, $claims);
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Account is unavailable']);
        exit;
    }
    return $user;
}

function requireSuperAdmin(PDO $db): array {
    $user = requireCurrentUser($db);
    if ($user['role'] !== 'super_admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Super-admin access required']);
        exit;
    }
    return $user;
}

function requireTournamentRole(PDO $db, int $tournamentId, array $allowedRoles): array {
    $user = requireCurrentUser($db);
    if ($user['role'] === 'super_admin') return $user;

    $stmt = $db->prepare('SELECT role FROM tournament_members WHERE tournament_id = ? AND user_id = ?');
    $stmt->execute([$tournamentId, $user['id']]);
    $membership = $stmt->fetch();
    if (!$membership || !in_array($membership['role'], $allowedRoles, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'You do not have permission to manage this tournament']);
        exit;
    }
    return $user;
}

// Like requireCurrentUser(), but returns null instead of exiting when there is no valid
// session — for endpoints (like viewing a tournament) that work for anonymous callers but
// should still report richer information when the caller is authenticated.
function currentUserOrNull(PDO $db): ?array {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (strpos($auth, 'Bearer ') !== 0) return null;
    $claims = verifyJWT(substr($auth, 7));
    if (!$claims) return null;
    return currentUser($db, $claims);
}

// Derives what the given user (possibly anonymous) is allowed to do on a tournament, so
// the frontend can hide controls it can't use instead of only discovering that from a
// rejected request. Mirrors the role checks actually enforced by requireTournamentRole()
// across TournamentController, TeamController, ParticipantController, MatchController, and
// TournamentAccessController — keep this in sync if those requirements change.
function tournamentCapabilities(PDO $db, int $tournamentId, ?array $user): array {
    $role = null;
    $isSuperAdmin = false;

    if ($user) {
        if ($user['role'] === 'super_admin') {
            $isSuperAdmin = true;
        } else {
            $stmt = $db->prepare('SELECT role FROM tournament_members WHERE tournament_id = ? AND user_id = ?');
            $stmt->execute([$tournamentId, $user['id']]);
            $role = $stmt->fetch()['role'] ?? null;
        }
    }

    $isOwner = $isSuperAdmin || $role === 'owner';
    $isManager = $isSuperAdmin || in_array($role, ['owner', 'manager'], true);
    $canScore = $isSuperAdmin || in_array($role, ['owner', 'manager', 'scorekeeper'], true);

    return [
        'role' => $role,
        'is_super_admin' => $isSuperAdmin,
        'can_manage_setup' => $isManager,
        'can_manage_staff' => $isOwner,
        'can_score' => $canScore,
        'can_delete' => $isOwner,
    ];
}

function writeAuditLog(PDO $db, ?int $tournamentId, ?int $actorUserId, string $action, ?string $targetType = null, ?string $targetId = null, ?array $details = null): void {
    $stmt = $db->prepare('INSERT INTO audit_log (tournament_id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $tournamentId,
        $actorUserId,
        $action,
        $targetType,
        $targetId,
        $details === null ? null : json_encode($details),
    ]);
}

function verifyJWT(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $payload, $sig] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;
    $data = json_decode(base64url_decode($payload), true);
    if (!$data || $data['exp'] < time()) return null;
    return $data;
}

function requireAuth(): array {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (strpos($auth, 'Bearer ') !== 0) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    $claims = verifyJWT(substr($auth, 7));
    if (!$claims) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid or expired token']);
        exit;
    }
    return $claims;
}

?>
