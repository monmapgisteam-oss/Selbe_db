/**
 * «ХУВААРЬ»-ИЙН ХУВААЛЦСАН НООРОГ — цэвэр туслахууд (2026-09-23).
 *
 * ⚠️ ЯАГААД (хэрэглэгчийн шаардлага): хуваарийн ноорог (`draft` · `ham` ·
 * `aDraft` · `resDraft` · `obDraft`) зөвхөн React санах ойд байсан тул таб
 * хаах, өөр компьютерт орох, хамт ажиллагч нээхэд ЮУ Ч харагддаггүй байв.
 * «Гүйцэтгэл бөглөх»-ийн (`draftRemote.ts`) ХҮСНЭГТИЙГ ДАХИН АШИГЛАНА:
 * нэг (багц · төрөл) = нэг мөр, бүгд нэг нооргийг уншиж, нүд тус бүрээр
 * нийлүүлж, буцааж бичнэ.
 *
 * ⚠️ ТҮЛХҮҮР `plan:<төрөл>:<багц>` — `|` ОРОХГҮЙ. `draftRemote.readLegacyDrafts`
 *    нь `dkey LIKE '%|<багц>'`-ээр ХУУЧИН гүйцэтгэлийн мөрийг хайдаг; түлхүүрт
 *    `|` оруулбал (ж: `plan|b32|geree`) тэр хайлт `%|geree`-д... таарахгүй ч,
 *    `plan|geree|b32` хэлбэрт `%|b32` ТААРЧ, гүйцэтгэлийн шилжүүлэлт хуваарийн
 *    нооргийг гүйцэтгэлийн ноорог гэж уншаад УСТГАХ байв. `:`-ээр ямар ч
 *    багцын түлхүүрт таарах боломжгүй.
 *
 * ⚠️ ЗӨВХӨН ӨӨРЧЛӨГДСӨН нүд хадгалагдана — мөрийн бүтэн агшин БИШ. Нүд бүр
 *    `{val, at, user, bv}`: `at`/`user` нь «хэн хэзээ» (нийлүүлэхэд шинэ нь
 *    ялна), `bv` нь тэр үеийн СЕРВЕРИЙН утга — сэргээхэд сервер өөрчлөгдсөн
 *    бол нүд ХУУЧИРСАН гэж хасагдана (`applyPayloadToDraft`-ийн ижил зарчим).
 *
 * ⚠️ TOMBSTONE (`del`): хэрэглэгч нүдээ буцаахад (ноорогоос хасахад) түүнийг
 *    «байхгүй» гэж илэрхийлдэг тул нийлүүлэхэд нөгөө талын хуучин хуулбар
 *    дахин сэргээх байв. Хассан агшныг 7 хоног хадгална: хассанаас ХУУЧИН
 *    нүд ирвэл хаяна, ШИНЭ нүд ирвэл (дахин зассан) нүд ялна.
 *    `FillNew`-ийн `del`-ийн хялбаршуулсан хувилбар.
 *
 * ⚠️ Энэ файл React-ГҮЙ, ArcGIS-ГҮЙ — `huvaariDraft.check.mjs` ажиллуулна.
 */

export type HDKind = 'plan' | 'geree';
export type HDSpan = { start: number; end: number } | null;

/** Нэг нүд — `val` нь JSON утга (төрлөөр ялгаатай, доор), `bv` = суурь (сервер) */
export type HDEntry = { val: unknown; at: number; user: string; bv?: unknown };
export type HDEntries = Map<string, HDEntry>;

