/**
 * ДАШБОАРДЫН ТОО — бусад дэлгэцтэй НЭГ томьёо (2026-09-30), эх кодын бүтцийн шалгуур.
 *   node src/modules/dashboardNumbers.check.mjs
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
const scopePlain = /const scope = f \? contractedScope\(f\.contracts\) : null;/.test(src);
assert.ok(/contractedScope\(f\.contracts\)/.test(panel) || (scopePlain && /const sc = scope;/.test(panel)),
  'хуримтлалын хуваагч contractedScope-оос биш');
const schedFn = src.slice(src.indexOf('function ScheduleDetail('), src.indexOf('03 · Орон сууцны 7 багц'));
assert.ok(!/\buse[A-Z]\w*\(/.test(schedFn), 'ScheduleDetail дотор hook байна — detailPanels() энгийн функцээр дууддаг тул унана');
assert.ok(!/planTotal\.forEach/.test(panel), 'хуримтлал FinData.planTotal (гэрээ ЭСВЭЛ төсөв) руу буцав');
assert.match(panel, /const scKeys = new Set\(\[\.\.\.sc\.keys\]\.map\(finPkgKey\)\);/, 'гэрээлсэн багцын түлхүүр finPkgKey-ээр хөрвүүлэгдээгүй');
assert.match(panel, /f\.givenTotal\.forEach\(\(v, k\) => \{ if \(scKeys\.has\(finPkgKey\(k\)\)\) givenAll \+= v; \}\);/, 'тоологч гэрээлсэн багцаар (finPkgKey) шүүгдээгүй');
assert.match(panel, /if \(!scKeys\.has\(finPkgKey\(k\)\)\) return;/, 'сарын дүн finPkgKey-ээр шүүгдээгүй');
assert.ok(!/cum \+= m\.given/.test(panel), 'сарын дүн БҮХ багцын олголтоос (m.given) авагдав');

/* 2 — «Багц» зурвас: 2026-11-24 — орон сууцны багцуудын БАГЦЫН ГҮЙЦЭТГЭЛИЙН дундаж (`planPkgAvg` → `packagesAverage`,
       багц бүрийн жингээр), эх ачаалж байхад «…» */
const rail = src.slice(src.indexOf("case 'bagts': {"), src.indexOf("case 'land': {"));
assert.match(rail, /const avg = b \? pkgPct\(\(k\) => b\.some\(\(x\) => x\.key === k\)\) : null;/,
  '«Багц» зурвас багцын гүйцэтгэлийн дунджаар биш');
assert.match(rail, /pp == null \? dots\(d\.planPkg\)/, 'багцын гүйцэтгэл ачаалж байхад «…» гарахгүй байна');
assert.match(src, /const pkgPct = \(match: \(k: string\) => boolean\): number \| null => \(pp \? planPkgAvg\(pp, match\) : null\);/,
  'зурвасын багцын дундаж planPkgAvg-аар биш');
assert.match(src, /packagesAverage\(new Map\(\[\.\.\.m\]\.filter\(\(\[k\]\) => pred\(k\)\)\)\)\.S/, 'planPkgAvg нь packagesAverage-аар биш');

/* 3 — ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ бодиттой НЭГ (ХО) жинтэй: `Finance.projectPlanOf` бүх «төлөвлөсөн −
       бодит» замд (2026-09-30). Тооцоо нь `gdash.check` · `pkgProgress.ui.check`-д. */
const fin = readFileSync(new URL('./Finance.tsx', import.meta.url), 'utf8');
assert.match(fin, /const series = key \? pc\.byBagts\.get\(key\) : \(planProjectCache \?\? pc\.months\);/,
  'Finance.lagOf-ийн төслийн зам ХО-оор жигнэсэн төлөвлөгөө уншихгүй байна');
assert.match(fin, /planProjectCache = planCurveCache \? projectPlanOf\(\{ contracts, phys, physN \}, planCurveCache\) : null;/,
  'planProjectCache loadFinDataRaw-д бөглөгдөхгүй байна');
const prog = readFileSync(new URL('./PkgProg.tsx', import.meta.url), 'utf8');
/* 2026-11-24 (хэрэглэгч: 2-р унтраалга): «Багцын явц»-ын толгой (TsKpi) = бүх багцын «Багцын гүйцэтгэл»-ийн дундаж
   (`packagesAverage`), жагсаалт/«Төслийн төрөл» = `planPkgProgress` — орон сууцны биет % (physNow) руу буцахгүй */
