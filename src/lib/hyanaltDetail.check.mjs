/**
 * ХЯНАГЧИЙН ХАРАГДАЦ = БАТЛАЛТ — хуучин илгээлтийн давтамжийг ижил дүрмээр нөхнө (2026-10-04).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hyanaltDetail.check.mjs
 *
 * ⚠️ REGRESSION: `hyanaltStore.archiveSubmission` (батлалт) нь `rowOcc`-гүй илгээлтэд
 *    `needsFrameOcc → withFrameOcc`-оор давтамжийг СУУРЬ жаазаас нөхөж архивт бичдэг болсон
 *    атлаа хянагчийн харагдац (`hyanaltDetail.loadStaged`) ба бөглөх хуудасны тодруулга
 *    (`useFlow`) нөхдөггүй байв — хянагч ХАРААГҮЙ нүд батлагдана. Эх кодын шалгуур (сүлжээгүй).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const det = src('./hyanaltDetail.ts');
const fn = det.slice(det.indexOf('async function loadStaged('));
assert.ok(fn.length > 0, 'loadStaged олдсонгүй');
const occ = fn.indexOf('needsFrameOcc(pl, loaded.rows)');
const with_ = fn.indexOf('withFrameOcc(pl,');
const ov = fn.indexOf('overlaySubmission(loaded.rows, pl,');
assert.ok(occ > 0 && with_ > occ, 'loadStaged: needsFrameOcc → withFrameOcc алга');
assert.ok(ov > with_, 'loadStaged: overlay нь нөхсөн payload-оор (withFrameOcc-ийн ДАРАА)');
assert.ok(/unmoved: ov\.unmoved/.test(fn), 'loadStaged: `unmoved` тоог буцаана');

const store = src('./hyanaltStore.ts');
assert.ok(/needsFrameOcc\(pl, loaded\.rows\)[\s\S]{0,200}withFrameOcc\(pl, baseRows0\)/.test(store), 'батлалтын зам (лавлагаа) өөрчлөгдсөн');

const flow = src('../modules/sheet/fill/useFlow.ts');
assert.ok(/needsFrameOcc\(pl, base\.rows\)[\s\S]{0,200}withFrameOcc\(pl,/.test(flow), 'useFlow: тодруулга нөхсөн payload-оор');
assert.ok(flow.includes('overlaySubmission(base.rows, pl, sc'), 'useFlow: overlay нөхсөн `pl`-ээр');

const g = src('../modules/Guitsetgel.tsx');
assert.ok(g.includes('data.unmoved'), 'Guitsetgel: тулгагдаагүй нүдний тоог харуулна');
console.log('✅ hyanaltDetail · useFlow — батлалттай ижил withFrameOcc · unmoved харагдана');

/* ── 2026-10-09: F2 огноогүй хэлтэрхийн нэг дүрэм · F4 гүн `gun`-аас ── */
/* 2026-10-09 (F3): доод хязгаарт зураглалын хоосон мөрийг хасна — latestWhere-тэй ижил baseBlankCount */
assert.ok(det.includes('nullFragmentFits(nRows, nNull, nExpect, await baseBlankCount(p, sc))') && !det.includes('nRows + nNull === nExpect'),
  'hyanaltDetail: огноогүй хэлтэрхийг bagtsSheet-тэй НЭГ туслахаар (nullFragmentFits) шалгана');
assert.ok(/sc.f.ratio, sc.f.gun,/.test(det) && det.includes('depth: gunDepth ? gunDepth[ri]'),
  'hyanaltDetail: гүнийг эхлээд gun баганаас уншина');
console.log('✅ hyanaltDetail — огноогүй хэлтэрхий (нэмэлт мөртэй) · gun гүн');

/* Approved archive identity (2026-10-21): run the actual reader against fake
   ArcGIS SDK/fetch, including two real sheets whose OBJECTIDs overlap.
   Standalone, offline: node --experimental-transform-types src/lib/hyanaltDetail.check.mjs */
process.env.SELBE_ENT_OFF = '1';
process.env.NEXT_PUBLIC_ENT_DATA = 'https://archive.test/rest/services/Hosted';
process.env.NEXT_PUBLIC_PORTAL_URL = 'https://archive.test/portal';
process.env.NEXT_PUBLIC_ALLOWED_ORG_ID = 'archive-test';
process.env.NEXT_PUBLIC_AUTH_APP_ID = 'archive-test';
Object.assign(process.env, {
  NEXT_PUBLIC_HABEA_LABOR_SVC: 'archive_test_labor',
  NEXT_PUBLIC_HABEA_INCIDENT_SVC: 'archive_test_incident',
  NEXT_PUBLIC_HABEA_UZLEG_V11_SVC: 'archive_test_uzleg_v11',
  NEXT_PUBLIC_HABEA_UZLEG_G_SVC: 'archive_test_uzleg_g',
});
register('../../tools/ts-alias-hooks.mjs', import.meta.url);

