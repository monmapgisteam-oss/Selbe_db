/**
 * БАГЦЫН ТҮЛХҮҮРИЙН ХОЛБООС ба ОЛОН БАГЦ ХАМАРСАН ТӨЛБӨР — «Багцын санхүү» (PkgFin) ба
 * «ТУХ» (`tuhData.assignHo`) хоёрын НЭГ эх (2026-10-04).
 */
import type { Row } from '@/lib/query';
import { HO_IPC, PKG_BY_BAGTS, bagtsKey, hoAmount, isPkgRange, pkgKeyOf } from '@/lib/services';

/** HO гэрээний багцын түлхүүр → Cashflow-ийн багцын түлхүүр (санхүүгийн НЭГ гэрээ) */
export const HO_PKG_ALIAS: Readonly<Record<string, string>> = {
  'БАГЦ81': 'БАГЦ8',
};

/** HO түлхүүрийг Cashflow-ийн түлхүүр рүү (холбоосгүй бол өөрөө) */
export const hoPkgKey = (k: string): string => HO_PKG_ALIAS[k] ?? k;

/**
 * Cashflow-ийн багц → ГАЗРЫН ЗУРГИЙН багц (зөвхөн «Багцын санхүү» — газрын зургийн багцаар
 * жагсаадаг). Нотолгоо нь `PkgFin`-ийн `FIN_PKG_ALIAS`.
 */
export const MAP_PKG_ALIAS: Readonly<Record<string, { key: string; label: string }>> = {
  'БАГЦ71': { key: 'БАГЦ7', label: 'Багц 7' },
  'БАГЦ8': { key: 'БАГЦ82', label: 'Багц 8.2' },
};

/**
 * САНХҮҮГИЙН НЭГДСЭН ХОЛБООС — HO ба Cashflow-ийн түлхүүр → газрын зургийн багцын түлхүүр/нэр.
 * HO «Багц-8.1» → (`HO_PKG_ALIAS`) «Багц 8» → (`MAP_PKG_ALIAS`) «Багц 8.2».
 */
export const FIN_PKG_ALIAS: Readonly<Record<string, { key: string; label: string }>> = {
  ...MAP_PKG_ALIAS,
  ...Object.fromEntries(Object.entries(HO_PKG_ALIAS).map(([ho, cf]) => [ho, MAP_PKG_ALIAS[cf] ?? { key: cf, label: cf }])),
};

/**
 * Cashflow-ийн багцын түлхүүрийн ГАЗРЫН ЗУРГИЙН `pkg:*` давхаргууд (`MAP_PKG_ALIAS`-аар унана).
 */
export const mapPkgLayers = (k: string): string[] | undefined =>
  PKG_BY_BAGTS[k] ?? (MAP_PKG_ALIAS[k] ? PKG_BY_BAGTS[MAP_PKG_ALIAS[k].key] : undefined);

/**
 * Cashflow-ийн багцын түлхүүрүүд → ГАЗРЫН ЗУРГИЙН багцын түлхүүрүүд (`loadPkgOverlaps`-ийн `key`).
 */
export function mapPkgKeySet(keys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    out.add(k);
    const a = MAP_PKG_ALIAS[k]?.key;
    if (a) out.add(a);
    const m = /^БАГЦ6([1-4])$/.exec(k);
    if (m) out.add(`БАГЦ${m[1]}ХОЛБОО`);
  }
  return out;
}

/** HO/Cashflow-ийн багцын түлхүүрийг НЭГДСЭН санхүүгийн түлхүүр рүү (холбоосгүй бол өөрөө) */
export const finPkgKey = (k: string): string => FIN_PKG_ALIAS[k]?.key ?? k;

/**
 * ОЛОН БАГЦ ХАМАРСАН мөрийн гишүүн багцууд (`bagtsKey`) — «БАГЦ-10,  БАГЦ-11, БАГЦ-13, БАГЦ-15»
 * → [БАГЦ10, БАГЦ11, БАГЦ13, БАГЦ15]; «Багц-1-4» → [БАГЦ1 … БАГЦ4]. Диапазон биш бол [].
 */
export function rangeMembers(v: unknown): string[] {
  const s = String(v ?? '').trim();
  if (!isPkgRange(s)) return [];
  const out = new Set<string>();
  for (const part of s.split(/[\r\n,]+/)) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/(\d+)\s*[-–—]\s*(\d+)\s*$/u);
    if (m && Number(m[2]) > Number(m[1]) && Number(m[2]) - Number(m[1]) < 50) {
      for (let i = Number(m[1]); i <= Number(m[2]); i += 1) out.add(`БАГЦ${i}`);
      continue;
    }
    /* «6.2» мэт угтваргүй хэсэг — «БАГЦ»-аар нөхнө */
    const k = /^[\d.\s-]+$/.test(p) ? bagtsKey(`БАГЦ${p}`) : bagtsKey(p);
    if (k && k !== 'БАГЦ') out.add(k);
  }
  return [...out];
}

/** Олон багц хамарсан төлбөрийн бүлэг */
export type RangePay = {
  /** HO-ийн `bagts` түүхий утга (зайг нэгтгэсэн) — ХАРАГДАХ нэр */
  label: string;
  /** Σ олгосон, ₮ */
  amount: number;
  /** Хамаарах багцууд (`bagtsKey`) */
  members: string[];
};

/**
 * HO төлбөрийн мөрүүдээс ОЛОН БАГЦ ХАМАРСАН (`pkgKeyOf` хоосон) олголтыг бүлэглэнэ.
 */
export function rangePaysOf(pays: ReadonlyArray<Record<string, unknown>>): RangePay[] {
  const by = new Map<string, RangePay>();
  for (const r of pays) {
    const amt = hoAmount(r as Row);
    if (amt == null) continue;
    const raw = r[HO_IPC.contractFields.pkg];
    if (pkgKeyOf(raw)) continue;
    const members = rangeMembers(raw);
    if (!members.length) continue;
    const label = String(raw ?? '').replace(/\s+/g, ' ').trim();
    const cur = by.get(label) ?? { label, amount: 0, members };
    cur.amount += amt;
    by.set(label, cur);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount);
}
