/**
 * БӨГЛӨХ ХУУДАСНЫ ЖААЗНЫ ХӨТЧИЙН КЭШ (IndexedDB) — `loadRows(..., { persist: true })` (2026-10-22, гүйцэтгэлийн аудит).
 */
import { register, refreshEpoch } from './dataBus';

/** Хуудасны мөр (`ags.Feature`-тэй ижил хэлбэр — `ags`-ийг импортлохгүй, тойрог үүсгэхгүй) */
export type Feature = { attributes: Record<string, unknown> };

/** Шинэлэг байдлын тэмдэг — `probeStats`-ийн хариу */
export type Sig = {
  /** count(objectid) */
  n: number;
  /** min(objectid) */
  lo: number | null;
  /** max(objectid) */
  hi: number | null;
  /** max(last_edited_date) — `n > 0` бол заавал утгатай (`sigFrom`) */
  le: number | null;
  /** max(бөглөсөн огноо) — `latestWhere`-д дамжина; огноогүй хуудсанд `null` */
  mx: number | null;
};

/** Баганат кодлол — мөр бүрийн атрибутын ТҮЛХҮҮРИЙН ДАРААЛАЛ ч хадгалагдана */
export type Enc = { keys: string[]; cols: unknown[][]; n: number };

/** Хадгалах бичлэг */
export type FrameRec = { v: number; at: number; sig: Sig; where: string; enc: Enc };

/** Жааз — `loadRows`-ийн `where` ба серверийн мөрүүд */
export type Frame = { where: string; feats: Feature[] };

/** Хадгалах сан — хөтчид IndexedDB, тест/хэмжилтэд санах ой (`setFrameStore`) */
export type FrameStore = {
  get(key: string): Promise<FrameRec | null>;
  put(key: string, rec: FrameRec): Promise<void>;
  clear(): Promise<void>;
};

/**
 * Бичлэгийн хувилбар — өөрчилбөл хуучин бичлэг таарахгүй (дахин татна).
 */
export const FRAME_VER = 1;
/** Хамгийн их нас — тандалт таарсан ч үүнээс хуучин бол дахин татна (дээрх) */
export const MAX_AGE_MS = 24 * 3600_000;
/** Editor tracking-ийн огнооны талбар — Enterprise hosted давхаргын `editFieldsInfo.editDateField` (24/24) */
export const EDIT_DATE_FIELD = 'last_edited_date';

/* ══════════════════ Цэвэр функцүүд (`sheetCache.check`) ══════════════════ */

/** Тандалтын `outStatistics` — `oid`/`fill` нь бүдүүвчийн нэр (`sc.f.oid` · `sc.f.fillDate`) */
export const probeStats = (oid: string, fill: string | null): string => JSON.stringify([
  { statisticType: 'count', onStatisticField: oid, outStatisticFieldName: 'n' },
  { statisticType: 'min', onStatisticField: oid, outStatisticFieldName: 'lo' },
  { statisticType: 'max', onStatisticField: oid, outStatisticFieldName: 'hi' },
  { statisticType: 'max', onStatisticField: EDIT_DATE_FIELD, outStatisticFieldName: 'le' },
  ...(fill ? [{ statisticType: 'max', onStatisticField: fill, outStatisticFieldName: 'mx' }] : []),
]);

const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Тандалтын хариу → тэмдэг. Танихгүй/дутуу бол `null` (кэш ашиглахгүй).
 */
export function sigFrom(a: Record<string, unknown> | null | undefined, hasFill: boolean): Sig | null {
  if (!a) return null;
  const n = fin(a.n);
  if (n == null || n < 0) return null;
  const le = fin(a.le);
  if (n > 0 && le == null) return null;
  return { n, lo: fin(a.lo), hi: fin(a.hi), le, mx: hasFill ? fin(a.mx) : null };
}

export const sameSig = (a: Sig, b: Sig): boolean =>
  a.n === b.n && a.lo === b.lo && a.hi === b.hi && a.le === b.le && a.mx === b.mx;

