// Багцын `*_final_publish` хуудасны нэгдсэн толь — 10 үйлчилгээнд НЭГ код.
//
// Мөр бүр = excel-ийн нэг мөр (ObjectID = excel мөр − 1), багана бүр = excel-ийн
// нэг багана. Талбарын нэрс багц бүрд өөр (AGOL толгойн мөрөөс автоматаар
// үүсгэдэг тул доогуур зураасны тоо жигд БИШ, бичээсийн алдаа ч бий) — тиймээс
// нэрийг хатуу бичихгүй, `bagts.pkg.ts → resolveSchema` ажиллах үедээ таьна.
//
// Тооцоолол: excel дэх томъёог энд давтан бодно. Publish хийсэн утгууд нь
// зарим бүлэгт #REF!-ээс болж эвдэрсэн (жишээ нь «БАРИЛГА УГСРАЛТЫН АЖИЛ»
// мөрийн нүднүүд 4e-05), тиймээс хадгалагдсан утгыг биш, бодсоныг харуулна.

import { agsFetch, type Feature } from "./ags";
import { TREES } from "./bagts.trees";
import type { Pkg, Schema } from "./bagts.pkg";
import { t as tr } from "@/lib/i18nCore";
import { invalidate } from "@/lib/dataBus";

export type SheetRow = {
  oid: number;
  no: string;
  work: string;
  depth: number;
  group: boolean;
  wC: number | null;
  wD: number | null;
  // ⚠ `Хувийн жин- Одоо байгаа` (excel E) энд БАЙХГҮЙ: тэр нь C×J-ээс бүрэн
  // бодогддог тул уншаад ч ашиглахгүй. Нийтлэхэд `f.wE`-рүү буцааж бичнэ.
  vol: number | null;
  /** «Объём_шинэ2» — зөвхөн ХАРУУЛНА, ямар ч томъёонд ОРОХГҮЙ. */
  unit: number | null;
  money: number | null;
  act: (number | null)[]; // хадгалагдсан блок бүрийн бодит гүйцэтгэл
  /**
   * Блок бүрийн ХУРИМТЛАГДСАН обьём (`*_obyem`). Талбар байхгүй бол `null`.
   * ⚠️ Хуучин мөрүүдэд ХООСОН атлаа гүйцэтгэлийн хувь нь бий — тэднийг
   *    `baseObyem` нь `хувь × Обьём` болгож сэргээнэ (түүх алдагдахгүй).
   */
  obyem: (number | null)[];
  /**
   * Үйлчилгээнээс ирсэн БҮХ талбар, хэвээрээ. Архивын шинэ хуулбар үүсгэхэд
   * (нийтлэх бүрд бүтэн хуудас доор нь нэмэгддэг) энэ мөрийг суурь болгож,
   * зөвхөн бодогдсон талбаруудыг дарж бичнэ — ингэснээр код мэддэггүй
   * багана (тайлбар, нэмэлт багана) ч хуулбарт бүрэн үлдэнэ.
   */
  raw: Record<string, unknown>;
  start: (number | null)[]; // ms epoch
  end: (number | null)[];
  /**
   * БАРИМТ БИЧГИЙН текст утгууд — `DOC_COLS`-той ижил дараалалтай.
   * Хоосон мөр нь `null` (хоосон мөрийн тэмдэгт БИШ) тул «бөглөөгүй» гэдэг
   * нь харагдалт ба нийтлэх хоёуланд ижил ойлгогдоно.
   */
  docs: (string | null)[];
};

const num = (v: unknown): number | null =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

/** `YYYY-MM-DD` → ArcGIS-ийн `timestamp` шүүлт (тухайн ӨДРИЙГ бүхэлд нь). */
const dayFilter = (fld: string, day: string) =>
  `${fld} BETWEEN timestamp '${day} 00:00:00' AND timestamp '${day} 23:59:59'`;

/**
 * Хуудсан дээр ажиллах мөрүүд — СҮҮЛИЙН АГШНЫХ нь.
 *
 * ⚠️ Нийтлэх бүрд хуудас бүхэлдээ доор нь ХУУЛБАРЛАГДАЖ нэмэгддэг тул
 *    үйлчилгээнд олон агшин зэрэг байна. `where=1=1` гэвэл бүх түүх нийлж,
 *    нэг ажил хэдэн ч удаа давхарлана. Тиймээс хамгийн сүүлийн
 *    `buglusun_ognoo`-той өдрийг олж, ЗӨВХӨН түүнийг татна.
 *
 * Архив эхлээгүй (бүх мөр огноогүй) үед анхны суурь хуудас нь `NULL`
 * огноотой байх тул түүгээр шүүнэ.
 */
/**
 * ХУУЛБАРЫН СҮҮЛИЙН БҮТЭН ЖААЗ.
 *
 * Нэг өдөрт хоёр удаа нийтэлбэл хоёр бүтэн хуулбар зэрэг ирнэ. Жаазны эхлэлийг
 * ЭХНИЙ мөрийн №-ээр таньж, сүүлийн хуулбарыг бүтнээр нь авна — мөрийн тоо ямар
 * ч байсан (мөр нэмэгдсэн ч) зөв ажиллана.
 *
 * ⚠️ 2026-09-01 ЗАСВАР — ХАГАС БИЧИГДСЭН ЖААЗЫГ ГЭЭНЭ.
 *
 * `applyAdds` нь 500 мөрийн БАГЦААР бичдэг ба `rollbackOnFailure` нь ЗӨВХӨН нэг
 * багц дотор үйлчилнэ. Нийтлэх дунд нь тасалдвал үйлчилгээнд 500/1000/1500
 * мөртэй ДУТУУ жааз үлдэнэ. Урьд нь энэ функц зөвхөн «сүүлийн эхлэл»-ийг олж
 * уртыг нь ОГТ шалгадаггүй байсан тул тэр дутуу жаазыг «хамгийн сүүлийн агшин»
 * гэж буцаадаг байв.
 *
 * Бодит хохирол: `Bagts_2_9f`-ийн 2026-08-29-ны жаазууд [1386, 1386, 1386,
 * 1000] болж, «Гүйцэтгэл бөглөх», «Хуваарь», хоцрогдлын тооцоо гурвуулаа тэр
 * багцад НЭЭГДЭХЭЭ БОЛЬСОН. Алдааны бичвэр нь «шатлалын зураглал» гэж БУРУУ
 * шалтгаан заадаг тул шалтгааныг олоход ч төөрөгдүүлнэ.
 *
 * ⚠️ ДҮРЭМ: мөр зөвхөн НЭМЭГДДЭГ, устдаггүй. Тиймээс жаазны урт хэзээ ч
 * буурахгүй — сүүлийн жааз өмнөхөөсөө БОГИНО бол тэр нь унасан нийтлэл.
 * Тэгвэл түүнийг алгасаад өмнөх БҮТЭН жаазыг буцаана: хуучин боловч БҮТЭН
 * агшин харуулах нь хуудсыг бүхэлд нь хаахаас хамаагүй дээр.
 */
