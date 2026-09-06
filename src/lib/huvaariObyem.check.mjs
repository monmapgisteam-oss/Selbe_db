/**
 * ХУВААРИЙН САРЫН ОБЬЁМ — цэвэр функцийн шалгуур, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/huvaariObyem.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. АВТОМАТ ТАРААЛТ (2026-09-06-нд ХОРИГЛОСОН). Апп нь обьёмыг өөрөө
 *      сарууд руу хуваарилж БОЛОХГҮЙ — бүх сар ХООСОН гарч, хүн өөрөө
 *      бөглөнө. Тараасан тоо нь төлөвлөгөө мэт харагдах ч таамаг.
 *   2. ЗАХЫН ХАГАС САР ХАЯГДАХ. 10-15 → 12-10 нь ГУРВАН сар. «Бүтэн сар л
 *      тооцно» гэвэл эхний ба сүүлийн сарын обьём алга болно.
 *   3. ЦАГИЙН БҮС. Сарын түлхүүр UTC-ээр бодогдох ёстой — орон нутгийн цагаар
 *      бодвол сарын 1-ний өдөр өмнөх сар руу гулсана.
 *   4. ШУЛУУН ШУГАМ. Төлөвлөгөөт хувь нь сарын БОДИТ хуваарилалтаас гарах
 *      ёстой: 6 сарын ажлын 80% сүүлийн сард төлөвлөгдсөн байхад шугаман
 *      интерполяци дунд нь 50% гэж ХУДАЛ хэлнэ.
 *   5. `null` ≠ 0. Задаргаагүй ажлын хувь нь «мэдэгдэхгүй», «тэг» БИШ.
 */
import assert from 'node:assert/strict';
import {
  monthKey, monthStart, monthsOf, keepMonths, sumMonths, balanced,
  planPctFromMonths, dkeyOf, toPkgPlan, TURUL_PLAN, buildEdits,
} from './huvaariObyem.ts';

const d = (iso) => Date.parse(`${iso}T00:00:00Z`);
const span = (a, b) => ({ start: d(a), end: d(b) });

/* ── 1. Сарын түлхүүр — UTC ── */
assert.equal(monthKey(d('2025-10-01')), '2025-10');
assert.equal(monthKey(d('2025-10-31')), '2025-10');
assert.equal(monthKey(d('2026-01-01')), '2026-01', 'жилийн халилт');
assert.equal(monthStart('2025-10'), d('2025-10-01'));
assert.equal(monthStart('2025-13'), null, '13-р сар байхгүй');
assert.equal(monthStart('муу'), null);

/* ── 2. Муж хамарсан сарууд — ЗАХЫН ХАГАС САР ОРНО ── */
assert.deepEqual(monthsOf(span('2025-10-15', '2025-12-10')), ['2025-10', '2025-11', '2025-12']);
assert.deepEqual(monthsOf(span('2025-10-05', '2025-10-20')), ['2025-10'], 'нэг сар дотор');
assert.deepEqual(monthsOf(span('2025-12-20', '2026-01-05')), ['2025-12', '2026-01'], 'жил дамжина');
assert.deepEqual(monthsOf(span('2025-10-10', '2025-10-01')), [], 'урвуу муж → хоосон');
assert.equal(monthsOf(span('2025-06-01', '2028-01-01')).length, 32, 'төслийн бүтэн хүрээ');

const s1 = span('2025-10-15', '2025-12-10');

