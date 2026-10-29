'use client';

import {
  Children, Fragment, isValidElement, useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import {
  Donut, Ring, Bars, Series, Data, Stats, Stat, Empty, Rows,
  Trend, Loading, friendlyError,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { LayerCatalog } from '@/components/LayerCatalog';
import { MapTools } from '@/components/MapTools';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useAsync, type Async } from '@/lib/useAsync';
import { usePlanTotals, failedTotals, completeSum, retryTotals, type Totals } from '@/lib/totals';
import { queryFeatures, queryGroup, count, type Row } from '@/lib/query';
import {
  ZONE_LAYER, ZONE_FIELD, ZONE_NONE, BUILT_LAYER, BUILDING,
  LAYER_BY_ID, PARCEL_CLEARED, PARCEL_LEFT, PARCEL_STATUS_HUES, SOURCE_FS, TASK_SHEET,
  PLAN_LAYER_IDS, MONITOR_LAYER_IDS, INITIAL_MAP_LAYERS,
  PKG_BY_FAMILY, PKG_BY_BAGTS, PROGRESS_LEVELS, bagtsKey, cfMonthAxis, type PkgFamily,
} from '@/lib/services';
/* (2026-08-21) analysis/config·data·costs·score импортууд `@/lib/execData` руу
   нүүсэн — үлдсэн дуудагч нь тэнд байгаа useSuitability байсан. */
import {
  loadFinData, lagOf, lagJudged, lagSeriesOf, pkgMonthsMap, physLatest, projectPlanScope, planScopeNote,
  type FinData, type MonthPt,
} from '@/modules/Finance';
import { coverageNote } from '@/lib/planProgress';
import { aggregateMonths, physNow } from '@/modules/PkgProg';
import { MAP_PKG_ALIAS, finPkgKey } from '@/lib/pkgAlias';
import {
  loadBlockProgress, loadBlockHistory, progressSeries, latestMean, levelCounts as levelCountsOf,
  type BlockProgressMap, type BlockHistory,
} from '@/lib/blockProgress';
import { sumBy, maxOf } from '@/lib/agg';
import { loadLandStatus, statusKey, statusRawsWhere, type LandStatus } from '@/lib/land';
import { cat, mnt, num, pct, shades, CAT_LIGHT, NO_DATA, km, monthKey, text } from '@/lib/format';
import { BAGTS_ORIGIN } from '@/lib/brief';
import {
  loadHeadline, loadSocial, loadBudget, loadPkgProgress, latestPkgProgress, SESSION_TTL_MS,
  cached,
  type Headline, type SocialLive, type Budget, type PkgProgressRow,
} from '@/lib/live';
import { loadPkgObyem, type PkgObyem } from '@/lib/sheetShared';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import o from './dashboardOv.module.css';
import { HeadKpi, ERR_MARK, dots, hVal, FailVal, type AsyncLike, type Dots } from './HeadKpi';
export { HeadKpi };

/**
 * ЕРӨНХИЙ ДАШБОАРД — ЗҮҮН ЖАГСААЛТ · ТӨВД ЗУРАГ · БАРУУНД ДЭЛГЭРЭНГҮЙ.
 *
 *   ┌────────────┬──────────────────────┬──────────────────┐
 *   │ 7 хэсгийн  │  Толгойн үзүүлэлт    │ Сонгосон хэсгийн │
 *   │ жагсаалт   │  ГАЗРЫН ЗУРАГ        │ дэлгэрэнгүй      │
 *   │ (ОЛОН      │                      │ (сонголт бүрд    │
 *   │  сонголт)  │                      │  нэг БАГАНА)     │
 *   └────────────┴──────────────────────┴──────────────────┘
 */

/* ══════════════════ Хэсгүүд ══════════════════ */

type SecKey = 'scope' | 'schedule' | 'bagts' | 'land' | 'network' | 'power' | 'source' | 'finance' | 'benefit';

const SECTIONS: { key: SecKey; no: string; title: string }[] = [
  { key: 'scope', no: '01', get title() { return tr('Төслийн цар хүрээ'); } },
  { key: 'schedule', no: '02', get title() { return tr('Хэрэгжилтийн ерөнхий график'); } },
  { key: 'land', no: '03', get title() { return tr('Газар чөлөөлөлтийн одоогийн төлөв'); } },
  { key: 'bagts', no: '04', get title() { return tr('Орон сууцны бүс'); } },
  { key: 'network', no: '05', get title() { return tr('Шугам сүлжээ'); } },
  { key: 'power', no: '06', get title() { return tr('Цахилгаан'); } },
  { key: 'source', no: '07', get title() { return tr('Эх үүсвэр'); } },
  { key: 'finance', no: '08', get title() { return tr('Хөрөнгө оруулалт, бонд'); } },
  { key: 'benefit', no: '09', get title() { return tr('Нийгмийн дэд бүтэц'); } },
];

/**
 * Хэсэг → тэр хэсгийн ГАЗРЫН ЗУРГИЙН давхаргууд. Хэсгийг нээхэд эдгээр асаж,
 * хаахад унтарна — «энэ тоо зурган дээр ХААНА байна вэ» гэдэг холбоо.
 */
const SECTION_LAYERS: Record<SecKey, string[]> = {
  scope: [],
  schedule: [],
  // Барилгын хяналтын блокууд — гүйцэтгэл эндээс тооцогдоно
  bagts: ['mon:building'],
  // Газар чөлөөлөлт — нэгтгэсэн давхарга (`Tuluv` төлөвөөр чөлөөлсөн/цэвэрлэсэн/үлдсэн)
  land: ['land:left'],
  // Шугам сүлжээ — гадна дулаан, ус, ариутгах татуурга (Багц 5)
  // Шугам сүлжээ — Багц 5 (net) + Багц 7–15 магистраль/эх үүсвэр (src).
  network: [...new Set([...(PKG_BY_FAMILY.net ?? []), ...(PKG_BY_FAMILY.src ?? [])])],
  // Цахилгаан — гадна цахилгаан ба ХТП/РП (Багц 6)
  power: [...(PKG_BY_FAMILY.pow ?? [])],
  // Эх үүсвэр — нэгтгэсэн үйлчилгээ (SOURCE_FS, `torol`-оор өнгөт)
  source: ['source:eh'],
  finance: [],
  // Нийгмийн барилгууд — сургууль, цэцэрлэг, соёл, спорт (Багц 19–21)
  benefit: [...(PKG_BY_FAMILY.soc ?? [])],
};

/**
 * Дашбоард нээгдэхэд асаалттай давхаргууд — бүх зурагт нэг ижил эхлэл
 * (`INITIAL_MAP_LAYERS`: барилга, зам, ногоон, мод). Бүс каталогоос асаана;
 * бүсийн шүүлт барилга дээр дарахад ч тавигддаг (`pick` — `ZONE_FIELD`).
 */
const BASE_LAYERS = INITIAL_MAP_LAYERS;

/**
 * Хэсэг сонгосон үед газрын зурагт контекст болж үлдэх давхарга — барилга.
 * (Үндсэн хил `khil1` нь `ALWAYS_ON_IDS`-ээр MapCanvas-д өөрөө үргэлж асаалттай
 * тул энд оруулах шаардлагагүй.)
 */
const CONTEXT_LAYERS = [BUILT_LAYER.id];

/**
 * «Давхарга» каталогт харуулах давхаргууд — «Ерөнхий төлөвлөгөө»-тэй ИЖИЛ
 * жагсаалт дээр хяналтын багцыг нэмнэ (дашбоард `mon:building`-ийг гүйцэтгэлд
 * ашигладаг тул каталогт ч харагдах ёстой). `catalogGroups('monitor')`-той
 * ижил дараалал.
 */
const CATALOG_IDS = [...MONITOR_LAYER_IDS, ...PLAN_LAYER_IDS.map((id) => (id === 'sb:1' ? 'nogoon' : id))];


/* ◆ Pin тэмдэглэгээ 2026-08-13-нд УСТСАН — бэхлэгдсэн тоо үлдээгүй,
   бүх үзүүлэлт ArcGIS үйлчилгээнээс амьдаар гарна (@/lib/live · @/lib/land). */

/* ══════════════════ Хэмжээ сунгах бариул ══════════════════ */



function Panel({ title, note, grow, children }: {
  title?: string;
  note?: ReactNode;
  /** envhub баганад: үлдсэн зайг эзэлж, бие нь дотроо гүйнэ (`.envGrow`) */
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`${o.panel} ${grow ? o.envGrow : ''}`}>
      {title && (
        <div className={o.panelHead}>
          <h3 className={o.panelTitle}>{title}</h3>
          {note && <span className={o.panelNote}>{note}</span>}
        </div>
      )}
      <div className={o.panelBody}>{children}</div>
    </div>
  );
}

/* ══════════════════ Түүхий өгөгдөл ══════════════════ */

const BF = BUILDING.fields;

/**
 * НЭГЖ ТАЛБАРЫН ТАЛБАЙ (м²) — `area`, хоосон бол `alt`; хоёулаа хоосон бол `null`.
 */
const parcelAreaOf = (r: Row, area: string, alt: string): number | null => {
  const v = (x: unknown): number | null => {
    if (x == null || (typeof x === 'string' && x.trim() === '')) return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };
  return v(r[area]) ?? v(r[alt]);
};
const PL = PARCEL_LEFT.fields;

export { useBagtsTable, useSuitability } from '@/lib/execData';
export type { BagtsRow, SuitSummary } from '@/lib/execData';
import { useBagtsTable, buildProgressOf, ailTotal, ailLabel, type BagtsRow } from '@/lib/execData';
import { pkgCostWeight, cfWeightRow, contractedScope, gapPtsWord, pts as ptsFmt } from '@/lib/gdash';

/* ── Төслийн жигнэсэн гүйцэтгэл — тооцоо @/lib/live-д (Тайлан/Нүүр мөн уншина) ── */

function useFinData(): Async<FinData> {
  return useAsync(loadFinData, []);
}

const loadLeftParcels = cached<Row[]>(
  () => queryFeatures(PARCEL_LEFT.url, {
    outFields: [PL.progress, PL.block, PL.status, PL.area, PL.areaAlt, PL.landuse, PL.note],
  }),
  SESSION_TTL_MS,
  ['PARCEL_LEFT'],
);

function useLeftParcels(): Async<Row[]> {
  return useAsync(() => loadLeftParcels(), []);
}

/** Эх үүсвэрийн байгууламжууд — нэгтгэсэн үйлчилгээнээс (7 объект) */
const loadSources = cached<Row[]>(
  () => queryFeatures(SOURCE_FS.url, {
    outFields: [
      SOURCE_FS.fields.type, SOURCE_FS.fields.name, SOURCE_FS.fields.share,
      SOURCE_FS.fields.total, SOURCE_FS.fields.note,
      ...SOURCE_FS.consumers.map((c) => c.field),
    ],
  }),
  SESSION_TTL_MS,
  ['SOURCE_FS'],
);

function useSources(): Async<Row[]> {
  return useAsync(() => loadSources(), []);
}

/* ── Тохиромжтой байдлын үнэлгээ — тооцоо `@/lib/execData`-д (дээрх тайлбар) ── */

/** Бүх хэсэгт хэрэгтэй өгөгдлийн багц */
type DashData = {
  bagts: Async<BagtsRow[]>;
  /**
   * САНХҮҮ + БИЕТ ГҮЙЦЭТГЭЛ — `CASHFLOW_NEW` (гэрээ) · `HO_IPC` (олгосон
   * төлбөр) ·
   * `TASK_SHEET` («Гүйцэтгэл бөглөх»-ийн нэгтгэл).
   */
  fin: Async<FinData>;
  parcels: Async<Row[]>;
  /** Газар чөлөөлөлтийн нэгдсэн АМЬД тооцоо — «Газар чөлөөлөлт» харагдацтай НЭГ томьёо */
  land: Async<LandStatus>;
  /** Толгойн амьд үзүүлэлт — талбай, хүн ам, нийт ХО, ногоон */
  headline: Async<Headline>;
  /** Төслийн төсөв — cashflow_0813 /173 (олон нийтийн бүсгүй) */
  budget: Async<Budget>;
  /** Нийгмийн барилгууд — test_data давхаргуудаас амьд тоо/хүчин чадал */
  social: Async<SocialLive>;
  sources: Async<Row[]>;
  /**
   * Блок бүрийн гүйцэтгэл (Б. + Б1…Б5).
   */
  prog: Async<BlockProgressMap>;
  /**
   * Блокийн «Б.» мөрийн бүх огноо — цувааны эх.
   */
  hist: Async<BlockHistory>;
  /**
   * БАГЦЫН ГҮЙЦЭТГЭЛИЙН НЭГТГЭЛ (`selbe_bagts_guitsetgel_negtgel`) — багц
   * бүрийн сүүлийн бүртгэл: гүйцэтгэл, ТӨЛӨВЛӨГӨӨ, эзлэхүүн.
   */
  pkgProg: Async<PkgProgressRow[]>;
  pkgVol: Async<Map<string, PkgObyem | null> | null>;
  /**
   * 05 «Шугам сүлжээ»-ийн багц бүрийн ТОО ба ХЭМЖЭЭ (урт/талбай).
   */
  netTotals: Async<Map<string, Totals>>;
  /**
   * 06 «Цахилгаан»-ы багц бүрийн ТОО ба ХЭМЖЭЭ — `netTotals`-тай ЯГ ижил
   * шалтгаанаар: цахилгааны 8 багц (6.1–6.8) ч «Гүйцэтгэл бөглөх» хуудсанд
   * байдаггүй тул биет %-ийн оронд геометрийн хэмжээ.
   */
  powTotals: Async<Map<string, Totals>>;
  /**
   * 09 «Нийгмийн дэд бүтэц»-ийн барилга тус бүрийн ТОО ба СУУРИЙН ТАЛБАЙ.
   */
  socTotals: Async<Map<string, Totals>>;
  zone: string | null;
};

/* ══════════════════ Газрын зургийн НЭГДСЭН чарт-шүүлт ══════════════════ */

/**
 * Чарт (бар/зүсмэг) дарахад газрын зурагт тавигдах шүүлт — БҮХ хэсэгт ИЖИЛ
 * механизм (хэсэг бүр өөр өөр чадвартай байсныг жигдлэв).
 *   · `where`+`only` — аттрибутын тодруулга: `only` давхаргад таарахгүй объект
 *     бүдгэрнэ (`setHighlight` → featureEffect).
 *   · `layers` — давхаргын шүүлт: зурагт ЗӨВХӨН эдгээр давхарга үлдэнэ
 *     (багц гэх мэт «нэг давхарга = нэг ангилал» өгөгдөлд).
 * Ижил чарт мөрийг ДАХИН дарахад шүүлт арилна; чип дээрх × мөн адил.
 */
export type MapFilter = {
  sec: SecKey;
  key: string;
  /** Чип дээр харагдах нэр */
  label: string;
  where?: string;
  only?: string[];
  layers?: string[];
  /** Resolve the package group's raw spellings after selecting it immediately. */
  bagtsRow?: BagtsRow;
};

