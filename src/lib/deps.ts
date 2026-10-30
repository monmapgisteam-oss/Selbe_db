/**
 * УЯЛДАА ХОЛБООС — «Хуваарь»-ийн ажил хоорондын хамаарлын цэвэр логик.
 * React-гүй, сүлжээгүй — тиймээс тестлэгдэнэ (`deps.check.mjs`).
 */
import { DAY, spanDays, type PlanRow, type Span } from './plan';

export type DepType = 'FS' | 'SS';
export type Dep = { code: number; type: DepType; lag: number; blk?: number; src?: number };

/** Уялдааны ЯЛГАХ ТЭМДЭГ — (код, блок[, эх блок]). Блокгүй = `'11@'`; блок хоорондын = `'11@1<0'` (2026-10-09) */
export const depId = (d: Pick<Dep, 'code' | 'blk'> & { src?: number }): string =>
  `${d.code}@${d.blk ?? ''}${d.src != null ? `<${d.src}` : ''}`;
/** Хоёр уялдаа нэг зүйлийг заана уу (код + блок + эх блок, 2026-10-09: `src` нэмэгдэв — өгөөгүй = ижил блок) */
export const sameDep = (a: Pick<Dep, 'code' | 'blk'> & { src?: number }, b: Pick<Dep, 'code' | 'blk'> & { src?: number }): boolean =>
  a.code === b.code && (a.blk ?? null) === (b.blk ?? null) && (a.src ?? null) === (b.src ?? null);
/** `b` блокт ҮЙЛЧЛЭХ уялдаанууд — блокгүй + яг энэ блокийнх */
export const depsInBlock = (deps: readonly Dep[], b: number): Dep[] =>
  deps.filter((d) => d.blk == null || d.blk === b);

/* ══════════════════ Бичиглэл ══════════════════ */

const TOKEN = /^(\d+)\s*(FS|SS)\s*([+-]?\d+)?\s*(?:@\s*(\d+)(?:\s*>\s*(\d+))?)?$/;

/**
 * «18FS3,22SS-5» → Dep[]. Эвдэрсэн токеныг АЛГАСНА, унагахгүй — талбарыг
 * гараар зассан байж болох ба нэг муу токен бүх хуудсыг унагаж болохгүй.
 */
export function parseDeps(text: string | null | undefined): Dep[] {
  if (!text) return [];
  const out: Dep[] = [];
  for (const tok of String(text).split(',')) {
    const dep = tokenDep(tok);
    if (dep) out.push(dep);
  }
  return out;
}

/**
 * Нэг токен → Dep, танигдахгүй бол `null`.
 */
function tokenDep(tok: string): Dep | null {
  const m = TOKEN.exec(tok.trim().toUpperCase());
  if (!m) return null;
  const dep: Dep = { code: Number(m[1]), type: m[2] as DepType, lag: m[3] ? Number(m[3]) : 0 };
  if (m[4] != null) {
    const bn = Number(m[4]);
    if (!(bn >= 1)) return null;
    if (m[5] != null) {
      const tb = Number(m[5]);
      if (!(tb >= 1)) return null;
      dep.blk = tb - 1;
      if (bn !== tb) dep.src = bn - 1;
    } else dep.blk = bn - 1;
  }
  return dep;
}

/** Dep[] → «18FS3,22SS-5». Хоосон бол `''` — хадгалахдаа `null` болгоно. */
export function formatDeps(deps: Dep[]): string {
  return deps.map((d) => {
    const at = d.blk == null ? ''
      : d.src != null && d.src !== d.blk ? `@${d.src + 1}>${d.blk + 1}`
      : `@${d.blk + 1}`;
    return `${d.code}${d.type}${d.lag ? d.lag : ''}${at}`;
  }).join(',');
}

/**
 * ТАНИГДААГҮЙ токенууд — задлагдаагүй ч УСТГАЖ болохгүй хэсэг.
 */
export function residualDeps(text: string | null | undefined): string[] {
  if (!text) return [];
  return String(text)
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && !tokenDep(t));
}

