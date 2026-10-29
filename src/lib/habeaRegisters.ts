/**
 * ХАБ-ЫН БҮРТГЭЛҮҮД — «Бусад үзүүлэлт» карт (2026-10-08, хэрэглэгчийн хүсэлт).
 *
 * Эх сурвалж (2026-10-15-наас): Сэлбэ ENTERPRISE `Hosted/Сэлбэ_ХАБ1015` FeatureServer (хүснэгтүүд,
 * талбарын нэр ЖИЖИГ ҮСЭГТЭЙ; урьд нь AGOL `Сэлбэ_ХАБ1007`):
 *   · 40 — Талбайн зааварчилгааны бүртгэл  (огноо: `огноо`)
 *   · 42 — Сануулах хуудас өгсөн бүртгэл    (огноо: `баримтын_он__сар__өдөр`)
 *   · 37 — Хариуцлага тооцох мэдэгдэх       (огноо: `огноо`)
 *   · 33 — Сайжруулах (огноогүй: `week` + `тоо` → долоо хоногийн НИЙЛБЭР)
 *   · 43 — Хог хаягдал (`loadHabeaWaste`)
 * «Аюулыг мэдээлэх хуудас» — эх хүснэгт ОДООГООР БАЙХГҮЙ: «—»
 * (`null ≠ 0` — тэг гэж харуулбал «бүртгэл алга» гэж ХУДАЛ уншигдана).
 */
import { t as tr } from '@/lib/i18nCore';
import { arcgisPost } from '@/lib/query';
import { cached } from '@/lib/live';
import { AUTH, HABEA } from '@/lib/services';
import { currentUser, requireCap } from '@/lib/who';
import { invalidate } from '@/lib/dataBus';
import { isLostWrite } from '@/lib/lostWrite';
import { prevWeek } from '@/modules/habeaUzleg';
import { ENT_PORTAL, entSession } from '@/lib/entDocs';
import { HABEA_TTL_MS, HABEA_POLL_MS } from '@/lib/habeaTiming';

export type RegisterRow = {
  key: string;
  label: string;
  /** Өмнөх бүтэн долоо хоногийн тоо — эх сурвалжгүй / тоо ирээгүй бол `null` */
  week: number | null;
  hint?: string;
};

export type RegisterData = { rows: RegisterRow[]; weekNo: number; start: Date; end: Date };

/**
 * Өмнөх бүтэн долоо хоног — Даваа 00:00 (УЛААНБААТАР) хилтэй.
 */
export const lastFullWeek = (now = new Date()): { start: Date; end: Date; no: number } => prevWeek(now);

/** ArcGIS SQL-ийн огноо — сервер UTC-ээр хадгалдаг; `prevWeek`-ийн хил аль хэдийн ЖИНХЭНЭ агшин */
const sqlTs = (d: Date) => `timestamp '${d.toISOString().slice(0, 19).replace('T', ' ')}'`;

const countOf = async (url: string, where: string, auth: Record<string, string> = {}): Promise<number | null> => {
  const j = await arcgisPost<{ count?: number }>(`${url}/query`, {
    f: 'json', where, returnCountOnly: 'true', ...auth,
  }, { token: 'org' });
  return typeof j.count === 'number' && Number.isFinite(j.count) ? j.count : null;
};

/**
 * ISO долоо хоногийн ОН — долоо хоногийн Пүрэв гараг (UB) аль онд байна (Даваа эхлэл + 3 хоног).
 */
export const isoWeekYear = (start: Date): number => new Date(start.getTime() + 3 * 86_400_000 + 8 * 3_600_000).getUTCFullYear();

/**
 * «Сайжруулалт» (огноогүй хүснэгт) — тухайн долоо хоногийн `тоо`-ны НИЙЛБЭР (2026-10-19 засвар).
 *  · Урьд нь `week = N` ОНГҮЙ тул ӨМНӨХ оны ижил дугаартай мөр нийлбэрт холилдож болдог байв;
 *  · мөр алга бол 0 буцаадаг байв («0 сайжруулалт» ≠ «бүртгэл ирээгүй») → одоо `null` («—»).
 * Он: хүснэгтэд `year` талбар (`it.year`) тохируулсан бол `AND year = Y`. Амьд схем (2026-10-19:
 * objectid · week · тоо · globalid) ОН талбаргүй.
 */
