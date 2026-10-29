/**
 * CEO САМБАРЫН БАГЦЫН ШҮҮЛТ — задаргааны хүснэгтийг «Багц» баганаар нь шүүнэ.
 */
import { t as tr } from '@/lib/i18nCore';
import { bagtsKey, isPkgRange } from '@/lib/services';
import { capRows } from './kpi';
import type { Cell, DetailTable, KpiResult } from './kpi';

/** «Бүх багц» — шүүлтгүй төлөв */
export const ALL_PKG = '';

/**
 * Хүснэгтийн БАГЦЫН баганы индекс, эс бөгөөс `-1`.
 */
export const pkgColOf = (t: DetailTable): number => t.cols.indexOf(tr('Багц'));

/**
 * Тухайн мөр сонгосон багцад хамаарах уу?
 */
export const rowInPkg = (row: readonly Cell[], col: number, pkg: string): boolean =>
  samePkg(row[col]?.v, pkg);

/**
 * ХОЁР БАГЦЫН НЭР НЭГ БАГЦ МӨН ҮҮ — ДИАПАЗОНЫГ ТООЦСОН (2026-09-21).
 */
export const samePkg = (a: unknown, b: unknown): boolean => {
  const ra = isPkgRange(a);
  const rb = isPkgRange(b);
  if (ra !== rb) return false;
  return bagtsKey(a) === bagtsKey(b);
};

/**
 * НЭГТГЭСЭН хүснэгт мөн үү («Багцаар» — мөр бүр НЭГ БАГЦЫН дүн)?
 */
export const isPkgSummary = (t: DetailTable): boolean => (
  t.cols[0] === tr('Багц')
  && (t.title === tr('Багцаар') || t.title === tr('Багц бүрээр'))
);

/**
 * Нэг хүснэгтийг багцаар шүүнэ. `null` = энэ хүснэгтийг ОГТ харуулахгүй.
 */
export function filterTable(t: DetailTable, pkg: string): DetailTable | null {
  if (!pkg) return t;
  if (isPkgSummary(t)) return null;
  const col = pkgColOf(t);
  if (col < 0) return t;
  const src = t.rowsFull ?? t.rows;
  const rows = src.filter((r) => rowInPkg(r, col, pkg));
  if (!rows.length) return null;
  const cut = capRows(rows, t.cols.length);
  return { title: t.title, cols: t.cols, rows: cut };
}

/**
 * Анхааруулгын текстийг ХЭСГҮҮД болгож задлана — багцын нэр НЭГ ХЭСЭГ болно.
 */
const issueSegments = (text: string): string[] => text.split(/[·—\n]/);

/**
 * `KpiResult`-ийг багцаар шүүсэн ХУВИЛБАР.
 */
export function filterResult(r: KpiResult, pkg: string): KpiResult {
  if (!pkg) return r;
  const tables = r.tables.map((t) => filterTable(t, pkg)).filter((t): t is DetailTable => t != null);
  const issues = r.issues.filter((i) => {
    const mentions = /Багц/i.test(i.text);
    return !mentions || issueSegments(i.text).some((s) => samePkg(s, pkg));
  });
  return { ...r, tables, issues };
}

/**
 * Хүснэгтүүдээс БОДИТООР олдсон багцын нэрс — сонгогчийн жагсаалт.
 */
export function pkgOptions(results: readonly KpiResult[]): string[] {
  const seen = new Map<string, string>();
  for (const r of results) {
    for (const t of r.tables) {
      const col = pkgColOf(t);
      if (col < 0) continue;
      for (const row of t.rows) {
        const raw = row[col]?.v;
        if (raw == null || typeof raw === 'number') continue;
        const label = String(raw).trim();
        if (!label || label === '—' || label.startsWith('…')) continue;
        /*
         * Шалгуур: «Багц» + ТОО (цэг/зураастай дэд дугаар зөвшөөрнө) —
         * «Багц 3.2» ✓ · «БАГЦ - 19.1» ✓ · «Багц тодорхойгүй» ✗ · «БҮХ БАГЦ» ✗.
         * Диапазоныг `isPkgRange` (services.ts-ийн баримтжуулсан дүрэм) хасна.
         */
        if (!/^багц\s*[-–—]?\s*\d/i.test(label) || isPkgRange(label)) continue;
        const k = bagtsKey(label);
        if (!k || seen.has(k)) continue;
        seen.set(k, label);
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'mn', { numeric: true }));
}
