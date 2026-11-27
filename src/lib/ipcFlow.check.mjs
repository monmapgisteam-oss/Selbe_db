/**
 * IPC үүсгэх дараалал — `ipcFlow.ts` (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ipcFlow.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  approveIpc, approveWhy, contractCancel, contractCancelFresh, contractCancelWhy, contractUpdates, contractWhy, createAdvance, deleteIpc, deleteWhy,
  createIpc, docRows, docTitle, nextIpcNo, overContract, perfRows, perfTotal, signIpc, statusOf,
} from './ipcFlow.ts';

const auto = (o) => ({
  objectid: o.oid, murun_id: `AUTO|БАГЦ2|${o.day}`, geree_kod: 'Багц-2', bagts: o.pkg ?? 'Багц 2', tulult_turul: 'Гүйцэтгэл',
  guilgee_ognoo: o.day, guits_une: o.une, dun: null, ipc_dugaar: o.no ?? null, ipc_tuluv: o.st ?? null,
});
const pays = [
  { objectid: 1, murun_id: 'ХО-0004', geree_kod: 'Багц-2', bagts: 'Багц-2', tulult_turul: 'Урьдчилгаа төлбөр', dun: 86, ipc_dugaar: null },
  { objectid: 2, murun_id: 'ХО-0005', geree_kod: 'Багц-2', bagts: 'Багц-2', tulult_turul: 'Гүйцэтгэл', dun: 34, ipc_dugaar: 2 },
  auto({ oid: 3, day: '2026-09-09', une: 100 }),
  auto({ oid: 4, day: '2026-10-04', une: 120 }),
  auto({ oid: 5, day: '2026-10-11', une: 118 }),
];

/* 2026-11-04: IPC үүсгэх/цуцлах/урьдчилгааны огноо ОРОН НУТГИЙН өдөр (`dayKey`) — бөглөх хуудастай нэг дүрэм; UTC (`toISOString`) биш:
   шөнийн 0–8 цагт UTC өдөр нэгээр хоцордог байв */
{
  const { readFileSync } = await import('node:fs');
  const ui = readFileSync('src/modules/IpcFlow.tsx', 'utf8');
  assert.ok(ui.includes('const today = (): string => dayKey(Date.now());'), 'IpcFlow: today() = dayKey (орон нутгийн өдөр)');
  assert.ok(!ui.includes('toISOString().slice(0, 10)'), 'IpcFlow: UTC өдөр хэрэглэхгүй');
  const { dayKey } = await import('./format.ts');
  const ub = new Date(2026, 10, 4, 1, 30); // орон нутгийн 2026-11-04 01:30 — UTC-ээр 11-03 байж болно
  assert.equal(dayKey(ub.getTime()), '2026-11-04', 'dayKey орон нутгийн хуанлийн өдөр');
}

/* Төлөв */
assert.equal(statusOf(pays[0]), 'Олгосон', 'dun-тэй хуучин мөр');
assert.equal(statusOf(pays[2]), 'Гүйцэтгэл', 'AUTO мөр');
assert.equal(statusOf({ ...pays[2], ipc_tuluv: 'IPC үүссэн' }), 'IPC үүссэн');

/* 2026-11-04: `guits_une` тухайн өдрийн ажил — өсөлт бодохгүй, шууд дүн */
const perf = perfRows(pays);
assert.deepEqual(perf.map((r) => r.delta), [100, 120, 118], 'мөр бүрийн дүн шууд');
assert.equal(perfTotal(perf), 338, 'нийлбэр = мөрүүдийн нийлбэр');
const two = perfRows([auto({ oid: 1, day: '2026-01-01', une: 10, pkg: 'A' }), auto({ oid: 2, day: '2026-01-01', une: 7, pkg: 'B' }), auto({ oid: 3, day: '2026-02-01', une: 15, pkg: 'A' })]);
assert.deepEqual(two.map((r) => [r.pkg, r.delta]), [['A', 10], ['A', 15], ['B', 7]], 'багц · өдрөөр эрэмбэлэгдэнэ');

/* Дугаар */
assert.equal(nextIpcNo(pays), 3);

