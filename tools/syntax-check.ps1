$script = Get-Content -Path 'tools/mitm-pinning-test.ps1' -Raw
$errors = @()
$null = [System.Management.Automation.PSParser]::Tokenize($script, [ref]$errors)
if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Host $_.Message }
    exit 1
} else {
    Write-Host 'Syntax OK'
}
