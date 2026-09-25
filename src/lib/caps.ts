'use client';

/**
 * НЭМЭЛТ ЭРХҮҮД (capabilities) — харагдацаас ТУСДАА, нэг бүрчлэн олгодог.
 *
 * ⚠️ Яагаад үүрэг (`Role`) эсвэл харагдац (`ViewKey`)-д НИЙЛҮҮЛЭЭГҮЙ вэ:
 *   · Үүрэг нь «энэ хүн хэн бэ» — багц бүхэлдээ. «Мөр нэмэх» нь тэрхүү багцын
 *     нэг ч гишүүнд автоматаар өгөгдөх ёсгүй ЭРСДЭЛТЭЙ үйлдэл (хуудасны бүтэц
 *     өөрчлөгдөж, БҮХ жин, мөнгөн дүн дахин бодогдоно).
 *   · Харагдац нь «юуг ХАРАХ вэ» — энэ нь «юуг ХИЙХ вэ». Хоёуланг нэг
 *     жагсаалтад хольвол «Гүйцэтгэл бөглөх»-ийг харах бүрд бүтэц засах эрх
 *     дагалдана.
 *
 * ⚠️ ХАДГАЛАЛТ: эрхийн ижил ArcGIS хүснэгтэд, `__cap__:` угтвартай мөрөнд
 * (`__flow__:`-ийн адил). Үйлчилгээнд ШИНЭ БАГАНА нэмэх шаардлагагүй.
 *
 * ⚠️ FAIL-CLOSED: эх сурвалж унших боломжгүй, мөр эвдэрсэн, эсвэл түлхүүр
 * танигдахгүй бол эрх нь ОЛГОГДООГҮЙ гэж үзнэ.
 *
 * ⚠️ REMOTE АЧААЛАГДААГҮЙ БОЛ localStorage ҮЛ ТООЦНО (2026-09-21). Урьд нь
 *    толгойн «FAIL-CLOSED» нь кодтой зөрж байв: `cache` нь ачаалахдаа
 *    localStorage-оос дүүрдэг тул remote (`initRemote`) унасан ч тэр эрх
 *    хүчинтэй хэвээр байлаа. Хатуу жагсаалтын (remote-гүй нэвтэрдэг)
 *    хэрэглэгч `selbe-caps-v1`-д өөртөө эрх бичээд сүлжээгээ хаагаад нэвтэрвэл
 *    `requireCap`/`hasCap` давдаг байв. Одоо `_syncRemoteCaps` нэг ч удаа
 *    ажиллаагүй сешнд `capsOf` нь ХАТУУ ТОХИРГООНЫ default = ХООСОН (кодод
 *    нэрээр олгосон эрх байхгүй — бүх эрх зөвхөн `__cap__:` мөрөөс) буцаана;
 *    remote ачаалагдмагц урьдын зан төлөв. Хэрэглэгчийг сүлжээний саатлаар
 *    ТҮГЖИХГҮЙ — нэвтрэлт `permissions.hasAccess` хэвээр, зөвхөн нэмэлт эрх
 *    нь remote сэргэтэл хүлээнэ.
 * ⚠️ POLL-ИЙН ДАВТАМЖ (2026-09-21, аудитын засвар): `AuthGate` нь remote
 *    уншигдаагүй (`permissions.remoteReady()` false) л бол `signed-in` төлөвт ч
 *    15 сек тутам дахин оролдоно — `denied`-тэй ИЖИЛ. Урьд нь тайлбар «15 сек–5
 *    мин» гэж бичсэн ч 15 сек нь зөвхөн `denied`-д үйлчилдэг байсан тул хатуу
 *    жагсаалтын хэрэглэгч remote унасан бол 5 мин хүртэл эрхгүй суудаг байв.
 *    Remote уншигдмагц 5 мин руу буцна.
 * ⚠️ БИЧИХ ЗАМ ч remote-гүй бол ХААЛТТАЙ (2026-09-21): `toggleCap` ба
 *    `scopedAcl.syncCaps` нь `remoteSynced` false үед `false` буцаана — шинэ
 *    browser-т localStorage хоосон, remote уншигдаагүй атлаа бичилт бүтвэл
 *    `[] ∪ {cap}` нь ArcGIS дээрх бүтэн жагсаалтыг дарж бичих байв.
 */

import { AUTH, type ViewKey } from './services';
import type { CapRow } from './permsRemote';
import { _newerThanSnapshot, _touchSeq } from './scopedAcl';

/** Одоогоор нэг эрх — жагсаалт өсөхөд UI автоматаар дагана. */
export type CapKey =
  | 'addRow'
  | 'qaqc'
  | 'zovshoorol'
  | 'finEdit'
  | 'finRow'
  | 'plan'
  | 'planApprove'
  | 'obyemEdit'
  | 'obyemApprove'
  | 'ajilApprove'
  | 'gazar'
  | 'butets'
  | 'chanarAuthor'
  | 'chanarReview';

/**
 * Панелд харуулах бүртгэл — ЗӨВХӨН түлхүүр.
 *
 * ⚠️ Нэр/тайлбарыг энд БИЧИХГҮЙ: `t()`-г модулийн түвшинд дуудвал хэл нь
 * ачаалах үед тогтож, хэл солиход шинэчлэгдэхгүй болно. Мөн i18n гаргагч нь
 * зөвхөн ҮСГЭН `tr('…')` дуудлагыг олдог тул текст толиноос хоцорно.
 * Тиймээс дэлгэцийн текст `UserAdmin`-д, зурагдах агшинд бичигдэнэ.
 */
