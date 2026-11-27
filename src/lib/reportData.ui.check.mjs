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
const { buildFindings, withPlans, pkgAvgOf } = await import('./reportData.ts');
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
  /* 2026-11-27 (аудит): багцын мөрийн төлөвлөгөө ЗӨВХӨН «Багцын гүйцэтгэл»-ийн P — хуваарийн муруйгаар нөхөхгүй */
  x.overall.stages[1].planned = 63.8;
  const plans = { total: null, lag: null };
  const o = withPlans(x.overall, plans);
  assert.deepEqual(o.stages.map((s) => s.planned), [null, 63.8], 'мөргүй багц «—» хэвээр, P-тэй багц P');
  assert.equal(withPlans(x.overall, null), x.overall, 'төлөвлөгөө уншигдаагүй — хэвээр');
  assert.equal(buildFindings({ ...x, overall: withPlans(x.overall, { ...plans, lag: 8.85, total: 35.51 }) }).buildLag, 8.85);
  assert.equal(buildFindings(x).buildLag, null);
  const t = docText({ ...x, overall: o });
  assert.ok(t.includes('63.80%'), 'багцын төлөвлөгөө хүснэгтэд');
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

/* 2026-11-24 (аудит): «захирамжийн хэдэн % гэрээлсэн» — хоёр тал ИЖИЛ хүрээ (Cashflow-ийн ажлын мөр); ТТБ-ийн нийт гэрээ (ТЭЗҮ/зураг орсон) биш */
{
  const x = extra();
  x.finance.orderContract = 2030121559894;
  const d = buildFindings(x);
  assert.ok(Math.abs(d.contractRate - (2030121559894 / 2306498408722) * 100) < 1e-9, `contractRate ${d.contractRate}`);
  assert.notEqual(d.contractRate, (x.finance.contractAmount / x.finance.orderTotal) * 100, 'ТТБ-ийн нийт гэрээ ÷ захирамж (өөр хүрээ)');
  assert.equal(buildFindings(extra()).contractRate, null, 'ижил хүрээний гэрээлсэн дүн алга — хувь бодохгүй');
  const data = readFileSync(new URL('./reportData.ts', import.meta.url), 'utf8');
  assert.match(data, /orderContract: share0\.contract,/, 'ачаалагч ажлын мөрийн гэрээлсэн дүнг өгнө');
}
console.log('✅ гэрээлсэн хувь — захирамжтай ижил хүрээ');

