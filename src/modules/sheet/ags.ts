// Хуваалцсан ArcGIS клиент.
//
// ⚠️⚠️ 2026-08-27 — ЭНЭ ФАЙЛЫН ХОЁР ХЭСГИЙГ ЯЛГАЖ ОЙЛГО:
//
//   АМЬД (схемээс хараат БУС, чөлөөтэй хэрэглэ):
//     `agsFetch`  — дурын URL руу POST/query хийх нимгэн бүрхүүл
//     `levelFromNo`, `isHeaderAttrs`, `qesc`  — цэвэр функцүүд
//
//   ХОЙШЛУУЛСАН (`base` = `TASK_SHEET.url` — тэр үйлчилгээ ХААГДСАН, 499):
//     `base`, `queryAll`, `distinct`, `level5Rows`, `constructionByBagts`,
//     `applySections`, `ACTUAL`, `LEVEL5`, хавсралтын 4 функц
//   Эдгээрийг ЗӨВХӨН навигациас хасагдсан хуудсууд (Pivot · Wbs · Level5 ·
//   Conclusion — `Sheet.tsx`-ийн 2026-08-18-ны шийдвэр) л дууддаг. ШИНЭ КОДОД
//   ОГТ ХЭРЭГЛЭХГҮЙ — амьд гүйцэтгэлийн өгөгдөл нь `sheetRows.ts`-д байна
//   (`Bagts_*` бөглөх хуудсууд).
//
// ⚠️ 2026-08-29: `base` нь урьд нь `TASK_SHEET.url`-ээс ирдэг байсныг ЭНД
//    ШУУД бичив. Учир нь `TASK_SHEET`-ээс `url` талбар БҮРМӨСӨН хасагдсан:
//    тэр объект одоо зөвхөн талбарын нэрсийн бүрдэл бөгөөд амьд өгөгдөл нь
//    `Bagts_*` хуудсуудаас ирдэг. Хаягийг тэнд үлдээвэл «эх сурвалж нь энэ»
//    гэж уншигдаж, шинэ код үхсэн үйлчилгээ рүү хандана.
//
//    Энэ мөрийг АРХИВЫН зорилгоор л үлдээв — дээрх «ХОЙШЛУУЛСАН» функцууд
//    навигациас хасагдсан хуудсуудад л хэрэглэгддэг. Тэр үйлчилгээ 499
//    буцаадаг тул дуудвал алдаа гарна: ШИНЭ КОДОД ОГТ ХЭРЭГЛЭХГҮЙ.
import { t as tr } from "@/lib/i18nCore";
export const base =
  "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/Selbe_guitsetgel_consolidated/FeatureServer/0";

// ArcGIS returns HTTP 200 even on failure, with {error:{message}}. Check it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function agsFetch(
  url: string,
  params: Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, f: "json" }),
  });
  // ⚠️ Proxy/CDN-ийн 502 эсвэл HTML хариу «SyntaxError: Unexpected token <»
  // болж улаан баннерт гардаг байв — хүнд ойлгомжтой мессеж болгоно.
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error(tr('Үйлчилгээ JSON биш хариу буцаав — сүлжээгээ шалгана уу'));
  }
  if (json.error)
    throw new Error(
      json.error.message || json.error.details?.[0] || "ArcGIS error",
    );
  return json;
}

export type Feature = { attributes: Record<string, unknown> };

// The table also holds the Level-5 activity export (torol='level5', ~76k rows:
// one Primavera activity per block, no № hierarchy and a Нийт_жин of ~1e-5).
// This sheet edits the WBS rows only, so every query here filters to them —
// without it the level-5 rows outnumber the sheet 4:1 and take over its layout.
export const ACTUAL = "torol='actual'";
export const LEVEL5 = "torol='level5'";

/** Level-5 мөрүүд нэг багцаар. Багц бүр 7.5–16.7 мянган мөр — `queryAll` хуудаслана. */
export function level5Rows(bagts: string): Promise<Feature[]> {
  return queryAll(`bagts='${qesc(bagts)}' AND ${LEVEL5}`, {
    outFields:
      "dugaar,ajil,angilal_a,angilal_b,barilga_blok,niit_jin,guitsetgel,aldaatai",
  });
}

