/**
 * ХУВААРИЙН ЗАГВАРЫН ШАЛГУУР — цэвэр функц тул сүлжээгүй, шуурхай.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/plan.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ХОНОГИЙН КОНВЕНЦ. «10-01 → 10-01» нь 1 хоног (0 БИШ). Хэрэв хаа нэгтээ
 *      +1 мартагдвал бүх хугацаа нэг хоногоор богиносч, такт нь аажмаар
 *      хуримтлагдан хуваарийг бүхэлд нь гажуулна.
 *   2. ТАКТ ТАНИХ. Жигд хэмнэлийг «жигд бус» гэж уншвал засварлагч гурван
 *      тоогоор дахин үүсгэх боломжоо алдаж, дахин 24 нүд гараар бөглөнө.
 *   3. ҮҮСГЭЛТ ↔ ТАНИЛТ нь ЭРГЭХ ҮЙЛДЭЛ байх ёстой: үүсгэсэн хуваарийг
 *      буцааж таньж, ижил гурван тоо гарах ёстой. Эс бөгөөс засвар бүрд
 *      утга чимээгүй шилжинэ.
 *   4. ШАЛГАЛТ нь ЖИНХЭНЭ алдааг барих, хэвийн зүйлд дуугарахгүй байх.
 */
import assert from 'node:assert/strict';
import {
  DAY, spanDays, endOf, rhythmOf, applyRhythm, validate, coverageOf, MAX_DAYS,
} from './plan.ts';

