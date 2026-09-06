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

import { t as tr } from './i18nCore';
import { BAGTS_NEGTGEL, constructionWhere } from './services';
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

/**
 * Бөглөх хуудасны 0–1 бутархайг нэгтгэлийн 0–100 хувь болгоно.
 *
 * ⚠️ ХЭМЖЭЭСИЙН ЗӨРҮҮ (2026-09-04-ний аудит): `Bagts_*` хуудсанд гүйцэтгэл нь
 *    0–1 БУТАРХАЙ (амьд: Багц 2·12F-ийн «Б» мөр = 0.00039), харин
 *    `BAGTS_NEGTGEL.progress` / `.planned` нь 0–100 ХУВЬ (амьд: Багц 1 = 78).
 *    Урьд нь бутархайг ШУУД бичдэг байсан — «Б.» хайлт нь 0 мөр өгдөг байсан
 *    тул далд байв; хайлтыг зассан агшинд 78% → 0.0004% болж дашбоардын
 *    багцын муруй нурах байсан (давхардлын хамгаалалт тэр багц·огноог түгжих
 *    тул засах зам ч байхгүй).
 *
 * ⚠️ `null` нь `null` хэвээр: «хэмжигдээгүй» ба «тэг гүйцэтгэл» хоёр өөр зүйл.
 * ⚠️ `blockProgress.ts:88`-ийн (`Number(progress) * 100`) хөрвүүлэлттэй ИЖИЛ
 *    дүрэм — хоёр газар өөр хэмжээс хэрэглэвэл график, самбар хоёр тоо заана.
 */