/* ══════════════════ Модны туслахууд ══════════════════ */

/** Ажлын код → мөрийн индекс. Кодгүй мөр орохгүй; давхардвал ЭХНИЙХ нь. */
export function codeIndex(rows: PlanRow[]): Map<number, number> {
  const m = new Map<number, number>();
  rows.forEach((r, i) => {
    if (r.des != null && !m.has(r.des)) m.set(r.des, i);
  });
  return m;
}

const SANE_LO = Date.UTC(2000, 0, 1);
const SANE_HI = Date.UTC(2100, 0, 1);
const saneSpan = (s: Span | null | undefined): s is Span => !!s
  && s.start >= SANE_LO && s.start <= SANE_HI && s.end >= SANE_LO && s.end <= SANE_HI;

/**
 * `gi` бүлгийн доорх ХҮҮХДҮҮДИЙН MIN эхлэх / MAX дуусах (блок `b`). Хүүхэд бүр
 * `effSpan`-аараа оролцоно: навч — өөрийнх нь, дэд бүлэг — `effSpan(дэд бүлэг)`
 * (огноотой навчтай бол тэдний MIN/MAX, үгүй бол өөрийн огноо). Хүүхэд огт
 * хуваарьгүй бол `null`.
 */
function childAgg(
  rows: PlanRow[],
  gi: number,
  b: number,
  spansOf: (i: number) => (Span | null)[],
): Span | null {
  let a: number | null = null;
  let z: number | null = null;
  const d0 = rows[gi].depth;
  for (let i = gi + 1; i < rows.length && rows[i].depth > d0;) {
    const s = effSpan(rows, i, b, spansOf);
    if (saneSpan(s)) {
      if (a == null || s.start < a) a = s.start;
      if (z == null || s.end > z) z = s.end;
    }
    /* Дэд бүлгийн дам хүүхдүүд дээрх `effSpan`-д аль хэдийн орсон — алгасна.
       Навчны доорх (гүн нь их) мөрүүдийг алгасахгүй: урьдын `leafChildren` шиг
       тэд ч хүүхдээр тоологдоно. */
    if (rows[i].group) {
      const di = rows[i].depth;
      i++;
      while (i < rows.length && rows[i].depth > di) i++;
    } else i++;
  }
  return a == null || z == null ? null : { start: a, end: z };
}

/**
 * Блок `b` дэх ҮР ДҮНТЭЙ муж. Навч мөрд — өөрийнх нь.
 */
export function effSpan(
  rows: PlanRow[],
  i: number,
  b: number,
  spansOf: (i: number) => (Span | null)[] = (k) => rows[k].spans,
): Span | null {
  const own = spansOf(i)[b] ?? null;
  if (!rows[i].group) return own;
  return childAgg(rows, i, b, spansOf) ?? own;
}

/**
 * БҮЛГИЙН МУЖИЙГ ХҮҮХДҮҮДЭЭС НЬ ДЭЭШ НЭГТГЭНЭ.
 *
 * @param baseSpansOf мөрийн СЕРВЕРИЙН (ноороггүй) муж — `Huvaari.applyChanges` `base`-ээс өгнө;
 *   өгөөгүй бол `rows`-ын мужтай тулгана (`payload.ts`: тэнд `rows` нь өөрөө серверийн мөр).
 * @returns `ch`-ийн ХУУЛБАР дээр бүлгийн мөрүүдийг нэмсэн шинэ Map.
 */
