/**
 * УЯЛДАА ХОЛБООС — «Хуваарь»-ийн ажил хоорондын хамаарлын цэвэр логик.
 * React-гүй, сүлжээгүй — тиймээс тестлэгдэнэ (`deps.check.mjs`).
 *
 * ⚠️ ДҮРЭМ БИШ, ЧАДВАР (2026-09-03, хэрэглэгчийн шийдвэр): хуваарь дээр ямар ч
 * албадлага байхгүй — уялдаа тавих эсэх, огноо тааруулах эсэх бүгд хүний
 * сонголт. Уялдаа ТАВЬСАН үед л энэ модуль ажиллана: урд ажил хөдлөхөд
 * хамаарагчид нь гинжээр (урагш ч, хойш ч) дагаж шилжинэ. Хамаарагчийг
 * өөрийг нь чирэхийг ХОРИГЛОХГҮЙ — зөрчил үүсвэл зөвхөн зөөлөн тэмдэглэнэ.
 * Цор ганц хатуу зүйл бол ДУГУЙ хамаарал: бодолт өөрөө боломжгүй тул
 * `reaches`-ээр урьдчилан таслана.
 *
 * ⚠️ БИЧИГЛЭЛ (үйлчилгээний `Hamaaral` талбар, MS Project-ийн хэлбэр):
 *     «18FS3,22SS-5» — код + төрөл + хоцролт, таслалаар олон.
 *   · код   = `Des_dugaar` (жаазан дотор давтагдашгүй 1…N)
 *   · FS    = урд ажил ДУУСМАГЦ; хоцролт 0 бол ДАРААГИЙН өдөр эхэлнэ
 *   · SS    = урд ажил ЭХЛЭХТЭЙ зэрэг; хоцролт нь эхэлснээс хойших хоног
 *   · хоцролт сөрөг байж болно (давхцаж эхлэх)
 *
 * ⚠️ ОГНООНЫ КОНВЕНЦ: `Span` нь хоёр захаа ОРУУЛСАН хуанлийн хоног (plan.ts).
 * Тиймээс FS-ийн «дуусмагц эхлэх» = `end + (1 + lag) хоног`: 10-21-нд дууссан
 * бол 10-22-нд эхэлнэ — MPP-ийн жишээтэй яг таарна (18FS: 25.10.21 → 25.10.22).
 *
 * ⚠️ БОДОЛТ БЛОК БҮРДЭЭ: 5/1 блокийн Хана нь 5/1 блокийн Рамаас. Урд ажил
 * тухайн блокт огноогүй бол ТЭР БЛОКИЙГ АЛГАСНА — хамаарагчийн огноо
 * хөндөгдөхгүй (хэрэглэгч: «шинээр огноо тавина, тэгээд уялдаа хийнэ»).
 */
import { DAY, spanDays, type PlanRow, type Span } from './plan';

export type DepType = 'FS' | 'SS';
export type Dep = { code: number; type: DepType; lag: number };

/* ══════════════════ Бичиглэл ══════════════════ */

const TOKEN = /^(\d+)\s*(FS|SS)\s*(-?\d+)?$/;

/**
 * «18FS3,22SS-5» → Dep[]. Эвдэрсэн токеныг АЛГАСНА, унагахгүй — талбарыг
 * гараар зассан байж болох ба нэг муу токен бүх хуудсыг унагаж болохгүй.
 */
export function parseDeps(text: string | null | undefined): Dep[] {
  if (!text) return [];
  const out: Dep[] = [];
  for (const tok of String(text).split(',')) {
    const m = TOKEN.exec(tok.trim().toUpperCase());
    if (!m) continue;
    out.push({ code: Number(m[1]), type: m[2] as DepType, lag: m[3] ? Number(m[3]) : 0 });
  }
  return out;
}

/** Dep[] → «18FS3,22SS-5». Хоосон бол `''` — хадгалахдаа `null` болгоно. */
export function formatDeps(deps: Dep[]): string {
  return deps.map((d) => `${d.code}${d.type}${d.lag ? d.lag : ''}`).join(',');
}

/**
 * ТАНИГДААГҮЙ токенууд — задлагдаагүй ч УСТГАЖ болохгүй хэсэг.
 * ⚠️ 2026-09-03-ны review: талбарт гараар «5FF2» гэх мэт (энд дэмжигдээгүй
 * MS Project бичиглэл) орсон байхад popup-аар өөр уялдаа нэмээд хадгалбал
 * тэр токен ЧИМЭЭГҮЙ устаж байв. Одоо бичихдээ: танигдаагүйгээ хэвээр нь
 * угтуулж залгана — харж чадахгүй ч устгахгүй.
 */
