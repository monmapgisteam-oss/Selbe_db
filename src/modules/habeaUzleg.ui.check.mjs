/**
 * ХАБЭА ҮЗЛЭГ — ТОКЕНЫ ЗАМ (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/habeaUzleg.ui.check.mjs
 *
 * Хамгаалж буй алдаа:
 *  1. Үзлэгийн мөр/хавсралтын хүсэлт `getAuth()`-ын ИЛ токеныг дамжуулдаг байв →
 *     `query.run` ('org' горим) тэр токеныг эрхэмлэж, таб унтсаны дараах хугацаа
 *     дууссан токеноор 498 авахад шинэчлээд дахин оролдохгүй «Invalid token».
 *  2. Зургийн хаягт (`<img src>`) ачаалах агшны токен «шатаж» үлддэг байв —
 *     токен шинэчлэгдсэний дараа слайдер эвдэрнэ. Одоо рендерт `photoSrc` залгана.
 *  3. Ослын слайдер (`Habea.tsx` `PhotoWall`) мөн адил.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerIdentity } from '../lib/authToken.ts';

const { photoSrc, weekCodes, uzWeekKey, weekLabel, weekScoreOf, prevWeek } = await import('./habeaUzleg.tsx');

/* 1. Нэвтрээгүй (identity бүртгэгдээгүй) — токенгүй хаяг, «?» үлдэхгүй */
assert.equal(photoSrc('https://x/FeatureServer/0/5/attachments/7'), 'https://x/FeatureServer/0/5/attachments/7');

/* 2. Токен РЕНДЕР бүрд шинээр уншигдана — шинэчлэгдсэн токен дараагийн зурагт орно */
let tok = 'T1';
registerIdentity({ findCredential: () => ({ token: tok }) }, 'https://portal/sharing');
assert.equal(photoSrc('u'), 'u?token=T1');
tok = 'T2 /+';
assert.equal(photoSrc('u'), `u?token=${encodeURIComponent('T2 /+')}`);

/* 3. Эх кодын хамгаалалт — ил токен ба ачаалах агшны токен буцаж орохгүй */
const uz = readFileSync(new URL('./habeaUzleg.tsx', import.meta.url), 'utf8');
assert.ok(!/token:\s*auth\.token\s*[,}]/.test(uz),'habeaUzleg: getAuth()-ын токеныг хүсэлтэд илгээхгүй');
assert.ok(!/\?token=\$\{encodeURIComponent\(auth\.token\)\}/.test(uz), 'habeaUzleg: зургийн хаягт ачаалах агшны токен');
const habea = readFileSync(new URL('./Habea.tsx', import.meta.url), 'utf8');
const wall = habea.slice(habea.indexOf('function PhotoWall'), habea.indexOf('function pickRows'));
assert.ok(wall.length > 100, 'PhotoWall олдсон');
assert.ok(!wall.includes('tokenQs()'), 'PhotoWall: токеныг ачаалагчид биш рендерт залгана');
assert.ok(wall.includes('photoSrc(p.src)'));

/* ══════════ 4. ДОЛОО ХОНОГИЙН KPI — чарттай НЭГ эх (2026-10-01) ══════════ */
/* ⚠️ KPI нь урьд ОГНООНЫ хилээр, чарт нь `week` кодоор бүлэглэдэг тул нэг долоо хоног
   хоёр өөр оноотой гардаг байв. 2026-10-09: хоёулаа ОГНООНООС (ISO, Улаанбаатар) —
   огноогүй мөрөнд л маягтын `week` код (нөөц). */
assert.equal(uzWeekKey(Date.parse('2026-09-14T00:30:00+08:00')), '2026-W38', 'Даваа 00:30 UB — UTC-ээр Ням ч 38');
assert.equal(uzWeekKey(Date.parse('2026-09-13T23:59:00+08:00')), '2026-W37', 'Ням — 37');
assert.equal(uzWeekKey(Date.parse('2027-01-01T12:00:00+08:00')), '2026-W53', 'ISO жил: 2027-01-01 нь 2026-W53');
assert.equal(weekLabel('2026-W38'), weekLabel('38'), 'шошго жилгүй ижил');
assert.deepEqual(weekCodes(7), ['7', '07', 'w7', 'W7']);
assert.deepEqual(weekCodes(37), ['37', 'w37', 'W37']);
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
/* Даваа гарагаас шинэ долоо хоног — өмнөх БҮТЭН долоо хоног солигдоно */
{
  const sun = prevWeek(new Date(2026, 8, 27, 23, 0));   // Ням
  const mon = prevWeek(new Date(2026, 8, 28, 0, 30));   // Даваа
  assert.equal(mon.no, sun.no + 1, 'Даваа гараг дамжихад KPI-ийн долоо хоног шилжинэ');
}
{
  const fetchSrc = uz.slice(uz.indexOf('async function fetchWeekScores'), uz.indexOf('/** Хуудасны шүүлтээр нүднүүдийг'));
  assert.ok(fetchSrc.includes('${U.ognoo} < ${sqlTs(w.end)}'), 'KPI огнооны хилээр (ISO долоо хоног)');
  assert.ok(fetchSrc.includes('${U.ognoo} IS NULL AND ${U.week} IN'), 'огноогүй мөр л `week` кодоор');
  assert.ok(fetchSrc.includes('${U.scAppl} > 0'), 'онооны дүрэм: appl > 0 (byWeek-тэй ижил)');
  assert.ok(!fetchSrc.includes('isWeekNo('), 'хадгалсан долоо хоногийн дугаараар тааруулахгүй');
  assert.ok(habea.includes('[weekKey, tick]'), 'Habea: долоо хоног/таб харагдахад дахин татна');
}

/* ══════════ 5. Зургийн хэсэгчилсэн уналт ил (2026-10-01) ══════════ */
assert.ok(wall.includes("tr('{0} бүртгэлийн зураг татагдсангүй'"), 'PhotoWall: N бүртгэлийн зураг татагдсангүй');
assert.ok(uz.includes("tr('{0} үзлэгийн зураг татагдсангүй'"), 'Үзлэгийн слайдер: N үзлэгийн зураг татагдсангүй');

console.log('habeaUzleg.ui.check: OK');
