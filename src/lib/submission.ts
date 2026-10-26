'use client';

/**
 * ИЛГЭЭЛТИЙН ЗАВСРЫН ХАДГАЛАЛТ — «Нийтлэх» → хяналт → батлагдахад л архив.
 *
 * ⚠️ ЯАГААД (2026-09-04, хэрэглэгч: «ноорог систем дотор файлд түр хадгалагдаж
 * байх ёстой, ноорог ҮНДСЭН ДАТАНД хадгалагдаж болохгүй. Бүх шалгалт дуусаж
 * 4 шат дамжсаны дараа л дата хүснэгт буюу үндсэн сервис рүү орно»):
 * урьд нь «Нийтлэх» дарахад `applyAdds` багцын `Bagts_*` үйлчилгээнд
 * (ҮНДСЭН ДАТА) шууд бүтэн жааз бичиж, хяналт нь ТЭР бичигдсэн жаазыг араас
 * нь харж байв — инженер буцаасан ч архивт жааз аль хэдийн үлдчихсэн.
 * Одоо «Нийтлэх» = ИЛГЭЭХ: зөвхөн diff нь `Selbe_Guitsetgel_Draft` хүснэгтийн
 * `sub|<pkgKey>` мөрөнд хадгалагдаж, төлөвлөлтийн ахлах инженер БАТЛАХАД л
 * (`hyanaltStore.apply`) архивт жааз үүснэ.
 *
 * ⚠️ `dkey`-ИЙН ЗАЙ — нэг хүснэгт, гурван төрлийн мөр:
 *   · `<user>|<pkg>`         — ноорог (`draftRemote`, хэвээр; хэрэглэгч бүрд тусдаа)
 *   · `sub|<pkg>|<fillMs>`   — ИДЭВХТЭЙ илгээлт; багц × ӨДӨР бүрд НЭГ мөр
 *   · `sub|<pkg>`            — ХУУЧИН (2026-09-07-оос ӨМНӨХ) идэвхтэй илгээлт,
 *                              өдрийн дагаваргүй; уншилт нь ҮРГЭЛЖ дэмжинэ
 *   · `done|<pkg>|<oid>`     — батлагдсан илгээлт (хөлдсөн); payload-д
 *                              `archiveOid`, `approvedAt` нэмэгдэнэ
 *   Нэг багц × нэг ӨДӨРТ нэг идэвхтэй илгээлт: ТЭР ӨДРИЙН илгээлтийг дахин
 *   илгээхэд ШИНЭ мөр биш, БАЙГАА мөр update хийгдэнэ (`mergeSubmission`-оор
 *   нэгтгэсэн payload-той). Батлагдсаны дараа `sub|` мөр `done|` болж хөлдөнө.
 *
 * ⚠️ ЯАГААД ӨДӨР ОРСОН (2026-09-07, хэрэглэгчийн шууд шаардлага: «хянагдаж
 *    байсан ч дараа өдрийнхийг илгээх боломжтой байх ёстой… дарж бичихгүй,
 *    тусдаа хянагдаад 4 хяналтын зарчмаар явна»):
 *    урьд нь багцад ЦОРЫН ГАНЦ `sub|<pkg>` мөр байсан тул өчигдрийн илгээлт
 *    инженерийн гар дээр байхад өнөөдрийнхийг илгээх зам ОГТ БАЙХГҮЙ байв —
 *    `inReview` бүрмөсөн хаадаг, хаалтыг арилгавал `saveSubmission` тэр НЭГ
 *    мөрийг дарж бичиж, хянагчийн харж буй агуулга доор нь солигдоно.
 *    Одоо өдөр бүр ӨӨРИЙН `sub|` мөртэй, ӨӨРИЙН хяналтын мөртэй
 *    (`hyanaltSubmit`-ийн `Ажлын_нэр`-д огноо ордог тул `groupWorks` тэднийг
 *    аль хэдийн ТУСДАА ажил болгодог) — 4 шат нь өдөр тус бүрд зэрэгцэн явна.
 *
 * ⚠️ ХУУЧИН МӨРҮҮД ҮЙЛДВЭРЛЭЛД БАЙГАА: дагаваргүй `sub|<pkg>` мөрүүд
 *    хянагдсаар байгаа тул тэдгээрийн УНШИХ · БАТЛАХ · ХААХ зам ЗААВАЛ
 *    нээлттэй үлдэнэ. `readSubmissionByOid`/`closeSubmission` нь OBJECTID-аар
 *    ажилладаг тул тэдэнд өөрчлөлт хэрэггүй; `readActiveSubmission` нь
 *    (гүйцэтгэгчийн хуудасны зам) ХОЁУЛАНГ нь хайж, тэр ӨДРИЙНХИЙГ буцаана
 *    (доорх `readActiveSubmission`-ийн ⚠️).
 *
 * ⚠️ OBJECTID ХЭВЭЭР ҮЛДЭХ ЁСТОЙ: хяналтын бүртгэлийн (`guitsetgel_bugluh_hyanalt`)
 * `Эх_мөрийн_дугаар` нь илгээлтийн мөрийн ЭНЭ OBJECTID руу заадаг. Update-ийн
 * оронд delete+add хийвэл дугаар солигдож, хянагч илгээлтээ олохгүй.
 *
 * ⚠️ ЧИМЭЭГҮЙ БИШ — `draftRemote`-оос ялгаатай: ноорог нь нэмэлт хуулбар тул
 * алдаагаа залгидаг (`null`/`false`). Илгээлт нь хяналтын бүртгэлтэй холбогдох
 * ЖИНХЭНЭ алхам: хадгалалт унасныг хэрэглэгч мэдэхгүй бол «илгээлээ» гэж
 * бодоод хүлээнэ, хянагч юу ч харахгүй. Тиймээс `saveSubmission`/`closeSubmission`
 * нь `{ok:false, error}` МЕССЕЖТЭЙ буцаана. Унших зам (`load*`) л чимээгүй
 * `null` — харагдацыг унагаахгүй (илгээлтгүйтэй ижил).
 *
 * ⚠️ Хүснэгтийн URL, нэвтрэлт, давхардал цэвэрлэх ёс — `draftRemote`-ийнх
 * ХЭВЭЭР (тэндээс импортолно): хоёр модуль НЭГ хүснэгтэд бичдэг тул URL-ын
 * кэш, эзний шалгалт хоёр газар салж болохгүй.
 *
 * ⚠️ `null ≠ 0`: payload дахь `asOf`/`base` нь «мэдээлэлгүй» = `null`; тоо биш
 * утгыг 0 болгохгүй.
 */

import { getAuth, tableUrl, layer, sqlStr } from './draftRemote';
/*
 * ⚠️ 2026-10-26 (хэрэглэгчийн шийдвэр — БҮХ ноорог эх хуудасны бүтцээр 191-д): илгээлтийн НҮД нь `payload` JSON-д БИШ
 *    `n:sub:<толгойн OBJECTID>` мөрүүдэд (ажил × блок бүрд нэг мөр, `obyem_sum` · `бодит_гүйцэтгэл` · огноо — `draftRows`).
 *    Толгой (`sub|…`/`done|…` мөр, OBJECTID ХЭВЭЭР) нь зөвхөн ажлын урсгалын мета (`archiving` · `nonces` · `users` …) ба
 *    БАТАЛГААЖСАН ҮЕҮДИЙН жагсаалт (`gens`) — уншигч `gens`-ийн хамгийн сүүлийн үеийн мөрийг авна (MVCC): хагас/унасан бичилт
 *    ХЭЗЭЭ Ч харагдахгүй. `gens`-гүй (хуучин эсвэл хуучин табын бичсэн) payload-ын нүд нь эх сурвалж хэвээр.
 * ⚠️ PHASE A: `SUB_DUAL` — payload-д v2 бүтэн хуулбар ч (≤ `SUBMISSION_MAX`) — шинэчлээгүй таб ажилласаар; хэтэрвэл v3 мета
 *    (хуучин таб «агуулга задарсангүй» гэж зогсоно — fail-closed). Тулгалтын дараа (`draftRowsRemote.phaseB`) `false` болгоно.
 */
import { rowsReady, subRowsFor, subWriteGen, subGc, subDropAll, fillFrame, setHeaderCols } from './draftRowsRemote';
import { cellToCols, colsToCell, pickGeneration, subFromRows, subToRows, ROW_VERSION, type Attrs, type Frame } from './draftRows';
import { t as tr } from '@/lib/i18nCore';
/* ⚠️ Нэмэлтийн мөрийн ГАНЦ дүрэм `bagtsSheet`-д (2026-09-25) — энд давтаж бичвэл
   нэгтгэл ба overlay хоёр өөрөөр уншиж эхэлнэ. Цэвэр функцууд л. */
import { negInc, parseInc, sumInc } from '@/modules/sheet/bagtsSheet';
/* ⚠️ 2026-10-11 (аудит №7): хариу алдагдсан бичилтийг тодорхой татгалзлаас ялгана (`saveSubmission.lost`) */
import { isLostWrite } from './lostWrite';
/* ⚠️ 2026-10-12 (дарааллын аудит): «архивлаж байна» тэмдгийн шинэ эсэх (`markFresh`) — ӨӨР хөтчийн `startedAt`-ыг
   СЕРВЕРИЙН цагаар жишнэ (`serverClock`-ийн ⚠️); синк хийгдээгүй (Node) бол `Date.now()` */
import { serverNow } from './serverClock';

/**
 * ЕРӨНХИЙ МЕНЕЖЕРИЙН НЭМСЭН, хараахан батлагдаагүй мөр.
 *
 * ⚠️ Эцгийг ObjectID-гаар санахгүй: батлахад хуудас бүхэлдээ хуулбарлагдаж
 * бүх мөр ШИНЭ ObjectID авдаг тул тэр дугаар удаан амьдардаггүй. (№ + ажлын
 * нэр) хос нь эх excel-ийн бүтэц тул хамаагүй тогтвортой.
 *
 * ⚠️ НЭГ ЭХ СУРВАЛЖ: FillNew ба sheetFrame хоёулаа ЭНДЭЭС импортолно —
 * төрөл салбарлавал илгээлт ба бөглөх хуудасны мөр зөрнө.
 */
export type NewRow = {
  /** Түр ObjectID — САЛАНГИД сөрөг тоо, серверийн дугаартай хэзээ ч мөргөлдөхгүй */
  oid: number;
  parentNo: string;
  parentWork: string;
  /** Нэрээр олдохгүй үед нөхөх сүүлчийн арга */
  parentIdx: number;
  no: string;
  work: string;
  vol: number | null;
  unit: number | null;
};

/**
 * ИЛГЭЭЛТИЙН АГУУЛГА — архивын сүүлийн жааз дээрх diff.
 *
 * ⚠️ `cells`/`dates`/`adds` нь FillNew-ийн `pending`/`pendDate`/`adds`-тай
 * ЯГ ИЖИЛ хэлбэр: илгээлтийг компанийн хуудсанд overlay хийх, хянагчид
 * харуулах, батлахад жааз бүтээх — гурвуулаа нэг хэлбэрээс уншина.
 */
export type SubmissionPayload = {
  /**
   * Хэлбэрийн хувилбар. `2` = НЭМЭЛТИЙН (`mode: 'inc'`) илгээлт (2026-09-25).
   * ⚠️ ЗОРИУД ӨСГӨВ: хуучин кодтой (шинэчлээгүй таб) хөтөч `v !== 1`-ийг
   *    `parseSubmission`-д ТАТГАЛЗАЖ «агуулга задарсангүй» гэж ЗОГСДОГ
   *    (fail-closed, `readRow`). `v: 1` үлдээвэл тэр таб нэмэлтийг НИЙТ гэж
   *    уншиж архивт 40 → 15 болгож бичих байсан.
   */
  v: 1 | 2;
  /**
   * НҮДНИЙ УТГЫН ДҮРЭМ (2026-09-25, `bagtsSheet.CellMode`-ийн ⚠️).
   *   · `'inc'` — `cells` нь ӨМНӨХ бөглөлтөөс хойшх НЭМЭЛТ; батлахад СҮҮЛИЙН
   *     архивын утга дээр НЭМЭГДЭНЭ.
   *   · байхгүй — ХУУЧИН (2026-09-25-аас өмнөх) илгээлт: `cells` нь НИЙТ утга,
   *     архивын утгыг ОРЛОНО. ⚠️ Туггүй бүхнийг ингэж уншина (давхар нэмэхгүй).
   */
  mode?: 'inc';
  /** PKGS түлхүүр */
  pkgKey: string;
  /** Илгээсэн (компанийн) хэрэглэгч, жижиг үсгээр */
  user: string;
  /**
   * ⚠️ 2026-10-09 (аудит): ЭНЭ илгээлтэд ХЭЗЭЭ НЭГЭН ЦАГТ илгээсэн БҮХ данс (жижиг үсгээр, `mergeSubmission`
   *    хуримтлуулна; `saveSubmission` хөтөчид нэвтэрсэн хэрэглэгчийг нэмнэ). Урьд нь зөвхөн СҮҮЛИЙН илгээгч
   *    (`user`) үлддэг тул хамтран бөглөгч А компаниас инженер шат руу шилжүүлэгдвэл Б-ийн дахин илгээсэн
   *    илгээлтэд орсон ӨӨРИЙН нүдээ өөрөө батлах боломжтой байв (`hyanaltStore.authz` — инженер шатанд
   *    хянагч ∈ `users ∪ {user}` бол татгалзана). Шинэ ҮЙЛЧИЛГЭЭНИЙ талбар биш — payload JSON дотор.
   *    Хуучин мөрд алга → зөвхөн `user`-аар.
   */
  users?: string[];
  /** Илгээсэн агшин (ms) */
  at: number;
  /** Бөглөсөн өдөр — Date.UTC(y,m,d); архивын жаазны buglusun_ognoo болно */
  fillMs: number;
  /** diff-ийг ямар архивын агшин (snapshot ms) дээр бичсэн бэ — мэдээлэл */
  base: number | null;
  /** «Шинэчлэгдсэн огноо» — өөрчилсөн бол; эс бөгөөс `null` (0 БИШ) */
  asOf: number | null;
  /** `${oid}:${b}` → утга (мөр) — FillNew-ийн `pending`-тэй ИЖИЛ */
  cells: [string, string][];
  /** `${oid}:${b}:s|e` → 'YYYY-MM-DD' эсвэл '' — `pendDate`-тэй ИЖИЛ */
  dates: [string, string][];
  /** Нэмсэн мөр — oid сөрөг */
  adds: NewRow[];
  /** oid → "№ ¦ Ажлын нэр" — ObjectID шилжилтэд */
  rowKeys: [number, string][];
  /**
   * МӨРИЙН ДАВТАМЖИЙН ДУГААР — `[oid, k, n]` (2026-10-04 аудит, #2; `sheetFrame.RowOcc`).
   * ⚠️ «№ ¦ Ажил» шошго жаазны 60.5%-д давхардсан (Bagts_1_9f) тул `rowKeys` ганцаараа
   *    мөрийг ялгахгүй: шинэ жааз руу зөөхөд ӨӨР мөрөнд буух байв. Сонголттой —
   *    хуучин илгээлтэд байхгүй; тэр үед `mapOldOids` хоёрдмол түлхүүрийг ЗӨӨХГҮЙ.
   */
  rowOcc?: [number, number, number][];
  /**
   * ИЛГЭЭЛТИЙН ТАНИГЧУУД — илгээх оролдлого бүрийн санамсаргүй `nonce` (сүүлийн 20),
   * 2026-10-04 аудит (#3).
   * ⚠️ ЯАГААД: `saveSubmission` сервер дээр бичигдсэний ДАРАА хариу нь тасарвал
   *    (сүлжээ, timeout) клиент «болсонгүй» гэж үзэж ноорогоо үлдээнэ; дахин дарахад
   *    «өөр хэрэглэгч илгээсэн» гэж зогсох эсвэл (F5-ын дараа) ижил нэмэлтийг ДАХИН
   *    нэгтгэж ДАВХАР тоолох байв. Одоо `FillNew.publish` өөрийн хадгалсан `nonce`-ыг
   *    энд хайж «миний илгээлт аль хэдийн буусан» гэж таньна. `mergeSubmission` хуримтлуулна
   *    (дараагийн илгээлт өмнөхийнхийг агуулна — өөр хүн дээр нь нэгтгэсэн ч олдоно).
   */
  nonces?: string[];
  /** Батлагдсаны дараа: архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID */
  archiveOid?: number;
  approvedAt?: number;
  /**
   * «БҮРТГЭЛ ХҮЛЭЭГДЭЖ БУЙ» — архивт буусан боловч нэгтгэл (`registerApproved`)
   * ба IPC (`syncIpcFromFill`) хараахан баталгаажаагүй (2026-09-25 аудит).
   * ⚠️ `closeSubmission` `done|` болгохдоо `true` тавьж, хоёулаа амжилттай
   *    болсны дараа `markRegistered` арилгана. Таб энэ хооронд хаагдвал
   *    `hyanaltStore.retryPendingRegistrations` дахин ажиллуулна — урьд нь тэр
   *    өдөр нэгтгэл/IPC-гүй МӨНХӨД үлддэг байв.
   */
  regPending?: boolean;
  /**
   * «ҮЛДЭГДЭЛ НЭМЭЛТ» (2026-09-25 аудит) — батлах явцад гүйцэтгэгч дахин илгээснээс
   * архивласан хэсгийг хассан үлдэгдэл (`residualAfterArchive`), `hyanaltStore` бичнэ.
   * ⚠️ Хяналтын мөр нь «Шилжүүлсэн» болсон атлаа энэ агуулга архивт ОРООГҮЙ тул
   *    FillNew түүнийг урсгалаас үл хамааран давхарлаж/нэгтгэнэ; `hyanaltStore.apply`
   *    шинэ хяналтын тойрог нээнэ. `mergeSubmission` ДАМЖУУЛАХГҮЙ (дараагийн илгээлт
   *    өөрөө шинэ тойрог нээдэг); `done|` болоход утгагүй болно.
   */
  residual?: true;
  /**
   * ҮЛДЭГДЛИЙГ ҮҮСГЭСЭН БАТЛАЛТ (2026-10-12, A9) — `hyanaltStore.closeAfterArchive` `residual`-тай хамт бичнэ:
   *   · `row` — тэр үеийн хяналтын мөрийн OBJECTID (эцсийн шатанд батлагдаж байсан);
   *   · `archiveOid`/`day` — тэр батлалтаар архивт бичигдсэн жаазны эхний OID ба өдөр (0 = бичээгүй).
   * ⚠️ ЯАГААД: үлдэгдэл хадгалагдсаны ДАРАА хяналтын мөрийн `updateRows` унавал мөр эцсийн шатанд үлдэж,
   *    дахин «Батлах» нь ДООД шатнуудын хараагүй үлдэгдлийг шууд архивладаг байв. Энэ тэмдэгтэй ба ижил мөрөөр
   *    батлагдвал архивлахгүй — «Шилжүүлсэн» болгож үлдэгдлийг шинэ тойрогт оруулна. `mergeSubmission`
   *    ДАМЖУУЛАХГҮЙ (дараагийн илгээлт энгийн агуулга).
   */
  residualOf?: { row: number; archiveOid: number; day: string };
  /**
   * «АРХИВЛАЖ БАЙНА» ТЭМДЭГ (2026-10-09, R2) — `hyanaltStore.archiveSubmission` `applyAdds`-ийн
   * ӨМНӨ `markArchiving`-аар (at-ийн CAS) бичнэ. `at` ӨӨРЧЛӨГДӨХГҮЙ (агуулгын хувилбар хэвээр).
   *   · `at` — архивлаж буй агуулгын `at`; одоогийн `at`-тай зөрвөл тэмдэг хүчингүй;
   *   · `startedAt` — эхэлсэн агшин (мэдээлэл);
   *   · `maxOid0` — бичихийн өмнөх архивын MAX OBJECTID;
   *   · `fillMs` — жаазны `buglusun_ognoo` (өнөөдөр рүү залруулсан байж болно);
   *   · `n` — жаазны мөрийн тоо.
   * ⚠️ ЯАГААД: архив бичигдээд хаалт (`closeSubmission`) ба хяналтын мөр хоёулаа унавал
   *    өөр хөтчийн дарга дахин батлахад `archivedSet` (localStorage) харагдахгүй тул БҮТЭН жааз
   *    дахин бичигддэг байв. Тэмдэг байвал `OBJECTID > maxOid0 AND өдөр = fillMs` жааз архивт
   *    бүтэн байгаа эсэхийг шалгаж, байвал бичихгүй шууд хаана.
   * ⚠️ 2026-10-09 (ДАХИН ЗАССАН): `mergeSubmission` ДАМЖУУЛНА (урьд нь «шинэ агуулга = шинэ `at`» гэж
   *    хаядаг байв). Архив бичигдсэний ДАРАА (хаалт унасан/явж байхад) гүйцэтгэгч дахин илгээвэл тэмдэг
   *    алга болж, дараагийн батлалт архивласан +15-ийг ДАХИН нэмдэг байв (base+15 → +5 → base+35).
   *    Дамжуулахдаа архивлаж буй агуулгын хуулбарыг (`prev`) хадгална — `archiveSubmission` тэр жааз
   *    буусан бол шинэ агуулгыг `residualAfterArchive`-аар хасч бичнэ (`archivedContent`). `closeSubmission`
   *    ба шийдсэн бичигч (`saveSubmission`-ий `dropMark`) арилгана.
   * ⚠️ 2026-10-09: `by`/`sid` — тэмдэг тавьсан хэрэглэгч ба хөтчийн сешн (`markArchiving`-ийн «claim»);
   *    `archivingBusy` (Ажил · обьём · Хуваарийн бичигчид) ШИНЭ (`ARCHIVING_TTL_MS`) тэмдгийг хүлээнэ.
   * ⚠️ 2026-10-09 (R2-c): «≥ n мөр» нь ЭНЭ илгээлтийн жааз гэдгийг батлахгүй (тэр өдөр ӨӨР жааз бичигдэж
   *    болно) — `rootNo` (жаазны эхний мөрийн №) ба `probe` (илгээлтээр өөрчлөгдсөн нүднүүдийн дээж:
   *    [жаазан дахь индекс, талбар, бичсэн утга]) хадгалж `matchArchivedFrame`-ээр ЯГ таньна. Хуучин
   *    (тэдгээргүй) тэмдэгт ЯГ `n` мөр + эхний № л шалгагдана.
   */
  archiving?: ArchivingMark;
};

