/**
 * ИЛГЭЭЛТИЙН ЖААЗЫН ЦЭВЭР ФУНКЦУУД (2026-09-04).
 *
 * `FillNew.publish` урьд нь «Нийтлэх» дармагц архивын бүтэн жаазыг өөрөө
 * угсарч `Bagts_*` (ҮНДСЭН ДАТА) руу бичдэг байв. Шинэ урсгалд ноорог →
 * ИЛГЭЭЛТ (`Selbe_Guitsetgel_Draft`, `sub|<pkgKey>`) → 4 шатны хяналт → зөвхөн
 * ерөнхий менежер БАТЛАХАД л архивт жааз нэмэгдэнэ. Тиймээс жааз угсрах,
 * ObjectID шилжүүлэх, нэмсэн мөр оруулах логик нь React-ээс САЛЖ, энд
 * ЦЭВЭР функц болж, гурван газраас (FillNew · hyanaltStore.apply ·
 * hyanaltDetail) НЭГ эх сурвалжаар дуудагдана.
 *
 * ⚠️ Энд ҮЙЛЧИЛГЭЭ РҮҮ БИЧДЭГ юу ч БАЙХГҮЙ — `applyAdds` зөвхөн
 *    `hyanaltStore.apply` (ерөнхий менежерийн зөвшөөрөл) ба
 *    `ajilApply.materializeAdds` (нэмэлт ажил батлагдмагц, 2026-09-24)
 *    дотроос дуудагдана.
 * ⚠️ Хуулж авсан бүх `⚠️` тайлбар нь эх кодтойгоо ХАМТ явна — тэдгээр нь
 *    буцаагдаж болохгүй шийдвэрүүд (гүн, огноо, жин, `null ≠ 0`).
 */
import { cellObyem, cellPct, computeAll, dayToMs, incCell, synNoVol, type SheetRow } from "./bagtsSheet";
import type { Schema } from "./bagts.pkg";
import type { NewRow, SubmissionPayload } from "@/lib/submission";
import { t as tr } from "@/lib/i18nCore";

/** Нэмсэн мөрийн төрөл — ЦОРЫН ГАНЦ эх сурвалж нь `submission.ts`. */
export type { NewRow } from "@/lib/submission";

/* ⚠️ 2026-09-22: `afterGroup`/`siblingSlot` (ах дүүгийн АРД тавих) ХАСАГДАВ — шинэ мөр
   эцгийнхээ ШУУД ДОР (`firstSlot`) ордог болсон; гүн сэргээлт `bagtsSheet`-д
   «өмнөх мөр бүлэг бол +1» дүрэмтэй тул байрлалын хязгаарлалт хэрэггүй. */
/** ЭЦГИЙН ШУУД ДОРХ байрлал — шинэ мөр эхэнд (2026-09-22). */
export const firstSlot = (_list: SheetRow[], p: number): number => p + 1;

/**
 * Нэмсэн мөрийн ЭЦЭГ БҮЛГИЙН индекс — нэр БА байрлал ХОЁУЛАНГААР; `-1` = алга.
 *
 * ⚠️ (№ + Ажлын нэр) хос нь ДАВХАРДДАГ. Багц 1 (9 давхар)-д «10 ·
 * БУСАД АЖИЛ» ба «6 · ТОНОГ ТӨХӨӨРӨМЖ» тус бүр ХОЁР удаа тааралдана
 * (блок бүрт нэг). Зөвхөн нэрээр хайвал `findIndex` эхнийхийг нь авч,
 * менежерийн нэмсэн ажил ӨӨР БЛОКИЙН бүлэгт чимээгүй очно.
 *
 * ⚠️ Харин зөвхөн байрлалаар (`parentIdx`) ч болохгүй: өмнөх нэмэлт
 * мөр дээгүүр нь орсон бол индекс гулсана, мөн эх хүснэгт өөрчлөгдөж
 * болно.
 *
 * Тиймээс нэрээр таарах БҮХ нэрийдлийг цуглуулж, дарсан байрлалд
 * ХАМГИЙН ОЙРХОНЫГ нь сонгоно — хоёр эрсдэлийг зэрэг барина.
 * (`insertAdds` ба `overlaySubmission`-ийн давхардал шалгалт хоёулаа
 * ЭНЭ НЭГ дүрмээр эцгийг олно — өөр өөр дүрмээр олбол нэг нь оруулж,
 * нөгөө нь алгасахгүй болж зөрнө.)
 */
const parentOf = (list: SheetRow[], a: NewRow): number => {
  const cands: number[] = [];
  /* ⚠️ 2026-10-09 (F6): хоёр талыг ТАЙРЧ жишнэ — `ajilApply` тайрсан мөрөөр жишдэг тул payload-ын
     сүүлийн хоосон зай энд `no-parent` болж хоёр зам зөрдөг байв. */
  const pNo = String(a.parentNo ?? "").trim();
  const pWork = String(a.parentWork ?? "").trim();
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i];
    if (r.group && String(r.no ?? "").trim() === pNo && String(r.work ?? "").trim() === pWork) cands.push(i);
  }
  if (!cands.length) return -1;                // эцэг алга
  let p = cands[0];
  for (const i of cands) {
    if (Math.abs(i - a.parentIdx) < Math.abs(p - a.parentIdx)) p = i;
  }
  return p;
};

/**
 * Нэмсэн мөрүүдийг жагсаалтад ОРУУЛСАН хувилбар (`FillNew.withAdds`-ийн
 * ЯГ ХУУЛБАР — төлөвийн оронд параметр).
 *
 * ⚠️ Энэ нь ЗУРАГДАХ ба БОДОГДОХ хоёуланд нь хэрэглэгдэнэ: `computeAll` нь
 * шинэ мөрийн Обьём×Нэгж өртгийг тооцоод дээд бүлгүүдийн Мөнгөн дүн, улмаар
 * ХУУДАС ДАХЬ БҮХ хувийн жинг дахин бодно. Тиймээс хэрэглэгч нэмэнгүүт
 * үр дүнгээ шууд харна.
 */
/**
 * ҮНДСЭН ТҮВШНИЙ НАВЧ МӨРИЙГ ТӨГСГӨЛД ЗАЛГАНА — «Улсын комисс» (2026-09-28).
 *
 * ⚠️ `insertAdds`-аас ЯЛГААТАЙ: эцэг хайхгүй, БҮЛГИЙН ДОТОР биш, хуудасны
 *    ХАМГИЙН СҮҮЛД, гүн 0. Шалтгаан: улсын комисс нь «Б. Барилга угсралт»-ын
 *    хүүхэд биш — түүний ДАРАА болдог тусдаа үе шат. Бүлэг дотор тавибал
 *    «Б.»-ийн дуусах огноо сунаж (`rollUpGroups`), «Б.»-ээс хамаарал
 *    тавих боломжгүй болно (`deps.hierRelated` өвөг–удмыг үл тоодог).
 * ⚠️ ЖИН 0 ил бичнэ: үндсэн түвшний навчны C нь `wC ?? 1` (`computeAll`)
 *    тул хоосон орхивол 1 болж `buildFrame` түүнийг бичих байв. Обьём/нэгж
 *    өртөг `null` — мөнгөн дүнгүй, багцын хувьд (зөвхөн «Б.») нөлөөгүй.
 * ⚠️ Дараагийн ачаалалтад гүн нь `gun` баганаас сэргэнэ — `buildFrame`
 *    бүх мөрд `gun` бичдэг тул энэ мөр depth 0 хэвээр үлдэнэ.
 */
export function appendRootLeaf(
  base: SheetRow[],
  row: { oid: number; no: string; work: string; ham?: string | null },
  sc: Schema,
  nBld: number,
): SheetRow[] {
  const raw: Record<string, unknown> = { [sc.f.no]: row.no, [sc.f.work]: row.work, [sc.f.vol]: null, [sc.f.unit]: null };
  if (sc.f.wC) raw[sc.f.wC] = 0;
  if (sc.f.wD) raw[sc.f.wD] = 0;
  return [...base, {
    oid: row.oid,
    no: row.no,
    des: null,
    ham: row.ham ?? null,
    work: row.work,
    depth: 0,
    group: false,
    wC: 0,
    wD: 0,
    vol: null,
    plannedVol: null,
    unit: null,
    money: null,
    act: new Array(nBld).fill(null),
    obyem: new Array(nBld).fill(null),
    start: new Array(nBld).fill(null),
    end: new Array(nBld).fill(null),
    gStart: new Array(nBld).fill(null),
    gEnd: new Array(nBld).fill(null),
    aStart: new Array(nBld).fill(null),
    aEnd: new Array(nBld).fill(null),
    hun: null,
    mashin: null,
    raw,
  }];
}