const d = (iso) => Date.parse(`${iso}T00:00:00Z`);
const span = (a, b) => ({ start: d(a), end: d(b) });
const row = (i, spans, extra = {}) => ({
  i, oid: 100 + i, no: String(i), work: `ажил ${i}`, depth: 5, group: false, spans, ...extra,
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

/* ── 2. Такт таних ── */
assert.equal(rhythmOf([]).kind, 'none');
assert.equal(rhythmOf([null, null]).kind, 'none');

/* Амьд жишээ: Багц 4-2·9F «Талбайн түр хашаа» — 7 хоногийн алхам */
const live = [
  span('2025-10-01', '2026-04-18'),
  span('2025-10-08', '2026-04-25'),
  span('2025-10-15', '2026-05-02'),
  span('2025-10-22', '2026-05-09'),
];
const r1 = rhythmOf(live);
assert.equal(r1.kind, 'even', 'амьд хэмнэл жигд танигдах ёстой');
assert.equal(r1.takt, 7, 'алхам 7 хоног');
assert.equal(r1.days, spanDays(live[0]));
assert.equal(r1.blocks, 4);

/* Бүх блок зэрэг эхэлбэл такт = 0 */
const same = [span('2026-03-02', '2026-03-15'), span('2026-03-02', '2026-03-15')];
assert.equal(rhythmOf(same).takt, 0, 'зэрэг эхлэх нь такт 0');

/* Урт нь зөрвөл — жигд бус, шалтгаан нь `days` */
const badDays = [span('2026-03-02', '2026-03-15'), span('2026-03-09', '2026-03-30')];
assert.equal(rhythmOf(badDays).kind, 'irregular');
assert.equal(rhythmOf(badDays).why, 'days');

/* Алхам нь зөрвөл — шалтгаан нь `takt` */
const badTakt = [span('2026-03-02', '2026-03-15'), span('2026-03-09', '2026-03-22'), span('2026-03-30', '2026-04-12')];
assert.equal(rhythmOf(badTakt).kind, 'irregular');
assert.equal(rhythmOf(badTakt).why, 'takt');

/* Дунд нь хоосон блок — үлдсэн нь жигд бол ЖИГД гэж үзнэ */
const gap = [span('2026-03-02', '2026-03-15'), null, span('2026-03-16', '2026-03-29')];
assert.equal(rhythmOf(gap).kind, 'even', 'хоосон блок хэмнэлийг эвдэхгүй');
assert.equal(rhythmOf(gap).takt, 14);

/* ── 3. Үүсгэлт ↔ танилт эргэнэ ── */
for (const [n, days, takt] of [[12, 14, 7], [22, 5, 3], [4, 30, 0], [8, 1, 1]]) {
  const gen = applyRhythm(n, d('2026-03-02'), days, takt);
  assert.equal(gen.filter(Boolean).length, n, 'бүх блок үүсэх ёстой');
  const back = rhythmOf(gen);
  assert.equal(back.kind, 'even', `${n}/${days}/${takt} жигд байх ёстой`);
  assert.equal(back.days, days, 'хоног эргэх');
  assert.equal(back.takt, takt, 'алхам эргэх');
  assert.equal(back.first, d('2026-03-02'), 'эхлэл эргэх');
}

/* `only` — сонгосон блокуудын ДАРААЛЛААР алхам, индексээр БИШ */
const only = applyRhythm(8, d('2026-03-02'), 10, 7, [0, 4]);
assert.equal(only.filter(Boolean).length, 2);
assert.equal(only[0].start, d('2026-03-02'));
assert.equal(only[4].start, d('2026-03-09'), 'сонгосон 2 дахь блок +7 хоног (28 БИШ)');
assert.equal(only[1], null, 'сонгоогүй блок хөндөгдөхгүй');

/* Хүрээнээс гарсан индексийг чимээгүй хаяна — унахгүй */
assert.equal(applyRhythm(3, d('2026-03-02'), 5, 1, [0, 9]).filter(Boolean).length, 1);

/* ── 4. Шалгалт ── */
/* Хэвийн хуваарь — дуугарах ёсгүй */
const ok = [row(0, applyRhythm(4, d('2026-03-02'), 14, 7))];
assert.equal(validate(ok).length, 0, 'хэвийн хуваарьт асуудал байх ёсгүй');

/* Хуваарьгүй мөр — асуудал БИШ (хийгдээгүй ажил) */
assert.equal(validate([row(0, [null, null, null, null])]).length, 0);

/* Урвуу муж — ЖИНХЭНЭ алдаа */
const rev = validate([row(0, [span('2026-03-15', '2026-03-02'), null, null, null])]);
assert.ok(rev.some((x) => x.kind === 'reversed' && x.level === 'error'), 'урвуу мужийг барих');

/* Хэт урт — амьд өгөгдлийн «Түр хашаа 6.5 сар» */
const long = validate([row(0, applyRhythm(4, d('2025-10-01'), 200, 7))]);
assert.ok(long.some((x) => x.kind === 'tooLong'), `${MAX_DAYS}-аас урт ажлыг тэмдэглэх`);

/* Хагас бөглөлт */
const part = validate([row(0, [span('2026-03-02', '2026-03-15'), null, null, null])]);
assert.ok(part.some((x) => x.kind === 'partial' && x.detail === '1/4'));

/* Ижил хуваарьтай хоёр ажил — АНХААРУУЛГА БИШ (хэвийн), харин ХЭВ ШИНЖ */
const s4 = applyRhythm(4, d('2026-03-02'), 14, 7);
assert.equal(validate([row(0, s4), row(1, s4.slice())]).filter((x) => x.kind === 'twin').length, 0,
  'ижил хуваарь нь анхааруулга биш');
assert.equal(coverageOf([row(0, s4), row(1, s4.slice())]).patterns, 1, 'ижил хуваарь = 1 хэв шинж');

/* Бүлгийн мужаас хальсан хүүхэд */
const grp = [
  row(0, [span('2026-03-01', '2026-03-31'), null, null, null], { group: true, depth: 4 }),
  row(1, [span('2026-02-20', '2026-03-10'), null, null, null], { depth: 5 }),
];
assert.ok(validate(grp).some((x) => x.kind === 'outsideParent' && x.row === 1), 'бүлгийн мужаас халихыг барих');

/* Бүлгийн дотор багтсан хүүхэд — дуугарахгүй */
const grpOk = [
  row(0, [span('2026-03-01', '2026-03-31'), null, null, null], { group: true, depth: 4 }),
  row(1, [span('2026-03-05', '2026-03-20'), null, null, null], { depth: 5 }),
];
assert.equal(validate(grpOk).filter((x) => x.kind === 'outsideParent').length, 0);

/* ── 5. Хамралт ── */
const cov = coverageOf([
  row(0, applyRhythm(4, d('2026-03-02'), 14, 7)),
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

console.log(`plan.check: ok — хоног ✓ такт ✓ эргэх үйлдэл ✓ шалгалт ${MAX_DAYS} хоног ✓ хамралт ✓`);

/* ── 6. ЭЦГИЙН МУЖ · ДЭЛГЭЛТ · ТӨЛӨВ (2026-08-28) ── */
{
  const { parentSpan, inside, spread, statusOf } = await import('./plan.ts');

  /* Эцэг → хүүхэд: гүн нь БАГА эхний БҮЛГИЙГ олно */
  const tree = [
    row(0, [span('2026-03-01', '2026-03-31')], { group: true, depth: 3 }),
    row(1, [span('2026-03-05', '2026-03-10')], { depth: 4, group: true }),
    row(2, [span('2026-03-06', '2026-03-08')], { depth: 5 }),
  ];
  assert.equal(parentSpan(tree, 2, 0).start, d('2026-03-05'), 'ХАМГИЙН ОЙРЫН эцгийг олно');
  assert.equal(parentSpan(tree, 1, 0).start, d('2026-03-01'));
  assert.equal(parentSpan(tree, 0, 0), null, 'үндэс мөрд эцэг байхгүй');

  /* Эцэг нь бүлэг БИШ бол хязгаар байхгүй */
  const flat = [row(0, [span('2026-03-01', '2026-03-31')], { depth: 4 }), row(1, [null], { depth: 5 })];
  assert.equal(parentSpan(flat, 1, 0), null, 'бүлэг бус мөр хязгаар болохгүй');

  assert.ok(inside(span('2026-03-05', '2026-03-10'), span('2026-03-01', '2026-03-31')));
  assert.ok(!inside(span('2026-02-28', '2026-03-10'), span('2026-03-01', '2026-03-31')));
  assert.ok(!inside(span('2026-03-05', '2026-04-01'), span('2026-03-01', '2026-03-31')));

  /* ДЭЛГЭЛТ — цоорхойгүй, давхцалгүй, эцгийн ЗАХААС ЗАХ */
  const par = span('2026-03-01', '2026-03-31');            // 31 хоног
  for (const cnt of [1, 2, 3, 4, 5, 7, 31]) {
    const parts = spread(par, cnt);
    assert.equal(parts.length, cnt, `${cnt} хэсэг`);
    assert.equal(parts[0].start, par.start, 'эхнийх нь эцгийн эхлэлээс');
    assert.equal(parts[cnt - 1].end, par.end, `${cnt}: сүүлчийнх нь эцгийн төгсгөлд яг таарна`);
    for (let k = 1; k < cnt; k++) {
      assert.equal(parts[k].start, parts[k - 1].end + DAY, 'цоорхой ч, давхцал ч байхгүй');
    }
    assert.equal(parts.reduce((a, x) => a + spanDays(x), 0), spanDays(par), 'нийт хоног хадгалагдана');
  }
  /* Цонхноос ОЛОН ажил — багадаа 1 хоног, эцгээс халина (шалгуур хэлнэ) */
  const tight = spread(span('2026-03-01', '2026-03-03'), 5);
  assert.equal(tight.length, 5);
  assert.ok(tight.every((x) => spanDays(x) >= 1), 'хоногийн доод хязгаар 1');

  /* ТӨЛӨВ — «хэмжигдээгүй» ба «эхлээгүй» хоёр ӨӨР */
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

console.log('plan.check: ok — эцгийн муж ✓ дэлгэлт ✓ төлөв ✓');
