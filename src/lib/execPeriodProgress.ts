/** Хугацааны өөрчлөлтөд сарын эцсийн цэг биш, батлагдсан ӨДӨР бүрийн түүх хэрэгтэй. */
import { buildPhys, type PhysHistory } from '@/lib/finPhys';
import { housingSeries, HOUSING_PKGS } from '@/lib/gdash';
import { MAP_PKG_ALIAS } from '@/lib/pkgAlias';
import type { ProgressPoint } from '@/lib/execPeriodCalc';

export function execProgressPoints(
  hist: PhysHistory,
  universe: ReadonlyMap<string, readonly string[]>,
  cost: Map<string, number>,
  today: string,
): { housing: ProgressPoint[]; packs: Map<string, ProgressPoint[]> } {
  const days = [...new Set([...hist.values()].flatMap((pts) => pts.map((p) => p.date.slice(0, 10))))]
    .filter((d) => d && d <= today).sort();
  const p = buildPhys(hist, days, today.slice(0, 7), universe, 'day');
  const packs = new Map<string, ProgressPoint[]>();
  for (const [key, pts] of p.phys) {
    packs.set(key, [...pts].map(([at, v]) => ({ at, v })));
  }
  /* Finance.pkgMonthsMap-тай ижил: бодит түлхүүр байвал холбоосоос давамгайлна. */
  for (const [src, { key }] of Object.entries(MAP_PKG_ALIAS)) {
    const pts = packs.get(src);
    if (pts && !packs.has(key)) packs.set(key, pts);
  }
  const housing = housingSeries(p.phys, p.physCnt, p.physAt, cost, days, p.physN, new Set(HOUSING_PKGS))
    .filter((s) => s.phys != null)
    .map((s) => ({ at: s.physAt ?? s.label, v: s.phys }));
  return { housing, packs };
}
