'use client';

/**
 * ЭРСДЭЛИЙН ГЕОМЕТР — үерийн зурвас ба утааны сэвсгэрийг БОДИТ давхаргаас
 * тооцож, зурагт (2D · 3D · BIM) нэг ижил дүрслэлээр гаргана.
 *
 * ══════════ ЮУ НЬ БОДИТ, ЮУ НЬ ЗАГВАР ══════════
 *
 * · ГОЛЫН ГЕОМЕТР нь ЖИНХЭНЭ: аппын каталогийн «Гол» давхарга (`sb:16`,
 *   data/FeatureServer/43). Үерийн зурвасыг түүний ИРМЭГЭЭС гадагш геодезийн
 *   буфер татаж гаргана — өөрөөр хэлбэл голын жинхэнэ мурий, өргөнийг дагана.
 *
 * · ӨРТӨХ ОБЪЕКТ нь ЖИНХЭНЭ: хэрэглэгчийн ИДЭВХТЭЙ давхаргуудаас (зурган дээр
 *   асаалттай нь) орон зайн огтлолцлоор шүүнэ — тоо, талбай, урт нь бодит
 *   геометрээс гарна.
 *
 * · ҮЕРИЙН ЗУРВАСЫН ӨРГӨН, УТААНЫ СЭВСГЭРИЙН ХЭМЖЭЭ нь ЗАГВАР (`ersdel.ts`-ийн
 *   `FLOOD_LEVELS` / `AIR_LEVELS`). Гидравлик загварчлал (HEC-RAS), Гауссын
 *   тархалтын бодит тооцоо хийгээгүй — түвшин бүрийн параметрийг ил гаргаж,
 *   тэдгээрээс геометрийг ЖИГД дүрмээр байгуулна.
 */

import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Polygon from '@arcgis/core/geometry/Polygon';
import Graphic from '@arcgis/core/Graphic';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import type MapView from '@arcgis/core/views/MapView';
import type SceneView from '@arcgis/core/views/SceneView';
import type FeatureLayer from '@arcgis/core/layers/FeatureLayer';

import { LAYER_BY_ID, layerUrl, oidOf, SELBE_ET } from '@/lib/services';
import { mapLayer } from '@/components/lazyLayers';
import { t as tr } from '@/lib/i18nCore';
import {
  AIR_LEVELS, FLOOD_LEVELS, FLOOD_SKIP_IDS, EXPOSURE, SEVERITY, buildingPeople, classOf, damageCost, queryRingsPaged,
  type DamageClass, type HazardKey, type LevelKey, type Station,
} from '@/lib/ersdel';
import { BF } from '@/lib/analysis/config';

/**
 * Давхаргын талбарын ЖИНХЭНЭ нэр (том/жижиг үсэг үл хамааран) — байхгүй бол null.
 */
const fieldOf = (fl: FeatureLayer, name: string): string | null => {
  const want = name.toLowerCase();
  return fl.fields?.find((f) => f.name.toLowerCase() === want)?.name ?? null;
};
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

type AnyView = MapView | SceneView;

/** Web Mercator — бүх геометрийг энд нэгтгэнэ (зургийн үндсэн SR) */
const WM = new SpatialReference({ wkid: 102100 });

/** Нэг дүрслэх бүс — үерт гүн (м), агаарт агууламж (µg/м³) */
export type Band = {
  key: string;
  /** Дэлгэцийн нэр — тайлбарт (легенд) */
  label: string;
  /** Үерт — усны гүн (м); агаарт — PM2.5 (µg/м³) */
  value: number;
  /** 3D-д өргөх өндөр (м) */
  height: number;
  /** Дүүргэлтийн өнгө (hex) */
  hue: string;
  geometry: Polygon;
};

/* ══════════════════════ Гол ══════════════════════ */

/** Голын давхаргын URL — каталогт байвал түүнээс, эс бөгөөс шууд [43] */
const RIVER_URL = (): string => {
  const def = LAYER_BY_ID['sb:16'];
  return def ? layerUrl(def) : `${SELBE_ET}/134`;
};

let riverCache: Polygon | null = null;
let riverPending: Promise<Polygon> | null = null;

/**
 * ГОЛЫН ПОЛИГОН — нэг удаа татаад кэшилнэ (хувилбар солих бүрд дахин татахгүй).
 */
