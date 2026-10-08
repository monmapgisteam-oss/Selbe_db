/**
 * ХАБ-ЫН БҮРТГЭЛҮҮД — «Бусад үзүүлэлт» карт (2026-10-08, хэрэглэгчийн хүсэлт).
 *
 * Эх сурвалж: `Сэлбэ_ХАБ1007` FeatureServer (нийтэд нээлттэй, ГУРВАН хүснэгт):
 *   · 35 — Талбайн зааварчилгааны бүртгэл  (огноо: `Огноо`)
 *   · 38 — Сануулах хуудас өгсөн бүртгэл    (огноо: `Баримтын_он__сар__өдөр`)
 *   · 36 — Хариуцлага тооцох мэдэгдэх       (огноо: `Огноо`)
 * «Аюулыг мэдээлэх хуудас», «Сайжруулалт» — эх хүснэгт ОДООГООР БАЙХГҮЙ: «—»
 * (`null ≠ 0` — тэг гэж харуулбал «бүртгэл алга» гэж ХУДАЛ уншигдана).
 *
 * ⚠️ «7 ХОНОГ» = ӨМНӨХ БҮТЭН долоо хоног (Даваа 00:00 → дараагийн Даваа 00:00) — хэрэглэгч:
 *    «сүүлийн долоо хоногийн нийт тоо, Даваа гараг шинэчлэгддэг».
 * ⚠️ 2026-10-09: хил нь УЛААНБААТАРЫН цагаар — `habeaUzleg.prevWeek`-ийг ШУУД дахин ашиглана.
 *    Урьд нь энд хөтчийн ЛОКАЛ цагаар (`getDay`/`setDate`) тусдаа хуулбар байсан тул гадаадаас
 *    (эсвэл UTC-тэй машинаас) нээхэд долоо хоногийн хил үзлэгийн KPI-аас 8 цагаар зөрдөг байв.
 * ⚠️ Тоо нь серверийн `returnCountOnly` — мөр татахгүй.
 * ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг — `arcgisPost` биеийг шалгаж шиднэ.
 */
import { t as tr } from '@/lib/i18nCore';
import { arcgisPost } from '@/lib/query';
import { cached } from '@/lib/live';
import { HABEA } from '@/lib/services';
import { requireCap } from '@/lib/who';
import { invalidate } from '@/lib/dataBus';
import { isLostWrite } from '@/lib/lostWrite';
import { prevWeek } from '@/modules/habeaUzleg';

export type RegisterRow = {
  key: string;
  label: string;
  /** Өмнөх бүтэн долоо хоногийн тоо — эх сурвалжгүй / тоо ирээгүй бол `null` */
  week: number | null;
};

export type RegisterData = { rows: RegisterRow[]; weekNo: number; start: Date; end: Date };

/**
 * Өмнөх бүтэн долоо хоног — Даваа 00:00 (УЛААНБААТАР) хилтэй.
 * ⚠️ 2026-10-09: `habeaUzleg.prevWeek`-ийн ХУУЛБАР БИШ, өөрөө — хоёр дүрэм дахин зөрөхгүй.
 */
export const lastFullWeek = (now = new Date()): { start: Date; end: Date; no: number } => prevWeek(now);

/** ArcGIS SQL-ийн огноо — сервер UTC-ээр хадгалдаг; `prevWeek`-ийн хил аль хэдийн ЖИНХЭНЭ агшин */
const sqlTs = (d: Date) => `timestamp '${d.toISOString().slice(0, 19).replace('T', ' ')}'`;

/**
 * ⚠️ 2026-10-09: `count` ирээгүй бол `null` (урьд нь 0 — «бүртгэл алга» гэж ХУДАЛ уншигдана).
 */
const countOf = async (url: string, where: string): Promise<number | null> => {
  const j = await arcgisPost<{ count?: number }>(`${url}/query`, {
    f: 'json', where, returnCountOnly: 'true',
  });
  return typeof j.count === 'number' && Number.isFinite(j.count) ? j.count : null;
};

async function fetchRegisters(w: { start: Date; end: Date; no: number }): Promise<RegisterData> {
  const rows = await Promise.all(HABEA.registers.items.map(async (it): Promise<RegisterRow> => {
    /* ⚠️ 2026-10-08: «Нийт» багана ХАСАГДАВ (хэрэглэгч: «зөвхөн сүүлийн долоо хоногийн мэдээ») */
    if (it.table == null || !it.date) return { key: it.key, label: it.label, week: null };
    const week = await countOf(
      `${HABEA.registers.url}/${it.table}`,
      `${it.date} >= ${sqlTs(w.start)} AND ${it.date} < ${sqlTs(w.end)}`,
    );
    return { key: it.key, label: it.label, week };
  }));
  return { rows, weekNo: w.no, start: w.start, end: w.end };
}

