/**
 * ГҮЙЦЭТГЭЛЭЭС IPC ҮҮСГЭХ ЛОГИКИЙН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ipcAuto.check.mjs
 *
 * Хамгаалж буй БОДИТ алдаанууд:
 *   1. НЭГ АГШИНД ОЛОН МӨР ҮҮСЭХ. Ижил өдрийн бөглөлт дахин батлагдвал
 *      (буцаагдаад дахин илгээгдсэн) хоёр дахь мөр үүсгэвэл тэр агшны
 *      гүйцэтгэл ХОЁР ДАХИН тоологдоно. Нэг багц · нэг агшин = НЭГ мөр.
 *   2. ГАРААР ОРУУЛСАН МӨРИЙГ ДАРЖ БИЧИХ. Санхүүгийн газрын бодит
 *      гүйлгээний баримтыг автомат бичилт УСТГАХ ЁСГҮЙ.
 *   3. `dun`-Д БИЧИХ. Обьёмоос бодсон дүнг «олгосон» гэж бичвэл хийгдээгүй
 *      төлбөр нийлбэрт орж, `sumPaid()` ХУДАЛ болно.
 *   4. ХООСОН БӨГЛӨЛТӨӨС МӨР ҮҮСЭХ. «Энэ агшинд гүйцэтгэл 0» гэсэн худал
 *      бичлэг үлдэнэ (`null ≠ 0`).
 *   5. ДИАПАЗОН БАГЦ буруу эзэнд наалдах («Багц-1-4» → «БАГЦ14»).
 *   6. ЗӨРҮҮГ 0 БОЛГОХ. `dun` хараахан бичигдээгүй үед зөрүү `null` байх
 *      ёстой — `0` нь «таарсан» гэсэн ХУДАЛ мэдэгдэл.
 *   7. `geree_kod` ХООСОН ҮЛДЭХ (2026-09-10-нд АМЬДААР ГАРСАН). Кодгүй
 *      мөрийг `groupHo` нь КОДГҮЙ гэрээ (ХО-0045)-тэй нэг бүлэгт оруулж,
 *      Багц 3.3-ын гүйцэтгэл ӨӨР багцын картад харагдав; тэр гэрээ 1
 *      төлбөрөөс 8 болов.
 */
import assert from 'node:assert/strict';
import {
  dayOf, isAuto, autoDay, autoId, findAutoRow,
  autoInsert, autoUpdate, planAuto, contractCodeOf, AUTO_PREFIX,
} from './ipcAuto.ts';
import { LINK_FIELDS } from './ipcLink.ts';
import { HO_IPC, pkgKeyOf } from './services.ts';

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;

/* ══ 1. dayOf ══ */
{
  assert.equal(dayOf('2026-09-09'), '2026-09-09');
  assert.equal(dayOf('2026-09-09T10:00:00Z'), '2026-09-09', 'цаг таслагдана');
  /* ⚠️ Сар дангаараа ХҮРЭХГҮЙ — өдөр шаардана */
  assert.equal(dayOf('2026-09'), null, '⚠️ бүтэн огноо шаардана');
  assert.equal(dayOf('хог'), null);
  assert.equal(dayOf(''), null);
}

/* ══ 2. autoId · isAuto · autoDay ══ */
{
  const id = autoId('БАГЦ33', '2026-09-09');
  assert.equal(id, `${AUTO_PREFIX}БАГЦ33|2026-09-09`);
  assert.equal(isAuto({ [P.id]: id }), true);
  assert.equal(autoDay({ [P.id]: id }), '2026-09-09');

  /* ⚠️ №2 — ГАРААР оруулсан мөр автомат БИШ */
  assert.equal(isAuto({ [P.id]: 'ХО-0001' }), false, '⚠️ гараар оруулсан мөр');
  assert.equal(isAuto({}), false, 'ID-гүй мөр');
  assert.equal(autoDay({ [P.id]: 'ХО-0001' }), null);
}

