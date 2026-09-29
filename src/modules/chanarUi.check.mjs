/**
 * ЧАНАРЫН БАРИМТЫН ДЭЛГЭЦИЙН ТУСЛАХУУДЫН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/chanarUi.check.mjs
 *
 * Хамгаалж буй зүйл (2026-09-28):
 *   1. Хайлт — дугаар/нэр, том жижиг ялгахгүй, хоосон → бүгд.
 *   2. Ноорог зөвхөн зохиогчид (эсвэл super) — `visibleInPkg`.
 *   3. Таб дээрх тоо — СҮҮЛИЙН хувилбарыг л тоолно (rev0 + rev1 = 1).
 *   4. Баримтын шийдвэрийн код — REP давамгайлна; шийдвэргүй → null; R > AN > A.
 *   5. MA/NCR хураангуй.
 *   6. OK → N/A → X → хоосон мөчлөг; огнооны хөрвүүлэлт хоёр чиглэлд.
 *   7. Хэвлэх гарын үсгийн мөр — төрөл бүрд практикийн тоо (MS 6 · MA 6 · MIR/FIC 3 · NCR 5);
 *      2026-09-28: MA-ийн гүйцэтгэгчийн мөр `body.signatures`-аас, `maMaterialSummary`, QMP/PRC.
 */
import assert from 'node:assert/strict';
import { MS_STATUS, VERDICT, emptyReviews } from '../lib/chanarMs.ts';
import {
  matchesSearch, visibleInPkg, kindCounts, docVerdict, maSummary, maMaterialSummary, ncrSummary,
  nextCheck, checkLabel, toDateInput, fromDateInput, ymd, printSigRoles, repSigRoles, linesToList, listToLines,
} from './chanar/chanarUi.ts';

const T = 1_700_000_000_000;
const mk = (o) => ({
  oid: 1, kind: 'MS', docNo: 'MSC-SLB-MS-P0302-0001-00', org: 'MSC', bagts: 'Багц 3.2', seq: 1, rev: 0,
  title: 'Төмөр бетон', status: MS_STATUS.review, author: 'guits', sentAt: T, reviews: emptyReviews(), decidedAt: null, rep: null,
  ...o,
});

/* 1. Хайлт */
{
  const d = mk({});
  assert.equal(matchesSearch(d, ''), true);
  assert.equal(matchesSearch(d, '  '), true);
  assert.equal(matchesSearch(d, 'p0302-0001'), true, 'дугаар — жижиг үсгээр');
  assert.equal(matchesSearch(d, 'бетон'), true, 'нэр');
  assert.equal(matchesSearch(d, 'арматур'), false);
}

/* 2. Ноорог зөвхөн зохиогчид */
{
  const docs = [
    mk({ oid: 1, status: MS_STATUS.draft, author: 'a' }),
    mk({ oid: 2, status: MS_STATUS.review, author: 'a' }),
    mk({ oid: 3, status: MS_STATUS.draft, author: 'b', bagts: 'Багц 1' }),
  ];
  assert.deepEqual(visibleInPkg(docs, 'Багц 3.2', 'A', false).map((d) => d.oid), [1, 2], 'зохиогч (том үсэг ч) өөрийн ноорогоо харна');
  assert.deepEqual(visibleInPkg(docs, 'Багц 3.2', 'c', false).map((d) => d.oid), [2], 'бусад ноорог харахгүй');
  assert.deepEqual(visibleInPkg(docs, 'Багц 3.2', 'c', true).map((d) => d.oid), [1, 2], 'super бүгдийг');
  assert.deepEqual(visibleInPkg(docs, 'Багц 3.2', '', false).map((d) => d.oid), [2], 'нэвтрээгүй → ноорог үгүй');
}

