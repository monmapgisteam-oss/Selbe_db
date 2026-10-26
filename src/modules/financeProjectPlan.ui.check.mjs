/**
 * «ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ» таб (Finance.tsx) ба «Хуваарь» эхтэй гэрээний 5-р түвшний сарууд — Node дээр,
 * сүлжээгүй (2026-10-26).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/financeProjectPlan.ui.check.mjs
 *
 * Шалгана:
 *   §1 `huvMonthRows` — тооцоолсон сар → OID-гүй синтетик мөр; `Cashflow_huwi` 0–100, ХО дүнгүй бол null (0 биш)
 *   §2 `ProjectPlanTable` — Excel-ийн толгой, модны байрлалын Д/Д, null → «—», эвхэлт (түвшин 2),
 *      мөнгөний мөрийн «Гараар/Хуваарь» тэмдэг, `canSwitch`-тэй үед л «Хуваарь руу шилжүүлэх»
 *   §3 эх кодын хамгаалалт — `publish` 'huvaari' гэрээний сарыг нэмэх/устгахгүй
 *
 * ⚠️ `*.ui.check.mjs` нэр ЗААВАЛ — `ts-alias` CSS/next/dynamic стубуудыг үүгээр залгана (`smoke.ui.check`-ийн ⚠️).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ══════════ 0. Хөтөчийн хамгийн бага глобалууд (импортоос ӨМНӨ) ══════════ */
const g = globalThis;
const noop = () => {};
const store = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
};
const listeners = { addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true };
const elem = (tag = 'div') => ({
  tagName: String(tag).toUpperCase(), style: {}, dataset: {}, children: [], childNodes: [],
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop, getAttribute: () => null, removeAttribute: noop, appendChild: (c) => c, removeChild: (c) => c,
  querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
  ...listeners,
});
class ObsStub { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
Object.assign(g, {
  window: g,
  document: {
    documentElement: { ...elem('html'), lang: 'mn', clientWidth: 1280, clientHeight: 800 },
    body: elem('body'), head: elem('head'), createElement: (t) => elem(t), createElementNS: (_, t) => elem(t),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], cookie: '', visibilityState: 'visible',
    ...listeners,
  },
  localStorage: store(), sessionStorage: store(),
  matchMedia: (q) => ({ matches: false, media: q, addListener: noop, removeListener: noop, ...listeners }),
  ResizeObserver: ObsStub, IntersectionObserver: ObsStub, MutationObserver: ObsStub,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: (id) => clearTimeout(id),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  location: Object.assign(new URL('http://localhost/'), { assign: noop, replace: noop, reload: noop }),
  history: { pushState: noop, replaceState: noop, length: 1, state: null },
  innerWidth: 1280, innerHeight: 800, confirm: () => false,
  HTMLElement: function HTMLElement() {}, Element: function Element() {}, Node: function Node() {},
});
if (!g.navigator) g.navigator = {};
g.fetch = () => Promise.reject(new Error('сүлжээгүй'));
process.on('unhandledRejection', () => {});
for (const fn of ['setInterval', 'setTimeout']) {
  const orig = g[fn];
  g[fn] = (...a) => { const t = orig(...a); t?.unref?.(); return t; };
}

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const { huvMonthRows, ProjectPlanTable } = await import('@/modules/Finance');
const { assemblePlan } = await import('@/lib/projectPlanInputs');
const { SRC_HUVAARI, SRC_MANUAL } = await import('@/lib/monthlyMoney');

let n = 0;
const check = (name, fn) => { fn(); n += 1; void name; };

