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
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Tournaments ---
        case 'tournaments':
            $ctrl = new TournamentController(getDB());
            if ($method === 'GET' && !$id) {
                $ctrl->list();
            } elseif ($method === 'GET' && $id) {
                $ctrl->get($id);
            } elseif ($method === 'POST' && !$id) {
                requireAuth();
                $ctrl->create($body);
            } elseif ($method === 'PUT' && $id) {
                requireAuth();
                $ctrl->update($id, $body);
            } elseif ($method === 'DELETE' && $id) {
                requireAuth();
                $ctrl->delete($id);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Participants ---
        case 'participants':
            $ctrl = new ParticipantController(getDB());
            if ($method === 'GET' && $id) {
                // GET /participants/{tournamentId}
                $ctrl->listByTournament($id);
            } elseif ($method === 'POST') {
                requireAuth();
                $ctrl->create($body);
            } elseif ($method === 'DELETE' && $id) {
                requireAuth();
                $ctrl->delete($id);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Teams ---
        case 'teams':
            $ctrl = new TeamController(getDB());
            if ($method === 'GET' && $id) {
                $ctrl->listByTournament($id);
            } elseif ($method === 'POST' && !$id) {
                requireAuth();
                $ctrl->draw($body); // draw teams from participants
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
            }
            break;

        // --- Matches ---
        case 'matches':
            $ctrl = new MatchController(getDB());
            if ($method === 'GET' && $id) {
                $ctrl->bracket($id); // GET /matches/{tournamentId}
            } elseif ($method === 'PUT' && $id) {
                requireAuth();
                $ctrl->updateScore($id, $body);
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
