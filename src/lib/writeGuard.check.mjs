/**
 * БИЧИЛТИЙН ХАМГААЛАЛТ (2026-11-19, аудит) — эрх олгох хадгалалтыг зөвхөн системийн админ, хуваарийн обьёмыг зөвхөн тэр
 * багцын зохиогч / батлагч, сарын хувийг зөвхөн «Санхүү засах» эрхтэй хүн дуудаж чадна. Сүлжээгүй: хамгаалалт хүсэлт
 * явахаас ӨМНӨ шиднэ.
 */
import assert from 'node:assert/strict';

globalThis.window ??= globalThis;
const mem = new Map();
globalThis.localStorage ??= { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.dispatchEvent ??= () => true;
const who = await import('./who.ts');
const perms = await import('./permissions.ts');
const caps = await import('./caps.ts');
const { setCaps } = caps;
const { requirePlanWrite, setHuvaariGrants } = await import('./huvaariAcl.ts');
const { savePkgPct } = await import('./huvaariObyem.ts');
const { AUTH } = await import('./services.ts');

assert.ok(AUTH.appId, 'шалгуурт нэвтрэлт асаалттай байх ёстой');
who._setWriteGuards(true);

/* админ биш хүн — эрхийн хадгалалт бүр шиднэ */
who.setCurrentUser('selbe_et');
assert.equal(perms.roleOf('selbe_et'), 'beginner');
const NO = /зөвхөн системийн админ/;
assert.throws(() => who.requireSuper(), NO);
assert.throws(() => perms.setUser('x_user', { views: 'all', docs: true }, 'super'), NO, 'өөр хүнд эрх олгох');
assert.throws(() => perms.removeUser('x_user'), NO);
assert.throws(() => perms.clearOverride('x_user'), NO);
await assert.rejects(() => setCaps('selbe_et', ['finEdit', 'ipcApprove']), NO, 'өөртөө нэмэлт эрх олгох');
assert.throws(() => caps.toggleCap('selbe_et', 'finEdit', true), NO);
const g = setHuvaariGrants('selbe_et', [{ role: 'author', bagts: ['Багц 1'] }]);
assert.equal(g.ok, false, 'өөртөө хуваарийн зохиогч томилох');
assert.match(g.error ?? '', NO);

/* нэвтрээгүй (хэрэглэгч тодорхойгүй) — мөн хориотой */
who.setCurrentUser(null);
assert.throws(() => who.requireSuper(), NO);

/* хуваарь: томилогдоогүй хүн аль ч багцад бичихгүй; сарын хувь — «Санхүү засах» эрхгүй бол хориотой */
who.setCurrentUser('selbe_et');
assert.throws(() => requirePlanWrite('Багц 1'), /хуваарьт бичих эрхгүй/);
assert.throws(() => requirePlanWrite(null), /хуваарьт бичих эрхгүй/);
await assert.rejects(() => savePkgPct('b1_9f', 'Багц 1', new Map([['2026-11', 10]])), /эрхгүй/);
/* 2026-11-19: «Үндсэн хугацаа» — «Санхүү засах» эсвэл тэр багцын хуваарийн зохиогч */
{
  const { canEditMainSpan } = await import('./huvaariAcl.ts');
  const { patchPkgPct } = await import('./huvaariObyem.ts');
  assert.equal(canEditMainSpan('selbe_et', 'Багц-1'), false, 'томилогдоогүй, санхүүгийн эрхгүй');
  await assert.rejects(() => patchPkgPct('CF:1', 'Багц-1', new Map([['2026-11', 10]])), /Үндсэн хугацаа/);
  (await import('./huvaariAcl.ts'))._syncRemoteHuvaari([{ user: 'selbe_et', roles: ['author'], bagts: ['Багц 1'] }]);
  assert.equal(canEditMainSpan('selbe_et', 'Багц-1'), true, 'Багц 1-ийн зохиогч — «Багц-1» гэрээ');
  assert.equal(canEditMainSpan('selbe_et', 'БАГЦ-16.1'), false, 'өөр багц');
  /* 2026-11-20 (хэрэглэгчийн шийдвэр «админ зөвхөн эрх удирдана»): хадгалсан эрхгүй админ ажлын эрхгүй */
  assert.equal(caps.hasCap('manager_3', 'finEdit'), false, 'эрхгүй админ «Санхүү засах»-ыг давах ёсгүй');
  assert.equal(canEditMainSpan('manager_3', 'БАГЦ-16.1'), false, 'эрхгүй админ — үндсэн хугацаа засахгүй');
  caps._syncRemoteCaps([{ user: 'manager_3', caps: ['finEdit'] }]);
  assert.equal(caps.hasCap('manager_3', 'finEdit'), true, 'өөртөө олгосон эрх — бусдын адил');
  assert.equal(canEditMainSpan('manager_3', 'БАГЦ-16.1'), true, 'санхүүгийн эрхтэй (админ — олгосон эрхээр)');
  caps._syncRemoteCaps([]);
}

/* системийн админ — эрх удирдлагад хамгаалалт саад болохгүй; ажлын бичилтэд — бусдын адил хуваарилалтаар */
who.setCurrentUser('manager_3');
assert.equal(perms.roleOf('manager_3'), 'super');
assert.doesNotThrow(() => who.requireSuper());
assert.doesNotThrow(() => { void perms.setUser('x_user', { views: ['gdash'], docs: false }, 'gazar'); }, 'админ бусдын эрхийг тохируулна');
await assert.doesNotReject(() => setCaps('x_other', ['finEdit']), 'админ бусдад нэмэлт эрх олгоно');
assert.throws(() => requirePlanWrite('Багц 1'), /хуваарьт бичих эрхгүй/, 'хуваарилалтгүй админ хуваарьт бичихгүй');

/* доод түвшний бичилт: зөвхөн харах хүн — хориотой; админ — зөвшөөрнө; түгжээг бусдын нэрээр чөлөөлөхгүй */
{
  const { requireWriter, requireSelf } = await import('./writeGuard.ts');
  const { applyUpdates, applyDeletes, applyAdds } = await import('../modules/sheet/bagtsSheet.ts');
  const { repriceFreeRows, syncIpcFromFill } = await import('./ipcAutoWrite.ts');
  const { registerApproved } = await import('./negtgelWrite.ts');
  const { markPlanPartial, clearPlanPartial } = await import('./huvaariBatlah.ts');
  const VIEW = /зөвхөн харах эрх/;
  who.setCurrentUser('selbe_et');
  assert.deepEqual(caps.capsOf('selbe_et').filter((c) => c !== 'aiAgent' && c !== 'habeaOwn'), [], 'шалгуурын хэрэглэгч бичих эрхгүй байх ёстой');
  await assert.rejects(() => requireWriter(), VIEW);
  const pkg = { key: 'b1_9f', group: 'Багц 1', url: 'https://example.invalid/x' };
  await assert.rejects(() => applyUpdates(pkg, [{ objectid: 1 }]), VIEW, 'гүйцэтгэлийн хуудасны мөр засах');
  await assert.rejects(() => applyDeletes(pkg, [1]), VIEW);
  await assert.rejects(() => applyAdds(pkg, [{}]), VIEW);
  await assert.rejects(() => registerApproved('Багц 1', 1), VIEW, 'нэгтгэлийн бичилт');
  await assert.rejects(() => syncIpcFromFill('Багц 1', '2026-11-19'), VIEW, 'төлбөрийн актын автомат мөр');
  await assert.rejects(() => repriceFreeRows('Багц-1'), /эрхгүй/, 'төлбөрийн актын автомат үнэ — «IPC үүсгэх» эрх');
  assert.throws(() => requireSelf('manager_3'), /өөрийн нэрээр/);
  assert.doesNotThrow(() => requireSelf('Selbe_ET'));
  assert.equal((await markPlanPartial({ oid: 1, approver: 'manager_3' })).ok, false, 'бусдын нэрээр түгжихгүй');
  assert.equal(await clearPlanPartial(1, 'manager_3'), false, 'бусдын нэрээр чөлөөлөхгүй');
  who.setCurrentUser('manager_3');
  caps._syncRemoteCaps([]);
  await assert.rejects(() => requireWriter(), VIEW, '2026-11-20: эрхгүй админ ажлын хүснэгтэд бичихгүй');
  caps._syncRemoteCaps([{ user: 'manager_3', caps: ['finEdit'] }]);
  await assert.doesNotReject(() => requireWriter(), 'бичих эрх олгосон админ');
  caps._syncRemoteCaps([]);
}

/* унтраалттай үед (бусад шалгуур) — саадгүй */
who._setWriteGuards(false);
who.setCurrentUser('selbe_et');
assert.doesNotThrow(() => who.requireSuper());
assert.doesNotThrow(() => requirePlanWrite('Багц 1'));

console.log('writeGuard.check: бүгд ✅');
