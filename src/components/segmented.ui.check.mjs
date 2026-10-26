/**
 * `Segmented` (role=radiogroup) — roving tabindex ба сумны товчлуур (ARIA APG radio group), 2026-10-26. Сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/segmented.ui.check.mjs
 *
 * ⚠️ `*.ui.check.mjs` нэр ЗААВАЛ — `ts-alias` CSS модулийг стубаар залгана.
 */
import assert from 'node:assert/strict';

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const { Segmented } = await import('./Switch.tsx');

const options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }];
const html = renderToStaticMarkup(React.createElement(Segmented, { value: 'b', onChange: () => {}, options, label: 'Бүлэг' }));
const tabs = [...html.matchAll(/<button[^>]*role="radio"[^>]*>/g)].map((m) => /tabindex="(-?\d)"/i.exec(m[0])?.[1]);
assert.deepEqual(tabs, ['-1', '0', '-1'], 'сонгогдсон нь л Tab-ын зогсоол');

/* Сумны товч — элементийн `onKeyDown`-ыг шууд дуудна */
const run = (value, key) => {
  let got = null; let focused = -1; let prevented = false;
  const el = Segmented({ value, onChange: (v) => { got = v; }, options, label: 'x' });
  const btns = options.map((_, k) => ({ focus: () => { focused = k; } }));
  el.props.onKeyDown({ key, preventDefault: () => { prevented = true; }, currentTarget: { querySelectorAll: () => btns } });
  return { got, focused, prevented };
};
assert.deepEqual(run('b', 'ArrowRight'), { got: 'c', focused: 2, prevented: true }, '→ дараагийнх');
assert.deepEqual(run('c', 'ArrowRight'), { got: 'a', focused: 0, prevented: true }, '→ тойрно');
assert.deepEqual(run('a', 'ArrowLeft'), { got: 'c', focused: 2, prevented: true }, '← тойрно');
assert.deepEqual(run('b', 'Home'), { got: 'a', focused: 0, prevented: true }, 'Home');
assert.deepEqual(run('b', 'End'), { got: 'c', focused: 2, prevented: true }, 'End');
assert.deepEqual(run('b', 'Enter'), { got: null, focused: -1, prevented: false }, 'бусад товч хөндөгдөхгүй');
console.log('✅ Segmented — roving tabindex · сумны товч');
