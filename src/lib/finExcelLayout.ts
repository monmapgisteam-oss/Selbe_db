/**
 * САНХҮҮЖИЛТИЙН ХҮСНЭГТИЙН EXCEL ЗОХИОМЖ.
 */
import { t as tr, perLocale } from '@/lib/i18nCore';
import { pct } from '@/lib/format';

/**
 * ЗОХИОМЖИЙН ХУВИЛБАР — хадгалагдсан баганы дарааллыг хэзээ хаяхыг шийднэ.
 */
export const FIN_XL_ORDER_V = '0909-rev00-month2';

/**
 * БАГАНЫ ДАРААЛАЛ — Excel-ийн E…AA багана яг тэр эрэмбээр.
 */
export const FIN_XL_ORDER: readonly string[] = [
  'bagts',
  'dugaar',
  'ajil_uilchilgee',
  'ho_dun_zahiramj',
  'ho_dun_geree',
  'tusuld_ezleh_huvi_dun',
  'tusuld_ezleh_huvi',
  'ehleh_ognoo',
  'duusah_ognoo',
  'zahiramj_ognoo',
  'zahiramj_dugaar',
  'zahiramj_niit_dun',
  'zahiramj_unet_tsaas',
  'zahiramj_unet_tsaas_huvi',
  'zahiramj_borluulalt_dun',
  'zahiramj_niislel_tusuv',
  'zahiramj_nzd_nuuts',
  'geree_ognoo',
  'geree_dugaar',
  'guitsetgegch',
  'geree_dun',
  'guitsetgel_huvi',
  'tezu',
  'ajliin_zurag_tusul',
  'gazar_chuluulult',
  'zuwshuurul',
  'songon_shalgaruulalt',
  'ho_dungiin_tailbar',
  'zahialagch_hynalt_baig',
  'urdchilgaa_batalgaa_dun',
  'urdchilgaa_huvi',
  'urdchilgaa_zh_zardal',
  'dugaar2',
  'bagts_74',
  'geree_ehleh',
  'geree_duusah',
  'guits_ehleh',
  'guits_duusah',
  'gazar_ehleh',
  'gazar_duusah',
  'songon_ognoo',
  'ashiglalt_ognoo',
  'sar_mongo_eh',
  'zahiramj_borluulalt',
  'cashflow_id',
  'cashflow_start',
  'cashflow_end',
  'cashflow_huwi',
  'cashflow_dun',
];
const lzGeree_dun14 = perLocale(() => ([tr('Гэрээний мэдээлэл')]));

const lzGuitsetgegch13 = perLocale(() => ([tr('Гэрээний мэдээлэл')]));

const lzGeree_dugaar12 = perLocale(() => ([tr('Гэрээний мэдээлэл')]));

const lzGeree_ognoo11 = perLocale(() => ([tr('Гэрээний мэдээлэл')]));

const lzZahiramj_nzd_nuuts10 = perLocale(() => ([tr('Захирамжийн мэдээлэл'), tr('Санхүүжилтийн эх үүсвэр')]));

const lzZahiramj_niislel_tusuv9 = perLocale(() => ([tr('Захирамжийн мэдээлэл'), tr('Санхүүжилтийн эх үүсвэр')]));

const lzZahiramj_borluulalt_dun8 = perLocale(() => ([tr('Захирамжийн мэдээлэл'), tr('Санхүүжилтийн эх үүсвэр')]));

const lzZahiramj_unet_tsaas_huvi7 = perLocale(() => ([tr('Захирамжийн мэдээлэл'), tr('Санхүүжилтийн эх үүсвэр')]));

const lzZahiramj_unet_tsaas6 = perLocale(() => ([tr('Захирамжийн мэдээлэл'), tr('Санхүүжилтийн эх үүсвэр')]));

const lzZahiramj_niit_dun5 = perLocale(() => ([tr('Захирамжийн мэдээлэл')]));

const lzZahiramj_dugaar4 = perLocale(() => ([tr('Захирамжийн мэдээлэл')]));

const lzZahiramj_ognoo3 = perLocale(() => ([tr('Захирамжийн мэдээлэл')]));

const lzDuusah_ognoo2 = perLocale(() => ([tr('Төлөвлөгөөт хугацаа')]));

const lzEhleh_ognoo1 = perLocale(() => ([tr('Төлөвлөгөөт хугацаа')]));


/**
 * БҮЛГИЙН ЗАМ — Excel-ийн нэгтгэсэн толгойн зурвасууд (дээд → доод).
 */
