/**
 * ТЭЗҮ · АЖЛЫН ЗУРАГ ТӨСӨЛ — засварын ачаа (`buildEdits`), дэд шат нэмэх, эрэмбэ (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/zuragTosol.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ЗӨВХӨН ӨӨРЧЛӨГДСӨН ТАЛБАР илгээгдэнэ — анхны утга руу буцсан оролт, ижил өдөр засвар биш.
 *   2. ОГНОО UTC шөнө дундаар — орон нутгийн цагаар бол УБ-д өдөр гулсаж өөрчлөгдөөгүй огноо илгээгдэнэ.
 *   3. null ≠ 0 — хоосон явц `null`, 0 БИШ; 0–100-аас гадуур, тоо биш, эхлэх > дуусах бол ИЛГЭЭХГҮЙ.
 *   4. Шинэ дэд шатны мөр — БҮТЦИЙН (`cashflow_id` ил null), код давтагдашгүй, эцгийн доор эрэмбэлэгдэнэ,
 *      жингийн нийлбэр 1 (✕-ээр хассан ч дахин хуваагдана) тул эцгийн явц Σ F·S-ээр 100% хүрнэ.
 *   5. Зэрэг засвар — бидний бичих талбарыг өөр хүн зассан бол илэрнэ.
 *   6. 2000–2100-аас гадуурх огноо, ганц огноо (хос дутуу) ИЛГЭЭХГҮЙ — чимээгүй алга болохгүй.
 *   7. Импортын хөвөгч цэгийн явц («7.000000000000001») бөөрөнхийлөгдөж, засвар гэж тооцогдохгүй.
 */
import assert from 'node:assert/strict';
import { buildTree, computePlan } from './projectPlan.ts';
import {
  buildEdits, conflicts, cmpKod, sortByKod, setEdit, textOf, pendingCount, dropAdd, effectiveRows,
  substageInfo, substageAdds, displayCodes, isEditable, parsePct, parseDay, dayOf, dateIn, toStored,
  EMPTY_PENDING, DESIGN_SUBSTAGES, origText, substageWeight, weighAdds, zeroWeight, rowPhase,
} from './zuragTosol.ts';

const NAMES = { oid: 'objectid', cfId: 'cashflow_id' };
const d = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/* ── Жижиг мод: ТЭЗҮ (1 навч) · Ажлын зураг төсөл (бүлэг → 2 багц) ── */
const base = [
  { objectid: 10, dd_kod: '1', etseg_kod: null, tuvshin: 0, uy_shat: 'ТЭЗҮ', ajil_uilchilgee: 'ТЭЗҮ', tusul_ezleh_huvi: 0.05 },
  { objectid: 11, dd_kod: '1.1', etseg_kod: '1', tuvshin: 1, uy_shat: 'ТЭЗҮ', bagts: 'БАГЦ 1-6', ajil_uilchilgee: 'ТЭЗҮ боловсруулах', heseg_ezleh_huvi: 1,
    geree_ehleh: d('2024-04-08'), geree_duusah: d('2024-09-20'), guitsetgel_huvi: 100, cashflow_id: 3 },
  { objectid: 20, dd_kod: '2', etseg_kod: null, tuvshin: 0, uy_shat: 'Ажлын зураг төсөл', ajil_uilchilgee: 'Ажлын зураг төсөл', tusul_ezleh_huvi: 0.1 },
  { objectid: 21, dd_kod: '2.1', etseg_kod: '2', tuvshin: 1, uy_shat: 'Ажлын зураг төсөл', bagts: 'Багц 1-4', ajil_uilchilgee: 'Орон сууц', heseg_ezleh_huvi: 1 },
  { objectid: 23, dd_kod: '2.1.10', etseg_kod: '2.1', tuvshin: 2, uy_shat: 'Ажлын зураг төсөл', bagts: 'Багц-2', ajil_uilchilgee: 'Багц 2 зураг', heseg_ezleh_huvi: 0.5,
    geree_ehleh: d('2026-01-01'), geree_duusah: d('2026-12-31'), guitsetgel_huvi: 40 },
  { objectid: 22, dd_kod: '2.1.9', etseg_kod: '2.1', tuvshin: 2, uy_shat: 'Ажлын зураг төсөл', bagts: 'Багц-1', ajil_uilchilgee: 'Багц 1 зураг', heseg_ezleh_huvi: 0.5,
    geree_ehleh: d('2026-01-01'), geree_duusah: d('2026-06-30'), guitsetgel_huvi: null },
];

