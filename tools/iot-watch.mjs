/**
 * IoT ХЯНАГЧ — мэдрэгчийн төлөв өөрчлөгдөхөд Telegram-аар мэдэгдэнэ.
 *
 *   npm run iot:watch          — нэг удаа шалгаад гарна (cron/systemd timer-т)
 *   npm run iot:watch -- --loop 15   — 15 минут тутам давтана (24/7 процесс)
 */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadSensors, outOfRange, UB_OFFSET_MS } from '../src/lib/sensors.ts';

/**
 * Мэдэгдлийн цагийн тамга — Улаанбаатарын цагаар (+08:00, зуны цаггүй).
 */
const ubNow = () =>
  `${new Date(Date.now() + UB_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')} (УБ)`;
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
const STALE_H = Number(process.env.IOT_STALE_HOURS ?? 24);

/** Шууд ажиллуулсан уу (`node tools/iot-watch.mjs`) — шалгалт (`iot-watch.check.mjs`) импортлоход сүлжээ, гаралтгүй (2026-11-27) */
const IS_MAIN = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (IS_MAIN && !TOKEN) {
  console.error('✗ TELEGRAM_BOT_TOKEN алга. `.env.local`-д тавина уу.');
  process.exit(1);
}
if (IS_MAIN && !TO.length) {
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

/**
 * Гэмтлийн мөр — ТАТГАЛЗСАН заалтыг (`MetricSeries.faultValue`) харуулна (2026-11-27, аудит №43). `summarize` гэмтэлтэй сүүлийн
 * заалтыг `latest = null` болгодог тул урьд нь «—%r.h.» гэж гардаг байв. Утга мэдэгдэхгүй бол «—<нэгж>» хэсгийг ОРХИНО.
 * `faultRaw` = хөрвүүлэхээс өмнөх түүхий заалт (жиш. хогийн савны зай) — нэгж нь `unit` биш тул нэгжгүй, «түүхий заалт» гэж.
 */
export function faultRow(m) {
  const v = m.faultValue;
  const shown = v == null || !Number.isFinite(v)
    ? ''
    : m.faultRaw
      ? `: <b>түүхий заалт ${Number(v.toFixed(2))}</b>`
      : `: <b>${Number(v.toFixed(Math.max(2, m.dp ?? 0)))}${esc(m.unit)}</b>`;
  return `  • ${esc(m.label)}${shown} — боломжгүй утга, мэдрэгчийн гэмтэл`;
}

/** Босго давсан / гэмтэлтэй / хуурай үзүүлэлтүүдийн мөр — ЯМАР утга, ЯМАР босго вэ */
export function detail(sn) {
  const rows = [];
  for (const m of sn.series) {
    if (isFault(m)) {
      rows.push(faultRow(m));
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

/**
 * МЭДЭГДЭЭГҮЙ ШИЛЖИЛТИЙГ ХАДГАЛАХГҮЙ төлөв (2026-11-27, аудит №18) — илгээлт БҮГД унасан үед өөрчлөгдсөн түлхүүрүүдэд
 * ӨМНӨХ төлөвийг үлдээнэ (өмнө нь байгаагүй бол түлхүүрийг орхино) → дараагийн шалгалт ижил шилжилтийг дахин илгээнэ.
 */
export function unsentState(prev, now, changed) {
  const out = { ...now };
  for (const k of changed) {
    if (prev[k] === undefined) delete out[k];
    else out[k] = prev[k];
  }
  return out;
}

/**
 * Нэг шалгалт. Буцаах: `'quiet'` (өөрчлөлтгүй) · `'sent'` (ядаж нэг хүлээн авагчид хүрсэн) · `'failed'` (хэнд ч хүрээгүй).
 * `deps` — шалгалтад (`iot-watch.check.mjs`) сүлжээ, файлгүй ажиллуулахад.
 */
export async function check(deps = {}) {
  const load = deps.load ?? (() => loadSensors('24h'));
  const send = deps.send ?? ((chat, text) => tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML' }));
  const readState = deps.loadState ?? loadState;
  const writeState = deps.saveState ?? saveState;
  const to = deps.to ?? TO;

  const prev = readState();
  const now = {};
  const lines = [];
  const changed = [];

  const all = await load();
  for (const sn of all) {
    const st = stateOf(sn);
    now[sn.key] = st;
    if (prev[sn.key] === st) continue;              // өөрчлөлтгүй — чимээгүй
    if (prev[sn.key] === undefined && st === 'ok') continue; // анхны ажиллалт
    changed.push(sn.key);
    lines.push(`${ICON[st]} <b>${esc(sn.label)}</b> — ${WORD[st]}`);
    if (st === 'down' && sn.error) lines.push(`  • ${esc(sn.error)}`);
    if (st === 'alert' || st === 'fault' || st === 'dry') lines.push(...detail(sn));
  }

  if (!lines.length) {
    writeState(now);
    console.log(`[iot] өөрчлөлтгүй · ${all.map((x) => `${x.key}=${now[x.key]}`).join(' ')}`);
    return 'quiet';
  }

  const text = `<b>Сэлбэ · IoT мэдрэгч</b>\n${ubNow()}\n\n${lines.join('\n')}`;
  let sent = 0;
  for (const chat of to) {
    try {
      await send(chat, text);
      sent += 1;
    } catch (e) {
      console.error(`[iot] ${chat} руу илгээгдсэнгүй: ${e.message}`);
    }
  }
  /* Төлөвийг илгээлтийн ДАРАА бичнэ: урьд нь өмнө нь бичдэг байсан тул Telegram түр унасан үеийн шилжилт
     («БОСГО ДАВСАН» г.м.) дараагийн шалгалтад «өөрчлөлтгүй» болж, мэдэгдэл хэзээ ч явдаггүй байв */
  if (!sent) {
    writeState(unsentState(prev, now, changed));
    console.error(`[iot] ${lines.length} мөр ХЭНД Ч хүрсэнгүй (${to.length} хүлээн авагч) — дараагийн шалгалтад дахин илгээнэ`);
    return 'failed';
  }
  writeState(now);
  console.log(`[iot] ${lines.length} мөр · ${sent}/${to.length} хүлээн авагч`);
  return 'sent';
}

if (IS_MAIN) {
  const loopArg = process.argv.indexOf('--loop');
  const everyMin = loopArg > 0 ? Number(process.argv[loopArg + 1]) || 15 : 0;

  const res = await check().catch((e) => { console.error(`[iot] шалгалт унав: ${e.message}`); return 'failed'; });
  /* Нэг удаагийн горим (cron/systemd): илгээлт унасан бол 0 биш кодоор гарна — таймерын бүртгэлд алдаа болж харагдана */
  if (!everyMin && res === 'failed') process.exitCode = 1;

  if (everyMin > 0) {
    console.log(`[iot] ${everyMin} минут тутам давтана (Ctrl+C зогсооно)`);
    setInterval(() => {
      check().catch((e) => console.error(`[iot] шалгалт унав: ${e.message}`));
    }, everyMin * 60_000);
  }
}
