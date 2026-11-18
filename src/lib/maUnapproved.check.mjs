/**
 * МАТЕРИАЛ БАТЛАГДААГҮЙ ХИЙГДСЭН АЖИЛ — цэвэр дүрмийн шалгалт (2026-11-18).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/maUnapproved.check.mjs
 */
import assert from 'node:assert/strict';
import { effectiveMas, openMasByWork, unapprovedOf, rootShares } from './maUnapproved.ts';
import { maGateOf } from './ma.ts';

const ma = (oid, respNo, material, verdict, works, pkg = 'b1_9f') => ({
  oid, globalId: `g${oid}`, respNo, respDate: null, recvDate: null, subDocNo: '', pkg, pkgLabel: 'Багц 1', contractor: '',
  material, works, verdict, anNote: '', rReason: '', docItems: [],
});
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} ≠ ${b}`);

/* ── 1. Хүчинтэй хүсэлт: дугаар бүрийн сүүлийнх; шинэ дугаараар дахин ирүүлж солигдсон буцаалт хасагдана ── */
{
  const rows = [
    ma(1, '0007', 'Цемент М400', 'R', ['b1_9f:120']),
    ma(2, '0012', 'Цемент М400', 'A', ['b1_9f:120']),      // 0007-г шинэ дугаараар дахин ирүүлсэн — батлагдсан
    ma(3, '0020', 'Арматур А500', 'R', ['b1_9f:130']),     // дахин ирүүлээгүй буцаалт
    ma(4, '0021', 'Хөөсөн блок', null, ['b1_9f:140']),     // шийдвэр хүлээж буй
    ma(5, '0030', 'Тоосго', 'R', ['b1_9f:150']),
    ma(6, '0030', 'Тоосго', 'AN', ['b1_9f:150']),          // ИЖИЛ дугаараар дахин илгээсэн — сүүлийнх нь
  ];
  const eff = effectiveMas(rows).map((r) => r.oid).sort((a, b) => a - b);
  assert.deepEqual(eff, [2, 3, 4, 6], 'солигдсон буцаалт (1) ба хуучин илгээлт (5) хасагдана');
  const open = openMasByWork(rows);
  assert.deepEqual([...open.keys()].sort(), ['b1_9f:130', 'b1_9f:140'], 'батлагдаагүй нь зөвхөн 130 (буцаасан), 140 (хүлээж буй)');
  /* 6-р алдаа: хуучин буцаалт ажлыг үүрд хаадаг байв */
  assert.equal(maGateOf('b1_9f:120', rows).gate, 'ok', 'шинэ дугаараар батлуулсан — нээлттэй');
  assert.equal(maGateOf('b1_9f:130', rows).gate, 'blocked');
  assert.equal(maGateOf('b1_9f:150', rows).gate, 'ok');
  assert.equal(maGateOf('b1_9f:999', rows).gate, 'none');
  /* дахин ирүүлсэн нь ч буцаагдсан бол хамгийн сүүлийнх нь хүчинтэй хэвээр */
  const again = [ma(1, '0007', 'Цемент', 'R', ['b1_9f:120']), ma(2, '0012', 'Цемент', 'R', ['b1_9f:120'])];
  assert.deepEqual(effectiveMas(again).map((r) => r.oid), [2]);
  assert.equal(maGateOf('b1_9f:120', again).gate, 'blocked');
}

/* ── 2. Нэгтгэл: гүйцэтгэл бөглөгдсөн + батлагдаагүй материалтай ажил л, багцаар ── */
{
  const rows = [
    ma(3, '0020', 'Арматур А500', 'R', ['b1_9f:130', 'b1_9f:131']),
    ma(4, '0021', 'Хөөсөн блок', null, ['b1_9f:140', 'b2_9f:10'], 'b1_9f'),
    ma(7, '0040', 'Цемент', 'A', ['b1_9f:160']),
  ];
  const w = (pkgKey, group, des, done, pct, pp) => ({ pkgKey, group, des, name: `ажил ${des}`, done, total: 100, pct, pp });
  const works = [
    w('b1_9f', 'Багц 1', 130, 40, 40, 0.6),   // буцаасан, хийгдсэн
    w('b1_9f', 'Багц 1', 131, 0, 0, 0),       // буцаасан, ЭХЛЭЭГҮЙ → орохгүй
    w('b1_9f', 'Багц 1', 140, null, 25, 0.2), // хүлээж буй, хувиар хэмжсэн
    w('b1_9f', 'Багц 1', 160, 80, 80, 1.5),   // батлагдсан → орохгүй
    w('b1_9f', 'Багц 1', 170, 50, 50, 1),     // MA-гүй → орохгүй
    w('b2_9f', 'Багц 2', 10, 5, 5, 0.1),      // хүлээж буй
  ];
  const u = unapprovedOf(works, rows);
  assert.equal(u.works, 3);
  assert.equal(u.rejected, 1);
  assert.equal(u.pending, 2);
  near(u.pp, 0.9, 'нэгж хувийн нийлбэр');
  assert.deepEqual(u.pkgs.map((p) => [p.group, p.works.length, p.rejected, p.pending]), [['Багц 1', 2, 1, 1], ['Багц 2', 1, 0, 1]], 'их ажилтай багц эхэнд');
  assert.deepEqual(u.pkgs[0].works.map((x) => x.des), [130, 140], 'буцаасан нь эхэнд');
  assert.equal(u.pkgs[0].works[0].mas[0].respNo, '0020');
  assert.equal(u.pkgs[0].works[0].state, 'rejected');
  assert.equal(u.pkgs[0].works[1].state, 'pending');
  /* асуудалгүй үед хоосон */
  const none = unapprovedOf(works, [ma(7, '0040', 'Цемент', 'A', ['b1_9f:130'])]);
  assert.deepEqual([none.works, none.pkgs.length, none.pp], [0, 0, 0]);
}

/* ── 3. Ажлын жин: бүлэг = Σ D·утга ÷ Σ D — «Б.» мөрөөс доош үржинэ; гадуурх мөр 0 ── */
{
  /* 0: А (бэлтгэл) · 1: Б (үндэс) → 2 (D 3), 3 (D 1) → 3-ын доор 4 (D 1), 5 (D 1) */
  const kids = [[], [2, 3], [], [4, 5], [], []];
  const D = [1, 1, 3, 1, 1, 1];
  const s = rootShares(kids, D, 1);
  assert.deepEqual(s.map((x) => Math.round(x * 1000) / 1000), [0, 1, 0.75, 0.25, 0.125, 0.125]);
  near(s[2] + s[4] + s[5], 1, 'навчны жингийн нийлбэр 1');
  /* D бүгд 0 → тэнцүү */
  assert.deepEqual(rootShares([[1, 2], [], []], [null, 0, 0], 0), [1, 0.5, 0.5]);
  assert.deepEqual(rootShares([[1], []], [1, 1], 5), [0, 0], 'үндэс алга → 0');
}

console.log('maUnapproved.check: бүгд ✅');
