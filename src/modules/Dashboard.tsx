'use client';

import {
  Children, Fragment, isValidElement, useCallback, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import {
  Donut, Ring, Bars, Data, Stats, Stat, Empty, Rows, List, ListItem,
  Stack, Series, Trend,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { LayerCatalog } from '@/components/LayerCatalog';
import { MapTools } from '@/components/MapTools';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useAsync, type Async } from '@/lib/useAsync';
import { usePlanTotals } from '@/lib/totals';
import { queryFeatures, type Row } from '@/lib/query';
import {
  ZONE_LAYER, ZONE_FIELD, ZONE_NONE, BUILT_LAYER, BUILDING,
  LAYER_BY_ID, PARCEL_LEFT, PARCEL_STATUS_HUES, SOURCE_FS, PROJECT_PROGRESS, TASK_SHEET,
  PLAN_LAYER_IDS, MONITOR_LAYER_IDS, INITIAL_MAP_LAYERS,
  PKG_BY_FAMILY, PKG_BY_BAGTS, LAYERS, bagtsKey, buildingKey, type PkgFamily,
} from '@/lib/services';
import {
  INDICATORS, SCORE_LEVELS, levelOf, PARKING, DEFAULT_ECON_SHARE,
  BUILD_COST_PER_M2, profitScore,
} from '@/lib/analysis/config';
import { loadAnalysisCached, computeEconomics, computeRaw, defaultGreenCats } from '@/lib/analysis/data';
import { loadCostsCached } from '@/lib/analysis/costs';
import { urbanScore } from '@/lib/analysis/score';
import {
  loadBlockProgress, loadBlockHistory, progressSeries,
  type BlockProgressMap, type BlockHistory,
} from '@/lib/blockProgress';
import { sumBy, maxOf, tally } from '@/lib/agg';
import { loadLandStatus, type LandStatus } from '@/lib/land';
import { cat, mntShort, num, pct, text, shade, shades, tint, CAT_LIGHT, NO_DATA } from '@/lib/format';
import { SCHEDULE, BAGTS_ORIGIN } from '@/lib/brief';
import {
  loadHeadline, loadSocial, loadProjectProgress, loadBudget, liveStage,
  weighted, rollupBy,
  type Headline, type SocialLive, type ProjectProgress, type Budget, type ProgRow,
} from '@/lib/live';
import o from './overview.module.css';

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

export type BagtsRow = {
  key: string;
  label: string;
  blocks: number;
  ail: number;
  contractor: string;
  /** Гадаад / Үндэсний — илтгэлээс бэхлэгдсэн */
  origin: string;
  /**
   * Барилга угсралтын гүйцэтгэл (%) — «Гүйцэтгэл бөглөх» хуудасны «Б.» мөрөөр.
   * ⚠️ Хуваарь нь БҮХ блок (тайлангүйг 0%). Зөвхөн тайлагнасан блокоор
   * дундажлавал шинэ багц бүртгэгдэх бүрд дүн нь БУУНА.
   * ⚠️ МЭДЭГДЭЖ БУЙ ЗӨРҮҮ: «Барилгын хяналт» (BuildingPanel) ба «Багцын
   * мэдээлэл» (Bagts) нь тайлангүй блокоо ХАСЧ дундажладаг тул нэг багц тэнд
   * арай ӨӨР (өндөр) % харагдана. Нэгтгэхдээ энэ «бүх блокоор хуваах» дүрмийг
   * ГАНЦ helper болгож гурван модульд хамт хэрэглэх — `missing` тэмдэглэл
   * хэвээр үлдэнэ.
   */
  progress: number | null;
  /** Тайлан ирээгүй блокийн тоо */
  missing: number;
  /**
   * Цувааны хамрах хүрээ — багцын блок бүрийн түлхүүр (`${БАГЦ}|блок`), мөр тутамд нэг.
   * ⚠️ `joinBagts` аль хэдийн бодож байсныг ХАЯДАГ байв. Цуваа (04·C5) ба дэд
   * үе шатын карт (04·C3) хоёулаа `BlockProgressMap`-д ЯГ ижил түлхүүрээр
   * хандах ёстой — гараар дахин зохиовол нэг тэмдэгт зөрөхөд карт хоосорно.
   */
  keys: string[];
};

/**
 * ОРОН СУУЦНЫ 7 БАГЦ — хоёр өгөгдлийн сангийн нийлбэр.
 *
 *   `building_GOL`  → блок, өрх, гүйцэтгэгч (BAGTS · BLOK · AIL_TOO · BAR_COMP)
 *   `Selbe_guitsetgel_consolidated` → «Б.» мөрийн бодит гүйцэтгэл
 *
 * (BUS_cashflow-ийн төсөв/эх үүсвэр 2026-08-13-нд хасагдсан — санхүү нь
 * CASHFLOW2 + IPC-ээс, «Санхүүжилт» ба «Цогц хяналт»-ын графикт амьдаар гарна.)
 *
 * ⚠️ Багцын нэр эх сурвалжуудад өөр бичиглэлтэй («Багц 4.1» / «Багц 4-1»)
 * тул ЗӨВХӨН `bagtsKey()`-ээр жишинэ.
 *
 * ⚠️ Гүйцэтгэлийг давхаргын `GUITS_HV`-ээс АВАХГҮЙ: тэр талбар хуучирсан бөгөөд
 * илтгэлийн дүнгээс 5–14 нэгжээр зөрдөг («Багц 3.2» тэнд 9.25%, бодитоор
 * 24.50%). `loadBlockProgress()` нь «Барилгын хяналт»-ын ашигладаг ЯГ ижил
 * тооцоо — хоёр харагдац ижил тоо харуулна.
 */
export function useBagtsTable(): Async<BagtsRow[]> {
  return useAsync(async () => {
    const [blocks, prog] = await Promise.all([
      queryFeatures(BUILDING.url, {
        outFields: [BUILDING.oid, BF.bagts, BF.block, BF.households, BF.contractor],
      }),
      loadBlockProgress(),
    ]);
    return joinBagts(blocks, prog);
  }, []);
}

function joinBagts(blocks: Row[], prog: BlockProgressMap): BagtsRow[] {
  const by = new Map<string, BagtsRow & { sum: number }>();
  const slot = (name: string) => {
    const k = bagtsKey(name);
    const cur = by.get(k) ?? {
      key: k, label: name, blocks: 0, ail: 0, contractor: '—',
      origin: BAGTS_ORIGIN[name.trim()] ?? '—', progress: null, missing: 0, sum: 0,
      keys: [],
    };
    by.set(k, cur);
    return cur;
  };

  for (const b of blocks) {
    const name = text(b[BF.bagts], tr('Тодорхойгүй'));
    const s = slot(name);
    s.blocks += 1;
    s.ail += Number(b[BF.households] ?? 0);
    // Гүйцэтгэгч — блокийн давхаргын BAR_COMP (багцын бүх блок нэг гүйцэтгэгчтэй)
    const comp = text(b[BF.contractor], '').trim();
    if (comp) s.contractor = comp;
    // Блокийн түлхүүрийг НЭГ УДАА бодож хадгална — цуваа ба дэд үе шатын карт
    // ижил түлхүүрийн жагсаалтаар ажиллана (`BagtsRow.keys`).
    const bk = buildingKey(b[BF.bagts], b[BF.block]);
    s.keys.push(bk);
    const cell = prog.get(bk);
    if (cell) s.sum += cell.overall;
    else s.missing += 1;
  }

  return [...by.values()]
    .map(({ sum, ...s }) => ({ ...s, progress: s.blocks ? sum / s.blocks : null }))
    .sort((a, b) => a.label.localeCompare(b.label, 'mn'));
}

/* ── Төслийн жигнэсэн гүйцэтгэл — тооцоо @/lib/live-д (Тайлан/Нүүр мөн уншина) ── */

function useProjectProgress(): Async<ProjectProgress> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useAsync(loadProjectProgress, []);
}