/* IPC үүсгэх */
const sel = perf.slice(0, 2);
const c = createIpc('Багц-2', pays, sel, '2026-11-04');
assert.equal(c.adds.length, 1);
assert.equal(c.adds[0].murun_id, 'IPC|Багц-2|3');
assert.equal(c.adds[0].guits_une, 220, 'дүн = сонгосон мөрүүдийн нийлбэр, хөлдөнө');
assert.equal(c.adds[0].ipc_tuluv, 'IPC үүссэн');
assert.equal(c.adds[0].dun, undefined, 'dun олгох хүртэл бичигдэхгүй');
assert.deepEqual(c.updates, [{ objectid: 3, ipc_dugaar: 3, ipc_tuluv: 'IPC үүссэн' }, { objectid: 4, ipc_dugaar: 3, ipc_tuluv: 'IPC үүссэн' }]);
assert.equal(createIpc('Багц-2', pays, [], '2026-11-04'), 'empty');
assert.equal(createIpc('Багц-2', pays, [{ ...sel[0], status: 'IPC үүссэн' }], '2026-11-04'), 'locked', 'давхар сонголт');
assert.equal(createIpc('Багц-2', pays, [sel[0], { ...sel[1], pkg: 'Өөр' }], '2026-11-04'), 'pkg', 'нэг IPC нэг багц');

/* Төлөвийн урсгал */
const after = [
  ...pays.map((r) => { const u = c.updates.find((x) => x.objectid === r.objectid); return u ? { ...r, ...u } : r; }),
  { objectid: 9, created_user: 'a', ...c.adds[0] },
];
let d = docRows(after)[0];
assert.deepEqual([d.no, d.status, d.total], [3, 'IPC үүссэн', 220]);
assert.equal(approveWhy(d), 'status', 'скангүй баталгаажуулахгүй');
const signed = { ...after[after.length - 1], ...signIpc(d, 'item1') };
const after2 = [...after.slice(0, -1), signed];
d = docRows(after2)[0];
assert.equal(d.status, 'Гарын үсэг зурсан');
assert.equal(approveWhy(d), null, '2026-11-04: нэг хүн үүсгэж баталж болно');
const ap = approveIpc(d, after2);
assert.deepEqual(ap[0], { objectid: 9, dun: 220, ipc_tuluv: 'Олгосон' }, 'dun баримтын нийлбэрээс автоматаар');
assert.deepEqual(ap.slice(1).map((u) => u.objectid), [3, 4]);

/* Устгах — батлаагүй бол болно, баталсан бол хэзээ ч үгүй */
const paidRows = after2.map((r) => { const u = ap.find((x) => x.objectid === r.objectid); return u ? { ...r, ...u } : r; });
const pd = docRows(paidRows)[0];
assert.equal(deleteWhy(pd, paidRows), 'paid', 'баталсан (dun бичигдсэн) баримт устахгүй');
const unpaid = docRows(after2)[0];
assert.equal(deleteWhy(unpaid, after2), null, 'батлаагүй баримт устана');
const del = deleteIpc(unpaid, after2);
assert.deepEqual(del.deletes, [9]);
assert.deepEqual(del.updates, [{ objectid: 3, ipc_dugaar: null, ipc_tuluv: 'Гүйцэтгэл' }, { objectid: 4, ipc_dugaar: null, ipc_tuluv: 'Гүйцэтгэл' }], 'гүйцэтгэлүүд чөлөөлөгдөнө');
assert.equal(deleteWhy({ ...unpaid, oid: 777, status: 'Олгосон' }, after2), 'paid', 'мөр олдохгүй бол төлөвөөр');
/* 2026-11-09: ижил дугаартай хоёр баримт (зэрэг үүссэн) — батлаагүйг устгахад баталсныхаа «Олгосон» мөрийг чөлөөлөхгүй */
{
  const mixed = paidRows.map((r) => (r.objectid === 4 ? { ...r, ipc_tuluv: 'IPC үүссэн' } : r));
  const twin = { objectid: 10, murun_id: 'IPC|Багц-2|3', ipc_dugaar: 3, ipc_tuluv: 'IPC үүссэн', guits_une: 120 };
  const rows2 = [...mixed, twin];
  const dTwin = docRows(rows2).find((x) => x.oid === 10);
  assert.deepEqual(deleteIpc(dTwin, rows2).updates.map((u) => u.objectid), [4], '«Олгосон» мөр (3) чөлөөлөгдөхгүй');
  const ap2 = approveIpc({ ...dTwin, status: 'Гарын үсэг зурсан', docItem: 'x' }, [...rows2, { ...pays.find((r) => r.objectid === 5), ipc_dugaar: 3, ipc_tuluv: 'Гүйцэтгэл' }]);
  assert.deepEqual(ap2.slice(1).map((u) => u.objectid), [4], 'зөвхөн «IPC үүссэн» мөр «Олгосон» болно');
}
const oldCancel = { objectid: 20, murun_id: 'IPC|Багц-2|3|C', ipc_dugaar: 3, dun: null, ipc_tuluv: 'Олгосон' };
assert.equal(deleteWhy(docRows([oldCancel])[0], [oldCancel]), null, '«Олгосон» боловч dun хоосон хуучин мөр устана');

