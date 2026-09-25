/**
 * НЭМЭЛТ АЖЛЫН БУУЛГАЛТЫН ЦЭВЭР ХЭСГИЙН ШАЛГУУР — сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ajilApply.check.mjs
 *
 * Хамгаалж буй дүрмүүд (2026-09-24):
 *   1. Давхардал: эцгийг `insertAdds.parentOf`-той ИЖИЛ (нэр + `parentIdx`-д
 *      хамгийн ойрхон) олж, ЗӨВХӨН тэр эцгийн дэд модны АЖЛЫН мөрөөс хайна —
 *      ижил нэртэй ӨӨР блокийн бүлэг дор байгаа мөр давхардал БИШ; дэд бүлэг
 *      (group) мөр давхардалд тоологдохгүй. Нэг илгээлт доторх давхар мөр хаягдана.
 *   2. Өдөр: `max(өнөөдөр ЛОКАЛ өдөр (Date.UTC(y,m,d)), сүүлийн жаазны өдөр)` —
 *      `hyanaltStore.archiveSubmission`/`FillNew.todayFillMs`-тэй ижил томъёо;
 *      хуучин өдрөөр бичвэл жааз булагдана.
 */
import assert from 'node:assert/strict';
import { addPresent, dedupeAdds, fillMsFor, dayStartUtc, parentIdxOf, sameFrame, todayLocalMs } from './ajilApply.ts';

const row = (no, work, group, depth) => ({ no, work, group, depth });
const add = (parentNo, parentWork, no, work, oid = -1, parentIdx = 0) => ({
  oid, parentNo, parentWork, parentIdx, no, work, vol: null, unit: null,
});

/* ── 1. Давхардал ── */
const rows = [
  row('1', 'СУУРЬ', true, 0),          // 0
  row('1', 'Ухах', false, 1),          // 1
  row('2', 'Цутгах', false, 1),        // 2
  row('10', 'БУСАД АЖИЛ', true, 0),    // 3 — ижил нэртэй эхний эцэг
  row('1', 'Хог зайлуулах', false, 1), // 4
  row('10', 'БУСАД АЖИЛ', true, 0),    // 5 — ижил нэртэй ХОЁР ДАХЬ эцэг (Багц 1-ийн жишээ)
  row('2', 'Хашаа', false, 1),         // 6
  row('3', 'ДЭД БҮЛЭГ', true, 1),      // 7 — дэд бүлэг (group)
  row('1', 'Дэд ажил', false, 2),      // 8
];
assert.equal(parentIdxOf(rows, add('10', 'БУСАД АЖИЛ', 'x', 'y', -1, 5)), 5, 'ойрхон эцэг — байрлалаар');
assert.equal(parentIdxOf(rows, add('10', 'БУСАД АЖИЛ', 'x', 'y', -1, 2)), 3, 'ойрхон эцэг — 2 → 3');
assert.equal(parentIdxOf(rows, add('99', 'АЛГА', 'x', 'y')), -1, 'эцэг алга');

assert.equal(addPresent(rows, add('1', 'СУУРЬ', '2', 'Цутгах')), true, 'байгаа мөр — байна');
assert.equal(addPresent(rows, add('1', 'СУУРЬ', '3', 'Хучих')), false, 'шинэ мөр — байхгүй');
assert.equal(addPresent(rows, add('10', 'БУСАД АЖИЛ', '2', 'Хашаа', -1, 5)), true, 'хоёр дахь эцгийн доор — тэр эцгээр олдоно');
assert.equal(addPresent(rows, add('10', 'БУСАД АЖИЛ', '2', 'Хашаа', -1, 3)), false, 'эхний эцгийг заасан бол хоёр дахийн мөр давхардал БИШ');
assert.equal(addPresent(rows, add('10', 'БУСАД АЖИЛ', '1', 'Ухах', -1, 3)), false, 'өөр эцгийн доорх ижил нэр давхардал БИШ');
assert.equal(addPresent(rows, add('10', 'БУСАД АЖИЛ', '3', 'ДЭД БҮЛЭГ', -1, 5)), false, 'бүлгийн мөр давхардалд тоологдохгүй');
assert.equal(addPresent(rows, add('10', 'БУСАД АЖИЛ', '1', 'Дэд ажил', -1, 5)), true, 'дам хүүхэд (дэд бүлгийн доорх) олдоно');
assert.equal(addPresent(rows, add('99', 'БАЙХГҮЙ', '1', 'Ухах')), false, 'эцэг алга — байхгүй');
assert.equal(addPresent(rows, add(' 1 ', 'СУУРЬ ', '2', ' Цутгах')), true, 'хоосон зай үл харгалзана');

