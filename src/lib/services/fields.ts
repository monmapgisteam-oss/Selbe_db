import { t as tr } from '@/lib/i18nCore';
import { BAGTS_AJLUUD, GUITS, GAZAR_CH } from './env';

/* ══════════════════════ Барилгын хяналт ══════════════════════ */


/* ══════════════════════ Газар чөлөөлөлт (тусдаа үйлчилгээ) ══════════════════════ */


/**
 * Барилгын үнэлгээ — полигон доторх барилгуудын тоо ба ГАЗАР ЧӨЛӨӨЛӨЛТИЙН
 * үнэлгээ (`NIIT_UNE`, `MKV_UNE`).
 */
export const GAZAR_BUILDING = {
  // test_data [96] selbe_gadna_building — 2026-08-13 шилжив (oid FID→OBJECTID)
  url: `${GAZAR_CH}/150`,
  oid: "objectid",
  fields: {
    /** Барилгын нийт үнэлгээ (₮) */
    value: "niit_une",
    /** 1 м²-ийн үнэ (₮) */
    unitPrice: "mkv_une",
    floors: "davhar_too",
    rooms: "oroo_too",
    type: "torol",
    material: "material",
    name: "building_n",
  },
} as const;

/** Кадастрын нэгж талбар — полигон доторх нэгжийн тоо/талбай/зориулалт */
export const GAZAR_PARCEL = {
  // test_data [95] Selbe_gadna_parcel — 2026-08-13 шилжив
  url: `${GAZAR_CH}/151`,
  oid: "objectid",
  fields: {
    area: "area_m2",
    /** Газрын зориулалт (нэр) */
    landuse: "landuse_de",
    /** Эрхийн төрөл */
    right: "rigth_type",
    parcelId: "parcel_id",
  },
} as const;


/** Барилгын явц · 113 блок */
/**
 * Барилгын блок — 113 полигон.
 */
export const BUILDING = {
  url: `${BAGTS_AJLUUD}/0`,
  oid: "objectid",
  fields: {
    bagts: "bagts",
    block: "blok",
    contractor: "bar_comp",
    floors: "davhar",
    households: "ail_too",
    type: "torol",
  },
} as const;

/* BUS_cashflow (багцын төсөв/эх үүсвэр/сарын олголт) 2026-08-13-нд бүрмөсөн
   хасагдав — санхүүгийн бодит эх нь CASHFLOW_NEW (гэрээ) + HO_IPC (олгосон төлбөр). */

/* ══════════════════════ Санхүүжилт (шинэ харагдац) ══════════════════════ */

/**
 * ХӨРӨНГӨ ОРУУЛАЛТЫН ГҮЙЦЭТГЭЛ — гүйцэтгэгч компанид ОЛГОСОН САНХҮҮЖИЛТ.
 * `HO_guitsetgel_arcgis_csv/196`, 45 мөр, геометргүй.
 *
 * АМЬД ХЭМЖИЛТ (2026-09-09): төсөвт өртөг 2,090.20 тэрбум ₮ · гэрээ
 * 2,005.71 · хэмнэлт 84.49 · олгосон НИЙТ 530.87 (урьдчилгаа 314.01 +
 * гүйцэтгэл 216.86) = гэрээнд эзлэх 26.5%.
 */