export const CAPS: { key: CapKey; icon: string }[] = [
  { key: 'addRow', icon: 'plus' },
  /**
   * QAQC — Inspection Test Plan (М-акт · FIC · MA · MIR баримтын 9 багана)
   * бөглөх эрх.
   *
   * ⚠️ Гүйцэтгэлийн хувь бөглөхөөс ТУСДАА: чанарын баримт бичгийг барилгын
   * гүйцэтгэгч биш, чанарын хяналтын ажилтан хөтөлдөг. Нэг эрхэнд нийлүүлбэл
   * обьём бөглөх бүрд баримтын багана нээгдэж, хэн юуг баталсан нь замхарна.
   *
   * ⚠️ 2026-09-04: өгөгдөл нь «Гүйцэтгэл бөглөх»-өөс гарч «Чанар (QAQC)»
   *    тусдаа харагдацад (`src/modules/Qaqc.tsx`, `src/lib/qaqc.ts`) шилжсэн.
   *    Эрх нь тэр харагдацыг автоматаар нээнэ (`CAP_HOST_VIEW`).
   */
  { key: 'qaqc', icon: 'shield' },
  /**
   * ЗӨВШӨӨРӨЛ — «Зөвшөөрөл» харагдац дээр зөвшөөрөл нэмэх, засах, устгах.
   *
   * ⚠️ ХАРАХААС тусдаа: зөвшөөрлийн төлөв нь ажил эхлүүлэх шийдвэрт
   * шууд нөлөөлдөг тул хардаг бүх хүн засаж чадах ёсгүй.
   */
  { key: 'zovshoorol', icon: 'file' },
  /**
   * САНХҮҮГИЙН БҮРТГЭЛ — Cashflow (/173) ба IPC (/172) хүснэгтийн нүдний утга
   * засах эрх.
   *
   * ⚠️ Мөр нэмэх/устгахаас (`finRow`) ТУСДАА. Утга засах нь буруу бичсэн тоог
   * залруулах өдөр тутмын ажил; мөр нэмэх нь гэрээ/акт үүсгэх — өөр хариуцлага.
   *
   * ⚠️ Энэ хоёр хүснэгт нь дашбоардын санхүүгийн БҮХ тооны эх сурвалж (02, 08,
   * «Санхүүжилт», гүйцэтгэлийн KPI, PDF тайлан). Нэг нүд буруу засахад тэр
   * бүгд дагаж өөрчлөгдөнө — тиймээс үүргээр биш, нэрээр олгоно.
   */
  { key: 'finEdit', icon: 'calc' },
  /**
   * САНХҮҮГИЙН БҮРТГЭЛ — мөр НЭМЭХ ба УСТГАХ эрх.
   *
   * ⚠️ Устгасан мөрийг порталаас буцаах арга БАЙХГҮЙ (ArcGIS-ийн хувилбарын
   * түүх энэ үйлчилгээнд асаагүй). Тиймээс `finEdit`-ээс өндөр эрсдэлтэй.
   */
  { key: 'finRow', icon: 'plus' },
  /**
   * ХУВААРЬ ТӨЛӨВЛӨХ — «Хуваарь» харагдацад ажлын эхлэх/дуусах огноог засах.
   *
   * ⚠️ Гүйцэтгэл БӨГЛӨХӨӨС тусдаа: нэг огноо солиход тухайн ажлын
   *    ТӨЛӨВЛӨГӨӨТ хувь дахин бодогдож, тайлан, график, хоцрогдлын дохио
   *    бүгд хөдөлнө. Бөглөгч нь өөрийн хоцрогдлыг арилгахын тулд хуваарийг
   *    хойш нь чирэх боломжтой болох ёсгүй — төлөвлөлт нь ӨӨР үүрэг.
   */
  { key: 'plan', icon: 'calendar' },
  /**
   * ХУВААРЬ БАТЛАХ — гүйцэтгэгчийн илгээсэн хуваарийг батлах / буцаах.
   *
   * ⚠️ `plan`-ААС ТУСДАА бөгөөд түүнтэй ХОСЛУУЛЖ БОЛОХГҮЙ (2026-09-07):
   *    зохиогч нь өөрийнхөө хуваарийг батлах зам нээгдвэл хоёр шатат
   *    хяналт бүхэлдээ утгагүй болно. `huvaariBatlah.decidePlan` нь
   *    зохиогч = батлагч тохиолдлыг ТАТГАЛЗАНА.
   *
   * ⚠️ Гүйцэтгэлийн урсгалын 4 шатнаас (`hyanalt.ts`) мөн ТУСДАА: тэр нь
   *    БОДИТ гүйцэтгэлийг, энэ нь ТӨЛӨВЛӨГӨӨГ батална. Нэг хүнд хоёуланг
   *    нь өгч болно, гэхдээ энэ нь тусдаа шийдвэр байх ёстой.
   */
  { key: 'planApprove', icon: 'shield' },
  /**
   * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ ЗАСАХ — «Гүйцэтгэл бөглөх» хуудасны
   * «Инженерийн төлөвлөсөн обьём» баганын нүднүүдийг засаж, батлуулахаар
   * илгээх эрх (2026-09-08).
   *
   * ⚠️ Гүйцэтгэл БӨГЛӨХӨӨС (`addRow`, урсгалын шат) ТУСДАА: тэр нь
   *    гүйцэтгэгчийн БОДИТ хэмжилт, энэ нь хяналтын инженерийн ТӨЛӨВЛӨГӨӨ.
   *    Нэг эрхэнд нийлүүлбэл гүйцэтгэгч өөрийнхөө зорилтыг өөрөө
   *    буулгах зам нээгдэнэ.
   *
   * ⚠️ `plan` (хуваарь)-ААС мөн тусдаа: тэр нь ОГНОО, энэ нь ОБЬЁМ.
   */
  { key: 'obyemEdit', icon: 'frame' },
  /**
   * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ БАТЛАХ — илгээгдсэн засварыг батлах/буцаах.
   *
   * ⚠️ `obyemEdit`-ЭЭС ТУСДАА бөгөөд түүнтэй ХОСЛУУЛЖ БОЛОХГҮЙ: засварлагч
   *    нь өөрийнхөө засварыг батлах зам нээгдвэл хоёр шатат хяналт
   *    бүхэлдээ утгагүй болно. `obyemBatlah.decideObyem` нь зохиогч =
   *    батлагч тохиолдлыг ТАТГАЛЗАНА (UI-д биш, домэйн функцэд).
   */
  { key: 'obyemApprove', icon: 'shield' },
  /*
   * ⚠️ НЭМЭЛТ АЖИЛ БАТЛАХ (2026-09-22). Зохиогчийн тал нь `addRow` —
   *    ШИНЭ эрх зохиогоогүй, эс бөгөөс одоо мөр нэмж чаддаг бүх хүн
   *    чимээгүй эрхээ алдана (`ajilAcl.ts`-ийн ⚠️).
   * ⚠️ `addRow`-ТОЙ ХОСЛУУЛЖ БОЛОХГҮЙ: нэмэгч нь өөрийн нэмсэн
   *    ажлыг батлах зам нээгдэнэ. `decideAjil` зохиогч=батлагчийг
   *    ТАТГАЛЗдаг тул өгөгдөл хамгаалагдсан ч панелд ч анхааруулна.
   */
  { key: 'ajilApprove', icon: 'shield' },
  /**
   * ГАЗРЫН ТӨЛӨВ ЗАСАХ — «Газар чөлөөлөлт» дээр нэгж талбарын `Tuluv`,
   * `явцын_мэдээ`, эзэмшигч, тайлбарыг засах.
   *
   * ⚠️ ХАРАХААС тусдаа: нэг талбарын төлөв солиход чөлөөлөлтийн хувь,
   *    давхцлын тооцоо, дашбоардын үзүүлэлт, тайлан бүгд дагаж өөрчлөгдөнө.
   *    Газрын мэдээллийг хардаг хүн олон ч, түүнийг өөрчлөх эрх нь газар
   *    чөлөөлөлтийн ажилтанд л байх ёстой.
   */
  { key: 'gazar', icon: 'frame' },
  /**
   * ДЭД БҮТЦИЙН АТРИБУТ ЗАСАХ — «Дэд бүтэц» харагдац дээр инженерийн
   * шугамын атрибут (`urt_m`, `ZONE_ID`, `DocName`, `bagts_name` …) засах.
   *
   * ⚠️ `gazar`-аас ТУСДАА: тэр нь кадастрын нэгж талбарын ТӨЛӨВ,
   *    энэ нь инженерийн сүлжээний ХЭМЖЭЭ. `urt_m` нь порталын БҮХ
   *    уртын нийлбэрийн эх сурвалж (каталогийн багана, «Дэд бүтэц»-ийн
   *    км, «Эрсдэлийн загвар»-ын хохирлын үнэлгээ) тул нэг тоо засахад
   *    тэр бүгд дагаж өөрчлөгдөнө. Газрын ажилтан ба сүлжээний инженер
   *    хоёр өөр хүн.
   */
  { key: 'butets', icon: 'network' },
  /**
   * ЧАНАРЫН БАРИМТ — АРГАЧЛАЛ ИРҮҮЛЭХ (гүйцэтгэгч). Зураглалын 1 · 2 · 6 · 9
   * алхам: боловсруулж ирүүлнэ, буцаагдвал сайжруулж дахин ирүүлнэ.
   *
   * ⚠️ `qaqc`-ААС ТУСДАА: тэр нь ITP-ийн 9 багана бөглөх, энэ нь баримт
   *    үүсгэж БАТЛУУЛАХ. Нэг хүн хоёуланг авч болно, гэхдээ тэр нь тусдаа
   *    шийдвэр.
   */
  { key: 'chanarAuthor', icon: 'pen' },
  /**
   * ЧАНАРЫН БАРИМТ — ХЯНАХ (ТУХ · Чанар · ХАБЭА). Зураглалын 3 · 4а · 4б.
   *
   * ⚠️ ГУРВАН ХЯНАГЧ НЭГ ЭРХ: аль хянагч болохыг эрх биш `chanarAcl`-ийн
   *    хуваарилалт заана. Тусдаа гурван эрх үүсгэвэл энд утгагүй гурван мөр
   *    нэмэгдэх атлаа «хэн ТУХ вэ» гэдэг нь тэндээс гарахгүй хэвээр.
   * ⚠️ `chanarAuthor`-той ХОСЛУУЛЖ БОЛНО, гэхдээ `chanarMs.review` нь
   *    зохиогч=хянагчийг серверийн мөрөөс татгалзана.
   */
  { key: 'chanarReview', icon: 'shield' },
];

