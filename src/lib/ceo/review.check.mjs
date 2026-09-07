/**
 * `ceo/review`-ийн ЦЭВЭР тооцоог шалгана — сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/review.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   · эх уншигдаагүй (`null`) ба хүлээгдэл ХООСОН (`[]`) хоёрыг нэгтгэх —
 *     эхнийх «—», хоёр дахь нь «0» байх ёстой;
 *   · нэг багцын 9/12 давхрын хоёр хуудас тусдаа мөр болох;
 *   · `pct: null` (цэвэрлэсэн нүд) огноог хаяж багцыг худал хуучруулах;
 *   · 300-аас дээш мөрийг чимээгүй таслах.
 */
import assert from 'node:assert/strict';
import {
  computeReview, fillAgeByPkg, fillAgeLevel, dayMs, FILL_STALE_DAYS,
} from './review.ts';

/* 2026-09-06 10:00 Улаанбаатар (UTC+8) */
const NOW = Date.parse('2026-09-06T02:00:00Z');

/** Хүлээгдлийн мөр угсрах туслах — `Pending`-ийн шаардлагатай талбарууд */
const pend = (ajil, bagts, owner, days, who, extra = {}) => ({
  work: {
    key: `${bagts}|${ajil}|К`,
    bagts, ajil, company: 'Компани ' + ajil,
    status: '', owner, cycles: [], current: {},
    engineerReturns: 0, managerReturns: 0, directorReturns: 0,
    ...extra,
  },
  days,
  who,
  assigned: who !== '',
});

/* ── 1. Хоёр эх амжилттай ── */
{
  const pending = [
    pend('Ажил А', 'Багц 1', 'engineer', 3, 'Инженер Д'),
    pend('Ажил Б', 'Багц 2', 'manager', 12, 'Менежер Б', { engineerReturns: 1, managerReturns: 2 }),
    pend('Ажил В', 'Багц 3.1', 'company', 0, ''),
  ];
  const fills = [
    { pkg: 'Багц 3.1', lastFill: '2026-09-04', ageDays: 2 },
    { pkg: 'Багц 1', lastFill: '2026-08-01', ageDays: 36 },
  ];
  const r = computeReview({ pending, fills, failedSources: [] });

  assert.equal(r.value, '12', 'хамгийн урт хүлээлт');
  assert.equal(r.level, 'bad', '12 хоног > 7 → улаан');
  assert.deepEqual(r.failedSources, []);
  assert.ok(r.facts.includes('1 ажил 7 хоногоос дээш'), r.facts);
  assert.ok(r.facts.includes('хүлээгдэж буй 3 ажил'), r.facts);
  assert.ok(r.facts.includes('шатаар: компани 1 · инженер 1 · менежер 1 · ЕМ 0'), r.facts);
  assert.ok(r.facts.includes('бөглөлт хамгийн хуучин 36 хоног (Багц 1)'), r.facts);

  assert.equal(r.tables.length, 2);
  const [t1, t2] = r.tables;
  assert.equal(t1.title, 'Хүлээгдэж буй ажил', 'байгаа i18n түлхүүр');
  assert.equal(t1.cols.length, 7);
  assert.deepEqual(t1.rows.map((row) => row[5].v), [12, 3, 0], 'хоног буурах эрэмбэ');
  assert.equal(t1.rows[0][6].v, 3, 'буцаалт = 1 + 2 + 0');
  assert.equal(t1.rows[0][3].v, 'Багцын менежер', 'шатны нэр STAGE_LABEL-ээс');
  assert.equal(t1.rows[2][4].v, 'дараалалд', 'хуваарилагдаагүй → дараалалд');
  assert.equal(t1.rows[0][5].kind, 'day');
  assert.equal(t2.cols.length, 3);
  assert.equal(t2.rows[0][0].v, 'Багц 1', 'хамгийн хуучин багц эхэнд');
  assert.equal(t2.rows[0][1].v, '2026-08-01');
  assert.equal(t2.rows[0][2].v, 36);

  assert.equal(r.issues.length, 2, 'нэг хоцорсон ажил + нэг хуучирсан багц');
  assert.equal(r.issues[0].text, 'Ажил Б · Багц 2 — Менежер Б дээр 12 хоног');
  assert.equal(r.issues[1].text, 'Багц 1 — сүүлд бөглөсөн 2026-08-01, 36 хоног');
  assert.ok(r.issues.every((i) => i.tone === 'bad'));

  assert.equal(r.asOf, Date.parse('2026-09-04T00:00:00Z'), 'asOf = хамгийн сүүлийн бөглөлт');
}

