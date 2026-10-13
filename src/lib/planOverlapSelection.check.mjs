import assert from 'node:assert/strict';
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
console.log('Overlap category and layer visibility checks passed.');
