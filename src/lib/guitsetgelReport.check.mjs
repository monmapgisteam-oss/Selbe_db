/**
 * «Гүйцэтгэл»-ийн тайлан (`guitsetgelReport.ts`) — шатын задаргааны шалгуур.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/guitsetgelReport.check.mjs
 *
 * Хамгаалж буй алдаа: ажил буруу хэсэгт орох (жиш. менежер буцаасан ажил инженерийн «менежерт
 * шилжүүлсэн» хэсэгт давхар тоологдох) — тайлан чимээгүй худал болно.
 */
import assert from 'node:assert/strict';
import { DECISION, F, STATUS } from './hyanalt.ts';
import { groupWorks } from './hyanaltGroup.ts';
import { guitsetgelBlocks } from './guitsetgelReport.ts';

let oid = 0;
const row = (ajil, status, extra = {}) => ({
  __oid: ++oid, [F.id]: `G-${oid}`, [F.sheetOid]: oid, [F.ergelt]: 1,
  [F.bagts]: 'Багц 1', [F.ajil]: ajil, [F.company]: 'ХХК',
  [F.companySent]: '2026-10-01T02:00:00.000Z', [F.status]: status, ...extra,
});

const works = groupWorks([
  row('А', STATUS.engineerReview),
  row('Б', STATUS.engineerReturned, { [F.engineerDecision]: DECISION.return, [F.engineerReason]: 'зураг дутуу' }),
  row('В', STATUS.managerReview, { [F.engineerDecision]: DECISION.approve, [F.engineerSent]: '2026-10-02T02:00:00.000Z' }),
  row('Г', STATUS.managerReturned, { [F.engineerDecision]: DECISION.approve, [F.managerDecision]: DECISION.return, [F.managerReason]: 'тоо зөрсөн' }),
  row('Д', STATUS.transferred, Object.fromEntries(['engineer', 'manager', 'director', 'head', 'chief']
    .map((s) => [F[`${s}Decision`], DECISION.approve]))),
]);
const blocks = guitsetgelBlocks(works, Date.parse('2026-10-11T02:00:00.000Z'));

/** H2 гарчгийн дараах хүснэгтийн «Ажил» баганын утгууд */
const sectionWorks = (h1, h2) => {
  const i = blocks.findIndex((b) => b.kind === 'h' && b.level === 1 && b.text === h1);
  assert.ok(i >= 0, `H1 ${h1}`);
  for (let j = i + 1; j < blocks.length; j++) {
    const b = blocks[j];
    if (b.kind === 'h' && b.level === 1) break;
    if (b.kind === 'h' && b.level === 2 && b.text.startsWith(h2)) {
      const t = blocks[j + 1];
      return t.kind === 'table' ? t.rows.map((r) => r[2]) : [];
    }
  }
  assert.fail(`H2 ${h2}`);
};

assert.deepEqual(sectionWorks('Гүйцэтгэгч компани', 'Батлагдсан ажил'), ['Д']);
assert.deepEqual(sectionWorks('Гүйцэтгэгч компани', 'Илгээсэн, хянагдаж буй').sort(), ['А', 'В', 'Г']);
assert.deepEqual(sectionWorks('Гүйцэтгэгч компани', 'Буцаагдсан, засах'), ['Б']);

assert.deepEqual(sectionWorks('Хяналтын инженер', 'Хүлээгдэж буй'), ['А']);
assert.deepEqual(sectionWorks('Хяналтын инженер', 'Багцын ахлах инженер буцааж'), ['Г']);
assert.deepEqual(sectionWorks('Хяналтын инженер', 'Багцын ахлах инженерт шилжүүлсэн').sort(), ['В', 'Д']);
assert.deepEqual(sectionWorks('Хяналтын инженер', 'Гүйцэтгэгч компанид буцаасан'), ['Б']);
assert.deepEqual(sectionWorks('Газрын дарга', 'Баталж бүртгэсэн'), ['Д']);

/* Хүлээсэн хоног: 10-01 → 10-11 = 10 */
const pend = blocks[blocks.findIndex((b) => b.kind === 'h' && b.text.startsWith('Хүлээгдэж буй')) + 1];
assert.equal(pend.rows[0][4], '2026-10-01');
assert.equal(pend.rows[0][5], '10');

console.log('✅ guitsetgelReport — компани · инженер · дээд шатын задаргаа, давхар тоололгүй');
