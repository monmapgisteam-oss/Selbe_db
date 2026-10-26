/**
 * САРЫН МӨНГӨНИЙ ЭХ (`monthlyMoney.ts`) — цуваа бодолт ба «Гараар → Хуваарь» шилжүүлэлтийн бие. Сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/monthlyMoney.check.mjs
 *
 * Хамгаалж буй дүрмүүд (⚠️ 2026-10-26):
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
 * ⚠️ `fetch`-ийг ШИДДЭГ болгож солино — бүх I/O `SwitchIo`-оор; бодит ArcGIS руу ОГТ хүрэхгүй.
 */
import assert from 'node:assert/strict';

globalThis.fetch = async (u) => { throw new Error(`mock: сүлжээ хориотой ${u}`); };

const MM = await import('@/lib/monthlyMoney.ts');
const { isLostWrite } = await import('@/lib/lostWrite.ts');
const { ArcGISError } = await import('@/lib/query.ts');

/* ── 1. эх ── */
assert.equal(MM.monthSourceOf(null), 'garaar');
assert.equal(MM.monthSourceOf(''), 'garaar');
assert.equal(MM.monthSourceOf(' Huvaari '), 'huvaari');
assert.equal(MM.monthSourceOf('xyz'), 'garaar');
assert.equal(MM.moneyRowOf({ Cashflow_ID: null, bagts: 'БАГЦ-1' }), null, 'Cashflow_ID-гүй (бүтцийн) мөр');
assert.deepEqual(MM.moneyRowOf({ Cashflow_ID: 11, bagts: 'БАГЦ-1', ho_dun_geree: 1000, sar_mongo_eh: 'huvaari' }),
  { id: 11, pkg: 'БАГЦ1', cost: 1000, source: 'huvaari' });
assert.equal(MM.moneyRowOf({ Cashflow_ID: 3, bagts: 'БАГЦ 1-4', ho_dun_geree: 0 }).pkg, '', 'диапазон → түлхүүргүй');
assert.equal(MM.moneyRowOf({ Cashflow_ID: 3, bagts: 'БАГЦ 1-4', ho_dun_geree: 0 }).cost, null, '0 ХО дүн → null');
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
assert.deepEqual(h.gaps, { partial: false, failed: [], missing: [], noUnit: 1, noRow: 1 });
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

/* ── 4. шилжүүлэлтийн бие ── */
const body = MM.buildSwitchEdits(11, [79, 80]);
assert.equal(body.rollbackOnFailure, 'true');
assert.deepEqual(JSON.parse(body.updates), [{ attributes: { OBJECTID: 11, sar_mongo_eh: 'huvaari' } }]);
assert.equal(body.deletes, '79,80');
assert.equal(MM.buildSwitchEdits(11, []).deletes, undefined);
assert.equal(MM.judgeSwitch({ updateResults: [{ success: true }], deleteResults: [{ success: true }, { success: true }] }, 1, 2).verdict, 'ok');
assert.equal(MM.judgeSwitch({ updateResults: [{ success: false, error: { description: 'x' } }], deleteResults: [] }, 1, 2).verdict, 'refused');
assert.equal(MM.judgeSwitch({ updateResults: [{ success: true }], deleteResults: [{ success: true }] }, 1, 2).verdict, 'unsure', 'дутуу хариу');
assert.equal(MM.judgeSwitch({ updateResults: [{}], deleteResults: [{ success: true }, { success: true }] }, 1, 2).verdict, 'unsure', 'success талбаргүй');
console.log('✅ шилжүүлэлтийн бие · хариуны дүгнэлт');