/* 2026-11-27 (аудит №14/19/49): §2 · §3 · §6.1-ийн «Нийт» = ЖАГССАН (орон сууцны) багцуудын «Багцын гүйцэтгэл»-ийн дундаж
   (`pkgAvgOf`) — дэд бүтцийн багц орохгүй; PDF ба дэлгэц НЭГ эх */
{
  /* орон сууц Багц-1 (жин 10, S 50) + дэд бүтэц Багц-5.1 (жин 30, S 10): «Нийт» = 50 (урьд нь бүх багцын 20) */
  const pp = new Map([['БАГЦ1', { S: 50, P: 60, rows: 1, w: 10 }], ['БАГЦ51', { S: 10, P: 20, rows: 1, w: 30 }]]);
  assert.deepEqual(pkgAvgOf(pp, ['БАГЦ1']), { S: 50, P: 60 }, 'жагссан багцаар л');
  assert.deepEqual(pkgAvgOf(pp, ['БАГЦ1', 'БАГЦ51']), { S: 20, P: 30 }, 'хоёуланг жагсаавал жигнэсэн дундаж');
  assert.deepEqual(pkgAvgOf(pp, ['БАГЦ2']), { S: null, P: null }, 'тохирох багц алга — null («—»), 0 биш');
  const x = extra();
  x.overall.pkgAvg = { S: 31.47, P: 42.19 };
  x.progress.byBagts = [{ bagts: 'Багц 2', blocks: 26, pct: 28.56 }, { bagts: 'Багц 3.2', blocks: 12, pct: 29.88 }];
  const rows = [{ key: 'БАГЦ2', label: 'Багц 2', blocks: 26, ail: 100, progress: 28.56 }, { key: 'БАГЦ32', label: 'Багц 3.2', blocks: 12, ail: 50, progress: 29.88 }];
  const body = (no) => {
    const c = buildReportDoc(rows, '2026-11-27', x).content;
    const i = c.findIndex((n) => n && n.style === 'caption' && String(n.text).startsWith(`Хүснэгт ${no}.`));
    return c[i + 1].table.body;
  };
  const tot = (no, col) => body(no).at(-1)[col].text;
  assert.equal(tot('2', 4), '31.47%', '§2 Нийт');
  assert.equal(tot('3', 3), '31.47%', '§3 Нийт гүйцэтгэл');
  assert.equal(tot('3', 4), '42.19%', '§3 Нийт төлөвлөгөө');
  assert.equal(tot('6.1', 2), '31.47%', '§6.1 Нийт');
  delete x.overall.pkgAvg;
  assert.equal(body('2').at(-1)[4].text, '—', 'эх алга — «—» (биет хувиар орлуулахгүй)');
  const scr = readFileSync(new URL('../modules/Tailan.tsx', import.meta.url), 'utf8');
  assert.match(scr, /const bagtsAvg = x\.overall\.pkgAvg\?\.S \?\? null;/, 'дэлгэц — ижил эх');
  /* §3-ын тайлбар — «Нийт» хаанаас гардгийг үнэнээр хэлнэ (дэлгэц = PDF) */
  const pdfSrc = readFileSync(new URL('./reportPdf.ts', import.meta.url), 'utf8');
  for (const [n, s] of [['дэлгэц', scr], ['PDF', pdfSrc]]) {
    assert.ok(!s.includes('нийт гүйцэтгэлийг жингийн нийлбэрт харьцуулан тооцов'), `${n}: §3 хуучин тайлбар үлдсэн`);
    assert.ok(s.includes('«Нийт» мөрийн гүйцэтгэл ба төлөвлөгөө нь энэ хүснэгтийн багцуудын «Багцын гүйцэтгэл»-ийн дундаж'), `${n}: §3 шинэ тайлбар`);
  }
  /* №35: «Товч хураангуй»-н гэрээлсэн ₮ — PDF-тэй ижил `orderContract`, хувь 2 орон */
  assert.equal((scr.match(/bn\(x\.finance\.orderContract \?\? x\.finance\.contractAmount\)/g) ?? []).length, 2, 'дэлгэцийн хураангуй — orderContract (2 мөр)');
  assert.ok(!scr.includes('pct(d.contractRate, 1)'), 'дэлгэцийн гэрээлсэн хувь — PDF шиг 2 орон');
  /* «Багцын гүйцэтгэл» уншигдаагүй бол хос унана — мөрийг 0.00% болгохгүй */
  assert.ok(!/loadPlanPkgProgress\(\)\)\.catch\(\(\) => null\)/.test(scr), 'loadReportPair: уншигдаагүйг null→0% болгохгүй');
  assert.match(scr, /<Data q=\{pair\}[\s\S]{0,80}\{\(\[rows\]\) =>/, 'дэлгэцийн багцын мөр — PDF-тэй ижил `loadReportPair`');
  assert.ok(!scr.includes("pct(x.progress.overall, 2)}</td>"), '§6.1 Нийт биет хувиар биш');
  assert.ok(!scr.includes('Багц тус бүрийн барилга угсралтын гүйцэтгэл'), '§6.1 нэр PDF-тэй ижил');
  const data = readFileSync(new URL('./reportData.ts', import.meta.url), 'utf8');
  assert.match(data, /pkgAvg: pkgAvgOf\(pkgPlan, byPkg\.keys\(\)\)/, '«Нийт» — жагссан багцын түлхүүрээр');
  /* №37/51: кэш хаях түлхүүр — багцын S/P-д нөлөөлөх бүх эх */
  for (const fn of ['loadOverall', 'loadProgress']) {
    const m = data.match(new RegExp(`export const ${fn} = cached\\(${fn}Raw, [^\\[]*\\[([^\\]]*)\\]`));
    assert.ok(m, `${fn} cached`);
    for (const k of ['ZOVSHOOROL', 'PARCEL_LEFT', 'HUVAARI_OBYEM', 'ZURAG_BURTGEL']) assert.ok(m[1].includes(`'${k}'`), `${fn}: ${k} түлхүүр алга`);
  }
  const ex = data.match(/export const loadReportExtra = cached\(loadReportExtraRaw, [^\[]*\[([^\]]*)\]/);
  for (const k of ['ZOVSHOOROL', 'PARCEL_LEFT', 'HUVAARI_OBYEM']) assert.ok(ex[1].includes(`'${k}'`), `loadReportExtra: ${k} түлхүүр алга`);
}
console.log('✅ «Нийт» мөр — жагссан багцуудын гүйцэтгэл, дэлгэц = PDF');

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