const TABLE = 'https://archive.test/rest/services/Selbe_Guitsetgel_Draft/FeatureServer';
const state = { sub: null, failRead: false, sheets: new Map(), reads: [], unexpected: [] };
globalThis.__hyanaltDetailFeatureLayer = class {
  constructor({ url }) { assert.equal(url, `${TABLE}/0`); }
  async load() { return this; }
  async queryFeatures(q) {
    if (state.failRead) throw new Error('submission read failed');
    const oid = Number(/^OBJECTID = (\d+)$/.exec(q.where)?.[1]);
    return { features: state.sub?.OBJECTID === oid ? [{ attributes: state.sub }] : [] };
  }
};
globalThis.__hyanaltDetailIdentity = {
  findCredential: () => ({ token: 'fake-token', userId: 'archive-test' }),
};
register('data:text/javascript,' + encodeURIComponent(`
const mocks = {
  '@arcgis/core/layers/FeatureLayer': 'export default globalThis.__hyanaltDetailFeatureLayer;',
  '@arcgis/core/identity/IdentityManager': 'export default globalThis.__hyanaltDetailIdentity;',
  '@arcgis/core/config': 'export default { request: { interceptors: [] } };',
};
export async function resolve(spec, ctx, next) {
  const source = mocks[spec.replace(/\\.js$/, '')];
  return source ? { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true } : next(spec, ctx);
}`));

const realFetch = globalThis.fetch;
const json = (v) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
const { PKGS } = await import('../modules/sheet/bagts.pkg.ts');
const { TREES } = await import('../modules/sheet/bagts.trees.ts');
const { ROLE_BY_USER, HJ } = await import('./services.ts');
const owner = Object.keys(ROLE_BY_USER).find((k) => ROLE_BY_USER[k] === 'super');
assert.ok(owner, 'draft table has a recognized owner');
const byUrl = new Map(PKGS.map((p) => [p.url, p]));
const frame = (key, oid, day, value = 12) => {
  const pkg = PKGS.find((p) => p.key === key);
  const block = pkg.floors === 12 ? 'F6_1' : 'F5_1';
  const fields = ['OBJECTID', 'F_', 'Ажил', 'Обьём', 'obyem_sum', 'gun', 'buglusun_ognoo',
    'Шинэчлэгдсэн_огноо', 'Хувийн_жин', 'Хувийн_жин1', `${block}_obyem`, `${block}_гүйцэтгэл`, `${block}_төлөвлөгөөт`]
    .map((name) => ({ name, type: name.includes('огноо') || name === 'buglusun_ognoo' ? 'esriFieldTypeDate' : 'esriFieldTypeDouble' }));
  const features = Array.from({ length: TREES[key].length }, (_, i) => ({ attributes: {
    OBJECTID: oid + i, F_: String(i + 1), Ажил: `${key} work ${i}`, Обьём: 100,
    obyem_sum: value, gun: 0, buglusun_ognoo: day, Шинэчлэгдсэн_огноо: day,
    Хувийн_жин: 1, Хувийн_жин1: 1, [`${block}_obyem`]: value, [`${block}_гүйцэтгэл`]: value / 100,
  } }));
  state.sheets.set(key, { fields, features });
};
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const body = new URLSearchParams(init?.body);
  if (url.endsWith('/sharing/rest/search'))
    return json({ results: [{ title: 'Selbe_Guitsetgel_Draft', url: TABLE, owner }] });
  if (url === `${HJ}/huvaari_20260906/FeatureServer/193`) return json({ fields: [] });
  if (url === `${HJ}/huvaari_20260906/FeatureServer/193/query`) return json({ features: [] });
  const query = url.endsWith('/query');
  const pkg = byUrl.get(query ? url.slice(0, -6) : url);
  if (!pkg) {
    state.unexpected.push(url);
    throw new Error('Unexpected request in offline archive test');
  }
  state.reads.push(pkg.key);
  const sheet = state.sheets.get(pkg.key) ?? { fields: [{ name: 'buglusun_ognoo' }], features: [] };
  if (!query) return json({ fields: sheet.fields });
  const where = body.get('where') ?? '';
  const oid = /^OBJECTID = (\d+)$/.exec(where);
  let features = sheet.features;
  if (oid) features = features.filter((f) => f.attributes.OBJECTID === Number(oid[1]));
  else if (where === 'buglusun_ognoo IS NULL' || /buglusun_ognoo < timestamp/.test(where)) features = [];
  if (body.get('returnCountOnly') === 'true') return json({ count: features.length });
  if (body.has('outStatistics')) {
    const stats = JSON.parse(body.get('outStatistics'));
    const a = Object.fromEntries(stats.map((s) => [s.outStatisticFieldName,
      features.length ? Math.max(...features.map((f) => f.attributes[s.onStatisticField])) : null]));
    return json({ features: [{ attributes: a }] });
  }
  const offset = Number(body.get('resultOffset') ?? 0);
  const limit = Number(body.get('resultRecordCount') ?? 2000);
  return json({ features: features.slice(offset, offset + limit), exceededTransferLimit: offset + limit < features.length });
};
const { loadSubmission } = await import('./hyanaltDetail.ts');
const DAY_9 = Date.UTC(2026, 8, 9);
const DAY_12 = Date.UTC(2026, 9, 11);
const payload = (extra = {}) => ({ v: 1, pkgKey: 'b1_12f', user: 'archive-test', at: DAY_12,
  fillMs: DAY_12, base: null, asOf: null, cells: [], dates: [], adds: [], rowKeys: [], ...extra });
