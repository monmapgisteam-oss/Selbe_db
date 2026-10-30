/**
 * ХУВААРИЙН ШИНЖИЛГЭЭ (2026-10-29, хэрэглэгч: «асуудлын самбар · эгзэгтэй зам · батлагдсантай харьцуулах · нөөцийн
 * график · экспорт»). Цэвэр функцууд — сүлжээгүй, UI-гүй (`huvaari/AnalysisPanel.tsx` харуулна).
 */
import { DAY, spanDays, type PlanRow, type Span } from './plan';
import { codeIndex, depsInBlock, effSpan, hierRelated, requiredStart } from './deps';
import type { MonthRes } from './huvaariObyem';

/* ══════════════════ Эгзэгтэй зам ══════════════════ */

/**
 * ЭГЗЭГТЭЙ ЗАМ — идэвхтэй блок (`b`) дахь мужтай навч ажил бүрийн НӨӨЦ ХОНОГ (float): бусад ажлыг хойшлуулалгүйгээр
 * хэдэн хоног хоцорч болох. Арын дамжлага: ажил бүрийн хамгийн хожуу дуусах = төслийн (навчуудын) хамгийн хожуу дуусах,
 * хамаарагч бүрийн шаардлагаар багасна — FS: `LF_урд ≤ LS_хойд − (1+lag)`, SS: `LF_урд ≤ LS_хойд − lag + үргэлжлэх_урд`.
 * Бүлэгт заасан уялдааг (код нь бүлэг) бүлгийн доорх навчуудад хамаарна гэж үзнэ. Нөөц ≤ 0 = эгзэгтэй.
 * Буцаах утга — мөрийн индекс → нөөц хоног (мужгүй мөр ороогүй).
 */
export function criticalFloat(rows: readonly PlanRow[], b: number): Map<number, number> {
  const leaves: number[] = [];
  rows.forEach((r, i) => { if (!r.group && r.spans[b]) leaves.push(i); });
  const out = new Map<number, number>();
  if (!leaves.length) return out;
  const byCode = codeIndex(rows as PlanRow[]);
  /* код → тэр кодын навч ажлууд (бүлэг бол доорх навчууд) */
  const leafOf = (i: number): number[] => {
    if (!rows[i].group) return rows[i].spans[b] ? [i] : [];
    const res: number[] = [];
    for (let k = i + 1; k < rows.length && rows[k].depth > rows[i].depth; k++) if (!rows[k].group && rows[k].spans[b]) res.push(k);
    return res;
  };
  /* урд навч → [{ хойд навчууд (бүлэг бол бүгд — эхлэл нь тэдний хамгийн эрт), төрөл, lag }] */
  const succ = new Map<number, { js: number[]; type: 'FS' | 'SS'; lag: number }[]>();
  rows.forEach((r, j) => {
    if (!r.deps.length) return;
    const js = leafOf(j);
    if (!js.length) return;
    for (const d of depsInBlock(r.deps, b)) {
      /* Блок хоорондын уялдаа (өөр блокийн урд ажил) — энэ блокийн сүлжээнд хамаарахгүй */
      if (d.blk != null && d.src != null && d.src !== b) continue;
      const pi = byCode.get(d.code);
      if (pi == null || hierRelated(rows as PlanRow[], j, pi)) continue;
      let ps = leafOf(pi);
      /* SS бүлэг урдах — бүлгийн эхлэл = хамгийн эрт эхлэх навч; түүнийг л хязгаарлана */
      if (d.type === 'SS' && ps.length > 1) ps = [ps.reduce((a, c) => (rows[c].spans[b]!.start < rows[a].spans[b]!.start ? c : a))];
      for (const p of ps) {
        if (js.includes(p)) continue;
        const l = succ.get(p) ?? [];
        l.push({ js, type: d.type, lag: d.lag });
        succ.set(p, l);
      }
    }
  });
  const end = Math.max(...leaves.map((i) => rows[i].spans[b]!.end));
  const lf = new Map<number, number>(leaves.map((i) => [i, end]));
  const dur = (i: number) => (spanDays(rows[i].spans[b]!) - 1) * DAY;
  for (let pass = 0; pass < leaves.length + 2; pass++) {
    let moved = false;
    for (const p of leaves) {
      let v = end;
      for (const s of succ.get(p) ?? []) {
        /* Бүлэг хойдох — гинж бүлгийг БҮХЭЛД НЬ жигд шилжүүлдэг тул зөвшөөрөгдөх хоцрол = навчуудын хамгийн бага нөөц:
           хамгийн хожуу эхлэх = бүлгийн эхлэл + min(LS − эхлэл). Ганц навчид LS-тэй ижил. */
        const st = (j: number) => rows[j].spans[b]!.start;
        const ls = Math.min(...s.js.map(st)) + Math.min(...s.js.map((j) => lf.get(j)! - dur(j) - st(j)));
        const lim = s.type === 'FS' ? ls - (1 + s.lag) * DAY : ls - s.lag * DAY + dur(p);
        if (lim < v) v = lim;
      }
      if (v !== lf.get(p)) { lf.set(p, v); moved = true; }
    }
    if (!moved) break;
  }
  for (const i of leaves) out.set(i, Math.round((lf.get(i)! - rows[i].spans[b]!.end) / DAY));
  return out;
}

/* ══════════════════ Батлагдсантай харьцуулах ══════════════════ */