export type HDDraft = {
  t: number;
  kind: HDKind;
  pkg: string;
  by: { user: string; at: number };
  entries: HDEntries;
  /** Хассан нүд → хассан агшин (мс) */
  del: Map<string, number>;
  base: { at: number; n: number };
  /**
   * ЦЭВЭРЛЭСЭН АГШИН (2026-09-24). Илгээсэн/цуцалсан үед мөрийг УСТГАДАГГҮЙ,
   * хоосон ноорог + бүх нүдний tombstone + энэ агшныг бичнэ.
   * ⚠️ Мөрийг устгавал tombstone ч устаж, өөр төхөөрөмжийн localStorage
   *    хуулбар (`t` < энэ агшин) илгээгдсэн нооргийг дахин амилуулдаг байв.
   *    Сэргээхэд `t < cleared` локал хуулбарыг үл тоомсорлоно.
   */
  cleared?: number;
};

export const HD_VERSION = 1;
/** Tombstone-ийн амьдрах хугацаа */
export const HD_DEL_TTL = 7 * 24 * 3600 * 1000;

/** Алсын мөрийн түлхүүр — `|`-ГҮЙ (толгойн ⚠️) */
export const hdKey = (kind: HDKind, pkgKey: string) => `plan:${kind}:${pkgKey}`;
/** Локал хуулбарын түлхүүр (localStorage) */
export const hdLocalKey = (key: string) => `selbe-huvaari-draft:${key}`;

/* ── Нүдний түлхүүр ── */
export const kS = (oid: number, blk: number) => `s:${oid}:${blk}`;
export const kH = (oid: number) => `h:${oid}`;
export const kA = (oid: number, blk: number) => `a:${oid}:${blk}`;
export const kR = (oid: number) => `r:${oid}`;
export const kM = (key: string) => `m:${key}`;

export type HDKeyParts =
  | { type: 's' | 'a'; oid: number; blk: number }
  | { type: 'h' | 'r'; oid: number }
  | { type: 'm'; key: string };

export function parseKey(k: string): HDKeyParts | null {
  const t = k[0];
  if (k[1] !== ':') return null;
  const rest = k.slice(2);
  if (t === 'm') return rest ? { type: 'm', key: rest } : null;
  if (t === 'h' || t === 'r') {
    const oid = Number(rest);
    return Number.isInteger(oid) ? { type: t, oid } : null;
  }
  if (t === 's' || t === 'a') {
    const cut = rest.indexOf(':');
    if (cut < 0) return null;
    const oid = Number(rest.slice(0, cut));
    const blk = Number(rest.slice(cut + 1));
    return Number.isInteger(oid) && Number.isInteger(blk) && blk >= 0 ? { type: t, oid, blk } : null;
  }
  return null;
}

/** JSON утгын тэнцэл — `undefined` ба `null` ижил */
export const sameVal = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/* ── Утгын хэвшил (val/bv) — төрөл бүрт КАНОН хэлбэр, эс бөгөөс тэнцэл гажна ── */
/** Сарын задаргаа → түлхүүрээр эрэмбэлсэн хос жагсаалт */
export const monthsVal = (m: ReadonlyMap<string, number> | null | undefined): [string, number][] =>
  m ? [...m].filter(([, v]) => v != null && Number.isFinite(v)).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)) : [];
export const monthsOfVal = (v: unknown): Map<string, number> => {
  const m = new Map<string, number>();
  if (!Array.isArray(v)) return m;
  for (const p of v) {
    if (Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'number' && Number.isFinite(p[1])) m.set(p[0], p[1]);
  }
  return m;
};
const spanVal = (s: HDSpan | undefined): HDSpan =>
  (s && Number.isFinite(s.start) && Number.isFinite(s.end) ? { start: s.start, end: s.end } : null);
const hamVal = (s: string | null | undefined): string => s ?? '';
const numOrNull = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/* ══════════════ Huvaari-ийн 5 Map ↔ нүдний жагсаалт ══════════════ */

