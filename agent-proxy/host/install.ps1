# Сэлбэ AI реле — энэ PC-г Claude Code хост болгох нэг удаагийн тохиргоо.
#
#   powershell -ExecutionPolicy Bypass -File agent-proxy\host\install.ps1
#
# Хийх зүйл:
#   1. «SelbeAgentRelay» ажил — нэвтрэх бүрд run-relay.ps1 (унавал дахин асна)
#   2. «SelbeAgentTunnel» ажил — cloudflared (agent-proxy\.env.local-ийн CF_TUNNEL_TOKEN)
#   3. Цахилгаанд залгаатай үед PC унтахгүй болгоно
#
# ⚠️ Ажлууд ОДООГИЙН Windows хэрэглэгчээр ажиллана: Claude Code-ийн нэвтрэлт
#    (%USERPROFILE%\.claude) тэр хэрэглэгчийнх тул өөр бүртгэлээр ажиллуулбал
#    «нэвтрээгүй» гэж унана.

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path -Parent $here
$user = "$env:USERDOMAIN\$env:USERNAME"

function Read-EnvLocal([string]$name) {
  $f = Join-Path $root '.env.local'
  if (-not (Test-Path $f)) { return $null }
  $line = Get-Content $f -Encoding utf8 | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if ($line) { return ($line -replace "^\s*$name\s*=\s*", '').Trim().Trim('"') }
  return $null
}

# ⚠️ 2026-09-28: VS Code-ийн терминал нь VS Code асах үеийн PATH-ыг өвлөдөг тул
#    дараа нь суулгасан tailscale/cloudflared-ийг `Get-Command` олохгүй байв —
#    стандарт суулгалтын замаас мөн хайна.
function Find-Exe([string]$name, [string[]]$paths) {
  $c = (Get-Command $name -ErrorAction SilentlyContinue).Source
  if ($c) { return $c }
  return $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
}

# ── Урьдчилсан шалгалт ──
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js суугаагүй байна.' }
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Push-Location $root; npm install; Pop-Location
}
if (-not (Test-Path "$env:USERPROFILE\.claude\.credentials.json")) {
  Write-Warning 'Claude Code нэвтрээгүй бололтой — терминалд `claude` ажиллуулаад /login хийнэ үү.'
}
$origin = Read-EnvLocal 'ALLOW_ORIGIN'
$org = Read-EnvLocal 'ARCGIS_ORG_ID'
if (-not $origin -or $origin -notmatch 'smart\.selbecity\.mn') {
  Write-Warning '.env.local-д ALLOW_ORIGIN=https://smart.selbecity.mn,... алга — нийтэд гарсан портал 403 авна.'
}
# ⚠️ 2026-09-25: ORG_ID-гүй бол тунелийг БҮРТГЭХГҮЙ (доор) — урьд зөвхөн анхааруулаад
#    бүртгэдэг байсан тул хаягийг олсон хэн ч энэ PC-ийн Claude бүртгэлийг зарцуулж болж байв.
if (-not $org) {
  Write-Warning '.env.local-д ARCGIS_ORG_ID алга — Cloudflare тунель БҮРТГЭГДЭХГҮЙ (реле зөвхөн локал).'
}
$proxy = Read-EnvLocal 'TRUSTED_PROXY'
if ($org -and $proxy -notin @('cloudflare', 'tailscale')) {
  Write-Warning '.env.local-д TRUSTED_PROXY=cloudflare|tailscale алга — тунелийн бүх хэрэглэгч нэг IP-ийн хурдны хязгаар хуваалцана.'
}

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
# ⚠️ 2026-09-28: НЭВТРЭХГҮЙГЭЭР АСНА — админаар ажиллуулбал PC асмагц (нэвтрэхээс
#    өмнө) S4U-гаар ОДООГИЙН хэрэглэгчийн нэрээр ажиллана: профайл (%USERPROFILE%\.claude)
#    ачаалагдах тул Claude Code-ийн нэвтрэлт хэвээр. S4U-г бүртгэхэд админ эрх
#    шаардлагатай тул энгийн эрхээр бол хуучнаараа нэвтрэх үед асна.
#    `IgnoreNew` тул startup ба logon хоёр өдөөгч давхар процесс үүсгэхгүй.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
  $trigger = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -AtLogOn -User $user))
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
} else {
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Write-Warning 'Админ биш — реле зөвхөн Windows-д НЭВТРЭХ үед асна. PC асмагц асуулахыг хүсвэл PowerShell-ийг «Run as administrator»-оор нээж дахин ажиллуулна уу.'
}

