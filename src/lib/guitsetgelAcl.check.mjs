/**
 * УРСГАЛЫН ЭРХИЙН ЛОГИК ШАЛГУУР — offline (ArcGIS-гүй орчинд ажиллана).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/guitsetgelAcl.check.mjs
 *
 * Хамгаалж буй алдаанууд (2026-08-29-ний аудитаар илэрсэн):
 *   1. Шатыг үүргээс (`ROLE_STAGE[role]`) гаргадаг байсан тул `beginner`/`tolovlolt`
 *      томилогдсон хүн (selbe_et, панелаас нэмсэн бүх аккаунт) хуудсаа хардаггүй байв.
 *   2. Хоосон `bagts` «бүх багц» болдог (fail-open) байв.
 *   3. Давхар `__flow__:` мөрд эхнийх нь уншигдаж, бичилттэй зөрдөг байв.
 *   4. Урсгалын бус хатуу үүрэгтэй хүнийг хасахад админы нэмсэн харагдац устдаг байв.
 *   5. Устгагдсан аккаунтын хуучин томилгоог хасахад tombstone арилж, дахин нэвтэрдэг байв.
 *   6. Хасаад шууд дахин нэмэхэд хойшилсон revoke шинэ grant-ыг дардаг байв.
 */
import assert from 'node:assert/strict';

/* ── window/localStorage shim — permissions.ts 'use client' ── */
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
  ALL_BAGTS, bagtsFor, bagtsScope, _syncRemoteAssigns, resolveFlowStage,
  setAssign, removeAssign, stageOfUser, listAssigns,
} = await import('@/lib/guitsetgelAcl.ts');
const P = await import('@/lib/permissions.ts');
const { ROLE_BY_USER } = await import('@/lib/services.ts');
const superName = Object.entries(ROLE_BY_USER).find(([, x]) => x === 'super')[0];

/* ── 1. Томилгоогүй → ЮУ Ч ХАРАХГҮЙ (fail-closed) ── */
_syncRemoteAssigns([]);
assert.deepEqual(bagtsFor('injener_a', 'engineer'), [], 'томилгоогүй = хоосон');
assert.deepEqual(bagtsScope('injener_a'), [], 'бүх шатанд ч хоосон');
assert.deepEqual(bagtsFor(null, 'engineer'), [], 'нэргүй = хоосон');
console.log('✅ томилгоогүй → нэг ч багц нээгдэхгүй');

/* ── 2. Тодорхой багц → зөвхөн тэр ── */
_syncRemoteAssigns([{ user: 'injener_a', stage: 'engineer', bagts: ['Багц 2'] }]);
assert.deepEqual(bagtsFor('injener_a', 'engineer'), ['Багц 2']);
assert.deepEqual(bagtsFor('injener_a', 'manager'), [], 'өөр шат хоосон');
assert.deepEqual(bagtsScope('injener_a'), ['Багц 2'], 'нэгдсэн хүрээ');
console.log('✅ заасан багц → зөвхөн тэр');

/* ── 3. «Бүх багц» → хязгааргүй ── */
_syncRemoteAssigns([{ user: 'menejer_b', stage: 'manager', bagts: [ALL_BAGTS] }]);
assert.equal(bagtsFor('menejer_b', 'manager'), null, 'ALL = хязгааргүй');
assert.equal(bagtsScope('menejer_b'), null, 'нэгдсэн хүрээ ч хязгааргүй');
console.log('✅ «Бүх багц» → хязгааргүй');

/* ── 4. Хоосон bagts → fail-closed (урьд нь «бүх багц» байв) ── */
_syncRemoteAssigns([{ user: 'x', stage: 'engineer', bagts: [] }]);
assert.deepEqual(bagtsFor('x', 'engineer'), [], 'хоосон = нэг ч багц биш');
assert.deepEqual(bagtsScope('x'), []);
assert.equal(stageOfUser('x'), 'engineer', 'томилгоо нь панелд харагдана (админ засна)');
console.log('✅ хоосон багц → fail-closed');

