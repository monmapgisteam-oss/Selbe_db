/**
 * САРЫН МӨНГӨНИЙ ЭХ (`monthlyMoney.ts`) — цуваа бодолт ба «Гараар → Хуваарь» шилжүүлэлтийн бие. Сүлжээгүй.
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/monthlyMoney.check.mjs
 *
 * Хамгаалж буй дүрмүүд (2026-10-26):
 *   1. 'garaar' гэрээний сарын мөр ӨӨРЧЛӨГДӨХГҮЙ (ижил объект, ижил дараалал) — 'huvaari' гэрээгүй бол зан төлөв ижил.
 *   2. 'huvaari' гэрээ гараар мөрөө ҮЛ ТООНО; сар = Σ обьём × нэгж өртөг (₮), pct = дүн ÷ ХО дүн × 100.
 *   3. null ≠ 0: нэгж өртөггүй обьём ₮-д 0-ээр орохгүй (`noUnit`), ИЛ 0 обьём → 0 ₮ сар; хуудас унасан багц → `failed`, цуваагүй.
 *   4. Нэг багцын олон 'huvaari' гэрээ — ХО дүнгээр хуваана (давхар тоолохгүй).
 *   5. Шилжүүлэлт: НЭГ атом `applyEdits` (update sar_mongo_eh + сарын мөр устгах); мөр бүр `success === true`;
 *      `success:false` → тодорхой татгалзал; хариу алдагдсан/тодорхойгүй → дахин уншиж батална, эс бөгөөс `lost`.
 *   6. (хяналт) Шилжүүлэхийн өмнө Хуваарийн тооцоо: 'failed' → үргэлж татгалзана; 'empty'/'incomplete' → `allowIncomplete`-гүй
 *      татгалзана; зөвхөн ИЛ «Барилга угсралт» (хоосон uy_shat → ТАТГАЛЗАНА, хяналт №2); багцад өөр 'huvaari' гэрээ бий
 *      бол татгалзана; дахин уншилт ИЛГЭЭСЭН OID-уудыг шалгана (шинээр нэмэгдсэн сарын мөр «тодорхойгүй» болгохгүй).
 *   7. (хяналт) Гэрээ бүр `noUnit`/`noRow`-тэй; `gaps` нь S-муруйгаас дутсан 'huvaari' гэрээг нэрлэнэ.
 *   8. (хяналт №2) `allowIncomplete` нь БАТЛАСАН дүгнэлт/нийт (`expect`)-тэй л — зөрвөл татгалзана; хуудасны уншилт
 *      бүхэлдээ унавал багц бүр `failed` (`failedSheets`); `confirmAndSwitch` — хоёр харагдацын нэг урсгал.
 */
import assert from 'node:assert/strict';

globalThis.fetch = async (u) => { throw new Error(`mock: сүлжээ хориотой ${u}`); };

const MM = await import('@/lib/monthlyMoney.ts');

/* ── 1. эх ── */
assert.equal(MM.moneyRowOf({ cashflow_id: null, bagts: 'БАГЦ-1' }), null, 'cashflow_id-гүй (бүтцийн) мөр');
assert.deepEqual(MM.moneyRowOf({ cashflow_id: 11, bagts: 'БАГЦ-1', ho_dun_geree: 1000, sar_mongo_eh: 'huvaari' }),
  { id: 11, pkg: 'БАГЦ1', cost: 1000, source: 'huvaari', build: false, contracted: false });
assert.equal(MM.moneyRowOf({ cashflow_id: 3, bagts: 'БАГЦ 1-4', ho_dun_geree: 0 }).pkg, '', 'диапазон → түлхүүргүй');
assert.equal(MM.moneyRowOf({ cashflow_id: 3, bagts: 'БАГЦ 1-4', ho_dun_geree: 0 }).cost, null, '0 ХО дүн → null');
console.log('✅ эх · мөнгөний мөр');

