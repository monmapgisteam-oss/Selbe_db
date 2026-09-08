/**
 * САНХҮҮЖИЛТИЙН ХҮСНЭГТИЙН EXCEL ЗОХИОМЖ — «Сэлбэ дэд төв_ХО төлөвлөгөө_arcgis».
 *
 * ⚠️ ЭХ СУРВАЛЖ: `D:/Selbe/Cashflow/Сэлбэ дэд төв_ХО төлөвлөгөө_arcgis.xlsx`,
 * `Cashflow_arcgis_260709` хуудас. Тэр файл нь `Cashflow_0904` үйлчилгээ рүү
 * ачаалагдсан ЭХ хүснэгт — багана бүр 1:1 таарна. Гүйцэтгэл бөглөж буй хүмүүс
 * тэр Excel-ийг ӨДӨР БҮР хардаг тул порталын хүснэгт нь тэдэнд ТАНИЛ харагдах
 * ёстой (2026-09-08, хэрэглэгчийн заавар: «харагдацыг Excel-ийг дуурайлга,
 * цаана нь үйлчилгээ хэвийн ажиллана»).
 *
 * ⚠️ ЭНЭ НЬ ЗӨВХӨН ХАРАГДАЦ. Өгөгдөл, засвар, нийтлэл ямар ч байдлаар
 * өөрчлөгдөхгүй — талбарын нэр, төрөл, `applyEdits` бүгд хэвээр.
 *
 * ⚠️ Хэрэглэгчийн ӨӨРИЙН тохиргоо (нуулт · царцаалт · зөөлт · өргөн) нь
 * `useSheetCols`/`useColWidths`-д хадгалагддаг бөгөөд ЭНДЭХИЙГ ДАРНА. Энэ
 * файл нь зөвхөн АНХДАГЧ утга.
 */
import { t as tr } from '@/lib/i18nCore';

/**
 * БАГАНЫ ДАРААЛАЛ — Excel-ийн B…Z багана яг тэр эрэмбээр.
 *
 * ⚠️ `Bagts_74` нь Excel-д БАЙХГҮЙ (зөвхөн ArcGIS-д нэмэгдсэн) тул ЭЦЭСТ.
 * `Tusul` нь ЭНД ОГТ БАЙХГҮЙ: тэр нь багана биш, бүх өргөнөөр татагдах
 * ХЭСГИЙН ЗУРВАС мөр болно (`FIN_XL_SECTION`).
 * ⚠️ Энэ жагсаалт нь ШҮҮЛТ БИШ ЭРЭМБЭ: энд байхгүй талбар алдагдахгүй,
 * төгсгөлд эх дарааллаараа үлдэнэ (шинэ талбар нэмэгдэхэд ч ажиллана).
 */
export const FIN_XL_ORDER: readonly string[] = [
  'Turul',
  'Bagts',
  'Ded_bagts',
  'Nariiwchilsan_turul',
  'Urdch_tusuwt_urtug',
  'HO_dungiin_tailbar',
  'Ehleh_ognoo',
  'Duusah_ognoo',
  'Zahiramj_ognoo',
  'Zahiramj_dugaar',
  'Zahiramj_niit_dun',
  'Zah_eh_unet_tsaas',
  'Zah_eh_unet_tsaas_huwi',
  'Zah_eh_tusliin_orlogo',
  'Zah_eh_niislel_tusuw',
  'Zah_eh_NZD_nuuts',
  'Zahialagch_hyanalt_baig',
  'Guitsetgegch_baig',
  'Geree_ognoo',
  'Geree_dugaar',
  'Geree_erh_dun',
  'Urdchilgaa_batalgaa_dun',
  'Urdchilgaa_huwi',
  'Urdchilgaa_ZH_zardal',
  'Guitsetgel_huwi',
  /* ⚠️ ХАМГИЙН ЭЦЭСТ: Excel-д ийм багана БАЙХГҮЙ бөгөөд үйлчилгээнд ч 76 мөр
     бүгд хоосон. Багцын блокт хийвэл ЦАРЦСАН дөрвийн нэгийг эзэлж, ажлын
     нэрийг («Нарийвчилсан төрөл») царцаалтаас гаргана. */
  'Bagts_74',
];