/**
 * ЭРХ БҮРИЙН «ГЭР» ХАРАГДАЦ — эрх нь зөвхөн тэр харагдац дээр утгатай.
 *
 * ⚠️ `resolveAccess` (permissions.ts) эрхтэй хүнд энэ харагдацыг АВТОМАТААР
 * нээнэ (2026-08-29). Урьд нь админ «Хуваарь төлөвлөх» эрх олгоод «Хуваарь»
 * харагдацыг мартвал эрх нь чимээгүй утгагүй байв: `eronhii` үүрэг зөвхөн
 * «Гүйцэтгэл» харагдацтай тул эзэн нь хуудас руу орох замгүй. Эрх олгосон нь
 * тэр хуудсыг харах зөвшөөрөл гэсэн үг — хоёр удаа асуухгүй.
 *
 * ⚠️ МАССИВ БОЛОВ (2026-09-16). Урьд нь эрх бүр ЯГ НЭГ харагдацтай байв.
 *    `planApprove` нь ХОЁР харагдац шаардана — батлах ДАРААЛАЛ
 *    (`huvaariBatlah`) ба өөрөө БАТЛАХ хуудас (`huvaari`), учир нь
 *    «Батлах» нь дараалалаас `huvaari` руу ШИЛЖДЭГ (батлах логик
 *    хуулбарлагдаагүй — `Huvaari.save` → `applyUpdates` → `decidePlan`
 *    гинж тэнд л байна). Хоёрын аль нэгийг хаавал эрх нь дуусгах замгүй.
 *
 * ⚠️ БҮХ утга массив — нэг нь string, нөгөө нь массив байх ХООРДМОЛ хэлбэр
 *    `capViewsOf`-ыг чимээгүй эвдэнэ (доорх тайлбарыг үз).
 */
