/**
 * Барилгын блок бүрийн БАРИЛГА УГСРАЛТЫН АЖЛЫН гүйцэтгэл — газрын зургийн
 * өнгө, tooltip болон баруун самбарын аль алинд ижил эх сурвалж.
 *
 * ⚠️ ЭХ СУРВАЛЖ (2026-08-25-нд СОЛИГДСОН): `Bagts_*` БӨГЛӨХ ХУУДСУУД.
 * Урьд нь `Selbe_guitsetgel_consolidated` нэгтгэсэн хүснэгтээс уншдаг байв —
 * тэр нь CSV-гээр гараар шинэчлэгддэг бөгөөд 2026-07-25-нд зогссон тул
 * гүйцэтгэгчийн өдөр бүр бөглөж буй өгөгдөл дэлгэцэд ОГТ хүрэхгүй байлаа.
 * Одоо бөглөх хуудсуудаас ШУУД уншина — завсрын хүснэгтгүй.
 *
 * ⚠️ ХУУДАС нь ӨРГӨН (ажил = мөр, блок = багана `F5_1_гүйцэтгэл`), энэ модуль
 * УРТ хэлбэр хүлээдэг тул блок бүрийг тусдаа мөр болгож задлана.
 *
 * № баганын Б-ийн МӨРҮҮДИЙГ авна:
 *   «Б.»       → нийт гүйцэтгэл (Бэлтгэл ажил ОРОХГҮЙ)
 *   «Б1»…«Б5»  → дэд үе шатууд (барилгын · халаалт · ус · цахилгаан · холбоо)
 * Эх excel өөрөө дэд үе шатын жингээр бодсон дүн тул энд дахин жигнэхгүй.
 *
 * ⚠️ `Tusliin_guitsetgel_master`-т Б-ийн мөр ОГТ БАЙХГҮЙ — тэнд зөвхөн
 * «A. Бэлтгэл ажил» ба навч ажлууд байдаг тул задаргааг тэндээс авч болохгүй.
 *
 * Нүд бүрээр ХАМГИЙН СҮҮЛИЙН огноог авна: бөглөх хуудас нь өөрчилсөн нүдээ
 * л шинэ огноогоор нэмдэг тул нэг барилгын нүднүүд өөр өөр огноотой байж болно.
 */
import { TASK_SHEET, buildingKey, normalizeTaskNo, isConstructionNo } from './services';
import { loadSheetRows, sheetBlockKeys } from '@/modules/sheet/sheetRows';
import { register, type DataKey } from './dataBus';
import { dayKey } from './format';

const TS = TASK_SHEET.fields;

const t = (v: unknown) => (v == null ? '' : String(v));
const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * ИРЭЭДҮЙН ОГНООНЫ ТАСЛАЛТ — «өнөөдөр» (ОРОН НУТГИЙН «YYYY-MM-DD»).
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): өнөөдрөөс ХОЙШ огноотой хэмжилт (гараар
 *    буруу огноо сонгосон бөглөлт) ХОЁУЛАНД хасагдана — газрын зургийн будалт
 *    (`compute` → `loadBlockProgress`) ба багцын жагсаалт (`history` → `finPhys` →
 *    `Finance.physLatest`, PkgProg). Урьд нь зураг огт таслалтгүй (ирээдүйн огноо нь
 *    «сүүлийн» болж ялдаг), жагсаалт сараар (одоогийн сарын ирээдүйн өдөр ОРДОГ,
 *    дараагийн сар орохгүй) таслагддаг тул нэг блок хоёр дэлгэцэд өөр хувьтай гардаг байв.
 * ⚠️ Бүх салаа ЭНЭ ганц функцээр — хоёр газар өөр дүрэм бичихгүй.
 */
export const progressCutoff = (ms: number = Date.now()): string => dayKey(ms);
/** Хэмжилтийн огноо таслалтаас хойш уу (ирээдүйн) */
export const isFutureDay = (d: string, today: string): boolean => d > today;

/**
 * Бөглөх хуудсуудаас Б-ийн мөрүүдийг татаж УРТ хэлбэрт задална.
 *
 * ⚠️ Хуудас бүр 6 мөр × агшин × блокийн тоо — нийтдээ хэдэн мянган цэг.
 *    Навч ажлуудыг ОГТ татахгүй (1,370 мөр × 20 блок = 27 мянга) тул хүсэлт
 *    хөнгөн: 10 хуудас × 1 схем + 1 асуулга.
 *
 * ⚠️ Өргөн→урт задаргаа нь `sheet/sheetRows.ts`-д НЭГ УДАА бичигдсэн —
 *    `BuildingPanel` ч мөн түүнийг ашигладаг. Энд хуулбарлавал шинэ багана
 *    нэмэгдэх бүрд хоёр газар засах шаардлагатай болно.
 */
