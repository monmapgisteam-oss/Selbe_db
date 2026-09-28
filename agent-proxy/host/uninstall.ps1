# Сэлбэ AI реле — хостын ажлуудыг устгана (кодыг хөндөхгүй).
foreach ($t in 'SelbeAgentRelay', 'SelbeAgentTunnel') {
  if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $t -Confirm:$false
    Write-Host "✓ $t устгагдлаа"
  }
}
# ⚠️ Tailscale Funnel-ийн тохиргоо tailscaled-д хадгалагддаг тул task-аас тусдаа унтраана.
#    `reset` нь энэ машины БҮХ serve/funnel тохиргоог арилгана (реле л байдаг гэж үзсэн).
$ts = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
if (-not $ts -and (Test-Path 'C:\Program Files\Tailscale\tailscale.exe')) { $ts = 'C:\Program Files\Tailscale\tailscale.exe' }
if ($ts) { & $ts funnel reset; Write-Host '✓ Tailscale Funnel унтраав' }
# ⚠️ run-relay.ps1-ийн хүүхэд node процесс task зогсооход үлдэж болно
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'server\.mjs --backend=claude-code' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