export function insertAdds(
  base: SheetRow[],
  adds: NewRow[],
  sc: Schema,
  nBld: number,
): SheetRow[] {
  /* ⚠️ `!nBld` шалгуур ХАСАГДСАН (2026-09-17): блокгүй 8 багцад `nBld = 0`
     тул нэмсэн мөр чимээгүй алга болж, нийтлэгдэхгүй байв. Доорх массивууд
     0 урттай үүсэхэд ямар ч асуудалгүй. */
  if (!adds.length || !sc) return base;
  const out = base.slice();
  /* ⚠️ ДАРААЛАЛ (2026-09-23, аудитын #18): нэг эцэгт олон мөр нэмэхэд бүгд
     `p + 1`-д орвол дараалал УРВУУ гарна (сүүлд нэмсэн нь хамгийн дээр).
     ЭНЭ дуудлагад оруулсан мөрийн oid → эцгийн oid-г санаж, дараагийн мөрийг
     ӨМНӨ нь оруулсан ах дүүгийнхээ АРД тавина — `adds` массивын дараалал
     (нэмсэн дараалал) хуудсан дээр хадгалагдана. */
  const placed = new Map<number, number>();
  for (const a of adds) {
    /*
     * ЭЦЭГ БҮЛГИЙГ ОЛОХ — нэр БА байрлал ХОЁУЛАНГААР (`parentOf`, тайлбар
     * нь тэнд).
     */
    const p = parentOf(out, a);
    if (p < 0) continue;                       // эцэг алга — мөрийг алгасна
    const parent = out[p];
    /* ⚠️ ГҮН нь дараагийн ачаалалтад ӨМНӨХ мөрөөс сэргээгддэг тул ЭНД ч
       яг түүгээр нь өгнө — эс бөгөөс нийтлэхийн өмнөх ба дараах шатлал
       ЧИМЭЭГҮЙ зөрнө. `siblingSlot` олдсон үед энэ нь `parent.depth + 1`
       болно; олдоогүй (зөвхөн хуучин ноорогт үлдсэн) мөрд ядаж дэлгэц ба
       өгөгдөл хоёр НИЙЦНЭ. */
    /* ⚠️ ЭХЭНД (2026-09-22, хэрэглэгч: «шинэ ажилбар … эхний ээлжинд оруулдаг байх»):
       шинэ мөр эцэг бүлгийнхээ ШУУД ДОР, бүх хүүхдээс ӨМНӨ орно. Урьд нь ах
       дүүгийнхээ АРД (`siblingSlot`) тавьдаг байсан шалтгаан нь дахин ачаалахад
       гүн нь ӨМНӨХ мөрөөс сэргээгддэг байсан явдал — одоо `bagtsSheet`-ийн
       сэргээлт «өмнөх мөр нь бүлэг бол +1» гэсэн дүрэмтэй (2026-09-22) тул
       эхэнд тавьсан ч гүн зөв сэргэнэ. `siblingSlot`/`afterGroup` нь
       `firstSlot`-ийн нөөц (эцэг олдсон л бол ХЭЗЭЭ Ч хэрэглэгдэхгүй). */
    let at = firstSlot(out, p);
    /* Энэ дуудлагад ИЖИЛ эцэгт оруулсан мөрүүдийг алгасна (дээрх ⚠️). */
    while (at < out.length && placed.get(out[at].oid) === parent.oid) at += 1;
    placed.set(a.oid, parent.oid);
    out.splice(at, 0, {
      oid: a.oid,
      no: a.no,
      /* ⚠️ Ажлын код нь СЕРВЕР дээр агшин бүрд 1…N-ээр дүүрдэг тул
         нийтлээгүй шинэ мөрд хараахан БАЙХГҮЙ — `null`. Энд өөрсдөө
         таамаглаж дугаар өгвөл нийтлэхэд серверийнхтэй зөрнө. */
      des: null,
      ham: null,
      work: a.work,
      /* ⚠️ ГҮН = ЭЦЭГ + 1 (2026-09-22) — эхэнд орох тул өмнөх мөр нь эцэг өөрөө. */
      depth: parent.depth + 1,
      group: false,
      // ⚠️ Жин/мөнгө ОРОХГҮЙ — `computeAll` Обьём×Нэгж өртгөөс өөрөө бодно.
      wC: null,
      wD: null,
      vol: a.vol,
      /* ⚠️ Инженерийн төлөвлөсөн обьём нь БАТЛАГДАЖ орох тул шинэ мөрд
         үргэлж `null` — «хараахан төлөвлөөгүй», 0 БИШ. */
      plannedVol: null,
      unit: a.unit,
      money: null,
      act: new Array(nBld).fill(null),
      obyem: new Array(nBld).fill(null),
      start: new Array(nBld).fill(null),
      end: new Array(nBld).fill(null),
      /* ⚠️ ГЭРЭЭНИЙ огноо — шинэ мөрд `null`. Гэрээ нь эх төсвөөс ирдэг
         тул нийтлээгүй мөрд байх ёсгүй (2026-09-11). */
      gStart: new Array(nBld).fill(null),
      gEnd: new Array(nBld).fill(null),
      /* ⚠️ Бодит огноо · хүн хүч · машин (2026-09-23) — шинэ мөрд `null`:
         бүртгэл нь «Хуваарь»-аас нийтлэгдсэн мөрд л орно. */
      aStart: new Array(nBld).fill(null),
      aEnd: new Array(nBld).fill(null),
      hun: null,
      mashin: null,
      /* Үйлчилгээнд бичигдэх ЦОРЫН ГАНЦ талбарууд — үлдсэнийг нийтлэх
         үед `computeAll`-ийн үр дүнгээр бөглөнө. */
      raw: {
        [sc.f.no]: a.no,
        [sc.f.work]: a.work,
        [sc.f.vol]: a.vol,
        [sc.f.unit]: a.unit,
      },
    });
  }
  return out;
}

/** Мөрийн ТАНИГЧ — ноорог/илгээлтийн `rowKeys` ба `buildOidMap` хоёулаа ЭНЭ хэлбэрээр. */
export const rowKeyOf = (r: Pick<SheetRow, "no" | "work">): string => `${r.no} ¦ ${r.work}`;

/**
 * ObjectID ШИЛЖИЛТИЙН ЗУРАГЛАЛ — хуучин oid → шинэ жаазны oid
 * (`FillNew.publish`-ийн `oidMap` логик).
 *
 * ⚠️ `pending` ба `pendDate` хоёул `${oid}:…` түлхүүртэй бөгөөд тэр oid нь
 *    хуудсыг НЭЭХ (эсвэл илгээх) үеийн ObjectID. Архивт жааз нэмэгдэх бүрд
 *    хуудас БҮХЭЛДЭЭ шинэ мөр болж нэмэгддэг тул шинэ жааз огт ӨӨР ObjectID
 *    мужид шилжинэ (жаазууд огтлолцдоггүй).
 *
 * ⚠️ Урьд нь тэр үед нэг ч түлхүүр таарахгүй болж БҮХ засвар чимээгүй
 *    унтарч, хуудас өмнөх хүний нийтэлсэн хэвээрээ дахин бичигдээд
 *    дэлгэцэд «Архивт N мөр нэмэгдэв · хяналтад илгээв» гэж АМЖИЛТТАЙ
 *    харагддаг байв — ноорог нь ч цэвэрлэгдэж, өдрийн ажил ул мөргүй
 *    алга болно. (`Huvaari.tsx:322` ижил аюулыг аль хэдийн таньсан.)
 *
 * Тиймээс түлхүүрүүдийг (№ + Ажлын нэр)-ээр шинэ мөрөнд ЗӨӨНӨ; хос нь
 * давхардвал ДАРААЛЛААР нь хуваарилна (нэг нэрийдэл нэг л удаа).
 *
 * ⚠️ БАЙРЛАЛААР ОЙРТУУЛАХ АРГЫГ ХАСАВ (2026-09-08-ны аудитын CRITICAL
 *    олдвор). Урьд нь `Math.abs(j - i)`-ээр хамгийн ойрхон нэрийдлийг
 *    сонгодог байв. Гэвч `i` нь `rowKeys`-ийн индекс, харин `j` нь
 *    `freshRows`-ийн индекс — ХОЁР ӨӨР координат. `rowKeys` нь ЗӨВХӨН
 *    засварласан мөрүүдийг агуулдаг СИЙРЭГ жагсаалт (`FillNew`-ийн
 *    `usedOids` шүүлт) тул 1,370 мөрийн жаазанд 69 түлхүүр байвал `i`
 *    0…68, `j` 0…1369 болно. Bagts_1_9f-ийн жаазны 60.5% нь давхардсан
 *    «№ ¦ Ажил» түлхүүртэй бөгөөд симуляцад засварласан мөрийн 54% нь
 *    ӨӨР БЛОКИЙН мөрөнд буув — буруу мөр ч ОЛДДОГ тул `unmoved` = 0 болж,
 *    `hyanaltStore`-ийн хамгаалалт өнгөрч, буруу тоо архивт БИЧИГДЭНЭ.
 *
 * ⚠️ ЗАСВАР: `rowKeys` нь ихэвчлэн хуудасны дарааллаар баригддаг
 *    (`for (const r of rows) if (usedOids.has(r.oid))`) — гэхдээ үүнд
 *    ТУЛГУУРЛАХГҮЙ, доор oid-оор дахин эрэмбэлнэ (2026-09-25) — ба `freshRows` ч
 *    мөн хуудасны дараалалтай тул ижил түлхүүрийн k дахь тохиолдол нь шинэ
 *    жаазны k дахь тохиолдолд харгалзана. Тиймээс нэрийдлийг `shift()`-ээр
 *    дараалан хуваарилна — ноорог сэргээх зам (`FillNew`-ийн `oidFix`)
 *    аль хэдийн ЯГ ЭНЭ дүрмээр ажилладаг; хоёр зам НЭГ дүрэмтэй байх ёстой
 *    гэсэн `parentOf`-ийн ⚠️ шаардлагыг энэ хангана.
 *
 * ⚠️ Зөөлт ШААРДЛАГАТАЙ эсэхийг ЭНЭ функц шийдэхгүй — дуудагч шийднэ
 *    (`publish`: `freshRows[0].oid !== rows[0].oid`; `overlaySubmission`:
 *    rowKeys-ийн oid rows-д байхгүй). Хэрэггүй үед ХООСОН map дамжуулбал
 *    `moveKeys` түлхүүрийг хэвээр үлдээнэ.
 *
 * ⚠️ 2026-10-04 аудит (#2, CRITICAL/HIGH): «сийрэг rowKeys-ийн k дахь нь шинэ жаазны
 *    k дахь нэрийдэл» гэсэн дээрх `shift()` дүрэм БУРУУ байв — `rowKeys` нь ЗӨВХӨН
 *    хөндсөн мөрүүд тул «1 ¦ Шороо»-ийн 2-р тохиолдлыг л зассан бол (сийрэг жагсаалтын
 *    1-р) шинэ жаазны 1-р тохиолдолд, ӨӨР БЛОКИЙН мөрөнд бууж, `unmoved = 0`-оор
 *    хамгаалалт өнгөрдөг байв. Одоо `mapOldOids` (доор) — мөр бүрийн ХУУДАС ДАХЬ
 *    давтамжийн дугаар (`rowOcc`, бичих агшинд ХУУДАСНЫ БҮХ мөрөөр бодсон)-оор яг
 *    тулгана; тэр мэдээлэлгүй (хуучин) түлхүүрийг ЗӨВХӨН хоёрдмол утгагүй үед
 *    (нэрийдэл ганц, эсвэл тухайн шошгын бүх тохиолдол жагсаалтад бий) зөөнө —
 *    эс бөгөөс ЗӨӨХГҮЙ (`unmoved` → дуудагч ил анхааруулж зогсоно).
 */
