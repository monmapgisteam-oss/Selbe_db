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
 * ⚠️ 2026-09-25: ХОЁР ХУУДАСТАЙ багцад (9F + 12F) хуудсуудын «Б.» мөрийг
 * БЛОКИЙН ТООГООР нийлүүлнэ — дэлгэрэнгүйг `summaryOf`-ийн ⚠️-ээс.
 */

import { t as tr } from './i18nCore';
import { agsFetch } from '@/modules/sheet/ags';
import { BAGTS_NEGTGEL, bagtsKey, constructionWhere } from './services';
import { invalidate } from './dataBus';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';

const F = BAGTS_NEGTGEL.fields;

/**
 * ArcGIS алдааг HTTP 200-аар буцаадаг — биен доторх `error`-ыг ЗААВАЛ шалгана.
 *
 * ⚠️ 2026-09-29 (аудит 10): хуваалцсан `agsFetch`-ээр. Урьд нь шууд `fetch` +
 *    `tokenParam()` байсан тул (а) богино хугацаатай PKCE токеныг хүсэлтийн
 *    өмнө шинэчилдэггүй, 498-д дахин оролддоггүй — удаан нээлттэй табаас
 *    батлахад нэгтгэлийн бичилт «Invalid token»-оор унадаг; (б) `res.ok` /
 *    JSON задлалт шалгадаггүй тул proxy-ийн HTML 502 «Unexpected token <»
 *    болж гардаг байв. `agsFetch` хоёуланг нь хийдэг.
 */
