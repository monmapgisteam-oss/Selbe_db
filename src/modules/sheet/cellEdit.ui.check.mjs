/**
 * НҮДНИЙ ЗАСВАР (`fill/useCellEdit`) — БУУРАЛТ · ХЭТРЭЛТ · БУУЛГАЛТЫН АНХААРУУЛГА.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/sheet/cellEdit.ui.check.mjs
 *
 * ⚠️ `useCellEdit` нь React-ийн hook ДУУДДАГГҮЙ (зөвхөн функцүүд буцаадаг) тул
 *    энгийн объектоор шууд дуудаж шалгана.
 *
 * Хамгаалж буй алдаанууд (2026-09-30):
 *   1. Обьём (АНХДАГЧ) горимд хувиар бүртгэгдсэн хуучин нүдэнд (act бий, obyem null,
 *      мөр обьёмтой) «+10» бичихэд 50% → 10% АСУУЛТГҮЙ буурдаг байв (гараар ба буулгахад).
 *   2. Буулгалт өөр өдрийн ХЯНАЛТАД байгаа нэмэлтийг тооцдоггүй — гараар бичихэд
 *      асуудаг «Обьёмоос хэтэрсэн» асуулт Excel-ээс буулгахад гардаггүй байв.
 *   3. Хөвөгч цэг: 1.1 + 2.2 = 3.3000000000000003 нь Обьём 3.3-аас «хэтэрсэн» гэж асуудаг байв.
 *   4. Буулгалтын тоо биш / «1,250» утга ногоон «алгасав» мессежид нуугддаг байв.
 *   5. Ctrl+S — нээлттэй нүдний утга няцаагдсан ч үлдсэнийг илгээдэг байв.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ── `window.confirm` — асуултуудыг цуглуулна ── */
const asked = [];
let answer = false;
globalThis.window = globalThis;
globalThis.confirm = (m) => { asked.push(String(m)); return answer; };

/* ⚠️ `use`-гүй нэрээр — React hook дуудахгүй тул энгийн функцээр дуудна (rules-of-hooks) */
const { useCellEdit: makeCellEdit } = await import('./fill/useCellEdit.ts');
const { computeAll } = await import('./bagtsSheet.ts');

/** Нэг блоктой бүдүүвч (обьёмын талбартай) */
const sc = { bld: ['5/1', '5/2'], obyem: ['F5_1_obyem', 'F5_2_obyem'], act: ['F5_1', 'F5_2'] };
const row = (oid, vol, obyem, act) => ({
  oid, no: String(oid), work: `Ажил ${oid}`, group: false, depth: 1,
  wC: null, wD: null, money: null,
  vol, unit: null, obyem, act,
  start: [null, null], end: [null, null],
});

function harness(rowsAll, { fillMode = 'obyem', reviewInc = new Map(), preview = false, restoring = false } = {}) {
  const st = { pending: {}, warns: [], dones: [], errs: [], prev: null };
  const api = () => makeCellEdit({
    sc,
    fillMode,
    pending: st.pending,
    setPending: (u) => { st.pending = typeof u === 'function' ? u(st.pending) : u; },
    edit: null,
    setEdit: () => {},
    setErr: (e) => { if (e) st.errs.push(e); },
    warn: (m) => st.warns.push(m),
    done: (m) => st.dones.push(m),
    reviewInc,
    revert: () => {},
    mineRef: { current: new Set() },
    touchMine: () => {},
    locked: false,
    noEdit: false,
    canPerf: true,
    busy: false,
    editing: true,
    rowsAll,
    vis: rowsAll.map((_, i) => i),
    hidden: rowsAll.map(() => false),
    nBld: sc.bld.length,
    /* 2026-10-01: буулгалтын урьдчилсан харагдац (FillNew эзэмшинэ) · сэргээлтийн түгжээ */
    restoring,
    ...(preview ? { pastePrev: st.prev, setPastePrev: (v) => { st.prev = v; } } : {}),
  });
  return { st, api };
}
const reset = (a = false) => { asked.length = 0; answer = a; };
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };

