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
    Write-Host "Instalando dependencias de Node.js..." -ForegroundColor Cyan
    Push-Location $repoDir
    try {
        & npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    } finally {
        Pop-Location
    }
    Write-Host "Dependencias instaladas." -ForegroundColor Green
} else {
    Write-Host "Dependencias ya instaladas." -ForegroundColor Gray
}

# Activate the PowerShell redirect via the wrapper itself
Write-Host "Activando redireccion 'kimi' -> 'kimi1'..." -ForegroundColor Cyan
& node "$kimi1Script" --enable-kimi

Write-Host "`nInstalacion completa." -ForegroundColor Green
Write-Host "Reinicia PowerShell. A partir de entonces 'kimi' usara el wrapper kimi1." -ForegroundColor Cyan
Write-Host "Para desactivar la redireccion: kimi1 --disable-kimi" -ForegroundColor Cyan