export function lastFrame(all: Feature[], noField: string, expect = 0): Feature[] {
  if (all.length < 2) return all;
  const first = String(all[0].attributes[noField] ?? "").trim();
  if (!first) return all;

  const starts: number[] = [0];
  for (let i = 1; i < all.length; i += 1) {
    if (String(all[i].attributes[noField] ?? "").trim() === first) starts.push(i);
  }
  if (starts.length === 1) return all;

  const endOf = (k: number) => (k + 1 < starts.length ? starts[k + 1] : all.length);
  const lenOf = (k: number) => endOf(k) - starts[k];

  /* Сүүлийн жаазаас ухарч ЭХНИЙ бүтэн жаазыг ол */
  let k = starts.length - 1;
  while (k > 0) {
    const len = lenOf(k);
    /* Өмнөхөөсөө богино = тасарсан; зураглалаас богино нь ч мөн адил */
    if (len >= lenOf(k - 1) && (expect <= 0 || len >= expect)) break;
    console.warn(
      `[selbe] хагас бичигдсэн жаазыг алгаслаа: ${len} мөр `
      + `(өмнөх ${lenOf(k - 1)}, хүлээгдэх ${expect || '?'}) — унасан нийтлэлийн үлдэгдэл`,
    );
    k -= 1;
  }
  return all.slice(starts[k], k + 1 < starts.length ? starts[k + 1] : undefined);
}

/** Мөрийн ТАНИХ ТҮЛХҮҮР — № ба Ажлын нэрийн хос. */
function rowKey(f: Feature, sc: Schema): string {
  const no = String(f.attributes[sc.f.no] ?? "").trim();
  const work = String(f.attributes[sc.f.work] ?? "").trim();
  return `${no} ¦ ${work}`;
}

/**
 * СУУРЬ АГШНЫ МӨРИЙН ТҮЛХҮҮРҮҮД (бөглөөгүй анхны хуулбар).
 *
 * ⚠️ Энэ бол шатлалын зураглалын ЛАВЛАХ ДАРААЛАЛ. Суурь агшин нь хэзээ ч
 * бөглөгддөггүй тул мөрийн тоо нь зураглалын урттай үүрд тэнцүү (10/10 багцад
 * шалгасан). Шинээр нэмэгдсэн мөрийг ЯГ ЭНЭ дарааллаас ялгаж таних учир
 * үйлчилгээнд ШИНЭ БАГАНА НЭМЭХ ШААРДЛАГАГҮЙ.
 *
 * ⚠️ Зөвхөн мөрийн тоо зөрсөн үед л дуудагдана — хэвийн үед нэмэлт хүсэлт огт
 * явахгүй. Багц тутамд нэг л удаа татаж кэшлэнэ.
 */
const baseKeyCache = new Map<string, Promise<string[]>>();
function loadBaseKeys(pkg: Pkg, sc: Schema): Promise<string[]> {
  const hit = baseKeyCache.get(pkg.key);
  if (hit) return hit;
  const p = (async () => {
    const fld = sc.f.fillDate;
    const out: Feature[] = [];
    for (let offset = 0; ; ) {
      const j = await agsFetch(`${pkg.url}/query`, {
        where: fld ? `${fld} IS NULL` : "1=1",
        outFields: [sc.f.oid, sc.f.no, sc.f.work].join(","),
        returnGeometry: "false",
        orderByFields: `${sc.f.oid} ASC`,
        resultRecordCount: "2000",
        resultOffset: String(offset),
      });
      const fs = (j.features || []) as Feature[];
      out.push(...fs);
      if (!j.exceededTransferLimit || fs.length === 0) break;
      offset += fs.length;
    }
    return lastFrame(out, sc.f.no).map((f) => rowKey(f, sc));
  })();
  baseKeyCache.set(pkg.key, p);
  return p;
}

/**
 * ЗЭРЭГЦҮҮЛЭЛТ — одоогийн мөрүүдийг лавлах дараалалтай тулгана.
 *
 * Буцаах нь `cur`-тай ижил урттай массив: лавлахад ТААРСАН мөрд лавлахын
 * индекс, ШИНЭЭР НЭМЭГДСЭН мөрд `-1`.
 *
 * ⚠️ Зөвхөн НЭМЭЛТИЙГ зөвшөөрнө (устгал биш) — тиймээс энгийн хоёр заагч
 * хангалттай. Лавлахын БҮХ мөр олдоогүй бол `null` буцаана: тэр нь мөр
 * нэмэгдсэн биш, эх хүснэгтийн бүтэц өөрчлөгдсөн гэсэн үг тул хуучин хатуу
 * алдаа руу унана — чимээгүй буруу зэрэгцүүлэлт хийхээс ЭРС дээр.
 */
function alignInsertions(cur: string[], ref: string[]): number[] | null {
  const map = new Array<number>(cur.length).fill(-1);
  let j = 0;
  for (let i = 0; i < cur.length; i += 1) {
    if (j < ref.length && cur[i] === ref[j]) {
      map[i] = j;
      j += 1;
    }
  }
  return j === ref.length ? map : null;
}

async function latestWhere(pkg: Pkg, sc: Schema): Promise<string> {
  const fld = sc.f.fillDate;
  if (!fld) return "1=1"; // талбар үүсээгүй үйлчилгээ — хуучин зан төлөв
  const j = await agsFetch(`${pkg.url}/query`, {
    where: `${fld} IS NOT NULL`,
    outStatistics: JSON.stringify([
      { statisticType: "max", onStatisticField: fld, outStatisticFieldName: "mx" },
    ]),
    returnGeometry: "false",
  });
  const mx = j.features?.[0]?.attributes?.mx as number | null | undefined;
  if (mx == null) return `${fld} IS NULL`;
  return dayFilter(fld, msToDay(mx));
}