/* ── 5. Давхар мөр → СҮҮЛИЙНХ ялна (нэг аккаунт нэг шат) ── */
_syncRemoteAssigns([
  { user: 'hosloson', stage: 'company', bagts: ['Багц 1'] },
  { user: 'hosloson', stage: 'director', bagts: ['Багц 3.3'] },
]);
assert.equal(stageOfUser('hosloson'), 'director', 'сүүлийн мөр (их OID) ялна');
assert.deepEqual(bagtsScope('hosloson'), ['Багц 3.3']);
assert.equal(listAssigns().filter((a) => a.user === 'hosloson').length, 1, 'нэг л мөр үлдэнэ');
console.log('✅ давхар мөр → сүүлийнх ялна');

/* ── 6. resolveFlowStage — ШАТ = ТОМИЛГОО, үүрэг биш ── */
_syncRemoteAssigns([
  { user: 'selbe_et', stage: 'company', bagts: [ALL_BAGTS] },
  { user: 'x', stage: 'engineer', bagts: ['Багц 2'] },
]);
let r = resolveFlowStage('selbe_et', 'beginner');
assert.equal(r.stage, 'company', 'beginner ч томилогдсон шатаа авна (2026-08-29 алдаа)');
assert.equal(r.canReview, true);
assert.equal(r.canPick, false);
assert.equal(r.scope, null);
r = resolveFlowStage('x', 'tolovlolt'); // панелаас нэмсэн аккаунт — tolovlolt
assert.equal(r.stage, 'engineer');
assert.deepEqual(r.scope, ['Багц 2']);
assert.equal(r.canReview, true);
assert.equal(resolveFlowStage('x', 'menejer').stage, 'engineer', 'үүрэг зөрсөн ч томилгоо ялна');
r = resolveFlowStage('x', 'super'); // панелийн «Супер» preset — хатуу биш → томилгоо
assert.equal(r.canPick, false, 'override-super сонгогчгүй');
assert.equal(r.stage, 'engineer');
r = resolveFlowStage('selbe_injener', 'injener'); // хатуу урсгалын үүрэг, томилгоогүй
assert.equal(r.stage, 'engineer');
assert.equal(r.canReview, false, 'томилгоогүй → зөвхөн харна');
assert.deepEqual(r.scope, []);
r = resolveFlowStage('huniigui', null);
assert.equal(r.stage, null);
assert.equal(r.canReview, false);
assert.deepEqual(r.scope, []);
r = resolveFlowStage(superName, 'super');
assert.equal(r.canPick, true, 'хатуу super сонгогчтой');
assert.equal(r.scope, null);
assert.equal(r.stage, 'engineer');
assert.equal(resolveFlowStage(superName, 'super', 'director').stage, 'director');
r = resolveFlowStage(null, null, null, true); // дев — нэвтрэлт унтраалттай
assert.equal(r.canPick, true);
assert.equal(r.scope, null);
/* дараа ирсэн томилгоо шууд үйлчилнэ — кэшлэхгүй */
_syncRemoteAssigns([]);
assert.equal(resolveFlowStage('late', 'beginner').stage, null);
_syncRemoteAssigns([{ user: 'late', stage: 'director', bagts: [ALL_BAGTS] }]);
assert.equal(resolveFlowStage('late', 'beginner').stage, 'director');
console.log('✅ resolveFlowStage — шат томилгооноос');

/* ── 7. setAssign → grant: урсгалын бус үүрэг ХЭВЭЭР, guitsetgel НЭМЭГДЭНЭ ── */
_syncRemoteAssigns([]);
let w = setAssign('selbe_redesign', 'company', [ALL_BAGTS]); // хатуу tolovlolt: views ['plan']
assert.equal(w.ok, true);
assert.equal(await w.sync, false, 'ArcGIS-гүй орчинд remote бичилт унана (алдаа биш)');
assert.equal(await w.granted, false, 'эрхийн remote бичилт ч унана — локал хүчинтэй');
assert.equal(stageOfUser('selbe_redesign'), 'company');
assert.equal(P.roleOf('selbe_redesign'), 'tolovlolt', '⚠️ урсгалын бус үүрэг хадгалагдана');
assert.deepEqual(P.resolveBaseAccess('selbe_redesign').views, ['plan', 'guitsetgel']);
assert.equal(resolveFlowStage('selbe_redesign', P.roleOf('selbe_redesign')).stage, 'company');
console.log('✅ томилохдоо үүрэг хэвээр, харагдац нэмэгдэнэ');

