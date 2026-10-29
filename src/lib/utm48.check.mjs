/**
 * `utm48.ts` — WGS84 ↔ UTM 48N ↔ Web Mercator.
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/utm48.check.mjs
 */
import assert from 'node:assert/strict';

const U = await import('./utm48.ts');

/* 1. ArcGIS-ийн проекцтой тулгах (≤ 1 см) */
const ref = { lat: 47.9606948300837, lon: 106.92463860033857, e: 643675.6497999998, n: 5313724.147299999 };
const u = U.toUtm48(ref.lat, ref.lon);
assert.ok(Math.abs(u.e - ref.e) < 0.01, `зүүн: ${u.e} ≠ ${ref.e}`);
assert.ok(Math.abs(u.n - ref.n) < 0.01, `хойд: ${u.n} ≠ ${ref.n}`);
const g = U.fromUtm48(ref.e, ref.n);
assert.ok(Math.abs(g.lat - ref.lat) < 1e-7 && Math.abs(g.lon - ref.lon) < 1e-7, `урвуу: ${g.lat},${g.lon}`);

/* 2. Төв меридиан ба экватор */
assert.ok(Math.abs(U.toUtm48(48, 105).e - 500000) < 1e-6, 'төв меридиан E = 500000');
assert.ok(Math.abs(U.toUtm48(0, 105).n) < 1e-6, 'экватор N = 0');

/* 3. Эргэн тойрох — Сэлбэ орчмын тор */
for (let lat = 47.8; lat <= 48.1; lat += 0.05) {
  for (let lon = 106.7; lon <= 107.1; lon += 0.05) {
    const a = U.toUtm48(lat, lon);
    const b = U.fromUtm48(a.e, a.n);
    assert.ok(Math.abs(b.lat - lat) < 1e-9 && Math.abs(b.lon - lon) < 1e-9, `${lat},${lon}`);
    const w = U.toWebMercator(lat, lon);
    const c = U.fromWebMercator(w.x, w.y);
    assert.ok(Math.abs(c.lat - lat) < 1e-9 && Math.abs(c.lon - lon) < 1e-9, `WM ${lat},${lon}`);
  }
}

/* 4. Монголын хүрээ */
assert.ok(U.inMongolia(ref.lat, ref.lon));
assert.ok(!U.inMongolia(ref.lon, ref.lat), 'өргөрөг/уртраг сольсон → хүрээнээс гадна');

console.log('✅ utm48 — ArcGIS-ийн проекцтой ≤1 см, эргэн тойрох 1e-9°');