/* ── 3. САРЫН БҮРДЭЛ — УТГАГҮЙ (автомат тараалт БАЙХГҮЙ) ── */
{
  /* Шинэ муж: утга алга — Map ХООСОН */
  assert.equal(keepMonths(s1).size, 0, 'шинэ мужид ямар ч утга үүсэхгүй');

  /* Байгаа утга ХАДГАЛАГДАНА, мужаас гарсан нь хасагдана */
  const prev = new Map([['2025-10', 100], ['2025-11', 200], ['2025-09', 50]]);
  const keep = keepMonths(s1, prev);
  assert.deepEqual([...keep.entries()], [['2025-10', 100], ['2025-11', 200]],
    'мужид байгаа сар үлдэж, гадуурх нь хасагдана');
  assert.equal(keep.has('2025-12'), false, 'бөглөөгүй сар Map-д ОРОХГҮЙ (0 биш)');
  assert.equal(sumMonths(keep), 300);

  /* Тэг нь ХҮЧИНТЭЙ утга — «тэр сард ажил хийхгүй» */
  const zero = keepMonths(s1, new Map([['2025-10', 0]]));
  assert.equal(zero.get('2025-10'), 0, '0 нь хоосон БИШ — хадгалагдана');

  /* Урвуу муж → хоосон */
  assert.equal(keepMonths(span('2025-10-10', '2025-10-01'), prev).size, 0);
}

/* ── 4. Нийлбэрийн шалгуур ── */
{
  const m = new Map([['2025-10', 400], ['2025-11', 600]]);
  assert.ok(balanced(m, 1000), 'тэнцсэн');
  assert.ok(!balanced(m, 1001), 'дутуу бол няцаана');
  /* ⚠️ Хөвөгч цэгийн алдаа (0.1+0.2≠0.3) худал «таарахгүй» гаргах ёсгүй */
  assert.ok(balanced(new Map([['2026-01', 0.1], ['2026-02', 0.2]]), 0.3));
}
/* ── 5. Төлөвлөгөөт хувь — БОДИТ хуваарилалтаас ── */
{
  /* 80% нь СҮҮЛИЙН сард. Шугаман интерполяци дунд нь ~50% гэх байсан. */
  const m = new Map([['2026-01', 10], ['2026-02', 10], ['2026-03', 80]]);
  assert.equal(planPctFromMonths(m, d('2025-12-31')), 0, 'эхлэхээс өмнө 0');
  assert.equal(planPctFromMonths(m, d('2026-01-31')), 0.1, '1-р сар дуусахад 10%');
  assert.equal(planPctFromMonths(m, d('2026-02-28')), 0.2, '2-р сар дуусахад 20%');
  assert.equal(planPctFromMonths(m, d('2026-03-31')), 1, 'дуусахад 100%');
  const mid = planPctFromMonths(m, d('2026-02-14'));
  assert.ok(mid > 0.1 && mid < 0.2, `сар дотор шугаман: ${mid}`);
  /* ⚠️ Гол утга: 2 сарын эцэст 20% — шугаман бол 67% байх байсан */
  assert.ok(planPctFromMonths(m, d('2026-02-28')) < 0.5, 'бодит муруй шугамаас ЭРС өөр');
}
/* Задаргаагүй → `null` («мэдэгдэхгүй»), 0 БИШ */
assert.equal(planPctFromMonths(new Map(), d('2026-02-01')), null);
assert.equal(planPctFromMonths(new Map([['2026-01', 0]]), d('2026-02-01')), null, 'нийт 0 → null');

/* ── 6. Түлхүүр ба задлалт ── */
assert.equal(dkeyOf('b1_9f', 412, '5/1', '2025-10'), `b1_9f|${TURUL_PLAN}|412|5/1|2025-10`);
{
  const at = (o) => ({ attributes: o });
  const p = toPkgPlan([
    at({ des_dugaar: 412, blok: '5/1', sar_txt: '2025-10', obyem: 420 }),
    at({ des_dugaar: 412, blok: '5/1', sar_txt: '2025-11', obyem: 880 }),
    at({ des_dugaar: 412, blok: '5/2', sar_txt: '2025-10', obyem: 420 }),
    at({ des_dugaar: null, blok: '5/1', sar_txt: '2025-10', obyem: 5 }),   // кодгүй
    at({ des_dugaar: 9, blok: '', sar_txt: '2025-10', obyem: 5 }),          // блокгүй
    at({ des_dugaar: 9, blok: '5/1', sar_txt: 'муу', obyem: 5 }),           // сар буруу
    at({ des_dugaar: 9, blok: '5/1', sar_txt: '2025-10', obyem: null }),    // утга алга
  ]);
  assert.equal(p.size, 1, 'гэмтэлтэй мөр алгасагдсангүй');
  assert.equal(p.get(412).size, 2, 'хоёр блок');
  assert.equal(p.get(412).get('5/1').get('2025-11'), 880);
  assert.equal(sumMonths(p.get(412).get('5/1')), 1300);
}

