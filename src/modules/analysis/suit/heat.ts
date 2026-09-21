/**
 * СИМУЛЯЦЫН ДУЛААНЫ ГАДАРГУУ — полигон будалтын ОРОЛЦООТ хувилбар.
 *
 * ⚠️ Полигон будалт нь «аль БҮС халуун вэ» гэдгийг заадаг; дулааны гадаргуу нь
 * хилийг үл хамааран «хаана ТӨВЛӨРӨЛ байна вэ» гэдгийг заана. Хоёулаа ижил
 * тоонуудаас гарах ч ӨӨР асуултад хариулдаг тул хэрэглэгч сонгоно
 * (`Suitability.mapStyle`).
 *
 * ⚠️ Энэ модуль зөвхөн ЖИНТЭЙ ЦЭГ бэлтгэнэ. Дулааны цөмийг (kernel) ArcGIS-ийн
 * `HeatmapRenderer` бодох бөгөөд нягтралын хязгаарыг smartMapping тохируулна —
 * `SuitMap`-ийг үз.
 */

import { type PopBasis } from './simulation';
import { t as tr } from '@/lib/i18nCore';
import { buildingValue, tModeDef, type TMode, type TransportCtx } from './transportModes';
import type { BuildingPt } from './buildings';
import { zoneCanon, zoneRefValues } from '@/lib/services';

/** Газрын зургийн хэв маяг — «Симуляц» горимд л утгатай */
export type MapStyle = 'poly' | 'heat';

export const MAP_STYLES: { key: MapStyle; label: string; title: string }[] = [
  { key: 'poly', label: tr('Полигон'), title: tr('Бүс/барилгын хилээр будна') },
  { key: 'heat', label: tr('Дулаан'), title: tr('Хилгүй дулааны гадаргуу — төвлөрөл хаана байгааг харуулна') },
];

/** Дулааны гадаргууг тэжээх нэг цэг */
export type HeatPoint = { x: number; y: number; w: number };

/**
 * «ХҮН АМЫН ТӨВЛӨРӨЛ» симуляцын дулааны цэгүүд.
 *
 * ⚠️ Цэг нь БАРИЛГЫН центроид, БҮСИЙНХ БИШ. Бүсийн центроид ашиглавал 12 га
 * бүсийн бүх хүн ам нэг цэг дээр бөөгнөрч, барилга үнэндээ хаана байгаа нь
 * алдагдана. Барилгаар өгснөөр дулааны гадаргуу бодит байрлалаас гарна.
 *
 * ⚠️ Жин нь АБСОЛЮТ ТОО (хүн), нягтрал (хүн/га) БИШ. Heatmap нь цөмүүдийг
 * НЭМДЭГ тул харьцаа нэмэх нь утгагүй; орон зайн тархалтыг цөм өөрөө хийнэ.
 *
 * ⚠️ `zoneIds` — бүсийн ангиллын шүүлт. Бүсэд хамаарахгүй барилга («Бүсийн
 * мэдээлэл байхгүй») шүүгдэж хасагдана.
 *
 * ⚠️ БАРИЛГЫН `ZONE_ID`-г ЗУРАГЛАНА, шууд жишихгүй (2026-09-15-ны аудит).
 * `b.zone` нь `buildings.ts`-ийн ТҮҮХИЙ утга, харин `zoneIds` нь `zoneCanon`
 * -оор хэвийн болсон `rows[].id`. Аудитын үед барилгууд ХУУЧИН «D-8» кодтой
 * атал бүс нь `D-8.1`/`D-8.2` болсон тул тэдгээр барилга дулааны гадаргуугаас
 * ЧИМЭЭГҮЙ унадаг байв; «E-5-1» гэх бичиглэлийн зөрүү ч таарахгүй байлаа.
 *
 * ⚠️ 2026-09-21 (тайлбар шинэчлэв): амьд барилгын давхаргын `ZONE_ID` одоо
 * ШИНЭ кодтой (B-2 · D-8.1 · D-8.2 · E-5 · E-5.1) тул хэвийн замд эхний
 * `ids.has(id)` шалгуур л ажиллана. Доорх `ZONE_SPLIT`/эцэг бүсийн салбарууд
 * нь ХУУЧИН кодтой дата (өөр хувилбар, архив) руу ухрах хамгаалалт хэвээр —
 * `data.ts`-ийн `resolveZoneId`-тай ижил дүрэм тул хасахгүй.
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
    // ⚠️ Барилга бүр ЗӨВХӨН ӨӨРИЙН нэг тоог өгнө — хүн ам ба багтаамжийг
    //    НЭМЭХГҮЙ. «Нийт» гэдэг нь «хоёуланг нь харуул» гэсэн үг, «нэмэх» биш.
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
