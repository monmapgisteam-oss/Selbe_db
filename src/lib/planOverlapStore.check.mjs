/**
 * ДАВХЦЛЫН ХӨТЧИЙН ХАДГАЛАЛТ (IndexedDB, 24 цаг) — зөвхөн «Шинэчлэх» товч ба «Дэд бүтэц»-ийн засвар арилгана (2026-11-09).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/planOverlapStore.check.mjs
 *
 * Хамгаалж буй алдаа: `register(…, [])` слот дотор `clearOverlapStore()` дуудагддаг байсан тул `invalidateAll` — табд
 * 5 минутаас хойш буцаж ирэх ба хэл солих бүрд — хадгалалт байнга устдаг байв.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./planOverlap.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const portal = readFileSync(new URL('../components/Portal.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const reg = /\nregister\(\(\) => \{([^\n]*)\}, \[\]\);/.exec(src);
assert.ok(reg, 'register(…, []) слот олдсонгүй');
assert.match(reg[1], /infraCache = null; resultCache\.clear\(\); displayCache = new WeakMap\(\);/, 'санах ойн кэш ерөнхий слотоор');
assert.doesNotMatch(reg[1], /clearOverlapStore/, 'ерөнхий слот хөтчийн хадгалалтыг арилгахгүй');
assert.match(src, /subscribeTotals\(\(\) => \{[^\n]*void clearOverlapStore\(\); \}\);/, 'геометрийн засвар хадгалалтыг арилгана');
const refresh = /const refreshData = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[\]\);/.exec(portal);
assert.ok(refresh, 'Portal.refreshData олдсонгүй');
assert.match(refresh[1], /m\.clearOverlapStore\(\)/, '«Шинэчлэх» товч хадгалалтыг арилгана');
assert.ok(refresh[1].indexOf('clearOverlapStore') < refresh[1].indexOf('invalidateAll()'), 'хадгалалтыг invalidateAll-аас өмнө арилгана');
console.log('planOverlapStore.check: OK');