export function buildOidMap(
  rowKeys: [number, string][],
  freshRows: SheetRow[],
  rowOcc?: readonly RowOcc[],
): Map<number, number> {
  return mapOldOids(rowKeys, freshRows, rowOcc).map;
}

/**
 * МӨРИЙН ДАВТАМЖИЙН ДУГААР — `[oid, k, n]` (2026-10-04 аудит, #2).
 *   · `k` — ижил «№ ¦ Ажлын нэр» шошготой мөрүүдийн дотор ХУУДАСНЫ дарааллаарх
 *     дугаар (0-ээс), ХУУДАСНЫ БҮХ (эерэг oid-той) мөрөөр тоолсон;
 *   · `n` — тэр шошготой мөрийн НИЙТ тоо (бичих агшинд).
 * ⚠️ ЯАГААД `n`: жааз хооронд ижил шошготой мөр нэмэгдсэн/хасагдсан бол `k` гулсана —
 *    `n` зөрвөл `mapOldOids` ТААМАГЛАХГҮЙ (хоёрдмол → `unmoved`).
 * ⚠️ Сөрөг (нэмсэн, түр) мөр ТООЛОГДОХГҮЙ — архивын суурь жаазад байхгүй тул
 *    дэлгэц (overlay) ба `loadRows`-ийн тоо зөрөх байсан.
 * ⚠️ Ноорог (`Draft.rowOcc`) ба илгээлт (`SubmissionPayload.rowOcc`) ХОЁУЛАА ЭНЭ хэлбэр;
 *    `rowKeys`-ийн `[oid, шошго]` хэлбэр ХӨНДӨГДӨӨГҮЙ (хуучин клиент, `describeUnmoved`).
 */
export type RowOcc = [number, number, number];

/** `rows`-ийн (сонгосон `oids`-ийн, өгөөгүй бол бүгдийн) давтамжийн дугаар — дээрх ⚠️ */
export function rowOccOf(
  rows: readonly Pick<SheetRow, "oid" | "no" | "work">[],
  oids?: Iterable<number>,
): RowOcc[] {
  const want = oids ? new Set(oids) : null;
  const cnt = new Map<string, number>();
  const hit: [number, string, number][] = [];
  for (const r of rows) {
    if (!(r.oid >= 0)) continue;
    const k = rowKeyOf(r);
    const i = cnt.get(k) ?? 0;
    cnt.set(k, i + 1);
    if (!want || want.has(r.oid)) hit.push([r.oid, k, i]);
  }
  return hit.map(([o, k, i]): RowOcc => [o, i, cnt.get(k) ?? 0]);
}

/**
 * ХУУЧИН oid → ШИНЭ жаазны oid, ХОЁРДМОЛ утгатайг ТУСАД НЬ (2026-10-04 аудит, #2).
 *
 * Шошго бүрээр:
 *   1) `rowOcc` бүхий түлхүүр — `n` нь шинэ жаазны тоотой ТЭНЦҮҮ бол `k` дахь
 *      нэрийдэлд яг буулгана; `n` зөрвөл → `ambiguous` (мөр нэмэгдсэн/хасагдсан —
 *      `k` гулссан байж болно, ТААМАГЛАХГҮЙ);
 *   2) `rowOcc`-гүй (хуучин) түлхүүр — нэрийдэл ГАНЦ бөгөөд түлхүүр ганц бол тэр;
 *      хуучин түлхүүрийн тоо = нэрийдлийн тоо (бүх тохиолдол жагсаалтад — жиш.
 *      хуудасны бүтэн жагсаалт) бол oid-ын (= хуудасны) дарааллаар; ЭС БӨГӨӨС
 *      `ambiguous` — урьд нь энд `shift()` хамгийн эхний нэрийдлийг өгч ӨӨР мөрөнд
 *      буулгадаг байв (`buildOidMap`-ийн ⚠️).
 *   Шошго шинэ жаазад огт байхгүй → аль алинд нь орохгүй (`moveKeys` `unmoved`).
 * ⚠️ `ambiguous` нь `map`-д ОРОХГҮЙ — дуудагч «аль мөр болохыг тодорхойлж чадсангүй»
 *    гэж ил хэлж, утгыг ХАДГАЛСАН чигээр нь орхино (буруу мөрөнд буулгахгүй).
 * ⚠️ Сөрөг (түр) oid-ыг ҮЛ ТООНО — `moveKeys` тэднийг хэвээр үлдээдэг.
 * ⚠️ 2026-10-04 дахин аудит (#9): (2)-ын «oid-ын дарааллаар» дүрэм нь бүх хуучин oid НЭГ
 *    жаазных байхад л зөв (жааз бүр хуудасны дарааллаар бичигддэг). НООРОГИЙН `rowKeys` нь
 *    `mergeDrafts`-аар ӨӨР ӨӨР жаазны хуулбараас нэгддэг тул F0-ийн 103 ба F1-ийн 503 хоёр
 *    «бүх тохиолдол» мэт харагдаж мөрүүд СОЛИГДОЖ буух байв. `sameFrame = false` (ноорог) үед
 *    дарааллын дүрэм ХААЛТТАЙ — зөвхөн ганц хуучин түлхүүр ↔ ганц нэрийдэл; бусад нь хоёрдмол.
 *    Илгээлтийн payload (`movePayload`-оор НЭГ жаазад зөөгддөг) ба хуудасны бүтэн жагсаалт — `true`.
 */
export function mapOldOids(
  rowKeys: readonly [number, string][],
  freshRows: readonly Pick<SheetRow, "oid" | "no" | "work">[],
  rowOcc?: readonly RowOcc[],
  sameFrame = true,
): { map: Map<number, number>; ambiguous: number[] } {
  const map = new Map<number, number>();
  const ambiguous: number[] = [];
  if (!rowKeys.length || !freshRows.length) return { map, ambiguous };
  /* Нэрийдлүүд — хуудасны дарааллаар (`freshRows` өөрөө тэр дараалалтай). */
  const free = new Map<string, number[]>();
  for (const r of freshRows) {
    if (!(r.oid >= 0)) continue;
    const k = rowKeyOf(r);
    const l = free.get(k);
    if (l) l.push(r.oid);
    else free.set(k, [r.oid]);
  }
  const occ = new Map<number, [number, number]>();
  for (const e of rowOcc ?? []) {
    if (Array.isArray(e) && Number.isInteger(e[0]) && Number.isInteger(e[1]) && Number.isInteger(e[2]) && e[1] >= 0 && e[2] > e[1]) {
      occ.set(e[0], [e[1], e[2]]);
    }
  }
  /* Шошго → хуучин oid-ууд (давхардалгүй, oid өсөхөөр = хуудасны дараалал, 2026-09-25) */
  const byLabel = new Map<string, number[]>();
  const seen = new Set<number>();
  for (const [oid, key] of [...rowKeys].sort((a, b) => a[0] - b[0])) {
    if (!(oid >= 0) || seen.has(oid)) continue;
    seen.add(oid);
    const l = byLabel.get(key);
    if (l) l.push(oid);
    else byLabel.set(key, [oid]);
  }
  for (const [label, olds] of byLabel) {
    const cand = free.get(label);
    if (!cand?.length) continue;      // олдохгүй → `moveKeys` `unmoved`-д тоолно
    const legacy: number[] = [];
    for (const o of olds) {
      const x = occ.get(o);
      if (!x) { legacy.push(o); continue; }
      if (x[1] === cand.length && x[0] < cand.length) map.set(o, cand[x[0]]);
      else ambiguous.push(o);
    }
    if (!legacy.length) continue;
    if (legacy.length === cand.length && (sameFrame || cand.length === 1)) legacy.forEach((o, i) => map.set(o, cand[i]));
    else ambiguous.push(...legacy);
  }
  return { map, ambiguous };
}