// Escape a value for an ArcGIS SQL where clause ('' = literal quote).
export const qesc = (v: string) => v.replace(/'/g, "''");

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
// ponytail: a lone leaf whose weight is exactly 1 would read as a category; if
// that ever appears, carry an explicit header flag from the import instead.
export function levelFromNo(no: unknown, weight: unknown): number | null {
  const s = String(no ?? "").trim();
  if (!s) return null;
  if (/^[A-Za-zА-Яа-яӨөҮү]\./.test(s)) return 1;
  if (/^[A-Za-zА-Яа-яӨөҮү]\d/.test(s)) return 2;
  if (/^\d+\.\d+/.test(s)) return 4;
  if (/^\d+$/.test(s)) {
    const w = weight == null || weight === "" ? null : Number(weight);
    return w == null || Math.abs(w - 1) < 1e-6 ? 3 : 5;
  }
  return null;
}

// A row is a section header when it isn't a leaf task. The consolidated table
// carries the true № hierarchy (`dugaar`), so a leaf is level 5; anything above
// is a header. Fall back to the legacy Түвшин/weight heuristic only if `dugaar`
// is missing.
export function isHeaderAttrs(a: Record<string, unknown>): boolean {
  const L = levelFromNo(a["dugaar"], a["huviin_jin"]);
  if (L != null) return L !== 5;
  const w = a["huviin_jin"] == null ? null : Number(a["huviin_jin"]);
  return Number(a["tuvshin"]) !== 3 || (w != null && Math.abs(w - 1) < 1e-6);
}

// The layer has no floor/section field, and job names repeat across floor
// sections (up to 11× per building), so (Түвшин, Ажил) alone is NOT a row
// identity — keying on it silently merges distinct floor rows. A leaf's section
// is the nearest header row above it in sheet order within its upload batch
// (Огноо|Хувилбар|Барилга_Блок, ObjectID ascending — callers must order the
// query that way). Stamp it into the otherwise-dead Ангилал__Б_ field so
// existing grouping keys become section-aware, and publish-added rows (which
// clone the attrs) persist it for real. Rows already carrying Ангилал__Б_
// (previously published with it) keep their stored value.
export function applySections(feats: Feature[]): void {
  const batches = new Map<string, Feature[]>();
  for (const f of feats) {
    const a = f.attributes;
    const k = `${a["ognoo"]}|${a["huvilbar"]}|${a["barilga_blok"]}`;
    const arr = batches.get(k);
    if (arr) arr.push(f);
    else batches.set(k, [f]);
  }
  for (const batch of batches.values()) {
    let sec: unknown = null;
    for (const f of batch) {
      const a = f.attributes;
      if (isHeaderAttrs(a)) {
        sec = a["ajil"];
        a["angilal_b"] = sec; // header keys off its own name
      } else if (a["angilal_b"] == null || a["angilal_b"] === "") {
        a["angilal_b"] = sec;
      }
    }
  }
}

// Query every matching row, paging past the 2000 maxRecordCount cap.
// (A single Багц's history now exceeds 2000, so a one-shot query truncates.)
//
// The default ORDER BY is not cosmetic: resultOffset paging without one is
// undefined in ArcGIS, so rows can repeat or vanish at a page boundary — and
// the failure is silent (a block quietly keeps an older value). Callers that
// need sheet order pass their own `orderByFields` and override this.
export async function queryAll(
  where: string,
  extra: Record<string, string> = {},
): Promise<Feature[]> {
  const out: Feature[] = [];
  for (let offset = 0; ; ) {
    const j = await agsFetch(`${base}/query`, {
      where,
      returnGeometry: "false",
      orderByFields: "OBJECTID ASC",
      resultRecordCount: "2000",
      resultOffset: String(offset),
      ...extra,
    });
    const fs = (j.features || []) as Feature[];
    out.push(...fs);
    if (!j.exceededTransferLimit || fs.length === 0) break;
    offset += fs.length;
  }
  return out;
}

// Distinct values of one field, optionally scoped by a where clause.
// ⚠️ maxRecordCount (2000) нь distinct-д ч үйлчилнэ — огнооны жагсаалт нийтлэл
// бүрээр урссаар нэг л өдөр таг тасарч, «сүүлийн огноо» хамгаалалт андуурна.
// Тиймээс queryAll шиг хуудаслана (orderBy — offset-ийн тогтвортой дараалал).
export async function distinct(field: string, where = "1=1") {
  const out: unknown[] = [];
  for (let offset = 0; ; ) {
    const j = await agsFetch(`${base}/query`, {
      where,
      outFields: field,
      returnDistinctValues: "true",
      returnGeometry: "false",
      orderByFields: `${field} ASC`,
      resultRecordCount: "2000",
      resultOffset: String(offset),
    });
    const fs = (j.features || []) as Feature[];
    out.push(...fs.map((f) => f.attributes[field]));
    // ⚠️ 40к таг: aggregated query дээр offset үл дэмжих үйлчилгээ ижил хуудсаа
    // давтвал мөнхийн давталтад орохоос сэргийлнэ.
    if (!j.exceededTransferLimit || fs.length === 0 || out.length > 40000) break;
    offset += fs.length;
  }
  return out;
}

// Live "барилга угсралтын явц" per Багц: the mean, across buildings, of the
// stored phase-"Б." header row (БАРИЛГА УГСРАЛТЫН АЖИЛ) at each Багц's latest
// snapshot. This is the construction-section rollup the source sheet already
// pre-computes into that header's cells — it excludes Бэлтгэл ажил (phase А.)
// and carries the sub-phase weights niit_jin can't, so it reproduces the Төсөл
// report's construction % (within the snapshot-date gap). Returns { bagts: 0..1 }.
export async function constructionByBagts(): Promise<Record<string, number>> {
  const feats = await queryAll("dugaar='Б.' AND barilga_blok IS NOT NULL", {
    outFields: "bagts,ognoo,barilga_blok,guitsetgel",
  });
  // Keep only each Багц's latest ognoo, then average its building cells.
  const latest = new Map<string, string>();
  for (const f of feats) {
    const b = String(f.attributes.bagts);
    const d = String(f.attributes.ognoo);
    if (!latest.has(b) || d > latest.get(b)!) latest.set(b, d);
  }
  const sum = new Map<string, number>();
  const cnt = new Map<string, number>();
  for (const f of feats) {
    const a = f.attributes;
    const b = String(a.bagts);
    if (String(a.ognoo) !== latest.get(b)) continue;
    if (a.guitsetgel == null) continue; // guard null cells
    sum.set(b, (sum.get(b) ?? 0) + Number(a.guitsetgel));
    cnt.set(b, (cnt.get(b) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const [b, c] of cnt) if (c) out[b] = sum.get(b)! / c;
  return out;
}

// --- Attachments (per feature/ObjectID). Layer must have attachments enabled
// in ArcGIS Online, else these return an "attachments not supported" error. ---
export type AttachInfo = {
  id: number;
  name: string;
  contentType: string;
  size: number;
};

export async function listAttachments(oid: number): Promise<AttachInfo[]> {
  const res = await fetch(`${base}/${oid}/attachments?f=json`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "ArcGIS error");
  return j.attachmentInfos || [];
}

// Multipart upload — can't reuse agsFetch (urlencoded).
export async function addAttachment(oid: number, file: File) {
  const fd = new FormData();
  fd.append("attachment", file);
  fd.append("f", "json");
  const res = await fetch(`${base}/${oid}/addAttachment`, {
    method: "POST",
    body: fd,
  });
  const j = await res.json();
  if (j.error || j.addAttachmentResult?.success === false)
    throw new Error(j.error?.message || "add attachment failed");
}

export async function deleteAttachment(oid: number, id: number) {
  const j = await agsFetch(`${base}/${oid}/deleteAttachments`, {
    attachmentIds: String(id),
  });
  if (j.deleteAttachmentResults?.[0]?.success === false)
    throw new Error("delete attachment failed");
}

// Raw image bytes for <img src> (CORS is open).
export const attachmentUrl = (oid: number, id: number) =>
  `${base}/${oid}/attachments/${id}`;
