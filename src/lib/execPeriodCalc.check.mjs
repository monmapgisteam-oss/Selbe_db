/**
 * УДИРДЛАГЫН ТАЙЛАН — ХУГАЦААНЫ ӨӨРЧЛӨЛТ (`execPeriodCalc.ts`), цэвэр (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/execPeriodCalc.check.mjs
 *
 * Хамгаалж буй дүрмүүд (2026-10-28):
 *   1. Хугацаа — 7/30 хоног · энэ сар · өмнөх сар · гараар; буруу гараар → 30 хоног (түлхүүр хэвээр).
 *   2. Цуваа — хугацааны эхнээс ӨМНӨХ сүүлийн цэг ↔ төгсгөл хүртэлх сүүлийн цэг; эхнээс өмнө цэг алга → эхний цэг;
 *      хугацаанд шинэ цэг алга → delta null.
 *   3. Олголт — огноотой төлбөрөөс хугацааны эхний/эцсийн хуримтлал; огноогүй төлбөр тоологдохгүй, тоог нь хэлнэ.
 *   4. Зөвшөөрөл — шийдвэрийн огноогоор; бүртгэлгүй бол null.
 *   5. Текст — ▲/▼ · +/− · нэгж; PDF-д сумгүй; өсөлт сайн/муу өнгө.
 */
import assert from 'node:assert/strict';
import {
  periodOf, seriesDelta, computeExecDeltas, deltaText, execDeltaRows, PERIOD_KEYS, packTrendOf, givenTrendOf,
  computeSeries, bandOf,
} from './execPeriodCalc.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };
const D = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime(); // локал
const NOW = D(2026, 10, 28);