/* ══ 3. findAutoRow — ⚠️ №2 ба №5 ══ */
{
  const rows = [
    { [P.id]: 'ХО-0015', [C.pkg]: 'Багц-3.3' },                          // гараар
    { [P.id]: autoId('БАГЦ33', '2026-09-03'), [C.pkg]: 'Багц-3.3' },     // өөр агшин
    { [P.id]: autoId('БАГЦ33', '2026-09-09'), [C.pkg]: 'Багц-3.3' },     // ЭНЭ
    { [P.id]: autoId('БАГЦ2', '2026-09-09'), [C.pkg]: 'Багц-2' },        // өөр багц
  ];
  const hit = findAutoRow(rows, 'БАГЦ33', '2026-09-09');
  assert.equal(hit[P.id], autoId('БАГЦ33', '2026-09-09'), 'зөв мөр олдов');

  /* ⚠️ ИЖИЛ САРЫН ӨӨР ӨДӨР нь ӨӨР мөр — нэгтгэгдэхгүй */
  const other = findAutoRow(rows, 'БАГЦ33', '2026-09-03');
  assert.equal(other[P.id], autoId('БАГЦ33', '2026-09-03'),
    '⚠️ ижил сарын өөр агшин тусдаа мөр');

  assert.equal(findAutoRow(rows, 'БАГЦ33', '2026-09-30'), null, 'байхгүй агшин');
  assert.equal(findAutoRow(rows, '', '2026-09-09'), null, 'багцгүй');
  /* ⚠️ №2 — гараар оруулсан мөр ХЭЗЭЭ Ч олдохгүй */
  const manual = [{ [P.id]: 'ХО-0015', [C.pkg]: 'Багц-3.3' }];
  assert.equal(findAutoRow(manual, 'БАГЦ33', '2026-09-09'), null,
    '⚠️ гараар оруулсан мөрийг ОЛОХГҮЙ — дарж бичихгүй');
}

/* ══ 4. autoInsert — ⚠️ №3 `dun`-д БИЧИХГҮЙ ══ */
{
  const a = autoInsert({ pkg: 'Багц-3.3', code: 'Багц-3.3', day: '2026-09-09', obyem: 1234, une: 9.5e9 });
  assert.equal(a[C.pkg], 'Багц-3.3');
  assert.equal(a[P.id], autoId('БАГЦ33', '2026-09-09'));
  assert.equal(a[P.kind], HO_IPC.kinds.work, 'төрөл = Гүйцэтгэл');
  assert.equal(a[P.year], 2026);
  assert.equal(a[LINK_FIELDS.obyem], 1234);
  assert.equal(a[LINK_FIELDS.une], 9.5e9);

  /* ⚠️ ОГНОО — гүйцэтгэл батлагдсан огноо. `DateOnly` тул `YYYY-MM-DD`
     МӨР (epoch ms БИШ) — амьдаар одоо байгаа мөрүүд ингэж хадгалагдсан. */
  assert.equal(a[P.payDate], '2026-09-09', '⚠️ огноо ЗААВАЛ бичигдэнэ');
  assert.equal(typeof a[P.payDate], 'string', '⚠️ epoch тоо БИШ, мөр');

  /* ⚠️ №3 — БОДИТ гүйлгээний ДҮН ОРООГҮЙ */
  assert.ok(!(P.amount in a), '⚠️ `dun`-д БИЧИХГҮЙ — олгосон гэж худлаа тоологдоно');
  assert.ok(!(P.ipcNo in a), '⚠️ IPC дугаар ОРОХГҮЙ — санхүү нөхнө');
  assert.ok(!(C.order1No in a), '⚠️ захирамж ОРОХГҮЙ');
  assert.ok(!(C.contractTotal in a), '⚠️ гэрээний төсөв ОРОХГҮЙ');

  /* ⚠️ №6 — зөрүү `null` (dun хоосон тул) */
  assert.equal(a[LINK_FIELDS.zoruu], null, '⚠️ 0 БИШ');
}

