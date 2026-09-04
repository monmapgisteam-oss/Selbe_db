/**
 * `chartFit.fitLabels` — графикийн тоон шошго МӨРГӨЛДӨХГҮЙ гэдгийн шалгуур.
 *
 * ⚠️ ЯАГААД ТЕСТТЭЙ ВЭ: 2026-09-03-нд «Санхүүжилтийн явц» график дээр
 * «305,106,471,202 305,106,471,202» гэж хоёр мөнгөн дүн дээр дээрээсээ
 * давхарлан бичигдэж байсныг хэрэглэгч дэлгэцийн зургаар мэдэгдсэн. Шалтгаан
 * нь шошгыг ТОГТМОЛ алхмаар (`ceil(N/8)`) сонгоод дээрээс нь сүүлийн цэгийг
 * албадан нэмдэг байсанд — хоёр зэргэлдээ цэг шошготой болно. Мөнгөн дүнг
 * товчлох нь хориотой тул шошгын ТООГ багтаамжаар нь хязгаарлаж шийдсэн.
 * Энэ шалгуур тэр зан буцаж ирэхээс хамгаална.
 */
import assert from 'node:assert';
import { fitLabels, textW } from './chartFit.ts';

let ok = 0;
const check = (name, cond) => { assert.ok(cond, name); ok += 1; };

const span = (s) => (s.anchor === 'start' ? [s.x, s.x + s.w]
  : s.anchor === 'end' ? [s.x - s.w, s.x] : [s.x - s.w / 2, s.x + s.w / 2]);

/** Үлдсэн шошгууд хоорондоо `gap`-аас ойртоогүй эсэх */
function collisions(spots, kept, gap = 8) {
  let bad = 0;
  for (let a = 0; a < kept.length - 1; a++) {
    const [, r1] = span(spots.find((s) => s.i === kept[a]));
    const [l2] = span(spots.find((s) => s.i === kept[a + 1]));
    if (r1 + gap > l2) bad += 1;
  }
  return bad;
}

const build = (vals, W, fontPx = 10) => {
  const N = vals.length;
  const padL = Math.round(textW(vals.reduce((a, b) => (b.length > a.length ? b : a))) + 16);
  const plotW = W - padL - 30;
  return vals.map((v, i) => ({
    i,
    x: padL + (i / (N - 1)) * plotW,
    w: textW(v, fontPx),
    anchor: i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle',
  }));
};

/* ── 1. Хэрэглэгчийн мэдээлсэн ЯГ тохиолдол — 12 сар × 15 оронтой дүн ── */
{
  const vals = Array.from({ length: 12 }, () => '305,106,471,202');
  const spots = build(vals, 1300);
  const kept = fitLabels(spots);
  check('давхцал алга', collisions(spots, kept) === 0);
  check('эхлэл үлдсэн', kept.includes(0));
  check('төгсгөл үлдсэн', kept.includes(11));
  check('шошго үлдсэн (зөвхөн төгсгөл БИШ)', kept.length >= 3);
  /* Хуучин дүрэм давхцалтай байсныг баталгаажуулна — регрессийн лавлагаа */
  const step = Math.max(1, Math.ceil(12 / 8));
  const old = [...Array(12).keys()].filter((i) => i === 0 || i === 11 || i % step === 0);
  check('хуучин алхмын дүрэм ДАВХЦАЛТАЙ байсан', collisions(spots, old) > 0);
}

/* ── 2. МАШ нарийн цонх — зөвхөн хоёр зах үлдэнэ, гэхдээ хоосон болохгүй ── */
{
  const vals = Array.from({ length: 12 }, () => '1,176,410,780,272');
  const spots = build(vals, 420);
  const kept = fitLabels(spots);
  check('нарийн цонхонд ч давхцалгүй', collisions(spots, kept) === 0);
  check('нарийн цонхонд ч төгсгөл үлдэнэ', kept.includes(11));
  check('нарийн цонхонд шошго цөөрсөн', kept.length < 12);
}

/* ── 3. Богино шошго (хувь) — БҮГД багтана ── */
{
  const vals = ['10%', '15%', '25%', '25%', '25%', '27%', '28%', '30%', '38%', '55%', '79%', '100%'];
  const spots = build(vals, 1300);
  const kept = fitLabels(spots);
  check('богино шошго бүгд багтав', kept.length === 12);
  check('богино шошго давхцалгүй', collisions(spots, kept) === 0);
}

/* ── 4. Хязгаарын тохиолдлууд ── */
{
  check('хоосон', fitLabels([]).length === 0);
  const one = [{ i: 0, x: 10, w: 50, anchor: 'start' }];
  check('ганц шошго үргэлж үлдэнэ', fitLabels(one).length === 1);
  /* Хоёр зах нь бие биедээ мөргөлдвөл ТӨГСГӨЛ давамгайлна */
  const two = [
    { i: 0, x: 100, w: 200, anchor: 'start' },
    { i: 1, x: 150, w: 200, anchor: 'end' },
  ];
  const k2 = fitLabels(two);
  check('мөргөлдсөн хоёр захаас төгсгөл үлдэнэ', k2.length === 1 && k2[0] === 1);
  /* Буцаах дараалал ӨСӨХ — дуудагч `Set`-д хийдэг ч дараалал нь тодорхой байх ёстой */
  const sorted = fitLabels(build(['1', '2', '3', '4', '5'], 800));
  check('өсөх дарааллаар', sorted.every((v, i) => i === 0 || v > sorted[i - 1]));
}

/* ── 5. textW — tabular тоо шугаман ── */
{
  check('textW шугаман', Math.abs(textW('12345678', 10) - textW('1234', 10) * 2) < 0.001);
  check('textW фонтоос хамаарна', textW('123', 11) > textW('123', 10));
}

console.log(`chartFit.check: ok — ${ok} шалгуур · шошгын давхцал ✓ хоёр зах ✓ нарийн цонх ✓`);
