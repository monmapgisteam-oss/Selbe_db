/**
 * ДАВХАРГЫГ MAP-Д ХОЙШЛУУЛЖ НЭМЭХ (`lazyLayers.ts`, 2026-10-22 — гүйцэтгэл).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/components/lazyLayers.check.mjs
 *
 * Хамгаалж буй зүйлс:
 *   1. Сангийн давхарга Map-д ЗӨВХӨН хэрэгтэй үед орно (`mapLayer` нэмэхгүй; `ensureMapLayer`/`lazyShowVisible` нэмнэ).
 *   2. Хожим нэмэгдсэн ч `buildLayers`-ийн ДАРААЛАЛ хадгалагдана: «ортофотогийн дараа» (индекс 1) нэмэгддэг
 *      меш/эрсдэлийн давхарга сангийнхаас ДООР, төгсгөлд нэмэгддэг (sketch · overlap …) нь ДЭЭР үлдэнэ.
 *   3. `ChangeBoundary` khil1-ийг төгсгөл рүү зөөгөөд ХУУЧИРСАН индекс рүү буцаавал дараалал сэргэнэ.
 *   4. `MapCanvas` холболт — Map эхэндээ зөвхөн ортофото + `LAZY_END`, шинж тавих эффектүүд Map-д ороогүйг ч давтана,
 *      Эрсдэлийн шинжилгээ нуугдсан давхаргыг `mapLayer`-ээр олно.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const {
  LAZY_END, lazySlot, lazyRegister, mapLayer, ensureMapLayer, lazyTop, lazyKids, lazyShowVisible, lazyAbsent, lazyReplace,
} = await import('./lazyLayers.ts');

/* ── Хуурамч ArcGIS: Collection (add/reorder — 4.34-ийн дүрэм), Map (allLayers хавтгай, findLayerById) ── */
class Coll {
  constructor(items = []) { this.items = [...items]; }
  get length() { return this.items.length; }
  toArray() { return [...this.items]; }
  getItemAt(i) { return this.items[i]; }
  includes(x) { return this.items.includes(x); }
  indexOf(x) { return this.items.indexOf(x); }
  add(x, i = this.items.length) { this.items.splice(Math.max(0, Math.min(i, this.items.length)), 0, x); }
  remove(x) { const i = this.items.indexOf(x); if (i >= 0) this.items.splice(i, 1); }
  removeMany(xs) { for (const x of xs) this.remove(x); }
  reorder(x, t = this.items.length - 1) {
    const s = this.items.indexOf(x);
    if (s < 0) return;
    t = t < 0 ? 0 : t >= this.items.length ? this.items.length - 1 : t;
    if (s === t) return;
    this.items.splice(s, 1);
    this.items.splice(t, 0, x);
  }
}
class FakeMap {
  constructor(layers) { this.layers = new Coll(layers); this.destroyed = false; }
  get allLayers() {
    const out = [];
    const walk = (c) => { for (const l of c.toArray()) { out.push(l); if (l.layers) walk(l.layers); } };
    walk(this.layers);
    return new Coll(out);
  }
  findLayerById(id) { return this.allLayers.toArray().find((l) => l.id === id); }
  add(l, i) { this.layers.add(l, i); }
  reorder(l, i) { this.layers.reorder(l, i); }
}
const lyr = (id, extra = {}) => ({ id, visible: false, destroyed: false, loadStatus: 'not-loaded', type: 'feature', ...extra });
const ids = (c) => c.toArray().map((l) => l.id);

/* ── 1. Оруулах индекс ── */
assert.equal(lazySlot([0, undefined, 1, 4], 2, 4), 3, 'өөрөөс өндөр зэрэглэлтэй анхныхын ӨМНӨ');
assert.equal(lazySlot([0, undefined, 1], 2, 3), 3, 'байхгүй бол `end`');
assert.equal(lazySlot([0, 5, undefined, 9], 7, 2), 2, '`end`-ээс хойшхийг (LAZY_END-ийн дараах) тооцохгүй');
console.log('✅ lazySlot: зэрэглэлээр оруулах индекс');

/* ── 2. Сан ба дараалал ── */
const k1 = lyr('imagery:f:old:a', { type: 'tile' });
const k2 = lyr('imagery:f:new:a', { type: 'tile', visible: true });
const img = { ...lyr('imagery', { type: 'group', visible: true }), layers: new Coll([k2]) };
const A = lyr('A'); const B = lyr('B'); const khil = lyr('khil1'); const C = lyr('C'); const D = lyr('D');
const end = lyr(LAZY_END, { type: 'graphics' });
const map = new FakeMap([img, end]);
lazyRegister(map, [img, A, B, khil, C, D], [{ group: img, kids: [k1, k2] }]);

