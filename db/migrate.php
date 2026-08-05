<?php
// Run from the repository root: php db/migrate.php
// Applies each SQL file in db/migrations once and records it in schema_migrations.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("This script may only be run from the command line.\n");
}

require_once __DIR__ . '/../api/config/database.php';

$db = getDB();
$db->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)');

$files = glob(__DIR__ . '/migrations/*.sql');
sort($files, SORT_STRING);

foreach ($files as $file) {
    $version = basename($file);
    $check = $db->prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
    $check->execute([$version]);
    if ($check->fetchColumn()) {
        echo "Skipped {$version} (already applied)\n";
        continue;
    }

    $sql = file_get_contents($file);
    if ($sql === false) {
        throw new RuntimeException("Unable to read {$version}");
    }

    try {
        $db->exec($sql);
        $record = $db->prepare('INSERT INTO schema_migrations (version) VALUES (?)');
        $record->execute([$version]);
        echo "Applied {$version}\n";
    } catch (Throwable $e) {
        fwrite(STDERR, "Failed {$version}: {$e->getMessage()}\n");
        exit(1);
    }
}
