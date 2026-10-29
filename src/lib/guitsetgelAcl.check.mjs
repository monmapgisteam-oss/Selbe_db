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
import fs from 'node:fs';

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

mem.set('selbe-guitsetgel-acl-v1', JSON.stringify([
  { user: 'offline_hack', stage: 'director', bagts: ['*'] },
  { user: 'inj_offline', stage: 'director', bagts: ['*'] },
]));

const {
  ALL_BAGTS, bagtsFor, bagtsScope, _syncRemoteAssigns, resolveFlowStage,
  setAssign, removeAssign, stageOfUser, listAssigns, isViewOnly, setViewOnly,
} = await import('@/lib/guitsetgelAcl.ts');
const P = await import('@/lib/permissions.ts');
const { ROLE_BY_USER } = await import('@/lib/services.ts');
const { roleAccess } = await import('@/lib/roleTypes.ts');
const superName = Object.entries(ROLE_BY_USER).find(([, x]) => x === 'super')[0];

/* ══════════ 0. REMOTE АЧААЛАГДААГҮЙ → localStorage ҮЛ ТООЦНО (2026-09-21) ══════════
 */
assert.equal(stageOfUser('offline_hack'), null, 'remote-гүй сешнд локал томилгоо ХҮЧИНГҮЙ');
assert.deepEqual(bagtsFor('offline_hack', 'director'), []);
assert.deepEqual(bagtsScope('inj_offline'), []);
assert.equal(listAssigns().length, 0, 'жагсаалт ч хоосон');
{
  const f = resolveFlowStage('inj_offline', 'injener');
  assert.equal(f.stage, 'engineer', 'хатуу үүргийн default шат');
  assert.equal(f.canReview, false, 'локал «director» мөрөөр шийдвэрлэх эрх авч болохгүй');
  assert.deepEqual(f.scope, []);
}
/* remote ачаалагдмагц — урьдын зан төлөв (remote = үнэн, локал мөр дарагдана) */
_syncRemoteAssigns([{ user: 'inj_offline', stage: 'engineer', bagts: ['Багц 1'] }]);
assert.equal(stageOfUser('inj_offline'), 'engineer');
assert.equal(stageOfUser('offline_hack'), null, 'remote-д байхгүй локал мөр амилахгүй');
console.log('✅ remote-гүй сешнд localStorage-ийн томилгоо үл тооцно');

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
r = resolveFlowStage('inj_offline', 'injener'); // урсгалын үүрэг, томилгоогүй
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
{
  const RL = await import('./services/roles.ts');
  RL._setTableSupers(['tsup_flow']);
  _syncRemoteAssigns([{ user: 'tsup_flow', stage: 'director', bagts: ['Багц 2'] }]);
  r = resolveFlowStage('tsup_flow', 'super');
  assert.equal(r.stage, 'director', 'super-ийн анхдагч шат — өөрийн томилгоо');
  assert.equal(r.canPick, true);
  assert.equal(r.scope, null, 'super — бүх багц (аврах эрх)');
  assert.equal(resolveFlowStage('tsup_flow', 'super', 'manager').stage, 'manager', 'сонгосон шат давамгайлна');
  RL._setTableSupers(null);
  _syncRemoteAssigns([{ user: 'zah_flow', stage: 'engineer', bagts: ['Багц 2'] }]);
  r = resolveFlowStage('zah_flow', 'zahiral');
  assert.equal(r.canReview, false, 'захирал шийдвэр гаргахгүй (санамсаргүй томилгоотой ч)');
  assert.equal(r.canPick, false, 'захиралд super-ийн сонгогч (bypass) олгохгүй');
  assert.equal(r.viewAll, true);
  assert.equal(r.scope, null, 'бүх багцыг харна');
  assert.equal(r.stage, 'chief');
  assert.equal(resolveFlowStage('zah_flow', 'zahiral', 'manager').stage, 'manager', 'шат сонгож харна');
  assert.equal(resolveFlowStage('zah_none', 'zahiral').canReview, false);
}
/* дараа ирсэн томилгоо шууд үйлчилнэ — кэшлэхгүй */
_syncRemoteAssigns([]);
assert.equal(resolveFlowStage('late', 'beginner').stage, null);
_syncRemoteAssigns([{ user: 'late', stage: 'director', bagts: [ALL_BAGTS] }]);
assert.equal(resolveFlowStage('late', 'beginner').stage, 'director');
console.log('✅ resolveFlowStage — шат томилгооноос');