/* ══════════ §1 huvMonthRows ══════════ */
check('huvMonthRows', () => {
  const money = {
    contracts: new Map([
      [7, { id: 7, source: SRC_HUVAARI, pkg: 'БАГЦ1', cost: 1000, months: new Map([['2026-03', 250], ['2026-01', 100]]), state: 'ok', share: 1 }],
      [8, { id: 8, source: SRC_HUVAARI, pkg: 'БАГЦ2', cost: null, months: new Map([['2026-02', 40]]), state: 'ok', share: 1 }],
      [9, { id: 9, source: SRC_MANUAL, pkg: 'БАГЦ3', cost: 500, months: new Map([['2026-02', 40]]), state: 'manual', share: null }],
    ]),
    pkgs: new Map(), rows: [], issues: [],
  };
  const m = huvMonthRows(money);
  assert.deepEqual([...m.keys()].sort(), [7, 8], "'garaar' гэрээ синтетик мөргүй");
  const r7 = m.get(7);
  assert.equal(r7.length, 2);
  assert.equal(r7[0].Cashflow_start, Date.UTC(2026, 0, 1, 12), 'сараар эрэмбэлэгдсэн, UTC үд дунд');
  assert.equal(r7[0].Cashflow_end, Date.UTC(2026, 1, 0, 12));
  assert.equal(r7[1].Cashflow_huwi, 25, 'дүн ÷ ХО дүн × 100 (0–100)');
  assert.equal(r7[1].Cashflow_dun, 250);
  assert.equal(r7[0].OBJECTID, undefined, 'OID-гүй — засагдахгүй');
  assert.equal(m.get(8)[0].Cashflow_huwi, null, 'ХО дүнгүй → null (0 биш)');
  assert.equal(huvMonthRows(null).size, 0);
});

/* ══════════ §2 ProjectPlanTable ══════════ */
const D = (y, m, d) => Date.UTC(y, m - 1, d);
const rows = [
  { dd_kod: '1', etseg_kod: null, uy_shat: 'ТЭЗҮ', ajil_uilchilgee: 'ТЭЗҮ', tusul_ezleh_huvi: 0.4 },
  { dd_kod: '1.1', etseg_kod: '1', uy_shat: 'ТЭЗҮ', bagts: 'Багц-1', ajil_uilchilgee: 'ТЭЗҮ боловсруулах',
    heseg_ezleh_huvi: 1, geree_ehleh: D(2026, 1, 1), geree_duusah: D(2026, 12, 31), guitsetgel_huvi: 30, cashflow_id: 7 },
  { dd_kod: '2', etseg_kod: null, uy_shat: 'Ажлын зураг төсөл', ajil_uilchilgee: 'Ажлын зураг төсөл', tusul_ezleh_huvi: 0.6 },
  { dd_kod: '2.1', etseg_kod: '2', uy_shat: 'Ажлын зураг төсөл', bagts: 'Багц-2', ajil_uilchilgee: 'Зураг', heseg_ezleh_huvi: 1, cashflow_id: 8 },
  { dd_kod: '2.1.1', etseg_kod: '2.1', uy_shat: 'Ажлын зураг төсөл', ajil_uilchilgee: 'Гүн дэд мөр', heseg_ezleh_huvi: 1 },
];
const plan = assemblePlan(rows, { actual: { blocks: null, universe: null, infra: null }, sched: null, land: new Map() }, D(2026, 7, 2));
const works = [
  { OBJECTID: 1, Cashflow_ID: 7, bagts: 'Багц-1', sar_mongo_eh: null },
  { OBJECTID: 2, Cashflow_ID: 8, bagts: 'Багц-2', sar_mongo_eh: 'huvaari' },
];
const months = [{ OBJECTID: 11, Cashflow_ID: 7, Cashflow_start: D(2026, 1, 1) }];
const render = (canSwitch, ws = works) => renderToStaticMarkup(React.createElement(ProjectPlanTable, {
  plan, works: ws, months, monthsError: false, canSwitch, onSaved: noop,
}));

