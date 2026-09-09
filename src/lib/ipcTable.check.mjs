/**
 * IPC ХҮСНЭГТИЙН ЗАГВАРЫН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ipcTable.check.mjs
 *
 * Хамгаалж буй БОДИТ алдаанууд:
 *   1. ГРЕЙН ХӨӨРӨГДӨХ. Гэрээний талбар мөрд ДАВТАГДДАГ тул бүлгийн
 *      толгойд мөрөөр нийлүүлбэл Багц-4.1-ийн төсөв 7 ДАХИН гарна.
 *   2. ХУРИМТЛАЛД УРЬДЧИЛГАА ОРОХ. Урьдчилгаа нь ирээдүйн ажлын өмнөх
 *      төлбөр — гүйцэтгэлийн хуримтлалд оруулбал «хийснээсээ илүү авсан»
 *      гэсэн ХУДАЛ дүр зураг гарна.
 *   3. ОГНООГООР ЭРЭМБЭЛЭХ. `guilgee_ognoo` 45-ийн 5 мөрд ХООСОН тул
 *      эрэмбэ тогтворгүй болж хуримтлал буруу мөрд наалдана.
 *   4. `null` → `0` ДАРАГДАХ. Урьдчилгааны `cum`, хэмжигдээгүй зөрүү
 *      бүгд `null` байх ёстой — `0` нь «таарсан»/«эхлээгүй» гэсэн ХУДАЛ
 *      мэдэгдэл.
 *   5. ЭРЭМБЭД `null` ЭХЭНД ГАРАХ. Хэмжигдээгүй гэрээ «хамгийн бага» гэж
 *      жагсаалтын толгойд гарах ёсгүй.
 *   6. ГАРЧИГГҮЙ БҮЛЭГ. Багцгүй/кодгүй гэрээ «—» болж хүн юу харж
 *      байгаагаа мэдэхгүй болох.
 */
import assert from 'node:assert/strict';
import {
  payRows, contractBlocks, anyObyem, sortBlocks, ipcTotals, details,
} from './ipcTable.ts';
import { LINK_FIELDS } from './ipcLink.ts';
import { HO_IPC } from './services.ts';

const P = HO_IPC.payFields;
const C = HO_IPC.contractFields;
const { advance, work } = HO_IPC.kinds;

const pay = (oid, kind, dun, o = {}) => ({
  [HO_IPC.oid]: oid,
  [P.id]: `ХО-${String(oid).padStart(4, '0')}`,
  [P.kind]: kind,
  [P.amount]: dun,
  ...o,
});

/** `groupHo`-ийн гаралтыг дуурайсан гэрээ */
const contract = (o = {}) => ({
  code: 'Багц-1', key: 'БАГЦ1', pkg: 'Багц-1',
  project: '', contractor: 'ХХМК', workType: 'Барилга угсралт', contractNo: 'Н/1',
  budgetTotal: 100, contractTotal: 90, saving: 10,
  pays: [], advanceTotal: null, workTotal: null, paidTotal: null, paidPct: null,
  ...o,
});

