/**
 * «Тохиромжтой байдлын үнэлгээ» Word тайлан — 3 бүлэг (`suitReport.suitBlocks`).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/analysis/suit/suitReport.check.mjs
 */
import assert from 'node:assert/strict';
import { suitBlocks } from './suitReport.ts';
import { INDICATORS, PARKING, GREEN } from '../../../lib/analysis/config.ts';
import { urbanScore } from '../../../lib/analysis/score.ts';

const ind = INDICATORS.map((i) => ({ ...i }));
const zone = (id, type, green, extra = {}) => {
  /* ⚠️ 2026-10-27 (main): хэмжсэн жин `MIN_MEASURED_SHARE`-ээс бага бол оноо null — бусад үзүүлэлтийг нормд тааруулж бөглөнө.
     `green` null бол бүсийг бүхэлд нь хэмжилтгүй (оноогүй) гэж үзнэ. */
  const pass = (i) => (i.mode === 'higher' ? i.target ?? 0 : i.mode === 'band' ? i.optMin ?? 0 : i.best ?? 0);
  const raw = Object.fromEntries(ind.map((i) => [i.id, green == null ? null : pass(i)]));
  raw.green = green;
  const u = urbanScore(raw, ind, type);
  return {
    id, type, excluded: false, areaHa: 2, polyHa: 2, residentPop: 1000, capacityPop: 100, population: 1100,
    households: 300, parkingNeed: 300, parkingSupply: 200, parkingGap: -100, etIl: 150, etDald: 50,
    greenM2: green == null ? 0 : green * 1000, greenDist: [], transitM: 300, raw, rawActual: raw,
    urban: u.score, parts: u.parts, ...extra,
  };
};
const rows = [
  zone('A-1', 'Орон сууц', 10),
  zone('A-2', 'Орон сууц', 2, { transitM: 800 }),
  zone('B-1', 'Үйлчилгээ', null, { transitM: null }),
];
const out = suitBlocks({
  rows, scored: rows, ranked: rows, sim: rows, indicators: ind, parking: { ...PARKING }, green: { ...GREEN },
  popBasis: 'resident', traffic: null, netLabel: 'Төлөвлөгөө', indicatorName: 'Ногоон талбай',
});

const h1 = out.filter((b) => b.kind === 'h' && b.level === 1).map((b) => b.text);
assert.deepEqual(h1, ['1. Хот төлөвлөлт', '2. Үзүүлэлт', '3. Симуляц']);

/* Эрэмбэ: өгөгдөлгүй бүс (B-1) байргүй, хамгийн сүүлд */
const rank = out.find((b) => b.kind === 'table' && b.head[0][0] === 'Байр');
assert.deepEqual(rank.rows.map((r) => [r[0], r[1]]), [['1', 'A-1'], ['2', 'A-2'], ['', 'B-1']]);

/* Хүртээмж: 500 м-ээс хол зөвхөн A-2; null бүс тоологдохгүй (null ≠ 0) */
const far = out.find((b) => b.kind === 'table' && b.head[0][0] === 'Бүс' && b.head[0][2] === 'Буудал хүртэл (м)');
assert.deepEqual(far.rows.map((r) => r[0]), ['A-2']);

/* Нэр бүр дараагийн блоктойгоо нэг хуудсанд; «—» үгүй */
for (let k = 0; k < out.length; k++) {
  const b = out[k];
  if (b.kind === 'p' && /^(Хүснэгт|График) \d+\./.test(b.text)) assert.ok(b.keep && out[k + 1].keep, b.text);
}
assert.ok(!JSON.stringify(out).includes('—'), 'зураас үгүй');

console.log('✅ suitReport — 3 бүлэг · эрэмбэ (null байргүй) · хүртээмжийн норм · нэр/тайлбар keep');