/**
 * ХУУЧИН (`rowOcc`-гүй) ИЛГЭЭЛТИЙН ДАВТАМЖИЙГ ӨӨРИЙН СУУРЬ ЖААЗААС НӨХНӨ (2026-10-04 дахин аудит, #1, HIGH).
 *
 * ⚠️ ЯАГААД: `rowOcc` нэмэгдэхээс өмнө хадгалагдсан, хуучин жааз дээрх хүлээгдэж буй илгээлт нь
 *    (сийрэг `rowKeys`, давхардсан шошго) `mapOldOids`-д ХОЁРДМОЛ болж: батлалт
 *    (`hyanaltStore` → `overlaySubmission` `unmoved`) ч, дахин илгээлт (`FillNew.movePayload`
 *    → `stale`) ч МӨНХӨД гацдаг байв — payload хэзээ ч `rowOcc` олж авахгүй. Илгээлт нь
 *    `base` (архивын агшин) дээр бичигдсэн тул тэр жаазыг уншиж `k`/`n`-ийг ЯГ бодно.
 * ⚠️ oid-оор ТУЛГАНА: жааз бүр шинэ OBJECTID-тай тул oid + шошго хоёул таарсан мөр л тэр
 *    жаазных — өдрөөр ачаалсан жааз өөр (нэг өдөрт хоёр жааз) байвал таарахгүй → нөхөхгүй,
 *    хуучин дүрэм (хоёрдмол → ил зогсолт) хэвээр. Байгаа `rowOcc` ДАРАГДАХГҮЙ.
 * Буцаах: нөхсөн payload (шинэ объект) — нөхөх зүйлгүй бол ОРОЛТ өөрөө.
 */
export function withFrameOcc<P extends { rowKeys: [number, string][]; rowOcc?: RowOcc[] }>(
  p: P,
  frameRows: readonly Pick<SheetRow, "oid" | "no" | "work">[],
): P {
  const have = new Set((p.rowOcc ?? []).map((e) => e[0]));
  const label = new Map<number, string>();
  for (const [o, k] of p.rowKeys ?? []) if (o >= 0 && !have.has(o)) label.set(o, k);
  if (!label.size) return p;
  const want: number[] = [];
  for (const r of frameRows) if (label.get(r.oid) === rowKeyOf(r)) want.push(r.oid);
  if (!want.length) return p;
  const add = rowOccOf(frameRows, want);
  return { ...p, rowOcc: [...(p.rowOcc ?? []), ...add].sort((a, b) => a[0] - b[0]) };
}
/**
 * Суурь жаазаас нөхөх ШААРДЛАГАТАЙ юу — `rowKeys`-ийн эерэг oid `curRows`-д БАЙХГҮЙ (зөөх ёстой)
 * бөгөөд түүнд `rowOcc` алга (`withFrameOcc`-ийн ⚠️). Хямд — дуудагч зөвхөн тэгвэл жааз уншина.
 */
export function needsFrameOcc(
  p: { rowKeys?: [number, string][]; rowOcc?: RowOcc[] },
  curRows: readonly Pick<SheetRow, "oid">[],
): boolean {
  const cur = new Set(curRows.map((r) => r.oid));
  const have = new Set((p.rowOcc ?? []).map((e) => e[0]));
  return (p.rowKeys ?? []).some(([o]) => o >= 0 && !cur.has(o) && !have.has(o));
}

/**
 * Түлхүүрүүдийг (`${oid}:…`) шинэ oid руу ЗӨӨНӨ (`publish`-ийн moveKey/moveAll).
 *
 * - map хоосон → бүх түлхүүр хэвээр (зөөлт хэрэггүй).
 * - сөрөг oid → хэвээр: нэмсэн мөр (ТҮР дугаар) `insertAdds`-аар шинэ жаазанд
 *   дахин ордог тул түүний түлхүүр хэвээр хүчинтэй.
 * - map-д олдохгүй → `unmoved`-д. Дуудагч `unmoved.length > 0` үед ЗОГСОНО —
 *   чимээгүй амжилт заахгүй (дээрх ⚠️).
 */
export function moveKeys(
  map: Map<number, number>,
  src: Record<string, string>,
): { out: Record<string, string>; unmoved: string[] } {
  const out: Record<string, string> = {};
  const unmoved: string[] = [];
  for (const [k, v] of Object.entries(src)) {
    const at = k.indexOf(":");
    /* ⚠️ `at < 0` (2026-09-15-ны аудит): «:»-гүй эвдэрсэн түлхүүрт
       `k.slice(0, -1)` нь СҮҮЛИЙН ТЭМДЭГТИЙГ таслаад «1234» → 123 гэсэн
       ХҮЧИНТЭЙ OID гаргадаг тул утга ӨӨР МӨРД буух боломжтой байв. */
    const oid = at < 0 ? NaN : Number(k.slice(0, at));
    if (!map.size || !Number.isFinite(oid) || oid < 0) {
      out[k] = v;
      continue;
    }
    const to = map.get(oid);
    if (to == null) {
      unmoved.push(k);
      continue;
    }
    out[`${to}${k.slice(at)}`] = v;
  }
  return { out, unmoved };
}

export type Overlay = {
  /** Суурь мөрүүдийн ХУУЛБАР (+ нэмсэн мөр) дээр илгээлтийн утга бичигдсэн */
  rows: SheetRow[];
  /** Илгээлтийн «Шинэчлэгдсэн огноо» — өөрчлөөгүй бол `null` */
  asOf: number | null;
  /** Мөрөнд БУУСАН нүдний түлхүүрүүд (`${oid}:${b}`, oid = `rows`-ийнх) */
  cellKeys: string[];
  /** Мөрөнд БУУСАН огнооны түлхүүрүүд (`${oid}:${b}:s|e`) */
  dateKeys: string[];
  /** Мөрөнд тулгаж ЧАДААГҮЙ түлхүүрийн тоо — >0 бол батлах ХОРИОТОЙ */
  unmoved: number;
  /**
   * Тулгагдаагүй ЯГ ТЭР түлхүүрүүд (`${oid}:${b}` / `${oid}:${b}:s|e`).
   *
   * ⚠️ ЗӨВХӨН ТООГООР хангалтгүй (2026-09-04-ний аудит): «3 нүдийг тулгаж
   *    чадсангүй» гэсэн мессеж хянагчид АЛЬ мөр, АЛЬ блок болохыг хэлдэггүй
   *    тул засах зам байхгүй, багцын илгээлт бүрмөсөн гацдаг байв.
   */
  unmovedKeys: string[];
  /**
   * ⚠️ 2026-10-01: илгээлтийн `rowKeys`-ийн oid-ууд суурь жаазад БАЙГААГҮЙ тул
   *    (№ ¦ Ажил)-аар ЗӨӨСӨН эсэх (`needMap`). `true` бол илгээлтээс хойш архивт шинэ
   *    жааз орсон — хуучин ИНДЕКСИЙН хэлбэрийн зөвшөөрөл (`hyanaltOkCells`) энэ
   *    мөрийн дараалалд итгэгдэхгүй.
   */
  remapped: boolean;
};

/**
 * ИЛГЭЭЛТИЙГ СУУРЬ ЖААЗ ДЭЭР ДАВХАРЛАНА — компанийн хуудас, хянагчийн
 * харагдац, ерөнхий менежерийн батлалт гурвуулаа ЭНЭ функцээр ижил мөр
 * авна.
 *
 * 1) `rows`-д `sub.rowKeys`-ийн oid-ууд байхгүй бол (архивт хооронд нь шинэ
 *    жааз нэмэгдсэн) `buildOidMap` → cells/dates-ийг зөөнө; зөөгдөөгүйг
 *    `unmoved`-д тоолно.
 * 2) `insertAdds` — гэхдээ эцгийн бүлэг дотор (№ + Ажлын нэр) ижил мөр аль
 *    хэдийн БАЙГАА add-ыг АЛГАСНА (доорх ⚠️).
 * 3) ХУУЛБАР мөрүүдэд утга бичнэ — `rows` mutate ХИЙГДЭХГҮЙ.
 *    cells → `obyem[b]` нь `cellObyem`-ийн ДҮРМЭЭР ("" → null; тоо биш →
 *    хэвээр; сөрөг → 0); dates → `start/end[b]` нь `dayToMs`-ийн дүрмээр
 *    ("" → null).
 *    ⚠️ 2026-09-25: `sub.mode === "inc"` бол cells нь НЭМЭЛТ — `incCell`-ээр
 *    суурь дээр НЭМНЭ (тэг/хоосон нэмэлт нүдийг хөндөхгүй).
 * 4) `cellKeys`/`dateKeys` = мөрөнд буусан түлхүүрүүд; `asOf = sub.asOf ?? null`.
 *
 * ⚠️ `null ≠ 0` — утгагүй нүд `null` хэвээр; `cellObyem` дүрмээс өөр юу ч
 *    хэрэглэхгүй (нэг дүрэм, хоёр газар зөрөхгүй).
 */