/*
 * ⚠️ 5 минутын кэш (`HABEA` таг) — ХАБЭА-гийн бусад эх сурвалжтай ижил хэмнэл.
 * ⚠️ 2026-10-09: кэшийн ТҮЛХҮҮР нь долоо хоногийн эхлэл (UB). Урьд нь ганц кэш байсан тул
 *    Даваа гараг дамжихад `weekKey` солигдож дахин дуудсан ч TTL (5 мин) дотор ӨМНӨХ долоо
 *    хоногийн тоо буцдаг байв. Зөвхөн сүүлийн долоо хоногийнхыг барина.
 */
let regCache: { k: number; load: () => Promise<RegisterData> } | null = null;

/** Карт ачаалагч. ⚠️ Дуудагч `now`-оо өгнө (render-ийн `Date.now()` биш — react-hooks/purity). */
export function loadHabeaRegisters(now = new Date()): Promise<RegisterData> {
  const w = prevWeek(now);
  const k = w.start.getTime();
  if (!regCache || regCache.k !== k) regCache = { k, load: cached(() => fetchRegisters(w), 5 * 60_000, ['HABEA']) };
  return regCache.load();
}

/* ═════════════════ ХУУДАСЛАЛТ ═════════════════ */

/** Нэг хуудасны мөр — `maxRecordCount` (2000)-оос хэтрэхгүй */
const PAGE = 2000;
/** Хамгаалалт — эвдэрсэн `exceededTransferLimit` мөнхийн давталт үүсгэхгүй */
const MAX_PAGES = 100;

/**
 * БҮХ мөр — `orderByFields` (OID) + `resultOffset` хуудаслалт.
 * ⚠️ 2026-10-09: урьд нь нэг л асуулга (≤2000 мөр) байсан; дараалалгүй offset нь давхардсан/
 *    алдагдсан мөр өгдөг (CLAUDE.md «ArcGIS REST-ийн занга»).
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
 * ⚠️ 2026-10-09: хэмжилттэй нүдгүй багц `byPkg`-д ОРОХГҮЙ (урьд нь `Number(null)` → 0 нэмэгдэж
 *    «0 рейс» гэж ХУДАЛ уншигддаг байв) — `null ≠ 0`.
 */
export type WasteRow = { metric: string; byPkg: Record<string, number> };
/**
 * ⚠️ 2026-10-09: хүснэгтэд ОН/ОГНОО талбар БАЙХГҮЙ (амьд метадата: Week · Category · Metric ·
 *    Багц_* · FID; CreationDate/editFieldsInfo ч алга) — карт бүх мөрийг нийлүүлж, ХАМРАХ
 *    долоо хоногуудыг (`weeks`) ил шошголно. Он ялгах талбар нэмэх нь схемийн өөрчлөлт.
 */
export type WasteData = { rows: WasteRow[]; weeks: number[] };

async function fetchWaste(): Promise<WasteData> {
  const W = HABEA.waste;
  const list = await queryAll(W.url, '1=1', W.fields.oid);
  const by = new Map<string, Record<string, number>>();
  const weeks = new Set<number>();
  for (const a of list) {
    const m = String(a[W.fields.metric] ?? '');
    /* ⚠️ 2026-10-09: хоосон Week → `null` (урьд нь `Number(null)` = 0 → «0-р долоо хоног») */
    const wk = numOrNull(a[W.fields.week]);
    if (isWeekNo(wk)) weeks.add(wk);
    const cur = by.get(m) ?? {};
    for (const [col, name] of W.pkgCols) {
      const v = numOrNull(a[col]);
      if (v != null) cur[name] = (cur[name] ?? 0) + v;
    }
    by.set(m, cur);
  }
  return { rows: [...by.entries()].map(([metric, byPkg]) => ({ metric, byPkg })), weeks: [...weeks].sort((x, y) => x - y) };
}

const cachedWaste = cached(fetchWaste, 5 * 60_000, ['HABEA']);
/** Хог хаягдлын карт ачаалагч */
export const loadHabeaWaste = (): Promise<WasteData> => cachedWaste();