async function post(url: string, body: Record<string, string>) {
  return (await agsFetch(url, body)) as Record<string, unknown>;
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

const DAY = 86_400_000;

/**
 * Агшны ӨДРИЙН МУЖ `[эхлэл, төгсгөл)` — ms.
 *
 * ⚠️ 2026-10-09: «багц · огноо»-ны давхардлыг ЯГ ms-ээр (`F.date = ts(s.at)`) таньдаг
 *    байв, харин логик нь ӨДРӨӨР сэтгэдэг (`loadPkgProgress` → `dayKey`). Хуучин жааз
 *    локал шөнө дундаар (16:00Z), шинэ нь UTC шөнө дундаар (00:00Z) тамгалагддаг тул
 *    нэг өдөр ХОЁР мөр үүсч болж байв. Муж нь `bagtsSheet.normDayMs`-ийн дүрэм
 *    (хамгийн ойрын UTC шөнө дунд ±12 цаг) — 16:00Z · 08:00Z · 00:00Z бүгд НЭГ өдөр.
 */
export const dayRange = (ms: number): [number, number] => {
  const d = Math.round(ms / DAY) * DAY;
  return [d - DAY / 2, d + DAY / 2];
};
const dayWhere = (fld: string, ms: number) => {
  const [a, b] = dayRange(ms);
  return `${fld} >= ${ts(a)} AND ${fld} < ${ts(b)}`;
};

/**
 * Хуудсуудын «Б.» гүйцэтгэлийн БЛОКИЙН ТООГООР жигнэсэн дундаж (0–1).
 * ⚠️ Аль нэг нь `null` бол `null` (`summaryOf`-ийн ⚠️ — өөр олонлогоор бодохгүй).
 * Блокийн тоо 0 бол жин 1 (хуудас бүр дор хаяж нэг жинтэй).
 */
export const blendBlocks = (xs: { n: number; v: number | null }[]): number | null => {
  let s = 0;
  let d = 0;
  for (const x of xs) {
    if (x.v == null) return null;
    const w = x.n > 0 ? x.n : 1;
    s += x.v * w;
    d += w;
  }
  return d > 0 ? s / d : null;
};

/**
 * БЛОКГҮЙ БАГЦ уу (5.x · 6.x · 10 — бүх хуудас нь `floors: null`)?
 * ⚠️ Нэрийг `bagtsKey`-ээр жишнэ («Багц 4-1» / «Багц 4.1»). Танигдаагүй нэр → `false`.
 */
export const isBlocklessBagts = (bagts: string): boolean => {
  const g = PKGS.filter((p) => bagtsKey(p.group) === bagtsKey(bagts));
  return g.length > 0 && g.every((p) => p.floors == null);
};

type Pkg = (typeof PKGS)[number];
type Schema = NonNullable<Awaited<ReturnType<typeof loadSchema>>>;
/**
 * Нэг `sheetOid`-д таарсан хуудас — `fill` нь тухайн хуудасны огнооны багана,
 * `no` нь тэр мөрийн «№» (жаазны эхлэлийг танихад).
 */
type Hit = { p: Pkg; sc: Schema; at: number; fill: string; no: string };

/**
 * Хэд хэдэн хуудас нэг `sheetOid`-д таарвал ЖИНХЭНЭ эхийг ялгана.
 *
 * ⚠️ `sheetOid` нь нийтлэлийн архивын жаазанд бичигдсэн ХАМГИЙН ЭХНИЙ мөрийн
 *    дугаар (`FillNew` → `submitForReview`). Зөв хуудсанд тэр мөр нь ЖААЗНЫ
 *    ЭХЛЭЛ; санамсаргүй таарсан хуудсанд тэр дугаар жаазны ДУНД буудаг.
 *
 * ⚠️ 2026-09-25-ны аудит: урьд нь «түүнээс ӨМНӨ ижил огноотой мөр БАЙХГҮЙ»
 *    гэж шалгадаг байв. Гэвч `archiveSubmission` нь `lastDay >= fillMs` үед
 *    жаазыг ӨНӨӨДРӨӨР огнолдог тул нэг өдөрт ОЛОН жааз байх нь хэвийн: хоёр
 *    хуудастай багцын (1 · 2 · 4-2) тэр өдрийн ХОЁР ДАХЬ батлалт хоёр хуудсанд
 *    хоёуланд нь `false` авч, «аль нь болох нь тодорхойгүй» гэж 3 оролдлогоор
 *    унаж, нэгтгэл өглөөний тоондоо хөлддөг байв.
 *    ОДОО: жаазны эхлэлийг `bagtsSheet.lastFrame`-ийн ЯГ ИЖИЛ дүрмээр таньна —
 *    тэр өдрийн ЭХНИЙ мөрийн «№» (жааз бүрийн толгой) ба `sheetOid` мөрийн «№»
 *    ТААРВАЛ жаазны эхлэл. Толгойн «№» хоосон бол хуучин дүрэм (эхний мөр нь
 *    өөрөө `sheetOid`).
 */
async function frameHead(h: Hit, sheetOid: number): Promise<boolean> {
  const q = (await post(`${h.p.url}/query`, {
    where: `${h.fill} = ${ts(h.at)}`,
    outFields: `${h.sc.f.oid},${h.sc.f.no}`,
    returnGeometry: 'false',
    orderByFields: `${h.sc.f.oid} ASC`,
    resultRecordCount: '1',
  })) as { features?: { attributes: Record<string, unknown> }[] };
  const first = q.features?.[0]?.attributes;
  if (!first) return false;
  if (num(first[h.sc.f.oid]) === sheetOid) return true;
  const headNo = String(first[h.sc.f.no] ?? '').trim();
  return headNo !== '' && headNo === h.no;
}

/** «Б.» мөрийн нэгдсэн утгууд — хуудасны өөрийн хэмжээсээр (гүйцэтгэл 0–1) */
type BRow = { act: number | null; plan: number | null; volume: number | null; volumePlan: number | null };

/**
 * Нэг хуудасны «Б.» мөр — `dateWhere`-д таарах ХАМГИЙН СҮҮЛИЙН жаазнаас.
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
 *    СҮҮЛИЙН жаазыг авдаг — хоёр тоо зөрөхгүйн тулд энд огноо, OBJECTID
 *    хоёуланг БУУРАХААР эрэмбэлж, сүүлийн жаазны мөрийг авна.
 */
async function bRowOf(p: Pkg, sc: Schema, fill: string, dateWhere: string): Promise<BRow | null> {
  const cols = [sc.f.no, sc.f.act, sc.f.plan, sc.f.vol, sc.f.obyemSum]
    .filter(Boolean) as string[];
  const q = (await post(`${p.url}/query`, {
    where: `${dateWhere} AND ${constructionWhere(sc.f.no)}`,
    outFields: [...new Set(cols)].join(','),
    returnGeometry: 'false',
    orderByFields: `${fill} DESC,${sc.f.oid} DESC`,
    resultRecordCount: '1',
  })) as { features?: { attributes: Record<string, unknown> }[] };
  const a = q.features?.[0]?.attributes;
  if (!a) return null;
  return {
    act: num(a[sc.f.act]),
    plan: num(a[sc.f.plan]),
    volume: sc.f.obyemSum ? num(a[sc.f.obyemSum]) : null,
    volumePlan: num(a[sc.f.vol]),
  };
}

/**
 * Нэг багцын НЭГ АГШНЫ нэгдсэн дүнг бөглөх хуудаснаас гаргана.
 *
 * @param bagts    «Багц 4-1» — хяналтын бүртгэл дэх нэр
 * @param sheetOid Архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID (агшныг үүгээр олно)
 * @param pkgKey   Архивласан ХУУДАСНЫ түлхүүр («b1_12f») — мэдэгдэж байвал
 *                 OBJECTID-гаар хуудас ТААМАГЛАХГҮЙ (`registerApproved`-ийн ⚠️)
 */
/**
 * Багцын дүнд орсон НЭГ хуудас. `real: false` = хэзээ ч нийтлэгдээгүй / «Б.» мөр нь
 * хэмжигдээгүй хуудас — блокууд нь 0% гэж орсон (`summaryOf`-ийн ⚠️ 2026-10-09).
 */
type Part = { n: number; r: BRow; p: Pkg; sc: Schema; real: boolean };

async function summaryOf(bagts: string, sheetOid: number, pkgKey?: string) {
  /* ⚠️ 2026-10-09: `bagtsKey`-ээр — хяналтын бүртгэлийн нэр «Багц 4.1» / «Багц 4-1» аль
     хэлбэрээр ирсэн ч хуудас олдоно (урьд нь ЯГ тэнцүү тул өөр бичлэгт хоосон бүлэг). */
  const group = PKGS.filter((x) => bagtsKey(x.group) === bagtsKey(bagts));
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
  /* ⚠️ 2026-10-06 аудит: `loadSchema` нь ЗӨВХӨН сүлжээ/үйлчилгээний алдаагаар унадаг («олдсонгүй»
     гэсэн хувилбар байхгүй) — урьд нь `.catch(() => null)` нь түүнийг «Бөглөх хуудаснаас агшин
     олдсонгүй» болгож, ДАХИН ОРОЛДВОЛ болох түр алдааг өгөгдлийн асуудал мэт харуулдаг байв.
     Нөгөө хуудас (9F/12F) таарвал хэвээр үргэлжилнэ; ЮУ Ч таараагүй бол алдааг шиднэ. */
  let schemaErr = null as unknown;
  for (const p of group.filter((x) => !pkgKey || x.key === pkgKey)) {
    const sc = await loadSchema(p).catch((e: unknown) => { schemaErr = e; return null; });
    if (!sc?.f.fillDate) continue;

    const head = (await post(`${p.url}/query`, {
      where: `OBJECTID = ${sheetOid}`,
      outFields: [sc.f.fillDate, sc.f.no].join(','),
      returnGeometry: 'false',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const ha = head.features?.[0]?.attributes;
    const at = ha?.[sc.f.fillDate];
    if (typeof at !== 'number') continue;      // энэ хуудсанд тэр мөр алга
    hits.push({ p, sc, at, fill: sc.f.fillDate, no: String(ha?.[sc.f.no] ?? '').trim() });
  }
  if (!hits.length && schemaErr != null)
    throw new Error(tr('Бөглөх хуудасны бүдүүвч уншигдсангүй: {0}', String((schemaErr as Error)?.message ?? schemaErr)));
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
        tr('{0}: мөрийн дугаар {1} нь {2} хуудсанд зэрэг таарч байна — аль нь болох нь тодорхойгүй', bagts, sheetOid, hits.map((h) => h.p.label).join(tr(' ба '))),
      );
    }
    one = heads[0];
  }

  /*
   * «Б.» мөр = БАРИЛГА УГСРАЛТЫН АЖИЛ — багцын нэгдсэн гүйцэтгэл. Эх excel
   * өөрөө дэд үе шатуудыг жингээр нэгтгэсэн байдаг тул ЭНЭ мөрийг шууд авна
   * (хайлт ба эрэмбийн ⚠️ — `bRowOf`).
   */
  const at = one.at;
  const own = await bRowOf(one.p, one.sc, one.fill, `${one.fill} = ${ts(at)}`);
  if (!own) return null;

  /*
   * ⚠️ ХОЁР ХУУДАСТАЙ БАГЦ (1 · 2 · 4-2) — БАГЦЫН дүн нь ХОЁР хуудаснаас
   *    (2026-09-25-ны аудит). Нэгтгэлийн мөрийн түлхүүр нь «багц · огноо»
   *    атлаа урьд нь ЗӨВХӨН батлагдсан хуудасны «Б.» мөрийг бичдэг байв: 9F
   *    (30%) ба 12F (5%)-ийг нэг өдөр батлахад мөр 30 → 5 болж дарагдаж,
   *    дараагийн өдөр нь 12F-ийн 5 нь `last = 30`-тай жишигдэн «хэт зөрүүтэй»
   *    гэж ХУДЛАА татгалзагддаг, цуваа хуудас хооронд савладаг байлаа.
   *
   * ДҮРЭМ: бусад хуудас бүрийн ТЭР ӨДӨР БУЮУ ӨМНӨХ хамгийн сүүлийн жаазны
   *    «Б.» мөрийг авч БЛОКИЙН ТООГООР жигнэнэ. Энэ нь «ХУВИЙГ ДАХИН
   *    БОДОХГҮЙ» (толгойн ⚠️) дүрмийг зөрчихгүй: «Б.» мөрийн гүйцэтгэл нь
   *    өөрөө блокуудын ДУНДАЖ (`computeAll`-ийн J, хоосон = 0) тул блокоор
   *    жигнэсэн дундаж нь хоёр хуудасны БҮХ блокийн дундажтай ЯГ тэнцүү —
   *    ижил томьёог багц руу өргөтгөсөн нь (`planProgress`-ийн хуудас
   *    хоорондын жин ч мөн блокийн тоо).
   * ⚠️ 2026-10-09 (2026-10-01-ний хэрэглэгчийн шийдвэр «тайлагнаагүй блок 0%»):
   *    «Б.» мөрийн гүйцэтгэл ХЭМЖИГДЭЭГҮЙ (`null`) эсвэл хэзээ ч нийтлэгдээгүй
   *    хуудасны блокууд 0% гэж ОРНО (`real: false`). Урьд нь «`null ≠ 0` —
   *    мэдээлэлгүй» гэж хасагддаг байсан тул нэгтгэлийн мөр дашбоардын
   *    `blockProgress.pkgProgressOf`-оос (хуваарь = `sheetRows.sheetBlockKeys` —
   *    `fillDate`-тэй хуудасны БҮХ блок, тайлагнаагүй нь 0%) зөрдөг байв: Багц 1-ийн
   *    9F 50%, 12F нийтлэгдээгүй → нэгтгэл 50, дашбоард ~21. Одоо хоёулаа нэг дүрэм.
   *    `fillDate` талбаргүй хуудас дашбоардын хуваарьт ч ОРДОГГҮЙ тул энд ч орохгүй.
   *    Батлагдаж буй хуудасны ӨӨРИЙН «Б.» `null` бол дүн `null` хэвээр (бичихгүй).
   *    Нэгтгэлд хуучин дүрмээр бичигдсэн мөртэй жишихэд хуудсын олонлог өөрчлөгдсөн
   *    тул ±20-ийн хамгаалалт `registerApproved`-д ЖИШИГДЭХҮЙЦ олонлогоор явна.
   * ⚠️ Бусад хуудсыг уншиж ЧАДАХГҮЙ бол АЛДАА шидэнэ (`registerApproved`
   *    дахин оролдоно): чимээгүй алгасвал яг энэ дарагдах алдаа буцаж ирнэ.
   * ⚠️ Төлөвлөгөөт хувь нь ИЖИЛ хуудсуудаар: аль нэгэнд нь `null` бол `null`
   *    — өөр блокийн олонлогоор бодсон төлөвлөгөөг гүйцэтгэлтэй жишвэл
   *    хоцрогдол худал гарна. 0% гэж орсон (`real: false`) хуудасны төлөвлөгөө
   *    мэдэгдэхгүй бол багцын `planned` нь `null` (цоорхой, 0 БИШ).
   */
  const parts: Part[] = [{ n: one.sc.bld.length, r: own, p: one.p, sc: one.sc, real: true }];
  if (own.act != null) {
    for (const p of group) {
      if (p.key === one.p.key) continue;
      const sc = await loadSchema(p);
      if (!sc.f.fillDate) continue;              // архивын талбаргүй — дашбоардын хуваарьт ч ороогүй
      const r = await bRowOf(p, sc, sc.f.fillDate, `${sc.f.fillDate} <= ${ts(at)}`);
      if (r && r.act != null) parts.push({ n: sc.bld.length, r, p, sc, real: true });
      /* ⚠️ 2026-10-09: гүйцэтгэлийн баганатай блокгүй хуудас дашбоардын хуваарьт
         ОРДОГГҮЙ (`sheetBlockKeys`-ийн `!!sc.act[i]`) — энд ч 0%-ийн жин өгөхгүй */
      else if (sc.act.some(Boolean)) {
        parts.push({
          n: sc.bld.length,
          r: { act: 0, plan: r?.plan ?? null, volume: r?.volume ?? null, volumePlan: r?.volumePlan ?? null },
          p, sc, real: false,
        });
      }
    }
  }
  const mean = (pick: (r: BRow) => number | null): number | null =>
    parts.length === 1 ? pick(own) : blendBlocks(parts.map((x) => ({ n: x.n, v: pick(x.r) })));
  /*
   * ⚠️ ОБЬЁМ нь багцын түвшинд ХОЛИМОГ НЭГЖТЭЙ (м³ бетон + м² хана + ш цонх).
   *    Нийлбэр нь физик утгагүй ч хэрэглэгчийн шийдвэрээр бүртгэгдэнэ —
   *    харьцуулахдаа ЗӨВХӨН өөртэйгөө (төлөвлөгөөт vs бодит) харьцуулна.
   *    Хоёр хуудастай багцад хуудсуудын НИЙЛБЭР; бүгд хоосон бол `null`.
   */
  const sum = (pick: (r: BRow) => number | null): number | null => {
    let s: number | null = null;
    for (const x of parts) {
      const v = pick(x.r);
      if (v != null) s = (s ?? 0) + v;
    }
    return s;
  };

  return {
    at,
    /* ⚠️ 0–1 → 0–100 (`toPct`) — нэгтгэлийн багана ХУВЬ хүлээдэг */
    progress: toPct(own.act == null ? null : mean((r) => r.act)),
    planned: toPct(mean((r) => r.plan)),
    volume: sum((r) => r.volume),
    volumePlan: sum((r) => r.volumePlan),
    parts,
  };
}

/**
 * ±20-ийн ХАМГААЛАЛТАД ЖИШИГДЭХҮЙЦ гүйцэтгэл (0–100).
 *
 * ⚠️ 2026-10-09 (аудит): хоёр хуудастай багцын хэзээ ч нийтлэгдээгүй хуудасны
 *    АНХНЫ батлалт МӨНХӨД татгалзагддаг байв: Багц 1 9F 50 гэж бүртгэгдсэн (12F
 *    нийтлэгдээгүй тул хасагдсан), 12F-ийн анхны батлалт → блокоор жигнэсэн 20.9 vs
 *    сүүлийн 50 → «хэт зөрүүтэй»; гурван оролдлого ба `retryPendingRegistrations`
 *    хэзээ ч давахгүй. Бууралт нь бодит биш — дүнд орсон ХУУДСЫН ОЛОНЛОГ өөрчлөгдсөн.
 *    Мөн 2026-10-09-ний «тайлагнаагүй блок 0%» шилжилтийн дараах анхны бүртгэл ч
 *    хуучин дүрмийн мөртэй жишигдэнэ.
 *
 * ДҮРЭМ: сүүлийн мөрийн ӨДРӨӨС ӨМНӨ аль хэдийн «Б.» хэмжилттэй (`real`) байсан
 *    хуудсуудын ОДООГИЙН утгаар л жишнэ. Олонлог өөрчлөгдөөгүй → `'same'` (бүтэн
 *    дүнгээр, урьдын адил); жишигдэх хуудас байхгүй → `null` (хамгаалалт алгасна).
 *    Хэмжээсийн алдаа (0–1 бичигдсэн) хуудас бүрийг 100 дахин багасгадаг тул
 *    дэд олонлогоор ч баригдана — хамгаалалтын гол зорилго хэвээр.
 */
async function comparablePct(parts: Part[], lastAt: number | null): Promise<number | null | 'same' | { scale: string }> {
  if (parts.length < 2 || lastAt == null) return 'same';
  const [dayStart] = dayRange(lastAt);
  const kept: Part[] = [];
  for (const x of parts) {
    if (!x.real || !x.sc.f.fillDate) continue;
    const r = await bRowOf(x.p, x.sc, x.sc.f.fillDate, `${x.sc.f.fillDate} < ${ts(dayStart)}`);
    if (r && r.act != null) {
      /* ⚠️ 2026-10-09 (F12): ХУУДАС БҮРИЙН хэмжээсийн шалгалт — дэд олонлогоор жишихэд шинээр нэмэгдсэн
         хуудас хасагддаг тул түүний хэмжээсийн алдаа ±20-оос мултардаг байв; хуучин хуудас өмнө нь >1%
         байгаад одоо ≤1% болсон бол (0–1 ↔ 0–100 гулсалт) жишилтгүйгээр татгалзана. */
      const cur = x.r.act == null ? null : x.r.act * 100;
      if (cur != null && cur <= 1 && r.act * 100 > 1) return { scale: x.p.label };
      kept.push(x);
    }
  }
  if (kept.length === parts.length) return 'same';
  if (!kept.length) return null;
  const v = blendBlocks(kept.map((x) => ({ n: x.n, v: x.r.act })));
  return v == null ? null : v * 100;
}

/**
 * ⚠️ 2026-10-09: `skipped: 'blockless'` — БЛОКГҮЙ багц (5.x · 6.x · 10)-ын «Б» мөр
 *    ХЭМЖИГДЭЭГҮЙ (`Бодит_гүйцэтгэл` null) үед л. Урьд нь «хэмжигдээгүй» алдаагаар ДАНДАА
 *    унаж, илгээлт «бүртгэл хүлээгдэж буй» хэвээр мөнхөд дахин оролддог байв. `ok: true`
 *    тул дуудагч (`hyanaltStore`) бүртгэгдсэн гэж тэмдэглэнэ; юу ч бичигдээгүй.
 * ⚠️ 2026-10-09 (дахин): блокгүй багц БӨГЛӨГДДӨГ болсон (`fillSchema` — синтетик НЭГ блок,
 *    обьём `obyem_sum`). Архивлагдсан жаазны «Б» мөрийн J = Excel L-ийн бүлгийн
 *    `SUMPRODUCT(C, L)` (`computeAll`, n = 1) тул ямар нэг ажил хэмжигдсэн бол «Б»-ийн
 *    `Бодит_гүйцэтгэл` тоотой — `summaryOf` түүнийг (0–1 → 0–100) ЖИНХЭНЭ гүйцэтгэл болгон
 *    бичнэ (барилгын багцтай ЯГ ижил зам, `skipped` БИШ). Хэмжилтгүй бол J = null
 *    (`buildFrame`-ийн «null ≠ 0») → `skipped` хэвээр. Блокгүй багц нэг хуудастай тул
 *    `parts.length === 1` — блокоор жигнэх (`blendBlocks`) хамаарахгүй.
 */
export type NegtgelResult = { ok: true; skipped?: 'blockless' } | { ok: false; error: string };

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
 * @param pkgKey ⚠️ СОНГОЛТТОЙ (2026-09-25): архивласан хуудасны `Pkg.key`.
 *    Өгвөл хуудсыг OBJECTID-гаар ТААМАГЛАХГҮЙ — хоёр хуудасны OID муж
 *    давхцсан багцад (1 · 2 · 4-2) `frameHead`-ийн ялгалт огт хэрэггүй болно.
 *    Өгөөгүй бол (хуучин дуудагч) урьдын адил `frameHead`-ээр ялгана.
 */
export async function registerApproved(
  bagts: string,
  sheetOid: number,
  pkgKey?: string,
): Promise<NegtgelResult> {
  /* ⚠️ 2026-10-09 (R6): бичилт ОРОЛДСОН (хариу алдагдсан ч бичигдсэн байж магадгүй) бол `finally`-д НЭГ
     удаа зарлана — урьд нь нэмсний дараах давхардлын уншилт/шинэчлэлт шидэхэд зарлал явдаггүй байв. */
  let wrote = false;
  try {
    const s = await summaryOf(bagts, sheetOid, pkgKey);
    /* ⚠️ 2026-10-09: ХЭМЖИГДЭЭГҮЙ блокгүй багцад бичих тоо байхгүй — алдаа биш; хэмжигдсэн бол доорх
       ердийн замаар бүртгэгдэнэ (`NegtgelResult`-ийн ⚠️)
       ⚠️ 2026-10-09: ЗӨВХӨН хураангуй УНШИГДСАН (`s`) ба хэмжигдээгүй үед алгасна. `!s` (агшин
       олдсонгүй · сүлжээ · үйлчилгээ унасан) нь барилгын багцтай адил АЛДАА — урьд нь блокгүй багцад
       `ok: true` буцааж бүртгэгдсэн гэж тэмдэглэгдэн дахин оролдлогогүй ЧИМЭЭГҮЙ алдагддаг байв. */
    if (s && s.progress == null && isBlocklessBagts(bagts)) return { ok: true, skipped: 'blockless' };
    if (!s) return { ok: false, error: tr('Бөглөх хуудаснаас агшин олдсонгүй') };
    /* ⚠️ 2026-10-09 (F12): ХУУДАС БҮРИЙН хувь 0–100-д (`toPct` нь 0–1 хүлээдэг — 0–100 бичигдсэн хуудас
       2,600% болно). Шинэ хуудас ±20-ийн жишилтээс хасагддаг тул энд, бичихээс ӨМНӨ. */
    for (const x of s.parts) {
      const v = x.real && x.r.act != null ? x.r.act * 100 : null;
      if (v != null && (v < -0.5 || v > 100.5))
        return { ok: false, error: tr('«{0}» хуудасны «Б.» гүйцэтгэл {1}% — 0–100-гийн гадна тул нэгтгэлд бичсэнгүй. Хуудасны хэмжээсийг (0–1 эсэх) шалгана уу.', x.p.label, v.toFixed(2)) };
    }

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
    /* ⚠️ 2026-09-25: «СҮҮЛИЙН УТГА» нь ЭНЭ агшин (`s.at`) БА ӨНӨӨДРИЙН эцсээс
       хойшгүй мөрөөс. Урьд нь огнооны хязгааргүй `DESC` байсан тул нэгтгэлд
       УРЬДЧИЛАН суулгасан ирээдүйн огноотой (төлөвлөгөөний) мөр «сүүлийн» болж,
       бодит өсөлттэй батлалтыг «хэт зөрүүтэй» гэж татгалздаг байв. */
    const now = new Date();
    const todayCut = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - 1;
    const prev = (await post(`${BAGTS_NEGTGEL.url}/query`, {
      where: `${F.bagts} = N'${nameSql}' AND ${F.date} <= ${ts(Math.min(s.at, todayCut))}`,
      outFields: `${F.date},${F.progress}`,
      returnGeometry: 'false',
      orderByFields: `${F.date} DESC`,
      resultRecordCount: '1',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const prevA = prev.features?.[0]?.attributes;
    const last = num(prevA?.[F.progress]);

    if (s.progress == null)
      return {
        ok: false,
        error: tr('Бөглөх хуудасны «Б.» мөрийн гүйцэтгэл хэмжигдээгүй тул нэгтгэлд бичсэнгүй — хуудсаа шалгаад дахин баталгаажуулна уу.'),
      };
    if (last != null && s.progress < last - 20) {
      /* ⚠️ 2026-10-09: хуудсын олонлог өөрчлөгдсөн бол ЖИШИГДЭХҮЙЦ хэсгээр (`comparablePct`) */
      const cmp = await comparablePct(s.parts, num(prevA?.[F.date]));
      if (cmp != null && typeof cmp === 'object')
        return { ok: false, error: tr('«{0}» хуудасны «Б.» гүйцэтгэл өмнө 1%-иас их байсан бол одоо ≤1% — хэмжээсийн алдаа (0–1 ↔ 0–100) байж болзошгүй тул нэгтгэлд бичсэнгүй.', cmp.scale) };
      const shown = cmp === 'same' ? s.progress : cmp;
      if (shown != null && shown < last - 20)
        return {
          ok: false,
          error: tr('Нэгтгэлийн сүүлийн гүйцэтгэл {0}%, бөглөх хуудаснаас гарсан нь {1}% — хэт зөрүүтэй тул бичсэнгүй. Хуудасны хэмжээс (0–1 эсэх) ба «Б.» мөрийг шалгана уу.', last.toFixed(2), shown.toFixed(2)),
        };
    }

    /*
     * ⚠️ ДАВХАРДЛЫГ ЗӨВХӨН ОГНООГООР ТАНИХГҮЙ (2026-09-04-ний аудит): урьд нь
     *    багц·огноогоор мөр байвал ЧИМЭЭГҮЙ `{ok:true}` буцдаг байсан тул
     *    тухайн өдөрт УРЬДЧИЛАН суулгасан ТӨЛӨВЛӨГӨӨНИЙ мөр байхад батлагдсан
     *    БОДИТ гүйцэтгэл нэгтгэлд огт орохгүй, ямар ч анхааруулга гарахгүй
     *    өнгөрдөг байв. Одоо утгыг нь ЖИШНЭ: ижил бол үнэхээр давхардал
     *    (менежер хоёр удаа дарсан), зөрвөл ил алдаа — хүн шийднэ.
     */
    /* ⚠️ 2026-10-09: ӨДРИЙН МУЖААР (`dayRange`) — ЯГ ms биш */
    const dupQ = (await post(`${BAGTS_NEGTGEL.url}/query`, {
      where: `${F.bagts} = N'${nameSql}' AND ${dayWhere(F.date, s.at)}`,
      outFields: `${BAGTS_NEGTGEL.oid},${F.progress}`,
      returnGeometry: 'false',
      orderByFields: `${BAGTS_NEGTGEL.oid} DESC`,
      resultRecordCount: '1',
    })) as { features?: { attributes: Record<string, unknown> }[] };
    const dupRow = dupQ.features?.[0]?.attributes;
    if (dupRow) {
      const had = num(dupRow[F.progress]);
      /* Ижил тоо — үнэхээр давхар дуудалт, чимээгүй өнгөрнө. */
      if (had != null && Math.abs(had - s.progress) < 0.01) return { ok: true };
      /*
       * ⚠️ 2026-09-07: «ӨДӨРТ НЭГ УДАА» гэсэн хязгаар ХАСАГДАВ (хэрэглэгчийн
       * хүсэлт). Урьд нь тухайн өдрийн мөр байгаад утга нь ЗӨРВӨЛ ил алдаа
       * буцааж бичихээс ТАТГАЛЗДАГ байв. Үр дүнд нь өглөө батлуулсан багцыг
       * үдээс хойш засаад дахин батлуулахад дөрвүүлээ шат амжилттай өнгөрч,
       * архивт шинэ жааз ч үүсээд, ЗӨВХӨН нэгтгэлийн бүртгэл унадаг байлаа —
       * дашбоард өглөөний тоон дээрээ хөлддөг.
       *
       * ⚠️ ШИНЭ МӨР БИШ, ШИНЭЧЛЭЛ. Нэг өдөрт олон мөр нэмбэл «хамгийн сүүлийн»
       * нь тодорхойгүй болно: `loadPkgProgress` огноог ӨДРИЙН нарийвчлалаар
       * (`YYYY-MM-DD`) хадгалдаг тул `latestPkgProgress`-ийн жиших түлхүүр
       * ижил гарч, аль мөр давамгайлах нь ArcGIS-ийн буцаах дарааллаас
       * хамаарна. Тиймээс тухайн ӨДРИЙН мөрийг хамгийн сүүлийн батлагдсан
       * утгаар дарж бичнэ — цуваа өдөрт нэг цэгтэй, дүн нь үргэлж хамгийн
       * сүүлийн баталгаа.
       *
       * ⚠️ ТҮҮХ АЛДАГДАХГҮЙ: баталгаа бүр `Bagts_*` архивт бүтэн жааз, мөн
       * `guitsetgel_bugluh_hyanalt`-д тусдаа бүртгэл үлдээдэг. Нэгтгэл нь
       * түүх биш, ӨДРИЙН нэгдсэн дүнгийн цуваа.
       */
      const oid = num(dupRow[BAGTS_NEGTGEL.oid]);
      if (oid == null)
        return { ok: false, error: tr('Нэгтгэлийн мөрийн дугаар уншигдсангүй — дахин оролдоно уу.') };
      /* ⚠️ 2026-09-29 (аудит 10): `null` нь хадгалсан утгыг ДАРАХГҮЙ
         (`negtgelAuto.negDiff`-тэй ижил дүрэм). Урьд нь гурван талбарыг
         болзолгүй бичдэг байсан тул УРЬДЧИЛАН суулгасан төлөвлөгөөний мөрийн
         `planned`/обьём нь хуудсанд хэмжигдээгүй (`null`) үед арчигддаг байв. */
      const attrs: Record<string, unknown> = {
        [BAGTS_NEGTGEL.oid]: oid,
        [F.progress]: s.progress,
      };
      if (s.planned != null) attrs[F.planned] = s.planned;
      if (s.volume != null) attrs[F.volume] = s.volume;
      if (s.volumePlan != null) attrs[F.volumePlan] = s.volumePlan;
      wrote = true;
      const upd = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
        updates: JSON.stringify([{ attributes: attrs }]),
        rollbackOnFailure: 'true',
      })) as { updateResults?: { success?: boolean; error?: { description?: string } }[] };
      const ur = upd.updateResults?.[0];
      if (!ur || ur.success !== true)
        throw new Error(ur?.error?.description ?? tr('Нэгтгэлийн мөр шинэчлэгдсэнгүй'));
      return { ok: true };
    }

    wrote = true;
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
    const r = res.addResults?.[0] as { success?: boolean; objectId?: number; error?: { description?: string } } | undefined;
    if (!r || r.success !== true) {
      throw new Error(r?.error?.description ?? tr('Нэгтгэлд мөр нэмэгдсэнгүй'));
    }
    /*
     * ⚠️ 2026-09-29 (аудит 10): ЗЭРЭГ БАТЛАЛТЫН ДАВХАР МӨР. Дээрх `dupQ` нь
     *    шалгаад-нэмэх дараалал, ArcGIS-д «багц · огноо»-ны давтагдашгүй хязгаар
     *    байхгүй — хоёр батлалт секундын зайтай (9F ба 12F хоёр таб) ирвэл
     *    хоёулаа мөр олохгүй өнгөрч ХОЁР мөр нэмнэ; `latestPkgProgress` аль нь
     *    давамгайлахыг ArcGIS-ийн буцаах дараалал шийднэ (дээрх «ШИНЭ МӨР БИШ,
     *    ШИНЭЧЛЭЛ» ⚠️). `ipcAutoWrite.dedupeAuto`-тай ИЖИЛ дүрэм: нэмсний дараа
     *    дахин уншиж, ХАМГИЙН БАГА OID үлдэнэ; манайх түүнээс их бол үлдэх мөрийг
     *    манай утгаар шинэчилж (`null` дарахгүй), манайхыг устгана. БУСДЫН мөрийг
     *    хэзээ ч устгахгүй.
     */
    const newOid = num(r.objectId);
    if (newOid != null) {
      /* ⚠️ 2026-10-09: `dupQ`-тэй ИЖИЛ өдрийн муж */
      const tw = (await post(`${BAGTS_NEGTGEL.url}/query`, {
        where: `${F.bagts} = N'${nameSql}' AND ${dayWhere(F.date, s.at)}`,
        outFields: `${BAGTS_NEGTGEL.oid}`,
        returnGeometry: 'false',
        orderByFields: `${BAGTS_NEGTGEL.oid} ASC`,
      })) as { features?: { attributes: Record<string, unknown> }[] };
      const keepOid = num(tw.features?.[0]?.attributes?.[BAGTS_NEGTGEL.oid]);
      if (keepOid != null && keepOid < newOid) {
        const attrs: Record<string, unknown> = { [BAGTS_NEGTGEL.oid]: keepOid, [F.progress]: s.progress };
        if (s.planned != null) attrs[F.planned] = s.planned;
        if (s.volume != null) attrs[F.volume] = s.volume;
        if (s.volumePlan != null) attrs[F.volumePlan] = s.volumePlan;
        wrote = true;
        const u = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
          updates: JSON.stringify([{ attributes: attrs }]),
          rollbackOnFailure: 'true',
        })) as { updateResults?: { success?: boolean; error?: { description?: string } }[] };
        const ur = u.updateResults?.[0];
        if (!ur || ur.success !== true)
          throw new Error(ur?.error?.description ?? tr('Нэгтгэлийн мөр шинэчлэгдсэнгүй'));
        const d = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
          deletes: String(newOid),
          rollbackOnFailure: 'true',
        })) as { deleteResults?: { success?: boolean; error?: { description?: string } }[] };
        const dr = d.deleteResults?.[0];
        if (!dr || dr.success !== true)
          return {
            ok: false,
            error: tr('Давхар нэгтгэлийн мөр (OID {0}) үлдлээ — AGOL дээр гараар устгана уу: {1}', newOid, dr?.error?.description ?? ''),
          };
        return { ok: true };
      }
    }
    /* ⚠️ Нэгтгэлд шинэ мөр орсон тул `loadPkgProgress` хуучирлаа: 02/04
       дашбоардын төлөвлөгөө-vs-бодит цуваа шууд шинэчлэгдэнэ (`finally`). */
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  } finally {
    if (wrote) invalidate('BAGTS_NEGTGEL');
  }
}
