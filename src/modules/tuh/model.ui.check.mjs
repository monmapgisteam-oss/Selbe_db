/**
 * «ТУХ» ЗАГВАРЫН (`buildModel`) ХОЛБОЛТЫН ШАЛГУУР — сүлжээгүй, хуурамч өгөгдлөөр.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/tuh/model.ui.check.mjs
 *
 * ⚠️ `*.ui.check.mjs` нэр ЗААВАЛ — `model.ts` нь `Finance.tsx` (JSX, CSS) импортлодог тул
 *    `tools/ts-alias.mjs`-ийн UI стубууд хэрэгтэй.
 *
 * Хамгаалж буй алдаанууд (2026-09-30):
 *   1. Барилгын давхарга ирээгүй/унасан үед «0 айл · 0 блок» (null ≠ 0).
 *   2. Нэг HO гэрээ зураг төслийн мөр ба барилгын мөрд ХОЁУЛАНД наалдах (мөнгө холилдох).
 *   3. Нийт олголтын хувь дүнгүй гэрээний олголтоор хөөрөгдөх (`ipcTotals`-аас өөр тоо).
 *   4. Тайлангүй компани «0 хүн», хоосон өдөр 0 багана.
 *   5. 7 хоногийн ахиц хувьсах хуваагчтай (шинэ блок → сөрөг).
 *   6. Гэрээний төлөвлөгөө ЭНЭ сарын бүтэн дүнгээр (хэмжилтийн өдрөөр биш).
 *   7. Гүйцэтгэгчийн төслийн төлөвлөгөө ӨНӨӨДРӨӨР («Гүйцэтгэл»-ийн хэмжилтийн өдрөөс өөр).
 * 2026-10-01 (хэрэглэгч: бүгдийг зас):
 *   9–14. Зураг төсөл «Мэдээлэлгүй», карт бүрийн сүүлийн тайлан (14+ хоног тодорно),
 *         хувьд ороогүй олголт, хянагдаж буй AUTO IPC, ачаалж байхад «…», хоосон хэсэг хураагдсан.
 */
import assert from 'node:assert/strict';

/* ⚠️ Орон нутгийн сар/өдөр — УБ (импортоос ӨМНӨ) */
process.env.TZ = 'Asia/Ulaanbaatar';

/* ══ Хөтөчийн глобалууд (импортоос ӨМНӨ) — smoke.ui.check.mjs-ийн дэд олонлог ══ */
const g = globalThis;
const noop = () => {};
const listeners = { addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true };
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(String(k), String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } }; };
class RO { observe() {} unobserve() {} disconnect() {} }
const elem = () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, getAttribute: () => null, appendChild: (c) => c, removeChild: (c) => c, querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }), ...listeners });
Object.assign(g, {
  window: g,
  document: { documentElement: { ...elem(), lang: 'mn' }, body: elem(), head: elem(), createElement: elem, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, hidden: false, visibilityState: 'visible', cookie: '', ...listeners },
  localStorage: store(), sessionStorage: store(),
  matchMedia: (q) => ({ matches: false, media: q, addListener: noop, removeListener: noop, ...listeners }),
  ResizeObserver: RO, IntersectionObserver: RO, MutationObserver: RO,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: (id) => clearTimeout(id),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  scrollTo: noop, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  location: Object.assign(new URL('http://localhost/'), { assign: noop, replace: noop, reload: noop }),
  history: { pushState: noop, replaceState: noop, back: noop, length: 1, state: null },
  HTMLElement: function HTMLElement() {}, Element: function Element() {}, Node: function Node() {},
  ...listeners,
});
if (!g.navigator) g.navigator = {};
g.fetch = () => Promise.reject(new Error('model.ui.check: сүлжээгүй'));
process.on('unhandledRejection', noop);
for (const fn of ['setInterval', 'setTimeout']) {
  const orig = g[fn];
  g[fn] = (...a) => { const t = orig(...a); t?.unref?.(); return t; };
}

