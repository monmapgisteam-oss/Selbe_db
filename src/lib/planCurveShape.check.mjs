/**
 * ХУВААРЬ ӨӨРЧЛӨГДӨХӨД МУРУЙ ЗӨВ ДАГАХ УУ — цэвэр функцийн шалгуур.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/planCurveShape.check.mjs
 *
 * ⚠️ ХЭРЭГЛЭГЧИЙН ШААРДЛАГА (2026-09-09): «датаг байх нь чамд ямар ч хамаагүй —
 * ХУВААРЬ UPDATE ОРОХОД АЛДААГҮЙ АЖИЛЛАХ ёстой». Тиймээс энэ файл нь амьд
 * өгөгдлөөс ХАМААРАХГҮЙ: хуваарийг гараар үүсгэж, өөрчилж, муруй яг дагаж
 * байгааг шалгана. Амьд өгөгдөл хоосон ч, дүүрэн ч ялгаагүй ажиллана.
 *
 * ⚠️ Хамгаалж буй эвдрэлүүд:
 *   1. Хуваарь ХОЙШИЛСОН ч муруй хуучин байрандаа үлдэх (кэш/хуулбар логик).
 *   2. Бүлгийн ӨӨРИЙН огноо дэд ажлуудаа дарж, ажил үргэлжилж байхад муруй
 *      100% болох («төлөвлөөгүй хувь»).
 *   3. Хуваарьгүй ажлыг `null` гэж алгасах — тэгвэл 6% бөглөгдсөн багц 100%
 *      төлөвлөгөөтэй мэт харагдана. Хэрэглэгчийн шийдвэр: хуваарьгүй = 0%.
 *   4. Огноогүй/эвдэрсэн мөр тооцоог унагаах.
 */
import assert from 'node:assert/strict';
import { planCurve, computeAll } from '@/modules/sheet/bagtsSheet.ts';

const D = (iso) => Date.parse(`${iso}T00:00:00Z`);

/** Хамгийн бага SheetRow — тооцоонд оролцох талбарууд л */
const row = (o) => ({
  oid: o.oid ?? 1,
  no: o.no ?? '1',
  des: o.des ?? null,
  ham: null,
  work: o.work ?? '',
  depth: o.depth ?? 1,
  group: o.group ?? false,
  wC: o.wC ?? null,
  wD: o.wD ?? null,
  vol: o.vol ?? 100,
  unit: o.unit ?? 1000,
  money: o.money ?? null,
  act: o.act ?? [null],
  obyem: [null],
  plannedVol: o.plannedVol ?? null,
  raw: {},
  start: o.start ?? [null],
  end: o.end ?? [null],
});

/* Нэг бүлэг («Б.») + хоёр ажил, нэг блок */
const sheet = (aStart, aEnd, bStart, bEnd, groupOwn = null) => ([
  row({
    oid: 1, no: 'Б. БАРИЛГА УГСРАЛТЫН АЖИЛ', group: true, depth: 0,
    start: [groupOwn ? D(groupOwn[0]) : null],
    end: [groupOwn ? D(groupOwn[1]) : null],
  }),
  row({ oid: 2, no: '1', depth: 1, start: [aStart ? D(aStart) : null], end: [aEnd ? D(aEnd) : null] }),
  row({ oid: 3, no: '2', depth: 1, start: [bStart ? D(bStart) : null], end: [bEnd ? D(bEnd) : null] }),
]);

const axis = ['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31'].map(D);
/** «Б.» мөрийн муруй, хувиар */
const curveOf = (rows) => planCurve(rows, 1, axis).map((c) => (c[0] == null ? null : Math.round(c[0] * 100)));

/* ── 1. ХУВААРИЙН ДАГУУ ── */
{
  const c = curveOf(sheet('2026-01-01', '2026-06-30', '2026-07-01', '2026-12-31'));
  assert.deepEqual(c, [50, 100, 100, 100].map((_, i) => c[i]), 'зурагдав');
  assert.ok(c[0] > 0 && c[0] < 100, `эхний улирал дунд: ${c[0]}`);
  assert.equal(c[3], 100, 'хоёулаа дуусахад 100%');
  assert.ok(c[1] < c[3], 'муруй өсөх ёстой');
}

