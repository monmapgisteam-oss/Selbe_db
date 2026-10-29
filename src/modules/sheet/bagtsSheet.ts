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
import { isLostWrite } from "@/lib/lostWrite";
import { ArcGISError } from "@/lib/query";
import { DAY, spanFrac } from "@/lib/plan";
import { persistedFrame, probeStats, sigFrom, type Sig } from "@/lib/sheetCache";
import { normCell } from "./paste";

export type SheetRow = {
  oid: number;
  no: string;
  /**
   * АЖЛЫН КОД (`Des_dugaar`) — жаазан дотор ДАВТАГДАХГҮЙ 1…N.
   */
  des: number | null;
  /**
   * УЯЛДАА (`Hamaaral`) — «18FS3,22SS-5» түүхий текст. Задлалт нь дэлгэцийн
   * давхаргад (`deps.ts`), энд түүхийгээр нь авч явна: архивын хуулбарт
   * `raw`-тай хамт өөрчлөлтгүй дамжина. Хоосон бол `null`.
   */
  ham: string | null;
  work: string;
  depth: number;
  group: boolean;
  wC: number | null;
  wD: number | null;
  vol: number | null;
  /**
   * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ — хяналтын инженерийн зорилт.
   */
  plannedVol: number | null;
  /** «Объём_шинэ2» — зөвхөн ХАРУУЛНА, ямар ч томъёонд ОРОХГҮЙ. */
  unit: number | null;
  money: number | null;
  act: (number | null)[]; // хадгалагдсан блок бүрийн бодит гүйцэтгэл
  /**
   * Блок бүрийн ХУРИМТЛАГДСАН обьём (`*_obyem`). Талбар байхгүй бол `null`.
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
   * ГЭРЭЭНИЙ огноо — блок бүрд, ms epoch (2026-09-11).
   */
  gStart: (number | null)[];
  gEnd: (number | null)[];
  /**
   * БОДИТ огноо — блок бүрд, ms epoch (2026-09-23, `F…_bodit_ehleh` /
   * `…_bodit_duusah`).
   */
  aStart: (number | null)[];
  aEnd: (number | null)[];
  /**
   * ХҮН ХҮЧ · МАШИН МЕХАНИЗМ — мөрийн нөөцийн тоо (2026-09-23, Integer).
   */
  hun: number | null;
  mashin: number | null;
};

/**
 * ҮЙЛЧИЛГЭЭНИЙ УТГА → тоо (эсвэл `null`).
 */
export const numLoose = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    // мянгатын таслал ба (тасрахгүй) зай — ЗӨВХӨН цэвэр тоон мөрөнд
    const raw = /^-?[\d\s,\u00a0]*\d(\.\d+)?$/.test(t) ? t.replace(/[\s,\u00a0]/g, "") : t;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const num = numLoose;

/** `YYYY-MM-DD` → ArcGIS-ийн `timestamp` шүүлт (тухайн ӨДРИЙГ бүхэлд нь). 2026-10-09: экспорт — `hyanaltStore` (R2). */
export const dayFilter = (fld: string, day: string) =>
  `${fld} BETWEEN timestamp '${day} 00:00:00' AND timestamp '${day} 23:59:59'`;

/**
 * Хуудсан дээр ажиллах мөрүүд — СҮҮЛИЙН АГШНЫХ нь.
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
 */
export function lastFrame(
  all: Feature[],
  noField: string,
  expect = 0,
  workField?: string,
): Feature[] {
  if (all.length < 2) return all;
  const first = String(all[0].attributes[noField] ?? "").trim();
  if (!first) return all;

  const starts: number[] = [0];
  for (let i = 1; i < all.length; i += 1) {
    if (String(all[i].attributes[noField] ?? "").trim() === first) starts.push(i);
  }
  if (starts.length === 1) return all;

  const endOf = (k: number) => (k + 1 < starts.length ? starts[k + 1] : all.length);
  const lenOf = frameLenOf(all, starts, endOf, noField, workField);
  const need = fullLen(starts.length, lenOf, expect);

  /* Сүүлийн жаазаас ухарч ЭХНИЙ бүтэн жаазыг ол */
  let k = starts.length - 1;
  while (k > 0) {
    const len = lenOf(k);
    /* Өмнөхөөсөө богино = тасарсан; зураглалаас богино нь ч мөн адил */
    if (len >= lenOf(k - 1) && (need <= 0 || len >= need)) break;
    console.warn(
      `[selbe] хагас бичигдсэн жаазыг алгаслаа: ${len} мөр `
      + `(өмнөх ${lenOf(k - 1)}, хүлээгдэх ${need || '?'}) — унасан нийтлэлийн үлдэгдэл`,
    );
    k -= 1;
  }
  return all.slice(starts[k], k + 1 < starts.length ? starts[k + 1] : undefined);
}

/**
 * «БҮТЭН» ЖААЗНЫ ШААРДАХ УРТ — зураглал ба АЖИГЛАГДСАН хамгийн урт жаазны бага нь.
 */
/**
 * ЖААЗ БҮРИЙН ЖИШИХ УРТ — `workField` өгвөл № ба Ажил хоёул хоосон мөрийг ХАСНА (2026-10-09, F5;
 * `lastFrame`-ийн `workField`), эс бөгөөс түүхий урт.
 */
function frameLenOf(
  all: Feature[],
  starts: number[],
  endOf: (k: number) => number,
  noField: string,
  workField?: string,
): (k: number) => number {
  if (!workField) return (k) => endOf(k) - starts[k];
  const eff = starts.map((s, k) => {
    let n = 0;
    for (let i = s; i < endOf(k); i += 1) if (!isBlankAttrs(all[i].attributes, noField, workField)) n += 1;
    return n;
  });
  return (k) => eff[k];
}

/** № ба Ажил хоёул хоосон мөр үү (`loadRows` ийм мөрийг алгасдаг) */
export const isBlankAttrs = (a: Record<string, unknown>, noField: string, workField: string): boolean =>
  !String(a[noField] ?? "").trim() && !String(a[workField] ?? "").trim();

function fullLen(n: number, lenOf: (k: number) => number, expect: number): number {
  if (expect <= 0) return 0;
  let longest = 0;
  for (let k = 0; k < n; k += 1) longest = Math.max(longest, lenOf(k));
  return Math.min(expect, longest);
}

/**
 * ХУУЛБАРЫН ХАМГИЙН АНХНЫ БҮТЭН ЖААЗ — ЗӨВХӨН лавлахад (2026-09-07).
 */
export function firstFrame(
  all: Feature[],
  noField: string,
  expect = 0,
  workField?: string,
): Feature[] {
  if (all.length < 2) return all;
  const first = String(all[0].attributes[noField] ?? "").trim();
  if (!first) return all;

  const starts: number[] = [0];
  for (let i = 1; i < all.length; i += 1) {
    if (String(all[i].attributes[noField] ?? "").trim() === first) starts.push(i);
  }
  if (starts.length === 1) return all;

  const endOf = (k: number) => (k + 1 < starts.length ? starts[k + 1] : all.length);
  const lenOf = frameLenOf(all, starts, endOf, noField, workField);
  const need = fullLen(starts.length, lenOf, expect);

  /* Эхнээс урагшаа — ЭХНИЙ бүтэн (зураглалын урттай) жааз */
  let k = 0;
  while (k < starts.length - 1) {
    if (need <= 0 || lenOf(k) >= need) break;
    console.warn(
      `[selbe] лавлах: хагас эхний жаазыг алгаслаа: ${lenOf(k)} мөр `
      + `(хүлээгдэх ${need}) — унасан нийтлэлийн үлдэгдэл`,
    );
    k += 1;
  }
  return all.slice(starts[k], endOf(k));
}

/**
 * ДУУССАН (араас нь дараагийн жааз эхэлсэн) жаазуудын аль нэг нь `want`-аас богиногүй юу —
 * `loadBaseKeys`-ийн эрт зогсолтын нөхцөл (2026-10-04). Жааз таних дүрэм `firstFrame`-тэй ИЖИЛ
 * (эхний мөрийн №); эхний № хоосон бол `firstFrame` БҮХ мөрийг буцаадаг тул `false` (бүтнээр уншина).
 */
export function firstDoneFrameAtLeast(all: Feature[], noField: string, want: number): boolean {
  if (all.length < 2 || want <= 0) return false;
  const first = String(all[0].attributes[noField] ?? "").trim();
  if (!first) return false;
  let start = 0;
  for (let i = 1; i < all.length; i += 1) {
    if (String(all[i].attributes[noField] ?? "").trim() !== first) continue;
    if (i - start >= want) return true;
    start = i;
  }
  return false;
}

/** Мөрийн ТАНИХ ТҮЛХҮҮР — № ба Ажлын нэрийн хос. */
function rowKey(f: Feature, sc: Schema): string {
  const no = String(f.attributes[sc.f.no] ?? "").trim();
  const work = String(f.attributes[sc.f.work] ?? "").trim();
  return `${no} ¦ ${work}`;
}

/**
 * СУУРЬ АГШНЫ МӨРИЙН ТҮЛХҮҮРҮҮД (бөглөөгүй анхны хуулбар).
 */
