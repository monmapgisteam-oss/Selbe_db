/** Exercise the real report toolbar with controlled async results; no network or downloads. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as periods from '../lib/execPeriodCalc.ts';

const slots = [];
let cursor = 0, asyncCursor = 0, effects = [], requestedPeriod;
let report = { state: 'loading' }, delta = { state: 'loading' };
const downloads = [];
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const hooks = {
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { value: initial };
    return [slots[i].value, (value) => {
      slots[i].value = typeof value === 'function' ? value(slots[i].value) : value;
    }];
  },
  useRef(initial) {
    const i = cursor++;
    return slots[i] ??= { current: initial };
  },
  useMemo(fn, deps) {
    const i = cursor++;
    if (!same(slots[i]?.deps, deps)) slots[i] = { value: fn(), deps };
    return slots[i].value;
  },
  useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
  useEffect(fn, deps) {
    const i = cursor++;
    if (!same(slots[i]?.deps, deps)) {
      slots[i] = { deps };
      effects.push(fn);
    }
  },
};
const jsx = (type, props) => ({ type, props });
const noop = () => {};
const mocks = {
  react: hooks,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
  '@/lib/i18nCore': { t: (key) => key },
  '@/lib/format': { dateTime: String, pct: String },
  '@/lib/useAsync': { useAsync: (_fn, deps) => {
    if (asyncCursor++ === 0) return report;
    requestedPeriod = deps[1];
    return delta;
  } },
  '@/lib/execPeriodCalc': periods,
  '@/lib/execReport': {
    execFindings: () => [], execAppendix: () => [],
    execFinSplit: () => ({ started: [], zero: [], none: [] }),
  },
  '@/lib/planProgress': { coverageNote: () => '' },
  '@/lib/agent/client': { relayAlive: async () => false },
  '@/lib/dataBus': { invalidateAll: noop },
  '@/lib/execPdf': {
    downloadExecPdf: async (...args) => { downloads.push(['pdf', ...args]); },
    downloadInfographic: async (...args) => { downloads.push(['png', ...args]); },
  },
};
const source = readFileSync(new URL('./ExecReport.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText;
const context = {
  exports: {}, console, AbortController, Date,
  window: { addEventListener: noop, removeEventListener: noop },
  require: (id) => mocks[id] ?? (id.endsWith('.css') ? { default: {} } : {}),
};
vm.runInNewContext(code, context, { filename: 'ExecReport.tsx' });
function render() {
  cursor = 0; asyncCursor = 0;
  return context.exports.ExecReport();
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  return typeof node === 'string' ? node : node?.props ? text(node.props.children) : '';
}
function button(tree, label) {
  const found = nodes(tree).find((n) => n.type === 'button' && text(n) === label);
  assert.ok(found, `toolbar contains ${label}`);
  return found;
}
const labels = ['PDF татах', 'Инфографик (PNG)'];
async function blocked(tree) {
  const before = downloads.length;
  for (const label of labels) {
    const b = button(tree, label);
    assert.equal(b.props.disabled, true, `${label} waits for current period`);
    await b.props.onClick(); // The handler must also guard programmatic calls.
  }
  assert.equal(downloads.length, before);
}
await blocked(render());
for (const effect of effects.splice(0)) effect();
report = { state: 'ready', data: { fetchedAt: Date.now(), prog: {}, gdash: {} } };
await blocked(render());
delta = { state: 'error', error: new Error('period request failed') };
await blocked(render());
delta = { state: 'ready', data: null };
await blocked(render());

async function exportReady() {
  delta = { state: 'ready', data: { period: requestedPeriod } };
  for (const label of labels) {
    const b = button(render(), label);
    assert.equal(b.props.disabled, false);
    await b.props.onClick();
    assert.equal(downloads.at(-1)[1], report.data);
    assert.equal(downloads.at(-1)[4], delta.data, 'export uses completed period result');
  }
}
await exportReady();
button(render(), periods.periodLabel('7d')).props.onClick();
await blocked(render()); // Before effects: previous 30-day result cannot be exported.
assert.equal(requestedPeriod.key, '7d');
await exportReady();
button(render(), periods.periodLabel('custom')).props.onClick();
let tree = render();
nodes(tree).find((n) => n.props?.['aria-label'] === 'Эхлэх огноо').props.onChange({ target: { value: '2026-09-01' } });
tree = render();
nodes(tree).find((n) => n.props?.['aria-label'] === 'Дуусах огноо').props.onChange({ target: { value: '2026-09-15' } });
await blocked(render());
assert.equal(requestedPeriod.from, '2026-09-01');
assert.equal(requestedPeriod.to, '2026-09-15');
await exportReady();
assert.equal(downloads.length, 6);
console.log('✅ execExport: loading/error/null blocked; PDF/PNG use current completed preset/custom period');