export const HO_IPC = {
  url: `${GUITS}/185`,
  oid: "objectid",
  /** `tulult_turul`-ийн утгууд. 2 мөрд хоосон — «ангилагдаагүй» */
  kinds: { advance: "Урьдчилгаа төлбөр", work: "Гүйцэтгэл" },
  /**
   * ГЭРЭЭНИЙ түвшний талбар — `geree_kod` бүрд ДАВТАГДАНА.
   */
  contractFields: {
    code: "geree_kod",              // Гэрээний код «Багц-1» (44/45)
    no: "dugaar",                   // № (44/45)
    pkg: "bagts",                   // Төсөл арга хэмжээний нэр = БАГЦ (44/45)
    project: "tosol_ner",           // Төслийн бүтэн нэр
    contractor: "guitsetgegch",     // Гүйцэтгэгч байгууллага
    workType: "ajliin_turul",       // Барилга угсралт 30 · ГИШСүлжээ 12 · ТЭЗҮ,Судалгаа 3
    contractForm: "geree_helber",   // FIDIC г.м.
    legalBasis: "huuliin_undeslel", // Хуулийн үндэслэл (43/45)
    order1Date: "zahiramj1_ognoo",  // Захирамжийн огноо 1 (45/45)
    order1No: "zahiramj1_dugaar",
    order2Date: "zahiramj2_ognoo",  // (31/45)
    order2No: "zahiramj2_dugaar",
    order3Date: "zahiramj3_ognoo",  // (24/45)
    order3No: "zahiramj3_dugaar",
    contractNo: "geree_dugaar",     // Гэрээний дугаар (37/45)
    amendment: "geree_nemelt",      // «Үгүй» | «Тийм» (37/45)
    budgetTotal: "tosov_niit",      // Нийт төсөвт өртөг /Захирамж/
    budgetBond: "tosov_unet_tsaas",
    budgetCity: "tosov_niislel_tosov",
    budgetSales: "tosov_borluulalt",
    contractTotal: "gereet_tosov_niit",  // Гэрээ байгуулагдсан төсөв
    contractBond: "gereet_unet_tsaas",
    contractCity: "gereet_niislel_tosov",
    contractSales: "gereet_borluulalt",
    saving: "hemnelt_hetrelt",
  },
  /** ТӨЛБӨРИЙН түвшний талбар — мөр БҮРД өөр */
  payFields: {
    id: "murun_id",        // Мөрийн ID «ХО-0001» (45/45 давтагдашгүй)
    year: "on_",
    kind: "tulult_turul",  // Урьдчилгаа төлбөр | Гүйцэтгэл | хоосон(2)
    ipcNo: "ipc_dugaar",
    amount: "dun",         // ТӨЛБӨРИЙН ДҮН, ₮ (43/45 — 2 хоосон)
    payDate: "guilgee_ognoo", // Гүйлгээ хийсэн огноо (40/45)
  },
  emptyFields: ["hul_turiin_san", "hul_ho_helts", "hul_zahialagch"],
  /**
   * ХҮЛЭЭГДЭЖ БУЙ ГҮЙЦЭТГЭЛ — эх үүсвэр бүрээр (2026-09-30, «ТУХ» харагдац).
   */
  pendingFields: { treasury: "hul_turiin_san", ho: "hul_ho_helts", client: "hul_zahialagch" },
} as const;

type Row = Record<string, unknown>;

/** Хоосон/тоо биш → `null`. 0 нь жинхэнэ тэг — `null` БИШ. */
export const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * ТӨЛБӨРИЙН ДҮН — ₮. `null` = БҮРТГЭГДЭЭГҮЙ (45-ийн 2), 0 ТӨЛБӨР БИШ.
 */
