/**
 * ДАШБОАРДЫН ТОО — бусад дэлгэцтэй НЭГ томьёо (2026-09-30), эх кодын бүтцийн шалгуур.
 *   node src/modules/dashboardNumbers.check.mjs
 *
 * ⚠️ `Dashboard.tsx` нь ArcGIS SDK, газрын зураг зэрэг хүнд модуль импортолдог тул
 *    энд ТЕКСТЭЭР уншина (`ceo/registry.check`, `tuhData.check`-ийн арга). Тооцооны
 *    цөм (`gdash.contractedScope`, `execData.buildProgressOf`) өөрсдийн шалгууртай.
 *
 * Хамгаалж буй алдаанууд:
 *   1. «Санхүүжилтийн хуримтлал — сараар» (тайлбар «олгосон / гэрээний нийт дүн»)
 *      `FinData.planTotal`-аар (гэрээ ЭСВЭЛ төсөв, бүх мөр) хуваадаг байсан тул
 *      Тайлангийн `paidRate` · удирдлагын тайлангийн `fin.share`-ээс хэдэн нэгж хувиар
 *      доогуур төгсдөг байв → одоо `contractedScope` (гэрээлсэн дүн ба түүний багцууд).
 *   2. «Багц» (railStat) — санхүү (`f`) ачаалж байхад `buildProgressOf(b, undefined)`
 *      БЛОКИЙН тоогоор жигнэсэн өөр тоо зурж, дараа нь ХО жин рүү үсэрдэг байв.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./Dashboard.tsx', import.meta.url), 'utf8');

/* 1 — хуримтлалын хуваагч/тоологч = гэрээлсэн хүрээ */
const at = src.indexOf("tr('Санхүүжилтийн хуримтлал — сараар')");
assert.ok(at > 0, '«Санхүүжилтийн хуримтлал» самбар олдсонгүй');
const panel = src.slice(at, src.indexOf('</Panel>', at));
/* ⚠️ 2026-10-09: `contractedScope` нь `ScheduleDetail`-ийн дээд талд MEMO (`scope`) — самбар `const sc = scope;` */
const scopeMemo = /const scope = useMemo\(\(\) => \(f \? contractedScope\(f\.contracts\) : null\), \[f\]\);/.test(src);
assert.ok(/contractedScope\(f\.contracts\)/.test(panel) || (scopeMemo && /const sc = scope;/.test(panel)),
  'хуримтлалын хуваагч contractedScope-оос биш');
assert.ok(!/planTotal\.forEach/.test(panel), 'хуримтлал FinData.planTotal (гэрээ ЭСВЭЛ төсөв) руу буцав');
assert.match(panel, /sc\.keys\.forEach\(\(k\) => \{ givenAll \+= f\.givenTotal\.get\(k\)/, 'тоологч гэрээлсэн багцаар шүүгдээгүй');
assert.ok(!/cum \+= m\.given/.test(panel), 'сарын дүн БҮХ багцын олголтоос (m.given) авагдав');

/* 2 — «Багц» зурвас ХО жингүйгээр тоо гаргахгүй */
const rail = src.slice(src.indexOf("case 'bagts': {"), src.indexOf("case 'land': {"));
assert.match(rail, /const avg = b && f\s*\?\s*buildProgressOf\(b, pkgCostWeight\(f\.contracts\.map\(cfWeightRow\)\)\)\.pct/,
  '«Багц» зурвас ХО жингүй (блокийн нөөц) тоо гаргаж болзошгүй');
assert.match(rail, /f == null \? dots\(d\.fin\)/, 'санхүү ачаалж байхад «…» гарахгүй байна');

/* 3 — ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ бодиттой НЭГ (ХО) жинтэй: `Finance.projectPlanOf` бүх «төлөвлөсөн −
       бодит» замд (2026-09-30). Тооцоо нь `gdash.check` · `pkgProgress.ui.check`-д. */
const fin = readFileSync(new URL('./Finance.tsx', import.meta.url), 'utf8');
assert.match(fin, /const series = key \? pc\.byBagts\.get\(key\) : \(planProjectCache \?\? pc\.months\);/,
  'Finance.lagOf-ийн төслийн зам ХО-оор жигнэсэн төлөвлөгөө уншихгүй байна');
assert.match(fin, /planProjectCache = planCurveCache \? projectPlanOf\(\{ contracts, phys, physN \}, planCurveCache\) : null;/,
  'planProjectCache loadFinDataRaw-д бөглөгдөхгүй байна');
const prog = readFileSync(new URL('./PkgProg.tsx', import.meta.url), 'utf8');
assert.match(prog, /fin \? projectPlanOf\(fin, planQ\.data\) : planQ\.data\.months/, 'PkgProg.TsKpi-ийн төлөвлөгөө блокоор жигнэсэн хэвээр');
assert.match(prog, /finQ\.state === 'ready' \? projectPlanOf\(finQ\.data, pc\) : pc\.months/, 'PkgProg-ийн төслийн графикийн төлөвлөгөө блокоор жигнэсэн хэвээр');
const exec = readFileSync(new URL('../lib/execReport.ts', import.meta.url), 'utf8');
/* ⚠️ 2026-10-09 (аудит №2): төлөвлөгөө ба зөрүү НЭГ (хуваарьтай) багцын олонлогоор — `projectLagNow`
   (дотроо `projectPlanOf`); зөрүүний бодит тал `physNow` биш */
assert.match(exec, /const lagNow = projectLagNow\(fin, plan, nowYm, dayKey\(Date\.now\(\)\)\);/, 'удирдлагын тайлангийн төлөвлөгөө/зөрүү projectLagNow-оор биш');
assert.match(fin, /const plan = pc\?\.months\.length \? projectPlanOf\(fin, pc\) : \[\];/, 'projectLagNow projectPlanOf-оор биш');
assert.match(prog, /const ln = projectLagNow\(fin, planQ\.data, nowYm, todayDayKey\(\)\);/, 'PkgProg.TsKpi-ийн зөрүү projectLagNow-оор биш');
assert.ok(!/gapLabel\(planned, actual\)/.test(src), 'Дашбоардын «Гүйцэтгэлийн зөрүү» planned − physNow (өөр олонлог) руу буцав');
const pkgFin = readFileSync(new URL('./PkgFin.tsx', import.meta.url), 'utf8');
assert.match(pkgFin, /const gap = lag \? lag\.gap : null;/, 'PkgFin-ийн зөрүү planned − (бүх багцын) actual руу буцав');
assert.ok(!/planPctAt\(plan\.months/.test(exec), 'удирдлагын тайлан PlanCurve.months-ыг шууд уншиж байна');

console.log('dashboardNumbers.check.mjs — БҮГД ТЭНЦЛЭЭ');