export const FIN_XL_GROUP: Record<string, readonly string[]> = {
  get ehleh_ognoo() { return lzEhleh_ognoo1(); },
  get duusah_ognoo() { return lzDuusah_ognoo2(); },
  get zahiramj_ognoo() { return lzZahiramj_ognoo3(); },
  get zahiramj_dugaar() { return lzZahiramj_dugaar4(); },
  get zahiramj_niit_dun() { return lzZahiramj_niit_dun5(); },
  get zahiramj_unet_tsaas() { return lzZahiramj_unet_tsaas6(); },
  get zahiramj_unet_tsaas_huvi() { return lzZahiramj_unet_tsaas_huvi7(); },
  get zahiramj_borluulalt_dun() { return lzZahiramj_borluulalt_dun8(); },
  get zahiramj_niislel_tusuv() { return lzZahiramj_niislel_tusuv9(); },
  get zahiramj_nzd_nuuts() { return lzZahiramj_nzd_nuuts10(); },
  get geree_ognoo() { return lzGeree_ognoo11(); },
  get geree_dugaar() { return lzGeree_dugaar12(); },
  get guitsetgegch() { return lzGuitsetgegch13(); },
  get geree_dun() { return lzGeree_dun14(); },
};

/**
 * НАВЧНЫ ШОШГО — Excel-ийн 6-р мөрийн БОГИНО нэр.
 */
export const FIN_XL_LEAF: Record<string, string> = {
  get bagts() { return tr('БАГЦ'); },
  get dugaar() { return tr('№'); },
  get ajil_uilchilgee() { return tr('Ажил, үйлчилгээ'); },
  get ho_dun_zahiramj() { return tr('ХӨРӨНГӨ ОРУУЛАЛТЫН ДҮН (Захирамж болон Урьдчилсан тооцоолол дүн)'); },
  get ho_dun_geree() { return tr('ХӨРӨНГӨ ОРУУЛАЛТЫН ДҮН (Гэрээ болон Урьдчилсан тооцоолол дүн)'); },
  get tusuld_ezleh_huvi_dun() { return tr('Төсөлд эзлэх хувь'); },
  get tusuld_ezleh_huvi() { return tr('Төсөлд эзлэх хувь (текст)'); },
  get ehleh_ognoo() { return tr('Эхлэх'); },
  get duusah_ognoo() { return tr('Дуусах'); },
  get zahiramj_ognoo() { return tr('Захирамжийн огноо'); },
  get zahiramj_dugaar() { return tr('Дугаар'); },
  get zahiramj_niit_dun() { return tr('Захирамж нийт дүн'); },
  get zahiramj_unet_tsaas() { return tr('Үнэт цаас'); },
  get zahiramj_unet_tsaas_huvi() { return tr('Үнэт цаас %'); },
  get zahiramj_borluulalt_dun() { return tr('Борлуулалт орлого'); },
  get zahiramj_niislel_tusuv() { return tr('Нийслэлийн төсөвийн хөрөнгөөр'); },
  get zahiramj_nzd_nuuts() { return tr('НЗД нөөц хөрөнгө'); },
  get geree_ognoo() { return tr('Гэрээ байгуулсан огноо'); },
  get geree_dugaar() { return tr('Гэрээний дугаар'); },
  get guitsetgegch() { return tr('Гүйцэтгэгч'); },
  get geree_dun() { return tr('Гэрээний дүн'); },
  get guitsetgel_huvi() { return tr('Санхүүжсэн гүйцэтгэлийн хувь'); },
  get tezu() { return tr('ТЭЗҮ'); },
  get ajliin_zurag_tusul() { return tr('Ажлын зураг төсөл'); },
  get gazar_chuluulult() { return tr('Газар чөлөөлөлт'); },
  get zuwshuurul() { return tr('Зөвшөөрөл'); },
  get songon_shalgaruulalt() { return tr('Сонгон шалгаруулалт'); },
  get ho_dungiin_tailbar() { return tr('Хөрөнгө оруулалтын дүнгийн тайлбар'); },
  get zahialagch_hynalt_baig() { return tr('Захиалагчийн хяналт хийх байгууллага'); },
  get urdchilgaa_batalgaa_dun() { return tr('Баталгааны дүн'); },
  get urdchilgaa_huvi() { return tr('Хувь'); },
  get urdchilgaa_zh_zardal() { return tr('Суутгасан ЗХ зардал'); },
  get dugaar2() { return tr('Дугаар 2'); },
  get bagts_74() { return tr('Багц 74'); },
  get cashflow_id() { return tr('Cashflow дугаар'); },
  get cashflow_start() { return tr('Сар эхлэх'); },
  get cashflow_end() { return tr('Сар дуусах'); },
  get cashflow_huwi() { return tr('Сарын төлөвлөгөө, %'); },
  get cashflow_dun() { return tr('Сарын дүн'); },
};

