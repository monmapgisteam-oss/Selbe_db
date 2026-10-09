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
   * ⚠️ 2026-10-04 аудит: НҮД ТУС БҮРЭЭР (`dropCleared`) — локал хуулбарыг БҮХЛЭЭР нь
   *    хаяхаа болив: цэвэрлэлтээс ХОЙШ бичсэн нүд (`at > cleared`) нь хуулбарын `t`
   *    хуучин ч хэвээр үлдэнэ. Зөвхөн илгээх/«Ноорог хаях» тавина (`applyClear`),
   *    энгийн буцаалтаар хоосорсон ноорог ТАВИХГҮЙ.
   */
  cleared?: number;
  /**
   * МӨРИЙН ТАНИХ ТҮЛХҮҮР (2026-10-09) — `oid` → {ажлын код · № · нэр}. Нүдний `oid` нь жаазынх тул
   * «Гүйцэтгэл бөглөх» нийтлэл/нэмэлт ажил шинэ жааз бичихэд бүх oid солигдож ноорог «мөр алга»
   * болдог байв. Үүгээр сэргээх/нийлүүлэхэд шинэ мөр рүү зөөнө (`identityRemap`).
   * ⚠️ `sig`-д ОРОХГҮЙ (нүдний агуулга биш) — хэт том үед бичигдэхгүй байж болно (`serialize`-ийн `max`).
   */
  rk?: Map<number, HDRowKey>;
};

/** Мөрийн таних түлхүүр — жааз солигдоход хадгалагддаг талбарууд (2026-10-09) */
export type HDRowKey = { des: number | null; no: string; work: string };

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
/** Сарын НӨӨЦ (хүн хүч · машин) — `m:`-тэй зэрэгцээ, тусдаа нүд (2026-09-24) */
export const kN = (key: string) => `n:${key}`;

export type HDKeyParts =
  | { type: 's' | 'a'; oid: number; blk: number }
  | { type: 'h' | 'r'; oid: number }
  | { type: 'm'; key: string }
  | { type: 'n'; key: string };