export function residualDeps(text: string | null | undefined): string[] {
  if (!text) return [];
  return String(text)
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && !TOKEN.test(t.toUpperCase()));
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

/** `gi` бүлгийн доорх бүх НАВЧ мөрийн индексүүд (дам хүүхдүүдийг оруулаад). */
export function leafChildren(rows: PlanRow[], gi: number): number[] {
  const out: number[] = [];
  const d0 = rows[gi].depth;
  for (let i = gi + 1; i < rows.length && rows[i].depth > d0; i++) {
    if (!rows[i].group) out.push(i);
  }
  return out;
}

/**
 * Блок `b` дэх ҮР ДҮНТЭЙ муж. Навч мөрд — өөрийнх нь. Бүлэгт — өөрийн муж
 * (`own` нь `agg`-аас давамгайлдаг `computeAll`-ийн дүрэмтэй ижил), байхгүй
 * бол навч хүүхдүүдийн MIN эхлэх / MAX дуусах.
 */
export function effSpan(
  rows: PlanRow[],
  i: number,
  b: number,
  spansOf: (i: number) => (Span | null)[] = (k) => rows[k].spans,
): Span | null {
  const own = spansOf(i)[b] ?? null;
  if (own || !rows[i].group) return own;
  let a: number | null = null;
  let z: number | null = null;
  for (const c of leafChildren(rows, i)) {
    const s = spansOf(c)[b];
    if (!s) continue;
    if (a == null || s.start < a) a = s.start;
    if (z == null || s.end > z) z = s.end;
  }
  return a == null || z == null ? null : { start: a, end: z };
}

/**
 * ⚠️ ШАТЛАЛЫН ХАМААТАН — нэг нь нөгөөгийнхөө өвөг (эсвэл өөрөө) юу.
 *
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
  for (const d of rows[i].deps) {
    const pi = byCode.get(d.code);
    /* ⚠️ Өвөг/удам хамаатныг АЛГАСНА — гинжин эргэлтийн эсрэг (hierRelated) */
    if (pi == null || hierRelated(rows, i, pi)) continue;
    const ps = effSpan(rows, pi, b, spansOf);
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
  _byCode: Map<number, number>,
  fromCode: number,
  toCode: number,
): boolean {
  if (fromCode === toCode) return true;
  /* урьдчилагч-код → түүнээс хамаарах мөрүүд */
  const dependents = new Map<number, number[]>();
  rows.forEach((r, i) => {
    for (const d of r.deps) {
      if (!dependents.has(d.code)) dependents.set(d.code, []);
      dependents.get(d.code)!.push(i);
    }
  });
  const seen = new Set<number>([fromCode]);
  const q = [fromCode];
  while (q.length) {
    const c = q.pop()!;
    for (const i of dependents.get(c) ?? []) {
      const rc = rows[i].des;
      if (rc == null || seen.has(rc)) continue;
      if (rc === toCode) return true;
      seen.add(rc);
      q.push(rc);
    }
  }
  return false;
}

/**
 * `code`-оос ДАМ хамаардаг бүх ажлын код (өөрийг нь ОРУУЛААД) — урьдчилагчийн
 * нэр дэвшигчдээс хасахад: эдгээрийн аль нэгийг сонговол дугуй хамаарал үүснэ.
 */
