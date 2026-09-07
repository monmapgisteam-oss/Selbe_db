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
import { addRows, queryAll, F, OWNER, STATUS, type Attrs, type Status } from './hyanalt';

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
    const res = await fetch(`${BUILDING.url}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        f: 'json',
        where: '1=1',
        groupByFieldsForStatistics: `${BUILDING.fields.bagts},${BUILDING.fields.contractor}`,
        outStatistics: JSON.stringify([
          { statisticType: 'count', onStatisticField: BUILDING.oid, outStatisticFieldName: 'n' },
        ]),
      }).toString(),
    });
    const j = (await res.json()) as { features?: { attributes: Attrs }[]; error?: unknown };
    COMPANY = new Map();
    // ⚠️ Алдаа гарвал ШИДЭХГҮЙ — компанийн нэр дутуу байх нь нийтлэлийг
    //    зогсоох шалтгаан биш. Хоосон нэрээр бүртгэл үүсэж, дараа засагдана.
    if (!j.error) {
      for (const f of j.features ?? []) {
        const k = norm(String(f.attributes[BUILDING.fields.bagts] ?? ''));
        const v = String(f.attributes[BUILDING.fields.contractor] ?? '').trim();
        if (k && v && !COMPANY.has(k)) COMPANY.set(k, v);
      }
    }
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

const dayLabel = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
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
 */
export function openReviewRow(
  rows: readonly Attrs[],
  sheetOid: number | null,
  dayTag: string,
): Attrs | null {
  if (sheetOid == null || sheetOid <= 0) return null;
  return rows.find((r) => {
    if (Number(r[F.sheetOid]) !== sheetOid) return false;
    const st = String(r[F.status] ?? '') as Status;
    if (st === STATUS.transferred) return false;
    /* Гүйцэтгэгчийн гар дээр (буцаагдсан) бол ЖИНХЭНЭ дахин илгээлт — шинэ тойрог */
    if (OWNER[st] === 'company') return false;
    return String(r[F.ajil] ?? '').startsWith(dayTag);
  }) ?? null;
}

/** Өдрийн шошго — `Ажлын_нэр`-ийн угтвар («Гүйцэтгэл · 2026.09.07») */
export const dayTagOf = (fillMs: number) => `Гүйцэтгэл · ${dayLabel(fillMs)}`;

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
 * @returns бүртгэлийн дугаар, эсвэл алдааны мессеж
 */
export async function submitForReview(
  bagts: string,
  fillMs: number,
  sheetOid: number | null,
  sheet = '',
): Promise<{ ok: true; id: string; reused?: true } | { ok: false; error: string }> {
  try {
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
    const openLegacy = rows.some(
      (r) =>
        String(r[F.bagts] ?? '') === bagts &&
        String(r[F.company] ?? '') === company &&
        String(r[F.ajil] ?? '') === legacyAjil &&
        String(r[F.status] ?? '') !== STATUS.transferred,
    );
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

    await addRows([attrs]);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