async function fetchConstruction(): Promise<Record<string, unknown>[]> {
  const rows = await loadSheetRows({ constructionOnly: true });
  return rows.map((r) => ({
    [TS.bagts]: r.bagts,
    [TS.no]: r.no,
    [TS.work]: r.work,
    [TS.date]: r.date,
    [TS.block]: r.block,
    [TS.progress]: r.progress,
  }));
}

/** Дэд үе шат — «Б1 · Барилгын ажил · 24%» */
export type SubPhase = { no: string; name: string; pct: number | null };
export type BlockProgress = {
  /** «Б.» мөрийн гүйцэтгэл, 0–100 */
  overall: number;
  /** Тухайн нүдний хамгийн сүүлийн огноо */
  date: string;
  /** Б1…Б5 — № дарааллаар. Бөглөгдөөгүй бол `pct: null`. */
  phases: SubPhase[];
};
/** `${БАГЦ}|${блок}` → гүйцэтгэл. (`MapCanvas`-д ArcGIS-ийн `Map`-ыг дарсан тул alias.) */
export type BlockProgressMap = Map<string, BlockProgress>;

/**
 * БАГЦ БҮРИЙН БЛОКИЙН ХУВААРЬ — `bagtsKey` («БАГЦ1») → `buildingKey`[] («БАГЦ1|29/1»).
 * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): эх нь БӨГЛӨХ ХУУДСУУДЫН бүдүүвч
 *    (`sheetRows.sheetBlockKeys`), газрын зургийн давхарга БИШ. `BlockProgressMap` нь
 *    зөвхөн хэмжигдсэн түлхүүртэй тул «тайлагнаагүй блок = 0%» дүрмийн хуваарь ЭНДЭЭС.
 */
export type BlockUniverse = ReadonlyMap<string, readonly string[]>;

/**
 * Блок бүрийн «Б.» мөрийн СҮҮЛИЙН утга — ЗӨВХӨН бөглөх хуудсаас.
 * ⚠️ Багц 3.1-ийн cashflow солилт (`ov`) ХАСАГДСАН — `loadBlockProgress`-ийн ⚠️.
 */
export function compute(rows: Record<string, unknown>[], today: string = progressCutoff()): BlockProgressMap {
  /** барилга → (№ → сүүлийн мөр) */
  const win = new Map<string, Map<string, { pct: number | null; name: string; date: string }>>();
  for (const r of rows) {
    const d = t(r[TS.date]);
    if (!isValidDate(d)) continue;
    /* ⚠️ 2026-10-01: ирээдүйн огноотой хэмжилт тооцохгүй (`progressCutoff`-ийн ⚠️) */
    if (isFutureDay(d, today)) continue;
    /* ⚠️ № -г ЭНД ч нормчилно: `sheetRows` аль хэдийн нормчилдог ч энэ функц
     *    түүхий мөр (хуучин кэш, өөр дуудагч) хүлээж авах боломжтой тул нийт
     *    мөрийн түлхүүр («Б.») хоёр газарт ХОЁР янз бүтэх ёсгүй. */
    const no = normalizeTaskNo(r[TS.no]);
    const k = buildingKey(r[TS.bagts], r[TS.block]);
    const cells = win.get(k) ?? new Map();
    const prev = cells.get(no);
    // ⚠️ Нүд бүрээр сүүлийн огноо ялна; ИЖИЛ огноонд сүүлийн (их OID-той) мөр
    //    ялна — history()-ийн «нэг өдөрт хоёр бичлэг — сүүлийнх ялна» дүрэмтэй
    //    ижил, эс бөгөөс зураг/самбар нэг тоо, муруй өөр тоо заана.
    if (prev && prev.date > d) continue;
    cells.set(no, {
      pct: r[TS.progress] == null ? null : Number(r[TS.progress]) * 100,
      name: t(r[TS.work]),
      date: d,
    });
    win.set(k, cells);
  }

  const out: BlockProgressMap = new Map();
  for (const [k, cells] of win) {
    const total = cells.get(TASK_SHEET.constructionNo);
    // ⚠️ Нийт гүйцэтгэл бөглөгдөөгүй барилгыг ОРУУЛАХГҮЙ — зурагт «мэдээлэлгүй»
    //    саарлаар үлдэх ёстой, 0% гэж будвал «эхлээгүй» гэсэн ХУДАЛ мэдээлэл өгнө.
    if (!total || total.pct == null) continue;
    out.set(k, {
      overall: total.pct,
      date: total.date,
      phases: TASK_SHEET.subPhaseNos.map((no) => ({
        no,
        name: cells.get(no)?.name ?? '',
        pct: cells.get(no)?.pct ?? null,
      })).filter((p) => p.name),
    });
  }
  return out;
}

/* ─────────────────────── Цаг хугацааны цуваа ─────────────────────── */