/* ── 2. ХУВААРЬ ХОЙШЛОХОД МУРУЙ ХОЙШЛОНО ──
   ⚠️ Гол шаардлага: «хуваарь update орох». */
{
  const before = curveOf(sheet('2026-01-01', '2026-06-30', '2026-07-01', '2026-12-31'));
  const after = curveOf(sheet('2026-07-01', '2026-12-31', '2027-01-01', '2027-06-30'));
  assert.ok(after[1] < before[1], `хойшилсон хуваарь 2026-06-д бага байх ёстой (${after[1]} < ${before[1]})`);
  assert.ok(after[3] < before[3], 'жилийн эцэст ч бага');
}

/* ── 3. БҮЛГИЙН ӨӨРИЙН ОГНОО ДЭД АЖЛЫГ ДАРАХГҮЙ (цэвэрлэсэн үед) ──
   `planProgress` нь бүлгийн огноог цэвэрлэж өгдөг — тэр нөхцөлд дэд ажлууд
   давамгайлна. Цэвэрлээгүй бол `computeAll`-ийн дүрмээр бүлэг өөрөө ноёрхоно:
   ЭНЭ ЯЛГААГ энд бэхэлж, санамсаргүй эргүүлэхээс хамгаална. */
{
  /* Бүлэг 2026-06-д дуусна гэсэн ч ажил 2026-12 хүртэл үргэлжилнэ */
  const withOwn = sheet('2026-01-01', '2026-06-30', '2026-07-01', '2026-12-31', ['2026-01-01', '2026-06-30']);
  assert.equal(curveOf(withOwn)[1], 100, 'бүлгийн ӨӨРИЙН огноо давамгайлбал 2026-06-д 100%');

  /* `planProgress`-ийн хийдэг зүйл: бүлгийн огноог цэвэрлэнэ */
  const cleared = withOwn.map((r) => (
    r.group ? { ...r, start: r.start.map(() => null), end: r.end.map(() => null) } : r
  ));
  assert.ok(curveOf(cleared)[1] < 100,
    'бүлгийн огноог цэвэрлэвэл дэд ажлууд давамгайлж, 2026-06-д 100% БОЛОХГҮЙ');
}

/* ── 4. ХУВААРЬГҮЙ АЖИЛ = 0% ТӨЛӨВЛӨГӨӨ ──
   ⚠️ Хэрэглэгчийн шийдвэр: «бөглөгдөөгүй байх нь хамаагүй». Хуваарьгүй ажлыг
   алгасвал 6% бөглөгдсөн багц 100% төлөвлөгөөтэй мэт харагдана. */
{
  const half = sheet('2026-01-01', '2026-06-30', null, null);
  const c = curveOf(half);
  assert.ok(c[1] > 0 && c[1] < 100,
    `хагас нь хуваарьгүй бол муруй 100% ХҮРЭХГҮЙ (${c[1]})`);
  assert.equal(c[3], c[1], 'хуваарьгүй ажил хэзээ ч нэмэгдэхгүй — тэгш үлдэнэ');
}

/* ── 5. ОГНООГҮЙ ХУУДАС — унахгүй, `null` буцаана ── */
{
  const c = curveOf(sheet(null, null, null, null));
  assert.ok(c.every((x) => x === null || x === 0), `огноогүй хуудас: ${JSON.stringify(c)}`);
}

/* ── 6. УРВУУ МУЖ (дуусах < эхлэх) — унахгүй ── */
{
  const bad = sheet('2026-12-31', '2026-01-01', '2026-01-01', '2026-06-30');
  assert.doesNotThrow(() => curveOf(bad), 'урвуу муж тооцоог унагааж болохгүй');
}

/* ── 7. `computeAll` ба `planCurve` НЭГ тоо өгнө ──
   ⚠️ Хоёр функц ижил дүрэмтэй байх ёстой (`bagtsSheet`-ийн толгойн ⚠️). */
{
  const rows = sheet('2026-01-01', '2026-06-30', '2026-07-01', '2026-12-31');
  const asOf = D('2026-06-30');
  const c1 = computeAll(rows, 1, asOf, {}, {}, [false])[0].plan[0];
  const c2 = planCurve(rows, 1, [asOf])[0][0];
  assert.equal(Math.round((c1 ?? 0) * 1e6), Math.round((c2 ?? 0) * 1e6),
    `computeAll ${c1} ≠ planCurve ${c2} — хоёр дүрэм салсан`);
}

console.log('planCurveShape.check: ok — хуваарь дагана ✓ бүлэг ✓ хуваарьгүй=0 ✓ хилийн тохиолдол ✓ computeAll≡planCurve ✓');