export function parseKey(k: string): HDKeyParts | null {
  const t = k[0];
  if (k[1] !== ':') return null;
  const rest = k.slice(2);
  if (t === 'm') return rest ? { type: 'm', key: rest } : null;
  if (t === 'n') return rest ? { type: 'n', key: rest } : null;
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

const numOrNull = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

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
/** Сарын нөөц → эрэмбэлсэн `[сар, хүн, машин]` (2026-09-24) — хоёулаа null сар орохгүй */
export type HDMonthRes = { hun: number | null; mashin: number | null };
export const resVal = (m: ReadonlyMap<string, HDMonthRes> | null | undefined): [string, number | null, number | null][] =>
  m
    ? [...m]
      .filter(([, v]) => v && (v.hun != null || v.mashin != null))
      .map(([k, v]) => [k, numOrNull(v.hun), numOrNull(v.mashin)] as [string, number | null, number | null])
      .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    : [];
export const resOfVal = (v: unknown): Map<string, HDMonthRes> => {
  const m = new Map<string, HDMonthRes>();
  if (!Array.isArray(v)) return m;
  for (const p of v) {
    if (!Array.isArray(p) || typeof p[0] !== 'string') continue;
    /* ⚠️ БҮХЭЛ тоо (2026-09-24) — мөрийн нийлбэр Integer талбарт очдог */
    const hun0 = numOrNull(p[1]);
    const mashin0 = numOrNull(p[2]);
    const hun = hun0 == null ? null : Math.floor(hun0);
    const mashin = mashin0 == null ? null : Math.floor(mashin0);
    if (hun == null && mashin == null) continue;
    m.set(p[0], { hun, mashin });
  }
  return m;
};
const spanVal = (s: HDSpan | undefined): HDSpan =>
  (s && Number.isFinite(s.start) && Number.isFinite(s.end) ? { start: s.start, end: s.end } : null);
const hamVal = (s: string | null | undefined): string => s ?? '';
/**
 * ⚠️ 2026-10-08: ХАДГАЛАГДСАН НҮДНИЙ ОГНООГ UTC ӨДӨРТ ТЭГШИТГЭНЭ — `bagtsSheet.normDayMs`-ийн
 *    ХУУЛБАР (энэ файл импортгүй — React-гүй, ArcGIS-гүй). Мөрүүд одоо уншихдаа тэгшлэгддэг
 *    тул 2026-10-08-аас ӨМНӨ бичигдсэн нүдний `bv` (түүхий 16:00Z) нь серверийн тэгшлэгдсэн
 *    утгаас зөрж, `cellsToMaps` нооргийг «хуучирсан» гэж ХУДЛАА хаядаг байв. `val` ч тэгшлэгдэнэ.
 */
const DAY = 86_400_000;
const normDay = (ms: number | null): number | null =>
  (ms == null || !Number.isFinite(ms) ? null : Math.round(ms / DAY) * DAY);
const normSpan = (s: HDSpan): HDSpan => (s ? { start: normDay(s.start) ?? s.start, end: normDay(s.end) ?? s.end } : null);
/** Хадгалагдсан `bv`/`val`-ыг (хэлбэр нь үл мэдэгдэх) муж болгож тэгшилнэ */
const normSpanVal = (v: unknown): HDSpan => normSpan(spanVal(v as HDSpan));
const normPair = (v: unknown): (number | null)[] => {
  const raw = Array.isArray(v) ? v : [];
  return [normDay(numOrNull(raw[0])), normDay(numOrNull(raw[1]))];
};

/* ══════════════ Huvaari-ийн 5 Map ↔ нүдний жагсаалт ══════════════ */

/** Нэг мөрийн серверийн утга — `Huvaari` нь `base`/`rows`-оос угсарна */
export type HDRowBase = {
  spans: readonly HDSpan[];
  ham: string | null;
  aStart: readonly (number | null)[];
  aEnd: readonly (number | null)[];
  hun: number | null;
  mashin: number | null;
  /** ⚠️ 2026-10-09: мөрийн танихуун (`HDRowKey`) — шинэ жаазад зөөхөд; байхгүй бол зөөлт алгасна */
  des?: number | null;
  no?: string;
  work?: string;
};
export type HDCtx = {
  n: number;
  rows: ReadonlyMap<number, HDRowBase>;
  /** `${код}|${блок}` → серверийн сарын задаргаа */
  months: (key: string) => ReadonlyMap<string, number> | undefined;
  /** `${код}|${блок}` → серверийн сарын НӨӨЦ (2026-09-24); `undefined` = мэдэгдэхгүй */
  monthsRes: (key: string) => ReadonlyMap<string, HDMonthRes> | undefined;
};
export type HDMaps = {
  draft: Map<number, HDSpan[]>;
  ham: Map<number, string>;
  aDraft: Map<number, { start: (number | null)[]; end: (number | null)[] }>;
  resDraft: Map<number, { hun: number | null; mashin: number | null }>;
  obDraft: Map<string, Map<string, number>>;
  /** Сарын нөөцийн ноорог (2026-09-24) — `obDraft`-тай зэрэгцээ */
  obRes: Map<string, Map<string, HDMonthRes>>;
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
  /* Сарын нөөц — `m:`-ийн ижил дүрэм (2026-09-24) */
  for (const [key, res] of m.obRes) {
    const v = resVal(res);
    const srv = ctx.monthsRes(key);
    if (srv === undefined) { out.set(kN(key), { val: v, bv: undefined }); continue; }
    const bv = resVal(srv);
    if (!sameVal(v, bv)) out.set(kN(key), { val: v, bv });
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
  /**
   * `staleKeys`-ийн `bv` ЗӨРСӨН хэсэг (мөр байгаа ч сервер бичигчийн суурийг өөрчилсөн).
   * ⚠️ 2026-09-25: «Мөр алга» (шинэ жааз) нүдийг бусдын нүд бол tombstone хийхгүй —
   *    хуучин жаазтай клиентэд хүчинтэй хэвээр; дуудагч үүгээр ялгана.
   */
  bvKeys: string[];
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
    draft: new Map(), ham: new Map(), aDraft: new Map(), resDraft: new Map(), obDraft: new Map(), obRes: new Map(),
  };
  let applied = 0;
  let stale = 0;
  const dropped: string[] = [];
  const staleKeys: string[] = [];
  const bvKeys: string[] = [];
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
        if (e.bv !== undefined && !sameVal(e.bv, cur)) { stale += 1; staleKeys.push(k); bvKeys.push(k); dropped.push(k); continue; }
        if (sameVal(v, cur)) { dropped.push(k); continue; }
      }
      maps.obDraft.set(p.key, monthsOfVal(v));
      applied += 1; touched.add(k);
      continue;
    }
    if (p.type === 'n') {
      const srv = ctx.monthsRes(p.key);
      const v = resVal(resOfVal(e.val));
      if (srv !== undefined) {
        const cur = resVal(srv);
        if (e.bv !== undefined && !sameVal(e.bv, cur)) { stale += 1; staleKeys.push(k); bvKeys.push(k); dropped.push(k); continue; }
        if (sameVal(v, cur)) { dropped.push(k); continue; }
      }
      maps.obRes.set(p.key, resOfVal(v));
      applied += 1; touched.add(`m:${p.key}`);
      continue;
    }
    const r = ctx.rows.get(p.oid);
    if (!r) { stale += 1; staleKeys.push(k); dropped.push(k); continue; }
    if (p.type === 's') {
      if (p.blk >= ctx.n) { stale += 1; staleKeys.push(k); dropped.push(k); continue; }
      const cur = spanVal(r.spans[p.blk]);
      /* ⚠️ 2026-10-08: `bv`/`val`-ыг тэгшлээд тулгана (`normSpanVal`-ын ⚠️) — сервер тал аль хэдийн тэгшлэгдсэн */
      if (e.bv !== undefined && !sameVal(normSpanVal(e.bv), cur)) { stale += 1; staleKeys.push(k); bvKeys.push(k); dropped.push(k); continue; }
      const v = normSpanVal(e.val);
      if (sameVal(v, cur)) { dropped.push(k); continue; }
      let arr = maps.draft.get(p.oid);
      if (!arr) { arr = r.spans.map(spanVal); maps.draft.set(p.oid, arr); }
      arr[p.blk] = v;
      applied += 1; touched.add(String(p.oid));
    } else if (p.type === 'a') {
      if (p.blk >= ctx.n) { stale += 1; staleKeys.push(k); dropped.push(k); continue; }
      const cur = [numOrNull(r.aStart[p.blk]), numOrNull(r.aEnd[p.blk])];
      /* ⚠️ 2026-10-08: бодит огноо ч тэгшлэгдсэн тулгалт (`normPair`) */
      if (e.bv !== undefined && !sameVal(normPair(e.bv), cur)) { stale += 1; staleKeys.push(k); bvKeys.push(k); dropped.push(k); continue; }
      const v = normPair(e.val);
      if (sameVal(v, cur)) { dropped.push(k); continue; }
      let ad = maps.aDraft.get(p.oid);
      if (!ad) { ad = { start: r.aStart.map(numOrNull), end: r.aEnd.map(numOrNull) }; maps.aDraft.set(p.oid, ad); }
      ad.start[p.blk] = v[0]; ad.end[p.blk] = v[1];
      applied += 1; touched.add(String(p.oid));
    } else if (p.type === 'h') {
      const cur = hamVal(r.ham);
      if (e.bv !== undefined && !sameVal(e.bv, cur)) { stale += 1; staleKeys.push(k); bvKeys.push(k); dropped.push(k); continue; }
      const v = typeof e.val === 'string' ? e.val : '';
      if (v === cur) { dropped.push(k); continue; }
      maps.ham.set(p.oid, v);
      applied += 1; touched.add(String(p.oid));
    } else {
      const cur = [numOrNull(r.hun), numOrNull(r.mashin)];
      if (e.bv !== undefined && !sameVal(e.bv, cur)) { stale += 1; staleKeys.push(k); bvKeys.push(k); dropped.push(k); continue; }
      const raw = Array.isArray(e.val) ? e.val : [];
      const v = [numOrNull(raw[0]), numOrNull(raw[1])];
      if (sameVal(v, cur)) { dropped.push(k); continue; }
      maps.resDraft.set(p.oid, { hun: v[0], mashin: v[1] });
      applied += 1; touched.add(String(p.oid));
    }
  }
  return { maps, applied, stale, dropped, staleKeys, bvKeys, rows: touched.size };
}