/** Нэг блокийн «Б.» мөрийн бүртгэл — огноо ӨСӨХ дарааллаар */
export type HistoryPoint = { date: string; pct: number | null };
/** `${БАГЦ}|блок` → бүртгэлийн түүх */
export type BlockHistory = Map<string, HistoryPoint[]>;

/**
 * Блок бүрийн «Б.» мөрийн бүх огноо.
 *
 * ⚠️ `compute`-аас ялгаатай нь энд хуучин огноог ХАЯХГҮЙ — цуваа нь тэдгээр
 * дээр л зурагдана. `pct: null` нь нүд ЦЭВЭРЛЭГДСЭН гэсэн үг (Pivot нь хоосон
 * нүдийг null мөрөөр бичдэг) тул тэр огнооноос хойш уг блок «бөглөгдөөгүй».
 */
export function history(rows: Record<string, unknown>[], today: string = progressCutoff()): BlockHistory {
  const out: BlockHistory = new Map();
  for (const r of rows) {
    /* ⚠️ Нормчлолын НЭГ дүрмээр — «Б» (цэггүй) багцуудын түүх алдагдах ёсгүй */
    if (!isConstructionNo(r[TS.no])) continue;
    const d = t(r[TS.date]);
    if (!isValidDate(d)) continue;
    /* ⚠️ 2026-10-01: `compute`-тэй ЯГ ИЖИЛ таслалт — зураг ба жагсаалт нэг тоо (`progressCutoff`) */
    if (isFutureDay(d, today)) continue;
    const k = buildingKey(r[TS.bagts], r[TS.block]);
    const arr = out.get(k) ?? [];
    const pct = r[TS.progress] == null ? null : Number(r[TS.progress]) * 100;
    const prev = arr.find((p) => p.date === d);
    if (prev) prev.pct = pct; // нэг өдөрт хоёр бичлэг — сүүлийнх ялна
    else arr.push({ date: d, pct });
    out.set(k, arr);
  }
  for (const arr of out.values()) arr.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

export type SeriesPoint = {
  /** Шошго — «2026-07-20» эсвэл «2026-07» */
  label: string;
  /** Тухайн үеийн бодит агшин (as-of огноо) */
  date: string;
  /**
   * Дундаж гүйцэтгэл, 0–100. Хуваарь нь ХОЁР горимд хамрах хүрээний БҮХ блок
   * (бөглөгдөөгүй = 0%).
   * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): `'latest'`-ийн хуваарь урьд нь тухайн агшинд
   *    ХЭМЖИГДСЭН блок л байсан — тайлагнаагүй блок одоо 0% гэж орно.
   */
  overall: number;
  /** Тухайн үед бөглөгдсөн байсан блокийн тоо (хуваарь БИШ — хуваарь нь `keys`-ийн тоо) */
  blocks: number;
};

/**
 * Цувааны утгын тодорхойлолт.
 *   · `'peak'`   — блок бүрийн ӨССӨН дүн (running max), хуваарь ТОГТМОЛ (`keys`)
 *   · `'latest'` — блок бүрийн ТУХАЙН АГШИН ДАХЬ СҮҮЛИЙН бичлэг (`compute`-тэй
 *                  ижил дүрэм), хуваарь ТОГТМОЛ (`keys`, 2026-10-01-ээс — тайлагнаагүй = 0%)
 */
export type SeriesMode = 'peak' | 'latest';

/**
 * Блокуудын СҮҮЛИЙН хэмжигдсэн гүйцэтгэлийн дундаж — `progressSeries(…, 'latest')`-ийн
 * СҮҮЛИЙН цэгтэй ЯГ таарах «одоо»-гийн тоо.
 *
 * ⚠️ 2026-09-30: Дашбоардын «Дундаж гүйцэтгэл» бөгж ба «Барилга угсралтын явц»
 *    цуваа ӨӨР хуваарь (бөгж: тайлагнасан багцын бүх блок; цуваа: 7 багцын БҮХ
 *    блок) ба ӨӨР утга (бөгж: сүүлийн; цуваа: өссөн дүн) хэрэглэдэг тул цувааны
 *    сүүлийн цэг бөгжөөс зөрдөг байв. Хоёулаа ЭНЭ дүрмээр, утга нь сүүлийн хэмжилт.
 * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): хэмжигдээгүй блок хуваарьт 0% гэж ОРНО
 *    (`total`) — урьд нь «null ≠ 0» гэж хасагддаг байв. `keys` нь хамрах хүрээний БҮХ
 *    блок байх ёстой (бөглөх хуудасны хуваарь — `BlockUniverse`). `pct: null` нь
 *    зөвхөн хуваарь ХООСОН үед.
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): `keys`-ийн ДАВХАРДЛЫГ ХАЯНА. Урьд нь
 *    «ДАВХАРДЛЫГ ХАДГАЛНА» гэж давхаргын feature-ийн жагсаалтыг (`BagtsRow.keys`-ийн
 *    `flatMap`) шууд тоолдог тул газрын зурагт ХОЁР feature-тэй блок (БАГЦ1|29/1,
 *    БАГЦ2|5/6) дундажид хоёр жинтэй орж байв — тоо нь зургийн өгөгдлийн алдаанаас
 *    хамаарах ёсгүй. `progressSeries` ч мөн адил хаядаг тул «сүүлийн цэг == бөгж» хэвээр.
 */
export function latestMean(
  pm: BlockProgressMap,
  keys: Iterable<string>,
): { pct: number | null; blocks: number; total: number } {
  let sum = 0, n = 0, total = 0;
  for (const k of new Set(keys)) {
    total += 1;
    const c = pm.get(k);
    if (c == null || !Number.isFinite(c.overall)) continue;
    sum += c.overall;
    n += 1;
  }
  /* ⚠️ 2026-10-01: хуваарь = `total` (тайлагнаагүй блок 0%), `n` БИШ */
  return { pct: total ? sum / total : null, blocks: n, total };
}

/** Багцын гүйцэтгэл — `pkgProgressOf`-ийн мөр */
export type PkgProgress = {
  /** 0–100 — Σ хэмжигдсэн блок ÷ `total` (тайлагнаагүй блок 0%) */
  pct: number;
  /** Хэмжигдсэн (тайлагнасан) блокийн тоо */
  blocks: number;
  /** Хуваарь — багцын БҮХ блок (бөглөх хуудасны хуваарь ∪ хэмжигдсэн түлхүүр) */
  total: number;
};

/**
 * БАГЦ БҮРИЙН ГҮЙЦЭТГЭЛ — тухайн багцын БҮХ блокийн ЭНГИЙН дундаж, 0–100;
 * тайлагнаагүй блок 0%. Түлхүүр нь `bagtsKey` («БАГЦ1», «БАГЦ41»).
 *
 * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): гүйцэтгэлийн хэмжилт (тайлагнасан/батлагдсан)
 *    ОГТ БАЙХГҮЙ блок 0% гэж ОРНО — «мэдээлэлгүй» гэж хасагдахгүй. Жишээ: 4 блоктой
 *    багцын зөвхөн A нь 100% тайлагнасан бол багц 25%, 100% БИШ. Урьд нь ЗӨВХӨН
 *    хэмжигдсэн блокуудын дундаж байсан тул нэг блок тайлагнахад багц бүхэлдээ 100%
 *    харагддаг байв. Хуваарь = `universe` (бөглөх хуудасны блок) ∪ хэмжигдсэн түлхүүр;
 *    нэг ч блок тайлагнаагүй багц 0% (Map-д ОРНО, `blocks: 0`).
 * ⚠️ `null` ≠ 0 ХЭВЭЭР зөвхөн АЧААЛАЛТ УНАСАН үед: хуудасны бүдүүвч уншигдаагүй багц
 *    `universe`-д байхгүй тул хэмжилтгүй бол Map-д ОРОХГҮЙ («—»). `universe` өөрөө
 *    унавал дуудагч алдааг дамжуулна (0 гэж зурахгүй).
 *
 * ⚠️ 2026-09-30: ЭХ НЬ БӨГЛӨХ ХУУДАСНЫ НҮД (`BlockProgressMap` — багц|блок
 *    түлхүүр бүр НЭГ удаа), барилгын давхаргын feature БИШ. Урьд нь
 *    `joinBagts` · `live.loadFillPkgProgress` · `Bagts.buildPacks` багцын хувийг
 *    давхаргын feature-ээр гүйлгэж дундажлагдаг байв:
 *      · «БАГЦ1|29/1», «БАГЦ2|5/6» давхаргад ХОЁР feature-тэй (`services.buildingKey`-
 *        ийн ⚠️) — нэг хэмжилт ХОЁР удаа тоологдоно;
 *      · «БАГЦ1|29/3», «БАГЦ2|5/8» хэмжилттэй атлаа давхаргад footprint-гүй
 *        (`blockProgress.check`-ийн KNOWN_ORPHAN) — дунджид ОГТ орохгүй.
 *    Тиймээс «Гүйцэтгэл»/«Багцын мэдээлэл»-ийн жагсаалт (`Finance.physLatest`),
 *    Тайлан §3 (`reportData.loadOverall`)-аас Багц 1, Багц 2-ын хувь Дашбоард
 *    «Багц ажлаар», Тайлан §2, удирдлагын тайлан, багцын KPI-д ӨӨР гардаг байв.
 *    Одоо бүгд ЭНЭ функцээр — нэг багц, нэг тоо.
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): `physLatest`-тэй урьдын ГАНЦ ялгаа (ирээдүйн
 *    огноотой бичилт — энэ нь тасалдаггүй, тэр нь сараар таслагддаг) АРИЛСАН: `compute` ба
 *    `history` хоёулаа өнөөдрөөр таслана (`progressCutoff`).
 */
export function pkgProgressOf(pm: BlockProgressMap, universe: BlockUniverse): Map<string, PkgProgress> {
  const pkgOf = (key: string) => { const cut = key.indexOf('|'); return cut < 0 ? key : key.slice(0, cut); };
  /* багц → хуваарийн түлхүүрүүд (давхардалгүй) */
  const keysOf = new Map<string, Set<string>>();
  const add = (pk: string, key: string) => {
    if (!pk) return;
    const s = keysOf.get(pk) ?? new Set<string>();
    s.add(key);
    keysOf.set(pk, s);
  };
  for (const [pk, keys] of universe) for (const key of keys) add(pk, key);
  /* ⚠️ Хуваарьт ОРООГҮЙ хэмжилт (хуучин кэш, бүдүүвч өөрчлөгдсөн) ч тоологдоно —
     хэмжилт ХЭЗЭЭ Ч хаягдахгүй */
  for (const [key, cell] of pm) {
    if (cell != null && Number.isFinite(cell.overall)) add(pkgOf(key), key);
  }
  const out = new Map<string, PkgProgress>();
  for (const [pk, keys] of keysOf) {
    let sum = 0, n = 0;
    for (const key of keys) {
      const c = pm.get(key);
      if (c == null || !Number.isFinite(c.overall)) continue; // тайлагнаагүй — 0%
      sum += c.overall;
      n += 1;
    }
    if (keys.size > 0) out.set(pk, { pct: sum / keys.size, blocks: n, total: keys.size });
  }
  return out;
}

/**
 * БАГЦЫН ХУВААРИЙН ТҮЛХҮҮРҮҮД — `universe` ∪ хэмжигдсэн түлхүүр, багцаар шүүсэн.
 * ⚠️ 2026-10-01: Дашбоардын бөгж/цуваа (`latestMean`, `progressSeries`) ЭНЭ жагсаалтаар —
 *    `pkgProgressOf`-той ижил хуваарь (газрын зургийн давхаргын түлхүүр БИШ).
 * @param only зөвхөн эдгээр багц (`bagtsKey`); өгөөгүй бол бүгд
 */
export function universeKeys(
  pm: BlockProgressMap | null,
  universe: BlockUniverse,
  only?: Iterable<string>,
): string[] {
  const want = only ? new Set(only) : null;
  const out = new Set<string>();
  for (const [pk, keys] of universe) if (!want || want.has(pk)) keys.forEach((k) => out.add(k));
  if (pm) {
    for (const key of pm.keys()) {
      const cut = key.indexOf('|');
      const pk = cut < 0 ? key : key.slice(0, cut);
      if (!want || want.has(pk)) out.add(key);
    }
  }
  return [...out];
}

/**
 * ГАЗРЫН ЗУРГИЙН БЛОКИЙН ТҮЛХҮҮРИЙН ЗӨРҮҮ — админд засуулах жагсаалт (2026-10-01,
 * «хэрэглэгч: бүгдийг зас»). ӨГӨГДЛИЙГ ЗАСАХГҮЙ, зөвхөн илрүүлнэ.
 *   · `dup`     — давхаргад ХОЁР+ feature-тэй түлхүүр (БАГЦ1|29/1, БАГЦ2|5/6)
 *   · `orphan`  — бөглөх хуудсанд хэмжилттэй атлаа давхаргад footprint-гүй (БАГЦ2|5/8)
 *   · `relabel` — footprint-гүй хэмжилтийн БЛОКИЙН нэр өөр багцын feature-т байгаа
 *                 (БАГЦ1|29/3 ↔ давхаргад «Багц 2» гэж бичигдсэн 29/3) — багцын нэр буруу
 * ⚠️ Тоонууд эдгээрээс ХАМААРАХГҮЙ (`pkgProgressOf` — бөглөх хуудасны хуваарь ба хэмжилтийн нүднээс;
 *    `latestMean`/`progressSeries` — давхардлыг хаядаг). Энэ нь зөвхөн газрын зургийг
 *    засуулах мэдээлэл (`BuildingPanel.loadBuildings` dev горимд console-д бичнэ).
 * @param featureKeys давхаргын feature бүрийн `buildingKey` (давхардлыг ХАДГАЛСАН)
 * @param measured    хэмжилттэй түлхүүрүүд (`BlockProgressMap.keys()`)
 */
export function mapKeyIssues(
  featureKeys: readonly string[],
  measured: Iterable<string>,
): { dup: string[]; orphan: string[]; relabel: { measured: string; feature: string }[] } {
  const count = new Map<string, number>();
  for (const k of featureKeys) count.set(k, (count.get(k) ?? 0) + 1);
  const dup = [...count].filter(([, n]) => n > 1).map(([k]) => k).sort();
  const orphan = [...new Set(measured)].filter((k) => !count.has(k)).sort();
  const blockOf = (k: string) => k.slice(k.indexOf('|') + 1);
  const relabel: { measured: string; feature: string }[] = [];
  for (const m of orphan) {
    for (const f of count.keys()) {
      if (f !== m && blockOf(f) === blockOf(m)) relabel.push({ measured: m, feature: f });
    }
  }
  return { dup, orphan, relabel };
}

/** «YYYY-MM-DD» → «YYYY-MM» */
const monthOf = (d: string) => d.slice(0, 7);

/**
 * As-of цуваа: огноо бүрд хамрах хүрээний БҮХ блокийн дундаж.
 *
 * ⚠️ ХУВААРЬ ТОГТМОЛ — `keys`-ийн тоо. Урьд нь зөвхөн бөглөгдсөн блокоор
 * дундажлаж байсан: шинэ багц бөглөгдөх бүрд хуваарь өсөж, муруй БУУДАГ байв
 * (11.2% → 7.9%, 32 → 88 блок). Барилга угсралт буудаггүй тул тэр хонхор нь
 * «ажил ухарсан» гэж уншигдана. Бөглөгдөөгүй блокийг 0% гэж тоолох нь БОДИТ:
 * тайлан ирээгүй барилга тэр үед үнэхээр ~0% байсан. Ингэснээр:
 *   · блок бүрийн утга өсөх (`peak`) + хуваарь тогтмол ⇒ муруй БУУХГҮЙ
 *   · сүүлийн цэг нь хуудасны нийт дундажтай ЯГ таарна (бүх блок бөглөгдсөн үед)
 *
 * `keys` — зөвхөн эдгээр блокоор (газрын зургийн давхаргад БАЙГАА блокууд).
 */
export function progressSeries(
  hist: BlockHistory,
  keys: Iterable<string>,
  grain: 'day' | 'month',
  /**
   * ⚠️ 2026-09-30: `'latest'` НЭМЭГДЭВ — анхдагч `'peak'` ХЭВЭЭР (BuildingPanel,
   *    Dashboard-ийн EnvRight, finPhys-ийн дүрэм түүнээс хамаарна). `'latest'`
   *    нь `latestMean`/`loadBlockProgress`-той ЯГ ижил тоо өгнө: сүүлийн цэг ==
   *    бөгж.
   * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): `'latest'`-ийн хуваарь ч ТОГТМОЛ (`keys`) —
   *    тайлагнаагүй блок 0%. Урьдын «шинэ блок тайлагнах сард дундаж буурна» сул
   *    тал ингэснээр арилсан (`latestMean`-тэй ижил хуваарь).
   */
  mode: SeriesMode = 'peak',
): SeriesPoint[] {
  /* ⚠️ 2026-10-01: давхардсан түлхүүрийг хаяна (`latestMean`-ийн ⚠️) — газрын зургийн
     давхардсан feature нэг блокийг хоёр тоолуулахгүй. */
  const keyList = [...new Set(keys)];
  const mine = keyList.map((k) => hist.get(k)).filter((h): h is HistoryPoint[] => h != null);
  const dates = [...new Set(mine.flatMap((h) => h.map((p) => p.date)))].sort();
  if (!dates.length) return [];

  /**
   * Нэг блокийн тухайн агшны гүйцэтгэл — бүртгэсэн утгуудын ХАМГИЙН ИХ нь.
   *
   * ⚠️ Барилга угсралт БУУДАГГҮЙ: «50 → 10 → 15» гэсэн цуваа нь ажил ухарсан
   * биш, тайлан дутуу/хоосон бөглөгдсөн (`pct: null` = нүд цэвэрлэгдсэн) эсвэл
   * бичлэгийн алдаа. Тиймээс хамгийн сүүлийн бичлэгийг АВАЛГҮЙ, өссөн дүнг
   * (running max) хэрэглэнэ — эс бөгөөс муруй хиймэл хонхор гаргана.
   */
  const peak = (h: HistoryPoint[], asOf: string) => {
    let v: number | null = null;
    for (const p of h) {
      if (p.date > asOf) break;
      if (p.pct != null && (v == null || p.pct > v)) v = p.pct;
    }
    return v;
  };

  /**
   * Тухайн агшин дахь СҮҮЛИЙН бичлэг (`'latest'`). `pct: null` (нүд
   * цэвэрлэгдсэн) бол тэр блок «бөглөгдөөгүй» — `compute`-ийн дүрэм.
   */
  const latest = (h: HistoryPoint[], asOf: string) => {
    let v: number | null = null;
    for (const p of h) {
      if (p.date > asOf) break;
      v = p.pct;
    }
    return v;
  };

  const at = (asOf: string) => {
    let sum = 0, n = 0;
    for (const h of mine) {
      const v = mode === 'latest' ? latest(h, asOf) : peak(h, asOf);
      if (v != null && Number.isFinite(v)) { sum += v; n += 1; }
    }
    /* ⚠️ 2026-10-01: хуваарь ХОЁР горимд `keys`-ийн тоо (тайлагнаагүй блок 0%) */
    const den = keyList.length;
    return { date: asOf, overall: den ? sum / den : 0, blocks: n };
  };

  /** Бүртгэлгүй агшин — 0% гэж зурвал байхгүй хэмжилт «ухралт» мэт харагдана */
  const measured = (p: SeriesPoint) => p.blocks > 0;

  if (grain === 'day') return dates.map((d) => ({ label: d, ...at(d) })).filter(measured);

  /**
   * Сар бүрийн ЭЦСИЙН байдал — ГЭХДЭЭ бүртгэлгүй сарыг АЛГАСНА.
   *
   * ⚠️ Урьд нь тайлан ирээгүй сар өмнөх агшныг ДАВТАЖ цэг болдог байв: муруй
   * дээр 3-4 ижил цэг дараалж, «хэмжсэн» мэт харагдана. Одоо сар нь ШИНЭ
   * тайлантай (өмнөхөөсөө өөр agшин) байвал л цэг болно.
   */
  const out: SeriesPoint[] = [];
  const last = dates[dates.length - 1];
  let prevSnap = '';
  for (let m = monthOf(dates[0]); m <= monthOf(last); m = nextMonth(m)) {
    // Мөрийн харьцуулалт: «2026-03-99» нь тухайн сарын ямар ч өдрөөс их.
    const snap = [...dates].reverse().find((d) => d <= `${m}-99`);
    if (!snap || snap === prevSnap) continue;
    prevSnap = snap;
    const pt = { label: m, ...at(snap) };
    if (measured(pt)) out.push(pt);
  }
  return out;
}

const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};

