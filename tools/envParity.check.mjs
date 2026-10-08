/**
 * `NEXT_PUBLIC_*` ОРЧНЫ ХУВЬСАГЧИЙН ТЭНЦВЭР — код ↔ `.env.example` ↔ deploy.yml ↔ test.yml.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/envParity.check.mjs
 *
 * ⚠️ 2026-10-09: ЯАГААД. Код дотор үйлчилгээний хаягийн fallback БАЙХГҮЙ (2026-09-17) —
 *    хувьсагч бүр `.env` (локал), GitHub Variables (deploy.yml), CI (test.yml) гурвуулаа
 *    дээр ИЖИЛ нэрээр байх ёстой. Гараар синк хийдэг тул зөрдөг байв: жишээ нь
 *    `NEXT_PUBLIC_AGENT_PROMPT_HMAC` нь deploy.yml-д нэмэгдсэн ч `.env.example` ба
 *    test.yml-д алга байв (шинэ хөгжүүлэгч мэдэхгүй, CI-ийн build өөр багц гаргана).
 *    Мөн кодоос хасагдсан хувьсагч workflow-д үхмэл мөр болж үлддэг.
 *
 * Дүрэм:
 *   1. Кодод (src · tools, ТАЙЛБАРЫГ ХАССАН) хэрэглэгдсэн `NEXT_PUBLIC_*` бүр — `.env.example`,
 *      deploy.yml, test.yml гурвуулаа дээр (OPTIONAL_LOCAL-аас бусад).
 *   2. `.env.example` / deploy.yml / test.yml-д байгаа бүр кодод хэрэглэгдэнэ (хуучирсан мөргүй).
 *   3. deploy.yml ба test.yml-ийн жагсаалт ИЖИЛ.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * Зөвхөн ЛОКАЛ/гараар тавих тугууд — deploy/CI-д САНААТАЙ байхгүй.
 * `.env.example`-д ТАЙЛБАР мөрөөр (`# NEXT_PUBLIC_X=…`) баримтжуулсан байх ёстой.
 */
const OPTIONAL_LOCAL = new Map([
  ['NEXT_PUBLIC_AUTH_OFF',
    'Нэвтрэлтийг санаатай унтраах (зөвхөн UI бүтэц харах) — production/CI-д ХЭЗЭЭ Ч тавихгүй (env.ts).'],
]);

const SELF = 'tools/envParity.check.mjs';
const NAME = /NEXT_PUBLIC_[A-Z0-9_]+/g;
const BS = String.fromCharCode(92);

/** `//` ба `/* … *\/` тайлбарыг хасна; мөрийн литерал (', ", `) дотрыг хадгална. */
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (two === '//') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === BS) j += 1; j += 1; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i += 1;
  }
  return out;
}

/* ── 1) Код ── */
const code = new Map(); // нэр → эхний файл
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.next')) continue;
    const p = join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx|mjs|cjs|js)$/.test(e.name)) continue;
    const rel = p.split(sep).join('/');
    if (rel === SELF) continue;
    for (const m of stripComments(readFileSync(p, 'utf8')).matchAll(NAME)) if (!code.has(m[0])) code.set(m[0], rel);
  }
};
walk('src');
walk('tools');
assert.ok(code.size >= 10, `кодоос хэт цөөн NEXT_PUBLIC_* олдов (${code.size}) — хайлт эвдэрсэн үү?`);

/* ── 2) .env.example — идэвхтэй мөр ба тайлбарласан (сонголттой) мөр ── */
const exampleTxt = readFileSync('.env.example', 'utf8');
const example = new Set();
const exampleCommented = new Set();
for (const line of exampleTxt.split(/\r?\n/)) {
  const a = /^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=/.exec(line);
  if (a) { example.add(a[1]); continue; }
  const c = /^\s*#\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=/.exec(line);
  if (c) exampleCommented.add(c[1]);
}

/* ── 3) Workflow-ууд — `NAME: ${{ … }}` хэлбэрийн идэвхтэй (тайлбар биш) мөр ── */
const wfVars = (file) => {
  const s = new Set();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s+(NEXT_PUBLIC_[A-Z0-9_]+)\s*:/.exec(line);
    if (m) s.add(m[1]);
  }
  return s;
};
const deploy = wfVars('.github/workflows/deploy.yml');
const test = wfVars('.github/workflows/test.yml');

/* ── Шалгалт ── */
const errs = [];
for (const [name, file] of code) {
  if (OPTIONAL_LOCAL.has(name)) {
    if (!exampleCommented.has(name) && !example.has(name)) errs.push(`${name} (${file}) — .env.example-д тайлбар мөрөөр баримтжуулаагүй`);
    if (deploy.has(name)) errs.push(`${name} — deploy.yml-д байх ЁСГҮЙ (зөвхөн локал туг)`);
    if (test.has(name)) errs.push(`${name} — test.yml-д байх ЁСГҮЙ (зөвхөн локал туг)`);
    continue;
  }
  if (!example.has(name)) errs.push(`${name} (${file}) — .env.example-д алга`);
  if (!deploy.has(name)) errs.push(`${name} (${file}) — deploy.yml-ийн env-д алга`);
  if (!test.has(name)) errs.push(`${name} (${file}) — test.yml-ийн env-д алга`);
}
for (const [label, set] of [['.env.example', example], ['deploy.yml', deploy], ['test.yml', test]]) {
  for (const name of set) if (!code.has(name)) errs.push(`${name} — ${label}-д байгаа ч кодод хэрэглэгдэхгүй (хуучирсан мөр)`);
}
for (const name of deploy) if (!test.has(name) && code.has(name)) errs.push(`${name} — deploy.yml-д байгаа ч test.yml-д алга`);
for (const name of test) if (!deploy.has(name) && code.has(name)) errs.push(`${name} — test.yml-д байгаа ч deploy.yml-д алга`);

if (errs.length) {
  console.error(`❌ NEXT_PUBLIC_* тэнцвэр алдагдсан (${errs.length}):\n  ${[...new Set(errs)].join('\n  ')}`);
  process.exit(1);
}
console.log(`✅ ${code.size} NEXT_PUBLIC_* — код · .env.example · deploy.yml · test.yml тэнцүү`
  + ` (зөвхөн локал: ${[...OPTIONAL_LOCAL.keys()].join(', ')})`);
