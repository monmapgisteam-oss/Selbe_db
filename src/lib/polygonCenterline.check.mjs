import assert from 'node:assert/strict';
import { polygonCenterlines } from './polygonCenterline.ts';

const rect = (x, y, width, height) => [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]];
const length = (paths) => paths.reduce((sum, path) => sum + path.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0), 0);
const near = (actual, expected, tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
const inside = (x, y, rings) => {
  let on = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) on = !on;
  }
  return on;
};
const interiorSegments = (result, rings) => {
  for (const path of result.paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const samples = Math.max(10, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / result.resolution * 3));
    for (let j = 0; j < samples; j++) {
      const t = (j + 0.5) / samples;
      assert.ok(inside(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, rings), 'Every segment interior must stay inside the original road, including around holes');
    }
  }
};
const run = (rings, expected) => {
  const result = polygonCenterlines(rings, { resolution: 0.5 });
  assert.equal(result.complete, true);
  near(length(result.paths), expected);
  interiorSegments(result, rings);
  return result;
};

const straight = run([rect(0, 0, 100, 10)], 100);
assert.equal(straight.paths.length, 1);
// Width changes must not become extra reported length, as perimeter/2 would do.
run([rect(0, 0, 100, 30)], 100);
const bent = [[[0, 0], [100, 0], [100, 100], [80, 100], [80, 20], [0, 20], [0, 0]]];
run(bent, 180);
const tee = [[[40, 0], [60, 0], [60, 80], [100, 80], [100, 100], [0, 100], [0, 80], [40, 80], [40, 0]]];
const branched = run(tee, 190);
assert.equal(branched.paths.length, 3, 'T road retains all three branches');
const endDegree = new Map();
for (const path of branched.paths) for (const p of [path[0], path.at(-1)]) { const k = p.join(','); endDegree.set(k, (endDegree.get(k) ?? 0) + 1); }
assert.equal([...endDegree.values()].filter((n) => n === 3).length, 1, 'Three paths share the same junction coordinate');
assert.equal([...endDegree.values()].filter((n) => n === 1).length, 3);

const hole = [rect(0, 0, 100, 100), rect(20, 20, 60, 60).reverse()];
const loop = run(hole, 320);
assert.equal(loop.paths.length, 1);
assert.deepEqual(loop.paths[0][0], loop.paths[0].at(-1), 'A hole produces a closed road loop');
const multi = run([rect(0, 0, 100, 10), rect(0, 100, 100, 10)], 200);
assert.equal(multi.components, 2);
assert.equal(multi.paths.length, 2, 'Disconnected roads must never be connected across empty land');

for (const degrees of [15, 30, 45, 60, 75]) {
  const angle = degrees * Math.PI / 180;
  const rings = [rect(0, 0, 100, 2).map(([x, y]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)])];
  run(rings, 100);
}
// Real Web Mercator coordinate magnitudes must not erase tiny but valid ring areas.
const shifted = [rect(12_000_000, 6_000_000, 100, 2)];
run(shifted, 100);
const budgeted = polygonCenterlines([rect(0, 0, 100, 20)], { resolution: 0.01, maxCells: 20_000 });
assert.equal(budgeted.complete, true);
assert.ok(budgeted.resolution > 0.01);
assert.ok(budgeted.warnings.includes('coarser-grid'));
near(length(budgeted.paths), 100);

const tiny = polygonCenterlines([rect(0, 0, 0.01, 0.01)], { resolution: 1 });
assert.equal(tiny.complete, false, 'An unresolved road cannot silently become a measured zero');
assert.ok(tiny.warnings.includes('unresolved-component'));
const a = Math.PI / 6;
const subcell = [rect(0, 0, 100, 0.1).map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)])];
assert.equal(polygonCenterlines(subcell, { resolution: 0.5 }).complete, false, 'Raster islands cannot extend into duplicated measured centerlines');
assert.equal(polygonCenterlines([rect(0, 0, 0, 10)], { resolution: 1 }).complete, false);
assert.throws(() => polygonCenterlines([rect(0, 0, 10, 1)], { resolution: 0 }));
assert.throws(() => polygonCenterlines([[[NaN, 0], [1, 1], [2, 0]]], { resolution: 1 }));
console.log('polygonCenterline: straight, bent, T, loop/hole, multipart, rotated narrow roads, containment and unresolved geometry checks passed');
