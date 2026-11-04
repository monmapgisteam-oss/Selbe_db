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
  payRows, contractBlocks, anyObyem, sortBlocks, ipcTotals, payCount, details, ipcNumbers,
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

  assert.equal(r[0].cum, null, '⚠️ урьдчилгаад хуримтлал БАЙХГҮЙ (0 ч биш)');
  assert.equal(r[1].cum, 20, '⚠️ 70 БИШ — урьдчилгаа 50 ороогүй');
  assert.equal(r[2].cum, 50, '20 + 30');
}
{
  const r = payRows([
    pay(9, work, 5, { [P.ipcNo]: null, [P.payDate]: null }),
    pay(3, work, 30, { [P.ipcNo]: 2, [P.payDate]: '2026-06-14' }),
    pay(2, work, 20, { [P.ipcNo]: 1, [P.payDate]: '2026-03-20' }),
  ]);
  assert.deepEqual(r.map((x) => x.oid), [2, 3, 9], '⚠️ AUTO (дугааргүй) мөр ХАМГИЙН АРД');
  assert.equal(r[0].cum, 20);
  assert.equal(r[1].cum, 50);
  assert.equal(r[2].cum, 55, 'AUTO мөр хуримтлалд сүүлд орно');
}
{
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
  const r = payRows([
    pay(1, work, 20, { [P.ipcNo]: 1 }),
    pay(2, work, null, { [P.ipcNo]: 2 }),
    pay(3, work, 30, { [P.ipcNo]: 3 }),
    pay(4, work, null, { [P.id]: 'AUTO|БАГЦ1|2026-09-09' }),
  ]);
  assert.deepEqual(r.map((x) => x.cum), [20, null, 50, null]);
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
  /* Талбар байхгүй бол `null` — `0` БИШ (№4) */
  const e = payRows([pay(2, work, 20, { [P.ipcNo]: 1 })]);
  assert.equal(e[0].obyem, null, '⚠️ 0 БИШ');
  assert.equal(e[0].zoruu, null, '⚠️ 0 БИШ — «зөрүү 0» нь «таарсан» гэсэн үг');
}

/* ══ 1c. НЭГ IPC = НЭГ КАРТ (2026-11-04) — олгосон гүйцэтгэл төлбөрийн мөрд нэгдэнэ ══ */
{
  const S = HO_IPC.status;
  const auto = (oid, day, no, une, obyem, st) => pay(oid, work, null, {
    [P.id]: `AUTO|БАГЦ1|${day}`, [P.payDate]: day, [P.ipcNo]: no, [LINK_FIELDS.une]: une, [LINK_FIELDS.obyem]: obyem, [S.field]: st,
  });
  const r = payRows([
    pay(1, work, 100, { [P.ipcNo]: 1, [P.payDate]: '2026-08-26', [S.field]: S.paid }),
    auto(2, '2026-08-20', 1, 60, 10, S.paid),
    auto(3, '2026-08-26', 1, 45, 5, S.paid),
    auto(4, '2026-09-09', null, 30, 3, S.work),       // IPC-д ороогүй — тусдаа карт хэвээр
    auto(5, '2026-09-20', 2, 20, 2, S.created),       // IPC үүссэн ч олгоогүй — тусдаа карт хэвээр
    auto(6, '2026-09-30', 3, 15, 1, S.paid),          // «Олгосон» ч төлбөрийн мөргүй — тусдаа карт хэвээр
  ]);
  assert.deepEqual(r.map((x) => x.oid), [1, 5, 6, 4], '⚠️ олгосон гүйцэтгэл (2, 3) тусдаа карт болохгүй');
  assert.equal(r[0].obyem, 15, 'обьём = 10 + 5');
  assert.equal(r[0].une, 105, '₮ = 60 + 45');
  assert.equal(r[0].zoruu, -5, 'зөрүү = олгосон 100 − гүйцэтгэл 105');
  assert.deepEqual(r[0].days, ['2026-08-20', '2026-08-26'], 'орсон өдрүүд');
  assert.deepEqual(r.slice(1).map((x) => x.days), [[], [], []], 'нэгдээгүй мөрд өдөр байхгүй');
  assert.equal(r[3].une, 30, 'тусдаа карт өөрийн дүнтэй');
  /* Нэгдсэн мөрүүд огт байхгүй үед хуучин зан хэвээр */
  const plain = payRows([pay(1, work, 20, { [P.ipcNo]: 1, [LINK_FIELDS.obyem]: 7, [LINK_FIELDS.une]: 18, [LINK_FIELDS.zoruu]: 2 })]);
  assert.deepEqual([plain[0].obyem, plain[0].une, plain[0].zoruu, plain[0].days], [7, 18, 2, []]);
}

