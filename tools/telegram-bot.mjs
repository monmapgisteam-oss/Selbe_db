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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { toHtml, stripHtml } from './telegram-format.mjs';

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
 * ⚠️ Энэ жагсаалт `services.ts`-ийн `ViewKey`-тэй ГАР АРГААР синк байна —
 * шинэ харагдац нэмэгдвэл энд бас нэмнэ (санхүүгийнх бол НЭМЭХГҮЙ).
 * ⚠️ Хуучин `telegram-users.json`-д `"views": "all"` гэж хадгалагдсан
 * бичлэгүүд ХЭВЭЭР үлдэнэ — шаардвал файлаас нь гараар засна.
 */
const FULL_VIEWS = [
  'dashboard', 'plan', 'pkgProg', 'gazar', 'analysis', 'huvaari',
  'tailan', 'habea', 'irged', 'iot', 'ersdel', 'zovshoorol', 'guitsetgel', 'schem',
];

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

/** `{ "<id>": { views: 'all'|string[], name: string, at: string } }` */
function loadUsers() {
  if (!existsSync(USERS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    console.error(`[bot] ${USERS_FILE} уншигдсангүй: ${e.message} — хоосноор эхэлнэ`);
    return {};
  }
}
const users = loadUsers();
const saveUsers = () => writeFileSync(USERS_FILE, JSON.stringify(users, null, 2) + '\n');

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

/** ⚠️ Telegram-ийн мессеж 4096 тэмдэгтээр хязгаартай — урт хариултыг хуваана */
async function reply(chatId, text, extra = {}) {
  const html = toHtml(text);
  for (let i = 0; i < html.length; i += 3800) {
    const chunk = html.slice(i, i + 3800);
    try {
      await tg('sendMessage', { chat_id: chatId, text: chunk, parse_mode: 'HTML', ...extra });
    } catch (e) {
      // ⚠️ Хуваалт таг дундуур таарвал HTML эвдэрнэ — тэр үед цэвэр текстээр
      //    дахин илгээнэ. Хэрэглэгч хариултаа авахгүй үлдэхээс сэргийлнэ.
      console.error(`[bot] HTML илгээлт унав, цэвэр текстээр: ${e.message}`);
      await tg('sendMessage', {
        chat_id: chatId,
        text: stripHtml(chunk),
        ...extra,
      });
    }
  }
}

const nameOf = (f) =>
  [f?.first_name, f?.last_name].filter(Boolean).join(' ') + (f?.username ? ` (@${f.username})` : '');

/* ── Ярианы төлөв ── */

const chats = new Map();
const MAX_HISTORY = 20;

/**
 * ⚠️ Нэг хүн олон удаа бичихэд админ руу дахин дахин мэдэгдэхгүй.
 * id → нэр (зөвшөөрөх үед бүртгэлд нэрийг нь хадгалахад ашиглана).
 */
const pending = new Map();

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
  await reply(
    chatId,
    `Сайн байна уу, ${from.first_name ?? ''}!\n\n` +
      `Танд энэ ботыг ашиглах эрх хараахан нээгдээгүй байна.\n` +
      `Админд хүсэлт илгээлээ — зөвшөөрөгдмөгц мэдэгдэнэ.\n\n` +
      `Таны ID: ${id}`,
  );

  if (pending.has(id)) return;
  pending.set(id, nameOf(from));

  // ⚠️ Хүсэлтийг БҮХ админд илгээнэ — нэг нь л хариулахад хангалттай
  for (const adminId of ADMINS.keys()) {
    try {
      await tg('sendMessage', {
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
    note = 'Татгалзлаа';
    await reply(targetId, 'Хандалтын хүсэлт татгалзагдлаа.').catch(() => {});
  } else {
    const views = action === 'plan' ? PLAN_VIEWS : FULL_VIEWS;
    // Хүсэлт үүсэх үед хадгалсан нэрийг (pending) уншина — `cb.data_name` гэж
    // Telegram callback-т байдаггүй талбар байсан тул нэр үргэлж хоосон үлддэг байв.
    users[targetId] = { views, name: pending.get(targetId) ?? '', at: new Date().toISOString() };
    saveUsers();
    pending.delete(targetId);
    note = action === 'plan' ? 'Төлөвлөлтийн эрхээр зөвшөөрлөө' : 'Санхүүгээс бусад бүх эрхээр зөвшөөрлөө';
    await reply(
      targetId,
      'Хандалт нээгдлээ! 🎉\n\nАсуултаа монголоор бичнэ үү.\n/help — заавар',
    ).catch(() => {});
  }

  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: note });
  await tg('editMessageText', {
    chat_id: cb.message.chat.id,
    message_id: cb.message.message_id,
    text: `${cb.message.text}\n\n➡️ ${note} (${adminId})`,
  }).catch(() => {});
  console.log(`[bot] ${adminId} → ${targetId}: ${note}`);
}

/* ── Мессеж боловсруулах ── */

async function handle(msg) {
  const chatId = msg.chat?.id;
  const from = msg.from;
  const userId = String(from?.id ?? '');
  const text = (msg.text ?? '').trim();
  if (!chatId || !text) return;

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
  if (text === '/new') {
    chats.delete(chatId);
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

  const history = chats.get(chatId) ?? [];
  chats.set(chatId, history);

  // «бичиж байна…» — хариулт 10+ секунд болдог тул хэрэглэгч хүлээж байгаагаа мэднэ
  const typing = setInterval(() => {
    void tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  }, 4000);
  void tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

  try {
    const t0 = Date.now();
    const res = await ask({ question: text, history, scope });
    console.log(`[bot] ${userId}: "${text.slice(0, 60)}" → ${((Date.now() - t0) / 1000).toFixed(1)}с, ${res.turns} эргэлт`);
    await reply(chatId, res.text);
  } catch (e) {
    // ⚠️ Алдааг ЧИМЭЭГҮЙ залгихгүй — хэрэглэгч хариулт хүлээсээр үлдэхгүй
    console.error(`[bot] алдаа: ${e?.message ?? e}`);
    await reply(chatId, `Алдаа гарлаа: ${e?.message ?? e}`);
    while (history.length && history[history.length - 1].role === 'user') history.pop();
  } finally {
    clearInterval(typing);
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  }
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
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          if (u.message) await handle(u.message);
          else if (u.callback_query) await handleCallback(u.callback_query);
        } catch (e) {
          console.error(`[bot] update ${u.update_id}: ${e?.message ?? e}`);
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