/** Нэг мөрийн серверийн утга — `Huvaari` нь `base`/`rows`-оос угсарна */
export type HDRowBase = {
  spans: readonly HDSpan[];
  ham: string | null;
  aStart: readonly (number | null)[];
  aEnd: readonly (number | null)[];
  hun: number | null;
  mashin: number | null;
};
export type HDCtx = {
  n: number;
  rows: ReadonlyMap<number, HDRowBase>;
  /** `${код}|${блок}` → серверийн сарын задаргаа */
  months: (key: string) => ReadonlyMap<string, number> | undefined;
};
export type HDMaps = {
  draft: Map<number, HDSpan[]>;
  ham: Map<number, string>;
  aDraft: Map<number, { start: (number | null)[]; end: (number | null)[] }>;
  resDraft: Map<number, { hun: number | null; mashin: number | null }>;
  obDraft: Map<string, Map<string, number>>;
};
export type HDCell = { val: unknown; bv: unknown };

/**
 * 5 Map → ӨӨРЧЛӨГДСӨН нүдүүд (серверээс зөрсөн нь л). `at`/`user`-ГҮЙ —
 * тэдгээрийг дуудагч өөрийн мета-гаас нэмнэ.
 * ⚠️ Серверт БАЙХГҮЙ мөрийн нүд орохгүй: суурьгүй тул тулгах аргагүй.
 */
export function mapsToCells(m: HDMaps, ctx: HDCtx): Map<string, HDCell> {
  const out = new Map<string, HDCell>();
  for (const [oid, arr] of m.draft) {
    const r = ctx.rows.get(oid);
    if (!r) continue;
    for (let b = 0; b < ctx.n; b += 1) {
      const v = spanVal(arr[b]);
      const bv = spanVal(r.spans[b]);
      if (!sameVal(v, bv)) out.set(kS(oid, b), { val: v, bv });
    }
  }
  for (const [oid, txt] of m.ham) {
    const r = ctx.rows.get(oid);
    if (!r) continue;
    const v = hamVal(txt);
    const bv = hamVal(r.ham);
    if (v !== bv) out.set(kH(oid), { val: v, bv });
  }
  for (const [oid, ad] of m.aDraft) {
    const r = ctx.rows.get(oid);
    if (!r) continue;
    for (let b = 0; b < ctx.n; b += 1) {
      const v = [numOrNull(ad.start[b]), numOrNull(ad.end[b])];
      const bv = [numOrNull(r.aStart[b]), numOrNull(r.aEnd[b])];
      if (!sameVal(v, bv)) out.set(kA(oid, b), { val: v, bv });
    }
  }
  for (const [oid, rd] of m.resDraft) {
    const r = ctx.rows.get(oid);
    if (!r) continue;
    const v = [numOrNull(rd.hun), numOrNull(rd.mashin)];
    const bv = [numOrNull(r.hun), numOrNull(r.mashin)];
    if (!sameVal(v, bv)) out.set(kR(oid), { val: v, bv });
  }
  for (const [key, months] of m.obDraft) {
    const v = monthsVal(months);
    const srv = ctx.months(key);
    /* ⚠️ Сервер МЭДЭГДЭХГҮЙ (`undefined` — задаргаа ачаалагдаагүй/унасан) бол
       суурьгүй нүд: тулгах зүйлгүй тул `bv`-гүй хадгална, хаяхгүй (2026-09-24). */
    if (srv === undefined) { out.set(kM(key), { val: v, bv: undefined }); continue; }
    const bv = monthsVal(srv);
    if (!sameVal(v, bv)) out.set(kM(key), { val: v, bv });
  }
  return out;
}

