/**
 * `_form` давхаргын хаяг тогтоох — `formLayer.ts`.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/formLayer.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formLayerPending, isFormUrl, resolveFormLayer } from './formLayer.ts';

const FORM = 'https://x/Hosted/service_a_form/FeatureServer/0';
const SRC = 'https://x/Hosted/service_a/FeatureServer/0';

assert.equal(isFormUrl(FORM), true);
assert.equal(isFormUrl(SRC), false);
assert.equal(formLayerPending({ id: 'plain', url: SRC }), false, 'энгийн давхарга хүлээхгүй');
assert.equal(formLayerPending(undefined), false);

/* `_form` нээлттэй — хаяг хэвээр, дахин шалгахгүй */
{
  const d = { id: 'a', url: FORM };
  const seen = [];
  assert.equal(formLayerPending(d), true, 'шалгахаас өмнө зурагт гарахгүй');
  await resolveFormLayer(d, async (u) => { seen.push(u); });
  assert.equal(d.url, FORM);
  assert.equal(formLayerPending(d), false);
  await resolveFormLayer(d, async (u) => { seen.push(u); });
  assert.deepEqual(seen, [FORM], 'нэг л шалгалт');
}
/* `_form` хаалттай — эх үйлчилгээ рүү */
{
  const d = { id: 'b', url: FORM };
  const seen = [];
  await resolveFormLayer(d, async (u) => { seen.push(u); if (u === FORM) throw new Error('403'); });
  assert.equal(d.url, SRC);
  assert.equal(formLayerPending(d), false, 'эх үйлчилгээгээр гарна');
  assert.deepEqual(seen, [FORM, SRC]);
}
/* Хоёулаа хаалттай — далд хэвээр, алдаа шидэхгүй, дахин оролдож болно */
{
  const d = { id: 'c', url: FORM };
  await resolveFormLayer(d, async () => { throw new Error('403'); });
  assert.equal(d.url, FORM);
  assert.equal(formLayerPending(d), true, 'нэвтрэлт шаардуулахгүйн тулд ачаалахгүй');
  await resolveFormLayer(d, async () => {});
  assert.equal(formLayerPending(d), false, 'дараа нь нээгдвэл гарна');
}
/* Зэрэг дуудвал нэг шалгалт */
{
  const d = { id: 'e', url: FORM };
  let n = 0;
  const probe = async () => { n += 1; };
  await Promise.all([resolveFormLayer(d, probe), resolveFormLayer(d, probe)]);
  assert.equal(n, 1);
}
console.log('✅ resolveFormLayer: нээлттэй · эх үйлчилгээ · хоёулаа хаалттай · зэрэг');

/* MapCanvas: хүлээгдэж буй `_form` давхарга `visibleKey`-д орохгүй; инстанцын хаяг ачаалахаас өмнө солигдоно */
const m = readFileSync(new URL('./MapCanvas.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
assert.match(m, /const visibleKey = visible\.filter\(\(id\) => !formLayerPending\(LAYER_BY_ID\[id\]\)\)\.join\(','\);/);
assert.match(m, /await resolveFormLayer\(d\);\s+if \(formLayerPending\(d\)\) return;\s+const e = await extentOf/, 'томруулах хүсэлт хаяг тогтоосны дараа');
assert.match(m, /resolveFormLayer\(d\)\.then\(\(\) => \{ if \(!formLayerPending\(d\)\) void goTo\(layerUrl\(d\), '1=1'\); \}\)/, 'давхарга руу томруулах ч хаяг тогтоосны дараа');
const fl = readFileSync(new URL('./formLayer.ts', import.meta.url), 'utf8');
assert.match(fl, /!\/query\/i\.test\(j\.capabilities\)/, 'Query эрхгүй хаяг хаалттайд тооцогдоно');
const sync = m.indexOf('if (l && isFormUrl(String(l.url)) && !isFormUrl(d.url))');
const main = m.indexOf('/* Харагдац ба БҮСИЙН шүүлт */');
assert.ok(sync > 0 && sync < main, 'хаяг солих effect харагдацын effect-ээс ӨМНӨ');
console.log('✅ MapCanvas: `_form` шалгагдтал далд · хаяг ачаалахаас өмнө');