export const CAP_HOST_VIEW: Record<CapKey, ViewKey[]> = {
  addRow: ['guitsetgel'],
  /* ⚠️ 2026-09-03: «Гүйцэтгэл»-ээс ӨӨРИЙН харагдац руу шилжив. Эрх нь энэ
     харагдацыг автоматаар нээнэ — эс бөгөөс QAQC эрх олгосон инженер
     чанарын хуудас руу орох замгүй үлдэнэ. */
  qaqc: ['qaqc'],
  zovshoorol: ['zovshoorol'],
  finEdit: ['finance'],
  finRow: ['finance'],
  plan: ['huvaari'],
  /* ⚠️ ДАРААЛАЛ ЧУХАЛ: [0] нь «гэр» — батлагчийн байгалийн бууж ирэх газар
     нь ДАРААЛАЛ, тэндээс батлах хуудас руу шилжинэ. */
  planApprove: ['huvaariBatlah', 'huvaari'],
  /* ⚠️ Хоёулаа «Гүйцэтгэл» — багана нь «Гүйцэтгэл бөглөх» хуудсанд байна */
  obyemEdit: ['guitsetgel'],
  obyemApprove: ['guitsetgel'],
  /* ⚠️ ХОЁР харагдац: батлах хуудас ӨӨРӨӨ (`ajilBatlah`) ба батлагдсан
     мөр буудаг «Гүйцэтгэл бөглөх» (`guitsetgel`). Хоёрдугаарыг хасвал
     батлагч баталчихаад үр дүнг нь харж чадахгүй. */
  ajilApprove: ['ajilBatlah', 'guitsetgel'],
  gazar: ['gazar'],
  butets: ['dedButets'],
  /* ⚠️ Чанарын баримт (irgediin-hurteemj, 2026-09-16) — массив хэлбэрт
     (tezu-bonu-гийн шинэ төрөл) нийцүүлэв. */
  chanarAuthor: ['chanar'],
  chanarReview: ['chanar'],
};

/**
 * Хэрэглэгчийн эрхүүдээс гарах харагдацууд (давхардалгүй).
 *
 * ⚠️ `flatMap` — `map` БИШ (2026-09-16). `CAP_HOST_VIEW` массив болсон тул
 *    `map` нь `ViewKey[][]` буцаана; `new Set` нь массивыг СУУРИАР
 *    давхардалгүйжүүлдэг тул юу ч хасагдахгүй, улмаар `resolveAccess`
 *    (permissions.ts)-ийн `includes` ХЭЗЭЭ Ч таарахгүй болж БҮХ хүний
 *    эрхийн харагдац чимээгүй алга болно.
 */
export function capViewsOf(username?: string | null): ViewKey[] {
  return [...new Set(capsOf(username).flatMap((c) => CAP_HOST_VIEW[c]))];
}

const VALID = new Set<string>(CAPS.map((c) => c.key));
const KEY = 'selbe-caps-v1';
const DIRTY_KEY = 'selbe-caps-dirty-v1';
const EVENT = 'selbe-caps-change';

type Store = Record<string, CapKey[]>;

/**
 * ArcGIS-д хүрч ЧАДААГҮЙ локал өөрчлөлтүүд: түлхүүр → зорьсон эрхийн жагсаалт
 * (`[]` = мөрийг устгах гэсэн).
 *
 * ⚠️ 2026-09-08: энэ dirty-set урьд нь БАЙХГҮЙ байв. `permissions.ts`-д 2026-08-27-нд
 * нэмэгдсэн хамгаалалт энд хуулагдаагүй тул: админ эрх олгоод ArcGIS бичилт нь
 * унавал `setCaps` `false` буцаадаг ч хаана ч тэмдэглэгддэггүй, дараагийн
 * `initRemote` (5 мин тутам) `_syncRemoteCaps`-аар кэшийг БҮХЭЛД нь дарж бичдэг
 * тул засвар нь ЧИМЭЭГҮЙ буцдаг байв. Одоо `permissions.ts`-ийн ЯГ ижил
 * загвараар: dirty тэмдэглэнэ → `initRemote` бүрд retry → унасныг snapshot дээр
 * давхарлана.
 */