const d = dedupeAdds(rows, [
  add('1', 'СУУРЬ', '2', 'Цутгах', -1),          // байна → хаяна
  add('1', 'СУУРЬ', '3', 'Хучих', -2),           // шинэ
  add('1', 'СУУРЬ', '3', 'Хучих', -3),           // илгээлт доторх давхар → хаяна
  add('10', 'БУСАД АЖИЛ', '5', 'Шинэ', -4, 5),   // шинэ
  add('10', 'БУСАД АЖИЛ', '2', 'Хашаа', -5, 3),  // эхний эцэгт «Хашаа» алга → шинэ
]);
assert.deepEqual(d.fresh.map((a) => a.oid), [-2, -4, -5], 'зөвхөн шинэ мөр үлдэнэ, дараалал хадгалагдана');
assert.deepEqual(d.dropped.map((a) => a.oid), [-1, -3], 'байгаа ба давхар мөр хаягдана');
assert.deepEqual(dedupeAdds(rows, []).fresh, [], 'хоосон — хоосон');
/* ⚠️ 2026-09-25: ижил нэртэй ХОЁР эцгийн (3 ба 5) дор тус тусад нэмсэн ижил
   «2 · Хашаа» — давхардал БИШ, хоёулаа шинэ (түлхүүрт эцгийн БАЙРЛАЛ орно). */
const rows2 = rows.map((r, i) => (i === 6 ? row('2', 'Хаалга', false, 1) : r));
assert.deepEqual(
  dedupeAdds(rows2, [
    add('10', 'БУСАД АЖИЛ', '2', 'Хашаа', -6, 3),
    add('10', 'БУСАД АЖИЛ', '2', 'Хашаа', -7, 5),
  ]).fresh.map((a) => a.oid),
  [-6, -7],
  'өөр эцгийн (3 · 5) дорх ижил нэрт мөр хоёулаа шинэ',
);
console.log('✅ давхардал хасах');

/* ── 1b. sameFrame — мөр бүрийн OID + түүхий атрибут (2026-09-25) ── */
const fr = (raw2) => ({
  asOf: 100, snapshot: 200,
  rows: [{ oid: 1, raw: { a: 1, b: 'x' } }, { oid: 2, raw: { a: 2, b: raw2 } }],
});
assert.equal(sameFrame(fr('y'), fr('y')), true, 'ижил жааз — true');
assert.equal(sameFrame(fr('y'), fr('z')), false, 'нэг түүхий атрибут зөрвөл — false (Хуваарийн applyUpdates)');
console.log('✅ жааз тулгах');

/* ── 2. Өдөр — ЛОКАЛ өдөр, ямар ч цагийн бүсэд ── */
const T = new Date(2026, 8, 24, 13, 45).getTime();   // локал 2026-09-24 13:45
const today = Date.UTC(2026, 8, 24);
assert.equal(todayLocalMs(T), today, 'локал өдөр → Date.UTC(y,m,d)');
assert.equal(todayLocalMs(new Date(2026, 8, 24, 0, 30).getTime()), today, 'локал 00:30 ч мөн өнөөдөр (UTC-ээр өчигдөр байж болно)');
assert.equal(fillMsFor(T, null), today, 'жаазгүй — өнөөдөр');
assert.equal(fillMsFor(T, Date.UTC(2026, 8, 20, 9)), today, 'хуучин жааз — өнөөдөр');
assert.equal(fillMsFor(T, Date.UTC(2026, 8, 24, 3)), today, 'өнөөдрийн жааз — өнөөдөр (нэг өдрийн 2 дахь жааз, lastFrame ялгана)');
assert.equal(fillMsFor(T, Date.UTC(2026, 8, 26, 1)), Date.UTC(2026, 8, 26), 'ирээдүйн жааз — тэр өдөр (булагдахгүй)');
assert.equal(fillMsFor(T, NaN), today, 'эвдэрсэн агшин — өнөөдөр');
assert.equal(dayStartUtc(Date.UTC(2026, 8, 24, 13, 45)), today);
assert.ok(fillMsFor(T, Date.UTC(2020, 0, 1)) >= today, 'өнөөдрөөс хуучин өдөр хэзээ ч буцаахгүй');
console.log('✅ бөглөсөн өдрийн дүрэм');

console.log('ajilApply.check: OK');