/* ── 4б. урьдчилсан тооцоо ── */
assert.equal(MM.judgePreview('БАГЦ1', undefined).verdict, 'failed');
assert.equal(MM.judgePreview('БАГЦ71', failedPm).verdict, 'failed');
assert.equal(MM.judgePreview('БАГЦ71', failedPm).total, null);
const pvEmpty = MM.judgePreview('БАГЦ2', MM.mergeSheetMoney('БАГЦ2', []));
assert.equal(pvEmpty.verdict, 'empty');
assert.equal(pvEmpty.total, null, 'хоосон — null, 0 биш');
const pvInc = MM.judgePreview('БАГЦ1', pm);
assert.equal(pvInc.verdict, 'incomplete', 'нэгжгүй/олдоогүй нүдтэй');
assert.equal(pvInc.total, 15500);
assert.equal(pvInc.months, 2);
const pvOk = MM.judgePreview('БАГЦ1', MM.mergeSheetMoney('БАГЦ1', [{ sheet: 'x', money: { byMonth: new Map([['2026-10', 7]]), noUnit: 0, noRow: 0 } }]));
assert.equal(pvOk.verdict, 'ok');
assert.match(MM.previewText(pvOk), /7/);
/* ⚠️ хяналт №2: хоосон uy_shat (импортоос өмнөх 78 мөр) — ЗӨВШӨӨРӨХГҮЙ */
assert.equal(MM.isSwitchPhase(null), false);
assert.equal(MM.isSwitchPhase(''), false);
assert.equal(MM.isSwitchPhase(' Барилга угсралт '), true);
assert.equal(MM.isSwitchPhase('Ажлын зураг төсөл'), false);
assert.equal(MM.switchPhaseWhy('Барилга угсралт'), null);
assert.match(MM.switchPhaseWhy(null), /тодорхойгүй/);
assert.match(MM.switchPhaseWhy('Ажлын зураг төсөл'), /Ажлын зураг төсөл/);
assert.equal(MM.sameVerdict({ verdict: 'incomplete', total: 15500 }, pvInc), true);
assert.equal(MM.sameVerdict({ verdict: 'incomplete', total: 15500.4 }, pvInc), true, '±1 ₮');
assert.equal(MM.sameVerdict({ verdict: 'incomplete', total: 15000 }, pvInc), false);
assert.equal(MM.sameVerdict({ verdict: 'incomplete', total: 15500 }, pvEmpty), false, 'дутуу → хоосон');
assert.equal(MM.sameVerdict({ verdict: 'empty', total: null }, pvEmpty), true);
/* хуудасны уншилт бүхэлдээ унасан — багц бүр failed, хуудасгүй түлхүүр орохгүй */
const fs0 = MM.failedSheets(new Set(['БАГЦ1', 'БАГЦ16']));
assert.ok(fs0.has('БАГЦ1') && !fs0.has('БАГЦ16'));
assert.ok(fs0.get('БАГЦ1').failed.length > 0 && fs0.get('БАГЦ1').byMonth.size === 0);
const fsMm = MM.buildMonthlyMoney([mk(40, 'БАГЦ1', 100, 'huvaari'), mk(41, 'БАГЦ2', 100, 'garaar')],
  [{ id: 41, start: Date.UTC(2026, 0, 1), pct: 50, amount: 50 }], fs0);
assert.equal(fsMm.contracts.get(40).state, 'failed');
assert.deepEqual(fsMm.gaps.failed, [40]);
assert.equal(fsMm.rows.length, 1, "'garaar' гэрээний мөр хэвээр — S-муруй унахгүй");
console.log('✅ урьдчилсан тооцоо · үе шатын шалгуур');

/* ── 5. шилжүүлэлт — хуурамч сервер ── */
let db;
let posts;
let mode;
let pv;
const reset = (o = {}) => {
  db = {
    parents: [{ OBJECTID: 11, Cashflow_ID: 11, bagts: 'БАГЦ-1', sar_mongo_eh: null, uy_shat: 'Барилга угсралт', ...o }],
    months: [{ OBJECTID: 79 }, { OBJECTID: 80 }],
    others: [],
  };
  posts = [];
  mode = 'ok';
  pv = pvOk;
};
const io = {
  query: async (where) => {
    if (mode === 'readFail' && posts.length) throw new TypeError('Failed to fetch');
    /* багцын бусад мөнгөний мөр (өрсөлдөгч 'huvaari' гэрээ) — Cashflow_ID шүүлтгүй */
    if (!/Cashflow_ID = 11/.test(where)) return [...db.parents, ...db.others].map((x) => ({ ...x }));
    return /Cashflow_start IS NOT NULL/.test(where) ? db.months.map((x) => ({ ...x })) : db.parents.map((x) => ({ ...x }));
  },
  preview: async () => pv,
  applyEdits: async (b) => {
    posts.push(b);
    const del = b.deletes ? b.deletes.split(',') : [];
    if (mode === 'refuse') return { updateResults: [{ success: false, error: { description: 'Field error' } }], deleteResults: [] };
    /* бичилт серверт СУУНА */
    db.parents[0].sar_mongo_eh = JSON.parse(b.updates)[0].attributes.sar_mongo_eh;
    db.months = db.months.filter((m) => !del.includes(String(m.OBJECTID)));
    if (mode === 'lost' || mode === 'readFail') throw new ArcGISError('timeout', 'x/applyEdits');
    if (mode === 'partial') return { updateResults: [{ success: true }], deleteResults: [] };
    /* өөр хэрэглэгч хуучин 'garaar' хуудаснаас шинэ сарын мөр нэмэв, хариу дутуу */
    if (mode === 'racePartial') { db.months.push({ OBJECTID: 95 }); return { updateResults: [{ success: true }], deleteResults: [] }; }
    return { updateResults: [{ success: true }], deleteResults: del.map(() => ({ success: true })) };
  },
};

