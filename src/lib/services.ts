/**
 * Сэлбэ портал — ArcGIS эх сурвалжийн ГАНЦ эх үүсвэр.
 *
 * ⚠️ 2026-08-24-нд каталогийн БҮХ давхарга (119) MUST байгууллагын нэгтгэсэн
 * `data` үйлчилгээ рүү шилжсэн. Хуучин monmap-ын тарсан үйлчилгээнүүд
 * (`Selbe_ET_20260721`, `Selbe_ET_20260725`, `Selbe_barilga_last`,
 * `busiin_medeelel_final`, `Tuluvlult_talbai`, `dugui_zam_20260731`,
 * `huuhdiin_togloom`, `Бусад_мэдээлэл_20260724` …) нь одоо ЗӨВХӨН `styleUrl`
 * буюу webmap-ийн загварын ТҮЛХҮҮР болж үлдэв — сүлжээний хүсэлт ТЭДЭН РҮҮ
 * ЯВАХГҮЙ (загвар нь `public/webmap-style.json` локал снапшотоос ирнэ).
 * Тиймээс тэдгээрийг monmap-аас устгахад портал эвдрэхгүй.
 *
 * ⚠️ Барилгын хяналт мөн шилжсэн: `data`/112 (блок, багц, гүйцэтгэгч). Үе
 * шатны гүйцэтгэл нь эндээс БИШ, `guitsetgel_bugluh_hyanalt` маягтын
 * үйлчилгээнээс ирнэ (`blockProgress.ts`). Талбайн тайлан нь `survey123_…`.
 *
 * Дараах өгөгдөл бүрмөсөн алга: газар чөлөөлөлтийн нэгж талбар, кадастр,
 * барилгын үнэлгээ.
 *
 * ЕТ = Ерөнхий Төсөв. Давхарга бүр ТОО ХЭМЖЭЭ (урт / талбай / ширхэг) агуулна;
 * порталын гол чадвар нь эдгээрийг бүсээр задалж нэгтгэх явдал.
 *
 * ⚠️ 2026-08-24: ЕТ-ийн `negj_une` (нэгж үнэ) дээр тогтсон ӨРТГИЙН ЗАГВАР
 * бүхэлдээ ХАСАГДАВ (зохиомол дата). `LayerDef`-т `cost`/`costSrc` талбар
 * БАЙХГҮЙ, `Totals` нь `{ n, q }` болов. Порталын АМЬД мөнгөн дүн бол зөвхөн
 * Cashflow-ийн ГЭРЭЭНИЙ/ТӨСӨВТ ӨРТӨГ (`CASHFLOW_NEW`) ба газар чөлөөлөлтийн
 * үнэлгээ — тэдгээрийг устсан каталогийн загвартай хольж болохгүй.
 */

/**
 * ⚠️ 2026-09-30: 5.5к мөрийн нэг файлыг `services/` хавтасны модулиудад хуваав
 *    (env → layerDef → palette → fields → pkg → layers → scene → groups → views →
 *    roles → draw — хамаарлын дарааллаар). Энэ файл нь ЗӨВХӨН нэгтгэгч (barrel):
 *    `@/lib/services`-ээс импортлодог бүх газар ӨӨРЧЛӨЛТГҮЙ ажиллана. Шинэ зүйл
 *    нэмэхдээ тохирох модульд нь бич — энд код бичихгүй.
 */
export * from './services/env';
export * from './services/layerDef';
export * from './services/palette';
export * from './services/fields';
export * from './services/pkg';
export * from './services/layers';
export * from './services/scene';
export * from './services/groups';
export * from './services/views';
export * from './services/roles';
export * from './services/draw';
