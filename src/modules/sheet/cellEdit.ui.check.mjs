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

console.log(`✅ cellEdit: ${n} шалгалт — бүгд давлаа`);
