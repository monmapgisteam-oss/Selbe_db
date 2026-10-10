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
import { readFileSync } from 'node:fs';
import {
  CHART, DONUT_SIZES, RING_SIZES, ringStroke, linePath, lineSegments, areaPath, monotonePath,
  glow, niceTicks, stepDecimals, arcPath, roundPctsTo100,
  SCORE_HEX, SCORE_INK, SCORE_NODATA_INK,
} from '@/lib/chartStyle';

/* ── ⚠️ 2026-10-09 (аудит №6): roundPctsTo100 — бүхэл хувиуд нийлээд ЯГ 100 ── */
assert.deepEqual(roundPctsTo100([1, 1, 1]), [34, 33, 33], '33.3×3 → 99% биш 100%');
assert.deepEqual(roundPctsTo100([16.5, 16.5, 67]), [17, 16, 67], '17+17+67 = 101% биш');
assert.deepEqual(roundPctsTo100([75, 25]), [75, 25]);
assert.deepEqual(roundPctsTo100([999, 1]), [100, 0], 'жижиг хэсэг 0 (дуудагч «<1%» бичнэ)');
assert.deepEqual(roundPctsTo100([25, 25], 100), [25, 25], '`total` өгвөл 100 болгож хиймлээр сунгахгүй');
assert.deepEqual(roundPctsTo100([0, 0]), [0, 0], 'нийлбэр 0 → бүгд 0');
assert.deepEqual(roundPctsTo100([NaN, -5, 10]), [0, 0, 100], 'NaN/сөрөг → 0');
assert.deepEqual(roundPctsTo100([]), []);
for (const vs of [[1, 2, 3, 4, 5, 6, 7], [0.1, 0.2, 0.7], [3, 3, 3, 1]]) {
  assert.equal(roundPctsTo100(vs).reduce((a, b) => a + b, 0), 100, `нийлбэр 100: ${vs}`);
}

/* ── Тогтмолууд ── */
for (const k of ['stroke', 'markerR', 'ring', 'dim', 'areaTop', 'areaBottom', 'gapFill', 'planDash', 'grid', 'barH', 'stackH', 'meterH']) {
  assert.ok(k in CHART, `CHART.${k} байх ёстой`);
}
assert.equal(CHART.stroke, 2);
assert.equal(CHART.markerR, 3);
assert.equal(CHART.dim, 0.35);
assert.equal(CHART.barH, 2, 'хэвтээ багана нимгэн 2px (хэрэглэгчийн сонголт)');
assert.deepEqual([...CHART.grid], [0, 25, 50, 75, 100]);
/* ⚠️ 2026-10-09 (лавлах CRM загвар — өнгө хэвээр): төлөвлөгөө ЦЭГЭН, талбай 0.32 → 0, donut ~20% */
assert.equal(CHART.planDash, '1 5');
assert.equal(CHART.areaTop, 0.32);
assert.equal(CHART.areaBottom, 0);
assert.equal(CHART.areaMultiTop, 0.16);
assert.deepEqual(DONUT_SIZES, { sm: [96, 19], md: [132, 26], lg: [150, 30] });
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
/* ⚠️ 2026-10-09 (аудит №3): monotonePath(pts, from, to) = БҮТЭН муруйн яг тэр хэсэг
   (slice-лаад дахин бодвол захын налуу өөрчлөгдөж PkgProg-ийн зөрүүний ирмэг зөрдөг байв) */
{
  const full = monotonePath(cum);
  const cs = full.split(' C').slice(1);
  const sub = monotonePath(cum, 2, 5);
  assert.equal(sub, `M${cum[2].x},${cum[2].y} C${cs.slice(2, 5).join(' C')}`, 'хэсэг = бүтэн муруйн C-хэрчмүүд');
  assert.notEqual(sub, monotonePath(cum.slice(2, 6)), 'slice-ийн дахин тооцоо өөр (захын налуу) — тиймээс range');
  assert.equal(monotonePath(cum, 0, cum.length - 1), full);
}

/* smooth:false — зөвхөн шулуун хэрчим */
assert.ok(!linePath([P(0, 0), P(1, 1), P(2, 0)], { smooth: false })[0].includes('C'));

/* ── Гэрэлтэлт: цувааны ӨӨРИЙН токен, хүч нь --chart-glow ── */
assert.ok(glow('var(--c2)').startsWith('drop-shadow(0 0 4px color-mix(in srgb, var(--c2) var(--chart-glow'));

