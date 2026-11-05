# fix-frontend-build.ps1 - Recover from the Angular build/serve error:
#   "Could not find the '@angular-devkit/build-angular:...' builder's node package."
#
# What's actually wrong: node_modules/@angular-devkit/build-angular loses its own
# package.json, builders.json, and compiled index.js while its nested node_modules/
# and src/ folders stay in place, so npm's install looks complete but Angular can't
# resolve the builder. Best diagnosis so far: a leftover `ng serve`/`npm start` (or its
# esbuild.exe child) still running, or force-killed instead of stopped normally, holds
# the Angular build cache open (including a native @lmdb binary) and can corrupt this
# package when node_modules gets touched around the same time. Not fully proven, but
# consistent enough across repeated recoveries to guard against here.
#
# This script stops any leftover node.exe/esbuild.exe still running out of
# frontend/node_modules, wipes node_modules, and reinstalls clean from
# package-lock.json.
#
# Usage (from anywhere; run from the project root as documented for deploy.ps1):
#   .\fix-frontend-build.ps1
#   .\fix-frontend-build.ps1 -Verify   # also runs a production build afterward to confirm

param(
    [switch]$Verify
)

$ErrorActionPreference = "Stop"

$frontendPath = Join-Path $PSScriptRoot "frontend"
$nodeModulesPath = Join-Path $frontendPath "node_modules"

if (-not (Test-Path -LiteralPath $frontendPath)) {
    throw "Could not find $frontendPath - run this script from the bags repo (or leave it at the repo root)."
}

Write-Host "==> Checking for leftover ng serve / npm start / esbuild processes for this project..." -ForegroundColor Green

# esbuild.exe is matched by where it's running from; node.exe (which covers `ng serve`,
# `npm start`, etc.) doesn't run from node_modules itself, so it's matched by whether its
# command line references this frontend folder instead. Only ever a plain Stop-Process,
# never -Force - see note at the top of this file.
$stray = Get-CimInstance Win32_Process -Filter "Name = 'esbuild.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($nodeModulesPath, [StringComparison]::OrdinalIgnoreCase) }
$stray += Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($frontendPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 }

if ($stray) {
    foreach ($proc in $stray) {
        Write-Host "    Stopping $($proc.Name) (PID $($proc.ProcessId))..." -ForegroundColor Yellow
        Stop-Process -Id $proc.ProcessId -Confirm:$false -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "    None found." -ForegroundColor Green
}

Write-Host "==> Removing $nodeModulesPath ..." -ForegroundColor Green
if (Test-Path -LiteralPath $nodeModulesPath) {
    # A file can still be transiently locked right after a process exits (or by an
    # antivirus real-time scan), so retry a few times before giving up.
    $attempts = 0
    do {
        $attempts++
        try {
            Remove-Item -LiteralPath $nodeModulesPath -Recurse -Force -ErrorAction Stop
            $removed = $true
        } catch {
            $removed = $false
            if ($attempts -ge 5) {
                throw "Could not remove $nodeModulesPath after $attempts attempts (last error: $($_.Exception.Message)). Close any editors/terminals with this project open and re-run."
            }
            Write-Host "    Still locked, retrying in 2s (attempt $attempts/5)..." -ForegroundColor Yellow
            Start-Sleep -Seconds 2
        }
    } while (-not $removed)
}

Write-Host "==> Reinstalling dependencies (npm ci)..." -ForegroundColor Green
Push-Location $frontendPath
try {
    npm.cmd ci

    $buildAngularPkg = Join-Path $nodeModulesPath "@angular-devkit\build-angular\package.json"
    if (-not (Test-Path -LiteralPath $buildAngularPkg)) {
        throw "npm ci finished but @angular-devkit/build-angular is still missing package.json - the install itself may have been interrupted this time. Try running this script again."
    }
    Write-Host "==> @angular-devkit/build-angular looks intact." -ForegroundColor Green

    if ($Verify) {
        Write-Host "==> Running a production build to confirm..." -ForegroundColor Green
        npm.cmd run build:prod
        Write-Host "==> Build succeeded." -ForegroundColor Green
    }
} finally {
    Pop-Location
}

Write-Host "==> Done." -ForegroundColor Green
