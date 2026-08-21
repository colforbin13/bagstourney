<?php
// tests/bootstrap.php
//
// Loads the pure library classes under test. Deliberately does NOT load
// api/config/database.php or any controller: everything in tests/ must run with no
// database, no network, and no credentials, so the suite is safe to run anywhere.

require_once __DIR__ . '/../api/lib/BracketBuilder.php';
