/**
 * Survey123 MA маягтын «Хамаарах ажлууд» жагсаалт — `media/works.csv` (name,label,pkg).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs tools/ma-works-csv.mjs [out.csv]
 *   Токен: ARCGIS_ADMIN_TOKEN (env эсвэл.env.development.local) — бөглөх хуудсууд нэргүй уншигдахгүй.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildWorksCsv } from '@/lib/maWorks';

let TOK = process.env.ARCGIS_ADMIN_TOKEN || '';
if (!TOK) {
  try { const m = /^ARCGIS_ADMIN_TOKEN=(.+)$/m.exec(readFileSync('.env.development.local', 'utf8')); if (m) TOK = m[1].trim(); } catch { /* алга */ }
}
if (!TOK) throw new Error('ARCGIS_ADMIN_TOKEN алга — env эсвэл .env.development.local');
const ORG = (process.env.NEXT_PUBLIC_ENT_DATA || '').replace(/\/+$/, '').replace(/\/Hosted$/i, '');
const orig = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (ORG && url.startsWith(ORG)) {
    const b = init?.body;
    if (b instanceof URLSearchParams || b instanceof FormData) { b.set('token', TOK); return orig(input, { ...init, body: b }); }
    if (!b) return orig(input, { ...init, method: 'POST', body: new URLSearchParams({ f: 'json', token: TOK }) });
  }
  return orig(input, init);
};

const out = process.argv[2] || 'works.csv';
const { csv, count, failed } = await buildWorksCsv((d, t, p) => { if (p) console.log(`${d + 1}/${t} ${p}`); });
writeFileSync(out, csv, 'utf8');
console.log(`${out}: нийт ${count} ажил${failed.length ? ` · уншигдаагүй: ${failed.join(', ')}` : ''}`);