/* ─────────────────────────── Cache ─────────────────────────── */

/**
 * Нэг удаа тооцоод хадгална; алдаа гарвал дараагийн дуудалт ДАХИН оролдоно.
 *
 * ⚠️ `reads` (2026-08-28) — `dataBus`-д бүртгэнэ. Бөглөх хуудас руу бичсэн
 * даруйд (`bagtsSheet.applyAdds`) энэ кэш хаягдаж, газрын зургийн блокийн
 * будалт ба дашбоардын явцын тоо хуудас дахин ачаалахгүйгээр шинэчлэгдэнэ.
 */
function memo<T>(fn: () => Promise<T>, reads: readonly DataKey[] = []): () => Promise<T> {
  let p: Promise<T> | null = null;
  if (reads.length) register(() => { p = null; }, reads);
  /* ⚠️ 2026-09-08: уналтын хаалт нь ӨӨРИЙН амлалт кэшэд ХЭВЭЭР байгаа эсэхийг
     шалгана — `invalidate()` (dataBus) кэшийг хаяж, шинэ хүсэлт амжилттай
     кэшлэгдсэний дараа хоцорсон хуучин уналт тэр ШИНЭ кэшийг устгадаг байв
     (`live.ts`-ийн `cached`-тай ижил алдаа). */
  return () => {
    if (p) return p;
    const mine = fn().catch((e) => { if (p === mine) p = null; throw e; });
    p = mine;
    return mine;
  };
}