/** Хадгалсан бичлэгийг ашиглаж болох уу — хувилбар · нас (ирээдүйн `at` ч үгүй) · тэмдэг */
export function frameHit(rec: FrameRec | null | undefined, sig: Sig, now: number): boolean {
  if (!rec || rec.v !== FRAME_VER || !rec.sig || typeof rec.where !== 'string') return false;
  const age = now - rec.at;
  return age >= 0 && age < MAX_AGE_MS && sameSig(rec.sig, sig);
}

/** Сангийн түлхүүр — давхаргын хаяг + ЯГ хүссэн баганууд (дараалалтай) */
export const frameKey = (url: string, fields: readonly string[]): string => `${url}|${fields.join(',')}`;

const SCALAR = (v: unknown): boolean => v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';

/**
 * Мөрүүд → багана. Мөр бүр ЗӨВХӨН `attributes`-тай, түлхүүр нь ижил ДАРААЛАЛТАЙ, утга нь JSON скаляр байх ёстой —
 * эс бөгөөс `null` (кэшлэхгүй): задлахад ЯГ ижил объект сэргээгдэх баталгаагүй.
 */
export function encodeFeats(feats: readonly Feature[]): Enc | null {
  const n = feats.length;
  const keys = n ? Object.keys(feats[0]?.attributes ?? {}) : [];
  const cols: unknown[][] = keys.map(() => new Array<unknown>(n));
  for (let i = 0; i < n; i += 1) {
    const f = feats[i] as Feature | undefined;
    if (!f || typeof f !== 'object' || Object.keys(f).length !== 1 || !f.attributes || typeof f.attributes !== 'object') return null;
    const ks = Object.keys(f.attributes);
    if (ks.length !== keys.length) return null;
    for (let j = 0; j < keys.length; j += 1) {
      if (ks[j] !== keys[j]) return null;
      const v = f.attributes[keys[j]];
      if (!SCALAR(v)) return null;
      cols[j][i] = v;
    }
  }
  return { keys, cols, n };
}

/** Багана → мөр (ШИНЭ объектууд — дуудагч бүр өөрийн хуулбартай). Эвдэрсэн бичлэг → `null` */
export function decodeFeats(e: Enc | null | undefined): Feature[] | null {
  if (!e || !Array.isArray(e.keys) || !Array.isArray(e.cols) || e.cols.length !== e.keys.length) return null;
  const n = e.n;
  if (!Number.isInteger(n) || n < 0 || e.cols.some((c) => !Array.isArray(c) || c.length !== n)) return null;
  const out = new Array<Feature>(n);
  for (let i = 0; i < n; i += 1) {
    const a: Record<string, unknown> = {};
    for (let j = 0; j < e.keys.length; j += 1) a[e.keys[j]] = e.cols[j][i];
    out[i] = { attributes: a };
  }
  return out;
}

/* ══════════════════ Сан ══════════════════ */

const DB_NAME = 'selbe-sheet-frames';
const DB_VER = 2;
const OS = 'frames';

