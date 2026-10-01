/**
 * «ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨ» САМБАР (`ViewPanel`) ба СХЕМИЙН НЭРШЛИЙН РЕГРЕСС (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/viewPanel.check.mjs
 *
 * Хамгаалж буй алдаанууд (засвар бүр `⚠️ 2026-09-30`):
 *   1. Бүс/барилгын «Хүн ам» `Total_population` (багтаамж нэмсэн) — `Population` байх ёстой.
 *   2. Бүсийн барилгын нийлбэр зөвхөн 3 мэдэгдэх төлөвөөс — бусад нь чимээгүй хасагдана;
 *      зогсоол хоёулаа хоосон бол «… / 0».
 *   3. Бүс сонгоход картууд төслийн бүхэл км/га-г харуулна, «Давхарга» 125, тэмдэглэл «төсөл бүхэлдээ».
 *   4. Давхаргагүй IoT карт «0 төрөл», дарахад бүх давхарга унтарна.
 *   5. Хэсэгчилсэн нийлбэр: «Нийт» чимээгүй бага; давхаргын самбар «…» мөнхөд.
 *   6. Бүс солигдоход чартын сонголт/тодруулга цуцлах удирдлагагүй үлдэнэ.
 *   7. Схем: `progress.stalled` (< 1% — эхлээгүй) «Зогссон блок» гэж нэрлэгддэг; «Тайлангүй блок»
 *      «0%-аар ордог» гэж худал тайлбартай.
 * 2026-10-01 (хэрэглэгч: бүгдийг зас):
 *   8. Дангаарчилсан давхаргыг буцаахад өмнөх сонголт биш БҮХ давхарга асдаг.
 *   9. «Зурагт төвлөрөх» бүс сонгосон ч давхаргын бүтэн хүрээ рүү нисдэг.
 *  10. Бүс сонгоход ZONE_ID-гүй сонгосон давхарга самбараас чимээгүй алга болдог.
 *  11. Барилгын төлөвийн тодруулгын кирилл литерал `N'…'`-гүй.
 *  12. «Дундаж урт/талбай» уртгүй объектыг ч хуваарьт оруулдаг.
 *  13. Жижиг нийлбэр «0.0 км/га».
 *  14. Схемийн багц/нарийвчлал URL-д хадгалагддаггүй; «Буцаасан» шошго ирмэгээсээ хол.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FINE_BY_ID } from '@/lib/schemFine';
import { NODE_BY_ID } from '@/lib/schem';
import { GROUP_LAYERS, LAYER_BY_ID, PLAN_LAYER_IDS } from '@/lib/services';
import { whereFor, avgQty } from '@/lib/totals';
import { toggleIsolate, zoomWhereFor } from './viewPanelLogic.ts';

const vp = readFileSync(new URL('./ViewPanel.tsx', import.meta.url), 'utf8');

/* 1 */
assert.ok(vp.includes("sum(POPULATION_FIELD, 'pop')"), 'бүсийн хүн ам — Population');
assert.ok(!vp.includes("sum(B.population, 'pop')"));
assert.ok(vp.includes("[POPULATION_FIELD, tr('Хүн ам')]"), 'барилгын хүн ам — Population');
assert.ok(!vp.includes("[BUILT_FIELDS.population, tr('Хүн ам')]"));

/* 2 */
assert.ok(vp.includes('built: rows.reduce((a, r) => a + r.values.n, 0),'), 'нийлбэр бүх бүлгээс');
assert.ok(vp.includes('n(F.parkPlanOpen) == null && n(F.parkPlanUnder) == null ? null'), 'зогсоол null ≠ 0');