const toPct = (v: number | null): number | null => (v == null ? null : v * 100);

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
     *
     * ⚠️ ХАЙЛТ НЬ ЯГ ТЭНЦҮҮ БАЙЖ БОЛОХГҮЙ (2026-09-04-ний аудит): урьд нь
     *    `${sc.f.no} = N'Б.'` байсан бөгөөд бодит өгөгдөлд тэр нүд 8 багцад
     *    «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ», Багц 2·12F ба Багц 3.2·9F-д «Б» (ЦЭГГҮЙ)
     *    гэж бичигдсэн тул 10/10 багцад 0 мөр таарч байв. Үр дүнд `summaryOf`
     *    `null` буцааж, `registerApproved` «Бөглөх хуудаснаас агшин олдсонгүй»
     *    гэж унаад `hyanaltStore` түүнийг зөвхөн `console.warn` хийдэг — дөрвөн
     *    шат бүрэн дамжсан гүйцэтгэл нэгтгэлд ХЭЗЭЭ Ч ордоггүй, хэрэглэгчид ч
     *    алдаа харагддаггүй байлаа. Предикат нь одоо `services.constructionWhere`
     *    — «Б1»…«Б5» дэд үе шатыг ОРУУЛАХГҮЙ цорын ганц дүрэм.
     *
     * ⚠️ ЭРЭМБЭЛЭЛТГҮЙ `resultRecordCount:'1'` мөн БОЛОХГҮЙ: нэг `fillDate`-д
     *    олон жааз байж болно (амьд: Багц 1·9F-ийн 2026-08-29-нд ЯГ ижил ms-тэй
     *    16 жааз) бөгөөд сервер OBJECTID ӨСӨХӨӨР эхнийхийг өгдөг тул нэгтгэлд
     *    ХАМГИЙН ХУУЧИН жаазны тоо бичигдэнэ. `bagtsSheet.lastFrame` нь эсрэгээр
     *    СҮҮЛИЙН жаазыг авдаг — хоёр тоо зөрөхгүйн тулд энд OBJECTID БУУРАХААР
     *    эрэмбэлж, сүүлийн жаазны мөрийг авна.
     */
    const cols = [sc.f.no, sc.f.act, sc.f.plan, sc.f.vol, sc.f.obyemSum]
      .filter(Boolean) as string[];
    const q = (await post(`${p.url}/query`, {
      where: `${sc.f.fillDate} = ${ts(at)} AND ${constructionWhere(sc.f.no)}`,
      outFields: [...new Set(cols)].join(','),
      returnGeometry: 'false',
      orderByFields: `${sc.f.oid} DESC`,
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
      /* ⚠️ 0–1 → 0–100 (`toPct`) — нэгтгэлийн багана ХУВЬ хүлээдэг */
      progress: toPct(num(a[sc.f.act])),
      planned: toPct(num(a[sc.f.plan])),
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
 *
 * @param bagts    багцын нэр — хяналтын бүртгэл дэх бичлэгээр
 * @param sheetOid ⚠️ ЗААВАЛ `Bagts_*` АРХИВЫН мөрийн OBJECTID. 2026-09-04-ээс
 *    хойш хяналтын мөрийн `Эх_мөрийн_дугаар` нь ИЛГЭЭЛТИЙН (өөр үйлчилгээний)
 *    дугаар болсон тул түүнийг ШУУД дамжуулж БОЛОХГҮЙ — `summaryOf` тэр
 *    дугаарыг архиваас хайж олохгүй, «Бөглөх хуудаснаас агшин олдсонгүй» гэж
 *    чимээгүй унана. `hyanaltStore.archiveSubmission` нь `applyAdds`-ийн
 *    буцаасан `firstOid`-ыг (legacy мөрд хуучин `sheetOid`-ыг) өгнө.
 */
export async function registerApproved(
  bagts: string,
  sheetOid: number,
): Promise<NegtgelResult> {
  try {
    const s = await summaryOf(bagts, sheetOid);
    if (!s) return { ok: false, error: 'Бөглөх хуудаснаас агшин олдсонгүй' };

    const nameSql = bagts.replace(/'/g, "''");

    /*
     * ⚠️ ХЭМЖЭЭСИЙН ЭРҮҮЛ МЭНДИЙН ШАЛГАЛТ (2026-09-04-ний аудит). «Б.» мөрийн
     *    хайлт зассанаар ЭНЭ бичилт анх удаа ЖИНХЭНЭЭР ажиллаж эхэлж байна:
     *    урьд нь `summaryOf` үргэлж `null` буцаадаг тул нэгтгэлд юу ч ордоггүй
     *    байв. Амьд өгөгдлөөр бөглөх хуудасны «Б.» мөрийн гүйцэтгэл нь
     *    нэгтгэлийн цуваанаас ГУРВАН ЭРЭМБЭЭР бага (Багц 1: цуваа 78, хуудас
     *    0.06) — тэр тоог чимээгүй бичвэл дашбоардын «төлөвлөгөө vs бодит»
     *    муруй нэг алхмаар нурах ба давхардлын хамгаалалт тухайн багц·огноог
     *    түгжих тул ЗАСАХ ЗАМ БАЙХГҮЙ болно.
     * ⚠️ Тиймээс: (а) хэмжигдээгүй (`null`) утгыг бичихгүй — `null ≠ 0`, тэгээд
     *    ч цувааг таслана; (б) цувааны сүүлийн утгаас ЭРС (20 нэгжээс их)
     *    буурсан бол ИЛ АЛДАА буцааж хүнээр шийдүүлнэ. Гүйцэтгэл бодитоор
     *    буурах нь (засвар, дахин хэмжилт) ховор бөгөөд тийм үед хүн өөрөө
     *    нэгтгэлд бичих ёстой — чимээгүй нурааж БОЛОХГҮЙ.
     */
    const prev = (await post(`${BAGTS_NEGTGEL.url}/query`, {
      where: `${F.bagts} = N'${nameSql}'`,
      outFields: `${F.date},${F.progress}`,
      returnGeometry: 'false',
      orderByFields: `${F.date} DESC`,
      resultRecordCount: '1',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const last = num(prev.features?.[0]?.attributes?.[F.progress]);

    if (s.progress == null)
      return {
        ok: false,
        error: tr('Бөглөх хуудасны «Б.» мөрийн гүйцэтгэл хэмжигдээгүй тул нэгтгэлд бичсэнгүй — хуудсаа шалгаад дахин баталгаажуулна уу.'),
      };
    if (last != null && s.progress < last - 20)
      return {
        ok: false,
        error: tr('Нэгтгэлийн сүүлийн гүйцэтгэл {0}%, бөглөх хуудаснаас гарсан нь {1}% — хэт зөрүүтэй тул бичсэнгүй. Хуудасны хэмжээс (0–1 эсэх) ба «Б.» мөрийг шалгана уу.', last.toFixed(2), s.progress.toFixed(2)),
      };

    /*
     * ⚠️ ДАВХАРДЛЫГ ЗӨВХӨН ОГНООГООР ТАНИХГҮЙ (2026-09-04-ний аудит): урьд нь
     *    багц·огноогоор мөр байвал ЧИМЭЭГҮЙ `{ok:true}` буцдаг байсан тул
     *    тухайн өдөрт УРЬДЧИЛАН суулгасан ТӨЛӨВЛӨГӨӨНИЙ мөр байхад батлагдсан
     *    БОДИТ гүйцэтгэл нэгтгэлд огт орохгүй, ямар ч анхааруулга гарахгүй
     *    өнгөрдөг байв. Одоо утгыг нь ЖИШНЭ: ижил бол үнэхээр давхардал
     *    (менежер хоёр удаа дарсан), зөрвөл ил алдаа — хүн шийднэ.
     */
    const dupQ = (await post(`${BAGTS_NEGTGEL.url}/query`, {
      where: `${F.bagts} = N'${nameSql}' AND ${F.date} = ${ts(s.at)}`,
      outFields: F.progress,
      returnGeometry: 'false',
      orderByFields: `${BAGTS_NEGTGEL.oid} DESC`,
      resultRecordCount: '1',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const dupRow = dupQ.features?.[0]?.attributes;
    if (dupRow) {
      const had = num(dupRow[F.progress]);
      /* Ижил тоо — үнэхээр давхар дуудалт, чимээгүй өнгөрнө. */
      if (had != null && Math.abs(had - s.progress) < 0.01) return { ok: true };
      return {
        ok: false,
        error: tr('Энэ багцын {0}-ны мөр нэгтгэлд аль хэдийн байна ({1}%), батлагдсан гүйцэтгэл {2}% — давхар бичихгүй. Нэгтгэлийн мөрийг гараар шалгана уу.', new Date(s.at).toISOString().slice(0, 10), had == null ? '—' : had.toFixed(2), s.progress.toFixed(2)),
      };
    }

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