export type HDApply = {
  maps: HDMaps;
  /** Ноорогт орсон нүд */
  applied: number;
  /** Сервер өөрчлөгдсөн (эсвэл мөр алга) тул хасагдсан нүд */
  stale: number;
  /** Ноорогт ОРООГҮЙ бүх түлхүүр (хуучирсан + серверийнхтэй ижил болсон) */
  dropped: string[];
  /**
   * `dropped`-ийн ХУУЧИРСАН хэсэг (`bv` ≠ ЭНЭ клиентийн сервер, мөр алга).
   * ⚠️ Дуудагч ЭДГЭЭРТ tombstone ТАВИХГҮЙ (2026-09-24): хуучин суурьтай
   *    (мөрөө шинэчлээгүй) клиент бусдын хүчинтэй нүдийг бүгдэд нь устгадаг
   *    байв. Хуучирсан нүд зөвхөн ЭНД орохгүй — алсад хэвээр.
   *    Tombstone зөвхөн «серверийнхтэй ижил болсон» (`dropped − staleKeys`).
   */
  staleKeys: string[];
  /** Хөндөгдсөн ялгаатай мөр (oid эсвэл обьёмын түлхүүр) */
  rows: number;
};

/**
 * Нүдүүд → 5 Map. Сэргээх ба нийлүүлэх хоёулаа үүгээр.
 * ⚠️ `bv` байгаа ч серверийн ОДООГИЙН утгаас зөрвөл ХУУЧИРСАН → хасна
 *    (`stale`). `bv`-гүй (эвдэрсэн/хуучин) нүд шууд орно.
 * ⚠️ Утга нь серверийнхтэй ИЖИЛ болсон нүд ноорогт ОРОХГҮЙ (бичих зүйлгүй) —
 *    `dropped`-д орж, дараагийн бичилтээр алсаас ч арилна.
 * ⚠️ Муж/бодит огнооны мөр нь СЕРВЕРИЙН массиваас эхэлж, зөвхөн ноорогийн
 *    блокийг сольно — `Draft`/`ADraft` нь мөрийн бүтэн массив хадгалдаг.
 */
export function cellsToMaps(entries: ReadonlyMap<string, HDEntry | HDCell>, ctx: HDCtx): HDApply {
  const maps: HDMaps = {
    draft: new Map(), ham: new Map(), aDraft: new Map(), resDraft: new Map(), obDraft: new Map(),
  };
  let applied = 0;
  let stale = 0;
  const dropped: string[] = [];
  const staleKeys: string[] = [];
  const touched = new Set<string>();
  for (const [k, e] of entries) {
    const p = parseKey(k);
    if (!p) { dropped.push(k); continue; }
    if (p.type === 'm') {
      const srv = ctx.months(p.key);
      const v = monthsVal(monthsOfVal(e.val));
      /* ⚠️ Сервер МЭДЭГДЭХГҮЙ бол тулгахгүй, ХАЯХГҮЙ — шууд орно (2026-09-24).
         Урьд нь `undefined` → `[]` болж, задаргаа ачаалагдаагүй агшинд алсын
         бүх сарын нүд «хуучирсан» гэж хасагддаг байв. */
      if (srv !== undefined) {
        const cur = monthsVal(srv);
        if (e.bv !== undefined && !sameVal(e.bv, cur)) { stale += 1; staleKeys.push(k); dropped.push(k); continue; }
        if (sameVal(v, cur)) { dropped.push(k); continue; }
      }
      maps.obDraft.set(p.key, monthsOfVal(v));
      applied += 1; touched.add(k);
      continue;
    }
    const r = ctx.rows.get(p.oid);
    if (!r) { stale += 1; staleKeys.push(k); dropped.push(k); continue; }
    if (p.type === 's') {
      if (p.blk >= ctx.n) { stale += 1; staleKeys.push(k); dropped.push(k); continue; }
      const cur = spanVal(r.spans[p.blk]);
      if (e.bv !== undefined && !sameVal(e.bv, cur)) { stale += 1; staleKeys.push(k); dropped.push(k); continue; }
      const v = spanVal(e.val as HDSpan);
      if (sameVal(v, cur)) { dropped.push(k); continue; }
      let arr = maps.draft.get(p.oid);
      if (!arr) { arr = r.spans.map(spanVal); maps.draft.set(p.oid, arr); }
      arr[p.blk] = v;
      applied += 1; touched.add(String(p.oid));
    } else if (p.type === 'a') {
      if (p.blk >= ctx.n) { stale += 1; staleKeys.push(k); dropped.push(k); continue; }
      const cur = [numOrNull(r.aStart[p.blk]), numOrNull(r.aEnd[p.blk])];
      if (e.bv !== undefined && !sameVal(e.bv, cur)) { stale += 1; staleKeys.push(k); dropped.push(k); continue; }
      const raw = Array.isArray(e.val) ? e.val : [];
      const v = [numOrNull(raw[0]), numOrNull(raw[1])];
      if (sameVal(v, cur)) { dropped.push(k); continue; }
      let ad = maps.aDraft.get(p.oid);
      if (!ad) { ad = { start: r.aStart.map(numOrNull), end: r.aEnd.map(numOrNull) }; maps.aDraft.set(p.oid, ad); }
      ad.start[p.blk] = v[0]; ad.end[p.blk] = v[1];
      applied += 1; touched.add(String(p.oid));
    } else if (p.type === 'h') {
      const cur = hamVal(r.ham);
      if (e.bv !== undefined && !sameVal(e.bv, cur)) { stale += 1; staleKeys.push(k); dropped.push(k); continue; }
      const v = typeof e.val === 'string' ? e.val : '';
      if (v === cur) { dropped.push(k); continue; }
      maps.ham.set(p.oid, v);
      applied += 1; touched.add(String(p.oid));
    } else {
      const cur = [numOrNull(r.hun), numOrNull(r.mashin)];
      if (e.bv !== undefined && !sameVal(e.bv, cur)) { stale += 1; staleKeys.push(k); dropped.push(k); continue; }
      const raw = Array.isArray(e.val) ? e.val : [];
      const v = [numOrNull(raw[0]), numOrNull(raw[1])];
      if (sameVal(v, cur)) { dropped.push(k); continue; }
      maps.resDraft.set(p.oid, { hun: v[0], mashin: v[1] });
      applied += 1; touched.add(String(p.oid));
    }
  }
  return { maps, applied, stale, dropped, staleKeys, rows: touched.size };
}