/** «Архивлаж байна» тэмдэг — `SubmissionPayload.archiving`-ийн ⚠️ */
export type ArchivingMark = {
  at: number; startedAt: number; maxOid0: number; fillMs: number; n: number;
  rootNo?: string;
  probe?: [number, string, number | string | null][];
  /** ⚠️ 2026-10-09: тэмдэг тавьсан хэрэглэгч (жижиг үсгээр) — `archivingBusy`/`markArchiving`-ийн мессежид */
  by?: string;
  /** ⚠️ 2026-10-09: тавьсан хөтчийн табын сешн (`SESSION_ID`) — «claim»: өөр сешн ШИНЭ тэмдгийг дарахгүй */
  sid?: string;
  /**
   * ⚠️ 2026-10-09: ДАМЖСАН тэмдгийн (`at` ≠ payload.at) архивлаж буй агуулга — `mergeSubmission` анх дамжуулахдаа
   *    өмнөх payload-ын нүд/мөрийн танигчийг хуулна. Байхгүй бол буусан жаазаас хасах боломжгүй → татгалзана.
   */
  prev?: ArchSnap;
  /**
   * ⚠️ 2026-10-26: `prev`-ийн МӨРИЙН ҮЕ (`n:sub:<OBJECTID>` — толгойн `gens`-ийн нэг) — v3 мета payload-д нүдний хуулбарын
   *    ОРОНД бичигдэнэ; уншихад тэр үеийн мөрөөс `prev` дахин угсрагдана (`assemble`), GC тэр үеийг хадгална.
   */
  prevGen?: number;
};
/** Архивлаж буй агуулгын хуулбар — `residualAfterArchive`-д хэрэгтэй хэсэг л (`ArchivingMark.prev`) */
export type ArchSnap = { cells: [string, string][]; rowKeys: [number, string][]; rowOcc?: [number, number, number][] };

/** `ArchivingMark.probe`-ийн дээд урт (payload-ыг дүүргэхгүй) */
export const PROBE_MAX = 8;

/**
 * «АРХИВЛАЖ БАЙНА» ТЭМДГИЙН ШИНЭ БАЙХ ХУГАЦАА (2026-10-09) — 15 мин. Жааз бичих (≈1–2 мин) ба хаах хугацаанаас
 * хангалттай урт. Энэ хугацаанд тэмдэг «явж буй/үр дүн тодорхойгүй» — өөр сешн дарахгүй (`markArchiving`),
 * гүйцэтгэгч дахин илгээхгүй (`FillNew.publish`), бусад бичигч хүлээнэ (`archivingBusy`). Хуучирсан тэмдгийг
 * архивын жаазаар шийднэ (`matchArchivedFrame`).
 */
export const ARCHIVING_TTL_MS = 15 * 60_000;
/** Тэмдэг ШИНЭ үү (`ARCHIVING_TTL_MS`). ⚠️ Цагийн зөрүүгээр ирээдүйд байвал ч шинэ гэж үзнэ (fail-closed).
 *  ⚠️ 2026-10-12 (дарааллын аудит): анхдагч `now` нь СЕРВЕРИЙН цаг (`serverNow`) — `startedAt` ч серверийн цагаар бичигдэнэ. */
export const markFresh = (m: Pick<ArchivingMark, 'startedAt'>, now = serverNow()): boolean =>
  now - m.startedAt < ARCHIVING_TTL_MS;

/**
 * ЭНЭ ТАБЫН СЕШНИЙ ТАНИГЧ (2026-10-09) — `ArchivingMark.sid`. Модуль ачаалагдах бүрд шинэ (таб/F5 тутам).
 */
export const SESSION_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** Огноо мэт тоо (epoch ms, 1973-аас хойш) эсвэл 'YYYY-MM-DD…' → UTC өдрийн дугаар (`normDayMs`-ийн дүрэм — ойрын шөнө дунд) */
function dayNo(v: unknown): number | null {
  const ms = typeof v === 'number' ? v
    : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim()) ? Date.parse(`${v.trim().slice(0, 10)}T00:00:00Z`) : NaN;
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

/**
 * Архивт бичсэн утга ба буцаж уншсан утгын харьцаа (2026-10-09 — урьдын `sameArchVal`-ийн 1e-6 тэнцэл):
 *   · `'eq'`   — тэнцүү: тоо харьцангуй 1e-9 дотор, огноо (`date`) UTC өдрөөр, мөр trim-ээр, хоосон = null;
 *   · `'near'` — зөвхөн хөвөгч таслалын бөөрөнхийллөөр ялгаатай (≤ 1e-6 харьцангуй) — ЭНЭ ЖААЗ мөн/биш нь
 *                ТОДОРХОЙГҮЙ (дуудагч fail-closed);
 *   · `'far'`  — өөр утга.
 */
function cmpArchVal(a: unknown, b: number | string | null, date = false): 'eq' | 'near' | 'far' {
  if (b == null || b === '') return a == null || a === '' ? 'eq' : 'far';
  if (date || (typeof b === 'number' && typeof a === 'number' && Math.abs(b) > 1e11 && Math.abs(a) > 1e11)) {
    const x = dayNo(a);
    const y = dayNo(b);
    if (x != null && y != null) return x === y ? 'eq' : 'far';
  }
  if (typeof b === 'number') {
    const x = typeof a === 'number' ? a : typeof a === 'string' && a.trim() ? Number(a) : NaN;
    if (!Number.isFinite(x)) return 'far';
    const d = Math.abs(x - b);
    const m = Math.max(1, Math.abs(b));
    return d <= 1e-9 * m ? 'eq' : d <= 1e-6 * m ? 'near' : 'far';
  }
  return String(a ?? '').trim() === b.trim() ? 'eq' : 'far';
}
/** Архивт бичсэн утга ба уншсан утга ижил үү (`cmpArchVal === 'eq'`) — `frameProbe`-ийн «өөрчлөгдсөн үү» */
function sameArchVal(a: unknown, b: number | string | null): boolean {
  return cmpArchVal(a, b) === 'eq';
}

/**
 * ТАНИХ ДЭЭЖ — бичих гэж буй жааз (`frame`) ӨМНӨХ жаазаас (`prev(i)`) ялгарах нүднүүдээс жигд
 * тархсан ≤ `max` ширхэг [индекс, талбар, утга] (2026-10-09, R2-c). Өөрчлөлтгүй бол хоосон —
 * тэр үед `matchArchivedFrame` зөвхөн урт + эхний №-ээр таньна.
 */
export function frameProbe(
  frame: Record<string, unknown>[],
  prev: (i: number) => Record<string, unknown> | undefined,
  fields: string[],
  max = PROBE_MAX,
): [number, string, number | string | null][] {
  const diffs: [number, string, number | string | null][] = [];
  for (let i = 0; i < frame.length; i += 1) {
    const p = prev(i);
    for (const f of fields) {
      const v = frame[i][f];
      if (v === undefined) continue;
      const val: number | string | null = typeof v === 'number' && Number.isFinite(v) ? v
        : typeof v === 'string' ? v.slice(0, 256) : v == null ? null : NaN;
      if (typeof val === 'number' && !Number.isFinite(val)) continue;
      if (p && sameArchVal(p[f], val)) continue;
      diffs.push([i, f, val]);
    }
  }
  if (diffs.length <= max) return diffs;
  const out: [number, string, number | string | null][] = [];
  for (let k = 0; k < max; k += 1) out.push(diffs[Math.round((k * (diffs.length - 1)) / (max - 1))]);
  return out;
}

/**
 * АРХИВТ ОЛДСОН МӨРҮҮДЭЭС (`OID > maxOid0`, тэмдгийн өдөр, OID-оор эрэмбэлсэн) ЭНЭ ТЭМДГИЙН жаазыг
 * таньж эхний OID-г буцаана; олдохгүй бол `null` (2026-10-09, R2-c).
 * ⚠️ Жааз = эхний № (`rootNo`, хуучин тэмдэгт эхний мөрийнх) -ээр эхэлж, дараагийн тийм мөр (эсвэл
 *    төгсгөл) хүртэл ЯГ `n` мөр; `probe`-ийн нүд бүр бичсэн утгатай тэнцүү. «≥ n мөр» хангалтгүй:
 *    тэр өдөр өөр жааз (ажил нэмэх · Улсын комисс) бичигдсэн бол андуурч, батлагдсан гүйцэтгэлийг
 *    архивт оруулалгүй илгээлтийг хаадаг байв.
 * ⚠️ 2026-10-09: `'ambiguous'` — эхний № ба `n` таарсан жааз байгаа боловч дээжийн утга нь ЗӨВХӨН хөвөгч
 *    таслалын бөөрөнхийллөөр (`cmpArchVal` → `'near'`) зөрсөн. Урьд нь (1e-6 тэнцэл/эсвэл зөрвөл `null`)
 *    «буугаагүй» гэж үзэж жаазыг ДАХИН бичих эрсдэлтэй байв — дуудагч ТАТГАЛЗАНА (fail-closed). Тоог
 *    харьцангуй 1e-9-өөр, огноог (`dateFields`; эсвэл хоёулаа epoch ms) UTC өдрөөр жишнэ.
 */
export function matchArchivedFrame(
  rows: Record<string, unknown>[],
  mark: Pick<ArchivingMark, 'n' | 'rootNo' | 'probe'>,
  oidField: string,
  noField: string,
  /** ⚠️ 2026-10-09: огнооны талбарууд — UTC өдрөөр жишнэ */
  dateFields?: readonly string[],
): number | null | 'ambiguous' {
  if (!rows.length || mark.n <= 0) return null;
  const dates = new Set(dateFields ?? []);
  const noOf = (r: Record<string, unknown>) => String(r[noField] ?? '').trim();
  const root = mark.rootNo ?? noOf(rows[0]);
  const starts: number[] = [];
  if (root) rows.forEach((r, i) => { if (noOf(r) === root) starts.push(i); });
  else starts.push(0);
  let ambiguous = false;
  for (let k = 0; k < starts.length; k += 1) {
    const s = starts[k];
    const end = root ? (k + 1 < starts.length ? starts[k + 1] : rows.length) : rows.length;
    if (end - s !== mark.n) continue;
    let near = false;
    let far = false;
    for (const [i, f, v] of mark.probe ?? []) {
      const c = i < mark.n ? cmpArchVal(rows[s + i]?.[f], v, dates.has(f)) : 'far';
      if (c === 'far') { far = true; break; }
      if (c === 'near') near = true;
    }
    if (far) continue;
    if (near) { ambiguous = true; continue; }
    const oid = Number(rows[s][oidField]);
    if (Number.isInteger(oid) && oid > 0) return oid;
  }
  return ambiguous ? 'ambiguous' : null;
}

/**
 * ТАСАРСАН ЖААЗНЫ МӨРҮҮД (2026-10-11, аудит №7 — амьд тохиолдол: `Bagts_3_2_9f` 2026-10-11, 500/1471).
 *
 * «Архивлаж байна» тэмдгийн дараа (`OID > maxOid0`, тэмдгийн өдөр) бичигдсэн мөрүүд нь тэмдгийн жаазаас
 * БОГИНО, 500-ийн ҮРЖВЭР (`applyAdds` 500-аар бичдэг), эхний мөрийн № = `rootNo`, жаазны дотор буух дээж
 * бүр таарч байвал — тэр нь унасан батлалтын ХАГАС жааз: таб хаагдсан/сүлжээ тасарсан тул `archiveSubmission`-ийн
 * буцаалт (`applyDeletes`) ажиллаагүй. Тийм жааз `loadRows`-ийн F1 шалгуурыг унагааж багцыг (бөглөх · хянах ·
 * батлах) БҮХЭЛД НЬ хаадаг байв — батлагчийн дахин оролдлого ч `probeArchivedFrame` хүртэл хүрдэггүй.
 *   · бүтэн (≥ n) жааз → `[]` (өөр бичигчийн жинхэнэ жааз байж болно — хөндөхгүй; 2026-10-12 хүртэл `null`);
 *   · дээж «хол» зөрвөл / № таарахгүй / 500-ийн үржвэр биш → `null` (танигдсангүй — админ);
 *   · эс бөгөөс устгах OID-ууд.
 * Цэвэр функц — `hyanaltStore.cleanupTruncatedFrame` сүлжээг хариуцна.
 */
/*
 * ⚠️ 2026-10-12 (A2): ЗӨВХӨН ТЭРГҮҮН ХЭСЭГ. Урьд нь `OID > maxOid0` тэр өдрийн БҮХ мөр нэг тасарсан жааз байх ёстой
 *    гэж үздэг тул тасарсан жаазын ДАРАА тэр өдөр өөр БҮТЭН жааз (ажил нэмэх · Улсын комисс · дараагийн батлалт)
 *    бичигдсэн бол нийт урт ≥ n эсвэл эхний № дахин тааралдаж «танигдсангүй, админ шалгана» гэж МӨНХӨД гацдаг байв.
 *    Одоо тасарсан жааз = `maxOid0`-оос шууд эхлэх ТЭРГҮҮН хэсэг: мөр 0 нь эхний № (`rootNo`, эсвэл хуучин тэмдэгт мөр
 *    0-ийн №), дараагийн тийм № (дараагийн жаазын эхлэл) эсвэл төгсгөл хүртэл. Тэр хэсэг n-ээс БОГИНО, 500-ийн үржвэр,
 *    дээж таарвал түүний OID-ууд; ард нь орсон бүтэн жаазууд ХӨНДӨГДӨХГҮЙ.
 */
export function truncatedFrameIds(
  rows: Record<string, unknown>[],
  mark: Pick<ArchivingMark, 'n' | 'rootNo' | 'probe'>,
  oidField: string,
  noField: string,
  dateFields?: readonly string[],
): number[] | null {
  if (!rows.length || mark.n <= 0) return null;
  const noOf = (r: Record<string, unknown>) => String(r[noField] ?? '').trim();
  const root = mark.rootNo ?? noOf(rows[0]);
  if (!root || noOf(rows[0]) !== root) return null;
  /* Тэргүүн хэсгийн төгсгөл — дараагийн жаазын эхлэл (ижил эхний №) эсвэл төгсгөл */
  let len = 1;
  while (len < rows.length && noOf(rows[len]) !== root) len += 1;
  /* ⚠️ Тэргүүн хэсэг БҮТЭН (≥ n) — тасарсан жааз АЛГА (`[]`, юу ч устгахгүй); урьд нь `null` («танигдсангүй») тул
     манай бичилт огт суугаагүй, тэр өдөр өөр бүтэн жааз орсон тохиолдолд батлалт/буцаалт мөнхөд хаагддаг байв. */
  if (len >= mark.n) return [];
  if (len % 500 !== 0) return null;
  const dates = new Set(dateFields ?? []);
  for (const [i, f, v] of mark.probe ?? []) {
    if (i >= len) continue;
    if (cmpArchVal(rows[i]?.[f], v, dates.has(f)) === 'far') return null;
  }
  const ids: number[] = [];
  for (const r of rows.slice(0, len)) {
    const oid = Number(r[oidField]);
    if (!Number.isInteger(oid) || oid <= 0) return null;
    ids.push(oid);
  }
  return ids;
}

/**
 * ХАРИУ АЛДАГДСАН БИЧИЛТИЙН ЦЭВЭРЛЭГЭЭ — ЭНЭ ЖААЗЫН МӨРҮҮД (⚠️ 2026-10-21, аудит; `ulsiinKomiss`-ийн 2026-10-21-ний
 * «өдрөөр биш АГУУЛГААР таних» дүрмийн архивлалтын хувилбар).
 *
 * `hyanaltStore.archiveSubmission`-ийн `applyAdds` хариу алдагдсан (`addsLost`) үед тэмдгийн өдрийн `OID > maxOid0`
 * мөрүүдээс (OID-оор эрэмбэлсэн) МАНАЙ жаазыг таньж устгах OID-уудыг буцаана. Урьд нь тэр өдрийн тэр мужийн БҮХ
 * мөрийг устгадаг тул тэмдэг ба бичилтийн завсарт ижил өдрөөр бичигдсэн ӨӨР батлалтын (өөр `sub|` мөр) жааз ч
 * устдаг байв.
 *   · жааз = `rootNo`-оор эхэлж дараагийн тийм № (эсвэл төгсгөл) хүртэлх хэсэг (`matchArchivedFrame`-ийн дүрэм);
 *   · БҮТЭН (ЯГ `n` мөр) эсвэл ТАСАРСАН (`n`-ээс богино, 500-ийн үржвэр — `applyAdds` 500-аар бичдэг) бөгөөд дээж
 *     (`probe`) таарсан хэсэг л манайх; `written` (баталгаажсан OID) үргэлж орно;
 *   · таарах хэсэг ОЛОН (хоёрдмол), дээж зөвхөн бөөрөнхийллөөр зөрсөн (`'near'`), эсвэл баталгаажсан OID танигдсан
 *     хэсгийн ГАДНА (жааз холилдсон) → `null` (танигдсангүй — дуудагч зөвхөн `written`-ийг устгаж, үлдсэнийг ил
 *     хэлнэ; fail-closed);
 *   · таарах хэсэг алга → `[...written]`.
 * Цэвэр функц — сүлжээг `hyanaltStore` хариуцна.
 */
export function lostFrameIds(
  rows: Record<string, unknown>[],
  mark: Pick<ArchivingMark, 'n' | 'rootNo' | 'probe'>,
  oidField: string,
  noField: string,
  dateFields?: readonly string[],
  written?: readonly number[],
): number[] | null {
  const own = new Set((written ?? []).filter((x) => Number.isInteger(x) && x > 0));
  if (!rows.length || mark.n <= 0) return [...own];
  const dates = new Set(dateFields ?? []);
  const noOf = (r: Record<string, unknown>) => String(r[noField] ?? '').trim();
  const root = mark.rootNo ?? noOf(rows[0]);
  const starts: number[] = [];
  if (root) rows.forEach((r, i) => { if (noOf(r) === root) starts.push(i); });
  else starts.push(0);
  let hit: number[] | null = null;
  for (let k = 0; k < starts.length; k += 1) {
    const s = starts[k];
    const end = root ? (k + 1 < starts.length ? starts[k + 1] : rows.length) : rows.length;
    const len = end - s;
    if (len !== mark.n && !(len < mark.n && len % 500 === 0)) continue;
    let near = false;
    let far = false;
    for (const [i, f, v] of mark.probe ?? []) {
      if (i >= len) continue;
      const c = cmpArchVal(rows[s + i]?.[f], v, dates.has(f));
      if (c === 'far') { far = true; break; }
      if (c === 'near') near = true;
    }
    if (far) continue;
    if (near || hit) return null;
    hit = [];
    for (const r of rows.slice(s, end)) {
      const oid = Number(r[oidField]);
      if (!Number.isInteger(oid) || oid <= 0) return null;
      hit.push(oid);
    }
  }
  if (hit) {
    const hs = new Set(hit);
    for (const w of own) if (!hs.has(w) && rows.some((r) => Number(r[oidField]) === w)) return null;
  }
  return [...new Set([...(hit ?? []), ...own])];
}

/**
 * ТЭМДГИЙН АРХИВЛАЖ БУЙ АГУУЛГА (2026-10-09) — тэмдэг ЭНЭ агуулгынх (`at` тэнцүү) бол payload өөрөө; ДАМЖСАН
 * (`mergeSubmission`) бол түүний хуулбар (`prev`) payload-ын хэлбэрээр; аль нь ч биш бол `null` (хасах боломжгүй).
 */
export function archivedContent(p: SubmissionPayload): SubmissionPayload | null {
  const m = p.archiving;
  if (!m) return null;
  if (m.at === p.at) return p;
  if (!m.prev) return null;
  const out: SubmissionPayload = { ...p, cells: m.prev.cells, rowKeys: m.prev.rowKeys };
  if (m.prev.rowOcc) out.rowOcc = m.prev.rowOcc; else delete out.rowOcc;
  return out;
}

/**
 * ШИЙДСЭН ТЭМДГИЙГ ХЭРЭГЖҮҮЛНЭ (2026-10-09) — `archiveSubmission` ба `FillNew.publish`-ийн НЭГ дүрэм, ЦЭВЭР.
 *   · `landed` (жааз архивт БУУСАН) → архивласан хэсгийг хассан үлдэгдэл (`residualAfterArchive`), `residual: true`
 *     (архивт ороогүй агуулга — «Шилжүүлсэн» урсгалын дор ч давхарлагдана/нэгтгэгдэнэ);
 *     хасах боломжгүй (хуулбаргүй · түлхүүр тулгагдаагүй) → `null` (дуудагч ТАТГАЛЗАНА).
 *     ⚠️ Хуучин (НИЙТ) горимд дахин бичих нь орлуулалт тул хасахгүй — агуулга хэвээр.
 *   · буугаагүй → агуулга хэвээр (тэр агуулга архивт ХЭЗЭЭ Ч ороогүй).
 *   Хоёуланд тэмдэг арилна. Оролтыг ӨӨРЧЛӨХГҮЙ.
 */
export function resolveMark(p: SubmissionPayload, landed: boolean): SubmissionPayload | null {
  let out: SubmissionPayload = { ...p };
  if (landed && p.mode === 'inc') {
    const arch = archivedContent(p);
    if (!arch) return null;
    /* ⚠️ Нэмсэн мөр (`adds`) буусан жаазад аль хэдийн байрласан — үлдэгдэлд үлдвэл ДАХИН нэмэгдэнэ, түүний
       сөрөг түлхүүрийг архивын мөрөнд тулгах зам алга. Хасахгүй, ТАТГАЛЗАНА (хүн шийднэ). */
    if (p.adds.length) return null;
    const rest = residualAfterArchive(p, arch);
    if (!rest) return null;
    out = { ...rest, residual: true };
  }
  delete out.archiving;
  return out;
}

/**
 * «claim» ЗӨРЧИЛ (2026-10-09, `markArchiving`) — ЦЭВЭР. `existing` тэмдэг ижил `at`-тай, ШИНЭ, ӨӨР сешнийх бол
 * `{ sameUser }` (ижил хэрэглэгчийн өөр таб/хөтөч эсэх), эс бөгөөс `null` (дарж болно).
 */
export function claimConflict(
  /* ⚠️ 2026-10-12 (дарааллын аудит): анхдагч нь серверийн цаг (`markFresh`-тэй ижил) */
  existing: ArchivingMark | undefined, at: number, sid: string, me: string, now = serverNow(),
): { sameUser: boolean; by: string } | null {
  if (!existing || existing.at !== at || !markFresh(existing, now)) return null;
  if (existing.sid && existing.sid === sid) return null;
  const by = (existing.by ?? '').toLowerCase();
  return { sameUser: !!by && by === me.toLowerCase(), by };
}

/** Хүснэгтээс уншсан илгээлт — мөрийн дугаар ба төлөвтэй */
export type StagedSubmission = { oid: number; at: number; done: boolean; payload: SubmissionPayload };