console.log('\n1. Хугацаа');
ok('7/30 calendar days include both boundaries and exclude the preceding day', () => {
  for (const [key, days] of [['7d', 7], ['30d', 30]]) {
    for (const now of [NOW, D(2026, 1, 3), D(2024, 3, 1)]) {
      const p = periodOf(key, now);
      assert.equal((Date.parse(p.to) - Date.parse(p.from)) / 86400000 + 1, days);
      const start = new Date(`${p.from}T00:00:00`).getTime();
      const end = new Date(`${p.to}T23:59:59`).getTime();
      const result = computeExecDeltas({ housing: [], packs: [], days: [], zov: [], givenTotal: 111,
        pays: [{ at: start - 1, amount: 100 }, { at: start, amount: 10 }, { at: end, amount: 1 }] }, p);
      assert.equal(result.given.delta, 11);
      assert.equal(result.given.prev, 100);
    }
  }
});
ok('7 · 30 хоног, энэ сар, өмнөх сар', () => {
  assert.deepEqual(periodOf('7d', NOW), { key: '7d', from: '2026-10-22', to: '2026-10-28' });
  assert.deepEqual(periodOf('30d', NOW), { key: '30d', from: '2026-09-29', to: '2026-10-28' });
  assert.deepEqual(periodOf('thisMonth', NOW), { key: 'thisMonth', from: '2026-10-01', to: '2026-10-28' });
  assert.deepEqual(periodOf('prevMonth', NOW), { key: 'prevMonth', from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(periodOf('prevMonth', D(2026, 1, 15)), { key: 'prevMonth', from: '2025-12-01', to: '2025-12-31' }, 'оны эхэнд өмнөх он');
});
ok('гараар — зөв бол тэр чигээр, буруу/хоосон/урвуу бол 30 хоног (түлхүүр custom хэвээр)', () => {
  assert.deepEqual(periodOf('custom', NOW, { from: '2026-08-01', to: '2026-08-31' }), { key: 'custom', from: '2026-08-01', to: '2026-08-31' });
  assert.deepEqual(periodOf('custom', NOW, { from: '', to: '' }), { key: 'custom', from: '2026-09-29', to: '2026-10-28' });
  assert.deepEqual(periodOf('custom', NOW, { from: '2026-09-10', to: '2026-09-01' }), { key: 'custom', from: '2026-09-29', to: '2026-10-28' });
  assert.deepEqual(PERIOD_KEYS, ['7d', '30d', 'thisMonth', 'prevMonth', 'custom']);
});

console.log('\n2. Цуваа');
ok('эхнээс өмнөх сүүлийн ↔ төгсгөл хүртэлх сүүлийн; null цэг алгасна', () => {
  const pts = [{ at: '2026-08-30', v: 20 }, { at: '2026-09-27', v: 23.1 }, { at: '2026-10-26', v: 25.8 }, { at: '2026-11-20', v: 30 }, { at: '2026-10-10', v: null }];
  const d = seriesDelta(pts, '2026-09-28', '2026-10-28');
  assert.deepEqual(d, { prev: 23.1, now: 25.8, delta: 25.8 - 23.1, prevAt: '2026-09-27', nowAt: '2026-10-26', prevInside: false });
});
ok('эхнээс өмнө цэг алга → хугацааны ЭХНИЙ цэгтэй (prevInside); ганц цэг → delta null (0 биш)', () => {
  const two = seriesDelta([{ at: '2026-09-30', v: 19.1 }, { at: '2026-10-26', v: 25.8 }], '2026-09-28', '2026-10-28');
  assert.deepEqual(two, { prev: 19.1, now: 25.8, delta: 25.8 - 19.1, prevAt: '2026-09-30', nowAt: '2026-10-26', prevInside: true });
  const one = seriesDelta([{ at: '2026-10-26', v: 25.8 }], '2026-09-28', '2026-10-28');
  assert.deepEqual(one, { prev: 25.8, now: 25.8, delta: null, prevAt: '2026-10-26', nowAt: '2026-10-26', prevInside: true });
  const same = seriesDelta([{ at: '2026-08-30', v: 20 }], '2026-09-28', '2026-10-28');
  assert.deepEqual(same, { prev: 20, now: 20, delta: null, prevAt: '2026-08-30', nowAt: '2026-08-30', prevInside: false }, 'хугацаанд шинэ цэг алга');
  assert.deepEqual(seriesDelta([], '2026-09-28', '2026-10-28'), { prev: null, now: null, delta: null, prevAt: null, nowAt: null, prevInside: false });
});

console.log('\n3. Нэгтгэл');
const period = periodOf('30d', NOW);
const input = {
  housing: [{ at: '2026-08-30', v: 20 }, { at: '2026-09-27', v: 23.1 }, { at: '2026-10-26', v: 25.8 }],
  packs: [
    { key: 'БАГЦ1', label: 'Багц 1', points: [{ at: '2026-09-27', v: 30 }, { at: '2026-10-26', v: 32.9 }] },
    { key: 'БАГЦ9', label: 'Багц 9', points: [] },
  ],
  pays: [
    { at: D(2026, 10, 5), amount: 10e9, key: 'БАГЦ1' }, { at: D(2026, 9, 1), amount: 5e9, key: 'БАГЦ1' }, { at: null, amount: 3e9, key: 'БАГЦ1' }, { at: D(2026, 10, 20), amount: null, key: 'БАГЦ2' },
    { at: D(2026, 9, 29, 0), amount: 1e9, key: 'БАГЦ2' }, // эхний өдөр ОРНО
    { at: D(2026, 10, 28, 23), amount: 2e9 }, // сүүлийн өдөр ОРНО (түлхүүргүй — нийтэд орно, багцад орохгүй)
  ],
  givenTotal: 530e9,
  days: [{ key: '2026-09-25', workers: 1200, technik: 60 }, { key: '2026-10-28', workers: 1311, technik: 71 }, { key: '2026-10-10', workers: null, technik: 65 }],
  zov: [{ kind: 'ok', at: D(2026, 10, 3) }, { kind: 'ok', at: D(2026, 8, 3) }, { kind: 'no', at: D(2026, 10, 9) }, { kind: 'wait', at: null }],
};
const d = computeExecDeltas(input, period);
ok('орон сууц · багц — хэмжилтийн өдрөөр', () => {
  assert.equal(d.housing.prev, 23.1); assert.equal(d.housing.now, 25.8); assert.ok(Math.abs(d.housing.delta - 2.7) < 1e-9);
  assert.deepEqual(d.packs[0], { key: 'БАГЦ1', label: 'Багц 1', prev: 30, now: 32.9, delta: 32.9 - 30 });
  assert.deepEqual(d.packs[1], { key: 'БАГЦ9', label: 'Багц 9', prev: null, now: null, delta: null }, 'хэмжилтгүй багц null');
});
ok('олголт — хугацаанд багтсан (хил орно), огноогүй тоологдохгүй', () => {
  assert.equal(d.given.delta, 13e9); assert.equal(d.given.count, 3); assert.equal(d.given.undated, 1);
  assert.equal(d.given.now, 18e9); assert.equal(d.given.prev, 5e9);
  assert.deepEqual(d.givenByKey, { БАГЦ1: 10e9, БАГЦ2: 1e9 }, 'багцаар — түлхүүргүй төлбөр орохгүй');
  assert.deepEqual(givenTrendOf(d, 'БАГЦ1'), { text: '▲ +10,000,000,000 ₮', tone: 'good' });
  assert.deepEqual(givenTrendOf(d, 'БАГЦ9'), { text: '= 0 ₮', tone: 'mute' }, 'олголтгүй багц = 0 (хэмжээс бий)');
  assert.equal(givenTrendOf(null, 'БАГЦ1'), null);
  assert.deepEqual(packTrendOf(d, 'БАГЦ1'), { text: '▲ +2.9 н.х', tone: 'good' });
  assert.equal(packTrendOf(d, 'БАГЦ9'), null, 'хэмжилтгүй багц');
});
ok('ХАБ — өдрөөр; null өдөр алгасна', () => {
  assert.deepEqual(d.workers, { prev: 1200, now: 1311, delta: 111, prevAt: '2026-09-25', nowAt: '2026-10-28', prevInside: false });
  assert.deepEqual(d.technik, { prev: 60, now: 71, delta: 11, prevAt: '2026-09-25', nowAt: '2026-10-28', prevInside: false });
});
ok('зөвшөөрөл — хугацааны шийдвэр; бүртгэлгүй → null', () => {
  assert.deepEqual(d.zov, { ok: 1, no: 1, wait: 0 });
  assert.equal(computeExecDeltas({ ...input, zov: null }, period).zov, null);
});
ok('олголтын нийт алга → null (0 биш)', () => {
  const g = computeExecDeltas({ ...input, givenTotal: null }, period).given;
  assert.equal(g.now, null); assert.equal(g.prev, null); assert.equal(g.delta, null);
});
ok('өмнөх сар — дараагийн төлбөр эхний болон эцсийн үлдэгдэлд орохгүй', () => {
  const pays = [
    { at: D(2026, 8, 1), amount: 100 },
    { at: D(2026, 9, 15), amount: 20 },
    { at: D(2026, 10, 15), amount: 40 },
  ];
  const p = { key: 'prevMonth', from: '2026-09-01', to: '2026-09-30' };
  const g = computeExecDeltas({ ...input, pays, givenTotal: 160 }, p).given;
  assert.deepEqual(g, { prev: 100, now: 120, delta: 20, count: 1, undated: 0 });
  const later = computeExecDeltas({ ...input, pays: [...pays, { at: D(2026, 11, 1), amount: 70 }], givenTotal: 230 }, p).given;
  assert.deepEqual(later, g, 'дараа нь төлбөр орсон ч түүхэн дүн өөрчлөгдөхгүй');
});
ok('олголтын хоосон түүх, буцаалт, огноогүй дүн', () => {
  const p = { key: 'custom', from: '2026-09-01', to: '2026-09-30' };
  assert.deepEqual(computeExecDeltas({ ...input, pays: [], givenTotal: 0 }, p).given,
    { prev: 0, now: 0, delta: 0, count: 0, undated: 0 });
  const g = computeExecDeltas({ ...input, givenTotal: 140, pays: [
    { at: D(2026, 8, 1), amount: 100 }, { at: D(2026, 9, 30, 23), amount: -10 },
    { at: null, amount: 50 },
  ] }, p).given;
  assert.deepEqual(g, { prev: 100, now: 90, delta: -10, count: 1, undated: 1 });
});

console.log('\n4. Текст');
ok('▲/▼ · +/− · нэгж · өнгө', () => {
  assert.deepEqual(deltaText(2.7, 'pp', { upGood: true }), { text: '▲ +2.7 н.х', tone: 'good' });
  assert.deepEqual(deltaText(-2.7, 'pp', { upGood: true }), { text: '▼ −2.7 н.х', tone: 'bad' });
  assert.deepEqual(deltaText(111, 'n'), { text: '▲ +111', tone: 'mute' }, 'upGood өгөөгүй → саарал');
  assert.deepEqual(deltaText(0, 'pp', { upGood: true }), { text: '= 0.0 н.х', tone: 'mute' });
  assert.deepEqual(deltaText(13e9, 'mnt', { upGood: true, arrows: false }), { text: '+13,000,000,000 ₮', tone: 'good' }, 'PDF — сумгүй');
  assert.equal(deltaText(null, 'pp'), null);
});
ok('мөрүүд — дэлгэц/PDF/PNG нэг эх; хэмжилтгүй багц орохгүй', () => {
  const rows = execDeltaRows(d);
  assert.deepEqual(rows.map((r) => r.key), ['housing', 'given', 'workers', 'technik', 'zov', 'pkg:БАГЦ1']);
  assert.equal(rows[0].note, 'хэмжилт 2026-09-27 → 2026-10-26');
  assert.equal(rows[1].note, '3 төлбөр · огноогүй 1 төлбөр тоологдоогүй');
  assert.equal(rows[1].now, '18,000,000,000 ₮');
  assert.match(rows[4].now, /зөвшөөрсөн 1 · татгалзсан 1/);
  assert.equal(execDeltaRows(d, false)[0].trend.text, '+2.7 н.х');
});

console.log('\n5. Сарын цуваа (график)');
ok('тэнхлэг — эхний өгөгдөлтэй сараас одоогийн сар хүртэл; null цоорхой хэвээр; хуримтлал', () => {
  const s = computeSeries({
    months: [
      { label: '2026-05', phys: null, given: 0 }, { label: '2026-06', phys: null, given: 5e9 }, { label: '2026-07', phys: 10, given: 0 },
      { label: '2026-08', phys: null, given: 2e9 }, { label: '2026-09', phys: 23.1, given: 0 }, { label: '2026-10', phys: 25.8, given: 0 }, { label: '2026-11', phys: null, given: 0 },
    ],
    plan: [{ label: '2026-07', pct: 12 }, { label: '2026-09', pct: 30 }, { label: '2026-10', pct: 35.2 }, { label: '2026-11', pct: 40 }],
    packs: [{ key: 'БАГЦ1', label: 'Багц 1', kind: 'build', months: [{ label: '2026-09', phys: 30 }, { label: '2026-10', phys: 32.9 }] }],
    planTotal: 100e9,
    nowYm: '2026-10',
  });
  assert.deepEqual(s.months, ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], '2026-05 (өгөгдөлгүй) · 2026-11 (ирээдүй) орохгүй');
  assert.deepEqual(s.housingActual, [null, 10, null, 23.1, 25.8]);
  assert.deepEqual(s.housingPlan, [null, 12, null, 30, 35.2]);
  assert.deepEqual(s.paidCum, [5e9, 5e9, 7e9, 7e9, 7e9]);
  assert.deepEqual(s.paidMonthly, [5e9, 0, 2e9, 0, 0], 'сар бүрийн олголт');
  assert.deepEqual(s.paidCumPct.map((v) => Math.round(v * 1e6) / 1e6), [5, 5, 7, 7, 7]);
  assert.deepEqual(s.packs[0].values, [null, null, null, 30, 32.9]);
  assert.deepEqual(computeSeries({ months: [], plan: [], packs: [], planTotal: 0, nowYm: '2026-10' }).months, []);
  assert.deepEqual(computeSeries({ months: [{ label: '2026-10', phys: 1, given: 0 }], plan: [], packs: [], planTotal: 0, nowYm: '2026-10' }).paidCumPct, [null], 'гэрээлсэн дүн 0 → null');
});
ok('сонгосон хугацааны сүүдэр — тэнхлэгийн индекс', () => {
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  assert.deepEqual(bandOf(months, { key: '30d', from: '2026-09-28', to: '2026-10-28' }), [3, 4]);
  assert.deepEqual(bandOf(months, { key: 'prevMonth', from: '2026-09-01', to: '2026-09-30' }), [3, 3]);
  assert.equal(bandOf(months, { key: 'custom', from: '2025-01-01', to: '2025-02-01' }), null);
});

console.log(`\n✅ execPeriodCalc: ${n} шалгуур давлаа`);
