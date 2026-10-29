/**
 * MA · MIR БАРИМТ — геопорталын item (2026-10-29): `chanarDocs` + `entDocs.entUploadDoc` — сүлжээгүй (fetch стуб).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/chanarDocs.check.mjs
 *
 *   · item-ийн таг = `selbe-portal` · `selbe-chanar-doc` · `ma:<№>` · `t:<төрөл>`; зураг → `Image`, PDF → `PDF`; бусад файл татгалзана
 *   · мета `description`-д (`formatKeywords`), хавтас нэрээр олдоно/үүснэ, байгууллагад хуваалцана
 *   · жагсаалт — тагаар хайгаад яг тагтайг л үлдээнэ; `docKey` зай · таслал · хаалт хасна, жижиг үсэг
 */
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.dispatchEvent = () => true;
globalThis.location = { hostname: 'localhost', origin: 'http://localhost:8123', href: 'http://localhost:8123/' };

/* ── fetch стуб: порталын sharing/rest замууд ── */
const calls = [];
const folders = [{ id: 'fMIR', title: 'Survey-MIR' }];
let searchResults = [];
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const body = init?.body;
  const field = (k) => (body instanceof FormData ? body.get(k) : body instanceof URLSearchParams ? body.get(k) : null);
  calls.push({ u, field });
  if (/\/generateToken$/.test(u)) return json({ token: 'T', expires: Date.now() + 3_600_000 });
  if (/\/community\/self$/.test(u)) return json({ username: 'tumenjargal_selbe' });
  if (/\/content\/users\/[^/]+$/.test(u)) return json({ folders });
  if (/\/createFolder$/.test(u)) { const id = `f${folders.length + 1}`; folders.push({ id, title: field('title') }); return json({ success: true, folder: { id } }); }
  if (/\/addItem$/.test(u)) return json({ success: true, id: 'item1' });
  if (/\/items\/item1\/share$/.test(u)) return json({ notSharedWith: [] });
  if (/\/content\/items\/item1$/.test(u)) {
    const add = calls.find((c) => /\/addItem$/.test(c.u));
    return json({ id: 'item1', title: add.field('title'), owner: 'tumenjargal_selbe', modified: 5, size: 3, access: 'org',
      tags: String(add.field('tags')).split(','), description: add.field('description'), type: add.field('type'), name: 'cert.png' });
  }
  if (/\/search$/.test(u)) return json({ results: searchResults, nextStart: -1 });
  if (/\/items\/item1\/delete$/.test(u)) return json({ success: true });
  if (/\/items\/item1\/data$/.test(u)) return new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200, headers: { 'content-type': 'image/png' } });
  throw new Error(`стубгүй зам: ${u}`);
};

const { entSignIn } = await import('@/lib/entDocs.ts');
const { addDoc, deleteDoc, docBlob, docKey, docOfItem, listDocs, DOC_TAG, formatKeywords } = await import('@/lib/chanarDocs.ts');
await entSignIn('tumenjargal_selbe', 'x');

let n = 0;
const ok = async (name, fn) => { await fn(); n += 1; console.log('  ✓', name); };

await ok('docKey — зай · таслал · хаалт хасна, жижиг үсэг', () => {
  assert.equal(docKey('ma', 'SLB-REP-MA-P0100-0015-00'), 'ma:slb-rep-ma-p0100-0015-00');
  assert.equal(docKey('mir', '{2D70DC7C-7BEC}'), 'mir:2d70dc7c-7bec');
  assert.equal(docKey('ma', 'a b,c'), 'ma:abc');
});

await ok('addDoc — зураг → Image item, таг · мета · хавтас (үүсгэнэ) · хуваалцалт', async () => {
  calls.length = 0;
  const file = new File([new Uint8Array([137, 80])], 'cert.png', { type: 'image/png' });
  const { doc, warn } = await addDoc({ key: 'ma:x1', folder: 'Survey-MA' }, file, { type: 'conf', no: 'TC-1', std: 'MNS 1', valid: '2027-01-01' });
  assert.equal(warn, undefined);
  const add = calls.find((c) => /\/addItem$/.test(c.u));
  assert.ok(add, 'addItem дуудагдсан');
  assert.match(add.u, /\/content\/users\/tumenjargal_selbe\/f2\/addItem$/, 'шинэ хавтас (Survey-MA) үүсгээд түүнд');
  assert.equal(folders.at(-1).title, 'Survey-MA');
  assert.equal(add.field('type'), 'Image');
  assert.equal(add.field('title'), 'cert', 'нэр = файлын нэр (өргөтгөлгүй)');
  assert.deepEqual(String(add.field('tags')).split(','), ['selbe-portal', DOC_TAG, 'ma:x1', 't:conf']);
  assert.equal(add.field('description'), formatKeywords({ type: 'conf', no: 'TC-1', std: 'MNS 1', valid: '2027-01-01', title: 'cert' }));
  assert.ok(calls.some((c) => /\/items\/item1\/share$/.test(c.u) && c.field('org') === 'true'), 'байгууллагад хуваалцсан');
  assert.ok(!calls.some((c) => /\?.*token=/.test(c.u)), 'токен URL-д орохгүй');
  assert.equal(doc.id, 'item1');
  assert.equal(doc.owner, 'tumenjargal_selbe');
  assert.equal(doc.contentType, 'image/*');
  assert.deepEqual(doc.meta, { type: 'conf', no: 'TC-1', std: 'MNS 1', valid: '2027-01-01', title: 'cert' });
});

