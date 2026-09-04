'use client';

import {
  Children, Fragment, isValidElement, useCallback, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import {
  Donut, Ring, Bars, Series, Data, Stats, Stat, Empty, Rows,
  Trend,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { LayerCatalog } from '@/components/LayerCatalog';
import { MapTools } from '@/components/MapTools';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useAsync, type Async } from '@/lib/useAsync';
import { usePlanTotals, type Totals } from '@/lib/totals';
import { queryFeatures, type Row } from '@/lib/query';
import {
  ZONE_LAYER, ZONE_FIELD, ZONE_NONE, BUILT_LAYER, BUILDING,
  LAYER_BY_ID, PARCEL_LEFT, PARCEL_STATUS_HUES, SOURCE_FS, TASK_SHEET,
  PLAN_LAYER_IDS, MONITOR_LAYER_IDS, INITIAL_MAP_LAYERS,
  PKG_BY_FAMILY, PKG_BY_BAGTS, LAYERS, PROGRESS_LEVELS, bagtsKey, type PkgFamily,
} from '@/lib/services';
/* (2026-08-21) analysis/config·data·costs·score импортууд `@/lib/execData` руу
   нүүсэн — үлдсэн дуудагч нь тэнд байгаа useSuitability байсан. */
/* ⚠️ Модулиас модуль руу импорт: `loadFinData` нь Finance-д, `aggregateMonths`
   нь Tsogts-д. Хоёулаа `cached` тул давхар хүсэлт үүсэхгүй — «Багцын санхүү»
   харагдацын аль хэдийн уншсан үр дүнг хуваалцана. */
import { loadFinData, type FinData } from '@/modules/Finance';
import { aggregateMonths } from '@/modules/PkgProg';
import {
  loadBlockProgress, loadBlockHistory, progressSeries,
  type BlockProgressMap, type BlockHistory,
} from '@/lib/blockProgress';
import { sumBy, maxOf } from '@/lib/agg';
import { loadLandStatus, type LandStatus } from '@/lib/land';
import { cat, mnt, num, pct, shade, shades, tint, CAT_LIGHT, NO_DATA, km } from '@/lib/format';
import { BAGTS_ORIGIN } from '@/lib/brief';
import {
  loadHeadline, loadSocial, loadBudget, loadPkgProgress, latestPkgProgress,
  cached,
  type Headline, type SocialLive, type Budget, type PkgProgressRow,
} from '@/lib/live';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import o from './dashboardOv.module.css';

/**
 * ЕРӨНХИЙ ДАШБОАРД — ЗҮҮН ЖАГСААЛТ · ТӨВД ЗУРАГ · БАРУУНД ДЭЛГЭРЭНГҮЙ.
 *
 *   ┌────────────┬──────────────────────┬──────────────────┐
 *   │ 7 хэсгийн  │  Толгойн үзүүлэлт    │ Сонгосон хэсгийн │
 *   │ жагсаалт   │  ГАЗРЫН ЗУРАГ        │ дэлгэрэнгүй      │
 *   │ (ОЛОН      │                      │ (сонголт бүрд    │
 *   │  сонголт)  │                      │  нэг БАГАНА)     │
 *   └────────────┴──────────────────────┴──────────────────┘
 *
 * ⚠️ ӨНГӨНИЙ ДҮРЭМ — өнгө нь ЗӨВХӨН УТГА илэрхийлнэ, чимэглэл БИШ:
 *   · төлөв (дуусах шатанд / идэвхтэй / эхлээгүй)
 *   · хүндрэл (татгалзсан / яригдаж буй)
 *   · нэг диаграм доторх зэргэлдээ зүсмэгийг ялгах шаталбар
 * Бусад БҮХ тоо саарал шаталбараар (`--ink` → `--ink-3`) ялгарна. Урьд нь
 * үзүүлэлт бүр өөрийн өнгөтэй байсан — 30 гаруй өнгө нэг дэлгэцэд гарч, аль нь
 * чухал болох нь мэдэгдэхээ больсон. Шинэ өнгө нэмэхээсээ өмнө: энэ өнгө ЯМАР
 * УТГА заах вэ?
 *
 * ⚠️ Тоо бүр ArcGIS-ээс ирнэ. Амьд эх сурвалж БАЙХГҮЙ үзүүлэлт л `@/lib/brief`-д
 * бэхлэгдэж, дэлгэцэд ◆ тэмдэгтэй гарна.
 */

/* ══════════════════ Хэсгүүд ══════════════════ */

type SecKey = 'scope' | 'schedule' | 'bagts' | 'land' | 'network' | 'power' | 'source' | 'finance' | 'benefit';

const SECTIONS: { key: SecKey; no: string; title: string }[] = [
  { key: 'scope', no: '01', title: tr('Төслийн цар хүрээ') },
  { key: 'schedule', no: '02', title: tr('Хэрэгжилтийн ерөнхий график') },
  { key: 'land', no: '03', title: tr('Газар чөлөөлөлтийн одоогийн төлөв') },
  { key: 'bagts', no: '04', title: tr('Орон сууцны бүс') },
  { key: 'network', no: '05', title: tr('Шугам сүлжээ') },
  { key: 'power', no: '06', title: tr('Цахилгаан') },
  { key: 'source', no: '07', title: tr('Эх үүсвэр') },
  { key: 'finance', no: '08', title: tr('Хөрөнгө оруулалт, бонд') },
  { key: 'benefit', no: '09', title: tr('Нийгмийн дэд бүтэц') },
];

/**
 * Хэсэг → тэр хэсгийн ГАЗРЫН ЗУРГИЙН давхаргууд. Хэсгийг нээхэд эдгээр асаж,
 * хаахад унтарна — «энэ тоо зурган дээр ХААНА байна вэ» гэдэг холбоо.
 *
 * ⚠️ ХООСОН массив нь алдаа БИШ: 01 (цар хүрээ), 02 (хэрэгжилтийн график),
 * 06 (санхүүжилт) гурав нь зөвхөн ХҮСНЭГТЭН үзүүлэлт — эдгээрийг зурагт
 * буулгах феатур давхарга ОГТ БАЙХГҮЙ (төслийн нэгдсэн график, оны санхүүжилт,
 * бондын хуваарь нь геометргүй). Хоосныг нь дэлгэцэд ил хэлнэ, эс бөгөөс
 * хэрэглэгч «яагаад зураг өөрчлөгдөхгүй байна» гэж эргэлзэнэ.
 *
 * ⚠️ Багцын давхаргыг `PKG_BY_FAMILY`-ээс авна — гараар жагсаавал `PKG_TABLE`
 * өөрчлөгдөхөд чимээгүй хоцорно.
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
  // ⚠️ `src`-гүй бол самбарын 11 багцын 7 нь зурагт БАЙХГҮЙ (Багц 7, 10–15) —
  //    самбар нь тэдгээрийг тоолж байхад зураг нь дүлий байдаг байв.
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
const CATALOG_IDS = [...MONITOR_LAYER_IDS, ...PLAN_LAYER_IDS];


/* ◆ Pin тэмдэглэгээ 2026-08-13-нд УСТСАН — бэхлэгдсэн тоо үлдээгүй,
   бүх үзүүлэлт ArcGIS үйлчилгээнээс амьдаар гарна (@/lib/live · @/lib/land). */

/* ══════════════════ Хэмжээ сунгах бариул ══════════════════ */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ⚠️ 2026-08-17: `useStoredWidth` ба `Grip` ХАСАГДСАН — дашбоардад өргөн чирэх
   бариул үлдсэнгүй: хэсгүүдийн жагсаалт нь дээд ХЭВТЭЭ мөр болсон, чартууд нь
   газрын зургийг тойрсон ТОГТМОЛ өргөнтэй хоёр баганад орсон. Шаардлагатай бол
   git түүхээс сэргээнэ. */

function Panel({ title, note, grow, children }: {
  title?: string;
  note?: ReactNode;
  /** envhub баганад: үлдсэн зайг эзэлж, бие нь дотроо гүйнэ (`.envGrow`) */
  grow?: boolean;
  children: ReactNode;
}) {
  /* ⚠️ Агуулга нь `.panelBody`-д БООГДОНО — envhub-ийн `Box` бүтэц: толгой нь
     hairline зурвас, бие нь ӨӨРӨӨ гүйдэг. Урьд нь `{children}` шууд байсан тул
     урт жагсаалттай карт бүхэл баганыг тэлж, зэрэгцээ картууд зөрдөг байв. */
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
const PL = PARCEL_LEFT.fields;

/* ⚠️ 2026-08-21: `BagtsRow`/`useBagtsTable`/`SuitSummary`/`useSuitability` нь
   `@/lib/execData` руу НҮҮСЭН — нүүрийн ExecKpi тэднийг импортлохдоо энэ файлын
   MapCanvas (ArcGIS SDK ~35 модуль) гинжийг дагуулж нэвтрэх хуудсыг хүндрүүлдэг
   байв. Хуучин импортын замууд (Irged, Tailan, emailReport г.м.) эвдэрэхгүйн
   тулд дамжуулан экспортолж, дотооддоо мөн хэрэглэнэ. */
export { useBagtsTable, useSuitability } from '@/lib/execData';
export type { BagtsRow, SuitSummary } from '@/lib/execData';
import { useBagtsTable, type BagtsRow } from '@/lib/execData';

/* ── Төслийн жигнэсэн гүйцэтгэл — тооцоо @/lib/live-д (Тайлан/Нүүр мөн уншина) ── */

function useFinData(): Async<FinData> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useAsync(loadFinData, []);
}

/* ⚠️ cached() (2026-08-24 гүйцэтгэлийн аудит): Dashboard нь анхдагч харагдац тул
   өөр харагдац руу ороод буцах бүрд remount болж, PARCEL_LEFT-ийн ~2,119 мөр
   (хуудаслалттай хэд хэдэн хүсэлт) болон эх үүсвэрүүд ДАХИН татагддаг байв.
   cached() амжилтгүй амлалтыг кэшлэдэггүй тул «дахин оролдох» хэвээр ажиллана;
   бусад DashData ачаалагчид (loadBudget/loadHeadline/loadSocial) мөн ижил
   session-кэштэй тул хуучрал нэг жигд. */
const loadLeftParcels = cached<Row[]>(
  /* ⚠️ 2026-08-21: `status`, `area`, `areaAlt` НЭМЭГДЭВ — «Үлдсэн талбарын
     хэмжээ» карт эдгээрээр шүүдэг. Талбар нэмэхэд ШИНЭ хүсэлт үүсэхгүй, ижил
     query-д багана л нэмэгдэнэ. Талбай хоёр багананд тарсан (`area` нь 213/224,
     `areaAlt` нь 179/224 бөглөгдсөн) тул хоёуланг татна. */
  /* ⚠️ 2026-08-27: `landuse` (`Төрөл`) НЭМЭГДЭВ — «Цэвэрлэсэн талбарын
     төрөл» карт үүгээр ангилна. Бөглөлт нь 187/2,117 боловч тэдгээрийн 183 нь
     ЯГ «Цэвэрлэсэн нэгж талбар» — өөрөөр хэлбэл энэ багана нь бүх талбарын
     шинж БИШ, цэвэрлэгдсэн талбарын ангилал. */
  () => queryFeatures(PARCEL_LEFT.url, {
    outFields: [PL.progress, PL.block, PL.status, PL.area, PL.areaAlt, PL.landuse],
  }),
  undefined,
  /* ⚠️ `loadClearance` (live.ts) МӨН ЭНЭ хүснэгтээс уншдаг — хоёулаа ижил
     тагтай байх ёстой, эс бөгөөс нэг нь шинэчлэгдээд нөгөө нь хоцорно. */
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
);

function useSources(): Async<Row[]> {
  return useAsync(() => loadSources(), []);
}

/* ── Тохиромжтой байдлын үнэлгээ — тооцоо `@/lib/execData`-д (дээрх тайлбар) ── */

/** Бүх хэсэгт хэрэгтэй өгөгдлийн багц */
type DashData = {
  bagts: Async<BagtsRow[]>;
  /**
   * САНХҮҮ + БИЕТ ГҮЙЦЭТГЭЛ — `CASHFLOW2` (гэрээ) · `IPC_LOG` (олгосон) ·
   * `TASK_SHEET` («Гүйцэтгэл бөглөх»-ийн нэгтгэл).
   *
   * ⚠️ 2026-08-21: `Төсөл_Гүйцэтгэл_` ХАСАГДСАН — Excel-ээс гараар импортлогддог
   * ТЕСТ өгөгдөл байв (жингийн нийлбэр 81.53%, `Төсөл` багана 20 мөрд буруу,
   * төлөвлөгөө 74 мөрд хоосон). Гүйцэтгэл одоо порталаас БӨГЛӨГДДӨГ хүснэгтээс.
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
   * ⚠️ `useBagtsTable`-тай ИЖИЛ memo (`blockProgress.ts`) — нэмэлт HTTP хүсэлт
   * ҮҮСЭХГҮЙ, зөвхөн аль хэдийн татсан үр дүнг хуваалцана.
   */
  prog: Async<BlockProgressMap>;
  /**
   * Блокийн «Б.» мөрийн бүх огноо — цувааны эх.
   * ⚠️ `loadBlockProgress`-тэй НЭГ `loadRows()` memo-г хуваалцана — 0 хүсэлт.
   */
  hist: Async<BlockHistory>;
  /**
   * БАГЦЫН ГҮЙЦЭТГЭЛИЙН НЭГТГЭЛ (`selbe_bagts_guitsetgel_negtgel`) — багц
   * бүрийн сүүлийн бүртгэл: гүйцэтгэл, ТӨЛӨВЛӨГӨӨ, эзлэхүүн.
   *
   * ⚠️ `Төсөл_Гүйцэтгэл_` хасагдсаны дараа ТӨЛӨВЛӨГӨӨ өгдөг цорын ганц эх.
   * ⚠️ Хүснэгт одоогоор хоосон — карт `Empty` харуулж, өгөгдөл орж эхэлмэгц
   *    кодын өөрчлөлтгүй ажиллана.
   */
  pkgProg: Async<PkgProgressRow[]>;
  /**
   * 05 «Шугам сүлжээ»-ийн багц бүрийн ТОО ба ХЭМЖЭЭ (урт/талбай).
   *
   * ⚠️ ЯАГААД ХЭМЖЭЭ, ГҮЙЦЭТГЭЛ БИШ: сүлжээний багцууд (5.1–5.4, 7, 10–15) нь
   * «Гүйцэтгэл бөглөх» хуудсанд ОГТ БАЙДАГГҮЙ — тэр хуудсууд зөвхөн орон
   * сууцны багцын блокуудыг бүртгэдэг. Тиймээс биет %-ийг тэднээс гаргах
   * оролдлого ҮРГЭЛЖ «—» өгнө. Давхаргын геометр (`urt_m`/`Shape__Length`)
   * нь эсрэгээрээ 11 багц дээр БҮГД бөглөгдсөн.
   *
   * ⚠️ ЗӨВХӨН 05 нээлттэй үед татна (`enabled`) — дашбоард нээх бүрд 11 хүсэлт
   * дэмий цохихгүй.
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
   *
   * ⚠️ `netTotals`/`powTotals`-тай ЯГ ижил шалтгаанаар: нийгмийн багцууд
   * (19–21) ч «Гүйцэтгэл бөглөх» хуудсанд байдаггүй тул биет %-ийн оронд
   * геометрийн хэмжээ (`Shape__Area`, м²).
   */
  socTotals: Async<Map<string, Totals>>;
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
};

/** SQL string literal — дан хашилтыг давхарлана (нэрэнд ' орсон ч эвдрэхгүй) */
const sq = (v: string) => v.replace(/'/g, "''");

/** Нэр нь дэд текст агуулсан давхаргуудын id — Шугам сүлжээ/Нийгэмд ашиглана */
const layersByTitle = (subs: string[]): string[] =>
  LAYERS.filter((l) => subs.some((s) => l.title.toLowerCase().includes(s))).map((l) => l.id);

/* ══════════════════ Үндсэн компонент ══════════════════ */

export function Dashboard({ dim, setDim, zone, setZone }: {
  dim: Dim; setDim: (d: Dim) => void; zone: string | null; setZone: (z: string | null) => void;
}) {
  /** Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана. */
  const side = useSideResize('dashboard');
  /**
   * Нээлттэй хэсгүүд — ОЛОН сонголт. Дараалал нь ДАРСАН дараалал биш,
   * `SECTIONS`-ийн дараалал: баганууд 01→07 тогтмол эрэмбэтэй байх нь
   * хэрэглэгчид уншихад тогтвортой.
   *
   * ⚠️ `d`-ЭЭС ДЭЭШ зарлагдсан: доорх `netTotals` нь «05 нээлттэй эсэх»-ээр
   * идэвхждэг тул `open` түүнээс өмнө байх ёстой.
   */
  const [open, setOpen] = useState<SecKey[]>([]);
  const d: DashData = {
    bagts: useBagtsTable(),
    fin: useFinData(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    pkgProg: useAsync(loadPkgProgress, []),
    parcels: useLeftParcels(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    land: useAsync(loadLandStatus, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    headline: useAsync(loadHeadline, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    budget: useAsync(loadBudget, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    social: useAsync(loadSocial, []),
    sources: useSources(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    prog: useAsync(loadBlockProgress, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    hist: useAsync(loadBlockHistory, []),
    netTotals: usePlanTotals(zone, open[0] === 'network', NET_PACK_IDS),
    powTotals: usePlanTotals(zone, open[0] === 'power', POW_PACK_IDS),
    socTotals: usePlanTotals(zone, open[0] === 'benefit', SOC_PACK_IDS),
  };
  const { setHighlight } = useMap();

  /** Чарт-шүүлт (бүх хэсэгт нэгдсэн) — аттрибутын тодруулгыг зурагт тусгана */
  const [flt, setFlt] = useState<MapFilter | null>(null);
  useEffect(() => { setHighlight(flt?.where ?? null, flt?.only); }, [flt, setHighlight]);


  /**
   * «Давхарга» каталог нээлттэй эсэх — «Ерөнхий төлөвлөгөө» дээрх товчтой ИЖИЛ
   * зарчим. Хаалттай эхэлнэ; товч дарахад л нээгдэнэ.
   *
   * ⚠️ Тоо, хэмжээний 30 хүсэлт нь каталог НЭЭГДЭХЭД л явна (`usePlanTotals`-ын
   * `enabled = layerOpen`) — дашбоард нээх бүрд дэмий цохихгүй.
   */
  const [layerOpen, setLayerOpen] = useState(false);
  /** Тунгалагийн хавтан ба давхарга тус бүрийн opacity (`MapTools`-ийн «Тунгалаг») */
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  /**
   * ⚠️ Чарт дарж үүссэн шүүлт нь бүсээс ДАВАМГАЙЛНА — `flt.only[0]` нь тухайн
   * шүүлтийн зорилтот давхарга, `flt.where` нь SQL. Хоёулаа байвал зураг ЯГ тэр
   * объектууд руу; эс бөгөөс сонгосон бүс рүү; юу ч байхгүй бол бүтэн хүрээ рүү.
   */
  useZoomToFilter({ zone, layerId: flt?.only?.[0] ?? null, where: flt?.where ?? null });
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
   *
   * ⚠️ 2026-08-21: Урьд нь энгийн `useState` байсан тул `toggle`/`selectFlt`
   * бүр каталогоос нэмсэн давхаргыг ДАРЖ бичиж, сэдэв солих бүрд алга болгодог
   * байв. Одоо `useLayerPicks` суурийг солиход хэрэглэгчийн нэмсэн давхаргыг
   * ХЭВЭЭР үлдээнэ — бусад долоон харагдацтай ижил зарчим.
   */
  const base = useMemo(
    () => (flt?.layers?.length
      ? [...new Set([...CONTEXT_LAYERS, ...flt.layers])]
      : layersFor(open)),
    [flt, open, layersFor],
  );
  const [visible, setVisible] = useLayerPicks(base);

  /**
   * ⚠️ 2026-08-17: ГАНЦ сонголт (хэрэглэгчийн хүсэлт) — урьд нь хэсгүүдийг
   * хязгааргүй нэмж нээдэг байсан тул баруун самбар 3-4 багана болж газрын
   * зургийг шахдаг байв. Одоо шинэ хэсэг дарахад өмнөх нь ХААГДАНА; ижлийг
   * дахин дарвал бүрэн хаагдаж зураг бүтэн болно.
   * ⚠️ Төлөв нь массив ХЭВЭЭР (`SecKey[]`, урт 0 эсвэл 1) — `layersFor`,
   * `SideRail`, `aria-pressed` бүгд массиваар ажилладаг тул тэднийг хөндөөгүй.
   */
  const toggle = useCallback((k: SecKey) => {
    const next: SecKey[] = open.includes(k) ? [] : [k];
    setOpen(next);
    // Хэсэг солигдоход чарт-шүүлт хүчингүй (өөр контекст) — цэвэрлэнэ.
    setFlt(null);
    // ⚠️ Давхаргыг ЭНД тавихгүй — `base` нь `open`-оос деривативаар гарна.
  }, [open]);

  /* ⚠️ `clearAll` УСТГАВ — зөвхөн «Бүгдийг хаах» товч дууддаг байсан. Ганц
     хэсэг нээгддэг тул хаах нь идэвхтэй нүдийг дахин дарахтай ижил. */

  /**
   * Чарт дарахад — ИЖИЛ мөрийг дахин дарвал шүүлт арилна. Давхаргын шүүлттэй
   * (`layers`) сонголт зурагт зөвхөн тэр давхаргуудыг үлдээж, арилгахад
   * нээлттэй хэсгүүдийн анхдагч давхаргууд руу буцна.
   */
  const selectFlt = useCallback((next: MapFilter) => {
    const off = !!flt && flt.sec === next.sec && flt.key === next.key;
    // ⚠️ Давхаргыг ЭНД тавихгүй — `base` нь `flt`-ээс деривативаар гарна.
    setFlt(off ? null : next);
  }, [flt]);

  /**
   * ХЭСГИЙН КАРТУУДЫГ БҮСЭД ХУВААРИЛАХ — картын ТООНООС хамаарна.
   *
   * ⚠️ ЗААВАЛ дөрвөн тал байх албагүй (хэрэглэгчийн шийдвэр). Дүрэм:
   *   · 1-рх карт нь ҮРГЭЛЖ ДЭЭД зурвас (бүх хэсэгт толгойн үзүүлэлтийн эгнээ);
   *   · үлдсэн БҮГД сөөлжлөн ЗҮҮН/БАРУУН багана; ДООД зурвас БАЙХГҮЙ.
   *
   * ⚠️ Доод зурвасыг яагаад хаясан бэ: хажуугийн багана зургийн ХАЖУУД байдаг
   * тул зургийн өндрийг огт хөндөхгүй; доод зурвас эсрэгээрээ хулгайлдаг.
   * Хэмжсэнээр доод карт 62–98px нимгэн зурвас болж, зургаас 100–300px аваад
   * орлуулах юм нэмээгүй байв.
   */
  const zones = (() => {
    const empty = { top: null as ReactNode, left: [] as ReactNode[], right: [] as ReactNode[] };
    if (!open.length) return empty;
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

  /**
   * ⚠️ 2026-08-17: Өргөн чирэх бариулууд ХАСАГДСАН — хэсгүүдийн жагсаалт нь
   * дээд хэвтээ мөр, чартууд нь газрын зургийг тойрсон тогтмол өргөнтэй хоёр
   * багана болсон тул чирэх зүйл үлдсэнгүй.
   */
  return (
    /* Талын багануудыг чирж өргөсгөх/нарийсгах — өргөн нь `--side-l/--side-r`
       хувьсагчаар өгөгддөг тул бариул тэднийг л өөрчилнө. */
    <div
      ref={side.hostRef}
      className={`${o.shell} ${side.hostClass}`}
      style={side.style}
      data-detail={open.length > 0 ? '1' : '0'}
      /* ⚠️ ХООСОН хажуугийн багана 0 өргөнтэй болно — эс бөгөөс 1-2 карттай
         хэсэгт 510px багана хоосон зогсож, зураг дэмий шахагдана. */
      data-zl={zones.left.length ? '1' : '0'}
      data-zr={zones.right.length ? '1' : '0'}
      /**
       * ⚠️ 2026-08-21 (хэрэглэгчийн хүсэлт): НЭЭЛТТЭЙ ХЭСГИЙН ТҮЛХҮҮР.
       *
       * 9 дэд дашбоард нэг ижил стиль хуваалцаж байсан тул мэдээллийн хэмжээ
       * (Эх үүсвэр 2 чарт · Шугам сүлжээ 6 чарт · Цар хүрээ 9 KPI) зөрөхөд
       * гажилт үүсдэг байв — чарт шахагдах эсвэл хоосон зай гарах. Одоо CSS
       * нь `.shell[data-sec='...']` -ээр хэсэг бүрд ТУСДАА тааруулна.
       */
      data-sec={open[0] ?? ''}
    >
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />
      {/**
        * ⚠️ ДЭЭД МӨР НЬ ҮРГЭЛЖ НЭГ — 9 хэсэг бүгд ИЛ товчоор.
        * Урьд нь хоёр өөр мөр солигдоно: нээгээгүй үед «шүүлтүүрийн мөр»
        * (гарчиг + унждаг цэс + «Шүүлтүүр тавиагүй»), нээсэн үед 9 нүд.
        * Үүнээс болж хэсэг рүү орох ХОЁР ДАХЬ алхам хэрэгтэй, орсны дараа
        * дээд мөр бүхэлдээ өөр зүйл болж хувирдаг байв.
        */}
      <SideRail d={d} open={open} toggle={toggle} />

      {/* ЗҮҮН багана — ангиллын мөр-чартууд (envhub GeoPanel) */}
      {open.length === 0 && <EnvLeft d={d} />}

      {/* ⚠️ 2026-08-17: `<HeadKpi>` мөр ЭНДЭЭС ХАСАГДСАН — түүний 5 үзүүлэлт нь
          «Төслийн цар хүрээ» хэсэгт нэгдэв (`ScopeDetail`). Газрын зураг дээд
          талаараа мөр эзлэхээ болиод бүтэн өндөр авна.
          ⚠️ `HeadKpi` өөрөө ЭКСПОРТ хэвээр — «Иргэдэд хүрэх үр өгөөж» (Irged.tsx)
          тэр мөрийг дахин ашигладаг. */}
      <main className={o.center}>
        {/* Индикаторын зурвас — зургийн ЯГ дээр (envhub) */}
        {open.length === 0 && <IndStrip d={d} />}
        <div className={o.hero}>
          {/* ⚠️ zone={null} байсныг заслав (2026-08-10) — бүсийн шүүлт дашбоардын
              зурагт огт хүрдэггүй байв. Одоо давхаргууд бүсээр шүүгдэж,
              noZone давхаргууд орон зайн маскаар бүдгэрнэ. */}
          <MapCanvas dim={dim} visible={visible} opacity={opacity} zone={zone} uniform onPick={pick} />

          {/* Дээд-төв toolbar — БҮХ харагдацад нэгдсэн (`MapTools`).
              ⚠️ «Тунгалаг» ЭНД НЭМЭГДЭВ — урьд нь зөвхөн «Ерөнхий төлөвлөгөө»,
              ХАБЭА хоёрт байсан тул дашбоард дээр давхаргын тунгалаг тохируулах
              арга огт байхгүй байлаа. «Бүс» нь бүх горимд (өмнө нь зөвхөн
              `open.length > 0` дэлгэрэнгүй горимд). */}
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
                  <button type="button" className={o.filterClear} onClick={() => setZone(null)} aria-label={tr('Цуцлах')}>×</button>
                </div>
              )}
              {flt && (
                <div className={o.filterChip}>
                  <span className={o.filterLabel}>{flt.label}</span>
                  <button type="button" className={o.filterClear} onClick={() => selectFlt(flt)} aria-label={tr('Цуцлах')}>×</button>
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
          Bars, донатын 4 зүсмэгийн дүрэм — хэвээр).
          ⚠️ ХААХ боломж хэвээр — идэвхтэй нүдийг дахин дарахад хаагдана. */}
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
 *
 * ⚠️ Компонентуудыг JSX-ЭЭР БИШ, ЭНГИЙН ФУНКЦ болгон дуудна (`Detail`): эс
 * бөгөөс эцэгт нь ГАНЦ компонентын элемент ирж, доторх `Panel`-уудыг тоолж ч,
 * дөрвөн бүсэд хуваарилж ч чадахгүй.
 *
 * ⚠️ ЗӨВШӨӨРӨГДӨХ ШАЛТГААН: ес компонентын АЛЬ Ч НЬ hook дууддаггүй
 * (шалгасан). ЭДГЭЭРТ HOOK НЭМЭХГҮЙ — хэсэг солиход дараалал өөрчлөгдөж унана.
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
    case 'schedule': return ScheduleDetail({ fin: d.fin, prog: d.prog, bagts: d.bagts, pkgProg: d.pkgProg });
    case 'bagts': return BagtsDetail({ q: d.bagts, prog: d.prog, hist: d.hist, pkgProg: d.pkgProg, flt, onFlt });
    case 'land': return LandDetail({ parcels: d.parcels, land: d.land, flt, onFlt });
    case 'network': return NetworkDetail({ bagts: d.bagts, sources: d.sources, netTotals: d.netTotals, flt, onFlt });
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
 *
 * ⚠️ `PKG_BY_FAMILY.soc`-оос ШУУД — гараар жагсаавал шинэ нийгмийн багц
 * нэмэгдэхэд `services.ts`-тай хоцорно.
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
function railStat(k: SecKey, d: DashData): {
  value: string;
  note: string;
  /** Байвал жагсаалтын мөрөнд нимгэн явцын зурвас зурна */
  pct?: number;
  tone?: string;
} {
  const b = d.bagts.state === 'ready' ? d.bagts.data : null;
  const f = d.fin.state === 'ready' ? d.fin.data : null;
  const nowYm = new Date().toISOString().slice(0, 7);
  /**
   * Багцын биет гүйцэтгэл — «одоо» хүртэлх сүүлийн бөглөгдсөн сарын утга,
   * блокийн тоогоор жигнэсэн.
   *
   * ⚠️ Эх нь TASK_SHEET («Гүйцэтгэл бөглөх») тул зурвасын тоо нь дэлгэрэнгүй
   * самбарынхтай ЯГ таарна — хоёулаа нэг хүснэгтээс уншина.
   */
  const pkgPct = (match: (k: string) => boolean): number | null => {
    if (!f) return null;
    let w = 0; let n = 0;
    f.phys.forEach((byMon, k) => {
      if (!match(k)) return;
      let last: number | null = null;
      [...byMon.entries()].sort(([x], [y]) => x.localeCompare(y)).forEach(([m, v]) => {
        /* ⚠️ `v > 0` БИШ: `phys` мап нь тухайн сард ЯДАЖ нэг блок хэмжигдсэн
           үед л мөр үүсгэдэг (`Finance.loadFinData`, `if (cnt > 0)`) тул 0 нь
           «мэдээлэлгүй» биш ХЭМЖИГДСЭН 0%. Урьд нь 0-ийг алгасдаг байсан тул
           ажил эхлээгүй багц жигнэлтээс бүрмөсөн хасагдаж, төслийн дундаж
           гүйцэтгэл хөөрөгдөж харагддаг байв (`aggregateMonths`, `lagOf`
           хоёр аль хэдийн `!= null`-ыг барьдаг). */
        if (m <= nowYm) last = v;
      });
      if (last == null) return;
      const cnt = f.physCnt.get(k)?.get(nowYm) ?? 1;
      w += last * cnt; n += cnt;
    });
    return n ? w / n : null;
  };
  const overall = pkgPct(() => true);
  const blocks = b ? b.reduce((a, x) => a + x.blocks, 0) : null;
  const ail = b ? b.reduce((a, x) => a + x.ail, 0) : null;

  switch (k) {
    case 'scope': {
      // АМЬД — хилийн давхаргын Hec_area (урьд нь бэхлэгдсэн 158 га ◆)
      const h = d.headline.state === 'ready' ? d.headline.data : null;
      return {
        value: h == null ? '…' : tr('{0} га', num(h.areaHa, 1)),
        note: blocks == null ? '…' : tr('{0} блок · {1} өрх', num(blocks), num(ail)),
      };
    }
    case 'schedule':
      /* ⚠️ 2026-08-21: эх нь Төсөл_Гүйцэтгэл БИШ, TASK_SHEET («Гүйцэтгэл
         бөглөх»-ийн нэгтгэл) — багц бүрийн биет %, блокоор жигнэсэн. */
      return {
        value: overall == null ? '…' : pct(overall, 2),
        note: f == null ? '…' : tr('{0} багц тайлагнасан', num(f.phys.size)),
        pct: overall ?? undefined, tone: o.active,
      };
    case 'bagts': {
      const bl = b ? b.reduce((a, x) => a + x.blocks, 0) : 0;
      // Амьд жигнэсэн дундаж — блокийн тоогоор жинлэсэн 7 багцын гүйцэтгэл.
      const avg = b && bl ? b.reduce((a, x) => a + (x.progress ?? 0) * x.blocks, 0) / bl : null;
      const ailSum = b ? b.reduce((a, x) => a + x.ail, 0) : null;
      return {
        value: avg == null ? '…' : pct(avg, 1),
        note: ailSum == null ? '…' : tr('7 багц · {0} блок · {1} өрх', num(bl), num(ailSum)),
        pct: avg ?? undefined, tone: o.active,
      };
    }
    case 'land': {
      // ⚠️ АМЬД — «Газар чөлөөлөлт» харагдацтай ЯГ НЭГ томьёо (loadLandStatus):
      //    (Бүрэн чөлөөлсөн + Цэвэрлэсэн) ÷ нийт. Урьд нь Төсөл_Гүйцэтгэлийн
      //    үе шатын % (95.5) харуулж, талбарын 90%-тай ЗӨРДӨГ байв.
      const land = d.land.state === 'ready' ? d.land.data : null;
      return {
        value: land?.pct == null ? '…' : pct(land.pct, 1),
        note: land == null ? '…' : tr('{0} үлдсэн · {1} талбар', num(land.remaining), num(land.total)),
        pct: land?.pct ?? undefined, tone: o.done,
      };
    }
    case 'network': {
      // ⚠️ Урьд нь ЗӨВХӨН давхаргатай багцын ТОО (4) байсан — жагсаалтын бусад
      //    мөр бүгд гүйцэтгэл харуулж байхад энэ ганцаараа өөр төрлийн тоо байв.
      //    Одоо 11 сүлжээний багцын ЖИГНЭСЭН гүйцэтгэл (05·C1-тэй нэг тоо).
      const nw = { actual: pkgPct((k) => isNetworkPack(k)) };
      const n = infraPackList(isNetworkPack).length;
      return {
        value: nw.actual == null ? '…' : pct(nw.actual, 1),
        note: tr('{0} багц зурагт · гадна дулаан, ус', num(n)),
        pct: nw.actual ?? undefined, tone: o.active,
      };
    }
    case 'power': {
      // ⚠️ Мөн адил — «Гадна цахилгаан» ажлын 28 мөрийн жигнэсэн гүйцэтгэл
      //    (06·C2-той нэг тоо). `bagts_name` эдгээрт NULL тул `Ажлын_нэр`-ээр.
      const pw = { actual: pkgPct((k) => isPowerPack(k)) };
      const n = infraPackList(isPowerPack).length;
      return {
        value: pw.actual == null ? '…' : pct(pw.actual, 1),
        note: tr('{0} багц зурагт · гадна цахилгаан', num(n)),
        pct: pw.actual ?? undefined, tone: o.active,
      };
    }
    case 'source': {
      // Эх үүсвэр — нэгтгэсэн үйлчилгээнээс АМЬД (дулаан, цахилгаан, ус)
      const rows = d.sources.state === 'ready' ? d.sources.data : null;
      if (!rows) return { value: '…', note: tr('татаж байна'), tone: o.active };
      const types = new Set(rows.map((r) => srcStr(r[SOURCE_FS.fields.type])).filter(Boolean));
      return {
        value: `${rows.length}`,
        note: tr('{0} төрөл · дулаан, цахилгаан, ус', types.size),
        tone: o.active,
      };
    }
    case 'finance': {
      // АМЬД — cashflow_0813 /173: гэрээгээр баталгаажсан ÷ нийт төсөвт өртөг
      const bg = d.budget.state === 'ready' ? d.budget.data : null;
      const share = bg && bg.total ? (bg.contract / bg.total) * 100 : null;
      return {
        value: share == null ? '…' : pct(share, 1),
        note: bg == null ? '…' : tr('гэрээ {0} / төсөв {1}', mnt(bg.contract), mnt(bg.total)),
        pct: share ?? undefined, tone: o.active,
      };
    }
    case 'benefit': {
      // АМЬД — хүн ам (барилгуудын Population) + нийгмийн байгууламжийн тоо
      const h = d.headline.state === 'ready' ? d.headline.data : null;
      const soc = d.social.state === 'ready' ? d.social.data : null;
      return {
        value: h == null ? '…' : num(h.population),
        note: soc == null ? '…' : tr('{0} нийгмийн байгууламж', num(soc.totalN)),
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
            {/* ⚠️ Утга нь `railTop`-оос ГАРСАН: хэвтээ нүд нарийн (≈150px) тул
                дугаар+нэр+утга гурвуулаа нэг мөрөнд багтахгүй. Одоо дээр нь
                дугаар+нэр, доор нь ТОМ утга (envhub-ийн KPI нүдтэй ижил). */}
            {/* ⚠️ Дэс дугаар ХАСАГДСАН (хэрэглэгчийн хүсэлт) — нүд бүрд зөвхөн
                нэр ба утга. `s.no` нь дэлгэрэнгүй самбарын гарчигт хэвээр. */}
            <span className={o.railTop}>
              <span className={o.railTitle} title={s.title}>{s.title}</span>
            </span>
            {/* ⚠️ 2026-08-17: Явцын зурвас ба тайлбар мөр ХАСАГДСАН
                (хэрэглэгчийн хүсэлт) — нүд бүрд ЗӨВХӨН нэр ба утга. Дэлгэрэнгүй
                нь хэсгийг дарж нээхэд баруун самбарт бүтнээрээ гарна. */}
            <b className={`${o.railVal} num`}>{st.value}</b>
          </button>
        );
      })}

      {/* ⚠️ «Бүгдийг хаах (N)» товч ХАСАГДАВ. Ганц л хэсэг нээгддэг тул «бүгд»
          гэдэг нь ҮРГЭЛЖ нэг байсан бөгөөд түүнийг хаах нь идэвхтэй нүдийг
          дахин дарахтай ЯГ ижил үйлдэл. */}
    </div>
  );
}

/* ══════════════════ envhub нэг дэлгэцийн бүрэлдэхүүнүүд ══════════════════ */

/**
 * ⚠️ `EnvFilterBar` (ШҮҮЛТҮҮРИЙН МӨР) БҮРМӨСӨН УСТГАВ.
 *
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
  const nowYm = new Date().toISOString().slice(0, 7);
  /** Төслийн биет гүйцэтгэл — бүх багцын сүүлийн утга, блокоор жигнэсэн */
  let physW = 0; let physN = 0;
  f?.phys.forEach((byMon, k) => {
    let last: number | null = null;
    [...byMon.entries()].sort(([x], [y]) => x.localeCompare(y)).forEach(([m, v]) => {
      // ⚠️ 0% нь ХЭМЖИГДСЭН утга — алгасвал ажил эхлээгүй багц дунджаас хасагдана
      if (m <= nowYm) last = v;
    });
    if (last == null) return;
    const cnt = f.physCnt.get(k)?.get(nowYm) ?? 1;
    physW += last * cnt; physN += cnt;
  });
  const overall = physN ? physW / physN : null;
  const l = d.land.state === 'ready' ? d.land.data : null;
  const blocks = b ? sumBy(b, (x) => x.blocks) : null;
  const clearedPct = l && l.total > 0 ? ((l.cleared + l.cleaned) / l.total) * 100 : null;
  const cells = [
    { icon: 'frame', label: tr('Төслийн нийт талбай'), v: h ? tr('{0} га', num(h.areaHa, 1)) : '…' },
    { icon: 'users', label: tr('Хамрагдах хүн ам'), v: h ? num(h.population) : '…' },
    { icon: 'building', label: tr('Барилгын блок'), v: blocks != null ? num(blocks) : '…' },
    { icon: 'chart', label: tr('Төслийн гүйцэтгэл'), v: overall == null ? '…' : pct(overall, 1) },
    { icon: 'polygon', label: tr('Газар чөлөөлөлт'), v: clearedPct != null ? pct(clearedPct, 1) : '…' },
  ];
  return (
    <div className={o.ind} aria-label={tr('Гол үзүүлэлт')}>
      {cells.map((c) => (
        <div key={c.label} className={o.indCell}>
          <span className={o.indLabel}>{c.label}</span>
          <span className={o.indBottom}>
            <span className={o.indIcon}><Icon name={c.icon} size={20} /></span>
            <b className={`${o.indVal} num`}>{c.v}</b>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * ЗҮҮН БАГАНА — ангиллын задаргаа (envhub-ийн GeoPanel-ууд шиг):
 * дээрх хоёр нь агуулгынхаа өндөртэй, сүүлийнх нь үлдсэн зайг эзэлж дотроо
 * гүйнэ. ⚠️ Бүх чарт ГАНЦ өгөгдлийн өнгөөр (--data) — envhub-ийн гол дүрэм:
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

      {/* ⚠️ Шалтгаан нь урьд ЗӨВХӨН дэлгэрэнгүй самбарт байсан. Тоймд «89.9%
          чөлөөлсөн» гэдэг сайн мэдээ л харагдаж, ҮЛДСЭН 10%-ийн ШАЛТГААН
          нуугдаж байв — тоймын гол асуулт бол яг тэр. */}
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
              /* ⚠️ `хангах_хувь` нь ТЕКСТ талбар: «80%​» гэх мэт хувийн тэмдэг ба
                 үл үзэгдэх ZWSP-той ирдэг тул `Number()` бүх мөрд NaN буцааж,
                 багана бүр 100% өргөнтэй, утга нь «—» болдог байв. Модулийн
                 өөрийн `srcNum`/`srcStr` цэвэрлэгчээр л уншина. */
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
 *
 * ⚠️ Хуваарь нь ТОГТМОЛ (`keys`) — `progressSeries`-ийн as-of дүрэм. Урьд нь
 * тухайн сард ТАЙЛАГНАСАН заалтуудаар дундажлаж байв: шинэ багц бүртгэгдэх бүрд
 * дундаж БУУЖ (11.2% → 7.9%) муруй хиймэл хонхор гаргадаг — барилга угсралт
 * буудаггүй тул тэр нь «ажил ухарсан» гэж уншигдана. Түүнчлэн «Барилга
 * угсралтын явц» (04·C5) самбар аль хэдийн `progressSeries` хэрэглэдэг тул нэг
 * өгөгдлөөс ХОЁР зөрүүтэй муруй нэг дэлгэцэд гарч байлаа.
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
            const b = d.bagts.state === 'ready' ? d.bagts.data : null;
            const pts = projTrendPoints(h, b ? b.flatMap((r) => r.keys) : h.keys());
            return pts.length >= 2 ? (
              <Trend color="var(--data)" unit="%" height={92} points={pts} />
            ) : (
              <Empty label={tr('Цуваа зурах бүртгэл алга')} />
            );
          }}
        </Data>
      </Panel>

      {/* САНХҮҮЖИЛТИЙН ҮЕ ШАТ — төсөв → захирамж → гэрээ → шилжүүлсэн.
          ⚠️ Дөрвөн тоо тус тусдаа KPI болж хаа хаанаа тарж байсныг НЭГ дараалал
          болгов: мөнгө хаана ГАЦСАН нь зөвхөн харьцуулбал харагдана. */}
      <Panel title={tr('Санхүүжилтийн үе шат')} note={tr('₮ · төсвөөс')}>
        <Data q={d.budget} loading={tr('Татаж байна…')}>
          {(bg) => {
            const rows = [
              { key: 'total', label: tr('Урьдчилсан төсөв'), value: bg.total },
              { key: 'order', label: tr('Захирамжаар'), value: bg.orderTotal },
              { key: 'contract', label: tr('Гэрээ байгуулах эрх'), value: bg.contract },
              { key: 'given', label: tr('Шилжүүлсэн'), value: bg.transferred },
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
            const counts = PROGRESS_LEVELS.map(() => 0);
            pm.forEach((p) => {
              if (p.overall == null) return;
              counts[Math.min(PROGRESS_LEVELS.length - 1, Math.floor(p.overall / 25))] += 1;
            });
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
                  value: r.progress ?? 0,
                  color: 'var(--data)',
                  display: r.progress == null ? '—' : pct(r.progress, 0),
                }))}
            />
          )}
        </Data>
      </Panel>
    </aside>
  );
}


/* ══════════════════ Толгойн үзүүлэлт ══════════════════ */

/**
 * ⚠️ EXPORT — «Иргэдэд хүрэх үр өгөөж» (`Irged.tsx`) энэ мөрийг ДАХИН
 * АШИГЛАНА. Хуулбарлавал таван үзүүлэлт хоёр цонхонд салангид амьдарна.
 *
 * ⚠️ Prop нь `DashData` БҮХЭЛДЭЭ БИШ, зөвхөн `bagts`: бусад талбар нь энд
 * хэрэггүй бөгөөд шаардвал дуудагч тал дашбоардын БҮХ өгөгдлийг татах
 * үүрэгтэй болно (эх үүсвэр, санхүү, үнэлгээ гэх мэт — 10 гаруй хүсэлт).
 */
export function HeadKpi({ bagts }: { bagts: Async<BagtsRow[]> }) {
  const b = bagts.state === 'ready' ? bagts.data : null;
  const blocks = b ? b.reduce((a, x) => a + x.blocks, 0) : null;
  const ail = b ? b.reduce((a, x) => a + x.ail, 0) : null;
  // ⚠️ Толгой/явцыг ЭНД амьдаар ачаална (prop-оор БИШ) — «Иргэдэд хүрэх үр өгөөж»
  //    (Irged.tsx) энэ мөрийг зөвхөн `bagts`-аар дахин ашиглана. loadHeadline/
  //    loadProjectProgress нь cached тул давхар хүсэлт үүсэхгүй.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hq = useAsync(loadHeadline, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pq = useAsync(loadFinData, []);
  const h = hq.state === 'ready' ? hq.data : null;
  /* ⚠️ 2026-08-21: Төсөл_Гүйцэтгэл_ хасагдаж, эх нь TASK_SHEET болов */
  const p = pkgPhys(pq.state === 'ready' ? pq.data : null, () => true);

  /**
   * ⚠️ УТГА ба НЭГЖ нь ТУСДАА талбар — тоо том, нэгж жижиг.
   * 2026-08-13: бэхлэгдсэн ◆ (158 га · 44,518 · 36.35% · 2,339,000,000,000)
   * БҮГД амьд боллоо: хил [97] · барилгын Population нийлбэр · Төсөл_Гүйцэтгэл
   * жигнэсэн дундаж · INVEST нийлбэр.
   */
  const tiles: { v: string; unit?: string; label: string; sub?: string; lead?: true; bar?: number }[] = [
    { v: h == null ? '…' : num(h.areaHa, 1), unit: tr('га'), label: tr('Төслийн талбай') },
    {
      v: ail == null ? '…' : num(ail), unit: tr('өрх'),
      label: tr('Өрхийн орон сууц'),
      sub: blocks == null ? undefined : tr('{0} блок', num(blocks)),
    },
    { v: h == null ? '…' : num(h.population), unit: tr('хүн'), label: tr('Хамрагдах хүн ам') },
    {
      v: p.actual == null ? '…' : num(p.actual, 2), unit: '%',
      label: tr('Төслийн нийт гүйцэтгэл'),
      sub: p.packs ? tr('{0} багц тайлагнасан', num(p.packs)) : undefined,
      lead: true,
      bar: p.actual ?? undefined,
    },
    {
      v: h == null ? '…' : num(h.investTotal), unit: tr('₮'),
      label: tr('Төслийн нийт төсөв'),
      sub: h == null ? undefined : tr('гэрээ байгуулсан {0}', mnt(h.investConfirmed)),
    },
  ];

  return (
    <div className={o.head}>
      {tiles.map((t) => (
        <div key={t.label} className={`${o.tile} ${t.lead ? o.tileLead : ''}`}>
          <span className={o.tileVal}>
            <b className="num">{t.v}</b>
            {t.unit && <i>{tr(t.unit)}</i>}
          </span>
          <span className={o.tileLabel}>{t.label}</span>
          {/* Гол үзүүлэлтэд зурвас — тоо уншихаас өмнө хэмжээг нүдээр ойлгуулна */}
          {t.bar != null && (
            <span className={o.tileBar}><i className={o.active} style={{ width: `${clamp(t.bar, 0, 100)}%` }} /></span>
          )}
          {t.sub && <span className={o.tileSub}>{t.sub}</span>}
        </div>
      ))}
    </div>
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
  const ail = b ? sumBy(b, (x) => x.ail) : null;
  const h = d.headline.state === 'ready' ? d.headline.data : null;
  const soc = d.social.state === 'ready' ? d.social.data : null;
  // Нийт гүйцэтгэл — TASK_SHEET-ийн багц бүрийн биет %, блокоор жигнэсэн
  const prog = pkgPhys(d.fin.state === 'ready' ? d.fin.data : null, () => true);
  /** Багцын тоо — барилгын 7 + газрын зургийн дэд бүтцийн багцууд (PKG_BY_BAGTS) */
  const packs = b
    ? new Set([...b.map((x) => x.key), ...Object.keys(PKG_BY_BAGTS)]).size
    : null;

  return (
    <>
      {/**
        * ⚠️ 2026-08-17: Урьд нь дашбоардын ДЭЭД мөрөнд байсан `HeadKpi`-ийн
        * гурван үзүүлэлт (талбай · нийт гүйцэтгэл · нийт төсөв) ЭНД нэгдэв —
        * хэрэглэгчийн хүсэлт. Өрх ба хүн ам нь аль хэдийн энд байсан тул
        * ДАВХАРДААГҮЙ. Газрын зураг дээд мөрөө чөлөөлж бүтэн өндөр авна.
        */}
      <Panel title={tr('Төслийн цар хүрээ')}>
        <Stats cols={2}>
          <Stat accent color={HUE[0]} value={h == null ? '…' : num(h.areaHa, 1)} unit={tr('га')} label={tr('Төслийн талбай')} />
          <Stat accent color={HUE[1]} value={prog == null ? '…' : num(prog.actual, 2)} unit="%" label={tr('Нийт гүйцэтгэл')} />
          <Stat accent color={HUE[2]} value={h == null ? '…' : num(h.investTotal)} unit={tr('₮')} label={tr('Нийт төсөв')} />
          <Stat accent color={HUE[3]} value={blocks == null ? '…' : num(blocks)} unit={tr('блок')} label={tr('Орон сууцны блок')} />
          <Stat accent color={HUE[4]} value={ail == null ? '…' : num(ail)} unit={tr('өрх')} label={tr('Айл өрх')} />
          <Stat accent color={HUE[5 % HUE.length]} value={packs == null ? '…' : num(packs)} unit={tr('багц')} label={tr('Нийт багц')} />
          <Stat accent color={HUE[6 % HUE.length]} value={h == null ? '…' : num(h.population)} unit={tr('хүн')} label={tr('Хамрагдах хүн ам')} />
          <Stat accent color={HUE[7 % HUE.length]} value={soc == null ? '…' : num(soc.totalN)} unit={tr('ш')} label={tr('Нийгмийн байгууламж')} />
          <Stat accent color={HUE[0]} value={h?.greenHa == null ? '—' : num(h.greenHa, 1)} unit={tr('га')} label={tr('Ногоон байгууламж')} />
        </Stats>
      </Panel>

      {/* ⚠️ «Санхүүжилтийн эх үүсвэр» карт ЭНДЭЭС ХАСАГДСАН — тэр нь `bg.sources`
          гэсэн ЯГ ижил массивыг «Хөрөнгө оруулалт, бонд» (08) хэсгийн Donut-тай
          хамт хоёр удаа зурдаг байв. Санхүүжилтийн эх үүсвэрийг 08 эзэмшинэ. */}

      {/* Нягтрал — дээрх картын тоонуудын ХАРЬЦАА. Нэгж мөр тутамд өөр (өрх ·
          хүн · ₮ · %) тул багана биш key→value хэлбэрээр. Шинэ хүсэлт үүсэхгүй. */}
      <Panel title={tr('Нягтрал — нэгжид ногдох үзүүлэлт')}>
        <Rows
          items={[
            { key: tr('Нэг блокт ногдох өрх'), value: blocks && ail ? num(ail / blocks, 1) : '…' },
            { key: tr('Нэг өрхөд ногдох хүн'), value: h && ail ? num(h.population / ail, 1) : '…' },
            { key: tr('1 га-д ногдох өрх'), value: h?.areaHa && ail ? num(ail / h.areaHa, 1) : '…' },
            {
              key: tr('1 өрхөд ногдох төсөв'),
              value: h && ail ? mnt(h.investTotal / ail) : '…',
            },
            {
              key: tr('1 га-д ногдох төсөв'),
              value: h?.areaHa ? mnt(h.investTotal / h.areaHa) : '…',
            },
            {
              key: tr('Ногоон байгууламжийн эзлэх хувь'),
              value: h?.greenHa == null || !h.areaHa ? '—' : pct((h.greenHa / h.areaHa) * 100, 1),
            },
            {
              key: tr('Нэг нийгмийн байгууламжид ногдох хүн'),
              value: h && soc?.totalN ? num(h.population / soc.totalN) : '…',
            },
          ]}
        />
      </Panel>

      {/* Багцын бүтэц — `PKG_TABLE`-ийн мета (хүсэлтгүй). ⚠️ Үе шатны ЖИНГИЙН
          Donut нь 02-т байна — энд давхардуулахгүй. */}
      <Panel title={tr('Багцын бүтэц — гэр бүлээр')}>
        {(() => {
          const fams = (Object.keys(FAMILY_LABEL) as PkgFamily[])
            .map((f) => ({ f, n: familyPacks(f).length }))
            .filter((x) => x.n > 0);
          const items = [
            // ⚠️ Орон сууцны 7 багц нь `PKG_TABLE`-д БАЙХГҮЙ (барилгын давхаргаас
            //    гардаг) тул «нийт багц» нүдтэй таарахын тулд тусдаа зүсмэг.
            ...(b ? [{ key: 'house', label: tr('Орон сууц ({0} багц)', num(b.length)), value: b.length }] : []),
            ...fams.map((x) => ({ key: x.f as string, label: FAMILY_LABEL[x.f], value: x.n })),
          ];
          if (!items.length) return <Empty label={tr('Багцын хүснэгт хоосон.')} />;
          return (
            /* ⚠️ Донат → ХЭВТЭЭ БАР: гэр бүл ҮРГЭЛЖ 7 тул бөгжинд
               уншигдахгүй (4+ бол донат хэрэглэхгүй дүрэм). */
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

      {/**
        * ⚠️ 2026-08-18 (хэрэглэгчийн шийдвэр): «Газрын нөөц — чөлөөлөлтөд
        * хамрагдсан талбай» хавтан ХАСАГДАВ. Гурван шалтгаан:
        *   · чөлөөлөлтийн бүрэн задаргаа «Газар чөлөөлөлт» харагдацад бий;
        *   · нүүрийн KPI дашбоардад чөлөөлсөн %/үлдэгдэл шинээр гарсан;
        *   · дашбоард хэт ачаалалтай болж, газрын зураг шахагдаж байв.
        * `d.land` ачаалагч нь бусад хавтанд ХЭРЭГЛЭГДСЭН хэвээр — устгаагүй.
        */}

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
                  where: `${BF.bagts} = '${sq(r.label)}'`,
                  only: ['mon:building'],
                  // ⚠️ `layers` ЗААВАЛ: `SECTION_LAYERS.scope` нь ХООСОН тул 01
                  //    нээхэд `mon:building` зурагт байхгүй — where+only дангаараа
                  //    хаана ч харагдахгүй тодруулга болно.
                  layers: ['mon:building'],
                });
              }}
              items={heatBars(rows, (r) => ({
                key: r.key,
                label: r.label,
                value: r.blocks,
                display: tr('{0} блок · {1} өрх', num(r.blocks), num(r.ail)),
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
            /* ⚠️ Донат → ХЭВТЭЭ БАР: 7 төрөлтэй бөгжинд зүсмэгийн өнцөг
               харьцуулагдахгүй тул бүх мэдээлэл доод жагсаалтад шилждэг байв. */
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
              /* ⚠️ «Ус хангамжийн эх үүсвэрийн чадал»-тай ИЖИЛ хэлбэр (2026-08-21,
                 хэрэглэгчийн хүсэлт): том бөгж, тэмдэглэлийг зүсмэг рүү шууд
                 холбосон шугамаар (`leaders`) — доод жагсаалт БИШ. Зүсмэг цөөн
                 (2–4) тул шошго хоорондоо мөргөлдөхгүй. */
              <Donut
                size={140}
                width={22}
                leaders={list.length <= 4}
                stack={list.length > 4}
                center={num(list.reduce((a, x) => a + x[1], 0))}
                centerLabel={tr('багц')}
                items={list.map(([label, n], i) => ({
                  key: label,
                  label: tr(label),
                  value: n,
                  color: shade(ACCENT, i, Math.max(2, list.length)),
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
 *
 * ⚠️ 2026-09-04 · ЯАГААД (аудитын HIGH): НЭГ дашбоард дээр гүйцэтгэлийн ХОЁР
 * эх сурвалж 61 нэгжээр зөрж зэрэгцэн зурагдаж байв —
 *   · `loadBlockProgress()` (`prog`) — «Гүйцэтгэл бөглөх» хуудсуудаас
 *     (`Bagts_*`). 10 хуудсын ЗӨВХӨН ХОЁРТ бүртгэл нийтлэгдсэн тул блокийн
 *     дундаж 0.013% (хэмжсэн).
 *   · `loadPkgProgress()` (`pkgProg`) — `selbe_bagts_guitsetgel_negtgel /169`
 *     хүснэгтээс. 2026-09-04-ний амьд утга: 84 мөр, 7 багц, сүүлийн агшин
 *     (2026-09-28) 78 · 37.7 · 82.7 · 80.8 · 61.6 · 46.1 · 40.5 → дундаж 61.06%.
 *
 * ⚠️ Нэгтгэлийн тэр 84 мөр нь `tools/negtgel-seed.mjs`-ийн ТУРШИЛТЫН өгөгдөл
 * болох нь батлагдсан (скриптийн толгойд «ТУРШИЛТЫН ӨГӨГДӨЛ … `--wipe`-аар
 * БҮГДИЙГ устгана» гэж бичсэн). Өгөгдлийг УСТГАХ ба эх сурвалжийг СОЛИХ нь
 * ХЭРЭГЛЭГЧИЙН шийдвэр тул энд ЗӨВХӨН шошго нэмэв: 61% ба 0.013% хоёрын аль
 * нь аль хүснэгтээс гарсныг хэрэглэгч дэлгэц дээр шууд ялгана.
 *
 * ⚠️ Шошгыг САМБАР БҮРД гараар бичихгүй — нэг газраас өгвөл нэгтгэлээс шинэ
 * самбар нэмэхэд шошго дагаж явна. `note` нь 2 мөрөөр таслагддаг
 * (`dashboardOv.module.css .panelNote`) тул текст АЛЬ БОЛОХ БОГИНО.
 */
const SRC_NEGTGEL = () => tr('эх: багцын нэгтгэл — бөглөх хуудас БИШ');
/** Блокийн гүйцэтгэлийн («Гүйцэтгэл бөглөх» хуудас) эх сурвалжийн шошго */
const SRC_SHEET = () => tr('эх: бөглөх хуудас');
/** `note` + эх сурвалж. Функц дуудалт — хэлээ сольсны дараа дахин орчуулагдана */
const srcNote = (note: string, src: () => string) => `${note} · ${src()}`;

/**
 * 02 · ХЭРЭГЖИЛТИЙН ЕРӨНХИЙ ГРАФИК.
 *
 * ⚠️ 2026-08-21: `Төсөл_Гүйцэтгэл_` (162 мөрийн Excel хуваарь) ХАСАГДСАН —
 * тэр нь порталаас шинэчлэгддэггүй тест өгөгдөл байв. Одоо бүх дүн ХОЁР
 * АМЬД эхээс:
 *   · `fin`  — CASHFLOW2 (`cashflow_0813 /173`, төлөвлөгөө) · IPC_LOG
 *              (`ipc_0813 /172`, олгосон) · TASK_SHEET (биет)
 *   · `prog` — блок бүрийн гүйцэтгэл, мөн TASK_SHEET-ээс
 *
 * ⚠️ 2026-08-31: хоёр санхүүгийн үйлчилгээ ХОЁУЛАА солигдов (`Cashflow /106`
 * → `cashflow_0813 /173`, `IPC_ /107` → `ipc_0813 /172`). Энэ картын дүнг
 * `aggregateMonths` бодох бөгөөд сарын төлөвлөгөө нь одоо хадгалсан БАГАНА
 * биш, `FinData.plan`-аас НИЙЛБЭРЛЭГДЭНЭ.
 *
 * Хоёулаа «Гүйцэтгэл бөглөх» цонхоор ПОРТАЛААС бөглөгддөг тул тоо нь
 * бүртгэлтэй нэг агшинд таарна.
 */
function ScheduleDetail({ fin, prog, bagts, pkgProg }: {
  fin: Async<FinData>;
  prog: Async<BlockProgressMap>;
  bagts: Async<BagtsRow[]>;
  pkgProg: Async<PkgProgressRow[]>;
}) {
  const f = fin.state === 'ready' ? fin.data : null;
  const months = f ? aggregateMonths(f) : null;

  /** «Одоо» хүртэлх сүүлийн бөглөгдсөн сарын төлөвлөгөө/биет */
  const nowYm = new Date().toISOString().slice(0, 7);
  let planned: number | null = null;
  let actual: number | null = null;
  if (months) {
    for (const m of months) {
      if (m.label > nowYm) continue;
      if (m.cumPct > 0) planned = m.cumPct;
      if (m.phys != null) actual = m.phys;
    }
  }
  const gap = planned != null && actual != null ? planned - actual : null;

  return (
    <>
      <Panel title={tr('Хэрэгжилтийн ерөнхий график')} note={tr('cashflow_0813 · ipc_0813 · Гүйцэтгэл бөглөх')}>
        <Stats cols={2}>
          <Stat accent color={HUE[0]} value={actual == null ? '…' : num(actual, 2)} unit="%" label={tr('Биет гүйцэтгэл')} />
          <Stat accent color={HUE[1]} value={planned == null ? '…' : num(planned, 1)} unit="%" label={tr('Төлөвлөсөн гүйцэтгэл')} />
          <Stat
            accent
            color={HUE[2]}
            value={gap == null ? '…' : `${gap >= 0 ? '−' : '+'}${Math.abs(gap).toFixed(1)}`}
            unit="%"
            label={tr('Гүйцэтгэлийн зөрүү')}
          />
          <Stat
            accent
            color={HUE[3]}
            value={f == null ? '…' : num([...f.phys.keys()].length)}
            unit={tr('багц')}
            label={tr('Тайлагнасан багц')}
          />
        </Stats>
      </Panel>

      {/* ⚠️ «Биет гүйцэтгэл — сараар» карт ЭНДЭЭС ХАСАГДСАН (2026-08-27).
          Тэр нь `Bagts_*` бөглөх хуудсаас цуваа зурдаг байсан ч 10 хуудсын
          ЗӨВХӨН ХОЁРТ нь бүртгэл нийтлэгдсэн тул хоёр цэг ч цуглахгүй, үргэлж
          «Цуваа зурах бүртгэл алга» гэсэн хоосон хайрцаг байв. Яг ижил
          асуултад доорх «Төлөвлөгөө vs бодит — сараар» нь багцын гүйцэтгэлийн
          нэгтгэлээс 12 сарын БҮТЭН цуваагаар хариулна. Хуудсууд нийтлэгдэж
          эхэлбэл тэр эхийг буцааж нэмэх нь зөв — одоо хоосон байхаас нь
          хамаагүй дээр. */}

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
      <Panel title={tr('Блокийн гүйцэтгэл')} note={tr('түвшнээр · блок')}>
        <Data q={prog} loading={tr('Татаж байна…')}>
          {(pm) => {
            const counts = PROGRESS_LEVELS.map(() => 0);
            pm.forEach((x) => {
              if (x.overall == null) return;
              counts[Math.min(PROGRESS_LEVELS.length - 1, Math.floor(x.overall / 25))] += 1;
            });
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
      {/* ⚠️ 2026-09-04: эх сурвалжийн шошго нэмэв. Энэ карт нь `fin.phys`
          (=`BlockHistory` → «Гүйцэтгэл бөглөх» хуудсууд)-аас гардаг бол доорх
          «Төлөвлөгөө vs бодит» бүлэг нь НЭГТГЭЛ хүснэгтээс — хоёр тоо 61
          нэгжээр зөрдөг тул аль карт хаанаас гарсныг ил бичнэ. */}
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
      <Panel title={tr('Хоцорсон блок')} note={tr('гүйцэтгэл 0%')}>
        <Data q={prog} loading={tr('Татаж байна…')}>
          {(pm) => {
            const b = bagts.state === 'ready' ? bagts.data : null;
            const zero: { key: string; n: number }[] = [];
            const byPkg = new Map<string, number>();
            pm.forEach((x, k) => {
              if (x.overall > 0) return;
              const pkg = k.split('|')[0] ?? '';
              byPkg.set(pkg, (byPkg.get(pkg) ?? 0) + 1);
            });
            byPkg.forEach((n, k) => {
              const nm = b?.find((r) => r.key === k)?.label ?? k;
              zero.push({ key: k, n, ...{ label: nm } } as { key: string; n: number });
            });
            const list = [...byPkg.entries()]
              .map(([k, n]) => ({ key: k, label: b?.find((r) => r.key === k)?.label ?? k, n }))
              .sort((x, y) => y.n - x.n);
            void zero;
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

      {/* ══ БАГЦЫН ГҮЙЦЭТГЭЛИЙН НЭГТГЭЛЭЭС — 02-ын ГУРВАН ШИНЭ КАРТ ══

          ⚠️ ЯАГААД: дээрх «Биет гүйцэтгэл — сараар» ба «Багцаар — биет
          гүйцэтгэл» хоёр нь `Bagts_*` бөглөх хуудсаас уншдаг бөгөөд 10
          хуудсын ЗӨВХӨН ХОЁРТ нь бүртгэл нийтлэгдсэн (2026-08-27). Тиймээс
          хоёр багана бараг хоосон үлдэж байв. Багцын гүйцэтгэлийн нэгтгэл нь
          7 багц × 12 сарын бүртгэлтэй бөгөөд ТӨЛӨВЛӨГӨӨГ агуулдаг цорын ганц
          эх — хуваарийн хэсэгт яг тохирно.

          ⚠️ ШИНЭ ХҮСЭЛТ ЯВУУЛАХГҮЙ: `pkgProg` нь 04-т аль хэдийн ачаалагдсан
          `loadPkgProgress`-ийн ЯГ ижил `cached` үр дүн.

          ⚠️ 2026-09-04 ШИНЭЧЛЭЛ: доорх бүлгийн самбар бүрийн `note`-д
          `SRC_NEGTGEL` шошго нэмэгдэв. Учир нь энэ ХОЁР эх нэг дэлгэцэн дээр
          61 нэгжээр зөрж зэрэгцэн зурагддаг: бөглөх хуудасны блокийн дундаж
          0.013% ба нэгтгэлийн 61.06% (амьд, 2026-09-04). Дээрх `SRC_NEGTGEL`
          тайлбарыг унш — нэгтгэлийн 84 мөр нь `tools/negtgel-seed.mjs`-ийн
          ТУРШИЛТЫН өгөгдөл. Өгөгдлийг устгах/эх сурвалжийг солих нь
          ХЭРЭГЛЭГЧИЙН шийдвэр тул энд зөвхөн шошго. */}

      {/* ТӨЛӨВЛӨГӨӨ vs БОДИТ — САРААР. Нэг муруй: сар бүрийн БОДИТ дундаж.
          Төлөвлөгөө нь hover-ийн `display`-д хамт гарна — хоёр өнгийн муруй
          давхарлавал хэрэглэгч аль нь аль болохыг өнгөөр л таамаглана. */}
      <Panel title={tr('Төлөвлөгөө vs бодит — сараар')} note={srcNote(tr('багцын дундаж %'), SRC_NEGTGEL)}>
        <Data q={pkgProg} loading={tr('Татаж байна…')}>
          {(list) => {
            /** сар → бодит/төлөвлөгөөт утгуудын нийлбэр ба тоо */
            const m = new Map<string, { a: number; an: number; p: number; pn: number }>();
            for (const r of list) {
              const ym = r.date.slice(0, 7);
              if (!ym) continue;
              const cur = m.get(ym) ?? { a: 0, an: 0, p: 0, pn: 0 };
              if (r.actual != null) { cur.a += r.actual; cur.an += 1; }
              if (r.planned != null) { cur.p += r.planned; cur.pn += 1; }
              m.set(ym, cur);
            }
            const pts = [...m.entries()]
              .filter(([, v]) => v.an > 0)
              .sort((x, y) => x[0].localeCompare(y[0]))
              .map(([ym, v]) => ({
                key: ym,
                label: ym.slice(2),
                value: v.a / v.an,
                display: v.pn
                  ? tr('{0} / төл. {1}', pct(v.a / v.an, 1), pct(v.p / v.pn, 1))
                  : pct(v.a / v.an, 1),
              }));
            return pts.length >= 2
              ? <Series items={pts} height={120} unit="%" line />
              : <Empty label={tr('Цуваа зурах бүртгэл алга')} />;
          }}
        </Data>
      </Panel>

      {/* ХОЦРОГДОЛ — багц бүрийн (төлөвлөгөө − бодит). «Хэн хоцорч байна»
          гэсэн асуултын шууд хариу; эерэг тоо нь хоцрогдол. */}
      <Panel title={tr('Төлөвлөгөөний хоцрогдол — багцаар')} note={srcNote(tr('төл. − бодит, %'), SRC_NEGTGEL)}>
        <Data q={pkgProg} loading={tr('Татаж байна…')}>
          {(list) => {
            const rows = latestPkgProgress(list)
              .filter((x) => x.actual != null && x.planned != null)
              .map((x) => ({ key: x.key, label: x.label, gap: (x.planned as number) - (x.actual as number) }))
              .sort((a, b) => b.gap - a.gap);
            return rows.length ? (
              <Bars
                inline
                items={heatBars(rows, (x) => ({
                  key: x.key,
                  label: tr(x.label),
                  /* Хэмжээс нь ХЭМЖЭЭ — урд явж буй багц (сөрөг зөрүү) 0 урттай */
                  value: Math.max(0, x.gap),
                  display: `${x.gap >= 0 ? '−' : '+'}${Math.abs(x.gap).toFixed(1)}%`,
                }))}
              />
            ) : <Empty label={tr('Бүртгэл хоосон байна.')} />;
          }}
        </Data>
      </Panel>

      {/* СҮҮЛИЙН САРЫН ӨСӨЛТ — багц бүрийн сүүлийн хоёр бүртгэлийн зөрүү.
          Нийт % нь «хэр хол явсан»-ыг хэлдэг ч «одоо хөдөлж байна уу»-г
          хэлдэггүй: 80%-тай зогссон багц 40%-тай ажиллаж буйгаас муу. */}
      <Panel title={tr('Сүүлийн сарын өсөлт — багцаар')} note={srcNote(tr('сүүлийн хоёр бүртгэлийн зөрүү'), SRC_NEGTGEL)}>
        <Data q={pkgProg} loading={tr('Татаж байна…')}>
          {(list) => {
            /** багц → огноогоор эрэмбэлэгдсэн бүртгэлүүд */
            const by = new Map<string, PkgProgressRow[]>();
            for (const r of list) {
              if (r.actual == null) continue;
              const arr = by.get(r.key) ?? [];
              arr.push(r);
              by.set(r.key, arr);
            }
            const rows: { key: string; label: string; d: number }[] = [];
            by.forEach((arr, key) => {
              if (arr.length < 2) return;
              const s2 = [...arr].sort((a, b) => a.date.localeCompare(b.date));
              const last = s2[s2.length - 1];
              const prev = s2[s2.length - 2];
              rows.push({ key, label: last.label, d: (last.actual as number) - (prev.actual as number) });
            });
            rows.sort((a, b) => b.d - a.d);
            return rows.length ? (
              <Bars
                inline
                items={heatBars(rows, (x) => ({
                  key: x.key,
                  label: tr(x.label),
                  value: Math.max(0, x.d),
                  display: `${x.d >= 0 ? '+' : '−'}${Math.abs(x.d).toFixed(1)}%`,
                }))}
              />
            ) : <Empty label={tr('Харьцуулах хоёр дахь бүртгэл алга')} />;
          }}
        </Data>
      </Panel>

      {/* ТАЙЛАГНАСАН БЛОК — багц бүрийн НИЙТ блокоос хэд нь гүйцэтгэлээ
          бүртгүүлсэн бэ.

          ⚠️ Энэ хэсгийн бусад тоо БАГА харагдах ҮНДСЭН шалтгаан нь ажил
          удаашралтай явж байгаа нь БИШ, харин 10 бөглөх хуудсын зөвхөн хоёрт
          нь бүртгэл нийтлэгдсэн явдал. Тэр ялгааг нуувал «дундаж 0.03%» гэсэн
          тоог хэрэглэгч гүйцэтгэлийн үнэлгээ гэж уншина. Энэ карт нь тоо
          бүрийн ард ХЭДЭН блокийн бүртгэл байгааг ил гаргана. */}
      <Panel title={tr('Тайлагнасан блок — багцаар')} note={tr('бүртгэлтэй / нийт блок')}>
        <Data q={prog} loading={tr('Татаж байна…')}>
          {(pm) => {
            const b = bagts.state === 'ready' ? bagts.data : null;
            if (!b) return <Empty label={tr('Багцын бүртгэл алга')} />;
            /** багц → бүртгэл ирсэн блокийн тоо */
            const rep = new Map<string, number>();
            pm.forEach((x, k) => {
              if (x.overall == null) return;
              const pkg = k.split('|')[0] ?? '';
              rep.set(pkg, (rep.get(pkg) ?? 0) + 1);
            });
            const rows = b
              .map((r) => ({ key: r.key, label: r.label, n: rep.get(r.key) ?? 0, all: r.blocks }))
              .sort((x, y) => y.n / Math.max(1, y.all) - x.n / Math.max(1, x.all));
            return rows.length ? (
              <Bars
                inline
                max={100}
                items={heatBars(rows, (x) => ({
                  key: x.key,
                  label: tr(x.label),
                  value: x.all ? (x.n / x.all) * 100 : 0,
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
          харуулна.

          ⚠️ 2026-09-04 · ХУВААГЧ ба БИЧВЭР ЗӨРСӨН согогийг засав. Тайлбар нь
          «олгосон / ГЭРЭЭНИЙ нийт дүн» гэж бичигдсэн байсан ч тооцоо нь
          `planTotal` = сарын ТӨЛӨВЛӨГӨӨНИЙ (CF009) нийлбэрээр хуваадаг. Амьд
          хэмжилт (2026-09-04):
              ΣCF009 (`CF002='САР'`, 131 мөр) = 1,176,410,780,272 ₮
              ΣCF033 (`CF002='ГЭРЭЭ'`, 76 мөр) = 2,073,074,430,035 ₮  → 1.76×
          Олгосон 316,350,173,326 ₮ нь эхнийхээр 26.9%, хоёр дахиар 15.3%.

          ⚠️ ЯАГААД БИЧВЭРИЙГ ЗАСАВ, ХУВААГЧИЙГ БИШ (портал даяар НЭГ
          тодорхойлолт): «олгосон хувь» гэдгийг Finance ба PkgFin ХОЁУЛАА
          төлөвлөгөөгөөр хуваадаг —
              `Finance.tsx` тултип «Олгосон хувь» = `givenCum / planned`
              `PkgFin.tsx`  `givenShare` = `givenTotal / Σ month.amount`
                            самбарын тайлбар «олгосон / төлөвлөгөө»
          Хуваагчийг CF033 болговол энэ дашбоард ганцаараа өөр тоо заахаас
          гадна цувааны хоёр дахь тоо (`m.cumPct` = төлөвлөгөөт биелэлт, мөн
          `planTotal`-аар нормчилогдсон) ӨӨР ХУВААГЧТАЙ болж, нэг тултип дотор
          хоорондоо харьцуулагдахгүй хоёр хувь гарна.
          CF033-той харьцуулах «гэрээний дүнгийн хэдэн хувь олгогдов»
          үзүүлэлт нь `reportData.paidRate` (`paid / contractAmount`)-д ТУСДАА
          байдаг — тэр НЭР нь өөр («гэрээгээр баталгаажсан дүнгийн …»).
          Хэрэв ирээдүйд энэ картыг гэрээний дүнд шилжүүлэх бол `m.cumPct`-ийг
          ч мөн CF033-аар дахин нормчилж, Finance/PkgFin-ийг ХАМТ өөрчилнө. */}
      <Panel title={tr('Санхүүжилтийн хуримтлал — сараар')} note={tr('олгосон / төлөвлөгөөт нийт дүн')}>
        <Data q={fin} loading={tr('Татаж байна…')}>
          {() => {
            const ms = (months ?? []).filter((m) => m.label <= nowYm);
            const total = ms.length ? ms[ms.length - 1].amountCum : 0;
            /* ⚠️ ХУВААГЧ = сарын ТӨЛӨВЛӨГӨӨНИЙ (CF009) нийт нийлбэр — гэрээний
               эрхийн дүн (CF033) БИШ. Дээрх ⚠️-г уншина уу: нэрийг нь солих
               нь тоог нь солихоос АЮУЛГҮЙ байсан. */
            const planTotal = (months ?? []).reduce((a, m) => a + m.amount, 0);
            if (!planTotal || ms.length < 2) return <Empty label={tr('Олголтын бүртгэл алга')} />;
            let cum = 0;
            const pts = ms.map((m) => {
              cum += m.given;
              return {
                key: m.label,
                label: m.label.slice(2),
                value: (cum / planTotal) * 100,
                display: tr('{0} · төл. {1}', pct((cum / planTotal) * 100, 1), pct(m.cumPct, 1)),
              };
            });
            void total;
            return <Series items={pts} height={120} unit="%" line />;
          }}
        </Data>
      </Panel>

      {/* ХОЦРОГДЛЫН ӨӨРЧЛӨЛТ — «одоо хэдэн хувь хоцорч байна» гэдгээс илүү
          чухал асуулт нь «зөрүү ӨСӨЖ байна уу, буурч байна уу». Нэг агшны
          зөрүү нь чиглэлийг хэлдэггүй: 20% хоцрогдол буурч байгаа нь 10%
          хоцрогдол өсөж байгаагаас дээр. */}
      <Panel title={tr('Хоцрогдлын өөрчлөлт — сараар')} note={srcNote(tr('төл. − бодит, багцын дундаж %'), SRC_NEGTGEL)}>
        <Data q={pkgProg} loading={tr('Татаж байна…')}>
          {(list) => {
            const m = new Map<string, { g: number; n: number }>();
            for (const r of list) {
              if (r.actual == null || r.planned == null) continue;
              const ym = r.date.slice(0, 7);
              if (!ym) continue;
              const cur = m.get(ym) ?? { g: 0, n: 0 };
              cur.g += r.planned - r.actual;
              cur.n += 1;
              m.set(ym, cur);
            }
            const pts = [...m.entries()]
              .sort((x, y) => x[0].localeCompare(y[0]))
              .map(([ym, v]) => ({
                key: ym,
                label: ym.slice(2),
                /* Сөрөг зөрүү (төлөвлөгөөнөөс УРД) 0 болно — багана сөрөг урттай
                   байж чадахгүй тул тэмдгийг `display` барина. */
                value: Math.max(0, v.g / v.n),
                display: `${v.g >= 0 ? '−' : '+'}${Math.abs(v.g / v.n).toFixed(1)}%`,
              }));
            return pts.length >= 2
              ? <Series items={pts} height={120} unit="%" />
              : <Empty label={tr('Цуваа зурах бүртгэл алга')} />;
          }}
        </Data>
      </Panel>

      {/* ЭЗЛЭХҮҮНИЙ БИЕЛЭЛТ — гүйцэтгэлийн % нь ЖИНГЭЭР бодогдсон нэгтгэсэн тоо;
          эзлэхүүн нь БИЕТ хэмжигдэхүүн (м³, м²). Хоёр нь зөрвөл аль нэг нь
          буруу бүртгэгдсэн гэсэн үг — тиймээс тусад нь харуулах нь хяналтын
          утга. */}
      <Panel title={tr('Эзлэхүүний биелэлт — багцаар')} note={srcNote(tr('бодит / төлөвлөгөөт эзлэхүүн'), SRC_NEGTGEL)}>
        <Data q={pkgProg} loading={tr('Татаж байна…')}>
          {(list) => {
            const rows = latestPkgProgress(list)
              .filter((x) => (x.volumePlan ?? 0) > 0)
              .map((x) => ({
                key: x.key,
                label: x.label,
                /* ⚠️ `?? 0` БИШ: `loadPkgProgress` нь эзлэхүүнийг САНААТАЙГААР
                   `number | null` болгож буцаадаг (`live.ts` `nOrNull`).
                   Тайлагнаагүй багцыг «0.0% · 0 / N» гэж бичвэл үнэхээр тэг
                   тайлагнасан багцаас ЯЛГАГДАХГҮЙ болж, эрэмбийн ёроолд бодит
                   хэмжилт мэт суудаг байв. Дээрх «Төлөвлөгөө vs бодит» самбар
                   ижил датаг аль хэдийн `null` → «—» гэж харуулдаг. */
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
                  // Багана 0 урттай ч ШОШГО нь үнэнийг хэлнэ
                  value: x.pct ?? 0,
                  display: x.pct == null
                    ? tr('{0} · {1} / {2}', tr('мэдээлэлгүй'), num(x.v), num(x.p))
                    : tr('{0} · {1} / {2}', pct(x.pct, 1), num(x.v), num(x.p)),
                }))}
              />
            ) : <Empty label={tr('Эзлэхүүн бүртгэгдээгүй.')} />;
          }}
        </Data>
      </Panel>

      {/* ТАЙЛАГНАЛЫН ИДЭВХ — сар бүр ХЭДЭН багц бүртгэл оруулсан бэ. Цуваа
          тасарвал дүн «тогтсон» мэт харагдана — үнэндээ хэн ч тайлагнаагүй
          байхад. Энэ карт тэр хоёрыг ялгана. */}
      <Panel title={tr('Тайлагналын идэвх — сараар')} note={srcNote(tr('бүртгэл оруулсан багц'), SRC_NEGTGEL)}>
        <Data q={pkgProg} loading={tr('Татаж байна…')}>
          {(list) => {
            const m = new Map<string, Set<string>>();
            for (const r of list) {
              const ym = r.date.slice(0, 7);
              if (!ym) continue;
              const s2 = m.get(ym) ?? new Set<string>();
              s2.add(r.key);
              m.set(ym, s2);
            }
            const pts = [...m.entries()]
              .sort((x, y) => x[0].localeCompare(y[0]))
              .map(([ym, s2]) => ({
                key: ym,
                label: ym.slice(2),
                value: s2.size,
                display: tr('{0} багц', num(s2.size)),
              }));
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

/**
 * ⚠️ НЭГ ӨНГӨНИЙ СҮҮДЭР — урьд нь 8 өөр солонгон өнгө байсныг хэрэглэгчийн
 * хүсэлтээр нэг суурь өнгө (дашбоардын sky акцент)-ийн уусгалт болгов. Эдгээр
 * ангиллууд (SCOPE, BENEFITS, SOCIAL …) нь өөр өөр «утга»гүй, зөвхөн
 * зэргэлдээ мөрийг ялгах хэрэгцээтэй тул нэг өнгөний шат хамгийн зөв. Утга
 * агуулсан өнгө (гүйцэтгэлийн %, tone) нь ДООРХ тусдаа функцүүдэд хэвээр.
 */
const HUE = shades(CAT_LIGHT[0], 8);
/**
 * ДАШБОАРДЫН НЭГ ӨНГӨ — бүх багана/зүсмэг энэ sky акцентын ТОДООС БҮДГЭР
 * уусгалтаар өнгөтэй (хэрэглэгчийн хүсэлт: солонго биш нэг өнгө). Их утга тод,
 * бага утга бүдэг. `heat(v, max)` нь энэ дүрмийг чартад хэрэглэнэ.
 */
const ACCENT = CAT_LIGHT[0];
/** Утга → нэг өнгөний сүүдэр (их=тод). max≤0 бол суурь өнгө. */
const heat = (v: number, max: number) => tint(ACCENT, max > 0 ? v / max : 1);
// ⚠️ `maxOf` нь `@/lib/agg`-аас импортлогдоно (энд байсан хуулбарыг хасав) —
//    live.ts ч мөн хэрэглэдэг тул нэг газар байх ёстой.

/* ══════════════════ Нийтлэг render хэрэгсэл ══════════════════ */

/**
 * Ring + Stats нүдний НЭГДСЭН толгой — 03/04-д гараар бичигдсэн `o.landTop`
 * бүтэц. Одоо 01, 02, 05, 06, 09 ч хэрэглэнэ тул ГАНЦ компонент болов.
 *
 * ⚠️ `children` нь ЯГ НЭГ элемент (`<Stats>`) байх ёстой — CSS нь
 * `.landTop > :last-child { flex: 1 1 240px }` гэж СҮҮЛИЙН хүүхдэд найддаг.
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
      <Ring value={value} size={132} width={20} color={color} label={label} decimals={decimals} />
    </div>
  );
}

/* ⚠️ `RingStats` УСТГАВ: бөгж ба үзүүлэлтийн эгнээг НЭГ хайрцагт наадаг байв.
   Тэр эгнээ нь одоо газрын зургийн дээрх «тоонуудын зурвас» — дугуй диаграм
   тэнд эгнээний өндрийг тэлж, тоонуудын нэгдмэл шугамыг эвддэг. Зургаан
   дуудагч бүгд `RingCard`-ыг ӨӨРИЙН `Panel`-д, дарааллын сүүлд тавьдаг
   болсон тул бөгж хажуугийн баганад буудаг. */

/** Bars-ын items — `heat()` өнгө нь ЖАГСААЛТЫН дээд утгаар нормчилогдоно */

/**
 * БАГЦЫН БИЕТ ГҮЙЦЭТГЭЛ — «одоо» хүртэлх сүүлийн бөглөгдсөн сарын утга.
 *
 * ⚠️ 2026-08-21: `Төсөл_Гүйцэтгэл_` (Excel-ээс импортлогдсон тест хүснэгт)
 * ХАСАГДСАН. Гүйцэтгэлийн бүх дүн одоо TASK_SHEET («Гүйцэтгэл бөглөх»-ийн
 * нэгтгэл) дээр — тэр нь порталаас БӨГЛӨГДДӨГ тул дэлгэц бүрийн тоо таарна.
 */
function pkgPhys(f: FinData | null, match: (k: string) => boolean): {
  /** Блокоор жигнэсэн дундаж % (тайлагнаагүй бол `null`) */
  actual: number | null;
  /** Тайлагнасан багцын тоо */
  packs: number;
  /** Багц бүрийн сүүлийн % — жагсаалтад */
  rows: { key: string; pct: number }[];
} {
  if (!f) return { actual: null, packs: 0, rows: [] };
  const nowYm = new Date().toISOString().slice(0, 7);
  const rows: { key: string; pct: number }[] = [];
  let w = 0; let n = 0;
  f.phys.forEach((byMon, k) => {
    if (!match(k)) return;
    let last: number | null = null;
    [...byMon.entries()].sort(([x], [y]) => x.localeCompare(y)).forEach(([m, v]) => {
      // ⚠️ 0% нь ХЭМЖИГДСЭН утга (`phys` мөр зөвхөн cnt>0 үед үүснэ) — хасахгүй
      if (m <= nowYm) last = v;
    });
    if (last == null) return;
    rows.push({ key: k, pct: last });
    const cnt = f.physCnt.get(k)?.get(nowYm) ?? 1;
    w += last * cnt; n += cnt;
  });
  return { actual: n ? w / n : null, packs: rows.length, rows: rows.sort((a, b) => b.pct - a.pct) };
}

function heatBars<T>(
  rows: readonly T[],
  m: (r: T) => { key: string; label: string; value: number; display?: string },
): { key: string; label: string; value: number; display?: string; color: string }[] {
  const items = rows.map(m);
  const mx = maxOf(items.map((i) => i.value));
  return items.map((i) => ({ ...i, color: heat(i.value, mx) }));
}


/** Багцын гэр бүлийн нэр — `PKG_HUE`-ийн тайлбар мөрүүдтэй ижил ангилал */
const FAMILY_LABEL: Record<PkgFamily, string> = {
  net: tr('Гадна дулаан, ус (Багц 5)'),
  pow: tr('Цахилгаан, ХТП/РП (Багц 6)'),
  src: tr('Эх үүсвэр, магистраль (Багц 7–15)'),
  site: tr('Өндөржилт, тохижилт (Багц 16–18)'),
  soc: tr('Нийгмийн барилга (Багц 19–21)'),
  com: tr('Холбоо, дохиолол (Багц 1–4)'),
};
/** Гэр бүл → ялгаатай БАГЦЫН тоо (давхаргын тоо БИШ: 6.5 нь трасс+цэг = 2 давхарга) */
const familyPacks = (f: PkgFamily): string[] =>
  [...new Set((PKG_BY_FAMILY[f] ?? []).map((id) => bagtsKey(LAYER_BY_ID[id]?.note)))].filter(Boolean);

function BagtsDetail({ q, prog, hist, pkgProg, flt, onFlt }: {
  q: Async<BagtsRow[]>;
  prog: Async<BlockProgressMap>;
  hist: Async<BlockHistory>;
  pkgProg: Async<PkgProgressRow[]>;
} & FltProps) {
  const sel = flt?.sec === 'bagts' ? flt.key : null;
  // ⚠️ 2026-08-20: Бүх биеийг ороосон `<Data>` боодол ЭРТ-БУЦААЛТ болов —
  //    эс бөгөөс доторх `Panel`-ууд компонентын дээд түвшинд гарахгүй тул
  //    `detailPanels` тэднийг дөрвөн бүсэд хуваарилж чадахгүй (бүгд нэг
  //    картад овоолж, зургийн дээд зурвасыг барина).
  if (q.state !== 'ready') {
    return (
      <Panel title={tr('Багцын мэдээлэл')}>
        <Data q={q} loading={tr('Гурван эх сурвалжийг нэгтгэж байна…')}>{() => null}</Data>
      </Panel>
    );
  }
  const rows = q.data;
  const blocks = sumBy(rows, (x) => x.blocks);
  const ail = sumBy(rows, (x) => x.ail);
  const avg = blocks ? sumBy(rows, (x) => (x.progress ?? 0) * x.blocks) / blocks : null;
  // Хамгийн сүүлийн бүртгэлийн огноо — `BlockProgress.date` нь `joinBagts`-д
  // ХАЯГДДАГ тул `prog`-оос шууд. Ингэснээр «энэ тоо ХЭЗЭЭНИЙ байдлаар» гэсэн
  // асуулт самбар дээрээ хариултаа авна.
  const pm = prog.state === 'ready' ? prog.data : null;
  const asOf = pm ? [...pm.values()].reduce((a, c) => (c.date > a ? c.date : a), '') : '';
  /** Багц дарахад — газрын зурагт тэр багцын блокуудыг тодруулна */
  const pick = (key: string) => {
    const r = rows.find((x) => x.key === key);
    if (!r) return;
    onFlt({
      sec: 'bagts', key, label: tr('Багц: {0}', r.label),
      where: `${BF.bagts} = '${sq(r.label)}'`, only: ['mon:building'],
    });
  };
  return (
    <>
      {/* ⚠️ `missing` ба тайлангийн огноо хоёул `joinBagts`/`loadBlockProgress`-д
          бодогдоод хаягддаг байв. Эдгээрийг ил гаргаснаар «Барилгын хяналт»-тай
          зөрдөг МЭДЭГДЭЖ БУЙ зөрүү (тэд тайлангүй блокоо хасч дундажладаг)
          тайлбарлагдана — хуваарь нь БҮХ блок гэдэг нь толгойд бичигдэв. */}
      <Panel title={tr('Нийт гүйцэтгэл')} note={tr('хуваарь = БҮХ блок (тайлангүй = 0%)')}>
          <Stats cols={2}>
            <Stat accent color={cat(0)} value={num(blocks)} unit={tr('блок')} label={tr('Барилгын блок')} />
            <Stat accent color={cat(3)} value={num(ail)} unit={tr('өрх')} label={tr('Орон сууц')} />
            <Stat accent color={sumBy(rows, (r) => r.missing) ? 'var(--bad)' : NO_DATA}
                  value={num(sumBy(rows, (r) => r.missing))} unit={tr('блок')} label={tr('Тайлан ирээгүй')} />
            <Stat value={asOf || '—'} label={tr('Сүүлийн бүртгэл')} />
          </Stats>
      </Panel>

      {/* ⚠️ Бөгж тоонуудын зурвасаас САЛСАН — хажуугийн баганын карт. */}
      <Panel title={tr('Дундаж гүйцэтгэл')}>
        <RingCard value={avg} label={tr('дундаж гүйцэтгэл')} color={cat(0)} />
      </Panel>

      {/* ⚠️ 2026-09-04: `note` НЭМЭГДЭВ. Энэ карт нь блокийн гүйцэтгэлээс
          (бөглөх хуудас) багцын явцыг бодох бол доорх «Төлөвлөгөө vs бодит —
          багцаар» нь НЭГТГЭЛ хүснэгтээс — ижил нэртэй хоёр «багцын гүйцэтгэл»
          нэг дэлгэцэн дээр зэрэгцэн, эх сурвалж нь бичигдээгүй байв. */}
      <Panel title={tr('Багц бүрийн явц')} note={SRC_SHEET()}>
        <Bars
          inline
          max={100}
          selected={sel}
          onSelect={pick}
          items={rows.map((r) => ({
            key: r.key,
            label: r.label,
            value: r.progress ?? 0,
            display: pct(r.progress, 1),
            color: heat(r.progress ?? 0, 100),
          }))}
        />
      </Panel>

      {/* ДЭД ҮЕ ШАТ Б1–Б5 — `BlockProgress.phases` нь `blockProgress.ts`-д
          задарч бодогдоод `joinBagts`-д хаягддаг байв. «Барилга бүтэн 18%»
          гэдгээс «дотор нь ЯМАР ажил хоцорсон» нь хамаагүй ашигтай. */}
      <Panel title={tr('Дэд үе шатын гүйцэтгэл (Б1–Б5)')}
             note={tr('тайлагнасан блокоор дундажлав — Ring нь БҮХ блокоор тул зөрнө')}>
        {pm == null ? <Empty label={tr('Гүйцэтгэлийн хүснэгт татагдаж байна…')} /> : (() => {
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
              nm, key: no, label: `${no} · ${nm}`, value: v ?? 0,
              display: v == null ? tr('бөглөгдөөгүй') : tr('{0} · {1} блок', pct(v, 1), num(hit.length)),
              color: v == null ? NO_DATA : heat(v, 100),
            };
          })
            // ⚠️ `label`-ээр шүүж БОЛОХГҮЙ: «Б1 ·» !== «Б1» тул шүүлт хоосон гарна
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
          items={rows.map((r) => ({
            key: r.key,
            label: r.label,
            value: r.ail,
            display: tr('{0} өрх', num(r.ail)),
            color: heat(r.ail, maxOf(rows.map((x) => x.ail))),
          }))}
        />
      </Panel>

      {/* ⚠️ ЦУВАА нь 5-Р ХҮҮХДЭЭС ХОЙШ байх ЁСТОЙ: `overview.module.css`-ийн
          `nth-child(n+5)` л түүнд бүтэн өргөн өгдөг. 1–4 слотод 7 хуваарийн
          тэнхлэг нь `var(--side-l)` дотор шахагдаж уншигдахаа болино. */}
      <Panel title={tr('Барилга угсралтын явц')} note={tr('сараар · өссөн дүнгээр')}>
        <Data q={hist} loading={tr('Бүртгэлийн түүхийг уншиж байна…')}>
          {(h) => (
            <Trend
              color={ACCENT}
              points={progressSeries(
                h,
                // ⚠️ `flatMap` — `new Set` болгож ХАСАХГҮЙ. Барилгын давхаргад
                //    113 мөр, ялгаатай (багц|блок) хос нь 111 (2 давхардсан).
                //    `joinBagts` МӨРӨӨР хуваадаг тул давхардлыг хаявал
                //    цувааны хуваарь 111 болж «Нийт гүйцэтгэл» Ring-тэй зөрнө.
                rows.flatMap((r) => r.keys),
                'month',
              ).map((p) => ({
                label: p.label,
                value: p.overall,
                // Сарын шошго бодит хэмжилтийн огноог нуудаг — уншилтын мөрөнд буцаана
                note: p.label === p.date ? undefined : p.date,
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
          const natAil = sumBy(nat, (x) => x.ail);
          const allBlocks = sumBy(rows, (x) => x.blocks);
          const allAil = sumBy(rows, (x) => x.ail);
          const p100 = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
          return (
            <>
              <Stats cols={3}>
                <Stat accent color={HUE[0]} value={`${p100(nat.length, rows.length)}%`}
                  label={tr('Үндэсний багц ({0}/{1})', num(nat.length), num(rows.length))} />
                <Stat accent color={HUE[1]} value={`${p100(natBlocks, allBlocks)}%`}
                  label={tr('Блокийн эзлэх ({0}/{1})', num(natBlocks), num(allBlocks))} />
                <Stat accent color={HUE[2]} value={`${p100(natAil, allAil)}%`}
                  label={tr('Өрхийн эзлэх ({0}/{1})', num(natAil), num(allAil))} />
              </Stats>
            </>
          );
        })()}
      </Panel>

      {/**
        * ⚠️ ГҮЙЦЭТГЭГЧИЙН НЭРИЙН жагсаалтыг дээрх KPI картаас САЛГАВ (чарт бүр
        * НЭГ карт). «Хэдэн хувь үндэсний вэ» ба «ХЭН нь хийж байна вэ» гэдэг
        * хоёр ӨӨР асуулт — нэг хайрцагт хамт байх нь хоёуланг нь бүдгэрүүлж
        * байлаа.
        */}
      {/* ТӨЛӨВЛӨГӨӨ vs БОДИТ — багцын гүйцэтгэлийн нэгтгэлээс.
          ⚠️ `Төсөл_Гүйцэтгэл_` хасагдсаны дараа төлөвлөгөө өгдөг ЦОРЫН ГАНЦ эх. */}
      <Panel title={tr('Төлөвлөгөө vs бодит — багцаар')} note={srcNote(tr('гүйцэтгэлийн нэгтгэл'), SRC_NEGTGEL)}>
        <Data q={pkgProg} loading={tr('Татаж байна…')}>
          {(list) => {
            /* ⚠️ `loadPkgProgress` нь БҮХ түүхийг буцаадаг болсон (02-ын цуваа
               түүнээс зурагдана) тул энд багц бүрийн СҮҮЛИЙН мөрийг ил сонгоно. */
            const withPlan = latestPkgProgress(list).filter((x) => x.actual != null || x.planned != null);
            if (!withPlan.length) return <Empty label={tr('Бүртгэл хоосон байна.')} />;
            return (
              <Bars
                inline
                max={100}
                items={heatBars(withPlan, (x) => ({
                  key: x.key,
                  label: tr(x.label),
                  value: x.actual ?? 0,
                  display: x.planned == null
                    ? pct(x.actual, 1)
                    : tr('{0} / төл. {1}', pct(x.actual, 1), pct(x.planned, 1)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* ЭЗЛЭХҮҮН — багц бүрийн бодит/төлөвлөгөөт ажлын эзлэхүүн */}
      <Panel title={tr('Ажлын эзлэхүүн — багцаар')} note={srcNote(tr('бодит / төлөвлөгөө'), SRC_NEGTGEL)}>
        <Data q={pkgProg} loading={tr('Татаж байна…')}>
          {(list) => {
            const withVol = latestPkgProgress(list).filter((x) => (x.volume ?? 0) > 0 || (x.volumePlan ?? 0) > 0);
            if (!withVol.length) return <Empty label={tr('Эзлэхүүн бүртгэгдээгүй.')} />;
            return (
              <Bars
                inline
                items={heatBars(withVol, (x) => ({
                  key: x.key,
                  label: tr(x.label),
                  value: x.volume ?? 0,
                  display: x.volumePlan == null
                    ? num(x.volume ?? 0)
                    : tr('{0} / {1}', num(x.volume ?? 0), num(x.volumePlan)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* БЛОКИЙН ТАРХАЛТ — «дундаж 27.6%» гэсэн нэг тоо нь 113 блок дунджаараа
          явж байгаа мэт сэтгэгдэл төрүүлдэг; бодит тархалт өөр. */}
      <Panel title={tr('Блокийн гүйцэтгэл — түвшнээр')} note={tr('блокийн тоо')}>
        <Data q={prog} loading={tr('Татаж байна…')}>
          {(pm) => {
            const counts = PROGRESS_LEVELS.map(() => 0);
            pm.forEach((x) => {
              if (x.overall == null) return;
              counts[Math.min(PROGRESS_LEVELS.length - 1, Math.floor(x.overall / 25))] += 1;
            });
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
            /* ⚠️ tr() — Rows түүхийгээр зурдаг тул EN-д «Багц 1 · Гадаад» үлдэхгүй;
               орчуулга дэлгэцийн давхаргад л, өгөгдлийн жишилтэд нөлөөгүй */
            key: `${tr(r.label)} · ${tr(r.origin)}`,   // ⚠️ `r.origin`, дахин lookup БИШ
            value: tr(r.contractor),
          }))}
        />
      </Panel>
    </>
  );
}

/* ══════════════════ 04 · Газар чөлөөлөлт ══════════════════ */

/* ⚠️ `cleanProgress` ХАСАГДАВ — түүнийг зөвхөн устгагдсан «одоогийн төлөв»
   панель хэрэглэдэг байв. Шошгыг цэвэрлэх нь одоо `land.ts`-д (`reasons`) л
   хийгддэг — нэг газар, нэг дүрэм. */

/**
 * ⚠️ ХОЁР ЭХ СУРВАЛЖИЙГ ЗЭРЭГЦҮҮЛНЭ. Илтгэлд 2,206 талбараас 84 үлдсэн гэсэн;
 * `Чөлөөлөгдөөгүй_нэгж_талбар_20260718` давхаргад 224 мөр бүртгэлтэй, ангилал нь
 * ч өөр. Давхарга нь илтгэлээс ХОЙШ шинэчлэгдсэн тул аль нь ч буруу биш.
 */
function LandDetail({ parcels, land, flt, onFlt }: {
  parcels: Async<Row[]>; land: Async<LandStatus>;
} & FltProps) {
  const sel = flt?.sec === 'land' ? flt.key : null;

  return (
    <>
      {/* ⚠️ БҮГД АМЬД (loadLandStatus) — «Газар чөлөөлөлт» харагдацтай нэг эх.
          Илтгэлийн LAND ◆ багц (2,206/1,914/95.5%...) 2026-08-13-нд хасагдав. */}
      <Panel title={tr('Нэгж талбарын гүйцэтгэл')}>
        <Data q={land} loading={tr('Татаж байна…')}>
          {(ls) => (
            <>
                <Stats cols={2}>
                  <Stat accent color={HUE[0]} value={num(ls.total)} unit={tr('талбар')} label={tr('Нийт нэгж талбар')} />
                  <Stat accent color={PARCEL_STATUS_HUES['Бүрэн чөлөөлсөн']} value={num(ls.cleared)} unit={tr('талбар')} label={tr('Бүрэн чөлөөлсөн')} />
                  <Stat accent color={PARCEL_STATUS_HUES['Цэвэрлэсэн нэгж талбар']} value={num(ls.cleaned)} unit={tr('талбар')} label={tr('Цэвэрлэсэн')} />
                  {/* ⚠️ ШИНЭ нүд — эс бөгөөс дөрвөн тоо нийлбэртээ ТААРАХГҮЙ
                      (2,117 ≠ 1,703 + 202 + 176; «Гэрээлсэн» 36 нь алга байв). */}
                  <Stat
                    accent
                    color={PARCEL_STATUS_HUES['Гэрээлсэн']}
                    value={num(ls.byStatus.find((x) => x.label === 'Гэрээлсэн')?.n ?? 0)}
                    unit={tr('талбар')}
                    label={tr('Гэрээлсэн')}
                  />
                  <Stat accent color={PARCEL_STATUS_HUES['Үлдсэн нэгж талбар']} value={num(ls.remaining)} unit={tr('талбар')} label={tr('Үлдсэн')} />
                </Stats>
            </>
          )}
        </Data>
      </Panel>

      {/**
        * ⚠️ Төлөв бүрийн баганан диаграмыг ДЭЭРХ картаас САЛГАВ. Урьд нь бөгж +
        * 5 нүдтэй KPI + баганан диаграм ГУРВУУЛАА нэг картад давхарлаж, аль нь
        * юуг хэлж буй нь ялгарахгүй байв (чарт бүр НЭГ карт).
        */}
      <Panel title={tr('Нэгж талбар — төлөвөөр')}>
        <Data q={land} loading={tr('Татаж байна…')}>
          {(ls) => (
            <Bars
              inline
              selected={flt?.sec === 'land' ? flt.key : null}
              onSelect={(label) => onFlt({
                sec: 'land',
                key: 'st:' + label,
                /* ⚠️ Утгыг ч tr()-ээр — интерполяци түүхийгээр залгадаг тул EN-д
                   «Status: Гэрээлсэн» гэж хольмог гардаг байв (where нь түүхий хэвээр) */
                label: tr('Төлөв: {0}', tr(label)),
                where: `${PL.status} = '${sq(label)}'`,
                only: ['land:left'],
              })}
              items={heatBars([...ls.byStatus].sort((a, b) => b.n - a.n), (x) => ({
                key: x.label,
                label: x.label,
                value: x.n,
                display: tr('{0} талбар', num(x.n)),
              }))}
            />
          )}
        </Data>
      </Panel>

      {/* ⚠️ Бөгж тоонуудын зурвасаас САЛСАН — утга нь render-prop-ийн дотоод
          хувьсагч тул өөрийн `Data`-тай хажуугийн баганын карт. */}
      <Panel title={tr('Чөлөөлөлтийн хувь')}>
        <Data q={land} loading={tr('Татаж байна…')}>
          {(ls) => <RingCard value={ls.pct} label={tr('чөлөөлсөн')} color="var(--good)" />}
        </Data>
      </Panel>

      {/* ⚠️ 2026-08-21: «Хоёр эх сурвалжийн зөрүү» карт ХАСАГДАВ. `Төсөл_Гүйцэтгэл_`
          (Excel-ээс гараар импортлогддог тест хүснэгт) төслөөс хасагдсаны дараа
          зөрүүлэх хоёр дахь эх байхгүй болов — чөлөөлөлтийн ГАНЦ үнэн эх нь
          кадастрын нэгж талбар. Оронд нь тэр эхийн ТООН ТОЙМ. */}
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

      {/* ⚠️ 2026-08-17: Хуучин «Газар чөлөөлөлтийн одоогийн төлөв» панель ХАСАГДАВ.
          Тэр нь БҮХ 2,117 мөрөөс шалтгааныг дахин бүлэглэдэг тул ~1,921 хоосон нь
          91% «Тодорхойгүй» багана болж бусдыг дардаг, мөн `land.ts`-ийн аль хэдийн
          татсан `reasons` бүлэглэлийг давхардуулдаг байв. Доорх гурав нь орлуулга. */}

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
                  {tr('Зөвхөн')} <b>{tr('«Үлдсэн нэгж талбар»')}</b> ({num(ls.remaining)} {tr('талбар)-ын явцын мэдээ. Ангилал дарж газрын зурагт шүүнэ.')}
                </p>
                <Bars
                  inline
                  selected={sel}
                  onSelect={(label) => {
                    // ⚠️ `land.ts` шошгыг ЦЭВЭРЛЭДЭГ (арын зай, төгсгөлийн «.») тул
                    //    `=` биш `LIKE 'нэр%'`. Мөн ЗААВАЛ `Tuluv` шүүлттэй — эс
                    //    бөгөөс зурагт чөлөөлсөн талбарууд ч хамт тодорно.
                    const eq =
                      label === 'Тодорхойгүй'
                        ? `(${PL.progress} IS NULL OR ${PL.progress} = '')`
                        : `${PL.progress} LIKE '${sq(label)}%'`;
                    onFlt({
                      sec: 'land',
                      key: label,
                      /* ⚠️ Утгыг ч tr()-ээр — EN-д хольмог хэл гарахгүй (where түүхий) */
                      label: tr('Шалтгаан: {0}', tr(label)),
                      where: `${PL.status} = 'Үлдсэн нэгж талбар' AND ${eq}`,
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
                  /* ⚠️ Дээрх «Нэгж талбар — төлөвөөр»-тэй ИЖИЛ шүүлт (нэг эх
                     сурвалж, нэг талбар) тул түлхүүрийн угтвар нь ялгаатай —
                     хоёр чарт бие биенийхээ сонголтыг цуцлахгүй. */
                  selected={flt?.sec === 'land' ? flt.key : null}
                  onSelect={(label) => onFlt({
                    sec: 'land',
                    key: `ha:${label}`,
                    /* ⚠️ Утгыг ч tr()-ээр — EN-д хольмог хэл гарахгүй (where түүхий) */
                    label: tr('Төлөв: {0}', tr(label)),
                    where: `${PL.status} = '${sq(label)}'`,
                    only: ['land:left'],
                  })}
                  items={rows.map((x) => ({
                    key: x.label,
                    label: x.label,
                    value: x.ha,
                    display: tr('{0} га · {1}', num(x.ha, 2), pct((x.ha / totHa) * 100, 1)),
                    // ⚠️ Өнгө нь УТГА заана (зургийн `Tuluv` палитртай НЭГ) —
                    //    heat-ийн саарал шат нь энд төлөвийг нуух болно.
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
      <Panel title={tr('Явцын мэдээ — бүх талбар')} note={tr('{0} талбараас', num(2117))}>
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
              <Bars
                inline
                items={heatBars(list, ([label, n]) => ({
                  key: label,
                  label,
                  value: n,
                  display: tr('{0} талбар', num(n)),
                }))}
              />
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
            /* ⚠️ `text`/`nn` нь энэ модульд импортлогдоогүй — `String`/`Number`
               шууд. Талбай нь `area` эсвэл (бөглөгдөөгүй бол) `areaAlt`-аас. */
            const parcelArea = (r: Row) => Number(r[PL.area]) || Number(r[PL.areaAlt]) || 0;
            const left = rows.filter((r) => String(r[PL.status] ?? '').trim() === 'Үлдсэн нэгж талбар');
            const counts = BUCKETS.map((b) => ({
              ...b,
              n: left.filter((r) => {
                const a2 = parcelArea(r);
                return a2 >= b.min && a2 < b.max;
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
            const parcelArea = (r: Row) => Number(r[PL.area]) || Number(r[PL.areaAlt]) || 0;
            const done = rows.filter((r) => String(r[PL.status] ?? '').trim() === 'Бүрэн чөлөөлсөн');
            const counts = BUCKETS.map((b) => ({
              ...b,
              n: done.filter((r) => {
                const a2 = parcelArea(r);
                return a2 >= b.min && a2 < b.max;
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
      <Panel title={tr('Талбайн эзлэхүүн — хэмжээний бүлгээр')} note={tr('га · бүх талбар')}>
        <Data q={parcels} loading={tr('Татаж байна…')}>
          {(rows) => {
            const BUCKETS = [
              { key: 'a1', label: tr('300 м²-ээс бага'), min: 0, max: 300 },
              { key: 'a2', label: tr('300–500 м²'), min: 300, max: 500 },
              { key: 'a3', label: tr('500–700 м²'), min: 500, max: 700 },
              { key: 'a4', label: tr('700–1,000 м²'), min: 700, max: 1000 },
              { key: 'a5', label: tr('1,000 м²-ээс дээш'), min: 1000, max: Infinity },
            ];
            const parcelArea = (r: Row) => Number(r[PL.area]) || Number(r[PL.areaAlt]) || 0;
            const list = BUCKETS.map((b) => {
              const inB = rows.filter((r) => {
                const a2 = parcelArea(r);
                return a2 > 0 && a2 >= b.min && a2 < b.max;
              });
              return { ...b, n: inB.length, m2: inB.reduce((a2, r) => a2 + parcelArea(r), 0) };
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
          187 бөглөгдсөнөөс 183 нь ЯГ «Цэвэрлэсэн нэгж талбар». Өөрөөр хэлбэл
          энэ бол цэвэрлэгдсэн талбарыг ангилсан бүртгэл — тиймээс картын нэр,
          шүүлт хоёр тэр хүрээнд л ярина. Хоёрхон ангилал тул донат (≤3 дүрэм). */}
      <Panel title={tr('Цэвэрлэсэн талбарын төрөл')} note={tr('төрөл бүртгэгдсэн талбар')}>
        <Data q={parcels} loading={tr('Татаж байна…')}>
          {(rows) => {
            const m = new Map<string, number>();
            rows
              .filter((r) => String(r[PL.status] ?? '').trim() === 'Цэвэрлэсэн нэгж талбар')
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
                size={140}
                width={22}
                leaders
                center={num(tot)}
                centerLabel={tr('талбар')}
                items={list.map(([label, n], i) => ({
                  key: label,
                  label,
                  value: n,
                  color: shade(ACCENT, i, list.length),
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

      {/* ЯВЦЫН МЭДЭЭГҮЙ ТАЛБАР — ТӨЛӨВӨӨР. Дээрх «Явцын мэдээ — бүх талбар»
          нь 1,935 талбарт мэдээ ОРУУЛААГҮЙ гэдгийг НЭГ тоогоор хэлнэ. Тэр
          цоорхой ХААНА байгаа нь илүү чухал: бүрэн чөлөөлсөн талбарт мэдээ
          дутуу байх нь хэвийн (ажил дууссан), харин ҮЛДСЭН талбарт дутуу байх
          нь хяналтын цоорхой. */}
      <Panel title={tr('Явцын мэдээгүй талбар — төлөвөөр')} note={tr('мэдээ оруулаагүй')}>
        <Data q={parcels} loading={tr('Татаж байна…')}>
          {(rows) => {
            const m = new Map<string, { no: number; all: number }>();
            rows.forEach((r) => {
              const s2 = String(r[PL.status] ?? '').trim();
              if (!s2) return;
              const v = String(r[PL.progress] ?? '').trim();
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
            ) : <Empty label={tr('Бүх талбарт мэдээ бүртгэгдсэн')} />;
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
 * ⚠️ Шинэ Багц 5.5 нэмэгдвэл ЭНЭ хүснэгтэд гараар нэмнэ.
 */
const NET_SERVES = [
  { key: 'БАГЦ51', label: tr('Багц 5.1 · Багц 1'), bagts: [tr('БАГЦ1')] },
  { key: 'БАГЦ52', label: tr('Багц 5.2 · Багц 2'), bagts: [tr('БАГЦ2')] },
  { key: 'БАГЦ53', label: tr('Багц 5.3 · Багц 3'), bagts: [tr('БАГЦ31'), tr('БАГЦ32'), tr('БАГЦ33')] },
  { key: 'БАГЦ54', label: tr('Багц 5.4 · Багц 4'), bagts: [tr('БАГЦ41'), tr('БАГЦ42')] },
] as const;

/**
 * Гадна дулаан/ус/татуургын багцууд (Багц 5.x, 7, 10–15) — ХЭМЖЭЭ, хангах өрх,
 * эх үүсвэрийн чадал. Багц дарахад зурагт тэр багцын давхаргууд л үлдэнэ.
 *
 * ⚠️ 2026-08-27 — ЭНЭ ХЭСЭГ ГҮЙЦЭТГЭЛИЙН %-ИЙГ ХАРУУЛАХАА БОЛИВ. Шалтгаан нь
 * дизайн БИШ, өгөгдөл: сүлжээний 11 багцын нэг нь ч «Гүйцэтгэл бөглөх»
 * (`Bagts_*`) хуудсанд БАЙДАГГҮЙ — тэдгээр хуудас зөвхөн орон сууцны багцын
 * блокуудыг бүртгэдэг. Тиймээс «Жигнэсэн гүйцэтгэл» бөгж, «Багц бүрийн
 * гүйцэтгэл» ба «Багц бүрийн явц» гурав нь 11 мөр бүхэлдээ «—» харуулж,
 * бүтэн багана эзэлж байв. Хоосон гурван картыг ЗУРАХ нь мэдээлэлгүй
 * төдийгүй ХУДАЛ: хэрэглэгч «гүйцэтгэл бүртгэгдээгүй» гэдгийг «ажил
 * эхлээгүй» гэж уншина.
 *
 * ⚠️ ОРОНД НЬ ХЭМЖЭЭ: давхаргын геометр (`urt_m` / `Shape__Length`) нь 11
 * багц дээр БҮГД бөглөгдсөн — Багц 5.3 24.6 км, Багц 5.4 15.2 км гэх мэт.
 * Энэ бол уг хэсгийн цорын ганц БҮРЭН эх сурвалж.
 */
function NetworkDetail({ bagts, sources, netTotals, flt, onFlt }: {
  bagts: Async<BagtsRow[]>;
  sources: Async<Row[]>;
  netTotals: Async<Map<string, Totals>>;
} & FltProps) {
  const sel = flt?.sec === 'network' ? flt.key : null;
  const pick = (key: string) => {
    const ids = PKG_BY_BAGTS[key] ?? [];
    if (ids.length) onFlt({ sec: 'network', key, label: tr('Багц: {0}', key), layers: ids });
  };

  /**
   * Багц бүрийн нийлбэр хэмжээ. Багц нэгээс олон давхаргатай байж болно
   * (трасс + цэг) тул давхаргуудыг НЭМНЭ.
   *
   * ⚠️ Нэгж ЗӨРНӨ: 9 багц шугам (м), 2 багц байгууламж (м²). Тиймээс нэг
   * баганад нийлүүлэхгүй — `qtyText` давхарга бүрийн нэгжээр бичнэ, урттай
   * багцууд л «Шугамын урт» баганад орно.
   */
  const packs = infraPackList(isNetworkPack).map((p) => {
    const tot = netTotals.state === 'ready' ? netTotals.data : null;
    let n = 0;
    let len = 0;
    let area = 0;
    for (const id of p.ids) {
      const d = LAYER_BY_ID[id];
      const q = tot?.get(id);
      if (!d || !q) continue;
      n += q.n;
      if (d.qty?.unit === 'м') len += q.q;
      else if (d.qty?.unit === 'км') len += q.q * 1000;
      else if (d.qty?.unit === 'м²') area += q.q;
    }
    return { ...p, n, len, area };
  });
  const ready = netTotals.state === 'ready';
  const totalLen = packs.reduce((a, p) => a + p.len, 0);
  const totalObj = packs.reduce((a, p) => a + p.n, 0);

  return (
    <>
      {/* ТОЛГОЙН ЗУРВАС — тоймын `.head`-ийн загварыг ХУУЛСАН (01–04-тэй
          ижил зарчим; загварыг НЭГТГЭЭГҮЙ, `data-sec='network'` дор тусдаа). */}
      <Panel title={tr('Шугам сүлжээний нэгдсэн үзүүлэлт')}>
        <Stats cols={3}>
          <Stat accent color={cat(0)} value={num(packs.length)} unit={tr('багц')} label={tr('Шугам сүлжээний багц')} />
          <Stat accent color={cat(1)} value={ready ? km(totalLen, 1) : '…'} unit={tr('км')} label={tr('Шугамын нийт урт')} />
          <Stat accent color={cat(2)} value={ready ? num(totalObj) : '…'} unit={tr('ш')} label={tr('Сүлжээний объект')} />
          <Stat
            accent
            color={cat(3)}
            value={(() => {
              const rows = bagts.state === 'ready' ? bagts.data : null;
              if (!rows) return '…';
              const ks = NET_SERVES.flatMap((s) => s.bagts);
              return num(sumBy(rows.filter((r) => ks.includes(r.key)), (r) => r.ail));
            })()}
            unit={tr('өрх')}
            label={tr('Холбогдох өрх')}
          />
          <Stat
            accent
            color={cat(4)}
            value={(() => {
              const rows = sources.state === 'ready' ? sources.data : null;
              if (!rows) return '…';
              const F = SOURCE_FS.fields;
              return num(sumBy(rows.filter((r) => srcStr(r[F.type]).startsWith(tr('Дулаан'))), (r) => srcNum(r[F.total])), 1);
            })()}
            unit={tr('МВт')}
            label={tr('Дулааны чадал')}
          />
          <Stat
            accent
            color={cat(5)}
            value={(() => {
              const rows = sources.state === 'ready' ? sources.data : null;
              if (!rows) return '…';
              const F = SOURCE_FS.fields;
              return num(sumBy(rows.filter((r) => srcStr(r[F.type]).startsWith(tr('Ус'))), (r) => srcNum(r[F.total])));
            })()}
            unit={tr('м³/хон')}
            label={tr('Ус хангамжийн чадал')}
          />
        </Stats>
      </Panel>

      {/* ШУГАМЫН УРТ — багцаар. Энэ нь хэсгийн ГОЛ хэмжигдэхүүн: сүлжээний
          багцын «хэмжээ» гэдэг нь блокийн тоо биш, тавих шугамын урт. */}
      <Panel title={tr('Шугамын урт — багцаар')} note={tr('км')}>
        <Data q={netTotals} loading={tr('Татаж байна…')}>
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
          өрх холбож байгааг харуулна.

          ⚠️ Урт нь ганцаараа «том/жижиг» гэдгээс өөр юу ч хэлдэггүй: 24.6 км нь
          Багц 5.3 хамгийн олон блоктой учраас урт. Өрхөд хуваасан үед л
          багцуудыг ЖИШИЖ болно — сунасан, сийрэг суурьшилтай багц өндөр
          гарна.

          ⚠️ Зөвхөн Багц 5.1–5.4: тэдгээр л ТОДОРХОЙ орон сууцны багц хангадаг
          (`NET_SERVES`). Багц 7, 10–15 нь бүх төслийг хамардаг магистраль тул
          өрхөд хуваах нь утгагүй. */}
      <Panel title={tr('Нэг өрхөд ногдох шугамын урт')} note={tr('м / өрх')}>
        <Data q={netTotals} loading={tr('Татаж байна…')}>
          {() => {
            const rows2 = bagts.state === 'ready' ? bagts.data : null;
            if (!rows2) return <Empty label={tr('Орон сууцны багцын өрхийн тоо алга.')} />;
            const list = NET_SERVES
              .map((s) => {
                const p = packs.find((x) => x.key === s.key);
                const ail = sumBy(rows2.filter((r) => s.bagts.includes(r.key)), (r) => r.ail);
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
            // Газрын зурагт давхарга БАЙГАА багц л бар болно — дарахад юу ч болохгүй бар гарахгүй
            const groups = NET_SERVES
              .filter((s) => (PKG_BY_BAGTS[s.key] ?? []).length)
              .map((s) => ({ ...s, ail: of(s.bagts, (r) => r.ail), blocks: of(s.bagts, (r) => r.blocks) }))
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
                    display: tr('{0} өрх · {1} блок', num(s.ail), num(s.blocks)),
                  }))}
                />
              </>
            );
          }}
        </Data>
      </Panel>

      {/* ОБЬЕКТЫН ТОО — багцаар. Урт нь «хэр их шугам», объектын тоо нь «хэр
          олон эд анги» (худаг, хаалт, тулгуур) — хоёр өөр асуулт.
          ⚠️ Багц 13 (усан сан) ба Багц 15 (насос станц) нь ШУГАМ БИШ,
          БАЙГУУЛАМЖ — уртын баганад гарахгүй тул зөвхөн энд харагдана. */}
      <Panel title={tr('Сүлжээний объектын тоо — багцаар')} note={tr('ширхэг')}>
        <Data q={netTotals} loading={tr('Татаж байна…')}>
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
            const heatRows = rows.filter((r) => srcStr(r[F.type]).startsWith(tr('Дулаан')));
            if (!heatRows.length) return <Empty label={tr('Эх үүсвэрийн бүртгэл хоосон.')} />;
            return (
              /* ≤3 бол донат, эс бөгөөс хэвтээ бар (4+ дүрэм) */
              heatRows.length <= 3 ? (
                <Donut
                  size={140}
                  width={22}
                  leaders
                  center={num(sumBy(heatRows, (r) => srcNum(r[F.total])), 1)}
                  centerLabel={tr('МВт')}
                  items={heatRows.map((r, i) => ({
                    key: srcStr(r[F.name]) || String(i),
                    label: srcStr(r[F.name]) || tr('Нэргүй'),
                    value: srcNum(r[F.total]),
                    color: shade(ACCENT, i, heatRows.length),
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
            const waterRows = rows.filter((r) => srcStr(r[F.type]).startsWith(tr('Ус')));
            if (!waterRows.length) return <Empty label={tr('Эх үүсвэрийн бүртгэл хоосон.')} />;
            return (
              waterRows.length <= 3 ? (
                <Donut
                  size={140}
                  width={22}
                  leaders
                  center={num(sumBy(waterRows, (r) => srcNum(r[F.total])))}
                  centerLabel={tr('м³/хон')}
                  items={waterRows.map((r, i) => ({
                    key: srcStr(r[F.name]) || String(i),
                    label: srcStr(r[F.name]) || tr('Нэргүй'),
                    value: srcNum(r[F.total]),
                    color: shade(ACCENT, i, waterRows.length),
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

      {/**
        * ⚠️ Нөөцийн тэмдэглэл ДЭЭРХ чадлын картаас САЛГАВ (чарт бүр НЭГ карт).
        * Тэдгээр нь эх сурвалж бүрийн ЧӨЛӨӨТ БИЧВЭР тул тоон үзүүлэлттэй нэг
        * хайрцагт байх нь уншилтыг хутгаж байлаа.
        */}
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
        <Data q={netTotals} loading={tr('Татаж байна…')}>
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
                size={140}
                width={22}
                leaders
                center={km(groups.reduce((a2, g) => a2 + g.len, 0), 1)}
                centerLabel={tr('км')}
                items={groups.map((g, i) => ({
                  key: g.key,
                  label: g.label,
                  value: g.len,
                  color: shade(ACCENT, i, groups.length),
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
        <Data q={netTotals} loading={tr('Татаж байна…')}>
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
        <Data q={netTotals} loading={tr('Татаж байна…')}>
          {() => {
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

      {/* ⚠️ «Багц бүрийн явц — шугам сүлжээ» карт ХАСАГДСАН (2026-08-27).
          Эх нь `TASK_SHEET` («Гүйцэтгэл бөглөх») байсан ч тэр хуудсууд
          сүлжээний багцыг ОГТ бүртгэдэггүй тул `net.rows` үргэлж хоосон,
          карт үргэлж «Гүйцэтгэлийн бүртгэл алга» гэж зурагдаж байв.
          Сүлжээний багцын гүйцэтгэлийг бүртгэдэг эх сурвалж гарвал энд
          буцааж нэмнэ. */}
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
 *
 * ⚠️ `srcStr`/`srcNum` нь ДООР (07-ийн хэсэгт) тодорхойлогдсон — `const` тул
 * модуль ачаалагдах үед TDZ-д байх ч компонент нь ХОЙШ рендерлэгддэг тул
 * дуудахад аль хэдийн бий. `railStat` ч мөн ижилхэн доороос дуудаж байгаа.
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
   *
   * ⚠️ ХТП/РП-ийн багцууд (6.5–6.8) нь ХОЁР давхаргатай: трасс (шугам, урт) ба
   * цэг (байгууламж, уртгүй). Хоёуланг нэмнэ — урт нь трассаас, объектын тоо
   * нь хоёулангаас.
   */
  const packs = items.map((p) => {
    const tot = powTotals.state === 'ready' ? powTotals.data : null;
    let n = 0;
    let len = 0;
    for (const id of p.ids) {
      const d = LAYER_BY_ID[id];
      const q = tot?.get(id);
      if (!d || !q) continue;
      n += q.n;
      if (d.qty?.unit === 'м') len += q.q;
      else if (d.qty?.unit === 'км') len += q.q * 1000;
    }
    return { ...p, n, len };
  });
  const ready = powTotals.state === 'ready';
  const totalLen = packs.reduce((a, p) => a + p.len, 0);
  const totalObj = packs.reduce((a, p) => a + p.n, 0);
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
            // ⚠️ Үйлчилгээ хоосон буцаавал «0%» ХЭВЛЭХГҮЙ — төлөвөө ил хэлнэ
            if (!capTotal) return <Empty label={tr('Цахилгааны эх үүсвэрийн чадал бүртгэгдээгүй.')} />;
            const newOne = cap.find((x) => x.planned);
            const oldOne = cap.find((x) => !x.planned);
            const plannedMw = newOne?.mw ?? 0;
            return (
              // ⚠️ Энд 61%, 07-д (`хангах_хувь`-аар) 62% — тиймээс `decimals={0}`
              //    бөгөөд шошго нь «хангамж» БИШ «эх үүсвэрийн чадал».
                <Stats cols={3}>
                  <Stat accent color={cat(0)} value={num(capTotal, 1)} unit={tr('МВт')} label={tr('Нийт эх үүсвэрийн чадал')} />
                  <Stat accent color={cat(1)} value={num(capTotal - plannedMw, 1)} unit={tr('МВт')}
                        label={oldOne ? shortSrc(oldOne.name) : tr('Одоо байгаа дэд станц')} />
                  <Stat accent color={cat(2)} value={num(plannedMw, 1)} unit={tr('МВт')}
                        label={newOne ? shortSrc(newOne.name) : tr('Төлөвлөж буй дэд станц')} />
                  <Stat accent color={cat(3)} value={num(packs.length)} unit={tr('багц')} label={tr('Цахилгааны багц')} />
                  <Stat accent color={cat(4)} value={ready ? km(totalLen, 1) : '…'} unit={tr('км')} label={tr('Кабелийн нийт урт')} />
                  <Stat accent color={cat(5)} value={ready ? num(totalObj) : '…'} unit={tr('ш')} label={tr('Сүлжээний объект')} />
                </Stats>
            );
          }}
        </Data>
      </Panel>

      {/* ⚠️ Бөгж тоонуудын зурвасаас САЛСАН — утга нь render-prop-ийн дотоод
          тооцоо тул өөрийн `Data`-тай хажуугийн баганын карт. */}
      <Panel title={tr('Шинэ дэд станцын эзлэх хувь')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const cap = rows
              .filter((r) => srcStr(r[F.type]).startsWith('Цахилгаан'))
              .map((r) => ({ mw: srcNum(r[F.total]), planned: /Шинээр/.test(srcStr(r[F.name])) }));
            const capTotal = sumBy(cap, (x) => x.mw);
            if (!capTotal) return <Empty label={tr('Бүртгэл алга.')} />;
            const plannedMw = cap.find((x) => x.planned)?.mw ?? 0;
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

      {/* ⚠️ «Багц бүрийн явц — цахилгаан» карт ХАСАГДСАН (2026-08-27) — 05-ын
          ижил картын ЯГ ижил шалтгаанаар. Эх нь `TASK_SHEET` («Гүйцэтгэл
          бөглөх») байсан ч тэр хуудсууд ЗӨВХӨН орон сууцны багцын блокуудыг
          бүртгэдэг: цахилгааны 8 багцын нэг нь ч тэнд байхгүй тул карт
          ҮРГЭЛЖ «Цахилгааны багцын бүртгэл алга» гэж зурагдаж байв.

          Оронд нь ХЭМЖЭЭ: кабелийн трассын урт нь 8 багц дээр БҮГД
          бөглөгдсөн (Багц 6.3 10.2 км … Багц 6.7 0.6 км). */}
      <Panel title={tr('Кабелийн урт — багцаар')} note={tr('км')}>
        <Data q={powTotals} loading={tr('Татаж байна…')}>
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
            // ⚠️ Талбарын нэрийг ГАРААР бичихгүй: Багц 3.2-ын талбар нь дан `МВт_`.
            //    ҮРГЭЛЖ `SOURCE_FS.consumers`-аар давтна.
            const raw = SOURCE_FS.consumers
              .filter((c) => /^Багц/.test(c.label))     // odoo / olonN / surTsets ХАСНА
              .map((c) => {
                const per = pw
                  .map((r) => ({ src: shortSrc(srcStr(r[F.name])), mw: srcNum(r[c.field]) }))
                  .filter((x) => x.mw > 0);
                return {
                  key: bagtsKey(c.label),
                  trunk: (c.label.match(/\d/) ?? ['0'])[0],   // «Багц 3.2» → «3»
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
                    const bag = tr('БАГЦ6{0}', trunk);
                    const ids = PKG_BY_BAGTS[bag] ?? [];
                    // ⚠️ `flt.key` нь БАГЦЫН код — эс бөгөөс 4-р картын `selected`
                    //    тааралдахгүй, зураг шүүгдсэн ч тэр мөр тодрохгүй.
                    if (ids.length) onFlt({ sec: 'power', key: bag, label: tr('Багц: {0}', bag), layers: ids });
                  }}
                />
              </>
            );
          }}
        </Data>
      </Panel>

      {/* ⚠️ 2026-08-27: баганын утга нь «ГАЗРЫН ЗУРГИЙН ДАВХАРГЫН ТОО» (1 эсвэл
          2) байснаа ОБЬЕКТЫН ТОО болов. Тэр хуучин тоо нь «энэ багц цэгэн
          давхаргатай юу» гэдгээс өөр юу ч илэрхийлдэггүй байсан бөгөөд картын
          тайлбар өөрөө «физик хэмжээ БИШ» гэж уучлалт гуйж байв. Хэмжээ нь
          `powTotals`-аар одоо БОДИТООР татагдана — уучлалт хэрэггүй болов. */}
      <Panel title={tr('Гадна цахилгаан (БАГЦ-6)')} note={tr('ширхэг')}>
        <Data q={powTotals} loading={tr('Татаж байна…')}>
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
                  {/* ⚠️ 7 БАГАНАН ЧАРТ ХИЙХГҮЙ: бүх блок 0% тул хоосон Bars нь
                      «эвдэрсэн» мэт харагдана. Тоог ил хэлэх нь зөв. */}
                  {tr('Барилга дотрын цахилгаан, гэрэлтүүлгийн ажил')} {num(cells.length)} {tr('блокийн')}
                  {' '}<b>{num(cells.length - started)}</b>{tr('-д хараахан эхлээгүй.')}
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
        <Data q={powTotals} loading={tr('Татаж байна…')}>
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
                size={140}
                width={22}
                leaders
                center={num(groups.reduce((a2, g) => a2 + g.n, 0))}
                centerLabel={tr('ш')}
                items={groups.map((g, i) => ({
                  key: g.key,
                  label: g.label,
                  value: g.n,
                  color: shade(ACCENT, i, groups.length),
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
        <Data q={powTotals} loading={tr('Татаж байна…')}>
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
          нь сүлжээний БҮХ ачаалал мэт уншигдана.

          ⚠️ ХУВИЙГ `нийт_чадал`-ААС БОДОХГҮЙ. Амьд шалгасан (2026-08-27):
          «Одоо байгаа Төгөл 35/10» станцын `нийт_чадал` 18.0 МВт атал түүний
          хэрэглэгчийн баганууд нийлбэрээрээ 30.0 МВт гардаг; шинэ станц дээр
          28.3 vs 29.8. Өөрөөр хэлбэл хуваарилалтын багана нь станцын чадлын
          ХУВААРИЛАЛТ БИШ — өөр суурьтай бүртгэл. Тиймээс хувь нь
          ХУВААРИЛАГДСАН НИЙТ ДҮНГЭЭС бодогдоно, «үлдсэн нөөц» гэж тооцохгүй:
          тэр тоо сөрөг гарна. */}
      <Panel title={tr('Чадлын хуваарилалт — хэрэглэгчийн бүлгээр')} note={tr('МВт · хуваарилсан дүнгээс')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const pw = rows.filter((r) => srcStr(r[F.type]).startsWith('Цахилгаан'));
            if (!pw.length) return <Empty label={tr('Бүртгэл алга.')} />;
            /** Хэрэглэгчийн БҮЛЭГ бүрийн нийлбэр — `SOURCE_FS.consumers`-аар */
            const group = (pred: (label: string) => boolean) =>
              sumBy(
                SOURCE_FS.consumers.filter((c) => pred(c.label)),
                (c) => sumBy(pw, (r) => srcNum(r[c.field])),
              );
            const list = [
              { key: 'pack', label: tr('Орон сууцны багц'), mw: group((l) => /^Багц/.test(l)) },
              { key: 'olon', label: tr('Олон нийтийн бүс'), mw: group((l) => l === tr('Олон нийт')) },
              { key: 'odoo', label: tr('Одоо байгаа хэрэглэгч'), mw: group((l) => l === tr('Одоо байгаа')) },
              { key: 'sur', label: tr('Сургууль, цэцэрлэг'), mw: group((l) => l === tr('Сургууль, цэцэрлэг')) },
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
          бүртгэгдсэн хэрэглэгчийн нийлбэрийг ЗЭРЭГЦҮҮЛНЭ.

          ⚠️ Энэ карт нь өгөгдлийн ЗӨРҮҮГ ил гаргах зорилготой: хоёр станцын
          алинд нь ч хэрэглэгчийн нийлбэр зарласан чадлаас ДАВЖ байна (18.0 vs
          30.0 ба 28.3 vs 29.8). Хоёр багана өөр суурьтай гэдгийг нуувал
          «46.3 МВт хүрэлцэнэ» гэсэн дүгнэлт чимээгүй гарна. Аль тоо зөв нь
          порталын шийдэх асуудал БИШ — эх сурвалж дээр тодруулах ёстой. */}
      <Panel title={tr('Дэд станцын ачаалал')} note={tr('зарласан чадал / бүртгэгдсэн хэрэглэгч, МВт')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const list = rows
              .filter((r) => srcStr(r[F.type]).startsWith('Цахилгаан'))
              .map((r) => ({
                key: srcStr(r[F.name]),
                label: shortSrc(srcStr(r[F.name])),
                cap: srcNum(r[F.total]),
                load: sumBy(SOURCE_FS.consumers, (c) => srcNum(r[c.field])),
              }))
              .filter((x) => x.cap > 0 || x.load > 0)
              .sort((a2, b2) => b2.load - a2.load);
            if (!list.length) return <Empty label={tr('Бүртгэл алга.')} />;
            const top = Math.max(...list.map((x) => Math.max(x.cap, x.load)));
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

const srcNum = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
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
      where: `${F.name} LIKE '${sq(name)}%'`, only: ['source:eh'],
    });
  };
  // ⚠️ 2026-08-20: Бүх биеийг ороосон `<Data>` боодол ЭРТ-БУЦААЛТ болов —
  //    эс бөгөөс доторх `Panel`-ууд компонентын дээд түвшинд гарахгүй тул
  //    `detailPanels` тэднийг дөрвөн бүсэд хуваарилж чадахгүй (бүгд нэг
  //    картад овоолж, зургийн дээд зурвасыг барина).
  if (sources.state !== 'ready') {
    return (
      <Panel title={tr('Эх үүсвэр')}>
        <Data q={sources} loading={tr('Эх үүсвэрийн мэдээллийг татаж байна…')} minH={420}>{() => null}</Data>
      </Panel>
    );
  }
  const rows = sources.data;
  /**
   * ⚠️ ДАРААЛАЛ ТОГТМОЛ байх ёстой: `Set`-ийн орох дараалал нь сервисийн
   * мөрийн эрэмбээс хамаарах тул картууд зүүн/баруун баганын хооронд
   * санамсаргүй үсэрч байв (`nth-child` слот).
   */
  const TYPE_ORDER = [tr('Дулаан'), tr('Цахилгаан'), tr('Ус')];
  const rank = (t: string) => {
    const i = TYPE_ORDER.findIndex((x) => t.startsWith(x));
    return i < 0 ? 99 : i;
  };
  const types = [...new Set(rows.map((r) => srcStr(r[F.type])))]
    .filter(Boolean)
    .sort((a, b) => rank(a) - rank(b));
  /**
   * ⚠️ `torol` ХООСОН мөр нь `types`-д ороогүй тул ЯМАР Ч самбарт
   * гарахгүй, харин `railStat` нь `rows.length`-ийг бүтнээр тоолдог —
   * тоо ЗӨРНӨ. Тоог нуухгүй: 1-р картын тайлбарт ил хэлнэ.
   */
  const untyped = rows.filter((r) => !srcStr(r[F.type])).length;
  // ⚠️ Үйлчилгээ 0 мөр буцаавал баганад толгойноос өөр юу ч гарахгүй —
  //    хэрэглэгч «эвдэрсэн» гэж ойлгохгүйн тулд хоосон төлөвөө ил хэлнэ.
  if (!types.length) return <Empty label={tr('Эх үүсвэрийн бүртгэл хоосон байна.')} />;
  return (
    <>
      {/* `нийт_чадал` нь өнөөдөр зөвхөн Donut-ийн нөөц утга — байгууламжийн
          БҮРЭН чадал нь тоогоор хаана ч гардаггүй байв. */}
      <Panel title={tr('Эх үүсвэрийн нэгдсэн чадал')}>
        <Stats cols={3}>
          {types.map((t, i) => {
            const facs = rows.filter((r) => srcStr(r[F.type]) === t);
            /* ⚠️ Бутархайг ТҮҮХИЙ төрлөөр шийднэ: `unit` нь tr()-ээр орчуулагддаг
               тул EN-д «MW» болж, `=== 'МВт'` жишилт хэзээ ч биелэхгүй байв */
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
                // ⚠️ Зөвхөн «эх үүсвэр» гэдгийг хасна (картын гарчигт аль хэдийн
                //    бий). Харьяалахын нөхцөлийг («ын/ий/н») тайрах гэж
                //    оролдвол амьд утга «Усан хангамжийн эх үүсвэр» нь
                //    «Усан хангамжий» болж ҮГ ТАСАРНА — нөхцөл нь үлдэх нь зөв.
                label={tr('{0} · {1} байгууламж', t.replace(/\s*эх\s+үүсвэр\s*$/u, ''), num(facs.length))}
              />
            );
          })}
          {/* ⚠️ Гурван төрлийн ард БАЙГУУЛАМЖИЙН ТӨЛӨВ. Нэр нь өөрөө төлвөө
              агуулдаг («Одоо байгаа…», «Баригдаж буй…», «Шинээр барих…») —
              нэмэлт талбар БАЙХГҮЙ тул нэрнээс уншина.
              ⚠️ Усан сангууд төлвийн угтваргүй: тэдгээр нь АШИГЛАЛТАД байгаа
              боловч нэр нь үүнийг хэлдэггүй. Тиймээс «баригдсан» гэж таамаглах
              БИШ, тусад нь тоолж «угтваргүй» гэж ил хэлнэ. */}
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
        return (
          <Panel key={type} title={type}>
            {facs.length <= 3 ? (
              <Donut
                size={130}
                width={22}
                leaders
                selected={sel}
                onSelect={pick}
                center={`${facs.length}`}
                centerLabel={tr('байгууламж')}
                items={facs.map((f, i) => ({
                  key: srcStr(f[F.name]) || `#${i}`,
                  label: srcStr(f[F.name]),
                  value: srcNum(f[F.share]) || srcNum(f[F.total]),
                  display: srcStr(f[F.share]) || srcStr(f[F.total]),
                  color: shade(ACCENT, i, facs.length),
                }))}
              />
            ) : (
              <Bars
                inline
                selected={sel}
                onSelect={pick}
                items={heatBars(facs, (f) => ({
                  key: srcStr(f[F.name]) || tr('Нэргүй'),
                  label: srcStr(f[F.name]),
                  value: srcNum(f[F.share]) || srcNum(f[F.total]),
                  display: srcStr(f[F.share]) || srcStr(f[F.total]),
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
          ирээдүйн чадалтай нэг мөрөнд уншигдана.

          ⚠️ Усан сангууд төлвийн угтваргүй тул тэднийг ЭНД ОРУУЛАХГҮЙ —
          «баригдсан» гэж таамаглавал ус хангамж 100% бэлэн мэт харагдана. */}
      <Panel title={tr('Чадлын бэлэн байдал — төрлөөр')} note={tr('ашиглалтад байгаа хувь')}>
        {(() => {
          const list = types
            .filter((ty) => !ty.includes(tr('Ус')))
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
              sumBy(rows.filter((r) => srcStr(r[F.type]).startsWith(tr('Дулаан'))), (r) => srcNum(r[field]));
            const powOf = (field: string) =>
              sumBy(rows.filter((r) => srcStr(r[F.type]).startsWith(tr('Цахилгаан'))), (r) => srcNum(r[field]));
            const list = SOURCE_FS.consumers
              .filter((c) => /^Багц/.test(c.label))
              .map((c) => {
                const key = bagtsKey(c.label);
                const ail = sumBy(bag.filter((x) => x.key === key), (x) => x.ail);
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
            return tot > 0 ? (mine / tot) * 100 : 0;
          };
          const list = SOURCE_FS.consumers
            .filter((c) => /^Багц/.test(c.label))
            .map((c) => ({
              key: bagtsKey(c.label),
              label: c.label,
              heat: shareOf(tr('Дулаан'), c.field),
              pow: shareOf(tr('Цахилгаан'), c.field),
              wat: shareOf(tr('Ус'), c.field),
            }))
            .filter((x) => x.heat > 0 || x.pow > 0 || x.wat > 0)
            .sort((a2, b2) => b2.heat - a2.heat);
          if (!list.length) return <Empty label={tr('Хуваарилсан чадлын өгөгдөл алга.')} />;
          return (
            <Bars
              inline
              items={heatBars(list, (x) => ({
                key: x.key,
                label: x.label,
                value: x.heat,
                display: tr('дул. {0} · цах. {1} · ус {2}', pct(x.heat, 1), pct(x.pow, 1), pct(x.wat, 1)),
              }))}
            />
          );
        })()}
      </Panel>

      <Panel title={tr('Хангамжийн хүрэлцээ — нэгжид ногдох')}>
        {(() => {
          const h = d.headline.state === 'ready' ? d.headline.data : null;
          const ail = d.bagts.state === 'ready' ? sumBy(d.bagts.data, (x) => x.ail) : null;
          const capOf = (pre: string) =>
            sumBy(rows.filter((r) => srcStr(r[F.type]).startsWith(pre)), (r) => srcNum(r[F.total]));
          const consOf = (pre: string) => sumBy(
            rows.filter((r) => srcStr(r[F.type]).startsWith(pre)),
            (r) => sumBy(SOURCE_FS.consumers, (c) => srcNum(r[c.field])),
          );
          const heatMw = capOf(tr('Дулаан'));
          const elMw = capOf(tr('Цахилгаан'));
          const waterM3 = capOf(tr('Ус'));
          const share = (a: number, b: number) => (b ? pct((a / b) * 100, 1) : '—');
          return (
            <>
              <Rows
                items={[
                  { key: tr('1,000 хүнд ногдох дулаан'),
                    value: h?.population ? tr('{0} МВт', num(heatMw / (h.population / 1000), 2)) : '…' },
                  { key: tr('1 өрхөд ногдох цахилгаан'),
                    value: ail ? tr('{0} кВт', num((elMw * 1000) / ail, 2)) : '…' },
                  { key: tr('1 хүнд ногдох ус'),
                    value: h?.population ? tr('{0} л/хоног', num((waterM3 * 1000) / h.population, 0)) : '…' },
                  { key: tr('Дулаан — хуваарилсан ÷ чадал'), value: share(consOf(tr('Дулаан')), heatMw) },
                  { key: tr('Цахилгаан — хуваарилсан ÷ чадал'), value: share(consOf(tr('Цахилгаан')), elMw) },
                  { key: tr('Ус — хуваарилсан ÷ чадал'), value: share(consOf(tr('Ус')), waterM3) },
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
 * ТӨСВИЙН ЭХ = cashflow_0813 /173 (CASHFLOW2) — захирамж/гэрээгээр баталгаажсан
 * ТӨСЛИЙН төсөв (2026-08-14, хэрэглэгчийн шийдвэр). Санхүүгийн ганц зөв эх нь
 * cashflow. «Хөрөнгө оруулалт өртөг» /249 бүхэлдээ түр хасагдсан.
 *
 * ⚠️ 2026-08-31: `Cashflow /106` (76 мөр, 12 сар нь БАГАНА) → `cashflow_0813
 * /173` (209 мөр, «гэрээ × үе» тутам НЭГ мөр). Энэ картуудын БҮХ дүн ЗӨВХӨН
 * мастер мөрөөс (`CASHFLOW2.where.master`, CF002 = 'ГЭРЭЭ') ирэх ёстой —
 * төрлөөр шүүхгүй бол 76 гэрээ 209 удаа тоологдоно (мөнгөн НИЙЛБЭР санамсаргүй
 * зөв гарч, зөвхөн ТООЛОЛ ба дундаж худал болно — нүдээр илрэхгүй алдаа).
 */
/**
 * ₮ — портал даяарх ГАНЦ дүрэм (`format.mnt`): бүтэн, мянгатын таслалтай.
 * ⚠️ Урьд нь энд «их наяд / тэрбум / сая» гэсэн ТУСДАА хуулбар байсан. Хэрэглэгч
 *    2026-09-01-нд бүх мөнгөн дүнг бүтнээр гэж шийдсэн тул `mnt` рүү нэгтгэв.
 */
const tug = (v: number): string => mnt(v);

function FinanceDetail({ budget, flt, onFlt }: { budget: Async<Budget> } & FltProps) {
  // ⚠️ 2026-08-20: Бүх биеийг ороосон `<Data>` боодол ЭРТ-БУЦААЛТ болов —
  //    эс бөгөөс доторх `Panel`-ууд компонентын дээд түвшинд гарахгүй тул
  //    `detailPanels` тэднийг дөрвөн бүсэд хуваарилж чадахгүй (бүгд нэг
  //    картад овоолж, зургийн дээд зурвасыг барина).
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
          {/* ⚠️ 2026-08-31: «Өмнө шилжүүлсэн» нь ГЭРЭЭ ТУТМЫН багана БАЙХАА
              БОЛЬСОН. Одоо зөвхөн `CF002 = 'ӨМНӨХ ШИЛЖҮҮЛСЭН'` гэсэн 2 мөр
              бий, дүн нь `CF009`-д (нийт 4,058,800,000 ₮).
              ⚠️ CF027/CF028 гэсэн КОД одоо ӨӨР баганыг заана — тэдгээр нь
              санхүүжилтийн ЭХ ҮҮСВЭРИЙН («Нийслэлийн төсөв», «НЗД нөөц»)
              гэрээний нийт дүн. Хуучин тайлбарыг дагаж тэднийг «өмнө
              шилжүүлсэн» гэж уншвал алдаа шидэхгүй, зүгээр л худал тоо гарна. */}
          <Stat accent color={HUE[3]} value={num(bg.transferred)} unit={tr('₮')} label={tr('Өмнө шилжүүлсэн')} />
          {/* Энэ хувь нь урьд нь ЗӨВХӨН зүүн жагсаалтын мөрөнд байсан —
              хэсгээ нээхэд алга болдог байв. */}
          <Stat accent color={HUE[4]}
                value={bg.total ? pct((bg.contract / bg.total) * 100, 1) : '—'}
                label={tr('Гэрээгээр баталгаажсан эзлэх хувь')} />
        </Stats>
      </Panel>
  
      <Panel title={tr('Санхүүжилтийн шат')} note={tr('суурь = нийт төсөвт өртөг {0}', tug(bg.total))}>
        <Bars
          // ⚠️ max = bg.total — 4 багана НЭГ суурьтай тул урт нь шууд харьцуулагдана
          max={bg.total}
          items={[
            { key: 'total', label: tr('Төсөвт өртөг'), value: bg.total },
            { key: 'order', label: tr('Захирамжаар'), value: bg.orderTotal },
            { key: 'contract', label: tr('Гэрээгээр'), value: bg.contract },
            { key: 'paid', label: tr('Шилжүүлсэн'), value: bg.transferred },
          ].map((x, i, a) => ({
            ...x,
            display: `${tug(x.value)} · ${bg.total ? pct((x.value / bg.total) * 100, 1) : '—'}`,
            color: shade(ACCENT, i, a.length),
          }))}
        />
        <p className={o.note}>
          {tr('Захирамжгүй')} <b>{tug(Math.max(0, bg.total - bg.orderTotal))}</b> {tr('· гэрээгүй')} <b>{tug(Math.max(0, bg.orderTotal - bg.contract))}</b> {tr('· шилжүүлээгүй')} <b>{tug(Math.max(0, bg.contract - bg.transferred))}</b>.
        </p>
      </Panel>
  
      <Panel title={tr('Санхүүжилтийн эх үүсвэр (захирамжаар)')}>
        {bg.sources.length <= 3 ? (
          <Donut
            items={bg.sources.map((s, i) => ({
              key: s.key, label: s.label, value: s.value,
              color: shade(ACCENT, i, bg.sources.length),
              display: mnt(s.value),
            }))}
            center={num(bg.orderTotal)}
            centerLabel={tr('₮')}
            size={150}
            width={24}
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
  
      {/* ⚠️ Шошго нь урт монгол үг тул Donut БИШ Bars — зүсмэгийн шошго
          таарахгүй. Donut-ыг энэ хэсэгт `sources` карт аль хэдийн эзэлсэн. */}
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
  
      {/* ⚠️ Гарчгийн сарын завсрыг БЭХЛЭХГҮЙ (2026-08-31). Урьд нь «2025-10 →
          2026-09» гэж кодод бичигдсэн байсан ч хуваарь одоо БАГАНА БИШ, МӨР
          тул шинэ сар нэмэгдэхэд гарчиг чимээгүй хуучирна. Тэнхлэгийн эхний
          ба сүүлийн шошгоос уншина. */}
      <Panel title={
        bg.months.length
          ? tr('Санхүүжилтийн хуваарь · өссөн дүн ({0} → {1})',
              bg.months[0].label, bg.months[bg.months.length - 1].label)
          : tr('Санхүүжилтийн хуваарь · өссөн дүн')
      }>
        <Trend
          color={ACCENT}
          unit={tr(' ₮')}
          fmt={num}
          // ⚠️ `note`-ыг ХООСОН үлдээнэ: `axisTicks` нь `note ?? label`-ыг
          //    хэвлэж, зөвхөн /^\d{4}-/ хэлбэрийг тайрдаг тул огноо биш note
          //    нь тэнхлэгийн шошго болж эвдэрнэ.
          points={bg.months.reduce<{ label: string; value: number }[]>((acc, m) => {
            const prev = acc.length ? acc[acc.length - 1].value : 0;
            acc.push({ label: m.label, value: prev + m.amount });
            return acc;
          }, [])}
        />
        <p className={o.note}>
          {/* ⚠️ Хуучин тайлбар «сервис CF255-д тасардаг» гэдэг байв — тэр
              хязгаарлалт УСТСАН: шинэ бүдүүвчид сар нь багана биш МӨР тул
              шинэ сар нэмэхэд схем өөрчлөгдөхгүй. Муруй тэгш болох цорын ганц
              шалтгаан нь одоо ХУВААРЬ өөрөө тэр сар хүртэл л бөглөгдсөн явдал. */}
          {tr('Муруй сүүлийн сарын дараа тэгш болно — хуваарь тэндээс цааш хараахан бөглөгдөөгүй. Шинэ сар нэмэгдмэгц энэ график өөрөө уртсана.')}
        </p>
      </Panel>
  
      {/* НЭГ АЖИЛД НОГДОХ ДУНДАЖ ТӨСӨВ — дээрх «Ажлын төрлөөр» карт нь НИЙЛБЭР
          өгнө: «Инженерийн дэд бүтэц 324,300,000,000 ₮ · 22 ажил». Нийлбэр нь
          ажлын ТООНООС хамаардаг тул төрлүүдийн ЦАР ХҮРЭЭГ жишихэд тохирдоггүй
          — 22 жижиг ажил 7 том ажлаас их гарч болно. Дундаж нь ажил тус бүрийн
          хэмжээг харуулна. */}
      <Panel title={tr('Нэг ажилд ногдох дундаж төсөв')} note={tr('ажлын төрлөөр')}>
        {bg.byType.length === 0 ? <Empty label={tr('Ажлын төрөл бүртгэгдээгүй.')} /> : (
          <Bars
            items={heatBars(
              bg.byType.filter((x) => x.n > 0).map((x) => ({ ...x, avg: x.value / x.n }))
                .sort((a2, b2) => b2.avg - a2.avg),
              (x) => ({
                key: x.key,
                label: x.label,
                value: x.avg,
                display: tr('{0} · {1} ажил', tug(x.avg), num(x.n)),
              }),
            )}
          />
        )}
      </Panel>

      {/* ══ ХӨРӨНГӨ ОРУУЛАЛТЫН ГУРВАН НЭМЭЛТ ЗҮСЭЛТ ══
          Бүгд аль хэдийн татсан `budget`-ээс — шинэ хүсэлтгүй. */}

      {/* САР ТУТМЫН ХУВААРЬ — дээрх муруй нь ӨССӨН дүн: тэр нь «хаана хүрэх вэ»
          гэдгийг сайн харуулдаг ч «аль сард хэдэн төгрөг хэрэгтэй вэ» гэсэн
          мөнгөн урсгалын асуултыг НУУНА. Өссөн муруй дээр эгц өгсөх хэсэг нь
          энд өндөр багана болж, төлөвлөлтийн оргил шууд харагдана. */}
      <Panel title={tr('Сар тутмын санхүүжилтийн хуваарь')} note={tr('₮')}>
        {bg.months.length < 2 ? <Empty label={tr('Хуваарь бүртгэгдээгүй.')} /> : (
          <>
            <Series
              items={bg.months.map((m) => ({
                key: m.label,
                label: m.label.slice(2),
                value: m.amount,
                display: tug(m.amount),
              }))}
              height={120}
              unit={tr(' ₮')}
            />
            <p className={o.note}>
              {tr('Оргил сар')} <b>{
                bg.months.reduce((a2, m) => (m.amount > a2.amount ? m : a2), bg.months[0]).label
              }</b>{' · '}
              {tug(Math.max(...bg.months.map((m) => m.amount)))}
            </p>
          </>
        )}
      </Panel>

      <Panel title={tr('Багцаар — төсөвт өртөг')}>
        {bg.byPkg.length === 0 ? <Empty label={tr('Багцын задаргаа бүртгэгдээгүй.')} /> : (
          <Bars
            selected={flt?.sec === 'finance' ? flt.key : null}
            onSelect={(key) => {
              const ids = PKG_BY_BAGTS[key] ?? [];
              // ⚠️ `SECTION_LAYERS.finance = []` тул `layers` БАЙХГҮЙ бол
              //    зурагт юу ч болохгүй. Давхаргагүй багц дарагдахгүй (доор шүүсэн).
              if (ids.length) onFlt({ sec: 'finance', key, label: tr('Багц: {0}', key), layers: ids });
            }}
            items={heatBars(bg.byPkg, (t) => {
              /**
               * ⚠️ ЗАВСРЫН шошго («БАГЦ 1- 4», «БАГЦ 1-4», «БАГЦ 1-6 БАГЦ 8-17»)
               * нь «1-ээс 4 хүртэлх багц» гэсэн утгатай атлаа `bagtsKey`-ээр
               * «БАГЦ14» болж, зурагт БАЙГАА «Багц 14 · Дулаан хангамжийн
               * нэвтрэх суваг»-тай ХУДЛАА тааралдана (63.0 ба 2.2 тэрбум дүнтэй
               * хоёр мөр). Мөн ижил завсар хоёр бичиглэлээр орсон тул React-ын
               * `key` ч давхардаж, нэгийг дарахад хоёул тодордог байв.
               * Тиймээс завсрын мөрийг ШОШГООРОО түлхүүрлэж, зурагт холбохгүй.
               */
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
          дийлэнхийг эзэлж байвал эрсдэл тэдгээрт төвлөрсөн гэсэн үг.

          ⚠️ Завсрын мөрийг («БАГЦ 1-4» гэх мэт) ОРУУЛНА — тэдгээр нь зурагт
          холбогдохгүй ч ТӨСВИЙН дүн нь бодит бөгөөд нийлбэрээс хасвал хувь
          худал болно. */}
      <Panel title={tr('Төсвийн төвлөрөл — багцаар')} note={tr('нийт төсвөөс')}>
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
              size={140}
              width={22}
              leaders
              center={num(sorted.length)}
              centerLabel={tr('багц')}
              items={list.map((x, i) => ({
                key: x.key,
                label: x.label,
                value: x.v,
                color: shade(ACCENT, i, list.length),
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

/** Нийгмийн ангилал → давхаргын нэрийн дэд текст (амьд loadSocial-ийн нэршлээр) */
const SOC_MATCH: Record<string, string[]> = {
  'Сургууль': [tr('сургууль')],
  'Цэцэрлэг': [tr('цэцэрлэг')],
  'Хүүхдийн урлан бүтээх төв': [tr('урлан')],
  'Төрийн үйлчилгээ': [tr('төрийн үйлчилгээ')],
};

/**
 * БҮХ ТОО АМЬД. Илтгэлийн BENEFITS/PUBLIC_ZONE/SOCIAL хатуу мөрүүд хасагдаж,
 * үлдсэн нь үйлчилгээнээс бодогдоно (headline/social нь `d`-гээс).
 * ⚠️ EXPORT — «Иргэдэд хүрэх үр өгөөж» (`Irged.tsx`) дахин ашиглаж болохоор.
 */
export function BenefitDetail({ bagts, d, flt, onFlt }: { bagts: Async<BagtsRow[]>; d: DashData } & FltProps) {
  const ail = bagts.state === 'ready' ? sumBy(bagts.data, (x) => x.ail) : null;
  const h = d.headline.state === 'ready' ? d.headline.data : null;
  const soc = d.social.state === 'ready' ? d.social.data : null;
  const sel = flt?.sec === 'benefit' ? flt.key : null;
  /**
   * Нийгмийн барилга тус бүрийн СУУРИЙН ТАЛБАЙ (м²) — давхаргын геометрээс.
   *
   * ⚠️ Хүчин чадал (суудал, ор) нь `Huchin_chadal` талбараас ирдэг бөгөөд
   * ХОЁР ангилалд бөглөгдөөгүй. Суурийн талбай нь эсрэгээрээ 11 барилга дээр
   * БҮГД бий — тиймээс хоёулаа хэрэгтэй, аль нэг нь нөгөөгөө орлохгүй.
   */
  const socPacks = SOC_PACK_IDS.map((id) => {
    const def = LAYER_BY_ID[id];
    const q = d.socTotals.state === 'ready' ? d.socTotals.data.get(id) : null;
    return {
      id,
      key: bagtsKey(def?.note),
      label: def?.title ?? id,
      n: q?.n ?? 0,
      m2: q?.q ?? 0,
    };
  }).filter((x) => x.n > 0);
  const socM2 = socPacks.reduce((a2, x) => a2 + x.m2, 0);

  /** Ангилал дарахад — зурагт тэр төрлийн барилгын давхаргууд л үлдэнэ */
  const pick = (key: string) => {
    const subs = SOC_MATCH[key];
    const ids = subs ? layersByTitle(subs).filter((id) => id.startsWith('pkg:')) : [];
    if (ids.length) onFlt({ sec: 'benefit', key, label: tr('Нийгэм: {0}', key), layers: ids });
  };

  return (
    <>
      <Panel title={tr('Иргэдийн амьдралын чанар')}>
        <Stats cols={2}>
          <Stat accent color={HUE[0]} value={h == null ? '…' : num(h.population)} unit={tr('хүн')} label={tr('Шинэ орон сууцанд амьдрах хүн ам')} />
          <Stat accent color={HUE[1]} value={ail == null ? '…' : num(ail)} unit={tr('өрх')} label={tr('Айл өрх шинэ орон сууцтай')} />
          <Stat accent color={HUE[2]} value={soc == null ? '…' : num(soc.totalN)} unit={tr('ш')} label={tr('Нийгмийн үйлчилгээний барилга')} />
          <Stat accent color={HUE[3]} value={h?.greenHa == null ? '—' : num(h.greenHa, 1)} unit={tr('га')} label={tr('Ногоон байгууламж')} />
          {/* ХОЁР «үр өгөөж»-ийн харьцаа — шинэ хүсэлт ШААРДАХГҮЙ, `soc`/`headline`
              аль хэдийн татагдсан. «Хэдэн барилга» гэдгээс «хэдэн хүүхэд суух вэ»
              нь иргэдэд утга учиртай тоо. */}
          <Stat accent color={HUE[4]}
                value={soc == null ? '…' : num(sumBy(soc.rows, (r) => r.capacity ?? 0))}
                unit={tr('хүчин чадал')} label={tr('Нийгмийн байгууламжийн багтаамж')} />
          <Stat accent color={HUE[5]}
                value={h && ail ? num(h.investTotal / ail) : '…'}
                unit={tr('₮')} label={tr('1 өрхөд ногдох төсөв')} />
          {/* ⚠️ СУУРИЙН ТАЛБАЙ — «хэдэн барилга» гэсэн тоо нь БАРИЛГЫН ХЭМЖЭЭГ
              хэлдэггүй: 960 хүүхдийн сургууль ба 240 ортой цэцэрлэг хоёулаа
              «1 ш». Талбай нь тэр ялгааг гаргана. */}
          <Stat accent color={cat(6)}
                value={socM2 > 0 ? num(socM2) : '…'}
                unit={tr('м²')} label={tr('Барилгын суурийн талбай')} />
          <Stat accent color={cat(7)}
                value={h?.population && soc ? num((sumBy(soc.rows, (r) => r.capacity ?? 0) / h.population) * 1000) : '…'}
                unit={tr('/ 1,000 хүн')} label={tr('Хүчин чадлын хангамж')} />
        </Stats>
      </Panel>

      {/* Хоёр талбар хоёул `d.headline`-д БИЙ — эзлэх ХУВЬ (1-р картын үнэмлэхүй
          га БИШ) нь «хангалттай юу» гэдэгт хариулна. */}
      <Panel title={tr('Ногоон байгууламжийн хүрэлцээ')}>
          <Stats cols={2}>
            <Stat accent color={HUE[1]} value={h == null ? '…' : num(h.areaHa, 1)} unit={tr('га')} label={tr('Төслийн талбай')} />
            <Stat accent color={HUE[2]}
                  value={h?.greenHa == null || !h.population ? '—' : num((h.greenHa * 10_000) / h.population, 1)}
                  unit={tr('м²/хүн')} label={tr('Нэг хүнд ногоон байгууламж')} />
          </Stats>
        <p className={o.note}>
          {/* ⚠️ 9 м²/хүн гэх «стандарт»-тай ЗОРИУДААР харьцуулаагүй — тэр тоо нь
              амьд эх сурвалжгүй, «Тоо бүр ArcGIS-ээс ирнэ» дүрмийг зөрчинө. */}
          {tr('Ногоон талбай нь test_data [35]')} <code>Shape__Area</code> {tr('÷ 10,000; төслийн талбай нь хилийн')} <code>Hec_area</code>.
        </p>
      </Panel>

      {/* ⚠️ Бөгж тоонуудын зурвасаас САЛСАН — хажуугийн баганын карт. */}
      <Panel title={tr('Ногоон байгууламжид эзлэх хувь')}>
        <RingCard
          value={h == null || h.greenHa == null || !h.areaHa ? null : (h.greenHa / h.areaHa) * 100}
          label={tr('төслийн талбайд эзлэх')}
          decimals={1}
        />
      </Panel>

      <Panel title={tr('Нийгмийн дэд бүтэц · шинээр')}>
        {soc == null ? <Empty label={tr('Татаж байна…')} /> : (
          <Bars
            inline
            selected={sel}
            onSelect={pick}
            items={soc.rows.map((r, i) => ({
              key: r.label,
              label: r.label,
              value: r.n,
              display: r.capacity != null
                ? tr('{0} ш · {1} хүчин чадал', num(r.n), num(r.capacity))
                : tr('{0} ш', num(r.n)),
              color: HUE[i % HUE.length],
            }))}
          />
        )}
      </Panel>

      {/* `capacity` нь өнөөдөр дээрх картын `display`-д ТЕКСТ л байдаг. 3 сургууль
          ба 3,780 суудал бол ӨӨР хоёр түүх — тусад нь зурна. */}
      <Panel title={tr('Хүчин чадал — суудал, орны тоо')}>
        {soc == null ? <Empty label={tr('Татаж байна…')} /> : (() => {
          const withCap = soc.rows.filter((r) => r.capacity != null && r.capacity > 0);
          if (!withCap.length) return <Empty label={tr('Хүчин чадлын талбар бөглөгдөөгүй.')} />;
          return (
            <>
              <Bars
                inline
                selected={sel}
                onSelect={pick}                        // ⚠️ 3-р картын `pick`-тэй ИЖИЛ (SOC_MATCH)
                items={heatBars(withCap, (r) => ({
                  key: r.label,                        // ⚠️ `r.label` — `pick` нь SOC_MATCH-аар жишдэг
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

      {/* ⚠️ «Нийгмийн багцын гүйцэтгэл» карт ХАСАГДСАН (2026-08-27) — 05, 06-ын
          ижил картуудын ЯГ ижил шалтгаанаар. Эх нь `TASK_SHEET` («Гүйцэтгэл
          бөглөх») байсан ч тэр хуудсууд ЗӨВХӨН орон сууцны багцын блокуудыг
          бүртгэдэг: нийгмийн 19–21 багцын нэг нь ч тэнд байхгүй тул карт
          ҮРГЭЛЖ «Нийгмийн багцын бүртгэл алга» гэж зурагдаж байв.

          Оронд нь ХЭМЖЭЭ: барилгын суурийн талбай нь 11 барилга дээр БҮГД
          бөглөгдсөн (1560 хүүхдийн сургууль 4,411 м² … төрийн үйлчилгээ
          126 м²). Нийгмийн багцын гүйцэтгэлийг бүртгэдэг эх сурвалж гарвал
          явцын картыг энд буцааж нэмнэ. */}
      <Panel title={tr('Барилгын суурийн талбай — багцаар')} note={tr('м²')}>
        <Data q={d.socTotals} loading={tr('Татаж байна…')}>
          {() => {
            const rows2 = [...socPacks].sort((a2, b2) => b2.m2 - a2.m2);
            if (!rows2.length) return <Empty label={tr('Барилгын давхарга алга.')} />;
            return (
              <Bars
                inline
                selected={flt?.sec === 'benefit' ? flt.key : null}
                /* ⚠️ Түлхүүр нь ДАВХАРГЫН id — `bagtsKey` БИШ. «Багц 21» хоёр
                   давхаргатай тул багцын түлхүүр давхардаж, React «two children
                   with the same key» гэж анхааруулдаг байв. */
                onSelect={(key) => onFlt({
                  sec: 'benefit',
                  key,
                  label: LAYER_BY_ID[key]?.title ?? key,
                  layers: [key],
                })}
                items={heatBars(rows2, (x) => ({
                  key: x.id,
                  label: x.label,
                  value: x.m2,
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
          хэт өндөр нь үнэтэй.

          ⚠️ Зөвхөн хүчин чадал БҮРТГЭГДСЭН барилга — `Huchin_chadal`
          бөглөгдөөгүй хоёр ангилал (урлан бүтээх төв, төрийн үйлчилгээ) энд
          орохгүй, тэдгээрт «суудал» гэсэн ойлголт ч байхгүй. */}
      <Panel title={tr('Нэг суудалд ногдох суурийн талбай')} note={tr('м² / суудал')}>
        <Data q={d.socTotals} loading={tr('Татаж байна…')}>
          {() => {
            if (soc == null) return <Empty label={tr('Татаж байна…')} />;
            /** Давхаргын гарчиг → хүчин чадал (`SocialRow.per`-ээс) */
            const capOf = new Map<string, number>();
            soc.rows.forEach((r) => r.per.forEach((x) => {
              if (x.capacity != null && x.capacity > 0) capOf.set(x.title, x.capacity);
            }));
            const rows2 = socPacks
              .map((x) => ({ ...x, cap: capOf.get(x.label) ?? 0 }))
              .filter((x) => x.cap > 0 && x.m2 > 0)
              .map((x) => ({ ...x, per: x.m2 / x.cap }))
              .sort((a2, b2) => b2.per - a2.per);
            if (!rows2.length) return <Empty label={tr('Хүчин чадал бүртгэгдээгүй.')} />;
            return (
              <Bars
                inline
                items={heatBars(rows2, (x) => ({
                  /* ⚠️ Мөн ДАВХАРГЫН id — дээрхтэй ижил шалтгаанаар */
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
          өртөг нь барилгуудыг хооронд нь жиших цорын ганц мөнгөн хэмжүүр.

          ⚠️ `budget.byPkg` нь `CF007` (дэд багц, ЛИСТ) задаргаа — 08-ын картуудтай
          ЯГ НЭГ эх сурвалж тул хоёр газрын тоо зөрөхгүй. */}
      <Panel title={tr('Нийгмийн багцын төсөв')} note={tr('нэг суудлын өртөг')}>
        <Data q={d.budget} loading={tr('Татаж байна…')}>
          {(bg2) => {
            /** Давхаргын гарчиг → хүчин чадал */
            const capOf = new Map<string, number>();
            soc?.rows.forEach((r) => r.per.forEach((x) => {
              if (x.capacity != null && x.capacity > 0) capOf.set(x.title, x.capacity);
            }));
            /** Багцын түлхүүр → нийгмийн давхаргууд */
            const byKey = new Map<string, typeof socPacks>();
            socPacks.forEach((p) => {
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
          if (soc == null || h?.population == null || !h.population) {
            return <Empty label={tr('Татаж байна…')} />;
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
              selected={sel}
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
          ойр байгууламжууд төсвийн ямар хэсгийг эзэлж байна вэ.

          ⚠️ Суурь нь `budget.total` (CF018, төсөвт өртөг; ГЭРЭЭ мөрүүдийн нийлбэр) —
          08-ын «Санхүүжилтийн шат» картын суурьтай ЯГ ИЖИЛ. */}
      <Panel title={tr('Төсөвт эзлэх нийгмийн дэд бүтэц')} note={tr('нийт төсөвт өртөгөөс')}>
        <Data q={d.budget} loading={tr('Татаж байна…')}>
          {(bg2) => {
            const socKeys = new Set(socPacks.map((p) => p.key));
            const socSum = sumBy(
              bg2.byPkg.filter((b) => socKeys.has(bagtsKey(b.label))),
              (b) => b.value,
            );
            if (!bg2.total || !socSum) return <Empty label={tr('Нийгмийн багцын төсөв бүртгэгдээгүй.')} />;
            const list = [
              { key: 'soc', label: tr('Нийгмийн дэд бүтэц'), v: socSum },
              { key: 'rest', label: tr('Төслийн бусад ажил'), v: Math.max(0, bg2.total - socSum) },
            ].filter((x) => x.v > 0);
            return (
              <Donut
                size={140}
                width={22}
                leaders
                center={pct((socSum / bg2.total) * 100, 1)}
                centerLabel={tr('нийгэм')}
                items={list.map((x, i) => ({
                  key: x.key,
                  label: x.label,
                  value: x.v,
                  color: shade(ACCENT, i, list.length),
                  display: tr('{0} · {1}', tug(x.v), pct((x.v / bg2.total) * 100, 1)),
                }))}
              />
            );
          }}
        </Data>
      </Panel>

      {/* Барилга ТУС БҮРЭЭР — `loadSocial` давхарга тутамд count+sum аль хэдийн
          асуудаг байсныг (`SocialRow.per`) дүнг нь хаяхаа больж ил гаргав. */}
      <Panel title={tr('Барилга тус бүрээр — тоо, хүчин чадал')}>
        {soc == null ? <Empty label={tr('Татаж байна…')} /> : (
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
