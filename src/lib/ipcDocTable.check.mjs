/**
 * IPC баримтын хүснэгт (`Guitsetgel_talbe/238`) — `ipcDocTable.ts` (сүлжээгүй, 2026-11-23).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/ipcDocTable.check.mjs
 *
 * Хамгаалж буй алдаа:
 *   1. IPC бөглөлт бүрээр үүсэх — нэг IPC = тухайн өдөр хүртэлх ТӨЛӨГДӨӨГҮЙ бөглөлтийн НИЙЛБЭР, гэрээ · багц бүрт.
 *   2. Олгосон дүн давхар тоологдох — баталгаажуулахад 185-д НЭГ төлбөрийн мөр; AUTO мөрийн `dun` хоосон хэвээр; дахин дарахад
 *      төлбөрийн мөр давхардахгүй.
 *   3. Гүйцэтгэгчид төлөх дүн = нийт − суутгалууд; сөрөг бол хадгалахгүй; суутгалтай бол тайлбар заавал.
 *   4. Үе давхцах / өмнөх IPC-ээс өмнө дуусах.
 *   5. Хуучин 185-ын баримт, өмнөх төлбөр жагсаалт ба хуримтлалд орно, нуугдахгүй.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  approveDoc, contextOf, cumulative, defaultAdvance, defaultDeductions, deleteDoc, deleteRaced, deductionsOf, docCodeOf, docWhy, dupPayDeletes, editDoc,
  explainDeductions, fillBalance, isPayRow, newAdvanceDoc, newWorkDoc, nextDay, nextDocNo, paidAmountOf, payableOf, payWithheld, pendingFin, prevEndOf, recOfDoc,
  recordsOf, rollbackRelease, sameNo, signDoc, stillFree, t7Of, unpaidFills, unpaidPkgs,
} from './ipcDocTable.ts';
import { planPaidSync } from './hoSync/compute.ts';
import { groupHo, sumPaid } from './ipc.ts';
import { payRows } from './ipcTable.ts';
import { contractCancelWhy, overContract } from './ipcFlow.ts';

const r2 = (x) => Math.round(x * 100) / 100;
const auto = (o) => ({
  objectid: o.oid, murun_id: `AUTO|БАГЦ2|${o.day}`, geree_kod: 'Багц-2', bagts: o.pkg ?? 'Багц 2', tulult_turul: 'Гүйцэтгэл',
  guilgee_ognoo: o.day, guits_une: o.une, dun: null, ipc_dugaar: o.no ?? null, ipc_tuluv: o.st ?? 'Гүйцэтгэл',
});
const head = {
  objectid: 1, murun_id: 'ХО-0004', geree_kod: 'Багц-2', bagts: 'Багц 2', tulult_turul: 'Урьдчилгаа төлбөр', dun: 1000, ipc_dugaar: null,
  geree_dugaar: 'Н/2', guitsetgegch: 'Х ХХК', ajliin_turul: 'Барилга угсралт', gereet_tosov_niit: 10000, tosol_ner: 'Багц 2 барилга',
};
const pays = [
  head,
  auto({ oid: 3, day: '2026-09-09', une: 100 }),
  auto({ oid: 4, day: '2026-10-04', une: 120 }),
  auto({ oid: 5, day: '2026-10-11', une: 118 }),
  auto({ oid: 6, day: '2026-10-20', une: null }),
  auto({ oid: 7, day: '2026-08-01', une: 50, no: 1, st: 'Олгосон' }),
];

/* ── 1. Төлөгдөөгүй бөглөлт — нийлбэр, өдрөөр хязгаар, багцаар ── */
{
  const f = unpaidFills(pays, '2026-10-11');
  assert.deepEqual(f.rows.map((r) => r.oid), [3, 4, 5], 'олгосон (7), өдрөөс хойших (6) орохгүй');
  assert.equal(f.total, 338);
  assert.equal(f.from, '2026-09-09');
  assert.equal(f.to, '2026-10-11');
  const all = unpaidFills(pays, '');
  assert.equal(all.rows.length, 4, 'дүнгүй бөглөлт тоонд орно');
  assert.equal(all.total, 338, 'дүнгүй нь нийлбэрт 0');
  assert.equal(unpaidFills(pays, '2026-10-11', 'Багц-2').rows.length, 3, '«Багц 2» ба «Багц-2» нэг багц');
  assert.equal(unpaidFills(pays, '2026-10-11', 'Багц 9').rows.length, 0);
  assert.deepEqual(unpaidPkgs(pays).map((p) => [p.pkg, p.last]), [['Багц 2', '2026-10-20']]);
  assert.equal(unpaidFills([...pays, { ...auto({ oid: 8, day: '2026-10-01', une: 5 }), ipc_tuluv: 'Цуцлагдсан' }], '').rows.length, 4, 'цуцлагдсан орохгүй');
}

/* ── 2. Суутгал — нийт − суутгал = төлөх ── */
{
  const row = { niit_dun: 1000, urdchilgaa_tololt: 250, zahialagch_hyanalt: 13.33, zohiogch_hyanalt: 8.84, baritsaa: 50 };
  assert.equal(deductionsOf(row), 322.17);
  assert.equal(payableOf(row), 677.83);
  assert.equal(payableOf({ urdchilgaa_tololt: 5 }), null, 'нийт дүнгүй бол null');
  assert.equal(payableOf({ niit_dun: 100, norm_san: 1, tosvoos_davsan: 9 }), 90, 'норм ба төсвөөс давсан ч хасагдана');
}

/* ── 3. Санал — IPC_RATES (ipcDoc-той ижил томьёо) ── */
{
  const d = defaultDeductions(1131.8, { amount: 100000, perfBefore: 0 }, undefined, 10000);
  assert.equal(d.urdchilgaa_tololt, 282.95, 'эргэн төлөлт 25%');
  assert.equal(d.urdchilgaa_tololt_huvi, 25);
  assert.equal(d.baritsaa, 56.59, 'барьцаа 5%');
  assert.equal(d.baritsaa_huvi, 5);
  assert.equal(d.zohiogch_hyanalt, 10, 'зохиогч 1% × БУА (1131.8 / 1.1318 = 1000)');
  assert.equal(d.zahialagch_hyanalt, Math.round((20 - (0.02 / 1.1518) * 282.95) * 100) / 100, 'захиалагч 2% × БУА − урьдчилгааны хяналтын буцаалт');
  assert.equal(d.tosvoos_davsan, 0);
  assert.equal(d.guitsetgegchid_tuluh, payableOf(d));
  assert.equal(defaultDeductions(1000, { amount: 100000 }, undefined, 100).urdchilgaa_tololt, 100, 'урьдчилгааны үлдэгдлээр хязгаарлана');
  assert.equal(defaultDeductions(1000, { amount: 100000 }, undefined, 0).urdchilgaa_tololt, 0);
  assert.equal(defaultDeductions(1000, { amount: 10000, perfBefore: 9500 }).tosvoos_davsan, 500, 'гэрээнээс давсан хэсэг');
  assert.equal(defaultDeductions(1000, { amount: null, perfBefore: 9500 }).tosvoos_davsan, 0, 'гэрээний дүнгүй бол 0');
  const a = defaultAdvance(1151.8);
  assert.equal(a.niit_dun, 1151.8);
  assert.equal(a.urdchilgaa_sanhuujilt, 1151.8, 'урьдчилгаа: нийт = урьдчилгаа санхүүжилт');
  assert.equal(a.zahialagch_hyanalt, 20, 'зөвхөн захиалагчийн хяналт (2 / 115.18)');
  assert.equal(a.baritsaa, 0);
  assert.equal(a.guitsetgegchid_tuluh, 1131.8);
  assert.match(explainDeductions(d), /Урьдчилгаа эргэн төлөлт 25% — 282\.95 ₮/);
  assert.equal(explainDeductions({ niit_dun: 100 }), '');
}

