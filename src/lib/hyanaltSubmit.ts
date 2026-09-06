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
import { addRows, queryAll, F, STATUS, type Attrs } from './hyanalt';

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
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
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
