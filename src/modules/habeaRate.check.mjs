/**
 * ОСЛЫН ДАВТАМЖ (1 САЯ ХҮН-ЦАГТ) · ЯВАГДАЖ БУЙ САР — шалгуур (2026-10-01).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/habeaRate.check.mjs
 *
 * Хамгаалж буй алдаа:
 *  1. Хүн-цаг хоосон (`Hun_tsag` null) өдрийг 0 цаг гэж тоолж давтамжийг ∞/худал өсгөх.
 *  2. Багцын хүн-цагийг ажилтны жингээр БУС (тэнцүү г.м.) хуваах.
 *  3. Хүн-цаггүй сар/багцад унасан ослыг чимээгүй хаях — `unmatched`-д ил тоологдох ёстой.
 *  4. Явагдаж буй сарыг «*»-гүй гаргах (сарын дунд дутуу тоо «уналт» мэт уншигдана).
 */
import assert from 'node:assert/strict';
import {
  hoursByDay, rateByMonth, rateByPkg, markCurMonth, RATE_BASE, isLtiType, ltiFreeHours,
} from './habeaRate.ts';

const day = (iso) => Date.parse(`${iso}T12:00:00+08:00`);
/** Маягтын мөр — HHDMGK (Багц 1) ба MK (Багц 4.1) */
const row = (iso, hours, w1, w2) => ({
  Ognoo: day(iso), Hun_tsag: hours,
  Niit_ajiltan_HHDMGK: w1, Niit_ajiltan_MK: w2,
});

const rows = [
  row('2026-08-10', 1000, 30, 70),
  row('2026-08-11', null, 30, 70), // хүн-цаг хоосон — ОРОХГҮЙ
  row('2026-09-02', 2000, 50, 50),
  { Ognoo: null, Hun_tsag: 500 }, // огноогүй — ОРОХГҮЙ
];
const days = hoursByDay(rows);
assert.equal(days.length, 2, 'хүн-цаг/огноогүй мөр хасагдана');
assert.equal(days[0].total, 1000);
assert.ok(Math.abs(days[0].byCo.HHDMGK - 300) < 1e-9, 'ажилтны жингээр: 30% → 300 цаг');
assert.ok(Math.abs(days[0].byCo.MK - 700) < 1e-9);

/* Монгол/гадаадын задаргаагаар нөхөх (Niit 0/хоосон) — workforce.companyDay-ийн дүрэм */
{
  const d = hoursByDay([{ Ognoo: day('2026-08-01'), Hun_tsag: 100, Niit_ajiltan_MK: 0, MNG_ajiltani_too_MK: 3, G_ajiltanii_too_MK: 1 }]);
  assert.equal(d[0].byCo.MK, 100);
}
/* Ажилтан огт байхгүй — хуваарилах боломжгүй (byCo null), нийт хэвээр */
assert.equal(hoursByDay([{ Ognoo: day('2026-08-01'), Hun_tsag: 100 }])[0].byCo, null);

const PKG_OF_CO = new Map([['HHDMGK', 'P1'], ['MK', 'P41']]);
const ymOf = (ms) => new Date(ms).toISOString().slice(0, 7);
const inc = [
  { d: day('2026-08-15'), bagtsK: 'P1' },
  { d: day('2026-08-20'), bagtsK: 'P41' },
  { d: day('2026-09-05'), bagtsK: 'P41' },
  { d: day('2026-07-01'), bagtsK: 'P1' }, // хүн-цаггүй сар
  { d: 0, bagtsK: 'P1' },                 // огноогүй
];

