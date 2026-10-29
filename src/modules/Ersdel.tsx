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
 * Тиймээс дэлгэц дээр энэ ялгааг ҮРГЭЛЖ бичнэ — хэрэглэгч амьд хэмжилттэй
 * андуурч болохгүй.
 */

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type Dispatch, type SetStateAction,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { mapLayer } from '@/components/lazyLayers';
import { MapTools, MapToolBtn } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { Icon } from '@/components/Icon';
import { Bars, Empty, Loading, Note, Ring, Stat, Stats, Tabs, Trend, useTip, userError } from '@/components/ui';
import { CHART, lineSegments, areaPath } from '@/lib/chartStyle';
import { useLayerPicks } from '@/lib/useLayerPicks';

import { useAsync } from '@/lib/useAsync';
import { useSyncRef } from '@/lib/useSyncRef';
import { INFRA_SYSTEMS, INITIAL_MAP_LAYERS, LAYER_BY_ID, REFERENCE_IDS } from '@/lib/services';
import { blank, ha, mnt, num, text } from '@/lib/format';
import {
  AIR_LEVELS, AQI_BAND, EXPOSURE, FLOOD_LEVELS, GRADE_COLOR, GRADE_LABEL, HAZARDS, KIND_LABEL,
  DAMAGE_RATE, LEVELS, SPAN_H, buildLive, gradeOf, hourOf, loadStations, scenarioNote,
  type HazardKey, type LevelKey, type Metric, type Station, type StationLive,
} from '@/lib/ersdel';
import {
  airBands, bandsExtent, damageOf, floodBands, floodExtent, windFactor,
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
import { floodFootprint, FOOTPRINT_MIN_M, simplifyRings } from '@/lib/uyrSurface';
import Polygon from '@arcgis/core/geometry/Polygon';
import Graphic from '@arcgis/core/Graphic';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';
import * as projectOperator from '@arcgis/core/geometry/operators/projectOperator';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import { Overlay, type Pick } from './ersdel/Overlay';
import o from './gazarOv.module.css';
import { Toggle } from '@/components/Switch';
import e from './ersdel.module.css';

/**
 * ЭХЛЭХ ДАВХАРГА — ХООСОН (хэрэглэгчийн хүсэлт, 2026-08-25).
 *
 * Энэ харагдац нь ЗӨВХӨН ортофото дээр нээгдэнэ: аюулын муж (цэнхэр ус, шаргал
 * утаа) ба өртсөн объект (улаан) нь өнгөөр л уншигддаг тул доор нь план 2D-ийн
 * 14 өнгөт давхарга байвал тэдгээр нь булингартана.
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
 */
const areaKey = (a: SimArea | null): string =>
  (a?.length ? a.map((r) => r.map((p) => `${Math.round(p[0])},${Math.round(p[1])}`).join(';')).join('|') : 'all');

/** Загварчлалын кэшийн түлхүүр — (түвшин, талбай) */
const simKey = (lv: LevelKey, a: SimArea | null): string => `${lv}#${areaKey(a)}`;

/**
 * Кэшлэх ДЭЭД загварчлал.
 */
const SIM_CACHE_MAX = 6;

/**
 * ХОХИРЛЫН МУЖИЙН ОРОЙН ТӨСӨВ (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 */
const FOOTPRINT_BUDGET = 2500;

/** Web Mercator — зурсан талбайг загварчлалд өгөхийн өмнө (`areaToWm`, 2026-10-09) */
const WM_SR = SpatialReference.WebMercator;

/**
 * ЗАГВАРЧЛАЛААС ХОХИРЛЫН МУЖ — мөр → төсөвт багтаасан → `simplify` (топологи засна).
 * Хуурай (`FOOTPRINT_MIN_M` м-ээс гүн ус алга) бол `null`.
 */
/**
 * Нэг нүдний хэмжээ ТОРНЫ (WM) координатаар — 2026-10-09.
 */
const wmCellOf = (fd: FloodData): number =>
  (fd.meta.extent.xmax - fd.meta.extent.xmin) / fd.meta.width;

function hazardPolygon(fd: FloodData): { poly: Polygon; rings: number[][][] } | null {
  const rings = simplifyRings(floodFootprint(fd), { tol: wmCellOf(fd) * 0.25, budget: FOOTPRINT_BUDGET });
  if (!rings.length) return null;
  const raw = new Polygon({ rings, spatialReference: { wkid: fd.meta.wkid } });
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
 */
const ASSESS_IDS: string[] = [
  ...INITIAL_MAP_LAYERS,
  ...INFRA_SYSTEMS
    .filter((x) => x.key === 'heat' || x.key === 'water' || x.key === 'sewer' || x.key === 'power')
    .flatMap((x) => x.ids)
    .filter((id) => LAYER_BY_ID[id]?.geom === 'line'),
];

/**
 * ГҮНИЙ ӨНГӨ ХАНАХ ЦЭГ (м) — легендийн градиентийн БАРУУН зах.
 */
const RAMP_MAX_M = 1.5;

/**
 * Хугацааны тэнхлэгийн богино шошго — «08-24 18:00».
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
   */
  note?: string;
};

/**
 * БЯЦХАН ГРАФИК — нэг нүдний цаг хугацааны хувьсал.
 */
function Spark({
  vals, at, color, unit, label,
}: { vals: readonly (number | null)[]; at: number; color: string; unit: string; label: string }) {
  const tip = useTip();
  const W = 250;
  const H = 34;
  const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
  const peak = Math.max(...vals.filter(ok), 0.0001);
  const low = Math.min(...vals.filter(ok), peak);
  const span = peak - low || 1;
  const n = vals.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (v: number) => H - ((v - low) / span) * (H - 6) - 3;
  const segs = lineSegments(vals.map((v, i) => (ok(v) ? { x: x(i), y: y(v) } : null)), { smooth: false });
  const cur = vals[at];
  return (
    <>
      <svg
        width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden
        {...tip.bind({
          label,
          value: ok(cur) ? `${num(cur, 2)} ${unit}` : '—',
          color,
          hint: `${tr('дээд')} ${num(peak, 2)} ${unit}`,
        })}
      >
        {segs.map((sg) => {
          const fill = areaPath(sg, H);
          return fill ? (
            <path key={`a${sg.from}`} d={fill}
              style={{ fill: `color-mix(in oklab, ${color} 12%, transparent)`, stroke: 'none' }} />
          ) : null;
        })}
        {segs.map((sg) => (
          <path key={sg.from} d={sg.d} vectorEffect="non-scaling-stroke"
            style={{
              fill: 'none', stroke: color, strokeWidth: sg.single ? CHART.markerR * 2 : 1.25,
              strokeLinejoin: 'round', strokeLinecap: sg.single ? 'round' : 'butt',
            }} />
        ))}
      </svg>
      {tip.node}
    </>
  );
}

/**
 * ТҮҮХИЙ атрибут → уншиж болох мөрүүд.
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
 */
function footprintDepth(fd: FloodData, geom: __esri.Geometry | null | undefined): number | null {
  return footprintDepthEx(fd, geom).depth;
}

/**
 * `footprintDepth` + ТООЦООНЫ МУЖИД дээж орсон эсэх (2026-10-09).
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
    /* Нүдний хагасаар алхана — жижиг барилга ч дор хаяж нэг дээж авна. */
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
  failed: string[];
  /**
   * ЯМАР олонлогоор тоолсон бэ — үр дүнгийн самбарт ИЛ бичигдэнэ.
   */
  src: 'map' | 'catalog' | 'base';
  /**
   * Хохирол ЗАГВАРЧЛАЛЫН бодит үерийн мөрөөр бодогдов уу.
   */
  simFootprint?: boolean;
  /**
   * ЯАГААД буферээр ухарсан бэ (`simFootprint` худал үед л).
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
 */
const EMPTY_STATIONS: Station[] = [];

export function Ersdel({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  const { hostRef: sideHostRef, ...side } = useSideResize('ersdel');
  const { view, ortho, setOrtho, setHighlight } = useMap();

  useEffect(() => { setHighlight(null); }, [setHighlight]);

  /**
   * ОРТОФОТО-г энэ харагдацад АСААНА (хэрэглэгчийн хүсэлт).
   */
  const orthoWas = useRef(ortho);
  useEffect(() => {
    const was = orthoWas.current;
    setOrtho(true);
    return () => setOrtho(was);
  }, [setOrtho]);

  /* ── Газрын зургийн ерөнхий удирдлага (бусад харагдацтай ижил) ── */
  const [visible, setVisible] = useLayerPicks(INITIAL_IDS);
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

  /* ── Горим ба хувилбар ── */
  const [mode, setMode] = useState<'now' | 'model'>('now');
  const [hazard, setHazard] = useState<HazardKey>('flood');
  const [level, setLevel] = useState<LevelKey>(1);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  /** Зурган дээрх мэдээллийн хоёр нүд — тайлбар нь §«Зурган дээрх мэдээлэл» (доор). */
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
   */
  const [flood, setFlood] = useState<FloodData | null>(null);
  /** Явж буй загварчлалын промис — шинжилгээ түүнийг хүлээнэ */
  const simPromise = useRef<Promise<FloodData> | null>(null);
  /**
   * ЗАГВАРЧЛАХ ТАЛБАЙ — хэрэглэгчийн зурсан полигон (WM цагирагууд).
   */
  const [area, setArea] = useState<SimArea | null>(null);
  const [drawing, setDrawing] = useState(false);
  /**
   * УСНЫ ЗАМ — сонгосон нүднээс дээш/доош мөрдсөн шугам (WM цэгүүд).
   */
  const [path, setPath] = useState<{ up: number[][]; down: number[][] } | null>(null);
  /**
   * Зурсан талбайн хэмжээ (га).
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
   */
  const [simEta, setSimEta] = useState<number | null>(null);
  /**
   * ЗАГВАРЧЛАЛЫН КЭШ — (түвшин, талбай) → үр дүн (2026-10-01, «хэрэглэгч: бүгдийг зас»).
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
   */
  useEffect(() => {
    if (!wantFlood) return;
    let alive = true;
    /* 2026-09-30: загварчлалын эффект — түвшин/талбай солигдоход өмнөх үр дүнг синхрон
       тэглээд шинээр бодно; render үед гаргавал бүтэц өөрчлөгдөнө.
       (2026-10-01: `react-hooks/set-state-in-effect` энд мэдэгдэл өгөхөө больсон тул
       eslint-disable хасагдав — кэшийн эрт буцалттай болсон эффект.) */
    setFloodErr(null);
    setSlice(0);
    setSimEta(null);
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
    const t0 = performance.now();
    const { p: pr0, release } = runSim(level, area, (pr) => {
      if (!alive) return;
      const p = Math.min(0.99, Math.max(pr.minute / pr.totalMin, pr.step / pr.total));
      setSimPct(p);
      const el = (performance.now() - t0) / 1000;
      setSimEta(p > 0.03 && el > 0.5 ? (el * (1 - p)) / p : null);
    });
    simPromise.current = pr0;
    pr0
      .then((d) => {
        if (alive) { setFlood(d); setSimPct(1); setSimEta(null); }
      })
      .catch((err: unknown) => {
        if (alive) setFloodErr(userError(err));
      });
    return () => { alive = false; release(); };
  }, [wantFlood, level, area, runSim]);

  /* ══════════════════ ЗАГВАРЧЛАХ ТАЛБАЙ ЗУРАХ ══════════════════
   */
  const areaLayerRef = useRef<GraphicsLayer | null>(null);
  const svmRef = useRef<SketchViewModel | null>(null);
  /** Одоогийн талбай + түүний проекц — view дахин үүсэхэд полигоныг сэргээнэ */
  const areaRef = useRef(area);
  useSyncRef(areaRef, area);
  const areaWkidRef = useRef<number>(3857);
  useEffect(() => {
    if (!view || view.destroyed || !view.map) return;
    const gl = new GraphicsLayer({
      id: 'ersdel:area',
      listMode: 'hide',
      elevationInfo: { mode: 'on-the-ground' },
    });
    view.map.add(gl);
    const svm = new SketchViewModel({
      view,
      layer: gl,
      polygonSymbol: {
        type: 'simple-fill',
        color: [255, 255, 255, 0.04],
        outline: { color: [250, 204, 21, 0.95], width: 2 },
      } as unknown as SketchViewModel['polygonSymbol'],
      defaultCreateOptions: { hasZ: false },
    });
    const cur = areaRef.current;
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
      if (ev.state === 'cancel') { setDrawing(false); return; }
      if (ev.state !== 'complete') return;
      setDrawing(false);
      const g = ev.graphic?.geometry as __esri.Polygon | undefined;
      if (!g?.rings?.length) return;
      const mine = ++areaSeq;
      areaToWm(g).then((wa) => {
        if (mine !== areaSeq || view.destroyed) return;
        /* Шинэ полигон БЭЛЭН болсон тул л өмнөхийг арилгана */
        const old = gl.graphics.filter((x) => x !== ev.graphic).toArray();
        if (old.length) gl.removeMany(old);
        applied = ev.graphic ?? null;
        areaWkidRef.current = wa.wkid;
        setArea(wa.rings);
        if (g.extent) {
          view.goTo(g.extent.clone().expand(1.2), { animate: true, duration: 700 })
            .catch(() => {});
        }
      }, (err: unknown) => {
        if (mine !== areaSeq || view.destroyed) return;
        const stray = gl.graphics.filter((x) => x !== applied).toArray();
        if (stray.length) gl.removeMany(stray);
        setFloodErr(userError(err));
      });
    });
    svm.on('update', (ev) => {
      /* Зурсны дараа чирж засварлавал домэйныг дагуулна */
      if (ev.state !== 'complete') return;
      const g = ev.graphics[0]?.geometry as __esri.Polygon | undefined;
      if (!g?.rings?.length) return;
      const mine = ++areaSeq;
      areaToWm(g).then((wa) => {
        if (mine !== areaSeq || view.destroyed) return;
        areaWkidRef.current = wa.wkid;
        const next: SimArea = wa.rings;
        setArea((prev) => (prev && sameRings(prev, next) ? prev : next));
      }, (err: unknown) => {
        if (mine !== areaSeq || view.destroyed) return;
        setFloodErr(userError(err));
      });
    });
    areaLayerRef.current = gl;
    svmRef.current = svm;
    return () => {
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
    setDrawing(true);
    svm.create('polygon');
  }, []);

  const clearArea = useCallback(() => {
    svmRef.current?.cancel();
    areaLayerRef.current?.removeAll();
    setDrawing(false);
    setArea(null);
  }, []);


  const floodRef = useRef<FloodData | null>(flood);
  useSyncRef(floodRef, flood);
  const sliceRef = useRef(slice);
  useSyncRef(sliceRef, slice);

  const q = useAsync(loadStations, []);
  const stations: Station[] = useMemo(
    () => (q.state === 'ready' ? q.data : EMPTY_STATIONS),
    [q.state, q.data],
  );
  const live = useMemo(() => buildLive(stations, now), [stations, now]);
  const water = live.filter((s) => s.kind === 'water');
  const air = live.filter((s) => s.kind === 'air');

  /**
   * САЛХИ — агаарын харуулуудын ТӨВ цэг дээрх Open-Meteo-гийн заалт.
   */
  /**
   * ХАРУУЛ ТУС БҮРИЙН PM2.5 — сэвсгэрийн уртыг масштаблахад.
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
   */
  const [windFlow, setWindFlow] = useState(false);

  const [windFlowHazard, setWindFlowHazard] = useState(hazard);
  if (windFlowHazard !== hazard) {
    setWindFlowHazard(hazard);
    setWindFlow(hazard === 'air');
  }


  const fieldQ = useAsync(
    () => (windFlow ? loadWindField(windDate) : Promise.resolve(null)),
    [windFlow, windDate],
  );
  const windField = fieldQ.state === 'ready' ? fieldQ.data : null;

  /** Идэвхтэй цагийн индекс — ҮРГЭЛЖ одоогийн цаг */
  const [windH, setWindH] = useState(0);
  const [windHField, setWindHField] = useState(windField);
  if (windHField !== windField) {
    setWindHField(windField);
    if (windField) setWindH(nowIndex(windField));
  }
  useEffect(() => {
    if (!windField) return;
    const id = window.setInterval(() => setWindH(nowIndex(windField)), 60_000);
    return () => window.clearInterval(id);
  }, [windField]);

  /* ══════════════ ӨРТӨӨГҮЙГ БҮДЭГРҮҮЛЭХ ══════════════ */

  /**
   * Шинжилгээний дараа өртөөгүй давхаргыг бүдгэрүүлэх үү.
   */
  const [dimRest, setDimRest] = useState(true);

  /** Бүдгэрүүлэх түвшин — 0 бол бүрэн алга болж, «юу ч байхгүй» гэж уншигдана */
  const DIM = 0.22;

  /**
   * ЗУРАГТ ӨГӨХ ТУНГАЛАГ — хэрэглэгчийн гулсуур дээр бүдэгрүүлэлт нэмнэ.
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
   */
  const activeIds = useCallback((): { ids: string[]; src: Result['src'] } => {
    const map = view?.map;
    const out: string[] = [];
    map?.layers.forEach((l) => {
      if (!l.visible || !LAYER_BY_ID[l.id]) return;
      if (autoOn.current.has(l.id)) return;
      if ((REFERENCE_IDS as readonly string[]).includes(l.id)) return;
      // Зөвхөн объектын давхарга — ортофото/меш/BIM-ээс объект тоолох боломжгүй
      if (typeof (l as { queryFeatures?: unknown }).queryFeatures !== 'function') return;
      out.push(l.id);
    });
    if (out.length) return { ids: out, src: 'map' };
    const picked = visible.filter((id) => !autoOn.current.has(id) && !(REFERENCE_IDS as readonly string[]).includes(id));
    return picked.length
      ? { ids: picked, src: 'catalog' }
      : { ids: ASSESS_IDS, src: 'base' };
  }, [view, visible]);

  /* ── Шинжилгээ ── */

  /**
   * ШИНЖИЛГЭЭНИЙ ДАРААЛЛЫН ДУГААР (2026-09-21).
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
    /** Буферээр ухарсан шалтгаан — 2026-09-29 (аудит 10), `simWhy`-г үз */
    let simWhy: 'notReady' | 'dry' | 'failed' = 'notReady';
    try {
      /**
       * Урьд нь голын ирмэгээс татсан БУФЕР зурвасыг зурдаг байсан нь одоо
       * зөрчил үүсгэнэ: хохирол нь загварчлалын мөрөөр бодогддог, харин
       * зурган дээрх шар зурвас нь голын дагуу л сунадаг. Хэрэглэгч «яагаад
       * зурвасын гадна барилга улаан болов» гэж уншина. Одоо ГАНЦ хил:
       * загварчлалын усанд автсан талбай.
       */
      let bands: Band[] = [];
      /**
       * Урьд нь голын ирмэгээс татсан БУФЕР зурвасаар бодогддог байсан тул
       * зурган дээр урсаж буй ус ба улаанаар тэмдэглэсэн хохирол хоёр ЗӨРДӨГ
       * байв — хэрэглэгч «яагаад ус тэнд байхад барилга өртөөгүй бэ» гэж
       * асуухаас өөр аргагүй. Одоо хоёулаа НЭГ эх сурвалжтай.
       */
      let extent: Polygon | null = null;
      /** Загварчлалын үр дүн — `flood` төлөв БИШ (доор §fd) */
      let fd: FloodData | null = null;
      if (hazard === 'flood') {
        fd = floodRef.current
          ?? (await simPromise.current?.catch((er: unknown) => {
            if (!(er instanceof Error && er.name === 'AbortError')) simWhy = 'failed';
            return null;
          }))
          ?? null;
        if (stale()) return;
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
        bands = airBands(stations, level, windNow, pm25ByOid);
        extent = bandsExtent(bands);
      }
      if (!extent) throw new Error(tr('Аюулын мужийг байгуулж чадсангүй'));
      if (hazard === 'flood' && simFootprint) {
        bands = [{
          key: `flood-${level}`,
          label: tr('Загварчлалын үерийн мөр'),
          value: fd?.meta.peakDepthM ?? FLOOD_LEVELS[level].depth,
          height: FLOOD_LEVELS[level].depth,
          hue: '#dc2626',
          geometry: extent,
        }];
      } else if (hazard === 'flood') {
        bands = await floodBands(level);
        if (stale()) return;
      }
      const { ids, src } = activeIds();
      const fdD = hazard === 'flood' && fd?.maxDepth ? fd : null;
      const { rows, failed, analyzed } = await damageOf(view, ids, extent, level, hazard, {
        depthOf: fdD ? (g) => footprintDepth(fdD, g) : undefined,
      });
      if (stale()) return;
      setResult({
        hazard, level, bands, rows, simFootprint,
        simWhy: hazard === 'flood' && !simFootprint ? simWhy : undefined,
        layers: analyzed,
        failed,
        src,
        zoneRings: extent.rings,
      });
      /**
       * Улаан тодруулга нь `Overlay`-гийн ТУСДАА графикаар зурагддаг тул
       * давхарга нь өөрөө унтраалттай байсан ч улаан контур гарч ирдэг —
       * гэвч тэр үед хажууд нь өртөөгүй барилга/шугам ХАРАГДАХГҮЙ, улмаас
       * «юунаас хэд нь өртөв» гэдэг харьцаа алга болно. Тиймээс өртсөн зүйл
       * ОЛДСОН давхаргуудыг л асаана.
       */
      const hit = rows.filter((r) => r.n > 0).map((r) => r.layerId);
      if (hit.length) {
        setVisible((prev) => {
          for (const id of hit) if (!prev.includes(id)) autoOn.current.add(id);
          return [...new Set([...prev, ...hit])];
        });
      }
      setPlaying(hazard === 'flood');
      // Үр дүн рүү зөөлөн ойртоно — муж дэлгэцээс хальж болзошгүй
      if (!view.destroyed && extent.extent) {
        view.goTo(extent.extent.clone().expand(1.15), { animate: true, duration: 900 }).catch(() => {});
      }
    } catch (err) {
      if (stale()) return;
      setRunErr(userError(err));
      setResult(null);
    } finally {
      if (!stale()) setBusy(false);
    }
  }, [view, hazard, level, stations, windNow, pm25ByOid, activeIds, setVisible]);

  /* ══════════ ТҮВШНҮҮДИЙН ХАРЬЦУУЛАЛТ (2026-10-01, «хэрэглэгч: бүгдийг зас») ══════════
   *
   * 1–3-р түвшинг НЭГ дор: усанд автсан талбай · дээд гүн · өртсөн объект · хохирол.
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
  useEffect(() => () => {
    cmpSeq.current++;
    cmpAbort.current?.abort();
    setCmp((c) => (c && c.busy != null ? { ...c, busy: null } : c));
  }, [area]);

  const getSim = useCallback(async (lv: LevelKey, a: SimArea | null, onPct: (p: number) => void): Promise<FloodData> => {
    const key = simKey(lv, a);
    const hit = simCache.current.get(key);
    if (hit) return hit;
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
      setCmp((c) => (c ? { ...c, busy: null, err: userError(err) } : c));
    }
  }, [view, area, activeIds, getSim]);

  /* ══════════ Зурган дээрх мэдээлэл — «дарж юу вэ гэдгийг мэдэх» ══════════
   *
   * Нэг даралтад ХОЁУЛАА ажиллана (өөр өөр асуултад хариулна) бөгөөд аль нь
   * түрүүлж дуусахыг баталгаажуулах боломжгүй — `MapCanvas`-ийнх нь заримдаа
   * REST асуулга руу шилждэг тул удаан. Нэг нүдэнд бичвэл сүүлд ирсэн `null`
   * нь нөгөөгийнхөө олсон хариуг чимээгүй устгана. Тиймээс тусад нь хадгалж,
   * дэлгэцэд аюулынхыг НЬ ТЭРГҮҮНД тавина. (Төлөвийн зарлалт дээр, `sel`-ийн хажууд.)
   */
  const info = hazInfo ?? featInfo;

  /** Даралтын дугаар — тайлбар нь доор (§pickSeq, `onMapPick`-ийн дээр) */
  const pickSeq = useRef(0);
  /**
   * МЭДЭЭЛЛИЙН ХАЙРЦГИЙГ ХААХ ГАНЦ ЗАМ (2026-10-21, аудит): `pickSeq`-ийг өсгөж нислэгт яваа даралтын
   * хариуг хүчингүй болгоод хайрцаг · усны замыг арилгана. Урьд нь `setHazInfo(null)` гурван газарт
   * (цэвэрлэх · таб/түвшин солих · ×) тус тусдаа бичигдэж, аль нэг нь `pickSeq`-гүй үлдвэл хоцорсон
   * `queryFeatures` хаасан хайрцгийг буцааж нээдэг байв — `onMapPick`-ээс гадуур хайрцгийг ЭНД л хаана.
   */
  const closeInfo = useCallback(() => {
    pickSeq.current++;
    setHazInfo(null);
    setFeatInfo(null);
    setPath(null);
  }, []);

  const clear = useCallback(() => {
    runSeq.current++;
    setBusy(false);
    setResult(null);
    setRunErr(null);
    closeInfo();
  }, [closeInfo]);

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
   */
  const bandRow = useCallback((b: Band): { k: string; v: string } => (
    (resultRef.current?.hazard ?? hazardRef.current) === 'flood'
      ? { k: tr('Мужийн дээд гүн'), v: tr('{0} м', num(b.value, 2)) }
      : { k: tr('PM2.5 агууламж'), v: tr('{0} µg/м³', num(b.value, 0)) }
  ), []);

  /**
   * ДАРАЛТЫН ДУГААР — хоцорсон атрибутын хариу шинийг дарж бичихээс хамгаална.
   */

  /** Аюулын даралт — харуул / өртсөн объект / муж */
  const onMapPick = useCallback(async (p: Pick) => {
    const seq = ++pickSeq.current;
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
          (() => {
            const hr = hazardRating(d, sp);
            const hc = HAZARD_CLASS(hr);
            return { k: tr('Аюулын зэрэглэл'), v: `${hc.label} · ${tr('HR {0}', num(hr, 2))}`, tone: hc.color };
          })(),
          ...(fd.maxDepth ? [{
            k: tr('Дээд гүн (бүх хугацаа)'), v: tr('{0} м', num(fd.maxDepth(p.idx), 2)),
          }] : []),
          ...(fd.maxSpeed ? [{
            k: tr('Дээд хурд (бүх хугацаа)'), v: tr('{0} м/с', num(fd.maxSpeed(p.idx), 2)),
          }] : []),
          ...(fd.arrivalMin && fd.arrivalMin(p.idx) != null ? [{
            k: tr('Ус ирэх хугацаа'), v: tr('{0} мин', num(fd.arrivalMin(p.idx)!, 1)),
          }] : []),
          ...(why ? [
            { k: tr('Рельеф'), v: why.channel
              ? tr('голын суваг')
              : why.reliefM > 0
                ? tr('орчноосоо {0} м нам', num(why.reliefM, 1))
                : tr('орчноосоо {0} м өндөр', num(-why.reliefM, 1)) },
            { k: tr('Налуу'), v: tr('{0}%', num(why.slopePct, 1)) },
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
      const fdB = floodRef.current;
      const isFloodB = (resultRef.current?.hazard ?? hazardRef.current) === 'flood';
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
    const fdNow = floodRef.current;
    const isFlood = (resultRef.current?.hazard ?? hazardRef.current) === 'flood';
    const head: Info = {
      title: def?.title ?? p.layerId,
      sub: tr('Өртсөн объект'),
      tone: 'var(--bad)',
      rows: p.band && !isFlood ? [bandRow(p.band)] : [],
    };
    setHazInfo(head);
    const fl = mapLayer(viewRef.current?.map, p.layerId) as __esri.FeatureLayer | null;
    if (!fl || p.oid == null || typeof fl.queryFeatures !== 'function') return;
    try {
      const wantGeom = isFlood && !!fdNow?.maxDepth;
      const res = await fl.queryFeatures({
        objectIds: [p.oid], outFields: ['*'], returnGeometry: wantGeom,
        ...(wantGeom && fdNow ? { outSpatialReference: { wkid: fdNow.meta.wkid } } : {}),
      } as unknown as __esri.Query);
      if (seq !== pickSeq.current) return;
      const f = res.features[0];
      const a = f?.attributes as Record<string, unknown> | undefined;
      const depthRows: Info['rows'] = [];
      if (isFlood) {
        const fpx = wantGeom && fdNow ? footprintDepthEx(fdNow, f?.geometry) : null;
        const own = fpx?.depth ?? null;
        if (fpx && !fpx.computed && f?.geometry) {
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

  const prev = useRef({ hazard, level, mode, area });
  useEffect(() => {
    const p = prev.current;
    if (p.hazard !== hazard || p.level !== level || p.mode !== mode || p.area !== area) {
      prev.current = { hazard, level, mode, area };
      runSeq.current++;
      setBusy(false);
      setResult(null);
      setRunErr(null);
      closeInfo();
    }
  }, [hazard, level, mode, area, closeInfo]);

  /* ── Хохирлын нэгтгэл ── */
  const sum = useMemo(() => {
    const rows = (result?.rows ?? []).filter((r) => !(REFERENCE_IDS as readonly string[]).includes(r.layerId));
    return {
      n: rows.reduce((s, r) => s + r.n, 0),
      area: rows.reduce((s, r) => s + r.area, 0),
      length: rows.reduce((s, r) => s + r.length, 0),
      cost: rows.reduce((s, r) => s + (r.cost ?? 0), 0),
      unknownCost: rows.filter((r) => r.cost == null).length,
      /**
       * Өртөх оршин суугч — мөр бүрийн `people` нь ЗӨВХӨН барилгын ангиллаас
       * бодогддог (`ersdelGeom.ts`). Урьд нь энд БҮХ талбайн давхаргаас
       * (явган зам, ногоон…) тооцдог байсан нь хүний тоог хэдэн дахин
       * хөөрөгдөж байв.
       */
      people: rows.reduce((s, r) => s + r.people, 0),
    };
  }, [result]);

  /**
   * ДАВХАРГЫН ХҮСНЭГТИЙН ЭРЭМБЭ — баганын толгой дарж солино (2026-10-01).
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
    truncated: r.truncated,
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
                {q.state === 'loading' ? <Loading label={tr('Харуул уншиж байна…')} />
                  : q.state === 'error' ? <Empty label={tr('Харуулын давхарга татагдсангүй')} onRetry={q.retry} />
                  : air.length === 0 ? <Empty label={tr('Агаарын харуул алга')} /> : (() => {
                  const aqiRaw = maxOf(air, 'aqi');
                  if (aqiRaw == null) return <Empty label={tr('Агаарын заалт ирээгүй')} />;
                  const aqi = Math.round(aqiRaw);
                  const band = AQI_BAND(aqi);
                  return (
                    <>
                      <div className={e.ringBox}>
                        <Ring value={Math.min(100, (aqi / 500) * 100)} size="md"
                          color={band.color} label={tr('АЧИ')} decimals={0} text={num(aqi)} />
                        <p className={e.ringNote}>
                          <b className="num">{num(aqi)}</b> <span>{band.label}</span>
                          <span className={e.ringSub}>
                            {tr('PM2.5 дундаж {0} µg/м³', num(avgOf(air, 'pm25'), 1))}
                          </span>
                        </p>
                      </div>
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
                                points={wind!.hours.map((h) => ({
                                  label: hhmmUB(h.t),
                                  value: h.speed,
                                }))}
                              />
                              {wind!.cached ? (
                                <p className={e.windSrc}>
                                  {tr('Түр санах ойгоос — сүлжээнээс татагдсангүй')}
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

                {/* ── ЗАГВАРЧЛАХ ТАЛБАЙ (зөвхөн үерт) ── */}
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
                              num(windFactor(windNow.speed, AIR_LEVELS[level].wind), 1))}
                          </Note>
                        </>
                      )}
                      {/**
                        * УРСГАЛЫН УДИРДЛАГА — ГАНЦ товч.
                        */}
                      <div className={e.flowBar}>
                        <Toggle checked={windFlow} onChange={setWindFlow} label={tr('Урсгал харуулах')}
                          title={tr('Одоогийн салхины урсгалыг зураг дээр харуулна. Зум ойртуулахад нарийсна.')} />
                        {windFlow && windField?.times[windH] != null && (
                          <span className={`${e.flowHour} num`}>
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
                        <p className={e.windSrc}>{tr('Түр санах ойгоос — сүлжээнээс татагдсангүй')}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* ── ЦАГ ХУГАЦАА — зөвхөн үерийн загварчлалд ── */}
            {hazard === 'flood' && (
              <section className={e.panel} aria-label={tr('Цаг хугацаа')}>
                <header className={e.panelHd}>
                  <h3 className={e.panelTitle}>
                    <Icon name="waves" size={14} /> {tr('Усны тархалт')}
                  </h3>
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

                      {/* ── ЗУРГИЙГ ЮУГААР БУДАХ ВЭ ── */}
                      <div className={e.flowBar}>
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

                      {/* ── ГИДРОГРАФ — загварын ОРОЛТ ── */}
                      {flood.meta.hydroQ && flood.meta.hydroQ.length === flood.meta.slices && (
                        <div className={e.sparkBox}>
                          <div className={e.sparkHd}>
                            <span>{tr('Оролтын урсац (гидрограф)')}</span>
                            <span className="num">
                              {tr('{0} м³/с', num(flood.meta.hydroQ[slice], 1))}
                            </span>
                          </div>
                          <Spark vals={flood.meta.hydroQ} at={slice}
                            color="var(--data)" unit={tr('м³/с')} label={tr('Оролтын урсац (гидрограф)')} />
                        </div>
                      )}

                      <p className={e.hint}>
                        {tr('Зурган дээр дарж тухайн нүдний гүн, урсгалын хурд, чиглэл, {0} алхмын түүхийг үзнэ.',
                          num(flood.meta.slices))}
                      </p>
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
                {hazard === 'air' && q.state === 'error' && (
                  <Note>
                    <span style={{ color: 'var(--bad-ink)' }}>{tr('Харуулын давхарга татагдсангүй')}</span>
                    {' '}
                    <button type="button" className={e.clearBtn} onClick={q.retry}>{tr('Дахин оролдох')}</button>
                  </Note>
                )}
              </div>
            </section>

            {/* ── ТҮВШНҮҮДИЙН ХАРЬЦУУЛАЛТ (2026-10-01, «хэрэглэгч: бүгдийг зас») ── */}
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
                      {tr('Хохирлын муж нь загварчлалын {0} м-ээс гүн усны мөр. Хохирол нь ангиллын нэгж үнийн ТААМАГ; «*» — өртөг тодорхойгүй давхарга нийтэд ороогүй.', num(FOOTPRINT_MIN_M, 2))}
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
        {(bands.length > 0 || mode === 'now' || windFlow || (wantFlood && !!flood)) && (
          <div className={e.legend}>
            {/* ── САЛХИНЫ ХУРДНЫ ХУВААРЬ ── */}
            {windFlow && (
              <span className={e.legItem}>
                <i className={e.windRamp} style={{ background: rampCss() }} aria-hidden />
                {tr('Салхины хурд')}
                <b className="num">{tr('0 … {0}+ м/с', num(MAX_V, 0))}</b>
              </span>
            )}
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
            {result.failed.length > 0 && (
              <span className={e.chipWarn} title={result.failed.join(" · ")}>
                {tr('⚠ {0} давхарга татагдсангүй', num(result.failed.length))}
              </span>
            )}
          </div>
        )}

        {/* ── Дарсан зүйлийн МЭДЭЭЛЭЛ — зургийн баруун доод буланд ── */}
        {info && (
          <aside className={e.info} aria-label={info.title}>
            <header className={e.infoHd} style={info.tone ? { ['--tone' as string]: info.tone } : undefined}>
              <span className={e.infoTitle}>{info.title}</span>
              <button
                type="button"
                className={e.infoClose}
                onClick={closeInfo}
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
                <Spark vals={info.spark.depth} at={info.sparkAt} color="var(--data)" unit={tr('м')} label={tr('Гүний хувьсал')} />
                <div className={e.sparkHd}>
                  <span>{tr('Хурдны хувьсал')}</span>
                  <b className="num">{tr('дээд {0} м/с', num(Math.max(...info.spark.speed), 2))}</b>
                </div>
                <Spark vals={info.spark.speed} at={info.sparkAt} color="var(--warn-ink)" unit={tr('м/с')} label={tr('Хурдны хувьсал')} />
              </div>
            )}
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
                          visible={6}
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

                    <label className={e.dimRow}>
                      <input
                        type="checkbox"
                        checked={dimRest}
                        onChange={(ev) => setDimRest(ev.target.checked)}
                      />
                      <span>{tr('Өртөөгүй давхаргыг бүдгэрүүлэх')}</span>
                    </label>

                    {result.hazard === 'air' && (
                      <div className={e.costBox}>
                        <span className={e.costLabel}>{tr('Эрүүл мэндийн зардлын таамаг')}</span>
                        <span className={`${e.costVal} num`}>{mnt(sum.cost)}</span>
                      </div>
                    )}
                    {result.hazard === 'flood' && (
                      <Note>
                        {result.simFootprint
                          ? tr('Хохирол нь ЗАГВАРЧЛАЛЫН бодит үерийн мөрөөр бодогдов — бүх {0} минутын дээд гүн {1} м-ээс дээш газар. Зурган дээр урсаж буй ус ба улаанаар тэмдэглэсэн хохирол НЭГ эх сурвалжтай.',
                            num(flood?.meta.simMin ?? 60), num(FOOTPRINT_MIN_M, 2))
                          : result.simWhy === 'dry'
                            ? tr('Загварчлал дууссан боловч {0} м-ээс гүн усанд автсан талбай гараагүй тул хохирлыг үерийн ЗУРВАСААР (голын ирмэгээс {1} м) тооцов.',
                              num(FOOTPRINT_MIN_M, 2), num(FLOOD_LEVELS[result.level].reach))
                            : result.simWhy === 'failed'
                              ? tr('Загварчлал алдаагаар зогссон тул хохирлыг үерийн ЗУРВАСААР (голын ирмэгээс {0} м) тооцов. Дахин ажиллуулахад бодит мөрөөр бодогдохгүй.',
                                num(FLOOD_LEVELS[result.level].reach))
                              : tr('Загварчлал бэлэн биш байсан тул хохирлыг үерийн ЗУРВАСААР (голын ирмэгээс {0} м) тооцов. Загварчлал дуусмагц дахин ажиллуулбал бодит мөрөөр бодогдоно.',
                                num(FLOOD_LEVELS[result.level].reach))}
                      </Note>
                    )}
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
                        ? tr('Өртөлтөөр: ЗӨВХӨН барилгаас — барилгын хүн ам (оршин суугч + хүчин чадал) × мужид орсон хувь; хүн амгүй барилгад шалны {0} м²-д 1 хүн. Хүн тутамд өдрийн {1} ₮ зардлын таамгаар. Эмнэлгийн бодит бүртгэлээс уншаагүй.',
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
                            <td className={`${e.tRight} num`}>
                              {r.cost == null ? tr('тодорхойгүй') : r.cost > 0 ? mnt(r.cost) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* ── ОБЪЕКТ ТУС БҮР (2026-10-01, «хэрэглэгч: бүгдийг зас») ── */}
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
 */
function avgOf(list: StationLive[], key: string): number | null {
  const vals = list.map((s) => s.metrics.find((m) => m.key === key)?.latest).filter((v): v is number => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/**
 * Харуулуудын нэг үзүүлэлтийн ХАМГИЙН ИХ утга — АЧИ шиг «хамгийн муугаар»
 * үнэлэх зүйлд.
 */
function maxOf(list: StationLive[], key: string): number | null {
  const vals = list.map((s) => s.metrics.find((m) => m.key === key)?.latest).filter((v): v is number => v != null);
  return vals.length ? Math.max(...vals) : null;
}