async function improvementSum(
  it: { key: string; label: string; table: number | null; week?: string; sum?: string; year?: string },
  w: { start: Date; no: number },
): Promise<RegisterRow> {
  const url = `${HABEA.registers.url}/${it.table}/query`;
  const base = { key: it.key, label: it.label };
  const where = it.year ? `${it.week} = ${w.no} AND ${it.year} = ${isoWeekYear(w.start)}` : `${it.week} = ${w.no}`;
  const [j, wk] = await Promise.all([
    arcgisPost<{ features?: { attributes?: { s?: number | null; n?: number | null } }[] }>(url, {
      f: 'json', where,
      outStatistics: JSON.stringify([
        { statisticType: 'sum', onStatisticField: it.sum, outStatisticFieldName: 's' },
        { statisticType: 'count', onStatisticField: it.sum, outStatisticFieldName: 'n' },
      ]),
    }),
    /* Он талбаргүй үед л — хүснэгтийн долоо хоногийн дээд дугаар (олон оны өгөгдөл илрүүлэх) */
    it.year ? Promise.resolve(null) : arcgisPost<{ features?: { attributes?: { m?: number | null } }[] }>(url, {
      f: 'json', where: '1=1',
      outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: it.week, outStatisticFieldName: 'm' }]),
    }).catch(() => null),
  ]);
  if (!Array.isArray(j.features)) return { ...base, week: null };
  const a = j.features[0]?.attributes ?? {};
  const v = numOrNull(a.s);
  const n = numOrNull(a.n);
  if (!n || v == null) return { ...base, week: null, hint: tr('Энэ долоо хоногт бүртгэл ирээгүй') };
  if (it.year) return { ...base, week: v };
  const maxWk = numOrNull(wk?.features?.[0]?.attributes?.m);
  return {
    ...base,
    week: v,
    hint: maxWk != null && isMultiYear([maxWk], w.no)
      ? tr('Оны ялгаагүй — хүснэгтэд он талбар алга; өөр оны ижил долоо хоногийн мөр нийлбэрт орсон байж болзошгүй')
      : tr('Оны ялгаагүй — хүснэгтэд он талбар алга (долоо хоногийн дугаараар)'),
  };
}

async function fetchRegisters(w: { start: Date; end: Date; no: number }): Promise<RegisterData> {
  const rows = await Promise.all(HABEA.registers.items.map(async (it): Promise<RegisterRow> => {
    if (it.table != null && it.week && it.sum) return improvementSum(it, w);
    if (it.table == null || !it.date) return { key: it.key, label: it.label, week: null };
    const week = await countOf(
      `${HABEA.registers.url}/${it.table}`,
      `${it.date} >= ${sqlTs(w.start)} AND ${it.date} < ${sqlTs(w.end)}`,
    );
    return { key: it.key, label: it.label, week };
  }));
  return { rows, weekNo: w.no, start: w.start, end: w.end };
}

let regCache: { k: number; load: () => Promise<RegisterData> } | null = null;

/* ХАБЭА-ийн кэшийн TTL ба ХУУДАСНЫ POLL (2026-10-21, кэшийн аудит) — POLL нь TTL-ээс ЗААВАЛ УРТ (тайлбар `habeaTiming.ts`-д). */
export { HABEA_TTL_MS, HABEA_POLL_MS };

/** Карт ачаалагч. Дуудагч `now`-оо өгнө (render-ийн `Date.now` биш — react-hooks/purity). */
export function loadHabeaRegisters(now = new Date()): Promise<RegisterData> {
  const w = prevWeek(now);
  const k = w.start.getTime();
  if (!regCache || regCache.k !== k) regCache = { k, load: cached(() => fetchRegisters(w), HABEA_TTL_MS, ['HABEA']) };
  return regCache.load();
}

/* ═════════════════ ХУУДАСЛАЛТ ═════════════════ */

/** Нэг хуудасны мөр — `maxRecordCount` (2000)-оос хэтрэхгүй */
const PAGE = 2000;
/** Хамгаалалт — эвдэрсэн `exceededTransferLimit` мөнхийн давталт үүсгэхгүй */
const MAX_PAGES = 100;

