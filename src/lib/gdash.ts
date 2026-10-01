'use client';

/**
 * ЕРӨНХИЙ ДАШБОАРД — ӨГӨГДЛИЙН ДАВХАРГА.
 *
 * `GeneralDash.tsx` нь ЗӨВХӨН зурна; тоо бодох ажил бүхэлдээ энд байна.
 * Шалтгаан: цонхны бүрэлдэхүүн болгонд `useMemo` дотор дүн бодуулбал (а)
 * шүүлт солигдох бүрд бүх карт дахин бодогдож, (б) тэр тооцоог ТЕСТЭЛЖ
 * болохгүй болно. Энд бүгд ЦЭВЭР ФУНКЦ — мөрүүд орж, чартын мөр гарна.
 *
 * ⚠️ ЗОХИОМОЛ ТОО БАЙХГҮЙ. Багана хоосон бол чарт хоосон гарна — дүүргэхийн
 * тулд ойролцоо утга бодохгүй. Ганц ҮЛ ХАМААРАХ шийдвэр нь гүйцэтгэлийн хувь
 * (доорх `PROGRESS` тайлбарыг үз).
 */

import { queryFeatures, type Row } from '@/lib/query';
import { cached } from '@/lib/live';
import { t as tr } from '@/lib/i18nCore';
import { dayKey, monthKey } from '@/lib/format';
import {
  CASHFLOW_NEW, CF_WORK_WHERE, CF_MONTH_WHERE, CF_MONTH, HABEA, bagtsKey, isPkgRange,
  BUILDING,
} from '@/lib/services';
import { stageProjectPct } from '@/lib/negtgel';
import {
  FIN_XL_TOTAL_CODE_FIELD, FIN_XL_TOTAL_SKIP, FIN_XL_CHART_FIELDS, finXlChartCat,
  FIN_XL_WORK_SKIP,
} from '@/lib/finExcelLayout';

/* ══════════════════════ CASHFLOW — талбарууд ══════════════════════ */

/**
 * ⚠️ `CASHFLOW_NEW.fields` нь ЗӨВХӨН «Санхүүжилт» харагдацын хүснэгтэд хэрэгтэй
 * цөөн талбарыг нэрлэдэг. Дашбоардад мөнгө, огноо, эх үүсвэрийн багана бүгд
 * хэрэгтэй тул энд БҮТЭН зураглал. Нэг үйлчилгээ, хоёр зураглал байх нь
 * давхардал ч биш: нөгөө нь хүснэгтийн ТУЛГУУР багана, энэ нь ТООЦООНЫ багана.
 */
export const CF = {
  url: CASHFLOW_NEW.url,
  /**
   * WBS-ТАЙ ТААРУУЛАХ ТАЛБАР — 2-р түвшин.
   * ⚠️ ЗӨВХӨН `negtgel.ts`-ийн `TURUL_OF` зураглалд. Тэр нь «ОРОН СУУЦНЫ
   * ХОРООЛОЛ - Барилга угсралт» гэсэн ЯГ ТЭР утгуудаар модтой холбогддог
   * тул энд өөрчилбөл «Гүйцэтгэлийн хувь» индикатор чимээгүй эвдэрнэ.
   * ⚠️ ЧАРТАД ХЭРЭГЛЭХГҮЙ — түүнд `chartType`.
   */
  type: 'ajil_tuvshin2',
  /**
   * ЧАРТЫН АНГИЛАЛ — 1-р түвшин («ТЭЗҮ, ЗУРАГ ТӨСӨЛ» · «БАРИЛГА
   * УГСРАЛТ» · «НИЙГМИЙН ДЭД БҮТЭЦ» · «ГАЗАР ЧӨЛӨӨЛӨЛТ…» · «БОНДЫН ХҮҮ»).
   *
   * ⚠️ 2026-09-09-ны засвар. Урьд нь 2-р түвшнийг ангилал болгодог
   * байсан бөгөөд тэнд «ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт» гэсэн
   * урт нэр, харин НИЙГМИЙН ДЭД БҮТЭЦ ба БОНДЫН ХҮҮ-д 2-р түвшин ХООСОН
   * тул 1-р түвшнээр нөхөгддөг байв. Үр дүнд нь чартын багана ХОЛИМОГ
   * нэршилтэй болж («… - Барилга угсралт» ба «БОНДЫН ХҮҮ» зэрэгцэн),
   * хэрэглэгч «баганы нэршил сонин» гэж заасан.
   */
  /* ⚠️ Ганц талбар ХҮРЭЛЦЭХГҮЙ болсон — `finXlChartCat` хоёр түвшнээс
     бодно. Энэ нь зөвхөн ХУУЧИН дуудагчдад үлдэв. */
  chartType: 'ajil_tuvshin1',
  project: 'ajil_tuvshin1',
  pkg: 'bagts',
  pkg2: 'bagts',
  /** Урьдчилсан төсөвт өртөг — БҮХ мөнгөн тооцооны эх */
  cost: 'ho_dun_geree',
  /**
   * АЖЛЫН БҮТЭН НЭР — «Багц 74» жагсаалтад (2026-09-15).
   * ⚠️ Багцын нэр (`bagts`) нь ОЛОН ажилд давтагддаг тул жагсаалтыг
   *    зөвхөн түүгээр гаргавал мөрүүд ялгагдахгүй.
   */
  detail: 'ajil_uilchilgee',
  /**
   * ХЭСГИЙН КОД — Excel-ийн E баганы «1 · 2 · 5 · 6 · 7».
   * ⚠️ НИЙТ ТӨСВИЙН индикаторын хамрах хүрээг ЭНЭ л шийднэ
   * (`finExcelLayout.ts` → `FIN_XL_TOTAL_CODES`).
   */
  code1: FIN_XL_TOTAL_CODE_FIELD,
  /** Хөрөнгө оруулалтын дүнгийн тайлбар — «Гэрээлсэн дүн» г.м. */
  note: 'ho_dungiin_tailbar',
  start: 'ehleh_ognoo',
  end: 'duusah_ognoo',
  /**
   * НИЙТ ХӨРӨНГӨ ОРУУЛАЛТАД ЭЗЛЭХ ХУВЬ (0–100), 78 мөрийн нийлбэр = 100.
   *
   * ⚠️ 2026-09-09-нд ЗАСАВ. 0904→0909 шилжүүлэг нь талбарын нэрийг МЕХАНИКААР
   * зурагласан тул энэ нь `zahiramj_unet_tsaas_huvi` дээр очсон байв: 0904-д
   * тэр талбарт төслийн эзлэх хувийг (нийлбэр нь яг 100) бичсэн байсан ч
   * 0909-д ижил нэртэй талбар нь ЖИНХЭНЭ үнэт цаасны хувь (0–1 бутархай,
   * нийлбэр 9.13). Улмаар S-муруй 100% биш 9.13% дээр төгсдөг байв.
   * ⚠️ ТООН ихрийг нь заана: `tusuld_ezleh_huvi` нь String(255) тул чарт
   * түүнийг нэмж чадахгүй (`zahiramj_borluulalt`/`_dun` хостой ижил зохион
   * байгуулалт). Хоёулаа 2026-09-09-нд `ho_dun_geree`-ээс бодогдож бичигдсэн.
   */
  share: 'tusuld_ezleh_huvi_dun',
  contract: 'geree_dun',
  decree: 'zahiramj_niit_dun',
  /** Гүйцэтгэлийн хувь — ТЕКСТ талбар («19.01») */
  progress: 'guitsetgel_huvi',
  /**
   * САРЫН ТӨЛӨВЛӨГӨӨТЭЙ ХОЛБОХ ДУГААР.
   * ⚠️ Өнөөдөр `OBJECTID`-тэй тэнцүү боловч ТҮҮГЭЭР холбож БОЛОХГҮЙ:
   * `OBJECTID` нь мөр устгаад дахин нэмэхэд өөрчлөгддөг, `Cashflow_ID` нь
   * хүний оноосон ТОГТВОРТОЙ дугаар («50 дугаар ажил»).
   */
  cfId: 'Cashflow_ID',
} as const;

/** Захирамжийн дүнгийн ЭХ ҮҮСВЭРҮҮД — 3-р чартын ангилал (Category) */
export const CF_SOURCES = [
  { field: 'zahiramj_niislel_tusuv', get label() { return tr('Нийслэлийн төсөв'); } },
  { field: 'zahiramj_nzd_nuuts', get label() { return tr('НЗД нөөц хөрөнгө'); } },
  { field: 'zahiramj_unet_tsaas', get label() { return tr('Үнэт цаасны хөрөнгө'); } },
  { field: 'zahiramj_borluulalt_dun', get label() { return tr('Төслийн орлого'); } },
] as const;

/**
 * ХӨНДЛӨН ШҮҮЛТИЙН ХЭМЖЭЭС — чартын мөр дарахад бусад чартыг нарийсгана.
 *
 * ⚠️ `type` нь ХОЁР чартад (мөнгө ба тоо) хамаарна: тэдгээр нь нэг ангиллыг
 * хоёр өөр нэгжээр хэмждэг тул нэгэн дээр нь сонгоход нөгөө нь ӨӨРӨӨ
 * шүүгдэхгүй, зөвхөн ТОДОРНО.
 */
export type XDim = 'type' | 'source' | 'note';

/**
 * Мөр нь сонголтод НИЙЦЭХ эсэх.
 *
 * ⚠️ `note`-ийн хоосон утга нь `chartNoteAmount`-тай ЯГ ижил дүрмээр
 * («Тайлбаргүй») нөхөгдөнө — эс бөгөөс тэр баганыг дарахад 0 мөр таарна.
 *
 * ⚠️ `source` нь ДҮНГЭЭР шүүнэ (`> 0`), тэнцүүгээр биш: нэг ажил хэд хэдэн
 * эх үүсвэрээс санхүүжиж болно.
 */
export function xMatch(r: CfRow, dim: XDim, key: string): boolean {
  if (dim === 'type') return r.type === key;
  if (dim === 'note') return (r.note || tr('Тайлбаргүй')) === key;
  const i = CF_SOURCES.findIndex((s) => s.field === key);
  return i >= 0 && r.src[i] > 0;
}

/** «Гэрээ хийсэн» гэдгийг тодорхойлох утга — 2, 3-р чартын дэд цуваа */
export const CONTRACTED = 'Гэрээлсэн дүн';

export type CfRow = {
  oid: number;
  type: string;
  project: string;
  pkg: string;
  /** Дэд багц (`Ded_bagts`) — газрын зургийн давхаргатай холбогдох ТҮЛХҮҮР */
  pkg2: string;
  cost: number;
  note: string;
  start: number | null;
  end: number | null;
  share: number;
  /** Захирамжийн дүн нийт дүн — ОЛГОСОН дүн */
  decree: number;
  /**
   * Гүйцэтгэлийн хувь, 0–100.
   *
   * ⚠️ Үйлчилгээнд ТЕКСТ талбар («19.01») тул `Number()`-ээр хөрвүүлнэ.
   * ⚠️ `null` ба `0` ХОЁР ӨӨР: «хэмжигдээгүй» ба «огт эхлээгүй». Хоёуланг
   * нь 0 болговол дундаж чимээгүй доошилно.
   */
  progress: number | null;
  /** Эх үүсвэр бүрийн дүн — `CF_SOURCES[i].field` дарааллаар */
  src: number[];
  /**
   * ШАТНЫ ГҮЙЦЭТГЭЛ — гэрээ бүрийн 6 шатны хувь (`CASHFLOW_NEW.stages`).
   *
   * ⚠️ Индикаторын «Гүйцэтгэлийн хувь» ЭНДЭЭС бодогдоно, `progress` талбараас
   * БИШ: тэр нь зөвхөн БАРИЛГА УГСРАЛТЫН явц (19.1%) бөгөөд төслийн бэлтгэл
   * ажлыг (ТЭЗҮ · зураг төсөл · газар · зөвшөөрөл · сонгон шалгаруулалт)
   * огт тооцдоггүй.
   * ⚠️ `null` ба `0` ХОЁР ӨӨР — хэмжилтгүй шат дунджид ОРОХГҮЙ.
   */
  stage: Record<string, number | null>;
  /**
   * ЕРӨНХИЙ НИЙЛБЭРТ ОРОХ УУ — Excel-ийн мөр 7-ийн `=+I8+I21` томьёо.
   *
   * ⚠️ Нийгмийн дэд бүтэц (5) · газар чөлөөлөлт (6) · бондын хүү (7) — гурван
   * хэсэг, нийт 1,058 тэрбум) эх файлын НИЙТ дүнд ОРДОГГҮЙ. Мөрүүд нь
   * чарт, хүснэгт, шүүлтэд ХЭВЭЭР — зөвхөн «Нийт төсөв» индикаторт ордоггүй.
   */
  inTotal: boolean;
  /** Сарын төлөвлөгөөтэй холбогдох тогтвортой дугаар (1…78) */
  cfId: number | null;
  /**
   * ЗАДАРГААНЫ 3-Р ТҮВШИН («Гадна цахилгаан холбоо, дохиолол»).
   * ⚠️ ЗӨВХӨН инженерийн дэд бүтцэд бөглөгдсөн; бусад хэсэгт ХООСОН.
   * «Төслийн гүйцэтгэл» чартын нэг мөр үүнээс бодогддог тул хэрэгтэй.
   */
  lvl3: string;
  /**
   * ЖИНХЭНЭ АЖИЛ МӨН ҮҮ — «Багц ажлын тоо» индикаторын хамрах хүрээ
   * (2026-09-10, хэрэглэгчийн засвар: «78 биш 74»).
   *
   * ⚠️ Үйлчилгээний 78 мөрөөс «6 ГАЗАР ЧӨЛӨӨЛӨЛТ, БУУЛГАЛТ ЦЭВЭРЛЭГЭЭ»
   * хэсгийн ДӨРӨВ хасагдаж 74 үлдэнэ (2026-09-10, хэрэглэгчийн заавар).
   * Тэдгээр нь газар эзэмшигчтэй хийх НӨХӨН ОЛГОВОР/цэвэрлэгээ бөгөөд
   * гүйцэтгэгчтэй байгуулах ажлын багц БИШ.
   *
   * ⚠️ Урьд нь «хасах/хасуулах» гэсэн тайлбартай хоёр мөр ба «БОНДЫН ХҮҮ»
   * гурвыг хасаж 75 гаргаж байв — хэрэглэгч 2026-09-10-нд «буруу 3 мөрийг
   * хассан байна» гэж залруулав.
   *
   * ⚠️ ЗӨВХӨН ТООЛОЛТОД. Мөнгөн нийлбэр (`inTotal`), чарт, шүүлт,
   *    газрын зураг БҮГД тэдгээр мөрийг ХЭВЭЭР авна — хасагдах шийдвэр
   *    нь тайлбарын талбарт бичигдсэн бөгөөд эх Excel-д мөр нь байсаар
   *    байна (`мөр устгахгүй` дүрэм).
   */
  isWork: boolean;
  /** Ажлын бүтэн нэр (`ajil_uilchilgee`) — жагсаалтад харагдана */
  name: string;
  /**
   * ТАЙЛАНГИЙН ХЭСГИЙН КОД (`bagts_tuvshin1`) — «1» ТЭЗҮ … «7» бондын хүү.
   * ⚠️ Чартаас газрын зураг руу холбоход хэрэгтэй: газар чөлөөлөлтийн
   *    мөрүүд багцын давхаргагүй ч НЭГЖ ТАЛБАРЫН давхаргатай.
   */
  sec: string;
};

