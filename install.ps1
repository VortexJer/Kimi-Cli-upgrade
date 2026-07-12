# Instalador de kimi-cli-upgrade para Windows/PowerShell
$ErrorActionPreference = "Stop"

$repoDir = $PSScriptRoot
if (-not $repoDir) {
    $repoDir = Get-Location
}

$kimi1Script = Join-Path $repoDir "bin\kimi1.js"

function Show-Menu {
    param(
        [Parameter(Mandatory)] [string]$Title,
        [Parameter(Mandatory)] [array]$Options,
        [int]$DefaultIndex = 0
    )

    Write-Host "`n$Title" -ForegroundColor Cyan
    $selected = $DefaultIndex
    $done = $false

    while (-not $done) {
        for ($i = 0; $i -lt $Options.Length; $i++) {
            $prefix = if ($i -eq $selected) { "> " } else { "  " }
            $color = if ($i -eq $selected) { 'Green' } else { 'Gray' }
            Write-Host "$prefix[$($i + 1)] $($Options[$i])" -ForegroundColor $color
        }

        $key = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
        switch ($key.VirtualKeyCode) {
            38 { # Up
                $selected = if ($selected -gt 0) { $selected - 1 } else { $Options.Length - 1 }
            }
            40 { # Down
                $selected = if ($selected -lt ($Options.Length - 1)) { $selected + 1 } else { 0 }
            }
            13 { # Enter
                $done = $true
            }
            27 { # Esc
                $selected = $DefaultIndex
                $done = $true
            }
        }

        if (-not $done) {
            $cursorTop = [Console]::CursorTop - $Options.Length
            if ($cursorTop -ge 0) {
                [Console]::SetCursorPosition(0, $cursorTop)
            }
        }
    }

    return $selected
}

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

# Ask for max_steps preference with arrow-key menu
$stepsOptions = @(
    "3   - aggressive token saving",
    "5   - balanced",
    "10  - conservative",
    "unlimited - let Kimi use as many as allowed"
)
$stepsIndex = Show-Menu -Title "Choose max_steps_per_turn:" -Options $stepsOptions -DefaultIndex 3
$stepsValue = switch ($stepsIndex) {
    0 { 3 }
    1 { 5 }
    2 { 10 }
    default { 1000 }
}
Write-Host "Setting max_steps_per_turn to $stepsValue..." -ForegroundColor Cyan
& node "$kimi1Script" --max-steps $stepsValue

# Ask for thinking preference with arrow-key menu
$thinkingOptions = @(
    "OFF - fewer tokens, faster (default)",
    "ON  - reasoning chain visible, more tokens"
)
$thinkingIndex = Show-Menu -Title "Choose thinking mode:" -Options $thinkingOptions -DefaultIndex 0
$thinkingValue = if ($thinkingIndex -eq 1) { "true" } else { "false" }
Write-Host "Setting thinking.enabled to $thinkingValue..." -ForegroundColor Cyan
& node "$kimi1Script" --thinking $thinkingValue

# Ask for compact reminder preference with arrow-key menu
$compactOptions = @(
    "off        - no reminder (default, safest)",
    "safe       - remind at >24 messages or wire >1 MB",
    "aggressive - remind at >12 messages or wire >500 KB"
)
$compactIndex = Show-Menu -Title "Choose compact reminder mode (reminds you to type /compact inside the chat):" -Options $compactOptions -DefaultIndex 0
$compactMode = switch ($compactIndex) {
    1 { "safe" }
    2 { "aggressive" }
    default { "off" }
}
Write-Host "Setting compact reminder mode to $compactMode..." -ForegroundColor Cyan
& node "$kimi1Script" --compact-mode $compactMode

# Activate the PowerShell redirect via the wrapper itself
Write-Host "Activating 'kimi' -> 'kimi1' redirect..." -ForegroundColor Cyan
& node "$kimi1Script" --enable-kimi

Write-Host "`nInstallation complete." -ForegroundColor Green
Write-Host "Restart PowerShell. From then on 'kimi' will use the kimi1 wrapper." -ForegroundColor Cyan
Write-Host "To disable the redirect: kimi1 --disable-kimi" -ForegroundColor Cyan
Write-Host "To re-run this installer: .\install.ps1" -ForegroundColor Gray