const baseKeyCache = new Map<string, Promise<Feature[]>>();
function baseFetch(pkg: Pkg, sc: Schema, kind: "null" | "all", want: number, rootNo = ""): Promise<Feature[]> {
  const ck = kind === "all" ? `${pkg.key}|all|${rootNo}` : `${pkg.key}|${kind}`;
  const hit = baseKeyCache.get(ck);
  if (hit) return hit;
  const fld = sc.f.fillDate;
  const p = (async () => {
    const out: Feature[] = [];
    for (let offset = 0; ; ) {
      const j = await agsFetch(`${pkg.url}/query`, {
        where: kind === "null" && fld ? `${fld} IS NULL` : "1=1",
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
      if (kind === "all" && want > 0) {
        const i0 = rootNo ? out.findIndex((f) => String(f.attributes[sc.f.no] ?? "").trim() === rootNo) : 0;
        if (i0 >= 0 && firstDoneFrameAtLeast(i0 > 0 ? out.slice(i0) : out, sc.f.no, want)) break;
      }
    }
    return out;
  })();
  baseKeyCache.set(ck, p);
  p.catch(() => { if (baseKeyCache.get(ck) === p) baseKeyCache.delete(ck); });
  return p;
}

/**
 * @param rootNo ОДООГИЙН жаазны эхний мөрийн № — жааз бүр ЯГ энэ мөрөөр эхэлдэг (мөр зөвхөн
 *   бүлэг ДОТОР нэмэгддэг). 2026-10-09 (F3): огноогүй хэлтэрхий («Багц 3.3»-ийн 221 мөр, эхний
 *   № «3») эсвэл бүх мөрийн эхэнд үлдсэн хог хэсэг лавлах болохоос сэргийлнэ. Хоосон бол хуучин
 *   зан төлөв.
 */
async function loadBaseKeys(pkg: Pkg, sc: Schema, rootNo = ""): Promise<string[]> {
  const fld = sc.f.fillDate;
  const noOf = (f: Feature) => String(f.attributes[sc.f.no] ?? "").trim();
  const want = TREES[pkg.key]?.length ?? 0;
  const out = await baseFetch(pkg, sc, "null", want);
  /**
   * Суурь агшин ч ДАВХАРДАЖ болно: `Bagts_1_9f`-ийн суурьт 2,740 мөр =
   * 2 × 1,370 (амьдаар хэмжсэн). Урьд нь энд `expect`-гүй дуудагддаг байсан
   * тул зөвхөн уртын харьцаагаар шийддэг байв — суурьт ХАГАС хуулбар
   * (жиш. [1370, 800]) үүсвэл эсвэл [800, 1370] дарааллаар бичигдвэл лавлах
   * нь зураглалаас богино гарч, `ref.length === expect` унаж, хуудас
   * «шатлалын зураглалыг дахин гаргах шаардлагатай» гэсэн БУРУУ шалтгаантай
   * хатуу алдаагаар хаагдана. `expect`-ийг дамжуулбал `lastFrame` дутуу
   * хуулбарыг алгасаад БҮТЭН лавлахыг буцаана.
   */
  /**
   * Лавлахыг `buglusun_ognoo IS NULL` гэж хайдаг — өөрөөр хэлбэл АНХНЫ,
   * хэзээ ч нийтлэгдээгүй хуулбар. Хуучин агшнуудыг цэвэрлэхэд тэр
   * хуулбар устаж, энэ асуулга ХООСОН буцаах болов: «Багц 3.1» дээр
   * лавлах 0 мөр гарч, зэрэгцүүлэлт бүтэлгүйтэн багц бүхэлдээ нээгдэхээ
   * больсон.
   *
   * Огноогүй хуулбар байхгүй бол лавлахыг БҮХ мөрөөс гаргана — `lastFrame`
   * нь ижил дүрмээр хамгийн сүүлийн БҮТЭН жаазыг таслах тул үр дүн нь
   * өмнөхтэй ижил утгатай.
   */
  /**
   * Урьд нь энд ч `lastFrame` дуудагдаж СҮҮЛИЙН жаазыг лавлах болгодог
   * байв. Тэр нь суурь жааз БАЙХАД зөв — гэвч суурь устсан үед лавлах нь
   * ӨӨРӨӨ одоогийн жааз болно. Төлөвлөлтийн ахлах инженер бүлэг дотор ажил НЭМЭХЭД
   * (`addRow`) шинэ жааз 1 мөр урт бичигдэх бөгөөд дараагийн ачаалалтад:
   *   ref.length (1371) !== expect (1370)  → `alignInsertions` дуудагдахгүй
   *   нөхөлт нь `expect > feats2.length` шаарддаг тул мөн ажиллахгүй
   *   → `throw` → тэр багцын Гүйцэтгэл бөглөх, Хуваарь, хянагчийн
   *     харагдац, CEO/QAQC мод БҮГД хаагдана. Алдааны бичвэр нь
   *     «зураглалыг дахин гаргах» гэсэн БУРУУ шалтгаан заана.
   *
   * Амьдаар (2026-09-07): 10 багцын 7-д `buglusun_ognoo IS NULL` = 0 тул
   * бүгд энэ замд байсан — өөрөөр хэлбэл «мөр нэмэх» функц ямар ч багцад
   * аюулгүй ажиллахгүй байв.
   *
   * ЗАСВАР: мөр зөвхөн НЭМЭГДДЭГ (архивын жааз дараалан урт болно) тул
   * ХАМГИЙН АНХНЫ жааз нь устсан суурьтай тэнцүү. Тиймээс нөөц замд
   * `lastFrame` БИШ `firstFrame` хэрэглэнэ.
   */
  /**
   * Нийтлэл мөрүүдээ бичээд ДАРАА нь огноог тамгалдаг тул хоёр дахь шат
   * тасрахад ОДООГИЙН жаазны нэг ХЭСЭГ огноогүй үлдэнэ — «Багц 3.3»-д
   * 1,459 мөрийн 221 нь (жаазын ДУНД, OID 6960…7180) яг тийм болов.
   * `latestWhere` тэр нөхцлийг ЗӨВӨӨР таньж `((day) OR fill IS NULL)` гэж
   * нэгтгэдэг атлаа энэ функц ЯГ ИЖИЛ `fld IS NULL` асуулгыг «суурь агшин»
   * гэж уншиж, 221 мөрийн хэлтэрхийг лавлах болгож байв. Тэр хэлтэрхийн
   * эхний № нь «3», дотор нь «3» 12 удаа давтагддаг тул `lastFrame` түүнийг
   * 12 «жааз» гэж хувааж ердөө 4 МӨР буцаана. Дараа нь тэр багцад мөр
   * нэмэнгүүт `ref.length` (4) нь `expect`-тэй ч, `feats2.length`-тэй ч
   * тэнцэхгүй тул зэрэгцүүлэлт бүтэлгүйтэж, багц бүхэлдээ БУРУУ шалтгаантай
   * («зураглалыг дахин гаргах») хатуу алдаагаар хаагдана — кэшэнд суусан
   * тул дахин ачаалахад ч сэргэхгүй.
   *
   * ЗАСВАР: огноогүй мөр нь зураглалын уртаас МЭДЭГДЭХҮЙЦ БОГИНО бол тэр
   * нь суурь БИШ, жаазын үлдэгдэл — нөөц зам (БҮХ мөр + `firstFrame`)-аар
   * явна. Суурь жааз нь тодорхойлолтоороо БҮТЭН хуулбар тул `want`-аас
   * богино байх ёсгүй (давхардсан суурь нь ҮРЖВЭР — 2×1,370 г.м.).
   */
  const garbageHead = !!rootNo && out.length > 0 && noOf(out[0]) !== rootNo;
  let usedFallback = false;
  let src = out;
  if ((out.length === 0 || (want > 0 && out.length < want) || garbageHead) && fld) {
    if (out.length > 0) {
      console.warn(
        `[selbe] ${pkg.key}: огноогүй ${out.length} мөр нь суурь жааз биш `
        + `(хүлээгдэх ${want}, эхний № «${noOf(out[0])}»/«${rootNo || '?'}») — `
        + 'жаазын үлдэгдэл гэж үзэж бүх мөрөөс лавлах гаргана',
      );
    }
    usedFallback = true;
    const all = await baseFetch(pkg, sc, "all", want, rootNo);
    const i0 = rootNo ? all.findIndex((f) => noOf(f) === rootNo) : 0;
    src = i0 > 0 ? all.slice(i0) : all;
  }
  const ref = usedFallback
    ? firstFrame(src, sc.f.no, want, sc.f.work)
    : lastFrame(src, sc.f.no, want, sc.f.work);
  return ref.map((f) => rowKey(f, sc));
}

/**
 * ХООСОН МӨРИЙН ТҮЛХҮҮР ҮҮ — «№ ¦ Ажил» хоёулаа хоосон.
 */
const isBlankKey = (k: string) => k.split("¦").every((x) => x.trim() === "");

/**
 * ЗЭРЭГЦҮҮЛЭЛТ — одоогийн мөрүүдийг лавлах дараалалтай тулгана.
 *
 * Буцаах нь `cur`-тай ижил урттай массив: лавлахад ТААРСАН мөрд лавлахын
 * индекс, ШИНЭЭР НЭМЭГДСЭН мөрд `-1`.
 */
export function alignInsertions(cur: string[], ref: string[]): number[] | null {
  const map = new Array<number>(cur.length).fill(-1);
  let j = 0;
  for (let i = 0; i < cur.length; i += 1) {
    /* Таарахгүй байгаа ХООСОН лавлах мөрүүдийг алгасна (дунд ч, сүүл ч). */
    while (j < ref.length && ref[j] !== cur[i] && isBlankKey(ref[j])) j += 1;
    if (j < ref.length && cur[i] === ref[j]) {
      map[i] = j;
      j += 1;
    }
  }
  /* Лавлахын ҮЛДСЭН мөрүүд ЗӨВХӨН хоосон байж болно. */
  while (j < ref.length && isBlankKey(ref[j])) j += 1;
  return j === ref.length ? map : null;
}

/** Зураглалын тэмдэгт → гүн (`"0".."4"` ажил, `"A".."E"` бүлэг). */
const treeCharDepth = (tree: string, i: number): number => {
  const ch = tree[i] ?? "0";
  return ch >= "A" && ch <= "E" ? ch.charCodeAt(0) - 65 : Number(ch);
};

/**
 * ЗЭРЭГЦҮҮЛЭЛТЭЭС (`alignInsertions`) МӨР БҮРИЙН ГҮН — `map` `null` бол байрлалаар.
 */
export function depthsFromMap(map: number[] | null, n: number, tree: string): number[] {
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const j = map ? map[i] : i;
    if (j >= 0) out[i] = treeCharDepth(tree, j);
    else if (i === 0) out[i] = 0;
    else {
      const pj = map ? map[i - 1] : i - 1;
      const prevIsGroup = pj >= 0 && treeCharDepth(tree, pj + 1) > treeCharDepth(tree, pj);
      out[i] = prevIsGroup ? treeCharDepth(tree, pj) + 1 : out[i - 1];
    }
  }
  return out;
}

/**
 * ЗЭРЭГЦҮҮЛЭЛТ ЗУРАГЛАЛТАЙ НИЙЦЭХ ҮҮ — лавлахын урт зураглалаас зөрсөн үед л (2026-10-09, F3).
 */
export function treeMapOk(map: number[], tree: string): boolean {
  const d = depthsFromMap(map, map.length, tree);
  if (!d.length || d[0] !== 0) return false;
  for (let i = 0; i < d.length; i += 1) {
    if (!Number.isFinite(d[i])) return false;
    if (i > 0 && d[i] > d[i - 1] + 1) return false;
    const j = map[i];
    if (j >= tree.length) return false;
    if (j >= 0 && i + 1 < d.length) {
      const ch = tree[j];
      const isGroup = ch >= "A" && ch <= "E";
      if (isGroup !== (d[i + 1] > d[i])) return false;
    }
  }
  return true;
}

/**
 * ОГНООГҮЙ ХЭЛТЭРХИЙГ ӨДРИЙН ЖААЗАНД НЭГТГЭХ ҮҮ — `latestWhere` ба `hyanaltDetail.loadArchived`-ийн
 * НЭГ дүрэм (хоёр газар ЗААВАЛ ижил байх ёстой).
 */
export const NULL_MERGE_SLACK = 2;
export function nullFragmentFits(nDay: number, nNull: number, expect: number, blank = 0): boolean {
  if (expect <= 0 || nDay <= 0 || nNull <= 0 || nDay >= expect) return false;
  const lo = expect - Math.max(0, Math.min(blank, expect));
  return nDay + nNull >= lo && nNull <= expect - nDay + NULL_MERGE_SLACK;
}

/**
 * СУУРЬ ЛАВЛАХЫН ХООСОН МӨРИЙН ТОО (№ ба Ажил хоёул хоосон) — `nullFragmentFits`-ийн `blank`
 * (2026-10-09, F3). Лавлах кэшлэгддэг (`baseKeyCache`). Татагдахгүй бол 0 — хуучин (хатуу) доод хязгаар.
 */
export async function baseBlankCount(pkg: Pkg, sc: Schema): Promise<number> {
  try {
    return (await loadBaseKeys(pkg, sc)).filter(isBlankKey).length;
  } catch {
    return 0;
  }
}

async function latestWhere(
  pkg: Pkg,
  sc: Schema,
  expect = 0,
  knownMax?: number | null,
): Promise<string> {
  const fld = sc.f.fillDate;
  if (!fld) return "1=1"; // талбар үүсээгүй үйлчилгээ — хуучин зан төлөв
  const mx = knownMax !== undefined ? knownMax : (await agsFetch(`${pkg.url}/query`, {
    where: `${fld} IS NOT NULL`,
    outStatistics: JSON.stringify([
      { statisticType: "max", onStatisticField: fld, outStatisticFieldName: "mx" },
    ]),
    returnGeometry: "false",
  })).features?.[0]?.attributes?.mx as number | null | undefined;
  if (mx == null) return `${fld} IS NULL`;
  const day = dayFilter(fld, msToDay(mx));

  /**
   * Нийтлэл нь мөрүүдээ бичээд ДАРАА нь огноог нь тамгалдаг. Тэр хоёр дахь
   * шат тасарвал жаазын нэг хэсэг нь огноогүй үлдэнэ — «Багц 3.3»-д яг тийм
   * болсон: 1,238 мөрд огноо бичигдсэн, 221-д үгүй, гэвч OID-ууд нь хоорондоо
   * СҮЛЖИЛДСЭН (6960…7180 нь 6914…8372-ын дунд) бөгөөд `Des_dugaar` нь
   * 1…1,459 ТАСАЛДАЛГҮЙ — өөрөөр хэлбэл НЭГ жааз.
   *
   * Өдрөөр л шүүвэл тэр 221 мөр унаж, хуудас «1,238 мөр ирлээ, 1,459 байх
   * ёстой» гэж хаагдана.
   */
  if (expect > 0) {
    const cnt = async (where: string): Promise<number> => {
      const r = await agsFetch(`${pkg.url}/query`, {
        where, returnCountOnly: "true", returnGeometry: "false",
      });
      return Number(r.count ?? 0);
    };
    const nDay = await cnt(day);
    if (nDay > 0 && nDay < expect) {
      const nNull = await cnt(`${fld} IS NULL`);
      if (nullFragmentFits(nDay, nNull, expect, await baseBlankCount(pkg, sc))) return `((${day}) OR ${fld} IS NULL)`;
    }
  }
  return day;
}

/**
 * ӨМНӨХ ӨДРИЙН СҮҮЛИЙН БҮТЭН ЖААЗНЫ УРТ (№ ба Ажил хоёул хоосон мөрийг ХАССАН) — `loadRows`-ийн F4
 * шалгалтад (2026-10-09). Одоогийн жаазны хамгийн их `fillDate`-ийн ӨДРӨӨС өмнөх хамгийн сүүлийн
 * өдрийг олж, `lastFrame`-ийн ижил дүрмээр таслана. Өмнөх өдөр байхгүй бол `null`. Алдааг ШИДНЭ.
 */
/**
 * ӨМНӨХ БӨГЛӨСӨН ӨДӨР (`YYYY-MM-DD`) — одоогийн жаазны хамгийн их `fillDate`-ийн өдрөөс ӨМНӨХ хамгийн сүүлийн
 * өдөр; байхгүй бол `null`. `prevFrameLen` ба `loadRows`-ийн тасарсан жаазны нөөц зам (2026-10-11) хоёул хэрэглэнэ.
 * Алдааг ШИДНЭ.
 */
async function prevFillDay(pkg: Pkg, sc: Schema, cur: Feature[]): Promise<string | null> {
  const fld = sc.f.fillDate;
  if (!fld) return null;
  let mx: number | null = null;
  for (const f of cur) {
    const v = num(f.attributes[fld]);
    if (v != null && (mx == null || v > mx)) mx = v;
  }
  if (mx == null) return null;
  const j = await agsFetch(`${pkg.url}/query`, {
    where: `${fld} < timestamp '${msToDay(mx)} 00:00:00'`,
    outStatistics: JSON.stringify([{ statisticType: "max", onStatisticField: fld, outStatisticFieldName: "mx" }]),
    returnGeometry: "false",
  });
  const pm = j.features?.[0]?.attributes?.mx as number | null | undefined;
  return pm == null ? null : msToDay(pm);
}

async function prevFrameLen(pkg: Pkg, sc: Schema, cur: Feature[], expect: number): Promise<number | null> {
  const fld = sc.f.fillDate;
  if (!fld) return null;
  const pm = await prevFillDay(pkg, sc, cur);
  if (pm == null) return null;
  const out: Feature[] = [];
  for (let offset = 0; ; ) {
    const p = await agsFetch(`${pkg.url}/query`, {
      where: dayFilter(fld, pm),
      outFields: [sc.f.oid, sc.f.no, sc.f.work].join(","),
      returnGeometry: "false",
      orderByFields: `${sc.f.oid} ASC`,
      resultRecordCount: "2000",
      resultOffset: String(offset),
    });
    const fs = (p.features || []) as Feature[];
    out.push(...fs);
    if (!p.exceededTransferLimit || fs.length === 0) break;
    offset += fs.length;
  }
  if (!out.length) return null;
  return lastFrame(out, sc.f.no, expect, sc.f.work)
    .filter((f) => !isBlankAttrs(f.attributes, sc.f.no, sc.f.work)).length;
}

/** Нэг `where`-ийн бүх мөр — maxRecordCount 2000 тул `oid ASC`-ээр хуудаслана (`loadRows`-ийн татлага) */
async function fetchFrame(pkg: Pkg, sc: Schema, where: string, fields?: string[]): Promise<Feature[]> {
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
  return feats;
}

/**
 * ХУУДАСНЫ ШИНЭЛЭГ БАЙДЛЫН ТАНДАЛТ — НЭГ `outStatistics` (`sheetCache.probeStats`): мөрийн тоо · objectid-ийн муж ·
 * сүүлийн засварын огноо · бөглөсөн огнооны max (2026-10-22, `loadRows`-ийн `persist`).
 */
async function probeSheet(pkg: Pkg, sc: Schema): Promise<Sig | null> {
  const j = await agsFetch(`${pkg.url}/query`, {
    where: "1=1",
    outStatistics: probeStats(sc.f.oid, sc.f.fillDate),
    returnGeometry: "false",
  });
  return sigFrom(j.features?.[0]?.attributes, !!sc.f.fillDate);
}

/** Багцын бүх мөрийг татна — maxRecordCount 2000 тул хуудаслая. */
export async function loadRows(
  pkg: Pkg,
  sc: Schema,
  /**
   * Тодорхой АГШНЫГ (`YYYY-MM-DD`) татах — хяналтын харагдацад.
   */
  atDay?: string,
  /**
   * Татах талбаруудын жагсаалт — өгвөл `outFields`-ийг хязгаарлана.
   */
  fields?: string[],
  opts?: { strict?: boolean; persist?: boolean },
): Promise<{
  rows: SheetRow[];
  asOf: number | null;
  snapshot: number | null;
  /**
   * ЭНЭ ЖААЗАД АГУУЛАГДАХ ЁСТОЙ МӨРИЙН ТОО — архивт бичихийн өмнөх ЛАВЛАХ.
   */
  frameLen: number;
  rawFrameLen: number;
  truncated?: { day: string; rows: number; need: number; shownDay: string };
}> {
  const tree = TREES[pkg.key] ?? "";
  if (tree.length > 0 && !fields?.length) loadBaseKeys(pkg, sc).catch(() => {});
  const persist = !!opts?.persist && !atDay && !opts?.strict && !!fields?.length;
  const { where, feats } = persist
    ? await persistedFrame(`${pkg.url}|${tree.length}`, fields, () => probeSheet(pkg, sc), async (sig) => {
      const w = await latestWhere(pkg, sc, tree.length, sig ? sig.mx : undefined);
      return { where: w, feats: await fetchFrame(pkg, sc, w, fields) };
    })
    : await (async () => {
      const w =
        atDay && sc.f.fillDate
          ? dayFilter(sc.f.fillDate, atDay)
          : await latestWhere(pkg, sc, tree.length);
      return { where: w, feats: await fetchFrame(pkg, sc, w, fields) };
    })();
  if (sc.f.fillDate && where === `${sc.f.fillDate} IS NULL`
    && (!fields?.length || [sc.f.oid, sc.f.no, sc.f.work].every((f) => fields.includes(f)))
    && !baseKeyCache.has(`${pkg.key}|null`)) {
    baseKeyCache.set(`${pkg.key}|null`, Promise.resolve(feats));
  }

  /**
   *    Устгал хийхгүй — хуучин давхардал үйлчилгээнд үлдэнэ, гэхдээ
   *    хуудсанд огт нөлөөлөхгүй бөгөөд огноогоор шүүхэд түүх бүтэн хэвээр.
   */
  const expect = tree.length;

  /*
   * `latestWhere` нь ӨДРӨӨР шүүдэг тул нэг өдөрт хоёр удаа нийтэлбэл хоёр
   * бүтэн хуулбар зэрэг ирнэ (Багц 1-ийн 2026-08-21-нд яг тийм тохиолдсон).
   */
  const hasWork = !fields?.length || fields.includes(sc.f.work);
  const feats2 = lastFrame(feats, sc.f.no, expect, hasWork ? sc.f.work : undefined);

  /**
   * ШАТЛАЛ ХААНААС ГАРАХ ВЭ.
   *
   * 1. `gun` багана — мөр бүр өөрийн гүнээ АВЧ ЯВНА. Мөрийн тоо чөлөөтэй.
   * 2. Эс бөгөөс `TREES` — БАЙРЛАЛААР. Мөрийн тоо ТОГТМОЛ байх ёстой.
   */
  const hasGun =
    !!sc.f.gun && feats2.length > 0 && feats2.every((f) => f.attributes[sc.f.gun!] != null);

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
   */
  const treeDepth = (i: number): number => {
    const ch = tree[i] ?? '0';
    return ch >= 'A' && ch <= 'E' ? ch.charCodeAt(0) - 65 : Number(ch);
  };
  const rootNo = String(feats2[0]?.attributes[sc.f.no] ?? "").trim();
  let depthArr = new Array<number>(feats2.length).fill(0);
  if (hasGun) {
    for (let i = 0; i < feats2.length; i += 1) {
      depthArr[i] = Number(feats2[i].attributes[sc.f.gun!]) || 0;
    }
    const fallbackPrevDay = async (got: number, need: number) => {
      if (opts?.strict || atDay || !sc.f.fillDate) return null;
      let prev: string | null = null;
      try { prev = await prevFillDay(pkg, sc, feats2); } catch { return null; }
      if (!prev) return null;
      const curDay = (() => { let mx: number | null = null; for (const f of feats2) { const v = num(f.attributes[sc.f.fillDate!]); if (v != null && (mx == null || v > mx)) mx = v; } return mx == null ? '' : msToDay(mx); })();
      console.warn(`[selbe] ${pkg.key}: ${curDay}-ны жааз тасарсан (${got} мөр, ${need} байх ёстой) — өмнөх өдрийн (${prev}) бүтэн агшныг харуулна`);
      const r = await loadRows(pkg, sc, prev, fields, opts);
      return { ...r, truncated: { day: curDay, rows: got, need, shownDay: prev } };
    };
    if (expect > 0 && feats2.length < expect) {
      let need = 0;
      try {
        const ref = await loadBaseKeys(pkg, sc, rootNo);
        need = ref.filter((k) => !isBlankKey(k)).length;
      } catch (e) {
        if (opts?.strict)
          throw new Error(tr('{0}: жаазны бүтэн эсэхийг шалгах лавлах татагдсангүй — юу ч бичсэнгүй, дахин оролдоно уу ({1})', pkg.label, String((e as Error)?.message ?? e)));
        console.warn(`[selbe] ${pkg.key}: лавлах татагдсангүй — жаазны уртыг шалгасангүй`, e);
      }
      if (feats2.length < need) {
        const fb = await fallbackPrevDay(feats2.length, need);
        if (fb) return fb;
      }
      if (feats2.length < need)
        throw new Error(
          tr(
            '{0}: сүүлийн агшин дутуу — {1} мөр ирлээ, дор хаяж {2} байх ёстой. Нийтлэл дундаа тасарсан байж болзошгүй — дахин нийтлэх эсвэл админд хандана уу.',
            pkg.label,
            feats2.length,
            need,
          ),
        );
    }
    if (feats2.length > 0 && feats2.length % 500 === 0 && sc.f.fillDate) {
      let prevLen: number | null = null;
      try {
        prevLen = await prevFrameLen(pkg, sc, feats2, expect);
      } catch (e) {
        if (opts?.strict)
          throw new Error(tr('{0}: жаазны бүтэн эсэхийг шалгах лавлах татагдсангүй — юу ч бичсэнгүй, дахин оролдоно уу ({1})', pkg.label, String((e as Error)?.message ?? e)));
        console.warn(`[selbe] ${pkg.key}: өмнөх жааз татагдсангүй — жаазны уртыг шалгасангүй`, e);
      }
      const curLen = feats2.filter((f) => !isBlankAttrs(f.attributes, sc.f.no, sc.f.work)).length;
      if (prevLen != null && curLen < prevLen) {
        const fb = await fallbackPrevDay(curLen, prevLen);
        if (fb) return fb;
        if (opts?.strict)
          throw new Error(
            tr(
              '{0}: сүүлийн агшин дутуу — {1} мөр ирлээ, дор хаяж {2} байх ёстой. Нийтлэл дундаа тасарсан байж болзошгүй — дахин нийтлэх эсвэл админд хандана уу.',
              pkg.label,
              curLen,
              prevLen,
            ),
          );
        console.warn(`[selbe] ${pkg.key}: сүүлийн жааз ${curLen} мөр — өмнөх бүтэн жааз ${prevLen}; тасарсан нийтлэл байж болзошгүй`);
      }
    }
  } else if (expect > 0) {
    /**
     * Урьд нь энэ салбар `feats2.length !== expect` үед л ажилладаг, тэнцсэн
     * үед доорх БАЙРЛАЛЫН салбар руу шууд унадаг байв. Гэвч зураглал нь
     * нийтлэгддэггүй ХООСОН мөрийг ч тоолдог: «Багц 3.1 · 9F»-д `TREES` = 1,471
     * атлаа жааз 1,470. Төлөвлөлтийн ахлах инженер тэр багцад НЭГ мөр нэмэнгүүт
     * `feats2.length` = 1,471 болж `expect`-тэй САНАМСАРГҮЙ тэнцэнэ — тэгэхэд
     * зэрэгцүүлэлт огт дуудагдахгүй, нэмсэн мөрийн ДАРААХ бүх мөр гүнээ
     * нэгээр гулссан тэмдэгтээс авна (тооллоор 970 мөрийн 109 нь буруу гүнтэй).
     * Ямар ч алдаа шидэгдэхгүй: `computeAll`-ийн Мөнгөн дүн, хувийн жин,
     * төлөвлөгөө/гүйцэтгэлийн нэгтгэл ЧИМЭЭГҮЙ өөр салбарт наалдана.
     *
     * ЗАСВАР: тооноос ҮЛ ХАМААРАН зэрэгцүүлнэ. Лавлах нь багц тутамд НЭГ л
     * удаа татагдаж кэшлэгддэг (`baseKeyCache`) тул хэвийн ачаалалтад
     * нэмэлт нэг хүсэлт л явна.
     */
    const ref = await loadBaseKeys(pkg, sc, rootNo);
    let map = alignInsertions(feats2.map((f) => rowKey(f, sc)), ref);
    if (map && ref.length !== expect && !treeMapOk(map, tree)) {
      console.warn(
        `[selbe] ${pkg.key}: лавлах ${ref.length} ≠ зураглал ${expect} — зэрэгцүүлэлт `
        + 'зураглалтай нийцсэнгүй, хэрэглэхгүй',
      );
      map = null;
    }

    /**
     * ЯАГААД: `alignInsertions` нь зураглалын ХООСОН мөрүүдийг алгасдаг ч
     * тэдгээрийг ТАНИХЫН тулд СУУРЬ жаазны түлхүүр хэрэгтэй. «Багц 3.1»-д
     * зураглал 1,471 (сүүлийн мөр нь хоосон) атлаа нийтлэгдсэн жааз 1,470 —
     * хоосон мөр хэзээ ч архивт бичигддэггүй. Урьд нь тэр багцад ХУУЧИН
     * суурь жааз (1,471 мөр, хоосон мөртэйгээ) байсан тул зэрэгцүүлэлт
     * бүтдэг байв. Хуучин агшнуудыг цэвэрлэхэд тэр лавлах алга болж, багц
     * бүхэлдээ нээгдэхээ болив.
     *
     * НӨХӨЛТ: суурь жааз нь ОДООГИЙН жааз ӨӨРӨӨ бол (`ref.length ===
     * feats2.length`) зэрэгцүүлэх зүйл алга — мөр бүр байрандаа. Зураглал
     * УРТ байгаа нь зөвхөн нийтлэгддэггүй хоосон мөрүүдээс.
     */
    if (!map && ref.length === feats2.length && expect > feats2.length) {
      const seq = feats2.map((_, i) => treeDepth(i));
      const okTree =
        seq.length > 0
        && seq[0] === 0
        && seq.every((d, i) => Number.isFinite(d) && (i === 0 || d <= seq[i - 1] + 1));
      if (okTree) map = feats2.map((_, i) => i);
    }

    if (!map && feats2.length !== expect)
      throw new Error(
        tr(
          '{0}: {1} мөр ирлээ, {2} байх ёстой. Нэмэгдсэн мөрүүдийг суурь агшинтай тулгаж чадсангүй — эх хүснэгтийн бүтэц өөрчлөгдсөн бол шатлалын зураглалыг (bagts.trees.ts) дахин гаргах шаардлагатай.',
          pkg.label,
          feats2.length,
          expect,
        ),
      );
    if (!map) {
      console.warn(
        `[selbe] ${pkg.key}: ${feats2.length} мөр зураглалтай тэнцэж байгаа ч `
        + `суурь агшинтай зэрэгцүүлж чадсангүй (лавлах ${ref.length}) — `
        + 'шатлалыг БАЙРЛАЛААР авлаа; мөр нэмэгдсэн бол гүн гулсаж болзошгүй',
      );
    }
    depthArr = depthsFromMap(map, feats2.length, tree);
  }

  // Excel-ийн 2-р мөрийн «Шинэчлэгдсэн огноо» ($BH$2 г.м.) нь бүх төлөвлөгөөт
  // хувийн лавлах цэг. Мөр бүрт биш, зөвхөн тэнд бичигдсэн.
  let asOf: number | null = null;
  let snapshot: number | null = null;
  const rows: SheetRow[] = [];
  feats2.forEach((f, k) => {
    const a = f.attributes;
    const oid = Number(a[sc.f.oid]);
    if (asOf == null && sc.f.asOf) asOf = normDayMs(num(a[sc.f.asOf]));
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
     */
    /* «Бүлэг эсэх» нь тусдаа талбаргүй — ДАРААГИЙН мөрийн гүнээс гарна.
       Энэ дүрэм `TREES`-ийн тэмдэглэгээтэй 14801 мөр дээр ЯГ таарсан
       (`gun.check.mjs`) тул гурван эх сурвалжийн аль нь ч ижил үр дүн өгнө. */
    const depth = depthArr[k];
    const group = k + 1 < depthArr.length && depthArr[k + 1] > depth;
    rows.push({
      oid,
      no,
      /**
       * АЖЛЫН КОД — жаазан дотор давтагдахгүй 1…N.
       */
      des: sc.f.des ? num(a[sc.f.des]) : null,
      ham: sc.f.ham ? String(a[sc.f.ham] ?? "").trim() || null : null,
      work,
      depth,
      group,
      wC: num(a[sc.f.wC]),
      wD: num(a[sc.f.wD]),
      vol: num(a[sc.f.vol]),
      plannedVol: sc.f.plannedVol ? num(a[sc.f.plannedVol]) : null,
      unit: num(a[sc.f.unit]),
      money: num(a[sc.f.money]),
      act: sc.act.map((k) => num(a[k])),
      obyem: sc.obyem.map((k) => (k ? num(a[k]) : null)),
      raw: a,
      start: sc.start.map((x) => (x ? normDayMs(num(a[x])) : null)),
      end: sc.end.map((x) => (x ? normDayMs(num(a[x])) : null)),
      gStart: sc.gStart.map((x) => (x ? normDayMs(num(a[x])) : null)),
      gEnd: sc.gEnd.map((x) => (x ? normDayMs(num(a[x])) : null)),
      /* Бодит огноо · хүн хүч · машин механизм (2026-09-23) — талбаргүй бол `null` */
      aStart: sc.aStart.map((x) => (x ? normDayMs(num(a[x])) : null)),
      aEnd: sc.aEnd.map((x) => (x ? normDayMs(num(a[x])) : null)),
      hun: sc.f.hunHuch ? num(a[sc.f.hunHuch]) : null,
      mashin: sc.f.mashin ? num(a[sc.f.mashin]) : null,
    });
  });
  return { rows, asOf, snapshot, frameLen: rows.length, rawFrameLen: feats2.length };
}

// ── Томъёо ───────────────────────────────────────────────────────────────────

/**
 * Excel X3: `IF($BH$2<=AJ3,0,IF($BH$2>=AK3,1,($BH$2-AJ3)/(AK3-AJ3)))`
 * — эхлэх/дуусах огнооны хооронд шугаман интерполяци.
 * (Зарим багцын excel-д `(AO3-AL3)` гэсэн бичлэгийн алдаа бий — тэр багана
 * хуваарийг буруу мөрөөс уншдаг. Энд зөв хэлбэрээр нь бодсон.)
 */
export const planAt = (
  /**
   * Лавлах огноо. `null` = ЭНЭ ХУУДСАНД огноо ОГТ тохируулаагүй.
   */
  asOf: number | null,
  s: number | null,
  e: number | null,
): number | null => {
  if (asOf == null || s == null || e == null) return null;
  if (e < s) return null;
  return spanFrac({ start: s, end: e }, asOf);
};

/**
 * ГҮЙЦЭТГЭЛИЙГ 1-ЭЭР ТАСЛАХ — ЗӨВХӨН нэгтгэлийн зам дээр.
 */
/**
 * «100%-ИАС ИХ» ТУГИЙН БОСГО — хөвөгч цэгийн хүлцэлтэй (2026-09-30).
 */
const ACT_OVER = 1 + 1e-9;

const clamp1 = (v: number | null): number | null =>
  v == null ? null : v > 1 ? 1 : v;

/** «YYYY-MM-DD» ↔ ms (UTC — үйлчилгээний огноо UTC шөнө дунд байдаг). */
export const dayToMs = (s: string): number | null =>
  s ? Date.parse(`${s}T00:00:00Z`) : null;
export const msToDay = (ms: number | null): string =>
  ms == null ? "" : new Date(ms).toISOString().slice(0, 10);

/**
 * ХАДГАЛАГДСАН ОГНООГ UTC ШӨНӨ ДУНД РУУ ТЭГШИТГЭНЭ (хамгийн ойрын өдөр).
 */
export const normDayMs = (ms: number | null): number | null =>
  ms == null || !Number.isFinite(ms) ? null : Math.round(ms / DAY) * DAY;

/**
 * Нүдэнд бичигдсэн ОБЬЁМ — нийтлээгүй засвар байвал түүнийг, эс бөгөөс
 * үйлчилгээнд хадгалагдсаныг. Бичигдээгүй бол `null` (тэг БИШ).
 */
/**
 * НҮДНИЙ ЗАСВАРЫН УТГЫН ДҮРЭМ (2026-09-06).
 *
 * `pending`/`Draft.cells`/`SubmissionPayload.cells` бүгд `Record<string,string>`
 * тул утгын ДҮРМИЙГ өргөтгөвөл доод давхаргын сувгууд (ноорог хадгалах,
 * илгээлт, overlay, буулгалт) огт хөндөгдөхгүй — тэд зүгээр л мөр зөөнө:
 *
 *   `"12.5"`   → ОБЬЁМ (хуучин дүрэм, өөрчлөгдөөгүй)
 *   `"%50"`    → ХУВЬ (50%). Мөрийн `Обьём` байвал обьём нь `0.5 × Обьём`
 *                гэж бодогдоно; байхгүй бол обьём НЬ ХЭВЭЭР үлдэж зөвхөн
 *                хувь бичигдэнэ.
 */
const PCT = "%";

/** Засварын мөр ХУВЬ мөн үү (`%50`) */
export const isPctEdit = (v: string | undefined): boolean =>
  typeof v === "string" && v.trim().startsWith(PCT);

/** Хувийн засварын утга 0–1 бутархайгаар; засвар нь хувь БИШ бол `null` */
export const editPct = (v: string | undefined): number | null => {
  if (!isPctEdit(v)) return null;
  const t = v!.trim().slice(PCT.length).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.max(0, n) / 100 : null;
};

/**
 * Нүдний ХУВЬ — ЗӨВХӨН гараар бичсэн нь. Обьёмоос бодогдох замыг энд
 * оруулахгүй (тэр нь `computeAll`-д, мөрийн `Обьём`-той хамт).
 */
export const cellPct = (
  r: SheetRow,
  b: number,
  edits: Record<string, string> = {},
): number | null => editPct(edits[`${r.oid}:${b}`]);

export const cellObyem = (
  r: SheetRow,
  b: number,
  edits: Record<string, string> = {},
): number | null => {
  const e = edits[`${r.oid}:${b}`];
  if (e === undefined) return r.obyem[b];
  const t = e.trim();
  if (t === "") return null;
  const pct = editPct(t);
  if (pct != null) {
    return r.vol != null && r.vol > 0 ? pct * r.vol : r.obyem[b];
  }
  // Сөрөг обьём утгагүй — бичсэн ч 0-оор хаана.
  return Number.isFinite(Number(t)) ? Math.max(0, Number(t)) : r.obyem[b];
};

/* ══════════════ НЭМЭЛТИЙН (increment) ГОРИМ — 2026-09-25 ══════════════
 *
 *    `"abs"` — ХУУЧИН дүрэм (`cellObyem`/`cellPct`): бичсэн тоо нь НИЙТ-ийг
 *              ОРЛОНО. Зөвхөн горимын туггүй (2026-09-25-аас өмнөх) ноорог ба
 *              илгээлтийг уншихад л хэрэглэгдэнэ.
 *    `"inc"` — ШИНЭ дүрэм (`incCell`): бичсэн тоо нь НИЙТ дээр НЭМЭГДЭНЭ.
 */
export type CellMode = "abs" | "inc";

/**
 * НЭМЭЛТИЙН МӨР → `{ n: обьёмын нэмэлт, p: хувийн нэмэлт (0–1) }`.
 *
 * Хэлбэр: зайгаар тусгаарласан бүрэлдэхүүн — `"15"` · `"%10"` · `"15 %10"`
 * (сүүлийнх нь зөвхөн `sumInc`-ийн НИЙЛБЭР: мөрийн `Обьём`гүй ажилд обьём ба
 * хувь хоёр ТУСДАА багана тул нэг нүдэнд хоёулаа хуримтлагдаж болно).
 */
export function parseInc(v: string | undefined): { n: number; p: number } | null {
  if (typeof v !== "string") return null;
  const toks = v.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  let n = 0;
  let p = 0;
  for (const t of toks) {
    const pct = t.startsWith(PCT);
    const s = pct ? t.slice(PCT.length) : t;
    if (!pct && s.endsWith(PCT)) return null;
    const norm = normCell(s);
    if (norm == null) return null;
    const x = Number(norm);
    if (!Number.isFinite(x)) return null;
    if (pct) p += x / 100;
    else n += x;
  }
  return { n, p };
}

/** Хөвөгч цэгийн чимээг (0.1 + 0.2) арилгаж мөр болгоно — 12 ач холбогдолтой орон.
 */
const numStr = (x: number): string => {
  const s = String(parseFloat(x.toPrecision(12)));
  return /e/i.test(s) ? parseFloat(x.toPrecision(12)).toFixed(12).replace(/\.?0+$/, "") : s;
};

/** `{n, p}` → нэмэлтийн мөр (`parseInc`-ийн урвуу). Хоёулаа 0 бол `""`. */
export function fmtInc(d: { n: number; p: number }): string {
  const parts: string[] = [];
  if (d.n !== 0) parts.push(numStr(d.n));
  if (d.p !== 0) parts.push(`${PCT}${numStr(d.p * 100)}`);
  return parts.join(" ");
}

/**
 * ХОЁР НЭМЭЛТИЙГ НЭГТГЭНЭ (`mergeSubmission` — нэг өдрийн дахин илгээлт).
 */
export function sumInc(a: string | undefined, b: string | undefined): string {
  const x = parseInc(a);
  const y = parseInc(b);
  if (!x) return y ? fmtInc(y) : (b ?? "");
  if (!y) return fmtInc(x);
  return fmtInc({ n: x.n + y.n, p: x.p + y.p });
}

/** Нэмэлтийн эсрэг тэмдэгт — архивлагдсан хэсгийг хасахад (`residualAfterArchive`). */
export function negInc(a: string | undefined): string {
  const x = parseInc(a);
  return x ? fmtInc({ n: -x.n, p: -x.p }) : "";
}

/**
 * НЭМЭЛТИЙН ГОРИМЫН НЭГ НҮД — суурь (`r.obyem[b]`/`r.act[b]`) дээр нэмэлтийг
 * нэмсэн ҮР ДҮН. `null` = өөрчлөлт алга (засваргүй, `""`, тэг, хог утга).
 *
 *   · обьёмын нэмэлт `n` → `obyem = max(0, (суурь ?? 0) + n)`;
 *   · хувийн нэмэлт `p` — мөрийн `Обьём` БА обьёмын талбар байвал обьём руу
 *     (`p × Обьём`) хөрвүүлж нэмнэ; эс бөгөөс ХУВЬ дээр нэмнэ
 *     (`act = max(0, (хувь ?? 0) + p)`) — хуучин `%N` замын ижил нөөц;
 *   · `act` нь `computeAll`-ийн дүрмээр: обьёмоос бодогдох боломжтой бол
 *     `obyem ÷ Обьём`, эс бөгөөс хуучин хувь (эсвэл дээрх хувийн нэмэлт).
 */
export function incCell(
  r: SheetRow,
  b: number,
  e: string | undefined,
  hasField: boolean,
): { obyem: number | null; act: number | null; neg?: true; raw?: { obyem: number | null; act: number | null } } | null {
  const d = parseInc(e);
  if (!d || (d.n === 0 && d.p === 0)) return null;
  if (!hasField && d.p === 0) return null;
  const vol = r.vol != null && r.vol > 0 ? r.vol : null;
  const volPath = hasField && vol != null;
  const below = (total: number, base: number, inc: number): boolean =>
    total < -1e-9 * Math.max(1, Math.abs(base), Math.abs(inc));
  let neg = false;
  let ob = r.obyem[b];
  let rawOb = r.obyem[b];
  const add = d.n + (volPath ? d.p * (vol as number) : 0);
  if (add !== 0) {
    const total = (r.obyem[b] ?? 0) + add;
    if (below(total, r.obyem[b] ?? 0, add)) neg = true;
    ob = Math.max(0, total);
    rawOb = total;
  }
  const pRest = volPath ? 0 : d.p;
  let act: number | null;
  let rawAct: number | null;
  if (pRest !== 0) {
    const totalP = (r.act[b] ?? 0) + pRest;
    if (below(totalP, r.act[b] ?? 0, pRest)) neg = true;
    act = Math.max(0, totalP);
    rawAct = totalP;
  } else {
    act = volPath && ob != null ? ob / (vol as number) : r.act[b];
    rawAct = volPath && rawOb != null ? rawOb / (vol as number) : r.act[b];
  }
  return neg ? { obyem: ob, act, neg: true, raw: { obyem: rawOb, act: rawAct } } : { obyem: ob, act };
}
/**
 * БЛОКГҮЙ БАГЦЫН (синтетик блок) ОБЬЁМГҮЙ АЖЛЫН МӨР уу (2026-10-09).
 */
export const synNoVol = (
  sc: Pick<Schema, "synthetic"> | null | undefined,
  r: { group: boolean; vol?: number | null },
): boolean => !!sc?.synthetic && !r.group && !(r.vol != null && r.vol > 0);
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
  /**
   * Блок бүрийн бодит гүйцэтгэл — ТҮҮХИЙ, таслаагүй. 1-ээс их байж БОЛНО
   * (обьём ÷ мөрийн Обьём > 1). Нүдэнд ЯГ ЭНЭ утга харагдана.
   */
  act: (number | null)[];
  /**
   * ДЭЭШ НЭГТГЭХЭД хэрэглэх утга: `min(act, 1)`.
   *
   * Бүлгийн мөрд энэ нь `act`-тай тэнцүү (дэд мөрүүд нь аль хэдийн таслагдсан).
   */
  actAgg: (number | null)[];
  /**
   * Блок бүр 1-ээс ИХ гүйцэтгэлтэй эсэх — өгөгдлийн зөрүүг ил гаргах туг.
   */
  actOver: boolean[];
  /** Блок бүрийн ХУРИМТЛАГДСАН обьём (нэмэлт засвар нэмэгдсэн). Бүлэгт `null`. */
  obyem: (number | null)[];
  /**
   * Мөрийн блокуудын обьёмын НИЙЛБЭР (`obyem_sum` талбарт бичигдэнэ).
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
  /**
   * Төлөвлөгөөт гүйцэтгэл = блокуудын дундаж.
   */
  I: number | null;
  /**
   * Мөрийн бодит гүйцэтгэл = блокуудын дундаж.
   */
  J: number | null;
  K: number | null;
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
export function parentIndexes(rows: SheetRow[]): number[] {
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
 * Тооцооны дараалал чухал: H (доороос дээш) → C, D (дээрээс доош) → бодит
 * гүйцэтгэл ба J (доороос дээш) → E (C ба J-ээс хамаарна, доороос дээш).
 */
/**
 * ТӨЛӨВЛӨГӨӨТ ГҮЙЦЭТГЭЛИЙН МУРУЙ — олон огноогоор нэг дор.
 *
 * @returns огноо бүрийн МӨР бүрийн блокуудын дундаж төлөвлөгөө (0–1). Гадна
 *   талын массив нь `asOfs`-той, дотоод нь `rows`-той ижил урттай.
 */
export function planCurve(
  rows: SheetRow[],
  nBld: number,
  asOfs: readonly number[],
  /**
   * САРЫН ЗАДАРГААНААС гарах төлөвлөгөөт хувь — `computeAll`-ийн ижил
   * нэртэй параметртэй ЯГ ИЖИЛ үүрэгтэй.
   */
  planPct?: (row: SheetRow, b: number, asOf: number) => number | null | undefined,
  /**
   * ЖИНГИЙН ЭХ СУРВАЛЖ — `money` (анхдагч) эсвэл `obyem`.
   */
  weigh: 'money' | 'obyem' = 'money',
): (number | null)[][] {
  const kids = childIndexes(rows);
  const par = parentIndexes(rows);
  const n = nBld;
  const N = rows.length;

  /* ── H · C · D — `computeAll`-ийн 1–2-р алхамтай ижил ── */
  const H: (number | null)[] = new Array(N).fill(null);
  for (let i = N - 1; i >= 0; i--) {
    if (kids[i].length) {
      let s = 0; let any = false;
      for (const k of kids[i]) if (H[k] != null) { s += H[k]!; any = true; }
      H[i] = any ? s : rows[i].money;
    } else {
      const r = rows[i];
      if (weigh === 'obyem') {
        H[i] = r.plannedVol != null && r.plannedVol > 0 ? r.plannedVol
          : r.vol != null && r.vol > 0 ? r.vol : null;
      } else {
        H[i] = r.vol != null && r.unit != null ? r.vol * r.unit : r.money;
      }
    }
  }
  const D: (number | null)[] = new Array(N).fill(null);
  const rootH: (number | null)[] = new Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    const p = par[i];
    rootH[i] = p < 0 ? H[i] : rootH[p];
    D[i] = H[i] != null && rootH[i] ? H[i]! / rootH[i]! : rows[i].wD;
  }

  /* ── Огноо: өөрийн (`own`) эсвэл дэд мөрүүдийн MIN/MAX (`agg`) ── */
  const St: (number | null)[][] = [];
  const En: (number | null)[][] = [];
  const own: boolean[][] = [];
  for (let i = 0; i < N; i++) {
    St[i] = new Array(n).fill(null);
    En[i] = new Array(n).fill(null);
    own[i] = new Array(n).fill(false);
  }
  for (let i = N - 1; i >= 0; i--) {
    const r = rows[i];
    for (let b = 0; b < n; b++) {
      const os = r.start[b];
      const oe = r.end[b];
      if (os != null) St[i][b] = os;
      if (oe != null) En[i][b] = oe;
      own[i][b] = os != null && oe != null;
      if (!kids[i].length) continue;
      if (St[i][b] == null) {
        let m: number | null = null;
        for (const k of kids[i]) { const v = St[k][b]; if (v != null && (m == null || v < m)) m = v; }
        St[i][b] = m;
      }
      if (En[i][b] == null) {
        let m: number | null = null;
        for (const k of kids[i]) { const v = En[k][b]; if (v != null && (m == null || v > m)) m = v; }
        En[i][b] = m;
      }
    }
  }

  /* ── Огноо бүрд — зөвхөн `plan` нийлбэр ── */
  return asOfs.map((asOf) => {
    const plan: (number | null)[][] = new Array(N);
    const has: boolean[][] = new Array(N);
    const avgOut: (number | null)[] = new Array(N).fill(null);
    for (let i = N - 1; i >= 0; i--) {
      const p: (number | null)[] = new Array(n).fill(null);
      const h: boolean[] = new Array(n).fill(false);
      if (kids[i].length) {
        const den = kids[i].reduce((s, k) => s + (D[k] ?? 0), 0);
        for (let b = 0; b < n; b++) {
          let sp = 0; let cnt = 0; let anyKid = false;
          for (const k of kids[i]) {
            const w = den > 0 ? (D[k] ?? 0) : 1;
            if (has[k][b]) anyKid = true;
            sp += w * (plan[k][b] ?? 0);
            cnt += w;
          }
          p[b] = cnt > 0 ? sp / cnt : null;
          if (!anyKid && own[i][b] && St[i][b] != null && En[i][b] != null) {
            p[b] = planPct?.(rows[i], b, asOf) ?? planAt(asOf, St[i][b], En[i][b]);
            h[b] = p[b] != null;
          } else h[b] = anyKid;
        }
      } else {
        for (let b = 0; b < n; b++) {
          p[b] = planPct?.(rows[i], b, asOf) ?? planAt(asOf, St[i][b], En[i][b]);
          h[b] = p[b] != null;
        }
      }
      plan[i] = p;
      has[i] = h;
      /* `AVERAGE(IF(range="",0,range))` — хоосныг 0 гэж үзэн блокийн тоонд хуваана */
      avgOut[i] = p.reduce<number>((s, x) => s + (x ?? 0), 0) / n;
    }
    return avgOut;
  });
}

export function computeAll(
  rows: SheetRow[],
  nBld: number,
  /**
   * «Шинэчлэгдсэн огноо» — төлөвлөгөөт хувийн ЛАВЛАХ цэг.
   */
  asOf: number | null,
  edits: Record<string, string> = {},
  dateEdits: Record<string, string> = {},
  /**
   * Блок бүрд `*_obyem` талбар байгаа эсэх (`Schema.obyem`-ээс). Байхгүй блокт
   * обьём бичих газаргүй тул нүд ТҮГЖЭЭТЭЙ — хадгалагдсан хувь нь хэвээр
   * үлдэж, бүлгийн дундажид оролцсоор байна.
   */
  hasObyem: readonly boolean[] = [],
  /**
   * САРЫН ЗАДАРГААНААС гарах төлөвлөгөөт хувь (0–1) — байвал `planAt`-ыг
   * ОРЛОНО (2026-09-06-ны шаардлага).
   */
  planPct?: (row: SheetRow, b: number) => number | null | undefined,
  /**
   * `edits`-ийн утгын ДҮРЭМ (2026-09-25, `CellMode`). `FillNew`-ийн
   * `pending` нь `"inc"` (нэмэлт); анхдагч `"abs"` нь хуучин (орлуулах) дүрэм —
   * `edits`-гүй бусад дуудагчид огт нөлөөгүй.
   */
  cellMode: CellMode = "abs",
  /**
   * СИНТЕТИК НЭГ БЛОК (`Schema.synthetic` — блокгүй багцын бөглөх бүдүүвч, 2026-10-09).
   */
  synthetic = false,
): Calc[] {
  /** Задаргаа байвал түүгээр, эс бөгөөс огноогоор шугаман интерполяци */
  const planOf = (i: number, b: number, s: number | null, e: number | null) =>
    planPct?.(rows[i], b) ?? planAt(asOf, s, e);
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
   */
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
  const planHas: boolean[][] = new Array(N);
  for (let i = N - 1; i >= 0; i--) {
    const r = rows[i];
    const plan: (number | null)[] = new Array(n).fill(null);
    const has: boolean[] = new Array(n).fill(false);
    planHas[i] = has;
    const act: (number | null)[] = new Array(n).fill(null);
    const actAgg: (number | null)[] = new Array(n).fill(null);
    const actOver: boolean[] = new Array(n).fill(false);
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
        let anyAct = false;
        let anyKidPlan = false;
        for (const k of kids[i]) {
          if (out[k].actAgg[b] != null) anyAct = true;
          if (planHas[k][b]) anyKidPlan = true;
          const w = den > 0 ? (D[k] ?? 0) : 1;
          sp += w * (out[k].plan[b] ?? 0);
          sa += w * (out[k].actAgg[b] ?? 0);
          cnt += w;
        }
        plan[b] = cnt > 0 && asOf != null ? sp / cnt : null;
        act[b] = cnt > 0 && anyAct ? sa / cnt : null;
        /* Дэд мөрүүд нь аль хэдийн ≤1 тул дундаж нь ч ≤1 — гэхдээ шинэ зам
           нэмэгдэхэд чимээгүй давахаас сэргийлж дахин таслав. */
        actAgg[b] = clamp1(act[b]);
        if (
          !anyKidPlan &&
          startSrc[b] === "own" &&
          endSrc[b] === "own" &&
          start[b] != null &&
          end[b] != null
        ) {
          plan[b] = planOf(i, b, start[b], end[b]);
          has[b] = plan[b] != null;
        } else has[b] = anyKidPlan;
      }
    } else {
      for (let b = 0; b < n; b++) {
        // Excel `9F`-ийн T багана:
        //   `IF($R$5<=AF,0,IF($R$5>=AG,1,($R$5-AF)/(AG-AF)))`
        plan[b] = planOf(i, b, start[b], end[b]);
        has[b] = plan[b] != null;

        /* ── ГҮЙЦЭТГЭЛ ОБЬЁМООР (2026-08-20) ──────────────────────────────
         * Нүд бүр ХОЁР тусдаа тоог агуулна:
         *   обьём — бөглөсөн ХУРИМТЛАЛ (`*_obyem`). Хэрэглэгч ЭНЭ УДААГИЙН
         *           нэмэлтээ бичихэд өссөөр бичигдэнэ.
         *   хувь  — гүйцэтгэл. Мөрийн `Обьём` (хуваарь) байвал обьёмоос
         *           бодогдоно, эс бөгөөс гараар бичигдэнэ.
         *
         * Түлхүүр: `<oid>:<b>` = блокийн обьём. Мөрийн Обьём ба хувь хоёр нь
         * засагддаггүй тул түлхүүргүй. */
        const rVol = r.vol;
        const hasField = hasObyem[b] === true;

        if (cellMode === "inc") {
          const res = incCell(r, b, edits[`${r.oid}:${b}`], hasField);
          const cumI = hasField ? (res ? res.obyem : r.obyem[b]) : null;
          obyem[b] = cumI;
          act[b] = res
            ? res.act
            : cumI != null && rVol != null && rVol > 0 ? cumI / rVol : synthetic && cumI == null ? null : r.act[b];
          actOver[b] = act[b] != null && act[b]! > ACT_OVER;
          actAgg[b] = clamp1(act[b]);
          continue;
        }

        // 1) ОБЬЁМ — зөвхөн гараар бичигдсэн нь. Бодогдохгүй, таамаглахгүй.
        const cum = hasField ? cellObyem(r, b, edits) : null;
        obyem[b] = cum;

        /* 2) ХУВЬ — ГУРВАН эх сурвалж, ЭНЭ дарааллаар:
         *    a) ГАРААР бичсэн хувь (`%50`) — 2026-09-06-нд нэмэгдсэн зам.
         *       Хэрэглэгч нүдээ хувиар бөглөсөн бол тэр нь давамгайлна.
         *    b) Обьёмоос бодогдсон — `хуримтлал ÷ мөрийн Обьём` (хуучин зам).
         *    c) Хадгалагдсан хувь — хоёул боломжгүй үед хэвээр үлдэнэ.
         */
        const cleared = edits[`${r.oid}:${b}`]?.trim() === "";
        const pctEdit = cellPct(r, b, edits);
        act[b] = cleared
          ? null
          : pctEdit != null
            ? pctEdit
            : cum != null && rVol != null && rVol > 0 ? cum / rVol : synthetic && cum == null ? null : r.act[b];

        actOver[b] = act[b] != null && act[b]! > ACT_OVER;
        actAgg[b] = clamp1(act[b]);
      }
    }

    /*
     * `AVERAGE(IF(range="",0,range))` — хоосныг 0 гэж үзэн блокийн тоонд хуваана.
     *
     *    `null` нь энэ төслийн «МЭДЭЭЛЭЛГҮЙ» гэсэн тогтсон утга (CLAUDE.md:
     *    «`null` ≠ 0») — блокгүй багцад блокийн дундаж ҮНЭХЭЭР утгагүй тул
     *    яг зөв илэрхийлэл. Доорх `E`/`K` нь `null`-ыг аль хэдийн зөв
     *    зохицуулдаг (тэдгээр нь огноогүй хуудсанд ч `null` болдог).
     */
    const avg = (v: (number | null)[]): number | null =>
      (n > 0 ? v.reduce<number>((s, x) => s + (x ?? 0), 0) / n : null);
    const I = asOf == null ? null : avg(plan);
    const J = synthetic && n === 1 ? actAgg[0] : avg(actAgg);

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
        E = J == null ? null : C[i]! * J;
      }
    }

    /*
     * ОБЬЁМЫН НИЙЛБЭР — зөвхөн УТГАТАЙ блокуудыг нэмнэ.
     */
    let oSum: number | null = null;
    for (const v of obyem) if (v != null) oSum = (oSum ?? 0) + v;

    out[i] = {
      plan,
      act,
      actAgg,
      actOver,
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
      K: I == null || J == null ? null : (I === 0 ? 0 : J / I),
    };
  }
  return out;
}

