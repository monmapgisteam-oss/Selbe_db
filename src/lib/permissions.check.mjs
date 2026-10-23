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
assert.equal(P.roleOf('selbe_redesign'), 'tolovlolt', 'хатуу жагсаалтын үүрэг гарах ёстой');
/* ⚠️ 2026-10-19 (аудит №9): кодод «жишээ» урсгалын аккаунт ҮЛДЭХГҮЙ — нэвтрэлт/үүрэг өгөхгүй */
{
  const { ROLE_BY_USER } = await import('./services.ts');
  for (const n of ['selbe_guitsetgegch', 'selbe_injener', 'selbe_menejer', 'selbe_eronhii']) {
    assert.equal(Object.hasOwn(ROLE_BY_USER, n), false, `жишээ аккаунт ${n} ROLE_BY_USER-д үлдэв`);
    assert.equal(P.hasAccess(n), false, `жишээ аккаунт ${n} нэвтэрч чадна`);
    assert.equal(P.roleOf(n), null);
  }
}
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
  /* (а) хатуу үүргийн нөөц — ⚠️ 2026-10-19: `beginner`-ээс «Гүйцэтгэл»+«Хуваарь» ХАСАГДСАН (үхмэл утга байв) */
  assert.ok(!ROLE_ACCESS.beginner.views.some((v) => CAPS.WORKFLOW_VIEWS.includes(v)), 'ROLE_ACCESS.beginner-д урсгалтай харагдац үлдэв');
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
  /* (е) хатуу super ХӨНДӨГДӨХГҮЙ */
  assert.equal(P.resolveAccess(superName).views, 'all', 'хатуу super — бүх харагдац');
  /* ⚠️ 2026-10-19 (аудит №6): панелийн ХУУЧИН `role:'super'` override мөр — ЭНГИЙН дүрмээр (урьд нь хадгалсан
     урсгалтай харагдац ба `'all'` нь бүтнээрээ хүчинтэй байв). Панелийн super 2026-10-15-нөөс олгогдохгүй. */
  await P.setUser('wf_sup', { views: ['gdash', 'guitsetgel'], docs: true }, 'super');
  assert.deepEqual(P.resolveAccess('wf_sup').views, ['gdash'], 'хуучин панелийн super — хадгалсан урсгалтай харагдац хүчингүй');
  await P.setUser('wf_sup', { views: 'all', docs: true }, 'super');
  const sv = P.resolveAccess('wf_sup').views;
  assert.ok(Array.isArray(sv) && !sv.some((v) => CAPS.WORKFLOW_VIEWS.includes(v)), `хуучин панелийн super 'all' задарна (${sv})`);
  /* (ж) super-ээс бусдын 'all' задарна — урсгалтайг хасна */
  await P.setUser('wf_all', { views: 'all', docs: true }, 'taniltsah');
  const all = P.resolveAccess('wf_all').views;
  assert.ok(Array.isArray(all) && !all.some((v) => CAPS.WORKFLOW_VIEWS.includes(v)) && all.includes('gdash'), `'all' → урсгалтайгүй жагсаалт (${all})`);
  for (const u of ['wf_user', 'wf_sup', 'wf_all']) await P.clearOverride(u);
  P._markRemoteLoaded(false);
}

/* ⚠️ 2026-10-19 (аудит): ЗАЙТАЙ ТҮЛХҮҮР — эрх олгохгүй, админы цэвэрлэгээнд (`permsRemote.isSpacedKey`). Урьд нь trim-ээр эрх
   олгодог атлаа `LOWER(username) = …`-ээр олдохгүй тул хасах боломжгүй байв. */
{
  const { isSpacedKey } = await import('./permsRemote.ts');
  for (const k of [' bat', 'bat ', '__cap__: bat', '__flow__:bat ', '__CHANAR__:  x']) assert.equal(isSpacedKey(k), true, k);
  for (const k of ['bat', 'Bat', '__cap__:bat', '__CAP__:Bat', '__type__:engineer']) assert.equal(isSpacedKey(k), false, k);
  const { roleForUser } = await import('./services.ts');
  const sup = Object.entries((await import('./services/roles.ts')).ROLE_BY_USER ?? {}).find(([, r]) => r === 'super')?.[0];
  if (sup) assert.equal(roleForUser(`  ${sup.toUpperCase()} `), 'super', 'roleForUser: trim + жижиг үсэг');
}