/**
 * `rowKeys`-ийг ХУУДАСНЫ ДАРААЛЛААР (oid ӨСӨХӨӨР) эрэмбэлнэ — шинэ массив.
 *
 * ⚠️ ЯАГААД (2026-09-25-ны аудит, HIGH): `sheetFrame.buildOidMap` нь давхардсан
 *    «№ ¦ Ажил» шошготой мөрүүдийн нэрийдлийг `shift()`-ээр ДАРААЛАН олгодог
 *    бөгөөд `rowKeys` хуудасны дарааллаар ирнэ гэдэгт тулгуурладаг. Урьд нь
 *    `mergeSubmission` хуучин payload-ын дарааллыг хадгалж шинэ түлхүүрийг
 *    ТӨГСГӨЛД залгадаг байв: өглөө 2-р «10 · БУСАД АЖИЛ» (oid 5000), үдээс
 *    хойш 1-р нь (oid 1200) засагдвал `[[5000,L],[1200,L]]` болж, батлахаас
 *    өмнө шинэ жааз орвол хоёр мөрийн блокийн утга СОЛИГДОЖ `unmoved = 0`-оор
 *    архивт бичигддэг байлаа.
 * ⚠️ oid өсөх = хуудасны дараалал: жааз бүхэлдээ хуудасны дарааллаар нэмэгддэг
 *    ба `loadRows` ч `objectid ASC`-ээр уншдаг; нэгтгэхээс өмнө хуучин payload
 *    нь `movePayload`-оор одоогийн жаазанд зөөгддөг тул нэг payload-ын rowKeys
 *    НЭГ жаазных. Сөрөг (түр) oid байвал эерэгүүдийн ДАРАА — эерэгийн
 *    харьцангуй дарааллыг хөндөхгүй.
 */
const byPageOrder = (keys: Iterable<[number, string]>): [number, string][] =>
  [...keys]
    .map(([o, k]): [number, string] => [o, k])
    .sort((a, b) => (a[0] < 0 ? 1 : 0) - (b[0] < 0 ? 1 : 0) || a[0] - b[0]);

/**
 * ХАДГАЛАХ ДЭЭД ХЭМЖЭЭ (тэмдэгт) — `draftRemote.REMOTE_MAX`-тай ижил үндэслэл:
 * талбарын урт 100,000, үлдсэн зай нь JSON escape-ийн нөөц.
 *
 * ⚠️ Хэтэрсэн илгээлт ЯВАХГҮЙ, ил алдаатай буцна — таслаж бичвэл хагас diff
 * батлагдаж архивт орно.
 */
export const SUBMISSION_MAX = 80_000;

const SUB_PREFIX = 'sub|';
const DONE_PREFIX = 'done|';
/**
 * ⚠️ Ноорогийн түлхүүр `<user>|<pkg>` жижиг үсгээр тул `sub`/`done` нэртэй
 *    ArcGIS хэрэглэгч байвал давхцана. Одоогийн байгууллагад тийм нэр байхгүй;
 *    гарвал угтварыг өөрчлөх биш (хуучин мөр алдагдана), тэр нэрийг хориглоно.
 */
/**
 * ИДЭВХТЭЙ ИЛГЭЭЛТИЙН ТҮЛХҮҮР.
 *
 * ⚠️ `fillMs` өгвөл `sub|<pkg>|<fillMs>` — ӨДӨР БҮР ТУСДАА мөр (2026-09-07,
 *    толгойн ⚠️). Өгөхгүй бол ХУУЧИН `sub|<pkg>` — зөвхөн УНШИХ (legacy
 *    fallback) болон тестэд; ШИНЭ мөр энэ хэлбэрээр ХЭЗЭЭ Ч үүсэхгүй.
 * ⚠️ `fillMs` нь `Date.UTC(y,m,d)` буюу өдрийн эхэн — `FillNew.publish`-ийн
 *    ЦОРЫН ГАНЦ эх сурвалж. Секундын нарийвчлалтай агшин (`at`) оруулбал
 *    илгээлт бүр шинэ мөр үүсгэж, «нэг өдөрт нэгтгэх» дүрэм эвдэрнэ.
 */
export const subKey = (pkgKey: string, fillMs?: number | null) =>
  fillMs == null ? `${SUB_PREFIX}${pkgKey}` : `${SUB_PREFIX}${pkgKey}|${fillMs}`;
/**
 * ⚠️ `doneKey` нь ӨДРИЙГ АВАХГҮЙ — санаатай. Түлхүүрт `oid` (OBJECTID) орсон
 *    бөгөөд тэр нь хүснэгтэд давтагдашгүй тул өдөр бүрийн хаагдсан илгээлт
 *    аль хэдийн ӨӨР `done|` түлхүүртэй байна. Өдөр нэмбэл түлхүүр уртсахаас
 *    өөр юу ч өгөхгүй, харин ХУУЧИН `done|` мөрүүдтэй хэлбэр зөрнө.
 * ⚠️ `pkgKey` нь `payload.pkgKey`-ээс ирэх ЁСТОЙ (dkey-ээс таслаж авбал шинэ
 *    хэлбэрт `<pkg>|<fillMs>` болно) — `closeSubmission`-ийн ⚠️-г үз.
 */
const doneKey = (pkgKey: string, oid: number) => `${DONE_PREFIX}${pkgKey}|${oid}`;
/**
 * ⚠️ ЗӨВХӨН УГТВАРААР — тиймээс `sub|<pkg>`, `sub|<pkg>|<fillMs>`,
 *    `done|<pkg>|<oid>` ГУРВУУЛАА дамжина. Өдөр нэмэгдсэн нь энэ шалгуурыг
 *    эвдээгүй (`submission.check.mjs` тусгайлан батална).
 */
const isSubmissionKey = (dkey: string) => dkey.startsWith(SUB_PREFIX) || dkey.startsWith(DONE_PREFIX);

const isStr = (x: unknown): x is string => typeof x === 'string';
const isFin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** `[string, string]` хос — нүд/огнооны бичлэг */
const isPair = (x: unknown): x is [string, string] =>
  Array.isArray(x) && x.length >= 2 && isStr(x[0]) && isStr(x[1]);
/** `[number, string]` хос — мөрийн танигч */
const isRowKey = (x: unknown): x is [number, string] =>
  Array.isArray(x) && x.length >= 2 && Number.isInteger(x[0]) && isStr(x[1]);
/** `[oid, k, n]` — мөрийн давтамжийн дугаар (2026-10-04, `SubmissionPayload.rowOcc`) */
const isOcc = (x: unknown): x is [number, number, number] =>
  Array.isArray(x) && x.length >= 3 && Number.isInteger(x[0]) && Number.isInteger(x[1]) && Number.isInteger(x[2])
  && (x[1] as number) >= 0 && (x[2] as number) > (x[1] as number);
/**
 * Хадгалах илгээлтийн танигчийн тоо (`SubmissionPayload.nonces`).
 * ⚠️ 2026-10-04 дахин аудит (#5): 20 → 200. Мөр нь ӨДӨР бүр тусдаа (`sub|<pkg>|<fillMs>`) тул энэ нь
 *    бараг «тэр өдрийн бүх оролдлого»; 20 үед олон оролцогчтой өдөр хариу тасарсан оролдлогын танигч
 *    шахагдаж алга болоод «буугаагүй» гэж дүгнэгдэн ДАХИН илгээгдэх (давхар тоолол) байв. 200 × ~26
 *    тэмдэгт ≈ 5KB — `SUBMISSION_MAX`-д багтана.
 */
const NONCE_KEEP = 200;
/** ⚠️ 2026-10-09 (аудит): `SubmissionPayload.users`-ийн дээд тоо — хэмжээ (`SUBMISSION_MAX`) хамгаална */
const USERS_KEEP = 50;
/** Илгээгчдийн нэгдэл (жижиг үсгээр, давхардалгүй, сүүлийн `USERS_KEEP`) — `mergeSubmission`/`saveSubmission` */
function mergeUsers(...lists: (readonly (string | undefined)[] | undefined)[]): string[] {
  const out = new Set<string>();
  for (const l of lists) for (const x of l ?? []) {
    const v = String(x ?? '').trim().toLowerCase();
    if (v) out.add(v);
  }
  return [...out].slice(-USERS_KEEP);
}
/**
 * Илгээлтийг илгээсэн БҮХ данс (`users` ∪ `user`) — `hyanaltStore.authz` инженерийн шатны «өөрийн
 * илгээлтийг өөрөө хянах»-ын шалгуурт (2026-10-09, аудит). Хуучин мөр → зөвхөн `user` (хоосон бол `[]`).
 */
export const submittersOf = (p: Pick<SubmissionPayload, 'user' | 'users'>): string[] => mergeUsers(p.users, [p.user]);

/**
 * `fillMs`-ИЙН БОДИТ МУЖ — 2020-01-01-ээс өнөөдөр + 2 хоног.
 *
 * ⚠️ ЯАГААД (2026-09-04-ний аудит): `fillMs` нь батлагдахад архивын жаазны
 *    `buglusun_ognoo` болдог бөгөөд `bagtsSheet.latestWhere` нь ХАМГИЙН ИХ
 *    өдрийг «одоогийн» гэж сонгодог. Хүснэгт нь байгууллагын хэн ч засаж
 *    болдог тул `fillMs = Date.UTC(2099,0,1)` гэсэн нэг бичлэг ирээдүйн
 *    жааз үүсгэж, түүнээс хойш батлагдсан БҮХ жаазыг бөглөх хуудас,
 *    хуваарь, дашбоардаас мөнхөд нуух байлаа. Илүү туйлын утга
 *    (|ms| > 8.64e15) нь `msToDay` доторх `toISOString()`-ыг RangeError-оор
 *    унагана.
 * ⚠️ Мужаас гарсан бол payload-ыг БҮХЭЛД нь хаяна (fail-closed): илгээсэн
 *    агшин/өдөр нь мэдэгдэхгүй илгээлтийг батлах боломжгүй. Гүйцэтгэгч
 *    дахин илгээхэд `sub|` мөр дарж бичигддэг тул сэргээх зам нээлттэй.
 */
const FILL_MIN = Date.UTC(2020, 0, 1);
const FILL_SLACK = 2 * 86_400_000;
const isFillMs = (x: unknown): x is number =>
  isFin(x) && Number.isInteger(x) && x >= FILL_MIN && x <= Date.now() + FILL_SLACK;

/**
 * Түүхий JSON → шалгагдсан `SubmissionPayload`; эвдэрсэн бол `null`.
 *
 * ⚠️ FillNew-ийн `parseDraft`-тай ИЖИЛ ЁС: хүснэгт нь org доторх хэн ч засаж
 * болох тул итгэл нь localStorage-аас илүү байх ёсгүй. Нэг талбарын алдаа
 * бусад засварыг устгах ёсгүй — эвдэрсэн ХЭСГИЙГ л хаяна:
 *   · `v !== 1`, `pkgKey` хоосон, `cells` массив биш, `at` тоо биш, `fillMs`
 *     бодит мужаас гадуур (`isFillMs`) → `null` (илгээлтийн мөн чанар алга —
 *     ямар багцад, хэзээ гэдэг нь мэдэгдэхгүй);
 *   · `dates`/`adds`/`rowKeys` массив биш → хоосон массив (тэр хэсэг нь л орхигдоно);
 *   · массив доторх хэлбэргүй бичлэг → тэр бичлэг л хаягдана;
 *   · `adds`-ийн oid САЛАНГИД СӨРӨГ БҮХЭЛ байх ёстой (parseDraft-ийн дүрэм):
 *     давхардсан дугаартай хоёр мөр нэг `${oid}:${b}` нүдийг хуваалцаж, нэгд
 *     нь бичсэн обьём нөгөөд нь ч орно — зөрчилтэй БИЧЛЭГИЙГ л хаяна;
 *   · `asOf`/`base` тоо биш → `null` (0 БИШ — `null ≠ 0`).
 */