/** Багцын бүх мөрийг татна — maxRecordCount 2000 тул хуудаслая. */
export async function loadRows(
  pkg: Pkg,
  sc: Schema,
  /**
   * Тодорхой АГШНЫГ (`YYYY-MM-DD`) татах — хяналтын харагдацад.
   * ⚠️ Хянагч нь «яг илгээсэн тэр агшныг» харах ёстой. Хамгийн сүүлийнхийг
   *    татвал гүйцэтгэгч дараа нь дахин бөглөсөн бол хянагч огт өөр тоо
   *    хараад батална — баталсан зүйл нь илгээсэн зүйлээсээ зөрнө.
   */
  atDay?: string,
  /**
   * Татах талбаруудын жагсаалт — өгвөл `outFields`-ийг хязгаарлана.
   * ⚠️ 2026-08-21 гүйцэтгэлийн аудит: мөр ~60+ баганатай, 10 багц нийлээд
   *    ~10-20МБ JSON болдог. Зөвхөн уншдаг хэрэглэгч (loadVariance) хэрэгтэй
   *    талбараа заавал payload тал хувиар буурна; заагаагүй бол `*` хэвээр
   *    (Pivot засварлахдаа бүх талбар хэрэгтэй). Дутуу талбарууд мөрөнд 0/null
   *    болж уншигдана — `raw` нь мөн хэсэгчилсэн болохыг анхаар.
   */
  fields?: string[],
): Promise<{ rows: SheetRow[]; asOf: number | null; snapshot: number | null }> {
  const tree = TREES[pkg.key] ?? "";
  const where =
    atDay && sc.f.fillDate ? dayFilter(sc.f.fillDate, atDay) : await latestWhere(pkg, sc);
  const feats: Feature[] = [];
  for (let offset = 0; ; ) {
    const j = await agsFetch(`${pkg.url}/query`, {
      where,
      outFields: fields?.length ? fields.join(",") : "*",
      returnGeometry: "false",
      orderByFields: `${sc.f.oid} ASC`,
      resultRecordCount: "2000",
      resultOffset: String(offset),
    });
    const fs = (j.features || []) as Feature[];
    feats.push(...fs);
    if (!j.exceededTransferLimit || fs.length === 0) break;
    offset += fs.length;
  }

  /**
   * ⚠️ ӨДӨРТ ХОЁР УДАА нийтэлбэл (санамсаргүй давхар товшилт, эсвэл алдаа
   *    засаад дахин нийтлэх) нэг өдөрт хоёр агшин үүснэ. Тэгвэл шүүлт нь
   *    хоёуланг нь татаж, хуудас ХОЁР ДАХИН уртсаж, шатлал бүхэлдээ
   *    холилдоно. Хуудасны мөрийн тоо нь `TREES`-ийн уртаар ТОГТМОЛ тул
   *    илүү гарвал ХАМГИЙН СҮҮЛИЙН бүтэн хуулбарыг л үлдээнэ (ObjectID
   *    өсөх дараалалтай тул сүүлийнх нь хамгийн шинэ).
   *
   *    Устгал хийхгүй — хуучин давхардал үйлчилгээнд үлдэнэ, гэхдээ
   *    хуудсанд огт нөлөөлөхгүй бөгөөд огноогоор шүүхэд түүх бүтэн хэвээр.
   */
  const expect = tree.length;

  /*
   * ⚠️ ХУУЛБАРЫН ЗААГ — ХАМГИЙН СҮҮЛИЙН нийтлэлтийг л үлдээнэ.
   *
   * `latestWhere` нь ӨДРӨӨР шүүдэг тул нэг өдөрт хоёр удаа нийтэлбэл хоёр
   * бүтэн хуулбар зэрэг ирнэ (Багц 1-ийн 2026-08-21-нд яг тийм тохиолдсон).
   *
   * ⚠️ 2026-08-28 ЗАСВАР: урьд нь `feats.slice(-expect)` гэж ЗУРАГЛАЛЫН УРТААР
   * огтолдог байв. Мөр НЭМЭГДСЭН хуудсанд (1371 мөр) тэр нь эхний мөрийг
   * чимээгүй хаяж, тоо нь `expect`-тэй тэнцэх тул доорх хамгаалалт ч
   * ажиллахгүй — БҮХ мөр нэгээр гулсаж, бүлэг/ажил хольцолдоно. Одоо
   * хуулбарыг ЖААЗНЫ ЭХНИЙ №-ээр таньж (sheetRows.ts-ийн `snap`-тай ижил
   * дүрэм), сүүлийн жаазыг бүтнээр нь авна — мөрийн тоо ямар ч байсан зөв.
   */
  /* ⚠️ `expect`-ийг дамжуулна: зураглалаас БОГИНО жааз нь хагас бичигдсэн
     нийтлэлийн үлдэгдэл тул түүнийг алгасаж өмнөх бүтэн агшныг авна. */
  const feats2 = lastFrame(feats, sc.f.no, expect);

  /**
   * ШАТЛАЛ ХААНААС ГАРАХ ВЭ.
   *
   * 1. `gun` багана — мөр бүр өөрийн гүнээ АВЧ ЯВНА. Мөрийн тоо чөлөөтэй.
   * 2. Эс бөгөөс `TREES` — БАЙРЛАЛААР. Мөрийн тоо ТОГТМОЛ байх ёстой.
   *
   * ⚠️ 2026-08-27: урьд нь зөвхөн (2) байсан тул хуудсанд мөр нэмэх ОГТ
   * боломжгүй байв — нэмэнгүүт мөрийн тоо зураглалын урттай зөрж, доорх
   * шалгуур хуудсыг бүхэлд нь хаадаг байлаа. Ерөнхий менежер бүлэг дотор ажил
   * нэмэх шаардлага гарсан тул шатлалыг өгөгдөл рүү шилжүүлэв.
   *
   * ⚠️ ШАЛГУУРЫГ БҮРЭН УСТГААГҮЙ гэдгийг анхаар: `gun` хоосон байгаа үед тэр
   * нь ХЭВЭЭР хүчинтэй. Эс бөгөөс эх excel-ийн бүтэц чимээгүй өөрчлөгдөхөд
   * бүлэг/ажил хольцолдож, гүйцэтгэл огт өөр мөрөнд наалдана.
   */
  const hasGun =
    !!sc.f.gun && feats2.length > 0 && feats2.every((f) => f.attributes[sc.f.gun!] != null);

  /**
   * ⚠️ Хоосон хүснэгт (0 мөр) нь тусдаа тохиолдол: суурь өгөгдөл хараахан
   *    ачаалагдаагүй гэсэн үг тул өөрийн гэсэн мессежтэй.
   */
  if (expect > 0 && feats2.length === 0)
    throw new Error(tr('{0}: хуудсанд мөр алга — эх хүснэгтийг эхлээд ачаална уу.', pkg.label));

  /**
   * МӨР БҮРИЙН ГҮН.
   *
   * Гурван эх сурвалж, энэ эрэмбээр:
   *   1. `gun` багана (байвал) — мөр өөрийн гүнээ авч явна.
   *   2. Мөрийн тоо зураглалтай ТААРВАЛ — байрлалаар шууд.
   *   3. ЗӨРВӨЛ — суурь агшинтай зэрэгцүүлж, ШИНЭ мөрийг ялгана. Ерөнхий
   *      менежер бүлэг дотор ажил нэмэхэд яг энэ зам ажиллана; нэмсэн мөр нь
   *      ах дүү мөрүүдийнхээ ард залгагддаг тул гүн нь ӨМНӨХ мөрийнхтэй ижил.
   *
   * ⚠️ Зэрэгцүүлэлт бүтэхгүй бол (эх хүснэгтийн бүтэц өөрчлөгдсөн) ХУУЧИН
   * хатуу алдаа руу унана. Чимээгүй буруу шатлалаас алдаа шидэх нь ХАВЬГҮЙ
   * дээр — эс бөгөөс гүйцэтгэл огт өөр мөрөнд наалдана.
   */
  const treeDepth = (i: number): number => {
    const ch = tree[i] ?? '0';
    return ch >= 'A' && ch <= 'E' ? ch.charCodeAt(0) - 65 : Number(ch);
  };
  const depthArr = new Array<number>(feats2.length).fill(0);
  if (hasGun) {
    for (let i = 0; i < feats2.length; i += 1) {
      depthArr[i] = Number(feats2[i].attributes[sc.f.gun!]) || 0;
    }
  } else if (expect > 0 && feats2.length !== expect) {
    const ref = await loadBaseKeys(pkg, sc);
    const map =
      ref.length === expect ? alignInsertions(feats2.map((f) => rowKey(f, sc)), ref) : null;
    if (!map)
      throw new Error(
        tr(
          '{0}: {1} мөр ирлээ, {2} байх ёстой. Нэмэгдсэн мөрүүдийг суурь агшинтай тулгаж чадсангүй — эх хүснэгтийн бүтэц өөрчлөгдсөн бол шатлалын зураглалыг (bagts.trees.ts) дахин гаргах шаардлагатай.',
          pkg.label,
          feats2.length,
          expect,
        ),
      );
    for (let i = 0; i < feats2.length; i += 1) {
      depthArr[i] = map[i] >= 0 ? treeDepth(map[i]) : i > 0 ? depthArr[i - 1] : 0;
    }
  } else if (expect > 0) {
    for (let i = 0; i < feats2.length; i += 1) depthArr[i] = treeDepth(i);
  }

  // Excel-ийн 2-р мөрийн «Шинэчлэгдсэн огноо» ($BH$2 г.м.) нь бүх төлөвлөгөөт
  // хувийн лавлах цэг. Мөр бүрт биш, зөвхөн тэнд бичигдсэн.
  let asOf: number | null = null;
  let snapshot: number | null = null;
  const rows: SheetRow[] = [];
  feats2.forEach((f, k) => {
    const a = f.attributes;
    const oid = Number(a[sc.f.oid]);
    if (asOf == null && sc.f.asOf) asOf = num(a[sc.f.asOf]);
    if (snapshot == null && sc.f.fillDate) snapshot = num(a[sc.f.fillDate]);
    const work = String(a[sc.f.work] ?? "").trim();
    const no = String(a[sc.f.no] ?? "").trim();
    if (!work && !no) return; // хуудасны сүүлийн хоосон мөрүүд
    /**
     * ГҮН ба БҮЛЭГ ЭСЭХ.
     *
     * `gun` багана дүүрсэн бол мөрөөс шууд. Тэгэхэд «бүлэг эсэх» нь тусдаа
     * талбаргүй тул ДАРААГИЙН мөрөөс гарна: дараагийн мөрийн гүн нь өөрөөсөө
     * ИХ бол энэ мөр бүлэг (дор нь удам бий). Энэ дүрэм нь `childIndexes`-ийн
     * стек логиктой ЯГ ижил тул хоёр эх сурвалж хэзээ ч зөрөхгүй.
     *
     * ⚠️ Нөөц зам (`TREES`): модны гүнийг АГШИН ДОТОРХ БАЙРЛАЛААР олно,
     *    ObjectID-гаар БИШ. Архивын шинэ хуулбар нэмэгдэхэд ObjectID үсэрдэг
     *    тул `oid − 1` гэвэл бүх бүлэг/ажлын шатлал холилдоно. Агшин бүр
     *    хуудсыг БҮТНЭЭР нь, ижил дарааллаар агуулдаг тул байрлал нь
     *    тогтвортой (анхны суурь өгөгдөл дээр `k === oid − 1`).
     */
    /* «Бүлэг эсэх» нь тусдаа талбаргүй — ДАРААГИЙН мөрийн гүнээс гарна.
       Энэ дүрэм `TREES`-ийн тэмдэглэгээтэй 14801 мөр дээр ЯГ таарсан
       (`gun.check.mjs`) тул гурван эх сурвалжийн аль нь ч ижил үр дүн өгнө. */
    const depth = depthArr[k];
    const group = k + 1 < depthArr.length && depthArr[k + 1] > depth;
    rows.push({
      oid,
      no,
      work,
      depth,
      group,
      wC: num(a[sc.f.wC]),
      wD: num(a[sc.f.wD]),
      vol: num(a[sc.f.vol]),
      unit: num(a[sc.f.unit]),
      money: num(a[sc.f.money]),
      act: sc.act.map((k) => num(a[k])),
      obyem: sc.obyem.map((k) => (k ? num(a[k]) : null)),
      // ⚠ Огноогүй блок бий (Багц 3.1-ийн 5/2 — excel толгой нь эвдэрсэн);
      //   тэнд төлөвлөгөөт хувь бодогдохгүй, `null` хэвээр үлдэнэ.
      raw: a,
      start: sc.start.map((x) => (x ? num(a[x]) : null)),
      end: sc.end.map((x) => (x ? num(a[x]) : null)),
      docs: sc.docs.map((x) => {
        if (!x) return null;
        const v = a[x];
        if (v == null) return null;
        const t = String(v).trim();
        return t ? t : null;
      }),
    });
  });
  return { rows, asOf, snapshot };
}