/* Нэр */
assert.equal(docTitle('Багц-2', { no: 6, day: '2026-11-04' }), 'IPC_Багц-2_IPC-06_2026-11-04');
assert.equal(docTitle('БАГЦ-10,11', { no: 1, day: '2026-11-04' }), 'IPC_БАГЦ-10 11_IPC-01_2026-11-04');

/* Урьдчилгаа */
const adv = createAdvance('Багц-5', 'Багц-5', 500, 1, '2026-11-04');
assert.equal(adv.tulult_turul, 'Урьдчилгаа төлбөр');
assert.equal(docRows([{ objectid: 1, ...adv }])[0].advance, true);
assert.equal(adv.dun, undefined, 'урьдчилгаа ч баталгаажих хүртэл олгосонд орохгүй');

/* Хэтрэлт */
assert.equal(overContract(90, 20, 100), true);
assert.equal(overContract(80, 20, 100), false);
assert.equal(overContract(90, 20, null), false);

/* Гэрээ үүсгэх: нэг ба олон багц */
const cf = [
  { objectid: 1, bagts: 'Багц-5', ho_dun_geree: 100, ho_dungiin_tailbar: 'Урьдчилсан дүн' },
  { objectid: 2, bagts: 'Багц-6', ho_dun_geree: 200, ho_dungiin_tailbar: null },
  { objectid: 3, bagts: 'Багц-7', ho_dun_geree: 300, ho_dungiin_tailbar: 'Гэрээлсэн дүн', geree_dugaar: 'Н/1' },
];
const one = { no: 'Н/2', contractor: 'Х', date: '2026-11-04', items: [{ row: cf[0], amount: 90, advance: 27 }] };
assert.equal(contractWhy(one, cf), null, 'нэг багцтай гэрээ');
const many = { ...one, items: [...one.items, { row: cf[1], amount: 150, advance: null }] };
assert.equal(contractWhy(many, cf), null, 'олон багцтай гэрээ');
assert.equal(contractWhy({ ...one, no: ' ' }, cf), 'no-number');
assert.equal(contractWhy({ ...one, items: [] }, cf), 'empty');
assert.equal(contractWhy({ ...one, items: [{ row: cf[0], amount: 0, advance: null }] }, cf), 'amount');
assert.equal(contractWhy({ ...one, items: [{ row: cf[2], amount: 5, advance: null }] }, cf), 'taken', 'нэг багцад хоёр гэрээ оноохгүй');
assert.equal(contractWhy({ ...one, no: 'Н/1' }, cf), 'dup-number', 'давхар дугаар');
/* 2026-11-19: урьдчилгаа гэрээний дүнгээс их байж болохгүй (тэнцүү бол болно) */
assert.equal(contractWhy({ ...one, items: [{ row: cf[0], amount: 90, advance: 91 }] }, cf), 'advance-over');
assert.equal(contractWhy({ ...one, items: [{ row: cf[0], amount: 90, advance: 90 }] }, cf), null, 'урьдчилгаа = гэрээний дүн');
assert.equal(contractWhy({ ...many, items: [many.items[0], { row: cf[1], amount: 150, advance: 500 }] }, cf), 'advance-over', 'аль нэг мөр хэтэрсэн ч');
const up = contractUpdates(many);
assert.deepEqual(up[0], {
  objectid: 1, geree_dun: 90, geree_dugaar: 'Н/2', guitsetgegch: 'Х',
  geree_ognoo: Date.UTC(2026, 10, 4), ho_dungiin_tailbar: 'Гэрээлсэн дүн',
});

