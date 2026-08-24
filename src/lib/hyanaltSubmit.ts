/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ» → ХЯНАЛТАД АВТОМАТААР ОРУУЛАХ ГҮҮР.
 *
 * Компани хуудсаа бөглөж «Нийтлэх» дармагц ЭНД нэг хяналтын бүртгэл үүснэ.
 * Тэр агшнаас эхлэн ажил талбайн инженерийн дараалалд орно.
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
import { agsParams } from './agsToken';

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
      // ⚠️ 2026-08-24 «Organization» хуваалцалт — token-гүй бол энэ асуулга 499 болж,
      //    гүйцэтгэгч компанийн нэр чимээгүй хоосон үлдэнэ.
      body: new URLSearchParams(await agsParams({
        f: 'json',
        where: '1=1',
        groupByFieldsForStatistics: `${BUILDING.fields.bagts},${BUILDING.fields.contractor}`,
        outStatistics: JSON.stringify([
          { statisticType: 'count', onStatisticField: BUILDING.oid, outStatisticFieldName: 'n' },
        ]),
      })).toString(),
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
 * @param fillMs   бөглөсөн өдөр (нийтлэлийн архивын түлхүүр)
 * @param sheetOid эх хүснэгтэд нэмэгдсэн ЭХНИЙ мөрийн OBJECTID (холбоос)
 * @returns бүртгэлийн дугаар, эсвэл алдааны мессеж
 */
export async function submitForReview(
  bagts: string,
  fillMs: number,
  sheetOid: number | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const [rows, company] = await Promise.all([queryAll(), companyOf(bagts)]);
    const id = nextId(rows);

    const attrs: Attrs = {
      [F.id]: id,
      [F.sheetOid]: sheetOid ?? 0,
      [F.ergelt]: 1,
      [F.bagts]: bagts,
      // ⚠️ ОГНОО ЗААВАЛ — өдөр бүрийн нийтлэл тусдаа ажил байх ёстой
      [F.ajil]: `Гүйцэтгэл · ${dayLabel(fillMs)}`,
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