/**
 * БҮХ мөр — `orderByFields` (OID) + `resultOffset` хуудаслалт.
 */
async function queryAll(url: string, where: string, oidField: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let page = 0, off = 0; page < MAX_PAGES; page += 1) {
    const j = await arcgisPost<{ features?: { attributes?: Record<string, unknown> }[]; exceededTransferLimit?: boolean }>(
      `${url}/query`,
      {
        f: 'json', where, outFields: '*', returnGeometry: 'false',
        orderByFields: oidField, resultOffset: String(off), resultRecordCount: String(PAGE),
      },
    );
    const fs = j.features ?? [];
    for (const ft of fs) out.push(ft.attributes ?? {});
    if (!j.exceededTransferLimit || fs.length === 0) break;
    off += fs.length;
  }
  return out;
}

/* ═════════════════ ХОГ ХАЯГДАЛ (2026-10-08) ═════════════════ */

/** Тоон нүд — хоосон (`null`/'') бол `null` (`Number(null) = 0` БИШ) */
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** ISO долоо хоногийн хүчинтэй дугаар */
export const isWeekNo = (n: number | null): n is number => n != null && Number.isInteger(n) && n >= 1 && n <= 53;

/**
 * Нэг мөр — хаягдлын төрөл, багц бүрийн рейс (бүх долоо хоногийн НИЙЛБЭР).
 */
export type WasteRow = { metric: string; byPkg: Record<string, number> };
export const MULTI_YEAR_GAP = 8;
export const isMultiYear = (weeks: readonly number[], weekNo: number): boolean =>
  weeks.some((n) => n - weekNo >= MULTI_YEAR_GAP);

export type WasteData = { rows: WasteRow[]; weeks: number[]; weekNo: number; multiYear: boolean };

type WasteRaw = { wk: number | null; metric: string; cols: Record<string, number | null> };

async function fetchWaste(): Promise<WasteRaw[]> {
  const W = HABEA.waste;
  const list = await queryAll(W.url, '1=1', W.fields.oid);
  return list.map((a) => ({
    wk: numOrNull(a[W.fields.week]),
    metric: String(a[W.fields.metric] ?? ''),
    cols: Object.fromEntries(W.pkgCols.map(([col]) => [col, numOrNull(a[col])])),
  }));
}

const cachedWaste = cached(fetchWaste, 5 * 60_000, ['HABEA']);
/** Хог хаягдлын карт ачаалагч. Дуудагч `now`-оо өгнө (render-ийн `Date.now` биш). */
export async function loadHabeaWaste(now = new Date()): Promise<WasteData> {
  const W = HABEA.waste;
  const weekNo = prevWeek(now).no;
  const list = await cachedWaste();
  const by = new Map<string, Record<string, number>>();
  const weeks = new Set<number>();
  for (const r of list) {
    if (isWeekNo(r.wk)) weeks.add(r.wk);
    if (r.wk !== weekNo) continue;
    const cur = by.get(r.metric) ?? {};
    for (const [col, name] of W.pkgCols) {
      const v = r.cols[col];
      if (v != null) cur[name] = (cur[name] ?? 0) + v;
    }
    by.set(r.metric, cur);
  }
  const wk = [...weeks].sort((x, y) => x - y);
  return {
    rows: [...by.entries()].map(([metric, byPkg]) => ({ metric, byPkg })), weeks: wk, weekNo,
    multiYear: isMultiYear(wk, weekNo),
  };
}

/* ═════════════════ БИЧИЛТ — «habeaData» эрхтэй хэрэглэгч (2026-10-08) ═════════════════ */

export class HabeaEntSignInRequired extends Error {
  constructor() {
    super(tr('ХАБЭА-гийн бүртгэл Enterprise геопорталд хадгалагддаг — хадгалахын өмнө Enterprise-д нэвтэрнэ үү.'));
    this.name = 'HabeaEntSignInRequired';
  }
}

/** Enterprise токены эх — тестэд солих боломжтой (`setEntTokenSource`) */
let entTokenSource: () => string | null = () => entSession()?.token ?? null;
export function setEntTokenSource(fn: () => string | null): void { entTokenSource = fn; }