/* ── 7. setAssign → grant: урсгалын бус үүрэг ХЭВЭЭР, guitsetgel НЭМЭГДЭНЭ ── */
P._markRemoteLoaded();
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
w = setAssign('inj_move', 'engineer', ['Багц 1']); await w.sync;
w = setAssign('inj_move', 'manager', ['Багц 2']); await w.sync;
assert.deepEqual(listAssigns().filter((a) => a.user === 'inj_move').map((a) => a.stage), ['manager']);
assert.deepEqual(bagtsFor('inj_move', 'engineer'), []);
assert.equal(P.roleOf('inj_move'), 'menejer', 'урсгалын үүрэг шатаа дагана');
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
assert.ok(!P.resolveBaseAccess('selbe_et').views.includes('guitsetgel'), 'томилгоогоор олгосон «Гүйцэтгэл» хасагдах ёстой');
assert.equal(P.roleOf('selbe_et'), 'beginner');
console.log('✅ хасахад grant-тай тэгш хэмтэй');

/* ── 11. Хасах: хатуу tolovlolt — олгосон guitsetgel хасагдаж, суурьтай ижил бол override арилна ── */
rm = removeAssign('selbe_redesign', 'company'); await rm.sync;
assert.deepEqual(P.resolveBaseAccess('selbe_redesign').views, ['plan']);
assert.equal(P.listUsers().find((u) => u.username === 'selbe_redesign').overridden, false, 'суурьтай ижил → override хэрэггүй');
console.log('✅ олгосныг л хасна');

/* ── 12. Tombstone: устгагдсан аккаунтын хуучин томилгоог хасахад амилахгүй ── */
await P.setUser('men_gone', { views: ['guitsetgel'], docs: false }, 'menejer');
assert.equal(P.hasAccess('men_gone'), true);
await P.removeUser('men_gone');
assert.equal(P.hasAccess('men_gone'), false);
_syncRemoteAssigns([{ user: 'men_gone', stage: 'manager', bagts: [ALL_BAGTS] }]);
rm = removeAssign('men_gone', 'manager'); await rm.sync;
assert.equal(P.hasAccess('men_gone'), false, '⚠️ revoke нь tombstone-ыг арчихгүй');
console.log('✅ tombstone халдашгүй');

/* ── 13. Хасаад шууд дахин нэмэх — дараалал: сүүлийн үйлдэл ялна ── */
w = setAssign('comp_a', 'company', [ALL_BAGTS]); await w.sync; // панелаас нэмсэн (үүрэггүй)
assert.equal(P.roleOf('comp_a'), 'guitsetgegch');
rm = removeAssign('comp_a', 'company');
w = setAssign('comp_a', 'manager', ['Багц 2']);
await Promise.all([rm.sync, w.sync]);
assert.equal(stageOfUser('comp_a'), 'manager');
assert.equal(P.roleOf('comp_a'), 'menejer', 'хойшилсон revoke шинэ grant-ыг дарахгүй');
assert.deepEqual(new Set(P.resolveBaseAccess('comp_a').views),
  new Set([...roleAccess('guitsetgegch').views, 'guitsetgel', ...roleAccess('menejer').views]));
console.log('✅ хас→нэм дараалал');