/**
 * Хуулбарт ХЭЗЭЭ Ч дамжуулж болохгүй талбарууд — үйлчилгээ өөрөө оноодог.
 * ObjectID-г дамжуулбал `addFeatures` тэр дугаартай мөр рүү наалдах эсвэл
 * унах эрсдэлтэй; GlobalID/бүртгэлийн талбарууд ч мөн адил.
 */
const SERVER_FIELDS = /^(objectid|globalid|creationdate|creator|editdate|editor|created_user|created_date|last_edited_user|last_edited_date)$/i;

/**
 * АРХИВЫН ШИНЭ АГШИН — хуудсыг БҮХЭЛД нь доор нь хуулбарлаж нэмнэ.
 */
/**
 * `applyAdds`-ИЙН АЛДАА (2026-10-09). `lost === true` — ХАРИУ АЛДАГДСАН/дутуу: тэр багц серверт суусан эсэх
 * ТОДОРХОЙГҮЙ (timeout · сүлжээ · 5xx · дугааргүй хариу). Дуудагч «буцаагдсан» гэж БҮҮ тайлагна, тэмдэг/түгжээг
 * БҮҮ тайл; `written`-д ороогүй мөр архивт байж болно. `cause` — анхны алдаа (ороосон үед).
 * `lost` байхгүй/false — серверийн ТОДОРХОЙ татгалзал (`success:false` · ArcGIS `error.code`).
 */