/* 3. Таб дээрх тоо — сүүлийн хувилбар */
{
  const c = kindCounts([
    mk({ oid: 1, rev: 0, status: MS_STATUS.returned }), mk({ oid: 2, rev: 1 }),
    mk({ oid: 3, kind: 'MA', seq: 1 }), mk({ oid: 4, kind: 'NCR', seq: 1 }), mk({ oid: 5, kind: 'NCR', seq: 2 }),
  ]);
  assert.deepEqual(c, { MS: 1, MA: 1, MIR: 0, FIC: 0, NCR: 2, QMP: 0, PRC: 0 }, '2026-09-28: QMP · PRC ч тоологдоно');
}

/* 4. Шийдвэрийн код */
{
  const rv = (verdict) => ({ who: 'x', at: T, verdict, note: null });
  assert.equal(docVerdict(mk({})), null, 'хянагдаж байгаа → null');
  assert.equal(docVerdict(mk({ status: MS_STATUS.approved, reviews: { ...emptyReviews(), tuh: rv(VERDICT.approve), chanar: rv(VERDICT.approve), habea: rv(VERDICT.approve) } })), 'A');
  assert.equal(docVerdict(mk({ status: MS_STATUS.approved, reviews: { ...emptyReviews(), tuh: rv(VERDICT.approve), chanar: rv(VERDICT.note), habea: rv(VERDICT.approve) } })), 'AN', 'нэг AN → AN');
  assert.equal(docVerdict(mk({ status: MS_STATUS.returned, reviews: { ...emptyReviews(), tuh: rv(VERDICT.return) } })), 'R');
  assert.equal(docVerdict(mk({ status: MS_STATUS.returned, rep: { no: 'SLB-REP-MS-P0302-0001-00', at: T, verdict: 'R' } })), 'R', 'REP давамгайлна');
  /* ⚠️ 2026-09-29 (аудит 10): NCR залруулга илгээсний дараа өмнөх хариу мөрөнд үлдэнэ — шийдвэр биш */
  assert.equal(docVerdict(mk({ kind: 'NCR', status: MS_STATUS.review, rep: { no: 'SLB-REP-NCR-P0302-0005-00', at: T, verdict: 'R' } })), null, 'хянагдаж буй төлөвт өмнөх REP тоологдохгүй');
  assert.equal(docVerdict(mk({ kind: 'MA', status: MS_STATUS.approved, reviews: { ...emptyReviews(), tuh: rv(VERDICT.return), chanar: rv(VERDICT.approve), tug: rv(VERDICT.approve) } })), 'A', 'MA-д tuh-ийн бүртгэл тоологдохгүй');
}

/* 5. Хураангуй */
{
  const rv = (verdict) => ({ who: 'x', at: T, verdict, note: null });
  const ma = [
    mk({ oid: 1, kind: 'MA', status: MS_STATUS.approved, rep: { no: 'r1', at: T, verdict: 'A' } }),
    mk({ oid: 2, kind: 'MA', seq: 2, status: MS_STATUS.approved, rep: { no: 'r2', at: T, verdict: 'AN' } }),
    mk({ oid: 3, kind: 'MA', seq: 3, status: MS_STATUS.returned, reviews: { ...emptyReviews(), chanar: rv(VERDICT.return) } }),
    mk({ oid: 4, kind: 'MA', seq: 4, status: MS_STATUS.review }),
    mk({ oid: 5, kind: 'MA', seq: 5, status: MS_STATUS.draft }),
  ];
  /* ⚠️ 2026-09-28: AN-тай батлагдсан (oid 2) НЭЭЛТТЭЙ — open 3 → 4 */
  assert.deepEqual(maSummary(ma), { A: 1, AN: 1, R: 1, pending: 1, open: 4, anOpen: 1 });
  /* Материалаар — ангилал бүрд батлагдсан мөр / шаардлагатай тоо */
  const mm = maMaterialSummary([
    { head: ma[0], category: 'bua', materials: [{ verdict: 'A' }, { verdict: 'R' }, { verdict: null }] },
    { head: ma[1], category: 'uzel', materials: [{ verdict: 'AN' }] },
    { head: ma[2], category: 'bua', materials: [{ verdict: 'A' }] },
    { head: ma[3], category: 'zoo', materials: [{ verdict: null }] },
    { head: ma[0], category: 'zoo', materials: [{ verdict: null }] },
  ]);
  assert.deepEqual(mm.byCategory.bua, { approved: 2, required: 27 }, 'A + (хоосон → баримтын A); R тоологдохгүй; буцаагдсан баримт үгүй');
  assert.deepEqual(mm.byCategory.uzel, { approved: 1, required: 6 });
  assert.equal(mm.other, 1, 'танигдахгүй ангилал → other');
  assert.equal(mm.required, 126); assert.equal(mm.approved, 3);
  const ncr = [
    mk({ kind: 'NCR', status: MS_STATUS.approved }), mk({ kind: 'NCR', status: MS_STATUS.review }), mk({ kind: 'NCR', status: MS_STATUS.returned }),
  ];
  assert.deepEqual(ncrSummary(ncr), { open: 2, closed: 1 });
}