/**
 * БАГАНЫ АНХДАГЧ ӨРГӨН (px) — Excel-ийн харьцааг хадгалсан.
 */
export const FIN_XL_WIDTH: Record<string, number> = {
  bagts: 118,
  dugaar: 52,
  ajil_uilchilgee: 340,
  ho_dun_zahiramj: 190,
  ho_dun_geree: 190,
  tusuld_ezleh_huvi_dun: 118,
  tusuld_ezleh_huvi: 118,
  ehleh_ognoo: 108,
  duusah_ognoo: 108,
  zahiramj_ognoo: 124,
  zahiramj_dugaar: 104,
  zahiramj_niit_dun: 168,
  zahiramj_unet_tsaas: 160,
  zahiramj_unet_tsaas_huvi: 104,
  zahiramj_borluulalt_dun: 160,
  zahiramj_niislel_tusuv: 172,
  zahiramj_nzd_nuuts: 152,
  geree_ognoo: 124,
  geree_dugaar: 170,
  guitsetgegch: 190,
  geree_dun: 172,
  guitsetgel_huvi: 130,
  tezu: 92,
  ajliin_zurag_tusul: 132,
  gazar_chuluulult: 124,
  zuwshuurul: 108,
  songon_shalgaruulalt: 148,
  ho_dungiin_tailbar: 200,
  zahialagch_hynalt_baig: 210,
  urdchilgaa_batalgaa_dun: 150,
  urdchilgaa_huvi: 96,
  urdchilgaa_zh_zardal: 190,
  dugaar2: 76,
  bagts_74: 110,
  cashflow_id: 96,
  cashflow_start: 108,
  cashflow_end: 108,
  cashflow_huwi: 132,
  cashflow_dun: 150,
};

/**
 * БОСОО НЭГТГЭЛТЭЙ багана — Excel-ийн `E` баганы merge.
 */
export const FIN_XL_MERGE: readonly string[] = ['bagts'];

/** Толгойн зурвасын нэг мөрийн ӨНДӨР (px) — наалдмал `top`-ыг тооцоход */
export const FIN_XL_BAND_H = 26;

/** Талбарын бүлгийн зам (байхгүй бол хоосон) */
export const finXlGroup = (name: string): readonly string[] => FIN_XL_GROUP[name] ?? [];

/**
 * ХУВИЙН БАГАНУУД — зурвасын мөрд НЭМЭХГҮЙ, ЖИГНЭСЭН ДУНДЖААР гаргана.
 */
export const FIN_XL_PCT: readonly string[] = [
  'guitsetgel_huvi',
  'tezu',
  'ajliin_zurag_tusul',
  'gazar_chuluulult',
  'zuwshuurul',
  'songon_shalgaruulalt',
];

/**
 * 0–1 БУТАРХАЙ хувийн баганууд — `FIN_XL_PCT` (0–100)-аас ТУСДАА (2026-10-21).
 */
export const FIN_XL_FRACTION: readonly string[] = [
  'zahiramj_unet_tsaas_huvi',
  'urdchilgaa_huvi',
];

/**
 * ЖИГНЭХ БАГАНА — хувийн дундажийг ЭНЭ дүнгээр жигнэнэ.
 */
export const FIN_XL_PCT_WEIGHT = 'ho_dun_geree';

/* ═══════════════ БУТАРХАЙ (0–1) ХУВИЙН ЗАМ — ЦЭВЭР ФУНКЦҮҮД ═══════════════
 */

/** Бутархай (0–1) хувийн талбар уу (`FIN_XL_FRACTION`) */
export const finXlIsFraction = (name: string): boolean => FIN_XL_FRACTION.includes(name);

/** Харагдац · засвар · тоон шүүлтийн хэмжээс — бутархай талбарт 100, бусдад 1 (`finFilter.rowMatches`-ийн `scale`) */
export const finXlScale = (name: string): number => (finXlIsFraction(name) ? 100 : 1);

/** Бутархай утгын ХАРАГДАХ текст — `pct()` 100-аар ҮРЖҮҮЛДЭГГҮЙ тул ×100 (0.2 → «20.0%», «0.2%» БИШ) */
export const finXlFractionText = (x: number): string => pct(x * 100, 1);

/**
 * Засварын талбарын текст — бутархай талбарын ТОО бол харагдацтай ижил ×100 («20», «0.2» биш); бусад үед `null`
 * (дуудагч `finEdit.editText`-ээ хэрэглэнэ). `toPrecision(12)` — 0.07 × 100 = 7.000000000000001 мэт хөвөгч сүүлийг хасна.
 */