export const hoAmount = (r: Row): number | null => {
  const v = r[HO_IPC.payFields.amount];
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * ТӨЛБӨРИЙН ДЭЛГЭЦИЙН КОД.
 */
export const hoPayCode = (r: Row): string => {
  const P = HO_IPC.payFields;
  if (r[P.kind] === HO_IPC.kinds.advance) return tr('Урьдчилгаа');
  const n = r[P.ipcNo];
  return n == null || n === "" ? tr('Гүйцэтгэл') : `IPC-${String(n).padStart(2, "0")}`;
};

/**
 * ХЭМНЭЛТ/ХЭТРЭЛТ = төсөвт өртөг − гэрээт төсөв. `null` = аль нэг нь
 * хэмжигдээгүй.
 */
export const hoSaving = (r: Row): number | null => {
  const C = HO_IPC.contractFields;
  const b = num(r[C.budgetTotal]);
  const g = num(r[C.contractTotal]);
  return b == null || g == null ? null : b - g;
};

/**
 * ГЭРЭЭ ба ХӨРӨНГӨ ОРУУЛАЛТЫН БҮРТГЭЛ — `Cashflow_0909/0` (`Cashflow_final`, 78 мөр).
 *
 *   bagts_tuvshin1 / ajil_tuvshin1  →  «1 · ТЭЗҮ, ЗУРАГ ТӨСӨЛ»
 *   bagts_tuvshin2 / ajil_tuvshin2  →  «1.2 · Инженерийн дэд бүтэц - ТЭЗҮ…»
 *   bagts_tuvshin3 / ajil_tuvshin3  →  «4.1 · Гадна цахилгаан холбоо…»
 *   bagts          / ajil_uilchilgee →  навч: «БАГЦ-5.1 · Ус хангамж…»
 *
 * Хуучин `Tusul`/`Turul` хос нь эдгээрийн эхний хоёр түвшин, `Ded_bagts` нь
 * `bagts` болов (50/53 түлхүүр давхцаж, газрын зургийн холбоос хэвээр).
 */
export const CASHFLOW_NEW = {
  url: `${GUITS}/182`,
  oid: "objectid",
  fields: {
    /**
     * ТӨРӨЛ — задаргааны 2-р түвшин («ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт»).
     */
    type: "ajil_tuvshin2",
    /** ХЭСЭГ — задаргааны 1-р түвшин («ТЭЗҮ, ЗУРАГ ТӨСӨЛ» · «БАРИЛГА УГСРАЛТ») */
    project: "ajil_tuvshin1",
    /**
     * БАГЦ — навчны багц («БАГЦ-5.1»).
     */
    pkg: "bagts",
    pkg2: "bagts",
    pkg74: "bagts_74",
    detail: "ajil_uilchilgee",       // Ажил, үйлчилгээ (ажлын бүтэн нэр)
    /**
     * ХӨРӨНГӨ ОРУУЛАЛТЫН ДҮН (гэрээ болон урьдчилсан тооцоолол) — БҮХ мөнгөн
     * тооцооны эх. Хуучин `Urdch_tusuwt_urtug`-ийн залгамжлагч.
     */
    budget: "ho_dun_geree",
    /** ХО дүн (ЗАХИРАМЖ болон урьдчилсан тооцоолол) — 0909-д ШИНЭ */
    budgetOrder: "ho_dun_zahiramj",
    amountNote: "ho_dungiin_tailbar", // «Гэрээлсэн дүн» г.м.
    startDate: "ehleh_ognoo",         // Төлөвлөгөөт хугацаа эхлэх
    endDate: "duusah_ognoo",          // Төлөвлөгөөт хугацаа дуусах
    orderDate: "zahiramj_ognoo",      // Захирамжийн огноо
    orderNo: "zahiramj_dugaar",       // Захирамжийн дугаар
    orderTotal: "zahiramj_niit_dun",  // Захирамжийн нийт дүн
    /** Үнэт цаасны эх үүсвэрийн эзлэх хувь (0–1 бутархай) */
    share: "zahiramj_unet_tsaas_huvi",
    client: "zahialagch_hynalt_baig",    // Захиалагчийн хяналтын байгууллага
    contractor: "guitsetgegch",          // Гүйцэтгэгч байгууллага
    contractDate: "geree_ognoo",
    contractNo: "geree_dugaar",          // Гэрээний дугаар
    contractAmount: "geree_dun",         // Гэрээний дүн
    advanceGuarantee: "urdchilgaa_batalgaa_dun",
    advancePct: "urdchilgaa_huvi",
    advanceDeduct: "urdchilgaa_zh_zardal",
    progressPct: "guitsetgel_huvi",
    /** Д/Д — Excel B («5.2.1.1») */
    ddKod: "dd_kod",
    /** Эцэг мөрийн Д/Д — Excel-ийн томьёоны модоор (`negtgelTree`) */
    parentKod: "etseg_kod",
    /** Шатлалын түвшин — 0 = үе шат (ТЭЗҮ · … · Барилга угсралт) */
    level: "tuvshin",
    /** Үе шатын нэр (0-р түвшний мөрийн D) */
    phase: "uy_shat",
    /** Блок («5/1», «29/3») — зөвхөн блокийн мөрд */
    block: "blok",
    /** Хэсэгт эзлэх — Excel F (0–1) */
    wSection: "heseg_ezleh_huvi",
    /** Төсөлд эзлэх — Excel G (0–1) */
    wProject: "tusul_ezleh_huvi",
    /** Гэрээ/Хавсралт 5 — төлөвлөгөөт эхлэх/дуусах (Excel H · I) */
    contractStart: "geree_ehleh",
    contractEnd: "geree_duusah",
    /** Гүйцэтгэгчийн төлөвлөгөөт эхлэх/дуусах */
    contractorStart: "guits_ehleh",
    contractorEnd: "guits_duusah",
    /** Газар чөлөөлөлтийн эхлэх/дуусах */
    landStart: "gazar_ehleh",
    landEnd: "gazar_duusah",
    /** Сонгон шалгаруулалтын огноо */
    tenderDate: "songon_ognoo",
    /** Ашиглалтад өгөх огноо */
    handoverDate: "ashiglalt_ognoo",
    /** Сарын мөнгөний эх — 'garaar' (анхдагч, гараар оруулсан сарын мөр) | 'huvaari' (Хуваарь-аас) */
    monthSource: "sar_mongo_eh",
  },
  /**
   * ШАТНЫ ГҮЙЦЭТГЭЛ — гэрээ бүрийн бэлтгэл ажлын явц (0–100).
   */
  stages: {
    tezu: "tezu",
    design: "ajliin_zurag_tusul",
    land: "gazar_chuluulult",
    permit: "zuwshuurul",
    tender: "songon_shalgaruulalt",
    build: "guitsetgel_huvi",
  },
  /**
   * Санхүүжилтийн эх үүсвэр — захирамжийн дүнгийн задаргаа.
   */
  sources: [
    { field: "zahiramj_unet_tsaas", get label() { return tr('Үнэт цаас'); }, color: "#3387b8" },
    { field: "zahiramj_borluulalt_dun", get label() { return tr('Төслийн орлого'); }, color: "#22c55e" },
    { field: "zahiramj_niislel_tusuv", get label() { return tr('Нийслэлийн төсөв'); }, color: "#f59e0b" },
    { field: "zahiramj_nzd_nuuts", get label() { return tr('НЗД нөөц'); }, color: "#a855f7" },
  ],
} as const;

/**
 * АЖЛЫН МӨР Л — сарын cashflow мөрүүдийг ХАСНА.
 */
export const CF_WORK_WHERE = 'cashflow_start IS NULL AND cashflow_id IS NOT NULL';

/**
 * САРЫН МӨР Л — S-Curve-ийн задаргаа.
 */
export const CF_MONTH_WHERE = 'cashflow_start IS NOT NULL';

/** Сарын задаргааны талбарууд — `Cashflow_final` дотор */
export const CF_MONTH = {
  /** Эцэг ажлын дугаар — ажлын мөрийн `Cashflow_ID`-тэй тэнцүү */
  id: "cashflow_id",
  start: "cashflow_start",
  end: "cashflow_end",
  /** Тухайн сард төлөвлөсөн гүйцэтгэлийн хувь — ажил тус бүрд нийлбэр 100 */
  pct: "cashflow_huwi",
  /** `pct` × ажлын `ho_dun_geree` / 100 */
  amount: "cashflow_dun",
} as const;

/**
 * ТӨСЛИЙН НЭГТГЭЛ ГҮЙЦЭТГЭЛ — `Negtgel_guitsetgel_1013/199` (906 мөр).
 */
export const TUSUL_NEGTGEL = {
  url: `${GUITS}/187`,
  oid: "objectid",
  /** Хувийн талбаруудын масштаб — 100 = 0–100 хадгалагдсан */
  scale: 100,
  readOnly: true,
  fields: {
    /** Д/Д — ажлын задаргааны код («5.2.1.1»), нийт мөрд «0» */
    code: "wbs_id",
    /** Багцын дугаар — «Багц-1», «БАГЦ - 19.1» */
    bagts: "pkg_code",
    name: "name",
    /** Урьдчилсан төсөвт өртөг, ₮ */
    budget: "budget",
    /** Хэсэгт эзлэх — эцэг доторх жин (0–100) — Excel F */
    inSection: "share_sec",
    /** Төсөлд эзлэх хувь (0–100) — Excel G */
    inProject: "share_prj",
    /** Гэрээ/Хавсралт 5 — төлөвлөгөөт эхлэх/дуусах (ms) — Excel H · I */
    ctStart: "ct_start",
    ctEnd: "ct_end",
    /** Гүйцэтгэгч — төлөвлөгөөт эхлэх/дуусах («YYYY-MM-DD») — Excel J · K */
    exStart: "ex_start",
    exEnd: "ex_end",
    /** ОСНАУГ/Газар чөлөөлөлт/хуулийн маргаан/Өндөржилт нөлөөлөл — бодит эхлэх/дуусах — Excel L · M */
    actStart: "act_start",
    actEnd: "act_end",
    /** Төлөвлөгөөт хувь (0–100) — гэрээ · гэрээ ГЧ · гүйцэтгэгч · дараа долоо хоног · өмнөх долоо хоног — Excel N…R */
    planGeree: "pln_ct",
    planGch: "pln_ct_adj",
    planGuits: "pln_ex",
    planNextWk: "pln_nextwk",
    planPrevWk: "pln_prevwk",
    /** Гүйцэтгэлийн хувь (0–100) — Excel S */
    actPct: "act_pct",
    /** Төлөвлөгөө биелэлт (0–100) — гэрээ · гэрээ ГЧ · гүйцэтгэгч · долоо хоногийн — Excel T…W */
    perfGeree: "perf_ct",
    perfGch: "perf_ctadj",
    perfGuits: "perf_ex",
    perfWk: "perf_wk",
    /** Үе шат (1-р түвшний нэр) — нийт мөрд хоосон */
    phase: "phase",
    /**
     * СИСТЕМИЙН БОДСОН утга (2026-10-27, хэрэглэгч: «хуучин утгыг дарж бичихгүйгээр шинэ field нээгээд ашиглая»;
     * талбаруудыг хэрэглэгч Enterprise-д өөрөө нэмсэн). Excel-ийн баганууд (`act_pct`, `pln_nextwk` …) ХӨНДӨГДӨХГҮЙ.
     */
    sysAct: "sys_guitsetgel",
    sysNextWk: "sys_next_week",
    sysAt: "sys_shinechilsen",
  },
  sysWrite: true,
} as const;

/**
 * САРЫН ТЭНХЛЭГИЙН ЭХЛЭЛ.
 */
export const MONTH_AXIS_FROM = "2025-09";

/**
 * САРЫН ТЭНХЛЭГ — `MONTH_AXIS_FROM`-оос ӨНӨӨДРИЙГ хүртэл, тасралтгүй.
 */
export function cfMonthAxis(now: Date = new Date()): string[] {
  const out: string[] = [];
  const [fy, fm] = MONTH_AXIS_FROM.split("-").map(Number);
  const nowYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const span = (now.getFullYear() - fy) * 12 + (now.getMonth() + 1 - fm) + 1;
  const limit = Math.min(120, Math.max(1, span));
  if (span > 120) console.warn(`[cfMonthAxis] ${MONTH_AXIS_FROM}…${nowYm} = ${span} сар > 120 — тэнхлэг таслагдав`);
  const skip = Math.max(0, span - limit);
  let y = fy + Math.floor((fm - 1 + skip) / 12);
  let mo = ((fm - 1 + skip) % 12) + 1;
  for (let guard = 0; guard < limit; guard += 1) {
    const label = `${y}-${String(mo).padStart(2, "0")}`;
    out.push(label);
    if (label >= nowYm) break;
    mo += 1;
    if (mo > 12) { mo = 1; y += 1; }
  }
  return out;
}



/**
 * «Гүйцэтгэл бөглөх» хуудасны НЭГТГЭСЭН хүснэгт — бөглөсөн нүд бүр энд НЭМЭГДЭЖ
 * (append) бичигдэнэ, хуучин огноо хэзээ ч дарагдахгүй. Тиймээс нүд бүрийн
 * ХАМГИЙН СҮҮЛИЙН огноотой мөрийг авбал тухайн агшны бүтэн зураг гарна.
 *
 * `dugaar` нь excel-ийн А баганын № — шатлалын цорын ганц үнэн эх сурвалж:
 *   «А.» = Бэлтгэл ажил, «Б.» = БАРИЛГА УГСРАЛТЫН АЖИЛ (барилгын нийт гүйцэтгэл).
 * Б. мөрийн барилга бүрийн нүд нь эх хүснэгт өөрөө бодсон дэд-үе шатын жинтэй
 * нийлбэр — Барилгын хяналтын «нийт гүйцэтгэл» ҮҮНИЙГ шууд авна.
 */
/**
 * БАГЦЫН ГҮЙЦЭТГЭЛИЙН НЭГТГЭЛ — БАТЛАГДСАН үр дүнгийн бүртгэл.
 *
 * Мөр бүр = НЭГ БАГЦЫН, НЭГ АГШНЫ батлагдсан гүйцэтгэл. «Гүйцэтгэл бөглөх»
 * хуудаснаас дөрвөн шатны хяналт өнгөрсний дараа энд бүртгэгдэнэ.
 */
export const BAGTS_NEGTGEL = {
  url: `${GUITS}/190`,
  oid: "objectid",
  fields: {
    /** Агшны огноо — түүхийн тэнхлэг. Багц бүрийн СҮҮЛИЙН мөрийг үүгээр сонгоно */
    date: "burtgesen_ognoo",
    /** Багцын нэр — «Багц 4-1». `bagtsKey()`-ээр нормчилж холбоно */
    bagts: "bagts_ner",
    /** Бодит гүйцэтгэлийн хувь (0–100) */
    progress: "bagts_guitsetgel_huvi_1",
    /** Тухайн огноогоор БАЙХ ЁСТОЙ хувь (0–100) — хоцрогдол эндээс бодогдоно */
    planned: "tolovlogoot_huvi",
    /** Гүйцэтгэсэн обьём */
    volume: "bodit_obyom_1",
    /** Төлөвлөгөөт обьём */
    volumePlan: "tolovlogoot_obyom_1",
  },
} as const;

/**
 * `url` нь 2026-08-29-нд УСТГАГДАВ: `Selbe_guitsetgel_consolidated` нь
 * хаагдсан (499) бөгөөд гүйцэтгэлийн өгөгдөл 2026-08-27-нд амьд `Bagts_*`
 * хуудсууд руу шилжсэн (`blockProgress.fetchConstruction` → `loadSheetRows`).
 * Хаягийг үлдээвэл дараагийн хүн «эх сурвалж нь энэ» гэж уншаад үхсэн
 * үйлчилгээ рүү хүсэлт бичнэ — тиймээс бүрмөсөн хасав.
 */
export const TASK_SHEET = {
  oid: "objectid",
  /** Барилга угсралтын ажлын үе шатын № — нийт гүйцэтгэлийн мөр */
  constructionNo: 'Б.',
  /**
   * Барилга угсралтын ДЭД үе шатууд (Б1…Б5) — «Гүйцэтгэл толгой ажлаар»
   * жагсаалт ЯГ эдгээр таваас бүрдэнэ:
   *   Б1 Барилгын ажил · Б2 Халаалт агаар сэлгэлт · Б3 Цэвэр бохир ус
   *   Б4 Цахилгаан, гэрэлтүүлэг · Б5 Холбоо дохиолол
   */
  subPhaseNos: ['Б1', 'Б2', 'Б3', 'Б4', 'Б5'] as readonly string[],
  fields: {
    bagts: "bagts", // «Багц 4-1»
    no: "dugaar", // № (excel багана А) — «А.», «Б.», «Б1», «1.2», «3»
    level: "tuvshin", // шатлал 1–5 (5 = навч ажил)
    work: "ajil", // ажлын нэр
    date: "ognoo", // YYYY-MM-DD
    version: "huvilbar", // upload багцын хувилбар
    weight: "huviin_jin", // Хувийн жин (толгой мөрөнд 1)
    section: "angilal_b", // давхрын хэсэг — `applySections` стампална
    block: "barilga_blok", // «5/1 барилга» / «5/1 блок»
    progress: "guitsetgel", // гүйцэтгэл 0–1
  },
} as const;

/**
 * № НҮДИЙГ НОРМЧЛОХ ЦОРЫН ГАНЦ ДҮРЭМ — үе шатын мөрийг таних цорын ганц эх.
 *
 *   «Б»                        → «Б.»
 *   «Б.»                       → «Б.»
 *   «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ» → «Б.»
 *   «А»                        → «А.»   (үе шат таних тул `levelFromNo` = 1)
 *   «Б1» · «Б2.1» · «3.2» · «7» → өөрчлөгдөхгүй
 */
export const normalizeTaskNo = (raw: unknown): string => {
  const s = String(raw ?? '').trim();
  // үсэг + (цэг | зай | мөрийн төгсгөл) — цифр залгасныг ОГТ хөндөхгүй
  const m = /^([A-Za-zА-Яа-яӨөҮү])(?:\.|\s|$)/.exec(s);
  return m ? `${m[1]}.` : s;
};

/** Энэ мөр нь БАРИЛГА УГСРАЛТЫН НИЙТ ажил мөн үү (дэд үе шат ОРОХГҮЙ)? */
export const isConstructionNo = (raw: unknown): boolean =>
  normalizeTaskNo(raw) === TASK_SHEET.constructionNo;

/**
 * НИЙТ мөрийг барих ArcGIS SQL предикат — `normalizeTaskNo`-ийн серверийн тал.
 */
export const constructionWhere = (field: string): string => {
  const letter = TASK_SHEET.constructionNo.replace(/\./g, ''); // «Б.» → «Б»
  return `(${field} = N'${letter}' OR ${field} LIKE N'${letter}.%')`;
};

/**
 * Багцын нэр гурван эх сурвалжид гурван янз бичигдсэн:
 *   барилгын давхарга «Багц 4.1» · нэгтгэсэн хүснэгт «Багц 4-1» · master «БАГЦ-4-1»
 * Тэмдэгт/хоосон зайг хасаж том үсгээр жиших — гурвуулаа «БАГЦ41» болно.
 */
export const bagtsKey = (v: unknown) =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[^0-9А-ЯӨҮA-Z]/g, "");