export async function loadRiver(): Promise<Polygon> {
  if (riverCache) return riverCache;
  riverPending ??= (async () => {
    const rings = await queryRingsPaged(RIVER_URL(), {
      where: '1=1', outFields: '', returnGeometry: 'true', outSR: '102100',
      maxAllowableOffset: '2',
    });
    if (!rings.length) throw new Error(tr('Голын давхарга хоосон байна'));
    riverCache = new Polygon({ rings, spatialReference: WM });
    return riverCache;
  })();
  riverPending.catch(() => { riverPending = null; });
  return riverPending;
}

/* ══════════════════════ Үерийн зурвас ══════════════════════ */

/**
 * ҮЕРИЙН ГУРВАН БҮС — гүнээр.
 *
 * Гүний тархалт нь голоос хол болох тусам ГҮЕХЭН: ойрын гуравны нэгд бүтэн
 * гүн, дунд хэсэгт 55%, зах хэсэгт 25%.
 */
export async function floodBands(level: LevelKey): Promise<Band[]> {
  const p = FLOOD_LEVELS[level];
  const river = await loadRiver();
  const dists = [p.reach * 0.34, p.reach * 0.68, p.reach];
  const bufs = dists.map(
    (d) => geometryEngine.geodesicBuffer(river, d, 'meters') as unknown as Polygon,
  );
  const depth = [p.depth, p.depth * 0.55, p.depth * 0.25];
  const hue = ['#dc2626', '#dc2626', '#dc2626'];
  const label = [tr('Гүн ус'), tr('Дунд гүн'), tr('Захын ус')];

  const out: Band[] = [];
  for (let i = 0; i < bufs.length; i++) {
    // Гадна бүс бүрээс дотоод бүсийг ХАСНА → цагираг
    const geom = i === 0
      ? bufs[0]
      : (geometryEngine.difference(bufs[i], bufs[i - 1]) as unknown as Polygon | null);
    if (!geom) continue;
    out.push({
      key: `flood${i}`,
      label: label[i],
      value: depth[i],
      // 3D-д усны гадаргуу — гүнээрээ өргөгдөнө (гүн ус нь өндөр багана)
      height: depth[i],
      hue: hue[i],
      geometry: geom,
    });
  }
  return out.reverse();
}

/** Үерийн БҮХ зурвас (нэгдсэн) — өртсөн объектыг шүүх орон зайн шүүлтэд */
export async function floodExtent(level: LevelKey): Promise<Polygon> {
  const river = await loadRiver();
  return geometryEngine.geodesicBuffer(
    river, FLOOD_LEVELS[level].reach, 'meters',
  ) as unknown as Polygon;
}

/* ══════════════════════ Утааны сэвсгэр ══════════════════════ */

/** Метр → Web Mercator нэгж. WM нь өргөрөгт татагддаг тул 1/cos(φ) засвар. */
const wmScale = (lat: number) => 1 / Math.cos((lat * Math.PI) / 180);

/**
 * ГАУССЫН СЭВСГЭРИЙН ХӨЛ (footprint) — эх үүсвэрээс салхины дагуу сунасан.
 *
 * Хэлбэр нь бодит тархалтын зүй тогтлыг дагана: тэнхлэгийн дагуу зайн
 * функцээр өргөсөх (σy ∝ x^0.78 — Паскилл-Гиффордын D зэрэглэл), эх үүсвэр
 * дээрээ бага радиустай, төгсгөл рүүгээ мохоо.
 */
function plumeRing(
  cx: number, cy: number, lat: number,
  downwindDeg: number, lengthM: number, spreadM: number,
): number[][] {
  const k = wmScale(lat);
  const rad = (downwindDeg * Math.PI) / 180;
  // Азимут (хойноос цагийн зүүний дагуу) → чиглэлийн вектор
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  // Хөндлөн вектор (баруун гар тал)
  const px = uy;
  const py = -ux;

  const N = 26;
  const left: number[][] = [];
  const right: number[][] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const x = s * lengthM;
    // σy ∝ x^0.78 — эх дээрээ 12% өргөнтэй эхэлнэ (агшин зуурын хэлбэлзэл)
    const w = spreadM * (0.12 + 0.88 * Math.pow(s, 0.78));
    // Төгсгөл рүүгээ мохоо болгох (сүүлийн 12%-д хумигдана)
    const taper = s > 0.88 ? Math.sqrt(1 - ((s - 0.88) / 0.12) ** 2) : 1;
    const hw = w * taper;
    const bx = cx + (ux * x) * k;
    const by = cy + (uy * x) * k;
    left.push([bx + px * hw * k, by + py * hw * k]);
    right.push([bx - px * hw * k, by - py * hw * k]);
  }
  /**
   * Салхины ЭСРЭГ тал — хагас тойрог (эх үүсвэрийн эргэн тойрны тархалт).
   *
   * pos(θ) = төв + (u·cos θ + p·sin θ)·r,  θ: 90° (+p) → 180° (−u) → 270° (−p)
   */
  const back = spreadM * 0.22;
  const cap: number[][] = [];
  for (let a = 1; a < 10; a++) {
    const th = Math.PI / 2 + (a / 10) * Math.PI;
    const dp = Math.sin(th);
    const du = Math.cos(th);
    cap.push([
      cx + (px * dp + ux * du) * back * k,
      cy + (py * dp + uy * du) * back * k,
    ]);
  }
  const ring = [...right, ...left.reverse(), ...cap];
  ring.push(ring[0]);
  return ring;
}

