/**
 * ҮЛ НИЙЦЛИЙН ТАЙЛАН — нэгтгэл.
 * 2026-11-27 (хэрэглэгч): тайлан «Нээлттэй үл нийцэл — шатлалаар» чарттай ИЖИЛ зарчмаар (үзлэгийн огнооноос 1–4 долоо
 * хоног) — дуусах хугацаа, «хугацаа хэтэрсэн / хугацаагүй» гэсэн ойлголтгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/actionReport.ui.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installDom } from './audienceReport.fixture.mjs';

installDom();
const { summarize, reportPkgs, stageOfItem, daysOpen, byStage, buildActionPdf, STAGE_LABEL, STAGE_COLOR } = await import('./actionReport.ts');
const { ESCALATION, stageOf } = await import('./habeaStage.ts');

const now = Date.UTC(2026, 10, 27);
const DAY = 86_400_000;
const row = (status, d = 0, due = null, sevCode = null) => ({ status, d, due, sevCode });

/* Нэр ба өнгө — хуудасны чарттай ижил (PDF/Excel Монгол хэлээр тул `tr` биш, гэхдээ зөрөхгүй) */
assert.deepEqual([...STAGE_LABEL], ESCALATION.map((s) => s.label()), 'шатны нэр чарттай ижил');
assert.deepEqual(STAGE_COLOR, ESCALATION.map((s) => s.color), 'шатны өнгө чарттай ижил');

/* Мөрийн шат — чартын `stageKey`-тэй нэг дүрэм */
assert.equal(stageOfItem(row(1, now - 3 * DAY), now), 0, '1-р долоо хоног');
assert.equal(stageOfItem(row(2, now - 7 * DAY), now), 1, '7 хоног — 2-р');
assert.equal(stageOfItem(row(4, now - 14 * DAY), now), 2, '14 хоног — 3-р');
assert.equal(stageOfItem(row(5, now - 21 * DAY), now), 3, '21 хоног — 4-р');
assert.equal(stageOfItem(row(1, now - 21 * DAY + 1), now), 2, '20 хоног 23:59 — 3-р хэвээр');
assert.equal(stageOfItem(row(1, now - 90 * DAY), now), 3, '4-р шатаас цааш ахихгүй');
assert.equal(stageOf(now - 21 * DAY, now), 3);
assert.equal(stageOfItem(row(1, now - 40 * DAY, now + 10 * DAY), now), 3, 'дуусах хугацаа шатад нөлөөлөхгүй');
assert.equal(stageOfItem(row(3, now - 40 * DAY), now), null, 'дууссан — шатгүй');
assert.equal(stageOfItem(row(null, now - 40 * DAY), now), 3, 'төлөв тодорхойгүй ч дуусаагүй — чарттай адил шатанд');
assert.equal(stageOfItem(row(1, 0), now), null, 'үзлэгийн огноогүй');
assert.equal(stageOfItem(row(1, now + DAY), now), null, 'ирээдүйн огноо');
assert.equal(daysOpen({ d: now - 25 * DAY - 5 }, now), 25);

const items = [
  row(1, now - 2 * DAY, null, 'major'), row(2, now - 9 * DAY, null, 'minor'), row(4, now - 16 * DAY),
  row(1, now - 30 * DAY, null, 'minor'), row(5, now - 22 * DAY), row(3, now - 50 * DAY, null, 'major'), row(null, 0),
];
const s = summarize(items, now);
assert.deepEqual(s.stages, [1, 1, 1, 2], 'шат бүрийн нээлттэй');
assert.equal(s.staged, 5, 'чартын «нээлттэй N»');
assert.deepEqual([s.total, s.done, s.open, s.unknown, s.major, s.minor], [7, 1, 5, 1, 2, 2]);
for (const k of ['overdue', 'noDue', 'lateNoDue']) assert.equal(k in s, false, `«${k}» (хугацаагаар) үлдээгүй`);
assert.deepEqual(byStage(s).map((b) => b.value), [1, 1, 1, 2]);
assert.deepEqual(byStage({ stages: [0, 0, 0, 0] }).length, 4, '0 тоотой шат ч харагдана');

/* PDF — шатлалын чарт ба нүд; «хугацаа хэтэрсэн / хугацаагүй» үг алга */
const pdf = JSON.stringify(buildActionPdf(items, { period: 'Бүх хугацаа', pkgs: [], now }, null));
assert.match(pdf, /Нээлттэй үл нийцэл — шатлалаар \(үзлэгийн огнооноос · нээлттэй 5\)/, 'PDF-ийн шатлалын чарт');
for (const l of STAGE_LABEL) assert.ok(pdf.includes(l), `PDF: ${l}`);
assert.match(pdf, /Хариуцлага тооцох шатанд \(21\+ хоног\)/, 'PDF-ийн нүд');
assert.match(pdf, /4-р долоо хоног — хариуцлага тооцох \(үзлэгээс 30 хоног\)/, 'PDF-ийн дэлгэрэнгүй — мөрийн шат');
assert.doesNotMatch(pdf, /хугацаагүй|хугацаа хэтэрсэн|Хугацаа хэтэрсэн/, 'PDF-д хугацааны зарчим алга');

const src = readFileSync(new URL('./actionReport.ts', import.meta.url), 'utf8');
assert.match(src, /const stage = stageOfItem\(x, meta\.now\)/, 'Excel-ийн «Шатлал» багана — нэг дүрэм');
assert.match(src, /'Шатлал \(үзлэгийн огнооноос\)'/, 'Excel-ийн багана');
assert.doesNotMatch(src, /'Хугацаа хэтэрсэн'|overdueOf/, 'Excel/PDF-д хугацааны зарчим алга');
const dlg = readFileSync(new URL('../modules/ActionExport.tsx', import.meta.url), 'utf8');
/* 2026-11-27 (хэрэглэгч): цонхны «3. Тойм» хэсгийг бүхэлд нь хасав — нийт тоо нь PDF-ийн «Нийт»-д үлдэнэ */
assert.doesNotMatch(dlg, /summarize|tr\('Тойм'\)/, 'цонхонд тойм алга');
/* «Багц» мөр: хязгаартай аккаунтын файлд «Бүх багц» гэж бичихгүй */
const sites = [{ site: 'Багц 2.1' }, { site: 'Багц 2' }, { site: 'Багц 2' }, { site: '' }];
assert.deepEqual(reportPkgs([], null, sites), [], 'хязгааргүй, сонголтгүй → бүх багц (хоосон)');
assert.deepEqual(reportPkgs(['Багц 1'], null, sites), ['Багц 1'], 'сонголт хэвээр');
assert.deepEqual(reportPkgs(['Багц 2.1'], ['БАГЦ2'], sites), ['Багц 2.1'], 'хязгаартай, сонголттой → сонголт');
assert.deepEqual(reportPkgs([], ['БАГЦ2'], sites), ['—', 'Багц 2', 'Багц 2.1'], 'хязгаартай, сонголтгүй → файлд орсон багцууд');
assert.match(dlg, /reportPkgs\(pkgs, scope, chosen\)/, 'цонх хүрээгээ дамжуулна');

console.log('✅ actionReport.ui.check: OK');