/* ── 10. «СИСТЕМ ТҮР ХААХ» (⚠️ 2026-10-19) — `__sys__:maintenance` задлалт · зайтай түлхүүр · хэн нэвтрэх ── */
{
  const { parseSysState, isSpacedKey } = await import('./permsRemote.ts');
  /* задлалт: ЗӨВХӨН ил `on: true` хаана; эвдэрсэн → null (нээлттэй, fail-open) */
  const st = parseSysState(JSON.stringify({ on: true, note: '  шилжүүлэлт  ', until: '10-20 09:00', by: 'bat', at: 5 }));
  assert.deepEqual(st, { on: true, note: 'шилжүүлэлт', until: '10-20 09:00', by: 'bat', at: 5 }, 'хаалттай мөр задлагдсангүй');
  assert.deepEqual(parseSysState(JSON.stringify({ on: false, by: 'bat', at: 1 })), { on: false, by: 'bat', at: 1 });
  for (const bad of [null, '', '{эвдэрсэн', '[]', '"on"', JSON.stringify({ on: 'true' }), JSON.stringify({ on: 1 }), JSON.stringify({ note: 'x' })]) {
    assert.equal(parseSysState(bad), null, `эвдэрсэн мөр хаах ёсгүй: ${bad}`);
  }
  assert.equal(parseSysState(JSON.stringify({ on: true, note: 'x'.repeat(900) })).note.length, 500, 'тайлбар 500 тэмдэгтээр таслагдана');
  assert.equal(isSpacedKey('__sys__: maintenance'), true);
  assert.equal(isSpacedKey('__SYS__:maintenance'), false);

  /* хэн нэвтрэх: кодын super · sysClose эрхтэй — тийм; энгийн — үгүй */
  const CAPS = await import('./caps.ts');
  CAPS._syncRemoteCaps([{ user: 'sys_holder', caps: ['sysClose'] }, { user: 'sys_plain', caps: ['zovshoorol'] }]);
  assert.equal(P.canBypassClosed(superName), true, 'кодын super хаалттай үед нэвтэрнэ');
  assert.equal(P.canBypassClosed('sys_holder'), true, 'sysClose эрхтэй нэвтэрнэ');
  assert.equal(P.canBypassClosed('SYS_HOLDER'), true, 'том үсэг ялгахгүй');
  assert.equal(P.canBypassClosed('sys_plain'), false, 'бусад эрх хаалтыг давахгүй');
  assert.equal(P.canBypassClosed(null), false);
  /* төлөв: нээлттэй → хэнд ч null; хаалттай → энгийнд л */
  P._syncRemoteSys(null);
  assert.equal(P.systemClosed(), null);
  assert.equal(P.closedFor('sys_plain'), null, 'нээлттэй үед хаалтгүй');
  P._syncRemoteSys(st);
  assert.equal(P.systemClosed()?.on, true);
  assert.equal(P.closedFor('sys_plain'), P.systemClosed(), 'энгийн хэрэглэгчид хаалттай');
  assert.equal(P.closedFor('sys_holder'), null, 'эрх эзэмшигчид хаалтгүй');
  assert.equal(P.closedFor(superName), null, 'super-т хаалтгүй');
  const same = P.systemClosed();
  P._syncRemoteSys({ ...st });
  assert.equal(P.systemClosed(), same, 'агуулга ижил бол ИЖИЛ объект (useSyncExternalStore-ийн агшин)');
  P._syncRemoteSys({ ...st, on: false });
  assert.equal(P.systemClosed(), null, '`on: false` — нээлттэй');
  /* ⚠️ 2026-10-19 (аудит №2): caps-ийн синк УНАСАН (энэ сешнд уншигдаагүй) атлаа `__sys__` хаалттай — эзэмшигч
     СҮҮЛИЙН амжилттай синкийн кэшээр (`selbe-caps-v1`) нэвтэрнэ; энгийн хэрэглэгч хаалттай хэвээр */
  P._syncRemoteSys(st);
  CAPS._markCapsSynced(false);
  assert.equal(CAPS.hasCap('sys_holder', 'sysClose'), false, 'fail-closed hasCap хэвээр (бичих зам)');
  assert.equal(P.closedFor('sys_holder'), null, 'caps унасан үед эзэмшигч өөрийн хаалтад түгжигдэв');
  assert.equal(P.closedFor('sys_plain'), P.systemClosed(), 'caps унасан үед энгийн хэрэглэгч нэвтэрлээ');
  assert.equal(P.closedFor(superName), null);
  CAPS._markCapsSynced(true);
  P._syncRemoteSys(null);
  CAPS._syncRemoteCaps([]);
}

