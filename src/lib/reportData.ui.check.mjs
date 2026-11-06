/**
 * ДЭЛГЭРЭНГҮЙ ТАЙЛАН — `buildFindings` · `withPlans` · `buildReportDoc` (цэвэр, сүлжээгүй; 2026-11-06).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/reportData.ui.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. Дотоодын ажиллах хүчний хувь: гадаадын тоо хоосон компани хасагдаж 912/1,306 (69.8%) биш 50.0% гардаг байв.
 *   2. Хоёр өөр хэмжүүр гэж нэрлэсэн нэг тоо, «долоон» үзүүлэлт, «ХО» товчлол, §7-ийн тайлбаргүй зөрүү, §8-ийн давхцсан нийт талбай.
 *   3. «голчлон түүнээс хамаарна» — 24% жинтэй багцад.
 *   4. Төлөвлөгөөт хувь байхгүй гэж хэлдэг байв — хамрах хүрээ хангалттай багцад гарна (`withPlans`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installDom } from './audienceReport.fixture.mjs';

installDom();
const { buildFindings, withPlans } = await import('./reportData.ts');
const { buildReportDoc } = await import('./reportPdf.ts');

const extra = () => ({
  overall: {
    pct: 26.66, weightSum: 74.43, rows: 113,
    stages: [
      { key: 'БАГЦ2', label: 'Багц 2', rows: 26, weight: 17.98, actual: 28.56, planned: null },
      { key: 'БАГЦ32', label: 'Багц 3.2', rows: 12, weight: 7.5, actual: 29.88, planned: null },
    ],
  },
  land: { parcels: 2085, areaM2: 961303, pct: 91.4, byStatus: [{ label: 'Бүрэн чөлөөлсөн', n: 1906 }, { label: 'зөвшилцөх', n: 179 }], byReason: [{ label: 'зөвшилцөх', n: 179 }] },
  social: { rows: [], n: 0, areaM2: 0 },
  progress: { blocks: 113, reported: 98, overall: 26.66, date: '2026-10-26', phases: [], byBagts: [], slowest: [], stalled: 0 },
  finance: {
    rows: 71, budget: 2495841880529, orderTotal: 2306498408722, contractAmount: 2041921559894, paidContracted: 500e9, paidOther: 30e9,
    landBudget: 0, sources: [{ label: 'Нийслэл', value: 2495841880529 }], paid: 530e9, paidPct: 26, byType: [],
    byTypeTotal: { budget: 2671904013188, contract: 2041921559894 }, byBagts: {},
  },
  infra: { groups: [{ key: 'land', title: 'Газар', layers: 1, n: 2085, len: 0, area: 961303 }], totals: { layers: 1, n: 2085, len: 100, area: 5095397 } },
  habea: {
    date: '2026-11-05', workers: 1306, mongol: 912, gadaad: 394, tehnik: 72, incidents: 18,
    byCompany: [
      { label: 'A', bagts: 'Багц 4.1', workers: 318, mongol: 305, gadaad: 13, tehnik: 1 },
      { label: 'B', bagts: 'Багц 2', workers: 286, mongol: 15, gadaad: 271, tehnik: 1 },
      { label: 'C', bagts: 'Багц 1', workers: 184, mongol: 74, gadaad: 110, tehnik: 1 },
      { label: 'D', bagts: 'Багц 3.3', workers: 242, mongol: 242, gadaad: null, tehnik: 1 },
      { label: 'E', bagts: 'Багц 3.2', workers: 167, mongol: 167, gadaad: null, tehnik: 1 },
      { label: 'F', bagts: 'Багц 4.2', workers: 109, mongol: 109, gadaad: null, tehnik: 1 },
    ],
  },
  fetchedAt: 0,
  projectPct: 32.4,
});
const docText = (x) => JSON.stringify(buildReportDoc([], '2026-11-06', x).content);

{
  const d = buildFindings(extra());
  assert.ok(Math.abs(d.mongolShare - (912 / 1306) * 100) < 1e-9, `дотоодын хувь ${d.mongolShare}`);
  const partial = extra();
  partial.habea.byCompany = [{ label: 'X', bagts: null, workers: 10, mongol: 4, gadaad: null, tehnik: 0 }];
  assert.equal(buildFindings(partial).mongolShare, null, 'гадаад хоосон, дотоод ≠ ажилтан — тодорхойгүй хэвээр');
}
console.log('✅ дотоодын ажиллах хүчний хувь — 912 / 1,306');

{
  assert.equal(buildFindings(extra()).heavyStage, null, '24%-ийн жин «голчлон» биш');
  const heavy = extra();
  heavy.overall.stages[0].weight = 50;
  assert.equal(buildFindings(heavy).heavyStage.label, 'Багц 2', 'жингийн дийлэнх — өгүүлбэр гарна');
}
console.log('✅ хамгийн жинтэй багц — зөвхөн дийлэнхэд');

{
  const x = extra();
  const plans = { byKey: new Map([['БАГЦ32', 63.8]]), total: null, lag: null };
  const o = withPlans(x.overall, plans);
  assert.deepEqual(o.stages.map((s) => s.planned), [null, 63.8], 'зөвхөн хамрах хүрээ хангалттай багц');
  assert.equal(withPlans(x.overall, null), x.overall, 'төлөвлөгөө уншигдаагүй — хэвээр');
  assert.equal(buildFindings({ ...x, overall: withPlans(x.overall, { ...plans, lag: 8.85, total: 35.51 }) }).buildLag, 8.85);
  assert.equal(buildFindings(x).buildLag, null);
  const t = docText({ ...x, overall: o });
  assert.ok(t.includes('63.8%'), 'багцын төлөвлөгөө хүснэгтэд');
  assert.ok(!t.includes('Төлөвлөгөө (алга)') && !t.includes('одоогоор байхгүй'), 'төлөвлөгөө байхгүй гэсэн худал алга');
}
console.log('✅ §3 төлөвлөгөө — хамрах хүрээний дүрмээр');

{
  const t = docText(extra());
  assert.ok(!t.includes('ХО') && !t.includes('долоон') && !t.includes('бөглөх хуудасгүй'), 'хуучин бичвэр үлдсэн');
  assert.ok(t.includes('зургаан гол үзүүлэлт') && t.includes('төсвөөр жигнэсэн'));
  assert.ok(!t.includes('Захирамж, гэрээгээр баталгаажсан'), '§7: бүх багц гэрээгээр баталгаажсан мэт');
  assert.ok(t.includes('176,062,132,659') && t.includes('нийгмийн дэд бүтэц'), '§7.2-ын зөрүүний тайлбар');
  assert.ok(t.includes('Дэд бүтцийн төлөвлөгөөт цар хүрээ') && !t.includes('Дэд бүтцийн хэрэгжилт'));
  assert.ok(!t.includes('5,095,397'), '§8: давхцсан давхаргын нийт талбай гарахгүй');
  assert.ok(t.includes('961,303'), '§8: бүлгийн талбай хэвээр');
}
console.log('✅ тайлангийн бичвэр — тооцоотой нийцнэ');

/* Эх код — дэлгэц ба өгөгдөл */
{
  const data = readFileSync(new URL('./reportData.ts', import.meta.url), 'utf8');
  assert.match(data, /budget: shownRows\.reduce/, '§7.2 нийт мөр нуугдсан хэсгийг хасна (мөрүүдтэй нэг хүрээ)');
  assert.match(data, /id === 'land:left'[\s\S]{0,120}loadLandStatus\(\)\)\.areaM2/, '§8-ын газар = §4-ийн талбай');
  assert.match(data, /coverageOk\(now\.coverage\) && !now\.excluded\.length/, '§3 нийт: хуваарьгүй багц хасагдсан төлөвлөгөө бүх багцын гүйцэтгэлтэй зэрэгцэхгүй');
  const scr = readFileSync(new URL('../modules/Tailan.tsx', import.meta.url), 'utf8');
  for (const bad of ['Excel', 'ХО-оор', 'долоон гол', 'Төлөвлөгөө (алга)', 'Дэд бүтцийн хэрэгжилт']) assert.ok(!scr.includes(bad), `Tailan: «${bad}» үлдсэн`);
}
console.log('✅ reportData.ui.check: OK');
