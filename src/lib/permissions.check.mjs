/**
 * ЭРХИЙН STORE-ийн ЛОГИК ШАЛГУУР — offline (ArcGIS-гүй орчинд ажиллана).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/permissions.check.mjs
 *
 * Хамгаалж буй алдаанууд (2026-08-27-ны аудитаар илэрсэн):
 *   1. Хасагдсан ViewKey (`bagts`, `monitor`) хадгалагдсан эрхэд үлдэж
 *      Portal-ыг бүхэлд нь унагадаг байв — sanitize шүүх ёстой.
 *   2. localStorage-оо гараар засаад өөрийгөө нэмсэн бүртгэл нэвтэрдэг байв —
 *      remote баталгаажаагүй store-мөр нэвтрүүлэхгүй.
 *   3. Хатуу super-ийг tombstone-оор түгжиж болдог байв — халдашгүй.
 *   4. ArcGIS бичилт унасан өөрчлөлт dirty-set-д тэмдэглэгдэж, дараагийн
 *      таталтад дахин илгээгдэх ёстой (урьд нь 5 минутын дотор чимээгүй буцдаг).
 *   5. Панелаас нэмсэн хэрэглэгчийн үүрэг (`roleOf`) — урьд нь хатуу жагсаалт
 *      л харагдаж, урсгалын аккаунт шатаа чөлөөтэй сольж чаддаг байв.
 */
import assert from 'node:assert/strict';

/* ── localStorage/window shim — модулиуд 'use client' тул ── */
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

const { roleForUser, ROLE_BY_USER } = await import('./services.ts');
/* ⚠️ 2026-10-12 (super жигд биш): хатуу super-ийн ХУУЧИН override мөр (2026-09-30-аас өмнө мөрийн сонгогч
   super-т `injener` г.м. бичдэг байв) — §1б-д үл тооцогдохыг шалгана */
const legacySuper = Object.keys(ROLE_BY_USER).find((u) => roleForUser(u) === 'super');

/* Хуучин хувилбарын «бохир» өгөгдөл — хасагдсан түлхүүр + өөрөө нэмсэн мөр */
mem.set('selbe-perms-v1', JSON.stringify({
  selbe_redesign: { views: ['plan', 'bagts', 'monitor', 'iot'], docs: false, role: 'tolovlolt' },
  hacker_selfadd: { views: 'all', docs: true, role: 'super' },
  /* ⚠️ 2026-09-30: танигдахгүй үүрэг (хуучин build / гараар засагдсан мөр) — §8 */
  bogus_role_user: { views: ['plan'], docs: false, role: 'zahiral_old' },
  [legacySuper]: { views: ['gdash'], docs: false, role: 'injener' },
}));

const P = await import('./permissions.ts');

/* ── 1. Sanitize — үхсэн түлхүүр уншилтад орохгүй ── */
const row = P.listUsers().find((u) => u.username.toLowerCase() === 'selbe_redesign');
assert.ok(row, 'selbe_redesign жагсаалтад алга');
assert.deepEqual(row.views, ['plan', 'iot'], `үхсэн түлхүүр үлдэв: ${JSON.stringify(row.views)}`);
/* ⚠️ 2026-09-29 (аудит 10): remote уншигдаагүй сешнд localStorage-ийн override ҮЛ ТООЦНО —
   харагдац ба үүрэг хатуу суурьтай ижил; гараар тарьсан `views:'all'`/`role:'super'` хүчингүй. */
{
  const { roleAccess } = await import('./roleTypes.ts');
  assert.equal(P.remoteReady(), false);
  /* Баталгаажаагүй override зөвхөн ХУМЬЖ чадна: суурь ∩ override — суурийг хэзээ ч давахгүй,
     админы хумьсан харагдац ч сүлжээ унасан сешнд буцаж нээгдэхгүй. */
  const baseV = roleAccess(roleForUser('selbe_redesign')).views;
  const want = baseV === 'all' ? ['plan', 'iot'] : baseV.filter((v) => ['plan', 'iot'].includes(v));
  assert.deepEqual(P.resolveBaseAccess('selbe_redesign').views, want, 'remote-гүй сешнд суурь ∩ override');
  assert.equal(P.roleOf('selbe_redesign'), roleForUser('selbe_redesign'));
  assert.equal(P.resolveBaseAccess('hacker_selfadd'), null, 'өөрийгөө нэмсэн мөр эрх өгөхгүй');
  assert.equal(P.roleOf('hacker_selfadd'), null, 'өөртөө super үүрэг олгож болохгүй');
}
/* Remote уншигдсаны дараа (дуурайлт) — override хүчинтэй, цэвэрлэгдсэн */
P._markRemoteLoaded();