// ── Томъёо ───────────────────────────────────────────────────────────────────

/**
 * Excel X3: `IF($BH$2<=AJ3,0,IF($BH$2>=AK3,1,($BH$2-AJ3)/(AK3-AJ3)))`
 * — эхлэх/дуусах огнооны хооронд шугаман интерполяци.
 * (Зарим багцын excel-д `(AO3-AL3)` гэсэн бичлэгийн алдаа бий — тэр багана
 * хуваарийг буруу мөрөөс уншдаг. Энд зөв хэлбэрээр нь бодсон.)
 */
export const planAt = (
  asOf: number,
  s: number | null,
  e: number | null,
): number | null => {
  if (s == null || e == null) return null;
  if (asOf <= s) return 0;
  if (asOf >= e) return 1;
  return e === s ? 1 : (asOf - s) / (e - s);
};

/** «YYYY-MM-DD» ↔ ms (UTC — үйлчилгээний огноо UTC шөнө дунд байдаг). */
export const dayToMs = (s: string): number | null =>
  s ? Date.parse(`${s}T00:00:00Z`) : null;
export const msToDay = (ms: number | null): string =>
  ms == null ? "" : new Date(ms).toISOString().slice(0, 10);

/**
 * Нүдэнд бичигдсэн ОБЬЁМ — нийтлээгүй засвар байвал түүнийг, эс бөгөөс
 * үйлчилгээнд хадгалагдсаныг. Бичигдээгүй бол `null` (тэг БИШ).
 *
 * ⚠️ Обьёмыг хувиас нь БУЦААЖ БОДОХГҮЙ. Урьд нь хоосон нүдэнд
 *    `хувь × Обьём` гэж тооцоолж харуулдаг байсан нь хэрэглэгчийн огт
 *    бичээгүй тоог (1,300 · 900.48 · 450.24…) бүртгэл мэт харуулж байв.
 *    Обьём бол ХЭМЖИЛТ — таамаглаж болохгүй, зөвхөн гараар бичигдэнэ.
 *    Хоосон байхад гүйцэтгэлийн хувь нь хуучнаараа хэвээр үлдэнэ.
 */
