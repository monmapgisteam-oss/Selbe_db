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
 * `sub|<pkgKey>` мөрөнд хадгалагдаж, ерөнхий менежер БАТЛАХАД л
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
import { t as tr } from '@/lib/i18nCore';
/* ⚠️ Нэмэлтийн мөрийн ГАНЦ дүрэм `bagtsSheet`-д (2026-09-25) — энд давтаж бичвэл
   нэгтгэл ба overlay хоёр өөрөөр уншиж эхэлнэ. Цэвэр функцууд л. */
import { negInc, parseInc, sumInc } from '@/modules/sheet/bagtsSheet';

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
/** Тэмдэг ШИНЭ үү (`ARCHIVING_TTL_MS`). ⚠️ Цагийн зөрүүгээр ирээдүйд байвал ч шинэ гэж үзнэ (fail-closed). */
export const markFresh = (m: Pick<ArchivingMark, 'startedAt'>, now = Date.now()): boolean =>
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
  existing: ArchivingMark | undefined, at: number, sid: string, me: string, now = Date.now(),
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
 *    ба `loadRows` ч `OBJECTID ASC`-ээр уншдаг; нэгтгэхээс өмнө хуучин payload
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

type RowAttrs = { OBJECTID?: number; dkey?: string; at?: number; payload?: string };

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
function readRow(a: RowAttrs | undefined): SubRead {
  if (!a || typeof a.OBJECTID !== 'number') return { ok: true, sub: null };
  const dkey = String(a.dkey ?? '');
  if (!isSubmissionKey(dkey)) return { ok: true, sub: null };
  const payload = a.payload ? parseSubmission(String(a.payload)) : null;
  if (!payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', a.OBJECTID) };
  /* Мөрийн `at` талбар нь payload.at-тай адил боловч хуучин/эвдэрсэн мөрд
     байхгүй байж болно — payload-оос нөхнө. */
  const at = isFin(a.at) ? Number(a.at) : payload.at;
  return { ok: true, sub: { oid: a.OBJECTID, at, done: dkey.startsWith(DONE_PREFIX), payload } };
}

/* ⚠️ Хуучин `toStaged` (мөр → `StagedSubmission`, алдааг `null` болгодог)
   ХАСАГДСАН: `readRow` нь «мөр алга» ба «илгээлт атал уншигдсангүй» хоёрыг
   ялгадаг болсон тул алдааг чимээгүй `null` болгох завсрын функц нь тэр
   ялгааг буцаагаад устгах эрсдэлтэй. Чимээгүй хувилбар хэрэгтэй дуудагчид
   `loadActiveSubmission`/`loadSubmissionByOid`-ыг ашиглана. */

const OUT_FIELDS = ['OBJECTID', 'dkey', 'at', 'payload'];

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

/**
 * Багц × ӨДРИЙН ИДЭВХТЭЙ илгээлт — байхгүй/алдаа бол `null`.
 * ⚠️ Давхардвал (зэрэгцээ бичилтийн race) OBJECTID хамгийн ИХ нь ялна —
 *    `saveSubmission` мөн их OBJECTID-д бичиж бусдыг устгадаг тул нийцнэ.
 * ⚠️ Унших зам чимээгүй: алдаа → `null` (илгээлтгүйтэй ижил) — компанийн
 *    хуудас overlay-гүй ч ачаалагдана.
 */
export async function loadActiveSubmission(
  pkgKey: string,
  fillMs?: number | null,
): Promise<StagedSubmission | null> {
  const r = await readActiveSubmission(pkgKey, fillMs);
  return r.ok ? r.sub : null;
}

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
      orderByFields: ['OBJECTID DESC'],
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
    const r = readRow(legacy);
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
      orderByFields: ['OBJECTID DESC'],
    });
    const out: StagedSubmission[] = [];
    for (const f of res.features) {
      const a = f.attributes as RowAttrs | undefined;
      if (!String(a?.dkey ?? '').startsWith(SUB_PREFIX)) continue;
      const r = readRow(a);
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
      orderByFields: ['OBJECTID DESC'],
    });
    let hit: StagedSubmission | null = null;
    for (const f of res.features) {
      const r = readRow(f.attributes as RowAttrs | undefined);
      if (!r.ok || !r.sub || r.sub.payload.pkgKey !== pkgKey) continue;
      if (!(r.sub.payload.nonces ?? []).includes(nonce)) continue;
      if (!r.sub.done) return { ok: true, sub: r.sub };
      hit ??= r.sub;
    }
    return { ok: true, sub: hit };
  } catch (e) {
    return { ok: false, error: tr('Илгээлтийн төлөвийг шалгаж чадсангүй: {0}', errMsg(e)) };
  }
}

