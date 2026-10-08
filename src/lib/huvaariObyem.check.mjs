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
  planPctFromMonths, dkeyOf, toPkgPlan, TURUL_PLAN, buildEdits, indexOids,
  toPkgRes, keepRes, sumRes, sameMonthRes,
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
  /* ⚠️ 2026-09-30 РЕГРЕСС: 3 оронтой x.xx5 нийт — 2 оронтой хоёр хөрш хоёулаа ЯГ
     хагас нэгжийн зайтай. Урьд нь хатуу `<` тул аль нь ч тэнцдэггүй байв
     («обьём зөв хуваасан ч болохгүй»). */
  const one = (v) => new Map([['2026-01', v]]);
  assert.ok(balanced(one(0.13), 0.125), '0.125 → 0.13 тэнцэнэ');
  assert.ok(balanced(one(0.12), 0.125), '0.125 → 0.12 тэнцэнэ');
  assert.ok(balanced(one(1234.88), 1234.875), '1234.875 → 1234.88');
  assert.ok(balanced(new Map([['2026-01', 600], ['2026-02', 634.87]]), 1234.875), 'хоёр сар → 1234.87');
  assert.ok(!balanced(one(0.11), 0.125), '0.015 зөрүү няцаагдана');
  assert.ok(!balanced(one(1234.86), 1234.875), '0.015 зөрүү няцаагдана (том тоо)');
  /* Цонхонд харагдах бөөрөнхийлсөн нийт (`num(total, 2)`) ҮРГЭЛЖ тэнцэнэ —
     3 оронтой, 5-аар төгссөн 20,000 нийт дээр (0.005…199.995; урьд нь ~31% нь унадаг байв) */
  const fmt = (v) => Number(v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }));
  let failDisp = 0;
  for (let k = 5; k < 200_000; k += 10) {
    const t = k / 1000;
    if (!balanced(one(fmt(t)), t)) failDisp += 1;
  }
  assert.equal(failDisp, 0, `харагдах нийт тэнцээгүй: ${failDisp}`);
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

/* ── 8. ДАВХАРДСАН `dkey` — сангийн unique индекс БАЙХГҮЙ (2026-09-08) ──
   Зэрэг хадгалалт ижил түлхүүртэй хоёр мөр үүсгэж чадна. Апп дотор нь
   сүүлийнх нь дардаг тул НҮДЭЭР ИЛРЭХГҮЙ, гэтэл Excel/ArcGIS Pro-д обьём
   давхар тоологдоно. Илүүдлийг барьж, дараагийн бичилтэд устгуулна. */
{
  const k1 = dkeyOf('b1_9f', 412, '5/1', '2025-10');
  const k2 = dkeyOf('b1_9f', 412, '5/1', '2025-11');
  const feats = [
    { attributes: { OBJECTID: 11, dkey: k1, des_dugaar: 412, blok: '5/1', sar_txt: '2025-10', obyem: 100 } },
    { attributes: { OBJECTID: 12, dkey: k2, des_dugaar: 412, blok: '5/1', sar_txt: '2025-11', obyem: 200 } },
    /* давхардсан — ХОЁР ДАХЬ бичилтээс үүссэн */
    { attributes: { OBJECTID: 13, dkey: k1, des_dugaar: 412, blok: '5/1', sar_txt: '2025-10', obyem: 150 } },
  ];
  const { oids, dups } = indexOids(feats);
  assert.equal(oids.size, 2, 'ижил dkey нэг л оролт эзэлнэ');
  assert.equal(oids.get(k1), 13, 'СҮҮЛИЙН мөр үлдэнэ');
  assert.deepEqual(dups, [11], 'өмнөх мөр илүүдэлд ялгарна');

  /* ⚠️ Үлдсэн OID нь `toPkgPlan`-ий ХАРУУЛАХ утгатай НЭГ мөрийг заах ёстой —
     эс бөгөөс хэрэглэгч 150 гэж хараад 100-гийн мөр засагдана. */
  const plan = toPkgPlan(feats);
  assert.equal(plan.get(412).get('5/1').get('2025-10'), 150,
    'харагдах утга ба шинэчлэгдэх OID нэг мөрийнх');

  /* Давхардалгүй бол илүүдэл ГАРАХГҮЙ */
  assert.deepEqual(indexOids(feats.slice(0, 2)).dups, []);
}