const submission = (extra = {}, done = true, oid = 44) => {
  const pl = payload(extra);
  state.sub = { OBJECTID: oid, dkey: `${done ? 'done' : 'sub'}|${pl.pkgKey}|${oid}`, payload: JSON.stringify(pl) };
  state.reads = [];
};

try {
  frame('b1_9f', 4807, DAY_9, 9);
  frame('b1_12f', 4807, DAY_12, 24);
  submission({ archiveOid: 4807 });
  const approved = await loadSubmission('Багц 1', 44);
  assert.equal(approved?.pkgKey, 'b1_12f', 'approved payload must retain its floor when both tables contain the OID');
  assert.equal(approved.day, '2026-10-11');
  assert.deepEqual(approved.blocks, ['6/1']);
  assert.equal(approved.filled[0].cells[0], 24);
  assert.equal(approved.filled[0].work, 'b1_12f work 0');
  assert.ok(state.reads.every((k) => k === 'b1_12f'), 'approved read queries only its declared sheet');

  submission({ archiveOid: 4807 }, false);
  assert.equal((await loadSubmission('Багц 1', 44))?.pkgKey, 'b1_12f', 'archive pointer also constrains a not-yet-closed submission');

  state.sheets.get('b1_12f').features = [];
  submission({ archiveOid: 4807 });
  assert.equal(await loadSubmission('Багц 1', 44), null, 'missing approved archive row cannot fall back to another floor');
  assert.ok(state.reads.every((k) => k === 'b1_12f'));

  submission({ pkgKey: 'unregistered_sheet', archiveOid: 4807 });
  await assert.rejects(loadSubmission('Багц 1', 44), /unregistered_sheet/);
  assert.deepEqual(state.reads, [], 'unknown declared package cannot trigger a legacy floor search');
  submission({ pkgKey: 'b2_12f', archiveOid: 4807 });
  await assert.rejects(loadSubmission('Багц 1', 44), /Багц 2/);
  assert.deepEqual(state.reads, [], 'approved group mismatch stops before archive reads');

  frame('b42_12f', 4807, DAY_12);
  submission({ pkgKey: 'b42_12f', archiveOid: 4807 });
  assert.equal((await loadSubmission('Багц 4.2', 44))?.pkgKey, 'b42_12f', 'approved group validation retains normalized aliases');

  frame('b1_12f', 44, DAY_12);
  frame('b1_9f', 44, DAY_9);
  submission();
  assert.equal(await loadSubmission('Багц 1', 44), null, 'done record without archiveOid must not treat the draft OID as an archive pointer');
  assert.deepEqual(state.reads, []);

  state.sub = null;
  state.reads = [];
  assert.equal((await loadSubmission('Багц 1', 44))?.pkgKey, 'b1_9f', 'true legacy records retain their original OID search');
  state.sheets.get('b1_9f').features = [];
  assert.equal((await loadSubmission('Багц 1', 44))?.pkgKey, 'b1_12f', 'legacy search can still find the second floor');

  submission({ cells: [['44:0', '37']] }, false);
  const staged = await loadSubmission('Багц 1', 44);
  assert.equal(staged?.subOid, 44, 'staged submissions still use the overlay path');
  assert.equal(staged.pkgKey, 'b1_12f');
  assert.equal(staged.filled[0].cells[0], 37);

  state.failRead = true;
  state.reads = [];
  await assert.rejects(loadSubmission('Багц 1', 44), /submission read failed/);
  assert.deepEqual(state.reads, [], 'submission read failure must never activate a legacy search');
  assert.deepEqual(state.unexpected, [], 'all requests stay inside the offline fixture');
  console.log('✅ hyanaltDetail — approved floor identity · missing pointers/rows · group validation · legacy · staged overlay · read failure');
} finally {
  globalThis.fetch = realFetch;
  delete globalThis.__hyanaltDetailFeatureLayer;
  delete globalThis.__hyanaltDetailIdentity;
}
