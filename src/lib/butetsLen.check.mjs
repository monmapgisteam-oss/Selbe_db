/**
 * ДЭД БҮТЦИЙН ГЕОМЕТРИЙН УРТ / ТАЛБАЙ — SR-ЭЭС ХАМААРАХ ДҮРЭМ (2026-10-01).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/butetsLen.check.mjs
 *
 * Хамгаалж буй алдаа:
 *  1. Web Mercator-ын ХАВТГАЙ уртыг (энэ өргөрөгт ~1.49 дахин их) метр гэж бичих —
 *     зурсан шинэ шугамын `Urt_m` 49%-иар хэтэрнэ. Геодезийн урт нь Vincenty-тэй
 *     (БИЕ ДААСАН алгоритм, энэ файлд) мм-ийн нарийвчлалаар таарах ёстой.
 *  2. Проекцолсон (UTM 32648) давхаргад геодезийн тооцоо хийх — `Shape__Length`-тэй зөрнө;
 *     тэнд хавтгай (Евклид) урт.
 *  3. Хоосон/танихгүй геометрт 0 буцаах (null ≠ 0).
 *  4. Уртын талбарын нэгж: `*_km` / давхаргын `qty.unit === 'км'` → км-ээр бөглөх.
 *  5. Бүхэл тоон уртын талбарт бутархай бичих (`validateRow` татгалзана).
 */
import assert from 'node:assert/strict';
import {
  srKind, measureKind, geomLengthM, geomAreaM2, lenFieldUnit, lenFieldValue, geomWkid,
} from './butetsLen.ts';

/* ── Бие даасан ЛАВЛАГАА: Vincenty-ийн урвуу бодлого (WGS84) ── */
function vincenty(lon1, lat1, lon2, lat2) {
  const a = 6378137, f = 1 / 298.257223563, b = a * (1 - f);
  const r = Math.PI / 180;
  const L = (lon2 - lon1) * r;
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * r));
  const U2 = Math.atan((1 - f) * Math.tan(lat2 * r));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, prev, sS, cS, sig, sA, c2A, c2Sm;
  let it = 0;
  do {
    const sL = Math.sin(lam), cL = Math.cos(lam);
    sS = Math.sqrt((cU2 * sL) ** 2 + (cU1 * sU2 - sU1 * cU2 * cL) ** 2);
    if (sS === 0) return 0;
    cS = sU1 * sU2 + cU1 * cU2 * cL;
    sig = Math.atan2(sS, cS);
    sA = (cU1 * cU2 * sL) / sS;
    c2A = 1 - sA * sA;
    c2Sm = c2A ? cS - (2 * sU1 * sU2) / c2A : 0;
    const C = (f / 16) * c2A * (4 + f * (4 - 3 * c2A));
    prev = lam;
    lam = L + (1 - C) * f * sA * (sig + C * sS * (c2Sm + C * cS * (-1 + 2 * c2Sm * c2Sm)));
  } while (Math.abs(lam - prev) > 1e-12 && ++it < 200);
  const u2 = (c2A * (a * a - b * b)) / (b * b);
  const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = B * sS * (c2Sm + (B / 4) * (cS * (-1 + 2 * c2Sm * c2Sm)
    - (B / 6) * c2Sm * (-3 + 4 * sS * sS) * (-3 + 4 * c2Sm * c2Sm)));
  return b * A * (sig - dS);
}
const R = 6378137;
const merc = (lon, lat) => [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2))];

/* ══════════ 1. SR-ийн ангилал ══════════ */
assert.equal(srKind(102100), 'webmerc');
assert.equal(srKind(3857), 'webmerc');
assert.equal(srKind(4326), 'geographic');
assert.equal(srKind(32648), 'projected', 'UTM 48N — инженерийн давхаргын SR');
assert.equal(srKind(null), 'unknown');
assert.equal(measureKind(32648), 'planar');
assert.equal(measureKind(102100), 'geodesic', 'Web Mercator-т Shape__Length ХЭРЭГЛЭХГҮЙ');
assert.equal(measureKind(undefined), 'geodesic', 'мэдэгдэхгүй SR — аюулгүй тал');
assert.equal(geomWkid({ spatialReference: { wkid: 102100, latestWkid: 3857 } }), 3857);

/* ══════════ 2. Web Mercator → ГЕОДЕЗИЙН урт (Сэлбэ орчим, ~47.9°N) ══════════ */
{
  const pts = [[106.90, 47.90], [106.93, 47.915], [106.95, 47.93]];
  const g = { paths: [pts.map(([lon, lat]) => merc(lon, lat))], spatialReference: { wkid: 102100 } };
  const ref = vincenty(...pts[0], ...pts[1]) + vincenty(...pts[1], ...pts[2]);
  const got = geomLengthM(g);
  assert.ok(Math.abs(got - ref) < 0.01, `геодезийн урт ${got} ≈ Vincenty ${ref} (< 1 см)`);
  /* Хавтгай Web Mercator урт нь ~1.49 дахин хэтэрхий — тэрийг БУЦААХГҮЙ */
  const flat = Math.hypot(g.paths[0][1][0] - g.paths[0][0][0], g.paths[0][1][1] - g.paths[0][0][1])
    + Math.hypot(g.paths[0][2][0] - g.paths[0][1][0], g.paths[0][2][1] - g.paths[0][1][1]);
  assert.ok(flat / got > 1.45 && flat / got < 1.52, `Web Mercator-ын хавтгай урт хэтэрхий: ${flat / got}`);
}
/* Урт хэрчим (5 км) — хуваалтын ачаар нарийвчлал хэвээр */
{
  const a = [106.80, 47.85], b = [106.86, 47.88];
  const g = { paths: [[merc(...a), merc(...b)]], spatialReference: { wkid: 3857 } };
  const ref = vincenty(...a, ...b);
  assert.ok(Math.abs(geomLengthM(g) - ref) / ref < 1e-6, 'урт хэрчимд харьцангуй алдаа < 1e-6');
}
/* Газарзүйн (4326) — шууд өргөрөг/уртраг */
{
  const g = { paths: [[[106.9, 47.9], [106.9, 47.91]]], spatialReference: { wkid: 4326 } };
  assert.ok(Math.abs(geomLengthM(g) - vincenty(106.9, 47.9, 106.9, 47.91)) < 0.005);
}

