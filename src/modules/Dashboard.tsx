'use client';

import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode, type Ref,
} from 'react';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Donut, Ring, Bars, Data, Stats, Stat, Empty } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { LayerCatalog } from '@/components/LayerCatalog';
import { ZoneFilter } from '@/components/ZoneFilter';
import { useAsync, type Async } from '@/lib/useAsync';
import { usePlanTotals } from '@/lib/totals';
import { queryFeatures, type Row } from '@/lib/query';
import {
  ZONE_LAYER, ZONE_FIELD, ZONE_NONE, BUILT_LAYER, BUILDING,
  LAYER_BY_ID, PARCEL_LEFT, SOURCE_FS,
  PLAN_LAYER_IDS, MONITOR_LAYER_IDS, INITIAL_MAP_LAYERS,
  PKG_BY_FAMILY, PKG_BY_BAGTS, LAYERS, bagtsKey, buildingKey,
} from '@/lib/services';
import {
  INDICATORS, SCORE_LEVELS, levelOf, PARKING, DEFAULT_ECON_SHARE,
  BUILD_COST_PER_M2, NO_DATA_COLOR, profitScore,
} from '@/lib/analysis/config';
import { loadAnalysisCached, computeEconomics, computeRaw, defaultGreenCats } from '@/lib/analysis/data';
import { loadCostsCached } from '@/lib/analysis/costs';
import { urbanScore, scoreColor, scoreLabel } from '@/lib/analysis/score';
import { loadBlockProgress, type BlockProgressMap } from '@/lib/blockProgress';
import { loadLandStatus, type LandStatus } from '@/lib/land';
import { num, pct, text, shade, shades, tint } from '@/lib/format';
import { SCHEDULE, BAGTS_ORIGIN } from '@/lib/brief';
import {
  loadHeadline, loadSocial, loadProjectProgress, loadBudget, liveStage,
  type Headline, type SocialLive, type ProjectProgress, type Budget,
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

type SecKey = 'scope' | 'schedule' | 'bagts' | 'land' | 'network' | 'power' | 'source' | 'finance' | 'benefit' | 'suit';

const SECTIONS: { key: SecKey; no: string; title: string }[] = [
  { key: 'scope', no: '01', title: 'Төслийн цар хүрээ' },
  { key: 'schedule', no: '02', title: 'Хэрэгжилтийн ерөнхий график' },
  { key: 'land', no: '03', title: 'Газар чөлөөлөлтийн одоогийн төлөв' },
  { key: 'bagts', no: '04', title: 'Орон сууцны бүс' },
  { key: 'network', no: '05', title: 'Шугам сүлжээ' },
  { key: 'power', no: '06', title: 'Цахилгаан' },
  { key: 'source', no: '07', title: 'Эх үүсвэр' },
  { key: 'finance', no: '08', title: 'Хөрөнгө оруулалт, бонд' },
  { key: 'benefit', no: '09', title: 'Нийгмийн дэд бүтэц' },
  { key: 'suit', no: '10', title: 'Тохиромжтой байдлын үнэлгээ' },
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
  network: [...(PKG_BY_FAMILY.net ?? [])],
  // Цахилгаан — гадна цахилгаан ба ХТП/РП (Багц 6)
  power: [...(PKG_BY_FAMILY.pow ?? [])],
  // Эх үүсвэр — нэгтгэсэн үйлчилгээ (SOURCE_FS, `torol`-оор өнгөт)
  source: ['source:eh'],
  finance: [],
  // Нийгмийн барилгууд — сургууль, цэцэрлэг, соёл, спорт (Багц 19–21)
  benefit: [...(PKG_BY_FAMILY.soc ?? [])],
  // Үнэлгээ нь БҮСЭЭР бодогддог
  suit: [ZONE_LAYER.id],
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

/**
 * Хадгалагдсан өргөн. `null` = АВТОМАТ (CSS өөрөө бодно) — хэрэглэгч бариулыг
 * хөдөлгөтөл автомат хэвээр үлдэнэ. Ингэснээр хэсэг нэмэх бүрд баруун талбар
 * өөрөө өргөсөж, харин хэрэглэгч нэг удаа гар аргаар тохируулсны дараа түүний
 * сонголт давамгайлна.
 */
function useStoredWidth(key: string): [number | null, (v: number | null) => void] {
  const [w, setW] = useState<number | null>(null);
  // ⚠️ localStorage-ыг ЗӨВХӨН mount-ын дараа уншина: анхны рендерийг сервер ба
  //    клиент дээр ижил байлгах (hydration зөрөхөөс сэргийлнэ).
  useEffect(() => {
    const raw = window.localStorage.getItem(key);
    if (raw != null && raw !== '') {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) setW(n);
    }
  }, [key]);
  const set = useCallback((v: number | null) => {
    setW(v);
    if (v == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(Math.round(v)));
  }, [key]);
  return [w, set];
}

/**
 * Багана хооронд чирэх бариул.
 *
 * ⚠️ `setPointerCapture` — чирэх үед хулгана газрын зураг дээгүүр гарахад
 * ArcGIS нь заагчийг «залгидаг» тул capture-гүй бол чирэлт дунд замдаа тасарна.
 * ⚠️ Гараас ч ажиллана (сум · Home): бариул нь зөвхөн хулганаар удирдагддаг
 * байвал гар ашигладаг хэрэглэгч өргөнийг хэзээ ч өөрчилж чадахгүй.
 * ⚠️ Давхар товшилт — АВТОМАТ хэмжээст буцаана.
 */
function Grip({ measure, min, max, invert, label, onChange, onReset }: {
  /**
   * Самбарын ОДООГИЙН өргөнийг px-ээр буцаана.
   * ⚠️ Тогтмол утга биш ФУНКЦ байх ёстой: автомат горимд өргөн нь CSS-ээс
   * (нээлттэй хэсгийн тоо, vw-ийн таг) бодогддог тул React талд мэдэгдэхгүй.
   * Чирч эхлэх агшинд бодит хэмжээг уншиж авбал бариул «үсэрдэггүй».
   */
  measure: () => number;
  min: number;
  max: number;
  /** Баруун талын самбарт — зүүн тийш чирэхэд ӨРГӨН нэмэгдэнэ */
  invert?: boolean;
  label: string;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ x: number; v: number } | null>(null);
  const [on, setOn] = useState(false);
  const value = clamp(measure(), min, max);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, v: clamp(measure(), min, max) };
    setOn(true);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = drag.current;
    if (!s) return;
    const dx = (e.clientX - s.x) * (invert ? -1 : 1);
    onChange(clamp(s.v + dx, min, max));
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    setOn(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const key = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    const cur = clamp(measure(), min, max);
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(clamp(cur + (invert ? step : -step), min, max)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onChange(clamp(cur + (invert ? -step : step), min, max)); }
    else if (e.key === 'Home' || e.key === 'Escape') { e.preventDefault(); onReset(); }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label} — чирж өргөнийг өөрчил, давхар товшиж сэргээ`}
      className={`${o.grip} ${on ? o.gripOn : ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      onKeyDown={key}
    >
      <span aria-hidden />
    </div>
  );
}