/* ── 2. хуудас → сарын ₮ ── */
const plan = new Map([
  [1, new Map([['5/1', new Map([['2026-10', 10], ['2026-11', 0]])], ['5/2', new Map([['2026-10', 5]])]])],
  [2, new Map([['5/1', new Map([['2026-11', 4]])]])],     // нэгж өртөггүй
  [9, new Map([['5/1', new Map([['2026-12', 1]])]])],     // хуудсанд алга
  [3, new Map([['6/1', new Map([['2026-10', 100]])]])],   // давхардсан блок — алгасна
]);
const rows = [
  { des: 1, unit: 1000, group: false },
  { des: 2, unit: null, group: false },
  { des: 3, unit: 7, group: false },
  { des: 4, unit: 99, group: true },
];
const sm = MM.sheetMonthMoney(rows, plan, (b) => b === '6/1');
assert.deepEqual([...sm.byMonth], [['2026-10', 15000], ['2026-11', 0]], 'ИЛ 0 обьём → 0 ₮ сар; нэгжгүй обьём НЭМЭГДЭХГҮЙ');
assert.equal(sm.noUnit, 1);
assert.equal(sm.noRow, 1);
const pm = MM.mergeSheetMoney('БАГЦ1', [{ sheet: 'b1_9f', money: sm }, { sheet: 'b1_12f', money: { byMonth: new Map([['2026-11', 500]]), noUnit: 0, noRow: 0 } }]);
assert.deepEqual([...pm.byMonth], [['2026-10', 15000], ['2026-11', 500]]);
assert.deepEqual(pm.sheets, ['b1_9f', 'b1_12f']);
console.log('✅ хуудасны сарын мөнгө (обьём × нэгж өртөг, null ≠ 0)');

/* ── 3. нэгдсэн цуваа ── */
const keys = new Set(['БАГЦ1', 'БАГЦ2', 'БАГЦ71']);
const mk = (id, pkg, cost, source) => ({ id, pkg, cost, source });
const manual = [
  { id: 1, start: Date.UTC(2026, 9, 1, 12), pct: 50, amount: 500 },
  { id: 2, start: Date.UTC(2026, 9, 1, 12), pct: 30, amount: 3000 },   // 'huvaari' — хасагдана
  { id: 1, start: Date.UTC(2026, 10, 1, 12), pct: 50, amount: 500 },
  { id: 99, start: Date.UTC(2026, 10, 1, 12), pct: 10, amount: 1 },    // мөнгөний мөргүй — хэвээр
];
/* 3а. 'huvaari' гэрээгүй — мөрүүд ЯГ ХЭВЭЭР */
const g = MM.buildMonthlyMoney([mk(1, 'БАГЦ2', 1000, 'garaar')], manual, new Map(), keys);
assert.equal(g.rows.length, manual.length);
g.rows.forEach((r, i) => assert.equal(r, manual[i], 'ижил объект, ижил дараалал'));
assert.deepEqual([...g.contracts.get(1).months], [['2026-10', 500], ['2026-11', 500]]);
assert.equal(g.contracts.get(1).state, 'manual');
console.log('✅ гараар гэрээ — зан төлөв ижил');

/* 3б. 'huvaari' гэрээ — гараар мөрөө үл тоож, хуудасны цуваа */
const sheets = new Map([['БАГЦ1', pm]]);
const h = MM.buildMonthlyMoney([mk(1, 'БАГЦ2', 1000, 'garaar'), mk(2, 'БАГЦ1', 31000, 'huvaari')], manual, sheets, keys);
assert.ok(!h.rows.some((r) => r.id === 2 && r.amount === 3000), 'гараар мөр хасагдсан');
const h2 = h.rows.filter((r) => r.id === 2);
assert.equal(h2.length, 2);
assert.equal(h2[0].amount, 15000);
assert.ok(Math.abs(h2[0].pct - (15000 / 31000) * 100) < 1e-9, 'pct = дүн ÷ ХО дүн × 100');
assert.equal(new Date(h2[0].start).getUTCDate(), 1);
assert.equal(new Date(h2[0].start).getUTCHours(), 12, 'сарын 1-ний UTC үд дунд');
assert.equal(h.contracts.get(2).state, 'ok');
assert.equal(h.contracts.get(2).share, 1);
assert.deepEqual([...h.pkgs.get('БАГЦ1')], [['2026-10', 15000], ['2026-11', 500]]);
assert.ok(h.issues.some((s) => s.includes('БАГЦ1')), 'нэгжгүй/олдоогүй нүдийг хэлнэ');
assert.equal(h.contracts.get(2).noUnit, 1, 'гэрээнд нэгжгүй нүдний тоо');
assert.equal(h.contracts.get(2).noRow, 1, 'гэрээнд олдоогүй нүдний тоо');
assert.equal(h.contracts.get(1).noUnit, 0, 'гараар гэрээ — 0');
assert.deepEqual(h.gaps, { partial: false, failed: [], missing: [], short: [], noUnit: 1, noRow: 1 });
assert.equal(MM.hasMoneyGaps(h.gaps), true);
assert.equal(MM.hasMoneyGaps(g.gaps), false, 'гараар л — цоорхойгүй');
console.log('✅ хуваарь гэрээ — обьём × нэгж өртөг, гараар мөр үл тоогдоно');

