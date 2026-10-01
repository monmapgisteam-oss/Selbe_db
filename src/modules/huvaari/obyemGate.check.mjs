/**
 * ХУВААРЬ — «Тавих» → ноорог → «Батлуулах» хаалт → илгээлт → буулгалт гинжний
 * ЦЭВЭР хэсгүүдийн шалгуур (2026-09-30-ны регрессийн мэдээлэлд).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/huvaari/obyemGate.check.mjs
 *
 * Хамгаалж буй зүйл:
 *   1. Popup-ын ШҮҮСЭН `mv` (мужаас гадуурх сар хасагдсан) нийт обьёмтой тэнцвэл
 *      `unbalancedObyem` хаалт ТҮҮНИЙГ няцаахгүй — «зөв хуваасан ч болохгүй» гарахгүй.
 *   2. Гинжээр шилжсэн (`keepMonths`-оор тайрагдсан) ажил НЭРЭЭРЭЭ няцаагдана.
 *   3. Хоосон задаргаа + хуваарьтай блок нь ЗӨВХӨН серверт задаргаа байсан үед няцаагдана.
 *   4. `buildPayloadOf` → `payloadToDrafts` тойрог тэнцсэн задаргааг ХЭВЭЭР буулгана
 *      (батлагчийн `save`-ийн `unbal` худал асахгүй).
 */
import assert from 'node:assert/strict';
const g = globalThis;
g.window = g;
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
g.addEventListener = () => {}; g.removeEventListener = () => {}; g.dispatchEvent = () => true;

const { unbalancedObyem, obKey } = await import('./util.ts');
const { keepMonths, monthsOf } = await import('@/lib/huvaariObyem');
const { buildPayloadOf, payloadToDrafts } = await import('./payload.ts');

const d = (iso) => Date.parse(`${iso}T00:00:00Z`);
const span = (a, b) => ({ start: d(a), end: d(b) });
const M = (o) => new Map(Object.entries(o));
const BLD = ['B1', 'B2'];
const row = (i, oid, des, vol, spans, extra = {}) => ({
  i, oid, no: `1.${i + 1}`, des, deps: [], work: `Ажил ${des}`, depth: 1, group: false, vol, spans,
  act: [null, null], aStart: [null, null], aEnd: [null, null], hun: null, mashin: null, ...extra,
});

/* ── 1. Popup-ын шүүсэн задаргаа тэнцвэл хаалт нээлттэй ── */
{
  const plan = [row(0, 7, 11, 900, [span('2026-10-01', '2026-12-31'), null])];
  const ob = new Map([[obKey(11, 'B1'), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 })]]);
  assert.deepEqual(unbalancedObyem(plan, BLD, ob, new Map()), { bad: 0, names: [] }, 'зөв хуваасан → хаалт нээлттэй');
  /* Бутархай нийт — яг хуваасан */
  const plan2 = [row(0, 7, 11, 900.35, [span('2026-10-01', '2026-12-31'), null])];
  const ob2 = new Map([[obKey(11, 'B1'), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300.35 })]]);
  assert.equal(unbalancedObyem(plan2, BLD, ob2, new Map()).bad, 0, 'бутархай нийт · яг хуваасан');
  /* Хөвөгч цэгийн алдаа — 0.1+0.2+0.7 */
  const plan3 = [row(0, 7, 11, 1, [span('2026-10-01', '2026-12-31'), null])];
  const ob3 = new Map([[obKey(11, 'B1'), M({ '2026-10': 0.1, '2026-11': 0.2, '2026-12': 0.7 })]]);
  assert.equal(unbalancedObyem(plan3, BLD, ob3, new Map()).bad, 0, '0.1+0.2+0.7 = 1 (тэвчээртэй)');
}

/* ── 2. Гинжээр шилжсэн ажил — keepMonths тайрсан → нэрээрээ няцаагдана ── */
{
  const moved = span('2026-11-01', '2027-01-31');
  const trimmed = keepMonths(moved, M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 }));
  assert.deepEqual([...trimmed], [['2026-11', 300], ['2026-12', 300]], '10-р сар хасагдаж, 1-р сар хоосон');
  const plan = [
    row(0, 7, 11, 900, [span('2026-10-01', '2026-12-31'), null]),
    row(1, 8, 12, 900, [moved, null]),
  ];
  const ob = new Map([
    [obKey(11, 'B1'), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 })],
    [obKey(12, 'B1'), trimmed],
  ]);
  const r = unbalancedObyem(plan, BLD, ob, new Map());
  assert.equal(r.bad, 1);
  /* ⚠️ 2026-09-30: нэр БЛОКТОЙ — идэвхтэй блок дээр тэнцсэн задаргаа хараад
     «зөв хуваасан ч болохгүй» гэж төөрөхгүй */
  assert.deepEqual(r.names, ['1.2 Ажил 12 (B1)'], 'зөвхөн шилжсэн ажил нэрлэгдэнэ — зөв хуваасан 1.1 биш');
}