/**
 * Илгээлт OBJECTID-оор — хяналтын бүртгэлийн `Эх_мөрийн_дугаар`-аас.
 * `done` = `dkey` нь `done|`-оор эхэлдэг (батлагдсан, архивт орсон).
 *
 * ⚠️ Зөвхөн `sub|`/`done|` мөрийг буцаана: хуучин хяналтын мөрүүдэд
 *    `Эх_мөрийн_дугаар` нь АРХИВЫН OBJECTID тул энэ хүснэгтийн ноорогийн
 *    мөртэй санамсаргүй давхцаж болно — тэр үед `null` буцааж legacy зам
 *    (архивын OBJECTID) ажиллана.
 */
export async function loadSubmissionByOid(oid: number): Promise<StagedSubmission | null> {
  const r = await readSubmissionByOid(oid);
  return r.ok ? r.sub : null;
}

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
      where: `OBJECTID = ${oid}`,
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
  const cb = bagtsFor(me, 'company');
  if (cb === null || cb.includes(group)) return null;
  if (allowChief) {
    const ch = bagtsFor(me, 'chief');
    if (ch === null || ch.includes(group)) return null;
  }
  return tr('Та «{0}» багцын гүйцэтгэгчээр томилогдоогүй тул гүйцэтгэл илгээх эрхгүй.', group);
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
): Promise<{ ok: true; oid: number } | { ok: false; error: string }> {
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
  if (typeof window !== 'undefined' && payload.residual !== true) {
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
  if (raw.length > SUBMISSION_MAX) {
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
    const deny = await companyDeny(grp, payload.residual === true);
    if (deny) return { ok: false, error: deny };
    /* ⚠️ 2026-10-09 (хэрэглэгч: «нэг удаа явуулаад 6 шат бүрэн давж байж дараа дахин бөглөх»): хуудсанд
       хяналтад явж буй илгээлт байвал шинэ илгээлт ч, тэрийг доор нь солих ч ХОРИГЛОНО
       (`hyanaltSubmit.reviewLockDays`-ийн ⚠️). Үлдэгдэл (`residual`) — газрын даргын архивын дараах
       ШИНЭ тойрог, хориг БИШ. ⚠️ Бичихээс ӨМНӨ — `submitForReview` агуулга бичигдсэний ДАРАА дуудагддаг. */
    if (payload.residual !== true) {
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
      outFields: ['OBJECTID', 'dkey', 'at', 'payload'],
      returnGeometry: false,
      orderByFields: ['OBJECTID ASC'],
    });
    const all = found.features.filter((f) => typeof f.attributes?.OBJECTID === 'number');
    const feats = all.filter((f) => {
      const k = String(f.attributes.dkey ?? '');
      if (k === dkey) return true;
      if (k !== legacyK) return false;
      /* Хуучин мөр — ЗӨВХӨН ижил өдрийнх бол энэ илгээлтийн мөр гэж үзнэ. */
      const p = parseSubmission(String(f.attributes.payload ?? ''));
      return !!p && p.fillMs === payload.fillMs;
    });
    const oids = feats.map((f) => f.attributes.OBJECTID as number);
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
    if (target != null) {
      const curP = parseSubmission(String(feats[feats.length - 1].attributes.payload ?? ''));
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
    const attrs = { dkey, usr: auth.user.toLowerCase(), pkg: pkgKey, at: payload.at, payload: raw };
    const edit = {
      ...(target != null
        ? { updateFeatures: [{ attributes: { OBJECTID: target, ...attrs } }] }
        : { addFeatures: [{ attributes: attrs }] }),
      ...(dupes.length ? { deleteFeatures: dupes.map((objectId) => ({ objectId })) } : {}),
    };
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    const results = [...(r.addFeatureResults ?? []), ...(r.updateFeatureResults ?? [])];
    /* ⚠️ ХООСОН ХАРИУГ БАС БАРИНА (2026-09-15-ны аудит): `applyEdits` нь
       алдаагүй атлаа үр дүнгүй буцаж болно. Доорх OID шалгуур нь `add`-ыг
       барьдаг ч `update`-д `target` аль хэдийн мэдэгдэж байдаг тул барьдаггүй
       байв — тиймээс хариу ирсэн эсэхийг ЭНД шалгана. */
    if (!results.length) {
      return { ok: false, error: tr('Илгээлт хадгалагдсангүй: серверээс хариу ирсэнгүй.') };
    }
    const bad = results.find((x) => x.error != null);
    if (bad) return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(bad.error)) };
    const oid = target ?? results[0]?.objectId;
    if (typeof oid !== 'number' || !(oid > 0)) {
      return { ok: false, error: tr('Илгээлт хадгалагдсангүй: серверээс мөрийн дугаар ирсэнгүй') };
    }
    const badDel = (r.deleteFeatureResults ?? []).find((x) => x.error != null);
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
        outFields: ['OBJECTID', 'usr', 'at'],
        returnGeometry: false,
        orderByFields: ['OBJECTID ASC'],
      });
      const rowsB = back.features.filter((f) => typeof f.attributes?.OBJECTID === 'number');
      const mineB = rowsB.find((f) => f.attributes.OBJECTID === oid);
      const lost = tr('Энэ багцад өөр хэрэглэгч илгээлт хийсэн байна — хуудсыг дахин ачаалж, ноорогоо сэргээгээд үргэлжлүүлнэ үү.');
      if (mineB && target == null && (rowsB[0].attributes.OBJECTID as number) < oid) {
        const del = await fl.applyEdits({ deleteFeatures: [{ objectId: oid }] } as Parameters<typeof fl.applyEdits>[0]);
        const dr = del.deleteFeatureResults ?? [];
        if (dr.length && dr.every((x) => x.error == null)) return { ok: false, error: lost };
      } else if (mineB && isFin(mineB.attributes.at) && (Number(mineB.attributes.at) !== payload.at
        || String(mineB.attributes.usr ?? '').toLowerCase() !== attrs.usr)) {
        return { ok: false, error: lost };
      }
    } catch { /* баталгааны уншилт унасан — бичилт батлагдсан хэвээр */ }
    return { ok: true, oid };
  } catch (e) {
    return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(e)) };
  }
}

