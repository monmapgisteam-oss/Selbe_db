/**
 * ЧАНАР (QAQC) ӨГӨГДЛИЙН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/qaqc.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. БУРУУ ҮЙЛЧИЛГЭЭ РҮҮ БИЧИХ. Хүснэгтүүд `QAQC` ба `QAQC2` хоёрт тархсан
 *      бөгөөд ДУГААР НЬ ДАВХАРДДАГ (169, 191 хоёуланд нь бий). Үйлчилгээг
 *      мартвал Багц 1-ийн акт Багц 3.2-т бичигдэнэ.
 *   2. БАГЦ ХАМРАГДАХГҮЙ ҮЛДЭХ. 10/10 багцад хүснэгт байх ЁСТОЙ; үл мэдэх
 *      түлхүүр нь `null` буцаана, ойролцоох дугаар руу УНАХГҮЙ.
 *   3. EXCEL-ИЙН ТОЛГОЙН МӨР ЗУРАГДАХ. Хүснэгт бүрийн эхний 3 мөр хоосон —
 *      харуулбал хэрэглэгч хоосон мөрд акт бөглөх гэж оролдоно.
 *   4. `''` ХАДГАЛАГДАХ. Хоосон болгосон нүд `null` болох ёстой — хоосон
 *      тэмдэгт мөр нь ArcGIS-д NULL БИШ бөгөөд хайлт/тайланд өөрөөр биелнэ.
 *   5. БҮТЭН МӨР ДАРАХ. Зөвхөн ЗАССАН багана илгээгдэнэ; бусад багана
 *      payload-д ОГТ БАЙХГҮЙ байх ёстой, эс бөгөөс өөр хүний бөглөсөн утга
 *      `null`-аар дарагдана.
 *   6. БАЙХГҮЙ МӨР РҮҮ БИЧИХ. Хуудсанд байхгүй ObjectID нь `skipped` болно —
 *      чимээгүй алгасвал «хадгаллаа» гэж худал мэдээлнэ.
 *   7. ТОЛГОЙН БҮЛЭГЛЭЛТ ГУЛСАХ. `QAQC_GROUPS`-ийн нийлбэр баганын тоотой
 *      зөрвөл хүснэгтийн толгой бүхэлдээ шилжинэ.
 *   8. ХУДАЛ ШАТЛАЛ. Ажлын мод нь бөглөх хуудаснаас ДАРААЛЛААР холбогддог
 *      (QAQC хүснэгтээс жингийн багана хасагдсан тул өөр арга байхгүй).
 *      Мөр зөрсөн үед `attachTree` нь `null` буцаах ЁСТОЙ — хагас таарсан
 *      модыг зурвал «энэ М-акт аль ажилд харьяалагдана» гэдэг ЧИМЭЭГҮЙ
 *      хуурамч болно.
 */
import assert from 'node:assert/strict';
import {
  QAQC_TABLE, QAQC_SERVICES, QAQC_COLS, QAQC_GROUPS,
  qaqcTableOf, qaqcUrl, isDataRow, toRows, filledCount, qaqcUpdates, attachTree, qaqcPayload,
} from './qaqc.ts';
import { PKGS } from '@/modules/sheet/bagts.pkg';

const feat = (oid, no, work, extra = {}) => ({
  attributes: { ObjectID: oid, F_: no, 'Ажил': work, ...extra },
});

/* 1 — багана ба толгойн бүлэглэлт нийцнэ */
assert.equal(QAQC_COLS.length, 9);
assert.equal(
  QAQC_GROUPS.reduce((n, g) => n + g.count, 0), QAQC_COLS.length,
  'толгойн бүлэглэлт баганын тоотой зөрсөн — хүснэгт гулсана',
);
assert.equal(new Set(QAQC_COLS.map((c) => c.name)).size, 9, 'багана давхардсан');

/* 2 — БҮХ багц хамрагдсан, хүснэгт нь давхардаагүй */
for (const p of PKGS) {
  const ref = qaqcTableOf(p.key);
  assert.ok(ref, `${p.key}-д QAQC хүснэгт зураглагдаагүй`);
  assert.ok(ref.svc in QAQC_SERVICES, `${p.key}: үл мэдэх үйлчилгээ ${ref.svc}`);
  assert.ok(Number.isInteger(ref.id), `${p.key}: хүснэгтийн дугаар бүхэл биш`);
}
assert.equal(qaqcTableOf('yamarch_bagts'), null, 'үл мэдэх багц → null');
/* ⚠️ Хоёр багц НЭГ хүснэгт рүү заавал өгөгдөл холилдоно. Давхардлыг
   `үйлчилгээ/дугаар`-аар шалгана: дугаар дангаараа ДАВХАРДДАГ (169, 191). */
