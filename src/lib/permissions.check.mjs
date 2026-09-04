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

/* Хуучин хувилбарын «бохир» өгөгдөл — хасагдсан түлхүүр + өөрөө нэмсэн мөр */
mem.set('selbe-perms-v1', JSON.stringify({
  selbe_redesign: { views: ['plan', 'bagts', 'monitor', 'iot'], docs: false, role: 'tolovlolt' },
  hacker_selfadd: { views: 'all', docs: true, role: 'super' },
}));

const P = await import('./permissions.ts');
const { roleForUser } = await import('./services.ts');

/* ── 1. Sanitize — үхсэн түлхүүр уншилтад орохгүй ── */
const row = P.listUsers().find((u) => u.username.toLowerCase() === 'selbe_redesign');
assert.ok(row, 'selbe_redesign жагсаалтад алга');
assert.deepEqual(row.views, ['plan', 'iot'], `үхсэн түлхүүр үлдэв: ${JSON.stringify(row.views)}`);
const acc = P.resolveAccess('selbe_redesign');
assert.deepEqual(acc.views, ['plan', 'iot'], 'resolveAccess цэвэрлээгүй');

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
assert.equal(P.roleOf('test_dirty_user'), 'tolovlolt', 'override-ын үүрэг гарах ёстой');
assert.equal(P.roleOf('selbe_injener'), 'injener', 'хатуу жагсаалтын үүрэг гарах ёстой');
assert.equal(P.roleOf('huniigui_hun'), null, 'үл мэдэх хүн null');
assert.equal(P.roleOf(superName), 'super', 'халдашгүй super — tombstone дор ч super');

/* ── 6. clearOverride — устгал ч dirty-д (null) тэмдэглэгдэнэ ── */
await P.clearOverride('test_dirty_user');
assert.ok(P.dirtyKeys().includes('test_dirty_user'), 'устгалын dirty тэмдэг алга');
assert.equal(P.roleOf('test_dirty_user'), null, 'override арилсан байх ёстой');

console.log('permissions.check: ok — sanitize · admission · super халдашгүй · dirty-set · roleOf');
