/**
 * ХУВААРИЙН ЗАГВАРЫН ШАЛГУУР — цэвэр функц тул сүлжээгүй, шуурхай.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/plan.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ХОНОГИЙН КОНВЕНЦ. «10-01 → 10-01» нь 1 хоног (0 БИШ). Хэрэв хаа нэгтээ
 *      +1 мартагдвал бүх хугацаа нэг хоногоор богиносч, зурвасны урт, popup-ын
 *      «хоног» талбар, такт тархаалт гурвуулаа чимээгүй гажина.
 *   2. ТӨЛӨВ. «Хэмжигдээгүй» (`none`) ба «эхлээгүй» (`todo`) хоёрыг НЭГТГЭВЭЛ
 *      бөглөгдөөгүй багц бүхэлдээ «эхлээгүй» гэж уншигдана; хэмжилтгүй мөрийг
 *      «хоцорсон» гэвэл хуваарь улаанаар дүүрнэ.
 *   3. ХАМРАЛТ. Шүүлтийн «Хуваарьтай / Хуваарьгүй / Дутуу» табуудын тоо ЭНДЭЭС
 *      гардаг тул бүлгийн мөр ажилд тооцогдвол тоо худал өснө.
 *
 * ⚠️ 2026-09-06: такт (`rhythmOf`/`applyRhythm`), эцгийн муж (`parentSpan`/
 *    `inside`/`spread`), шалгалт (`validate`/`MAX_DAYS`) гурвын тест
 *    ХАСАГДСАН — тэдгээр функц өөрсдөө дуудагчаа алдаж устсан (`plan.ts`-ийн
 *    толгойг үзнэ үү). Фикстур угсрахад `applyRhythm` хэрэглэдэг байсныг
 *    шууд бичсэн мужаар сольсон.
 */
import assert from 'node:assert/strict';
import { DAY, spanDays, endOf, statusOf, coverageOf } from './plan.ts';

const d = (iso) => Date.parse(`${iso}T00:00:00Z`);
const span = (a, b) => ({ start: d(a), end: d(b) });
const row = (i, spans, extra = {}) => ({
  i, oid: 100 + i, no: String(i), work: `ажил ${i}`, depth: 5, group: false, spans, ...extra,
});
/** Такт хэлбэрийн мөр — эхлэлээс `takt` хоногийн алхмаар `n` блок */
const taktSpans = (n, first, days, takt) =>
  Array.from({ length: n }, (_, k) => {
    const s = first + k * takt * DAY;
    return { start: s, end: endOf(s, days) };
  });

/* ── 1. Хоногийн конвенц ── */
assert.equal(spanDays(span('2025-10-01', '2025-10-01')), 1, 'нэг өдрийн ажил = 1 хоног');
assert.equal(spanDays(span('2025-10-01', '2025-10-02')), 2);
assert.equal(spanDays(span('2025-08-05', '2025-09-02')), 29, 'амьд өгөгдлийн муж');
assert.equal(endOf(d('2025-10-01'), 1), d('2025-10-01'), 'нэг хоног → тэр өдөртөө дуусна');
assert.equal(endOf(d('2025-10-01'), 14), d('2025-10-14'));
/* Эргэх үйлдэл */
for (const n of [1, 2, 7, 14, 29, 200]) {
  assert.equal(spanDays({ start: d('2026-01-05'), end: endOf(d('2026-01-05'), n) }), n, `${n} хоног эргэх`);
}
/* Амьд жишээ: Багц 4-2·9F «Талбайн түр хашаа» — 7 хоногийн алхам */
const live = taktSpans(4, d('2025-10-01'), spanDays(span('2025-10-01', '2026-04-18')), 7);
assert.equal(live[1].start, d('2025-10-08'), 'алхам 7 хоног');
assert.equal(live[3].end, d('2026-05-09'), 'дөрөв дэх блок +21 хоног');

/* ── 2. ТӨЛӨВ — «хэмжигдээгүй» ба «эхлээгүй» хоёр ӨӨР ── */
{
  const now = d('2026-06-01');
  const past = span('2026-05-01', '2026-05-10');
  const soon = span('2026-07-01', '2026-07-10');
  assert.equal(statusOf(past, null, now), 'none', 'хэмжилтгүй нь «хоцорсон» БИШ');
  assert.equal(statusOf(past, 0, now), 'late');
  assert.equal(statusOf(past, 1, now), 'done');
  assert.equal(statusOf(past, 0.5, now), 'late', 'хугацаа өнгөрсөн ч дуусаагүй');
  assert.equal(statusOf(soon, 0, now), 'todo');
  assert.equal(statusOf(soon, 0.4, now), 'run');
  assert.equal(statusOf(soon, undefined, now), 'none');
}

/* ── 3. Хамралт ── */
const s4 = taktSpans(4, d('2026-03-02'), 14, 7);
assert.equal(
  coverageOf([row(0, s4), row(1, s4.slice())]).patterns, 1,
  'ижил хуваарь = 1 хэв шинж',
);
const cov = coverageOf([
  row(0, s4),
  row(1, [span('2026-04-01', '2026-04-10'), null, null, null]),
  row(2, [null, null, null, null]),
  row(3, [null, null, null, null], { group: true, depth: 4 }),
]);
assert.equal(cov.tasks, 3, 'бүлэг ажилд тооцогдохгүй');
assert.equal(cov.planned, 2);
assert.equal(cov.cells, 12);
assert.equal(cov.filled, 5);
assert.equal(cov.from, d('2026-03-02'));
assert.equal(cov.to, d('2026-04-10'));

/* Хоосон олонлог — унахгүй */
const c0 = coverageOf([]);
assert.equal(c0.tasks, 0);
assert.equal(c0.from, null);

console.log('plan.check: ok — хоног ✓ төлөв ✓ хамралт ✓');