/*
 * ⚠️ `by` — бичсэн хэрэглэгч (2026-09-25, аудитын засвар). `permissions.ts`-ийн
 *    `DirtyItem`-тэй ИЖИЛ үндэслэл: зөвхөн «Дахин синк»-ийн баталгаажуулах
 *    асуултад лавлагаа, итгэлийн шалгуур нь санах ойн `mineCaps`. Хуучин
 *    хэлбэрийн (массив шууд) мөр `by: ''` гэж уншигдана.
 */
type DirtyCaps = Record<string, { by: string; caps: CapKey[] }>;

/**
 * ЭНЭ runtime-д бичилт нь унаж dirty-д орсон түлхүүр → жагсаалтын JSON.
 * ⚠️ АВТОМАТ retry/overlay ЗӨВХӨН эдгээрт (2026-09-25) — `permissions.mine`-ийн
 *    тайлбар: localStorage-д `{"me":["finRow",…]}` тарьсныг дараа нэвтэрсэн
 *    super-ийн `initRemote(true)` АСУУЛГҮЙ бичдэг байв.
 */
const mineCaps = new Map<string, string>();
const serCaps = (c: CapKey[]): string => JSON.stringify(c);

/**
 * НЭГ ХЭРЭГЛЭГЧИЙН `__cap__:` БИЧИЛТҮҮД ДАРААЛНА (2026-09-25, аудитын засвар).
 * ⚠️ Урьд нь `setCaps` бүр бүтэн жагсаалтыг ЗЭРЭГЦЭЭ илгээдэг байв:
 *    «Зөвшөөрөл засах» → «Санхүү — утга» хурдан дарахад [zovshoorol] ба
 *    [zovshoorol, finEdit] хоёр зэрэг явж, сервер эхнийхийг СҮҮЛД буулгавал
 *    (эсвэл хоёулаа мөр нэмж эхнийх нь их OID авбал) remote дээр [zovshoorol]
 *    үлддэг — хоёулаа `true` буцаасан тул dirty цэвэрлэгдэж, алдаа ч гарахгүй,
 *    дараагийн `initRemote` finEdit-ийг чимээгүй унтраадаг байлаа. Одоо
 *    дуудлагын ДАРААЛЛААР бичигдэнэ; жагсаалт нь дуудах агшны кэшээс (өмнөх
 *    дуудлагын синхрон шинэчлэлийг агуулсан) бүтдэг тул сүүлийнх нь ялна.
 *    `scopedAcl.enqueue` · `permissions.serial`-тай ижил загвар; retry ч энэ
 *    дараалалд орно.
 */
const capQueue = new Map<string, Promise<unknown>>();
/** Хэрэглэгч бүрийн сүүлийн локал бичилтийн агшин — `_syncRemoteCaps`-д (`scopedAcl`-ийн толгой) */
const capTouched = new Map<string, number>();

function enqueueCap<T>(u: string, fn: () => Promise<T>): Promise<T> {
  capTouched.set(u, _touchSeq());
  const prev = capQueue.get(u) ?? Promise.resolve();
  const p = prev.then(fn, fn);
  const tail = p.then(() => undefined, () => undefined);
  capQueue.set(u, tail);
  void tail.then(() => {
    capTouched.set(u, _touchSeq());
    if (capQueue.get(u) === tail) capQueue.delete(u);
  });
  return p;
}

/** Одоо нэвтэрсэн хэрэглэгч — dirty мөрийн `by`. ⚠️ Динамик: `who.ts` энэ файлыг импортлодог. */
async function authorName(): Promise<string> {
  try {
    return (await import('./who')).currentUser() ?? '';
  } catch {
    return '';
  }
}

/** Танигдахгүй түлхүүрийг хаяна — хуучин/эвдэрсэн мөр эрх нээхгүй. */
const sane = (v: unknown): CapKey[] =>
  Array.isArray(v) ? (v.filter((x) => typeof x === 'string' && VALID.has(x)) as CapKey[]) : [];

function load(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const j = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Store = {};
    for (const [k, v] of Object.entries(j)) out[k.toLowerCase()] = sane(v);
    return out;
  } catch {
    return {};
  }
}

let cache: Store = load();

/**
 * Энэ сешнд remote эрх (`__cap__:` мөрүүд) НЭГ Ч УДАА уншигдсан уу.
 * ⚠️ `false` бол `capsOf` localStorage-ийн кэшийг ҮЛ ТООЦНО (толгойн тайлбар,
 *    2026-09-21) — `permissions.remoteLoaded`-ийн ЯГ ижил үндэслэл. Тусдаа туг
 *    (`remoteReady()` биш): `permissions.ts` энэ файлыг импортлодог тул буцааж
 *    импортловол цикл үүснэ; утга нь ижил — `initRemote` амжилттай үед л
 *    `_syncRemoteCaps` дуудагддаг.
 */
let remoteSynced = false;

function save(s: Store) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* хувийн горим / квот дүүрсэн — санах ойд хэвээр ажиллана */ }
}

function notify() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT));
}