console.log('huvaariObyem.check: ok — давхардсан dkey ✓');

/* ── 9. САРЫН НӨӨЦ — хүн хүч · машин механизм (2026-09-24) ──
   ⚠️ Обьёмтой зэрэгцээ, тусдаа Map; талбар байхгүй үйлчилгээг тэсвэрлэнэ. */
{
  const at = (o) => ({ attributes: o });
  /* toPkgRes: талбартай/талбаргүй/хагас */
  const res = toPkgRes([
    at({ des_dugaar: 412, blok: '5/1', sar_txt: '2025-10', obyem: 420, hun_huch: 12, mashin_mehanizm: 2 }),
    at({ des_dugaar: 412, blok: '5/1', sar_txt: '2025-11', obyem: 880, hun_huch: 8, mashin_mehanizm: null }),
    at({ des_dugaar: 412, blok: '5/2', sar_txt: '2025-10', obyem: 420 }),                         // талбаргүй → алгасна
    at({ des_dugaar: 412, blok: '5/2', sar_txt: '2025-11', obyem: 10, hun_huch: null, mashin_mehanizm: null }), // хоёулаа null → алгасна
    at({ des_dugaar: 9, blok: '5/1', sar_txt: '2025-10', obyem: null, hun_huch: 5 }),             // обьёмгүй → алгасна
  ]);
  assert.equal(res.size, 1);
  assert.deepEqual(res.get(412).get('5/1').get('2025-10'), { hun: 12, mashin: 2 });
  assert.deepEqual(res.get(412).get('5/1').get('2025-11'), { hun: 8, mashin: null }, 'хагас нөөц хадгалагдана');
  assert.equal(res.get(412).has('5/2'), false, 'талбаргүй/хоосон мөр орохгүй');
  assert.deepEqual(toPkgRes([at({ des_dugaar: 1, blok: 'x', sar_txt: '2025-10', obyem: 1 })]).size, 0, 'талбаргүй үйлчилгээ → хоосон, унахгүй');

  /* keepRes — keepMonths-ийн адил */
  const prevR = new Map([['2025-10', { hun: 3, mashin: null }], ['2025-11', { hun: null, mashin: null }], ['2025-09', { hun: 1, mashin: 1 }]]);
  const kept = keepRes(s1, prevR);
  assert.deepEqual([...kept.keys()], ['2025-10'], 'мужид үлдсэн + утгатай сар л');
  assert.equal(keepRes(s1).size, 0, 'автомат тараалт үгүй');

  /* sumRes — null ≠ 0 */
  assert.deepEqual(sumRes(new Map([['a', { hun: 3, mashin: null }], ['b', { hun: 4, mashin: 2 }]])), { hun: 7, mashin: 2 });
  assert.deepEqual(sumRes(new Map()), { hun: null, mashin: null }, 'утгагүй бол null');
  /* Бүхэл тоо (2026-09-24): Integer мөрийн талбар — утга бүр floor */
  assert.deepEqual(sumRes(new Map([['a', { hun: 2.7, mashin: 1.2 }], ['b', { hun: 1.9, mashin: null }]])), { hun: 3, mashin: 1 }, 'бутархай → floor');
  assert.ok(sameMonthRes({ hun: 1, mashin: null }, { hun: 1, mashin: null }));
  assert.ok(!sameMonthRes({ hun: 0, mashin: null }, { hun: null, mashin: null }), '0 ≠ null');

  /* buildEdits + res */
  const meta = { bagts: 'b1_9f', bagtsNer: 'Багц 1', des: 412, ajilNo: '3.1', ajilNer: 'Суурь', negj: '', niit: 1300 };
  const prev = new Map([['2025-10', 420], ['2025-11', 880]]);
  const oids = new Map([
    [dkeyOf('b1_9f', 412, '5/1', '2025-10'), 11],
    [dkeyOf('b1_9f', 412, '5/1', '2025-11'), 12],
  ]);
  const fields = { hun: true, mashin: true };
  /* Обьём ижил, зөвхөн 10-р сарын хүн өөрчлөгдсөн → 1 update */
  const e1 = buildEdits(meta, '5/1', prev, prev, oids, {
    cur: new Map([['2025-10', { hun: 15, mashin: 2 }]]),
    prev: new Map([['2025-10', { hun: 12, mashin: 2 }]]),
    fields,
  });
  assert.equal(e1.updates.length, 1, 'зөвхөн нөөц өөрчлөгдөхөд ч update');
  assert.equal(e1.updates[0].attributes.OBJECTID, 11);
  assert.equal(e1.updates[0].attributes.hun_huch, 15);
  assert.equal(e1.updates[0].attributes.mashin_mehanizm, 2);
  assert.equal(e1.updates[0].attributes.obyem, 420);
  assert.equal(e1.adds.length + e1.deletes.length, 0);
  /* Талбар байхгүй (`fields.hun=false`) — тэр талбар attrs-д ОРОХГҮЙ, өөрчлөлт ч тоологдохгүй */
  const e2 = buildEdits(meta, '5/1', prev, prev, oids, {
    cur: new Map([['2025-10', { hun: 15, mashin: 2 }]]),
    prev: new Map([['2025-10', { hun: 12, mashin: 2 }]]),
    fields: { hun: false, mashin: true },
  });
  assert.equal(e2.updates.length, 0, 'байхгүй талбарын өөрчлөлт бичигдэхгүй');
  const e3 = buildEdits(meta, '5/1', new Map([['2025-10', 420], ['2025-11', 900]]), prev, oids, {
    cur: new Map([['2025-11', { hun: 4, mashin: null }]]), prev: new Map(), fields: { hun: false, mashin: true },
  });
  assert.equal(e3.updates.length, 1);
  assert.equal('hun_huch' in e3.updates[0].attributes, false, 'байхгүй талбар attrs-д алга');
  assert.equal(e3.updates[0].attributes.mashin_mehanizm, null, 'байгаа талбар (null ч) бичигдэнэ');
  /* Шинэ сар — нөөц нь adds-д хамт */
  const e4 = buildEdits(meta, '5/1', new Map([...prev, ['2026-01', 5]]), prev, oids, {
    cur: new Map([['2026-01', { hun: 2, mashin: 1 }]]), prev: new Map(), fields,
  });
  assert.equal(e4.adds.length, 1);
  assert.equal(e4.adds[0].attributes.hun_huch, 2);
  /* Хуучин 5-аргумент дуудлага ХЭВЭЭР — нөөцийн талбар attrs-д огт орохгүй */
  const e5 = buildEdits(meta, '5/1', new Map([['2025-10', 421], ['2025-11', 880]]), prev, oids);
  assert.equal(e5.updates.length, 1);
  assert.equal('hun_huch' in e5.updates[0].attributes, false);
}

