/**
 * «ТУХ» ХАРАГДАЦЫН ЦЭВЭР ДҮРМИЙН ШАЛГУУР — сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/tuhData.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. `null` → 0 ДАРАГДАХ — хэмжигдээгүй гүйцэтгэл/төлөвлөгөө «0%» болж, «Эхлээгүй»,
 *      «SPI 0» гэсэн ХУДАЛ дүгнэлт гарна.
 *   2. БҮЛЭГ БУРУУ — диапазон мөр («БАГЦ 1- 4») орон сууцны багцад наалдах, зураг
 *      төслийн мөр барилгын гэрээтэй нийлж мөнгө холилдох.
 *   3. «Зогссон» төлөв ЭХ СУРВАЛЖГҮЙ атлаа оноогдох.
 *   4. Гэрээний сарын төлөвлөгөөний хуримтлал 100%-иас давах / ирээдүйн сарыг тоолох.
 *   5. Хуваарийн бүлгийн муж ӨӨРИЙН огноогоор (дэд ажлуудын MIN/MAX биш) бодогдох.
 */
import assert from 'node:assert/strict';
import {
  groupOf, statusOf, buildTuhPkgs, progressOf, cfPlanPctAt, weekDelta, earned,
  rowSpan, commissionOf, milestonesOf, resourcesOf, daysBetween, elapsedPct,
} from './tuhData.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

const CR = (o) => ({
  OBJECTID: o.oid, bagts: o.pkg, bagts_tuvshin1: o.code ?? '2',
  ajil_tuvshin1: o.t1 ?? '', ajil_tuvshin2: o.t2 ?? '', ajil_tuvshin3: o.t3 ?? '',
  ajil_uilchilgee: o.name ?? '', ho_dun_geree: o.cost ?? null, ho_dungiin_tailbar: o.note ?? '',
  guitsetgegch: o.contractor ?? '', guitsetgel_huvi: o.prog ?? null,
  ehleh_ognoo: o.start ?? null, duusah_ognoo: o.end ?? null, Cashflow_ID: o.cf ?? null,
});

console.log('\n1. Бүлэг');
ok('ТЭЗҮ (код 1) → зураг төсөл', () => assert.equal(groupOf(CR({ oid: 1, pkg: 'Багц 7.1', code: '1' })), 'design'));
ok('бондын хүү (код 7) → орохгүй', () => assert.equal(groupOf(CR({ oid: 78, pkg: '', code: '7' })), null));
ok('газар чөлөөлөлт (код 6) → бусад', () => assert.equal(groupOf(CR({ oid: 74, pkg: '', code: '6' })), 'other'));
ok('орон сууцны 7 багц → housing', () => assert.equal(groupOf(CR({ oid: 11, pkg: 'БАГЦ-1', t2: 'ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт' })), 'housing'));
ok('«БАГЦ 1- 4» диапазон → бусад (орон сууцанд наалдахгүй)', () =>
  assert.equal(groupOf(CR({ oid: 18, pkg: 'БАГЦ 1- 4', t2: 'ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт' })), 'other'));
