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
  INDICATORS, SCORE_LEVELS, levelOf, PARKING, ASSUME_MET, DENSITY_BY_TYPE, ACTIVATABLE_ZONE_TYPES,
} from './analysis/config';
import { loadAnalysisCached, computeRaw, defaultGreenCats } from './analysis/data';
import { urbanScore, passesNorm, normFor, normGap, normText } from './analysis/score';
/* ⚠️ `modules`-аас `lib` рүү импорт — `execTriage.ts`-ийн жишиг (bagts.pkg).
   `simulation.ts` нь ЗӨВХӨН `Zone` төрөл ба `tr`-ийг импортолдог тул ямар ч
   хүнд хамаарал (ArcGIS SDK, газрын зураг) дагуулж ирэхгүй. */
import { zoneTrips } from '@/modules/analysis/suit/simulation';
import {
  loadBlockProgress, loadBlockUniverse, pkgProgressOf, universeKeys,
  type BlockProgressMap, type BlockUniverse,
} from './blockProgress';
import { text } from './format';
import { BAGTS_ORIGIN } from './brief';
import { housingPct } from './gdash';
import { t as tr } from './i18nCore';

const BF = BUILDING.fields;

export type BagtsRow = {
  key: string;
  label: string;
  blocks: number;
  /** Өрхийн тоо — МЭДЭГДЭЖ буй блокуудын нийлбэр (хоосон `AIL_TOO` орохгүй — `ailMissing`) */
  ail: number;
  /**
   * ⚠️ 2026-10-09: давхаргын блокоос `AIL_TOO` ХООСОН нь (null ≠ 0). Урьд нь `?? 0`-ээр 0 өрх болж
   * дутуу нийлбэр бүрэн мэт гардаг байв. Нийт дүнг `ailTotal()`-оор ав — бүгд хоосон бол `null`,
   * заримд нь бол `partial`. Сонголттой: гараар зохиосон мөрүүд (тест) 0 гэж үзнэ.
   */
  ailMissing?: number;
  /** ⚠️ 2026-10-09: `ail`/`ailMissing`-ийн хуваарь — давхаргын давхардалгүй блокийн тоо */
  ailBlocks?: number;
  contractor: string;
  /** Гадаад / Үндэсний — илтгэлээс бэхлэгдсэн */
  origin: string;
  /**
   * Барилга угсралтын гүйцэтгэл (%) — «Гүйцэтгэл бөглөх» хуудасны «Б.» мөрөөр.
   * ⚠️ 2026-09-30: «Барилгын хяналт» (BuildingPanel) · «Багцын мэдээлэл»
   *    (Bagts.buildPacks) · Тайлан §3 (`reportData.loadOverall`) ·
   *    `finPhys.buildPhys`-тэй НЭГ дүрэм (`blockProgress.pkgProgressOf`).
   * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): хуваарь нь багцын БҮХ блок (бөглөх
   *    хуудасны хуваарь), тайлагнаагүй блок 0% — 2026-09-30-ны «зөвхөн тайлагнасан
   *    блок (null ≠ 0)» дүрмийг ХҮЧИНГҮЙ болгов. Нэг ч блок тайлагнаагүй багц 0%;
   *    `null` нь зөвхөн бөглөх хуудас уншигдаагүй (хуваарьгүй) үед.
   */
  progress: number | null;
  /**
   * Хэмжигдсэн (тайлагнасан) блокийн тоо (`blockProgress.pkgProgressOf`).
   * ⚠️ 2026-09-30: `blocks − missing`-ээс ӨӨР байж болно: давхаргад давхардсан
   * feature (29/1, 5/6) нэг л хэмжилт, footprint-гүй хэмжилт (29/3, 5/8) энд орно.
   */
  measured: number;
  /**
   * `progress`-ийн ХУВААРЬ — бөглөх хуудасны блок ∪ хэмжилт (`PkgProgress.total`).
   * ⚠️ 2026-10-01: `buildProgressOf`-ийн нөөц жин үүгээр (урьд нь `measured`).
   */
  total: number;
  /**
   * Тайлан ирээгүй блокийн тоо — `keys`-ээс хэмжилтгүй нь.
   * ⚠️ 2026-10-01: `keys` нь бөглөх хуудасны хуваарь тул бөгжийн (`latestMean`)
   *    `total − blocks`-тэй ЯГ таарна.
   */
  missing: number;
  /**
   * Цувааны хамрах хүрээ — багцын блок бүрийн түлхүүр (`${БАГЦ}|блок`), давхардалгүй.
   * ⚠️ `joinBagts` аль хэдийн бодож байсныг ХАЯДАГ байв. Цуваа (04·C5) ба дэд
   * үе шатын карт (04·C3) хоёулаа `BlockProgressMap`-д ЯГ ижил түлхүүрээр
   * хандах ёстой — гараар дахин зохиовол нэг тэмдэгт зөрөхөд карт хоосорно.
   * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): эх нь БӨГЛӨХ ХУУДАСНЫ хуваарь
   *    (`blockProgress.universeKeys` — `progress`-тэй нэг хуваарь); газрын зургийн
   *    feature-ийн түлхүүр зөвхөн тэр багц хуваарьт байхгүй үед (нөөц).
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
  const [blocks, prog, uni] = await Promise.all([
    queryFeatures(BUILDING.url, {
      outFields: [BUILDING.oid, BF.bagts, BF.block, BF.households, BF.contractor],
    }),
    loadBlockProgress(),
    /* ⚠️ 2026-10-01: блокийн хуваарь (тайлагнаагүй блок 0%) — `loadSchema` кэштэй */
    loadBlockUniverse(),
  ]);
  return joinBagts(blocks, prog, uni);