/* ── Сараар — нийт ── */
{
  const r = rateByMonth(days, inc, { ymOf, pkgOfCo: PKG_OF_CO, pkgs: null });
  assert.deepEqual(r.items.map((x) => x.key), ['2026-08', '2026-09']);
  assert.equal(r.items[0].rate, (2 / 1000) * RATE_BASE, '8 сар: 2 осол / 1000 цаг');
  assert.equal(r.items[1].rate, (1 / 2000) * RATE_BASE);
  assert.equal(r.unmatched, 2, 'хүн-цаггүй сар ба огноогүй осол ил тоологдоно');
}
/* ── Сараар — багц шүүлттэй (хуваарилсан хүн-цаг) ── */
{
  const r = rateByMonth(days, inc.filter((x) => x.bagtsK === 'P41'), { ymOf, pkgOfCo: PKG_OF_CO, pkgs: new Set(['P41']) });
  assert.ok(Math.abs(r.items[0].hours - 700) < 1e-9, '8 сар: MK-ийн 70%');
  assert.ok(Math.abs(r.items[1].hours - 1000) < 1e-9);
  assert.ok(Math.abs(r.items[0].rate - (1 / 700) * RATE_BASE) < 1e-6);
}
/* ── Багцаар ── */
{
  const r = rateByPkg(days, inc, PKG_OF_CO, (k) => `L-${k}`);
  const p1 = r.items.find((x) => x.key === 'P1');
  const p41 = r.items.find((x) => x.key === 'P41');
  assert.ok(Math.abs(p1.hours - (300 + 1000)) < 1e-9);
  assert.ok(Math.abs(p41.hours - (700 + 1000)) < 1e-9);
  /* P1-ийн 3 осол бүгд тоологдоно (багцаар огноо шаардахгүй) */
  assert.equal(p1.incidents, 3);
  assert.equal(p41.incidents, 2);
  assert.equal(p1.label, 'L-P1');
  assert.ok(r.items[0].rate >= r.items[1].rate, 'давтамж буурахаар');
  /* Ажилтны баганагүй багцын осол — давтамжгүй, `unmatched`-д */
  const r2 = rateByPkg(days, [{ d: day('2026-08-01'), bagtsK: 'P21' }], PKG_OF_CO, (k) => k);
  assert.equal(r2.unmatched, 1);
}
/* ── 2026-10-09: ТАСРАЛТГҮЙ сарын тэнхлэг — хүн-цаггүй завсрын сар `rate: null` (цоорхой, 0 биш) ── */
{
  const d2 = hoursByDay([row('2026-06-10', 1000, 1, 1), row('2026-09-02', 2000, 1, 1)]);
  const r = rateByMonth(d2, [{ d: day('2026-06-12'), bagtsK: 'P1' }], { ymOf, pkgOfCo: PKG_OF_CO, pkgs: null });
  assert.deepEqual(r.items.map((x) => x.key), ['2026-06', '2026-07', '2026-08', '2026-09'], 'завсрын сар алга болохгүй');
  assert.deepEqual(r.items.map((x) => x.rate), [(1 / 1000) * RATE_BASE, null, null, 0], 'хүн-цаггүй сар null, осолгүй сар 0');
  assert.equal(r.items[1].hours, null);
  /* Он дамжих */
  const d3 = hoursByDay([row('2026-12-10', 1000, 1, 1), row('2027-02-02', 1000, 1, 1)]);
  assert.deepEqual(rateByMonth(d3, [], { ymOf, pkgOfCo: PKG_OF_CO, pkgs: null }).items.map((x) => x.key), ['2026-12', '2027-01', '2027-02']);
}
/* ── Хүн-цаг огт алга — хоосон (0 давтамж зурахгүй) ── */
assert.deepEqual(rateByMonth([], inc, { ymOf, pkgOfCo: PKG_OF_CO, pkgs: null }).items, []);

/* ── Явагдаж буй сар ── */
{
  const items = [{ key: '2026-09', label: '2026.09' }, { key: '2026-10', label: '2026.10' }];
  const m = markCurMonth(items, '2026-10');
  assert.equal(m[1].label, '2026.10*');
  assert.equal(m[0].label, '2026.09', 'дууссан сар хөндөгдөхгүй');
  assert.equal(items[1].label, '2026.10', 'оролтыг мутацлахгүй');
}