export function overlaySubmission(
  rows: SheetRow[],
  sub: SubmissionPayload,
  sc: Schema,
  nBld: number,
): Overlay {
  /* ── 1. ObjectID шилжилт ── */
  const baseOids = new Set(rows.map((r) => r.oid));
  const rowKeys = sub.rowKeys ?? [];
  /* ⚠️ Зөөлт хэрэгтэй эсэх: rowKeys-ийн (эерэг) oid-уудын НЭГ Ч НЬ rows-д
     байхгүй бол шинэ жааз гэж үзнэ. Жаазууд огтлолцдоггүй тул «зарим нь
     байна, зарим нь үгүй» гэдэг нь бодитоор гардаггүй; гарвал ч түлхүүрээр
     зөөх нь oid-г шууд итгэхээс аюулгүй. */
  const needMap = rowKeys.some(([oid]) => oid >= 0 && !baseOids.has(oid));
  /* ⚠️ 2026-10-04 (#2): давтамжийн дугаар (`rowOcc`)-аар яг тулгана; хоёрдмол утгатай
     түлхүүр зөөгдөхгүй → `unmoved` (батлалт зогсож, хүн шалгана) — `buildOidMap`-ийн ⚠️ */
  const map = needMap ? buildOidMap(rowKeys, rows, sub.rowOcc) : new Map<number, number>();
  const mc = moveKeys(map, Object.fromEntries(sub.cells ?? []));
  const md = moveKeys(map, Object.fromEntries(sub.dates ?? []));
  const unmovedKeys: string[] = [...mc.unmoved, ...md.unmoved];

  /* ── 2. Нэмсэн мөр — давхардлыг алгасна ── */
  /**
   * ⚠️ БАТЛАГДСАНЫ ДАРАА ДАВХАР ОРОХООС: ерөнхий менежер баталж архивт
   *    жааз нэмэгдсэн ч `closeSubmission` унавал (эсвэл хуудас түр хуучин
   *    илгээлтийг харсаар байвал) илгээлтийн add нь шинэ жаазанд аль хэдийн
   *    ЖИНХЭНЭ мөр болж орсон байна. Түүнийг дахин оруулбал нэг ажил хоёр
   *    мөр болж, мөнгөн дүн/жин давхар тоологдоно. Тиймээс эцгийн бүлэг
   *    дотор (№ + Ажлын нэр) ижил, бүлэг биш мөр байвал add-ыг алгасаж,
   *    түүний түр oid-г тэр мөрийн oid руу ЗААЛГАНА (`alias`) — add-ын
   *    нүднүүд архивын мөрөнд буух ба `unmoved`-д тоологдохгүй.
   */
  const alias = new Map<number, number>();
  const kept: NewRow[] = [];
  for (const a of sub.adds ?? []) {
    const p = parentOf(rows, a);
    let dup = -1;
    if (p >= 0) {
      const d = rows[p].depth;
      for (let i = p + 1; i < rows.length && rows[i].depth > d; i += 1) {
        const r = rows[i];
        if (!r.group && r.no === a.no && r.work === a.work) {
          dup = i;
          break;
        }
      }
    }
    if (dup >= 0) alias.set(a.oid, rows[dup].oid);
    else kept.push(a);
  }
  const withAdds = insertAdds(rows, kept, sc, nBld);

  /* ── 3. Хуулбар мөрүүдэд бичнэ ── */
  const out: SheetRow[] = withAdds.map((r) => ({
    ...r,
    obyem: r.obyem.slice(),
    /* ⚠️ `act` ч ХУУЛБАРЛАГДАНА (2026-09-08): цэвэрлэсэн нүдийг доор
       `null` болгож бичдэг тул эх мөрийг өөрчилж болохгүй. */
    act: r.act.slice(),
    start: r.start.slice(),
    end: r.end.slice(),
    /* ⚠️ ГЭРЭЭНИЙ огноо ч ХУУЛБАРЛАГДАНА (2026-09-11-ний аудит). Дөрвөн
       массив хуулбарлагддаг атлаа шинэ хоёр нь орхигдсон байв — хуулбар
       мөр нь эх мөртэйгөө хаягаа хуваалцаж, доор бичихэд `rows` мутацлагдах
       байсан. Өнөөдөр энд гэрээний огноонд бичдэггүй ч `Huvaari` аль хэдийн
       тэр замтай тул занга нээлттэй үлдээхгүй. */
    gStart: r.gStart.slice(),
    gEnd: r.gEnd.slice(),
    /* ⚠️ Бодит огноо ч ХУУЛБАРЛАГДАНА (2026-09-23) — гэрээний огнооны ижил
       aliasing ⚠️: массив хуваалцвал эх `rows` мутацлагдана. */
    aStart: r.aStart.slice(),
    aEnd: r.aEnd.slice(),
  }));
  const idx = new Map<number, number>();
  out.forEach((r, i) => idx.set(r.oid, i));

  /** Түлхүүрийн oid → мөрийн индекс; alias-тай түр oid-г архивын мөр рүү. */
  const rowOf = (oidRaw: number): number | undefined => {
    const oid = alias.get(oidRaw) ?? oidRaw;
    return idx.get(oid);
  };
  const withOid = (k: string, at: number, oid: number) => `${oid}${k.slice(at)}`;

  const cellKeys: string[] = [];
  for (const [k, v] of Object.entries(mc.out)) {
    const at = k.indexOf(":");
    const b = Number(k.slice(at + 1));
    /* ⚠️ `at < 0` бол түлхүүр эвдэрсэн — `slice(0, -1)` нь сүүлийн тэмдэгтийг
       таслаад ХУУРАМЧ OID гаргана (дээрх `moveKeys`-ийн ижил ⚠️). */
    const i = at < 0 ? null : rowOf(Number(k.slice(0, at)));
    /* ⚠️ Мөр эсвэл блок олдохгүй бол ЧИМЭЭГҮЙ хаяхгүй — `unmoved`-д тоолно
       (ноорог/илгээлтийн түлхүүр хуучирсан, rowKeys алга г.м.). */
    if (i == null || !Number.isInteger(b) || b < 0 || b >= nBld) {
      unmovedKeys.push(k);
      continue;
    }
    const r = out[i];
    const key = withOid(k, at, r.oid);
    /* ⚠️ НЭМЭЛТИЙН ИЛГЭЭЛТ (2026-09-25, `bagtsSheet.CellMode`-ийн ⚠️): утга нь
       СУУРЬ (энэ `rows` — архивлахад СҮҮЛИЙН жааз) дээр НЭМЭГДЭНЭ. Нэмэлт нь
       нэмэгддэг тул хэдэн өдрийн илгээлт ямар ч дарааллаар батлагдсан ч нийлбэр
       зөв. Тэг/хоосон нэмэлт нүдийг ХӨНДӨХГҮЙ, `cellKeys`-д ч оруулахгүй
       (өөрчлөгдөөгүй нүдийг «өөрчлөгдсөн» гэж будахгүй). Туггүй payload нь
       ХУУЧИН (орлуулах) дүрмээрээ доор. */
    if (sub.mode === "inc") {
      /* ⚠️ 2026-10-09: блокгүй багцын Обьёмгүй мөр (`synNoVol` — Обьём null/0/сөрөг) — нүд нь UI-д
         түгжээтэй; хуучин ноорог/илгээлтээр ирсэн нэмэлтийг ХАЯНА (`cellKeys`-д ч оруулахгүй). Эс бөгөөс
         `incCell` нь `obyem_sum`-ийг бичиж `act` (L)-ийг хуучнаар нь үлдээдэг тул архивт L-гүй обьём
         орох байв. `unmoved` БИШ: тэр нь батлалтыг МӨНХӨД зогсооно, харин энэ нүдийг засах зам алга. */
      if (synNoVol(sc, r)) continue;
      const res = incCell(r, b, v, !!sc.obyem[b]);
      if (!res) continue;
      r.obyem[b] = res.obyem;
      r.act[b] = res.act;
      cellKeys.push(key);
      continue;
    }
    // `cellObyem`-ийн ДҮРЭМ ЯГ өөрөө — нэг мөрийн засвар мэт дамжуулна.
    r.obyem[b] = cellObyem(r, b, { [key]: v });
    /* ⚠️ ХУВЬ БАГАНАД ч БУУЛГАНА (2026-09-08). Урьд нь энд ЗӨВХӨН `obyem`
       бичигддэг байсан тул:
         · ЦЭВЭРЛЭСЭН нүд (`""`) — обьём null болох ч ХУУЧИН хувь хэвээр
           үлдэж, архивт хоёр багана үл нийцэн батлагдана;
         · мөрийн `Обьём`гүй ажилд ХУВИАР (`%50`) бичсэн нүд — `cellObyem`
           тэнд обьёмыг ТААМАГЛАДАГГҮЙ тул хувь нь хаа ч буудаггүй байв.
       `computeAll`-ийн дүрэмтэй ЯГ ижил: цэвэрлэсэн = `null` («мэдээлэлгүй»,
       0 БИШ), хувиар бичсэн = тэр хувь. Обьёмоор бичсэн үед `act` нь
       `computeAll`-д обьёмоос дахин бодогдох тул энд ХӨНДӨХГҮЙ. */
    if (v.trim() === "") r.act[b] = null;
    else {
      const p = cellPct(r, b, { [key]: v });
      if (p != null) r.act[b] = p;
    }
    cellKeys.push(key);
  }

  const dateKeys: string[] = [];
  for (const [k, v] of Object.entries(md.out)) {
    const at = k.indexOf(":");
    const rest = k.slice(at + 1).split(":");
    const b = Number(rest[0]);
    const se = rest[1];
    const i = rowOf(Number(k.slice(0, at)));
    if (i == null || !Number.isInteger(b) || b < 0 || b >= nBld || (se !== "s" && se !== "e")) {
      unmovedKeys.push(k);
      continue;
    }
    const r = out[i];
    // `pickDate`-ийн дүрэм: засвар байвал `dayToMs` ("" → null).
    if (se === "s") r.start[b] = dayToMs(v);
    else r.end[b] = dayToMs(v);
    dateKeys.push(withOid(k, at, r.oid));
  }

  return {
    rows: out,
    asOf: sub.asOf ?? null,
    cellKeys,
    dateKeys,
    unmoved: unmovedKeys.length,
    unmovedKeys,
    remapped: needMap,
  };
}