/* ── 1б. Хатуу super ЖИГД — хуучин override мөр ҮЛ ТООЦОГДОНО (2026-10-12) ── */
{
  assert.equal(P.resolveBaseAccess(legacySuper).views, 'all', 'хатуу super — override views үл тооцно');
  assert.equal(P.resolveBaseAccess(legacySuper).docs, true, 'хатуу super — override docs үл тооцно');
  assert.equal(P.resolveAccess(legacySuper).views, 'all', 'хатуу super — resolveAccess all');
  assert.equal(P.roleOf(legacySuper), 'super', 'хатуу super — override role (injener) үл тооцно');
  const r = P.listUsers().find((u) => u.username.toLowerCase() === legacySuper.toLowerCase());
  assert.ok(r, 'super жагсаалтад байх ёстой');
  assert.equal(r.views, 'all', 'самбарын мөр — бүх харагдац');
  assert.equal(r.role, 'super', 'самбарын мөр — үүрэг super');
  assert.equal(r.overridden, false, 'самбарын мөр — override гэж тэмдэглэхгүй');
  /* setUser хатуу super-т override бичихгүй (no-op, true) */
  assert.equal(await P.setUser(legacySuper, { views: ['gdash'], docs: false }, 'injener'), true, 'super-т setUser no-op');
  assert.equal(P.resolveBaseAccess(legacySuper).views, 'all', 'setUser-ийн дараа ч бүх харагдац');
  assert.ok(!P.dirtyKeys().includes(legacySuper.toLowerCase()), 'super-т dirty тэмдэг үүсэхгүй');
}
const acc = P.resolveAccess('selbe_redesign');
assert.deepEqual(acc.views, ['plan', 'iot'], 'resolveAccess цэвэрлээгүй');
P._markRemoteLoaded(false);

/* ── 2. Remote баталгаажаагүй мөр нэвтрүүлэхгүй ── */
assert.equal(P.hasAccess('hacker_selfadd'), false,
  'localStorage-д өөрийгөө нэмсэн бүртгэл нэвтэрч болохгүй (remote баталгаажаагүй)');
assert.equal(P.hasAccess('selbe_redesign'), true, 'хатуу жагсаалтын хэрэглэгч нэвтэрнэ');

/* ── 3. Хатуу super халдашгүй ── */
const superName = Object.keys((await import('./services.ts')).ROLE_BY_USER)
  .find((u) => roleForUser(u) === 'super');
assert.ok(superName, 'хатуу super олдсонгүй');
// Хорлолтой tombstone мөрийг ГАРААР store-д тарьсан ч...
mem.set('selbe-perms-v1', JSON.stringify({
  ...JSON.parse(mem.get('selbe-perms-v1')),
  [superName]: { views: [], docs: false, role: null, removed: true },
}));
// cache-ыг дахин ачаална (storage event-ийн замыг дуурайж шинэ import хийхгүй —
// removeUser-ээр шалгана)
assert.equal(await P.removeUser(superName), false, 'super-ийг removeUser татгалзах ёстой');

