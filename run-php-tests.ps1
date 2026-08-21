# run-php-tests.ps1 - Run the PHP unit test suite (tests/).
#
# Usage (run from project root):
#   .\run-php-tests.ps1
#   .\run-php-tests.ps1 --filter BracketBuilder     # any extra args pass through to PHPUnit
#
# PHPUnit ships as a single .phar and is downloaded on first run into tools/ (gitignored).
# There is deliberately no Composer dependency: production runs PHP 7.2 on hardware that
# can't be upgraded yet, and the repo has never had a vendor/ directory. The tests are
# dev-only and are never deployed — deploy.ps1 copies api/ and dist/browser/, not tests/.
#
# Note this runs the suite on your LOCAL PHP (8.x). The code under test is written to
# PHP 7.2 rules so it also runs in production; the suite does not verify that on its own.

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
$phpArgs = @(
    "-d", "extension=mbstring",
    "-d", "date.timezone=UTC",
    $PharPath
) + $args

& php @phpArgs
exit $LASTEXITCODE