/* 3в. нэг багцад хоёр 'huvaari' гэрээ — ХО дүнгээр хуваана; ХО дүнгүй нь хувьгүй */
const s2 = MM.buildMonthlyMoney([mk(5, 'БАГЦ1', 3000, 'huvaari'), mk(6, 'БАГЦ1', 1000, 'huvaari'), mk(7, 'БАГЦ1', null, 'huvaari')], [], sheets, keys);
assert.equal(s2.contracts.get(5).months.get('2026-10'), 15000 * 0.75);
assert.equal(s2.contracts.get(6).months.get('2026-10'), 15000 * 0.25);
assert.equal(s2.contracts.get(7).state, 'sharedNoCost');
assert.equal(s2.contracts.get(7).months.size, 0);
assert.equal(s2.pkgs.get('БАГЦ1').get('2026-10'), 15000, 'багцын нийлбэр давхар тоологдохгүй');
console.log('✅ хуваалцсан багц — давхар тоолохгүй');

/* 3г. түлхүүргүй · хуудасгүй · уншигдаагүй · хоосон */
const failedPm = MM.mergeSheetMoney('БАГЦ71', [], ['b71']);
const e = MM.buildMonthlyMoney([
  mk(10, '', 1, 'huvaari'), mk(11, 'БАГЦ16', 1, 'huvaari'), mk(12, 'БАГЦ71', 1, 'huvaari'), mk(13, 'БАГЦ2', 1, 'huvaari'),
], [{ id: 12, start: Date.UTC(2026, 0, 1), pct: 100, amount: 1 }], new Map([['БАГЦ71', failedPm], ['БАГЦ2', MM.mergeSheetMoney('БАГЦ2', [])]]), keys);
assert.equal(e.contracts.get(10).state, 'noKey');
assert.equal(e.contracts.get(11).state, 'noSheet');
assert.equal(e.contracts.get(12).state, 'failed');
assert.equal(e.contracts.get(13).state, 'empty');
assert.equal(e.rows.length, 0, 'уналт/хоосон — 0 ₮ мөр ҮҮСГЭХГҮЙ, гараар мөр ч орохгүй');
assert.deepEqual(e.gaps.failed, [12], 'S-муруйгаас дутсан — уншигдаагүй');
assert.deepEqual(e.gaps.missing.sort(), [10, 11, 13], 'S-муруйгаас дутсан — тооцоолсон сар алга');
console.log('✅ тооцоологдохгүй төлвүүд — null ≠ 0');

/* ── 4. Хуваарийн үе шатын шалгуур (2026-11-17: «Гараар → Хуваарь» шилжүүлэлт хасагдсан — бүх ажил Хуваариас) ── */
assert.equal(MM.isSwitchPhase(null), false);
assert.equal(MM.isSwitchPhase(''), false);
assert.equal(MM.isSwitchPhase(' Барилга угсралт '), true);
assert.equal(MM.isSwitchPhase('Ажлын зураг төсөл'), false);
/* хуудасны уншилт бүхэлдээ унасан — багц бүр failed, хуудасгүй түлхүүр орохгүй */
const fs0 = MM.failedSheets(new Set(['БАГЦ1', 'БАГЦ16']));
assert.ok(fs0.has('БАГЦ1') && !fs0.has('БАГЦ16'));
assert.ok(fs0.get('БАГЦ1').failed.length > 0 && fs0.get('БАГЦ1').byMonth.size === 0);
const fsMm = MM.buildMonthlyMoney([mk(40, 'БАГЦ1', 100, 'huvaari'), mk(41, 'БАГЦ2', 100, 'garaar')],
  [{ id: 41, start: Date.UTC(2026, 0, 1), pct: 50, amount: 50 }], fs0);
