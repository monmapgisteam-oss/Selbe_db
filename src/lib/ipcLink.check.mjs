/**
 * IPC ↔ ГҮЙЦЭТГЭЛИЙН ХОЛБООСЫН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ipcLink.check.mjs
 *
 * Хамгаалж буй БОДИТ алдаанууд:
 *   1. `null` → `0` ДАРАГДАХ. Түүхэн 22 IPC-д архив БАЙХГҮЙ (төлбөр
 *      2026-03…08, архив 2026-09-03-аас). Тэдгээрт `0` бичвэл «зөрүү 0 =
 *      төгс таарсан» гэсэн ХУДАЛ мэдэгдэл болно.
 *   2. НЭМЭГДЛИЙГ ХУРИМТЛАЛТАЙ ЖИШИХ. `dun` нь нэмэгдэл, обьём нь
 *      хуримтлагдсан. Шууд жишвэл зөрүү бүр IPC-д асар их сөрөг гарна.
 *   3. УРЬДЧИЛГААГ АЖИЛТАЙ ЖИШИХ. Урьдчилгаа нь ирээдүйн ажлын өмнөх
 *      төлбөр — обьёмтой жишвэл үргэлж «хэтэрсэн» гэж гарна.
 *   4. ХОЙШХИ АГШИН СОНГОХ. Төлбөрийн ДАРАА бөглөсөн ажил тэр төлбөрт
 *      тоологдвол зөрүү зохиомлоор багасна.
 *   5. БҮЛГИЙН МӨР ДАХИН ТООЛОГДОХ — хүүхдүүд нь хоёр дахин орно.
 *   6. ХУУЧИРСАН УТГА ҮЛДЭХ. Холбогдоогүй мөрийг шинэчлэлтээс хасвал
 *      өмнөх ажиллагааны тоо серверт үлдэнэ.
 */
import assert from 'node:assert/strict';
import {
  snapshotOf, snapAt, linkContract, linkUpdates, linkSummary, LINK_FIELDS, payPkgKey,
} from './ipcLink.ts';
import { HO_IPC } from './services.ts';

const P = HO_IPC.payFields;
const C = HO_IPC.contractFields;
const { advance, work } = HO_IPC.kinds;

/** Төлбөрийн мөр */
const pay = (oid, kind, dun, o = {}) => ({
  [HO_IPC.oid]: oid, [P.id]: `ХО-${String(oid).padStart(4, '0')}`,
  [P.kind]: kind, [P.amount]: dun, ...o,
});
/** `guilgee_ognoo` нь тестэд шууд `YYYY-MM-DD` мөр */
const dayOf = (v) => (typeof v === 'string' && v ? v : null);

/* ══ 1. snapshotOf — навч мөрөөр, нэгж өртөггүйг ялгаж ══ */
{
  const s = snapshotOf([
    { unit: 100, obyem: [2, 3] },        // 5 × 100 = 500
    { unit: 10, obyem: [1, null] },      // 1 × 10  =  10
  ], '2026-09-03');
  assert.equal(s.obyem, 6, 'обьём нийлбэр');
  assert.equal(s.une, 510, 'мөнгөн дүн');
  assert.equal(s.day, '2026-09-03');
}
{
  /* ⚠️ №5 — БҮЛГИЙН мөр АЛГАСАГДАНА, эс тэгвээс хүүхдээ дахин тоолно */
  const leaves = [{ unit: 100, obyem: [2] }, { unit: 100, obyem: [3] }];
  const withGroup = [{ group: true, unit: 100, obyem: [5] }, ...leaves];
  assert.equal(snapshotOf(leaves, 'd').une, 500);
  assert.equal(snapshotOf(withGroup, 'd').une, 500, '⚠️ 1000 БИШ — бүлэг тоологдохгүй');
}
{
  /* ⚠️ №1 — бөглөгдөөгүй бол `null`, `0` БИШ */
  const s = snapshotOf([{ unit: 100, obyem: [null, null] }], 'd');
  assert.equal(s.obyem, null, '⚠️ 0 БИШ — бөглөгдөөгүй');
  assert.equal(s.une, null, '⚠️ 0 БИШ');
  /* ЖИНХЭНЭ тэг бөглөлт нь `null` БИШ — `null ≠ 0` дүрмийн НӨГӨӨ ТАЛ */
  const z = snapshotOf([{ unit: 100, obyem: [0] }], 'd');
  assert.equal(z.obyem, 0, 'жинхэнэ 0 бөглөлт хадгалагдана');
  assert.equal(z.une, 0);
}
{
  /* Нэгж өртөггүй мөр — обьёмд ОРНО, мөнгөнд ОРОХГҮЙ */
  const s = snapshotOf([{ unit: null, obyem: [7] }, { unit: 2, obyem: [3] }], 'd');
  assert.equal(s.obyem, 10, 'обьёмд орсон');
  assert.equal(s.une, 6, '⚠️ нэгж өртөггүй мөр мөнгөнд ОРОХГҮЙ');
  /* БҮГД нэгж өртөггүй бол мөнгө `null` */
  assert.equal(snapshotOf([{ unit: null, obyem: [7] }], 'd').une, null);
}

