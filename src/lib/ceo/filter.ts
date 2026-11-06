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
  samePkg(pkgPart(row[col]?.v), pkgPart(pkg));

/**
 * Нэрийн БАГЦЫН хэсэг — « · »-гийн өмнөх: «Багц 6.4 · цахилгааны шугам Багц4» → «Багц 6.4»
 * (давхцлын хүснэгтийн мөрийн нэр нь давхаргын гарчгаас тогтдог).
 */
export const pkgPart = (v: unknown): unknown => (typeof v === 'string' ? v.split(' · ')[0] : v);

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
  return pkgRowsOf(t, pkg);
}

/** Хүснэгтийн тэр багцын мөрүүд; `Багц` баганагүй бол хэвээр, мөр алга бол `null` */
function pkgRowsOf(t: DetailTable, pkg: string): DetailTable | null {
  const col = pkgColOf(t);
  if (col < 0) return t;
  const src = t.rowsFull ?? t.rows;
  const rows = src.filter((r) => rowInPkg(r, col, pkg));
  if (!rows.length) return null;
  const cut = capRows(rows, t.cols.length);
  return { title: t.title, cols: t.cols, rows: cut };
}

/** Анхааруулга багц дурдсан уу — дурдаагүй нь багцаар шүүгдэхгүй, ТӨСЛИЙН НИЙТийнх */
export const issueNamesPkg = (text: string): boolean => /Багц/i.test(text);

/**
 * Анхааруулгын текстийг ХЭСГҮҮД болгож задлана — багцын нэр НЭГ ХЭСЭГ болно.
 */
const issueSegments = (text: string): string[] => text.split(/[·—\n]/);

/**
 * `KpiResult`-ийг багцаар шүүсэн ХУВИЛБАР.
 */
export function filterResult(r: KpiResult, pkg: string): KpiResult {
  if (!pkg) return r;
  /* Багцын мөр ЗӨВХӨН нэгтгэсэн хүснэгтэд байвал тэр мөрийг үлдээнэ — эс бөгөөс «асуудалтай мөр алга» гэж ХУДАЛ хэлнэ */
  const hasOwn = r.tables.some((t) => !isPkgSummary(t) && pkgColOf(t) >= 0 && pkgRowsOf(t, pkg) != null);
  const tables = r.tables
    .map((t) => (isPkgSummary(t) && !hasOwn ? pkgRowsOf(t, pkg) : filterTable(t, pkg)))
    .filter((t): t is DetailTable => t != null);
  const issues = r.issues.filter((i) => (
    !issueNamesPkg(i.text) || issueSegments(i.text).some((s) => samePkg(s, pkgPart(pkg)))
  ));
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
        const label = String(pkgPart(raw)).trim();
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