const nOf = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
/** ⚠️ 2026-09-25: `null`/хоосон → `null` (0 БИШ) — `Number(null)` нь 0 болдог тул тусад нь шалгана */
const nnOf = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const sOf = (v: unknown): string => String(v ?? '').trim();
/** Хувь — ТЕКСТЭЭС тоо руу; хоосон бол `null` (0 БИШ) */
const pOf = (v: unknown): number | null => {
  const t = String(v ?? '').trim();
  if (!t) return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
};

const dOf = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};

export const loadGdashCf = cached<CfRow[]>(async () => {
  const rows = await queryFeatures(CF.url, {
    where: CF_WORK_WHERE,
    outFields: [
      'OBJECTID', CF.type, CF.project, CF.pkg, CF.cost, CF.note, CF.detail,
      ...FIN_XL_CHART_FIELDS,
      /* ⚠️ «Төслийн гүйцэтгэл» чартын нэг мөр 3-р түвшнээс бодогдоно */
      'ajil_tuvshin3',
      CF.start, CF.end, CF.share, CF.contract, CF.decree, CF.progress, CF.pkg2,
      CF.code1, CF.cfId,
      ...CF_SOURCES.map((s) => s.field),
      ...Object.values(CASHFLOW_NEW.stages),
    ],
    limit: 4000,
  });
  return rows.map((r: Row): CfRow => ({
    oid: nOf(r.OBJECTID),
    /* ⚠️ ЧАРТЫН ангилал — 7 бүлэг (`finXlChartCat`-ийн тайлбарыг үз).
       Талбараас ШУУД биш, ХОЁР ТҮВШНЭЭС бодогдоно. */
    type: finXlChartCat(r) || tr('Тодорхойгүй'),
    project: sOf(r[CF.project]),
    pkg: sOf(r[CF.pkg]),
    pkg2: sOf(r[CF.pkg2]),
    cost: nOf(r[CF.cost]),
    note: sOf(r[CF.note]),
    start: dOf(r[CF.start]),
    end: dOf(r[CF.end]),
    share: nOf(r[CF.share]),
    decree: nOf(r[CF.decree]),
    progress: pOf(r[CF.progress]),
    src: CF_SOURCES.map((s) => nOf(r[s.field])),
    /* ⚠️ `Guitsetgel_huwi` нь ТЕКСТ, бусад нь тоо — `pOf` хоёуланг зөв уншина */
    stage: Object.fromEntries(
      Object.values(CASHFLOW_NEW.stages).map((f) => [f, pOf(r[f])]),
    ),
    inTotal: !FIN_XL_TOTAL_SKIP.includes(sOf(r[CF.code1])),
    cfId: dOf(r[CF.cfId]),
    lvl3: sOf(r.ajil_tuvshin3),
    /* ⚠️ КОДООР шүүнэ, нэрээр БИШ — нэр засагдаж болно (`finXlInTotal`) */
    isWork: !FIN_XL_WORK_SKIP.includes(sOf(r[CF.code1])),
    name: sOf(r[CF.detail]),
    sec: sOf(r[CF.code1]),
  }));
}, undefined, ['CASHFLOW_NEW']);

/* ══════════════════════ САРЫН ТӨЛӨВЛӨГӨӨ (S-МУРУЙ) ══════════════════════ */

/**
 * НЭГ АЖЛЫН НЭГ САРЫН ТӨЛӨВЛӨГӨӨТ ГҮЙЦЭТГЭЛ.
 *
 * ⚠️ ЭДГЭЭР НЬ `Cashflow_final`-ИЙН ДОТОРХ НЭМЭЛТ МӨРҮҮД, тусдаа хүснэгт
 * БИШ (2026-09-09-ны шийдвэр). Ажлын мөрөөс `Cashflow_start` бөглөгдсөнөөр
 * ялгагдана — `CF_MONTH_WHERE` / `CF_WORK_WHERE` хос нь хүснэгтийг
 * огтлолцолгүй хуваана.
 */
export type CfPlanRow = {
  /** Эцэг ажлын `Cashflow_ID` */
  id: number;
  /** Тухайн сарын эхлэл (epoch мс) */
  start: number | null;
  /** Тэр сард төлөвлөсөн гүйцэтгэлийн хувь — ажил тус бүрд нийлбэр 100 */
  pct: number | null;
  /** `pct` × ажлын ХО дүн / 100 (үйлчилгээнд бодогдсон) */
  amount: number | null;
};

/**
 * ⚠️ ХООСОН БУЦАЖ БОЛНО — хүн хараахан бөглөөгүй бол `timeline` нь хуучин
 * ЖИГД ТАРААХ аргаараа ажиллана. Тиймээс энэ өгөгдөл нэмэгдэх нь ямар ч
 * харагдацыг эвдэхгүй, зөвхөн НАРИЙВЧЛАЛЫГ сайжруулна.
 */
export const loadCfPlan = cached<CfPlanRow[]>(async () => {
  const rows = await queryFeatures(CF.url, {
    where: CF_MONTH_WHERE,
    outFields: [CF_MONTH.id, CF_MONTH.start, CF_MONTH.pct, CF_MONTH.amount],
    limit: 8000,
  });
  return rows
    .map((r: Row): CfPlanRow => ({
      id: nOf(r[CF_MONTH.id]),
      start: dOf(r[CF_MONTH.start]),
      /* ⚠️ `null` ≠ 0: бөглөөгүй сар төлөвлөгөөнд ОРОХГҮЙ, 0% гэж тооцвол
         тэр ажлын муруй хиймлээр хавтгайрна. */
      pct: pOf(r[CF_MONTH.pct]),
      amount: pOf(r[CF_MONTH.amount]),
    }))
    /* ⚠️ `pct` ЭСВЭЛ `amount`-ийн аль нэг нь байхад л хангалттай: муруйд
       хувь, чартад мөнгө хэрэгтэй бөгөөд хоёулаа зэрэг бөглөгддөггүй. */
    .filter((r) => r.id > 0 && r.start != null && (r.pct != null || r.amount != null));
}, undefined, ['CASHFLOW_NEW']);


/* ══════════════════════ ХУГАЦААНЫ ШҮҮЛТ ══════════════════════ */

/**
 * ХУГАЦААНЫ ШҮҮЛТ — ГУРВАН ХЭМЖЭЭС, тус бүр нь ОЛОН СОНГОЛТТОЙ.
 *
 * ⚠️ ХООСОН МАССИВ = «бүгд». `null` ашиглаагүй шалтгаан: «юу ч сонгоогүй» ба
 * «бүгдийг сонгосон» хоёр ИЖИЛ утгатай тул хоёр өөр төлөв барих нь зөрчил
 * үүсгэнэ (UI сүүлийн чагтыг тайлахад аль руу нь буцахаа мэдэхгүй болно).
 */
export type Period = {
  years: number[];
  /** 1–4 */
  quarters: number[];
  /** 1–12 */
  months: number[];
};

export const NO_PERIOD: Period = { years: [], quarters: [], months: [] };

export const periodActive = (p: Period) =>
  p.years.length > 0 || p.quarters.length > 0 || p.months.length > 0;

/** Сонголтод байгаа эсэх — хоосон олонлог нь БҮГДИЙГ хүлээн авна */
const hit = (sel: number[], v: number) => sel.length === 0 || sel.includes(v);

/**
 * Ажил сонгосон хугацаанд ХАМААРАХ эсэх.
 *
 * ⚠️ Огнооны ЦЭГЭЭР биш, ХУГАЦААНЫ ДАВХЦЛААР: ажил бүр [эхлэх, дуусах]
 * интервалтай тул «2026 он» гэдэгт 2025-д эхлээд 2027-д дуусах ажил ЗААВАЛ
 * орно. Эхлэх огноогоор шүүвэл олон жилийн ажил дунд жилүүддээ алга болж,
 * S-муруй тасарна.
 *
 * ⚠️ АРГА: интервалын САР бүрийг гүйлгэж, аль нэг сар нь гурван хэмжээст
 * ЗЭРЭГ тохирвол ажил хамаарна. Ингэснээр «2026 · 2-р улирал» гэх мэт
 * ХОСЛОЛ нэмэлт дүрэмгүйгээр зөв ажиллана — цонх бодох, жилгүй улирлыг
 * тусад нь боловсруулах шаардлагагүй.
 *
 * ⚠️ ОГНООГҮЙ мөр шүүлт ИДЭВХТЭЙ үед ГАРНА — «мэдэгдэхгүй» нь «хамаарна»
 * гэсэн үг биш. Шүүлтгүй үед бүгд орно.
 */
