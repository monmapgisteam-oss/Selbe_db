/**
 * IoT ХЯНАГЧ — мэдрэгчийн төлөв өөрчлөгдөхөд Telegram-аар мэдэгдэнэ.
 *
 *   npm run iot:watch          — нэг удаа шалгаад гарна (cron/systemd timer-т)
 *   npm run iot:watch -- --loop 15   — 15 минут тутам давтана (24/7 процесс)
 *
 * ⚠️ Портал нь СТАТИК тул мэдэгдлийг браузер илгээж чадахгүй: таб хаагдмагц
 * хяналт зогсоно. Тиймээс энэ нь ботын хостод (аль хэдийн 24/7) ажилладаг
 * ТУСДАА процесс. Ботын \`TELEGRAM_BOT_TOKEN\`-ыг дахин ашиглана.
 *
 * ⚠️ ЯГ ЯМАР ҮЕД мэдэгдэх вэ: төлөв ӨӨРЧЛӨГДӨХӨД л (ok → alert). Босго давсан
 * хэвээр байгаа мэдрэгчийг 15 минут тутам давтвал хүн мэдэгдлийг унтраана —
 * тэр мөчөөс эхлэн ЖИНХЭНЭ дохио ч хүрэхээ болино. Төлөвийг файлд хадгалж
 * ялгааг нь л илгээнэ; сэргэсэн үед мөн нэг удаа мэдэгдэнэ («хэвийн боллоо»).
 */

import fs from 'node:fs';
import { loadSensors, outOfRange } from '../src/lib/sensors.ts';
/* ⚠️ 2026-10-09: «их нь сайн» жагсаалтыг CEO самбараас ИМПОРТЛОНО — хуулбарлавал хоёр тал салж,
   самбар «хуурай» гэж шар байхад Telegram «хэвийн» гэж хэлнэ. */
import { IOT_HIGHER_IS_GOOD } from '../src/lib/ceo/iot.ts';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
/** Мэдэгдэл хүлээн авах chat id-ууд — таслалаар (ботын TELEGRAM_ALLOWED-той ижил хэлбэр) */
const TO = String(process.env.IOT_ALERT_CHATS ?? process.env.TELEGRAM_ALLOWED ?? '')
  .split(/[,\s]+/)
  .map((x) => x.trim().split(':')[0])
  .filter(Boolean);

/** Төлөвийн санах ой — давтан мэдэгдэхээс сэргийлнэ */
const STATE_FILE = process.env.IOT_STATE_FILE || 'iot-watch-state.json';

/** Хэдэн цагийн дараа «хуучирсан» гэж үзэх вэ (порталын дүрэмтэй ИЖИЛ) */
/* ⚠️ 2026-10-04: 48 → 24 — `sensors.SENSOR_STALE_H` / `ceo/iot.IOT_STALE_H`-тэй нэг */
const STALE_H = Number(process.env.IOT_STALE_HOURS ?? 24);

if (!TOKEN) {
  console.error('✗ TELEGRAM_BOT_TOKEN алга. `.env.local`-д тавина уу.');
  process.exit(1);
}
if (!TO.length) {
  console.error('✗ IOT_ALERT_CHATS (эсвэл TELEGRAM_ALLOWED) хоосон байна.');
  process.exit(1);
}

const loadState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
};
const saveState = (o) => {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(o, null, 1)); } catch (e) {
    console.error(`[iot] төлөв бичигдсэнгүй: ${e.message}`);
  }
};

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`${method}: ${j.description ?? res.status}`);
  return j.result;
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Мэдрэгчийн ТӨЛӨВ — CEO самбарын `src/lib/ceo/iot.ts` (`computeIot`)-ийн дүрэмтэй НЭГ.
 * ⚠️ 2026-10-09: урьд нь «`Iot.tsx`-ийн `stateOf`-той ИЖИЛ» гэж бичсэн байсан ч тийм
 *    функц тэнд аль хэдийн байхгүй; харин босгыг ГЭНЭН `latest >= alert`-ээр шалгадаг
 *    байсан тул (1) decoder-ийн 6553.5%-ийн гэмтэлтэй заалт «хөрс чийглэг» гэж ногоон,
 *    (2) ХУУРАЙ хөрс (чийг < 15%) «хэвийн боллоо» гэж мэдэгддэг байв. Одоо:
 *      · физик мужаас гадуур (`fault` / `outOfRange`) → «мэдрэгчийн гэмтэл», босготой ЖИШИХГҮЙ;
 *      · `IOT_HIGHER_IS_GOOD` (хөрсний чийг) → босгоос ДООШ бол «хуурай» (анхааруулга).
 * ⚠️ Хоёр газарт өөр дүрэм бичвэл самбар ногоон байхад Telegram улаан дохио явуулж,
 *    аль нь үнэн болох нь мэдэгдэхгүй болно.
 */
const isFault = (m) => m.fault || outOfRange(m, m.latest);
const higherIsGood = (sn, m) => IOT_HIGHER_IS_GOOD.has(`${sn.key}:${m.key}`);
const isHit = (sn, m) => !isFault(m) && m.alert && m.latest != null
  && !higherIsGood(sn, m) && m.latest >= m.alert.value;
