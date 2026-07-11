<#
.SYNOPSIS
    Desinstala el selector interactivo de historial de sesiones de Kimi del perfil de PowerShell.
    Este script forma parte de kimi-cli-upgrade.
#>
[CmdletBinding()]
param()

$profileFiles = @(
    $PROFILE.CurrentUserCurrentHost,
    $PROFILE.CurrentUserAllHosts
) | Select-Object -Unique

foreach ($profilePath in $profileFiles) {
    if (-not $profilePath -or -not (Test-Path $profilePath)) { continue }
    $lines = Get-Content $profilePath -Encoding UTF8 | Where-Object {
        $_ -notlike "*KimiHistory.psm1*" -and
        $_ -notlike "*Kimi session history selector*"
    }
    Set-Content -Path $profilePath -Value $lines -Encoding UTF8
    Write-Host "Limpiado: $profilePath" -ForegroundColor Green
}

Write-Host "`nDesinstalacion completa. Reinicia PowerShell." -ForegroundColor Cyan
