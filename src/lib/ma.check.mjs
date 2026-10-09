/**
 * MA (материал баталгаажуулалт) — цэвэр логик: Survey123 мөр → `MaRow`, ажлын хаалга,
 * сүүлийн хувилбар, хавсралтын мета (`keywords`).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ma.check.mjs
 *
 * ⚠️ «Нэг ажил олон MA-д» — БҮГД батлагдсан байх ёстой (2026-10-09, хэрэглэгч): бетоны MA
 *    батлагдсан ч арматурынх R бол ажил хаалттай. Энэ дүрмийг тестгүй орхивол «нэг нь
 *    болсон» гэж хаалга нээгдэх алдаа чимээгүй орно.
 */
import assert from 'node:assert/strict';
import {
  rowOf, splitMulti, toVerdict, maGateOf, latestPerRespNo, formatKeywords, parseKeywords, isExpired, isApproved,
} from '@/lib/ma.ts';

const attrs = (o = {}) => ({
  objectid: 1, globalid: '{G}', pkg: 'b1_9f', pkg_label: 'Багц 1 · 9 давхар', contractor_name: 'NBG', material_name: 'Арматур',
  sub_doc_no: 'NBG-SLB-MA-0001-00', recv_date: 1_700_000_000_000, resp_no: 'SLB-REP-MA-P0100-0015-00', resp_date: 1_700_100_000_000,
  works: 'b1_9f:12  b1_9f:15 b1_9f:12', doc_items: 'scope conf', verdict: 'A', an_note: null, r_reason: null,
  appr_name: 'Д.Одгэрэл', prep_name: 'Г.Гантулга', created_date: 1, last_edited_date: 2, ...o,
});

/* 1. мөр задлах — select_multiple зайгаар, давхардал хасна; verdict хэвийн */
{
  const r = rowOf(attrs());
  assert.deepEqual(r.works, ['b1_9f:12', 'b1_9f:15']);
  assert.deepEqual(rowOf(attrs({ works: 'b1_12f:5,b1_12f:14, b1_12f:5' })).works, ['b1_12f:5', 'b1_12f:14'], 'Survey123 таслалаар');
  assert.deepEqual(r.docItems, ['scope', 'conf']);
  assert.equal(r.verdict, 'A');
  assert.equal(r.pkgLabel, 'Багц 1 · 9 давхар');
  assert.equal(rowOf(attrs({ pkg_label: null })).pkgLabel, 'b1_9f');
  assert.equal(toVerdict(' an '), 'AN');
  assert.equal(toVerdict('X'), null);
  assert.deepEqual(splitMulti(null), []);
  assert.equal(isApproved('AN'), true);
  assert.equal(isApproved('R'), false);
  assert.equal(isApproved(null), false);
}
console.log('✅ rowOf — works зайгаар · давхардалгүй · verdict · pkgLabel нөөц');

/* 2. ажлын хаалга — нэг ч MA байхгүй = none; бүгд A/AN = ok; нэг нь R/хоосон = blocked */
{
  const beton = rowOf(attrs({ objectid: 1, resp_no: 'R1', works: 'b1_9f:12 b1_9f:15', verdict: 'A' }));
  const armatur = rowOf(attrs({ objectid: 2, resp_no: 'R2', works: 'b1_9f:12', verdict: 'R' }));
  const pending = rowOf(attrs({ objectid: 3, resp_no: 'R3', works: 'b1_9f:15', verdict: null }));
  assert.equal(maGateOf('b1_9f:99', [beton, armatur]).gate, 'none');
  assert.equal(maGateOf('b1_9f:12', [beton]).gate, 'ok');
  assert.equal(maGateOf('b1_9f:12', [beton, armatur]).gate, 'blocked', 'олон MA-гийн нэг нь R → хаалттай');
  assert.equal(maGateOf('b1_9f:15', [beton, pending]).gate, 'blocked', 'шийдвэргүй MA → хаалттай');
  assert.equal(maGateOf('b1_9f:12', [beton, armatur]).mas.length, 2);
}
console.log('✅ maGateOf — none · ok · олон MA-гийн нэг нь R/хоосон = blocked');

