/**
 * «ГАЗАР ЧӨЛӨӨЛӨЛТ» ҮЕ ШАТЫН МӨНГӨН ДҮН = НӨХӨХ ОЛГОВРЫН НИЙЛБЭР (2026-11-19).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/projectPlanLand.check.mjs
 */
import assert from 'node:assert/strict';
import { withLandComp } from './projectPlanInputs.ts';
import { editWhy } from './planEdit.ts';
import { buildTree, computePlan } from './projectPlan.ts';

const rows = [
  { objectid: 1, dd_kod: '3', etseg_kod: null, uy_shat: 'Газар чөлөөлөлт', ajil_uilchilgee: 'Газар чөлөөлөлт', urdchilgaa_dun: 5 },
  { objectid: 2, dd_kod: '3.1', etseg_kod: '3', uy_shat: 'Газар чөлөөлөлт', ajil_uilchilgee: 'Дэд', ho_dun_geree: null },
  { objectid: 3, dd_kod: '6', etseg_kod: null, uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга', ho_dun_geree: 100 },
];
const out = withLandComp(rows, 411.5);
assert.equal(out[0].ho_dun_geree, 411.5, 'төсөвт өртөг');
assert.equal(out[0].geree_dun, 411.5, 'гэрээний дүн');
assert.equal(out[0].olgoson_dun, 411.5, 'олгосон дүн');
assert.equal(out[0].ho_dun_zahiramj, 411.5, 'захирамжийн дүн');
assert.equal(out[0].urdchilgaa_dun, 5, 'урьдчилгааны хадгалсан утга хэвээр');
assert.equal(withLandComp([{ ...rows[0], urdchilgaa_dun: null }], 1)[0].urdchilgaa_dun, 0, 'урьдчилгаа хоосон бол 0 — бодолтод орно');
assert.equal(out[0].landComp, true);
assert.equal(out[0].ho_dungiin_tailbar, 'Гэрээлсэн дүн', 'гэрээний дүн нийлбэрт орно');
assert.equal(out[1].ho_dun_geree, null, 'эцэгтэй (доод) мөр хөндөгдөхгүй');
assert.equal(out[2].ho_dun_geree, 100, 'өөр үе шат хөндөгдөхгүй');
assert.equal(rows[0].ho_dun_geree, undefined, 'эх мөр өөрчлөгдөхгүй (цэвэр)');
assert.deepEqual(withLandComp(rows, null), rows, 'нийлбэр алга — хэвээр');

const tree = buildTree(out);
const land = tree.nodes.find((n) => n.row?.objectid === 1);
assert.ok(editWhy(land, 'budget'), 'газрын мөрийн мөнгө гараар засагдахгүй');
/* 2026-11-19 (хэрэглэгч: «газар чөлөөлөлт нийслэлийн төсвөөс — гүйцэтгэлд тооцно, мөнгө нь тооцогдохгүй»): мөр өөрийн
   дүнгээ харуулна, «Мөнгөний нийлбэрт тооцох» анхдагчаар унтраалттай тул төслийн нийтэд орохгүй; асаавал орно */
{
  const r = computePlan(tree);
  assert.equal(r.values.get(land).E, 411.5, 'газрын мөр өөрийн дүнг харуулна');
  assert.equal(r.values.get(tree.root).E, 100, 'төслийн нийт төсөвт ОРОХГҮЙ (анхдагч)');
  const { moneySums } = await import('./projectPlan.ts');
  assert.equal(moneySums(tree).get(tree.root).paid, null, 'олгосон дүнгийн нийтэд ч орохгүй');
  const on = buildTree(out.map((x) => (x.objectid === 1 ? { ...x, mongo_tootsoh: 1 } : x)));
  assert.equal(computePlan(on).values.get(on.root).E, 511.5, 'асаавал нийтэд орно');
}
console.log('projectPlanLand.check: OK');

/* Нэгж талбарын олговор: нийт хоосон бол задаргааны нийлбэр (2026-11-19, аудит) */
{
  const { compOf } = await import('./land.ts');
  assert.equal(compOf({ olgovor_niit: 10, olgovor_gazar: 1 }), 10, 'нийт байвал нийт');
  assert.equal(compOf({ olgovor_niit: null, olgovor_gazar: 120, olgovor_horongo: null, olgovor_ed: 5 }), 125, 'задаргааны нийлбэр');
  assert.equal(compOf({ olgovor_niit: null }), null, 'бүгд хоосон — null');
}
