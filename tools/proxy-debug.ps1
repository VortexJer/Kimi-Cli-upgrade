$job = Start-Job -ScriptBlock { & 'C:\Program Files\nodejs\node.exe' 'tools\proxy-test.js' }
Start-Sleep 2
$job | Format-List *
Receive-Job $job
Remove-Job $job -Force
