/**
 * ХҮЛЭЭН АВАГЧИЙН ТАЙЛАН — шалгуурын ХАМТЫН оролт (`audienceReport.check.mjs` · `audiencePdf.check.mjs` ·
 * `audienceReport.ui.check.mjs`). Цэвэр тоо — сүлжээгүй. `installDom()` — `execReport.ts`-ийн импортод хэрэгтэй хоосон DOM.
 */

export function installDom() {
  const g = globalThis;
  const noop = () => {};
  const listeners = { addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true };
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(String(k), String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } }; };
  const elem = () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, getAttribute: () => null, appendChild: (c) => c, removeChild: (c) => c, querySelector: () => null, querySelectorAll: () => [], ...listeners });
  Object.assign(g, {
    window: g,
    document: { documentElement: { ...elem(), lang: 'mn' }, body: elem(), head: elem(), createElement: elem, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], ...listeners },
    localStorage: store(), sessionStorage: store(),
    matchMedia: (q) => ({ matches: false, media: q, addListener: noop, removeListener: noop, ...listeners }),
    location: Object.assign(new URL('http://localhost/'), { assign: noop, replace: noop, reload: noop }),
    history: { pushState: noop, replaceState: noop, back: noop, length: 1, state: null },
    ...listeners,
  });
  if (!g.navigator) g.navigator = {};
  g.fetch = () => Promise.reject(new Error('audienceReport.fixture: сүлжээгүй'));
  process.on('unhandledRejection', noop);
}

export const PERIOD = { key: 'prevMonth', from: '2026-10-01', to: '2026-10-31' };

/** `ExecReport` — амьд хэлбэрийн цэвэр тоо */
export function execReportFixture() {
  return {
    gdash: {
      budget: 2_495_841_880_529, contract: 2_100_000_000_000, progress: 31.7, progressPlan: 45.2, packages: 74, types: 7, landPct: 82.4,
      land: {
        total: 500, cleared: 412, remaining: 88, areaM2: 1_200_000,
        byStatus: [{ label: 'Бүрэн чөлөөлсөн', n: 412, areaM2: 1_000_000 }, { label: 'Хэлэлцээр', n: 60, areaM2: 150_000 }, { label: 'Шүүх', n: 28, areaM2: 50_000 }],
        reasons: [{ label: 'Хэлэлцээр', n: 60 }, { label: 'Шүүх', n: 28 }],
      },
      hse: { date: '2026-10-30', workers: 1311, equipment: 71, manHours: 10_488 },
      byType: [{ label: 'Орон сууцны хороолол', cost: 1.4e12, contract: 1.3e12, perf: 24.6, n: 7, contracted: 7 }],
      bySource: [{ label: 'Үнэт цаас', amount: 1.5e12, contracted: 6, n: 10 }],
    },
    prog: {
      blocks: 113, households: 8387, householdsMissing: 0, noData: 3, asOf: '2026-10-26',
      actual: 24.6, planned: 34.2, gap: 9.6, actualLag: 24.6, planExcluded: [], planCoverage: 100, planFailed: 0,
      packs: [
        { key: 'БАГЦ1', name: 'Багц 1', kind: 'build', blocks: 20, households: 1500, householdsMissing: 0, progress: 32.9 },
        { key: 'БАГЦ2', name: 'Багц 2', kind: 'build', blocks: 18, households: 1400, householdsMissing: 0, progress: 18.4 },
        { key: 'БАГЦ3', name: 'Багц 3', kind: 'build', blocks: 15, households: 1100, householdsMissing: 0, progress: null },
        { key: 'БАГЦ4', name: 'Багц 4', kind: 'build', blocks: 25, households: 1900, householdsMissing: 0, progress: 3.2 },
        { key: 'БАГЦ51', name: 'Багц 5.1', kind: 'infra', blocks: 0, households: 0, householdsMissing: 0, progress: 41 },
        { key: 'БАГЦ61', name: 'Багц 6.1', kind: 'infra', blocks: 0, households: 0, householdsMissing: 0, progress: 12.5 },
      ],
      levels: [{ label: 'Эхлэл', range: '0–25%', n: 60, color: '' }, { label: 'Дунд', range: '25–50%', n: 40, color: '' }, { label: 'Төгсгөл', range: '50–100%', n: 13, color: '' }],
    },
    fin: {
      planTotal: 2_100_000_000_000, given: 530_870_000_000, givenContracted: 524_900_000_000, givenOther: 5_970_000_000, share: 25.0, remain: 1_575_100_000_000,
      rows: [
        { key: 'БАГЦ1', label: 'Багц 1', plan: 400e9, budget: 400e9, given: 200e9, pct: 50, contracted: true },
        { key: 'БАГЦ2', label: 'Багц 2', plan: 300e9, budget: 300e9, given: 24e9, pct: 8, contracted: true },
        { key: 'БАГЦ3', label: 'Багц 3', plan: 250e9, budget: 250e9, given: 0, pct: 0, contracted: true },
        { key: 'БАГЦ4', label: 'Багц 4', plan: 0, budget: 500e9, given: 0, pct: null, contracted: false },
        { key: 'БАГЦ51', label: 'Багц 5.1', plan: 100e9, budget: 100e9, given: 60e9, pct: 60, contracted: true },
      ],
      ranges: [{ label: 'Багц-1-4', given: 876_465_164, members: ['БАГЦ1', 'БАГЦ2', 'БАГЦ3', 'БАГЦ4'] }],
      givenUnlisted: 0,
    },
    zov: {
      total: 40, ok: 30, wait: 7, no: 3, unknown: 0,
      byBagts: [{ bagts: 'Багц 1', total: 10, ok: 8, wait: 2, no: 0, unknown: 0 }],
      issues: [{ bagts: 'Багц 2', ner: 'Барилгын ажил эхлүүлэх зөвшөөрөл', baiguullaga: 'ХБХ', tolov: 'Зөвшөөрөөгүй', shat: 2 }],
    },
    fetchedAt: 1_767_000_000_000,
  };
}