/* 3 · 4 */
assert.ok(vp.includes('const cardIds = (key: keyof typeof GROUP_LAYERS) => GROUP_LAYERS[key].filter((id) => counted.includes(id));'));
assert.ok(vp.includes('ids={cardIds(g.key)}'));
assert.ok(vp.includes("note={zone ? tr('бүс: {0}', zone) : tr('төсөл бүхэлдээ')}"));
assert.ok(vp.includes('value={num(counted.length)}'));
assert.ok(Object.values(GROUP_LAYERS).some((ids) => ids.length === 0), 'давхаргагүй багц одоо ч бий — шүүлт хэрэгтэй');
assert.ok(vp.includes('LAYER_GROUPS.filter((g) => cardIds(g.key).length > 0).map('));

/* 5 */
assert.ok(vp.includes('const allN = missing.length ? null :'));
assert.ok(vp.includes("totals.state === 'ready' && !t ? ("));

/* 6 */
assert.ok(vp.includes("const selKey = `${d.id}|${zone ?? ''}`;"));

/* 7 — жинхэнэ зангилааны нэр/тайлбар */
assert.equal(FINE_BY_ID.ers.title, 'Эхлээгүй блок (<1%)');
assert.ok(FINE_BY_ID.ers.desc.includes('1%-иас доогуур'));
assert.ok(!FINE_BY_ID.barNo.desc.includes('0%-аар ордог'), '«0%-аар ордог» худал тайлбар');
assert.ok(NODE_BY_ID.ersdel.desc.startsWith('Эхлээгүй блок'));

/* ══════════════════ 2026-10-01 (хэрэглэгч: бүгдийг зас) ══════════════════ */

/* 8 — дангаарчлах → буцаахад ӨМНӨХ олонлог (урьд нь үргэлж PLAN_LAYER_IDS) */
{
  const ALL = ['a', 'b', 'c', 'd', 'e'];
  let iso = null;
  let vis = ['a', 'c', 'zone'];
  let r = toggleIsolate(vis, 'c', iso, ALL);
  assert.deepEqual(r.next, ['c']);
  iso = r.iso; vis = r.next;
  r = toggleIsolate(vis, 'c', iso, ALL);
  assert.deepEqual(r.next, ['a', 'c', 'zone'], 'буцаахад өмнөх сонголт сэргэсэнгүй');
  assert.equal(r.iso, null);
  /* A → B шууд шилжвэл анхны олонлог хэвээр */
  r = toggleIsolate(['a', 'c'], 'a', null, ALL);
  r = toggleIsolate(r.next, 'c', r.iso, ALL);
  assert.deepEqual(r.next, ['c']);
  r = toggleIsolate(r.next, 'c', r.iso, ALL);
  assert.deepEqual(r.next, ['a', 'c'], 'дараалсан дангаарчлалд анхны олонлог алдагдав');
  /* Хооронд нь гараар өөрчилсөн — санамж хуучирсан, урьдын нөөц */
  r = toggleIsolate(['a', 'b'], 'a', null, ALL);
  r = toggleIsolate(['b'], 'b', r.iso, ALL);
  assert.deepEqual(r.next, ALL, 'хуучирсан санамжаар сэргээв');
  /* Санамжгүй буцаалт — урьдын адил бүх давхарга */
  assert.deepEqual(toggleIsolate(['a'], 'a', null, ALL).next, ALL);
  assert.ok(vp.includes('toggleIsolate(visible, id, isoRef.current, PLAN_LAYER_IDS)'));
  assert.ok(!vp.includes('? PLAN_LAYER_IDS.slice()'), 'хуучин «бүх давхарга руу» буцаалт үлдэв');
}