/* ══════════════ Сериалчлал ══════════════ */

type Wire = {
  v: number; t: number; kind: HDKind; pkg: string; by: { user: string; at: number };
  /** Хэрэглэгчийн нэрсийн хүснэгт (2026-10-08) — нүдний `user` нь энд заах индекс; хуучин ноорогт мөр хэвээр */
  u?: string[];
  spans: unknown[]; ham: unknown[]; actual: unknown[]; res: unknown[]; months: unknown[];
  /** Сарын нөөц (2026-09-24) — хуучин ноорогт байхгүй, `parse` тэсвэрлэнэ */
  mres?: unknown[];
  del: unknown[]; base: { at: number; n: number };
  cleared?: number;
  /** Мөрийн танихуун (2026-10-09) — `[oid, код|null, №, нэр]`; хуучин ноорогт байхгүй */
  rk?: unknown[];
};
/** Танихуун нэрийн дээд урт — ачааллыг хязгаарлана (зөөлт кодоор, нэр нь нөөц/мэдэгдэлд) */
const RK_NAME_MAX = 40;

/**
 * ⚠️ 2026-10-08: НЯГТ БИЧИГЛЭЛ — `REMOTE_MAX` (80 000) нь 1,266 мөр × 22 блокийн багцад ~600
 *    мужийн нүдэнд л хүрч, түүнээс хойш ноорог алсад ОГТ очдоггүй байв. Нэг мужийн нүд
 *    `{"start":1760000000000,"end":1760500000000}` × 2 (val + bv) + нэр = ~130 тэмдэгт.
 *      · Муж → `[эхлэх, дуусах]` ХОНОГООР (ms / DAY, хоёулаа бүхэл хоног бол), эс бөгөөс ms-ээр
 *        (гаднаас орсон цагтай огноо нарийвчлал алдахгүй). Хоног < 1e8, ms > 1e12 — ялгагдана.
 *      · Хэрэглэгчийн нэр → `u` хүснэгтийн индекс.
 *      · `val === bv` нүд (серверийнхтэй ижил — бичих зүйлгүй, `cellsToMaps` ямар ч байсан хаядаг) орохгүй.
 *    Нэг нүд ~55 тэмдэгт. `parse` ХУУЧИН хэлбэрийг (объект муж, нэр мөрөөр) хэвээр уншина.
 */
