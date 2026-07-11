# Instalador de kimi-cli-upgrade para Windows/PowerShell
$ErrorActionPreference = "Stop"

$repoDir = $PSScriptRoot
if (-not $repoDir) {
    $repoDir = Get-Location
}

$kimi1Path = Join-Path $repoDir "bin\kimi1.js"
$kimi1Line = "function kimi1 { node `"$kimi1Path`" @args }"

$profilePaths = @(
    "$HOME\Documents\PowerShell\Microsoft.PowerShell_profile.ps1",
    "$HOME\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1"
)

$hybridWrapperTemplate = @'

# BEGIN kimi hybrid wrapper
if (Get-Alias kimi -ErrorAction SilentlyContinue) { Remove-Alias kimi -Force }
function kimi {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$KimiArgs)
    $kimi1Flags = @{
        '--history' = $true; '--hist' = $true; '--sessions' = $true; '--select' = $true; '--pick' = $true;
        '--list' = $true; '--list-history' = $true; '--table' = $true;
        '--rename-sessions' = $true; '--rs' = $true;
        '--clean-empty' = $true; '--clean' = $true; '--purge' = $true;
        '--dry-run' = $true; '--dr' = $true;
        '--enable-kimi' = $true; '--e-k' = $true;
        '--disable-kimi' = $true; '--d-k' = $true;
        '-h' = $true; '-l' = $true; '-rs' = $true; '-ce' = $true; '-dr' = $true;
        '-e' = $true; '-d' = $true; '-he' = $true; '-i' = $true; '-r' = $true
    }
    $useKimi1 = $false
    foreach ($arg in $KimiArgs) {
        if ($kimi1Flags.ContainsKey($arg)) { $useKimi1 = $true; break }
    }
    $kimiExe = (Get-Command kimi -CommandType Application | Select-Object -First 1).Source
    if ($KimiArgs -contains '--help') {
        & $kimiExe --help
        Write-Host ''
        node "__KIMI1_PATH__" --help
        return
    }
    if ($useKimi1) {
        node "__KIMI1_PATH__" @KimiArgs
    } else {
        & $kimiExe @KimiArgs
    }
}
# END kimi hybrid wrapper

'@

$hybridWrapper = $hybridWrapperTemplate.Replace('__KIMI1_PATH__', $kimi1Path)

foreach ($profilePath in $profilePaths) {
    $dir = Split-Path $profilePath
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    if (Test-Path $profilePath) {
        # Clean up legacy or previous kimi wrappers to avoid duplicates
        $content = Get-Content $profilePath -Raw
        $legacyMarker = '# kimi redirect to kimi1'
        $startMarker = '# BEGIN kimi hybrid wrapper'
        $endMarker = '# END kimi hybrid wrapper'
        $needsSave = $false
        if ($content -match [regex]::Escape($legacyMarker)) {
            $idx = $content.IndexOf($legacyMarker)
            $before = $content.Substring(0, $idx)
            $after = $content.Substring($idx)
            $fnIdx = $after.IndexOf("`nfunction kimi {")
            if ($fnIdx -ge 0) {
                $after = $after.Substring($fnIdx + 1)
                $fnEnd = $after.IndexOf("`n}`n")
                if ($fnEnd -ge 0) { $after = $after.Substring($fnEnd + 3) }
            }
            $content = $before + $after
            $needsSave = $true
        }
        while ($content -match [regex]::Escape($startMarker)) {
            $idx = $content.IndexOf($startMarker)
            $endIdx = $content.IndexOf($endMarker, $idx)
            if ($endIdx -lt 0) { break }
            $content = $content.Substring(0, $idx) + $content.Substring($endIdx + $endMarker.Length)
            $needsSave = $true
        }
        if ($needsSave) {
            $backup = "$profilePath.kimi1-backup-$(Get-Date -Format 'yyyyMMddHHmmss')"
            Copy-Item $profilePath $backup -Force
            Set-Content $profilePath $content -Encoding UTF8
            Write-Host "Wrapper antiguo de 'kimi' eliminado de: $profilePath" -ForegroundColor Gray
        }
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

        if ($content -notmatch '# BEGIN kimi hybrid wrapper') {
            Add-Content $profilePath $hybridWrapper -NoNewline
            Write-Host "Wrapper hibrido 'kimi' anadido a: $profilePath" -ForegroundColor Green
        } else {
            Write-Host "Wrapper hibrido 'kimi' ya existe en: $profilePath" -ForegroundColor Yellow
        }
    } else {
        Set-Content $profilePath "# kimi1 alias`n$kimi1Line`n$hybridWrapper" -Encoding UTF8
        Write-Host "Perfil creado con alias 'kimi1' y wrapper 'kimi' en: $profilePath" -ForegroundColor Green
    }
}

Write-Host "`nInstalacion completa." -ForegroundColor Green
Write-Host "Reinicia PowerShell. Los comandos de kimi1 estan disponibles via 'kimi' (ej: 'kimi --history')." -ForegroundColor Cyan
Write-Host "Para desinstalar el wrapper hibrido: kimi1 --disable-kimi" -ForegroundColor Cyan