/* ── Эрэмбэ: «2.1.9» < «2.1.10», эцэг хүүхдээсээ өмнө ── */
assert.ok(cmpKod('2.1.9', '2.1.10') < 0, '9 < 10 (тоогоор)');
assert.ok(cmpKod('2.1', '2.1.1') < 0, 'эцэг хүүхдээс өмнө');
assert.ok(cmpKod('2.1.1#2', '2.1.2') < 0, '«#2» дагавартай код');
assert.deepEqual(sortByKod(base).map((r) => r.dd_kod), ['1', '1.1', '2', '2.1', '2.1.9', '2.1.10']);

/* ── Задлалт ── */
assert.deepEqual(parsePct(''), { ok: true, v: null }, 'хоосон явц → null (0 БИШ)');
assert.deepEqual(parsePct('0'), { ok: true, v: 0 });
assert.deepEqual(parsePct('12,5'), { ok: true, v: 12.5 }, 'аравтын таслал');
assert.equal(parsePct('101').ok, false);
assert.equal(parsePct('-1').ok, false);
assert.equal(parsePct('abc').ok, false);
assert.deepEqual(parseDay('2026.03.05'), { ok: true, v: d('2026-03-05') }, 'UTC шөнө дунд');
assert.deepEqual(parseDay(''), { ok: true, v: null });
assert.equal(parseDay('2026-02-30').ok, false, 'байхгүй өдөр');
assert.equal(parseDay('1999-05-01').ok, false, '2000-аас өмнө — saneDate-ийн хүрээнээс гадуур');
assert.equal(parseDay('2100-06-01').ok, false, '2100-01-01-ээс хойш');
assert.deepEqual(parseDay('2000-01-01'), { ok: true, v: d('2000-01-01') }, 'доод хил');
assert.equal(dayOf(d('2026-03-05')), '2026-03-05');
assert.equal(dayOf(null), '');
assert.equal(dateIn('2025-09-25'), d('2025-09-25'), 'DateOnly мөр');
assert.equal(dateIn(d('2025-09-25')), d('2025-09-25'));

/* ── toStored: oid/cashflow_id нэр дуудагчаас, хоосон → null ── */
{
  const r = toStored({ objectid: 5, dd_kod: ' 2.1 ', cashflow_id: null, guitsetgel_huvi: '', geree_ehleh: d('2026-01-01') }, NAMES);
  assert.equal(r.objectid, 5);
  assert.equal(r.dd_kod, '2.1');
  assert.equal(r.cashflow_id, null);
  assert.equal(r.guitsetgel_huvi, null, '«» → null');
  assert.equal(r.geree_ehleh, d('2026-01-01'));
}

/* ── 1. Зөвхөн өөрчлөгдсөн талбар ── */
const r22 = base.find((r) => r.objectid === 22);
const r23 = base.find((r) => r.objectid === 23);
{
  let p = EMPTY_PENDING;
  p = setEdit(p, r22, 'pct', '35');
  p = setEdit(p, r22, 'end', '2026-07-15');
  p = setEdit(p, r23, 'start', '2026-01-01'); // ижил өдөр — засвар биш
  assert.equal(textOf(p, r23, 'start'), '2026-01-01');
  assert.equal(pendingCount(p), 1, 'ижил утга засварт тоологдохгүй');
  const e = buildEdits(base, p, NAMES);
  assert.deepEqual(e.issues, []);
  assert.deepEqual(e.updates, [{ objectid: 22, guitsetgel_huvi: 35, geree_duusah: d('2026-07-15') }]);
  assert.deepEqual(e.adds, []);
  /* Анхны утга руу буцаавал засвар алга */
  p = setEdit(p, r22, 'pct', '');
  p = setEdit(p, r22, 'end', '2026-06-30');
  assert.equal(pendingCount(p), 0);
  assert.deepEqual(buildEdits(base, p, NAMES).updates, []);
}

