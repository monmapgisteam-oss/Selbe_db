/**
 * ТОКЕН URL-Д ОРОХГҮЙ — статик шалгуур (2026-09-30).
 *   node tools/tokenInUrl.check.mjs
 *
 * Дүрэм (`src/lib/authToken.ts`-ийн толгой, `tools/ts-alias.mjs`): ArcGIS токен POST-ын
 * БИЕЭР л явна. Query string нь ArcGIS/прокси/CDN-ийн access log-д бүтнээрээ хадгалагдаж,
 * Referer-ээр гуравдагчид алдагддаг (CWE-598). Үл хамаарах нь ЗӨВХӨН POST хийх боломжгүй
 * `<img src>`/`<a href>`-ийн хавсралтын хаяг — `tokenQs()` (authToken.ts) ба доорх
 * ил жагсаалт.
 *
 * Хамгаалж буй алдаа: `tools/bagts-gun.mjs` БҮТЭЦ ӨӨРЧЛӨХ эрхтэй ADMIN токеныг
 * `GET …/0?f=json&token=…`-ээр илгээдэг байв.
 *
 * Шалгах хэв: (1) литерал дотор `?token=${…}` / `&token=${…}` / `'token=' +` угсралт,
 * (2) `fetch(…tokenQs()…)` — `tokenQs` нь зөвхөн img/a-д.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Ил зөвшөөрөгдсөн байрлал — файл → шалтгаан (мөрийн дугааргүй: засварт тогтвортой) */
const ALLOW = new Map([
  ['src/lib/authToken.ts', '`tokenQs()`-ийн тодорхойлолт — зөвхөн <img>/<a> хавсралтын хаягт'],
  ['src/lib/chanarStore.ts', 'чанарын баримтын хавсралтын <a href> (listAttachments, 2026-09-16 аудит)'],
]);

const BS = String.fromCharCode(92);
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(e) && !/\.check\.mjs$/.test(e)) files.push(p.split(BS).join('/'));
  }
})('src');
for (const e of readdirSync('tools')) if (/\.mjs$/.test(e) && !/\.check\.mjs$/.test(e)) files.push(`tools/${e}`);

const isComment = (l) => /^\s*(\/\/|\/\*|\*)/.test(l);
const PATTERNS = [
  /[?&]token=\$\{/,           // `…?token=${t}` / `…&token=${t}` — литерал дотор
  /[?&]token='\s*\+/,         // '…&token=' + t
  /fetch\([^;]*tokenQs\(\)/,  // fetch(`${url}?f=json${tokenQs()}`)
];

const hits = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    if (isComment(l)) return;
    if (PATTERNS.some((re) => re.test(l)) && !ALLOW.has(f)) hits.push(`${f}:${i + 1}: ${l.trim().slice(0, 140)}`);
  });
}

console.log(`tokenInUrl: ${files.length} файл шалгав`);
assert.equal(hits.length, 0, `✗ токен URL-д угсрагдсан (POST биед шилжүүл, эсвэл img/a бол ALLOW-д шалтгаантай нэм):\n  ${hits.join('\n  ')}`);
/* Зөвшөөрлийн жагсаалт хоцроогүй — жагсаасан файл бүр оршин байна */
for (const f of ALLOW.keys()) assert.ok(files.includes(f), `✗ ALLOW-д байгаа ${f} олдсонгүй — жагсаалтаас хас`);
console.log('✓ токен зөвхөн POST биеэр (img/a хавсралтын 2 ил үл хамаарал)');
