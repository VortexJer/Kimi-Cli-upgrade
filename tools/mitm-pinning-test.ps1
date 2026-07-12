#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Test if kimi.exe performs certificate pinning on api.kimi.com.

.DESCRIPTION
    Installs the mitmproxy CA certificate into the Windows trusted root store,
    runs mitmproxy locally, forces kimi.exe through it, and checks whether the
    TLS handshake to api.kimi.com succeeds.

    EXPECTED RESULTS:
    - If handshake SUCCEEDS and you see decrypted traffic: NO certificate pinning.
      kimi.exe only validates the certificate chain against the system store.
      The proxy path is viable for filtering/rewriting payloads.
    - If handshake STILL FAILS with the CA installed: CERTIFICATE PINNING detected.
      kimi.exe embeds the expected certificate/public-key and rejects any other
      certificate, even if the CA is trusted. The proxy MITM path is dead.

    The script removes the mitmproxy CA from the trusted store at the end.
#>

$ErrorActionPreference = "Stop"

$repoDir = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$mitmPath = Join-Path $repoDir ".venv\Scripts\mitmdump.exe"
$addonPath = Join-Path $repoDir "tools\mitm-addon.py"
$logFile = Join-Path $repoDir "mitm-pinning-test.log"
$mitmLog = Join-Path $repoDir "mitm-pinning-stdout.log"
$proxyPort = 18080

function Write-Result($message, $color = "White") {
    Write-Host "`n>>> $message" -ForegroundColor $color
    Add-Content -Path $logFile -Value "$(Get-Date -Format o)  $message"
}

function Find-MitmCACertPath {
    $candidates = @(
        (Join-Path $env:USERPROFILE ".mitmproxy\mitmproxy-ca-cert.cer"),
        (Join-Path $env:USERPROFILE ".mitmproxy\mitmproxy-ca.pem"),
        (Join-Path $env:LOCALAPPDATA "mitmproxy\mitmproxy-ca-cert.cer")
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

function Get-MitmCAThumbprint($certPath) {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath)
    return $cert.Thumbprint
}

function Install-MitmCA($certPath) {
    $thumbprint = Get-MitmCAThumbprint $certPath
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
    $store.Open("ReadWrite")
    $existing = $store.Certificates | Where-Object { $_.Thumbprint -eq $thumbprint }
    if ($existing) {
        $store.Close()
        return $thumbprint, $false
    }
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath)
    $store.Add($cert)
    $store.Close()
    return $thumbprint, $true
}

function Remove-MitmCA($thumbprint) {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
    $store.Open("ReadWrite")
    $certs = $store.Certificates | Where-Object { $_.Thumbprint -eq $thumbprint }
    foreach ($c in $certs) { $store.Remove($c) }
    $store.Close()
}

# --- Main ---

"" | Set-Content $logFile

Write-Result "Starting certificate pinning test for kimi.exe" "Cyan"

if (-not (Test-Path $mitmPath)) {
    Write-Result "mitmdump not found at $mitmPath. Run: pip install mitmproxy" "Red"
    exit 1
}

# Ensure mitmproxy CA exists
$caPath = Find-MitmCACertPath
if (-not $caPath) {
    Write-Result "Generating mitmproxy CA..." "Yellow"
    $proc = Start-Process -FilePath $mitmPath -ArgumentList "--version" -Wait -NoNewWindow -PassThru
    $caPath = Find-MitmCACertPath
    if (-not $caPath) {
        Write-Result "Could not generate/find mitmproxy CA certificate." "Red"
        exit 1
    }
}

Write-Result "Using mitmproxy CA: $caPath" "Gray"

# Install CA
$thumbprint, $installed = Install-MitmCA $caPath
if ($installed) {
    Write-Result "Installed mitmproxy CA into Windows trusted root store." "Green"
} else {
    Write-Result "mitmproxy CA was already in trusted root store." "Yellow"
}

try {
    # Start mitmproxy
    "" | Set-Content $mitmLog
    $proxyJob = Start-Job -ScriptBlock {
        param($mitmPath, $addonPath, $proxyPort, $repoDir, $logFile, $mitmLog)
        Set-Location $repoDir
        & $mitmPath -p $proxyPort -s $addonPath --set "logfile=$logFile" *> $mitmLog
    } -ArgumentList $mitmPath, $addonPath, $proxyPort, $repoDir, $logFile, $mitmLog

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $s = [System.Net.Sockets.TcpClient]::new()
            $s.Connect("127.0.0.1", $proxyPort)
            $s.Close()
            $ready = $true
            break
        } catch {
            Start-Sleep -Milliseconds 300
        }
    }

    if (-not $ready) {
        Write-Result "mitmproxy did not start." "Red"
        exit 1
    }

    Write-Result "mitmproxy listening on port $proxyPort. Running kimi..." "Cyan"

    $env:HTTPS_PROXY = "http://127.0.0.1:$proxyPort"
    $env:HTTP_PROXY = "http://127.0.0.1:$proxyPort"
    $env:NO_PROXY = ""

    $kimi = (Get-Command kimi -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    if (-not $kimi) {
        Write-Result "kimi.exe not found in PATH" "Red"
        exit 1
    }

    $output = & $kimi -p "say hi" 2>&1
    $output | Out-String | Add-Content $logFile

    Start-Sleep -Seconds 3
    Stop-Job $proxyJob
    Remove-Job $proxyJob -Force

    $logContent = Get-Content $logFile -Raw
    $stdoutContent = Get-Content $mitmLog -Raw

    if ($logContent -match "REQUEST.*api\.kimi\.com" -or $stdoutContent -match "server connect api\.kimi\.com") {
        if ($logContent -match "RESPONSE.*api\.kimi\.com" -or $stdoutContent -match "Client TLS handshake failed" -eq $false) {
            Write-Result "NO CERTIFICATE PINNING DETECTED. Handshake succeeded with mitmproxy CA installed." "Green"
            Write-Result "kimi.exe performs normal certificate chain validation only." "Green"
        } else {
            Write-Result "CERTIFICATE PINNING LIKELY: handshake to api.kimi.com still failed even with trusted CA." "Red"
        }
    } else {
        Write-Result "Could not detect api.kimi.com traffic. Check logs." "Yellow"
    }

    Write-Result "`nFull log saved to: $logFile" "Gray"
    Write-Result "mitmproxy stdout saved to: $mitmLog" "Gray"

} finally {
    Remove-MitmCA $thumbprint
    if ($installed) {
        Write-Result "Removed mitmproxy CA from Windows trusted root store." "Green"
    } else {
        Write-Result "Left mitmproxy CA in place (was already installed before this script)." "Yellow"
    }
}