/* ── 1. Обьём горим — хувиар бүртгэгдсэн хуучин нүд «+10» → БУУРАЛТЫН асуулт ── */
{
  reset(false);
  const r = row(1, 100, [null, null], [0.5, null]);
  const { st, api } = harness([r]);
  const res = api().commit(r, 0, '10');
  ok(asked.length === 1 && /БУУРНА/.test(asked[0]), `1a: 50% → 10% бууралтыг асуух ёстой (асуулт: ${asked.length})`);
  ok(/50%/.test(asked[0]) && /10%/.test(asked[0]), '1a: асуултад хувиар «50% → 10%»');
  ok(res === false && !('1:0' in st.pending), '1a: «Цуцлах» → бичигдэхгүй');
}
{
  /* Хэвийн нүд (obyem бий) — нэмэлт нь өсгөнө, асуултгүй */
  reset(false);
  const r = row(2, 100, [40, null], [0.4, null]);
  const { st, api } = harness([r]);
  ok(api().commit(r, 0, '10') === true && asked.length === 0, '1b: хэвийн өсөлтөд асуулт гарахгүй');
  ok(st.pending['2:0'] === '10', '1b: нэмэлт бичигдэв');
}
{
  /* Буулгалт — ижил хуучин нүд хоёр мөрөнд */
  reset(false);
  const rs = [row(1, 100, [null, null], [0.5, null]), row(2, 100, [null, null], [0.6, null])];
  const { st, api } = harness(rs);
  api().pasteBlock(0, 0, '10\n10');
  ok(asked.length === 1 && /БУУРНА/.test(asked[0]), `1c: буулгалт бууралтыг асуух ёстой (асуулт: ${asked[0] ?? '—'})`);
  ok(Object.keys(st.pending).length === 0, '1c: «Цуцлах» → юу ч бичигдэхгүй');
}

/* ── 2. Буулгалт — өөр өдрийн хяналтад байгаа нэмэлт ── */
{
  reset(false);
  const rs = [row(1, 100, [50, null], [0.5, null]), row(2, 100, [50, null], [0.5, null])];
  const reviewInc = new Map([['1:0', { n: 30, a: 0.3 }]]);
  const { st, api } = harness(rs, { reviewInc });
  api().pasteBlock(0, 0, '30\n10');
  ok(asked.length === 1 && /ХЭТЭРНЭ/.test(asked[0]), `2a: 50 + 30 (хяналтад) + 30 = 110 > 100 — асуух ёстой (асуулт: ${asked[0] ?? '—'})`);
  ok(Object.keys(st.pending).length === 0, '2a: «Цуцлах» → юу ч бичигдэхгүй');
  /* гараар бичихэд (урьдын зан) ч мөн асууна */
  reset(false);
  ok(api().commit(rs[0], 0, '30') === false && asked.length === 1, '2b: гараар бичихэд ч асууна');
}
{
  /* Хяналтад нэмэлтгүй бол 50 + 30 = 80 — асуултгүй */
  reset(false);
  const rs = [row(1, 100, [50, null], [0.5, null]), row(2, 100, [50, null], [0.5, null])];
  const { st, api } = harness(rs);
  api().pasteBlock(0, 0, '30\n10');
  ok(asked.length === 0 && st.pending['1:0'] === '30' && st.pending['2:0'] === '10', '2c: хэтрэлтгүй бол шууд бичигдэнэ');
}