function useLeftParcels(): Async<Row[]> {
  return useAsync(() => queryFeatures(PARCEL_LEFT.url, { outFields: [PL.progress, PL.block] }), []);
}

/** Эх үүсвэрийн байгууламжууд — нэгтгэсэн үйлчилгээнээс (7 объект) */
function useSources(): Async<Row[]> {
  return useAsync(() => queryFeatures(SOURCE_FS.url, {
    outFields: [
      SOURCE_FS.fields.type, SOURCE_FS.fields.name, SOURCE_FS.fields.share,
      SOURCE_FS.fields.total, SOURCE_FS.fields.note,
      ...SOURCE_FS.consumers.map((c) => c.field),
    ],
  }), []);
}

/* ── Тохиромжтой байдлын үнэлгээ (бүсийн орон зайн анализ) ── */

export type SuitSummary = {
  avgScore: number | null;
  levels: { label: string; color: string; n: number }[];
  noData: number;
  zones: number;
  profit: number;
  profitZones: number;
  ranked: { id: string; type: string; score: number | null }[];
  byId: Record<string, { score: number | null; type: string }>;
};

/** Хот төлөвлөлтийн оноо ба ашгийн оноог жинлэн нийлүүлэх */
const blendOf = (u: number | null, e: number | null): number | null =>
  u == null && e == null ? null
    : u == null ? e
      : e == null ? u
        : u * (1 - DEFAULT_ECON_SHARE / 100) + e * (DEFAULT_ECON_SHARE / 100);

/**
 * ⚠️ ХҮНД тооцоо: бүх бүсийн геометр, ногоон байгууламж, зогсоол, дэд бүтцийн
 * өртгийг татаж, бүс бүрээр орон зайн огтлолцол бодно. Тиймээс 08-р хэсэг
 * НЭЭГДЭХ хүртэл огт ажиллуулахгүй (`enabled`) — эс бөгөөс дашбоард нээх бүрд
 * хэрэглэгчийн хүсээгүй хэдэн арван хүсэлт явна.
 */
