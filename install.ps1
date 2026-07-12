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

# Ask for max_steps preference
Write-Host "`nConfigure max_steps_per_turn:" -ForegroundColor Cyan
Write-Host "  This limits how many tool steps Kimi can take inside a single turn." -ForegroundColor Gray
Write-Host "  Lower = less tokens per turn, but may stop mid-task." -ForegroundColor Gray
Write-Host "  Higher = more work per turn, but uses more tokens." -ForegroundColor Gray
Write-Host "  Note: the official Kimi binary has been observed to cap this at 5." -ForegroundColor Gray
Write-Host "  Choosing 'unlimited' sets a high value so Kimi uses as many as allowed." -ForegroundColor Gray
$stepsInput = Read-Host "Enter a number (3/aggressive, 5/balanced, 10+/conservative) or press ENTER for unlimited"

$stepsValue = 1000  # default: effectively unlimited
if (-not [string]::IsNullOrWhiteSpace($stepsInput)) {
    if ($stepsInput -match '^\d+$') {
        $stepsValue = [int]$stepsInput
    } else {
        Write-Warning "Invalid input. Using default unlimited."
    }
}

Write-Host "Setting max_steps_per_turn to $stepsValue..." -ForegroundColor Cyan
& node "$kimi1Script" --max-steps $stepsValue

# Activate the PowerShell redirect via the wrapper itself
Write-Host "Activating 'kimi' -> 'kimi1' redirect..." -ForegroundColor Cyan
& node "$kimi1Script" --enable-kimi

Write-Host "`nInstallation complete." -ForegroundColor Green
Write-Host "Restart PowerShell. From then on 'kimi' will use the kimi1 wrapper." -ForegroundColor Cyan
Write-Host "To disable the redirect: kimi1 --disable-kimi" -ForegroundColor Cyan
Write-Host "Note: The wrapper auto-continues when Kimi hits its 5-step per-turn limit." -ForegroundColor Gray