/**
 * ОЛОН БАГЦЫГ ХАМАРСАН мөр мөн үү («БАГЦ 1-4», «БАГЦ 1-6\nБАГЦ 8-17»)?
 *
 * Тиймээс багц↔гэрээ тааруулах бүх газар (Санхүүжилт, Барилгын цогц хяналт)
 * диапазон мөрийг ЭНЭ шалгуураар ЭХЛЭЭД хасна. Диапазоны дүнг тодорхой нэг
 * багцад хуваарилах боломжгүй тул алдагдахгүй — зүгээр л буруу эзэнд очихгүй.
 */
export const isPkgRange = (v: unknown) => {
  const s = String(v ?? "").trim();
  // Олон мөрт нүд («БАГЦ 1-6» + шинэ мөр + «БАГЦ 8-17») — аль нэгд нь ч хамаарахгүй
  if (/[\r\n]/.test(s)) return true;
  // Таслалаар жагсаасан («БАГЦ-6.1, 6.2»)
  if (s.includes(",")) return true;
  // «БАГЦ 1-4», «БАГЦ 1- 4» — ТООН ДИАПАЗОН.
  const m = s.match(/(\d+)\s*[-–—]\s*(\d+)\s*$/u);
  return m != null && Number(m[2]) > Number(m[1]);
};