/* ══════════ 5. LTI-гүй хүн-цаг (2026-10-09) ══════════
   Урьд нь KPI «Хөдөлмөрийн чадвар түр алдсан осолгүй ажилласан цаг» = Σ Hun_tsag (LTI-д тэглэгддэггүй). */
{
  const ub = (ms) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
  assert.equal(isLtiType('Ноцтой осол'), true);
  assert.equal(isLtiType('Хөдөлмөрийн чадвар түр алдсан осол'), true);
  assert.equal(isLtiType('Амь нас эрсдэж болзошгүй байсан'), false, 'болзошгүй — LTI биш');
  assert.equal(isLtiType('Осолд дөхсөн тохиолдол'), false);
  assert.equal(isLtiType('Эд хөрөнгийн хохирол'), false);
  const lab = [
    { Ognoo: day('2026-08-10'), Hun_tsag: 1000 },
    { Ognoo: day('2026-08-11'), Hun_tsag: 500 },
    { Ognoo: day('2026-08-12'), Hun_tsag: null },
    { Ognoo: day('2026-08-13'), Hun_tsag: 300 },
  ];
  assert.deepEqual(ltiFreeHours(lab, [{ d: day('2026-08-11'), type: 'Эд хөрөнгийн хохирол' }], ub),
    { hours: 1800, since: null, undatedLti: false, futureLti: 0 }, 'LTI алга — бүх хүн-цаг');
  const r = ltiFreeHours(lab, [{ d: day('2026-08-11'), type: 'Ноцтой осол' }], ub);
  assert.equal(r.hours, 300, 'LTI-ийн ӨДРИЙН дараах хүн-цаг л (тэр өдөр ороогүй, null 0 биш алгасна)');
  assert.equal(r.since, day('2026-08-11'));
  assert.equal(ltiFreeHours(lab, [{ d: 0, type: 'Ноцтой осол' }], ub).hours, null, 'огноогүй LTI — мэдэгдэхгүй (0 биш)');
  /* ⚠️ 2026-10-09: ирээдүйн огноотой LTI хил болохгүй — тоолж ил буцаана */
  {
    const now = day('2026-08-20');
    const f = ltiFreeHours(lab, [{ d: day('2026-08-11'), type: 'Ноцтой осол' }, { d: day('2027-08-11'), type: 'Ноцтой осол' }], ub, now);
    assert.equal(f.hours, 300, 'ирээдүйн LTI үл тооцогдоно — сүүлийн БОДИТ LTI-ээс');
    assert.equal(f.futureLti, 1);
    assert.equal(ltiFreeHours(lab, [{ d: day('2027-01-01'), type: 'Үйлдвэрлэлийн осол' }], ub, now).hours, 1800, 'зөвхөн ирээдүйн LTI — бүх хүн-цаг');
  }
}

/* ══════════ 6. Амьд ослын төрлүүд — ангилал (2026-10-09) ══════════
   ⚠️ Амьд `field_7` домэйн + бодит утгуудаас (кодын тайлбар, enData-аас сэргээсэн; давхарга токен
   шаарддаг тул шалгуур нь сүлжээгүй). LTI ЗӨВХӨН «Ноцтой осол», «Үйлдвэрлэлийн осол». */
{
  const LIVE = [
    'Ноцтой осол',
    'Үйлдвэрлэлийн осол',
    'Амь нас эрсдэж болзошгүй байсан',
    'Хүний амь эрсдэж болзошгүй байсан',
    'Ноцтой байдалд хүргэж болзошгүй',
    'Осол дөхсөн тохиолдол',
    'Эд хөрөнгийн хохирол',
    'Эд хөрөнгө, өмчийн хохирол',
    'Галын тохиолдол',
    'Бусад',
    'Эмнэлгийн тусламж авсан гэмтэл',
    'Эмнэлэгийн тусламж авсан',
    'Анхны тусламж авсан осол зөрчил',
    'Моторт тээврийн хэрэгсэлийн осо',
  ];
  assert.equal(LIVE.length, 14);
  assert.deepEqual(LIVE.filter(isLtiType), ['Ноцтой осол', 'Үйлдвэрлэлийн осол'], 'амьд 14 төрлийн ангилал өөрчлөгдөхгүй');
  /* Эрэмбэ: «LTI биш» үг ҮНДСЭН төрөлд байвал л хасна */
  assert.equal(isLtiType('Үйлдвэрлэлийн осол (эд хөрөнгийн хохиролтой)'), true, 'дагалдах «хохирол» LTI-г хасахгүй');
  assert.equal(isLtiType('Ноцтой осолд хүргэж болзошгүй'), false, 'үндсэн төрөл «болзошгүй»');
  assert.equal(isLtiType('Осол дөхсөн тохиолдол (ноцтой осол болох байсан)'), false, 'LTI үг зөвхөн дагалдах хэсэгт');
}

console.log('habeaRate.check: OK');
