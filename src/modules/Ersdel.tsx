'use client';

/**
 * ЭРСДЭЛИЙН ЗАГВАР — IoT-ийн НЭГТГЭСЭН үр дүн (голын ус + агаарын бохирдол).
 *
 *   ┌──────────────┬──────────────────┬────────────────┐
 *   │ ГОРИМ        │   ГАЗРЫН ЗУРАГ    │  ҮР ДҮН        │
 *   │ · одоо       │   2D · 3D · BIM   │  · заалт эсвэл │
 *   │ · таамаглал  │   + аюулын муж    │  · хохирол     │
 *   └──────────────┴──────────────────┴────────────────┘
 *
 * ХОЁР ГОРИМ:
 *   1. ОДООГИЙН БАЙДАЛ — 12 харуулын сүүлийн заалт, 72 цагийн цуваа.
 *   2. ТААМАГЛАЛЫН ЗАГВАР — үер / агаарын бохирдол × 3 түвшин. «Шинжилгээ хийх»
 *      дарахад аюулын муж зурагдаж, ИДЭВХТЭЙ давхаргын өртсөн объект УЛААНААР
 *      тодорно.
 *
 * ⚠️ ЮУ НЬ БОДИТ, ЮУ НЬ ЖИШЭЭ:
 *
 *   БОДИТ · Харуулын БАЙРШИЛ (`Example_data` FeatureServer, 12 цэг)
 *         · ӨНДРИЙН ӨГӨГДӨЛ — төслийн ӨӨРИЙН 3D mesh-ээс гаргасан DSM
 *           (`/uyr/selbe-dsm.bin`), mesh байхгүй газар SRTM DEM
 *         · Өртсөн объект — идэвхтэй давхаргуудаас орон зайгаар шүүсэн
 *
 *   ЖИШЭЭ · Харуулын ЗААЛТ (усны түвшин, PM2.5 …) — тэр давхаргад утгын талбар
 *           байхгүй тул `ersdel.ts` загвараар үүсгэнэ
 *         · Агаарын бохирдлын хувилбарын параметр (инверси, салхи, сэвсгэр)
 *
 *   ТООЦООЛСОН · ҮЕРИЙН ТАРХАЛТ — хөтөч дотор бодогдох LISFLOOD-FP маягийн
 *           инерцийн ойролцоолол (`uyrSim.ts`). Өндөр нь БОДИТ, харин хур
 *           тунадас, сав газрын талбай, урсацын коэффициент нь ТААМАГЛАЛ
 *           (`uyrSim.ts` §CATCHMENT_KM2). Хэмжсэн үер БИШ.
 *
 * ⚠️ ОБЕГ-ын (NEMA) CRF гаралтыг 2026-09-07-нд ХАЯСАН — муу DEM дээр
 * тооцогдсон (хэрэглэгчийн шийдвэр). Тиймээс «ОБЕГ-ын бодит үр дүн» гэж энэ
 * файлын хаана ч БИЧИХГҮЙ: тэр эх сурвалж одоо ОГТ хэрэглэгдэхгүй.
 *
 * Тиймээс дэлгэц дээр энэ ялгааг ҮРГЭЛЖ бичнэ — хэрэглэгч амьд хэмжилттэй
 * андуурч болохгүй.
 */

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type Dispatch, type SetStateAction,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools, MapToolBtn } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { Icon } from '@/components/Icon';
import { Bars, Empty, Loading, Note, Ring, Stat, Stats, Tabs, Trend } from '@/components/ui';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { usePlanTotals } from '@/lib/totals';
import { useAsync } from '@/lib/useAsync';
import { useSyncRef } from '@/lib/useSyncRef';
import { INFRA_SYSTEMS, INITIAL_MAP_LAYERS, LAYER_BY_ID } from '@/lib/services';
import { blank, ha, mnt, num, text } from '@/lib/format';
import {
  AIR_LEVELS, AQI_BAND, EXPOSURE, FLOOD_LEVELS, GRADE_COLOR, GRADE_LABEL, HAZARDS, KIND_LABEL,
  DAMAGE_RATE, LEVELS, SPAN_H, buildLive, gradeOf, hourOf, loadStations, scenarioNote,
  type HazardKey, type LevelKey, type Metric, type Station, type StationLive,
} from '@/lib/ersdel';
import {
  airBands, bandsExtent, damageOf, floodBands, floodExtent,
  type Band, type DamageRow,
} from '@/lib/ersdelGeom';
import {
  depthRisk, flowDeg, flowDir, hazardRating, HAZARD_CLASS, HAZARD_LEGEND, SATURATE_MS,
  type FloodData, type FloodMode,
} from '@/lib/uyr';
import { damageCsv, damageGeoJSON, type ExportRow, type GeomLike } from '@/lib/ersdelExport';
import { downloadText, fileDate } from '@/lib/csvFile';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import { dirName, dispersionOf, loadWind, nowHour } from '@/lib/salhi';
import { hhmmUB, loadWindField, nowIndex, ymd } from '@/lib/salhiTor';
import { MAX_V, rampCss } from '@/lib/salhiUrsgal';
import { simulateFlood, type SimArea, type SimProgress } from '@/lib/uyrSim';
import { abortError } from '@/lib/uyrSimCore';
import { flowPath, whyFlood } from '@/lib/uyrTailbar';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import { floodFootprint, simplifyRings } from '@/lib/uyrSurface';
import Polygon from '@arcgis/core/geometry/Polygon';
import Graphic from '@arcgis/core/Graphic';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';
import * as projectOperator from '@arcgis/core/geometry/operators/projectOperator';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import { Overlay, type Pick } from './ersdel/Overlay';
import o from './gazarOv.module.css';
import e from './ersdel.module.css';

/**
 * ЭХЛЭХ ДАВХАРГА — ХООСОН (хэрэглэгчийн хүсэлт, 2026-08-25).
 *
 * Энэ харагдац нь ЗӨВХӨН ортофото дээр нээгдэнэ: аюулын муж (цэнхэр ус, шаргал
 * утаа) ба өртсөн объект (улаан) нь өнгөөр л уншигддаг тул доор нь план 2D-ийн
 * 14 өнгөт давхарга байвал тэдгээр нь булингартана.
 *
 * ⚠️ `MapCanvas`-ийн `bare` тугтай ХАМТ ажиллана: тэргүй бол суурь давхаргууд
 * «сонголт хоосон» гэсэн дүрмээр АВТОМАТААР асдаг (`BASE_MAP_IDS`).
 * ⚠️ Ортофотог `setOrtho(true)`-оор доор асаана — анхдагч суурь зураг нь
 * топографи.
 */
const INITIAL_IDS: string[] = [];

/**
 * Хоёр талбайн цагираг ЯГ ижил үү (2026-09-25, аудит 8) — `SketchViewModel`-ийн
 * `update … complete` нь өөрчлөлтгүй товшилтод ч ирдэг; ижил бол `area`-г солихгүй
 * (эффект нь объектын ижилтэйгээр үр дүнг арилгадаг).
 */
const sameRings = (a: SimArea, b: SimArea): boolean =>
  a.length === b.length && a.every((ring, i) => {
    const r2 = b[i];
    return ring.length === r2.length && ring.every((p, j) => p[0] === r2[j][0] && p[1] === r2[j][1]);
  });

/**
 * ЗАГВАРЧЛАХ ТАЛБАЙН ТҮЛХҮҮР — кэш ба харьцуулалтад (2026-10-01).
 * ⚠️ Объектын ижилтэй биш, КООРДИНАТААР: 2D↔3D солиход ч, ижил полигоныг
 *    дахин зурахад ч нэг түлхүүр гарна. Метрээр дугуйрна (дэд мм-ийн шуугиан).
 */
const areaKey = (a: SimArea | null): string =>
  (a?.length ? a.map((r) => r.map((p) => `${Math.round(p[0])},${Math.round(p[1])}`).join(';')).join('|') : 'all');

/** Загварчлалын кэшийн түлхүүр — (түвшин, талбай) */
const simKey = (lv: LevelKey, a: SimArea | null): string => `${lv}#${areaKey(a)}`;

/**
 * Кэшлэх ДЭЭД загварчлал.
 * ⚠️ Нэг загварчлал ~10 МБ (24 зүсмэл × 45,000 нүд × 6 байт + хуримтлалын тор +
 *    хоёр canvas). 3 түвшин × 2 талбай = 6 нь санах ойд хүлцэхүйц.
 */
const SIM_CACHE_MAX = 6;

/**
 * ХОХИРЛЫН МУЖИЙН ОРОЙН ТӨСӨВ (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 * ⚠️ Chaikin-ий гөлгөр мөр 10–20 мянган оройтой байдаг — давхарга бүрийн
 *    асуулгын POST, сервер ба хөтчийн `intersect`-ийг удаашруулдаг байв
 *    (`uyrSurface.simplifyRings`). 2,500 орой нь 1 нүдний нарийвчлалд хангалттай.
 */
const FOOTPRINT_BUDGET = 2500;

/** Web Mercator — зурсан талбайг загварчлалд өгөхийн өмнө (`areaToWm`, 2026-10-09) */
const WM_SR = SpatialReference.WebMercator;

/**
 * ЗАГВАРЧЛАЛААС ХОХИРЛЫН МУЖ — мөр → төсөвт багтаасан → `simplify` (топологи засна).
 * Хуурай (0.15 м-ээс гүн ус алга) бол `null`.
 */
/**
 * Нэг нүдний хэмжээ ТОРНЫ (WM) координатаар — 2026-10-09.
 * ⚠️ `meta.cellM` нь ГАЗРЫН метр; Web Mercator-ын нэгж 47.9°-д 1/cos(lat) ≈ 1.49
 *    дахин том тул `cellM`-ийг WM координатын алхам болгож хэрэглэвэл хүлцэл/дээж
 *    ~1.5 дахин НАРИЙН (бага) гардаг байв. Тор нь WM-д тул хүрээнээс шууд.
 */
const wmCellOf = (fd: FloodData): number =>
  (fd.meta.extent.xmax - fd.meta.extent.xmin) / fd.meta.width;

function hazardPolygon(fd: FloodData): { poly: Polygon; rings: number[][][] } | null {
  /* ⚠️ 2026-10-09: хүлцэл WM нэгжээр (`wmCellOf`) — цагираг WM координаттай */
  const rings = simplifyRings(floodFootprint(fd), { tol: wmCellOf(fd) * 0.25, budget: FOOTPRINT_BUDGET });
  if (!rings.length) return null;
  const raw = new Polygon({ rings, spatialReference: { wkid: fd.meta.wkid } });
  /* ⚠️ Цагираг бүрийг тусад нь хялбарчилсан тул хоорондоо шүргэлцэж болно —
     `simplify` нь топологийг засна; унавал түүхийгээр нь */
  let poly = raw;
  try {
    poly = (geometryEngine.simplify(raw) as unknown as Polygon | null) ?? raw;
  } catch {
    poly = raw;
  }
  return { poly, rings };
}

/**
 * ҮНЭЛГЭЭНИЙ ҮНДСЭН БАГЦ — зурагт НЭГ Ч давхарга асаагаагүй үед шинжилгээ юуг
 * тоолох вэ.
 *
 * ⚠️ Харагдац одоо хоосон эхэлдэг тул «идэвхтэй давхаргаар» гэсэн дүрэм
 * дангаараа бол шинжилгээ ҮРГЭЛЖ хоосон хариу өгнө. Тиймээс: идэвхтэй давхарга
 * БАЙВАЛ түүгээр, эс бөгөөс энэ багцаар тооцно. Аль замаар тооцсоныг үр дүнгийн
 * самбарт ИЛ бичнэ — хэрэглэгч тоо хаанаас гарсныг мэдэх ёстой.
 *
 * ⚠️ 2026-08-29: ИНЖЕНЕРИЙН СҮЛЖЭЭ нэмэгдэв (хүсэлт: «барилга, дэд бүтэц, зам
 * зэрэг өртөх зүйлс»). Урьд нь `INITIAL_MAP_LAYERS` буюу зургийн эхлэлийн
 * багц л ордог байсан — тэнд гадаргуун объект (барилга, зам, ногоон) л байсан
 * тул үер ГАЗАР ДООРХ шугам сүлжээг үл хөндсөн мэт харагдаж, хохирлын дүн
 * бодитоос дутуу гардаг байв.
 *
 * ⚠️ Эдгээр нь бүгд ШУГАМАН давхарга тул `classOf` нь `pipe` (92,000 ₮/м)
 * ангилалд оруулна — үнэлгээ нь УРТААР бодогдоно (`DamageRow.length`).
 */
/* ⚠️ 2026-09-17 (2): ЕТ-ийн `et:*` инженерийн шугамууд үйлчилгээнээс устгагдсан →
   `Инженерийн_дэд_бүтэц__Сэлбэ_0916`-ийн дулаан · цэвэр ус · бохир ус · цахилгааны
   ШУГАМАН давхаргууд (`infra:*`). Цэг/талбай (худаг, ДХТ) нь `pipe` биш тул орохгүй. */
const ASSESS_IDS: string[] = [
  ...INITIAL_MAP_LAYERS,
  ...INFRA_SYSTEMS
    .filter((x) => x.key === 'heat' || x.key === 'water' || x.key === 'sewer' || x.key === 'power')
    .flatMap((x) => x.ids)
    .filter((id) => LAYER_BY_ID[id]?.geom === 'line'),
];

/**
 * ГҮНИЙ ӨНГӨ ХАНАХ ЦЭГ (м) — легендийн градиентийн БАРУУН зах.
 *
 * ⚠️ `uyr.ts`-ийн `SATURATE_M` (1.5)-тай ЯГ ижил байх ЁСТОЙ (`uyrCalc.ts`-ийн
 * хуулбар 2026-09-21-нд устгагдсан). Тэр модуль түүнийг export хийдэггүй тул
 * энд давхардуулан бичив — тэндхийг өөрчилвөл ЭНИЙГ ч дагуулна.
 *
 * ⚠️ Легенд урьд нь төгсгөлийн шошгодоо `flood.meta.peakDepthM` (2.3 м) -ийг
 * бичдэг байв. Растер нь 1.5 м-д ханадаг тул 1.5 м ба 2.27 м ус ЯГ ИЖИЛ
 * өнгөтэй гарч, дундах өнгө (0.5 м) нь легендээр 0.77 м гэж уншигдаж БҮХ
 * завсрын гүн ~1.5 дахин хэтрүүлж уншигддаг байсан. Дээд гүнийг тусад нь
 * (тайлбарын `title`-д) хэлнэ — градиентийн зах ГЭЖ БИШ.
 */
const RAMP_MAX_M = 1.5;

/**
 * Хугацааны тэнхлэгийн богино шошго — «08-24 18:00».
 * ⚠️ 2026-10-09 (аудит): УЛААНБААТАРЫН цагаар (`+8ц` + UTC getter — `Iot.axisLabel`, `hhmmUB`-тэй
 *    ижил). Урьд нь `getMonth/getDate/getHours` (хөтчийн бүс) тул УБ-аас гадуурх машинд тэнхлэг
 *    `hhmmUB`-ээр хэвлэгддэг «N цагийн заалт»-аас зөрдөг байв.
 */