/* ── 4. Дугаар — 185 ба 238 нэг цуваа ── */
assert.equal(nextDocNo(pays, []), 2);
assert.equal(nextDocNo(pays, [{ ipc_dugaar: 4 }]), 5);
assert.equal(docCodeOf('Багц 4.2', 1), 'SLB-IPC-P0402-001');
assert.equal(nextDay('2026-10-31'), '2026-11-01');

/* ── 5. Үүсгэх — нэг 238 мөр + түгжилт ── */
const f = unpaidFills(pays, '2026-10-11');
const values = { ...defaultDeductions(f.total, { amount: 10000 }), ehleh_ognoo: '2026-09-01', duusah_ognoo: '2026-10-11', ipc_kod: 'K', tailbar: 'т', objectid: 99, dun: 5 };
const made = newWorkDoc({ code: 'Багц-2', contractNo: 'Н/2', contractor: 'Х ХХК', pkg: 'Багц 2', no: 2 }, f.rows, values);
assert.equal(made.doc.turul, 'Гүйцэтгэл');
assert.equal(made.doc.ipc_dugaar, 2);
assert.equal(made.doc.niit_dun, 338, 'нийт дүн = бөглөлтийн нийлбэр');
assert.equal(made.doc.tuluv, 'IPC үүссэн');
assert.equal(made.doc.bagts_kod, 'P0200');
assert.equal(made.doc.guitsetgegchid_tuluh, payableOf(made.doc));
assert.ok(!('objectid' in made.doc) && !('dun' in made.doc), 'зөвхөн засах талбар + систем талбар');
assert.deepEqual(made.lock, [3, 4, 5].map((oid) => ({ objectid: oid, ipc_dugaar: 2, ipc_tuluv: 'IPC үүссэн' })));
assert.ok(Object.values(made.doc).every((v) => v == null || typeof v !== 'object'), 'нэг нүдэнд нэг утга (JSON алга)');

/* Үүссэний дараах төлөв */
const locked = pays.map((r) => (made.lock.some((l) => l.objectid === r.objectid) ? { ...r, ipc_dugaar: 2, ipc_tuluv: 'IPC үүссэн' } : r));
const doc238 = { objectid: 11, ...made.doc };
let recs = recordsOf(locked, [doc238]);
assert.deepEqual(recs.map((x) => [x.src, x.no]), [['pay', null], ['doc', 2]], 'өмнөх урьдчилгаа + шинэ IPC');
assert.equal(unpaidFills(locked, '').rows.length, 1, 'түгжсэний дараа зөвхөн дүнгүй 10-20 үлдэнэ');

/* ── 6. Шалгалт ── */
{
  const ok = { ...made.doc };
  assert.deepEqual(docWhy(ok, []), []);
  assert.ok(docWhy({ ...ok, baritsaa: 1000 }, []).includes('payable'), 'сөрөг төлөх дүн');
  assert.ok(docWhy({ ...ok, baritsaa: -1 }, []).includes('negative'));
  assert.ok(docWhy({ ...ok, tailbar: ' ' }, []).includes('note'), 'суутгалтай бол тайлбар заавал');
  assert.ok(docWhy({ ...ok, ehleh_ognoo: '2026-11-01' }, []).includes('period-order'));
  assert.ok(docWhy({ ...ok, duusah_ognoo: '' }, []).includes('no-end'));
  assert.ok(docWhy({ ...ok, niit_dun: 0 }, []).includes('total'));
  const prev = recOfDoc({ ...doc238, objectid: 12, ipc_dugaar: 1, ehleh_ognoo: '2026-09-15', duusah_ognoo: '2026-10-20' });
  assert.ok(docWhy(ok, [prev]).includes('before-prev'), 'өмнөх IPC-ийн төгсгөлөөс өмнө');
  assert.ok(docWhy(ok, [prev]).includes('overlap'));
  const later = { ...ok, ehleh_ognoo: '2026-10-21', duusah_ognoo: '2026-10-30' };
  assert.deepEqual(docWhy(later, [prev]), [], 'дараагийн үе');
  assert.deepEqual(docWhy(ok, [recOfDoc({ ...doc238, objectid: 13, bagts: 'Багц 3' })]), [], 'өөр багцын үе хамаарахгүй');
  assert.deepEqual(docWhy({ ...defaultAdvance(100), turul: 'Урьдчилгаа', tailbar: 'т' }, [prev]), [], 'урьдчилгаанд үе шаардахгүй');
  assert.equal(prevEndOf([prev], 'Багц-2'), '2026-10-20');
}

/* ── 7. Хуримтлал · Хүснэгт 7 ── */
{
  const c = cumulative(recs, 10000);
  assert.equal(c[0].finCum, 1000, 'урьдчилгаа санхүүжилт');
  assert.equal(c[1].finPrev, 1000);
  const d = recs[1];
  assert.equal(c[1].finCum, r2(1000 + 338 - d.recovery - d.overBudget));
  assert.equal(c[1].finLeft, r2(10000 - c[1].finCum), 'үлдэгдэл = гэрээ − санхүүжилт');
  assert.equal(c[1].payCum, r2(1000 + d.payable));
  assert.equal(contextOf(recs.slice(0, 1)).advanceLeft, 1000);
  assert.equal(contextOf(recs).advanceLeft, r2(1000 - d.recovery));
  const t7 = t7Of(recs, 1, 10000);
  assert.deepEqual(t7.map((r) => r.label), [
    'Нийт дүн', 'Урьдчилгаа санхүүжилт', 'Урьдчилгаа эргэн төлөлт', 'Төсвөөс давсан гүйцэтгэл', 'Санхүүжилтийн эрх нээсэн нийт дүн',
    'Норм нормативын сан', 'Захиалагчийн хяналтын зардал', 'Зохиогчийн хяналтын зардал', 'Барьцаа', 'Гүйцэтгэгчид төлөх дүн',
  ]);
  assert.equal(t7[0].perf, 338, 'нийт гүйцэтгэл');
  assert.equal(t7[0].now, r2(338 - d.recovery));
  assert.equal(t7[1].prev, 1000);
  assert.equal(t7[2].remain, r2(1000 - d.recovery), 'урьдчилгааны үлдэгдэл');
  assert.equal(t7[8].now, d.retention);
  assert.equal(t7[8].contract, 500, 'гэрээний барьцаа 5%');
  assert.equal(t7[9].now, d.payable);
  assert.equal(t7Of(recs, 1, null)[0].remain, null, 'гэрээний дүнгүй бол үлдэгдэл алга');
}