/* 3. нэг resp_no олон удаа илгээгдвэл сүүлийнх (их oid) ялна; дугааргүй мөр бүр өөрөө */
{
  const old = rowOf(attrs({ objectid: 5, resp_no: 'R1', verdict: 'R' }));
  const nu = rowOf(attrs({ objectid: 9, resp_no: 'R1', verdict: 'A' }));
  const n1 = rowOf(attrs({ objectid: 6, resp_no: '' }));
  const n2 = rowOf(attrs({ objectid: 7, resp_no: '' }));
  const l = latestPerRespNo([old, n1, nu, n2]);
  assert.deepEqual(l.map((r) => r.oid), [9, 7, 6]);
  assert.equal(maGateOf('b1_9f:12', [old, nu]).gate, 'ok', 'хуучин R хувилбар тоологдохгүй');
}
console.log('✅ latestPerRespNo — сүүлийн хувилбар ялна · дугааргүй мөр тус бүр');

/* 4. хавсралтын мета — keywords ↔ объект; `;` `=` утгаас хасагдана; хугацаа */
{
  const k = formatKeywords({ type: 'conf', no: 'TC-26;1078896', std: 'MNS 0138:2010 = ok', valid: '2027-04-27', title: 'Керамик тоосго' });
  assert.ok(k.length <= 255);
  const m = parseKeywords(k);
  assert.equal(m.type, 'conf');
  assert.equal(m.no, 'TC-26 1078896');
  assert.equal(m.std, 'MNS 0138:2010 ok');
  assert.equal(m.valid, '2027-04-27');
  assert.equal(m.title, 'Керамик тоосго');
  assert.equal(parseKeywords('').type, 'other');
  assert.equal(parseKeywords('att_file').type, 'att_file', 'Survey123-ын өөрийн хавсралт — асуултын нэр');
  assert.equal(formatKeywords({ type: 'lab', valid: '27.04.2027' }).includes('valid='), false, 'буруу огноо хадгалахгүй');
  assert.equal(isExpired('2020-01-01', Date.UTC(2026, 9, 9)), true);
  assert.equal(isExpired('2099-01-01', Date.UTC(2026, 9, 9)), false);
  assert.equal(isExpired(undefined), false);
}
console.log('✅ хавсралтын мета — keywords урвуу · цэвэрлэлт · хугацаа');

/* 5. ШАТЛАЛЫН УЯЛДАА — хатуу дараалал; өмнөх батлагдаагүй бол дараагийнх хаалттай; IPC = 4 шат done */
{
  const { chainOf, ipcReady } = await import('@/lib/ma.ts');
  const st = (c) => c.map((x) => `${x.key}:${x.state}`).join(' ');
  assert.equal(st(chainOf(null)), 'MA:pending MIR:locked FIC:locked MAKT:locked');
  assert.equal(st(chainOf('R')), 'MA:rejected MIR:locked FIC:locked MAKT:locked');
  assert.equal(st(chainOf('A')), 'MA:done MIR:next FIC:locked MAKT:locked', 'MIR холбогдоогүй — хүлээгдэж буй');
  assert.equal(st(chainOf('AN', { MIR: 'A' })), 'MA:done MIR:done FIC:next MAKT:locked');
  assert.equal(st(chainOf('A', { MIR: 'R', FIC: 'A' })), 'MA:done MIR:rejected FIC:locked MAKT:locked', 'MIR R → FIC хаалттай (батлагдсан ч)');
  assert.equal(st(chainOf('A', { MIR: 'A', FIC: null })), 'MA:done MIR:done FIC:pending MAKT:locked');
  assert.equal(ipcReady(chainOf('A', { MIR: 'A', FIC: 'A', MAKT: 'AN' })), true);
  assert.equal(ipcReady(chainOf('A', { MIR: 'A', FIC: 'A' })), false, 'М-акт гараагүй → IPC олгохгүй');
}
console.log('✅ chainOf — MA → MIR → FIC → М-акт хатуу дараалал · IPC = 4 шат батлагдсан');