/* 6. Тэмдгийн мөчлөг · огноо */
{
  assert.equal(nextCheck(null), 'OK'); assert.equal(nextCheck('OK'), 'NA'); assert.equal(nextCheck('NA'), 'X'); assert.equal(nextCheck('X'), null);
  assert.equal(checkLabel('NA'), 'N/A'); assert.equal(checkLabel(null), '—'); assert.equal(checkLabel('OK'), 'OK');
  const ms = new Date(2026, 8, 28).getTime();
  assert.equal(toDateInput(ms), '2026-09-28');
  assert.equal(toDateInput(null), '');
  assert.equal(fromDateInput('2026-09-28'), ms, 'орон нутгийн шөнө дунд');
  assert.equal(fromDateInput(''), null); assert.equal(fromDateInput('28/09/2026'), null);
  assert.equal(ymd(null), '—');
  assert.deepEqual(linesToList(' а \n\nб\n'), ['а', 'б']);
  assert.equal(listToLines(['а', 'б']), 'а\nб');
}

/* 7. Гарын үсгийн мөр */
{
  assert.equal(printSigRoles('MS').length, 6);
  assert.equal(printSigRoles('MA').length, 6);
  assert.equal(printSigRoles('MIR').length, 3);
  assert.equal(printSigRoles('FIC').length, 3);
  assert.equal(printSigRoles('NCR').length, 5);
  assert.equal(printSigRoles('MIR')[1], 'Захиалагчийн хяналтын инженер', 'ТУХ дунд — маягтын дараалал');
  /* 2026-09-28: MA — гүйцэтгэгчийн мөр body.signatures-аас, захиалагчийн 3 нэршил, сонголтууд */
  const sig = (name, position) => ({ name, position, org: '', date: null });
  const sg = { prepared: sig('Бат', 'инженер'), reviewed: sig('', ''), reviewed2: sig('Дорж', ''), approved: sig('Болд', 'захирал') };
  const ma = printSigRoles('MA', { ma: { signatures: sg } });
  assert.equal(ma.length, 7, 'reviewed2 бөглөгдсөн → 4 гүйцэтгэгч + 3 захиалагч');
  assert.equal(ma[0], 'Боловсруулсан (гүйцэтгэгч) — Бат, инженер');
  assert.equal(ma[1], 'Хянасан (гүйцэтгэгч)', 'хоосон мөр → зөвхөн үүрэг');
  assert.equal(ma[4], 'Боловсруулсан — ЧХХ хяналтын инженер');
  assert.equal(ma[6], 'Танилцсан — ТУГ төслийн менежер');
  assert.equal(printSigRoles('MA', { consultant: true, equipment: true }).length, 9);
  assert.equal(printSigRoles('QMP').length, 6); assert.equal(printSigRoles('PRC').length, 6);
  assert.equal(repSigRoles().length, 4); assert.match(repSigRoles()[3], /хүлээн авсан/);
}

console.log('chanarUi.check ✓');