/* ── 8. Батлах — 185-д НЭГ төлбөрийн мөр, давхар тоологдохгүй ── */
{
  const rec = recOfDoc(doc238);
  assert.equal(approveDoc(rec, locked, '2026-11-23'), 'status', 'скангүй баталгаажихгүй');
  const signed = recOfDoc({ ...doc238, ...signDoc(rec, 'abc', '2026-11-22') });
  assert.equal(signed.status, 'Гарын үсэг зурсан');
  assert.equal(signed.row.garyn_useg_ognoo, '2026-11-22');
  const e = approveDoc(signed, locked, '2026-11-23');
  assert.equal(typeof e, 'object');
  assert.equal(e.pay.murun_id, 'PAY|Багц-2|2');
  assert.equal(e.pay.dun, 338, 'dun = санхүүжилтийн эрх нээсэн дүн (эргэн төлөлт · төсвөөс давсан 0 тул нийт дүн)');
  assert.equal(e.pay.tulult_turul, 'Гүйцэтгэл');
  assert.equal(e.pay.ipc_tuluv, 'Олгосон');
  assert.equal(e.pay.ipc_dugaar, 2);
  assert.equal(e.pay.guilgee_ognoo, '2026-11-23');
  assert.equal(e.pay.on_, 2026);
  assert.equal(e.pay.geree_dugaar, 'Н/2', 'гэрээний талбар гэрээний мөрөөс');
  assert.equal(e.pay.gereet_tosov_niit, 10000);
  assert.equal(e.pay.ajliin_turul, 'Барилга угсралт');
  assert.equal(e.pay.bagts, 'Багц 2');
  assert.ok(!('objectid' in e.pay));
  assert.deepEqual(e.auto, [3, 4, 5].map((oid) => ({ objectid: oid, ipc_tuluv: 'Олгосон' })));
  assert.deepEqual(e.doc, { objectid: 11, tuluv: 'Олгосон', guilgee_ognoo: '2026-11-23' });
  /* Бичсэний дараах 185 */
  const after = [...locked.map((r) => (e.auto.some((a) => a.objectid === r.objectid) ? { ...r, ipc_tuluv: 'Олгосон' } : r)), { objectid: 50, ...e.pay }];
  assert.equal(sumPaid(after), 1000 + 338, 'олгосон = урьдчилгаа + НЭГ төлбөр (AUTO мөрийн dun хоосон)');
  assert.ok(after.filter((r) => String(r.murun_id).startsWith('AUTO|')).every((r) => r.dun == null), 'AUTO мөрийн dun хоосон хэвээр');
  const [g] = groupHo(after);
  assert.equal(g.paidTotal, 1338);
  assert.equal(g.workTotal, 338);
  const cards = payRows(after);
  const card = cards.find((x) => x.id === 'PAY|Багц-2|2');
  assert.equal(card.code, 'IPC-02');
  assert.equal(card.une, 338, 'олгосон бөглөлтүүд төлбөрийн картад нийлнэ');
  assert.deepEqual(card.days, ['2026-09-09', '2026-10-04', '2026-10-11']);
  assert.ok(!cards.some((x) => x.id.startsWith('AUTO|') && x.amount == null && x.une === 100), 'олгосон бөглөлт тусдаа карт болохгүй');
  /* `planPaidSync` — 182-ын олгосон дүн */
  const cf = [{ objectid: 201, bagts: 'Багц-2', uy_shat: 'Барилга угсралт', ho_dungiin_tailbar: 'Гэрээлсэн дүн', geree_dun: 10000, geree_dugaar: 'Н/2', olgoson_dun: null, urdchilgaa_dun: null }];
  const ps = planPaidSync(after, cf);
  const u = ps.updates.find((x) => x.objectid === 201);
  assert.equal(u.olgoson_dun, 1338, 'ТТБ-ийн олгосон дүн нэг удаа');
  assert.equal(u.urdchilgaa_dun, 1000);
  /* Дахин дарах (238 унасан) — төлбөр давхардахгүй */
  const again = approveDoc(signed, after, '2026-11-24');
  assert.equal(again.pay, null, 'төлбөрийн мөр байгаа бол дахин нэмэхгүй');
  assert.deepEqual(again.auto, []);
  assert.equal(again.doc.tuluv, 'Олгосон');
  /* Жагсаалт: PAY мөр 238-ийн баримтаар л харагдана */
  const recs2 = recordsOf(after, [{ ...doc238, tuluv: 'Олгосон' }]);
  assert.deepEqual(recs2.map((x) => x.src), ['pay', 'doc'], 'PAY мөр давхар гарахгүй');
  assert.deepEqual(recordsOf(after, []).map((x) => x.src), ['pay', 'pay'], '238 олдохгүй бол төлбөр нуугдахгүй');
  assert.ok(isPayRow({ murun_id: 'PAY|Багц-2|2' }));
  /* Устгах боломжгүй */
  assert.equal(deleteDoc(recs2[1], after), 'paid');
  assert.equal(deleteDoc({ ...signed, status: 'IPC үүссэн' }, after), 'paid', 'төлбөрийн мөртэй бол устахгүй');
  /* Тэнцэл — олгох ёстой = бөглөлт − олгосон */
  const b = fillBalance(after, recs2);
  assert.equal(b.fills, 50 + 338, 'бөглөлт (дүнгүй нь 0)');
  assert.equal(b.paid, 388, '2026-11-23: олгосон IPC-д орсон бүх бөглөлт (хуучин IPC-01 ч мөн)');
  assert.equal(b.inIpc, 388, 'IPC-д орсон бөглөлт');
  assert.equal(b.due, 0, 'бүх бөглөлт IPC-д орсон — IPC-д ороогүй хуримтлал 0');
  assert.equal(fillBalance([...after, { objectid: 99, murun_id: 'AUTO|БАГЦ2|2026-11-30', geree_kod: 'Багц-2', bagts: 'Багц 2', guilgee_ognoo: '2026-11-30', guits_une: 70, ipc_tuluv: 'Гүйцэтгэл' }], recs2).due, 70, 'шинэ бөглөлт IPC-д ороогүй хуримтлалд нэмэгдэнэ');
  /* Бөглөлтгүй гүйцэтгэлийн IPC баталгаажихгүй */
  assert.equal(approveDoc(signed, pays, '2026-11-23'), 'no-fills');
  /* Урьдчилгаа — бөглөлтгүй */
  const advRow = { objectid: 30, ...newAdvanceDoc({ code: 'Багц-2', contractNo: 'Н/2', contractor: 'Х', pkg: 'Багц 2', no: 3 }, 500, '2026-11-23'), tuluv: 'Гарын үсэг зурсан', barimt_id: 'x' };
  const ea = approveDoc(recOfDoc(advRow), pays, '2026-11-23');
  assert.equal(ea.pay.tulult_turul, 'Урьдчилгаа төлбөр');
  assert.equal(ea.pay.dun, 500);
  assert.equal(advRow.ipc_kod, 'SLB-IPC-P0200-003');
}

/* ── 9. Устгах — бөглөлт чөлөөлөгдөнө, буцаах засвартай ── */
{
  const rec = recOfDoc(doc238);
  const e = deleteDoc(rec, locked);
  assert.deepEqual(e.unlock, [3, 4, 5].map((oid) => ({ objectid: oid, ipc_dugaar: null, ipc_tuluv: 'Гүйцэтгэл' })));
  assert.deepEqual(e.restore, [3, 4, 5].map((oid) => ({ objectid: oid, ipc_dugaar: 2, ipc_tuluv: 'IPC үүссэн' })));
  const other = locked.map((r) => (r.objectid === 5 ? { ...r, bagts: 'Багц 3' } : r));
  assert.equal(deleteDoc(rec, other).unlock.length, 2, 'өөр багцын ижил дугаартай бөглөлт хөндөгдөхгүй');
}