/* Гэрээ цуцлах: устахгүй, хуучин төсөв сэргэнэ */
assert.equal(contractCancelWhy([{ objectid: 1, murun_id: 'ХО-1', dun: null }]), null);
assert.equal(contractCancelWhy([{ objectid: 1, dun: 5 }]), 'has-ipc');
assert.equal(contractCancelWhy([{ objectid: 1, murun_id: 'IPC|Х|1', dun: null }]), 'has-ipc', 'IPC үүссэн бол цуцлахгүй');
/* 2026-11-18: дарах мөчид шинээр уншсан мөрөөр шийднэ — дэлгэц дээр IPC байхгүй байсан ч сервер дээр үүссэн бол цуцлахгүй */
{
  const cfR = [{ objectid: 1, geree_dun: 90, ho_dun_geree: 100 }];
  const stale = [{ objectid: 7, murun_id: 'ХО-1', dun: null }];
  assert.equal(contractCancelWhy(stale), null, 'дэлгэцийн хуучин мөрөөр цуцалж болох мэт');
  const paidNow = [...stale, { objectid: 8, murun_id: 'IPC|Х|1', dun: 500 }];
  assert.deepEqual(contractCancelFresh(paidNow, cfR), { ok: false, why: 'has-ipc' }, 'сервер дээр төлбөр олгогдсон — цуцлахгүй');
  assert.deepEqual(contractCancelFresh([...stale, { objectid: 9, murun_id: 'IPC|Х|2', dun: null }], cfR), { ok: false, why: 'has-ipc' }, 'IPC үүссэн (олгоогүй ч) — цуцлахгүй');
  const okNow = contractCancelFresh([...stale, { objectid: 10, murun_id: 'ХО-2', dun: null }], cfR);
  assert.equal(okNow.ok, true);
  assert.deepEqual(okNow.ho.map((r) => r.objectid), [7, 10], 'шинээр нэмэгдсэн мөр ч цуцлагдана');
  assert.equal(okNow.cf[0].geree_dun, null);
}
const cn = contractCancel([{ objectid: 7, murun_id: 'ХО-1' }], [{ objectid: 1, geree_dun: 90, ho_dun_geree: 100 }]);
assert.deepEqual(cn.ho, [{ objectid: 7, ipc_tuluv: 'Цуцлагдсан' }]);
assert.equal(cn.cf[0].geree_dun, null, 'гэрээний дүн арилна');
assert.ok(!('ho_dun_geree' in cn.cf[0]), 'урьдчилсан төсөв хөндөгдөхгүй');
assert.ok(!('ho_dun_geree' in up[0]), 'гэрээ үүсгэхэд урьдчилсан төсөв хөндөгдөхгүй');
assert.equal(cn.cf[0].ho_dungiin_tailbar, null);

assert.equal(contractWhy({ ...one, items: one.items.map((i) => ({ ...i, advance: Number.NaN })) }, cf), 'advance', '«5 сая» мэт бичвэр хаягдахгүй');
assert.equal(contractWhy({ ...one, items: one.items.map((i) => ({ ...i, advance: -1 })) }, cf), 'advance');
assert.equal(contractWhy({ ...one, items: one.items.map((i) => ({ ...i, advance: 0 })) }, cf), null);
{
  const src = readFileSync('src/modules/IpcFlow.tsx', 'utf8');
  assert.ok(src.includes('cfMatches(r, parts, phases)'), 'гэрээ цуцлахад ижил багцын өөр үе шатны гэрээ хөндөгдөхгүй');
  assert.ok(!src.includes('toISOString'), 'IPC-ийн огноо локал өдрөөр');
  /* 2026-11-24: + шинэ IPC түгжихийн өмнөх (`stillFree`) ба батласны дараах давхар төлбөрийн (`dupPayDeletes`) уншилт */
  /* 2026-11-27: + шинэ IPC устгахад бөглөлт чөлөөлсний дараах уншилт (`deleteRaced`) */
  assert.equal((src.match(/await freshPays\(code, pays\)/g) ?? []).length, 7, 'хуучин баримтын скан, батлах, устгах, гэрээ цуцлах (2026-11-18) — дахин уншина');
  /* 2026-11-23: шинэ IPC (238) — үүсгэхийн өмнө, дараа, скан · батлах · устгахад (`freshRec`) 185 ба 238-ийг хамт дахин уншина */
  assert.equal(src.split('Promise.all([freshPays(code, pays), freshDocs(code)])').length - 1, 3, 'шинэ IPC 185 + 238-ийг дахин уншина');
  assert.ok(src.includes('contractCancelFresh(await freshPays(code, pays), rows, await freshDocs(code))'), 'гэрээ цуцлах шинээр уншсан мөрөөр (185 ба 238) шийднэ');
  assert.ok(src.includes('d2.status !== S.created'), 'скан оруулахад төлөв шинээр шалгагдана');
  assert.ok(src.indexOf('updates: e.ho') < src.indexOf('updates: e.cf'), 'гэрээ цуцлахад IPC эхэлнэ');
  assert.ok(src.includes('!== S.cancelled'), 'урьдчилгаа цуцлагдсан гэрээнд очихгүй');
  assert.ok(src.includes('cfNow, hoNow'), 'гэрээ үүсгэхийн өмнө 182, 185-г шинээр шалгана');
  assert.ok(src.includes('Promise.all([freshPays(code, pays), freshDocs(code)]).catch(() => null)'), 'IPC бичигдсэний дараах уншилт унавал алдаа гэж хэлэхгүй');
  assert.ok(src.includes('(!nos.size || !dead) && cfMatches(r, parts, phases)'), 'идэвхтэй гэрээ цуцлахад дугааргүй мөр нь цэвэрлэгдэнэ; цуцлагдсан дугаартай гэрээ хөндөхгүй');
  /* 2026-11-09: скан файл ЭЗНИЙ нэрээр устгагдана (одоогийн хэрэглэгч биш); сешнгүй бол чимээгүй үлдээхгүй */
  assert.ok(src.includes('await entDeletePdf(it.id, it.owner)'), 'скан item-ийн эзнээр устгана');
  assert.ok(!src.includes('entSession()?.user'), 'одоогийн хэрэглэгчийг эзэн гэж үзэхгүй');
  assert.ok(!/if \(owner\) await entDeletePdf/.test(src), 'сешнгүй бол «гараар устгана уу» гэж хэлнэ');
}