/**
 * ИЛГЭЭЛТИЙН СУУРЬ ЖААЗНААС ХОЙШ АРХИВТ ӨӨРЧЛӨГДСӨН НҮДНҮҮД — илгээлтийн
 * ЭХ түлхүүрээр (`${oid}:${b}` · `${oid}:${b}:s|e`).
 *
 * ⚠️ ЯАГААД (2026-09-25-ны аудит, HIGH): өдөр бүр тусдаа `sub|` мөртэй тул
 *    Даваа ба Мягмарын илгээлт хоёулаа ижил суурь (Ням) дээр бичигдэж, зэрэг
 *    хянагдана. Мягмар ЭХЭЛЖ батлагдвал архивын сүүлийн жааз Мягмарын
 *    ХУРИМТЛАГДСАН тоотой болно; дараа нь Даваа батлагдахад `overlaySubmission`
 *    Даваагийн (бага) утгыг сүүлийн жаазан дээр дарж бичиж хуримтлалыг
 *    ЧИМЭЭГҮЙ БУЦААДАГ байв. Энэ функц «суурь → сүүлийн» хооронд өөрчлөгдсөн
 *    нүдийг олж, дуудагч (`hyanaltStore.archiveSubmission`) тэднийг ХЭРЭГЛЭХГҮЙ.
 *
 * ⚠️ ЦЭВЭР ФУНКЦ. Түлхүүрийг мөрөнд `overlaySubmission`-тэй ИЖИЛ дүрмээр
 *    буулгана (`buildOidMap` зөвхөн `rowKeys`-ийн oid тэр жаазанд байхгүй үед).
 *    Сөрөг (нэмсэн) мөр, аль нэг жаазанд олдохгүй түлхүүрийг ШАЛГАХГҮЙ —
 *    тэдгээрийг `overlaySubmission`-ийн `unmoved`/`alias` өөрөө барина.
 * ⚠️ `null ≠ 0`: утга null↔тоо болсон нь ч өөрчлөлт.
 */
export function staleSubmissionKeys(
  baseRows: SheetRow[],
  latestRows: SheetRow[],
  sub: Pick<SubmissionPayload, "cells" | "dates" | "rowKeys"> & { mode?: SubmissionPayload["mode"]; rowOcc?: SubmissionPayload["rowOcc"] },
  nBld: number,
): string[] {
  /* ⚠️ НЭМЭЛТИЙН ИЛГЭЭЛТИЙН НҮДИЙГ ШАЛГАХГҮЙ (2026-09-25): нэмэлт нь СҮҮЛИЙН
     жааз дээр НЭМЭГДЭХ тул хожуу өдрийн батлалт аль хэдийн орсон ч хуримтлал
     буурахгүй — алгасвал тэр өдрийн ахиц АЛГА болно. Огноо нь нэмэлт биш
     (ҮНЭМЛЭХҮЙ утга) тул доорх `dates` шалгалт ХЭВЭЭР. */
  const incCells = sub.mode === "inc";
  const rowKeys = sub.rowKeys ?? [];
  const locate = (rows: SheetRow[]) => {
    const oids = new Set(rows.map((r) => r.oid));
    const need = rowKeys.some(([o]) => o >= 0 && !oids.has(o));
    const map = need ? buildOidMap(rowKeys, rows, sub.rowOcc) : new Map<number, number>();
    const byOid = new Map<number, SheetRow>();
    rows.forEach((r) => byOid.set(r.oid, r));
    return (oid: number): SheetRow | undefined => {
      if (!map.size) return byOid.get(oid);
      const to = map.get(oid);
      return to == null ? undefined : byOid.get(to);
    };
  };
  const inBase = locate(baseRows);
  const inLatest = locate(latestRows);
  const same = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null ? (a == null) === (b == null) : Math.abs(a - b) <= 1e-9;
  const out: string[] = [];
  const pair = (k: string): [SheetRow, SheetRow, string[]] | null => {
    const at = k.indexOf(":");
    if (at < 0) return null;
    const oid = Number(k.slice(0, at));
    if (!Number.isFinite(oid) || oid < 0) return null;
    const rest = k.slice(at + 1).split(":");
    const b = Number(rest[0]);
    if (!Number.isInteger(b) || b < 0 || b >= nBld) return null;
    const x = inBase(oid);
    const y = inLatest(oid);
    return x && y ? [x, y, rest] : null;
  };
  for (const [k] of incCells ? [] : sub.cells ?? []) {
    const p = pair(k);
    if (!p) continue;
    const [x, y, rest] = p;
    const b = Number(rest[0]);
    if (!same(x.obyem[b], y.obyem[b]) || !same(x.act[b], y.act[b])) out.push(k);
  }
  for (const [k] of sub.dates ?? []) {
    const p = pair(k);
    if (!p) continue;
    const [x, y, rest] = p;
    const b = Number(rest[0]);
    const se = rest[1];
    if (se === "s" ? !same(x.start[b], y.start[b]) : se === "e" ? !same(x.end[b], y.end[b]) : false) out.push(k);
  }
  return out;
}

/**
 * АРХИВЫН ЖААЗ УГСРАНА — мөр бүрийн `attributes` (`FillNew.publish`-ийн
 * `adds` угсралтын ЯГ ХУУЛБАР). Үйлчилгээ рүү бичихгүй — `applyAdds`-д өгөх
 * бэлэн мөрүүдийг л буцаана.
 *
 * `rows` нь аль хэдийн нэмсэн мөртэй (`insertAdds`/`overlaySubmission`)
 * байна; `pending`/`pendDate` нь мөр дээр хараахан буугаагүй засвар (FillNew-
 * ийн хуучин зам) — overlay хийсэн бол хоосон.
 *
 * ⚠️ `sc.f.fillDate` байхгүй бол throw — `buglusun_ognoo` нь АРХИВЫН ТҮЛХҮҮР;
 *    түүнгүйгээр бичвэл жааз ялгагдахгүй хольцолдоно.
 */