/* ── 2. Хяналт унасан, бөглөлт ирсэн ── */
{
  const r = computeReview({
    pending: null,
    fills: [{ pkg: 'Багц 2', lastFill: '2026-08-20', ageDays: 17 }],
    failedSources: ['Гүйцэтгэлийн хяналт'],
  });
  assert.equal(r.value, '—', 'хэмжигдээгүй → «—», 0 БИШ');
  assert.equal(r.level, 'warn', 'зөвхөн бөглөлтөөр: 17 хоног → шар');
  assert.equal(r.tables.length, 1);
  assert.equal(r.tables[0].title, 'Бөглөлтийн нас — багцаар');
  assert.deepEqual(r.failedSources, ['Гүйцэтгэлийн хяналт']);
  assert.equal(r.issues.length, 0);
  assert.ok(!r.facts.some((f) => f.includes('хүлээгдэж')), 'хүлээгдлийн баримт байхгүй');
}

/* ── 3. Хүлээгдэл ХООСОН (ачаалагдсан), бөглөлт унасан ── */
{
  const r = computeReview({ pending: [], fills: null, failedSources: ['Гүйцэтгэл бөглөх'] });
  assert.equal(r.value, '0', 'хэмжигдсэн тэг → «0»');
  assert.equal(r.level, 'good', 'good + unknown → good');
  assert.equal(r.asOf, null);
  assert.equal(r.tables.length, 1);
  assert.equal(r.tables[0].rows.length, 0);
  assert.ok(r.facts.includes('хүлээгдэж буй 0 ажил'));
}

/* ── 4. fillAgeByPkg — түлхүүрийн угтвар → багц, давхрын хувилбар нийлнэ ── */
{
  const h = new Map([
    ['БАГЦ1|5/1', [{ date: '2026-07-01', pct: 10 }, { date: '2026-08-10', pct: 20 }]],
    ['БАГЦ1|5/2', [{ date: '2026-09-01', pct: null }]],   // 12 давхрын хуудас, цэвэрлэсэн нүд
    ['БАГЦ31|3/1', [{ date: '2026-09-05', pct: 40 }]],
    ['БАГЦ41|1/1', [{ date: 'муу-огноо', pct: 1 }, { date: '2026-08-01', pct: 5 }]],
    ['ХХХ|9/9', [{ date: '2026-06-01', pct: 1 }]],         // танигдаагүй угтвар
  ]);
  const f = fillAgeByPkg(h, NOW);
  const by = Object.fromEntries(f.map((x) => [x.pkg, x]));
  assert.equal(by['Багц 1'].lastFill, '2026-09-01', 'null-pct цэг ч огноо');
  assert.equal(by['Багц 1'].ageDays, 5);
  assert.equal(by['Багц 3.1'].lastFill, '2026-09-05');
  assert.equal(by['Багц 3.1'].ageDays, 1);
  assert.equal(by['Багц 4-1'].lastFill, '2026-08-01', 'буруу огноо алгасагдана');
  assert.equal(by['ХХХ'].lastFill, '2026-06-01', 'танигдаагүй угтвар түүхийгээрээ үлдэнэ');
  assert.deepEqual(f.map((x) => x.pkg), ['ХХХ', 'Багц 4-1', 'Багц 1', 'Багц 3.1'], 'нас буурах');
}

/* ── 5. Босго ── */
{
  assert.deepEqual(FILL_STALE_DAYS, { warn: 14, bad: 30 }, 'schem.TH.reportAgeD-той ижил');
  assert.equal(fillAgeLevel(null), 'unknown');
  assert.equal(fillAgeLevel(0), 'good');
  assert.equal(fillAgeLevel(13), 'good');
  assert.equal(fillAgeLevel(14), 'warn');
  assert.equal(fillAgeLevel(29), 'warn');
  assert.equal(fillAgeLevel(30), 'bad');
  assert.equal(dayMs('2026-09-06'), Date.parse('2026-09-06T00:00:00Z'));
  assert.equal(dayMs('2026/09/06'), null);
  assert.equal(dayMs(''), null);
}

/* ── 6. 300-аас дээш мөр — тасалсан тоо ИЛ ── */
{
  const pending = Array.from({ length: 350 }, (_, i) =>
    pend(`Ажил ${i}`, 'Багц 1', 'engineer', i % 20, 'Инженер'));
  const r = computeReview({ pending, fills: [], failedSources: [] });
  const rows = r.tables[0].rows;
  assert.equal(rows.length, 301);
  assert.equal(rows[300].length, 7, 'таслах мөр ч 7 нүдтэй');
  assert.ok(String(rows[300][0].v).includes('50'), rows[300][0].v);
  assert.equal(r.value, '19');
  assert.equal(r.issues.length, pending.filter((p) => p.days > 7).length);
}

console.log('review.check: OK');