/* ── 4. Dirty-set — унасан бичилт тэмдэглэгдэнэ ── */
assert.deepEqual(P.dirtyKeys(), [], 'эхэндээ dirty хоосон байх ёстой');
// ArcGIS-гүй орчинд upsert заавал унана → dirty-д орно
const ok = await P.setUser('test_dirty_user', { views: ['plan'], docs: false }, 'tolovlolt');
assert.equal(ok, false, 'ArcGIS-гүй орчинд бичилт false байх ёстой');
assert.ok(P.dirtyKeys().includes('test_dirty_user'), 'унасан бичилт dirty-д тэмдэглэгдээгүй');
// retryDirty мөн унана (ArcGIS алга) — гэхдээ dirty ХЭВЭЭР үлдэнэ, алга болохгүй
const left = await P.retryDirty();
assert.ok(left >= 1, 'retry унасан ч dirty хадгалагдах ёстой');
assert.ok(P.dirtyKeys().includes('test_dirty_user'), 'retry-ийн дараа dirty алга болов');

/* ── 5. roleOf — override → хатуу жагсаалт дараалал ── */
assert.equal(P.roleOf('test_dirty_user'), null, '⚠️ remote-гүй сешнд override-ын үүрэг гарахгүй (2026-09-29)');
P._markRemoteLoaded();
assert.equal(P.roleOf('test_dirty_user'), 'tolovlolt', 'override-ын үүрэг гарах ёстой');
assert.equal(P.roleOf('selbe_injener'), 'injener', 'хатуу жагсаалтын үүрэг гарах ёстой');
assert.equal(P.roleOf('huniigui_hun'), null, 'үл мэдэх хүн null');
assert.equal(P.roleOf(superName), 'super', 'халдашгүй super — tombstone дор ч super');

/* ── 6. clearOverride — устгал ч dirty-д (null) тэмдэглэгдэнэ ── */
assert.equal(await P.clearOverride('test_dirty_user'), false, 'ArcGIS-гүй орчинд устгал false байх ёстой');
assert.ok(P.dirtyKeys().includes('test_dirty_user'), 'устгалын dirty тэмдэг алга');
/* ⚠️ 2026-10-11 (аудит №7): offline устгал — локал override (tombstone БИШ) `setUser`-тэй ижил шууд
   арчигдаж dirty-д үлдэнэ; retry remote tombstone-ыг дахин шалгана. Зөвхөн локал tombstone
   remote-гүйгээр арчигдахгүй (`aclMerge.check`-ийн fake-тэй кейс). */
assert.notEqual(P.roleOf('test_dirty_user'), 'tolovlolt', 'offline устгал локалд шууд тусна (setUser-тэй ижил)');
/* ⚠️ 2026-10-11 (аудит №7): «Буцаах»-ийн `revive` зорилго dirty-д хадгалагдаж, `loadDirty`-ийн
   round-trip-ээс (өөр түлхүүрийн унасан бичилт map-ыг дахин бичнэ) амьд гарна. */
{
  const dirty = () => JSON.parse(localStorage.getItem('selbe-perms-dirty-v1') || '{}');
  assert.equal(dirty().test_dirty_user?.revive, undefined, 'энгийн clear — revive тэмдэггүй');
  assert.equal(await P.clearOverride('test_dirty_user', { revive: true }), false);
  assert.equal(dirty().test_dirty_user?.e, null, 'revive clear — зорилго null');
  assert.equal(dirty().test_dirty_user?.revive, true, '«Буцаах»-ийн revive тэмдэг dirty-д');
  await P.setUser('test_dirty_other', { views: ['plan'], docs: false }, 'tolovlolt');
  assert.equal(dirty().test_dirty_user?.revive, true, 'revive тэмдэг loadDirty round-trip-ээс амьд гарна');
  assert.ok(P.dirtyKeys().includes('test_dirty_user') && P.dirtyKeys().includes('test_dirty_other'));
}

