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
 *
 * ⚠️ 3D/BIM: ArcGIS-ийн `SceneView` нь `featureEffect`-ийг үл тоомсорлодог
 * (MapCanvas-ийн `MapProvider` тайлбар) тул тодруулгаар ЯВАХГҮЙ. Иймд үр дүнг
 * ГРАФИКААР зурна — график нь MapView, SceneView ХОЁУЛАНД ижил ажиллана.
 */

import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Polygon from '@arcgis/core/geometry/Polygon';
import Graphic from '@arcgis/core/Graphic';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import type MapView from '@arcgis/core/views/MapView';
import type SceneView from '@arcgis/core/views/SceneView';
import type FeatureLayer from '@arcgis/core/layers/FeatureLayer';

import { LAYER_BY_ID, layerUrl, oidOf, TD } from '@/lib/services';
import { t as tr } from '@/lib/i18nCore';
import {
  AIR_LEVELS, DAMAGE_RATE, FLOOD_LEVELS, FLOOD_SKIP_IDS, EXPOSURE, SEVERITY, classOf,
  type DamageClass, type HazardKey, type LevelKey, type Station,
} from '@/lib/ersdel';

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
  return def ? layerUrl(def) : `${TD}/43`;
};

let riverCache: Polygon | null = null;

/**
 * ГОЛЫН ПОЛИГОН — нэг удаа татаад кэшилнэ (хувилбар солих бүрд дахин татахгүй).
 * ⚠️ `outSR=102100` — буфер, огтлолцол бүгд нэг SR дээр бодогдоно.
 */
export async function loadRiver(): Promise<Polygon> {
  if (riverCache) return riverCache;
  const params = new URLSearchParams({
    where: '1=1', outFields: '', returnGeometry: 'true', outSR: '102100',
    /**
     * ⚠️ ЕРӨНХИЙЛӨЛТ (2 м). Голын полигон нь 4,376 оройтой — түүнийг гурван удаа
     * буфердэх нь браузарыг хэдэн секунд гацаана. 2 м-ийн хүлцэлд орой 572 болж
     * буурах бөгөөд 100 м-ийн үерийн зурваст ялгаа нь нүдэнд харагдахгүй
     * (амьдаар хэмжив: 4,376 → 572).
     */
    maxAllowableOffset: '2',
    f: 'json',
  });
  const res = await fetch(`${RIVER_URL()}/query?${params}`, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? 'ArcGIS error');
  const rings = (body.features ?? []).flatMap(
    (f: { geometry?: { rings?: number[][][] } }) => f.geometry?.rings ?? [],
  );
  if (!rings.length) throw new Error(tr('Голын давхарга хоосон байна'));
  riverCache = new Polygon({ rings, spatialReference: WM });
  return riverCache;
}

/* ══════════════════════ Үерийн зурвас ══════════════════════ */

/**
 * ҮЕРИЙН ГУРВАН БҮС — гүнээр.
 *
 * ⚠️ БҮСҮҮД нь ХООРОНДОО ДАВХЦАХГҮЙ (`difference`-ээр цагираг болгосон). Давхцсан
 * полигоныг хагас тунгалагаар давхарлавал гүн бүсийн өнгө гаднахтайгаа
 * нийлж, «гүн ус хаана байна» гэдэг нь уншигдахаа больдог.
 *
 * Гүний тархалт нь голоос хол болох тусам ГҮЕХЭН: ойрын гуравны нэгд бүтэн
 * гүн, дунд хэсэгт 55%, зах хэсэгт 25%.
 *
 * ⚠️ Энэ нь ОБЕГ-ын CRF загварчлалаас ТУСДАА, давтагдалд суурилсан хувилбар
 * (`ersdel.ts` §FLOOD_LEVELS). Урсаж буй бодит ус нь `uyr.ts`-ийн растер.
 */
