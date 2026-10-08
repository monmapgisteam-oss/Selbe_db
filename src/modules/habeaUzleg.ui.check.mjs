/**
 * ХАБЭА ҮЗЛЭГ — ТОКЕНЫ ЗАМ (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/habeaUzleg.ui.check.mjs
 *
 * Хамгаалж буй алдаа:
 *  1. Үзлэгийн мөр/хавсралтын хүсэлт `getAuth()`-ын ИЛ токеныг дамжуулдаг байв →
 *     `query.run` ('org' горим) тэр токеныг эрхэмлэж, таб унтсаны дараах хугацаа
 *     дууссан токеноор 498 авахад шинэчлээд дахин оролдохгүй «Invalid token».
 *  2. Зургийн хаягт (`<img src>`) ачаалах агшны токен «шатаж» үлддэг байв —
 *     токен шинэчлэгдсэний дараа слайдер эвдэрнэ.
 *  3. Ослын слайдер (`Habea.tsx` `PhotoWall`) мөн адил.
 *  ⚠️ 2026-10-09: `photoSrc` (`?token=` залгадаг) УСТГАГДСАН — зураг `AttPhoto`-оор blob URL
 *     (POST биеэр татна, токен URL-д огт орохгүй — CWE-598).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { uzWeekKey, weekLabel, weekScoreOf, prevWeek } = await import('./habeaUzleg.tsx');

/* 1–2. Зураг blob URL-аар — токентой хаяг угсрахгүй */
/* 3. Эх кодын хамгаалалт — ил токен ба ачаалах агшны токен буцаж орохгүй */
const uz = readFileSync(new URL('./habeaUzleg.tsx', import.meta.url), 'utf8');
assert.ok(!/token:\s*auth\.token\s*[,}]/.test(uz),'habeaUzleg: getAuth()-ын токеныг хүсэлтэд илгээхгүй');
assert.ok(!/\?token=\$\{encodeURIComponent\(auth\.token\)\}/.test(uz), 'habeaUzleg: зургийн хаягт ачаалах агшны токен');
const habea = readFileSync(new URL('./Habea.tsx', import.meta.url), 'utf8');
const wall = habea.slice(habea.indexOf('function PhotoWall'), habea.indexOf('function pickRows'));
assert.ok(wall.length > 100, 'PhotoWall олдсон');
assert.ok(!wall.includes('tokenQs()'), 'PhotoWall: токеныг ачаалагчид биш рендерт залгана');
assert.ok(wall.includes('<AttPhoto url={p.src}'), 'PhotoWall: blob URL (AttPhoto)');
{
  const inc = habea.slice(habea.indexOf('function IncPhotos'), habea.indexOf('function PhotoWall'));
  assert.ok(inc.includes('<AttPhoto') && !inc.includes('tokenQs'), 'IncPhotos: blob URL (AttPhoto)');
  assert.ok(uz.includes('<AttPhoto url={p.src}'), 'Үзлэгийн слайдер: blob URL (AttPhoto)');
  assert.ok(!/export const photoSrc/.test(uz), 'photoSrc буцаж орохгүй');
  assert.ok(uz.includes('URL.revokeObjectURL(obj)'), 'blob URL revoke хийгдэнэ');
}

/* ══════════ 4. ДОЛОО ХОНОГИЙН KPI — чарттай НЭГ эх (2026-10-01) ══════════ */
/* ⚠️ KPI нь урьд ОГНООНЫ хилээр, чарт нь `week` кодоор бүлэглэдэг тул нэг долоо хоног
   хоёр өөр оноотой гардаг байв. 2026-10-09: хоёулаа ОГНООНООС (ISO, Улаанбаатар) —
   огноогүй мөрөнд л маягтын `week` код (нөөц). */