/* ── 7. «Хуваарь» харагдац ЭРХЭЭС гарна (2026-09-30 регресс): төрлийн загвар урсгалтай
      харагдацыг (`WORKFLOW_VIEWS`) агуулахаа больсон тул хадгалагдсан `views`-д
      'huvaari' байхгүй гүйцэтгэгч зөвхөн `plan` эрх (→ `CAP_HOST_VIEW`) -ээр хүрнэ. ── */
{
  const CAPS = await import('./caps.ts');
  const { roleAccess } = await import('./roleTypes.ts');
  const { WORKFLOW_VIEWS } = CAPS;
  assert.ok(WORKFLOW_VIEWS.includes('huvaari'), 'huvaari нь урсгалтай харагдац');
  const tpl = roleAccess('guitsetgegch').views;
  assert.ok(tpl === 'all' || !tpl.includes('huvaari'), 'гүйцэтгэгчийн загварт huvaari байхгүй (эрхээс гарна)');
  /* remote-гүй сешнд бичилт унана (dirty) — локал override нь хэвээр үйлчилнэ */
  await P.setUser('test_plan_user', { views: ['plan'], docs: false }, 'guitsetgegch');
  assert.ok(!P.resolveAccess('test_plan_user').views.includes('huvaari'), 'эрхгүй → huvaari хаалттай');
  CAPS._syncRemoteCaps([{ user: 'test_plan_user', caps: ['plan'] }], true);
  assert.deepEqual(CAPS.capViewsOf('test_plan_user'), ['huvaari'], 'plan → huvaari');
  assert.ok(P.resolveAccess('test_plan_user').views.includes('huvaari'), '⚠️ plan эрхтэй гүйцэтгэгчид «Хуваарь» нээлттэй байх ёстой');
  CAPS._syncRemoteCaps([{ user: 'test_plan_user', caps: [] }], true);
  assert.ok(!P.resolveAccess('test_plan_user').views.includes('huvaari'), 'эрх хасагдахад буцаагдана');
  await P.clearOverride('test_plan_user');
}

/* ── 8. Танигдахгүй үүрэг → null (2026-09-30 регресс): урьд нь `roleOf` түүхий утгыг буцааж,
      `Root`-ийн нүүр цонхны `roleAccess(r).home` нь `ROLE_ACCESS[r]` = undefined дээр ШИДЭЖ
      тэр хэрэглэгчийн портал бүхэлдээ унадаг байв (fail-closed: танигдахгүй түлхүүр → эрхгүй). ── */
{
  P._markRemoteLoaded();
  assert.equal(P.roleOf('bogus_role_user'), null, 'танигдахгүй үүрэг null болох ёстой');
  assert.equal(P.listUsers().find((u) => u.username === 'bogus_role_user')?.role, null, 'жагсаалтад ч null');
  assert.deepEqual(P.resolveBaseAccess('bogus_role_user').views, ['plan'], 'харагдац нь хэвээр (зөвхөн үүрэг шүүгдэнэ)');
  const { roleAccess } = await import('./roleTypes.ts');
  for (const u of P.listUsers()) {
    const r = P.roleOf(u.username);
    if (r) assert.ok(roleAccess(r)?.home, `roleAccess(${r}) — нүүр цонх олдох ёстой`);
  }
  P._markRemoteLoaded(false);
}