/* ══════════════ Сериалчлал ══════════════ */

type Wire = {
  v: number; t: number; kind: HDKind; pkg: string; by: { user: string; at: number };
  spans: unknown[]; ham: unknown[]; actual: unknown[]; res: unknown[]; months: unknown[];
  del: unknown[]; base: { at: number; n: number };
  cleared?: number;
};

/** HDDraft → JSON мөр (алсын `payload`). Нүд бүр `[…, at, user, bv]` */
export function serialize(d: HDDraft): string {
  const spans: unknown[] = [];
  const ham: unknown[] = [];
  const actual: unknown[] = [];
  const res: unknown[] = [];
  const months: unknown[] = [];
  const bv = (e: HDEntry) => (e.bv === undefined ? [] : [e.bv]);
  /* ⚠️ ТҮЛХҮҮРЭЭР ЭРЭМБЭЛНЭ: `merge`-ийн Map дараалал а/б-ийн эрэмбээс хамаардаг
     тул ижил агуулга өөр мөр болж, `sig` зөрж, хоёр клиент ээлжлэн дахин
     бичээд мөнхийн тойрог үүсгэх байв. */
  const keys = [...d.entries.keys()].sort();
  for (const k of keys) {
    const e = d.entries.get(k)!;
    const p = parseKey(k);
    if (!p) continue;
    if (p.type === 's') spans.push([p.oid, p.blk, e.val ?? null, e.at, e.user, ...bv(e)]);
    else if (p.type === 'h') ham.push([p.oid, e.val ?? '', e.at, e.user, ...bv(e)]);
    else if (p.type === 'a') {
      const v = Array.isArray(e.val) ? e.val : [];
      actual.push([p.oid, p.blk, v[0] ?? null, v[1] ?? null, e.at, e.user, ...bv(e)]);
    } else if (p.type === 'r') {
      const v = Array.isArray(e.val) ? e.val : [];
      res.push([p.oid, v[0] ?? null, v[1] ?? null, e.at, e.user, ...bv(e)]);
    } else if (p.type === 'm') months.push([p.key, e.val ?? [], e.at, e.user, ...bv(e)]);
  }
  const w: Wire = {
    v: HD_VERSION, t: d.t, kind: d.kind, pkg: d.pkg, by: d.by,
    spans, ham, actual, res, months,
    del: [...d.del].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)),
    base: d.base,
    ...(d.cleared ? { cleared: d.cleared } : {}),
  };
  return JSON.stringify(w);
}

