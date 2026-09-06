/**
 * АКТЫН КАРТЫН ӨГӨГДЛИЙН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/finCard.check.mjs
 *
 * ⚠️ 2026-09-06: CASHFLOW-ийн шалгуурууд (паспорт/хуваарь салгалт, он дотроо
 * сар сараар бүлэглэлт, паспортын талбарын бүрэн хамрал) ХАСАГДСАН. Тэдгээр нь
 * хуучин `cashflow_0813`-ийн ГЭРЭЭ/САР/ӨМНӨХ ШИЛЖҮҮЛСЭН гэсэн гурван грейн
 * дээр тогтдог байсан бөгөөд тэр үйлчилгээ бүрмөсөн хаягдсан. Шинэ
 * `Cashflow_0904`-т мөр БҮР нэг гэрээ тул салгах юм байхгүй.
 *
 * Хамгаалж буй алдаанууд:
 *   1. `null` ≠ `0`. Бүх мөр хоосон талбарын НИЙТ нь `null` — 0 гэж бичвэл
 *      «дүнгүй» ба «тэг» нэгдэж НИЙТ мөр худал уншигдана. Мөн дүнгүй актын
 *      цэвэр дүн `null`.
 *      ⚠️ `netOrNull` нь `services.ipcNet`-тэй тоон үр дүнгээрээ ИЖИЛ; энд
 *      тусдаа байгаа шалтгаан нь зөвхөн `services`-ийн ArcGIS хамаарлыг Node
 *      шалгуурт татахгүй байх явдал.
 *   2. ТАЛБАРЫН БҮРТГЭЛ ЗӨРӨХ. IPC-ийн үндсэн баганууд толинд байх ёстой —
 *      эс бөгөөс багана чимээгүй хоосорно.
 *   3. Бодогдох талбар үндсэн баганад ДАВХАРДАХ (суутгал хоёр удаа гарах).
 */
import assert from 'node:assert/strict';
import {
  sumOrNull, IPC_MAIN_FIELDS, dedOrNull, paidOrNull, netOrNull, netTotalOrNull,
} from './finCard.ts';
import { IPC_LOG } from './services.ts';
import { FIN_FIELD_LABELS } from './financeFieldLabels.ts';

const IP = IPC_LOG.fields;

/* ── 1. sumOrNull — null ≠ 0 ── */
{
  assert.equal(sumOrNull([{ a: 100 }, { a: null }, { a: 200 }], 'a'), 300);
  assert.equal(sumOrNull([{ a: null }, { a: '' }], 'a'), null, 'бүгд хоосон → null, 0 БИШ');
  assert.equal(sumOrNull([{ a: 0 }], 'a'), 0, 'бодит 0 нь 0 хэвээр');
  assert.equal(sumOrNull([], 'a'), null);
  assert.equal(sumOrNull([{ a: 'мөр' }, { a: 5 }], 'a'), 5, 'тоо бус утга алгасагдана');
}

/* ── 2. IPC — суутгал · цэвэр · шилжүүлсэн null-ухаантай ── */
{
  const act = {
    [IP.gross]: 1000,
    [IP.clientDeduct]: 50, [IP.advanceRecovery]: 100, [IP.retention]: 30, [IP.authorDeduct]: 20,
    [IP.paid]: 400, [IP.paid2]: 200,
  };
  assert.equal(dedOrNull(act), 200);
  assert.equal(netOrNull(act), 800);
  assert.equal(paidOrNull(act), 600);

  const empty = { [IP.gross]: null };
  assert.equal(dedOrNull(empty), null, 'суутгалгүй → null (0 БИШ)');
  assert.equal(netOrNull(empty), null, 'дүнгүй актын цэвэр нь null');
  assert.equal(paidOrNull(empty), null);

  assert.equal(netOrNull({ [IP.gross]: 500 }), 500, 'суутгал хоосон бол цэвэр = бүтэн');
  assert.equal(netTotalOrNull([act, empty]), 800, 'дүнгүй акт нийтэд орохгүй');
  assert.equal(netTotalOrNull([empty]), null);

  /* ⚠️ АМЬД ӨГӨГДЛИЙН ЗАНГА (I30 акт): дүн хоосон атлаа СУУТГАЛТАЙ. `?? 0`
     хийвэл −2,072,616,655 ₮ гэсэн хуурамч сөрөг олголт үүсдэг байв. */
  const onlyDeduct = { [IP.gross]: null, [IP.advanceRecovery]: 2_072_616_655 };
  assert.equal(netOrNull(onlyDeduct), null, 'дүнгүй атлаа суутгалтай акт → null, СӨРӨГ БИШ');
  assert.equal(netTotalOrNull([act, onlyDeduct]), 800, 'сөрөг утга нийтийг ТАТАХГҮЙ');
}

/* ── 3. IPC-ийн үндсэн баганууд толинд байгаа, тооцоологдох талбар давхардаагүй ── */
{
  for (const n of IPC_MAIN_FIELDS) {
    assert.ok(n in FIN_FIELD_LABELS, `IPC баганын талбар ${n} толинд алга`);
  }
  for (const d of IPC_LOG.deductions) {
    assert.ok(!IPC_MAIN_FIELDS.includes(d), 'суутгалын талбар үндсэн баганад давхардахгүй — бодогдсон нийлбэр нь тэнд');
  }
  for (const p of IPC_LOG.payments) {
    assert.ok(!IPC_MAIN_FIELDS.includes(p), 'гүйлгээний талбар үндсэн баганад давхардахгүй');
  }
}

console.log('finCard.check.mjs — БҮГД ТЭНЦЛЭЭ');