assert.equal(mapLayer(map, 'B'), B, 'санд хүлээж буй инстанцыг олно');
assert.deepEqual(ids(map.layers), ['imagery', LAZY_END], '`mapLayer` Map-д НЭМЭХГҮЙ');
assert.equal(mapLayer(map, 'nope'), null);
assert.deepEqual(lazyTop(map).map((l) => l.id), ['imagery', LAZY_END, 'A', 'B', 'khil1', 'C', 'D'], '`lazyTop` = Map + сан');

assert.equal(ensureMapLayer(map, 'C'), C);
assert.equal(ensureMapLayer(map, 'A'), A);
assert.equal(ensureMapLayer(map, 'khil1'), khil);
assert.deepEqual(ids(map.layers), ['imagery', 'A', 'khil1', 'C', LAZY_END], 'дараалал `buildLayers`-ийнх');
assert.equal(ensureMapLayer(map, 'A'), A, 'дахин дуудахад давхардуулахгүй');
assert.equal(map.layers.length, 5);

/* меш/эрсдэл — «ортофотогийн дараа» (индекс 1); sketch/overlap — төгсгөлд */
const mesh = lyr('scene:x', { type: 'integrated-mesh' });
map.add(mesh, 1);
const sketch = lyr('sketch', { type: 'graphics' });
map.add(sketch);
ensureMapLayer(map, 'B');
ensureMapLayer(map, 'D');
assert.deepEqual(ids(map.layers), ['imagery', 'scene:x', 'A', 'B', 'khil1', 'C', 'D', LAZY_END, 'sketch'],
  'меш сангийнхаас ДООР, sketch ДЭЭР үлдэнэ');
console.log('✅ ensureMapLayer: buildLayers-ийн дараалал · меш доор · төгсгөлийн давхарга дээр');

/* ── 3. ChangeBoundary: khil1-ийг төгсгөл рүү → (хооронд нь шинэ давхарга) → хуучирсан индекс рүү буцаах ── */
{
  const a = lyr('a'); const b = lyr('b'); const k = lyr('k'); const c = lyr('c');
  const e2 = lyr(LAZY_END, { type: 'graphics' });
  const g = { ...lyr('imagery', { type: 'group', visible: true }), layers: new Coll([]) };
  const m = new FakeMap([g, e2]);
  lazyRegister(m, [g, a, b, k, c]);
  ensureMapLayer(m, 'a'); ensureMapLayer(m, 'k'); ensureMapLayer(m, 'c');
  const prevIdx = m.layers.indexOf(k); // ChangeBoundary-ийн `previousIndex`
  m.reorder(k, m.layers.length - 1); // khil1 → хамгийн дээр
  b.visible = true;
  assert.equal(lazyShowVisible(m), 1);
  assert.deepEqual(ids(m.layers), ['imagery', 'a', 'b', 'c', LAZY_END, 'k'], 'дээр зөөсөн khil1-ийг байрлал тооцоход үл тоох');
  m.reorder(k, prevIdx); // ChangeBoundary-ийн буцаалт — индекс хуучирсан
  assert.deepEqual(ids(m.layers), ['imagery', 'a', 'k', 'b', 'c', LAZY_END], '(урьдчилсан нөхцөл) хуучирсан индекс');
  lazyShowVisible(m);
  assert.deepEqual(ids(m.layers), ['imagery', 'a', 'b', 'k', 'c', LAZY_END], 'дараалал сэргэнэ');
}
console.log('✅ ChangeBoundary-ийн хуучирсан буцаалтын дараа дараалал сэргэнэ');

