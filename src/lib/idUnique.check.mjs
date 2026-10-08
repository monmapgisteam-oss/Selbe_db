/**
 * MAX+1 ДУГААРЫН ДАВХАРДЛЫН ТУСЛАХ — сүлжээгүй (2026-10-04).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/idUnique.check.mjs
 *
 * Хамгаалж буй дүрэм: бичсэний дараа ӨӨРИЙН оноосон дугаар ӨӨР мөрд бас байвал илэрнэ;
 * шинэ дугаар нь бүх мөрийн max + 1-ээс дараалан; өөрийн мөрүүд (ажил + сар) хоорондоо
 * ижил дугаартай байх нь давхардал БИШ. Хэрэглэгчид: `Finance.publish` (`Cashflow_ID`),
 * `hyanalt.ensureUniqueId` (`Бүртгэлийн_дугаар`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collidedIds, collidesBelow, idNum, renumberPlan } from './idUnique.ts';

/* idNum */
assert.equal(idNum('G-000123'), 123);
assert.equal(idNum(7), 7);
assert.equal(idNum(null), null);
assert.equal(idNum(''), null);
assert.equal(idNum(0), null);

/* Хоёр хэрэглэгч ижил max+1 (=11) авсан: бид oid 100 (ажил) + 101 (сар), тэд oid 90 */
const rows = [
  { oid: 1, id: 10 }, { oid: 90, id: 11 }, { oid: 91, id: 11 },
  { oid: 100, id: 11 }, { oid: 101, id: 11 }, { oid: 102, id: 12 }, { oid: 5, id: null },
];
const mine = new Set([100, 101, 102]);
assert.deepEqual(collidedIds(rows, mine, [11, 12]), [11], 'зөвхөн 11 давхцсан');
assert.deepEqual(collidedIds(rows, new Set([90, 91]), [11]), [11], 'нөгөө тал ч илрүүлнэ');
assert.deepEqual(collidedIds(rows, new Set([1, 90, 91, 100, 101, 102]), [10, 11, 12]), [], 'бүгд минийх — давхардал биш');
assert.deepEqual(collidedIds(rows, mine, []), [], 'оноогоогүй бол шалгахгүй');

const plan = renumberPlan(rows, [11]);
assert.equal(plan.get(11), 13, 'max(12)+1');
assert.deepEqual([...renumberPlan(rows, [11, 12], [20]).entries()], [[11, 21], [12, 22]], 'extra-г ч тооцно, дараалан');
/* ⚠️ 2026-10-05: тэнцүүлэгч — зөвхөн ИХ OBJECTID-тай тал шилжинэ (хоёулаа шилжвэл дахин давхцана) */
{
  const two = [{ oid: 1, id: 4 }, { oid: 10, id: 5 }, { oid: 11, id: 5 }];
  assert.equal(collidesBelow(two, 10, 5), false, 'түрүүлж бичигдсэн мөр дугаараа хадгална');
  assert.equal(collidesBelow(two, 11, 5), true, 'хожуу мөр шилжинэ');
  assert.equal(collidesBelow(two, 1, 4), false, 'давхардалгүй');
  assert.equal(collidesBelow([{ oid: 10, id: 5 }], 10, 5), false, 'өөрийн мөр давхардал биш');
}
console.log('✅ idUnique: илрүүлэлт · дахин дугаарлалт · тэнцүүлэгч');

/* Эх код: бичсэний дараах шалгалт холбогдсон */
const fin = readFileSync(new URL('../modules/Finance.tsx', import.meta.url), 'utf8');
assert.ok(/collidedIds\(idRows, mine, cfAssigned\)/.test(fin), 'Finance.publish: Cashflow_ID-ийн бичсэний дараах шалгалт алга');
const hy = readFileSync(new URL('./hyanalt.ts', import.meta.url), 'utf8');
assert.ok(hy.includes("collidesBelow(idRows, oid, cur)"), 'hyanalt.ensureUniqueId: тэнцүүлэгч (бага OBJECTID ялна) алга');
const sub = readFileSync(new URL('./hyanaltSubmit.ts', import.meta.url), 'utf8');
assert.ok(sub.includes('ensureUniqueId(addedOid(res), id)'), 'hyanaltSubmit: дугаарын шалгалт алга');
const store = readFileSync(new URL('./hyanaltStore.ts', import.meta.url), 'utf8');
assert.ok(store.includes('ensureUniqueId(addedOid(res)'), 'hyanaltStore.recheck: дугаарын шалгалт алга');
console.log('✅ idUnique: Finance · hyanaltSubmit · hyanaltStore холбогдсон');

/* ── 2026-10-09: sweepDupIds ↔ ensureUniqueId — нэг дараалал, ачаалалт дууссаны дараа ── */
{
  const hy2 = readFileSync('src/lib/hyanalt.ts', 'utf8');
  assert.ok(hy2.includes('return withIdLock(() => ensureUniqueIdLocked(oid, id, n));'), 'ensureUniqueId нь withIdLock-оор явах ёстой');
  assert.ok(hy2.includes('void withIdLock(() => sweepDupIds())'), 'sweepDupIds нь withIdLock-оор явах ёстой');
  assert.ok(hy2.includes('const plan = dupIdPlan(idRowsOf(await queryAll()));'), 'цэвэрлэгээ дараалал дотор ШИНЭЭР уншина');
  console.log('✅ idUnique: цэвэрлэгээ ба ensureUniqueId зэрэг явахгүй');
}
