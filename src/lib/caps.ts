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
 *    нь remote сэргэтэл (15 сек–5 мин poll) хүлээнэ.
 */

import { AUTH, type ViewKey } from './services';
import type { CapRow } from './permsRemote';

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
type DirtyCaps = Record<string, CapKey[]>;

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
    for (const [k, v] of Object.entries(raw)) out[k.toLowerCase()] = sane(v);
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

/** Бичилтийн үр дүнг dirty-set-д тусгана (ok → цэвэрлэ, унав → тэмдэглэ) */
function trackWrite(key: string, intended: CapKey[], ok: boolean): void {
  const d = loadDirty();
  if (ok) {
    if (!(key in d)) return;
    delete d[key];
  } else {
    d[key] = intended;
  }
  saveDirty(d);
  notify();
}

/** ArcGIS-т хүрээгүй эрхийн өөрчлөлттэй түлхүүрүүд — UserAdmin-ы тэмдэгт */
export function dirtyCapKeys(): string[] {
  return Object.keys(loadDirty());
}

/**
 * DIRTY эрхүүдийг remote руу ДАХИН бичиж үзнэ (`_syncRemoteCaps` дуудна).
 * Буцаана: амжилтгүй ҮЛДСЭН dirty map — snapshot дээр давхарлахад.
 */
async function retryDirtyCaps(): Promise<DirtyCaps> {
  const d = loadDirty();
  const keys = Object.keys(d);
  if (!keys.length) return {};
  const left: DirtyCaps = {};
  try {
    const m = await import('./permsRemote');
    for (const key of keys) {
      const intended = d[key];
      try {
        const ok = intended.length ? await m.capUpsert(key, intended) : await m.capRemove(key);
        if (!ok) left[key] = intended;
      } catch {
        left[key] = intended;
      }
    }
  } catch {
    return d; // модуль ачаалагдсангүй — бүгд dirty хэвээр
  }
  saveDirty(left);
  return left;
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
  let ok = false;
  try {
    const r = await import('./permsRemote');
    ok = next.length ? await r.capUpsert(u, next) : await r.capRemove(u);
  } catch {
    ok = false;
  }
  /* ⚠️ Үр дүнг ЗААВАЛ тэмдэглэнэ — эс бөгөөс унасан бичилт дараагийн
     `_syncRemoteCaps`-д чимээгүй буцна (2026-09-08). */
  trackWrite(u, next, ok);
  return ok;
}

/** Нэг эрхийг асаах/унтраах товчлол. */
export function toggleCap(username: string, cap: CapKey, on: boolean): Promise<boolean> {
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
export async function retryCapsDirty(): Promise<number> {
  const left = await retryDirtyCaps();
  notify();
  return Object.keys(left).length;
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
  void retryDirtyCaps().then((left) => {
    const keys = Object.keys(left);
    if (!keys.length) return;
    const merged: Store = { ...cache };
    for (const k of keys) {
      if (left[k].length) merged[k] = left[k];
      else delete merged[k];
    }
    cache = merged;
    save(merged);
    notify();
  });
}