const DAY_MS = 86_400_000;
const spanWire = (s: HDSpan): [number, number] | null => {
  if (!s) return null;
  return s.start % DAY_MS === 0 && s.end % DAY_MS === 0 ? [s.start / DAY_MS, s.end / DAY_MS] : [s.start, s.end];
};
const spanOfWire = (x: unknown): HDSpan => {
  if (Array.isArray(x)) {
    const a = x[0];
    const z = x[1];
    if (typeof a !== 'number' || typeof z !== 'number' || !Number.isFinite(a) || !Number.isFinite(z)) return null;
    const days = Math.abs(a) < 1e8 && Math.abs(z) < 1e8;
    return { start: days ? a * DAY_MS : a, end: days ? z * DAY_MS : z };
  }
  return x && typeof x === 'object' ? spanVal(x as HDSpan) : null;
};

/**
 * HDDraft → JSON мөр (алсын `payload`). Нүд бүр `[…, at, user, bv]`.
 * ⚠️ 2026-10-09: `max` өгвөл танихуун (`rk`) нь хэмжээг ХЭТРҮҮЛЭХ үед эхлээд нэргүй (`[oid, код]`),
 *    дараа нь бүрмөсөн хасагдана — нүд хэзээ ч танихууны төлөө алсаас хоцрохгүй.
 */
export function serialize(d: HDDraft, max?: number): string {
  const full = serializeRk(d, 2);
  if (max == null || full.length <= max || !d.rk?.size) return full;
  const lite = serializeRk(d, 1);
  return lite.length <= max ? lite : serializeRk(d, 0);
}
/** `lvl`: 2 = бүтэн танихуун, 1 = зөвхөн код, 0 = танихуунгүй */
function serializeRk(d: HDDraft, lvl: 0 | 1 | 2): string {
  const spans: unknown[] = [];
  const ham: unknown[] = [];
  const actual: unknown[] = [];
  const res: unknown[] = [];
  const months: unknown[] = [];
  const mres: unknown[] = [];
  /* Нэрсийн хүснэгт — эрэмбэлсэн (детерминист, `sig`-д нөлөөгүй) */
  const u = [...new Set([...d.entries.values()].map((e) => e.user))].sort();
  const ui = new Map(u.map((name, i) => [name, i]));
  const usr = (e: HDEntry) => ui.get(e.user) ?? 0;
  const bv = (e: HDEntry) => (e.bv === undefined ? [] : [e.bv]);
  /* ⚠️ ТҮЛХҮҮРЭЭР ЭРЭМБЭЛНЭ: `merge`-ийн Map дараалал а/б-ийн эрэмбээс хамаардаг
     тул ижил агуулга өөр мөр болж, `sig` зөрж, хоёр клиент ээлжлэн дахин
     бичээд мөнхийн тойрог үүсгэх байв. */
  const keys = [...d.entries.keys()].sort();
  /** Нүдтэй мөрийн oid — танихуунд (2026-10-09) */
  const rowOids = new Set<number>();
  for (const k of keys) {
    const e = d.entries.get(k)!;
    const p = parseKey(k);
    if (!p) continue;
    /* ⚠️ 2026-10-08: серверийнхтэй ижил нүд бичигдэхгүй (дээрх ⚠️) */
    if (e.bv !== undefined && sameVal(e.val, e.bv)) continue;
    if (p.type !== 'm' && p.type !== 'n') rowOids.add(p.oid);
    if (p.type === 's') {
      const sbv = e.bv === undefined ? [] : [spanWire(spanVal(e.bv as HDSpan))];
      spans.push([p.oid, p.blk, spanWire(spanVal(e.val as HDSpan)), e.at, usr(e), ...sbv]);
    } else if (p.type === 'h') ham.push([p.oid, e.val ?? '', e.at, usr(e), ...bv(e)]);
    else if (p.type === 'a') {
      const v = Array.isArray(e.val) ? e.val : [];
      actual.push([p.oid, p.blk, v[0] ?? null, v[1] ?? null, e.at, usr(e), ...bv(e)]);
    } else if (p.type === 'r') {
      const v = Array.isArray(e.val) ? e.val : [];
      res.push([p.oid, v[0] ?? null, v[1] ?? null, e.at, usr(e), ...bv(e)]);
    } else if (p.type === 'm') months.push([p.key, e.val ?? [], e.at, usr(e), ...bv(e)]);
    else if (p.type === 'n') mres.push([p.key, e.val ?? [], e.at, usr(e), ...bv(e)]);
  }
  /* ⚠️ 2026-10-09: танихуун — oid-оор эрэмбэлсэн (детерминист), зөвхөн нүдтэй мөрд */
  const rk: unknown[] = [];
  if (lvl > 0 && d.rk) {
    for (const o of [...rowOids].sort((x, y) => x - y)) {
      const id = d.rk.get(o);
      if (!id) continue;
      rk.push(lvl === 2 ? [o, id.des, id.no.slice(0, RK_NAME_MAX), id.work.slice(0, RK_NAME_MAX)] : [o, id.des]);
    }
  }
  const w: Wire = {
    v: HD_VERSION, t: d.t, kind: d.kind, pkg: d.pkg, by: d.by,
    ...(u.length ? { u } : {}),
    spans, ham, actual, res, months,
    ...(mres.length ? { mres } : {}),
    del: [...d.del].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)),
    base: d.base,
    ...(d.cleared ? { cleared: d.cleared } : {}),
    ...(rk.length ? { rk } : {}),
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
/* ⚠️ 2026-10-09: `rk` ОРОХГҮЙ — хэт том үед танихуунгүй бичигдсэн алсын мөртэй тулгахад гарын үсэг
   зөрж мөчлөг бүрд дахин бичих тойрог үүсэх байв. */
