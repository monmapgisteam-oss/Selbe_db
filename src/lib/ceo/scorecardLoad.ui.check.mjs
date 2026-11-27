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

const { perfScoreOf, finActualOf } = await import('./scorecardLoad.ts');
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
const finLag0 = () => ({ month: '2026-10', planned: 40, actual: 10, gap: 30, coverage: 100 });

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
/* ТТБ-д мөргүй бол хуучин шалтгаан хэвээр */
assert.equal(perf('Б9', { noCurve: true }).caveat?.kind, 'noCurve');
assert.equal(perf('Б9', { notStarted: true }).caveat?.kind, 'notStarted');
/* 2026-11-27 (аудит №36): мөртэй боловч P = 0/алга — карт «хэмжилтгүй» (тодорхой шалтгаантай), оноо ч тавихгүй;
   Cashflow-ийн огнооны шугам руу (60 − 10 = 50 пп) унахгүй */
const linear = { start: Date.UTC(2026, 0, 1), end: Date.UTC(2027, 0, 1), progress: 10 };
for (const o of [{}, { noCurve: true }, { notStarted: true }, linear]) {
  const p7 = perf('Б7', o);
  assert.equal(p7.score, null, 'P = 0 — оноо тавихгүй');
  assert.equal(p7.caveat?.kind, 'planZero');
}
assert.equal(perfScoreOf({ ...base, ...linear, ttb: { P: 0, S: 0 }, lag: finLag0() }).caveat?.kind, 'planZero', 'Finance-ийн хоцрогдол байсан ч');
const noRows = new Map(card.tables[1].rows.map((r) => [r[0].v, r[1].v]));
assert.equal(noRows.get('Б7'), '«Багцын гүйцэтгэл»-д төлөвлөгөөт хувь 0 — дүгнэхгүй', 'картын шалтгаан — бодит (ерөнхий «бичилт алга» биш)');
/* №46: «Багцын гүйцэтгэл» уншигдаагүй — оноо ч, карт ч Finance руу чимээгүй шилжихгүй */
assert.equal(perfScoreOf({ ...base, ttb: undefined, ttbUnread: true, lag: finLag0() }).caveat?.kind, 'ttbUnread');
assert.equal(perfScoreOf({ ...base, ttb: undefined, ttbUnread: true, lag: finLag0() }).score, null);
const down = computeSchedule([{ ...mk('Б5'), lag: finLag0() }], new Map(), lagLevel, now, ['Багцын гүйцэтгэл'], false, null);
assert.equal(down.value, '—', 'уншигдаагүй — дүгнэхгүй (Finance-ийн хоцрогдлоор биш)');
assert.equal(down.tables[1].rows[0][1].v, '«Багцын гүйцэтгэл» уншигдсангүй');
assert.deepEqual(down.failedSources, ['Багцын гүйцэтгэл'], 'failedSources дамжина (кэшлэгдэхгүй)');
/* ТТБ нь муруйн уналтаас ӨМНӨ (карттай ижил: lag алга → ТТБ) */
assert.equal(perf('Б5', { noCurve: true }).score, 0);
/* 2026-11-27: «Багцын гүйцэтгэл»-д мөртэй бол Finance-ийн хоцрогдол байсан ч ТТБ (карттай ижил) */
const finLag = { month: '2026-10', planned: 30, actual: 28, gap: 2, coverage: 100 };
assert.equal(perf('Б5', { lag: finLag }).score, 0);
/* Мөргүй багц — Finance-ийн хоцрогдлоор */
assert.equal(perfScoreOf({ ...base, ttb: undefined, lag: finLag }).score, 95);
assert.equal(perf('Б5', { cancelled: true }).score, null);

/* №46 (санхүү): «Багцын гүйцэтгэл» уншигдаагүй — олголтыг Finance-ийн биет хувьтай ХАРЬЦУУЛАХГҮЙ (30 − 10 биш) */
{
  const lagF = { month: '2026-10', planned: 12, actual: 10, gap: 2, coverage: 100 };
  const un = finActualOf({ isBuild: true, ttbRead: false, ttbRow: undefined, lag: lagF, progress: 10 });
  assert.equal(un.comparable, false, 'уншигдаагүй — олголт-бодит харьцуулалт алга');
  assert.equal(un.actual, null);
  const { scoreFin } = await import('./scorecard.ts');
  const fin = scoreFin({ contracted: true, start: null, now, cost: 100, contract: 100, paidPct: un.comparable ? 30 : null, actual: un.actual, actualPkg: un.actualPkg });
  assert.ok(!fin.facts.some((f) => /гүйцэтгэл/.test(f.label)), 'санхүүгийн онооны олголт-бодит хэсэг алга');
  assert.ok(!fin.issues.some((x) => x.text.startsWith('Олголт')));
  assert.deepEqual(finActualOf({ isBuild: true, ttbRead: true, ttbRow: { S: 28 }, lag: lagF, progress: 10 }), { actual: 28, actualPkg: true, comparable: true }, 'мөртэй — S');
  assert.deepEqual(finActualOf({ isBuild: true, ttbRead: true, ttbRow: { S: null }, lag: null, progress: 10 }), { actual: 0, actualPkg: true, comparable: true }, 'хэмжилтгүй = 0%');
  assert.deepEqual(finActualOf({ isBuild: true, ttbRead: true, ttbRow: undefined, lag: lagF, progress: 10 }), { actual: 10, actualPkg: false, comparable: true }, 'мөргүй — Finance-ийн биет');
  assert.equal(finActualOf({ isBuild: false, ttbRead: false, ttbRow: undefined, lag: null, progress: 5 }).comparable, false);
}

/* Эх код: ачаалагч хоёулаа уналтыг `null` + failed болгоно (хоосон Map биш) */
{
  const { readFileSync } = await import('node:fs');
  for (const f of ['./schedule.ts', './scorecardLoad.ts']) {
    const s = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/loadTtbPkgPlan\(\)\.catch\(\([^)]*\)[^=]*=>\s*new Map\(\)\)/.test(s), `${f}: уналт → хоосон Map`);
    assert.ok(s.includes('failed.push(SRC_TTB())'), `${f}: failed-д нэрлэнэ`);
  }
}

console.log('scorecardLoad.ui.check.mjs — БҮГД ТЭНЦЛЭЭ (20)');
