'use client';

/**
 * БАТЛАГДСАН ГҮЙЦЭТГЭЛИЙГ НЭГТГЭЛД БҮРТГЭХ.
 *
 * Дөрвөн шатны хяналт (гүйцэтгэгч → инженер → багцын менежер → ерөнхий
 * менежер) БҮГД өнгөрсний ДАРАА л энэ бүртгэл үүснэ. Өөрөөр хэлбэл
 * `selbe_bagts_guitsetgel_negtgel` нь «хэн нэгний бөглөсөн зүйл» биш,
 * БАТЛАГДСАН баримт.
 *
 * ⚠️ ЗАДАРГАА ЭНД ОРОХГҮЙ. Блок, ажлын мөр, хувийн жин бүгд `Bagts_*` бөглөх
 * хуудсанд үлдэнэ; энд зөвхөн багцын НЭГДСЭН дүн. Задаргааг давхарлавал нэг
 * тоо хоёр эх сурвалжтай болж, аль нь үнэн болох нь эргэлзээтэй болно.
 *
 * ⚠️ ХУВИЙГ ЭНД ДАХИН БОДОХГҮЙ. Бөглөх хуудасны «Б.» мөр нь дэд үе шатуудаа
 * ЖИНГЭЭР нь аль хэдийн нэгтгэсэн байдаг — түүнийг шууд авна. Энд өөрсдөө
 * дундажлавал жин алдагдаж, дэлгэц дээрх тоо хоорондоо зөрнө.
 */

import { BAGTS_NEGTGEL, TASK_SHEET } from './services';
import { invalidate } from './dataBus';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';

const F = BAGTS_NEGTGEL.fields;

/** ArcGIS алдааг HTTP 200-аар буцаадаг — биен доторх `error`-ыг ЗААВАЛ шалгана */
async function post(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', ...body }),
  });
  const j = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || 'ArcGIS алдаа');
  return j;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Огноог ArcGIS-ийн SQL хэлбэрт — түүхий epoch тоо энэ үйлчилгээнд унадаг */
const ts = (ms: number) =>
  `timestamp '${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}'`;

type Pkg = (typeof PKGS)[number];
type Schema = NonNullable<Awaited<ReturnType<typeof loadSchema>>>;
/** Нэг `sheetOid`-д таарсан хуудас — `fill` нь тухайн хуудасны огнооны багана */
type Hit = { p: Pkg; sc: Schema; at: number; fill: string };

/**
 * Хэд хэдэн хуудас нэг `sheetOid`-д таарвал ЖИНХЭНЭ эхийг ялгана.
 *
 * ⚠️ `sheetOid` нь нийтлэлийн архивын жаазанд бичигдсэн ХАМГИЙН ЭХНИЙ мөрийн
 *    дугаар (`FillNew` → `submitForReview`). Зөв хуудсанд түүнээс ӨМНӨ ижил
 *    огноотой мөр БАЙХГҮЙ; санамсаргүй таарсан хуудсанд тэр дугаар жаазны дунд
 *    буудаг тул өмнөх мөрүүд байна.
 */
async function frameHead(h: Hit, sheetOid: number): Promise<boolean> {
  const q = (await post(`${h.p.url}/query`, {
    where: `${h.fill} = ${ts(h.at)} AND OBJECTID < ${sheetOid}`,
    returnCountOnly: 'true',
  })) as { count?: number };
  return (q.count ?? 0) === 0;
}

/**
 * Нэг багцын НЭГ АГШНЫ нэгдсэн дүнг бөглөх хуудаснаас гаргана.
 *
 * @param bagts    «Багц 4-1» — хяналтын бүртгэл дэх нэр
 * @param sheetOid Архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID (агшныг үүгээр олно)
 */
