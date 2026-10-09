/**
 * `chartStyle.ts` — графикийн нэг эх (2026-10-09, «бүх графикийн загварыг жигдлэх»).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/chartStyle.check.mjs
 *
 * ⚠️ Барьдаг дүрмүүд:
 *    · `linePath`/`lineSegments` нь `null` дээр ТАСАРНА (null ≠ 0 — гүүрээр холбохгүй);
 *    · ганц цэгтэй хэсэг `single` — шугам/талбай биш, цэг;
 *    · ямар ч оролтод `NaN`/`Infinity` замд орохгүй;
 *    · монотон муруй хуримтлагдсан (өсөх) цуваанд ХЭТРЭХГҮЙ (96 → 98.8 нь 100-г давахгүй);
 *    (`ui.tsx`-ийн markup — `src/components/charts.ui.check.mjs`)
 */
import assert from 'node:assert/strict';
import {
  CHART, DONUT_SIZES, RING_SIZES, ringStroke, linePath, lineSegments, areaPath, monotonePath,
} from '@/lib/chartStyle';

/* ── Тогтмолууд ── */
for (const k of ['stroke', 'markerR', 'ring', 'dim', 'areaTop', 'areaBottom', 'gapFill', 'planDash', 'grid', 'barH', 'stackH', 'meterH']) {
  assert.ok(k in CHART, `CHART.${k} байх ёстой`);
}
assert.equal(CHART.stroke, 2);
assert.equal(CHART.markerR, 3);
assert.equal(CHART.dim, 0.35);
assert.equal(CHART.barH, 2, 'хэвтээ багана нимгэн 2px (хэрэглэгчийн сонголт)');
assert.deepEqual([...CHART.grid], [0, 25, 50, 75, 100]);
assert.equal(CHART.planDash, '5 4');
assert.deepEqual(DONUT_SIZES, { sm: [96, 14], md: [132, 20], lg: [150, 24] });
assert.deepEqual(RING_SIZES, { sm: 88, md: 120, lg: 148 });
assert.equal(ringStroke(120), 12);
assert.equal(ringStroke(88), 9);
assert.equal(ringStroke(148), 15);

/* ── null дээр тасрах ── */
const P = (x, y) => ({ x, y });
const a = linePath([P(0, 10), P(10, 20), null, P(30, 5), P(40, 8), null, null, P(60, 1)]);
assert.equal(a.length, 3, 'гурван тасралтгүй хэсэг');
assert.ok(a.every((d) => d.startsWith('M')));
const segs = lineSegments([P(0, 10), P(10, 20), null, P(30, 5), P(40, 8), null, null, P(60, 1)]);
assert.deepEqual(segs.map((s) => [s.from, s.to, s.single]), [[0, 1, false], [3, 4, false], [7, 7, true]]);
assert.equal(areaPath(segs[2], 100), '', 'ганц цэгт талбай байхгүй');
assert.match(areaPath(segs[0], 100), /L10,100 L0,100 Z$/);
assert.deepEqual(linePath([null, null]), [], 'бүгд null → хоосон');
assert.deepEqual(linePath([]), []);

/* ── NaN гарахгүй ── */
const weird = [P(0, NaN), P(1, 2), P(2, Infinity), P(3, 4), P(3, 5), P(4, 5), undefined, P(5, -3)];
for (const d of [...linePath(weird), ...linePath(weird, { smooth: false })]) {
  assert.ok(!/NaN|Infinity/.test(d), `NaN/Infinity: ${d}`);
}
/* Давхардсан x (dx = 0) — хуваах тэгээс NaN гарахгүй */
assert.ok(!/NaN/.test(monotonePath([P(0, 0), P(0, 5), P(1, 6)])));
/* Хавтгай цуваа */
assert.ok(!/NaN/.test(monotonePath([P(0, 5), P(1, 5), P(2, 5)])));

/* ── Монотон: хэтрэхгүй ──
   Кубик Безьегийн хяналтын цэгүүд хэсгийн [y0,y1] мужид байвал муруй ч тэр мужид. */
const ctrlYs = (d) => [...d.matchAll(/C([-\d.]+),([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+),([-\d.]+)/g)]
  .map((m) => [Number(m[2]), Number(m[4])]);
/* Хуримтлагдсан S-муруй (y дээш = бага y; 100 − %) */
const cum = [0, 3, 10, 40, 75, 96, 98.8, 100].map((v, i) => P(i * 10, 100 - v));
const dCum = monotonePath(cum);
ctrlYs(dCum).forEach(([c1, c2], i) => {
  const lo = Math.min(cum[i].y, cum[i + 1].y) - 1e-6;
  const hi = Math.max(cum[i].y, cum[i + 1].y) + 1e-6;
  assert.ok(c1 >= lo && c1 <= hi && c2 >= lo && c2 <= hi, `хэсэг ${i}: хяналтын цэг мужаас гарсан (${c1}, ${c2})`);
});
/* Тэгш бус алхамтай (x) өсөх цуваа ч мөн */
const uneven = [P(0, 90), P(1, 80), P(7, 20), P(8, 19), P(20, 0)];
ctrlYs(monotonePath(uneven)).forEach(([c1, c2], i) => {
  const lo = Math.min(uneven[i].y, uneven[i + 1].y) - 1e-6;
  const hi = Math.max(uneven[i].y, uneven[i + 1].y) + 1e-6;
  assert.ok(c1 >= lo && c1 <= hi && c2 >= lo && c2 <= hi, `тэгш бус ${i}: (${c1}, ${c2})`);
});
/* smooth:false — зөвхөн шулуун хэрчим */
assert.ok(!linePath([P(0, 0), P(1, 1), P(2, 0)], { smooth: false })[0].includes('C'));

console.log('✅ chartStyle: тогтмол · null дээр тасрах · NaN-гүй · монотон хэтрэхгүй');