/* ══ 1. payRows — дараалал ба ХУРИМТЛАЛ ══ */
{
  const pays = [
    pay(3, work, 30, { [P.ipcNo]: 2, [P.payDate]: '2026-06-14' }),
    pay(1, advance, 50, { [P.payDate]: '2025-09-25' }),
    pay(2, work, 20, { [P.ipcNo]: 1, [P.payDate]: '2026-03-20' }),
  ];
  const r = payRows(pays);
  assert.deepEqual(r.map((x) => x.oid), [1, 2, 3], 'урьдчилгаа ЭХЭНД, дараа нь IPC дугаараар');
  assert.equal(r[0].advance, true);
  assert.equal(r[1].advance, false);

  /* ⚠️ №2 — урьдчилгаа хуримтлалд ОРООГҮЙ */
  assert.equal(r[0].cum, null, '⚠️ урьдчилгаад хуримтлал БАЙХГҮЙ (0 ч биш)');
  assert.equal(r[1].cum, 20, '⚠️ 70 БИШ — урьдчилгаа 50 ороогүй');
  assert.equal(r[2].cum, 50, '20 + 30');
}
{
  /* ⚠️ №3 — огноо ХООСОН байсан ч IPC дугаараар зөв эрэмбэлэгдэнэ */
  const r = payRows([
    pay(2, work, 30, { [P.ipcNo]: 2, [P.payDate]: null }),
    pay(1, work, 20, { [P.ipcNo]: 1, [P.payDate]: null }),
  ]);
  assert.deepEqual(r.map((x) => x.ipcNo), [1, 2], '⚠️ огноогүй ч дугаараар эрэмбэлэгдэнэ');
  assert.equal(r[1].cum, 50, 'хуримтлал зөв');
}
{
  /* `dun` хоосон мөр — хуримтлалыг ТАСЛАХГҮЙ */
  const r = payRows([
    pay(1, work, null, { [P.ipcNo]: 1 }),
    pay(2, work, 20, { [P.ipcNo]: 2 }),
  ]);
  assert.equal(r[0].amount, null, '⚠️ 0 БИШ');
  assert.equal(r[0].cum, null, 'эхний мөр хэмжигдээгүй');
  assert.equal(r[1].cum, 20, 'дараагийнх нь үргэлжилнэ');
}
{
  /* ЖИНХЭНЭ 0 төлбөр нь `null` БИШ — `null ≠ 0` дүрмийн НӨГӨӨ ТАЛ */
  const r = payRows([pay(1, work, 0, { [P.ipcNo]: 1 })]);
  assert.equal(r[0].amount, 0, 'жинхэнэ тэг хадгалагдана');
  assert.equal(r[0].cum, 0);
}
{
  /* Гүйцэтгэлийн 3 талбар уншигдана */
  const r = payRows([pay(1, work, 20, {
    [P.ipcNo]: 1,
    [LINK_FIELDS.obyem]: 1234,
    [LINK_FIELDS.une]: 18,
    [LINK_FIELDS.zoruu]: 2,
  })]);
  assert.equal(r[0].obyem, 1234);
  assert.equal(r[0].une, 18);
  assert.equal(r[0].zoruu, 2);
  /* Талбар байхгүй бол `null` — `0` БИШ (⚠️ №4) */
  const e = payRows([pay(2, work, 20, { [P.ipcNo]: 1 })]);
  assert.equal(e[0].obyem, null, '⚠️ 0 БИШ');
  assert.equal(e[0].zoruu, null, '⚠️ 0 БИШ — «зөрүү 0» нь «таарсан» гэсэн үг');
}

/* ══ 1b. ЗАХИРАМЖ ба ОН — мөрөнд гарна ══ */
{
  const r = payRows([pay(1, work, 20, {
    [P.ipcNo]: 1, [P.year]: 2026, [C.order1No]: 'А/250',
  })]);
  assert.equal(r[0].orderNo, 'А/250', 'захирамжийн дугаар мөрд');
  assert.equal(r[0].year, 2026, 'он мөрд');
  /* ⚠️ Захирамжгүй/онгүй бол ХООСОН мөр ба `null` — «0» эсвэл «undefined»
     гэж харагдах ёсгүй. */
  const e = payRows([pay(2, work, 20, { [P.ipcNo]: 1 })]);
  assert.equal(e[0].orderNo, '', 'захирамжгүй → хоосон мөр');
  assert.equal(e[0].year, null, '⚠️ онгүй → null (0 БИШ)');
}

/* ══ 2. contractBlocks — ⚠️ №1 давхардахгүй, №6 гарчигтай ══ */
{
  /* Багц-4.1-ийн ХЭВ ШИНЖ: 3 мөр, гэрээний талбар мөрд давтагдсан */
  const c = contract({
    pkg: 'Багц-4.1', contractTotal: 90, paidTotal: 60, paidPct: (60 / 90) * 100,
    pays: [
      pay(1, work, 10, { [P.ipcNo]: 1 }),
      pay(2, work, 20, { [P.ipcNo]: 2 }),
      pay(3, work, 30, { [P.ipcNo]: 3 }),
    ],
  });
  const [b] = contractBlocks([c]);
  assert.equal(b.contractTotal, 90, '⚠️ 270 БИШ — гэрээний утга НЭГ УДАА');
  assert.equal(b.paidTotal, 60);
  assert.equal(b.rows.length, 3);
  assert.equal(b.title, 'Багц-4.1');
  assert.equal(b.hasObyem, false, 'обьёмгүй');
}
{
  /* ⚠️ №6 — багцгүй бол кодоор, кодгүй бол мөрийн ID-гаар */
  assert.equal(contractBlocks([contract({ pkg: '', code: 'ХО-К' })])[0].title, 'ХО-К');
  const noCode = contractBlocks([contract({
    pkg: '', code: '', pays: [pay(9, work, 1, { [P.ipcNo]: 1 })],
  })]);
  assert.equal(noCode[0].title, 'ХО-0009', '⚠️ гарчиггүй бүлэг ГАРАХГҮЙ');
  assert.equal(contractBlocks([contract({ pkg: '', code: '', pays: [] })])[0].title, '—');
}
{
  /* hasObyem — бүлэг ТУС БҮРД шийдэгдэнэ (хэрэглэгчийн шийдвэр) */
  const withO = contract({
    pays: [pay(1, work, 10, { [P.ipcNo]: 1, [LINK_FIELDS.une]: 9 })],
  });
  const noO = contract({ code: 'Багц-2', pays: [pay(2, work, 10, { [P.ipcNo]: 1 })] });
  const bs = contractBlocks([withO, noO]);
  assert.equal(bs[0].hasObyem, true);
  assert.equal(bs[1].hasObyem, false);
  assert.equal(anyObyem(bs), true, 'аль нэгэнд байвал багана нээгдэнэ');
  assert.equal(anyObyem([bs[1]]), false, '⚠️ бүгд хоосон бол багана ГАРАХГҮЙ');
  assert.equal(anyObyem([]), false);
}

