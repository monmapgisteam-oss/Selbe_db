/**
 * БАГЦ АЖЛЫН ОНОО ↔ ХУВААРИЙН КАРТ — гүйцэтгэлийн НЭГ дүгнэлт (2026-11-24, аудит). Сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/ceo/scorecardLoad.ui.check.mjs
 *
 * Хамгаалж буй алдаа: Finance-ийн хоцрогдол алга (null) багцад хуваарийн карт ТТБ-ийн P/S-ээр дүгнэдэг, оноо нь дүгнэдэггүй байв.
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
g.fetch = () => Promise.reject(new Error('scorecardLoad.ui.check: сүлжээгүй'));
for (const fn of ['setInterval', 'setTimeout']) {
  const orig = g[fn];
  g[fn] = (...a) => { const t = orig(...a); t?.unref?.(); return t; };
}

const { perfScoreOf } = await import('./scorecardLoad.ts');
const { computeSchedule } = await import('./schedule.ts');
const { lagLevel } = await import('@/modules/Finance.tsx');

const now = Date.UTC(2026, 10, 24);
const ttb = new Map([
  ['Б5', { P: 40, S: null, C: 100 }], // хэмжилтгүй = 0% → 40 пп хоцорсон
  ['Б6', { P: 50, S: 10, C: 60 }], // хамралт дутуу
  ['Б8', { P: 20, S: 18, C: 100 }], // 2 пп — хэвийн
  ['Б7', { P: null, S: null, C: null }], // төлөвлөгөөгүй
]);
const mk = (key) => ({ key, curveKey: key, label: key, lag: null, hasPhys: true });
const card = computeSchedule([mk('Б5'), mk('Б6'), mk('Б8'), mk('Б7')], new Map(), lagLevel, now, [], false, ttb);
const base = { lag: null, cancelled: false, noCurve: false, notStarted: false, start: null, end: null, progress: null, now };
const perf = (k, o = {}) => perfScoreOf({ ...base, ttb: ttb.get(k), ...o });

/* Карт: Б5 улаан, Б8 дохиогүй (хэмжсэн), Б6 дүгнээгүй, Б7 хэмжилтгүй */
const measured = card.tables[0].rows.map((r) => r[0].v);
assert.deepEqual(measured.sort(), ['Б5', 'Б8']);
assert.deepEqual(card.tables[2].rows.map((r) => r[0].v), ['Б6']);

/* Оноо — ИЖИЛ дүгнэлт */
const p5 = perf('Б5');
assert.equal(p5.score, 0, '40 пп × 2.5 = 100 хасалт');
assert.ok(p5.issues?.some((x) => x.tone), 'хоцорсон гэж дүгнэнэ (карт улаан)');
const p8 = perf('Б8');
assert.equal(p8.score, 95, '2 пп × 2.5');
const p6 = perf('Б6');
assert.equal(p6.score, null);
assert.equal(p6.caveat?.kind, 'partial', 'хамралт дутуу — карт ч дүгнээгүй');
/* ТТБ-ийн төлөвлөгөөгүй бол хуучин шалтгаан хэвээр */
assert.equal(perf('Б7', { noCurve: true }).caveat?.kind, 'noCurve');
assert.equal(perf('Б7', { notStarted: true }).caveat?.kind, 'notStarted');
/* ТТБ нь муруйн уналтаас ӨМНӨ (карттай ижил: lag алга → ТТБ) */
assert.equal(perf('Б5', { noCurve: true }).score, 0);
/* Finance-ийн хоцрогдол байвал ТТБ хэрэглэхгүй */
assert.equal(perf('Б5', { lag: { month: '2026-10', planned: 30, actual: 28, gap: 2, coverage: 100 } }).score, 95);
assert.equal(perf('Б5', { cancelled: true }).score, null);

console.log('scorecardLoad.ui.check.mjs — БҮГД ТЭНЦЛЭЭ (11)');
