import assert from 'node:assert/strict';
const g = globalThis;
const noop = () => {};
const listeners = { addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true };
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } }; };
Object.assign(g, { window: g, document: { documentElement: { lang: 'mn' }, body: {}, activeElement: null, hidden: false, ...listeners }, localStorage: store(), sessionStorage: store(), matchMedia: () => ({ matches: false, ...listeners }), confirm: () => false, ...listeners });
if (!g.navigator) g.navigator = {};

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const { PlanModal } = await import('@/modules/huvaari/PlanModal');

const d = (iso) => Date.parse(`${iso}T00:00:00Z`);
const span = (a, b) => ({ start: d(a), end: d(b) });
const row = (spans, vol = 900) => ({ i: 0, oid: 7, no: '1.1', des: 11, deps: [], work: 'Ажил', depth: 1, group: false, vol, spans, act: [null], aStart: [null], aEnd: [null], hun: null, mashin: null });
const M = (o) => new Map(Object.entries(o));

function render(r, months, extra = {}) {
  const html = renderToStaticMarkup(React.createElement(PlanModal, {
    r, par: null, blocks: ['B1'], blk: 0, takt: 0, canEdit: true, onBlk: noop, onTakt: noop, cands: [],
    hasHam: false, hasActual: false, hasRes: false, obyem: true, months, res: new Map(),
    resFields: { hun: true, mashin: true }, onClose: noop, onApply: noop, ...extra,
  }));
  const btn = /<button[^>]*class="save"[^>]*>Тавих<\/button>/.exec(html)?.[0] ?? '';
  return { html, btn, disabled: /\bdisabled=""/.test(btn), title: /title="([^"]*)"/.exec(btn)?.[1] ?? '' };
}

// 1. total 900, Oct–Dec, {10:300,11:300,12:300} → OK
let o = render(row([span('2026-10-01', '2026-12-31')]), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 }));
assert.equal(o.disabled, false, `зөв хуваасан → Тавих идэвхтэй: ${o.btn}`);
assert.ok(o.html.includes('нийт обьёмтой тэнцэв'), 'тэнцэв гэж харагдана');
// 2. range shortened Oct–Nov, stored months include Dec → filtered 600 → disabled, "300 дутуу"
o = render(row([span('2026-10-01', '2026-11-30')]), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 }));
assert.equal(o.disabled, true, 'богиносгосон муж → 600 ≠ 900 → хаалттай');
assert.ok(o.html.includes('дутуу'), 'дутуу гэж харагдана');
// 3. range extended Oct–Jan → Jan empty → disabled
o = render(row([span('2026-10-01', '2027-01-31')]), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 }));
assert.equal(o.disabled, true, 'сунгасан муж → 1-р сар хоосон → хаалттай');
// 4. no volume → no month section, enabled
o = render(row([span('2026-10-01', '2026-12-31')], null), new Map());
assert.equal(o.disabled, false, 'обьёмгүй → Тавих идэвхтэй');
// 5. fractional total 900.35 split exact → OK
o = render(row([span('2026-10-01', '2026-12-31')], 900.35), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300.35 }));
assert.equal(o.disabled, false, 'бутархай нийт → яг хуваасан → идэвхтэй');
// 6. months prop has extra out-of-range month but visible sum correct → OK
o = render(row([span('2026-10-01', '2026-12-31')]), M({ '2026-09': 50, '2026-10': 300, '2026-11': 300, '2026-12': 300 }));
assert.equal(o.disabled, false, `мужаас гадуурх сар тоологдохгүй → идэвхтэй: ${o.btn}`);
// 7. geree tab (obyem=false) → no month gate
o = render(row([span('2026-10-01', '2026-12-31')]), M({ '2026-10': 1 }), { obyem: false });
assert.equal(o.disabled, false, 'гэрээ таб → сарын дүрэмгүй');
// 8. no own span, parent span prefill; months empty → disabled (needs fill), but no crash
o = render(row([null]), new Map(), { par: { ...row([span('2026-10-01', '2026-12-31')]), oid: 1, group: true, depth: 0 } });
assert.equal(o.disabled, true, 'урьдчилан бөглөсөн муж, сар хоосон → хаалттай');
console.log('✓ PlanModal SSR: 8 тохиолдол');