export const cellObyem = (
  r: SheetRow,
  b: number,
  edits: Record<string, string> = {},
): number | null => {
  const e = edits[`${r.oid}:${b}`];
  if (e === undefined) return r.obyem[b];
  const t = e.trim();
  if (t === "") return null;
  // Сөрөг обьём утгагүй — бичсэн ч 0-оор хаана.
  return Number.isFinite(Number(t)) ? Math.max(0, Number(t)) : r.obyem[b];
};
/** Нийтлээгүй засвар байвал түүнийг, эс бөгөөс хадгалагдсаныг. `""` = арилгах. */
const pickDate = (edit: string | undefined, stored: number | null) =>
  edit === undefined ? stored : dayToMs(edit);

/**
 * Нүдэн дэх огноо ХААНААС ирсэн бэ:
 *   `own`  — энэ мөрд бичигдсэн (гараар засагдана, серверт хадгалагдана)
 *   `agg`  — дэд мөрүүдийнхээ MIN/MAX (excel: `MIN(AF23:AF38)`) — засагдахгүй
 *   `none` — огноо алга
 */
export type DateSrc = "own" | "agg" | "none";

export type Calc = {
  plan: (number | null)[]; // блок бүрийн төлөвлөгөөт
  act: (number | null)[]; // блок бүрийн бодит
  /** Блок бүрийн ХУРИМТЛАГДСАН обьём (нэмэлт засвар нэмэгдсэн). Бүлэгт `null`. */
  obyem: (number | null)[];
  /**
   * Мөрийн блокуудын обьёмын НИЙЛБЭР (`obyem_sum` талбарт бичигдэнэ).
   * ⚠️ Бүх блок хоосон бол `null` — 0 БИШ. «Тэг обьём» ба «огт бөглөөгүй»
   * хоёр өөр утга бөгөөд 0 бичвэл бөглөсөн мэт харагдана.
   */
  obyemSum: number | null;
  start: (number | null)[];
  end: (number | null)[];
  startSrc: DateSrc[];
  endSrc: DateSrc[];
  H: number | null; // Мөнгөн дүн (excel H)
  C: number | null; // Хувийн жин — дээд мөртөө эзлэх (excel C)
  D: number | null; // Хувийн жин — үе шатандаа эзлэх (excel D)
  E: number | null; // Хувийн жин- Одоо байгаа (excel E)
  I: number; // Төлөвлөгөөт гүйцэтгэл
  J: number; // Бодит гүйцэтгэл
  K: number; // Төлөвлөгөө биелэлт
};

/**
 * Мөр бүрийн ДЭД мөрүүд. Мөрийн дээд мөр гэдэг нь: түүнээс дээш байрлах,
 * өөрөөс нь бага гүнтэй хамгийн ойрын мөр. Excel-ийн нийлбэр томъёонуудаас
 * гаргасан шатлалтай яг таарахыг багц бүр дээр `tools/bagts-tree.mjs`
 * шалгасан (зөрүү 0).
 */
export function childIndexes(rows: SheetRow[]): number[][] {
  const kids: number[][] = rows.map(() => []);
  const stack: number[] = [];
  rows.forEach((r, i) => {
    while (stack.length && rows[stack[stack.length - 1]].depth >= r.depth)
      stack.pop();
    if (stack.length) kids[stack[stack.length - 1]].push(i);
    stack.push(i);
  });
  return kids;
}

/** Мөр бүрийн дээд мөрийн индекс (дээд мөргүй бол −1). */
function parentIndexes(rows: SheetRow[]): number[] {
  const p = new Array(rows.length).fill(-1);
  const stack: number[] = [];
  rows.forEach((r, i) => {
    while (stack.length && rows[stack[stack.length - 1]].depth >= r.depth)
      stack.pop();
    if (stack.length) p[i] = stack[stack.length - 1];
    stack.push(i);
  });
  return p;
}

/**
 * Хуудсыг бүхэлд нь дахин бодно — excel-ийн БҮХ томъёог давтана.
 *
 * H · Мөнгөн дүн        ажлын мөр `=F*G` (Обьём×Нэгж өртөг), бүлэг `=ΣH(дэд мөр)`
 * C · Хувийн жин        `=H/H(дээд мөр)` — дээд мөртөө эзлэх хувь (үндэс = 1)
 * D · Хувийн жин        `=H/H(үе шат)` — үе шатандаа эзлэх хувь
 * E · Одоо байгаа       ажлын мөр `=C*J`, бүлэг `=C*ΣE(дэд мөр)` ← гүйцэтгэл өөрчлөгдөхөд ХӨДӨЛНӨ
 * төлөвлөгөөт багана    ажлын мөр огноогоор интерполяци, бүлэг D-жинтэй дундаж
 * бодит багана          ажлын мөр засвар/хадгалсан, бүлэг D-жинтэй дундаж
 * эхлэх/дуусах          бүлэг MIN(эхлэх) / MAX(дуусах)
 * I / J                 `=AVERAGE(блокийн нүднүүд)` (хоосон = 0)
 * K                     `=IF(I=0,0,J/I)`
 *
 * ⚠ «Бэлтгэл ажил» (A) бүлгийн дэд мөрүүдэд жин огт байхгүй — excel дэх
 *   `SUMPRODUCT($C3:$C10,…)` үргэлж 0 гаргадаг. Жингийн нийлбэр 0 үед энгийн
 *   дунджаар бодов; 0 харуулснаас үнэн.
 *
 * Тооцооны дараалал чухал: H (доороос дээш) → C, D (дээрээс доош) → бодит
 * гүйцэтгэл ба J (доороос дээш) → E (C ба J-ээс хамаарна, доороос дээш).
 */
