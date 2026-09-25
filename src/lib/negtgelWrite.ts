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
import { tokenParam } from '@/lib/authToken';
import { BAGTS_NEGTGEL, constructionWhere } from './services';
import { invalidate } from './dataBus';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';

const F = BAGTS_NEGTGEL.fields;

/** ArcGIS алдааг HTTP 200-аар буцаадаг — биен доторх `error`-ыг ЗААВАЛ шалгана */
async function post(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', ...tokenParam(), ...body }),
  });
  const j = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || tr('ArcGIS алдаа'));
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
async function summaryOf(bagts: string, sheetOid: number, pkgKey?: string) {
  const group = PKGS.filter((x) => x.group === bagts);
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
  for (const p of group.filter((x) => !pkgKey || x.key === pkgKey)) {
    const sc = await loadSchema(p).catch(() => null);
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
   * ⚠️ «Б.» мөрийн гүйцэтгэл ХЭМЖИГДЭЭГҮЙ (`null`) эсвэл хэзээ ч нийтлэгдээгүй
   *    хуудас ОРОХГҮЙ (`null ≠ 0`) — тэр нь 0% биш, мэдээлэлгүй.
   * ⚠️ Бусад хуудсыг уншиж ЧАДАХГҮЙ бол АЛДАА шидэнэ (`registerApproved`
   *    дахин оролдоно): чимээгүй алгасвал яг энэ дарагдах алдаа буцаж ирнэ.
   * ⚠️ Төлөвлөгөөт хувь нь ИЖИЛ хуудсуудаар: аль нэгэнд нь `null` бол `null`
   *    — өөр блокийн олонлогоор бодсон төлөвлөгөөг гүйцэтгэлтэй жишвэл
   *    хоцрогдол худал гарна.
   */
  const parts: { n: number; r: BRow }[] = [{ n: one.sc.bld.length, r: own }];
  if (own.act != null) {
    for (const p of group) {
      if (p.key === one.p.key) continue;
      const sc = await loadSchema(p);
      if (!sc.f.fillDate) continue;              // архивын талбаргүй — хэзээ ч нийтлэгдээгүй
      const r = await bRowOf(p, sc, sc.f.fillDate, `${sc.f.fillDate} <= ${ts(at)}`);
      if (r && r.act != null) parts.push({ n: sc.bld.length, r });
    }
  }
  const w = (n: number) => (n > 0 ? n : 1);
  const mean = (pick: (r: BRow) => number | null): number | null => {
    if (parts.length === 1) return pick(own);
    let s = 0;
    let d = 0;
    for (const x of parts) {
      const v = pick(x.r);
      if (v == null) return null;
      s += v * w(x.n);
      d += w(x.n);
    }
    return d > 0 ? s / d : null;
  };
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
  };
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
  try {
    const s = await summaryOf(bagts, sheetOid, pkgKey);
    if (!s) return { ok: false, error: tr('Бөглөх хуудаснаас агшин олдсонгүй') };

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
      const upd = (await post(`${BAGTS_NEGTGEL.url}/applyEdits`, {
        updates: JSON.stringify([{
          attributes: {
            [BAGTS_NEGTGEL.oid]: oid,
            [F.progress]: s.progress,
            [F.planned]: s.planned,
            [F.volume]: s.volume,
            [F.volumePlan]: s.volumePlan,
          },
        }]),
        rollbackOnFailure: 'true',
      })) as { updateResults?: { success?: boolean; error?: { description?: string } }[] };
      const ur = upd.updateResults?.[0];
      if (!ur || ur.success !== true)
        throw new Error(ur?.error?.description ?? tr('Нэгтгэлийн мөр шинэчлэгдсэнгүй'));
      invalidate('BAGTS_NEGTGEL');
      return { ok: true };
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
      throw new Error(r?.error?.description ?? tr('Нэгтгэлд мөр нэмэгдсэнгүй'));
    }
    /* ⚠️ Нэгтгэлд шинэ мөр орсон тул `loadPkgProgress` хуучирлаа: 02/04
       дашбоардын төлөвлөгөө-vs-бодит цуваа шууд шинэчлэгдэнэ. */
    invalidate('BAGTS_NEGTGEL');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
