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
 *   6. (2026-09-30) 7 хоногийн ахиц ХУВЬСАХ хуваагчтай (шинэ блок → сөрөг), гэрээний
 *      төлөвлөгөө сарыг БҮТНЭЭР тоолох, IPC-ийн хувь дүнгүй гэрээний олголтоор хөөрөгдөх,
 *      AUTO мөр «сүүлд олгосон» огноо болох, нэг гэрээ хоёр ТУХ мөрд наалдах, хагас
 *      уншигдсан комиссын огноо, «0» багц, толгой мөрөөр гэрээний талбар унших.
 *   7. (2026-10-01, хэрэглэгч: бүгдийг зас) «багц 5.1»/«bagts 5.1» хайлт олдохгүй,
 *      зураг төсөл барилгын хувиар «Эхлээгүй», ТЭЗҮ гэрээ барилгын мөрд/хаана ч үгүй,
 *      хувьд ороогүй олголт нуугдах, «Хянагдаж буй IPC» хоосон, комиссын огноо хуучин
 *      агшнаас, хуудас дахин дахин татагдах, «2026» он хатуу, Back түүхгүй.
 */
/* ⚠️ Орон нутгийн сар (`monthKey`) — УБ-ын цагийн бүсэд шалгана (импортоос ӨМНӨ) */
process.env.TZ = 'Asia/Ulaanbaatar';
import assert from 'node:assert/strict';
const {
  groupOf, statusOf, buildTuhPkgs, progressOf, cfPlanPctAt, weekDelta, earned,
  rowSpan, commissionOf, milestonesOf, resourcesOf, daysBetween, elapsedPct,
  ipcOf, keyOwners, assignHo, isDesignHo, mergeCommission, measDayOf, firstFilled,
  searchNorm, matchesSearch, lateFirst, designPctOf, rowProgress, pendingAutoOf,
  pickCommission, keyedCache, lastReportOf, reportAge, heatWinterYear, TUH_STATUS,
} = await import('./tuhData.ts');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };
/* Амлалт буцаадаг шалгуур — ЗААВАЛ `await` (эс бөгөөс уналт чимээгүй өнгөрнө) */
const okA = async (name, fn) => { await fn(); n += 1; console.log('  ✓', name); };

