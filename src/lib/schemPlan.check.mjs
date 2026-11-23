/**
 * СХЕМИЙН ҮЕ ШАТНЫ ЯВЦ — `planLiveOf` · `phaseOf` · `paceHealth` (2026-11-23).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/schemPlan.check.mjs
 *
 * Хамгаалах алдаа:
 *  1. Схемийн хувь «Төсөл төлөвлөгөө биелэлт»-ийн үе шатны мөрөөс өөр мөрөөс авагдах (багцын доод мөр г.м.).
 *  2. Хэмжилтгүй үе шат 0% болж харагдах — `null` хэвээр байх ёстой.
 *  3. Зураг төслийн багцын хувь «Зургийн бүртгэл»-ээс (`zuragPkg`) биш хадгалсан утгаас авагдах.
 */

import assert from 'node:assert/strict';
import { planLiveOf, phaseOf, paceHealth, PACE } from './schemPlan.ts';
import { bagtsKey } from './services.ts';

/* Жижиг мод: үндэс → [ТЭЗҮ, Сонгон → (Багц 1 → блок), Барилга → Багц 1] */
const node = (code, phase, depth, pkg = null, children = []) => {
  const n = { code, phase, depth, pkg, children, parent: null, row: {} };
  for (const c of children) c.parent = n;
  return n;
};
const blk = node('3.1.1', 'songon', 3, 'Багц 1');
const son1 = node('3.1', 'songon', 2, 'Багц 1', [blk]);
const son = node('3', 'songon', 1, null, [son1]);
const tezu = node('1', 'tezu', 1);
const bar1 = node('5.1', 'barilga', 2, 'Багц-1');
const bar = node('5', 'barilga', 1, null, [bar1]);
const junk = node('3.9', 'songon', 2, 'Бүх багц');
son.children.push(junk); junk.parent = son;
const root = node('', 'other', 0, null, [tezu, son, bar]);
const V = new Map([
  [root, { P: 40, S: 35, E: 1000 }],
  [tezu, { P: 100, S: 100, E: 10 }],
  [son, { P: 80, S: 50, E: null }],
  [son1, { P: 100, S: 90, E: null }],
  [blk, { P: 100, S: 0, E: null }],
  [bar, { P: 30, S: NaN, E: 900 }],
  [bar1, { P: 30, S: 20, E: 900 }],
]);
const plan = {
  tree: { root, nodes: [tezu, son, son1, blk, junk, bar, bar1] },
  result: { values: V },
  zuragPkg: new Map([[bagtsKey('Багц 1'), 42]]),
};

const live = planLiveOf(plan);
assert.deepEqual(live.total, { P: 40, S: 35, E: 1000 }, 'Төслийн нийт мөр');
assert.deepEqual(live.phases.tezu, { P: 100, S: 100, E: 10 }, 'үе шатны 1-р түвшний мөр');
assert.equal(live.phases.barilga.S, null, 'NaN → null (0 БИШ)');
assert.equal(live.phases.zurag, undefined, 'байхгүй үе шат зохиогдсон');

const k1 = bagtsKey('Багц 1');
assert.equal(bagtsKey('Багц-1'), k1, 'бичиглэлийн зөрүү нэг түлхүүр');
assert.equal(live.byPkg[k1].songon.S, 90, 'багцын ДЭЭД мөр (блок биш)');
assert.equal(live.byPkg[k1].barilga.S, 20, '«Багц-1» бичиглэл нэг багцад');
assert.deepEqual(Object.keys(live.byPkg), [k1], '«Бүх багц» багц биш');
assert.deepEqual(live.byPkg[k1].zurag, { P: null, S: 42, E: null }, 'зураг төсөл «Зургийн бүртгэл»-ээс');

assert.equal(phaseOf(live, 'songon', null).S, 50, 'багцгүй бол төслийн нийт');
assert.equal(phaseOf(live, 'songon', 'БАГЦ 1').S, 90, 'багцаар');
assert.equal(phaseOf(live, 'tezu', 'Багц 1'), null, 'багцад үе шат алга бол null');
assert.equal(phaseOf(null, 'tezu', null), null, 'эх алга бол null');

/* Хоцролт */
assert.equal(paceHealth(null), 'none');
assert.equal(paceHealth({ P: 50, S: null, E: null }), 'none', 'хэмжилтгүй нь none — улаан БИШ');
assert.equal(paceHealth({ P: 50, S: 50 - PACE.warn + 0.01, E: null }), 'good');
assert.equal(paceHealth({ P: 50, S: 50 - PACE.warn, E: null }), 'warn', 'босго дээр warn');
assert.equal(paceHealth({ P: 50, S: 50 - PACE.bad, E: null }), 'bad', 'босго дээр bad');
assert.equal(paceHealth({ P: 0, S: 0, E: null }), 'good', 'эхлээгүй байх ёстой ажил хоцроогүй');
assert.equal(paceHealth({ P: 20, S: 60, E: null }), 'good', 'түрүүлсэн нь хэвийн');

console.log('schemPlan.check: ok — үе шат ✓ багц ✓ зураг ✓ null≠0 ✓ хоцролт ✓');
