/**
 * ЧИРЖ ӨРГӨСГӨДӨГ БАГАНА — каталог хаалттай үед баруун багана чирэхэд зүүн баганын хадгалсан өргөн алдагдахгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/components/ResizableColumns.ui.check.mjs
 *
 * DOM сан суугаагүй тул жинхэнэ `ResizableColumns`-ыг жижиг hook диспатчераар ажиллуулна.
 */
import assert from 'node:assert/strict';
import React from 'react';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = { body: { classList: { add() {}, remove() {} } } };
const hadWindow = globalThis.window;
globalThis.window = hadWindow ?? { addEventListener() {}, removeEventListener() {} };
const { ResizableColumns } = await import('@/components/ResizableColumns');
const I = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
const KEY = 'selbe.cols.portal';

function mount() {
  const slots = [];
  let i = 0;
  let layout = [];
  const d = {
    useRef: (v) => { if (i >= slots.length) slots.push({ current: v }); return slots[i++]; },
    useMemo: (f, deps) => {
      const s = slots[i];
      if (s && deps.every((x, j) => x === s.deps[j])) { i += 1; return s.v; }
      const v = f();
      slots[i++] = { v, deps };
      return v;
    },
    useCallback: (f, deps) => d.useMemo(() => f, deps),
    useLayoutEffect: (f) => { layout.push(f); i += 1; if (i > slots.length) slots.push({}); },
    useEffect: () => { i += 1; if (i > slots.length) slots.push({}); },
  };
  const node = {
    clientWidth: 1600,
    style: { vals: {}, setProperty(k, v) { this.vals[k] = v; }, removeProperty(k) { delete this.vals[k]; } },
    getBoundingClientRect: () => ({ left: 0, right: 1600 }),
  };
  const mkGrip = () => {
    const ls = {};
    return {
      dataset: {}, setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {}, setAttribute() {},
      addEventListener(t, f) { ls[t] = f; }, removeEventListener(t) { delete ls[t]; }, fire(t, e) { ls[t]?.(e); },
      getBoundingClientRect: () => ({ right: 1600 - parseInt(node.style.vals['--col-r'] || '360', 10) }),
    };
  };
  const gL = mkGrip();
  const gR = mkGrip();
  let last = {};
  const render = (props) => {
    i = 0;
    layout = [];
    I.H = d;
    const root = ResizableColumns({ id: 'portal', right: 360, legacy: { left: 'old-left', right: 'old-right' }, children: null, ...props });
    I.H = null;
    root.props.ref.current = node;
    const grips = [].concat(root.props.children).filter((k) => k?.props?.role === 'separator');
    last = {};
    for (const g of grips) {
      const side = grips.length === 2 && g === grips[0] ? 'L' : 'R';
      g.props.ref.current = side === 'L' ? gL : gR;
      last[side] = g;
    }
    layout.forEach((f) => f());
    return node.style.vals;
  };
  const drag = (side, dx) => {
    const g = side === 'L' ? gL : gR;
    last[side].props.onPointerDown({ button: 0, preventDefault() {}, currentTarget: g, clientX: 500, pointerId: 1 });
    g.fire('pointermove', { clientX: 500 + dx });
    g.fire('pointerup', {});
  };
  const key = (side, k) => last[side].props.onKeyDown({ key: k, shiftKey: false, preventDefault() {} });
  return { render, drag, key };
}
const stored = () => JSON.parse(store.get(KEY) ?? '{}');

/* Хаалттай үед баруун багана чирэв */
{
  store.clear();
  const h = mount();
  h.render({ left: 286 });
  h.drag('L', 114);
  assert.equal(stored().left, 400, 'зүүн 400 хадгалагдав');
  h.render({ left: undefined });
  h.drag('R', -40);
  assert.deepEqual(stored(), { left: 400, right: 400 }, 'баруун чирэхэд зүүн 400 устах ёсгүй');
  assert.equal(h.render({ left: 286 })['--col-l'], '400px', 'дахин нээхэд хэрэглэгчийн өргөн');
}

/* Гарын сум ч ижил `save`-ээр */
{
  store.clear();
  const h = mount();
  h.render({ left: 286 });
  h.drag('L', 114);
  h.render({ left: undefined });
  h.key('R', 'ArrowLeft');
  assert.equal(stored().left, 400, 'сумны товч ч зүүн өргөнийг устгахгүй');
}

/* Хуучин түлхүүрийн утга: хэрэглэгчийн шинэ сонголт дарагдахгүй */
{
  store.clear();
  store.set('old-left', '333');
  const h = mount();
  h.render({ left: 286 });
  h.drag('L', 67);
  h.render({ left: undefined });
  h.drag('R', -40);
  assert.equal(h.render({ left: 286 })['--col-l'], '400px', 'хуучин түлхүүр (333) шинэ сонголтыг (400) дарах ёсгүй');
}

/* Анхны өргөнд буцаах нь нээлттэй багана дээр хэвээр */
{
  store.clear();
  const h = mount();
  h.render({ left: 286 });
  h.drag('L', 114);
  h.render({ left: 286 });
  assert.equal(stored().left, 400);
  h.drag('L', -114);
  assert.equal(stored().left, 286, 'нээлттэй багана шинэ утгаараа дарагдана');
}

if (hadWindow === undefined) delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;
console.log('ResizableColumns.ui.check ✓');