export function buildFrame(
  rows: SheetRow[],
  sc: Schema,
  nBld: number,
  /**
   * «Шинэчлэгдсэн огноо». `null` = хуудсанд огноо ОГТ тохируулаагүй
   * (2026-09-06) — тэр үед төлөвлөгөөт хувь `null` болж бичигдэх ба
   * `sc.f.asOf` талбарт мөн `null` очно. ⚠️ ӨӨР БАГЦЫН огноогоор
   * ОРЛУУЛАХГҮЙ: хэрэглэгчийн шууд заавар («огноо тохируулаагүй бол хоосон
   * өгөгдлөөсөө ажиллах ёстой»).
   */
  asOf: number | null,
  hasObyem: readonly boolean[],
  fillMs: number,
  pending: Record<string, string> = {},
  pendDate: Record<string, string> = {},
  /**
   * Хуваарийн САРЫН задаргаанаас гарах төлөвлөгөөт хувь — `computeAll`-д
   * шууд дамжина.
   * ⚠️ Дэлгэц дээрх тоо ба архивт бичигдэх тоо ЗААВАЛ ижил эх сурвалжтай
   *    байх ёстой: `FillNew` задаргаагаар зурчихаад архивт шугаман утга
   *    бичвэл батлагдсан хуудас нээхэд тоо чимээгүй өөрчлөгдөнө.
   */
  planPct?: (row: SheetRow, b: number) => number | null | undefined,
): Record<string, unknown>[] {
  if (!sc.f.fillDate)
    throw new Error(
      tr('«buglusun_ognoo» багана энэ үйлчилгээнд алга — архив үүсгэх боломжгүй тул нийтлэлийг зогсоов (AGOL дээр багана нэмнэ үү).'),
    );
  /* ⚠️ 2026-10-09: блокгүй багцын синтетик блокт J = L (хэмжилтгүй бол null) — `computeAll`-ийн `synthetic` */
  const c = computeAll(rows, nBld, asOf, pending, pendDate, hasObyem, planPct, "abs", sc.synthetic);

  /*
   * АЖЛЫН КОД (`Des_dugaar`) — ЗӨВХӨН ДУТУУ мөрд олгоно.
   *
   * ⚠️ ЯАГААД ДАХИН ДУГААРЛАХГҮЙ (2026-09-04-ний аудит): `Hamaaral` дахь
   *    уялдааны түүх («18FS3») нь ЯГ энэ кодоор урьдчилагчаа заадаг. Жааз бүрд
   *    1…N-ээр дахин дугаарлавал дунд нь нэг мөр нэмэгдэхэд түүнээс хойших
   *    БҮХ код нэгээр гулсаж, хадгалагдсан уялдаа бүр өөр ажил руу чимээгүй
   *    заана. Тиймээс байгаа кодыг ХЭВЭЭР (raw-аар дамжина), зөвхөн шинэ
   *    (ерөнхий менежерийн нэмсэн) мөрд ХАМГИЙН ИХ + 1-ээс эхлэн олгоно.
   *
   * ⚠️ Урьд нь код ЭНД ОГТ бичигддэггүй байсан тул нэмсэн мөр мөнхөд
   *    кодгүй үлдэж, «Хуваарь» модулиас түүн рүү уялдаа заах боломжгүй байв.
   */
  let nextDes = 0;
  if (sc.f.des) {
    for (const r of rows) if (r.des != null && r.des > nextDes) nextDes = r.des;
  }

  return rows.map((r, i) => {
    // Мэддэггүй багана ч хуулбарт үлдэхийн тулд БҮХ талбараас эхэлнэ.
    const a: Record<string, unknown> = { ...r.raw };
    for (let b = 0; b < nBld; b++) {
      /*
       * ⚠️ АРХИВТ ТАСЛАГДСАН (`actAgg`) УТГА БИЧИГДЭНЭ, ТҮҮХИЙ (`act`) НЬ БИШ
       * (2026-09-06).
       *
       * `act[b]` нь обьём ÷ мөрийн Обьём — хуваарь буруу эсвэл хуримтлалыг
       * хэт өндөр бичсэн үед 1-ээс давна (амьд жишээ: Багц 2-ын «1F цутгалт»
       * 1.2456 = 124.56%). Тэр нүд бөглөх ХУУДСАНД түүхийгээрээ, шар тугтай
       * харагдах ёстой (`actOver`) — хүн засах ёстой алдаа тул нуухгүй.
       *
       * ⚠️ ГЭХДЭЭ АРХИВЫН `Бодит_гүйцэтгэл` багана нь дэлгэцийн нүд БИШ:
       * түүнийг `blockProgress` (газрын зураг, дашбоард), `sheetRows` (багцын
       * хүснэгт), тайлан гурвуулаа ГҮЙЦЭТГЭЛИЙН ХУВЬ гэж уншдаг. Тийш нь
       * 124.56% бичвэл барилгын явц 100%-иас давж, `bagts.check.mjs`-ийн
       * «0 ≤ хувь ≤ 100» гэрээ унана. Бүлэг рүү аль хэдийн `actAgg` дамждаг
       * (2026-09-04) — архив нь мөн адил байх ёстой, эс бөгөөс нэг тоо хоёр
       * өөр утгатай болно.
       *
       * ⚠️ МЭДЭЭЛЭЛ АЛДАГДАХГҮЙ: хуримтлагдсан обьём (`sc.obyem[b]`) доор
       * бүтнээрээ бичигдэх тул түүхий харьцааг хэдийд ч дахин бодож болно.
       */
      a[sc.act[b]] = c[i].actAgg[b];
      a[sc.plan[b]] = c[i].plan[b];
      // Хуримтлагдсан обьём — хувийн ЭХ СУРВАЛЖ. Талбаргүй блок бий тул
      // шалгаж байж бичнэ; бүлгийн мөрд хоосон (нэгж нь зөрдөг).
      if (sc.obyem[b]) a[sc.obyem[b]!] = c[i].obyem[b];
      /*
       * ⚠️ БҮЛГИЙН БОДОГДСОН (agg) ОГНООГ ХАДГАЛАХГҮЙ (2026-08-29). Урьд нь
       * дэд мөрүүдийн MIN/MAX-ыг бүлгийн талбарт бичдэг байв — «excel-ийн
       * томъёотой ижил» гэсэн үндэслэлээр. Гэвч excel-д тэр нь ТОМЪЁО хэвээр
       * (динамик), энд ХАДГАЛАГДСАН УТГА болж, дараагийн ачаалалтад `own`
       * гэж ангилагдана. Үр дагавар: (1) бүлгийн төлөвлөгөөт хувь дэд
       * мөрүүдийн дунджаас интерполяци руу шилжиж, эхний нийтлэлийн өмнөх
       * ба дараах тоо зөрнө; (2) «Хуваарь» тэр огноог бүлгийн ЖИНХЭНЭ муж гэж
       * үзэж, дэд ажлыг өөрсдийнх нь тодорхойлсон завсарт түгжинэ — plan.ts-
       * ийн хориглосон дугуй логик. Зөвхөн ӨӨРИЙН (own) огноог бичнэ; agg
       * бол null (өмнө нь материалчилагдсаныг ч цэвэрлэнэ).
       */
      if (sc.start[b]) a[sc.start[b]!] = c[i].startSrc[b] === "agg" ? null : c[i].start[b];
      if (sc.end[b]) a[sc.end[b]!] = c[i].endSrc[b] === "agg" ? null : c[i].end[b];
      /*
       * БОДИТ огноо (2026-09-23) — мөртэйгөө ХЭВЭЭР явна, бодогдохгүй.
       * `raw`-д байгаа тул ихэнхдээ дамжчихдаг; ил бичих шалтгаан нь
       * `Hamaaral`-тай ижил: шинэ мөрд `raw` дутуу тул талбар жаазанд
       * ЗААВАЛ байх ёстой — эс бөгөөс «Хуваарь» тэр мөрөнд бодит огноо
       * бичсэний дараа дараагийн жаазанд алга болно.
       */
      if (sc.aStart[b]) a[sc.aStart[b]!] = r.aStart[b];
      if (sc.aEnd[b]) a[sc.aEnd[b]!] = r.aEnd[b];
    }
    /* ХҮН ХҮЧ · МАШИН МЕХАНИЗМ (2026-09-23) — дээрх ⚠️-тэй ижил: хэвээр дамжина. */
    if (sc.f.hunHuch) a[sc.f.hunHuch] = r.hun;
    if (sc.f.mashin) a[sc.f.mashin] = r.mashin;
    // ОБЬЁМЫН НИЙЛБЭР — талбар байвал л бичнэ (шинэ багана, 10/10 багцад бий)
    /* ⚠️ 2026-10-09: блокгүй багцын бөглөх бүдүүвчид (`fillSchema`) синтетик блокийн обьём нь
       ӨӨРӨӨ `obyem_sum` — дээрх `sc.obyem[b]` бичилт НЭГ эх сурвалж; энд ДАВХАР бичихгүй
       (n = 1 тул утга ижил ч хоёр замаас нэг талбар руу бичих нь зөрөх эрсдэл). */
    if (sc.f.obyemSum && !sc.obyem.includes(sc.f.obyemSum)) a[sc.f.obyemSum] = c[i].obyemSum;
    /*
     * МӨНГӨН ДҮН (excel H) — ДЭЛГЭЦ ДЭЭР БОДОГДДОГ УТГЫГ АРХИВТ Ч БИЧНЭ.
     *
     * ⚠️ ЯАГААД (2026-09-04-ний аудит): `buildFrame` нь H-г огт бичдэггүй
     *    байсан тул зөвхөн `{...r.raw}`-аар дамждаг байв. Ерөнхий менежер
     *    шинэ ажил нэмэхэд түүний Обьём×Нэгж өртөг нь дэлгэц дээр бүх өвөг
     *    бүлгийн дүнд нэмэгддэг ч АРХИВТ хуучин дүн хэвээр бичигдэж,
     *    үйлчилгээний багана дэлгэцээс мөнхөд зөрдөг байлаа (AGOL-ын
     *    дашбоард, экспорт нь тэр баганаас уншина).
     * ⚠️ `null` бол ДАРЖ БИЧИХГҮЙ (`null ≠ 0`): `computeAll` бодож чадаагүй
     *    (обьём ба нэгж өртөг хоёул хоосон) үедээ хадгалагдсан утга руу
     *    нөөцлөн буцдаг тул тэр үед raw-ынх нь илүү найдвартай.
     */
    if (sc.f.money && c[i].H != null) a[sc.f.money] = c[i].H;
    /*
     * ХУВИЙН ЖИН — ҮЕ ШАТАНДАА ЭЗЛЭХ (excel D). `wC`-тэй ЯГ ИЖИЛ ёс:
     * ЗӨВХӨН ХООСОН үед бөглөнө (доорх `wC`-ийн ⚠️ тайлбарыг үз — бодсоноо
     * дарж бичвэл нөөц зам өөрийнхөө бодолтоор аажим гажина). Шинэ мөрд энэ
     * нь жинхэнэ нөхөлт: `insertAdds` нь `raw`-д зөвхөн (№, ажил, обьём,
     * нэгж өртөг) өгдөг тул жин нь хоосон үлддэг байв.
     */
    if (sc.f.wD && a[sc.f.wD] == null && c[i].D != null) a[sc.f.wD] = c[i].D;
    /*
     * УЯЛДАА (`Hamaaral`) — мөртэйгөө хамт явна. `raw`-д байгаа тул ихэнхдээ
     * дамжчихдаг; шинэ мөрд `raw` дутуу тул ил бичнэ (одоогоор `null`, гэхдээ
     * талбар нь жаазанд ЗААВАЛ байх ёстой — эс бөгөөс «Хуваарь» тэр мөрөнд
     * уялдаа хадгалахад дараагийн жаазанд алга болно).
     */
    if (sc.f.ham) a[sc.f.ham] = r.ham;
    /* АЖЛЫН КОД — зөвхөн дутуу мөрд (дээрх ⚠️). */
    if (sc.f.des) a[sc.f.des] = r.des != null ? r.des : (nextDes += 1);
    /*
     * ⚠️ БЛОКГҮЙ БАГЦАД (nBld = 0) I/J/K/E нь блокийн баганагүй тул ҮРГЭЛЖ
     *    null — ТЭР ЧИГЭЭР НЬ БИЧНЭ (2026-09-17-ны аудит). Амьд өгөгдөлд эдгээр
     *    талбар импортоос 0 гэж дүүрсэн байдаг; 0-г хадгалбал `blockProgress`/
     *    тайлан «0% хэмжигдсэн» гэж уншина (null ≠ 0). Хэмжээгүй = null.
     * ⚠️ 2026-10-09: бөглөх урсгал (`fillSchema`) блокгүй багцад синтетик НЭГ блок
     *    (n = 1) өгдөг болсон тул I = M, J = clamp(L), K = J/I, E = C×J нь Excel-ийн
     *    томъёогоор БОДОГДОЖ бичигдэнэ; хэмжигдээгүй мөр/бүлэгт null хэвээр (дээрх дүрэм).
     *    n = 0 зам (бүдүүвч синтетикгүй) ЗӨВХӨН огноо/гүйцэтгэлийн багана огт байхгүй
     *    үйлчилгээнд л үлдэнэ.
     */
    /* ⚠️ 2026-10-08: `asOf` тохируулаагүй хуудсанд `I`/`K` нь `computeAll`-аас `null` ирнэ — 0 гэж
       архивлахгүй (`hyanaltStore`-ийн «төлөвлөгөөт хувь null болж бичигдэнэ» ⚠️). */
    a[sc.f.plan] = c[i].I;
    a[sc.f.act] = c[i].J;
    // ⚠️ Зарим багцад «Төлөвлөгөө биелэлт» ба «Одоо байгаа» багана огт
    //    байхгүй — байхгүй талбар руу бичвэл багц бүхэлдээ унана.
    if (sc.f.ratio) a[sc.f.ratio] = c[i].K;
    if (sc.f.wE) a[sc.f.wE] = c[i].E; // Одоо байгаа = C × Бодит гүйцэтгэл
    /*
     * ШАТЛАЛ — мөр БҮРД өөрийн гүнийг нь бичнэ.
     *
     * ⚠️ Энэ бол шатлалыг КОДООС (`bagts.trees.ts`) ӨГӨГДӨЛ рүү шилжүүлж
     * буй алхам. Багана нэмэгдсэний дараах ЭХНИЙ нийтлэлээр л хуудас
     * бүхэлдээ дүүрнэ; түүнээс хойш мөр нэмэх боломжтой болно (мөрийн тоо
     * зураглалын урттай зөрөх шаардлагагүй).
     *
     * ⚠️ Багана байхгүй үйлчилгээнд бичихгүй — байхгүй талбар руу бичвэл
     * багц бүхэлдээ унана.
     * ⚠️ 2026-09-23: `gun` одоо 18/18-д БИЙ (барилгын 10-д шинээр нэмэгдсэн,
     *    хоосон) — энэ салбар бүх багцад ажиллаж, анхны нийтлэлээр дүүргэнэ.
     */
    if (sc.f.gun) a[sc.f.gun] = r.depth;
    /*
     * ХУВИЙН ЖИН — ЗӨВХӨН ХООСОН үед бөглөнө.
     *
     * ⚠️ Хадгалагдсаныг ДАРЖ БИЧИХГҮЙ: `computeAll` нь бодож чадаагүй үедээ
     * хадгалагдсан утга руу нөөцлөн буцдаг тул дарж бичвэл тэр нөөц замыг
     * өөрийнхөө бодолтоор аажим гажуудуулна.
     *
     * ⚠️ ШИНЭ МӨРД ЭНЭ ЧУХАЛ: `ags.levelFromNo` нь бүхэл № + БУТАРХАЙ жинг
     * «навч (5)» гэж уншдаг. Жин хоосон бол тэр мөрийг «ангилал (3)» гэж
     * үзэж, `BuildingPanel.useTaskPerf`-ийн ажлын тоололд ОРОХГҮЙ үлдэнэ.
     */
    if (sc.f.wC && a[sc.f.wC] == null && c[i].C != null) a[sc.f.wC] = c[i].C;
    // Шинэчлэгдсэн огноо — excel-ийн лавлах нүд, зөвхөн 1-р мөрд.
    if (sc.f.asOf) a[sc.f.asOf] = i === 0 ? asOf : null;
    // АРХИВЫН ТҮЛХҮҮР — мөр БҮРД.
    if (sc.f.fillDate) a[sc.f.fillDate] = fillMs;
    return a;
  });
}

