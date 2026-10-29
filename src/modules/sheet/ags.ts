// Хуваалцсан ArcGIS клиент — `agsFetch` (дурын URL руу POST/query хийх нимгэн
// бүрхүүл), `Feature` төрөл ба цэвэр функц `levelFromNo`.
//
import { arcgisPost } from '@/lib/query';

// ArcGIS returns HTTP 200 even on failure, with {error:{message}}. Check it.
export async function agsFetch(
  url: string,
  params: Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
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

