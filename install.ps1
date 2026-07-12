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

# Ask for thinking preference
Write-Host "`nConfigure thinking mode:" -ForegroundColor Cyan
Write-Host "  ON  = Kimi shows its reasoning chain (better quality, more tokens)." -ForegroundColor Gray
Write-Host "  OFF = Kimi answers directly (fewer tokens, faster)." -ForegroundColor Gray
$thinkingInput = Read-Host "Enable thinking? (y/N, default: N)"
$thinkingValue = "false"
if (-not [string]::IsNullOrWhiteSpace($thinkingInput)) {
    if ($thinkingInput -match '^[yY]') {
        $thinkingValue = "true"
    }
}

Write-Host "Setting thinking.enabled to $thinkingValue..." -ForegroundColor Cyan
& node "$kimi1Script" --thinking $thinkingValue

# Ask for automatic session compaction preference
Write-Host "`nConfigure automatic session compaction:" -ForegroundColor Cyan
Write-Host "  When you resume a session, the wrapper can compact its wire.jsonl" -ForegroundColor Gray
Write-Host "  to remove loop noise and shrink the context sent to Kimi." -ForegroundColor Gray
Write-Host "  safe      = keep last 30 messages (recommended, lower risk)." -ForegroundColor Gray
Write-Host "  aggressive= keep last 10 messages (more savings, more risk)." -ForegroundColor Gray
Write-Host "  off       = do not auto-compact." -ForegroundColor Gray
$compactInput = Read-Host "Auto-compact mode? (safe/aggressive/off, default: safe)"

$compactMode = "safe"
if (-not [string]::IsNullOrWhiteSpace($compactInput)) {
    $compactLower = $compactInput.ToLower()
    if ($compactLower -in @("safe", "aggressive", "off")) {
        $compactMode = $compactLower
    } else {
        Write-Warning "Invalid input. Using default safe."
    }
}

Write-Host "Setting auto-compaction to $compactMode..." -ForegroundColor Cyan
& node "$kimi1Script" --auto-compact $compactMode

# Activate the PowerShell redirect via the wrapper itself
Write-Host "Activating 'kimi' -> 'kimi1' redirect..." -ForegroundColor Cyan
& node "$kimi1Script" --enable-kimi

Write-Host "`nInstallation complete." -ForegroundColor Green
Write-Host "Restart PowerShell. From then on 'kimi' will use the kimi1 wrapper." -ForegroundColor Cyan
Write-Host "To disable the redirect: kimi1 --disable-kimi" -ForegroundColor Cyan
Write-Host "Note: The wrapper auto-continues when Kimi hits its 5-step per-turn limit." -ForegroundColor Gray