console.log('huvaariObyem.check: ok — сарын нөөц ✓');

/* ══════════ САР ДОТОРХ ХУВЬ — АЖЛЫН ЭХЛЭХ–ДУУСАХ ӨДРӨӨР (2026-10-01, хэрэглэгчийн шийдвэр) ══════════
 * ⚠️ Урьд нь 20-нд эхлэх ажлын тэр сарын обьём сарын 1-нээс өсдөг тул бодит 0 гүйцэтгэлтэй
 *    ажил сарын эхэнд «хоцорсон» гэж ХУДАЛ харагддаг байв; 10-нд дуусах ажил 10-нд 100% хүрдэггүй.
 *    `span`-гүй дуудлага (хуучин дуудагчид) ХЭВЭЭР — бүтэн сараар. */
{
  const m = new Map([['2026-03', 100]]);
  const sp = span('2026-03-20', '2026-03-29');   // 10 хоног
  /* Сарын 1 — ажил эхлээгүй → 0 (хуучнаар 1/31 ≈ 3.2%) */
  assert.equal(planPctFromMonths(m, d('2026-03-01'), sp), 0, 'сарын 1-нд эхлээгүй ажил 0 байх ёстой');
  assert.ok(planPctFromMonths(m, d('2026-03-01')) > 0, 'span-гүй (хуучин) дуудлага бүтэн сараар хэвээр');
  assert.equal(planPctFromMonths(m, d('2026-03-19'), sp), 0, 'эхлэхийн өмнөх өдөр 0');
  assert.equal(planPctFromMonths(m, d('2026-03-20'), sp), 0.1, 'эхлэх өдрийн төгсгөлд 1/10');
  assert.equal(planPctFromMonths(m, d('2026-03-24'), sp), 0.5, '5 дахь өдөр 50%');
  assert.equal(planPctFromMonths(m, d('2026-03-29'), sp), 1, 'дуусах өдөр 100% (сарын эцэс хүлээхгүй)');
  assert.equal(planPctFromMonths(m, d('2026-03-31'), sp), 1, 'сарын эцэс 100% — муруйн цэг өөрчлөгдөхгүй');
  /* ⚠️ 2026-10-08: УРВУУ муж (дуусах < эхлэх) = ХУВААРЬГҮЙ → null (`bagtsSheet.planAt`-тай нэг).
     Урьд нь `own = null` болгоод бүтэн сараар ХУВЬ гаргадаг байв. */
  assert.equal(planPctFromMonths(m, d('2026-03-25'), span('2026-03-29', '2026-03-20')), null,
    'урвуу муж → null (бүтэн сарын хувь БИШ)');
  assert.equal(planPctFromMonths(m, d('2026-03-31'), span('2026-03-29', '2026-03-20')), null,
    'урвуу муж сарын эцэст ч null');
  assert.equal(planPctFromMonths(m, d('2026-03-25'), { start: null, end: d('2026-03-20') }), planPctFromMonths(m, d('2026-03-25')),
    'хагас муж (эхлэхгүй) → бүтэн сараар хэвээр (урвуу биш)');
  /* Олон сар: 1-р сар 20-ноос, 3-р сар 10 хүртэл */
  const m3 = new Map([['2026-01', 10], ['2026-02', 30], ['2026-03', 60]]);
  const sp3 = span('2026-01-20', '2026-03-10');
  assert.equal(planPctFromMonths(m3, d('2026-01-10'), sp3), 0, '1-р сарын эхэнд 0');
  assert.equal(planPctFromMonths(m3, d('2026-01-31'), sp3), 0.1, '1-р сарын эцэс = 10%');
  assert.equal(planPctFromMonths(m3, d('2026-02-28'), sp3), 0.4, '2-р сарын эцэс = 40% (бүтэн сар)');
  assert.ok(Math.abs(planPctFromMonths(m3, d('2026-03-05'), sp3) - (40 + 60 * 0.5) / 100) < 1e-12, '3-р сар 1–10 доторх 5 дахь өдөр = хагас');
  assert.equal(planPctFromMonths(m3, d('2026-03-10'), sp3), 1, 'дуусах өдөр 100%');
  /* Сарын эцсийн цэгүүд span-тай/гүй ИЖИЛ (planProgress-ийн муруй хөдлөхгүй) */
  for (const at of ['2026-01-31', '2026-02-28', '2026-03-31']) {
    assert.equal(planPctFromMonths(m3, d(at), sp3), planPctFromMonths(m3, d(at)), `сарын эцэс ${at} зөрөв`);
  }
  /* Мужтай огт давхцахгүй сар (хуучирсан задаргаа) — бүтэн сараар, унахгүй */
  assert.equal(planPctFromMonths(new Map([['2026-05', 10]]), d('2026-05-16'), sp3), planPctFromMonths(new Map([['2026-05', 10]]), d('2026-05-16')));
  /* Хагас span (null) → хуучин зам; ⚠️ 2026-10-08: УРВУУ span → null (хуваарьгүй, `planAt`-тай нэг) */
  assert.equal(planPctFromMonths(m, d('2026-03-10'), { start: null, end: d('2026-03-29') }), planPctFromMonths(m, d('2026-03-10')));
  assert.equal(planPctFromMonths(m, d('2026-03-10'), { start: d('2026-03-29'), end: d('2026-03-20') }), null, 'урвуу муж → null');
  /* `bagtsSheet.planAt` ба `plan.spanFrac` НЭГ томъёо */
  const { spanFrac } = await import('./plan.ts');
  const { planAt } = await import('@/modules/sheet/bagtsSheet.ts');
  for (const at of ['2026-03-19', '2026-03-20', '2026-03-24', '2026-03-29', '2026-04-02']) {
    assert.equal(planAt(d(at), sp.start, sp.end), spanFrac(sp, d(at)), `planAt ≠ spanFrac (${at})`);
  }
  /* Цагтай `asOf` (Date.now) — өдрийн төгсгөлөөр (цаг нөлөөгүй) */
  assert.equal(planPctFromMonths(m, d('2026-03-24') + 13 * 3_600_000, sp), 0.5, 'цагтай asOf өдрөөрөө');
}
console.log('huvaariObyem.check: ok — сар доторх хувь ажлын өдрөөр ✓');

