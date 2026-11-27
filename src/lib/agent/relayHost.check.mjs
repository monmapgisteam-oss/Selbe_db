/**
 * ИТГЭМЖЛЭГДСЭН РЕЛЕЙН ХОСТ (2026-11-27, аудит) — хэрэглэгчийн ArcGIS токен зөвхөн манай релей рүү.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/agent/relayHost.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { relayHostTrusted } = await import('./client.ts');

for (const u of [
  'https://ai.selbecity.mn', 'https://api.smart.selbecity.mn', 'https://monmap.tailae6be6.ts.net',
  'https://selbe-agent.monmapgisteam.workers.dev', 'http://127.0.0.1:8787', 'http://localhost:8787',
]) assert.equal(relayHostTrusted(u), true, `итгэмжлэгдсэн: ${u}`);

for (const u of [
  'https://evil.example.com', 'https://selbecity.mn.evil.com', 'https://xselbecity.mn', 'https://other.workers.dev',
  'https://selbe-agent.other.workers.dev', 'https://foo.ts.net', 'not a url',
]) assert.equal(relayHostTrusted(u), false, `итгэмжлэгдээгүй: ${u}`);

const src = readFileSync(new URL('./client.ts', import.meta.url), 'utf8');
assert.match(src, /\.filter\(\(u\) => relayUrlOk\(u\) && relayHostTrusted\(u\)\)/, 'AGENT_APIS итгэмжлэгдсэн хостоор шүүгдэнэ');

/* Нийтэд нээлттэй PDF алга — «ТЭЗҮ-БОНУ» баримт геопорталаас (токеноор) */
const docs = readFileSync(new URL('../docs.ts', import.meta.url), 'utf8');
assert.ok(!/file:\s*["'][^"']+\.pdf["']/.test(docs), 'lib/docs.ts-д public/docs PDF үлдсэн');
const gi = readFileSync(new URL('../../../.gitignore', import.meta.url), 'utf8');
assert.ok(!/^!public\/docs\/\*\.pdf/m.test(gi), '.gitignore public/docs PDF-ийг дахин зөвшөөрч байна');

console.log('relayHost.check: OK');
