/**
 * «БҮХ БЛОК» ХАРАГДАЦЫН ХАВТГАЙ ЖАГСААЛТ — цэвэр логикийн шалгуур (2026-10-04).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/huvaari/allBlocks.check.mjs
 *
 *   1. Ажлын мөр — хуваарьтай блок бүрд дэд мөр, хуваарьгүй блок алгасна, дараалал хэвээр.
 *   2. Бүлгийн мөр — блок бүрийн муж хүүхдээс (`effSpan`); хүүхэдгүй блокт өөрийн огноо.
 *   3. Эх мөрийн муж = блокуудын нэгдэл; огт хуваарьгүй бол `null` (0 БИШ), дэд мөргүй.
 *   4. `plainRows` — дэд мөргүй, `visible`-тэй 1:1.
 *   5. `actUnion` — үргэлжилж буй блок байвал «дууссан» `null`.
 */
import assert from 'node:assert/strict';

const { allBlockRows, plainRows, unionSpans, actUnion } = await import('./allBlocks.ts');

const D = 86400000;
const sp = (a, z) => ({ start: a * D, end: z * D });
const row = (i, o) => ({
  i, oid: 100 + i, no: String(i), des: i + 1, deps: [], work: `w${i}`, depth: 0, group: false, vol: null,
  spans: [null, null, null], ...o,
});

/* Бүлэг (0) → ажил (1, 2); бие даасан ажил (3); хуваарьгүй ажил (4) */
const plan = [
  row(0, { group: true, spans: [null, null, sp(50, 60)] }),
  row(1, { depth: 1, spans: [sp(1, 5), null, null] }),
  row(2, { depth: 1, spans: [sp(3, 9), sp(10, 12), null] }),
  row(3, { spans: [null, sp(20, 25), sp(30, 31)] }),
  row(4, {}),
];

/* 1–3 */
{
  const out = allBlockRows(plan, plan, 3);
  assert.deepEqual(out.map((d) => [d.oid, d.b]), [
    [100, -1], [100, 0], [100, 1], [100, 2],
    [101, -1], [101, 0],
    [102, -1], [102, 0], [102, 1],
    [103, -1], [103, 1], [103, 2],
    [104, -1],
  ]);
  const g = out.filter((d) => d.oid === 100);
  /* блок 0: хүүхдүүдийн MIN/MAX (1→9); блок 1: ганц хүүхэд (10→12); блок 2: хүүхэдгүй → өөрийн (50→60) */
  assert.deepEqual(g[1].sp, sp(1, 9));
  assert.deepEqual(g[2].sp, sp(10, 12));
  assert.deepEqual(g[3].sp, sp(50, 60));
  assert.deepEqual(g[0].sp, sp(1, 60), 'эх мөр = нэгдэл');
  assert.deepEqual(out.find((d) => d.oid === 103 && d.b < 0).sp, sp(20, 31));
  assert.equal(out.find((d) => d.oid === 104).sp, null, 'хуваарьгүй → null, 0 биш');
  assert.ok(out.every((d) => d.r === plan[d.oid - 100]), 'эх мөрийн лавлагаа');
}
/* Шүүсэн/эвхсэн `visible` — зөвхөн тэдгээр мөр, дараалал хэвээр */
{
  const out = allBlockRows([plan[3], plan[1]], plan, 3);
  assert.deepEqual(out.map((d) => [d.oid, d.b]), [[103, -1], [103, 1], [103, 2], [101, -1], [101, 0]]);
}
/* 4 */
{
  const out = plainRows(plan);
  assert.equal(out.length, plan.length);
  assert.ok(out.every((d, k) => d.b === -1 && d.r === plan[k] && d.oid === plan[k].oid && d.sp === null));
}
/* unionSpans */
assert.equal(unionSpans([null, undefined]), null);
assert.deepEqual(unionSpans([sp(5, 6), null, sp(2, 3)]), sp(2, 6));
/* 5 */
assert.deepEqual(actUnion([null, 5, 3], [null, 9, 7]), { start: 3, end: 9 });
assert.deepEqual(actUnion([null, 5, 3], [null, 9, null]), { start: 3, end: null }, 'үргэлжилж буй блок');
assert.deepEqual(actUnion([null, null], [null, 4]), { start: null, end: null });
assert.deepEqual(actUnion(undefined, undefined), { start: null, end: null });

console.log('allBlocks: OK');