export function inPeriod(r: CfRow, p: Period): boolean {
  if (!periodActive(p)) return true;
  const a = r.start;
  const b = r.end ?? r.start;
  if (a == null || b == null) return false;

  const s = new Date(a);
  const e = new Date(b);
  let y = s.getUTCFullYear();
  let m = s.getUTCMonth();
  const ey = e.getUTCFullYear();
  const em = e.getUTCMonth();

  /* ⚠️ 480 = 40 жилийн хамгаалалт: өгөгдлийн алдаанаас болж хөлдөхөөс
     сэргийлнэ (бодит муж 2024–2029). */
  for (let i = 0; i < 480 && (y < ey || (y === ey && m <= em)); i += 1) {
    if (hit(p.years, y) && hit(p.quarters, Math.floor(m / 3) + 1) && hit(p.months, m + 1)) {
      return true;
    }
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return false;
}

/** Өгөгдөлд БОДИТООР байгаа жилүүд — шүүлтийн сонголтыг гараар жагсаахгүй */
export function yearsOf(rows: CfRow[]): number[] {
  const set = new Set<number>();
  for (const r of rows) {
    if (r.start == null) continue;
    const a = new Date(r.start).getUTCFullYear();
    const b = new Date(r.end ?? r.start).getUTCFullYear();
    for (let y = a; y <= b && y - a < 40; y += 1) set.add(y);
  }
  return [...set].sort((a, b) => a - b);
}

/* ══════════════════════ ЧАРТЫН МӨРҮҮД ══════════════════════ */

export type SubBar = {
  key: string;
  label: string;
  /** Гол утга — багана бүхэлдээ */
  value: number;
  /** Дэд цуваа — багана дотор өнгөт хэсэг */
  sub: number;
  /** Дэлгэцэд бичих текст (мөнгө/тоо форматлагдсан) */
  display?: string;
  subDisplay?: string;
  /**
   * АЖЛЫН ТОО ба тэднээс ГЭРЭЭЛСЭН нь — мөнгөн чартын хажуугийн хэмжигдэхүүн.
   *
   * ⚠️ Заавал БИШ. `value`/`sub` нь МӨНГӨ хэвээр: багана нь дүнгээр
   * хэмжигдэнэ, тоо нь зөвхөн hover-т гарна. Хоёуланг нь нэг зурваст
   * оруулах гэвэл аль хэмжээсээр уншихаа нүд мэдэхгүй болно.
   */
  count?: number;
  countSub?: number;
  /**
   * БОДИТ ГҮЙЦЭТГЭЛ — өртгөөр ЖИГНЭСЭН хувь (0–100), эсвэл `null`.
   *
   * ⚠️ `null` ≠ 0: «хэмжигдээгүй» ба «огт эхлээгүй» хоёр өөр мэдэгдэл.
   * Хэмжигдээгүйг 0 гэж бичвэл «хийгдээгүй» гэсэн ХУДАЛ баталгаа болно.
   *
   * ⚠️ ЭНГИЙН ДУНДАЖ БИШ: 1.5 тэрбумын ажлын 100% ба 448 тэрбумын ажлын 27%
   * тэнцүү жинтэй байж болохгүй (индикаторын тооцоотой нэг зарчим).
   */
  perf?: number | null;
  /**
   * САНХҮҮЖСЭН ГҮЙЦЭТГЭЛ — ЗӨВХӨН `guitsetgel_huvi`-ийн жигнэсэн дундаж.
   *
   * ⚠️ `perf`-ЭЭС ЯЛГААТАЙ: тэр нь барилга угсралтад объёмын эх сурвалж
   * руу шилждэг бол энэ нь ҮРГЭЛЖ санхүүжсэн талбараас. Хоёуланг зэрэг
   * харуулах нь «санхүүжилт хаана явна, биет ажил хаана явна» гэсэн
   * зөрүүг ил гаргана (2026-09-10, хэрэглэгчийн хүсэлт).
   * ⚠️ `null` ≠ 0 — хэмжигдээгүй бол тэмдэг ОГТ зурагдахгүй.
   */
  fin?: number | null;
  /**
   * ⚠️ 2026-09-29 (аудит 10): «НИЙТ ТӨСӨВ» ИНДИКАТОРТ ОРОХ УУ (`CfRow.inTotal`).
   * Мөнгөн чартын «Нийт төсвийн X%» суурь нь ЗӨВХӨН эдгээр мөрийн нийлбэр
   * байх ёстой — эс бөгөөс «ГАЗАР ЧӨЛӨӨЛӨЛТ» (нийт томьёоны гадна) «Нийт
   * төсвийн 15.2%» гэж бичигдэж, дэлгэц дээрх индикатортой зөрдөг байв.
   * `undefined` = ялгаагүй чарт (эх үүсвэр) — бүх мөр суурьт орно.
   */
  inTotal?: boolean;
};

const groupSum = (
  rows: CfRow[],
  keyOf: (r: CfRow) => string,
  valOf: (r: CfRow) => number,
  subOf: (r: CfRow) => number,
): SubBar[] => {
  const m = new Map<string, { value: number; sub: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const g = m.get(k) ?? { value: 0, sub: 0 };
    g.value += valOf(r);
    g.sub += subOf(r);
    m.set(k, g);
  }
  return [...m]
    .map(([key, v]) => ({ key, label: key, ...v }))
    .sort((a, b) => b.value - a.value);
};

/**
 * ӨРТГӨӨР ЖИГНЭСЭН ДУНДАЖ, ангиллаар.
 *
 * ⚠️ ЭНГИЙН ДУНДАЖ БИШ: 500 тэрбумын ажлын 30% ба 1 тэрбумынхны 100% тэнцүү
 * жинтэй байж болохгүй — бодит явцыг хоёр дахин үнэлнэ.
 * ⚠️ Хэмжигдээгүй мөр (`pick` нь `null`) хуваарь, хүртвэр ХОЁУЛАНД ч орохгүй.
 * 0 гэж тооцвол бөглөөгүй ажил дундажийг чимээгүй доошилно.
 */
function weighted(
  rows: CfRow[],
  pick: (r: CfRow) => number | null,
): Map<string, number> {
  const w = new Map<string, { top: number; base: number }>();
  for (const r of rows) {
    if (!r.type || r.cost <= 0) continue;
    const p = pick(r);
    if (p == null) continue;
    const a = w.get(r.type) ?? { top: 0, base: 0 };
    a.top += (r.cost * p) / 100;
    a.base += r.cost;
    w.set(r.type, a);
  }
  return new Map(
    [...w].filter(([, a]) => a.base > 0).map(([k, a]) => [k, (a.top / a.base) * 100]),
  );
}
/**
 * 1-р чарт — ТӨРӨЛ × Урьдчилсан төсөвт өртөг, дотор нь ГЭРЭЭЛСЭН хэсэг.
 *
 * ⚠️ ДЭД ЦУВАА нь ГҮЙЦЭТГЭЛ БИШ, ГЭРЭЭЛСЭН ДҮН (2026-09-07, хэрэглэгчийн
 * шийдвэр). «Хөрөнгө оруулалтын дүнгийн тайлбар» (`HO_dungiin_tailbar`)-ын
 * «Гэрээлсэн дүн» утгаар шүүнэ — өөрөөр хэлбэл «төсвийн хэдэн хувь нь гэрээ
 * болсон бэ». Гүйцэтгэлийн хувь нь тусдаа индикатор ба «Гэрээлсэн байдал,
 * бодит гүйцэтгэл» чартад үлдэнэ.
 *
 * ⚠️ ОЛГОЛТ (`Zahiramj_niit_dun`) ЭНЭ ЧАРТААС ХАСАГДСАН: захирамжийн дүн нь
 * төсвөөс давж болдог тул (амьдаар 103.5%, 107.4%) нэг зурвасын дотор
 * «хэдэн хувь» гэж уншигдахад төөрөгдөл төрүүлдэг байв.
 *
 * ⚠️ АЖЛЫН ТОО ч хамт: «хэдэн төгрөг» ба «хэдэн ажил» хоёр өөр хариу өгдөг
 * тул hover-т хоёуланг нь харуулна.
 */
export function chartTypeCost(
  rows: CfRow[],
  /**
   * БАРИЛГА УГСРАЛТЫН ОБЪЁМООР бодогдсон гүйцэтгэл — `bagtsKey` → % (0–100).
   * ⚠️ `chartTypeCount`-тэй ИЖИЛ эх сурвалж: хоёр чарт нэгдсэн тул нэг тоо
   * л байх ёстой (2026-09-10, хэрэглэгчийн заавар).
   */
  pkgPct: Map<string, number> = new Map(),
  /**
   * АНГИЛЛЫН ИЛ ДАРАХ ГҮЙЦЭТГЭЛ — ангиллын нэр → % (0–100).
   *
   * ⚠️ Зарим ангиллын бодит гүйцэтгэл нь гэрээний мөрөөс БИШ ӨӨР самбараас
   * гардаг: «ОРОН СУУЦНЫ ХОРООЛОЛ» нь «Багцын гүйцэтгэл» хуудасны
   * биет хувь (2026-09-10, хэрэглэгчийн заавар; 2026-09-30-аас ХО дүнгээр жигнэсэн — `housingPct`). Тэр үед мөр
   * тус бүрийн тооцоог БҮХЭЛД НЬ дарна — эс бөгөөс нэг үзүүлэлт хоёр
   * самбарт хоёр өөр тоо харуулна.
   */
  catPct: Map<string, number> = new Map(),
): SubBar[] {
  const bars = groupSum(
    rows,
    (r) => r.type,
    (r) => r.cost,
    (r) => (r.note === CONTRACTED ? r.cost : 0),
  );
  const cnt = new Map<string, { n: number; c: number }>();
  /* ⚠️ 2026-09-29 (аудит 10): ангилал «Нийт төсөв»-т ордог уу — `SubBar.inTotal` */
  const inTot = new Set<string>();
  for (const r of rows) {
    if (!r.type) continue;
    const a = cnt.get(r.type) ?? { n: 0, c: 0 };
    a.n += 1;
    if (r.note === CONTRACTED) a.c += 1;
    cnt.set(r.type, a);
    if (r.inTotal) inTot.add(r.type);
  }
  /* ⚠️ ГҮЙЦЭТГЭЛИЙН ХОЁР ХЭМЖҮҮР нь одоо ЭНЭ чартад ирнэ: «Гэрээлсэн байдал,
     бодит гүйцэтгэл» чарттай НЭГТГЭГДСЭН (2026-09-10). Хоёр чарт нэг
     ангиллыг хоёр өөр нэгжээр хэмждэг тул зэрэгцүүлэн уншихад нүд хоёр
     удаа гүйх шаардлагатай байв. */
  /* ⚠️ 2026-09-30: `perf` = ЗӨВХӨН БИЕТ (объёмын) хувь. Урьд нь объёмын эх
     сурвалжгүй мөрд санхүүжсэн `r.progress` (`guitsetgel_huvi`) руу чимээгүй
     УНАЖ, нэг ангилал дотор биет ба санхүүгийн хувийг ХОЛЬЖ жигнэдэг байв —
     хоёр өөр хэмжигдэхүүний дундаж нь юуг ч хэмждэггүй тоо (`PkgFin`
     «Төслийн төрөл»-ийн ижил шийдвэр). Одоо биет хэмжилтгүй мөр `null` —
     хуваарьт орохгүй; санхүүжсэн хувь `fin`-д ТУСДАА шошготой хэвээр. */
  const w = weighted(rows, (r) => (r.pkg2 ? pkgPct.get(bagtsKey(r.pkg2)) ?? null : null));
  const wf = weighted(rows, (r) => r.progress);
  return bars.map((b) => ({
    ...b,
    count: cnt.get(b.key)?.n ?? 0,
    countSub: cnt.get(b.key)?.c ?? 0,
    /* ⚠️ Ангиллын ил утга ДАВАМГАЙЛНА (`catPct`-ийн тайлбарыг үз) */
    perf: catPct.get(b.key) ?? w.get(b.key) ?? null,
    fin: wf.get(b.key) ?? null,
    inTotal: inTot.has(b.key),
  }));
}

/**
 * 2-р чарт — ТӨРӨЛ × төслийн ТОО, дотор нь ГЭРЭЭЛСЭН ажлын тоо.
 *
 * ⚠️ БОДИТ ГҮЙЦЭТГЭЛ ч хамт (2026-09-07, хэрэглэгчийн хүсэлт): чартын нэр
 * «Гэрээлсэн байдал, бодит гүйцэтгэл» гэж хоёуланг амласан атлаа зөвхөн
 * гэрээ харагддаг байв. Зурвасын урт нь ГЭРЭЭНИЙ хувь хэвээр — гүйцэтгэл нь
 * hover-т гарна: хоёр өөр хэмжигдэхүүн нэг зурвасыг булаацалдах ёсгүй.
 */

/**
 * 3-р чарт — ЭХ ҮҮСВЭР × төслийн тоо, дотор нь гэрээлсэн тоо.
 *
 * ⚠️ Нэг ажил ОЛОН эх үүсвэрээс санхүүжиж болно (захирамжийн дүн хуваагддаг)
 * тул баганын НИЙЛБЭР нь нийт ажлын тооноос ИХ гарна. Энэ нь алдаа биш —
 * «эх үүсвэр тус бүрд хамрагдах ажлын тоо» гэсэн асуултын зөв хариу.
 */
export function chartSourceCount(rows: CfRow[]): SubBar[] {
  return CF_SOURCES.map((s, i) => {
    let value = 0;
    let sub = 0;
    for (const r of rows) {
      if (r.src[i] <= 0) continue;
      value += 1;
      if (r.note === CONTRACTED) sub += 1;
    }
    return { key: s.field, label: s.label, value, sub };
  }).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
}

/**
 * 3б-р чарт — ЭХ ҮҮСВЭР × МӨНГӨН ДҮН (2026-09-04, хэрэглэгчийн хүсэлт).
 *
 * ⚠️ Тооны хувилбартай (`chartSourceCount`) ЗЭРЭГЦЭЖ оршино, орлохгүй:
 * «хэдэн ажил» ба «хэдэн төгрөг» хоёр өөр асуулт бөгөөд хариу нь эрс
 * зөрдөг — Нийслэлийн төсөв 2 ажилтай ч ердөө 4.3 тэрбум, Үнэт цаас 51
 * ажилтай бөгөөд 1,488 тэрбум.
 *
 * ⚠️ Суурь нь `Urdch_tusuwt_urtug` БИШ, ЭХ ҮҮСВЭРИЙН ӨӨРИЙН талбарууд.
 * Тэдгээрийн нийлбэр (2,457 тэрбум) нь нийт төсвөөс (2,513) 55 тэрбумаар
 * бага — захирамжийн дүн бүх ажилд бүрэн бүртгэгдээгүй. Тиймээс энэ чартын
 * хувь нь «эх үүсвэрүүдийн дотор эзлэх хувь», нийт төсөвт эзлэх БИШ.
 */
export function chartSourceAmount(rows: CfRow[]): SubBar[] {
  return CF_SOURCES.map((s, i) => {
    let value = 0;
    let sub = 0;
    for (const r of rows) {
      value += r.src[i];
      if (r.note === CONTRACTED) sub += r.src[i];
    }
    return { key: s.field, label: s.label, value, sub };
  }).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
}

/**
 * 3в-р чарт — ЭХ ҮҮСВЭР: МӨНГӨ ба ТОО НЭГ чартад (2026-09-06).
 *
 * ⚠️ ХОЁР ЧАРТЫГ ОРЛОНО (`chartSourceAmount` + `chartSourceCount`). Тэдгээр
 * нь мөр мөрөөрөө ЯГ ижил ангилалтай атлаа дараалал нь өөр (мөнгөөр Үнэт цаас
 * тэргүүлдэг, тоогоор Нийслэлийн төсөв) тул хоёр зурвасыг нүдээр
 * зэрэгцүүлэхэд «нэг ангилал хоёр өөр байрлалд» гэсэн төөрөгдөл үүсдэг байв.
 *
 * ⚠️ МЭДЭЭЛЭЛ ХАСАГДААГҮЙ: мөнгө, түүний хувь, ажлын тоо, ажлын хувь,
 * гэрээлсэн тоо — БҮГД hover-т үлдэнэ. Багана нь МӨНГӨӨР хэмжигдэнэ, учир нь
 * «хэдэн төгрөг» нь шийдвэрийн хэмжээ; тоо нь түүний задаргаа (Нийслэлийн
 * төсөв 2 ажилтай ч 4.3 тэрбум, Үнэт цаас 51 ажилтай бөгөөд 1.49 их наяд).
 *
 * ⚠️ Хуучин хоёр функц ХЭВЭЭР үлдэнэ: тестүүд тэднийг шалгадаг бөгөөд өөр
 * харагдац тэднийг дуудаж болно.
 */
export function chartSourceMerged(rows: CfRow[]): SubBar[] {
  const cnt = chartSourceCount(rows);
  const byKey = new Map(cnt.map((c) => [c.key, c]));
  return chartSourceAmount(rows).map((a) => {
    const c = byKey.get(a.key);
    return { ...a, count: c?.value ?? 0, countSub: c?.sub ?? 0 };
  });
}

/** 4-р чарт — ХӨРӨНГӨ ОРУУЛАЛТЫН ДҮНГИЙН ТАЙЛБАР × мөнгөн дүн */
export function chartNoteAmount(rows: CfRow[]): SubBar[] {
  return groupSum(
    rows,
    (r) => r.note || tr('Тайлбаргүй'),
    (r) => r.cost,
    () => 0,
  );
}

/* ══════════════════════ S-МУРУЙ ══════════════════════ */

export type CurvePoint = { key: string; label: string; value: number };

/**
 * НИЙТ ТӨСЛИЙН S-МУРУЙ — хугацааны туршид хуримтлагдах хөрөнгө оруулалтын %.
 *
 * ⚠️ ЯАГААД ИЙМ АРГА: даалгаварт «Төлөвлөгөөт хугацаа эхлэх / дуусах хоёрын
 * нэг нь тэнхлэг болно» гэсэн. Аль нэгийг нь СОНГОВОЛ муруй гажина —
 * эхлэхээр авбал бүх зардал ажил эхэлмэгц нэг дор суух (шаталсан шат), дуусахаар
 * авбал ажил дуустал юу ч болоогүй мэт харагдана. Тиймээс ХОЁУЛАНГ нь авч,
 * ажил бүрийн эзлэх хувийг эхлэх→дуусах хоорондох САРУУДАД ЖИГД тарааж,
 * дараа нь хуримтлуулна — энэ нь S хэлбэрийг өгөгдлөөс өөрөөс нь гаргана.
 *
 * ⚠️ Жин нь `Zah_eh_unet_tsaas_huwi` (нийт хөрөнгө оруулалтад эзлэх хувь) —
 * 2026-09-04-нд `Urdch_tusuwt_urtug`-аас бодогдож үйлчилгээнд бичигдсэн.
 * Хоосон бол тэр ажил муруйд ОРОХГҮЙ (0 гэж тооцвол огноогүй ажил муруйг
 * доош татна).
 */
/**
 * S-МУРУЙН ТЭНХЛЭГИЙН НАРИЙВЧЛАЛ.
 *
 * ⚠️ ШҮҮЛТИЙН ТҮВШИНТЭЙ ТААРНА (2026-09-04, хэрэглэгчийн тодруулга): жил
 * сонговол ЖИЛЭЭР, улирал сонговол УЛИРЛААР, сар сонговол САРААР. Урьд нь
 * шүүлт идэвхтэй бол ямагт сар руу задалдаг байсан тул «2026» сонгоход 12
 * цэг, «1-р улирал» сонгоход 3 цэг гарч, хэрэглэгчийн сонгосон түвшингээс
 * илүү нарийн зурагддаг байв.
 */
export type Grain = 'year' | 'quarter' | 'month';

/** Сонгосон шүүлтийн ХАМГИЙН НАРИЙН түвшин — тэнхлэгийн алхам үүнтэй таарна */
export const grainOf = (p: Period): Grain =>
  (p.months.length > 0 ? 'month' : p.quarters.length > 0 ? 'quarter' : 'year');

/** Улирлын шошго — «2026 II». Богино тул тэнхлэгт цэг олон байсан ч багтана */
const ROMAN = ['I', 'II', 'III', 'IV'];

/**
 * НИЙТ ТӨСЛИЙН S-МУРУЙ — хугацааны туршид хуримтлагдах хөрөнгө оруулалтын %.
 *
 * ⚠️ ЯАГААД ИЙМ АРГА: даалгаварт «Төлөвлөгөөт хугацаа эхлэх / дуусах хоёрын
 * нэг нь тэнхлэг болно» гэсэн. Аль нэгийг СОНГОВОЛ муруй гажина — эхлэхээр
 * авбал бүх зардал ажил эхэлмэгц нэг дор суух (шаталсан шат), дуусахаар авбал
 * ажил дуустал юу ч болоогүй мэт харагдана. Тиймээс ХОЁУЛАНГ нь авч, ажил
 * бүрийн эзлэх хувийг эхлэх→дуусах хоорондох САРУУДАД ЖИГД тарааж, дараа нь
 * хуримтлуулна — S хэлбэрийг өгөгдөл өөрөө гаргана.
 *
 * ⚠️ Жин нь `Zah_eh_unet_tsaas_huwi` (нийт хөрөнгө оруулалтад эзлэх хувь).
 * Хоосон бол тэр ажил муруйд ОРОХГҮЙ — 0 гэж тооцвол огноогүй ажил муруйг
 * доош татна.
 *
 * ⚠️ ГУРВАН АЛХАМ, ДАРААЛАЛ НЬ ЧУХАЛ: (1) сараар хуваарилах, (2) БҮХ түүхээр
 * хуримтлуулах, (3) сонгосон хугацаагаар таслаад нарийвчлалдаа буулгах.
 * Хуримтлалыг таслалтын ДАРАА хийвэл 2026-ийн эхний цэг 0%-ээс эхэлж
 * «төсөл шинээр эхэлж байна» гэсэн ХУДАЛ уншилт гарна.
 */
export function sCurve(rows: CfRow[], grain: Grain = 'year', period: Period = NO_PERIOD): CurvePoint[] {
  /* ── 1. Сар бүрийн эзлэх хувь ── */
  const per = new Map<string, number>();
  for (const r of rows) {
    if (r.share <= 0 || r.start == null) continue;
    const s = new Date(r.start);
    const e = new Date(r.end ?? r.start);
    let y = s.getUTCFullYear();
    let m = s.getUTCMonth();
    const ey = e.getUTCFullYear();
    const em = e.getUTCMonth();

    const n = Math.min(480, Math.max(1, (ey - y) * 12 + (em - m) + 1));
    const step = r.share / n;
    for (let i = 0; i < n; i += 1) {
      per.set(`${y}-${String(m + 1).padStart(2, '0')}`, (per.get(`${y}-${String(m + 1).padStart(2, '0')}`) ?? 0) + step);
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  }
  if (per.size === 0) return [];

  /* ── 2. Хуримтлал — БҮХ сараар, эрэмбээр (таслахаас ӨМНӨ) ── */
  let acc = 0;
  const all = [...per.keys()].sort().map((k) => {
    acc += per.get(k) ?? 0;
    return { key: k, value: Math.round(acc * 100) / 100 };
  });

  /* ── 3. Сонгосон хугацаа ── */
  const keep = periodActive(period)
    ? all.filter(({ key }) => {
      const y = Number(key.slice(0, 4));
      const m = Number(key.slice(5, 7));
      return hit(period.years, y) && hit(period.quarters, Math.floor((m - 1) / 3) + 1) && hit(period.months, m);
    })
    : all;
  if (keep.length === 0) return [];

  if (grain === 'month') return keep.map((p) => ({ ...p, label: p.key }));

  /*
   * ── 4. НАРИЙВЧЛАЛД БУУЛГАХ — бүлгийн СҮҮЛИЙН утга ──
   *
   * ⚠️ Нийлбэр БИШ, СҮҮЛИЙН утга: цуваа нь аль хэдийн хуримтлал тул сарын
   * утгуудыг нэмбэл хувь нь хэдэн зуу болно. `keep` нь эрэмбэлэгдсэн тул
   * дараагийн бичилт бүр өмнөхөө дарж, эцэст нь бүлгийн сүүлийнх үлдэнэ.
   */
  const out = new Map<string, { label: string; value: number }>();
  for (const p of keep) {
    const y = p.key.slice(0, 4);
    const m = Number(p.key.slice(5, 7));
    const k = grain === 'year' ? y : `${y}-${Math.floor((m - 1) / 3) + 1}`;
    const label = grain === 'year' ? y : `${y} ${ROMAN[Math.floor((m - 1) / 3)]}`;
    out.set(k, { label, value: p.value });
  }
  return [...out].map(([key, v]) => ({ key, label: v.label, value: v.value }));
}

/**
 * CASHFLOW-ИЙН S-МУРУЙ — багана нь сарын МӨНГӨ, муруй нь ХУРИМТЛАГДСАН ХУВЬ.
 *
 * ⚠️ ХУВЬ НЬ МӨНГӨНӨӨС бодогдоно (2026-09-10, хэрэглэгчийн заавар:
 * «мөнгөн дүнгээс төслийн хэмжээний дундаж хувийг бодож S-Curve гаргана»):
 *
 *     хувь = Σ(тухайн сар хүртэлх Cashflow_dun) ÷ ТӨСЛИЙН НИЙТ ХО дүн × 100
 *
 * ⚠️ ХУВААРЬ (`total`) нь «НИЙТ ТӨСӨВ» индикатортой ИЖИЛ — Excel-ийн НИЙТ
 * томьёоны хүрээ (1 ба 2-р хэсэг) дэх `ho_dun_geree`-ийн нийлбэр,
 * 2,493,041,880,532 ₮ (2026-09-11, хэрэглэгчийн заавар). Дуудагч
 * (`GeneralDash`) тоолуурыг ч мөн тэр хүрээгээр шүүж өгнө — эс бөгөөс
 * 5·6·7-р хэсгийн сарын мөр муруйг 100%-иас давуулна.
 * ⚠️ Урьд нь бүх 78 мөрийн нийлбэр (3,167.6 тэрбум) байв — «өөр
 * санхүүжилттэй» 674.6 тэрбумыг хуваарьт оруулснаар муруй дутуу төгсдөг.
 * Зөвхөн төлөвлөгөөтэй ажлуудын дүнг хуваарь болгож ч БОЛОХГҮЙ — муруй
 * эрт дүүрч, «төлөвлөлт дууссан» гэсэн худал дохио өгнө.
 *
 * ⚠️ ХУРИМТЛАЛЫГ ТАСЛАХААС ӨМНӨ бодно (`timeline`-тай ижил дүрэм) — эс
 * бөгөөс сонгосон үеийн эхний цэг 0%-ээс эхэлж, «шинээр эхэлж байна» гэсэн
 * худал уншилт гарна.
 */
/**
 * ОРОН СУУЦНЫ БАРИЛГАЖИЛТЫН БАГЦУУД — ТӨСЛИЙН ЖИНГЭЭР (2026-09-10).
 *
 * ⚠️ `Bagts.tsx`-ийн `Pack.progress` (блокуудын ЭНГИЙН дундаж) НЬ БИШ:
 * дашбоардын түвшинд багцууд ХЭМЖЭЭГЭЭРЭЭ эрс ялгаатай (Багц 2 — 453.5
 * тэрбум ₮, Багц 3.2 — 197.8). Энгийн дундаж нь жижиг багцыг томтой ижил
 * жинтэй болгоно. Тиймээс ХО дүнгээр жигнэнэ — `weighted()`-ийн ижил дүрэм.
 *
 * ⚠️ ХЭМЖИГДЭЭГҮЙ багц жинд ОРОХГҮЙ (`null ≠ 0`): тухайн сард хэмжилтгүй
 * багцыг 0% гэж тооцвол төслийн явц зохиомлоор буурна.
 */
export const HOUSING_PKGS: readonly string[] = [
  'БАГЦ1', 'БАГЦ2', 'БАГЦ31', 'БАГЦ32', 'БАГЦ33', 'БАГЦ41', 'БАГЦ42',
];

/**
 * ОРОН СУУЦНЫ БИЕТ ГҮЙЦЭТГЭЛИЙН НЭГДСЭН ТОДОРХОЙЛОЛТ — ГАНЦ томьёо.
 *
 *     хувь = Σ(ХО дүн_p × гүйцэтгэл_p) ÷ Σ ХО дүн_p      (p — хэмжигдсэн багц)
 *
 * ⚠️ 2026-09-30: орон сууцны гүйцэтгэл ДӨРВӨН өөр аргаар дундажлагдаж байв —
 *    `pkgShared.aggregateMonths`/`physNow` (БЛОКИЙН ТООГООР; PkgProg · Dashboard ·
 *    ExecReport · GeneralDash «ОРОН СУУЦНЫ ХОРООЛОЛ»), `reportData.loadOverall`
 *    (төсвөөр), `reportData.buildFindings.buildActual` (блокийн ЭНГИЙН дундаж),
 *    `housingMoney` (ХО дүнгээр). Нэг үзүүлэлт дэлгэц бүрд өөр тоо гаргадаг байсан
 *    тул БҮГД ЭНЭ функцээр — порталын дүрэм ӨРТГӨӨР ЖИГНЭХ (`weighted()`,
 *    `PkgFin` «Төслийн төрөл», `housingMoney`-тэй нэг зарчим).
 * ⚠️ `pct == null` (хэмжигдээгүй) багц хуваарь, хүртвэрт ХОЁУЛАНД орохгүй — 0 биш.
 * ⚠️ ХО дүнгүй (`cost <= 0`) багц жингүй тул орохгүй. Хэмжигдсэн багцуудын НЭГ Ч
 *    нь ХО дүнгүй бол (Cashflow уншигдаагүй г.м.) БЛОКИЙН ТООНД БҮРЭН шилжинэ —
 *    хагас хагасаар холивол нэгж зөрж жин утгагүй болно (`loadOverall`-ийн
 *    хуучин дүрэм).
 * ⚠️ Оролт/гаралт 0–100 (`pct()` 100-аар үржүүлдэггүй).
 * @returns хэмжигдсэн, жинтэй багц алга бол `null`
 */
export type HousingItem = {
  /** Багцын биет гүйцэтгэл, 0–100; `null` = хэмжигдээгүй */
  pct: number | null | undefined;
  /** ХО дүн (₮) — `pkgCostWeight()` */
  cost: number;
  /** Нөөц жин — блокийн тоо (ХО дүн огт алга үед л) */
  blocks?: number;
};
export function housingPct(items: Iterable<HousingItem>): number | null {
  const known: { pct: number; cost: number; blocks: number }[] = [];
  for (const x of items) {
    if (x.pct == null || !Number.isFinite(x.pct)) continue;
    known.push({ pct: x.pct, cost: Number.isFinite(x.cost) ? x.cost : 0, blocks: x.blocks ?? 0 });
  }
  const byCost = known.some((x) => x.cost > 0);
  let top = 0;
  let base = 0;
  for (const x of known) {
    const w = byCost ? x.cost : x.blocks;
    if (!(w > 0)) continue;
    top += w * x.pct;
    base += w;
  }
  return base > 0 ? top / base : null;
}

/**
 * БАГЦ → ХО ДҮН (₮) — `housingPct`-ийн жин, ГАНЦ эх.
 *
 * ⚠️ 2026-09-30: `ho_dun_geree` (`CF.cost` = `CASHFLOW_NEW.fields.budget`), ЗӨВХӨН
 *    «Нийт төсөв»-ийн хүрээ (`inTotal` / `finXlInTotal`) — `reportData.loadOverall`-ийн
 *    2026-09-21-ний дүрэм. Түлхүүр `pkgKeyOf`: «БАГЦ 1-4» мэт ДИАПАЗОН мөр хоосон
 *    түлхүүр авч, бодит «Багц 14»-т харийн дүн наалдахгүй. Нэг багцад олон гэрээ
 *    байвал НИЙЛБЭР.
 */
export function pkgCostWeight(
  rows: Iterable<{ pkg: unknown; cost: number; inTotal: boolean }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.inTotal || !(r.cost > 0)) continue;
    const k = isPkgRange(r.pkg) ? '' : bagtsKey(r.pkg);
    if (!k || k === '0') continue;
    out.set(k, (out.get(k) ?? 0) + r.cost);
  }
  return out;
}