export function rollUpGroups(
  rows: PlanRow[],
  n: number,
  ch: Map<number, (Span | null)[]>,
  baseSpansOf?: (i: number) => (Span | null)[],
): Map<number, (Span | null)[]> {
  if (!ch.size) return ch;
  const out = new Map(ch);
  const spansOf = (i: number) => out.get(i) ?? rows[i].spans;
  /* Хөндөгдсөн мөр бүрийн БҮХ өвөг бүлэг (гүн буурах дарааллаар дээшилнэ) */
  const groups = new Set<number>();
  for (const i of ch.keys()) {
    let d = rows[i].depth;
    for (let k = i - 1; k >= 0 && d > 0; k--) {
      if (rows[k].depth < d && rows[k].group) { groups.add(k); d = rows[k].depth; }
    }
  }
  for (const gi of [...groups].sort((a, b) => b - a)) {
    const cur = spansOf(gi);
    const next = cur.slice();
    let moved = false;
    for (let b = 0; b < n; b++) {
      const ag = childAgg(rows, gi, b, spansOf);
      const a = ag?.start ?? null;
      const z = ag?.end ?? null;
      if (a == null || z == null) {
        const ov = cur[b] ?? null;
        if (!ov) continue;
        const pg = childAgg(rows, gi, b, (k) => rows[k].spans);
        const pa = pg?.start ?? null;
        const pz = pg?.end ?? null;
        if (pa == null || pz == null || ov.start !== pa || ov.end !== pz) continue;
        if (baseSpansOf) {
          const bv = baseSpansOf(gi)[b] ?? null;
          const bg = childAgg(rows, gi, b, baseSpansOf);
          const ghost = !bv || (!!bg && bv.start === bg.start && bv.end === bg.end);
          const want = ghost ? null : bv;
          if (!want || want.start !== ov.start || want.end !== ov.end) { next[b] = want; moved = true; }
          continue;
        }
        next[b] = null; moved = true;
        continue;
      }
      const nv: Span = { start: a, end: z };
      const ov = cur[b] ?? null;
      const same = (!nv && !ov)
        || (!!nv && !!ov && nv.start === ov.start && nv.end === ov.end);
      if (!same) { next[b] = nv; moved = true; }
    }
    if (moved) out.set(gi, next);
  }
  return out;
}

/**
 * Ийм хосын хооронд уялдаа ХЭЗЭЭ Ч үйлчлэхгүй: бүлгийн үр дүнтэй муж нь
 * хүүхдүүдээсээ бодогддог тул «хүүхэд нь эцгээсээ хамаарна» гэвэл хүүхдийг
 * шилжүүлэх бүрд эцгийн муж сунаж, шаардлага дахин өсөх ГИНЖИН ЭРГЭЛТ үүснэ —
 * 2026-09-03-ны review-д мөр 10..15 → 141..146 болтлоо «шатаар гүйсэн» нь
 * батлагдсан. Дугуй хамаарлын шалгалт (`reaches`) үүнийг барьдаггүй: агуулалт
 * нь уялдааны ирмэг биш. Тиймээс UI шүүлтээс гадна ЭНД — бодолтын түвшинд —
 * таслана: гараар зассан талбар ч гэсэн эргэлт үүсгэж чадахгүй.
 */
export function hierRelated(rows: PlanRow[], i: number, j: number): boolean {
  if (i === j) return true;
  const [a, b] = i < j ? [i, j] : [j, i];
  if (!rows[a].group) return false;
  const d0 = rows[a].depth;
  for (let k = a + 1; k < rows.length && rows[k].depth > d0; k++) {
    if (k === b) return true;
  }
  return false;
}

/* ══════════════════ Шаардлагатай эхлэх огноо ══════════════════ */

/**
 * `i` мөрийн блок `b` дэх ШААРДЛАГАТАЙ эхлэх огноо — бүх урьдчилагчийн
 * шаардлагын ХАМГИЙН ХОЖУУ нь. Нэг ч урьдчилагч тухайн блокт огноогүй бол
 * `null` — «шаардлага алга», мөр хөндөгдөхгүй.
 */
export function requiredStart(
  rows: PlanRow[],
  byCode: Map<number, number>,
  i: number,
  b: number,
  spansOf: (i: number) => (Span | null)[] = (k) => rows[k].spans,
): number | null {
  let req: number | null = null;
  for (const d of depsInBlock(rows[i].deps, b)) {
    const pi = byCode.get(d.code);
    if (pi == null || hierRelated(rows, i, pi)) continue;
    const ps = effSpan(rows, pi, d.blk != null && d.src != null ? d.src : b, spansOf);
    if (!ps) continue;
    const t = d.type === 'FS' ? ps.end + (1 + d.lag) * DAY : ps.start + d.lag * DAY;
    if (req == null || t > req) req = t;
  }
  return req;
}