/* ── 2б. (2026-09-30) Тэнцээгүй нь ИДЭВХГҮЙ блокт — нэр блокоо заана; олон блок нэг нэрэнд ── */
{
  const sp = span('2026-10-01', '2026-12-31');
  const plan = [row(0, 7, 11, 900, [sp, sp])];
  /* B1 (идэвхтэй гэж үзье) зөв; B2 гинжээр тайрагдсан */
  const ob = new Map([
    [obKey(11, 'B1'), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 })],
    [obKey(11, 'B2'), M({ '2026-11': 300, '2026-12': 300 })],
  ]);
  let r = unbalancedObyem(plan, BLD, ob, new Map());
  assert.deepEqual(r, { bad: 1, names: ['1.1 Ажил 11 (B2)'] }, 'тэнцээгүй блокийг нэрлэнэ');
  ob.set(obKey(11, 'B1'), M({ '2026-10': 1 }));
  r = unbalancedObyem(plan, BLD, ob, new Map());
  assert.deepEqual(r, { bad: 2, names: ['1.1 Ажил 11 (B1, B2)'] }, 'нэг ажлын хоёр блок нэг нэрэнд');
  /* Ганц блоктой (синтетик) багцад блок бичихгүй */
  const one = [row(0, 7, 11, 900, [sp])];
  r = unbalancedObyem(one, ['B1'], new Map([[obKey(11, 'B1'), M({ '2026-10': 1 })]]), new Map());
  assert.deepEqual(r.names, ['1.1 Ажил 11'], 'ганц блок — нэр хэвээр');
}

/* ── 3. Хоосон задаргаа + хуваарьтай блок ── */
{
  const plan = [row(0, 7, 11, 900, [span('2027-03-01', '2027-04-30'), null])];
  const ob = new Map([[obKey(11, 'B1'), new Map()]]);
  assert.equal(unbalancedObyem(plan, BLD, ob, new Map()).bad, 0, 'серверт задаргаа байгаагүй → устгах зүйлгүй → нээлттэй');
  const srv = new Map([[11, new Map([['B1', M({ '2026-10': 900 })]])]]);
  assert.equal(unbalancedObyem(plan, BLD, ob, srv).bad, 1, 'серверт задаргаа байсан → хоосон = 0 ≠ 900 → няцаана');
  /* Хуваарь ч хоосон (`clear`) бол «арилгах» — няцаахгүй */
  const plan0 = [row(0, 7, 11, 900, [null, null])];
  assert.equal(unbalancedObyem(plan0, BLD, ob, srv).bad, 0, 'хуваарьгүй блокийн хоосон задаргаа = арилгах');
  /* Обьёмгүй / кодгүй мөр — суурьгүй, алгасна */
  const planNoVol = [row(0, 7, 11, null, [span('2026-10-01', '2026-12-31'), null])];
  assert.equal(unbalancedObyem(planNoVol, BLD, new Map([[obKey(11, 'B1'), M({ '2026-10': 5 })]]), srv).bad, 0, 'обьёмгүй → алгасна');
  const planNoDes = [row(0, 7, null, 900, [span('2026-10-01', '2026-12-31'), null])];
  assert.equal(unbalancedObyem(planNoDes, BLD, ob, srv).bad, 0, 'кодгүй → алгасна');
}

