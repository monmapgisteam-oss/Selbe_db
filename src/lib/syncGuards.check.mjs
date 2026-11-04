/**
 * ЭРХ · ИТГЭЛИЙН ХААЛТУУД: автомат sync-ийн эрх, super мөрийн итгэлийн гинж, реленийн хаяг, нэрийн хамгаалалт.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/syncGuards.check.mjs
 */
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;

const { trustedSupers } = await import('./permsRemote.ts');
const CAPS = await import('./caps.ts');
const { relayUrlOk } = await import('./agent/client.ts');
const P = await import('./permissions.ts');

/* ── Super мөрийн гинж ── */
const roots = ['Admin'];
const names = (rows) => [...trustedSupers(rows, roots)].sort();
assert.deepEqual(names([{ user: 'admin', editor: 'ADMIN' }]), ['admin'], 'анхны админ, том жижиг үсэг ялгахгүй');
assert.deepEqual(names([{ user: 'hacker', editor: 'hacker' }]), [], 'өөртөө бичсэн super итгэгдэхгүй');
assert.deepEqual(names([{ user: 'a', editor: 'admin' }, { user: 'b', editor: 'a' }]), ['a', 'b'], 'итгэмжлэгдсэн super-ийн олгосон мөр');
assert.deepEqual(names([{ user: 'b', editor: 'a' }, { user: 'a', editor: 'admin' }]), ['a', 'b'], 'дарааллаас хамаарахгүй');
assert.deepEqual(names([{ user: 'x', editor: 'y' }, { user: 'y', editor: 'x' }]), [], 'бие биеэ батлах тойрог итгэгдэхгүй');
assert.deepEqual(names([{ user: 'n', editor: null }]), [], 'бичсэн хүн тодорхойгүй бол итгэхгүй');
assert.deepEqual(names([{ user: 'legacy' }]), ['legacy'], 'талбар огт ирээгүй мөр шалгагдахгүй');

/* ── Автомат sync зөвхөн санхүүгийн эрхтэй ── */
CAPS._syncRemoteCaps([{ user: 'fin', caps: ['finEdit'] }, { user: 'appr', caps: ['ipcApprove'] }, { user: 'other', caps: ['zovshoorol'] }]);
assert.equal(CAPS.canAutoSync('fin'), true);
assert.equal(CAPS.canAutoSync('appr'), true);
assert.equal(CAPS.canAutoSync('other'), false, 'бусад эрх sync ажиллуулахгүй');
assert.equal(CAPS.canAutoSync('viewer'), false, 'эрхгүй хэрэглэгч');
assert.equal(CAPS.canAutoSync(null), false, 'хэрэглэгч тодорхойгүй');

/* ── Реле зөвхөн https эсвэл локал ── */
assert.equal(relayUrlOk('https://selbe-agent.workers.dev'), true);
assert.equal(relayUrlOk('http://localhost:8787'), true);
assert.equal(relayUrlOk('http://127.0.0.1:8787/'), true);
assert.equal(relayUrlOk('http://evil.example'), false, 'нууц бус http хост руу токен явахгүй');
assert.equal(relayUrlOk('http://localhost.evil.example'), false);
assert.equal(relayUrlOk('ftp://x'), false);

/* ── Удамшсан түлхүүрээр эрх авахгүй ── */
P._markRemoteLoaded();
for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
  assert.equal(P.hasAccess(name), false, name);
}
console.log('syncGuards.check ✓');