function loadDirty(): DirtyCaps {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(DIRTY_KEY) || '{}') as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return {};
    const out: DirtyCaps = {};
    for (const [k, v] of Object.entries(raw)) {
      /* ⚠️ Хуучин хэлбэр (массив шууд) — бичсэн хүн тодорхойгүй */
      if (Array.isArray(v)) { out[k.toLowerCase()] = { by: '', caps: sane(v) }; continue; }
      const o = (v ?? {}) as { by?: unknown; caps?: unknown };
      out[k.toLowerCase()] = { by: typeof o.by === 'string' ? o.by : '', caps: sane(o.caps) };
    }
    return out;
  } catch {
    return {};
  }
}

function saveDirty(d: DirtyCaps): void {
  /* ⚠️ `permissions.saveDirty`-тай ижил шалтгаан: хувийн горим/квотод шиддэг тул
     заавал try/catch. Алдагдвал дараагийн `initRemote` алсаас бүгдийг дахин уншина. */
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
  } catch { /* хувийн горим / квот дүүрсэн */ }
}

/**
 * Бичилтийн үр дүнг dirty-set-д тусгана (ok → цэвэрлэ, унав → тэмдэглэ).
 * ⚠️ Async: бичсэн хүнийг (`who`) динамикаар авна. Уншилт→бичилт нь `await`-ын
 *    ДАРАА нэг дор явна — хооронд нь өөр бичилт орохгүй.
 */
async function trackWrite(key: string, intended: CapKey[], ok: boolean): Promise<void> {
  const by = ok ? '' : await authorName();
  const d = loadDirty();
  if (ok) {
    mineCaps.delete(key);
    if (!(key in d)) return;
    delete d[key];
  } else {
    /* ⚠️ Бичсэн хүн + ЭНЭ runtime-ийн тэмдэг (`mineCaps`) — автомат retry-ийн шалгуур */
    d[key] = { by, caps: intended };
    mineCaps.set(key, serCaps(intended));
  }
  saveDirty(d);
  notify();
}

/** ArcGIS-т хүрээгүй эрхийн өөрчлөлттэй түлхүүрүүд — UserAdmin-ы тэмдэгт */
export function dirtyCapKeys(): string[] {
  return Object.keys(loadDirty());
}

/** ЭНЭ СЕШНД ҮҮСЭЭГҮЙ dirty эрхүүд (2026-09-25) — «Дахин синк»-ийн баталгаажуулалтад */
export function foreignCapsDirty(): { key: string; by: string }[] {
  return Object.entries(loadDirty())
    .filter(([k, v]) => mineCaps.get(k) !== serCaps(v.caps))
    .map(([key, v]) => ({ key, by: v.by }));
}

/**
 * DIRTY эрхүүдийг remote руу ДАХИН бичиж үзнэ (`_syncRemoteCaps` дуудна).
 * Буцаана: энэ удаад АМЖИЛТТАЙ бичигдсэн түлхүүр → жагсаалт (кэшид тусгахад).
 *
 * @param onlyMine `true` — ЗӨВХӨН энэ runtime-ийн, өөрчлөгдөөгүй мөр (автомат
 *   зам). `false` — бүгд, зөвхөн админы ИЛ «Дахин синк»-ээс.
 *
 * ⚠️ ТҮЛХҮҮР БҮРИЙГ ГҮЙЦЭТГЭХ АГШИНД ДАХИН УНШИНА (2026-09-25, аудитын засвар) —
 *    `permissions.retryDirtyOnce`-ийн ижил алдаа: эхэнд авсан map-ыг төгсгөлд
 *    `saveDirty(left)`-ээр дарахад явцын дунд нэмэгдсэн түлхүүр арчигдаж, явцын
 *    дунд амжилттай хадгалагдсан хэрэглэгчийн ХУУЧИН жагсаалт дараа нь бичигддэг
 *    байв. Одоо `enqueueCap`-аар `setCaps`-тай дараалж, утга нь ХЭВЭЭР бол л
 *    арилгана.
 */
async function retryDirtyCaps(onlyMine: boolean): Promise<Record<string, CapKey[]>> {
  const done: Record<string, CapKey[]> = {};
  const keys = Object.keys(loadDirty());
  if (!keys.length) return done;
  let m: typeof import('./permsRemote');
  try {
    m = await import('./permsRemote');
  } catch {
    return done; // модуль ачаалагдсангүй — бүгд dirty хэвээр
  }
  for (const key of keys) {
    await enqueueCap(key, async () => {
      const item = loadDirty()[key];
      if (!item) return; // хооронд нь амжилттай хадгалагдсан
      const want = serCaps(item.caps);
      if (onlyMine && mineCaps.get(key) !== want) return;
      let ok = false;
      try {
        ok = item.caps.length ? await m.capUpsert(key, item.caps) : await m.capRemove(key);
      } catch {
        ok = false;
      }
      if (!ok) return;
      const now = loadDirty();
      if (now[key] && serCaps(now[key].caps) === want) {
        delete now[key];
        saveDirty(now);
      }
      if (mineCaps.get(key) === want) mineCaps.delete(key);
      done[key] = item.caps;
    });
  }
  return done;
}

/** Remote руу бичигдсэн жагсаалтуудыг кэш дээр тусгана — дараалалд бичилт хүлээж буйг алгасна */
function applyDone(s: Store, done: Record<string, CapKey[]>): void {
  for (const [k, c] of Object.entries(done)) {
    if (capQueue.has(k)) continue; // шинэ бичилт хүлээгдэж байна — локал нь илүү шинэ
    if (c.length) s[k] = c; else delete s[k];
  }
}