/* ── 10. Засах — зөвхөн «IPC үүссэн», бөглөлтийн төгсгөл өөрчлөгдөхгүй ── */
{
  const rec = recOfDoc(doc238);
  const e = editDoc(rec, { baritsaa: 10, duusah_ognoo: '2030-01-01', ipc_dugaar: 9 });
  assert.equal(e.objectid, 11);
  assert.equal(e.baritsaa, 10);
  assert.ok(!('duusah_ognoo' in e) && !('ipc_dugaar' in e), 'төгсгөл, дугаар өөрчлөгдөхгүй');
  assert.equal(e.guitsetgegchid_tuluh, payableOf({ ...doc238, baritsaa: 10 }));
  assert.equal(e.baritsaa_huvi, Math.round((10 / 338) * 10000) / 100);
  assert.equal(editDoc({ ...rec, status: 'Гарын үсэг зурсан' }, {}), 'status');
}

/* ── 11. Хуучин баримт (185 `IPC|…`) хэвээр уншигдана ── */
{
  const old = { objectid: 40, murun_id: 'IPC|Багц-2|1', geree_kod: 'Багц-2', bagts: 'Багц 2', tulult_turul: 'Гүйцэтгэл', ipc_dugaar: 1, guits_une: 50, dun: 50, ipc_tuluv: 'Олгосон', guilgee_ognoo: '2026-08-05' };
  const r = recordsOf([...pays, old], [doc238]);
  assert.deepEqual(r.map((x) => [x.src, x.no]), [['pay', null], ['legacy', 1], ['doc', 2]]);
  assert.equal(r[1].payable, 50);
  assert.equal(r[1].recovery, null, 'хуучин баримтад суутгал алга');
  assert.equal(nextDocNo([...pays, old], [doc238]), 3);
  assert.equal(sameNo(r, 1, 11).length, 1, 'ижил дугаар илэрнэ');
  assert.equal(sameNo(r, 2, 11).length, 0, 'өөрийгөө тоолохгүй');
}

/* ── 12. Гэрээ цуцлах — 238-д баримт байвал хориглоно ── */
assert.equal(contractCancelWhy([head].map((x) => ({ ...x, dun: null })), [{ objectid: 1 }]), 'has-ipc');
assert.equal(contractCancelWhy([head].map((x) => ({ ...x, dun: null })), []), null);

/* ── 13. Дэлгэц — бөглөлт тус бүрээр чекбокс алга, нийлбэрээр; бичих дараалал ── */
{
  const ui = readFileSync('src/modules/IpcFlow.tsx', 'utf8');
  const tbl = readFileSync('src/modules/IpcTable.tsx', 'utf8');
  assert.ok(!tbl.includes('CardPick') && !tbl.includes('type="checkbox"'), 'карт дээр бөглөлт чеклэхгүй');
  assert.ok(tbl.includes('cardRows(b)'), 'олгоогүй бөглөлтийн карт нуугдана');
  assert.ok(ui.includes('<FillList rows={unpaid.rows} />'), 'төлөгдөөгүй бөглөлтийн жагсаалт зөвхөн дэлгэхэд');
  const cr = ui.slice(ui.indexOf('const create = '), ui.indexOf('const save = '));
  assert.ok(cr.indexOf('applyAll(IPC_DOC.url, IPC_DOC.oid, { adds: [doc] }') < cr.indexOf('applyAll(HO_IPC.url, HO_IPC.oid, { updates: lock }'), '238 эхэлж, дараа нь түгжилт');
  assert.ok(cr.includes('{ deletes: [mine] }'), 'түгжилт унавал 238-ийн мөр устана');
  assert.ok(cr.indexOf('Promise.all([freshPays(code, pays), freshDocs(code)])') < cr.indexOf('newWorkDoc('), 'бичихийн өмнө шинээр уншина');
  const ap = ui.slice(ui.indexOf('const approveNew = '), ui.indexOf('const removeNew = '));
  assert.ok(ap.indexOf('applyAll(HO_IPC.url') < ap.indexOf('applyAll(IPC_DOC.url'), 'батлахад 185 (төлбөр) эхэлнэ');
  assert.ok(ap.includes('APPROVE_CAP') && !ap.includes('CREATE_CAP'), 'батлах эрх');
  assert.ok(cr.includes('CREATE_CAP') && !cr.includes('APPROVE_CAP'), 'үүсгэх эрх');
}

/* ── 14. PDF — «Хүснэгт 7» 238-ийн мөрөөс + бөглөлтийн задаргаа ── */
{
  const { ipcDocPdfDoc } = await import('./ipcFlowPdf.ts');
  const def = ipcDocPdfDoc({ code: 'Багц-2', contractNo: 'Н/2', contractor: 'Х ХХК', project: 'Багц 2 барилга', contract: 10000, recs, i: 1, fills: f.rows });
  const flat = JSON.stringify(def.content);
  for (const t of ['Хүснэгт 7', 'Гэрээний дүн', 'Нийт гүйцэтгэл', 'Нийт санхүүжилт', 'Өмнөх санхүүжилт', 'Одоо санхүүжих', 'Үлдэгдэл санхүүжилт',
    'Гүйцэтгэгчид төлөх дүн', 'Санхүүжилтийн эрх нээсэн нийт дүн', 'БӨГЛӨЛТИЙН НИЙТ', 'Суутгалын тайлбар: т']) assert.ok(flat.includes(t), `PDF: ${t}`);
  assert.equal(def.pageOrientation, 'landscape');
  assert.equal(def.info.title, 'IPC_Багц-2_IPC-02_2026-10-11');
}