/** Enterprise геопорталын хаяг (`NEXT_PUBLIC_ENT_PORTAL_URL`) — тестэд солих боломжтой (`setEntPortal`) */
let entPortal = ENT_PORTAL;
export function setEntPortal(url: string): void { entPortal = url; }
/** Enterprise нэвтрэлт тохируулагдсан эсэх — хоосон бол бичилт урьдын адил НЭРГҮЙ (`entAuth`) */
export const habeaEntConfigured = (): boolean => !!entPortal;

let warnedAnon = false;
/**
 * Бичилтийн токен (POST биеэр, `token: 'org'` горим — дуудагчийн `token` хэвээр) — сешнгүй бол ШИДНЭ.
 */
function entAuth(): Record<string, string> {
  if (!entPortal) {
    if (!warnedAnon) {
      warnedAnon = true;
      console.warn('[habea] NEXT_PUBLIC_ENT_PORTAL_URL тохируулаагүй — ХАБЭА-гийн бичилт Enterprise токенгүй (нэргүй) явна.');
    }
    return {};
  }
  const t = entTokenSource();
  if (!t) throw new HabeaEntSignInRequired();
  return { token: t };
}

/** Хариу алдагдсан ба шалгахад мөр олдоогүй — үр дүн ТОДОРХОЙГҮЙ (дахин дарахад эхлээд шалгана) */
export class HabeaLostWrite extends Error {
  constructor(readonly lost: unknown, readonly before?: number, readonly sig?: string) {
    super(tr('Серверийн хариу алдагдсан — мөр бичигдсэн эсэх тодорхойгүй. Дахин «Хадгалах» дарвал эхлээд шалгаж, давхардуулахгүй.'));
    this.name = 'HabeaLostWrite';
  }
}

type ApplyRes = { success?: boolean; objectId?: number; globalId?: string; error?: { description?: string } };

/** `applyEdits`-ийн НЭГ нэмэлтийн үр дүн — хоосон/дутуу хариу амжилт БИШ (`tableWrite.check`-ийн дүрэм) */
const oneAdd = (j: { addResults?: ApplyRes[] }): ApplyRes => {
  const r = j.addResults ?? [];
  if (r.length !== 1) throw new Error(tr('сервер {0}/{1} мөрийн хариу буцаав — бичигдээгүй гэж үзнэ', r.length, 1));
  return r[0];
};