/* ══ 1b. ЗАХИРАМЖ ба ОН — мөрөнд гарна ══ */
{
  const r = payRows([pay(1, work, 20, {
    [P.ipcNo]: 1, [P.year]: 2026, [C.order1No]: 'А/250',
  })]);
  assert.equal(r[0].orderNo, 'А/250', 'захирамжийн дугаар мөрд');
  assert.equal(r[0].year, 2026, 'он мөрд');
  const e = payRows([pay(2, work, 20, { [P.ipcNo]: 1 })]);
  assert.equal(e[0].orderNo, '', 'захирамжгүй → хоосон мөр');
  assert.equal(e[0].year, null, '⚠️ онгүй → null (0 БИШ)');
}

/* ══ 2. contractBlocks — №1 давхардахгүй, №6 гарчигтай ══ */
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
    [C.budgetCity]: null,
    [C.contractBond]: '',
    [C.contractSales]: 0,
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
  assert.equal(details({ [C.order1Date]: '2025-02-20' })[0].items[0].kind, 'pair');

  assert.ok(g.every((x) => x.title && x.items.length), '⚠️ хоосон/гарчиггүй бүлэг байхгүй');
  assert.equal(g.length, 2, 'ГЭРЭЭ ба ТӨСӨВ — ЭРХ ЗҮЙ хоосон тул ГАРААГҮЙ');

  const legal = details({
    [C.order1Date]: '2025-02-20', [C.order1No]: 'А/250',
  });
  assert.equal(legal.length, 1, 'зөвхөн ЭРХ ЗҮЙН бүлэг');
  assert.equal(legal[0].items.length, 1, '⚠️ ХОЁР биш НЭГ мөр');
  assert.equal(legal[0].items[0].value, '2025-02-20 · А/250', 'огноо · дугаар нийлсэн');
  assert.equal(legal[0].items[0].label, 'Захирамж 1', 'өөрийн шошиг');

  const onlyNo = details({ [C.order2No]: 'А/736' });
  assert.equal(onlyNo[0].items[0].value, 'А/736', 'зөвхөн дугаар');
  const onlyDate = details({ [C.order2Date]: '2025-05-27' });
  assert.equal(onlyDate[0].items[0].value, '2025-05-27', 'зөвхөн огноо');

  assert.deepEqual(details({ [C.order3Date]: null, [C.order3No]: '' }), [],
    '⚠️ хоосон захирамж мөр үүсгэхгүй');

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

  const nullBlk = contractBlocks([contract({
    pays: [pay(1, work, 5, { [C.budgetTotal]: 100, [C.contractTotal]: null, [C.saving]: 10 })],
  })]);
  assert.equal(nullBlk[0].savingMismatch, false, '⚠️ хэмжигдээгүй ≠ зөрчил');
}

/* ══ 3. sortBlocks — №5 null ЭЦЭСТ ══ */
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
    rows: Array.from({ length: n }, (_, i) => ({ oid: i, amount: 10 })), hasObyem: false,
    details: [], advanceTotal: null, workTotal: null, savingMismatch: false,
  });
  const t = ipcTotals([mk(100, 40, 2), mk(200, 60, 3)]);
  assert.equal(t.contracts, 2);
  assert.equal(t.pays, 5);
  const withAuto = mk(100, 40, 2);
  withAuto.rows.push({ oid: 9, id: 'AUTO|Багц 1|2026-09-01', amount: null });
  assert.equal(ipcTotals([withAuto]).pays, 2, '⚠️ AUTO мөр (dun = null) тоологдохгүй');
  assert.equal(payCount(withAuto.rows), 2);
  assert.equal(t.contract, 300);
  assert.equal(t.paid, 100);
  assert.equal(Math.round(t.paidPct), 33, '100/300 → 33 (0–100, ⚠️ pct() үржүүлдэггүй)');

  const e = ipcTotals([mk(null, null, 0)]);
  assert.equal(e.contract, null, '⚠️ 0 БИШ');
  assert.equal(e.paid, null, '⚠️ 0 БИШ');
  assert.equal(e.paidPct, null);
  assert.equal(ipcTotals([mk(0, 50, 0)]).paidPct, null, '⚠️ Infinity БИШ');
  assert.equal(ipcTotals([]).contracts, 0);

  {
    const m = ipcTotals([mk(100, 40, 1), mk(200, 60, 1), mk(null, 500, 1)]);
    assert.equal(m.paid, 600, 'нийт олгосон — БҮХ гэрээ');
    assert.equal(m.paidContracted, 100);
    assert.equal(m.paidOther, 500, 'гэрээт дүнгүй гэрээний олголт ТУСДАА');
    assert.equal(m.contract, 300);
    assert.equal(Math.round(m.paidPct), 33, '100/300 — дүнгүй гэрээний 500 хувьд ОРОХГҮЙ');
    assert.equal(m.paidContracted + m.paidOther, m.paid);
  }
  assert.equal(t.paidOther, null, 'дүнгүй гэрээ алга → null (0 БИШ)');
  assert.equal(t.paidContracted, t.paid);
  {
    const o = ipcTotals([mk(null, 70, 1)]);
    assert.equal(o.paidPct, null, 'хуваарь алга — хувь бодогдохгүй');
    assert.equal(o.paidContracted, null);
    assert.equal(o.paidOther, 70);
  }
}