export function parseSubmission(raw: string): SubmissionPayload | null {
  try {
    const d = JSON.parse(raw) as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    /* ⚠️ `v: 2` ЗААВАЛ `mode: 'inc'`-тэй (2026-09-25): горим нь тоог хэрхэн
       уншихыг шийддэг тул тодорхойгүй бол ТААМАГЛАХГҮЙ — хаяна. */
    const inc = d.mode === 'inc';
    if (d.v !== 1 && d.v !== 2) return null;
    if (d.v === 2 && !inc) return null;
    if (!isStr(d.pkgKey) || !d.pkgKey) return null;
    if (!Array.isArray(d.cells)) return null;
    if (!isFin(d.at) || !isFillMs(d.fillMs)) return null;

    const cells = (d.cells as unknown[]).filter(isPair).map(([k, v]): [string, string] => [k, v]);
    const dates = (Array.isArray(d.dates) ? (d.dates as unknown[]) : [])
      .filter(isPair).map(([k, v]): [string, string] => [k, v]);
    /* ⚠️ Хуудасны дарааллаар (`byPageOrder`) — өмнө нь буруу дараалалтай
       нэгтгэгдэж хадгалагдсан payload-ыг ч унших агшинд засна. */
    const rowKeys = byPageOrder((Array.isArray(d.rowKeys) ? (d.rowKeys as unknown[]) : [])
      .filter(isRowKey));

    const seen = new Set<number>();
    const adds: NewRow[] = [];
    for (const a of Array.isArray(d.adds) ? (d.adds as unknown[]) : []) {
      if (!a || typeof a !== 'object') continue;
      const r = a as Record<string, unknown>;
      const o = Number(r.oid);
      if (!Number.isInteger(o) || o >= 0 || seen.has(o)) continue;
      seen.add(o);
      adds.push({
        oid: o,
        parentNo: isStr(r.parentNo) ? r.parentNo : '',
        parentWork: isStr(r.parentWork) ? r.parentWork : '',
        parentIdx: Number.isInteger(r.parentIdx) ? (r.parentIdx as number) : -1,
        no: isStr(r.no) ? r.no : '',
        work: isStr(r.work) ? r.work : '',
        vol: isFin(r.vol) ? r.vol : null,
        unit: isFin(r.unit) ? r.unit : null,
      });
    }

    const out: SubmissionPayload = {
      v: inc ? 2 : 1,
      ...(inc ? { mode: 'inc' as const } : {}),
      pkgKey: d.pkgKey,
      user: isStr(d.user) ? d.user.toLowerCase() : '',
      at: d.at,
      fillMs: d.fillMs,
      base: isFin(d.base) ? d.base : null,
      asOf: isFin(d.asOf) ? d.asOf : null,
      cells,
      dates,
      adds,
      rowKeys,
    };
    if (Number.isInteger(d.archiveOid) && (d.archiveOid as number) > 0) out.archiveOid = d.archiveOid as number;
    if (isFin(d.approvedAt)) out.approvedAt = d.approvedAt;
    /* ⚠️ 2026-10-04 (#2/#3): давтамжийн дугаар ба илгээлтийн танигч — эвдэрсэн бичлэгийг л хаяна */
    const occ = Array.isArray(d.rowOcc) ? (d.rowOcc as unknown[]).filter(isOcc).map((e): [number, number, number] => [e[0], e[1], e[2]]) : [];
    if (occ.length) out.rowOcc = occ;
    const nonces = Array.isArray(d.nonces) ? (d.nonces as unknown[]).filter((x): x is string => isStr(x) && x.length > 0 && x.length <= 64) : [];
    if (nonces.length) out.nonces = nonces.slice(-NONCE_KEEP);
    /* ⚠️ 2026-10-09 (аудит): илгээгчдийн жагсаалт (`SubmissionPayload.users`) — эвдэрсэн элементийг л хаяна */
    const users = Array.isArray(d.users)
      ? [...new Set((d.users as unknown[]).filter((x): x is string => isStr(x) && x.trim().length > 0 && x.length <= 128)
        .map((x) => x.trim().toLowerCase()))].slice(-USERS_KEEP)
      : [];
    if (users.length) out.users = users;
    if (d.regPending === true) out.regPending = true;
    if (d.residual === true) out.residual = true;
    /* ⚠️ 2026-10-12 (A9): үлдэгдлийн эх батлалт — бүх талбар хүчинтэй байж л хүлээн авна */
    const ro = d.residualOf as Record<string, unknown> | undefined;
    if (out.residual && ro && typeof ro === 'object' && Number.isInteger(ro.row) && (ro.row as number) > 0
      && Number.isInteger(ro.archiveOid) && (ro.archiveOid as number) >= 0 && isStr(ro.day) && /^\d{4}-\d{2}-\d{2}$/.test(ro.day))
      out.residualOf = { row: ro.row as number, archiveOid: ro.archiveOid as number, day: ro.day as string };
    /* ⚠️ 2026-10-09 (R2): «архивлаж байна» тэмдэг — бүх талбар бодит тоо байж л хүлээн авна */
    const ar = d.archiving as Record<string, unknown> | undefined;
    if (ar && typeof ar === 'object' && isFin(ar.at) && isFin(ar.startedAt) && Number.isInteger(ar.maxOid0)
      && (ar.maxOid0 as number) >= 0 && isFin(ar.fillMs) && Number.isInteger(ar.n) && (ar.n as number) > 0) {
      const mk: ArchivingMark = { at: ar.at, startedAt: ar.startedAt, maxOid0: ar.maxOid0 as number, fillMs: ar.fillMs, n: ar.n as number };
      /* ⚠️ 2026-10-09 (R2-c): таних дээж — эвдэрсэн бичлэгийг л хаяна (тэмдэг өөрөө хүчинтэй хэвээр) */
      if (isStr(ar.rootNo) && ar.rootNo.length <= 64) mk.rootNo = ar.rootNo;
      const pr = Array.isArray(ar.probe)
        ? (ar.probe as unknown[]).filter((e): e is [number, string, number | string | null] =>
          Array.isArray(e) && e.length === 3 && Number.isInteger(e[0]) && (e[0] as number) >= 0 && (e[0] as number) < (ar.n as number)
          && isStr(e[1]) && e[1].length > 0 && e[1].length <= 128
          && (e[2] === null || isFin(e[2]) || (isStr(e[2]) && e[2].length <= 256)))
        : [];
      if (pr.length) mk.probe = pr.slice(0, PROBE_MAX).map((e): [number, string, number | string | null] => [e[0], e[1], e[2]]);
      /* ⚠️ 2026-10-09: тавьсан хүн/сешн ба дамжсан агуулгын хуулбар — эвдэрсэн хэсгийг л хаяна */
      if (isStr(ar.by) && ar.by.length <= 128) mk.by = ar.by.toLowerCase();
      if (isStr(ar.sid) && ar.sid.length <= 64) mk.sid = ar.sid;
      /* ⚠️ 2026-10-26: `prev`-ийн мөрийн үе (v3 мета) */
      if (isFin(ar.prevGen)) mk.prevGen = ar.prevGen;
      const pv = ar.prev as Record<string, unknown> | undefined;
      if (pv && typeof pv === 'object' && Array.isArray(pv.cells) && Array.isArray(pv.rowKeys)) {
        const snap: ArchSnap = {
          cells: (pv.cells as unknown[]).filter(isPair).map(([k, v]): [string, string] => [k, v]),
          rowKeys: byPageOrder((pv.rowKeys as unknown[]).filter(isRowKey)),
        };
        const so = Array.isArray(pv.rowOcc) ? (pv.rowOcc as unknown[]).filter(isOcc).map((e): [number, number, number] => [e[0], e[1], e[2]]) : [];
        if (so.length) snap.rowOcc = so;
        mk.prev = snap;
      }
      out.archiving = mk;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * ХУРИМТЛАГДСАН илгээлт: хуучин payload дээр шинэ diff-ийг НЭГТГЭНЭ.
 *
 * ⚠️ ЯАГААД нэгтгэх, дарахгүй: багцын хяналтын мөр батлагдаагүй байхад
 * компани дахин илгээвэл (жишээ нь инженер буцаасны дараа нэг нүд засаад)
 * ШИНЭ diff нь зөвхөн тэр нэг нүд — хуучин 40 нүдийг дарвал хянагч
 * «40 нүд алга болов» гэж харна, батлахад ч архивт ордоггүй.
 *
 * Дүрэм: cells/dates — түлхүүрээр, шинэ нь дарна (⚠️ 2026-09-25: `mode: 'inc'`
 * үед cells нь НИЙЛБЭР — `sumInc`; горим зөрвөл throw); adds — oid-оор, шинэ нь
 * дарна (хуучин байрлал хэвээр — эцэг/дүү дараалал хадгалагдана), ГЭХДЭЭ ижил
 * oid дээр ӨӨР мөр ирвэл дарахгүй, шинэ сул oid авна (доорх ⚠️); rowKeys —
 * oid-оор нэгтгэж ХУУДАСНЫ ДАРААЛЛААР (oid өсөхөөр) буцаана (`byPageOrder`);
 * asOf — шинэ ?? хуучин ?? null; base — мөн адил (мэдээлэл);
 * pkgKey/user/at/fillMs — шинэ. `archiveOid`/`approvedAt` ОРОХГҮЙ: нэгтгэсэн
 * илгээлт нь идэвхтэй (батлагдаагүй) — хаах үед `closeSubmission` нэмнэ.
 *
 * Оролтыг ӨӨРЧЛӨХГҮЙ (шинэ объект/массив).
 */
export function mergeSubmission(
  prev: SubmissionPayload | null,
  next: Omit<SubmissionPayload, 'v'>,
): SubmissionPayload {
  /*
   * ⚠️ ГОРИМ ХОЛИХГҮЙ (2026-09-25, `SubmissionPayload.mode`-ийн ⚠️). Хуучин
   *    (НИЙТ) payload дээр НЭМЭЛТ нэгтгэвэл «55» ба «15» нэг массивт ялгагдахгүй
   *    орж, батлахад аль нэг нь буруу уншигдана. Дуудагч (`FillNew.publish`)
   *    нэгтгэхээс ӨМНӨ нэг горимд хөрвүүлэх ёстой — энд ЧИМЭЭГҮЙ таамаглахгүй.
   */
  const inc = next.mode === 'inc';
  if (prev && (prev.mode === 'inc') !== inc)
    throw new Error(tr('Илгээлтийн горим зөрсөн (нэмэлт ↔ нийт) — нэгтгэсэнгүй. Хуудсыг дахин ачаална уу.'));
  const adds = new Map<number, NewRow>();
  for (const a of prev?.adds ?? []) adds.set(a.oid, a);

  /*
   * ⚠️ ТҮР OID-ИЙН МӨРГӨЛДӨӨН (2026-09-08-ны аудитын CRITICAL олдвор).
   *
   * Нэмсэн мөрийн түр `oid` нь дуудагчийн модуль дахь тоолуураас гардаг
   * бөгөөд ТЭР ТООЛУУР ХУУДАС АЧААЛАГДАХ БҮРД −1-ЭЭС ЭХЭЛНЭ. Тиймээс
   * өдөр 1-д мөр нэмж илгээгээд хуудсаа дахин нээж дахин мөр нэмэхэд шинэ
   * мөр өмнөх илгээлтийн мөртэй ИЖИЛ (−1) дугаар авч болно. Урьд нь энд
   * `adds.set(a.oid, a)` гэж ДАРДАГ байсан тул өмнөх өдрийн нэмсэн мөр
   * (нэр, обьём, эцэг) илгээлтээс чимээгүй АЛГА болж, түүний `oid:b`
   * нүднүүд ч шинэ мөрийн утгаар солигддог байв — хэрэглэгчид ямар ч
   * анхааруулга гардаггүй (`unmoved` нь зөвхөн эерэг oid-ийг барьдаг).
   *
   * Дуудагч талд тоолуурыг илгээлтээс нь түлхэх засвар хийгдсэн боловч энэ
   * давхарга ӨӨРӨӨ бас хамгаалагдсан байх ёстой: ижил oid дээр АГУУЛГА нь
   * зөрсөн (өөр № / өөр ажил / өөр эцэг) мөр ирвэл ДАРАХГҮЙ, харин `next`-
   * ийн мөрд шинэ, сул сөрөг oid оноож, түүний нүд/огнооны түлхүүрийг ХАМТ
   * зөөнө. Ингэснээр хоёр мөр хоёулаа хадгалагдана.
   */
  let freeOid = -1;
  for (const o of adds.keys()) if (o <= freeOid) freeOid = o - 1;
  for (const [o] of next.rowKeys) if (o <= freeOid) freeOid = o - 1;
  /** Мөргөлдсөн түр oid → шинээр олгосон сул oid */
  const remap = new Map<number, number>();
  /** Хоёр нэмсэн мөр НЭГ мөр мөн үү (нэр · № · эцэг таарвал ижил) */
  const sameRow = (a: NewRow, b: NewRow) =>
    a.no === b.no && a.work === b.work && a.parentNo === b.parentNo && a.parentWork === b.parentWork;
  for (const a of next.adds) {
    const old = adds.get(a.oid);
    if (old && !sameRow(old, a)) {
      const fresh = freeOid;
      freeOid -= 1;
      remap.set(a.oid, fresh);
      adds.set(fresh, { ...a, oid: fresh });
      continue;
    }
    adds.set(a.oid, a);
  }

  /** `${oid}:…` түлхүүрийн oid-г зөөнө (зөөх шаардлагагүй бол хэвээр) */
  const fixKey = (k: string): string => {
    if (!remap.size) return k;
    const at = k.indexOf(':');
    if (at < 0) return k;
    const to = remap.get(Number(k.slice(0, at)));
    return to == null ? k : `${to}${k.slice(at)}`;
  };

  const cells = new Map<string, string>(prev?.cells ?? []);
  /*
   * ⚠️ НЭМЭЛТИЙН ГОРИМД НИЙЛҮҮЛНЭ, ДАРАХГҮЙ (2026-09-25). Дахин илгээхэд
   *    `FillNew`-ийн дэлгэц нь архив + ӨМНӨХ илгээлтийн давхарлалт тул шинэ
   *    нэмэлт нь тэр давхарласан нийтээс хойшхи хэсэг — өдрийн нийт нэмэлт =
   *    өмнөх + шинэ. Дарвал өглөөний «+15» алга болно. Тэг болсон нүдийг хаяна.
   */
  for (const [k0, v] of next.cells) {
    const k = fixKey(k0);
    if (!inc) { cells.set(k, v); continue; }
    const s = cells.has(k) ? sumInc(cells.get(k), v) : v;
    const d = parseInc(s);
    if (!d || (d.n === 0 && d.p === 0)) cells.delete(k);
    else cells.set(k, s);
  }
  const dates = new Map<string, string>(prev?.dates ?? []);
  for (const [k, v] of next.dates) dates.set(fixKey(k), v);
  const rowKeys = new Map<number, string>(prev?.rowKeys ?? []);
  for (const [o, k] of next.rowKeys) rowKeys.set(remap.get(o) ?? o, k);
  /* ⚠️ 2026-10-04 (#2): давтамжийн дугаар — oid-оор нэгтгэнэ, шинэ нь ялна. Хуучин талд
     байгаагүй oid-д (хуучин илгээлт) дугаар зохиохгүй — `mapOldOids` хоёрдмол гэж үзнэ. */
  const occ = new Map<number, [number, number, number]>();
  for (const e of prev?.rowOcc ?? []) occ.set(e[0], [e[0], e[1], e[2]]);
  for (const e of next.rowOcc ?? []) { const o = remap.get(e[0]) ?? e[0]; occ.set(o, [o, e[1], e[2]]); }
  /* ⚠️ 2026-10-04 (#3): илгээлтийн танигчууд хуримтлагдана (сүүлийн `NONCE_KEEP`) */
  const nonces = [...new Set([...(prev?.nonces ?? []), ...(next.nonces ?? [])])].slice(-NONCE_KEEP);
  /*
   * ⚠️ 2026-10-09: «АРХИВЛАЖ БАЙНА» ТЭМДЭГ ДАМЖИНА (`SubmissionPayload.archiving`-ийн ⚠️ — урьд нь хаягддаг байв).
   *    Анх дамжихдаа (`at` = өмнөх payload-ынх) архивлаж буй агуулгын хуулбарыг (`prev`) хадгална; аль хэдийн
   *    дамжсан бол хуучин хуулбар хэвээр (тэр л архивлагдаж байсан агуулга). Нэмэлт ба хуучин горимд адил.
   */
  let archiving: ArchivingMark | undefined;
  if (prev?.archiving) {
    const am = prev.archiving;
    archiving = am.prev || am.at !== prev.at
      ? { ...am }
      : {
        ...am,
        prev: {
          cells: prev.cells.map(([k, v]): [string, string] => [k, v]),
          rowKeys: prev.rowKeys.map(([o, l]): [number, string] => [o, l]),
          ...(prev.rowOcc?.length ? { rowOcc: prev.rowOcc.map((e): [number, number, number] => [e[0], e[1], e[2]]) } : {}),
        },
      };
  }
  return {
    v: inc ? 2 : 1,
    ...(inc ? { mode: 'inc' as const } : {}),
    pkgKey: next.pkgKey,
    /* ⚠️ Жижиг үсгээр — `parseSubmission`-тэй ижил инвариант, дуудагчид найдахгүй */
    user: next.user.toLowerCase(),
    at: next.at,
    fillMs: next.fillMs,
    base: next.base ?? prev?.base ?? null,
    asOf: next.asOf ?? prev?.asOf ?? null,
    cells: [...cells].map(([k, v]): [string, string] => [k, v]),
    dates: [...dates].map(([k, v]): [string, string] => [k, v]),
    adds: [...adds.values()].map((a) => ({ ...a })),
    /* ⚠️ Хуудасны дарааллаар — `buildOidMap`-ийн `shift()` дараалалд тулгуурладаг
       (`byPageOrder`-ийн ⚠️). Map нь хуучны дарааллыг хадгалж шинийг төгсгөлд залгадаг. */
    rowKeys: byPageOrder(rowKeys),
    ...(occ.size ? { rowOcc: [...occ.values()].filter(([o]) => rowKeys.has(o)).sort((a, b) => a[0] - b[0]) } : {}),
    ...(nonces.length ? { nonces } : {}),
    ...(archiving ? { archiving } : {}),
    /* ⚠️ 2026-10-09 (аудит): илгээгчид ХУРИМТЛАГДАНА (`SubmissionPayload.users`) — хуучин `user` ч орно */
    ...(() => {
      const users = mergeUsers(prev?.users, [prev?.user], next.users, [next.user]);
      return users.length ? { users } : {};
    })(),
  };
}

/**
 * АРХИВЛАГДСАН ХЭСГИЙГ ИДЭВХТЭЙ ИЛГЭЭЛТЭЭС ХАСНА — нэмэлтийн горимд л (2026-09-25).
 *
 * ⚠️ ЯАГААД (давхардлаас сэргийлэх): батлах явцад гүйцэтгэгч ДАХИН илгээвэл
 *    `mergeSubmission` нь архивлаж буй агуулгыг (`archived`) шинэ нэмэлттэй
 *    НИЙЛҮҮЛСЭН мөр (`cur`) болгоно; `closeSubmission` `at` зөрсөн тул хаахгүй
 *    (`changed`). Хуучин (НИЙТ) горимд тэр мөрийг дахин батлах нь аюулгүй байсан
 *    (дахин ОРЛУУЛНА), харин нэмэлтийн горимд `archived`-ийн нэмэлт ХОЁР ДАХЬ
 *    удаагаа нэмэгдэнэ. Тиймээс үлдэгдэл = `cur − archived` (нүд бүрээр).
 *
 * Түлхүүр: эхлээд ижил `${oid}:${b}`; олдохгүй бол (дахин илгээлт шинэ жааз
 * руу зөөгдсөн) хоёр payload-ын `rowKeys` шошгоор ДАРААЛЛААР хослуулна
 * (`sheetFrame.buildOidMap`-ийн дүрэм). Хослох аргагүй түлхүүр үлдвэл `null` —
 * дуудагч ил анхааруулна (таамаглаж хасвал буруу нүднээс хасна).
 * ⚠️ `dates` нь ҮНЭМЛЭХҮЙ утга (дахин буулгах нь идемпотент) — хэвээр.
 * ⚠️ Хоёулаа `mode: 'inc'` биш бол `null` (хуучин горимд хасах шаардлагагүй).
 * Оролтыг ӨӨРЧЛӨХГҮЙ.
 */
export function residualAfterArchive(
  cur: SubmissionPayload,
  archived: SubmissionPayload,
): SubmissionPayload | null {
  if (cur.mode !== 'inc' || archived.mode !== 'inc') return null;
  const cells = new Map<string, string>(cur.cells);
  /* Шошго → oid-ууд (хуудасны дарааллаар) — давхардсан шошгыг дарааллаар хослуулна */
  const byLabel = (keys: [number, string][]) => {
    const m = new Map<string, number[]>();
    for (const [o, l] of byPageOrder(keys)) {
      const a = m.get(l);
      if (a) a.push(o); else m.set(l, [o]);
    }
    return m;
  };
  const aLab = byLabel(archived.rowKeys ?? []);
  const cLab = byLabel(cur.rowKeys ?? []);
  const aLabelOf = new Map<number, [string, number]>();
  for (const [l, os] of aLab) os.forEach((o, i) => aLabelOf.set(o, [l, i]));
  const curOids = new Set<number>((cur.rowKeys ?? []).map(([o]) => o));
  /*
   * ⚠️ 2026-10-04 аудит (#2): СИЙРЭГ жагсаалтын i дэх ↔ i дэх хослол давхардсан шошгод
   *    ӨӨР мөрийг хослуулж болно (`sheetFrame.buildOidMap`-ийн ⚠️). Хоёр payload-д
   *    давтамжийн дугаар (`rowOcc` — `[oid, k, n]`) байвал (шошго, k, n)-ээр ЯГ
   *    хослуулна; эс бөгөөс ЗӨВХӨН шошгын тоо хоёр талд ТЭНЦҮҮ (хоёрдмол биш) үед
   *    дарааллаар — тэнцүү биш бол `null` (дуудагч ил анхааруулна).
   */
  const aOcc = new Map<number, [number, number]>((archived.rowOcc ?? []).map((e): [number, [number, number]] => [e[0], [e[1], e[2]]]));
  const cByOcc = new Map<string, number>();
  /* ⚠️ 2026-10-04 дахин аудит (#10): шошгыг Map-аар (урьд нь мөр бүрд `find` — O(n²)) */
  const cLabel = new Map<number, string>(cur.rowKeys ?? []);
  for (const e of cur.rowOcc ?? []) {
    const l = cLabel.get(e[0]);
    if (l != null) cByOcc.set(`${l}\u0000${e[1]}\u0000${e[2]}`, e[0]);
  }
  const pairTo = (oid: number): number | undefined => {
    const hit = aLabelOf.get(oid);
    if (!hit) return undefined;
    const ao = aOcc.get(oid);
    if (ao) {
      const to = cByOcc.get(`${hit[0]}\u0000${ao[0]}\u0000${ao[1]}`);
      if (to != null) return to;
    }
    const cs = cLab.get(hit[0]);
    if (!cs || cs.length !== (aLab.get(hit[0])?.length ?? -1)) return undefined;
    return cs[hit[1]];
  };
  for (const [k, v] of archived.cells) {
    const at = k.indexOf(':');
    if (at <= 0) return null;
    const oid = Number(k.slice(0, at));
    let key = k;
    /* ⚠️ Ижил жааз (`cur.rowKeys`-д тэр oid бий) эсвэл түр (сөрөг) oid → ижил
       түлхүүр. Эс бөгөөс шошгоор зөөнө; зөөж чадахгүй бол ЗОГСОНО. */
    if (oid >= 0 && !curOids.has(oid) && !cells.has(k)) {
      const to = pairTo(oid);
      if (to == null) return null;
      key = `${to}${k.slice(at)}`;
    }
    /* ⚠️ `cur`-д түлхүүр БАЙХГҮЙ = нийлбэр нь 0 болж хаягдсан (`mergeSubmission`)
       → үлдэгдэл нь `0 − архивласан` (сөрөг залруулга), 0 БИШ. */
    const s = sumInc(cells.get(key), negInc(v));
    const d = parseInc(s);
    if (!d || (d.n === 0 && d.p === 0)) cells.delete(key);
    else cells.set(key, s);
  }
  return { ...cur, cells: [...cells].map(([k, v]): [string, string] => [k, v]) };
}

/* ───────────────────────── ArcGIS — хүснэгттэй харьцах ───────────────────────── */

/** Алдааны объектоос хүнд уншигдах мессеж */
const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message || 'ArcGIS error';
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; description?: unknown };
    const m = o.message ?? o.description;
    if (m != null && String(m)) return String(m);
  }
  return String(e ?? 'ArcGIS error');
};

type RowAttrs = { objectid?: number; dkey?: string; at?: number; payload?: string };

/**
 * ХАРИУ — «олдсонгүй» ба «уншиж чадсангүй» хоёрыг ЯЛГАНА.
 *
 * ⚠️ ЯАГААД (2026-09-04-ний аудитын CRITICAL олдвор): `loadSubmissionByOid`
 *    нь алдаа гарсан ч, мөр байхгүй ч ялгаагүй `null` буцаадаг байв.
 *    `hyanaltStore.archiveSubmission` тэр `null`-ыг «хуучин (legacy) мөр —
 *    жааз нь аль хэдийн архивт бий» гэж тайлбарладаг тул сүлжээ түр тасрах,
 *    токен дуусах, `tableUrl` null буцаах агшинд БАТЛАГДСАН илгээлт архивт
 *    ОГТ БИЧИГДЭЛГҮЙ хяналтын мөр «Шилжүүлсэн» болж, дахин батлах зам
 *    хаагддаг байлаа — компанийн бүтэн өдрийн гүйцэтгэл ул мөргүй алга
 *    болно, хаана ч алдаа үлдэхгүй.
 *
 * Тиймээс БИЧИХ шийдвэр гаргадаг дуудагч (`archiveSubmission`, `publish`)
 * `read*` хувилбарыг ашиглана; зөвхөн ХАРУУЛАХ зам (`load*`) чимээгүй
 * `null`-аараа хэвээр.
 */
export type SubRead =
  | { ok: true; sub: StagedSubmission | null }
  | { ok: false; error: string };

/**
 * Хүснэгтийн мөр → уншилтын үр дүн.
 *   · мөр огт алга                        → `{ok:true, sub:null}` (legacy зам зөвшөөрөгдөнө)
 *   · `dkey` нь `sub|`/`done|` БИШ        → `{ok:true, sub:null}` (ноорогийн мөр — илгээлт биш)
 *   · илгээлтийн мөр атал payload задрахгүй → `{ok:false}` (ЭНЭ нь илгээлт мөн
 *     боловч уншигдсангүй — legacy гэж үзвэл гүйцэтгэл алга болно)
 */
async function readRow(a: RowAttrs | undefined, rowsOf?: ReadonlyMap<number, Attrs[]>): Promise<SubRead> {
  if (!a || typeof a.objectid !== 'number') return { ok: true, sub: null };
  const dkey = String(a.dkey ?? '');
  if (!isSubmissionKey(dkey)) return { ok: true, sub: null };
  const h = a.payload ? parseHead(String(a.payload)) : null;
  if (!h) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', a.objectid) };
  /* ⚠️ 2026-10-26: `gens`-тэй толгой — нүд нь `n:sub:<OBJECTID>` мөрөөс (MVCC); уншиж чадаагүй бол АЛДАА (fail-closed) */
  let payload = h.p;
  if (h.gens) {
    try {
      payload = await assemble(a.objectid, h, rowsOf?.get(a.objectid));
    } catch (e) {
      return { ok: false, error: tr('Илгээлт №{0}-ийн мөрүүд уншигдсангүй: {1}', a.objectid, errMsg(e)) };
    }
  }
  /* Мөрийн `at` талбар нь payload.at-тай адил боловч хуучин/эвдэрсэн мөрд
     байхгүй байж болно — payload-оос нөхнө. */
  const at = isFin(a.at) ? Number(a.at) : payload.at;
  return { ok: true, sub: { oid: a.objectid, at, done: dkey.startsWith(DONE_PREFIX), payload } };
}

/**
 * ТОЛГОЙН PAYLOAD (2026-10-26) — v1/v2 (нүдтэй, хуучин эсвэл PHASE A-ийн давхар хуулбар) эсвэл v3 (ЗӨВХӨН мета, нүдгүй).
 * `gens` = баталгаажсан мөрийн үеүд (байвал мөр эх сурвалж); хуучин таб payload-ыг дахин бичихэд `gens` хаягдана — тэр
 * үед payload-ын нүд эх сурвалж (шинэ бичигч дахин мөр болгоно). `meta` — v3 (нүд нь энд ХООСОН, мөрөөс угсрагдана).
 */