/* ═════════════════ БИЧИЛТ — «habeaData» эрхтэй хэрэглэгч (2026-10-08) ═════════════════ */
/*
 * ⚠️ БАТЛАГЧГҮЙ — шууд ArcGIS-д. ⚠️ `requireCap('habeaData')` — UI-ийн товч нуугдсан ч консолоос бичихийг хаана.
 * ⚠️ `invalidate('HABEA')` нь `finally`-д — хариу алдагдсан ч (мөр сууссан байж магадгүй) карт шинэчлэгдэнэ.
 * ⚠️ 2026-10-09: ХАРИУ АЛДАГДСАН (`isLostWrite`) бичилтийг ХЭЗЭЭ Ч сохроор дахин илгээхгүй —
 *    урьд нь хэрэглэгч «Хадгалах»-ыг дахин дарахад ДАВХАРДСАН мөр үүсдэг байв. Эхлээд серверээс
 *    асууна: бүртгэлд клиентийн GlobalID-аар, хог хаягдалд (GlobalID-гүй хүснэгт) ижил утгатай
 *    мөрийн тоогоор.
 */

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
  const n = await countOf(url, `${gidField} = '${gid.replace(/'/g, "''")}'`);
  if (n == null) throw new Error(tr('Үйлчилгээ хариу буцаасангүй.'));
  return n > 0;
}

/** Хүснэгтийн бичих талбар — маягт угсрахад */
export type EntryField = { name: string; alias: string; type: 'date' | 'number' | 'text' | 'long' };

const SYS_FIELD = /^(objectid|fid|globalid|creationdate|creator|editdate|editor)$/i;
/** Урт текстийн талбар — `textarea` */
const LONG_RE = /агуулга|тайлбар/i;

/**
 * Талбарын ДЭЛГЭЦИЙН нэр — метадатын alias нь орчуулагдахгүй тул НЭРЭЭР нь `tr()`.
 * ⚠️ 2026-10-09: талбарын нэрс амьд метадатаас (35 · 36 · 38). Шинэ талбар нэмэгдвэл alias-аараа
 *    (монголоор) гарна — энд мөр нэмнэ.
 */
const FIELD_LABEL: Record<string, () => string> = {
  F_: () => tr('№'),
  'д_д': () => tr('д/д'),
  'Огноо': () => tr('Огноо'),
  'Баримтын_дугаар': () => tr('Баримтын дугаар'),
  'Талбайн_зааварчилгаа_өгсөн_багц': () => tr('Талбайн зааварчилгаа өгсөн багц'),
  'Товч_агуулга': () => tr('Товч агуулга'),
  'Дуусах_хугацаа': () => tr('Дуусах хугацаа'),
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
export const entryFieldLabel = (f: EntryField): string => FIELD_LABEL[f.name]?.() ?? f.alias;

/** Бүртгэлийн хүснэгтийн талбарууд (35 · 38 · 36) — метадатаас, дарааллаар */
export async function loadEntryFields(table: number): Promise<EntryField[]> {
  const j = await arcgisPost<{ fields?: { name?: string; alias?: string; type?: string; editable?: boolean }[] }>(
    `${HABEA.registers.url}/${table}`, { f: 'json' },
  );
  return (j.fields ?? [])
    .filter((f) => f.name && !SYS_FIELD.test(f.name) && f.editable !== false && !/OID|GlobalID/.test(f.type ?? ''))
    .map((f) => {
      const t = String(f.type ?? '');
      const type: EntryField['type'] = /Date/.test(t) ? 'date'
        : /Double|Integer|Single/.test(t) ? 'number'
          : LONG_RE.test(String(f.alias ?? f.name)) ? 'long' : 'text';
      return { name: String(f.name), alias: String(f.alias || f.name), type };
    });
}

/** Дугаарын (№ · д/д) дараагийн утга — хамгийн их + 1 (хүснэгт хоосон бол 1) */
export async function nextNumber(table: number, field: string): Promise<number> {
  const j = await arcgisPost<{ features?: { attributes?: { m?: number | null } }[] }>(
    `${HABEA.registers.url}/${table}/query`,
    { f: 'json', where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: field, outStatisticFieldName: 'm' }]) },
  );
  const m = numOrNull(j.features?.[0]?.attributes?.m);
  return m != null ? m + 1 : 1;
}