/* ── niceTicks: 1·2·2.5·5 алхам, мужийг бүрэн хамарна, хавтгай/хоосон цуваанд ч ≥2 утга ── */
assert.deepEqual(niceTicks(0, 68, 5), [0, 20, 40, 60, 80]);
assert.deepEqual(niceTicks(0, 100, 5), [0, 20, 40, 60, 80, 100]);
assert.deepEqual(niceTicks(0, 0, 5), [0, 0.2, 0.4, 0.6, 0.8, 1]);
assert.deepEqual(niceTicks(-15, 28, 5), [-20, -10, 0, 10, 20, 30]);
assert.deepEqual(niceTicks(0, 0.3, 4), [0, 0.1, 0.2, 0.3]);
for (const [lo, hi, n] of [[0, 7, 3], [0, 20162536361, 5], [3, 3, 4], [-5, -5, 4], [0, 1e-7, 5]]) {
  const t = niceTicks(lo, hi, n);
  assert.ok(t.length >= 2 && t[0] <= lo && t[t.length - 1] >= hi, `niceTicks(${lo}, ${hi}) хамрахгүй: ${t}`);
  assert.ok(t.every(Number.isFinite));
}
assert.equal(stepDecimals([0, 0.25, 0.5]), 2);
assert.equal(stepDecimals([0, 2.5, 5]), 1);
assert.equal(stepDecimals([0, 20, 40]), 0);

/* ── arcPath: NaN-гүй, бүтэн тойрог хоёр нумаар ── */
assert.ok(!/NaN/.test(arcPath(50, 50, 40, 0, Math.PI / 2)));
assert.equal((arcPath(50, 50, 40, 0, Math.PI * 2).match(/A/g) || []).length, 2);

console.log('✅ chartStyle: тогтмол · null дээр тасрах · NaN-гүй · монотон хэтрэхгүй · niceTicks · glow · arcPath');
/* ── ⚠️ 2026-10-09 (аудит №3): SCORE_HEX = globals.css-ийн --score-1..5 (хоёр горим) ──
   Газрын зураг hex, самбар токен ашигладаг тул ТЭНЦҮҮ байх ёстой. color-mix(in oklab)-ийг
   энд бодно (Björn Ottosson-ийн OKLab); хөтчийн бүхэлчлэлд ±2/255 зөвшөөрнө. */
{
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = (re) => {
    const m = css.match(re);
    assert.ok(m, `globals.css: блок олдсонгүй ${re}`);
    return new Map([...m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]));
  };
  const LIGHT = block(/:root\s*,\s*\[data-theme=['"]light['"]\]\s*\{([^}]*)\}/);
  const DARK = new Map([...LIGHT, ...block(/\[data-theme=['"]dark['"]\]\s*\{([^}]*)\}/)]);
  const h2r = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const toLab = (h) => {
    const [r, g, b] = h2r(h).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const fromLab = ([L, A, B]) => {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
      .map((c) => Math.round(Math.min(1, Math.max(0, gam(c))) * 255));
  };
  const resolve = (map, v) => {
    v = v.trim();
    const a = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (a) { assert.ok(map.has(a[1]), `${a[1]} алга`); return resolve(map, map.get(a[1])); }
    const mx = v.match(/^color-mix\(\s*in\s+oklab\s*,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+?)\s*\)$/);
    if (mx) {
      const p = Number(mx[2]) / 100;
      const A = toLab(resolve(map, mx[1])), B = toLab(resolve(map, mx[3]));
      return '#' + fromLab(A.map((x, i) => x * p + B[i] * (1 - p))).map((c) => c.toString(16).padStart(2, '0')).join('');
    }
    assert.match(v, /^#[0-9a-f]{6}$/i, `задрахгүй утга: ${v}`);
    return v.toLowerCase();
  };
  const lum = (h) => { const [r, g, b] = h2r(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const cr = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  for (const [mode, map] of [['light', LIGHT], ['dark', DARK]]) {
    for (let n = 1; n <= 5; n++) {
      const want = h2r(resolve(map, map.get(`--score-${n}`)));
      const got = h2r(SCORE_HEX[mode][n - 1]);
      want.forEach((c, i) => assert.ok(Math.abs(c - got[i]) * 255 <= 2, `SCORE_HEX.${mode}[${n - 1}] ${SCORE_HEX[mode][n - 1]} ≠ --score-${n}`));
      const r = cr(SCORE_HEX[mode][n - 1], SCORE_INK[mode][n - 1]);
      assert.ok(r >= 4.5, `${mode} --score-${n}: бичгийн харьцаа ${r.toFixed(2)} < 4.5`);
    }
    const nd = cr(resolve(map, map.get('--ink-3')), SCORE_NODATA_INK[mode]);
    assert.ok(nd >= 4.5, `${mode} өгөгдөлгүй: ${nd.toFixed(2)} < 4.5`);
  }
}

console.log('✅ chartStyle: тогтмол · null дээр тасрах · NaN-гүй · монотон хэтрэхгүй · онооны hex = токен, бичиг ≥4.5:1');