const addr = Object.values(QAQC_TABLE).map((r) => `${r.svc}/${r.id}`);
assert.equal(new Set(addr).size, addr.length, 'хоёр багц нэг QAQC хүснэгтэд заасан');
/* ⚠️ Дугаар давхардсаныг ИЛ бэхжүүлнэ — «хялбарчилъя» гэж үйлчилгээг хаявал
   энэ шалгуур унана. */
assert.deepEqual(qaqcTableOf('b1_9f'), { svc: 'QAQC', id: 169 });
assert.deepEqual(qaqcTableOf('b32_9f'), { svc: 'QAQC2', id: 169 });
assert.deepEqual(qaqcTableOf('b2_9f'), { svc: 'QAQC2', id: 191 });
assert.deepEqual(qaqcTableOf('b42_9f'), { svc: 'QAQC', id: 191 });
assert.equal(qaqcUrl(qaqcTableOf('b1_9f')), `${QAQC_SERVICES.QAQC}/169`);
assert.equal(qaqcUrl(qaqcTableOf('b32_9f')), `${QAQC_SERVICES.QAQC2}/169`);
assert.notEqual(qaqcUrl(qaqcTableOf('b1_9f')), qaqcUrl(qaqcTableOf('b32_9f')));

/* 3 — толгойн мөр таних */
assert.equal(isDataRow({ no: '', work: '' }), false);
assert.equal(isDataRow({ no: '3.1', work: '' }), true, 'бүлгийн мөр хасагдав');
assert.equal(isDataRow({ no: '', work: 'Бэлтгэл ажил' }), true, 'нэртэй мөр хасагдав');

/* 4 — шатлал холбох: зөрвөл `null`, таарвал гүн ба бүлэг наалдана */
const qr = (oid, no, work) => ({ oid, no, work, des: '', depth: 0, group: false, docs: new Array(9).fill(null) });
const sr = (no, work, depth, group) => ({ no, work, depth, group });
const three = [qr(4, 'A.', 'Бэлтгэл ажил'), qr(5, '1', 'Хашаа'), qr(6, '2', 'Гэрэлтүүлэг')];

/* (а) таарсан — гүн ба бүлэг наалдана */
const ok = attachTree(three, [
  sr('A.', 'Бэлтгэл ажил', 0, true), sr('1', 'Хашаа', 1, false), sr('2', 'Гэрэлтүүлэг', 1, false),
]);
assert.ok(ok, 'таарсан мод холбогдсонгүй');
assert.deepEqual(ok.map((r) => r.depth), [0, 1, 1]);
assert.deepEqual(ok.map((r) => r.group), [true, false, false]);
assert.deepEqual(ok.map((r) => r.oid), [4, 5, 6], 'ObjectID хөндөгдөв');
assert.deepEqual(three.map((r) => r.depth), [0, 0, 0], 'оролт хувиран өөрчлөгдөв');

/* (б) МӨРИЙН ТОО зөрвөл — таамаглахгүй */
assert.equal(attachTree(three, [sr('A.', 'Бэлтгэл ажил', 0, true)]), null, 'тоо зөрсөн ч мод холбогдов');
/* (в) ДАРААЛАЛ зөрвөл — таамаглахгүй */
assert.equal(
  attachTree(three, [
    sr('A.', 'Бэлтгэл ажил', 0, true), sr('2', 'Гэрэлтүүлэг', 1, false), sr('1', 'Хашаа', 1, false),
  ]),
  null, 'дараалал зөрсөн ч мод холбогдов',
);
/* (г) ХООСОН оролт — мод байхгүй */
assert.equal(attachTree([], []), null);
/* (д) Зайг тайрсан хуудасны утга ТААРНА — эх excel-д мөрийн сүүл зайтай */
assert.ok(attachTree(three, [
  sr(' A. ', 'Бэлтгэл ажил ', 0, true), sr('1', 'Хашаа', 1, false), sr(2, 'Гэрэлтүүлэг', 1, false),
]), 'зай/тоон № тайрагдсангүй');
/* (е) Сөрөг ба хүчингүй гүн — 0 болно (эгнүүлэлт эвдрэхгүй) */
const fixed = attachTree(three, [
  sr('A.', 'Бэлтгэл ажил', -3, true), sr('1', 'Хашаа', NaN, false), sr('2', 'Гэрэлтүүлэг', 2, false),
]);
assert.deepEqual(fixed.map((r) => r.depth), [0, 0, 2]);

