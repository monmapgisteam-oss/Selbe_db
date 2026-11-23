/**
 * HO ← CASHFLOW автомат синк — өөрийн бичилтийн invalidate өөрийгөө дахин сэрээхгүй (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hoSync/sync.check.mjs
 */
import assert from 'node:assert/strict';
import { register, subscribeData, invalidate } from '../dataBus.ts';
import { __test, startHoSync } from './sync.ts';

register(() => {}, ['CASHFLOW_NEW', 'HO_IPC']);
{
  const seen = [];
  const off = subscribeData(() => seen.push(__test.isOwnNotice()));
  __test.invalidateQuiet('HO_IPC');
  invalidate('CASHFLOW_NEW');
  off();
  assert.deepEqual(seen, [true, false], 'өөрийн invalidate — мэдэгдлийн агшинд өөрийнх гэж танигдана; бусдынх — биш');
  assert.equal(__test.isMuted(), false, 'дараа нь буцаад хэвийн');
}
{
  const timers = [];
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => { const id = { fn, ms }; timers.push(id); return id; };
  globalThis.clearTimeout = (id) => { const i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); };
  globalThis.window = {};
  try {
    const stop = startHoSync();
    assert.equal(timers.length, 1, 'нээгдэхэд нэг удаа товлоно');
    const boot = timers[0];
    __test.invalidateQuiet('CASHFLOW_NEW');
    assert.deepEqual(timers, [boot], 'өөрийн invalidate — дахин товлохгүй');
    invalidate('CASHFLOW_NEW');
    assert.equal(timers.length, 1);
    assert.notEqual(timers[0], boot, 'бусдын бичилт — дахин товлоно');
    assert.equal(timers[0].ms, 15_000, 'debounce 15 с');
    stop();
    assert.equal(timers.length, 0, 'зогсоогч таймерыг цэвэрлэнэ');
  } finally {
    globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; delete globalThis.window;
  }
}
console.log('hoSync/sync.check: бүгд ✅');
