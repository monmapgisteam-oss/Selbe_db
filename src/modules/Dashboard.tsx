'use client';

import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode, type Ref,
} from 'react';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Donut, Ring, Bars, Data } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { LayerCatalog } from '@/components/LayerCatalog';
import { useAsync, type Async } from '@/lib/useAsync';
import { usePlanTotals } from '@/lib/totals';
import { queryFeatures, type Row } from '@/lib/query';
import {
  ZONE_LAYER, ZONE_FIELD, ZONE_NONE, ZONE_TYPE_EMPTY_HUE, BUILT_LAYER, BUILDING,
  LAYER_BY_ID, PARCEL_LEFT, PROJECT_PROGRESS, PARCEL_PROGRESS_HUES,
  PLAN_LAYER_IDS, MONITOR_LAYER_IDS,
  PKG_BY_FAMILY, bagtsKey, buildingKey,
} from '@/lib/services';
import {
  INDICATORS, SCORE_LEVELS, levelOf, PARKING, DEFAULT_ECON_SHARE,
  BUILD_COST_PER_M2, NO_DATA_COLOR, profitScore,
} from '@/lib/analysis/config';
import { loadAnalysisCached, computeEconomics, computeRaw, defaultGreenCats } from '@/lib/analysis/data';
import { loadCostsCached } from '@/lib/analysis/costs';
import { urbanScore, scoreColor, scoreLabel } from '@/lib/analysis/score';
import { loadBlockProgress, type BlockProgressMap } from '@/lib/blockProgress';
import { useCashflow, type CashRow } from '@/lib/cashflow';
import { useInvest, type InvRow } from '@/lib/invest';
import { num, pct, text } from '@/lib/format';
import {
  BRIEF_SOURCE, HEADLINE, OVERALL, SCOPE, INVEST_SPLIT, MILESTONES,
  SCHEDULE, SCHEDULE_YEARS, SCHEDULE_TODAY, BAGTS_ORIGIN, BAGTS_FLAG, BAGTS_NOTE, BAGTS_STRIP,
  LAND, SOURCES, UTILITY_WORKS, POWER_PACKS, POWER_NOTE, FINANCE, SOCIAL, BENEFITS, PUBLIC_ZONE,
} from '@/lib/brief';
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

type SecKey = 'scope' | 'schedule' | 'bagts' | 'land' | 'source' | 'finance' | 'benefit' | 'suit';

const SECTIONS: { key: SecKey; no: string; title: string }[] = [
  { key: 'scope', no: '01', title: 'Төслийн цар хүрээ' },
  { key: 'schedule', no: '02', title: 'Хэрэгжилтийн ерөнхий график' },
  { key: 'bagts', no: '03', title: 'Орон сууцны 7 багц' },
  { key: 'land', no: '04', title: 'Газар чөлөөлөлтийн одоогийн төлөв' },
  { key: 'source', no: '05', title: 'Эх үүсвэр, шугам сүлжээ' },
  { key: 'finance', no: '06', title: 'Хөрөнгө оруулалт, бонд' },
  { key: 'benefit', no: '07', title: 'Иргэдэд хүрэх үр өгөөж' },
  { key: 'suit', no: '08', title: 'Тохиромжтой байдлын үнэлгээ' },
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
  /**
   * Газар чөлөөлөлтийн хоёр давхарга.
   * ⚠️ ЭНД БИЧСЭН ДАРААЛАЛ нь зурагдах дарааллыг ТОДОРХОЙЛОХГҮЙ — z-эрэмбийг
   * `LAYERS` массивын дараалал шийднэ (тэнд `land:clean` нь `land:left`-ээс
   * өмнө байгаа тул чөлөөлөгдөөгүй талбар дээр зурагдана). Энд зөвхөн
   * тайлбарын дараалалд нөлөөлнө.
   */
  land: ['land:left', 'land:clean'],
  // Гадна инженер: сүлжээ (Багц 5) · цахилгаан (Багц 6) · эх үүсвэр (Багц 7–15)
  source: [...(PKG_BY_FAMILY.net ?? []), ...(PKG_BY_FAMILY.pow ?? []), ...(PKG_BY_FAMILY.src ?? [])],
  finance: [],
  // Нийгмийн барилгууд — сургууль, цэцэрлэг, соёл, спорт (Багц 19–21)
  benefit: [...(PKG_BY_FAMILY.soc ?? [])],
  // Үнэлгээ нь БҮСЭЭР бодогддог
  suit: [ZONE_LAYER.id],
};

/** Дашбоард нээгдэхэд асаалттай давхаргууд */
const BASE_LAYERS = [ZONE_LAYER.id, BUILT_LAYER.id];

/**
 * «Давхарга» каталогт харуулах давхаргууд — «Ерөнхий төлөвлөгөө»-тэй ИЖИЛ
 * жагсаалт дээр хяналтын багцыг нэмнэ (дашбоард `mon:building`-ийг гүйцэтгэлд
 * ашигладаг тул каталогт ч харагдах ёстой). `catalogGroups('monitor')`-той
 * ижил дараалал.
 */
const CATALOG_IDS = [...MONITOR_LAYER_IDS, ...PLAN_LAYER_IDS];

/* ══════════════════ Бэхлэгдсэн үзүүлэлтийн тэмдэглэгээ ══════════════════ */

/** ◆ — «энэ тоо ArcGIS-ээс ирээгүй» */
function Pin({ note }: { note?: string }) {
  return (
    <abbr className={o.pin} title={note ? `${note} · ${BRIEF_SOURCE}` : `Бэхлэгдсэн үзүүлэлт · ${BRIEF_SOURCE}`}>
      ◆
    </abbr>
  );
}

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
const PP = PROJECT_PROGRESS.fields;