export type SubHead = { p: SubmissionPayload; gens: number[] | null; meta: boolean };
export function parseHead(raw: string): SubHead | null {
  let d: Record<string, unknown> | null;
  try { d = JSON.parse(raw) as Record<string, unknown> | null; } catch { return null; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const gens = Array.isArray(d.gens) ? (d.gens as unknown[]).filter(isFin) : null;
  if (d.v === 3) {
    if (!gens) return null;
    const inc = d.mode === 'inc';
    /* ⚠️ 2026-10-26: `rowKeys`/`rowOcc` нь мета-д НҮДГҮЙ oid-ийнх л (`headRaw`-ийн ⚠️) — `assembleRows` мөрийнхтэй нийлүүлнэ */
    const p = parseSubmission(JSON.stringify({
      ...d, v: inc ? 2 : 1, cells: [], dates: [],
      rowKeys: Array.isArray(d.rowKeys) ? d.rowKeys : [], rowOcc: Array.isArray(d.rowOcc) ? d.rowOcc : [],
    }));
    return p ? { p, gens, meta: true } : null;
  }
  const p = parseSubmission(raw);
  return p ? { p, gens, meta: false } : null;
}
/** PHASE A — payload-д v2 бүтэн хуулбар (шинэчлээгүй табд) багтвал; `false` = зөвхөн мета (тулгалтын дараа) */
export const SUB_DUAL = true;
/**
 * Толгойн payload-ыг бичих хэлбэр: `gens`-гүй → хуучин (v1/v2) ЯГ; `gens`-тэй — нүд гарт байвал (`!meta`) ба багтвал v2 +
 * `gens` (давхар хуулбар), эс бөгөөс v3 МЕТА (нүд · `rowKeys` · `rowOcc` · `archiving.prev` хасагдана; `prevGen` үлдэнэ).
 */
export function headRaw(p: SubmissionPayload, gens: readonly number[] | null, meta = false): string {
  const full: Record<string, unknown> = p.mode === 'inc' ? { ...p, v: 2, mode: 'inc' } : { ...p, v: 1 };
  if (!gens) return JSON.stringify(full);
  if (!meta && SUB_DUAL) {
    const s = JSON.stringify({ ...full, gens });
    if (s.length <= SUBMISSION_MAX) return s;
  }
  const rest: Record<string, unknown> = { ...full };
  for (const k of ['cells', 'dates', 'rowKeys', 'rowOcc']) delete rest[k];
  /* ⚠️ 2026-10-26: НҮДГҮЙ oid-ийн `rowKeys`/`rowOcc` (жиш. дахин илгээлтээр нийлбэр нь тэг болж хасагдсан нүдний мөр) мөрөнд
     илэрхийлэгдэхгүй тул мета-д үлдэнэ — `mergeSubmission` тэднийг хадгалдаг бөгөөд `residualAfterArchive` архивласан нүдийг
     тэр шошгоор тулгадаг (алга бол «хасах боломжгүй» гэж батлалт зогсдог байв) */
  const used = usedOids(p);
  const xk = p.rowKeys.filter(([o]) => !used.has(o));
  const xo = (p.rowOcc ?? []).filter(([o]) => !used.has(o));
  if (xk.length) rest.rowKeys = xk;
  if (xo.length) rest.rowOcc = xo;
  const ar = p.archiving ? { ...p.archiving } : undefined;
  /* ⚠️ 2026-10-26: хуулбарыг ЗӨВХӨН мөрийн үетэй (`prevGen`) бол хасна — үегүй бол мета-д ч үлдэнэ (эс бөгөөс
     «архивлаж буй» агуулга алга болж `residualAfterArchive` хасах зүйлгүй — давхар тоолол) */
  if (ar && ar.prevGen != null) delete ar.prev;
  return JSON.stringify({ ...rest, v: 3, ...(ar ? { archiving: ar } : {}), gens });
}

/**
 * МӨРИЙН КОДЛОГЧ АГУУЛГЫГ ЯГ СЭРГЭЭХ ҮҮ (⚠️ 2026-10-26, «өгөгдөл алдагдахгүй» — хэрэглэгчийн тэргүүн шаардлага). Нүд ·
 * огноо ЯГ ижил, ашиглагдаж буй oid-ийн `rowKeys`/`rowOcc` ижил байх ёстой. ЯАГААД: хуучин НИЙТ (v1) илгээлтэд `''` ба
 * `'%0'` нүд бий (амьд 191: `done|b1_9f|128` г.м.) — мөрийн баганад `'%0'` нь `'0'` болж (НИЙТ горимд хувь 0 ≠ обьём 0),
 * `''` алга болдог байв. Алдагдалтай бол мөр рүү БИЧИХГҮЙ — payload эх сурвалж хэвээр (`saveSubmissionInner` ·
 * `migrateSubmissionRow`).
 */
export function subRowsLossless(p: Pick<SubmissionPayload, 'cells' | 'dates' | 'rowKeys' | 'rowOcc'>, frame: Frame | null): boolean {
  const want = subToRows({ cells: p.cells, dates: p.dates, rowKeys: p.rowKeys, ...(p.rowOcc ? { rowOcc: p.rowOcc } : {}), asOf: null }, frame);
  const attrs: Attrs[] = [...want].map(([k, a], i): Attrs => ({ ...a, mur_key: k, at: 1, objectid: i + 1 }));
  const c = subFromRows(pickGeneration(attrs, [1]));
  if (cellSig(c) !== cellSig(p)) return false;
  const used = usedOids(p);
  const rk = (l: readonly [number, string][]) => JSON.stringify(l.filter(([o]) => used.has(o)).map(([o, s]) => `${o}=${s}`).sort());
  const ro = (l: readonly [number, number, number][] | undefined) => JSON.stringify((l ?? []).filter(([o]) => used.has(o)).map((e) => e.join(',')).sort());
  return rk(c.rowKeys) === rk(p.rowKeys) && ro(c.rowOcc) === ro(p.rowOcc);
}
/** Нүд/огноонд хэрэглэгдэж буй oid */
function usedOids(p: Pick<SubmissionPayload, 'cells' | 'dates'>): Set<number> {
  const s = new Set<number>();
  for (const [k] of [...p.cells, ...p.dates]) { const o = Number(k.slice(0, k.indexOf(':'))); if (Number.isInteger(o)) s.add(o); }
  return s;
}
/** Хоёр тоо бараг тэнцүү (мөрийн `Double` ↔ 12 оронтой бичлэг, `bagtsSheet.numStr`) */
const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
/** Нэг нэмэлтийн нүдийг кодлогчийн хэлбэрт — утга (n, p) ИЖИЛ бол; тэг/хоосон нэмэлт → `null` (хасна) */
function normInc(v: string): string | null {
  const x = parseInc(v);
  if (!x || (x.n === 0 && x.p === 0)) return null;
  const c = cellToCols(v);
  const s = c ? colsToCell(c.ob, c.act, c.niit, c.blank) : null;
  const y = s != null ? parseInc(s) : null;
  return s != null && y && close(x.n, y.n) && close(x.p, y.p) ? s : v;
}
/**
 * НЭМЭЛТИЙН ГОРИМЫН НҮДИЙГ ХЭВШҮҮЛНЭ (⚠️ 2026-10-26) — УТГА (n, p) ӨӨРЧЛӨГДӨХГҮЙ: тэг/хоосон нэмэлтийг хасна
 * (`mergeSubmission`-ий «тэг болсон нүдийг хаяна» ЯГ дүрэм — нэмэлт 0 нь юу ч нэмэхгүй), бичлэгийг мөрийн кодлогчийн хэлбэрт
 * («15.50» → «15.5»). «Архивлаж буй» хуулбар (`archiving.prev`) ч адил. НИЙТ (v1) горимд ХӨНДӨХГҮЙ — тэнд `''`/`'%0'` нь утга.
 */
export function normIncCells(p: SubmissionPayload): SubmissionPayload {
  if (p.mode !== 'inc') return p;
  const norm = (l: readonly [string, string][]): [string, string][] => {
    const out: [string, string][] = [];
    for (const [k, v] of l) { const s = normInc(v); if (s != null) out.push([k, s]); }
    return out;
  };
  const out: SubmissionPayload = { ...p, cells: norm(p.cells) };
  if (p.archiving?.prev) out.archiving = { ...p.archiving, prev: { ...p.archiving.prev, cells: norm(p.archiving.prev.cells) } };
  return out;
}
/** Хоёр агуулга ИЖИЛ үү — ЯГ, эсвэл нэмэлтийн горимд хэвшүүлсний дараа (`normIncCells`) */
function sameContent(a: SubmissionPayload, b: SubmissionPayload): boolean {
  if (cellSig(a) === cellSig(b)) return true;
  return a.mode === 'inc' && b.mode === 'inc' && cellSig(normIncCells(a)) === cellSig(normIncCells(b));
}

/** `gens`-тэй толгойн бүтэн payload — мөрөөс (сүүлийн баталгаажсан үе), «архивлаж байна» тэмдгийн хуулбар `prevGen`-ээс */
async function assemble(oid: number, h: SubHead, rows?: Attrs[]): Promise<SubmissionPayload> {
  return assembleRows(h, rows ?? (await subRowsFor([oid])).get(oid) ?? []);
}
/** `assemble`-ийн цэвэр хэсэг (тест) */
export function assembleRows(h: SubHead, all: readonly Attrs[]): SubmissionPayload {
  const gens = h.gens ?? [];
  const c = subFromRows(pickGeneration(all, gens));
  /* ⚠️ 2026-10-26: толгойн `rowKeys`/`rowOcc` (мета — нүдгүй oid-ийнх; давхар хуулбар — бүгд) + мөрийнх (давамгай) */
  const rk = new Map<number, string>(h.p.rowKeys);
  for (const [o, l] of c.rowKeys) rk.set(o, l);
  const occ = new Map<number, [number, number, number]>((h.p.rowOcc ?? []).map((e): [number, [number, number, number]] => [e[0], [e[0], e[1], e[2]]]));
  for (const e of c.rowOcc ?? []) occ.set(e[0], [e[0], e[1], e[2]]);
  const p: SubmissionPayload = { ...h.p, cells: c.cells, dates: c.dates, rowKeys: byPageOrder(rk) };
  if (occ.size) p.rowOcc = [...occ.values()].sort((x, y) => x[0] - y[0]); else delete p.rowOcc;
  const m = p.archiving;
  if (m && m.prevGen != null && !m.prev) {
    const pv = subFromRows(pickGeneration(all, gens, m.prevGen));
    p.archiving = { ...m, prev: { cells: pv.cells, rowKeys: pv.rowKeys, ...(pv.rowOcc ? { rowOcc: pv.rowOcc } : {}) } };
  }
  return p;
}

/** Толгойн МЕТА л (нүд угсрахгүй) — «архивлаж байна» тэмдгийн шалгалтад (`archivingBusy`) */
function headRow(a: RowAttrs | undefined): SubRead {
  if (!a || typeof a.objectid !== 'number') return { ok: true, sub: null };
  const dkey = String(a.dkey ?? '');
  if (!isSubmissionKey(dkey)) return { ok: true, sub: null };
  const h = a.payload ? parseHead(String(a.payload)) : null;
  if (!h) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', a.objectid) };
  return { ok: true, sub: { oid: a.objectid, at: isFin(a.at) ? Number(a.at) : h.p.at, done: dkey.startsWith(DONE_PREFIX), payload: h.p } };
}

/** Олон толгойн мөрийг НЭГ дор (`gens`-тэйг л) — жагсаалтын уншилтад */
async function rowsFor(as: readonly (RowAttrs | undefined)[]): Promise<Map<number, Attrs[]>> {
  const oids: number[] = [];
  for (const a of as) {
    if (!a || typeof a.objectid !== 'number' || !a.payload || !String(a.payload).includes('"gens"')) continue;
    oids.push(a.objectid);
  }
  return oids.length ? subRowsFor(oids) : new Map();
}

/* ⚠️ Хуучин `toStaged` (мөр → `StagedSubmission`, алдааг `null` болгодог)
   ХАСАГДСАН: `readRow` нь «мөр алга» ба «илгээлт атал уншигдсангүй» хоёрыг
   ялгадаг болсон тул алдааг чимээгүй `null` болгох завсрын функц нь тэр
   ялгааг буцаагаад устгах эрсдэлтэй. Чимээгүй хувилбарууд (`loadActiveSubmission` ·
   `loadSubmissionByOid`) ч 2026-10-09-нд (аудит №6) дуудагчгүй тул хасагдсан — зөвхөн `read*` үлдэнэ. */

const OUT_FIELDS = ['objectid', 'dkey', 'at', 'payload'];

/**
 * Уншихад бэлэн хүснэгтийн URL — `SubRead`-ийн ёсоор.
 *
 * ⚠️ ХОЁР ӨӨР «null»-ыг ЯЛГАНА (`tableUrl` хоёуланг нь `null` гэж нэгтгэдэг):
 *   · нэвтрээгүй → `{ok:false}` — юу ч мэдэхгүй, шийдвэр гаргаж болохгүй;
 *   · нэвтэрсэн боловч хүснэгт огт БАЙХГҮЙ → `{ok:true, url:null}` —
 *     тэр орчинд илгээлт үүсэх БОЛОМЖГҮЙ тул «мөр байхгүй» нь БАТАЛГААТАЙ
 *     бөгөөд хуучин (legacy) хяналтын мөрүүд хэвийн батлагдана.
 */
async function readUrl(): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: tr('Нэвтрээгүй тул илгээлтийг уншиж чадсангүй') };
  return { ok: true, url: await tableUrl(false) };
}

/* ⚠️ 2026-10-09 (аудит №6): чимээгүй `loadActiveSubmission` (алдаа → `null`) ХАСАГДСАН — дуудагчгүй үхмэл код;
   бүх зам алдааг ялгадаг `readActiveSubmission`-ийг хэрэглэнэ (2026-09-04-ний CRITICAL олдвор). */

/**
 * Багцын ИДЭВХТЭЙ илгээлт — АЛДААГ ЯЛГАДАГ хувилбар.
 *
 * ⚠️ `publish` нь энэ хувилбарыг ашиглана: чимээгүй `null` дээр тулгуурлавал
 *    уншилт унасан агшинд «идэвхтэй илгээлт байхгүй» гэж дүгнэж, өөр
 *    хэрэглэгчийн ЯГ ОДОО хянагдаж буй `sub|` мөрийг бүтнээр нь дарж бичдэг
 *    байв (upsert нь мөрийг dkey-гээр олдог тул тэр мөр рүү л бичнэ).
 */
export async function readActiveSubmission(pkgKey: string, fillMs?: number | null): Promise<SubRead> {
  try {
    const u = await readUrl();
    if (!u.ok) return u;
    if (!u.url) return { ok: true, sub: null };
    const fl = await layer(u.url);
    /*
     * ⚠️ ХОЁР ТҮЛХҮҮРИЙГ НЭГ ХҮСЭЛТЭЭР (2026-09-07): шинэ
     * `sub|<pkg>|<fillMs>` ба ХУУЧИН дагаваргүй `sub|<pkg>`. Хуучин мөрүүд
     * үйлдвэрлэлд амьд байгаа тул тэднийг олохгүй бол гүйцэтгэгчийн
     * хуудсанд илгээсэн тоо нь ХАРАГДАХАА БОЛЬЖ («миний илгээсэн ажил алга
     * болжээ») дахин бөглөгдөнө, мөн `publish`-ийн `staged` хоосон болж
     * ХУРИМТЛАЛ тасарна. Хоёр удаа хүсэлт явуулбал хоёр дахин удаан тул
     * `IN (…)`-ээр нэг удаа уншаад доор нь ялгана.
     */
    const dayK = subKey(pkgKey, fillMs);
    const legacyK = subKey(pkgKey);
    const keys = dayK === legacyK ? [legacyK] : [dayK, legacyK];
    const res = await fl.queryFeatures({
      where: `dkey IN (${keys.map(sqlStr).join(', ')})`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
      orderByFields: ['objectid DESC'],
    });
    const feats = res.features.map((f) => f.attributes as RowAttrs | undefined);
    /* Тэр ӨДРИЙН мөр байвал ТЭР нь ялна — хуучин мөр байсан ч. */
    const day = feats.find((a) => String(a?.dkey ?? '') === dayK);
    if (day) return readRow(day);
    /*
     * ⚠️ ХУУЧИН МӨРИЙГ ЗӨВХӨН ӨДӨР НЬ ТААРВАЛ АВНА (fillMs өгөгдсөн үед):
     *    дагаваргүй мөр нь ЯМАР Ч өдрийнх байж болно. Өчигдрийн (хянагдаж
     *    буй) хуучин мөрийг өнөөдрийн суурь болгон буцаавал —
     *      · `mergeBase` нь өчигдрийн нүднүүдийг өнөөдрийн payload-д хуулж,
     *        батлагдахад архивт ХОЁР УДАА тоологдоно;
     *      · `saveSubmission` тэр мөрийг update хийж, хянагчийн ЯГ ОДОО харж
     *        буй агуулгыг доор нь сольж, өдөр салгасны ач холбогдол алга болно.
     *    Тиймээс `payload.fillMs` тулгана: тэр өдрийнх бол «энэ өдрийн
     *    илгээлт» мөн (шинэ хэлбэрт шилжээгүй хуучин мөр) — үргэлжлүүлж
     *    нэгтгэнэ; өөр өдрийнх бол ХАРААХГҮЙ (`sub:null`) — өнөөдөр ШИНЭ мөр
     *    үүснэ, хуучин мөр өөрийн хяналтаараа хэвийн батлагдана.
     */
    const legacy = feats.find((a) => String(a?.dkey ?? '') === legacyK);
    if (!legacy) return { ok: true, sub: null };
    const r = await readRow(legacy);
    if (!r.ok || !r.sub) return r;
    if (fillMs != null && r.sub.payload.fillMs !== fillMs) return { ok: true, sub: null };
    return r;
  } catch (e) {
    return { ok: false, error: tr('Илгээлтийн төлөвийг шалгаж чадсангүй: {0}', errMsg(e)) };
  }
}

/**
 * БАГЦЫН БҮХ ИДЭВХТЭЙ (батлагдаагүй) илгээлт — өдөр бүрд нэг.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ (2026-09-07): өдөр бүр тусдаа `sub|` мөртэй болсноор
 *    нэг багцад ОЛОН идэвхтэй илгээлт зэрэг оршино (өчигдрийнх хянагдаж
 *    байна + өнөөдрийнх дөнгөж илгээгдлээ). `FillNew` нь «ӨӨР өдрийн
 *    илгээлт хянагдаж байна уу» гэдгийг мэдэж, товчийг хаах эсэхээ шийдэх
 *    ёстой; мөн бөглөх хуудсанд ЗӨВХӨН өнөөдрийн зөрүү давхарлагдана
 *    (бусдыг давхарлавал давхар тоологдоно).
 * ⚠️ `done|` мөрүүд ОРОХГҮЙ — тэдгээрийн агуулга архивт аль хэдийн бий.
 * ⚠️ Чимээгүй: алдаа → хоосон массив (харагдацыг унагаахгүй).
 */
export async function listActiveSubmissions(pkgKey: string): Promise<StagedSubmission[]> {
  try {
    const u = await readUrl();
    if (!u.ok || !u.url) return [];
    const fl = await layer(u.url);
    /* ⚠️ `pkg` талбараар шүүнэ — түүнд ЗӨВХӨН `pkgKey` бичигддэг (өдөр
       ОРООГҮЙ) тул `dkey LIKE` хэрэггүй; `dkey`-ээр угтварыг дахин тулгаж
       ноорогийн (`<user>|<pkg>`) мөрүүдийг хасна.
       ⚠️ `dkey LIKE 'sub|%'` СЕРВЕР ДЭЭР (2026-09-25-ны аудит): урьд нь зөвхөн
       `pkg`-ээр шүүдэг тул тухайн багцын БҮХ `done|` мөрийн (тус бүр ~80KB
       payload) түүхийг татаад клиент дээр хаядаг байв. Доорх угтварын
       шалгуур хамгаалалт болж үлдэнэ. */
    const res = await fl.queryFeatures({
      where: `pkg = ${sqlStr(pkgKey)} AND dkey LIKE ${sqlStr(`${SUB_PREFIX}%`)}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
      orderByFields: ['objectid DESC'],
    });
    const out: StagedSubmission[] = [];
    /* ⚠️ 2026-10-26: `gens`-тэй толгойн мөрийг НЭГ дор (уншиж чадаагүй бол тэр толгой алгасагдана — харагдацын зам) */
    const rmap = await rowsFor(res.features.map((f) => f.attributes as RowAttrs | undefined)).catch(() => null);
    for (const f of res.features) {
      const a = f.attributes as RowAttrs | undefined;
      if (!String(a?.dkey ?? '').startsWith(SUB_PREFIX)) continue;
      if (!rmap && a?.payload && String(a.payload).includes('"gens"')) continue;
      const r = await readRow(a, rmap ?? undefined);
      /* ⚠️ Задраагүй мөрийг ЧИМЭЭГҮЙ алгасна — энэ функц зөвхөн ХАРАГДАЦ ба
         анхааруулгад хэрэглэгддэг, бичих шийдвэрт БИШ (`readActiveSubmission`
         тэр үүргийг гүйцэтгэнэ, алдаагаа ил гаргадаг). */
      if (r.ok && r.sub && !r.sub.done && r.sub.payload.pkgKey === pkgKey) out.push(r.sub);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * ИЛГЭЭХ ОРОЛДЛОГЫН ТАНИГЧ (`nonce`) АЛЬ НЭГ МӨРӨНД БУУСАН УУ — АЛДААГ ЯЛГАДАГ (`SubRead`),
 * 2026-10-04 дахин аудит (#5, MED).
 *
 * ⚠️ ЯАГААД: хариу тасарсан илгээлтийг урьд нь ЗӨВХӨН идэвхтэй (`sub|`) мөрөөс хайдаг байв. Илгээлт
 *    буусны дараа хянагдаж БАТЛАГДСАН бол мөр нь `done|` болж олдохгүй → «буугаагүй» гэж дүгнэж,
 *    ачаалах зам тэмдгийг арилгаж, «Илгээх» нь архивт аль хэдийн орсон нүднүүдийг ДАХИН илгээдэг
 *    (давхар тоолол) байв. Одоо `sub|` ба `done|` ХОЁУЛАНГААС (тухайн багц, `since`-ээс хойш
 *    хадгалагдсан) хайна; идэвхтэй мөр давамгай.
 * ⚠️ `since` — оролдлогын агшнаас нэг хоногийн өмнө (цагийн зөрүүний нөөц): `done|` мөр бүр ~80KB
 *    тул бүх түүхийг татахгүй (`listActiveSubmissions`-ийн ⚠️).
 * ⚠️ Задраагүй мөрийг алгасна (шийдвэр нь «олдсон уу» — олдохгүй бол дуудагч «буугаагүй» биш,
 *    уншилт амжилттай гэж үзнэ; задраагүй мөр ховор, ил алдаагаар батлалт өөрөө зогсдог).
 */
export async function findNonce(pkgKey: string, nonce: string, since: number): Promise<SubRead> {
  try {
    const u = await readUrl();
    if (!u.ok) return u;
    if (!u.url) return { ok: true, sub: null };
    const fl = await layer(u.url);
    const res = await fl.queryFeatures({
      where: `pkg = ${sqlStr(pkgKey)} AND at >= ${Math.floor(since)} AND (dkey LIKE ${sqlStr(`${SUB_PREFIX}%`)} OR dkey LIKE ${sqlStr(`${DONE_PREFIX}%`)})`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
      orderByFields: ['objectid DESC'],
    });
    let hit: StagedSubmission | null = null;
    for (const f of res.features) {
      /* ⚠️ 2026-10-26: танигчийг МЕТА-аас (нүд угсрахгүй); олдсон мөрийн угсралт унавал ТОДОРХОЙГҮЙ (`ok:false`) —
         «буугаагүй» гэж дүгнэвэл дахин илгээж давхар тоолно */
      const a = f.attributes as RowAttrs | undefined;
      const h = a?.payload ? parseHead(String(a.payload)) : null;
      if (!h || h.p.pkgKey !== pkgKey || !(h.p.nonces ?? []).includes(nonce)) continue;
      const r = await readRow(a);
      if (!r.ok) return r;
      if (!r.sub || r.sub.payload.pkgKey !== pkgKey) continue;
      if (!(r.sub.payload.nonces ?? []).includes(nonce)) continue;
      if (!r.sub.done) return { ok: true, sub: r.sub };
      hit ??= r.sub;
    }
    return { ok: true, sub: hit };
  } catch (e) {
    return { ok: false, error: tr('Илгээлтийн төлөвийг шалгаж чадсангүй: {0}', errMsg(e)) };
  }
}

/* ⚠️ 2026-10-09 (аудит №6): чимээгүй `loadSubmissionByOid` (алдаа → `null`) ХАСАГДСАН — дуудагчгүй үхмэл код;
   `readSubmissionByOid` (доор) л үлдэнэ. Хуучин тайлбар: зөвхөн `sub|`/`done|` мөрийг буцаана — хуучин хяналтын
   мөрүүдэд `Эх_мөрийн_дугаар` нь АРХИВЫН OBJECTID тул ноорогийн мөртэй санамсаргүй давхцаж болно, тэр үед
   `null` → legacy зам (архивын OBJECTID). */

/**
 * Илгээлт OBJECTID-оор — АЛДААГ ЯЛГАДАГ хувилбар (`SubRead`).
 *
 * ⚠️ ЗӨВХӨН ЭНЭ хувилбарыг «архивт бичих эсэх» шийдвэрт хэрэглэнэ
 *    (`hyanaltStore.archiveSubmission`, `FillNew`-ийн хянагчийн харагдац):
 *    `{ok:true, sub:null}` нь «мөр огт байхгүй нь БАТАЛГААЖСАН» гэсэн үг тул
 *    legacy зам руу унаж болно; `{ok:false}` нь «мэдэхгүй» — тэр үед юу ч
 *    хийхгүй зогсоно.
 */
export async function readSubmissionByOid(oid: number): Promise<SubRead> {
  if (!Number.isInteger(oid) || oid <= 0) return { ok: true, sub: null };
  try {
    const u = await readUrl();
    if (!u.ok) return u;
    if (!u.url) return { ok: true, sub: null };
    const fl = await layer(u.url);
    const res = await fl.queryFeatures({
      where: `objectid = ${oid}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
    });
    return readRow(res.features[0]?.attributes as RowAttrs | undefined);
  } catch (e) {
    return { ok: false, error: tr('Илгээлт №{0}-ийг уншиж чадсангүй: {1}', oid, errMsg(e)) };
  }
}

/**
 * ГҮЙЦЭТГЭЛ ИЛГЭЭХ ЭРХ — `company` шатанд тэр багцад томилогдсон эсэх (2026-10-06, аудит #2).
 *
 * ⚠️ Урьд нь `saveSubmission`/`submitForReview` хэн ч дуудаж болдог байв — эрх ЗӨВХӨН
 *    `FillNew.canPerf` (зурагдалт)-д байсан тул консолоос өөр багцад илгээлт үүсгэж/дарж,
 *    хяналтын тойрог нээж болдог. Дүрэм нь `canPerf`-тэй ЯГ ижил: нэвтрэлт унтраалттай
 *    эсвэл кодын хатуу `super` → хязгааргүй; эс бөгөөс `bagtsFor(me, 'company')`.
 * ⚠️ `allowChief`: газрын дарга (эцсийн шат) батлалтын дотор үлдэгдэл нэмэлтийг
 *    (`hyanaltStore.archiveSubmission` → `residual`, `apply` → шинэ тойрог) өөрийн нэрээр
 *    бичдэг — тэр багцын `chief` томилгоотой бол зөвшөөрнө.
 * ⚠️ Node (тест, `tools/`) — хөтчийн сешн биш тул шалгахгүй (`who.requireCap`-ийн загвар).
 * ⚠️ Хэрэглэгч нь `currentUser()` — дуудагчийн өгсөн нэрт итгэхгүй.
 * @returns `null` = зөвшөөрнө, эс бөгөөс хэрэглэгчид харуулах мессеж
 */
