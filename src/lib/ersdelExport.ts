/**
 * ӨРТСӨН ОБЪЕКТ ба ҮЕРИЙН МӨРИЙГ ЭКСПОРТЛОХ — CSV · GeoJSON (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *
 * ⚠️ ЦЭВЭР функцууд (ArcGIS SDK-гүй) — геометрийг `type`/`x`/`paths`/`rings`
 *    шинжээр нь уншина, тиймээс Node тестэд энгийн объектоор шалгагдана.
 * ⚠️ GeoJSON нь RFC 7946: WGS84 (lon, lat), ГАДНА цагираг цагийн зүүний ЭСРЭГ,
 *    нүх нь цагийн зүүний ДАГУУ. ArcGIS-ийн полигон эсрэг дүрэмтэй (гадна нь
 *    цагийн зүүний дагуу) тул эргүүлж, нүхийг харьяа гадна цагирагт нь оноож
 *    MultiPolygon болгоно — эс бөгөөс QGIS/geojson.io нүхийг «арал» гэж зурна.
 */

import { t as tr } from '@/lib/i18nCore';
import { toCsv } from '@/lib/csvFile';

/** Web Mercator → [lon, lat] (6 оронтой — ~0.1 м) */
export function wmToLonLat(x: number, y: number): [number, number] {
  const lon = (x / 20037508.342789244) * 180;
  const lat = (Math.atan(Math.exp((y / 20037508.342789244) * Math.PI)) * 360) / Math.PI - 90;
  return [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
}

/** Тэмдэгтэй талбай (shoelace) — сөрөг = цагийн зүүний дагуу (y дээшээ тэнхлэгт) */
function signedArea(r: number[][]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

function inRing(r: number[][], x: number, y: number): boolean {
  let on = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
  }
  return on;
}

const closeRing = (r: number[][]): number[][] => {
  if (!r.length) return r;
  const a = r[0];
  const b = r[r.length - 1];
  return a[0] === b[0] && a[1] === b[1] ? r : [...r, a];
};

/**
 * ArcGIS цагирагууд (WM) → GeoJSON MultiPolygon-ийн координат.
 * Гадна = цагийн зүүний дагуу (сөрөг талбай); нүх = эсрэг. Гадна огт олдохгүй
 * бол (эсрэг эргэлттэй эх) бүгдийг гадна гэж үзнэ.
 */
export function ringsToMultiPolygon(rings: number[][][]): number[][][][] {
  const rs = rings.filter((r) => r.length >= 3).map(closeRing);
  let outers = rs.filter((r) => signedArea(r) < 0);
  let holes = rs.filter((r) => signedArea(r) >= 0);
  if (!outers.length) { outers = rs; holes = []; }
  const polys: { outer: number[][]; holes: number[][][]; area: number }[] =
    outers.map((o) => ({ outer: o, holes: [], area: Math.abs(signedArea(o)) }));
  for (const h of holes) {
    /* Нүхийг АГУУЛСАН хамгийн жижиг гадна цагирагт */
    let best: (typeof polys)[number] | null = null;
    for (const p of polys) {
      if (inRing(p.outer, h[0][0], h[0][1]) && (!best || p.area < best.area)) best = p;
    }
    if (best) best.holes.push(h);
  }
  const ll = (r: number[][]) => r.map(([x, y]) => wmToLonLat(x, y));
  /* RFC 7946: гадна CCW, нүх CW — ArcGIS-ийн эсрэг тул хоёуланг нь урвуулна */
  return polys.map((p) => [
    ll(signedArea(p.outer) < 0 ? [...p.outer].reverse() : p.outer),
    ...p.holes.map((h) => ll(signedArea(h) > 0 ? [...h].reverse() : h)),
  ]);
}

/** ArcGIS геометрийн хэлбэр (класс биш — шинжээр) */
export type GeomLike =
  | { type: 'point'; x: number; y: number }
  | { type: 'polyline'; paths: number[][][] }
  | { type: 'polygon'; rings: number[][][] }
  | { type: string };

/** ArcGIS геометр (WM) → GeoJSON геометр; танихгүй бол `null` */
export function toGeoJSONGeometry(g: GeomLike | null | undefined): Record<string, unknown> | null {
  if (!g) return null;
  if (g.type === 'point' && 'x' in g) return { type: 'Point', coordinates: wmToLonLat(g.x, g.y) };
  if (g.type === 'polyline' && 'paths' in g) {
    const paths = g.paths.filter((p) => p.length >= 2).map((p) => p.map(([x, y]) => wmToLonLat(x, y)));
    return paths.length === 1
      ? { type: 'LineString', coordinates: paths[0] }
      : { type: 'MultiLineString', coordinates: paths };
  }
  if (g.type === 'polygon' && 'rings' in g) {
    const mp = ringsToMultiPolygon(g.rings);
    return mp.length === 1 ? { type: 'Polygon', coordinates: mp[0] } : { type: 'MultiPolygon', coordinates: mp };
  }
  return null;
}

/** Экспортын нэг объект — `DamageObject`-ийн экспортод хэрэгтэй хэсэг */
export type ExportObject = {
  layerId: string;
  oid: number | null;
  measure: number;
  depth: number | null;
  cost: number | null;
  geometry: GeomLike;
};

/** Экспортын нэг давхарга — `DamageRow`-ийн хэсэг */
export type ExportRow = {
  layerId: string;
  title: string;
  geom: 'area' | 'line' | 'point';
  clsLabel: string;
  objects: ExportObject[];
};

/** Хэмжээний нэгж — геометрээс */
const unitOf = (geom: ExportRow['geom']) => (geom === 'area' ? 'm2' : geom === 'line' ? 'm' : 'ea');

/**
 * ӨРТСӨН ОБЪЕКТУУДЫН CSV.
 * ⚠️ Гүн/өртөг мэдэгдэхгүй бол нүд ХООСОН (0 БИШ). Хэмжээ нь мужид ОРСОН хэсэг.
 */
export function damageCsv(rows: ExportRow[]): string {
  const header = [
    tr('Давхарга'), 'layer_id', 'oid', tr('Ангилал'), tr('Хэмжээ'), tr('Нэгж'),
    tr('Дээд гүн (м)'), tr('Үнэлгээ (₮)'),
  ];
  const out: unknown[][] = [];
  for (const r of rows) {
    for (const o of r.objects) {
      out.push([
        r.title, r.layerId, o.oid, r.clsLabel,
        Math.round(o.measure * 100) / 100, unitOf(r.geom),
        o.depth == null ? null : Math.round(o.depth * 100) / 100,
        o.cost == null ? null : Math.round(o.cost),
      ]);
    }
  }
  return toCsv(header, out);
}

/**
 * ӨРТСӨН ОБЪЕКТ + ҮЕРИЙН МӨРИЙН GeoJSON (FeatureCollection).
 * @param footprint үерийн мөрийн цагирагууд (WM) — байхгүй бол зөвхөн объектууд
 * @param props     мөрийн шинж (түвшин, дээд гүн …)
 */
export function damageGeoJSON(
  rows: ExportRow[],
  footprint: number[][][] | null,
  props: Record<string, unknown> = {},
): string {
  const features: Record<string, unknown>[] = [];
  if (footprint?.length) {
    const g = toGeoJSONGeometry({ type: 'polygon', rings: footprint });
    if (g) features.push({ type: 'Feature', geometry: g, properties: { kind: 'flood_footprint', ...props } });
  }
  for (const r of rows) {
    for (const o of r.objects) {
      const g = toGeoJSONGeometry(o.geometry);
      if (!g) continue;
      features.push({
        type: 'Feature',
        geometry: g,
        properties: {
          kind: 'affected',
          layer: r.title,
          layer_id: r.layerId,
          oid: o.oid,
          class: r.clsLabel,
          measure: Math.round(o.measure * 100) / 100,
          unit: unitOf(r.geom),
          depth_max_m: o.depth == null ? null : Math.round(o.depth * 100) / 100,
          cost_mnt: o.cost == null ? null : Math.round(o.cost),
        },
      });
    }
  }
  return JSON.stringify({ type: 'FeatureCollection', features });
}