/**
 * Бүртгэлийн мөр нэмэх — клиентийн GlobalID-тай (`useGlobalIds`).
 * ⚠️ 2026-10-09: `gid`-ийг дуудагч НЭГ маягтад тогтвортой барина — дахин «Хадгалах» дарахад ижил
 *    `gid`-ээр эхлээд серверээс асууна (байвал амжилт, ДАХИН ИЛГЭЭХГҮЙ). Хоцорч суусан анхны
 *    бичилт ба дахин илгээлт уралдвал давхар GlobalID-ийг сервер өөрөө татгалзана → дахин асууна.
 * ⚠️ `autoSeq` — санал болгосон дугаарыг (№ · д/д) хэрэглэгч өөрчлөөгүй бол бичихийн ЯГ ӨМНӨ
 *    дахин бодно (маягт нээлттэй байх хооронд өөр хүн нэмсэн бол давхардахгүй).
 */
export async function addRegister(
  table: number, attrs: Record<string, unknown>, gid: string, opts: { autoSeq?: string; retry?: boolean } = {},
): Promise<void> {
  requireCap('habeaData');
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
      }));
    } catch (e) {
      if (!isLostWrite(e)) throw e;
      /* Хариу алдагдсан — ЗӨВХӨН уншина. Шалгалт өөрөө унавал «тодорхойгүй». */
      const found = await gidExists(url, R.gidField, gid).catch(() => null);
      if (found) return;
      throw new HabeaLostWrite(e);
    }
    if (res.success === false) {
      /* Давхар GlobalID (хоцорч суусан анхны бичилт) — мөр аль хэдийн байвал амжилт */
      if (await gidExists(url, R.gidField, gid).catch(() => false)) return;
      throw new Error(res.error?.description || tr('Хадгалах амжилтгүй боллоо.'));
    }
  } finally {
    invalidate('HABEA');
  }
}

/** «Хог хаягдал»-ын маягтын төрлүүд — домэйны кодууд (метадатаас) */
export async function loadWasteMetrics(): Promise<string[]> {
  const W = HABEA.waste;
  const meta = await arcgisPost<{ fields?: { name?: string; domain?: { codedValues?: { code?: unknown }[] } | null }[] }>(
    W.url, { f: 'json' },
  );
  const dom = meta.fields?.find((f) => f.name === W.fields.metric)?.domain?.codedValues ?? [];
  return dom.map((c) => String(c.code));
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
 * ⚠️ 2026-10-09: хүснэгт GlobalID-ГҮЙ (амьд метадата: `globalIdField` хоосон,
 *    `supportsApplyEditsWithGlobalIds: false`) — хариу алдагдвал ИЖИЛ утгатай мөрийн тоог
 *    бичихээс ӨМНӨХТЭЙ харьцуулна. Олдохгүй бол `HabeaLostWrite` (`before`, `sig`) — дуудагч
 *    ИЖИЛ утгаар дахин дарвал `prior`-оор эхлээд дахин тоолно (өссөн бол амжилт, илгээхгүй).
 * ⚠️ Хоосон нүд → `null` (0 БИШ — `null ≠ 0`).
 */
export async function addWaste(
  week: number, metric: string, cols: Record<string, number | null>,
  prior?: { before: number; sig: string } | null,
): Promise<void> {
  requireCap('habeaData');
  const W = HABEA.waste;
  if (!isWeekNo(week)) throw new Error(tr('Долоо хоног 1–53 байна.'));
  const where = wasteWhere(week, metric, cols);
  try {
    let before: number | null;
    if (prior && prior.sig === where) {
      const now = await countOf(W.url, where);
      if (now != null && now > prior.before) return;
      before = prior.before;
    } else {
      before = await countOf(W.url, where);
    }
    let res: ApplyRes;
    try {
      res = oneAdd(await arcgisPost<{ addResults?: ApplyRes[] }>(`${W.url}/applyEdits`, {
        f: 'json',
        adds: JSON.stringify([{ attributes: { [W.fields.week]: week, Category: 'Waste', [W.fields.metric]: metric, ...cols } }]),
        rollbackOnFailure: 'true',
      }));
    } catch (e) {
      if (!isLostWrite(e)) throw e;
      const after = await countOf(W.url, where).catch(() => null);
      if (before != null && after != null && after > before) return;
      throw new HabeaLostWrite(e, before ?? undefined, where);
    }
    if (res.success === false) throw new Error(res.error?.description || tr('Хадгалах амжилтгүй боллоо.'));
  } finally {
    invalidate('HABEA');
  }
}
