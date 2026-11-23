/**
 * ТӨСЛИЙН САРЫН ОЛГОЛТЫН ЦУВАА — `Finance.aggregateMonths` (2026-11-24, аудит). Сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/modules/financePaidSeries.ui.check.mjs
 *
 * Хамгаалж буй алдаа: сарын цуваа ТЭЗҮ/судалгааны, олон багцын («Багц-1-4»), багцгүй, тэнхлэгээс гадуурх огноотой төлбөрийг
 * хаядаг байсан тул «огноогүй төлбөр» (нийт − хуримтлал) худал их гардаг байв. Одоо: хуримтлалын төгсгөл + огноогүй = олгосон.
 */
import assert from 'node:assert/strict';

const g = globalThis;
const noop = () => {};
const mem = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: () => null, get length() { return m.size; },
  };
};
const elem = () => ({
  style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop, getAttribute: () => null, appendChild: (c) => c, removeChild: (c) => c,
  querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop,
});
Object.assign(g, {
  window: g,
  document: { documentElement: { ...elem(), lang: 'mn' }, body: elem(), head: elem(), createElement: elem,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop, removeEventListener: noop },
  localStorage: mem(), sessionStorage: mem(),
  matchMedia: (q) => ({ matches: false, media: q, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop, removeEventListener: noop,
  location: Object.assign(new URL('http://localhost/'), { assign: noop, replace: noop, reload: noop }),
  history: { pushState: noop, replaceState: noop, state: null },
});
g.fetch = () => Promise.reject(new Error('financePaidSeries.ui.check: сүлжээгүй'));
for (const fn of ['setInterval', 'setTimeout']) {
  const orig = g[fn];
  g[fn] = (...a) => { const t = orig(...a); t?.unref?.(); return t; };
}

const { aggregateMonths } = await import('@/modules/Finance.tsx');
const { HO_IPC, cfMonthAxis } = await import('@/lib/services.ts');
const { hoTotals } = await import('@/lib/ipc.ts');
const { computeSeries } = await import('@/lib/execPeriodCalc.ts');
const { monthKey } = await import('@/lib/format.ts');

const HC = HO_IPC.contractFields, P = HO_IPC.payFields;
const pay = (pkg, dun, date, workType = 'Барилга угсралт', order = null) =>
  ({ [HC.pkg]: pkg, [P.amount]: dun, [P.payDate]: date, [HC.workType]: workType, [HC.order1Date]: order });
const axis = cfMonthAxis();
const pays = [
  pay('Багц-1', 100, Date.UTC(2026, 9, 5)), // 2026-10
  pay('Багц-2', 50, null, 'ТЭЗҮ,Судалгаа', Date.UTC(2026, 8, 3)), // ТЭЗҮ — захирамжийн огноогоор 2026-09
  pay('Багц-1-4', 30, '2026-10-10'), // олон багцын
  pay('', 20, '2026-09-01'), // багцгүй
  pay('Багц-1', 7, '2024-03-01'), // тэнхлэгийн өмнөх → эхний сар
  pay('Багц-1', 11, null), // огноогүй
  pay('Багц-1', null, '2026-10-01'), // дүнгүй — тоологдохгүй
];
const fin = {
  contracts: [], planTotal: new Map(), givenTotal: new Map(),
  /* багцын барилгын олголт (`d.given`) — ТЭЗҮ, олон багцыныг агуулдаггүй; цуваа үүнээс ХАМААРАХГҮЙ */
  given: new Map([['БАГЦ1', new Map([['2026-10', 100]])]]),
  phys: new Map(), physCnt: new Map(), physAt: new Map(), pays,
};

const months = aggregateMonths(fin, null);
const by = new Map(months.map((m) => [m.label, m.given]));
const paid = hoTotals(pays).paid;
const dated = months.reduce((s, m) => s + m.given, 0);

assert.equal(paid, 218);
assert.equal(by.get('2026-10'), 130, 'Багц-1 + олон багцын «Багц-1-4»');
assert.equal(by.get('2026-09'), 70, 'ТЭЗҮ (захирамжийн огноо) + багцгүй');
assert.equal(by.get(axis[0]), (axis[0] === '2026-09' ? 70 : 0) + 7, 'тэнхлэгийн өмнөх олголт эхний сард');
assert.equal(paid - dated, 11, 'үлдэгдэл = ЗӨВХӨН огноогүй төлбөр');

/* Хуримтлалын төгсгөл + огноогүй = олгосон (`audienceReport.finFlow`-ийн өгүүлбэр) */
const s = computeSeries({ months, plan: [], packs: [], planTotal: 1000, nowYm: monthKey() });
assert.equal(s.paidCum[s.paidCum.length - 1] + 11, paid, 'хуримтлал + огноогүй ≠ олгосон');

/* pays-гүй (хуучин тестийн) өгөгдөл унахгүй */
assert.equal(aggregateMonths({ ...fin, pays: undefined }, null).reduce((a, m) => a + m.given, 0), 0);

console.log('financePaidSeries.ui.check.mjs — БҮГД ТЭНЦЛЭЭ (6)');
