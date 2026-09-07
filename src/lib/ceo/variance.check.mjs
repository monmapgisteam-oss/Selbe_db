/**
 * «ОБЬЁМЫН ЗӨРҮҮ» ҮЗҮҮЛЭЛТИЙН ШАЛГУУР — цэвэр тооцоо, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/variance.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. БҮГД УНАСАН ҮЕД НОГООН. `works === 0` → good гэж эхэлж шалгавал
 *      10 багц уншигдаагүй ч «зөрүүгүй» гэж гарна.
 *   2. ТООЛУУР ≠ ЖАГСААЛТ. Хүснэгт нь `all`-ын БҮХ мөрийг нэрээр агуулах ёстой;
 *      тасалсан бол тасалсан тоог ил мөр болгоно.
 *   3. ЭРЭМБЭ. Хамгийн том зөрүү эхэнд — CEO эхний мөрийг л уншина.
 *   4. МӨНГӨ ТОВЧЛОЛГҮЙ. «тэрбум»/«сая» гарвал format.ts-ийн шийдвэр зөрчигдсөн.
 */
import assert from 'node:assert/strict';
import { computeVariance, varianceLevel } from './variance.ts';
import { ROW_CAP } from './kpi.ts';
import { VAR_BAD_MNT } from '../kpiLevels.ts';

const PKG_N = 10;
const w = (pkg, no, work, vol, sum, unit) => ({ pkg, no, work, vol, sum, unit, mnt: (sum - vol) * unit });
const base = (all, failedPkgs = 0) => ({
  works: all.length,
  totalMnt: all.reduce((s, x) => s + x.mnt, 0),
  top: all.slice(0, 8),
  all,
  failedPkgs,
});

/* ── 1. Зөрүүгүй, бүгд уншигдсан → good, «—» ── */
{
  const r = computeVariance(base([]), PKG_N);
  assert.equal(r.level, 'good');
  assert.equal(r.value, '—', 'mnt(0) нь «—» — «0 ₮» биш');
  assert.deepEqual(r.facts, ['0 ажил хэтэрсэн']);
  assert.equal(r.tables.length, 2);
  assert.equal(r.tables[0].rows.length, 0);
  assert.equal(r.tables[1].rows.length, 0);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.failedSources, []);
  assert.equal(r.asOf, null);
}

/* ── 2. Бүгд унасан → unknown, ногоон БИШ ── */
{
  const r = computeVariance(base([], PKG_N), PKG_N);
  assert.equal(r.level, 'unknown', 'бүх багц унасан бол «зөрүүгүй» гэж хэлж болохгүй');
  assert.equal(r.value, '—');
  assert.deepEqual(r.facts, ['10 багц уншигдаагүй'], '«0 ажил хэтэрсэн» гэж худал хэлэхгүй');
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].tone, 'warn');
  assert.equal(r.failedSources.length, 1);
  assert.ok(r.failedSources[0].includes('10'));
  assert.equal(varianceLevel({ works: 0, totalMnt: 0, failedPkgs: PKG_N }, PKG_N), 'unknown');
}

