<?php
/**
 * change-password.php
 *
 * One-time CLI utility to set or change an admin password.
 * Run from the project root:
 *
 *   php change-password.php <username> <new-password>
 *
 * Example:
 *   php change-password.php admin mySecurePassword123
 *
 * DELETE THIS FILE after use, or restrict access to it in Apache.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    die("This script must be run from the command line.\n");
}

if ($argc < 3) {
    echo "Usage: php change-password.php <username> <new-password>\n";
    exit(1);
}

$username = $argv[1];
$password = $argv[2];

if (strlen($password) < 8) {
    echo "Error: Password must be at least 8 characters.\n";
    exit(1);
}

require_once __DIR__ . '/api/config/database.php';

$db = getDB();

$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

$stmt = $db->prepare('SELECT id FROM admins WHERE username = ?');
$stmt->execute([$username]);
$existing = $stmt->fetch();

if ($existing) {
    $db->prepare('UPDATE admins SET password_hash = ? WHERE username = ?')
       ->execute([$hash, $username]);
    echo "Password updated for admin: $username\n";
} else {
    $db->prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)')
       ->execute([$username, $hash]);
    echo "New admin created: $username\n";
}
