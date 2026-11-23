/**
 * ӨМНӨХ ЗӨВШӨӨРЛИЙГ ҮРГЭЛЖЛҮҮЛЭХ — шинэ илгээлтийн мөр өмнөхтэй яг ижил байж л ногоон (2026-11-24).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/modules/huvaari/payload.check.mjs
 *
 *   1. Блок 1-ийг 20→200 болгож дахин илгээсэн (өмнөх илгээлтэд блок 1 суурьтай ижил) → үргэлжлэхгүй.
 *   2. Өмнөх илгээлтэд байгаагүй уялдаа / сарын обьём түлхүүр шинэд нэмэгдсэн → үргэлжлэхгүй.
 *   3. Бүх утга ижил → 'ok' үргэлжилнэ; `cur` өгөөгүй (зохиогчийн тэмдэг) → хуучин дүрмээр.
 */
import assert from 'node:assert/strict';

const { backMarkMapOf, samePayRowOf } = await import('./payload.ts');

const D = 86_400_000;
const sp = (a, b) => ({ start: a * D, end: b * D });
const OID = 101;
const DES = 2;
const n = 2;
const basePay = () => ({
  kind: 'plan',
  spans: { [OID]: [sp(10, 20), sp(20, 30)] },
  deps: {},
  obyem: {},
  obres: {},
  actual: {},
  res: {},
  keys: { [OID]: DES },
  base: { spans: { [OID]: [sp(5, 15), sp(20, 30)] }, deps: {}, obyem: {}, actual: {}, res: {}, obres: {} },
});
const planRow = (spans) => ({ i: 0, oid: OID, no: '1', des: DES, deps: [], work: 'w', depth: 1, group: false, vol: null, spans });
const run = (prev, cur, spans) => backMarkMapOf({
  backOn: true,
  backMarks: { oid: 9, ok: new Set([OID]), pay: prev },
  rows: [{ oid: OID, des: DES }],
  plan: [planRow(spans)],
  byCode: new Map([[DES, 0]]),
  reviewSet: new Set([OID]),
  n,
  obDraft: new Map(),
  obPlan: new Map(),
  obResDraft: new Map(),
  obRes: new Map(),
  cur,
}).get(OID);

/* 1 — блок 1 нь 20→200; хуучин шалгалт блок 1-ийг (суурьтай ижил) алгасдаг байсан */
{
  const prev = basePay();
  const cur = basePay();
  cur.spans[OID] = [sp(10, 20), sp(200, 210)];
  const viewSpans = [sp(10, 20), sp(200, 210)];
  assert.equal(run(prev, undefined, viewSpans), 'ok', 'хуучин дүрэм (cur-гүй) — алдааг харуулна');
  assert.equal(run(prev, cur, viewSpans), undefined, 'шинэ өөрчлөлттэй мөр үргэлжлэхгүй');
  assert.equal(samePayRowOf(prev, cur, OID, DES, n), false);
}
/* 2 — шинэ уялдаа / сарын обьём түлхүүр */
{
  const prev = basePay();
  const cur = basePay();
  cur.deps[OID] = '3ED';
  assert.equal(samePayRowOf(prev, cur, OID, DES, n), false, 'шинэ уялдаа');
  const cur2 = basePay();
  cur2.obyem[`${DES}|0`] = { '2026-05': 10 };
  assert.equal(samePayRowOf(prev, cur2, OID, DES, n), false, 'шинэ сарын обьём');
  assert.equal(run(prev, cur2, [sp(10, 20), sp(20, 30)]), undefined);
  const cur3 = basePay();
  cur3.actual[OID] = { start: [12 * D, null], end: [null, null] };
  assert.equal(samePayRowOf(prev, cur3, OID, DES, n), false, 'шинэ бодит огноо');
  const cur4 = basePay();
  cur4.res[OID] = { hun: 4, mashin: null };
  assert.equal(samePayRowOf(prev, cur4, OID, DES, n), false, 'шинэ нөөц');
  const prev5 = basePay();
  prev5.obyem[`${DES}|0`] = { '2026-05': 10 };
  const cur5 = basePay();
  cur5.obyem[`${DES}|0`] = { '2026-05': 11 };
  assert.equal(samePayRowOf(prev5, cur5, OID, DES, n), false, 'өөр сарын обьём');
}
/* 3 — бүх утга ижил */
{
  const prev = basePay();
  prev.deps[OID] = '3ED';
  prev.obyem[`${DES}|0`] = { '2026-05': 10 };
  const cur = basePay();
  cur.deps[OID] = '3ED';
  cur.obyem[`${DES}|0`] = { '2026-05': 10 };
  assert.equal(samePayRowOf(prev, cur, OID, DES, n), true);
}

console.log('payload.check: OK');