/* ── localStorage кэш (stale-while-revalidate) ── */

/**
 * Амьд татаж дуустал (~7с, 2000+ мөр хуудаслана) газрын зургийн 113 блок
 * СААРАЛ харагддаг байв. Сүүлийн амжилттай ТООЦООЛСОН дүнг (113 бичлэг —
 * түүхий мөр биш, жижиг) localStorage-д хадгалж, дараагийн нээлтэд шууд будна;
 * амьд дүн ирмэгц дарж шинэчилнэ.
 *
 * ⚠️ «Хуучин тоо дэлгэцэд үлдэхгүй» зарчимтай нийцүүлнэ: кэш нь зөвхөн амьд
 * хүсэлт ЯВЖ БАЙХ хооронд харагдана. Хүсэлт АЛДВАЛ дуудагч (MapCanvas) кэшийг
 * хаяж, саарал «мэдээлэлгүй» төлөвт буцаана — TTL-ээр давхар хамгаална.
 */
/* ⚠️ 2026-10-01: v2 — ирээдүйн огнооны таслалтаас (`progressCutoff`) ӨМНӨХ кэш ирээдүйн
   хэмжилтээр будсан байж болно; хуучныг хэрэглэхгүй. */
const CACHE_KEY = 'selbe-blockprog-v2';
/** Кэшийн хүчинтэй хугацаа — долоо хоногоос хуучин бол огт хэрэглэхгүй */
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