assert.equal(uzWeekKey(Date.parse('2026-09-14T00:30:00+08:00')), '2026-W38', 'Даваа 00:30 UB — UTC-ээр Ням ч 38');
assert.equal(uzWeekKey(Date.parse('2026-09-13T23:59:00+08:00')), '2026-W37', 'Ням — 37');
assert.equal(uzWeekKey(Date.parse('2027-01-01T12:00:00+08:00')), '2026-W53', 'ISO жил: 2027-01-01 нь 2026-W53');
assert.equal(weekLabel('2026-W38'), weekLabel('38'), 'шошго жилгүй ижил');
/* ⚠️ 2026-10-09: он дамжих үед жилтэй шошго; жилгүй түлхүүрт он нэмэгдэхгүй */
assert.notEqual(weekLabel('2026-W52', true), weekLabel('2027-W52', true), 'жилтэй шошго ялгагдана');
assert.equal(weekLabel('52', true), weekLabel('52'), 'жилгүй түлхүүр — жилгүй шошго');
{
  const rows = [
    { pkgK: 'A', coSfx: 'MK', e: 80, a: 100, n: 3, ns: 2, nc: 1 },
    { pkgK: 'B', coSfx: 'P', e: 10, a: 20, n: 1, ns: 1, nc: 0 },
  ];
  const all = weekScoreOf(rows, [], []);
  assert.equal(all.pct, (90 / 120) * 100, 'жигнэсэн: Σавсан/Σболомжит');
  assert.equal(all.ns, 3, 'түүврийн хэмжээ = оноотой үзлэг');
  assert.equal(all.n, 4);
  assert.equal(weekScoreOf(rows, ['B'], []).ns, 1, 'багцын шүүлтийг дагана');
  assert.equal(weekScoreOf([], [], []).pct, null, 'оноогүй — null (0% БИШ)');
}
/* Даваа гарагаас шинэ долоо хоног — өмнөх БҮТЭН долоо хоног солигдоно.
   ⚠️ 2026-10-09: Улаанбаатарын цагаар (хөтчийн бүсээс үл хамаарна) — агшныг +08:00-оор өгнө */
{
  const sun = prevWeek(new Date(Date.parse('2026-09-27T23:00:00+08:00')));   // Ням
  const mon = prevWeek(new Date(Date.parse('2026-09-28T00:30:00+08:00')));   // Даваа (UTC-ээр Ням)
  assert.equal(mon.no, sun.no + 1, 'Даваа гараг дамжихад KPI-ийн долоо хоног шилжинэ');
  assert.equal(mon.no, 39, 'UB Даваа 00:30 — өмнөх долоо хоног 39');
  assert.equal(mon.end.toISOString(), '2026-09-27T16:00:00.000Z', 'хил = UB Даваа 00:00');
  assert.equal(mon.start.toISOString(), '2026-09-20T16:00:00.000Z');
  const ny = prevWeek(new Date(Date.parse('2027-01-05T09:00:00+08:00')));
  assert.equal(ny.no, 53, 'он дамжих: 2026-12-28 эхэлсэн долоо хоног 2026-W53');
}
{
  const fetchSrc = uz.slice(uz.indexOf('async function fetchWeekScores'), uz.indexOf('/** Хуудасны шүүлтээр нүднүүдийг'));
  assert.ok(fetchSrc.includes('${U.ognoo} < ${sqlTs(w.end)}'), 'KPI огнооны хилээр (ISO долоо хоног)');
  /* ⚠️ 2026-10-09: огноогүй мөр KPI-д ч, чартад ч ОРОХГҮЙ — нэг эх (`week` талбар хэрэглэхгүй) */
  assert.ok(!fetchSrc.includes('${U.week}'), 'огноогүй мөрийг `week` кодоор нөөцлөхгүй (чарттай зөрөхгүй)');
  assert.ok(/if \(metas\.some\(\(m\) => m\.failed\)\) throw/.test(fetchSrc), 'метадата унавал шиднэ (буруу дүн кэшлэхгүй)');
  assert.ok(fetchSrc.includes('${U.scAppl} > 0'), 'онооны дүрэм: appl > 0 (byWeek-тэй ижил)');
  assert.ok(!fetchSrc.includes('isWeekNo('), 'хадгалсан долоо хоногийн дугаараар тааруулахгүй');
  assert.ok(habea.includes('[weekKey, tick]'), 'Habea: долоо хоног/таб харагдахад дахин татна');
}