/** Клиентийн GlobalID — `{XXXXXXXX-XXXX-4XXX-YXXX-XXXXXXXXXXXX}` (ArcGIS-ийн хэв) */
export function newGlobalId(): string {
  const c = globalThis.crypto;
  let u: string;
  if (c?.randomUUID) u = c.randomUUID();
  else {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    u = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return `{${u.toUpperCase()}}`;
}

/** Тухайн GlobalID-тай мөр сервер дээр байгаа юу — асуулга унавал ШИДНЭ (тодорхойгүй) */
async function gidExists(url: string, gidField: string, gid: string): Promise<boolean> {
  const n = await countOf(url, `${gidField} = '${gid.replace(/'/g, "''")}'`, entAuth());
  if (n == null) throw new Error(tr('Үйлчилгээ хариу буцаасангүй.'));
  return n > 0;
}

/**
 * Хүснэгтийн бичих талбар — маягт угсрахад.
 */
export type EntryField = {
  name: string; alias: string; type: 'date' | 'number' | 'text' | 'long';
  options?: { code: string; name: string }[];
};

const SYS_FIELD = /^(objectid|fid|globalid|creationdate|creator|editdate|editor|created_user|created_date|last_edited_user|last_edited_date)$/i;
/** Урт текстийн талбар — `textarea` */
const LONG_RE = /агуулга|тайлбар/i;

/**
 * Талбарын ДЭЛГЭЦИЙН нэр — метадатын alias нь орчуулагдахгүй тул НЭРЭЭР нь `tr`.
 */
const FIELD_LABEL: Record<string, () => string> = {
  f_: () => tr('№'),
  'д_д': () => tr('д/д'),
  'Огноо': () => tr('Огноо'),
  'Баримтын_дугаар': () => tr('Баримтын дугаар'),
  'Талбайн_зааварчилгаа_өгсөн_багц': () => tr('Талбайн зааварчилгаа өгсөн багц'),
  'Товч_агуулга': () => tr('Товч агуулга'),
  'Дуусах_хугацаа': () => tr('Дуусах хугацаа'),
  duusah_hugatsaa: () => tr('Дуусах хугацаа'),
  'Талбайн_зааварчилгаа_өгсөн': () => tr('Талбайн зааварчилгаа өгсөн'),
  'Компаний_нэр': () => tr('Компаний нэр'),
  'Байршил': () => tr('Байршил'),
  'Зөрчлийн_төрөл': () => tr('Зөрчлийн төрөл'),
  'Агуулга': () => tr('Агуулга'),
  'Зөрчилд_ноогдуулсан_мөнгөн_дүн': () => tr('Зөрчилд ноогдуулсан мөнгөн дүн'),
  'Мэдэгдэх_хуудас__pdf_file_': () => tr('Мэдэгдэх хуудас'),
  'Баримтын_он__сар__өдөр': () => tr('Баримтын он, сар, өдөр'),
  'Баримтын_бүртгэлийн_дугаар': () => tr('Баримтын бүртгэлийн дугаар'),
  'Багцын_нэр': () => tr('Багцын нэр'),
  'Сануулах_хуудас_бичсэн': () => tr('Сануулах хуудас бичсэн'),
  'Нэмэлт_тайлбар': () => tr('Нэмэлт тайлбар'),
};
const LABEL_LC = new Map(Object.entries(FIELD_LABEL).map(([k, v]) => [k.toLowerCase(), v]));
export const entryFieldLabel = (f: EntryField): string => LABEL_LC.get(f.name.toLowerCase())?.() ?? f.alias;

/** Бүртгэлийн хүснэгтийн талбарууд (Enterprise 37 · 40 · 42 — 2026-10-19: урьд «35 · 38 · 36» AGOL) — метадатаас, дарааллаар */
export async function loadEntryFields(table: number): Promise<EntryField[]> {
  const j = await arcgisPost<{ fields?: {
    name?: string; alias?: string; type?: string; editable?: boolean;
    domain?: { codedValues?: { code?: unknown; name?: unknown }[] } | null;
  }[] }>(`${HABEA.registers.url}/${table}`, { f: 'json' });
  return (j.fields ?? [])
    .filter((f) => f.name && !SYS_FIELD.test(f.name) && f.editable !== false && !/OID|GlobalID/.test(f.type ?? ''))
    .map((f) => {
      const t = String(f.type ?? '');
      const type: EntryField['type'] = /Date/.test(t) ? 'date'
        : /Double|Integer|Single/.test(t) ? 'number'
          : LONG_RE.test(String(f.alias ?? f.name)) ? 'long' : 'text';
      const cv = f.domain?.codedValues;
      const options = cv?.length ? cv.map((c) => ({ code: String(c.code), name: String(c.name ?? c.code) })) : undefined;
      return { name: String(f.name), alias: String(f.alias || f.name), type, ...(options ? { options } : {}) };
    });
}

/**
 * Дугаарын (№ · д/д) дараагийн утга — хамгийн их + 1 (хүснэгт хоосон бол 1).
 */
export async function nextNumber(table: number, field: string): Promise<number> {
  const t = entTokenSource();
  const j = await arcgisPost<{ features?: { attributes?: { m?: number | null } }[] }>(
    `${HABEA.registers.url}/${table}/query`,
    { f: 'json', where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: field, outStatisticFieldName: 'm' }]), ...(t ? { token: t } : {}) },
    { token: 'org' },
  );
  const m = numOrNull(j.features?.[0]?.attributes?.m);
  return m != null ? m + 1 : 1;
}

/**
 * ДУГААРЫН (№ · д/д) ДАВХАРДЛЫГ БИЧСЭНИЙ ДАРАА ЗАСНА — `hyanalt.ensureUniqueId`-ийн загвар.
 */