export function useSuitability(enabled: boolean, onProgress?: (m: string, p: number) => void): Async<SuitSummary> {
  return useAsync(async () => {
    if (!enabled) return new Promise<SuitSummary>(() => {});
    const [data, costs] = await Promise.all([loadAnalysisCached(onProgress), loadCostsCached()]);
    computeEconomics(data.zones, costs.perHa, null, BUILD_COST_PER_M2);
    computeRaw(data.zones, defaultGreenCats(), PARKING);
    const blends = data.zones.map((z) => blendOf(urbanScore(z.raw, INDICATORS, z.type).score, profitScore(z.econ?.margin)));
    const valid = blends.filter((x): x is number => x != null);
    const revenue = data.zones.reduce((a, z) => a + (z.econ?.revenue ?? 0), 0);
    const cost = data.zones.reduce((a, z) => a + (z.econ?.cost ?? 0), 0);
    return {
      avgScore: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
      levels: SCORE_LEVELS.map((L, i) => ({
        label: L.label, color: L.color,
        n: data.zones.filter((_, j) => levelOf(blends[j]) === i).length,
      })),
      noData: blends.filter((b) => levelOf(b) < 0).length,
      zones: data.zones.length,
      profit: revenue - cost,
      profitZones: data.zones.filter((z) => (z.econ?.profit ?? 0) > 0).length,
      ranked: data.zones.map((z, i) => ({ id: z.id, type: z.type, score: blends[i] })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
      byId: Object.fromEntries(data.zones.map((z, i) => [z.id, { score: blends[i], type: z.type }])),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

/** Бүх хэсэгт хэрэгтэй өгөгдлийн багц */
type DashData = {
  bagts: Async<BagtsRow[]>;
  project: Async<ProjectProgress>;
  parcels: Async<Row[]>;
  /** Газар чөлөөлөлтийн нэгдсэн АМЬД тооцоо — «Газар чөлөөлөлт» харагдацтай НЭГ томьёо */
  land: Async<LandStatus>;
  /** Толгойн амьд үзүүлэлт — талбай, хүн ам, нийт ХО, ногоон */
  headline: Async<Headline>;
  /** Төслийн төсөв — Cashflow /106 (олон нийтийн бүсгүй) */
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
  const d: DashData = {
    bagts: useBagtsTable(),
    project: useProjectProgress(),
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
  };
  const { setHighlight } = useMap();

  /** Чарт-шүүлт (бүх хэсэгт нэгдсэн) — аттрибутын тодруулгыг зурагт тусгана */
  const [flt, setFlt] = useState<MapFilter | null>(null);
  useEffect(() => { setHighlight(flt?.where ?? null, flt?.only); }, [flt, setHighlight]);

  /**
   * Нээлттэй хэсгүүд — ОЛОН сонголт. Дараалал нь ДАРСАН дараалал биш,
   * `SECTIONS`-ийн дараалал: баганууд 01→07 тогтмол эрэмбэтэй байх нь
   * хэрэглэгчид уншихад тогтвортой.
   */
  const [open, setOpen] = useState<SecKey[]>([]);

  /**
   * «Давхарга» каталог нээлттэй эсэх — «Ерөнхий төлөвлөгөө» дээрх товчтой ИЖИЛ
   * зарчим. Хаалттай эхэлнэ; товч дарахад л нээгдэнэ.
   *
   * ⚠️ Тоо, өртгийн 30 хүсэлт нь каталог НЭЭГДЭХЭД л явна (`usePlanTotals`-ын
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
    <div
      className={o.shell}
      data-detail={open.length > 0 ? '1' : '0'}
      /* ⚠️ ХООСОН хажуугийн багана 0 өргөнтэй болно — эс бөгөөс 1-2 карттай
         хэсэгт 510px багана хоосон зогсож, зураг дэмий шахагдана. */
      data-zl={zones.left.length ? '1' : '0'}
      data-zr={zones.right.length ? '1' : '0'}
    >
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

          {/* Тайлбар — зурагт БОДИТ харагдаж буй давхаргууд */}
          <div className={o.legend}>
            {visible.slice(0, 8).map((id) => {
              const L = LAYER_BY_ID[id];
              return L ? (
                <span key={id} className={o.legendItem} title={L.title}>
                  <i style={{ background: L.hue }} />{L.title}
                </span>
              ) : null;
            })}
            {visible.length > 8 && <span className={o.legendMore}>+{visible.length - 8}</span>}
          </div>

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

      {/**
        * Сонгосон хэсгийн ЧАРТУУД — газрын зургийг ТОЙРОН, тус бүр өөрийн
        * картаар (хэрэглэгчийн хүсэлт).
        *
        * ⚠️ Хуваарилалт нь CSS-д: `.ringCards > *:nth-child(odd)` → ЗҮҮН багана,
        * `even` → БАРУУН. `Detail` нь fragment буцаадаг тул доторх `Panel`-ууд
        * шууд сүлжээний ХҮҮХЭД болж, тоо нь хэдэн ч байсан өөрөө хуваагдана.
        */}
      {open.length > 0 && (() => {
        /**
         * ⚠️ ХЭСГИЙН ТУСДАА ТОЛГОЙН МӨР («01 · Төслийн цар хүрээ ×») ХАСАГДАВ:
         * бүтэн мөр эзэлж байсан ч шинэ мэдээлэл өгдөггүй — дээрх зурваст
         * идэвхтэй хэсэг аль хэдийн тодорч, нэр нь бичээстэй байдаг.
         * ⚠️ ХААХ боломж алдагдаагүй — идэвхтэй нүдийг ДАХИН дарахад хаагдана.
         */
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
    case 'schedule': return ScheduleDetail({ project: d.project });
    case 'bagts': return BagtsDetail({ q: d.bagts, prog: d.prog, hist: d.hist, flt, onFlt });
    case 'land': return LandDetail({ parcels: d.parcels, land: d.land, project: d.project, flt, onFlt });
    case 'network': return NetworkDetail({ project: d.project, bagts: d.bagts, sources: d.sources, flt, onFlt });
    case 'power': return PowerDetail({ project: d.project, sources: d.sources, prog: d.prog, flt, onFlt });
    case 'source': return SourceDetail({ sources: d.sources, d, flt, onFlt });
    case 'finance': return FinanceDetail({ budget: d.budget, flt, onFlt });
    case 'benefit': return BenefitDetail({ bagts: d.bagts, d, flt, onFlt });
  }
}

/* ══════════════════ Зүүн жагсаалт ══════════════════ */

/** ГАДНА ШУГАМ СҮЛЖЭЭНИЙ багцууд — дулаан/ус/татуурга (Багц 5.x, 7, 10–15) */
const isNetworkPack = (bagts: string) => /^БАГЦ(5[1-4]|7|1[0-5])$/.test(bagtsKey(bagts));
/** ЦАХИЛГААНЫ багцууд — БАГЦ-6.1…6.8 */
const isPowerPack = (bagts: string) => /^БАГЦ6[1-8]$/.test(bagtsKey(bagts));

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
  const p = d.project.state === 'ready' ? d.project.data : null;
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
      // ⚠️ АМЬД — Төсөл_Гүйцэтгэл хүснэгтийн жигнэсэн дундаж (илтгэлийн
      //    бэхлэгдсэн 36.35% ◆-г хассан, 2026-08-13 хэрэглэгчийн шийдвэр).
      return {
        value: p == null ? '…' : pct(p.actual, 2),
        note: p == null ? '…' : tr('{0} үе шат · жин {1}', SCHEDULE.length, pct(p.coverage, 1)),
        pct: p?.actual ?? undefined, tone: o.active,
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
      const nw = weighted(p ? p.rows.filter((r) => isNetworkPack(r.bagts)) : []);
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
      const pw = weighted(p ? p.rows.filter((r) => /Гадна цахилгаан/u.test(r.work)) : []);
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
      // АМЬД — Cashflow /106: гэрээгээр баталгаажсан ÷ нийт төсөвт өртөг
      const bg = d.budget.state === 'ready' ? d.budget.data : null;
      const share = bg && bg.total ? (bg.contract / bg.total) * 100 : null;
      return {
        value: share == null ? '…' : pct(share, 1),
        note: bg == null ? '…' : tr('гэрээ {0} / төсөв {1} тэрбум ₮', num(bg.contract / 1e9, 1), num(bg.total / 1e9, 1)),
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
  const p = d.project.state === 'ready' ? d.project.data : null;
  const l = d.land.state === 'ready' ? d.land.data : null;
  const blocks = b ? sumBy(b, (x) => x.blocks) : null;
  const clearedPct = l && l.total > 0 ? ((l.cleared + l.cleaned) / l.total) * 100 : null;
  const cells = [
    { icon: 'frame', label: tr('Төслийн нийт талбай'), v: h ? tr('{0} га', num(h.areaHa, 1)) : '…' },
    { icon: 'users', label: tr('Хамрагдах хүн ам'), v: h ? num(h.population) : '…' },
    { icon: 'building', label: tr('Барилгын блок'), v: blocks != null ? num(blocks) : '…' },
    { icon: 'chart', label: tr('Төслийн гүйцэтгэл'), v: p ? pct(p.actual, 1) : '…' },
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

      <Panel title={tr('Эх үүсвэр')} note={tr('хүчин чадлын эзлэх хувь')}>
        <Data q={d.sources} loading={tr('Татаж байна…')}>
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
                  display: mntShort(x.value),
                }))}
            />
          )}
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
  const pq = useAsync(loadProjectProgress, []);
  const h = hq.state === 'ready' ? hq.data : null;
  const p = pq.state === 'ready' ? pq.data : null;

  /**
   * ⚠️ УТГА ба НЭГЖ нь ТУСДАА талбар — тоо том, нэгж жижиг.
   * 2026-08-13: бэхлэгдсэн ◆ (158 га · 44,518 · 36.35% · 2.339 их наяд)
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
      v: p == null ? '…' : num(p.actual, 2), unit: '%',
      label: tr('Төслийн нийт гүйцэтгэл'),
      sub: p == null ? undefined : tr('бүртгэгдсэн жин {0}%', num(p.coverage, 1)),
      lead: true,
      bar: p?.actual,
    },
    {
      v: h == null ? '…' : num(h.investTotal / 1e12, 2), unit: tr('их наяд ₮'),
      label: tr('Төслийн нийт төсөв'),
      sub: h == null ? undefined : tr('гэрээ байгуулсан {0} тэрбум', num(h.investConfirmed / 1e9, 1)),
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
  // Нийт гүйцэтгэл — `HeadKpi`-аас нэгдсэн үзүүлэлт (жигнэсэн дундаж)
  const prog = d.project.state === 'ready' ? d.project.data : null;
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
          <Stat accent color={HUE[2]} value={h == null ? '…' : num(h.investTotal / 1e12, 2)} unit={tr('их наяд ₮')} label={tr('Нийт төсөв')} />
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
              value: h && ail ? tr('{0} сая ₮', num(h.investTotal / ail / 1e6, 1)) : '…',
            },
            {
              key: tr('1 га-д ногдох төсөв'),
              value: h?.areaHa ? tr('{0} тэрбум ₮', num(h.investTotal / h.areaHa / 1e9, 2)) : '…',
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
            <Donut
              size={150}
              width={24}
              stack
              center={num(sumBy(items, (i) => i.value))}
              centerLabel={tr('багц')}
              items={items.map((x, i) => ({
                ...x,
                color: shade(ACCENT, i, items.length),
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
    </>
  );
}

/* ══════════════════ 02 · Master Schedule ══════════════════ */

/**
 * ГҮЙЦЭТГЭЛ БҮГД АМЬД — `Төсөл_Гүйцэтгэл`-ийн жигнэсэн дүн (`liveStage`).
 * Амьд хүснэгтэд БАЙХГҮЙ үе шат (04 Инженерийн дэд бүтэц, 06 Олон нийтийн бүс)
 * «—» гэж гарна — бэхлэгдсэн тоо ХЭВЛЭХГҮЙ (2026-08-13 хэрэглэгчийн шийдвэр).
 * Хугацааны зурвас (`from`–`to`) нь төлөвлөгөөний мета — тоон үзүүлэлт биш.
 */
function ScheduleDetail({ project }: { project: Async<ProjectProgress> }) {
  const p = project.state === 'ready' ? project.data : null;

  /** Үе шатны дараалал — МЕТАДАТА (хугацааны); жин нь ХҮСНЭГТЭЭС амьдаар */
  const stageKeys = (only?: (k: string) => boolean) => {
    if (p == null) return [];
    const ORD = PROJECT_PROGRESS.stages.map((x) => String(x.value));
    const keep = (k: string) => (only ? only(k) : true);
    return [
      ...ORD.filter((k) => p.byStage[k] && keep(k)),
      ...Object.keys(p.byStage).filter((k) => !ORD.includes(k) && keep(k)),
    ];
  };
  const stageLabel = (k: string) =>
    PROJECT_PROGRESS.stages.find((x) => x.value === k)?.label ?? k;

  return (
    <>
      {/* Бүртгэгдсэн жингийн хамрах хүрээ — урьд нь `p.coverage` дашбоард дээр
          ХААНА Ч хэвлэгддэггүй байсан тул бүртгэгдээгүй ~18.5% нь үл үзэгдэх байв. */}
      <Panel title={tr('Жигнэсэн гүйцэтгэл ба хамрах хүрээ')} note={tr('Σ(жин×гүйц) ÷ Σжин')}>
          <Stats cols={2}>
            <Stat accent color={HUE[0]} value={p == null ? '…' : num(p.coverage, 2)} unit="%" label={tr('Бүртгэгдсэн жин')} />
            <Stat color={NO_DATA} value={p == null ? '…' : num(Math.max(0, 100 - p.coverage), 2)} unit="%" label={tr('Хүснэгтэд ороогүй жин')} />
            <Stat value={p == null ? '…' : num(p.rows.length)} unit={tr('ажил')} label={tr('Бүртгэсэн ажлын мөр')} />
            <Stat
              value={p?.byStage['Барилга угсралт'] == null ? '…' : num(p.byStage['Барилга угсралт'].weight, 1)}
              unit="%"
              label={tr('Барилга угсралтын жин')}
            />
          </Stats>
      </Panel>

      {/* ⚠️ Бөгж тоонуудын зурвасаас САЛСАН — хажуугийн баганын карт. */}
      <Panel title={tr('Жигнэсэн гүйцэтгэл')}>
        <RingCard value={p?.actual ?? null} label={tr('жигнэсэн гүйцэтгэл')} decimals={2} />
      </Panel>

      {/* Үе шатны ЖИН — `byStage[*].weight` нь нэгтгэгддэг байсан ч зурагддаггүй байв */}
      <Panel title={tr('Үе шатны жин — төсөлд эзлэх хувь')}>
        {p == null ? (
          <Empty label={tr('Гүйцэтгэлийн хүснэгт татагдаж байна…')} />
        ) : (() => {
          const keys = stageKeys((k) => p.byStage[k].weight > 0);
          if (!keys.length) return <Empty label={tr('Үе шатны жин бүртгэгдээгүй.')} />;
          const slices = keys.map((k, i) => ({
            key: k,
            label: stageLabel(k),
            value: Number(p.byStage[k].weight.toFixed(2)),
            color: shade(ACCENT, i, keys.length + 1),
            display: tr('{0}% · {1} ажил', num(p.byStage[k].weight, 2), num(p.byStage[k].rows)),
          }));
          return (
            <Donut
              size={150}
              width={24}
              stack
              center={`${num(sumBy(slices, (s) => s.value), 1)}%`}
              centerLabel={tr('бүртгэгдсэн жин')}
              items={withRest(slices)}
            />
          );
        })()}
      </Panel>

      {/* ⚠️ Он ЭНДЭЭС хасагдав — доорх «хугацаа ба төлөв» картад уншигдахуйц
          болж орсон. Урьд нь шошго нь «нэр · 2024–2026» болж хоёр мөр даруулдаг. */}
      <Panel title={tr('Үндсэн үе шат')}>
        <Bars
          max={100}
          items={SCHEDULE.map((st) => {
            const v = liveStage(p, st.stages);
            return {
              key: st.no,
              label: st.label,
              value: v ?? 0,
              display: v == null ? '—' : pct(v, v >= 1 ? 1 : 0),
              color: v == null ? NO_DATA : heat(v, 100),
            };
          })}
        />
      </Panel>

      {/* Хувь нэмэр — үе шат бүр НИЙТ гүйцэтгэлд хэдэн жингийн нэгж нэмсэн */}
      <Panel
        title={tr('Гүйцэтгэлийн хувь нэмэр — үе шатаар')}
        note={p == null ? undefined : tr('дүүрсэн {0} · Σжин {1}', pct(p.actual, 1), num(p.coverage, 1))}
      >
        {p == null ? (
          <Empty label={tr('Гүйцэтгэлийн хүснэгт татагдаж байна…')} />
        ) : (
          <Stack
            // ⚠️ `total={100}` бол ХУДАЛ 22.5% гарна: жингийн нийлбэр 100 БИШ
            //    (~81.5). Дээд хязгаарыг БҮРТГЭГДСЭН жингээр авбал зурвасын
            //    дүүрсэн хувь ЯГ `p.actual` болно.
            total={p.coverage}
            items={stageKeys().map((k, i) => {
              const s = p.byStage[k];
              return {
                key: k,
                label: tr('{0} · жин {1}% · {2}', stageLabel(k), num(s.weight, 1), pct(s.actual, 0)),
                value: Number(((s.weight * s.actual) / 100).toFixed(1)),
                color: HUE[i % HUE.length],
              };
            })}
          />
        )}
      </Panel>

      {/* Хугацаа ба төлөв — `SCHEDULE.status`/`.tone` нь `brief.ts`-д байсан ч
          хаана ч зурагддаггүй байв. Мөн 04/06 шат яагаад «—» болохыг ЭНД хэлнэ. */}
      <Panel title={tr('Үе шатны хугацаа ба төлөв')}>
        <List>
          {SCHEDULE.map((st) => {
            const v = liveStage(p, st.stages);
            return (
              <ListItem
                key={st.no}
                title={`${st.no}. ${st.label}`}
                sub={
                  v == null
                    ? tr('{0}–{1} · {2}', st.from, st.to, st.stages.length ? tr('амьд бүртгэл тохирсонгүй') : tr('амьд эх сурвалж алга'))
                    : tr('{0}–{1} · амьд эх: {2}', st.from, st.to, st.stages.join(', '))
                }
                value={st.status}
                color={st.tone === 'done' ? 'var(--good)' : st.tone === 'active' ? ACCENT : NO_DATA}
              />
            );
          })}
        </List>
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
function heatBars<T>(
  rows: readonly T[],
  m: (r: T) => { key: string; label: string; value: number; display?: string },
): { key: string; label: string; value: number; display?: string; color: string }[] {
  const items = rows.map(m);
  const mx = maxOf(items.map((i) => i.value));
  return items.map((i) => ({ ...i, color: heat(i.value, mx) }));
}

type Slice = { key: string; label: string; value: number; color: string; display?: ReactNode };
/**
 * Σ < 100 бол «бүртгэгдээгүй» зүсмэгийг ИЛ нэмнэ — `loadBudget`-ийн «Эх үүсвэр
 * задраагүй» дүрэмтэй ижил: зөрүүг нуухгүй. Эс бөгөөс Donut нь зүсмэгүүдээ
 * 100%-д нормчилж, бүртгэгдээгүй жинг ЧИМЭЭГҮЙ нууна.
 */
function withRest(items: Slice[], label = tr('Бүртгэгдээгүй жин')): Slice[] {
  const shown = sumBy(items, (i) => i.value);
  if (shown >= 99.95) return items;
  return [...items, {
    key: 'rest',
    label,
    value: Number((100 - shown).toFixed(2)),
    color: NO_DATA,
    display: pct(100 - shown, 2),
  }];
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

function BagtsDetail({ q, prog, hist, flt, onFlt }: {
  q: Async<BagtsRow[]>;
  prog: Async<BlockProgressMap>;
  hist: Async<BlockHistory>;
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

      <Panel title={tr('Багц бүрийн явц')}>
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
      <Panel title={tr('Багц бүрийн гүйцэтгэгч')}>
        <Rows
          items={rows.map((r) => ({
            key: `${r.label} · ${r.origin}`,   // ⚠️ `r.origin`, дахин lookup БИШ
            value: r.contractor,
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
function LandDetail({ parcels, land, project, flt, onFlt }: {
  parcels: Async<Row[]>; land: Async<LandStatus>; project: Async<ProjectProgress>;
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
                label: tr('Төлөв: {0}', label),
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

      {/* Хоёр эх сурвалжийн зөрүү — `land.ts`-ийн тайлбар нь хоёр тоо зөрдөг
          гэдгийг сануулдаг ч ХОЁУЛАНГ нь хаана ч хажуу хажууд харуулдаггүй байв. */}
      <Panel title={tr('Хоёр эх сурвалжийн зөрүү')}>
        <Data q={land} loading={tr('Татаж байна…')}>
          {(ls) => {
            const p = project.state === 'ready' ? project.data : null;
            const official = liveStage(p, [tr('Газар чөлөөлөлт')]);
            return (
              <>
                <Rows
                  items={[
                    { key: tr('Талбарын тоогоор (кадастр)'), value: pct(ls.pct, 2) },
                    { key: tr('Тайлагнасан (Төсөл_Гүйцэтгэл)'), value: official == null ? '—' : pct(official, 1) },
                    {
                      key: tr('Зөрүү'),
                      value: ls.pct == null || official == null ? '—' : tr('{0} пункт', num(official - ls.pct, 2)),
                    },
                    { key: tr('Шийдэгдсэн талбар'), value: `${num(ls.resolved)} / ${num(ls.total)}` },
                    { key: tr('Үлдсэн талбар'), value: tr('{0} талбар', num(ls.remaining)) },
                    {
                      key: tr('Үе шатны төслийн жин'),
                      value:
                        p?.byStage['Газар чөлөөлөлт'] == null
                          ? '—'
                          : tr('{0}%', num(p.byStage['Газар чөлөөлөлт'].weight, 1)),
                    },
                  ]}
                />
                <p className={o.note}>
                  {tr('Дээд мөр нь')} <b>{tr('кадастрын нэгж талбарын тоо')}</b>{tr(', доод нь')}{' '}
                  <b>{tr('тайлант үе шатны хувь')}</b> {tr('— өөр хуваарьтай хоёр хэмжигдэхүүн. Аль нь ч буруу биш: давхаргад тайлангаас ХОЙШ шинэчлэгдсэн мөр бий.')}
                </p>
              </>
            );
          }}
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
                      label: tr('Шалтгаан: {0}', label),
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
                    label: tr('Төлөв: {0}', label),
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

      {/* Блокоор — `PL.block` нь `useLeftParcels`-ын outFields-д байсан ч хэн ч
          уншдаггүй байв. */}
      <Panel title={tr('Блокоор — нэгж талбарын төлөв')}>
        <Data q={parcels} loading={tr('Татаж байна…')}>
          {(rows) => {
            // ⚠️ `Блок` нь ТООН талбар (1/2/3) ба олон мөрд ХООСОН. Null-ыг ХАЯНА —
            //    эс бөгөөс «Тодорхойгүй» багана бусдыг нь дарна.
            const g = tally(
              rows.filter((r) => r[PL.block] != null && String(r[PL.block]).trim() !== ''),
              (r) => ({ key: tr('Блок {0}', String(r[PL.block]).trim()), value: 1 }),
            );
            if (!g.length) return <Empty label={tr('Блокийн бүртгэл хоосон.')} />;
            const named = sumBy(g, (x) => x.value);
            return (
              <>
                <p className={o.note}>
                  {tr('Блок бүртгэгдсэн')} <b>{num(named)}</b> {tr('талбар (')}{num(rows.length)}{tr('-аас). ⚠️ Дүүрэг нь ТУСДАА багана тул «Блок 2» нь СБД-2 ба ЧД-2-ыг НЭГТГЭЖ байна.')}
                </p>
                <Bars
                  inline
                  selected={sel}
                  onSelect={(key) => {
                    const n = key.replace(/\D/g, '');
                    if (!n) return;
                    onFlt({
                      sec: 'land',
                      key,
                      label: key,
                      where: `${PL.block} = ${n}`,
                      only: ['land:left'],
                    });
                  }}
                  items={heatBars(g, (x) => ({
                    key: x.key,
                    label: x.key,
                    value: x.value,
                    display: tr('{0} талбар', num(x.value)),
                  }))}
                />
              </>
            );
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
 * Гадна дулаан/ус/татуургын багцууд (Багц 5.x, 7, 10–15) — гүйцэтгэл, хангах
 * өрх, эх үүсвэрийн чадал. Багц дарахад зурагт тэр багцын давхаргууд л үлдэнэ.
 *
 * ⚠️ Урьд нь энэ хэсэгт ГАНЦ карт байсан бөгөөд түүний баганын утга нь
 * `w.ids.length` (1 эсвэл 2) — «энэ багц цэгэн давхаргатай юу» гэдгээс өөр юу ч
 * илэрхийлэхгүй тоо байв. Одоо утга нь `Төсөл_Гүйцэтгэл`-ийн жигнэсэн хувь.
 */
function NetworkDetail({ project, bagts, sources, flt, onFlt }: {
  project: Async<ProjectProgress>;
  bagts: Async<BagtsRow[]>;
  sources: Async<Row[]>;
} & FltProps) {
  const sel = flt?.sec === 'network' ? flt.key : null;
  const pick = (key: string) => {
    const ids = PKG_BY_BAGTS[key] ?? [];
    if (ids.length) onFlt({ sec: 'network', key, label: tr('Багц: {0}', key), layers: ids });
  };
  const p = project.state === 'ready' ? project.data : null;
  /** 11 сүлжээний багцын мөр — `isNetworkPack` нь bagtsKey-ээр жишдэг */
  const net: ProgRow[] = p ? p.rows.filter((r) => isNetworkPack(r.bagts)) : [];

  return (
    <>
      {/* 05 нь урьд нь ГҮЙЦЭТГЭЛИЙН тоогүй ЦОРЫН ГАНЦ хэсэг байв. */}
      <Panel title={tr('Шугам сүлжээний нэгдсэн явц')}>
        {p == null ? <Empty label={tr('Гүйцэтгэлийн хүснэгт татагдаж байна…')} /> : (() => {
          if (!net.length) return <Empty label={tr('Сүлжээний багцын гүйцэтгэлийн мөр алга.')} />;
          const w = weighted(net);
          const packs = new Set(net.map((r) => r.bagts)).size;
          const gap = w.actual != null && w.planned != null ? w.planned - w.actual : null;
          return (
              <Stats cols={2}>
                <Stat accent color={cat(0)} value={num(packs)} unit={tr('багц')} label={tr('Шугам сүлжээний багц')} />
                {/* ⚠️ `w.planned` нь сүлжээний БҮХ мөрд `Төлөвлөгөөт_хувь` хоосон
                    үед null — `pct(null)` «—» хэвлэнэ. 0-оор ОРЛУУЛАХГҮЙ: тэр нь
                    «төлөвлөгөө тэг» гэсэн ХУДАЛ мэдээлэл болно. */}
                <Stat accent color={cat(2)} value={pct(w.planned, 0)} label={tr('Төлөвлөгөөт гүйцэтгэл')} />
                <Stat accent color="var(--bad)" value={gap == null ? '—' : num(gap, 1)} unit={tr('пункт')}
                      label={tr('Төлөвлөгөөнөөс хоцрогдол')} />
                <Stat accent color={HUE[2]} value={num(w.weight, 2)} unit="%" label={tr('Төсөлд эзлэх жин')} />
              </Stats>
          );
        })()}
      </Panel>

      {/* ⚠️ Бөгж тоонуудын зурвасаас САЛСАН — хажуугийн баганын карт. */}
      <Panel title={tr('Жигнэсэн гүйцэтгэл')}>
        <RingCard value={weighted(net).actual} label={tr('жигнэсэн гүйцэтгэл')} color={cat(0)} decimals={1} />
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

      <Panel title={tr('Багц бүрийн гүйцэтгэл')}>
        {(() => {
          const packs = infraPackList(isNetworkPack);        // давхаргатай багцууд
          if (!packs.length) return <Empty label={tr('Багцын давхарга алга.')} />;
          const agg = new Map(rollupBy(net, (r) => r.bagts).map((x) => [x.key, x.agg]));
          return (
            <>
              <p className={o.note}>
                {num(packs.length)} {tr('багц. Багана нь')} <b>{tr('гүйцэтгэлийн хувь')}</b>
                {' '}{tr('(Төсөл_Гүйцэтгэл, жигнэсэн). Багц дарж газрын зурагт шүүнэ.')}
              </p>
              <Bars
                inline max={100} selected={sel} onSelect={pick}
                items={packs.map((w) => {
                  const a = agg.get(w.key)?.actual ?? null;
                  return {
                    key: w.key, label: w.label, value: a ?? 0,
                    display: a == null ? '—' : pct(a, 1),
                    color: a == null ? NO_DATA : heat(a, 100),
                  };
                })}
              />
            </>
          );
        })()}
      </Panel>

      {/* `нийт_чадал` ба `тайлбар` нь `useSources`-ийн outFields-д БАЙГАА хэрнээ
          дашбоардын хаана ч зурагддаггүй байв. */}
      <Panel title={tr('Дулаан, ус хангамжийн эх үүсвэрийн чадал')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')}>
          {(rows) => {
            const F = SOURCE_FS.fields;
            const grab = (pre: string) => rows.filter((r) => srcStr(r[F.type]).startsWith(pre));
            const heatRows = grab(tr('Дулаан'));
            const waterRows = grab(tr('Ус'));
            const cap = (rs: Row[]) => sumBy(rs, (r) => srcNum(r[F.total]));
            if (!heatRows.length && !waterRows.length) return <Empty label={tr('Эх үүсвэрийн бүртгэл хоосон.')} />;
            return (
              <>
                {/* ⚠️ Нэгж нь ЗӨРНӨ (МВт vs м³/хон) — эдгээрийг НЭГ `Bars`-т
                    нийлүүлж БОЛОХГҮЙ: нэг тэнхлэгт хоёр өөр нэгж харьцуулагдана.
                    `Stats` бол энд цорын ганц зөв примитив. */}
                <Stats cols={2}>
                  <Stat accent color={HUE[0]} value={num(cap(heatRows), 1)} unit={tr('МВт')} label={tr('Дулааны нийт чадал')} />
                  <Stat accent color={HUE[2]} value={num(heatRows.length)} unit={tr('ш')} label={tr('Дулааны байгууламж')} />
                  <Stat accent color={HUE[4]} value={num(cap(waterRows))} unit={tr('м³/хон')} label={tr('Усны нийт чадал')} />
                  <Stat accent color={HUE[6]} value={num(waterRows.length)} unit={tr('ш')} label={tr('Усны байгууламж')} />
                </Stats>
              </>
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

      {/* Сүлжээний багц бүр ЯГ 7 мөртэй (үе шат тутамд нэг) — `byStage[*].rows`
          нь нэгтгэгддэг ч хаана ч хэвлэгддэггүй байв. 5-р слот = бүтэн өргөн. */}
      <Panel title={tr('Үе шатаар — шугам сүлжээний гүйцэтгэл')} note={tr('жигнэсэн, 11 багцын дүнгээр')}>
        {net.length === 0 ? <Empty label={tr('Гүйцэтгэлийн мөр алга.')} /> : (() => {
          const ORD = PROJECT_PROGRESS.stages.map((x) => String(x.value));
          const agg = rollupBy(net, (r) => r.stage)
            .sort((a, b) => (ORD.indexOf(a.key) + 99 * +(ORD.indexOf(a.key) < 0))
                          - (ORD.indexOf(b.key) + 99 * +(ORD.indexOf(b.key) < 0)));
          return (
            <Series
              color={ACCENT}
              // ⚠️ `unit` ТАВИХГҮЙ: `Series` нь `display`-ийн ХОЙНО unit-ыг залгадаг
              //    тул «61.4% · жин 1.83% · 22 ажил %» гэсэн сүүлчийн үлдэц % гарна.
              //    Нэгж нь `display`-д аль хэдийн бий.
              items={agg.map((x) => ({
                key: x.key,
                label: x.key,
                value: Number((x.agg.actual ?? 0).toFixed(1)),
                display: tr('{0} · жин {1}% · {2} ажил', pct(x.agg.actual, 1), num(x.agg.weight, 2), num(x.agg.rows)),
              }))}
            />
          );
        })()}
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
 *
 * ⚠️ `srcStr`/`srcNum` нь ДООР (07-ийн хэсэгт) тодорхойлогдсон — `const` тул
 * модуль ачаалагдах үед TDZ-д байх ч компонент нь ХОЙШ рендерлэгддэг тул
 * дуудахад аль хэдийн бий. `railStat` ч мөн ижилхэн доороос дуудаж байгаа.
 */
function PowerDetail({ project, sources, prog, flt, onFlt }: {
  project: Async<ProjectProgress>;
  sources: Async<Row[]>;
  prog: Async<BlockProgressMap>;
} & FltProps) {
  const sel = flt?.sec === 'power' ? flt.key : null;
  const items = infraPackList(isPowerPack);
  const pick = (key: string) => {
    const ids = PKG_BY_BAGTS[key] ?? [];
    if (ids.length) onFlt({ sec: 'power', key, label: tr('Багц: {0}', key), layers: ids });
  };
  return (
    <>
      {/* 07 хэсэг цахилгааны Donut-аа `хангах_хувь`-аар зурж, төвд нь
          БАЙГУУЛАМЖИЙН ТОО бичдэг — МВт чадал ба «шинэ/одоо байгаа» хуваалт
          дашбоардын хаана ч гардаггүй байв. */}
      <Panel title={tr('Цахилгааны эх үүсвэрийн чадал')}>
        <Data q={sources} loading={tr('Эх үүсвэрийн чадлыг татаж байна…')}>
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
                  <Stat accent color={HUE[0]} value={num(capTotal, 1)} unit={tr('МВт')} label={tr('Нийт эх үүсвэрийн чадал')} />
                  <Stat accent color={HUE[2]} value={num(capTotal - plannedMw, 1)} unit={tr('МВт')}
                        label={oldOne?.name || tr('Одоо байгаа дэд станц')} />
                  <Stat accent color={HUE[4]} value={num(plannedMw, 1)} unit={tr('МВт')}
                        label={newOne?.name || tr('Төлөвлөж буй дэд станц')} />
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

      {/* Төслийн ЦОРЫН ГАНЦ ажил тус бүрийн цахилгааны гүйцэтгэл — 28 мөр. */}
      <Panel title={tr('Гадна цахилгааны ажлын гүйцэтгэл')}>
        <Data q={project} loading={tr('Гүйцэтгэлийн хүснэгтийг татаж байна…')}>
          {(p) => {
            // ⚠️ `bagts_name` нь эдгээр 28 мөрд БҮГДЭД NULL — `Ажлын_нэр`-ээр жишинэ.
            const pw = p.rows.filter((r) => /Гадна цахилгаан/u.test(r.work));
            if (!pw.length) return <Empty label={tr('Гадна цахилгааны ажлын мөр алга.')} />;
            const w = weighted(pw);
            const agg = rollupBy(pw, (r) => r.work.replace(/\s+/g, ' ').trim());
            return (
              <>
                <p className={o.note}>
                  {tr('Жигнэсэн')} <b>{pct(w.actual, 1)}</b> {tr('· төсөлд эзлэх жин')}{' '}
                  <b>{num(w.weight, 2)}%</b> · {num(w.rows)} {tr('ажлын мөр.')}
                </p>
                <Bars
                  inline max={100}
                  items={agg
                    .sort((a, b) => (b.agg.actual ?? 0) - (a.agg.actual ?? 0))
                    .map((x) => ({
                      key: x.key,
                      label: x.key,
                      value: x.agg.actual ?? 0,
                      display: tr('{0} · жин {1}%', pct(x.agg.actual, 1), num(x.agg.weight, 2)),
                      color: x.agg.actual == null ? NO_DATA : heat(x.agg.actual, 100),
                    }))}
                />
              </>
            );
          }}
        </Data>
      </Panel>

      <Panel title={tr('Багцад хуваарилсан чадал (МВт)')}>
        <Data q={sources} loading={tr('Эх үүсвэрийг татаж байна…')}>
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

      <Panel title={tr('Гадна цахилгаан (БАГЦ-6)')}>
        {!items.length ? (
          <Empty label={tr('Багцын давхарга алга.')} />
        ) : (
          <>
            {/* ⚠️ Багана нь ФИЗИК хэмжээ БИШ гэдгийг ил хэлнэ — урьд нь «Багц дарж
                шүүнэ» гэсэн тайлбар нь баганын урт ямар нэг бодит хэмжигдэхүүн
                гэсэн ойлголт төрүүлдэг байв. Кабелийн урт/ХТП тоо нь одоогоор
                амьд эх сурвалжгүй (12 шинэ хүсэлт шаардана). */}
            <p className={o.note}>
              {num(items.length)} {tr('багц. Багана нь')} <b>{tr('газрын зургийн давхаргын тоо')}</b>
              {' '}{tr('(трасс + цэг) — физик хэмжээ БИШ. Багц дарж зурагт шүүнэ.')}
            </p>
            <Bars
              inline
              selected={sel}
              onSelect={pick}
              items={items.map((w) => ({
                key: w.key,
                label: w.label,
                value: w.ids.length,
                display: tr('{0} давхарга', num(w.ids.length)),
                color: cat(0),
              }))}
            />
          </>
        )}
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
        <Data q={sources} loading={tr('Эх үүсвэрийн мэдээллийг татаж байна…')}>{() => null}</Data>
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
            const unit = t.includes('Ус') ? tr('м³/хон') : tr('МВт');
            const cap = sumBy(facs, (r) => srcNum(r[F.total]));
            return (
              <Stat
                key={t}
                accent
                color={HUE[(i * 2) % HUE.length]}
                value={cap ? num(cap, unit === 'МВт' ? 1 : 0) : '—'}
                unit={unit}
                // ⚠️ Зөвхөн «эх үүсвэр» гэдгийг хасна (картын гарчигт аль хэдийн
                //    бий). Харьяалахын нөхцөлийг («ын/ий/н») тайрах гэж
                //    оролдвол амьд утга «Усан хангамжийн эх үүсвэр» нь
                //    «Усан хангамжий» болж ҮГ ТАСАРНА — нөхцөл нь үлдэх нь зөв.
                label={tr('{0} · {1} байгууламж', t.replace(/\s*эх\s+үүсвэр\s*$/u, ''), num(facs.length))}
              />
            );
          })}
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
 * ТӨСВИЙН ЭХ = Cashflow /106 (CASHFLOW2) — захирамж/гэрээгээр баталгаажсан
 * ТӨСЛИЙН төсөв (2026-08-14, хэрэглэгчийн шийдвэр). Санхүүгийн ганц зөв эх нь
 * Cashflow. «Хөрөнгө оруулалт өртөг» /249 бүхэлдээ түр хасагдсан.
 */
/** ₮ — их наяд / тэрбум / сая, ГАНЦ дүрэм (4 картад давтахгүй) */
const tug = (v: number): string =>
  v >= 1e12 ? tr('{0} их наяд ₮', num(v / 1e12, 2))
    : v >= 1e9 ? tr('{0} тэрбум ₮', num(v / 1e9, 1))
      : tr('{0} сая ₮', num(v / 1e6, 1));

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
          <Stat accent color={HUE[0]} value={num(bg.total / 1e12, 2)} unit={tr('их наяд ₮')} label={tr('Төслийн нийт төсөвт өртөг')} />
          <Stat accent color={HUE[1]} value={num(bg.orderTotal / 1e9, 1)} unit={tr('тэрбум ₮')} label={tr('Захирамжийн нийт дүн')} />
          <Stat accent color={HUE[2]} value={num(bg.contract / 1e9, 1)} unit={tr('тэрбум ₮')} label={tr('Гэрээ байгуулсан дүн')} />
          {/* ⚠️ CF028 (мөнгөн дүн) — CF027 (`prevPct`) нь мөр тутмын 0–1
              бутархай тул түүнийг ХЭЗЭЭ Ч нийлбэрлэхгүй. */}
          <Stat accent color={HUE[3]} value={num(bg.transferred / 1e9, 1)} unit={tr('тэрбум ₮')} label={tr('Өмнө шилжүүлсэн')} />
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
        <Donut
          items={bg.sources.map((s, i) => ({
            key: s.key, label: s.label, value: s.value,
            color: shade(ACCENT, i, bg.sources.length),
            display: tr('{0} тэрбум', num(s.value / 1e9, 1)),
          }))}
          center={num(bg.orderTotal / 1e9, 1)} centerLabel={tr('тэрбум ₮')} size={150} width={24} stack
        />
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
  
      <Panel title={tr('Санхүүжилтийн хуваарь · өссөн дүн (2025-10 → 2026-09)')}>
        <Trend
          color={ACCENT}
          unit={tr(' тэрбум ₮')}
          // ⚠️ `note`-ыг ХООСОН үлдээнэ: `axisTicks` нь `note ?? label`-ыг
          //    хэвлэж, зөвхөн /^\d{4}-/ хэлбэрийг тайрдаг тул огноо биш note
          //    нь тэнхлэгийн шошго болж эвдэрнэ.
          points={bg.months.reduce<{ label: string; value: number }[]>((acc, m) => {
            const prev = acc.length ? acc[acc.length - 1].value : 0;
            acc.push({ label: m.label, value: prev + m.amount / 1e9 });
            return acc;
          }, [])}
        />
        <p className={o.note}>
          {tr('Эх Excel-д 2027-12 хүртэл бий ч сервис CF255-д тасардаг — 2026-09-өөс хойшхи хуваарь НИЙТЛЭГДЭЭГҮЙ тул муруй тэгш болно.')}
        </p>
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
               * нэвтрэх суваг»-тай ХУДЛАА тааралдана (63.0 ба 2.2 тэрбумын
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
          {tr('▸ тэмдэгтэй багц нь газрын зурагт давхаргатай — дарж шүүнэ. ⚠️ Задаргаа нь')} <code>CF004</code> {tr('(дэд багцтай),')} <code>CF003</code> {tr('БИШ. ⚠️ «БАГЦ 1-4» гэх завсрын мөр нь ганц багц БИШ тул зурагт холбогдоогүй.')}
        </p>
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
                value={h && ail ? `${num(h.investTotal / ail / 1e6, 1)}` : '…'}
                unit={tr('сая ₮')} label={tr('1 өрхөд ногдох төсөв')} />
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

      {/*
        ⚠️ ХОЁР ӨӨР ШҮҮЛТИЙГ ЗЭРЭГЦҮҮЛЖ БАЙГААГ ХҮЛЭЭН ЗӨВШӨӨРНӨ: 3/4-р карт нь
        АНГИЛЛААР (`SOC_MATCH` → гарчгийн дэд текст), энэ карт нь БАГЦААР шүүнэ.
        Хоёул `flt.sec === 'benefit'` бичдэг тул нэгийг сонгоход нөгөө нь
        сонголтоо алдана — газрын зурагт НЭГ л шүүлт байх ёстой тул энэ нь ЗӨВ.
        Картуудын `selected` түлхүүр таарахгүй нь ЗОРИУДЫН, нэгтгэх гэж оролдохгүй.
      */}
      <Panel title={tr('Нийгмийн багцын гүйцэтгэл')}>
        <Data q={d.project} loading={tr('Гүйцэтгэлийн хүснэгтийг татаж байна…')}>
          {(p) => {
            // Багцын түлхүүрийг ХҮСНЭГТЭЭС — гараар жагсаавал PKG_TABLE-тай хоцорно
            const socKeys = new Set(
              (PKG_BY_FAMILY.soc ?? []).map((id) => bagtsKey(LAYER_BY_ID[id]?.note)).filter(Boolean),
            );
            const rows = p.rows.filter((r) => socKeys.has(r.bagts));
            if (!rows.length) return <Empty label={tr('Нийгмийн багцын гүйцэтгэлийн мөр алга.')} />;
            const w = weighted(rows);
            const agg = rollupBy(rows, (r) => r.bagts).sort((a, b) => a.key.localeCompare(b.key, 'mn', { numeric: true }));
            return (
              <>
                <p className={o.note}>
                  {tr('Жигнэсэн')} <b>{pct(w.actual, 1)}</b> {tr('· төсөлд эзлэх жин')}{' '}
                  <b>{num(w.weight, 2)}%</b> · {num(agg.length)} {tr('багц. Бар дарж зурагт шүүнэ.')}
                </p>
                <Bars
                  inline max={100}
                  selected={flt?.sec === 'benefit' ? flt.key : null}
                  onSelect={(key) => {
                    const ids = PKG_BY_BAGTS[key] ?? [];
                    if (ids.length) onFlt({ sec: 'benefit', key, label: tr('Багц: {0}', key), layers: ids });
                  }}
                  items={agg.map((x) => ({
                    key: x.key,
                    label: LAYER_BY_ID[(PKG_BY_BAGTS[x.key] ?? [])[0]]?.title ?? x.key,
                    value: x.agg.actual ?? 0,
                    display: x.agg.actual == null ? '—' : tr('{0} · жин {1}%', pct(x.agg.actual, 1), num(x.agg.weight, 2)),
                    color: x.agg.actual == null ? NO_DATA : heat(x.agg.actual, 100),
                  }))}
                />
              </>
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