/* ── 3. Хөвөгч цэг — 1.1 + 2.2 нь Обьём 3.3-аас хэтрээгүй ── */
{
  reset(false);
  const r = row(1, 3.3, [1.1, null], [1.1 / 3.3, null]);
  const { st, api } = harness([r, row(2, 3.3, [1.1, null], [1 / 3, null])]);
  ok(api().commit(r, 0, '2.2') === true && asked.length === 0, '3a: 1.1 + 2.2 = 3.3 — «хэтэрсэн» асуулт гарах ёсгүй');
  ok(st.pending['1:0'] === '2.2', '3a: бичигдэв');
  reset(false);
  const h2 = harness([r, row(2, 3.3, [1.1, null], [1 / 3, null])]);
  h2.api().pasteBlock(0, 0, '2.2\n2.2');
  ok(asked.length === 0, '3b: буулгалтад ч асуулт гарахгүй');
  /* Жинхэнэ хэтрэлт хэвээр асуугдана */
  reset(false);
  ok(api().commit(r, 0, '2.3') === false && asked.length === 1, '3c: 3.4 > 3.3 — асууна');
  /* `actOver` туг — 100% дээр асахгүй, 100.1% дээр асна */
  const c = computeAll([r], 2, null, { '1:0': '2.2' }, {}, [true, true], undefined, 'inc');
  ok(c[0].actOver[0] === false, `3d: 3.3 ÷ 3.3 «100%-иас их» тугтай болох ёсгүй (act=${c[0].act[0]})`);
  const c2 = computeAll([r], 2, null, { '1:0': '2.21' }, {}, [true, true], undefined, 'inc');
  ok(c2[0].actOver[0] === true, '3e: жинхэнэ хэтрэлт тугтай хэвээр');
}

/* ── 4. Буулгалт — тоо биш / тодорхойгүй утга ИЛ анхааруулгаар ── */
{
  reset(true);
  const rs = [row(1, 100, [10, 10], [0.1, 0.1]), row(2, 100, [10, 10], [0.1, 0.1])];
  const { st, api } = harness(rs);
  api().pasteBlock(0, 0, '1,250\t5\n\t7');
  ok(st.pending['1:1'] === '5' && st.pending['2:1'] === '7', '4a: зөв утгууд бичигдэв');
  ok(st.warns.length === 1 && /1,250/.test(st.warns[0]) && /5\/1/.test(st.warns[0]), `4b: няцаагдсан утга (блок · ажил · «1,250») шар анхааруулгаар (warn: ${st.warns[0] ?? '—'})`);
  ok(st.dones.length === 0, '4c: ногоон «амжилт» мессеж гарахгүй');
  reset(true);
  const h2 = harness(rs);
  h2.api().pasteBlock(0, 0, '5\t\n\t7');
  ok(h2.st.warns.length === 0 && h2.st.dones.length === 1, '4d: зөвхөн хоосон нүд алгассан бол ногоон хэвээр');
}