async function ensureUniqueSeq(
  table: number, field: string, oid: number, n: number, auth: Record<string, string>,
  gid?: string,
): Promise<void> {
  const url = `${HABEA.registers.url}/${table}`;
  let cur = n;
  try {
    let id = Number.isInteger(oid) && oid > 0 ? oid : 0;
    if (!id && gid) {
      const j = await arcgisPost<{ objectIds?: number[] | null }>(`${url}/query`, {
        f: 'json', where: `${HABEA.registers.gidField} = '${gid.replace(/'/g, "''")}'`, returnIdsOnly: 'true', ...auth,
      }, { token: 'org' });
      id = Number(j.objectIds?.[0]) || 0;
    }
    if (!id) return;
    for (let i = 0; i < 3; i += 1) {
      const below = await countOf(url, `${field} = ${cur} AND objectid < ${id}`, auth);
      if (below == null) throw new Error(tr('Үйлчилгээ хариу буцаасангүй.'));
      if (below === 0) return;
      const next = await nextNumber(table, field);
      const j = await arcgisPost<{ updateResults?: ApplyRes[] }>(`${url}/applyEdits`, {
        f: 'json',
        updates: JSON.stringify([{ attributes: { objectid: id, [field]: next } }]),
        rollbackOnFailure: 'true',
        ...auth,
      }, { token: 'org' });
      const r = j.updateResults ?? [];
      if (r.length !== 1 || r[0].success !== true) throw new Error(r[0]?.error?.description || tr('Хадгалах амжилтгүй боллоо.'));
      cur = next;
    }
  } catch (e) {
    console.warn('[habea] бүртгэлийн дугаарын давхардлын шалгалт унав:', e);
  }
}

/**
 * Бүртгэлийн мөр нэмэх — клиентийн GlobalID-тай (`useGlobalIds`).
 */
/** Бүртгэлийн утгын гарын үсэг — дахин илгээлт ижил утгатай эсэхийг тулгахад (`addWaste`-ийн `sig`) */
export const registerSig = (attrs: Record<string, unknown>): string =>
  JSON.stringify(Object.keys(attrs).sort().map((k) => [k, attrs[k]]));

export async function addRegister(
  table: number, attrs: Record<string, unknown>, gid: string, opts: { autoSeq?: string; retry?: boolean } = {},
): Promise<void> {
  requireCap('habeaData');
  const auth = entAuth();
  const R = HABEA.registers;
  const url = `${R.url}/${table}`;
  try {
    if (opts.retry && await gidExists(url, R.gidField, gid)) return;
    const a = { ...attrs };
    if (opts.autoSeq) a[opts.autoSeq] = await nextNumber(table, opts.autoSeq);
    let res: ApplyRes;
    try {
      res = oneAdd(await arcgisPost<{ addResults?: ApplyRes[] }>(`${url}/applyEdits`, {
        f: 'json',
        adds: JSON.stringify([{ attributes: { ...a, [R.gidField]: gid } }]),
        useGlobalIds: 'true',
        rollbackOnFailure: 'true',
        ...auth,
      }, { token: 'org' }));
    } catch (e) {
      if (!isLostWrite(e)) throw e;
      /* Хариу алдагдсан — ЗӨВХӨН уншина. Шалгалт өөрөө унавал «тодорхойгүй». */
      const found = await gidExists(url, R.gidField, gid).catch(() => null);
      if (found) return;
      throw new HabeaLostWrite(e, undefined, registerSig(attrs));
    }
    if (res.success !== true) {
      /* Давхар GlobalID (хоцорч суусан анхны бичилт) — мөр аль хэдийн байвал амжилт */
      if (await gidExists(url, R.gidField, gid).catch(() => false)) return;
      throw new Error(res.error?.description || tr('Хадгалах амжилтгүй боллоо.'));
    }
    if (opts.autoSeq && typeof a[opts.autoSeq] === 'number') {
      await ensureUniqueSeq(table, opts.autoSeq, Number(res.objectId), a[opts.autoSeq] as number, auth, gid);
    }
  } finally {
    invalidate('HABEA');
  }
}

type WasteMeta = {
  capabilities?: string;
  fields?: { name?: string; domain?: { codedValues?: { code?: unknown; name?: unknown }[] } | null }[];
};
const wasteMeta = () => arcgisPost<WasteMeta>(HABEA.waste.url, { f: 'json' });