await ok('addDoc — PDF → PDF item, өгсөн нэр; хавтас байвал дахин үүсгэхгүй', async () => {
  calls.length = 0;
  const file = new File([new Uint8Array([37, 80])], 'lab.pdf', { type: 'application/pdf' });
  await addDoc({ key: 'mir:r1', folder: 'Survey-MIR' }, file, { type: 'lab', title: 'Лаб дүн №3' });
  const add = calls.find((c) => /\/addItem$/.test(c.u));
  assert.equal(add.field('type'), 'PDF');
  assert.equal(add.field('title'), 'Лаб дүн №3');
  assert.match(add.u, /\/fMIR\/addItem$/, 'байгаа хавтас');
  assert.ok(!calls.some((c) => /\/createFolder$/.test(c.u)));
});

await ok('addDoc — бусад файл татгалзана', async () => {
  const file = new File([new Uint8Array([1])], 'a.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  await assert.rejects(addDoc({ key: 'ma:x1', folder: 'Survey-MA' }, file, { type: 'other' }), /PDF, JPG, PNG/);
});

await ok('listDocs — тагаар хайж, яг тагтайг л үлдээнэ; мета description-оос', async () => {
  searchResults = [
    { id: 'item1', title: 'cert', owner: 'u1', modified: 9, size: 3, tags: ['selbe-portal', DOC_TAG, 'ma:x1', 't:conf'], description: 't=conf;no=TC-1;ti=cert', type: 'Image', name: 'cert.png' },
    { id: 'item2', title: 'other', owner: 'u2', modified: 8, size: 1, tags: ['selbe-portal', DOC_TAG, 'ma:x10'], description: '', type: 'PDF', name: 'o.pdf' },
  ];
  calls.length = 0;
  const l = await listDocs('ma:x1');
  const q = calls.find((c) => /\/search$/.test(c.u)).field('q');
  assert.equal(q, `tags:"${DOC_TAG}" AND tags:"ma:x1"`);
  assert.deepEqual(l.map((d) => d.id), ['item1'], 'ma:x10 (ойролцоо) орохгүй');
  assert.equal(l[0].meta.no, 'TC-1');
  assert.equal(l[0].meta.title, 'cert');
  assert.equal(l[0].name, 'cert.png');
  const d2 = docOfItem(searchResults[1]);
  assert.equal(d2.meta.type, 'other');
  assert.equal(d2.meta.title, 'other', 'description-д нэр алга → item-ийн нэр');
});

await ok('deleteDoc · docBlob — эзний замаар устгана, файл content-type-той', async () => {
  calls.length = 0;
  await deleteDoc({ id: 'item1', owner: 'tumenjargal_selbe', name: '', size: null, contentType: '', meta: { type: 'other' }, modified: 0 });
  assert.ok(calls.some((c) => /\/content\/users\/tumenjargal_selbe\/items\/item1\/delete$/.test(c.u)));
  const b = await docBlob({ id: 'item1', owner: '', name: '', size: null, contentType: '', meta: { type: 'other' }, modified: 0 });
  assert.equal(b.type, 'image/png');
  assert.equal(b.size, 3);
});

/* Эх кодын гэрээ — MA · MIR хоёулаа item замаар; feature attachment код алга */
{
  const { readFileSync } = await import('node:fs');
  const ma = readFileSync('src/lib/ma.ts', 'utf8');
  const mir = readFileSync('src/lib/mir.ts', 'utf8');
  await ok('ma.ts · mir.ts — chanarDocs-оор; addAttachment · deleteAttachments алга', () => {
    assert.ok(ma.includes("from '@/lib/chanarDocs'") && mir.includes("from '@/lib/chanarDocs'"));
    assert.ok(!/addAttachment|deleteAttachments|hasAttachments/.test(ma), ma.match(/addAttachment|deleteAttachments|hasAttachments/)?.[0]);
    assert.ok(ma.includes("MA_DOC_FOLDER = 'Survey-MA'") && mir.includes("MIR_DOC_FOLDER = 'Survey-MIR'"), 'Connect-ийн хавтасны нэр');
  });
}

console.log(`chanarDocs: ${n} шалгуур давлаа`);