/* ── 3. Бодит мөрүүд — bad, эрэмбэ, хэтрэлт, багцын бүлэглэл ── */
const ALL = [
  w('Багц 1 · 9 давхар', '12', 'Бетон цутгалт', 100, 130, 2_000_000), // 60 сая
  w('Багц 2 · 9 давхар', '7', 'Арматур', 50, 55.5, 1_000_000), // 5.5 сая
  w('Багц 1 · 9 давхар', '3', 'Ухалт', 1000, 1100, 500_000), // 50 сая
  w('Багц 3.1 · 9 давхар', '', 'Дулаалга', 10, 12, 100_000), // 0.2 сая
];
{
  const r = computeVariance(base(ALL, 0), PKG_N);
  assert.equal(r.level, 'bad', 'нийт ' + r.value + ' ≥ ' + VAR_BAD_MNT);
  assert.equal(r.value, '115,700,000 ₮');
  assert.ok(!/тэрбум|сая|их наяд/.test(r.value), 'мөнгө товчлолгүй');
  assert.deepEqual(r.facts, ['4 ажил хэтэрсэн', '3 багц']);
  assert.equal(r.unit, 'зөрүү');

  const t0 = r.tables[0];
  assert.equal(t0.cols.length, 8);
  assert.equal(t0.rows.length, ALL.length, 'хүснэгт = БҮХ хэтэрсэн ажил');
  for (const row of t0.rows) assert.equal(row.length, t0.cols.length);
  /* эрэмбэ: зөрүү ₮ буурах */
  const mnts = t0.rows.map((row) => row[7].v);
  assert.deepEqual(mnts, [60_000_000, 50_000_000, 5_500_000, 200_000]);
  assert.deepEqual(t0.rows.map((row) => row[7].kind), ['mnt', 'mnt', 'mnt', 'mnt']);
  /* эхний мөр: нэрс ба хэтрэлт */
  const first = t0.rows[0];
  assert.equal(first[0].v, 'Багц 1 · 9 давхар');
  assert.equal(first[1].v, '12');
  assert.equal(first[2].v, 'Бетон цутгалт');
  assert.equal(first[3].v, 100);
  assert.equal(first[4].v, 130);
  assert.equal(first[5].v, 30, 'хэтрэлт = бөглөсөн − обьём');
  assert.equal(first[6].v, 2_000_000);
  assert.equal(first[6].kind, 'mnt');
  /* хоосон № → null → «—» */
  assert.equal(t0.rows[3][1].v, null);

  const t1 = r.tables[1];
  assert.equal(t1.cols.length, 3);
  assert.deepEqual(
    t1.rows.map((row) => [row[0].v, row[1].v, row[2].v]),
    [
      ['Багц 1 · 9 давхар', 2, 110_000_000],
      ['Багц 2 · 9 давхар', 1, 5_500_000],
      ['Багц 3.1 · 9 давхар', 1, 200_000],
    ],
    'багцаар: буурах эрэмбэ, ажлын тоо, нийлбэр',
  );
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.failedSources, []);
}

/* ── 4. Босгоос доош → warn; хэсэгчилсэн уналт нь issue + failedSources ── */
{
  const small = [w('Багц 4-1 · 9 давхар', '1', 'Шавар', 10, 11, 1_000_000)]; // 1 сая
  const r = computeVariance(base(small, 2), PKG_N);
  assert.equal(r.level, 'warn');
  assert.deepEqual(r.facts, ['1 ажил хэтэрсэн', '1 багц', '2 багц уншигдаагүй']);
  assert.equal(r.issues.length, 1);
  assert.ok(r.issues[0].text.startsWith('2 '), r.issues[0].text);
  assert.deepEqual(r.failedSources, ['2 багцын бөглөх хуудас']);
  assert.equal(varianceLevel({ works: 1, totalMnt: VAR_BAD_MNT, failedPkgs: 0 }, PKG_N), 'bad', 'босго дээрээ = bad');
  assert.equal(varianceLevel({ works: 1, totalMnt: VAR_BAD_MNT - 1, failedPkgs: 0 }, PKG_N), 'warn');
}

/* ── 5. ROW_CAP — таслалт ИЛ ── */
{
  const many = Array.from({ length: ROW_CAP + 50 }, (_, i) =>
    w('Багц 2 · 12 давхар', String(i + 1), 'Ажил ' + (i + 1), 10, 11, (i + 1) * 1000));
  const r = computeVariance(base(many), PKG_N);
  const t0 = r.tables[0];
  assert.equal(t0.rows.length, ROW_CAP + 1, 'cap + нэг «… бас N мөр» мөр');
  assert.ok(String(t0.rows[ROW_CAP][0].v).includes('50'), 'тасалсан тоо ил');
  assert.equal(t0.rows[ROW_CAP].length, t0.cols.length, 'сүүлийн мөр ч баганатай таарна');
  assert.equal(t0.rows[0][7].v, (ROW_CAP + 50) * 1000, 'хамгийн том нь эхэнд');
  assert.equal(r.tables[1].rows.length, 1);
  assert.equal(r.tables[1].rows[0][1].v, ROW_CAP + 50, 'багцын тоолуур нь таслагдаагүй бүтэн тоо');
}

console.log('variance.check: OK');
