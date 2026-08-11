<?php
// api/index.php — Front controller / router

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/middleware/auth.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/TournamentController.php';
require_once __DIR__ . '/controllers/ParticipantController.php';
require_once __DIR__ . '/controllers/TeamController.php';
require_once __DIR__ . '/controllers/MatchController.php';
require_once __DIR__ . '/controllers/TournamentAccessController.php';
require_once __DIR__ . '/controllers/UserController.php';
require_once __DIR__ . '/controllers/NotificationController.php';

$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Strip the deployment prefix so the router works from /bags/api and /api.
$uri = preg_replace('#^/(?:bags/)?api#', '', $uri);
$uri = trim($uri, '/');
$segments = explode('/', $uri);

$resource  = $segments[0] ?? '';
$idSegment = $segments[1] ?? null;
// A segment that's present but not a valid non-negative integer (e.g. a typo'd id like
// "abc") must not silently become falsy like a genuinely absent id — otherwise routes
// that treat "no id" as "list everything" would return a full list instead of a 404.
$idInvalid = $idSegment !== null && !ctype_digit($idSegment);
$id        = ($idSegment !== null && ctype_digit($idSegment)) ? (int)$idSegment : null;
$action    = ($id !== null && $id > 0) ? ($segments[2] ?? null) : ($segments[1] ?? null);

$body = json_decode(file_get_contents('php://input'), true) ?? [];

