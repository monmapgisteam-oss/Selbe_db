/**
 * «БАГЦ × ҮҮРЭГ» ХҮСНЭГТИЙН НҮДНИЙ ДҮРЭМ — цэвэр функц (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/aclGrid.check.mjs
 *
 * ⚠️ Хадгалалт аккаунтаар (grant/жагсаалт) хэвээр тул нүдний нэмэх/хасах бүр
 *    аккаунтын мөрийн өөрчлөлт болно. Эндээс алдвал: бусад үүргийн багцыг
 *    хөндөх, «бүх багц»-ыг нэг багц руу хумих, сүүлийн багцыг хасахад «бүх
 *    багц» руу тэлэх (fail-open) зэрэг чимээгүй эрхийн алдаа гарна.
 */
import assert from 'node:assert/strict';
import {
  GRID_ALL, grantHolds, listHolds, planGrantAdd, planGrantRemove, planListAdd, planListRemove,
} from './aclGrid.ts';

const PK = ['Багц 1', 'Багц 2', 'Багц 3.1'];
const [P1, P2, P3] = PK;

/* ══════════ A. Үүрэгтэй grant (Хуваарь · Обьём · Нэмэлт ажил · Чанар · Дэд бүтэц) ══════════ */

/* ── 1. Шинэ аккаунт → зөвхөн энэ үүрэг, энэ багцаар ── */
assert.deepEqual(planGrantAdd(null, 'author', P2), { kind: 'create', grants: [{ role: 'author', bagts: [P2] }] });
assert.deepEqual(planGrantAdd(undefined, 'approver', P1), { kind: 'create', grants: [{ role: 'approver', bagts: [P1] }] });

/* ── 2. Байгаа мөр → ЗӨВХӨН тухайн үүргийн grant; бусад үүрэг хэвээр ── */
const mixed = [{ role: 'author', bagts: [P1] }, { role: 'approver', bagts: [P3] }];
assert.deepEqual(planGrantAdd(mixed, 'author', P2), {
  kind: 'set', roleGone: false, grants: [{ role: 'author', bagts: [P1, P2] }, { role: 'approver', bagts: [P3] }],
});
/* шинэ үүрэг — grant нэмэгдэнэ */
assert.deepEqual(planGrantAdd([{ role: 'author', bagts: [P1] }], 'approver', P2), {
  kind: 'set', roleGone: false, grants: [{ role: 'author', bagts: [P1] }, { role: 'approver', bagts: [P2] }],
});
assert.deepEqual(planGrantAdd(mixed, 'author', P1), { kind: 'none' }, 'аль хэдийн байгаа');
/* ⚠️ эх объектыг өөрчлөхгүй */
assert.deepEqual(mixed, [{ role: 'author', bagts: [P1] }, { role: 'approver', bagts: [P3] }]);

/* ── 3. «Бүх багц» — бүх мөрийг хамарна, дахин нэмбэл ХУМИГДАНА тул none ── */
const all = [{ role: 'approver', bagts: [GRID_ALL] }, { role: 'author', bagts: [P1] }];
assert.equal(grantHolds(all, 'approver', P2), 'all');
assert.equal(grantHolds(all, 'approver', P3), 'all');
assert.equal(grantHolds(all, 'author', P1), 'pkg');
assert.equal(grantHolds(all, 'author', P2), null, 'өөр багцын мөрд гарахгүй');
assert.equal(grantHolds(mixed, 'tuh', P1), null, 'үүрэггүй баганад гарахгүй');
assert.equal(grantHolds(null, 'author', P1), null);
assert.deepEqual(planGrantAdd(all, 'approver', P3), { kind: 'none' });

/* ── 4. Хасах: үлдэх багцтай → set; үүрэг унаж бусад үлдвэл roleGone ── */
const two = [{ role: 'author', bagts: [P1, P2] }, { role: 'approver', bagts: [P3] }];
assert.deepEqual(planGrantRemove(two, 'author', P1, PK), {
  kind: 'set', roleGone: false, grants: [{ role: 'author', bagts: [P2] }, { role: 'approver', bagts: [P3] }],
});
assert.deepEqual(planGrantRemove(two, 'approver', P3, PK), {
  kind: 'set', roleGone: true, grants: [{ role: 'author', bagts: [P1, P2] }],
}, 'багцгүй үлдсэн grant өөрөө унана');
assert.deepEqual(planGrantRemove(two, 'approver', P1, PK), { kind: 'none' }, 'хамаараагүй нүд');
assert.deepEqual(planGrantRemove(two, 'tuh', P1, PK), { kind: 'none' }, 'үүрэггүй');
assert.deepEqual(planGrantRemove(null, 'author', P1, PK), { kind: 'none' });

