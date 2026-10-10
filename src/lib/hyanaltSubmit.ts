/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ» → ХЯНАЛТАД АВТОМАТААР ОРУУЛАХ ГҮҮР.
 *
 * Компани хуудсаа бөглөж «Нийтлэх» дармагц ЭНД нэг хяналтын бүртгэл үүснэ.
 * Тэр агшнаас эхлэн ажил талбайн инженерийн дараалалд орно.
 *
 * ⚠️ «НИЙТЛЭХ» НЬ ОДОО АРХИВТ БИЧИХГҮЙ (2026-09-04). Урьд нь `FillNew.publish`
 * бүтэн жаазыг `Bagts_*` (ҮНДСЭН ДАТА) руу бичээд дараа нь энд бүртгүүлдэг
 * байсан тул хянагч буцаасан ч тоо нь үндсэн өгөгдөлд аль хэдийн сууж байлаа.
 * Одоо «Нийтлэх» = ИЛГЭЭХ: diff нь `Selbe_Guitsetgel_Draft`-ийн `sub|<pkgKey>`
 * мөрөнд хадгалагдаж, архивт зөвхөн `hyanaltStore.apply` (ерөнхий менежерийн
 * зөвшөөрөл) дотроос бичигдэнэ.
 *
 * ⚠️ НИЙТЛЭЛ БҮРД НЭГ бүртгэл — мөр бүрд БИШ. Багцын хуудас хэдэн зуун мөртэй
 * тул мөр тус бүрд бүртгэл үүсгэвэл инженер зуу зуун зөвшөөрөл дарах болно.
 * Нэгж нь «тухайн багцын тухайн өдрийн гүйцэтгэл» юм.
 *
 * ⚠️ `Ажлын_нэр`-д ОГНОО ордог. Эс бөгөөс өдөр бүрийн нийтлэл нэг ажилд
 * нийлж (бүлэглэлт нь багц|ажил|компани гурвыг түлхүүр болгодог), өмнөх
 * өдрийн зөвшөөрөл шинэ өдрийнхийг далдална.
 *
 * ⚠️ ХЯНАЛТ УНАВАЛ НИЙТЛЭЛ УНАХГҮЙ. Гүйцэтгэлийн өгөгдөл аль хэдийн
 * хадгалагдсан байхад хяналтын бүртгэл үүсээгүйгээс болж «нийтлэгдсэнгүй» гэж
 * харуулбал компани дахин дарж, архивт давхардсан агшин үүснэ.
 */

import { BUILDING } from './services';
import { t as tr } from '@/lib/i18nCore';
/* ⚠️ `arcgisPost` (2026-09-30): урьд нь шууд `fetch` байв — токеныг хүсэлтийн өмнө
   шинэчилж 498-д нэг удаа дахин оролдоно; HTTP 200-аар ирсэн `error`-ыг шидэж
   доорх `catch`-д орно (урьдын адил кэшлэхгүй, `''` буцаана). */
import { arcgisPost } from '@/lib/authToken';
import { addRows, addedOid, deleteRow, ensureUniqueId, queryAll, F, HYANALT, OWNER, STATUS, type Attrs, type Row, type Status } from './hyanalt';
/* ⚠️ 2026-10-09 (аудит №2): хяналтын хориг хянагчийн дараалалтай (`Guitsetgel`) ИЖИЛ бүлэглэлтээр */
import { groupWorks } from './hyanaltGroup';

/* ── Багц → гүйцэтгэгч компани ── */

let COMPANY: Map<string, string> | null = null;

/**
 * ⚠️ Багцын бичлэг ХОЁР эх сурвалжид ЗӨРНӨ:
 *     барилгын үйлчилгээ → «Багц 4.2» (цэгтэй)
 *     хуудасны бүртгэл   → «Багц 4-2» (зураастай)
 * Тиймээс харьцуулахын өмнө хоёуланг нь нэг хэвэнд оруулна.
 */
const norm = (s: string) => s.replace(/[\s-]/g, '').replace(/\./g, '').toLowerCase();

async function companyOf(bagts: string): Promise<string> {
  if (!COMPANY) {
    /*
     * ⚠️ АМЖИЛТГҮЙ ХАРИУГ КЭШЛЭХГҮЙ (2026-09-15-ны аудит). Урьд нь `COMPANY`
     *    нь юу ч болсон тавигддаг байсан тул нэг түр саатал (сүлжээ, 200-аар
     *    ирсэн `error`) ХООСОН map-ыг сешн дуустал хөлдөөдөг байв: дараагийн
     *    БҮХ илгээлт хоосон компанийн нэрээр бүртгэгдэж, `groupWorks`-ийн
     *    түлхүүр (`багц|ажил|компани`) өөрчлөгдөж ажил хоёр тасархай болж,
     *    `ergelt` 1 рүү тэглэгддэг. Одоо дараагийн дуудалт дахин оролдоно.
     *
     * ⚠️ ШИДЭХГҮЙ ХЭВЭЭР — компанийн нэр дутуу байх нь нийтлэлийг зогсоох
     *    шалтгаан биш (анхны шийдвэр). Зөвхөн кэш нь л түр зуурынх болов.
     */
    let ok = false;
    const map = new Map<string, string>();
    try {
      /* ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг — `arcgisPost` биеийн `error`-ыг шалгаж шиднэ */
      const j = (await arcgisPost(`${BUILDING.url}/query`, {
        where: '1=1',
        groupByFieldsForStatistics: `${BUILDING.fields.bagts},${BUILDING.fields.contractor}`,
        outStatistics: JSON.stringify([
          { statisticType: 'count', onStatisticField: BUILDING.oid, outStatisticFieldName: 'n' },
        ]),
      })) as { features?: { attributes: Attrs }[] };
      for (const f of j.features ?? []) {
        const k = norm(String(f.attributes[BUILDING.fields.bagts] ?? ''));
        const v = String(f.attributes[BUILDING.fields.contractor] ?? '').trim();
        if (k && v && !map.has(k)) map.set(k, v);
      }
      ok = true;
    } catch {
      /* сүлжээ унасан — кэшлэхгүй, дараагийн удаа дахин оролдоно */
    }
    if (!ok) return '';
    COMPANY = map;
  }
  return COMPANY.get(norm(bagts)) ?? '';
}

