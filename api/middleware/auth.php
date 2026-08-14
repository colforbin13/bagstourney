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

    // Checked before the super_admin bypass below, on purpose: a soft-deleted
    // tournament's matches/teams/participants should be untouchable by anyone,
    // including super admins, until it's explicitly restored — otherwise "deleted"
    // wouldn't actually stop further edits via these per-child-row endpoints.
    $stmt = $db->prepare('SELECT deleted_at FROM tournaments WHERE id = ?');
    $stmt->execute([$tournamentId]);
    $tournament = $stmt->fetch();
    if (!$tournament || $tournament['deleted_at'] !== null) {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        exit;
    }

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

    // Only computed for staff — an anonymous public-bracket viewer doesn't need it, and
    // it would otherwise add two extra queries to the highest-traffic read path here.
    $participantCap = null;
    $participantCount = null;
    if ($isManager) {
        $participantCap = effectiveParticipantCap($db, $tournamentId);
        $countStmt = $db->prepare('SELECT COUNT(*) FROM participants WHERE tournament_id = ?');
        $countStmt->execute([$tournamentId]);
        $participantCount = (int)$countStmt->fetchColumn();
    }

    return [
        'role' => $role,
        'is_super_admin' => $isSuperAdmin,
        'can_manage_setup' => $isManager,
        'can_manage_staff' => $isOwner,
        'can_score' => $canScore,
        'can_delete' => $isOwner,
        'participant_cap' => $participantCap,
        'participant_count' => $participantCount,
    ];
}

// Freemium participant cap (FEATURE_TRACKER.md item 12/13 plumbing). No billing exists
// yet — users.plan and tournaments.paid_override (migration 013) are both set manually
// by a super admin for now, standing in for what Stripe will flip automatically once
// payment integration ships; either one raised to 'paid'/1 lifts the cap.
const FREEMIUM_FREE_TIER_MAX_PARTICIPANTS = 32;
const FREEMIUM_PAID_TIER_MAX_PARTICIPANTS = 256;

function effectiveParticipantCap(PDO $db, int $tournamentId): int {
    $stmt = $db->prepare('
        SELECT t.paid_override, u.plan
        FROM tournaments t
        LEFT JOIN users u ON u.id = t.created_by_user_id
        WHERE t.id = ?
    ');
    $stmt->execute([$tournamentId]);
    $row = $stmt->fetch();
    $isPaid = $row && ((int)$row['paid_override'] === 1 || $row['plan'] === 'paid');
    return $isPaid ? FREEMIUM_PAID_TIER_MAX_PARTICIPANTS : FREEMIUM_FREE_TIER_MAX_PARTICIPANTS;
}

// Like requireTournamentRole() but for anonymous-allowed GET endpoints: public
// tournaments are visible to everyone, private ones require a role on the tournament
// (or super_admin) — the same gate that forces private tournaments to be reached via
// their UUID rather than a guessed numeric id. Exits with 404 (not 403) to avoid
// revealing that a private tournament exists at that id.
function requireTournamentVisible(PDO $db, int $tournamentId, ?array $actor): array {
    $stmt = $db->prepare('SELECT * FROM tournaments WHERE id = ?');
    $stmt->execute([$tournamentId]);
    $t = $stmt->fetch();
    // A soft-deleted tournament is treated as gone for everyone, super admins included —
    // recovery is a deliberate action via the restore endpoint, not implicit read access.
    if (!$t || $t['deleted_at'] !== null) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
    if ($t['visibility'] === 'private') {
        $caps = tournamentCapabilities($db, $tournamentId, $actor);
        if (!$caps['role'] && !$caps['is_super_admin']) {
            http_response_code(404); echo json_encode(['error' => 'Not found']); exit;
        }
    }
    return $t;
}

// Single source of truth for the notification category names and the participants
// column each one toggles — shared by NotificationController.php (opt-out API) and
// api/scripts/send_notifications.php (per-category send-time re-check) so the two can't
// drift apart.
const NOTIFICATION_CATEGORY_COLUMNS = [
    'match_completed' => 'notify_match_completed',
    'round_completed' => 'notify_round_completed',
    'tournament_finalized' => 'notify_tournament_finalized',
];

// Deterministic capability token for a participant's "manage my notification
// preferences" / one-click category-unsubscribe links. Unlike JWT_SECRET-signed session
// tokens or the hashed, single-use password-reset/notification-confirm tokens, nothing is
// stored: the worker and the public endpoints both recompute this on demand from the
// participant id, their current token version, and this server secret. Bumping
// participants.notification_manage_token_version invalidates every link issued before
// the bump (used when a participant's email address changes).
function notificationManageToken(int $participantId, int $version): string {
    return hash_hmac('sha256', "participant:{$participantId}:v{$version}", NOTIFICATION_TOKEN_SECRET);
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