/* ── 1б. 2026-10-26 (аудит): МӨНГӨНИЙ мөрийн явц шатны талбарт ДАВХАР (ТУХ/Нэгтгэлтэй нэг тоо); бүтцийн мөрд үгүй ── */
{
  const r11 = base.find((r) => r.objectid === 11);
  assert.equal(rowPhase(base, r11), 'tezu');
  assert.equal(rowPhase(base, { dd_kod: '2.1.9', etseg_kod: '2.1' }), 'zurag', 'эцгийн uy_shat');
  assert.deepEqual(buildEdits(base, setEdit(EMPTY_PENDING, r11, 'pct', '60'), NAMES).updates,
    [{ objectid: 11, guitsetgel_huvi: 60, tezu: 60 }]);
  const money = base.map((r) => (r.objectid === 22 ? { ...r, cashflow_id: 9 } : r));
  const m22 = money.find((r) => r.objectid === 22);
  assert.deepEqual(buildEdits(money, setEdit(EMPTY_PENDING, m22, 'pct', '35'), NAMES).updates,
    [{ objectid: 22, guitsetgel_huvi: 35, ajliin_zurag_tusul: 35 }]);
  assert.deepEqual(buildEdits(money, setEdit(EMPTY_PENDING, m22, 'end', '2026-07-15'), NAMES).updates,
    [{ objectid: 22, geree_duusah: d('2026-07-15') }], 'огноо засварт шатны талбар хөндөгдөхгүй');
}

/* ── 2. Явцыг арилгах → null (0 БИШ); 0 бичвэл 0 ── */
{
  const e1 = buildEdits(base, setEdit(EMPTY_PENDING, r23, 'pct', ''), NAMES);
  assert.deepEqual(e1.updates, [{ objectid: 23, guitsetgel_huvi: null }]);
  const e0 = buildEdits(base, setEdit(EMPTY_PENDING, r22, 'pct', '0'), NAMES);
  assert.deepEqual(e0.updates, [{ objectid: 22, guitsetgel_huvi: 0 }], 'null → 0 бол өөрчлөлт');
}

/* ── 3. Алдаатай оролт → илгээхгүй ── */
{
  let p = setEdit(EMPTY_PENDING, r22, 'pct', '120');
  p = setEdit(p, r23, 'start', '2027-02-01'); // хадгалсан дуусах 2026-12-31-ээс хойш
  const e = buildEdits(base, p, NAMES);
  assert.deepEqual(e.issues.map((i) => [i.code, i.kind]).sort(), [['2.1.10', 'order'], ['2.1.9', 'pct']]);
  assert.deepEqual(e.updates, [], 'алдаатай мөр илгээгдэхгүй');
  const bad = buildEdits(base, setEdit(EMPTY_PENDING, r22, 'start', '05.01.2026'), NAMES);
  assert.equal(bad.issues[0].kind, 'date', 'өдөр-эхэлсэн хэлбэр хоёрдмол → татгалзана');
  const gone = buildEdits(base, { edits: { o999: { pct: '5' } }, adds: [] }, NAMES);
  assert.equal(gone.issues[0].kind, 'missing');
}

