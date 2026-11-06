/**
 * ГАРАХЫН ЦЭВЭРЛЭГЭЭ — «Үлдэх» сонгосон хэрэглэгч итгэмжлэлээ алдахгүй, «Гарах» сонгосон нь заавал алдана.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/signOutCleanup.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const win = new EventTarget();
globalThis.window = win;
const { armSignOutCleanup } = await import('./signOutCleanup.ts');

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
const fire = (t) => win.dispatchEvent(new Event(t));
const QUIET = 20;

/* Асуултгүй / «Гарах»: оролтгүй pagehide → цэвэрлэнэ, нэг л удаа */
{
  let n = 0;
  armSignOutCleanup(() => { n += 1; }, QUIET);
  fire('pagehide');
  fire('pagehide');
  assert.equal(n, 1, 'pagehide → нэг удаа цэвэрлэнэ');
}

/* Удаан сүлжээ: хугацаа өнгөрсөн ч оролтгүй бол цэвэрлэгээ ЦУЦЛАГДАХГҮЙ */
{
  let n = 0;
  armSignOutCleanup(() => { n += 1; }, QUIET);
  await wait(QUIET * 3);
  fire('pagehide');
  assert.equal(n, 1, 'хугацаа дангаараа «үлдсэн» гэсэн нотолгоо биш');
}

/* Удаан сүлжээ, асуултгүй: хүлээж байхдаа дарсан товч гаралтыг цуцлахгүй */
for (const input of ['pointerdown', 'keydown']) {
  let n = 0;
  armSignOutCleanup(() => { n += 1; }, QUIET);
  win.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  await wait(QUIET * 3);
  fire(input);
  fire('pagehide');
  assert.equal(n, 1, `асуултгүй үед ${input} итгэмжлэлийг үлдээх ёсгүй`);
}

/* «Үлдэх» → ажиллав → хожмын F5: цэвэрлэхгүй (хамгаалалт асуулт гаргасан) */
for (const input of ['pointerdown', 'keydown']) {
  let n = 0;
  const guard = (e) => e.preventDefault();
  win.addEventListener('beforeunload', guard);
  armSignOutCleanup(() => { n += 1; }, QUIET);
  win.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  await wait(QUIET * 3);
  fire(input);
  win.removeEventListener('beforeunload', guard);
  fire('pagehide');
  assert.equal(n, 0, `${input}-ийн дараах pagehide итгэмжлэлийг устгах ёсгүй`);
}

/* Асуулт гарсан ч «Гарах» сонгосон: оролтгүй pagehide → цэвэрлэнэ */
{
  let n = 0;
  const guard = (e) => e.preventDefault();
  win.addEventListener('beforeunload', guard);
  armSignOutCleanup(() => { n += 1; }, QUIET);
  win.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  await wait(QUIET * 3);
  win.removeEventListener('beforeunload', guard);
  fire('pagehide');
  assert.equal(n, 1, '«Гарах» → цэвэрлэнэ');
}

/* Гарах товчийг дарсан даруйх оролт (quietMs дотор) сешнийг хамгаалах шалтгаан биш */
{
  let n = 0;
  armSignOutCleanup(() => { n += 1; }, QUIET);
  fire('pointerdown');
  fire('pagehide');
  assert.equal(n, 1, 'quietMs доторх оролт тоологдохгүй');
}

/* Гараар цуцлах */
{
  let n = 0;
  const stop = armSignOutCleanup(() => { n += 1; }, QUIET);
  stop();
  fire('pagehide');
  assert.equal(n, 0, 'stop() дараа цэвэрлэхгүй');
}

/* AuthGate: цэвэрлэгээ ҮРГЭЛЖ энэ замаар — хадгалаагүй ажлын шалгалтаас хамаарахгүй */
{
  const ag = readFileSync(new URL('../components/AuthGate.tsx', import.meta.url), 'utf8');
  const so = ag.slice(ag.indexOf('const signOut = useCallback'), ag.indexOf('const clearError'));
  assert.ok(so.includes('armSignOutCleanup('), 'signOut: armSignOutCleanup');
  assert.ok(so.includes('watchNavCancel(cancelSignOut'), 'signOut: цуцлалтын ажиглалт');
  assert.ok(!so.includes('hasUnsavedWork'), 'signOut: synthetic beforeunload-оос хамаарах ёсгүй (Гүйцэтгэлийн ноорог харагддаггүй)');
  assert.equal((so.match(/destroyCredentials/g) ?? []).length, 1, 'signOut: итгэмжлэл pagehide-оос өмнө устах ёсгүй');
}

delete globalThis.window;
console.log('signOutCleanup.check ✓');
