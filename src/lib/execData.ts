'use client';

/**
 * НҮҮРИЙН (ExecKpi) БА ДАШБОАРДЫН ХАМТЫН ӨГӨГДЛИЙН ХЭСЭГ.
 *
 * ⚠️ 2026-08-21 (гүйцэтгэлийн аудит): эдгээр hook урьд нь `Dashboard.tsx`-д
 * байсан бөгөөд ExecKpi → Dashboard → MapCanvas гинжээр НЭВТРЭХ хуудас хүртэл
 * ArcGIS SDK-ийн ~35 модулийг (хэдэн МБ JS + CSS) татдаг байв. Root.tsx-ийн
 * `dynamic(Portal)` хуваалт ингэж хүчингүй болж байсан тул MapCanvas-аас
 * ХАМААРАЛГҮЙ энэ файлд салгав. Энд зөвхөн query/analysis-ийн хөнгөн
 * хамаарлууд бий — Dashboard өөрөө эндээс импортолдог болсон.
 */

import { useAsync, type Async } from './useAsync';
import { queryFeatures, type Row } from './query';
import { BUILDING, bagtsKey, buildingKey } from './services';
import {
  INDICATORS, SCORE_LEVELS, levelOf, PARKING, DEFAULT_ECON_SHARE,
  BUILD_COST_PER_M2, profitScore,
} from './analysis/config';
import { loadAnalysisCached, computeEconomics, computeRaw, defaultGreenCats } from './analysis/data';
import { loadCostsCached } from './analysis/costs';
import { urbanScore } from './analysis/score';
import { loadBlockProgress, type BlockProgressMap } from './blockProgress';
import { text } from './format';
import { BAGTS_ORIGIN } from './brief';
import { t as tr } from './i18nCore';

const BF = BUILDING.fields;

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
 * ⚠️ Багцын нэр эх сурвалжуудад өөр бичиглэлтэй («Багц 4.1» / «Багц 4-1»)
 * тул ЗӨВХӨН `bagtsKey()`-ээр жишинэ.
 *
 * ⚠️ Гүйцэтгэлийг давхаргын `GUITS_HV`-ээс АВАХГҮЙ: тэр талбар хуучирсан бөгөөд
 * илтгэлийн дүнгээс 5–14 нэгжээр зөрдөг. `loadBlockProgress()` нь «Барилгын
 * хяналт»-ын ашигладаг ЯГ ижил тооцоо — хоёр харагдац ижил тоо харуулна.
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