/* ══════════ САРЫН ОБЬЁМ БИЧСЭНИЙ ДАРАА КЭШ ХҮЧИНГҮЙ (2026-10-01) ══════════
 * ⚠️ Батлалтын дараа муруй/дашбоард TTL дуустал хуучин байв. `HUVAARI_OBYEM` түлхүүр
 *    нэмэгдэж, `applyPlanEdits` бичсэн бол (багц дундуур унасан ч) хүчингүй болгоно;
 *    төлөвлөгөөт муруй тэр түлхүүрээр бүртгэгдсэн. Сүлжээгүй — автобус ба эх код. */
{
  const bus = await import('./dataBus.ts');
  let dropped = 0;
  bus.register(() => { dropped += 1; }, ['HUVAARI_OBYEM']);
  const v0 = bus.dataVersion();
  bus.invalidate('HUVAARI_OBYEM');
  assert.equal(dropped, 1, 'HUVAARI_OBYEM-ээр бүртгэсэн кэш хаягдсангүй');
  assert.ok(bus.dataVersion() > v0, 'хувилбар өссөнгүй — useAsync дахин татахгүй');
  const fs = await import('node:fs');
  const SRC = fs.readFileSync('src/lib/huvaariObyem.ts', 'utf8');
  const i = SRC.indexOf('export async function applyPlanEdits(');
  const body = SRC.slice(i);
  assert.ok(/finally \{\s*if \(a \+ u \+ dl > 0\) invalidate\('HUVAARI_OBYEM'\);\s*\}/.test(body), 'applyPlanEdits: бичсэний дараа HUVAARI_OBYEM хүчингүй болгохгүй байна');
}
console.log('huvaariObyem.check: ok — HUVAARI_OBYEM кэш хүчингүй ✓');