export async function floodBands(level: LevelKey): Promise<Band[]> {
  const p = FLOOD_LEVELS[level];
  const river = await loadRiver();
  const dists = [p.reach * 0.34, p.reach * 0.68, p.reach];
  const bufs = dists.map(
    (d) => geometryEngine.geodesicBuffer(river, d, 'meters') as unknown as Polygon,
  );
  const depth = [p.depth, p.depth * 0.55, p.depth * 0.25];
  /**
   * ⚠️ 2026-08-29: ГУРВАН ӨНГИЙГ НЭГ болгов (хүсэлт: «аюулын бүс адилхан
   * өнгөөр»). Урьд нь гүнээр гурван цэнхэр (гүн → цайвар) байсан тул төслийн
   * ХИЛЭЭС ГАДУУР үргэлжлэх захын бүс нь өөр өнгөтэй болж, нэг аюулын муж
   * ХОЁР ӨӨР зүйл мэт уншигдаж байв.
   *
   * ⚠️ Цагирган БҮТЭЦ хэвээр: 3D-ийн өргөлт (`height`) ба тайлбар (`label`)
   * нь гүний ялгааг үүрсээр байна — зөвхөн ДҮҮРГЭЛТИЙН өнгө нэгдэв.
   */
  /**
   * ⚠️ 2026-09-03: ХОХИРЛЫН УЛААНТАЙ (`Overlay.DAMAGE` = `#dc2626`) НЭГ
   * болгов (хэрэглэгчийн хүсэлт). Урьд нь цэнхэр (`#1d4ed8`) байсан тул
   * зурган дээр «үерийн эрсдэл» гэдэг НЭГ ойлголт хоёр өөр өнгөөр
   * (цэнхэр муж + улаан объект) зурагдаж, тэдгээр нь ӨӨР зүйл мэт
   * уншигдаж байв.
   *
   * ⚠️ Урсаж буй УС нь ХӨХ хэвээр (`uyr.ts` §DEPTH_STOPS) — тэр нь
   * загварчлалын БОДИТ үр дүн, эрсдэлийн зурвасаас ӨӨР зүйл тул өнгө нь
   * ялгаатай байх ЁСТОЙ.
   */
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
  // ⚠️ Гүн бүсийг ХАМГИЙН СҮҮЛД зурна (дээр гарна) — зурах дараалал нь массивын
  //    дараалал тул урвуулна.
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
 *
 * ⚠️ Салхины эсрэг тал руу БАГА зэрэг тархана (эргэлт, шөнийн зогсонги агаар) —
 * тэгэхгүй бол сэвсгэр эх үүсвэр дээрээ таслагдсан, зохиомол харагдана.
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
   * ⚠️ Нумын ЧИГЛЭЛ чухал: гадна хүрээ нь `right` (−p тал, s: 0→1) → `left`
   * урвуугаар (+p тал, s: 1→0) гэж явдаг тул нум нь +p-ээс АРАГШ (−u) эргэж
   * −p дээр ирж хаагдах ёстой. Урьд нь нум УРАГШ гарч өөрөө өөрийгөө огтолж,
   * полигон нь «simple» биш болдог байв (амьдаар шалгав: `isSimple` false,
   * `simplify` нь хоёр цагираг болгон салгаж байлаа) — тийм полигон дээр
   * `union`/`difference` тогтворгүй ажиллана.
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
 *
 * ⚠️ Бүсүүд ХООРОНДОО ДАВХЦАХГҮЙ (үертэй ижил дүрэм) — эс бөгөөс агууламжийн
 * зэрэглэл өнгө дээр нийлж уншигдахаа болино.
 */
/**
 * БОДИТ САЛХИ — сэвсгэрийн чиглэл, уртыг үүгээр дарна.
 *
 * ⚠️ `dirDeg` нь цаг уурын конвенц: салхи ХААНААС үлээж байгаа (0° = хойноос).
 * `salhi.ts`-ийн `WindHour` яг ийм утга өгдөг тул хөрвүүлэлгүй дамжина.
 */
export type WindNow = { dirDeg: number; speed: number };

/**
 * САЛХИНЫ ХУРДААР сэвсгэрийн хэлбэрийг тохируулна.
 *
 * Гауссын сэвсгэрийн загварын үндсэн зан төлөв: салхи хүчтэй болох тусам
 * бохирдол ДАГУУ нь сунаж, ХӨНДЛӨН нь нарийсна; намдах тусам эх үүсвэрийн
 * ойролцоо бөөгнөрч дугуйрна.
 *
 * ⚠️ Хувилбарын тогтмолтой (`AIR_LEVELS[level].wind`) ХАРЬЦУУЛЖ бодно —
 * абсолют хурдаар үржүүлбэл 3-р түвшний (0.6 м/с) намуухан хувилбар 7 м/с-ийн
 * бодит салхинд 12 дахин сунаж, хувилбарын утга учир алдагдана.
 *
 * ⚠️ ХЯЗГААРЛАСАН (0.4…2.5): Open-Meteo-гийн ганц цагийн онцгой заалт
 * (шуурга эсвэл бүрэн намдалт) загварыг утгагүй хэлбэрт оруулахаас сэргийлнэ.
 */
const windFactor = (real: number, assumed: number): number => {
  if (!Number.isFinite(real) || real <= 0 || assumed <= 0) return 1;
  return Math.max(0.4, Math.min(2.5, real / assumed));
};

/**
 * ХАРУУЛ ТУС БҮРИЙН PM2.5 заалт — `oid` → µg/м³.
 *
 * ⚠️ Эдгээр давхаргад утгын талбар БАЙХГҮЙ тул заалт нь `ersdel.ts`-ийн
 * ДЕТЕРМИНИСТ загвараас гардаг (жишээ өгөгдөл). Гэсэн ч харуул тус бүр
 * ӨӨР утгатай байдаг нь чухал: бүх сэвсгэрийг нэг тогтмолоор зурвал
 * «хаана нь илүү бохир вэ» гэсэн асуулт зурган дээр хариултгүй үлдэнэ.
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
  /**
   * ⚠️ БОДИТ САЛХИ ДАВАМГАЙЛНА (2026-09-03, хэрэглэгчийн хүсэлт). Урьд нь
   * зөвхөн `p.windDir` (300°/315° тогтмол) байсан тул сэвсгэр нь бодит
   * цаг агаараас ҮЛ ХАМААРАН ҮРГЭЛЖ нэг зүг рүү чиглэж, «таамаглал» нь
   * өдөр бүр ижил зураг гаргадаг байв.
   */
  const dirFrom = wind ? wind.dirDeg : p.windDir;
  const downwind = (dirFrom + 180) % 360;
  const k = wind ? windFactor(wind.speed, p.wind) : 1;
  const plumeLen = p.plume * k;
  /* ⚠️ Хөндлөн тархалт нь урттай ЭСРЭГ — эзлэхүүн ойролцоогоор хадгалагдана */
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
   *
   * ⚠️ ХУВИЛБАРЫН PM2.5-ТАЙ ХАРЬЦУУЛЖ БОЛОХГҮЙ. Тэгж бодоод амьдаар шалгахад
   * ДӨРВҮҮЛЭЭ ижил коэффициент (0.60) гарч, харуул хоорондын ялгаа бүрмөсөн
   * алга болж байв. Учир нь харуулын жишээ заалт нь ЗУНЫ утга (11–15 µg/м³)
   * бол хувилбарын тоо нь ӨВЛИЙН инверсийнх (85/165/320) — харьцаа нь үргэлж
   * 0.2-оос бага гарч хязгаартаа шаваад зогсоно.
   *
   * ⚠️ Дундажтай харьцуулах нь улирлын түвшнээс ҮЛ ХАМААРНА: «энэ харуул
   * бусдаасаа 20% бохир» гэдэг нь зун ч өвөл ч ижил утгатай.
   *
   * ⚠️ 0.6…1.7-д ХЯЗГААРЛАВ: нэг харуулын онцгой заалт нь бусдаас олон дахин
   * урт сэвсгэр гаргавал зураг «нэг цэгийн осол» мэт болж, бүсийн ерөнхий
   * дүр зураг алдагдана.
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
      /* ⚠️ Урт нь харуулын заалтаар, өргөн нь ҮГҮЙ: Гауссын сэвсгэрт
         хөндлөн тархалт нь агууламжаас БИШ, зайнаас хамаарна. */
      const k = kOf(s.oid);
      const ring = plumeRing(x, y, s.lat, downwind, plumeLen * st.f * k, spreadW * st.f);
      /**
       * ⚠️ `simplify` — цагирагийн ЧИГЛЭЛ (ArcGIS-д гадна хүрээ нь цагийн зүүний
       * дагуу) ба өөрийгөө огтлолцлыг ЗАСНА. Хийхгүй бол `union`/`difference`
       * буруу үр дүн (эсвэл `null`) буцааж, бүс огт зурагдахгүй байх эрсдэлтэй.
       */
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
      // ⚠️ 3D-д ИНВЕРСИЙН давхарга — утаа тэр өндөрт «таглагдана». Цөмд өтгөн
      //    тул илүү өндөр багана; зах руугаа нимгэрнэ.
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
  /* ⚠️ `wind` ба `pm25`-ыг ЗААВАЛ дамжуулна — эс бөгөөс хамрах хүрээ нь
     зурагдсан бүсээс ӨӨР хэлбэртэй тооцогдож, хохирлын үнэлгээ буруу
     объект тоолно. */
  const bands = airBands(stations, level, wind, pm25);
  if (!bands.length) return null;
  const geoms = bands.map((b) => b.geometry);
  return geoms.length > 1
    ? (geometryEngine.union(geoms) as unknown as Polygon)
    : geoms[0];
}

