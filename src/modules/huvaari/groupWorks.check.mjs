/**
 * БҮЛГЭЭР ТӨЛӨВЛӨХ АЖЛУУД — цэвэр логикийн шалгуур (2026-11-05).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/huvaari/groupWorks.check.mjs
 *
 *   1. Шууд ажилтай бүлэг — зөвхөн шууд ажлууд (дэд бүлгийн ажил орохгүй), `directWorks`-тэй ижил.
 *   2. Зөвхөн дэд бүлэгтэй том бүлэг — доторх бүх навч мөрийн дарааллаар; `directWorks` хоосон хэвээр.
 *   3. Батлагдаагүй нэмэлт мөр (сөрөг oid) ороогүй; бүлгээс гадуурх мөр ороогүй.
 */
import assert from 'node:assert/strict';

const { directWorks, groupWorks, hasSubGroup } = await import('./util.ts');

const row = (i, depth, group, o = {}) => ({
  i, oid: 100 + i, no: String(i), des: i + 1, deps: [], work: `w${i}`, depth, group, vol: null, spans: [null], ...o,
});

/*
 * 0 Б1 (том)            depth 0
 *   1 Давхар 1 (жижиг)  depth 1
 *     2 ажил, 3 ажил    depth 2
 *   4 Давхар 2 (жижиг)  depth 1
 *     5 ажил, 6 нэмэлт (сөрөг oid)
 * 7 Б2 (шууд ажилтай + дэд бүлэгтэй)
 *   8 ажил
 *   9 дэд бүлэг
 *     10 ажил
 * 11 бүлгээс гадуурх ажил
 */
const plan = [
  row(0, 0, true), row(1, 1, true), row(2, 2, false), row(3, 2, false), row(4, 1, true), row(5, 2, false),
  row(6, 2, false, { oid: -1 }), row(7, 0, true), row(8, 1, false), row(9, 1, true), row(10, 2, false), row(11, 0, false),
];

assert.deepEqual(directWorks(plan, 0), [], 'том бүлэгт шууд ажил алга');
assert.equal(hasSubGroup(plan, 0), true);
assert.deepEqual(groupWorks(plan, 0), [2, 3, 5], 'том бүлэг — бүх навч мөрийн дарааллаар, сөрөг oid ороогүй');
assert.deepEqual(groupWorks(plan, 1), [2, 3], 'жижиг бүлэг — шууд ажлууд');
assert.deepEqual(groupWorks(plan, 1), directWorks(plan, 1));
assert.deepEqual(groupWorks(plan, 4), [5], 'нэмэлт мөр (сөрөг oid) ороогүй');
assert.deepEqual(groupWorks(plan, 7), [8], 'шууд ажилтай бүлэг — дэд бүлгийн ажил орохгүй (урьдын дүрэм хэвээр)');
assert.deepEqual(groupWorks(plan, 9), [10]);
assert.deepEqual(groupWorks(plan, 11), [], 'ажлын мөр — бүлэг биш');
assert.deepEqual(groupWorks(plan, 99), [], 'индекс олдоогүй');

/* Өөрийн огноогүй бүлгийн зурвасыг чирэх — хүүхдээс бодсон мужаас эхэлнэ; буцаахад хадгалагдсан (хоосон) утга сэргэнэ */
{
  const { readFileSync } = await import('node:fs');
  const SRC = readFileSync(new URL('./useDragPlan.ts', import.meta.url), 'utf8');
  assert.match(SRC, /const g = \(gi >= 0 \? effSpan\(plan, gi, blk\) : null\) \?\? r\.spans\[blk\]/, 'бүлгийн чирэлт effSpan-аас');
  assert.match(SRC, /orig: grp\.current\?\.g \?\? r\.spans\[blk\], own: r\.spans\[blk\]/, 'orig — бодсон муж, own — хадгалагдсан');
  assert.equal((SRC.match(/span: drag\.orig/g) ?? []).length, 0, 'буцаалт түүхий `orig`-оор бичихгүй');
  assert.equal((SRC.match(/span: ownOf\(drag\)/g) ?? []).length, 3, 'гурван буцаалтын зам');
}

console.log('✅ groupWorks — шууд ажилтай бүлэг хэвээр, том бүлэг бүх навчаар');
