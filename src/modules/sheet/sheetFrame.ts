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
 *    `hyanaltStore.apply` (ерөнхий менежерийн зөвшөөрөл) дотроос дуудагдана.
 * ⚠️ Хуулж авсан бүх `⚠️` тайлбар нь эх кодтойгоо ХАМТ явна — тэдгээр нь
 *    буцаагдаж болохгүй шийдвэрүүд (гүн, огноо, жин, `null ≠ 0`).
 */
import { cellObyem, computeAll, dayToMs, type SheetRow } from "./bagtsSheet";
import type { Schema } from "./bagts.pkg";
import type { NewRow, SubmissionPayload } from "@/lib/submission";
import { t as tr } from "@/lib/i18nCore";

/** Нэмсэн мөрийн төрөл — ЦОРЫН ГАНЦ эх сурвалж нь `submission.ts`. */
export type { NewRow } from "@/lib/submission";

/** Бүлгийн СҮҮЛИЙН удмын дараах индекс — сүүлчийн аргын байрлал. */
const afterGroup = (list: SheetRow[], p: number) => {
  const d = list[p].depth;
  let i = p + 1;
  while (i < list.length && list[i].depth > d) i += 1;
  return i;
};

/**
 * ШИНЭ МӨРИЙГ ОРУУЛАХ БАЙРЛАЛ — ЖИНХЭНЭ АХ ДҮҮГИЙНХЭЭ АРД.
 *
 * ⚠️ ГҮН НЬ ӨГӨГДӨЛД ХАДГАЛАГДДАГГҮЙ: `gun` багана 10/10 үйлчилгээнд алга
 *    тул нийтлэхийн `if (sc.f.gun)` салбар хэзээ ч ажилладаггүй. Дараагийн
 *    ачаалалтад `bagtsSheet.alignInsertions` нэмсэн мөрийг `-1` гэж таниад
 *    гүнийг нь ӨМНӨХ МӨРИЙНХӨӨР авна (`depthArr[i-1]`). bagtsSheet.ts-ийн
 *    тайлбар үүнийг «нэмсэн мөр ах дүүгийнхээ ард залгагдана» гэсэн таамаг
 *    дээр үндэслэсэн.
 *
 * ⚠️ Урьд нь мөрийг бүлгийн БҮХ УДМЫН ард (`afterGroup`) тавьдаг байсан тул
 *    өмнөх мөр нь ах дүү биш, хамгийн сүүлийн АЧ мөр байв. Үр дүнд нь
 *    нийтэлсний ДАРАА шинэ ажил өөр (илүү гүн) дэд бүлгийн хүүхэд болж
 *    хувирч, мөнгөн дүн ба хувийн жин нь өөр салбарт наалддаг байлаа —
 *    нийтлэхийн өмнөх ба дараах тоо бүхэл салбартаа зөрнө.
 *
 * Тиймээс өмнөх мөр нь ЯГ `d+1` гүнтэй байх байрлалыг сонгоно: тэр нь
 * УДАМГҮЙ шууд хүүхдийн ард. `null` = тийм байрлал алга (бүлэг хоосон,
 * эсвэл шууд хүүхэд бүр өөрөө дэд бүлэг) — тэнд нэмсэн мөр өгөгдөлд
 * амьд үлдэхгүй.
 */
