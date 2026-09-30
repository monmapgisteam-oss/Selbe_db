/**
 * «БАГЦ × ШАТ» ХҮСНЭГТИЙН НҮДНИЙ ДҮРЭМ — цэвэр функц (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/guitsetgelGrid.check.mjs
 *
 * ⚠️ Хадгалалт аккаунтаар хэвээр тул нүдний нэмэх/хасах бүр аккаунтын мөрийн
 *    өөрчлөлт болно. Эндээс алдвал: өөр шатны хүнийг асуулгагүй шилжүүлэх,
 *    «бүх багц»-ыг нэг багц руу хумих, сүүлийн багцыг хасахад «бүх багц» руу
 *    тэлэх (fail-open) зэрэг чимээгүй эрхийн алдаа гарна.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GRID_ALL, cellHolds, planCellAdd, planCellRemove } from './guitsetgelGrid.ts';

const PK = ['Багц 1', 'Багц 2', 'Багц 3.1'];
const [P1, P2, P3] = PK;

/* ── 1. Шинэ аккаунт → зөвхөн энэ багцаар томилно ── */
assert.deepEqual(planCellAdd(null, 'engineer', P2), { kind: 'create', stage: 'engineer', bagts: [P2] });
assert.deepEqual(planCellAdd(undefined, 'engineer', GRID_ALL), { kind: 'create', stage: 'engineer', bagts: [GRID_ALL] });

/* ── 2. Ижил шат → багц нэмнэ (эрх хөндөхгүй); аль хэдийн байвал юу ч үгүй ── */
const eng = { stage: 'engineer', bagts: [P1] };
assert.deepEqual(planCellAdd(eng, 'engineer', P2), { kind: 'set', stage: 'engineer', bagts: [P1, P2] });
assert.deepEqual(planCellAdd(eng, 'engineer', P1), { kind: 'none' });
assert.deepEqual(planCellAdd(eng, 'engineer', GRID_ALL), { kind: 'set', stage: 'engineer', bagts: [GRID_ALL] });

/* ── 3. «Бүх багц» аль хэдийн хамарна — дахин нэмбэл ХУМИГДАНА, тиймээс none ── */
const all = { stage: 'manager', bagts: [GRID_ALL] };
assert.deepEqual(planCellAdd(all, 'manager', P3), { kind: 'none' });
assert.deepEqual(planCellAdd(all, 'manager', GRID_ALL), { kind: 'none' });
assert.equal(cellHolds(all, 'manager', P3), 'all', 'ALL нь багц бүрийн мөрд харагдана');
assert.equal(cellHolds(all, 'manager', GRID_ALL), 'all');
assert.equal(cellHolds(eng, 'engineer', GRID_ALL), null, 'ил багцтай хүн «Бүх багц» мөрд гарахгүй');
assert.equal(cellHolds(eng, 'engineer', P1), 'pkg');
assert.equal(cellHolds(eng, 'manager', P1), null, 'өөр шатны баганад гарахгүй');

/* ── 4. Өөр шат → ШИЛЖҮҮЛЭХ (нэг аккаунт нэг шатанд), хуучин багц арилна ── */
assert.deepEqual(planCellAdd(eng, 'director', P3), { kind: 'move', from: 'engineer', stage: 'director', bagts: [P3] });
assert.deepEqual(planCellAdd(all, 'company', GRID_ALL), { kind: 'move', from: 'manager', stage: 'company', bagts: [GRID_ALL] });

/* ── 5. Хасах: үлдэх багцтай → set; сүүлийн багц → drop (fail-closed, «бүх багц» руу БУЦАХГҮЙ) ── */
const two = { stage: 'engineer', bagts: [P1, P2] };
assert.deepEqual(planCellRemove(two, 'engineer', P1, PK), { kind: 'set', stage: 'engineer', bagts: [P2] });
assert.deepEqual(planCellRemove(eng, 'engineer', P1, PK), { kind: 'drop', stage: 'engineer' });
assert.deepEqual(planCellRemove(eng, 'engineer', P2, PK), { kind: 'none' }, 'хамаараагүй нүд');
assert.deepEqual(planCellRemove(eng, 'manager', P1, PK), { kind: 'none' }, 'өөр шатны нүд');
assert.deepEqual(planCellRemove(null, 'engineer', P1, PK), { kind: 'none' });

/* ── 6. «Бүх багц»-ыг нэг мөрөөс хасах → бусад бүх багцын ИЛ жагсаалт (асууна) ── */
assert.deepEqual(planCellRemove(all, 'manager', P2, PK), { kind: 'narrow', stage: 'manager', bagts: [P1, P3] });
assert.deepEqual(planCellRemove({ stage: 'manager', bagts: [GRID_ALL] }, 'manager', P1, [P1]), { kind: 'drop', stage: 'manager' },
  'ганц багцтай төсөлд ALL → хоосон биш, бүхэлд нь хасна');
/* «Бүх багц» мөрнөөс хасах → томилгоог бүхэлд нь (хоосон жагсаалт гэж байхгүй) */
assert.deepEqual(planCellRemove(all, 'manager', GRID_ALL, PK), { kind: 'drop', stage: 'manager' });
assert.deepEqual(planCellRemove(eng, 'engineer', GRID_ALL, PK), { kind: 'none' });

/* ── 7. GRID_ALL = guitsetgelAcl.ALL_BAGTS ── */
/* ⚠️ Модулийг импортлохгүй (window/ArcGIS шаардана) — эх кодоос уншина */
const m = fs.readFileSync('src/lib/guitsetgelAcl.ts', 'utf8').match(/export const ALL_BAGTS = '([^']*)'/);
assert.ok(m, 'ALL_BAGTS олдсонгүй');
assert.equal(GRID_ALL, m[1], 'GRID_ALL нь ALL_BAGTS-тай ижил байх ёстой');

console.log('guitsetgelGrid.check: ok');
