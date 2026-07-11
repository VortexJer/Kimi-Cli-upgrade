#Requires -Version 5.1
<#
.SYNOPSIS
    Historial interactivo de sesiones de Kimi Code CLI.
.DESCRIPTION
    Muestra un selector con flechas de las sesiones guardadas y reanuda la elegida.
    Expone una funcion 'kimi' que intercepta --history / --h y delega el resto al binario original.
#>

$script:KimiIndexPath = Join-Path $env:USERPROFILE ".kimi-code/session_index.jsonl"

function Get-Kimi1Executable {
    <#
    .SYNOPSIS
        Busca el ejecutable/binario de kimi1 (wrapper) o el kimi original como fallback.
    #>
    $kimi1 = (Get-Command kimi1 -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    if ($kimi1) { return $kimi1 }

    $kimi = (Get-Command kimi -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    return $kimi
}

function Get-KimiSessions {
    if (-not (Test-Path $script:KimiIndexPath)) {
        return @()
    }

    Get-Content $script:KimiIndexPath -Encoding UTF8 | ForEach-Object {
        if ([string]::IsNullOrWhiteSpace($_)) { return }
        try {
            $entry = $_ | ConvertFrom-Json
        } catch {
            return
        }

        $statePath = Join-Path $entry.sessionDir "state.json"
        $title = ""
        $updatedAt = $null
        $createdAt = $null
        if (Test-Path $statePath) {
            try {
                $state = Get-Content $statePath -Encoding UTF8 | ConvertFrom-Json
                $title = $state.title
                $updatedAt = $state.updatedAt
                $createdAt = $state.createdAt
            } catch {
                # Ignorar estados corruptos
            }
        }

        $sortDate = if ($updatedAt) { $updatedAt } elseif ($createdAt) { $createdAt } else { "1970-01-01T00:00:00Z" }

        [PSCustomObject]@{
            SessionId = $entry.sessionId
            Title     = $title
            UpdatedAt = $updatedAt
            CreatedAt = $createdAt
            WorkDir   = $entry.workDir
            SortDate  = $sortDate
        }
    } | Sort-Object { [DateTime]::Parse($_.SortDate) } -Descending
}

function Show-KimiHistory {
    [CmdletBinding()]
    param()

    $sessions = Get-KimiSessions

    if ($sessions.Count -eq 0) {
        Write-Host "No se encontraron sesiones guardadas de Kimi." -ForegroundColor Yellow
        return
    }

    $selected = 0
    $done = $false
    $cancelled = $false

    $originalCursorVisible = [Console]::CursorVisible
    [Console]::CursorVisible = $false

    try {
        while (-not $done) {
            Clear-Host
            Write-Host "Selecciona una sesion de Kimi (flechas arriba/abajo, Enter abrir, Esc salir)" -ForegroundColor Cyan
            Write-Host ""

            for ($i = 0; $i -lt $sessions.Count; $i++) {
                $isSelected = ($i -eq $selected)
                $prefix = if ($isSelected) { "> " } else { "  " }
                $dateStr = ""
                if ($sessions[$i].UpdatedAt) {
                    $dt = [DateTime]::Parse($sessions[$i].UpdatedAt)
                    $dateStr = $dt.ToString("yyyy-MM-dd HH:mm")
                }
                $title = $sessions[$i].Title
                if ([string]::IsNullOrWhiteSpace($title)) {
                    $title = "(sin titulo)"
                }
                if ($title.Length -gt 70) {
                    $title = $title.Substring(0, 70) + "..."
                }

                if ($isSelected) {
                    Write-Host $prefix -NoNewline -ForegroundColor Green
                    Write-Host "$dateStr  " -NoNewline -ForegroundColor Green
                    Write-Host "$($sessions[$i].SessionId)" -ForegroundColor Green
                    Write-Host "   $title" -ForegroundColor DarkGray
                } else {
                    Write-Host "$prefix$dateStr  $($sessions[$i].SessionId)" -ForegroundColor White
                    Write-Host "   $title" -ForegroundColor DarkGray
                }
            }

            $key = [Console]::ReadKey($true)
            switch ($key.Key) {
                ([ConsoleKey]::UpArrow) {
                    $selected = [Math]::Max(0, $selected - 1)
                }
                ([ConsoleKey]::DownArrow) {
                    $selected = [Math]::Min($sessions.Count - 1, $selected + 1)
                }
                ([ConsoleKey]::Enter) {
                    $done = $true
                }
                ([ConsoleKey]::Escape) {
                    $done = $true
                    $cancelled = $true
                }
            }
        }
    } finally {
        [Console]::CursorVisible = $originalCursorVisible
        Clear-Host
    }

    if ($cancelled) {
        return
    }

    $sessionId = $sessions[$selected].SessionId
    Write-Host "Abriendo $sessionId ..." -ForegroundColor Cyan

    $kimi1 = Get-Kimi1Executable
    if (-not $kimi1) {
        Write-Host "No se encontro 'kimi1' ni el ejecutable original de 'kimi'." -ForegroundColor Red
        return
    }

    if ($kimi1 -match "kimi1") {
        & $kimi1 -S $sessionId
    } else {
        & $kimi1 --session=$sessionId
    }
}

function kimi {
    <#
    .SYNOPSIS
        Wrapper de Kimi que anade --history / --h para seleccionar sesiones con flechas.
        Delega el resto de comandos a kimi1 (wrapper principal) si esta disponible.
    #>
    if ($args -contains "--history" -or $args -contains "--h") {
        Show-KimiHistory
    } else {
        $kimi1 = Get-Kimi1Executable
        if (-not $kimi1) {
            Write-Error "No se encontro 'kimi1' ni el ejecutable original de 'kimi'."
            return
        }
        & $kimi1 @args
    }
}

Export-ModuleMember -Function Show-KimiHistory, kimi, Get-Kimi1Executable