/* ══ 5. autoUpdate — зөрүү бодогдоно ══ */
{
  const cur = { [HO_IPC.oid]: 77, [P.amount]: 10e9, [P.id]: autoId('БАГЦ33', '2026-09-09') };
  const u = autoUpdate(cur, { pkg: 'Багц-3.3', code: 'Багц-3.3', day: '2026-09-09', obyem: 500, une: 9e9 });
  assert.equal(u[HO_IPC.oid], 77, 'OID түлхүүр');
  assert.equal(u[LINK_FIELDS.obyem], 500);
  assert.equal(u[LINK_FIELDS.une], 9e9);
  assert.equal(u[LINK_FIELDS.zoruu], 1e9, '10 − 9 = 1 тэрбум илүү олгосон');

  /* ⚠️ Багц/ID/төрөл ӨӨРЧЛӨГДӨХГҮЙ — гараар зассан утга дарагдахгүй */
  assert.ok(!(C.pkg in u), '⚠️ багц дахин бичигдэхгүй');
  assert.ok(!(P.id in u), '⚠️ ID дахин бичигдэхгүй');
  assert.ok(!(P.amount in u), '⚠️ `dun` дахин бичигдэхгүй');

  /* ⚠️ №6 — `dun` хоосон бол зөрүү `null` */
  const noDun = autoUpdate({ [HO_IPC.oid]: 78 }, {
    pkg: 'Багц-3.3', code: 'Багц-3.3', day: '2026-09-09', obyem: 500, une: 9e9,
  });
  assert.equal(noDun[LINK_FIELDS.zoruu], null, '⚠️ 0 БИШ — төлөгдөөгүй');
  /* Мөнгөн дүн хэмжигдээгүй бол ч `null` */
  const noUne = autoUpdate({ [HO_IPC.oid]: 79, [P.amount]: 10e9 }, {
    pkg: 'Багц-3.3', code: 'Багц-3.3', day: '2026-09-09', obyem: 500, une: null,
  });
  assert.equal(noUne[LINK_FIELDS.zoruu], null, '⚠️ нэгж өртөггүй → зөрүүгүй');
}

/* ══ 6. planAuto — ⚠️ №1 агшинд НЭГ мөр ══ */
{
  const a = { pkg: 'Багц-3.3', code: 'Багц-3.3', day: '2026-09-09', obyem: 500, une: 9e9 };

  /* Байхгүй бол НЭМНЭ */
  assert.equal(planAuto([], a).op, 'insert');

  /* ⚠️ №1 — ЯГ ИЖИЛ АГШИН байвал ШИНЭЧИЛНЭ, хоёр дахь мөр үүсгэхгүй */
  const rows = [{
    [HO_IPC.oid]: 77, [P.id]: autoId('БАГЦ33', '2026-09-09'), [C.pkg]: 'Багц-3.3',
  }];
  const p = planAuto(rows, a);
  assert.equal(p.op, 'update', '⚠️ INSERT БИШ — агшинд НЭГ мөр');
  assert.equal(p.attrs[HO_IPC.oid], 77);

  /* ⚠️ ГҮЙЦЭТГЭЛ ОРСОН БОЛГОНД ШИНЭ МӨР (хэрэглэгчийн засвар 2026-09-10):
     ижил сарын ӨӨР агшин нь ШИНЭ мөр — сард нэгтгэхгүй. */
  const next = planAuto(rows, { ...a, day: '2026-09-10' });
  assert.equal(next.op, 'insert', '⚠️ ижил сарын шинэ агшин → ШИНЭ мөр');
  assert.equal(next.attrs[P.id], autoId('БАГЦ33', '2026-09-10'));

  /* ⚠️ №2 — гараар оруулсан мөр байхад ч АВТОМАТ мөр тусад нь үүснэ */
  const manual = [{ [P.id]: 'ХО-0015', [C.pkg]: 'Багц-3.3', [P.ipcNo]: 1 }];
  assert.equal(planAuto(manual, a).op, 'insert',
    '⚠️ гараар оруулсныг дарахгүй, тусдаа автомат мөр');
}