export type BagtsRow = {
  key: string;
  label: string;
  blocks: number;
  ail: number;
  /** Урьдчилсан төсөвт өртөг, ₮ (BUS_cashflow · A5) */
  budget: number;
  contractor: string;
  /** Гадаад / Үндэсний — илтгэлээс бэхлэгдсэн */
  origin: string;
  /**
   * Барилга угсралтын гүйцэтгэл (%) — «Гүйцэтгэл бөглөх» хуудасны «Б.» мөрөөр.
   * ⚠️ Хуваарь нь БҮХ блок (тайлангүйг 0%). Зөвхөн тайлагнасан блокоор
   * дундажлавал шинэ багц бүртгэгдэх бүрд дүн нь БУУНА.
   */
  progress: number | null;
  /** Тайлан ирээгүй блокийн тоо */
  missing: number;
};

/**
 * ОРОН СУУЦНЫ 7 БАГЦ — гурван өгөгдлийн сангийн нийлбэр.
 *
 *   `building_GOL`  → блок, өрх (BAGTS · BLOK · AIL_TOO)
 *   `BUS_cashflow`  → төсөв, гүйцэтгэгч (A5 · C2)
 *   `Selbe_guitsetgel_consolidated` → «Б.» мөрийн бодит гүйцэтгэл
 *
 * ⚠️ Багцын нэр гурвуулаа өөр бичиглэлтэй («Багц 4.1» / «Багц-4.1» / «Багц 4-1»)
 * тул ЗӨВХӨН `bagtsKey()`-ээр жишинэ.
 *
 * ⚠️ Гүйцэтгэлийг давхаргын `GUITS_HV`-ээс АВАХГҮЙ: тэр талбар хуучирсан бөгөөд
 * илтгэлийн дүнгээс 5–14 нэгжээр зөрдөг («Багц 3.2» тэнд 9.25%, бодитоор
 * 24.50%). `loadBlockProgress()` нь «Барилгын хяналт»-ын ашигладаг ЯГ ижил
 * тооцоо — хоёр харагдац ижил тоо харуулна.
 */
export function useBagtsTable(): Async<BagtsRow[]> {
  const cash = useCashflow();
  const cashReady = cash.state === 'ready' ? cash.data : null;
  return useAsync(async () => {
    if (!cashReady) return new Promise<BagtsRow[]>(() => {});
    const [blocks, prog] = await Promise.all([
      queryFeatures(BUILDING.url, { outFields: [BUILDING.oid, BF.bagts, BF.block, BF.households] }),
      loadBlockProgress(),
    ]);
    return joinBagts(blocks, cashReady, prog);
  }, [cashReady]);
}