/** ⚠️ 2026-10-23: «Ерөнхий захирал» эсэх — `permissions` нь хөтчийн дэлгүүр тул динамик импорт (энэ модуль Node тестэд ч ачаалагдана) */
async function isZahiralUser(me: string): Promise<boolean> {
  const { roleOf } = await import('./permissions');
  return roleOf(me) === 'zahiral';
}
const ZAHIRAL_DENY = () => tr('Ерөнхий захирал гүйцэтгэлийг зөвхөн ХАРНА — бөглөх, илгээх боломжгүй.');

export async function companyDeny(group: string, allowChief = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const [{ AUTH, roleForUser }, { currentUser }, { bagtsFor, isViewOnly }] = await Promise.all([
    import('./services'), import('./who'), import('./guitsetgelAcl'),
  ]);
  if (!AUTH.appId) return null;
  const me = currentUser();
  if (!me) return tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.');
  if (roleForUser(me) === 'super') return null;
  /* ⚠️ 2026-10-09 (аудит): «Зөвхөн харна» (`viewOnly`) тугтай company-шатны данс урьд нь
     илгээж ЧАДДАГ байв — энэ функц `isViewOnly`-г огт дууддаггүй тул туг зөвхөн хянагчийн
     шийдвэрт (`hyanaltStore.authz`) үйлчилдэг байв. Туг нь эрхийг ХАСДАГ (утгыг өөрчлөхгүй) тул
     энд ч мөн хориглоно. `super` ба нэвтрэлт унтраалттай (`!AUTH.appId`) — дээр аль хэдийн чөлөөлөгдсөн. */
  if (isViewOnly(me)) return tr('Танд зөвхөн ХАРАХ эрх олгогдсон — гүйцэтгэл илгээх боломжгүй.');
  /* ⚠️ 2026-10-23: «Ерөнхий захирал» (`zahiral`) зөвхөн ХАРНА — урсгалын томилгоо (хуучин/алдаатай) үлдсэн ч илгээхгүй
     (`FillNew.permPerf` · `hyanaltStore.authz`-тай нэг дүрэм; консол/Ctrl+S-ийн зам энд хаагдана). */
  if (await isZahiralUser(me)) return ZAHIRAL_DENY();
  const cb = bagtsFor(me, 'company');
  if (cb === null || cb.includes(group)) return null;
  if (allowChief) {
    const ch = bagtsFor(me, 'chief');
    if (ch === null || ch.includes(group)) return null;
  }
  return tr('Та «{0}» багцын гүйцэтгэгчээр томилогдоогүй тул гүйцэтгэл илгээх эрхгүй.', group);
}

/**
 * ҮЛДЭГДЭЛ БИЧИХ ЭРХ (⚠️ 2026-10-21, аудит) — `saveResidualSubmission`: тухайн багцад ЭЦСИЙН (`chief`) шатанд
 * томилогдсон эсэх. Чөлөөлөлт `companyDeny`-тэй ижил (Node · нэвтрэлт унтраалттай · `super`); «зөвхөн харна» хориотой.
 * ⚠️ Гүйцэтгэгчийн (`company`) томилгоо ХАНГАЛТГҮЙ — үлдэгдэл нь архивлалтын дараах хаалт, гүйцэтгэгчийн илгээлт биш;
 *    урьд нь `companyDeny(grp, true)` хоёуланг зөвшөөрдөг тул `residual` туг гүйцэтгэгчийн бүх шалгалтыг тойрдог байв.
 */
export async function chiefDeny(group: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const [{ AUTH, roleForUser }, { currentUser }, { bagtsFor, isViewOnly }] = await Promise.all([
    import('./services'), import('./who'), import('./guitsetgelAcl'),
  ]);
  if (!AUTH.appId) return null;
  const me = currentUser();
  if (!me) return tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.');
  if (roleForUser(me) === 'super') return null;
  if (isViewOnly(me)) return tr('Танд зөвхөн ХАРАХ эрх олгогдсон — гүйцэтгэл илгээх боломжгүй.');
  /* ⚠️ 2026-10-23: «Ерөнхий захирал» — `companyDeny`-ийн ⚠️ */
  if (await isZahiralUser(me)) return ZAHIRAL_DENY();
  const ch = bagtsFor(me, 'chief');
  if (ch === null || ch.includes(group)) return null;
  return tr('Та «{0}» багцын эцсийн шатны батлагчаар томилогдоогүй тул үлдэгдэл илгээлт бичих эрхгүй.', group);
}

/**
 * ИЛГЭЭЛТИЙГ ХАДГАЛНА (upsert `sub|<pkgKey>|<payload.fillMs>`).
 *
 * ⚠️ ТҮЛХҮҮРИЙН ӨДӨР НЬ `payload.fillMs` (2026-09-07) — дуудагчаас ТУСДАА
 *    аргумент авахгүй. ЯАГААД: өдөр хоёр эх сурвалжтай болвол (аргумент ба
 *    payload) зөрөх боломж нээгдэж, `sub|<pkg>|<A>` түлхүүрт `fillMs = B`
 *    гэсэн агуулга суух эрсдэлтэй — батлагдахад архивын жааз БУРУУ өдөрт
 *    орно. `parseSubmission`/`isFillMs` нь `fillMs`-ийг аль хэдийн бодит
 *    мужид тулгадаг тул нэг эх сурвалж хангалттай. (Нэмэлт ашиг: дуудлагын
 *    гарын үсэг `(pkgKey, payload, expect)` ХЭВЭЭР үлдэж, дуудагч бүрийг
 *    засах шаардлагагүй.)
 *
 * ⚠️ ХУУЧИН МӨРИЙГ ӨВЛӨНӨ: тухайн багцад дагаваргүй `sub|<pkg>` мөр байж,
 *    түүний `payload.fillMs` нь ЭНЭ өдрийнх бол ШИНЭ мөр үүсгэхгүй, ТЭР
 *    мөрийг update хийнэ (dkey-г нь ч шинэ хэлбэрт шилжүүлнэ). Эс бөгөөс нэг
 *    өдрийн нэг илгээлт ХОЁР мөр болж, хяналтын мөрийн `Эх_мөрийн_дугаар` нь
 *    хуучин мөрийг заасаар үлдэж, хэрэглэгчийн шинэ засвар хянагчид ХҮРЭХГҮЙ.
 *
 * ⚠️ Байгаа мөрийг update — OBJECTID ХЭВЭЭР (толгойн тайлбар: хяналтын
 *    бүртгэл энэ дугаараар холбогдоно). Давхардлыг устгана (их OBJECTID
 *    үлдэнэ) — эс бөгөөс уншилт хуучин мөрийг сонгож «илгээсэн ч эргэж
 *    ирэхгүй» гэсэн чимээгүй алдаа үүснэ.
 * ⚠️ ArcGIS алдаагаа HTTP 200 + мөр бүрийн `error`-оор буцаадаг —
 *    `applyEdits`-ийн ҮР ДҮНГИЙН МӨР БҮРИЙГ шалгана; `ok:false` МЕССЕЖТЭЙ.
 * ⚠️ Давхардал устгах алхам унавал `ok:false` БИШ — илгээлт их OBJECTID-д
 *    аль хэдийн бичигдсэн бөгөөд уншилт түүнийг л сонгоно; зөвхөн warn.
 */
export async function saveSubmission(
  pkgKey: string,
  payload: SubmissionPayload,
  expect?: { at: number; dropMark?: number } | null,
): Promise<SaveSubmissionResult> {
  /* ⚠️ 2026-10-21 (аудит): `residual`/`residualOf` ЗӨВХӨН архивлалтын дараах хаалт бичнэ (`saveResidualSubmission` ←
     `hyanaltStore.closeAfterArchive`). Урьд нь клиентийн payload-д `residual: true` тавихад л илгээгчийн шалгалт
     (`user` = нэвтэрсэн хүн) ба хяналтын хориг (`reviewLockDeny`) хоёулаа АЛГАСАГДДАГ байв — дурын нэрээр, хянагдаж буй
     илгээлтийн дор нь бичих боломжтой. Серверийн мөрөөс уншихад (`parseSubmission`) туг хэвээр. */
  if (payload.residual === true || payload.residualOf != null)
    return { ok: false, error: tr('Үлдэгдлийн (residual) тэмдэгтэй илгээлтийг зөвхөн архивлалтын хаалт бичнэ — энэ замаар хүлээн авахгүй.') };
  return saveSubmissionInner(pkgKey, payload, expect, false);
}

/** `saveSubmission` · `saveResidualSubmission`-ий үр дүн (`lost` — `saveSubmissionInner`-ийн ⚠️) */
export type SaveSubmissionResult = { ok: true; oid: number } | { ok: false; error: string; lost?: true };

/**
 * ҮЛДЭГДЭЛ ИЛГЭЭЛТИЙГ ХАДГАЛНА (⚠️ 2026-10-21, аудит) — ЗӨВХӨН `hyanaltStore.closeAfterArchive` дуудна: батлах явцад
 * дахин илгээснээс архивласан хэсгийг хассан үлдэгдэл (`residual: true` · `residualOf`). Бичигч нь тухайн багцын ЭЦСИЙН
 * (`chief`) шатны томилгоотой байх ёстой (`chiefDeny`) — гүйцэтгэгчийн томилгоо хангалтгүй. Илгээгчийн шалгалт
 * (агуулга гүйцэтгэгчийнх — `user`/`users` хэвээр) ба хяналтын хориг (үлдэгдэл = шинэ тойрог) энд ҮЙЛЧЛЭХГҮЙ.
 */
export async function saveResidualSubmission(
  pkgKey: string,
  payload: SubmissionPayload,
  expect?: { at: number; dropMark?: number } | null,
): Promise<SaveSubmissionResult> {
  if (payload.residual !== true)
    return { ok: false, error: tr('Үлдэгдлийн тэмдэггүй илгээлт — энэ зам зөвхөн үлдэгдэлд.') };
  return saveSubmissionInner(pkgKey, payload, expect, true);
}

