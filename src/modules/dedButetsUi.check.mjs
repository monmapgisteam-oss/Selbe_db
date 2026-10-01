/**
 * «ИНЖЕНЕРИЙН ДЭД БҮТЭЦ» ХАРАГДАЦЫН РЕГРЕСС (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/dedButetsUi.check.mjs
 *
 * Хамгаалж буй алдаанууд (засвар бүр `⚠️ 2026-09-30` тэмдэгтэй):
 *   1. Засварын горимоор харагдацаас гарахад хойшлуулсан нийлбэрийн цэвэрлэгээ алга болж,
 *      засварын өмнөх км/тоо сешн дуустал үлддэг; нээлттэй каталог шинэчлэгддэггүй.
 *   2. Хадгалаагүй маягт/дүрс/vertex/олноор засах утга харагдац солих, F5-д асуулгүй алга
 *      болдог (`navGuard`); олноор засах самбарын ✕ бичсэнийг асуулгүй хаядаг.
 *   3. Геометр татаж байх зуур өөр объект товшвол А-гийн бариул Б-гийн самбарт гарна.
 *   4. Буцаалтын дараа нээлттэй маягт устсан/хуучирсан мөрийг харуулсаар.
 *   5. Уртын талбар `Length_m`/`Length_metr`/`Shugam_Urt`-тэй давхаргад «бодит урт» сануулга гардаггүй.
 *   6. Бүсээр хуваагддаггүй KPI бүс солих бүрд 74 статистик дахин татдаг, тэмдэглэлгүй.
 *   7. Багцын мөр ЭХНИЙ давхарга (ДХТ талбай) руу нисдэг.
 *   8. «Саад — багцаар» багцыг эхний давхаргын нэрээр нэрлэж, дэд бүтцийн засварт хуучирдаг.
 * ⚠️ React/ArcGIS-ийн холболт тул ЭХ КОДООР (Node-д газрын зураг зурагдахгүй); 5 нь бүртгэлээр.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DED_BUTETS_LAYER_IDS, LAYER_BY_ID } from '@/lib/services';
import { lenFieldUnit } from '@/lib/butetsLen';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const src = read('./DedButets.tsx');
const edit = read('./DedButetsEdit.tsx');
const batch = read('./DedButetsBatch.tsx');
const saad = read('../lib/pkgSaad.ts');
const ovl = read('../lib/parcelOverlap.ts');

/* 1 */
assert.ok(src.includes('if (editModeRef.current && !layerOpenRef.current) { totalsStale.current = true; return; }'));
assert.ok(src.includes('if (totalsStale.current) { totalsStale.current = false; dropTotalsCache(); }'), 'unmount flush');