/* ── 12. SUPER = ЭРХИЙН ХҮСНЭГТ (⚠️ 2026-10-21, хэрэглэгчийн шийдвэр: «тохиргооноос давсан хатуу эрх байж болохгүй») ── */
{
  const R = await import('./services/roles.ts');
  const WHO = await import('./who.ts');
  const code = superName; // тестийн (кодын) super — `tools/test-users.mjs`
  /* хүснэгт уншигдаагүй (`null`) — хэн ч super биш, анхны админ ч биш (fail-closed) */
  R._setTableSupers(null);
  assert.equal(R.tableSuperUsers(), null);
  assert.equal(R.roleForUser('tbl_sup'), null);
  assert.equal(R.roleForUser(R.BOOTSTRAP_SUPER), null, 'хүснэгт уншигдаагүй — анхны админ ч идэвхгүй');
  assert.equal(R.isCodeSuper(code), true); assert.equal(R.isCodeSuper('tbl_sup'), false);
  assert.equal(R.roleForUser(code), 'super', 'кодын (тестийн) super хэвээр');
  /* хүснэгт уншигдсан, super мөргүй — ЗӨВХӨН анхны админ super */
  P._markRemoteLoaded();
  R._setTableSupers([]);
  assert.equal(R.roleForUser(R.BOOTSTRAP_SUPER), 'super', 'super мөргүй хүснэгт — анхны админ');
  assert.equal(P.hasAccess(R.BOOTSTRAP_SUPER), true);
  assert.equal(R.roleForUser('tbl_sup'), null);
  /* super админ хүснэгтийн мөр бичнэ (`setUser` — кодын super-т л no-op) → super; анхны админ унтарна; trim + жижиг үсэг.
     ⚠️ 2026-10-22 (аудит №4): энд ArcGIS алга тул бичилт УНАНА — унасан олголт super тэмдэг ҮЛДЭЭХГҮЙ (анхны админы
     түгжрэлийн шалтгаан байв); амжилттай бичилтийн тэмдгийг `aclE2E` §12/§12b хуурамч хүснэгтээр шалгана. Энд хүснэгтэд
     мөр бичигдсэнийг remote уншилтаар (`_setTableSupers`) дуурайна. */
  assert.equal(await P.setUser(' Tbl_Sup ', { views: 'all', docs: true }, 'super'), false, 'ArcGIS алга — бичилт унана');
  assert.equal(R.roleForUser('tbl_sup'), null, 'унасан олголт — super тэмдэг үлдэхгүй (fail-closed)');
  R._setTableSupers(['tbl_sup']);
  assert.equal(R.roleForUser('tbl_sup'), 'super', 'role:super мөр → super');
  assert.equal(R.roleForUser(' TBL_SUP '), 'super', 'trim + жижиг үсэг');
  assert.equal(R.roleForUser(R.BOOTSTRAP_SUPER), null, 'super мөр байхад анхны админ ҮЙЛЧЛЭХГҮЙ');
  assert.equal(P.roleOf('tbl_sup'), 'super');
  assert.equal(P.hasAccess('tbl_sup'), true, 'хүснэгтийн super нэвтэрнэ');
  assert.equal(P.resolveAccess('tbl_sup').views, 'all');
  assert.equal(P.resolveBaseAccess('tbl_sup').docs, true);
  assert.equal(P.canBypassClosed('tbl_sup'), true, 'систем хаалттай үед хүснэгтийн super нэвтэрнэ');
  const row = P.listUsers().find((u) => u.username.toLowerCase() === 'tbl_sup');
  assert.ok(row && row.role === 'super' && row.views === 'all' && row.docs === true && row.overridden === false, 'самбарт super мөр (Сэргээхгүй)');
  assert.ok(!P.listRemoved().includes('tbl_sup'));
  /* үүрэг солиход super хасагдана; буцааж олгож болно */
  await P.setUser('tbl_sup', { views: ['gdash'], docs: false }, 'gazar');
  assert.equal(R.roleForUser('tbl_sup'), null, 'role солигдоход хүснэгтийн super хасагдана');
  assert.equal(P.roleOf('tbl_sup'), 'gazar');
  assert.deepEqual(P.resolveAccess('tbl_sup').views, ['gdash']);
  await P.setUser('tbl_sup', { views: 'all', docs: true }, 'super');
  assert.equal(R.roleForUser('tbl_sup'), null, 'унасан дахин олголт — тэмдэггүй (⚠️ 2026-10-22)');
  R._setTableSupers(['tbl_sup']); /* remote уншилт — мөр бичигдсэн */
  assert.equal(R.roleForUser('tbl_sup'), 'super');
  /* removeUser — өөрийн super-ийг өөрөө устгахгүй; өөр super устгана (мөр арилна); кодын super халдашгүй */
  WHO.setCurrentUser('tbl_sup');
  assert.equal(await P.removeUser('tbl_sup'), false, 'өөрийн super-ийг өөрөө устгахгүй');
  assert.equal(R.roleForUser('tbl_sup'), 'super');
  WHO.setCurrentUser(code);
  await P.removeUser('tbl_sup');
  assert.equal(R.roleForUser('tbl_sup'), null, 'өөр super устгахад super хасагдана');
  assert.equal(P.hasAccess('tbl_sup'), false, 'устгагдсан — нэвтрэхгүй');
  assert.equal(await P.removeUser(code), false, 'кодын super устгагдахгүй');
  assert.equal(await P.setUser(code, { views: ['gdash'], docs: false }, 'gazar'), true, 'кодын super-т setUser no-op');
  assert.equal(R.roleForUser(code), 'super');
  WHO.setCurrentUser(null);
  /* localStorage-ийн `role:'super'` мөр (hacker_selfadd) — remote-оос ирээгүй тул super биш */
  assert.equal(R.roleForUser('hacker_selfadd'), null, 'localStorage-ийн super мөр эрх олгохгүй');

  /* ⚠️ 2026-10-21 (аудит): АНХНЫ АДМИН өөр хүнд super олгохдоо өөрийн super мөрөө ЭХЭЛЖ бичнэ — super хэвээр, нэвтэрнэ,
     самбарт харагдана; өөрийн мөр remote-д бичигдээгүй (энд ArcGIS алга) бол нөгөөд олгохгүй (fail-closed) */
  R._setTableSupers([]);
  const boot = R.BOOTSTRAP_SUPER;
  assert.ok(P.listUsers().some((u) => u.username === boot && u.role === 'super' && u.views === 'all' && u.overridden === false),
    'идэвхтэй анхны админ самбарт синтетик super мөрөөр');
  WHO.setCurrentUser(boot);
  assert.equal(await P.setUser('tbl_sup2', { views: 'all', docs: true }, 'super'), false, 'өөрийн мөр ArcGIS-т бичигдээгүй → нөгөөд олгохгүй');
  /* ⚠️ 2026-10-22 (аудит №4): унасан өөрийн мөр локалд super тэмдэг ҮЛДЭЭХГҮЙ — урьд нь үлдэж, дараагийн олголт
     «өөрийн мөрөө эхэлж бич» салааг алгасаад remote-д анхны админ мөргүй үлдэж түгжигддэг байв */
  assert.deepEqual(R.tableSuperUsers(), [], 'унасан өөрийн мөр — тэмдэг үлдэхгүй');
  assert.equal(R.roleForUser(boot), 'super', 'анхны админ super хэвээр');
  assert.equal(P.hasAccess(boot), true, 'анхны админ нэвтэрнэ');
  assert.equal(P.roleOf(boot), 'super');
  assert.equal(R.roleForUser('tbl_sup2'), null, 'нөгөөд super олгогдоогүй (fail-closed)');
  assert.ok(P.dirtyKeys().includes(boot), 'өөрийн мөр dirty — retry бичнэ');
  const bootRow = P.listUsers().find((u) => u.username.toLowerCase() === boot);
  assert.ok(bootRow && bootRow.role === 'super' && bootRow.views === 'all' && bootRow.overridden === false, 'самбарт өөрийн super мөр');
  /* ДАХИН оролдлого — хүснэгтэд super мөр алга хэвээр тул ДАХИАД өөрийн мөрийг эхэлж бичнэ (унавал нөгөөд олгохгүй) */
  assert.equal(await P.setUser('tbl_sup2', { views: 'all', docs: true }, 'super'), false, 'дахин оролдлого ч өөрийн мөргүйгээр олгохгүй');
  assert.equal(R.roleForUser('tbl_sup2'), null);
  /* хүснэгтэд super бий (өөрийн мөр бичигдсэн — remote уншилт) бол ердийн зам; анхны админ хэвээр */
  R._setTableSupers([boot]);
  await P.setUser('tbl_sup2', { views: 'all', docs: true }, 'super');
  assert.equal(R.roleForUser('tbl_sup2'), null, 'энд ArcGIS алга — бичигдээгүй олголт тэмдэггүй');
  assert.equal(R.roleForUser(boot), 'super', 'анхны админ super хэвээр (өөрийн мөрөөр)');
  /* ердийн super админ олгоход анхны админы мөр хөндөгдөхгүй */
  WHO.setCurrentUser('tbl_sup2');
  R._setTableSupers(['tbl_sup2']);
  await P.setUser('tbl_sup3', { views: 'all', docs: true }, 'super');
  assert.ok(!R.tableSuperUsers().includes(boot), 'ердийн super админ — анхны админы мөр бичигдэхгүй');
  /* идэвхгүй анхны админ (super мөртэй хүснэгт, өөрийн мөргүй) самбарт гарахгүй */
  const s0 = { ...JSON.parse(mem.get('selbe-perms-v1')) };
  delete s0[boot];
  mem.set('selbe-perms-v1', JSON.stringify(s0));
  WHO.setCurrentUser(null);
  R._setTableSupers(null);
  P._markRemoteLoaded(false);
}