/* ── 9. Урсгалтай 6 харагдац ЗӨВХӨН хуваарилалтаар (2026-10-01, «хэрэглэгч: бүгдийг зас») ──
      Хадгалагдсан `views` (override ба хатуу үүргийн нөөц `ROLE_ACCESS`) дахь урсгалтай
      харагдацыг super-ээс бусдад ҮЛ ТООЦНО; эрхийн гэр харагдац ба урсгалын томилгоо л нээнэ. */
{
  const FL = await import('./guitsetgelAcl.ts');
  const CAPS = await import('./caps.ts');
  const { ROLE_ACCESS } = await import('./services.ts');
  P._markRemoteLoaded();
  /* (а) хатуу үүргийн нөөц — `beginner`-т «Гүйцэтгэл»+«Хуваарь» байдаг, тооцогдохгүй */
  assert.ok(ROLE_ACCESS.beginner.views.includes('guitsetgel') && ROLE_ACCESS.beginner.views.includes('huvaari'), 'ROLE_ACCESS.beginner тохиргоо өөрчлөгдсөн — шалгуурыг шинэчил');
  const et = P.resolveAccess('selbe_et');
  assert.ok(!et.views.includes('guitsetgel') && !et.views.includes('huvaari'), `selbe_et: хуваарилалтгүй урсгалтай харагдац нээгдэв (${et.views})`);
  assert.ok(et.views.includes('plan'), 'selbe_et: урсгалгүй харагдац хэвээр');
  /* (б) override-д хадгалсан урсгалтай харагдац — тооцогдохгүй */
  await P.setUser('wf_user', { views: ['gdash', 'guitsetgel', 'qaqc', 'chanar', 'huvaariBatlah'], docs: false }, 'taniltsah');
  assert.deepEqual(P.resolveAccess('wf_user').views, ['gdash'], 'хадгалсан урсгалтай харагдац хүчингүй');
  assert.deepEqual(P.workflowViewsOf('wf_user'), [], 'хуваарилалтгүй');
  /* (в) урсгалын томилгоо → «Гүйцэтгэл» («Зөвхөн харна» ч) */
  FL._syncRemoteAssigns([{ user: 'wf_user', stage: 'engineer', bagts: ['*'], viewOnly: true }]);
  assert.deepEqual(P.workflowViewsOf('wf_user'), ['guitsetgel']);
  assert.ok(P.resolveAccess('wf_user').views.includes('guitsetgel'), 'томилгоо → «Гүйцэтгэл» нээгдэнэ');
  /* (г) эрхийн гэр харагдац → «Чанар (QAQC)»; planApprove → «Хуваарь батлах» + «Хуваарь» */
  CAPS._syncRemoteCaps([{ user: 'wf_user', caps: ['qaqc', 'planApprove'] }]);
  assert.deepEqual([...P.workflowViewsOf('wf_user')].sort(), ['guitsetgel', 'huvaari', 'huvaariBatlah', 'qaqc']);
  assert.ok(!P.resolveAccess('wf_user').views.includes('chanar'), '«Чанарын баримт» эрхгүй тул хаалттай');
  /* дараалал — `VIEWS`-ийн дараалал */
  const { VIEWS } = await import('./services.ts');
  const order = P.resolveAccess('wf_user').views.map((v) => VIEWS.findIndex((x) => x.key === v));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'resolveAccess дараалал = VIEWS');
  /* (д) хуваарилалт хасагдахад — хадгалсан утга байсан ч хаагдана */
  FL._syncRemoteAssigns([]);
  CAPS._syncRemoteCaps([]);
  assert.deepEqual(P.resolveAccess('wf_user').views, ['gdash'], 'хуваарилалт хасагдахад урсгалтай хуудас хаагдана');
  /* (е) super ХӨНДӨГДӨХГҮЙ — хатуу ба override үүрэг */
  assert.equal(P.resolveAccess(superName).views, 'all', 'хатуу super — бүх харагдац');
  await P.setUser('wf_sup', { views: ['gdash', 'guitsetgel'], docs: true }, 'super');
  assert.ok(P.resolveAccess('wf_sup').views.includes('guitsetgel'), 'override super — хадгалсан урсгалтай харагдац хүчинтэй');
  /* (ж) super-ээс бусдын 'all' задарна — урсгалтайг хасна */
  await P.setUser('wf_all', { views: 'all', docs: true }, 'taniltsah');
  const all = P.resolveAccess('wf_all').views;
  assert.ok(Array.isArray(all) && !all.some((v) => CAPS.WORKFLOW_VIEWS.includes(v)) && all.includes('gdash'), `'all' → урсгалтайгүй жагсаалт (${all})`);
  for (const u of ['wf_user', 'wf_sup', 'wf_all']) await P.clearOverride(u);
  P._markRemoteLoaded(false);
}

console.log('permissions.check: ok — sanitize · admission · super халдашгүй · dirty-set · roleOf · cap→view · танигдахгүй үүрэг · урсгалтай харагдац хуваарилалтаар');
