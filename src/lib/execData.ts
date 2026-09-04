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
import { cached } from './live';
import { queryFeatures, type Row } from './query';
import { BUILDING, bagtsKey, buildingKey } from './services';
import {
  INDICATORS, SCORE_LEVELS, levelOf, PARKING, ASSUME_MET, DENSITY_BY_TYPE,
} from './analysis/config';
import { loadAnalysisCached, computeRaw, defaultGreenCats } from './analysis/data';
import { urbanScore, passesNorm, normFor, normGap, normText } from './analysis/score';
/* ⚠️ `modules`-аас `lib` рүү импорт — `execTriage.ts`-ийн жишиг (bagts.pkg).
   `simulation.ts` нь ЗӨВХӨН `Zone` төрөл ба `tr`-ийг импортолдог тул ямар ч
   хүнд хамаарал (ArcGIS SDK, газрын зураг) дагуулж ирэхгүй. */
import { zoneTrips } from '@/modules/analysis/suit/simulation';
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
/**
 * ⚠️ ХУКААС ТУСГААРЛАВ (2026-08-31). React-гүй хэрэглэгчид (ж: «Үйл
 * ажиллагааны схем»-ийн эх сурвалж цуглуулагч) энэ жагсаалт хэрэгтэй боловч
 * хук дуудаж чадахгүй. Кэш нь хоёр талыг НЭГ хүсэлт хуваалцуулна.
 */
export const loadBagtsRows = cached<BagtsRow[]>(async () => {
  const [blocks, prog] = await Promise.all([
    queryFeatures(BUILDING.url, {
      outFields: [BUILDING.oid, BF.bagts, BF.block, BF.households, BF.contractor],
    }),
    loadBlockProgress(),
  ]);
  return joinBagts(blocks, prog);
}, 5 * 60_000, ['BAGTS_SHEET']);