/* ══════════ ⚠️ 2026-10-08: 500-ААС ИХ МӨРИЙН ДАРААЛАЛ — давхардлын устгал → нэмэх → шинэчлэх → бусад устгал
 * Өдрийн эхэнд БҮХ устгал эхэлж явдаг байсан нь шууд хадгалах замд алдагдалтай (устгал орсон, нэмэлт
 * унасан → сарын обьём алга). Зөвхөн `dups` (давхардсан dkey-ийн илүүдэл) эхэлнэ; `deletes`-д давхар
 * орсон бол нэг л удаа. Сүлжээгүй — эх код. */
{
  const fs = await import('node:fs');
  const SRC = fs.readFileSync('src/lib/huvaariObyem.ts', 'utf8');
  assert.ok(/dups\?: number\[\];/.test(SRC), 'PlanEdits.dups алга');
  const body = SRC.slice(SRC.indexOf('export async function applyPlanEdits('));
  const at = (s) => { const i = body.indexOf(s); assert.ok(i > 0, `${s} олдсонгүй`); return i; };
  assert.ok(at('chunk(dups)') < at('chunk(e.adds)') && at('chunk(e.adds)') < at('chunk(e.updates)') && at('chunk(e.updates)') < at('chunk(rest)'),
    'applyPlanEdits: дараалал dups → adds → updates → rest биш');
  assert.ok(/const rest = e\.deletes\.filter\(\(x\) => !dupSet\.has\(x\)\);/.test(body), 'applyPlanEdits: dups давхар устгагдана');
}
console.log('huvaariObyem.check: ok — 500+ дараалал dups → adds → updates → deletes ✓');