export function deltasFixture() {
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  return {
    period: PERIOD,
    housing: { prev: 21.9, now: 24.6, delta: 2.7, prevAt: '2026-09-27', nowAt: '2026-10-26', prevInside: false },
    packs: [{ key: 'БАГЦ1', label: 'Багц 1', prev: 30, now: 32.9, delta: 2.9 }],
    given: { prev: 500e9, now: 530.87e9, delta: 30.87e9, count: 4, undated: 0 },
    givenByKey: { БАГЦ1: 20e9, БАГЦ2: 10.87e9 },
    workers: { prev: 1200, now: 1311, delta: 111, prevAt: '2026-09-30', nowAt: '2026-10-30', prevInside: false },
    technik: { prev: 60, now: 71, delta: 11, prevAt: '2026-09-30', nowAt: '2026-10-30', prevInside: false },
    zov: { ok: 2, no: 1, wait: 0 },
    series: {
      months,
      housingPlan: [10, 16, 22, 28, 34.2],
      housingActual: [8, null, 18, 21.9, 24.6],
      packs: [{ key: 'БАГЦ1', label: 'Багц 1', kind: 'build', values: [12, 18, 24, 30, 32.9] }],
      paidMonthly: [100e9, 0, 150e9, 250e9, 30.87e9],
      paidCum: [100e9, 100e9, 250e9, 500e9, 530.87e9],
      paidCumPct: [4.76, 4.76, 11.9, 23.8, 25.28],
    },
  };
}

/** Бүрэн оролт — заавал биш эх бүгд ирсэн */
export function inputsFixture(over = {}) {
  return {
    x: execReportFixture(),
    d: deltasFixture(),
    project: { S: 31.7, P: 45.2 },
    phases: [
      { key: 'tezu:0', label: 'ТЭЗҮ', S: 100, P: 100 },
      { key: 'zurag:1', label: 'Зураг төсөл', S: 88.5, P: 95 },
      { key: 'gazar:2', label: 'Газар чөлөөлөлт', S: 82.4, P: 100 },
      { key: 'zovshoorol:3', label: 'Зөвшөөрөл', S: 75, P: 90 },
      { key: 'songon:4', label: 'Сонгон шалгаруулалт', S: 70, P: 85 },
      { key: 'barilga:5', label: 'Барилга угсралт', S: 26.7, P: 38 },
      { key: 'huleelgeh:6', label: 'Хүлээлгэн өгөх', S: null, P: 0 },
    ],
    buildSub: [{ key: 'barilga:beltgel', label: 'Бэлтгэл ажил', S: 61, P: 80 }, { key: 'barilga:barilga', label: 'Барилга угсралт ажил', S: 24.6, P: 34.2 }],
    ipc: { work: 12e9, created: 8e9, signed: 5e9, paid: 530.87e9 },
    lag: [
      { key: 'БАГЦ1', label: 'Багц 1', planned: 36, actual: 32.9, gap: 3.1, coverage: 100 },
      { key: 'БАГЦ2', label: 'Багц 2', planned: 30.4, actual: 18.4, gap: 12, coverage: 100 },
      { key: 'БАГЦ4', label: 'Багц 4', planned: 20, actual: 3.2, gap: 16.8, coverage: 60 },
    ],
    saad: [{ key: 'БАГЦ2', name: 'Багц 2', n: 14 }, { key: 'БАГЦ4', name: 'Багц 4', n: 3 }, { key: 'БАГЦ9', name: 'Багц 9', n: 0 }],
    hseDays: [{ key: '2026-09-30', workers: 1200, technik: 60 }, { key: '2026-10-15', workers: 1250, technik: null }, { key: '2026-10-30', workers: 1311, technik: 71 }],
    niigem: [{ name: 'Сургууль 960 хүүхэд', pct: 15, bagts: '16.1' }, { name: 'Цэцэрлэг 240 хүүхэд', pct: 0, bagts: '16.2' }, { name: 'Эмнэлэг', pct: null, bagts: '16.3' }],
    cashOutlook: { months: ['2026-11', '2026-12', '2027-01'], planned: [90e9, 120e9, 60e9] },
    today: '2026-11-05',
    period: PERIOD,
    user: 'Тэст Хэрэглэгч',
    failed: [],
    ...over,
  };
}