const { buildModel } = await import('./model.ts');
const { monthKey } = await import('@/lib/format');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };
const near = (a, b, msg) => assert.ok(a != null && Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≉ ${b}`);

/* ══ Хуурамч өгөгдөл ══ */
const CR = (o) => ({
  OBJECTID: o.oid, bagts: o.pkg, bagts_tuvshin1: o.code ?? '2',
  ajil_tuvshin1: '', ajil_tuvshin2: o.t2 ?? '', ajil_tuvshin3: o.t3 ?? '',
  ajil_uilchilgee: o.name ?? '', ho_dun_geree: o.cost ?? null, ho_dungiin_tailbar: o.note ?? '',
  /* ⚠️ 2026-10-01: гэрээлсэн дүн — `paidShare.paidShareOf`-ийн хуваарь (Cashflow, CONTRACTED) */
  geree_dun: o.contract ?? null,
  guitsetgegch: '', guitsetgel_huvi: o.prog ?? null, ehleh_ognoo: null, duusah_ognoo: null, Cashflow_ID: o.cf ?? null,
});
const HOUSING = 'ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт';
const INFRA = 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ - Барилга угсралт';
const contracts = [
  CR({ oid: 11, pkg: 'БАГЦ-1', t2: HOUSING, cost: 1000, note: 'Гэрээлсэн дүн', cf: 7, contract: 800 }),
  CR({ oid: 1, pkg: 'Багц 7.1', code: '1', cost: 50, note: 'Гэрээлсэн дүн' }),
  CR({ oid: 56, pkg: 'БАГЦ-7.1', t2: INFRA, t3: 'Инженерийн бэлтгэл ажил', cost: 500, note: 'Гэрээлсэн дүн', prog: 10, contract: 400 }),
];
const PAY = (code, pkg, dun, date, no = null) => ({ geree_kod: code, bagts: pkg, dun, guilgee_ognoo: date, ipc_dugaar: no, tulult_turul: 'Гүйцэтгэл' });
const HC = (o) => ({
  code: o.code, key: o.key, pkg: o.pkg, project: '', contractor: '', workType: o.workType ?? 'Барилга угсралт',
  contractNo: '', budgetTotal: null, contractTotal: o.total, saving: null, pays: o.pays,
  advanceTotal: null, workTotal: null, paidTotal: o.paid, paidPct: null,
});
/* ⚠️ 2026-10-01: AUTO мөр (гүйцэтгэлээс үүссэн, `dun` хоосон) — «Хянагдаж буй IPC» */
const AUTO1 = { murun_id: 'AUTO|БАГЦ1|2026-09-09', geree_kod: 'Багц-1', bagts: 'Багц-1', dun: null, guits_une: 500, guilgee_ognoo: '2026-09-09', ipc_dugaar: null, tulult_turul: 'Гүйцэтгэл' };
const p1 = [PAY('Багц-1', 'Багц-1', 200, '2026-08-10', 1), AUTO1];
const p71 = [PAY('Багц-7.1', 'Багц-7.1', 100, '2026-08-01', 1)];
const p45 = [PAY('', '', 300, '2026-07-01')];
const contractsHo = [
  HC({ code: 'Багц-1', key: 'БАГЦ1', pkg: 'Багц-1', total: 800, paid: 200, pays: p1 }),
  HC({ code: 'Багц-7.1', key: 'БАГЦ71', pkg: 'Багц-7.1', total: 400, paid: 100, pays: p71 }),
  /* гэрээт дүн ТОДОРХОЙГҮЙ гэрээ — хувьд орохгүй */
  HC({ code: '', key: '', pkg: '', total: null, paid: 300, pays: p45 }),
];
const M = (o) => new Map(Object.entries(o).map(([k, v]) => [k, new Map(Object.entries(v))]));
const fin = {
  contracts,
  planTotal: new Map(),
  given: new Map(),
  givenTotal: new Map(),
  phys: M({ БАГЦ1: { '2026-08': 20 } }),
  physCnt: M({ БАГЦ1: { '2026-08': 2 } }),
  physAt: M({ БАГЦ1: { '2026-08': '2026-08-05' } }),
  pays: [...p1, ...p71, ...p45],
  contractsHo,
};
const series = [{ label: '2026-07', pct: 10, vol: null }, { label: '2026-08', pct: 41, vol: null }, { label: '2026-09', pct: 70, vol: null }];
const plan = { months: series, bySheet: new Map(), byBagts: new Map([['БАГЦ1', series]]), from: null, to: null, failed: [] };
const cfPlan = [
  { id: 7, start: Date.UTC(2026, 6, 1), pct: 30, amount: null },
  { id: 7, start: Date.UTC(2026, 7, 1), pct: 31, amount: null },
  { id: 7, start: Date.UTC(2026, 8, 1), pct: 39, amount: null },
];
/* 7 хоногийн ахиц — ӨНӨӨДРИЙН өдөртэй харьцангуй (тест хэзээ ч ажилласан) */
const dd = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hist = new Map([
  ['Багц 1|5/1', [{ date: dd(-10), pct: 50 }]],
  ['Багц 1|5/2', [{ date: dd(-2), pct: 10 }]],
]);
const comp = (w, t, mo, ga) => ({ workers: w, technik: t, mongol: mo, gadaad: ga, bagts: 'Багц -1' });
const workforce = {
  latestKey: dd(-1), prevKey: dd(-2), workersLatest: 0, workersPrev: 120, delta: -120, deltaPct: -100,
  manHours: null, technik: 0, headerWorkers: null, staleDays: 1, unreported: ['HHDMGK'],
  companies: [{ sfx: 'HHDMGK', label: 'x', bagts: 'Багц -1', workers: 0, technik: 0, mongol: null, gadaad: null, prev: 120, delta: -120, deltaPct: -100, unreported: true }],
  days: [
    { key: dd(-1), at: 2, oid: 2, rowsInDay: 1, header: { workers: null, manHours: null, technik: null }, comp: { HHDMGK: comp(0, 0, null, null) }, workers: null, technik: null },
    { key: dd(-2), at: 1, oid: 1, rowsInDay: 1, header: { workers: null, manHours: null, technik: null }, comp: { HHDMGK: comp(120, 5, 100, 20) }, workers: 120, technik: 5 },
  ],
};
const docs = [
  { oid: 1, kind: 'MA', docNo: 'x', org: '', bagts: 'Багц 7.1', seq: 1, rev: 0, title: 'a', status: 'Батлагдсан', author: '', sentAt: null, reviews: {}, decidedAt: null, rep: null },
];
const input = (over = {}) => ({
  fin, plan, cfPlan, packs: null, hist, commission: new Map(), workforce, docs,
  contractedNote: 'Гэрээлсэн дүн', failed: [], ...over,
});

const m = buildModel(input());
const h1 = m.rows.find((r) => r.p.key === 'БАГЦ1');
const d71 = m.rows.find((r) => r.p.key === 'd:1');
const b71 = m.rows.find((r) => r.p.pkgKey === 'БАГЦ71' && r.p.group !== 'design');

console.log('\n1. Блок, айл — давхарга ирээгүй бол «—»');
ok('packs null → blocks/households null (0 биш)', () => {
  assert.equal(h1.blocks, null);
  assert.equal(h1.households, null);
});
ok('давхарга ирсэн — тоо', () => {
  const pk = [{ key: 'БАГЦ1', name: 'Багц 1', kind: 'build', layerIds: [], where: null, blocks: [{}, {}], households: 96, progress: null }];
  const r = buildModel(input({ packs: pk })).rows.find((x) => x.p.key === 'БАГЦ1');
  assert.equal(r.blocks, 2);
  assert.equal(r.households, 96);
  assert.equal(buildModel(input({ packs: [] })).rows.find((x) => x.p.key === 'БАГЦ1').blocks, 0, 'ирсэн ч блокгүй — жинхэнэ 0');
});

console.log('\n2. Нэг гэрээ — нэг мөр');
ok('зураг төслийн мөр барилгын HO гэрээ/сарын цэг/MA/ХАБЭА-г авахгүй', () => {
  assert.ok(d71 && b71);
  assert.equal(d71.own, false, 'хуваарь ч эзэн мөрд л (PkgDetail.hasSheets)');
  assert.equal(b71.own, true);
  assert.equal(h1.own, true);
  assert.equal(d71.ipc, null);
  assert.equal(d71.months, null);
  assert.equal(d71.ma, null);
  assert.equal(b71.ipc?.contracts.length, 1);
  assert.equal(b71.ma?.approved, 1);
});
ok('IPC-ийн хүснэгтэд гэрээ бүр ЯГ НЭГ удаа', () => {
  const codes = m.rows.filter((r) => r.ipc).flatMap((r) => r.ipc.contracts.map((c) => c.code));
  assert.deepEqual(codes.sort(), ['Багц-1', 'Багц-7.1']);
});

console.log('\n3. Нийт олголтын хувь — paidShareOf (Тайлан/CEO-тэй нэг, 2026-10-01)');
ok('(200 + 100) ÷ Cashflow гэрээлсэн (800 + 400) = 25% — гэрээлсэн багцаас гадуурх 300 хувьд орохгүй', () => {
  assert.equal(m.paid.total, 600, 'нийт олгосон — БҮХ гэрээ');
  near(m.paid.pct, 25, 'урьд нь 50%');
});

console.log('\n4. ХАБЭА — тайлангүй компани');
ok('тайлангүй → «—» (0 хүн биш); хоосон өдөр null', () => {
  assert.equal(h1.workers, null);
  assert.equal(h1.technik, null);
  assert.deepEqual(h1.workerDays.map((d) => d.value), [120, null]);
});

console.log('\n5. 7 хоногийн ахиц — тогтмол хуваагч');
ok('шинэ блок анх тайлагнасан ч СӨРӨГ биш: (50+10)/2 − 50/2 = +5', () => near(h1.week, 5));

console.log('\n6. Гэрээний төлөвлөгөө — хэмжилтийн өдрөөр (2026-08-05)');
ok('30 + 31 × 5/31 = 35 (урьд нь энэ сарын бүтэн 100)', () => {
  assert.equal(h1.progress, 20);
  near(h1.planContract, 35);
  near(h1.gapContract, -15);
});

console.log('\n7. Төслийн гүйцэтгэгчийн төлөвлөгөө — «Гүйцэтгэл»-ийн хэмжилтийн өдрөөр');
ok('planPctAt(months, 2026-08-05) = 10 + 31 × 5/31 = 15 (өнөөдрөөр биш)', () => {
  assert.equal(m.hero.actual, 20);
  near(m.hero.planContractor, 15);
});

console.log('\n8. Зурагдах (SSR)');
{
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { Overview } = await import('./Overview.tsx');
  const { PkgDetail } = await import('./PkgDetail.tsx');
  ok('Тойм: айлын тоо «—» (давхарга ирээгүй), шидэхгүй', () => {
    const html = renderToStaticMarkup(React.createElement(Overview, { m, contractTotal: null, onOpen: noop }));
    assert.ok(html.includes('—<small>айл</small>'), 'айл «—»');
    assert.ok(!html.includes('0<small>айл</small>'));
  });
  ok('Дэлгэрэнгүй: хүн хүч «—» (тайлангүй), шидэхгүй', () => {
    const html = renderToStaticMarkup(React.createElement(PkgDetail, { r: h1, m, onBack: noop, onOpen: noop }));
    assert.ok(html.includes('—<small>хүн</small>'), 'хүн «—»');
  });
  ok('0 багц — шидэхгүй', () => {
    const empty = buildModel(input({ fin: { ...fin, contracts: [], contractsHo: [], pays: [] } }));
    assert.equal(empty.rows.length, 0);
    renderToStaticMarkup(React.createElement(Overview, { m: empty, contractTotal: null, onOpen: noop }));
  });

  /* ═══════════════ 2026-10-01 (хэрэглэгч: бүгдийг зас) ═══════════════ */
  console.log('\n9. Зураг төсөл — хоосон шатны талбар «Мэдээлэлгүй» (Эхлээгүй биш)');
  ok('d:1 — гүйцэтгэл null, төлөв unknown', () => {
    assert.equal(d71.progress, null);
    assert.equal(d71.status, 'unknown');
    assert.equal(m.statusCount.get('unknown'), 1);
  });

  console.log('\n10. Сүүлд тайлагнасан — карт бүрд, 14+ хоног тодорно');
  const html = renderToStaticMarkup(React.createElement(Overview, { m, contractTotal: null, onOpen: noop }));
  ok('БАГЦ1 — 2026-08-05, хоцорсон тайлан data-stale', () => {
    assert.equal(h1.lastReport, '2026-08-05');
    assert.ok(h1.reportAge >= 14);
    assert.ok(html.includes('data-stale="true"'));
    assert.ok(html.includes('2026-08-05'));
    assert.equal(b71.lastReport, null, 'сарын цэггүй мөр — «—»');
  });

  console.log('\n11. Хувьд ороогүй олголт — тусад нь нэрлэнэ');
  ok('m.paid.other = 300; KPI-д бичигдэнэ', () => {
    assert.equal(m.paid.other, 300);
    assert.ok(html.includes('гэрээлсэн багцаас гадуур олгосон 300 ₮ (хувьд ороогүй)'));
  });

  console.log('\n12. Хянагдаж буй IPC — AUTO, олгоогүй');
  ok('БАГЦ1: 1 акт · 500 ₮ · 2026-09-09; олголтын тоо, огноо хөдлөхгүй', () => {
    assert.deepEqual(h1.ipc.review, { count: 1, une: 500, oldest: '2026-09-09', latest: '2026-09-09' });
    assert.equal(h1.ipc.lastPaidDate, '2026-08-10');
    assert.equal(m.paid.ipcCount, 2);
    assert.ok(html.includes('1 акт · 500 ₮'));
  });

  console.log('\n13. Ачаалж байхад «…», дууссан бол «—»');
  ok('барилга, гэрээний төлөвлөгөө, комисс ачаалж байна → «…»', () => {
    const ml = buildModel(input({ cfPlan: null, loading: new Set(['packs', 'cfPlan', 'commission', 'budget']) }));
    const hl = renderToStaticMarkup(React.createElement(Overview, { m: ml, contractTotal: null, onOpen: noop }));
    assert.ok(hl.includes('…<small>айл</small>'), 'айл «…»');
    assert.ok(!hl.includes('—<small>айл</small>'));
    const hd = renderToStaticMarkup(React.createElement(PkgDetail, { r: ml.rows.find((x) => x.p.key === 'БАГЦ1'), m: ml, onBack: noop, onOpen: noop }));
    assert.ok(hd.includes('Гэрээний төлөвлөгөө …'), 'дэлгэрэнгүй — гэрээний төлөвлөгөө «…»');
  });

  console.log('\n14. Хоосон хэсэг хураагдсан, төлвийн тоо товч');
  ok('ТУХ-ын арга хэмжээ <details>; төлвийн товчнууд', () => {
    assert.ok(/<details[^>]*>\s*<summary><h2>ТУХ-ын төсөл дамнасан арга хэмжээ<\/h2>/.test(html));
    assert.ok(html.includes('aria-pressed="false"'));
    const hd = renderToStaticMarkup(React.createElement(PkgDetail, { r: h1, m, onBack: noop, onOpen: noop }));
    assert.ok(/<details[^>]*>\s*<summary><h2>Зураг<\/h2>/.test(hd));
  });
}

assert.equal(monthKey(Date.UTC(2026, 4, 31, 16)), '2026-06', 'TZ = УБ');
console.log(`\nmodel.ui.check: ${n} шалгуур ✅`);