/* ── 4. Илгээлт → буулгалт тойрог: тэнцсэн задаргаа хэвээр ── */
{
  const sp = span('2026-10-01', '2026-12-31');
  const sheet = (oid, des) => ({
    oid, no: '1.1', des, work: `Ажил ${des}`, depth: 1, group: false, vol: 900, ham: null,
    start: [null, null], end: [null, null], gStart: [null, null], gEnd: [null, null],
    act: [null, null], aStart: [null, null], aEnd: [null, null], hun: null, mashin: null,
  });
  const rows = [sheet(7, 11)];
  const base = [row(0, 7, 11, 900, [null, null])];
  const months = M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 });
  const draft = new Map([[7, [sp, null]]]);
  const obDraft = new Map([[obKey(11, 'B1'), months]]);
  const pay = buildPayloadOf({
    draft, ham: new Map(), aDraft: new Map(), resDraft: new Map(), obDraft, obResDraft: new Map(),
    kind: 'plan', base, rows, obPlan: new Map(), obRes: new Map(),
  });
  assert.deepEqual(pay.obyem[obKey(11, 'B1')], { '2026-10': 300, '2026-11': 300, '2026-12': 300 });
  /* JSON тойрог — ArcGIS-д тэмдэгт мөрөөр хадгалагдана */
  const back = JSON.parse(JSON.stringify(pay));
  const ap = payloadToDrafts(back, rows, true, new Map(), new Map(), { kind: 'plan', n: 2 });
  assert.equal(ap.ok, true, `буулгалт амжилттай: ${JSON.stringify(ap)}`);
  const got = ap.maps.obDraft.get(obKey(11, 'B1'));
  assert.deepEqual([...got], [...months], 'задаргаа ХЭВЭЭР буусан');
  assert.deepEqual(ap.maps.draft.get(7), [sp, null], 'хуваарь хэвээр буусан');
  /* Батлагчийн хаалт (илгээлтийн агуулгаар) — няцаахгүй */
  const plan = [row(0, 7, 11, 900, [sp, null])];
  assert.equal(unbalancedObyem(plan, BLD, ap.maps.obDraft, new Map()).bad, 0, 'буусан задаргаа тэнцсэн хэвээр');
  /* Төрөл зөрвөл буулгахгүй */
  assert.equal(payloadToDrafts(back, rows, true, new Map(), new Map(), { kind: 'geree', n: 2 }).ok, false, 'kind зөрүү');
  /* Муж мужаас гадуурх сарыг popup-ын шүүлтгүйгээр илгээвэл (хуучин ноорог) — monthsOf-той тулгаж хаалт ажиллана */
  assert.deepEqual(monthsOf(sp), ['2026-10', '2026-11', '2026-12']);
}

console.log('✓ obyemGate: popup-ын шүүсэн задаргаа → хаалт → илгээлт → буулгалт');

/* ══════════ 2026-10-01 (хэрэглэгч: бүгдийг зас) ══════════ */
const { unbalancedBlocks, groupSplits, obyemOutsideSpan } = await import('./util.ts');

/* ── 5. БҮЛГИЙН ЗАДАРГАА тэнцлийн шалгалтад ОРОХГҮЙ («Сарын обьём бүлэгт биш») ──
 * ⚠️ Серверт бүлгийн кодоор хадгалагдсан задаргаа хүүхдийг чирэхэд тайрагдаж
 *    «тэнцэхгүй» болж, засах замгүйгээр илгээх/батлах хаагддаг байв. */
{
  const sp = span('2026-10-01', '2026-12-31');
  const g = row(0, 6, 10, 900, [sp, null], { group: true, depth: 0, no: '1', work: 'Бүлэг' });
  const k = row(1, 7, 11, 900, [sp, null], { depth: 1 });
  /* Бүлгийн тайрагдсан ноорог (хуучин чирэлтээс үлдсэн) — тоологдохгүй */
  const ob = new Map([[obKey(10, 'B1'), M({ '2026-11': 300 })]]);
  const srv = new Map([[10, new Map([['B1', M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 })]])]]);
  assert.deepEqual(unbalancedObyem([g, k], BLD, ob, srv), { bad: 0, names: [] }, 'бүлгийн задаргаа хаалтыг түгжив');
  assert.deepEqual(unbalancedBlocks(g, BLD, ob, srv), [], 'бүлэг хэзээ ч тэнцээгүй блоктой биш');
  /* Мэдээлэл: серверт бүлгийн задаргаа бий — нэрлэнэ (устгахгүй) */
  assert.deepEqual(groupSplits([g, k], BLD, srv), ['1 Бүлэг'], 'бүлгийн хадгалагдсан задаргааг мэдээлэх ёстой');
  assert.deepEqual(groupSplits([g, k], BLD, new Map()), [], 'задаргаагүй бүлэг мэдээлэгдэхгүй');
}