/* ══════════════════ Дугуй хамаарлын шалгалт ══════════════════ */

/**
 * `fromCode` ажлаас УРАГШАА (хамаарагчдын чиглэлд) `toCode` хүрэх үү.
 * «D нь P-ээс хамаарна» гэж нэмэхийн өмнө `reaches(rows, byCode, D, P)`
 * үнэн бол P аль хэдийн D-ээс (дам) хамаардаг — дугуй болно, тавиулахгүй.
 */
export function reaches(
  rows: PlanRow[],
  byCode: Map<number, number>,
  fromCode: number,
  toCode: number,
): boolean {
  if (fromCode === toCode) return true;
  return affectedCodes(rows, byCode, fromCode, toCode) === true;
}

/**
 * `code`-оос ДАМ хамаардаг бүх ажлын код (өөрийг нь ОРУУЛААД) — урьдчилагчийн
 * нэр дэвшигчдээс хасахад: эдгээрийн аль нэгийг сонговол дугуй хамаарал үүснэ.
 */
export function downstreamCodes(rows: PlanRow[], code: number): Set<number> {
  const out = affectedCodes(rows, codeIndex(rows), code);
  return out === true ? new Set<number>([code]) : out;
}

/**
 * `fromCode` мөр хөдлөхөд ҮР ДҮНТЭЙ МУЖ нь өөрчлөгдөж болох бүх код
 * (өөрийг нь оруулаад). `target` өгвөл түүнд хүрмэгц `true`.
 */
function affectedCodes(
  rows: PlanRow[],
  byCode: Map<number, number>,
  fromCode: number,
  target?: number,
): Set<number> | true {
  /* урьдчилагч-код → түүнээс хамаарах мөрүүд */
  const dependents = new Map<number, number[]>();
  rows.forEach((r, i) => {
    for (const d of r.deps) {
      if (!dependents.has(d.code)) dependents.set(d.code, []);
      dependents.get(d.code)!.push(i);
    }
  });
  /** Өвөг бүлгүүд — `propagate.enqueue`-ийн ижил хайлт (ойроос холруу) */
  const ancCache = new Map<number, number[]>();
  const ancestors = (i: number): number[] => {
    let a = ancCache.get(i);
    if (a) return a;
    a = [];
    for (let k = i - 1, d = rows[i].depth; k >= 0 && d > 0; k--) {
      if (rows[k].depth < d && rows[k].group) { a.push(k); d = rows[k].depth; }
    }
    ancCache.set(i, a);
    return a;
  };
  const codes = new Set<number>([fromCode]);
  const q: number[] = [fromCode];
  /** Код муж нь өөрчлөгдөх жагсаалтад — зорилтод хүрвэл `true` */
  const touch = (c: number | null): boolean => {
    if (c == null || codes.has(c)) return false;
    codes.add(c);
    q.push(c);
    return c === target;
  };
  const moved = new Set<number>();
  /** Мөр хөдлөв — өөрийн код + өвөг бүлгүүдийн код */
  const move = (i: number): boolean => {
    if (moved.has(i)) return false;
    moved.add(i);
    if (touch(rows[i].des)) return true;
    for (const a of ancestors(i)) if (touch(rows[a].des)) return true;
    return false;
  };
  /** Хамаарагч мөр шилжив — БҮЛЭГ бол дэд мод нь бүхэлдээ (`recompute`-ийн `sub`) */
  const shift = (j: number): boolean => {
    if (moved.has(j)) return false;
    if (move(j)) return true;
    if (!rows[j].group) return false;
    const d0 = rows[j].depth;
    for (let k = j + 1; k < rows.length && rows[k].depth > d0; k++) if (move(k)) return true;
    return false;
  };
  /* Эхлэл: уялдаа нь өөрчлөгдөж буй мөр өөрөө шилжинэ (бүлэг бол дэд модтой нь) */
  const si = byCode.get(fromCode);
  if (si != null && shift(si)) return true;
  while (q.length) {
    const c = q.pop()!;
    for (const j of dependents.get(c) ?? []) if (shift(j)) return true;
  }
  return codes;
}