/**
 * ОРОН СУУЦНЫ БИЕТ ГҮЙЦЭТГЭЛИЙН САРЫН ЦУВАА — `pkgShared.aggregateMonths`-ийн цөм
 * (2026-09-30-нд ЭНД шилжсэн: цэвэр функц тул `gdash.check`-ээр шалгагдана).
 *
 * ⚠️ 2026-09-25-ны дүрмүүд ХЭВЭЭР (`pkgShared`-ийн тайлбар): `phys` сийрэг — цэг
 *    зөвхөн шинэ бичилттэй сард; багц бүрийн СҮҮЛИЙН мэдэгдэж буй утга (as-of);
 *    хараахан тайлагнаагүй багц 0% (`finPhys` дүрэм 1); цэг нь аль нэг багц тэр
 *    сард ШИНЭЭР тайлагнасан үед л гарна, бусад сард `null` (0 биш).
 * ⚠️ 2026-09-30: жигнэлт нь `housingPct` (ХО дүн; блокийн тоо — зөвхөн нөөц).
 *
 * @param physCnt багц → сар → блокийн тоо (нөөц жин — хамгийн их утга)
 * @param cost    багц → ХО дүн (`pkgCostWeight`)
 */
export function housingSeries(
  phys: Map<string, Map<string, number>>,
  physCnt: Map<string, Map<string, number>>,
  physAt: Map<string, Map<string, string>> | undefined,
  cost: Map<string, number>,
  labels: readonly string[],
): { label: string; phys: number | null; physAt: string | null }[] {
  const pk = [...phys].map(([k, byMon]) => {
    let w = 1;
    physCnt.get(k)?.forEach((v) => { if (v > w) w = v; });
    return {
      pts: [...byMon.entries()].sort(([x], [y]) => x.localeCompare(y)),
      at: physAt?.get(k),
      w,
      cost: cost.get(k) ?? 0,
    };
  }).filter((x) => x.pts.length > 0);
  return labels.map((label) => {
    const items: HousingItem[] = [];
    let fresh = false;
    let at = '';
    for (const x of pk) {
      let v = 0;
      let a = '';
      for (const [m, val] of x.pts) {
        if (m > label) break;
        v = val;
        a = x.at?.get(m) ?? '';
        if (m === label) fresh = true;
      }
      items.push({ pct: v, cost: x.cost, blocks: x.w });
      if (a > at) at = a;
    }
    return {
      label,
      // ⚠️ Хэмжилт огт байхгүй сар — `null`. 0 гэж буцаавал график дээр
      //    «биет гүйцэтгэл тэг» гэсэн худал шугам зурагдана.
      phys: fresh ? housingPct(items) : null,
      physAt: fresh && at ? at : null,
    };
  });
}

