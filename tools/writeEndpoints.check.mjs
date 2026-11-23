/**
 * БИЧИХ ЗАМЫН ТАНИЛТ (2026-11-23, аудит №30) — сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/writeEndpoints.check.mjs
 *
 * Хамгаалж буй алдаа: тестийн бичилтийн хаалт (`liveFetch.installWriteGuard`) ба dev токены бичилт хориг
 * (`authToken.isWriteEndpoint`) хавсралт (`addAttachment` · `updateAttachment` · `deleteAttachments`), порталын item
 * засвар (`/items/{id}/update`), хавтас үүсгэх (`createFolder`), зөөх (`move`)-ыг бичилт гэж танихгүй байв.
 * Унших замууд (query · queryAttachments · /items/{id} · /data г.м.) хаагдахгүй.
 */
import assert from 'node:assert/strict';
import { isWriteEndpoint } from '../src/lib/authToken.ts';
import { installWriteGuard, writeAttempts } from './liveFetch.mjs';

const FS = 'https://gis.selbecity.mn/map/rest/services/Hosted/X/FeatureServer/0';
const PORTAL = 'https://gis.selbecity.mn/geoportal/sharing/rest/content/users/u';
const WRITES = [
  `${FS}/applyEdits`, `${FS}/applyEdits?f=json`, `${FS}/addFeatures`, `${FS}/deleteFeatures`,
  `${FS}/12/addAttachment`, `${FS}/12/updateAttachment`, `${FS}/12/deleteAttachments`,
  `${PORTAL}/items/abc123/update`, `${PORTAL}/items/abc123/move`, `${PORTAL}/createFolder`, `${PORTAL}/addItem`,
  `${PORTAL}/items/abc123/delete`,
];
const READS = [
  `${FS}/query`, `${FS}/query?f=json`, `${FS}/queryAttachments`, `${FS}/12/attachments`, `${FS}/12/attachments/3`,
  `${FS}`, `${FS}?f=json`, 'https://gis.selbecity.mn/geoportal/sharing/rest/content/items/abc123',
  'https://gis.selbecity.mn/geoportal/sharing/rest/content/items/abc123/data',
  'https://gis.selbecity.mn/geoportal/sharing/rest/community/self', `${FS}/queryRelatedRecords`,
  'https://gis.selbecity.mn/map/rest/services/Hosted/updates_log/FeatureServer/0/query',
];

for (const u of WRITES) assert.equal(isWriteEndpoint(u), true, `authToken: бичилт гэж танигдсангүй — ${u}`);
for (const u of READS) assert.equal(isWriteEndpoint(u), false, `authToken: унших замыг бичилт гэв — ${u}`);
console.log(`✅ authToken.isWriteEndpoint: ${WRITES.length} бичих зам · ${READS.length} унших зам`);

const realFetch = globalThis.fetch;
let passed = 0;
globalThis.fetch = async () => { passed++; return new Response('{"ok":true}', { status: 200 }); };
try {
  installWriteGuard({ stubAppTables: false });
  const before = writeAttempts();
  for (const u of WRITES) {
    const r = await (await globalThis.fetch(u, { method: 'POST', body: new URLSearchParams({ f: 'json' }) })).json();
    assert.equal(r.error?.code, 403, `liveFetch: бичилт хаагдсангүй — ${u}`);
  }
  assert.equal(writeAttempts() - before, WRITES.length, 'хаалтын тоолуур');
  assert.equal(passed, 0, 'бичилт бодит fetch руу хүрсэнгүй');
  for (const u of READS) {
    const r = await (await globalThis.fetch(u)).json();
    assert.equal(r.ok, true, `liveFetch: унших замыг хаав — ${u}`);
  }
  assert.equal(passed, READS.length);
} finally {
  globalThis.fetch = realFetch;
}
console.log(`✅ liveFetch.installWriteGuard: ${WRITES.length} бичих зам хаагдав · ${READS.length} унших зам нээлттэй`);