/**
 * АГААРЫН БОХИРДЛЫН ГУРВАН БҮС — агууламжаар.
 *
 * Эх үүсвэр нь АГААРЫН ХАРУУЛУУД: тэдгээр нь гэр хорооллын зуухны бүсэд
 * байрлуулагдсан бөгөөд бодит хэмжилт хийгддэг цэг тул сэвсгэрийг тэднээс
 * эхлүүлэх нь загварын хувьд ч, тайлбарлахад ч зөв.
 */
/**
 * БОДИТ САЛХИ — сэвсгэрийн чиглэл, уртыг үүгээр дарна.
 */
export type WindNow = { dirDeg: number; speed: number };

/**
 * САЛХИНЫ ХУРДААР сэвсгэрийн хэлбэрийг тохируулна.
 *
 * Гауссын сэвсгэрийн загварын үндсэн зан төлөв: салхи хүчтэй болох тусам
 * бохирдол ДАГУУ нь сунаж, ХӨНДЛӨН нь нарийсна; намдах тусам эх үүсвэрийн
 * ойролцоо бөөгнөрч дугуйрна.
 */
export const windFactor = (real: number, assumed: number): number => {
  if (!Number.isFinite(real) || real <= 0 || assumed <= 0) return 1;
  return Math.max(0.4, Math.min(2.5, real / assumed));
};

/**
 * ХАРУУЛ ТУС БҮРИЙН PM2.5 заалт — `oid` → µg/м³.
 */
export type Pm25ByOid = Record<number, number>;

/**
 * @param wind БОДИТ салхи (Open-Meteo). Өгөөгүй бол хувилбарын тогтмол
 *   (`AIR_LEVELS[level].windDir/wind`) хэрэглэгдэнэ — хуучин зан төлөв.
 * @param pm25 ХАРУУЛ ТУС БҮРИЙН заалт. Өгвөл сэвсгэрийн урт нь тухайн
 *   харуулын утгаар масштаблагдана — бохир харуулаас урт, цэвэрээс богино.
 */