export const sig = (d: HDDraft): string =>
  serialize({ ...d, t: 0, by: { user: '', at: 0 }, base: { at: 0, n: d.base.n }, cleared: undefined, rk: undefined });

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
  /* ⚠️ 2026-10-08: нэр — хүснэгтийн индекс (шинэ) эсвэл мөр (хуучин) хоёуланг уншина */
  const uTab = Array.isArray(w.u) ? w.u.map(str) : [];
  const usr = (x: unknown): string => (typeof x === 'number' ? uTab[x] ?? '' : str(x));
  const put = (k: string, val: unknown, at: unknown, user: unknown, bv: unknown[]) => {
    const a = ms(at);
    if (a == null) return;
    const e: HDEntry = { val, at: a, user: usr(user).toLowerCase() };
    if (bv.length) e.bv = bv[0] ?? null;
    entries.set(k, e);
  };
  for (const x of Array.isArray(w.spans) ? w.spans : []) {
    if (!Array.isArray(x) || !Number.isInteger(x[0]) || !Number.isInteger(x[1])) continue;
    /* ⚠️ 2026-10-08: муж `[хоног, хоног]` / `[ms, ms]` (шинэ) эсвэл `{start,end}` (хуучин) — `bv` ч мөн */
    put(kS(x[0] as number, x[1] as number), spanOfWire(x[2]), x[3], x[4], x.length > 5 ? [spanOfWire(x[5])] : []);
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
  for (const x of Array.isArray(w.mres) ? w.mres : []) {
    if (!Array.isArray(x) || typeof x[0] !== 'string' || !x[0]) continue;
    put(kN(x[0]), resVal(resOfVal(x[1])), x[2], x[3], x.slice(4));
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
  /* ⚠️ 2026-10-09: танихуун — эвдэрсэн мөрийг л орхино; хуучин ноорогт байхгүй */
  const rk = new Map<number, HDRowKey>();
  for (const x of Array.isArray(w.rk) ? w.rk : []) {
    if (!Array.isArray(x) || !Number.isInteger(x[0])) continue;
    const des = typeof x[1] === 'number' && Number.isFinite(x[1]) ? x[1] : null;
    rk.set(x[0] as number, { des, no: str(x[2]), work: str(x[3]) });
  }
  return { t, kind, pkg: str(w.pkg), by, entries, del, base, ...(cleared ? { cleared } : {}), ...(rk.size ? { rk } : {}) };
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
  /* ⚠️ 2026-10-09: танихуун — хоёулангийнх нийлнэ, ШИНЭ ноорогийнх давамгайлна */
  const older = newer === a ? b : a;
  const rk = new Map<number, HDRowKey>([...(older.rk ?? []), ...(newer.rk ?? [])]);
  return {
    t: Math.max(a.t, b.t), kind: newer.kind, pkg: newer.pkg, by: newer.by,
    entries, del, base: newer.base,
    ...(cleared ? { cleared } : {}),
    ...(rk.size ? { rk } : {}),
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

/**
 * МӨРИЙН ТҮЛХҮҮРИЙГ ШИНЭ OID РУУ ЗӨӨНӨ (2026-09-25 аудит) — «Улсын комисс» автомат
 * нэмэлт шинэ жааз бичсэний дараа хуваалцсан ноорогийг сэргээхэд (`Huvaari`-ийн
 * `remapOids`-ийн зураглалаар). `s/h/a/r` түлхүүр л зөөгдөнө; `m/n` (`des|блок`)
 * жаазаас хамаардаггүй тул хэвээр. Зөөгдсөн хуучин түлхүүр tombstone авна — хуучин
 * жаазтай клиентийн хуулбар түүнийг дахин амилуулахгүй. `bv` хэвээр: шинэ жааз нь
 * хуучныг хуулсан тул суурь утга ижил. Зураглалд БАЙХГҮЙ oid-той нүд хэвээр
 * (дараа нь `cellsToMaps` «мөр алга» гэж шийднэ). Оролтыг өөрчлөхгүй.
 */
/*
 * ⚠️ 2026-10-09 (`keep`): ӨӨР жааз нь шинэчлэгдээгүй хамтрагчийн нүдийг (`keep` → true) хуучин түлхүүрт
 *    tombstone-ГҮЙ ҮЛДЭЭНЭ — 2026-09-25-ны «мөр алга нүдийг бусдынх бол tombstone хийхгүй» дүрэм; шинэ
 *    түлхүүрт хуулбар л үүснэ. Шинэ түлхүүрт аль хэдийн ШИНЭ (`at` их) нүд эсвэл ШИНЭ tombstone (буцаасан)
 *    байвал зөөхгүй — урьд нь зөөлт шинэ түлхүүрийн tombstone-ыг арилгаж буцаасан нүдийг амилуулдаг байв.
 *    Хуучин түлхүүрийн tombstone ҮЛДЭНЭ (хуучин жаазтай клиентийн хуулбар амилахгүй), шинэд MAX-аар.
 */
export function remapDraft(
  d: HDDraft, map: ReadonlyMap<number, number>, now = Date.now(), keep?: (k: string, e: HDEntry) => boolean,
): HDDraft {
  if (!map.size) return d;
  const mv = (k: string): string | null => {
    const p = parseKey(k);
    if (!p || p.type === 'm' || p.type === 'n') return null;
    const to = map.get(p.oid);
    if (to == null || to === p.oid) return null;
    return p.type === 's' ? kS(to, p.blk) : p.type === 'a' ? kA(to, p.blk) : p.type === 'h' ? kH(to) : kR(to);
  };
  const entries: HDEntries = new Map();
  const del = new Map<string, number>();
  for (const [k, at] of d.del) {
    const nk = mv(k);
    if (nk == null) { if ((del.get(k) ?? -1) < at) del.set(k, at); continue; }
    if ((del.get(k) ?? -1) < at) del.set(k, at);
    if ((del.get(nk) ?? -1) < at) del.set(nk, at);
  }
  const moved: [string, string, HDEntry][] = [];
  for (const [k, e] of d.entries) {
    const nk = mv(k);
    if (nk == null) { entries.set(k, e); continue; }
    moved.push([k, nk, e]);
  }
  for (const [k, nk, e] of moved) {
    const ex = entries.get(nk);
    const td = del.get(nk);
    if (!(ex && ex.at >= e.at) && !(td != null && td > e.at)) {
      entries.set(nk, e);
      del.delete(nk);
    }
    if (keep?.(k, e)) { entries.set(k, e); del.delete(k); } else if ((del.get(k) ?? -1) < now) del.set(k, now);
  }
  /* Танихуун шинэ oid-д ч (зөөгдсөн мөр ижил ажил) */
  let rk = d.rk;
  if (rk?.size) {
    rk = new Map(rk);
    for (const [from, to] of map) { const id = d.rk!.get(from); if (id && !rk.has(to)) rk.set(to, id); }
  }
  return { ...d, entries, del, ...(rk ? { rk } : {}) };
}

/**
 * ТАНИХУУНААР ШИНЭ ЖААЗ РУУ ЗӨӨХ ЗУРАГЛАЛ (2026-10-09) — ноорогийн `s/h/a/r` нүдний oid нь одоогийн
 * мөрөнд (`ctx.rows`) байхгүй бол `rk`-ийн ажлын КОДООР (`des`, жааз солигдоход хадгалагддаг), код
 * байхгүй/давхардсан бол № + нэрээр — ЗӨВХӨН одоогийн мөрүүдэд ГАНЦ таарал байвал (`save`-ийн нөөц
 * зураглалын ижил дүрэм, `savePrep.remapRowsFull`).
 * @returns `map` хуучин→шинэ oid; `lost` — танихуунтай ч олдоогүй мөрийн «№ нэр»; `unknown` — танихуунгүй мөрийн тоо
 */
export function identityRemap(d: HDDraft, ctx: HDCtx): { map: Map<number, number>; lost: string[]; unknown: number } {
  const map = new Map<number, number>();
  const lost: string[] = [];
  let unknown = 0;
  const want = new Set<number>();
  for (const k of d.entries.keys()) {
    const p = parseKey(k);
    if (p && p.type !== 'm' && p.type !== 'n' && !ctx.rows.has(p.oid)) want.add(p.oid);
  }
  if (!want.size) return { map, lost, unknown };
  const nw = (no: string | undefined, work: string | undefined): string | null => {
    const a = (no ?? '').trim();
    const b = (work ?? '').trim();
    return a || b ? `${a}¦${b}` : null;
  };
  const byDes = new Map<number, number | null>();
  const byNw = new Map<string, number | null>();
  for (const [oid, r] of ctx.rows) {
    if (r.des != null) byDes.set(r.des, byDes.has(r.des) ? null : oid);
    const k = nw(r.no, r.work);
    if (k) byNw.set(k, byNw.has(k) ? null : oid);
  }
  /* ⚠️ 2026-10-09 (аудит): НЭГ-НЭГЭЭР ТАСАЛБАРЛАЛТ. Урьд нь `remapRowsFull`-ийн `used`-тэй адил шалгалтгүй тул
     хоёр хуучин oid (жиш. давхардсан код/№ + нэртэй хуучин мөрүүд) НЭГ одоогийн мөр рүү зөөгдөж, ноорог нь
     хоорондоо дарагддаг байв. Одоо нэг зорилтот мөр рүү 2+ хуучин oid таарвал ТОДОРХОЙГҮЙ — бүгд зөөгдөхгүй (`lost`). */
  const cand = new Map<number, number>();
  const label = new Map<number, string>();
  const hits = new Map<number, number>();
  for (const oid of [...want].sort((x, y) => x - y)) {
    const id = d.rk?.get(oid);
    if (!id) { unknown += 1; continue; }
    label.set(oid, `${id.no} ${id.work}`.trim() || (id.des != null ? String(id.des) : String(oid)));
    let to: number | null | undefined = id.des != null ? byDes.get(id.des) : undefined;
    if (to == null) { const k = nw(id.no, id.work); to = k ? byNw.get(k) : undefined; }
    if (to != null) { cand.set(oid, to); hits.set(to, (hits.get(to) ?? 0) + 1); }
  }
  for (const [oid, lb] of label) {
    const to = cand.get(oid);
    if (to != null && hits.get(to) === 1) map.set(oid, to);
    else lost.push(lb);
  }
  return { map, lost, unknown };
}

/* ══════════════ Гибрид логик цаг · хэсэгчилсэн цэвэрлэлт (2026-10-04 аудит) ══════════════ */

/**
 * НООРОГТ ХАРАГДСАН ХАМГИЙН ИХ АГШИН — `t` · `cleared` · нүдний `at` · tombstone.
 * ⚠️ HLC-ийн «харсан дээд» (`hlcNext`): бичигчийн `Date.now()` цагийн зөрүүтэй (хоцорсон)
 *    машинд бусдын нүднээс БАГА `at` авч, нийлүүлэлтэд (шинэ `at` ялна) шинэ засвар нь
 *    хуучинд ялагдаж, tombstone нь хуучин нүдийг хаяж чаддаггүй байв.
 */
export function maxStamp(d: HDDraft | null | undefined): number {
  if (!d) return 0;
  let m = Math.max(d.t || 0, d.cleared ?? 0);
  for (const e of d.entries.values()) if (e.at > m) m = e.at;
  for (const a of d.del.values()) if (a > m) m = a;
  return m;
}

/**
 * ГИБРИД ЛОГИК ЦАГ (HLC) — дараагийн агшин = max(одоо, харсан дээд + 1).
 * ⚠️ Үр дүн нь харсан бүх агшнаас ХАТУУ ИХ — tombstone (`d > e.at`) харсан нүдээ заавал
 *    хаана, шинэ засвар харсан нүднээс заавал ялна. Цаг нь урагшаа зөрсөн машины `at`
 *    бусдыг өөрийн дээр «чирнэ» — HLC-ийн хүлээн зөвшөөрсөн зан (дараалал хадгалагдана).
 */
export const hlcNext = (seen: number, now = Date.now()): number => Math.max(now, Math.floor(seen) + 1);

/**
 * `cleared`-ЭЭС ӨМНӨХ НҮДИЙГ ХАСНА — нүд тус бүрээр (`at <= cleared`). Tombstone хэвээр.
 * ⚠️ Сэргээхэд ЛОКАЛ хуулбарт л хэрэглэнэ — алсын мөр өөрөө эх сурвалж (2026-10-04).
 */
export function dropCleared(d: HDDraft, cleared: number): HDDraft {
  if (!cleared) return d;
  const entries: HDEntries = new Map();
  for (const [k, e] of d.entries) if (e.at > cleared) entries.set(k, e);
  return { ...d, entries, cleared: Math.max(d.cleared ?? 0, cleared) };
}

/**
 * ХЭСЭГЧИЛСЭН ЦЭВЭРЛЭЛТ (2026-10-04 аудит) — ЗӨВХӨН `keys`-ийн нүдэнд tombstone (`түлхүүр →
 * агшин`), `cleared` = `ts`. Илгээх (`keys` = илгээлтэд ОРСОН нүд) ба «Ноорог хаях» (`keys` =
 * дэлгэц дээрх нүд) хоёулаа үүгээр.
 * ⚠️ Урьд нь бүх нүдийг tombstone болгож алсыг blind overwrite хийдэг байсан тул илгээлтэд
 *    ОРООГҮЙ (сүүлийн 3 с-д хамтрагчийн нэмсэн) нүд устдаг байв. Одоо tombstone-оос ШИНЭ
 *    `at`-тай нүд (`at >= tombstone`) ба жагсаалтад ороогүй нүд хэвээр үлдэнэ.
 * ⚠️ Оролтыг өөрчлөхгүй; давтан хэрэглэхэд идемпотент.
 */
export function applyClear(d: HDDraft, keys: ReadonlyMap<string, number>, ts: number): HDDraft {
  const del = new Map(d.del);
  for (const [k, a] of keys) if ((del.get(k) ?? -1) < a) del.set(k, a);
  const entries: HDEntries = new Map();
  for (const [k, e] of d.entries) {
    const x = del.get(k);
    if (x != null && x > e.at) continue;
    entries.set(k, e);
    del.delete(k);
  }
  return { ...d, entries, del, cleared: Math.max(d.cleared ?? 0, ts) };
}

/**
 * ХҮЛЭЭГДЭЖ БУЙ ЦЭВЭРЛЭЛТИЙН ТЭМДЭГ (2026-10-04 аудит, localStorage) — илгээсний/хаясны
 * дараах алсын цэвэрлэлт унасан бол дахин оролдох хүртэл хадгална.
 * ⚠️ Урьд нь унасан цэвэрлэлт ДАХИН оролдогддоггүй тул буцаагдахад хуучин ноорог алсаас
 *    сэргэж, буцаагдсан саналын автомат буулгалтыг (`dirtyN > 0`) хаадаг байв.
 */
export type HDClearMark = { ts: number; keys: Map<string, number> };
export const hdClearMarkKey = (key: string) => `selbe-huvaari-clear:${key}`;
export const serializeMark = (m: HDClearMark): string => JSON.stringify({ ts: m.ts, keys: [...m.keys] });
export function parseMark(s: string | null | undefined): HDClearMark | null {
  if (!s) return null;
  try {
    const w = JSON.parse(s) as { ts?: unknown; keys?: unknown };
    const ts = ms(w?.ts);
    if (ts == null || !Array.isArray(w.keys)) return null;
    const keys = new Map<string, number>();
    for (const x of w.keys) {
      if (!Array.isArray(x) || typeof x[0] !== 'string' || !parseKey(x[0])) continue;
      const a = ms(x[1]);
      if (a != null) keys.set(x[0], a);
    }
    return { ts, keys };
  } catch { return null; }
}
/** Хоёр тэмдэг → нэг: түлхүүр бүрт ИХ агшин, `ts` ИХ нь */
export function mergeMark(a: HDClearMark | null, b: HDClearMark | null): HDClearMark | null {
  if (!a) return b;
  if (!b) return a;
  const keys = new Map(a.keys);
  for (const [k, t] of b.keys) if ((keys.get(k) ?? -1) < t) keys.set(k, t);
  return { ts: Math.max(a.ts, b.ts), keys };
}
/**
 * Ноорог тэмдгийг БҮРЭН агуулсан эсэх — алсад бичигдсэн бол тэмдгийг арилгаж болно.
 * ⚠️ Нүд АЛГА бол хангалттай (tombstone 7 хоногт арилдаг; хуучин хуулбарыг `cleared` хаана).
 */
export function coversMark(d: HDDraft | null, m: HDClearMark): boolean {
  if (!d || (d.cleared ?? 0) < m.ts) return false;
  for (const [k, t] of m.keys) {
    const e = d.entries.get(k);
    if (e && e.at < t) return false;
  }
  return true;
}

/** Ноорогт нүд бичсэн ЯЛГААТАЙ хэрэглэгчид — толгойн «ноорогт: …» жагсаалт */
export function users(d: HDDraft | null): string[] {
  if (!d) return [];
  const s = new Set<string>();
  for (const e of d.entries.values()) if (e.user) s.add(e.user);
  return [...s].sort();
}

export const isEmpty = (d: HDDraft | null): boolean => !d || d.entries.size === 0;