/**
 * Гэрээний мөрөөс БАГЦЫН түлхүүр. Диапазон/жагсаалт мөрд ХООСОН мөр буцаана —
 * багцын түлхүүрүүд хэзээ ч хоосон биш тул ийм мөр аль ч багцад наалдахгүй.
 * Багц↔гэрээ тааруулах бүх газар `bagtsKey`-ийн ОРОНД энийг хэрэглэнэ.
 */
export const pkgKeyOf = (v: unknown) => (isPkgRange(v) ? "" : bagtsKey(v));

/** «5/1 барилга» / «5/1 блок» → «5/1» (давхаргын `BLOK`-той тааруулах) */
export const blockKey = (v: unknown) =>
  String(v ?? "")
    .trim()
    .split(/\s+/)[0];

/** Барилгын мөрийн түлхүүр — багц + блок хосоор (дэлхийд давтагдашгүй) */
export const buildingKey = (bagts: unknown, block: unknown) =>
  `${bagtsKey(bagts)}|${blockKey(block)}`;

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТ — хоёр тусдаа FeatureServer.
 */
export const PARCEL_LEFT = {
  /**
   * `Selbe_parcel_20260906` [121] `Selbe_jijuur` — 2026-09-06 шилжив
   * (хэрэглэгчийн заасан ХАМГИЙН СҮҮЛИЙН эх).
   *
   *   · `Tuluv` талбар БАЙХГҮЙ БОЛСОН. Хуучин нь ТӨЛӨВ (Бүрэн чөлөөлсөн /
   *     Цэвэрлэсэн / Үлдсэн / Гэрээлсэн) ба ШАЛТГААН (`явцын_мэдээ`) хоёр
   *     ТУСДАА талбар байсныг шинэ эх нь НЭГ талбарт (`явцы_1`) нийлүүлсэн.
   *   · «Цэвэрлэсэн нэгж талбар» (201) ба «Үлдсэн нэгж талбар» (171) гэсэн
   *     ангилал бүрмөсөн АЛГА. Одоо «Бүрэн чөлөөлсөн» (1,945) ба түүнээс
   *     бусад 8 шалтгаан (143) гэсэн ХОЁР ангилал.
   *   · Улмаар чөлөөлөлтийн хувь 89.9% → 93.2% болов (амьд хэмжилт).
   */
  url: `${GAZAR_CH}/152`,
  oid: "objectid",
  fields: {
    /**
     * ТӨЛӨВ ба ШАЛТГААН — НЭГ талбар (`status` ба `progress` хоёулаа энэ).
     *
     * Амьд утгууд (2026-09-06): «Бүрэн чөлөөлсөн» 1,945 · зөвшилцөх 63 ·
     * гэрээлсэн 25 · татгалзсан 19 · үлдэх саналтай 17 · үнийн дүн
     * зөвшөөрөөгүй 9 · маргаантай 5 · дүйцүүлсэн 3 · АТД 2.
     */
    status: 'явцы_1',
    progress: 'явцы_1',
    /**
     * Талбай (м²) — КАДАСТРААС, 2,064/2,088 бөглөгдсөн.
     */
    area: "area_m2",
    /**
     * Гараар бичсэн талбай — `area_m2` хоосон мөрийг НӨХНӨ (140/2,088).
     */
    areaAlt: 'талб_1',
    /**
     * Блок — ЗӨВХӨН 31 мөрд бөглөгдсөн (хуучин эхэд 196). Шинэ эх нь энэ
     * баганыг `_1` бүлэгт АВААГҮЙ тул блокоор бүлэглэсэн задаргаа ХООСОРНО.
     */
    block: 'блок',
    /** Кадастрын нэгж талбарын дугаар (2,063/2,088) */
    parcelNo: "parcel_id",
    /** Эзэмшигчийн овог нэр — `_1` бүлэг (143/2,088) */
    owner: 'овог_1',
    /** Хаяг — `_1` бүлэг (143/2,088) */
    address: 'хаяг_1',
    /**
     * Газрын зориулалт. Хуучин `Төрөл` (текст) АЛГА; шинэ эхэд `Turul` нь
     * ТООН код (" "/1/2/3/4) тул хүнд уншигдахгүй. `Zoriulalt` нь текст
     * («Гэр, орон сууцны хашааны га» 575 …) тул түүнийг авав.
     */
    landuse: "zoriulalt",
    /**
     * Газрын зориулалтын БҮТЭН нэр (кадастр).
     */
    landuseFull: "landuse_de",
    /** Чөлөөлөлтийн тэмдэглэл — `_1` бүлэг (143/2,088) */
    note: 'тайл_1',
  },
} as const;