/* ══ 2b. details — БҮЛЭГЛЭНЭ · ХООСОН хасна · жинхэнэ 0 ҮЛДЭНЭ ══ */
{
  const g = details({
    [C.project]: 'Сэлбэ дэд төв',
    [C.workType]: 'Барилга угсралт',
    [C.budgetTotal]: 100,
    [C.budgetCity]: null,        // ⚠️ хоосон — ХАСАГДАНА
    [C.contractBond]: '',        // ⚠️ хоосон мөр — ХАСАГДАНА
    [C.contractSales]: 0,        // ⚠️ ЖИНХЭНЭ 0 — ҮЛДЭНЭ
  });
  /* Бүх бүлгийн талбарыг хавтгайруулж шалгана */
  const all = g.flatMap((x) => x.items);
  const f = all.map((x) => x.field);
  assert.ok(f.includes(C.project), 'текст талбар орсон');
  assert.ok(f.includes(C.budgetTotal), 'мөнгөн талбар орсон');
  assert.ok(!f.includes(C.budgetCity), '⚠️ null талбар ХАСАГДСАН');
  assert.ok(!f.includes(C.contractBond), '⚠️ хоосон мөр ХАСАГДСАН');
  assert.ok(f.includes(C.contractSales), '⚠️ жинхэнэ 0 ҮЛДСЭН — null ≠ 0');

  /* Төрөл нь зөв тэмдэглэгдсэн эсэх — харагдац үүгээр форматлана */
  const by = new Map(all.map((x) => [x.field, x.kind]));
  assert.equal(by.get(C.project), 'text');
  assert.equal(by.get(C.budgetTotal), 'money');
  /* ⚠️ Захирамж нь ХОС талбар — `pair` төрөлтэй НЭГ мөр */
  assert.equal(details({ [C.order1Date]: '2025-02-20' })[0].items[0].kind, 'pair');

  /* ⚠️ БҮЛЭГ бүр гарчигтай ба ХООСОН бүлэг ГАРАХГҮЙ */
  assert.ok(g.every((x) => x.title && x.items.length), '⚠️ хоосон/гарчиггүй бүлэг байхгүй');
  assert.equal(g.length, 2, 'ГЭРЭЭ ба ТӨСӨВ — ЭРХ ЗҮЙ хоосон тул ГАРААГҮЙ');

  /* ⚠️ ЗАХИРАМЖ — огноо ба дугаар НЭГ мөр болж нийлнэ (хэрэглэгчийн
     шийдвэр 2026-09-09: «zahiram neg : on dugaar»). Урьд нь ХОЁР мөр
     эзэлж, 3 захирамж = 6 мөр болдог байв. */
  const legal = details({
    [C.order1Date]: '2025-02-20', [C.order1No]: 'А/250',
  });
  assert.equal(legal.length, 1, 'зөвхөн ЭРХ ЗҮЙН бүлэг');
  assert.equal(legal[0].items.length, 1, '⚠️ ХОЁР биш НЭГ мөр');
  assert.equal(legal[0].items[0].value, '2025-02-20 · А/250', 'огноо · дугаар нийлсэн');
  assert.equal(legal[0].items[0].label, 'Захирамж 1', 'өөрийн шошиг');

  /* ⚠️ Аль нэг нь дутуу байсан ч мөр ГАРНА — байгаа талыг нь харуулна */
  const onlyNo = details({ [C.order2No]: 'А/736' });
  assert.equal(onlyNo[0].items[0].value, 'А/736', 'зөвхөн дугаар');
  const onlyDate = details({ [C.order2Date]: '2025-05-27' });
  assert.equal(onlyDate[0].items[0].value, '2025-05-27', 'зөвхөн огноо');

  /* ⚠️ ХОЁУЛАА хоосон бол мөр ОГТ гарахгүй */
  assert.deepEqual(details({ [C.order3Date]: null, [C.order3No]: '' }), [],
    '⚠️ хоосон захирамж мөр үүсгэхгүй');

  /* ⚠️ Гурван захирамжийн `field` нь ДАВТАГДАХГҮЙ — React-ийн key */
  const three = details({
    [C.order1No]: 'А/250', [C.order2No]: 'А/736', [C.order3No]: 'А/917',
  });
  const keys = three[0].items.map((x) => x.field);
  assert.equal(new Set(keys).size, keys.length, '⚠️ key давхардахгүй');

  assert.deepEqual(details({}), [], 'бүх талбар хоосон бол хоосон массив');
}