/**
 * Дарсан ЦЭГ аль бүсэд оров? — зурган дээрх мэдээллийн хайрцагт.
 *
 * ⚠️ `hitTest` БИШ: 3D-д торон гадаргуу нь туяаг түрүүлж таслах тул график
 * заримдаа огт буцаж ирдэггүй (`MapCanvas`-ийн `pickByQuery` тайлбартай ижил
 * шалтгаан). Геометр нь клиент дээр аль хэдийн байгаа тул `contains` нь
 * рендерээс ҮЛ ХАМААРАН 2D, 3D, BIM гуравт ижил ажиллана.
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
  /** Үнэлгээ (₮) — `area`/`length`-аас гарах тул `truncated` үед мөн тооцоолол */
  cost: number;
  /** Өртсөн объектын геометр — улаанаар зурахад (хамгийн ихдээ `MAX_GEOM`) */
  graphics: Graphic[];
  /**
   * Объектын тоо татагдсан геометрээс ОЛОН — зурагт зөвхөн эхний `MAX_GEOM`
   * улаанаар харагдана, `area`/`length`/`cost` нь ТҮҮВРЭЭС шатлуулсан тооцоо.
   * ⚠️ UI-д «зөвхөн зураг дутуу» гэж ойлгуулах шошго тавьж БОЛОХГҮЙ.
   */
  truncated: boolean;
};