assert.match(prog, /const a = packagesAverage\(plan\);/, 'PkgProg.TsKpi бүх багцын дундаж (packagesAverage) биш');
assert.match(prog, /\(\) => \(projQ\.state === 'ready' \? planPkgProgress\(projQ\.data\) : null\)/, 'PkgProg-ийн багцын хувь planPkgProgress-оос биш');
assert.match(prog, /mean = packagesAverage\(sub\)\.S \?\? 0;/, 'PkgProg.CatChart ангиллын дундаж packagesAverage-аас биш');
assert.ok(!/physLatest\(|physNow\(fin|infraPhysNow\(/.test(prog), 'PkgProg багцын/ангиллын хувьд биет % (physLatest/physNow/infraPhysNow) руу буцав');
assert.match(prog, /finQ\.state === 'ready' \? projectPlanOf\(finQ\.data, pc\) : pc\.months/, 'PkgProg-ийн төслийн графикийн төлөвлөгөө блокоор жигнэсэн хэвээр');
const exec = readFileSync(new URL('../lib/execReport.ts', import.meta.url), 'utf8');
assert.match(exec, /const lagNow = projectLagNow\(fin, plan, nowYm, dayKey\(Date\.now\(\)\)\);/, 'удирдлагын тайлангийн төлөвлөгөө/зөрүү projectLagNow-оор биш');
assert.match(fin, /const plan = pc\?\.months\.length \? projectPlanOf\(fin, pc\) : \[\];/, 'projectLagNow projectPlanOf-оор биш');
assert.ok(!/gapLabel\(planned, actual\)/.test(src), 'Дашбоардын «Гүйцэтгэлийн зөрүү» planned − physNow (өөр олонлог) руу буцав');
const pkgFin = readFileSync(new URL('./PkgFin.tsx', import.meta.url), 'utf8');
assert.match(pkgFin, /const gap = lag \? lag\.gap : null;/, 'PkgFin-ийн зөрүү planned − (бүх багцын) actual руу буцав');
assert.ok(!/planPctAt\(plan\.months/.test(exec), 'удирдлагын тайлан PlanCurve.months-ыг шууд уншиж байна');

/* 4 — (2026-11-04) явцын муруйнууд бүгд 'latest' — «Гүйцэтгэлийн явц» (projTrendPoints) · «Барилга угсралтын явц»
       · блокийн муруй (BuildingPanel.BlockTrend) бөгж (`latestMean`)-тэй нэг тоо; анхдагч 'peak' зөрүү зурдаг байв
       (2026-09: 21.8% ↔ 21.2%). Тооцоо нь `blockProgressSeries.check`-д. */
assert.match(src, /return progressSeries\(h, keys, 'month', 'latest'\)\.map/, 'projTrendPoints анхдагч peak горимд буцав');
assert.equal((src.match(/progressSeries\(/g) ?? []).length, (src.match(/progressSeries\([\s\S]{0,160}?'latest'/g) ?? []).length,
  'Dashboard: progressSeries дуудлага бүр latest горимтой');
const bp = readFileSync(new URL('./BuildingPanel.tsx', import.meta.url), 'utf8');
assert.match(bp, /progressSeries\(hist, \[blockKey\], grain === 'day' \? 'day' : 'month', 'latest'\)/, 'BlockTrend peak горимд буцав');

/* 5 — (2026-11-04) «Олгосон хувь (төсөлд)» мөр бүрт Төслийн нийт E-д хуваана (мөрийн өөрийн E биш) */
assert.match(fin, /const rootE = result\.values\.get\(tree\.root\)\?\.E;/, 'ТТБ: rootE алга');
assert.match(fin, /ppCalcVal\(c\.k, n \? moneyOf\.get\(n\) : undefined, rootE\)/, 'ТТБ: олгосон хувь мөрийн өөрийн E-д хуваагдаж байна');

/* 6 — (2026-11-06) самбарын тулгалт */
/* 2026-11-24: «Шугам сүлжээ» · «Цахилгаан» зурвас — тэр багцуудын БАГЦЫН ГҮЙЦЭТГЭЛИЙН дундаж (урьд нь бөглөх хуудасны биет) */
assert.match(src, /actual: pkgPct\(isNetworkPack\)/, '«Шугам сүлжээ» зурвас багцын гүйцэтгэлээр биш');
assert.match(src, /actual: pkgPct\(isPowerPack\)/, '«Цахилгаан» зурвас багцын гүйцэтгэлээр биш');
assert.ok(!/physNowOf\(/.test(src), 'багцын зурвас бөглөх хуудасны биет (physNowOf) руу буцав');
assert.match(src, /HOUSING_PKGS\.includes\(x\.key\) && \(x\.actual != null \|\| x\.planned != null\)/, 'орон сууцны хэсгийн «Төлөвлөгөө vs бодит» бүх багцыг харуулав');
/* 2026-11-24: багц бүрийн зурвас/жагсаалт — БАГЦЫН ГҮЙЦЭТГЭЛ (`planPkg` · `withPlanPkg`), нэг эх */
{
  const panel = (title) => {
    const i = src.indexOf(`title={tr('${title}')}`);
    assert.ok(i > 0, `«${title}» самбар олдсонгүй`);
    return src.slice(i, src.indexOf('</Panel>', i));
  };
  assert.match(panel('Багцаар — Багцын гүйцэтгэл'), /<Data q=\{planPkg\}[\s\S]*planPkgRows\(pp, pkgLabelOf\)/, '«Багцаар» багцын гүйцэтгэлээр биш');
  assert.match(panel('Төлөвлөгөөний хоцрогдол — багцаар'), /<Data q=\{planPkg\}[\s\S]*planPkgRows\(pp, pkgLabelOf\)/, 'хоцрогдол P − S-ээр биш');
  assert.match(panel('Багц ажлаар'), /<Data q=\{d\.bagtsPkg\}/, '«Багц ажлаар» багцын гүйцэтгэлээр биш');
  assert.match(panel('Багц бүрийн явц'), /<Data q=\{withPlanPkg\(q, planPkg\)\}/, '«Багц бүрийн явц» багцын гүйцэтгэлээр биш');
  assert.match(panel('Төлөвлөгөө vs бодит — багцаар'), /<Data q=\{planPkg\}[\s\S]*planPkgRows\(pp,/, '«Төлөвлөгөө vs бодит — багцаар» багцын S/P-ээр биш');
  assert.match(src, /progress: pp\.data\.get\(r\.key\)\?\.S \?\? null/, 'withPlanPkg — багцын S');
  assert.match(src, /if \(pp\.state === 'loading'\) return \{ state: 'loading'/, 'withPlanPkg — ачаалж байхад хуучин биет тоо харуулна');
}
assert.match(src, /bg2\.byType\.find\(\(t\) => t\.key === 'НИЙГМИЙН ДЭД БҮТЭЦ'\)/, 'нийгмийн төсөв давхаргын жагсаалтаас (20.6–20.9 дутна)');
assert.ok(!src.includes('Гэрээ байгуулах эрх'), 'гэрээлсэн дүн «эрх» гэж нэрлэгдэв');
assert.ok(!src.includes('(захирамжаар)'), 'эх үүсвэр нь Төслийн нийт дүн — захирамжийн дүн биш');
assert.match(src, /landuseText\(r\[PL\.landuseFull\], r\[PL\.landuse\]\)/, 'зориулалт нэгтгэсэн бүтэн нэрээр биш');
assert.match(src, /const parcelArea = parcelAreaLookup\(rows\);/, 'хэмжээний самбар `land.parcelAreasDeduped`-ээр биш');
assert.ok(!src.includes('тоогоор их, талбайгаар бага'), 'амьд тоотой зөрдөг өгүүлбэр буцав');
/* Шүүлттэй үед эх үүсвэрийн дүн мөрийн нийлбэр — гарчиг «төслийн нийт» гэж хэлэхгүй; гэрээт эх үүсвэр нь тоо биш, мөнгө */
const gdSrc = readFileSync(new URL('./GeneralDash.tsx', import.meta.url), 'utf8');
/* 2026-11-17 (хэрэглэгч): 4 эх үүсвэрийг бүр хасав — дашбоард · удирдлагын тайланд эх үүсвэрийн хэсэг байхгүй */
assert.ok(!gdSrc.includes('Санхүүжилтийн эх үүсвэр'), 'Ерөнхий дашбоардад эх үүсвэрийн хэсэг буцав');
const exSrc = readFileSync(new URL('./ExecReport.tsx', import.meta.url), 'utf8');
assert.ok(!exSrc.includes('«Ажил», «Гэрээт» нь мөрийн тоо'), '«Гэрээт» багана мөнгө — мөрийн тоо гэж тайлбарлав');
assert.ok(!exSrc.includes('Санхүүжилтийн эх үүсвэр'), 'Удирдлагын тайланд эх үүсвэрийн хэсэг буцав');

console.log('dashboardNumbers.check.mjs — БҮГД ТЭНЦЛЭЭ');