function saveCache(m: BlockProgressMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), entries: [...m] }));
  } catch { /* private mode / дүүрсэн — кэшгүй ажиллана */ }
}

/** Сүүлийн амжилттай дүн — СИНХРОН уншина (амьд татаж дуустал түр будна) */
export function cachedBlockProgress(): BlockProgressMap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { t?: number; entries?: [string, BlockProgress][] };
    if (!j.t || !Array.isArray(j.entries) || Date.now() - j.t > CACHE_TTL_MS) return null;
    return new Map(j.entries);
  } catch {
    return null;
  }
}

/** Түүхий мөрүүд — `loadBlockProgress` ба `loadBlockHistory` ХОЁУЛАА үүнээс. */
const loadRows = memo(fetchConstruction, ['BAGTS_SHEET']);

/**
 * Блок бүрийн барилга угсралтын гүйцэтгэл (0–100) — ЗӨВХӨН бөглөх хуудсаас.
 *
 * ⚠️ БАГЦ 3.1-ИЙН CASHFLOW СОЛИЛТ ХАСАГДСАН (2026-09-30, хэрэглэгч: «багц 3.1 бодит гүйцэтгэл бөглөлтөөс гарсан хувь руу
 *    шилжүүлэлдээ, 16.4 биш үүнээс бага хувь байх ёстой»).
 *    2026-09-10-нд 3.1-ийн бөглөх хуудас бараг хоосон байсан тул бүх блокийг
 *    нь cashflow-ийн нэг тоо (16.4%)-оор ДАРДАГ түр нөхөөс байв
 *    (`cashflowOverride` + `live.FILL_FROM_CASHFLOW`). Бөглөлт одоо бодитоор
 *    явж байгаа тул нөхөөсийн тайлбарт бичсэний дагуу хасав — 3.1 бусад
 *    багцтай ИЖИЛ дүрмээр, бөглөлтөөс. БУЦААЖ БҮҮ НЭМ: гэрээний тоо амьд
 *    хэмжилтийг нууна.
 * ⚠️ `CASHFLOW_NEW` түлхүүр ч хасагдав — энэ ачаалагч cashflow-ийг уншихаа
 *    больсон тул санхүүжилтийн засвар кэшийг нь хуучруулах шаардлагагүй.
 */