/* ══ 2. snapAt — ӨМНӨХ хамгийн сүүлийнх (⚠️ №4) ══ */
{
  const snaps = [
    { day: '2026-09-03', obyem: 1, une: 100 },
    { day: '2026-09-05', obyem: 2, une: 200 },
    { day: '2026-09-09', obyem: 3, une: 300 },
  ];
  assert.equal(snapAt(snaps, '2026-09-04').day, '2026-09-03', 'өмнөх сүүлийнх');
  assert.equal(snapAt(snaps, '2026-09-05').day, '2026-09-05', 'ЯГ тэр өдөр ОРНО');
  assert.equal(snapAt(snaps, '2026-09-30').day, '2026-09-09', 'бүгдээс хойш');
  assert.equal(snapAt(snaps, '2026-09-01'), null, '⚠️ ХОЙШХИ агшин авахгүй');
  assert.equal(snapAt([], '2026-09-04'), null, 'агшингүй');
}

/* ══ 3. linkContract — ХУРИМТЛАЛААР жишнэ (⚠️ №2) ══ */
{
  const snaps = [
    { day: '2026-09-03', obyem: 10, une: 1000 },
    { day: '2026-09-06', obyem: 25, une: 2500 },
  ];
  const pays = [
    pay(1, work, 900, { [P.ipcNo]: 1, [P.payDate]: '2026-09-04' }),
    pay(2, work, 800, { [P.ipcNo]: 2, [P.payDate]: '2026-09-07' }),
  ];
  const r = linkContract(pays, snaps, dayOf);
  assert.equal(r.length, 2);

  /* IPC-1: хуримтлал 900, агшин 2026-09-03 → 1000 → зөрүү −100 */
  assert.equal(r[0].reason, 'ok');
  assert.equal(r[0].une, 1000);
  assert.equal(r[0].obyem, 10);
  assert.equal(r[0].zoruu, -100, 'дутуу олгосон');

  /* ⚠️ IPC-2: хуримтлал 900+800 = 1700, агшин 2500 → зөрүү −800.
     НЭМЭГДЛЭЭР жишсэн бол 800 − 2500 = −1700 гэсэн ХУДАЛ тоо гарна. */
  assert.equal(r[1].une, 2500);
  assert.equal(r[1].zoruu, -800, '⚠️ −1700 БИШ — ХУРИМТЛАЛААР жишнэ');
}
{
  /* ⚠️ №3 — урьдчилгаа ХОЛБОГДОХГҮЙ, хуримтлалд ч ОРОХГҮЙ */
  const snaps = [{ day: '2026-09-03', obyem: 10, une: 1000 }];
  const pays = [
    pay(1, advance, 5000, { [P.payDate]: '2026-09-04' }),
    pay(2, work, 900, { [P.ipcNo]: 1, [P.payDate]: '2026-09-04' }),
  ];
  const r = linkContract(pays, snaps, dayOf);
  assert.equal(r[0].reason, 'not-work');
  assert.equal(r[0].zoruu, null, '⚠️ урьдчилгаа зөрүүгүй');
  assert.equal(r[0].une, null);
  assert.equal(r[1].zoruu, -100, '⚠️ 5000 урьдчилгаа хуримтлалд ОРООГҮЙ');
}
{
  /* ⚠️ №1 — АРХИВААС ӨМНӨХ төлбөр (түүхэн 22 IPC-ийн бодит нөхцөл) */
  const snaps = [{ day: '2026-09-03', obyem: 10, une: 1000 }];
  const r = linkContract(
    [pay(1, work, 900, { [P.ipcNo]: 1, [P.payDate]: '2026-08-26' })],
    snaps, dayOf,
  );
  assert.equal(r[0].reason, 'no-snapshot');
  assert.equal(r[0].zoruu, null, '⚠️ 0 БИШ — «таарсан» гэж ХУДЛААР уншигдана');
  assert.equal(r[0].une, null);
  assert.equal(r[0].obyem, null);
}
{
  /* Огноогүй мөр */
  const r = linkContract(
    [pay(1, work, 900, { [P.ipcNo]: 1, [P.payDate]: null })],
    [{ day: '2026-09-03', obyem: 10, une: 1000 }], dayOf,
  );
  assert.equal(r[0].reason, 'no-date');
  assert.equal(r[0].zoruu, null);
}
{
  /* Агшин олдсон ч нэгж өртөг бүхэлдээ дутуу — обьём лавлахаар үлдэнэ */
  const r = linkContract(
    [pay(1, work, 900, { [P.ipcNo]: 1, [P.payDate]: '2026-09-04' })],
    [{ day: '2026-09-03', obyem: 10, une: null }], dayOf,
  );
  assert.equal(r[0].reason, 'no-unit');
  assert.equal(r[0].obyem, 10, 'обьём лавлахаар үлдэнэ');
  assert.equal(r[0].une, null);
  assert.equal(r[0].zoruu, null);
}
{
  /* `dun` хоосон мөр — хуримтлалыг ТАСЛАХГҮЙ, өөрөө нь зөрүүгүй */
  const snaps = [{ day: '2026-09-03', obyem: 10, une: 1000 }];
  const pays = [
    pay(1, work, null, { [P.ipcNo]: 1, [P.payDate]: '2026-09-04' }),
    pay(2, work, 900, { [P.ipcNo]: 2, [P.payDate]: '2026-09-04' }),
  ];
  const r = linkContract(pays, snaps, dayOf);
  assert.equal(r[0].zoruu, null, 'дүнгүй мөрд хуримтлал БАЙХГҮЙ');
  assert.equal(r[1].zoruu, -100, 'дараагийнх нь 900-аас үргэлжилнэ');
}
{
  /* Эрэмбэ нь IPC ДУГААРААР — оролтын дараалал хамаагүй */
  const snaps = [{ day: '2026-09-03', obyem: 1, une: 100 }];
  const pays = [
    pay(2, work, 800, { [P.ipcNo]: 2, [P.payDate]: '2026-09-04' }),
    pay(1, work, 900, { [P.ipcNo]: 1, [P.payDate]: '2026-09-04' }),
  ];
  const r = linkContract(pays, snaps, dayOf);
  const byOid = new Map(r.map((x) => [x.oid, x]));
  assert.equal(byOid.get(1).zoruu, 900 - 100, 'IPC-1 хуримтлал 900');
  assert.equal(byOid.get(2).zoruu, 1700 - 100, 'IPC-2 хуримтлал 1700');
  /* Гаралтын дараалал нь ОРОЛТЫНХ — дуудагч тал OID-аар тааруулна */
  assert.deepEqual(r.map((x) => x.oid), [2, 1], 'оролтын дараалал хадгалагдана');
}

