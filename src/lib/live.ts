'use client';

/**
 * ТӨСЛИЙН НЭГДСЭН АМЬД ҮЗҮҮЛЭЛТҮҮД — илтгэлээс бэхлэгдсэн ◆ тоонуудын оронд.
 *
 * 2026-08-13: хэрэглэгчийн шийдвэрээр `brief.ts`-ийн бүх ХАТУУ тоо устаж,
 * дашбоард/тайлан/нүүр бүгд ЭНЭ модулийн кэштэй амьд тооцооноос уншина.
 * Амьд эх сурвалжгүй үзүүлэлт ХАРАГДАХГҮЙ (худал тогтмол хэвлэхгүй).
 *
 * Эх сурвалжууд:
 *   · талбай      — хилийн давхарга [97] `Hec_area`
 *   · хүн ам      — барилгын давхарга [108] `Population` нийлбэр
 *                   (⚠️ `Total_population` ХОРИОТОЙ — багтаамжийн дээд тоо)
 *   · өрх/блок    — building_GOL (AIL_TOO) — `useBagtsTable` аль хэдийн амьд
 *   · нийт ХО     — INVEST хүснэгт (баталгаажсан + урьдчилсан)
 *   · нийт явц    — Төсөл_Гүйцэтгэл жигнэсэн дундаж (Σw·a ÷ Σw)
 *   · нийгмийн    — test_data сургууль/цэцэрлэг/урлан/төрийн давхаргууд
 *   · ногоон      — test_data [35] Shape__Area
 */

import { queryFeatures, queryStats, queryGroup, count, sum, type Row } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import {
  BOUNDARY, BUILT_LAYER, BUILT_FIELDS, BUILT_STATUS, CASHFLOW_NEW,
  LAYER_BY_ID, PARCEL_CLEARED, layerUrl, oidOf,
} from '@/lib/services';
import { sumBy, tally } from '@/lib/agg';
import { register, type DataKey } from '@/lib/dataBus';

/**
 * Оршин суух хүн ам — [108]-ийн `Population` талбар.
 * ⚠️ `BUILT_FIELDS.population` (`Total_population`) БИШ: тэр нь багтаамжийн
 * дээд тоо (68 мянга) бөгөөд тооцоонд ХОРИОТОЙ (TRANSPORT_ANALYSIS_HANDOFF).
 */
const POPULATION_FIELD = 'Population';

/**
 * Кэштэй loader — амжилтгүй амлалтыг кэшлэхгүй («дахин оролдох» сэргэнэ).
 *
 * `ttlMs` өгвөл тэр хугацааны дараа дараагийн дуудалт шинээр татна — харагдац
 * хооронд шилжихэд дахин татахгүй, гэхдээ өгөгдөл хуучрахгүй.
 *
 * ⚠️ export (2026-08-21 гүйцэтгэлийн аудит): Finance/Habea зэрэг view бүрийн
 * mount дээр бүтэн хүснэгтүүдээ ДАХИН татдаг байсныг энэ хэвээр кэшилнэ.
 *
 * ⚠️ `reads` (2026-08-28) — тухайн ачаалагч ЯМАР хүснэгтээс уншдагийг зарлана.
 * Тэр хүснэгт рүү бичсэн код `invalidate('…')` дуудахад энэ кэш хаягдаж,
 * дэлгэц дээрх дуудагчид ДАХИН татна. Тагийг өгөхгүй бол кэш нь урьдын адил
 * зөвхөн TTL-ээр л шинэчлэгдэнэ — өөрөөр хэлбэл тагийг МАРТВАЛ хуучин зан
 * хэвээр үлдэнэ, чимээгүй эвдрэхгүй.
 */
export function cached<T>(
  fn: () => Promise<T>,
  ttlMs?: number,
  reads: readonly DataKey[] = [],
): () => Promise<T> {
  let p: Promise<T> | null = null;
  let at = 0;
  if (reads.length) register(() => { p = null; }, reads);
  return () => {
    if (!p || (ttlMs != null && Date.now() - at > ttlMs)) {
      at = Date.now();
      p = fn();
      p.catch(() => { p = null; });
    }
    return p;
  };
}