function joinBagts(blocks: Row[], cash: CashRow[], prog: BlockProgressMap): BagtsRow[] {
  const by = new Map<string, BagtsRow & { sum: number }>();
  const slot = (name: string) => {
    const k = bagtsKey(name);
    const cur = by.get(k) ?? {
      key: k, label: name, blocks: 0, ail: 0, budget: 0, contractor: '—',
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
    const cell = prog.get(buildingKey(b[BF.bagts], b[BF.block]));
    if (cell) s.sum += cell.overall;
    else s.missing += 1;
  }
  // Санхүү нь блокийн дараа — багцын нэрийг блокийн бичиглэлээр үлдээнэ
  for (const r of cash) {
    const s = by.get(bagtsKey(r.zone));
    if (!s) continue;
    s.budget += r.budget;
    if (r.contractor) s.contractor = r.contractor;
  }

  return [...by.values()]
    .map(({ sum, ...s }) => ({ ...s, progress: s.blocks ? sum / s.blocks : null }))
    .sort((a, b) => a.label.localeCompare(b.label, 'mn'));
}

/* ── Төслийн жигнэсэн гүйцэтгэл (Төсөл_Гүйцэтгэл · 162 мөр) ── */

type StageAgg = { weight: number; actual: number; rows: number };
type ProjectProgress = {
  /** Жигнэсэн гүйцэтгэл — БОДИТ жингийн нийлбэрт нормчилсон (%) */
  actual: number;
  /** Хүснэгтэд бүртгэгдсэн нийт жин (%) — 100 БИШ, 81.53 */
  coverage: number;
  byStage: Record<string, StageAgg>;
};

/**
 * ⚠️ Жигнэсэн дүнг `Σ(жин × гүйц) / Σжин` гэж бодно, 100-д ХУВААХГҮЙ:
 * `Төсөлд_эзлэх_хувь`-ийн нийлбэр 81.53%. 100-д хуваавал 22.5% гэж гарч, бодит
 * 27.65%-иас чимээгүй бага харагдана.
 */
function useProjectProgress(): Async<ProjectProgress> {
  return useAsync(async () => {
    const rows = await queryFeatures(PROJECT_PROGRESS.url, {
      outFields: [PP.stage, PP.weight, PP.actual],
      limit: 2000,
    });
    const w = (r: Row) => Number(r[PP.weight]) || 0;
    const a = (r: Row) => Number(r[PP.actual] ?? 0) || 0;

    const byStage: Record<string, StageAgg & { wa: number }> = {};
    for (const r of rows) {
      const k = text(r[PP.stage], '').trim();
      (byStage[k] ??= { weight: 0, actual: 0, rows: 0, wa: 0 });
      byStage[k].weight += w(r);
      byStage[k].wa += w(r) * a(r);
      byStage[k].rows += 1;
    }
    const coverage = rows.reduce((acc, r) => acc + w(r), 0);
    return {
      actual: coverage > 0 ? rows.reduce((acc, r) => acc + w(r) * a(r), 0) / coverage : 0,
      coverage,
      byStage: Object.fromEntries(
        Object.entries(byStage).map(([k, v]) => [k, { weight: v.weight, rows: v.rows, actual: v.weight > 0 ? v.wa / v.weight : 0 }]),
      ),
    };
  }, []);
}

/** Илтгэлийн үе шатыг амьд хүснэгтийн мөрүүдэд буулгаж жигнэнэ */
function liveStage(p: ProjectProgress | null, stages: string[]): { actual: number; weight: number } | null {
  if (!p || !stages.length) return null;
  let w = 0, wa = 0;
  for (const s of stages) {
    const agg = p.byStage[s];
    if (!agg) continue;
    w += agg.weight;
    wa += agg.weight * agg.actual;
  }
  return w > 0 ? { actual: wa / w, weight: w } : null;
}

function useLeftParcels(): Async<Row[]> {
  return useAsync(() => queryFeatures(PARCEL_LEFT.url, { outFields: [PL.progress, PL.block] }), []);
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
  invest: Async<InvRow[]>;
};

/* ══════════════════ Үндсэн компонент ══════════════════ */

const bn = (v: number) => num(v / 1e9, 1);

export function Dashboard({ dim, setDim, zone, setZone }: {
  dim: Dim; setDim: (d: Dim) => void; zone: string | null; setZone: (z: string | null) => void;
}) {
  const d: DashData = {
    bagts: useBagtsTable(),
    project: useProjectProgress(),
    parcels: useLeftParcels(),
    invest: useInvest(),
  };
  const { setHighlight } = useMap();
  useEffect(() => { setHighlight(null); }, [setHighlight]);

  /**
   * Нээлттэй хэсгүүд — ОЛОН сонголт. Дараалал нь ДАРСАН дараалал биш,
   * `SECTIONS`-ийн дараалал: баганууд 01→07 тогтмол эрэмбэтэй байх нь
   * хэрэглэгчид уншихад тогтвортой.
   */
  const [open, setOpen] = useState<SecKey[]>([]);

  /**
   * Газрын зурагт асаалттай давхаргууд. Хэсэг нээх/хаах нь холбогдох давхаргыг
   * нэмж/хасна; давхаргын жагсаалтаас гараар ч асааж болно.
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

  const toggle = useCallback((k: SecKey) => {
    const isOpen = open.includes(k);
    setOpen(isOpen
      ? open.filter((x) => x !== k)
      : SECTIONS.map((s) => s.key).filter((s) => s === k || open.includes(s)));
    const ids = SECTION_LAYERS[k];
    if (!ids.length) return;
    setVisible((v) => (isOpen
      ? v.filter((id) => !ids.includes(id) || BASE_LAYERS.includes(id))
      : [...new Set([...v, ...ids])]));
  }, [open]);

  const clearAll = useCallback(() => {
    setOpen([]);
    setVisible(BASE_LAYERS);
  }, []);

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
        <HeadKpi d={d} />

        <div className={o.hero}>
          <MapCanvas dim={dim} visible={visible} zone={null} uniform onPick={pick} />

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

          {zone && (
            <div className={o.chipBar}>
              <div className={o.filterChip}>
                <span className={o.filterLabel}>Бүс: {zone}</span>
                <button type="button" className={o.filterClear} onClick={() => setZone(null)} aria-label="Цуцлах">×</button>
              </div>
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
                  <LayerLink k={k} visible={visible} />
                  <Detail k={k} d={d} suit={suit} prog={prog} zone={zone} setZone={setZone} />
                </div>
              </section>
            );
          })}
        </aside>
      )}
    </div>
  );
}

function Detail({ k, d, suit, prog, zone, setZone }: {
  k: SecKey; d: DashData;
  suit: Async<SuitSummary>; prog: { msg: string; pct: number };
  zone: string | null; setZone: (z: string | null) => void;
}) {
  switch (k) {
    case 'scope': return <ScopeDetail />;
    case 'schedule': return <ScheduleDetail project={d.project} />;
    case 'bagts': return <BagtsDetail q={d.bagts} />;
    case 'land': return <LandDetail parcels={d.parcels} project={d.project} />;
    case 'source': return <SourceDetail invest={d.invest} />;
    case 'finance': return <FinanceDetail invest={d.invest} />;
    case 'benefit': return <BenefitDetail bagts={d.bagts} />;
    case 'suit': return <SuitDetail suit={suit} prog={prog} zone={zone} setZone={setZone} />;
  }
}

/**
 * «Энэ хэсэг зурган дээр хаана байна» — багана бүрийн эхний мөр.
 *
 * ⚠️ Давхаргагүй хэсгийг ЧИМЭЭГҮЙ орхихгүй: 01/02/06-г нээхэд газрын зураг
 * хөдлөхгүй бөгөөд шалтгааныг нь хэлэхгүй бол хэрэглэгч эвдэрсэн гэж боддог.
 */
function LayerLink({ k, visible }: { k: SecKey; visible: string[] }) {
  const ids = SECTION_LAYERS[k];
  if (!ids.length) {
    return (
      <p className={o.layerLink}>
        <span className={o.layerOff}>Газрын зурагтай холбогдоогүй</span>
        {' '}— энэ хэсгийн үзүүлэлт зөвхөн хүснэгтэн, харгалзах феатур давхарга байхгүй.
      </p>
    );
  }
  const on = ids.filter((id) => visible.includes(id));
  const names = on.map((id) => LAYER_BY_ID[id]?.title).filter(Boolean);
  return (
    <p className={o.layerLink}>
      <span className={o.layerOn}>Зурагт {num(on.length)} давхарга</span>
      {names.length <= 3 ? ` — ${names.join(' · ')}` : ` — ${names.slice(0, 2).join(' · ')} +${names.length - 2}`}
    </p>
  );
}

/* ══════════════════ Зүүн жагсаалт ══════════════════ */

/**
 * Хэсэг бүрийн ГОЛ тоо — жагсаалтаас шууд уншигдана, дэлгэрэнгүй нээх
 * шаардлагагүй. Амьд өгөгдөл ирээгүй бол «…».
 */
function railStat(k: SecKey, d: DashData, suit: Async<SuitSummary>): {
  value: string;
  pinned?: boolean;
  note: string;
  /** Байвал жагсаалтын мөрөнд нимгэн явцын зурвас зурна */
  pct?: number;
  tone?: string;
} {
  const b = d.bagts.state === 'ready' ? d.bagts.data : null;
  const p = d.project.state === 'ready' ? d.project.data : null;
  const iv = d.invest.state === 'ready' ? d.invest.data : null;
  const blocks = b ? b.reduce((a, x) => a + x.blocks, 0) : null;
  const ail = b ? b.reduce((a, x) => a + x.ail, 0) : null;

  switch (k) {
    case 'scope':
      return {
        value: `${num(HEADLINE.areaHa)} га`, pinned: true,
        note: blocks == null ? '…' : `${num(blocks)} блок · ${num(ail)} өрх`,
      };
    case 'schedule':
      return {
        value: pct(OVERALL.reported, 2), pinned: true,
        note: p == null ? '…' : `6 үе шат · хүснэгтээр ${pct(p.actual, 1)}`,
        pct: OVERALL.reported, tone: o.active,
      };
    case 'bagts': {
      const bl = b ? b.reduce((a, x) => a + x.blocks, 0) : 0;
      // Амьд жигнэсэн дундаж — блокийн тоогоор жинлэсэн 7 багцын гүйцэтгэл.
      const avg = b && bl ? b.reduce((a, x) => a + (x.progress ?? 0) * x.blocks, 0) / bl : null;
      const budget = b ? b.reduce((a, x) => a + x.budget, 0) : null;
      return {
        value: avg == null ? '…' : pct(avg, 1),
        note: budget == null ? '…' : `7 багц · ${bn(budget)} тэрбум ₮`,
        pct: avg ?? undefined, tone: o.active,
      };
    }
    case 'land': {
      const live = p?.byStage['Газар чөлөөлөлт']?.actual ?? null;
      const rows = d.parcels.state === 'ready' ? d.parcels.data.length : null;
      const v = live ?? LAND.pct;
      return {
        value: pct(v, 1),
        note: rows == null ? '…' : `${num(LAND.left)} үлдсэн ◆ · ${num(rows)} бүртгэл`,
        pct: v, tone: o.done,
      };
    }
    case 'source': {
      const keys = new Set(POWER_PACKS.map((x) => bagtsKey(x.key)));
      const sum = iv ? iv.filter((r) => keys.has(bagtsKey(r.bagts))).reduce((a, r) => a + r.total, 0) : null;
      return {
        value: '23.8%', pinned: true,
        note: sum == null ? '…' : `8 багц · ${bn(sum)} тэрбум ₮`,
        pct: 23.8, tone: o.active,
      };
    }
    case 'finance':
      return { value: '19.9%', pinned: true, note: '395.6 / 1,988.2 тэрбум ₮', pct: 19.9, tone: o.active };
    case 'benefit':
      return { value: num(HEADLINE.population), pinned: true, note: '20 байгууламж · 16,000 ажлын байр' };
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
              <b className={`${o.railVal} num`}>{st.value}{st.pinned && <Pin />}</b>
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

function HeadKpi({ d }: { d: DashData }) {
  const b = d.bagts.state === 'ready' ? d.bagts.data : null;
  const blocks = b ? b.reduce((a, x) => a + x.blocks, 0) : null;
  const ail = b ? b.reduce((a, x) => a + x.ail, 0) : null;

  /**
   * ⚠️ УТГА ба НЭГЖ нь ТУСДАА талбар. Урьд нь «≈2.4 их наяд ₮» бүхэлдээ 1.7rem-ээр
   * зурагдаж хавтангаас хальж, «36.35%» ч мөн адил тайрагддаг байв. Тоо нь том,
   * нэгж нь жижиг байвал хоёулаа багтаад зогсохгүй уншихад ч хурдан.
   */
  const tiles: { v: string; unit?: string; pinned?: boolean; label: string; sub?: string; lead?: true; bar?: number }[] = [
    { v: num(HEADLINE.areaHa), unit: 'га', pinned: true, label: 'Төслийн талбай' },
    {
      v: ail == null ? '…' : num(ail), unit: 'өрх',
      label: 'Өрхийн орон сууц',
      sub: blocks == null ? undefined : `${num(blocks)} блок`,
    },
    { v: num(HEADLINE.population), unit: 'хүн', pinned: true, label: 'Хамрагдах хүн ам' },
    {
      // ⚠️ Хүснэгтээр бодогдсон дүнг (27.65%) энд ХАРУУЛАХГҮЙ — толгойн хавтан
      //    нь ГАНЦ албан ёсны тоо хэлэх ёстой. Зөрүү нь 02-р хэсгийн тайлбарт
      //    бүрэн тайлбарлагдсан хэвээр.
      v: num(OVERALL.reported, 2), unit: '%', pinned: true,
      label: 'Төслийн нийт гүйцэтгэл',
      lead: true,
      bar: OVERALL.reported,
    },
    { v: '2.339', unit: 'их наяд ₮', pinned: true, label: 'Нийт хөрөнгө оруулалт' },
  ];

  return (
    <div className={o.head}>
      {tiles.map((t) => (
        <div key={t.label} className={`${o.tile} ${t.lead ? o.tileLead : ''}`}>
          <span className={o.tileVal}>
            <b className="num">{t.v}</b>
            {t.unit && <i>{t.unit}</i>}
            {t.pinned && <Pin />}
          </span>
          <span className={o.tileLabel}>{t.label}</span>
          {/* Гол үзүүлэлтэд зурвас — 36% гэдэг нь «дөнгөж гуравны нэг» гэдгийг
              тоо уншихаас өмнө нүдээр ойлгуулна. */}
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

function ScopeDetail() {
  return (
    <>
      <Panel title="Төслийн цар хүрээ">
        <div className={o.scope}>
          {SCOPE.map((s) => (
            <div key={s.key} className={o.scopeCell}>
              <b className="num">{s.value}{s.unit && <i>{s.unit}</i>}{!s.live && <Pin />}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Хөрөнгө оруулалтын бүтэц" note={<>{num(HEADLINE.investBn, 1)} тэрбум ₮ <Pin /></>}>
        <div className={o.split}>
          {INVEST_SPLIT.map((s) => (
            <span key={s.key} className={o.splitSeg} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.label} ${s.pct}%`} />
          ))}
        </div>
        <div className={o.splitKeys}>
          {INVEST_SPLIT.map((s) => (
            <span key={s.key} className={o.splitKey}>
              <i style={{ background: s.color }} />
              {s.label}<b className="num">{s.pct}%</b>
            </span>
          ))}
        </div>
        <p className={o.note}>
          Гэрээ, захирамжид тусгагдсан {num(HEADLINE.investBn, 1)} тэрбум ₮ · авто зам, гүүр,
          цамхаг оролцуулбал {HEADLINE.investAllLabel}.
        </p>
      </Panel>

      <Panel title="Гол зорилтот хугацаа">
        <div className={o.miles}>
          {MILESTONES.map((m) => (
            <div key={m.year} className={o.mile}><b className="num">{m.year}</b><span>{m.text}</span></div>
          ))}
        </div>
      </Panel>
    </>
  );
}

/* ══════════════════ 02 · Master Schedule ══════════════════ */

/**
 * ⚠️ ГҮЙЦЭТГЭЛ нь боломжтой бол АМЬД (`Төсөл_Гүйцэтгэл`-ийн жигнэсэн дүн).
 * Хугацааны зурвас нь илтгэлээс — амьд хүснэгтэд огноо байхгүй. «Инженерийн дэд
 * бүтэц» ба «Олон нийтийн бүс» гэсэн хоёр үе шат амьд хүснэгтэд ОГТ БАЙХГҮЙ тул
 * тэдгээрийн хувь бэхлэгдсэнээрээ үлдэж, ◆ тэмдэгтэй гарна.
 */
function ScheduleDetail({ project }: { project: Async<ProjectProgress> }) {
  const p = project.state === 'ready' ? project.data : null;
  const span = SCHEDULE_YEARS.length;
  const today = ((SCHEDULE_TODAY.year - SCHEDULE_YEARS[0] + 0.5) / span) * 100;

  return (
    <>
      <Panel title="Үндсэн үе шат" note={`${SCHEDULE_YEARS[0]}–${SCHEDULE_YEARS[span - 1]}`}>
        <div className={o.gantt} style={{ '--today': `${today}%` } as CSSProperties}>
          <div className={o.ganttYears}>
            {SCHEDULE_YEARS.map((y) => <span key={y} className="num">{y}</span>)}
          </div>

          <div className={o.ganttBody}>
            <span className={o.ganttToday} aria-hidden />
            {SCHEDULE.map((st) => {
              const lv = liveStage(p, st.stages);
              const v = lv ? lv.actual : st.pct;
              const left = ((st.from - SCHEDULE_YEARS[0]) / span) * 100;
              const width = ((st.to - st.from + 1) / span) * 100;
              return (
                <div key={st.no} className={o.gRow}>
                  <div className={o.gName}>
                    <span className={o.gNo}>{st.no}</span>
                    <span className={o.gLabel}>{st.label}</span>
                    <b className={`${o.gPct} num ${o[st.tone]}`}>{pct(v, v >= 1 ? 1 : 0)}{!lv && <Pin note="Амьд хүснэгтэд энэ үе шат байхгүй" />}</b>
                  </div>
                  <div className={o.gTrack}>
                    <div className={o.gSpan} style={{ left: `${left}%`, width: `${width}%` }}>
                      <span className={`${o.gFill} ${o[st.tone]}`} style={{ width: `${Math.max(v, 2)}%` }} />
                    </div>
                  </div>
                  <span className={o.gStatus}>{st.status}</span>
                </div>
              );
            })}
          </div>

          <div className={o.ganttFoot}>
            <span className={o.ganttMark}>{SCHEDULE_TODAY.label} · {pct(OVERALL.reported, 2)}</span>
          </div>
        </div>

        <p className={o.note}>
          Гүйцэтгэл нь <b>Төсөл_Гүйцэтгэл</b> хүснэгтийн жигнэсэн дүн
          {p && <> (бүртгэгдсэн жин {pct(p.coverage, 1)})</>}; хугацааны зурвас ба ◆ тэмдэгтэй үе шат илтгэлээс.
        </p>
      </Panel>

      <Panel title="Гол зорилтот хугацаа">
        <div className={o.miles}>
          {MILESTONES.map((m) => (
            <div key={m.year} className={o.mile}><b className="num">{m.year}</b><span>{m.text}</span></div>
          ))}
        </div>
      </Panel>
    </>
  );
}

/* ══════════════════ 03 · Орон сууцны 7 багц ══════════════════ */

/** Гүйцэтгэлийн зэрэг — 4 түвшин, УТГА заасан өнгө */
const progClass = (p: number | null) =>
  p == null ? '' : p >= 50 ? o.pHigh : p >= 25 ? o.pMid : p >= 10 ? o.pLow : o.pMin;

function BagtsDetail({ q }: { q: Async<BagtsRow[]> }) {
  return (
    <Data q={q} loading="Гурван эх сурвалжийг нэгтгэж байна…">
      {(rows) => {
        const blocks = rows.reduce((a, x) => a + x.blocks, 0);
        const ail = rows.reduce((a, x) => a + x.ail, 0);
        const budget = rows.reduce((a, x) => a + x.budget, 0);
        const avg = blocks ? rows.reduce((a, x) => a + (x.progress ?? 0) * x.blocks, 0) / blocks : null;
        return (
          <>
            <Panel title="Нийт" note={`дундаж гүйцэтгэл ${pct(avg, 2)}`}>
              <div className={o.sums}>
                <div><b className="num">{num(blocks)}</b><span>блок</span></div>
                <div><b className="num">{num(ail)}</b><span>өрх</span></div>
                <div><b className="num">{bn(budget)}</b><span>тэрбум ₮</span></div>
              </div>
            </Panel>

            <Panel title="Багц тус бүрээр">
              <div className={o.tblWrap}>
                <table className={o.tbl}>
                  <thead>
                    <tr>
                      <th>Багц</th><th className={o.rt}>Блок/Өрх</th><th className={o.rt}>₮ тэрбум</th><th className={o.rt}>Явц</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const flag = BAGTS_FLAG[r.label.trim()];
                      return (
                        <tr key={r.key} className={flag ? o.trFlag : ''}>
                          <td>
                            <span className={o.cellMain}>{r.label}</span>
                            <span className={o.cellSub} title={r.contractor}>{r.contractor}</span>
                          </td>
                          <td className={`${o.rt} num`}>{num(r.blocks)} / {num(r.ail)}</td>
                          <td className={`${o.rt} num`}>{r.budget > 0 ? bn(r.budget) : '—'}</td>
                          <td className={`${o.rt} num ${progClass(r.progress)}`}>{pct(r.progress, 2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {Object.entries(BAGTS_FLAG).map(([k, v]) => (
                <p key={k} className={o.flagNote}><b>{k}</b> — {v} <Pin /></p>
              ))}
              <p className={o.warnNote}>{BAGTS_NOTE} <Pin /></p>
            </Panel>

            <Panel title="Гүйцэтгэгчийн бүрэлдэхүүн">
              <div className={o.strip}>
                {BAGTS_STRIP.map((s) => (
                  <div key={s.label} className={o.stripCell}>
                    <b className="num">{s.value}<Pin /></b>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
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
function LandDetail({ parcels, project }: { parcels: Async<Row[]>; project: Async<ProjectProgress> }) {
  const p = project.state === 'ready' ? project.data : null;
  const livePct = p?.byStage['Газар чөлөөлөлт']?.actual ?? null;

  return (
    <>
      <Panel title="Нэгж талбарын гүйцэтгэл">
        <div className={o.landTop}>
          <Ring value={livePct ?? LAND.pct} size={86} width={9} label="гүйцэтгэл" />
          <div className={o.rows}>
            <div><span>Нийт нэгж талбар</span><b className="num">{num(LAND.total)}<Pin /></b></div>
            <div><span>Гэрээ байгуулсан</span><b className="num">{num(LAND.contracted)}<Pin /></b></div>
            <div><span>Шаардлагагүй</span><b className="num">{num(LAND.notNeeded)}<Pin /></b></div>
            <div><span>Үлдсэн</span><b className={`num ${o.pMin}`}>{num(LAND.left)}<Pin /></b></div>
          </div>
        </div>
        <div className={o.bars}>
          {LAND.breakdown.map((x) => (
            <div key={x.label} className={o.barRow}>
              <span className={o.barLabel}>{x.label}</span>
              <span className={o.barTrack}>
                <i className={o[x.tone]} style={{ width: `${(x.n / LAND.left) * 100}%` }} />
              </span>
              <b className="num">{x.n}</b>
            </div>
          ))}
        </div>
        <p className={o.warnNote}>{LAND.note} <Pin /></p>
      </Panel>

      {/* ⚠️ Пай диаграмаас БАГАНАН болгов: 10 ангилалтай пай нь зүсмэгүүд нь
          хэт нарийсч, ойролцоо хэмжээтэйг нь нүдээр ялгах боломжгүй болдог.
          Багана нь ижил суурьтай тул урт нь шууд харьцуулагдана. */}
      <Panel title="Газар чөлөөлөлтийн одоогийн төлөв" note="давхаргаас амьдаар">
        <Data q={parcels} loading="Татаж байна…">
          {(rows) => {
            const by = new Map<string, number>();
            for (const x of rows) {
              const k = cleanProgress(text(x[PL.progress]));
              by.set(k, (by.get(k) ?? 0) + 1);
            }
            const items = [...by.entries()]
              .map(([label, n]) => ({
                key: label, label, value: n, display: `${num(n)} талбар`,
                color: PARCEL_PROGRESS_HUES[label] ?? ZONE_TYPE_EMPTY_HUE,
              }))
              .sort((a, b) => b.value - a.value);
            return (
              <>
                <Bars inline items={items} />
                <div className={o.rows}>
                  <div><span>Нийт бүртгэл</span><b className="num">{num(rows.length)} талбар</b></div>
                  <div><span>Ангилал</span><b className="num">{num(items.length)}</b></div>
                </div>
                <p className={o.note}>
                  Давхарга <b>2026.07.18</b>-нд шинэчлэгдсэн — илтгэлээс хойш. Тиймээс мөрийн
                  тоо ({num(rows.length)}) ба ангилал нь дээрх бэхлэгдсэн задаргаанаас зөрнө.
                </p>
              </>
            );
          }}
        </Data>
      </Panel>
    </>
  );
}

/* ══════════════════ 05 · Эх үүсвэр, шугам сүлжээ ══════════════════ */

function SourceDetail({ invest }: { invest: Async<InvRow[]> }) {
  /** БАГЦ-6.x → INVEST-ийн нийт дүн (амьд) */
  const cost = (key: string): number | null => {
    if (invest.state !== 'ready') return null;
    const k = bagtsKey(key);
    const rows = invest.data.filter((r) => bagtsKey(r.bagts) === k);
    return rows.length ? rows.reduce((a, r) => a + r.total, 0) : null;
  };

  return (
    <>
      <Panel title="Эх үүсвэрийн хүчин чадал">
        <div className={o.rows}>
          {SOURCES.map((s) => (
            <div key={s.key} className={o.srcRow}>
              <span className={o.srcTitle}>{s.title}</span>
              <b className="num">{s.value}<i>{s.unit}</i><Pin /></b>
              <span className={o.srcNote}>{s.note}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Гадна ус, дулааны ажил" note={<>НЗД А/464, А/467 <Pin /></>}>
        <div className={o.tblWrap}>
          <table className={o.tbl}>
            <thead><tr><th>Ажил</th><th className={o.rt}>сая ₮</th></tr></thead>
            <tbody>
              {UTILITY_WORKS.map((w) => (
                <tr key={w.work}>
                  <td>
                    <span className={o.cellMain}>{w.work}</span>
                    <span className={`${o.cellSub} ${o[w.tone]}`}>{w.org} · {w.status}</span>
                  </td>
                  <td className={`${o.rt} num`}>{num(w.mn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Гадна цахилгаан (БАГЦ-6)" note="өртөг амьдаар">
        <div className={o.tblWrap}>
          <table className={o.tbl}>
            <thead><tr><th>Багц</th><th className={o.rt}>Өртөг</th><th className={o.rt}>Явц</th></tr></thead>
            <tbody>
              {POWER_PACKS.map((b) => {
                const c = cost(b.key);
                return (
                  <tr key={b.key}>
                    <td>
                      <span className={o.cellMain}>{b.key}</span>
                      <span className={o.cellSub} title={b.contractor}>{b.contractor}<Pin /></span>
                    </td>
                    <td className={`${o.rt} num`}>{c == null ? '…' : bn(c)}</td>
                    <td className={`${o.rt} num ${b.pct > 0 ? o.pLow : o.muted}`}>{b.pct}%<Pin /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={o.warnNote}>{POWER_NOTE} <Pin /></p>
      </Panel>
    </>
  );
}

/* ══════════════════ 06 · Санхүүжилт, бонд ══════════════════ */

/**
 * ⚠️ БҮХ ТОО БЭХЛЭГДСЭН. INVEST-ийн амьд дүн илтгэлийнхээс ЭРС зөрдөг
 * (баталгаажсан 2,209.6 · урьдчилсан 1,945.7 тэрбум ₮) тул хольж үзүүлбэл
 * нийлбэр таарахгүй. Амьд дүнг ЗЭРЭГЦҮҮЛЭХ мөрөөр доор нь тэмдэглэв.
 */
function FinanceDetail({ invest }: { invest: Async<InvRow[]> }) {
  const iv = invest.state === 'ready' ? invest.data : null;
  const confirmed = iv ? iv.reduce((a, r) => a + r.confirmed, 0) : null;
  const planned = iv ? iv.reduce((a, r) => a + r.planned, 0) : null;

  return (
    <>
      <Panel title="Гол үзүүлэлт" note={<Pin />}>
        <div className={o.rows}>
          {FINANCE.kpi.map((k) => (
            <div key={k.label}><span>{k.label}</span><b className="num">{k.value}</b></div>
          ))}
        </div>
      </Panel>

      <Panel title="Санхүүжилтийн эх үүсвэр" note={<Pin />}>
        <Donut
          items={INVEST_SPLIT.map((s) => ({ key: s.key, label: s.label, value: s.bn, color: s.color, display: `${num(s.bn, 1)} · ${s.pct}%` }))}
          center={num(HEADLINE.investBn, 1)} centerLabel="тэрбум ₮" size={124} width={17} stack
        />
      </Panel>

      <Panel title="Он тус бүрийн санхүүжилт" note={<>тэрбум ₮ <Pin /></>}>
        <div className={o.tblWrap}>
          <table className={o.tbl}>
            <thead>
              <tr><th>Ангилал</th>{FINANCE.years.map((y) => <th key={y} className={o.rt}>{y}</th>)}</tr>
            </thead>
            <tbody>
              {FINANCE.rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {r.v.map((v, i) => <td key={i} className={`${o.rt} num`}>{v == null ? '—' : num(v, 1)}</td>)}
                </tr>
              ))}
              <tr className={o.trTotal}>
                <td>Нийт</td>
                {FINANCE.total.map((v, i) => <td key={i} className={`${o.rt} num`}>{num(v, 1)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className={o.note}>{FINANCE.note}</p>
        <p className={o.warnNote}>{FINANCE.bond}</p>
        {/* ⚠️ Амьд дүнг НУУХГҮЙ — илтгэлийн дүнтэй зөрж байгааг хэрэглэгч мэдэх ёстой */}
        <p className={o.note}>
          Харьцуулбал <b>Хөрөнгө оруулалт өртөг</b> хүснэгтэд: баталгаажсан{' '}
          <b>{confirmed == null ? '…' : `${bn(confirmed)} тэрбум ₮`}</b>, урьдчилсан{' '}
          <b>{planned == null ? '…' : `${bn(planned)} тэрбум ₮`}</b>. Эх үүсвэрийн задаргаа
          дээрх диаграмтай таарахгүй — хүснэгтэд «нийслэлийн төсөв» багана байхгүй.
        </p>
      </Panel>
    </>
  );
}

/* ══════════════════ 07 · Үр өгөөж ══════════════════ */

function BenefitDetail({ bagts }: { bagts: Async<BagtsRow[]> }) {
  const ail = bagts.state === 'ready' ? bagts.data.reduce((a, x) => a + x.ail, 0) : null;

  return (
    <>
      {/* Олон нийтийн бүс — тусдаа хавтан БИШ, ГАНЦ индикатор */}
      <div className={o.indicator}>
        <b className="num">{PUBLIC_ZONE.value}<Pin /></b>
        <span className={o.indicatorLabel}>{PUBLIC_ZONE.label}</span>
        <span className={o.indicatorNote}>{PUBLIC_ZONE.note}</span>
      </div>

      <Panel title="Иргэдийн амьдралын чанар">
        <div className={o.benefits}>
          {BENEFITS.map((b) => (
            <div key={b.value + b.text} className={o.benefit}>
              {/* Өрхийн тоо амьд — building_GOL-ийн нийлбэр */}
              <b className="num">{b.live && ail != null ? num(ail) : b.value}{b.unit && <i>{b.unit}</i>}{!b.live && <Pin />}</b>
              <span>{b.text}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Нийгмийн дэд бүтэц" note={<>20 байгууламж <Pin /></>}>
        <div className={o.tblWrap}>
          <table className={o.tbl}>
            <thead><tr><th>Байгууламж</th><th className={o.rt}>Одоо</th><th className={o.rt}>Шинээр</th><th className={o.rt}>Нийт</th></tr></thead>
            <tbody>
              {SOCIAL.rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className={`${o.rt} num`}>{r.now}</td>
                  <td className={`${o.rt} num`}>{r.add}</td>
                  <td className={`${o.rt} num`}>{r.total}</td>
                </tr>
              ))}
              <tr className={o.trTotal}>
                <td>Нийт</td>
                <td className={`${o.rt} num`}>{SOCIAL.totals.now}</td>
                <td className={`${o.rt} num`}>{SOCIAL.totals.add}</td>
                <td className={`${o.rt} num`}>{SOCIAL.totals.total}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={o.note}>{SOCIAL.note}</p>
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
      <Panel title="Тохиромжтой байдал" note="анализ">
        <div className={o.load}>
          <div className={o.loadMsg}>{prog.msg}</div>
          <div className={o.loadBar}><span style={{ width: `${Math.max(4, prog.pct)}%` }} /></div>
        </div>
        <p className={o.note}>
          Бүс бүрийн орон зайн огтлолцлыг бодож байна — эхний удаад хэдэн арван
          секунд үргэлжилж, дараа нь кэшээс шууд гарна.
        </p>
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
      <Panel title="Нийлмэл оноо" note={zone ? `бүс ${zone}` : `${num(s.zones)} бүсийн дундаж`}>
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
        <div className={o.bars}>
          {s.levels.map((l) => (
            <div key={l.label} className={o.barRow}>
              <span className={o.barLabel}>{l.label}</span>
              <span className={o.barTrack}>
                <i style={{ width: `${(l.n / Math.max(1, s.zones)) * 100}%`, background: l.color }} />
              </span>
              <b className="num">{l.n}</b>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Бүсийн эрэмбэ" note="дарж сонгоно">
        <div className={o.rankGroup}>
          <div className={o.rankLabel}>Хамгийн сайн</div>
          {scored.slice(0, 5).map((r, i) => <RankRow key={r.id} r={r} n={i + 1} zone={zone} setZone={setZone} />)}
          <div className={o.rankLabel}>Хамгийн муу</div>
          {scored.slice(-5).reverse().map((r, i) => <RankRow key={r.id} r={r} n={scored.length - i} zone={zone} setZone={setZone} />)}
        </div>
      </Panel>

      <p className={o.note}>
        Оноо нь хот төлөвлөлтийн үзүүлэлт ({100 - DEFAULT_ECON_SHARE}%) ба эдийн засгийн
        ашиг ({DEFAULT_ECON_SHARE}%)-ийн жигнэсэн нийлбэр. Дэлгэрэнгүй задаргаа
        «Тохиромжтой байдал» харагдацад.
      </p>
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