const isDry = (sn, m) => !isFault(m) && m.alert && m.latest != null
  && higherIsGood(sn, m) && m.latest < m.alert.value;

function stateOf(sn) {
  if (sn.error) return 'down';
  if (sn.lastAt == null) return 'silent';
  const h = (Date.now() - sn.lastAt) / 3_600_000;
  if (h > STALE_H) return 'stale';
  if (sn.series.some((m) => isHit(sn, m))) return 'alert';
  if (sn.series.some(isFault)) return 'fault';
  if (sn.series.some((m) => isDry(sn, m))) return 'dry';
  return 'ok';
}

const ICON = { down: '🔴', silent: '⚪', stale: '🟠', alert: '🔴', fault: '🟠', dry: '🟡', ok: '🟢' };
const WORD = {
  down: 'үйлчилгээ унасан',
  silent: 'дүлий (задарсан заалт алга)',
  stale: `хуучирсан (>${STALE_H}ц)`,
  alert: 'БОСГО ДАВСАН',
  fault: 'мэдрэгчийн гэмтэл (боломжгүй утга)',
  dry: 'хөрс хуурай',
  ok: 'хэвийн боллоо',
};

const fmt = (m) => (m.latest == null ? '—' : m.latest.toFixed(m.dp));

/** Босго давсан / гэмтэлтэй / хуурай үзүүлэлтүүдийн мөр — ЯМАР утга, ЯМАР босго вэ */
function detail(sn) {
  const rows = [];
  for (const m of sn.series) {
    if (isFault(m)) {
      rows.push(`  • ${esc(m.label)}: <b>${fmt(m)}${esc(m.unit)}</b> — боломжгүй утга, мэдрэгчийн гэмтэл`);
    } else if (isHit(sn, m)) {
      rows.push(`  • ${esc(m.label)}: <b>${fmt(m)}${esc(m.unit)}</b>`
        + ` (босго ${m.alert.value}${esc(m.unit)}) — ${esc(m.alert.note)}`);
    } else if (isDry(sn, m)) {
      rows.push(`  • ${esc(m.label)}: <b>${fmt(m)}${esc(m.unit)}</b>`
        + ` (босго ${m.alert.value}${esc(m.unit)}-аас ДООШ) — хуурай`);
    }
  }
  // Таамаг — «хэзээ хүрэх вэ» нь урьдчилан төлөвлөхөд хамгийн үнэ цэнэтэй
  for (const m of sn.series) {
    const h = m.trend?.etaHours;
    if (h == null || !m.alert || isFault(m)) continue;
    const w = h < 48 ? `≈${Math.round(h)} цаг` : `≈${Math.round(h / 24)} хоног`;
    rows.push(`  • ${esc(m.label)}: ${w} дараа ${m.alert.value}${esc(m.unit)} хүрэх төлөвтэй`);
  }
  return rows;
}

async function check() {
  const prev = loadState();
  const now = {};
  const lines = [];

  const all = await loadSensors('24h');
  for (const sn of all) {
    const st = stateOf(sn);
    now[sn.key] = st;
    if (prev[sn.key] === st) continue;              // өөрчлөлтгүй — чимээгүй
    if (prev[sn.key] === undefined && st === 'ok') continue; // анхны ажиллалт
    lines.push(`${ICON[st]} <b>${esc(sn.label)}</b> — ${WORD[st]}`);
    if (st === 'down' && sn.error) lines.push(`  • ${esc(sn.error)}`);
    if (st === 'alert' || st === 'fault' || st === 'dry') lines.push(...detail(sn));
  }

  // ⚠️ Төлөвийг ИЛГЭЭХЭЭС ӨМНӨ хадгална: илгээлт унавал дараагийн ажиллалтад
  //    ижил мэдэгдэл дахин явахгүй (спам болохоос сэргийлнэ).
  saveState(now);

  if (!lines.length) {
    console.log(`[iot] өөрчлөлтгүй · ${all.map((x) => `${x.key}=${now[x.key]}`).join(' ')}`);
    return;
  }

  const text = `<b>Сэлбэ · IoT мэдрэгч</b>\n${new Date().toLocaleString('mn-MN')}\n\n${lines.join('\n')}`;
  for (const chat of TO) {
    try {
      await tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML' });
    } catch (e) {
      console.error(`[iot] ${chat} руу илгээгдсэнгүй: ${e.message}`);
    }
  }
  console.log(`[iot] ${lines.length} мөр · ${TO.length} хүлээн авагч`);
}

const loopArg = process.argv.indexOf('--loop');
const everyMin = loopArg > 0 ? Number(process.argv[loopArg + 1]) || 15 : 0;

await check().catch((e) => { console.error(`[iot] шалгалт унав: ${e.message}`); });

if (everyMin > 0) {
  console.log(`[iot] ${everyMin} минут тутам давтана (Ctrl+C зогсооно)`);
  setInterval(() => {
    check().catch((e) => console.error(`[iot] шалгалт унав: ${e.message}`));
  }, everyMin * 60_000);
}