export function computeAll(
  rows: SheetRow[],
  nBld: number,
  asOf: number,
  edits: Record<string, string> = {},
  dateEdits: Record<string, string> = {},
  /**
   * Блок бүрд `*_obyem` талбар байгаа эсэх (`Schema.obyem`-ээс). Байхгүй блокт
   * обьём бичих газаргүй тул нүд ТҮГЖЭЭТЭЙ — хадгалагдсан хувь нь хэвээр
   * үлдэж, бүлгийн дундажид оролцсоор байна.
   */
  hasObyem: readonly boolean[] = [],
): Calc[] {
  const kids = childIndexes(rows);
  const par = parentIndexes(rows);
  const n = nBld;
  const N = rows.length;

  // ── 1. H (Мөнгөн дүн), доороос дээш ────────────────────────────────────────
  const H: (number | null)[] = new Array(N).fill(null);
  for (let i = N - 1; i >= 0; i--) {
    if (kids[i].length) {
      let s = 0,
        any = false;
      for (const k of kids[i])
        if (H[k] != null) {
          s += H[k]!;
          any = true;
        }
      H[i] = any ? s : rows[i].money;
    } else {
      const r = rows[i];
      H[i] = r.vol != null && r.unit != null ? r.vol * r.unit : r.money;
    }
  }

  // ── 2. C, D (хувийн жин), дээрээс доош ─────────────────────────────────────
  // D-ийн хуваарь нь тухайн мөрийн ҮЕ ШАТ (гүн 0 өвөг)-ийн H: excel-д `H15/$H$11`
  // буюу «БАРИЛГА УГСРАЛТЫН АЖИЛ»-ын нийт дүн.
  const C: (number | null)[] = new Array(N).fill(null);
  const D: (number | null)[] = new Array(N).fill(null);
  const rootH: (number | null)[] = new Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    const p = par[i];
    rootH[i] = p < 0 ? H[i] : rootH[p];
    C[i] =
      p >= 0 && H[i] != null && H[p]
        ? H[i]! / H[p]!
        : p < 0
          ? (rows[i].wC ?? 1)
          : rows[i].wC;
    D[i] = H[i] != null && rootH[i] ? H[i]! / rootH[i]! : rows[i].wD;
  }

  /* ── 3. ХУВААРИЙН ОГНОО ────────────────────────────────────────────────────
   * а) өөрийн (эсвэл засварласан) огноо      → `own`  (засагдана)
   * б) байхгүй бол дэд мөрүүдийн MIN/MAX     → `agg`  (бодогдоно)
   *
   * ⚠️ Огноог ДЭЭД мөрөөс доош ӨВЛҮҮЛЖ БОЛОХГҮЙ. Эх `9F` хуудсанд мөр бүр
   *    огноотой байдаг тул «доод ажлууд нь дээдийнхээ хуваарийг өвлөнө» гэж
   *    үзэх нь логикийн хувьд сонсогдоно — гэвч 10 багцын ХАДГАЛАГДСАН
   *    төлөвлөгөөт хувьтай тулгахад таарц 97.5%-иас 26.9% болж унасан.
   *    `*_final_publish` дээрх нарийвчилсан мөрүүд огноогүй нь САНААТАЙ:
   *    тэдгээрийн төлөвлөгөөт хувь 0 бөгөөд бүлэг рүүгээ тэрхүү 0-оороо
   *    жигнэгдэн ордог. Мөн бүлгийн мөрийг өөрийнх нь огноогоор интерполяци
   *    хийвэл 97.5% → 97.3% болж бага зэрэг дордоно. Тиймээс бүлэг нь ҮРГЭЛЖ
   *    дэд мөрүүдийнхээ жигнэсэн дундаж. */
  const St: (number | null)[][] = [];
  const En: (number | null)[][] = [];
  const StSrc: DateSrc[][] = [];
  const EnSrc: DateSrc[][] = [];
  for (let i = 0; i < N; i++) {
    St[i] = new Array(n).fill(null);
    En[i] = new Array(n).fill(null);
    StSrc[i] = new Array(n).fill("none");
    EnSrc[i] = new Array(n).fill("none");
  }
  for (let i = N - 1; i >= 0; i--) {
    const r = rows[i];
    for (let b = 0; b < n; b++) {
      const os = pickDate(dateEdits[`${r.oid}:${b}:s`], r.start[b]);
      const oe = pickDate(dateEdits[`${r.oid}:${b}:e`], r.end[b]);
      if (os != null) { St[i][b] = os; StSrc[i][b] = "own"; }
      if (oe != null) { En[i][b] = oe; EnSrc[i][b] = "own"; }
      if (!kids[i].length) continue;
      if (St[i][b] == null) {
        let m: number | null = null;
        for (const k of kids[i]) {
          const v = St[k][b];
          if (v != null && (m == null || v < m)) m = v;
        }
        if (m != null) { St[i][b] = m; StSrc[i][b] = "agg"; }
      }
      if (En[i][b] == null) {
        let m: number | null = null;
        for (const k of kids[i]) {
          const v = En[k][b];
          if (v != null && (m == null || v > m)) m = v;
        }
        if (m != null) { En[i][b] = m; EnSrc[i][b] = "agg"; }
      }
    }
  }
  // ── 4. Гүйцэтгэл, төлөвлөгөө + E, доороос дээш ─────────────────────────────
  const out: Calc[] = new Array(N);
  for (let i = N - 1; i >= 0; i--) {
    const r = rows[i];
    const plan: (number | null)[] = new Array(n).fill(null);
    const act: (number | null)[] = new Array(n).fill(null);
    // ⚠️ Бүлгийн мөрд обьём НИЙЛҮҮЛЭХГҮЙ: дэд ажлууд нь м³ · м² · ш гэсэн ӨӨР
    //    нэгжтэй тул нийлбэр нь утгагүй тоо гаргана. Бүлэг зөвхөн хувиараа
    //    (жигнэсэн дундаж) илэрхийлэгдэнэ.
    const obyem: (number | null)[] = new Array(n).fill(null);
    const start = St[i];
    const end = En[i];
    const startSrc = StSrc[i];
    const endSrc = EnSrc[i];

    if (kids[i].length) {
      // Excel: `SUMPRODUCT($C(дэд), T(дэд))` — дэд мөрүүдийн C нийлбэр 1 тул
      // энэ нь D-жинтэй хэвийсэн дундажтай тэнцүү (D ∝ C).
      const den = kids[i].reduce((s, k) => s + (D[k] ?? 0), 0);
      for (let b = 0; b < n; b++) {
        let sp = 0,
          sa = 0,
          cnt = 0;
        for (const k of kids[i]) {
          const w = den > 0 ? (D[k] ?? 0) : 1;
          sp += w * (out[k].plan[b] ?? 0);
          sa += w * (out[k].act[b] ?? 0);
          cnt += w;
        }
        plan[b] = cnt > 0 ? sp / cnt : null;
        act[b] = cnt > 0 ? sa / cnt : null;
        // ⚠️ Хуваарийг доод ажлууд дээр нь биш, ШУУД энэ бүлэг дээр бичсэн бол
        //    (`own` — дэд мөрүүд огноогүй тул MIN/MAX хоосон гарсан) дундаж нь
        //    үргэлж 0 болно. Эх `9F` хуудсанд ийм мөрүүд огноогоороо бодогддог:
        //    жишээ нь Багц 4.1-ийн «СУУРИЙН АЖИЛ» — 9F 93.8%, publish 0.0%.
        //    Эталон нь `9F` тул огноогоор нь интерполяци хийнэ.
        if (
          startSrc[b] === "own" &&
          endSrc[b] === "own" &&
          start[b] != null &&
          end[b] != null
        )
          plan[b] = planAt(asOf, start[b], end[b]);
      }
    } else {
      for (let b = 0; b < n; b++) {
        // Excel `9F`-ийн T багана:
        //   `IF($R$5<=AF,0,IF($R$5>=AG,1,($R$5-AF)/(AG-AF)))`
        plan[b] = planAt(asOf, start[b], end[b]);

        /* ── ГҮЙЦЭТГЭЛ ОБЬЁМООР (2026-08-20) ──────────────────────────────
         * Нүд бүр ХОЁР тусдаа тоог агуулна:
         *   обьём — бөглөсөн ХУРИМТЛАЛ (`*_obyem`). Хэрэглэгч ЭНЭ УДААГИЙН
         *           нэмэлтээ бичихэд өссөөр бичигдэнэ.
         *   хувь  — гүйцэтгэл. Мөрийн `Обьём` (хуваарь) байвал обьёмоос
         *           бодогдоно, эс бөгөөс гараар бичигдэнэ.
         *
         * ⚠️ ОБЬЁМ БҮРТГЭХИЙГ хуваарь байхгүй гэж ХОРИГЛОХГҮЙ. Хийсэн ажлын
         *    тоо хэмжээ нь өөрөө үнэ цэнтэй бүртгэл; «Обьём» багана хожим
         *    бөглөгдмөгц хувь нь өөрөө бодогдож эхэлнэ. Урьд нь хуваарьгүй
         *    нүдийг түгжиж байсан нь хэрэглэгчийг «А. Бэлтгэл ажил»-ын
         *    мөрүүд дээр хаалттай хана мөргүүлж байв.
         *
         * ⚠️ Нэмэлт нь ХУРИМТЛАЛ дээр нэмэгддэг тул суурь нь ҮРГЭЛЖ сая
         *    татсан мөр байх ёстой — `publish` нийтлэхийн өмнө `loadRows`-оор
         *    шинэчилдэг нь яг үүний төлөө (хоёр хэрэглэгч зэрэг нэмэхэд
         *    хоёулангийнх нь нэмэлт хадгалагдана, дарж бичихгүй).
         *
         * Түлхүүр: `<oid>:<b>` = блокийн обьём. Мөрийн Обьём ба хувь хоёр нь
         * засагддаггүй тул түлхүүргүй. */
        // ⚠️ Мөрийн Обьём нь ЭХ ӨГӨГДЛИЙН тоо хэмжээ — энэ хуудаснаас
        //    засагддаггүй (эх хүснэгтэд оруулна). Тиймээс шууд уншина.
        const rVol = r.vol;
        const hasField = hasObyem[b] === true;

        // 1) ОБЬЁМ — зөвхөн гараар бичигдсэн нь. Бодогдохгүй, таамаглахгүй.
        const cum = hasField ? cellObyem(r, b, edits) : null;
        obyem[b] = cum;

        // 2) ХУВЬ — ЗӨВХӨН обьёмоос бодогдоно. Гараар бичих зам БАЙХГҮЙ.
        //    Хуваарь (мөрийн Обьём) хараахан алга бол хадгалагдсан хувь нь
        //    хэвээр үлдэнэ — Обьёмыг нь оруулмагц өөрөө бодогдож эхэлнэ.
        act[b] = cum != null && rVol != null && rVol > 0 ? cum / rVol : r.act[b];
      }
    }

    // `AVERAGE(IF(range="",0,range))` — хоосныг 0 гэж үзэн блокийн тоонд хуваана.
    const avg = (v: (number | null)[]) =>
      v.reduce<number>((s, x) => s + (x ?? 0), 0) / n;
    const I = avg(plan);
    const J = avg(act);

    // E · Хувийн жин- Одоо байгаа. Ажлын мөр `=C*J`; бүлэг `=C*(ΣE дэд мөр)` —
    // дэд мөрийн C нийлбэр 1 тул энэ нь бүлгийн хувьд ч `C*J`-тэй тэнцүү.
    let E: number | null = null;
    if (C[i] != null) {
      if (kids[i].length) {
        let s = 0,
          any = false;
        for (const k of kids[i])
          if (out[k].E != null) {
            s += out[k].E!;
            any = true;
          }
        E = any ? C[i]! * s : null;
      } else {
        E = C[i]! * J;
      }
    }

    /*
     * ОБЬЁМЫН НИЙЛБЭР — зөвхөн УТГАТАЙ блокуудыг нэмнэ.
     * ⚠️ Нэг ч блок бөглөгдөөгүй бол `null` буцаана, 0 БИШ. «Тэг обьём» ба
     * «огт бөглөөгүй» хоёр өөр утга; 0 бичвэл эх өгөгдөл дээр бөглөсөн мэт
     * харагдаж, дараагийн нийтлэлд хуримтлалын суурь гажина.
     */
    let oSum: number | null = null;
    for (const v of obyem) if (v != null) oSum = (oSum ?? 0) + v;

    out[i] = {
      plan,
      act,
      obyem,
      obyemSum: oSum,
      start,
      end,
      startSrc,
      endSrc,
      H: H[i],
      C: C[i],
      D: D[i],
      E,
      I,
      J,
      K: I === 0 ? 0 : J / I,
    };
  }
  return out;
}

