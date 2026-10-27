/**
 * «Хуваарь»-ийн тайлан (`huvaariReport.ts`) — нэгтгэл · хүснэгт · хоцорсон ажлын шалгуур.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/huvaariReport.check.mjs
 */
import assert from 'node:assert/strict';
import { huvaariBlocks } from './huvaariReport.ts';

const D = (s) => Date.parse(`${s}T00:00:00Z`);
const row = (o) => ({ des: null, no: '', depth: 1, group: false, aStart: null, aEnd: null, bar: null, st: 'none', viol: false, ref: null, act: null, ...o });
const rows = [
  row({ no: '1', work: 'Шав', depth: 0, group: true, bar: { start: D('2026-01-01'), end: D('2026-03-31') } }),
  row({ des: 1, no: '1.1', work: 'Малталт', bar: { start: D('2026-01-01'), end: D('2026-01-10') }, st: 'done', act: 1 }),
  row({ des: 2, no: '1.2', work: 'Арматур', bar: { start: D('2026-02-01'), end: D('2026-03-31') }, st: 'late', act: 0.4, viol: true }),
  row({ des: 3, no: '1.3', work: 'Цутгалт' }),
];

const b = huvaariBlocks({ rows, hasActual: true });
const text = b.filter((x) => x.kind === 'p').map((x) => x.text);
assert.ok(text.includes('Нийт 3 ажил · хуваарьтай 2 · хуваарьгүй 1'));
assert.ok(text.includes('Хугацаа: 2026-01-01 эхэлж 2026-03-31 дуусна'));

const tables = b.filter((x) => x.kind === 'table');
const main = tables.find((t) => t.head[0].includes('Хоног'));
assert.equal(main.rows.length, 4);
assert.equal(main.rows[0][2], 'Шав');
assert.equal(main.rows[1][2], '  Малталт', 'гүнээр догол');
assert.deepEqual(main.rows[1].slice(3), ['2026-01-01', '2026-01-10', '10', '100%', 'дууссан']);
assert.equal(main.rows[0][7], '', 'бүлэгт төлөв бичихгүй');
assert.deepEqual(main.rows[3].slice(3, 6), ['', '', ''], 'хуваарьгүй мөр хоосон');

assert.ok(b.some((x) => x.kind === 'h' && x.text === 'Хоцорсон ажил: 1'));
assert.ok(b.some((x) => x.kind === 'h' && x.text === 'Уялдааны зөрчилтэй ажил: 1'));

/* Бодит гүйцэтгэлгүй: төлөвийн багана, хоцорсон хэсэг гарахгүй */
const nb = huvaariBlocks({ rows, hasActual: false });
assert.ok(!nb.some((x) => x.kind === 'h' && x.text.startsWith('Хоцорсон')));
assert.equal(nb.find((x) => x.kind === 'table').head[0].length, 6);

console.log('✅ huvaariReport — нэгтгэл · модны догол · хоцорсон · уялдаа');
