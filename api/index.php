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

$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Strip the deployment prefix so the router works from /bags/api and /api.
$uri = preg_replace('#^/(?:bags/)?api#', '', $uri);
$uri = trim($uri, '/');
$segments = explode('/', $uri);

$resource = $segments[0] ?? '';
$id       = isset($segments[1]) ? (int)$segments[1] : null;
$action   = $id > 0 ? $segments[2] : $segments[1] ?? null;

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
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Tournaments ---
        case 'tournaments':
            $db = getDB();
            $ctrl = new TournamentController($db);
            if ($method === 'GET' && !$id) {
                $ctrl->list();
            } elseif ($method === 'GET' && $id) {
                $ctrl->get($id);
            } elseif ($method === 'POST' && !$id) {
                $ctrl->create($body, requireCurrentUser($db));
            } elseif ($method === 'PUT' && $id) {
                requireTournamentRole($db, $id, ['owner', 'manager']);
                $ctrl->update($id, $body);
            } elseif ($method === 'DELETE' && $id) {
                requireTournamentRole($db, $id, ['owner']);
                $ctrl->delete($id);
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
                // GET /participants/{tournamentId}
                $ctrl->listByTournament($id);
            } elseif ($method === 'POST') {
                requireTournamentRole($db, (int)($body['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->create($body);
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
                $ctrl->listByTournament($id);
            } elseif ($method === 'POST' && !$id) {
                requireTournamentRole($db, (int)($body['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->draw($body); // draw teams from participants
            } elseif ($method === 'PUT' && $id) {
                $stmt = $db->prepare('SELECT tournament_id FROM teams WHERE id = ?');
                $stmt->execute([$id]);
                requireTournamentRole($db, (int)($stmt->fetch()['tournament_id'] ?? 0), ['owner', 'manager']);
                $ctrl->update($id, $body);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Matches ---
        case 'matches':
            $db = getDB();
            $ctrl = new MatchController($db);
            if ($method === 'GET' && $id) {
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

        // --- Super-admin user management ---
        case 'users':
            $ctrl = new UserController(getDB());
            if ($method === 'GET' && !$id) {
                $ctrl->list();
            } elseif ($method === 'POST' && !$id) {
                $ctrl->create($body);
            } elseif ($method === 'PUT' && $id) {
                $ctrl->update($id, $body);
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
