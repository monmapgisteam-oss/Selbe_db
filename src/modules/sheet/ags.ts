// Хуваалцсан ArcGIS клиент — `agsFetch` (дурын URL руу POST/query хийх нимгэн
// бүрхүүл), `Feature` төрөл ба цэвэр функц `levelFromNo`.
//
// ⚠️ 2026-10-09 (аудит №3): хаалттай (499) `Selbe_guitsetgel_consolidated`
//    үйлчилгээнд уягдсан ХОЙШЛУУЛСАН хэсэг (`base`, `queryAll`, `distinct`,
//    `level5Rows`, `constructionByBagts`, `applySections`, `isHeaderAttrs`, `qesc`,
//    `ACTUAL`, `LEVEL5`) импортлогчгүй болсон тул УСТГАВ. Хавсралтын 4 функц мөн
//    2026-10-09-нд устгагдсан (доорх ⚠️). Амьд гүйцэтгэлийн өгөгдөл нь `sheetRows.ts`-д
//    (`Bagts_*` бөглөх хуудсууд). Хаалттай үйлчилгээний хаягийг ЭНД БУЦААЖ БҮҮ бич.
import { arcgisPost } from '@/lib/query';

// ArcGIS returns HTTP 200 even on failure, with {error:{message}}. Check it.
export async function agsFetch(
  url: string,
  params: Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  /* ⚠️ 2026-09-29 (хэрэглэгч: «илгээхэд Invalid token»): токен богино хугацаатай
     (PKCE) — хүсэлтийн ӨМНӨ шинэчилж, токены алдаанд (498/499) НЭГ удаа дахин оролдоно
     (`authToken.ensureFreshToken`-ийн ⚠️).
     ⚠️ 2026-09-30: биелэлт нь `query.arcgisPost` (нэг цөм: `res.ok`, JSON биш хариу,
     200-аар ирдэг `{error}`, 30с timeout, 429/503 backoff, 498 шинэчлэлт). Алдаа нь
     `ArcGISError` — `code`-ыг ХАДГАЛНА (2026-09-25): дуудагч түр (429/5xx) ба
     тогтвортой (498/499/403) алдааг ялгаж дахин оролдоно (`sheetRows.schemaOf`).
     ⚠️ 2026-09-30 (сүлжээний аудит): СЛОТ ЭНД — цөм өөрөө хязгаарлагчийн слот авна.
     Урьд нь `slot: false` байсан: `sheetRows.schemaOf` энэ функцийг `withSlot`
     ДОТРООС дууддаг байв (давхар авбал бүх слот гаднах бүрхүүлд эзлэгдэхэд дотоод
     хүсэлт мөнхөд хүлээж ГАЦНА). Тэр гаднах `withSlot` хасагдсан тул ДҮРЭМ:
     `agsFetch`-ийг `withSlot` дотроос ХЭЗЭЭ Ч дуудахгүй. */
  return arcgisPost(url, params);
}

export type Feature = { attributes: Record<string, unknown> };

// Hierarchy level (1..5) from the sheet's № code — excel column A, the source
// of truth. The ArcGIS import must carry it verbatim as `Дугаар`; the flat
// `Түвшин` field (1/3/4) can't reproduce the tree (it drops phase/sub-phase and
// merges categories with leaves). Depth lives in the NUMBER FORMAT, not row
// position — the tree is ragged (a category may hold leaves directly, no group):
//   "A." / "Б."   phase           -> 1
//   "Б1".."Б5"    sub-phase       -> 2
//   "1".."11"     category header -> 3   (integer, a header)
//   "N.M"         group / давхар  -> 4   (decimal, e.g. "3.4")
//   "1","2",...   leaf task       -> 5   (integer, fractional weight)
// The integer form is BOTH category (3) and leaf (5); weight splits them —
// headers carry weight 1 (or blank), leaves a fraction. Verified against the
// 71-9F sheet: 2 phases + 5 sub-phases + 11 categories + 14 groups + 132 leaves,
// and its only int-weight-1 row is a genuine category.
// ⚠️ ГАНЦ НАВЧ (2026-09-25-ны аудит): бүлгийнхээ цорын ганц хүүхэд болох навч
//    нь жин = 1 тул ангилал (3) шиг уншигддаг — TREES-д барилгын хуудас бүрд
//    1–6 ширхэг БАЙГАА (урьд нь «ийм зүйл гарвал» гэж тэмдэглэсэн байв).
//    Жин ганцаараа ялгаж чадахгүй тул дуудагч ДАРААГИЙН мөрийн контекстыг
//    `nextDeeper`-ээр өгнө: `false` (дараагийн мөр гүн БИШ → хүүхэдгүй) бол
//    жин-1 бүхэл № нь навч (5). `undefined`/`null` (контекстгүй дуудагч —
//    `Pivot`) бол хуучин дүрэм. Жингүй бүхэл № ҮРГЭЛЖ 3 — А.-ийн 8 жингүй мөр
//    навчийн тоололд орох ёсгүй (`monitor.check`).
export function levelFromNo(no: unknown, weight: unknown, nextDeeper?: boolean | null): number | null {
  const s = String(no ?? "").trim();
  if (!s) return null;
  if (/^[A-Za-zА-Яа-яӨөҮү]\./.test(s)) return 1;
  if (/^[A-Za-zА-Яа-яӨөҮү]\d/.test(s)) return 2;
  if (/^\d+\.\d+/.test(s)) return 4;
  if (/^\d+$/.test(s)) {
    const w = weight == null || weight === "" ? null : Number(weight);
    if (w == null) return 3;
    if (Math.abs(w - 1) < 1e-6) return nextDeeper === false ? 5 : 3;
    return 5;
  }
  return null;
}

// ⚠️ 2026-10-09: хавсралтын 4 функц (listAttachments · addAttachment · deleteAttachment ·
//    attachmentUrl) УСТГАГДАВ — хаалттай (499) `base` үйлчилгээ рүү чиглэдэг, дуудагч нь
//    зөвхөн устгагдсан Conclusion байв. `attachmentUrl` нь токеныг `<img src>`-ийн query
//    string-д залгадаг байсан (CWE-598). Хавсралт татах бол `uzlegReport.fetchAttachment` (POST).