/* ══════════════════ Гинжин бодолт ══════════════════ */

/**
 * ГИНЖ — өөрчлөлтийг уялдаагаар дамжуулан тархаана.
 *
 * `overrides` — сая өөрчлөгдсөн мөрүүдийн ШИНЭ мужууд (жиш. чирж буй мөр).
 * `recalc`    — өөрийн огноог урьдчилагчдаасаа ДАХИН бодох мөрүүд (жиш. сая
 *               уялдаа нь өөрчлөгдсөн мөр).
 *
 * Буцаана: индекс → шинэ мужууд (overrides-ыг ОРУУЛААД) — эх мөрүүдийг
 * хөндөхгүй, дуудагч нь ноорогтоо нэг дор бичнэ.
 *
 * ЗАЙ ХАДГАЛАГДАНА (2026-10-30, хэрэглэгч: «урд ажил хойшлоход хойд ажил мөн хойшлоно, урагшлахад урагшилна; бүлэг ч
 * адил»): хамаарагч нь шаардлагын ӨӨРЧЛӨЛТИЙН хэмжээгээр (`шинэ шаардлага − хуучин шаардлага`) шилжинэ — урьд нь яг
 * шаардлага руу «наалддаг» байсан тул санаатай үлдээсэн зай устаж, урд ажил хойшлоход хойд ажил урагш татагддаг байв.
 * Шаардлага өөрчлөгдөөгүй бол хөдлөхгүй (хүн зөвшөөрсөн давхцал ч хэвээр). Урьд нь хязгааргүй байсан мөр шинээр
 * хязгаарлагдвал зөрчилтэй үед л шаардлага хүртэл түлхэнэ. `recalc` (сая уялдаа нэмэгдсэн) мөр урьдын адил шаардлагад
 * тааруулна.
 */