/**
 * ОРОН СУУЦНЫ ТӨЛӨВЛӨГӨӨТ ХУВЬ — ТӨСЛИЙН түвшинд ХО дүнгээр жигнэсэн (`housingPct`).
 *
 * ⚠️ 2026-09-30: БОДИТ тал (`pkgShared.physNow`/`aggregateMonths` → `housingSeries`)
 *    ӨНӨӨДӨР ХО дүнгээр жигнэгдэх болсон атал ТӨЛӨВЛӨГӨӨНИЙ тал
 *    (`planProgress.PlanCurve.months`) БЛОКИЙН тоогоор хэвээр үлдсэн тул
 *    «төлөвлөсөн − бодит» (PkgProg `TsKpi` · удирдлагын тайлан · Дашбоардын
 *    хуваарь · PkgFin · `Finance.lagOf`-ийн төслийн зам) ХОЁР ӨӨР жинг хооронд нь
 *    хасч, хоцрогдлын тоо/өнгө жингийн зөрүүгээр хэлбийж байв. Одоо багц бүрийн
 *    хуваарийг (`byBagts` — багц доторх нь блокоор, бодит талтай ижил) ЯГ
 *    `housingSeries`-ийн жингээр нэгтгэнэ.
 * ⚠️ Багцын хуваарийн мужаас ГАДУУРХ сар — `planProgress`-ийн нэгтгэлийн дүрмээр:
 *    эхлэхээс өмнө 0%, дууссаны дараа сүүлийн утга (100%).
 * ⚠️ Тэнхлэг, `vol` ба «дутуу бол хоосон» дүрэм нь `base` (= `PlanCurve.months`)-аас:
 *    хуудас унасан бол `base` хоосон → энэ ч хоосон (дутуу муруй гаргахгүй).
 * ⚠️ ХО жинтэй багц НЭГ Ч алга бол `base`-ийг ХЭВЭЭР буцаана (блокийн тооны
 *    нөөц — `housingPct`-ийн дүрэмтэй ижил санаа).
 */
export function housingPlanSeries<P extends { label: string; pct: number }>(
  byBagts: ReadonlyMap<string, readonly { label: string; pct: number }[]>,
  cost: ReadonlyMap<string, number>,
  base: readonly P[],
): P[] {
  const pk = [...byBagts]
    .map(([k, pts]) => ({
      pts: [...pts].sort((a, b) => a.label.localeCompare(b.label)),
      w: cost.get(k) ?? 0,
    }))
    .filter((x) => x.pts.length > 0 && x.w > 0);
  if (!pk.length) return [...base];
  const out: P[] = [];
  for (const b of base) {
    const pct = housingPct(pk.map((x) => {
      let v = 0; /* эхлээгүй багц — 0% */
      for (const p of x.pts) {
        if (p.label > b.label) break;
        v = p.pct; /* муж дотор — тэр сар; дууссан бол сүүлийн утга */
      }
      return { pct: v, cost: x.w };
    }));
    if (pct != null) out.push({ ...b, pct });
  }
  return out;
}

/**
 * «ГЭРЭЭЛСЭН ДҮН»-ИЙ ХҮРЭЭ — CASHFLOW_NEW-ийн ТҮҮХИЙ мөрөөс (`FinData.contracts`).
 *
 * Порталын ГАНЦ дүрэм (`live.loadBudget.contract`, `reportData.contractAmount`,
 * `execReport.csum`, `GeneralDash.KpiStrip`): «Нийт»-ийн хүрээ (`finXlInTotal`) ∧
 * `note === CONTRACTED`. `keys` — тэдгээр мөрийн багцын түлхүүр (`pkg2`, `pkg`;
 * диапазон мөр хоосон) — «олгосон ÷ гэрээлсэн»-ийн ТООЛОГЧИЙГ шүүнэ
 * (`reportData.paidContracted`-тай ижил: гэрээлсэн багцын төлбөр л).
 *
 * ⚠️ 2026-09-30: Дашбоардын «Санхүүжилтийн хуримтлал — сараар» (тайлбар нь
 *    «олгосон / гэрээний нийт дүн») `FinData.planTotal`-аар (гэрээ ЭСВЭЛ төсөв,
 *    БҮХ мөр — 5·6·7-р хэсэг, гэрээгүй мөрийн төсөв ч орно) хуваадаг байсан тул
 *    Тайлангийн «гэрээлсэн дүнгийн X% нь олгогдсон» ба удирдлагын тайлангийн
 *    «гэрээний X%»-аас хэдэн нэгж хувиар ДООГУУР гардаг байв.
 */
export function contractedScope(
  rows: Iterable<Readonly<Record<string, unknown>>>,
): { amount: number; keys: Set<string> } {
  let amount = 0;
  const keys = new Set<string>();
  for (const r of rows) {
    if (FIN_XL_TOTAL_SKIP.includes(sOf(r[CF.code1]))) continue;
    if (String(r[CF.note] ?? '').replace(/\s+/g, ' ').trim() !== CONTRACTED) continue;
    amount += nOf(r[CF.contract]);
    for (const v of [r[CF.pkg2], r[CF.pkg]]) {
      const k = isPkgRange(v) ? '' : bagtsKey(v);
      if (k && k !== '0') keys.add(k);
    }
  }
  return { amount, keys };
}

/** CASHFLOW_NEW-ийн ТҮҮХИЙ мөр (`FinData.contracts`, `queryFeatures`) → `pkgCostWeight`-ийн оролт */
export const cfWeightRow = (r: Readonly<Record<string, unknown>>): { pkg: unknown; cost: number; inTotal: boolean } => ({
  /* ⚠️ `pkg2` эхэлж (навч), хоосон бол `pkg` — `loadOverall`/`Finance.planTotal`-тай ижил */
  pkg: sOf(r[CF.pkg2]) || sOf(r[CF.pkg]),
  cost: nOf(r[CF.cost]),
  inTotal: !FIN_XL_TOTAL_SKIP.includes(sOf(r[CF.code1])),
});

/**
 * Орон сууцны багцуудын биет гүйцэтгэлийг МӨНГӨН ДҮНГЭЭР сараар нэгтгэнэ —
 * Σ(ХО дүн × гүйцэтгэл%) (2026-09-10, хэрэглэгчийн заавар: «ягаанаар харагдаж
 * буй хэсэг хэрэггүй, төлөвлөсөн гүйцэтгэл дээр оруулаадах»).
 *
 * ⚠️ ХУВЬ БИШ, МӨНГӨ: энэ нь Cashflow төлөвлөгөөний сарын мөнгөтэй НЭГ
 *    нэгжтэй байж түүн дээр НЭМЭГДЭНЭ (`cashflowCurve`). Ингэснээр цэнхэр
 *    муруй = (бусад ажлын cashflow + орон сууцны биет явц) ÷ төслийн нийт.
 *    Үлдсэн ажлуудын cashflow бөглөгдмөгц тэр нь ЭНЭ нийлбэрт өөрөө орно.
 *
 * @param phys    багц → (сар → %), `FinData.phys` — ЗӨВХӨН шинэ бичилттэй сард
 *                цэгтэй (`finPhys.buildPhys`-ийн дүрэм 2, сийрэг)
 * @param weight  багц → ХО дүн (₮). Байхгүй/тэг бол тооцоонд орохгүй.
 * @param labels  сарын тэнхлэг (өсөх дарааллаар)
 * @param only    хамрах багцууд (анхдагч: орон сууцны 7)
 * @returns сар → ₮; тэр сард НЭГ Ч багц ШИНЭЭР хэмжигдээгүй бол бичлэг ҮГҮЙ
 *          (`null ≠ 0` — дуудагч сүүлийн хэмжилтийг урагш авч явна)
 *
 * ⚠️ 2026-09-25: БАГЦ БҮРИЙН СҮҮЛИЙН МЭДЭГДЭЖ БУЙ УТГА (as-of). Урьд нь тухайн
 *    сард цэггүй багцыг нийлбэрээс ОРХИДОГ байв — `FinData.phys` хуримтлагдсан
 *    (carry-forward) үед зөв байсан ч `buildPhys` сийрэг болсноос хойш ганц
 *    жижиг багц тайлагнасан сард бусад 6 багцын мөнгө алга болж, Cashflow-ийн
 *    `physPct` муруй УНАЖ буцдаг байв. Одоо `aggregateMonths`-тай ижил: цэг нь
 *    аль нэг багц шинээр тайлагнасан сард гарна, утга нь БҮХ багцын as-of.
 */
export function housingMoney(
  phys: Map<string, Map<string, number>>,
  weight: Map<string, number>,
  labels: string[],
  only: readonly string[] = HOUSING_PKGS,
): Map<string, number> {
  const keep = new Set(only);
  const out = new Map<string, number>();
  /** багц → сүүлийн мэдэгдэж буй % (тэнхлэгийн дарааллаар урагш) */
  const last = new Map<string, number>();
  for (const label of labels) {
    let fresh = false;
    for (const [key, byMon] of phys) {
      if (!keep.has(key)) continue;
      const v = byMon.get(label);
      if (v == null) continue;              // энэ сард шинэ бичилтгүй — өмнөх утга хэвээр
      last.set(key, v);
      fresh = true;
    }
    if (!fresh) continue;                   // нэг ч багц шинээр хэмжигдээгүй — бичлэг үгүй
    let sum = 0;
    for (const [key, v] of last) {
      const w = weight.get(key) ?? 0;
      if (w <= 0) continue;
      sum += (w * v) / 100;
    }
    out.set(label, sum);
  }
  return out;
}

