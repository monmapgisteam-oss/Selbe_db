/**
 * DEV ТОКЕН — нэвтрэлт унтраалттай ЛОКАЛ dev серверт л (2026-10-29). Статик + ажиллагааны шалгуур.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/devToken.check.mjs
 *
 * Хамгаалж буй дүрэм:
 *   1. `next.config.mjs` — `NEXT_DEV_ARCGIS_TOKEN` нь ЗӨВХӨН `NODE_ENV === 'development' && NEXT_PUBLIC_AUTH_OFF === '1'`
 *      үед ARCGIS_ADMIN_TOKEN, бусад үед '' (production багцад токен ХЭЗЭЭ Ч орохгүй).
 *   2. `authToken.devToken` — гурван хаалт: development · `AUTH.appId` хоосон · localhost/127.0.0.1/[::1] хост.
 *   3. `NEXT_DEV_ARCGIS_TOKEN`-ийг кодод ӨӨР газар уншихгүй (нэг л зам).
 *   4. Ажиллагаа: dev + AUTH_OFF + localhost → `tokenParam()` = { token }; өөр хост → {}; production → {}.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

/* ── 1. next.config.mjs ── */
const cfg = read('next.config.mjs');
assert.match(cfg, /NEXT_DEV_ARCGIS_TOKEN: process\.env\.NODE_ENV === 'development' && process\.env\.NEXT_PUBLIC_AUTH_OFF === '1'\s*\n\s*\? \(process\.env\.ARCGIS_ADMIN_TOKEN \?\? ''\)\s*\n\s*: ''/,
  'next.config.mjs: NEXT_DEV_ARCGIS_TOKEN нь development + AUTH_OFF үед л, бусад үед хоосон байх ёстой');
console.log('  ✓ next.config — development + AUTH_OFF үед л, бусад үед хоосон');

/* ── 2. authToken.devToken — гурван хаалт ── */
const at = read('src/lib/authToken.ts');
assert.match(at, /export function devTokenFor\([\s\S]{0,300}o\.nodeEnv !== 'development' \|\| o\.appId\) return null;/, 'devTokenFor: development ба appId хаалт');
assert.match(at, /\/\^\(localhost\|127\\\.0\\\.0\\\.1\|\\\[::1\\\]\)\$\/\.test\(o\.hostname\)/, 'devTokenFor: localhost хостын хаалт');
assert.match(at, /nodeEnv: process\.env\.NODE_ENV,\s*appId: AUTH\.appId,[\s\S]{0,200}hostname: typeof window !== 'undefined' && window\.location \? window\.location\.hostname \?\? null : null,\s*token: process\.env\.NEXT_DEV_ARCGIS_TOKEN,/, 'devToken: бодит оролтууд (window/location-гүй үед null)');
assert.match(at, /if \(!esri \|\| !sharing\) return devToken\(\);/, 'authToken(): нэвтрэлтгүй үед devToken руу унана');
console.log('  ✓ authToken.devToken — development · appId хоосон · localhost');

/* ── 3. Нэг л уншигч ── */
const hits = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx|mjs)$/.test(name) || /\.check\.mjs$/.test(name)) continue;
    if (readFileSync(p, 'utf8').includes('NEXT_DEV_ARCGIS_TOKEN')) hits.push(p.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/'));
  }
})(new URL('src', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
assert.deepEqual(hits, ['src/lib/authToken.ts'], 'NEXT_DEV_ARCGIS_TOKEN-ийг зөвхөн authToken.ts уншина');
console.log('  ✓ NEXT_DEV_ARCGIS_TOKEN — ганц уншигч (authToken.ts)');

/* ── 4. Ажиллагаа (цэвэр дүрэм `devTokenFor` — env/загварын төлөвөөс хамаарахгүй) ── */
const { devTokenFor, tokenParam } = await import('../src/lib/authToken.ts');
const base = { nodeEnv: 'development', appId: '', hostname: 'localhost', token: 'dev-token-test' };
assert.equal(devTokenFor(base), 'dev-token-test', 'dev + AUTH_OFF + localhost → токен');
assert.equal(devTokenFor({ ...base, hostname: '127.0.0.1' }), 'dev-token-test');
assert.equal(devTokenFor({ ...base, hostname: '[::1]' }), 'dev-token-test');
assert.equal(devTokenFor({ ...base, hostname: '192.168.1.20' }), null, 'LAN хост → токенгүй');
assert.equal(devTokenFor({ ...base, hostname: 'smart.selbecity.mn' }), null, 'домэйн → токенгүй');
assert.equal(devTokenFor({ ...base, hostname: null }), null, 'хөтчгүй (SSR) → токенгүй');
assert.equal(devTokenFor({ ...base, nodeEnv: 'production' }), null, 'production → токенгүй');
assert.equal(devTokenFor({ ...base, nodeEnv: undefined }), null);
assert.equal(devTokenFor({ ...base, appId: 'abc' }), null, 'нэвтрэлт асаалттай → токенгүй');
assert.equal(devTokenFor({ ...base, token: '  ' }), null, 'хоосон токен → null');
/* Нэвтрээгүй, хөтчгүй (Node) → tokenParam {} — урьдын зан хэвээр */
assert.deepEqual(tokenParam(), {}, 'хөтчгүй үед токенгүй');
console.log('  ✓ ажиллагаа — localhost л; LAN/домэйн/SSR/production/нэвтрэлт асаалттай → токенгүй');

console.log('✅ devToken.check: dev токен зөвхөн локал dev сервер, нэвтрэлт унтраалттай үед');
