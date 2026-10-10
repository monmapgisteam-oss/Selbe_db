/**
 * TELEGRAM БОТ — AI туслахыг Telegram-аар нээнэ.
 *
 * ⚠️ ЯАГААД BROWSER-ГҮЙ АЖИЛЛАЖ ЧАДАЖ БАЙНА ВЭ: агентын цөм (`src/lib/agent/*`)
 * нь React-аас хамааралгүй цэвэр TypeScript. Тиймээс Node-д ЯГ ИЖИЛ модулиудыг
 * импортлоно — давхаргын бүртгэл, хэрэгсэл, гогцоо бүгд ижил. Порталд шинэ
 * давхарга нэмэгдвэл бот ч тэр даруй мэднэ (гол шаардлага №3).
 *
 * Урсгал:
 *   Telegram → энэ бот → [src/lib/agent] → реле → Claude
 *                      → ArcGIS (шууд)
 *
 * ⚠️ ЭРХ — ХАМГИЙН ЧУХАЛ: Telegram хэрэглэгч нь ArcGIS хэрэглэгч БИШ, тиймээс
 * порталын `AuthGate` энд үйлчлэхгүй. Цагаан жагсаалт бол ЦОРЫН ГАНЦ хаалга.
 *
 * ⚠️ ШИНЭ ХЭРЭГЛЭГЧ ӨӨРӨӨ НЭМЭГДЭХГҮЙ. Танихгүй хүн бичихэд ЗӨВХӨН хүсэлт
 * үүсч, АДМИН нэг товшилтоор зөвшөөрнө. Автоматаар нэмдэг болговол ботын
 * нэрийг олсон хэн ч төслийн өгөгдлийг уншина.
 *
 * Ажиллуулах:  npm run bot
 */

import { readFileSync, writeFileSync, existsSync, renameSync, copyFileSync } from 'node:fs';
import { toHtml, stripHtml } from './telegram-format.mjs';
import { botFullViews } from './telegram-views.mjs';

const API = 'https://api.telegram.org';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * ⚠️ Ажиллах үед зөвшөөрсөн хэрэглэгчид — git-д ОРОХГҮЙ.
 *
 * ⚠️ `TELEGRAM_USERS_FILE`-ээр замыг СОЛИНО: Docker/24-7 байршуулалтад энэ файл
 * тусдаа volume-д (жиш. `/data/telegram-users.json`) байвал контейнер дахин
 * эхлэх/шинэчлэгдэхэд зөвшөөрсөн жагсаалт УСТАХГҮЙ. Заагаагүй бол CWD-д унана.
 */
const USERS_FILE = process.env.TELEGRAM_USERS_FILE || 'telegram-users.json';

/**
 * `.env.local`-ын жагсаалт: `<id>[:<харагдац|харагдац>]` таслалаар.
 *   `123456`             → бүх харагдац
 *   `123456:plan|bagts`  → зөвхөн тэр хоёр
 */