/* ── 4. Ил болсныг нэмэх · бүлгийн хүүхэд · солих · устгасан ── */
{
  assert.deepEqual(lazyKids(map, img).map((l) => l.id), ['imagery:f:new:a', 'imagery:f:old:a'], 'бүлэгт байгаа + санд хүлээж буй');
  k1.visible = true;
  img.visible = false;
  assert.equal(lazyShowVisible(map), 0, 'эцэг бүлэг нуугдсан — хүүхдийг нэмэхгүй');
  img.visible = true;
  assert.equal(lazyShowVisible(map), 1);
  assert.deepEqual(ids(img.layers), ['imagery:f:old:a', 'imagery:f:new:a'], 'хүүхэд бүлэг дотроо дарааллаараа');

  const m = new FakeMap([lyr(LAZY_END, { type: 'graphics' })]);
  const x = lyr('x'); const y = lyr('y', { loadStatus: 'failed' }); const z = lyr('z', { destroyed: true });
  lazyRegister(m, [x, y, z]);
  assert.deepEqual(lazyAbsent(m).map((l) => l.id), ['x', 'y'], 'устгагдсаныг тооцохгүй');
  assert.equal(mapLayer(m, 'z'), null);
  assert.equal(ensureMapLayer(m, 'z'), null, 'устгагдсаныг Map-д нэмэхгүй');
  const y2 = lyr('y');
  lazyReplace(m, y, y2);
  assert.equal(mapLayer(m, 'y'), y2, '«Дахин оролдох»-ын шинэ инстанц');
  y2.visible = true;
  x.visible = true;
  assert.equal(lazyShowVisible(m), 2);
  assert.deepEqual(ids(m.layers), ['x', 'y', LAZY_END]);
  const y3 = lyr('y');
  m.layers.remove(y2); m.layers.add(y3, 1); lazyReplace(m, y2, y3); // Map дахь сольсон инстанц
  assert.deepEqual(lazyTop(m).map((l) => l.id), ['x', 'y', LAZY_END], 'хуучин инстанц «ороогүй» гэж тоологдохгүй');
}
console.log('✅ lazyShowVisible · бүлгийн хүүхэд · lazyReplace · устгагдсан');

/* ── 5. MapCanvas / Эрсдэлийн холболт (эх код) ── */
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const read = (p) => strip(readFileSync(new URL(p, import.meta.url), 'utf8').split('\r\n').join('\n'));
  const mc = read('./MapCanvas.tsx');
  assert.ok(!/layers:\s*buildLayers\(/.test(mc), '`buildLayers` Map-д ШУУД орох ёсгүй (бүх давхарга LayerView + мета татна)');
  assert.match(mc, /layers: \[\.\.\.\(imagery \? \[imagery\] : \[\]\), new GraphicsLayer\(\{ id: LAZY_END,/, 'Map эхэндээ ортофото + LAZY_END');
  assert.match(mc, /lazyRegister\(mapCache\[mapKey\], all,/);
  /* харагдацын эффект — Map-д ороогүйг ч давтаж, ил болсныг нэмнэ */
  const vis = mc.slice(mc.indexOf('const elev = dim === \'3d\' ? ON_SCENE : ON_GROUND;'), mc.indexOf('prevVisRef.current = on;'));
  assert.match(vis, /lazyTop\(map\)\.forEach\(\(l\) => \{/, 'харагдацын эффект `lazyTop`-оор');
  assert.match(vis, /lazyKids\(map, l\)\.forEach/, 'ортофотогийн нислэгийн тайл `lazyKids`-ээр');
  assert.match(vis, /lazyShowVisible\(map\);\s*$/, 'давталтын ДАРАА ил болсныг нэмнэ');
  assert.match(mc, /lazyTop\(view\.map\)\.forEach\(\(l\) => \{\s*if \(NO_HIGHLIGHT\.has/, 'тодруулга Map-д ороогүйд ч');
  assert.match(mc, /lazyTop\(map\)\.forEach\(\(l\) => \{\s*if \(!\('opacity' in l\)/, 'тунгалаг Map-д ороогүйд ч');
  assert.match(mc, /const zl = mapLayer\(mapRef\.current, ZONE_LAYER\.id\)/, 'бүсийн маск — унтраалттай бүс ч');
  const reach = mc.slice(mc.indexOf("const REACH_ID = 'irged:reach';"), mc.indexOf('geometryEngine.geodesicBuffer'));
  assert.match(reach, /const fl = mapLayer\(map, id\) as FeatureLayer \| null;/, 'буфер — бүлгийн нуугдсан давхарга ч');
  assert.match(mc, /\[\.\.\.on\]\.map\(\(id\) => ensureMapLayer\(map, id\)\)/, 'snapping — шинээр асаасан давхарга Map-д');
  assert.match(mc, /lazyReplace\(map, old, fresh\);/, '«Дахин оролдох» санг шинэчилнэ');
  const eg = read('../lib/ersdelGeom.ts');
  assert.match(eg, /const fl = mapLayer\(view\.map, id\) as FeatureLayer \| null;/, 'Эрсдэл: нуугдсан (ASSESS_IDS) давхарга ч шинжлэгдэнэ');
  assert.ok(!/view\.map\?\.findLayerById\(id\)/.test(eg), 'хуучин `findLayerById` (Map-д ороогүйг алгасдаг) буцав');
  const er = read('../modules/Ersdel.tsx');
  assert.match(er, /const fl = mapLayer\(viewRef\.current\?\.map, p\.layerId\)/);
}
console.log('✅ MapCanvas · Эрсдэл: lazy холболт');

console.log('\nlazyLayers.check: ok');
