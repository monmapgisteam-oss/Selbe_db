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

# ⚠️ 2026-09-28: ПОРТ БАНД БОЛ АСААХГҮЙ. Ажил нь ачаалахад (S4U, session 0) ба
#    нэвтрэхэд гэсэн ХОЁР триггертэй, мөн засварын үед гараар асаасан реле
#    үлдсэн байж болно. Тэр үед энэ давталт `EADDRINUSE`-аар 5 секунд тутам
#    мөнхөд унаж, лог дүүргэдэг байв. Одоо аль хэдийн үйлчилж буй реле байвал
#    зүгээр хүлээж, тэр нь унасан хойно өөрөө эзэлнэ (өөрийгөө эмчилдэг).
# ⚠️ 2026-09-25 (аудит 8): PS 5.1-ийн Invoke-WebRequest нь 503-д WebException ШИДДЭГ —
#    урьд `catch { $false }` тул реле бэлтгэж байх (`ready.ok=false` → 503) хэдэн
#    секундэд «унтарсан» гэж үзэж дахин асаах гэж EADDRINUSE-ээр унаж, лог
#    дүүргэдэг байв. Хариу ирсэн (200/503) = реле амьд; зөвхөн холбогдохгүй бол $false.
function Test-RelayUp {
  try { return (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8787/health' -TimeoutSec 3).StatusCode -in 200, 503 }
  catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    if ($resp -and ([int]$resp.StatusCode) -in 200, 503) { return $true }
    return $false
  }
  catch { return $false }
}

while ($true) {
  if (Test-RelayUp) { Start-Sleep -Seconds 15; continue }
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