ok('гадна тохижилт → external', () => assert.equal(groupOf(CR({ oid: 19, pkg: 'БАГЦ-16.1', t2: 'ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ - Барилга угсралт' })), 'external'));
ok('нийгмийн (код 5) → social', () => assert.equal(groupOf(CR({ oid: 60, pkg: 'БАГЦ - 19.1', code: '5' })), 'social'));
ok('цахилгаан холбооны 3-р түвшин → energy', () =>
  assert.equal(groupOf(CR({ oid: 43, pkg: 'БАГЦ-6.10', t2: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт', t3: 'Гадна цахилгаан холбоо' })), 'energy'));
ok('ус хангамжийн эх үүсвэр (гэр бүл src) → networks, дулаан биш', () =>
  assert.equal(groupOf(CR({ oid: 52, pkg: 'БАГЦ-10', t2: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт', t3: 'Инженерийн дэд бүтэц, эх үүсвэр', name: 'Гадна усан хангамж эх үүсвэрийн дамжуулах шугам' })), 'networks'));
ok('дулааны станц → heat', () =>
  assert.equal(groupOf(CR({ oid: 51, pkg: 'БАГЦ -9', t2: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт', t3: 'Инженерийн дэд бүтэц, эх үүсвэр', name: 'Дамбадаржаа дулааны станцаас өргөтгөх' })), 'heat'));

console.log('\n2. Төлөв');
ok('гэрээлээгүй', () => assert.equal(statusOf({ contracted: false, progress: 50, gap: 0 }), 'none'));
ok('дууссан', () => assert.equal(statusOf({ contracted: true, progress: 100, gap: 20 }), 'done'));
ok('хэмжигдээгүй → эхлээгүй (0 гэж таамаглахгүй, гэхдээ «явж байна» ч биш)', () =>
  assert.equal(statusOf({ contracted: true, progress: null, gap: null }), 'todo'));
ok('≥ 5 pp хоцорсон', () => assert.equal(statusOf({ contracted: true, progress: 20, gap: 5 }), 'late'));
ok('< 5 pp — хийгдэж байна', () => assert.equal(statusOf({ contracted: true, progress: 20, gap: 4.9 }), 'run'));
ok('«Зогссон» ХЭЗЭЭ Ч оноогдохгүй', () => {
  for (const c of [true, false]) for (const p of [null, 0, 10, 100]) for (const g of [null, 0, 50]) {
    assert.notEqual(statusOf({ contracted: c, progress: p, gap: g }), 'stopped');
  }
});

console.log('\n3. Багц угсрах');
const rows = [
  CR({ oid: 1, pkg: 'Багц 7.1', code: '1', cost: 5e8, note: 'Гэрээлсэн дүн' }),
  CR({ oid: 56, pkg: 'БАГЦ-7.1', t2: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт', t3: 'Инженерийн бэлтгэл ажил', cost: 22.9e9, note: 'Гэрээлсэн дүн', prog: 0 }),
  CR({ oid: 11, pkg: 'БАГЦ-1', t2: 'ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт', cost: 373e9, note: 'Гэрээлсэн дүн', start: 1, end: 100, cf: 7 }),
  CR({ oid: 18, pkg: 'БАГЦ 1- 4', t2: 'ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт', cost: 82e9, note: 'Урьдчилсан дүн' }),
  CR({ oid: 34, pkg: 'БАГЦ-6.1', t2: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт', t3: 'Гадна цахилгаан холбоо', cost: 4e9, prog: 20, note: 'Гэрээлсэн дүн' }),
  CR({ oid: 99, pkg: 'БАГЦ-6.1', t2: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт', t3: 'Гадна цахилгаан холбоо', cost: 1e9, prog: null, note: '' }),
  CR({ oid: 78, pkg: '', code: '7' }),
];
const pk = buildTuhPkgs(rows, 'Гэрээлсэн дүн');
ok('бонд хасагдана', () => assert.ok(!pk.some((p) => p.rows.some((r) => r.OBJECTID === 78))));
ok('ТЭЗҮ ба барилгын 7.1 ТУСДАА (мөнгө холилдохгүй)', () => {
  const d = pk.find((p) => p.group === 'design');
  const b = pk.find((p) => p.pkgKey === 'БАГЦ71' && p.group !== 'design');
  assert.ok(d && b && d.key !== b.key);
  assert.equal(d.cost, 5e8);
});
ok('диапазон мөр БАГЦ1-д наалдахгүй', () => {
  const h = pk.find((p) => p.key === 'БАГЦ1');
  assert.equal(h.rows.length, 1);
  assert.equal(h.cost, 373e9);
});
ok('ижил багцын хоёр гэрээ нийлнэ, гэрээлсэн нэг нь байхад contracted', () => {
  const e = pk.find((p) => p.pkgKey === 'БАГЦ61');
  assert.equal(e.rows.length, 2);
  assert.equal(e.cost, 5e9);
  assert.equal(e.contracted, true);
});
ok('гүйцэтгэл дүнгээр жигнэнэ, хоосон мөр жинд орохгүй', () => {
  const e = pk.find((p) => p.pkgKey === 'БАГЦ61');
  assert.equal(progressOf(e, null), 20);
});
ok('орон сууц — бөглөх хуудасны гүйцэтгэл; байхгүй бол null', () => {
  const h = pk.find((p) => p.key === 'БАГЦ1');
  assert.equal(progressOf(h, new Map([['БАГЦ1', 26.85]])), 26.85);
  assert.equal(progressOf(h, new Map()), null);
  assert.equal(progressOf(h, null), null);
});

console.log('\n4. Гэрээний сарын төлөвлөгөө');
const M = (id, y, m, p) => ({ id, start: Date.UTC(y, m - 1, 1), pct: p, amount: null });
const plan = [M(7, 2026, 1, 10), M(7, 2026, 2, 20), M(7, 2026, 3, 30), M(7, 2026, 4, 40), M(8, 2026, 1, null)];
ok('ym хүртэлх хуримтлал', () => assert.equal(cfPlanPctAt(plan, [{ id: 7, cost: 1 }], '2026-02'), 30));
ok('ирээдүйн сар тоологдохгүй', () => assert.equal(cfPlanPctAt(plan, [{ id: 7, cost: 1 }], '2025-12'), 0));
ok('100%-иас давахгүй', () => assert.equal(cfPlanPctAt([...plan, M(7, 2026, 5, 50)], [{ id: 7, cost: 1 }], '2027-01'), 100));
ok('сарын мөргүй гэрээ → null (0 биш)', () => assert.equal(cfPlanPctAt(plan, [{ id: 8, cost: 1 }], '2026-12'), null));
ok('олон гэрээ дүнгээр жигнэнэ', () => {
  const p2 = [...plan, M(9, 2026, 1, 100)];
  assert.equal(cfPlanPctAt(p2, [{ id: 7, cost: 1 }, { id: 9, cost: 3 }], '2026-01'), (10 + 300) / 4);
});

console.log('\n5. 7 хоногийн ахиц');
const ser = [{ label: '2026-09-01', overall: 10 }, { label: '2026-09-20', overall: 12 }, { label: '2026-09-28', overall: 15 }];
ok('өнөөдөр − 7 хоногийн өмнөх', () => assert.equal(weekDelta(ser, '2026-09-30'), 3));
ok('7 хоногийн өмнө хэмжилт алга → null', () => assert.equal(weekDelta(ser.slice(1), '2026-09-22'), null));
ok('хоосон цуваа → null', () => assert.equal(weekDelta([], '2026-09-30'), null));

console.log('\n6. EV · PV · SPI');
ok('EV/PV/SPI', () => {
  const e = earned(1000, 25, 50, 40);
  assert.equal(e.ev, 250);
  assert.equal(e.pvContract, 500);
  assert.equal(e.pvContractor, 400);
  assert.equal(e.svContract, -250);
  assert.equal(e.spiContract, 0.5);
  assert.equal(e.spiContractor, 0.625);
});
ok('PV = 0 → SPI null (∞ биш)', () => assert.equal(earned(1000, 10, 0, null).spiContract, null));
ok('гүйцэтгэл null → EV null', () => assert.equal(earned(1000, null, 50, 50).ev, null));

console.log('\n7. Хуваарь');
const d = (s) => Date.UTC(2026, 0, 1) + s * 86_400_000;
const R = (work, depth, group, starts, ends, act = [], extra = {}) => ({ work, depth, group, start: starts, end: ends, act, hun: null, mashin: null, ...extra });
const sheet = [
  R('Барилга угсралт', 0, true, [d(0)], [d(1)]),
  R('Суурь', 1, false, [d(10), d(12)], [d(40), d(45)], [0.5, 1]),
  R('Дээвэр', 1, false, [d(50)], [d(90)], [null], { hun: 12, mashin: 3 }),
  R('Улсын комисс', 0, false, [d(100), d(100)], [d(120), d(130)], [], { hun: 2 }),
];
ok('бүлгийн муж = дэд ажлуудын MIN/MAX (өөрийн огноо биш)', () => assert.deepEqual(rowSpan(sheet, 0), { start: d(10), end: d(90) }));
ok('улсын комисс = хамгийн хожуу блок', () => assert.equal(commissionOf(sheet), d(130)));
ok('комиссын мөргүй → null', () => assert.equal(commissionOf(sheet.slice(0, 3)), null));
ok('гол үе шат = дээд түвшний мөрүүд', () => assert.deepEqual(milestonesOf(sheet).map((x) => x.name), ['Барилга угсралт', 'Улсын комисс']));
ok('хүн/техник — навч мөрүүдийн нийлбэр; бүгд хоосон бол null', () => {
  assert.deepEqual(resourcesOf(sheet), { hun: 14, mashin: 3 });
  assert.deepEqual(resourcesOf(sheet.slice(0, 2)), { hun: null, mashin: null });
});

console.log('\n8. Огноо');
ok('хоногийн зөрүү', () => assert.equal(daysBetween(d(0), d(10)), 10));
ok('null огноо → null', () => assert.equal(daysBetween(null, d(1)), null));
ok('өнгөрсөн хувь 0–100-д хавчигдана', () => {
  assert.equal(elapsedPct(d(0), d(100), d(50)), 50);
  assert.equal(elapsedPct(d(0), d(100), d(200)), 100);
  assert.equal(elapsedPct(null, d(100), d(50)), null);
});

console.log(`\ntuhData: ${n} шалгуур ✅`);