export type AddsError = Error & { lost?: boolean; cause?: unknown };
/** `applyAdds`-ийн алдаа үр дүн тодорхойгүй эсэх (`AddsError`) — `isLostWrite`-ийг ч хамарна */
export const addsLost = (e: unknown): boolean =>
  (e as AddsError | null)?.lost === true || isLostWrite(e);

export async function applyAdds(
  pkg: Pkg,
  features: Record<string, unknown>[],
  /**
   * БИЧИГДСЭН МӨРИЙН OBJECTID-УУД — дуудагчийн массивт цуглуулна (заавал биш).
   */
  written?: number[],
): Promise<{ added: number; firstOid: number | null }> {
  let added = 0;
  let firstOid: number | null = null;
  let touched = 0;
  try {
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
      for (const r of res) {
        if (r.success === false || typeof r.objectId !== "number") continue;
        touched += 1;
        written?.push(r.objectId);
      }
      const bad = res.find((r) => r.success === false);
      if (bad) throw new Error(bad.error?.description || tr('Нэмэх амжилтгүй'));
      if (res.length !== chunk.length || res.some((r) => typeof r.objectId !== "number" || r.success !== true)) {
        const ie = new Error(tr('Серверээс {0} мөрийн хариу ирэх ёстой, {1} ирлээ', chunk.length, res.filter((r) => typeof r.objectId === "number" && r.success === true).length)) as AddsError;
        ie.lost = true;
        throw ie;
      }
      if (firstOid == null && typeof res[0]?.objectId === "number") firstOid = res[0].objectId;
      added += res.length;
    } catch (e) {
      if (isLostWrite(e)) invalidate('BAGTS_SHEET');
      const lost = (e as AddsError | null)?.lost === true || isLostWrite(e);
      if (added > 0) {
        const we = new Error(
          tr(
            '{0}/{1} мөр нэмэгдэв; үлдсэн нь амжилтгүй ({2})',
            added,
            features.length,
            String((e as Error).message || e),
          ),
          { cause: e },
        ) as AddsError;
        we.lost = lost;
        throw we;
      }
      if (lost && e && typeof e === "object") (e as AddsError).lost = true;
      throw e;
    }
  }
  } finally {
  /*
   * Урьд нь нийтэлсний дараа энэ хуудас өөрөө шинэчлэгддэг байсан ч
   * `loadBlockProgress`/`loadFinData` нар кэшээ барьдаг тул дашбоард дээрх
   * тоо ХУУЧИН хэвээр үлддэг байв — хуудсыг бүтнээр нь refresh хийж байж л
   * шинэчлэгдэнэ. Хэрэглэгч өөрийн бичсэн тоог дэлгэц дээр харахгүй бол
   * бичигдсэн эсэхэд эргэлзэж дахин дардаг — архивт давхардсан агшин үүснэ.
   */
  if (added > 0 || touched > 0) invalidate('BAGTS_SHEET');
  }
  return { added, firstOid };
}

