# Сэлбэ AI реле — Claude Code горимд ТАСРАЛТГҮЙ ажиллуулна.
#
# ⚠️ Процесс унавал 5 секундийн дараа дахин асаана (Node-ийн гэнэтийн алдаа,
#    Claude Code шинэчлэлт г.м.). Лог: host\logs\relay-YYYYMMDD.log (14 хоног).
# ⚠️ Task Scheduler-ээс `install.ps1` дуудна — гараар ч ажиллуулж болно.

$ErrorActionPreference = 'Continue'
# ⚠️ node-ийн гаралт UTF-8 — эс бөгөөс PowerShell OEM кодоор задалж кирилл эвдэрнэ
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot          # agent-proxy
$logs = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node олдсонгүй — Node.js суулгана уу.' }

while ($true) {
  Get-ChildItem $logs -Filter 'relay-*.log' |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

  $log = Join-Path $logs ("relay-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
  Add-Content -Path $log -Value ("`n==== {0} эхэлж байна ====" -f (Get-Date -Format 's')) -Encoding utf8

  Push-Location $root
  # ⚠️ --env-file-if-exists: ALLOW_ORIGIN, ARCGIS_ORG_ID, AGENT_MODEL … .env.local-оос
  # ⚠️ `*>> $log` нь Windows PowerShell 5.1-д UTF-16 бичдэг тул монгол лог
  #    уншигдахгүй болдог байв — мөр бүрийг UTF-8-аар нэмнэ.
  # ⚠️ `Add-Content` pipeline-ийн турш файлыг ТҮГЖДЭГ тул лог ажиллаж байхад
  #    уншигдахгүй байв — хуваалцаж уншиж болох урсгалаар бичнэ.
  $fs = [IO.File]::Open($log, 'Append', 'Write', 'ReadWrite')
  $sw = New-Object IO.StreamWriter($fs, (New-Object Text.UTF8Encoding $false))
  $sw.AutoFlush = $true
  try {
    & $node --env-file-if-exists=.env.local server.mjs --backend=claude-code 2>&1 |
      ForEach-Object { $sw.WriteLine("$_") }
  } finally { $sw.Dispose() }
  $code = $LASTEXITCODE
  Pop-Location

  Add-Content -Path $log -Value ("==== {0} зогслоо (код {1}) — 5 секундийн дараа дахин ====" -f (Get-Date -Format 's'), $code) -Encoding utf8
  Start-Sleep -Seconds 5
}