console.log('huvaariObyem.check: ok — сар ✓ хоосон бүрдэл ✓ нийлбэр ✓ S-муруй ✓ задлалт ✓');

/* ── 7. БИЧИЛТИЙН БАГЦ — орлуулах ёстой, нэмэх БИШ ──
   ⚠️ Хуваарь богиноссон үед хуучин сарын мөр үлдвэл нийлбэр нь нийт обьёмоос
   давж, «таарахгүй» гэсэн худал зөрчил мөнхөд үлдэнэ. */
{
  const meta = {
    bagts: 'b1_9f', bagtsNer: 'Багц 1 · 9 давхар', des: 412,
    ajilNo: '3.1', ajilNer: 'Суурийн цутгалт', negj: 'м³', niit: 1300,
  };
  const prev = new Map([['2025-10', 420], ['2025-11', 880], ['2025-12', 100]]);
  const oids = new Map([
    [dkeyOf('b1_9f', 412, '5/1', '2025-10'), 11],
    [dkeyOf('b1_9f', 412, '5/1', '2025-11'), 12],
    [dkeyOf('b1_9f', 412, '5/1', '2025-12'), 13],
  ]);
  /* Шинэ: 10-р сар ХЭВЭЭР · 11-р сар ӨӨРЧЛӨГДСӨН · 12-р сар АЛГА · 2026-01 ШИНЭ */
  const next = new Map([['2025-10', 420], ['2025-11', 500], ['2026-01', 380]]);
  const e = buildEdits(meta, '5/1', next, prev, oids);

  assert.equal(e.adds.length, 1, 'шинэ сар нэмэгдэх ёстой');
  assert.equal(e.adds[0].attributes.sar_txt, '2026-01');
  assert.equal(e.adds[0].attributes.sar, monthStart('2026-01'), 'sar нь DateOnly, сарын 1-ний өдөр');
  assert.equal(e.adds[0].attributes.turul, TURUL_PLAN);
  assert.equal(e.adds[0].attributes.niit_obyem, 1300, 'нийт обьём мөр бүрд');
  assert.equal(e.adds[0].attributes.negj, 'м³');

  assert.equal(e.updates.length, 1, 'ЗӨВХӨН өөрчлөгдсөн сар шинэчлэгдэнэ');
  assert.equal(e.updates[0].attributes.OBJECTID, 12);
  assert.equal(e.updates[0].attributes.obyem, 500);

  assert.deepEqual(e.deletes, [13], 'хуваариас гарсан сар УСТАНА');

  /* Өөрчлөлтгүй бол багц ХООСОН — 700 мөр дэмий бичихгүй */
  const same = buildEdits(meta, '5/1', prev, prev, oids);
  assert.equal(same.adds.length + same.updates.length + same.deletes.length, 0,
    'өөрчлөлтгүй үед юу ч илгээгдэх ёсгүй');

  /* Бүх сарыг арилгах — бүгд устана */
  const wipe = buildEdits(meta, '5/1', new Map(), prev, oids);
  assert.deepEqual(wipe.deletes.sort(), [11, 12, 13]);
  assert.equal(wipe.adds.length + wipe.updates.length, 0);
}

console.log('huvaariObyem.check: ok — бичилтийн багц ✓');