export const loadBlockProgress: () => Promise<BlockProgressMap> = memo(
  async () => {
    const m = compute(await loadRows());
    saveCache(m);
    return m;
  },
  ['BAGTS_SHEET'],
);

/**
 * КЭШГҮЙ хувилбар — ЗӨВХӨН хүснэгт рүү БИЧИХ зам (`negtgelAuto.syncNegtgel`).
 *
 * ⚠️ 2026-09-25: `memo` нь TTL-гүй — өөр хэрэглэгчийн бөглөлт ЭНЭ табын кэшийг
 *    хүчингүй болгодоггүй. Хуучин кэшээр бодсон утгыг хүснэгт рүү бичвэл
 *    шинэ табын зөв утгыг дарна. Тиймээс түүхий мөрийг ДАХИН татаж бодно;
 *    дэлгэцийн memo-г ХӨНДӨХГҮЙ (дашбоард анивчихгүй).
 */
export async function loadBlockProgressFresh(): Promise<BlockProgressMap> {
  return compute(await fetchConstruction());
}

/**
 * БАГЦ БҮРИЙН БЛОКИЙН ХУВААРЬ (`BlockUniverse`) — бөглөх хуудсуудын бүдүүвчээс.
 * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): `pkgProgressOf`-ийн «тайлагнаагүй блок 0%»
 *    дүрмийн хуваарь. `loadSchema` кэштэй тул `loadBlockProgress`-ийн дараа нэмэлт
 *    хүсэлтгүй. Бүдүүвч нь бөглөлтөөр өөрчлөгддөггүй тул `BAGTS_SHEET`-д бүртгэхгүй;
 *    алдаа кэшлэгдэхгүй (`memo`) — дараагийн дуудалт дахин оролдоно.
 */
export const loadBlockUniverse: () => Promise<BlockUniverse> = memo(sheetBlockKeys);

/**
 * Багц бүрийн гүйцэтгэл (`pkgProgressOf`) — хэмжилт + хуваарийг хамт ачаална.
 * ⚠️ 2026-10-01: аль нэг нь унавал ШИДНЭ — хуваарьгүйгээр хувь бодвол хуучин
 *    (тайлагнасан блокоор) дүрэм чимээгүй буцаж ирнэ.
 */
export async function loadPkgProgress(fresh = false): Promise<Map<string, PkgProgress>> {
  const [pm, uni] = await Promise.all([
    fresh ? loadBlockProgressFresh() : loadBlockProgress(),
    loadBlockUniverse(),
  ]);
  return pkgProgressOf(pm, uni);
}

/** Блок бүрийн «Б.» мөрийн бүх огноо — цаг хугацааны цувааны эх. */
/* ⚠️ 3.1-ийн cashflow солилт ХАСАГДСАН (`loadBlockProgress`-ийн ⚠️) */
export const loadBlockHistory: () => Promise<BlockHistory> = memo(
  async () => history(await loadRows()),
  ['BAGTS_SHEET'],
);