/**
 * БҮЛГИЙН ЗАМ — Excel-ийн нэгтгэсэн толгойн зурвасууд (дээд → доод).
 *
 * ⚠️ Excel-д эдгээр нь merge хийсэн нүд: `J1:Q1` = «Захирамжийн дүн»,
 * түүний дотор `M2:Q2` = «Хөрөнгө оруулалтын эх үүсвэр». Тиймээс зам нь
 * ХОЁР шаттай байж болно.
 * ⚠️ Энд БАЙХГҮЙ талбар нь бүлэггүй — толгойн БҮХ мөрийг дамжин суунa
 *    (`rowSpan`), Excel-ийн `B1:B3` merge шиг.
 */
export const FIN_XL_GROUP: Record<string, readonly string[]> = {
  Bagts: [tr('БАГЦ')],
  Ded_bagts: [tr('БАГЦ')],
  Ehleh_ognoo: [tr('Төлөвлөгөөт хугацаа')],
  Duusah_ognoo: [tr('Төлөвлөгөөт хугацаа')],
  Zahiramj_ognoo: [tr('Захирамжийн дүн')],
  Zahiramj_dugaar: [tr('Захирамжийн дүн')],
  Zahiramj_niit_dun: [tr('Захирамжийн дүн')],
  Zah_eh_unet_tsaas: [tr('Захирамжийн дүн'), tr('Хөрөнгө оруулалтын эх үүсвэр')],
  Zah_eh_unet_tsaas_huwi: [tr('Захирамжийн дүн'), tr('Хөрөнгө оруулалтын эх үүсвэр')],
  Zah_eh_tusliin_orlogo: [tr('Захирамжийн дүн'), tr('Хөрөнгө оруулалтын эх үүсвэр')],
  Zah_eh_niislel_tusuw: [tr('Захирамжийн дүн'), tr('Хөрөнгө оруулалтын эх үүсвэр')],
  Zah_eh_NZD_nuuts: [tr('Захирамжийн дүн'), tr('Хөрөнгө оруулалтын эх үүсвэр')],
  Geree_ognoo: [tr('ГЭРЭЭ')],
  Geree_dugaar: [tr('ГЭРЭЭ')],
};

/**
 * НАВЧНЫ ШОШГО — Excel-ийн 3-р мөрийн БОГИНО нэр.
 *
 * ⚠️ Бүлэгт орсон талбарын нэр Excel-д БОГИНО байдаг («Дугаар», «Нийт дүн»,
 * «Эхлэх») — бүтэн утга нь дээрх зурвасаас уншигдана. `financeFieldLabels.ts`
 * дахь урт нэр нь бүлэг харагдахгүй үед (хайлт, картын харагдац, тайлан)
 * хэвээр хэрэглэгдэнэ — тиймээс ХОЁУЛАА хэрэгтэй, нэгийг нөгөөгөөр
 * ОРЛУУЛАХГҮЙ.
 *
 * ⚠️ `Nariiwchilsan_turul` нь Excel-д ердөө «Төрөл» гэж бичигдсэн ч энд
 * «Нарийвчилсан төрөл» ХЭВЭЭР: хажууд нь «ТӨРӨЛ» (`Turul`) багана байгаа тул
 * Excel-ийн бичиглэлийг хуулбал хоёр багана ижил нэртэй болно.
 */
export const FIN_XL_LEAF: Record<string, string> = {
  Turul: tr('ТӨРӨЛ'),
  Bagts: tr('Багц'),
  Ded_bagts: tr('Дэд багц'),
  Bagts_74: tr('Багц 74'),
  Nariiwchilsan_turul: tr('Нарийвчилсан төрөл'),
  Urdch_tusuwt_urtug: tr('Урьдчилсан төсөвт өртөг'),
  HO_dungiin_tailbar: tr('Хөрөнгө оруулалтын дүнгийн тайлбар'),
  Ehleh_ognoo: tr('Эхлэх'),
  Duusah_ognoo: tr('Дуусах'),
  Zahiramj_ognoo: tr('Захирамжийн огноо'),
  Zahiramj_dugaar: tr('Дугаар'),
  Zahiramj_niit_dun: tr('Нийт дүн'),
  Zah_eh_unet_tsaas: tr('Үнэт цаасны хөрөнгө'),
  Zah_eh_unet_tsaas_huwi: tr('Нийт хөрөнгөд эзлэх %'),
  Zah_eh_tusliin_orlogo: tr('Төслийн орлого'),
  Zah_eh_niislel_tusuw: tr('Нийслэлийн төсөвийн хөрөнгөөр'),
  Zah_eh_NZD_nuuts: tr('НЗД нөөц хөрөнгө'),
  Zahialagch_hyanalt_baig: tr('Захиалагчийн хяналт хийх байгууллага'),
  Guitsetgegch_baig: tr('Гүйцэтгэгч байгууллага'),
  Geree_ognoo: tr('Гэрээ байгуулсан огноо'),
  Geree_dugaar: tr('Гэрээний дугаар'),
  Geree_erh_dun: tr('Гэрээ байгуулах эрх олгосон дүн'),
  Urdchilgaa_batalgaa_dun: tr('Урьдчилгаа төлбөрийн баталгааны дүн'),
  Urdchilgaa_huwi: tr('Урьдчилгаа төлбөрийн хувь'),
  Urdchilgaa_ZH_zardal: tr('Урьдчилгаа төлбөрөөс суутгасан Захиалагчийн хяналтын зардал'),
  Guitsetgel_huwi: tr('Санхүүжсэн гүйцэтгэлийн хувь'),
};

