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
import { SENSORS, loadSensors } from '../src/lib/sensors.ts';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
/** Мэдэгдэл хүлээн авах chat id-ууд — таслалаар (ботын TELEGRAM_ALLOWED-той ижил хэлбэр) */
const TO = String(process.env.IOT_ALERT_CHATS ?? process.env.TELEGRAM_ALLOWED ?? '')
  .split(/[,\s]+/)
  .map((x) => x.trim().split(':')[0])
  .filter(Boolean);

/** Төлөвийн санах ой — давтан мэдэгдэхээс сэргийлнэ */
const STATE_FILE = process.env.IOT_STATE_FILE || 'iot-watch-state.json';

/** Хэдэн цагийн дараа «хуучирсан» гэж үзэх вэ (порталын дүрэмтэй ИЖИЛ) */
const STALE_H = Number(process.env.IOT_STALE_HOURS ?? 48);

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
 * Мэдрэгчийн ТӨЛӨВ — `Iot.tsx`-ийн `stateOf`-той ИЖИЛ дараалал.
 * ⚠️ Хоёр газарт өөр дүрэм бичвэл зурагт ногоон харагдаж байхад Telegram улаан
 *    дохио явуулж, аль нь үнэн болох нь мэдэгдэхгүй болно.
 */
function stateOf(sn) {
  if (sn.error) return 'down';
  if (sn.lastAt == null) return 'silent';
  const h = (Date.now() - sn.lastAt) / 3_600_000;
  if (h > STALE_H) return 'stale';
  const hit = sn.series.some((m) => m.alert && m.latest != null && m.latest >= m.alert.value);
  return hit ? 'alert' : 'ok';
}

const ICON = { down: '🔴', silent: '⚪', stale: '🟠', alert: '🔴', ok: '🟢' };
const WORD = {
  down: 'үйлчилгээ унасан',
  silent: 'дүлий (задарсан заалт алга)',
  stale: `хуучирсан (>${STALE_H}ц)`,
  alert: 'БОСГО ДАВСАН',
  ok: 'хэвийн боллоо',
};

/** Босго давсан үзүүлэлтүүдийн мөр — ЯМАР утга, ЯМАР босго вэ */
function detail(sn) {
  const rows = [];
  for (const m of sn.series) {
    if (!(m.alert && m.latest != null && m.latest >= m.alert.value)) continue;
    rows.push(`  • ${esc(m.label)}: <b>${m.latest.toFixed(m.dp)}${esc(m.unit)}</b>`
      + ` (босго ${m.alert.value}${esc(m.unit)}) — ${esc(m.alert.note)}`);
  }
  // Таамаг — «хэзээ хүрэх вэ» нь урьдчилан төлөвлөхөд хамгийн үнэ цэнэтэй
  for (const m of sn.series) {
    const h = m.trend?.etaHours;
    if (h == null || !m.alert) continue;
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
    if (st === 'alert') lines.push(...detail(sn));
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