/*
 * ⚠️ ДАМЖИН ХАМААРАХ ТҮЛХҮҮРИЙГ ЗААВАЛ ЗАРЛАНА (`CASHFLOW_NEW`).
 *
 * Энэ ачаалагч өөрөө зөвхөн `BUILDING`-ийн блокуудыг татдаг ч дотроо
 * `loadBlockProgress()` дууддаг — түүний `reads`-ийг энд давтана.
 * ⚠️ 2026-09-30: `CASHFLOW_NEW` хасагдав — Багц 3.1-ийн cashflow солилт
 *    (`cashflowOverride`) хасагдсан тул `loadBlockProgress` зөвхөн
 *    `BAGTS_SHEET`-ээс хамаарна.
 *
 * ⚠️ ДҮРЭМ: дуудаж буй ачаалагчийн `reads`-ийг ӨӨРИЙНХӨӨ `reads`-д НЭГТГЭНЭ —
 * шууд уншсан хүснэгтээ л жагсаах нь хангалтгүй.
 */
}, 5 * 60_000, ['BAGTS_SHEET']);

/**
 * ӨРХИЙН НИЙТ — багцын мөрүүдээс (2026-10-09).
 * `ail: null` — бүх блокийн `AIL_TOO` хоосон («—»); `partial` — заримынх нь хоосон (нийлбэр нь
 * мэдэгдэж буй хэсгийнх, «дутуу» гэж тэмдэглэ; 1 өрхөд ногдох дүн гэх мэт ХАРЬЦААГ бодохгүй).
 */
export function ailTotal(rows: readonly BagtsRow[]): { ail: number | null; partial: boolean; missing: number } {
  let ail = 0; let missing = 0; let seen = 0;
  for (const r of rows) { ail += r.ail; missing += r.ailMissing ?? 0; seen += r.ailBlocks ?? 0; }
  if (seen > 0 && missing >= seen) return { ail: null, partial: false, missing };
  return { ail, partial: missing > 0, missing };
}

export function useBagtsTable(): Async<BagtsRow[]> {
  return useAsync(loadBagtsRows, []);
}