function Panel({ title, note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className={o.panel}>
      {title && (
        <div className={o.panelHead}>
          <h3 className={o.panelTitle}>{title}</h3>
          {note && <span className={o.panelNote}>{note}</span>}
        </div>
      )}
      {children}
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
    };
    by.set(k, cur);
    return cur;
  };

  for (const b of blocks) {
    const name = text(b[BF.bagts], 'Тодорхойгүй');
    const s = slot(name);
    s.blocks += 1;
    s.ail += Number(b[BF.households] ?? 0);
    // Гүйцэтгэгч — блокийн давхаргын BAR_COMP (багцын бүх блок нэг гүйцэтгэгчтэй)
    const comp = text(b[BF.contractor], '').trim();
    if (comp) s.contractor = comp;
    const cell = prog.get(buildingKey(b[BF.bagts], b[BF.block]));
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

type SuitSummary = {
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
function useSuitability(enabled: boolean, onProgress?: (m: string, p: number) => void): Async<SuitSummary> {
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
   * Газрын зурагт асаалттай давхаргууд. Хэсэг сонгоход газрын зураг тэр
   * хэсэг(үүд)-ийн холбогдох давхаргаар ШҮҮГДЭНЭ — нэмэлт биш, REPLACE:
   * нээлттэй хэсгүүдийн `SECTION_LAYERS` + барилга контекст (`CONTEXT_LAYERS`)
   * үлдэж, бусад бүх давхарга нуугдана. Юу ч нээлттэй биш бол анхдагч
   * `BASE_LAYERS` (бүс + барилга). Үндсэн хил (`khil1`) нь `ALWAYS_ON_IDS`-ээр
   * MapCanvas-д өөрөө үргэлж асаалттай тул энд оруулах шаардлагагүй.
   *
   * ⚠️ Синкийг `useEffect`-ээр ХИЙХГҮЙ — тэгвэл хэрэглэгч гараар унтраасан
   * давхаргыг эффект дахин асааж, товч «ажиллахгүй» мэт болно. Хэрэглэгчийн
   * ҮЙЛДЭЛ дээр л (`toggle`) өөрчилнө.
   */
  const [visible, setVisible] = useState<string[]>(BASE_LAYERS);

  /**
   * «Давхарга» каталог нээлттэй эсэх — «Ерөнхий төлөвлөгөө» дээрх товчтой ИЖИЛ
   * зарчим. Хаалттай эхэлнэ; товч дарахад л нээгдэнэ.
   *
   * ⚠️ Тоо, өртгийн 30 хүсэлт нь каталог НЭЭГДЭХЭД л явна (`usePlanTotals`-ын
   * `enabled = layerOpen`) — дашбоард нээх бүрд дэмий цохихгүй.
   */
  const [layerOpen, setLayerOpen] = useState(false);
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const totals = usePlanTotals(zone, layerOpen, CATALOG_IDS);

  /** Нээлттэй хэсгүүдийн давхаргын жагсаалт (чарт-шүүлтгүй үеийн анхдагч) */
  const layersFor = useCallback((secs: SecKey[]) => {
    const ids = secs.flatMap((s) => SECTION_LAYERS[s]);
    return secs.length ? [...new Set([...CONTEXT_LAYERS, ...ids])] : BASE_LAYERS;
  }, []);

  const toggle = useCallback((k: SecKey) => {
    const isOpen = open.includes(k);
    const next = isOpen
      ? open.filter((x) => x !== k)
      : SECTIONS.map((s) => s.key).filter((s) => s === k || open.includes(s));
    setOpen(next);
    // Хэсэг солигдоход чарт-шүүлт хүчингүй (өөр контекст) — цэвэрлэнэ.
    setFlt(null);

    // Хэсэг(үүд) нээлттэй бол газрын зургийг тэдгээрийн холбогдох давхаргаар
    // ШҮҮНЭ: SECTION_LAYERS + барилга контекст (+ khil1 үндсэн хил always-on).
    // Юу ч нээлттэй биш бол анхдагч руу (бүс + барилга) буцна.
    setVisible(layersFor(next));
  }, [open, layersFor]);

  const clearAll = useCallback(() => {
    setOpen([]);
    setFlt(null);
    setVisible(BASE_LAYERS);
  }, []);

  /**
   * Чарт дарахад — ИЖИЛ мөрийг дахин дарвал шүүлт арилна. Давхаргын шүүлттэй
   * (`layers`) сонголт зурагт зөвхөн тэр давхаргуудыг үлдээж, арилгахад
   * нээлттэй хэсгүүдийн анхдагч давхаргууд руу буцна.
   */
  const selectFlt = useCallback((next: MapFilter) => {
    const off = !!flt && flt.sec === next.sec && flt.key === next.key;
    const val = off ? null : next;
    setFlt(val);
    setVisible(val?.layers?.length
      ? [...new Set([...CONTEXT_LAYERS, ...val.layers])]
      : layersFor(open));
  }, [flt, open, layersFor]);

  /** Үнэлгээ нь ХҮНД (бүх бүсийн орон зайн анализ) — зөвхөн 08 нээгдэхэд ачаална */
  const [prog, setProg] = useState<{ msg: string; pct: number }>({ msg: 'Хүлээж байна…', pct: 0 });
  const onProgress = useCallback((msg: string, p: number) => setProg({ msg, pct: p }), []);
  const suit = useSuitability(open.includes('suit'), onProgress);

  const pick = useCallback((attrs: Record<string, unknown> | null) => {
    if (!attrs) return;
    const zid = String(attrs[ZONE_FIELD] ?? attrs[ZONE_LAYER.zoneField ?? ''] ?? '').trim();
    if (zid && zid !== ZONE_NONE.trim()) setZone(zid);
  }, [setZone]);

  /**
   * Баганын өргөн — чирж тохируулна, `localStorage`-д үлдэнэ.
   * `null` = автомат: зүүн жагсаалт 280px, баруун талбар нээлттэй хэсгийн
   * тоогоор (CSS дотор `--cols`-оос бодогдоно).
   */
  const [railW, setRailW] = useStoredWidth('selbe:dash:rail');
  const [detailW, setDetailW] = useStoredWidth('selbe:dash:detail');

  /** Автомат үед бариулыг чирж эхлэхэд хаанаас эхлэхийг мэдэх — бодит px */
  const railRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);

  const vars: CSSProperties = {
    '--cols': open.length,
    ...(railW != null ? { '--rail-w': `${railW}px` } : {}),
    ...(detailW != null ? { '--detail-w': `${detailW}px` } : {}),
  } as CSSProperties;

  return (
    <div className={o.shell} data-detail={open.length > 0 ? '1' : '0'} style={vars}>
      <SideRail ref={railRef} d={d} suit={suit} open={open} toggle={toggle} clear={clearAll} />

      <Grip
        label="Зүүн жагсаалтын өргөн"
        measure={() => railRef.current?.offsetWidth ?? railW ?? 288}
        min={200} max={460}
        onChange={setRailW}
        onReset={() => setRailW(null)}
      />

      <main className={o.center}>
        <HeadKpi bagts={d.bagts} />

        <div className={o.hero}>
          {/* ⚠️ zone={null} байсныг заслав (2026-08-10) — бүсийн шүүлт дашбоардын
              зурагт огт хүрдэггүй байв. Одоо давхаргууд бүсээр шүүгдэж,
              noZone давхаргууд орон зайн маскаар бүдгэрнэ. */}
          <MapCanvas dim={dim} visible={visible} zone={zone} uniform onPick={pick} />

          {/* Дээд-төв toolbar — «Давхарга» товч ба 2D/3D/BIM НЭГ мөрөнд
              («Ерөнхий төлөвлөгөө»-тэй ижил). Товч дарахад каталог доор нь гарна. */}
          <div className={o.mapTools}>
            <button
              type="button"
              aria-pressed={layerOpen}
              className={`${o.mapBtn} ${layerOpen ? o.mapBtnOn : ''}`}
              onClick={() => setLayerOpen((v) => !v)}
              title="Давхаргын жагсаалт"
            >
              <Icon name="layers" size={15} />
              Давхарга
            </button>

            <div className={o.dimsInline} role="group" aria-label="Газрын зургийн харагдац">
              {(['2d', '3d', 'bim'] as Dim[]).map((x) => (
                <button key={x} type="button" aria-pressed={dim === x}
                  className={`${o.dimBtn} ${dim === x ? o.dimOn : ''}`} onClick={() => setDim(x)}>
                  {x.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Бүсийн шүүлт — тусдаа хэрэглүүр (төрлөөр бүлэглэсэн, компакт) */}
            <ZoneFilter zone={zone} setZone={setZone} variant="tool" />
          </div>

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
                  <span className={o.filterLabel}>Бүс: {zone}</span>
                  <button type="button" className={o.filterClear} onClick={() => setZone(null)} aria-label="Цуцлах">×</button>
                </div>
              )}
              {flt && (
                <div className={o.filterChip}>
                  <span className={o.filterLabel}>{flt.label}</span>
                  <button type="button" className={o.filterClear} onClick={() => selectFlt(flt)} aria-label="Цуцлах">×</button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {open.length > 0 && (
        <Grip
          label="Дэлгэрэнгүй самбарын өргөн"
          measure={() => detailRef.current?.offsetWidth ?? detailW ?? 380}
          min={320} max={1600} invert
          onChange={setDetailW}
          onReset={() => setDetailW(null)}
        />
      )}

      {open.length > 0 && (
        <aside className={o.detail} ref={detailRef} aria-label="Дэлгэрэнгүй">
          {open.map((k) => {
            const s = SECTIONS.find((x) => x.key === k)!;
            return (
              <section key={k} className={o.col}>
                <header className={o.colHd}>
                  <span className={o.colNo}>{s.no}</span>
                  <h2 className={o.colTitle}>{s.title}</h2>
                  <button type="button" className={o.colClose} onClick={() => toggle(k)} aria-label="Хаах">×</button>
                </header>
                <div className={o.colBody}>
                  <Detail k={k} d={d} suit={suit} prog={prog} zone={zone} setZone={setZone} flt={flt} onFlt={selectFlt} />
                </div>
              </section>
            );
          })}
        </aside>
      )}
    </div>
  );
}

/** Хэсэг бүрийн чарт-шүүлтийн нийтлэг props — БҮХ хэсэг ижил интерфэйстэй */
type FltProps = { flt: MapFilter | null; onFlt: (f: MapFilter) => void };

function Detail({ k, d, suit, prog, zone, setZone, flt, onFlt }: {
  k: SecKey; d: DashData;
  suit: Async<SuitSummary>; prog: { msg: string; pct: number };
  zone: string | null; setZone: (z: string | null) => void;
} & FltProps) {
  switch (k) {
    case 'scope': return <ScopeDetail bagts={d.bagts} d={d} />;
    case 'schedule': return <ScheduleDetail project={d.project} />;
    case 'bagts': return <BagtsDetail q={d.bagts} flt={flt} onFlt={onFlt} />;
    case 'land': return <LandDetail parcels={d.parcels} land={d.land} flt={flt} onFlt={onFlt} />;
    case 'network': return <NetworkDetail flt={flt} onFlt={onFlt} />;
    case 'power': return <PowerDetail flt={flt} onFlt={onFlt} />;
    case 'source': return <SourceDetail sources={d.sources} flt={flt} onFlt={onFlt} />;
    case 'finance': return <FinanceDetail budget={d.budget} />;
    case 'benefit': return <BenefitDetail bagts={d.bagts} d={d} flt={flt} onFlt={onFlt} />;
    case 'suit': return <SuitDetail suit={suit} prog={prog} zone={zone} setZone={setZone} />;
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
function railStat(k: SecKey, d: DashData, suit: Async<SuitSummary>): {
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
        value: h == null ? '…' : `${num(h.areaHa, 1)} га`,
        note: blocks == null ? '…' : `${num(blocks)} блок · ${num(ail)} өрх`,
      };
    }
    case 'schedule':
      // ⚠️ АМЬД — Төсөл_Гүйцэтгэл хүснэгтийн жигнэсэн дундаж (илтгэлийн
      //    бэхлэгдсэн 36.35% ◆-г хассан, 2026-08-13 хэрэглэгчийн шийдвэр).
      return {
        value: p == null ? '…' : pct(p.actual, 2),
        note: p == null ? '…' : `${SCHEDULE.length} үе шат · жин ${pct(p.coverage, 1)}`,
        pct: p?.actual ?? undefined, tone: o.active,
      };
    case 'bagts': {
      const bl = b ? b.reduce((a, x) => a + x.blocks, 0) : 0;
      // Амьд жигнэсэн дундаж — блокийн тоогоор жинлэсэн 7 багцын гүйцэтгэл.
      const avg = b && bl ? b.reduce((a, x) => a + (x.progress ?? 0) * x.blocks, 0) / bl : null;
      const ailSum = b ? b.reduce((a, x) => a + x.ail, 0) : null;
      return {
        value: avg == null ? '…' : pct(avg, 1),
        note: ailSum == null ? '…' : `7 багц · ${num(bl)} блок · ${num(ailSum)} өрх`,
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
        note: land == null ? '…' : `${num(land.remaining)} үлдсэн · ${num(land.total)} талбар`,
        pct: land?.pct ?? undefined, tone: o.done,
      };
    }
    case 'network': {
      // Гадна дулаан/ус/татуургын багцууд — газрын зургийн давхаргаар (Багц 5.x,
      // 7–15). Хөрөнгө оруулалтын дүн (INVEST /249) 2026-08-14-нд түр хасагдсан.
      const n = infraPackList(isNetworkPack).length;
      return { value: num(n), note: 'багц · гадна дулаан, ус · зурагт', tone: o.active };
    }
    case 'power': {
      // Цахилгааны багцууд (БАГЦ-6.x) — газрын зургийн давхаргаар. ХО-ын дүн
      // (INVEST /249) 2026-08-14-нд түр хасагдсан.
      const n = infraPackList(isPowerPack).length;
      return { value: num(n), note: 'багц · цахилгаан · зурагт', tone: o.active };
    }
    case 'source': {
      // Эх үүсвэр — нэгтгэсэн үйлчилгээнээс АМЬД (дулаан, цахилгаан, ус)
      const rows = d.sources.state === 'ready' ? d.sources.data : null;
      if (!rows) return { value: '…', note: 'татаж байна', tone: o.active };
      const types = new Set(rows.map((r) => srcStr(r[SOURCE_FS.fields.type])).filter(Boolean));
      return {
        value: `${rows.length}`,
        note: `${types.size} төрөл · дулаан, цахилгаан, ус`,
        tone: o.active,
      };
    }
    case 'finance': {
      // АМЬД — Cashflow /106: гэрээгээр баталгаажсан ÷ нийт төсөвт өртөг
      const bg = d.budget.state === 'ready' ? d.budget.data : null;
      const share = bg && bg.total ? (bg.contract / bg.total) * 100 : null;
      return {
        value: share == null ? '…' : pct(share, 1),
        note: bg == null ? '…' : `гэрээ ${num(bg.contract / 1e9, 1)} / төсөв ${num(bg.total / 1e9, 1)} тэрбум ₮`,
        pct: share ?? undefined, tone: o.active,
      };
    }
    case 'benefit': {
      // АМЬД — хүн ам (барилгуудын Population) + нийгмийн байгууламжийн тоо
      const h = d.headline.state === 'ready' ? d.headline.data : null;
      const soc = d.social.state === 'ready' ? d.social.data : null;
      return {
        value: h == null ? '…' : num(h.population),
        note: soc == null ? '…' : `${num(soc.totalN)} нийгмийн байгууламж`,
      };
    }
    case 'suit': {
      // ⚠️ 08 нээгдтэл анализ ажиллахгүй тул энд «нээж бодуулна» гэж хэлнэ
      if (suit.state === 'error') return { value: '—', note: 'бодогдсонгүй' };
      if (suit.state !== 'ready') return { value: '—', note: 'нээхэд бодогдоно' };
      const s = suit.data;
      return {
        value: s.avgScore == null ? '—' : String(Math.round(s.avgScore)),
        note: `${num(s.zones)} бүс · ашигтай ${num(s.profitZones)}`,
        pct: s.avgScore ?? undefined, tone: o.active,
      };
    }
  }
}

function SideRail({ d, suit, open, toggle, clear, ref }: {
  d: DashData; suit: Async<SuitSummary>;
  open: SecKey[]; toggle: (k: SecKey) => void; clear: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div className={o.rail} ref={ref} role="group" aria-label="Дашбоардын хэсгүүд">
      <div className={o.railHead}>
        <span>Хэсгүүд</span>
        {open.length > 0 && (
          <button type="button" className={o.railClear} onClick={clear}>Бүгдийг хаах ({open.length})</button>
        )}
      </div>

      {SECTIONS.map((s) => {
        const on = open.includes(s.key);
        const st = railStat(s.key, d, suit);
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={on}
            className={`${o.railItem} ${on ? o.railOn : ''}`}
            onClick={() => toggle(s.key)}
          >
            <span className={o.railTop}>
              <span className={o.railNo}>{s.no}</span>
              <span className={o.railTitle}>{s.title}</span>
              <b className={`${o.railVal} num`}>{st.value}</b>
            </span>
            {/* Явцын нимгэн зурвас — хувьтай хэсэгт л. Тоог уншихаас өмнө
                нүд нь зурвасын уртаар харьцуулна. */}
            {st.pct != null && (
              <span className={o.railBar}>
                <i className={st.tone} style={{ width: `${clamp(st.pct, 0, 100)}%` }} />
              </span>
            )}
            <span className={o.railNote}>{st.note}</span>
          </button>
        );
      })}
    </div>
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
    { v: h == null ? '…' : num(h.areaHa, 1), unit: 'га', label: 'Төслийн талбай' },
    {
      v: ail == null ? '…' : num(ail), unit: 'өрх',
      label: 'Өрхийн орон сууц',
      sub: blocks == null ? undefined : `${num(blocks)} блок`,
    },
    { v: h == null ? '…' : num(h.population), unit: 'хүн', label: 'Хамрагдах хүн ам' },
    {
      v: p == null ? '…' : num(p.actual, 2), unit: '%',
      label: 'Төслийн нийт гүйцэтгэл',
      sub: p == null ? undefined : `бүртгэгдсэн жин ${num(p.coverage, 1)}%`,
      lead: true,
      bar: p?.actual,
    },
    {
      v: h == null ? '…' : num(h.investTotal / 1e12, 2), unit: 'их наяд ₮',
      label: 'Төслийн нийт төсөв',
      sub: h == null ? undefined : `гэрээ байгуулсан ${num(h.investConfirmed / 1e9, 1)} тэрбум`,
    },
  ];

  return (
    <div className={o.head}>
      {tiles.map((t) => (
        <div key={t.label} className={`${o.tile} ${t.lead ? o.tileLead : ''}`}>
          <span className={o.tileVal}>
            <b className="num">{t.v}</b>
            {t.unit && <i>{t.unit}</i>}
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

function ScopeDetail({ bagts, d }: { bagts: Async<BagtsRow[]>; d: DashData }) {
  // БҮГД АМЬД (2026-08-13): бэхлэгдсэн SCOPE (74 багц · 7,500 тн нүүрс ·
  // −7.7% агаар · 16,000 ажлын байр) — эх сурвалжгүй мөрүүд ХАСАГДАВ.
  const b = bagts.state === 'ready' ? bagts.data : null;
  const blocks = b ? b.reduce((a, x) => a + x.blocks, 0) : null;
  const ail = b ? b.reduce((a, x) => a + x.ail, 0) : null;
  const h = d.headline.state === 'ready' ? d.headline.data : null;
  const soc = d.social.state === 'ready' ? d.social.data : null;
  /** Багцын тоо — барилгын 7 + газрын зургийн дэд бүтцийн багцууд (PKG_BY_BAGTS) */
  const packs = b
    ? new Set([...b.map((x) => x.key), ...Object.keys(PKG_BY_BAGTS)]).size
    : null;

  return (
    <>
      <Panel title="Төслийн цар хүрээ">
        <Stats cols={2}>
          <Stat accent color={HUE[0]} value={blocks == null ? '…' : num(blocks)} unit="блок" label="Орон сууцны блок" />
          <Stat accent color={HUE[1]} value={ail == null ? '…' : num(ail)} unit="өрх" label="Айл өрх" />
          <Stat accent color={HUE[2]} value={packs == null ? '…' : num(packs)} unit="багц" label="Нийт багц" />
          <Stat accent color={HUE[3]} value={soc == null ? '…' : num(soc.totalN)} unit="ш" label="Нийгмийн байгууламж" />
          <Stat accent color={HUE[4]} value={h?.greenHa == null ? '—' : num(h.greenHa, 1)} unit="га" label="Ногоон байгууламж" />
          <Stat accent color={HUE[5 % HUE.length]} value={h == null ? '…' : num(h.population)} unit="хүн" label="Хамрагдах хүн ам" />
        </Stats>
      </Panel>

      <Panel title="Санхүүжилтийн эх үүсвэр (төслийн төсөв)">
        <Data q={d.budget} loading="Татаж байна…">
          {(bg) => (
            <Bars
              inline
              items={bg.sources.map((s) => ({
                key: s.key,
                label: s.label,
                value: s.value,
                color: heat(s.value, maxOf(bg.sources.map((x) => x.value))),
                display: `${num(s.value / 1e9, 1)} тэрбум ₮`,
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

  return (
    <Panel title="Үндсэн үе шат">
      <Bars
        items={SCHEDULE.map((st) => {
          const v = liveStage(p, st.stages);
          return {
            key: st.no,
            label: `${st.label} · ${st.from}–${st.to}`,
            value: v ?? 0,
            display: v == null ? '—' : pct(v, v >= 1 ? 1 : 0),
            color: v == null ? '#94a3b8' : heat(v, 100),
          };
        })}
      />
    </Panel>
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
const HUE = shades('#0ea5e9', 8);
/**
 * ДАШБОАРДЫН НЭГ ӨНГӨ — бүх багана/зүсмэг энэ sky акцентын ТОДООС БҮДГЭР
 * уусгалтаар өнгөтэй (хэрэглэгчийн хүсэлт: солонго биш нэг өнгө). Их утга тод,
 * бага утга бүдэг. `heat(v, max)` нь энэ дүрмийг чартад хэрэглэнэ.
 */
const ACCENT = '#0ea5e9';
/** Утга → нэг өнгөний сүүдэр (их=тод). max≤0 бол суурь өнгө. */
const heat = (v: number, max: number) => tint(ACCENT, max > 0 ? v / max : 1);
/** Массивын хамгийн их эерэг утга (0-т хуваахаас хамгаална) */
const maxOf = (arr: number[]) => Math.max(1, ...arr);

function BagtsDetail({ q, flt, onFlt }: { q: Async<BagtsRow[]> } & FltProps) {
  const sel = flt?.sec === 'bagts' ? flt.key : null;
  return (
    <Data q={q} loading="Гурван эх сурвалжийг нэгтгэж байна…">
      {(rows) => {
        const blocks = rows.reduce((a, x) => a + x.blocks, 0);
        const ail = rows.reduce((a, x) => a + x.ail, 0);
        const avg = blocks ? rows.reduce((a, x) => a + (x.progress ?? 0) * x.blocks, 0) / blocks : null;
        /** Багц дарахад — газрын зурагт тэр багцын блокуудыг тодруулна */
        const pick = (key: string) => {
          const r = rows.find((x) => x.key === key);
          if (!r) return;
          onFlt({
            sec: 'bagts', key, label: `Багц: ${r.label}`,
            where: `${BF.bagts} = '${sq(r.label)}'`, only: ['mon:building'],
          });
        };
        return (
          <>
            <Panel title="Нийт гүйцэтгэл">
              <div className={o.landTop}>
                <Ring value={avg} size={104} width={17} color="#38bdf8" label="дундаж гүйцэтгэл" />
                <Stats cols={2}>
                  <Stat accent color="#38bdf8" value={num(blocks)} unit="блок" label="Барилгын блок" />
                  <Stat accent color="#34d399" value={num(ail)} unit="өрх" label="Орон сууц" />
                </Stats>
              </div>
            </Panel>

            <Panel title="Багц бүрийн явц">
              <Bars
                inline
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

            <Panel title="Багц бүрийн орон сууц">
              <Bars
                inline
                selected={sel}
                onSelect={pick}
                items={rows.map((r) => ({
                  key: r.key,
                  label: r.label,
                  value: r.ail,
                  display: `${num(r.ail)} өрх`,
                  color: heat(r.ail, maxOf(rows.map((x) => x.ail))),
                }))}
              />
            </Panel>

            {/* «Багц бүрийн төсөв» panel 2026-08-13-нд хасагдав — BUS_cashflow
                үйлчилгээ устаж, багцын төсвийн бодит эх сурвалж алга. */}
            {/* ГҮЙЦЭТГЭГЧИЙН БҮРЭЛДЭХҮҮН — амьд (блок/өрхөөс), BAGTS_ORIGIN нь
                зөвхөн Гадаад/Үндэсний гэсэн ангилал (тоо биш). */}
            <Panel title="Гүйцэтгэгчийн бүрэлдэхүүн">
              {(() => {
                const nat = rows.filter((r) => BAGTS_ORIGIN[r.label.trim()] === 'Үндэсний');
                const natBlocks = nat.reduce((a, x) => a + x.blocks, 0);
                const natAil = nat.reduce((a, x) => a + x.ail, 0);
                const allBlocks = rows.reduce((a, x) => a + x.blocks, 0);
                const allAil = rows.reduce((a, x) => a + x.ail, 0);
                const p100 = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
                return (
                  <Stats cols={3}>
                    <Stat accent color={HUE[0]} value={`${p100(nat.length, rows.length)}%`}
                      label={`Үндэсний багц (${num(nat.length)}/${num(rows.length)})`} />
                    <Stat accent color={HUE[1]} value={`${p100(natBlocks, allBlocks)}%`}
                      label={`Блокийн эзлэх (${num(natBlocks)}/${num(allBlocks)})`} />
                    <Stat accent color={HUE[2]} value={`${p100(natAil, allAil)}%`}
                      label={`Өрхийн эзлэх (${num(natAil)}/${num(allAil)})`} />
                  </Stats>
                );
              })()}
            </Panel>
          </>
        );
      }}
    </Data>
  );
}

/* ══════════════════ 04 · Газар чөлөөлөлт ══════════════════ */

/** «гэрээлсэн.» ба «гэрээлсэн» нэг ангилал; хоосон → нэртэй */
const cleanProgress = (v: string) => {
  const s = v.trim().replace(/\.$/, '');
  return s === '' || s === '—' ? 'Тодорхойгүй' : s;
};

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
      <Panel title="Нэгж талбарын гүйцэтгэл">
        <Data q={land} loading="Татаж байна…">
          {(ls) => (
            <>
              <div className={o.landTop}>
                <Ring value={ls.pct} size={104} width={17} color="#34d399" label="чөлөөлсөн" />
                <Stats cols={2}>
                  <Stat accent color="#38bdf8" value={num(ls.total)} unit="талбар" label="Нийт нэгж талбар" />
                  <Stat accent color="#34d399" value={num(ls.cleared)} unit="талбар" label="Бүрэн чөлөөлсөн" />
                  <Stat accent color="#a78bfa" value={num(ls.cleaned)} unit="талбар" label="Цэвэрлэсэн" />
                  <Stat accent color="#f87171" value={num(ls.remaining)} unit="талбар" label="Үлдсэн" />
                </Stats>
              </div>
              <Bars
                inline
                items={[...ls.byStatus].sort((a, b) => b.n - a.n).map((x) => ({
                  key: x.label,
                  label: x.label,
                  value: x.n,
                  display: `${num(x.n)} талбар`,
                  color: heat(x.n, maxOf(ls.byStatus.map((y) => y.n))),
                }))}
              />
            </>
          )}
        </Data>
      </Panel>

      {/* ⚠️ Пай диаграмаас БАГАНАН болгов: 10 ангилалтай пай нь зүсмэгүүд нь
          хэт нарийсч, ойролцоо хэмжээтэйг нь нүдээр ялгах боломжгүй болдог.
          Багана нь ижил суурьтай тул урт нь шууд харьцуулагдана. */}
      <Panel title="Газар чөлөөлөлтийн одоогийн төлөв">
        <Data q={parcels} loading="Татаж байна…">
          {(rows) => {
            const by = new Map<string, number>();
            /** Цэвэрлэсэн ангилал → ТҮҮХИЙ утгууд (шүүлтийн WHERE-д яг таарна) */
            const raws = new Map<string, Set<string>>();
            for (const x of rows) {
              const rv = text(x[PL.progress]);
              const k = cleanProgress(rv);
              by.set(k, (by.get(k) ?? 0) + 1);
              if (!raws.has(k)) raws.set(k, new Set());
              raws.get(k)!.add(String(x[PL.progress] ?? ''));
            }
            const arr = [...by.entries()].sort((a, b) => b[1] - a[1]);
            const mx = maxOf(arr.map(([, n]) => n));
            const items = arr.map(([label, n]) => ({
              key: label, label, value: n, display: `${num(n)} талбар`,
              color: heat(n, mx),
            }));
            /** Ангилал дарахад — тэр төлөвтэй талбаруудыг зурагт тодруулна */
            const pick = (label: string) => {
              const vs = [...(raws.get(label) ?? [])].filter((v) => v.trim() !== '');
              const eq = vs.map((v) => `${PL.progress} = '${sq(v)}'`);
              // «Тодорхойгүй» = хоосон/null утгууд ч мөн орно
              if (label === 'Тодорхойгүй') eq.push(`${PL.progress} IS NULL`, `${PL.progress} = ''`);
              if (!eq.length) return;
              onFlt({
                sec: 'land', key: label, label: `Төлөв: ${label}`,
                where: eq.join(' OR '), only: ['land:left'],
              });
            };
            return (
              <>
                <Bars inline items={items} selected={sel} onSelect={pick} />
                <Stats cols={2}>
                  <Stat accent color="#38bdf8" value={num(rows.length)} unit="талбар" label="Нийт бүртгэл" />
                  <Stat accent color="#a78bfa" value={num(items.length)} unit="ангилал" label="Ангилал" />
                </Stats>
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
 * Ажлын нэр → холбогдох давхаргууд. Ажил нь давхаргатай НЭРЭЭР холбогдоно
 * (амьд түлхүүр талбар байхгүй) — олдохгүй бол тэр мөр шүүлтгүй (no-op).
 */

/**
 * Гадна дулаан/ус/татуургын багцууд — газрын зургийн давхаргаар (Багц 5.x, 7–15).
 * Багц дарахад зурагт тэр багцын давхаргууд л үлдэнэ. (Хөрөнгө оруулалтын дүн
 * INVEST /249-д байсан нь 2026-08-14-нд түр хасагдсан.)
 */
function NetworkDetail({ flt, onFlt }: FltProps) {
  const sel = flt?.sec === 'network' ? flt.key : null;
  const items = infraPackList(isNetworkPack);
  const pick = (key: string) => {
    const ids = PKG_BY_BAGTS[key] ?? [];
    if (ids.length) onFlt({ sec: 'network', key, label: `Багц: ${key}`, layers: ids });
  };
  return (
    <Panel title="Гадна ус, дулааны багцууд">
      {!items.length ? (
        <Empty label="Багцын давхарга алга." />
      ) : (
        <>
          <p className={o.note}>
            {num(items.length)} багц. Багц дарж газрын зурагт шүүнэ. Хөрөнгө
            оруулалтын дүн эх өгөгдөл тодруулагдсаны дараа нэмэгдэнэ.
          </p>
          <Bars
            inline
            selected={sel}
            onSelect={pick}
            items={items.map((w) => ({
              key: w.key,
              label: w.label,
              value: w.ids.length,
              display: `${num(w.ids.length)} давхарга`,
              color: '#0ea5e9',
            }))}
          />
        </>
      )}
    </Panel>
  );
}

/* ══════════════════ 06 · Цахилгаан ══════════════════ */

/**
 * Цахилгааны багцууд (БАГЦ-6.x) — газрын зургийн давхаргаар. Багц дарахад зурагт
 * тэр багцын давхаргууд л үлдэнэ. (ХО-ын дүн INVEST /249-д байсан нь 2026-08-14-нд
 * түр хасагдсан.)
 */
function PowerDetail({ flt, onFlt }: FltProps) {
  const sel = flt?.sec === 'power' ? flt.key : null;
  const items = infraPackList(isPowerPack);
  const pick = (key: string) => {
    const ids = PKG_BY_BAGTS[key] ?? [];
    if (ids.length) onFlt({ sec: 'power', key, label: `Багц: ${key}`, layers: ids });
  };
  return (
    <Panel title="Гадна цахилгаан (БАГЦ-6)">
      {!items.length ? (
        <Empty label="Багцын давхарга алга." />
      ) : (
        <>
          <p className={o.note}>
            {num(items.length)} багц. Багц дарж газрын зурагт шүүнэ. Хөрөнгө
            оруулалтын дүн эх өгөгдөл тодруулагдсаны дараа нэмэгдэнэ.
          </p>
          <Bars
            inline
            selected={sel}
            onSelect={pick}
            items={items.map((w) => ({
              key: w.key,
              label: w.label,
              value: w.ids.length,
              display: `${num(w.ids.length)} давхарга`,
              color: '#0ea5e9',
            }))}
          />
        </>
      )}
    </Panel>
  );
}

/* ══════════════════ 07 · Эх үүсвэр ══════════════════ */

const srcNum = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const srcStr = (v: unknown) => String(v ?? '').replace(/​/g, '').trim();

function SourceDetail({ sources, flt, onFlt }: { sources: Async<Row[]> } & FltProps) {
  const F = SOURCE_FS.fields;
  const sel = flt?.sec === 'source' ? flt.key : null;
  /**
   * Байгууламж дарахад — зурагт тэр байгууламжийг тодруулна. Нэрийн төгсгөлд
   * үл үзэгдэх тэмдэгт (ZWSP) байдаг тул `=` биш `LIKE 'нэр%'`-ээр жишинэ.
   */
  const pick = (name: string) => {
    if (!name || name.startsWith('#')) return;
    onFlt({
      sec: 'source', key: name, label: `Эх үүсвэр: ${name}`,
      where: `${F.name} LIKE '${sq(name)}%'`, only: ['source:eh'],
    });
  };
  return (
    <Data q={sources} loading="Эх үүсвэрийн мэдээллийг татаж байна…">
      {(rows) => {
        const types = [...new Set(rows.map((r) => srcStr(r[F.type])))].filter(Boolean);
        // ⚠️ Үйлчилгээ 0 мөр буцаавал баганад толгойноос өөр юу ч гарахгүй —
        //    хэрэглэгч «эвдэрсэн» гэж ойлгохгүйн тулд хоосон төлөвөө ил хэлнэ.
        if (!types.length) return <Empty label="Эх үүсвэрийн бүртгэл хоосон байна." />;
        return (
          <>
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
                    centerLabel="байгууламж"
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
                    const unit = type.includes('Ус') ? 'м³/хон' : 'МВт';
                    const consTotal = cons.reduce((a, c) => a + c.value, 0);
                    return (
                      <>
                        <p className={o.note}>
                          Хэрэглэгчид хуваарилсан хүчин чадал — нийт <b>{num(consTotal, 1)} {unit}</b>:
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
          </>
        );
      }}
    </Data>
  );
}

/* ══════════════════ 06 · Санхүүжилт, бонд ══════════════════ */

/**
 * ТӨСВИЙН ЭХ = Cashflow /106 (CASHFLOW2) — захирамж/гэрээгээр баталгаажсан
 * ТӨСЛИЙН төсөв (2026-08-14, хэрэглэгчийн шийдвэр). Санхүүгийн ганц зөв эх нь
 * Cashflow. «Хөрөнгө оруулалт өртөг» /249 бүхэлдээ түр хасагдсан.
 */
function FinanceDetail({ budget }: { budget: Async<Budget> }) {
  return (
    <Data q={budget} loading="Татаж байна…">
      {(bg) => (
        <>
          <Panel title="Гол үзүүлэлт">
            <Stats cols={2}>
              <Stat accent color={HUE[0]} value={num(bg.total / 1e12, 2)} unit="их наяд ₮" label="Төслийн нийт төсөвт өртөг" />
              <Stat accent color={HUE[1]} value={num(bg.orderTotal / 1e9, 1)} unit="тэрбум ₮" label="Захирамжийн нийт дүн" />
              <Stat accent color={HUE[2]} value={num(bg.contract / 1e9, 1)} unit="тэрбум ₮" label="Гэрээ байгуулсан дүн" />
            </Stats>
          </Panel>

          <Panel title="Санхүүжилтийн эх үүсвэр (захирамжаар)">
            <Donut
              items={bg.sources.map((s, i) => ({
                key: s.key, label: s.label, value: s.value,
                color: shade(ACCENT, i, bg.sources.length),
                display: `${num(s.value / 1e9, 1)} тэрбум`,
              }))}
              center={num(bg.orderTotal / 1e9, 1)} centerLabel="тэрбум ₮" size={150} width={24} stack
            />
          </Panel>
        </>
      )}
    </Data>
  );
}

/* ══════════════════ 07 · Үр өгөөж ══════════════════ */

/** Нийгмийн ангилал → давхаргын нэрийн дэд текст (амьд loadSocial-ийн нэршлээр) */
const SOC_MATCH: Record<string, string[]> = {
  'Сургууль': ['сургууль'],
  'Цэцэрлэг': ['цэцэрлэг'],
  'Хүүхдийн урлан бүтээх төв': ['урлан'],
  'Төрийн үйлчилгээ': ['төрийн үйлчилгээ'],
};

/**
 * БҮХ ТОО АМЬД. Илтгэлийн BENEFITS/PUBLIC_ZONE/SOCIAL хатуу мөрүүд хасагдаж,
 * үлдсэн нь үйлчилгээнээс бодогдоно (headline/social нь `d`-гээс).
 * ⚠️ EXPORT — «Иргэдэд хүрэх үр өгөөж» (`Irged.tsx`) дахин ашиглаж болохоор.
 */
export function BenefitDetail({ bagts, d, flt, onFlt }: { bagts: Async<BagtsRow[]>; d: DashData } & FltProps) {
  const ail = bagts.state === 'ready' ? bagts.data.reduce((a, x) => a + x.ail, 0) : null;
  const h = d.headline.state === 'ready' ? d.headline.data : null;
  const soc = d.social.state === 'ready' ? d.social.data : null;
  const sel = flt?.sec === 'benefit' ? flt.key : null;
  /** Ангилал дарахад — зурагт тэр төрлийн барилгын давхаргууд л үлдэнэ */
  const pick = (key: string) => {
    const subs = SOC_MATCH[key];
    const ids = subs ? layersByTitle(subs).filter((id) => id.startsWith('pkg:')) : [];
    if (ids.length) onFlt({ sec: 'benefit', key, label: `Нийгэм: ${key}`, layers: ids });
  };

  return (
    <>
      <Panel title="Иргэдийн амьдралын чанар">
        <Stats cols={2}>
          <Stat accent color={HUE[0]} value={h == null ? '…' : num(h.population)} unit="хүн" label="Шинэ орон сууцанд амьдрах хүн ам" />
          <Stat accent color={HUE[1]} value={ail == null ? '…' : num(ail)} unit="өрх" label="Айл өрх шинэ орон сууцтай" />
          <Stat accent color={HUE[2]} value={soc == null ? '…' : num(soc.totalN)} unit="ш" label="Нийгмийн үйлчилгээний барилга" />
          <Stat accent color={HUE[3]} value={h?.greenHa == null ? '—' : num(h.greenHa, 1)} unit="га" label="Ногоон байгууламж" />
        </Stats>
      </Panel>

      <Panel title="Нийгмийн дэд бүтэц · шинээр">
        {soc == null ? <Empty label="Татаж байна…" /> : (
          <Bars
            inline
            selected={sel}
            onSelect={pick}
            items={soc.rows.map((r, i) => ({
              key: r.label,
              label: r.label,
              value: r.n,
              display: r.capacity != null
                ? `${num(r.n)} ш · ${num(r.capacity)} хүчин чадал`
                : `${num(r.n)} ш`,
              color: HUE[i % HUE.length],
            }))}
          />
        )}
      </Panel>
    </>
  );
}

/* ══════════════════ 08 · Тохиромжтой байдлын үнэлгээ ══════════════════ */

/**
 * ⚠️ Бүх тоо АМЬД — бэхлэгдсэн үзүүлэлт энд БАЙХГҮЙ. Үнэлгээ нь бүсийн
 * геометр, ногоон байгууламж, зогсоол, дэд бүтцийн өртгөөс тухай бүр бодогддог.
 */
function SuitDetail({ suit, prog, zone, setZone }: {
  suit: Async<SuitSummary>; prog: { msg: string; pct: number };
  zone: string | null; setZone: (z: string | null) => void;
}) {
  if (suit.state === 'loading') {
    return (
      <Panel title="Тохиромжтой байдал">
        <div className={o.load}>
          <div className={o.loadMsg}>{prog.msg}</div>
          <div className={o.loadBar}><span style={{ width: `${Math.max(4, prog.pct)}%` }} /></div>
        </div>
      </Panel>
    );
  }
  if (suit.state === 'error') {
    return <Panel title="Тохиромжтой байдал"><p className={o.note}>Үнэлгээ бодогдсонгүй: {suit.error.message}</p></Panel>;
  }

  const s = suit.data;
  const head = zone ? s.byId[zone]?.score ?? null : s.avgScore;
  const scored = s.ranked.filter((r) => r.score != null);

  return (
    <>
      <Panel title="Нийлмэл оноо">
        <div className={o.landTop}>
          <span className={o.bigScore} style={{ color: scoreColor(head) }}>{head == null ? '—' : Math.round(head)}</span>
          <div className={o.rows}>
            <div><span>Үнэлгээ</span><b>{scoreLabel(head)}</b></div>
            <div><span>Ашигтай бүс</span><b className="num">{num(s.profitZones)} / {num(s.zones)}</b></div>
            {s.noData > 0 && (
              <div><span>Өгөгдөлгүй</span><b className="num" style={{ color: NO_DATA_COLOR }}>{num(s.noData)} бүс</b></div>
            )}
          </div>
        </div>
        {/* Түвшний тархалт — порталын бусад дашбоардтай ИЖИЛ `Bars` primitive.
            Урьд нь өөрийн CSS бартай байсан нь ижил өгөгдлийг өөр дүрслэлээр
            харуулж, нэгдмэл байдлыг алдагдуулж байв. */}
        <Bars
          max={Math.max(1, s.zones)}
          items={s.levels.map((l, i) => ({
            key: l.label,
            label: l.label,
            value: l.n,
            display: `${num(l.n)} бүс`,
            // НЭГ ӨНГӨ (тодоос бүдгэр) — «Маш сайн» тод → «Маш муу» бүдэг
            color: shade(ACCENT, i, s.levels.length),
          }))}
        />
      </Panel>

      <Panel title="Бүсийн эрэмбэ">
        <div className={o.rankGroup}>
          <div className={o.rankLabel}>Хамгийн сайн</div>
          {scored.slice(0, 5).map((r, i) => <RankRow key={r.id} r={r} n={i + 1} zone={zone} setZone={setZone} />)}
          <div className={o.rankLabel}>Хамгийн муу</div>
          {scored.slice(-5).reverse().map((r, i) => <RankRow key={r.id} r={r} n={scored.length - i} zone={zone} setZone={setZone} />)}
        </div>
      </Panel>
    </>
  );
}

function RankRow({ r, n, zone, setZone }: {
  r: { id: string; type: string; score: number | null };
  n: number; zone: string | null; setZone: (z: string | null) => void;
}) {
  const on = zone === r.id;
  return (
    <button type="button" aria-pressed={on} className={`${o.rankRow} ${on ? o.rankOn : ''}`}
      onClick={() => setZone(on ? null : r.id)}>
      <span className={o.rankNo}>{n}</span>
      <span className={o.rankName}>{r.id}<i>{r.type}</i></span>
      <span className={`${o.rankScore} num`} style={{ background: scoreColor(r.score) }}>
        {r.score == null ? '—' : Math.round(r.score)}
      </span>
    </button>
  );
}