/**
 * ХАРЬЦУУЛАХ ГАРЫН ҮСЭГ — `t`/`by`/`base`-ГҮЙ, зөвхөн нүд ба tombstone.
 * Агуулга өөрчлөгдөөгүй бол дахин бичихгүй (`saveRemoteDraft` нь query +
 * applyEdits хоёр дуудлага).
 * ⚠️ `by` ОРОХГҮЙ: Б нь А-гийн бичсэнийг нийлүүлээд дахин бичихэд `by` нь
 *    Б болно; А түүнийг уншаад «өөр» гэж дахин бичвэл тойрог үүснэ.
 */
export const sig = (d: HDDraft): string =>
  serialize({ ...d, t: 0, by: { user: '', at: 0 }, base: { at: 0, n: d.base.n }, cleared: undefined });

const ms = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
const str = (x: unknown): string => (typeof x === 'string' ? x : '');

/**
 * JSON мөр → HDDraft. Эвдэрсэн бол `null`; эвдэрсэн НЭГ нүдийг л орхино
 * (бүхэлд нь хаявал бусдын ажил алга болно).
 */
export function parse(s: string | null | undefined): HDDraft | null {
  if (!s) return null;
  let w: Partial<Wire>;
  try { w = JSON.parse(s) as Partial<Wire>; } catch { return null; }
  if (!w || typeof w !== 'object' || w.v !== HD_VERSION) return null;
  const kind: HDKind = w.kind === 'geree' ? 'geree' : 'plan';
  const t = ms(w.t) ?? 0;
  const entries: HDEntries = new Map();
  const put = (k: string, val: unknown, at: unknown, user: unknown, bv: unknown[]) => {
    const a = ms(at);
    if (a == null) return;
    const e: HDEntry = { val, at: a, user: str(user).toLowerCase() };
    if (bv.length) e.bv = bv[0] ?? null;
    entries.set(k, e);
  };
  for (const x of Array.isArray(w.spans) ? w.spans : []) {
    if (!Array.isArray(x) || !Number.isInteger(x[0]) || !Number.isInteger(x[1])) continue;
    const v = x[2] && typeof x[2] === 'object' ? spanVal(x[2] as HDSpan) : null;
    put(kS(x[0] as number, x[1] as number), v, x[3], x[4], x.slice(5));
  }
  for (const x of Array.isArray(w.ham) ? w.ham : []) {
    if (!Array.isArray(x) || !Number.isInteger(x[0])) continue;
    put(kH(x[0] as number), str(x[1]), x[2], x[3], x.slice(4));
  }
  for (const x of Array.isArray(w.actual) ? w.actual : []) {
    if (!Array.isArray(x) || !Number.isInteger(x[0]) || !Number.isInteger(x[1])) continue;
    put(kA(x[0] as number, x[1] as number), [numOrNull(x[2]), numOrNull(x[3])], x[4], x[5], x.slice(6));
  }
  for (const x of Array.isArray(w.res) ? w.res : []) {
    if (!Array.isArray(x) || !Number.isInteger(x[0])) continue;
    put(kR(x[0] as number), [numOrNull(x[1]), numOrNull(x[2])], x[3], x[4], x.slice(5));
  }
  for (const x of Array.isArray(w.months) ? w.months : []) {
    if (!Array.isArray(x) || typeof x[0] !== 'string' || !x[0]) continue;
    put(kM(x[0]), monthsVal(monthsOfVal(x[1])), x[2], x[3], x.slice(4));
  }
  const del = new Map<string, number>();
  for (const x of Array.isArray(w.del) ? w.del : []) {
    if (!Array.isArray(x) || typeof x[0] !== 'string') continue;
    const a = ms(x[1]);
    if (a != null && parseKey(x[0])) del.set(x[0], a);
  }
  const by = w.by && typeof w.by === 'object'
    ? { user: str(w.by.user).toLowerCase(), at: ms(w.by.at) ?? t }
    : { user: '', at: t };
  const base = w.base && typeof w.base === 'object'
    ? { at: ms(w.base.at) ?? 0, n: Number.isInteger(w.base.n) ? (w.base.n as number) : 0 }
    : { at: 0, n: 0 };
  const cleared = ms(w.cleared);
  return { t, kind, pkg: str(w.pkg), by, entries, del, base, ...(cleared ? { cleared } : {}) };
}