/* ── 13. УСТГАЛ = TOMBSTONE (кодын super-ээс бусад БҮХ аккаунт) · «Буцаах» (`restoreUser`) — ⚠️ 2026-10-23 ──
   Урьд нь панелаас нэмсэн аккаунт ба хүснэгтийн super-ийн мөр бүрмөсөн устдаг тул хуучин ноорог / урсгалын олголт /
   dirty retry түүнийг амилуулж, «Устгагдсан аккаунтууд» жагсаалтад ч гардаггүй байв. Энд ArcGIS алга — локал төлөвөөр. */
{
  const R = await import('./services/roles.ts');
  const WHO = await import('./who.ts');
  P._markRemoteLoaded();
  R._setTableSupers(['tbl_del_sup']);
  WHO.setCurrentUser(superName);
  /* панелаас нэмсэн (кодод алга) аккаунт — төрөлтэй */
  await P.setUser('panel_del', { views: ['gdash', 'plan'], docs: true }, 'gazar');
  assert.equal(P.hasAccess('panel_del'), true);
  await P.removeUser('panel_del');
  assert.equal(P.hasAccess('panel_del'), false, 'устгагдсан панелийн аккаунт нэвтрэхгүй');
  assert.ok(P.listRemoved().includes('panel_del'), 'панелийн аккаунт «Устгагдсан аккаунтууд»-д (tombstone)');
  assert.ok(!P.listUsers().some((u) => u.username.toLowerCase() === 'panel_del'));
  const tomb = JSON.parse(mem.get('selbe-perms-v1'))['panel_del'];
  assert.ok(tomb && tomb.removed === true && tomb.role === 'gazar', 'tombstone өмнөх төрлийг хадгална (super биш)');
  /* хүснэгтийн super-ийг өөр super устгавал — tombstone, super хасагдана, super төрөл хадгалагдахгүй */
  await P.removeUser('tbl_del_sup');
  assert.equal(R.roleForUser('tbl_del_sup'), null);
  assert.ok(P.listRemoved().includes('tbl_del_sup'), 'устгагдсан super «Буцаах» жагсаалтад');
  assert.equal(JSON.parse(mem.get('selbe-perms-v1'))['tbl_del_sup'].role, null, 'super төрөл tombstone-д хадгалагдахгүй');
  /* «Буцаах» — жирийн мөр, өмнөх төрөл · загварын харагдац; super буцахгүй */
  await P.restoreUser('panel_del');
  assert.ok(!P.listRemoved().includes('panel_del'), 'сэргээгдсэн — жагсаалтаас гарна');
  assert.equal(P.hasAccess('panel_del'), true, 'сэргээгдсэн аккаунт нэвтэрнэ (урьд нь мөргүй үлдэж нэвтэрч чаддаггүй байв)');
  assert.equal(P.roleOf('panel_del'), 'gazar', 'өмнөх төрөл буцна');
  await P.restoreUser('tbl_del_sup');
  assert.equal(P.hasAccess('tbl_del_sup'), true);
  assert.notEqual(P.roleOf('tbl_del_sup'), 'super', 'устгагдсан super «Буцаах»-аар super болохгүй');
  for (const u of ['panel_del', 'tbl_del_sup']) await P.clearOverride(u);
  WHO.setCurrentUser(null);
  R._setTableSupers(null);
  P._markRemoteLoaded(false);
}

console.log('permissions.check: ok — sanitize · admission · super халдашгүй · dirty-set · roleOf · cap→view · танигдахгүй үүрэг · урсгалтай харагдац хуваарилалтаар · систем түр хаах · super = хүснэгт · устгал = tombstone · «Буцаах»');
