/**
 * TELEGRAM БОТЫН ЗӨВШӨӨРСӨН ХЭРЭГЛЭГЧИЙН ФАЙЛ — уншилт · нэгтгэж бичих · хасах эрх (⚠️ 2026-10-22, аудит).
 *
 * ⚠️ ЯАГААД: урьд нь файлыг ЗӨВХӨН асахдаа нэг удаа уншиж, хадгалах бүрд САНАХ ОЙН хуулбараа бүтнээр нь дарж бичдэг байв —
 *    админы ГАРААР хийсэн засвар (жиш. хүн хасах) дараагийн «✅ Зөвшөөрөх»-өөр чимээгүй буцаж, гараар хассан хүн
 *    ажиллаж байгаа ботод эрхтэй хэвээр үлддэг байлаа.
 *    · `refresh()` — файлын `mtime` өөрчлөгдсөн бол дахин уншина (эрхийн шалгалт бүрд хямд `stat`) — гар засвар шууд үйлчилнэ;
 *    · `update(fn)` — бичихийн ӨМНӨ файлыг ДАХИН уншиж, ЗӨВХӨН энэ өөрчлөлтийг (нэг ID нэмэх/хасах) түүн дээр хийгээд атомоор
 *      бичнэ — гар засвар ба бусад ID хэвээр;
 *    · эвдэрсэн файл (задлагдахгүй) — ДАРЖ БИЧИХГҮЙ (2026-10-09-ний дүрэм): асахдаа эвдэрсэн бол хоосноор (fail-closed) эхэлж
 *      нөөц хуулбар үлдээнэ; ажиллаж байхад эвдэрвэл сүүлийн зөв жагсаалтаараа үйлчилж, бичилтийг татгалзана (логт нэг
 *      удаа). Файл засагдмагц автоматаар сэргэнэ.
 * ⚠️ Хэлбэр: `{ "<telegram id>": { views: 'all'|string[], name: string, at: string } }`.
 */
import { readFileSync, writeFileSync, existsSync, renameSync, copyFileSync, statSync } from 'node:fs';

/**
 * ⚠️ 2026-10-09: АТОМ БИЧИЛТ — эхлээд түр файлд бичээд `rename`-ээр солино (процесс бичих дундуур унавал файл хагас
 *    үлдэж бүх хэрэглэгч алдагдахаас сэргийлнэ). `telegram-bot.mjs`-ээс шилжсэн — хүсэлтийн төлөвийн файл ч үүгээр.
 */
export function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

const isObj = (d) => !!d && typeof d === 'object' && !Array.isArray(d);
const mtimeOf = (file) => { try { return statSync(file).mtimeMs; } catch { return -1; } };

/** Файлыг уншина: `{ ok: true, data }` (байхгүй → хоосон) эсвэл `{ ok: false, error }` */
export function readUsersFile(file) {
  if (!existsSync(file)) return { ok: true, data: {} };
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (!isObj(data)) throw new Error('объект биш');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} file
 * @param {{ log?: Pick<Console, 'error' | 'warn'> }} [opts]
 */
export function createUsersStore(file, { log = console } = {}) {
  /** Сүүлийн ЗӨВ жагсаалт */
  let users = {};
  /** Файл задлагдахгүй — бичихгүй */
  let broken = false;
  let mtime = -1;
  let warned = false;

  /** Асах үеийн уншилт — эвдэрсэн бол нөөц хуулж, хоосноор (fail-closed) эхэлнэ */
  function load() {
    const r = readUsersFile(file);
    mtime = mtimeOf(file);
    if (r.ok) { users = r.data; broken = false; return users; }
    broken = true;
    users = {};
    const backup = `${file}.corrupt-${Date.now()}`;
    try {
      copyFileSync(file, backup);
      log.error(`[bot] ⛔ ${file} уншигдсангүй: ${r.error} — нөөц: ${backup}. Файлыг ДАРЖ БИЧИХГҮЙ; засаад ботыг дахин асаана уу.`);
    } catch (e2) {
      log.error(`[bot] ⛔ ${file} уншигдсангүй: ${r.error}; нөөц хуулж чадсангүй: ${e2.message}. Файлыг ДАРЖ БИЧИХГҮЙ.`);
    }
    return users;
  }

  /** Файл өөрчлөгдсөн бол дахин уншина (гар засвар). Эвдэрсэн бол сүүлийн зөвөөрөө үлдэнэ. */
  function refresh() {
    const m = mtimeOf(file);
    if (m === mtime) return;
    const r = readUsersFile(file);
    mtime = m;
    if (r.ok) {
      users = r.data;
      if (broken) log.warn(`[bot] ${file} дахин уншигдлаа — бичилт сэргэв.`);
      broken = false;
      warned = false;
      return;
    }
    broken = true;
    if (!warned) {
      warned = true;
      log.error(`[bot] ⛔ ${file} гараар засагдаад задлагдахгүй байна (${r.error}) — сүүлийн зөв жагсаалтаар үйлчилж, файлд БИЧИХГҮЙ. Засмагц автоматаар сэргэнэ.`);
    }
  }

  /**
   * Нэгтгэж бичих — файлыг ДАХИН уншаад `fn(data)`-ийг (нэг ID-г өөрчлөх) түүн дээр хийнэ.
   * @returns {boolean} файлд хадгалагдсан эсэх (`false` — зөвхөн санах ойд: файл эвдэрсэн эсвэл бичих алдаа)
   */
  function update(fn) {
    const r = readUsersFile(file);
    if (!r.ok) {
      broken = true;
      fn(users);
      log.error(`[bot] ⛔ ${file} эвдэрсэн тул хадгалсангүй (өөрчлөлт зөвхөн санах ойд).`);
      return false;
    }
    const data = r.data;
    fn(data);
    try {
      writeAtomic(file, `${JSON.stringify(data, null, 2)}\n`);
      users = data;
      broken = false;
      mtime = mtimeOf(file);
      return true;
    } catch (e) {
      users = data;
      log.error(`[bot] ${file} бичигдсэнгүй: ${e.message}`);
      return false;
    }
  }

  return {
    load,
    refresh,
    update,
    /** Нэг хэрэглэгч (гар засварыг тусгана) */
    get(id) { refresh(); return Object.hasOwn(users, id) ? users[id] : undefined; },
    /** Бүх хэрэглэгч (гар засварыг тусгана) */
    all() { refresh(); return users; },
    get broken() { return broken; },
  };
}

/**
 * ХАСАХ ЭРХ — «✅ Зөвшөөрөх»-ийн хүрээний ИЖИЛ дүрэм (`telegram-views.grantWithin`): `'all'` админ хэнийг ч; хязгаартай
 * админ (`<id>:plan|pkgProg`) зөвхөн ӨӨРИЙН хүрээнд бүрэн багтах (өөрөө олгож чадах байсан) хэрэглэгчийг. Хуучин `'all'`
 * эрхтэй хэрэглэгчийг зөвхөн бүх эрхтэй админ хасна. Хүрээгүй (`null`) — хэнийг ч.
 */
export function canRevoke(adminScope, userViews) {
  if (adminScope === 'all') return true;
  if (!Array.isArray(adminScope) || !Array.isArray(userViews)) return false;
  return userViews.every((v) => adminScope.includes(v));
}