/* ══════════ 3. Проекцолсон (UTM) → ХАВТГАЙ ══════════ */
{
  const g = { paths: [[[600000, 5300000], [600300, 5300400]], [[0, 0], [0, 10]]], spatialReference: { wkid: 32648 } };
  assert.equal(geomLengthM(g), 500 + 10, 'олон замын хавтгай нийлбэр');
  /* SR-гүй геометрт давхаргын SR (fallback) */
  assert.equal(geomLengthM({ paths: [[[0, 0], [3, 4]]] }, 32648), 5);
}

/* ══════════ 4. null ≠ 0 ══════════ */
assert.equal(geomLengthM(null), null);
assert.equal(geomLengthM({ paths: [] }), null);
assert.equal(geomLengthM({ paths: [[[1, 1]]] }), null, 'ганц цэгтэй зам — хэмжих боломжгүй');
assert.equal(geomLengthM({ rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }), null, 'полигонд урт БИШ');
assert.equal(geomAreaM2(null), null);

/* ══════════ 5. Талбай ══════════ */
{
  /* UTM — 100 × 50 м тэгш өнцөгт, нүхтэй (10 × 10) */
  const g = {
    rings: [
      [[0, 0], [0, 50], [100, 50], [100, 0], [0, 0]],
      [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]],
    ],
    spatialReference: { wkid: 32648 },
  };
  assert.equal(geomAreaM2(g), 5000 - 100, 'гадна цагираг − нүх');
}
{
  /* Web Mercator — меридиан/параллелиар хүрээлэгдсэн жижиг тэгш өнцөгт. Лавлагаа нь
     ∫ M·N·cosφ dφ · Δλ (Симпсон, 2000 алхам) — эллипсоидын яг томьёо. */
  const lon1 = 106.90, lon2 = 106.91, lat1 = 47.90, lat2 = 47.905;
  const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f), r = Math.PI / 180;
  const MN = (p) => { const s = Math.sin(p); const w = 1 - e2 * s * s; return (a * (1 - e2) / (w * Math.sqrt(w))) * (a / Math.sqrt(w)) * Math.cos(p); };
  const n = 2000, h = ((lat2 - lat1) * r) / n;
  let s = MN(lat1 * r) + MN(lat2 * r);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * MN(lat1 * r + i * h);
  const ref = (s * h) / 3 * (lon2 - lon1) * r;
  const ring = [[lon1, lat1], [lon1, lat2], [lon2, lat2], [lon2, lat1], [lon1, lat1]].map(([x, y]) => merc(x, y));
  const got = geomAreaM2({ rings: [ring], spatialReference: { wkid: 102100 } });
  assert.ok(Math.abs(got - ref) / ref < 1e-4, `геодезийн талбай ${got} ≈ ${ref}`);
}

/* ══════════ 6. Уртын талбар ба нэгж ══════════ */
assert.equal(lenFieldUnit('Urt_m', null), 'm');
assert.equal(lenFieldUnit('urt_km', null), 'km');
assert.equal(lenFieldUnit('Length_km', { field: 'Length_km', unit: 'км' }), 'km');
assert.equal(lenFieldUnit('Shugam_Urt', { field: 'Shugam_Urt', unit: 'м' }), 'm', 'давхаргын qty.field');
assert.equal(lenFieldUnit('Shugam_Urt', { field: 'Shugam_Urt', unit: 'км' }), 'km');
assert.equal(lenFieldUnit('Shape__Length', { field: 'Shape__Length', unit: 'м' }), null, 'Shape__* бол засагдахгүй');
assert.equal(lenFieldUnit('Diameter', { field: 'Urt_m', unit: 'м' }), null);
/* 2026-10-09: урт БИШ хэмжээний талбар (ш · м²) уртын талбар гэж танигдахгүй */
assert.equal(lenFieldUnit('Too_shirheg', { field: 'Too_shirheg', unit: 'ш' }), null, 'ширхэг');
assert.equal(lenFieldUnit('Talbai', { field: 'Talbai', unit: 'м²' }), null, 'талбай');
assert.equal(lenFieldUnit('Urt_m', { field: 'Urt_m', unit: 'ш' }), 'm', 'нэрээр урт бол нэгжээс үл хамаарна');
assert.equal(lenFieldValue(1234.5678, 'm'), '1234.57');
assert.equal(lenFieldValue(1234.5678, 'km'), '1.235');
assert.equal(lenFieldValue(1234.5678, 'm', true), '1235', 'бүхэл талбарт бүхэлчилнэ');
assert.equal(lenFieldValue(-1, 'm'), '', 'сөрөг — бичихгүй');

console.log('butetsLen.check: OK');