/* ══ 4. linkUpdates — ⚠️ №6 холбогдоогүй мөрийг ч бичнэ ══ */
{
  const res = [
    { oid: 1, id: 'ХО-0001', obyem: 10, une: 1000, zoruu: -100, reason: 'ok' },
    { oid: 2, id: 'ХО-0002', obyem: null, une: null, zoruu: null, reason: 'no-snapshot' },
  ];
  const u = linkUpdates(res);
  assert.equal(u.length, 2, '⚠️ холбогдоогүй мөр ч бичигдэнэ — хуучирсан утга үлдэхгүй');
  assert.equal(u[0][HO_IPC.oid], 1);
  assert.equal(u[0][LINK_FIELDS.une], 1000);
  assert.equal(u[0][LINK_FIELDS.zoruu], -100);
  assert.equal(u[1][LINK_FIELDS.zoruu], null, '⚠️ 0 БИШ');
  assert.ok(LINK_FIELDS.obyem in u[1], 'талбар байх ёстой — утга нь null');
}

/* ══ 5. linkSummary ══ */
{
  const res = [
    { oid: 1, id: 'a', obyem: 1, une: 100, zoruu: -10, reason: 'ok' },
    { oid: 2, id: 'b', obyem: 1, une: 100, zoruu: 30, reason: 'ok' },
    { oid: 3, id: 'c', obyem: null, une: null, zoruu: null, reason: 'no-snapshot' },
    { oid: 4, id: 'd', obyem: null, une: null, zoruu: null, reason: 'not-work' },
  ];
  const s = linkSummary(res);
  assert.equal(s.total, 4);
  assert.equal(s.linked, 2);
  assert.equal(s.by['no-snapshot'], 1);
  assert.equal(s.by['not-work'], 1);
  assert.equal(s.zoruu, 20, '−10 + 30');
  /* ⚠️ Нэг ч холбогдоогүй бол `null` — «зөрүү 0» гэж ХУДЛААР харагдахгүй */
  assert.equal(linkSummary([res[2], res[3]]).zoruu, null, '⚠️ 0 БИШ');
  assert.equal(linkSummary([]).zoruu, null);
}

/* ══ 6. payPkgKey — ⚠️ ДИАПАЗОН мөр буруу багцад наалдахгүй ══ */
{
  assert.equal(payPkgKey({ [C.pkg]: 'Багц 14' }), 'БАГЦ14');
  assert.equal(payPkgKey({ [C.pkg]: 'Багц-1-4' }), '', '⚠️ диапазон → хоосон, «Багц 14»-д НААЛДАХГҮЙ');
  assert.equal(payPkgKey({ [C.pkg]: null }), '');
}

console.log('ipcLink.check ✓');