/* ── 15. 2026-11-24: олгох ёстой = бөглөлт − IPC-ийн НИЙТ ДҮН (бөглөлтийн нийлбэр биш) ── */
{
  const fills = [auto({ oid: 61, day: '2026-10-01', une: 60, no: 5, st: 'Олгосон' }), auto({ oid: 62, day: '2026-10-02', une: 40, no: 5, st: 'Олгосон' })];
  const pay = { objectid: 63, murun_id: 'PAY|Багц-2|5', geree_kod: 'Багц-2', bagts: 'Багц 2', tulult_turul: 'Гүйцэтгэл', ipc_dugaar: 5, dun: 80, ipc_tuluv: 'Олгосон', guilgee_ognoo: '2026-11-01' };
  const doc = (total, st = 'Олгосон') => ({ objectid: 70, turul: 'Гүйцэтгэл', ipc_dugaar: 5, geree_kod: 'Багц-2', bagts: 'Багц 2', niit_dun: total, duusah_ognoo: '2026-10-02', tuluv: st });
  const p = [...fills, { ...pay }];
  const b = fillBalance(p, recordsOf(p, [doc(80)]));
  assert.deepEqual(b, { fills: 100, inIpc: 80, paid: 80, due: 20 }, 'бөглөлт 60+40, IPC 80 батлагдсан → олгох ёстой 20');
  const over = [...fills, { ...pay, dun: 120 }];
  assert.equal(fillBalance(over, recordsOf(over, [doc(120)])).due, -20, 'IPC бөглөлтөөс их бол илүү нь дараагийнхыг бууруулна');
  const later = [...over, auto({ oid: 64, day: '2026-11-05', une: 50 })];
  assert.equal(fillBalance(later, recordsOf(later, [doc(120)])).due, 30, '−20 + шинэ бөглөлт 50 = 30');
  const pend = fills.map((r) => ({ ...r, ipc_tuluv: 'IPC үүссэн' }));
  const bp = fillBalance(pend, recordsOf(pend, [doc(80, 'IPC үүссэн')]));
  assert.equal(bp.due, 20, 'батлагдаагүй IPC ч IPC-д орсон');
  assert.equal(bp.paid, 0, 'олгосон = бодит төлбөр, бөглөлтийн нийлбэр биш');
  /* Хуучин баримт — нийт дүн (`guits_une`) хасагдана, бөглөлт давхар хасагдахгүй; олгосон = `dun` */
  const old = { objectid: 65, murun_id: 'IPC|Багц-2|5', geree_kod: 'Багц-2', bagts: 'Багц 2', tulult_turul: 'Гүйцэтгэл', ipc_dugaar: 5, guits_une: 90, dun: 90, ipc_tuluv: 'Олгосон' };
  const lp = [...fills, old];
  assert.deepEqual(fillBalance(lp, recordsOf(lp, [])), { fills: 100, inIpc: 90, paid: 90, due: 10 });
  /* Баримтгүй түгжигдсэн бөглөлт — өмнөх дүрмээр өөрийн дүнгээр (§8-ийн IPC-01) */
  assert.deepEqual(fillBalance(fills, recordsOf(fills, [])), { fills: 100, inIpc: 100, paid: 100, due: 0 });
  assert.equal(fillBalance(p, recordsOf(p, [doc(80, 'Цуцлагдсан')])).inIpc, 100, 'цуцлагдсан баримт тоологдохгүй');
}

/* ── 16. 2026-11-24: зэрэг баталгаажуулалт — давхар PAY мөрөөс хожуу (их objectid) нь устна ── */
{
  const pay = (oid, o = {}) => ({ objectid: oid, murun_id: 'PAY|Багц-2|2', geree_kod: 'Багц-2', bagts: 'Багц 2', ipc_dugaar: 2, dun: 338, ...o });
  assert.deepEqual(dupPayDeletes([pay(53), pay(50), ...pays], 'Багц-2', 2), [53], 'нэг үлдэнэ (бага objectid)');
  assert.deepEqual(dupPayDeletes([pay(50)], 'Багц-2', 2), [], 'ганц мөр хөндөгдөхгүй');
  assert.deepEqual(dupPayDeletes([pay(50), pay(51, { bagts: 'Багц-2' }), pay(52, { ipc_dugaar: 3 }), pay(54, { geree_kod: 'Х' })], 'Багц-2', 2), [51], '«Багц 2» ба «Багц-2» нэг багц; өөр дугаар/гэрээ хөндөгдөхгүй');
  assert.deepEqual(dupPayDeletes([pay(50), pay(51, { bagts: 'Багц 3' })], 'Багц-2', 2), [], 'өөр багцын төлбөр давхар биш');
  assert.deepEqual(dupPayDeletes([pay(50), { ...pay(51), murun_id: 'IPC|Багц-2|2' }], 'Багц-2', 2), [], 'зөвхөн PAY мөр');
  const ui = readFileSync('src/modules/IpcFlow.tsx', 'utf8');
  const ap = ui.slice(ui.indexOf('const approveNew = '), ui.indexOf('const removeNew = '));
  assert.ok(ap.indexOf('{ adds: e.pay ? [e.pay] : []') < ap.indexOf('dupPayDeletes(await freshPays(code, pays)'), 'нэмсний ДАРАА дахин уншина');
  assert.ok(ap.includes('{ deletes: del }, APPROVE_CAP'), 'давхар мөрийг устгана');
}

/* ── 17. 2026-11-24: зэрэг үүсгэлтийн буцаалт — үлдэх баримтын үед ороогүй миний бөглөлт чөлөөлөгдөнө ── */
{
  const mine = f.rows;
  const keeper = recOfDoc({ ...doc238, objectid: 10, duusah_ognoo: '2026-10-04' });
  assert.deepEqual(rollbackRelease(locked, mine, [keeper], 2), [{ objectid: 5, ipc_dugaar: null, ipc_tuluv: 'Гүйцэтгэл' }], '10-11 нь үлдэх баримтын үед (≤ 10-04) ороогүй');
  assert.deepEqual(rollbackRelease(locked, mine, [recOfDoc({ ...doc238, objectid: 10 })], 2), [], 'ижил үе — юу ч чөлөөлөхгүй');
  assert.deepEqual(rollbackRelease(locked, mine, [{ ...keeper, to: '' }], 2), [], 'үлдэх баримт төгсгөлгүй — хөндөхгүй');
  assert.deepEqual(rollbackRelease(locked, mine, [], 2).map((r) => r.objectid), [3, 4, 5], 'өөр багцынх — миний бүх бөглөлт');
  const paid5 = locked.map((r) => (r.objectid === 5 ? { ...r, ipc_tuluv: 'Олгосон' } : r));
  assert.deepEqual(rollbackRelease(paid5, mine, [keeper], 2), [], 'олгосон бөглөлт чөлөөлөгдөхгүй');
  assert.deepEqual(rollbackRelease(locked, mine.filter((r) => r.oid !== 5), [keeper], 2), [], 'миний түгжээгүй бөглөлт хөндөгдөхгүй');
  /* Түгжихийн өмнөх шалгалт */
  assert.equal(stillFree(pays, f.rows), true);
  assert.equal(stillFree(locked, f.rows), false, 'өөр хэрэглэгч түгжсэн бол түгжихгүй');
  const ui = readFileSync('src/modules/IpcFlow.tsx', 'utf8');
  const cr = ui.slice(ui.indexOf('const create = '), ui.indexOf('const save = '));
  assert.ok(cr.indexOf('stillFree(await freshPays(code, pays), f2.rows)') < cr.indexOf('{ updates: lock }'), 'түгжихийн өмнө дахин шалгана');
  assert.ok(cr.includes('rollbackRelease(after[0], f2.rows, keepers, no)') && !cr.includes('keep ? []'), 'буцаалтад үлдэх баримтын үеэр чөлөөлнө');
}