/**
 * ИЛГЭЭЛТИЙГ ХААНА — ерөнхий менежер баталж архивт бичсэний ДАРАА.
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
      where: `OBJECTID = ${oid}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
    });
    const a = res.features[0]?.attributes as RowAttrs | undefined;
    if (!a) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
    const dkey = String(a.dkey ?? '');
    if (dkey.startsWith(DONE_PREFIX)) return { ok: true };
    if (!dkey.startsWith(SUB_PREFIX)) return { ok: false, error: tr('Мөр №{0} нь илгээлт биш ({1})', oid, dkey) };
    const payload = parseSubmission(String(a.payload ?? ''));
    if (!payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', oid) };
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
        attributes: { OBJECTID: oid, dkey: doneKey(pkgKey, oid), payload: JSON.stringify(next) },
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
    const res = await fl.queryFeatures({ where: `OBJECTID = ${oid}`, outFields: OUT_FIELDS, returnGeometry: false });
    const a = res.features[0]?.attributes as RowAttrs | undefined;
    if (!a) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
    const dkey = String(a.dkey ?? '');
    if (!dkey.startsWith(SUB_PREFIX)) return { ok: false, changed: true, error: tr('Мөр №{0} нь илгээлт биш ({1})', oid, dkey) };
    const payload = parseSubmission(String(a.payload ?? ''));
    if (!payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', oid) };
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
    if (mark) next.archiving = { ...mark, by: mark.by ?? me, sid: SESSION_ID }; else delete next.archiving;
    /* ⚠️ 2026-10-09 (R2/7): `at` талбарыг payload-тай НЭГ бичилтээр (атом) бичнэ, дараа нь ДАХИН уншиж
       батална. Урьд нь зөвхөн payload бичдэг байв: унших → бичих завсарт гүйцэтгэгч дахин илгээвэл мөрийн
       `at` нь ШИНЭ, payload нь ХУУЧИН (+тэмдэг) болж зөрдөг — уншигч (`readRow`) мөрийн `at`-ийг түрүүлж
       авдаг тул хуучин агуулга шинэ хувилбарын нэрээр харагдана. Одоо мөр үргэлж өөртөө нийцтэй
       (`at` = payload.at). Бичсэний дараах уншилтаар `at` өөрчлөгдсөн эсвэл тэмдэг алга бол (манай
       бичилтийн ДАРАА өөр бичилт орсон) `changed` — дуудагч архивлахгүй. ArcGIS-д CAS байхгүй тул
       унших → бичих хоорондох мс-ийн цонх хэвээр (`closeSubmission`-ийн ⚠️). */
    const r = await fl.applyEdits({
      updateFeatures: [{ attributes: { OBJECTID: oid, at: curAt, payload: JSON.stringify(next) } }],
    } as Parameters<typeof fl.applyEdits>[0]);
    const err = updOk(r);
    if (err) return { ok: false, error: err };
    const res2 = await fl.queryFeatures({ where: `OBJECTID = ${oid}`, outFields: OUT_FIELDS, returnGeometry: false });
    const a2 = res2.features[0]?.attributes as RowAttrs | undefined;
    const p2 = a2 ? parseSubmission(String(a2.payload ?? '')) : null;
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
export async function archivingBusy(pkgKey: string): Promise<{ who: string; at: number } | null> {
  const u = await readUrl();
  if (!u.ok) throw new Error(u.error);
  if (!u.url) return null;
  const fl = await layer(u.url);
  const res = await fl.queryFeatures({
    where: `pkg = ${sqlStr(pkgKey)} AND dkey LIKE ${sqlStr(`${SUB_PREFIX}%`)} AND payload LIKE '%"archiving"%'`,
    outFields: OUT_FIELDS,
    returnGeometry: false,
    orderByFields: ['OBJECTID ASC'],
  });
  const now = Date.now();
  let best: { who: string; at: number } | null = null;
  for (const f of res.features) {
    const r = readRow(f.attributes as RowAttrs | undefined);
    if (!r.ok || !r.sub || r.sub.done || r.sub.payload.pkgKey !== pkgKey) continue;
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
      where: `OBJECTID = ${sheetOid}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
    });
    const a = res.features[0]?.attributes as RowAttrs | undefined;
    if (!a || !String(a.dkey ?? '').startsWith(DONE_PREFIX)) return { ok: true };
    const payload = parseSubmission(String(a.payload ?? ''));
    if (!payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', sheetOid) };
    if (payload.regPending !== true) return { ok: true };
    const next: SubmissionPayload = { ...payload };
    delete next.regPending;
    const r = await fl.applyEdits({
      updateFeatures: [{ attributes: { OBJECTID: sheetOid, payload: JSON.stringify(next) } }],
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
      orderByFields: ['OBJECTID ASC'],
    });
    const out: StagedSubmission[] = [];
    for (const f of res.features) {
      const r = readRow(f.attributes as RowAttrs | undefined);
      if (r.ok && r.sub && r.sub.done && r.sub.payload.regPending === true) out.push(r.sub);
    }
    return out;
  } catch {
    return [];
  }
}