/* ── 5. Ctrl+S — нээлттэй нүд няцаагдвал илгээхгүй (эх кодын шалгуур) ── */
{
  const src = readFileSync(new URL('./FillNew.tsx', import.meta.url), 'utf8');
  ok(/if \(flushEditRef\.current\(\)\) setPublishQueued\(true\);/.test(src), '5: Ctrl+S нь `commit`-ийн үр дүнг шалгах ёстой');
  ok(/return commit\(rowsAll\[edit\.i\]/.test(src), '5: `flushEditRef` нь `commit`-ийн үр дүнг буцаана');
}

/* ── 6. «Батлагдсан» хувь нь ИЛГЭЭЛТГҮЙ архиваас (эх кодын шалгуур) ── */
{
  const rowsSrc = readFileSync(new URL('./fill/useRows.ts', import.meta.url), 'utf8');
  const fill = readFileSync(new URL('./FillNew.tsx', import.meta.url), 'utf8');
  ok(/rowsAll\.map\(\(r\) => ovBase\.get\(r\.oid\) \?\? r\)/.test(rowsSrc), '6: `saved` нь илгээлтийн давхарлалтын СУУРЬ (`ovBase`)-аас бодогдоно');
  ok(/usePkgPct\(\{[^}]*ovBase \}\)/.test(fill), '6: FillNew нь `ovBase`-ийг дамжуулна');
  const pub = fill.slice(fill.indexOf('const publish = useCallback'), fill.indexOf('// Ctrl+S'));
  ok((pub.match(/setOvBase\(/g) ?? []).length >= 2, '6: илгээсний дараа давхарлалтын суурь шинэчлэгдэнэ');
}

/* ── 8. Мөрийн Обьёмгүй ажил — горим сольж бичихэд нөгөө хэсэг («%10» / «15») алга болохгүй ── */
{
  reset(true);
  const r = row(1, null, [100, null], [0.4, null]);
  const h = harness([r, row(2, null, [100, null], [0.4, null])]);
  h.st.pending = { '1:0': '%10', '2:0': '%10' };
  ok(h.api().cellSeed(r, 0) === '', '8a: Обьём горимд хувийн нэмэлт харагдахгүй (илэрхийлэх аргагүй)');
  ok(h.api().commit(r, 0, '5') === true && h.st.pending['1:0'] === '5 %10', `8b: +5 бичихэд +10% ХАДГАЛАГДАНА (${h.st.pending['1:0']})`);
  ok(h.api().cellSeed(r, 0) === '5', '8c: холимог нэмэлтийн обьёмын хэсэг оролтод харагдана');
  ok(h.api().commit(r, 0, '0') === true && h.st.pending['1:0'] === '%10', `8d: «0» — зөвхөн обьёмын хэсэг буцна (${h.st.pending['1:0']})`);
  h.api().pasteBlock(0, 0, '7\n8');
  ok(h.st.pending['1:0'] === '7 %10' && h.st.pending['2:0'] === '8 %10', `8e: буулгалт ч хувийн хэсгийг хадгална (${h.st.pending['1:0']} · ${h.st.pending['2:0']})`);
  /* Хувь горим — обьёмын хэсэг хадгалагдана */
  const hp = harness([r], { fillMode: 'pct' });
  hp.st.pending = { '1:0': '15' };
  ok(hp.api().commit(r, 0, '10') === true && hp.st.pending['1:0'] === '15 %10', `8f: Хувь горимд +10% бичихэд +15 хадгалагдана (${hp.st.pending['1:0']})`);
  /* Мөрийн Обьёмтой бол хуучин дүрэм (хөрвүүлж нэг тоо) */
  const rv = row(3, 100, [10, null], [0.1, null]);
  const hv = harness([rv]);
  hv.st.pending = { '3:0': '%10' };
  ok(hv.api().cellSeed(rv, 0) === '10', '8g: Обьёмтой мөрд хувь → обьём руу хөрвөнө (хуучин дүрэм)');
  ok(hv.api().commit(rv, 0, '5') === true && hv.st.pending['3:0'] === '5', '8h: Обьёмтой мөрд бичсэн нь бүхэлдээ орлоно (хуучин дүрэм)');
}

/* ── 7. Төлөвлөсөн обьёмын нүд — «1 250» · «12,5» уншигдана, сөрөг/буруу ИЛ анхааруулгатай ── */
{
  const pv = readFileSync(new URL('./fill/PvCell.tsx', import.meta.url), 'utf8');
  ok(/normCell\(t0\)/.test(pv), '7: PvCell нь `normCell`-ээр задална (мянгатын зай · аравтын таслал)');
  ok(/Number\(t\) < 0/.test(pv) && /onBad\?\.\(/.test(pv), '7: сөрөг/буруу утга ИЛ анхааруулгатай няцаагдана');
  const { normCell } = await import('./paste.ts');
  ok(normCell('1 250') === '1250' && normCell('12,5') === '12.5' && normCell('1,250') === null, '7: задлагчийн дүрэм');
}

/* ── 8. БУУЛГАЛТЫН УРЬДЧИЛСАН ХАРАГДАЦ (2026-10-01, хэрэглэгч: бүгдийг зас) ── */
{
  reset(true);
  const rs = [row(1, 100, [0, 0], [0, 0]), row(2, 100, [0, 0], [0, 0])];
  const h = harness(rs, { preview: true });
  h.api().pasteBlock(0, 0, '5\tабв\n6\t7');
  ok(Object.keys(h.st.pending).length === 0, '8a: татгалзах нүдтэй буулгалт ШУУД бичигдэх ёсгүй');
  ok(h.st.prev && h.st.prev.ok.size === 3 && h.st.prev.rej.size === 1, `8a: 3 бичигдэх · 1 татгалзсан (${h.st.prev?.ok.size}/${h.st.prev?.rej.size})`);
  ok(h.st.prev.rej.has('1:1') && /абв/.test(h.st.prev.rej.get('1:1')), '8a: татгалзсан нүд шалтгаантай (`${oid}:${b}`)');
  h.api().confirmPaste();
  ok(h.st.pending['1:0'] === '5' && h.st.pending['2:0'] === '6' && h.st.pending['2:1'] === '7' && !('1:1' in h.st.pending), '8b: «Бичих» — хүчинтэй нүд л бичигдэнэ');
  ok(h.st.prev === null, '8b: урьдчилсан харагдац хаагдана');
  /* Бүх нүд хүчинтэй — шууд бичнэ (нэмэлт алхамгүй) */
  const h2 = harness([row(1, 100, [0, 0], [0, 0])], { preview: true });
  h2.api().pasteBlock(0, 0, '1\t2');
  ok(h2.st.prev === null && h2.st.pending['1:0'] === '1' && h2.st.pending['1:1'] === '2', '8c: хүчинтэй буулгалт шууд бичигдэнэ');
  /* «Болих» */
  const h3 = harness(rs, { preview: true });
  h3.api().pasteBlock(0, 0, '5\tабв');
  h3.api().cancelPaste();
  ok(h3.st.prev === null && Object.keys(h3.st.pending).length === 0, '8d: «Болих» — юу ч бичигдэхгүй');
  /* Сэргээлтийн үед буулгалт түгжээтэй */
  const h4 = harness(rs, { restoring: true });
  h4.api().pasteBlock(0, 0, '1\t2');
  ok(Object.keys(h4.st.pending).length === 0 && h4.st.warns.length === 1, '8e: «Ноорог сэргээж байна…» үед буулгахгүй');
  /* Үлдэгдлийн тайлбар */
  const r5 = row(5, 100, [40, 0], [0.4, 0]);
  const h5 = harness([r5]);
  h5.st.pending['5:0'] = '10';
  const hint = h5.api().remainHint(r5, 0, undefined);
  ok(/100 − 40 − 0 − 10 = 50/.test(hint), `8f: үлдэгдэл = 100 − 40 − 0 − 10 = 50 (${hint})`);
  ok(h5.api().remainHint(row(6, null, [0, 0], [0, 0]), 0) === '', '8f: Обьёмгүй мөрд тайлбаргүй (null ≠ 0)');
}

/* ── 9. «БУСАД ТАЛБАР» ба ТОЛГОЙН БҮТЭЦ (2026-10-09, хэрэглэгч: «table fieldудыг бүгдийг шалгаж бүх
 *       баганыг ил гарга») — `SheetHead` + `FillRows`-ийг жинхэнээр зурж:
 *       (а) толгойд ХООСОН <tr> алга (хоосон мөр sticky толгойг эвдсэн — SheetHead-ийн 2026-10-09 ⚠️);
 *       (б) толгойн торын өргөн (rowSpan/colSpan) == биеийн мөрийн нүдний тоо == FillNew-ийн colSpan;
 *       (в) «Бусад талбар» нь үйлчилгээнд БАЙГАА талбараар л, заасан дарааллаар, зөвхөн уншина;
 *       (г) нуусан үед (`extra = []`) хүснэгт хуучин бүтэцтэйгээ ЯГ ижил. ── */
{
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { SheetHead } = await import('./fill/SheetHead.tsx');
  const { FillRows } = await import('./fill/FillRows.tsx');
  const { extraCols } = await import('./fill/extraCols.ts');
  const { resolveSchema } = await import('./bagts.pkg.ts');
  const { seriesBands } = await import('./bagts.bands.ts');
  const F = (name, type = 'esriFieldTypeDouble') => ({ name, type });
  const common = [
    F('ObjectID', 'esriFieldTypeOID'), F('GlobalID', 'esriFieldTypeGlobalID'), F('F_', 'esriFieldTypeString'), F('Ажил', 'esriFieldTypeString'),
    F('Хувийн_жин'), F('Хувийн_жин1'), F('Хувийн_жин__Одоо_байгаа'), F('Обьём'), F('Нэгж_өртөг'), F('Мөнгөн_дүн'),
    F('Төлөвлөгөөт_гүйцэтгэл'), F('Бодит_гүйцэтгэл'), F('Төлөвлөгөө_биелэлт'),
    F('Шинэчлэгдсэн_огноо', 'esriFieldTypeDate'), F('buglusun_ognoo', 'esriFieldTypeDate'),
    F('Des_dugaar', 'esriFieldTypeInteger'), F('Hamaaral', 'esriFieldTypeString'), F('Инженерийн_төлөвлөсөн_обьём'),
    F('gun', 'esriFieldTypeSmallInteger'), F('hun_huch', 'esriFieldTypeInteger'), F('mashin_mehanizm', 'esriFieldTypeInteger'),
    F('obyem_sum'), F('CreationDate', 'esriFieldTypeDate'), F('Creator', 'esriFieldTypeString'),
    F('EditDate', 'esriFieldTypeDate'), F('Editor', 'esriFieldTypeString'),
  ];
  /* Блокгүй (Bagts_6_1 · 2026-10-09-ний амьд бүтэц) */
  const blokgui = [...common, F('Ажил_гүйцэтгэл'), F('Төлөвлөгөөт_гүйцэтгэл1'),
    F('Төлөвлөгөөт_хуваарь__Эхлэх', 'esriFieldTypeDate'), F('Төлөвлөгөөт_хуваарь__Дуусах', 'esriFieldTypeDate'),
    F('geree_ehleh', 'esriFieldTypeDate'), F('geree_duusah', 'esriFieldTypeDate'),
    F('bodit_ehleh', 'esriFieldTypeDate'), F('bodit_duusah', 'esriFieldTypeDate')];
  /* Барилгын (2 блок, мөрийн түвшний geree/bodit/L/M АЛГА — блокийн F…_geree_* «Хуваарь»-д) */
  const bld = [...common];
  for (const b of ['5_1', '5_2']) bld.push(F(`F${b}_гүйцэтгэл`), F(`F${b}_төлөвлөгөөт`), F(`F${b}_obyem`),
    F(`F${b}_барилга_Эхлэх`, 'esriFieldTypeDate'), F(`F${b}_барилга_Дуусах`, 'esriFieldTypeDate'),
    F(`F${b}_geree_ehleh`, 'esriFieldTypeDate'), F(`F${b}_bodit_ehleh`, 'esriFieldTypeDate'));

  const D = (s) => Date.parse(s + 'T00:00:00Z');
  const mk = (sc, oid, raw) => ({
    oid, no: String(oid), des: null, ham: null, work: `Ажил ${oid}`, depth: 1, group: false,
    wC: null, wD: null, vol: 100, plannedVol: null, unit: null, money: null,
    act: sc.bld.map(() => null), obyem: sc.bld.map(() => null), start: sc.bld.map(() => null), end: sc.bld.map(() => null),
    gStart: sc.bld.map(() => null), gEnd: sc.bld.map(() => null), aStart: sc.bld.map(() => null), aEnd: sc.bld.map(() => null),
    hun: null, mashin: null, raw,
  });
  const noop = () => {};
  const render = (sc, rows, extra) => {
    const nBld = sc.bld.length;
    const calc = computeAll(rows, nBld, D('2026-10-01'), {}, {}, true, undefined, 'inc', sc.synthetic);
    const head = renderToStaticMarkup(React.createElement('table', null, React.createElement(SheetHead, {
      sc, nBld, bands: seriesBands('b33_9f', sc.bld), grip: () => ({}), extra,
    })));
    const body = renderToStaticMarkup(React.createElement('table', null, React.createElement('tbody', null, React.createElement(FillRows, {
      vis: rows.map((_, i) => i), winFrom: 0, winTo: rows.length, rowsAll: rows, calc, addedOids: new Set(),
      collapsed: new Set(), toggle: noop, ro: (m) => ({ title: m, onClick: noop }), editing: false, canObyemEdit: false,
      pvSub: null, sc, pvPend: {}, pvPreview: null, setPvPend: noop, pending: {}, byMap: new Map(), fillMode: 'obyem',
      ovBase: new Map(), meKey: '', volMode: () => false, edit: null, view: undefined, backChg: new Set(), backOk: new Set(),
      locked: false, noEdit: false, say: noop, canPerf: false, busy: false, pctOnly: () => false, pctHintRef: { current: false },
      setVal: noop, cellSeed: () => '', setEdit: noop, hitKey: null, noPerf: true, pasteBlock: () => false,
      inputRef: { current: null }, prevHint: () => '', val: '', commit: noop, nextEditable: noop, nextBlockEditable: noop,
      pendDate: {}, setPick: noop, asOf: D('2026-10-01'), asOfOrig: D('2026-10-01'), extra,
    }))));
    /* Толгойн тор — rowSpan/colSpan-аар эзлэгдсэн нүд бүрийг тооцно */
    const trs = [...head.matchAll(/<tr>(.*?)<\/tr>/g)].map((m) => m[1]);
    const occ = trs.map(() => []);
    trs.forEach((tr, ri) => {
      let c = 0;
      for (const m of tr.matchAll(/<th([^>]*)>/g)) {
        const rs = Number(/rowSpan="(\d+)"/i.exec(m[1])?.[1] ?? 1);
        const cs = Number(/colSpan="(\d+)"/i.exec(m[1])?.[1] ?? 1);
        while (occ[ri][c]) c += 1;
        for (let dr = 0; dr < rs; dr += 1) for (let dc = 0; dc < cs; dc += 1) if (occ[ri + dr]) occ[ri + dr][c + dc] = 1;
        c += cs;
      }
    });
    const widths = occ.map((r) => r.filter(Boolean).length);
    const rowCells = (i) => [...(new RegExp(`<tr data-r="${i}"[^>]*>(.*?)</tr>`).exec(body)?.[1] ?? '').matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1]);
    return { head, body, trs, widths, tds: rowCells(0).length, rowCells, nBld };
  };

  /* (а)(б)(в) блокгүй — бүх 16 багана */
  const scB = resolveSchema(blokgui, { fill: true });
  const exB = extraCols(scB);
  /* ⚠️ 2026-10-08: 14 шаардлагагүй багана хасагдав (`extraCols.DEFS`-ийн ⚠️) */
  ok(exB.map((x) => x.key).join(',') === 'aS,aE',
    `9a: блокгүй — зөвхөн Бодит эхэлсэн/дууссан (${exB.map((x) => x.key)})`);
  ok(!exB.some((x) => /^(ObjectID|GlobalID)$/i.test(x.field)), '9a: ObjectID/GlobalID харуулахгүй');
  const rawB = {
    Des_dugaar: 17, Hamaaral: '18FS3,22SS-5', gun: 2, hun_huch: 0, mashin_mehanizm: null,
    geree_ehleh: D('2026-03-01'), geree_duusah: D('2026-09-30'), bodit_ehleh: D('2026-03-05'), bodit_duusah: null,
    buglusun_ognoo: D('2026-10-08'), 'Ажил_гүйцэтгэл': 0.253, 'Төлөвлөгөөт_гүйцэтгэл1': 0,
    CreationDate: Date.UTC(2026, 9, 8, 3, 0), Creator: 'monmap_admin', EditDate: null, Editor: 'tumenjargal.g',
  };
  const B = render(scB, [mk(scB, 1, rawB), mk(scB, 2, {})], exB);
  /* ⚠️ 2026-10-08: синтетик толгой 2 мөр (бүлэг → баганын нэр + Эхлэх/Дуусах) — хоосон зурвасгүй */
  ok(B.trs.length === 2 && B.trs.every((t) => /<th/.test(t)), `9b: блокгүй толгой 2 мөр, ХООСОН <tr> алга (${B.trs.map((t) => (t.match(/<th/g) ?? []).length)})`);
  ok(!/aria-hidden="true"/.test(B.head), '9b: синтетик толгойд хоосон (aria-hidden) нүд алга');
  ok(/Эхлэх/.test(B.trs[1]) && /Дуусах/.test(B.trs[1]), '9b: Эхлэх/Дуусах 2-р мөрөнд');
  const wantB = 14 + B.nBld * 4 + exB.length;
  ok(B.widths.every((w) => w === wantB) && B.tds === wantB, `9b: толгой ${B.widths} == бие ${B.tds} == 14 + n×4 + ${exB.length} (${wantB})`);
  ok(/Бусад талбар/.test(B.head) && /rowSpan="3"/i.test(B.head), '9b: «Бусад талбар» бүлгийн гарчиг + баганын нэр 3 мөр хамарна');
  const cellsB = B.rowCells(0).slice(-exB.length);
  ok(cellsB.join('|') === '2026-03-05|',
    `9c: утга/хэлбэр (огноо YYYY-MM-DD, null хоосон): ${cellsB.join('|')}`);
  ok(B.rowCells(1).slice(-exB.length).every((t) => t === ''), '9c: хадгалсан утгагүй мөр — бүгд хоосон (0 БИШ)');

  /* (б)(в) барилгын — мөрийн түвшний талбар л (geree/bodit/L/M алга), блокийн нэр ОРОХГҮЙ */
  const scK = resolveSchema(bld, { fill: true });
  const exK = extraCols(scK);
  /* ⚠️ 2026-10-08: барилгын багцад мөрийн түвшний bodit_* талбар алга → «Бусад талбар» хоосон */
  ok(exK.length === 0, `9d: барилгын — мөрийн бодит огноогүй тул багана алга (${exK.map((x) => x.key)})`);
  ok(!exK.some((x) => /^F\d/.test(x.field)), '9d: блокийн F…_geree/bodit «Бусад талбар»-т ОРОХГҮЙ');
  const K = render(scK, [mk(scK, 1, { Des_dugaar: 3 })], exK);
  const wantK = 14 + K.nBld * 4 + exK.length;
  ok(K.trs.length === 4 && K.trs.every((t) => /<th/.test(t)), '9d: барилгын толгой — ХООСОН <tr> алга');
  ok(K.widths.every((w) => w === wantK) && K.tds === wantK, `9d: толгой ${K.widths} == бие ${K.tds} == ${wantK}`);

  /* (г) нуусан — хуучин бүтэц ЯГ */
  const H = render(scK, [mk(scK, 1, {})], []);
  ok(!/Бусад талбар/.test(H.head) && H.widths.every((w) => w === 14 + H.nBld * 4) && H.tds === 14 + H.nBld * 4, '9e: нуусан үед хуучин 14 + n×4');
  const HB = render(scB, [mk(scB, 1, {})], []);
  ok(HB.trs.every((t) => /<th/.test(t)) && HB.widths.every((w) => w === 18) && HB.tds === 18, `9e: блокгүй, нуусан — 18 багана, хоосон <tr> алга (${HB.widths}/${HB.tds})`);

  /* Эх код: FillNew-ийн colSpan бүгд extra-г тооцно · сонголт хэрэглэгч тус бүрд, try/catch */
  const fn = readFileSync(new URL('./FillNew.tsx', import.meta.url), 'utf8');
  ok(!/colSpan=\{14 \+ nBld \* 4\}/.test(fn) && (fn.match(/colSpan=\{14 \+ nBld \* 4 \+ extra\.length\}/g) ?? []).length === 3, '9f: FillNew-ийн 3 colSpan «Бусад талбар»-ыг тооцно');
  ok((fn.match(/extra=\{extra\}/g) ?? []).length === 2 && /extraPrefKey\(user\?\.username\)/.test(fn), '9f: SheetHead/FillRows ИЖИЛ массив · хэрэглэгч тус бүрийн түлхүүр');
  const xc = readFileSync(new URL('./fill/extraCols.ts', import.meta.url), 'utf8');
  ok((xc.match(/try \{\s*(return )?localStorage/g) ?? []).length === 2, '9f: localStorage унших/бичих хоёулаа try/catch-тай');
  const tb = readFileSync(new URL('./fill/toolbar.tsx', import.meta.url), 'utf8');
  ok(/aria-pressed=\{showExtra\}/.test(tb) && /onClick=\{toggleExtra\}/.test(tb), '9f: «Бусад талбар» товч (aria-pressed)');
  const fr = readFileSync(new URL('./fill/FillRows.tsx', import.meta.url), 'utf8');
  const xBlock = fr.slice(fr.indexOf('extra.map('));
  ok(!/onChange|<input|setPending|setPendDate|setPick/.test(xBlock.slice(0, xBlock.indexOf('</tr>'))), '9f: «Бусад талбар» нүдэнд засах зам ҮГҮЙ');
}

console.log(`✅ cellEdit: ${n} шалгалт — бүгд давлаа`);