/* ── 18. 2026-11-24: дугааргүй өмнөх төлбөр огноогоор — хуримтлал · Хүснэгт 7-гийн «өмнөх»-д орно ── */
{
  const p = [{ objectid: 1, murun_id: 'ХО-9', geree_kod: 'Г', tulult_turul: 'Гүйцэтгэл', dun: 1000, guilgee_ognoo: '2025-06-01', ipc_dugaar: null }];
  const d = [{ objectid: 5, turul: 'Гүйцэтгэл', ipc_dugaar: 1, geree_kod: 'Г', niit_dun: 80, ehleh_ognoo: '2026-09-01', duusah_ognoo: '2026-10-01', tuluv: 'IPC үүссэн' }];
  const r = recordsOf(p, d);
  assert.deepEqual(r.map((x) => [x.src, x.no]), [['pay', null], ['doc', 1]], '2025 оны төлбөр IPC-1-ийн өмнө');
  const c = cumulative(r, 5000);
  assert.equal(c[1].finPrev, 1000, 'IPC-1-ийн өмнөх = 1000');
  assert.equal(c[1].finLeft, 3920, 'үлдэгдэл = 5000 − 1000 − 80');
  const t7 = t7Of(r, 1, 5000);
  assert.equal(t7[0].prev, 1000);
  assert.equal(t7[0].remain, 3920);
  const late = [...p, { ...p[0], objectid: 2, guilgee_ognoo: '2026-12-01', dun: 7 }, { ...p[0], objectid: 3, guilgee_ognoo: null, dun: 5 }];
  assert.deepEqual(recordsOf(late, d).map((x) => x.oid), [3, 1, 5, 2], 'огноогүй эхэнд, хожуу төлбөр IPC-ийн дараа');
  const two = [...d, { ...d[0], objectid: 6, ipc_dugaar: 2, duusah_ognoo: '2027-01-01', guilgee_ognoo: '2027-01-05' }];
  assert.deepEqual(recordsOf(late, two).map((x) => x.oid), [3, 1, 5, 2, 6], 'IPC-1 ба IPC-2-ийн хооронд');
}

/* ── 19. 2026-11-27: 185-ын dun = санхүүжилтийн эрх нээсэн дүн — эргэн төлөлт · төсвөөс давсан хоёр тоологдохгүй ── */
{
  const adv = { objectid: 1, murun_id: 'PAY|Г|1', geree_kod: 'Г', bagts: 'Багц 2', tulult_turul: 'Урьдчилгаа төлбөр', ipc_dugaar: 1, dun: 1000, ipc_tuluv: 'Олгосон' };
  const fill = { objectid: 2, murun_id: 'AUTO|БАГЦ2|2026-10-01', geree_kod: 'Г', bagts: 'Багц 2', guilgee_ognoo: '2026-10-01', guits_une: 10000, ipc_dugaar: 2, ipc_tuluv: 'IPC үүссэн' };
  const advDoc = { objectid: 20, turul: 'Урьдчилгаа', ipc_dugaar: 1, geree_kod: 'Г', bagts: 'Багц 2', niit_dun: 1000, urdchilgaa_sanhuujilt: 1000, tuluv: 'Олгосон' };
  const work = { objectid: 21, turul: 'Гүйцэтгэл', ipc_dugaar: 2, geree_kod: 'Г', bagts: 'Багц 2', niit_dun: 10000, urdchilgaa_tololt: 1000, duusah_ognoo: '2026-10-01', tuluv: 'Гарын үсэг зурсан', barimt_id: 'x' };
  const e = approveDoc(recOfDoc(work), [adv, fill], '2026-11-27');
  assert.equal(e.pay.dun, 9000, 'dun = 10,000 − эргэн төлөлт 1,000');
  const after = [adv, { ...fill, ipc_tuluv: 'Олгосон' }, { objectid: 3, ...e.pay }];
  const recs3 = recordsOf(after, [advDoc, { ...work, tuluv: 'Олгосон' }]);
  const c = cumulative(recs3, 20000);
  assert.equal(sumPaid(after), c[c.length - 1].finCum, 'Σdun (10,000) = санхүүжилтийн эрх нээсэн хуримтлал');
  assert.equal(sumPaid(after), 10000);
  assert.equal(fillBalance(after, recs3).paid, 9000, 'олгосон = 185-ын төлбөрийн мөрийн dun');
  const over = approveDoc(recOfDoc({ ...work, urdchilgaa_tololt: null, tosvoos_davsan: 200.006 }), [fill], '2026-11-27');
  assert.equal(over.pay.dun, 9799.99, 'төсвөөс давсан хасагдана, 2 оронтой');
  assert.equal(approveDoc(recOfDoc({ ...advDoc, tuluv: 'Гарын үсэг зурсан', barimt_id: 'x' }), [], '2026-11-27').pay.dun, 1000, 'урьдчилгаа — өөрийн нийт дүн');
  const ui = readFileSync('src/modules/IpcFlow.tsx', 'utf8');
  const ap = ui.slice(ui.indexOf('const approveNew = '), ui.indexOf('const removeNew = '));
  assert.ok(ap.includes('money(paidAmountOf(rec))') && ap.includes('Санхүүжилтийн эрх нээсэн дүн {1} олгосон дүнд нэмэгдэнэ'), 'асуулт 185-д бичигдэх дүнг хэлнэ');
}

/* ── 20. 2026-11-27: нэг гэрээний ижил дугаартай өөр багцын IPC (IPC-5 Багц-10 ↔ Багц-11) тусдаа ── */
{
  const paid10 = { objectid: 1, murun_id: 'PAY|Г|5', geree_kod: 'Г', bagts: 'Багц-10', tulult_turul: 'Гүйцэтгэл', ipc_dugaar: 5, dun: 100, ipc_tuluv: 'Олгосон' };
  const fill11 = { objectid: 2, murun_id: 'AUTO|БАГЦ11|2026-10-01', geree_kod: 'Г', bagts: 'Багц-11', guilgee_ognoo: '2026-10-01', guits_une: 50, ipc_dugaar: 5, ipc_tuluv: 'IPC үүссэн' };
  const d11 = { objectid: 30, turul: 'Гүйцэтгэл', ipc_dugaar: 5, geree_kod: 'Г', bagts: 'Багц-11', niit_dun: 50, duusah_ognoo: '2026-10-01', tuluv: 'Гарын үсэг зурсан', barimt_id: 'x' };
  const e = approveDoc(recOfDoc(d11), [paid10, fill11], '2026-11-27');
  assert.ok(e.pay, 'Багц-10-ийн төлбөр Багц-11-ийн төлбөрийн мөрийг хаахгүй');
  assert.equal(e.pay.bagts, 'Багц-11');
  assert.deepEqual(e.auto, [{ objectid: 2, ipc_tuluv: 'Олгосон' }]);
  const del = deleteDoc(recOfDoc({ ...d11, tuluv: 'IPC үүссэн' }), [paid10, fill11]);
  assert.notEqual(del, 'paid', 'Багц-10 олгосон ч Багц-11-ийн баримт устна');
  assert.deepEqual(del.unlock, [{ objectid: 2, ipc_dugaar: null, ipc_tuluv: 'Гүйцэтгэл' }]);
  assert.equal(deleteDoc(recOfDoc({ ...d11, bagts: 'Багц 10', tuluv: 'IPC үүссэн' }), [paid10]), 'paid', 'ижил багцынх хэвээр хаагдана');
  assert.equal(approveDoc(recOfDoc({ ...d11, bagts: 'Багц 10' }), [paid10], '2026-11-27').pay, null, 'ижил багцад дахин нэмэхгүй');
}

