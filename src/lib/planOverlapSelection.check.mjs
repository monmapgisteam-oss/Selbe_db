import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visibleOverlapItems } from './planOverlapSelection.ts';

const items = [
  { type: 'heat', layer: 'Package 1 heat', cat: 'build', lengthM: 50, count: 2 },
  { type: 'water', layer: 'Package 1 water', cat: 'build', lengthM: 30, count: 1 },
  { type: 'heat', layer: 'Package 1 heat', cat: 'road', lengthM: 80, count: 3 },
  { type: 'power', layer: 'Package 2 power', cat: 'bike', lengthM: 10, count: 1 },
];

assert.deepEqual(visibleOverlapItems(items, 'next', [], null), [], 'Nothing appears until a category is activated');
assert.deepEqual(visibleOverlapItems(items, 'next', ['build'], null), items.slice(0, 2), 'A building activation cannot show road or bicycle overlaps');
assert.deepEqual(visibleOverlapItems(items, 'next', ['build', 'road'], { side: 'next', cat: 'build' }), items.slice(0, 2), 'A category selection narrows multiple active categories');

const row = { side: 'next', cat: 'build', layer: 'Package 1 heat' };
const selected = visibleOverlapItems(items, 'next', ['build', 'road'], row);
assert.deepEqual(selected, [items[0]], 'Selecting a layer filters by category as well as its name');
assert.equal(selected.reduce((n, item) => n + item.lengthM, 0), 50, 'Summary quantities use the same filtered set as the map');
assert.deepEqual(visibleOverlapItems(items, 'next', ['road'], row), [], 'A saved selection must never reactivate a disabled category');
assert.deepEqual(visibleOverlapItems(items, 'now', ['build'], row), [], 'An overlap selection cannot leak onto the other comparison side');
assert.equal(visibleOverlapItems(items, 'next', ['build', 'road'], null).length, 3, 'Clearing selection restores all activated categories');
{
  /* Refresh and layer edits must reach the browser store, or a 24-hour-old result is read back.
     2026-11-09: only the refresh button (Portal.refreshData) and layer edits clear it, not the generic data-bus slot. */
  const source = readFileSync(new URL('./planOverlap.ts', import.meta.url), 'utf8');
  assert.ok(!/register\(\(\) => \{[^\n]*clearOverlapStore/.test(source), 'The generic data bus slot must not clear the browser store (the refresh button does, in Portal)');
  assert.ok(source.includes('void clearOverlapStore(); });'), 'The layer edit path must clear the browser store');
  assert.ok(source.includes('if (epoch !== storeEpoch) { db.close(); return; }'), 'A run started before the clear must not write its old result back');
}
console.log('Overlap category and layer visibility checks passed.');