export function airBands(
  stations: Station[],
  level: LevelKey,
  wind?: WindNow | null,
  pm25?: Pm25ByOid | null,
): Band[] {
  const p = AIR_LEVELS[level];
  const air = stations.filter((s) => s.kind === 'air');
  if (!air.length) return [];
  const dirFrom = wind ? wind.dirDeg : p.windDir;
  const downwind = (dirFrom + 180) % 360;
  const k = wind ? windFactor(wind.speed, p.wind) : 1;
  const plumeLen = p.plume * k;
  const spreadW = p.spread / Math.sqrt(k);

  /** Агууламжийн гурван зэрэглэл — цөм, дунд, зах */
  const steps = [
    { f: 0.38, c: p.pm25, hue: '#7f1d1d', label: tr('Хамгийн өндөр агууламж') },
    { f: 0.7, c: p.pm25 * 0.6, hue: '#b45309', label: tr('Өндөр агууламж') },
    { f: 1, c: p.pm25 * 0.32, hue: '#ca8a04', label: tr('Дунд агууламж') },
  ];

  /**
   * ХАРУУЛЫН ЗААЛТААР сэвсгэрийн уртыг масштаблана — ХАРУУЛУУДЫН ДУНДЖААС
   * хэдэн хувь хазайснаар.
   */
  const vals = air.map((s) => pm25?.[s.oid]).filter(
    (v): v is number => v != null && Number.isFinite(v) && v > 0,
  );
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const kOf = (oid: number): number => {
    const v = pm25?.[oid];
    if (!mean || v == null || !Number.isFinite(v) || v <= 0) return 1;
    return Math.max(0.6, Math.min(1.7, v / mean));
  };

  const merged: (Polygon | null)[] = steps.map((st) => {
    const polys = air.map((s) => {
      // Харуулын байршил (WGS84) → Web Mercator
      const x = (s.lon * 20037508.34) / 180;
      const y =
        (Math.log(Math.tan(((90 + s.lat) * Math.PI) / 360)) / (Math.PI / 180)) *
        (20037508.34 / 180);
      const k = kOf(s.oid);
      const ring = plumeRing(x, y, s.lat, downwind, plumeLen * st.f * k, spreadW * st.f);
      return geometryEngine.simplify(
        new Polygon({ rings: [ring], spatialReference: WM }),
      ) as unknown as Polygon;
    });
    const u = polys.length > 1
      ? (geometryEngine.union(polys) as unknown as Polygon)
      : polys[0];
    return u ?? null;
  });

  const out: Band[] = [];
  for (let i = 0; i < steps.length; i++) {
    const cur = merged[i];
    if (!cur) continue;
    const inner = i === 0 ? null : merged[i - 1];
    const geom = inner
      ? (geometryEngine.difference(cur, inner) as unknown as Polygon | null)
      : cur;
    if (!geom) continue;
    out.push({
      key: `air${i}`,
      label: steps[i].label,
      value: steps[i].c,
      height: p.inversion * (i === 0 ? 1 : i === 1 ? 0.72 : 0.45),
      hue: steps[i].hue,
      geometry: geom,
    });
  }
  return out.reverse();
}

/** Агаарын бохирдлын БҮХ бүс (нэгдсэн) — өртсөн объектыг шүүхэд */
export function airExtent(
  stations: Station[],
  level: LevelKey,
  wind?: WindNow | null,
  pm25?: Pm25ByOid | null,
): Polygon | null {
  return bandsExtent(airBands(stations, level, wind, pm25));
}

/**
 * Бүсүүдийн НЭГДСЭН муж — бэлэн `Band[]`-аас (2026-10-09).
 */
export function bandsExtent(bands: Band[]): Polygon | null {
  if (!bands.length) return null;
  const geoms = bands.map((b) => b.geometry);
  return geoms.length > 1
    ? (geometryEngine.union(geoms) as unknown as Polygon)
    : geoms[0];
}

/**
 * Дарсан ЦЭГ аль бүсэд оров? — зурган дээрх мэдээллийн хайрцагт.
 *
 * Бүсүүд давхцахгүй тул эхний тохирол нь ганц зөв хариу.
 */
export function bandAt(bands: Band[], pt: __esri.Point): Band | null {
  for (const b of bands) {
    try {
      if (geometryEngine.contains(b.geometry, pt)) return b;
    } catch {
      // Огтлолцлын алдаа нэг бүсэд гарвал бусдыг үргэлжлүүлнэ
    }
  }
  return null;
}

/* ══════════════════════ Хохирлын тооцоо ══════════════════════ */

export type DamageRow = {
  layerId: string;
  title: string;
  geom: 'area' | 'line' | 'point';
  /** Хохирлын ангилал — нэгж үнэ үүнээс (`DAMAGE_RATE`) */
  cls: DamageClass;
  /** Өртөх оршин суугч — ЗӨВХӨН барилгын ангиллын давхаргад (агаарын хувилбар) */
  people: number;
  /** Өртсөн объектын тоо */
  n: number;
  /** Талбай (м²) — зөвхөн полигон давхаргад. `truncated` үед ТҮҮВРЭЭС шатлуулсан */
  area: number;
  /** Урт (м) — зөвхөн шугаман давхаргад. `truncated` үед ТҮҮВРЭЭС шатлуулсан */
  length: number;
  /**
   * Үнэлгээ (₮) — `area`/`length`-аас гарах тул `truncated` үед мөн тооцоолол.
   */
  cost: number | null;
  /**
   * Давхаргын өртсөн объектуудын ДЭЭД гүн (м) — үерт, `depthOf` өгсөн үед.
   */
  maxDepth: number | null;
  /**
   * ОБЪЕКТ ТУС БҮР (татагдсан `MAX_GEOM` хүртэл) — хүснэгт, CSV/GeoJSON экспортод.
   */
  objects: DamageObject[];
  /** Өртсөн объектын геометр — улаанаар зурахад (хамгийн ихдээ `MAX_GEOM`) */
  graphics: Graphic[];
  /**
   * Объектын тоо татагдсан геометрээс ОЛОН — зурагт зөвхөн эхний `MAX_GEOM`
   * улаанаар харагдана, `area`/`length`/`cost` нь ТҮҮВРЭЭС шатлуулсан тооцоо.
   */
  truncated: boolean;
  countFailed: boolean;
};