/* ── 4. Дэд шат нэмэх ── */
{
  const tree = buildTree(sortByKod(base));
  assert.deepEqual(tree.issues, []);
  const n22 = tree.byCode.get('2.1.9');
  const n21 = tree.byCode.get('2.1');
  const n11 = tree.byCode.get('1.1');
  assert.deepEqual(substageInfo(n22), { can: true, missing: [...DESIGN_SUBSTAGES] });
  assert.equal(substageInfo(n21).can, false, 'бүлгийн мөрийн (хүүхэд нь багц) доор нэмэхгүй');
  assert.equal(substageInfo(n11).can, false, 'ТЭЗҮ үе шатад дэд шат байхгүй');
  assert.ok(isEditable(n22) && !isEditable(n21), 'навч л засагдана');

  const adds = substageAdds(n22, tree);
  assert.deepEqual(adds.map((r) => r.dd_kod), ['2.1.9.1', '2.1.9.2', '2.1.9.3', '2.1.9.4']);
  assert.ok(adds.every((r) => r.etseg_kod === '2.1.9' && r.tuvshin === 3 && r.uy_shat === 'Ажлын зураг төсөл'
    && r.bagts === 'Багц-1' && r.cashflow_id === null && r.objectid === null && r.heseg_ezleh_huvi === 0.25));

  let p = { edits: {}, adds };
  p = setEdit(p, adds[0], 'pct', '100');
  p = setEdit(p, adds[1], 'pct', '50');
  p = setEdit(p, adds[1], 'start', '2026-02-01');
  /* Ганц огноо → 'pair' алдаа (spanOf хоёулаа байгаа мөрийг л авдаг) */
  assert.deepEqual(buildEdits(base, p, NAMES).issues.map((i) => [i.code, i.kind]), [['2.1.9.2', 'pair']]);
  p = setEdit(p, adds[1], 'end', '2026-03-31');
  assert.equal(pendingCount(p), 4);

  /* Урьдчилсан мод: шинэ мөрүүд эцгийнхээ доор, эцэг навч биш болно; эцгийн S = Σ ¼·S */
  const eff = effectiveRows(base, p);
  assert.deepEqual(eff.map((r) => r.dd_kod).slice(4, 9), ['2.1.9', '2.1.9.1', '2.1.9.2', '2.1.9.3', '2.1.9.4']);
  const t2 = buildTree(eff);
  assert.deepEqual(t2.issues, []);
  const res = computePlan(t2, {}, d('2026-04-01'));
  assert.equal(res.get('2.1.9').S, 0.25 * 100 + 0.25 * 50, 'эцгийн явц дэд шатуудаас (хоосон дэд шат нийлбэрт орохгүй)');
  assert.equal(substageInfo(t2.byCode.get('2.1.9')).can, false, 'бүгд нэмэгдсэн — дахин санал болгохгүй');
  assert.equal(res.get('2.1.9.3').S, null, 'бөглөөгүй дэд шат null (0 БИШ)');
  assert.ok(res.get('2.1.9.3').N != null, 'огноогүй дэд шат эцгийн огноогоор төлөвлөгөөт % авна');

  /* Дутуу дэд шат нөхөх — код давхардахгүй */
  const partial = buildTree(effectiveRows(base, { edits: {}, adds: adds.slice(0, 2) }));
  const more = substageAdds(partial.byCode.get('2.1.9'), partial);
  assert.deepEqual(more.map((r) => [r.dd_kod, r.ajil_uilchilgee]), [['2.1.9.3', 'Техникийн нөхцөл'], ['2.1.9.4', 'Магадлал']]);

  /* Ачаа */
  const e = buildEdits(base, p, NAMES);
  assert.deepEqual(e.issues, []);
  assert.equal(e.updates.length, 0);
  assert.equal(e.adds.length, 4);
  assert.deepEqual(e.adds[1], {
    dd_kod: '2.1.9.2', etseg_kod: '2.1.9', tuvshin: 3, uy_shat: 'Ажлын зураг төсөл', bagts: 'Багц-1', blok: null,
    ajil_uilchilgee: 'Загвар зураг', heseg_ezleh_huvi: 0.25,
    geree_ehleh: d('2026-02-01'), geree_duusah: d('2026-03-31'), guitsetgel_huvi: 50, cashflow_id: null,
  });
  assert.ok(!('objectid' in e.adds[0]), 'шинэ мөр OID-гүй');
  assert.ok(e.adds.every((a) => 'cashflow_id' in a && a.cashflow_id === null), 'БҮТЦИЙН мөр — cashflow_id ил null');

  /* Буцаах */
  const back = dropAdd(p, adds[1]);
  assert.equal(back.adds.length, 3);
  assert.ok(!('n2.1.9.2' in back.edits), 'шинэ мөрийн засвар хамт арилна');

  /* ✕-ийн дараа үлдсэн 3 дэд шатны жин 1/3 — бүгд 100% бол эцэг 100% (75% БИШ) */
  const eb = buildEdits(base, back, NAMES);
  assert.ok(eb.adds.every((a) => Math.abs(a.heseg_ezleh_huvi - 1 / 3) < 1e-12), 'жин дахин хуваагдана');
  let full = back;
  for (const a of back.adds) full = setEdit(full, a, 'pct', '100');
  const rf = computePlan(buildTree(effectiveRows(base, full)), {}, d('2026-04-01'));
  assert.ok(Math.abs(rf.get('2.1.9').S - 100) < 1e-9, `3 дэд шат 100% → эцэг 100% (${rf.get('2.1.9').S})`);
}

