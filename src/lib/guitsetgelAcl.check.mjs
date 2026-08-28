import assert from 'node:assert/strict';
import { ALL_BAGTS, bagtsFor, bagtsScope, _syncRemoteAssigns } from '@/lib/guitsetgelAcl.ts';

/* Томилгоогүй → ЮУ Ч ХАРАХГҮЙ (fail-closed) */
_syncRemoteAssigns([], true);
assert.deepEqual(bagtsFor('injener_a', 'engineer'), [], 'томилгоогүй = хоосон');
assert.deepEqual(bagtsScope('injener_a'), [], 'бүх шатанд ч хоосон');
assert.deepEqual(bagtsFor(null, 'engineer'), [], 'нэргүй = хоосон');
console.log('✅ томилгоогүй → нэг ч багц нээгдэхгүй');

/* Тодорхой багц → зөвхөн тэр */
_syncRemoteAssigns([{ user: 'injener_a', stage: 'engineer', bagts: ['Багц 2'] }], true);
assert.deepEqual(bagtsFor('injener_a', 'engineer'), ['Багц 2']);
assert.deepEqual(bagtsFor('injener_a', 'manager'), [], 'өөр шат хоосон');
assert.deepEqual(bagtsScope('injener_a'), ['Багц 2'], 'нэгдсэн хүрээ');
console.log('✅ заасан багц → зөвхөн тэр');

/* «Бүх багц» → хязгааргүй */
_syncRemoteAssigns([{ user: 'menejer_b', stage: 'manager', bagts: [ALL_BAGTS] }], true);
assert.equal(bagtsFor('menejer_b', 'manager'), null, 'ALL = хязгааргүй');
assert.equal(bagtsScope('menejer_b'), null, 'нэгдсэн хүрээ ч хязгааргүй');
console.log('✅ «Бүх багц» → хязгааргүй');

/* Хоёр шатанд томилогдсон → нэгдэнэ */
_syncRemoteAssigns([
  { user: 'hosloson', stage: 'company', bagts: ['Багц 1'] },
  { user: 'hosloson', stage: 'director', bagts: ['Багц 3.3'] },
], true);
assert.deepEqual(bagtsScope('hosloson').sort(), ['Багц 1', 'Багц 3.3']);
console.log('✅ олон шат → хүрээ нэгдэнэ');

console.log('\nacl: ok — fail-closed');