/** Экспорт — `execData.check.mjs` цэвэр оролтоор шалгана (сүлжээгүй) */
export function joinBagts(blocks: Row[], prog: BlockProgressMap, universe: BlockUniverse): BagtsRow[] {
  /* ⚠️ 2026-09-30: багцын хувь нь ХЭМЖИЛТИЙН нүднээс (`pkgProgressOf`), давхаргын
     feature-ээр БИШ — `pkgProgressOf`-ийн ⚠️ (29/1 · 5/6 давхардал, 29/3 · 5/8
     footprint-гүй). «Гүйцэтгэл»-ийн жагсаалт ба Тайлан §3-тай нэг тоо.
     ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): хуваарь = бөглөх хуудасны БҮХ блок
     (`universe`), тайлагнаагүй блок 0%. */
  const means = pkgProgressOf(prog, universe);
  const by = new Map<string, BagtsRow>();
  const slot = (name: string) => {
    const k = bagtsKey(name);
    const cur = by.get(k) ?? {
      key: k, label: name, blocks: 0, ail: 0, ailMissing: 0, ailBlocks: 0, contractor: '—',
      origin: BAGTS_ORIGIN[name.trim()] ?? '—', progress: null, measured: 0, total: 0, missing: 0,
      keys: [],
    };
    by.set(k, cur);
    return cur;
  };

  /* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ДАВХАРДСАН feature (давхаргад ижил
     `buildingKey`-тэй хоёр полигон — БАГЦ1|29/1, БАГЦ2|5/6) НЭГ блок. Урьд нь блок, өрх,
     «тайлангүй» тоо, цувааны түлхүүр бүгд feature-ээр тоологдож газрын зургийн
     өгөгдлийн алдаа тоонд шууд ордог байв (зургийг админ засна — `blockProgress.mapKeyIssues`). */
  const seen = new Set<string>();
  for (const b of blocks) {
    const name = text(b[BF.bagts], tr('Тодорхойгүй'));
    // Блокийн түлхүүрийг НЭГ УДАА бодож хадгална — цуваа ба дэд үе шатын карт
    // ижил түлхүүрийн жагсаалтаар ажиллана (`BagtsRow.keys`).
    const bk = buildingKey(b[BF.bagts], b[BF.block]);
    if (seen.has(bk)) continue;
    seen.add(bk);
    const s = slot(name);
    s.blocks += 1;
    /* ⚠️ 2026-10-09: хоосон `AIL_TOO` — 0 БИШ, `ailMissing` (`BagtsRow.ailMissing`-ийн ⚠️) */
    const hh = b[BF.households] == null || b[BF.households] === '' ? NaN : Number(b[BF.households]);
    s.ailBlocks = (s.ailBlocks ?? 0) + 1;
    if (Number.isFinite(hh)) s.ail += hh; else s.ailMissing = (s.ailMissing ?? 0) + 1;
    // Гүйцэтгэгч — блокийн давхаргын BAR_COMP (багцын бүх блок нэг гүйцэтгэгчтэй)
    const comp = text(b[BF.contractor], '').trim();
    if (comp) s.contractor = comp;
    s.keys.push(bk);
  }

  /* ⚠️ 2026-09-30 (дахин): тайлагнасан блок = ХЭМЖИЛТИЙН нүд (`pkgProgressOf`),
     давхаргын feature БИШ — урьд нь `Σ feature ÷ (blocks − missing)` байсан тул
     Багц 1 · 2 «Гүйцэтгэл»-ийн жагсаалт, Тайлан §3-аас зөрдөг байв.
     ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): 2026-09-24/09-30-ны «нэг ч блок тайлагнаагүй
     багц `progress: null`», «хуваарь = ТАЙЛАГНАСАН блок» дүрмүүд ХҮЧИНГҮЙ — хуваарьт
     (`universe`) байгаа багц тайлагнаагүй ч 0%. `null` нь зөвхөн хуваарьгүй (бөглөх
     хуудас уншигдаагүй / хуудасгүй) багцад. `keys`, `missing` ч хуваариас. */
  return [...by.values()]
    .map((s) => {
      const m = means.get(s.key);
      const keys = universe.has(s.key) ? universeKeys(prog, universe, [s.key]) : s.keys;
      return {
        ...s,
        keys,
        /* ⚠️ 2026-10-04: БЛОКИЙН ТОО ч бөглөх хуудасны хуваариас (`keys` = `total`) — урьд нь
           газрын зургийн feature-ийн тоо (`s.blocks`) байсан тул «Барилгын блок» / «Тайлан ирээгүй»
           / «N/M блок» хоёр өөр ертөнцийг хольж, footprint-гүй хэмжилт (29/3, 5/8) ба хуудсанд
           байхгүй feature нэг самбарт зөрдөг байв. Хуваарьгүй багцад (хуудас уншигдаагүй) нөөц. */
        blocks: universe.has(s.key) ? keys.length : s.blocks,
        missing: keys.filter((k) => !prog.get(k)).length,
        progress: m ? m.pct : null,
        measured: m ? m.blocks : 0,
        total: m ? m.total : 0,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'mn'));
}

/* ══════════════ ТӨСЛИЙН АЛБАН ЁСНЫ ГҮЙЦЭТГЭЛ ══════════════ */

export type BuildProgress = {
  /** Орон сууцны гүйцэтгэл (%) — `gdash.housingPct` (хэмжигдсэн багц, ХО дүнгээр жигнэсэн) */
  pct: number | null;
  blocks: number;
  /** Тайлагнасан блок */
  reported: number;
  /** Тайлан ирээгүй блок */
  missing: number;
};

/**
 * ОРОН СУУЦНЫ ГҮЙЦЭТГЭЛ — багцын мөрүүдээс, порталын ГАНЦ томьёогоор.
 *
 * ⚠️ 2026-09-30, хэрэглэгчийн шийдвэр: орон сууцны гүйцэтгэл ХААНА Ч НЭГ
 *    тодорхойлолттой — `gdash.housingPct` (Σ ХО × хувь ÷ Σ ХО, хэмжигдсэн
 *    багцаар; ХО дүн огт алга бол тайлагнасан блокийн тоо). Энэ шийдвэр
 *    2026-08-24-ний (CEO_KPI_PROMPT §7-A) «бүх блокоор хуваах, тайлан ирээгүй
 *    блок 0%» дүрмийг ХҮЧИНГҮЙ болгов: тэр «болгоомжтой» дүн нь Dashboard ·
 *    PkgProg · Тайлан · удирдлагын тайлангийн тооноос зөрж, нэг үзүүлэлт
 *    хоёр тоотой байв.
 * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): тайлагнаагүй блок ба ОГТ тайлагнаагүй багц
 *    0%-иар ОРНО (бүх дэлгэцэд НЭГ дүрмээр — `blockProgress.pkgProgressOf`,
 *    `finPhys.buildPhys`). Хэдэн блок тайлан ирээгүйг `missing`-ээр ХАМТ харуулна.
 *
 * @param cost багц (`BagtsRow.key`) → ХО дүн (`gdash.pkgCostWeight`). Өгөөгүй
 *   бол блокийн тооны нөөц жин — багцын хуваарь (`BagtsRow.total`).
 */
export function buildProgressOf(rows: readonly BagtsRow[], cost?: ReadonlyMap<string, number>): BuildProgress {
  let blocks = 0;
  let missing = 0;
  for (const r of rows) {
    blocks += r.blocks;
    missing += r.missing;
  }
  /* ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): тайлагнаагүй багц 0%-иар орно (`progress` 0);
     `null` нь зөвхөн хуваарьгүй багц — `housingPct` түүнийг алгасна. */
  /* ⚠️ 2026-09-30: нөөц жин = хувийн хуваарь — `loadOverall` (`rows`) · `physNow`
     (`physCnt`)-тай нэг; `blocks − missing` давхардсан feature-ийг 2 тоолдог.
     ⚠️ 2026-10-01: хуваарь = `total` (бүх блок), урьд нь `measured`. */
  return {
    pct: housingPct(rows.map((r) => ({
      pct: r.progress, cost: cost?.get(r.key) ?? 0, blocks: r.total,
    }))),
    blocks,
    reported: rows.reduce((a, r) => a + r.measured, 0),
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
    /* ⚠️ `scoreTypes` = Тохиромжийн хуудасны АНХДАГЧ (`ACTIVATABLE_ZONE_TYPES`,
       2026-09-25 аудит) — CEO KPI (`ceo/suitability`) ба scorecard-тай ижил.
       Урьд нь өгөөгүй тул тэдгээр 17 бүс энд хасагдаж, хуудастай зөрдөг байв. */
    computeRaw(data.zones, defaultGreenCats(), PARKING, new Set(ACTIVATABLE_ZONE_TYPES));
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
    const live = data.zones.filter((z) => !z.excluded || ACTIVATABLE_ZONE_TYPES.has(z.type));
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
  }, [enabled]);
}