/**
 * ХАГАС БИЧИГДСЭН ЖААЗЫГ АРХИВААС УСТГАНА.
 */
export async function applyDeletes(pkg: Pkg, oids: number[]): Promise<number> {
  const ids = oids.filter((x) => Number.isInteger(x) && x > 0);
  if (!ids.length) return 0;
  let gone = 0;
  for (let i = 0; i < ids.length; i += 500) {
    try {
      const j = await agsFetch(`${pkg.url}/applyEdits`, {
        deletes: ids.slice(i, i + 500).join(","),
        rollbackOnFailure: "false",
      });
      const res = (j.deleteResults || []) as { success?: boolean }[];
      gone += res.filter((r) => r.success === true).length;
    } catch
  }
  if (gone > 0) invalidate('BAGTS_SHEET');
  return gone;
}

/** `applyEdits` — 500-аар хуваан илгээнэ. */
export async function applyUpdates(
  pkg: Pkg,
  updates: Record<string, unknown>[],
): Promise<void> {
  let written = 0;
  try {
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    try {
      const j = await agsFetch(`${pkg.url}/applyEdits`, {
        updates: JSON.stringify(chunk.map((attributes) => ({ attributes }))),
        rollbackOnFailure: "true",
      });
      const ups = (j.updateResults || []) as { success?: boolean; error?: { description?: string } }[];
      const bad = ups.find((r) => r.success === false);
      if (bad)
        throw new Error(bad.error?.description || tr('Шинэчлэх амжилтгүй'));
      if (ups.length !== chunk.length || ups.some((r) => r.success !== true))
        throw new ArcGISError(tr('Серверээс {0} мөрийн хариу ирэх ёстой, {1} ирлээ', chunk.length, ups.filter((r) => r.success === true).length), `${pkg.url}/applyEdits`);
      written += chunk.length;
    } catch (e) {
      if (isLostWrite(e)) invalidate('BAGTS_SHEET');
      if (e && typeof e === 'object') (e as { written?: number }).written = i;
      if (i > 0)
        throw Object.assign(new Error(
          tr(
            '{0}/{1} мөр хадгалагдав; үлдсэн нь амжилтгүй ({2}) — дахин хадгалж гүйцээнэ үү',
            i,
            updates.length,
            String((e as Error).message || e),
          ),
        ), { written: i, lost: isLostWrite(e), cause: e });
      throw e;
    }
  }
  } finally {
    if (written > 0) invalidate('BAGTS_SHEET');
  }
}
