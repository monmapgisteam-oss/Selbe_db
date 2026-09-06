/**
 * ҮЗҮҮЛЭЛТ → ЗАНГИЛААНЫ ЗУРАГЛАЛ — цэвэр өгөгдөл, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/kpiNodes.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ҮЗҮҮЛЭЛТ ЧИМЭЭГҮЙ АЛГА БОЛОХ. `execMetrics.tsx`-д шинэ үзүүлэлт
 *      нэмэгдээд энд зураглал нь бичигдээгүй бол дэлгэцэд ОГТ гарахгүй,
 *      алдаа ч өгөхгүй — хамгийн муу төрлийн эвдрэл.
 *   2. БАЙХГҮЙ ЗАНГИЛАА ЗААХ. `schem.ts`-ээс зангилаа устгагдвал энд заасан
 *      түлхүүр хоосон руу заана.
 */
import assert from 'node:assert/strict';
import { KPI_NODE, nodeOf, SUPERSEDES, supersededLabels } from './kpiNodes.ts';
import { NODES, buildSchem } from './schem.ts';

const ids = new Set(NODES.map((n) => n.id));

/* ── 1. Заасан зангилаа бүр СХЕМД БАЙГАА ── */
for (const [k, v] of Object.entries(KPI_NODE)) {
  if (v == null) continue;
  assert.ok(ids.has(v), `«${k}» нь схемд байхгүй «${v}» зангилаа заажээ`);
}

/* ── 2. `nodeOf` — гурван өөр хариу ── */
assert.equal(nodeOf('variance'), 'hyanalt');
assert.equal(nodeOf('area'), null, 'хамрах хүрээ → null');
assert.equal(nodeOf('огт байхгүй түлхүүр'), undefined, 'танигдаагүй → undefined');

/* ── 3. Нормын биелэлтийн ДИНАМИК түлхүүр ── */
assert.equal(nodeOf('plan:far'), 'tolovlolt');
assert.equal(nodeOf('plan:bcr'), 'tolovlolt');
assert.equal(nodeOf('plan:road'), 'tolovlolt');

/* ── 4. `null` ба `undefined` ХОЁР ӨӨР ── */
assert.notEqual(nodeOf('area'), undefined, 'хамрах хүрээ нь «зураглалгүй» БИШ');

/* ── 5. `execMetrics.tsx`-ийн БҮХ статик түлхүүр зураглалтай ──
   ⚠️ Файлыг уншиж `key: 'xxx'` хэв шинжийг олно. Жагсаалтыг энд ГАРААР
   давтвал шинэ үзүүлэлт нэмэгдэхэд шалгуур нь ХАМТ хоцорно. */
const src = await (await import('node:fs/promises')).readFile(
  new URL('../components/execMetrics.tsx', import.meta.url), 'utf8',
);
const keys = [...src.matchAll(/\bkey: '([^']+)'/g)].map((m) => m[1])
  /* `plan:${f.id}` мэт динамик түлхүүр нь энэ хэв шинжид баригдахгүй */
  .filter((k) => !k.includes('$'));
assert.ok(keys.length > 15, `түлхүүр хэт цөөн олдов (${keys.length}) — хэв шинж эвдэрсэн байж магадгүй`);
for (const k of keys) {
  assert.notEqual(nodeOf(k), undefined, `«${k}» үзүүлэлт зураглалгүй — дэлгэцэд гарахгүй`);
}

/* ── 6. ОРЛУУЛАЛТЫН ШОШГО СХЕМД БАЙГАА ──
   ⚠️ `SUPERSEDES` нь ШОШГООР тааруулдаг (схемийн метрик id-гүй). Схемд тэр
   шошго байхгүй бол орлуулалт ЧИМЭЭГҮЙ ажиллахаа болж, нэг зүйлийн тухай
   хоёр өөр тоо дэлгэцэд эргэн гарна — 2026-09-06-ны яг тэр согог. */
{
  /* ⚠️ Хоосон эх сурвалж — сүлжээгүй. Бидэнд ЗӨВХӨН шошгууд хэрэгтэй,
     утга нь бүгд `null` байсан ч болно. */
  const live = buildSchem({}, null);
  const labels = new Set(
    Object.values(live).flatMap((st) => st.metrics.map((m) => m.label)),
  );
  for (const [k, list] of Object.entries(SUPERSEDES)) {
    assert.notEqual(nodeOf(k), undefined, `SUPERSEDES-ийн «${k}» нь зураглалгүй`);
    for (const l of list) {
      assert.ok(labels.has(l), `«${k}» нь схемд байхгүй «${l}» шошгыг орлуулах гэж байна`);
    }
  }
  assert.deepEqual(
    [...supersededLabels(['progress', 'missing'])].sort(),
    ['Гүйцэтгэл', 'Тайлангүй блок'].sort(),
  );
  assert.equal(supersededLabels(['огт байхгүй']).size, 0, 'танигдаагүй түлхүүр юу ч орлуулахгүй');
}

console.log(`kpiNodes.check.mjs — БҮГД ТЭНЦЛЭЭ (${keys.length} үзүүлэлт зураглалтай)`);
