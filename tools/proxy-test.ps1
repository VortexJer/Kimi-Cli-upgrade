$ErrorActionPreference = "Stop"
$repoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $repoDir "proxy-test.log"
$proxyPort = 18080

# Clear log
"" | Set-Content $logFile

# Start proxy in background
$nodePath = "C:\Program Files\nodejs\node.exe"
$proxyJob = Start-Job -ScriptBlock {
    param($repoDir, $logFile, $proxyPort, $nodePath)
    Set-Location $repoDir
    & $nodePath (Join-Path $repoDir "tools\proxy-test.js") > $logFile 2>&1
} -ArgumentList $repoDir, $logFile, $proxyPort, $nodePath

# Wait for proxy to be ready
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 200
    try {
        $test = Invoke-WebRequest -Uri "http://localhost:$proxyPort/" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        $ready = $true
        break
    } catch {
        # not ready yet
    }
}

if (-not $ready) {
    Write-Host "Proxy did not start" -ForegroundColor Red
    Stop-Job $proxyJob
    Remove-Job $proxyJob
    exit 1
}

Write-Host "Proxy running on port $proxyPort. Running kimi with HTTPS_PROXY..." -ForegroundColor Cyan

# Run kimi with proxy env vars
$env:HTTPS_PROXY = "http://localhost:$proxyPort"
$env:HTTP_PROXY = "http://localhost:$proxyPort"
$env:NO_PROXY = ""

$kimi = (Get-Command kimi -CommandType Application | Select-Object -First 1).Source
& $kimi -p "say hi"

# Wait a bit for any async traffic
Start-Sleep -Seconds 4

# Stop proxy
Stop-Job $proxyJob
Remove-Job $proxyJob

Write-Host "`nProxy log:" -ForegroundColor Cyan
Get-Content $logFile -Raw
