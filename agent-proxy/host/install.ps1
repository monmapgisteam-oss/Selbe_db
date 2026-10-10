# Сэлбэ AI реле — энэ PC-г Claude Code хост болгох нэг удаагийн тохиргоо.
#
#   powershell -ExecutionPolicy Bypass -File agent-proxy\host\install.ps1
#
# Хийх зүйл:
#   1. «SelbeAgentRelay» ажил — PC асмагц (S4U) ба нэвтрэхэд run-relay.ps1
#      (унавал дахин асна; S4U бүртгэгдэхгүй бол зөвхөн нэвтрэхэд — доор)
#   2. Тунель — .env.local-ийн TRUSTED_PROXY-оор:
#        cloudflare → «SelbeAgentTunnel» ажил (cloudflared, CF_TUNNEL_TOKEN)
#        tailscale  → `tailscale funnel --bg 8787` (tailscaled-д хадгалагдана, ажил хэрэггүй)
#   3. Цахилгаанд залгаатай үед PC унтахгүй болгоно
#
# ⚠️ НӨӨЦ ХОСТ (2026-09-28): ижил скриптийг ХОЁР дахь PC дээр ажиллуулбал тэр PC
#    өөрийн Funnel хаягтай (https://<машин>.<tailnet>.ts.net) реле болно. Порталын
#    GitHub Variable `AGENT_API`-д хаягуудыг ТАСЛАЛААР бичнэ (эхнийх = үндсэн) —
#    унтарсан хостыг browser өөрөө алгасна (`src/lib/agent/client.ts` relayFetch).
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
# ⚠️ 2026-10-09 (аудит №6): `npm ci` — lock файлын ЯГ хувилбарууд (хост дээр `npm install` lock-ийг
#    өөрчилж, репод зөрүү үүсгэж болзошгүй байв).
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Push-Location $root; npm ci; Pop-Location
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
$ts = Find-Exe 'tailscale' 'C:\Program Files\Tailscale\tailscale.exe'

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

# ⚠️ 2026-09-28: PC АСМАГЦ асна — НЭВТРЭХИЙГ ХҮЛЭЭХГҮЙ.
#    Урьд зөвхөн `-AtLogOn` байсан тул цахилгаан тасраад PC дахин асахад хэн ч
#    нэвтрээгүй бол (түгжээтэй дэлгэц) реле асдаггүй, порталын AI чимээгүй унтардаг байв.
#    `-AtStartup` нь нэвтрэх сессгүй тул `LogonType Interactive`-тэй АЖИЛЛАХГҮЙ —
#    S4U («нэвтэрсэн эсэхээс үл хамааран», нууц үг хадгалахгүй) шаардлагатай.
#    Claude Code-ийн нэвтрэлт (`%USERPROFILE%\.claude\.credentials.json`) нь энгийн
#    JSON — DPAPI-аар шифрлэгдээгүй тул S4U-гийн хязгаарлагдмал токен саад болохгүй.
# ⚠️ Хоёр триггер ЗЭРЭГ: ачаалахад + нэвтрэхэд. `MultipleInstances IgnoreNew` тул
#    давхар асахгүй; нэвтрэлтийн триггер нь ачаалалтын оролдлого унасан үеийн даатгал.
# ⚠️ 30 секундын саатал — ачаалах агшинд сүлжээ/Tailscale бэлэн болоогүй байдаг.
$atStartup = New-ScheduledTaskTrigger -AtStartup
$atStartup.Delay = 'PT30S'
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $user
$triggers = @($atStartup, $atLogon)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited

# ⚠️ S4U нь зарим Azure AD / бодлогоор хязгаарласан машин дээр бүртгэгдэхгүй байж
#    болно. Тэр үед БҮТЭН уначихвал реле огт суухгүй үлдэх тул хуучин зан
#    (зөвхөн нэвтрэхэд) руу буцаж, ЯЛГААГ нь чангаар мэдэгдэнэ.
function Register-Relay([string]$name, $action) {
  try {
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers `
      -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
    Write-Host "✓ $name бүртгэгдлээ — PC асмагц (нэвтрэхгүйгээр) асна"
  } catch {
    $fallback = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $atLogon `
      -Settings $settings -Principal $fallback -Force | Out-Null
    Write-Warning "$name — S4U бүртгэгдсэнгүй ($($_.Exception.Message))."
    Write-Warning "  → зөвхөн НЭВТРЭХЭД асна. PC асаад нэвтрэх хүртэл AI ажиллахгүй."
    Write-Warning "  → S4U-д АДМИН эрх шаардлагатай: PowerShell-ийг «Run as administrator»-оор нээж дахин ажиллуулна уу."
  }
}

