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
  approveDoc, contextOf, cumulative, defaultAdvance, defaultDeductions, deleteDoc, deductionsOf, docCodeOf, docWhy, editDoc,
  explainDeductions, fillBalance, isPayRow, newAdvanceDoc, newWorkDoc, nextDay, nextDocNo, payableOf, prevEndOf, recOfDoc,
  recordsOf, sameNo, signDoc, t7Of, unpaidFills, unpaidPkgs,
} from './ipcDocTable.ts';
import { planPaidSync } from './hoSync/compute.ts';
import { groupHo, sumPaid } from './ipc.ts';
import { payRows } from './ipcTable.ts';
import { contractCancelWhy } from './ipcFlow.ts';

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
  assert.equal(e.pay.dun, 338, 'dun = нийт дүн');
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

console.log('ipcDocTable: ok');