export function propagate(
  rows: PlanRow[],
  nBlocks: number,
  overrides: Map<number, (Span | null)[]>,
  recalc: number[] = [],
): Map<number, (Span | null)[]> {
  const out = new Map<number, (Span | null)[]>(overrides);
  const spansOf = (i: number) => out.get(i) ?? rows[i].spans;
  const byCode = codeIndex(rows);
  const pinned = new Map<number, Set<number>>();
  for (const [i, sp] of overrides) {
    const r0 = rows[i]?.spans ?? [];
    const set = new Set<number>();
    for (let b = 0; b < nBlocks; b++) {
      const a = sp[b] ?? null;
      const o = r0[b] ?? null;
      if ((a?.start ?? null) !== (o?.start ?? null) || (a?.end ?? null) !== (o?.end ?? null)) set.add(b);
    }
    if (set.size) pinned.set(i, set);
  }

  /* урьдчилагч-код → хамаарагч мөрүүд */
  const dependents = new Map<number, number[]>();
  rows.forEach((r, i) => {
    for (const d of r.deps) {
      if (!dependents.has(d.code)) dependents.set(d.code, []);
      dependents.get(d.code)!.push(i);
    }
  });

  /** Мөр шилжсэний дараа: өөрийнх нь код + бүх дээд бүлгийн кодыг дараалалд —
      бүлгийн үр дүнтэй муж хүүхдээсээ болж өөрчлөгддөг тул түүнээс хамаарах
      ажлууд ч дахин бодогдох ёстой. */
  const q: number[] = [];
  const pending = new Set<number>();
  const push = (c: number | null | undefined) => {
    if (c == null || pending.has(c)) return;
    pending.add(c);
    q.push(c);
  };
  const enqueue = (i: number) => {
    push(rows[i].des);
    for (let k = i - 1, d = rows[i].depth; k >= 0 && d > 0; k--) {
      if (rows[k].depth < d && rows[k].group) {
        d = rows[k].depth;
        push(rows[k].des);
      }
    }
  };

  /**
   * Нэг мөрийг урьдчилагчдаас нь дахин бодно. Өөрчлөгдвөл true.
   */
  const rowQ: number[] = [];
  const rowPending = new Set<number>();
  const pushRow = (k: number) => {
    if (rowPending.has(k)) return;
    rowPending.add(k);
    rowQ.push(k);
  };
  const recompute = (i: number, all = false): boolean => {
    const r = rows[i];
    if (!r.deps.length) return false;
    /**
     * Шаардлагын ӨӨРЧЛӨЛТӨӨР зорилтот эхлэл (`cur` — одоогийн эхлэл, `orig` — эх эхлэл): шинэ уялдаа (`all`) бол яг
     * шаардлага; хуучин шаардлага/муж байхгүй бол зөрчилтэй үед л шаардлага; эс бөгөөс эх эхлэл + (шинэ − хуучин шаардлага).
     * `null` = хөндөхгүй.
     */
    const target = (b: number, req: number, cur: number, orig: number | null): number | null => {
      if (all) return req;
      const req0 = requiredStart(rows, byCode, i, b);
      if (req0 == null || orig == null) return cur < req ? req : null;
      return orig + (req - req0);
    };
    let changed = false;
    if (r.group) {
      /* Бүлэг хамаарагч: блок бүрд зөрүүг бодож ДЭД МОДЫГ БҮХЭЛД НЬ жигд
         шилжүүлнэ — навч төдийгүй ДОТОРХ ДЭД БҮЛГИЙН ӨӨРИЙН мужийг ч. */
      const d0 = r.depth;
      const sub: number[] = [i];
      for (let k = i + 1; k < rows.length && rows[k].depth > d0; k++) sub.push(k);
      for (let b = 0; b < nBlocks; b++) {
        if (pinned.get(i)?.has(b)) continue;
        const req = requiredStart(rows, byCode, i, b, spansOf);
        if (req == null) continue;
        const eff = effSpan(rows, i, b, spansOf);
        if (!eff) continue;
        const want = target(b, req, eff.start, effSpan(rows, i, b)?.start ?? null);
        if (want == null || eff.start === want) continue;
        const delta = want - eff.start;
        for (const k of sub) {
          const sp = spansOf(k)[b];
          if (!sp) continue;
          const next = spansOf(k).slice();
          next[b] = { start: sp.start + delta, end: sp.end + delta };
          out.set(k, next);
        }
        changed = true;
      }
      if (changed) {
        for (const k of sub) {
          enqueue(k);
          if (k !== i && rows[k].deps.length) pushRow(k);
        }
      }
      return changed;
    }
    for (let b = 0; b < nBlocks; b++) {
      if (pinned.get(i)?.has(b)) continue;
      const req = requiredStart(rows, byCode, i, b, spansOf);
      if (req == null) continue;
      const own = spansOf(i)[b];
      if (!own) continue;
      const want = target(b, req, own.start, rows[i].spans[b]?.start ?? null);
      if (want == null || own.start === want) continue;
      const next = spansOf(i).slice();
      next[b] = { start: want, end: want + (spanDays(own) - 1) * DAY };
      out.set(i, next);
      changed = true;
    }
    if (changed) enqueue(i);
    return changed;
  };

  for (const [i] of overrides) enqueue(i);
  for (const i of recalc) if (recompute(i, true)) { /* enqueue нь recompute дотор */ }

  const passes = new Map<number, number>();
  const run = (i: number) => {
    const n = (passes.get(i) ?? 0) + 1;
    if (n > 20) return;
    passes.set(i, n);
    recompute(i);
  };
  while (q.length || rowQ.length) {
    if (rowQ.length) {
      const k = rowQ.shift()!;
      rowPending.delete(k);
      run(k);
      continue;
    }
    const code = q.shift()!;
    pending.delete(code);
    for (const i of dependents.get(code) ?? []) run(i);
  }
  return out;
}
