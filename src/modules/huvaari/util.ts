/**
 * ХУВААРЬ — цэвэр туслах функцууд (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав).
 */

import { t as tr } from '@/lib/i18nCore';
import { fixCyr } from '@/lib/format';
import { msToDay, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { parseDeps } from '@/lib/deps';
import type { PlanRow, Span, Status } from '@/lib/plan';
import { balanced, monthsOf, type MonthRes } from '@/lib/huvaariObyem';
import type { PlanKind } from './types';

/** Ажил+блокийн ноорогийн түлхүүр */
export const obKey = (des: number, blok: string) => `${des}|${blok}`;

/* ══════════════════ Туслах ══════════════════ */

/** Богино огноо — «03-02». Жил нь хүрээний шошгонд бий. */
export const short = (ms: number) => msToDay(ms).slice(5);
/** Локал «өнөөдөр» — UTC шөнө дундын ms (хуанлийн түлхүүртэй ижил хэлбэр) */
export const todayUtc = (): number => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };

/** Хоёр муж (эсвэл хоёулаа хоосон) ижил үү — ноорог ба суурийн харьцуулалтад (2026-09-21) */
export const sameSpan = (a: Span | null | undefined, b: Span | null | undefined): boolean => (
  (!a && !b) || (!!a && !!b && a.start === b.start && a.end === b.end)
);

/**
 * Хоёр сарын задаргаа ижил үү — хоёулаа хоосон (эсвэл байхгүй) ч ИЖИЛ (2026-09-21).
 */
export const sameMonths = (
  a: ReadonlyMap<string, number> | null | undefined,
  b: ReadonlyMap<string, number> | null | undefined,
): boolean => {
  const x = a ?? new Map<string, number>();
  const y = b ?? new Map<string, number>();
  return x.size === y.size && [...x].every(([k, v]) => y.get(k) === v);
};

/** Хоёр сарын НӨӨЦИЙН задаргаа ижил үү — `sameMonths`-ийн адил (2026-09-24); утгагүй сар тоологдохгүй */
export const sameRes = (
  a: ReadonlyMap<string, MonthRes> | null | undefined,
  b: ReadonlyMap<string, MonthRes> | null | undefined,
): boolean => {
  const norm = (m: ReadonlyMap<string, MonthRes> | null | undefined) => {
    const o = new Map<string, MonthRes>();
    for (const [k, v] of m ?? []) if (v.hun != null || v.mashin != null) o.set(k, v);
    return o;
  };
  const x = norm(a);
  const y = norm(b);
  return x.size === y.size && [...x].every(([k, v]) => {
    const w = y.get(k);
    return !!w && (w.hun ?? null) === (v.hun ?? null) && (w.mashin ?? null) === (v.mashin ?? null);
  });
};

/**
 * `gi` бүлгийн доор `b` блокт огноотой НАВЧ байна уу (2026-09-25 аудит).
 */
export function hasDatedLeaf(
  rows: readonly PlanRow[], gi: number, b: number,
  spansOf: (k: number) => readonly (Span | null)[],
): boolean {
  const d0 = rows[gi].depth;
  for (let k = gi + 1; k < rows.length && rows[k].depth > d0; k++) {
    if (!rows[k].group && spansOf(k)[b]) return true;
  }
  return false;
}

/** «2026-05-04» → UTC шөнө дунд. Буруу бол `null`. */
export const dayToMs = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

export function remapOids(oldRows: readonly SheetRow[], newRows: readonly SheetRow[]): Map<number, number> {
  const keysOf = (rs: readonly SheetRow[]): string[] => {
    const stack: { d: number; k: string }[] = [];
    return rs.map((r) => {
      while (stack.length && stack[stack.length - 1].d >= r.depth) stack.pop();
      const own = `${r.no.trim()} ¦ ${r.work.trim()}`;
      const k = [...stack.map((s) => s.k), own].join(' › ');
      if (r.group) stack.push({ d: r.depth, k: own });
      return k;
    });
  };
  const oldK = keysOf(oldRows);
  const newK = keysOf(newRows);
  const byKey = new Map<string, number[]>();
  newRows.forEach((r, i) => {
    const l = byKey.get(newK[i]);
    if (l) l.push(r.oid); else byKey.set(newK[i], [r.oid]);
  });
  const oldCnt = new Map<string, number>();
  for (const k of oldK) oldCnt.set(k, (oldCnt.get(k) ?? 0) + 1);
  const used = new Map<string, number>();
  const out = new Map<number, number>();
  oldRows.forEach((r, i) => {
    const k = oldK[i];
    const l = byKey.get(k);
    if (!l) return;
    const skip = Math.max(0, l.length - (oldCnt.get(k) ?? 0));
    const n = used.get(k) ?? 0;
    if (skip + n < l.length) { out.set(r.oid, l[skip + n]); used.set(k, n + 1); }
  });
  return out;
}