async function summaryOf(bagts: string, sheetOid: number) {
  /*
   * Нэг багцад 9F ба 12F хоёр хуудас байж болно — эх мөр аль нь болохыг олно.
   *
   * ⚠️ OBJECTID нь хуудас ТУС БҮРД өөрийн орон зайтай тул нэг дугаар хоёр
   *    хуудсанд ЗЭРЭГ оршихыг үгүйсгэх аргагүй. Урьд нь эхний таарсан хуудсыг
   *    шууд авдаг байсан тул «Багц 1 · 12 давхар»-ын батлагдсан гүйцэтгэлийн
   *    оронд жагсаалтад түрүүлдэг «Багц 1 · 9 давхар»-ын тоо нэгтгэлд
   *    бичигдэж, 12F-ийн жинхэнэ тоо (багц·огнооны давхардлын хамгаалалтад
   *    түгжигдээд) ХЭЗЭЭ Ч бүртгэгддэггүй байв. Тиймээс бүх хуудсыг цуглуулж,
   *    олон таарвал санамсаргүй нэгийг СОНГОХГҮЙ.
   */
  const hits: Hit[] = [];
  for (const p of PKGS.filter((x) => x.group === bagts)) {
    const sc = await loadSchema(p).catch(() => null);
    if (!sc?.f.fillDate) continue;

    const head = (await post(`${p.url}/query`, {
      where: `OBJECTID = ${sheetOid}`,
      outFields: sc.f.fillDate,
      returnGeometry: 'false',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const at = head.features?.[0]?.attributes?.[sc.f.fillDate];
    if (typeof at !== 'number') continue;      // энэ хуудсанд тэр мөр алга
    hits.push({ p, sc, at, fill: sc.f.fillDate });
  }
  if (!hits.length) return null;

  let one = hits[0];
  if (hits.length > 1) {
    const flags = await Promise.all(hits.map((h) => frameHead(h, sheetOid).catch(() => false)));
    const heads = hits.filter((_, i) => flags[i]);
    /*
     * ⚠️ Ялгагдахгүй бол ЧИМЭЭГҮЙ таамаглахаас илүү ил алдаа. Буруу хуудсын
     *    тоо нэгтгэлд орвол засах зам байхгүй — давхардлын хамгаалалт тэр
     *    багц·огноог түгжинэ.
     */
    if (heads.length !== 1) {
      throw new Error(
        `${bagts}: мөрийн дугаар ${sheetOid} нь ${hits.map((h) => h.p.label).join(' ба ')} хуудсанд зэрэг таарч байна — аль нь болох нь тодорхойгүй`,
      );
    }
    one = heads[0];
  }

  {
    const { p, sc, at } = one;
    /*
     * «Б.» мөр = БАРИЛГА УГСРАЛТЫН АЖИЛ — багцын нэгдсэн гүйцэтгэл. Эх excel
     * өөрөө дэд үе шатуудыг жингээр нэгтгэсэн байдаг тул ЭНЭ мөрийг шууд авна.
     */
    const cols = [sc.f.no, sc.f.act, sc.f.plan, sc.f.vol, sc.f.obyemSum]
      .filter(Boolean) as string[];
    const q = (await post(`${p.url}/query`, {
      where: `${sc.f.fillDate} = ${ts(at)} AND ${sc.f.no} = N'${TASK_SHEET.constructionNo}'`,
      outFields: [...new Set(cols)].join(','),
      returnGeometry: 'false',
      resultRecordCount: '1',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const a = q.features?.[0]?.attributes;
    if (!a) return null;

    /*
     * ⚠️ ОБЬЁМ нь багцын түвшинд ХОЛИМОГ НЭГЖТЭЙ (м³ бетон + м² хана + ш цонх).
     *    Нийлбэр нь физик утгагүй ч хэрэглэгчийн шийдвэрээр бүртгэгдэнэ —
     *    харьцуулахдаа ЗӨВХӨН өөртэйгөө (төлөвлөгөөт vs бодит) харьцуулна.
     */
    return {
      at,
      progress: num(a[sc.f.act]),
      planned: num(a[sc.f.plan]),
      volume: sc.f.obyemSum ? num(a[sc.f.obyemSum]) : null,
      volumePlan: num(a[sc.f.vol]),
    };
  }
}

export type NegtgelResult = { ok: true } | { ok: false; error: string };

/**
 * БАТЛАГДСАН гүйцэтгэлийг нэгтгэлд нэмнэ.
 *
 * ⚠️ ДАВХАРДЛААС ХАМГААЛНА: тухайн багц·огноогоор мөр аль хэдийн байвал ШИНЭ
 *    мөр нэмэхгүй. Ерөнхий менежер хоёр удаа дарах, эсвэл сүлжээ тасарч
 *    дахин илгээгдэх нь бодит тохиолдол.
 */
export async function registerApproved(
  bagts: string,
  sheetOid: number,
): Promise<NegtgelResult> {
  try {
    const s = await summaryOf(bagts, sheetOid);
    if (!s) return { ok: false, error: 'Бөглөх хуудаснаас агшин олдсонгүй' };

    const dup = (await post(`${BAGTS_NEGTGEL.url}/query`, {
      where: `${F.bagts} = N'${bagts.replace(/'/g, "''")}' AND ${F.date} = ${ts(s.at)}`,
      returnCountOnly: 'true',
    })) as { count?: number };
    if ((dup.count ?? 0) > 0) return { ok: true };   // аль хэдийн бүртгэгдсэн

    const res = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
      adds: JSON.stringify([{
        attributes: {
          [F.date]: s.at,
          [F.bagts]: bagts,
          [F.progress]: s.progress,
          [F.planned]: s.planned,
          [F.volume]: s.volume,
          [F.volumePlan]: s.volumePlan,
        },
      }]),
      rollbackOnFailure: 'true',
    })) as { addResults?: { success?: boolean; error?: { description?: string } }[] };
    /*
     * ⚠️ `applyEdits` нь мөр БҮРИЙН үр дүнг тусад нь буцаана: дээд түвшний
     *    `error` байхгүй, HTTP 200 ирсэн ч `addResults[0].success` худал байж
     *    болно (талбарын урт хэтэрсэн, төрөл таарахгүй, editing унтраасан).
     *    Урьд нь хариу нь ОГТ уншигддаггүй байсан тул `{ok:true}` буцаж,
     *    хяналтын мөр «Шилжүүлсэн» болоод дахин батлах боломжгүй болдог байв —
     *    батлагдсан гүйцэтгэл нэгтгэлд ХЭЗЭЭ Ч орохгүй, хаана ч алдаа гарахгүй.
     */
    const r = res.addResults?.[0];
    if (!r || r.success !== true) {
      throw new Error(r?.error?.description ?? 'Нэгтгэлд мөр нэмэгдсэнгүй');
    }
    /* ⚠️ Нэгтгэлд шинэ мөр орсон тул `loadPkgProgress` хуучирлаа: 02/04
       дашбоардын төлөвлөгөө-vs-бодит цуваа шууд шинэчлэгдэнэ. */
    invalidate('BAGTS_NEGTGEL');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
