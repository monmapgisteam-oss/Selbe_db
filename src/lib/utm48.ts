/**
 * WGS84 ↔ UTM 48N (EPSG:32648) ↔ Web Mercator (EPSG:3857) — сүлжээгүй, SDK-гүй цэвэр тооцоо.
 *
 * 2026-10-14 (хэрэглэгч: «баруун товшиход WGS болон UTM 48-аар буюу координатаар цэг тавьдаг»).
 * Сэлбэ нь 48-р бүсэд (төв меридиан 105°E) — инженерийн зураг, геодезийн хэмжилт энэ бүсээр.
 *
 * ⚠️ Томьёо: Krüger-ийн цуваа (6-р эрэмбэ хүртэл, Karney 2011) — 48-р бүсийн хүрээнд
 *    ≪1 мм нарийвчлалтай. `@arcgis/core/geometry/projection` нь асинхрон ачаалалтай (WASM)
 *    тул маягтын шууд хөрвүүлэлтэд хэрэглэхгүй.
 */

const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const E0 = 500000;
/** 48-р бүсийн төв меридиан */
export const UTM48_LON0 = 105;

const N_ = F / (2 - F);
const A_ = (A / (1 + N_)) * (1 + N_ ** 2 / 4 + N_ ** 4 / 64 + N_ ** 6 / 256);
const ALPHA = [
  N_ / 2 - (2 / 3) * N_ ** 2 + (5 / 16) * N_ ** 3 + (41 / 180) * N_ ** 4 - (127 / 288) * N_ ** 5 + (7891 / 37800) * N_ ** 6,
  (13 / 48) * N_ ** 2 - (3 / 5) * N_ ** 3 + (557 / 1440) * N_ ** 4 + (281 / 630) * N_ ** 5 - (1983433 / 1935360) * N_ ** 6,
  (61 / 240) * N_ ** 3 - (103 / 140) * N_ ** 4 + (15061 / 26880) * N_ ** 5 + (167603 / 181440) * N_ ** 6,
  (49561 / 161280) * N_ ** 4 - (179 / 168) * N_ ** 5 + (6601661 / 7257600) * N_ ** 6,
  (34729 / 80640) * N_ ** 5 - (3418889 / 1995840) * N_ ** 6,
  (212378941 / 319334400) * N_ ** 6,
];
const BETA = [
  N_ / 2 - (2 / 3) * N_ ** 2 + (37 / 96) * N_ ** 3 - (1 / 360) * N_ ** 4 - (81 / 512) * N_ ** 5 + (96199 / 604800) * N_ ** 6,
  (1 / 48) * N_ ** 2 + (1 / 15) * N_ ** 3 - (437 / 1440) * N_ ** 4 + (46 / 105) * N_ ** 5 - (1118711 / 3870720) * N_ ** 6,
  (17 / 480) * N_ ** 3 - (37 / 840) * N_ ** 4 - (209 / 4480) * N_ ** 5 + (5569 / 90720) * N_ ** 6,
  (4397 / 161280) * N_ ** 4 - (11 / 504) * N_ ** 5 - (830251 / 7257600) * N_ ** 6,
  (4583 / 161280) * N_ ** 5 - (108847 / 3991680) * N_ ** 6,
  (20648693 / 638668800) * N_ ** 6,
];
const ECC = Math.sqrt(F * (2 - F));
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** WGS84 (өргөрөг, уртраг, градус) → UTM 48N (зүүн, хойд, метр) */
export function toUtm48(lat: number, lon: number): { e: number; n: number } {
  const phi = rad(lat);
  const lam = rad(lon - UTM48_LON0);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - ECC * Math.atanh(ECC * Math.sin(phi)));
  const xi1 = Math.atan2(t, Math.cos(lam));
  const eta1 = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let xi = xi1;
  let eta = eta1;
  for (let j = 1; j <= 6; j += 1) {
    xi += ALPHA[j - 1] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1);
    eta += ALPHA[j - 1] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1);
  }
  return { e: E0 + K0 * A_ * eta, n: K0 * A_ * xi };
}

/** UTM 48N (зүүн, хойд, метр) → WGS84 (өргөрөг, уртраг, градус) */
export function fromUtm48(e: number, n: number): { lat: number; lon: number } {
  const xi1 = n / (K0 * A_);
  const eta1 = (e - E0) / (K0 * A_);
  let xi = xi1;
  let eta = eta1;
  for (let j = 1; j <= 6; j += 1) {
    xi -= BETA[j - 1] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1);
    eta -= BETA[j - 1] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1);
  }
  const chi = Math.asin(Math.sin(xi) / Math.cosh(eta));
  /* Конформ өргөрөгөөс геодезийн өргөрөг — Ньютоны давталт */
  const tc = Math.tan(chi);
  let tp = tc;
  for (let i = 0; i < 6; i += 1) {
    const s = Math.sinh(ECC * Math.atanh(ECC * tp / Math.sqrt(1 + tp * tp)));
    const tcur = tp * Math.sqrt(1 + s * s) - s * Math.sqrt(1 + tp * tp);
    const dt = ((tc - tcur) / Math.sqrt(1 + tcur * tcur))
      * ((1 + (1 - ECC * ECC) * tp * tp) / ((1 - ECC * ECC) * Math.sqrt(1 + tp * tp)));
    tp += dt;
    if (Math.abs(dt) < 1e-14) break;
  }
  return { lat: deg(Math.atan(tp)), lon: UTM48_LON0 + deg(Math.atan2(Math.sinh(eta), Math.cos(xi))) };
}

const R_WM = 6378137;
/** WGS84 → Web Mercator (EPSG:3857) — газрын зургийн SR, зурсан дүрстэй ИЖИЛ */
export function toWebMercator(lat: number, lon: number): { x: number; y: number } {
  return { x: R_WM * rad(lon), y: R_WM * Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2)) };
}

/** Web Mercator → WGS84 */
export function fromWebMercator(x: number, y: number): { lat: number; lon: number } {
  return { lon: deg(x / R_WM), lat: deg(2 * Math.atan(Math.exp(y / R_WM)) - Math.PI / 2) };
}

/** Монголын хүрээнд байгаа эсэх — гар алдааны (өргөрөг/уртраг сольсон г.м.) шалгуур */
export const inMongolia = (lat: number, lon: number): boolean =>
  lat >= 41 && lat <= 52.5 && lon >= 87 && lon <= 120.5;