/* 2 */
assert.ok(src.includes("import { setNavDirty } from '@/lib/navGuard';"));
assert.ok(src.includes("useEffect(() => () => setNavDirty('butets', false), []);"), 'гарахад туг арилна');
assert.ok(src.includes('|| batchDirty.current;'), 'askDropUnsaved олноор засахыг тооцно');
assert.ok(src.includes('onDirty={(v) => { batchDirty.current = v; navSync.current(); }}'));
assert.ok(/onClick=\{\(\) => askDropUnsaved\(\(\) => \{\s*setMulti\(false\); setRectDraw\(false\);/.test(src), '✕ асууна');
assert.ok(batch.includes('useEffect(() => { onDirtyRef.current?.(isDirty); }, [isDirty]);'));
assert.ok(batch.includes('useEffect(() => () => onDirtyRef.current?.(false), []);'));

/* 3 */
assert.ok(src.includes('if (!pk || pk.layerId !== layerId || pk.oid !== oid) return;'));

/* 4 */
assert.ok(src.includes("if (onForm && u.kind === 'add') {"));
assert.ok(src.includes('setFormRev((x) => x + 1);') && src.includes('key={formRev}'));

/* 5 — шугам давхарга бүр уртын талбартай бөгөөд маягт түүнийг таньдаг */
const LEN_FIELD = /^(urt_m|urt_km|length_km)$/i;
let missed = 0;
for (const id of DED_BUTETS_LAYER_IDS) {
  const L = LAYER_BY_ID[id];
  if (L?.geom !== 'line') continue;
  const f = L.qty?.field ?? '';
  assert.ok(f, `${id}: уртын талбаргүй шугам`);
  if (!LEN_FIELD.test(f)) missed++;
}
assert.ok(missed > 0, 'хуучин regex танихгүй талбар одоо ч байна — тестийн урьдчилсан нөхцөл');
/* ⚠️ 2026-10-01: таних дүрэм `butetsLen.lenFieldUnit` руу шилжив (нэр + qty.field + нэгж) */
for (const id of DED_BUTETS_LAYER_IDS) {
  const L = LAYER_BY_ID[id];
  if (L?.geom !== 'line' || String(L.qty?.field ?? '').toLowerCase().startsWith('shape__')) continue;
  assert.ok(lenFieldUnit(L.qty.field, L.qty), `${id}: уртын талбар ${L.qty.field} танигдах ёстой`);
}
assert.ok(edit.includes('lenFieldUnit(f.name, qtyDef)'), 'маягт уртын талбарыг lenFieldUnit-ээр таньна');

/* 6 — ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): «бүсгүй — төслийн нийт»-ийн оронд бүсийн
   ПОЛИГОНООР орон зайн шүүлт (`totals.loadZoneAoi`). */
assert.ok(src.includes('usePlanTotalsLive(zone, true, totalIds, { spatialZone: true })'));
assert.ok(!src.includes("tr('Инженерийн шугам бүсээр хуваагддаггүй — төслийн нийт дүн')"));
assert.ok(src.includes("tr('Бүсийн хилээр шүүсэн — хилийг огтолсон шугам бүтнээрээ орно')"));

/* 7 */
assert.ok(src.includes('sel.ids.find(isLenLayer) ?? sel.ids[0]'));

/* 8 */
assert.ok(saad.includes('commonName(ids.map((id) => LAYER_BY_ID[id]?.title ?? id))'));
assert.ok(!saad.includes('LAYER_BY_ID[ids[0]]?.title'));
assert.ok(saad.includes('subscribeTotals(() => { ovCache = null; });'));
assert.ok(ovl.includes('subscribeTotals(() => { geomCache.clear(); resultCache.clear(); });'));

/* ══════════ 9. 2026-10-01 (хэрэглэгч: бүгдийг зас) ══════════ */
/* «Гэрээний багцын шугам» (нийттэй давхардсан) → системээр км */
assert.ok(!src.includes("label={tr('Гэрээний багцын шугам')}"), 'давхардсан KPI хасагдсан');
assert.ok(src.includes('SYSTEMS.slice(1)') && src.includes('className={d.kpiSys}'), 'систем бүрийн км');
/* «N объект уртгүй» */
assert.ok(src.includes("tr('{0} объект уртгүй — км-д ороогүй', num(m))") && src.includes('missingQty(totals.map.get(id))'));
/* Бохирын худаг — infra:69 (амьд схемээр баталсан) */
assert.ok(src.includes("const SEWER_WELL_EXTRA = ['infra:69'];"));
assert.ok(DED_BUTETS_LAYER_IDS.includes('infra:69'), 'infra:69 инженерийн давхаргад бий');
/* Хэсэгчилсэн буцаалт */
assert.ok(src.includes('const r = await revertRows(meta, u.rows);') && src.includes('setUndoable({ ...u, rows: u.rows.filter((x) => bad.has(Math.trunc(x.oid))) });'));
/* Маягт: «Урт ← геометр», шинэ объект ба хэлбэр засварын дараах автомат бөглөлт */
assert.ok(edit.includes("tr('Урт ← геометр')"));
assert.ok(edit.includes('p0[lf.f.name] = lenFieldValue(len, lf.unit, !!lf.f.int);'), 'шинэ объектод бөглөнө');
assert.ok(edit.includes('const len = await serverLenM(m, oid, row);'), 'хэлбэр засварын дараа бөглөнө');
assert.ok(src.includes('onDirty={() => { formDirty.current = true; navSync.current(); }}'), 'автомат бөглөлт «хадгалаагүй» болно');
/* Олноор засах: уртын анхааруулга · уншигдсан/сонгосон · хуучин→шинэ */
assert.ok(batch.includes('isLen(f.name) && ('), 'уртын талбарт анхааруулга');
assert.ok(batch.includes('{missing > 0 && ('), 'уншигдаагүй объектын анхааруулга');
assert.ok(batch.includes('<ul className={d.diffList}>'), 'хуучин → шинэ');
assert.ok(batch.includes("tr('{0}/{1} мөр бичигдсэн, {2} мөрөнд алдаа: {3}. Дахин «Хадгалах» дарвал бүгдэд дахин бичнэ.'"));

console.log('dedButetsUi.check: OK');