/** Засварласан мөр + түүний бүх өвөг мөрийн индексүүд (нийтлэхэд шинэчлэгдэнэ). */
export function touchedIndexes(
  rows: SheetRow[],
  editedOids: Set<number>,
): number[] {
  const hit = new Set<number>();
  const stack: number[] = [];
  rows.forEach((r, i) => {
    while (stack.length && rows[stack[stack.length - 1]].depth >= r.depth)
      stack.pop();
    if (editedOids.has(r.oid)) {
      hit.add(i);
      for (const a of stack) hit.add(a);
    }
    stack.push(i);
  });
  return [...hit].sort((a, b) => a - b);
}

/**
 * Хуулбарт ХЭЗЭЭ Ч дамжуулж болохгүй талбарууд — үйлчилгээ өөрөө оноодог.
 * ObjectID-г дамжуулбал `addFeatures` тэр дугаартай мөр рүү наалдах эсвэл
 * унах эрсдэлтэй; GlobalID/бүртгэлийн талбарууд ч мөн адил.
 */
const SERVER_FIELDS = /^(ObjectID|OBJECTID|GlobalI[Dd]|CreationDate|Creator|EditDate|Editor)$/;

/**
 * АРХИВЫН ШИНЭ АГШИН — хуудсыг БҮХЭЛД нь доор нь хуулбарлаж нэмнэ.
 *
 * ⚠️ Энэ нь `updates`-ээс ЗАРЧМЫН ялгаатай: хуучин мөр дарагдахгүй, түүх
 *    хэзээ ч алдагдахгүй. Мөр бүрд `buglusun_ognoo` бичигдэх тул огноогоор
 *    шүүхэд тэр өдрийн бүтэн зураг гарна.
 *
 * ⚠️ Мөр бүрийн БҮХ талбарыг (`raw`) хуулж, зөвхөн бодогдсоныг нь дарж
 *    бичнэ — код мэддэггүй багана ч хуулбарт бүрэн үлдэнэ.
 */