/* ── 6. `unbalancedBlocks` — цонхны УЛААН ЧИП: үр дүнтэй задаргаа (ноорог ?? сервер) ── */
{
  const sp = span('2026-10-01', '2026-12-31');
  const r = row(0, 7, 11, 900, [sp, sp]);
  const srv = new Map([[11, new Map([['B2', M({ '2026-10': 100 })]])]]);
  const ob = new Map([[obKey(11, 'B1'), M({ '2026-10': 300, '2026-11': 300, '2026-12': 300 })]]);
  assert.deepEqual(unbalancedBlocks(r, BLD, ob, srv), [1], 'серверийн тэнцээгүй B2 улаан, тэнцсэн B1 биш');
  assert.deepEqual(unbalancedBlocks(r, BLD, ob, srv, true), [], 'илгээх хаалт (draftOnly) — зөвхөн ноорог');
  /* Ноорог хоосон + серверт байсан + хуваарьтай → улаан (хаалттай ижил) */
  const ob2 = new Map([[obKey(11, 'B2'), new Map()]]);
  assert.deepEqual(unbalancedBlocks(r, BLD, ob2, srv, true), [1]);
  /* Обьёмгүй мөр — шалгах суурьгүй */
  assert.deepEqual(unbalancedBlocks(row(0, 7, 11, null, [sp, sp]), BLD, ob, srv), []);
}

/* ── 7. `obyemOutsideSpan` — БАТЛАХЫН ӨМНӨ: обьёмтой сар ажлын мужаас гадуур ── */
{
  const sp = span('2026-10-01', '2026-11-30');
  const r = row(0, 7, 11, 900, [sp, null]);
  const r2 = row(1, 8, 12, 900, [sp, sp]);
  const g = row(2, 9, 13, 900, [sp, null], { group: true, depth: 0 });
  const data = new Map([
    [obKey(11, 'B1'), M({ '2026-09': 50, '2026-10': 400, '2026-11': 400, '2026-12': 50 })],
    [obKey(12, 'B2'), M({ '2026-10': 450, '2026-11': 450, '2027-01': 0 })],   // 0 нь асуудал биш
    [obKey(13, 'B1'), M({ '2027-05': 900 })],                                  // бүлэг — алгасна
  ]);
  const obOf = (des, blok) => data.get(obKey(des, blok)) ?? new Map();
  const res = obyemOutsideSpan([r, r2, g], BLD, obOf);
  assert.equal(res.bad, 1, `зөвхөн 1.1 · B1: ${JSON.stringify(res)}`);
  assert.deepEqual(res.names, ['1.1 Ажил 11 (B1: 2026-09, 2026-12)'], 'ажил · блок · сарыг нэрлэнэ');
  /* Хуваарьгүй блокт обьём → бүх сар гадуур */
  const r3 = row(0, 7, 11, 900, [null, null]);
  assert.equal(obyemOutsideSpan([r3], BLD, obOf).bad, 1, 'хуваарьгүй блокийн обьём гадуур');
  /* `only` — энэ саналаар өөрчлөгдсөн мөр л */
  assert.equal(obyemOutsideSpan([r, r2], BLD, obOf, new Set([8])).bad, 0, 'өөрчлөгдөөгүй мөрийн хуучин өгөгдлөөр батлагч гацахгүй');
  /* Ганц блоктой багцад блок бичихгүй */
  assert.deepEqual(obyemOutsideSpan([row(0, 7, 11, 900, [sp])], ['B1'], obOf).names, ['1.1 Ажил 11 (2026-09, 2026-12)']);
}