check('толгой ба мөр', () => {
  const html = render(false);
  for (const s of ['Д/Д', 'Багц', 'Ажлын нэр', 'Урьдчилсан төсөвт өртөг', 'Хэсэгт эзлэх', 'Төсөлд эзлэх',
    'Төлөвлөгөөт хувь', 'Гүйцэтгэлийн хувь', 'Биелэлт', 'Сарын мөнгө', 'Төслийн нийт']) {
    assert.ok(html.includes(s), `толгой: ${s}`);
  }
  assert.ok(html.includes('ТЭЗҮ боловсруулах'), 'түвшин 2 дэлгэгдсэн');
  assert.ok(!html.includes('Гүн дэд мөр'), 'түвшин 3 анхдагчаар хумигдсан');
  assert.ok(/<td[^>]*>2\.1<\/td>/.test(html), 'Д/Д модны байрлалаас');
  assert.ok(html.includes('—'), 'null → «—»');
  assert.ok(html.includes('30.0%') || html.includes('30,0%'), 'S = хадгалсан guitsetgel_huvi (0–100, ×100 үгүй)');
  assert.ok(html.includes('Гараар') && html.includes('Хуваарь'), 'сарын мөнгөний эхийн тэмдэг');
  assert.ok(!html.includes('Хуваарь руу шилжүүлэх'), 'эрхгүй бол товчгүй');
});

check('шилжүүлэх товч — эрхтэй, зөвхөн гараар гэрээнд', () => {
  const html = render(true);
  const cnt = html.split('Хуваарь руу шилжүүлэх').length - 1;
  assert.equal(cnt, 1, "'huvaari' гэрээнд товч гарахгүй, 'garaar'-д нэг");
  /* ⚠️ хяналт №2: uy_shat хоосон (импортоос өмнөх) — товч ХААЛТТАЙ, шалтгаантай */
  const btn = (h) => h.match(/<button[^>]*>Хуваарь руу шилжүүлэх<\/button>/)?.[0] ?? '';
  assert.match(btn(html), /disabled=""/, 'хоосон үе шат — хаалттай');
  assert.match(btn(html), /тодорхойгүй/, 'шалтгааныг title-д');
  const ws2 = [{ ...works[0], uy_shat: 'Барилга угсралт' }, works[1]];
  assert.doesNotMatch(btn(render(true, ws2)), /disabled=""/, '«Барилга угсралт» — нээлттэй');
  const ws3 = [{ ...works[0], uy_shat: 'Ажлын зураг төсөл' }, works[1]];
  assert.match(btn(render(true, ws3)), /disabled=""/, 'зураг төслийн гэрээ — хаалттай');
});

/* ══════════ §3 Эх кодын хамгаалалт ══════════ */
check('publish — huvaari гэрээний сарыг нийцүүлэхгүй', () => {
  const src = readFileSync(new URL('./Finance.tsx', import.meta.url), 'utf8');
  assert.match(src, /if \(monthSourceOf\(r\?\.\[CASHFLOW_NEW\.fields\.monthSource\]\) === SRC_HUVAARI\) continue;/);
  assert.match(src, /<FullTable[\s\S]{0,600}huv=\{huv\}/, 'гэрээний бүртгэлд тооцоолсон сар');
  assert.match(src, /<CashflowPlan[\s\S]{0,400}canSwitch=\{canSwitch\}[\s\S]{0,60}money=\{money\}/);
});

check('шилжүүлэлт — хоёр харагдац НЭГ урсгалаар (preview · 2 цонх · expect)', () => {
  const fin = readFileSync(new URL('./Finance.tsx', import.meta.url), 'utf8');
  const cfp = readFileSync(new URL('./CashflowPlan.tsx', import.meta.url), 'utf8');
  for (const [name, src] of [['Finance', fin], ['CashflowPlan', cfp]]) {
    assert.match(src, /confirmAndSwitch\(\{/, `${name}: confirmAndSwitch`);
    assert.doesNotMatch(src, /switchToHuvaari\(/, `${name}: шууд switchToHuvaari дуудахгүй (preview-гүй зам)`);
  }
});

console.log(`financeProjectPlan: ${n} шалгуур давлаа`);