/** «Хог хаягдал»-ын маягтын төрлүүд — домэйны код ба нэр (метадатаас), домэйны дарааллаар */
export async function loadWasteMetrics(): Promise<{ code: string; name: string }[]> {
  const W = HABEA.waste;
  const meta = await wasteMeta();
  const dom = meta.fields?.find((f) => f.name === W.fields.metric)?.domain?.codedValues ?? [];
  return dom.map((c) => ({ code: String(c.code), name: String(c.name ?? c.code) }));
}

export const parseCanCreate = (capabilities: unknown): boolean | null =>
  typeof capabilities === 'string' ? /(^|,)\s*create\s*(,|$)/i.test(capabilities) : null;
export const loadWasteCanCreate = cached(
  () => wasteMeta().then((m) => parseCanCreate(m.capabilities), () => null),
  5 * 60_000, ['HABEA'], (v) => v != null,
);

export const isOrgAdminRole = (role: unknown): boolean => String(role ?? '').trim().toLowerCase() === 'org_admin';
const orgAdminByUser = new Map<string, Promise<boolean>>();
export function loadIsOrgAdmin(): Promise<boolean> {
  if (typeof window === 'undefined' || !AUTH.appId) return Promise.resolve(false);
  const u = (currentUser() ?? '').trim().toLowerCase();
  if (!u) return Promise.resolve(false);
  let p = orgAdminByUser.get(u);
  if (!p) {
    p = arcgisPost<{ username?: string; role?: string }>(
      `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest/community/self`, { f: 'json' },
    ).then((j) => String(j?.username ?? '').trim().toLowerCase() === u && isOrgAdminRole(j?.role));
    p.catch(() => orgAdminByUser.delete(u));
    orgAdminByUser.set(u, p);
  }
  return p.catch(() => false);
}

/** Хог хаягдлын мөрийн ЯГ утгын WHERE — хариу алдагдсан бичилтийг тоолж шалгахад */
const wasteWhere = (week: number, metric: string, cols: Record<string, number | null>): string => {
  const W = HABEA.waste;
  const parts = [`${W.fields.week} = ${week}`, `${W.fields.metric} = N'${metric.replace(/'/g, "''")}'`];
  for (const [c] of W.pkgCols) parts.push(cols[c] == null ? `${c} IS NULL` : `${c} = ${Number(cols[c])}`);
  return parts.join(' AND ');
};

/**
 * Хог хаягдлын ШИНЭ мөр (2026-10-08 хэрэглэгчийн шийдвэр: байгаа мөрийг дарж бичихгүй).
 */
export async function addWaste(
  week: number, metric: string, cols: Record<string, number | null>,
  prior?: { before: number; sig: string } | null,
): Promise<void> {
  requireCap('habeaData');
  const W = HABEA.waste;
  if (!isWeekNo(week)) throw new Error(tr('Долоо хоног 1–53 байна.'));
  const auth = entAuth();
  const where = wasteWhere(week, metric, cols);
  try {
    let before: number | null;
    if (prior && prior.sig === where) {
      const now = await countOf(W.url, where, auth);
      if (now != null && now > prior.before) return;
      before = prior.before;
    } else {
      before = await countOf(W.url, where, auth);
    }
    let res: ApplyRes;
    try {
      res = oneAdd(await arcgisPost<{ addResults?: ApplyRes[] }>(`${W.url}/applyEdits`, {
        f: 'json',
        adds: JSON.stringify([{ attributes: { [W.fields.week]: week, [W.fields.category]: 'Waste', [W.fields.metric]: metric, ...cols } }]),
        rollbackOnFailure: 'true',
        ...auth,
      }, { token: 'org' }));
    } catch (e) {
      if (!isLostWrite(e)) throw e;
      const after = await countOf(W.url, where, auth).catch(() => null);
      if (before != null && after != null && after > before) return;
      throw new HabeaLostWrite(e, before ?? undefined, where);
    }
    if (res.success !== true) throw new Error(res.error?.description || tr('Хадгалах амжилтгүй боллоо.'));
  } finally {
    invalidate('HABEA');
  }
}