/* ── 2026-10-01 («хэрэглэгч: бүгдийг зас»): AUTO IPC-ийн анхдагч дугаар — гэрээ бүрд ДАРААЛСАН ── */
{
  const R = (o) => ({ oid: null, id: 'x', code: '', advance: false, ipcNo: null, date: null, amount: null, cum: null,
    obyem: null, une: null, zoruu: null, year: null, kind: '', orderNo: '', ...o });
  const dayOf = (r) => (r.id.startsWith('AUTO|') ? r.id.slice(-10) : null);
  const adv = R({ id: 'ХО-1', advance: true, amount: 5 });
  const i1 = R({ id: 'ХО-2', ipcNo: 1, amount: 10 });
  const i2 = R({ id: 'ХО-3', ipcNo: 2, amount: 20 });
  /* AUTO мөрүүд OID-оор (эрэмбэгүй) ирнэ — 10-р сарынх 9-р сарынхаас ӨМНӨ */
  const aOct = R({ id: 'AUTO|Багц 1|2026-10-05' });
  const aSep = R({ id: 'AUTO|Багц 1|2026-09-30' });
  const n = ipcNumbers([adv, i1, i2, aOct, aSep], dayOf);
  assert.equal(n.get(aSep), 3, 'IPC-2-ын дараагийнх 3 — өдрөөр эрт нь эхэнд');
  assert.equal(n.get(aOct), 4);
  assert.equal(n.get(i2), 2, 'дугаартай мөр өөрийн дугаараа');
  assert.equal(n.has(adv), false, 'урьдчилгаа IPC биш');
  /* дугаарын цоорхой (1, 4) — дараагийнх нь хамгийн их дугаараас */
  const g = ipcNumbers([R({ ipcNo: 1 }), R({ ipcNo: 4 }), aSep], dayOf);
  assert.equal(g.get(aSep), 5, 'max дугаар + 1 (харагдах мөрийн тоо 3 БИШ)');
  /* дугааргүй ГАР мөр — өмнөх IPC гэж тоологдоно, Map-д орохгүй */
  const manual = R({ id: 'ХО-9', amount: 7 });
  const h = ipcNumbers([i1, manual, aSep], dayOf);
  assert.equal(h.get(aSep), 3, '1 + дугааргүй гар мөр → дараагийнх 3');
  assert.equal(h.has(manual), false);
  /* санхүүгийн газар нөхсөн AUTO мөр өөрийн дугаараа */
  const aNum = R({ id: 'AUTO|Багц 1|2026-08-31', ipcNo: 3 });
  const k = ipcNumbers([i1, i2, aNum, aSep], dayOf);
  assert.equal(k.get(aNum), 3);
  assert.equal(k.get(aSep), 4);
  assert.equal(ipcNumbers([aSep], dayOf).get(aSep), 1, 'өмнөх IPC огт алга → 1');
}

/* 2026-11-04: олон багцтай гэрээний багц бүрийн задаргаа */
{
  const { packageRows } = await import('./ipcTable.ts');
  const cf = (o) => ({ objectid: o.id, bagts: o.pkg, uy_shat: 'Барилга угсралт', ho_dungiin_tailbar: 'Гэрээлсэн дүн', geree_dun: o.v, ho_dun_zahiramj: o.v, zahiramj_dugaar: 'А/1', zahiramj_unet_tsaas: o.bond ?? null });
  const rows = [cf({ id: 1, pkg: 'Багц-10', v: 60, bond: 36 }), cf({ id: 2, pkg: 'БАГЦ-11', v: 40 }), cf({ id: 3, pkg: 'Багц-12', v: 5 })];
  const b = { title: 'БАГЦ-10,  БАГЦ-11', workType: 'ГИШСүлжээ' };
  const got = packageRows(b, rows);
  if (got.map((r) => r.pkg).join() !== 'Багц-10,БАГЦ-11') throw new Error('багц таарсангүй: ' + got.map((r) => r.pkg));
  if (got[0].contract !== 60 || got[0].bond !== 36 || got[0].order !== 60 || got[1].bond !== null || got[1].paid !== null) throw new Error('утга буруу');
  if (packageRows({ title: 'Багц-10', workType: 'ГИШСүлжээ' }, rows).length !== 0) throw new Error('нэг багцтай гэрээнд задаргаа гарахгүй');
}

console.log('ipcTable.check ✓');
