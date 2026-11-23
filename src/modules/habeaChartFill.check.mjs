/**
 * ХАБЭА-ГИЙН ЧАРТЫН ДҮҮРГЭЛТ — 70% ТУНГАЛАГ (2026-11-21, хэрэглэгч: «бүх чартын transparency 70%, зөвхөн ХАБЭА хуудсанд»).
 * Цэвэр, сүлжээгүй — эх кодыг уншиж шалгана:
 *   node src/modules/habeaChartFill.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ШИНЭ ЧАРТ ДҮРЭМ ЗӨРӨХ. ХАБЭА-гийн гурван файлын донат БҮГД `soft` (тунгалаг дүүргэлтийг `--chart-soft-fill`-ээс уншдаг
 *      цорын ганц горим), хэсэгчилсэн зурвас `soft` байх ёстой — эс бөгөөс тэр чарт бүтэн өнгөөр гарна.
 *   2. БУСАД ХУУДАС ӨӨРЧЛӨГДӨХ. `--chart-soft-fill` зөвхөн `habea.module.css`-ийн `.shell`-д; баганан жагсаалт · цувааны
 *      багана · онооны зурвасын тунгалаг дүрэм `.shell`-ээр хязгаарлагдсан; бусад модуль энэ хувьсагчийг тавихгүй.
 *   3. ХУВЬ ХАЗАЙХ. 0.3 = 30% дүүргэлт = 70% тунгалаг.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const FILES = ['./Habea.tsx', './habeaUzleg.tsx', './HabeaAction.tsx'];
const css = read('./habea.module.css');

/* 3 — `.shell`-ийн тодорхойлолтод 0.3 */
const shell = /\n\.shell \{([^}]*)\}/.exec(css)?.[1] ?? '';
assert.match(shell, /--chart-soft-fill:\s*0\.3;/, '`.shell` дотор --chart-soft-fill: 0.3 (70% тунгалаг)');

/* 1 — донат, зурвас бүр `soft` */
for (const f of FILES) {
  const src = read(f);
  for (const m of src.matchAll(/<(Donut|Stack)\b([\s\S]*?)\/>/g)) {
    assert.match(m[2], /\bsoft\b/, `${f}: <${m[1]}> soft биш — 70% тунгалаг дүүргэлт алгасагдана (${m[2].trim().slice(0, 60)}…)`);
  }
}

/* 2 — баганан жагсаалт · цувааны багана · онооны зурвас: `.shell`-ээр хязгаарлагдсан тунгалаг дүрэм */
for (const sel of [':global(.barsList) :global(.chartFill)', ':global(.seriesColFill)', '.scoreBar']) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`\\.shell ${esc} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  assert.match(rule, /calc\(var\(--chart-soft-fill\) \* 100%\)/, `.shell ${sel}: дүүргэлт --chart-soft-fill-ээс`);
  assert.match(rule, /box-shadow: inset 0 0 0 [\d.]+px/, `.shell ${sel}: хүрээ бүтэн өнгөөр`);
}
/* «Үл нийцэл — төлөвөөр» — ГАНЦААРАА 80% тунгалаг (2026-11-21, хэрэглэгч) */
const act = read('./HabeaAction.tsx');
assert.match(act, /const STATUS_FILL = \{ display: 'contents', '--chart-soft-fill': 0\.2 \}/, 'төлөвийн донат 0.2 = 80% тунгалаг');
assert.match(act, /<div style=\{STATUS_FILL\}>\s*<Donut items=\{view\.status\} soft/, 'STATUS_FILL нь яг төлөвийн донатыг бүрхэнэ');
const ui = read('../components/ui.tsx');
assert.match(ui, /seriesBarOutline : ''\} seriesColFill`/, 'цувааны баганад `seriesColFill` дэгээ');
assert.match(ui, /fillOpacity: on \? softFill\(k\)/, 'Donut soft — дүүргэлт `--chart-soft-fill`-ээс');

/* 2 — хувьсагчийг өөр ямар ч CSS модуль тавихгүй (бусад хуудас анхдагч 0.5 / бүтэн өнгөтэй үлдэнэ) */
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.css$/.test(n) ? [p] : [];
});
const srcDir = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const setters = walk(decodeURIComponent(srcDir)).filter((p) => /--chart-soft-fill\s*:/.test(readFileSync(p, 'utf8')));
assert.deepEqual(setters.map((p) => p.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/')), ['src/modules/habea.module.css'],
  '--chart-soft-fill зөвхөн ХАБЭА-д');

console.log('habeaChartFill: OK');