const CR = (o) => ({
  OBJECTID: o.oid, bagts: o.pkg, bagts_tuvshin1: o.code ?? '2',
  ajil_tuvshin1: o.t1 ?? '', ajil_tuvshin2: o.t2 ?? '', ajil_tuvshin3: o.t3 ?? '',
  ajil_uilchilgee: o.name ?? '', ho_dun_geree: o.cost ?? null, ho_dungiin_tailbar: o.note ?? '',
  guitsetgegch: o.contractor ?? '', guitsetgel_huvi: o.prog ?? null,
  ehleh_ognoo: o.start ?? null, duusah_ognoo: o.end ?? null, Cashflow_ID: o.cf ?? null,
  tezu: o.tezu ?? null, ajliin_zurag_tusul: o.az ?? null,
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
ok('⚠️ өдрөөр завсарлана — сарын 1-нд тэр сарын төлөвлөгөө БҮТНЭЭРЭЭ орохгүй', () => {
  /* 2026-03 (31 хоног): өмнөх нийлбэр 30 + 30 × 1/31 */
  assert.ok(Math.abs(cfPlanPctAt(plan, [{ id: 7, cost: 1 }], '2026-03-01') - (30 + 30 / 31)) < 1e-9);
  assert.equal(cfPlanPctAt(plan, [{ id: 7, cost: 1 }], '2026-03-31'), 60);
  /* `lagOf`-ийн «сарын эцэс» нөөц («-31» 30 хоногтой сард) — бүтэн сар */
  assert.equal(cfPlanPctAt(plan, [{ id: 7, cost: 1 }], '2026-04-31'), 100);
});
ok('⚠️ УБ-ын шөнө дундаар бичигдсэн сарын мөр ТЭР сард (UTC-ээр өмнөх сар биш)', () => {
  /* 2026-06-01 00:00 +08:00 = 2026-05-31T16:00Z */
  const ub = [{ id: 5, start: Date.UTC(2026, 4, 31, 16), pct: 40, amount: null }];
  assert.equal(cfPlanPctAt(ub, [{ id: 5, cost: 1 }], '2026-05'), 0, '5-р сард тоологдохгүй');
  assert.equal(cfPlanPctAt(ub, [{ id: 5, cost: 1 }], '2026-06'), 40);
  /* порталаас бичсэн UTC шөнө дунд ч мөн ТЭР сар */
  const utc = [{ id: 5, start: Date.UTC(2026, 5, 1), pct: 40, amount: null }];
  assert.equal(cfPlanPctAt(utc, [{ id: 5, cost: 1 }], '2026-05'), 0);
  assert.equal(cfPlanPctAt(utc, [{ id: 5, cost: 1 }], '2026-06'), 40);
});

console.log('\n5. 7 хоногийн ахиц (картын гүйцэтгэлтэй нэг тодорхойлолт)');
const H = (o) => new Map(Object.entries(o));
ok('өнөөдөр − 7 хоногийн өмнөх', () => {
  const h = H({ 'Багц 1|5/1': [{ date: '2026-09-01', pct: 10 }, { date: '2026-09-20', pct: 12 }, { date: '2026-09-28', pct: 15 }] });
  assert.equal(weekDelta(h, 'БАГЦ1', '2026-09-30'), 3);
});
ok('⚠️ шинэ блок анх тайлагнахад СӨРӨГ гарахгүй (тогтмол хуваагч)', () => {
  /* Урьд: 7 хоногийн өмнө [50] → 50, өнөөдөр [50, 10] → 30 ⇒ −20 pp (ХУДАЛ).
     Одоо: хуваагч 2 — өмнө (50 + 0)/2 = 25, өнөөдөр (50 + 10)/2 = 30 ⇒ +5 pp. */
  const h = H({
    'Багц 1|5/1': [{ date: '2026-09-01', pct: 50 }],
    'Багц 1|5/2': [{ date: '2026-09-28', pct: 10 }],
  });
  assert.equal(weekDelta(h, 'БАГЦ1', '2026-09-30'), 5);
});
ok('блокийн нэр «5/1 барилга» = «5/1 блок» (buildPhys-ийн blockKey)', () => {
  const h = H({
    'Багц 1|5/1 барилга': [{ date: '2026-09-01', pct: 10 }],
    'Багц 1|5/1 блок': [{ date: '2026-09-28', pct: 20 }],
  });
  assert.equal(weekDelta(h, 'БАГЦ1', '2026-09-30'), 10);
});
ok('сүүлийн бичилт нь цэвэрлэгдсэн (null) блок хуваагчид орохгүй', () => {
  const h = H({
    'Багц 1|5/1': [{ date: '2026-09-01', pct: 10 }, { date: '2026-09-28', pct: 16 }],
    'Багц 1|5/2': [{ date: '2026-09-01', pct: 90 }, { date: '2026-09-27', pct: null }],
  });
  assert.equal(weekDelta(h, 'БАГЦ1', '2026-09-30'), 6);
});
ok('өөр багцын блок тоологдохгүй', () => {
  const h = H({
    'Багц 1|5/1': [{ date: '2026-09-01', pct: 10 }, { date: '2026-09-28', pct: 12 }],
    'Багц 2|5/1': [{ date: '2026-09-01', pct: 0 }, { date: '2026-09-28', pct: 90 }],
  });
  assert.equal(weekDelta(h, 'БАГЦ1', '2026-09-30'), 2);
});
ok('7 хоногийн өмнө хэмжилт алга → null (анхны тайлан «7 хоногийн ахиц» биш)', () => {
  const h = H({ 'Багц 1|5/1': [{ date: '2026-09-20', pct: 12 }, { date: '2026-09-28', pct: 15 }] });
  assert.equal(weekDelta(h, 'БАГЦ1', '2026-09-22'), null);
});
ok('ирээдүйн огноотой бичилт тоологдохгүй', () => {
  const h = H({ 'Багц 1|5/1': [{ date: '2026-09-01', pct: 10 }, { date: '2026-10-05', pct: 99 }] });
  assert.equal(weekDelta(h, 'БАГЦ1', '2026-09-30'), 0);
});
ok('⚠️ 2026-10-01: хуваагч = багцын БҮХ блок (`total`) — тайлагнаагүй блок 0%', () => {
  /* 4 блок, зөвхөн 5/1: өмнө 10, өнөөдөр 30 → (30 − 10) / 4 = 5 (урьд нь /1 = 20) */
  const h = H({ 'Багц 1|5/1': [{ date: '2026-09-01', pct: 10 }, { date: '2026-09-28', pct: 30 }] });
  assert.equal(weekDelta(h, 'БАГЦ1', '2026-09-30', 4), 5);
  assert.equal(weekDelta(h, 'БАГЦ1', '2026-09-30'), 20, 'хуваарь өгөөгүй бол утгатай блокоор (нөөц)');
});
ok('хоосон түүх / хоосон түлхүүр → null', () => {
  assert.equal(weekDelta(new Map(), 'БАГЦ1', '2026-09-30'), null);
  assert.equal(weekDelta(H({ 'Багц 1|5/1': [{ date: '2026-09-01', pct: 10 }] }), '', '2026-09-30'), null);
});

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

/*
 * 9. НЭГ ЭХ (2026-09-30, merge irgediin-hurteemj × bagtsiin-medeelel): ТУХ-ын орон
 *    сууцны багцын хувь ба сарын цэг нь «Гүйцэтгэл» · «Багцын мэдээлэл»-ийн
 *    жагсаалттай ИЖИЛ (`Finance.pkgMonthsMap` → `physLatest`). Хуучин хуулбар
 *    (`bagtsKey(pkg)` · `loadFillPkgProgress`) буцаж ирвэл нэг багц гурван дэлгэцэд
 *    өөр тоо харуулна.
 */
console.log('\n9. Бусад харагдацтай нэг эх');
{
  const { readFileSync } = await import('node:fs');
  const model = readFileSync(new URL('../modules/tuh/model.ts', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../modules/Tuh.tsx', import.meta.url), 'utf8');
  ok('model: сарын цэг pkgMonthsMap-аас', () => assert.ok(/const monthsBy = pkgMonthsMap\(fin\)/.test(model)));
  ok('model: орон сууцны хувь physLatest-ээс', () => assert.ok(/physLatest\(m\)/.test(model) && /progressOf\(p, actual\)/.test(model)));
  ok('ТУХ loadFillPkgProgress-ийг ачаалахгүй (блокийн жингүй дундаж — өөр хэмжигдэхүүн)',
    () => {
      /* тайлбарт нэр нь үлдэж болно — зөвхөн импорт/дуудлагыг шалгана */
      const used = (src) => /import[^;]*\bloadFillPkgProgress\b/.test(src) || /useAsync\(loadFillPkgProgress/.test(src);
      assert.ok(!used(view) && !used(model));
    });
}

console.log('\n10. IPC (2026-09-30)');
const HC = (o) => ({
  code: o.code ?? 'Багц-1', key: o.key ?? 'БАГЦ1', pkg: o.pkg ?? 'Багц-1', project: '', contractor: '',
  workType: o.workType ?? 'Барилга угсралт', contractNo: '', budgetTotal: null,
  contractTotal: o.total ?? null, saving: null, pays: o.pays ?? [], advanceTotal: null, workTotal: null,
  paidTotal: o.paid ?? null, paidPct: null,
});
const PAY = (dun, date, no = null) => ({ dun, guilgee_ognoo: date, ipc_dugaar: no, tulult_turul: 'Гүйцэтгэл' });
const ipcNos = (pays) => [...new Set(pays.map((r) => r.ipc_dugaar).filter((x) => x != null))].sort((a, b) => a - b);
ok('⚠️ хувь — гэрээт дүн тодорхой гэрээний олголт л (ipcTotals.paidContracted-тай нэг хүрээ)', () => {
  const x = ipcOf('БАГЦ1', [HC({ total: 100, paid: 40 }), HC({ code: 'Багц-1б', total: null, paid: 500 })], ipcNos);
  assert.equal(x.paid, 540, 'нийт олгосон — БҮХ гэрээ');
  assert.equal(x.contractTotal, 100);
  assert.equal(x.paidPct, 40, 'урьд нь 540 %');
  assert.equal(ipcOf('БАГЦ1', [HC({ total: null, paid: 70 })], ipcNos).paidPct, null, 'хуваарь алга → null');
});
ok('⚠️ «сүүлд олгосон» огноо — AUTO (дүнгүй) мөрийнх биш', () => {
  const x = ipcOf('БАГЦ1', [HC({ total: 100, paid: 40, pays: [PAY(40, '2026-08-15', 1), PAY(null, '2026-09-09')] })], ipcNos);
  assert.equal(x.lastPaidDate, '2026-08-15');
  assert.equal(x.lastIpc, 1);
});
ok('гэрээний талбар — утгатай эхний мөрөөс (толгой мөр AUTO байж болно)', () => {
  const rows = [{ tosov_niislel_tosov: null }, { tosov_niislel_tosov: '' }, { tosov_niislel_tosov: 5e9 }];
  assert.equal(firstFilled(rows, 'tosov_niislel_tosov'), 5e9);
  assert.equal(firstFilled([{}], 'x'), null);
});

console.log('\n11. Түлхүүрийн эзэн (нэг гэрээ нэг мөрд)');
{
  const cf = [
    CR({ oid: 1, pkg: 'Багц 7.1', code: '1', cost: 5e8, note: 'Гэрээлсэн дүн' }),
    CR({ oid: 56, pkg: 'БАГЦ-7.1', t2: 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт', t3: 'Инженерийн бэлтгэл ажил', cost: 22.9e9, note: 'Гэрээлсэн дүн' }),
    CR({ oid: 11, pkg: 'БАГЦ-1', t2: 'ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт', cost: 373e9, note: 'Гэрээлсэн дүн' }),
    CR({ oid: 2, pkg: 'Багц 9.9', code: '1', cost: 1e8, note: 'Гэрээлсэн дүн' }),
  ];
  const pk2 = buildTuhPkgs(cf, 'Гэрээлсэн дүн');
  const design71 = pk2.find((p) => p.key === 'd:1');
  const build71 = pk2.find((p) => p.pkgKey === 'БАГЦ71' && p.group !== 'design');
  const design99 = pk2.find((p) => p.key === 'd:2');
  ok('эзэн — зураг төслийн БУС мөр; зөвхөн зураг төсөлтэй түлхүүрт — тэр мөр', () => {
    const { owner } = keyOwners(pk2);
    assert.equal(owner.get('БАГЦ71'), build71.key);
    assert.equal(owner.get('БАГЦ1'), 'БАГЦ1');
    assert.equal(owner.get('БАГЦ99'), design99.key);
  });
  ok('⚠️ барилгын HO гэрээ зураг төслийн мөрд наалдахгүй; ТЭЗҮ гэрээ зураг төслийн мөрд', () => {
    const hb = HC({ code: 'Багц-7.1', key: 'БАГЦ71', total: 100, paid: 10 });
    const hd = HC({ code: 'ТЭЗҮ-7.1', key: 'БАГЦ71', workType: 'ТЭЗҮ,Судалгаа', total: 5, paid: 5 });
    const hr = HC({ code: 'Багц-1-4', key: '', total: 1, paid: 1 });
    const by = assignHo(pk2, [hb, hd, hr]);
    assert.deepEqual(by.get(build71.key), [hb]);
    assert.deepEqual(by.get(design71.key), [hd]);
    const all = [...by.values()].flat();
    assert.equal(all.length, 2, 'гэрээ бүр ЯГ НЭГ мөрд; диапазон гэрээ аль ч мөрд');
  });
  ok('ТЭЗҮ гэрээ, зураг төслийн мөргүй бол эзэнд', () => {
    const hd = HC({ code: 'ТЭЗҮ-1', key: 'БАГЦ1', workType: 'ТЭЗҮ,Судалгаа' });
    assert.deepEqual(assignHo(pk2, [hd]).get('БАГЦ1'), [hd]);
  });
  ok('isDesignHo', () => {
    assert.equal(isDesignHo({ workType: 'ТЭЗҮ,Судалгаа' }), true);
    assert.equal(isDesignHo({ workType: 'Барилга угсралт' }), false);
    assert.equal(isDesignHo({ workType: 'ГИШСүлжээ' }), false);
  });
  ok('«0» багц — багцгүй мөр (нэг багц болж нийлэхгүй)', () => {
    const z = buildTuhPkgs([
      CR({ oid: 70, pkg: '0', code: '6', cost: 1 }),
      CR({ oid: 71, pkg: '0', code: '6', cost: 2 }),
    ], 'Гэрээлсэн дүн');
    assert.equal(z.length, 2);
    assert.ok(z.every((p) => p.pkgKey === '' && p.key.startsWith('cf:')));
  });
}

console.log('\n12. Улсын комисс — хуудас нэгтгэл');
ok('хамгийн хожуу нь', () => {
  const r = mergeCommission([{ key: 'БАГЦ1', at: 10, ok: true }, { key: 'БАГЦ1', at: 30, ok: true }, { key: 'БАГЦ2', at: null, ok: true }]);
  assert.equal(r.dates.get('БАГЦ1'), 30);
  assert.equal(r.dates.get('БАГЦ2'), null);
  assert.deepEqual(r.failed, []);
});
ok('⚠️ нэг хуудас унасан бол огноо «—» (дутуу огноо үлдэхгүй), нэр давхардахгүй', () => {
  for (const order of [[0, 1], [1, 0]]) {
    const res = [{ key: 'БАГЦ1', at: 10, ok: true }, { key: 'БАГЦ1', at: null, ok: false }];
    const r = mergeCommission(order.map((i) => res[i]));
    assert.equal(r.dates.get('БАГЦ1'), null);
    assert.deepEqual(r.failed, ['БАГЦ1']);
  }
  const both = mergeCommission([{ key: 'БАГЦ1', at: null, ok: false }, { key: 'БАГЦ1', at: null, ok: false }]);
  assert.deepEqual(both.failed, ['БАГЦ1']);
});
ok('⚠️ 2026-10-09: олон хуудасны НЭГ нь огноогүй (ok) — огноо «—», partial 1/2; бүгд огноогүй бол partial-гүй', () => {
  for (const order of [[0, 1], [1, 0]]) {
    const res = [{ key: 'БАГЦ1', at: 10, ok: true }, { key: 'БАГЦ1', at: null, ok: true }];
    const r = mergeCommission(order.map((i) => res[i]));
    assert.equal(r.dates.get('БАГЦ1'), null);
    assert.deepEqual(r.partial.get('БАГЦ1'), { dated: 1, sheets: 2 });
    assert.deepEqual(r.failed, []);
  }
  const none = mergeCommission([{ key: 'БАГЦ1', at: null, ok: true }, { key: 'БАГЦ1', at: null, ok: true }]);
  assert.equal(none.dates.get('БАГЦ1'), null);
  assert.equal(none.partial.size, 0);
  /* унасан нь хагасаас ДАВУУ — failed-д, partial-д биш */
  const f = mergeCommission([{ key: 'БАГЦ1', at: 10, ok: true }, { key: 'БАГЦ1', at: null, ok: true }, { key: 'БАГЦ1', at: null, ok: false }]);
  assert.deepEqual(f.failed, ['БАГЦ1']);
  assert.equal(f.partial.size, 0);
});

console.log('\n13. Хэмжилтийн өдөр (lagOf-ийн at)');
ok('сүүлийн хэмжигдсэн сарын physAt; өөр сарынх бол сарын эцэс; хэмжилтгүй бол нөөц', () => {
  const ms = [
    { label: '2026-07', phys: 5, physAt: '2026-07-20' },
    { label: '2026-08', phys: 8, physAt: '2026-08-05' },
    { label: '2026-09', phys: null, physAt: null },
  ];
  assert.equal(measDayOf(ms, '2026-09', '2026-09-30'), '2026-08-05');
  assert.equal(measDayOf([{ label: '2026-08', phys: 0, physAt: '2026-07-31' }], '2026-09', 'x'), '2026-08-31', '0% нь хэмжилт');
  assert.equal(measDayOf([{ label: '2026-10', phys: 9, physAt: '2026-10-02' }], '2026-09', 'x'), 'x', 'ирээдүйн сар');
  assert.equal(measDayOf(null, '2026-09', 'x'), 'x');
  /* ⚠️ 2026-10-04: physAt-гүй ОДООГИЙН сарын цэг (ОГТ тайлагнаагүй багцын 0%) — өнөөдөр, сарын эцэс БИШ */
  assert.equal(measDayOf([{ label: '2026-10', phys: 0, physAt: null }], '2026-10', 'x', '2026-10-04'), '2026-10-04');
  assert.equal(measDayOf([{ label: '2026-09', phys: 5, physAt: null }], '2026-10', 'x', '2026-10-04'), '2026-09-31', 'өнгөрсөн сар — сарын эцэс хэвээр');
});

/* ═══════════════ 2026-10-01 (хэрэглэгч: бүгдийг зас) ═══════════════ */

console.log('\n14. Хайлт — нормалчлал');
ok('«багц 5.1» · «БАГЦ-5.1» · «Багц 5.1» · «bagts 5.1» · «BAGTS-5.1» → нэг хэлбэр', () => {
  for (const x of ['багц 5.1', 'БАГЦ-5.1', 'Багц 5.1', 'bagts 5.1', 'BAGTS-5.1', 'Багц  -  5.1', 'Багц №5.1']) {
    assert.equal(searchNorm(x), 'багц5.1', x);
  }
  assert.equal(searchNorm('БАГЦ 1- 4'), 'багц1-4', 'диапазоны зураас үлдэнэ');
  assert.equal(searchNorm('Багц-1-4'), 'багц1-4');
});
ok('бүгд ижил багцыг олно; «15.1», «5.10» ОЛДОХГҮЙ', () => {
  for (const q of ['багц 5.1', 'БАГЦ-5.1', '5.1', 'bagts 5.1', 'Bagts5.1', ' 5.1 ']) {
    assert.equal(matchesSearch(q, 'БАГЦ-5.1', ['Ус', 'Х ХХК']), true, q);
    assert.equal(matchesSearch(q, 'БАГЦ-15.1', ['Ус', 'Х ХХК']), false, `${q} ≠ 15.1`);
    assert.equal(matchesSearch(q, 'БАГЦ-5.10', ['Ус', 'Х ХХК']), false, `${q} ≠ 5.10`);
  }
  assert.equal(matchesSearch('5', 'БАГЦ-5.1', []), true, 'эцэг дугаар дэд багцыг олно');
  assert.equal(matchesSearch('багц 1-4', 'БАГЦ 1- 4', []), true, 'диапазон');
  assert.equal(matchesSearch('8', 'БАГЦ 1-6 БАГЦ 8-17', []), true, 'хоёр дахь диапазон');
});
ok('нэр/гүйцэтгэгч — зай, зураас, том жижиг үл хамаарна; хоосон хайлт бүгдийг', () => {
  assert.equal(matchesSearch('барилга угсралт', 'БАГЦ-1', ['Барилга - угсралт']), true);
  assert.equal(matchesSearch('ХХК', 'БАГЦ-1', ['', 'Сэлбэ хххк']), true);
  assert.equal(matchesSearch('110', 'Багц 8', ['110/35/10 кВ станц']), true, 'тоо нэрнээс');
  assert.equal(matchesSearch('', 'x', []), true);
  assert.equal(matchesSearch('дулаан', 'БАГЦ-1', ['Ус']), false);
});

console.log('\n15. Төлөв — хоцорсон эхэнд, «Мэдээлэлгүй»');
ok('«Хоцорсон» эхэнд, бусад дараалал хэвээр (stable)', () => {
  const xs = [{ k: 'a', status: 'run' }, { k: 'b', status: 'late' }, { k: 'c', status: 'todo' }, { k: 'd', status: 'late' }];
  assert.deepEqual(lateFirst(xs).map((x) => x.k), ['b', 'd', 'a', 'c']);
});
ok('nullAs: зураг төслийн хэмжигдээгүй → «unknown»; жинхэнэ 0 → «todo»; анхдагч хэвээр', () => {
  assert.equal(statusOf({ contracted: true, progress: null, gap: null, nullAs: 'unknown' }), 'unknown');
  assert.equal(statusOf({ contracted: true, progress: 0, gap: null, nullAs: 'unknown' }), 'todo');
  assert.equal(statusOf({ contracted: true, progress: null, gap: null }), 'todo');
  assert.equal(statusOf({ contracted: false, progress: null, gap: null, nullAs: 'unknown' }), 'none');
  assert.ok(TUH_STATUS.some((x) => x.key === 'unknown' && x.label() === 'Мэдээлэлгүй'));
});

console.log('\n16. Зураг төслийн гүйцэтгэл — шатны талбар (guitsetgel_huvi биш)');
ok('нэрээр талбар сонгоно; хоёулаа бол дундаж', () => {
  assert.equal(designPctOf(CR({ oid: 4, name: 'Хөрсний ус ажлын зураг төсөл', tezu: 100, az: 40, prog: 99 })), 40);
  assert.equal(designPctOf(CR({ oid: 4, name: 'ТЭЗҮ боловсруулах', tezu: 70, az: 10 })), 70);
  assert.equal(designPctOf(CR({ oid: 8, name: 'ТЭЗҮ, техникийн зураг төсөл', tezu: 100, az: 0 })), 50);
  assert.equal(designPctOf(CR({ oid: 1, name: 'Орон сууцжуулах төсөл', tezu: 100, az: 60 })), 80, 'аль нь ч биш → хоёулаа');
  assert.equal(designPctOf(CR({ oid: 1, name: 'Орон сууцжуулах төсөл', tezu: null, az: 60 })), 60, 'хоосон нь жинд орохгүй');
});
ok('бүгд хоосон → null (0 биш); progressOf → «Мэдээлэлгүй»', () => {
  const pk3 = buildTuhPkgs([CR({ oid: 5, pkg: 'БАГЦ-7.2', code: '1', name: 'Үерийн ус ажлын зураг', prog: 39.27, note: 'Гэрээлсэн дүн' })], 'Гэрээлсэн дүн');
  assert.equal(pk3[0].group, 'design');
  assert.equal(progressOf(pk3[0], null), null, 'барилгын 39.27 БИШ');
  assert.equal(statusOf({ contracted: true, progress: progressOf(pk3[0], null), gap: null, nullAs: 'unknown' }), 'unknown');
});
ok('rowProgress — бусад бүлэгт guitsetgel_huvi хэвээр', () => {
  assert.equal(rowProgress('energy', CR({ oid: 9, prog: 20, tezu: 100 })), 20);
  assert.equal(rowProgress('design', CR({ oid: 9, name: 'ТЭЗҮ', prog: 20, tezu: 100 })), 100);
});

console.log('\n17. HO «ТЭЗҮ,Судалгаа» → зураг төслийн мөр');
ok('isDesignHo — таслалаар нийлсэн төрөл: бүх хэсэг зураг төслийнх л', () => {
  assert.equal(isDesignHo({ workType: 'ТЭЗҮ, Судалгаа ' }), true);
  assert.equal(isDesignHo({ workType: 'Судалгаа' }), true);
  assert.equal(isDesignHo({ workType: 'Зураг төсөл, Барилга угсралт' }), false, 'холимог → барилга');
  assert.equal(isDesignHo({ workType: '' }), false);
});
{
  const INFRA = 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт';
  const cf = [
    CR({ oid: 3, pkg: 'БАГЦ 1-4', code: '1', name: 'ХТП,РП ТЭЗҮ', note: 'Гэрээлсэн дүн' }),
    CR({ oid: 6, pkg: 'Багц 8', code: '1', name: '110 кВ станцын ажлын зураг', note: 'Гэрээлсэн дүн' }),
    CR({ oid: 40, pkg: 'БАГЦ-8.1', t2: INFRA, t3: 'Гадна цахилгаан холбоо', note: 'Гэрээлсэн дүн' }),
  ];
  const pk4 = buildTuhPkgs(cf, 'Гэрээлсэн дүн');
  const d3 = pk4.find((p) => p.key === 'd:3');
  const d6 = pk4.find((p) => p.key === 'd:6');
  const e81 = pk4.find((p) => p.pkgKey === 'БАГЦ81' && p.group !== 'design');
  const hd14 = HC({ code: 'Багц-1-4', key: '', pkg: 'Багц-1-4', workType: 'ТЭЗҮ,Судалгаа', total: 5, paid: 5 });
  const hd81 = HC({ code: 'Багц-8.1', key: 'БАГЦ81', pkg: 'Багц-8.1', workType: 'ТЭЗҮ,Судалгаа', total: 7, paid: 7 });
  const hb81 = HC({ code: 'Багц-8.1б', key: 'БАГЦ81', pkg: 'Багц-8.1', workType: 'Барилга угсралт', total: 70, paid: 7 });
  const hr14 = HC({ code: 'Багц-1-4в', key: '', pkg: 'Багц-1-4', workType: 'Барилга угсралт', total: 1, paid: 1 });
  const by = assignHo(pk4, [hd14, hd81, hb81, hr14]);
  ok('⚠️ диапазон кодтой ТЭЗҮ гэрээ («Багц-1-4») → «БАГЦ 1-4» зураг төслийн мөр', () => assert.deepEqual(by.get(d3.key), [hd14]));
  ok('⚠️ «Багц-8.1» ТЭЗҮ → эцэг «Багц 8» зураг төсөл (8.1-ийн барилгын мөр БИШ)', () => {
    assert.deepEqual(by.get(d6.key), [hd81]);
    assert.deepEqual(by.get(e81.key), [hb81]);
  });
  ok('диапазон БАРИЛГЫН гэрээ хэвээр аль ч мөрд очихгүй; гэрээ бүр ≤ 1 мөрд', () => {
    const all = [...by.values()].flat();
    assert.equal(all.length, 3);
    assert.ok(!all.includes(hr14));
  });
  ok('ipcOf(null, …) — онооголт эцсийн (түлхүүрээр дахин шүүхгүй)', () => {
    const x = ipcOf(null, by.get(d6.key), ipcNos);
    assert.equal(x.contracts.length, 1);
    assert.equal(ipcOf(null, [], ipcNos), null);
    assert.equal(ipcOf('', [hd81], ipcNos), null, 'хоосон түлхүүр — урьдын адил null');
  });
}

console.log('\n18. IPC — хувьд ороогүй олголт, хянагдаж буй AUTO');
const AUTO = (key, day, dun, une) => ({ murun_id: `AUTO|${key}|${day}`, dun, guits_une: une, guilgee_ognoo: day, tulult_turul: 'Гүйцэтгэл' });
ok('paidOther — гэрээт дүн тодорхойгүй гэрээний олголт; алга бол null', () => {
  const x = ipcOf('БАГЦ1', [HC({ total: 100, paid: 40 }), HC({ code: 'Багц-1б', total: null, paid: 70 })], ipcNos);
  assert.equal(x.paidOther, 70);
  assert.equal(x.paidPct, 40);
  assert.equal(ipcOf('БАГЦ1', [HC({ total: 100, paid: 40 })], ipcNos).paidOther, null);
});
ok('хянагдаж буй — `dun` хоосон AUTO л; олгосон AUTO ба гар мөр ОРОХГҮЙ', () => {
  const pays = [
    PAY(40, '2026-08-15', 1),
    AUTO('БАГЦ1', '2026-08-01', 50, 45),
    AUTO('БАГЦ1', '2026-09-09', null, 100),
    AUTO('БАГЦ1', '2026-09-20', null, null),
  ];
  assert.deepEqual(pendingAutoOf(pays), { count: 2, une: 100, oldest: '2026-09-09', latest: '2026-09-20' });
  assert.equal(pendingAutoOf([PAY(40, '2026-08-15', 1)]), null);
  const x = ipcOf('БАГЦ1', [HC({ total: 100, paid: 40, pays })], ipcNos);
  assert.equal(x.review.count, 2);
  assert.equal(x.lastPaidDate, '2026-08-15', 'AUTO нь «сүүлд олгосон» биш');
});
ok('агшны огноо `murun_id`-аас (guilgee_ognoo дарагдсан ч)', () => {
  const r = { ...AUTO('БАГЦ2', '2026-09-04', null, 1), guilgee_ognoo: '2026-12-31' };
  assert.equal(pendingAutoOf([r]).oldest, '2026-09-04');
});

console.log('\n19. Улсын комисс — «Хуваарь»-ийн сүүлийн агшин, № «УК» мөр');
{
  const D = (s) => Date.parse(`${s}T00:00:00Z`);
  ok('сүүлийн агшны өдрийн мөр (хуучин агшны том ObjectID биш)', () => {
    const c = [
      { oid: 30, fill: D('2026-09-28'), exact: true, end: 3 },
      { oid: 50, fill: D('2026-09-29'), exact: true, end: 5 },
    ];
    assert.equal(pickCommission(c, D('2026-09-29') + 3600_000), 5);
  });
  ok('нэг өдөрт хоёр агшин — хамгийн их ObjectID', () => {
    const c = [
      { oid: 50, fill: D('2026-09-29'), exact: true, end: 5 },
      { oid: 70, fill: D('2026-09-29') + 60_000, exact: true, end: 7 },
    ];
    assert.equal(pickCommission(c, D('2026-09-29')), 7);
  });
  ok('⚠️ ЯГ мөр (№ «УК») нэрээр таарсан бусад мөрөөс давамгайлна', () => {
    const c = [
      { oid: 90, fill: D('2026-09-29'), exact: false, end: 9 },
      { oid: 50, fill: D('2026-09-29'), exact: true, end: 5 },
    ];
    assert.equal(pickCommission(c, D('2026-09-29')), 5);
    assert.equal(pickCommission([{ oid: 90, fill: D('2026-09-29'), exact: false, end: 9 }], D('2026-09-29')), 9, 'хуучин хуудас — нэрээр');
  });
  ok('сүүлийн агшинд мөр алга → null («Хуваарь»-д ч харагдахгүй)', () => {
    assert.equal(pickCommission([{ oid: 30, fill: D('2026-09-28'), exact: true, end: 3 }], D('2026-09-29')), null);
  });
  ok('тамга дутуу агшин — огноогүй мөр; тамгагүй хуудас — хамгийн их ObjectID', () => {
    assert.equal(pickCommission([{ oid: 30, fill: D('2026-09-28'), exact: true, end: 3 }, { oid: 60, fill: null, exact: true, end: 6 }], D('2026-09-29')), 6);
    assert.equal(pickCommission([{ oid: 30, fill: D('2026-09-28'), exact: true, end: 3 }, { oid: 60, fill: null, exact: true, end: 6 }], null), 6);
    assert.equal(pickCommission([{ oid: 30, fill: null, exact: true, end: 3 }, { oid: 60, fill: null, exact: true, end: 6 }], undefined), 6);
    assert.equal(pickCommission([], D('2026-09-29')), null);
  });
}

console.log('\n20. Хуудасны кэш (keyedCache)');
{
  let t = 0;
  let calls = 0;
  const c = keyedCache(1000, () => t);
  const load = (v) => () => { calls += 1; return Promise.resolve(v); };
  await okA('түлхүүр тутам нэг удаа; TTL дуусвал дахин; clear → дахин', async () => {
    await c.get('a', load(1));
    await c.get('a', load(2));
    assert.equal(calls, 1);
    assert.equal(await c.get('a', load(3)), 1);
    await c.get('b', load(4));
    assert.equal(calls, 2);
    t = 2000;
    assert.equal(await c.get('a', load(5)), 5);
    c.clear();
    assert.equal(await c.get('a', load(6)), 6);
  });
  await okA('унасан амлалт кэшэд үлдэхгүй', async () => {
    const f = keyedCache(1000, () => 0);
    await f.get('x', () => Promise.reject(new Error('net'))).catch(() => {});
    await Promise.resolve();
    assert.equal(await f.get('x', () => Promise.resolve(9)), 9);
  });
}

console.log('\n21. Сүүлийн тайлан · өвлийн он');
ok('lastReportOf — хэмжигдсэн сарын хамгийн хожуу physAt; алга бол null', () => {
  const ms = [
    { label: '2026-08', phys: 5, physAt: '2026-08-20' },
    { label: '2026-09', phys: 8, physAt: '2026-09-11' },
    { label: '2026-10', phys: null, physAt: '2026-10-01' },
  ];
  assert.equal(lastReportOf(ms), '2026-09-11');
  assert.equal(lastReportOf([{ label: '2026-09', phys: 3, physAt: null }]), null);
  assert.equal(lastReportOf(null), null);
});
ok('reportAge — хоног; огноо алга бол null', () => {
  assert.equal(reportAge('2026-09-11', '2026-10-01'), 20);
  assert.equal(reportAge(null, '2026-10-01'), null);
});
ok('heatWinterYear — 5/15-аас өмнө өмнөх оны өвөл (хатуу 2026 биш)', () => {
  assert.equal(heatWinterYear('2026-10-01'), 2026);
  assert.equal(heatWinterYear('2027-02-10'), 2026);
  assert.equal(heatWinterYear('2027-05-15'), 2027);
  assert.equal(heatWinterYear('x'), null);
});

console.log('\n22. Харагдацын холболт (эх кодоор)');
{
  const { readFileSync } = await import('node:fs');
  const view = readFileSync(new URL('../modules/Tuh.tsx', import.meta.url), 'utf8');
  const sched = readFileSync(new URL('../modules/tuh/tuhSchedule.ts', import.meta.url), 'utf8');
  const ov = readFileSync(new URL('../modules/tuh/Overview.tsx', import.meta.url), 'utf8');
  ok('⚠️ багц нээх/хаах нь түүхэнд PUSH; popstate → `sel` сэргээнэ', () => {
    assert.ok(/writeParams\(\{ tuh: sel \}, \{ push: true \}\)/.test(view));
    assert.ok(/addEventListener\('popstate'/.test(view) && /setSel\(readParam\('tuh'\)\)/.test(view));
  });
  ok('⚠️ хуваарийн хуудас кэштэй, BAGTS_SHEET бичилтээр хаягдана', () => {
    assert.ok(/register\(\(\) => sheetRows\.clear\(\), \['BAGTS_SHEET'\]\)/.test(sched));
    assert.ok(/sheetRows\.get\(sheet\.key/.test(sched));
  });
  ok('«2026 оны өвөл» хатуу бичиглэл алга', () => assert.ok(!/tr\('2026 оны өвөл/.test(ov)));
}

console.log(`\ntuhData: ${n} шалгуур ✅`);