/** Нэг өртсөн объект — хүснэгт ба экспортын мөр */
export type DamageObject = {
  layerId: string;
  /** Эх давхаргын OID (байхгүй бол `null`) */
  oid: number | null;
  /** Аюулын мужид ОРСОН хэмжээ — талбай (м²) / урт (м); цэгт 1 */
  measure: number;
  /** Объект дээрх ДЭЭД гүн (м) — `null` = мэдэгдэхгүй */
  depth: number | null;
  /** Объектын үнэлгээ (₮) — `null` = тодорхойгүй (`damageCost`) */
  cost: number | null;
  /** Огтолсон геометр (WM) — GeoJSON экспортод */
  geometry: __esri.Geometry;
};

/** Нэг дуудалтад геометр татах ДЭЭД хязгаар — зураг гацаахаас хамгаална */
const MAX_GEOM = 1200;

/**
 * ИДЭВХТЭЙ давхарга бүрээс аюулын мужид ОРСОН объектыг шүүнэ.
 */
export async function damageOf(
  view: AnyView,
  layerIds: string[],
  hazard: Polygon,
  level: LevelKey,
  kind: HazardKey,
  opts: { depthOf?: (g: __esri.Geometry) => number | null } = {},
): Promise<{ rows: DamageRow[]; failed: string[]; analyzed: number }> {
  const sev = SEVERITY[level];
  const rows: DamageRow[] = [];
  /** Татагдаагүй давхаргын гарчиг — «эрсдэлгүй» ба «мэдээлэлгүй»-г ялгана */
  const failed: string[] = [];
  let analyzed = 0;

  for (const id of layerIds) {
    const def = LAYER_BY_ID[id];
    if (!def) continue;
    if (kind === 'flood' && FLOOD_SKIP_IDS.has(id)) continue;
    const fl = mapLayer(view.map, id) as FeatureLayer | null;
    if (!fl || typeof fl.queryFeatures !== 'function') continue;
    const geom: DamageRow['geom'] = def.geom === 'line' ? 'line' : def.geom === 'point' ? 'point' : 'area';

    try {
      const oid = oidOf(def);
      const cls = classOf(id, geom);
      if (cls === 'building' && typeof fl.load === 'function') await fl.load();
      const popF = cls === 'building' ? fieldOf(fl, BF.totalPop) : null;
      const gfaF = cls === 'building' ? fieldOf(fl, BF.gfa) : null;
      const q = fl.createQuery();
      q.geometry = hazard;
      q.spatialRelationship = 'intersects';
      q.returnGeometry = true;
      q.outFields = [oid, ...(popF ? [popF] : []), ...(gfaF ? [gfaF] : [])];
      q.outSpatialReference = WM;
      q.num = MAX_GEOM;
      const wantWithin = geom !== 'point';
      const qw = fl.createQuery();
      qw.geometry = hazard;
      qw.spatialRelationship = 'within';
      const [res, total, inside] = await Promise.all([
        fl.queryFeatures(q),
        fl.queryFeatureCount(q).catch(() => -1),
        wantWithin
          ? fl.queryObjectIds(qw)
            .then((ids) => new Set<number>((ids ?? []).map(Number)))
            .catch(() => new Set<number>())
          : Promise.resolve(new Set<number>()),
      ]);
      analyzed += 1;
      const countFailed = total < 0;
      const n = countFailed ? res.features.length : total;
      if (!n) continue;

      let area = 0;
      let length = 0;
      /** Өртсөн хүн — барилга бүрийн хүн ам × мужид орсон хувь (`buildingPeople`) */
      let peopleSum = 0;
      let maxDepth: number | null = null;
      const graphics: Graphic[] = [];
      const objects: DamageObject[] = [];
      for (const f of res.features) {
        const g = f.geometry;
        if (!g) continue;
        const fid = f.attributes?.[oid];
        const oidNum = fid == null ? null : Number(fid);
        const whole = geom === 'point' || (oidNum != null && inside.has(oidNum));
        const cut = whole ? g : geometryEngine.intersect(g, hazard) as __esri.Geometry | null;
        if (!cut) continue;
        let measure = 1;
        if (geom === 'area') {
          measure = Math.abs(geometryEngine.geodesicArea(cut as Polygon, 'square-meters'));
          area += measure;
          if (cls === 'building') {
            /* Мужид орсон ХУВЬ — бүтнээрээ орсон бол 1, эс бөгөөс огтлолцлын талбай ÷ бүтэн хөл */
            const full = whole ? measure : Math.abs(geometryEngine.geodesicArea(g as Polygon, 'square-meters'));
            const share = whole || !(full > 0) ? 1 : measure / full;
            peopleSum += buildingPeople(
              popF ? numOrNull(f.attributes?.[popF]) : null,
              gfaF ? numOrNull(f.attributes?.[gfaF]) : null,
              share, measure,
            );
          }
        } else if (geom === 'line') {
          measure = geometryEngine.geodesicLength(cut as __esri.Polyline, 'meters');
          length += measure;
        }
        const depth = opts.depthOf ? opts.depthOf(g) : null;
        if (depth != null && (maxDepth == null || depth > maxDepth)) maxDepth = depth;
        objects.push({
          layerId: id,
          oid: oidNum,
          measure,
          depth,
          cost: kind === 'air' ? null : damageCost(cls, geom, {
            area: geom === 'area' ? measure : 0,
            length: geom === 'line' ? measure : 0,
            n: 1,
          }, sev),
          geometry: cut,
        });
        graphics.push(new Graphic({
          geometry: cut,
          attributes: { layerId: id, oid: fid ?? null, depth },
        }));
      }

      /**
       * ҮНЭЛГЭЭ.
       */
      /**
       * `q.num = MAX_GEOM` тул `queryFeatures` хамгийн ихдээ 1,200 мөр буцаана,
       * харин `n` нь `queryFeatureCount`-ийн БҮТЭН тоо. Урьд нь `area`/`length`
       * зөвхөн ТАТАГДСАН объектуудаас хуримтлагдаж, `cost` тэднээс бодогддог
       * байв: 3-р түвшний зурваст 1,611 шугам орох давхаргад («Гадна дулаан»,
       * 92,000 ₮/м) хүснэгтэд «Тоо 1,611» гэж БҮТНЭЭР, харин «Хэмжээ» ба
       * «Үнэлгээ» нь 1,200-гийн уртаас буюу ~25% ДУТУУ гардаг байсан. UI-ийн
       * «зурагт тайрсан» тэмдэг нь зөвхөн ЗУРГИЙН дүрслэл дутуу гэж
       * ойлгуулж, хэмжээ ба үнэлгээ мөн тайрагдсаныг НУУДАГ байв.
       */
      const fetched = res.features.length;
      const scale = fetched > 0 && n > fetched ? n / fetched : 1;
      area *= scale;
      length *= scale;

      const people = cls === 'building' ? peopleSum * scale : 0;

      const cost = kind === 'air'
        ? people * EXPOSURE.costPerPersonDay * (AIR_LEVELS[level].hours / 24)
        : damageCost(cls, geom, { area, length, n }, sev);

      rows.push({
        layerId: id, title: def.title, geom, cls, n, area, length, people, cost, graphics,
        maxDepth, objects,
        truncated: countFailed || n > fetched,
        countFailed,
      });
    } catch {
      /**
       * Нэг давхарга унасан нь бусдыг зогсоох ёсгүй нь ЗӨВ. Гэвч урьд нь
       * зүгээр `continue` хийдэг байсан тул тэр давхарга нийлбэрт 0 нэмж,
       * дэлгэц нь «N давхарга шинжлэв» гэж БҮТЭН тоо зарладаг байв —
       * бүгд унавал «өртсөн объект олдсонгүй» гэсэн БАТАЛГАА гарна.
       * Эрсдэлийн тоо аюулгүй байдлын шийдвэрт ордог тул «мэдээлэлгүй»
       * ба «эрсдэлгүй» хоёрыг ялгах ёстой. Одоо унасныг нэрээр нь буцаана.
       */
      failed.push(def.title || id);
      continue;
    }
  }
  const costKey = (r: DamageRow) => (r.cost == null ? -Infinity : r.cost);
  return { rows: rows.sort((a, b) => costKey(b) - costKey(a) || b.n - a.n), failed, analyzed };
}
