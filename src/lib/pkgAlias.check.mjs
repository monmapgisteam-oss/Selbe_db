/**
 * `pkgAlias` — олон багц хамарсан олголт ба HO ↔ Cashflow түлхүүрийн холбоос (2026-10-04).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/pkgAlias.check.mjs
 */
import assert from 'node:assert/strict';
import { rangeMembers, rangePaysOf, hoPkgKey, HO_PKG_ALIAS, MAP_PKG_ALIAS, FIN_PKG_ALIAS, finPkgKey } from './pkgAlias.ts';
import { HO_IPC } from './services.ts';

/* ── гишүүн багцууд ── */
assert.deepEqual(rangeMembers('БАГЦ-10,  БАГЦ-11, БАГЦ-13, БАГЦ-15'), ['БАГЦ10', 'БАГЦ11', 'БАГЦ13', 'БАГЦ15']);
assert.deepEqual(rangeMembers('Багц-1-4'), ['БАГЦ1', 'БАГЦ2', 'БАГЦ3', 'БАГЦ4']);
assert.deepEqual(rangeMembers('БАГЦ-6.1, 6.2 Нэмэлт ажил').slice(0, 1), ['БАГЦ61'], 'угтваргүй хэсэг «6.2 …» алдаагүй');
assert.deepEqual(rangeMembers('Багц 4-1'), [], 'дэд багц (4 > 1) диапазон БИШ');
assert.deepEqual(rangeMembers('БАГЦ-3.1'), [], 'энгийн багц');

/* ── олголтын бүлэг: dun хоосон алгасна (null ≠ 0), энгийн багц орохгүй ── */
const P = HO_IPC.payFields;
const C = HO_IPC.contractFields;
const pay = (pkg, dun) => ({ [C.pkg]: pkg, [P.amount]: dun });
const g = rangePaysOf([
  pay('БАГЦ-10,  БАГЦ-11, БАГЦ-13, БАГЦ-15', 3e9),
  pay('БАГЦ-10, БАГЦ-11, БАГЦ-13, БАГЦ-15', 2e9),
  pay('Багц-1-4', 0.5e9),
  pay('Багц-1-4', null),
  pay('Багц-3.1', 9e9),
]);
assert.equal(g.length, 2);
assert.equal(g[0].amount, 5e9, 'зай нэгтгэсэн нэг бүлэг');
assert.equal(g[1].amount, 0.5e9);

/* ── HO → Cashflow → газрын зураг: нэг хүснэгт ── */
assert.equal(hoPkgKey('БАГЦ81'), 'БАГЦ8');
assert.equal(hoPkgKey('БАГЦ1'), 'БАГЦ1');
for (const cf of Object.values(HO_PKG_ALIAS)) assert.ok(MAP_PKG_ALIAS[cf], `${cf}: газрын зургийн холбоосгүй`);

/* ⚠️ 2026-10-09: нэгдсэн санхүүгийн түлхүүр — HO ба Cashflow нэг түлхүүрт буух (paidShare ↔ PkgFin) */
assert.equal(finPkgKey('БАГЦ81'), 'БАГЦ82', 'HO «Багц-8.1» → «Багц 8.2»');
assert.equal(finPkgKey('БАГЦ8'), 'БАГЦ82', 'Cashflow «Багц 8» → «Багц 8.2»');
assert.equal(finPkgKey('БАГЦ71'), 'БАГЦ7');
assert.equal(finPkgKey('БАГЦ7'), 'БАГЦ7');
assert.equal(finPkgKey('БАГЦ1'), 'БАГЦ1', 'холбоосгүй → өөрөө');
assert.equal(FIN_PKG_ALIAS['БАГЦ81'].label, MAP_PKG_ALIAS['БАГЦ8'].label);

console.log('pkgAlias.check: ok');