# ── 1. Реле ──
$relayAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$here\run-relay.ps1`""
Register-ScheduledTask -TaskName 'SelbeAgentRelay' -Action $relayAction -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null
Write-Host '✓ SelbeAgentRelay бүртгэгдлээ'

# ── 2. Cloudflare Tunnel ──
$token = Read-EnvLocal 'CF_TUNNEL_TOKEN'
$cf = Find-Exe 'cloudflared' 'C:\Program Files (x86)\cloudflared\cloudflared.exe', 'C:\Program Files\cloudflared\cloudflared.exe'
if (-not $cf) {
  Write-Warning 'cloudflared олдсонгүй — `winget install --id Cloudflare.cloudflared` суулгаад дахин ажиллуулна уу.'
} elseif (-not $token) {
  Write-Warning '.env.local-д CF_TUNNEL_TOKEN алга — Cloudflare Zero Trust → Networks → Tunnels-ээс авна.'
} elseif (-not $org) {
  # Өмнөх суулгалтаас үлдсэн тунелийн ажлыг мөн арилгана — fail-closed.
  if (Get-ScheduledTask -TaskName 'SelbeAgentTunnel' -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName 'SelbeAgentTunnel' -Confirm:$false
    Write-Warning 'Хуучин SelbeAgentTunnel ажлыг устгав (ARCGIS_ORG_ID алга).'
  }
} else {
  $tunnelAction = New-ScheduledTaskAction -Execute $cf -Argument "tunnel --no-autoupdate run --token $token"
  Register-ScheduledTask -TaskName 'SelbeAgentTunnel' -Action $tunnelAction -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host '✓ SelbeAgentTunnel бүртгэгдлээ'
}

# ── 2б. Tailscale Funnel (TRUSTED_PROXY=tailscale үед) ──
# ⚠️ 2026-09-28: нөөц хост — машин бүр өөрийн `https://<машин>.<tailnet>.ts.net`
#    хаягтай тул портал `AGENT_API`-д хаягуудыг таслалаар жагсааж, унтарсныг алгасна.
#    `--bg` нь тохиргоог tailscaled-д хадгалдаг тул дахин асахад ажлын бүртгэл хэрэггүй.
if ($proxy -eq 'tailscale') {
  $ts = Find-Exe 'tailscale' 'C:\Program Files\Tailscale\tailscale.exe'
  if (-not $ts) {
    Write-Warning 'tailscale олдсонгүй — https://tailscale.com/download суулгаад нэвтэрч, дахин ажиллуулна уу.'
  } elseif (-not $org) {
    & $ts funnel reset | Out-Null
    Write-Warning 'Tailscale Funnel ИДЭВХЖҮҮЛЭЭГҮЙ (ARCGIS_ORG_ID алга).'
  } else {
    & $ts funnel --bg 8787
    Write-Host '✓ Tailscale Funnel → http://127.0.0.1:8787'
    # ⚠️ Windows-ийн Tailscale нь анхдагчаар хэрэглэгч гарахад (эсвэл нэвтрээгүй үед)
    #    тасардаг — unattended горимд үйлчилгээ PC асмагц холбогдоно.
    & $ts set --unattended=true
    if ($LASTEXITCODE -eq 0) { Write-Host '✓ Tailscale unattended (нэвтрэхгүйгээр холбогдоно)' }
    else { Write-Warning 'Tailscale unattended тохирсонгүй — трей цэс → Preferences → «Run unattended»-ийг асаана уу.' }
  }
}

# ── 3. Унтахгүй (зөвхөн цахилгаанд залгаатай үед) ──
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
Write-Host '✓ Цахилгаанд залгаатай үед унтахгүй'

# ── Одоо асаах ──
Start-ScheduledTask -TaskName 'SelbeAgentRelay'
if (Get-ScheduledTask -TaskName 'SelbeAgentTunnel' -ErrorAction SilentlyContinue) { Start-ScheduledTask -TaskName 'SelbeAgentTunnel' }
Start-Sleep -Seconds 8
try {
  $h = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 5
  Write-Host "✓ Реле: $($h.Content)"
} catch {
  Write-Warning "Реле хариу өгөөгүй (Claude Code-ийн шалгалт 10–20с үргэлжилж болно) — лог: $here\logs"
}
