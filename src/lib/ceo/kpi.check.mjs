/**
 * CEO САМБАРЫН ГЭРЭЭНИЙ ТУСЛАХУУД — цэвэр, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/kpi.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. Хүснэгт ЧИМЭЭГҮЙ тасрах — `capRows` тасалсан тоогоо мөр болгож үлдээх ёстой.
 *   2. Багана/нүдний тоо зөрсөн хүснэгт дэлгэцэд эвдэрч зурагдах — `table()`
 *      шууд алдаа өгнө, дэлгэц рүү хүрэхгүй.
 *   3. `worstOf` нь `loading`/`unknown`-ыг дохио гэж тоолох — ачаалж буй
 *      картыг улаан болгодог хуучин согог.
 */
import assert from 'node:assert/strict';
import { capRows, cell, daysBetween, settled, table, worstOf, ROW_CAP } from './kpi.ts';

/* ── cell ── */
assert.deepEqual(cell(null), { v: null });
assert.deepEqual(cell(undefined, 'mnt'), { v: null, kind: 'mnt' });
assert.deepEqual(cell(0, 'count'), { v: 0, kind: 'count' }, '0 нь null БИШ — хадгалагдана');
assert.deepEqual(cell('Багц 1'), { v: 'Багц 1' });

/* ── capRows — тасалсан тоо ИЛ ── */
{
  const rows = Array.from({ length: ROW_CAP + 7 }, (_, i) => [cell(i), cell('x'), cell(null)]);
  const out = capRows(rows, 3);
  assert.equal(out.length, ROW_CAP + 1, 'дээд хязгаар + тайлбар мөр');
  const tail = out[out.length - 1];
  assert.equal(tail.length, 3, 'тайлбар мөр багана бүрд нүдтэй');
  assert.match(String(tail[0].v), /7/, 'тасалсан мөрийн тоо (7) бичигдэнэ');
  assert.equal(capRows(rows.slice(0, 5), 3).length, 5, 'хязгаар доторх жагсаалт хөндөгдөхгүй');
}

/* ── table — багана зөрвөл шууд алдаа ── */
{
  const ok = table('t', ['a', 'b'], [[cell(1), cell(2)]]);
  assert.equal(ok.rows.length, 1);
  assert.throws(() => table('t', ['a', 'b'], [[cell(1)]]), /багана/, '1 нүд, 2 багана → алдаа');
}

/* ── worstOf — дохио биш түвшинг тоолохгүй ── */
assert.equal(worstOf(['good', 'warn', 'bad']), 'bad');
assert.equal(worstOf(['good', 'warn', 'loading']), 'warn');
assert.equal(worstOf(['loading', 'good']), 'good');
assert.equal(worstOf(['loading', 'unknown']), 'unknown', 'дохиогүй ч уналт мэдэгдэнэ');
assert.equal(worstOf(['loading']), 'neutral');
assert.equal(worstOf([]), 'neutral');

/* ── settled — унасан эхийн НЭР ── */
{
  const r = settled(
    [{ status: 'fulfilled', value: 1 }, { status: 'rejected', reason: new Error('x') }, { status: 'fulfilled', value: 3 }],
    ['A', 'B', 'C'],
  );
  assert.deepEqual(r.ok, [1, 3]);
  assert.deepEqual(r.failed, ['B']);
}

/* ── daysBetween ── */
const D = 86_400_000;
assert.equal(daysBetween(0, 3 * D + 1000), 3, 'доош бүхэлчилнэ');
assert.equal(daysBetween(5 * D, 2 * D), 0, 'сөрөг → 0');

console.log('ceo/kpi.check.mjs — БҮГД ТЭНЦЛЭЭ');
