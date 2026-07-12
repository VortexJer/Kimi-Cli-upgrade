# Instalador de kimi-cli-upgrade para Windows/PowerShell
$ErrorActionPreference = "Stop"

$repoDir = $PSScriptRoot
if (-not $repoDir) {
    $repoDir = Get-Location
}

$kimi1Script = Join-Path $repoDir "bin\kimi1.js"

# Ensure Node.js dependencies are installed
$nodeModules = Join-Path $repoDir "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "Installing Node.js dependencies..." -ForegroundColor Cyan
    Push-Location $repoDir
    try {
        & npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    } finally {
        Pop-Location
    }
    Write-Host "Dependencies installed." -ForegroundColor Green
} else {
    Write-Host "Dependencies already installed." -ForegroundColor Gray
}

# Migrate official Kimi sessions so --history shows everything from day one
Write-Host "Migrating official Kimi session history..." -ForegroundColor Cyan
& node "$kimi1Script" --migrate-history

# Set max_steps to the effective cap enforced by the Kimi binary (5).
# Higher values are silently ignored by kimi.exe, so we align the config.
Write-Host "Setting max_steps_per_turn to 5 (Kimi binary hard cap)..." -ForegroundColor Cyan
& node "$kimi1Script" --max-steps 5

# Activate the PowerShell redirect via the wrapper itself
Write-Host "Activating 'kimi' -> 'kimi1' redirect..." -ForegroundColor Cyan
& node "$kimi1Script" --enable-kimi

Write-Host "`nInstallation complete." -ForegroundColor Green
Write-Host "Restart PowerShell. From then on 'kimi' will use the kimi1 wrapper." -ForegroundColor Cyan
Write-Host "To disable the redirect: kimi1 --disable-kimi" -ForegroundColor Cyan
Write-Host "Note: The wrapper auto-continues when Kimi hits its 5-step per-turn limit." -ForegroundColor Gray