/* ── 5. Сүүлийн багц → мөр бүхэлдээ (drop) — «бүх багц» руу БУЦАХГҮЙ ── */
assert.deepEqual(planGrantRemove([{ role: 'editor', bagts: [P2] }], 'editor', P2, PK), { kind: 'drop' });

/* ── 6. «Бүх багц»-ыг НЭГ мөрөөс хасах → бусад багцын ИЛ жагсаалт (narrow) ── */
assert.deepEqual(planGrantRemove(all, 'approver', P2, PK), {
  kind: 'narrow', left: [P1, P3], grants: [{ role: 'approver', bagts: [P1, P3] }, { role: 'author', bagts: [P1] }],
});
assert.deepEqual(planGrantRemove([{ role: 'editor', bagts: [GRID_ALL] }], 'editor', P1, [P1]), { kind: 'drop' },
  'ганц багцтай олонлогт ALL → хоосон биш, бүхэлд нь хасна');
/* ALL-тай үүрэг ганц багцтай олонлогт унаад бусад үүрэг үлдвэл set + roleGone */
assert.deepEqual(planGrantRemove(all, 'approver', P1, [P1]), {
  kind: 'set', roleGone: true, grants: [{ role: 'author', bagts: [P1] }],
});

/* ══════════ B. Жагсаалт (QAQC — үүрэггүй) ══════════ */
assert.deepEqual(planListAdd(null, P1), { kind: 'create', bagts: [P1] }, 'шинэ аккаунт');
assert.deepEqual(planListAdd([P1], P2), { kind: 'set', bagts: [P1, P2] }, 'байгаа мөрд нэмэх');
assert.deepEqual(planListAdd([P1], P1), { kind: 'none' });
assert.deepEqual(planListAdd([GRID_ALL], P2), { kind: 'none' }, 'ALL хамарсан');
assert.equal(listHolds([GRID_ALL], P3), 'all');
assert.equal(listHolds([P1], P3), null);
assert.equal(listHolds([], P1), null);
assert.deepEqual(planListRemove([P1, P2], P1, PK), { kind: 'set', bagts: [P2] });
assert.deepEqual(planListRemove([P1], P1, PK), { kind: 'drop' }, 'сүүлийн багц → drop');
assert.deepEqual(planListRemove([GRID_ALL], P2, PK), { kind: 'narrow', bagts: [P1, P3] }, 'ALL → ил жагсаалт');
assert.deepEqual(planListRemove([P1], P2, PK), { kind: 'none' });
assert.deepEqual(planListRemove(null, P2, PK), { kind: 'none' });

/* ══════════ C. GRID_ALL = scopedAcl/qaqcAcl ALL_BAGTS · guitsetgelGrid GRID_ALL ══════════ */
/* ⚠️ 2026-10-09: ЭХ ТЕКСТИЙГ regex-ээр уншихын оронд ЖИНХЭНЭ модулийг импортлоно — урьд нь
   «window/ArcGIS шаардана» гэж үзэж байсан ч гурвуулаа Node-д (ts-alias loader) импортлогддог.
   Regex-ийн 2-р хувилбар (`export { … ALL_BAGTS … }` дахин экспорт) утгыг ОГТ тулгалгүй
   давуулдаг байв — одоо БОДИТ утгыг тулгана. */
for (const [f, name] of [['@/lib/scopedAcl', 'ALL_BAGTS'], ['@/lib/qaqcAcl', 'ALL_BAGTS'], ['@/lib/guitsetgelGrid', 'GRID_ALL']]) {
  const m = await import(f);
  assert.equal(typeof m[name], 'string', `${f}: ${name} экспорт олдсонгүй`);
  assert.equal(GRID_ALL, m[name], `${f}: GRID_ALL нь ${name}-тай ижил байх ёстой`);
}
/* Хэрэглээний тулгалт: тэр утгатай жагсаалт/grant нь ҮНЭХЭЭР «бүх багц» гэж уншигдана */
{
  const { ALL_BAGTS } = await import('@/lib/scopedAcl');
  assert.equal(listHolds([ALL_BAGTS], P2), 'all', 'scopedAcl.ALL_BAGTS → бүх багц');
  assert.equal(grantHolds([{ role: 'author', bagts: [ALL_BAGTS] }], 'author', P3), 'all');
}

console.log('aclGrid.check: ok');