function parseList(raw) {
  const map = new Map();
  for (const part of (raw || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [id, views] = part.split(':');
    if (!/^\d+$/.test(id)) continue;
    map.set(id, views ? views.split(/[|;]/).map((v) => v.trim()).filter(Boolean) : 'all');
  }
  return map;
}

/**
 * ⚠️ АДМИН нь ЗӨВХӨН `.env.local`-д бичигдсэн хүмүүс. Ботоор дамжуулж
 * зөвшөөрөгдсөн хэрэглэгч бусдыг зөвшөөрөх эрхгүй — эс бөгөөс нэг хүн
 * зөвшөөрөгдмөгц гинжин урвал болж, хаалга бүрмөсөн нээгдэнэ.
 */
const ADMINS = parseList(process.env.TELEGRAM_ALLOWED);

/**
 * ⚠️ «✅ Зөвшөөрөх» ТОВЧНЫ ЭРХ — ИЛ ЖАГСААЛТ, `'all'` БИШ.
 *
 * Урьд нь `'all'` хадгалдаг байсан бөгөөд `registry.allowedDatasets` нь
 * `scope === 'all'` үед DATASETS-ийг ЯМАР Ч шүүлтгүй буцаадаг. Улмаар
 * `sensitive: true` тэмдэгтэй хоёр датасет — `ds:cashflow2` (гэрээний дүн,
 * захирамж, сарын хуваарь) ба `ds:ipc` (олгосон санхүүжилт, төлбөр) —
 * хамт нээгддэг байв. Гэтэл админд харагдах баталгаа нь «санхүүгээс бусад»
 * гэж бичдэг: товчийг дарсан админ санхүү хаалттай гэж итгээд нээж, шинэ
 * хэрэглэгч гэрээний дүнг шууд асууж авдаг байлаа. Тэр хоёр датасет
 * `view: 'pkgFin'` тул ИЛ жагсаалтаас `pkgFin` ба `finance` хоёрыг хасахад
 * л хаалт бодитоор үйлчилнэ.
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ГАР АРГААР синк (14 түлхүүр) БАЙХАА
 *    БОЛИВ — `VIEWS`-ийн бүх түлхүүрээс санхүүгийнхийг (`FINANCE_VIEWS`) хасна
 *    (`telegram-views.mjs`). ТУХ · Ерөнхий дашбоард · Дэд бүтэц · Чанар · QAQC зэрэг
 *    шинэ харагдацууд автоматаар орно. Шинэ САНХҮҮГИЙН харагдац нэмэгдвэл
 *    `FINANCE_VIEWS`-д нэмнэ (шалгуур нь эмзэг датасет алдагдвал унана).
 * ⚠️ Хуучин `telegram-users.json`-д `"views": "all"` гэж хадгалагдсан
 * бичлэгүүд ХЭВЭЭР үлдэнэ — шаардвал файлаас нь гараар засна. Өмнө зөвшөөрсөн
 * хэрэглэгчийн ИЛ жагсаалт ч хэвээр (шинэ харагдац авахын тулд дахин зөвшөөрнө).
 */
const { VIEWS } = await import('../src/lib/services/views.ts');
const FULL_VIEWS = botFullViews(VIEWS.map((v) => v.key));

/**
 * «🔵 Зөвхөн төлөвлөлт».
 * ⚠️ `'bagts'` нь 2026-08-27-нд `ViewKey`-ээс ХАСАГДСАН хий түлхүүр байсан
 * (`VIEW_BY_KEY.bagts === undefined`) — үүргийг нь `pkgProg` авсан.
 */
const PLAN_VIEWS = ['plan', 'pkgProg'];

if (!TOKEN) {
  console.error('✗ TELEGRAM_BOT_TOKEN алга. `.env.local`-д тавиад `npm run bot`.');
  process.exit(1);
}
if (!ADMINS.size) {
  console.error('✗ TELEGRAM_ALLOWED хоосон байна.');
  console.error('  Аюулгүйн шалтгаанаар админгүйгээр ажиллуулахгүй —');
  console.error('  зөвшөөрөл өгөх хүнгүй бол хүсэлтүүд хариугүй үлдэнэ.');
  process.exit(1);
}

/* ── Зөвшөөрөгдсөн хэрэглэгчид (файлд хадгалагдана) ── */

/**
 * ⚠️ 2026-10-09: АТОМ БИЧИЛТ — эхлээд түр файлд бичээд `rename`-ээр солино. Урьд шууд
 *    `writeFileSync` хийдэг байсан тул бичих дундуур процесс унавал (контейнер зогсох, диск
 *    дүүрэх) файл ХАГАС үлдэж, дараагийн асалтад зөвшөөрөгдсөн бүх хэрэглэгч алдагддаг байв.
 */
function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/**
 * Файл эвдэрсэн үед (уншигдсан ч задлагдаагүй) ДАРЖ БИЧИХГҮЙ — `true` бол `saveUsers` татгалзана.
 * ⚠️ 2026-10-09: урьд задлагдахгүй файлыг `{}` гэж эхлүүлээд дараагийн зөвшөөрөлд ХООСОН
 *    жагсаалтаар дарж бичдэг байсан тул бүх зөвшөөрөгдсөн хэрэглэгч чимээгүй устдаг байв.
 *    Одоо нөөц хуулбар (`*.corrupt-<агшин>`) үлдээж, логт хэлээд файлд хүрэхгүй.
 */
let usersFileBroken = false;

/** `{ "<id>": { views: 'all'|string[], name: string, at: string } }` */
function loadUsers() {
  if (!existsSync(USERS_FILE)) return {};
  try {
    const data = JSON.parse(readFileSync(USERS_FILE, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('объект биш');
    return data;
  } catch (e) {
    usersFileBroken = true;
    const backup = `${USERS_FILE}.corrupt-${Date.now()}`;
    try {
      copyFileSync(USERS_FILE, backup);
      console.error(`[bot] ⛔ ${USERS_FILE} уншигдсангүй: ${e.message} — нөөц: ${backup}. Файлыг ДАРЖ БИЧИХГҮЙ; засаад ботыг дахин асаана уу.`);
    } catch (e2) {
      console.error(`[bot] ⛔ ${USERS_FILE} уншигдсангүй: ${e.message}; нөөц хуулж чадсангүй: ${e2.message}. Файлыг ДАРЖ БИЧИХГҮЙ.`);
    }
    return {};
  }
}
const users = loadUsers();
/** `false` — хадгалсангүй (файл эвдэрсэн эсвэл бичих алдаа) */
function saveUsers() {
  if (usersFileBroken) {
    console.error(`[bot] ⛔ ${USERS_FILE} эвдэрсэн тул хадгалсангүй (өөрчлөлт зөвхөн санах ойд).`);
    return false;
  }
  try {
    writeAtomic(USERS_FILE, JSON.stringify(users, null, 2) + '\n');
    return true;
  } catch (e) {
    console.error(`[bot] ${USERS_FILE} бичигдсэнгүй: ${e.message}`);
    return false;
  }
}

/** Эцсийн эрх: админ (env) эсвэл зөвшөөрөгдсөн хэрэглэгч (файл) */
const scopeOf = (id) => ADMINS.get(id) ?? users[id]?.views ?? null;

/* ── Telegram API ── */

async function tg(method, body) {
  const res = await fetch(`${API}/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
  return json.result;
}

/**
 * ⚠️ 2026-10-09: ХОЛБООСНЫ УРЬДЧИЛСАН ХАРАГДАЦ УНТРААЛТТАЙ — бүх илгээлтэд. Урьдчилсан харагдац
 *    асаалттай үед Telegram-ийн сервер мессеж доторх хаяг руу ӨӨРӨӨ хандаж (хариулт/нэр доторх
 *    ArcGIS-ийн эсвэл хэрэглэгчийн зохиосон URL), хаягийг гуравдагчид ил болгодог; мөн танихгүй
 *    хэрэглэгчийн нэрэнд шигтгэсэн холбоос админы чатад «карт» болж харагддаг.
 */
const NO_PREVIEW = { link_preview_options: { is_disabled: true } };

/** ⚠️ Telegram-ийн мессеж 4096 тэмдэгтээр хязгаартай — урт хариултыг хуваана */
async function reply(chatId, text, extra = {}) {
  const html = toHtml(text);
  for (let i = 0; i < html.length; i += 3800) {
    const chunk = html.slice(i, i + 3800);
    try {
      await tg('sendMessage', { chat_id: chatId, text: chunk, parse_mode: 'HTML', ...NO_PREVIEW, ...extra });
    } catch (e) {
      // ⚠️ Хуваалт таг дундуур таарвал HTML эвдэрнэ — тэр үед цэвэр текстээр
      //    дахин илгээнэ. Хэрэглэгч хариултаа авахгүй үлдэхээс сэргийлнэ.
      console.error(`[bot] HTML илгээлт унав, цэвэр текстээр: ${e.message}`);
      await tg('sendMessage', {
        chat_id: chatId,
        text: stripHtml(chunk),
        ...NO_PREVIEW,
        ...extra,
      });
    }
  }
}

const nameOf = (f) =>
  [f?.first_name, f?.last_name].filter(Boolean).join(' ') + (f?.username ? ` (@${f.username})` : '');

/* ── Ярианы төлөв ── */

/**
 * ⚠️ `${chatId}:${userId}` → `{ scopeKey, history }` (2026-09-25, аудит №6).
 *    Урьд нь зөвхөн chatId-аар түлхүүрлэдэг байсан ч эрх (`scopeOf`) нь
 *    userId-аар тооцогддог тул бүлгийн чатад админы (санхүүгийн) хэрэгслийн
 *    үр дүн түүхэнд үлдэж, санхүүгийн эрхгүй гишүүний асуултад дахин
 *    дамжигддаг байв. Эрх өөрчлөгдвөл (scopeKey зөрвөл) түүхийг шинээр эхлүүлнэ.
 */
const chats = new Map();
const MAX_HISTORY = 20;

/** Бүлгийн чат бүрд «зөвхөн хувийн чат» сануулгыг НЭГ л удаа */
const groupWarned = new Set();

/**
 * Түүхийг огтлох индекс — ЗӨВХӨН асуултын (user + текст) заагаар.
 *
 * ⚠️ Дурын индексээр огтолбол эхний мөр нь `tool_use`-гүй `tool_result`
 *    болж, Messages API дараагийн бүх хүсэлтэд 400 буцааж чат `/new` хүртэл
 *    гацдаг байв. Цонх (сүүлийн `max`) дотор асуултын заагаас эхэлнэ; тийм
 *    зааг байхгүй бол (нэг асуулт `max`-аас урт) хамгийн сүүлийн асуултаас.
 */
function trimCut(history, max) {
  let last = 0;
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    if (m.role !== 'user' || typeof m.content !== 'string') continue;
    if (i >= history.length - max) return i;
    last = i;
  }
  return last;
}

/**
 * ⚠️ Нэг хүн олон удаа бичихэд админ руу дахин дахин мэдэгдэхгүй.
 * id → `{ name, at }` (зөвшөөрөх үед бүртгэлд нэрийг нь хадгалахад ашиглана).
 * ⚠️ 2026-10-09: `ACCESS_FILE`-д хадгалагдана (доор) — бот дахин асахад хүсэлтүүд ба цагийн
 *    хязгаар тэглэгдэж, нэг хүн дахин мэдэгдэл үүсгэдэг байв. `PENDING_TTL`-ээс хуучин нь хасагдана.
 */
const pending = new Map();
const PENDING_TTL = 14 * 24 * 3600 * 1000;

/**
 * ⚠️ 2026-10-09 (аудит №10): ХАНДАЛТЫН ХҮСЭЛТИЙН ХУРДНЫ ХЯЗГААР.
 *    Урьд `pending` л хамгаалдаг байсан: админ ТАТГАЛЗМАГЦ (`pending.delete`) нэг хүн шууд
 *    дахин хүсэлт илгээж админуудыг дахин дахин мэдэгдлээр дүүргэж чаддаг, мөн шинэ
 *    Telegram бүртгэл бүр хязгааргүй мэдэгдэл үүсгэдэг байв.
 *    · Нэг ID-д цагт НЭГ мэдэгдэл (`REQ_PER_ID_MS`) — татгалзсаны дараа ч;
 *    · Бүх ID нийлээд цагт `REQ_GLOBAL_MAX` мэдэгдэл — хэтэрвэл зөвхөн логт.
 */
const REQ_PER_ID_MS = 60 * 60 * 1000;
const REQ_GLOBAL_MAX = 20;
/** id → сүүлд админд мэдэгдсэн агшин */
const notifiedAt = new Map();
/**
 * id → сүүлд ЗӨВШӨӨРӨГДӨӨГҮЙ хэрэглэгчид ХАРИУЛСАН агшин.
 * ⚠️ 2026-10-09: урьд зөвшөөрөгдөөгүй хүний мессеж БҮРД хариулдаг байсан тул нэг хүн (эсвэл олон
 *    шинэ бүртгэл) ботыг Telegram-ийн илгээлтийн хязгаарт хүргэж, бусдын хариуг саатуулж чаддаг
 *    байв. Одоо ID бүрд цагт НЭГ хариу; бусад нь чимээгүй.
 */
const repliedAt = new Map();
/** Сүүлийн цагийн бүх мэдэгдлийн агшин */
let notifyLog = [];

/**
 * ⚠️ 2026-10-09: хандалтын хүсэлтийн төлөв (`pending` · `notifiedAt` · `repliedAt` · `notifyLog`)
 *    `USERS_FILE`-ийн ХАЖУУД жижиг JSON-д (`TELEGRAM_ACCESS_FILE`-ээр солино). Эвдэрсэн бол хоосноор
 *    эхэлнэ — энэ нь ЭРХ БИШ, зөвхөн түр төлөв (эрхийн файлаас ялгаатай, `loadUsers`-ийн ⚠️).
 */
const ACCESS_FILE = process.env.TELEGRAM_ACCESS_FILE || `${USERS_FILE.replace(/\.json$/i, '')}.access.json`;
function loadAccess() {
  if (!existsSync(ACCESS_FILE)) return;
  try {
    const d = JSON.parse(readFileSync(ACCESS_FILE, 'utf8')) ?? {};
    const ids = (o) => (o && typeof o === 'object' && !Array.isArray(o)
      ? Object.entries(o).filter(([k]) => /^\d+$/.test(k))
      : []);
    for (const [k, v] of ids(d.pending)) {
      if (v && typeof v === 'object') pending.set(k, { name: String(v.name ?? ''), at: Number(v.at) || Date.now() });
    }
    for (const [k, v] of ids(d.notifiedAt)) if (Number.isFinite(Number(v))) notifiedAt.set(k, Number(v));
    for (const [k, v] of ids(d.repliedAt)) if (Number.isFinite(Number(v))) repliedAt.set(k, Number(v));
    if (Array.isArray(d.notifyLog)) notifyLog = d.notifyLog.map(Number).filter(Number.isFinite);
  } catch (e) {
    console.error(`[bot] ${ACCESS_FILE} уншигдсангүй: ${e.message} — хүсэлтийн төлөв хоосноор эхэлнэ`);
  }
}
function saveAccess() {
  try {
    writeAtomic(ACCESS_FILE, JSON.stringify({
      pending: Object.fromEntries(pending),
      notifiedAt: Object.fromEntries(notifiedAt),
      repliedAt: Object.fromEntries(repliedAt),
      notifyLog,
    }) + '\n');
  } catch (e) {
    console.error(`[bot] ${ACCESS_FILE} бичигдсэнгүй: ${e.message}`);
  }
}
/** Хуучирсан төлөвийг хасна (Map өсөхгүй) */
function pruneAccess(now) {
  for (const [k, t] of notifiedAt) if (now - t >= REQ_PER_ID_MS) notifiedAt.delete(k);
  for (const [k, t] of repliedAt) if (now - t >= REQ_PER_ID_MS) repliedAt.delete(k);
  for (const [k, p] of pending) if (now - p.at >= PENDING_TTL) pending.delete(k);
  notifyLog = notifyLog.filter((t) => now - t < REQ_PER_ID_MS);
}
loadAccess();

/** `'ok'` — мэдэгдэнэ (тоолсон); `'id'` — энэ ID цагт нэгээ авсан; `'global'` — нийт квот дүүрсэн */
function mayNotify(id, now = Date.now()) {
  pruneAccess(now);
  if (notifiedAt.has(id)) return 'id';
  if (notifyLog.length >= REQ_GLOBAL_MAX) return 'global';
  notifiedAt.set(id, now);
  notifyLog.push(now);
  return 'ok';
}

/* ── ⚠️ 2026-10-09: Telegram хэрэглэгч бүрийн асуултын хязгаар ── */

/**
 * Зөвшөөрөгдсөн хэрэглэгч ч ботыг хязгааргүй ашиглаж чаддаг байв (реле дээр бүх ботын хэрэглэгч
 * нэг `bot` түлхүүр хуваалцаж, өдрийн төсвөөс чөлөөт байсан) — нэг хүн бусдын хурдны хязгаарыг
 * идэж, AI зардлыг хязгааргүй өсгөж чадна.
 *   · минутад `TELEGRAM_USER_PER_MIN` (анхдагч 10) асуулт;
 *   · өдөрт (УБ цаг) `TELEGRAM_USER_PER_DAY` (анхдагч 150) асуулт — токены төсвийн ОЙРОЛЦОО орлуулагч
 *     (асуулт бүр ~2–5 реле хүсэлт). АДМИН өдрийн хязгаараас чөлөөт.
 *   · реле рүү `x-bot-user` илгээгддэг тул релейн хэрэглэгч тус бүрийн хурд/төсөв мөн үйлчилнэ.
 * ⚠️ Санах ойд — бот дахин асахад өдрийн тоо тэглэгдэнэ (хүлээн зөвшөөрсөн нарийвчлал).
 */
const posInt = (raw, dflt) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : dflt;
};
const Q_PER_MIN = posInt(process.env.TELEGRAM_USER_PER_MIN, 10);
const Q_PER_DAY = posInt(process.env.TELEGRAM_USER_PER_DAY, 150);
const qMinute = new Map();
const qDay = new Map();
let qDayKey = '';
const ubDay = (t) => new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
/** `'ok'` (тоолсон) · `'minute'` · `'day'` */
function questionAllowed(userId, isAdmin) {
  const now = Date.now();
  const d = ubDay(now);
  if (d !== qDayKey) { qDayKey = d; qDay.clear(); }
  const recent = (qMinute.get(userId) || []).filter((t) => now - t < 60_000);
  if (recent.length >= Q_PER_MIN) { qMinute.set(userId, recent); return 'minute'; }
  if (!isAdmin && (qDay.get(userId) || 0) >= Q_PER_DAY) return 'day';
  recent.push(now);
  qMinute.set(userId, recent);
  qDay.set(userId, (qDay.get(userId) || 0) + 1);
  /* хуучирсан минутын түлхүүрийг үе үе хасна */
  if (qMinute.size > 1000) for (const [k, arr] of qMinute) if (!arr.length || now - arr[arr.length - 1] >= 60_000) qMinute.delete(k);
  return 'ok';
}

/**
 * ⚠️ 2026-10-09: РЕЛЕ РҮҮ ЗЭРЭГ ЯВАХ АСУУЛТЫН ТАГ (`TELEGRAM_MAX_PARALLEL`, анхдагч 4) — чат бүр
 *    зэрэгцэн боловсруулагддаг болсон тул олон хэрэглэгч зэрэг асуухад реле/ArcGIS-ийг дарахгүй.
 *    Слотыг ШУУД дамжуулна (суллах үед хүлээгч байвал тоолуур буурахгүй) — уралдаанд таг давахгүй.
 */
const MAX_PARALLEL = posInt(process.env.TELEGRAM_MAX_PARALLEL, 4);
let running = 0;
const waiters = [];
async function withSlot(fn) {
  if (running < MAX_PARALLEL) running++;
  else await new Promise((r) => waiters.push(r));
  try {
    return await fn();
  } finally {
    const next = waiters.shift();
    if (next) next();
    else running--;
  }
}

/**
 * Хэрэглэгчид харагдах алдааны мөр.
 * ⚠️ 2026-10-09 (аудит №10): `ArcGISError.url` (үйлчилгээний дотоод хаяг) ба мессеж доторх
 *    URL-ыг Telegram руу ГАРГАХГҮЙ — дэлгэрэнгүй нь зөвхөн консолын логт.
 */
function userErrorText(e) {
  if (e?.name === 'ArcGISError' || (e && typeof e === 'object' && 'url' in e)) {
    return 'ArcGIS үйлчилгээ хариу өгсөнгүй — түр хүлээгээд дахин оролдоно уу.';
  }
  const msg = String(e?.message ?? e ?? 'Тодорхойгүй алдаа');
  return msg.replace(/https?:\/\/\S+/g, '[хаяг]');
}

const HELP = [
  'Сэлбэ төслийн AI туслах.',
  '',
  'Барилга, бүс, зам, инженерийн шугам, өртөг, санхүү, гүйцэтгэл, ХАБЭА-гийн',
  'талаар монголоор асууна уу. Тоо бүр ArcGIS-ээс тухайн мөчид татагдана.',
  '',
  'Жишээ:',
  '  • Төсөлд хэдэн барилга байна вэ?',
  '  • Багц 1 мэдээллийг дэлгэрэнгүй харуулаач',
  '  • Барилгын төлөв бүрээр хэдэн барилга вэ?',
  '  • Багц 6.1-ийн гэрээний дүн хэд вэ?',
  '  • ХАБЭА-гийн сүүлийн тайлангаар хэдэн ажилтан байна?',
  '',
  'Тушаал:',
  '  /new  — яриаг шинээр эхлүүлэх',
  '  /help — энэ заавар',
].join('\n');

/* ── Шинэ хэрэглэгчийн хүсэлт ── */

async function requestAccess(from, chatId) {
  const id = String(from.id);
  const now = Date.now();
  pruneAccess(now);
  /* ⚠️ 2026-10-09: ID бүрд цагт НЭГ хариу (`repliedAt`-ийн ⚠️) — бусад нь чимээгүй */
  if (repliedAt.has(id)) return;
  repliedAt.set(id, now);
  const hello =
    `Сайн байна уу, ${from.first_name ?? ''}!\n\n` +
    `Танд энэ ботыг ашиглах эрх хараахан нээгдээгүй байна.\n`;

  if (pending.has(id)) {
    saveAccess();
    await reply(chatId, `${hello}Таны хүсэлт админд илгээгдсэн — зөвшөөрөгдмөгц мэдэгдэнэ.\n\nТаны ID: ${id}`);
    return;
  }
  /* ⚠️ 2026-10-09: хурдны хязгаар (`mayNotify`-ийн ⚠️) — хэтэрвэл админд мэдэгдэхгүй. Урьд энэ үед
     ч хэрэглэгчид «Админд хүсэлт илгээлээ» гэж ХУДАЛ хэлдэг байв — одоо дараалалд байгааг ил хэлнэ. */
  const verdict = mayNotify(id, now);
  if (verdict !== 'ok') {
    saveAccess();
    console.warn(`[bot] хандалтын хүсэлт хязгаарлагдав (${verdict}; цагт 1/ID · нийт ${REQ_GLOBAL_MAX}): ${id}`);
    await reply(chatId, `${hello}Хүсэлт дараалалд байна — дараа дахин оролдоно уу.\n\nТаны ID: ${id}`);
    return;
  }
  pending.set(id, { name: nameOf(from), at: now });
  saveAccess();
  await reply(chatId, `${hello}Админд хүсэлт илгээлээ — зөвшөөрөгдмөгц мэдэгдэнэ.\n\nТаны ID: ${id}`);

  // ⚠️ Хүсэлтийг БҮХ админд илгээнэ — нэг нь л хариулахад хангалттай
  for (const adminId of ADMINS.keys()) {
    try {
      await tg('sendMessage', {
        ...NO_PREVIEW,
        chat_id: adminId,
        text:
          `🔔 Шинэ хандалтын хүсэлт\n\n` +
          `${nameOf(from)}\nID: ${id}\n\n` +
          `Зөвшөөрвөл төслийн БҮХ өгөгдөлд (санхүүгээс бусад) хандана.`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Зөвшөөрөх', callback_data: `ok:${id}` },
              { text: '🔵 Зөвхөн төлөвлөлт', callback_data: `plan:${id}` },
            ],
            [{ text: '❌ Татгалзах', callback_data: `no:${id}` }],
          ],
        },
      });
    } catch (e) {
      console.error(`[bot] админд (${adminId}) мэдэгдэж чадсангүй: ${e.message}`);
    }
  }
  console.log(`[bot] хандалтын хүсэлт: ${id} · ${nameOf(from)}`);
}

/** Админы товшилт — зөвшөөрөх / хязгаарлах / татгалзах */
async function handleCallback(cb) {
  const adminId = String(cb.from?.id ?? '');
  const [action, targetId] = String(cb.data ?? '').split(':');

  // ⚠️ Товшсон хүн ЖИНХЭНЭ админ мөн эсэхийг заавал шалгана — `callback_data`-г
  //    хэн ч зохиож илгээж болно.
  if (!ADMINS.has(adminId)) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Танд эрх алга', show_alert: true });
    return;
  }
  if (!/^\d+$/.test(targetId || '')) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Буруу хүсэлт' });
    return;
  }

  let note;
  if (action === 'no') {
    pending.delete(targetId);
    saveAccess();
    note = 'Татгалзлаа';
    await reply(targetId, 'Хандалтын хүсэлт татгалзагдлаа.').catch(() => {});
  } else {
    const views = action === 'plan' ? PLAN_VIEWS : FULL_VIEWS;
    // Хүсэлт үүсэх үед хадгалсан нэрийг (pending) уншина — `cb.data_name` гэж
    // Telegram callback-т байдаггүй талбар байсан тул нэр үргэлж хоосон үлддэг байв.
    users[targetId] = { views, name: pending.get(targetId)?.name ?? '', at: new Date().toISOString() };
    const saved = saveUsers();
    pending.delete(targetId);
    repliedAt.delete(targetId);
    saveAccess();
    note = action === 'plan' ? 'Төлөвлөлтийн эрхээр зөвшөөрлөө' : 'Санхүүгээс бусад бүх эрхээр зөвшөөрлөө';
    /* ⚠️ 2026-10-09: файлд хадгалагдаагүй бол админд ил хэлнэ (`saveUsers`-ийн ⚠️) — дахин асахад алга болно */
    if (!saved) note += ' (⚠️ файлд хадгалагдсангүй — ботын логийг шалгана уу)';
    await reply(
      targetId,
      'Хандалт нээгдлээ! 🎉\n\nАсуултаа монголоор бичнэ үү.\n/help — заавар',
    ).catch(() => {});
  }

  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: note });
  /* ⚠️ 2026-10-09 (аудит №6): `cb.message` АЛГА байж болно — Telegram хэт хуучин мессежийн
     товшилтод `message`-гүй (зөвхөн `inline_message_id`) callback өгдөг; урьд `cb.message.chat.id`
     TypeError шидэж, шийдвэр хадгалагдсан ч `handleCallback` алдаагаар дуусдаг байв. */
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  if (chatId != null && messageId != null) {
    await tg('editMessageText', {
      ...NO_PREVIEW,
      chat_id: chatId,
      message_id: messageId,
      text: `${cb.message.text ?? ''}\n\n➡️ ${note} (${adminId})`,
    }).catch(() => {});
  }
  console.log(`[bot] ${adminId} → ${targetId}: ${note}`);
}

/* ── Мессеж боловсруулах ── */

async function handle(msg) {
  const chatId = msg.chat?.id;
  const from = msg.from;
  const userId = String(from?.id ?? '');
  const text = (msg.text ?? '').trim();
  if (!chatId || !text) return;

  /* ⚠️ ЗӨВХӨН ХУВИЙН ЧАТ (2026-09-25, аудит №6): бүлэгт хариулт БҮХ гишүүнд
     (цагаан жагсаалтад ороогүйд ч) харагдаж, асуусан хүний эрхээр татсан
     өгөгдөл бусдад задардаг. Хандалтын хүсэлт ч бүлэгт үүсгэхгүй. */
  if (msg.chat?.type !== 'private') {
    if (!groupWarned.has(chatId)) {
      groupWarned.add(chatId);
      await reply(chatId, 'Энэ бот зөвхөн хувийн чатаар ажиллана — надад шууд бичнэ үү.').catch(() => {});
    }
    return;
  }

  // ⚠️ ЭРХИЙН ШАЛГАЛТ — бусад бүх зүйлээс ӨМНӨ
  const scope = scopeOf(userId);
  if (!scope) {
    await requestAccess(from, chatId);
    return;
  }

  if (text === '/start' || text === '/help') {
    await reply(chatId, HELP);
    return;
  }
  const chatKey = `${chatId}:${userId}`;
  if (text === '/new') {
    chats.delete(chatKey);
    await reply(chatId, 'Яриа шинэчлэгдлээ. Асуултаа бичнэ үү.');
    return;
  }
  // Зөвхөн админд — хэн хандаж байгааг харах
  if (text === '/users' && ADMINS.has(userId)) {
    const lines = [
      'Админ (.env.local):',
      ...[...ADMINS].map(([id, s]) => `  ${id} → ${s === 'all' ? 'бүх' : s.join(', ')}`),
      '',
      `Зөвшөөрсөн (${USERS_FILE}):`,
      ...(Object.keys(users).length
        ? Object.entries(users).map(([id, u]) => `  ${id} → ${u.views === 'all' ? 'бүх' : u.views.join(', ')}`)
        : ['  (хоосон)']),
    ];
    await reply(chatId, lines.join('\n'));
    return;
  }
  if (text.startsWith('/')) {
    await reply(chatId, 'Танихгүй тушаал. /help бичээд заавар харна уу.');
    return;
  }

  /* ⚠️ 2026-10-09: хэрэглэгч бүрийн асуултын хязгаар (`questionAllowed`-ийн ⚠️) */
  const verdict = questionAllowed(userId, ADMINS.has(userId));
  if (verdict === 'minute') {
    await reply(chatId, `Хэт олон асуулт — минутад ${Q_PER_MIN}. Түр хүлээгээд дахин асууна уу.`);
    return;
  }
  if (verdict === 'day') {
    await reply(chatId, `Өнөөдрийн асуултын хязгаар (${Q_PER_DAY}) дууслаа — маргааш дахин асууна уу.`);
    return;
  }

  const scopeKey = JSON.stringify(scope);
  let chat = chats.get(chatKey);
  if (!chat || chat.scopeKey !== scopeKey) {
    chat = { scopeKey, history: [] };
    chats.set(chatKey, chat);
  }
  const history = chat.history;
  /* ⚠️ ask() түүхийг ЯВЦ ДУНД өөрчилнө (асуулт, tool_use, tool_result) —
     алдаа гарвал ЯГ энэ урт руу буцаана (AgentChat-ийн ижил дүрэм). */
  const base = history.length;

  // «бичиж байна…» — хариулт 10+ секунд болдог тул хэрэглэгч хүлээж байгаагаа мэднэ
  const typing = setInterval(() => {
    void tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  }, 4000);
  void tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

  try {
    const t0 = Date.now();
    /* ⚠️ 2026-10-09: `botUser` → реле `bot:<id>` (хэрэглэгч бүрийн хурд/төсөв); `withSlot` — нийт зэрэг таг */
    const res = await withSlot(() => ask({ question: text, history, scope, botUser: userId }));
    console.log(`[bot] ${userId}: "${text.slice(0, 60)}" → ${((Date.now() - t0) / 1000).toFixed(1)}с, ${res.turns} эргэлт`);
    await reply(chatId, res.text);
  } catch (e) {
    // ⚠️ Алдааг ЧИМЭЭГҮЙ залгихгүй — хэрэглэгч хариулт хүлээсээр үлдэхгүй
    console.error(`[bot] алдаа: ${e?.message ?? e}`);
    /* ⚠️ Урьд нь зөвхөн сүүлийн 'user' мөрүүдийг хасдаг байсан тул дүүжин
       assistant `tool_use` үлдэж, дараагийн асуулт бүр 400-аар унадаг байв.
       Буцаалт нь reply()-ээс ӨМНӨ — Telegram унасан ч түүх эвдрэхгүй. */
    history.length = base;
    await reply(chatId, `Алдаа гарлаа: ${userErrorText(e)}`);
  } finally {
    clearInterval(typing);
    if (history.length > MAX_HISTORY) history.splice(0, trimCut(history, MAX_HISTORY));
  }
}

/* ── ⚠️ 2026-10-09: чат бүрийн дараалал ── */

/**
 * Урьд update бүрийг `await`-аар ДАРААЛАН боловсруулдаг байсан тул нэг удаан асуулт (10–60 с)
 * БҮХ хэрэглэгчийн мессеж, тэр байтугай админы «✅ Зөвшөөрөх» товшилтыг ч хүлээлгэдэг байв.
 * Одоо:
 *   · админы товшилт (`callback_query`) ШУУД, дараалалгүй;
 *   · мессеж — ЧАТ БҮРД тусдаа дараалал (нэг чат дотор дараалал хадгалагдана — түүх эвдрэхгүй),
 *     өөр чатууд зэрэгцэн явна (реле рүү нийт `MAX_PARALLEL`, `withSlot`);
 *   · нэг чатад `MAX_QUEUE`-ээс олон хүлээгдэж буй мессеж бол шинийг хаяж, минутад нэг удаа сануулна.
 */
const MAX_QUEUE = 3;
const queues = new Map();
const queueWarned = new Map();
function enqueue(chatId, fn) {
  const key = String(chatId);
  let q = queues.get(key);
  if (!q) {
    q = { tail: Promise.resolve(), depth: 0 };
    queues.set(key, q);
  }
  if (q.depth >= MAX_QUEUE) return false;
  q.depth++;
  q.tail = q.tail
    .then(fn)
    .catch((e) => console.error(`[bot] чат ${key}: ${e?.message ?? e}`))
    .finally(() => {
      q.depth--;
      if (!q.depth && queues.get(key) === q) queues.delete(key);
    });
  return true;
}
function dispatchMessage(msg) {
  const chatId = msg.chat?.id;
  if (!chatId) return;
  if (enqueue(chatId, () => handle(msg))) return;
  const now = Date.now();
  if (now - (queueWarned.get(chatId) ?? 0) < 60_000) return;
  queueWarned.set(chatId, now);
  if (queueWarned.size > 1000) for (const [k, t] of queueWarned) if (now - t >= 60_000) queueWarned.delete(k);
  void reply(chatId, 'Өмнөх асуултууд боловсруулагдаж байна — хариуг хүлээгээд дахин бичнэ үү.').catch(() => {});
}

/* ── Урт татах гогцоо (long polling) ── */

process.env.NEXT_PUBLIC_AGENT_API ||= 'http://127.0.0.1:8787';
const { ask, relayAlive, AGENT_API } = await import('../src/lib/agent/client.ts');

async function main() {
  if (!(await relayAlive())) {
    console.error(`✗ Реле хариулахгүй байна: ${AGENT_API}`);
    console.error('  Асаах:  cd agent-proxy && npm start');
    process.exit(1);
  }

  const me = await tg('getMe', {});
  console.log(`[bot] @${me.username} асаалттай`);
  console.log(`      админ ${ADMINS.size} · зөвшөөрсөн ${Object.keys(users).length}`);
  for (const [id, sc] of ADMINS) console.log(`      ${id} → ${sc === 'all' ? 'бүх харагдац' : sc.join(', ')} (админ)`);

  let offset = 0;
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; console.log('\n[bot] зогсож байна…'); });

  while (!stopping) {
    try {
      // ⚠️ `timeout: 30` — сервер шинэ мессеж хүртэл барина. Богино давталтаар
      //    байнга асуувал Telegram хурдны хязгаар тавина.
      const updates = await tg('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      });
      /* ⚠️ 2026-10-09: `await` ХИЙХГҮЙ — чат бүрийн дараалал / товшилт шууд (`enqueue`-ийн ⚠️) */
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) dispatchMessage(u.message);
        else if (u.callback_query) {
          void handleCallback(u.callback_query).catch((e) => {
            console.error(`[bot] update ${u.update_id}: ${e?.message ?? e}`);
          });
        }
      }
    } catch (e) {
      console.error(`[bot] polling алдаа: ${e?.message ?? e}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  process.exit(0);
}

await main();
