# Сэлбэ AI реле — хостын ажлуудыг устгана (кодыг хөндөхгүй).
foreach ($t in 'SelbeAgentRelay', 'SelbeAgentTunnel') {
  if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $t -Confirm:$false
    Write-Host "✓ $t устгагдлаа"
  }
}
# ⚠️ run-relay.ps1-ийн хүүхэд node процесс task зогсооход үлдэж болно
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'server\.mjs --backend=claude-code' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