export const finXlEditText = (v: unknown, name: string): string | null =>
  finXlIsFraction(name) && typeof v === 'number' && Number.isFinite(v)
    ? String(Number((v * 100).toPrecision(12)))
    : null;

/** Зурвас/НИЙТ мөрд НИЙЛБЭР БИШ жигнэсэн дундаж гаргах багана уу — 0–100 хувь (`FIN_XL_PCT`) ба 0–1 бутархай */
export const finXlIsMean = (name: string): boolean => FIN_XL_PCT.includes(name) || finXlIsFraction(name);

/**
 * Өртгөөр (`FIN_XL_PCT_WEIGHT`) ЖИГНЭСЭН ДУНДАЖ — хадгалсан хэмжээсээрээ (бутархай бол 0–1; ×100-г харагдац хийнэ).
 */
export function finXlWeightedMean(rows: Iterable<Record<string, unknown>>, name: string): number | null {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  let w = 0;
  let top = 0;
  for (const r of rows) {
    const v = num(r[name]);
    const g = num(r[FIN_XL_PCT_WEIGHT]);
    if (v == null || g == null || g <= 0) continue;
    w += g;
    top += g * v;
  }
  return w === 0 ? null : top / w;
}

/* ═══════════════ МӨРИЙН БҮТЭЦ — Excel-ийн шатлал ═══════════════
 */

/** 1-р ТҮВШИН — «ТЭЗҮ, ЗУРАГ ТӨСӨЛ» · «БАРИЛГА УГСРАЛТ» · «НИЙГМИЙН ДЭД БҮТЭЦ» */
export const FIN_XL_SECTION = 'ajil_tuvshin1';

/** 2-р ТҮВШИН — «ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт» г.м. */
export const FIN_XL_GROUP_FIELD = 'ajil_tuvshin2';

/**
 * 3-р ТҮВШИН — «Гадна цахилгаан холбоо, дохиолол» г.м.
 */
export const FIN_XL_GROUP3_FIELD = 'ajil_tuvshin3';

/**
 * ТҮВШНИЙ КОД — зурвасын шошгын урд гарна («4.1 · Гадна цахилгаан холбоо»).
 */
export const FIN_XL_CODE = ['bagts_tuvshin1', 'bagts_tuvshin2', 'bagts_tuvshin3'] as const;

/**
 * ЕРӨНХИЙ НИЙЛБЭРЭЭС ХАСАГДАХ ХЭСГҮҮД — Excel-ийн мөр 7-ийн ТОМЬЁО.
 */
/**
 * ЧАРТЫН АНГИЛАЛ — ДАШБОАРДЫН 7 БҮЛЭГ.
 *
 *   1 ТЭЗҮ, ЗУРАГ ТӨСӨЛ
 *   2 БАРИЛГА УГСРАЛТ            (гадна тохижилт, өндөржилт)
 *   3 ОРОН СУУЦНЫ ХОРООЛОЛ
 *   4 ИНЖЕНЕРИЙН ДЭД БҮТЭЦ
 *   5 НИЙГМИЙН ДЭД БҮТЭЦ
 *   6 ГАЗАР ЧӨЛӨӨЛӨЛТ, БУУЛГАЛТ ЦЭВЭРЛЭГЭЭ
 *   7 БОНДЫН ХҮҮ
 */
const FIN_XL_CHART_SPLIT: Record<string, string> = {
  'ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт': 'ОРОН СУУЦНЫ ХОРООЛОЛ',
  'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт': 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ',
  'ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ - Барилга угсралт': 'ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ',
};

/**
 * Мөрийн чартын ангилал — «ОРОН СУУЦНЫ ХОРООЛОЛ».
 */
export const finXlChartCat = (row: Record<string, unknown>): string => {
  const s = (v: unknown) => String(v ?? '').trim();
  return FIN_XL_CHART_SPLIT[s(row.ajil_tuvshin2)] ?? s(row.ajil_tuvshin1);
};

/** Чартын ангилалд хэрэгтэй талбарууд — `outFields`-д ЗААВАЛ бүгд */
export const FIN_XL_CHART_FIELDS = [
  'bagts_tuvshin1', 'ajil_tuvshin1', 'bagts_tuvshin2', 'ajil_tuvshin2',
] as const;
export const FIN_XL_TOTAL_CODE_FIELD = 'bagts_tuvshin1';
export const FIN_XL_TOTAL_SKIP: readonly string[] = ['5', '6', '7'];
/** Excel-ийн мөр 7-ийн ЯГ ТЭР шошго */
export const FIN_XL_TOTAL_LABEL = () => tr('НИЙТ (Орон сууцны хороолол+ГИШС)');

