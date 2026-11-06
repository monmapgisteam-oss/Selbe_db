/**
 * MapCanvas-ийн эх кодын шалгалт — бүрэлдэхүүн нь газрын зураг шаарддаг тул гаралтыг энд ажиллуулдаггүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/mapCanvasFixes.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./MapCanvas.tsx', import.meta.url), 'utf8');

/* Хэлбэр засах нь vertex бариулаар эхэлнэ — үгүй бол SDK «transform» хайрцаг нээнэ */
assert.ok(src.includes("const vertexOnly = { tool: 'reshape', toggleToolOnClick: false } as const;"), 'дүрс дээр дарахад transform руу шилжинэ');
assert.ok(src.includes('svm.defaultUpdateOptions = vertexOnly;'), 'гадуур дараад буцаж дарахад transform нээгдэнэ');
assert.ok(src.includes('svm.update([graphic], vertexOnly)'), 'reshape хэрэгсэл заагаагүй');

/* Хэмжилтгүй блок = 0% (эзний дүрэм); саарал нь зөвхөн гүйцэтгэл огт татагдаагүй үед */
assert.ok(!src.includes("tr('Мэдээлэлгүй')"), 'блокийн гүйцэтгэлд «Мэдээлэлгүй» үлдэв');
assert.ok(src.includes('(prog: BlockProgressMap, failed = false)'), 'renderer алдаа ба хэмжилтгүйг ялгахгүй байна');
assert.ok(src.includes("defaultLabel: failed ? tr('Гүйцэтгэл ачаалагдсангүй') : '0%'"), 'хэмжилтгүй блокийн шошго 0% биш');
assert.ok(src.includes('color: [...progColor(0), 0.62]'), 'хэмжилтгүй блокийн өнгө 0%-ийнх биш');
assert.ok(src.includes('buildingProgressRenderer(empty, true)'), 'татаж чадаагүй үед саарал биш');
assert.ok(
  src.includes('const g = prog ? (prog.get(buildingKey(attrs[F.bagts], blk))?.overall ?? 0) : null;'),
  'хулганы доорх мэдээлэлд хэмжилтгүй блок 0% биш',
);

console.log('mapCanvasFixes.check: OK');