/* ── Бүртгэлийн дугаар ── */

const nextId = (rows: Attrs[]) => {
  /*
   * ⚠️ Дугаарыг МӨРИЙН ТООГООР биш, ХАМГИЙН ИХ дугаараар үүсгэнэ. Мөр
   * устгагдсан тохиолдолд тоогоор бодвол давхардсан дугаар гарна.
   */
  const max = rows.reduce((m, r) => {
    const n = Number(String(r[F.id] ?? '').replace(/\D/g, ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `G-${String(max + 1).padStart(6, '0')}`;
};

/* ⚠️ 2026-10-09 (аудит №6): `fillMs` нь UTC шөнө дунд (`nowFillMs` = `Date.UTC(локал он, сар, өдөр)`) тул
   `getUTC*`-ээр задална — локал `getFullYear/getDate` нь сөрөг офсеттой бүсэд өчигдрийг өгдөг байв.
   `useFlow.todayAjilTag`-тай ЗААВАЛ ижил (тэндхийн ⚠️). */
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}`;
};

/**
 * ЭНЭ ӨДРИЙН ИЛГЭЭЛТЭД АЛЬ ХЭДИЙН НЭЭЛТТЭЙ ХЯНАЛТЫН БҮРТГЭЛ БАЙНА УУ?
 *
 * Байвал ШИНЭ мөр үүсгэхгүй — тэр бүртгэлээр нь үргэлжилнэ (`saveSubmission`
 * илгээлтийн мөрийг update хийсэн тул хянагч шинэ агуулгыг тэндээс харна).
 *
 * ⚠️ ЦЭВЭР ФУНКЦ, сүлжээгүй — `hyanaltSubmit.check.mjs` шууд шалгана.
 *    Дүрэм гурван нөхцөлтэй, гурвуулаа бодит согогоос ургасан:
 *
 *    1. `Эх_мөрийн_дугаар === sheetOid` — илгээлтийн мөрийн OBJECTID нь
 *       хянагчийн агуулга олох ганц зам.
 *    2. `Шилжүүлсэн` БИШ — мөчлөг дууссан бол шинэ бүртгэл үүсэх нь зөв.
 *    3. ⚠️⚠️ ХЯНАГЧИЙН ГАР ДЭЭР байх (`OWNER[төлөв] !== 'company'`).
 *       2026-09-07-ны шалгалтын CRITICAL олдвор: буцаагдсан гурван төлөв
 *       (`Инженер буцаасан` · `Менежер буцаасан` · `Ерөнхий менежер буцаасан`)
 *       ч `Шилжүүлсэн` биш тул гүйцэтгэгч засвараа илгээхэд ШИНЭ тойрог
 *       ҮҮСЭХГҮЙ, ажил МӨНХӨД гацах байлаа.
 *    4. ⚠️ `Ажлын_нэр` нь ӨДРӨӨР эхлэх — `closeSubmission` хоёр удаа унасан
 *       ховор тохиолдолд өчигдрийн `sub|` мөр хөлдөөгүй үлдэж, маргааш нь
 *       ЯГ ТЭР OBJECTID дахин ашиглагдвал өчигдрийн хянагдаж буй мөр
 *       өнөөдрийн ажлыг «бүртгэгдсэн» гэж дарах байлаа.
 *    5. ⚠️ ЗӨВХӨН АЖЛЫН ОДООГИЙН (сүүлийн) ТОЙРОГ шалгагдана (2026-09-25-ны
 *       аудит, HIGH). `recheck('ok')` нь ХУУЧИН мөрийг САНААТАЙ засдаггүй
 *       («Менежер буцаасан» хэвээр, OWNER = инженер) бөгөөд шинэ тойрог
 *       нэмдэг. Урьд нь энд ижил `sheetOid`-той БҮХ мөрийг шалгадаг байсан
 *       тул тэр хуучин A мөр үүрд «хянагчийн гар дээр» мэт таарч байв:
 *       одоогийн B тойрог «Инженер буцаасан» болоход гүйцэтгэгчийн засвар
 *       `reused: true` гэж A-д шингэж, ШИНЭ тойрог ҮҮСЭХГҮЙ — B компанид
 *       үлдэж, засварыг хэн ч харахгүй, ажил мөнхөд гацна. Одоо ажил бүрийн
 *       (`багц|ажил|компани`) одоогийн мөрийг `groupWorks`-тэй ИЖИЛ эрэмбээр
 *       (`Хэддэх_удаа`, дараа нь OBJECTID) сонгоод ЗӨВХӨН түүнийг шалгана.
 */
export function openReviewRow(
  rows: readonly Attrs[],
  sheetOid: number | null,
  dayTag: string,
): Attrs | null {
  if (sheetOid == null || sheetOid <= 0) return null;
  const cur = currentRows(rows, sheetOid, (r) => String(r[F.ajil] ?? '').startsWith(dayTag));
  return cur.find((r) => {
    const st = String(r[F.status] ?? '') as Status;
    if (st === STATUS.transferred) return false;
    /* Гүйцэтгэгчийн гар дээр (буцаагдсан) бол ЖИНХЭНЭ дахин илгээлт — шинэ тойрог */
    if (OWNER[st] === 'company') return false;
    return true;
  }) ?? null;
}

/**
 * ИЛГЭЭЛТ ХЯНАЛТАД БҮРТГҮҮЛЭХ ШААРДЛАГАТАЙ ЮУ? (2026-10-04, цэвэр — `hyanaltSubmit.check.mjs`)
 *
 * ⚠️ ЯАГААД: `FillNew`-ийн «өнчин илгээлт» ба «Хяналтад илгээх» нь ижил `sheetOid`-тай
 *    ЯМАР Ч мөр байвал «бүртгэгдсэн» гэж үздэг байв. Буцаагдсан (компанийн гар дээрх)
 *    ХУУЧИН тойрог үүрд таарч, засвараа дахин илгээхэд `submitForReview` унасан бол
 *    засвар инженерт ХЭЗЭЭ Ч хүрэхгүй.
 * Дүрэм (`openReviewRow`-ийн одоогийн тойрог · өдрийн шошго):
 *    · одоогийн мөр байхгүй → ТИЙМ (өнчин);
 *    · хянагчийн гар дээр нээлттэй мөр байна → ҮГҮЙ;
 *    · бүгд «Шилжүүлсэн» → ҮГҮЙ (мөчлөг дууссан);
 *      ⚠️ 2026-10-05 ҮЛ ХАМААРАХ НЬ: илгээлт (`subAt`) эцсийн зөвшөөрлөөс ХОЙШ бол ТИЙМ.
 *      `archiveSubmission` «батлах явцад дахин илгээсэн»-ий ҮЛДЭГДЛИЙГ `sub|` мөрд
 *      (`residual`, `at` = архивлалтын агшин) бичээд, `apply` мөрийг «Шилжүүлсэн» болгосны
 *      ДАРАА шинэ тойрог нээдэг — завсарт нь таб хаагдвал үлдэгдэл хяналтын тойроггүй,
 *      «Хяналтад илгээх» товчгүй өнчирдөг байв. Эцсийн шатны огноо (`t`) нь архивлалтаас
 *      ӨМНӨ, үлдэгдлийн `at` нь ДАРАА (нэг машины цаг) тул харьцуулалт найдвартай;
 *      хэвийн хаагдсан илгээлт `done|` болдог тул энд огт ирэхгүй, хаалт унасан (агуулга
 *      архивт орсон) мөрийн `at` нь зөвшөөрлөөс ӨМНӨХ тул таарахгүй.
 *    · буцаагдсан (компанийн гар дээр) → илгээлт (`subAt`) буцаалтаас ХОЙШ бол ТИЙМ.
 * ⚠️ Огноо нь `Attrs` (epoch ms) ч, `hyanaltStore.Row` (ISO) ч байж болно.
 */
export function needsRegistration(
  rows: readonly Attrs[],
  sheetOid: number | null,
  dayTag: string,
  subAt: number,
): boolean {
  if (sheetOid == null || sheetOid <= 0) return false;
  const cur = currentRows(rows, sheetOid, (r) => String(r[F.ajil] ?? '').startsWith(dayTag));
  if (!cur.length) return true;
  if (openReviewRow(rows, sheetOid, dayTag)) return false;
  const ms = (v: unknown): number => {
    if (typeof v === 'number') return v;
    const t = typeof v === 'string' && v ? Date.parse(v) : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  const RET = [F.engineerReturned, F.managerReturned, F.directorReturned, F.headReturned, F.chiefReturned];
  /* ⚠️ 2026-10-05: «Шилжүүлсэн» мөрийн эцсийн зөвшөөрлийн агшин — огноогүй (0) бол дүгнэхгүй */
  const SENT = [F.engineerSent, F.managerSent, F.directorSent, F.headSent, F.chiefSent];
  return cur.some((r) => {
    const st = String(r[F.status] ?? '') as Status;
    if (st === STATUS.transferred) {
      const fin = Math.max(0, ...SENT.map((k) => ms(r[k])));
      return fin > 0 && subAt > fin;
    }
    if (OWNER[st] !== 'company') return false;
    const back = Math.max(0, ...RET.map((k) => ms(r[k])));
    return subAt > back;
  });
}

/** Ажлын түлхүүр — `hyanaltGroup.workKey`-тэй ЯГ ИЖИЛ (`багц|ажил|компани`). */
const workKeyOf = (r: Attrs) =>
  `${String(r[F.bagts] ?? '')}|${String(r[F.ajil] ?? '')}|${String(r[F.company] ?? '')}`;

/** `hyanaltStore.toRow`-ын `num`-тэй ижил — тоо биш бол 0. */
const num0 = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * ЭНЭ ИЛГЭЭЛТИЙН (`sheetOid`) АЖИЛ БҮРИЙН ОДООГИЙН МӨР.
 *
 * ⚠️ `groupWorks`-ийн `current`-тай ИЖИЛ дүрэм: `Хэддэх_удаа` их нь, тэнцвэл
 *    OBJECTID их нь, тэр ч тэнцвэл жагсаалтын СҮҮЛИЙНХ (`queryAll` нь
 *    OBJECTID ASC, `groupWorks`-ийн эрэмбэ тогтвортой). Хоёр тал өөр мөрийг
 *    «одоогийн» гэвэл хянагчийн харж буй төлөв ба илгээлтийн шийдвэр зөрнө.
 */
function currentRows(
  rows: readonly Attrs[],
  sheetOid: number,
  pred: (r: Attrs) => boolean,
): Attrs[] {
  const best = new Map<string, Attrs>();
  for (const r of rows) {
    if (Number(r[F.sheetOid]) !== sheetOid || !pred(r)) continue;
    const k = workKeyOf(r);
    const b = best.get(k);
    if (!b) { best.set(k, r); continue; }
    const de = num0(r[F.ergelt]) - num0(b[F.ergelt]);
    /* ⚠️ 2026-10-09 (аудит №6): `Row` (`hyanaltStore.toRow` — `__oid`, `OBJECTID` талбаргүй) оролтод урьд нь
       `r[OBJECTID]` үргэлж 0 болж, ижил `Хэддэх_удаа`-тай мөрүүдээс жагсаалтын сүүлийнх ялдаг байв. */
    const oidOf = (x: Attrs) => num0(x.__oid ?? x[HYANALT.oid]);
    const doid = oidOf(r) - oidOf(b);
    if (de > 0 || (de === 0 && doid >= 0)) best.set(k, r);
  }
  return [...best.values()];
}

/**
 * ХЯНАЛТАД ЯВАА ИЛГЭЭЛТ — энэ хуудсанд шинээр илгээх ХОРИГ (2026-10-09, цэвэр — `hyanaltSubmit.check.mjs`).
 *
 * ⚠️ 2026-10-09 (хэрэглэгч: «гүйцэтгэл бөглөлтийг нэг удаа явуулаад 6 шат бүрэн давж байж дараа дахин
 *    бөглөх боломжтой болго»): 2026-09-07-ны «хэдэн ч удаа илгээж болно» (`FillNew.inReview` зөвхөн
 *    сануулга) шийдвэрийг ХЭРЭГЛЭГЧ ӨӨРЧИЛСӨН. Хуудсанд хянагчийн гар дээр (`OWNER !== 'company'`,
 *    `Шилжүүлсэн` биш) байгаа АЛЬ Ч өдрийн илгээлт байвал шинэ илгээлт ч, тэр илгээлтийг доор нь солих
 *    (`reused`) ч ХОРИГЛОНО — 6-р шат батлаж архивлатал (`Шилжүүлсэн`) хүлээнэ.
 * ⚠️ БУЦААГДСАН (гүйцэтгэгчийн гар дээрх) илгээлт хориг БИШ — засаад дахин илгээх ЁСТОЙ.
 * ⚠️ 2026-10-09 (аудит №2): ажил бүрийн (`groupWorks`) зөвхөн ОДООГИЙН тойргийг харна — доорх
 *    `reviewLockState`-ийн ⚠️ (урьдын `Эх_мөрийн_дугаар`-ын «сүүлийн тойрог» дүрэм хянагчийн харж буйгаас зөрдөг).
 * ⚠️ Хуудсаар: `Ажлын_нэр`-д ӨӨР хуудсын нэр бичигдсэн мөрийг алгасна; хуудсын нэргүй хуучин мөр нь
 *    багцын БҮХ хуудсанд хамаарна (`useFlow`-ийн ⚠️).
 * @returns хоригтой өдрүүдийн шошго («2026.10.04»), хоосон бол хориггүй
 */
/* ⚠️ 2026-10-09 (аудит №2): гүйцэтгэлийн илгээлтийн мөр (`submitForReview`-ийн `Ажлын_нэр` = `dayTagOf(…)…`).
   Огноогүй мөр нь бөглөх хуудасны илгээлт БИШ — хориг ч, буцаалт ч биш (урьд домэйн «?» гэж хаадаг, UI
   алгасдаг байв — хоёр тал зөрдөг). */
const FILL_DAY = /^Гүйцэтгэл · (\d{4}\.\d{2}\.\d{2})/;

/* ⚠️ 2026-10-09 (аудит №2): `Attrs` (`queryAll`, OBJECTID) ба `hyanaltStore.Row` (`__oid`) хоёулаа ирнэ —
   `groupWorks`-ийн уншдаг талбарыг `hyanaltStore.toRow`-тэй ИЖИЛ хөрвүүлнэ (`str`/`num`), эс бөгөөс
   ажлын түлхүүр (`багц|ажил|компани`) ба «одоогийн» тойрог хянагчийн харж буйгаас зөрнө. */
const str0 = (v: unknown): string => (v == null ? '' : String(v));
const asRow = (r: Attrs): Row => ({
  ...r,
  __oid: num0(r.__oid ?? r[HYANALT.oid]),
  [F.ergelt]: num0(r[F.ergelt]),
  [F.bagts]: str0(r[F.bagts]),
  [F.ajil]: str0(r[F.ajil]),
  [F.company]: str0(r[F.company]),
  [F.status]: str0(r[F.status]),
}) as unknown as Row;

export type ReviewLockState = {
  /** Хянагчийн гар дээр (хориг) байгаа өдрүүд («2026.10.04») */
  days: string[];
  /** Гүйцэтгэгч рүү БУЦААГДСАН (засах ёстой) өдрүүд */
  returned: string[];
};

/**
 * ⚠️ 2026-10-09 (аудит №2, HIGH): ХОРИГИЙН ГАНЦ ДҮРЭМ — UI (`useFlow` → `FillNew.reviewLock`) ба домэйн
 *    (`reviewLockDeny` → `saveSubmission`) ХОЁУЛАА энэ функцээс уншина.
 *    Урьд нь UI-ийн `otherDaysInReview` нь БҮХ мөрийг сүүлийн тойргийн дүрэмгүй шүүдэг байв:
 *    `hyanaltStore.recheck('ok')` хуучин мөрийг «Менежер буцаасан» (OWNER = инженер) хэвээр үлдээж шинэ
 *    тойрог нэмдэг тул шинэ тойрог «Шилжүүлсэн» болсны дараа ч хуучин мөр хуудсыг ҮҮРД түгждэг байв.
 *    Мөн хянагчид ХАРАГДДАГГҮЙ хуучирсан мөрүүд (OID 61·62·63·64·70 — `hasOpenLegacy`-ийн ⚠️, нэг нэрээр
 *    нийлж зөвхөн сүүлийнх нь харагддаг) «Инженер хянаж байна» хэвээр тул багцыг түгждэг байв.
 *    Одоо хянагчийн дараалалтай (`Guitsetgel` · `countReviewPending`) ЯГ ИЖИЛ `groupWorks` бүлэглэлт:
 *    ажил бүрийн ОДООГИЙН тойрог (`current`) л тооцогдоно. Хориг ⇔ энэ хуудасны одоогийн ажил хянагчийн
 *    шатанд (`owner !== 'company'`) ба `Шилжүүлсэн` биш.
 */
export function reviewLockState(
  rows: readonly Attrs[],
  bagts: string,
  sheet: string,
  otherSheets: readonly string[],
): ReviewLockState {
  const days = new Set<string>();
  const ret = new Set<string>();
  for (const w of groupWorks(rows.map(asRow))) {
    if (w.bagts !== bagts) continue;
    const m = FILL_DAY.exec(w.ajil);
    if (!m) continue;
    if (sheet && !w.ajil.includes(sheet) && otherSheets.some((n) => n && w.ajil.includes(n))) continue;
    if (w.status === STATUS.transferred) continue;
    (w.owner === 'company' ? ret : days).add(m[1]);
  }
  return { days: [...days].sort(), returned: [...ret].sort() };
}

export function reviewLockDays(
  rows: readonly Attrs[],
  bagts: string,
  sheet: string,
  otherSheets: readonly string[],
): string[] {
  return reviewLockState(rows, bagts, sheet, otherSheets).days;
}

/**
 * ⚠️ 2026-10-09 (аудит №2): ЭНЭ илгээлт (`fillMs`-ийн өдөр) хоригт өртөх үү.
 *    Хориг нь ШИНЭ бөглөлт/илгээлтийг хаана — аль хэдийн БУЦААГДСАН илгээлтийн засварыг БИШ (өөр өдөр
 *    хянагдаж байсан ч). Тэр өдөр өөрөө хянагчийн гар дээр байвал (`days`) засвар биш, хянагдаж буй
 *    агуулгыг доор нь солих (`reused`) тул хориглоно.
 */
export function reviewLockBlocks(st: ReviewLockState, fillMs: number): boolean {
  if (!st.days.length) return false;
  const d = dayLabel(fillMs);
  return !(st.returned.includes(d) && !st.days.includes(d));
}

/**
 * ⚠️ 2026-10-09 (аудит №2): хоригийн мессеж — UI (`RO.reviewLock`) ба домэйн НЭГ бичвэр.
 *    Урьд нь «Өмнөх илгээлт … Буцаагдвал засаад илгээх боломжтой» гэдэг байсан нь худал: өнөөдрийн
 *    илгээлт ч байж болно, буцаагдсан засвар ч өөр өдрийн хоригт хаагддаг байв.
 */
export const reviewLockMsg = (days: string) =>
  tr('Хяналтад явж буй илгээлт ({0}) 6 шатаа бүрэн дуусаагүй байна — 6-р шат батлаж архивласны дараа шинээр бөглөж илгээнэ. Буцаагдсан илгээлтийг засаж дахин илгээх боломжтой.', days);

/**
 * Шинэ илгээлтийн ДОМЭЙН хориг (`reviewLockState`-ийн ⚠️) — `saveSubmission` бичихээс ӨМНӨ дууддаг.
 * ⚠️ FAIL-CLOSED: хяналтын хүснэгт уншигдахгүй бол илгээхгүй (хориг тодорхойгүй).
 * ⚠️ 2026-10-09 (аудит №2): `fillMs` — илгээлтийн өдөр; буцаагдсан илгээлтийн засвар бол хориггүй
 *    (`reviewLockBlocks`).
 */
export async function reviewLockDeny(bagts: string, sheet: string, otherSheets: readonly string[], fillMs: number): Promise<string | null> {
  let rows: Attrs[];
  try {
    rows = await queryAll();
  } catch (e) {
    return tr('Хяналтын бүртгэлийг уншиж чадсангүй — өмнөх илгээлт хянагдаж байгаа эсэх тодорхойгүй тул илгээсэнгүй, дахин оролдоно уу. ({0})', e instanceof Error ? e.message : String(e));
  }
  const st = reviewLockState(rows, bagts, sheet, otherSheets);
  if (!reviewLockBlocks(st, fillMs)) return null;
  return reviewLockMsg(st.days.join(', '));
}

/** Өдрийн шошго — `Ажлын_нэр`-ийн угтвар («Гүйцэтгэл · 2026.09.07») */
export const dayTagOf = (fillMs: number) => `Гүйцэтгэл · ${dayLabel(fillMs)}`;

/**
 * ХУУЧИН (хуудасны шошгогүй) НЭРИЙГ ӨВЛӨХ ЁСТОЙ ЮУ?
 *
 * ⚠️ ЦЭВЭР ФУНКЦ, сүлжээгүй — `hyanaltSubmit.check.mjs` шууд шалгана.
 *
 * ⚠️ `sheetOid` ЗААВАЛ ТААРНА (2026-09-08-ны аудитын CRITICAL олдвор).
 *    Урьд нь зөвхөн (багц·өдөр·компани)-гаар шалгадаг байв. Тэр үед НЭГ
 *    нээлттэй хуучин мөр байхад тэр өдрийн БҮХ шинэ илгээлт (өөр хуудас,
 *    өөр `sheetOid` ч гэсэн) шошгоо ХАЯДАГ байлаа — үүсгэсэн шинэ мөр өөрөө
 *    нээлттэй тул дараагийнх нь бас шошгогүй болж, өөрийгөө тэжээх гогцоо
 *    үүсдэг. Улмаар `groupWorks` (`bagts|ajil|company`) тэдгээрийг НЭГ Work
 *    болгож нийлүүлж, зөвхөн хамгийн сүүлийн тойрог `current` болдог тул
 *    өмнөх илгээлтүүд хянагчийн хуудсанд ОГТ гарахгүй, «Инженер хянаж байна»
 *    төлөвт МӨНХӨД гацаж, архивт хэзээ ч ордоггүй байв (амьд баталгаа:
 *    `guitsetgel_bugluh_hyanalt` OID 61·62·63·64·70 бүгд нэг нэртэй).
 *
 *    Тиймээс хуучин нэрийг ЗӨВХӨН ЯГ ЭНЭ илгээлтийн (`Эх_мөрийн_дугаар ===
 *    sheetOid`) нээлттэй мөрөөс өвлөнө — өөр илгээлтийн нээлттэй мөр байгаа
 *    нь энэ илгээлтээс шошго хасах шалтгаан БИШ. Ингэснээр тухайн илгээлтийн
 *    ӨӨРИЙНХ нь түүх (ergelt тоолуур, буцаалтын түүх) тасрахгүй хэвээр үлдэнэ.
 *
 * ⚠️ ЗӨВХӨН ОДООГИЙН ТОЙРОГ (2026-09-25-ны аудит) — `openReviewRow`-ийн 5-р
 *    дүрэмтэй ижил: `recheck('ok')`-оор дарагдсан хуучин мөр «Шилжүүлсэн»
 *    болдоггүй тул ажил аль хэдийн ДУУССАН (одоогийн мөр нь «Шилжүүлсэн»)
 *    байхад ч хуучин нэрийг үүрд өвлүүлж, шинэ шошготой хэлбэрт шилжихгүй
 *    байлаа.
 */
export function hasOpenLegacy(
  rows: readonly Attrs[],
  bagts: string,
  company: string,
  legacyAjil: string,
  sheetOid: number | null,
): boolean {
  if (sheetOid == null || sheetOid <= 0) return false;
  return currentRows(
    rows,
    sheetOid,
    (r) =>
      String(r[F.bagts] ?? '') === bagts &&
      String(r[F.company] ?? '') === company &&
      String(r[F.ajil] ?? '') === legacyAjil,
  ).some((r) => String(r[F.status] ?? '') !== STATUS.transferred);
}

/**
 * Нийтэлсэн гүйцэтгэлийг хяналтад бүртгэнэ.
 *
 * @param bagts    багцын нэр — «Багц 4-2» маягаар
 * @param fillMs   бөглөсөн өдөр (илгээлтийн `payload.fillMs`; батлагдахад
 *                 архивын жаазны `buglusun_ognoo` болно)
 * @param sheetOid ИЛГЭЭЛТИЙН мөрийн OBJECTID (`Selbe_Guitsetgel_Draft`,
 *                 `sub|<pkgKey>`). ⚠️ Архивын дугаар БИШ — гүйцэтгэл нь
 *                 хараахан архивт ороогүй; `hyanaltDetail`/`hyanaltStore`
 *                 үүгээр илгээлтийг олно.
 * @param sheet    ХУУДСЫН нэр («Багц 1 · 9 давхар») — доорх ⚠️.
 *                 ⚠️ ЗААВАЛ `pkg.name` (орчуулагддаггүй эх нэр), `pkg.label`
 *                 БИШ (2026-09-21): энэ утга `Ажлын_нэр`-д БИЧИГДЭЖ, `FillNew`
 *                 нь `includes(pkg.name)`-ээр урсгалын мөрөө олдог тул англи
 *                 UI-ийн орчуулсан `label` бичигдвэл мөр хэлээс хамаарч
 *                 олдохгүй, 9F/12F ялгаа тасарна.
 * @returns бүртгэлийн дугаар, эсвэл алдааны мессеж
 */
export async function submitForReview(
  bagts: string,
  fillMs: number,
  sheetOid: number | null,
  sheet = '',
): Promise<{ ok: true; id: string; reused?: true } | { ok: false; error: string }> {
  try {
    /* ⚠️ 2026-10-06 (аудит #2): ИЛГЭЭХ ЭРХ lib-д — `company` шатанд энэ багцад томилогдсон
       (эсвэл дев/хатуу super). Газрын дарга ч болно: `hyanaltStore.apply` үлдэгдэл нэмэлтийн
       шинэ тойргийг өөрийн нэрээр нээдэг (`companyDeny`-ийн ⚠️). Урьд нь хэн ч дуудаж болдог байв. */
    if (typeof window !== 'undefined') {
      const { companyDeny } = await import('./submission');
      const deny = await companyDeny(bagts, true);
      if (deny) return { ok: false, error: deny };
    }
    const [rows, company] = await Promise.all([queryAll(), companyOf(bagts)]);
    const id = nextId(rows);
    /*
     * ⚠️ АЖЛЫН НЭРЭНД ХУУДСЫГ ОРУУЛНА (2026-09-04-ний аудит). Илгээлт нь
     *    ХУУДСААР (`sub|<pkgKey>`), харин хяналтын бүлэглэлт нь БАГЦААР
     *    (`bagts|ajil|company`) явдаг байв. Багц 1 · Багц 2 · Багц 4-2 гурав
     *    нь 9 ба 12 давхрын ХОЁР хуудастай тул нэг өдөр хоёуланг илгээвэл
     *    `groupWorks` тэднийг НЭГ ажил болгож нийлүүлж, зөвхөн хамгийн их
     *    OID-тай дээр нь шийдвэр бичдэг — нөгөө хуудасны илгээлт мөнхөд
     *    «Инженер хянаж байна» төлөвт гацаж, архивт хэзээ ч ордоггүй байлаа.
     *    Хуудсын нэр орсноор түлхүүр сална.
     * ⚠️ ОГНОО ЗААВАЛ — өдөр бүрийн нийтлэл тусдаа ажил байх ёстой.
     */
    /*
     * ⚠️ ШИЛЖИЛТИЙН ДҮРЭМ (2026-09-04-ний аудит): хуудсын нэр нэмэгдсэн нь
     *    `groupWorks`-ийн түлхүүрийг (багц|ажил|компани) ӨӨРЧИЛСӨН тул ХУУЧИН
     *    хэлбэрээр (шошгогүй) үүссэн, хараахан ДУУСААГҮЙ мөрүүд дараагийн
     *    илгээлтээр өнчирч, хяналтын жагсаалтад МӨНХӨД нээлттэй үлдэх байлаа:
     *    буцаалт ихтэй тул жагсаалтын эхэнд сортлогдож, инженерийн «хэдэн удаа
     *    буцаасан» тоолуур тэглэгдэж, аудитын түүх хоёр тасархай болно.
     *    Тиймээс тухайн (багц·өдөр·компани)-д ХУУЧИН түлхүүртэй, `Шилжүүлсэн`
     *    болоогүй мөр байвал ТҮҮНИЙ нэрийг ӨВЛӨНӨ — түүх нэг ажил дээр
     *    үргэлжилнэ. Хуучин мөрүүд дуусмагц шинэ (шошготой) хэлбэр өөрөө
     *    хүчин төгөлдөр болно.
     */
    const legacyAjil = `Гүйцэтгэл · ${dayLabel(fillMs)}`;
    const openLegacy = hasOpenLegacy(rows, bagts, company, legacyAjil, sheetOid);
    const ajil = !sheet || openLegacy ? legacyAjil : `${legacyAjil} · ${sheet}`;
    /*
     * ТОЙРГИЙН ДУГААР — тухайн (багц|ажил|компани) түлхүүрийн ХАМГИЙН ИХ + 1.
     *
     * ⚠️ ЯАГААД (2026-09-04-ний аудит): урьд нь ҮРГЭЛЖ `1` бичигддэг байсан
     *    тул инженер буцаагаад компани дахин илгээх бүрд «1 дэх тойрог» гэсэн
     *    шинэ мөр үүсч, нэг өдөрт гурван удаа буцвал ergelt=1-тэй ГУРВАН мөр
     *    үүсдэг байв. `hyanaltGroup.groupWorks` нь `ergelt`-ээр эрэмбэлдэг тул
     *    тэдгээр нь зөвхөн OBJECTID-аар л ялгарч, дэлгэц дээрх «тойрог»
     *    тоолол бодит бус болно; `hyanaltStore.recheck`-ийн `twin` шалгуур ч
     *    ижил дугаартай мөрүүд дээр буруу дүгнэлт өгөх эрсдэлтэй.
     * ⚠️ `queryAll()` аль хэдийн татагдсан тул нэмэлт хүсэлт шаардахгүй.
     */
    const ergelt = rows.reduce((m, r) => {
      if (String(r[F.bagts] ?? '') !== bagts) return m;
      if (String(r[F.ajil] ?? '') !== ajil) return m;
      if (String(r[F.company] ?? '') !== company) return m;
      const n = Number(r[F.ergelt]);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0) + 1;

    /*
     * ⚠️ ТЭР ӨДРИЙН ИЛГЭЭЛТЭД ХОЁР ДАХЬ ХЯНАЛТЫН МӨР ҮҮСГЭХГҮЙ (2026-09-07).
     *
     *    ЯАГААД: 2026-09-07-оос «хянагдаж байхад дахин илгээх» хориг
     *    (`FillNew.inReview`) ХАСАГДСАН — хэрэглэгч «хэдэн ч удаа илгээх
     *    боломжтой байх ёстой» гэж шаардсан. Тэр хориг нь энэ функцийн ЦОРЫН
     *    ГАНЦ idempotency хамгаалалт байсан тул хасагдмагц нэг өдөрт «Илгээх»
     *    дарах бүрд ergelt+1-тэй ШИНЭ мөр үүсч, нэг илгээлт олон тойрог мэт
     *    харагдаж, инженерийн дараалал давхардсан мөрөөр дүүрэх байлаа.
     *
     *    Хэрэглэгчийн шийдвэр (2026-09-07): «төдий өдрийн илгээлтийг дахин
     *    илгээвэл ТЭР өдрийн илгээлт update хийгдэнэ — шинэ тойрог үүсгэхгүй».
     *    Тиймээс тэр илгээлтийн мөрийг (`Эх_мөрийн_дугаар === sheetOid`)
     *    заасан, ХААГДААГҮЙ (`Шилжүүлсэн` биш) бүртгэл байвал БАЙГААГ нь
     *    буцаана — `saveSubmission` тэр өдрийн `sub|` мөрийг update хийсэн
     *    тул хянагч ШИНЭ агуулгыг тэр мөрөөрөө харна.
     *
     *    ⚠️ `sheetOid`-ЭЭР тулгана, (багц|ажил|компани)-гаар БИШ: илгээлтийн
     *    мөрийн OBJECTID нь өдөр × хуудсаар давтагдашгүй бөгөөд хянагч яг
     *    түүгээр агуулгыг олдог. `resend` (FillNew) ч ИЖИЛ шалгуур ашигладаг.
     *
     *    ⚠️⚠️ ЗӨВХӨН ХЯНАГЧИЙН ГАР ДЭЭРХ мөрд үйлчилнэ (`OWNER[төлөв] !== 'company'`).
     *    2026-09-07-ны шалгалтын CRITICAL олдвор: эхний хувилбар нь «`Шилжүүлсэн`
     *    БИШ бүх мөр» гэж шалгадаг байв. Гэтэл БУЦААГДСАН гурван төлөв
     *    (`Инженер буцаасан` · `Менежер буцаасан` · `Ерөнхий менежер буцаасан`)
     *    ч мөн `Шилжүүлсэн` биш тул гүйцэтгэгч засвараа илгээхэд ШИНЭ тойрог
     *    ҮҮСЭХГҮЙ, буцаагдсан мөр `Инженер хянаж байна` руу ЭРГЭЖ ОРОХГҮЙ —
     *    ажил МӨНХӨД гацах байлаа. `OWNER` (`hyanalt.ts`) нь буцаалтыг
     *    `company` руу заадаг тул тэр гурав энэ шалгуураас ГАРНА.
     *
     *    ⚠️ Ижил шалтгаанаар `Шилжүүлсэн` ч гарна (`OWNER` = `director` ч
     *    гэсэн мөчлөг дууссан) — доорх `transferred` шалгуур хэвээр.
     */
    const open = openReviewRow(rows, sheetOid, legacyAjil);
    /* ⚠️ `reused` — дуудагч «ШИНЭ тойрог үүсэв» ба «байгаа илгээлт
       шинэчлэгдэв» хоёрыг ЯЛГАЖ мэдэгдэнэ (2026-09-07-ны шалгалт). */
    if (open) return { ok: true, id: String(open[F.id] ?? ''), reused: true };

    const attrs: Attrs = {
      [F.id]: id,
      [F.sheetOid]: sheetOid ?? 0,
      [F.ergelt]: ergelt,
      [F.bagts]: bagts,
      [F.ajil]: ajil,
      [F.company]: company,
      [F.companySent]: Date.now(),
      [F.engineer]: '', [F.engineerDecision]: '', [F.engineerReason]: '',
      [F.engineerReturned]: null, [F.engineerSent]: null,
      [F.manager]: '', [F.managerDecision]: '', [F.managerReason]: '',
      [F.managerReturned]: null, [F.managerSent]: null,
      [F.status]: STATUS.engineerReview,
    };

    const res = await addRows([attrs]);
    /*
     * ⚠️ 2026-10-05: ДАВХАР ТОЙРОГ АРИЛГАХ (`huvaariBatlah.submitPlan`-ийн загвар). Дээрх
     *    `openReviewRow` шалгалт ба `adds` хоёрын завсарт хоёр хамтран бөглөгч / хоёр таб
     *    буцаагдсан илгээлтийг зэрэг дахин илгээвэл хоёулаа шалгалтыг давж ИЖИЛ тойргийн
     *    хоёр мөр үүсдэг байв — `groupWorks` их OBJECTID-тайг «одоогийн» болгодог тул нөгөө нь
     *    мөнхөд «Инженер хянаж байна» төлөвт үлдэнэ. Бичсэний ДАРАА дахин уншиж, ижил
     *    (илгээлт · ажил · тойрог)-той БАГА OBJECTID-тай мөр байвал ӨӨРИЙНХӨӨ мөрийг устгана —
     *    хоёр тал ижил дүрмээр шийддэг тул яг нэг нь үлдэнэ (түрүүлж бичигдсэн нь).
     * ⚠️ Шалгалт/устгал унавал илгээлтийг УНАГАХГҮЙ — мөр аль хэдийн бичигдсэн (урьдын зан төлөв).
     */
    const mine = addedOid(res);
    if (mine > 0 && sheetOid != null && sheetOid > 0) {
      try {
        const wk = workKeyOf(attrs);
        const twin = (await queryAll())
          .filter((r) => {
            const o = num0(r[HYANALT.oid]);
            return o > 0 && o < mine && Number(r[F.sheetOid]) === sheetOid
              && workKeyOf(r) === wk && num0(r[F.ergelt]) === ergelt;
          })
          .sort((a, b) => num0(a[HYANALT.oid]) - num0(b[HYANALT.oid]))[0];
        if (twin && (await deleteRow(mine))) return { ok: true, id: String(twin[F.id] ?? ''), reused: true };
      } catch (e) {
        console.warn('[selbe] давхар хяналтын мөрийн шалгалт унав:', e);
      }
    }
    /* ⚠️ 2026-10-04: max+1 уралдаан — бичсэний дараа давхардлыг засна (`ensureUniqueId`) */
    const fid = await ensureUniqueId(addedOid(res), id);
    return { ok: true, id: fid };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