/** Мөр ерөнхий нийлбэрт орох уу — `bagts_tuvshin1` кодоор */
export const finXlInTotal = (row: Record<string, unknown>): boolean => (
  !FIN_XL_TOTAL_SKIP.includes(String(row[FIN_XL_TOTAL_CODE_FIELD] ?? '').trim())
);

/**
 * ХҮСНЭГТЭД ОГТ ХАРАГДАХГҮЙ ХЭСЭГ — «7 БОНДЫН ХҮҮ» (2026-09-10, хэрэглэгчийн
 * заавар: «зураг дээрх 2 мөрийг hide, хүмүүст ерөөсөө харуулахгүй шүү, гэхдээ
 * код дээрээ хэвийн ажиллаад явна»).
 */
export const FIN_XL_ROW_HIDE: readonly string[] = ['7'];

/**
 * «БАГЦ АЖЛЫН ТОО»-НД ТООЛОГДОХГҮЙ ХЭСЭГ — «6 ГАЗАР ЧӨЛӨӨЛӨЛТ, БУУЛГАЛТ
 * ЦЭВЭРЛЭГЭЭ» (2026-09-10, хэрэглэгчийн заавар: «78 биш 74»).
 */
export const FIN_XL_WORK_SKIP: readonly string[] = ['6'];

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТ, БУУЛГАЛТ ЦЭВЭРЛЭГЭЭ хэсгийн код (2026-09-15).
 */
export const FIN_XL_LAND_CODE = '6';

/**
 * 1-Р ТҮВШИНД ГАРАХГҮЙ ХЭСЭГ — кодоороо нэг оронтой ч ЭЦГЭЭ ОРХИХГҮЙ
 * (2026-09-10, хэрэглэгчийн заавар: «түвшин 1 дээр гадна тохижилт
 * өндөржилт харагдахгүй, түвшин 2 дээр харагдана»).
 */
export const FIN_XL_LVL_KEEP: readonly string[] = [
  'ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ - Барилга угсралт',
];

/**
 * ЗУРВАСЫН ХАРАГДАХ НЭР — ЭЦГИЙН нэрийн ДАВТАЛТЫГ хасна (2026-09-10,
 * хэрэглэгчийн заавар: «дээрх нэрсийн ард байгаа Барилга угсралт гэсэн үг
 * харагдахгүй»).
 *
 * Үйлчилгээнд 2-р түвшний нэр нь эцгээ дагуулж бичигдсэн байдаг:
 *   «ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт»  (эцэг: БАРИЛГА УГСРАЛТ)
 *   «Инженерийн дэд бүтэц - ТЭЗҮ, зураг төсөл» (эцэг: ТЭЗҮ, ЗУРАГ ТӨСӨЛ)
 * Зурвас нь эцгийнхээ ЯГ ДООР сууж байгаа тул тэр давталт нэг дэлгэцэнд
 * хоёр удаа уншигдаж, нэрийн гол хэсгийг нүднээс шахдаг байв.
 */
export const finXlBandLabel = (name: string, parent: string): string => {
  const n = name.trim();
  const p = parent.trim();
  if (p === '') return n;
  const tail = ` - ${p}`.toLowerCase();
  return n.toLowerCase().endsWith(tail) ? n.slice(0, n.length - tail.length).trim() : n;
};

/** Мөр хүснэгтэд НУУГДСАН уу — `true` бол огт зурагдахгүй */
export const finXlRowHidden = (row: Record<string, unknown>): boolean => (
  FIN_XL_ROW_HIDE.includes(String(row[FIN_XL_TOTAL_CODE_FIELD] ?? '').trim())
);



/**
 * АНХДАГЧААР НУУГДСАН БАГАНА.
 */
/**
 * АНХДАГЧААР НУУГДСАН БАГАНА — «Санхүүжсэн гүйцэтгэлийн хувь»-ААС ХОЙШХИ
 * БҮГД (2026-09-10, хэрэглэгчийн заавар).
 */
/**
 * ХҮСНЭГТЭЭС БҮРМӨСӨН ХАСАГДАХ багана — нуугдсан БИШ, «Нуусан баганыг харуулах»-аар ч гарахгүй.
 */
export const FIN_XL_DROP: readonly string[] = ['tusuld_ezleh_huvi'];

const HIDE_FROM = 'guitsetgel_huvi';
export const FIN_XL_HIDE: string[] = FIN_XL_ORDER
  .slice(FIN_XL_ORDER.indexOf(HIDE_FROM) + 1)
  .filter((n) => !FIN_XL_DROP.includes(n));

