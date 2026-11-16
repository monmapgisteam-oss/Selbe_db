/**
 * БАГЦ ХООРОНД ХУУЛАХ (2026-11-16, хэрэглэгч: «нэг багцын төлөвлөлтийг нөгөө рүү хуулна») — цэвэр логик.
 * Эх хуудасны 3-р давхрын бүлэг бүрийн огноо (блокуудын нэгдэл) ба сарын хувийг (доторх ажлуудын мөнгө × мужийн өдрөөр)
 * гаргаж, зорилтот хуудасны ИЖИЛ НЭРТЭЙ (эцэг бүлгүүдийн нэр + өөрийн нэр) бүлэгт «Бүлгээр төлөвлөх»-өөр тавина.
 */
import { DAY, type PlanRow, type Span } from '@/lib/plan';
import { fixCyr } from '@/lib/format';
import { monthStart, monthsOf } from '@/lib/huvaariObyem';
import { isPlanUnit, unitWorks } from './util';

/** Бүлгийн түлхүүр — эцэг бүлгүүдийн ба өөрийн нэр (жижиг/том үсэг, тэмдэгт ялгахгүй) */
export function unitKey(plan: readonly PlanRow[], at: number): string {
  const norm = (s: string) => fixCyr(s).toUpperCase().replace(/[^0-9A-ZА-ЯЁӨҮ]/g, '');
  const parts = [norm(plan[at]?.work ?? '')];
  for (let i = at - 1, d = plan[at]?.depth ?? 0; i >= 0 && d > 0; i--) {
    if (plan[i].group && plan[i].depth < d) { parts.unshift(norm(plan[i].work)); d = plan[i].depth; }
  }
  return parts.join('›');
}

/** Эх бүлгийн төлөвлөлт — нэгдсэн муж ба сарын хувь (нийлбэр 100) */
export type UnitPlan = { span: Span; pct: Map<string, number> };

const sane = (s: Span | null | undefined): s is Span => !!s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start;

/** Сарын хувийг 2 оронтой болгож, нийлбэрийг яг 100 болгоно (үлдэгдэл хамгийн их сард) */
export function round100(w: ReadonlyMap<string, number>): Map<string, number> {
  const tot = [...w.values()].reduce((a, v) => a + v, 0);
  const out = new Map<string, number>();
  if (!(tot > 0)) return out;
  let big = '';
  let sum = 0;
  for (const [k, v] of w) {
    const p = Math.round((v / tot) * 10000) / 100;
    out.set(k, p);
    sum += p;
    if (!big || p > (out.get(big) ?? 0)) big = k;
  }
  if (big) out.set(big, Math.round(((out.get(big) ?? 0) + (100 - sum)) * 100) / 100);
  return out;
}

/** Сар бүрт жигд хувь (нийлбэр 100) — «Бүлгээр төлөвлөх»-ийн анхны утга */
export const evenPct = (keys: readonly string[]): Map<string, number> => round100(new Map(keys.map((k) => [k, 1])));

/**
 * Эх хуудасны 3-р давхрын бүлгүүдийн төлөвлөлт, `shiftDays` хоногоор шилжүүлсэн. Огноогүй бүлэг орохгүй.
 * Сарын жин = ажлын мөнгө (`moneyOf`; бүх ажил мөнгөгүй бол 1) × тэр сард орсон өдрийн хувь.
 */
export function sourceUnitPlans(
  plan: readonly PlanRow[],
  nBlocks: number,
  moneyOf: (k: number) => number | null,
  shiftDays = 0,
): Map<string, UnitPlan> {
  const out = new Map<string, UnitPlan>();
  const dt = shiftDays * DAY;
  plan.forEach((r, at) => {
    if (!isPlanUnit(r)) return;
    const works = unitWorks(plan, at);
    const anyMoney = works.some((k) => (moneyOf(k) ?? 0) > 0);
    let lo = Infinity;
    let hi = -Infinity;
    const w = new Map<string, number>();
    for (const k of works) {
      const m = anyMoney ? Math.max(0, moneyOf(k) ?? 0) : 1;
      for (let b = 0; b < nBlocks; b++) {
        const s0 = plan[k].spans[b];
        if (!sane(s0)) continue;
        const s = { start: s0.start + dt, end: s0.end + dt };
        lo = Math.min(lo, s.start);
        hi = Math.max(hi, s.end);
        if (!(m > 0)) continue;
        const days = (s.end - s.start) / DAY + 1;
        for (const mk of monthsOf(s)) {
          const ms = monthStart(mk)!;
          const d = new Date(ms);
          const me = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
          const ov = (Math.min(s.end, me) - Math.max(s.start, ms)) / DAY + 1;
          if (ov > 0) w.set(mk, (w.get(mk) ?? 0) + (m * ov) / days);
        }
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
    const span = { start: lo, end: hi };
    const keys = monthsOf(span);
    const pct = w.size ? round100(new Map(keys.map((k) => [k, w.get(k) ?? 0]))) : evenPct(keys);
    out.set(unitKey(plan, at), { span, pct });
  });
  return out;
}
