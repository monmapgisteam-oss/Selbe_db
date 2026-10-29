/**
 * СИМУЛЯЦЫН ДУЛААНЫ ГАДАРГУУ — полигон будалтын ОРОЛЦООТ хувилбар.
 */

import { type PopBasis } from './simulation';
import { t as tr } from '@/lib/i18nCore';
import { buildingValue, tModeDef, type TMode, type TransportCtx } from './transportModes';
import type { BuildingPt } from './buildings';
import { zoneCanon, zoneRefValues } from '@/lib/services';

/** Газрын зургийн хэв маяг — «Симуляц» горимд л утгатай */
export type MapStyle = 'poly' | 'heat';

export const MAP_STYLES: { key: MapStyle; label: string; title: string }[] = [
  { key: 'poly', get label() { return tr('Полигон'); }, get title() { return tr('Бүс/барилгын хилээр будна'); } },
  { key: 'heat', get label() { return tr('Дулаан'); }, get title() { return tr('Хилгүй дулааны гадаргуу — төвлөрөл хаана байгааг харуулна'); } },
];

/** Дулааны гадаргууг тэжээх нэг цэг */
export type HeatPoint = { x: number; y: number; w: number };

/**
 * «ХҮН АМЫН ТӨВЛӨРӨЛ» симуляцын дулааны цэгүүд.
 */
function zoneIdOf(raw: string | null, ids: Set<string>): string | null {
  const id = zoneCanon(raw);
  if (!id) return null;
  if (ids.has(id)) return id;
  /* Хуваагдсан бүс: «D-8» → `D-8.1`/`D-8.2`-ийн эхнийх */
  const split = zoneRefValues(id).map(zoneCanon).find((c) => ids.has(c));
  if (split) return split;
  /* Дэд дугаартай код эцэг бүс рүүгээ буулгана: «B-2.1» → «B-2» */
  const parent = id.replace(/\.\d+$/, '');
  return ids.has(parent) ? parent : null;
}

export function densityHeat(
  buildings: BuildingPt[],
  popBasis: PopBasis,
  zoneIds: Set<string>,
): HeatPoint[] {
  const out: HeatPoint[] = [];
  for (const b of buildings) {
    if (!zoneIdOf(b.zone, zoneIds)) continue;
    const res = b.cat === 'residential';
    if (popBasis === 'resident' && !res) continue;
    if (popBasis === 'capacity' && res) continue;
    const w = res ? b.population : b.capacity;
    if (w > 0) out.push({ x: b.x, y: b.y, w });
  }
  return out;
}

/**
 * ТЭЭВЭР-ИДЭВХИЙН дулааны цэгүүд.
 *   · барилгын дүрслэл → барилгын центроид, дүрслэлийн утгаар
 *   · замын дүрслэл    → хэрчмийн ДУНД цэг, эрэлтээр
 */
export function transportHeat(ctx: TransportCtx, mode: TMode): HeatPoint[] {
  const out: HeatPoint[] = [];

  if (tModeDef(mode).target === 'road') {
    for (let i = 0; i < ctx.demand.edgeDemand.length; i++) {
      const w = ctx.demand.edgeDemand[i];
      if (w <= 0) continue;
      const pts = ctx.net.edges[i].pts;
      const m = pts[Math.floor(pts.length / 2)];
      if (m) out.push({ x: m[0], y: m[1], w });
    }
    return out;
  }

  for (let i = 0; i < ctx.buildings.length; i++) {
    const b = ctx.buildings[i];
    const v = buildingValue(b, mode, ctx, i);
    if (v == null || !Number.isFinite(v) || v <= 0) continue;
    out.push({ x: b.x, y: b.y, w: v });
  }
  return out;
}
