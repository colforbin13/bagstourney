# run-php-tests.ps1 - Run the PHP unit test suite (tests/).
#
# Usage (run from project root):
#   .\run-php-tests.ps1
#   .\run-php-tests.ps1 --filter BracketBuilder     # any extra args pass through to PHPUnit
#
# PHPUnit ships as a single .phar and is downloaded on first run into tools/ (gitignored).
# There is deliberately no Composer dependency and the repo has never had a vendor/
# directory — originally forced by a PHP 7.2 production server, now kept by preference
# (see AGENTS.md). The tests are dev-only and are never deployed — deploy.ps1 copies
# api/ and dist/browser/, not tests/.
#
# This runs the suite on your LOCAL PHP. Since production moved to 8.5.4 that is finally
# the same language level as the code under test, so a green run here is real evidence
# about production rather than the near-coincidence it was under the PHP 7.2 rule.

$ErrorActionPreference = "Stop"

$PhpUnitVersion = "11"
$ToolsDir = Join-Path $PSScriptRoot "tools"
$PharPath = Join-Path $ToolsDir "phpunit.phar"

if (-not (Test-Path $ToolsDir)) {
    New-Item -ItemType Directory -Path $ToolsDir | Out-Null
}

if (-not (Test-Path $PharPath)) {
    Write-Host "Downloading PHPUnit $PhpUnitVersion..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://phar.phpunit.de/phpunit-$PhpUnitVersion.phar" -OutFile $PharPath
}

# mbstring is required by PHPUnit and is present but not enabled in this machine's php.ini;
# date.timezone silences a startup warning from an invalid ini value. Both are loaded
# per-invocation rather than editing the (admin-protected) global ini — the same approach
# the API's local dev server uses for pdo_mysql.
# pdo_sqlite backs tests/MatchCascadeTest.php, which drives the real match-state machine
# against an in-memory database — the cascade reads back state it just wrote, so a statement
# recorder cannot cover it. Still nothing external: no server, no network, no credentials.
$phpArgs = @(
    "-d", "extension=mbstring",
    "-d", "extension=pdo_sqlite",
    "-d", "date.timezone=UTC",
    $PharPath
) + $args

& php @phpArgs
exit $LASTEXITCODE