/* 9 — «Зурагт төвлөрөх» бүс сонгосон үед бүсийн доторх объектууд руу */
{
  const zoned = PLAN_LAYER_IDS.map((id) => LAYER_BY_ID[id]).find((d) => d && !d.noZone);
  const free = Object.values(LAYER_BY_ID).find((d) => d.noZone);
  assert.ok(zoned && free, 'бүстэй ба бүсгүй давхарга хоёулаа бий');
  assert.equal(zoomWhereFor(zoned, null), null, 'бүсгүй үед бүтэн давхарга');
  assert.equal(zoomWhereFor(zoned, 'Багц-1'), whereFor(zoned, 'Багц-1'), 'бүсийн шүүлт + давхаргын тогтмол шүүлт');
  assert.equal(zoomWhereFor(free, 'Багц-1'), null, 'ZONE_ID-гүй давхарга бүтнээрээ');
  assert.ok(vp.includes('zoomWhere ? zoomToWhere(d.id, zoomWhere) : zoomToLayer(d.id)'));
}

/* 10 — бүс сонгоход ZONE_ID-гүй сонгосон давхарга «төслийн нийт» тэмдэгтэй жагсагдана */
assert.ok(vp.includes('const zoneless = zone ? PLAN_LAYER_IDS.filter((id) => LAYER_BY_ID[id]?.noZone && visible.includes(id)) : [];'));
assert.equal(vp.split('{zonelessList}').length - 1, 2, 'ерөнхий ба сонголтын горим хоёуланд');
assert.ok(vp.includes("<span className={s.facetNote}>{tr('төслийн нийт')}</span>"));

/* 11 — кирилл төлөвийн WHERE `N'…'` угтвартай (`sqlStr`) */
assert.ok(vp.includes('`${BUILT_FIELDS.status} = ${sqlStr(v)}`'));
assert.ok(!vp.includes("replace(/'/g, \"''\")}'`"), 'угтваргүй юникод литерал үлдэв');

/* 12 — дундаж нь хэмжээ БӨГЛӨГДСӨН объектоор (`avgQty`), `t.q / t.n` БИШ */
assert.ok(vp.includes('const avg = d.qty ? avgQty(t) : null;'));
assert.ok(!vp.includes('t.q / t.n : null'), 'дундаж бүх объектоор хуваагдсан хэвээр');
assert.equal(avgQty({ n: 10, q: 500, nq: 5 }), 100, 'уртгүй 5 объект дундажийг бууруулав');

/* 13 — жижиг нийлбэр «0.0 км/га» БИШ (`qtyText`) */
assert.ok(vp.includes('if (x.km > 0) rows.push(splitQty(kmText(x.km)));'));
assert.ok(vp.includes('if (x.ha > 0) rows.push(splitQty(haText(x.ha)));'));
assert.ok(!vp.includes("num(x.km, 1), k: tr('км')"));
assert.ok(!/display: \(v: number, t: Totals\) => tr\('\{0\} (га|км) · \{1\}'/.test(vp), 'чартын бичиглэл «0.0 га» хэвээр');
assert.ok(!vp.includes('`${num(c.sum, 1)} ${c.note}`'));

/* 14 — Схем: багц ба нарийвчлал URL-д; шошго өөрийн ирмэг дээр (`edgeLabelAt`) */
{
  const sc = readFileSync(new URL('./Schem.tsx', import.meta.url), 'utf8');
  assert.ok(sc.includes("useState<string>(() => readParam('pkg') ?? '')"), 'багц URL-аас сэргэхгүй');
  assert.ok(sc.includes("useState(() => readParam('fine') !== '0')"), 'нарийвчлал URL-аас сэргэхгүй');
  assert.ok(sc.includes("writeParams({ pkg: pkg ? bagtsKey(pkg) : null, fine: fine ? null : '0' });"));
  assert.ok(sc.includes('edgeLabelAt(L.box[e.from], L.box[e.to], e.kind)'));
  assert.ok(!sc.includes('+ geo.w / 2}'), 'хуучин шошгоны байрлал үлдэв');
  /* Жагсаалтад алга багц ИЛ сонголт хэвээр (төслийн нийт мэт харагдахгүй) */
  assert.ok(sc.includes('{pkg && !pkgHit && <option value={pkg}>{pkg}</option>}'));
}

console.log('viewPanel.check: OK');
