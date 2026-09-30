/**
 * ХУВААРЬ — цэвэр туслах функцууд (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав).
 * ⚠️ Логик · тайлбар ХЭВЭЭР — зөвхөн файлын байршил өөрчлөгдсөн.
 */

import { t as tr } from '@/lib/i18nCore';
import { msToDay, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { parseDeps } from '@/lib/deps';
import type { PlanRow, Span, Status } from '@/lib/plan';
import { balanced, type MonthRes } from '@/lib/huvaariObyem';
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
 * ⚠️ Ноорогийг серверийн задаргаатай тулгахад: ижил бол ноорогт үлдээх зүйлгүй —
 *    бичих зүйл ч, «хадгалаагүй» тэмдэг ч байх ёсгүй.
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
 * ⚠️ Байхгүй бол бүлгийн үр дүнтэй муж нь ӨӨРИЙНХ (`effSpan`) — тэр блок дахь
 *    ноорог нь `rollUpGroups`-ын дагавар БИШ, `propagate`-ийн шилжүүлсэн
 *    бүлгийн ӨӨРИЙН муж тул хасаж/алгасаж болохгүй.
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
    /* ⚠️ Бодит огноо · нөөц (2026-09-23) — `kind`-ээс ХАМААРАХГҮЙ: гэрээ ба
       төлөвлөгөө хоёр таб нэг бодит талбарыг харуулна (баримт нэг л байна). */
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
 * ⚠️ ЗӨВХӨН ДЭЛГЭЦ — бүлгийн мөрд бичигдэхгүй (`effRow` → popup/зүүн багана).
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
      /* ⚠️ Бүртгэлгүй (`s == null`) навч ч бүлгийг НЭЭЛТТЭЙ үлдээнэ (2026-09-23
         аудит) — 10 навчны 1 нь дууссан бол «бүлэг дууссан» гэж гарч байв. */
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
 * ⚠️ Шүүлт, мөрийн шошго, popup гурвуулаа үүнийг ашиглана — тус тусад нь
 *    бодвол «жагсаалтад орсон ч өөр огноо харуулах» зөрүү үүснэ.
 * ⚠️ ЭКСПОРТЛОГДОХГҮЙ (2026-09-06): энэ файлаас гадуур хэн ч импортлодоггүй.
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

/* ⚠️ `spanOfRef` (бүх блокийн MIN/MAX) 2026-09-23-нд ХАСАГДСАН — зүүн самбарын
   огноо одоо идэвхтэй блокийнх (`refSpanAt`, бүрэлдэхүүн дотор). */

/* ⚠️ Утга бүр `tr()`-ээр. Энэ Record нь зөвхөн зураасны `title` дотор
   `${stText(st)}` гэж ордог тул орчуулгын ямар ч зам дайрдаггүй байсан —
   `i18n-extract` ч статик `tr('…')` дуудлага олохгүй тул «ДУТУУ 0» гэж
   худал тайлагнаж, англи горимд ганц энэ tooltip монголоор үлддэг байв. */
/* ⚠️ ФУНКЦ, модуль ачаалахад бодогдох Record БИШ (2026-09-24 аудит): `tr()`
   модуль ачаалах агшинд дуудагдвал хэл солиход орчуулагдахгүй хэвээр үлддэг
   байв — зурагдах бүрд дуудна. */
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
 * ⚠️ 2026-09-30: `Huvaari.sendForApproval`-аас ЦЭВЭР функц болгон салгав — дүрэм
 *    ХЭВЭЭР; одоо `obyemGate.check.mjs`-ээр (popup-ын шүүсэн `mv` → ноорог → энэ
 *    хаалт) тестлэгдэнэ. Буцаах: тэнцээгүй тоо + ажлын НЭРС (2026-09-21 — «1 ажлын…»
 *    гэсэн тоо л хараад 1,400 мөрөөс алийг нь нээхээ мэдэхгүй байв).
 * ⚠️ ХООСОН ЗАДАРГАА + ХУВААРЬТАЙ блок = 0 ≠ обьём (2026-09-21). Гинжээр (уялдаа,
 *    чирэлт) ажил БҮТЭН шинэ саруудад шилжвэл `keepMonths` бүх сарыг хаяж Map хоосон
 *    болдог; урьд нь `months.size &&` нөхцөл үүнийг өнгөрөөж, батлахад `buildEdits`
 *    тэр ажлын БҮХ сарын мөрийг устгадаг байв — задаргаа ул мөргүй алга. Хоосон Map нь
 *    зөвхөн хуваарь ч ХООСОН (`clear`) үед л хүчинтэй «арилгах» санаа.
 * ⚠️ ЗӨВХӨН СЕРВЕРТ ЗАДАРГАА БАЙСАН үед (2026-09-21): «buildEdits бүх сарыг устгана»
 *    гэсэн үндэслэл серверт задаргаа БАЙХГҮЙ ажилд хамаарахгүй — устгах зүйл алга.
 *    Задаргаагүй обьёмтой ажлыг чирээд цонхыг X-ээр хаахад хоосон Map үлдэж, илгээх
 *    зам мөнхөд түгжигдэж байв (одоо `applyChanges`/`applyModal` ийм ноорогийг хасдаг
 *    ч хуучин ноорог/өөр замаар орсныг энд давхар хамгаална).
 * ⚠️ Обьёмгүй (`vol` null/0) эсвэл кодгүй мөрд шалгах суурь алга — алгасна.
 */
export function unbalancedObyem(
  plan: readonly PlanRow[],
  bld: readonly string[],
  obDraft: ReadonlyMap<string, ReadonlyMap<string, number>>,
  obPlan: ReadonlyMap<number, ReadonlyMap<string, ReadonlyMap<string, number>>>,
): { bad: number; names: string[] } {
  let bad = 0;
  const names = new Set<string>();
  for (const r of plan) {
    for (let b = 0; b < bld.length; b += 1) {
      const blok = bld[b];
      if (r.des == null || !blok) continue;
      const months = obDraft.get(obKey(r.des, blok));
      if (!months || r.vol == null || !(r.vol > 0)) continue;
      if (months.size && !balanced(months, r.vol)) { bad += 1; names.add(`${r.no} ${r.work}`.trim()); }
      else if (!months.size && r.spans[b] && (obPlan.get(r.des)?.get(blok)?.size ?? 0) > 0) {
        bad += 1; names.add(`${r.no} ${r.work}`.trim());
      }
    }
  }
  return { bad, names: [...names] };
}
