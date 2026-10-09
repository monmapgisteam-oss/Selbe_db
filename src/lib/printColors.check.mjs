/**
 * ХЭВЛЭЛИЙН ӨНГӨ = ЦАЙВАР ТОКЕН — сүлжээгүй, цэвэр.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/printColors.check.mjs
 *
 * Хамгаалж буй алдаа (2026-10-09):
 *   PDF / инфографик (canvas, pdfmake) `var(--x)` задалдаггүй тул hex хуулбар
 *   ашигладаг. Урьд хуулбар файл бүрд тарж, токен солигдоход ХУУЧИРСАН
 *   (good #16a34a, warn #ca8a04) — вэб ба цаас өөр өнгөтэй болсон.
 *   Одоо `PRINT_COLORS` / `CAT_LIGHT` (format.ts) ГАНЦ эх; энэ шалгуур
 *   `globals.css`-ийн `:root, [data-theme='light']` блокийг задлан тэдгээр
 *   токентой ТЭНЦҮҮ эсэхийг шалгана. `var()` алиасыг задална,
 *   `color-mix()`-тэй токеныг алгасна (hex-д буулгахгүй).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRINT_COLORS, CAT_LIGHT } from './format.ts';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

/* ── Цайвар блок: `:root,\n[data-theme='light'] {` … эхний `}` ── */
const m = css.match(/:root\s*,\s*\[data-theme=['"]light['"]\]\s*\{([^}]*)\}/);
assert.ok(m, "globals.css-д `:root, [data-theme='light']` блок олдсонгүй");
const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '');

const raw = new Map();
for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) raw.set(d[1], d[2].trim());

/** var() алиасыг задална; color-mix → null (алгасна) */
const resolve = (name, seen = new Set()) => {
  assert.ok(!seen.has(name), `${name}: var() тойрог`);
  seen.add(name);
  const v = raw.get(name);
  assert.ok(v != null, `${name} токен цайвар блокт алга`);
  if (/color-mix\(/i.test(v)) return null;
  const a = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return a ? resolve(a[1], seen) : v.toLowerCase();
};

const MAP = {
  ink: '--ink', ink2: '--ink-2', ink3: '--ink-3',
  data: '--data', good: '--good', warn: '--warn', bad: '--bad',
  track: '--chart-track', plan: '--chart-plan', actual: '--chart-actual',
};

/* Түлхүүр бүр зурагдсан эсэх — шинэ түлхүүр нэмээд MAP-д оруулахаа мартахгүй */
assert.deepEqual(Object.keys(PRINT_COLORS).sort(), Object.keys(MAP).sort(), 'PRINT_COLORS ↔ MAP түлхүүр зөрсөн');

let n = 0;
for (const [k, tok] of Object.entries(MAP)) {
  const want = resolve(tok);
  if (want == null) continue;
  assert.match(want, /^#[0-9a-f]{6}$/, `${tok} hex биш: ${want}`);
  assert.equal(PRINT_COLORS[k].toLowerCase(), want, `PRINT_COLORS.${k} ≠ ${tok}`);
  n++;
}
CAT_LIGHT.forEach((hex, i) => {
  assert.equal(hex.toLowerCase(), resolve(`--c${i + 1}`), `CAT_LIGHT[${i}] ≠ --c${i + 1}`);
  n++;
});

/* Гантын төлөв = good/data/bad (huvaariPdf-ийн ST_FILL үүнд тулгуурлана) */
assert.equal(resolve('--gantt-done'), PRINT_COLORS.good, '--gantt-done ≠ --good');
assert.equal(resolve('--gantt-run'), PRINT_COLORS.data, '--gantt-run ≠ --data');
assert.equal(resolve('--gantt-late'), PRINT_COLORS.bad, '--gantt-late ≠ --bad');

/* Хуучирсан hex PDF/инфографикт буцаж орохгүй */
for (const f of ['execInfographic.ts', 'huvaariPdf.ts', 'execPdf.ts']) {
  const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const old of ['#16a34a', '#ca8a04', '#d03b3b', '#fab219', '#2a78d6']) {
    assert.ok(!src.toLowerCase().includes(old), `${f}: хуучирсан өнгө ${old} кодонд үлдсэн`);
  }
}

console.log(`printColors: ${n + 3} токен тэнцүү ✓`);