export type Delay = { i: number; start: number | null; end: number | null; was: Span | null; now: Span | null };

/**
 * БАТЛАГДСАН ↔ ОДООГИЙН — идэвхтэй блок дахь навч ажил бүрийн эхлэх/дуусах огнооны зөрүү (хоног, + = хойшилсон).
 * Хоёулаа мужтай үед л тоо; нэг талд алга бол `null` (шинээр төлөвлөсөн / арилгасан). Өөрчлөгдөөгүй мөр ороогүй.
 */
export function baselineDelays(base: readonly PlanRow[], now: readonly PlanRow[], b: number): Delay[] {
  const out: Delay[] = [];
  now.forEach((r, i) => {
    if (r.group) return;
    const was = base[i]?.spans[b] ?? null;
    const cur = r.spans[b] ?? null;
    if ((was?.start ?? null) === (cur?.start ?? null) && (was?.end ?? null) === (cur?.end ?? null)) return;
    out.push({
      i,
      start: was && cur ? Math.round((cur.start - was.start) / DAY) : null,
      end: was && cur ? Math.round((cur.end - was.end) / DAY) : null,
      was,
      now: cur,
    });
  });
  return out;
}

/* ══════════════════ Асуудлын жагсаалт ══════════════════ */

export type IssueKind = 'unbal' | 'dep' | 'geree' | 'nodate';
export type Issue = { kind: IssueKind; i: number; b: number; days?: number };

/**
 * АСУУДЛЫН ЖАГСААЛТ — идэвхтэй блок: (1) уялдааны зөрчил (шаардлагаас өмнө эхэлсэн — хэдэн хоногоор), (2) гэрээний
 * хугацаанаас гарсан, (3) обьёмтой атлаа огноогүй ажил; бүх блок: (4) сарын обьём нийт обьёмтой тэнцээгүй (`unbal` —
 * дуудагчийн `unbalRows`). Дараалал — мөрийн дарааллаар.
 */
export function planIssues(
  rows: readonly PlanRow[],
  b: number,
  opts: { unbal?: ReadonlyMap<number, readonly number[]>; geree?: (i: number) => Span | null; withDeps?: boolean },
): Issue[] {
  const out: Issue[] = [];
  const byCode = codeIndex(rows as PlanRow[]);
  rows.forEach((r, i) => {
    if (r.group) return;
    const sp = r.spans[b] ?? null;
    for (const bb of opts.unbal?.get(r.oid) ?? []) out.push({ kind: 'unbal', i, b: bb });
    if (!sp) {
      if (r.vol != null && r.vol > 0) out.push({ kind: 'nodate', i, b });
      return;
    }
    if (opts.withDeps !== false && r.deps.length) {
      const need = requiredStart(rows as PlanRow[], byCode, i, b);
      if (need != null && sp.start < need) out.push({ kind: 'dep', i, b, days: Math.round((need - sp.start) / DAY) });
    }
    const g = opts.geree?.(i) ?? null;
    if (g && (sp.start < g.start || sp.end > g.end)) {
      out.push({ kind: 'geree', i, b, days: Math.round((Math.max(0, g.start - sp.start) + Math.max(0, sp.end - g.end)) / DAY) });
    }
  });
  return out;
}

/* ══════════════════ Нөөцийн нийлбэр ══════════════════ */

/** Сар бүрийн хүн хүч · машин механизмын нийлбэр (бүх ажил × блок) — `null` утгыг алгасна */
export function sumResByMonth(parts: Iterable<ReadonlyMap<string, MonthRes>>): Map<string, { hun: number; mashin: number }> {
  const out = new Map<string, { hun: number; mashin: number }>();
  for (const m of parts) {
    for (const [k, v] of m) {
      if (v.hun == null && v.mashin == null) continue;
      const cur = out.get(k) ?? { hun: 0, mashin: 0 };
      cur.hun += v.hun ?? 0;
      cur.mashin += v.mashin ?? 0;
      out.set(k, cur);
    }
  }
  return new Map([...out].sort(([a], [b2]) => (a < b2 ? -1 : 1)));
}

/* ══════════════════ Бүлгийн загвар хуулах ══════════════════ */

/**
 * ИЖИЛ БҮТЭЦТЭЙ БҮЛГҮҮД — эх бүлгийн шууд ажлуудын нэрийн дараалал (цэвэрлэсэн) яг ижил бусад бүлэг (загвар хуулахад).
 * `works(i)` — бүлгийн шууд ажлуудын индекс (`huvaari/util.directWorks`).
 */
export function sameShapeGroups(rows: readonly PlanRow[], src: number, works: (i: number) => number[]): number[] {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const sig = (i: number) => works(i).map((k) => norm(rows[k].work)).join('\u0001');
  const want = sig(src);
  if (!want) return [];
  const out: number[] = [];
  rows.forEach((r, i) => { if (i !== src && r.group && sig(i) === want) out.push(i); });
  return out;
}

/** Мужийг хоногоор шилжүүлнэ */
export const shiftSpan = (s: Span, days: number): Span => ({ start: s.start + days * DAY, end: s.end + days * DAY });

/** Бүлгийн үр дүнтэй муж (идэвхтэй блок) — `deps.effSpan` */
export const groupSpan = (rows: readonly PlanRow[], i: number, b: number): Span | null => effSpan(rows as PlanRow[], i, b);