assert.equal(fsMm.contracts.get(40).state, 'failed');
assert.deepEqual(fsMm.gaps.failed, [40]);
assert.equal(fsMm.rows.length, 1, "'garaar' гэрээний мөр хэвээр — S-муруй унахгүй");
console.log('✅ үе шатын шалгуур · уншигдаагүй хуудас');

/* ── 8. (хяналт №2) S-муруйн цоорхойн анхааруулга (`gdash.cfGapsText`) ── */
const { cfGapsText } = await import('@/lib/gdash.ts');
assert.equal(cfGapsText(null), null);
assert.equal(cfGapsText({ partial: false, failed: [], missing: [], noUnit: 0, noRow: 0 }), null);
const gt = cfGapsText({ partial: true, failed: [12], missing: [10, 11, 13], noUnit: 2, noRow: 1 }, (id) => (id === 12 ? 'Багц 7.1' : null));
assert.match(gt, /4 гэрээ/);
assert.match(gt, /Багц 7\.1, #10, #11…/, 'эхний 3 нэр, үлдсэнийг «…»');
assert.match(gt, /3 нүд/);
const gs = cfGapsText({ partial: true, failed: [12], missing: [10], noUnit: 0, noRow: 0 }, undefined, (id) => id === 10);
assert.match(gs, /1 гэрээ ороогүй \(#10\)/, 'зөвхөн муруйн хүрээний гэрээ');
assert.doesNotMatch(gs, /уншигдсангүй/, 'хүрээнээс гадуурх хуудасны уналт — «зарим эх» биш');
assert.match(cfGapsText({ partial: true, failed: [], missing: [], noUnit: 0, noRow: 0 }), /уншигдсангүй/);
console.log('✅ хяналт №2 — S-муруйн цоорхойн анхааруулга');

/* ── 9. (2026-11-05) Багцын сарын хувь Хуваарьт — сарын мөнгө = хувь × ХО дүн; гараар хувийг Хуваарь руу зөөх ── */
{
  const money = [
    { id: 11, pkg: 'БАГЦ1', cost: 1000, source: 'huvaari' },
    { id: 12, pkg: 'БАГЦ2', cost: null, source: 'huvaari' },
    { id: 13, pkg: 'БАГЦ31', cost: 500, source: 'garaar' },
  ];
  const pct = new Map([['2026-10', 18.5], ['2026-11', 81.5]]);
  const sheets = new Map([
    ['БАГЦ1', { key: 'БАГЦ1', byMonth: new Map([['2026-10', 999_999]]), noUnit: 3, noRow: 2, sheets: [], failed: [], pct }],
    ['БАГЦ2', { key: 'БАГЦ2', byMonth: new Map(), noUnit: 0, noRow: 0, sheets: [], failed: [], pct }],
  ]);
  const manual = [{ id: 11, start: Date.UTC(2026, 8, 1, 12), pct: 50, amount: 500 }, { id: 13, start: Date.UTC(2026, 9, 1, 12), pct: 40, amount: 200 }];
  const r = MM.buildMonthlyMoney(money, manual, sheets, new Set(['БАГЦ1', 'БАГЦ2', 'БАГЦ31']));
  const c1 = r.contracts.get(11);
  assert.deepEqual([...c1.months], [['2026-10', 185], ['2026-11', 815]], 'сарын мөнгө = хувь × ХО дүн (обьём × нэгж өртгийн byMonth хэрэглэгдэхгүй)');
  assert.equal(c1.state, 'ok');
  assert.equal([...c1.months.values()].reduce((a, v) => a + v, 0), 1000, 'нийлбэр = ХО дүн (Σхувь 100)');
  assert.equal(r.contracts.get(12).state, 'sharedNoCost', 'ХО дүнгүй — ₮ бодогдохгүй (0 биш)');
  assert.equal(r.contracts.get(12).months.size, 0);
  assert.ok(r.issues.some((x) => x.includes('хөрөнгө оруулалтын дүнгүй')), r.issues.join(' | '));
  assert.deepEqual(r.rows.filter((x) => x.id === 11).map((x) => [x.pct, x.amount]), [[18.5, 185], [81.5, 815]], 'S-муруйн мөр — гараар мөр (id 11) орохгүй');
  assert.equal(r.rows.filter((x) => x.id === 13).length, 1, 'гараар гэрээ хэвээр');
  /* урьдчилсан тооцоо — хувьтай багц 'ok', нийт ₮ тодорхойгүй (null), хувийн нийлбэр мэдэгдэнэ */
}
console.log('✅ 2026-11-05 — багцын сарын хувь Хуваарьт: хувь × ХО дүн');

/* ── 10. (2026-11-05) «Үндсэн хугацаа» — ГЭРЭЭГЭЭР («CF:<id>») түлхүүрлэсэн сарын хувь: хуудасгүй багц, ТЭЗҮ/зураг төсөл ── */
{
  const { toPkgPct } = await import('@/lib/huvaariObyem.ts');
  const all = toPkgPct([
    { attributes: { bagts: 'CF:21', sar_txt: '2026-11', obyem: 40 } },
    { attributes: { bagts: 'CF:21', sar_txt: '2026-12', obyem: 60 } },
    { attributes: { bagts: 'CF:22', sar_txt: '2026-11', obyem: 100 } },
    { attributes: { bagts: 'БАГЦ1', sar_txt: '2026-11', obyem: 100 } },
    { attributes: { bagts: 'CF:х', sar_txt: '2026-11', obyem: 5 } },
  ]);
  const byId = MM.pctByIdOf(all);
  assert.deepEqual([...byId.keys()].sort(), [21, 22], '«CF:<id>» түлхүүртэй мөр л (багцын түлхүүр, эвдэрсэн түлхүүр орохгүй)');
  const money = [
    { id: 21, pkg: 'БАГЦ8', cost: 2000, source: 'huvaari' },   /* хүснэгтгүй багц */
    { id: 22, pkg: '', cost: null, source: 'huvaari' },          /* багцгүй, ХО дүнгүй */
    { id: 23, pkg: 'БАГЦ9', cost: 500, source: 'huvaari' },     /* хувь оруулаагүй, хуудасгүй */
    { id: 24, pkg: 'БАГЦ8', cost: 300, source: 'garaar' },      /* ижил багцын гараар гэрээ — хөндөгдөхгүй */
  ];
  const manual = [{ id: 24, start: Date.UTC(2026, 10, 1, 12), pct: 10, amount: 30 }, { id: 21, start: Date.UTC(2026, 10, 1, 12), pct: 99, amount: 1 }];
  const r = MM.buildMonthlyMoney(money, manual, new Map(), new Set(['БАГЦ1']), byId);
  assert.deepEqual([...r.contracts.get(21).months], [['2026-11', 800], ['2026-12', 1200]], 'хуудасгүй багц: сарын мөнгө = хувь × ХО дүн');
  assert.equal(r.contracts.get(21).state, 'ok');
  assert.equal(r.contracts.get(22).state, 'sharedNoCost', 'ХО дүнгүй — ₮ бодогдохгүй');
  assert.equal(r.contracts.get(23).state, 'noSheet', 'хувь оруулаагүй, хуудасгүй — хуучин төлөв (цоорхойд нэрлэгдэнэ)');
  assert.deepEqual(r.gaps.missing.sort(), [22, 23]);
  assert.deepEqual(r.rows.filter((x) => x.id === 21).map((x) => x.amount), [800, 1200], 'гараар мөр (id 21) S-муруйд орохгүй');
  assert.equal(r.rows.filter((x) => x.id === 24).length, 1, 'гараар гэрээ хэвээр');
  /* хувийн хүснэгт УНШИГДААГҮЙ (null) — хуудасгүй 'huvaari' гэрээ `failed` (хоосон гэж худал хэлэхгүй) */
  const f = MM.buildMonthlyMoney(money, manual, new Map(), new Set(['БАГЦ1']), null);
  assert.equal(f.contracts.get(21).state, 'failed');
  assert.deepEqual(f.gaps.failed.sort(), [21, 22, 23]);
  /* өгөөгүй (undefined) — хуучин зан төлөв */
  const o = MM.buildMonthlyMoney(money, manual, new Map(), new Set(['БАГЦ1']));
  assert.equal(o.contracts.get(21).state, 'noSheet');
  assert.equal(o.contracts.get(22).state, 'noKey');
}
console.log('✅ 2026-11-05 — «Үндсэн хугацаа»: гэрээгээр түлхүүрлэсэн сарын хувь (хуудас шаардахгүй)');

/* ── 2026-11-06: сарын мөнгөний суурь = гэрээний дүн; гэрээтэй ажлын дутуу төлөвлөгөө анхааруулгад; багцын хувийг зураг төсөл өвлөхгүй ── */
{
  const base = { cashflow_id: 48, bagts: 'БАГЦ-14', ho_dun_geree: 9_341_862_391, sar_mongo_eh: 'huvaari', uy_shat: 'Барилга угсралт' };
  assert.equal(MM.moneyRowOf(base).cost, 9_341_862_391, 'гэрээгүй — төсөв');
  assert.equal(MM.moneyRowOf({ ...base, geree_dun: 8_400_000_000, ho_dungiin_tailbar: 'Урьдчилсан дүн' }).cost, 9_341_862_391, 'тэмдэггүй geree_dun — төсөв хэвээр');
  const signed = MM.moneyRowOf({ ...base, geree_dun: 8_400_000_000, ho_dungiin_tailbar: 'Гэрээлсэн дүн' });
  assert.equal(signed.cost, 8_400_000_000, 'гэрээ байгуулсан — гэрээний дүн');
  assert.equal(signed.contracted, true);
  assert.equal(signed.build, true);
  assert.equal(MM.moneyRowOf({ ...base, geree_dun: null, ho_dungiin_tailbar: 'Гэрээлсэн дүн' }).cost, 9_341_862_391, 'дүнгүй бол төсөв');
  const pctOf = new Map([[13, new Map([['2026-08', 0.7]])], [14, new Map([['2026-08', 97]])], [15, new Map([['2026-08', 0.7]])]]);
  const money = [
    { id: 13, pkg: 'БАГЦ31', cost: 1000, source: 'huvaari', contracted: true },
    { id: 14, pkg: 'БАГЦ2', cost: 1000, source: 'huvaari', contracted: true },
    { id: 15, pkg: 'БАГЦ5', cost: 1000, source: 'huvaari' },
    { id: 3, pkg: '', cost: 1000, source: 'garaar', contracted: true },
    { id: 59, pkg: 'БАГЦ18', cost: 1000, source: 'garaar' },
  ];
  const r = MM.buildMonthlyMoney(money, [], new Map(), new Set(), pctOf);
  assert.deepEqual(r.gaps.short.sort((a, b) => a - b), [3, 13], '0.7% ба сар оруулаагүй гэрээ орно; 97% босгоос дотор; гэрээгүй ажил орохгүй');
  assert.equal(MM.hasMoneyGaps(r.gaps), true);
  const { cfGapsText: txt } = await import('@/lib/gdash.ts');
  assert.match(txt(r.gaps, (id) => (id === 13 ? 'Багц-3.1' : null)), /2 гэрээний сарын хувийн нийлбэр 100% биш \(#3, Багц-3\.1\)|2 гэрээний сарын хувийн нийлбэр 100% биш \(Багц-3\.1, #3\)/);
  assert.equal(txt(r.gaps, undefined, (id) => id === 59), null, 'хүрээнээс гадуур гэрээ хэлэхгүй');
  /* Багцын хувь */
  const pm = { key: 'БАГЦ71', byMonth: new Map(), noUnit: 0, noRow: 0, sheets: [], failed: [], pct: new Map([['2026-09', 100]]) };
  const list = [
    { id: 4, pkg: 'БАГЦ71', cost: 500, source: 'huvaari', build: false },
    { id: 12, pkg: 'БАГЦ71', cost: 1000, source: 'huvaari', build: true },
  ];
  const q = MM.buildMonthlyMoney(list, [], new Map([['БАГЦ71', pm]]), new Set(['БАГЦ71']));
  assert.equal(q.contracts.get(12).months.get('2026-09'), 1000, 'барилгын гэрээ — багцын хувь');
  assert.equal(q.contracts.get(4).months.size, 0, 'зураг төслийн гэрээ өвлөхгүй');
  assert.equal(q.contracts.get(4).state, 'empty');
  assert.deepEqual(q.gaps.missing, [4]);
}
console.log('✅ 2026-11-06 — суурь гэрээний дүн · дутуу төлөвлөгөө · багцын хувь өвлөхгүй');

console.log('monthlyMoney.check — бүгд давлаа');
