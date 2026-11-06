/**
 * ХАБЭА ҮЗЛЭГ — ТОКЕНЫ ЗАМ (2026-09-30).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/modules/habeaUzleg.ui.check.mjs
 *
 * Хамгаалж буй алдаа:
 *  1. Үзлэгийн мөр/хавсралтын хүсэлт `getAuth`-ын ИЛ токеныг дамжуулдаг байв →
 *     `query.run` ('org' горим) тэр токеныг эрхэмлэж, таб унтсаны дараах хугацаа
 *     дууссан токеноор 498 авахад шинэчлээд дахин оролдохгүй «Invalid token».
 *  2. Зургийн хаягт (`<img src>`) ачаалах агшны токен «шатаж» үлддэг байв —
 *     токен шинэчлэгдсэний дараа слайдер эвдэрнэ.
 *  3. Ослын слайдер (`Habea.tsx` `PhotoWall`) мөн адил.
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
assert.equal(uzWeekKey(Date.parse('2026-09-14T00:30:00+08:00')), '2026-W38', 'Даваа 00:30 UB — UTC-ээр Ням ч 38');
assert.equal(uzWeekKey(Date.parse('2026-09-13T23:59:00+08:00')), '2026-W37', 'Ням — 37');
assert.equal(uzWeekKey(Date.parse('2027-01-01T12:00:00+08:00')), '2026-W53', 'ISO жил: 2027-01-01 нь 2026-W53');
assert.equal(weekLabel('2026-W38'), weekLabel('38'), 'шошго жилгүй ижил');
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
/* Даваа гарагаас шинэ долоо хоног — өмнөх БҮТЭН долоо хоног солигдоно. */
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
  assert.ok(!fetchSrc.includes('${U.week}'), 'огноогүй мөрийг `week` кодоор нөөцлөхгүй (чарттай зөрөхгүй)');
  assert.ok(/if \(metas\.some\(\(m\) => m\.failed\)\) throw/.test(fetchSrc), 'метадата унавал шиднэ (буруу дүн кэшлэхгүй)');
  assert.ok(fetchSrc.includes('${U.scAppl} > 0'), 'онооны дүрэм: appl > 0 (byWeek-тэй ижил)');
  assert.ok(!fetchSrc.includes('isWeekNo('), 'хадгалсан долоо хоногийн дугаараар тааруулахгүй');
  assert.ok(habea.includes('[weekKey, tick]'), 'Habea: долоо хоног/таб харагдахад дахин татна');
}

/* ══════════ 4b. Зэрэг талбар бүрээр · огноогүй долоо хоног (2026-10-09) ══════════ */
assert.ok(uz.includes("const known = (f: string) => !badCnt && r[f] != null && r[f] !== ''"), 'sevHas: талбар бүрээр');
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

/* ══════════ 8. Үл нийцлийн арилгалт (HSE_Action) — `tick`-ээр шинэчлэгдэнэ (2026-10-26) ══════════ */
{
  const act = readFileSync(new URL('./HabeaAction.tsx', import.meta.url), 'utf8');
  assert.ok(act.includes('useAsync(() => loadActions(), [tick], { keepOn: [tick] })'), 'HseActionPanel tick-ээр дахин татна');
  for (const part of ['left', 'right', 'fin']) {
    assert.ok(habea.includes(`<HseActionPanel part="${part}" pkgs={pkgs} cos={cos} days={sel.day} months={sel.month} onPkg={togglePkg} sel={actSel} onSel={toggleAct} now={now} tick={tick} pickOid={pickActOid} scope={habScope} />`), `Habea tick ба сар дамжуулна (${part})`);
  }
  assert.ok(act.includes("tr('Үл нийцэл — төлөвөөр')") && !act.includes("tr('Үл нийцэл — төрлөөр')"), 'донат нь төлөв харуулдаг — нэр нь «төлөвөөр»');
}

