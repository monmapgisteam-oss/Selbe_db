/**
 * «БҮХ БЛОК» ХАРАГДАЦ — ажил бүрийн доор блок бүрийн хуваарь (2026-10-04, хэрэглэгч:
 * «бүрэн schedule хийчээд блок блокоор харах гэтэл тухайн блок сонгож орж харж байсан —
 * бүх блокийн хуваарийг зэрэг харах боломжтой болго»).
 */
import type { PlanRow, Span } from '@/lib/plan';
import { effSpan } from '@/lib/deps';

/**
 * Дэлгэцийн нэг мөр.
 */
export type DispRow = {
  oid: number;
  r: PlanRow;
  /** `-1` = эх мөр (ажил/бүлэг); `≥ 0` = тэр блокийн дэд мөр */
  b: number;
  /**
   * Дэд мөрд — тэр блокийн муж (бүлэгт `effSpan`). Эх мөрд «бүх блок» горимд —
   * блокуудын НЭГДЭЛ (хуваарьгүй бол `null`); энгийн горимд ашиглагдахгүй (`null`).
   */
  sp: Span | null;
};

/** Энгийн горим — мөр бүр эх мөр, дэд мөргүй (зурагдалт ХЭВЭЭР) */
export function plainRows(visible: readonly PlanRow[]): DispRow[] {
  return visible.map((r) => ({ oid: r.oid, r, b: -1, sp: null }));
}

/** Мужуудын нэгдэл — хамгийн эрт эхлэл → хамгийн сүүл дуусалт; бүгд `null` бол `null` (0 БИШ) */
export function unionSpans(list: readonly (Span | null | undefined)[]): Span | null {
  let a: number | null = null;
  let z: number | null = null;
  for (const s of list) {
    if (!s) continue;
    if (a == null || s.start < a) a = s.start;
    if (z == null || s.end > z) z = s.end;
  }
  return a == null || z == null ? null : { start: a, end: z };
}

/**
 * Мөрийн блок `b` дахь муж — бүлэгт ХҮҮХДЭЭС (`effSpan`), ажилд өөрийнх.
 */
export function blockSpan(plan: PlanRow[], r: PlanRow, b: number): Span | null {
  return r.group ? effSpan(plan, r.i, b) : (r.spans[b] ?? null);
}

/**
 * ХАВТГАЙ ЖАГСААЛТ: харагдах мөр бүр (эвхэлт · шүүлт · хайлт аль хэдийн `visible`-д)
 * → эх мөр + хуваарьтай блок бүрийн дэд мөр (блокийн дарааллаар).
 */
export function allBlockRows(visible: readonly PlanRow[], plan: PlanRow[], n: number): DispRow[] {
  const out: DispRow[] = [];
  for (const r of visible) {
    const subs: DispRow[] = [];
    for (let b = 0; b < n; b++) {
      const sp = blockSpan(plan, r, b);
      if (sp) subs.push({ oid: r.oid, r, b, sp });
    }
    out.push({ oid: r.oid, r, b: -1, sp: unionSpans(subs.map((s) => s.sp)) });
    for (const s of subs) out.push(s);
  }
  return out;
}

/**
 * Бүх блокийн БОДИТ огнооны нэгдэл (эх мөрийн зүүн самбарт).
 */
export function actUnion(
  aStart: readonly (number | null)[] | undefined,
  aEnd: readonly (number | null)[] | undefined,
): { start: number | null; end: number | null } {
  let s: number | null = null;
  let e: number | null = null;
  let open = false;
  (aStart ?? []).forEach((a, b) => {
    if (a == null) return;
    if (s == null || a < s) s = a;
    const z = aEnd?.[b] ?? null;
    if (z == null) open = true;
    else if (e == null || z > e) e = z;
  });
  return { start: s, end: s == null || open ? null : e };
}