/* 2026-11-06: «Багц 1» ба «Багц-1» нэг багц — нэг IPC-д орно; өөр багц хэвээр хоригдоно */
{
  const mix = [{ ...sel[0], pkg: 'Багц 2' }, { ...sel[1], pkg: 'Багц-2' }];
  const e = createIpc('Багц-2', pays, mix, '2026-11-06');
  assert.notEqual(e, 'pkg', 'хоёр бичлэг нэг багц');
  assert.equal(e.adds[0].guits_une, 220);
  assert.equal(createIpc('Багц-2', pays, [{ ...sel[0], pkg: 'Багц 2' }, { ...sel[1], pkg: 'Багц-3' }], '2026-11-06'), 'pkg');
}

/* 2026-11-06: дүнгийн бичвэр — аравтын таслал дүнг өсгөхгүй */
{
  const { parseMoney } = await import('./ipcFlow.ts');
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('5000000'), 5000000);
  assert.equal(parseMoney('5,000,000'), 5000000);
  assert.equal(parseMoney('1250000,5'), 1250000.5, 'урьд нь 12500005');
  assert.equal(parseMoney('5 000 000'), 5000000);
  assert.ok(Number.isNaN(parseMoney('5 сая')));
  assert.ok(Number.isNaN(parseMoney('1,250')), 'мянгатын уу, аравтын уу тодорхойгүй');
}

/* 2026-11-06: цуцлагдсан гэрээний дугаар дахин авахгүй; хагас цуцлагдсан гэрээг дахин оролдоно; зэрэг авсан дугаар илэрнэ */
{
  const { dupDocNos } = await import('./ipcFlow.ts');
  const row = { objectid: 1, ho_dungiin_tailbar: null };
  const nc = { no: 'Н/9', contractor: '', date: '', items: [{ row, amount: 5, advance: null }] };
  assert.equal(contractWhy(nc, []), null);
  assert.equal(contractWhy(nc, [], [{ objectid: 2, geree_dugaar: 'Н/9', ipc_tuluv: 'Цуцлагдсан' }]), 'dup-number');
  assert.equal(contractCancelWhy([{ objectid: 1, murun_id: 'AUTO|Х|2026-01-01', ipc_tuluv: 'Цуцлагдсан' }]), null, 'хагас цуцлагдсан');
  assert.equal(contractCancelWhy([{ objectid: 1, murun_id: 'AUTO|Х|2026-01-01', ipc_tuluv: 'IPC үүссэн' }]), 'has-ipc');
  const doc = (oid, id, no) => ({ objectid: oid, murun_id: id, ipc_dugaar: no });
  assert.deepEqual(dupDocNos([doc(1, 'IPC|Х|3', 3), doc(2, 'IPC|Х|4', 4)]), []);
  assert.deepEqual(dupDocNos([doc(1, 'IPC|Х|3', 3), doc(2, 'IPC|Х|3', 3)]), [3]);
}

