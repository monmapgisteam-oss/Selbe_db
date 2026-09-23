/**
 * ДЭД БҮТЦИЙН ЗАСВАРЫН ЭРХ — багцаар (2026-09-23).
 *
 * Шалгах зүйл: fail-closed, багцын хүрээ, давхарга → багц зураглал, super
 * хязгааргүй, `*` = бүх багц, `BUTETS_PACKS` нь «Дэд бүтэц» хуудасны 23 багцтай
 * ижил (soc/site-гүй, зөвхөн `infra:*`).
 *
 * Ажиллуулах: node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/butetsAcl.check.mjs
 */
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;

const {
  ALL_BAGTS, butetsScope, hasButetsRole, canEditButetsLayer, _syncRemoteButets,
  listButetsAssigns,
} = await import('@/lib/butetsAcl.ts');
const { BUTETS_PACKS, PACK_OF_LAYER } = await import('@/lib/butetsPacks.ts');
const { ROLE_BY_USER, PKG_FAMILY_BY_BAGTS, DED_BUTETS_LAYER_IDS } = await import('@/lib/services.ts');
const superName = Object.entries(ROLE_BY_USER).find(([, x]) => x === 'super')[0];

/* ── Багцын жагсаалт ── */
assert.ok(BUTETS_PACKS.length >= 20, `багц цөөн: ${BUTETS_PACKS.length}`);
for (const p of BUTETS_PACKS) {
  assert.ok(p.layerIds.length > 0, `${p.key}: давхаргагүй`);
  assert.ok(p.layerIds.every((id) => id.startsWith('infra:')), `${p.key}: infra биш давхарга`);
  assert.ok(!['soc', 'site'].includes(PKG_FAMILY_BY_BAGTS[p.key]), `${p.key}: soc/site багц орсон`);
  assert.ok(p.name && !p.name.endsWith('·'), `${p.key}: нэр буруу «${p.name}»`);
}
const keys = new Set(BUTETS_PACKS.map((p) => p.key));
assert.equal(keys.size, BUTETS_PACKS.length, 'давхардсан түлхүүр');
/* Хуудасны БҮХ давхарга аль нэг багцад — эс бөгөөс тэр давхарга хэнд ч нээгдэхгүй */
const orphan = DED_BUTETS_LAYER_IDS.filter((id) => !PACK_OF_LAYER[id]);
assert.deepEqual(orphan, [], `багцгүй давхарга: ${orphan.join(', ')}`);
console.log(`✅ BUTETS_PACKS — ${BUTETS_PACKS.length} багц, бүх давхарга багцтай`);

const P0 = BUTETS_PACKS[0];
const P1 = BUTETS_PACKS[1];
const L0 = P0.layerIds[0];
const L1 = P1.layerIds[0];

/* ── Fail-closed ── */
_syncRemoteButets([]);
assert.deepEqual(butetsScope('zasvarlagch_a'), [], 'хуваарилагдаагүй = хоосон');
assert.deepEqual(butetsScope(null), [], 'нэргүй = хоосон');
assert.equal(hasButetsRole('zasvarlagch_a'), false);
assert.equal(canEditButetsLayer('zasvarlagch_a', L0), false, 'хуваарилагдаагүй бол засахгүй');
assert.equal(canEditButetsLayer(null, L0), false);
console.log('✅ fail-closed');

/* ── Багцын хүрээ ── */
_syncRemoteButets([{ user: 'zasvarlagch_a', roles: ['editor'], bagts: [P0.key] }]);
assert.deepEqual(butetsScope('zasvarlagch_a'), [P0.key]);
assert.equal(hasButetsRole('zasvarlagch_a'), true);
assert.equal(canEditButetsLayer('zasvarlagch_a', L0), true, 'өөрийн багцын давхарга');
assert.equal(canEditButetsLayer('zasvarlagch_a', L1), false, 'өөр багцын давхарга');
assert.equal(canEditButetsLayer('zasvarlagch_a', 'infra:9999'), false, 'багцгүй давхарга');
/* grants давамгайлна */
_syncRemoteButets([{ user: 'zasvarlagch_b', grants: [{ role: 'editor', bagts: [P1.key] }] }]);
assert.equal(canEditButetsLayer('zasvarlagch_b', L1), true);
assert.equal(canEditButetsLayer('zasvarlagch_b', L0), false);
/* Нэр trim + lowercase */
_syncRemoteButets([{ user: '  Zasvarlagch_C ', roles: ['editor'], bagts: [P0.key] }]);
assert.equal(canEditButetsLayer('zasvarlagch_c', L0), true, 'нэр нормчлогдоно');
assert.equal(listButetsAssigns().length, 1, 'syncRemote нь бүхэлд нь солино');
console.log('✅ багцын хүрээ · давхарга → багц');

/* ── Бүх багц / super ── */
_syncRemoteButets([{ user: 'buh', roles: ['editor'], bagts: [ALL_BAGTS] }]);
assert.equal(butetsScope('buh'), null, '* = хязгааргүй');
assert.equal(canEditButetsLayer('buh', L0), true);
assert.equal(canEditButetsLayer('buh', L1), true);
assert.equal(butetsScope(superName), null, 'super хязгааргүй');
assert.equal(canEditButetsLayer(superName, L1), true);
console.log('✅ * ба super — хязгааргүй');

/* ── Буруу үүрэг алгасагдана ── */
_syncRemoteButets([{ user: 'buruu', grants: [{ role: 'approver', bagts: [P0.key] }] }]);
assert.deepEqual(butetsScope('buruu'), [], 'мэдэхгүй үүрэг = хуваарилалтгүй');
console.log('✅ мэдэхгүй үүрэг хаягдана');

console.log('✅ butetsAcl — бүх шалгалт давлаа');
