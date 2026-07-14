/** Тоо, нэгжийн форматлагч — портал даяар нэг дүрэм. */

const L = 'en-US';

export const num = (v: number | null | undefined, d = 0): string =>
  v == null || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString(L, { minimumFractionDigits: d, maximumFractionDigits: d });

/** 13.4% */
export const pct = (v: number | null | undefined, d = 1): string =>
  v == null || !Number.isFinite(v) ? '—' : `${num(v, d)}%`;

/** м² → га */
export const ha = (m2: number | null | undefined, d = 1): string =>
  m2 == null || !Number.isFinite(m2) ? '—' : num(m2 / 10_000, d);

/** метр → км */
export const km = (m: number | null | undefined, d = 1): string =>
  m == null || !Number.isFinite(m) ? '—' : num(m / 1_000, d);

/** Төгрөг — том дүнг богиносгоно. 1,270,669,647,005 → «1.27 их наяд ₮» */
export function mnt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return `${num(v / 1e12, 2)} их наяд ₮`;
  if (a >= 1e9) return `${num(v / 1e9, 1)} тэрбум ₮`;
  if (a >= 1e6) return `${num(v / 1e6, 1)} сая ₮`;
  return `${num(v)} ₮`;
}

/** Богино төгрөг — хүснэгтэд: 448.7 тэрбум */
export function mntShort(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return `${num(v / 1e12, 2)} их наяд`;
  if (a >= 1e9) return `${num(v / 1e9, 1)} тэрбум`;
  if (a >= 1e6) return `${num(v / 1e6, 1)} сая`;
  return num(v);
}

/** Огноо: ArcGIS epoch (мс), "2026-07-14" эсвэл DateOnly */
export function date(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  const dt = typeof v === 'number' ? new Date(v) : new Date(String(v));
  if (Number.isNaN(dt.getTime())) return String(v);
  return dt.toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** ArcGIS-ийн хоосон утга: null, "" эсвэл зөвхөн зай */
export const blank = (v: unknown): boolean =>
  v == null || (typeof v === 'string' && v.trim() === '');

/** Текст утгыг цэвэрлэх — хоосон бол өгсөн орлуулагч */
export const text = (v: unknown, fallback = '—'): string =>
  blank(v) ? fallback : String(v).trim();