const siblingSlot = (list: SheetRow[], p: number): number | null => {
  const d = list[p].depth;
  let slot: number | null = null;
  for (let i = p + 1; i < list.length && list[i].depth > d; i += 1) {
    if (list[i].depth !== d + 1) continue;            // ач мөр — алгасна
    const next = list[i + 1];
    if (!next || next.depth <= d + 1) slot = i + 1;   // удамгүй ах дүү
  }
  return slot;
};

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
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i];
    if (r.group && r.no === a.parentNo && r.work === a.parentWork) cands.push(i);
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
export function insertAdds(
  base: SheetRow[],
  adds: NewRow[],
  sc: Schema,
  nBld: number,
): SheetRow[] {
  if (!adds.length || !sc || !nBld) return base;
  const out = base.slice();
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
    const at = siblingSlot(out, p) ?? afterGroup(out, p);
    out.splice(at, 0, {
      oid: a.oid,
      no: a.no,
      /* ⚠️ Ажлын код нь СЕРВЕР дээр агшин бүрд 1…N-ээр дүүрдэг тул
         нийтлээгүй шинэ мөрд хараахан БАЙХГҮЙ — `null`. Энд өөрсдөө
         таамаглаж дугаар өгвөл нийтлэхэд серверийнхтэй зөрнө. */
      des: null,
      ham: null,
      work: a.work,
      depth: at > 0 ? out[at - 1].depth : parent.depth + 1,
      group: false,
      // ⚠️ Жин/мөнгө ОРОХГҮЙ — `computeAll` Обьём×Нэгж өртгөөс өөрөө бодно.
      wC: null,
      wD: null,
      vol: a.vol,
      unit: a.unit,
      money: null,
      act: new Array(nBld).fill(null),
      obyem: new Array(nBld).fill(null),
      start: new Array(nBld).fill(null),
      end: new Array(nBld).fill(null),
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
 * давхардвал `rowKeys` дахь (хуучин) байрлалд хамгийн ойрхныг сонгоно.
 *
 * ⚠️ Зөөлт ШААРДЛАГАТАЙ эсэхийг ЭНЭ функц шийдэхгүй — дуудагч шийднэ
 *    (`publish`: `freshRows[0].oid !== rows[0].oid`; `overlaySubmission`:
 *    rowKeys-ийн oid rows-д байхгүй). Хэрэггүй үед ХООСОН map дамжуулбал
 *    `moveKeys` түлхүүрийг хэвээр үлдээнэ.
 */
export function buildOidMap(
  rowKeys: [number, string][],
  freshRows: SheetRow[],
): Map<number, number> {
  const map = new Map<number, number>();
  if (!rowKeys.length || !freshRows.length) return map;
  const byKey = new Map<string, number[]>();
  freshRows.forEach((r, i) => {
    const k = rowKeyOf(r);
    const l = byKey.get(k);
    if (l) l.push(i);
    else byKey.set(k, [i]);
  });
  rowKeys.forEach(([oid, key], i) => {
    const cand = byKey.get(key);
    if (!cand?.length) return;
    let best = cand[0];
    for (const j of cand) if (Math.abs(j - i) < Math.abs(best - i)) best = j;
    map.set(oid, freshRows[best].oid);
  });
  return map;
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
    const oid = Number(k.slice(0, at));
    if (!map.size || oid < 0) {
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
  const map = needMap ? buildOidMap(rowKeys, rows) : new Map<number, number>();
  const mc = moveKeys(map, Object.fromEntries(sub.cells ?? []));
  const md = moveKeys(map, Object.fromEntries(sub.dates ?? []));
  let unmoved = mc.unmoved.length + md.unmoved.length;

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
    start: r.start.slice(),
    end: r.end.slice(),
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
    const i = rowOf(Number(k.slice(0, at)));
    /* ⚠️ Мөр эсвэл блок олдохгүй бол ЧИМЭЭГҮЙ хаяхгүй — `unmoved`-д тоолно
       (ноорог/илгээлтийн түлхүүр хуучирсан, rowKeys алга г.м.). */
    if (i == null || !Number.isInteger(b) || b < 0 || b >= nBld) {
      unmoved += 1;
      continue;
    }
    const r = out[i];
    const key = withOid(k, at, r.oid);
    // `cellObyem`-ийн ДҮРЭМ ЯГ өөрөө — нэг мөрийн засвар мэт дамжуулна.
    r.obyem[b] = cellObyem(r, b, { [key]: v });
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
      unmoved += 1;
      continue;
    }
    const r = out[i];
    // `pickDate`-ийн дүрэм: засвар байвал `dayToMs` ("" → null).
    if (se === "s") r.start[b] = dayToMs(v);
    else r.end[b] = dayToMs(v);
    dateKeys.push(withOid(k, at, r.oid));
  }

  return { rows: out, asOf: sub.asOf ?? null, cellKeys, dateKeys, unmoved };
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
  asOf: number,
  hasObyem: readonly boolean[],
  fillMs: number,
  pending: Record<string, string> = {},
  pendDate: Record<string, string> = {},
): Record<string, unknown>[] {
  if (!sc.f.fillDate)
    throw new Error(
      tr('«buglusun_ognoo» багана энэ үйлчилгээнд алга — архив үүсгэх боломжгүй тул нийтлэлийг зогсоов (AGOL дээр багана нэмнэ үү).'),
    );
  const c = computeAll(rows, nBld, asOf, pending, pendDate, hasObyem);

  return rows.map((r, i) => {
    // Мэддэггүй багана ч хуулбарт үлдэхийн тулд БҮХ талбараас эхэлнэ.
    const a: Record<string, unknown> = { ...r.raw };
    for (let b = 0; b < nBld; b++) {
      a[sc.act[b]] = c[i].act[b];
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
    }
    // ОБЬЁМЫН НИЙЛБЭР — талбар байвал л бичнэ (шинэ багана, 10/10 багцад бий)
    if (sc.f.obyemSum) a[sc.f.obyemSum] = c[i].obyemSum;
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
