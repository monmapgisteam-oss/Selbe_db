/**
 * САНХҮҮЖИЛТИЙН КАРТЫН ӨГӨГДЛИЙН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/finCard.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. `null` ≠ `0` ХОЁР ТАЛААР. Бүх мөр хоосон талбарын НИЙТ нь `null` —
 *      0 гэж бичвэл «дүнгүй» ба «тэг» нэгдэж НИЙТ мөр худал уншигдана
 *      (2026-09-04-ний I30 алдааны хэлбэр). Эсрэгээр БОДИТ `0` нь `null`
 *      БОЛЖ ХУВИРАХГҮЙ — жинхэнэ тэг төлбөр бол хэмжилт мөн.
 *   2. ҮНДСЭН БАГАНА ДАВХАРДАХ эсвэл хоосон нэртэй болох.
 *   3. ГРЕЙНИЙ ЭРСДЭЛ. Үндсэн баганад ГЭРЭЭНИЙ ТОМ ДҮН (`tosov_niit` г.м.)
 *      орвол хэрэглэгч 7 мөрд давтагдсан тоог хараад нийлүүлэх уруу
 *      таталтад орно — тэдгээр зөвхөн дэлгэрэнгүйд байх ёстой.
 */
import assert from 'node:assert/strict';
import { sumOrNull, HO_MAIN_FIELDS } from './finCard.ts';
import { HO_IPC, hoAmount } from './services.ts';

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;

/* ── 1. sumOrNull — null ≠ 0 ── */
{
  assert.equal(sumOrNull([{ a: 100 }, { a: null }, { a: 200 }], 'a'), 300);
  assert.equal(sumOrNull([{ a: null }, { a: '' }], 'a'), null, 'бүгд хоосон → null, 0 БИШ');
  assert.equal(sumOrNull([{ a: 0 }], 'a'), 0, 'бодит 0 нь 0 хэвээр');
  assert.equal(sumOrNull([], 'a'), null);
  assert.equal(sumOrNull([{ a: 'мөр' }, { a: 5 }], 'a'), 5, 'тоо бус утга алгасагдана');
}

/* ── 2. hoAmount — `null ≠ 0` ХОЁР ТАЛ ── */
{
  assert.equal(hoAmount({ [P.amount]: 1_000 }), 1_000);
  assert.equal(hoAmount({ [P.amount]: '2500.5' }), 2500.5, 'мөр хэлбэрийн тоо уншигдана');
  assert.equal(hoAmount({ [P.amount]: null }), null, 'хоосон → null');
  assert.equal(hoAmount({ [P.amount]: '' }), null, 'хоосон мөр → null');
  assert.equal(hoAmount({}), null, 'талбар огт байхгүй → null');
  assert.equal(hoAmount({ [P.amount]: 'тайлбар' }), null, 'тоо бус → null');
  assert.equal(hoAmount({ [P.amount]: 0 }), 0, 'бодит 0 нь null БИШ');
}

/* ── 3. sumOrNull нь төлбөрийн мөр дээр — хоосон мөр нийлбэрийг ТАТАХГҮЙ ── */
{
  const pays = [
    { [P.amount]: 10_000 },
    { [P.amount]: null },   // БАГЦ-6.3 хэлбэр: төлбөр бүртгэгдээгүй
    { [P.amount]: 20_000 },
  ];
  assert.equal(sumOrNull(pays, P.amount), 30_000, 'хоосон мөр 0 болж нийлбэрийг доош татахгүй');
  assert.equal(sumOrNull([{ [P.amount]: null }], P.amount), null, 'бүхэлдээ төлбөргүй гэрээ → null');
}

/* ── 4. Үндсэн баганууд ДАВХАРДААГҮЙ, бүгд бодит талбарын нэр ── */
{
  assert.equal(new Set(HO_MAIN_FIELDS).size, HO_MAIN_FIELDS.length, 'багана ДАВХАРДААГҮЙ');
  for (const n of HO_MAIN_FIELDS) assert.ok(typeof n === 'string' && n !== '', 'багананы нэр хоосон биш');
}

/* ── 5. ГРЕЙН — гэрээний ТОМ ДҮН үндсэн баганад ОРООГҮЙ ── */
{
  for (const f of [C.budgetTotal, C.contractTotal, C.saving,
    C.budgetBond, C.budgetCity, C.budgetSales,
    C.contractBond, C.contractCity, C.contractSales]) {
    assert.ok(!HO_MAIN_FIELDS.includes(f),
      `гэрээний түвшний ${f} үндсэн баганад ОРОХГҮЙ — 7 мөрд давтагдана`);
  }
  /* Төлбөрийн түвшний талбарууд харин ЗААВАЛ байна — мөнгөний зам */
  assert.ok(HO_MAIN_FIELDS.includes(P.amount), 'олгосон дүн үндсэн баганад байна');
  assert.ok(HO_MAIN_FIELDS.includes(P.kind), 'төлбөрийн төрөл үндсэн баганад байна');
  /* Гэрээний КОД нь ганцаарчилсан үл хамаарах зүйл: тоо БИШ, ТАНИГЧ —
     хэрэглэгч аль гэрээний төлбөр болохыг харах ёстой. */
  assert.ok(HO_MAIN_FIELDS.includes(C.code), 'гэрээний код үндсэн баганад байна');
}

/* ── 6. МЭДЭЭЛЭЛГҮЙ талбарууд үндсэн баганад ОРООГҮЙ ── */
{
  for (const f of HO_IPC.emptyFields) {
    assert.ok(!HO_MAIN_FIELDS.includes(f), `${f} нь 45/45 мэдээлэлгүй — багана болгохгүй`);
  }
}

console.log('finCard.check.mjs — БҮГД ТЭНЦЛЭЭ');