/**
 * ЧӨЛӨӨЛӨГДСӨН ТӨЛӨВИЙН ЦОРЫН ГАНЦ УТГА.
 */
export const PARCEL_CLEARED = 'Бүрэн чөлөөлсөн';

/** «Чөлөөлөгдсөн» SQL нөхцөл */
export const parcelClearedWhere = () =>
  `${PARCEL_LEFT.fields.status} = N'${PARCEL_CLEARED}'`;

/**
 * «ҮЛДСЭН» (чөлөөлөгдөөгүй) SQL нөхцөл.
 */
export const parcelLeftWhere = () =>
  `(${PARCEL_LEFT.fields.status} IS NULL OR ${PARCEL_LEFT.fields.status} <> N'${PARCEL_CLEARED}')`;

/**
 * Нэгж талбарын ObjectID-уудын SQL — газрын зургийн шүүлт ба `zoomToWhere`-т.
 */
export const parcelOidsWhere = (oids: readonly number[]): string =>
  `${PARCEL_LEFT.oid} IN (${oids.join(',')})`;

export const PARCEL_STATUS_HUES: Record<string, string> = {
  "Бүрэн чөлөөлсөн": "#22c55e",
  гэрээлсэн: "#0ea5e9",
  дүйцүүлсэн: "#eab308",
  зөвшилцөх: "#38bdf8",
  "үлдэх саналтай": "#f59e0b",
  "үнийн дүн зөвшөөрөөгүй": "#f97316",
  татгалзсан: "#dc2626",
  маргаантай: "#e11d48",
  АТД: "#7c3aed",
};