export function downstreamCodes(rows: PlanRow[], code: number): Set<number> {
  const dependents = new Map<number, number[]>();
  rows.forEach((r, i) => {
    for (const d of r.deps) {
      if (!dependents.has(d.code)) dependents.set(d.code, []);
      dependents.get(d.code)!.push(i);
    }
  });
  const out = new Set<number>([code]);
  const q = [code];
  while (q.length) {
    const c = q.pop()!;
    for (const i of dependents.get(c) ?? []) {
      const rc = rows[i].des;
      if (rc == null || out.has(rc)) continue;
      out.add(rc);
      q.push(rc);
    }
  }
  return out;
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
 * ⚠️ НЯГТ ГИНЖ: хамаарагчийн эхлэх нь шаардлагатай огноо руу ЯГ шилжинэ —
 * урд ажил урагшилбал татна, хойшилбол түлхэнэ. Үргэлжлэх хугацаа хадгалагдана.
 *
 * ⚠️ ОГНОО ҮҮСГЭХГҮЙ: мужгүй блокт хугацаа нь мэдэгдэхгүй тул муж зохиохгүй.
 *
 * ⚠️ ХАВЧУУЛАХГҮЙ: гинжний шилжилт бүлгийн мужаас хальж болно — чимээгүй
 * хавчих нь уялдааг худал болгоно. Зөрчлийг дэлгэц зөөлөн тэмдэглэнэ.
 *
 * ⚠️ Хадгалагдсан өгөгдөлд дугуй хамаарал байвал (UI таслана, гэхдээ талбарыг
 * гаднаас засаж болно) мөр бүрийн боловсруулалтын тоог хязгаарлаж гацахгүй.
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
  const enqueue = (i: number) => {
    const c0 = rows[i].des;
    if (c0 != null) q.push(c0);
    for (let k = i - 1, d = rows[i].depth; k >= 0; k--) {
      if (rows[k].depth < d && rows[k].group) {
        d = rows[k].depth;
        const c = rows[k].des;
        if (c != null) q.push(c);
      }
    }
  };

  /** Нэг мөрийг урьдчилагчдаас нь дахин бодно. Өөрчлөгдвөл true. */
  const recompute = (i: number): boolean => {
    const r = rows[i];
    if (!r.deps.length) return false;
    let changed = false;
    if (r.group) {
      /* Бүлэг хамаарагч: блок бүрд зөрүүг бодож ДЭД МОДЫГ БҮХЭЛД НЬ жигд
         шилжүүлнэ — навч төдийгүй ДОТОРХ ДЭД БҮЛГИЙН ӨӨРИЙН мужийг ч.
         ⚠️ 2026-09-03-ны review: урьд нь зөвхөн навчийг шилжүүлдэг байсан
         тул дэд бүлгийн `own` муж хуучин байранд «гацаж», own нь agg-аас
         давамгайлдаг тул тэр дэд бүлгээс хамаарагчид ЧИМЭЭГҮЙ хөдлөхгүй
         үлддэг байв. */
      const d0 = r.depth;
      const sub: number[] = [i];
      for (let k = i + 1; k < rows.length && rows[k].depth > d0; k++) sub.push(k);
      for (let b = 0; b < nBlocks; b++) {
        const req = requiredStart(rows, byCode, i, b, spansOf);
        if (req == null) continue;
        const eff = effSpan(rows, i, b, spansOf);
        if (!eff || eff.start === req) continue;
        const delta = req - eff.start;
        for (const k of sub) {
          const sp = spansOf(k)[b];
          if (!sp) continue;
          const next = spansOf(k).slice();
          next[b] = { start: sp.start + delta, end: sp.end + delta };
          out.set(k, next);
        }
        changed = true;
      }
      if (changed) for (const k of sub) enqueue(k);
      return changed;
    }
    for (let b = 0; b < nBlocks; b++) {
      const req = requiredStart(rows, byCode, i, b, spansOf);
      if (req == null) continue;
      const own = spansOf(i)[b];
      if (!own || own.start === req) continue;
      const next = spansOf(i).slice();
      next[b] = { start: req, end: req + (spanDays(own) - 1) * DAY };
      out.set(i, next);
      changed = true;
    }
    if (changed) enqueue(i);
    return changed;
  };

  for (const [i] of overrides) enqueue(i);
  for (const i of recalc) if (recompute(i)) { /* enqueue нь recompute дотор */ }

  /* ⚠️ Гацалтын хаалт: мөр бүр дээд тал нь 20 удаа. Олон урьдчилагчтай
     ромбо хэлбэрийн зөв гинжид мөр хэд хэдэн давалгаагаар бодогддог тул
     хэт бага тавьж болохгүй; хадгалагдсан дугуй хамаарал (UI таслана,
     гэхдээ талбарыг гаднаас засаж болно) ч төгсгөлгүй эргэхгүй. */
  const passes = new Map<number, number>();
  while (q.length) {
    const code = q.shift()!;
    for (const i of dependents.get(code) ?? []) {
      const n = (passes.get(i) ?? 0) + 1;
      if (n > 20) continue;
      passes.set(i, n);
      recompute(i);
    }
  }
  return out;
}
