/**
 * БИЧИЛТИЙН ХАМГААЛАЛТ (2026-11-19, аудит) — эрх олгох хадгалалтыг зөвхөн системийн админ, хуваарийн обьёмыг зөвхөн тэр
 * багцын зохиогч / батлагч, сарын хувийг зөвхөн «Санхүү засах» эрхтэй хүн дуудаж чадна. Сүлжээгүй: хамгаалалт хүсэлт
 * явахаас ӨМНӨ шиднэ.
 */
import assert from 'node:assert/strict';

globalThis.window ??= globalThis;
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

/* системийн админ — хамгаалалт саад болохгүй */
who.setCurrentUser('manager_3');
assert.equal(perms.roleOf('manager_3'), 'super');
assert.doesNotThrow(() => who.requireSuper());
assert.doesNotThrow(() => requirePlanWrite('Багц 1'));

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
  await assert.doesNotReject(() => requireWriter());
}

/* унтраалттай үед (бусад шалгуур) — саадгүй */
who._setWriteGuards(false);
who.setCurrentUser('selbe_et');
assert.doesNotThrow(() => who.requireSuper());
assert.doesNotThrow(() => requirePlanWrite('Багц 1'));

console.log('writeGuard.check: бүгд ✅');