/* ── 13б. Томилох/шилжүүлэх нь ХУВИЙН тохиргоог (харагдац · docs · урсгалын бус төрөл) дарахгүй (2026-10-19, аудит №8) ── */
{
  await P.setUser('cust_a', { views: ['plan', 'finance'], docs: true }, null);
  w = setAssign('cust_a', 'engineer', ['Багц 1']); await w.sync;
  let a = P.resolveBaseAccess('cust_a');
  assert.ok(a.views.includes('finance') && a.views.includes('plan'), `админы нэмсэн харагдац арилав: ${a.views}`);
  assert.ok(a.views.includes('guitsetgel'));
  assert.equal(a.docs, true, 'хадгалсан ТЭЗҮ-БОНУ загвараар дарагдав');
  assert.equal(P.roleOf('cust_a'), 'injener', 'үүрэггүй хүн шатны үүрэг авна');
  w = setAssign('cust_a', 'director', ['Багц 1']); await w.sync;
  a = P.resolveBaseAccess('cust_a');
  assert.ok(a.views.includes('finance'), 'шат шилжихэд хувийн харагдац арилав');
  assert.equal(a.docs, true);
  assert.equal(P.roleOf('cust_a'), 'eronhii', 'урсгалын үүрэг шатаа дагана');
  /* урсгалын БУС ил төрөл — солигдохгүй */
  await P.setUser('cust_b', { views: ['gdash'], docs: false }, 'taniltsah');
  w = setAssign('cust_b', 'manager', ['Багц 2']); await w.sync;
  assert.equal(P.roleOf('cust_b'), 'taniltsah', 'ил сонгосон урсгалын бус төрөл солигдов');
  assert.deepEqual(new Set(P.resolveBaseAccess('cust_b').views), new Set(['gdash', 'guitsetgel']));
}
console.log('✅ томилгоо хувийн харагдац/docs/төрлийг дарахгүй (нэгтгэнэ)');

/* ══════════════════════════════════════════════════════════════════════
 * 14. ХӨНДЛӨНГИЙН ХЯНАЛТ — ХАРНА, ШИЙДВЭРЛЭХГҮЙ (2026-09-09)
 * ══════════════════════════════════════════════════════════════════════
 */
_syncRemoteAssigns([{ user: 'audit', stage: 'engineer', bagts: ['Багц 1'], viewOnly: true }]);
{
  const f = resolveFlowStage('audit', null);
  assert.equal(f.stage, 'engineer', 'харагчийн ШАТ алдагдав — нүдээ сонгож чадахгүй болно');
  assert.equal(f.canReview, false, 'ХАРАГЧ шийдвэрлэх эрхтэй үлдэв');
  assert.deepEqual(f.scope, ['Багц 1'], 'харагчийн БАГЦЫН хүрээ алдагдав — жагсаалт хоосон болно');
  assert.equal(isViewOnly('audit'), true);
  assert.equal(isViewOnly('  AUDIT  '), true, 'үсгийн хэлбэр/зайд тэсвэргүй');
}

/* Жирийн томилгоо (туггүй) нь ХЭВЭЭР шийдвэрлэнэ — fail-safe анхдагч */
_syncRemoteAssigns([{ user: 'inj', stage: 'engineer', bagts: ['Багц 1'] }]);
assert.equal(resolveFlowStage('inj', null).canReview, true, 'туггүй томилгоо шийдвэрлэх эрхээ алдав');
assert.equal(isViewOnly('inj'), false);

_syncRemoteAssigns([{ user: 'muu', stage: 'engineer', bagts: ['Багц 1'], viewOnly: 'yes' }]);
assert.equal(isViewOnly('muu'), false, '«yes» гэсэн утга тугийг асаав');
assert.equal(resolveFlowStage('muu', null).canReview, true);

/* Тугийг асаах / унтраах — багц ба шат ХЭВЭЭР */
_syncRemoteAssigns([{ user: 'sw', stage: 'manager', bagts: ['Багц 2'] }]);
{
  const on = setViewOnly('sw', true);
  assert.equal(on.ok, true);
  await on.sync;
  assert.equal(isViewOnly('sw'), true);
  assert.equal(stageOfUser('sw'), 'manager', 'туг асаахад ШАТ алдагдав');
  assert.deepEqual(bagtsFor('sw', 'manager'), ['Багц 2'], 'туг асаахад БАГЦ алдагдав');

  const off = setViewOnly('sw', false);
  await off.sync;
  assert.equal(isViewOnly('sw'), false);
  assert.equal(resolveFlowStage('sw', null).canReview, true, 'туг унтраахад эрх сэргэсэнгүй');
}