/* ══ 6b. ⚠️ №7 — ГЭРЭЭНИЙ КОД (2026-09-10-ний бодит алдаа) ══ */
{
  /* `geree_kod` шинэ мөрд ЗААВАЛ бичигдэнэ */
  const ins = autoInsert({
    pkg: 'Багц-3.3', code: 'Багц-3.3', day: '2026-09-09', obyem: 1, une: 1,
  });
  assert.equal(ins[C.code], 'Багц-3.3', '⚠️ код БАЙХГҮЙ бол буруу бүлэгт очно');

  /* ⚠️ КОДГҮЙ бол ЮУ Ч ХИЙХГҮЙ — ХО-0045-тай нийлэхээс сэргийлнэ */
  const noCode = planAuto([], {
    pkg: 'Багц-3.3', code: '', day: '2026-09-09', obyem: 1, une: 1,
  });
  assert.equal(noCode.op, 'skip');
  assert.equal(noCode.why, 'no-code', '⚠️ кодгүй мөр ҮҮСГЭХГҮЙ');

  /* contractCodeOf — БАЙГАА мөрөөс код олно */
  const rows = [
    { [P.id]: 'ХО-0015', [C.pkg]: 'Багц-3.3', [C.code]: 'Багц-3.3' },
    { [P.id]: 'ХО-0045', [C.pkg]: '', [C.code]: '' },
  ];
  assert.equal(contractCodeOf(rows, 'БАГЦ33'), 'Багц-3.3');
  assert.equal(contractCodeOf(rows, 'БАГЦ99'), '', 'олдохгүй бол хоосон');
  assert.equal(contractCodeOf(rows, ''), '', 'багцгүй');

  /* ⚠️ КОДГҮЙ мөрөөс код АВАХГҮЙ — ХО-0045 нь «кодгүй гэрээ» */
  const empty = [{ [P.id]: 'ХО-0045', [C.pkg]: 'Багц-9', [C.code]: '' }];
  assert.equal(contractCodeOf(empty, pkgKeyOf('Багц-9')), '',
    '⚠️ кодгүй мөрөөс код авахгүй');

  /* ⚠️ АВТОМАТ мөрөөс код АВАХГҮЙ — анхны алдаа мөнхөрнө */
  const autoOnly = [{
    [P.id]: autoId('БАГЦ33', '2026-09-01'), [C.pkg]: 'Багц-3.3', [C.code]: 'БУРУУ',
  }];
  assert.equal(contractCodeOf(autoOnly, 'БАГЦ33'), '',
    '⚠️ автомат мөрөөс код авбал алдаа мөнхөрнө');
}

/* ══ 7. planAuto — алгасах тохиолдлууд ══ */
{
  const base = { pkg: 'Багц-3.3', code: 'Багц-3.3', day: '2026-09-09' };
  /* ⚠️ №4 — хэмжигдээгүй бол мөр ҮҮСГЭХГҮЙ */
  const s = planAuto([], { ...base, obyem: null, une: null });
  assert.equal(s.op, 'skip');
  assert.equal(s.why, 'no-data', '⚠️ хоосон бөглөлтөөс мөр үүсэхгүй');

  /* ⚠️ ЖИНХЭНЭ 0 нь ХЭМЖИГДСЭН — алгасахгүй (`null ≠ 0`) */
  assert.equal(planAuto([], { ...base, obyem: 0, une: 0 }).op, 'insert',
    '⚠️ жинхэнэ тэг гүйцэтгэл БИЧИГДЭНЭ');
  /* Аль нэг нь хэмжигдсэн байхад ч бичигдэнэ */
  assert.equal(planAuto([], { ...base, obyem: 500, une: null }).op, 'insert');

  /* ⚠️ №5 — ДИАПАЗОН багц: `pkgKeyOf` нь `''` буцаана → алгасана */
  const r = planAuto([], { pkg: 'Багц-1-4', code: 'Багц-1-4', day: '2026-09-09', obyem: 1, une: 1 });
  assert.equal(r.op, 'skip');
  assert.equal(r.why, 'no-pkg', '⚠️ диапазон багц буруу эзэнд наалдахгүй');

  /* ⚠️ Буруу огноо — САР дангаараа ч ХҮРЭХГҮЙ */
  assert.equal(planAuto([], { ...base, day: '2026-09', obyem: 1, une: 1 }).why, 'bad-day',
    '⚠️ сар дангаараа хүрэхгүй — бүтэн огноо шаардана');
  assert.equal(planAuto([], { ...base, day: '2026', obyem: 1, une: 1 }).why, 'bad-day');
  assert.equal(planAuto([], { ...base, day: '', obyem: 1, une: 1 }).why, 'bad-day');
}

console.log('ipcAuto.check ✓');