/* ══════════ 4b. Зэрэг талбар бүрээр · огноогүй долоо хоног (2026-10-09) ══════════ */
assert.ok(uz.includes("const known = (f: string) => r[f] != null && r[f] !== ''"), 'sevHas: талбар бүрээр');
assert.ok(uz.includes('x.sevHas[k] ? s + x[k] : s'), 'severity: зэрэг бүр өөрийн тугаар');
assert.ok(uz.includes("week: d > 0 ? uzWeekKey(d) : ''"), 'огноогүй мөр долоо хоноггүй');
assert.ok(uz.includes("tr('Заалтын тоо мэдэгдэхгүй')") && uz.includes("tr('({0} үзлэг тоогүй)'"), 'тоогүй үзлэг ил');
assert.ok(/UZ_OPTIONAL[^;]*U\.week, U\.shift/s.test(uz), 'week/shift — заавал биш');

/* ══════════ 5. Зургийн хэсэгчилсэн уналт ил (2026-10-01) ══════════ */
assert.ok(wall.includes("tr('{0} бүртгэлийн зураг татагдсангүй'"), 'PhotoWall: N бүртгэлийн зураг татагдсангүй');
assert.ok(uz.includes("tr('{0} үзлэгийн зураг татагдсангүй'"), 'Үзлэгийн слайдер: N үзлэгийн зураг татагдсангүй');

/* ══════════ 6. Онооны өнгө — шошготой НЭГ дүгнэлт, LEVEL_TONE (2026-10-09) ══════════ */
{
  const { scoreColor, uzScoreLevel, UZLEG_SCORE_GOOD, inSel } = await import('./habeaUzleg.tsx');
  const { LEVEL_TONE, SCORE_GOOD } = await import('../lib/kpiLevels.ts');
  assert.equal(UZLEG_SCORE_GOOD, 90);
  assert.notEqual(UZLEG_SCORE_GOOD, SCORE_GOOD, 'kpiLevels.SCORE_GOOD (65)-тай ялгаатай нэр');
  assert.equal(uzScoreLevel(89.6), 'good', '«90%» гэж бичигдэх утга ногоон');
  assert.equal(uzScoreLevel(89.4), 'warn');
  assert.equal(uzScoreLevel(69.5), 'warn');
  assert.equal(uzScoreLevel(69.4), 'bad');
  assert.equal(scoreColor(95), LEVEL_TONE.good);
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(scoreColor(50)), 'hex биш — CSS хувьсагч');
  /* inSel — хоосон = бүгд, урт жагсаалт Set-ээр */
  const days = Array.from({ length: 400 }, (_, i) => `d${i}`);
  assert.ok(inSel([], 'x'));
  assert.ok(inSel(days, 'd399') && !inSel(days, 'x'));
  assert.ok(inSel(['a', 'b'], 'b') && !inSel(['a'], 'b'));
  assert.ok(!/uz\.day\.includes\(/.test(uz), 'uzPass: өдрийн гишүүнчлэл Set-ээр (inSet)');
}
/* ══════════ 7. Огнооны муж ба капсул (Habea, 2026-10-09) ══════════ */
assert.ok(habea.includes('from={pill.from}') && habea.includes('to={pill.to}'), 'капсул sel.day-ээс (массивын лавлагаа биш)');
assert.ok(habea.includes('s.day === rangeKeysRef.current) return { ...s, day: [v] }'), 'муж идэвхтэй үед өдөр дарвал сонголтыг орлуулна');
assert.ok(!habea.includes('onSaved={() => regs.retry'), 'бүртгэл хадгалсны дараа давхар татахгүй');

console.log('habeaUzleg.ui.check: OK');