/* 6. MIR — мөр задлах · MA-аар бүлэглэх · MIR шат (олон ачаа: нэг A хангалттай, бүгд R = R) */
{
  const { mirRowOf, mirsByMa, mirVerdictFor } = await import('@/lib/mir.ts');
  const { chainOf } = await import('@/lib/ma.ts');
  const m = (o) => mirRowOf({ objectid: 1, uniquerowid: 'U1', doc_no: 'NBG-SLB-MIR-0020', ma_no: 'SLB-REP-MA-P1', verdict: 'A', x_count: 0,
    c1_con: 'OK', c1_cli: 'na', c2_cli: 'X', ...o });
  const r = m();
  assert.equal(r.checks.length, 8);
  assert.deepEqual(r.checks[0], ['OK', 'NA']);
  assert.deepEqual(r.checks[1], [null, 'X']);
  const a = m({ objectid: 1, verdict: 'R' });
  const b = m({ objectid: 3, verdict: 'A' });
  const c = m({ objectid: 2, ma_no: 'SLB-REP-MA-P2', verdict: 'R' });
  const map = mirsByMa([a, b, c, m({ objectid: 9, ma_no: '' })]);
  assert.deepEqual(map.get('SLB-REP-MA-P1').map((x) => x.oid), [3, 1], 'сүүлийнх эхэнд');
  assert.equal(map.has(''), false, 'MA дугааргүй MIR бүлэглэгдэхгүй');
  assert.equal(mirVerdictFor(undefined), undefined);
  assert.equal(mirVerdictFor(map.get('SLB-REP-MA-P1')), 'A', 'нэг ачаа A → шат нээгдэнэ');
  assert.equal(mirVerdictFor(map.get('SLB-REP-MA-P2')), 'R', 'бүгд R → R');
  assert.equal(chainOf('A', { MIR: mirVerdictFor(map.get('SLB-REP-MA-P2')) })[1].state, 'rejected');
  assert.equal(chainOf('A', { MIR: mirVerdictFor(map.get('SLB-REP-MA-P1')) })[2].state, 'next', 'MIR A → FIC хүлээгдэж буй');
}
console.log('✅ MIR — мөр · MA-аар бүлэглэх · олон ачааны шат');

/* 7. FIC · М-акт — мөр задлах · MA-аар бүлэглэх · шат (нэг A хангалттай · хүлээж буй = null · бүгд R = R) */
{
  const { fmRowOf, fmByMa, fmVerdictFor } = await import('@/lib/ficMakt.ts');
  const { chainOf, ipcReady } = await import('@/lib/ma.ts');
  const f = (o) => fmRowOf({ OBJECTID: 1, kind: 'FIC', ma_no: 'M1', pdf_item: 'x', status: 'pending', uploaded_by: 'a', ...o });
  assert.equal(f({ status: 'bogus' }).status, 'pending');
  assert.equal(f({ kind: 'makt' }).kind, 'MAKT');
  const map = fmByMa([f({ OBJECTID: 1, status: 'R' }), f({ OBJECTID: 4, status: 'pending' }), f({ OBJECTID: 2, kind: 'MAKT', status: 'A' }), f({ OBJECTID: 9, ma_no: '' })]);
  const e = map.get('M1');
  assert.deepEqual(e.FIC.map((x) => x.oid), [4, 1]);
  assert.equal(map.has(''), false);
  assert.equal(fmVerdictFor(undefined), undefined);
  assert.equal(fmVerdictFor(e.FIC), null, 'батлагдсан алга, хүлээж буй байна → шийдвэр хүлээж буй');
  assert.equal(fmVerdictFor([f({ status: 'R' })]), 'R');
  assert.equal(fmVerdictFor([f({ status: 'R' }), f({ status: 'AN' })]), 'A');
  /* бүх гинж: MA A → MIR A → FIC A → М-акт A = IPC */
  assert.equal(ipcReady(chainOf('A', { MIR: 'A', FIC: fmVerdictFor([f({ status: 'A' })]), MAKT: fmVerdictFor(e.MAKT) })), true);
  assert.equal(chainOf('A', { MIR: 'R', FIC: 'A', MAKT: 'A' })[3].state, 'locked', 'MIR R → FIC/М-акт батлагдсан ч хаалттай');
}
console.log('✅ FIC · М-акт — мөр · бүлэглэх · шат · бүтэн гинж = IPC');