reset();
let r = await MM.switchToHuvaari(11, io);
assert.deepEqual(r, { deleted: 2, already: false, verified: false, preview: pvOk });
assert.equal(posts.length, 1, 'НЭГ атом хүсэлт');
assert.deepEqual(posts[0], MM.buildSwitchEdits(11, [79, 80]));
console.log('✅ энгийн шилжүүлэлт — нэг хүсэлт');

reset({ sar_mongo_eh: 'huvaari' }); db.months = [];
r = await MM.switchToHuvaari(11, io);
assert.deepEqual(r, { deleted: 0, already: true, verified: false, preview: null });
assert.equal(posts.length, 0, 'аль хэдийн шилжсэн — бичихгүй');

reset(); mode = 'refuse';
await assert.rejects(MM.switchToHuvaari(11, io), (err) => !isLostWrite(err) && /Field error/.test(err.message));
assert.equal(db.months.length, 2, 'татгалзсан — юу ч өөрчлөгдөөгүй');
console.log('✅ тодорхой татгалзал');

reset(); mode = 'lost';
r = await MM.switchToHuvaari(11, io);
assert.deepEqual(r, { deleted: 2, already: false, verified: true, preview: pvOk }, 'хариу алдагдсан ч серверт суусан — дахин уншиж батлав');
reset(); mode = 'partial';
r = await MM.switchToHuvaari(11, io);
assert.equal(r.verified, true, 'дутуу хариу → дахин уншилт');
reset(); mode = 'racePartial';
r = await MM.switchToHuvaari(11, io);
assert.equal(r.verified, true, 'шинээр нэмэгдсэн сарын мөр — илгээсэн OID-ууд алга тул амжилт');
reset(); mode = 'readFail';
await assert.rejects(MM.switchToHuvaari(11, io), (err) => isLostWrite(err) && err.lost === true);
console.log('✅ хариу алдагдсан — дахин уншиж батална / тодорхойгүй бол lost');

reset(); db.parents = [];
await assert.rejects(MM.switchToHuvaari(11, io), /олдсонгүй/);
reset(); db.parents.push({ ...db.parents[0], OBJECTID: 12 });
await assert.rejects(MM.switchToHuvaari(11, io), /давхардсан/);
reset({ bagts: 'БАГЦ-16.1' });
await assert.rejects(MM.switchToHuvaari(11, io), /хуудас алга/);
assert.equal(posts.length, 0, 'хуудасгүй багц — бичихгүй');
await assert.rejects(MM.switchToHuvaari(0, io), /буруу/);
console.log('✅ хамгаалалт — олдоогүй · давхардсан · хуудасгүй · буруу дугаар');

/* ── 6. (хяналт) хоосон/дутуу/уншигдаагүй тооцоо · үе шат · хуваалцсан багц ── */
reset(); pv = pvEmpty;
await assert.rejects(MM.switchToHuvaari(11, io), (err) => MM.isSwitchIncomplete(err) && err.preview === pvEmpty);
assert.equal(posts.length, 0, 'хоосон тооцоо — гараар мөр УСТГАХГҮЙ');
assert.equal(db.months.length, 2);
reset(); pv = pvInc;
await assert.rejects(MM.switchToHuvaari(11, io), (err) => MM.isSwitchIncomplete(err));
assert.equal(posts.length, 0, 'дутуу тооцоо — батлалтгүй бичихгүй');
reset(); pv = pvEmpty;
await assert.rejects(MM.switchToHuvaari(11, io, { allowIncomplete: true }), (err) => MM.isSwitchIncomplete(err));
assert.equal(posts.length, 0, 'батласан дүгнэлтгүй (expect) allowIncomplete — бичихгүй');
reset(); pv = pvEmpty;
r = await MM.switchToHuvaari(11, io, { allowIncomplete: true, expect: { verdict: 'empty', total: null } });
assert.equal(r.deleted, 2, 'хоёр дахь батлалтын дараа л');
assert.equal(r.preview, pvEmpty);
/* хяналт №2: «дутуу, 15,500 ₮» гэж батласан, сервер одоо «хоосон» — татгалзана */
reset(); pv = pvEmpty;
await assert.rejects(MM.switchToHuvaari(11, io, { allowIncomplete: true, expect: { verdict: 'incomplete', total: 15500 } }), /өөрчлөгдсөн/);
assert.equal(posts.length, 0, 'батласнаас өөр тооцоо — гараар мөр УСТГАХГҮЙ');
reset(); pv = pvOk;
await assert.rejects(MM.switchToHuvaari(11, io, { expect: { verdict: 'ok', total: 999 } }), /өөрчлөгдсөн/);
assert.equal(posts.length, 0, "'ok' ч нийт нь зөрвөл бичихгүй");
reset({ uy_shat: null });
await assert.rejects(MM.switchToHuvaari(11, io), /тодорхойгүй/);
assert.equal(posts.length, 0, 'хоосон uy_shat — бичихгүй (хяналт №2)');
reset(); pv = MM.judgePreview('БАГЦ1', undefined);
await assert.rejects(MM.switchToHuvaari(11, io, { allowIncomplete: true }), (err) => !MM.isSwitchIncomplete(err) && /уншигдсангүй/.test(err.message));
assert.equal(posts.length, 0, 'уншигдаагүй — allowIncomplete-ээр ч бичихгүй');
reset({ uy_shat: 'Ажлын зураг төсөл' });
await assert.rejects(MM.switchToHuvaari(11, io), /Барилга угсралт/);
assert.equal(posts.length, 0, 'зураг төслийн гэрээ — бичихгүй');
reset({ uy_shat: 'Барилга угсралт' });
r = await MM.switchToHuvaari(11, io);
assert.equal(r.deleted, 2);
reset(); db.others = [{ OBJECTID: 30, Cashflow_ID: 30, bagts: 'Багц 1', sar_mongo_eh: 'huvaari' }];
await assert.rejects(MM.switchToHuvaari(11, io), /нэг л гэрээнд/);
assert.equal(posts.length, 0, 'багцын хуудас аль хэдийн өөр гэрээнд — бичихгүй');
reset(); db.others = [{ OBJECTID: 31, Cashflow_ID: 31, bagts: 'БАГЦ-1', sar_mongo_eh: null }, { OBJECTID: 32, Cashflow_ID: 32, bagts: 'БАГЦ-2', sar_mongo_eh: 'huvaari' }];
r = await MM.switchToHuvaari(11, io);
assert.equal(r.deleted, 2, 'гараар хөрш / өөр багцын huvaari — саадгүй');
console.log('✅ хяналт — хоосон/дутуу тооцоо · үе шат · нэг багц = нэг гэрээ');