/**
 * БАГАНЫ АНХДАГЧ ӨРГӨН (px) — Excel-ийн харьцааг хадгалсан.
 *
 * ⚠️ Excel-ийн бодит өргөнийг ШУУД хуулаагүй: тэнд «Төрөл» багана 800px,
 * мөнгөн багана 290px байдаг (16pt үсэг, багасгасан томруулалтаар харагддаг).
 * Порталын үсэг нь ~12px тул тэр өргөн нь хоосон зай болно. Харьцааг нь
 * хадгалаад 0.6–0.7 дахин багасгав.
 */
export const FIN_XL_WIDTH: Record<string, number> = {
  Turul: 96,
  Bagts: 120,
  Ded_bagts: 130,
  Bagts_74: 120,
  Nariiwchilsan_turul: 340,
  Urdch_tusuwt_urtug: 200,
  HO_dungiin_tailbar: 200,
  Ehleh_ognoo: 116,
  Duusah_ognoo: 116,
  Zahiramj_ognoo: 130,
  Zahiramj_dugaar: 110,
  Zahiramj_niit_dun: 170,
  Zah_eh_unet_tsaas: 170,
  Zah_eh_unet_tsaas_huwi: 150,
  Zah_eh_tusliin_orlogo: 170,
  Zah_eh_niislel_tusuw: 170,
  Zah_eh_NZD_nuuts: 160,
  Zahialagch_hyanalt_baig: 220,
  Guitsetgegch_baig: 200,
  Geree_ognoo: 130,
  Geree_dugaar: 180,
  Geree_erh_dun: 180,
  Urdchilgaa_batalgaa_dun: 180,
  Urdchilgaa_huwi: 130,
  Urdchilgaa_ZH_zardal: 200,
  Guitsetgel_huwi: 130,
};

/**
 * БОСОО НЭГТГЭЛТЭЙ багана — Excel-ийн `C17:C19`, `C47:C53` merge.
 *
 * ⚠️ ТӨРӨЛ нь ЭНД БАЙХГҮЙ: тэр нь бүлгээ БҮХЭЛД НЬ (нийлбэр мөрийг ч оруулан)
 * нэгтгэдэг тул тусад нь, босоо бичиглэлтэйгээр зурагдана
 * (`FIN_XL_GROUP_FIELD`). Энд зөвхөн БАГЦ — тэр нь ДЭД БАГЦ-уудаа нэгтгэнэ.
 *
 * ⚠️ ЗАСВАРЫН горимд нэгтгэхгүй: нэгтгэсэн нүдэнд ганцхан оролт үлдэх тул
 * гүйдлийн 2-оос хойшхи мөрийн утгыг засах зам хаагдана.
 */
export const FIN_XL_MERGE: readonly string[] = ['Bagts'];

/** Толгойн зурвасын нэг мөрийн ӨНДӨР (px) — наалдмал `top`-ыг тооцоход */
export const FIN_XL_BAND_H = 26;

/** Талбарын бүлгийн зам (байхгүй бол хоосон) */
export const finXlGroup = (name: string): readonly string[] => FIN_XL_GROUP[name] ?? [];

