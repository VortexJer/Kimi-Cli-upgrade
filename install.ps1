# Instalador de kimi-cli-upgrade para Windows/PowerShell
$ErrorActionPreference = "Stop"

$repoDir = $PSScriptRoot
if (-not $repoDir) {
    $repoDir = Get-Location
}

$kimi1Path = Join-Path $repoDir "bin\kimi1.js"
$kimi1Line = "function kimi1 { node `"$kimi1Path`" @args }"
$kimiLine = "function kimi { node `"$kimi1Path`" @args }"

$profilePaths = @(
    "$HOME\Documents\PowerShell\Microsoft.PowerShell_profile.ps1",
    "$HOME\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1"
)

foreach ($profilePath in $profilePaths) {
    $dir = Split-Path $profilePath
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    if (Test-Path $profilePath) {
        $backup = "$profilePath.kimi1-backup-$(Get-Date -Format 'yyyyMMddHHmmss')"
        Copy-Item $profilePath $backup -Force
        Write-Host "Backup creado: $backup" -ForegroundColor Gray

        $content = Get-Content $profilePath -Raw

        if ($content -notmatch 'function kimi1') {
            Add-Content $profilePath "`n# kimi1 alias`n$kimi1Line`n" -NoNewline
            Write-Host "Alias 'kimi1' anadido a: $profilePath" -ForegroundColor Green
        } else {
            Write-Host "Alias 'kimi1' ya existe en: $profilePath" -ForegroundColor Yellow
        }
    } else {
        Set-Content $profilePath "# kimi1 alias`n$kimi1Line`n" -Encoding UTF8
        Write-Host "Perfil creado y alias 'kimi1' anadido a: $profilePath" -ForegroundColor Green
    }
}

Write-Host "`nInstalacion completa." -ForegroundColor Green
Write-Host "Reinicia PowerShell y usa: kimi1 --help" -ForegroundColor Cyan
Write-Host "Para redirigir tambien 'kimi' -> 'kimi1', ejecuta: kimi1 --enable-kimi" -ForegroundColor Cyan

# Instalar selector interactivo de historial (modulo PowerShell)
$historyInstall = Join-Path $repoDir "powershell\install-history.ps1"
if (Test-Path $historyInstall) {
    Write-Host "`nInstalando selector interactivo de historial..." -ForegroundColor Cyan
    & $historyInstall
}