/** Нэг дуудалтад геометр татах ДЭЭД хязгаар — зураг гацаахаас хамгаална */
const MAX_GEOM = 1200;

/**
 * ИДЭВХТЭЙ давхарга бүрээс аюулын мужид ОРСОН объектыг шүүнэ.
 *
 * ⚠️ Давхаргыг ЗУРГААС (`view.map`) олно — REST рүү дахин хандахгүй: давхарга
 * аль хэдийн ачаалагдсан, түүний `queryFeatures` нь идэвхтэй шүүлт
 * (`definitionExpression`, бүсийн шүүлт)-ийг ХҮНДЭТГЭНЭ. REST-ээр асуувал
 * хэрэглэгчийн харж буй зурагтай зөрсөн тоо гарна.
 */
export async function damageOf(
  view: AnyView,
  layerIds: string[],
  hazard: Polygon,
  level: LevelKey,
  kind: HazardKey,
/**
 * ⚠️ БУЦААХ УТГА ӨӨРЧЛӨГДСӨН (2026-09-03-ны аудит): мөрүүдээс ГАДНА
 * УНАСАН давхаргын нэрсийг ч буцаана. Урьд нь унасан давхарга чимээгүй
 * алгасагдаж нийлбэрт 0 нэмдэг байсан тул «эрсдэлгүй» гэсэн ХУДАЛ
 * баталгаа гардаг байв.
 */
): Promise<{ rows: DamageRow[]; failed: string[] }> {
  const sev = SEVERITY[level];
  const rows: DamageRow[] = [];
  /** Татагдаагүй давхаргын гарчиг — «эрсдэлгүй» ба «мэдээлэлгүй»-г ялгана */
  const failed: string[] = [];

  for (const id of layerIds) {
    const def = LAYER_BY_ID[id];
    if (!def) continue;
    /* ⚠️ Гол/усан сан нь үерийн ЭХ УУЛ, хохирогч БИШ (`FLOOD_SKIP_IDS`) */
    if (kind === 'flood' && FLOOD_SKIP_IDS.has(id)) continue;
    const fl = view.map?.findLayerById(id) as FeatureLayer | undefined;
    if (!fl || typeof fl.queryFeatures !== 'function') continue;
    const geom: DamageRow['geom'] = def.geom === 'line' ? 'line' : def.geom === 'point' ? 'point' : 'area';

    try {
      const oid = oidOf(def);
      const q = fl.createQuery();
      q.geometry = hazard;
      q.spatialRelationship = 'intersects';
      q.returnGeometry = true;
      q.outFields = [oid];
      q.outSpatialReference = WM;
      q.num = MAX_GEOM;
      // ⚠️ ТООГ тусад нь асууна: `queryFeatures` нь `num`-аар тайрагдана тул
      //    түүний уртыг «нийт» гэж уншвал 1200-аас дээш үед чимээгүй дутуу
      //    тоо гарна.
      /* ⚠️ ТООЛОЛ УНАСАН нь «тайрагдаагүй» ГЭСЭН ҮГ БИШ (2026-09-03-ны
         аудит): урьд нь `catch(() => 0)` → `n = 0 || res.features.length`
         буюу ТҮҮВРИЙН урт «нийт» болж, `truncated = n > fetched` нь худал
         болдог байв. 1,611 объектын 1,200-г үзсэн ~25% дутуу үнэлгээ
         БҮТЭН хэмжилт мэт харагдана. Одоо тоолол унавал ТАЙРАГДСАН гэж
         үзнэ — дутуу үнэлгээг бүтэн гэж зарлахаас илүү аюулгүй. */
      const [res, total] = await Promise.all([
        fl.queryFeatures(q),
        fl.queryFeatureCount(q).catch(() => -1),
      ]);
      const countFailed = total < 0;
      const n = countFailed ? res.features.length : total;
      if (!n) continue;

      let area = 0;
      let length = 0;
      const graphics: Graphic[] = [];
      for (const f of res.features) {
        const g = f.geometry;
        if (!g) continue;
        // ⚠️ ОГТЛОЛЦЛООР хэмжинэ: аюулын зах дээрх барилгын ЗӨВХӨН усанд автсан
        //    хэсгийг тооцно — бүтэн талбайг тоовол хохирол хэтэрсэн гарна.
        const cut = geometryEngine.intersect(g, hazard) as __esri.Geometry | null;
        if (!cut) continue;
        if (geom === 'area') area += Math.abs(geometryEngine.geodesicArea(cut as Polygon, 'square-meters'));
        else if (geom === 'line') length += geometryEngine.geodesicLength(cut as __esri.Polyline, 'meters');
        /**
         * ⚠️ OID-г ЗААВАЛ хадгална: зурган дээр улаан объектыг дарахад эх
         * давхаргаас түүний БҮТЭН атрибутыг татаж үзүүлнэ («мэдээлэл яг
         * ажиллах» шаардлага). OID-гүй бол дарсан объект нь зөвхөн «улаан
         * толбо» хэвээр үлдэнэ.
         */
        graphics.push(new Graphic({
          geometry: cut,
          attributes: { layerId: id, oid: f.attributes?.[oid] ?? null },
        }));
      }

      /**
       * ҮНЭЛГЭЭ.
       *
       * ⚠️ АГААРЫН бохирдол нь БАЙГУУЛАМЖИЙГ эвддэггүй — хохирол нь ЭРҮҮЛ
       * МЭНДИЙН. Өртөлтийг ЗӨВХӨН барилгын ангиллаас тооцно: явган зам,
       * ногоон байгууламжийн м²-ээс «оршин суугч» гаргавал хүний тоо
       * хэдэн дахин хөөрөгдөнө (талбай нь барилгынхаас олон дахин их).
       *
       * ⚠️ ҮЕРТ нэгж үнэ нь объектын АНГИЛЛААС (`DAMAGE_RATE`) — геометрийн
       * төрлөөс биш. Шалтгааныг `ersdel.ts` §DAMAGE_RATE-д бичив.
       */
      /**
       * ⚠️ ТАЙРАГДСАН ХУУДСЫГ БҮТЭН ТООНД ШАТЛУУЛНА.
       *
       * `q.num = MAX_GEOM` тул `queryFeatures` хамгийн ихдээ 1,200 мөр буцаана,
       * харин `n` нь `queryFeatureCount`-ийн БҮТЭН тоо. Урьд нь `area`/`length`
       * зөвхөн ТАТАГДСАН объектуудаас хуримтлагдаж, `cost` тэднээс бодогддог
       * байв: 3-р түвшний зурваст 1,611 шугам орох давхаргад («Гадна дулаан»,
       * 92,000 ₮/м) хүснэгтэд «Тоо 1,611» гэж БҮТНЭЭР, харин «Хэмжээ» ба
       * «Үнэлгээ» нь 1,200-гийн уртаас буюу ~25% ДУТУУ гардаг байсан. UI-ийн
       * «зурагт тайрсан» тэмдэг нь зөвхөн ЗУРГИЙН дүрслэл дутуу гэж
       * ойлгуулж, хэмжээ ба үнэлгээ мөн тайрагдсаныг НУУДАГ байв.
       *
       * ⚠️ Энэ нь ТҮҮВРИЙН ТООЦОО — татагдсан объектуудын дунджаар бүтэн
       * тоонд шатлуулна. Тиймээс `truncated` мөрийг UI-д «түүврээр тооцсон»
       * гэж ИЛ бичих ЁСТОЙ (`Ersdel.tsx`), «бүтэн хэмжилт» гэж үзүүлж
       * болохгүй.
       */
      const fetched = res.features.length;
      const scale = fetched > 0 && n > fetched ? n / fetched : 1;
      area *= scale;
      length *= scale;

      const cls = classOf(id, geom);
      const rate = DAMAGE_RATE[cls];
      const people = cls === 'building' ? area / EXPOSURE.m2PerPerson : 0;

      const cost = kind === 'air'
        ? people * EXPOSURE.costPerPersonDay * (AIR_LEVELS[level].hours / 24)
        : (rate.per === 'm2' ? area : rate.per === 'm' ? length : n) * rate.rate * sev;

      rows.push({
        layerId: id, title: def.title, geom, cls, n, area, length, people, cost, graphics,
        truncated: countFailed || n > fetched,
      });
    } catch {
      /**
       * ⚠️ УНАСАН ДАВХАРГЫГ ЧИМЭЭГҮЙ АЛГАСАХГҮЙ (2026-09-03-ны аудит).
       *
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
  return { rows: rows.sort((a, b) => b.cost - a.cost || b.n - a.n), failed };
}