/* ── 8. Нэг аккаунт нэг шат: engineer → manager ── */
w = setAssign('selbe_injener', 'engineer', ['Багц 1']); await w.sync;
w = setAssign('selbe_injener', 'manager', ['Багц 2']); await w.sync;
assert.deepEqual(listAssigns().filter((a) => a.user === 'selbe_injener').map((a) => a.stage), ['manager']);
assert.deepEqual(bagtsFor('selbe_injener', 'engineer'), []);
assert.equal(P.roleOf('selbe_injener'), 'menejer', 'урсгалын үүрэг шатаа дагана');
console.log('✅ нэг аккаунт нэг шат');

/* ── 9. Хатуу super томилогдохгүй; хоосон багц татгалзана ── */
assert.equal(setAssign(superName, 'company', [ALL_BAGTS]).ok, false, 'super томилгооноос үл хамаарна');
assert.equal(setAssign('x', 'company', []).ok, false, 'хоосон багц');
console.log('✅ super / хоосон багц татгалзана');

/* ── 10. Хасах: урсгалын бус хатуу үүрэг — админы нэмсэн харагдац ХЭВЭЭР ── */
await P.setUser('selbe_et', { views: ['plan', 'finance', 'guitsetgel'], docs: true }, 'beginner');
w = setAssign('selbe_et', 'company', [ALL_BAGTS]); await w.sync;
let rm = removeAssign('selbe_et', 'company'); await rm.sync;
assert.equal(stageOfUser('selbe_et'), null);
assert.ok(P.resolveBaseAccess('selbe_et').views.includes('finance'), 'админы нэмсэн харагдац алга болохгүй');
assert.ok(P.resolveBaseAccess('selbe_et').views.includes('guitsetgel'), 'суурьд байгаа тул хэвээр');
assert.equal(P.roleOf('selbe_et'), 'beginner');
console.log('✅ хасахад grant-тай тэгш хэмтэй');

/* ── 11. Хасах: хатуу tolovlolt — олгосон guitsetgel хасагдаж, суурьтай ижил бол override арилна ── */
rm = removeAssign('selbe_redesign', 'company'); await rm.sync;
assert.deepEqual(P.resolveBaseAccess('selbe_redesign').views, ['plan']);
assert.equal(P.listUsers().find((u) => u.username === 'selbe_redesign').overridden, false, 'суурьтай ижил → override хэрэггүй');
console.log('✅ олгосныг л хасна');

/* ── 12. Tombstone: устгагдсан аккаунтын хуучин томилгоог хасахад амилахгүй ── */
await P.removeUser('selbe_menejer');
assert.equal(P.hasAccess('selbe_menejer'), false);
_syncRemoteAssigns([{ user: 'selbe_menejer', stage: 'manager', bagts: [ALL_BAGTS] }]);
rm = removeAssign('selbe_menejer', 'manager'); await rm.sync;
assert.equal(P.hasAccess('selbe_menejer'), false, '⚠️ revoke нь tombstone-ыг арчихгүй');
console.log('✅ tombstone халдашгүй');

/* ── 13. Хасаад шууд дахин нэмэх — дараалал: сүүлийн үйлдэл ялна ── */
w = setAssign('comp_a', 'company', [ALL_BAGTS]); await w.sync; // панелаас нэмсэн (үүрэггүй)
assert.equal(P.roleOf('comp_a'), 'guitsetgegch');
rm = removeAssign('comp_a', 'company');
w = setAssign('comp_a', 'manager', ['Багц 2']);
await Promise.all([rm.sync, w.sync]);
assert.equal(stageOfUser('comp_a'), 'manager');
assert.equal(P.roleOf('comp_a'), 'menejer', 'хойшилсон revoke шинэ grant-ыг дарахгүй');
assert.deepEqual(P.resolveBaseAccess('comp_a').views, ['guitsetgel']);
console.log('✅ хас→нэм дараалал');

console.log('\nacl: ok — fail-closed · шат=томилгоо · нэг аккаунт нэг шат · tombstone · дараалал');
