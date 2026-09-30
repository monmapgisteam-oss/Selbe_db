/**
 * UI SMOKE — харагдац/компонент бүрийг Node дээр `renderToStaticMarkup`-аар
 * АНХНЫ (ачаалалтын) төлөвт нь зурна — сүлжээгүй, хөтөчгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/smoke.ui.check.mjs
 *   … smoke.ui.check.mjs --list      — жагсаалт л
 *   … smoke.ui.check.mjs Dashboard   — нэрэнд таарах тохиолдлууд л (--dump: markup хэвлэнэ)
 *
 * ⚠️ ЯАГААД (2026-09-30): 112 `.tsx` файл нэг ч компонентын тестгүй байсан —
 *    JSX-ийн эвдрэл, буруу hook дараалал, provider-гүй `useContext`, импортын
 *    тойрог зэрэг нь ЗӨВХӨН хөтөчид нээхэд илэрдэг байв. Энэ шалгуур тэднийг
 *    `npm test`-д барина: шидэхгүй · markup хоосон биш · зарим монгол шошго байна.
 *
 * ⚠️ `*.ui.check.mjs` нэр нь ЗААВАЛ: `tools/ts-alias.mjs` тэр нэрээр UI горимоо
 *    асааж CSS / next/dynamic / @arcgis/core стубуудыг залгана (`ts-alias-hooks.mjs`).
 *    Бусад шалгуурт стуб ОРОХГҮЙ.
 *
 * ⚠️ Глобалууд (`window`, `document`, `localStorage`, `matchMedia`, `ResizeObserver`
 *    …) ЗӨВХӨН ЭНЭ ФАЙЛД, импортоос ӨМНӨ тавигдана — модулийн дээд түвшний
 *    `typeof window` шалгалт «хөтөч» гэж үзнэ. `fetch` ямагт татгалзана (сүлжээ
 *    ҮГҮЙ) — `useAsync` нь SSR-д эффект ажиллуулдаггүй тул харагдац «Татаж
 *    байна…» төлөвтөө үлдэнэ; module-level дуудалтын татгалзлыг тоолно (унагахгүй).
 *
 * ⚠️ Дараах нь SSR-д ЗУРАГДАХГҮЙ тул `skip` (шалтгаантай) — худал амжилт биш:
 *      · `MapCanvas` — ArcGIS `MapView`-г `useLayoutEffect`-д үүсгэдэг, markup нь
 *        хоосон контейнер л; стубаар «зурлаа» гэх нь утгагүй.
 *      · `AgentChat` — WebSocket/EventSource; `DocViewer` — `open` үед л агуулгатай.
 *    Шинэ харагдац нэмэхдээ доорх `CASES`-д нэг мөр нэмнэ — `Portal`-ын дотор
 *    `dynamic()`-оор ачаалагддаг бол `preloadDynamic()`-ийн дараа Portal-ын
 *    markup-д өөрөө орно (тэр ч ажиллаж байгааг «Portal» тохиолдол батална).
 */
import assert from 'node:assert/strict';