/** `SheetRow[]` → `PlanRow[]`. `i` нь ЭХ массивын индекс. */
export function toPlanRows(rows: SheetRow[], n: number, kind: PlanKind = 'plan'): PlanRow[] {
  const st = (r: SheetRow) => (kind === 'geree' ? r.gStart : r.start);
  const en = (r: SheetRow) => (kind === 'geree' ? r.gEnd : r.end);
  return rows.map((r, i) => ({
    i,
    oid: r.oid,
    no: r.no,
    des: r.des,
    deps: parseDeps(r.ham),
    work: r.work,
    depth: r.depth,
    group: r.group,
    vol: r.vol,
    spans: Array.from({ length: n }, (_, b) => (
      st(r)[b] != null && en(r)[b] != null
        ? { start: st(r)[b] as number, end: en(r)[b] as number }
        : null
    )),
    act: r.act,
    aStart: r.aStart,
    aEnd: r.aEnd,
    hun: r.hun,
    mashin: r.mashin,
  }));
}

/**
 * БҮЛГИЙН БОДИТ ОГНОО ба НӨӨЦ — хүүхдүүдээс (2026-09-23).
 * Бодит эхэлсэн = навчдын MIN, бодит дууссан = навчдын MAX (аль нэг навч
 * дуусаагүй бол `null` — «бүлэг дууссан» гэж худал хэлэхгүй); хүн/техник =
 * навчдын НИЙЛБЭР (нэг ч навч бөглөөгүй бол `null`, 0 БИШ).
 */
export function aggExtra(rows: readonly PlanRow[], i: number, n: number): {
  aStart: (number | null)[]; aEnd: (number | null)[]; hun: number | null; mashin: number | null;
} {
  const g = rows[i];
  const aStart: (number | null)[] = new Array(n).fill(null);
  const aEnd: (number | null)[] = new Array(n).fill(null);
  const open: boolean[] = new Array(n).fill(false);
  let hun: number | null = null;
  let mashin: number | null = null;
  for (let k = i + 1; k < rows.length && rows[k].depth > g.depth; k += 1) {
    const r = rows[k];
    if (r.group) continue;
    for (let b = 0; b < n; b += 1) {
      const s = r.aStart?.[b] ?? null;
      const e = r.aEnd?.[b] ?? null;
      if (s != null && (aStart[b] == null || s < aStart[b]!)) aStart[b] = s;
      if (e == null) open[b] = true;
      if (e != null && (aEnd[b] == null || e > aEnd[b]!)) aEnd[b] = e;
    }
    if (r.hun != null) hun = (hun ?? 0) + r.hun;
    if (r.mashin != null) mashin = (mashin ?? 0) + r.mashin;
  }
  for (let b = 0; b < n; b += 1) if (open[b]) aEnd[b] = null;
  return { aStart, aEnd, hun, mashin };
}

/**
 * Мөрийн НИЙТ муж — хамгийн эрт эхлэх → хамгийн сүүл дуусах. Хуваарьгүй бол `null`.
 */
export function rowSpan(r: PlanRow): Span | null {
  let a: number | null = null;
  let z: number | null = null;
  for (const s of r.spans) {
    if (!s) continue;
    if (a == null || s.start < a) a = s.start;
    if (z == null || s.end > z) z = s.end;
  }
  return a == null || z == null ? null : { start: a, end: z };
}


export const stText = (st: Status): string => {
  switch (st) {
    case 'done': return tr('дууссан');
    case 'run': return tr('явж байгаа');
    case 'todo': return tr('эхлээгүй');
    case 'late': return tr('хоцорсон');
    default: return tr('хэмжигдээгүй');
  }
};

/* ══════════════════ Үндсэн харагдац ══════════════════ */

/**
 * Тухайн үүргийн хүрээнд энэ багц багтах уу.
 * `null` = хязгааргүй · `[]` = тэр үүргээр хуваарилагдаагүй.
 */
export const inScope = (scope: string[] | null, group: string): boolean =>
  scope == null || scope.includes(group);

/* ══════════════════ Илгээхийн өмнөх сарын задаргааны хаалт ══════════════════ */

/**
 * ТЭНЦЭЭГҮЙ сарын задаргаатай (ажил·блок) илгээхийг ХОРИГЛОНО (2026-09-17): батлах
 * үеийн `save` тэдгээрийг алгасдаг (`unbal`) тул ноорог үлдэж батлах гинж
 * «эх хуудсанд бичигдсэнгүй» гэж мөнхөд гацдаг байв.
 */