/* ══════════ 9. Аудит 2026-11-06 ══════════ */
{
  const { norm, uzValueLabel } = await import('./habeaUzleg.tsx');
  /* «Аюулыг илрүүлэх үзлэг» — амьд objectid 67: тугууд залгагдсан 1010/101, нийт 4 → чартад орохгүй, «тоогүй» гэж ил */
  const raw = { objectid: 67, site: 'b12', cnt_high: 1010, cnt_medium: 101, cnt_low: 0, cnt_fixed: 0, cnt_obs: 0, cnt_findings: 4 };
  const bad = norm(raw, {}, 'hazard');
  assert.deepEqual([bad.major, bad.minor, bad.obs, bad.conf, bad.na], [0, 0, 0, 0, 0], 'итгэмжгүй мөр нийлбэрт орохгүй');
  assert.equal(Object.values(bad.sevHas).some(Boolean), false, '«{0} үзлэг тоогүй»-д тоологдоно');
  const ok = norm({ ...raw, cnt_high: 2, cnt_medium: 2 }, {}, 'hazard');
  assert.deepEqual([ok.major, ok.minor], [2, 2], 'зөв мөр хэвээр');
  assert.equal(ok.sevHas.major, true);
  assert.equal(norm({ objectid: 1, cnt_major: 5000 }, {}, 'v11').major, 5000, 'нийтийн талбаргүй маягт хөндөгдөхгүй');
  /* Чипийн нэр — маягтын зэргийн нэрээр */
  assert.notEqual(uzValueLabel('sev', 'major', 'hazard'), uzValueLabel('sev', 'major', 'v11'), 'аюулын маягтын чип «Өндөр эрсдэлтэй»');
  assert.notEqual(uzValueLabel('sev', 'major', 'env'), uzValueLabel('sev', 'major'), 'байгаль орчин «Үл нийцэл»');
  assert.equal(uzValueLabel('sev', 'zzz'), 'zzz');
  assert.equal(uzValueLabel('day', '2026-01-01', 'hazard'), '2026-01-01');
  assert.ok(habea.includes('uzValueLabel(ud, x, uzlegKind ?? undefined)'), 'Habea: маягтын төрөл дамжуулна');

  /* Шинэчлэл: tick ба dataBus, хуучин мөр дэлгэцэд үлдэнэ */
  assert.ok(uz.includes('}, [kind, tries, tick, bus]);'), 'useUzleg шинэчлэлийг дагана');
  assert.ok(uz.includes("cur.kind === kind && cur.st.state === 'ready' ? cur :"), 'дахин таталтад мөр үлдэнэ');
  assert.ok(habea.includes('useUzleg(uzlegKind, tick)') && habea.includes('useUzleg(dual ? DUAL2 : null, tick)'), 'Habea tick дамжуулна');

  /* `_form` хаалттай аккаунт: зургийн жагсаалт эх үйлчилгээнээс */
  assert.ok(uz.includes("postFormOrSource<{ attachmentGroups?: typeof groups }>(url, '/queryAttachments'"), 'зургийн жагсаалт');

  /* Шинэчлэл унахад хуудас буухгүй — сүүлийн өгөгдөл + тайлбар */
  assert.ok(habea.includes("qRaw.state !== 'ready' && lastHabea"), 'сүүлийн амжилттай өгөгдөл үлдэнэ');
  assert.ok(habea.includes("tr('Шинэчилж чадсангүй — сүүлд татсан мэдээлэл харагдаж байна: {0}'"), 'тайлбар ил');

  /* KPI — шүүлтээс үл хамааран нэг эх (гүйцэтгэгчийн багана) + нэгж */
  assert.ok(!habea.includes('labor.cum') && !habea.includes('laborFiltered'), 'толгойн нийлбэр рүү салаалахгүй');
  assert.ok(habea.includes("tr('хүн-өдөр')") && habea.includes("tr('нэгж-өдөр')"), 'KPI-н нэгж');

  /* Товчлолгүй */
  assert.ok(!habea.includes("tr('Огноогүй ХЧТА") && !habea.includes("tr('{0} ХЧТА"), 'ХЧТА товчлол UI-д алга');

  /* Огнооны мужийн чип өдөр бүрийг жагсаахгүй */
  assert.ok(habea.includes("ud === 'day' && (rangeOn || v.length > DAY_CHIP_MAX)"), 'өдрийн чип');

  /* Бөглөсөн маягт Esc/ард дарахад шууд алга болохгүй */
  const ent = readFileSync(new URL('./HabeaEntry.tsx', import.meta.url), 'utf8');
  assert.ok(ent.includes('askConfirm(') && (ent.match(/dirty=\{/g) ?? []).length === 2, 'хоёр цонх dirty дамжуулна');
}

console.log('habeaUzleg.ui.check: OK');