/* 5 — түүхий features → мөрүүд (шатлалыг ЭНД таамаглахгүй) */
const rows = toRows([
  feat(1, null, null),                 // excel толгой
  feat(2, '', '  '),                   // excel толгой
  feat(3, null, ''),                   // excel толгой
  feat(4, 'A.', 'Бэлтгэл ажил'),
  feat(5, ' 1 ', 'Талбайн түр хашаа барих  ', {
    Makt_dugaar: 'M-01', FIC_ner: '   ', MIR_ner: null,
  }),
  { attributes: { ObjectID: null, F_: '9', 'Ажил': 'ObjectID-гүй' } },
]);
assert.equal(rows.length, 2, 'толгойн мөр эсвэл ObjectID-гүй мөр орж ирэв');
assert.equal(rows[0].oid, 4);
assert.equal(rows[0].depth, 0, 'шатлал таамаглагдав');
assert.equal(rows[0].group, false, 'бүлэг таамаглагдав');
assert.deepEqual(rows[0].docs, new Array(9).fill(null));
assert.equal(rows[1].no, '1', 'зай тайрагдаагүй');
assert.equal(rows[1].work, 'Талбайн түр хашаа барих', 'зай тайрагдаагүй');
assert.equal(rows[1].depth, 0);
assert.equal(rows[1].docs[QAQC_COLS.findIndex((c) => c.name === 'Makt_dugaar')], 'M-01');
assert.equal(
  rows[1].docs[QAQC_COLS.findIndex((c) => c.name === 'FIC_ner')], null,
  "зөвхөн зайнаас тогтсон утга `null` болох ёстой",
);
assert.equal(filledCount(rows), 1, 'бөглөгдсөн нүдний тоо буруу');

/* 6 — засвар: зөвхөн зассан багана, мөрөөр нэгтгэгдэнэ */
const known = new Set([4, 5]);
const { updates, skipped } = qaqcUpdates({
  '4:0': 'M-77',
  '4:3': ' F-9 ',
  '5:0': '   ',
  '999:0': 'X',       // хуудсанд байхгүй мөр
  '4:99': 'X',        // байхгүй багана
  'muu': 'X',         // эвдэрсэн түлхүүр
}, known);
assert.equal(updates.length, 2, 'нэг мөр нэг update байх ёстой');
const u4 = updates.find((u) => u.ObjectID === 4);
assert.deepEqual(
  u4, { ObjectID: 4, Makt_dugaar: 'M-77', FIC_dugaar: 'F-9' },
  'зайг тайраагүй эсвэл хөндөөгүй багана payload-д оров',
);
assert.equal(Object.keys(u4).length, 3);
assert.equal(
  updates.find((u) => u.ObjectID === 5).Makt_dugaar, null,
  'хоосон болгосон нүд `null` байх ёстой',
);
assert.deepEqual(skipped.sort(), ['4:99', '999:0', 'muu'], 'олдоогүй түлхүүр чимээгүй алгасагдав');

/* 7 — `known` өгөөгүй бол мөрийн шалгалт хийхгүй (шалгуурт нээлттэй) */
assert.equal(qaqcUpdates({ '999:0': 'X' }).updates.length, 1);
/* 8 — засваргүй үед payload хоосон */
assert.equal(qaqcUpdates({}, known).updates.length, 0);

/* 9 — applyEdits-ийн ДУГТУЙ: мөр бүр `{ attributes }` дотор ──────────────
   ⚠️ 2026-09-03-нд амьд шалгалтаар илэрсэн БОДИТ согог: нүцгэн атрибут
   илгээхэд ArcGIS «Cannot perform operation. Invalid operation parameters.»
   гэж унадаг бөгөөд шалтгаан нь мессежээс уншигдахгүй. Сүлжээний функцийг
   тест дуудаж чадахгүй тул дугтуйг ЭНД барина. */
const wire = JSON.parse(qaqcPayload(updates));
assert.ok(Array.isArray(wire), 'payload массив биш');
assert.equal(wire.length, updates.length, 'мөр алдагдав');
for (const f of wire) {
  assert.deepEqual(Object.keys(f), ['attributes'], 'мөр `attributes` дугтуйгүй илгээгдэж байна');
  assert.equal(typeof f.attributes.ObjectID, 'number', 'ObjectID дугтуйн дотор алга');
}
assert.equal(wire[0].attributes.Makt_dugaar, 'M-77');
assert.equal(qaqcPayload([]), '[]');

console.log('qaqc.check ✓');
