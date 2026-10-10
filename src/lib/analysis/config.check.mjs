/**
 * ТОХИРОМЖТОЙ БАЙДЛЫН ТОХИРГООНЫ ИНВАРИАНТ — `INDICATORS` жин ба `NORM_FAIL_MAX`.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/analysis/config.check.mjs
 *
 * ⚠️ 2026-10-09 (аудит №6): ЯАГААД. `config.ts`-ийн тайлбарууд хэд хэдэн зүйлийг
 *    «дүрэм» гэж ЗААДАГ ч код барьдаггүй байв:
 *    - `ref: true` (лавлагаа) үзүүлэлт оноололд ОРОХГҮЙ → жин 0 (эс бөгөөс нэг ногоон
 *      талбай/нягтшил оноонд ХОЁР удаа тоологдоно — `greenCap`/`densityCap`-ийн ⚠️);
 *    - оноолох үзүүлэлт бүр эерэг жинтэй, нийлбэр нь >0 (загвар нийлбэрээр нормчилдог
 *      тул 0 бол бүх оноо NaN);
 *    - `NORM_FAIL_MAX` нь «Дунд» түвшний доод босгоос (`SCORE_LEVELS`, 45) ДООГУУР —
 *      «норм зөрчсөн бүс шууд шар/улбар шар» гэсэн `STRICT_NORM`-ын утга учир;
 *    - band/higher/lower нормын мужууд урвуу биш (`score.check.mjs` нь `patchNorm`-ын
 *      ЗАСВАРЫГ шалгадаг, анхны тогтмолыг биш).
 *    Сүлжээ ХЭРЭГГҮЙ — цэвэр тогтмолууд.
 */

import assert from 'node:assert/strict';
import {
  INDICATORS, CATEGORIES, SCORE_LEVELS, STRICT_NORM, NORM_FAIL_MAX,
} from './config.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

ok('INDICATORS хоосон биш, id давтагдашгүй', () => {
  assert.ok(INDICATORS.length >= 5, `үзүүлэлт хэт цөөн: ${INDICATORS.length}`);
  const ids = INDICATORS.map((i) => i.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  assert.deepEqual(dup, [], `давхардсан id: ${dup.join(', ')}`);
});

ok('ангилал бүр CATEGORIES-д бий, ангилал бүрд ≥1 оноолох үзүүлэлт', () => {
  const cats = new Set(CATEGORIES.map((c) => c.key));
  for (const i of INDICATORS) assert.ok(cats.has(i.cat), `${i.id}: танигдаагүй ангилал ${i.cat}`);
  for (const c of cats) {
    assert.ok(INDICATORS.some((i) => i.cat === c && !i.ref), `ангилал «${c}» оноолох үзүүлэлтгүй`);
  }
});

ok('жин: ref → 0, оноолох → >0, бүгд төгсгөлөг', () => {
  for (const i of INDICATORS) {
    assert.ok(Number.isFinite(i.weight) && i.weight >= 0, `${i.id}: жин буруу (${i.weight})`);
    if (i.ref) assert.equal(i.weight, 0, `${i.id}: лавлагаа (ref) атлаа жинтэй — оноонд давхар тоологдоно`);
    else assert.ok(i.weight > 0, `${i.id}: оноолох үзүүлэлт 0 жинтэй`);
  }
});

ok('оноолох жингийн нийлбэр > 0, нэг үзүүлэлт нийлбэрийн тал хүрэхгүй', () => {
  const scored = INDICATORS.filter((i) => !i.ref);
  const sum = scored.reduce((s, i) => s + i.weight, 0);
  assert.ok(sum > 0, 'жингийн нийлбэр 0 — оноо NaN болно');
  /* ⚠️ Нийлбэр яг 100 байх ШААРДЛАГАГҮЙ (`config.ts`-ийн ⚠️: UI хувийг өөрөө бодно) —
     зөвхөн нэг үзүүлэлт давамгайлахгүй байхыг барина. */
  for (const i of scored) assert.ok(i.weight * 2 < sum, `${i.id}: жин ${i.weight} нийлбэрийн (${sum}) талаас их`);
  console.log(`    нийлбэр ${sum} (${scored.length} оноолох · ${INDICATORS.length - scored.length} лавлагаа)`);
});

ok('нормын мужууд урвуу биш', () => {
  for (const i of INDICATORS) {
    if (i.ref) continue;
    if (i.mode === 'band') {
      const { hardMin, optMin, optMax, hardMax } = i;
      for (const [k, v] of Object.entries({ hardMin, optMin, optMax, hardMax })) {
        assert.ok(Number.isFinite(v), `${i.id}: band-д ${k} алга`);
      }
      assert.ok(hardMin <= optMin && optMin <= optMax && optMax <= hardMax, `${i.id}: band муж урвуу`);
    } else if (i.mode === 'higher') {
      assert.ok(Number.isFinite(i.target) && Number.isFinite(i.hardMin), `${i.id}: higher-т target/hardMin алга`);
      assert.ok(i.hardMin < i.target, `${i.id}: hardMin ≥ target`);
    } else if (i.mode === 'lower') {
      assert.ok(Number.isFinite(i.best) && Number.isFinite(i.hardMax), `${i.id}: lower-т best/hardMax алга`);
      assert.ok(i.best < i.hardMax, `${i.id}: best ≥ hardMax`);
    } else {
      assert.fail(`${i.id}: танигдаагүй mode ${i.mode}`);
    }
  }
});

ok('NORM_FAIL_MAX < «Дунд»-ын доод босго, STRICT_NORM boolean', () => {
  assert.equal(typeof STRICT_NORM, 'boolean');
  /* «Дунд» = дээрээс 3 дахь түвшин (Маш сайн · Сайн · Дунд · Муу · Маш муу) */
  assert.equal(SCORE_LEVELS.length, 5);
  const mid = SCORE_LEVELS[2];
  assert.ok(Number.isInteger(NORM_FAIL_MAX) && NORM_FAIL_MAX >= 0, `NORM_FAIL_MAX буруу: ${NORM_FAIL_MAX}`);
  assert.ok(NORM_FAIL_MAX < mid.min, `NORM_FAIL_MAX (${NORM_FAIL_MAX}) «Дунд»-ын босго (${mid.min})-оос доогуур биш`);
  /* Түвшнүүд завсаргүй, давхцалгүй, 0…101 */
  for (let k = 0; k < SCORE_LEVELS.length - 1; k++) {
    assert.equal(SCORE_LEVELS[k].min, SCORE_LEVELS[k + 1].max, `SCORE_LEVELS[${k}] ↔ [${k + 1}] завсартай/давхцсан`);
  }
  assert.equal(SCORE_LEVELS[SCORE_LEVELS.length - 1].min, 0);
  assert.ok(SCORE_LEVELS[0].max > 100, '100 оноо дээд түвшинд багтахгүй');
});

console.log(`✅ config.check: ${n} шалгалт давлаа`);