export const PARCEL_PROGRESS_HUES: Record<string, string> = {
  зөвшилцөх: "#0ea5e9",
  "үлдэх саналтай": "#f59e0b",
  "үлдэх саналтай ": "#f59e0b",
  гэрээлсэн: "#22c55e",
  "гэрээлсэн.": "#22c55e",
  "гэрээлсэн. ": "#22c55e",
  дүйцүүлсэн: "#eab308",
  "дүйцүүлсэн ": "#eab308",
  татгалзсан: "#dc2626",
  маргаантай: "#e11d48",
  "үнийн дүн зөвшөөрөөгүй": "#f97316",
  "үнийн дүн зөвшөөрөөгүй ": "#f97316",
  АТД: "#7c3aed",
  гэр: "#94a3b8",
};

/**
 * Гүйцэтгэлийн 4 түвшин.
 */
export const PROGRESS_LEVELS = [
  {
    key: "l1",
    get label() { return tr('Эхэлсэн'); },
    range: "0–25%",
    min: 0,
    max: 25,
    color: "#b91c1c",
  },
  {
    key: "l2",
    get label() { return tr('Явцад'); },
    range: "25–50%",
    min: 25,
    max: 50,
    color: "#f97316",
  },
  {
    key: "l3",
    get label() { return tr('Дуусах шатанд'); },
    range: "50–75%",
    min: 50,
    max: 75,
    color: "#a3e635",
  },
  {
    key: "l4",
    get label() { return tr('Бэлэн болох'); },
    range: "75–100%",
    min: 75,
    max: 101,
    color: "#0d9488",
  },
] as const;


/**
 * ХҮҮХДИЙН ТОГЛООМ — төрлийн жагсаалт (`huuhdiin_togloom/18`, 111 цэг).
 * MapCanvas 2D-д төрөл бүрийг ЭГЦ ДЭЭРЭЭС харсан SVG дүрсээр зурна — өнгө нь
 * эндээс нэг эх сурвалжтай.
 */
export const TOGLOOM_TYPES: { value: string; color: string; kind: "slide" | "swing" | "set" }[] = [
  { value: 'Гулгуур', color: "#f59e0b", kind: "slide" },
  { value: 'Дүүжин', color: "#0ea5e9", kind: "swing" },
  { value: 'Том гулсууран тоглоом', color: "#22c55e", kind: "set" },
];