/* ── 8. ЭХ КОД: бүлгийн задаргааг чирэлт · хадгалалт хөндөхгүй; батлах хаалт; «Ноорог хаях» тоо ── */
{
  const fs = await import('node:fs');
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  const H = strip(fs.readFileSync('src/modules/Huvaari.tsx', 'utf8'));
  const SP = strip(fs.readFileSync('src/modules/huvaari/savePrep.ts', 'utf8'));
  /* applyChanges — obDraft ба obResDraft хоёулаа бүлэг алгасна */
  const ai = H.indexOf('const applyChanges = useCallback(');
  const ae = H.indexOf('const applyModal = useCallback(', ai);
  const ac = H.slice(ai, ae);
  assert.equal((ac.match(/if \(r\.group \|\| r\.des == null \|\| !\(r\.vol != null && r\.vol > 0\)\) continue;/g) ?? []).length, 2,
    'applyChanges: бүлгийн сарын обьём/нөөцийг чирэлтээр тайрсаар байна');
  /* savePrep — бүлгийн ноорог бичигдэхгүй, тэнцэлд тоологдохгүй (balanced-аас ӨМНӨ) */
  const gi = SP.indexOf('if (r.group) { grpSkipped += 1; continue; }');
  assert.ok(gi > 0 && gi < SP.indexOf('!balanced(months, r.vol)'), 'savePrep: бүлгийн задаргаа unbal-д тоологдож байна');
  /* «Ноорог хаях» — асуултын тоо = товчны тоо (dirtyRows) */
  const di = H.indexOf("tr('Ноорог хаях')");
  const dc = H.lastIndexOf('window.confirm(', di);
  assert.ok(dc > 0 && /num\(dirtyRows\), others/.test(H.slice(dc, di)), '«Ноорог хаях»-ын асуулт товчноос өөр тоо харуулж байна');
  assert.ok(/\{tr\('Ноорог хаях'\)\} \(\{num\(dirtyRows\)\}\)/.test(H), 'товчны тоо dirtyRows хэвээр');
  /* Батлах эффект — мужаас гадуурх обьёмд эх хуудсанд бичихгүй (save-ээс ӨМНӨ) */
  const ei = H.indexOf('if (approving == null || busy) return;');
  const es = H.indexOf('void save().then(', ei);
  const eff = H.slice(ei, es);
  /* ⚠️ 2026-10-01: тайлалт хагас бичилтэд хамгаалагдсан (`partialRef`) — хоёр хэлбэрийг таньна */
  assert.ok(/if \(obOut\.bad > 0\) \{\s*(?:if \(partialRef\.current !== approving\) )?void releasePlanClaim\(/.test(eff), 'батлах эффект: мужаас гадуурх обьёмыг шалгахгүй байна');
  /* PlanModal руу тэнцээгүй блокууд дамжина */
  assert.ok(/badBlks=\{modalBad\}/.test(H) && /unbalancedBlocks\(modalRow, sc\.bld, obDraft, obPlan\)/.test(H), 'PlanModal-д улаан чипийн өгөгдөл дамжихгүй');
}

console.log('✓ obyemGate 2026-10-01: бүлгийн задаргаа алгасна · улаан чип · мужаас гадуурх обьём · «Ноорог хаях» тоо');

/* ── 9. ЗОХИОГЧ ХӨНДӨӨГҮЙ уялдаа · обьём (санал = суурь) — серверийнх үлдэнэ (2026-10-01) ──
   Урьд нь ноорогт орж: сервер хооронд нь өөрчлөгдсөн бол батлахад худал «зэрэгцээ
   өөрчлөлт» (strict), татах/буцаах (strict: false) замд хуучин утга серверийнхийг дардаг байв. */
{
  const sheet = (ham) => ({
    oid: 7, no: '1.1', des: 11, work: 'Ажил 11', depth: 1, group: false, vol: 900, ham,
    start: [null, null], end: [null, null], gStart: [null, null], gEnd: [null, null],
    act: [null, null], aStart: [null, null], aEnd: [null, null], hun: null, mashin: null,
  });
  const k = obKey(11, 'B1');
  const pay = {
    kind: 'plan', spans: {}, actual: {}, res: {}, obres: {},
    deps: { 7: '5FS' },
    obyem: { [k]: { '2026-10': 900 } },
    base: { spans: {}, deps: { 7: '5FS' }, obyem: { [k]: { '2026-10': 900 } } },
  };
  /* Сервер хооронд нь өөр утгатай болсон */
  const rows = [sheet('9SS')];
  const srvPlan = new Map([[11, new Map([['B1', M({ '2026-11': 900 })]])]]);
  const strict = payloadToDrafts(pay, rows, true, srvPlan, new Map(), { kind: 'plan', n: 2 });
  assert.equal(strict.ok, true, `хөндөөгүй утга зөрчил биш: ${JSON.stringify(strict)}`);
  assert.equal(strict.conflicts, 0);
  assert.equal(strict.maps.ham.has(7), false, 'хөндөөгүй уялдаа ноорогт ОРОХГҮЙ — серверийн 9SS үлдэнэ');
  assert.equal(strict.maps.obDraft.has(k), false, 'хөндөөгүй обьём ноорогт ОРОХГҮЙ');
  /* Зохиогч ЗАССАН бол хуучин дүрэм хэвээр — зөрчил тоологдоно */
  const edited = { ...pay, deps: { 7: '6FS' } };
  const e = payloadToDrafts(edited, rows, true, srvPlan, new Map(), { kind: 'plan', n: 2 });
  assert.equal(e.ok, false, 'зассан + сервер өөрчлөгдсөн → зөрчил');
  assert.equal(e.why, 'conflict');
  /* Сервер өөрчлөгдөөгүй бол зассан нь ноорогт буунa */
  const same = payloadToDrafts(edited, [sheet('5FS')], true, new Map([[11, new Map([['B1', M({ '2026-10': 900 })]])]]), new Map(), { kind: 'plan', n: 2 });
  assert.equal(same.ok, true);
  assert.equal(same.maps.ham.get(7), '6FS', 'зассан уялдаа ноорогт');
}

console.log('✓ obyemGate §9: хөндөөгүй уялдаа · обьём серверийнхээр (tezu-bonu)');