/* ── 21. 2026-11-27: мөнгө 2 оронтой бутархайгаар хадгалагдана ── */
{
  const m = newWorkDoc({ code: 'Г', contractNo: '', contractor: '', pkg: 'Багц 2', no: 1 }, [], { niit_dun: 100.123456, baritsaa: 5.005001, tailbar: 'т' });
  assert.equal(m.doc.niit_dun, 100.12);
  assert.equal(m.doc.baritsaa, 5.01);
  const ed = editDoc(recOfDoc({ objectid: 9, turul: 'Гүйцэтгэл', ipc_dugaar: 1, geree_kod: 'Г', niit_dun: 1, tuluv: 'IPC үүссэн' }), { niit_dun: 7.777, tailbar: 'x' });
  assert.equal(ed.niit_dun, 7.78);
  assert.equal(ed.tailbar, 'x', 'бичвэр хөндөгдөхгүй');
  const ui = readFileSync('src/modules/IpcFlow.tsx', 'utf8');
  assert.ok(ui.includes('money2(parseMoney(x))'), 'нүдний оролт ч 2 оронд');
}

/* ── 22. 2026-11-27: эргэн төлөлтийн саналд зөвхөн ОЛГОСОН урьдчилгаа ── */
{
  const advDoc = (st) => ({ objectid: 40, turul: 'Урьдчилгаа', ipc_dugaar: 1, geree_kod: 'Г', bagts: 'Багц 2', niit_dun: 1000, urdchilgaa_sanhuujilt: 1000, tuluv: st });
  assert.equal(contextOf(recordsOf([], [advDoc('IPC үүссэн')])).advanceLeft, 0, 'батлаагүй урьдчилгаа тоологдохгүй');
  assert.equal(contextOf(recordsOf([], [advDoc('Гарын үсэг зурсан')])).advanceLeft, 0);
  assert.equal(contextOf(recordsOf([], [advDoc('Олгосон')])).advanceLeft, 1000);
  const w = { objectid: 41, turul: 'Гүйцэтгэл', ipc_dugaar: 2, geree_kod: 'Г', bagts: 'Багц 2', niit_dun: 1000, urdchilgaa_tololt: 250, duusah_ognoo: '2026-10-01', tuluv: 'IPC үүссэн' };
  assert.equal(contextOf(recordsOf([], [advDoc('Олгосон'), w])).advanceLeft, 750, 'батлаагүй IPC-ийн эргэн төлөлт хасагдана (давхар санал болгохгүй)');
  assert.equal(contextOf(recordsOf([], [advDoc('Олгосон'), { ...w, tuluv: 'Цуцлагдсан' }])).advanceLeft, 1000, 'цуцлагдсан IPC-ийн эргэн төлөлт хасагдахгүй');
}

/* ── 23. 2026-11-27: картын «Зөрүү» — PAY мөрийн цэвэр dun-д баримтын эргэн төлөлт · төсвөөс давсныг буцааж нэмнэ ── */
{
  const adv = { objectid: 1, murun_id: 'PAY|Г|1', geree_kod: 'Г', bagts: 'Багц 2', tulult_turul: 'Урьдчилгаа төлбөр', ipc_dugaar: 1, dun: 1000, ipc_tuluv: 'Олгосон' };
  const fill = { objectid: 2, murun_id: 'AUTO|БАГЦ2|2026-10-01', geree_kod: 'Г', bagts: 'Багц 2', tulult_turul: 'Гүйцэтгэл', guilgee_ognoo: '2026-10-01', guits_une: 10000, ipc_dugaar: 2, ipc_tuluv: 'IPC үүссэн' };
  const advDoc = { objectid: 20, turul: 'Урьдчилгаа', ipc_dugaar: 1, geree_kod: 'Г', bagts: 'Багц 2', niit_dun: 1000, urdchilgaa_sanhuujilt: 1000, tuluv: 'Олгосон' };
  const work = { objectid: 21, turul: 'Гүйцэтгэл', ipc_dugaar: 2, geree_kod: 'Г', bagts: 'Багц 2', niit_dun: 10000, urdchilgaa_tololt: 1000, duusah_ognoo: '2026-10-01', tuluv: 'Гарын үсэг зурсан', barimt_id: 'x' };
  const e = approveDoc(recOfDoc(work), [adv, fill], '2026-11-27');
  const paidFill = { ...fill, ipc_tuluv: 'Олгосон' };
  const docs = [advDoc, { ...work, tuluv: 'Олгосон' }];
  const cardOf = (pays, ds) => payRows(pays, ds).find((x) => x.id === 'PAY|Г|2');
  const card = cardOf([adv, paidFill, { objectid: 3, ...e.pay }], docs);
  assert.deepEqual([card.amount, card.une, card.zoruu], [9000, 10000, 0], 'олгосон 9,000 + эргэн төлөлт 1,000 = бөглөлт 10,000 → зөрүү 0 (−1,000 биш)');
  assert.equal(payWithheld({ objectid: 3, ...e.pay }, docs), 1000);
  assert.equal(cardOf([adv, paidFill, { objectid: 3, ...e.pay }], []).zoruu, -1000, 'баримтгүй бол өмнөх томьёо');
  assert.equal(cardOf([adv, paidFill, { objectid: 3, ...e.pay, dun: 10000 }], docs).zoruu, 0, 'хуучин дүрмээр (dun = нийт дүн) бичигдсэн мөрд суутгал нэмэгдэхгүй');
  assert.equal(cardOf([adv, { ...paidFill, guits_une: 10500 }, { objectid: 3, ...e.pay }], docs).zoruu, -500, 'жинхэнэ дутуу олголт хэвээр харагдана');
  const ov = { ...work, urdchilgaa_tololt: null, tosvoos_davsan: 200 };
  const e2 = approveDoc(recOfDoc(ov), [fill], '2026-11-27');
  assert.equal(cardOf([paidFill, { objectid: 3, ...e2.pay }], [{ ...ov, tuluv: 'Олгосон' }]).zoruu, 0, 'төсвөөс давсан ч буцааж нэмэгдэнэ');
  assert.equal(payWithheld({ objectid: 3, ...e.pay, bagts: 'Багц 7' }, docs), 0, 'өөр багцын баримт тооцогдохгүй');
  const ui = readFileSync('src/modules/IpcTable.tsx', 'utf8');
  assert.ok(ui.includes('contractBlocks(contracts, (code) => docsBy.get(code))'), 'картанд 238-ийн мөрүүд дамжина');
}

/* ── 24. 2026-11-27: урьдчилгааны IPC-ийн нийт дүнг засахад «Урьдчилгаа санхүүжилт» дагаж өөрчлөгдөнө ── */
{
  const a = recOfDoc({ objectid: 50, turul: 'Урьдчилгаа', ipc_dugaar: 1, geree_kod: 'Г', bagts: 'Багц 2', niit_dun: 1000, urdchilgaa_sanhuujilt: 1000, tuluv: 'IPC үүссэн' });
  const ed = editDoc(a, { niit_dun: 800, urdchilgaa_sanhuujilt: 1000 });
  assert.equal(ed.niit_dun, 800);
  assert.equal(ed.urdchilgaa_sanhuujilt, 800, 'хуучин 1,000 буцаж бичигдэхгүй');
  const paidAdv = { ...a.row, ...ed, tuluv: 'Олгосон' };
  assert.equal(contextOf(recordsOf([], [paidAdv])).advanceLeft, 800, 'эргэн төлөлтийн санал олгосон 800-аас');
  assert.equal(paidAmountOf(recOfDoc(paidAdv)), 800, '185-д бичигдэх dun-тэй тэнцүү');
  const w = recOfDoc({ objectid: 51, turul: 'Гүйцэтгэл', ipc_dugaar: 2, geree_kod: 'Г', niit_dun: 1000, tuluv: 'IPC үүссэн' });
  assert.ok(!('urdchilgaa_sanhuujilt' in editDoc(w, { niit_dun: 800 })), 'гүйцэтгэлийн IPC-д урьдчилгаа санхүүжилт бичигдэхгүй');
}