/* ══════════════ Төсөв — CASHFLOW_NEW (Cashflow_0904 /0) ══════════════ */

export type Budget = {
  /** Урьдчилсан төсөвт өртөг — ₮ */
  total: number;
  /** Захирамжийн нийт дүн — ₮ */
  orderTotal: number;
  /** Гэрээ байгуулах эрх олгосон дүн — ₮ */
  contract: number;
  /** Санхүүжилтийн эх үүсвэр — задраагүй үлдэгдэлтэй */
  sources: { key: string; label: string; value: number }[];
  /** ⚠️ ажлын ТӨРӨЛ (`Turul`)-өөр төсөвт өртөг */
  byType: { key: string; label: string; value: number; n: number }[];
  /** ⚠️ ДЭД багц (`Ded_bagts`)-аар. `key` нь `bagtsKey()`, `label` нь түүхий нэр. */
  byPkg: { key: string; label: string; value: number; n: number }[];
};

/**
 * ТӨСЛИЙН ТӨСВИЙН ЭХ = `Cashflow_0904/0` (CASHFLOW_NEW). «Хөрөнгө оруулалт
 * өртөг» (/249)-ЭЭС ЯЛГААТАЙ: тэр нь олон нийтийн бүсийн хувийн таамаг оруулж
 * 4.16 их наяд хөөргөдөг; энэ нь захирамж/гэрээгээр баталгаажсан ТӨСЛИЙН төсөв.
 *
 * ⚠️ 2026-09-06: `months` (сарын санхүүжилтийн төлөвлөгөө) ба `transferred`
 * («өмнө шилжүүлсэн») ХАСАГДСАН — тэдгээр нь хуучин `cashflow_0813`-ийн САР ба
 * ӨМНӨХ ШИЛЖҮҮЛСЭН мөрүүдээс гардаг байсан бөгөөд шинэ үйлчилгээнд тийм мөр
 * ОГТ БАЙХГҮЙ. Мөрийн төрлийн шүүлт (`where.master`) ч хэрэггүй болсон: одоо
 * хүснэгт бүхэлдээ 76 гэрээ, мөр бүр НЭГ гэрээ.
 */
/**
 * Бүлгийн шошго. ⚠️ Бөглөөгүй нүд ГУРВАН хэлбэртэй: `null`, `'0'`, эсвэл
 * хоосон мөр. `tally` нь `''`/`'0'` хоёрыг «тодорхойгүй» болгодог тул энд
 * `null`-ыг `''` болгож ижил замд оруулна — эс бөгөөс төрөлгүй гэрээнүүд
 * (63 тэрбум ₮) чимээгүй алдагдана.
 */
const cfLabel = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