/* ═══════════════ МӨРИЙН БҮТЭЦ — Excel-ийн шатлал ═══════════════
 *
 * ⚠️ Excel-ийн 87 мөрийн ЗӨВХӨН 76 нь өгөгдөл. Үлдсэн 11 нь ХАРАГДАЦЫН мөр:
 *   · 3 «хэсгийн зурвас» (мөр 5 · 13 · 74) — бүх өргөнөөр хар хөх зурвас
 *   · 4 «төрлийн нийлбэр» (мөр 14 · 23 · 46 · 61) — тухайн ТӨРЛИЙН нийт дүн
 *   · 1 нийт дүн (мөр 4), 3 толгойн мөр (1–3)
 * Эдгээр нь үйлчилгээнд БАЙХГҮЙ — бүтцээс нь тооцож үүсгэнэ.
 */

/** ХЭСГИЙН зурвасын талбар — Excel-д багана биш, зурвас мөр болж гарна */
export const FIN_XL_SECTION = 'Tusul';

/** ТӨРЛИЙН талбар — Excel-ийн B багана (босоо бичигдэж, нэгтгэгдсэн) */
export const FIN_XL_GROUP_FIELD = 'Turul';

/**
 * ТӨРӨЛ бүрийн ДЭВСГЭР — Excel-ийн B баганы будалт.
 *
 * ⚠️ Excel-ийн сэдвийн өнгөнөөс (accent1…6, tint 0.6–0.8) яг тооцов. Эдгээр нь
 * ТОГТМОЛ өнгө, сэдвийн токен БИШ: гүйцэтгэл бөглөгчид «улбар шар мөр» гэж
 * бүлгээ нэрлэдэг тул light/dark горимд ч ижил байх ёстой.
 */
export const FIN_XL_GROUP_BG: Record<string, string> = {
  'ТЭЗҮ ЗУРАГ ТӨСӨЛ': '#deebf7',
  'ОРОН СУУЦНЫ ХОРООЛЛЫН БАРИЛГАЖИЛТ': '#e2efda',
  'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ': '#fbe5d6',
  'ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ': '#f8cbad',
  'НИЙГМИЙН ДЭД БҮТЭЦ': '#d9e1f2',
  БУСАД: '#f2f2f2',
};

/**
 * ⚠️ Толинд БАЙХГҮЙ төрөлд ч өнгө хэрэгтэй: үйлчилгээнд шинэ ТӨРӨЛ нэмэгдэхэд
 * будалтгүй үлдвэл тэр бүлэг л ялгарахаа болино. Нэрийн тогтвортой hash-аар
 * доорх цайвар өнгөнөөс сонгоно.
 */
const FALLBACK_BG = ['#e2efda', '#fbe5d6', '#d9e1f2', '#deebf7', '#fff2cc', '#ededed'];

export const finXlGroupBg = (turul: string): string => {
  const hit = FIN_XL_GROUP_BG[turul];
  if (hit) return hit;
  let h = 0;
  for (let i = 0; i < turul.length; i += 1) h = (h * 31 + turul.charCodeAt(i)) % 100000;
  return FALLBACK_BG[h % FALLBACK_BG.length];
};

/** Хэсгийн зурвасын дэвсгэр — Excel-ийн «Accent 1, Darker 25%» */
export const FIN_XL_SECTION_BG = '#2f5597';

/**
 * АНХДАГЧААР НУУГДСАН БАГАНА (2026-09-08, хэрэглэгчийн заавар).
 *
 * ⚠️ Эдгээр нь ХЭМЖИЛТИЙН биш, БЭЛТГЭЛИЙН талбарууд («Ажлын зураг төсөл»,
 * «ТЭЗҮ», «Газар чөлөөлөлт», «Зөвшөөрөл», «Сонгон шалгаруулалт») — гэрээний
 * мөнгөн урсгалтай зэрэгцүүлж харах шаардлагагүй бөгөөд 27 баганатай
 * хүснэгтийг улам уртасгадаг. `Bagts_74` нь Excel-д ч байхгүй, үйлчилгээнд ч
 * 76 мөр бүгд хоосон.
 *
 * ⚠️ ЭНЭ НЬ УСТГАЛ БИШ: толгойн баруун товшилтын цэсний «Show N hidden
 * columns»-оор хэзээ ч дэлгэнэ. Нэг удаа дэлгэсний дараа сонголт нь
 * `localStorage`-д бичигдэж, анхдагч буцаж ирэхгүй.
 */
export const FIN_XL_HIDE: string[] = [
  'Bagts_74',
  'ajliin_zurag_tusul',
  'Tezu',
  'Gazar_chuluulult',
  'Zuwshuurul',
  'Songon_shalgaruulalt',
];