/** SQL string literal — дан хашилтыг давхарлана (нэрэнд ' орсон ч эвдрэхгүй) */
const sq = (v: string) => v.replace(/'/g, "''");

/**
 * `field LIKE N'утга%'` — УГТВАРААР жишинэ, утгын доторх LIKE-ийн тусгай тэмдэгтийг (`%` `_` `[` `]`)
 * ТЭМДЭГТ болгож.
 */
const likePrefix = (field: string, v: string): string => {
  const cut = v.search(/[%_[\]]/);
  if (cut < 0) return `${field} LIKE N'${sq(v)}%'`;
  const head = v.slice(0, cut);
  return head ? `${field} LIKE N'${sq(head)}%'` : `${field} = N'${sq(v)}'`;
};

/**
 * Нэгж талбарын ТӨЛӨВИЙН шүүлт (`land:left`) — чартын шошгоос WHERE.
 */
const statusWhere = (label: string, rows: readonly Row[] | null): string => {
  const unknown = label === tr('Тодорхойгүй');
  const key = unknown ? '' : label;
  const raws = new Set<string>();
  for (const r of rows ?? []) {
    const v = r[PL.status];
    if (v != null && statusKey(v) === key) raws.add(String(v));
  }
  return statusRawsWhere(PL.status, raws, unknown, label);
};

/**
 * БАРИЛГЫН `BAGTS`-ийн ТҮҮХИЙ утгууд (давхардалгүй) — багцын тодруулгын WHERE-д.
 */
/** Сүүлд татсан түүхий утгууд — дараагийн даралт СИНХРОН (`selectFlt`-ийн сэлгэлт хуучин `flt`-ээр уралдахгүй) */
let bagtsRawsLast: unknown[] | null = null;
const loadBagtsRaws = cached<unknown[]>(
  async () => {
    const v = (await queryGroup(BUILDING.url, BF.bagts, [count(BUILDING.oid, 'n')])).map((r) => r[BF.bagts]);
    bagtsRawsLast = v;
    return v;
  },
  SESSION_TTL_MS,
  ['BUILDING'],
);
/** Багцын мөрийн бүлгийн БҮХ түүхий утгаар WHERE; түүхий утга алга бол хуучин нөхцөл (шошгоор) */
const bagtsWhereFrom = (r: BagtsRow, raws: readonly unknown[]): string => {
  const unknownLabel = tr('Тодорхойгүй');
  const unknown = r.label === unknownLabel;
  /* `joinBagts`-тэй ИЖИЛ бүлэглэлт: `text(v, «Тодорхойгүй»)` → `bagtsKey` */
  const mine = raws.filter((v) => v != null && bagtsKey(text(v, unknownLabel)) === r.key).map(String);
  const vals = [...new Set(mine.filter((v) => v !== ''))].map((v) => `N'${sq(v)}'`);
  const parts = vals.length ? [`${BF.bagts} IN (${vals.join(', ')})`] : [];
  if (unknown) parts.unshift(`${BF.bagts} IS NULL`, `${BF.bagts} = ''`);
  if (!parts.length) return `${BF.bagts} = N'${sq(r.label)}'`;
  return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
};
/** WHERE-ийг дуудагч руу — түүхий утга бэлэн бол тэр дороо, үгүй бол татаад (алдаанд шошгоор) */
const withBagtsWhere = (r: BagtsRow, done: (where: string) => void): void => {
  if (bagtsRawsLast) {
    done(bagtsWhereFrom(r, bagtsRawsLast));
    /* Кэш хүчингүй болсон (TTL / `invalidate('BUILDING')`) бол дараагийн даралтад шинэчилнэ */
    loadBagtsRaws().catch(() => undefined);
    return;
  }
  loadBagtsRaws().then(
    (raws) => done(bagtsWhereFrom(r, raws)),
    (e) => { console.warn('[selbe] багцын түүхий утга:', e); done(bagtsWhereFrom(r, [])); },
  );
};

const failedOf = (...qs: AsyncLike[]): AsyncLike | null => qs.find((q) => q.state === 'error') ?? null;

/**
 * ДУТУУ НИЙЛБЭР ГАРГАХГҮЙ — `usePlanTotals`-ын хэсэгчилсэн Map (зарим давхарга унасан).
 */
const knownIds = (ids: readonly string[]) => ids.filter((id) => LAYER_BY_ID[id]);
function completeTotals(q: Async<Map<string, Totals>>, ids: readonly string[]): Async<Map<string, Totals>> {
  if (q.state !== 'ready') return q;
  /* ХООСОН Map = хүсэлт УНТРААЛТТАЙ (`enabled: false`, хэсэг хаалттай) — бүгд унавал `usePlanTotals`
     алдаа шиддэг тул хоосон бэлэн Map нь уналт БИШ; ачаалж байгаа мэт харуулна. */
  if (q.data.size === 0) return { state: 'loading', data: null, error: null, retry: q.retry };
  const miss = failedTotals(q.data, knownIds(ids));
  if (!miss.length) return q;
  return { state: 'error', data: null, error: new Error(tr('{0} давхарга татагдсангүй', num(miss.length))), retry: retryTotals };
}
/** Унасан давхаргын тоо — толгойн тэмдэглэлд (`TotalsFailNote`) */
const totalsFailN = (q: Async<Map<string, Totals>>, ids: readonly string[]): number =>
  (q.state === 'ready' && q.data.size > 0 ? failedTotals(q.data, knownIds(ids)).length : 0);
/**
 * Шугамын НИЙТ урт (м) — `ids`-ийн м/км нэгжтэй БҮХ давхарга утгатай үед л (`completeSum`).
 */
function lenOf(tot: ReadonlyMap<string, Totals>, ids: readonly string[]): number | null {
  const qOf = (t: Totals) => (t.q != null ? t.q : t.n === 0 ? 0 : null);
  const ks = knownIds(ids);
  const m = completeSum(tot, ks.filter((id) => LAYER_BY_ID[id].qty?.unit === 'м'), qOf);
  const k = completeSum(tot, ks.filter((id) => LAYER_BY_ID[id].qty?.unit === 'км'), qOf);
  return m == null || k == null ? null : m + k * 1000;
}
/** «N давхарга татагдсангүй · Дахин оролдох» — 0 бол юу ч зурахгүй */
function TotalsFailNote({ n }: { n: number }) {
  if (!n) return null;
  return (
    <p className={o.note} role="alert" style={{ color: 'var(--bad-ink)' }}>
      {tr('{0} давхарга татагдсангүй', num(n))}{' '}
      <button
        type="button"
        onClick={retryTotals}
        style={{ color: 'inherit', font: 'inherit', background: 'none', border: 0, padding: 0, textDecoration: 'underline', cursor: 'pointer' }}
      >
        {tr('Дахин оролдох')}
      </button>
    </p>
  );
}

/* ══════════════════ Үндсэн компонент ══════════════════ */

export function Dashboard({ dim, setDim, zone, setZone }: {
  dim: Dim; setDim: (d: Dim) => void; zone: string | null; setZone: (z: string | null) => void;
}) {
  /** Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана. */
  const { hostRef: sideHostRef, ...side } = useSideResize('dashboard');
  /**
   * Нээлттэй хэсгүүд — ОЛОН сонголт. Дараалал нь ДАРСАН дараалал биш,
   * `SECTIONS`-ийн дараалал: баганууд 01→07 тогтмол эрэмбэтэй байх нь
   * хэрэглэгчид уншихад тогтвортой.
   */
  const [open, setOpen] = useState<SecKey[]>([]);
  const bagts = useBagtsTable();
  const fin = useFinData();
  const pkgProg = useAsync(loadPkgProgress, []);
  const parcels = useLeftParcels();
  const land = useAsync(loadLandStatus, []);
  const headline = useAsync(loadHeadline, []);
  const budget = useAsync(loadBudget, []);
  const social = useAsync(loadSocial, []);
  const sources = useSources();
  const prog = useAsync(loadBlockProgress, []);
  const hist = useAsync(loadBlockHistory, []);
  const netTotals = usePlanTotals(zone, open[0] === 'network', NET_PACK_IDS);
  const powTotals = usePlanTotals(zone, open[0] === 'power', POW_PACK_IDS);
  const socTotals = usePlanTotals(zone, open[0] === 'benefit', SOC_PACK_IDS);
  const volOpen = open[0] === 'schedule' || open[0] === 'bagts';
  const pkgVol = useAsync<Map<string, PkgObyem | null> | null>(() => (volOpen ? loadPkgObyem() : Promise.resolve(null)), [volOpen]);
  const d: DashData = useMemo(() => ({
    bagts, fin, pkgProg, pkgVol, parcels, land, headline, budget, social, sources, prog, hist,
    netTotals, powTotals, socTotals, zone,
  }), [bagts, fin, pkgProg, pkgVol, parcels, land, headline, budget, social, sources, prog, hist,
    netTotals, powTotals, socTotals, zone]);
  const { setHighlight } = useMap();

  /** Чарт-шүүлт (бүх хэсэгт нэгдсэн) — аттрибутын тодруулгыг зурагт тусгана */
  const [flt, setFlt] = useState<MapFilter | null>(null);
  const pickedFilter = useRef<MapFilter | null>(null);
  useEffect(() => { setHighlight(flt?.where ?? null, flt?.only); }, [flt, setHighlight]);
  useEffect(() => () => { pickedFilter.current = null; setHighlight(null); }, [setHighlight]);


  /**
   * «Давхарга» каталог нээлттэй эсэх — «Ерөнхий төлөвлөгөө» дээрх товчтой ИЖИЛ
   * зарчим. Хаалттай эхэлнэ; товч дарахад л нээгдэнэ.
   */
  const [layerOpen, setLayerOpen] = useState(false);
  /** Тунгалагийн хавтан ба давхарга тус бүрийн opacity (`MapTools`-ийн «Тунгалаг») */
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  useZoomToFilter({
    zone,
    layerId: flt?.only?.[0] ?? flt?.layers?.[0] ?? null,
    where: flt?.where ?? null,
  });
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const totals = usePlanTotals(zone, layerOpen, CATALOG_IDS);

  /** Нээлттэй хэсгүүдийн давхаргын жагсаалт (чарт-шүүлтгүй үеийн анхдагч) */
  const layersFor = useCallback((secs: SecKey[]) => {
    const ids = secs.flatMap((s) => SECTION_LAYERS[s]);
    return secs.length ? [...new Set([...CONTEXT_LAYERS, ...ids])] : BASE_LAYERS;
  }, []);

  /**
   * Газрын зурагт асаалттай давхаргууд = СУУРЬ ⊕ КАТАЛОГИЙН СОНГОЛТ.
   *
   * СУУРЬ нь төлөв БИШ, деривативаар тооцогдоно: чарт-шүүлт өөрийн давхаргатай
   * бол тэр (`flt.layers`), эс бөгөөс нээлттэй хэсгийн `SECTION_LAYERS`, юу ч
   * нээлттэй биш бол `BASE_LAYERS` (бүс + барилга). Үндсэн хил (`khil1`) нь
   * `ALWAYS_ON_IDS`-ээр MapCanvas-д өөрөө үргэлж асаалттай тул энд оруулахгүй.
   */
  const base = useMemo(
    () => (flt?.layers?.length
      ? [...new Set([...CONTEXT_LAYERS, ...flt.layers])]
      : layersFor(open)),
    [flt, open, layersFor],
  );
  const [visible, setVisible] = useLayerPicks(base);

  const toggle = useCallback((k: SecKey) => {
    const next: SecKey[] = open.includes(k) ? [] : [k];
    setOpen(next);
    // Хэсэг солигдоход чарт-шүүлт хүчингүй (өөр контекст) — цэвэрлэнэ.
    pickedFilter.current = null;
    setFlt(null);
  }, [open]);


  /**
   * Чарт дарахад — ИЖИЛ мөрийг дахин дарвал шүүлт арилна. Давхаргын шүүлттэй
   * (`layers`) сонголт зурагт зөвхөн тэр давхаргуудыг үлдээж, арилгахад
   * нээлттэй хэсгүүдийн анхдагч давхаргууд руу буцна.
   */
  const selectFlt = useCallback((next: MapFilter) => {
    const current = pickedFilter.current;
    const off = !!current && current.sec === next.sec && current.key === next.key;
    pickedFilter.current = off ? null : next;
    setFlt(off ? null : next);
    if (!off && next.bagtsRow) {
      withBagtsWhere(next.bagtsRow, (where) => {
        // A section change, toggle, newer selection or unmount cancels this result.
        if (pickedFilter.current !== next) return;
        const resolved = { ...next, where };
        pickedFilter.current = resolved;
        setFlt(resolved);
      });
    }
  }, []);

  /**
   * ХЭСГИЙН КАРТУУДЫГ БҮСЭД ХУВААРИЛАХ — картын ТООНООС хамаарна.
   */
  const zones = (() => {
    const empty = { top: null as ReactNode, left: [] as ReactNode[], right: [] as ReactNode[] };
    if (!open.length) return empty;
    // Passed through to click handlers; detailPanels does not invoke selectFlt during render.
    // eslint-disable-next-line react-hooks/refs
    const cards = detailPanels(open[0], d, flt, selectFlt);
    if (!cards.length) return empty;
    const rest = cards.slice(1);
    return {
      top: cards[0],
      left: rest.filter((_, i) => i % 2 === 0),
      right: rest.filter((_, i) => i % 2 === 1),
    };
  })();

  const pick = useCallback((attrs: Record<string, unknown> | null) => {
    if (!attrs) return;
    const zid = String(attrs[ZONE_FIELD] ?? attrs[ZONE_LAYER.zoneField ?? ''] ?? '').trim();
    if (zid && zid !== ZONE_NONE.trim()) setZone(zid);
  }, [setZone]);

  return (
    /* Талын багануудыг чирж өргөсгөх/нарийсгах — өргөн нь `--side-l/--side-r`
       хувьсагчаар өгөгддөг тул бариул тэднийг л өөрчилнө. */
    <div
      ref={sideHostRef}
      className={`${o.shell} ${side.hostClass}`}
      style={side.style}
      data-detail={open.length > 0 ? '1' : '0'}
      data-zl={zones.left.length ? '1' : '0'}
      data-zr={zones.right.length ? '1' : '0'}
      /**
       * 9 дэд дашбоард нэг ижил стиль хуваалцаж байсан тул мэдээллийн хэмжээ
       * (Эх үүсвэр 2 чарт · Шугам сүлжээ 6 чарт · Цар хүрээ 9 KPI) зөрөхөд
       * гажилт үүсдэг байв — чарт шахагдах эсвэл хоосон зай гарах. Одоо CSS
       * нь `.shell[data-sec='...']` -ээр хэсэг бүрд ТУСДАА тааруулна.
       */
      data-sec={open[0] ?? ''}
    >
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />
      <SideRail d={d} open={open} toggle={toggle} />

      {/* ЗҮҮН багана — ангиллын мөр-чартууд (envhub GeoPanel) */}
      {open.length === 0 && <EnvLeft d={d} />}

      <main className={o.center}>
        {/* Индикаторын зурвас — зургийн ЯГ дээр (envhub) */}
        {open.length === 0 && <IndStrip d={d} />}
        <div className={o.hero}>
          <MapCanvas dim={dim} visible={visible} opacity={opacity} zone={zone} uniform onPick={pick} />

          {/* Дээд-төв toolbar — БҮХ харагдацад нэгдсэн (`MapTools`). */}
          <MapTools
            dim={dim}
            setDim={setDim}
            layersOpen={layerOpen}
            onLayers={() => setLayerOpen((v) => !v)}
            opacityOpen={opOpen}
            onOpacity={() => setOpOpen((v) => !v)}
            zone={zone}
            setZone={setZone}
          />

          {opOpen && (
            <OpacityPanel
              visible={visible}
              opacity={opacity}
              setOpacity={setOpacity}
              onClose={() => setOpOpen(false)}
            />
          )}

          {layerOpen && (
            <div className={o.catPanel}>
              <LayerCatalog
                view="monitor"
                totals={totals}
                visible={visible}
                setVisible={setVisible}
                selected={layerSel}
                onSelect={setLayerSel}
                onClose={() => setLayerOpen(false)}
                zone={zone}
                embedded
              />
            </div>
          )}

          {(zone || flt) && (
            <div className={o.chipBar}>
              {zone && (
                <div className={o.filterChip}>
                  <span className={o.filterLabel}>{tr('Бүс:')} {zone}</span>
                  <button type="button" className={o.filterClear} onClick={() => setZone(null)} aria-label={tr('Шүүлт арилгах')} title={tr('Шүүлт арилгах')}>×</button>
                </div>
              )}
              {flt && (
                <div className={o.filterChip}>
                  <span className={o.filterLabel}>{flt.label}</span>
                  <button type="button" className={o.filterClear} onClick={() => selectFlt(flt)} aria-label={tr('Шүүлт арилгах')} title={tr('Шүүлт арилгах')}>×</button>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Эх сурвалжийн бичиг — Esri/ArcGIS-ийн нөхцөл (envhub-тай ижил байрлал) */}
        {open.length === 0 && (
          <p className={o.srcLine}>{tr('Суурь зураг: Esri · Дата: ArcGIS FeatureServer')}</p>
        )}
      </main>

      {/* БАРУУН багана — цуваа ба санхүүжилт */}
      {open.length === 0 && <EnvRight d={d} />}

      {/* Сонгосон хэсгийн ЧАРТУУД — тойм горимтой ИЖИЛ сонгодог байрлал:
          зураг голдоо хайрцагтай, картууд хажуугийн баганад (2026-08-21:
          хөвөгч glass хувилбарыг хэрэглэгч буцаасан; чартуудын шинэ дизайн —
          Bars, донатын 4 зүсмэгийн дүрэм — хэвээр). */}
      {open.length > 0 && (() => {
        const { top, left, right } = zones;
        return (
          <>
            {top && <div className={o.zTop}>{top}</div>}
            {left.length > 0 && <div className={o.zLeft}>{left}</div>}
            {right.length > 0 && <div className={o.zRight}>{right}</div>}
          </>
        );
      })()}
    </div>
  );
}

/** Хэсэг бүрийн чарт-шүүлтийн нийтлэг props — БҮХ хэсэг ижил интерфэйстэй */
type FltProps = { flt: MapFilter | null; onFlt: (f: MapFilter) => void };

/**
 * ХЭСГИЙН КАРТУУДЫГ МАССИВААР — байрлалыг ЭЦЭГ нь шийднэ.
 */
function detailPanels(
  k: SecKey, d: DashData, flt: MapFilter | null, onFlt: (f: MapFilter) => void,
): ReactNode[] {
  const out = Detail({ k, d, flt, onFlt });
  const kids = isValidElement<{ children?: ReactNode }>(out) && out.type === Fragment
    ? out.props.children
    : out;
  return Children.toArray(kids);
}

function Detail({ k, d, flt, onFlt }: {
  k: SecKey; d: DashData;
} & FltProps) {
  switch (k) {
    case 'scope': return ScopeDetail({ bagts: d.bagts, d, flt, onFlt });
    case 'schedule': return ScheduleDetail({ fin: d.fin, prog: d.prog, bagts: d.bagts, pkgProg: d.pkgProg, pkgVol: d.pkgVol });
    case 'bagts': return BagtsDetail({ q: d.bagts, prog: d.prog, hist: d.hist, pkgProg: d.pkgProg, pkgVol: d.pkgVol, fin: d.fin, flt, onFlt });
    case 'land': return LandDetail({ parcels: d.parcels, land: d.land, flt, onFlt });
    case 'network': return NetworkDetail({ bagts: d.bagts, sources: d.sources, netTotals: d.netTotals, zone: d.zone, flt, onFlt });
    case 'power': return PowerDetail({ sources: d.sources, prog: d.prog, powTotals: d.powTotals, flt, onFlt });
    case 'source': return SourceDetail({ sources: d.sources, d, flt, onFlt });
    case 'finance': return FinanceDetail({ budget: d.budget, flt, onFlt });
    case 'benefit': return BenefitDetail({ bagts: d.bagts, d, flt, onFlt });
  }
}

/* ══════════════════ Зүүн жагсаалт ══════════════════ */

/** ГАДНА ШУГАМ СҮЛЖЭЭНИЙ багцууд — дулаан/ус/татуурга (Багц 5.x, 7, 10–15) */
const isNetworkPack = (bagts: string) => /^БАГЦ(5[1-4]|7|1[0-5])$/.test(bagtsKey(bagts));
/**
 * Бөглөх хуудасны (`phys`) түлхүүрийг ГАЗРЫН ЗУРГИЙН багц руу хөрвүүлж шалгана.
 */
const viaMap = (pred: (k: string) => boolean) => (k: string) => {
  const key = bagtsKey(k);
  return pred(key) || pred(MAP_PKG_ALIAS[key]?.key ?? '');
};
/**
 * 05-ын багц бүрийн ХЭМЖЭЭГ татах давхаргууд — `isNetworkPack`-тай ЯГ ижил
 * олонлог. Тусад нь бичвэл шинэ багц нэмэгдэхэд хоёр газар засах болно.
 */
const NET_PACK_IDS = Object.entries(PKG_BY_BAGTS)
  .filter(([key, ids]) => ids.length && isNetworkPack(key))
  .flatMap(([, ids]) => ids);
/** ЦАХИЛГААНЫ багцууд — БАГЦ-6.1…6.8 */
const isPowerPack = (bagts: string) => /^БАГЦ6[1-8]$/.test(bagtsKey(bagts));

/**
 * 06-ын багц бүрийн ХЭМЖЭЭГ татах давхаргууд — `isPowerPack`-тай ЯГ ижил
 * олонлог (`NET_PACK_IDS`-тай ижил зарчим).
 */
const POW_PACK_IDS = Object.entries(PKG_BY_BAGTS)
  .filter(([key, ids]) => ids.length && isPowerPack(key))
  .flatMap(([, ids]) => ids);

/**
 * 09 «Нийгмийн дэд бүтэц»-ийн барилгын давхаргууд (Багц 19–21).
 */
const SOC_PACK_IDS = PKG_BY_FAMILY.soc ?? [];

/** Багцын нэрийг давхаргын гарчгуудын нийтлэг угтвараас (Bagts-тай ижил дүрэм) */
const packLabel = (ids: string[]): string => {
  const titles = ids.map((id) => LAYER_BY_ID[id]?.title ?? '').filter(Boolean);
  if (!titles.length) return '';
  let p = titles[0];
  for (const t of titles.slice(1)) {
    let i = 0;
    while (i < p.length && i < t.length && p[i] === t[i]) i += 1;
    p = p.slice(0, i);
  }
  return p.replace(/[\s·—-]+$/u, '').trim() || titles[0];
};

/**
 * Дэд бүтцийн багцууд (`PKG_BY_BAGTS`) предикатаар — газрын зургийн давхаргатай
 * нь л. (Хөрөнгө оруулалтын дүн INVEST /249-д байсан нь 2026-08-14-нд түр
 * хасагдсан тул зөвхөн зурагт шүүх багцын жагсаалт үлдэв.)
 */
const infraPackList = (pred: (b: string) => boolean) =>
  Object.entries(PKG_BY_BAGTS)
    .filter(([key, ids]) => ids.length && pred(key))
    .map(([key, ids]) => ({ key, ids, label: packLabel(ids) || key }))
    .sort((a, b) => a.label.localeCompare(b.label, 'mn', { numeric: true }));

/**
 * Хэсэг бүрийн ГОЛ тоо — жагсаалтаас шууд уншигдана, дэлгэрэнгүй нээх
 * шаардлагагүй. Амьд өгөгдөл ирээгүй бол «…». (◆ pinned төлөв УСТСАН —
 * бүх утга амьд.)
 */
function railStat(k: SecKey, d: DashData): ReturnType<typeof railStatOf> & { failed: AsyncLike | null } {
  let failed: AsyncLike | null = null;
  const st = railStatOf(k, d, (...qs) => {
    failed ??= failedOf(...qs);
    return dots(...qs);
  });
  return { ...st, failed };
}

function railStatOf(k: SecKey, d: DashData, dots: Dots): {
  value: string;
  note: string;
  /** Байвал жагсаалтын мөрөнд нимгэн явцын зурвас зурна */
  pct?: number;
  tone?: string;
} {
  const b = d.bagts.state === 'ready' ? d.bagts.data : null;
  const f = d.fin.state === 'ready' ? d.fin.data : null;
  const nowYm = monthKey();
  /**
   * Багцын биет гүйцэтгэл — «одоо» хүртэлх сүүлийн бөглөгдсөн сарын утга,
   * багцын ХО дүнгээр жигнэсэн (2026-09-30: `gdash.housingPct` — өмнө нь блокийн тоогоор).
   */
  const pkgPct = (match: (k: string) => boolean): number | null => pkgPhys(f, match).actual;
  const overall = f ? physNow(f, nowYm) : null;
  const blocks = b ? b.reduce((a, x) => a + x.blocks, 0) : null;
  const ail = b ? ailLabel(b) : null;

  switch (k) {
    case 'scope': {
      // АМЬД — хилийн давхаргын Hec_area (урьд нь бэхлэгдсэн 158 га ◆)
      const h = d.headline.state === 'ready' ? d.headline.data : null;
      return {
        value: h == null ? dots(d.headline) : hVal(h, h.areaHa, (n) => tr('{0} га', num(n, 1))),
        note: blocks == null || ail == null ? dots(d.bagts) : tr('{0} блок · {1} өрх', num(blocks), ail),
      };
    }
    case 'schedule':
      return {
        value: overall != null ? pct(overall, 1) : d.fin.state === 'loading' ? '…' : '—',
        note: f == null ? dots(d.fin) : tr('{0} багц тайлагнасан', num(f.phys.size)),
        pct: overall ?? undefined, tone: o.active,
      };
    case 'bagts': {
      const bl = b ? b.reduce((a, x) => a + x.blocks, 0) : 0;
      const avg = b && f
        ? buildProgressOf(b, pkgCostWeight(f.contracts.map(cfWeightRow))).pct
        : null;
      return {
        value: b == null ? dots(d.bagts) : f == null ? dots(d.fin) : avg == null ? '—' : pct(avg, 1),
        note: ail == null || !b ? dots(d.bagts) : tr('{0} багц · {1} блок · {2} өрх', num(b.length), num(bl), ail),
        pct: avg ?? undefined, tone: o.active,
      };
    }
    case 'land': {
      const land = d.land.state === 'ready' ? d.land.data : null;
      return {
        value: land?.pct == null ? dots(d.land) : pct(land.pct, 1),
        note: land == null ? dots(d.land) : tr('{0} үлдсэн · {1} талбар', num(land.remaining), num(land.total)),
        pct: land?.pct ?? undefined, tone: o.done,
      };
    }
    case 'network': {
      const nw = { actual: pkgPct(viaMap(isNetworkPack)) };
      const n = infraPackList(isNetworkPack).length;
      return {
        value: f == null ? dots(d.fin) : nw.actual == null ? '—' : pct(nw.actual, 1),
        note: tr('{0} багц зурагт · гадна дулаан, ус', num(n)),
        pct: nw.actual ?? undefined, tone: o.active,
      };
    }
    case 'power': {
      const pw = { actual: pkgPct(viaMap(isPowerPack)) };
      const n = infraPackList(isPowerPack).length;
      return {
        value: f == null ? dots(d.fin) : pw.actual == null ? '—' : pct(pw.actual, 1),
        note: tr('{0} багц зурагт · гадна цахилгаан', num(n)),
        pct: pw.actual ?? undefined, tone: o.active,
      };
    }
    case 'source': {
      // Эх үүсвэр — нэгтгэсэн үйлчилгээнээс АМЬД (дулаан, цахилгаан, ус)
      const rows = d.sources.state === 'ready' ? d.sources.data : null;
      if (!rows) {
        return d.sources.state === 'loading'
          ? { value: '…', note: tr('татаж байна'), tone: o.active }
          : { value: '—', note: tr('татагдсангүй'), tone: o.active };
      }
      const types = new Set(rows.map((r) => srcStr(r[SOURCE_FS.fields.type])).filter(Boolean));
      return {
        value: `${rows.length}`,
        note: tr('{0} төрөл · дулаан, цахилгаан, ус', types.size),
        tone: o.active,
      };
    }
    case 'finance': {
      // АМЬД — Cashflow_0909: гэрээлсэн ÷ нийт төсөвт өртөг
      const bg = d.budget.state === 'ready' ? d.budget.data : null;
      const share = bg && bg.total ? (bg.contract / bg.total) * 100 : null;
      return {
        value: share == null ? dots(d.budget) : pct(share, 1),
        note: bg == null ? dots(d.budget) : tr('гэрээ {0} / төсөв {1}', mnt(bg.contract), mnt(bg.total)),
        pct: share ?? undefined, tone: o.active,
      };
    }
    case 'benefit': {
      // АМЬД — хүн ам (барилгуудын Population) + нийгмийн байгууламжийн тоо
      const h = d.headline.state === 'ready' ? d.headline.data : null;
      const soc = d.social.state === 'ready' ? d.social.data : null;
      return {
        value: h == null ? dots(d.headline) : hVal(h, h.population, (n) => num(n)),
        note: soc == null ? dots(d.social) : tr('{0} нийгмийн байгууламж', num(soc.totalN)),
      };
    }
  }
}

function SideRail({ d, open, toggle }: {
  d: DashData;
  open: SecKey[]; toggle: (k: SecKey) => void;
}) {
  return (
    <div className={o.rail} role="group" aria-label={tr('Дашбоардын хэсгүүд')}>
      {SECTIONS.map((s) => {
        const on = open.includes(s.key);
        const st = railStat(s.key, d);
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={on}
            className={`${o.railItem} ${on ? o.railOn : ''}`}
            onClick={() => toggle(s.key)}
          >
            <span className={o.railTop}>
              <span className={o.railTitle} title={s.title}>{s.title}</span>
            </span>
            <b
              className={`${o.railVal} num`}
              title={st.value === ERR_MARK ? (st.failed ? friendlyError(st.failed.error) : tr('Өгөгдөл татагдсангүй')) : undefined}
              style={st.value === ERR_MARK ? { color: 'var(--bad-ink)' } : undefined}
            >
              {st.value}
            </b>
          </button>
        );
      })}

    </div>
  );
}

/* ══════════════════ envhub нэг дэлгэцийн бүрэлдэхүүнүүд ══════════════════ */

/**
 * Тэр нь хэсэг нээгээгүй үед дээд мөрийг эзэлж, 9 хэсгийг «Дэлгэрэнгүй хэсэг ▾»
 * гэсэн УНЖДАГ ЦЭС дотор нуудаг байв — хэсэг рүү орох бүрд илүү нэг даралт.
 * Дээр нь «Шүүлтүүр тавиагүй» / «N идэвхтэй ⟲ Цэвэрлэх» гэсэн төлөвийн бичиг
 * байсан ч бүсийн шүүлт нь зурган дээрх `MapTools`-ийн «Бүс» товчоор аль
 * хэдийн ил байдаг тул давхардал байлаа.
 *
 * Одоо `SideRail` ганцаараа — 9 хэсэг ҮРГЭЛЖ ил товчоор, дарвал шилжинэ.
 */

/**
 * ИНДИКАТОРЫН ЗУРВАС — envhub: нэг hairline хайрцагт заагаар тусгаарласан
 * 5 нүд; нүд бүр 2 мөрийн eyebrow + дүрс + том тоо. Бүх тоо НЭГ өнгө (ink) —
 * гол утга нь акцентаар биш БАЙРЛАЛААРАА (эхний нүд) ялгарна.
 */
function IndStrip({ d }: { d: DashData }) {
  const h = d.headline.state === 'ready' ? d.headline.data : null;
  const b = d.bagts.state === 'ready' ? d.bagts.data : null;
  const f = d.fin.state === 'ready' ? d.fin.data : null;
  const nowYm = monthKey();
  /** Төслийн биет гүйцэтгэл — `physNow` (pkgShared.ts), PkgProg/ExecReport-той НЭГ тоо.
   */
  const overall = f ? physNow(f, nowYm) : null;
  const l = d.land.state === 'ready' ? d.land.data : null;
  const blocks = b ? sumBy(b, (x) => x.blocks) : null;
  /**
   * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН ХУВЬ — `LandStatus.pct`, ЭНД ДАХИН БОДОХГҮЙ.
   */
  const clearedPct = l?.pct ?? null;
  const cells: { icon: string; label: string; v: string; q: AsyncLike }[] = [
    { icon: 'frame', label: tr('Төслийн нийт талбай'), v: h ? hVal(h, h.areaHa, (n) => tr('{0} га', num(n, 1))) : dots(d.headline), q: d.headline },
    { icon: 'users', label: tr('Хамрагдах хүн ам'), v: h ? hVal(h, h.population, (n) => num(n)) : dots(d.headline), q: d.headline },
    { icon: 'building', label: tr('Барилгын блок'), v: blocks != null ? num(blocks) : dots(d.bagts), q: d.bagts },
    { icon: 'chart', label: tr('Биет гүйцэтгэл (багцаар)'), v: overall != null ? pct(overall, 1) : dots(d.fin), q: d.fin },
    { icon: 'polygon', label: tr('Газар чөлөөлөлт'), v: clearedPct != null ? pct(clearedPct, 1) : dots(d.land), q: d.land },
  ];
  return (
    <div className={o.ind} aria-label={tr('Гол үзүүлэлт')}>
      {cells.map((c) => (
        <div key={c.label} className={o.indCell}>
          <span className={o.indLabel}>{c.label}</span>
          <span className={o.indBottom}>
            <span className={o.indIcon}><Icon name={c.icon} size={20} /></span>
            <b className={`${o.indVal} num`}>{c.v === ERR_MARK ? <FailVal q={c.q} /> : c.v}</b>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * ЗҮҮН БАГАНА — ангиллын задаргаа (envhub-ийн GeoPanel-ууд шиг):
 * дээрх хоёр нь агуулгынхаа өндөртэй, сүүлийнх нь үлдсэн зайг эзэлж дотроо
 * гүйнэ. Бүх чарт ГАНЦ өгөгдлийн өнгөөр (--data) — envhub-ийн гол дүрэм:
 * ялгааг өнгө биш ДАРААЛАЛ, ХЭМЖЭЭ илэрхийлнэ.
 */
function EnvLeft({ d }: { d: DashData }) {
  const F = SOURCE_FS.fields;
  return (
    <aside className={o.envl} aria-label={tr('Ангиллын задаргаа')}>
      <Panel title={tr('Газар чөлөөлөлт')} note={tr('төлөв · га')}>
        <Data q={d.land} loading={tr('Татаж байна…')}>
          {(ls) => (
            <Bars
              inline
              color="var(--data)"
              items={ls.byStatus.map((x) => ({
                key: x.label,
                label: x.label,
                value: x.areaM2 / 10_000,
                color: 'var(--data)',
                display: tr('{0} га', num(x.areaM2 / 10_000, 1)),
              }))}
            />
          )}
        </Data>
      </Panel>

      <Panel title={tr('Үлдсэн талбарын шалтгаан')} note={tr('нэгж талбар')}>
        <Data q={d.land} loading={tr('Татаж байна…')}>
          {(ls) => (ls.reasons.length ? (
            <Bars
              inline
              color="var(--data)"
              items={ls.reasons.slice(0, 7).map((x) => ({
                key: x.label,
                label: x.label,
                value: x.n,
                color: 'var(--data)',
                display: num(x.n),
              }))}
            />
          ) : <Empty label={tr('Шалтгаан бүртгэгдээгүй')} />)}
        </Data>
      </Panel>

      <Panel title={tr('Эх үүсвэр')} note={tr('хүчин чадлын эзлэх хувь')}>
        <Data q={d.sources} loading={tr('Татаж байна…')} minH={215}>
          {(rows) => (
            <Bars
              inline
              color="var(--data)"
              items={rows
                .map((r) => ({
                  key: srcStr(r[F.name]),
                  label: srcStr(r[F.name]),
                  value: srcNum(r[F.share]),
                  color: 'var(--data)',
                  display: pct(srcNum(r[F.share]), 0),
                }))
                .filter((x) => x.key && x.value > 0)
                .sort((x, y) => y.value - x.value)}
            />
          )}
        </Data>
      </Panel>

      {/* Санхүүжилтийн ЭХ ҮҮСВЭР — `budget.sources` нь татагдсан мөртлөө
          хаана ч зурагддаггүй байв (зөвхөн нийлбэр нь KPI-д ордог). */}
      <Panel title={tr('Санхүүжилтийн эх үүсвэр')} note={tr('₮')}>
        <Data q={d.budget} loading={tr('Татаж байна…')}>
          {(bg) => (bg.sources.length ? (
            <Bars
              inline
              color="var(--data)"
              items={[...bg.sources]
                .sort((x, y) => y.value - x.value)
                .slice(0, 6)
                .map((x) => ({
                  key: x.key,
                  label: x.label,
                  value: x.value,
                  color: 'var(--data)',
                  display: mnt(x.value),
                }))}
            />
          ) : <Empty label={tr('Эх үүсвэр задраагүй')} />)}
        </Data>
      </Panel>

      <Panel title={tr('Нийгмийн байгууламж')} note={tr('багцаар')} grow>
        <Data q={d.social} loading={tr('Татаж байна…')}>
          {(sc) =>
            sc.rows.length ? (
              <Bars
                inline
                color="var(--data)"
                items={sc.rows.map((r) => ({
                  key: r.key,
                  label: r.label,
                  value: r.n,
                  color: 'var(--data)',
                  display: r.capacity ? `${num(r.n)} / ${num(r.capacity)}` : num(r.n),
                }))}
              />
            ) : (
              <Empty label={tr('Бүртгэл алга')} />
            )
          }
        </Data>
      </Panel>
    </aside>
  );
}

/**
 * Блокуудын түүхээс ТӨСЛИЙН сарын гүйцэтгэл — envhub-ийн «Жилээр» муруйн дүйцэл.
 */
function projTrendPoints(
  h: BlockHistory,
  keys: Iterable<string>,
): { label: string; value: number; note?: string }[] {
  return progressSeries(h, keys, 'month').map((p) => ({
    label: p.label,
    value: p.overall,
    // Сарын шошго бодит хэмжилтийн огноог нуудаг — уншилтын мөрөнд буцаана
    note: p.label === p.date ? undefined : p.date,
  }));
}

/** БАРУУН БАГАНА — хугацааны цуваа + санхүүжилт + багцын жагсаалт (сунадаг) */
function EnvRight({ d }: { d: DashData }) {
  return (
    <aside className={o.envr} aria-label={tr('Явц ба санхүүжилт')}>
      <Panel title={tr('Гүйцэтгэлийн явц')} note={tr('блокийн дундаж · сараар')}>
        <Data q={d.hist} loading={tr('Татаж байна…')}>
          {(h) => {
            // Хамрах хүрээ нь 7 багцын БҮХ блок (тайлангүйг нь 0%) — тайлагнасан
            // блокоор хуваавал муруй шинэ багц нэмэгдэх бүрд буурна.
            if (d.bagts.state === 'loading') return <Loading label={tr('Татаж байна…')} />;
            if (d.bagts.state === 'error') {
              return <Empty label={tr('Багцын блокийн жагсаалт татагдсангүй')} hint={friendlyError(d.bagts.error)} onRetry={d.bagts.retry} />;
            }
            const pts = projTrendPoints(h, d.bagts.data.flatMap((r) => r.keys));
            return pts.length >= 2 ? (
              <Trend color="var(--data)" unit="%" height={92} points={pts} />
            ) : (
              <Empty label={tr('Цуваа зурах бүртгэл алга')} />
            );
          }}
        </Data>
      </Panel>

      {/* САНХҮҮЖИЛТИЙН ҮЕ ШАТ — төсөв → захирамж → гэрээ → шилжүүлсэн. */}
      <Panel title={tr('Санхүүжилтийн үе шат')} note={tr('₮ · төсвөөс')}>
        <Data q={d.budget} loading={tr('Татаж байна…')}>
          {(bg) => {
            const rows = [
              { key: 'total', label: tr('Урьдчилсан төсөв'), value: bg.total },
              { key: 'order', label: tr('Захирамжаар'), value: bg.orderTotal },
              { key: 'contract', label: tr('Гэрээ байгуулах эрх'), value: bg.contract },
            ].filter((x) => x.value > 0);
            return rows.length ? (
              <Bars
                inline
                color="var(--data)"
                max={Math.max(...rows.map((x) => x.value))}
                items={rows.map((x) => ({
                  key: x.key,
                  label: x.label,
                  value: x.value,
                  color: 'var(--data)',
                  display: mnt(x.value),
                }))}
              />
            ) : <Empty label={tr('Төсвийн задаргаа алга')} />;
          }}
        </Data>
      </Panel>

      <Panel title={tr('Санхүүжилт')} note={tr('ажлын төрлөөр · ₮')}>
        <Data q={d.budget} loading={tr('Татаж байна…')}>
          {(bg) => (
            <Bars
              inline
              color="var(--data)"
              items={[...bg.byType]
                .sort((x, y) => y.value - x.value)
                .slice(0, 8)
                .map((x) => ({
                  key: x.key,
                  label: x.label,
                  value: x.value,
                  color: 'var(--data)',
                  display: mnt(x.value),
                }))}
            />
          )}
        </Data>
      </Panel>

      {/* БЛОКИЙН ТАРХАЛТ — `prog` нь 113 блокийн гүйцэтгэлийг агуулдаг мөртлөө
          тоймд огт зурагддаггүй байв. «Дундаж 27.6%» гэдэг нэг тоо нь бүх блок
          дунджаараа явж байгаа мэт сэтгэгдэл төрүүлдэг; бодит тархалт өөр. */}
      <Panel title={tr('Блокийн гүйцэтгэл')} note={tr('түвшнээр · блок')}>
        <Data q={d.prog} loading={tr('Татаж байна…')}>
          {(pm) => {
            const counts = levelCounts(pm, d.bagts.state === 'ready' ? d.bagts.data : null);
            const tot = counts.reduce((a, b) => a + b, 0);
            return tot ? (
              <Bars
                inline
                color="var(--data)"
                items={PROGRESS_LEVELS.map((l, i) => ({
                  key: l.key,
                  label: `${l.label} ${l.range}`,
                  value: counts[i],
                  color: 'var(--data)',
                  display: tr('{0} блок', num(counts[i])),
                }))}
              />
            ) : <Empty label={tr('Гүйцэтгэл бүртгэгдээгүй')} />;
          }}
        </Data>
      </Panel>

      <Panel title={tr('Багц ажлаар')} note={tr('биет гүйцэтгэл %')} grow>
        <Data q={d.bagts} loading={tr('Татаж байна…')}>
          {(rows) => (
            <Bars
              inline
              color="var(--data)"
              max={100}
              items={[...rows]
                .sort((x, y) => (y.progress ?? -1) - (x.progress ?? -1))
                .map((r) => ({
                  key: r.key,
                  label: r.label,
                  value: r.progress ?? null,
                  color: r.progress == null ? NO_DATA : 'var(--data)',
                  display: r.progress == null ? '—' : pct(r.progress, 1),
                }))}
            />
          )}
        </Data>
      </Panel>
    </aside>
  );
}



/* ══════════════════ 01 · Цар хүрээ ══════════════════ */

function ScopeDetail({ bagts, d, flt, onFlt }: {
  bagts: Async<BagtsRow[]>; d: DashData;
} & FltProps) {
  // БҮГД АМЬД (2026-08-13): бэхлэгдсэн SCOPE (74 багц · 7,500 тн нүүрс ·
  // −7.7% агаар · 16,000 ажлын байр) — эх сурвалжгүй мөрүүд ХАСАГДАВ.
  const b = bagts.state === 'ready' ? bagts.data : null;
  const blocks = b ? sumBy(b, (x) => x.blocks) : null;
  const ailT = b ? ailTotal(b) : null;
  const ail = ailT?.ail ?? null;
  /** Харьцаанд (1 өрхөд ногдох …) — ДУТУУ нийлбэрээр хуваавал худал өндөр гарна → null («—») */
  const ailFull = ailT?.partial ? null : ail;
  const h = d.headline.state === 'ready' ? d.headline.data : null;
  const soc = d.social.state === 'ready' ? d.social.data : null;
  // Нийт гүйцэтгэл — `physNow` (2026-09-22): 05 · ExecReport · IndStrip · HeadKpi-тэй нэг тоо
  const prog = { actual: d.fin.state === 'ready' ? physNow(d.fin.data, monthKey()) : null };
  /** Багцын тоо — барилгын 7 + газрын зургийн дэд бүтцийн багцууд (PKG_BY_BAGTS) */
  const packs = b
    ? new Set([...b.map((x) => x.key), ...Object.keys(PKG_BY_BAGTS)]).size
    : null;
  /**
   * Харьцаа — хоёр тал бэлэн үед л. 2026-10-06: урьд нь `a && b ? …: '…'` (үнэн/худал) тул
   * унасан ачаалал мөнхөд «…», 0 утга ч «…» гэж харагддаг байв. Одоо «…» зөвхөн ачаалж байхад,
   * унасан бол « », хуваарь 0 бол «—»; хэсэгчилсэн headline-ийн NaN нь « » (`hVal`-ийн дүрэм).
   */
  const ratio = (
    a: number | null | undefined, den: number | null | undefined,
    fmt: (v: number) => string, ...qs: AsyncLike[]
  ): string => {
    if (a == null || den == null) return dots(...qs);
    if (!Number.isFinite(a) || !Number.isFinite(den)) return h?.partial ? ERR_MARK : '—';
    return den > 0 ? fmt(a / den) : '—';
  };

  return (
    <>
      <Panel title={tr('Төслийн цар хүрээ')}>
        <Stats cols={2}>
          <Stat accent color={HUE[0]} value={h == null ? dots(d.headline) : hVal(h, h.areaHa, (v) => num(v, 1))} unit={tr('га')} label={tr('Төслийн талбай')} />
          <Stat accent color={HUE[1]} value={prog.actual != null ? num(prog.actual, 1) : d.fin.state === 'loading' ? '…' : '—'} unit="%" label={tr('Биет гүйцэтгэл (багцаар)')} />
          <Stat accent color={HUE[2]} value={h == null ? dots(d.headline) : hVal(h, h.investTotal, (v) => num(v))} unit={tr('₮')} label={tr('Нийт төсөв')} />
          <Stat accent color={HUE[3]} value={blocks == null ? dots(bagts) : num(blocks)} unit={tr('блок')} label={tr('Орон сууцны блок')} />
          <Stat accent color={HUE[4]} value={ail == null ? dots(bagts) : num(ail)} unit={tr('өрх')} label={tr('Айл өрх')} />
          <Stat accent color={HUE[5 % HUE.length]} value={packs == null ? dots(bagts) : num(packs)} unit={tr('багц')} label={tr('Багц (газрын зураг)')} />
          <Stat accent color={HUE[6 % HUE.length]} value={h == null ? dots(d.headline) : hVal(h, h.population, (v) => num(v))} unit={tr('хүн')} label={tr('Хамрагдах хүн ам')} />
          <Stat accent color={HUE[7 % HUE.length]} value={soc == null ? dots(d.social) : num(soc.totalN)} unit={tr('ш')} label={tr('Шинэ нийгмийн байгууламж (зурагт)')} />
          <Stat accent color={HUE[0]} value={h?.greenHa == null ? '—' : num(h.greenHa, 1)} unit={tr('га')} label={tr('Ногоон байгууламж')} />
        </Stats>
      </Panel>


      {/* Нягтрал — дээрх картын тоонуудын ХАРЬЦАА. Нэгж мөр тутамд өөр (өрх ·
          хүн · ₮ · %) тул багана биш key→value хэлбэрээр. Шинэ хүсэлт үүсэхгүй. */}
      <Panel title={tr('Нягтрал — нэгжид ногдох үзүүлэлт')}>
        <Rows
          items={[
            { key: tr('Нэг блокт ногдох өрх'), value: ratio(ail, blocks, (v) => num(v, 1), bagts) },
            { key: tr('Нэг өрхөд ногдох хүн'), value: ratio(h?.population, ail, (v) => num(v, 1), d.headline, bagts) },
            { key: tr('1 га-д ногдох өрх'), value: ratio(ail, h?.areaHa, (v) => num(v, 1), d.headline, bagts) },
            {
              key: tr('1 өрхөд ногдох төсөв'),
              value: ratio(h?.investTotal, ailFull, (v) => mnt(v), d.headline, bagts),
            },
            {
              key: tr('1 га-д ногдох төсөв'),
              value: ratio(h?.investTotal, h?.areaHa, (v) => mnt(v), d.headline),
            },
            {
              key: tr('Ногоон байгууламжийн эзлэх хувь'),
              value: h?.greenHa == null || !h.areaHa ? '—' : pct((h.greenHa / h.areaHa) * 100, 1),
            },
            {
              key: tr('Нэг нийгмийн байгууламжид ногдох хүн'),
              value: ratio(h?.population, soc?.totalN, (v) => num(v), d.headline, d.social),
            },
          ]}
        />
      </Panel>

      {/* Багцын бүтэц — `PKG_TABLE`-ийн мета (хүсэлтгүй). Үе шатны ЖИНГИЙН
          Donut нь 02-т байна — энд давхардуулахгүй. */}
      <Panel title={tr('Багцын бүтэц — гэр бүлээр')}>
        {(() => {
          const fams = (Object.keys(FAMILY_LABEL) as PkgFamily[])
            .map((f) => ({ f, n: familyPacks(f).length }))
            .filter((x) => x.n > 0);
          const items = [
            ...(b ? [{ key: 'house', label: tr('Орон сууц ({0} багц)', num(b.length)), value: b.length }] : []),
            ...fams.map((x) => ({ key: x.f as string, label: FAMILY_LABEL[x.f], value: x.n })),
          ];
          if (!items.length) return <Empty label={tr('Багцын хүснэгт хоосон.')} />;
          return (
            <Bars
              inline
              items={heatBars(items, (x) => ({
                key: x.key,
                label: x.label,
                value: x.value,
                display: tr('{0} багц', num(x.value)),
              }))}
            />
          );
        })()}
      </Panel>


      {/* Багц бүрийн ХЭМЖЭЭ (блокоор) — 04 нь `progress`/`ail`-аар зурдаг тул
          блокийн тоо баганын утга болж хаана ч гарч байгаагүй. */}
      <Panel title={tr('Багц бүрийн бүтээн байгуулалтын хэмжээ')}>
        <Data q={bagts} loading={tr('Татаж байна…')}>
          {(rows) => (
            <Bars
              inline
              selected={flt?.sec === 'scope' ? flt.key : null}
              onSelect={(key) => {
                const r = rows.find((x) => x.key === key);
                if (!r) return;
                onFlt({
                  sec: 'scope',
                  key,
                  label: tr('Багц: {0}', r.label),
                  where: bagtsWhereFrom(r, bagtsRawsLast ?? []),
                  bagtsRow: r,
                  only: ['mon:building'],
                  layers: ['mon:building'],
                });
              }}
              items={heatBars(rows, (r) => ({
                key: r.key,
                label: r.label,
                value: r.blocks,
                display: tr('{0} блок · {1} өрх', num(r.blocks), ailLabel([r])),
              }))}
            />
          )}
        </Data>
      </Panel>

      {/* ГҮЙЦЭТГЭГЧЭЭР — `contractor` нь `BagtsRow`-д татагддаг мөртлөө
          дашбоардын хаана ч зурагддаггүй байв. «Хэн барьж байна» гэдэг нь
          цар хүрээний асуултын салшгүй хэсэг. */}
      <Panel title={tr('Гүйцэтгэгчээр')} note={tr('багцын тоо')}>
        <Data q={bagts} loading={tr('Татаж байна…')}>
          {(rows) => {
            const m = new Map<string, number>();
            rows.forEach((r) => {
              const c = (r.contractor || '').trim();
              if (!c) return;
              m.set(c, (m.get(c) ?? 0) + 1);
            });
            const list = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
            return list.length ? (
              <Bars
                inline
                items={heatBars(list, ([label, n]) => ({
                  key: label,
                  label,
                  value: n,
                  display: tr('{0} багц', num(n)),
                }))}
              />
            ) : <Empty label={tr('Гүйцэтгэгч бүртгэгдээгүй')} />;
          }}
        </Data>
      </Panel>

      {/* НИЙГМИЙН БАЙГУУЛАМЖ — дээд зурваст нийт тоо (11 ш) л байсан; ямар
          төрлийн, ямар хүчин чадалтай нь задраагүй байв. */}
      <Panel title={tr('Нийгмийн байгууламж')} note={tr('төрлөөр · хүчин чадал')}>
        <Data q={d.social} loading={tr('Татаж байна…')}>
          {(sc) => (sc.rows.length ? (
            <Bars
              inline
              items={heatBars([...sc.rows].sort((a, b) => b.n - a.n), (r) => ({
                key: r.key,
                label: r.label,
                value: r.n,
                display: r.capacity ? `${num(r.n)} / ${num(r.capacity)}` : num(r.n),
              }))}
            />
          ) : <Empty label={tr('Бүртгэл алга')} />)}
        </Data>
      </Panel>

      {/* ТӨСӨВ АЖЛЫН ТӨРЛӨӨР — дээд зурваст төслийн НИЙТ төсөв гэсэн НЭГ тоо
          л байсан; тэр мөнгө ЮУНД зарцуулагдахыг задлаагүй байв. */}
      <Panel title={tr('Төсөв ажлын төрлөөр')} note={tr('₮')}>
        <Data q={d.budget} loading={tr('Татаж байна…')}>
          {(bg) => (bg.byType.length ? (
            <Bars
              inline
              items={heatBars(
                [...bg.byType].sort((x, y) => y.value - x.value).slice(0, 7),
                (x) => ({ key: x.key, label: x.label, value: x.value, display: mnt(x.value) }),
              )}
            />
          ) : <Empty label={tr('Төсвийн задаргаа алга')} />)}
        </Data>
      </Panel>

      {/* ТӨСӨВ БАГЦААР — аль багц хамгийн үнэтэй вэ. `byPkg` нь татагддаг
          мөртлөө дашбоардын хаана ч зурагддаггүй байв. */}
      <Panel title={tr('Төсөв багцаар')} note={tr('₮')}>
        <Data q={d.budget} loading={tr('Татаж байна…')}>
          {(bg) => (bg.byPkg.length ? (
            <Bars
              inline
              items={heatBars(
                [...bg.byPkg].sort((x, y) => y.value - x.value).slice(0, 8),
                (x) => ({ key: x.key, label: x.label, value: x.value, display: mnt(x.value) }),
              )}
            />
          ) : <Empty label={tr('Багцын задаргаа алга')} />)}
        </Data>
      </Panel>

      {/* ГҮЙЦЭТГЭГЧИЙН ХАРЬЯАЛАЛ — `origin` (Гадаад / Үндэсний) нь зөвхөн 04
          хэсгийн шошгонд орж байсан; цар хүрээнд «хэн барьж байна» гэдэг нь
          бие даасан асуулт. */}
      <Panel title={tr('Гүйцэтгэгчийн харьяалал')} note={tr('багцын тоо')}>
        <Data q={bagts} loading={tr('Татаж байна…')}>
          {(rows) => {
            const m = new Map<string, number>();
            rows.forEach((r) => {
              const o = (r.origin || '').trim();
              if (!o) return;
              m.set(o, (m.get(o) ?? 0) + 1);
            });
            const list = [...m.entries()].sort((a, b) => b[1] - a[1]);
            return list.length ? (
              <Donut
                size="lg"
                leaders={list.length <= 4}
                stack={list.length > 4}
                center={num(list.reduce((a, x) => a + x[1], 0))}
                centerLabel={tr('багц')}
                items={list.map(([label, n], i) => ({
                  key: label,
                  label: tr(label),
                  value: n,
                  color: cat(i),
                  display: tr('{0} багц', num(n)),
                }))}
              />
            ) : <Empty label={tr('Харьяалал бүртгэгдээгүй')} />;
          }}
        </Data>
      </Panel>

      {/* ГАЗАР ЧӨЛӨӨЛӨЛТИЙН ТӨЛӨВ — цар хүрээний хэсэгт «хэдэн га дээр ажиллаж
          болох вэ» гэдэг нь талбайн тооноос дутуугүй чухал. */}
      <Panel title={tr('Газар чөлөөлөлт')} note={tr('төлөв · га')}>
        <Data q={d.land} loading={tr('Татаж байна…')}>
          {(ls) => (
            <Bars
              inline
              items={heatBars([...ls.byStatus].sort((a, b) => b.areaM2 - a.areaM2), (x) => ({
                key: x.label,
                label: x.label,
                value: x.areaM2 / 10_000,
                display: tr('{0} га', num(x.areaM2 / 10_000, 1)),
              }))}
            />
          )}
        </Data>
      </Panel>
    </>
  );
}

/* ══════════════════ 02 · Master Schedule ══════════════════ */

/**
 * ЭХ СУРВАЛЖИЙН ШОШГО — самбарын `note`-д «энэ тоо ХААНААС гарав» гэдгийг ил
 * бичнэ.
 */
/*
 *    Өгөгдлийг УСТГАХ нь хэвээр ХЭРЭГЛЭГЧИЙН шийдвэр (`--wipe`) — энд зөвхөн
 *    шошгыг үнэн болгов. Устгасны дараа энэ шошгыг `SRC_NEGTGEL_REAL` болгож
 *    «туршилтын» гэсэн үгийг хасна.
 */
const SRC_NEGTGEL = () => tr('⚠ туршилтын өгөгдөл · багцын нэгтгэл');
/** Блокийн гүйцэтгэлийн («Гүйцэтгэл бөглөх» хуудас) эх сурвалжийн шошго */
const SRC_SHEET = () => tr('эх: бөглөх хуудас');
/** `note` + эх сурвалж. Функц дуудалт — хэлээ сольсны дараа дахин орчуулагдана */
const srcNote = (note: string, src: () => string) => `${note} · ${src()}`;

/** Обьёмын самбарын мөр — амьд хуудас (`PkgObyem`) эсвэл нэгтгэлийн (`/190`) нөөц */
type VolRow = { key: string; label: string; volume: number | null; volumePlan: number | null };
type VolData = { rows: VolRow[]; fallback: boolean };

/**
 * ОБЬЁМЫН ХОЁР САМБАРЫН ЭХ («Обьёмын биелэлт» · «Ажлын обьём»).
 */
function volAsync(vol: Async<Map<string, PkgObyem | null> | null>, neg: Async<PkgProgressRow[]>): Async<VolData> {
  const loading: Async<VolData> = { state: 'loading', data: null, error: null };
  const negRows = (): VolRow[] => (neg.state === 'ready' ? latestPkgProgress(neg.data) : [])
    .map((x) => ({ key: x.key, label: x.label, volume: x.volume, volumePlan: x.volumePlan }));
  if (vol.state === 'loading' || (vol.state === 'ready' && vol.data == null)) return loading;
  if (vol.state === 'error') {
    if (neg.state === 'ready') return { state: 'ready', data: { rows: negRows(), fallback: true }, error: null };
    return neg.state === 'error' ? { state: 'error', data: null, error: vol.error, retry: vol.retry } : loading;
  }
  const back = new Map(negRows().map((x) => [x.key, x]));
  const rows: VolRow[] = [];
  let fallback = false;
  for (const [k, v] of vol.data!) {
    if (v) { rows.push(v); continue; }
    const n = back.get(k);
    if (n) { rows.push(n); fallback = true; }
  }
  return { state: 'ready', data: { rows, fallback }, error: null };
}
/** Обьёмын самбарын эх шошго — нөөц (`/190`) орсон бол түүнийг ил хэлнэ */
const volSrc = (q: Async<VolData>) => (q.state === 'ready' && q.data.fallback ? SRC_NEGTGEL : SRC_SHEET);

/**
 * 02 · ХЭРЭГЖИЛТИЙН ЕРӨНХИЙ ГРАФИК.
 *
 * Хоёулаа «Гүйцэтгэл бөглөх» цонхоор ПОРТАЛААС бөглөгддөг тул тоо нь
 * бүртгэлтэй нэг агшинд таарна.
 */
function ScheduleDetail({ fin, prog, bagts, pkgProg, pkgVol }: {
  fin: Async<FinData>;
  prog: Async<BlockProgressMap>;
  bagts: Async<BagtsRow[]>;
  pkgProg: Async<PkgProgressRow[]>;
  pkgVol: Async<Map<string, PkgObyem | null> | null>;
}) {
  const f = fin.state === 'ready' ? fin.data : null;
  const vq = volAsync(pkgVol, pkgProg);
  const months = f ? aggregateMonths(f) : null;
  const lagSeries = months ? lagSeriesOf(months) : [];
  const scope = f ? contractedScope(f.contracts) : null;
  const scopeNote = f ? planScopeNote(projectPlanScope(f)?.excluded) : null;

  /**
   * «Одоо» хүртэлх сүүлийн бөглөгдсөн сарын төлөвлөгөө/биет.
   */
  const nowYm = monthKey();
  const lag = months ? lagOf(months) : null;
  const planned: number | null = lag ? lag.planned : null;
  const actual: number | null = f ? physNow(f, nowYm) : null;
  const wait = fin.state === 'loading';
  const dash = (v: number | null, s: (x: number) => string) => (v != null ? s(v) : wait ? '…' : '—');

  return (
    <>
      <Panel title={tr('Хэрэгжилтийн ерөнхий график')} note={tr('Cashflow_0909 · HO_guitsetgel · Гүйцэтгэл бөглөх')}>
        <Stats cols={2}>
          <Stat accent color={HUE[0]} value={dash(actual, (x) => num(x, 1))} unit="%" label={tr('Биет гүйцэтгэл')} />
          <Stat accent color={HUE[1]} value={dash(planned, (x) => num(x, 1))} unit="%" label={scopeNote ? tr('Төлөвлөсөн гүйцэтгэл (хуваарьтай багцаар)') : tr('Төлөвлөсөн гүйцэтгэл')} />
          <Stat
            accent
            color={HUE[2]}
            value={lag ? (lagJudged(lag) ? gapPtsWord(lag.gap) : '—') : wait ? '…' : '—'}
            label={(scopeNote ? tr('Гүйцэтгэлийн зөрүү (хуваарьтай багцаар)') : tr('Гүйцэтгэлийн зөрүү'))
              + (lag && !lagJudged(lag) && coverageNote(lag.coverage) ? ` · ${coverageNote(lag.coverage)}` : '')}
          />
          <Stat
            accent
            color={HUE[3]}
            value={f != null ? num([...f.phys.keys()].length) : wait ? '…' : '—'}
            unit={tr('багц')}
            label={tr('Тайлагнасан багц')}
          />
        </Stats>
      </Panel>


      {/* ТӨЛӨВЛӨГӨӨ vs ОЛГОСОН — санхүүгийн явц сараар */}
      <Panel title={tr('Санхүүжилт — сараар')} note={tr('төлөвлөгөө · олгосон ₮')}>
        <Data q={fin} loading={tr('Татаж байна…')}>
          {() => {
            const pts = (months ?? [])
              .filter((m) => m.label <= nowYm)
              .map((m) => ({ key: m.label, label: m.label.slice(2), value: m.given }));
            return pts.length >= 2
              ? <Series items={pts} height={110} unit="₮" line />
              : <Empty label={tr('Олголтын бүртгэл алга')} />;
          }}
        </Data>
      </Panel>

      {/* БЛОКИЙН ГҮЙЦЭТГЭЛИЙН ТАРХАЛТ — «дундаж 27.65%» нь тархалтыг нуудаг */}
      <Panel title={tr('Блокийн гүйцэтгэл')} note={tr('түвшнээр · блок (тайлангүй блок 0%)')}>
        <Data q={prog} loading={tr('Татаж байна…')}>
          {(pm) => {
            const counts = levelCounts(pm, bagts.state === 'ready' ? bagts.data : null);
            return counts.some((c) => c > 0) ? (
              <Bars
                inline
                items={heatBars(PROGRESS_LEVELS.map((l, i) => ({ l, n: counts[i] })), (x) => ({
                  key: x.l.key,
                  label: `${x.l.label} ${x.l.range}`,
                  value: x.n,
                  display: tr('{0} блок', num(x.n)),
                }))}
              />
            ) : <Empty label={tr('Гүйцэтгэл бүртгэгдээгүй')} />;
          }}
        </Data>
      </Panel>

      {/* БАГЦААР — биет гүйцэтгэлийн хамгийн сүүлийн утга */}
      <Panel title={tr('Багцаар — биет гүйцэтгэл')} note={srcNote(tr('сүүлийн бүртгэл'), SRC_SHEET)}>
        <Data q={fin} loading={tr('Татаж байна…')}>
          {(d) => {
            /* Багц бүрийн СҮҮЛИЙН бөглөгдсөн сарын биет % (-тэй ижил дүрэм) */
            const rows = pkgPhys(d, () => true).rows;
            return rows.length ? (
              <Bars
                inline
                max={100}
                items={heatBars(rows, (x) => ({
                  key: x.key,
                  label: tr(x.key),
                  value: x.pct,
                  display: pct(x.pct, 1),
                }))}
              />
            ) : <Empty label={tr('Багцын бүртгэл алга')} />;
          }}
        </Data>
      </Panel>

      {/* ХОЦОРСОН БЛОК — гүйцэтгэл 0 хэвээрх, айлын тоогоор жигнэсэн */}
      <Panel title={tr('Хоцорсон блок')} note={tr('гүйцэтгэл 0% (тайлангүй блок орно)')}>
        <Data q={prog} loading={tr('Татаж байна…')}>
          {(pm) => {
            const b = bagts.state === 'ready' ? bagts.data : null;
            const byPkg = zeroBlocksByPkg(pm, b);
            const list = [...byPkg.entries()]
              .map(([k, n]) => ({ key: k, label: b?.find((r) => r.key === k)?.label ?? k, n }))
              .sort((x, y) => y.n - x.n);
            return list.length ? (
              <Bars
                inline
                items={heatBars(list, (x) => ({
                  key: x.key,
                  label: tr(x.label),
                  value: x.n,
                  display: tr('{0} блок', num(x.n)),
                }))}
              />
            ) : <Empty label={tr('Хоцорсон блок алга')} />;
          }}
        </Data>
      </Panel>

      {/* ══ ТӨЛӨВЛӨГӨӨ vs БОДИТ — 02-ын ХУВААРИЙН КАРТУУД ══ */}

      {/* ТӨЛӨВЛӨГӨӨ vs БОДИТ — САРААР. Нэг муруй: сар бүрийн ТӨСЛИЙН биет % (ХО жинтэй,
          `aggregateMonths`). Төлөвлөгөө нь hover-ийн `display`-д хамт гарна — хоёр өнгийн
          муруй давхарлавал хэрэглэгч аль нь аль болохыг өнгөөр л таамаглана. */}
      <Panel
        title={tr('Төлөвлөгөө vs бодит — сараар')}
        note={srcNote(tr('төслийн биет % (ХО жинтэй)'), SRC_SHEET) + (scopeNote ? ` · ${scopeNote}` : '')}
      >
        <Data q={fin} loading={tr('Татаж байна…')}>
          {() => {
            const ms = (months ?? []).filter((m) => m.label <= nowYm);
            const plan = new Map(lagSeries.map((x) => [x.month, x.planned]));
            const pts = ms.map((m) => {
              const a = m.phys;
              const p = plan.get(m.label);
              return {
                key: m.label, label: m.label.slice(2), value: a,
                display: a == null
                  ? tr('мэдээлэлгүй')
                  : p == null ? pct(a, 1) : tr('{0} / төл. {1}', pct(a, 1), pct(p, 1)),
              };
            });
            return pts.filter((p) => p.value != null).length >= 2
              ? <Series items={pts} height={120} unit="%" line />
              : <Empty label={tr('Цуваа зурах бүртгэл алга')} />;
          }}
        </Data>
      </Panel>

      {/* ХОЦРОГДОЛ — багц бүрийн (төлөвлөгөө − бодит). «Хэн хоцорч байна»
          гэсэн асуултын шууд хариу; эерэг тоо нь хоцрогдол. */}
      <Panel title={tr('Төлөвлөгөөний хоцрогдол — багцаар')} note={srcNote(tr('төл. − бодит, %'), SRC_SHEET)}>
        <Data q={fin} loading={tr('Татаж байна…')}>
          {(fd) => {
            const b = bagts.state === 'ready' ? bagts.data : null;
            const rows = pkgLagRows(fd, (k) => b?.find((r) => r.key === k)?.label ?? k)
              .filter((x) => x.actual != null && x.planned != null)
              .map((x) => ({
                key: x.key, label: x.label,
                planned: x.planned as number, actual: x.actual as number,
                gap: (x.planned as number) - (x.actual as number),
              }))
              .sort((a, b2) => b2.gap - a.gap);
            return rows.length ? (
              <Bars
                inline
                items={heatBars(rows, (x) => ({
                  key: x.key,
                  label: tr(x.label),
                  /* Хэмжээс нь ХЭМЖЭЭ — урд явж буй багц (сөрөг зөрүү) 0 урттай */
                  value: Math.max(0, x.gap),
                  display: gapLabel(x.planned, x.actual),
                }))}
              />
            ) : <Empty label={tr('Бүртгэл хоосон байна.')} />;
          }}
        </Data>
      </Panel>

      {/* СҮҮЛИЙН САРЫН ӨСӨЛТ — багц бүрийн сүүлийн хоёр хэмжилтийн САРЫН зөрүү.
          Нийт % нь «хэр хол явсан»-ыг хэлдэг ч «одоо хөдөлж байна уу»-г
          хэлдэггүй: 80%-тай зогссон багц 40%-тай ажиллаж буйгаас муу. */}
      <Panel title={tr('Сүүлийн сарын өсөлт — багцаар')} note={srcNote(tr('сүүлийн хоёр хэмжилтийн зөрүү'), SRC_SHEET)}>
        <Data q={fin} loading={tr('Татаж байна…')}>
          {(fd) => {
            const b = bagts.state === 'ready' ? bagts.data : null;
            const rows: { key: string; label: string; d: number }[] = [];
            pkgLagRows(fd, (k) => b?.find((r) => r.key === k)?.label ?? k).forEach((x) => {
              const ms = x.months.filter((m) => m.label <= nowYm && m.phys != null);
              if (ms.length < 2) return;
              rows.push({ key: x.key, label: x.label, d: (ms[ms.length - 1].phys as number) - (ms[ms.length - 2].phys as number) });
            });
            rows.sort((a, b2) => b2.d - a.d);
            return rows.length ? (
              <Bars
                inline
                items={heatBars(rows, (x) => ({
                  key: x.key,
                  label: tr(x.label),
                  value: Math.max(0, x.d),
                  display: ptsFmt(x.d),
                }))}
              />
            ) : <Empty label={tr('Харьцуулах хоёр дахь бүртгэл алга')} />;
          }}
        </Data>
      </Panel>

      {/* ТАЙЛАГНАСАН БЛОК — багц бүрийн НИЙТ блокоос хэд нь гүйцэтгэлээ
          бүртгүүлсэн бэ. */}
      <Panel title={tr('Тайлагнасан блок — багцаар')} note={tr('бүртгэлтэй / нийт блок')}>
        <Data q={prog} loading={tr('Татаж байна…')}>
          {() => {
            const b = bagts.state === 'ready' ? bagts.data : null;
            if (!b) return <Empty label={tr('Багцын бүртгэл алга')} />;
            const rows = b
              .map((r) => ({ key: r.key, label: r.label, n: r.measured, all: r.total }))
              .sort((x, y) => y.n / Math.max(1, y.all) - x.n / Math.max(1, x.all));
            return rows.length ? (
              <Bars
                inline
                max={100}
                items={heatBars(rows, (x) => ({
                  key: x.key,
                  label: tr(x.label),
                  value: x.all ? (x.n / x.all) * 100 : null,
                  display: tr('{0} / {1} блок', num(x.n), num(x.all)),
                }))}
              />
            ) : <Empty label={tr('Багцын бүртгэл алга')} />;
          }}
        </Data>
      </Panel>

      {/* ══ ХУВААРИЙН ДӨРВӨН НЭМЭЛТ ЗҮСЭЛТ ══
          Бүгд аль хэдийн ачаалагдсан `fin` ба `pkgProg`-оос — ШИНЭ ХҮСЭЛТГҮЙ. */}

      {/* САНХҮҮЖИЛТИЙН ХУРИМТЛАЛ — дээрх «Санхүүжилт — сараар» нь САР ТУТМЫН
          олголтыг харуулдаг: тэр нь сарын хэлбэлзлийг сайн заадаг ч «төлөвлөсөн
          санхүүжилтийн хэдэн хувийг олгосон бэ» гэсэн асуултад хариулдаггүй.
          Хуримтлагдсан муруй нь төлөвлөгөөт хуваарийн эсрэг байрлалыг шууд
          харуулна. */}
      <Panel title={tr('Санхүүжилтийн хуримтлал — сараар')} note={tr('олгосон / гэрээний нийт дүн')}>
        <Data q={fin} loading={tr('Татаж байна…')}>
          {() => {
            const ms = (months ?? []).filter((m) => m.label <= nowYm);
            const sc = scope;
            const planTotal = sc?.amount ?? 0;
            if (!f || !sc || !planTotal || ms.length < 2) return <Empty label={tr('Олголтын бүртгэл алга')} />;
            const scKeys = new Set([...sc.keys].map(finPkgKey));
            let givenAll = 0;
            f.givenTotal.forEach((v, k) => { if (scKeys.has(finPkgKey(k))) givenAll += v; });
            let dated = 0;
            const givenByMon = new Map<string, number>();
            f.given.forEach((byMon, k) => {
              if (!scKeys.has(finPkgKey(k))) return;
              byMon.forEach((v, mon) => {
                dated += v;
                givenByMon.set(mon, (givenByMon.get(mon) ?? 0) + v);
              });
            });
            const undated = Math.max(0, givenAll - dated);
            let cum = 0;
            const pts = ms.map((m, i) => {
              cum += givenByMon.get(m.label) ?? 0;
              const tail = i === ms.length - 1 && undated > 0.5;
              const v = ((tail ? cum + undated : cum) / planTotal) * 100;
              return {
                key: m.label,
                label: m.label.slice(2),
                value: v,
                display: tail ? tr('{0} · огноогүй олголт багтсан', pct(v, 1)) : pct(v, 1),
              };
            });
            return <Series items={pts} height={120} unit="%" line />;
          }}
        </Data>
      </Panel>

      {/* ХОЦРОГДЛЫН ӨӨРЧЛӨЛТ — «одоо хэдэн хувь хоцорч байна» гэдгээс илүү
          чухал асуулт нь «зөрүү ӨСӨЖ байна уу, буурч байна уу». Нэг агшны
          зөрүү нь чиглэлийг хэлдэггүй: 20% хоцрогдол буурч байгаа нь 10%
          хоцрогдол өсөж байгаагаас дээр. */}
      <Panel
        title={tr('Хоцрогдлын өөрчлөлт — сараар')}
        note={srcNote(tr('төл. − бодит, төслийн % (ХО жинтэй)'), SRC_SHEET) + (scopeNote ? ` · ${scopeNote}` : '')}
      >
        <Data q={fin} loading={tr('Татаж байна…')}>
          {() => {
            const lagMap = new Map(lagSeries.filter((x) => lagJudged(x)).map((x) => [x.month, x]));
            const pts = (months ?? []).filter((m) => m.label <= nowYm).map((m) => {
              const x = lagMap.get(m.label) ?? null;
              return {
                key: m.label,
                label: m.label.slice(2),
                /* Сөрөг зөрүү (төлөвлөгөөнөөс УРД) 0 болно — багана сөрөг урттай
                   байж чадахгүй тул тэмдгийг `display` барина. */
                value: x ? Math.max(0, x.gap) : null,
                display: x ? gapLabel(x.planned, x.actual) : tr('мэдээлэлгүй'),
              };
            });
            return pts.filter((p) => p.value != null).length >= 2
              ? <Series items={pts} height={120} unit="%" />
              : <Empty label={tr('Цуваа зурах бүртгэл алга')} />;
          }}
        </Data>
      </Panel>

      {/* ЭЗЛЭХҮҮНИЙ БИЕЛЭЛТ — гүйцэтгэлийн % нь ЖИНГЭЭР бодогдсон нэгтгэсэн тоо;
          эзлэхүүн нь БИЕТ хэмжигдэхүүн (м³, м²). Хоёр нь зөрвөл аль нэг нь
          буруу бүртгэгдсэн гэсэн үг — тиймээс тусад нь харуулах нь хяналтын
          утга. */}
      <Panel title={tr('Обьёмын биелэлт — багцаар')} note={srcNote(tr('бодит / төлөвлөгөөт обьём'), volSrc(vq))}>
        <Data q={vq} loading={tr('Татаж байна…')}>
          {({ rows: list }) => {
            const rows = list
              .filter((x) => (x.volumePlan ?? 0) > 0)
              .map((x) => ({
                key: x.key,
                label: x.label,
                pct: x.volume == null ? null : (x.volume / (x.volumePlan as number)) * 100,
                v: x.volume,
                p: x.volumePlan as number,
              }))
              .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
            return rows.length ? (
              <Bars
                inline
                max={100}
                items={heatBars(rows, (x) => ({
                  key: x.key,
                  label: tr(x.label),
                  value: x.pct ?? null,
                  display: x.pct == null
                    ? tr('{0} · {1} / {2}', tr('мэдээлэлгүй'), num(x.v), num(x.p))
                    : tr('{0} · {1} / {2}', pct(x.pct, 1), num(x.v), num(x.p)),
                }))}
              />
            ) : <Empty label={tr('Обьём бүртгэгдээгүй.')} />;
          }}
        </Data>
      </Panel>

      {/* ТАЙЛАГНАЛЫН ИДЭВХ — сар бүр ХЭДЭН багц бүртгэл оруулсан бэ. Цуваа
          тасарвал дүн «тогтсон» мэт харагдана — үнэндээ хэн ч тайлагнаагүй
          байхад. Энэ карт тэр хоёрыг ялгана. */}
      <Panel title={tr('Тайлагналын идэвх — сараар')} note={srcNote(tr('бүртгэл оруулсан багц'), SRC_SHEET)}>
        <Data q={fin} loading={tr('Татаж байна…')}>
          {(fd) => {
            const m = new Map<string, Set<string>>();
            fd.phys.forEach((byMon, k) => byMon.forEach((_, ym) => {
              if (ym > nowYm) return;
              const s2 = m.get(ym) ?? new Set<string>();
              s2.add(k);
              m.set(ym, s2);
            }));
            const pts = cfMonthAxis()
              .filter((ym) => ym <= nowYm)
              .map((ym) => {
                const n = m.get(ym)?.size ?? 0;
                return {
                  key: ym,
                  label: ym.slice(2),
                  value: n,
                  display: tr('{0} багц', num(n)),
                };
              });
            return pts.length >= 2
              ? <Series items={pts} height={110} unit={tr('багц')} />
              : <Empty label={tr('Цуваа зурах бүртгэл алга')} />;
          }}
        </Data>
      </Panel>
    </>
  );
}


/* ══════════════════ 03 · Орон сууцны 7 багц ══════════════════ */

const HUE = shades(CAT_LIGHT[0], 8);
/**
 * ДАШБОАРДЫН НЭГ ӨНГӨ — бүх багана/зүсмэг энэ sky акцентын ТОДООС БҮДГЭР
 * уусгалтаар өнгөтэй (хэрэглэгчийн хүсэлт: солонго биш нэг өнгө). Их утга тод,
 * бага утга бүдэг. `heat(v, max)` нь энэ дүрмийг чартад хэрэглэнэ.
 */
const ACCENT = 'var(--c1)';
/**
 * Утга → нэг өнгөний сүүдэр (их=тод). max≤0 бол суурь өнгө.
 */
const heat = (v: number, max: number) => {
  const f = max > 0 ? Math.max(0, Math.min(1, v / max)) : 1;
  return `color-mix(in srgb, var(--c1) ${Math.round(28 + 72 * f)}%, var(--surface))`;
};

/* ══════════════════ Нийтлэг render хэрэгсэл ══════════════════ */

/**
 * Ring + Stats нүдний НЭГДСЭН толгой — 03/04-д гараар бичигдсэн `o.landTop`
 * бүтэц. Одоо 01, 02, 05, 06, 09 ч хэрэглэнэ тул ГАНЦ компонент болов.
 */
/**
 * БӨГЖНИЙ ТУСДАА КАРТ — газрын зургийн ДЭЭРХ тоонуудын зурваст дугуй диаграм
 * байх нь эгнээний өндрийг тэлж, тоонуудын нэгдмэл шугамыг эвддэг тул бөгж
 * ӨӨРИЙН `Panel`-д, картын дарааллын СҮҮЛД тавигдана — `zones` нь эхний
 * картыг дээд зурваст, үлдсэнийг хажуугийн багануудад тараадаг.
 */
function RingCard({ value, label, color = ACCENT, decimals }: {
  value: number | null | undefined;
  label: string;
  color?: string;
  decimals?: number;
}) {
  return (
    <div className={o.ringCard}>
      <Ring value={value} size="md" color={color} label={label} decimals={decimals} />
    </div>
  );
}


/** Bars-ын items — `heat()` өнгө нь ЖАГСААЛТЫН дээд утгаар нормчилогдоно */

/**
 * БАГЦЫН БИЕТ ГҮЙЦЭТГЭЛ — «одоо» хүртэлх сүүлийн бөглөгдсөн сарын утга.
 */
/**
 * БЛОКИЙН ТҮВШНИЙ ТООЛОЛ (0–25 · 25–50 · …) — хуваарь нь бөглөх хуудасны БҮХ блок
 * (`BagtsRow.keys`) ∪ хэмжигдсэн түлхүүр; тайлагнаагүй блок 0%-ийн түвшинд.
 */
function levelCounts(pm: BlockProgressMap, rows: readonly BagtsRow[] | null): number[] {
  return levelCountsOf(pm, rows ? rows.flatMap((r) => r.keys) : []);
}

/**
 * БАГЦ БҮРИЙН 0%-ИЙН БЛОК — хэмжилт 0 ЭСВЭЛ огт тайлагнаагүй (2026-10-04, `levelCounts`).
 * `rows` уншигдаагүй бол зөвхөн хэмжигдсэн 0%-ийн блок.
 */
function zeroBlocksByPkg(pm: BlockProgressMap, rows: readonly BagtsRow[] | null): Map<string, number> {
  const keys = new Set<string>(rows ? rows.flatMap((r) => r.keys) : []);
  pm.forEach((_, k) => keys.add(k));
  const byPkg = new Map<string, number>();
  keys.forEach((k) => {
    const v = pm.get(k)?.overall;
    if (v != null && Number.isFinite(v) && v > 0) return;
    const pkg = k.split('|')[0] ?? '';
    byPkg.set(pkg, (byPkg.get(pkg) ?? 0) + 1);
  });
  return byPkg;
}

/** Багц бүрийн төлөвлөгөө / бодит / хоцрогдол — `pkgLagRows`-ийн мөр */
type PkgLagRow = {
  key: string;
  label: string;
  /** Сүүлийн биет % (`Finance.physLatest`) — хэмжилтгүй бол `null` */
  actual: number | null;
  /** Хэмжилтийн өдрийн төлөвлөгөө (`Finance.lagOf`) — хуваарь эхлээгүй/алга бол `null` */
  planned: number | null;
  /** Хэмжилтийн сарууд (`pkgMonthsMap`) — сүүлийн 2 хэмжилтийн өсөлтөд */
  months: MonthPt[];
};

/**
 * ОРОН СУУЦНЫ БАГЦ БҮРИЙН ТӨЛӨВЛӨГӨӨ vs БОДИТ — «Гүйцэтгэл» (PkgProg) · «ТУХ»-тай ЯГ НЭГ эх:
 * `Finance.pkgMonthsMap` → `physLatest` (бодит, тайлангүй блок 0%) · `lagOf` (хуваарийн муруй,
 * хэмжилтийн өдрөөр). Хамрах хүрээ = биет хэмжилттэй ∪ бөглөх хуудастай (`physN`) багц.
 */
function pkgLagRows(f: FinData, labelOf: (k: string) => string): PkgLagRow[] {
  const mm = pkgMonthsMap(f);
  const keys = new Set<string>([...f.phys.keys(), ...(f.physN?.keys() ?? [])]);
  const out: PkgLagRow[] = [];
  keys.forEach((k) => {
    const months = mm.get(k);
    if (!months) return;
    const lag = lagOf(months);
    out.push({ key: k, label: labelOf(k), actual: physLatest(months), planned: lag && lagJudged(lag) ? lag.planned : null, months });
  });
  return out.sort((a, b) => a.label.localeCompare(b.label, 'mn'));
}

function pkgPhys(f: FinData | null, match: (k: string) => boolean): {
  /** Блокоор жигнэсэн дундаж % (тайлагнаагүй бол `null`) */
  actual: number | null;
  /** ЖИГНЭСЭН дунджид орсон багцын тоо (жинтэй тайлагнасан + тайлагнаагүй 0%) — 2026-10-09 */
  packs: number;
  /** Багц бүрийн сүүлийн % — жагсаалтад */
  rows: { key: string; pct: number }[];
} {
  if (!f) return { actual: null, packs: 0, rows: [] };
  const nowYm = monthKey();
  const rows: { key: string; pct: number }[] = [];
  let w = 0; let n = 0;
  /** Жинтэй ТАЙЛАГНАСАН багцын тоо ба дунджид орсон бүх багцын тоо (2026-10-09) */
  let wPacks = 0; let packs = 0;
  f.phys.forEach((byMon, k) => {
    if (!match(k)) return;
    let last: number | null = null;
    let lastMon = '';
    [...byMon.entries()].sort(([x], [y]) => x.localeCompare(y)).forEach(([m, v]) => {
      if (m <= nowYm) { last = v; lastMon = m; }
    });
    if (last == null) return;
    rows.push({ key: k, pct: last });
    const cntMap = f.physCnt.get(k);
    const cnt = cntMap?.get(lastMon) ?? cntMap?.get(nowYm);
    if (cnt == null) return;
    w += last * cnt; n += cnt;
    wPacks += 1; packs += 1;
  });
  f.physN?.forEach((cnt, k) => {
    if (!match(k) || f.phys.get(k)?.size) return;
    rows.push({ key: k, pct: 0 });
    n += cnt;
    packs += 1;
  });
  return {
    actual: wPacks > 0 && n > 0 ? w / n : null,
    packs: wPacks > 0 ? packs : 0,
    rows: rows.sort((a, b) => b.pct - a.pct),
  };
}

/**
 * ЗӨРҮҮНИЙ ШОШГО — (төлөвлөсөн − бодит), нэгж хувь.
 */
const gapLabel = (planned: number, actual: number, d = 1): string => gapPtsWord(planned - actual, d);

function heatBars<T>(
  rows: readonly T[],
  m: (r: T) => { key: string; label: string; value: number | null; display?: string },
): { key: string; label: string; value: number | null; display?: string; color: string }[] {
  const items = rows.map(m);
  const mx = maxOf(items.flatMap((i) => (i.value != null && Number.isFinite(i.value) ? [i.value] : [])));
  return items.map((i) => ({ ...i, color: i.value == null || !Number.isFinite(i.value) ? NO_DATA : heat(i.value, mx) }));
}


/** Багцын гэр бүлийн нэр — `PKG_HUE`-ийн тайлбар мөрүүдтэй ижил ангилал */
const FAMILY_LABEL: Record<PkgFamily, string> = {
  get net() { return tr('Гадна дулаан, ус (Багц 5)'); },
  get pow() { return tr('Цахилгаан, ХТП/РП (Багц 6)'); },
  get src() { return tr('Эх үүсвэр, магистраль (Багц 7–15)'); },
  get site() { return tr('Өндөржилт, тохижилт (Багц 16–18)'); },
  get soc() { return tr('Нийгмийн барилга (Багц 19–21)'); },
  get com() { return tr('Холбоо, дохиолол (Багц 1–4)'); },
};
/** Гэр бүл → ялгаатай БАГЦЫН тоо (давхаргын тоо БИШ: 6.5 нь трасс+цэг = 2 давхарга) */
const familyPacks = (f: PkgFamily): string[] =>
  [...new Set((PKG_BY_FAMILY[f] ?? []).map((id) => bagtsKey(LAYER_BY_ID[id]?.note)))].filter(Boolean);

function BagtsDetail({ q, prog, hist, pkgProg, pkgVol, fin, flt, onFlt }: {
  q: Async<BagtsRow[]>;
  /** 2026-10-04: «Төлөвлөгөө vs бодит — багцаар» — PkgProg/ТУХ-тай нэг эх (`pkgLagRows`) */
  fin: Async<FinData>;
  prog: Async<BlockProgressMap>;
  hist: Async<BlockHistory>;
  pkgProg: Async<PkgProgressRow[]>;
  pkgVol: Async<Map<string, PkgObyem | null> | null>;
} & FltProps) {
  const sel = flt?.sec === 'bagts' ? flt.key : null;
  const vq = volAsync(pkgVol, pkgProg);
  if (q.state !== 'ready') {
    return (
      <Panel title={tr('Багцын мэдээлэл')}>
        <Data q={q} loading={tr('Гурван эх сурвалжийг нэгтгэж байна…')}>{() => null}</Data>
      </Panel>
    );
  }
  const rows = q.data;
  const blocks = sumBy(rows, (x) => x.blocks);
  const ail = ailLabel(rows);
  // Хамгийн сүүлийн бүртгэлийн огноо — `BlockProgress.date` нь `joinBagts`-д
  // ХАЯГДДАГ тул `prog`-оос шууд. Ингэснээр «энэ тоо ХЭЗЭЭНИЙ байдлаар» гэсэн
  // асуулт самбар дээрээ хариултаа авна.
  const pm = prog.state === 'ready' ? prog.data : null;
  const scopeKeys = rows.flatMap((r) => r.keys);
  const ring = pm ? latestMean(pm, scopeKeys) : null;
  const avg = ring?.pct ?? null;
  const asOf = pm ? [...pm.values()].reduce((a, c) => (c.date > a ? c.date : a), '') : '';
  /** Багц дарахад — газрын зурагт тэр багцын блокуудыг тодруулна */
  const pick = (key: string) => {
    const r = rows.find((x) => x.key === key);
    if (!r) return;
    onFlt({
      sec: 'bagts', key, label: tr('Багц: {0}', r.label),
      where: bagtsWhereFrom(r, bagtsRawsLast ?? []), bagtsRow: r, only: ['mon:building'],
    });
  };
  return (
    <>
      <Panel title={tr('Нийт гүйцэтгэл')} note={tr('дундаж = бүх блокоор (тайлангүй блок 0%)')}>
          <Stats cols={2}>
            <Stat accent color={cat(0)} value={num(blocks)} unit={tr('блок')} label={tr('Барилгын блок')} />
            <Stat accent color={cat(3)} value={ail} unit={tr('өрх')} label={tr('Орон сууц')} />
            <Stat accent color={sumBy(rows, (r) => r.missing) ? 'var(--bad)' : NO_DATA}
                  value={num(sumBy(rows, (r) => r.missing))} unit={tr('блок')} label={tr('Тайлан ирээгүй')} />
            <Stat value={asOf || '—'} label={tr('Сүүлийн бүртгэл')} />
          </Stats>
      </Panel>

      <Panel title={tr('Блокийн дундаж гүйцэтгэл')}
             note={ring && ring.total ? tr('{0}/{1} блок тайлагнасан', num(ring.blocks), num(ring.total)) : undefined}>
        <RingCard value={avg} label={tr('блокийн дундаж')} color={cat(0)} />
      </Panel>

      <Panel title={tr('Багц бүрийн явц')} note={SRC_SHEET()}>
        <Bars
          inline
          max={100}
          selected={sel}
          onSelect={pick}
          items={rows.map((r) => ({
            key: r.key,
            label: r.label,
            value: r.progress ?? null,
            display: pct(r.progress, 1),
            color: r.progress == null ? NO_DATA : heat(r.progress, 100),
          }))}
        />
      </Panel>

      {/* ДЭД ҮЕ ШАТ Б1–Б5 — `BlockProgress.phases` нь `blockProgress.ts`-д
          задарч бодогдоод `joinBagts`-д хаягддаг байв. «Барилга бүтэн 18%»
          гэдгээс «дотор нь ЯМАР ажил хоцорсон» нь хамаагүй ашигтай. */}
      <Panel title={tr('Дэд үе шатын гүйцэтгэл (Б1–Б5)')}
             note={tr('тайлагнасан блокоор дундажлав')}>
        {pm == null ? <Pending failed={prog.state === 'error'} label={tr('Гүйцэтгэлийн хүснэгт татагдаж байна…')} /> : (() => {
          // Багц сонгосон бол ТЭР багцаар (cross-filter), эс бөгөөс 7 багц бүгд.
          const scope = new Set(rows.filter((r) => !sel || r.key === sel).flatMap((r) => r.keys));
          const ph = [...pm].filter(([k]) => scope.has(k)).flatMap(([, c]) => c.phases);
          const items = TASK_SHEET.subPhaseNos.map((no) => {
            // Нэрийг ХҮСНЭГТЭЭС — гар аргаар бичихгүй (эх excel-ийн нэр л үнэн)
            const nm = ph.find((x) => x.no === no && x.name)?.name ?? '';
            const hit = ph.filter((x) => x.no === no && x.pct != null);
            // Эх excel өөрөө дэд үе шатын жингээр бодсон тул ЭНД дахин жигнэхгүй
            const v = hit.length ? sumBy(hit, (x) => x.pct as number) / hit.length : null;
            return {
              nm, key: no, label: `${no} · ${nm}`, value: v,
              display: v == null ? tr('бөглөгдөөгүй') : tr('{0} · {1} блок', pct(v, 1), num(hit.length)),
              color: v == null ? NO_DATA : heat(v, 100),
            };
          })
            .filter((x) => x.nm !== '');
          return items.length
            ? <Bars inline max={100} items={items} />
            : <Empty label={tr('Дэд үе шатын задаргаа бөглөгдөөгүй')} />;
        })()}
      </Panel>

      <Panel title={tr('Багц бүрийн орон сууц')}>
        <Bars
          inline
          selected={sel}
          onSelect={pick}
          items={rows.map((r) => {
            const t = ailTotal([r]);
            return {
              key: r.key,
              label: r.label,
              value: t.ail,
              display: tr('{0} өрх', ailLabel([r])),
              color: t.ail == null ? NO_DATA : heat(t.ail, maxOf(rows.map((x) => x.ail))),
            };
          })}
        />
      </Panel>

      <Panel title={tr('Барилга угсралтын явц')} note={tr('сараар · бүх блокийн сүүлийн утгаар (тайлангүй блок 0%)')}>
        <Data q={hist} loading={tr('Бүртгэлийн түүхийг уншиж байна…')}>
          {(h) => (
            <Trend
              color="var(--c1)"
              points={progressSeries(
                h,
                scopeKeys,
                'month',
                'latest',
              ).map((p) => ({
                label: p.label,
                value: p.overall,
                // Сарын шошго бодит хэмжилтийн огноог нуудаг — уншилтын мөрөнд буцаана
                note: p.label === p.date
                  ? tr('{0} блок', num(p.blocks))
                  : tr('{0} · {1} блок', p.date, num(p.blocks)),
              }))}
            />
          )}
        </Data>
      </Panel>

      {/* «Багц бүрийн төсөв» panel 2026-08-13-нд хасагдав — BUS_cashflow
          үйлчилгээ устаж, багцын төсвийн бодит эх сурвалж алга. */}
      {/* ГҮЙЦЭТГЭГЧИЙН БҮРЭЛДЭХҮҮН — амьд (блок/өрхөөс), BAGTS_ORIGIN нь
          зөвхөн Гадаад/Үндэсний гэсэн ангилал (тоо биш). */}
      <Panel title={tr('Гүйцэтгэгчийн бүрэлдэхүүн')}>
        {(() => {
          const nat = rows.filter((r) => BAGTS_ORIGIN[r.label.trim()] === 'Үндэсний');
          const natBlocks = sumBy(nat, (x) => x.blocks);
          const natT = ailTotal(nat);
          const allT = ailTotal(rows);
          const natAil = natT.partial || natT.ail == null ? null : natT.ail;
          const allBlocks = sumBy(rows, (x) => x.blocks);
          const allAil = allT.partial || allT.ail == null ? null : allT.ail;
          const p100 = (a: number | null, b: number | null): number | null => (a != null && b ? Math.round((a / b) * 100) : null);
          return (
            <>
              <Stats cols={3}>
                <Stat accent color={HUE[0]} value={pct(p100(nat.length, rows.length), 0)}
                  label={tr('Үндэсний багц ({0}/{1})', num(nat.length), num(rows.length))} />
                <Stat accent color={HUE[1]} value={pct(p100(natBlocks, allBlocks), 0)}
                  label={tr('Блокийн эзлэх ({0}/{1})', num(natBlocks), num(allBlocks))} />
                <Stat accent color={HUE[2]} value={pct(p100(natAil, allAil), 0)}
                  label={tr('Өрхийн эзлэх ({0}/{1})', ailLabel(nat), ailLabel(rows))} />
              </Stats>
            </>
          );
        })()}
      </Panel>

      {/* ТӨЛӨВЛӨГӨӨ vs БОДИТ — багцаар. 2026-10-04: хуваарийн муруй (`lagOf`) + бөглөх
          хуудасны биет % (`physLatest`) — «нэгтгэл бол төлөвлөгөөний ЦОРЫН ГАНЦ эх» гэсэн
          хуучин тэмдэглэл ХҮЧИНГҮЙ (хуваарийн муруй 2026-09-04-нөөс бий). */}
      <Panel title={tr('Төлөвлөгөө vs бодит — багцаар')} note={srcNote(tr('биет · хуваарийн төлөвлөгөө'), SRC_SHEET)}>
        <Data q={fin} loading={tr('Татаж байна…')}>
          {(fd) => {
            const withPlan = pkgLagRows(fd, (k) => rows.find((r) => r.key === k)?.label ?? k)
              .filter((x) => x.actual != null || x.planned != null);
            if (!withPlan.length) return <Empty label={tr('Бүртгэл хоосон байна.')} />;
            return (
              <Bars
                inline
                max={100}
                items={heatBars(withPlan, (x) => ({
                  key: x.key,
                  label: tr(x.label),
                  value: x.actual,
                  display: x.planned == null
                    ? pct(x.actual, 1)
                    : tr('{0} / төл. {1}', pct(x.actual, 1), pct(x.planned, 1)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* ЭЗЛЭХҮҮН — багц бүрийн бодит/төлөвлөгөөт ажлын эзлэхүүн. */}
      <Panel title={tr('Ажлын обьём — багцаар')} note={srcNote(tr('биелэлтийн % · бодит / төлөвлөгөө'), volSrc(vq))}>
        <Data q={vq} loading={tr('Татаж байна…')}>
          {({ rows: list }) => {
            const withVol = list
              .filter((x) => (x.volume ?? 0) > 0 || (x.volumePlan ?? 0) > 0)
              .map((x) => ({
                ...x,
                vp: x.volume != null && (x.volumePlan ?? 0) > 0
                  ? (x.volume / (x.volumePlan as number)) * 100
                  : null,
              }))
              .sort((a, b) => (b.vp ?? -1) - (a.vp ?? -1));
            if (!withVol.length) return <Empty label={tr('Обьём бүртгэгдээгүй.')} />;
            const raw = (v: number | null) => (v == null ? tr('мэдээлэлгүй') : num(v));
            return (
              <Bars
                inline
                max={100}
                items={withVol.map((x) => ({
                  key: x.key,
                  label: tr(x.label),
                  value: x.vp ?? null,
                  display: (x.volumePlan ?? 0) > 0
                    ? tr('{0} · {1} / {2}', x.vp == null ? tr('мэдээлэлгүй') : pct(x.vp, 1), raw(x.volume), num(x.volumePlan))
                    : tr('{0} · төлөвлөгөөгүй', raw(x.volume)),
                  color: x.vp == null ? NO_DATA : heat(x.vp, 100),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* БЛОКИЙН ТАРХАЛТ — «дундаж 27.6%» гэсэн нэг тоо нь 113 блок дунджаараа
          явж байгаа мэт сэтгэгдэл төрүүлдэг; бодит тархалт өөр. */}
      <Panel title={tr('Блокийн гүйцэтгэл — түвшнээр')} note={tr('блокийн тоо (тайлангүй блок 0%)')}>
        <Data q={prog} loading={tr('Татаж байна…')}>
          {(pm) => {
            const counts = levelCounts(pm, rows);
            return counts.some((c) => c > 0) ? (
              <Bars
                inline
                items={heatBars(PROGRESS_LEVELS.map((l, i) => ({ l, n: counts[i] })), (x) => ({
                  key: x.l.key,
                  label: `${x.l.label} ${x.l.range}`,
                  value: x.n,
                  display: tr('{0} блок', num(x.n)),
                }))}
              />
            ) : <Empty label={tr('Гүйцэтгэл бүртгэгдээгүй')} />;
          }}
        </Data>
      </Panel>

      {/* ТАЙЛАГНАЛТЫН БҮРЭН БАЙДАЛ — багц бүрд хэдэн блок тайлангүй үлдсэн.
          `missing` нь дээд зурваст НИЙЛБЭР болж л гардаг байв. */}
      <Panel title={tr('Тайлангүй блок — багцаар')} note={tr('бүртгэгдээгүй')}>
        {(() => {
          const list = rows
            .map((r) => ({ key: r.key, label: tr(r.label), n: r.missing ?? 0 }))
            .filter((x) => x.n > 0)
            .sort((a2, b2) => b2.n - a2.n);
          return list.length ? (
            <Bars
              inline
              items={heatBars(list, (x) => ({
                key: x.key,
                label: x.label,
                value: x.n,
                display: tr('{0} блок', num(x.n)),
              }))}
            />
          ) : <Empty label={tr('Бүх блок тайлагнасан')} />;
        })()}
      </Panel>

      <Panel title={tr('Багц бүрийн гүйцэтгэгч')}>
        <Rows
          items={rows.map((r) => ({
            key: `${tr(r.label)} · ${tr(r.origin)}`,
            value: tr(r.contractor),
          }))}
        />
      </Panel>
    </>
  );
}

/* ══════════════════ 04 · Газар чөлөөлөлт ══════════════════ */


function LandDetail({ parcels, land, flt, onFlt }: {
  parcels: Async<Row[]>; land: Async<LandStatus>;
} & FltProps) {
  const sel = flt?.sec === 'land' ? flt.key : null;
  const selSt = sel?.startsWith('st:') ? sel : null;
  const selHa = sel?.startsWith('ha:') ? sel : null;
  const selReason = sel && !/^(st|ha):/.test(sel) ? sel : null;

  return (
    <>
      <Panel title={tr('Нэгж талбарын гүйцэтгэл')}>
        <Data q={land} loading={tr('Татаж байна…')}>
          {(ls) => (
            <>
                <Stats cols={3}>
                  <Stat accent color={HUE[0]} value={num(ls.total)} unit={tr('талбар')} label={tr('Нийт нэгж талбар')} />
                  <Stat accent color={PARCEL_STATUS_HUES[PARCEL_CLEARED]} value={num(ls.cleared)} unit={tr('талбар')} label={tr('Бүрэн чөлөөлсөн')} />
                  <Stat accent color="var(--bad)" value={num(ls.remaining)} unit={tr('талбар')} label={tr('Чөлөөлөгдөөгүй')} />
                </Stats>
            </>
          )}
        </Data>
      </Panel>

      <Panel title={tr('Нэгж талбар — төлөвөөр')}>
        <Data q={land} loading={tr('Татаж байна…')}>
          {(ls) => (
            <Bars
              inline
              selected={selSt}
              onSelect={(k) => {
                const label = k.slice(3);
                onFlt({
                  sec: 'land',
                  key: k,
                  label: tr('Төлөв: {0}', tr(label)),
                  where: statusWhere(label, parcels.state === 'ready' ? parcels.data : null),
                  only: ['land:left'],
                });
              }}
              items={heatBars([...ls.byStatus].sort((a, b) => b.n - a.n), (x) => ({
                key: 'st:' + x.label,
                label: x.label,
                value: x.n,
                display: tr('{0} талбар', num(x.n)),
              }))}
            />
          )}
        </Data>
      </Panel>

      <Panel title={tr('Чөлөөлөлтийн хувь')}>
        <Data q={land} loading={tr('Татаж байна…')}>
          {(ls) => <RingCard value={ls.pct} label={tr('чөлөөлсөн')} color="var(--good)" />}
        </Data>
      </Panel>

      <Panel title={tr('Нэгж талбарын тоон тойм')} note={tr('кадастр')}>
        <Data q={land} loading={tr('Татаж байна…')}>
          {(ls) => (
            <>
              <Rows
                items={[
                  { key: tr('Чөлөөлөлтийн хувь'), value: pct(ls.pct, 2) },
                  { key: tr('Шийдэгдсэн талбар'), value: tr('{0} / {1}', num(ls.resolved), num(ls.total)) },
                  { key: tr('Бүрэн чөлөөлсөн'), value: tr('{0} талбар', num(ls.cleared)) },
                  { key: tr('Цэвэрлэсэн'), value: tr('{0} талбар', num(ls.cleaned)) },
                  { key: tr('Үлдсэн талбар'), value: tr('{0} талбар', num(ls.remaining)) },
                  { key: tr('Нийт талбай'), value: tr('{0} га', num(ls.areaM2 / 10_000, 2)) },
                ]}
              />
              <p className={o.note}>
                {tr('Эх сурвалж:')} <b>{tr('кадастрын нэгж талбарын давхарга')}</b>{' '}
                {tr('— төлөв бүрийг тоолж бодно. Давхарга шинэчлэгдэх бүрд тоо шууд өөрчлөгдөнө.')}
              </p>
            </>
          )}
        </Data>
      </Panel>


      {/* Үлдсэн талбарын ШАЛТГААН — `ls.reasons` нь зөвхөн «Үлдсэн нэгж талбар»
          дээр бүлэглэгддэг тул хиймэл 91%-ийн багана гарахгүй. */}
      <Panel title={tr('Үлдсэн талбарын шалтгаан')}>
        <Data q={land} loading={tr('Татаж байна…')}>
          {(ls) =>
            ls.reasons.length === 0 ? (
              <Empty label={tr('Шалтгааны бүртгэл хоосон.')} />
            ) : (
              <>
                <p className={o.note}>
                  {tr('Чөлөөлөгдөөгүй')} {num(ls.remaining)} {tr('талбарын шалтгаан. Ангилал дарж газрын зурагт шүүнэ.')}
                </p>
                <Bars
                  inline
                  selected={selReason}
                  onSelect={(label) => {
                    const eq =
                      label === tr('Тодорхойгүй')
                        ? `(${PL.progress} IS NULL OR ${PL.progress} = '')`
                        : likePrefix(PL.progress, label);
                    onFlt({
                      sec: 'land',
                      key: label,
                      label: tr('Шалтгаан: {0}', tr(label)),
                      where: eq,
                      only: ['land:left'],
                    });
                  }}
                  items={heatBars(ls.reasons, (r) => ({
                    key: r.label,
                    label: r.label,
                    value: r.n,
                    display: tr('{0} талбар', num(r.n)),
                  }))}
                />
              </>
            )
          }
        </Data>
      </Panel>

      {/* Төлөв бүрийн ТАЛБАЙ — `byStatus[].areaM2` нь бодогддог ч зурагддаггүй
          байв. Талбай нь ТООНООС өөр түүх хэлнэ: үлдсэн талбарууд га-гаар бага. */}
      <Panel title={tr('Төлөв бүрийн талбай (га)')}>
        <Data q={land} loading={tr('Татаж байна…')}>
          {(ls) => {
            const rows = [...ls.byStatus]
              .map((x) => ({ ...x, ha: x.areaM2 / 10_000 }))
              .filter((x) => x.ha > 0)
              .sort((a, b) => b.ha - a.ha);
            if (!rows.length) return <Empty label={tr('Талбайн бүртгэл хоосон.')} />;
            const totHa = sumBy(rows, (x) => x.ha);
            return (
              <>
                <Bars
                  inline
                  selected={selHa}
                  onSelect={(k) => {
                    const label = k.slice(3);
                    onFlt({
                      sec: 'land',
                      key: k,
                      label: tr('Төлөв: {0}', tr(label)),
                      where: statusWhere(label, parcels.state === 'ready' ? parcels.data : null),
                      only: ['land:left'],
                    });
                  }}
                  items={rows.map((x) => ({
                    key: `ha:${x.label}`,
                    label: x.label,
                    value: x.ha,
                    display: tr('{0} га · {1}', num(x.ha, 2), pct((x.ha / totHa) * 100, 1)),
                    color: PARCEL_STATUS_HUES[x.label] ?? NO_DATA,
                  }))}
                />
                <p className={o.note}>
                  {tr('Нийт')} <b>{num(totHa, 2)} {tr('га')}</b>{tr('. Талбарын ТОО ба ТАЛБАЙ зөрдөг: үлдсэн талбарууд тоогоор их, талбайгаар бага.')}
                </p>
              </>
            );
          }}
        </Data>
      </Panel>

      {/* ЯВЦЫН МЭДЭЭ — БҮХ ТАЛБАР. `progress` нь зөвхөн «Үлдсэн» 171 талбарт
          задарч байсан тул чөлөөлөгдсөн 1,703-ын явц хаана ч харагдахгүй байв. */}
      <Panel title={tr('Явцын мэдээ — бүх талбар')}>
        <Data q={parcels} loading={tr('Татаж байна…')}>
          {(rows) => {
            const m = new Map<string, number>();
            rows.forEach((r) => {
              const v = String(r[PL.progress] ?? '').trim().replace(/\.$/, '').trim();
              const k = v && v !== '—' ? v : tr('Мэдээ оруулаагүй');
              m.set(k, (m.get(k) ?? 0) + 1);
            });
            const list = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9);
            return list.length ? (
              <>
                <Bars
                  inline
                  items={heatBars(list, ([label, n]) => ({
                    key: label,
                    label,
                    value: n,
                    display: tr('{0} талбар', num(n)),
                  }))}
                />
                <p className={o.note}>{tr('{0} талбараас', num(rows.length))}</p>
              </>
            ) : <Empty label={tr('Явцын мэдээ бүртгэгдээгүй')} />;
          }}
        </Data>
      </Panel>

      {/* ҮЛДСЭН ТАЛБАРЫН ХЭМЖЭЭ — «171 талбар» гэсэн тоо нь ажлын эзэлхүүнийг
          хэлдэггүй: 171 жижиг хашаа vs 171 том талбай тэс өөр ачаалал. */}
      <Panel title={tr('Үлдсэн талбарын хэмжээ')} note={tr('м² · талбарын тоо')}>
        <Data q={parcels} loading={tr('Татаж байна…')}>
          {(rows) => {
            const BUCKETS = [
              { key: 'b1', label: tr('300 м²-ээс бага'), min: 0, max: 300 },
              { key: 'b2', label: tr('300–500 м²'), min: 300, max: 500 },
              { key: 'b3', label: tr('500–700 м²'), min: 500, max: 700 },
              { key: 'b4', label: tr('700–1,000 м²'), min: 700, max: 1000 },
              { key: 'b5', label: tr('1,000 м²-ээс дээш'), min: 1000, max: Infinity },
            ];
            const parcelArea = (r: Row) => parcelAreaOf(r, PL.area, PL.areaAlt);
            const left = rows.filter((r) => String(r[PL.status] ?? '').trim() !== PARCEL_CLEARED);
            const counts = BUCKETS.map((b) => ({
              ...b,
              n: left.filter((r) => {
                const a2 = parcelArea(r);
                return a2 != null && a2 > 0 && a2 >= b.min && a2 < b.max;
              }).length,
            })).filter((b) => b.n > 0);
            return counts.length ? (
              <Bars
                inline
                items={heatBars(counts, (b) => ({
                  key: b.key,
                  label: b.label,
                  value: b.n,
                  display: tr('{0} талбар', num(b.n)),
                }))}
              />
            ) : <Empty label={tr('Хэмжээ бүртгэгдээгүй')} />;
          }}
        </Data>
      </Panel>

      {/* ══ ГАЗАР ЧӨЛӨӨЛӨЛТИЙН ДӨРВӨН НЭМЭЛТ ЗҮСЭЛТ ══
          Бүгд НЭГ асуулгын (`loadLeftParcels`) баганаас — шинэ хүсэлтгүй. */}

      {/* ЧӨЛӨӨЛСӨН ТАЛБАРЫН ХЭМЖЭЭ — дээрх карт нь ҮЛДСЭН 162 талбарыг
          ангилдаг. Тэр нь «юу үлдсэн»-ийг хэлдэг ч «юу чөлөөлөгдсөн»-ийг
          хэлдэггүй: 1,703 чөлөөлсөн талбарын хэмжээний бүтэц үлдсэнтэйгээ
          адил эсэх нь үлдсэн ажлын хүндрэлийг таамаглах шууд үндэслэл. */}
      <Panel title={tr('Чөлөөлсөн талбарын хэмжээ')} note={tr('м² · талбарын тоо')}>
        <Data q={parcels} loading={tr('Татаж байна…')}>
          {(rows) => {
            const BUCKETS = [
              { key: 'f1', label: tr('300 м²-ээс бага'), min: 0, max: 300 },
              { key: 'f2', label: tr('300–500 м²'), min: 300, max: 500 },
              { key: 'f3', label: tr('500–700 м²'), min: 500, max: 700 },
              { key: 'f4', label: tr('700–1,000 м²'), min: 700, max: 1000 },
              { key: 'f5', label: tr('1,000 м²-ээс дээш'), min: 1000, max: Infinity },
            ];
            const parcelArea = (r: Row) => parcelAreaOf(r, PL.area, PL.areaAlt);
            const done = rows.filter((r) => String(r[PL.status] ?? '').trim() === PARCEL_CLEARED);
            const counts = BUCKETS.map((b) => ({
              ...b,
              n: done.filter((r) => {
                const a2 = parcelArea(r);
                return a2 != null && a2 > 0 && a2 >= b.min && a2 < b.max;
              }).length,
            })).filter((b) => b.n > 0);
            return counts.length ? (
              <Bars
                inline
                items={heatBars(counts, (b) => ({
                  key: b.key,
                  label: b.label,
                  value: b.n,
                  display: tr('{0} талбар', num(b.n)),
                }))}
              />
            ) : <Empty label={tr('Хэмжээ бүртгэгдээгүй')} />;
          }}
        </Data>
      </Panel>

      {/* ТАЛБАЙН ЭЗЛЭХҮҮН ХЭМЖЭЭНИЙ БҮЛГЭЭР — дээрх хоёр карт ТАЛБАРЫН ТООГ
          хэлнэ. Гэвч «Нийт 96.52 га» гэсэн тэмдэглэл дэх зөрүү яг эндээс
          гарна: 1,000 м²-ээс дээш талбарууд тоогоор цөөн ч талбайгаар
          хамаагүй их эзэлнэ. Тоо ба талбайг ЗЭРЭГЦҮҮЛЖ харуулна. */}
      <Panel title={tr('Талбайн хэмжээ — бүлгээр')} note={tr('га · бүх талбар')}>
        <Data q={parcels} loading={tr('Татаж байна…')}>
          {(rows) => {
            const BUCKETS = [
              { key: 'a1', label: tr('300 м²-ээс бага'), min: 0, max: 300 },
              { key: 'a2', label: tr('300–500 м²'), min: 300, max: 500 },
              { key: 'a3', label: tr('500–700 м²'), min: 500, max: 700 },
              { key: 'a4', label: tr('700–1,000 м²'), min: 700, max: 1000 },
              { key: 'a5', label: tr('1,000 м²-ээс дээш'), min: 1000, max: Infinity },
            ];
            const parcelArea = (r: Row) => parcelAreaOf(r, PL.area, PL.areaAlt);
            const list = BUCKETS.map((b) => {
              const inB = rows.filter((r) => {
                const a2 = parcelArea(r);
                return a2 != null && a2 > 0 && a2 >= b.min && a2 < b.max;
              });
              return { ...b, n: inB.length, m2: inB.reduce((a2, r) => a2 + (parcelArea(r) ?? 0), 0) };
            }).filter((b) => b.n > 0);
            return list.length ? (
              <Bars
                inline
                items={heatBars(list, (b) => ({
                  key: b.key,
                  label: b.label,
                  value: b.m2,
                  display: tr('{0} га · {1} талбар', num(b.m2 / 10_000, 2), num(b.n)),
                }))}
              />
            ) : <Empty label={tr('Хэмжээ бүртгэгдээгүй')} />;
          }}
        </Data>
      </Panel>

      {/* ЦЭВЭРЛЭСЭН ТАЛБАРЫН ТӨРӨЛ — `Төрөл` багана нь бүх талбарын шинж БИШ:
          187 бөглөгдсөнөөс 183 нь ЯГ «Цэвэрлэсэн нэгж талбар» байв. */}
      <Panel title={tr('Нэгж талбарын зориулалт')} note={tr('зориулалт бүртгэгдсэн талбар')}>
        <Data q={parcels} loading={tr('Татаж байна…')}>
          {(rows) => {
            const m = new Map<string, number>();
            rows
              .forEach((r) => {
                const v = String(r[PL.landuse] ?? '').trim();
                if (!v) return;
                m.set(v, (m.get(v) ?? 0) + 1);
              });
            const list = [...m.entries()].sort((a2, b2) => b2[1] - a2[1]);
            if (!list.length) return <Empty label={tr('Төрөл бүртгэгдээгүй')} />;
            const tot = list.reduce((a2, x) => a2 + x[1], 0);
            return list.length <= 3 ? (
              <Donut
                size="lg"
                leaders
                center={num(tot)}
                centerLabel={tr('талбар')}
                items={list.map(([label, n], i) => ({
                  key: label,
                  label,
                  value: n,
                  color: cat(i),
                  display: tr('{0} талбар', num(n)),
                }))}
              />
            ) : (
              <Bars
                inline
                items={heatBars(list, ([label, n]) => ({
                  key: label,
                  label,
                  value: n,
                  display: tr('{0} талбар', num(n)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* ТЭМДЭГЛЭЛГҮЙ ТАЛБАР — ТӨЛӨВӨӨР. Цоорхой ХААНА байгаа нь чухал: бүрэн
          чөлөөлсөн талбарт тэмдэглэл дутуу байх нь хэвийн (ажил дууссан), харин
          ҮЛДСЭН талбарт дутуу байх нь хяналтын цоорхой. */}
      <Panel title={tr('Тэмдэглэлгүй талбар — төлөвөөр')} note={tr('тэмдэглэл бичээгүй')}>
        <Data q={parcels} loading={tr('Татаж байна…')}>
          {(rows) => {
            const m = new Map<string, { no: number; all: number }>();
            rows.forEach((r) => {
              const s2 = String(r[PL.status] ?? '').trim();
              if (!s2) return;
              const v = String(r[PL.note] ?? '').trim();
              const cur = m.get(s2) ?? { no: 0, all: 0 };
              cur.all += 1;
              if (!v || v === '—') cur.no += 1;
              m.set(s2, cur);
            });
            const list = [...m.entries()]
              .map(([label, v]) => ({ key: label, label, ...v, pct: v.all ? (v.no / v.all) * 100 : 0 }))
              .filter((x) => x.no > 0)
              .sort((a2, b2) => b2.pct - a2.pct);
            return list.length ? (
              <Bars
                inline
                max={100}
                items={heatBars(list, (x) => ({
                  key: x.key,
                  label: x.label,
                  value: x.pct,
                  display: tr('{0} · {1} / {2} талбар', pct(x.pct, 0), num(x.no), num(x.all)),
                }))}
              />
            ) : <Empty label={tr('Бүх талбарт тэмдэглэл бичигдсэн')} />;
          }}
        </Data>
      </Panel>

    </>
  );
}

/* ══════════════════ 05 · Шугам сүлжээ ══════════════════ */

/**
 * Багц 5.x гадна шугам → тэр шугам ХАНГАХ орон сууцны багц.
 *
 * Холбоос нь давхаргын ГАРЧИГТ өөрт нь бий («Багц 5.1 · Гадна дулаан, ус,
 * татуурга (Багц 1)») — гараар зохиосон таамаг БИШ, `services.ts`-ийн нэрнээс
 * уншсан бодит хамаарал.
 */
const consumerBagtsKey = (k: string) => `БАГЦ${k.slice(1)}`;

const NET_SERVES: readonly { key: string; label: string; bagts: readonly string[] }[] = [
  { key: 'БАГЦ51', get label() { return tr('Багц 5.1 · Багц 1'); }, bagts: ['БАГЦ1'] },
  { key: 'БАГЦ52', get label() { return tr('Багц 5.2 · Багц 2'); }, bagts: ['БАГЦ2'] },
  { key: 'БАГЦ53', get label() { return tr('Багц 5.3 · Багц 3'); }, bagts: ['БАГЦ31', 'БАГЦ32', 'БАГЦ33'] },
  { key: 'БАГЦ54', get label() { return tr('Багц 5.4 · Багц 4'); }, bagts: ['БАГЦ41', 'БАГЦ42'] },
];

/**
 * Гадна дулаан/ус/татуургын багцууд (Багц 5.x, 7, 10–15) — ХЭМЖЭЭ, хангах өрх,
 * эх үүсвэрийн чадал. Багц дарахад зурагт тэр багцын давхаргууд л үлдэнэ.
 */
function NetworkDetail({ bagts, sources, netTotals, zone, flt, onFlt }: {
  bagts: Async<BagtsRow[]>;
  sources: Async<Row[]>;
  netTotals: Async<Map<string, Totals>>;
  zone: string | null;
} & FltProps) {
  const sel = flt?.sec === 'network' ? flt.key : null;
  const pick = (key: string) => {
    const ids = PKG_BY_BAGTS[key] ?? [];
    if (ids.length) onFlt({ sec: 'network', key, label: tr('Багц: {0}', key), layers: ids });
  };

  /**
   * Багц бүрийн нийлбэр хэмжээ. Багц нэгээс олон давхаргатай байж болно
   * (трасс + цэг) тул давхаргуудыг НЭМНЭ.
   */
  const failN = totalsFailN(netTotals, NET_PACK_IDS);
  const netQ = completeTotals(netTotals, NET_PACK_IDS);
  const tot = netQ.state === 'ready' ? netQ.data : null;
  const packs = infraPackList(isNetworkPack).map((p) => {
    let n = 0;
    let len = 0;
    let area = 0;
    for (const id of p.ids) {
      const d = LAYER_BY_ID[id];
      const q = tot?.get(id);
      if (!d || !q) continue;
      n += q.n;
      if (q.q == null) continue;
      if (d.qty?.unit === 'м') len += q.q;
      else if (d.qty?.unit === 'км') len += q.q * 1000;
      else if (d.qty?.unit === 'м²') area += q.q;
    }
    return { ...p, n, len, area };
  });
  const totalLen = tot ? lenOf(tot, NET_PACK_IDS) : null;
  const totalObj = tot ? completeSum(tot, knownIds(NET_PACK_IDS), (t) => t.n) : null;

  return (
    <>
      {/* ТОЛГОЙН ЗУРВАС — тоймын `.head`-ийн загварыг ХУУЛСАН (01–04-тэй
          ижил зарчим; загварыг НЭГТГЭЭГҮЙ, `data-sec='network'` дор тусдаа). */}
      <Panel title={tr('Шугам сүлжээний нэгдсэн үзүүлэлт')}>
        <Stats cols={3}>
          <Stat accent color={cat(0)} value={num(packs.length)} unit={tr('багц')} label={tr('Шугам сүлжээний багц')} />
          <Stat accent color={cat(1)} value={tot ? (totalLen != null ? km(totalLen, 1) : '—') : dots(netQ)} unit={tr('км')} label={tr('Шугамын нийт урт')} />
          <Stat accent color={cat(2)} value={tot ? (totalObj != null ? num(totalObj) : '—') : dots(netQ)} unit={tr('ш')} label={tr('Сүлжээний объект')} />
          <Stat
            accent
            color={cat(3)}
            value={(() => {
              const rows = bagts.state === 'ready' ? bagts.data : null;
              if (!rows) return dots(bagts);
              const ks = NET_SERVES.flatMap((s) => s.bagts);
              return ailLabel(rows.filter((r) => ks.includes(r.key)));
            })()}
            unit={tr('өрх')}
            label={tr('Холбогдох өрх')}
          />
          <Stat
            accent
            color={cat(4)}
            value={(() => {
              const rows = sources.state === 'ready' ? sources.data : null;
              if (!rows) return dots(sources);
              const F = SOURCE_FS.fields;
              return num(sumBy(rows.filter((r) => srcStr(r[F.type]).startsWith('Дулаан')), (r) => srcNum(r[F.total])), 1);
            })()}
            unit={tr('МВт')}
            label={tr('Дулааны чадал')}
          />
          <Stat
            accent
            color={cat(5)}
            value={(() => {
              const rows = sources.state === 'ready' ? sources.data : null;
              if (!rows) return dots(sources);
              const F = SOURCE_FS.fields;
              return num(sumBy(rows.filter((r) => srcStr(r[F.type]).startsWith('Ус')), (r) => srcNum(r[F.total])));
            })()}
            unit={tr('м³/хон')}
            label={tr('Ус хангамжийн чадал')}
          />
        </Stats>
        <TotalsFailNote n={failN} />
      </Panel>

      {/* ШУГАМЫН УРТ — багцаар. Энэ нь хэсгийн ГОЛ хэмжигдэхүүн: сүлжээний
          багцын «хэмжээ» гэдэг нь блокийн тоо биш, тавих шугамын урт. */}
      <Panel title={tr('Шугамын урт — багцаар')} note={tr('км')}>
        <Data q={netQ} loading={tr('Татаж байна…')}>
          {() => {
            const rows = packs.filter((p) => p.len > 0).sort((a, b) => b.len - a.len);
            if (!rows.length) return <Empty label={tr('Уртын бүртгэл алга.')} />;
            return (
              <Bars
                inline
                selected={sel}
                onSelect={pick}
                items={heatBars(rows, (p) => ({
                  key: p.key,
                  label: p.label,
                  value: p.len,
                  display: tr('{0} км · {1} ш', km(p.len, 1), num(p.n)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* НЭГ ӨРХӨД НОГДОХ ШУГАМЫН УРТ — гадна шугамын багц бүр ХЭР ҮР АШИГТАЙ
          өрх холбож байгааг харуулна. */}
      <Panel title={tr('Нэг өрхөд ногдох шугамын урт')} note={tr('м / өрх')}>
        <Data q={netQ} loading={tr('Татаж байна…')}>
          {() => {
            if (zone) return <Empty label={tr('Бүсийн шүүлттэй үед харьцаа тооцохгүй — өрх, блокийн тоо бүсээр ялгагддаггүй.')} />;
            const rows2 = bagts.state === 'ready' ? bagts.data : null;
            if (!rows2) return <Empty label={tr('Орон сууцны багцын өрхийн тоо алга.')} />;
            const list = NET_SERVES
              .map((s) => {
                const p = packs.find((x) => x.key === s.key);
                const t = ailTotal(rows2.filter((r) => s.bagts.includes(r.key)));
                const ail = t.ail != null && !t.partial ? t.ail : 0;
                return { key: s.key, label: s.label, ail, len: p?.len ?? 0 };
              })
              .filter((x) => x.ail > 0 && x.len > 0)
              .map((x) => ({ ...x, per: x.len / x.ail }))
              .sort((a, b) => b.per - a.per);
            if (!list.length) return <Empty label={tr('Уртын бүртгэл алга.')} />;
            return (
              <Bars
                inline
                selected={sel}
                onSelect={pick}
                items={heatBars(list, (x) => ({
                  key: x.key,
                  label: x.label,
                  value: x.per,
                  display: tr('{0} м/өрх · {1} км / {2} өрх', num(x.per, 1), km(x.len, 1), num(x.ail)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      <Panel title={tr('Шугам сүлжээ хангах орон сууц')}>
        <Data q={bagts} loading={tr('Татаж байна…')}>
          {(rows) => {
            const of = (ks: readonly string[], f: (r: BagtsRow) => number) =>
              sumBy(rows.filter((r) => ks.includes(r.key)), f);
            const rowsOf = (ks: readonly string[]) => rows.filter((r) => ks.includes(r.key));
            // Газрын зурагт давхарга БАЙГАА багц л бар болно — дарахад юу ч болохгүй бар гарахгүй
            const groups = NET_SERVES
              .filter((s) => (PKG_BY_BAGTS[s.key] ?? []).length)
              .map((s) => ({ ...s, ail: ailTotal(rowsOf(s.bagts)).ail ?? 0, ailText: ailLabel(rowsOf(s.bagts)), blocks: of(s.bagts, (r) => r.blocks) }))
              .filter((s) => s.ail > 0);
            if (!groups.length) return <Empty label={tr('Орон сууцны багцын өрхийн тоо алга.')} />;
            return (
              <>
                <p className={o.note}>
                  {tr('Гадна дулаан, ус, татуургын багц бүр ХЭДЭН ӨРХИЙГ холбох вэ (давхаргын гарчигт заасан орон сууцны багцаар). Бар дарж зурагт шүүнэ.')}
                </p>
                <Bars
                  inline
                  selected={sel}
                  onSelect={pick}
                  items={heatBars(groups, (s) => ({
                    key: s.key, label: s.label, value: s.ail,
                    display: tr('{0} өрх · {1} блок', s.ailText, num(s.blocks)),
                  }))}
                />
              </>
            );
          }}
        </Data>
      </Panel>

      {/* ОБЬЕКТЫН ТОО — багцаар. Урт нь «хэр их шугам», объектын тоо нь «хэр
          олон эд анги» (худаг, хаалт, тулгуур) — хоёр өөр асуулт. */}
      <Panel title={tr('Сүлжээний объектын тоо — багцаар')} note={tr('ширхэг')}>
        <Data q={netQ} loading={tr('Татаж байна…')}>
          {() => {
            const rows = packs.filter((p) => p.n > 0).sort((a, b) => b.n - a.n);
            if (!rows.length) return <Empty label={tr('Багцын давхарга алга.')} />;
            return (
              <>
                <p className={o.note}>
                  {tr('{0} багц. Багана нь давхаргын объектын ТОО. Багц дарж газрын зурагт шүүнэ.', num(packs.length))}
                </p>
                <Bars
                  inline
                  selected={sel}
                  onSelect={pick}
                  items={heatBars(rows, (p) => ({
                    key: p.key,
                    label: p.label,
                    value: p.n,
                    display: p.area > 0 && p.len === 0
                      ? tr('{0} ш · {1} м²', num(p.n), num(p.area))
                      : tr('{0} ш', num(p.n)),
                  }))}
                />
              </>
            );
          }}
        </Data>
      </Panel>

      {/* `нийт_чадал` ба `тайлбар` нь `useSources`-ийн outFields-д БАЙГАА хэрнээ
          дашбоардын хаана ч зурагддаггүй байв. */}
      {/* 2026-08-21 (хэрэглэгчийн хүсэлт): 4 нүдэн Stats байсныг ТӨРЛӨӨР нь
          ТУСДАА ХОЁР донат-карт болгов — зүсмэг бүр = байгууламж, гол нь нийт
          чадал. Нэгж зөрдөг (МВт vs м³/хон) тул нэг диаграмд нийлэхгүй. */}
      <Panel title={tr('Дулааны эх үүсвэрийн чадал')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')} minH={220}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const heatRows = rows.filter((r) => srcStr(r[F.type]).startsWith('Дулаан'));
            if (!heatRows.length) return <Empty label={tr('Эх үүсвэрийн бүртгэл хоосон.')} />;
            return (
              /* ≤3 бол донат, эс бөгөөс хэвтээ бар (4+ дүрэм) */
              heatRows.length <= 3 ? (
                <Donut
                  size="lg"
                  leaders
                  center={num(sumBy(heatRows, (r) => srcNum(r[F.total])), 1)}
                  centerLabel={tr('МВт')}
                  items={heatRows.map((r, i) => ({
                    key: srcStr(r[F.name]) || String(i),
                    label: srcStr(r[F.name]) || tr('Нэргүй'),
                    value: srcNum(r[F.total]),
                    color: cat(i),
                    display: tr('{0} МВт', num(srcNum(r[F.total]), 1)),
                  }))}
                />
              ) : (
                <Bars
                  inline
                  items={heatBars(
                    [...heatRows].sort((a, b) => srcNum(b[F.total]) - srcNum(a[F.total])),
                    (r) => ({
                      key: srcStr(r[F.name]) || tr('Нэргүй'),
                      label: srcStr(r[F.name]) || tr('Нэргүй'),
                      value: srcNum(r[F.total]),
                      display: tr('{0} МВт', num(srcNum(r[F.total]), 1)),
                    }),
                  )}
                />
              )
            );
          }}
        </Data>
      </Panel>
      <Panel title={tr('Ус хангамжийн эх үүсвэрийн чадал')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')} minH={220}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const waterRows = rows.filter((r) => srcStr(r[F.type]).startsWith('Ус'));
            if (!waterRows.length) return <Empty label={tr('Эх үүсвэрийн бүртгэл хоосон.')} />;
            return (
              waterRows.length <= 3 ? (
                <Donut
                  size="lg"
                  leaders
                  center={num(sumBy(waterRows, (r) => srcNum(r[F.total])))}
                  centerLabel={tr('м³/хон')}
                  items={waterRows.map((r, i) => ({
                    key: srcStr(r[F.name]) || String(i),
                    label: srcStr(r[F.name]) || tr('Нэргүй'),
                    value: srcNum(r[F.total]),
                    color: cat(i),
                    display: tr('{0} м³/хон', num(srcNum(r[F.total]))),
                  }))}
                />
              ) : (
                <Bars
                  inline
                  items={heatBars(
                    [...waterRows].sort((a, b) => srcNum(b[F.total]) - srcNum(a[F.total])),
                    (r) => ({
                      key: srcStr(r[F.name]) || tr('Нэргүй'),
                      label: srcStr(r[F.name]) || tr('Нэргүй'),
                      value: srcNum(r[F.total]),
                      display: tr('{0} м³/хон', num(srcNum(r[F.total]))),
                    }),
                  )}
                />
              )
            );
          }}
        </Data>
      </Panel>

      <Panel title={tr('Эх үүсвэрийн нөөцийн тэмдэглэл')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const notes = rows
              .filter((r) => /^(Дулаан|Ус)/.test(srcStr(r[F.type])))
              .map((r) => ({ key: srcStr(r[F.name]), value: srcStr(r[F.note]) }))
              .filter((x) => x.key && x.value);
            return notes.length
              ? <Rows items={notes} />
              : <Empty label={tr('Тэмдэглэл бүртгэгдээгүй.')} />;
          }}
        </Data>
      </Panel>

      {/* ══ ШУГАМ СҮЛЖЭЭНИЙ ГУРВАН НЭМЭЛТ ЗҮСЭЛТ ══
          Бүгд аль хэдийн татсан `netTotals` ба `bagts`-аас — шинэ хүсэлтгүй. */}

      {/* ХОРООЛЛЫН vs МАГИСТРАЛЬ ШУГАМ — сүлжээний 11 багц нь хоёр ӨӨР төрлийн
          ажил: Багц 5.1–5.4 нь ТОДОРХОЙ орон сууцны багц руу татсан хорооллын
          доторх шугам, Багц 7 ба 10–15 нь бүх төслийг хамарсан магистраль ба
          байгууламж. Тэднийг нэг жагсаалтад холивол «Багц 5.3 хамгийн том»
          гэсэн дүгнэлт гарах ч тэр нь зөвхөн хорооллын шугамуудын дунд үнэн.
          Хоёрхон бүлэг тул донат (≤3 дүрэм), нэг өнгөний сүүдрээр. */}
      <Panel title={tr('Хороолол vs магистраль')} note={tr('шугамын урт, км')}>
        <Data q={netQ} loading={tr('Татаж байна…')}>
          {() => {
            const isLocal = (k: string) => /^БАГЦ5[1-4]$/.test(k);
            const groups = [
              { key: 'local', label: tr('Хорооллын шугам (Багц 5.1–5.4)') },
              { key: 'trunk', label: tr('Магистраль ба байгууламж (Багц 7, 10–15)') },
            ].map((g) => {
              const sel2 = packs.filter((p) => (g.key === 'local') === isLocal(p.key));
              return {
                ...g,
                len: sel2.reduce((a2, p) => a2 + p.len, 0),
                n: sel2.reduce((a2, p) => a2 + p.n, 0),
                packs: sel2.length,
              };
            }).filter((g) => g.len > 0);
            if (!groups.length) return <Empty label={tr('Уртын бүртгэл алга.')} />;
            return (
              <Donut
                size="lg"
                leaders
                center={km(groups.reduce((a2, g) => a2 + g.len, 0), 1)}
                centerLabel={tr('км')}
                items={groups.map((g, i) => ({
                  key: g.key,
                  label: g.label,
                  value: g.len,
                  color: cat(i),
                  display: tr('{0} км · {1} багц · {2} ш', km(g.len, 1), num(g.packs), num(g.n)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* ОБЬЕКТЫН НЯГТРАЛ — км тутамд ногдох объект. Урт нь «хэр их шугам»,
          объектын тоо нь «хэр олон эд анги» гэдгийг тус тусад нь хэлдэг ч
          хоёрын ХАРЬЦАА нь өөр зүйл заана: км тутамд олон объект байх нь
          худаг, хаалт, холболт нягт — өөрөөр хэлбэл угсралт нь урт шугам
          татахаас илүү ажиллагаатай гэсэн үг. */}
      <Panel title={tr('Объектын нягтрал — багцаар')} note={tr('ш / км')}>
        <Data q={netQ} loading={tr('Татаж байна…')}>
          {() => {
            const rows = packs
              .filter((p) => p.len > 0 && p.n > 0)
              .map((p) => ({ ...p, per: p.n / (p.len / 1000) }))
              .sort((a2, b2) => b2.per - a2.per);
            if (!rows.length) return <Empty label={tr('Уртын бүртгэл алга.')} />;
            return (
              <Bars
                inline
                selected={sel}
                onSelect={pick}
                items={heatBars(rows, (p) => ({
                  key: p.key,
                  label: p.label,
                  value: p.per,
                  display: tr('{0} ш/км · {1} ш / {2} км', num(p.per, 1), num(p.n), km(p.len, 1)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* НЭГ БЛОКТ НОГДОХ ШУГАМЫН УРТ — «нэг өрхөд ногдох урт» нь СУУРЬШЛЫН
          нягтралыг хэмждэг (олон давхар байшин өрх ихтэй тул м/өрх бага
          гарна). Нэг блокт ногдох урт нь эсрэгээрээ БАЙРШЛЫН тархалтыг
          хэмжинэ: блокууд хол зайтай байрласан багц өндөр гарна. Хоёр
          үзүүлэлт өөр өөр асуултад хариулна. */}
      <Panel title={tr('Нэг блокт ногдох шугамын урт')} note={tr('м / блок')}>
        <Data q={netQ} loading={tr('Татаж байна…')}>
          {() => {
            if (zone) return <Empty label={tr('Бүсийн шүүлттэй үед харьцаа тооцохгүй — өрх, блокийн тоо бүсээр ялгагддаггүй.')} />;
            const rows2 = bagts.state === 'ready' ? bagts.data : null;
            if (!rows2) return <Empty label={tr('Орон сууцны багцын өрхийн тоо алга.')} />;
            const list = NET_SERVES
              .map((s) => {
                const p = packs.find((x) => x.key === s.key);
                const blocks = sumBy(rows2.filter((r) => s.bagts.includes(r.key)), (r) => r.blocks);
                return { key: s.key, label: s.label, blocks, len: p?.len ?? 0 };
              })
              .filter((x) => x.blocks > 0 && x.len > 0)
              .map((x) => ({ ...x, per: x.len / x.blocks }))
              .sort((a2, b2) => b2.per - a2.per);
            if (!list.length) return <Empty label={tr('Уртын бүртгэл алга.')} />;
            return (
              <Bars
                inline
                selected={sel}
                onSelect={pick}
                items={heatBars(list, (x) => ({
                  key: x.key,
                  label: x.label,
                  value: x.per,
                  display: tr('{0} м/блок · {1} км / {2} блок', num(x.per), km(x.len, 1), num(x.blocks)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

    </>
  );
}

/* ══════════════════ 06 · Цахилгаан ══════════════════ */

/**
 * Дэд станцын нэрийг тайрна — Bars-ын утгын багана `flex: none`, таслалтгүй
 * (`ui.module.css`) бөгөөд хажуугийн багана 272/292px л (`overview.module.css`).
 * Бүтэн «Шинээр төлөвлөж буй 110/35/10 кВ дэд станц» нь мөрөө тонгоруулна.
 */
const shortSrc = (n: string) => (n
  .replace(/^(Одоо байгаа|Шинээр төлөвлөж буй|Шинээр барих|Баригдаж буй)\s*/u, '')
  .replace(/\s*дэд станц\s*$/u, '')
  .replace(/\s+/g, ' ')
  .trim() || n);

/**
 * Цахилгааны багцууд (БАГЦ-6.x) — эх үүсвэрийн чадал, ажлын гүйцэтгэл, багцад
 * хуваарилсан МВт. Багц дарахад зурагт тэр багцын давхаргууд л үлдэнэ.
 */
function PowerDetail({ sources, prog, powTotals, flt, onFlt }: {
  sources: Async<Row[]>;
  prog: Async<BlockProgressMap>;
  powTotals: Async<Map<string, Totals>>;
} & FltProps) {
  const sel = flt?.sec === 'power' ? flt.key : null;
  const items = infraPackList(isPowerPack);
  const pick = (key: string) => {
    const ids = PKG_BY_BAGTS[key] ?? [];
    if (ids.length) onFlt({ sec: 'power', key, label: tr('Багц: {0}', key), layers: ids });
  };

  /**
   * Багц бүрийн нийлбэр хэмжээ — 05-ынхтай ЯГ ижил дүрэм.
   */
  const failN = totalsFailN(powTotals, POW_PACK_IDS);
  const powQ = completeTotals(powTotals, POW_PACK_IDS);
  const tot = powQ.state === 'ready' ? powQ.data : null;
  const packs = items.map((p) => {
    let n = 0;
    let len = 0;
    for (const id of p.ids) {
      const d = LAYER_BY_ID[id];
      const q = tot?.get(id);
      if (!d || !q) continue;
      n += q.n;
      if (q.q == null) continue;
      if (d.qty?.unit === 'м') len += q.q;
      else if (d.qty?.unit === 'км') len += q.q * 1000;
    }
    return { ...p, n, len };
  });
  const totalLen = tot ? lenOf(tot, POW_PACK_IDS) : null;
  const totalObj = tot ? completeSum(tot, knownIds(POW_PACK_IDS), (t) => t.n) : null;
  return (
    <>
      {/* 07 хэсэг цахилгааны Donut-аа `хангах_хувь`-аар зурж, төвд нь
          БАЙГУУЛАМЖИЙН ТОО бичдэг — МВт чадал ба «шинэ/одоо байгаа» хуваалт
          дашбоардын хаана ч гардаггүй байв. */}
      <Panel title={tr('Цахилгааны эх үүсвэрийн чадал')}>
        <Data q={sources} loading={tr('Эх үүсвэрийн чадлыг татаж байна…')} minH={300}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const cap = rows
              .filter((r) => srcStr(r[F.type]).startsWith('Цахилгаан'))
              .map((r) => ({
                name: srcStr(r[F.name]),
                mw: srcNum(r[F.total]),
                planned: /Шинээр/.test(srcStr(r[F.name])),
              }));
            const capTotal = sumBy(cap, (x) => x.mw);
            if (!capTotal) return <Empty label={tr('Цахилгааны эх үүсвэрийн чадал бүртгэгдээгүй.')} />;
            const newOne = cap.find((x) => x.planned);
            const oldOne = cap.find((x) => !x.planned);
            const plannedMw = sumBy(cap.filter((x) => x.planned), (x) => x.mw);
            return (
                <Stats cols={3}>
                  <Stat accent color={cat(0)} value={num(capTotal, 1)} unit={tr('МВт')} label={tr('Нийт эх үүсвэрийн чадал')} />
                  <Stat accent color={cat(1)} value={num(capTotal - plannedMw, 1)} unit={tr('МВт')}
                        label={oldOne ? shortSrc(oldOne.name) : tr('Одоо байгаа дэд станц')} />
                  <Stat accent color={cat(2)} value={num(plannedMw, 1)} unit={tr('МВт')}
                        label={newOne ? shortSrc(newOne.name) : tr('Төлөвлөж буй дэд станц')} />
                  <Stat accent color={cat(3)} value={num(packs.length)} unit={tr('багц')} label={tr('Цахилгааны багц')} />
                  <Stat accent color={cat(4)} value={tot ? (totalLen != null ? km(totalLen, 1) : '—') : dots(powQ)} unit={tr('км')} label={tr('Кабелийн нийт урт')} />
                  <Stat accent color={cat(5)} value={tot ? (totalObj != null ? num(totalObj) : '—') : dots(powQ)} unit={tr('ш')} label={tr('Сүлжээний объект')} />
                </Stats>
            );
          }}
        </Data>
        <TotalsFailNote n={failN} />
      </Panel>

      <Panel title={tr('Шинэ дэд станцын эзлэх хувь')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const cap = rows
              .filter((r) => srcStr(r[F.type]).startsWith('Цахилгаан'))
              .map((r) => ({ mw: srcNum(r[F.total]), planned: /Шинээр/.test(srcStr(r[F.name])) }));
            const capTotal = sumBy(cap, (x) => x.mw);
            if (!capTotal) return <Empty label={tr('Бүртгэл алга.')} />;
            const plannedMw = sumBy(cap.filter((x) => x.planned), (x) => x.mw);
            return (
              <RingCard
                value={(plannedMw / capTotal) * 100}
                label={tr('эх үүсвэрийн чадал шинэ дэд станцаас')}
                decimals={0}
              />
            );
          }}
        </Data>
      </Panel>

      {/*
          Оронд нь ХЭМЖЭЭ: кабелийн трассын урт нь 8 багц дээр БҮГД
          бөглөгдсөн (Багц 6.3 10.2 км … Багц 6.7 0.6 км). */}
      <Panel title={tr('Кабелийн урт — багцаар')} note={tr('км')}>
        <Data q={powQ} loading={tr('Татаж байна…')}>
          {() => {
            const rows = packs.filter((p) => p.len > 0).sort((a, b) => b.len - a.len);
            if (!rows.length) return <Empty label={tr('Уртын бүртгэл алга.')} />;
            return (
              <Bars
                inline
                selected={sel}
                onSelect={pick}
                items={heatBars(rows, (p) => ({
                  key: p.key,
                  label: p.label,
                  value: p.len,
                  display: tr('{0} км · {1} ш', km(p.len, 1), num(p.n)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      <Panel title={tr('Багцад хуваарилсан чадал (МВт)')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')} minH={460}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const pw = rows.filter((r) => srcStr(r[F.type]).startsWith('Цахилгаан'));
            const raw = SOURCE_FS.consumers
              .filter((c) => /^b\d/.test(c.key))
              .map((c) => {
                const per = pw
                  .map((r) => ({ src: shortSrc(srcStr(r[F.name])), mw: srcNum(r[c.field]) }))
                  .filter((x) => x.mw > 0);
                return {
                  key: consumerBagtsKey(c.key),
                  trunk: c.key.charAt(1),   // b32 → «3» (2026-09-25: орчуулгаас хамааралгүй)
                  label: c.label,
                  mw: sumBy(per, (x) => x.mw),
                  per,
                };
              })
              .filter((x) => x.mw > 0)
              .sort((a, b) => b.mw - a.mw);
            if (!raw.length) return <Empty label={tr('Хуваарилсан чадлын өгөгдөл алга.')} />;
            const sel6 = flt?.sec === 'power' ? flt.key : null;
            return (
              <>
                <p className={o.note}>{tr('Нийт')} <b>{num(sumBy(raw, (x) => x.mw), 2)} {tr('МВт')}</b>{tr('. Мөрийн шошгонд ХАНГАХ дэд станц.')}</p>
                <Bars
                  inline
                  items={heatBars(raw, (x) => ({
                    key: x.key,
                    label: `${x.label} · ${x.per.map((s) => s.src).join(' + ')}`,
                    value: x.mw,
                    display: tr('{0} МВт', num(x.mw, 2)),
                  }))}
                  selected={raw.filter((x) => `БАГЦ6${x.trunk}` === sel6).map((x) => x.key)}
                  onSelect={(key) => {
                    const trunk = raw.find((x) => x.key === key)?.trunk;
                    // Багц 3.1/3.2/3.3 → БАГЦ-6.3 (гурвуулаа ГАНЦ трасс)
                    const bag = `БАГЦ6${trunk}`;
                    const ids = PKG_BY_BAGTS[bag] ?? [];
                    if (ids.length) onFlt({ sec: 'power', key: bag, label: tr('Багц: {0}', tr('БАГЦ6{0}', trunk)), layers: ids });
                  }}
                />
              </>
            );
          }}
        </Data>
      </Panel>

      <Panel title={tr('Гадна цахилгаан (БАГЦ-6)')} note={tr('ширхэг')}>
        <Data q={powQ} loading={tr('Татаж байна…')}>
          {() => {
            const rows = packs.filter((p) => p.n > 0).sort((a, b) => b.n - a.n);
            if (!rows.length) return <Empty label={tr('Багцын давхарга алга.')} />;
            return (
              <>
                <p className={o.note}>
                  {tr('{0} багц. Багана нь давхаргын объектын ТОО. Багц дарж газрын зурагт шүүнэ.', num(packs.length))}
                </p>
                <Bars
                  inline
                  selected={sel}
                  onSelect={pick}
                  items={heatBars(rows, (p) => ({
                    key: p.key,
                    label: p.label,
                    value: p.n,
                    display: p.len > 0
                      ? tr('{0} ш · {1} км', num(p.n), km(p.len, 1))
                      : tr('{0} ш', num(p.n)),
                  }))}
                />
              </>
            );
          }}
        </Data>
      </Panel>

      {/* Б4 нүд («ЦАХИЛГААН, ГЭРЭЛТҮҮЛЭГ») нь `d.bagts`-ыг бүтээдэг ЯГ ТЭР
          хүсэлтэд татагдаж бодогдоод `joinBagts`-д хаягддаг байв. */}
      <Panel title={tr('Б4 · Цахилгаан, гэрэлтүүлэг — блокийн бэлэн байдал')}>
        <Data q={prog} loading={tr('Блокийн гүйцэтгэлийг уншиж байна…')}>
          {(pm) => {
            const cells = [...pm.values()]
              .flatMap((c) => c.phases.filter((x) => x.no === 'Б4' && x.pct != null));
            if (!cells.length) return <Empty label={tr('Б4 үе шат бөглөгдөөгүй.')} />;
            const started = cells.filter((x) => (x.pct as number) > 0).length;
            const avg = sumBy(cells, (x) => x.pct as number) / cells.length;
            return (
              <>
                <Stats cols={3}>
                  <Stat accent color={HUE[0]} value={num(cells.length)} unit={tr('блок')} label={tr('Б4 бүртгэлтэй блок')} />
                  <Stat accent color={started ? HUE[2] : NO_DATA} value={num(started)} unit={tr('блок')}
                        label={tr('Ажил эхэлсэн')} />
                  <Stat accent color={HUE[4]} value={pct(avg, 1)} label={tr('Б4 дундаж гүйцэтгэл')} />
                </Stats>
                <p className={o.note}>
                  {tr('Барилга доторх цахилгаан, гэрэлтүүлгийн ажил {0} блокийн {1}-д хараахан эхлээгүй.', num(cells.length), num(cells.length - started))}
                </p>
              </>
            );
          }}
        </Data>
      </Panel>

      {/* ══ ЦАХИЛГААНЫ ГУРВАН НЭМЭЛТ ЗҮСЭЛТ ══
          Бүгд аль хэдийн татсан `powTotals` ба `sources`-оос — шинэ хүсэлтгүй. */}

      {/* КАБЕЛИЙН ШУГАМ vs ХТП/РП — цахилгааны 8 багц нь хоёр өөр ажил:
          Багц 6.1–6.4 нь орон сууцны багц руу татсан КАБЕЛИЙН ШУГАМ, Багц
          6.5–6.8 нь ХТП/РП-ийн хэсгүүд (трасс + байгууламжийн цэг). Тэднийг
          нэг жагсаалтад холивол «Багц 6.4 хамгийн олон объекттой» гэсэн
          дүгнэлт гарах ч тэр нь өөр төрлийн ажлуудыг жишсэн хэрэг.
          Хоёрхон бүлэг тул донат (≤3 дүрэм), нэг өнгөний сүүдрээр. */}
      <Panel title={tr('Кабелийн шугам vs ХТП/РП')} note={tr('объектын тоо')}>
        <Data q={powQ} loading={tr('Татаж байна…')}>
          {() => {
            const isLine = (k: string) => /^БАГЦ6[1-4]$/.test(k);
            const groups = [
              { key: 'cable', label: tr('Кабелийн шугам (Багц 6.1–6.4)') },
              { key: 'htp', label: tr('ХТП/РП хэсгүүд (Багц 6.5–6.8)') },
            ].map((g) => {
              const sel2 = packs.filter((p) => (g.key === 'cable') === isLine(p.key));
              return {
                ...g,
                n: sel2.reduce((a2, p) => a2 + p.n, 0),
                len: sel2.reduce((a2, p) => a2 + p.len, 0),
                packs: sel2.length,
              };
            }).filter((g) => g.n > 0);
            if (!groups.length) return <Empty label={tr('Багцын давхарга алга.')} />;
            return (
              <Donut
                size="lg"
                leaders
                center={num(groups.reduce((a2, g) => a2 + g.n, 0))}
                centerLabel={tr('ш')}
                items={groups.map((g, i) => ({
                  key: g.key,
                  label: g.label,
                  value: g.n,
                  color: cat(i),
                  display: tr('{0} ш · {1} км · {2} багц', num(g.n), km(g.len, 1), num(g.packs)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* ОБЬЕКТЫН НЯГТРАЛ — км тутамд ногдох объект. Кабелийн шугамд энэ нь
          холболт, шонгийн нягтрал; ХТП/РП-ийн хэсэгт богино трасс дээр олон
          байгууламж байдаг тул эрс өндөр гарна. Тэр ялгаа нь өөрөө хоёр
          төрлийн ажил байгааг тоогоор баталгаажуулна. */}
      <Panel title={tr('Объектын нягтрал — цахилгаан')} note={tr('ш / км')}>
        <Data q={powQ} loading={tr('Татаж байна…')}>
          {() => {
            const rows = packs
              .filter((p) => p.len > 0 && p.n > 0)
              .map((p) => ({ ...p, per: p.n / (p.len / 1000) }))
              .sort((a2, b2) => b2.per - a2.per);
            if (!rows.length) return <Empty label={tr('Уртын бүртгэл алга.')} />;
            return (
              <Bars
                inline
                selected={sel}
                onSelect={pick}
                items={heatBars(rows, (p) => ({
                  key: p.key,
                  label: p.label,
                  value: p.per,
                  display: tr('{0} ш/км · {1} ш / {2} км', num(p.per, 1), num(p.n), km(p.len, 1)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* ХУВААРИЛАЛТ ХЭРЭГЛЭГЧИЙН БҮЛГЭЭР — «Багцад хуваарилсан чадал» карт нь
          орон сууцны 7 багцын 14.19 МВт-ыг л харуулна. Гэтэл хуваарилалтын
          хүснэгтэд өөр хэрэглэгчид ч бий: олон нийтийн бүс, сургууль,
          цэцэрлэг, одоо байгаа хэрэглэгч. Тэднийг харуулахгүй бол 14.19 МВт
          нь сүлжээний БҮХ ачаалал мэт уншигдана. */}
      <Panel title={tr('Чадлын хуваарилалт — хэрэглэгчийн бүлгээр')} note={tr('МВт · хуваарилсан дүнгээс')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const pw = rows.filter((r) => srcStr(r[F.type]).startsWith('Цахилгаан'));
            if (!pw.length) return <Empty label={tr('Бүртгэл алга.')} />;
            /** Хэрэглэгчийн БҮЛЭГ бүрийн нийлбэр — `SOURCE_FS.consumers`-аар */
            const group = (pred: (key: string) => boolean) =>
              sumBy(
                SOURCE_FS.consumers.filter((c) => pred(c.key)),
                (c) => sumBy(pw, (r) => srcNum(r[c.field])),
              );
            const list = [
              { key: 'pack', label: tr('Орон сууцны багц'), mw: group((k) => /^b\d/.test(k)) },
              { key: 'olon', label: tr('Олон нийтийн бүс'), mw: group((k) => k === 'olon') },
              { key: 'odoo', label: tr('Одоо байгаа хэрэглэгч'), mw: group((k) => k === 'odoo') },
              { key: 'sur', label: tr('Сургууль, цэцэрлэг'), mw: group((k) => k === 'sur') },
            ].filter((x) => x.mw > 0).sort((a2, b2) => b2.mw - a2.mw);
            if (!list.length) return <Empty label={tr('Хуваарилсан чадлын өгөгдөл алга.')} />;
            const tot = sumBy(list, (x) => x.mw);
            return (
              <Bars
                inline
                max={tot}
                items={heatBars(list, (x) => ({
                  key: x.key,
                  label: x.label,
                  value: x.mw,
                  display: tr('{0} МВт · {1}', num(x.mw, 2), pct((x.mw / tot) * 100, 0)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* ДЭД СТАНЦЫН АЧААЛАЛ — станц бүрийн ЗАРЛАСАН чадал ба түүн рүү
          бүртгэгдсэн хэрэглэгчийн нийлбэрийг ЗЭРЭГЦҮҮЛНЭ. */}
      <Panel title={tr('Дэд станцын ачаалал')} note={tr('зарласан чадал / бүртгэгдсэн хэрэглэгч, МВт')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const list = rows
              .filter((r) => srcStr(r[F.type]).startsWith('Цахилгаан'))
              .map((r) => ({
                key: srcStr(r[F.name]),
                label: shortSrc(srcStr(r[F.name])),
                cap: srcNumN(r[F.total]),
                load: sumBy(SOURCE_FS.consumers, (c) => srcNum(r[c.field])),
              }))
              .filter((x) => (x.cap ?? 0) > 0 || x.load > 0)
              .sort((a2, b2) => b2.load - a2.load);
            if (!list.length) return <Empty label={tr('Бүртгэл алга.')} />;
            const top = Math.max(...list.map((x) => Math.max(x.cap ?? 0, x.load)));
            return (
              <Bars
                inline
                max={top}
                items={heatBars(list, (x) => ({
                  key: x.key,
                  label: x.label,
                  value: x.load,
                  display: tr('{0} / {1} МВт', num(x.load, 1), num(x.cap, 1)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>
    </>
  );
}

/* ══════════════════ 07 · Эх үүсвэр ══════════════════ */

const srcNumN = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};
/** НИЙЛБЭРТ — хоосон нүд нийлбэрт юу ч нэмэхгүй (0) */
const srcNum = (v: unknown) => srcNumN(v) ?? 0;
const srcStr = (v: unknown) => String(v ?? '').replace(/​/g, '').trim();

function SourceDetail({ sources, d, flt, onFlt }: { sources: Async<Row[]>; d: DashData } & FltProps) {
  const F = SOURCE_FS.fields;
  const sel = flt?.sec === 'source' ? flt.key : null;
  /**
   * Байгууламж дарахад — зурагт тэр байгууламжийг тодруулна. Нэрийн төгсгөлд
   * үл үзэгдэх тэмдэгт (ZWSP) байдаг тул `=` биш `LIKE 'нэр%'`-ээр жишинэ.
   */
  const pick = (name: string) => {
    if (!name || name.startsWith('#')) return;
    onFlt({
      sec: 'source', key: name, label: tr('Эх үүсвэр: {0}', name),
      where: likePrefix(F.name, name), only: ['source:eh'],
    });
  };
  if (sources.state !== 'ready') {
    return (
      <Panel title={tr('Эх үүсвэр')}>
        <Data q={sources} loading={tr('Эх үүсвэрийн мэдээллийг татаж байна…')} minH={420}>{() => null}</Data>
      </Panel>
    );
  }
  const rows = sources.data;
  const TYPE_ORDER = ['Дулаан', 'Цахилгаан', 'Ус'];
  const rank = (t: string) => {
    const i = TYPE_ORDER.findIndex((x) => t.startsWith(x));
    return i < 0 ? 99 : i;
  };
  const types = [...new Set(rows.map((r) => srcStr(r[F.type])))]
    .filter(Boolean)
    .sort((a, b) => rank(a) - rank(b));
  const untyped = rows.filter((r) => !srcStr(r[F.type])).length;
  if (!types.length) return <Empty label={tr('Эх үүсвэрийн бүртгэл хоосон байна.')} />;
  return (
    <>
      {/* `нийт_чадал` нь өнөөдөр зөвхөн Donut-ийн нөөц утга — байгууламжийн
          БҮРЭН чадал нь тоогоор хаана ч гардаггүй байв. */}
      <Panel title={tr('Эх үүсвэрийн нэгдсэн чадал')}>
        <Stats cols={3}>
          {types.map((t, i) => {
            const facs = rows.filter((r) => srcStr(r[F.type]) === t);
            const isWater = t.includes('Ус');
            const unit = isWater ? tr('м³/хон') : tr('МВт');
            const cap = sumBy(facs, (r) => srcNum(r[F.total]));
            return (
              <Stat
                key={t}
                accent
                color={HUE[(i * 2) % HUE.length]}
                value={cap ? num(cap, isWater ? 0 : 1) : '—'}
                unit={unit}
                label={tr('{0} · {1} байгууламж', t.replace(/\s*эх\s+үүсвэр\s*$/u, ''), num(facs.length))}
              />
            );
          })}
          {(() => {
            const state = (r: Row) => {
              const n2 = srcStr(r[F.name]);
              if (/^Одоо байгаа/u.test(n2)) return 'now';
              if (/^Баригдаж буй/u.test(n2)) return 'build';
              if (/^Шинээр/u.test(n2)) return 'plan';
              return 'none';
            };
            const cnt = (k: string) => rows.filter((r) => state(r) === k).length;
            return (
              <>
                <Stat accent color={cat(6)} value={num(rows.length)} unit={tr('ш')} label={tr('Нийт байгууламж')} />
                <Stat accent color={cat(7)} value={num(cnt('now') + cnt('none'))} unit={tr('ш')} label={tr('Ашиглалтад байгаа')} />
                <Stat accent color={cat(8)} value={num(cnt('build') + cnt('plan'))} unit={tr('ш')} label={tr('Баригдаж буй · төлөвлөсөн')} />
              </>
            );
          })()}
        </Stats>
        <p className={o.note}>
          {tr('Байгууламжийн БҮРЭН чадал (')}<code>{'нийт_чадал'}</code>{tr(') — доорх картуудын зүсмэг нь системд эзлэх ХУВЬ, багана нь ХЭРЭГЛЭГЧИД хуваарилсан чадал.')}
          {untyped > 0 && <> {tr('⚠️ Төрөл бүртгэгдээгүй')} <b>{num(untyped)}</b> {tr('байгууламж доорх картуудад ОРООГҮЙ.')}</>}
        </p>
      </Panel>

      {types.map((type) => {
        const facs = rows.filter((r) => srcStr(r[F.type]) === type);
        const cons = SOURCE_FS.consumers
          .map((c) => ({ ...c, value: facs.reduce((a, f) => a + srcNum(f[c.field]), 0) }))
          .filter((c) => c.value > 0);
        const maxCon = maxOf(cons.map((c) => c.value));
        const metric = facs.some((f) => srcNumN(f[F.share]) != null) ? F.share : F.total;
        const valOf = (f: Row) => srcNumN(f[metric]);
        return (
          <Panel key={type} title={type}>
            {facs.length <= 3 ? (
              <Donut
                size="md"
                leaders
                selected={sel}
                onSelect={pick}
                center={`${facs.length}`}
                centerLabel={tr('байгууламж')}
                items={facs.map((f, i) => ({
                  key: srcStr(f[F.name]) || `#${i}`,
                  label: srcStr(f[F.name]),
                  value: valOf(f),
                  display: srcStr(f[metric]),
                  color: cat(i),
                })).filter((x): x is typeof x & { value: number } => x.value != null)}
              />
            ) : (
              <Bars
                inline
                selected={sel}
                onSelect={pick}
                items={heatBars(facs, (f) => ({
                  key: srcStr(f[F.name]) || tr('Нэргүй'),
                  label: srcStr(f[F.name]),
                  value: valOf(f),
                  display: valOf(f) == null ? tr('мэдээлэлгүй') : srcStr(f[metric]),
                }))}
              />
            )}
            {cons.length > 0 && (() => {
              // Ус хангамж → м³/хон, дулаан/цахилгаан → МВт
              const unit = type.includes('Ус') ? tr('м³/хон') : tr('МВт');
              const consTotal = cons.reduce((a, c) => a + c.value, 0);
              return (
                <>
                  <p className={o.note}>
                    {tr('Хэрэглэгчид хуваарилсан хүчин чадал — нийт')} <b>{num(consTotal, 1)} {unit}</b>:
                  </p>
                  <Bars
                    inline
                    items={cons.map((c) => ({
                      key: c.key,
                      label: c.label,
                      value: c.value,
                      display: `${num(c.value, 1)} ${unit}`,
                      color: heat(c.value, maxCon),
                    }))}
                  />
                </>
              );
            })()}
          </Panel>
        );
      })}

      {/* ХҮРЭЛЦЭЭ — чадлыг хүн ам/өрхөд харьцуулна. Хоёулаа `d`-д аль хэдийн
          татагдсан (`headline`, `bagts`) тул ШИНЭ ХҮСЭЛТ ҮҮСЭХГҮЙ. */}
      {/* ══ ЭХ ҮҮСВЭРИЙН ГУРВАН НЭМЭЛТ ЗҮСЭЛТ ══
          Бүгд аль хэдийн татсан `sources` ба `d.bagts`-аас — шинэ хүсэлтгүй. */}

      {/* БЭЛЭН БАЙДАЛ — дээрх картууд нь чадлыг НЭГ тоо болгож нийлүүлдэг:
          «Дулаан 91.8 МВт». Гэвч тэр 91.8-ын 52% нь ХАРААХАН БАРИГДААГҮЙ
          станцынх. Төлвөөр нь салгаж харуулахгүй бол өнөөдрийн хүчин чадал
          ирээдүйн чадалтай нэг мөрөнд уншигдана. */}
      <Panel title={tr('Чадлын бэлэн байдал — төрлөөр')} note={tr('ашиглалтад байгаа хувь')}>
        {(() => {
          const list = types
            .filter((ty) => !ty.includes('Ус'))
            .map((ty) => {
              const facs = rows.filter((r) => srcStr(r[F.type]) === ty);
              const cap = sumBy(facs, (r) => srcNum(r[F.total]));
              const now = sumBy(
                facs.filter((r) => /^Одоо байгаа/u.test(srcStr(r[F.name]))),
                (r) => srcNum(r[F.total]),
              );
              return {
                key: ty,
                label: ty.replace(/\s*эх\s+үүсвэр\s*$/u, ''),
                cap,
                now,
                pct: cap > 0 ? (now / cap) * 100 : 0,
              };
            })
            .filter((x) => x.cap > 0)
            .sort((a2, b2) => b2.pct - a2.pct);
          if (!list.length) return <Empty label={tr('Бүртгэл алга.')} />;
          return (
            <>
              <Bars
                inline
                max={100}
                items={heatBars(list, (x) => ({
                  key: x.key,
                  label: x.label,
                  value: x.pct,
                  display: tr('{0} · {1} / {2} МВт', pct(x.pct, 0), num(x.now, 1), num(x.cap, 1)),
                }))}
              />
              <p className={o.note}>
                {tr('Усан сангууд нэрэндээ төлвийн угтваргүй тул энэ картад ОРООГҮЙ.')}
              </p>
            </>
          );
        })()}
      </Panel>

      {/* НЭГ ӨРХӨД НОГДОХ ХУВААРИЛАЛТ — багц бүрд ХЭДЭН МВт хуваарилсныг доорх
          картууд харуулна. Гэвч Багц 2-т 8.2 МВт, Багц 3.1-д 3.3 МВт байгаа нь
          хоёрдугаар багц илүү «шаардлагатай» гэсэн үг БИШ — тэр зүгээр л том.
          Өрхөд хуваасан үед л багцуудыг ЖИШИЖ болно: өндөр гарсан багц нь
          нэгж орон сууцандаа илүү их чадал төлөвлөсөн гэсэн үг. */}
      <Panel title={tr('Нэг өрхөд ногдох чадал — багцаар')} note={tr('кВт / өрх')}>
        <Data q={d.bagts} loading={tr('Татаж байна…')}>
          {(bag) => {
            /** Багцын шошго → `bagtsKey` (`SOURCE_FS.consumers`-ийн «Багц 3.1») */
            const heatOf = (field: string) =>
              sumBy(rows.filter((r) => srcStr(r[F.type]).startsWith('Дулаан')), (r) => srcNum(r[field]));
            const powOf = (field: string) =>
              sumBy(rows.filter((r) => srcStr(r[F.type]).startsWith('Цахилгаан')), (r) => srcNum(r[field]));
            const list = SOURCE_FS.consumers
              .filter((c) => /^b\d/.test(c.key))
              .map((c) => {
                const key = consumerBagtsKey(c.key);
                const t = ailTotal(bag.filter((x) => x.key === key));
                const ail = t.ail != null && !t.partial ? t.ail : 0;
                return { key, label: c.label, ail, heat: heatOf(c.field), pow: powOf(c.field) };
              })
              .filter((x) => x.ail > 0 && (x.heat > 0 || x.pow > 0))
              .map((x) => ({ ...x, per: (x.heat * 1000) / x.ail }))
              .sort((a2, b2) => b2.per - a2.per);
            if (!list.length) return <Empty label={tr('Хуваарилсан чадлын өгөгдөл алга.')} />;
            return (
              <>
                <Bars
                  inline
                  items={heatBars(list, (x) => ({
                    key: x.key,
                    label: x.label,
                    value: x.per,
                    display: tr('{0} кВт дулаан · {1} кВт цахилгаан', num(x.per, 2), num((x.pow * 1000) / x.ail, 2)),
                  }))}
                />
                <p className={o.note}>
                  {tr('Багана нь ДУЛААНЫ чадал; цахилгаан нь мөрийн утганд.')}
                </p>
              </>
            );
          }}
        </Data>
      </Panel>

      {/* БАГЦЫН ЭЗЛЭХ ХУВЬ ГУРВАН ТӨРЛӨӨР — доорх гурван карт нь төрөл ТУС
          БҮРД жагсаалт өгнө; хооронд нь жиших бол гурван карт хооронд нүдээ
          гүйлгэх шаардлагатай. Энэ нь тэр гурвыг НЭГ мөрөнд нийлүүлж, багц
          дулаанд нэг байр эзэлж атал цахилгаанд өөр байранд байвал шууд
          харагдана — тэр зөрүү нь ихэвчлэн бүртгэлийн алдааны шинж. */}
      <Panel title={tr('Багцын эзлэх хувь — дулаан · цахилгаан · ус')} note={tr('хуваарилсан дүнгээс')}>
        {(() => {
          const shareOf = (typePrefix: string, field: string) => {
            const facs = rows.filter((r) => srcStr(r[F.type]).startsWith(typePrefix));
            const tot = sumBy(
              SOURCE_FS.consumers,
              (c) => sumBy(facs, (r) => srcNum(r[c.field])),
            );
            const mine = sumBy(facs, (r) => srcNum(r[field]));
            return tot > 0 ? (mine / tot) * 100 : null;
          };
          const list = SOURCE_FS.consumers
            .filter((c) => /^b\d/.test(c.key))
            .map((c) => ({
              key: consumerBagtsKey(c.key),
              label: c.label,
              heat: shareOf('Дулаан', c.field),
              pow: shareOf('Цахилгаан', c.field),
              wat: shareOf('Ус', c.field),
            }))
            .filter((x) => (x.heat ?? 0) > 0 || (x.pow ?? 0) > 0 || (x.wat ?? 0) > 0)
            .sort((a2, b2) => (b2.heat ?? -1) - (a2.heat ?? -1));
          if (!list.length) return <Empty label={tr('Хуваарилсан чадлын өгөгдөл алга.')} />;
          return (
            <Bars
              inline
              items={heatBars(list, (x) => ({
                key: x.key,
                label: x.label,
                value: x.heat ?? null,
                display: tr('дул. {0} · цах. {1} · ус {2}', pct(x.heat, 1), pct(x.pow, 1), pct(x.wat, 1)),
              }))}
            />
          );
        })()}
      </Panel>

      <Panel title={tr('Хангамжийн хүрэлцээ — нэгжид ногдох')}>
        {(() => {
          const h = d.headline.state === 'ready' ? d.headline.data : null;
          const ailT = d.bagts.state === 'ready' ? ailTotal(d.bagts.data) : null;
          const ailFull = ailT && ailT.ail != null && !ailT.partial ? ailT.ail : null;
          const capOf = (pre: string) =>
            sumBy(rows.filter((r) => srcStr(r[F.type]).startsWith(pre)), (r) => srcNum(r[F.total]));
          const consOf = (pre: string) => sumBy(
            rows.filter((r) => srcStr(r[F.type]).startsWith(pre)),
            (r) => sumBy(SOURCE_FS.consumers, (c) => srcNum(r[c.field])),
          );
          const heatMw = capOf('Дулаан');
          const elMw = capOf('Цахилгаан');
          const waterM3 = capOf('Ус');
          const share = (a: number, b: number) => (b ? pct((a / b) * 100, 1) : '—');
          return (
            <>
              <Rows
                items={[
                  { key: tr('1,000 хүнд ногдох дулаан'),
                    value: h == null ? dots(d.headline) : h.population > 0 ? tr('{0} МВт', num(heatMw / (h.population / 1000), 2)) : '—' },
                  { key: tr('1 өрхөд ногдох цахилгаан'),
                    value: ailT == null ? dots(d.bagts) : ailFull ? tr('{0} кВт', num((elMw * 1000) / ailFull, 2)) : '—' },
                  { key: tr('1 хүнд ногдох ус'),
                    value: h == null ? dots(d.headline) : h.population > 0 ? tr('{0} л/хоног', num((waterM3 * 1000) / h.population, 0)) : '—' },
                  { key: tr('Дулаан — хуваарилсан ÷ чадал'), value: share(consOf('Дулаан'), heatMw) },
                  { key: tr('Цахилгаан — хуваарилсан ÷ чадал'), value: share(consOf('Цахилгаан'), elMw) },
                  { key: tr('Ус — хуваарилсан ÷ чадал'), value: share(consOf('Ус'), waterM3) },
                ]}
              />
              <p className={o.note}>
                ⚠️ <code>{'нийт_чадал'}</code> {tr('нь ТЕКСТ талбар;')} <code>srcNum</code> {tr('нь таслалыг хаядаг («2,5» → 25). Шинэ мөр нэмэгдэхэд нэг утгыг нүдээр шалгах.')}
              </p>
            </>
          );
        })()}
      </Panel>

      {/* `тайлбар` талбар татагдсан хэрнээ дашбоардад хаана ч гардаггүй байв —
          нөөц/өргөтгөлийн тэмдэглэл нь эх үүсвэрийн ЧУХАЛ контекст. */}
      <Panel title={tr('Байгууламжийн тайлбар, нөөц')}>
        {(() => {
          const items = rows
            .map((r) => {
              const unit = srcStr(r[F.type]).includes('Ус') ? tr('м³/хон') : tr('МВт');
              const cap = srcNum(r[F.total]);
              const note = srcStr(r[F.note]);
              return {
                key: srcStr(r[F.name]) || '—',
                value: [cap ? `${num(cap, 1)} ${unit}` : null, note || null]
                  .filter(Boolean).join(' · ') || '—',
              };
            })
            .filter((x) => x.key !== '—');
          return items.length ? <Rows items={items} /> : <Empty label={tr('Байгууламжийн бүртгэл хоосон.')} />;
        })()}
      </Panel>
    </>
  );
}

/* ══════════════════ 08 · Санхүүжилт, бонд ══════════════════ */

/**
 * ТӨСВИЙН ЭХ = `Cashflow_0909 /0` (CASHFLOW_NEW) — захирамж/гэрээгээр
 * баталгаажсан ТӨСЛИЙН төсөв (2026-08-14, хэрэглэгчийн шийдвэр). Санхүүгийн
 * ганц зөв эх нь cashflow. «Хөрөнгө оруулалт өртөг» /249 бүхэлдээ түр хасагдсан.
 */
/**
 * ₮ — портал даяарх ГАНЦ дүрэм (`format.mnt`): бүтэн, мянгатын таслалтай.
 */
const tug = (v: number): string => mnt(v);

function FinanceDetail({ budget, flt, onFlt }: { budget: Async<Budget> } & FltProps) {
  if (budget.state !== 'ready') {
    return (
      <Panel title={tr('Санхүүжилт')}>
        <Data q={budget} loading={tr('Татаж байна…')}>{() => null}</Data>
      </Panel>
    );
  }
  const bg = budget.data;
  return (
    <>
      <Panel title={tr('Гол үзүүлэлт')}>
        <Stats cols={2}>
          <Stat accent color={HUE[0]} value={num(bg.total)} unit={tr('₮')} label={tr('Төслийн нийт төсөвт өртөг')} />
          <Stat accent color={HUE[1]} value={num(bg.orderTotal)} unit={tr('₮')} label={tr('Захирамжийн нийт дүн')} />
          <Stat accent color={HUE[2]} value={num(bg.contract)} unit={tr('₮')} label={tr('Гэрээ байгуулсан дүн')} />
          {/* Энэ хувь нь урьд нь ЗӨВХӨН зүүн жагсаалтын мөрөнд байсан —
              хэсгээ нээхэд алга болдог байв. */}
          <Stat accent color={HUE[4]}
                value={bg.total ? pct((bg.contract / bg.total) * 100, 1) : '—'}
                label={tr('Гэрээгээр баталгаажсан эзлэх хувь')} />
        </Stats>
      </Panel>
  
      <Panel title={tr('Санхүүжилтийн шат')} note={tr('суурь = нийт төсөвт өртөг {0}', tug(bg.total))}>
        <Bars
          max={bg.total}
          items={[
            { key: 'total', label: tr('Төсөвт өртөг'), value: bg.total },
            { key: 'order', label: tr('Захирамжаар'), value: bg.orderTotal },
            { key: 'contract', label: tr('Гэрээгээр'), value: bg.contract },
          ].map((x, i) => ({
            ...x,
            display: `${tug(x.value)} · ${bg.total ? pct((x.value / bg.total) * 100, 1) : '—'}`,
            color: cat(i),
          }))}
        />
        <p className={o.note}>
          {tr('Захирамжгүй')} <b>{tug(Math.max(0, bg.total - bg.orderTotal))}</b> {tr('· гэрээгүй')} <b>{tug(Math.max(0, bg.orderTotal - bg.contract))}</b>.
        </p>
      </Panel>
  
      <Panel title={tr('Санхүүжилтийн эх үүсвэр (захирамжаар)')}>
        {bg.sources.length <= 3 ? (
          <Donut
            items={bg.sources.map((s, i) => ({
              key: s.key, label: s.label, value: s.value,
              color: cat(i),
              display: mnt(s.value),
            }))}
            center={num(bg.orderTotal)}
            centerLabel={tr('₮')}
            size="lg"
            leaders
          />
        ) : (
          <Bars
            inline
            items={heatBars(
              [...bg.sources].sort((a, b) => b.value - a.value),
              (s) => ({
                key: s.key,
                label: s.label,
                value: s.value,
                display: mnt(s.value),
              }),
            )}
          />
        )}
      </Panel>
  
      <Panel title={tr('Ажлын төрлөөр — төсөвт өртөг')}>
        {bg.byType.length === 0 ? <Empty label={tr('Ажлын төрөл бүртгэгдээгүй.')} /> : (
          <Bars
            items={heatBars(bg.byType, (t) => ({
              key: t.key, label: t.label, value: t.value,
              display: tr('{0} · {1} ажил', tug(t.value), num(t.n)),
            }))}
          />
        )}
      </Panel>
  

      {/* ══ ХӨРӨНГӨ ОРУУЛАЛТЫН ГУРВАН НЭМЭЛТ ЗҮСЭЛТ ══
          Бүгд аль хэдийн татсан `budget`-ээс — шинэ хүсэлтгүй. */}


      <Panel title={tr('Багцаар — төсөвт өртөг')}>
        {bg.byPkg.length === 0 ? <Empty label={tr('Багцын задаргаа бүртгэгдээгүй.')} /> : (
          <Bars
            selected={flt?.sec === 'finance' ? flt.key : null}
            onSelect={(key) => {
              const ids = PKG_BY_BAGTS[key] ?? [];
              if (ids.length) onFlt({ sec: 'finance', key, label: tr('Багц: {0}', key), layers: ids });
            }}
            items={heatBars(bg.byPkg, (t) => {
              const range = /\d\s*[-–]\s*\d/u.test(t.label);
              const key = range ? t.label : bagtsKey(t.label);
              const ids = range ? [] : (PKG_BY_BAGTS[key] ?? []);
              return {
                key,
                label: ids.length ? `${t.label} ▸` : t.label,
                value: t.value,
                display: tr('{0} · {1} ажил', tug(t.value), num(t.n)),
              };
            })}
          />
        )}
        <p className={o.note}>
          {tr('▸ тэмдэгтэй багц нь газрын зурагт давхаргатай — дарж шүүнэ. ⚠️ Задаргаа нь')} <code>CF007</code> {tr('(дэд багцтай),')} <code>CF006</code> {tr('БИШ. ⚠️ «БАГЦ 1-4» гэх завсрын мөр нь ганц багц БИШ тул зурагт холбогдоогүй.')}
        </p>
      </Panel>

      {/* ТӨСВИЙН ТӨВЛӨРӨЛ — «Багцаар» жагсаалт 40 гаруй мөртэй тул нүдээр
          гүйлгэхэд «цөөн багц дийлэнхийг эзэлж байна уу» гэдэг харагддаггүй.
          Гурван бүлэгт хуваавал төвлөрөл нэг харцаар уншигдана: эхний гурав
          дийлэнхийг эзэлж байвал эрсдэл тэдгээрт төвлөрсөн гэсэн үг. */}
      <Panel title={tr('Төсвийн төвлөрөл — багцаар')} note={tr('багцын задаргааны нийлбэрээс')}>
        {bg.byPkg.length < 3 ? <Empty label={tr('Багцын задаргаа бүртгэгдээгүй.')} /> : (() => {
          const sorted = [...bg.byPkg].sort((a2, b2) => b2.value - a2.value);
          const tot = sumBy(sorted, (x) => x.value);
          if (!tot) return <Empty label={tr('Багцын задаргаа бүртгэгдээгүй.')} />;
          const slice = (from: number, to: number) => sumBy(sorted.slice(from, to), (x) => x.value);
          const list = [
            { key: 'top3', label: tr('Эхний 3 багц'), v: slice(0, 3), n: Math.min(3, sorted.length) },
            { key: 'next7', label: tr('4–10 дугаар багц'), v: slice(3, 10), n: Math.max(0, Math.min(10, sorted.length) - 3) },
            { key: 'rest', label: tr('Үлдсэн багцууд'), v: slice(10, sorted.length), n: Math.max(0, sorted.length - 10) },
          ].filter((x) => x.v > 0);
          return (
            <Donut
              size="lg"
              leaders
              center={num(sorted.length)}
              centerLabel={tr('багц')}
              items={list.map((x, i) => ({
                key: x.key,
                label: x.label,
                value: x.v,
                color: cat(i),
                display: tr('{0} · {1} · {2} мөр', pct((x.v / tot) * 100, 1), tug(x.v), num(x.n)),
              }))}
            />
          );
        })()}
      </Panel>
    </>
  );
}

/* ══════════════════ 07 · Үр өгөөж ══════════════════ */


function Pending({ failed, label }: { failed: boolean; label?: string }) {
  return failed
    ? <Empty label={tr('Өгөгдөл татагдсангүй')} hint={tr('Толгойн «Шинэчлэх» (↻) товчоор дахин оролдоно уу.')} />
    : <Loading label={label} />;
}

/**
 * БҮХ ТОО АМЬД. Илтгэлийн BENEFITS/PUBLIC_ZONE/SOCIAL хатуу мөрүүд хасагдаж,
 * үлдсэн нь үйлчилгээнээс бодогдоно (headline/social нь `d`-гээс).
 */
export function BenefitDetail({ bagts, d, flt, onFlt }: { bagts: Async<BagtsRow[]>; d: DashData } & FltProps) {
  const ailT = bagts.state === 'ready' ? ailTotal(bagts.data) : null;
  const ail = ailT?.ail ?? null;
  const h = d.headline.state === 'ready' ? d.headline.data : null;
  const soc = d.social.state === 'ready' ? d.social.data : null;
  const sel = flt?.sec === 'benefit' ? flt.key : null;
  const selLayer = sel != null && LAYER_BY_ID[sel] != null ? sel : null;
  const selCat = sel != null && LAYER_BY_ID[sel] == null ? sel : null;
  /**
   * Нийгмийн барилга тус бүрийн СУУРИЙН ТАЛБАЙ (м²) — давхаргын геометрээс.
   */
  const socLayers = SOC_PACK_IDS.map((id) => ({
    id,
    key: bagtsKey(LAYER_BY_ID[id]?.note),
    label: LAYER_BY_ID[id]?.title ?? id,
  }));
  const socFailN = totalsFailN(d.socTotals, SOC_PACK_IDS);
  const socQ = completeTotals(d.socTotals, SOC_PACK_IDS);
  const socTot = socQ.state === 'ready' ? socQ.data : null;
  const socPacks = socLayers.map((l) => {
    const q = socTot ? socTot.get(l.id) : null;
    return {
      ...l,
      n: q?.n ?? 0,
      m2: q?.q ?? null,
    };
  }).filter((x) => x.n > 0);
  const socM2 = socTot
    ? completeSum(socTot, knownIds(SOC_PACK_IDS), (t) => (t.q != null ? t.q : t.n === 0 ? 0 : null))
    : null;
  const capKnown = soc != null && soc.rows.some((r) => r.capacity != null);
  const capTotal = soc != null && capKnown ? sumBy(soc.rows, (r) => r.capacity ?? 0) : null;
  const capPartial = capTotal != null && !!soc && !soc.rows.every((r) => r.capacity != null && !r.capPartial);
  const capFull = capPartial ? null : capTotal;

  /**
   * Ангилал дарахад — зурагт тэр төрлийн барилгын давхаргууд л үлдэнэ.
   */
  const pick = (key: string) => {
    const row = soc?.rows.find((r) => r.key === key);
    const ids = (row?.per ?? []).map((x) => x.id).filter((id) => id.startsWith('pkg:'));
    if (row && ids.length) onFlt({ sec: 'benefit', key, label: tr('Нийгэм: {0}', row.label), layers: ids });
  };

  return (
    <>
      <Panel title={tr('Иргэдийн амьдралын чанар')}>
        <Stats cols={2}>
          <Stat accent color={HUE[0]} value={h == null ? dots(d.headline) : hVal(h, h.population, (v) => num(v))} unit={tr('хүн')} label={tr('Шинэ орон сууцанд амьдрах хүн ам')} />
          <Stat accent color={HUE[1]} value={ail == null ? dots(bagts) : ailT?.partial ? `${num(ail)} (${tr('дутуу')})` : num(ail)} unit={tr('өрх')} label={tr('Айл өрх шинэ орон сууцтай')} />
          <Stat accent color={HUE[2]} value={soc == null ? dots(d.social) : num(soc.totalN)} unit={tr('ш')} label={tr('Нийгмийн үйлчилгээний барилга')} />
          <Stat accent color={HUE[3]} value={h?.greenHa == null ? '—' : num(h.greenHa, 1)} unit={tr('га')} label={tr('Ногоон байгууламж')} />
          {/* ХОЁР «үр өгөөж»-ийн харьцаа — шинэ хүсэлт ШААРДАХГҮЙ, `soc`/`headline`
              аль хэдийн татагдсан. «Хэдэн барилга» гэдгээс «хэдэн хүүхэд суух вэ»
              нь иргэдэд утга учиртай тоо. */}
          <Stat accent color={HUE[4]}
                value={soc == null ? dots(d.social) : capTotal == null ? '—' : capPartial ? `${num(capTotal)} (${tr('дутуу')})` : num(capTotal)}
                unit={tr('хүчин чадал')} label={tr('Нийгмийн байгууламжийн багтаамж')} />
          <Stat accent color={HUE[5]}
                value={h != null && ail != null
                  ? (ail > 0 && !ailT?.partial ? hVal(h, h.investTotal, (v) => num(v / ail)) : '—')
                  : dots(d.headline, bagts)}
                unit={tr('₮')} label={tr('1 өрхөд ногдох төсөв')} />
          <Stat accent color={cat(6)}
                value={socTot == null ? dots(socQ) : socM2 != null && socM2 > 0 ? num(socM2) : '—'}
                unit={tr('м²')} label={tr('Барилгын суурийн талбай')} />
          <Stat accent color={cat(7)}
                value={h != null && soc != null
                  ? (capFull != null && Number.isFinite(h.population) && h.population > 0 ? num((capFull / h.population) * 1000) : hVal(h, h.population, () => '—'))
                  : dots(d.headline, d.social)}
                unit={tr('/ 1,000 хүн')} label={tr('Хүчин чадлын хангамж')} />
        </Stats>
        <TotalsFailNote n={socFailN} />
      </Panel>

      {/* Хоёр талбар хоёул `d.headline`-д БИЙ — эзлэх ХУВЬ (1-р картын үнэмлэхүй
          га БИШ) нь «хангалттай юу» гэдэгт хариулна. */}
      <Panel title={tr('Ногоон байгууламжийн хүрэлцээ')}>
          <Stats cols={2}>
            <Stat accent color={HUE[1]} value={h == null ? dots(d.headline) : hVal(h, h.areaHa, (n) => num(n, 1))} unit={tr('га')} label={tr('Төслийн талбай')} />
            <Stat accent color={HUE[2]}
                  value={h?.greenHa == null || !h.population ? '—' : num((h.greenHa * 10_000) / h.population, 1)}
                  unit={tr('м²/хүн')} label={tr('Нэг хүнд ногоон байгууламж')} />
          </Stats>
        <p className={o.note}>
          {tr('Ногоон талбай нь test_data [35]')} <code>Shape__Area</code> {tr('÷ 10,000; төслийн талбай нь хилийн')} <code>Hec_area</code>.
        </p>
      </Panel>

      <Panel title={tr('Ногоон байгууламжид эзлэх хувь')}>
        <RingCard
          value={h == null || h.greenHa == null || !h.areaHa ? null : (h.greenHa / h.areaHa) * 100}
          label={tr('төслийн талбайд эзлэх')}
          decimals={1}
        />
      </Panel>

      <Panel title={tr('Нийгмийн дэд бүтэц · шинээр')}>
        {soc == null ? <Pending failed={d.social.state === 'error'} label={tr('Татаж байна…')} /> : (
          <Bars
            inline
            selected={selCat}
            onSelect={pick}
            items={soc.rows.map((r, i) => ({
              key: r.key,
              label: r.label,
              value: r.n,
              display: r.capacity != null
                ? `${tr('{0} ш · {1} хүчин чадал', num(r.n), num(r.capacity))}${r.capPartial ? ` (${tr('дутуу')})` : ''}`
                : tr('{0} ш', num(r.n)),
              color: cat(i),
            }))}
          />
        )}
      </Panel>

      {/* `capacity` нь өнөөдөр дээрх картын `display`-д ТЕКСТ л байдаг. 3 сургууль
          ба 3,780 суудал бол ӨӨР хоёр түүх — тусад нь зурна. */}
      <Panel title={tr('Хүчин чадал — суудал, орны тоо')}>
        {soc == null ? <Pending failed={d.social.state === 'error'} label={tr('Татаж байна…')} /> : (() => {
          const withCap = soc.rows.filter((r) => r.capacity != null && r.capacity > 0);
          if (!withCap.length) return <Empty label={tr('Хүчин чадлын талбар бөглөгдөөгүй.')} />;
          return (
            <>
              <Bars
                inline
                selected={selCat}
                onSelect={pick}
                items={heatBars(withCap, (r) => ({
                  key: r.key,
                  label: r.label,
                  value: r.capacity as number,
                  display: tr('{0} · {1} барилга', num(r.capacity as number), num(r.n)),
                }))}
              />
              {withCap.length < soc.rows.length && (
                <p className={o.note}>
                  ⚠️ <code>Huchin_chadal</code> {tr('бөглөгдөөгүй')} {num(soc.rows.length - withCap.length)} {tr('ангилал энэ картад ОРООГҮЙ (тоогоор нь дээрх картад бий).')}
                </p>
              )}
            </>
          );
        })()}
      </Panel>

      {/*
          Оронд нь ХЭМЖЭЭ: барилгын суурийн талбай нь 11 барилга дээр БҮГД
          бөглөгдсөн (1560 хүүхдийн сургууль 4,411 м² … төрийн үйлчилгээ
          126 м²). Нийгмийн багцын гүйцэтгэлийг бүртгэдэг эх сурвалж гарвал
          явцын картыг энд буцааж нэмнэ. */}
      <Panel title={tr('Барилгын суурийн талбай — багцаар')} note={tr('м²')}>
        <Data q={socQ} loading={tr('Татаж байна…')}>
          {() => {
            const rows2 = [...socPacks].sort((a2, b2) => (b2.m2 ?? -1) - (a2.m2 ?? -1));
            if (!rows2.length) return <Empty label={tr('Барилгын давхарга алга.')} />;
            return (
              <Bars
                inline
                selected={selLayer}
                onSelect={(key) => onFlt({
                  sec: 'benefit',
                  key,
                  label: LAYER_BY_ID[key]?.title ?? key,
                  layers: [key],
                })}
                items={heatBars(rows2, (x) => ({
                  key: x.id,
                  label: x.label,
                  value: x.m2 ?? null,
                  display: x.n > 1
                    ? tr('{0} м² · {1} барилга', num(x.m2), num(x.n))
                    : tr('{0} м²', num(x.m2)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* НЭГ СУУДАЛД НОГДОХ СУУРИЙН ТАЛБАЙ — сургууль, цэцэрлэгийн барилгыг
          хооронд нь жишихэд нийт талбай тохирдоггүй: 1560 хүүхдийн сургууль
          240 ортой цэцэрлэгээс том байх нь тодорхой. Суудалд хуваасан үед л
          зураг төслийн НОРМ харагдана — хэт бага гарсан барилга нь давчуу,
          хэт өндөр нь үнэтэй. */}
      <Panel title={tr('Нэг суудалд ногдох суурийн талбай')} note={tr('м² / суудал')}>
        <Data q={socQ} loading={tr('Татаж байна…')}>
          {() => {
            if (soc == null) return <Pending failed={d.social.state === 'error'} label={tr('Татаж байна…')} />;
            /** Давхаргын гарчиг → хүчин чадал (`SocialRow.per`-ээс) */
            const capOf = new Map<string, number>();
            soc.rows.forEach((r) => r.per.forEach((x) => {
              if (x.capacity != null && x.capacity > 0) capOf.set(x.title, x.capacity);
            }));
            const rows2 = socPacks
              .map((x) => ({ ...x, cap: capOf.get(x.label) ?? 0 }))
              .filter((x) => x.cap > 0 && x.m2 != null && x.m2 > 0)
              .map((x) => ({ ...x, m2: x.m2 as number, per: (x.m2 as number) / x.cap }))
              .sort((a2, b2) => b2.per - a2.per);
            if (!rows2.length) return <Empty label={tr('Хүчин чадал бүртгэгдээгүй.')} />;
            return (
              <Bars
                inline
                items={heatBars(rows2, (x) => ({
                  key: x.id,
                  label: x.label,
                  value: x.per,
                  display: tr('{0} м²/суудал · {1} м² / {2}', num(x.per, 2), num(x.m2), num(x.cap)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* НИЙГМИЙН БАГЦЫН ТӨСӨВ — эдгээр багцын төсөв 08 «Хөрөнгө оруулалт»-ын
          51 мөрт жагсаалтад булагдсан байдаг. Нийгмийн дэд бүтцийн харагдац
          дээр «хэдэн суудал» ба «хэдэн төгрөг» хоёр ЗЭРЭГ байх нь зөв: суудлын
          өртөг нь барилгуудыг хооронд нь жиших цорын ганц мөнгөн хэмжүүр. */}
      <Panel title={tr('Нийгмийн багцын төсөв')} note={tr('нэг суудлын өртөг')}>
        <Data q={d.budget} loading={tr('Татаж байна…')}>
          {(bg2) => {
            /** Давхаргын гарчиг → хүчин чадал */
            const capOf = new Map<string, number>();
            soc?.rows.forEach((r) => r.per.forEach((x) => {
              if (x.capacity != null && x.capacity > 0) capOf.set(x.title, x.capacity);
            }));
            /** Багцын түлхүүр → нийгмийн давхаргууд */
            const byKey = new Map<string, typeof socLayers>();
            socLayers.forEach((p) => {
              const arr = byKey.get(p.key) ?? [];
              arr.push(p);
              byKey.set(p.key, arr);
            });
            const rows2 = bg2.byPkg
              .map((b) => ({ b, key: bagtsKey(b.label) }))
              .filter((x) => byKey.has(x.key) && x.b.value > 0)
              .map((x) => {
                const layers = byKey.get(x.key) ?? [];
                const cap = sumBy(layers, (l) => capOf.get(l.label) ?? 0);
                return {
                  key: x.key,
                  label: layers[0]?.label ?? x.b.label,
                  value: x.b.value,
                  cap,
                  per: cap > 0 ? x.b.value / cap : 0,
                };
              })
              .sort((a2, b3) => b3.value - a2.value);
            if (!rows2.length) return <Empty label={tr('Нийгмийн багцын төсөв бүртгэгдээгүй.')} />;
            return (
              <Bars
                inline
                items={heatBars(rows2, (x) => ({
                  key: x.key,
                  label: x.label,
                  value: x.value,
                  display: x.cap > 0
                    ? tr('{0} · {1}/суудал', tug(x.value), mnt(x.per))
                    : tug(x.value),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* 1,000 ХҮНД НОГДОХ ХҮЧИН ЧАДАЛ — «3,780 суудал» гэсэн тоо нь ганцаараа
          хангалттай эсэхийг хэлдэггүй. Хүн амд харьцуулсан үед л норматив
          яриа болно: 43,287 хүнд ногдох сургуулийн суудал, цэцэрлэгийн ор.
          Ногоон байгууламжийн «13.6 м²/хүн»-тэй ИЖИЛ логик. */}
      <Panel title={tr('1,000 хүнд ногдох хүчин чадал')} note={tr('шинэ орон сууцны хүн амаар')}>
        {(() => {
          if (soc == null || h == null) {
            return <Pending failed={d.social.state === 'error' || d.headline.state === 'error'} label={tr('Татаж байна…')} />;
          }
          if (h.population == null || !h.population) {
            return <Empty label={tr('Хүн амын тоо бүртгэгдээгүй')} hint={tr('Шинэ орон сууцны хүн ам бүртгэгдсэний дараа харьцаа бодогдоно.')} />;
          }
          const rows2 = soc.rows
            .filter((r) => (r.capacity ?? 0) > 0)
            .map((r) => ({
              key: r.key,
              label: r.label,
              cap: r.capacity as number,
              per: ((r.capacity as number) / (h.population as number)) * 1000,
            }))
            .sort((a2, b2) => b2.per - a2.per);
          if (!rows2.length) return <Empty label={tr('Хүчин чадал бүртгэгдээгүй.')} />;
          return (
            <Bars
              inline
              selected={selCat}
              onSelect={pick}
              items={heatBars(rows2, (x) => ({
                key: x.key,
                label: x.label,
                value: x.per,
                display: tr('{0} / 1,000 хүн · нийт {1}', num(x.per, 1), num(x.cap)),
              }))}
            />
          );
        })()}
      </Panel>

      {/* ТӨСӨВТ ЭЗЛЭХ ХУВЬ — «нийгмийн дэд бүтэц 116,600,000,000 ₮» гэсэн дүн
          08-д бий боловч тэнд ажлын БУСАД төрлүүдийн хажууд байгаа тул
          «төслийн хэдэн хувь вэ» гэсэн асуултад шууд хариулдаггүй. Нийгмийн
          дэд бүтцийн харагдац дээр яг тэр харьцаа хэрэгтэй: иргэдэд хамгийн
          ойр байгууламжууд төсвийн ямар хэсгийг эзэлж байна вэ. */}
      <Panel title={tr('Төсөвт эзлэх нийгмийн дэд бүтэц')} note={tr('НИЙТ ба нийгмийн дэд бүтцийн төсөвт өртөгөөс')}>
        <Data q={d.budget} loading={tr('Татаж байна…')}>
          {(bg2) => {
            const socKeys = new Set(socLayers.map((p) => p.key));
            const socSum = sumBy(
              bg2.byPkg.filter((b) => socKeys.has(bagtsKey(b.label))),
              (b) => b.value,
            );
            if (!bg2.total || !socSum) return <Empty label={tr('Нийгмийн багцын төсөв бүртгэгдээгүй.')} />;
            const base = bg2.total + socSum;
            const list = [
              { key: 'soc', label: tr('Нийгмийн дэд бүтэц'), v: socSum },
              { key: 'rest', label: tr('НИЙТ (Орон сууцны хороолол+ГИШС)'), v: bg2.total },
            ].filter((x) => x.v > 0);
            return (
              <Donut
                size="lg"
                leaders
                center={pct((socSum / base) * 100, 1)}
                centerLabel={tr('нийгэм')}
                items={list.map((x, i) => ({
                  key: x.key,
                  label: x.label,
                  value: x.v,
                  color: cat(i),
                  display: tr('{0} · {1}', tug(x.v), pct((x.v / base) * 100, 1)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* Барилга ТУС БҮРЭЭР — `loadSocial` давхарга тутамд count+sum аль хэдийн
          асуудаг байсныг (`SocialRow.per`) дүнг нь хаяхаа больж ил гаргав. */}
      <Panel title={tr('Барилга тус бүрээр — тоо, хүчин чадал')}>
        {soc == null ? <Pending failed={d.social.state === 'error'} label={tr('Татаж байна…')} /> : (
          <Rows
            items={soc.rows.flatMap((r) => r.per.map((x) => ({
              key: x.title,
              value: x.capacity == null ? tr('{0} ш', num(x.n)) : tr('{0} ш · {1} хүчин чадал', num(x.n), num(x.capacity)),
            })))}
          />
        )}
      </Panel>
    </>
  );
}

/* «Тохиромжтой байдлын үнэлгээ» (suit) хэсэг ерөнхий дашбоардаас ХАСАГДСАН
   (2026-08-14, хэрэглэгчийн шийдвэр). Дэлгэрэнгүй үнэлгээ нь ТУСДАА «Тохиромжтой
   байдлын үнэлгээ» (analysis) харагдацад хэвээр. `useSuitability`/`SuitSummary`
   нь нүүрийн CEO KPI (ExecKpi)-д хэрэгтэй тул export хэвээр үлдэв. */
