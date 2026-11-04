/**
 * IPC үүсгэх дараалал — `ipcFlow.ts` (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ipcFlow.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  approveIpc, approveWhy, canCancel, contractCancel, contractCancelWhy, contractUpdates, contractWhy, createAdvance, createCancel,
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
assert.deepEqual([d.no, d.status, d.total, d.isCancel], [3, 'IPC үүссэн', 220, false]);
assert.equal(approveWhy(d), 'status', 'скангүй баталгаажуулахгүй');
const signed = { ...after[after.length - 1], ...signIpc(d, 'item1') };
const after2 = [...after.slice(0, -1), signed];
d = docRows(after2)[0];
assert.equal(d.status, 'Гарын үсэг зурсан');
assert.equal(approveWhy(d), null, '2026-11-04: нэг хүн үүсгэж баталж болно');
const ap = approveIpc(d, after2);
assert.deepEqual(ap[0], { objectid: 9, dun: 220, ipc_tuluv: 'Олгосон' }, 'dun баримтын нийлбэрээс автоматаар');
assert.deepEqual(ap.slice(1).map((u) => u.objectid), [3, 4]);

/* Цуцлалт — устахгүй */
const paidRows = after2.map((r) => { const u = ap.find((x) => x.objectid === r.objectid); return u ? { ...r, ...u } : r; });
const pd = docRows(paidRows)[0];
assert.ok(canCancel(pd, docRows(paidRows)));
const cc = createCancel('Багц-2', pd, '2026-11-05');
assert.equal(cc.murun_id, 'IPC|Багц-2|3|C');
assert.equal(cc.guits_une, -220);
const withC = [...paidRows, { objectid: 10, created_user: 'a', ...cc, ipc_tuluv: 'Гарын үсэг зурсан', ipc_barimt_id: 'item2' }];
const docs = docRows(withC);
assert.equal(docs.length, 2);
assert.ok(!canCancel(docs[0], docs), 'цуцлалт аль хэдийн нээгдсэн');
const cd = docs.find((x) => x.isCancel);
const cap = approveIpc(cd, withC);
assert.deepEqual(cap[0], { objectid: 10, dun: -220, ipc_tuluv: 'Олгосон' }, 'олгосон байсан бол сөрөг дүн');
assert.deepEqual(cap[1], { objectid: 9, ipc_tuluv: 'Цуцлагдсан' }, 'эх баримт хэвээр, төлөв л өөрчлөгдөнө');
assert.deepEqual(cap.slice(2), [{ objectid: 3, ipc_dugaar: null, ipc_tuluv: 'Гүйцэтгэл' }, { objectid: 4, ipc_dugaar: null, ipc_tuluv: 'Гүйцэтгэл' }], 'гүйцэтгэл чөлөөлөгдөнө');
assert.equal(nextIpcNo(withC), 4, 'цуцлагдсан дугаар дахин ашиглагдахгүй');

/* Нэр */
assert.equal(docTitle('Багц-2', { no: 6, day: '2026-11-04', isCancel: false }), 'IPC_Багц-2_IPC-06_2026-11-04');
assert.equal(docTitle('БАГЦ-10,11', { no: 1, day: '2026-11-04', isCancel: true }), 'IPC_БАГЦ-10 11_Tsutslalt-IPC-01_2026-11-04');

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
const up = contractUpdates(many);
assert.deepEqual(up[0], {
  objectid: 1, geree_dun: 90, geree_dugaar: 'Н/2', guitsetgegch: 'Х',
  geree_ognoo: Date.UTC(2026, 10, 4), ho_dungiin_tailbar: 'Гэрээлсэн дүн',
});

/* Гэрээ цуцлах: устахгүй, хуучин төсөв сэргэнэ */
assert.equal(contractCancelWhy([{ objectid: 1, murun_id: 'ХО-1', dun: null }]), null);
assert.equal(contractCancelWhy([{ objectid: 1, dun: 5 }]), 'has-ipc');
assert.equal(contractCancelWhy([{ objectid: 1, murun_id: 'IPC|Х|1', dun: null }]), 'has-ipc', 'IPC үүссэн бол цуцлахгүй');
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
  assert.equal((src.match(/await freshPays\(code, pays\)/g) ?? []).length, 3, 'IPC үүсгэх, батлах, цуцлахын өмнө дахин уншина');
}

console.log('ipcFlow.check ✓');