export function unbalancedObyem(
  plan: readonly PlanRow[],
  bld: readonly string[],
  obDraft: ReadonlyMap<string, ReadonlyMap<string, number>>,
  obPlan: ReadonlyMap<number, ReadonlyMap<string, ReadonlyMap<string, number>>>,
): { bad: number; names: string[] } {
  let bad = 0;
  /** ажлын нэр → тэнцээгүй блокууд (оруулсан дарааллаар) */
  const names = new Map<string, string[]>();
  for (const r of plan) {
    const bs = unbalancedBlocks(r, bld, obDraft, obPlan, true);
    if (!bs.length) continue;
    bad += bs.length;
    const k = `${r.no} ${r.work}`.trim();
    const cur = names.get(k) ?? [];
    for (const b of bs) if (!cur.includes(bld[b])) cur.push(bld[b]);
    names.set(k, cur);
  }
  return {
    bad,
    names: [...names].map(([k, bs]) => (bld.length > 1 ? `${k} (${bs.join(', ')})` : k)),
  };
}

/**
 * НЭГ АЖЛЫН ТЭНЦЭЭГҮЙ БЛОКУУД (индекс) — `unbalancedObyem` ба `PlanModal`-ын улаан
 * чип НЭГ дүрмээр (2026-10-01, хэрэглэгч: бүгдийг зас — «асуудалтай блокийг шууд олох»).
 */
export function unbalancedBlocks(
  r: PlanRow,
  bld: readonly string[],
  obDraft: ReadonlyMap<string, ReadonlyMap<string, number>>,
  obPlan: ReadonlyMap<number, ReadonlyMap<string, ReadonlyMap<string, number>>>,
  draftOnly = false,
): number[] {
  const out: number[] = [];
  if (r.group || r.des == null || r.vol == null || !(r.vol > 0)) return out;
  for (let b = 0; b < bld.length; b += 1) {
    const blok = bld[b];
    if (!blok) continue;
    const d = obDraft.get(obKey(r.des, blok));
    const srv = obPlan.get(r.des)?.get(blok);
    const months = draftOnly ? d : (d ?? srv);
    if (!months) continue;
    if (months.size && !balanced(months, r.vol)) out.push(b);
    else if (!months.size && d && r.spans[b] && (srv?.size ?? 0) > 0) out.push(b);
  }
  return out;
}

/**
 * БҮЛГИЙН КОДООР ХАДГАЛАГДСАН САРЫН ЗАДАРГАА — тэнцлийн шалгалтад ОРОХГҮЙ тул ил
 * мэдээлнэ (2026-10-01, `unbalancedBlocks`). Нэрс (`№ ажил`), давхардалгүй.
 */
export function groupSplits(
  plan: readonly PlanRow[],
  bld: readonly string[],
  obPlan: ReadonlyMap<number, ReadonlyMap<string, ReadonlyMap<string, number>>>,
): string[] {
  const out: string[] = [];
  for (const r of plan) {
    if (!r.group || r.des == null) continue;
    const by = obPlan.get(r.des);
    if (by && bld.some((b) => (by.get(b)?.size ?? 0) > 0)) out.push(`${r.no} ${r.work}`.trim());
  }
  return out;
}

/**
 * МУЖААС ГАДУУРХ САРЫН ОБЬЁМ — батлахын өмнөх хаалт (2026-10-01, хэрэглэгч: бүгдийг зас).
 */
export function obyemOutsideSpan(
  plan: readonly PlanRow[],
  bld: readonly string[],
  obOf: (des: number, blok: string) => ReadonlyMap<string, number>,
  only?: ReadonlySet<number>,
): { bad: number; names: string[] } {
  let bad = 0;
  const names: string[] = [];
  for (const r of plan) {
    if (r.group || r.des == null) continue;
    if (only && !only.has(r.oid)) continue;
    const parts: string[] = [];
    for (let b = 0; b < bld.length; b += 1) {
      const blok = bld[b];
      if (!blok) continue;
      const months = obOf(r.des, blok);
      if (!months.size) continue;
      const sp = r.spans[b];
      const ok = new Set(sp ? monthsOf(sp) : []);
      const out = [...months].filter(([k, v]) => v != null && v !== 0 && !ok.has(k)).map(([k]) => k).sort();
      if (!out.length) continue;
      bad += 1;
      parts.push(bld.length > 1 ? `${blok}: ${out.join(', ')}` : out.join(', '));
    }
    if (parts.length) names.push(`${`${r.no} ${r.work}`.trim()} (${parts.join('; ')})`);
  }
  return { bad, names };
}

/**
 * ХАРУУЛАХ НЭР (2026-10-23, UX аудит P6) — хоосон нэртэй мөр «» болж харагдаж, ««»» бүлэгт ажил нэмэх» гэх мэт
 * шошго гардаг байв. Бүлэгт «(нэргүй бүлэг)», ажилд «(нэргүй ажил)». ЗӨВХӨН харуулна — өгөгдөл/түлхүүрт (№ ¦ нэр) хэрэглэхгүй.
 */
export const workName = (r: { work?: string | null; group?: boolean }): string =>
  fixCyr((r.work ?? '').trim()) || (r.group ? tr('(нэргүй бүлэг)') : tr('(нэргүй ажил)'));
