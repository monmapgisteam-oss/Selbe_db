/**
 * ӨГӨГДЛИЙН АВТОБУС — хүчингүй болголтын логик.
 *   node src/lib/dataBus.check.mjs
 *
 * Хамгаалж буй алдаа: хүснэгт рүү бичсэн атал ТҮҮНЭЭС уншдаг кэш хаягдаагүй
 * үлдвэл дашбоард хуучин тоо харуулна — дэлгэц дээр юу ч анзаарагдахгүй тул
 * гараар барихад хамгийн хэцүү төрлийн алдаа.
 *
 * ⚠️ Логик нь `dataBus.ts`/`live.ts`-ийн ХУУЛБАР (node нь TS уншихгүй) —
 * тэндээ өөрчилвөл ЭНДЭЭ ч өөрчил.
 */
import assert from 'node:assert/strict';

/* ── dataBus.ts-ийн хуулбар ── */
const SLOTS = [];
let version = 0;
const subs = new Set();

const register = (drop, reads) => { SLOTS.push({ drop, reads }); };
const invalidate = (...keys) => {
  if (!keys.length) return;
  const want = new Set(keys);
  let hit = 0;
  for (const s of SLOTS) if (s.reads.some((k) => want.has(k))) { s.drop(); hit += 1; }
  if (!hit) return;
  version += 1;
  for (const fn of subs) fn();
};
const dataVersion = () => version;
const subscribeData = (fn) => { subs.add(fn); return () => subs.delete(fn); };

/* ── live.ts-ийн cached() хуулбар ── */
function cached(fn, ttlMs, reads = []) {
  let p = null;
  let at = 0;
  if (reads.length) register(() => { p = null; }, reads);
  return () => {
    if (!p || (ttlMs != null && Date.now() - at > ttlMs)) {
      at = Date.now();
      p = fn();
      p.catch(() => { p = null; });
    }
    return p;
  };
}

let ok = 0;
const check = (label, cond) => {
  assert.ok(cond, '✗ ' + label);
  ok += 1;
  console.log('  ✓ ' + label);
};

console.log('\n1. Тагтай кэш — зөв хүснэгтэд хариулна');
let nFin = 0;
let nBud = 0;
const loadFin = cached(async () => ++nFin, undefined, ['IPC_LOG', 'CASHFLOW2']);
const loadBud = cached(async () => ++nBud, undefined, ['CASHFLOW2']);

await loadFin(); await loadBud();
check('эхний таталт', nFin === 1 && nBud === 1);
await loadFin(); await loadBud();
check('кэшнээс — дахин татахгүй', nFin === 1 && nBud === 1);

invalidate('IPC_LOG');
await loadFin(); await loadBud();
check('IPC_LOG хаяхад ЗӨВХӨН fin дахин татав', nFin === 2 && nBud === 1);

invalidate('CASHFLOW2');
await loadFin(); await loadBud();
check('CASHFLOW2 хаяхад ХОЁУЛАА дахин татав', nFin === 3 && nBud === 2);

console.log('\n2. Хамааралгүй хүснэгт — хөндөхгүй');
const v0 = dataVersion();
invalidate('HABEA');
await loadFin(); await loadBud();
check('HABEA хаяхад юу ч татагдаагүй', nFin === 3 && nBud === 2);
check('хувилбар ӨСӨӨГҮЙ (дэмий render гарахгүй)', dataVersion() === v0);

console.log('\n3. Тагггүй кэш — автобусаас хамаарахгүй');
let nPlain = 0;
const loadPlain = cached(async () => ++nPlain);
await loadPlain();
invalidate('IPC_LOG', 'CASHFLOW2', 'HABEA');
await loadPlain();
check('тагггүй кэш хэвээр (хуучин зан эвдрээгүй)', nPlain === 1);

console.log('\n4. Захиалга (subscribe) — UI дахин зурна');
let fired = 0;
const off = subscribeData(() => { fired += 1; });
invalidate('IPC_LOG');
check('захиалагч дуудагдав', fired === 1);
off();
invalidate('IPC_LOG');
check('тайлсны дараа дуудагдахгүй', fired === 1);

console.log('\n5. Алдаатай татах — кэшлэгдэхгүй');
let nBad = 0;
const loadBad = cached(async () => { nBad += 1; throw new Error('сүлжээ'); }, undefined, ['SURVEY']);
await loadBad().catch(() => {});
await loadBad().catch(() => {});
check('алдааны дараа ДАХИН оролдов', nBad === 2);

console.log('\n✅ Автобусын ' + ok + ' шалгуур давлаа');