export const loadBudget = cached<Budget>(async () => {
  const CF = CASHFLOW_NEW.fields;
  const [r, g] = await Promise.all([
    queryStats(CASHFLOW_NEW.url, [
      sum(CF.budget, 'b'), sum(CF.orderTotal, 'o'), sum(CF.contractAmount, 'c'),
      ...CASHFLOW_NEW.sources.map((s, i) => sum(s.field, `s${i}`)),
    ]),
    // ⚠️ Хоёр задаргааг НЭГ groupBy-д — тусад нь асуувал хүсэлт илүү явна.
    //    Огтлолцсон бүлгүүдийг `tally` талбар тус бүрээр нэгтгэнэ.
    queryGroup(CASHFLOW_NEW.url, `${CF.type},${CF.pkg2}`, [
      sum(CF.budget, 'b'), count(CASHFLOW_NEW.oid, 'n'),
    ]),
  ]);

  const total = Number(r.b ?? 0);
  const orderTotal = Number(r.o ?? 0);
  const named: { key: string; label: string; value: number }[] = CASHFLOW_NEW.sources
    .map((s, i) => ({ key: s.field as string, label: s.label as string, value: Number(r[`s${i}`] ?? 0) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  // Захирамжийн дүнгээс эх үүсвэр задраагүй үлдэгдэл (зөрүү нуухгүй)
  const rest = orderTotal - sumBy(named, (x) => x.value);
  if (rest > 0) named.push({ key: 'rest', label: tr('Эх үүсвэр задраагүй'), value: rest });

  return {
    total,
    orderTotal,
    contract: Number(r.c ?? 0),
    sources: named,
    // ⚠️ `n` = ГЭРЭЭНИЙ тоо — мөр бүр нэг гэрээ тул нийт 76.
    byType: tally(
      g,
      (row) => ({ key: cfLabel(row[CF.type]), value: Number(row.b ?? 0), n: Number(row.n ?? 0) }),
      tr('Төрөл тодорхойлоогүй'),
    ).filter((t) => t.value > 0),
    byPkg: tally(
      g,
      (row) => ({ key: cfLabel(row[CF.pkg2]), value: Number(row.b ?? 0), n: Number(row.n ?? 0) }),
      tr('Багц тодорхойлоогүй'),
    ).filter((t) => t.value > 0),
  };
  // ⚠️ Хяналт: Σ byType.value === total байх ёстой.
}, undefined, ['CASHFLOW_NEW']);

export type Headline = {
  /**
   * ⚠️ 2026-08 аудит (олдвор #22): аль нэг эх сурвалж унавал ТУХАЙН эх
   * сурвалжийн тоон талбарууд `NaN`-аар тэмдэглэгдэнэ (`byStatus` нь `[]`).
   * `null` БИШ байх шалтгаан: төрлийг nullable болговол Dashboard зэрэг
   * хэрэглэгчдийн арифметик (`h.investTotal / 1e12` г.м.) олон газар эвдэрнэ;
   * NaN нь тэнд аяндаа тархаж, `num()`/`pct()` «—» гэж зурна, guard-уудад falsy.
   */
  /** Төслийн талбай, га — хилийн `Hec_area` */
  areaHa: number;
  /** Оршин суух хүн ам — барилгуудын `Population` нийлбэр */
  population: number;
  /** ТӨСЛИЙН нийт төсөвт өртөг, ₮ — Cashflow_0904 (`Urdch_tusuwt_urtug`) */
  investTotal: number;
  /** Гэрээгээр баталгаажсан дүн, ₮ — Cashflow_0904 (`Geree_erh_dun`) */
  investConfirmed: number;
  /** Ногоон байгууламжийн талбай, га — test_data [35] */
  greenHa: number | null;
  /**
   * ⚠️ ШИНЭ (2026-08-24) — барилгын ТӨЛӨВИЙН задаргаа (`Barilga_ty`):
   * Төлөвлөсөн / Баригдаж байгаа / Одоо байгаа. `BUILT_STATUS`-ийн дарааллаар,
   * танигдаагүй утга сүүлд.
   */
  byStatus: { label: string; n: number }[];
  /**
   * ⚠️ ШИНЭ — барилгажих талбай, м² (`Барилгажсан_талбай` нийлбэр).
   * ⚠️ Энэ нь давхраар үржсэн НИЙТ шалны талбай (≈152 га), барилгын бодит ХӨЛ
   *    (геометрийн `Shape__Area`, ≈21 га) БИШ. Өртгийн загвар үүн дээр үржинэ.
   */
  usableM2: number;
};

export const loadHeadline = cached<Headline>(async () => {
  const green = LAYER_BY_ID.nogoon;
  /*
   * ⚠️ 2026-08 аудит (олдвор #22): `Promise.all` → `allSettled`. Гурван ӨӨР
   * үйлчилгээг нэгтгэдэг тул урьд нь cashflow унахад огт хамааралгүй
   * «га талбай», «хүн ам» ч хамт унаж, бараг бүх харагдацын SummaryBar
   * «Үзүүлэлт татагдсангүй» болдог байв. Одоо унасан хэсгийн талбарууд NaN
   * (дэлгэцэд «—») болж бусад нь хэвийн гарна; БҮГД унавал л throw —
   * `cached` алдааг кэшлэхгүй тул «дахин оролдох» зам хэвээр.
   */
  const [bR, builtR, budgetR, grR] = await Promise.allSettled([
    queryFeatures(BOUNDARY.plan.url, { outFields: ['Hec_area'] }),
    /*
     * ⚠️ 2026-08-24: `queryStats` → `queryGroup`. ХҮСЭЛТИЙН ТОО ӨӨРЧЛӨГДӨӨГҮЙ
     * (нэг хүсэлт хэвээр) — зөвхөн нэг асуулгаас илүү ихийг авч байна. Урьд нь
     * зөвхөн хүн амын нийлбэр ирдэг байсныг барилгын ТӨЛӨВӨӨР бүлэглэж, мөрийн
     * тоо · хүн ам · барилгажих талбай гурвыг зэрэг татав. Нийлбэрүүдийг клиент
     * талд бүлгүүдээс нэмнэ.
     *
     * ⚠️ Шинэ хүсэлт НЭМЭХГҮЙ гэдэг нь CEO_KPI_PROMPT §0-ийн хатуу шаардлага —
     * тиймээс барилгын төлөвийн задаргааг ТУСДАА асуулга болгосонгүй.
     */
    queryGroup(layerUrl(BUILT_LAYER), BUILT_FIELDS.status, [
      count(oidOf(BUILT_LAYER), 'n'),
      sum(POPULATION_FIELD, 'p'),
      sum(BUILT_FIELDS.usable, 'u'),
    ]),
    loadBudget(),
    green
      ? queryStats(layerUrl(green), [sum('Shape__Area', 'a')]).catch(() => null)
      : Promise.resolve(null),
  ]);
  /* Бүх гол эх сурвалж унасан — хэсэгчлэн үзүүлэх юм алга, алдаагаар нь
     дуудагчид (SummaryBar/ExecKpi-ийн error + retry) мэдэгдэнэ */
  if (bR.status === 'rejected' && builtR.status === 'rejected' && budgetR.status === 'rejected')
    throw bR.reason;
  const b = bR.status === 'fulfilled' ? bR.value : null;
  const built = builtR.status === 'fulfilled' ? builtR.value : null;
  const budget = budgetR.status === 'fulfilled' ? budgetR.value : null;
  const gr = grR.status === 'fulfilled' ? grR.value : null;

  /* ⚠️ Танигдаагүй/хоосон төлөв ХАЯГДАХГҮЙ — «Тодорхойгүй» болж сүүлд жагсана.
     Чимээгүй хаявал нийт барилгын тоо задаргааны нийлбэртэй зөрнө. */
  const order = new Map(BUILT_STATUS.map((x, i) => [x.value, i]));
  const byStatus = (built ?? [])
    .map((r) => ({
      label: String(r[BUILT_FIELDS.status] ?? '').trim() || tr('Тодорхойгүй'),
      n: Number(r.n ?? 0),
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => (order.get(a.label) ?? 99) - (order.get(b.label) ?? 99));

  return {
    areaHa: b ? Number(b[0]?.Hec_area ?? 0) : NaN,
    population: built ? sumBy(built, (r) => Number(r.p ?? 0)) : NaN,
    investTotal: budget ? budget.total : NaN,
    investConfirmed: budget ? budget.contract : NaN,
    greenHa: gr ? Number(gr.a ?? 0) / 10_000 : null,
    byStatus,
    usableM2: built ? sumBy(built, (r) => Number(r.u ?? 0)) : NaN,
  };
  /* ⚠️ TTL (5 мин) — хэсэгчилсэн (NaN-тай) үр дүн session дуустал кэшлэгдэж
     «—» гацахаас сэргийлнэ: `cached` зөвхөн reject-ийг л хаядаг тул TTL-гүй
     бол түр доголдлын үлдэц хэзээ ч засрахгүй байв. */
  /* ⚠️ `reads` (2026-08-29): `loadBudget`-ыг нэгтгэдэг тул төсөв өөрчлөгдөхөд
     энэ ч хуучирна — эс бөгөөс толгойн тоо 5 минут хоцорно. */
}, 5 * 60_000, ['CASHFLOW_NEW']);

/* ══════════════ Төслийн жигнэсэн явц ══════════════ */






/* ══════════════ Багцын гүйцэтгэлийн нэгтгэл ══════════════ */

/** Багц бүрийн СҮҮЛИЙН бүртгэл — төлөвлөгөө vs бодит */
export type PkgProgressRow = {
  /** `bagtsKey()`-ээр хэвийн болгосон түлхүүр */
  key: string;
  /** Түүхий нэр — шошгонд */
  label: string;
  /** Бүртгэсэн огноо, `YYYY-MM-DD` */
  date: string;
  /** Гүйцэтгэл, % */
  actual: number | null;
  /** Төлөвлөгөөт гүйцэтгэл, % */
  planned: number | null;
  /** Бодит эзлэхүүн */
  volume: number | null;
  /** Төлөвлөгөөт эзлэхүүн */
  volumePlan: number | null;
};

/**
 * ⚠️ 2026-09-04: ИРЭЭДҮЙН огноотой мөрийг таслах ЗААГ, epoch ms.
 *
 * ЮУГ: «одоо» гэсэн хатуу агшин БИШ, ӨДРИЙН ТӨГСГӨЛӨӨР таслана.
 *
 * ЯАГААД: ArcGIS-ийн огнооны талбар нь ихэвчлэн UTC шөнө дундаар (00:00Z)
 * тамгалагддаг ба хөтөч нь UTC+8 бүсэд ажилладаг. Хатуу `Date.now()`-оор
 * харьцуулбал «өнөөдөр бүртгэсэн» мөр өдрийн эхний хагаст ирээдүйд тооцогдож
 * САНАМСАРГҮЙ хасагдана. Тиймээс ЛОКАЛ өдрийн төгсгөл ба UTC өдрийн төгсгөл
 * хоёрын АЛЬ ХОЖУУГ нь авна — эргэлзээтэй мөрийг хасахгүй, ҮЛДЭЭНЭ
 * (өгөгдөл нуухгүй зарчим).
 *
 * ⚠️ Буцаж гарах эрсдэл: `Math.max`-ыг `Math.min` болговол UTC+ бүсэд
 * өнөөдрийн бүртгэл дэлгэцээс алга болно.
 */
const futureCutMs = (): number => {
  const now = new Date();
  const local = new Date(now);
  local.setHours(23, 59, 59, 999);
  const utc = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999,
  );
  return Math.max(local.getTime(), utc);
};

/** Дээрх заагийн `YYYY-MM-DD` хэлбэр — `PkgProgressRow.date`-тай харьцуулахад */
const futureCutDay = (): string => new Date(futureCutMs()).toISOString().slice(0, 10);

/**
 * БАГЦЫН ГҮЙЦЭТГЭЛИЙН НЭГТГЭЛ — багц бүрийн ХАМГИЙН СҮҮЛИЙН огноотой мөр.
 *
 * ⚠️ Хүснэгт нь append-only: багц бүрд огноо тутам нэг мөр нэмэгддэг тул
 * сүүлийн мөр л одоогийн байдлыг заана.
 *
 * ⚠️ 2026-08-21-нд ХООСОН байсан; 2026-08-27-нд 7 багц бүртгэгдсэн. Дуудагч
 * тал ҮРГЭЛЖ хоосныг зөвшөөрөх ёстой — бөглөлт үе үе тасалддаг.
 *
 * ⚠️ 2026-09-04 (нэгтгэлийн аудит) — ЭНЭ ХҮСНЭГТИЙН ОДООГИЙН АГУУЛГА НЬ
 *    ТУРШИЛТЫН (seed) ӨГӨГДӨЛ. `tools/negtgel-seed.mjs` нь 7 багц × 12 сар =
 *    84 мөр үүсгэсэн бөгөөд сүүлийн агшин нь 2026-09-28 — өнөөдрөөс 24
 *    хоногийн ИРЭЭДҮЙД. Портал түүнийг бодит гэж уншиж «Багц 1 78%» гэж 4
 *    самбарт зурж байв (бодит бөглөх хуудасны хамралт 0.061%).
 *    Мөрийг УСТГАХГҮЙ (тэр нь хэрэглэгчийн шийдвэр) — зөвхөн ИРЭЭДҮЙН
 *    огноотойг УНШИХГҮЙ. БОДИТ бүртгэл нь ирээдүйд
 *    `hyanaltStore.archiveSubmission` → `negtgelWrite.registerApproved`
 *    замаар, баталсан илгээлт бүрд нэг мөрөөр нэмэгдэнэ.
 */
export const loadPkgProgress = cached<PkgProgressRow[]>(async () => {
  const { BAGTS_NEGTGEL, bagtsKey } = await import('@/lib/services');
  const F = BAGTS_NEGTGEL.fields;
  const rows = await queryFeatures(BAGTS_NEGTGEL.url, {
    outFields: [F.date, F.bagts, F.progress, F.planned, F.volume, F.volumePlan],
    limit: 4000,
  });

  const nOrNull = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };

  /* ⚠️ БҮХ мөрийг буцаана — СҮҮЛИЙНХИЙГ нь БИШ. Хүснэгт нь багц бүрд огноо
     тутам нэг мөр нэмдэг тул бүтэн түүх нь ЦУВАА зурах цорын ганц эх. Зөвхөн
     одоогийн байдал хэрэгтэй дуудагч `latestPkgProgress()`-ыг ашиглана —
     ингэснээр хоёр төрлийн хэрэглэгч НЭГ HTTP хүсэлт хуваалцана. */
  /* ⚠️ 2026-09-04: ИРЭЭДҮЙН огноотой мөрийг ЭНД хасна (дэлгэц дээр биш) —
     `loadPkgProgress` нь энэ хүснэгтийн ЦОРЫН ГАНЦ уншигч тул нэг газарт
     шүүвэл 4 самбар бүгд зэрэг цэвэрлэгдэнэ. Огноогүй (`null`) мөрийг
     ХАЯХГҮЙ: тэр нь ирээдүйн биш, зүгээр л бүртгэлгүй — `date: ''` хэвээр
     үлдэж, дуудагчид өөрсдөө шийднэ (null ≠ 0 зарчим). */
  const cut = futureCutMs();
  let dropped = 0;
  const out: PkgProgressRow[] = [];
  for (const r of rows) {
    const raw2 = String(r[F.bagts] ?? '').trim();
    const key = bagtsKey(raw2);
    if (!key) continue;
    const ts = r[F.date];
    if (ts != null && Number(ts) > cut) { dropped += 1; continue; }
    const date = ts == null ? '' : new Date(Number(ts)).toISOString().slice(0, 10);
    out.push({
      key,
      label: raw2,
      date,
      actual: nOrNull(r[F.progress]),
      planned: nOrNull(r[F.planned]),
      volume: nOrNull(r[F.volume]),
      volumePlan: nOrNull(r[F.volumePlan]),
    });
  }
  /* ⚠️ Өгөгдлийн согогийг НУУХГҮЙ — хасагдсан мөрийн тоог консолд ил гаргана.
     Чимээгүй шүүвэл дараагийн хүн «нэгтгэл хоосон юм байна» гэж эндүүрнэ. */
  if (dropped) {
    console.warn(
      `[selbe] нэгтгэлээс ИРЭЭДҮЙН огноотой ${dropped} мөр хасагдав `
      + `(${rows.length} → ${out.length}); эх нь tools/negtgel-seed.mjs-ийн туршилтын өгөгдөл`,
    );
  }
  /* ⚠️ Шүүсний дараа мөр үлдэхгүй бол ХООСОН массив — «0%» БИШ, «мэдээлэлгүй».
     Дуудагч самбарууд бүгд `list.length === 0`-д `<Empty …>` зурдаг. */
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key, 'mn', { numeric: true }));
}, undefined, ['BAGTS_NEGTGEL']);

/**
 * Багц бүрийн ХАМГИЙН СҮҮЛИЙН огноотой мөр — «одоогийн байдал».
 *
 * ⚠️ Огноо ижил байвал СҮҮЛД ирсэн мөрийг авна: `loadPkgProgress` нь огноогоор
 * эрэмбэлж буцаадаг тул энэ нь хүснэгтэд сүүлд нэмэгдсэнтэй тохирно.
 *
 * ⚠️ 2026-09-04: ИРЭЭДҮЙН огноотой мөрийг ЭНД ДАХИН шүүнэ. `loadPkgProgress`
 * аль хэдийн хассан тул энэ нь давхардсан мэт харагдана — гэвч энэ функц нь
 * export хийгдсэн ЦЭВЭР функц бөгөөд ямар ч мөрийн массивыг хүлээж авдаг
 * (тест, ирээдүйн өөр эх сурвалж). «Сүүлийнх»-ийг сонгодог функц ирээдүйн
 * агшин авбал БҮХ самбарыг нэг дор худал болгодог тул хамгаалалт нь энд ч
 * хэрэгтэй. Огноогүй (`''`) мөр нь `<= зааг` тул үлдэнэ.
 *
 * ⚠️ Хоосон буцаах нь ХҮЧИНТЭЙ хариу — «мэдээлэлгүй», 0% БИШ.
 */
export const latestPkgProgress = (rows: PkgProgressRow[]): PkgProgressRow[] => {
  const cutDay = futureCutDay();
  const last = new Map<string, PkgProgressRow>();
  for (const r of rows) {
    if (r.date && r.date > cutDay) continue;
    const cur = last.get(r.key);
    if (cur && cur.date > r.date) continue;
    last.set(r.key, r);
  }
  return [...last.values()].sort((a, b) => a.key.localeCompare(b.key, 'mn', { numeric: true }));
};

/* ══════════════ Өрх · блок (building_GOL) ══════════════ */

export type HousingTotals = { blocks: number; ail: number };

/** Нүүр/тайланд хөнгөн нийлбэр — гүйцэтгэлийн хүнд join-гүйгээр */
export const loadHousing = cached<HousingTotals>(async () => {
  const { BUILDING } = await import('@/lib/services');
  const s = await queryStats(BUILDING.url, [
    count(BUILDING.oid, 'n'),
    sum(BUILDING.fields.households, 'ail'),
  ]);
  return { blocks: Number(s.n ?? 0), ail: Number(s.ail ?? 0) };
}, undefined, ['BUILDING']);

/* ══════════════ Нийгмийн үйлчилгээний барилга ══════════════ */

export type SocialRow = {
  key: string;
  label: string;
  /** Барилгын тоо */
  n: number;
  /** Хүчин чадал (суудал/ор) — талбар хоосон давхаргад null */
  capacity: number | null;
  /**
   * ⚠️ ШИНЭ — давхарга тус бүрийн задаргаа. `loadSocial` нь давхарга тутамд
   * count+sum аль хэдийн асуудаг байсан бөгөөд дүнг л ХАЯДАГ байв. Шинэ хүсэлт
   * ҮҮСЭХГҮЙ.
   */
  per: { id: string; title: string; n: number; capacity: number | null }[];
};
export type SocialLive = { rows: SocialRow[]; totalN: number };

/** test_data-гийн нийгмийн давхаргууд — каталогийн id-гаар (URL нь TD руу шилжсэн) */
const SOCIAL_GROUPS: { key: string; label: string; ids: string[] }[] = [
  { key: 'school', label: tr('Сургууль'), ids: ['pkg:230', 'pkg:228', 'pkg:232'] },
  { key: 'kinder', label: tr('Цэцэрлэг'), ids: ['pkg:226', 'pkg:234', 'pkg:235', 'pkg:236', 'pkg:237'] },
  { key: 'art', label: tr('Хүүхдийн урлан бүтээх төв'), ids: ['pkg:242'] },
  { key: 'gov', label: tr('Төрийн үйлчилгээ'), ids: ['pkg:243'] },
];

export const loadSocial = cached<SocialLive>(async () => {
  const rows = await Promise.all(
    SOCIAL_GROUPS.map(async (g) => {
      const per = await Promise.all(
        g.ids.map(async (id) => {
          const d = LAYER_BY_ID[id];
          const title = d?.title ?? id;
          if (!d) return { id, title, n: 0, cap: 0, hasCap: false };
          const s = await queryStats(layerUrl(d), [
            count(oidOf(d), 'n'),
            sum('Huchin_chadal', 'cap'),
          ]).catch(async () => {
            // Huchin_chadal байхгүй давхаргад зөвхөн тоог авна
            const c = await queryStats(layerUrl(d), [count(oidOf(d), 'n')]);
            return { ...c, cap: null } as Row;
          });
          const cap = s.cap == null ? null : Number(s.cap);
          return { id, title, n: Number(s.n ?? 0), cap: cap ?? 0, hasCap: cap != null && cap > 0 };
        }),
      );
      const n = sumBy(per, (x) => x.n);
      const hasCap = per.some((x) => x.hasCap);
      const cap = sumBy(per, (x) => x.cap ?? 0);
      return {
        key: g.key,
        label: g.label,
        n,
        capacity: hasCap ? cap : null,
        per: per
          .map((x) => ({ id: x.id, title: x.title, n: x.n, capacity: x.hasCap ? x.cap : null }))
          .filter((x) => x.n > 0),
      };
    }),
  );
  const kept = rows.filter((r) => r.n > 0);
  return { rows: kept, totalN: kept.reduce((s, r) => s + r.n, 0) };
});

/* ══════════════════ Газар чөлөөлөлт — нүүрийн KPI ══════════════════ */

export type Clearance = {
  /** Чөлөөлсөн = «Бүрэн чөлөөлсөн» */
  cleared: number;
  /** Чөлөөлөөгүй = БУСАД БҮГД (шалтгаан нь төлөвийн утга нь өөрөө) */
  remaining: number;
  /** Чөлөөлөөгүй талбайн нийлбэр (га) */
  remainingHa: number;
  total: number;
  /** Чөлөөлсөн хувь (0–100), нийт 0 бол null */
  pct: number | null;
};

/**
 * Газар чөлөөлөлтийн нэгтгэл — `PARCEL_LEFT`-ийн төлөвөөр.
 *
 * ⚠️ 2026-09-06: ХОЁР АНГИЛАЛ. Шинэ эх нь төлөв ба шалтгааныг нэг талбарт
 * нийлүүлсэн тул «Бүрэн чөлөөлсөн» = чөлөөлсөн, БУСАД БҮГД = чөлөөлөөгүй.
 * Урьд нь «Гэрээлсэн» гэсэн төлөв хоёр ангиллын АЛЬ НЬ Ч БИШ байсан тул
 * cleared + remaining ≠ total байв; одоо тэнцэнэ.
 * `land.ts`-ийн `loadLandStatus`-тай ЯГ ижил дүрэм.
 */
/**
 * ⚠️ 2026-09-07-ны гүйцэтгэлийн аудит: энэ ачаалагч урьд нь ӨӨРИЙН
 * `queryGroup`-ыг `PARCEL_LEFT` рүү явуулдаг байсан нь `land.ts`-ийн
 * `loadLandStatus`-ийн ЯГ ижил асуулга байв (хоёул төлөвөөр бүлэглэж тоо ба
 * талбай авдаг). Хоёр тусдаа кэштэй тул нэг хуудсанд ХОЁР ижил хүсэлт явж,
 * 6 слотын дараалалд дэмий зай эзэлдэг байлаа. Одоо ГАНЦ эх сурвалжаас
 * гаргана — хүсэлт нэгээр цөөрч, хоёр тоо хэзээ ч зөрөхгүй болов.
 *
 * ⚠️ ТООНУУД ӨӨРЧЛӨГДӨӨГҮЙ: `loadLandStatus` нь `areaAlt` (гараар бичсэн
 *    талбай) нөхөлт нэмдэг ч шинэ үйлчилгээнд `area_m2 IS NULL AND Талб_1
 *    IS NOT NULL` мөр ЯГ 0 (амьдаар шалгасан) тул үлдсэн талбай 7.6544 га
 *    хэвээр. Хожим тийм мөр гарвал энэ зам нь илүү ЗӨВ дүн өгнө.
 */
export const loadClearance = cached<Clearance>(async () => {
  const { loadLandStatus } = await import('@/lib/land');
  const L = await loadLandStatus();
  const remainingM2 = L.byStatus
    .filter((r) => r.label !== PARCEL_CLEARED)
    .reduce((a, r) => a + r.areaM2, 0);
  return {
    cleared: L.cleared,
    remaining: L.remaining,
    remainingHa: remainingM2 / 10_000,
    total: L.total,
    pct: L.pct,
  };
}, undefined, ['PARCEL_LEFT']);
