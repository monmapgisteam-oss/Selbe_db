/**
 * ТӨЛӨВЛӨХ ТҮВШИН — зөвхөн 3-р давхрын бүлгээр төлөвлөнө (2026-11-13), цэвэр логикийн шалгуур.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/huvaari/groupWorks.check.mjs
 *
 *   1. Төлөвлөх бүлэг = 3-р давхрын (`depth` 2) бүлэг; «Бүлгээр төлөвлөх» — доторх бүх ажил, бусад бүлэгт хоосон.
 *   2. Төлөвлөх бүлгийн доторх ажил, дэд бүлэг — гараар төлөвлөгдөхгүй (тарна).
 *   3. Доороо төлөвлөх бүлэгтэй дээд бүлэг — гараар төлөвлөгдөхгүй (нэгтгэгдэнэ).
 *   4. Төлөвлөх бүлэггүй салбарын ажил (А. Бэлтгэл ажил, задаргаагүй хүснэгт) — гараар хэвээр.
 *   5. Батлагдаагүй нэмэлт мөр (сөрөг oid) ажлын жагсаалтад ороогүй.
 */
import assert from 'node:assert/strict';

const { groupWorks, isPlanUnit, planUnitOf, unitWorks, manualPlannable, planLocks } = await import('./util.ts');

const row = (i, depth, group, o = {}) => ({
  i, oid: 100 + i, no: String(i), des: i + 1, deps: [], work: `w${i}`, depth, group, vol: null, spans: [null], ...o,
});

/*
 *  0 А. Бэлтгэл (бүлэг, depth 0) — 1 ажил (depth 1)
 *  2 Б. Барилга угсралт (depth 0)
 *  3   Б1 Барилгын ажил (depth 1)
 *  4     Суурь (depth 2 — төлөвлөх) — 5, 6 ажил
 *  7     Рам (depth 2 — төлөвлөх)
 *  8       1-р давхар (depth 3) — 9 ажил, 10 нэмэлт (сөрөг oid)
 * 11       2-р давхар (depth 3) — 12 ажил
 */
const plan = [
  row(0, 0, true), row(1, 1, false),
  row(2, 0, true), row(3, 1, true),
  row(4, 2, true), row(5, 3, false), row(6, 3, false),
  row(7, 2, true), row(8, 3, true), row(9, 4, false), row(10, 4, false, { oid: -1 }), row(11, 3, true), row(12, 4, false),
];

assert.equal(isPlanUnit(plan[4]), true);
assert.equal(isPlanUnit(plan[3]), false, '2-р давхар — төлөвлөх бүлэг биш');
assert.equal(isPlanUnit(plan[8]), false, '4-р давхар — төлөвлөх бүлэг биш');

assert.deepEqual(groupWorks(plan, 4), [5, 6]);
assert.deepEqual(groupWorks(plan, 7), [9, 12], 'дэд бүлгүүдийн бүх ажил, сөрөг oid ороогүй');
assert.deepEqual(groupWorks(plan, 3), [], 'дээд бүлэг — бүлгээр төлөвлөхгүй');
assert.deepEqual(groupWorks(plan, 8), [], 'доод дэд бүлэг — бүлгээр төлөвлөхгүй');
assert.deepEqual(groupWorks(plan, 0), [], 'төлөвлөх бүлэггүй салбарын бүлэг');
assert.deepEqual(unitWorks(plan, 7), [9, 12]);

assert.equal(planUnitOf(plan, 12), 7);
assert.equal(planUnitOf(plan, 11), 7);
assert.equal(planUnitOf(plan, 7), 7);
assert.equal(planUnitOf(plan, 3), -1);
assert.equal(planUnitOf(plan, 1), -1);

const manual = plan.map((_, k) => manualPlannable(plan, k));
assert.deepEqual(manual, [true, true, false, false, true, false, false, true, false, false, false, false, false]);

const locks = planLocks(plan);
assert.equal(locks.has(100 + 5), true);
assert.equal(locks.has(100 + 4), false);
assert.equal(locks.has(100 + 1), false, 'А. Бэлтгэлийн ажил гараар');
assert.match(locks.get(100 + 9), /«7 w7»/, 'шалтгаанд төлөвлөх бүлгийн нэр');
assert.equal(planLocks([row(0, 0, true), row(1, 1, false)]).size, 0, 'задаргаагүй хүснэгт — бүгд гараар');

console.log('✅ төлөвлөх түвшин — зөвхөн 3-р давхрын бүлэг, бусад нь автомат');

/* ══════════ 2026-11-16: сарын хувь автомат · багц хооронд хуулах ══════════ */
{
  const { evenPct, round100, unitKey, sourceUnitPlans } = await import('./copyPkg.ts');
  const ev = evenPct(['2026-04', '2026-05', '2026-06']);
  assert.equal([...ev.values()].reduce((a, v) => a + v, 0).toFixed(2), '100.00', 'жигд хувийн нийлбэр 100');
  assert.deepEqual([...ev.values()].sort(), [33.33, 33.33, 33.34]);
  assert.equal(round100(new Map([['a', 0]])).size, 0, 'жингүй бол хоосон');

  const D = (s) => Date.parse(`${s}T00:00:00Z`);
  const sp = (a, z) => ({ start: D(a), end: D(z) });
  /* Б1 › Суурь (2 ажил, 2 блок) — эх; ижил бүтэцтэй зорилт */
  const src = [
    row(0, 0, true, { work: 'Б. Барилга угсралт' }), row(1, 1, true, { work: 'Б1 Барилгын ажил' }),
    row(2, 2, true, { work: 'СУУРИЙН АЖИЛ' }),
    row(3, 3, false, { spans: [sp('2026-04-01', '2026-04-30'), sp('2026-05-01', '2026-05-31')] }),
    row(4, 3, false, { spans: [sp('2026-05-01', '2026-05-31'), null] }),
  ];
  const money = (k) => (k === 3 ? 300 : k === 4 ? 100 : null);
  const plans = sourceUnitPlans(src, 2, money, 10);
  const key = unitKey(src, 2);
  assert.equal(key, 'ББАРИЛГАУГСРАЛТ›Б1БАРИЛГЫНАЖИЛ›СУУРИЙНАЖИЛ', 'эцэг бүлгүүдийн нэр + өөрийн нэр');
  const u = plans.get(key);
  assert.ok(u, 'бүлгийн төлөвлөлт гарна');
  assert.equal(u.span.start, D('2026-04-11'), '10 хоногоор шилжинэ');
  assert.equal(u.span.end, D('2026-06-10'));
  assert.equal([...u.pct.values()].reduce((a, v) => a + v, 0).toFixed(2), '100.00', 'сарын хувийн нийлбэр 100');
  assert.ok(u.pct.get('2026-05') > u.pct.get('2026-04'), '5-р сард мөнгө их');
  const tgt = [row(0, 0, true, { work: 'Б. барилга угсралт' }), row(1, 1, true, { work: 'Б1  Барилгын ажил' }), row(2, 2, true, { work: 'Суурийн ажил' })];
  assert.equal(unitKey(tgt, 2), key, 'том/жижиг үсэг, зай ялгахгүй тааруулна');
  assert.equal(sourceUnitPlans([row(0, 2, true), row(1, 3, false)], 1, () => 1).size, 0, 'огноогүй бүлэг орохгүй');
  console.log('✅ сарын хувь автомат · багц хооронд хуулах');
}
