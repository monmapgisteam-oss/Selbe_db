/**
 * `next build`-ийн ДАРААХ СТАТИК ШАЛГАЛТ — `out/` (output: 'export') бүрэн эсэх.
 *   node tools/outVerify.mjs [хавтас]     (анхдагч `out`)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REF_RE = /\b(?:src|href)\s*=\s*["'](\/_next\/static\/[^"'?#\s]+)/g;

/** `dir` доторх бүх `.html` (харьцангуй зам, `/`-тэй) */
function htmlFiles(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, base, out);
    else if (e.name.endsWith('.html')) out.push(p.slice(base.length + 1).split(sep).join('/'));
  }
  return out;
}

const decode = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

/**
 * @param {string} dir — `out/` хавтас
 * @returns {{ ok: boolean, errors: string[], pages: number, refs: number }}
 */
export function verifyOut(dir) {
  const errors = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { ok: false, errors: [`${dir} хавтас алга — \`npm run build\` (output: 'export') ажиллаагүй юу?`], pages: 0, refs: 0 };
  }
  if (!existsSync(join(dir, 'index.html'))) errors.push('index.html алга');
  if (!existsSync(join(dir, '404.html')) && !existsSync(join(dir, '404', 'index.html'))) errors.push('404.html алга');
  const pages = htmlFiles(dir);
  const refs = new Map(); // хаяг → эхний HTML
  for (const page of pages) {
    const html = readFileSync(join(dir, page), 'utf8');
    for (const m of html.matchAll(REF_RE)) {
      const ref = decode(m[1].replace(/&amp;/g, '&'));
      if (!refs.has(ref)) refs.set(ref, page);
    }
  }
  if (!refs.size) errors.push('HTML-д `/_next/static/` лавлагаа НЭГ Ч олдсонгүй — build эвдэрсэн эсвэл шалгалт хуучирсан');
  for (const [ref, page] of refs) {
    if (!existsSync(join(dir, ...ref.slice(1).split('/')))) errors.push(`${ref} — файл алга (${page}-д заасан)`);
  }
  return { ok: errors.length === 0, errors, pages: pages.length, refs: refs.size };
}

/* ── CLI ── */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'out';
  const r = verifyOut(dir);
  if (!r.ok) {
    console.error(`❌ outVerify: ${dir} — ${r.errors.length} алдаа:\n  ${r.errors.slice(0, 50).join('\n  ')}`);
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(`::error title=outVerify::${r.errors.slice(0, 10).join(' · ').replace(/%/g, '%25').replace(/\r?\n/g, ' ')}`);
    }
    process.exit(1);
  }
  console.log(`✅ outVerify: ${dir} — ${r.pages} HTML · ${r.refs} \`/_next/static\` лавлагаа бүгд байна`);
}