/** `saveSubmission`/`saveResidualSubmission`-ийн НЭГ бие — `residual` аргумент нь payload-ын тугийг ОРЛОНО (дуудагчид итгэхгүй) */
async function saveSubmissionInner(
  pkgKey: string,
  payload: SubmissionPayload,
  /**
   * ХҮЛЭЭГДЭЖ БУЙ СУУРЬ (optimistic concurrency) — заавал биш.
   *   · `undefined` → шалгахгүй (хуучин зан төлөв);
   *   · `null`      → мөр БАЙХГҮЙ байх ёстой;
   *   · `{at}`      → байгаа мөрийн `at` нь ЯГ энэ байх ёстой.
   *
   * ⚠️ ЯАГААД (2026-09-04-ний аудит): дуудагч талын «хуучирсан уу» шалгуур
   *    нь ХОЁР ТУСДАА уншилтын хооронд (`loadActiveSubmission` → `saveSubmission`)
   *    задгай цонхтой бөгөөд `payload.at` нь КЛИЕНТИЙН цагаар бичигддэг тул
   *    цагийн зөрүүтэй хоёр машин дээр эрэмбийн харьцуулалт чимээгүй давдаг
   *    байв — өөр хэрэглэгчийн илгээсэн нүднүүд ул мөргүй устана. Энд суурийг
   *    бичих АГШИНД нь дахин тулгана: зөрвөл `ok:false`, юу ч бичигдэхгүй.
   */
  /**
   * ⚠️ 2026-10-09: `dropMark` — серверийн мөрийн «архивлаж байна» тэмдгийг (`startedAt`-аар) ДУУДАГЧ ШИЙДСЭН
   *    (`resolveMark`) тул payload-д тэмдэггүй бичихийг зөвшөөрнө. Доорх тэмдгийн хамгаалалтыг үз.
   */
  expect?: { at: number; dropMark?: number } | null,
  /** ⚠️ 2026-10-21 (аудит): `true` — ЗӨВХӨН `saveResidualSubmission`-аас (илгээгчийн шалгалт · хяналтын хориггүй, `chiefDeny`-тэй) */
  residual = false,
  /* ⚠️ 2026-10-11 (аудит №7): `lost` — хариу АЛДАГДСАН (`isLostWrite`: timeout · сүлжээ · 5xx) тул илгээлт серверт
     буусан байж болно; дуудагч (FillNew) тэр үед л явж буй илгээлтийн тэмдгийг (`Inflight`) үлдээнэ, тодорхой
     татгалзалд арилгана. */
): Promise<SaveSubmissionResult> {
  if (payload.pkgKey !== pkgKey) {
    /* ⚠️ Өөр багцын diff-ийг энэ түлхүүрт бичвэл батлахад буруу багцын архив
       руу орно — дуудагчийн алдааг ил зогсооно. */
    return { ok: false, error: tr('Багцын түлхүүр зөрсөн: {0} ≠ {1}', payload.pkgKey, pkgKey) };
  }
  /* ⚠️ Хувилбар нь ГОРИМООС (2026-09-25, `SubmissionPayload.v`-ийн ⚠️) — дуудагчийн
     `v`-д итгэхгүй: нэмэлтийг `v: 1`-ээр бичвэл хуучин таб түүнийг НИЙТ гэж уншина. */
  /*
   * ⚠️ 2026-10-09 (аудит): ИЛГЭЭГЧИЙГ БҮРТГЭНЭ (`SubmissionPayload.users`-ийн ⚠️). Хөтөчид, нэвтрэлттэй
   *    горимд: `payload.user` нь нэвтэрсэн хэрэглэгч байх ёстой (зөрвөл татгалзана — `ajilBatlah.sameAsLogin`-ийн
   *    загвар; урьд нь дуудагчийн өгсөн нэр шалгалтгүй бичигддэг байв) бөгөөд түүнийг `users`-д нэмнэ.
   * ⚠️ Үлдэгдэл (`residual`) мөрийг газрын дарга бичдэг ч агуулга нь ГҮЙЦЭТГЭГЧИЙНХ — `user`/`users`-ийг
   *    хэвээр үлдээнэ (даргыг илгээгч гэж бүртгэвэл инженерийн шалгуур буруу хүнийг барина).
   */
  let body: SubmissionPayload = payload;
  if (typeof window !== 'undefined' && !residual) {
    const [{ AUTH }, { currentUser }] = await Promise.all([import('./services'), import('./who')]);
    if (AUTH.appId) {
      const me = (currentUser() ?? '').trim().toLowerCase();
      if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
      if (String(payload.user ?? '').trim().toLowerCase() !== me)
        return { ok: false, error: tr('Нэр нэвтэрсэн хэрэглэгчтэй зөрж байна — хуудсаа шинэчилнэ үү.') };
      body = { ...payload, user: me, users: mergeUsers(payload.users, [me]) };
    }
  }
  const raw = JSON.stringify(body.mode === 'inc' ? { ...body, v: 2, mode: 'inc' } : { ...body, v: 1 });
  /* ⚠️ 2026-10-26: мөрийн горимд (`rowsReady`) хэмжээний хязгааргүй — нүд `n:sub:<OBJECTID>` мөрөнд, payload-д мета (давхар
     хуулбар зөвхөн багтвал). Хязгаар хэтэрсэн үед л горимыг асууна — сүлжээнээс ӨМНӨХ хуучин шалгалтын дараалал хэвээр. */
  const rowsBig = raw.length > SUBMISSION_MAX ? (await rowsReady()).mode === 'rows' : false;
  if (raw.length > SUBMISSION_MAX && !rowsBig) {
    /*
     * ⚠️ ЗААВАР ҮНЭН БАЙХ ЁСТОЙ (2026-09-04-ний аудит). Урьд нь «хэсэгчлэн
     *    илгээнэ үү» гэж заадаг байсан нь ХУДАЛ: `mergeSubmission` нь дараагийн
     *    илгээлтийг өмнөхтэй нь ХУРИМТЛУУЛДАГ тул хагасыг илгээгээд үлдсэнийг
     *    илгээхэд дүн нь ДАХИН хязгаараас давна — хэрэглэгч гарцгүй давталтад
     *    орно. Жинхэнэ гарц нь ЗӨВХӨН батлагдах (тэгвэл `sub|` мөр `done|`
     *    болж хөлдөж, дараагийн илгээлт ЦЭВЭР эхэлнэ).
     */
    return {
      ok: false,
      error: tr('Илгээлт хэт том ({0} тэмдэгт, дээд {1}). Хэсэгчлэн илгээх нь ТУСЛАХГҮЙ — дараагийн илгээлт өмнөхтэйгээ нэгтгэгддэг тул хэмжээ буурахгүй. Одоо илгээсэн хэсгээ хянагчаар батлуулсны дараа шинэ илгээлт цэвэр эхэлнэ.', raw.length, SUBMISSION_MAX),
    };
  }
  /* ⚠️ 2026-10-06 (аудит #2): ГҮЙЦЭТГЭГЧИЙН ЭРХ lib-д — `FillNew.canPerf`-тэй ижил дүрэм.
     Үлдэгдэл (`residual`) мөрийг `hyanaltStore.archiveSubmission` газрын даргын нэрээр бичдэг. */
  if (typeof window !== 'undefined') {
    const { PKGS } = await import('@/modules/sheet/bagts.pkg');
    const grp = PKGS.find((p) => p.key === pkgKey)?.group;
    if (!grp) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', pkgKey) };
    /* ⚠️ 2026-10-21 (аудит): үлдэгдэл → ЭЦСИЙН шатны томилгоо (`chiefDeny`); гүйцэтгэгчийн томилгоо хангалтгүй */
    const deny = residual ? await chiefDeny(grp) : await companyDeny(grp);
    if (deny) return { ok: false, error: deny };
    /* ⚠️ 2026-10-09 (хэрэглэгч: «нэг удаа явуулаад 6 шат бүрэн давж байж дараа дахин бөглөх»): хуудсанд
       хяналтад явж буй илгээлт байвал шинэ илгээлт ч, тэрийг доор нь солих ч ХОРИГЛОНО
       (`hyanaltSubmit.reviewLockDays`-ийн ⚠️). Үлдэгдэл (`residual`) — газрын даргын архивын дараах
       ШИНЭ тойрог, хориг БИШ. ⚠️ Бичихээс ӨМНӨ — `submitForReview` агуулга бичигдсэний ДАРАА дуудагддаг. */
    if (!residual) {
      const pk = PKGS.find((p) => p.key === pkgKey);
      const others = PKGS.filter((p) => p.group === grp && p.key !== pkgKey).map((p) => p.name);
      const { reviewLockDeny } = await import('./hyanaltSubmit');
      /* ⚠️ 2026-10-09 (аудит №2): `payload.fillMs` — буцаагдсан илгээлтийн засвар (тэр өдрийн одоогийн ажил
         гүйцэтгэгчийн гар дээр) бол өөр өдөр хянагдаж байсан ч хориггүй (`hyanaltSubmit.reviewLockBlocks`). */
      const lock = await reviewLockDeny(grp, pk?.name ?? '', others, payload.fillMs);
      if (lock) return { ok: false, error: lock };
    }
  }
  try {
    const auth = await getAuth();
    if (!auth) return { ok: false, error: tr('Нэвтрээгүй тул илгээлт хадгалагдсангүй') };
    const url = await tableUrl(true);
    if (!url) return { ok: false, error: tr('Илгээлтийн хүснэгт олдсонгүй') };
    const fl = await layer(url);
    const dkey = subKey(pkgKey, payload.fillMs);
    const legacyK = subKey(pkgKey);
    /*
     * ⚠️ ХОЁР ТҮЛХҮҮР — шинэ (өдөртэй) ба хуучин (дагаваргүй). Хуучин мөрийг
     *    ЗӨВХӨН тэр өдрийнх бол өвлөнө (толгойн ⚠️) тул `payload`-ыг нь
     *    уншиж шалгана; өөр өдрийнх бол ОГТ ХӨНДӨХГҮЙ — тэр нь өөрийн
     *    хяналтаараа явж байгаа тусдаа илгээлт.
     * ⚠️ `payload` талбарыг НЭМЖ уншина (урьд нь зөвхөн OBJECTID/at байсан) —
     *    зөвхөн энэ багцын 1–2 мөр тул хэмжээ асуудал биш.
     */
    const found = await fl.queryFeatures({
      where: `dkey IN (${[dkey, legacyK].map(sqlStr).join(', ')})`,
      outFields: ['objectid', 'dkey', 'at', 'payload'],
      returnGeometry: false,
      orderByFields: ['objectid ASC'],
    });
    const all = found.features.filter((f) => typeof f.attributes?.objectid === 'number');
    const feats = all.filter((f) => {
      const k = String(f.attributes.dkey ?? '');
      if (k === dkey) return true;
      if (k !== legacyK) return false;
      /* Хуучин мөр — ЗӨВХӨН ижил өдрийнх бол энэ илгээлтийн мөр гэж үзнэ. */
      const p = parseHead(String(f.attributes.payload ?? ''))?.p;
      return !!p && p.fillMs === payload.fillMs;
    });
    const oids = feats.map((f) => f.attributes.objectid as number);
    const target = oids.length ? oids[oids.length - 1] : null;
    const dupes = oids.slice(0, -1);
    /* ⚠️ СУУРИЙН ТУЛГАЛТ — дээрх `expect`-ийн тайлбар. Зөрсөн бол ЮУ Ч
       бичихгүй буцна: дуудагч хуудсаа дахин ачаалж, нөгөө хүний илгээлт
       дээр нэгтгэх ёстой. */
    if (expect !== undefined) {
      const curAt = target != null ? (feats[feats.length - 1].attributes.at as unknown) : null;
      const same = expect === null
        ? target == null
        : target != null && isFin(curAt) && Number(curAt) === expect.at;
      if (!same) {
        return {
          ok: false,
          error: tr('Энэ багцад өөр хэрэглэгч илгээлт хийсэн байна — хуудсыг дахин ачаалж, ноорогоо сэргээгээд үргэлжлүүлнэ үү.'),
        };
      }
    }
    /*
     * ⚠️ 2026-10-09: «АРХИВЛАЖ БАЙНА» ТЭМДГИЙГ ЧИМЭЭГҮЙ ДАРАХГҮЙ. `markArchiving` нь `at`-ийг ӨӨРЧЛӨХГҮЙ тул
     *    тэмдэг тавигдахаас ӨМНӨ уншсан дуудагчийн `expect.at` таарч, тэмдэггүй payload нь тэмдгийг арчдаг
     *    байв — архив бичигдээд хаалт унасан бол дараагийн батлалт архивласан нэмэлтийг ДАХИН нэмнэ. Одоо
     *    мөрд тэмдэг байхад payload ижил тэмдгийг (`startedAt`) дамжуулаагүй, дуудагч шийдээгүй (`dropMark`)
     *    бол ЮУ Ч бичихгүй.
     */
    const curH = target != null ? parseHead(String(feats[feats.length - 1].attributes.payload ?? '')) : null;
    if (target != null) {
      const curP = curH?.p;
      const cm = curP?.archiving;
      if (cm && payload.archiving?.startedAt !== cm.startedAt && expect?.dropMark !== cm.startedAt) {
        return {
          ok: false,
          error: markFresh(cm)
            ? tr('Энэ өдрийн илгээлтийг {0} яг одоо архивлаж байна — хэдэн минутын дараа хуудсыг дахин ачаалж илгээнэ үү. Юу ч илгээсэнгүй.', cm.by || tr('газрын дарга'))
            : tr('Энэ өдрийн илгээлтийн өмнөх архивлалт шалгагдаагүй — хуудсыг дахин ачаалж илгээнэ үү. Юу ч илгээсэнгүй.'),
        };
      }
    }
    /*
     * ⚠️ 2026-10-26: МӨРИЙН ГОРИМ (`rowsReady`) — НҮД `n:sub:<OBJECTID>` мөрөнд (MVCC):
     *   1. шинэ толгой бол ЭХЛЭЭД нэмнэ (OBJECTID хэрэгтэй) — payload нь бүтэн v2 (уншигч payload-оос, тэр агшинд ч зөв),
     *      хэт том бол v3 мета (`gens: []` — хоосон);
     *   2. шинэ ҮЕИЙН мөр (`subWriteGen` — өөрчлөгдсөн түлхүүр л, баталгаажаагүй тул ҮЛ ҮЗЭГДЭНЭ);
     *   3. толгойг (`gens` + үе) доорх ЯГ ӨНӨӨГИЙН шинэчлэл/баталгаагаар — энэ нь баталгаажуулалт (commit).
     *   Мөр бичигдэхгүй бол юу ч баталгаажихгүй (шинээр нэмсэн толгойг устгана) — уншигч өмнөх үеийг харсаар.
     * ⚠️ «архивлаж байна» тэмдгийн хуулбар (`prev`) анх дамжихад түүний ҮЕ (`prevGen` = өмнөх баталгаажсан үе) — GC хадгална.
     */
    let rowsOn = rowsBig || (await rowsReady()).mode === 'rows';
    let tgt = target;
    let created = false;
    /** Шинээр нэмсэн толгойн payload бүтэн (v2) эсэх — тэгвэл баталгаажуулалт унасан ч агуулга толгойд бүрэн */
    let createdFull = false;
    let raw2 = raw;
    let gens1: number[] | null = null;
    let pins: number[] = [];
    /*
     * ⚠️ 2026-10-26: АЛДАГДАЛГҮЙ ЭСЭХ (`subRowsLossless`) — нэмэлтийн горимд утгыг өөрчлөхгүйгээр хэвшүүлээд
     *    (`normIncCells`) кодлогч ЯГ сэргээвэл л мөр рүү; эс бөгөөс ЯГ өнөөгийн JSON зам (payload эх сурвалж, `gens`-гүй —
     *    уншигч payload-ыг авна). Багтахгүй бол өмнөх «хэт том» хариу (юу ч бичихгүй).
     */
    const fr = rowsOn ? fillFrame(pkgKey) : null;
    const bodyR: SubmissionPayload = rowsOn ? normIncCells(body) : body;
    if (rowsOn) {
      const ap = bodyR.archiving?.prev;
      const okRows = subRowsLossless(bodyR, fr) && (!ap || subRowsLossless({ ...ap, dates: [] }, fr));
      if (!okRows) {
        console.warn('[selbe] илгээлтийн агуулга мөрийн бүтцэд ЯГ буухгүй — JSON payload-аар хадгална:', dkey);
        if (raw.length > SUBMISSION_MAX) {
          return {
            ok: false,
            error: tr('Илгээлт хэт том ({0} тэмдэгт, дээд {1}). Хэсэгчлэн илгээх нь ТУСЛАХГҮЙ — дараагийн илгээлт өмнөхтэйгээ нэгтгэгддэг тул хэмжээ буурахгүй. Одоо илгээсэн хэсгээ хянагчаар батлуулсны дараа шинэ илгээлт цэвэр эхэлнэ.', raw.length, SUBMISSION_MAX),
          };
        }
        rowsOn = false;
      }
    }
    if (rowsOn) {
      const gens0 = curH?.gens ?? [];
      let bodyW: SubmissionPayload = bodyR;
      if (tgt == null) {
        const v2 = headRaw(bodyW, null);
        createdFull = v2.length <= SUBMISSION_MAX;
        const first = createdFull ? v2 : headRaw(bodyW, [], true);
        let r0: Awaited<ReturnType<typeof fl.applyEdits>>;
        try {
          r0 = await fl.applyEdits({ addFeatures: [{ attributes: { dkey, usr: auth.user.toLowerCase(), pkg: pkgKey, at: payload.at, payload: first } }] } as Parameters<typeof fl.applyEdits>[0]);
        } catch (e) {
          return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(e)), ...(isLostWrite(e) ? { lost: true as const } : {}) };
        }
        const a0 = (r0.addFeatureResults ?? [])[0];
        if (!a0 || a0.error != null || typeof a0.objectId !== 'number') {
          return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(a0?.error ?? tr('серверээс хариу ирсэнгүй.'))) };
        }
        tgt = a0.objectId;
        created = true;
      }
      const tOid = tgt as number;
      /* ⚠️ 2026-10-26: БҮХ мөр (ямар ч үе) — үеийн дугаар ӨМНӨХ (баталгаажаагүй/хуучин табын) мөртэй ХЭЗЭЭ Ч давхцахгүй
         (давхцвал тэр мөр шинэ үед «харагдаж» хог орно); харагдах төлөв зөвхөн баталгаажсан үеүдээс */
      const allRows = created ? [] : (await subRowsFor([tOid])).get(tOid) ?? [];
      const usedGen = new Set<number>([...gens0, ...allRows.map((a) => Number(a.at)).filter(Number.isFinite)]);
      /** Үеийн дугаар — толгойн `at`-аас БАГА (самбарын «`at ≤ толгойн at`» дүрэм), 2^-12-ын үржвэр (Double-д ЯГ) */
      const pickGen = (): number => {
        for (;;) {
          const g = payload.at - (1 + Math.floor(Math.random() * 3990)) / 4096;
          if (!usedGen.has(g)) { usedGen.add(g); return g; }
        }
      };
      let vis: ReadonlyMap<string, Attrs> = curH?.gens ? pickGeneration(allRows, gens0) : new Map<string, Attrs>();
      const mid: number[] = [];
      /*
       * ⚠️ «АРХИВЛАЖ БУЙ» ХУУЛБАР (`archiving.prev`) — мөрийн үетэй байх ёстой (v3 мета-д хуулбар хасагдана, `prevGen`-ээс
       *    угсрагдана). `markArchiving` үеийг тавьдаг; тавиагүй (хуучин толгой) бол:
       *      · тэмдэг ЭНЭ агуулгынх (`at` тэнцүү) бөгөөд толгой үетэй → хуулбар = сүүлийн баталгаажсан үе;
       *      · эс бөгөөс хуулбарыг ӨӨРИЙН үе болгож бичнэ (өмнөх → хуулбар → шинэ дарааллаар).
       */
      const am = bodyW.archiving;
      const fail = async (err: string): Promise<SaveSubmissionResult> => {
        if (created) {
          await fl.applyEdits({ deleteFeatures: [{ objectId: tOid }] } as Parameters<typeof fl.applyEdits>[0]).catch(() => undefined);
          void subDropAll(tOid).catch(() => undefined);
        }
        return { ok: false, error: tr('Илгээлтийн мөр хадгалагдсангүй: {0}', err) };
      };
      if (am?.prev && (am.prevGen == null || !gens0.includes(am.prevGen))) {
        if (gens0.length && am.at === curH?.p.at) {
          bodyW = { ...bodyW, archiving: { ...am, prevGen: gens0[gens0.length - 1] } };
        } else {
          const gp = pickGen();
          const snap = subToRows({ cells: am.prev.cells, dates: [], rowKeys: am.prev.rowKeys, ...(am.prev.rowOcc ? { rowOcc: am.prev.rowOcc } : {}), asOf: null }, fr);
          const wp = await subWriteGen(tOid, pkgKey, snap, vis, gp);
          if (!wp.ok) return fail(wp.error);
          vis = snap;
          mid.push(gp);
          bodyW = { ...bodyW, archiving: { ...am, prevGen: gp } };
        }
      }
      const gen = pickGen();
      const w = await subWriteGen(tOid, pkgKey, subToRows(bodyW, fr), vis, gen);
      if (!w.ok) return fail(w.error);
      gens1 = [...gens0, ...mid, gen];
      pins = bodyW.archiving?.prevGen != null ? [bodyW.archiving.prevGen] : [];
      raw2 = headRaw(bodyW, gens1);
    }
    const attrs = { dkey, usr: auth.user.toLowerCase(), pkg: pkgKey, at: payload.at, payload: raw2 };
    const edit = {
      ...(tgt != null
        ? { updateFeatures: [{ attributes: { objectid: tgt, ...attrs } }] }
        : { addFeatures: [{ attributes: attrs }] }),
      ...(dupes.length ? { deleteFeatures: dupes.map((objectId) => ({ objectId })) } : {}),
    };
    /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): `lost` ЗӨВХӨН `applyEdits`-ийн уналтад — урьдчилсан `queryFeatures`
       (давхардал/тэмдгийн уншилт) унавал юу ч бичигдээгүй тул «алдагдсан» гэж тэмдэглэхгүй (гаднах catch). Урьд нь нэг
       try дотор байсан тул уншилтын timeout ч `lost` болж, дуудагч илгээлтийн тэмдгийг дэмий үлдээх байв. */
    /*
     * ⚠️ 2026-10-26: ШИНЭЭР НЭМСЭН толгойн баталгаажуулалт (`gens`) унавал — толгойн payload БҮТЭН (v2) бол агуулга аль
     *    хэдийн толгойд бүрэн (уншигч `gens`-гүй payload-ыг авна) тул илгээлт БУУСАН: мөр нь баталгаажаагүй (үл үзэгдэнэ,
     *    GC). «Унасан» гэж буцаавал хэрэглэгч дахин илгээж `expect` зөрнө. Мета (том) толгой бол агуулгагүй — толгой ба
     *    мөрийг устгаж алдаа буцаана.
     */
    let r: Awaited<ReturnType<typeof fl.applyEdits>> | null = null;
    let commitErr: string | null = null;
    let commitLost = false;
    try {
      r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    } catch (e) {
      commitErr = errMsg(e);
      commitLost = isLostWrite(e);
    }
    let results = r ? [...(r.addFeatureResults ?? []), ...(r.updateFeatureResults ?? [])] : [];
    /* ⚠️ ХООСОН ХАРИУГ БАС БАРИНА (2026-09-15-ны аудит): `applyEdits` нь
       алдаагүй атлаа үр дүнгүй буцаж болно. Доорх OID шалгуур нь `add`-ыг
       барьдаг ч `update`-д `target` аль хэдийн мэдэгдэж байдаг тул барьдаггүй
       байв — тиймээс хариу ирсэн эсэхийг ЭНД шалгана. */
    if (!commitErr && !results.length) commitErr = tr('серверээс хариу ирсэнгүй.');
    const bad0 = results.find((x) => x.error != null);
    if (!commitErr && bad0) commitErr = errMsg(bad0.error);
    if (commitErr && created) {
      if (createdFull) {
        console.warn('[selbe] илгээлтийн мөрийн баталгаажуулалт унав — толгойн бүтэн payload хүчинтэй:', commitErr);
        results = [{ objectId: tgt as number, error: null } as (typeof results)[number]];
        gens1 = null;
        commitErr = null;
      } else {
        await fl.applyEdits({ deleteFeatures: [{ objectId: tgt as number }] } as Parameters<typeof fl.applyEdits>[0]).catch(() => undefined);
        void subDropAll(tgt as number).catch(() => undefined);
      }
    }
    if (commitErr) return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', commitErr), ...(commitLost && !created ? { lost: true as const } : {}) };
    const bad = results.find((x) => x.error != null);
    if (bad) return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(bad.error)) };
    const oid = tgt ?? results[0]?.objectId;
    if (typeof oid !== 'number' || !(oid > 0)) {
      return { ok: false, error: tr('Илгээлт хадгалагдсангүй: серверээс мөрийн дугаар ирсэнгүй') };
    }
    const badDel = (r?.deleteFeatureResults ?? []).find((x) => x.error != null);
    if (badDel) console.warn('[selbe] илгээлтийн давхардсан мөр устсангүй:', errMsg(badDel.error));
    /*
     * ⚠️ 2026-10-05: БИЧСЭНИЙ ДАРААХ БАТАЛГАА. Дээрх `expect` тулгалт ба `applyEdits` хоёрын
     *    завсарт (ArcGIS-д нөхцөлт бичилт байхгүй) өөр хэрэглэгч ЗЭРЭГ бичвэл:
     *      · хоёулаа «мөр алга» гэж үзээд НЭМСЭН → хоёр мөр; уншигч сүүлийнхийг авч, нөгөөгийн
     *        нүд дараагийн хадгалалтаар «давхардал» болж устдаг байв. Дүрэм: БАГА OBJECTID
     *        (түрүүлж бичигдсэн) ялна — хожуу нь ӨӨРИЙН мөрөө устгаад `ok:false` буцаана
     *        (дуудагч дахин ачаалж нөгөөгийн илгээлт дээр нэгтгэнэ). Устгал унавал урьдын зан төлөв.
     *      · хоёулаа НЭГ мөрийг ШИНЭЧИЛСЭН → сүүлийнх нь ялна; дарагдсан тал мөрийн `at`/`usr`
     *        өөрийнх биш болсныг эндээс мэдэж `ok:false` авна (урьд нь «амжилттай» гэж худал).
     *    Цонхыг нарийсгана, тэг болгохгүй (баталгааны уншилтын ДАРАА дарагдвал мэдэгдэхгүй).
     * ⚠️ Баталгааны УНШИЛТ унавал амжилт хэвээр — бичилт өөрөө `applyEdits`-ээр батлагдсан.
     */
    try {
      const back = await fl.queryFeatures({
        where: `dkey = ${sqlStr(dkey)}`,
        outFields: ['objectid', 'usr', 'at'],
        returnGeometry: false,
        orderByFields: ['objectid ASC'],
      });
      const rowsB = back.features.filter((f) => typeof f.attributes?.objectid === 'number');
      const mineB = rowsB.find((f) => f.attributes.objectid === oid);
      const lost = tr('Энэ багцад өөр хэрэглэгч илгээлт хийсэн байна — хуудсыг дахин ачаалж, ноорогоо сэргээгээд үргэлжлүүлнэ үү.');
      /* ⚠️ 2026-10-26: мөрийн горимд толгойг ЭХЛЭЭД нэмсэн (`created`) ч «шинэ мөр» — ижил уралдааны дүрэм; ялагдвал мөрийг ч устгана */
      if (mineB && (target == null || created) && (rowsB[0].attributes.objectid as number) < oid) {
        const del = await fl.applyEdits({ deleteFeatures: [{ objectId: oid }] } as Parameters<typeof fl.applyEdits>[0]);
        const dr = del.deleteFeatureResults ?? [];
        if (rowsOn) void subDropAll(oid).catch(() => undefined);
        if (dr.length && dr.every((x) => x.error == null)) return { ok: false, error: lost };
      } else if (mineB && isFin(mineB.attributes.at) && (Number(mineB.attributes.at) !== payload.at
        || String(mineB.attributes.usr ?? '').toLowerCase() !== attrs.usr)) {
        return { ok: false, error: lost };
      }
    } catch { /* баталгааны уншилт унасан — бичилт батлагдсан хэвээр */ }
    /* ⚠️ 2026-10-26: толгойн бүтцийн багана (самбарын шүүлт) ба хуучирсан үеийн мөрийн GC — best effort, хүлээхгүй */
    if (rowsOn && gens1) {
      void setHeaderCols(oid, { mur_turul: 'tolgoi', mur_key: 'h', noorog_turul: 'ilgeelt', huvilbar: ROW_VERSION, huuchin_at: payload.at }).catch(() => undefined);
      void subGc(oid, gens1, pins).catch(() => 0);
    }
    return { ok: true, oid };
  } catch (e) {
    /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): энд `applyEdits`-ээс ӨМНӨХ уналт л ирнэ (`lost`-гүй — дээрх ⚠️) */
    return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(e)) };
  }
}

/**
 * ИЛГЭЭЛТИЙГ ХААНА — төлөвлөлтийн ахлах инженер баталж архивт бичсэний ДАРАА.
 * `dkey` → `done|<pkgKey>|<oid>`, payload-д `archiveOid`/`approvedAt` нэмнэ.
 *
 * ⚠️ Мөр аль хэдийн `done|` бол `ok:true` (idempotent) — батлах алхам
 *    давтагдахад архивт давхар жааз үүсгэхгүйн шалгалт `hyanaltStore`-д
 *    ЭНЭ төлөвөөр хийгдэнэ.
 * ⚠️ Ноорогийн мөрийг (`user|pkg`) OBJECTID-оор олсон ч хаахгүй — илгээлт биш.
 */
