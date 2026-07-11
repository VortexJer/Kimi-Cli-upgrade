<#
.SYNOPSIS
    Instala el selector interactivo de historial de Kimi en el perfil de PowerShell.
    Este script forma parte de kimi-cli-upgrade.
#>
[CmdletBinding()]
param()

$modulePath = Join-Path $PSScriptRoot "KimiHistory.psm1"

if (-not (Test-Path $modulePath)) {
    Write-Error "No se encontro el modulo en $modulePath."
    exit 1
}

$profileFiles = @(
    $PROFILE.CurrentUserCurrentHost,
    $PROFILE.CurrentUserAllHosts
) | Select-Object -Unique

$importLine = "Import-Module `"$modulePath`""

foreach ($profilePath in $profileFiles) {
    if (-not $profilePath) { continue }
    $dir = Split-Path $profilePath -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    if (-not (Test-Path $profilePath)) {
        New-Item -ItemType File -Force -Path $profilePath | Out-Null
    }

    $content = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
    if (-not $content) { $content = "" }
    if ($content -notlike "*$importLine*") {
        Add-Content -Path $profilePath -Value "`n# Kimi session history selector (kimi-cli-upgrade)`n$importLine`n" -Encoding UTF8
        Write-Host "Anadido al perfil: $profilePath" -ForegroundColor Green
    } else {
        Write-Host "Ya estaba registrado en: $profilePath" -ForegroundColor DarkGray
    }
}

Write-Host "`nInstalacion completa." -ForegroundColor Green
Write-Host "Reinicia PowerShell o ejecuta: . `$PROFILE" -ForegroundColor Cyan
Write-Host "Luego prueba: kimi --history   o   kimi --h" -ForegroundColor Cyan