/* ══════════════ Нийлүүлэлт ══════════════ */

/**
 * ХОЁР НООРОГ → НЭГ. Нүд бүрээр ШИНЭ `at` ялна; тэнцвэл `a` (дуудагч алсыг
 * `a`-д өгнө). Tombstone: хассан агшин нүднийхээс ХОЖУУ бол нүд хаягдана,
 * эрт бол tombstone хаягдана (нүд дахин бичигдсэн). 7 хоногоос хуучин
 * tombstone арилна.
 * ⚠️ `now` параметр — тест дээр цагийг тогтооход.
 */
export function merge(a: HDDraft | null, b: HDDraft | null, now = Date.now()): HDDraft | null {
  if (!a) return b ? prune(b, now) : null;
  if (!b) return prune(a, now);
  const del = new Map<string, number>();
  for (const src of [a.del, b.del]) {
    for (const [k, at] of src) {
      if (now - at > HD_DEL_TTL) continue;
      if ((del.get(k) ?? -1) < at) del.set(k, at);
    }
  }
  const entries: HDEntries = new Map();
  for (const k of new Set([...a.entries.keys(), ...b.entries.keys()])) {
    const ea = a.entries.get(k);
    const eb = b.entries.get(k);
    const e = !ea ? eb! : !eb ? ea : (eb.at > ea.at ? eb : ea);
    const d = del.get(k);
    if (d != null && d > e.at) continue;
    entries.set(k, e);
    del.delete(k);
  }
  const newer = b.t > a.t ? b : a;
  const cleared = Math.max(a.cleared ?? 0, b.cleared ?? 0);
  return {
    t: Math.max(a.t, b.t), kind: newer.kind, pkg: newer.pkg, by: newer.by,
    entries, del, base: newer.base,
    ...(cleared ? { cleared } : {}),
  };
}

/** Ганц ноорогт ч tombstone-ийн дүрмийг мөрдөнө */
function prune(d: HDDraft, now: number): HDDraft {
  const del = new Map<string, number>();
  for (const [k, at] of d.del) if (now - at <= HD_DEL_TTL) del.set(k, at);
  const entries: HDEntries = new Map();
  for (const [k, e] of d.entries) {
    const x = del.get(k);
    if (x != null && x > e.at) continue;
    entries.set(k, e);
    del.delete(k);
  }
  return { ...d, entries, del };
}

/** Ноорогт нүд бичсэн ЯЛГААТАЙ хэрэглэгчид — толгойн «ноорогт: …» жагсаалт */
export function users(d: HDDraft | null): string[] {
  if (!d) return [];
  const s = new Set<string>();
  for (const e of d.entries.values()) if (e.user) s.add(e.user);
  return [...s].sort();
}

export const isEmpty = (d: HDDraft | null): boolean => !d || d.entries.size === 0;