/* ── Жингийн хуваарилалт: байгаа дэд шатны F-ийг хасаад үлдсэнийг шинэд ── */
{
  assert.equal(substageWeight([], 4), 0.25);
  assert.equal(substageWeight([0.5, null], 2), 0.25, 'null ах дүү тооцоонд орохгүй');
  assert.equal(substageWeight([0.7, 0.6], 1), 0, 'сөрөг жин гарахгүй');
  const have = [...base,
    { objectid: 30, dd_kod: '2.1.9.1', etseg_kod: '2.1.9', tuvshin: 3, uy_shat: 'Ажлын зураг төсөл', bagts: 'Багц-1', ajil_uilchilgee: 'А-даалгавар', heseg_ezleh_huvi: 0.4 },
  ];
  const tr2 = buildTree(sortByKod(have));
  const more = substageAdds(tr2.byCode.get('2.1.9'), tr2);
  assert.equal(more.length, 3);
  assert.ok(more.every((r) => Math.abs(r.heseg_ezleh_huvi - 0.2) < 1e-12), '(1 − 0.4) / 3');
  const w = weighAdds(have, more.slice(0, 2));
  assert.ok(w.every((r) => Math.abs(r.heseg_ezleh_huvi - 0.3) < 1e-12), 'нэгийг хассан → (1 − 0.4) / 2');
  assert.ok(!w.some(zeroWeight), 'үлдэгдэлтэй → 0 биш');
  const fullW = [...base,
    { objectid: 31, dd_kod: '2.1.9.1', etseg_kod: '2.1.9', tuvshin: 3, uy_shat: 'Ажлын зураг төсөл', bagts: 'Багц-1', ajil_uilchilgee: 'А-даалгавар', heseg_ezleh_huvi: 0.6 },
    { objectid: 32, dd_kod: '2.1.9.2', etseg_kod: '2.1.9', tuvshin: 3, uy_shat: 'Ажлын зураг төсөл', bagts: 'Багц-1', ajil_uilchilgee: 'Загвар зураг', heseg_ezleh_huvi: 0.4 },
  ];
  const tr3 = buildTree(sortByKod(fullW));
  const zero = weighAdds(fullW, substageAdds(tr3.byCode.get('2.1.9'), tr3));
  assert.equal(zero.length, 2);
  assert.ok(zero.every(zeroWeight), 'ах дүүс 100% → шинэ жин 0');
  assert.equal(zeroWeight({ heseg_ezleh_huvi: null }), false, 'null ≠ 0');
}

