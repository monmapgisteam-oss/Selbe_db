/**
 * `CATALOG_LAYER_IDS` (ТАТАХ жагсаалт) нь НИЙЛБЭР/каталогийн бүх id-ийн ДЭЭД ОЛОНЛОГ.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/services/groups.check.mjs
 *
 * ⚠️ 2026-10-09 (аудит №6): ЯАГААД. `groups.ts`-ийн `CATALOG_LAYER_IDS`-ийн ⚠️-д бичсэн
 *    2026-09-04-ний регресс: `catalogIdsOf`-оор каталогоос нуусан 9 id ТАТАХ жагсаалтаас
 *    ч унаж, `ViewPanel` (`PLAN_LAYER_IDS`-ээр нийлбэрлэдэг) `map.get(id)?.n ?? 0` →
 *    3,564 объект ЧИМЭЭГҮЙ 0 болж, «Барилга» бүлэг самбараас алга болсон. Тэр дүрэм
 *    («НИЙЛБЭРт орохгүй ч ТАТАГДСААР байх ёстой») зөвхөн тайлбарт байсан — энэ шалгуур
 *    кодоор барина. Сүлжээ ХЭРЭГГҮЙ — статик жагсаалтууд.
 *
 * Дүрэм:
 *   1. `PLAN_LAYER_IDS` (нийлбэр) ⊆ `CATALOG_LAYER_IDS` — `auth` давхаргаас бусад.
 *   2. `PKG_BY_FAMILY.pow` · `HABEA_LAYER_IDS` · `MONITOR_LAYER_IDS` · `IRGED_LAYER_IDS` ⊆.
 *   3. `catalogGroups(view)` бүх харагдацын мөр бүр ⊆ (каталогт харагдах мөр тоогоо олно).
 *   4. `CATALOG_LAYER_IDS`-д `auth` давхарга ОРОХГҮЙ (2026-09-15: токенгүй тооллого «0»
 *      гэж худал харуулдаг), давхардалгүй, бүгд `LAYER_BY_ID`-д бий.
 */
import assert from 'node:assert/strict';
const {
  CATALOG_LAYER_IDS, PLAN_LAYER_IDS, PKG_BY_FAMILY, HABEA_LAYER_IDS, MONITOR_LAYER_IDS,
  IRGED_LAYER_IDS, LAYER_BY_ID, catalogGroups,
} = await import('@/lib/services.ts');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };
const have = new Set(CATALOG_LAYER_IDS);
/** Татагдах ёстой id — `LAYER_BY_ID`-д байгаа, нэвтрэлт шаарддаггүй */
const fetchable = (ids) => ids.filter((id) => LAYER_BY_ID[id] && !LAYER_BY_ID[id].auth);
const missing = (ids) => fetchable(ids).filter((id) => !have.has(id));

ok('CATALOG_LAYER_IDS: давхардалгүй, бүгд LAYER_BY_ID-д, auth-гүй', () => {
  assert.ok(CATALOG_LAYER_IDS.length > 50, `хэт цөөн: ${CATALOG_LAYER_IDS.length}`);
  const dup = CATALOG_LAYER_IDS.filter((x, i) => CATALOG_LAYER_IDS.indexOf(x) !== i);
  assert.deepEqual(dup, [], `давхардсан: ${dup.join(', ')}`);
  const unknown = CATALOG_LAYER_IDS.filter((id) => !LAYER_BY_ID[id]);
  assert.deepEqual(unknown, [], `LAYER_BY_ID-д байхгүй: ${unknown.join(', ')}`);
  const auth = CATALOG_LAYER_IDS.filter((id) => LAYER_BY_ID[id].auth);
  assert.deepEqual(auth, [], `нэвтрэлт шаарддаг давхарга татах жагсаалтад: ${auth.join(', ')}`);
});

ok('PLAN_LAYER_IDS (нийлбэр) ⊆ CATALOG_LAYER_IDS', () => {
  const m = missing(PLAN_LAYER_IDS);
  assert.deepEqual(m, [], `нийлбэрийн id татагдахгүй (ViewPanel-д чимээгүй 0): ${m.join(', ')}`);
});

ok('pkg:pow · habea · monitor · irged ⊆ CATALOG_LAYER_IDS', () => {
  for (const [name, ids] of [
    ['PKG_BY_FAMILY.pow', PKG_BY_FAMILY.pow],
    ['HABEA_LAYER_IDS', HABEA_LAYER_IDS],
    ['MONITOR_LAYER_IDS', MONITOR_LAYER_IDS],
    ['IRGED_LAYER_IDS', IRGED_LAYER_IDS],
  ]) {
    const m = missing(ids);
    assert.deepEqual(m, [], `${name} татагдахгүй: ${m.join(', ')}`);
  }
});

ok('catalogGroups(view) бүх харагдацын мөр ⊆ CATALOG_LAYER_IDS', () => {
  const views = ['plan', 'monitor', 'habea', 'gazar', 'iot', 'irged', 'ersdel', 'dedButets'];
  for (const v of views) {
    const ids = catalogGroups(v).flatMap((g) => g.ids);
    assert.ok(ids.length > 0, `${v}: каталог хоосон`);
    const m = missing(ids);
    assert.deepEqual(m, [], `${v}: каталогийн мөр тоогоо олохгүй (мөнхөд «…»): ${m.join(', ')}`);
  }
});

console.log(`✅ groups.check: ${n} шалгалт давлаа`);