/**
 * Нэг хэрэглэгчийн олгогдсон эрхүүд.
 * ⚠️ Remote ачаалагдаагүй бол ХООСОН (2026-09-21) — localStorage-д гараар
 *    тарьсан эрх сүлжээгүй үед хүчингүй. Толгойн тайлбарыг үз.
 */
export function capsOf(username?: string | null): CapKey[] {
  if (!username) return [];
  if (!remoteSynced) return [];
  return cache[username.toLowerCase()] ?? [];
}

/** Remote эрх энэ сешнд уншигдсан уу — UI-д «offline» тэмдэг харуулахад */
export const capsRemoteReady = (): boolean => remoteSynced;

/**
 * ХАДГАЛАГДСАН жагсаалт — remote-ийн тугаас ҮЛ ХАМААРАН (зөвхөн БИЧИХ замд).
 * ⚠️ `toggleCap` ба `scopedAcl.syncCaps` нь «одоогийн жагсаалт + нэг эрх» гэж
 *    боддог. Тэдэнд `capsOf` (тугтай) өгвөл remote унасан үед `[]`-ээс эхэлж,
 *    админы бичсэн dirty жагсаалт бусад эрхийг нь АРЧИЖ, дараагийн retry-д
 *    ArcGIS руу тэр дутуу жагсаалт бичигдэнэ. Эрхийн ШАЛГУУРТ (`hasCap`)
 *    хэрэглэхгүй.
 */
export function capsStored(username?: string | null): CapKey[] {
  if (!username) return [];
  return cache[username.toLowerCase()] ?? [];
}

/**
 * Тухайн эрх олгогдсон эсэх.
 *
 * ⚠️ НЭВТРЭЛТ УНТРААЛТТАЙ орчинд (`AUTH.appId` хоосон — дев) БҮХ эрх нээлттэй.
 * Учир нь тэр үед `AuthGate` нь `status: 'off'` болж, харагдац бүрийг
 * нэвтрэлтгүйгээр нээдэг бөгөөд `user` нь `null` байна. Хэрэв энд `null`-ыг
 * «эрхгүй» гэж уншвал бүх зүйл нээлттэй атлаа ЭРХЭЭР хаагдсан цөөн хэдэн
 * функц (мөр нэмэх, QAQC) л ЧИМЭЭГҮЙ ажиллахгүй болно — яг ийм зөрчил
 * 2026-08-28-нд «мөр нэмэх ажиллахгүй» гэсэн гомдол болсон.
 *
 * ⚠️ Production-д `.env` дэх `appId` дүүрэн тул энэ салаа ХЭЗЭЭ Ч биелэхгүй.
 */
export function hasCap(username: string | null | undefined, cap: CapKey): boolean {
  if (!AUTH.appId) return true;
  return capsOf(username).includes(cap);
}

/**
 * Хэрэглэгчийн эрхийн ЖАГСААЛТЫГ БҮТНЭЭР солино.
 *
 * ⚠️ Эхлээд локалд бичээд дараа нь ArcGIS руу илгээнэ — сүлжээ унасан ч
 * админ өөрийн дарсныг шууд харна. Буцах утга нь ArcGIS-т бичигдсэн эсэх;
 * `false` бол дуудагч талд ИЛ анхааруулах ёстой (эрх зөвхөн энэ browser-т).
 */
export async function setCaps(username: string, caps: CapKey[]): Promise<boolean> {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const next = sane(caps);
  cache = { ...cache, [u]: next };
  if (next.length === 0) delete cache[u];
  save(cache);
  notify();
  /* ⚠️ Хэрэглэгч бүрээр ДАРААЛНА (2026-09-25) — `capQueue`-ийн тайлбар */
  return enqueueCap(u, async () => {
    let ok = false;
    try {
      const r = await import('./permsRemote');
      ok = next.length ? await r.capUpsert(u, next) : await r.capRemove(u);
    } catch {
      ok = false;
    }
    /* ⚠️ Үр дүнг ЗААВАЛ тэмдэглэнэ — эс бөгөөс унасан бичилт дараагийн
       `_syncRemoteCaps`-д чимээгүй буцна (2026-09-08). */
    await trackWrite(u, next, ok);
    return ok;
  });
}

/** Нэг эрхийг асаах/унтраах товчлол. */
export function toggleCap(username: string, cap: CapKey, on: boolean): Promise<boolean> {
  /* ⚠️ REMOTE УНШИГДААГҮЙ БОЛ ТАТГАЛЗАНА (2026-09-21, аудитын засвар). `capsStored`
     нь localStorage-ийн кэш — шинэ browser эсвэл цэвэрлэсэн кэштэй сешнд `[]`.
     Тэр үед «одоогийн + нэг» = `[cap]` бөгөөд `capUpsert` бүтвэл ArcGIS дээрх
     БҮТЭН жагсаалт энэ ганц эрхээр солигдоно (`_syncRemoteCaps` remote = үнэн
     гэдэг тул буцааж авах зам ч байхгүй). `UserAdmin` унтраалгаа урьдчилан
     хаадаг; энэ нь lib-түвшний давхар хаалт. */
  if (!remoteSynced) return Promise.resolve(false);
  /* ⚠️ `capsStored` — тугтай `capsOf` биш (2026-09-21, тэндхийн тайлбар) */
  const cur = capsStored(username);
  return setCaps(username, on ? [...new Set([...cur, cap])] : cur.filter((c) => c !== cap));
}

