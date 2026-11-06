/**
 * WEBMAP ЗАГВАРЫН ХАЙЛТ.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/webmapStyle.check.mjs
 *
 * Снапшотын түлхүүр нь давхаргын id. `norm` том жижиг үсгийг нэгтгэдэг тул `roadOld` хэзээ ч олддоггүй байв.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWebmapStyle, webmapStyleOf } from './webmapStyle.ts';

const snapshot = JSON.parse(readFileSync(new URL('../../public/webmap-style.json', import.meta.url), 'utf8'));
const realFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => snapshot });
try {
  await loadWebmapStyle();
} finally {
  globalThis.fetch = realFetch;
}

for (const id of Object.keys(snapshot)) {
  assert.equal(webmapStyleOf(id), snapshot[id], `снапшотын «${id}» загвар олдсонгүй`);
}
assert.equal(webmapStyleOf('roadOld')?.color, snapshot.roadOld.color, 'том үсэгтэй id');
assert.equal(webmapStyleOf('ROAD/'), snapshot.road, 'хэлбэр нэгтгэсэн хайлт хэвээр');
assert.equal(webmapStyleOf('байхгүй-давхарга'), undefined);

console.log('webmapStyle.check: OK');