const AXIS_UB_OFFSET_MS = 8 * 3_600_000;
const axisLabel = (t: number): string => {
  const d = new Date(t + AXIS_UB_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:00`;
};

/** Зурган дээрх мэдээллийн хайрцгийн агуулга */
type Info = {
  title: string;
  sub?: string;
  /** Гарчгийн зүүн ирмэгийн өнгө — хохирол бол улаан */
  tone?: string;
  rows: { k: string; v: string; tone?: string }[];
  /** Нэг нүдний 12 алхмын түүх — гүн ба хурд (зөвхөн үерийн нүдэнд) */
  spark?: { depth: number[]; speed: number[] };
  /** Тэмдэглэгдэх алхам */
  sparkAt?: number;
  /**
   * ШАЛТГААНЫ мөр — «яагаад яг энд вэ».
   * ⚠️ Тоонуудын ДООР, ялгарсан хайрцагт. Мөр болгож жагсаавал бусад
   * хэмжигдэхүүнтэй адил жинтэй болж, гол хариулт алдагдана.
   */
  note?: string;
};

/**
 * БЯЦХАН ГРАФИК — нэг нүдний цаг хугацааны хувьсал.
 *
 * ⚠️ `Trend` (ui.tsx) БИШ: тэр нь тэнхлэг, шошго, уншилтын мөртэй бүтэн график
 * бөгөөд 300px-ийн мэдээллийн хайрцагт багтахгүй. Энд зөвхөн «өссөн үү,
 * буурсан уу, одоо хаана байна» гэсэн ГУРВАН зүйл л хэрэгтэй.
 */
function Spark({
  vals, at, color, unit,
}: { vals: number[]; at: number; color: string; unit: string }) {
  const W = 250;
  const H = 34;
  const peak = Math.max(...vals, 0.0001);
  const n = vals.length;
  const xy = (v: number, i: number) => `${((i / (n - 1)) * W).toFixed(1)},${(H - (v / peak) * H).toFixed(1)}`;
  const pts = vals.map(xy).join(' ');
  const cx = ((at / (n - 1)) * W).toFixed(1);
  const cy = (H - (vals[at] / peak) * H).toFixed(1);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6}
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1={cx} y1={0} x2={cx} y2={H} stroke="var(--ink-3)" strokeWidth={1}
        strokeDasharray="3,2" vectorEffect="non-scaling-stroke" />
      <circle cx={cx} cy={cy} r={3} fill={color} />
      <title>{`${num(vals[at], 2)} ${unit} · ${tr('дээд')} ${num(peak, 2)} ${unit}`}</title>
    </svg>
  );
}

/**
 * ТҮҮХИЙ атрибут → уншиж болох мөрүүд.
 *
 * ⚠️ Талбарын нэрийг ОРЧУУЛАХГҮЙ, ЯГ эх сурвалжийнхаар нь харуулна: давхарга
 * бүр өөр схемтэй (`Barilga_ty`, `ZONE_ID`, `urt_m` …) бөгөөд «эелдэг» нэр
 * зохиовол хэрэглэгч ямар талбар харж байгаагаа мэдэхгүй болно.
 *
 * ⚠️ Системийн талбаруудыг хасна (OID, GlobalID, Shape__*) — тэдгээр нь агуулга
 * биш, санд хадгалагдах дотоод дугаар.
 */
function attrRows(attrs: Record<string, unknown>): { k: string; v: string }[] {
  return Object.entries(attrs)
    .filter(([k, v]) => !/^(objectid|fid|globalid|shape__|shape_|se_anno)/i.test(k) && !blank(v))
    .slice(0, 12)
    .map(([k, v]) => ({
      k,
      v: typeof v === 'number'
        ? num(v, Number.isInteger(v) ? 0 : 2)
        : text(v),
    }));
}

/**
 * ӨРТСӨН ОБЪЕКТЫН БОДИТ ДЭЭД ГҮН (м) — түүний footprint дахь нүднүүдийн
 * `maxDepth`-ийн хамгийн их (2026-09-21).
 *
 * ⚠️ Урьд нь попапын «Усны гүн» нь `flood.meta.peakDepthM` (БҮХ талбайн дээд
 * гүн) байсан тул өртсөн 300 барилга бүр ижил «2.3 м» гэж гардаг байв —
 * хэрэглэгч «энэ барилга 2.3 м усанд автсан» гэж уншина. Одоо объект бүр
 * өөрийн footprint-ийн тоог авна.
 *
 * ⚠️ Геометр нь `fd.meta.wkid` (WM)-д байх ЁСТОЙ — асуулгад
 * `outSpatialReference` өгнө. Полигон: хүрээний нүднүүдийг цагирагт багтах
 * эсэхээр шүүнэ (even-odd); шугам: оройнуудын хооронд нүдний хагасаар
 * дээжилнэ; цэг: нэг нүд. Нойтон нүд олдохгүй бол `null` (объект нь мужийн
 * хилээр л хүрсэн) — дуудагч ухрах утгаа өөрөө шийднэ.
 */
function footprintDepth(fd: FloodData, geom: __esri.Geometry | null | undefined): number | null {
  return footprintDepthEx(fd, geom).depth;
}

/**
 * `footprintDepth` + ТООЦООНЫ МУЖИД дээж орсон эсэх (2026-10-09).
 * ⚠️ Мужийн гадна цөм гүнийг 0 гэж бичдэг — тэр нүдийг «хуурай» гэж тоолохгүй
 *    (`FloodData.inDomain`). `computed: false` = объект бүхэлдээ мужаас гадна →
 *    попап «тооцоогүй» гэнэ («ус ирээгүй» БИШ).
 */
function footprintDepthEx(
  fd: FloodData, geom: __esri.Geometry | null | undefined,
): { depth: number | null; computed: boolean } {
  if (!geom || !fd.maxDepth) return { depth: null, computed: false };
  const md = fd.maxDepth;
  const dom = fd.inDomain;
  let best = -1;
  let computed = false;
  const take = (x: number, y: number) => {
    const i = fd.indexAt(x, y);
    if (i == null) return;
    if (dom && !dom(i)) return;
    computed = true;
    const v = md(i);
    if (v > best) best = v;
  };
  /* ⚠️ 2026-10-09: дээжийн алхам WM нэгжээр (`wmCellOf`) — геометр WM-д */
  const cell = wmCellOf(fd);
  if (geom.type === 'point') {
    const p = geom as __esri.Point;
    take(p.x, p.y);
  } else if (geom.type === 'polyline') {
    for (const path of (geom as __esri.Polyline).paths) {
      for (let k = 0; k < path.length; k++) {
        const [x0, y0] = path[k];
        take(x0, y0);
        if (k + 1 >= path.length) continue;
        const [x1, y1] = path[k + 1];
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (cell / 2));
        for (let j = 1; j < n; j++) take(x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n);
      }
    }
  } else if (geom.type === 'polygon') {
    const rings = (geom as __esri.Polygon).rings;
    const ext = geom.extent;
    if (!ext || !rings.length) return { depth: null, computed: false };
    const inside = (x: number, y: number) => {
      let on = false;
      for (const r of rings) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xi, yi] = r[i];
          const [xj, yj] = r[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
        }
      }
      return on;
    };
    /* Нүдний хагасаар алхана — жижиг барилга ч дор хаяж нэг дээж авна.
       ⚠️ 2026-10-01: ТОМ полигонд (ногоон байгууламж, 50 га) дээжийг ~2,500-д
       хязгаарлана — хохирлын асуулга бүр 1,200 объектод үүнийг дууддаг болсон
       (`damageOf` §depthOf); хагас нүдээр 7,000+ дээж × оройн тоо гацаана. */
    const st = Math.max(cell / 2, Math.sqrt(((ext.xmax - ext.xmin) * (ext.ymax - ext.ymin)) / 2500));
    for (let y = ext.ymin; y <= ext.ymax + st; y += st) {
      for (let x = ext.xmin; x <= ext.xmax + st; x += st) {
        if (inside(x, y)) take(x, y);
      }
    }
    /* Оройнууд — хүрээний дээж алгассан нарийн объектод */
    for (const r of rings) for (const [x, y] of r) take(x, y);
  }
  return { depth: best > 0 ? best : null, computed };
}

/**
 * Зурсан полигоны цагирагууд → Web Mercator (2026-10-09).
 * ⚠️ Загварчлал (`inRings`) нь цагирагийг WM координат гэж уншдаг. Харагдацын
 *    SR нь 102100/3857 биш (жишээ нь SceneView-ийн WGS84) бол урьд нь градусаар
 *    дамждаг тул зурсан талбай торонд огт тусахгүй байв.
 * ⚠️ 2026-10-09 (аудит): WGS84/WM-ээс ӨӨР SR (`webMercatorUtils` чадахгүй) бол `projectOperator`-оор
 *    (ачаалж) хөрвүүлнэ; хөрвөхгүй бол ИЛ АЛДАА шиднэ. Урьд нь хуучнаар нь (WM биш координатаар) дамжуулдаг
 *    тул загварчлал торонд тусахгүй, `areaHa` (WM-ийн `cos²φ` залруулгатай) ч буруу гардаг байв. Одоо
 *    буцах цагираг ҮРГЭЛЖ WM → `areaHa` зөв.
 */
let projLoad: Promise<unknown> | null = null;
const ensureProj = (): Promise<unknown> => {
  projLoad ??= projectOperator.load().catch((err: unknown) => { projLoad = null; throw err; });
  return projLoad;
};
async function areaToWm(g: __esri.Polygon): Promise<{ rings: SimArea; wkid: number }> {
  const sr = g.spatialReference;
  const wk = sr?.wkid ?? 3857;
  let src: __esri.Polygon = g;
  if (sr && !sr.isWebMercator && wk !== 102100 && wk !== 3857) {
    let p: __esri.Polygon | null = null;
    if (webMercatorUtils.canProject(sr, WM_SR)) {
      p = webMercatorUtils.project(g, WM_SR) as __esri.Polygon | null;
    } else {
      await ensureProj().catch(() => null);
      if (projectOperator.isLoaded()) p = (projectOperator.execute(g, WM_SR) as __esri.Polygon | null | undefined) ?? null;
    }
    if (!p?.rings?.length) {
      throw new Error(tr('Зурсан талбайн координатын систем ({0}) Web Mercator руу хөрвөсөнгүй — загварчлах боломжгүй.',
        sr.wkid != null ? `wkid ${sr.wkid}` : sr.wkt ? 'WKT' : '—'));
    }
    src = p;
  }
  /* ⚠️ ЗӨВХӨН x, y — `hasZ`-тэй бол гурав дахь утга орж ирнэ (`inRings` 2D) */
  return {
    rings: src.rings.map((r) => r.map((p) => [p[0], p[1]])),
    wkid: src === g ? wk : 102100,
  };
}

/* ══════════════════════ Жижиг бүрэлдэхүүн ══════════════════════ */

/** Нэг хэмжигдэхүүний агшны нүд — утга, хэвийн хязгаар, үнэлгээ */
function Cell({ m }: { m: Metric }) {
  const g = gradeOf(m);
  return (
    <div className={e.metric} title={`${m.label}${m.unit ? ` (${m.unit})` : ''}\n${m.note}`}>
      <div className={e.metricHd}>
        <span className={e.metricName}>{m.label}</span>
        <span className={e.metricGrade} style={{ color: GRADE_COLOR[g] }}>{GRADE_LABEL[g]}</span>
      </div>
      <div className={`${e.metricVal} num`}>
        {num(m.latest, m.dp)}
        {m.unit && <span className={e.metricUnit}>{m.unit}</span>}
      </div>
      <div className={`${e.metricFoot} num`}>
        <span>{num(m.min, m.dp)} … {num(m.max, m.dp)}</span>
        <span>{tr('хязгаар')} {num(m.warn, m.dp)}</span>
      </div>
    </div>
  );
}

/** Харуулын жагсаалтын мөр — хамгийн муу үнэлгээгээр өнгө авна */
function StationRow({
  st, on, onPick,
}: { st: StationLive; on: boolean; onPick: () => void }) {
  // ⚠️ «Хамгийн муу» — нэг ч үзүүлэлт хэтэрсэн бол харуул бүхэлдээ улаан.
  //    Дундаж авбал нэг хортой үзүүлэлт долоон хэвийн утганд угаагдана.
  const bad = st.metrics.some((m) => gradeOf(m) === 'bad');
  const warn = st.metrics.some((m) => gradeOf(m) === 'warn');
  const g = bad ? 'bad' : warn ? 'warn' : 'ok';
  const key = st.kind === 'water' ? 'level' : 'pm25';
  const m = st.metrics.find((x) => x.key === key);
  return (
    <button
      type="button"
      className={`${e.stRow} ${on ? e.stRowOn : ''}`}
      onClick={onPick}
      aria-pressed={on}
    >
      <span className={e.stDot} style={{ background: GRADE_COLOR[g] }} aria-hidden />
      <span className={e.stName}>{st.name}</span>
      <span className={`${e.stVal} num`}>
        {m ? `${num(m.latest, m.dp)} ${m.unit}` : '—'}
      </span>
    </button>
  );
}

/* ══════════════════════ Үндсэн харагдац ══════════════════════ */

type Result = {
  hazard: HazardKey;
  level: LevelKey;
  bands: Band[];
  rows: DamageRow[];
  /** Шинжилгээнд орсон давхаргын тоо — «идэвхтэй давхарга» гэдгийг батална */
  layers: number;
  /**
   * ⚠️ ТАТАГДААГҮЙ давхаргын гарчиг (2026-09-03-ны аудит). Урьд нь унасан
   * давхарга чимээгүй алгасагдаж нийлбэрт 0 нэмдэг байсан тул «өртсөн
   * объект олдсонгүй» гэсэн ХУДАЛ баталгаа гардаг байв. Эрсдэлийн тоо
   * аюулгүй байдлын шийдвэрт ордог тул дутууг ИЛ хэлнэ.
   */
  failed: string[];
  /**
   * ЯМАР олонлогоор тоолсон бэ — үр дүнгийн самбарт ИЛ бичигдэнэ.
   * ⚠️ 2026-09-08: урьд нь `fallback: boolean` байсан тул каталогоос сонгосон
   * давхаргаар тооцсон тохиолдол ч `true` болж, самбарт «ҮНДСЭН БАГЦААР
   * тооцов» гэсэн ХУДАЛ тайлбар гардаг байв. Гурван зам ГУРВАН өөр утгатай
   * тул boolean хангахгүй.
   *   · `map`     — зурагт идэвхтэй, объект асуух боломжтой давхаргууд
   *   · `catalog` — зурагт идэвхтэй нь олдоогүй, каталогийн чагтаар
   *   · `base`    — аль нь ч байхгүй, үнэлгээний ҮНДСЭН БАГЦААР
   */
  src: 'map' | 'catalog' | 'base';
  /**
   * Хохирол ЗАГВАРЧЛАЛЫН бодит үерийн мөрөөр бодогдов уу.
   * ⚠️ `false` бол буфер зурвасаар ухарсан (загварчлал бэлэн биш байсан) —
   * үүнийг хэрэглэгчид ИЛ хэлнэ, эс бөгөөс хоёр өөр арга нэг нэрээр явна.
   */
  simFootprint?: boolean;
  /**
   * ЯАГААД буферээр ухарсан бэ (`simFootprint` худал үед л).
   * ⚠️ 2026-09-29 (аудит 10): гурван шалтгаан гурван өөр тайлбартай — урьд нь
   * бүгдэд «загварчлал бэлэн биш, дахин ажиллуул» гэдэг байсан нь загварчлал
   * ДУУССАН (ус гүехэн) эсвэл УНАСАН үед худал: дахин ажиллуулаад нэмэргүй.
   *   · `notReady` — загварчлал эхлээгүй/цуцлагдсан
   *   · `dry`      — дууссан, гэхдээ босгоос гүн усны мөр гараагүй
   *   · `failed`   — алдаагаар унасан
   */
  simWhy?: 'notReady' | 'dry' | 'failed';
  /**
   * АЮУЛЫН МУЖИЙН цагирагууд (WM) — GeoJSON экспортод (2026-10-01).
   * Үерт загварчлалын мөр (хялбарчилсан) эсвэл буфер, агаарт сэвсгэр.
   */
  zoneRings?: number[][][];
};

/**
 * ТҮВШНҮҮДИЙН ХАРЬЦУУЛАЛТЫН мөр (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 * ⚠️ `null` = бодогдоогүй/мэдэгдэхгүй, 0 БИШ.
 */
type CmpRow = {
  level: LevelKey;
  /** Бүх хугацаанд усанд автсан талбай (га) — `meta.totalWetHa` */
  wetHa: number;
  /** Дээд гүн (м) — `meta.peakDepthM` */
  peakM: number;
  /** Өртсөн объектын тоо */
  n: number | null;
  /** Хохирлын үнэлгээ (₮) — ТОДОРХОЙ өртөгтэй давхаргуудын нийлбэр */
  cost: number | null;
  /** Өртөг тодорхойгүй давхаргын тоо (нийтэд ороогүй) */
  unknown: number;
  /** Татагдаагүй давхаргын тоо */
  failed: number;
};

/**
 * Ачаалж байх үеийн ТОГТМОЛ хоосон массив — компонентын гадна, ганц удаа.
 * ⚠️ Дотор нь `[]` гэж бичвэл рендер бүрт шинэ лавлагаа болж, доорх бүх
 * `useMemo` гинж дэмий дахин ажиллана.
 */
const EMPTY_STATIONS: Station[] = [];

export function Ersdel({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /* ⚠️ 2026-09-30: `hostRef`-ийг ТУСАД НЬ задална — React Compiler нь `*Ref` нэртэй
     талбар агуулсан обьектыг бүхэлд нь ref гэж үзэж, `side.style`/`side.left`
     хандалт бүрийг «render үеийн ref хандалт» гэж анхааруулдаг байв. */
  const { hostRef: sideHostRef, ...side } = useSideResize('ersdel');
  const { view, ortho, setOrtho, setHighlight } = useMap();

  /**
   * ⚠️ БУСАД ХАРАГДАЦЫН ТОДРУУЛГЫГ АРИЛГАНА (2026-09-21). `setHighlight` нь
   * `MapProvider`-ын НИЙТИЙН төлөв: «Багц» дээр блок сонгоод энд шилжихэд
   * тэр блок тодорсон хэвээр үлдэж, эрсдэлийн улаан объекттой нэг зурагт
   * зэрэгцэн «энэ ч өртсөн» гэж уншигддаг байв. `Bagts.tsx:169`-тэй ижил дүрэм.
   */
  useEffect(() => { setHighlight(null); }, [setHighlight]);

  /**
   * ОРТОФОТО-г энэ харагдацад АСААНА (хэрэглэгчийн хүсэлт).
   *
   * ⚠️ `ortho` нь `MapProvider`-ын НИЙТИЙН төлөв — бусад харагдац ч түүнийг
   * уншина. Тиймээс гарахдаа ОРСОН үеийн утгыг нь БУЦААНА: эс бөгөөс энэ
   * цонхоор нэг орсны дараа бүх харагдац ортофототой болж, хэрэглэгчийн
   * сонголт чимээгүй дарагдана.
   */
  const orthoWas = useRef(ortho);
  useEffect(() => {
    const was = orthoWas.current;
    setOrtho(true);
    return () => setOrtho(was);
  }, [setOrtho]);

  /* ── Газрын зургийн ерөнхий удирдлага (бусад харагдацтай ижил) ── */
  const [visible, setVisible] = useLayerPicks(INITIAL_IDS);
  /**
   * ⚠️ 2026-09-30: ШИНЖИЛГЭЭ ӨӨРӨӨ АСААСАН давхаргууд (`run` §ӨРТСӨН ДАВХАРГЫГ ЗУРАГТ
   *    АСААНА). Урьд нь дараагийн шинжилгээ (өөр түвшин) тэдгээрийг «хэрэглэгчийн
   *    идэвхтэй давхарга» гэж уншаад ЗӨВХӨН тэднээр тооцож, өндөр түвшинд анх
   *    өртөх давхаргуудыг чимээгүй алгасдаг байв; «үндсэн багцаар тооцов»
   *    тэмдэглэл ч алга болдог. `activeIds` эдгээрийг хасна; хэрэглэгч
   *    каталогоос унтраавал жагсаалтаас гарна (дахин асаавал ӨӨРИЙНХ нь сонголт).
   */
  const autoOn = useRef<Set<string>>(new Set());
  const setVisibleUser = useCallback<Dispatch<SetStateAction<string[]>>>((upd) => {
    setVisible((prev) => {
      const next = typeof upd === 'function' ? upd(prev) : upd;
      const keep = new Set(next);
      for (const id of [...autoOn.current]) if (!keep.has(id)) autoOn.current.delete(id);
      return next;
    });
  }, [setVisible]);
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const catTotals = usePlanTotals(zone, catOpen);

  /* ── Горим ба хувилбар ── */
  const [mode, setMode] = useState<'now' | 'model'>('now');
  const [hazard, setHazard] = useState<HazardKey>('flood');
  const [level, setLevel] = useState<LevelKey>(1);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  /** Зурган дээрх мэдээллийн хоёр нүд — тайлбар нь §«Зурган дээрх мэдээлэл» (доор).
      ⚠️ 2026-09-30: зарлалтыг ЭНД зөөв — React Compiler доор зарласан setter-ийг
      `clear`/`onMapPick`-ийн `[]` deps-тэй тааруулж чадахгүй байв. */
  const [hazInfo, setHazInfo] = useState<Info | null>(null);
  const [featInfo, setFeatInfo] = useState<Info | null>(null);

  /**
   * ЗУРАГДАХ үеийн «одоо» — ЦАГААР бөөрөнхийлсөн (`hourOf`). Минут тутам
   * шинэчлэхгүй: цуваа нь цагийн алхамтай тул цаг солигдоход л өөрчлөгдөнө.
   */
  const [now, setNow] = useState(() => hourOf(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setNow(hourOf(Date.now())), 60_000);
    return () => clearInterval(id);
  }, []);

  /* ══════════ ҮЕРИЙН ЦАГ ХУГАЦААНЫ ЗАГВАРЧЛАЛ ══════════
   *
   * ⚠️ 18.9 МБ тул ЗӨВХӨН «Үер» хувилбар сонгогдоход л татна — хуудас
   *    нээгдэхэд БИШ. Нэг удаа татаад `uyr.ts` дотор кэшлэгдэнэ.
   */
  const [flood, setFlood] = useState<FloodData | null>(null);
  /** Явж буй загварчлалын промис — шинжилгээ түүнийг хүлээнэ */
  const simPromise = useRef<Promise<FloodData> | null>(null);
  /**
   * ЗАГВАРЧЛАХ ТАЛБАЙ — хэрэглэгчийн зурсан полигон (WM цагирагууд).
   * ⚠️ `null` бол өндрийн торны БҮХ талбай (3.6 × 3.6 км).
   */
  /* ⚠️ 2026-09-25: ЗӨВХӨН объектын ижилтэй эффект (`prev.area !== area`) тул ижил
     цагираг = ижил объект байх ёстой (`sameRings` — `svm.on('update')`). */
  const [area, setArea] = useState<SimArea | null>(null);
  const [drawing, setDrawing] = useState(false);
  /**
   * УСНЫ ЗАМ — сонгосон нүднээс дээш/доош мөрдсөн шугам (WM цэгүүд).
   * ⚠️ Зөвхөн ХАРАГДАЦ: тооцоонд огт нөлөөлөхгүй.
   */
  const [path, setPath] = useState<{ up: number[][]; down: number[][] } | null>(null);
  /**
   * Зурсан талбайн хэмжээ (га).
   * ⚠️ Web Mercator-ын талбай нь ӨРГӨРГӨӨР сунадаг тул `cos²φ`-ээр
   * залруулна — эс бөгөөс 48°N-д талбай 2.2 дахин хэтэрнэ.
   */
  const areaHa = useMemo(() => {
    if (!area) return null;
    const k = Math.cos((47.9674 * Math.PI) / 180) ** 2;
    let a = 0;
    for (const r of area) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
      }
    }
    return (Math.abs(a) / 2) * k / 10000;
  }, [area]);
  const [floodErr, setFloodErr] = useState<string | null>(null);
  /** Загварчлалын явц (0..1) — хөтөч дээр бодогддог тул хүлээлт мэдэгдэнэ */
  const [simPct, setSimPct] = useState(0);
  /**
   * Үлдсэн хугацааны ТААМАГ (сек) — `null` = хараахан тооцох боломжгүй.
   * ⚠️ 2026-10-01: явцын хувиас шугаман: өнгөрсөн × (1 − p) / p. Эхний 3%-д
   *    тогтворгүй (DSM татах хугацаа орно) тул тэр хүртэл харуулахгүй.
   */
  const [simEta, setSimEta] = useState<number | null>(null);
  /**
   * ЗАГВАРЧЛАЛЫН КЭШ — (түвшин, талбай) → үр дүн (2026-10-01, «хэрэглэгч: бүгдийг зас»).
   * ⚠️ Урьд нь 1→2→1 түвшин солих БҮРД дахин бодогддог байв (2–5 сек). Одоо
   *    дууссан загварчлал хадгалагдаж, буцахад ШУУД гарна. Хамгийн хуучин нь
   *    `SIM_CACHE_MAX`-аас хэтрэхэд хасагдана.
   */
  const simCache = useRef(new Map<string, FloodData>());
  const cachePut = useCallback((key: string, d: FloodData) => {
    const m = simCache.current;
    m.delete(key);
    m.set(key, d);
    while (m.size > SIM_CACHE_MAX) m.delete(m.keys().next().value as string);
  }, []);
  /**
   * ЯВЖ БУЙ ЗАГВАРЧЛАЛУУД — (түвшин, талбай) → нэг промис (үндсэн эффект ба харьцуулалт ХУВААЛЦАНА).
   * ⚠️ 2026-10-09 (аудит): урьд нь зөвхөн «үндсэн загварчлалын түлхүүр»-ийг (`simPromiseKey`) харьцуулалт
   *    харж, эсрэг чиглэлд (харьцуулалт 2-р түвшинг бодож байхад хэрэглэгч 2-р түвшин сонгох) ИЖИЛ
   *    загварчлал ХОЁР удаа зэрэг гүйж CPU булаалддаг байв. Одоо хэрэглэгч тоолно (`users`): нэг нь
   *    цуцлахад нөгөө нь хэрэглэж байвал ЗОГСООХГҮЙ; сүүлчийнх нь цуцлахад л `abort`.
   */
  const simInflight = useRef(new Map<string, {
    p: Promise<FloodData>;
    subs: Set<(pr: SimProgress) => void>;
    ac: AbortController;
    users: number;
  }>());
  const runSim = useCallback((lv: LevelKey, a: SimArea | null, onPr: (pr: SimProgress) => void) => {
    const key = simKey(lv, a);
    const map = simInflight.current;
    let ent = map.get(key);
    if (!ent) {
      const subs = new Set<(pr: SimProgress) => void>();
      const ac = new AbortController();
      const p = simulateFlood(lv, (pr) => subs.forEach((f) => f(pr)), a, ac.signal);
      const fresh = { p, subs, ac, users: 0 };
      map.set(key, fresh);
      p.then((d) => cachePut(key, d), () => {})
        .finally(() => { if (map.get(key) === fresh) map.delete(key); });
      ent = fresh;
    }
    const cur = ent;
    cur.users += 1;
    cur.subs.add(onPr);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      cur.subs.delete(onPr);
      cur.users -= 1;
      if (cur.users <= 0) {
        cur.ac.abort();
        if (map.get(key) === cur) map.delete(key);
      }
    };
    return { p: cur.p, release };
  }, [cachePut]);
  const [slice, setSlice] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** Растерыг юугаар будах вэ — гүн · хурд · аюул */
  const [fmode, setFmode] = useState<FloodMode>('depth');
  const wantFlood = mode === 'model' && hazard === 'flood';

  /**
   * ҮЕРИЙГ ХӨТӨЧ ДЭЭР БОДНО — төслийн 3D mesh-ээс гаргасан DSM дээр.
   *
   * ⚠️ Урьд нь ArcGIS-ийн бэлэн CRF гаралтыг (18.9 МБ) татдаг байсныг ХАСАВ:
   * тэр нь муу DEM дээр тооцогдсон (хэрэглэгчийн шийдвэр, 2026-09-07). Одоо
   * өндөр нь `/uyr/selbe-dsm.bin` (0.5 МБ) — mesh-ийн ЁРООЛООС гаргасан.
   *
   * ⚠️ ТҮВШИН СОЛИГДОХОД ДАХИН бодно: хур тунадас, үргэлжлэх хугацаа хоёр
   * түвшнээс хамаардаг тул нэг удаа бодоод кэшилбэл 1-р түвшний ус 3-р
   * түвшний нэрээр харагдана.
   */
  useEffect(() => {
    if (!wantFlood) return;
    let alive = true;
    /* ⚠️ 2026-09-30: загварчлалын эффект — түвшин/талбай солигдоход өмнөх үр дүнг синхрон
       тэглээд шинээр бодно; render үед гаргавал бүтэц өөрчлөгдөнө.
       (2026-10-01: `react-hooks/set-state-in-effect` энд мэдэгдэл өгөхөө больсон тул
       eslint-disable хасагдав — кэшийн эрт буцалттай болсон эффект.) */
    setFloodErr(null);
    setSlice(0);
    setSimEta(null);
    /* ⚠️ 2026-10-01: КЭШ — энэ (түвшин, талбай) аль хэдийн бодогдсон бол ШУУД */
    const key = simKey(level, area);
    const hit = simCache.current.get(key);
    if (hit) {
      setFlood(hit);
      setSimPct(1);
      simPromise.current = Promise.resolve(hit);
      return;
    }
    setSimPct(0);
    setFlood(null);
    /* ⚠️ Промисыг ref-д ХАДГАЛНА: «Шинжилгээ хийх» товч загварчлал дуусахаас
       ӨМНӨ дарагдвал хохирлыг буфер зурвасаар биш, БОДИТ үерээр бодохын тулд
       үүнийг хүлээнэ. */
    /* ⚠️ ЦУЦЛАЛТ (2026-09-21): `alive=false` нь зөвхөн setState-ийг хаадаг
       байсан тул түвшин/талбай хурдан солиход хуучин сим ЦААШАА гүйж, шинэтэй
       CPU булаалдан хоёулаа удааширдаг байв. Одоо `AbortController`-оор
       өмнөхийг ЗОГСООНО (`uyrSim.ts` §signal). */
    /* ⚠️ 2026-10-09: `runSim` — харьцуулалт ИЖИЛ (түвшин, талбай)-г бодож байвал түүнд нэгдэнэ;
       цуцлахад (`release`) өөр хэрэглэгч үлдсэн бол загварчлал үргэлжилнэ (`simInflight`-ийн ⚠️). */
    const t0 = performance.now();
    const { p: pr0, release } = runSim(level, area, (pr) => {
      /* ⚠️ 2026-09-29 (аудит 10): явцыг СИМИЙН ХУГАЦААГААР. Давталт `t >= totalS`
         дээр дуусдаг тул `step / MAX_STEPS` (9000) нь 15–40%-д гацаад шууд
         дуусдаг байв. Алхмын хязгаар түрүүлж хүрэх тохиолдолд аль ИХИЙГ нь. */
      if (!alive) return;
      const p = Math.min(0.99, Math.max(pr.minute / pr.totalMin, pr.step / pr.total));
      setSimPct(p);
      /* ⚠️ 2026-10-01: ҮЛДСЭН ХУГАЦАА — шугаман таамаг (`simEta`-ийн тайлбар) */
      const el = (performance.now() - t0) / 1000;
      setSimEta(p > 0.03 && el > 0.5 ? (el * (1 - p)) / p : null);
    });
    simPromise.current = pr0;
    pr0
      .then((d) => {
        if (alive) { setFlood(d); setSimPct(1); setSimEta(null); }
      })
      .catch((err: unknown) => {
        if (alive) setFloodErr(err instanceof Error ? err.message : String(err));
      });
    return () => { alive = false; release(); };
  }, [wantFlood, level, area, runSim]);

  /* ══════════════════ ЗАГВАРЧЛАХ ТАЛБАЙ ЗУРАХ ══════════════════
   *
   * ⚠️ Яагаад `SketchViewModel` (виджет БИШ) вэ: бэлэн `Sketch` виджет нь
   * өөрийн хэрэгслийн самбартай ирдэг ба тэр нь порталын зүүн баганын
   * зохиомжтой зөрчилдөнө. ViewModel нь зөвхөн ЗУРАХ ЛОГИКийг өгөх бөгөөд
   * товчийг бид өөрсдөө байрлуулна.
   *
   * ⚠️ MapView ба SceneView ХОЁУЛАНД ажиллана — 3D-д ч талбай зурж болно.
   */
  const areaLayerRef = useRef<GraphicsLayer | null>(null);
  const svmRef = useRef<SketchViewModel | null>(null);
  /** Одоогийн талбай + түүний проекц — view дахин үүсэхэд полигоныг сэргээнэ */
  const areaRef = useRef(area);
  useSyncRef(areaRef, area);
  const areaWkidRef = useRef<number>(3857);
  useEffect(() => {
    if (!view || view.destroyed || !view.map) return;
    /* ⚠️ Угтвар `ersdel:` — `MapCanvas`-ийн харагдалтын шүүлт зөвхөн үүнийг
       алгасдаг; эс бөгөөс давхарга солих бүрд зурсан талбай алга болно. */
    const gl = new GraphicsLayer({
      id: 'ersdel:area',
      listMode: 'hide',
      elevationInfo: { mode: 'on-the-ground' },
    });
    view.map.add(gl);
    const svm = new SketchViewModel({
      view,
      layer: gl,
      /* ⚠️ ДҮҮРГЭЛТГҮЙ: зурсан талбайн ДОТОР ус урсах тул дүүргэвэл
         загварчлалын үр дүнг өөрөө дардаг. */
      polygonSymbol: {
        type: 'simple-fill',
        color: [255, 255, 255, 0.04],
        outline: { color: [250, 204, 21, 0.95], width: 2 },
      } as unknown as SketchViewModel['polygonSymbol'],
      defaultCreateOptions: { hasZ: false },
    });
    /* ⚠️ 2026-09-25: 2D↔3D солиход view (мөн энэ давхарга) ШИНЭЭР үүсдэг тул
       зурсан полигон зурагнаас алга болж, харин `area` төлөв (загварчлал)
       хэвээр үлддэг байв — хил харагдахгүй ус. Төлөвөөс полигоныг сэргээнэ. */
    const cur = areaRef.current;
    /* ⚠️ 2026-10-09: СҮҮЛД ХЭРЭГЖСЭН талбайн график — хөрвүүлэлт унахад ҮҮНЭЭС бусдыг арилгана */
    let applied: __esri.Graphic | null = null;
    if (cur?.length) {
      applied = new Graphic({
        geometry: new Polygon({ rings: cur, spatialReference: { wkid: areaWkidRef.current } }),
        symbol: svm.polygonSymbol,
      });
      gl.add(applied);
    }
    /** Сүүлийн хөрвүүлэлт л хүчинтэй — асинхрон `areaToWm` хариу эрэмбээ алдаж ирэхэд */
    let areaSeq = 0;
    svm.on('create', (ev) => {
      /* ⚠️ 2026-09-25: Esc/цуцлалт (`cancel`) — урьд нь үл тоогдож `drawing`
         үнэн хэвээр гацаж, товч «зурж байна» төлөвт үлддэг байв. Өмнөх
         полигон (дахин зурахаас өмнөх) хэвээр — `drawArea` түүнийг устгахаа
         больсон. */
      if (ev.state === 'cancel') { setDrawing(false); return; }
      if (ev.state !== 'complete') return;
      setDrawing(false);
      const g = ev.graphic?.geometry as __esri.Polygon | undefined;
      if (!g?.rings?.length) return;
      const mine = ++areaSeq;
      /* ⚠️ ЗӨВХӨН x, y — `hasZ` асаалттай бол гурав дахь утга орж ирэх ба
         цэгэн доторх шалгалт (`inRings`) хоёр хэмжээст ажилладаг.
         ⚠️ 2026-10-09: WM руу хөрвүүлнэ (`areaToWm`) — загварчлал WM координат хүлээнэ.
         ⚠️ 2026-10-09 (аудит): хөрвүүлэлт асинхрон (`projectOperator` ачаална) ба УНАЖ болно — тэгвэл
         шинэ полигоныг хаяж, өмнөх талбай хэвээр, алдааг ил хэлнэ. Өмнөхийг ЗӨВХӨН амжилттай үед арилгана. */
      areaToWm(g).then((wa) => {
        if (mine !== areaSeq || view.destroyed) return;
        /* Шинэ полигон БЭЛЭН болсон тул л өмнөхийг арилгана */
        const old = gl.graphics.filter((x) => x !== ev.graphic).toArray();
        if (old.length) gl.removeMany(old);
        applied = ev.graphic ?? null;
        areaWkidRef.current = wa.wkid;
        setArea(wa.rings);
        /* ⚠️ Зурсан талбай руу ойртоно — загварчлал зөвхөн тэнд ажиллах тул
           хэрэглэгч бусад газрыг хайж «ус алга» гэж эргэлзэх ёсгүй. */
        if (g.extent) {
          view.goTo(g.extent.clone().expand(1.2), { animate: true, duration: 700 })
            .catch(() => {});
        }
      }, (err: unknown) => {
        if (mine !== areaSeq || view.destroyed) return;
        /* ⚠️ 2026-10-09: зөвхөн энэ полигоныг биш, СҮҮЛД ХЭРЭГЖСЭН талбайнхаас (`applied`) БУСАД
           бүх графикийг арилгана. Урьд нь дараалан хоёр зурахад эхнийх нь хариу хоцорч (`mine`
           хуучирсан) алгасагдаж, хоёр дахь нь унавал эхний полигон зураг дээр «хэрэгжсэн» мэт
           үлдэж, загварчлал өөр (өмнөх) талбай дээр явдаг байв. */
        const stray = gl.graphics.filter((x) => x !== applied).toArray();
        if (stray.length) gl.removeMany(stray);
        setFloodErr(err instanceof Error ? err.message : String(err));
      });
    });
    svm.on('update', (ev) => {
      /* Зурсны дараа чирж засварлавал домэйныг дагуулна */
      if (ev.state !== 'complete') return;
      const g = ev.graphics[0]?.geometry as __esri.Polygon | undefined;
      if (!g?.rings?.length) return;
      /* ⚠️ 2026-10-09: WM руу (`areaToWm`) — `create`-тэй ижил (асинхрон, унавал талбай хэвээр + алдаа) */
      const mine = ++areaSeq;
      areaToWm(g).then((wa) => {
        if (mine !== areaSeq || view.destroyed) return;
        areaWkidRef.current = wa.wkid;
        const next: SimArea = wa.rings;
        /* ⚠️ 2026-09-25 (аудит 8): `update … complete` нь полигон дээр ЗҮГЭЭР ДАРААД
           (сонгоод) гарахад ч ирдэг — цагираг өөрчлөгдөөгүй атлаа шинэ массив өгвөл
           доорх `area` эффект үр дүнг арилгаж, хэрэглэгч бодсон загварчлалаа алддаг
           байв. Ижил бол хуучин объектоо хадгална (эффект хөдлөхгүй). */
        setArea((prev) => (prev && sameRings(prev, next) ? prev : next));
      }, (err: unknown) => {
        if (mine !== areaSeq || view.destroyed) return;
        setFloodErr(err instanceof Error ? err.message : String(err));
      });
    });
    areaLayerRef.current = gl;
    svmRef.current = svm;
    return () => {
      /* ⚠️ 2026-09-25: зурж байхад view солигдвол `create` үйл явдал ирэхгүй —
         `drawing` гацахаас сэргийлнэ */
      setDrawing(false);
      svm.destroy();
      if (view.map) view.map.remove(gl);
      gl.destroy();
      areaLayerRef.current = null;
      svmRef.current = null;
    };
  }, [view]);

  const drawArea = useCallback(() => {
    const svm = svmRef.current;
    if (!svm) return;
    /* ⚠️ 2026-09-25: өмнөх полигоныг ЭНД устгахгүй — дахин зурахыг цуцалбал
       (Esc) талбай зурагнаас алга болж, `area` төлөв хэвээр үлддэг байв.
       Шинэ полигон `create: complete` үед л өмнөхийг сольно. */
    setDrawing(true);
    svm.create('polygon');
  }, []);

  const clearArea = useCallback(() => {
    svmRef.current?.cancel();
    areaLayerRef.current?.removeAll();
    setDrawing(false);
    setArea(null);
  }, []);

  /**
   * ⚠️ ТОГЛУУЛАЛТЫГ ЭНД удирдахГҮЙ. Урьд нь `setInterval`-ээр 900 мс тутам
   * зүсмэл сольдог байсан нь «12 өөр зураг» болж үсэрдэг байв — ус УРСАХГҮЙ.
   * Одоо `Overlay` нь `requestAnimationFrame`-ээр зүсмэл хоорондыг шингээж,
   * урсгалын долгион нэмж зурна; энд зөвхөн ЯВЦЫН заагчийг дагуулна.
   */

  const floodRef = useRef<FloodData | null>(flood);
  useSyncRef(floodRef, flood);
  const sliceRef = useRef(slice);
  useSyncRef(sliceRef, slice);

  const q = useAsync(loadStations, []);
  /**
   * ⚠️ `useMemo` ЗААВАЛ. Урьд нь `q.state === 'ready' ? q.data : []` гэж шууд
   * бичдэг байсан — ачаалж байх үед `[]` ЛИТЕРАЛ нь рендер БҮРТ шинэ
   * лавлагаатай болж, түүнээс хамаарсан бүх `useMemo`/`useCallback` (`live`,
   * `airHub`, `onPick`) дахин бодогддог байв. Тогтмол хоосон массив нь тэр
   * гинжийг таслана.
   */
  const stations: Station[] = useMemo(
    () => (q.state === 'ready' ? q.data : EMPTY_STATIONS),
    [q.state, q.data],
  );
  const live = useMemo(() => buildLive(stations, now), [stations, now]);
  const water = live.filter((s) => s.kind === 'water');
  const air = live.filter((s) => s.kind === 'air');

  /**
   * САЛХИ — агаарын харуулуудын ТӨВ цэг дээрх Open-Meteo-гийн заалт.
   *
   * ⚠️ Харуул бүрд тусад нь татахгүй: Сэлбэ талбай ~2км-ийн дотор багтдаг тул
   * 10м өндрийн салхи бүгдэд нь бараг ижил. Нэг дуудлага = API-д хамаагүй
   * бага ачаалал (үнэгүй, түлхүүргүй тул өдрийн квоттой).
   *
   * ⚠️ ЭХ СУРВАЛЖ нь `stations` (татсан массив), `air`/`live` БИШ. `live` нь
   * `now`-оос хамаарч МИНУТ ТУТАМ дахин бодогддог, `air` нь рендер бүрт шинэ
   * `filter()` үр дүн — тэднээс хамаарвал `useAsync`-ийн deps рендер бүрт
   * шинэчлэгдэж, Open-Meteo руу ТАСРАЛТГҮЙ хүсэлт явуулна (setState → рендер
   * → дахин татах гэсэн давталт). Харуулын БАЙРШИЛ хугацаанаас хамаардаггүй
   * тул `stations`-оос шууд бодох нь зөв бөгөөс хямд.
   *
   * ⚠️ deps нь МӨР (`hubKey`), объект БИШ: `useMemo` буцаасан объект нь
   * `stations` солигдох бүрд шинэ лавлагаатай болно.
   */
  /**
   * ХАРУУЛ ТУС БҮРИЙН PM2.5 — сэвсгэрийн уртыг масштаблахад.
   *
   * ⚠️ ЭХ СУРВАЛЖ нь `live` (тухайн харуулын цуваа), нэгдсэн дундаж БИШ:
   * зорилго нь «аль харуул илүү бохир вэ» гэдгийг ЗУРГАН ДЭЭР харуулах.
   * Дундажаар бодвол бүх сэвсгэр ижил урттай болж, тэр асуулт хариултгүй
   * үлдэнэ.
   *
   * ⚠️ Заалт нь ЖИШЭЭ ӨГӨГДӨЛ (тэр давхаргад утгын талбар байхгүй) — гэхдээ
   * ДЕТЕРМИНИСТ тул харуул бүр өөрийн тогтвортой утгатай.
   */
  const pm25ByOid = useMemo(() => {
    const out: Record<number, number> = {};
    for (const st of live) {
      if (st.kind !== 'air') continue;
      const m = st.metrics.find((x) => x.key === 'pm25');
      if (m) out[st.oid] = m.latest;
    }
    return out;
  }, [live]);

  const airHub = useMemo(() => {
    const pts = stations.filter((s) => s.kind === 'air');
    if (!pts.length) return null;
    const lat = pts.reduce((s2, x) => s2 + x.lat, 0) / pts.length;
    const lon = pts.reduce((s2, x) => s2 + x.lon, 0) / pts.length;
    return { lat, lon };
  }, [stations]);
  const hubKey = airHub ? `${airHub.lat.toFixed(3)},${airHub.lon.toFixed(3)}` : '';
  /* ⚠️ 2026-09-29 (аудит 10): САЛХИНЫ ӨДӨР цагийн алхамтай `now`-оос. Урьд нь
     `useMemo(…, [])` ба `windQ`-ийн `[hubKey]` хамаарал нь ачааллын өдөрт
     ХӨЛДДӨГ тул шөнөжин нээлттэй дэлгэц өчигдрийн салхийг «одоогийн» гэж
     харуулдаг байв. `now` зөвхөн цаг солигдоход өөрчлөгдөх тул шинэ таймер
     нэмэхгүй; `ymd` нь УБ-ын өдрөөр (`TZ`), `loadWind` ч өөрийн өдрөөр кэшилнэ. */
  const windDate = useMemo(() => ymd(new Date(now)), [now]);
  const windQ = useAsync(
    () => {
      if (!hubKey) return Promise.resolve(null);
      const [la, lo] = hubKey.split(',').map(Number);
      return loadWind(la, lo);
    },
    [hubKey, windDate],
  );
  const wind = windQ.state === 'ready' ? windQ.data : null;
  const windNow = wind ? nowHour(wind) : null;

  /* ══════════════ САЛХИНЫ УРСГАЛ (WIND-MODULE.md §6, §9) ══════════════ */

  /**
   * Урсгалын анимац асаалттай эсэх.
   *
   * ⚠️ АГААРЫН БОХИРДОЛ сонгоход ӨӨРӨӨ АСНА (2026-09-03, хэрэглэгчийн хүсэлт) —
   * доорх эффект. Салхи нь тэр аюулын ШАЛТГААНЫ хэсэг (бохирдол хаашаа явахыг
   * тодорхойлно) тул нэмэлт товч дарах шаардлагагүй.
   *
   * ⚠️ Анхны утга нь `'flood'`-той тохирч УНТРААЛТТАЙ: үерийн горимд салхи
   * хамааралгүй бөгөөд Open-Meteo руу дэмий хүсэлт явж, ~20 фрейм/сек-ийн
   * GPU ачаалал үүснэ.
   */
  const [windFlow, setWindFlow] = useState(false);

  /**
   * ⚠️ ЗӨВХӨН АЮУЛЫН ТӨРӨЛ СОЛИГДОХОД ажиллана. `windFlow`-г хамааралд
   * оруулбал хэрэглэгч гараар унтраамагц эффект дахин асааж, товч нь ажиллахаа
   * болино — агаарын горимд байхад унтраах боломжгүй болно.
   */
  /* ⚠️ 2026-09-30: эффект биш, RENDER дунд тохируулна (React-ийн «adjusting state
     when a prop changes» загвар) — `hazard` солигдсон тэр render-т л шинэ утга
     тавигдана, хэрэглэгчийн гараар унтраасан утга бусад render-д хөндөгдөхгүй. */
  const [windFlowHazard, setWindFlowHazard] = useState(hazard);
  if (windFlowHazard !== hazard) {
    setWindFlowHazard(hazard);
    setWindFlow(hazard === 'air');
  }

  /**
   * ⚠️ ХУГАЦААНЫ ШУГАМ ХАСАГДСАН (2026-09-03, хэрэглэгчийн хүсэлт). Эх модульд
   * (`WIND-MODULE.md` §6) −90…+15 хоногийн гүйлгэгч, 700 мс тоглуулалт байсан.
   * Энэ самбарын асуулт нь «ОДОО бохирдол хаашаа явж байна» — өнгөрсөн/ирээдүйн
   * салхи нь тусдаа судалгааны хэрэгсэл бөгөөд аюулын мужийн шинжилгээтэй
   * зэрэгцэн байвал «аль цагийн зураг вэ» гэдэг эргэлзээ төрүүлнэ.
   *
   * ⚠️ Тиймээс ҮРГЭЛЖ ӨНӨӨДРИЙН огноо, ОДООГИЙН цаг (`windDate` — `windQ`-ийн
   * өмнө тодорхойлогдсон, 2026-09-29).
   */

  /**
   * ⚠️ Талбарыг ЗӨВХӨН урсгал асаалттай үед татна. `enabled`-гүй бол хуудас
   * нээх бүрд 152 цэгийн хүсэлт явж, өдрийн квотыг дэмий иднэ.
   */
  const fieldQ = useAsync(
    () => (windFlow ? loadWindField(windDate) : Promise.resolve(null)),
    [windFlow, windDate],
  );
  const windField = fieldQ.state === 'ready' ? fieldQ.data : null;

  /** Идэвхтэй цагийн индекс — ҮРГЭЛЖ одоогийн цаг */
  const [windH, setWindH] = useState(0);
  /* ⚠️ 2026-09-30: талбар ирэхэд/солигдоход индексийг RENDER дунд тохируулна
     (эффект дотор setState биш) — `null` болоход хуучин индекс хэвээр (урьдынхтай ижил). */
  const [windHField, setWindHField] = useState(windField);
  if (windHField !== windField) {
    setWindHField(windField);
    if (windField) setWindH(nowIndex(windField));
  }
  useEffect(() => {
    if (!windField) return;
    /**
     * ⚠️ ЦАГ БҮР ШИНЭЧЛЭНЭ. Хуудсыг нээлттэй орхивол (хяналтын дэлгэц дээр
     * ердийн зүйл) индекс хөлдөж, шөнө дунд өдрийн салхи урсаж байх болно.
     * Минут тутам шалгах нь хямд — цаг солигдоход л төлөв өөрчлөгдөнө.
     */
    const id = window.setInterval(() => setWindH(nowIndex(windField)), 60_000);
    return () => window.clearInterval(id);
  }, [windField]);

  /* ══════════════ ӨРТӨӨГҮЙГ БҮДЭГРҮҮЛЭХ ══════════════ */

  /**
   * Шинжилгээний дараа өртөөгүй давхаргыг бүдгэрүүлэх үү.
   *
   * ⚠️ 2026-09-03 (хэрэглэгчийн хүсэлт). Үр дүн гарсны дараа зурагт хэдэн
   * зуун барилга, зам, шугам ижил тодоор зогсож, улаанаар тэмдэглэгдсэн
   * ӨРТСӨН зүйлс тэдний дунд алга болдог байв. Бүдгэрүүлснээр анхаарал
   * шууд өртсөн зүйлс дээр очно.
   *
   * ⚠️ Хэрэглэгч унтрааж чадна: контекст (юуны дунд байгаа нь) заримдаа
   * өртсөн жагсаалтаас илүү чухал асуулт болдог.
   */
  const [dimRest, setDimRest] = useState(true);

  /** Бүдгэрүүлэх түвшин — 0 бол бүрэн алга болж, «юу ч байхгүй» гэж уншигдана */
  const DIM = 0.22;

  /**
   * ЗУРАГТ ӨГӨХ ТУНГАЛАГ — хэрэглэгчийн гулсуур дээр бүдэгрүүлэлт нэмнэ.
   *
   * ⚠️ ӨРТСӨН объектууд `Overlay`-гийн ТУСДАА график давхаргад (`DMG_ID`)
   * улаанаар зурагддаг тул энд бүдгэрүүлсэн ч тэд БҮРЭН тодоор үлдэнэ —
   * яг тэр ялгаа нь харагдацын гол утга.
   *
   * ⚠️ Хэрэглэгчийн гараар тохируулсан утгыг ҮРЖҮҮЛНЭ, дарж бичихгүй:
   * «Тунгалаг» хавтангаас 50% болгосон давхарга бүдэгрүүлэлттэй үед 11%
   * болох ёстой, гэнэт 22% болж ТОДРОХ ёсгүй.
   */
  const mapOpacity = useMemo(() => {
    if (!dimRest || !result) return opacity;
    const out: Record<string, number> = {};
    for (const id of visible) out[id] = (opacity[id] ?? 1) * DIM;
    return out;
  }, [dimRest, result, opacity, visible]);

  /** Сонгосон харуул — сонгоогүй бол горимд тохирох эхнийх */
  const current: StationLive | null =
    live.find((s) => s.oid === sel) ?? live[0] ?? null;

  /**
   * ИДЭВХТЭЙ ДАВХАРГА — зурагт ЯГ ОДОО асаалттай, каталогийн мэддэг
   * (`LAYER_BY_ID`) объектын давхаргууд.
   *
   * ⚠️ `visible` (каталогийн чагт) БИШ, ЗУРГААС уншина: 2D-д суурь давхаргууд
   * (`BASE_MAP_IDS`) чагтгүйгээр ч асаалттай байдаг бөгөөд хэрэглэгчийн нүдээр
   * тэдгээр нь ч «идэвхтэй». Хэрэглэгч «миний идэвхтэй давхаргууд» гэж хэлэхэд
   * зөвхөн чагт тавьсныг нь ойлгодоггүй.
   */
  const activeIds = useCallback((): { ids: string[]; src: Result['src'] } => {
    const map = view?.map;
    const out: string[] = [];
    map?.layers.forEach((l) => {
      if (!l.visible || !LAYER_BY_ID[l.id]) return;
      /* ⚠️ 2026-09-30: өмнөх шинжилгээ ӨӨРӨӨ асаасныг хэрэглэгчийн сонголт гэж үзэхгүй (`autoOn`) */
      if (autoOn.current.has(l.id)) return;
      // Зөвхөн объектын давхарга — ортофото/меш/BIM-ээс объект тоолох боломжгүй
      if (typeof (l as { queryFeatures?: unknown }).queryFeatures !== 'function') return;
      out.push(l.id);
    });
    if (out.length) return { ids: out, src: 'map' };
    /**
     * ⚠️ Нэг ч давхарга асаагүй (энэ харагдацын АНХДАГЧ төлөв) — үнэлгээний
     * үндсэн багцаар тооцно. Давхарга нь зурагт НУУГДМАЛ ч `map`-д баригдсан
     * байдаг тул `queryFeatures` хэвийн ажиллана.
     *
     * ⚠️ 2026-09-08: каталогийн чагт (`visible`) ба үндсэн багц (`ASSESS_IDS`)
     * хоёрыг НЭГ «fallback» гэж нийлүүлж болохгүй — тэдгээр нь өөр өөр
     * олонлог тул самбарт өөр өөр өгүүлбэр бичигдэнэ.
     */
    const picked = visible.filter((id) => !autoOn.current.has(id));
    return picked.length
      ? { ids: picked, src: 'catalog' }
      : { ids: ASSESS_IDS, src: 'base' };
  }, [view, visible]);

  /* ── Шинжилгээ ── */

  /**
   * ШИНЖИЛГЭЭНИЙ ДАРААЛЛЫН ДУГААР (2026-09-21).
   *
   * ⚠️ `run()` нь ХЭД ХЭДЭН `await`-тай (загварчлалын промис, `floodExtent`,
   * `damageOf`-ийн REST асуулга). Урьд нь дараалал таних юм байгаагүй тул
   * 1-р түвшний шинжилгээ явж байхад хэрэглэгч 3-р түвшин сонгоод дахин
   * дарахад ХУУЧИН нислэгийн `setResult`/`setVisible`/`setPlaying` хожуу
   * ирж, самбарт «3-р түвшин» гэж бичсэн атлаа 1-р түвшний хохирол,
   * мөр гарч байв. Түвшин/аюул/горим солиход ба `clear()`-т дугаар өснө;
   * `await` бүрийн дараа зөрвөл тэр нислэг чимээгүй ЗОГСОНО.
   */
  const runSeq = useRef(0);

  const run = useCallback(async () => {
    if (!view) return;
    const seq = ++runSeq.current;
    const stale = () => seq !== runSeq.current;
    setBusy(true);
    setRunErr(null);
    /** Хохирол загварчлалын мөрөөр бодогдов уу (эсвэл буферээр ухарсан уу) */
    let simFootprint = false;
    /** Буферээр ухарсан шалтгаан — ⚠️ 2026-09-29 (аудит 10), `simWhy`-г үз */
    let simWhy: 'notReady' | 'dry' | 'failed' = 'notReady';
    try {
      /**
       * ⚠️ АГААРЫН СЭВСГЭР нь БОДИТ САЛХИАР чиглэнэ (2026-09-03, хүсэлт).
       * `windNow` нь Open-Meteo-гийн одоогийн цагийн заалт; татагдаагүй бол
       * `null` очиж, хувилбарын тогтмол (`AIR_LEVELS[level].windDir`) руу
       * ухарна — шинжилгээ САЛХИГҮЙ ч ажиллах ёстой.
       *
       * ⚠️ `bands` ба `extent` ХОЁУЛАА ижил салхи авна: зөрвөл зурагдсан
       * бүс ба хохирол тоолсон муж хоёр өөр чиглэлд харна.
       */
      /**
       * ⚠️ АЮУЛЫН МУЖ = ЗАГВАРЧЛАЛЫН МӨР (2026-09-09).
       *
       * Урьд нь голын ирмэгээс татсан БУФЕР зурвасыг зурдаг байсан нь одоо
       * зөрчил үүсгэнэ: хохирол нь загварчлалын мөрөөр бодогддог, харин
       * зурган дээрх шар зурвас нь голын дагуу л сунадаг. Хэрэглэгч «яагаад
       * зурвасын гадна барилга улаан болов» гэж уншина. Одоо ГАНЦ хил:
       * загварчлалын усанд автсан талбай.
       *
       * ⚠️ Буфер нь загварчлал БЭЛЭН БИШ үед л ухарч ажиллана.
       */
      let bands: Band[] = [];
      /**
       * ⚠️ ХОХИРЛЫН МУЖ = ЗАГВАРЧЛАЛЫН БОДИТ ҮЕРИЙН МӨР (2026-09-09).
       *
       * Урьд нь голын ирмэгээс татсан БУФЕР зурвасаар бодогддог байсан тул
       * зурган дээр урсаж буй ус ба улаанаар тэмдэглэсэн хохирол хоёр ЗӨРДӨГ
       * байв — хэрэглэгч «яагаад ус тэнд байхад барилга өртөөгүй бэ» гэж
       * асуухаас өөр аргагүй. Одоо хоёулаа НЭГ эх сурвалжтай.
       *
       * ⚠️ БҮХ ХУГАЦААНЫ дээд гүнээр: үер 12-р минутад нэг гудамжийг, 40-р
       * минутад нөгөөг авч болно — хохирол хоёуланг нь тоолох ёстой.
       *
       * ⚠️ Загварчлал дуусаагүй бол ХҮЛЭЭНЭ. Хүлээхгүй бол эхний товшилт
       * буфер, хоёр дахь нь загварчлалаар бодогдож, ижил оролтод ӨӨР хариу
       * гарна.
       */
      let extent: Polygon | null = null;
      /** Загварчлалын үр дүн — ⚠️ `flood` төлөв БИШ (доор §fd) */
      let fd: FloodData | null = null;
      if (hazard === 'flood') {
        /* ⚠️ `fd`-г ЭНД ХАДГАЛНА (2026-09-21): урьд нь доор `flood?.meta.peakDepthM`
           гэж ТӨЛӨВӨӨС уншдаг байсан ч загварчлал дөнгөж дууссан агшинд `flood`
           нь энэ closure-т `null` хэвээр (setState хараахан рендерлээгүй) тул
           мужийн утга буфер аргын `depth` руу чимээгүй ухардаг байв. */
        /* ⚠️ 2026-09-25: `floodRef` — `flood` төлөв `run`-ий deps-д байхгүй тул
           closure нь ӨМНӨХ түвшин/талбайн загварчлалыг барьж, 3-р түвшинд 1-р
           түвшний усаар хохирол бодогдож болдог байв. Ref нь үргэлж сүүлийн
           рендерийнх (түвшин солигдоход эффект `setFlood(null)` хийнэ). */
        /* ⚠️ 2026-09-29 (аудит 10): УНАСАН ба ЦУЦЛАГДСАН хоёрыг ялгана —
           `AbortError` нь шинэ сим эхэлсний дохио (дахин ажиллуулбал болно),
           бусад алдаа нь дахин ажиллуулаад арилахгүй. */
        fd = floodRef.current
          ?? (await simPromise.current?.catch((er: unknown) => {
            if (!(er instanceof Error && er.name === 'AbortError')) simWhy = 'failed';
            return null;
          }))
          ?? null;
        if (stale()) return;
        /* ⚠️ 2026-10-01: мөрийг ОРОЙН ТӨСӨВТ багтааж хялбарчилна (`hazardPolygon`) —
           Chaikin-ий 10–20 мянган оройтой полигон давхарга бүрийн асуулгыг удаашруулдаг байв */
        const hp = fd ? hazardPolygon(fd) : null;
        if (hp) {
          extent = hp.poly;
          simFootprint = true;
        } else {
          if (fd) simWhy = 'dry';
          extent = await floodExtent(level);
          if (stale()) return;
        }
      } else {
        /* ⚠️ 2026-10-09: бүсийг НЭГ удаа бодоод мужийг тэдгээрийн нэгдлээс —
           урьд нь `airExtent` нь `airBands`-ийг дахин дуудаж буфер/нэгтгэлийг давтдаг байв */
        bands = airBands(stations, level, windNow, pm25ByOid);
        extent = bandsExtent(bands);
      }
      if (!extent) throw new Error(tr('Аюулын мужийг байгуулж чадсангүй'));
      /* ⚠️ 2026-10-09: агаарын бүс дээр (`airBands`) аль хэдийн бодогдсон */
      if (hazard === 'flood' && simFootprint) {
        bands = [{
          key: `flood-${level}`,
          label: tr('Загварчлалын үерийн мөр'),
          value: fd?.meta.peakDepthM ?? FLOOD_LEVELS[level].depth,
          height: FLOOD_LEVELS[level].depth,
          /* ⚠️ 2026-09-30: HEX ЗААВАЛ — `LEVELS[].color` нь 'var(--bad)' тул `Overlay.rgb()`
             NaN болж муж 2D/3D-д ЦАГААН зурагддаг байв (легенд нь өөр өнгөтэй).
             Үерийн аюулын муж = нэг улаан (`ersdelGeom.floodBands` 2026-09-03). */
          hue: '#dc2626',
          geometry: extent,
        }];
      } else if (hazard === 'flood') {
        bands = await floodBands(level);
        if (stale()) return;
      }
      const { ids, src } = activeIds();
      /* ⚠️ `failed` — татагдаагүй давхарга. «Эрсдэлгүй» ба «мэдээлэлгүй»
         хоёрыг ялгах ёстой тул шинжилсэн давхаргын тоог УНАСНААР нь
         хасаж, дутууг хэрэглэгчид ил хэлнэ (2026-09-03-ны аудит). */
      /* ⚠️ 2026-10-01: объект бүрийн ДЭЭД ГҮН — загварчлалын `maxDepth`-ээс */
      const fdD = hazard === 'flood' && fd?.maxDepth ? fd : null;
      const { rows, failed, analyzed } = await damageOf(view, ids, extent, level, hazard, {
        depthOf: fdD ? (g) => footprintDepth(fdD, g) : undefined,
      });
      /* ⚠️ Хамгийн урт хүлээлт — ЭНД зөрвөл доорх бүх setState хуучин түвшнийх */
      if (stale()) return;
      setResult({
        hazard, level, bands, rows, simFootprint,
        simWhy: hazard === 'flood' && !simFootprint ? simWhy : undefined,
        /* ⚠️ 2026-09-25: алгассан давхаргыг тоолохгүй — `damageOf`-ийн `analyzed` */
        layers: analyzed,
        failed,
        src,
        zoneRings: extent.rings,
      });
      /**
       * ⚠️ ӨРТСӨН ДАВХАРГЫГ ЗУРАГТ АСААНА (2026-08-29, хүсэлт).
       *
       * Улаан тодруулга нь `Overlay`-гийн ТУСДАА графикаар зурагддаг тул
       * давхарга нь өөрөө унтраалттай байсан ч улаан контур гарч ирдэг —
       * гэвч тэр үед хажууд нь өртөөгүй барилга/шугам ХАРАГДАХГҮЙ, улмаас
       * «юунаас хэд нь өртөв» гэдэг харьцаа алга болно. Тиймээс өртсөн зүйл
       * ОЛДСОН давхаргуудыг л асаана.
       *
       * ⚠️ Хэрэглэгчийн асаасан давхаргыг УНТРААХГҮЙ — зөвхөн НЭМНЭ.
       */
      const hit = rows.filter((r) => r.n > 0).map((r) => r.layerId);
      if (hit.length) {
        setVisible((prev) => {
          /* ⚠️ Урьд асаалттай байгаагүйг л «автомат» гэж тэмдэглэнэ (`autoOn`) */
          for (const id of hit) if (!prev.includes(id)) autoOn.current.add(id);
          return [...new Set([...prev, ...hit])];
        });
      }
      /**
       * ⚠️ ҮЕРИЙН шинжилгээ дуусмагц ус ӨӨРӨӨ УРСАЖ эхэлнэ (2026-08-29, хүсэлт).
       * Урьд нь `playing` нь `false`-ээр эхэлдэг байсан тул хэрэглэгч «▶»
       * товчийг олж дарах хүртэл зураг дээр ХӨЛДСӨН ганц агшин харагдаж,
       * загварчлалын гол утга — усны ТАРХАЛТЫН ЯВЦ — нуугдаж байлаа.
       * Агаарын хувилбарт цаг хугацааны цуваа байхгүй тул хамаарахгүй.
       */
      setPlaying(hazard === 'flood');
      // Үр дүн рүү зөөлөн ойртоно — муж дэлгэцээс хальж болзошгүй
      if (!view.destroyed && extent.extent) {
        view.goTo(extent.extent.clone().expand(1.15), { animate: true, duration: 900 }).catch(() => {});
      }
    } catch (err) {
      if (stale()) return;
      setRunErr(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      /* ⚠️ Хуучирсан нислэг ШИНЭ нислэгийн «ажиллаж байна» төлөвийг унтраахгүй */
      if (!stale()) setBusy(false);
    }
    /* ⚠️ `windNow` нь deps-д — дараагийн ажиллуулалт ЗААВАЛ шинэ салхийг
       авах ёстой. Автоматаар дахин ажиллуулахгүй (хэрэглэгч «Шинжилгээ» дарна). */
  }, [view, hazard, level, stations, windNow, pm25ByOid, activeIds, setVisible]);

  /* ══════════ ТҮВШНҮҮДИЙН ХАРЬЦУУЛАЛТ (2026-10-01, «хэрэглэгч: бүгдийг зас») ══════════
   *
   * 1–3-р түвшинг НЭГ дор: усанд автсан талбай · дээд гүн · өртсөн объект · хохирол.
   * ⚠️ Гурвуулаа НЭГ нөхцөлөөр — ижил талбай (`area`), ижил давхаргын олонлог
   *    (товч дарах агшны `activeIds()`). Эс бөгөөс түвшин хоорондын ялгаа нь
   *    давхарга асаасан/унтраасны ялгаа болж хувирна.
   * ⚠️ Загварчлал нь КЭШЭЭС (`simCache`), явж буй үндсэн загварчлалыг ДАВХАР бодохгүй.
   */
  const [cmp, setCmp] = useState<{
    key: string;
    rows: Partial<Record<LevelKey, CmpRow>>;
    busy: LevelKey | null;
    pct: number;
    err: string | null;
    src: Result['src'];
  } | null>(null);
  const cmpSeq = useRef(0);
  const cmpAbort = useRef<AbortController | null>(null);
  /* Талбай солигдох/харагдац хаагдахад явж буй харьцуулалтыг зогсооно */
  /* ⚠️ 2026-10-07: цуцлахад `busy`-г ч тэглэнэ — seq зөрсөн салбарууд state-д хүрдэггүй тул
     талбай солиход «…%» гацаж, «Харьцуулах» товч мөнхөд идэвхгүй үлддэг байв. */
  useEffect(() => () => {
    cmpSeq.current++;
    cmpAbort.current?.abort();
    setCmp((c) => (c && c.busy != null ? { ...c, busy: null } : c));
  }, [area]);

  const getSim = useCallback(async (lv: LevelKey, a: SimArea | null, onPct: (p: number) => void): Promise<FloodData> => {
    const key = simKey(lv, a);
    const hit = simCache.current.get(key);
    if (hit) return hit;
    /* ⚠️ 2026-10-09: явж буй загварчлалыг (үндсэн эффектийнх ч) `runSim`-ээр ХУВААЛЦАНА — давхар бодохгүй.
       Харьцуулалтыг цуцлахад (`cmpAbort`) зөвхөн ӨӨРИЙН хэрэглээг суллана: үндсэн эффект ижил
       загварчлалыг хүлээж байвал зогсохгүй. Кэшлэх нь `runSim` дотор. */
    const ac = new AbortController();
    cmpAbort.current = ac;
    const { p, release } = runSim(lv, a, (pr) => onPct(Math.min(0.99, pr.minute / pr.totalMin)));
    try {
      return await new Promise<FloodData>((res, rej) => {
        if (ac.signal.aborted) { rej(abortError()); return; }
        ac.signal.addEventListener('abort', () => rej(abortError()), { once: true });
        p.then(res, rej);
      });
    } finally {
      release();
    }
  }, [runSim]);

  const compareAll = useCallback(async () => {
    if (!view) return;
    const seq = ++cmpSeq.current;
    cmpAbort.current?.abort();
    const aKey = areaKey(area);
    const { ids, src } = activeIds();
    setCmp({ key: aKey, rows: {}, busy: 1, pct: 0, err: null, src });
    try {
      for (const lv of [1, 2, 3] as LevelKey[]) {
        if (seq !== cmpSeq.current) return;
        setCmp((c) => (c ? { ...c, busy: lv, pct: 0 } : c));
        const fd = await getSim(lv, area, (p) => {
          if (seq === cmpSeq.current) setCmp((c) => (c ? { ...c, pct: p } : c));
        });
        if (seq !== cmpSeq.current) return;
        const hp = hazardPolygon(fd);
        let n = 0;
        let cost = 0;
        let unknown = 0;
        let failedN = 0;
        if (hp) {
          const r = await damageOf(view, ids, hp.poly, lv, 'flood');
          if (seq !== cmpSeq.current) return;
          for (const row of r.rows) {
            n += row.n;
            if (row.cost == null) unknown++;
            else cost += row.cost;
          }
          failedN = r.failed.length;
        }
        const row: CmpRow = {
          level: lv, wetHa: fd.meta.totalWetHa, peakM: fd.meta.peakDepthM,
          /* ⚠️ Бүх давхарга унасан бол «0 объект» БИШ — мэдэгдэхгүй */
          n: hp && failedN && !n ? null : n,
          cost: hp && failedN && !n ? null : cost,
          unknown, failed: failedN,
        };
        setCmp((c) => (c ? { ...c, rows: { ...c.rows, [lv]: row } } : c));
      }
      if (seq === cmpSeq.current) setCmp((c) => (c ? { ...c, busy: null } : c));
    } catch (err) {
      if (seq !== cmpSeq.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setCmp((c) => (c ? { ...c, busy: null, err: err instanceof Error ? err.message : String(err) } : c));
    }
  }, [view, area, activeIds, getSim]);

  /* ══════════ Зурган дээрх мэдээлэл — «дарж юу вэ гэдгийг мэдэх» ══════════
   *
   * ⚠️ ХОЁР ТУСДАА эх сурвалж, тусдаа нүд:
   *   · `hazInfo`  — `Overlay`-гийн даралт: улаан объект, аюулын муж, харуул.
   *   · `featInfo` — `MapCanvas`-ийн өөрийн даралт: каталогийн давхаргын объект.
   *
   * Нэг даралтад ХОЁУЛАА ажиллана (өөр өөр асуултад хариулна) бөгөөд аль нь
   * түрүүлж дуусахыг баталгаажуулах боломжгүй — `MapCanvas`-ийнх нь заримдаа
   * REST асуулга руу шилждэг тул удаан. Нэг нүдэнд бичвэл сүүлд ирсэн `null`
   * нь нөгөөгийнхөө олсон хариуг чимээгүй устгана. Тиймээс тусад нь хадгалж,
   * дэлгэцэд аюулынхыг НЬ ТЭРГҮҮНД тавина. (Төлөвийн зарлалт дээр, `sel`-ийн хажууд.)
   */
  const info = hazInfo ?? featInfo;

  const clear = useCallback(() => {
    /* ⚠️ Явж буй шинжилгээг хүчингүй болгоно — эс бөгөөс «Цэвэрлэх» дарсны
       дараа хоцорсон хариу ирж, устгасан үр дүн буцаж гарна (2026-09-21) */
    runSeq.current++;
    setBusy(false);
    setResult(null);
    setRunErr(null);
    /* ⚠️ Мэдээллийн хайрцгийг ч хаана — эс бөгөөс устгасан үр дүнгийн мужийн
       гүн/агууламж зурган дээр үлдэж, «юу ч байхгүй атал тоо байна» болно. */
    setHazInfo(null);
    setFeatInfo(null);
    /* ⚠️ УСНЫ ЗАМ ч арилна (2026-09-21): урьд нь зөвхөн хайрцгийн × дээр
       тэглэгддэг байсан тул цэвэрлэсний дараа ч хуучин нүдний зам зурагт
       үлддэг байв. */
    setPath(null);
  }, []);

  const liveRef = useRef(live);
  useSyncRef(liveRef, live);
  const resultRef = useRef(result);
  useSyncRef(resultRef, result);
  const viewRef = useRef(view);
  useSyncRef(viewRef, view);
  const hazardRef = useRef(hazard);
  useSyncRef(hazardRef, hazard);

  /**
   * Мужийн утга — үерт гүн (м), агаарт агууламж (µg/м³).
   * ⚠️ Үерт шошго нь «Мужийн дээд гүн», «Усны гүн» БИШ (2026-09-21): мужийн
   * утга нь мужийн ХАМГИЙН ГҮН цэгийнх тул хуурай цэгт дарахад ч «Усны гүн
   * 2.3 м» гэж гардаг байв. Тухайн цэгийн гүн тусдаа мөрөөр (§band).
   */
  const bandRow = useCallback((b: Band): { k: string; v: string } => (
    (resultRef.current?.hazard ?? hazardRef.current) === 'flood'
      ? { k: tr('Мужийн дээд гүн'), v: tr('{0} м', num(b.value, 2)) }
      : { k: tr('PM2.5 агууламж'), v: tr('{0} µg/м³', num(b.value, 0)) }
  ), []);

  /**
   * ДАРАЛТЫН ДУГААР — хоцорсон атрибутын хариу шинийг дарж бичихээс хамгаална.
   *
   * ⚠️ «Өртсөн объект» салбар нь эх давхаргаас `queryFeatures` хийдэг тул
   * ASYNC. Урьд нь дараалал таних юм байгаагүй: том давхаргын объект A-г
   * дараад тэр дороо B-г дарахад B-гийн хариу түрүүлж гарч, дараа нь A-гийн
   * хариу ирж `setHazInfo` дуудсанаар зурагт B сонгогдсон байтал самбарт
   * A-гийн нэр, мужийн утга, атрибутууд харагддаг байв — хэрэглэгч буруу
   * объектын гүн/агууламжийг уншина.
   *
   * ⚠️ Тоолуурыг функцын ЭХЭНД өсгөнө: шинэ даралт нь ямар ч төрлийнх
   * (харуул, үерийн нүд, муж, `null`) байсан нислэгт яваа хуучин хүсэлтийг
   * хүчингүй болгох ёстой.
   */
  const pickSeq = useRef(0);

  /** Аюулын даралт — харуул / өртсөн объект / муж */
  const onMapPick = useCallback(async (p: Pick) => {
    const seq = ++pickSeq.current;
    /* ⚠️ 2026-09-30: өмнөх үерийн нүдний УСНЫ ЗАМ зөвхөн шинэ үерийн нүдэнд солигдоно —
       бусад даралтад (харуул, муж, объект, хоосон) урьд нь зурагт ҮЛДДЭГ байв */
    if (!p || p.kind !== 'flood') setPath(null);
    if (!p) { setHazInfo(null); return; }

    if (p.kind === 'station') {
      // Зурган дээрх цэгийг дарахад ЗҮҮН жагсаалтын сонголт ч дагана
      setSel(p.oid);
      const st = liveRef.current.find((x) => x.oid === p.oid);
      setHazInfo(st ? {
        title: st.name,
        sub: KIND_LABEL[st.kind],
        rows: st.metrics.slice(0, 6).map((m) => ({
          k: m.label,
          v: `${num(m.latest, m.dp)} ${m.unit}`.trim(),
          tone: GRADE_COLOR[gradeOf(m)],
        })),
      } : null);
      return;
    }

    if (p.kind === 'flood') {
      const fd = floodRef.current;
      if (!fd) { setHazInfo(null); return; }
      const s = sliceRef.current;
      const d = fd.depth(s, p.idx);
      const uu = fd.u(s, p.idx);
      const vv = fd.v(s, p.idx);
      const sp = Math.hypot(uu, vv);
      if (d < fd.meta.wetM) {
        setPath(null);
        /* ⚠️ 2026-09-30: `Overlay` энэ нүдийг БҮХ хугацааны дээд гүнээр (≥ `wetM`) сонгосон —
           одоогийн агшинд хуурай ч ус ИРЭХ/ИРСЭН нүдэнд «ус ирээгүй» гэх нь ХУДАЛ байв */
        /* ⚠️ 2026-10-09: «Энэ цэгт ус ирээгүй» салаа ХАСАГДАВ — `Overlay` нь зөвхөн
           дээд гүн ≥ `wetM` нүдийг (эсвэл `maxDepth`-гүй бол ОДООГИЙН гүнээр) сонгодог
           тул энд ирэх нүд ҮРГЭЛЖ «өөр агшинд ус байсан» (`later` үргэлж үнэн байв). */
        const mx = fd.maxDepth ? fd.maxDepth(p.idx) : null;
        const arr = fd.arrivalMin ? fd.arrivalMin(p.idx) : null;
        setHazInfo({
          title: tr('Одоогоор ус алга'),
          sub: tr('{0}-р минут', num(fd.minuteAt(s), 1)),
          rows: [
            ...(mx != null ? [{ k: tr('Дээд гүн (бүх хугацаа)'), v: tr('{0} м', num(mx, 2)) }] : []),
            ...(arr != null ? [{ k: tr('Ус ирэх хугацаа'), v: tr('{0} мин', num(arr, 1)) }] : []),
          ],
        });
        return;
      }
      const risk = depthRisk(d);
      const why = whyFlood(fd, s, p.idx);
      /* ⚠️ УСНЫ ЗАМ — дээш (хаанаас ирсэн) ба доош (хаашаа явна).
         Зурган дээр зурагдана: «энэ гудамжаар уулаас ирсэн ус» гэдэг нь
         нэг харахад ойлгогдоно. */
      setPath({ up: flowPath(fd, s, p.idx, true), down: flowPath(fd, s, p.idx, false) });
      setHazInfo({
        title: tr('Үерийн нүд'),
        sub: tr('{0}-р минут · {1} × {1} м', num(fd.minuteAt(s), 1), num(fd.meta.cellM, 1)),
        tone: 'var(--data)',
        rows: [
          { k: tr('Усны гүн'), v: tr('{0} м', num(d, 2)), tone: risk.color },
          { k: tr('Эрсдэл'), v: risk.label, tone: risk.color },
          { k: tr('Урсгалын хурд'), v: tr('{0} м/с', num(sp, 2)) },
          { k: tr('Урсгалын чиглэл'), v: `${flowDir(uu, vv)} · ${num(flowDeg(uu, vv), 0)}°` },
          /**
           * ⚠️ АЮУЛЫН ЗЭРЭГЛЭЛ — гүн ганцаараа хангалтгүй: 0.4 м гүн, 2 м/с
           * урсгал нь хүнийг унагадаг ч «гүн бага» гэж уншигдана.
           * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): DEFRA FD2321-ийн
           *    HR = d·(v+0.5)+DF (`uyr.hazardRating`) — урьд нь `d × v` (м²/с)
           *    байсан тул зогсонги гүн ус «Бага» гардаг байв.
           */
          (() => {
            const hr = hazardRating(d, sp);
            const hc = HAZARD_CLASS(hr);
            return { k: tr('Аюулын зэрэглэл'), v: `${hc.label} · ${tr('HR {0}', num(hr, 2))}`, tone: hc.color };
          })(),
          /* ⚠️ Хуримтлагдсан утгууд — ЗҮСМЭЛЭЭС хамаарахгүй, БҮХ хугацаанаас */
          ...(fd.maxDepth ? [{
            k: tr('Дээд гүн (бүх хугацаа)'), v: tr('{0} м', num(fd.maxDepth(p.idx), 2)),
          }] : []),
          ...(fd.maxSpeed ? [{
            k: tr('Дээд хурд (бүх хугацаа)'), v: tr('{0} м/с', num(fd.maxSpeed(p.idx), 2)),
          }] : []),
          ...(fd.arrivalMin && fd.arrivalMin(p.idx) != null ? [{
            k: tr('Ус ирэх хугацаа'), v: tr('{0} мин', num(fd.arrivalMin(p.idx)!, 1)),
          }] : []),
          /**
           * ⚠️ ШАЛТГААН — хамгийн доор, гэхдээ хамгийн чухал мөр.
           * «Энд 1.4 м ус байна» гэдэг нь хариулт БИШ; «яагаад яг энд вэ»
           * гэдэгт рельеф, налуу хоёр хариулна (`uyrTailbar.ts`).
           */
          ...(why ? [
            { k: tr('Рельеф'), v: why.channel
              ? tr('голын суваг')
              : why.reliefM > 0
                ? tr('орчноосоо {0} м нам', num(why.reliefM, 1))
                : tr('орчноосоо {0} м өндөр', num(-why.reliefM, 1)) },
            { k: tr('Налуу'), v: tr('{0}%', num(why.slopePct, 1)) },
            /* ⚠️ 2026-10-01: маскгүй хуримтлал, өндрийн торны хүрээнд — «тооцооны мужид» */
            ...(why.accHa != null && why.accHa >= 0.5
              ? [{ k: tr('Хураах талбай (тооцооны мужид)'), v: tr('≥ {0} га', num(why.accHa, why.accHa >= 10 ? 0 : 1)) }]
              : []),
          ] : []),
        ],
        note: why?.reason,
        /* Тухайн нүдний 12 алхмын түүх — бяцхан график */
        spark: fd.series(p.idx),
        sparkAt: s,
      });
      return;
    }

    if (p.kind === 'band') {
      /**
       * ⚠️ «Энэ цэгт» — дарсан нүдний ӨӨРИЙН дээд гүн (2026-09-21). Муж руу
       * даралт ирдэг нь нүдний гүн `wetM`-ээс бага үед л (`Overlay` §босго)
       * тул ихэвчлэн 0–4 см; байхгүй бол мөр гарахгүй (`null` ≠ 0).
       */
      const fdB = floodRef.current;
      const isFloodB = (resultRef.current?.hazard ?? hazardRef.current) === 'flood';
      /* ⚠️ 2026-10-09 (аудит): тооцооны МУЖААС ГАДНА (`FloodData.inDomain` = false) нүдний `maxDepth` нь
         0 (бодогдоогүй) — урьд нь «0 м» гэж «ус хүрээгүй» мэт харагддаг байв. Одоо «тооцоогүй» (null ≠ 0;
         `uyrTailbar`-ийн `computed`-тэй ижил дүрэм). */
      const outB = isFloodB && p.idx != null && fdB?.inDomain?.(p.idx) === false;
      const own = isFloodB && !outB && fdB?.maxDepth && p.idx != null ? fdB.maxDepth(p.idx) : null;
      setHazInfo({
        title: p.band.label,
        sub: tr('Аюулын муж'),
        rows: [
          bandRow(p.band),
          ...(outB
            ? [{ k: tr('Энэ цэгт (дээд гүн)'), v: tr('тооцоогүй') }]
            : own != null
              ? [{ k: tr('Энэ цэгт (дээд гүн)'), v: tr('{0} м', num(own, 2)) }]
              : []),
          { k: tr('3D өндөр'), v: tr('{0} м', num(p.band.height, 1)) },
        ],
      });
      return;
    }

    /* Өртсөн объект — эх давхаргаас БҮТЭН атрибутыг татна */
    const def = LAYER_BY_ID[p.layerId];
    /**
     * ⚠️ ҮЕРТ мужийн утгыг ЭХЛЭЭД БИЧИХГҮЙ (2026-09-21). `p.band.value` нь
     * `meta.peakDepthM` — БҮХ талбайн дээд гүн — тул объект бүрд ижил «2.3 м»
     * гарч байв. Объектын ӨӨРИЙН гүнийг геометр татсаны дараа `footprintDepth`
     * -ээр бодно; агаарт (PM2.5) мужийн утга хэвээр.
     */
    const fdNow = floodRef.current;
    const isFlood = (resultRef.current?.hazard ?? hazardRef.current) === 'flood';
    const head: Info = {
      title: def?.title ?? p.layerId,
      sub: tr('Өртсөн объект'),
      tone: 'var(--bad)',
      rows: p.band && !isFlood ? [bandRow(p.band)] : [],
    };
    setHazInfo(head);
    const fl = viewRef.current?.map?.findLayerById(p.layerId) as __esri.FeatureLayer | undefined;
    if (!fl || p.oid == null || typeof fl.queryFeatures !== 'function') return;
    try {
      /* ⚠️ Геометрийг ҮЕРТ л татна (WM-д) — footprint-ийн гүнд хэрэгтэй */
      const wantGeom = isFlood && !!fdNow?.maxDepth;
      const res = await fl.queryFeatures({
        objectIds: [p.oid], outFields: ['*'], returnGeometry: wantGeom,
        ...(wantGeom && fdNow ? { outSpatialReference: { wkid: fdNow.meta.wkid } } : {}),
      } as unknown as __esri.Query);
      /* ⚠️ Хоцорсон хариу — энэ хооронд өөр объект дарагдсан бол ХАЯНА */
      if (seq !== pickSeq.current) return;
      const f = res.features[0];
      const a = f?.attributes as Record<string, unknown> | undefined;
      const depthRows: Info['rows'] = [];
      if (isFlood) {
        const fpx = wantGeom && fdNow ? footprintDepthEx(fdNow, f?.geometry) : null;
        const own = fpx?.depth ?? null;
        if (fpx && !fpx.computed && f?.geometry) {
          /* ⚠️ 2026-10-09: объект бүхэлдээ тооцооны мужаас гадна — «хуурай» БИШ, «тооцоогүй» */
          depthRows.push({ k: tr('Усны гүн (объект дээр, дээд)'), v: tr('тооцоогүй — загварчлалын мужаас гадна') });
        } else if (own != null) {
          const risk = depthRisk(own);
          depthRows.push({ k: tr('Усны гүн (объект дээр, дээд)'), v: tr('{0} м', num(own, 2)), tone: risk.color });
        } else if (p.band) {
          /* Footprint-д нойтон нүд олдсонгүй (мужийн хилээр л хүрсэн) — мужийн
             дээд гүнийг ТИЙМ гэж ИЛ шошготой өгнө */
          depthRows.push({ k: tr('Мужийн дээд гүн'), v: tr('{0} м', num(p.band.value, 2)) });
        }
      }
      if (a || depthRows.length) {
        setHazInfo({ ...head, rows: [...head.rows, ...depthRows, ...(a ? attrRows(a) : [])] });
      }
    } catch {
      // Атрибут татагдаагүй ч мужийн мэдээлэл нь дэлгэцэд үлдэнэ
    }
  }, [bandRow]);

  /**
   * Каталогийн давхаргын объектын даралт (`MapCanvas`).
   * ⚠️ Дамжуулах функц нь ТОГТВОРТОЙ байх ЁСТОЙ — `MapCanvas` нь memo() тул
   * render бүрд шинэ функц өгвөл 3000 мөрт компонент дэмий дахин зурагдана.
   */
  const featCb = useRef<(a: Record<string, unknown> | null, id: string | null) => void>(() => {});
  useSyncRef(featCb, (attrs, layerId) => {
    if (!attrs || !layerId) { setFeatInfo(null); return; }
    setFeatInfo({
      title: LAYER_BY_ID[layerId]?.title ?? layerId,
      sub: tr('Давхаргын объект'),
      rows: attrRows(attrs),
    });
  });
  const onFeaturePick = useCallback(
    (a: Record<string, unknown> | null, id: string | null) => featCb.current(a, id),
    [],
  );

  /**
   * ⚠️ Горим/аюул/түвшин солиход хуучин үр дүнг АРИЛГАНА. Эс бөгөөс «2-р
   * түвшин» дараад зурагт 1-р түвшний улаан үлдэж, хэрэглэгч шинэ хариу
   * харлаа гэж эндүүрнэ.
   */
  /* ⚠️ 2026-09-25: ЗАГВАРЧЛАХ ТАЛБАЙ (`area`) солигдоход ч — урьд нь шинэ
     полигон зурсны дараа хуучин талбайн хохирол/муж хэвээр үлдэж, шинэ
     талбайн үр дүн мэт уншигдаж байв. */
  const prev = useRef({ hazard, level, mode, area });
  useEffect(() => {
    const p = prev.current;
    if (p.hazard !== hazard || p.level !== level || p.mode !== mode || p.area !== area) {
      prev.current = { hazard, level, mode, area };
      /* ⚠️ Явж буй шинжилгээг хүчингүй болгоно (2026-09-21, §runSeq) —
         хуучин түвшний хариу шинэ түвшний нэрээр гарахгүй */
      runSeq.current++;
      setBusy(false);
      setResult(null);
      setRunErr(null);
      setHazInfo(null);
      setFeatInfo(null);
      /* ⚠️ Усны зам ХУУЧИН загварчлалын нүднийх — таб/түвшин солиход
         арилна (2026-09-21) */
      setPath(null);
    }
  }, [hazard, level, mode, area]);

  /* ── Хохирлын нэгтгэл ── */
  const sum = useMemo(() => {
    const rows = result?.rows ?? [];
    return {
      n: rows.reduce((s, r) => s + r.n, 0),
      area: rows.reduce((s, r) => s + r.area, 0),
      length: rows.reduce((s, r) => s + r.length, 0),
      /* ⚠️ 2026-10-01: ТОДОРХОЙГҮЙ өртөг (`null`) нийтэд ОРОХГҮЙ — тоо нь тусад нь */
      cost: rows.reduce((s, r) => s + (r.cost ?? 0), 0),
      unknownCost: rows.filter((r) => r.cost == null).length,
      /**
       * Өртөх оршин суугч — ⚠️ мөр бүрийн `people` нь ЗӨВХӨН барилгын ангиллаас
       * бодогддог (`ersdelGeom.ts`). Урьд нь энд БҮХ талбайн давхаргаас
       * (явган зам, ногоон…) тооцдог байсан нь хүний тоог хэдэн дахин
       * хөөрөгдөж байв.
       */
      people: rows.reduce((s, r) => s + r.people, 0),
    };
  }, [result]);

  /**
   * ДАВХАРГЫН ХҮСНЭГТИЙН ЭРЭМБЭ — баганын толгой дарж солино (2026-10-01).
   * ⚠️ `null` (тодорхойгүй өртөг, мэдэгдэхгүй гүн) нь чиглэлээс ҮЛ ХАМААРАН
   *    ҮРГЭЛЖ доор — «0» гэж эрэмбэлбэл тодорхойгүй мөр «хамгийн бага» мэт харагдана.
   */
  const [sortBy, setSortBy] = useState<{ k: 'cost' | 'n' | 'depth'; desc: boolean }>({ k: 'cost', desc: true });
  const sortedRows = useMemo(() => {
    const rows = [...(result?.rows ?? [])];
    const val = (r: DamageRow): number | null =>
      (sortBy.k === 'cost' ? r.cost : sortBy.k === 'depth' ? r.maxDepth : r.n);
    return rows.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
      return sortBy.desc ? vb - va : va - vb;
    });
  }, [result, sortBy]);
  const toggleSort = (k: 'cost' | 'n' | 'depth') =>
    setSortBy((s) => (s.k === k ? { k, desc: !s.desc } : { k, desc: true }));

  /**
   * ОБЪЕКТ ТУС БҮРИЙН ХҮСНЭГТ — гүнээр (анхдагч) эсвэл үнэлгээгээр (2026-10-01).
   * ⚠️ Дэлгэцэнд эхний `OBJ_SHOW` мөр; бүгд CSV/GeoJSON-д.
   */
  const OBJ_SHOW = 60;
  const [objSort, setObjSort] = useState<{ k: 'depth' | 'cost'; desc: boolean }>({ k: 'depth', desc: true });
  const objects = useMemo(() => {
    const out = (result?.rows ?? []).flatMap((r) => r.objects.map((o, i) => ({
      key: `${r.layerId}:${o.oid ?? `i${i}`}`, title: r.title, geom: r.geom, ...o,
    })));
    return out.sort((a, b) => {
      const va = objSort.k === 'depth' ? a.depth : a.cost;
      const vb = objSort.k === 'depth' ? b.depth : b.cost;
      if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
      return objSort.desc ? vb - va : va - vb;
    });
  }, [result, objSort]);
  const toggleObjSort = (k: 'depth' | 'cost') =>
    setObjSort((s) => (s.k === k ? { k, desc: !s.desc } : { k, desc: true }));

  /** Экспортын мөрүүд — `ersdelExport.ts`-ийн хэлбэрт */
  const exportRows = useCallback((): ExportRow[] => (result?.rows ?? []).map((r) => ({
    layerId: r.layerId,
    title: r.title,
    geom: r.geom,
    clsLabel: DAMAGE_RATE[r.cls].label,
    objects: r.objects.map((o) => ({ ...o, geometry: o.geometry as unknown as GeomLike })),
    /* ⚠️ 2026-10-09: тайрагдсаныг ЭКСПОРТОД дамжуулна — урьд нь хаягдаж дутуу файл бүтэн мэт харагддаг байв */
    truncated: r.truncated,
    /* ⚠️ 2026-10-09 (аудит): тоолох асуулга унасан бол `r.n` = татагдсан тоо (бүтэн биш) → `null` */
    totalN: r.countFailed ? null : r.n,
  })), [result]);
  const exportName = (ext: string) =>
    `ersdel-${result?.hazard ?? 'x'}-${result?.level ?? 0}-${fileDate()}.${ext}`;
  const exportCsv = () => downloadText(exportName('csv'), damageCsv(exportRows()), 'text/csv');
  const exportGeo = () => downloadText(
    exportName('geojson'),
    damageGeoJSON(exportRows(), result?.zoneRings ?? null, {
      hazard: result?.hazard, level: result?.level, sim_footprint: !!result?.simFootprint,
    }),
    'application/geo+json',
  );

  /** Харьцуулалт ОДООГИЙН талбайнх уу (талбай солигдвол хуучирна) */
  const cmpLive = cmp && cmp.key === areaKey(area) ? cmp : null;

  /**
   * ШИНЖИЛГЭЭНИЙ БҮС нь ҮРГЭЛЖ зурагдана (хэрэглэгчийн хүсэлт, 2026-08-27).
   *
   * ⚠️ Түр хугацаанд үерийн үед нуусан байсан — «растер усыг өөрөө харуулж
   * байна» гэсэн үндэслэлээр. Гэвч тэгснээр «түвшин сонгоод Шинжилгээ дарахад»
   * ЯМАР ч муж гарахгүй болж, сонгосон түвшин зурган дээр огт мэдэгдэхгүй байв.
   * Бүс нь шинжилгээний ХИЛ — ямар талбайд ямар объект тоологдсоныг заана.
   *
   * ⚠️ Үерийн үед `Overlay` нь дүүргэлтийг НИМГЭН болгож, хүрээг ТОД болгоно
   * (доорх урсаж буй ус уншигдсан хэвээр) — `bandOnFlood` тугийг үз.
   */
  const bands = result?.bands ?? [];
  const overWater = result?.hazard === 'flood' && !!flood;

  return (
    <div ref={sideHostRef} className={`${e.frame} ${side.hostClass}`} style={side.style}>
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />

      {/* ═══════════ ЗҮҮН: горим ба хувилбар ═══════════ */}
      <div className={e.left}>
        <h3 className={e.colHd}>{tr('IoT-ийн нэгтгэсэн үр дүн')}</h3>

        <section className={e.panel}>
          <div className={e.panelBody}>
            <Tabs
              items={[
                { key: 'now', label: tr('Одоогийн байдал') },
                { key: 'model', label: tr('Таамаглалын загвар') },
              ]}
              value={mode}
              onChange={(k) => setMode(k as 'now' | 'model')}
            />
            {/* ⚠️ Энэ мөр НУУГДАХГҮЙ: заалт нь жишээ өгөгдөл гэдгийг хэрэглэгч
                ямар ч горимд, ямар ч үед харна. */}
            <Note>
              {tr('ҮЕРИЙН тархалт нь ЗАГВАРЧИЛСАН — төслийн 3D mesh-ийн бодит өндөр дээр хөтөч дотор бодогдоно; хэмжсэн үер БИШ. Харуулын байршил, өртсөн объект БОДИТ. Харуулын ЗААЛТ ба АГААРЫН бохирдлын хувилбар нь жишээ өгөгдөл — амьд хэмжилт биш.')}
            </Note>
          </div>
        </section>

        {mode === 'now' ? (
          <>
            {/* ── Голын ус ── */}
            <section className={e.panel} aria-label={KIND_LABEL.water}>
              <header className={e.panelHd}>
                <h3 className={e.panelTitle}>
                  <Icon name="droplet" size={14} /> {tr('Голын ус')}
                </h3>
                {/* ⚠️ 2026-10-04: уншиж/унасан үед «0 харуул» биш — тоо зөвхөн бэлэн үед */}
                {q.state === 'ready' && <span className={e.panelNote}>{tr('{0} харуул', num(water.length))}</span>}
              </header>
              <div className={e.panelBody}>
                {q.state === 'loading' ? <Loading label={tr('Харуул уншиж байна…')} />
                  : q.state === 'error' ? <Empty label={tr('Харуулын давхарга татагдсангүй')} onRetry={q.retry} />
                    : water.length === 0 ? <Empty label={tr('Усны харуул алга')} />
                      : (
                        <>
                          <Stats cols={2}>
                            <Stat
                              value={num(avgOf(water, 'level'), 2)} unit={tr('м')}
                              label={tr('Дундаж түвшин')}
                            />
                            <Stat
                              value={num(avgOf(water, 'flow'), 2)} unit={tr('м³/с')}
                              label={tr('Дундаж урсац')}
                            />
                            <Stat
                              value={num(avgOf(water, 'turb'), 0)} unit="NTU"
                              label={tr('Булингар')}
                            />
                            <Stat
                              value={num(avgOf(water, 'do'), 2)} unit={tr('мг/л')}
                              label={tr('Хүчилтөрөгч')}
                            />
                          </Stats>
                          <div className={e.stList}>
                            {water.map((st) => (
                              <StationRow
                                key={st.oid} st={st} on={current?.oid === st.oid}
                                onPick={() => setSel(st.oid)}
                              />
                            ))}
                          </div>
                        </>
                      )}
              </div>
            </section>

            {/* ── Агаарын чанар ── */}
            <section className={e.panel} aria-label={KIND_LABEL.air}>
              <header className={e.panelHd}>
                <h3 className={e.panelTitle}>
                  <Icon name="flame" size={14} /> {tr('Агаарын чанар')}
                </h3>
                {q.state === 'ready' && <span className={e.panelNote}>{tr('{0} харуул', num(air.length))}</span>}
              </header>
              <div className={e.panelBody}>
                {/* ⚠️ Усны самбартай ИЖИЛ төлөв (2026-09-25 аудит): урьд нь уншиж байх
                    ба алдааны үед ч «Агаарын харуул алга» гэж худал сөрөг хариу өгдөг байв. */}
                {q.state === 'loading' ? <Loading label={tr('Харуул уншиж байна…')} />
                  : q.state === 'error' ? <Empty label={tr('Харуулын давхарга татагдсангүй')} onRetry={q.retry} />
                  : air.length === 0 ? <Empty label={tr('Агаарын харуул алга')} /> : (() => {
                  /* ⚠️ ХАРУУЛ БАЙГААД ЗААЛТГҮЙ байж БОЛНО — `maxOf` тэр үед
                     `null` буцаана. `0` болгон бөглөвөл `AQI_BAND(0)` нь
                     «Сайн» (ногоон) өгч, «мэдээлэл алга» нь «агаар цэвэр»
                     гэж ХУДАЛ уншигдана (2026-09-15-ны аудит). */
                  const aqiRaw = maxOf(air, 'aqi');
                  if (aqiRaw == null) return <Empty label={tr('Агаарын заалт ирээгүй')} />;
                  const aqi = Math.round(aqiRaw);
                  const band = AQI_BAND(aqi);
                  return (
                    <>
                      <div className={e.ringBox}>
                        {/* ⚠️ АЧИ нь 0–500 хуваарьтай тул `Ring`-ийн хувийг
                            500-д харьцуулж бодов — тоо нь ӨӨРӨӨ доор гарна. */}
                        {/* ⚠️ 2026-09-30: `Ring` утгаа ҮРГЭЛЖ «N%» гэж бичдэг тул АЧИ 60 нь «12%»
                            гэж гардаг байв.
                            ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): CSS-ийн `--aqi-text`
                            заль (`::after`) ХАСАГДАВ — `Ring`-ийн шинэ `text` пропоор АЧИ-ийн
                            тоог шууд бичнэ; дэлгэц уншигч ч «АЧИ 60» гэж уншина (урьд нь нуусан). */}
                        <Ring value={Math.min(100, (aqi / 500) * 100)} size={124} width={13}
                          color={band.color} label={tr('АЧИ')} decimals={0} text={num(aqi)} />
                        <p className={e.ringNote}>
                          <b className="num">{num(aqi)}</b> <span>{band.label}</span>
                          <span className={e.ringSub}>
                            {tr('PM2.5 дундаж {0} µg/м³', num(avgOf(air, 'pm25'), 1))}
                          </span>
                        </p>
                      </div>
                      {/**
                        * ⚠️ САЛХИ нь ЖИНХЭНЭ өгөгдөл (Open-Meteo), харин дээрх
                        * АЧИ/PM2.5 нь ЖИШЭЭ (харуулын давхаргад утгын талбар
                        * байхгүй). Хоёрыг зэрэгцүүлэн үзүүлэх тул аль нь
                        * жинхэнэ болохыг ЗААВАЛ тэмдэглэнэ — эс бөгөөс
                        * хэрэглэгч бүхэл самбарыг жишээ (эсвэл бүгдийг
                        * жинхэнэ) гэж эндүүрнэ.
                        */}
                      <div className={e.wind}>
                        <div className={e.windHd}>
                          <Icon name="radio" size={13} />
                          <b>{tr('Салхи')}</b>
                          <span className={e.windSrc}>
                            {tr('Open-Meteo · жинхэнэ заалт')}
                          </span>
                        </div>
                        {windQ.state === 'loading' ? (
                          <Loading label={tr('Салхи татаж байна…')} />
                        ) : windQ.state === 'error' ? (
                          <Empty label={tr('Салхины заалт татагдсангүй.')} onRetry={windQ.retry} />
                        ) : !windNow ? (
                          /* ⚠️ Алдаа БИШ — хүсэлт амжилттай ч заалт хоосон.
                             Retry санал болговол «алдаа гарлаа» гэж уншигдана. */
                          <Note>{tr('Салхины заалт алга.')}</Note>
                        ) : (() => {
                          const d = dispersionOf(windNow.speed);
                          return (
                            <>
                              <div className={e.windNow}>
                                {/* Сум нь салхи ХААШАА үлээхийг заана: чиглэл нь
                                    «хаанаас» тул 180° эргүүлнэ. */}
                                <span
                                  className={e.windArrow}
                                  style={{ transform: `rotate(${windNow.dirDeg + 180}deg)` }}
                                  aria-hidden
                                >
                                  ↑
                                </span>
                                <span className={`${e.windVal} num`}>
                                  {num(windNow.speed, 1)}<i>{tr('м/с')}</i>
                                </span>
                                <span className={e.windDir}>
                                  {tr('{0}-аас', dirName(windNow.dirDeg))}
                                </span>
                              </div>
                              <p className={e.windNote} style={{ color: d.tone }}>{d.label}</p>
                              {/* 24 цагийн явц — өнөөдрийн урьдчилсан мэдээ */}
                              <Trend
                                unit={tr('м/с')}
                                height={72}
                                /* ⚠️ `getHours()` нь ХӨТЧИЙН бүсээр — UB-аас өөр бүсэд
                                   24 цагийн шошго шилжинэ; `hhmmUB` (§flowHour-той
                                   ижил) (2026-09-21). */
                                points={wind!.hours.map((h) => ({
                                  label: hhmmUB(h.t),
                                  value: h.speed,
                                }))}
                              />
                              {wind!.cached ? (
                                <p className={e.windSrc}>
                                  {tr('Кэшнээс — сүлжээ татагдсангүй')}
                                </p>
                              ) : null}
                            </>
                          );
                        })()}
                      </div>

                      <div className={e.stList}>
                        {air.map((st) => (
                          <StationRow
                            key={st.oid} st={st} on={current?.oid === st.oid}
                            onPick={() => setSel(st.oid)}
                          />
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </section>
          </>
        ) : (
          <>
            {/* ── Аюулын төрөл ── */}
            <section className={e.panel} aria-label={tr('Аюулын төрөл')}>
              <header className={e.panelHd}>
                <h3 className={e.panelTitle}>{tr('1 · Аюулын төрөл')}</h3>
              </header>
              <div className={e.panelBody}>
                <div className={e.pickGrid}>
                  {HAZARDS.map((h) => (
                    <button
                      key={h.key}
                      type="button"
                      className={`${e.pick} ${hazard === h.key ? e.pickOn : ''}`}
                      onClick={() => setHazard(h.key)}
                      aria-pressed={hazard === h.key}
                      title={h.desc}
                    >
                      <Icon name={h.icon} size={18} />
                      <span className={e.pickTitle}>{h.title}</span>
                      <span className={e.pickDesc}>{h.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Түвшин ── */}
            <section className={e.panel} aria-label={tr('Аюулын түвшин')}>
              <header className={e.panelHd}>
                <h3 className={e.panelTitle}>{tr('2 · Аюулын түвшин')}</h3>
                {/* ⚠️ Дарааллыг ИЛ хэлнэ — хэрэглэгч таамаглахгүй байх ёстой.

                    ⚠️ 2026-09-01 ЗАСВАР: энэ мөр «1 = хамгийн хүнд» гэж ЭСРЭГ
                    утгыг хэлж байв. 2026-08-29-нд түвшний утгыг эргүүлж
                    (`ersdel.ts` §2 — 1 нь хамгийн ХӨНГӨН, 3 нь ХАМГИЙН ХҮНД)
                    `FLOOD_LEVELS`/`AIR_LEVELS`/`SEVERITY` гурвууланг сольсон ч
                    ЭНЭ заавар хуучнаараа үлдсэн. Улмаар хэрэглэгч 1-р түвшинг
                    «хамгийн хүнд» гэж уншиж, үнэндээ 5 жилийн давтамжтай ХАМГИЙН
                    ХӨНГӨН хувилбараар тооцоо хийлгэдэг байв — хохирлын дүн ~4
                    дахин дутуу гарч, онцгой байдлын төлөвлөлт буруу хувилбар
                    дээр хийгдэнэ. `LEVELS`-ийн нэр өөрөө («3-р түвшин — Онц
                    аюултай») зөв дарааллыг баталдаг. */}
                <span className={e.panelNote}>{tr('1 = хамгийн хөнгөн · 3 = хамгийн хүнд')}</span>
              </header>
              <div className={e.panelBody}>
                <div className={e.lvGrid}>
                  {LEVELS.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      className={`${e.lv} ${level === l.key ? e.lvOn : ''}`}
                      style={{ ['--tone' as string]: l.color }}
                      onClick={() => setLevel(l.key)}
                      aria-pressed={level === l.key}
                    >
                      <span className={`${e.lvNo} num`}>{l.key}</span>
                      <span className={e.lvText}>{l.title}</span>
                    </button>
                  ))}
                </div>

                {/* ── ЗАГВАРЧЛАХ ТАЛБАЙ (зөвхөн үерт) ──
                    ⚠️ Түвшний ДООР байрлав: хэрэглэгч эхлээд «хэр хүчтэй»,
                    дараа нь «хаана» гэдгийг шийднэ. Дээр нь тавибал зурах нь
                    заавал хийх алхам мэт уншигдана — үнэндээ СОНГОЛТ. */}
                {hazard === 'flood' && (
                  <div className={e.flowBar}>
                    <button
                      type="button"
                      className={`${e.flowBtn} ${drawing ? e.flowOn : ''}`}
                      aria-pressed={drawing}
                      onClick={drawArea}
                      title={tr('Газрын зураг дээр талбай зурна. Загварчлал зөвхөн тэр талбайд бодогдоно.')}
                    >
                      {drawing ? tr('Зурж байна… (давхар товшиж дуусгана)') : tr('Талбай зурах')}
                    </button>
                    {area && (
                      <button type="button" className={e.flowBtn} onClick={clearArea}>
                        {tr('Талбайг арилгах')}
                      </button>
                    )}
                    <span className={e.flowHour}>
                      {area
                        ? tr('Зурсан талбай — {0} га', num(areaHa ?? 0, 0))
                        : flood?.meta.domainHa
                          ? tr('Бүх талбай — {0} га', num(flood.meta.rainHa ?? flood.meta.domainHa, 0))
                          : tr('Бүх талбай')}
                    </span>
                  </div>
                )}

                {/* Сонгосон хувилбарын БОДИТ параметр — таамгийг ил гаргана */}
                <p className={e.scenario}>{scenarioNote(hazard, level)}</p>
                {hazard === 'flood' ? (
                  /**
                   * ⚠️ Эдгээр нь ХУВИЛБАРЫН ЛАВЛАГАА (`FLOOD_LEVELS`) — зурган
                   * дээр урсаж буй загварчлалын ОРОЛТ БИШ.
                   *
                   * ⚠️ `peak` (26/52/96 м³/с) нь ЯЛАНГУЯА ЭНДҮҮРМЭЭР: түүнийг
                   * «Оргил урсац» гэж ганцаар бичихэд, доор нь 97/195/389 м³/с-
                   * ээр бодогдсон үер урсаж байхад хэрэглэгч хоёрыг НЭГ гэж
                   * уншина. `ersdel.ts:573` нь энэ талбарыг «`rain`-аас
                   * БОДОГДООГҮЙ … УНШИЖ БОЛОХГҮЙ» гэж ил тэмдэглэсэн бөгөөд тэр
                   * гурван тоо нь үнэндээ ХАРУУЛЫН сэрэмжлүүлэх босго
                   * (`uyrSim.ts:285`). Тиймээс шошгыг «Лавлагааны урсац» болгож,
                   * загварын ЖИНХЭНЭ оролтыг (`flood.meta.peakQ`) тусад нь
                   * үзүүлнэ — хоёр тоог хольж болохгүй.
                   */
                  <Stats cols={3}>
                    <Stat value={num(FLOOD_LEVELS[level].rain)} unit={tr('мм/ц')} label={tr('Хур тунадас')} accent />
                    <Stat value={num(FLOOD_LEVELS[level].period)} unit={tr('жил')} label={tr('Давтагдал')} />
                    <Stat value={num(FLOOD_LEVELS[level].peak)} unit={tr('м³/с')} label={tr('Лавлагааны урсац')} />
                    <Stat value={num(FLOOD_LEVELS[level].depth, 1)} unit={tr('м')} label={tr('Дундаж гүн')} />
                    <Stat value={num(FLOOD_LEVELS[level].reach)} unit={tr('м')} label={tr('Үерийн зурвас')} />
                    <Stat value={num(FLOOD_LEVELS[level].lead)} unit={tr('цаг')} label={tr('Сэрэмжлүүлэх')} />
                  </Stats>
                ) : null}
                {hazard === 'flood' ? (
                  /* ⚠️ ЗАГВАРЫН ЖИНХЭНЭ ОРОЛТ — дээрх лавлагаанаас ТУСДАА мөр.
                     Загвар ажилласан үед `meta.peakQ` нь рационал аргаар
                     бодогдсон оргил урсац (`uyrSim.peakInflow`); дээрх
                     лавлагаанаас ~4 дахин их байдаг тул зөрүүг ИЛ бичнэ. */
                  <Note>
                    {flood?.meta.peakQ != null
                      ? tr('Зураг дээрх үерийг {0} м³/с оргил урсацаар бодов ({1} мм/ц хур, рационал арга). Дээрх «лавлагааны урсац» нь харуулын сэрэмжлүүлэх босго — загварын оролт БИШ.',
                        num(flood.meta.peakQ, 1), num(flood.meta.rainMmH ?? FLOOD_LEVELS[level].rain))
                      : tr('Дээрх «лавлагааны урсац» нь харуулын сэрэмжлүүлэх босго — үерийн загварын оролт БИШ. Загвар нь хур тунадаснаас оргил урсацаа өөрөө бодно.')}
                  </Note>
                ) : (
                  <>
                    <Stats cols={3}>
                      <Stat value={num(AIR_LEVELS[level].pm25)} unit={tr('µg/м³')} label="PM2.5" />
                      <Stat value={num(AIR_LEVELS[level].aqi)} unit="" label={tr('АЧИ')} />
                      <Stat value={num(AIR_LEVELS[level].inversion)} unit={tr('м')} label={tr('Инверси')} />
                      <Stat value={num(AIR_LEVELS[level].wind, 1)} unit={tr('м/с')} label={tr('Хувилбарын салхи')} />
                      <Stat value={num(AIR_LEVELS[level].plume)} unit={tr('м')} label={tr('Сэвсгэрийн суурь урт')} />
                      <Stat value={num(AIR_LEVELS[level].hours)} unit={tr('цаг')} label={tr('Үргэлжлэх')} />
                    </Stats>
                    {/**
                      * БОДИТ САЛХИ — зурган дээрх сэвсгэрийг ЭНЭ чиглүүлнэ.
                      *
                      * ⚠️ Дээрх хувилбарын тоонууд нь ЗАГВАРЫН таамаг (PM2.5,
                      * инверси, суурь урт) бөгөөд ХЭВЭЭР үлдэнэ. Салхи нь
                      * ганцаараа ЖИНХЭНЭ хэмжилт тул тусад нь, эх сурвалжтай
                      * нь хамт бичнэ — эс бөгөөс хэрэглэгч бүх зургаан тоог
                      * жинхэнэ (эсвэл бүгдийг таамаг) гэж уншина.
                      */}
                    <div className={e.wind}>
                      <div className={e.windHd}>
                        <Icon name="radio" size={13} />
                        <b>{tr('Бодит салхи')}</b>
                        <span className={e.windSrc}>{tr('Open-Meteo · жинхэнэ заалт')}</span>
                      </div>
                      {windQ.state === 'loading' ? (
                        <Loading label={tr('Салхи татаж байна…')} />
                      ) : !windNow ? (
                        <Note>
                          {tr('Салхи татагдсангүй — сэвсгэр хувилбарын {0}° чиглэлээр зурагдана.', num(AIR_LEVELS[level].windDir))}
                        </Note>
                      ) : (
                        <>
                          <div className={e.windNow}>
                            {/* Сум нь салхи ХААШАА үлээхийг заана — сэвсгэр ч
                                мөн тийш сунана. */}
                            <span
                              className={e.windArrow}
                              style={{ transform: `rotate(${windNow.dirDeg + 180}deg)` }}
                              aria-hidden
                            >
                              ↑
                            </span>
                            <span className={`${e.windVal} num`}>
                              {num(windNow.speed, 1)}<i>{tr('м/с')}</i>
                            </span>
                            <span className={e.windDir}>
                              {tr('{0}-аас', dirName(windNow.dirDeg))}
                            </span>
                          </div>
                          <p className={e.windNote} style={{ color: dispersionOf(windNow.speed).tone }}>
                            {dispersionOf(windNow.speed).label}
                          </p>
                          <Note>
                            {tr('Бохирдол {0} зүг рүү сунана. Хувилбарын {1} м/с-тэй харьцуулахад сэвсгэрийн урт {2} дахин.',
                              dirName((windNow.dirDeg + 180) % 360),
                              num(AIR_LEVELS[level].wind, 1),
                              num(Math.max(0.4, Math.min(2.5, windNow.speed / AIR_LEVELS[level].wind)), 1))}
                          </Note>
                        </>
                      )}
                      {/**
                        * УРСГАЛЫН УДИРДЛАГА — ГАНЦ товч.
                        *
                        * ⚠️ Хугацааны шугам ХАСАГДСАН (дээрх `windDate`-ийн
                        * тайлбарыг үз): энэ самбар нь ОДООГИЙН байдлыг л
                        * хариулна. Зум ойртуулах тусам растер нь харагдаж буй
                        * мужид ногдож, зураас олон бөгөөд тод болно.
                        */}
                      <div className={e.flowBar}>
                        <button
                          type="button"
                          className={`${e.flowBtn} ${windFlow ? e.flowOn : ''}`}
                          aria-pressed={windFlow}
                          onClick={() => setWindFlow((v) => !v)}
                          title={tr('Одоогийн салхины урсгалыг зураг дээр харуулна. Зум ойртуулахад нарийсна.')}
                        >
                          {windFlow ? tr('Урсгал асаалттай') : tr('Урсгал харуулах')}
                        </button>
                        {windFlow && windField?.times[windH] != null && (
                          <span className={`${e.flowHour} num`}>
                            {/* ⚠️ `getHours()` нь ХӨТЧИЙН бүсээр хөрвүүлнэ — цуваа UB-ынх
                                тул шошго ч UB-аар (`salhiTor` §TZ). */}
                            {tr('{0} цагийн заалт', hhmmUB(windField.times[windH]))}
                          </span>
                        )}
                      </div>
                      {windFlow && fieldQ.state === 'loading' && (
                        <Loading label={tr('Салхины тор татаж байна…')} />
                      )}
                      {windFlow && fieldQ.state === 'error' && (
                        <Note>
                          <span style={{ color: 'var(--bad-ink)' }}>
                            {tr('Салхины тор татагдсангүй.')}
                          </span>
                        </Note>
                      )}
                      {windFlow && windField?.cached && (
                        <p className={e.windSrc}>{tr('Кэшнээс — сүлжээ татагдсангүй')}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* ── ЦАГ ХУГАЦАА — зөвхөн үерийн загварчлалд ──
                ⚠️ ArcGIS Flood Simulation нь усны тархалтын ЯВЦ гаргадаг тул
                зөвхөн нэг агшин харуулах нь загварчлалын гол утгыг алдагдуулна. */}
            {hazard === 'flood' && (
              <section className={e.panel} aria-label={tr('Цаг хугацаа')}>
                <header className={e.panelHd}>
                  <h3 className={e.panelTitle}>
                    <Icon name="waves" size={14} /> {tr('Усны тархалт')}
                  </h3>
                  {/* ⚠️ ШИНЖИЛГЭЭНИЙ ТАЛБАЙ нь 3D mesh-ийн БОДИТ хүрээ — торны
                      квадрат БИШ. Хэрэглэгч «хаана хүртэл бодогдов» гэдгийг
                      мэдэхгүй бол үр дүнг хэт өргөнөөр ойлгоно. */}
                  <span className={e.panelNote}>
                    {flood
                      ? flood.meta.domainHa
                        ? tr('{0} алхам · {1} га', num(flood.meta.slices), num(flood.meta.rainHa ?? flood.meta.domainHa, 0))
                        : tr('{0} алхам', num(flood.meta.slices))
                      : '…'}
                  </span>
                </header>
                <div className={e.panelBody}>
                  {floodErr ? (
                    <Note><span style={{ color: 'var(--bad-ink)' }}>{floodErr}</span></Note>
                  ) : !flood ? (
                    /* ⚠️ 2026-10-01: үлдсэн хугацааны таамаг (`simEta`) */
                    <Loading label={simEta != null
                      ? tr('Үерийг бодож байна… {0}% · ~{1} с үлдлээ', num(simPct * 100, 0), num(Math.ceil(simEta), 0))
                      : tr('Үерийг бодож байна… {0}%', num(simPct * 100, 0))} />
                  ) : (
                    <>
                      <div className={e.timeRow}>
                        <button
                          type="button"
                          className={e.playBtn}
                          onClick={() => setPlaying((v) => !v)}
                          aria-pressed={playing}
                          aria-label={playing ? tr('Зогсоох') : tr('Тоглуулах')}
                        >
                          {playing ? '❚❚' : '▶'}
                        </button>
                        <input
                          type="range"
                          className={e.timeRange}
                          min={0}
                          max={flood.meta.slices - 1}
                          step={1}
                          value={slice}
                          onChange={(ev) => { setPlaying(false); setSlice(Number(ev.target.value)); }}
                          aria-label={tr('Хугацааны алхам')}
                        />
                        <span className={`${e.timeVal} num`}>
                          {tr('{0} мин', num(flood.minuteAt(slice), 1))}
                        </span>
                      </div>
                      {/* Тухайн агшны БОДИТ үзүүлэлт — эх 4096 тороос бодогдсон */}
                      <Stats cols={3}>
                        <Stat value={num(flood.meta.stats[slice].wetHa, 1)} unit={tr('га')}
                          label={tr('Усанд автсан')} accent />
                        <Stat value={num(flood.meta.stats[slice].peakM, 2)} unit={tr('м')}
                          label={tr('Дээд гүн')} />
                        <Stat value={num(flood.meta.stats[slice].maxSpeed, 1)} unit={tr('м/с')}
                          label={tr('Дээд хурд')} />
                      </Stats>

                      {/* ── ЗУРГИЙГ ЮУГААР БУДАХ ВЭ ──
                          ⚠️ Гурван ӨӨР асуулт: «хэр гүн» · «хэр хүчтэй» ·
                          «хүнд аюултай юу». 2 м гүн ЗОГСОНГИ ус ба 0.4 м гүн
                          ХУРДАН урсгал хоёр өөр аюул тул нэг зураг хангахгүй. */}
                      <div className={e.flowBar}>
                        {/* ⚠️ 2026-10-01: «Ирэх хугацаа» — ус ХЭЗЭЭ хүрэх вэ (`arrivalS`) */}
                        {([
                          ['depth', tr('Гүн')],
                          ['speed', tr('Хурд')],
                          ['hazard', tr('Аюул')],
                          ...(flood.arrivalMin ? [['arrival', tr('Ирэх хугацаа')]] : []),
                        ] as [FloodMode, string][]).map(([k, lb]) => (
                          <button
                            key={k}
                            type="button"
                            className={`${e.flowBtn} ${fmode === k ? e.flowOn : ''}`}
                            aria-pressed={fmode === k}
                            onClick={() => setFmode(k)}
                          >
                            {lb}
                          </button>
                        ))}
                      </div>

                      {/* ── ГИДРОГРАФ — загварын ОРОЛТ ──
                          ⚠️ Үр дүн БИШ, оролт. «Яагаад 18-р минутад ус хамгийн
                          их байв» гэдгийг зөвхөн энэ муруй тайлбарлана. */}
                      {flood.meta.hydroQ && flood.meta.hydroQ.length === flood.meta.slices && (
                        <div className={e.sparkBox}>
                          <div className={e.sparkHd}>
                            <span>{tr('Оролтын урсац (гидрограф)')}</span>
                            <span className="num">
                              {tr('{0} м³/с', num(flood.meta.hydroQ[slice], 1))}
                            </span>
                          </div>
                          <Spark vals={flood.meta.hydroQ} at={slice}
                            color="var(--data)" unit={tr('м³/с')} />
                        </div>
                      )}

                      <p className={e.hint}>
                        {tr('Зурган дээр дарж тухайн нүдний гүн, урсгалын хурд, чиглэл, {0} алхмын түүхийг үзнэ.',
                          num(flood.meta.slices))}
                      </p>
                      {/* ⚠️ 2026-10-09: алхмын хязгаарт тасарсан бол ИЛ — сүүлийн агшнууд нь давталт */}
                      {/* ⚠️ 2026-10-09 (аудит): зүсмэлийн дугаар нь «агшин» (тооцооны «алхам» биш — алхам нь
                          мянга мянгаар). Нэг ч агшин бодогдоогүй (`simulatedSlices === 0`) бол «давталт» биш —
                          бүх агшин хоосон (`uyrSimCore`-ийн ⚠️). */}
                      {flood.meta.truncated && (
                        <Note>
                          {flood.meta.simulatedSlices === 0
                            ? tr('Тооцоо алхмын дээд хязгаарт хүрч {0}-р минутад зогссон ({1} минутаас) — агшин бодогдоогүй: харагдаж буй агшнууд хоосон, үерийн үр дүн биш.',
                              num(flood.meta.simulatedMin ?? 0, 1), num(flood.meta.simMin ?? 60))
                            : tr('Тооцоо алхмын дээд хязгаарт хүрч {0}-р минутад зогссон ({1} минутаас). {2}-р агшнаас хойших агшнууд нь сүүлийн бодогдсон агшны давталт — шинэ мэдээлэл биш.',
                              num(flood.meta.simulatedMin ?? 0, 1), num(flood.meta.simMin ?? 60),
                              num(Math.min(flood.meta.slices, (flood.meta.simulatedSlices ?? flood.meta.slices) + 1)))}
                        </Note>
                      )}
                      {/* ⚠️ ХОЁР ЭХ СУРВАЛЖ — нарийвчлал эрс өөр тул ил хэлнэ */}
                      {flood.meta.meshPct != null && (
                        <Note>
                          {tr('Хур тунадас нь 3D mesh-ийн талбайд ({0} га) ордог; ус тэндээс өндрийн дагуу урсаж, домэйны ({1} га) захаар гарна. Өндөр: mesh байгаа газар mesh ({2} м нүд, барилга ус хаана), байхгүй газар SRTM DEM (~30 м).',
                            num(flood.meta.rainHa ?? 0, 0), num(flood.meta.domainHa ?? 0, 0),
                            num(flood.meta.srcCellM, 1))}
                        </Note>
                      )}
                    </>
                  )}
                </div>
              </section>
            )}

            {/* ── Шинжилгээ ── */}
            <section className={e.panel} aria-label={tr('Шинжилгээ')}>
              <header className={e.panelHd}>
                <h3 className={e.panelTitle}>{tr('3 · Шинжилгээ')}</h3>
              </header>
              <div className={e.panelBody}>
                <p className={e.hint}>
                  {tr('Зурагт ИДЭВХТЭЙ байгаа давхаргууд шинжилгээнд орно. Каталогоос давхарга нэмбэл дахин ажиллуулна.')}
                </p>
                <div className={e.runRow}>
                  <button
                    type="button"
                    className={e.runBtn}
                    onClick={run}
                    /* ⚠️ 2026-09-30: харуулын давхарга ЗӨВХӨН агаарт хэрэгтэй — унасан үед үерийн
                       шинжилгээ мөнхөд хаагддаг байв */
                    disabled={busy || !view || (hazard === 'air' && q.state !== 'ready')}
                  >
                    <Icon name="target" size={15} />
                    {busy ? tr('Тооцоолж байна…') : tr('Шинжилгээ хийх')}
                  </button>
                  {result && (
                    <button type="button" className={e.clearBtn} onClick={clear}>
                      <Icon name="reset" size={14} /> {tr('Цэвэрлэх')}
                    </button>
                  )}
                </div>
                {runErr && <Note><span style={{ color: 'var(--bad-ink)' }}>{runErr}</span></Note>}
                {/* ⚠️ 2026-10-07: харуул унасан үед товч идэвхгүй боловч ШАЛТГААН, «Дахин оролдох»
                    байдаггүй байв — зөвхөн «Харуулууд» таб руу орж л дахин татаж болдог байв. */}
                {hazard === 'air' && q.state === 'error' && (
                  <Note>
                    <span style={{ color: 'var(--bad-ink)' }}>{tr('Харуулын давхарга татагдсангүй')}</span>
                    {' '}
                    <button type="button" className={e.clearBtn} onClick={q.retry}>{tr('Дахин оролдох')}</button>
                  </Note>
                )}
              </div>
            </section>

            {/* ── ТҮВШНҮҮДИЙН ХАРЬЦУУЛАЛТ (2026-10-01, «хэрэглэгч: бүгдийг зас») ──
                ⚠️ Зөвхөн үерт: агаарын хувилбар загварчлалгүй (сэвсгэр нь тогтмол
                хэлбэр) тул «усанд автсан талбай», «дээд гүн» гэх багана утгагүй. */}
            {hazard === 'flood' && (
              <section className={e.panel} aria-label={tr('Түвшнүүдийн харьцуулалт')}>
                <header className={e.panelHd}>
                  <h3 className={e.panelTitle}>{tr('4 · Түвшнүүдийг харьцуулах')}</h3>
                  <span className={e.panelNote}>{tr('ижил талбай · ижил давхарга')}</span>
                </header>
                <div className={e.panelBody}>
                  <div className={e.runRow}>
                    <button
                      type="button"
                      className={e.clearBtn}
                      onClick={() => { void compareAll(); }}
                      disabled={!view || cmpLive?.busy != null}
                    >
                      <Icon name="target" size={14} />
                      {cmpLive?.busy != null
                        ? tr('{0}-р түвшин… {1}%', cmpLive.busy, num(cmpLive.pct * 100, 0))
                        : cmpLive ? tr('Дахин харьцуулах') : tr('1–3-р түвшинг харьцуулах')}
                    </button>
                  </div>
                  {cmpLive?.err && <Note><span style={{ color: 'var(--bad-ink)' }}>{cmpLive.err}</span></Note>}
                  {cmpLive && (
                    <table className={e.table}>
                      <thead>
                        <tr>
                          <th>{tr('Түвшин')}</th>
                          <th className={e.tRight}>{tr('Усанд автсан')}</th>
                          <th className={e.tRight}>{tr('Дээд гүн')}</th>
                          <th className={e.tRight}>{tr('Объект')}</th>
                          <th className={e.tRight}>{tr('Хохирол')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {([1, 2, 3] as LevelKey[]).map((lv) => {
                          const r = cmpLive.rows[lv];
                          return (
                            <tr key={lv}>
                              <td>{LEVELS.find((l) => l.key === lv)?.short}</td>
                              <td className={`${e.tRight} num`}>{r ? tr('{0} га', num(r.wetHa, 1)) : '…'}</td>
                              <td className={`${e.tRight} num`}>{r ? tr('{0} м', num(r.peakM, 2)) : '…'}</td>
                              <td className={`${e.tRight} num`}>{r ? num(r.n) : '…'}</td>
                              <td
                                className={`${e.tRight} num`}
                                title={r && r.unknown > 0
                                  ? tr('{0} давхаргын өртөг тодорхойгүй — нийтэд ороогүй', num(r.unknown))
                                  : undefined}
                              >
                                {r ? (r.cost == null ? '—' : `${mnt(r.cost)}${r.unknown > 0 ? ' *' : ''}`) : '…'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {cmpLive && (
                    <p className={e.hint}>
                      {tr('Хохирлын муж нь загварчлалын {0} м-ээс гүн усны мөр. Хохирол нь ангиллын нэгж үнийн ТААМАГ; «*» — өртөг тодорхойгүй давхарга нийтэд ороогүй.', num(0.15, 2))}
                    </p>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* ═══════════ ТӨВ: газрын зураг ═══════════ */}
      <main className={e.map}>
        <MapCanvas
          dim={dim}
          visible={visible}
          opacity={mapOpacity}
          zone={zone}
          uniform
          /* ⚠️ ХООСОН эхлэл — суурь 14 давхарга автоматаар асахгүй (§INITIAL_IDS) */
          bare
          onPick={onFeaturePick}
        />

        {/* Аюулын муж · өртсөн объект · харуулын цэг — БҮГД график (2D/3D/BIM) */}
        <Overlay
          dim={dim}
          bands={bands}
          bandOnFlood={overWater}
          damage={result?.rows ?? []}
          stations={stations}
          selected={current?.oid ?? null}
          onPick={onMapPick}
          flood={wantFlood ? flood : null}
          floodMode={fmode}
          path={path}
          floodSlice={slice}
          playing={playing}
          onSlice={setSlice}
          onEnd={() => setPlaying(false)}
          /* Урсгал УНТРААЛТТАЙ үед `null` — давхарга огт үүсэхгүй,
             GPU-д текстур эзлэхгүй. */
          windField={windFlow ? windField : null}
          windFlow={windFlow}
          windHour={windH}
        />

        <MapTools
          dim={dim}
          setDim={setDim}
          layersOpen={catOpen}
          onLayers={() => setCatOpen((v) => !v)}
          opacityOpen={opOpen}
          onOpacity={() => setOpOpen((v) => !v)}
          zone={zone}
          setZone={setZone}
        >
          {mode === 'model' && (
            /* ⚠️ 2026-09-25: самбарын «Шинжилгээ хийх»-тэй ИЖИЛ нөхцөл — харуул
               ачаалагдаагүй үед агаарын муж хоосон гарч «муж байгуулж чадсангүй» болно */
            <MapToolBtn icon="target" onClick={run} disabled={busy || !view || (hazard === 'air' && q.state !== 'ready')}>
              {busy ? tr('Тооцоолж байна…') : tr('Шинжилгээ')}
            </MapToolBtn>
          )}
          {result && <MapToolBtn onClick={clear}>{tr('Цэвэрлэх')}</MapToolBtn>}
        </MapTools>

        {catOpen && (
          <div className={o.catPanel}>
            <LayerCatalog
              view="ersdel"
              totals={catTotals}
              visible={visible}
              setVisible={setVisibleUser}
              selected={layerSel}
              onSelect={setLayerSel}
              onClose={() => setCatOpen(false)}
              zone={zone}
              embedded
            />
          </div>
        )}

        {opOpen && (
          <OpacityPanel
            visible={visible}
            opacity={opacity}
            setOpacity={setOpacity}
            onClose={() => setOpOpen(false)}
          />
        )}

        {/* ── Тайлбар (легенд) — муж бүрийн өнгө ба ЮУГ хэлж буй ── */}
        {/* ⚠️ 2026-09-30: үерийн растер (`Overlay.flood = wantFlood ? flood : null`) загварчлал
            дуусмагц зурагддаг бол легенд нь хохирлын шинжилгээ (`result`) хүлээдэг байв —
            «Гүн/Хурд/Аюул» товч гарсан ч өнгө нь юу гэдгийг хэлэхгүй. */}
        {(bands.length > 0 || mode === 'now' || windFlow || (wantFlood && !!flood)) && (
          <div className={e.legend}>
            {/* ── САЛХИНЫ ХУРДНЫ ХУВААРЬ ──
                ⚠️ Урсгал АСААЛТТАЙ үед л гарна: унтраалттай байхад тууз нь
                зурган дээр байхгүй өнгийг тайлбарлана. Хуваарь нь
                `salhiUrsgal`-аас ирнэ — гараар давтвал тохируулга
                өөрчлөгдөхөд чимээгүй зөрнө. ── */}
            {windFlow && (
              <span className={e.legItem}>
                <i className={e.windRamp} style={{ background: rampCss() }} aria-hidden />
                {tr('Салхины хурд')}
                <b className="num">{tr('0 … {0}+ м/с', num(MAX_V, 0))}</b>
              </span>
            )}
            {/* ⚠️ ҮЕРТ бүс тус бүрийн хайрцаг БИШ, тасралтгүй ШАТЛАЛ: растер нь
                гүнийг тасралтгүй өнгөөр зурдаг тул дөрвөн хайрцаг нь худал
                зэрэглэл харуулна. */}
            {/* ⚠️ УРСГАЛЫН СҮЛЖЭЭ — байнгын доод давхарга, устай холилдох ёсгүй
                тул тусдаа тайлбартай. Зөвхөн гүний горимд зурагдана. */}
            {wantFlood && flood && fmode === 'depth' && (
              <span
                className={e.legItem}
                title={tr('Ус ХААШАА урсахыг харуулах байнгын шугам (хураах талбай ≥ 0.5 га). Ус нимгэн (2–4 см) үед ч уулаас хот руу чиглэх зам харагдана.')}
              >
                <i
                  className={e.legSwatch}
                  style={{ background: 'rgba(96,148,184,0.55)' }}
                  aria-hidden
                />
                {tr('Урсгалын сүлжээ')}
              </span>
            )}

            {/* ⚠️ Легенд нь ГОРИМЫГ дагана: растер хурдаар будагдаж байхад
                гүний шатлал харуулбал тайлбар шууд ХУДАЛ болно. */}
            {/* ⚠️ 2026-10-01: АЮУЛ нь DEFRA FD2321-ийн ДӨРВӨН АНГИЛАЛ — тасралтгүй
                шатлал биш, растер ч ангиллаар шатлан будагдана (`uyr.ts` §hazardColor). */}
            {wantFlood && flood && fmode === 'hazard' && HAZARD_LEGEND().map((c) => (
              <span
                key={c.label}
                className={e.legItem}
                title={tr('Аюулын зэрэглэл HR = d × (v + 0.5) + DF (DEFRA FD2321). DF = 0 (d ≤ 0.25 м), 0.5 (0.25–0.75 м), 1 (d > 0.75 м).')}
              >
                <i className={e.legSwatch} style={{ background: c.color }} aria-hidden />
                {c.label}
                <b className="num">{tr('HR {0}', c.range)}</b>
              </span>
            ))}
            {wantFlood && flood && fmode !== 'hazard' && (
              <span className={`${e.legItem} ${e.ramp}`}>
                <i
                  className={`${e.rampBar} ${fmode === 'speed' ? e.rampSpeed
                    : fmode === 'arrival' ? e.rampArrival : ''}`}
                  aria-hidden
                />
                {fmode === 'speed' ? tr('Урсгалын хурд')
                  : fmode === 'arrival' ? tr('Ус ирэх хугацаа') : tr('Усны гүн')}
                {/* ⚠️ Градиентийн зах нь ӨНГӨ ХАНАХ утга, загварын дээд утга БИШ */}
                <b
                  className="num"
                  title={fmode === 'depth'
                    ? tr('Өнгө {0} м-д ханана — түүнээс гүн ус ижил өнгөтэй. Загварын дээд гүн {1} м. Зурагт {2} см-ээс нимгэн ус ч (энгэрийн урсгал) бүдэг харагдана, харин «усанд автсан» талбайд {3} см-ээс тооцно.',
                      num(flood.meta.rampMaxM ?? RAMP_MAX_M, 1), num(flood.meta.peakDepthM, 1),
                      num((flood.meta.drawM ?? 0.05) * 100, 0), num(flood.meta.wetM * 100, 0))
                    : fmode === 'speed'
                      ? tr('Өнгө {0} м/с-д ханана.', num(SATURATE_MS, 1))
                      : tr('Нүд бүрд {0} см-ээс гүн ус АНХ хүрсэн минут. Бараан = эрт (нүүлгэн шилжүүлэх хугацаа бага).', num(flood.meta.wetM * 100, 0))}
                >
                  {fmode === 'speed' ? tr('0 … {0}+ м/с', num(SATURATE_MS, 1))
                    : fmode === 'arrival' ? tr('0 … {0} мин', num(flood.meta.simMin ?? 60))
                      : tr('0 … {0}+ м', num(flood.meta.rampMaxM ?? RAMP_MAX_M, 1))}
                </b>
              </span>
            )}
            {/* ⚠️ 2026-10-01: ГОЛЫН ОРОЛТ — гидрограф эндээс цутгана (`Overlay` §inlet) */}
            {wantFlood && flood?.meta.inlets?.length ? (
              <span
                className={e.legItem}
                title={tr('Голын урсац судалгааны талбайд орж ирэх нүднүүд. Шошго нь тухайн агшны оролтын урсац.')}
              >
                <i className={e.legInlet} aria-hidden />
                {tr('Голын оролт')}
                <b className="num">{num(flood.meta.inlets.length)}</b>
              </span>
            ) : null}
            {bands.map((b) => (
              <span key={b.key} className={e.legItem}>
                <i className={e.legSwatch} style={{ background: b.hue }} aria-hidden />
                {b.label}
                {/* ⚠️ ТОО ЗААВАЛ: бүсийн нэр нь хоёр талдаа ЧАНАРЫН шошго
                    («Гүн ус», «Өндөр агууламж») бөгөөд ХЭД гэдгийг хэлэхгүй.
                    Нэгж нь аюулын төрлөөс хамаарна — үерт метр, агаарт µg/м³. */}
                <b className="num">
                  {result?.hazard === 'flood'
                    ? tr('{0} м', num(b.value, 2))
                    : tr('{0} µg/м³', num(b.value, 0))}
                </b>
              </span>
            ))}
            {result && result.rows.length > 0 && (
              <span className={e.legItem}>
                <i className={e.legSwatch} style={{ background: '#dc2626' }} aria-hidden />
                {tr('Өртсөн объект')}
                <b className="num">{num(sum.n)}</b>
              </span>
            )}
            {mode === 'now' && (
              <>
                <span className={e.legItem}>
                  <i className={`${e.legSwatch} ${e.legDot}`} style={{ background: '#0284c7' }} aria-hidden />
                  {tr('Усны харуул')}
                  <b className="num">{num(water.length)}</b>
                </span>
                <span className={e.legItem}>
                  <i className={`${e.legSwatch} ${e.legDia}`} style={{ background: '#ea580c' }} aria-hidden />
                  {tr('Агаарын харуул')}
                  <b className="num">{num(air.length)}</b>
                </span>
              </>
            )}
          </div>
        )}

        {/* Идэвхтэй хувилбарын чип — зурган дээр «юу харагдаж байна» гэдгийг хэлнэ */}
        {result && (
          <div className={e.chip}>
            <span className={e.chipDot} aria-hidden />
            <span className={e.chipText}>
              {HAZARDS.find((h) => h.key === result.hazard)?.title}
              {' · '}
              {LEVELS.find((l) => l.key === result.level)?.short}
            </span>
            <span className={e.chipSub}>{tr('{0} давхарга шинжлэв', num(result.layers))}</span>
            {/* ⚠️ ТАТАГДААГҮЙ давхаргыг ИЛ хэлнэ (2026-09-03-ны аудит):
                эс бөгөөс тэдгээр 0 нэмж «эрсдэлгүй» гэсэн худал баталгаа
                болно. Аюулгүй байдлын шийдвэрт «мэдээлэлгүй» ба
                «эрсдэлгүй» хоёр ХЭЗЭЭ Ч ижил утгатай биш. */}
            {result.failed.length > 0 && (
              <span className={e.chipWarn} title={result.failed.join(" · ")}>
                {tr('⚠ {0} давхарга татагдсангүй', num(result.failed.length))}
              </span>
            )}
          </div>
        )}

        {/* ── Дарсан зүйлийн МЭДЭЭЛЭЛ — зургийн баруун доод буланд ──
            ⚠️ Баруун баганад БИШ, зурган дээр: хэрэглэгчийн нүд дарсан цэг дээрээ
            байгаа бөгөөд 300px хол харах нь холбоог тасалдаг. Мөн баруун багана
            нь горимоос хамааран өөр агуулгатай (заалт / хохирол) тул түүнийг
            дарж бичих нь хоёр мэдээллийг зөрчилдүүлнэ. */}
        {info && (
          <aside className={e.info} aria-label={info.title}>
            <header className={e.infoHd} style={info.tone ? { ['--tone' as string]: info.tone } : undefined}>
              <span className={e.infoTitle}>{info.title}</span>
              <button
                type="button"
                className={e.infoClose}
                onClick={() => { setHazInfo(null); setFeatInfo(null); setPath(null); }}
                aria-label={tr('Хаах')}
              >
                ×
              </button>
            </header>
            {info.sub && <p className={e.infoSub}>{info.sub}</p>}
            {info.spark && info.sparkAt != null && (
              <div className={e.sparkBox}>
                <div className={e.sparkHd}>
                  <span>{tr('Гүний хувьсал')}</span>
                  <b className="num">{tr('дээд {0} м', num(Math.max(...info.spark.depth), 2))}</b>
                </div>
                <Spark vals={info.spark.depth} at={info.sparkAt} color="var(--data)" unit={tr('м')} />
                <div className={e.sparkHd}>
                  <span>{tr('Хурдны хувьсал')}</span>
                  <b className="num">{tr('дээд {0} м/с', num(Math.max(...info.spark.speed), 2))}</b>
                </div>
                <Spark vals={info.spark.speed} at={info.sparkAt} color="var(--warn-ink)" unit={tr('м/с')} />
              </div>
            )}
            {/* ⚠️ ШАЛТГААН — тоонуудын ДЭЭР, ялгарсан хайрцагт */}
            {info.note && <p className={e.whyBox}>{info.note}</p>}
            {info.rows.length === 0 ? (
              <p className={e.infoSub}>{tr('Нэмэлт мэдээлэл алга')}</p>
            ) : (
              <dl className={e.infoRows}>
                {info.rows.map((r, i) => (
                  <div key={`${r.k}-${i}`} className={e.infoRow}>
                    <dt className={e.infoKey}>{r.k}</dt>
                    <dd className={`${e.infoVal} num`} style={r.tone ? { color: r.tone } : undefined}>{r.v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </aside>
        )}
      </main>

      {/* ═══════════ БАРУУН: үр дүн ═══════════ */}
      <div className={e.right}>
        {mode === 'now' ? (
          <>
            <h3 className={e.colHd}>{tr('Харуулын заалт')}</h3>
            {!current ? (
              <section className={e.panel}>
                <div className={e.panelBody}>
                  {/* ⚠️ 2026-10-04: унасан үед «Харуул сонгоно уу» гэж урихгүй — алдааг хэлнэ */}
                  {q.state === 'loading' ? <Loading />
                    : q.state === 'error' ? <Empty label={tr('Харуулын давхарга татагдсангүй')} onRetry={q.retry} />
                      : <Empty label={tr('Харуул сонгоно уу')} />}
                </div>
              </section>
            ) : (
              <>
                <section className={e.panel}>
                  <header className={e.panelHd}>
                    <h3 className={e.panelTitle}>{current.name}</h3>
                    {/* ⚠️ ЗААЛТ НЬ ЖИШЭЭ гэдгийг ЭНД Ч хэлнэ (2026-09-15-ны
                        хэрэглээний аудит). Хуудасны дээд талын `Note` нь
                        доош гүйлгэхэд дэлгэцээс гардаг тул энэ самбар, АЧИ-ийн
                        цагираг, 72 цагийн графикууд дээр ямар ч тэмдэг
                        үлддэггүй байв. Салхи нь «жинхэнэ заалт» гэж шошготой
                        байдаг тул шошгогүй нь жинхэнэ гэсэн ЭСРЭГ дохио
                        үүсдэг — тэр эндүүрлийг хаана. */}
                    <span className={e.panelNote}>
                      {KIND_LABEL[current.kind]} · {tr('заалт нь жишээ өгөгдөл')}
                    </span>
                  </header>
                  <div className={e.panelBody}>
                    <div className={e.grid}>
                      {current.metrics.map((m) => <Cell key={m.key} m={m} />)}
                    </div>
                  </div>
                </section>

                {/* Гол хоёр үзүүлэлтийн 72 цагийн цуваа */}
                {current.metrics
                  .filter((m) => (current.kind === 'water'
                    ? ['level', 'flow', 'turb'].includes(m.key)
                    : ['pm25', 'aqi', 'no2'].includes(m.key)))
                  .map((m) => (
                    <section key={m.key} className={e.panel}>
                      <header className={e.panelHd}>
                        <h3 className={e.panelTitle} title={m.note}>
                          {m.label}{m.unit ? `, ${m.unit}` : ''}
                        </h3>
                        <span className={e.panelNote}>{tr('{0} цаг', num(SPAN_H))}</span>
                      </header>
                      <div className={e.panelBody}>
                        <Trend
                          unit={m.unit}
                          height={132}
                          visible={10}
                          points={m.points.map((p) => ({ label: axisLabel(p.t), value: p.v }))}
                        />
                      </div>
                    </section>
                  ))}
              </>
            )}
          </>
        ) : (
          <>
            <h3 className={e.colHd}>{tr('Хохирлын урьдчилсан үнэлгээ')}</h3>
            {!result ? (
              <section className={e.panel}>
                <div className={e.panelBody}>
                  {busy ? <Loading label={tr('Орон зайн шинжилгээ явж байна…')} />
                    : <Empty label={tr('Хувилбар сонгоод «Шинжилгээ хийх» дарна уу')} />}
                </div>
              </section>
            ) : result.rows.length === 0 && result.failed.length > 0 ? (
              /* ⚠️ 2026-09-29 (аудит 10): ТАТАГДААГҮЙ давхарга байхад 0 мөр нь
                 «эрсдэлгүй» БИШ, «мэдээлэлгүй» (дээрх `chipWarn`-ын ⚠️). Урьд нь
                 энд «өртсөн объект олдсонгүй» гэж баталж, зураг дээрх «⚠ N
                 давхарга татагдсангүй»-тэй зөрчилддөг байв. */
              <section className={e.panel} style={{ borderTop: '2px solid var(--warn)' }}>
                <div className={e.panelBody}>
                  <Empty
                    label={tr('{0} давхарга татагдсангүй — үр дүн бүрэн бус', num(result.failed.length))}
                    onRetry={busy ? undefined : () => { void run(); }}
                  />
                </div>
              </section>
            ) : result.rows.length === 0 ? (
              <section className={e.panel}>
                <div className={e.panelBody}>
                  <Empty label={tr('Идэвхтэй давхаргаас өртсөн объект олдсонгүй')} />
                  <Note>
                    {tr('Каталогоос барилга, зам, инженерийн шугам зэрэг давхаргыг асаагаад дахин ажиллуулна уу.')}
                  </Note>
                </div>
              </section>
            ) : (
              <>
                <section className={`${e.panel} ${e.panelBad}`}>
                  <header className={e.panelHd}>
                    <h3 className={e.panelTitle}>{tr('Нэгтгэл')}</h3>
                    <span className={e.panelNote}>
                      {LEVELS.find((l) => l.key === result.level)?.short}
                    </span>
                  </header>
                  <div className={e.panelBody}>
                    {/**
                      * ГОЛ ТОО — картын хамгийн дээр, ТОМООР.
                      *
                      * ⚠️ Урьд нь дөрвөн үзүүлэлт ИЖИЛ хэмжээтэй `Stats`-д
                      * зэрэгцэж, «хэдэн объект өртөв» гэсэн ГОЛ хариулт нь
                      * «хэдэн давхарга шинжлэв» гэсэн техникийн тоотой нэг
                      * жинтэй харагддаг байв. Одоо шатлал ил: нийт тоо
                      * дээр, хэмжээ дунд, техникийн тоо доор.
                      */}
                    <div className={e.hero}>
                      <span className={e.heroNum}>{num(sum.n)}</span>
                      <span className={e.heroUnit}>{tr('объект өртөнө')}</span>
                    </div>

                    <div className={e.heroRow}>
                      <div className={e.heroCell}>
                        <span className={`${e.heroVal} num`}>{ha(sum.area, 2)}</span>
                        <span className={e.heroLbl}>{tr('га талбай')}</span>
                      </div>
                      {sum.length > 0 && (
                        <div className={e.heroCell}>
                          <span className={`${e.heroVal} num`}>{num(sum.length / 1000, 2)}</span>
                          <span className={e.heroLbl}>{tr('км шугам')}</span>
                        </div>
                      )}
                      <div className={e.heroCell}>
                        <span className={`${e.heroVal} num`}>
                          {result.hazard === 'air' ? num(sum.people, 0) : num(result.layers)}
                        </span>
                        <span className={e.heroLbl}>
                          {result.hazard === 'air' ? tr('өртөх оршин суугч') : tr('давхарга шинжлэв')}
                        </span>
                      </div>
                    </div>

                    {/**
                      * ⚠️ БҮДЭГРҮҮЛЭХ ЧАГТ нь ЭНД — үр дүнгийн картын дотор.
                      * Зургийн хэрэгслийн зурваст тавибал «энэ юуг бүдгэрүүлэх
                      * вэ» гэдэг нь тодорхойгүй: бүдэгрүүлэлт нь ЗӨВХӨН
                      * шинжилгээний үр дүн байгаа үед утгатай.
                      */}
                    <label className={e.dimRow}>
                      <input
                        type="checkbox"
                        checked={dimRest}
                        onChange={(ev) => setDimRest(ev.target.checked)}
                      />
                      <span>{tr('Өртөөгүй давхаргыг бүдгэрүүлэх')}</span>
                    </label>

                    {/**
                      * ⚠️ 2026-08-29: ҮЕРИЙН «Сэргээн засварлалтын таамаг»
                      * ХАСАГДСАН (хүсэлт). Агаарын хувилбарын «Эрүүл мэндийн
                      * зардлын таамаг» нь ҮЛДЭНЭ — тэр нь өртсөн ХҮНИЙ тоон
                      * дээр тогтдог тул тусдаа утгатай үзүүлэлт.
                      */}
                    {result.hazard === 'air' && (
                      <div className={e.costBox}>
                        <span className={e.costLabel}>{tr('Эрүүл мэндийн зардлын таамаг')}</span>
                        <span className={`${e.costVal} num`}>{mnt(sum.cost)}</span>
                      </div>
                    )}
                    {result.hazard === 'flood' && (
                      /* ⚠️ Хохирлын муж ба зурган дээрх ус НЭГ эх сурвалжтай
                         болсон (2026-09-09). Аль аргаар бодогдсоныг ИЛ хэлнэ:
                         загварчлал бэлэн биш байсан бол буферээр ухардаг. */
                      <Note>
                        {result.simFootprint
                          ? tr('Хохирол нь ЗАГВАРЧЛАЛЫН бодит үерийн мөрөөр бодогдов — бүх {0} минутын дээд гүн {1} м-ээс дээш газар. Зурган дээр урсаж буй ус ба улаанаар тэмдэглэсэн хохирол НЭГ эх сурвалжтай.',
                            num(flood?.meta.simMin ?? 60), num(0.15, 2))
                          /* ⚠️ 2026-09-29 (аудит 10): шалтгаан бүрд ӨӨР өгүүлбэр —
                             «дахин ажиллуулбал…» нь зөвхөн бэлэн биш үед үнэн. */
                          : result.simWhy === 'dry'
                            ? tr('Загварчлал дууссан боловч {0} м-ээс гүн усанд автсан талбай гараагүй тул хохирлыг үерийн ЗУРВАСААР (голын ирмэгээс {1} м) тооцов.',
                              num(0.15, 2), num(FLOOD_LEVELS[result.level].reach))
                            : result.simWhy === 'failed'
                              ? tr('Загварчлал алдаагаар зогссон тул хохирлыг үерийн ЗУРВАСААР (голын ирмэгээс {0} м) тооцов. Дахин ажиллуулахад бодит мөрөөр бодогдохгүй.',
                                num(FLOOD_LEVELS[result.level].reach))
                              : tr('Загварчлал бэлэн биш байсан тул хохирлыг үерийн ЗУРВАСААР (голын ирмэгээс {0} м) тооцов. Загварчлал дуусмагц дахин ажиллуулбал бодит мөрөөр бодогдоно.',
                                num(FLOOD_LEVELS[result.level].reach))}
                      </Note>
                    )}
                    {/* ⚠️ 2026-09-08: эх сурвалж тус бүрд ӨӨР өгүүлбэр. Урьд нь
                        каталогоор тооцсон ч «ҮНДСЭН БАГЦААР тооцов» гэж ХУДАЛ
                        нэрлэдэг байв — энэ файлын өөрийн шаардлага
                        («аль замаар тооцсоныг ИЛ бичнэ») зөрчигдөж байсан. */}
                    {result.src === 'catalog' && (
                      <Note>
                        {tr('Зурагт объектын давхарга идэвхтэй байгаагүй тул каталогоос сонгосон {0} давхаргаар тооцов.', num(result.layers + result.failed.length))}
                      </Note>
                    )}
                    {result.src === 'base' && (
                      <Note>
                        {tr('Зурагт давхарга асаагаагүй тул үнэлгээний ҮНДСЭН БАГЦААР (барилга, зам, явган зам, дугуйн зам, гүүр, ногоон, мод, тоглоом) тооцов. Каталогоос давхарга асаавал ЗӨВХӨН тэдгээрээр тооцно.')}
                      </Note>
                    )}
                    <Note>
                      {result.hazard === 'air'
                        ? tr('Өртөлтөөр: ЗӨВХӨН барилгын талбайгаас — {0} м²-д 1 оршин суугч, хүн тутамд өдрийн {1} ₮ зардлын таамгаар. Эмнэлгийн бодит бүртгэлээс уншаагүй.',
                          num(EXPOSURE.m2PerPerson), num(EXPOSURE.costPerPersonDay))
                        : tr('Нэгж үнэлгээ нь объектын АНГИЛЛААС: барилга {0} {1} · хатуу хучилт {2} {3} · ногоон {4} {5} · мод {6} {7}. Гэрээний бодит үнээс уншаагүй — ТААМАГ.',
                          num(DAMAGE_RATE.building.rate), DAMAGE_RATE.building.unit,
                          num(DAMAGE_RATE.paved.rate), DAMAGE_RATE.paved.unit,
                          num(DAMAGE_RATE.green.rate), DAMAGE_RATE.green.unit,
                          num(DAMAGE_RATE.tree.rate), DAMAGE_RATE.tree.unit)}
                    </Note>
                  </div>
                </section>

                <section className={e.panel}>
                  <header className={e.panelHd}>
                    <h3 className={e.panelTitle}>{tr('Давхарга тус бүрээр')}</h3>
                    <span className={e.panelNote}>{tr('толгой дарж эрэмбэлнэ')}</span>
                  </header>
                  <div className={e.panelBody}>
                    {/* ⚠️ 2026-10-01: ЭКСПОРТ — өртсөн объект тус бүр (CSV) ба мөр + объект (GeoJSON, WGS84) */}
                    <div className={e.flowBar}>
                      <button type="button" className={e.flowBtn} onClick={exportCsv}
                        title={tr('Өртсөн объект тус бүр: давхарга, OID, мужид орсон хэмжээ, дээд гүн, үнэлгээ')}>
                        {tr('CSV татах')}
                      </button>
                      <button type="button" className={e.flowBtn} onClick={exportGeo}
                        title={tr('Аюулын муж ба өртсөн объектууд — GeoJSON (WGS84), QGIS/ArcGIS-д нээгдэнэ')}>
                        {tr('GeoJSON татах')}
                      </button>
                    </div>
                    {/* ⚠️ 2026-10-09: тайрагдсан давхаргатай бол экспорт ДУТУУ гэдгийг ил хэлнэ */}
                    {result.rows.some((r) => r.truncated) && (
                      <Note>
                        {tr('{0} давхарга тайрагдсан — CSV/GeoJSON-д тэдгээрийн зөвхөн эхний {1} объект орно (бүтэн тоо нь «total_n» баганад).',
                          num(result.rows.filter((r) => r.truncated).length), num(1200))}
                      </Note>
                    )}
                    {sum.unknownCost > 0 && (
                      <Note>
                        {tr('{0} давхаргын өртөг тодорхойгүй (нэгж үнэ баримтад алга, жишээ нь замын ирмэгийн шугам) — нийт үнэлгээнд ОРООГҮЙ.', num(sum.unknownCost))}
                      </Note>
                    )}
                    <Bars
                      items={result.rows.map((r) => ({
                        key: r.layerId,
                        label: r.title,
                        value: r.n,
                        display: r.geom === 'area'
                          ? tr('{0} ш · {1} га', num(r.n), ha(r.area, 2))
                          : r.geom === 'line'
                            ? tr('{0} ш · {1} км', num(r.n), num(r.length / 1000, 2))
                            : tr('{0} ш', num(r.n)),
                      }))}
                    />
                    <table className={e.table}>
                      <thead>
                        <tr>
                          <th>{tr('Давхарга')}</th>
                          <th>{tr('Ангилал')}</th>
                          {/* ⚠️ 2026-10-01: эрэмбэлэх толгой — `aria-sort` нь дэлгэц уншигчид */}
                          <th className={e.tRight} aria-sort={sortBy.k === 'n' ? (sortBy.desc ? 'descending' : 'ascending') : 'none'}>
                            <button type="button" className={e.sortBtn} onClick={() => toggleSort('n')}>
                              {tr('Тоо')}{sortBy.k === 'n' ? (sortBy.desc ? ' ▼' : ' ▲') : ''}
                            </button>
                          </th>
                          <th className={e.tRight}>{tr('Хэмжээ')}</th>
                          {result.hazard === 'flood' && (
                            <th className={e.tRight} aria-sort={sortBy.k === 'depth' ? (sortBy.desc ? 'descending' : 'ascending') : 'none'}>
                              <button type="button" className={e.sortBtn} onClick={() => toggleSort('depth')}
                                title={tr('Давхаргын өртсөн объектуудын хамгийн их гүн (загварчлалын бүх хугацаанд)')}>
                                {tr('Дээд гүн')}{sortBy.k === 'depth' ? (sortBy.desc ? ' ▼' : ' ▲') : ''}
                              </button>
                            </th>
                          )}
                          <th className={e.tRight} aria-sort={sortBy.k === 'cost' ? (sortBy.desc ? 'descending' : 'ascending') : 'none'}>
                            <button type="button" className={e.sortBtn} onClick={() => toggleSort('cost')}>
                              {tr('Үнэлгээ')}{sortBy.k === 'cost' ? (sortBy.desc ? ' ▼' : ' ▲') : ''}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((r) => (
                          <tr key={r.layerId}>
                            <td>
                              {r.title}
                              {/* ⚠️ Тайрагдсаныг НУУХГҮЙ. Урьд нь энэ тэмдэг
                                  «зурагт тайрсан» гэж ЗӨВХӨН зургийн дүрслэл
                                  дутуу гэж хэлдэг байсан бол хэмжээ ба үнэлгээ
                                  нь мөн 1,200 объектоос бодогдож (тоо нь бүтэн
                                  байхад) чимээгүй дутуу гардаг байв. Одоо
                                  `damageOf` хэмжээг түүврээс бүтэн тоонд
                                  шатлуулдаг тул шошго нь ТООЦООЛОЛ болохыг
                                  хэлнэ. */}
                              {r.truncated && (
                                <span
                                  className={e.trunc}
                                  title={tr('Тоо бүтэн. Хэмжээ ба үнэлгээ нь эхний 1,200 объектын дунджаар бүтэн тоонд шатлуулсан ТООЦОО — зурагт ч эхний 1,200 л улаанаар харагдана.')}
                                >
                                  {tr('түүврээр тооцсон')}
                                </span>
                              )}
                            </td>
                            <td>{DAMAGE_RATE[r.cls].label}</td>
                            <td className={`${e.tRight} num`}>{num(r.n)}</td>
                            <td className={`${e.tRight} num`}>
                              {r.geom === 'area' ? tr('{0} га', ha(r.area, 2))
                                : r.geom === 'line' ? tr('{0} км', num(r.length / 1000, 2))
                                  : '—'}
                            </td>
                            {result.hazard === 'flood' && (
                              <td className={`${e.tRight} num`}>{r.maxDepth == null ? '—' : tr('{0} м', num(r.maxDepth, 2))}</td>
                            )}
                            {/* ⚠️ 2026-10-01: `null` = ТОДОРХОЙГҮЙ (0 ₮ БИШ) */}
                            <td className={`${e.tRight} num`}>
                              {r.cost == null ? tr('тодорхойгүй') : r.cost > 0 ? mnt(r.cost) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* ── ОБЪЕКТ ТУС БҮР (2026-10-01, «хэрэглэгч: бүгдийг зас») ──
                    ⚠️ Зөвхөн үерт — объект бүрийн ДЭЭД ГҮН загварчлалаас. Эхний
                    `OBJ_SHOW` мөр; бүгд нь CSV/GeoJSON-д. */}
                {result.hazard === 'flood' && objects.length > 0 && (
                  <section className={e.panel}>
                    <header className={e.panelHd}>
                      <h3 className={e.panelTitle}>{tr('Өртсөн объект тус бүр')}</h3>
                      <span className={e.panelNote}>
                        {objects.length > OBJ_SHOW
                          ? tr('эхний {0} / {1}', num(OBJ_SHOW), num(objects.length))
                          : tr('{0} объект', num(objects.length))}
                      </span>
                    </header>
                    <div className={e.panelBody}>
                      <table className={e.table}>
                        <thead>
                          <tr>
                            <th>{tr('Давхарга')}</th>
                            <th className={e.tRight}>OID</th>
                            <th className={e.tRight}>{tr('Хэмжээ')}</th>
                            <th className={e.tRight} aria-sort={objSort.k === 'depth' ? (objSort.desc ? 'descending' : 'ascending') : 'none'}>
                              <button type="button" className={e.sortBtn} onClick={() => toggleObjSort('depth')}>
                                {tr('Дээд гүн')}{objSort.k === 'depth' ? (objSort.desc ? ' ▼' : ' ▲') : ''}
                              </button>
                            </th>
                            <th className={e.tRight} aria-sort={objSort.k === 'cost' ? (objSort.desc ? 'descending' : 'ascending') : 'none'}>
                              <button type="button" className={e.sortBtn} onClick={() => toggleObjSort('cost')}>
                                {tr('Үнэлгээ')}{objSort.k === 'cost' ? (objSort.desc ? ' ▼' : ' ▲') : ''}
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {objects.slice(0, OBJ_SHOW).map((o) => (
                            <tr key={o.key}>
                              <td>{o.title}</td>
                              <td className={`${e.tRight} num`}>{o.oid ?? '—'}</td>
                              <td className={`${e.tRight} num`}>
                                {o.geom === 'area' ? tr('{0} м²', num(o.measure, 0))
                                  : o.geom === 'line' ? tr('{0} м', num(o.measure, 0)) : '—'}
                              </td>
                              <td className={`${e.tRight} num`} style={o.depth != null ? { color: depthRisk(o.depth).color } : undefined}>
                                {o.depth == null ? '—' : tr('{0} м', num(o.depth, 2))}
                              </td>
                              <td className={`${e.tRight} num`}>
                                {o.cost == null ? tr('тодорхойгүй') : mnt(o.cost)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════ Туслах ══════════════════════ */

/**
 * Харуулуудын нэг үзүүлэлтийн ДУНДАЖ (сүүлийн заалтаар).
 *
 * ⚠️ ЗААЛТГҮЙ бол `null` — `0` БИШ (2026-09-15-ны аудит, төслийн `null ≠ 0`
 *    үндсэн дүрэм). Урьд нь `0` буцаадаг байсан тул харуул холбогдоогүй,
 *    эсвэл заалт ирээгүй үед усны түвшин «0.00 м», урсац «0.00 м³/с» гэж
 *    ХЭМЖИГДСЭН мэт харагддаг байв. `num()` нь `null`-ыг «—» болгоно.
 */
function avgOf(list: StationLive[], key: string): number | null {
  const vals = list.map((s) => s.metrics.find((m) => m.key === key)?.latest).filter((v): v is number => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/**
 * Харуулуудын нэг үзүүлэлтийн ХАМГИЙН ИХ утга — АЧИ шиг «хамгийн муугаар»
 * үнэлэх зүйлд.
 *
 * ⚠️ ЗААЛТГҮЙ бол `null` (дээрхтэй ижил дүрэм). АЧИ-д энэ нь ОНЦГОЙ чухал:
 *    `0` нь `AQI_BAND`-аар «Сайн» (ногоон) болох тул «мэдээлэл алга» нь
 *    «агаар цэвэр» гэж ХУДАЛ уншигдаж байв.
 */
function maxOf(list: StationLive[], key: string): number | null {
  const vals = list.map((s) => s.metrics.find((m) => m.key === key)?.latest).filter((v): v is number => v != null);
  return vals.length ? Math.max(...vals) : null;
}