/**
 * АРХИВТ БИЧИХИЙН ӨМНӨХ СҮҮЛЧИЙН ХААЛГА — жаазны урт лавлахтайгаа таарах ёстой.
 *
 * ⚠️ ЯАГААД (2026-09-04-ний аудитын CRITICAL олдвор — Багц 3.1 · 9 давхар):
 *    суурь жаазанд № ба Ажил ХОЁУЛАА хоосон нэг мөр байсан; `loadRows` түүнийг
 *    мөр угсрах давталтад алгасдаг ч `expect`/`depthArr`-ыг алгасаагүй жаазаар
 *    боддог тул `rows` нь лавлахаас НЭГЭЭР богино гарав. Тэр богино жааз
 *    архивт бичигдээд, ДАРААГИЙН ачаалалт «1470 мөр ирлээ, 1471 байх ёстой»
 *    гэж hard throw хийж, бөглөх хуудас БА хянагчийн харагдац хоёулаа тэр
 *    багцад бүрмөсөн үхсэн. Бичигдсэний дараа илрэх нь хамгийн муу — тиймээс
 *    БИЧИХЭЭСЭЭ ӨМНӨ зогсооно.
 *
 * ⚠️ `expect <= 0` (зураглал байхгүй үйлчилгээ) бол шалгахгүй — байхгүй
 *    лавлахаар нийтлэлийг хааж болохгүй.
 *
 * ⚠️ ЛАВЛАХ НЬ `TREES[pkg.key].length` БИШ (энэ хамгаалалтын эхний
 *    хувилбарын алдаа): зураглал нь ХООСОН мөрийг тоолдог атлаа `loadRows`
 *    тэднийг алгасдаг тул Багц 3.1 · 9F-д жааз үргэлж 1,470 (зураглал 1,471)
 *    байх ба зураглалтай жишсэн шалгуур тэр багцын БАТЛАЛТЫГ МӨНХӨД хаадаг
 *    байв. Мөн ерөнхий менежерийн нэмсэн мөр зураглалд хуримтлагддаггүй тул
 *    мөр нэмэгдсэн БҮХ багц дараагийн батлалтад хаагдана. Дуудагч тал лавлахыг
 *    `loadRows(...).frameLen` (ачаалсан ЖИНХЭНЭ мөрийн тоо) + энэ илгээлтээр
 *    шинээр орсон мөрөөр өгнө.
 *
 * @param got    угсарсан жаазны мөрийн тоо
 * @param expect хүлээгдэх тоо (`loadRows(...).frameLen` + шинээр оруулсан мөр)
 * @param label  багцын нэр — алдааны бичвэрт
 */
export function assertFrameLength(got: number, expect: number, label: string): void {
  if (expect <= 0 || got === expect) return;
  throw new Error(
    tr(
      '«{0}»: архивт бичих жааз {1} мөр боловч лавлах {2} мөр байна — зөрүүтэй жааз бичвэл энэ багцын хуудас дараагийн ачаалалтад бүрмөсөн хаагдана. Архивт ЮУ Ч бичсэнгүй.',
      label,
      String(got),
      String(expect),
    ),
  );
}
