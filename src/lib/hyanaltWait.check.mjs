/**
 * Хяналтын хугацаа (2026-11-23) — цэвэр логикийн шалгуур.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hyanaltWait.check.mjs
 */
import assert from 'node:assert/strict';
import { F, STATUS } from './hyanalt.ts';
import { STAGE_LIMIT_DAYS, waitOf, waitSummary } from './hyanaltWait.ts';

const D = 86_400_000;
const now = Date.parse('2026-11-23T00:00:00Z');
const iso = (d) => new Date(now - d * D).toISOString();
const row = (st, extra) => ({ [F.status]: st, ...extra });

assert.equal(STAGE_LIMIT_DAYS, 2);
assert.equal(waitOf(row(STATUS.transferred, {}), STATUS.transferred, now), null, 'дууссан — хугацаа тоолохгүй');
{
  const w = waitOf(row(STATUS.engineerReview, { [F.companySent]: iso(1) }), STATUS.engineerReview, now);
  assert.deepEqual([w.owner, w.returned, Math.round(w.days), w.overdue], ['engineer', false, 1, false], 'инженер дээр 1 хоног — хугацаандаа');
}
{
  const w = waitOf(row(STATUS.managerReview, { [F.companySent]: iso(9), [F.engineerSent]: iso(3) }), STATUS.managerReview, now);
  assert.deepEqual([w.owner, Math.round(w.days), w.overdue], ['manager', 3, true], 'менежер дээр 3 хоног (инженер илгээснээс) — хэтэрсэн');
}
{
  const w = waitOf(row(STATUS.engineerReturned, { [F.companySent]: iso(9), [F.engineerReturned]: iso(4) }), STATUS.engineerReturned, now);
  assert.deepEqual([w.owner, w.returned, Math.round(w.days), w.overdue], ['company', true, 4, true], 'буцаагдсан — компани дээр буцаасан огнооноос');
}
{
  const w = waitOf(row(STATUS.managerReturned, { [F.managerReturned]: iso(0.5) }), STATUS.managerReturned, now);
  assert.deepEqual([w.owner, w.returned, w.overdue], ['engineer', true, false], 'менежер буцаасан — инженер дээр');
}
{
  const w = waitOf(row(STATUS.plannerReview, {}), STATUS.plannerReview, now);
  assert.deepEqual([w.owner, w.days, w.overdue], ['planner', null, false], 'огноо алга — хоног тодорхойгүй, хэтэрсэн гэж тооцохгүй');
}
assert.deepEqual(waitSummary([{ owner: 'engineer', overdue: true }, { owner: 'engineer', overdue: false }, { owner: 'company', overdue: true }]),
  { engineer: { n: 2, overdue: 1 }, company: { n: 1, overdue: 1 } });
console.log('hyanaltWait.check: бүгд ✅');