/* 2026-11-23 (аудит): давхар дугаарын буцаалт — дүнгээр нотлогдсон үед л миний мөрийг чөлөөлнө */
{
  const { rollbackFree, advanceMissing } = await import('./ipcFlow.ts');
  const d = (oid, no, total) => ({ objectid: oid, murun_id: `IPC|Багц-2|${no}`, geree_kod: 'Багц-2', bagts: 'Багц 2', tulult_turul: 'Гүйцэтгэл', guits_une: total, ipc_dugaar: no });
  const p3 = (oid, une) => auto({ oid, day: `2026-10-${10 + oid}`, une, no: 3 });
  /* Нөгөө баримт (10) = мөр 3 (100); миний (11) = мөр 4 (120) → минийх тусдаа: чөлөөлнө */
  assert.deepEqual(rollbackFree([d(10, 3, 100), d(11, 3, 120), p3(3, 100), p3(4, 120)], 3, 11, [4]), { free: [4], sure: true });
  /* Миний сонгосон мөр 3 нөгөө баримтынх (бүх дүн = нөгөөгийн дүн) → чөлөөлөхгүй (урьд нь чөлөөлж давхар төлбөрт оруулдаг байв) */
  assert.deepEqual(rollbackFree([d(10, 3, 100), d(11, 3, 100), p3(3, 100)], 3, 11, [3]), { free: [], sure: true });
  /* Хэсэгчлэн давхцсан — нотлогдохгүй: юу ч чөлөөлөхгүй, sure=false */
  assert.deepEqual(rollbackFree([d(10, 3, 150), d(11, 3, 120), p3(3, 100), p3(4, 120)], 3, 11, [4]), { free: [], sure: false });
  /* Үлдсэн баримт нэгээс олон — sure=false */
  assert.deepEqual(rollbackFree([d(10, 3, 100), d(12, 3, 100), d(11, 3, 120), p3(4, 120)], 3, 11, [4]), { free: [], sure: false });
  /* Урьдчилгаа давхардахгүй: цуцлагдаагүй урьдчилгаатай багц алгасагдана, бусад нь үлдэнэ */
  const a2 = { objectid: 20, ...createAdvance('Багц-2', 'Багц 2', 50, 1, '2026-11-04') };
  const items = [{ row: { bagts: 'Багц 2' } }, { row: { bagts: 'Багц 3' } }];
  assert.deepEqual(advanceMissing([a2], items, (i) => i.row.bagts).map((i) => i.row.bagts), ['Багц 3']);
  assert.equal(advanceMissing([], items, (i) => i.row.bagts).length, 2);
  console.log('✅ IPC давхар дугаарын буцаалт · урьдчилгаа давхардахгүй');
}

/* 2026-11-23 (аудит №15): өмнөх «Хадгалах» бичигдсэн ч хариу алдагдсан — сервер дээрх мөрүүд энэ гэрээгээр бичигдсэн бол хадгалагдсан гэж үзнэ */
{
  const { contractAlreadySaved, contractUpdates } = await import('./ipcFlow.ts');
  const saved = contractUpdates(many);
  assert.equal(contractAlreadySaved(many, saved), true, 'бүх мөр энэ дугаар · «Гэрээлсэн дүн» · ижил дүн');
  assert.equal(contractAlreadySaved(many, [saved[0]]), false, 'нэг мөр нь бичигдээгүй');
  assert.equal(contractAlreadySaved(many, saved.map((r, i) => (i ? { ...r, geree_dun: 999 } : r))), false, 'дүн зөрсөн');
  assert.equal(contractAlreadySaved(many, saved.map((r) => ({ ...r, geree_dugaar: 'Н/9' }))), false, 'өөр гэрээний дугаар');
  assert.equal(contractAlreadySaved(one, cf), false, 'анхны (бичээгүй) мөрүүд');
  const ui = readFileSync(new URL('../modules/IpcFlow.tsx', import.meta.url), 'utf8');
  assert.ok(ui.includes('const already = contractAlreadySaved(c, cfNow);') && ui.includes('if (!already) await applyAll(CASHFLOW_NEW.url'), 'цонх: хадгалагдсан бол дахин бичихгүй, урьдчилгаа руу үргэлжилнэ');
  console.log('✅ гэрээний цонх: хариу алдагдсан хадгалалтын давталт');
}

console.log('ipcFlow.check ✓');