export function cashflowCurve(
  plan: CfPlanRow[],
  total: number,
  grain: Grain = 'month',
  period: Period = NO_PERIOD,
  /**
   * ОЛГОСОН IPC сараар (`'YYYY-MM'` → ₮), 2026-09-10.
   *
   * ⚠️ ХУРИМТЛАЛЫГ ЭНД бодно, дуудагч талд БИШ: `pct`-тэй ЯГ ИЖИЛ дүрмээр
   *    (таслахаас ӨМНӨ хуримтлуулж, дараа нь `period`-ээр шүүх) явбал хоёр
   *    муруй нэг цэг дээр зэрэгцэн уншигдана. Дуудагч талд бодвол сонгосон
   *    үеийн эхний цэг 0%-ээс эхэлж «шинээр эхэлж байна» гэсэн худал
   *    уншилт гарна (`pct`-ийн ижил тайлбарыг үз).
   * ⚠️ ХООСОН Map = «IPC хараахан ачаалагдаагүй» → бүх цэгт `ipcPct: null`,
   *    муруй ОГТ зурагдахгүй. Чарт үүнээс болж унах ЁСГҮЙ.
   */
  ipcByMonth: Map<string, number> = new Map(),
  /**
   * ОРОН СУУЦНЫ БИЕТ ЯВЦ МӨНГӨН ДҮНГЭЭР — сар → ₮ (`housingMoney()`).
   *
   * ⚠️ ГУРАВ ДАХЬ ТУСДАА МУРУЙ (`physPct`), төлөвлөгөөнд НЭМЭГДДЭГГҮЙ
   *    (2026-09-10-ны ХОЁР ДАХЬ засвар, хэрэглэгчийн сонголт «A»).
   *
   *    Урьд нь орон сууцны 7 ажлын САРЫН ТӨЛӨВЛӨГӨӨГ бүхэлд нь хаяж
   *    (`skipIds`), оронд нь тэдний ӨНӨӨДРИЙН биет явцыг цэнхэр муруйд
   *    нэмдэг байв. Гэтэл орон сууц нь төслийн 58.6%, бөглөгдсөн
   *    төлөвлөгөөний 53.1% — тиймээс цэнхэр муруй нь «ирээдүйн
   *    төлөвлөгөө + өнөөдрийн түвшин» гэсэн ХОЛИМОГ болж, ирээдүй рүү
   *    ӨСӨХӨӨ БОЛЬДОГ байлаа: 2027 он бүтнээр бөглөгдсөн атал муруй
   *    34.8%-аас (өнөөдрийн 32.4%-тай бараг тэнцүү) дээш гардаггүй байв.
   *
   * ⚠️ Хуримтлагдсан ТҮВШИН тул хэмжилтгүй сард СҮҮЛИЙН утгыг урагш авна —
   *    эс бөгөөс сүүлийн хэмжилтийн дараа муруй доош УНАНА. Харин ЭХНИЙ
   *    хэмжилтээс ӨМНӨ ба СҮҮЛИЙНХЭЭС ХОЙШ `null` (IPC-тэй ижил дүрэм):
   *    хэвтээ сунгавал «явц зогссон» гэсэн худал уншилт төрнө.
   */
  housingMoneyByMonth: Map<string, number> = new Map(),
  /**
   * ОГНООГҮЙ ОЛГОЛТ (урьдчилгаа г.м.) — ₮ (2026-09-10, хэрэглэгчийн заавар:
   * «ногоон шугамын үзүүрт нийт олгосон мөнгө 530,872,795,391 ₮ гарах»).
   *
   * ⚠️ `ipcByMonth` нь зөвхөн ГҮЙЛГЭЭНИЙ ОГНООТОЙ актыг агуулдаг
   *    (`Finance.loadFinData` — огноогүйг сарын цуваанаас хасдаг). Тэдгээр
   *    нь урьдчилгаа тул ажлын ӨМНӨ олгогдсон — ЭХНИЙ IPC сараас эхлэн
   *    хуримтлалд орно; сүүлийн сард нэмбэл хуурамч оргил үүснэ (null ≠ 0).
   *    Ингэснээр муруйн төгсгөл = `givenTotal`-ийн нийлбэр.
   */
  ipcBase = 0,
): TimePoint[] {
  const per = new Map<string, number>();
  for (const p of plan) {
    if (p.amount == null || p.start == null) continue;
    /* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ОРОН НУТГИЙН сар (`monthKey`), UTC БИШ —
       ТУХ · `Finance.publish` (`keyOf`) · `CashflowPlan`-тай нэг дүрэм. AGOL/Excel-ээс орсон
       УБ-ын шөнө дунд (= өмнөх өдрийн 16:00Z) сарын 1-ний мөр UTC-ээр ӨМНӨХ сард буудаг байв.
       Порталаас бичсэн `Date.UTC(y, m, 1)` нь УБ-д ЯГ тэр сар — хуучин өгөгдөл хөдлөхгүй. */
    const k = monthKey(p.start);
    per.set(k, (per.get(k) ?? 0) + p.amount);
  }
  if (total <= 0) return [];
  /*
   * ⚠️ ТЭНХЛЭГ НЬ ГУРВАН ЭХ СУРВАЛЖИЙН НЭГДЭЛ (2026-09-10).
   *
   * Урьд нь зөвхөн `per` (Cashflow төлөвлөгөө)-ийн саруудаас угсардаг байв.
   * Гэтэл амьдаар тэдгээр нь 2024-04…2025-05 (681 мөрийн 667 нь ХООСОН,
   * бөглөгдсөн 14 нь ч 0 ₮), харин IPC олголт 2025-09…2026-08 — хоёр
   * цуваа ОГТ ОГТЛОЛЦОХГҮЙ тул IPC-ийн муруй бүх цэгт 0% дээр хэвтэж,
   * үзэгдэхгүй байлаа. Одоо аль ч эх сурвалжид өгөгдөл байвал тэр сар
   * тэнхлэгт гарна — нөгөө цуваа тэнд `null` (тасалдана), 0 БИШ.
   *
   * ⚠️ `per.size === 0` шалгуур ХАСАГДСАН: төлөвлөгөө огт бөглөгдөөгүй ч
   * IPC эсвэл барилгажилтын муруй ганцаараа зурагдах ЁСТОЙ.
   */
  const months = [...new Set([
    ...per.keys(), ...ipcByMonth.keys(), ...housingMoneyByMonth.keys(),
  ])].sort();
  if (months.length === 0) return [];
  /*
   * ТӨЛӨВЛӨГӨӨНИЙ ХУРИМТЛАЛ — ЗӨВХӨН ТӨЛӨВЛӨГӨӨНИЙ ӨӨРИЙН ХҮРЭЭНД
   * (`ipcCum`/`physCum`-тай ЯГ ИЖИЛ дүрэм, 2026-09-11).
   *
   * ⚠️ Урьд нь `months`-ийн БҮХ сард `cum.set()` хийдэг байсан тул Cashflow-д
   *    ОГТ төлөвлөгөөгүй сар ч (тэнхлэг нь гурван эх сурвалжийн НЭГДЭЛ тул
   *    IPC эсвэл биет явцаас орж ирдэг) утгатай болж, `?? null` хэзээ ч
   *    ажиллахгүй байв. Тэр сарууд дэлгэцэнд «төлөвлөгөө 0%» гэж уншигдана —
   *    үнэн нь «энэ сард төлөвлөгөө бөглөгдөөгүй» (`null ≠ 0`).
   *
   * ⚠️ ХҮРЭЭНИЙ ДОТОРХ ЦООРХОЙ нь ТАСРАХГҮЙ: хуримтлал тул төлөвлөгөөгүй
   *    дундын сард өмнөх түвшин хэвээр үлдэнэ (`acc` хэвээр бичигдэнэ) —
   *    эс бөгөөс муруй дунд нь унаж, төлөвлөгөө буурсан мэт харагдана.
   *    Зөвхөн ЭХНИЙ төлөвлөсөн сараас ӨМНӨ ба СҮҮЛИЙНХЭЭС ХОЙШ `null`.
   */
  const planMonths = [...per.keys()].sort();
  const planFirst = planMonths[0];
  const planLast = planMonths[planMonths.length - 1];
  let acc = 0;
  const cum = new Map<string, number>();
  if (planMonths.length) {
    for (const k of months) {
      if (k < planFirst) continue;        // эхний төлөвлөгөөнөөс ӨМНӨ муруй эхлэхгүй
      acc += per.get(k) ?? 0;
      if (k > planLast) break;            // сүүлийн төлөвлөгөөнөөс цааш сунгахгүй
      /* ⚠️ ЦЭВЭР ТӨЛӨВЛӨГӨӨ — биет явц ЭНД ОРОХГҮЙ (дээрх тайлбарыг үз) */
      cum.set(k, Math.round((acc / total) * 100 * 100) / 100);
    }
  }
  /*
   * ОРОН СУУЦНЫ БИЕТ ЯВЦЫН МУРУЙ — IPC-ийнхтэй ЯГ ИЖИЛ дүрмээр.
   * ⚠️ Хэмжилтийн ХООРОНД сүүлийн утгыг урагш авна (хуримтлагдсан түвшин),
   *    харин ГАДНА нь `null` — тэнд муруй ТАСАРНА.
   */
  const physMonths = [...housingMoneyByMonth.keys()].sort();
  const physLast = physMonths[physMonths.length - 1];
  const physCum = new Map<string, number>();
  if (physMonths.length) {
    let house = 0;
    let seen = false;
    for (const k of months) {
      const v = housingMoneyByMonth.get(k);
      if (v != null) { house = v; seen = true; }
      if (!seen || k > physLast) continue;
      physCum.set(k, Math.round((house / total) * 100 * 100) / 100);
    }
  }
  /*
   * ОЛГОСОН IPC-ийн ХУРИМТЛАЛ — төлөвлөгөөнийхтэй ЯГ ИЖИЛ дүрмээр.
   *
   * ⚠️ IPC-ийн ӨӨРИЙН саруудаар хуримтлуулна, `months`-оор БИШ: олголт нь
   *    төлөвлөгөө байхгүй сард ч хийгдсэн байж болно (жиш. урьдчилгаа).
   *    Тэр мөнгө хуримтлалд ЗААВАЛ орох ёстой — эс бөгөөс муруй нийт
   *    олголтоос бага дээр төгсөнө.
   * ⚠️ ХАМГИЙН СҮҮЛИЙН IPC САРААС ХОЙШ муруй ТАСАРНА (`null`) — тэнд
   *    хуримтлалыг хэвтээгээр сунгавал «олголт зогссон» гэж уншигдана,
   *    гэтэл үнэн нь «хараахан бүртгэгдээгүй». `null ≠ 0` зарчим.
   */
  const ipcMonths = [...ipcByMonth.keys()].sort();
  const ipcLast = ipcMonths[ipcMonths.length - 1];
  const ipcFirst = ipcMonths[0];
  const ipcCum = new Map<string, number>();
  /* ⚠️ ЯГ ₮ — хувиас буцааж үржүүлбэл 2 орны бүхэлчлэл 100 сая ₮-ийн
     алдаа өгнө (0.005% × 3 их наяд). Дэлгэцэнд ЭНИЙГ харуулна. */
  const ipcMoney = new Map<string, number>();
  if (ipcMonths.length) {
    let a2 = ipcBase;                     // огноогүй урьдчилгаа — эхнээс
    for (const k of months) {
      if (k < ipcFirst) continue;         // эхний олголтоос ӨМНӨ муруй эхлэхгүй
      a2 += ipcByMonth.get(k) ?? 0;
      if (k > ipcLast) break;             // сүүлийн олголтоос цааш сунгахгүй
      ipcCum.set(k, Math.round((a2 / total) * 100 * 100) / 100);
      ipcMoney.set(k, a2);
    }
  }

  const keep = months.filter((k) => {
    if (!periodActive(period)) return true;
    const y = Number(k.slice(0, 4));
    const m = Number(k.slice(5, 7));
    return hit(period.years, y) && hit(period.quarters, Math.floor((m - 1) / 3) + 1)
      && hit(period.months, m);
  });
  if (keep.length === 0) return [];

  if (grain === 'month') {
    return keep.map((k) => ({
      key: k,
      label: k,
      /* ⚠️ `?? null` — төлөвлөгөө бөглөгдөөгүй сар нь «0%» БИШ «хэмжигдээгүй».
         График дээр цоорхой үлдэнэ (`curveOf` тэр цэгийг алгасна). */
      pct: cum.get(k) ?? null,
      amount: per.get(k) ?? 0,
      /* ⚠️ `?? null` — Map-д байхгүй сар нь «хэмжигдээгүй», 0 БИШ */
      ipcPct: ipcCum.get(k) ?? null,
      ipcMoney: ipcMoney.get(k) ?? null,
      physPct: physCum.get(k) ?? null,
    }));
  }
  const out = new Map<string, TimePoint>();
  for (const k of keep) {
    const y = k.slice(0, 4);
    const m = Number(k.slice(5, 7));
    const q = Math.floor((m - 1) / 3) + 1;
    const bk = grain === 'year' ? y : `${y}-${q}`;
    const label = grain === 'year' ? y : `${y} ${ROMAN[q - 1]}`;
    const prev = out.get(bk);
    out.set(bk, {
      key: bk,
      label,
      /* Хувь — бүлгийн СҮҮЛИЙНХ (хуримтлал тул нэмэхгүй).
         ⚠️ `?? prev?.pct ?? null` — `ipcPct`/`physPct`-ТЭЙ ЯГ ИЖИЛ дүрэм:
            бүлгийн сүүлийн сард төлөвлөгөө байхгүй бол өмнөхийг нь хадгална
            (эс бөгөөс бүтэн улирал алга болно), огт байхгүй бол `null` —
            0 гэж зурвал «төлөвлөгөө тэг» гэсэн худал уншилт болно. */
      pct: cum.get(k) ?? prev?.pct ?? null,
      /* Мөнгө — бүлгийн НИЙЛБЭР (хуримтлал биш тул нэмнэ) */
      amount: (prev?.amount ?? 0) + (per.get(k) ?? 0),
      /* ⚠️ IPC ч мөн ХУРИМТЛАЛ тул бүлгийн СҮҮЛИЙНХ. Тухайн бүлгийн
         сүүлийн сард хэмжилт байхгүй бол өмнөхийг нь хадгална — эс
         бөгөөс улирлын сүүлийн сар хоосон байхад бүтэн улирал алга болно. */
      ipcPct: ipcCum.get(k) ?? prev?.ipcPct ?? null,
      ipcMoney: ipcMoney.get(k) ?? prev?.ipcMoney ?? null,
      /* ⚠️ Биет явц ч ХУРИМТЛАЛ — бүлгийн СҮҮЛИЙНХ (нийлбэр БИШ) */
      physPct: physCum.get(k) ?? prev?.physPct ?? null,
    });
  }
  return [...out.values()];
}
/* ══════════════════════ ЗУРГИЙН ДЭЭРХ ИНДИКАТОР ══════════════════════ */

export type Kpi = {
  /** Нийт төсөв — Урьдчилсан төсөвт өртгийн нийлбэр */
  budget: number;
  /**
   * НИЙТ ГЭРЭЭЛСЭН ДҮН — ЗӨВХӨН гэрээлэгдсэн мөрийн `Geree_erh_dun`-ийн нийлбэр.
   *
   * ⚠️ Гэрээ хийгдсэн эсэхийг «Хөрөнгө оруулалтын төрөл» (`HO_dungiin_tailbar`)
   * талбарын «Гэрээлсэн дүн» утга ХЭЛНЭ. `Geree_erh_dun` нь гэрээлэгдээгүй
   * мөрүүдэд ч бөглөгдсөн байдаг тул шүүлтгүй нийлбэл 2,073 тэрбум гарч,
   * бодит гэрээнээс (2,039.8) 33 тэрбумаар их болно.
   *
   * ⚠️ Шүүлтийг ДУУДАГЧ (`GeneralDash`) хийнэ — тэнд хугацааны шүүлт ч давхар
   * үйлчилдэг тул энд хийвэл хоёр шүүлт хоёр газар тарах байсан.
   */
  contract: number;
  /** Гүйцэтгэлийн хувь — нэгтгэл гүйцэтгэл эсвэл 6 шатны өртгөөр ЖИГНЭСЭН дундаж (`progressSrc`) */
  progress: number | null;
  /**
   * `progress` ХААНААС ирсэн бэ (2026-09-25).
   * ⚠️ Хоёр ӨӨР хэмжүүр НЭГ шошготой гарч байв: шүүлтгүй үед «Нэгтгэл
   *    гүйцэтгэл»-ийн төслийн нийт, шүүлттэй/нэгтгэл унасан үед 6 шатны
   *    бодолт. Дэлгэц · PDF · PNG · AI баримт бүгд `progressLabel`/
   *    `progressSub`-аар ЭНЭ утгад тохирсон нэр гаргана.
   */
  progressSrc: ProgressSrc;
  /**
   * Тэр хувь НИЙТ төсвийн хэдэн хувийг хамарсан бэ (0–100).
   *
   * ⚠️ ЗААВАЛ ХАРУУЛНА. Гүйцэтгэл нь зөвхөн барилгын багцуудад (`Багц 1–4.2`)
   * хэмжигддэг бөгөөд cashflow-гийн 26 багцаас ердөө хэдхэн нь тэдгээр —
   * хамралтыг нуувал «56%» гэсэн тоо БҮХ төслийн явц мэт уншигдана.
   */
  progressCovered: number;
  /**
   * ГҮЙЦЭТГЭСЭН ДҮН — тэр хувийн МӨНГӨН эквивалент (`Σ өртөг × хувь`).
   *
   * ⚠️ ОЛГОСОН (захирамжийн) дүн БИШ. Хоёр нь эрс зөрдөг: 2026-09-06-ны амьд
   * хэмжилтээр гүйцэтгэсэн нь 480.1 тэрбум (19.1%) атал захирамжаар олгосон
   * нь 2.48 их наяд (98.6%) — эрх олголт нь гүйцэтгэхээс ӨМНӨ бүтнээр нь
   * явдаг. Индикаторын хувьтай ТААРАХ цорын ганц тоо нь энэ.
   */
  progressAmount: number;
  /**
   * БАГЦ АЖЛЫН ТОО — шүүлтэд багтсан МӨРИЙН тоо.
   *
   * ⚠️ ЯЛГААТАЙ дэд багцын тоо БИШ (2026-09-08, хэрэглэгчийн засвар: «53 биш
   * 76»). Мөр бүр нь нэг ажил: дэд багц ХООСОН 21 мөр тоологдохгүй, нэг дэд
   * багцад хоёр ажил байвал нэг л удаа тоологддог байв.
   */
  packages: number;
  /** Нийт төрлийн тоо */
  types: number;
};