/** IndexedDB сан — байхгүй бол `null`. Алдаа бүр чимээгүй `null`/no-op (кэшгүй зам) */
function idbStore(): FrameStore | null {
  let idb: IDBFactory | undefined;
  try { idb = globalThis.indexedDB; } catch { idb = undefined; }
  if (!idb) return null;
  const factory = idb;
  let dbP: Promise<IDBDatabase | null> | null = null;
  const open = (): Promise<IDBDatabase | null> => (dbP ??= new Promise<IDBDatabase | null>((resolve) => {
    let done = false;
    const end = (db: IDBDatabase | null) => { if (!done) { done = true; resolve(db); } };
    const timer = setTimeout(() => end(null), 3000);
    try {
      const rq = factory.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (db.objectStoreNames.contains(OS)) db.deleteObjectStore(OS);
        db.createObjectStore(OS).createIndex('at', 'at');
      };
      rq.onsuccess = () => {
        clearTimeout(timer);
        const db = rq.result;
        db.onversionchange = () => { db.close(); dbP = null; };
        end(db);
      };
      rq.onerror = () => { clearTimeout(timer); end(null); };
      rq.onblocked = () => { clearTimeout(timer); end(null); };
    } catch {
      clearTimeout(timer);
      end(null);
    }
  }));
  const run = <T>(mode: IDBTransactionMode, fn: (os: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> =>
    open().then((db) => new Promise<T | null>((resolve) => {
      if (!db) { resolve(null); return; }
      try {
        const tx = db.transaction(OS, mode);
        const r = fn(tx.objectStore(OS));
        tx.oncomplete = () => resolve(r ? (r.result ?? null) : null);
        tx.onabort = () => resolve(null);
        tx.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    }), () => null);
  let pruned = false;
  /** Хуучирсан (`MAX_AGE_MS`) бичлэгийг сешнд НЭГ удаа устгана — зөвхөн түлхүүрийн курсор (том утга уншихгүй) */
  const prune = () => run('readwrite', (os) => {
    const cur = os.index('at').openKeyCursor(IDBKeyRange.upperBound(Date.now() - MAX_AGE_MS));
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return;
      os.delete(c.primaryKey);
      c.continue();
    };
  });
  return {
    get: (key) => run<FrameRec>('readonly', (os) => os.get(key) as IDBRequest<FrameRec>),
    put: async (key, rec) => {
      const ok = await run('readwrite', (os) => os.put(rec, key));
      if (ok == null) { await run('readwrite', (os) => os.clear()); return; }
      if (!pruned) { pruned = true; await prune(); }
    },
    clear: async () => { await run('readwrite', (os) => os.clear()); },
  };
}

/** `undefined` = хараахан шийдээгүй (эхний дуудалтад IndexedDB-г шалгана) */
let store: FrameStore | null | undefined;
const frameStore = (): FrameStore | null => {
  if (store === undefined) store = idbStore();
  return store;
};

/** Тест/хэмжилтэд санг солино (`null` = кэшгүй) */
export function setFrameStore(s: FrameStore | null): void {
  store = s;
}

/**
 * Бичилтийн ҮЕ — аппын өөрийн бичилт бүрд өснө. Тандалтаас ӨМНӨ авсан үе өөрчлөгдсөн бол үр дүнг ХАДГАЛАХГҮЙ:
 * бичилтээс өмнө эхэлсэн уншилт цэвэрлэсэн санг хуучин өгөгдлөөр дахин дүүргэхгүй.
 */
let gen = 0;

register(() => {
  const r0 = refreshEpoch();
  queueMicrotask(() => {
    if (refreshEpoch() !== r0) return;
    gen += 1;
    void frameStore()?.clear().catch(() => {});
  });
}, ['BAGTS_SHEET']);

/** Тандалт нь энэ сешнд унасан давхаргууд — дахин оролдохгүй (кэшгүй хуучин зам, нэмэлт хүсэлтгүй) */
const probeBroken = new Set<string>();

/**
 * КЭШТЭЙ ЖААЗ — тандаад таарвал хадгалсныг, эс бөгөөс `load(sig)`-ийг (тандалтын `mx`-тэй) дуудаж хадгална.
 * @param probe нэг `outStatistics` хүсэлт → `sigFrom`; уналт/`null` бол кэшгүй `load(null)`
 * @param load серверээс жааз — `sig` өгвөл `sig.mx` нь `latestWhere`-ийн max-ыг орлоно
 */
export async function persistedFrame(
  url: string,
  fields: readonly string[] | undefined,
  probe: () => Promise<Sig | null>,
  load: (sig: Sig | null) => Promise<Frame>,
): Promise<Frame> {
  const st = frameStore();
  if (!st || !fields?.length || probeBroken.has(url)) return load(null);
  const g0 = gen;
  let sig: Sig | null = null;
  try {
    sig = await probe();
  } catch {
    sig = null;
  }
  if (!sig) {
    probeBroken.add(url);
    return load(null);
  }
  const key = frameKey(url, fields);
  const rec = await st.get(key).catch(() => null);
  if (gen === g0 && frameHit(rec, sig, Date.now())) {
    const feats = decodeFeats(rec!.enc);
    if (feats) return { where: rec!.where, feats };
  }
  const fr = await load(sig);
  const enc = gen === g0 ? encodeFeats(fr.feats) : null;
  if (enc && gen === g0) {
    void st.put(key, { v: FRAME_VER, at: Date.now(), sig, where: fr.where, enc }).catch(() => {});
  }
  return fr;
}
