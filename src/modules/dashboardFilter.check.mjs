import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the actual event handler without importing ArcGIS or mounting a map.
const source = readFileSync(new URL('./Dashboard.tsx', import.meta.url), 'utf8');
const start = source.indexOf('const selectFlt = useCallback(');
const end = source.indexOf('}, []);', start) + '}, []);'.length;
assert.ok(start >= 0 && end > start, 'selection handler not found');
const js = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const pickedFilter = { current: null };
let selected = null;
const pending = [];
const select = new Function('useCallback', 'pickedFilter', 'setFlt', 'withBagtsWhere',
  `${js}; return selectFlt;`)(
  (fn) => fn, pickedFilter, (next) => { selected = next; },
  (_row, done) => pending.push(done),
);
const row = (key) => ({ sec: 'bagts', key, where: `fallback:${key}`, bagtsRow: { key } });

select(row('A'));
assert.equal(selected.key, 'A', 'selection must be immediate');
select(row('A'));
assert.equal(selected, null, 'rapid second click clears before raw values load');
pending.shift()('raw:A');
assert.equal(selected, null, 'late response must not restore cleared selection');

select(row('A'));
select(row('B'));
pending.shift()('raw:A');
assert.equal(selected.key, 'B', 'older response cannot replace a newer selection');
pending.shift()('raw:B');
assert.equal(selected.where, 'raw:B', 'current group receives its raw-spelling filter');
select(row('B'));
assert.equal(selected, null, 'resolved selection still toggles off');

for (const context of ['section change', 'unmount']) {
  select(row('A'));
  pickedFilter.current = null;
  selected = null;
  pending.shift()('raw:A');
  assert.equal(selected, null, `${context} cancels the pending filter`);
}
assert.match(source, /pickedFilter\.current = null;\s*setFlt\(null\)/,
  'section switch must invalidate selection before clearing');
assert.match(source, /\(\) => \{ pickedFilter\.current = null; setHighlight\(null\); \}/,
  'unmount must invalidate selection and clear highlight');
console.log('✓ dashboardFilter: immediate toggle, latest selection, context cancellation');