/* ══════════ 0. Хөтөчийн глобалууд (импортоос ӨМНӨ) ══════════ */
const g = globalThis;
const store = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
};
const noop = () => {};
const listeners = { addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true };
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
class IntersectionObserverStub { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
const matchMedia = (q) => ({ matches: false, media: q, onchange: null, addListener: noop, removeListener: noop, ...listeners });
const elem = (tag = 'div') => ({
  tagName: String(tag).toUpperCase(), style: {}, dataset: {}, children: [], childNodes: [],
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop, getAttribute: () => null, removeAttribute: noop, appendChild: (c) => c, removeChild: (c) => c,
  insertBefore: (c) => c, querySelector: () => null, querySelectorAll: () => [], getElementsByTagName: () => [],
  getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
  focus: noop, blur: noop, click: noop, remove: noop, contains: () => false, closest: () => null,
  scrollIntoView: noop, getContext: () => null, ...listeners,
});
const documentStub = {
  documentElement: { ...elem('html'), lang: 'mn', clientWidth: 1280, clientHeight: 800 },
  body: elem('body'), head: elem('head'), title: '',
  createElement: (t) => elem(t), createElementNS: (_, t) => elem(t), createTextNode: (s) => ({ nodeValue: s }),
  createDocumentFragment: () => elem('fragment'),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  activeElement: null, visibilityState: 'visible', hidden: false, cookie: '', readyState: 'complete',
  ...listeners,
};
Object.assign(g, {
  window: g,
  document: documentStub,
  localStorage: store(),
  sessionStorage: store(),
  matchMedia,
  ResizeObserver: ResizeObserverStub,
  IntersectionObserver: IntersectionObserverStub,
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  requestIdleCallback: (cb) => setTimeout(cb, 0),
  cancelIdleCallback: (id) => clearTimeout(id),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  scrollTo: noop, scroll: noop, alert: noop, confirm: () => false, prompt: () => null, open: () => null, print: noop,
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, screen: { width: 1280, height: 800 },
  location: Object.assign(new URL('http://localhost/'), { assign: noop, replace: noop, reload: noop }),
  history: { pushState: noop, replaceState: noop, back: noop, forward: noop, go: noop, length: 1, state: null },
  HTMLElement: function HTMLElement() {}, Element: function Element() {}, Node: function Node() {},
  MutationObserver: ResizeObserverStub,
  addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
});
if (!g.navigator) g.navigator = {};
try { Object.defineProperty(g.navigator, 'language', { value: 'mn', configurable: true }); } catch { /* тогтмол */ }

/* ⚠️ Сүлжээ ҮГҮЙ: `fetch` ямагт татгалзана; module-level дуудалт унагахгүй, тоолно. */
let fetchCalls = 0;
let unhandled = 0;
g.fetch = (input) => { fetchCalls++; return Promise.reject(new Error(`smoke: сүлжээгүй (${typeof input === 'string' ? input.slice(0, 60) : 'request'})`)); };
process.on('unhandledRejection', () => { unhandled++; });
/* ⚠️ Модулийн түвшний `setInterval`/`setTimeout` процессыг барихгүй (`unref`) —
   `process.exit()` дуудахгүй (Windows дээр libuv assertion, ts-alias-hooks-ийн тэмдэглэл). */
for (const fn of ['setInterval', 'setTimeout']) {
  const orig = g[fn];
  g[fn] = (...a) => { const t = orig(...a); t?.unref?.(); return t; };
}

/* ══════════ 1. React + стуб ══════════ */
const React = (await import('react')).default;
const { createElement: h } = React;
const { renderToStaticMarkup } = await import('react-dom/server');
const { preloadDynamic } = await import('../../tools/ui-stub-next-dynamic.mjs');
const { LocaleProvider } = await import('@/lib/i18n');
const { ThemeProvider } = await import('@/lib/theme');
const { MapProvider } = await import('@/components/MapCanvas');
const { FilterProvider } = await import('@/lib/filter');

const argv = process.argv.slice(2);
const dump = argv.includes('--dump');
const listOnly = argv.includes('--list');
const filters = argv.filter((a) => !a.startsWith('-'));

/**
 * Provider-ууд: Locale/Theme (layout.tsx) + Map/Filter (Portal.tsx-ийн бүтэц).
 * ⚠️ `AuthProvider` ХЭРЭГГҮЙ — `AuthGate`-ийн context-ийн анхдагч утга нь
 *    `status: 'off'` (нэвтрэлт унтраалттай, бүх эрхтэй) — page.tsx-ийн `AUTH.appId`
 *    хоосон үеийн замтай ижил.
 */
const wrap = (el, { map = true } = {}) => {
  let inner = el;
  if (map) inner = h(MapProvider, null, h(FilterProvider, null, inner));
  return h(LocaleProvider, null, h(ThemeProvider, null, inner));
};

const S = (d) => d; // setDim г.м. — юу ч хийхгүй
const noopFn = () => {};

/**
 * ТОХИОЛДЛУУД. `load` — зөвхөн НИЙТИЙН орох модуль (`src/modules/<View>.tsx`,
 * `src/components/<X>.tsx`) — бусад агентууд дотор нь хувааж байгаа тул дотоод
 * файлын нэрэнд найдахгүй. `expect` — markup-д ЗААВАЛ байх монгол шошго.
 */
const CASES = [
  { name: 'Landing', load: () => import('@/components/Landing'), pick: (m) => m.Landing, props: {}, map: false,
    expect: ['Сэлбэ'] },
  { name: 'Home', load: () => import('@/components/Home'), pick: (m) => m.Home, map: false,
    props: async () => {
      const { HOME_SECTIONS } = await import('@/lib/services');
      return { onEnterAll: noopFn, groups: HOME_SECTIONS, onEnterView: noopFn, docsAllowed: true, isSuper: true, boardAllowed: true, homeView: noopFn };
    },
    expect: ['Сэлбэ ухаалаг хот'] },
  { name: 'Root', load: () => import('@/components/Root'), pick: (m) => m.default, props: {}, map: false },
  { name: 'Portal', load: () => import('@/components/Portal'), pick: (m) => m.default, props: {}, map: false, preload: true,
    expect: ['Дашбоард'] },
  { name: 'ViewRail', load: () => import('@/components/ViewRail'), pick: (m) => m.ViewRail,
    props: { view: 'dashboard', setView: noopFn, catalogOpen: false, badges: {} }, map: false },
  { name: 'HelpPanel', load: () => import('@/components/HelpPanel'), pick: (m) => m.HelpPanel,
    props: { open: true, onClose: noopFn, navScope: 'all', view: 'dashboard', onGo: noopFn }, map: false },
  { name: 'CeoScorecard', load: () => import('@/components/CeoScorecard'), pick: (m) => m.CeoScorecard, props: { onView: noopFn } },
  { name: 'CeoBoard', load: () => import('@/components/CeoBoard'), pick: (m) => m.CeoBoard, props: { onView: noopFn } },
  { name: 'LayerCatalog', load: () => import('@/components/LayerCatalog'), pick: (m) => m.LayerCatalog,
    props: { view: 'plan', totals: { state: 'loading', data: null, error: null }, visible: [], setVisible: noopFn, selected: null, onSelect: noopFn, onClose: noopFn, zone: null } },
  { name: 'UserAdmin', load: () => import('@/components/UserAdmin'), pick: (m) => m.UserAdmin, props: { open: true, onClose: noopFn }, map: false },
  { name: 'LocaleToggle', load: () => import('@/components/LocaleToggle'), pick: (m) => m.LocaleToggle, props: {}, map: false },
  { name: 'ZoneFilter', load: () => import('@/components/ZoneFilter'), pick: (m) => m.ZoneFilter, props: { zone: null, setZone: noopFn } },
  { name: 'MapCanvas', skip: 'ArcGIS MapView-г useLayoutEffect-д үүсгэдэг — SSR markup нь хоосон контейнер, стубаар зурах нь утгагүй' },
  { name: 'AgentChat', skip: 'WebSocket/EventSource реле шаарддаг, SSR-д агуулгагүй' },
  { name: 'DocViewer', load: () => import('@/components/DocViewer'), pick: (m) => m.DocViewer, props: { open: true, onClose: noopFn }, map: false },

  { name: 'Dashboard', load: () => import('@/modules/Dashboard'), pick: (m) => m.Dashboard,
    props: { dim: '2d', setDim: S, zone: null, setZone: S }, expect: ['Төслийн цар хүрээ', 'Татаж байна…'] },
  { name: 'GeneralDash', load: () => import('@/modules/GeneralDash'), pick: (m) => m.GeneralDash,
    props: { dim: '2d', setDim: S, zone: null, setZone: S } },
  { name: 'Bagts', load: () => import('@/modules/Bagts'), pick: (m) => m.Bagts, props: { dim: '2d', setDim: S } },
  { name: 'PkgFin', load: () => import('@/modules/PkgFin'), pick: (m) => m.PkgFin, props: { dim: '2d', setDim: S } },
  { name: 'PkgProg', load: () => import('@/modules/PkgProg'), pick: (m) => m.PkgProg, props: { dim: '2d', setDim: S } },
  { name: 'Gazar', load: () => import('@/modules/Gazar'), pick: (m) => m.Gazar, props: { dim: '2d', setDim: S }, expect: ['Газар чөлөөлөлт'] },
  { name: 'Habea', load: () => import('@/modules/Habea'), pick: (m) => m.Habea, props: { dim: '2d', setDim: S }, expect: ['ХАБЭА'] },
  { name: 'Irged', load: () => import('@/modules/Irged'), pick: (m) => m.Irged, props: { dim: '2d', setDim: S } },
  { name: 'Iot', load: () => import('@/modules/Iot'), pick: (m) => m.Iot, props: { dim: '2d', setDim: S } },
  { name: 'Ersdel', load: () => import('@/modules/Ersdel'), pick: (m) => m.Ersdel, props: { dim: '2d', setDim: S } },
  { name: 'DedButets', load: () => import('@/modules/DedButets'), pick: (m) => m.DedButets, props: { dim: '2d', setDim: S } },
  { name: 'Suitability', load: () => import('@/modules/analysis/Suitability'), pick: (m) => m.Suitability, props: { dim: '2d', setDim: S } },
  { name: 'Finance', load: () => import('@/modules/Finance'), pick: (m) => m.Finance, props: {}, expect: ['Санхүүжилтийн бүртгэл'] },
  { name: 'IpcTable', load: () => import('@/modules/IpcTable'), pick: (m) => m.IpcTable, props: { contracts: [] } },
  { name: 'Guitsetgel', load: () => import('@/modules/Guitsetgel'), pick: (m) => m.Guitsetgel, props: {} },
  { name: 'Qaqc', load: () => import('@/modules/Qaqc'), pick: (m) => m.Qaqc, props: {}, expect: ['Багц 3.2', 'Хадгалах'] },
  { name: 'Chanar', load: () => import('@/modules/Chanar'), pick: (m) => m.Chanar, props: {}, expect: ['Аргачлал', 'Үл тохирол'] },
  { name: 'Zovshoorol', load: () => import('@/modules/Zovshoorol'), pick: (m) => m.Zovshoorol, props: {} },
  { name: 'Tailan', load: () => import('@/modules/Tailan'), pick: (m) => m.Tailan, props: {}, expect: ['Удирдлагын тайлан'] },
  { name: 'ExecReport', load: () => import('@/modules/ExecReport'), pick: (m) => m.ExecReport, props: {} },
  { name: 'Huvaari', load: () => import('@/modules/Huvaari'), pick: (m) => m.Huvaari, props: {}, expect: ['Батлуулах'] },
  { name: 'HuvaariBatlah', load: () => import('@/modules/HuvaariBatlah'), pick: (m) => m.HuvaariBatlah, props: {}, expect: ['Хуваарь батлах'] },
  { name: 'AjilBatlah', load: () => import('@/modules/AjilBatlah'), pick: (m) => m.AjilBatlah, props: {} },
  { name: 'Schem', load: () => import('@/modules/Schem'), pick: (m) => m.Schem, props: { setView: noopFn } },
  { name: 'SysDoc', load: () => import('@/modules/SysDoc'), pick: (m) => m.default, props: { setView: noopFn } },
  { name: 'TusulNegtgel', load: () => import('@/modules/TusulNegtgel'), pick: (m) => m.TusulNegtgel, props: {} },
  { name: 'ViewPanel', skip: 'Portal-ын дотоод самбар — олон тооны төлөв/callback prop; Portal тохиолдол дамжуулан зурна' },
  { name: 'FillNew', load: () => import('@/modules/sheet/FillNew'), pick: (m) => m.default, props: {} },
  { name: 'ErhTypes', load: () => import('@/modules/ErhTypes'), pick: (m) => m.ErhTypes, props: {}, map: false },
  /* ⚠️ 2026-09-30: НЭГ УРСГАЛ = НЭГ ХУУДАС — хуудас бүрийн панел (зохиогч + батлагч нэг дор) */
  { name: 'ChanarAcl', load: () => import('@/modules/ChanarAcl'), pick: (m) => m.ChanarAcl, props: {}, map: false,
    expect: ['Гүйцэтгэгч (ирүүлэгч)', 'ТУХ — инженер · менежер', 'ХАБЭА'] },
  { name: 'QaqcAcl', load: () => import('@/modules/QaqcAcl'), pick: (m) => m.QaqcAcl, props: {}, map: false },
  { name: 'HuvaariAcl', load: () => import('@/modules/HuvaariAcl'), pick: (m) => m.HuvaariAcl, props: {}, map: false,
    expect: ['Зохиогч', 'Батлагч'] },
  { name: 'ObyemAcl', load: () => import('@/modules/ObyemAcl'), pick: (m) => m.ObyemAcl, props: {}, map: false,
    expect: ['Засварлагч', 'Батлагч'] },
  { name: 'AjilAcl', load: () => import('@/modules/AjilAcl'), pick: (m) => m.AjilAcl, props: {}, map: false,
    expect: ['Мөр нэмэгч', 'Батлагч'] },
  { name: 'PlainCapAcl:zovshoorol', load: () => import('@/modules/PlainCapAcl'), pick: (m) => m.PlainCapAcl, props: { cap: 'zovshoorol' }, map: false,
    expect: ['Зөвшөөрөл засах', 'шууд хадгалагдана'] },
  { name: 'PlainCapAcl:finEdit', load: () => import('@/modules/PlainCapAcl'), pick: (m) => m.PlainCapAcl, props: { cap: 'finEdit' }, map: false,
    expect: ['Санхүүгийн бүртгэл — утга засах'] },
  { name: 'PlainCapAcl:finRow', load: () => import('@/modules/PlainCapAcl'), pick: (m) => m.PlainCapAcl, props: { cap: 'finRow' }, map: false,
    expect: ['Санхүүгийн бүртгэл — мөр нэмэх, устгах'] },
  { name: 'PlainCapAcl:gazar', load: () => import('@/modules/PlainCapAcl'), pick: (m) => m.PlainCapAcl, props: { cap: 'gazar' }, map: false,
    expect: ['Газрын төлөв засах'] },
  { name: 'PlainCapAcl:super', load: () => import('@/modules/PlainCapAcl'), pick: (m) => m.PlainCapAcl, props: { cap: 'plan', superOnly: true }, map: false,
    expect: ['Админ (super)'] },
  { name: 'CapOrphanNote', load: () => import('@/modules/CapOrphanNote'), pick: (m) => m.CapOrphanNote, props: { cap: 'plan' }, map: false,
    /* ⚠️ ACL уншигдаагүй тул `null` — markup хоосон байх нь ЗӨВ; wrap-ын provider-ууд л зурагдана */
    allowEmpty: true },
  { name: 'GuitsetgelAcl', load: () => import('@/modules/GuitsetgelAcl'), pick: (m) => m.GuitsetgelAcl, props: {}, map: false },
  { name: 'DedButetsAcl', load: () => import('@/modules/DedButetsAcl'), pick: (m) => m.DedButetsAcl, props: {}, map: false },
];

if (listOnly) { CASES.forEach((c) => console.log(`${c.skip ? '⏭' : '·'} ${c.name}${c.skip ? ' — ' + c.skip : ''}`)); process.exitCode = 0; }
else {
  const sel = CASES.filter((c) => !filters.length || filters.some((f) => c.name.toLowerCase().includes(f.toLowerCase())));
  let ok = 0, fail = 0, skip = 0;
  const failures = [];
  const t0 = Date.now();
  for (const c of sel) {
    if (c.skip) { skip++; console.log(`⏭ ${c.name} — ${c.skip}`); continue; }
    const t1 = Date.now();
    /* console.error/warn-ийг render-ийн үед барина (React-ийн сануулга) — унагахгүй, тоолно */
    const errs = [];
    const origErr = console.error, origWarn = console.warn;
    console.error = (...a) => errs.push(a.map(String).join(' ').slice(0, 160));
    console.warn = (...a) => errs.push(a.map(String).join(' ').slice(0, 160));
    try {
      const mod = await c.load();
      const Comp = c.pick(mod);
      /* ⚠️ `memo()`/`forwardRef()` нь объект (`$$typeof`) — LayerCatalog */
      assert.ok(typeof Comp === 'function' || (Comp && typeof Comp === 'object' && Comp.$$typeof), `${c.name}: компонент экспорт олдсонгүй`);
      if (c.preload) {
        const pe = await preloadDynamic();
        if (pe.length) throw new Error(`dynamic() loader унав: ${pe.map((e) => e.message.slice(0, 120)).join(' | ')}`);
      }
      const props = typeof c.props === 'function' ? await c.props() : c.props;
      const html = renderToStaticMarkup(wrap(h(Comp, props), { map: c.map !== false }));
      /* ⚠️ `allowEmpty` — санаатайгаар `null` буцаадаг бүрэлдэхүүн (ACL уншигдаагүй үеийн `CapOrphanNote`) */
      assert.ok(c.allowEmpty || (html && html.trim().length > 0), `${c.name}: markup хоосон`);
      for (const s of c.expect ?? []) assert.ok(html.includes(s), `${c.name}: «${s}» markup-д алга`);
      ok++;
      console.log(`✅ ${c.name} (${html.length} т · ${Date.now() - t1}мс${errs.length ? ` · console ${errs.length}` : ''})`);
      if (dump) console.log(html.slice(0, 4000));
      else if (errs.length && argv.includes('--verbose')) errs.slice(0, 5).forEach((e) => console.log('     ' + e));
    } catch (e) {
      fail++;
      failures.push(c.name);
      console.log(`❌ ${c.name}: ${String(e?.stack ?? e).split('\n').slice(0, 6).join('\n     ')}`);
      if (errs.length) errs.slice(0, 5).forEach((x) => console.log('     console: ' + x));
    } finally {
      console.error = origErr; console.warn = origWarn;
    }
  }
  console.log(`\nui smoke: ✅ ${ok} · ❌ ${fail} · ⏭ ${skip} · fetch ${fetchCalls} (татгалзсан) · unhandled ${unhandled} · ${((Date.now() - t0) / 1000).toFixed(1)}с`);
  if (fail) { console.log('УНАСАН: ' + failures.join(', ')); process.exitCode = 1; }
}