try {
    switch ($resource) {
        // --- Auth ---
        case 'auth':
            $ctrl = new AuthController(getDB());
            if ($action === 'login' && $method === 'POST') {
                $ctrl->login($body);
            } elseif ($action === 'register' && $method === 'POST') {
                $ctrl->register($body);
            } elseif ($action === 'change-password' && $method === 'POST') {
                $actor = requireCurrentUser(getDB());
                $ctrl->changePassword($body, $actor);
            } elseif ($action === 'reset-password' && $method === 'POST') {
                $ctrl->resetPassword($body);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Tournaments ---
        case 'tournaments':
            $db = getDB();
            $ctrl = new TournamentController($db);
            if ($method === 'GET' && !$id && !$idInvalid) {
                $ctrl->list(currentUserOrNull($db));
            } elseif ($method === 'GET' && !$id && $action === 'by-uuid' && isset($segments[2])) {
                $ctrl->getByUuid($segments[2], currentUserOrNull($db));
            } elseif ($method === 'GET' && $id) {
                $ctrl->get($id, currentUserOrNull($db));
            } elseif ($method === 'POST' && !$id) {
                $ctrl->create($body, requireCurrentUser($db));
            } elseif ($method === 'PUT' && $id) {
                $actor = requireTournamentRole($db, $id, ['owner', 'manager']);
                $ctrl->update($id, $body, $actor);
            } elseif ($method === 'DELETE' && $id) {
                $actor = requireTournamentRole($db, $id, ['owner']);
                $ctrl->delete($id, $actor);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Participants ---
        case 'participants':
            $db = getDB();
            $ctrl = new ParticipantController($db);
            if ($method === 'GET' && $id) {
                // GET /participants/{tournamentId} — participant rows carry email
                // addresses now, so this requires actual tournament staff access, not just
                // visibility (a public tournament is visible to anonymous viewers, but its
                // participants' emails are not).
                requireTournamentRole($db, $id, ['owner', 'manager', 'scorekeeper']);
                $ctrl->listByTournament($id);
            } elseif ($method === 'POST' && $action === 'self-register') {
                // Public, unauthenticated — a coordinator's shared tournament link/QR.
                // No requireTournamentRole() here by design: this is exactly the endpoint
                // anonymous attendees are meant to hit.
                $ctrl->selfRegister($body);
            } elseif ($method === 'POST') {
                requireTournamentRole($db, (int)($body['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->create($body);
            } elseif ($method === 'PUT' && $id && $action === 'notification-email') {
                $stmt = $db->prepare('SELECT tournament_id FROM participants WHERE id = ?');
                $stmt->execute([$id]);
                $actor = requireTournamentRole($db, (int)($stmt->fetch()['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->setNotificationEmail($id, $body, $actor);
            } elseif ($method === 'PUT' && $id && $action === 'approve') {
                $stmt = $db->prepare('SELECT tournament_id FROM participants WHERE id = ?');
                $stmt->execute([$id]);
                $actor = requireTournamentRole($db, (int)($stmt->fetch()['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->approve($id, $actor);
            } elseif ($method === 'PUT' && $id) {
                $stmt = $db->prepare('SELECT tournament_id FROM participants WHERE id = ?');
                $stmt->execute([$id]);
                requireTournamentRole($db, (int)($stmt->fetch()['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->update($id, $body);
            } elseif ($method === 'DELETE' && $id) {
                $stmt = $db->prepare('SELECT tournament_id FROM participants WHERE id = ?');
                $stmt->execute([$id]);
                requireTournamentRole($db, (int)($stmt->fetch()['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->delete($id);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Teams ---
        case 'teams':
            $db = getDB();
            $ctrl = new TeamController($db);
            if ($method === 'GET' && $id) {
                requireTournamentVisible($db, $id, currentUserOrNull($db));
                $ctrl->listByTournament($id);
            } elseif ($method === 'POST' && !$id && !$action) {
                requireTournamentRole($db, (int)($body['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->draw($body); // draw teams from participants
            } elseif ($method === 'POST' && !$id && $action === 'direct') {
                requireTournamentRole($db, (int)($body['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->createDirect($body); // direct team entry: create one team from typed-in member names
            } elseif ($method === 'POST' && !$id && $action === 'generate-bracket') {
                requireTournamentRole($db, (int)($body['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->generateBracketAction($body); // manual seeding: finalize bracket from current seed order
            } elseif ($method === 'PUT' && !$id && $action === 'reorder') {
                requireTournamentRole($db, (int)($body['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->reorder($body); // manual seeding: persist drag-and-drop seed order
            } elseif ($method === 'PUT' && $id) {
                $stmt = $db->prepare('SELECT tournament_id FROM teams WHERE id = ?');
                $stmt->execute([$id]);
                requireTournamentRole($db, (int)($stmt->fetch()['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->update($id, $body);
            } elseif ($method === 'DELETE' && $id) {
                $stmt = $db->prepare('SELECT tournament_id FROM teams WHERE id = ?');
                $stmt->execute([$id]);
                requireTournamentRole($db, (int)($stmt->fetch()['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->delete($id); // direct team entry: undo a mistakenly-entered team
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Matches ---
        case 'matches':
            $db = getDB();
            $ctrl = new MatchController($db);
            if ($method === 'GET' && !$id && $action === 'by-uuid' && isset($segments[2])) {
                // GET /matches/by-uuid/{uuid} — no visibility check: same as
                // TournamentController::getByUuid(), knowing the uuid is the access grant.
                // This is what actually lets an anonymous viewer's /bracket/{uuid} link work
                // for a private tournament; requireTournamentVisible() below only recognizes
                // an explicit role, which an anonymous uuid-holder doesn't have.
                $ctrl->bracketByUuid($segments[2]);
            } elseif ($method === 'GET' && $id) {
                requireTournamentVisible($db, $id, currentUserOrNull($db));
                $ctrl->bracket($id); // GET /matches/{tournamentId}
            } elseif ($method === 'PUT' && $id) {
                $stmt = $db->prepare('SELECT tournament_id FROM matches WHERE id = ?');
                $stmt->execute([$id]);
                $actor = requireTournamentRole($db, (int)($stmt->fetch()['tournament_id'] ?? 0), ['owner', 'manager', 'scorekeeper']);
                $ctrl->updateScore($id, $body, $actor);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Tournament member access ---
        case 'tournament-members':
            $db = getDB();
            $ctrl = new TournamentAccessController($db);
            $memberId = isset($segments[2]) ? (int)$segments[2] : 0;
            if ($method === 'GET' && $id) {
                $ctrl->listMembers($id);
            } elseif ($method === 'POST' && $id && !$memberId) {
                $ctrl->addMember($id, $body);
            } elseif ($method === 'PUT' && $id && $memberId) {
                $ctrl->updateMember($id, $memberId, $body);
            } elseif ($method === 'DELETE' && $id && $memberId) {
                $ctrl->removeMember($id, $memberId);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        case 'tournament-ownership':
            if ($method === 'PUT' && $id) {
                (new TournamentAccessController(getDB()))->transferOwnership($id, $body);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Notification opt-in/opt-out (participant-facing, token-gated, no login) ---
        case 'notifications':
            $ctrl = new NotificationController(getDB());
            $notifAction = $segments[1] ?? null;
            $notifSubAction = $segments[2] ?? null;
            if ($method === 'POST' && $notifAction === 'confirm') {
                $ctrl->confirm($body);
            } elseif ($method === 'POST' && $notifAction === 'unsubscribe') {
                $ctrl->unsubscribeCategory($body);
            } elseif ($method === 'GET' && $notifAction === 'preferences') {
                $ctrl->getPreferences($_GET);
            } elseif ($method === 'PUT' && $notifAction === 'preferences') {
                $ctrl->updatePreferences($body);
            } elseif ($method === 'POST' && $notifAction === 'webhook' && $notifSubAction === 'bounce') {
                $ctrl->webhookBounce($body);
            } elseif ($method === 'POST' && $notifAction === 'webhook' && $notifSubAction === 'spam-complaint') {
                $ctrl->webhookComplaint($body);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Super-admin user management ---
        case 'users':
            $ctrl = new UserController(getDB());
            if ($method === 'GET' && !$id && !$idInvalid) {
                $ctrl->list();
            } elseif ($method === 'GET' && !$id && $action === 'search') {
                $ctrl->search($_GET['q'] ?? '');
            } elseif ($method === 'POST' && !$id) {
                $ctrl->create($body);
            } elseif ($method === 'PUT' && $id) {
                $ctrl->update($id, $body);
            } elseif ($method === 'POST' && $id && $action === 'password-reset') {
                $ctrl->resetPassword($id);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        default:
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

?>