# ── 1. Реле ──
$relayAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$here\run-relay.ps1`""
Register-Relay 'SelbeAgentRelay' $relayAction

# ── 2а. Tailscale Funnel ──
# ⚠️ Тохиргоо tailscaled ҮЙЛЧИЛГЭЭНД хадгалагддаг тул Task Scheduler-ийн ажил
#    хэрэггүй — дахин ачаалахад өөрөө асна. `--yes`: байгаа тохиргоог асуулгүй солино.
# ⚠️ FAIL-CLOSED: ORG_ID-гүй бол Funnel-ийг УНТРААНА (өмнөх суулгалтаас үлдсэн байж
#    болно) — эс бөгөөс хаягийг олсон хэн ч энэ PC-ийн Claude бүртгэлийг зарцуулна.
# ⚠️ Native exe-ийн stderr-ийг ЭНД БҮҮ дахин чиглүүл (`2>$null`) — PS 5.1 +
#    $ErrorActionPreference='Stop' үед хэвийн мэдэгдэл ч скриптийг унагадаг.
if ($proxy -eq 'tailscale') {
  if (-not $ts) {
    Write-Warning 'tailscale олдсонгүй — https://tailscale.com/download суулгаад дахин ажиллуулна уу.'
  } elseif (-not $org) {
    & $ts funnel reset
    Write-Warning 'ARCGIS_ORG_ID алга — Tailscale Funnel унтраалттай (реле зөвхөн локал).'
  } else {
    & $ts funnel --bg --yes 8787
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'Funnel асаагүй — Tailscale admin → Access controls-д funnel nodeAttr ба DNS → HTTPS Certificates идэвхтэй эсэхийг шалга.'
    } else {
      $dns = ((& $ts status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.')
      Write-Host "✓ Tailscale Funnel: https://$dns  → порталын AGENT_API-д (таслалаар) нэм"
    }
    # ⚠️ Windows-ийн Tailscale нь анхдагчаар хэрэглэгч гарахад (эсвэл нэвтрээгүй үед)
    #    тасардаг — unattended горимд үйлчилгээ PC асмагц холбогдоно. S4U ажил ба
    #    Funnel хоёулаа нэвтрэлтээс үл хамааран ажиллахын тулд ЭНЭ ЧУХАЛ.
    & $ts set --unattended=true
    if ($LASTEXITCODE -eq 0) { Write-Host '✓ Tailscale unattended (нэвтрэхгүйгээр холбогдоно)' }
    else { Write-Warning 'Tailscale unattended тохирсонгүй — трей цэс → Preferences → «Run unattended»-ийг асаана уу.' }
  }
  # Нэг PC — нэг тунель: өмнөх Cloudflare ажил үлдсэн бол арилгана
  if (Get-ScheduledTask -TaskName 'SelbeAgentTunnel' -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName 'SelbeAgentTunnel' -Confirm:$false
    Write-Warning 'Хуучин SelbeAgentTunnel (cloudflared) ажлыг устгав — TRUSTED_PROXY=tailscale.'
  }
}

# ── 2б. Cloudflare Tunnel ──
$token = Read-EnvLocal 'CF_TUNNEL_TOKEN'
$cf = Find-Exe 'cloudflared' 'C:\Program Files (x86)\cloudflared\cloudflared.exe', 'C:\Program Files\cloudflared\cloudflared.exe'
if ($proxy -eq 'tailscale') {
  # дээр (2а) шийдэгдсэн — нэг PC дээр хоёр тунель зэрэг хэрэггүй
} elseif (-not $cf) {
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
  # ⚠️ 2026-09-25 (аудит 8): токеныг ажлын АРГУМЕНТАД БИЧИХГҮЙ — Task Scheduler-ийн
  #    аргумент нь `Get-ScheduledTask`/`schtasks /query`-ээр тэр PC-ийн ХЭН Ч уншдаг
  #    нууцгүй талбар. cloudflared нь `TUNNEL_TOKEN` орчны хувьсагчийг дэмждэг тул
  #    ажил нь powershell-ээр .env.local-оос уншиж орчинд тавиад cloudflared-ийг
  #    дуудна; токен файлаас (ACL-тай) л уншигдана. `$here`/`$cf` замуудыг зөвхөн
  #    аргументаар өгнө (тэдгээр нууц биш).
  $tunnelCmd = "`$env:TUNNEL_TOKEN = ((Get-Content -LiteralPath '$root\.env.local' -Encoding utf8 | Where-Object { `$_ -match '^\s*CF_TUNNEL_TOKEN\s*=' } | Select-Object -First 1) -replace '^\s*CF_TUNNEL_TOKEN\s*=\s*', '').Trim().Trim([char]34); if (-not `$env:TUNNEL_TOKEN) { exit 1 }; & '$cf' tunnel --no-autoupdate run"
  $tunnelAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$tunnelCmd`""
  Register-Relay 'SelbeAgentTunnel' $tunnelAction
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