/** Гүйцэтгэлийн хувийн эх — `Kpi.progressSrc` */
export type ProgressSrc = 'negtgel' | 'stage';

/** Индикаторын шошго — эхэд тохирсон (⚠️ 6 шатны бодолтыг нэгтгэлийн нэрээр гаргахгүй) */
export const progressLabel = (src: ProgressSrc): string => (src === 'negtgel'
  ? tr('Гүйцэтгэлийн хувь')
  : tr('Гүйцэтгэлийн хувь (6 шатаар)'));

/** Тайлангийн дэд тайлбар — эхэд тохирсон */
export const progressSub = (src: ProgressSrc): string => (src === 'negtgel'
  ? tr('Нэгтгэл гүйцэтгэлээр')
  : tr('6 шатны жигнэсэн хувь'));

/**
 * ⚠️ Гүйцэтгэлийн хувь нь ЭНГИЙН ДУНДАЖ БИШ, ӨРТГӨӨР ЖИГНЭСЭН: 500 тэрбумын
 * ажил 30%-тай, 1 тэрбумынх 100%-тай байхад энгийн дундаж 65% гэж хэлэх бөгөөд
 * төслийн бодит явцыг хоёр дахин үнэлнэ. Хэмжигдээгүй (багц нь нэгтгэлд
 * олдоогүй) ажил хуваарьт ч, хүртвэрт ч ОРОХГҮЙ.
 */
export function kpisOf(
  rows: CfRow[],
  contractSum: number,
  landPct: number | null = null,
  /**
   * ⚠️ 2026-09-25: `Negtgel_guitsetgel`-ийн ТӨСЛИЙН НИЙТ гүйцэтгэл
   * (`negtgel.negtgelProjectPct`). Өгөгдвөл 6 шатны бодолтыг ДАРНА — нэгтгэл
   * хүснэгт бол албан ёсны тоо. ⚠️ Шүүлттэй (хугацаа/чарт) үед дуудагч
   * `null` өгнө: нэгтгэл нь гэрээний мөрөөр задрахгүй тул шүүсэн хэсгийн
   * хувийг зөвхөн 6 шатны бодолт л хэлж чадна.
   */
  wbsPct: number | null = null,
): Kpi {
  let budget = 0;
  /* ⚠️ `wTop` (жинлэсэн дунджийн хүртвэр) ХАСАГДСАН (2026-09-16): гүйцэтгэлийн
     хувь нь `stagePct` буюу ӨӨР эхээс ирдэг болсон (2026-09-08) тул бодогдоод
     хэзээ ч уншигддаггүй үлдэгдэл байв. `wSum` нь ХАМРАЛТАД хэрэгтэй хэвээр. */
  let wSum = 0;
  const types = new Set<string>();

  for (const r of rows) {
    /*
     * ⚠️ НИЙТ ТӨСӨВ нь Excel-ийн НИЙТ мөртэй (`=+I8+I21`) ЯГ таарна: нийгмийн
     * дэд бүтэц · газар чөлөөлөлт · бондын хүү эх файлын нийлбэрт ОРДОГГҮЙ
     * (2026-09-09, хэрэглэгчийн заавар: «excel deer bgaa toonuud l haragdah
     * ystoi»). Бүх мөрийг нэмбэл 3,485.9 тэрбум гарах бөгөөд тэр тоо эх файлд
     * ХААНА Ч БАЙХГҮЙ. Дэлгэрэнгүйг `finExcelLayout.ts`-ээс үз.
     * ⚠️ Тэдгээр мөр чарт, шүүлт, «Багц ажлын тоо»-нд ХЭВЭЭР — зөвхөн энэ
     * мөнгөн нийлбэрээс хасагдана.
     */
    if (r.inTotal) budget += r.cost;
    if (r.type) types.add(r.type);
    /* ⚠️ Хэмжигдээгүй ажил ХАМРАЛТАД орохгүй — `progress == null` нь «мэдээлэлгүй»
       гэсэн үг бөгөөд 0 гүйцэтгэлтэй ИЖИЛ БИШ. */
    if (r.inTotal && r.progress != null && r.cost > 0) {
      wSum += r.cost;
    }
  }

  /*
   * ГҮЙЦЭТГЭЛИЙН ХУВЬ — «Нэгтгэл гүйцэтгэл»-ийн ТӨСЛИЙН НИЙТ мөртэй ИЖИЛ
   * (2026-09-08, хэрэглэгчийн заавар: «шинэ source»).
   *
   * ⚠️ Урьд нь ЗӨВХӨН `Guitsetgel_huwi` (барилга угсралт, 19.1%) байсан бөгөөд
   * тэр нь төслийн бэлтгэл ажлыг — ТЭЗҮ, зураг төсөл, газар чөлөөлөлт,
   * зөвшөөрөл, сонгон шалгаруулалт — огт тооцдоггүй байв. Одоо зургаан шат нь
   * тогтоосон жингээрээ (5·10·3·1·1·79 + улсын комисс 1) нийлж 33.9% гарна.
   * ⚠️ Тэр талбар нь ХЭВЭЭР хэрэгтэй: «Гэрээлсэн байдал, бодит гүйцэтгэл»
   *    чарт ба хүснэгт түүнийг ШУУД уншдаг.
   */
  const stagePct = wbsPct
    ?? stageProjectPct(rows.map((r) => ({ budget: r.cost, pct: r.stage })), landPct);

  return {
    budget,
    contract: contractSum,
    progress: stagePct,
    progressSrc: wbsPct != null ? 'negtgel' : 'stage',
    /* ⚠️ Мөнгө нь ХУВЬТАЙГАА ЗААВАЛ таарна: `Σ өртөг × хувь` — эс бөгөөс
       индикатор дээр хоёр тоо зөрчилдөнө. */
    progressAmount: stagePct == null ? 0 : (budget * stagePct) / 100,
    /* ⚠️ ХАМРАЛТ нь одоо БАРИЛГЫН хэмжилтийнх: хэдэн хувийн төсөв бодит
       гүйцэтгэлийн хэмжилттэй вэ. Индикаторын хувь өөр эхээс ирдэг ч энэ
       нь «хэр бодитой хэмжигдсэн» гэдгийг хэлсэн хэвээр. */
    progressCovered: budget > 0 ? (wSum / budget) * 100 : 0,
    /* ⚠️ МӨРИЙН тоо — мөр бүр нэг ажил. Ялгаатай багцаар тоолбол дэд багцгүй
       ажил алдагдаж, нэг багцын хоёр ажил нэг болж нийлдэг.
       ⚠️ Ажлын БУС мөр (хасагдсан · бондын хүү) тоологдохгүй — `isWork`. */
    packages: rows.filter((r) => r.isWork).length,
    types: types.size,
  };
}

/**
 * БАРИЛГА УГСРАЛТЫН БАГЦ → блокийн давхаргын `BAGTS` утга (2026-09-15).
 *
 * ⚠️ Орон сууцны багцад (Багц 1 … 4.2) `PKG_BY_BAGTS`-д ДАВХАРГА БАЙХГҮЙ:
 * тэдгээрийн орон зайн хүрээ нь ДЭД БҮТЦИЙН шугам биш, БЛОКИЙН полигон
 * (`mon:building`, 113 блок). Тиймээс чартаас зурагт холбохдоо блокийн
 * давхаргыг `BAGTS` талбараар шүүнэ.
 *
 * ⚠️ Түлхүүр нь `bagtsKey` (нормчилсон), утга нь ҮЙЛЧИЛГЭЭН ДЭХ ЯГ бичиглэл
 * («Багц 3.1») — SQL шүүлт тэр бичиглэлээр л ажиллана.
 */
export const loadBuildPkgs = cached<Map<string, string>>(async () => {
  const rows = await queryFeatures(BUILDING.url, {
    outFields: [BUILDING.fields.bagts],
    limit: 4000,
  });
  const m = new Map<string, string>();
  for (const r of rows) {
    const v = sOf(r[BUILDING.fields.bagts]);
    if (v) m.set(bagtsKey(v), v);
  }
  return m;
}, undefined, ['BUILDING']);

/** Гэрээний дүнгийн нийлбэр — шүүсэн мөрүүдээс (тусад нь: `CfRow`-д ороогүй) */
export const loadContractSum = cached<Map<number, number>>(async () => {
  const rows = await queryFeatures(CF.url, { where: CF_WORK_WHERE, outFields: ['OBJECTID', CF.contract], limit: 4000 });
  return new Map(rows.map((r) => [nOf(r.OBJECTID), nOf(r[CF.contract])]));
}, undefined, ['CASHFLOW_NEW']);

/* ══════════════════════ ХАБ — ӨНӨӨДРИЙН БАЙДЛААР ══════════════════════ */

export type HseNow = {
  /** Хамгийн сүүлд бөглөсөн огноо, `YYYY-MM-DD` */
  date: string;
  /* ⚠️ 2026-09-25: `null` = нүд ХООСОН (бөглөөгүй) — 0 БИШ. Урьд нь `nOf` нь
     хоосныг 0 болгож «0 хүн ажиллаж байна» гэсэн худал индикатор гаргадаг байв. */
  workers: number | null;
  equipment: number | null;
  manHours: number | null;
};

/**
 * ХАБ-ын СҮҮЛИЙН бүртгэл.
 *
 * ⚠️ «Өнөөдрийн байдлаар» гэдгийг ӨНӨӨДРИЙН ОГНООГООР шүүхгүй: маягт өдөр
 * бүр бөглөгддөггүй тул өнөөдөр хоосон байвал индикатор 0 гэж худал хэлнэ.
 * Оронд нь СҮҮЛИЙН бөглөгдсөн мөрийг авч, түүний огноог хамт үзүүлнэ —
 * хэрэглэгч тоо нь хэдийнх болохыг хардаг.
 */
export const loadHseNow = cached<HseNow | null>(async () => {
  const f = HABEA.labor.fields;
  const rows = await queryFeatures(HABEA.labor.url, {
    outFields: [f.ognoo, f.niitAjiltan, f.hunTsag, f.niitTehnik],
    orderBy: `${f.ognoo} DESC`,
    limit: 1,
  });
  const r = rows[0];
  if (!r) return null;
  const ms = Number(r[f.ognoo]);
  return {
    /* ⚠️ ОРОН НУТГИЙН огноо — UTC slice нь +08 бүсэд өглөөний 08:00 хүртэл
       бүртгэгдсэн маягтыг ӨМНӨХ өдрөөр харуулдаг байв (2026-09-15). Энэ
       огноо нь дээрх ⚠️-ийн «тоо нь хэдийнх вэ» гэсэн зорилготой. */
    date: Number.isFinite(ms) ? dayKey(ms) : '',
    workers: nnOf(r[f.niitAjiltan]),
    equipment: nnOf(r[f.niitTehnik]),
    manHours: nnOf(r[f.hunTsag]),
  };
}, 5 * 60_000, ['HABEA']); // ⚠️ ХАБ маягт бичихэд шууд шинэчлэгдэнэ (2026-09-17)

/* ══════════════ ХУГАЦААНЫ НЭГДСЭН ЦУВАА ══════════════ */