/* ── 6. Огнооны хүрээ: 2000-аас өмнөх огноо илгээгдэхгүй (хадгалсан нь байгаа ч, null ч) ── */
{
  const e1 = buildEdits(base, setEdit(EMPTY_PENDING, r22, 'start', '1999-05-01'), NAMES);
  assert.deepEqual(e1.issues.map((i) => i.kind), ['date']);
  assert.deepEqual(e1.updates, []);
  const r24 = { objectid: 24, dd_kod: '2.1.11', etseg_kod: '2.1', bagts: 'Багц-3', ajil_uilchilgee: 'x', geree_ehleh: null, geree_duusah: null };
  const e2 = buildEdits([...base, r24], setEdit(EMPTY_PENDING, r24, 'start', '1999-05-01'), NAMES);
  assert.deepEqual(e2.issues.map((i) => i.kind), ['date'], 'хадгалсан null — чимээгүй хаягдахгүй');
  /* Ганц огноо — хадгалсан null мөрд зөвхөн эхлэхийг */
  const e3 = buildEdits([...base, r24], setEdit(EMPTY_PENDING, r24, 'start', '2026-05-01'), NAMES);
  assert.deepEqual(e3.issues.map((i) => i.kind), ['pair']);
  /* Хоёр огноог арилгах — зөвшөөрнө */
  let pc = setEdit(EMPTY_PENDING, r22, 'start', '');
  pc = setEdit(pc, r22, 'end', '');
  assert.deepEqual(buildEdits(base, pc, NAMES).updates, [{ objectid: 22, geree_ehleh: null, geree_duusah: null }]);
  /* Зөвхөн явц засахад хуучин ганц огноотой мөр саадгүй */
  const r25 = { objectid: 25, dd_kod: '2.1.12', etseg_kod: '2.1', bagts: 'Багц-4', ajil_uilchilgee: 'y', geree_ehleh: d('2026-01-01'), geree_duusah: null };
  assert.deepEqual(buildEdits([...base, r25], setEdit(EMPTY_PENDING, r25, 'pct', '10'), NAMES).issues, []);
}

/* ── 7. Хөвөгч цэгийн явц ── */
{
  const rx = { ...r23, guitsetgel_huvi: 7.000000000000001 };
  assert.equal(origText(rx, 'pct'), '7');
  assert.equal(origText({ ...r23, guitsetgel_huvi: 57.99999999999999 }, 'pct'), '58');
  assert.equal(pendingCount(setEdit(EMPTY_PENDING, rx, 'pct', '7')), 0, 'бөөрөнхийлсөн текст засвар биш');
  const eq = buildEdits([rx], setEdit(EMPTY_PENDING, rx, 'pct', '7.0'), NAMES);
  assert.deepEqual(eq.updates, [], 'хүлцэлтэй харьцуулалт');
}

/* ── Харуулах Д/Д — модны байрлалаар ── */
{
  const tree = buildTree(sortByKod(base));
  const dc = displayCodes(tree);
  assert.equal(dc.get(tree.byCode.get('2.1.9')), '2.1.1');
  assert.equal(dc.get(tree.byCode.get('2.1.10')), '2.1.2');
}

/* ── 5. Зэрэг засвар ── */
{
  const upd = [{ objectid: 22, guitsetgel_huvi: 35 }, { objectid: 23, geree_ehleh: d('2026-02-01') }];
  const fresh = base.map((r) => (r.objectid === 22 ? { ...r, guitsetgel_huvi: 10 } : r.objectid === 23 ? { ...r, geree_duusah: d('2027-01-01') } : r));
  assert.deepEqual(conflicts(base, fresh, upd, NAMES), ['2.1.9'], 'зөвхөн бидний бичих талбар харьцуулагдана');
  assert.deepEqual(conflicts(base, base, upd, NAMES), []);
  assert.deepEqual(conflicts(base, base.filter((r) => r.objectid !== 23), upd, NAMES), ['2.1.10'], 'устсан мөр');
}

console.log('zuragTosol: OK');