export async function applyAdds(
  pkg: Pkg,
  features: Record<string, unknown>[],
): Promise<{ added: number; firstOid: number | null }> {
  let added = 0;
  // ⚠️ ЭХНИЙ мөрийн OBJECTID — хяналтын бүртгэл эх өгөгдөл рүүгээ буцаж
  //    холбогдоход хэрэгтэй (`hyanaltSubmit`).
  let firstOid: number | null = null;
  for (let i = 0; i < features.length; i += 500) {
    const chunk = features.slice(i, i + 500).map((attributes) => {
      const a: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(attributes))
        if (!SERVER_FIELDS.test(k)) a[k] = v;
      return { attributes: a };
    });
    try {
      const j = await agsFetch(`${pkg.url}/applyEdits`, {
        adds: JSON.stringify(chunk),
        rollbackOnFailure: "true",
      });
      const res = (j.addResults || []) as {
        success?: boolean; objectId?: number; error?: { description?: string };
      }[];
      const bad = res.find((r) => r.success === false);
      if (bad) throw new Error(bad.error?.description || tr('Нэмэх амжилтгүй'));
      if (firstOid == null && typeof res[0]?.objectId === "number") firstOid = res[0].objectId;
      added += res.length;
    } catch (e) {
      // ⚠️ rollbackOnFailure зөвхөн НЭГ chunk дотроо үйлчилнэ — өмнөх
      //    chunk-ууд аль хэдийн бичигдсэн тул хагас амжилтыг тодруулна.
      if (added > 0)
        throw new Error(
          tr(
            '{0}/{1} мөр нэмэгдэв; үлдсэн нь амжилтгүй ({2}) — дахин Нийтлэх дарж гүйцээнэ үү',
            added,
            features.length,
            String((e as Error).message || e),
          ),
        );
      throw e;
    }
  }
  /*
   * ⚠️ БИЧСЭНИЙ ДАРАА ДАШБОАРДЫГ ХУУЧИРСАН ГЭЖ ЗАРЛАНА (`dataBus.ts`).
   *
   * Урьд нь нийтэлсний дараа энэ хуудас өөрөө шинэчлэгддэг байсан ч
   * `loadBlockProgress`/`loadFinData` нар кэшээ барьдаг тул дашбоард дээрх
   * тоо ХУУЧИН хэвээр үлддэг байв — хуудсыг бүтнээр нь refresh хийж байж л
   * шинэчлэгдэнэ. Хэрэглэгч өөрийн бичсэн тоог дэлгэц дээр харахгүй бол
   * бичигдсэн эсэхэд эргэлзэж дахин дардаг — архивт давхардсан агшин үүснэ.
   */
  if (added > 0) invalidate('BAGTS_SHEET');
  return { added, firstOid };
}

/** `applyEdits` — 500-аар хуваан илгээнэ. */
export async function applyUpdates(
  pkg: Pkg,
  updates: Record<string, unknown>[],
): Promise<void> {
  /*
   * ⚠️ ХЭСЭГЧЛЭН амжилттай байсан ч кэшийг хүчингүй болгоно (2026-08-29).
   * Урьд нь энэ функц `dataBus`-ыг ОГТ дууддаггүй байв — «Хуваарь» дээр
   * огноо хадгалсны дараа дашбоард, тайлангийн төлөвлөгөөт тоо хуучин
   * хэвээр үлдэж, хуудас бүтнээр refresh хийж байж л шинэчлэгддэг байлаа
   * (нийтлэх зам нь `applyAdds`-аараа зарладаг тул зөвхөн ЭНЭ зам мартагдсан).
   * Алдааны үед ч эхний chunk-ууд серверт бичигдсэн байж болох тул
   * `finally` дотор — «бичигдсэн атлаа хуучин тоо харуулах»-аас
   * «бичигдээгүй атлаа дахин татах» нь хавьгүй хямд.
   */
  let written = 0;
  try {
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    try {
      const j = await agsFetch(`${pkg.url}/applyEdits`, {
        updates: JSON.stringify(chunk.map((attributes) => ({ attributes }))),
        rollbackOnFailure: "true",
      });
      const bad = (j.updateResults || []).find(
        (r: { success?: boolean }) => r.success === false,
      );
      if (bad)
        throw new Error(
          (bad as { error?: { description?: string } }).error?.description ||
            tr('Шинэчлэх амжилтгүй'),
        );
      written += chunk.length;
    } catch (e) {
      // ⚠️ rollbackOnFailure зөвхөн НЭГ chunk дотроо үйлчилнэ — өмнөх chunk-ууд
      // аль хэдийн серверт бичигдсэн тул хагас амжилтыг мессежид тодруулна.
      if (i > 0)
        throw new Error(
          tr(
            '{0}/{1} мөр хадгалагдав; үлдсэн нь амжилтгүй ({2}) — дахин Нийтлэх дарж гүйцээнэ үү',
            i,
            updates.length,
            String((e as Error).message || e),
          ),
        );
      throw e;
    }
  }
  } finally {
    if (written > 0) invalidate('BAGTS_SHEET');
  }
}