/* ── 7. (хяналт №2) нэгдсэн урсгал `confirmAndSwitch` ── */
const asks = [];
let answers = [];
const ask = async (msg, o) => { asks.push({ msg, o }); return answers.shift() ?? false; };
const busy = [];
const flow = (o = {}) => MM.confirmAndSwitch({
  cashflowId: 11, name: 'Багц-1 · Барилга', pkg: 'БАГЦ1', phase: 'Барилга угсралт', manualRows: 2, manualTotal: 1234,
  money: (v) => `${v} ₮`, ask, io, onBusy: (b) => busy.push(b), ...o,
});
reset(); asks.length = 0;
let fl = await flow({ phase: '' });
assert.equal(fl.kind, 'refused');
assert.match(fl.msg, /тодорхойгүй/);
assert.equal(asks.length, 0, 'үе шат тодорхойгүй — цонх ч нээгдэхгүй');
reset(); asks.length = 0; pv = MM.judgePreview('БАГЦ1', undefined);
fl = await flow();
assert.equal(fl.kind, 'refused', "'failed' тооцоо — цонхгүй татгалзана");
assert.equal(asks.length, 0);
reset(); asks.length = 0; answers = [false];
fl = await flow();
assert.equal(fl.kind, 'cancel');
assert.match(asks[0].msg, /1234 ₮/, 'устах гараар нийтийг нэрлэнэ');
assert.match(asks[0].msg, /7/, 'тооцоолсон нийтийг нэрлэнэ');
assert.equal(posts.length, 0);
reset(); asks.length = 0; answers = [true];
fl = await flow();
assert.equal(fl.kind, 'done');
assert.equal(fl.result.deleted, 2);
assert.equal(asks.length, 1, "'ok' — нэг цонх");
reset(); asks.length = 0; pv = pvInc; answers = [true, false];
fl = await flow();
assert.equal(fl.kind, 'cancel', 'дутуу — 2-р цонхонд цуцалсан');
assert.equal(asks.length, 2);
assert.equal(posts.length, 0);
reset(); asks.length = 0; pv = pvInc; answers = [true, true];
fl = await flow();
assert.equal(fl.kind, 'done', 'дутуу — хоёр батлалтын дараа');
/* батласны дараа сервер «хоосон» буцаав — preview эхэндээ дутуу, дараа нь хоосон */
reset(); asks.length = 0; answers = [true, true];
let calls = 0;
const io2 = { ...io, preview: async () => (calls++ === 0 ? pvInc : pvEmpty) };
await assert.rejects(flow({ io: io2 }), /өөрчлөгдсөн/);
assert.equal(posts.length, 0, 'батласан «дутуу» ≠ «хоосон» — устгахгүй');
assert.equal(busy.at(-1), false, 'busy буцаж унтарна');
console.log('✅ хяналт №2 — нэгдсэн урсгал (үе шат · тооцоо · 2 цонх · батласан дүгнэлт)');

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

console.log('monthlyMoney.check — бүгд давлаа');