export function subscribeCaps(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/**
 * Гараар «дахин синк» — UserAdmin-ы товчноос (`permissions.retryDirty`-ийн хос).
 * Үлдсэн dirty тоог буцаана.
 */
export async function retryCapsDirty(onlyMine = false): Promise<number> {
  /* ⚠️ `onlyMine` — админ өмнөх сешний мөрийг бичихийг зөвшөөрөөгүй үед (2026-09-25) */
  const done = await retryDirtyCaps(onlyMine);
  if (Object.keys(done).length) {
    const merged: Store = { ...cache };
    applyDone(merged, done);
    cache = merged;
    save(merged);
  }
  notify();
  return Object.keys(loadDirty()).length;
}

/**
 * ArcGIS-аас ирсэн мөрүүдийг локал кэш болгоно (`initRemote` дуудна).
 *
 * ⚠️ Алсын хуулбар нь ЭЦСИЙН ҮНЭН: энд байхгүй хэрэглэгчийн эрх ХАСАГДСАН
 * гэсэн үг. Локалыг нэгтгэвэл өөр админы хассан эрх энэ browser дээр мөнхөд
 * үлдэнэ — эрх ЧИМЭЭГҮЙ өргөжих нь хамгийн муу төрлийн алдаа.
 */
/**
 * @param trusted dirty-set-ийг дахин илгээж, унасныг snapshot дээр давхарлах эрх
 *   (`permissions.initRemote`-ийн хатуу super сешн). ⚠️ Итгэмжлэгдээгүй сешнд
 *   давхарлахгүй: dirty-set нь localStorage-д байдаг тул ЯМАР Ч аккаунт өөртөө
 *   `zovshoorol`/`finRow` зэрэг эрх тарьж, remote бичилт нь (эрхгүй тул) унамагц
 *   тэр нь snapshot дээр мөнхөд давхарлагдана — өөрөө өөртөө эрх олгох зам.
 *   `permissions.initRemote(trusted)`-ийн ЯГ ижил үндэслэл.
 */
export function _syncRemoteCaps(rows: CapRow[], trusted = false): void {
  const s: Store = {};
  for (const r of rows) {
    if (!r.user) continue;
    /* ⚠️ ХООСОН ЖАГСААЛТЫГ ч БИЧНЭ (2026-09-08): урьд нь `c.length` шалгадаг
       байсан тул remote дээрх `[]` мөр кэшид ОГТ тусдаггүй байв. Тэр нь
       өөрөө хор хөнөөлгүй мэт ч `retryDirtyCaps`-ийн «хасалт амжилттай»
       гэсэн тэмдэглэлтэй уралдана. Түлхүүрийг мөн `trim()`-дэнэ — remote
       мөрөнд санамсаргүй зай орвол `capsOf` хэзээ ч таарахгүй. */
    s[r.user.trim().toLowerCase()] = sane(r.caps);
  }
  /*
   * ⚠️ ДАРААЛАЛД БАЙГАА ба SNAPSHOT-ЫН ДАРАА БИЧИГДСЭН хэрэглэгчийн ЛОКАЛ
   *    жагсаалт давамгайлна (2026-09-25, аудитын засвар) — `scopedAcl.syncRemote`-
   *    ийн ижил дүрэм. Snapshot нь `capUpsert`-ээс ӨМНӨ авагдсан бол кэшээс шинэ
   *    эрх алга болж, дараагийн `toggleCap` тэр ХУУЧИН суурь дээр бүтэн
   *    жагсаалтыг бүтээж remote-ийг дардаг байв.
   */
  const keep = new Set<string>(capQueue.keys());
  for (const [u, t] of capTouched) if (_newerThanSnapshot(t)) keep.add(u);
  for (const u of keep) {
    const loc = cache[u];
    if (loc && loc.length) s[u] = loc; else delete s[u];
  }
  cache = s;
  /* ⚠️ Энэ мөчөөс л `capsOf` кэшийг тооцно (2026-09-21) — remote = үнэн. */
  remoteSynced = true;
  save(s);
  notify();

  /*
   * ⚠️ RETRY-THEN-OVERLAY (2026-09-08): remote snapshot нь ЭЦСИЙН ҮНЭН боловч
   * ArcGIS-д хүрч чадаагүй локал засварыг дарж бичих ёсгүй — тэр нь админы
   * дөнгөж сая хийсэн өөрчлөлт. Эхлээд дахин илгээж үзнэ; бүтвэл цэвэрлэгдэнэ,
   * унавал зорьсон утгыг snapshot дээр давхарлана. `permissions.initRemote`-ийн
   * алхам 1–2-ын ижил загвар. Async тул notify() дахин дуудагдана.
   */
  if (!trusted) return;
  /* ⚠️ ЗӨВХӨН энэ runtime-ийн dirty (`onlyMine`, 2026-09-25) — `mineCaps`-ийн тайлбар */
  void retryDirtyCaps(true).then((done) => {
    const merged: Store = { ...cache };
    /* Retry нь snapshot-ын ДАРАА бичсэн тул тэр утгууд snapshot-од байхгүй */
    applyDone(merged, done);
    /* Үлдсэн (унасан) энэ runtime-ийн засварыг давхарлана */
    for (const [k, v] of Object.entries(loadDirty())) {
      if (mineCaps.get(k) !== serCaps(v.caps) || capQueue.has(k)) continue;
      if (v.caps.length) merged[k] = v.caps;
      else delete merged[k];
    }
    cache = merged;
    save(merged);
    notify();
  });
}