/* ── 25. 2026-11-27: «Устгах» ↔ «Баталгаажуулах» зэрэг — чөлөөлсний дараа төлбөрийн мөр гарвал баримт устгахгүй ── */
{
  const fill = { objectid: 2, murun_id: 'AUTO|БАГЦ2|2026-10-01', geree_kod: 'Г', bagts: 'Багц 2', tulult_turul: 'Гүйцэтгэл', guilgee_ognoo: '2026-10-01', guits_une: 9000, ipc_dugaar: 3, ipc_tuluv: 'IPC үүссэн' };
  const d = recOfDoc({ objectid: 60, turul: 'Гүйцэтгэл', ipc_dugaar: 3, geree_kod: 'Г', bagts: 'Багц 2', niit_dun: 9000, duusah_ognoo: '2026-10-01', tuluv: 'Гарын үсэг зурсан', barimt_id: 'x' });
  const del = deleteDoc(d, [fill]);
  assert.deepEqual(del.restore, [{ objectid: 2, ipc_dugaar: 3, ipc_tuluv: 'IPC үүссэн' }]);
  const unlocked = { ...fill, ipc_dugaar: null, ipc_tuluv: 'Гүйцэтгэл' };
  assert.equal(deleteRaced(d, [unlocked], del.restore), null, 'зэрэг баталгаажаагүй — устгана');
  const ap = approveDoc(d, [fill], '2026-11-27');
  assert.deepEqual(deleteRaced(d, [unlocked, { objectid: 9, ...ap.pay }], del.restore), [{ objectid: 2, ipc_dugaar: 3, ipc_tuluv: 'Олгосон' }],
    'өөр хэрэглэгч баталсан — бөглөлт дугаартай нь «Олгосон» болж буцна');
  assert.equal(deleteRaced(d, [unlocked, { objectid: 9, ...ap.pay, bagts: 'Багц 7' }], del.restore), null, 'өөр багцын төлбөр хаахгүй');
  const ui = readFileSync('src/modules/IpcFlow.tsx', 'utf8');
  const rm = ui.slice(ui.indexOf('const removeNew = '), ui.indexOf('const pdfNew = '));
  const iRace = rm.indexOf('deleteRaced(rec2, await freshPays(code, pays), e.restore)');
  assert.ok(rm.indexOf('updates: e.unlock') < iRace && iRace < rm.indexOf('deletes: [rec2.oid]'), 'чөлөөлсний дараа, устгахын өмнө дахин уншина');
  assert.ok(rm.includes('if (!raced) await applyAll(IPC_DOC.url'), 'зэрэг баталсан бол баримт устгахгүй');
}

/* ── 26. 2026-11-27: «Гэрээний дүнгээс хэтэрнэ» — олгосон (Σdun) ба батлагдаагүй IPC нэг хэмжээсээр (санхүүжилтийн эрх нээсэн) ── */
{
  const advPay = { objectid: 1, murun_id: 'PAY|Г|1', geree_kod: 'Г', bagts: 'Багц 2', tulult_turul: 'Урьдчилгаа төлбөр', ipc_dugaar: 1, dun: 20, ipc_tuluv: 'Олгосон' };
  const p1 = { objectid: 2, murun_id: 'PAY|Г|2', geree_kod: 'Г', bagts: 'Багц 2', tulult_turul: 'Гүйцэтгэл', ipc_dugaar: 2, dun: 70, ipc_tuluv: 'Олгосон' };
  const docs = [
    { objectid: 10, turul: 'Урьдчилгаа', ipc_dugaar: 1, geree_kod: 'Г', bagts: 'Багц 2', niit_dun: 20, urdchilgaa_sanhuujilt: 20, tuluv: 'Олгосон' },
    { objectid: 11, turul: 'Гүйцэтгэл', ipc_dugaar: 2, geree_kod: 'Г', bagts: 'Багц 2', niit_dun: 80, urdchilgaa_tololt: 10, duusah_ognoo: '2026-10-01', tuluv: 'Олгосон' },
  ];
  const paid = sumPaid([advPay, p1]);
  assert.equal(paid, 90);
  const recs = recordsOf([advPay, p1], docs);
  assert.equal(pendingFin(recs), 0, 'олгосон IPC батлагдаагүйд тоологдохгүй');
  const fin = paidAmountOf(recOfDoc({ turul: 'Гүйцэтгэл', niit_dun: 20, urdchilgaa_tololt: 10 }));
  assert.equal(fin, 10);
  assert.equal(overContract(paid, fin, 100, pendingFin(recs)), false, 'санхүүжилт 20 + 70 + 10 = гэрээ 100 — анхааруулгагүй');
  const recs2 = recordsOf([advPay, p1], [...docs,
    { objectid: 12, turul: 'Гүйцэтгэл', ipc_dugaar: 3, geree_kod: 'Г', bagts: 'Багц 2', niit_dun: 20, urdchilgaa_tololt: 10, duusah_ognoo: '2026-10-05', tuluv: 'IPC үүссэн' }]);
  assert.equal(pendingFin(recs2), 10, 'батлагдаагүй IPC — нийт 20 биш, санхүүжилт 10');
  assert.equal(overContract(paid, fin, 100, pendingFin(recs2)), true, 'жинхэнэ хэтрэлт хэвээр');
  const ui = readFileSync('src/modules/IpcFlow.tsx', 'utf8');
  assert.ok(ui.includes('overContract(paid, fin, contract, pending)') && ui.includes('const pending = pendingFin(recs)'), 'анхааруулга нэг хэмжээсээр');
}

/* ── 27. 2026-11-27: өөр багцын ижил дугаартай баримт төлбөрийг жагсаалтаас нуухгүй ── */
{
  const paid10 = { objectid: 1, murun_id: 'PAY|Г|5', geree_kod: 'Г', bagts: 'Багц-10', tulult_turul: 'Гүйцэтгэл', guilgee_ognoo: '2026-09-01', ipc_dugaar: 5, dun: 100, ipc_tuluv: 'Олгосон' };
  const d11 = { objectid: 30, turul: 'Гүйцэтгэл', ipc_dugaar: 5, geree_kod: 'Г', bagts: 'Багц-11', niit_dun: 50, duusah_ognoo: '2026-10-01', tuluv: 'IPC үүссэн' };
  const recs = recordsOf([paid10], [d11]);
  assert.deepEqual(recs.map((x) => x.src), ['pay', 'doc'], 'Багц-10-ийн баримтгүй төлбөр харагдана');
  assert.equal(cumulative(recs, 1000)[1].finCum, 150, 'хуримтлалд 100 + 50');
  assert.equal(recordsOf([paid10], [{ ...d11, bagts: 'Багц 10' }]).length, 1, 'ижил багцын баримт төлбөрийг нууна');
  assert.equal(recordsOf([paid10], [{ ...d11, bagts: null }]).length, 1, 'багцгүй баримт бүх багцын төлбөрийг нууна');
}

console.log('ipcDocTable: ok');