export function useBagtsTable(): Async<BagtsRow[]> {
  return useAsync(loadBagtsRows, []);
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

/* ══════════════ ТӨСЛИЙН АЛБАН ЁСНЫ ГҮЙЦЭТГЭЛ ══════════════ */

export type BuildProgress = {
  /** Блокоор жигнэсэн гүйцэтгэл (%) — тайлангүй блок 0%-аар ордог */
  pct: number | null;
  blocks: number;
  /** Тайлагнасан блок */
  reported: number;
  /** Тайлан ирээгүй блок */
  missing: number;
};

/**
 * ТӨСЛИЙН ГҮЙЦЭТГЭЛИЙН ГАНЦ ТОДОРХОЙЛОЛТ.
 *
 * ⚠️ 2026-08-24, хэрэглэгчийн шийдвэр (CEO_KPI_PROMPT §7-A). Системд гурван
 * өөр гүйцэтгэлийн тоо зэрэг оршиж, CEO хоёр дэлгэц нээгээд өөр хоёр тоо
 * хардаг байв. Албан ёсны нь болгож сонгосон нь ЭНЭ — `joinBagts`-ийн дүрэм:
 * хуваарь нь БҮХ блок, тайлан ирээгүй блок 0% гэж тооцогдоно.
 *
 * ⚠️ Яагаад «бүх блокоор» вэ: зөвхөн тайлагнасан блокоор дундажлавал шинэ багц
 * бүртгэгдэх бүрд дүн БУУНА, мөн тайлагнаагүй ажил дүнд ОГТ нөлөөлөхгүй болж
 * нуугдана. Бүх блокоор хуваах нь болгоомжтой (консерватив) — гүйцэтгэлийг
 * хэзээ ч хөөрөгдөхгүй.
 *
 * ⚠️ `missing` нь ЗААВАЛ хамт харагдана: 0%-аар орж буй блок хэд байгааг
 * хэлэхгүйгээр энэ тоо төөрөгдүүлнэ.
 *
 * ⚠️ `r.progress` нь `sum ÷ r.blocks` тул `progress × blocks` нь түүхий
 * нийлбэрийг сэргээнэ — багц дамнасан жигнэлт ингэж яг таарна.
 */
export function buildProgressOf(rows: readonly BagtsRow[]): BuildProgress {
  let blocks = 0;
  let wsum = 0;
  let missing = 0;
  for (const r of rows) {
    blocks += r.blocks;
    missing += r.missing;
    if (r.progress != null) wsum += r.progress * r.blocks;
  }
  return {
    pct: blocks ? wsum / blocks : null,
    blocks,
    reported: blocks - missing,
    missing,
  };
}

/* ── Тохиромжтой байдлын үнэлгээ (бүсийн орон зайн анализ) ── */

export type SuitSummary = {
  avgScore: number | null;
  levels: { label: string; color: string; n: number }[];
  noData: number;
  zones: number;
  ranked: { id: string; type: string; score: number | null }[];
  byId: Record<string, { score: number | null; type: string }>;
  /**
   * ⚠️ ШИНЭ (2026-08-24) — ҮЗҮҮЛЭЛТ БҮРЭЭР нэгтгэсэн норм зөрчил.
   * Багцаар БИШ, СЭДЭВЭЭР (хэрэглэгчийн хүсэлт): «ногоон байгууламж хэдэн
   * бүсэд норм хангахгүй байна» гэсэн асуултад хариулна.
   */
  byIndicator: IndicatorFail[];
  /**
   * ⚠️ ШИНЭ — замын симуляцын ЭРЭЛТИЙН загвар (оргил цагийн машин/цаг).
   * Амьд машин агентын статистик БИШ (тэр нь анимац ажиллаж байж гарна) —
   * симуляцыг ТЭЖЭЭДЭГ бүсийн аялал үүсгэлт (`zoneTrips`).
   */
  road: { trips: number; top: { zone: string; trips: number }[] };
};

export type IndicatorFail = {
  id: string;
  name: string;
  short: string;
  unit: string;
  weight: number;
  /** Норм ЗӨРЧСӨН бүсийн тоо */
  fails: number;
  /** Утга нь бодогдсон (дүгнэгдэх боломжтой) бүсийн тоо */
  scored: number;
  /**
   * Хамгийн их зөрчилтэй бүс — утга · норм · зөрүү гурвыг агуулна.
   *
   * ⚠️ `norm` нь ТУХАЙН БҮСИЙН норм: `far`/`bcr` (`byType`) нь бүсийн төрөл
   * бүрд өөр хязгаартай (1.2 / 2.4 / 3.0 · 40 / 80 / 100). Өмнө нь энэ мөрөнд
   * ерөнхий `normLabel` бичигддэг байсан тул зөрүүг бүсийн нормоор бодоод
   * дэлгэцэд ӨӨР норм харуулж, «утга − норм ≠ зөрүү» болдог байв.
   */
  worst: { zone: string; value: number; gap: number; norm: string } | null;
  /**
   * Нормын шаардлага текстээр — «≥ 6.0 м²/хүн».
   * `byType` үзүүлэлтэд ганц утга биш МУЖ («≤ 1.2 – 3.0») болно.
   */
  normLabel: string;
  /**
   * ⚠️ `ASSUME_MET`-ээр «норм хангасан» гэж ДҮГНЭГДДЭГ үзүүлэлт.
   * Эх өгөгдөл нь найдваргүй тул (`config.ts:908`) зөрчлийг нь бусадтай ижил
   * жинтэй үзүүлэхгүй — тусад нь тэмдэглэнэ.
   */
  assumed: boolean;
};

/* ⚠️ 2026-08-24: `blendOf` УСТГАГДАВ. Урьд нь оноог «хот төлөвлөлт 50% +
   ашгийн оноо 50%» гэж нийлүүлдэг байсан бөгөөд ашгийн оноо нь ЗОХИОМОЛ
   нэгж үнээс (negj_une) гардаг байлаа. Эзэмшигчийн шийдвэрээр эдийн засгийн
   загвар бүрмөсөн хасагдсан тул оноо нь ОДОО зөвхөн хот төлөвлөлтийн нормоор
   бодогдоно — зохиомол өгөгдөл онооны тал хувийг эзэлдэг байдал арилав. */

/**
 * ⚠️ ХҮНД тооцоо: бүх бүсийн геометр, ногоон байгууламж, зогсоол, дэд бүтцийн
 * өртгийг татаж, бүс бүрээр орон зайн огтлолцол бодно. Тиймээс 08-р хэсэг
 * НЭЭГДЭХ хүртэл огт ажиллуулахгүй (`enabled`) — эс бөгөөс дашбоард нээх бүрд
 * хэрэглэгчийн хүсээгүй хэдэн арван хүсэлт явна.
 */
export function useSuitability(enabled: boolean, onProgress?: (m: string, p: number) => void): Async<SuitSummary> {
  return useAsync(async () => {
    if (!enabled) return new Promise<SuitSummary>(() => {});
    const data = await loadAnalysisCached(onProgress);
    computeRaw(data.zones, defaultGreenCats(), PARKING);
    const blends = data.zones.map((z) => urbanScore(z.raw, INDICATORS, z.type).score);
    const valid = blends.filter((x): x is number => x != null);
    /*
     * ══ ҮЗҮҮЛЭЛТ БҮРЭЭР НОРМ ЗӨРЧИЛ (2026-08-24) ══
     *
     * ⚠️ `rawActual` уншина, `raw` БИШ. `ASSUME_MET` нь `raw`-д `social`/
     * `engineering`-ийг хүчээр «норм хангасан» болгодог тул `raw` уншвал тэр
     * хоёр ХЭЗЭЭ Ч асуудал болж харагдахгүй. Бодит утга `rawActual`-д бүтэн.
     *
     * ⚠️ `engineering` БҮРМӨСӨН ХАСАГДСАН (хэрэглэгчийн шийдвэр, 2026-08-24):
     * түүний 100/500 м норм нь `config.ts`-т БАТЛАГДААГҮЙ таамаг гэж
     * тэмдэглэгдсэн. Батлагдаагүй нормоор «зөрчил» зарлаж зураг төсөл
     * өөрчлүүлэх нь эрсдэлтэй.
     *
     * ⚠️ `ref` үзүүлэлт (`greenCap`, `densityCap`) — БНБД-д норм заагаагүй тул
     * зөрчил гэж үзэхгүй. Жин 0 нь мөн адил.
     *
     * ⚠️ ХАСАГДСАН бүсийг (`excluded` — ногоон байгууламж, одоо байгаа
     * барилга) тоолохгүй: тэдгээр нь оноололд ч ордоггүй.
     */
    const live = data.zones.filter((z) => !z.excluded);
    const byIndicator: IndicatorFail[] = INDICATORS
      .filter((ind) => !ind.ref && ind.weight > 0 && ind.id !== 'engineering')
      .map((ind) => {
        let fails = 0;
        let scored = 0;
        let worst: IndicatorFail['worst'] = null;
        const fmtNorm = (x: number, d?: number) => x.toFixed(d ?? 1);
        for (const z of live) {
          const eff = normFor(ind, z.type);
          const v = z.rawActual[ind.id];
          const ok = passesNorm(v, eff);
          if (ok == null || v == null) continue;
          scored += 1;
          if (ok) continue;
          fails += 1;
          const gap = normGap(v, eff) ?? 0;
          /* ⚠️ Нормыг ЭНД, `eff`-ээс хамт хадгална — дэлгэцэд бичигдэх норм нь
             `gap` бодоход ашигласан нормтой ижил байх ЁСТОЙ. */
          if (!worst || gap > worst.gap) worst = { zone: z.id, value: v, gap, norm: normText(eff, fmtNorm) };
        }
        /* ⚠️ `byType` (FAR/BCR) үзүүлэлтэд ЕРӨНХИЙ норм гэж байхгүй: бүсийн
           төрөл бүрд өөр (`DENSITY_BY_TYPE`). Өмнө нь `normFor(ind, null)`
           буюу орон сууцны хамгийн хатуу нормыг бүх мөрөнд бичдэг байсан тул
           «Олон нийтийн бүс»-ийн BCR 85% нь зөрчил биш байтал «≤ 40%» гэж
           худал заагдана. Тиймээс мужаар харуулна. */
        const capOf = (t: 'farMax' | 'bcrMax') => Object.values(DENSITY_BY_TYPE).map((d) => d[t]);
        const normLabel = ind.byType
          ? tr('≤ {0} – {1}{2} (бүсийн төрлөөр)',
            fmtNorm(Math.min(...capOf(ind.byType)), ind.decimals),
            fmtNorm(Math.max(...capOf(ind.byType)), ind.decimals),
            ind.unit ? ` ${ind.unit}` : '')
          : normText(ind, fmtNorm);
        return {
          id: ind.id,
          name: ind.name,
          short: ind.short,
          unit: ind.unit ?? '',
          weight: ind.weight,
          fails,
          scored,
          worst,
          normLabel,
          assumed: ind.id in ASSUME_MET,
        };
      });

    /* ══ ЗАМЫН СИМУЛЯЦЫН ЭРЭЛТ ══
       ⚠️ Шинэ хүсэлт НЭМЭХГҮЙ: `zoneTrips` нь бүсийн `residentPop`/`capacityPop`
       дээр л тогтдог бөгөөд тэдгээр нь энэ ачаалалтад аль хэдийн бий. Замын
       СҮЛЖЭЭ (`loadNetworkCached`) энд ОГТ хэрэггүй. */
    const tripRows = live
      .map((z) => ({ zone: z.id, trips: zoneTrips(z) }))
      .filter((x) => x.trips > 0)
      .sort((a, b) => b.trips - a.trips);

    return {
      byIndicator,
      road: {
        trips: tripRows.reduce((a, x) => a + x.trips, 0),
        top: tripRows.slice(0, 6),
      },
      avgScore: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
      levels: SCORE_LEVELS.map((L, i) => ({
        label: L.label, color: L.color,
        n: data.zones.filter((_, j) => levelOf(blends[j]) === i).length,
      })),
      noData: blends.filter((b) => levelOf(b) < 0).length,
      zones: data.zones.length,
      ranked: data.zones.map((z, i) => ({ id: z.id, type: z.type, score: blends[i] })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
      byId: Object.fromEntries(data.zones.map((z, i) => [z.id, { score: blends[i], type: z.type }])),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