export async function closeSubmission(
  oid: number,
  archiveOid: number,
  approvedAt: number,
  /** `true` → payload-д `regPending` тавина (`SubmissionPayload.regPending`-ийн ⚠️) */
  regPending?: boolean,
  /**
   * АРХИВЛАСАН АГУУЛГЫН `at` (compare-and-set, 2026-09-25-ны аудит, HIGH).
   * ⚠️ Жааз бичих хооронд гүйцэтгэгч дахин илгээвэл (ижил `sub|` мөр update)
   *    урьд нь ШИНЭ агуулга архивт ОРООГҮЙ атлаа `done|` болж хөлддөг байв.
   *    Өгвөл мөрийн `at` зөрөх үед ХААХГҮЙ — `{ok:false, changed:true}`.
   * ⚠️ Атом биш (унших → бичих хооронд мс-ийн цонх үлдэнэ) — ArcGIS-д CAS байхгүй.
   *    `undefined` = шалгахгүй (хуучин зан төлөв).
   */
  expectAt?: number,
): Promise<{ ok: boolean; error?: string; changed?: boolean }> {
  if (!Number.isInteger(oid) || oid <= 0) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
  try {
    const url = await tableUrl(false);
    if (!url) return { ok: false, error: tr('Илгээлтийн хүснэгт олдсонгүй') };
    const fl = await layer(url);
    const res = await fl.queryFeatures({
      where: `objectid = ${oid}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
    });
    const a = res.features[0]?.attributes as RowAttrs | undefined;
    if (!a) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
    const dkey = String(a.dkey ?? '');
    if (dkey.startsWith(DONE_PREFIX)) return { ok: true };
    if (!dkey.startsWith(SUB_PREFIX)) return { ok: false, error: tr('Мөр №{0} нь илгээлт биш ({1})', oid, dkey) };
    /* ⚠️ 2026-10-26: толгой (`parseHead`) — v3 мета ч; мөрийг ХӨДӨЛГӨХГҮЙ (OBJECTID ХЭВЭЭР — `n:sub:<OBJECTID>` дагана) */
    const head = parseHead(String(a.payload ?? ''));
    const payload = head?.p ?? null;
    if (!head || !payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', oid) };
    if (expectAt !== undefined) {
      /* `readRow`-ийн дүрэм: мөрийн `at` талбар, байхгүй бол payload-ынх */
      const curAt = isFin(a.at) ? Number(a.at) : payload.at;
      if (curAt !== expectAt)
        return { ok: false, changed: true, error: tr('Илгээлт №{0} архивлах явцад дахин илгээгдсэн — хаасангүй', oid) };
    }
    /*
     * ⚠️ dkey-ЭЭС ТАСЛАХДАА ӨДРИЙГ ХАЯНА (2026-09-07): шинэ хэлбэр нь
     *    `sub|<pkg>|<fillMs>` тул зүгээр таславал `pkgKey` нь
     *    `b1_9f|1757203200000` болж, `done|` түлхүүр бохирдоно (уншилт нь
     *    угтвараар ажилладаг тул эвдрэхгүй ч, `pkg`-ээр хайх · тайланд
     *    задлах бүх зам худал болно). Энэ нь ЗӨВХӨН нөхөх зам —
     *    `parseSubmission` хоосон `pkgKey`-г хүлээж авдаггүй тул амьд
     *    өгөгдөлд бараг хүрэхгүй, гэхдээ хэлбэр зөв байх ёстой.
     */
    const pkgKey = payload.pkgKey || dkey.slice(SUB_PREFIX.length).split('|')[0];
    const next: SubmissionPayload = { ...payload, archiveOid, approvedAt };
    /* ⚠️ 2026-10-09 (R2): хаагдсан мөрд «архивлаж байна» тэмдэг утгагүй */
    delete next.archiving;
    if (regPending) next.regPending = true;
    const edit = {
      updateFeatures: [{
        /* ⚠️ 2026-10-26: payload-ын ХЭЛБЭР хэвээр (`headRaw` — `gens`-тэй бол давхар/мета, эс бөгөөс хуучин) */
        attributes: { objectid: oid, dkey: doneKey(pkgKey, oid), payload: headRaw(next, head.gens, head.meta) },
      }],
    };
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    /*
     * ⚠️ ХООСОН ХАРИУГ БАС БАРИНА (2026-09-15-ны аудит). Урьд нь зөвхөн
     *    `error != null`-ыг шалгадаг байсан тул `updateFeatureResults` огт
     *    ирээгүй хариунд `bad = undefined` болж `{ok:true}` буцдаг байв.
     *    Тэр үед `sub|` мөр НЭЭЛТТЭЙ үлдэж, дараагийн илгээлт батлагдсан
     *    агуулга дээр нэгтгэгдэн архивт ДАВХАР тоологдоно.
     *
     * ⚠️ `objectId`-ыг БАС шалгана: ArcGIS JS API-ийн `FeatureEditResult`-д
     *    `success` талбар байхгүй тул амжилтын ганц бодит тэмдэг нь буцсан
     *    мөрийн дугаар мөн.
     */
    const ups = r.updateFeatureResults ?? [];
    if (!ups.length) {
      return { ok: false, error: tr('Илгээлт хаагдсангүй: серверээс хариу ирсэнгүй.') };
    }
    const bad = ups.find((x) => x.error != null || typeof x.objectId !== 'number');
    if (bad) return { ok: false, error: errMsg(bad.error) || tr('Илгээлт хаагдсангүй.') };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/**
 * «АРХИВЛАЖ БАЙНА» ТЭМДЭГ ТАВИНА (2026-10-09, R2; `SubmissionPayload.archiving`-ийн ⚠️).
 * ⚠️ `at`-ийн CAS (`closeSubmission`-тэй ижил, атом биш) — мөрийн `at` зөрвөл `{ok:false, changed:true}`,
 *    юу ч бичихгүй. `dkey` ба `at` ХӨНДӨГДӨХГҮЙ — зөвхөн payload-д тэмдэг нэмнэ.
 * ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг тул үр дүнгийн мөрийг шалгана (`updOk`).
 */
export async function markArchiving(
  oid: number,
  expectAt: number,
  /** `null` → тэмдгийг арилгана (бичилт унаж буцаагдсан үед) */
  mark: NonNullable<SubmissionPayload['archiving']> | null,
): Promise<{ ok: boolean; error?: string; changed?: boolean; busy?: true }> {
  if (!Number.isInteger(oid) || oid <= 0) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
  try {
    /* ⚠️ 2026-10-09: тавьсан хэрэглэгч/сешн (`ArchivingMark.by`/`sid`) — «claim» */
    const me = ((await getAuth())?.user ?? '').toLowerCase();
    const url = await tableUrl(false);
    if (!url) return { ok: false, error: tr('Илгээлтийн хүснэгт олдсонгүй') };
    const fl = await layer(url);
    const res = await fl.queryFeatures({ where: `objectid = ${oid}`, outFields: OUT_FIELDS, returnGeometry: false });
    const a = res.features[0]?.attributes as RowAttrs | undefined;
    if (!a) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
    const dkey = String(a.dkey ?? '');
    if (!dkey.startsWith(SUB_PREFIX)) return { ok: false, changed: true, error: tr('Мөр №{0} нь илгээлт биш ({1})', oid, dkey) };
    /* ⚠️ 2026-10-26: толгой (`parseHead`) — v3 мета ч; бичихдээ ХЭЛБЭР хэвээр (`headRaw`) */
    const head = parseHead(String(a.payload ?? ''));
    const payload = head?.p ?? null;
    if (!head || !payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', oid) };
    const curAt = isFin(a.at) ? Number(a.at) : payload.at;
    if (curAt !== expectAt)
      return { ok: false, changed: true, error: tr('Илгээлт №{0} архивлах явцад дахин илгээгдсэн — хаасангүй', oid) };
    /*
     * ⚠️ 2026-10-09: «CLAIM» — ХОЁР ХӨТӨЧ ЭЦСИЙН ШАТЫГ ЗЭРЭГ БАТЛАХ. Урьд нь хоёр дахь нь эхнийхийн ШИНЭ тэмдгийг
     *    дарж, хоёулаа жааз бичдэг байв (бичсэний дараах уншилт зөвхөн СҮҮЛИЙН бичигчийг барина). Одоо ижил `at`-тай,
     *    `ARCHIVING_TTL_MS`-ээс залуу, ӨӨР сешний тэмдэг байвал юу ч бичихгүй (`busy`); ижил хэрэглэгчийн өөр
     *    таб/хөтөч бол тусгай мессеж. Хуучирсан тэмдгийг (тавьсан таб унасан) дарна — дуудагч архивыг өмнө нь
     *    `matchArchivedFrame`-ээр шалгасан.
     * ⚠️ АРИЛГАЛТ (`mark === null`) — ЗӨВХӨН өөрийн сешний тэмдгийг; өөр сешнийхийг арилгавал тэр бичиж
     *    байхад «архивлаж байна» хамгаалалт алга болно.
     */
    if (mark) {
      const cf = claimConflict(payload.archiving, expectAt, SESSION_ID, me);
      if (cf) {
        return {
          ok: false,
          busy: true,
          error: cf.sameUser
            ? tr('Та энэ ажлыг өөр цонх/хөтчөөс яг одоо батлаж (архивлаж) байна — тэр дуусахыг хүлээнэ үү. Юу ч бичсэнгүй.')
            : tr('{0} энэ ажлыг яг одоо батлаж (архивлаж) байна — дуусахыг хүлээгээд дахин оролдоно уу. Юу ч бичсэнгүй.', cf.by || tr('Өөр хянагч')),
        };
      }
    } else if (payload.archiving?.sid && payload.archiving.sid !== SESSION_ID) {
      return { ok: false, error: tr('«Архивлаж байна» тэмдэг өөр цонхных — арилгасангүй') };
    }
    const next: SubmissionPayload = { ...payload };
    /* ⚠️ 2026-10-26: мөртэй (`gens`) толгойд тэмдгийн агуулга = СҮҮЛИЙН баталгаажсан үе (`at` тулгагдсан) — `prevGen`
       тавина: дараа нь дахин илгээхэд хуулбар (`prev`) мета-д хасагдсан ч тэр үеэс угсрагдана (`assembleRows`), GC
       тэр үеийг хадгална. Мета толгойн `payload` нүдгүй тул хуулбарыг ЭНДЭЭС авах боломжгүй — үе нь цорын ганц зөв эх. */
    const pg = head.gens?.length ? head.gens[head.gens.length - 1] : undefined;
    if (mark) next.archiving = { ...mark, by: mark.by ?? me, sid: SESSION_ID, ...(pg != null && mark.prevGen == null ? { prevGen: pg } : {}) };
    else delete next.archiving;
    /* ⚠️ 2026-10-09 (R2/7): `at` талбарыг payload-тай НЭГ бичилтээр (атом) бичнэ, дараа нь ДАХИН уншиж
       батална. Урьд нь зөвхөн payload бичдэг байв: унших → бичих завсарт гүйцэтгэгч дахин илгээвэл мөрийн
       `at` нь ШИНЭ, payload нь ХУУЧИН (+тэмдэг) болж зөрдөг — уншигч (`readRow`) мөрийн `at`-ийг түрүүлж
       авдаг тул хуучин агуулга шинэ хувилбарын нэрээр харагдана. Одоо мөр үргэлж өөртөө нийцтэй
       (`at` = payload.at). Бичсэний дараах уншилтаар `at` өөрчлөгдсөн эсвэл тэмдэг алга бол (манай
       бичилтийн ДАРАА өөр бичилт орсон) `changed` — дуудагч архивлахгүй. ArcGIS-д CAS байхгүй тул
       унших → бичих хоорондох мс-ийн цонх хэвээр (`closeSubmission`-ийн ⚠️). */
    const r = await fl.applyEdits({
      updateFeatures: [{ attributes: { objectid: oid, at: curAt, payload: headRaw(next, head.gens, head.meta) } }],
    } as Parameters<typeof fl.applyEdits>[0]);
    const err = updOk(r);
    if (err) return { ok: false, error: err };
    const res2 = await fl.queryFeatures({ where: `objectid = ${oid}`, outFields: OUT_FIELDS, returnGeometry: false });
    const a2 = res2.features[0]?.attributes as RowAttrs | undefined;
    const p2 = a2 ? parseHead(String(a2.payload ?? ''))?.p ?? null : null;
    const at2 = a2 && isFin(a2.at) ? Number(a2.at) : p2?.at;
    if (!a2 || !p2 || !String(a2.dkey ?? '').startsWith(SUB_PREFIX) || at2 !== expectAt || p2.at !== expectAt
      || (mark ? p2.archiving?.at !== mark.at || p2.archiving?.startedAt !== mark.startedAt || p2.archiving?.sid !== SESSION_ID : p2.archiving != null))
      return { ok: false, changed: true, error: tr('Илгээлт №{0} архивлах явцад дахин илгээгдсэн — хаасангүй', oid) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/**
 * БАГЦЫН ГҮЙЦЭТГЭЛ ЯГ ОДОО АРХИВЛАГДАЖ БАЙНА УУ (2026-10-09, ГЭРЭЭ) — Ажил нэмэх · обьём · Хуваарийн бичигчид
 * `Bagts_*`-д бичихийн ӨМНӨ дуудна.
 *   · тухайн багцын нээлттэй `sub|` мөр(үүд)-ийн аль нэгэнд (өдрөөс үл хамааран) ШИНЭ (`ARCHIVING_TTL_MS`)
 *     «архивлаж байна» тэмдэг байвал `{ who, at }` (`at` = эхэлсэн агшин), эс бөгөөс `null`;
 *   · уншилт УНАВАЛ THROW — дуудагч ХААНА (fail-closed): «тэмдэг алга» гэж ҮЗЭХГҮЙ.
 * ⚠️ ЯАГААД: `hyanaltStore.archiveSubmission` тэмдгийг жааз бичихээс ӨМНӨХ шалгалтын (`sameFrame`/MAX OID) ӨМНӨ
 *    тавьдаг; энэ хооронд өөр бичигч жааз/шинэчлэл оруулбал нэг нь нөгөөгөө булна.
 * ⚠️ Задраагүй мөрийг алгасна (тийм мөрийг архивлах боломжгүй — `readRow` ил алдаагаар зогсдог).
 * ⚠️ Серверт `payload LIKE '%"archiving"%'`-аар шүүнэ (`JSON.stringify` яг ийм бичдэг) — бүх payload-ыг татахгүй.
 */
export async function archivingBusy(
  pkgKey: string,
  /** ⚠️ 2026-10-21 (аудит): ӨӨРИЙН `sub|` мөрийг алгасна — `archiveSubmission` тэмдгээ тавьсны ДАРАА багцын БУСАД мөрийн тэмдгийг шалгана */
  exceptOid?: number,
): Promise<{ who: string; at: number } | null> {
  const u = await readUrl();
  if (!u.ok) throw new Error(u.error);
  if (!u.url) return null;
  const fl = await layer(u.url);
  const res = await fl.queryFeatures({
    where: `pkg = ${sqlStr(pkgKey)} AND dkey LIKE ${sqlStr(`${SUB_PREFIX}%`)} AND payload LIKE '%"archiving"%'`,
    outFields: OUT_FIELDS,
    returnGeometry: false,
    orderByFields: ['objectid ASC'],
  });
  /* ⚠️ 2026-10-12 (дарааллын аудит): серверийн цагаар (`markFresh`-ийн ⚠️) */
  const now = serverNow();
  let best: { who: string; at: number } | null = null;
  for (const f of res.features) {
    /* ⚠️ 2026-10-26: зөвхөн МЕТА (тэмдэг) — нүд угсрахгүй (`headRow`) */
    const r = headRow(f.attributes as RowAttrs | undefined);
    if (!r.ok || !r.sub || r.sub.done || r.sub.payload.pkgKey !== pkgKey) continue;
    if (exceptOid != null && r.sub.oid === exceptOid) continue;
    const m = r.sub.payload.archiving;
    if (!m || !markFresh(m, now)) continue;
    if (!best || m.startedAt > best.at) best = { who: m.by ?? '', at: m.startedAt };
  }
  return best;
}

/** `applyEdits`-ийн шинэчлэлийн үр дүн — хоосон хариу ч алдаа (`closeSubmission`-ий ⚠️) */
const updOk = (r: { updateFeatureResults?: { error?: unknown; objectId?: unknown }[] }): string | null => {
  const ups = r.updateFeatureResults ?? [];
  if (!ups.length) return tr('Серверээс хариу ирсэнгүй.');
  const bad = ups.find((x) => x.error != null || typeof x.objectId !== 'number');
  return bad ? errMsg(bad.error) || tr('Бичигдсэнгүй.') : null;
};

/**
 * «БҮРТГЭЛ ХҮЛЭЭГДЭЖ БУЙ» ТЭМДГИЙГ АРИЛГАНА — нэгтгэл ба IPC хоёулаа
 * амжилттай болсны дараа (`SubmissionPayload.regPending`-ийн ⚠️).
 *
 * ⚠️ IDEMPOTENT: мөр `done|` биш, эсвэл тэмдэггүй бол `ok:true` — юу ч бичихгүй.
 * ⚠️ ArcGIS алдаа HTTP 200-аар ирдэг тул үр дүнгийн мөрийг шалгана (`updOk`).
 */
export async function markRegistered(sheetOid: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(sheetOid) || sheetOid <= 0) return { ok: true };
  try {
    const url = await tableUrl(false);
    if (!url) return { ok: false, error: tr('Илгээлтийн хүснэгт олдсонгүй') };
    const fl = await layer(url);
    const res = await fl.queryFeatures({
      where: `objectid = ${sheetOid}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
    });
    const a = res.features[0]?.attributes as RowAttrs | undefined;
    if (!a || !String(a.dkey ?? '').startsWith(DONE_PREFIX)) return { ok: true };
    /* ⚠️ 2026-10-26: толгой (`parseHead`) — v3 мета ч; ХЭЛБЭР хэвээр (`headRaw`) */
    const head = parseHead(String(a.payload ?? ''));
    const payload = head?.p ?? null;
    if (!head || !payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', sheetOid) };
    if (payload.regPending !== true) return { ok: true };
    const next: SubmissionPayload = { ...payload };
    delete next.regPending;
    const r = await fl.applyEdits({
      updateFeatures: [{ attributes: { objectid: sheetOid, payload: headRaw(next, head.gens, head.meta) } }],
    } as Parameters<typeof fl.applyEdits>[0]);
    const err = updOk(r);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/**
 * БҮРТГЭЛ ХҮЛЭЭГДЭЖ БУЙ `done|` илгээлтүүд — `retryPendingRegistrations`-д.
 *
 * ⚠️ Бүх `done|` мөрийн 80KB-ийн payload-ыг татахгүйн тул серверт `LIKE`-аар
 *    шүүнэ (`JSON.stringify` нь яг `"regPending":true` бичдэг), дараа нь
 *    задлаад ДАХИН тулгана. `orderByFields` — хуудаслалтын дүрэм.
 * ⚠️ Чимээгүй: алдаа → хоосон (дахин оролдлого нь зөвхөн нөхөх зам).
 */
export async function listRegPending(): Promise<StagedSubmission[]> {
  try {
    const u = await readUrl();
    if (!u.ok || !u.url) return [];
    const fl = await layer(u.url);
    const res = await fl.queryFeatures({
      where: `dkey LIKE 'done|%' AND payload LIKE '%"regPending":true%'`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
      orderByFields: ['objectid ASC'],
    });
    const out: StagedSubmission[] = [];
    const rmap = await rowsFor(res.features.map((f) => f.attributes as RowAttrs | undefined));
    for (const f of res.features) {
      const r = await readRow(f.attributes as RowAttrs | undefined, rmap);
      if (r.ok && r.sub && r.sub.done && r.sub.payload.regPending === true) out.push(r.sub);
    }
    return out;
  } catch {
    return [];
  }
}

/* ══════════════ 2026-10-26: хуучин JSON илгээлтийг мөр рүү (админ) · тулгалт · Phase B ══════════════ */

/** Нүд/огнооны олонлогийн гарын үсэг — тулгалтад (дараалал хамаарахгүй) */
const cellSig = (p: Pick<SubmissionPayload, 'cells' | 'dates'>): string =>
  JSON.stringify([...p.cells.map(([k, v]) => `c${k}=${v}`), ...p.dates.map(([k, v]) => `d${k}=${v}`)].sort());

/** Толгойн мөр OBJECTID-оор (JS API давхарга) */
async function headAt(oid: number): Promise<{ fl: Awaited<ReturnType<typeof layer>>; a: RowAttrs } | null> {
  const url = await tableUrl(false);
  if (!url) return null;
  const fl = await layer(url);
  const res = await fl.queryFeatures({ where: `objectid = ${oid}`, outFields: OUT_FIELDS, returnGeometry: false });
  const a = res.features[0]?.attributes as RowAttrs | undefined;
  return a ? { fl, a } : null;
}

/**
 * ХУУЧИН (v1/v2, `gens`-гүй) ИЛГЭЭЛТИЙГ МӨР РҮҮ — `n:sub:<OBJECTID>` үе бичээд payload-д ЗӨВХӨН `gens` (+ «архивлаж буй»
 * хуулбарын `prevGen`) нэмнэ (нүд ХЭВЭЭР — Phase B хүртэл; хуучин таб уншсаар). `at` · `dkey` · OBJECTID хөдлөхгүй. Давтахад юу
 * ч хийхгүй.
 * ⚠️ 2026-10-26 (өгөгдөл алдагдахгүй): кодлогч агуулгыг ЯГ (эсвэл нэмэлтийн горимд утга ижилээр — `normIncCells`) сэргээхгүй
 *    бол ШИЛЖҮҮЛЭХГҮЙ — payload эх сурвалж хэвээр, `ok:false` + шалтгаан (админд харагдана, тулгалтад `pending`).
 * ⚠️ Үеийн дугаар өмнөх (унасан оролдлогын) мөртэй давхцахгүй; `«архивлаж буй» хуулбар` (`archiving.prev`) байвал түүнийг
 *    ӨМНӨХ үе болгож бичнэ (`prevGen`) — v3 мета-д хуулбар хасагдахад тэр үеэс угсрагдана.
 */
export async function migrateSubmissionRow(oid: number): Promise<{ ok: true; migrated: boolean } | { ok: false; error: string }> {
  try {
    const h0 = await headAt(oid);
    if (!h0) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
    const raw = String(h0.a.payload ?? '');
    const head = parseHead(raw);
    if (!head) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', oid) };
    if (head.gens) return { ok: true, migrated: false };
    const fr = fillFrame(head.p.pkgKey);
    const ok = (x: SubmissionPayload) => subRowsLossless(x, fr) && (!x.archiving?.prev || subRowsLossless({ ...x.archiving.prev, dates: [] }, fr));
    let p = head.p;
    if (!ok(p)) {
      p = normIncCells(head.p);
      if (p === head.p || !ok(p)) {
        return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга мөрийн бүтцэд ЯГ буухгүй — JSON хэвээр үлдэв (өгөгдөл хөндөгдөөгүй)', oid) };
      }
    }
    const old = (await subRowsFor([oid])).get(oid) ?? [];
    const used = new Set<number>(old.map((a) => Number(a.at)).filter(Number.isFinite));
    const pickGen = (): number => {
      for (;;) {
        const g = p.at - (1 + Math.floor(Math.random() * 3990)) / 4096;
        if (!used.has(g)) { used.add(g); return g; }
      }
    };
    const gens: number[] = [];
    let vis: ReadonlyMap<string, Attrs> = new Map();
    let prevGen: number | undefined;
    const ap = p.archiving?.prev;
    if (ap && p.archiving?.prevGen == null) {
      prevGen = pickGen();
      const snap = subToRows({ cells: ap.cells, dates: [], rowKeys: ap.rowKeys, ...(ap.rowOcc ? { rowOcc: ap.rowOcc } : {}), asOf: null }, fr);
      const wp = await subWriteGen(oid, p.pkgKey, snap, vis, prevGen);
      if (!wp.ok) return { ok: false, error: wp.error };
      vis = snap;
      gens.push(prevGen);
    }
    const gen = pickGen();
    const w = await subWriteGen(oid, p.pkgKey, subToRows(p, fr), vis, gen);
    if (!w.ok) return { ok: false, error: w.error };
    gens.push(gen);
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (prevGen != null && obj.archiving && typeof obj.archiving === 'object') obj.archiving = { ...(obj.archiving as Record<string, unknown>), prevGen };
    const next = JSON.stringify({ ...obj, gens });
    if (next.length > 100_000) return { ok: false, error: tr('Илгээлт №{0}-ийн payload хэт урт', oid) };
    /* ⚠️ `at`-ийн CAS (уншсанаас хойш дахин илгээгдсэн бол бичихгүй — шинэ агуулгыг хуучин үеэр солихгүй) */
    const again = await headAt(oid);
    if (!again || String(again.a.payload ?? '') !== raw) return { ok: false, error: tr('Илгээлт №{0} шилжүүлэх явцад өөрчлөгдсөн — дахин оролдоно уу', oid) };
    const r = await h0.fl.applyEdits({ updateFeatures: [{ attributes: { objectid: oid, payload: next } }] } as Parameters<typeof h0.fl.applyEdits>[0]);
    const err = updOk(r);
    if (err) return { ok: false, error: err };
    await setHeaderCols(oid, { mur_turul: 'tolgoi', mur_key: 'h', noorog_turul: 'ilgeelt', huvilbar: ROW_VERSION, huuchin_at: p.at }).catch(() => undefined);
    void subGc(oid, gens, prevGen != null ? [prevGen] : []).catch(() => 0);
    return { ok: true, migrated: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/** Тулгалт — мөрөөс угсарсан нүд = payload-ын нүд? (`pending` = мөр рүү ороогүй; v3 мета = харьцуулах JSON алга → `same`) */
export async function compareSubmissionRow(oid: number): Promise<'same' | 'diff' | 'pending'> {
  const h0 = await headAt(oid);
  const head = h0 ? parseHead(String(h0.a.payload ?? '')) : null;
  if (!head || !head.gens) return 'pending';
  if (head.meta) return 'same';
  const p = await assemble(oid, head);
  /* ⚠️ 2026-10-26: нэмэлтийн горимд утга ижил (`normIncCells`) бол ижил — НИЙТ горимд ЯГ */
  return sameContent(p, head.p) ? 'same' : 'diff';
}

/** PHASE B — мөр тулгагдсан (`gens`-тэй, нүд нь ижил) толгойн payload-аас нүдийг хасна (v3 мета) */
export async function stripSubmissionPayload(oid: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const h0 = await headAt(oid);
    const head = h0 ? parseHead(String(h0.a.payload ?? '')) : null;
    if (!h0 || !head) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', oid) };
    if (!head.gens) return { ok: false, error: tr('Илгээлт №{0} мөр рүү шилжээгүй', oid) };
    if (head.meta) return { ok: true };
    /* «архивлаж байна» тэмдгийн хуулбар үегүй (`prevGen`) бол мета-д алдагдана — хасахгүй */
    if (head.p.archiving?.prev && head.p.archiving.prevGen == null) return { ok: false, error: tr('Илгээлт №{0} архивлагдаж буй — дараа хасна', oid) };
    const p = await assemble(oid, head);
    if (!sameContent(p, head.p)) return { ok: false, error: tr('Илгээлт №{0}-ийн мөр payload-аас зөрсөн — хасаагүй', oid) };
    const r = await h0.fl.applyEdits({ updateFeatures: [{ attributes: { objectid: oid, payload: headRaw(p, head.gens, true) } }] } as Parameters<typeof h0.fl.applyEdits>[0]);
    const err = updOk(r);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