_syncRemoteAssigns([]);
assert.equal(setViewOnly('hen_ch', true).ok, false, 'томилгоогүй хүнд туг тавигдав');

/* Багц СОЛИХОД туг ҮЛДЭНЭ — админ багц нэмэхэд эрх чимээгүй сэргэх ёсгүй */
_syncRemoteAssigns([{ user: 'keep', stage: 'engineer', bagts: ['Багц 1'], viewOnly: true }]);
{
  const w2 = setAssign('keep', 'engineer', ['Багц 1', 'Багц 2'], false);
  await w2.sync;
  assert.equal(isViewOnly('keep'), true, 'багц солиход ХӨНДЛӨНГИЙН ХЯНАЛТ чимээгүй арилав');
  assert.equal(resolveFlowStage('keep', null).canReview, false);
}
console.log('✅ ХӨНДЛӨНГИЙН ХЯНАЛТ — харна, шийдвэрлэхгүй; багц·шат хэвээр');


/* ══════════ ШИЙДВЭР ГАРГАХ ЗАМ — ДОМЭЙН ТҮВШИНД ХАМГААЛАГДСАН ══════════ */
/**
 *    НӨЛӨӨ: «Гүйцэтгэл» харагдац руу орох эрхтэй ямар ч аккаунт консолоос
 *    `apply({ oid, stage: 'director', decision: approve, who })` дуудаж,
 *    `archiveSubmission` → `applyAdds` гэсэн БУЦААШГҮЙ архивын бичилтийг
 *    өдөөж чаддаг байв — өөрийн багцаас гадуур ч, `viewOnly` тэмдэгтэй ч.
 */
{
  const S = fs.readFileSync('src/lib/hyanaltStore.ts', 'utf8');

  assert.ok(/function authz\(/.test(S),
    'hyanaltStore: домэйн эрхийн хамгаалагч (authz) АЛГА — UI л барина');
  assert.ok(/from '\.\/guitsetgelAcl'/.test(S),
    'hyanaltStore: ACL импортлоогүй — эрхийг хаанаас ч шалгаж чадахгүй');
  for (const n of ['stageOfUser', 'isViewOnly', 'bagtsFor']) {
    assert.ok(S.includes(n + '('),
      'hyanaltStore.authz: ' + n + ' шалгагдаагүй');
  }

  const ia = S.indexOf('const deny = authz(a.stage');
  const iar = S.indexOf('archiveSubmission(cur, a.subAt)');
  assert.ok(ia > 0, 'apply-д authz дуудагдаагүй');
  assert.ok(iar > ia,
    'hyanaltStore: authz нь archiveSubmission-оос ХОЙШ — архивын бичилт таслагдахгүй');

  assert.ok(S.includes('const deny = authz(by, me'),
    'hyanaltStore.recheck: authz алга — дахин шалгалтаар тойрч гарна');

  assert.ok(/bypass\?: boolean;/.test(S) && /a\.bypass === true/.test(S),
    'hyanaltStore: bypass нь fail-closed биш — шалгуур анхдагчаар тойрогдоно');

  const G = fs.readFileSync('src/modules/Guitsetgel.tsx', 'utf8');
  assert.ok(/me=\{user\?\.username\}/.test(G),
    'Guitsetgel: me (username) дамжуулагдаагүй — authz хэнийг ч танихгүй');
  assert.ok(!/me=\{who\}/.test(G),
    'Guitsetgel: me нь who (дэлгэцийн нэр)-гоор дамжсан — ACL нэрээр гоожно');
}
console.log('✅ ШИЙДВЭР — домэйн түвшинд шалгагдана, архивлалтаас ӨМНӨ, fail-closed');

console.log('\nacl: ok — fail-closed · шат=томилгоо · нэг аккаунт нэг шат · tombstone · дараалал · харагч');