/* ══ 2c. ХАДГАЛАГДСАН ба БОДОГДСОН хэмнэлт зөрөх ДОХИО ══ */
{
  /* Таарсан — дохио АСАХГҮЙ */
  const okBlk = contractBlocks([contract({
    pays: [pay(1, work, 5, {
      [C.budgetTotal]: 100, [C.contractTotal]: 90, [C.saving]: 10,
    })],
  })]);
  assert.equal(okBlk[0].savingMismatch, false, '100−90=10 таарсан');

  /* Зөрсөн — дохио АСНА */
  const badBlk = contractBlocks([contract({
    pays: [pay(1, work, 5, {
      [C.budgetTotal]: 100, [C.contractTotal]: 90, [C.saving]: 55,
    })],
  })]);
  assert.equal(badBlk[0].savingMismatch, true, '⚠️ эх сурвалж эвдэрсний дохио');

  /* ⚠️ Хэмжигдээгүй бол «зөрсөн» ГЭЖ ҮЗЭХГҮЙ */
  const nullBlk = contractBlocks([contract({
    pays: [pay(1, work, 5, { [C.budgetTotal]: 100, [C.contractTotal]: null, [C.saving]: 10 })],
  })]);
  assert.equal(nullBlk[0].savingMismatch, false, '⚠️ хэмжигдээгүй ≠ зөрчил');
}

/* ══ 3. sortBlocks — ⚠️ №5 null ЭЦЭСТ ══ */
{
  const mk = (title, paid, pct) => ({
    code: title, title, contractor: '', workType: '', contractNo: '',
    contractTotal: null, paidTotal: paid, paidPct: pct, rows: [], hasObyem: false,
    details: [], advanceTotal: null, workTotal: null, savingMismatch: false,
  });
  const bs = [mk('А', 10, 10), mk('Б', null, null), mk('В', 30, 30)];

  const byPaid = sortBlocks(bs, 'paid');
  assert.deepEqual(byPaid.map((b) => b.title), ['В', 'А', 'Б'], '⚠️ null ЭЦЭСТ (буурах)');

  const asc = sortBlocks(bs, 'paid', false);
  assert.deepEqual(asc.map((b) => b.title), ['А', 'В', 'Б'], '⚠️ null ӨСӨХӨД Ч ЭЦЭСТ');

  assert.deepEqual(sortBlocks(bs, 'pkg').map((b) => b.title), ['А', 'Б', 'В'], 'нэрээр');
  /* Оролт ХӨНДӨГДӨХГҮЙ */
  assert.deepEqual(bs.map((b) => b.title), ['А', 'Б', 'В'], 'оролт хэвээр');
}

/* ══ 4. ipcTotals ══ */
{
  const mk = (contractTotal, paidTotal, n) => ({
    code: 'x', title: 'x', contractor: '', workType: '', contractNo: '',
    contractTotal, paidTotal, paidPct: null,
    rows: Array.from({ length: n }, (_, i) => ({ oid: i })), hasObyem: false,
    details: [], advanceTotal: null, workTotal: null, savingMismatch: false,
  });
  const t = ipcTotals([mk(100, 40, 2), mk(200, 60, 3)]);
  assert.equal(t.contracts, 2);
  assert.equal(t.pays, 5);
  assert.equal(t.contract, 300);
  assert.equal(t.paid, 100);
  assert.equal(Math.round(t.paidPct), 33, '100/300 → 33 (0–100, ⚠️ pct() үржүүлдэггүй)');

  /* ⚠️ Бүгд хэмжигдээгүй бол `null` — 0 БИШ */
  const e = ipcTotals([mk(null, null, 0)]);
  assert.equal(e.contract, null, '⚠️ 0 БИШ');
  assert.equal(e.paid, null, '⚠️ 0 БИШ');
  assert.equal(e.paidPct, null);
  /* ⚠️ 0-д хуваахгүй */
  assert.equal(ipcTotals([mk(0, 50, 0)]).paidPct, null, '⚠️ Infinity БИШ');
  assert.equal(ipcTotals([]).contracts, 0);
}

console.log('ipcTable.check ✓');