export type TimePoint = {
  key: string;
  label: string;
  /**
   * Хуримтлагдсан эзлэх хувь (S-муруй).
   *
   * ⚠️ `null` = ТӨЛӨВЛӨГӨӨ ХЭМЖИГДЭЭГҮЙ (0 БИШ) — 2026-09-11. Тэнхлэг нь
   *    ГУРВАН эх сурвалжийн НЭГДЭЛ (`per` · `ipcByMonth` ·
   *    `housingMoneyByMonth`) тул Cashflow-гийн төлөвлөгөө ОГТ байхгүй сар ч
   *    тэнхлэгт гарч ирнэ. Тэнд 0 зурвал «тэр сард төлөвлөгөө 0%» гэсэн
   *    ХУДАЛ мэдэгдэл болно — үнэн нь «бөглөгдөөгүй». `ipcPct`/`physPct`
   *    аль хэдийн энэ дүрмээр (`?? null`) явдаг байсан; `pct` ганцаараа
   *    хоцорч, CLAUDE.md-ийн `null ≠ 0` дүрмийг зөрчиж байв.
   */
  pct: number | null;
  /** Тухайн үед ногдох захирамжийн олгосон дүн (хуримтлалгүй) */
  amount: number;
  /**
   * ОЛГОСОН IPC — хуримтлагдсан эзлэх хувь (хоёр дахь S-муруй, 2026-09-10).
   *
   * ⚠️ `pct`-тэй ИЖИЛ ХУВААРЬТАЙ (`cfTotal`) — эс бөгөөс хоёр муруй нэг
   *    тэнхлэгт зэрэгцэн зурагдахад «төлөвлөгөө ↔ бодит олголт» гэсэн
   *    харьцуулалт утгагүй болно.
   * ⚠️ `null` = ХЭМЖИГДЭЭГҮЙ (0 БИШ): IPC-ийн сарын тэнхлэг
   *    (`cfMonthAxis`) нь Cashflow төлөвлөгөөний саруудаас БОГИНО тул
   *    түүний гадна үлдсэн сард 0 зурвал «тэр саруудад олголт огт байгаагүй»
   *    гэсэн ХУДАЛ мэдээлэл өгнө. Муруй тэнд ТАСАРНА.
   */
  ipcPct: number | null;
  /**
   * ОЛГОСОН IPC — ХУРИМТЛАГДСАН ЯГ ₮ (`ipcPct`-ийн мөнгөн эх, бүхэлчлэлгүй).
   * ⚠️ Огноогүй урьдчилгаа (`ipcBase`) ОРСОН тул төгсгөл нь HO-ийн нийт
   *    олгосон дүнтэй ТЭНЦҮҮ. `null` = тэр сард муруй байхгүй.
   */
  ipcMoney: number | null;
  /**
   * ОРОН СУУЦНЫ БАРИЛГАЖИЛТЫН БИЕТ ЯВЦ — мөнгөн эквивалентаар, нийт
   * төсөвт эзлэх хуримтлагдсан хувь (гурав дахь S-муруй, 2026-09-10).
   *
   * ⚠️ `pct`-тэй ИЖИЛ ХУВААРЬТАЙ (`cfTotal`) — гурван муруй нэг тэнхлэгт.
   *    Утга нь БАГА байх нь зүйн хэрэг: орон сууц төслийн 58.6%-ийг эзэлдэг
   *    тул бүрэн дуусахад ч ~58.6% дээр л тогтоно.
   * ⚠️ `null` = ХЭМЖИГДЭЭГҮЙ (0 БИШ).
   */
  physPct: number | null;
};


/* ══════════════ ЗАХИРАМЖИЙН ДҮН — ХУГАЦААГААР ══════════════ */

/**
 * ОЛГОСОН ДҮН хугацааны хуваарилалтаар — БАГАНАН чарт (2026-09-04).
 *
 * ⚠️ Хуваарилах АРГА нь `sCurve`-ТЭЙ ИЖИЛ: ажил бүрийн дүнг төлөвлөгөөт
 * эхлэх→дуусах хоорондох саруудад ЖИГД тарааж, дараа нь хугацааны нүд
 * бүрээр НИЙЛҮҮЛНЭ. Эхлэх огноонд бүтнээр нь тавибал захирамж гарсан сард
 * хэдэн зуун тэрбумын шонгууд гарч, дунд нь хоосон үлдэнэ.
 *
 * ⚠️ ХУРИМТЛАЛГҮЙ — S-муруйгаас ЯГ ЭНДЭЭРЭЭ ялгаатай. Багана нь «тэр
 * хугацаанд ХЭДЭН ТӨГРӨГ ногдож байна» гэдгийг хэлнэ; хуримтлуулбал бүх
 * багана өмнөхөөсөө өндөр болж, аль үе ачаалалтай болох нь харагдахгүй.
 *
 * ⚠️ Тэнхлэгийн нарийвчлал ба таслалт нь `sCurve`-тэй нэг дүрмээр
 * (`grainOf`, `hit`) — хоёр чарт нэг хугацааны шугаман дээр зэрэгцэж
 * уншигдах ёстой.
 */
export function decreeSeries(
  rows: CfRow[],
  grain: Grain = 'year',
  period: Period = NO_PERIOD,
): CurvePoint[] {
  const per = new Map<string, number>();
  for (const r of rows) {
    if (r.decree <= 0 || r.start == null) continue;
    const s = new Date(r.start);
    const e = new Date(r.end ?? r.start);
    let y = s.getUTCFullYear();
    let m = s.getUTCMonth();
    const ey = e.getUTCFullYear();
    const em = e.getUTCMonth();

    const n = Math.min(480, Math.max(1, (ey - y) * 12 + (em - m) + 1));
    const step = r.decree / n;
    for (let i = 0; i < n; i += 1) {
      const k = `${y}-${String(m + 1).padStart(2, '0')}`;
      per.set(k, (per.get(k) ?? 0) + step);
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  }
  if (per.size === 0) return [];

  const months = [...per.keys()].sort().filter((key) => {
    if (!periodActive(period)) return true;
    const y = Number(key.slice(0, 4));
    const m = Number(key.slice(5, 7));
    return hit(period.years, y) && hit(period.quarters, Math.floor((m - 1) / 3) + 1) && hit(period.months, m);
  });
  if (months.length === 0) return [];

  if (grain === 'month') {
    return months.map((k) => ({ key: k, label: k, value: per.get(k) ?? 0 }));
  }

  /* Нарийвчлалд буулгах — энд НИЙЛБЭР (хуримтлал биш тул нэмэх нь зөв) */
  const out = new Map<string, { label: string; value: number }>();
  for (const k of months) {
    const y = k.slice(0, 4);
    const m = Number(k.slice(5, 7));
    const q = Math.floor((m - 1) / 3) + 1;
    const bk = grain === 'year' ? y : `${y}-${q}`;
    const label = grain === 'year' ? y : `${y} ${ROMAN[q - 1]}`;
    const prev = out.get(bk);
    out.set(bk, { label, value: (prev?.value ?? 0) + (per.get(k) ?? 0) });
  }
  return [...out].map(([key, v]) => ({ key, label: v.label, value: v.value }));
}

/* ══════════════ ЧӨЛӨӨГДӨӨГҮЙ ТАЛБАР — ШАЛТГААНААР ══════════════ */

/**
 * Шалтгаан → тэр шалтгаантай ҮЛДСЭН нэгж талбаруудын ObjectID.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ: «Багцын төрлөөр давхцаж буй» тоог ШАЛТГААНААР
 * нарийсгахын тулд. `overlapLeftParcels` нь орон зайн огтлолцлыг л мэддэг
 * (аль талбар аль багцтай), шалтгааны талаар юу ч мэдэхгүй — хоёрыг
 * ObjectID-аар огтолж холбоно.
 *
 * ⚠️ Шалтгааны нэрийг `land.ts`-ийн `cleanReason`-ТОЙ ЯГ ИЖИЛ дүрмээр
 * цэвэрлэнэ (арын зай, төгсгөлийн цэг). Зөрвөл жагсаалт дээр дарсан
 * шалтгаан энэ зураглалд олдохгүй бөгөөд давхцал ҮРГЭЛЖ хоосон гарна.
 * `cleanReason` нь `land.ts`-д хувийн тул дүрмийг энд ХУУЛСАН — өөрчлөгдвөл
 * ХОЁУЛАНГ нь хамт өөрчил.
 *
 * ⚠️ 2026-09-06 (merge tailan × bagtsiin-medeelel): `PARCEL_LEFT` нь
 *    `Selbe_parcel_20260906` болсон — «Үлдсэн нэгж талбар» гэсэн ангилал
 *    ОГТ БАЙХГҮЙ (төлөв ба шалтгаан НЭГ талбар `явцы_1`), OID нь `FID`
 *    (`OBJECTID` нь энгийн Integer, 1,802 мөрд 0). Хуучин where/`OBJECTID`-аар
 *    асуувал 0 мөр буцаж, «давхцаж буй» ҮРГЭЛЖ хоосон гардаг байв. Тиймээс
 *    `parcelLeftWhere()` ба `PARCEL_LEFT.oid` — `parcelOverlap`-ын
 *    `returnIdsOnly`-той ИЖИЛ талбар байх ёстой (огтлолцол OID-аар).
 */
export const loadReasonOids = cached<Map<string, Set<number>>>(async () => {
  const { PARCEL_LEFT, parcelLeftWhere } = await import('@/lib/services');
  const F = PARCEL_LEFT.fields;
  const rows = await queryFeatures(PARCEL_LEFT.url, {
    where: parcelLeftWhere(),
    outFields: [PARCEL_LEFT.oid, F.status],
    limit: 4000,
  });

  const clean = (v: unknown): string => {
    const t = String(v ?? '').trim().replace(/\.$/, '').trim();
    return !t || t === '—' ? tr('Тодорхойгүй') : t;
  };

  const m = new Map<string, Set<number>>();
  for (const r of rows) {
    const k = clean(r[F.status]);
    const oid = nOf(r[PARCEL_LEFT.oid]);
    if (!oid) continue;
    const set = m.get(k) ?? new Set<number>();
    set.add(oid);
    m.set(k, set);
  }
  return m;
}, undefined, ['PARCEL_LEFT']);

/**
 * ШҮҮГДСЭН мөрүүдэд БОДИТООР байгаа дэд багц → ажлын төрлүүд.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ: `loadSubPkgLayers` нь БҮХ cashflow-гоос угсардаг тул
 * хугацааны шүүлтийг мэдэхгүй. Баруун баганын «Ажлын төрлөөр давхцаж буй» ба
 * «Саад — багцаар» хоёр түүн дээр тулгуурладаг тул шүүлт тавихад ч бүрэн
 * жагсаалт харуулсаар байв (хэрэглэгчийн шүүмж, 2026-09-06).
 *
 * ⚠️ `loadSubPkgLayers`-ТЭЙ ИЖИЛ ДҮРЭМ: `isPkgRange` нүдийг хасна («БАГЦ 1- 4»
 * нь `bagtsKey`-ээр БОДИТ «Багц 14» болж мөргөлддөг). Дүрэм зөрвөл шүүлттэй ба
 * шүүлтгүй жагсаалт хоорондоо тохирохгүй болно.
 *
 * ⚠️ ГАЗРЫН ЗУРГИЙН давхарга байгаа эсэхийг ШАЛГАХГҮЙ — тэр шүүлтийг дуудагч
 * тал (`loadSubPkgLayers`-ийн үр дүнтэй огтлолцуулж) хийнэ.
 */
export function activeSubPkgTypes(rows: CfRow[]): Map<string, string[]> {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    const raw = r.pkg2;
    if (!raw || isPkgRange(raw)) continue;
    const k = bagtsKey(raw);
    if (!k) continue;
    const set = m.get(k) ?? new Set<string>();
    if (r.type) set.add(r.type);
    m.set(k, set);
  }
  return new Map([...m].map(([k, v]) => [k, [...v]]));
}

/* ══════════════ ДЭД БАГЦ → ГАЗРЫН ЗУРГИЙН ДАВХАРГА ══════════════ */

export type SubPkg = {
  key: string;
  label: string;
  layerIds: string[];
  /**
   * Тухайн дэд багцад бүртгэгдсэн АЖЛЫН ТӨРЛҮҮД (`Turul`).
   *
   * ⚠️ ОЛОН БАЙНА: нэг дэд багцад ТЭЗҮ, зураг төсөл, барилга угсралт зэрэг
   * хэд хэдэн ажил бүртгэгддэг тул НЭГ утга биш ОЛОНЛОГ. Эхнийхийг нь авбал
   * тухайн багцын бусад ажил чимээгүй алга болно.
   */
  types: string[];
};

/**
 * Cashflow-гийн «Дэд багц» → газрын зургийн `pkg:*` давхаргууд.
 *
 * ⚠️ `Bagts` БИШ `Ded_bagts`. Газрын зургийн давхаргууд ДЭД багцын түвшинд
 * бүртгэлтэй (`Багц 5.1`, `Багц 16.3` …) бол `Bagts` нь эцэг түвшин
 * («БАГЦ-5») — 2026-09-04-нд хэмжсэнээр `Bagts` ердөө 9/26 таарч байсныг
 * `Ded_bagts` 42/53 болгосон.
 *
 * ⚠️ ДИАПАЗОН НҮДИЙГ ХАСНА (`isPkgRange`). «БАГЦ 1- 4» нь `bagtsKey`-ээр
 * «БАГЦ14» болдог бөгөөд тэр нь БОДИТ «Багц 14»-ийн ЯГ түлхүүр — хасахгүй
 * бол ТЭЗҮ 1–4-ийн зураг төсөл нь дулааны сувгийн давхаргад наалдана
 * (`services.ts`-ийн `isPkgRange`-ийн тайлбар).
 *
 * ⚠️ Таарахгүй дэд багц (Багц 1–4.2 барилга, Багц 8, 18) ЖАГСААЛТААС ГАРНА:
 * тэдгээрт `pkg:*` давхарга байхгүй тул зурагт үзүүлэх зүйлгүй.
 */
export const loadSubPkgLayers = cached<SubPkg[]>(async () => {
  const { PKG_BY_BAGTS, bagtsKey, isPkgRange } = await import('@/lib/services');
  const rows = await queryFeatures(CF.url, {
    where: CF_WORK_WHERE,
    outFields: [CF.pkg2, ...FIN_XL_CHART_FIELDS],
    limit: 4000,
  });

  const seen = new Map<string, string>();
  const types = new Map<string, Set<string>>();
  for (const r of rows) {
    /* ⚠️ `CF.pkg2`-ООР, талбарын нэрийг ШУУД бичихгүй. 2026-09-09-нд энд
       хуучин `r.Ded_bagts` гэж үлдсэн байсныг заслаа: 0904→0909 шилжүүлэгт
       тэр нэр `bagts` болсон тул утга нь ҮРГЭЛЖ хоосон буцаж, жагсаалт
       бүхэлдээ ХООСОН болсон — «Ажлын төрлөөр давхцаж буй» карт ба газрын
       зурагтай холбогдох гүүр чимээгүй тасарсан байв. */
    const raw = sOf(r[CF.pkg2]);
    if (!raw || isPkgRange(raw)) continue;
    const k = bagtsKey(raw);
    if (!k || !PKG_BY_BAGTS[k]?.length) continue;
    if (!seen.has(k)) seen.set(k, raw);
    const ty = finXlChartCat(r);
    if (ty) {
      const set = types.get(k);
      if (set) set.add(ty); else types.set(k, new Set([ty]));
    }
  }
  return [...seen]
    .map(([key, label]) => ({
      key,
      label,
      layerIds: PKG_BY_BAGTS[key],
      types: [...(types.get(key) ?? [])],
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'mn'));
}, undefined, ['CASHFLOW_NEW']);
