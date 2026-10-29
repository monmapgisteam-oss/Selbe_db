/**
 * МОНГОЛ · ГАДААД ЗАДАРГАА — шалгуур (2026-10-21, аудит).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/habeaMix.check.mjs
 *
 * Хамгаалж буй алдаа:
 *  1. Нэг компани задаргаа бөглөхөд задаргаагүй (ажилтантай) компанийн хүн хоёр муруйгаас алга
 *     болж, «Нийт» муруй тэр өдөр null → худал «уналт».
 *  2. Задаргаагүй өдөр 0 гэж зурагдах (цоорхой байх ёстой; задаргаа огт байхгүй бол null).
 *  3. Сарын зарим өдөр задаргаагүй бол сар задаргаатай гэж тоологдох.
 *  4. Зөвхөн техниктэй (ажилтангүй) компани задаргааг хаах; сонгосон компанийн шүүлт үл хамаарах.
 */
import assert from 'node:assert/strict';
import { mixByDay, mixByMonth, mixLines } from './habeaMix.ts';
import { laborCompanyFields } from '@/lib/services';
import { ubDayKey } from '@/lib/ceo/workforce';

const MK = laborCompanyFields('MK');
const NBG = laborCompanyFields('NBG');
const day = (iso) => Date.parse(`${iso}T12:00:00+08:00`);
const key = (iso) => ubDayKey(day(iso));

/* 1. Бүх тайлан өгсөн компани задаргаатай → өдөр задаргаатай */
{
  const full = { ognoo: day('2026-09-01'), [MK.niitAjiltan]: 10, [MK.mongol]: 7, [MK.gadaad]: 3, [NBG.niitAjiltan]: 5, [NBG.mongol]: 5 };
  const mix = mixByDay([full], null);
  assert.deepEqual(mix.get(key('2026-09-01')), { mongol: 12, gadaad: 3 });
}

/* 2. Нэг компани задаргаагүй (ажилтантай) → өдөр ЗАДАРГААГҮЙ (Map-д орохгүй) — Нийт муруйд үлдэнэ */
{
  const part = { ognoo: day('2026-09-02'), [MK.niitAjiltan]: 10, [MK.mongol]: 7, [MK.gadaad]: 3, [NBG.niitAjiltan]: 5 };
  const mix = mixByDay([part], null);
  assert.equal(mix.has(key('2026-09-02')), false, 'НБГ задаргаагүй → тэр өдөр хоёр муруйгаар зурахгүй (НБГ-ийн 5 хүн алга болохгүй)');
  /* Зөвхөн МК-г сонгосон бол НБГ хамаарахгүй → задаргаатай */
  assert.deepEqual(mixByDay([part], ['MK']).get(key('2026-09-02')), { mongol: 7, gadaad: 3 });
  /* Задаргаагүй компанийн ажилтан монгол+гадаад-аар нөхөгдсөн (Niit 0, m/g бий) → задаргаатай */
  const viaSplit = { ognoo: day('2026-09-03'), [MK.niitAjiltan]: 10, [MK.mongol]: 7, [MK.gadaad]: 3, [NBG.niitAjiltan]: 0, [NBG.mongol]: 4, [NBG.gadaad]: 1 };
  assert.deepEqual(mixByDay([viaSplit], null).get(key('2026-09-03')), { mongol: 11, gadaad: 4 });
}

/* 3. Зөвхөн техниктэй компани (ажилтангүй) задаргаа шаардахгүй; тайлан өгөөгүй компани алгасна */
{
  const r = { ognoo: day('2026-09-04'), [MK.niitAjiltan]: 10, [MK.mongol]: 7, [MK.gadaad]: 3, [NBG.niitAjiltan]: 0, [NBG.niitTehnik]: 2 };
  assert.deepEqual(mixByDay([r], null).get(key('2026-09-04')), { mongol: 7, gadaad: 3 });
  const none = { ognoo: day('2026-09-05'), [MK.niitAjiltan]: 10, [NBG.niitAjiltan]: 0 };
  assert.equal(mixByDay([none], null).size, 0, 'задаргаа огт байхгүй → хоосон');
  assert.equal(mixByDay([{ [MK.niitAjiltan]: 10, [MK.mongol]: 10 }], null).size, 0, 'огноогүй мөр орохгүй');
}

/* 4. mixLines — задаргаатай өдөр Монгол·Гадаад, задаргаагүй өдөр Нийт; огт байхгүй бол null */
{
  const items = [
    { key: key('2026-09-01'), value: 15 },
    { key: key('2026-09-02'), value: 15 },
  ];
  const mix = new Map([[key('2026-09-01'), { mongol: 12, gadaad: 3 }]]);
  const lines = mixLines(items, mix);
  assert.deepEqual(lines.map((l) => l.key), ['all', 'mn', 'fr']);
  assert.deepEqual(lines[0].values, [null, 15], 'Нийт — зөвхөн задаргаагүй өдөр');
  assert.deepEqual(lines[1].values, [12, null]);
  assert.deepEqual(lines[2].values, [3, null]);
  assert.equal(mixLines(items, new Map()), null, 'задаргаа байхгүй → null (нэг муруй)');
  assert.equal(mixLines([{ key: key('2026-09-09'), value: 1 }], mix), null, 'цувааны өдрүүдэд задаргаа алга → null');
  const allSplit = mixLines([items[0]], mix);
  assert.deepEqual(allSplit.map((l) => l.key), ['mn', 'fr'], 'бүх өдөр задаргаатай → Нийт муруй байхгүй');
}

/* 5. mixByMonth — зарим өдөр задаргаагүй сар орохгүй */
{
  const mix = new Map([
    [key('2026-09-01'), { mongol: 12, gadaad: 3 }],
    [key('2026-09-02'), { mongol: 10, gadaad: 5 }],
    [key('2026-10-01'), { mongol: 1, gadaad: 1 }],
  ]);
  const days = [{ key: key('2026-09-01') }, { key: key('2026-09-02') }, { key: key('2026-10-01') }, { key: key('2026-10-02') }];
  const m = mixByMonth(mix, days);
  assert.deepEqual(m.get('2026-09'), { mongol: 22, gadaad: 8 });
  assert.equal(m.has('2026-10'), false, '10-02 задаргаагүй → сар бүхэлдээ Нийт');
}

console.log('habeaMix.check: OK');
