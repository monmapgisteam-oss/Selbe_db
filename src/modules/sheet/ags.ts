// Shared ArcGIS client. `base` points straight at the public hosted layer
// (FeatureServer/0). CORS is open and no token is needed.
export const base =
  "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/Tusliin_guitsetgel_master/FeatureServer/0";

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
  const json = await res.json();
  if (json.error)
    throw new Error(
      json.error.message || json.error.details?.[0] || "ArcGIS error",
    );
  return json;
}

export type Feature = { attributes: Record<string, unknown> };

// Escape a value for an ArcGIS SQL where clause ('' = literal quote).
export const qesc = (v: string) => v.replace(/'/g, "''");

// A row is a section header when it isn't a leaf task: leaves are Түвшин 3
// with a fractional weight. Түвшин is the signal, not the weight — some floor
// headers carry junk weights (8-р давхар w=2, 9-р w=0). The "СУУРИЙН АЖИЛ"
// style Түвшин-3 section rows do carry weight exactly 1.
export function isHeaderAttrs(a: Record<string, unknown>): boolean {
  const w = a["Хувийн_жин"] == null ? null : Number(a["Хувийн_жин"]);
  return Number(a["Түвшин"]) !== 3 || (w != null && Math.abs(w - 1) < 1e-6);
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
    const k = `${a["Огноо"]}|${a["Хувилбар"]}|${a["Барилга_Блок"]}`;
    const arr = batches.get(k);
    if (arr) arr.push(f);
    else batches.set(k, [f]);
  }
  for (const batch of batches.values()) {
    let sec: unknown = null;
    for (const f of batch) {
      const a = f.attributes;
      if (isHeaderAttrs(a)) {
        sec = a["Ажил"];
        a["Ангилал__Б_"] = sec; // header keys off its own name
      } else if (a["Ангилал__Б_"] == null || a["Ангилал__Б_"] === "") {
        a["Ангилал__Б_"] = sec;
      }
    }
  }
}

// Fields ArcGIS manages itself — never copy these when cloning a feature.
// A fresh insert gets its own ObjectID, and editor tracking stamps
// CreationDate/EditDate (the "filled date and hour") automatically.
export const SYSTEM_FIELDS = new Set([
  "ObjectID",
  "OBJECTID",
  "GlobalID",
  "CreationDate",
  "Creator",
  "EditDate",
  "Editor",
]);

// Copy a feature's data attributes for a new daily snapshot: drop the
// system-managed fields and stamp the new date on the date field.
export function cloneForDate(
  attrs: Record<string, unknown>,
  dateField: string,
  date: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs))
    if (!SYSTEM_FIELDS.has(k)) out[k] = v;
  out[dateField] = date;
  return out;
}

// Query every matching row, paging past the 2000 maxRecordCount cap.
// (A single Багц's history now exceeds 2000, so a one-shot query truncates.)
export async function queryAll(
  where: string,
  extra: Record<string, string> = {},
): Promise<Feature[]> {
  const out: Feature[] = [];
  for (let offset = 0; ; ) {
    const j = await agsFetch(`${base}/query`, {
      where,
      returnGeometry: "false",
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
export async function distinct(field: string, where = "1=1") {
  const j = await agsFetch(`${base}/query`, {
    where,
    outFields: field,
    returnDistinctValues: "true",
    returnGeometry: "false",
  });
  return ((j.features || []) as Feature[]).map((f) => f.attributes[field]);
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
