/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН ОГНОО — шинэчлэх хэсгийн ЦЭВЭР логик (2026-11-04, хэрэглэгч; «ТЭЗҮ · Ажлын зураг төсөл»-ийн загвараар).
 * «Газар чөлөөлөлт» үе шатын НАВЧ мөрийн `gazar_ehleh`/`gazar_duusah`-ийг засна; дээд мөрүүд хүүхдээс бодогдоно (`computePlan`).
 * Хувь нь нэгж талбараас автомат тул энд засахгүй. Харагдац: `src/modules/GazarOgnoo.tsx`. Тест: `gazarOgnoo.check.mjs`.
 */
import { saneDate, type PlanNode, type PlanStoredRow } from './projectPlan';
import { dayOf, parseDay, rowKey, sortByKod, type Names } from './zuragTosol';

export const FIELD_OF = { start: 'gazar_ehleh', end: 'gazar_duusah' } as const;
export type DateKey = keyof typeof FIELD_OF;

/** Хадгалаагүй засвар — мөрийн түлхүүрээр, ХЭРЭГЛЭГЧИЙН БИЧСЭН ТЕКСТ */
export type DatePending = Record<string, Partial<Record<DateKey, string>>>;

/** Энэ хэсгийн мөр мөн үү */
export const inSection = (n: PlanNode): boolean => n.phase === 'gazar';

/** Засагдах мөр — НАВЧ */
export const isEditable = (n: PlanNode): boolean => inSection(n) && n.children.length === 0 && n.row != null;

export const origText = (r: PlanStoredRow, f: DateKey): string => dayOf(r[FIELD_OF[f]]);

export const textOf = (p: DatePending, r: PlanStoredRow, f: DateKey): string =>
  p[rowKey(r)]?.[f] ?? origText(r, f);

export const badText = (text: string): boolean => !parseDay(text).ok;

/** Засвар тавина — анхны утга руугаа буцвал засвараас хасна */
export function setEdit(p: DatePending, r: PlanStoredRow, f: DateKey, text: string): DatePending {
  const k = rowKey(r);
  const cur = { ...(p[k] ?? {}) };
  if (text === origText(r, f)) delete cur[f];
  else cur[f] = text;
  const out = { ...p };
  if (Object.keys(cur).length) out[k] = cur;
  else delete out[k];
  return out;
}

/** Урьдчилсан мөрүүд — буруу оролт хадгалсан утгаа барина */
export function effectiveRows(base: readonly PlanStoredRow[], p: DatePending): PlanStoredRow[] {
  return sortByKod(base.map((r) => {
    const e = p[rowKey(r)];
    if (!e) return r;
    const o = { ...r };
    for (const f of Object.keys(e) as DateKey[]) {
      const ps = parseDay(e[f]!);
      if (ps.ok) o[FIELD_OF[f]] = ps.v;
    }
    return o;
  }));
}

export const pendingCount = (p: DatePending): number => Object.keys(p).length;

export type DateIssue = { code: string | null; kind: 'date' | 'order' | 'pair' | 'missing' };
export type DatePayload = { updates: Record<string, unknown>[]; issues: DateIssue[] };

/** Засварын ачаа — oid + зөрсөн талбар; хоёр огноо хоёулаа эсвэл хоёулаа хоосон, эхлэх ≤ дуусах */
export function buildEdits(base: readonly PlanStoredRow[], p: DatePending, names: Pick<Names, 'oid'>): DatePayload {
  const updates: Record<string, unknown>[] = [];
  const issues: DateIssue[] = [];
  const byKey = new Map(base.map((r) => [rowKey(r), r] as const));
  for (const [key, e] of Object.entries(p)) {
    const r = byKey.get(key);
    if (!r || r.objectid == null) { issues.push({ code: null, kind: 'missing' }); continue; }
    const next: Record<DateKey, number | null> = { start: saneDate(r.gazar_ehleh), end: saneDate(r.gazar_duusah) };
    let bad = false;
    for (const f of Object.keys(e) as DateKey[]) {
      const ps = parseDay(e[f]!);
      if (!ps.ok) { issues.push({ code: r.dd_kod, kind: 'date' }); bad = true; } else next[f] = ps.v;
    }
    if (bad) continue;
    if ((next.start == null) !== (next.end == null)) { issues.push({ code: r.dd_kod, kind: 'pair' }); continue; }
    if (next.start != null && next.end != null && next.start > next.end) { issues.push({ code: r.dd_kod, kind: 'order' }); continue; }
    const u: Record<string, unknown> = { [names.oid]: r.objectid };
    for (const f of Object.keys(FIELD_OF) as DateKey[]) if (dayOf(r[FIELD_OF[f]]) !== dayOf(next[f])) u[FIELD_OF[f]] = next[f];
    if (Object.keys(u).length > 1) updates.push(u);
  }
  return { updates, issues };
}

/** Зэрэг засвар — бичих гэж буй талбар серверт өөрчлөгдсөн бол тэр мөрийн код */
export function conflicts(
  base: readonly PlanStoredRow[],
  fresh: readonly PlanStoredRow[],
  updates: readonly Record<string, unknown>[],
  names: Pick<Names, 'oid'>,
): string[] {
  const b = new Map(base.map((r) => [r.objectid, r] as const));
  const f = new Map(fresh.map((r) => [r.objectid, r] as const));
  const out: string[] = [];
  for (const u of updates) {
    const oid = u[names.oid] as number;
    const was = b.get(oid);
    const now = f.get(oid);
    if (!was || !now) { out.push(was?.dd_kod ?? String(oid)); continue; }
    for (const k of Object.values(FIELD_OF)) {
      if (k in u && dayOf(was[k]) !== dayOf(now[k])) { out.push(was.dd_kod ?? String(oid)); break; }
    }
  }
  return out;
}
