/**
 * `useAsync` — автобусын шинэчлэлт ба ПАРАМЕТРИЙН солилт давхцахад ХУУЧИН
 * параметрийн өгөгдөл харагдахгүй (2026-10-01).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/useAsync.check.mjs
 *
 * ⚠️ Hook-ийн шийдвэрийн цэвэр функцууд (`paramsChanged` · `keepStale` ·
 *    `visibleResult`) — жинхэнэ модулиас, хуулбар логик биш.
 */
import assert from 'node:assert/strict';
import { paramsChanged, keepStale, visibleResult } from '@/lib/useAsync';

const LOADING = { state: 'loading', data: null, error: null };
const ready = (data) => ({ state: 'ready', data, error: null });

/* ── paramsChanged ── */
assert.equal(paramsChanged(null, ['a'], undefined), true, 'анхны ачаалалт');
assert.equal(paramsChanged(['a', 1], ['a', 1], undefined), false);
assert.equal(paramsChanged(['7d'], ['30d'], undefined), true);
/* keepOn-ы утга (tick) өссөн нь параметрийн солилт БИШ */
assert.equal(paramsChanged([1, '7d'], [2, '7d'], [2]), false);
/* tick ба range ЗЭРЭГ — range нь параметр */
assert.equal(paramsChanged([1, '7d'], [2, '30d'], [2]), true);
assert.equal(paramsChanged(['a'], ['a', 'b'], undefined), true, 'урт өөр');
console.log('✅ paramsChanged: keepOn-ы өсөлт ≠ параметр · урт · анхны');

/* ── keepStale: АВТОБУС + ПАРАМЕТР давхцвал хуучныг БАРИХГҮЙ ── */
assert.equal(keepStale(true, false, false), true, 'зөвхөн автобус → хуучныг барина');
assert.equal(keepStale(false, true, false), true, 'зөвхөн keepOn → хуучныг барина');
assert.equal(keepStale(true, false, true), false, 'автобус + параметр → LOADING байх ёстой (засвар)');
assert.equal(keepStale(false, true, true), false, 'keepOn + параметр → LOADING');
assert.equal(keepStale(false, false, false), false, 'retry/StrictMode → LOADING (хуучин зан)');
assert.equal(keepStale(false, false, true), false);
console.log('✅ keepStale: автобус/keepOn дангаараа → хуучин үлдэнэ · параметртэй давхцвал → LOADING');

/* ── visibleResult: зурах үед хуучин параметрийн утгыг нууна ── */
{
  const t = { r: ready({ pkg: 'B1', n: 5 }), forDeps: ['B1'] };
  assert.equal(visibleResult(t, ['B1'], undefined, LOADING), t.r, 'ижил параметр → утга харагдана');
  assert.equal(visibleResult(t, ['B2'], undefined, LOADING), LOADING, 'B1-ийн тоо B2-ийн дэлгэц дээр гарах ёсгүй');
  /* keepOn (tick) өссөн → хуучин утга (stale-while-revalidate) */
  const k = { r: ready(1), forDeps: [1, '7d'] };
  assert.equal(visibleResult(k, [2, '7d'], [2], LOADING), k.r);
  assert.equal(visibleResult(k, [2, '30d'], [2], LOADING), LOADING);
  /* Алдаа ч мөн хуучин параметрийнх бол нуугдана */
  const e = { r: { state: 'error', data: null, error: new Error('x') }, forDeps: ['B1'] };
  assert.equal(visibleResult(e, ['B2'], undefined, LOADING), LOADING);
  /* Анхны төлөв */
  const init = { r: LOADING, forDeps: null };
  assert.equal(visibleResult(init, ['B1'], undefined, LOADING), LOADING);
  console.log('✅ visibleResult: өөр параметрийн утга/алдаа → LOADING · keepOn → хуучин үлдэнэ');
}
