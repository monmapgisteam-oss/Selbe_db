/**
 * БАГЦЫН ГҮЙЦЭТГЭЛ — НЭГ ТОО БҮХ ДЭЛГЭЦЭД (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/pkgProgress.ui.check.mjs
 *
 * ⚠️ ЯАГААД. «Гүйцэтгэл»/«Багцын мэдээлэл»-ийн жагсаалт 2026-09-30-нд «бодит
 *    гүйцэтгэл» (`Finance.physLatest`) руу шилжсэн. Харин сонгосон багцын KPI
 *    хавтан/бөгж (`Bagts.buildPacks` → `PackKpi` · `ContractCard`), удирдлагын
 *    тайлангийн багцын мөр, Дашбоард «Багц ажлаар», Тайлан §2 нь барилгын
 *    давхаргын FEATURE-ээр дундажлагдсаар байв. Давхаргад «БАГЦ1|29/1», «БАГЦ2|5/6»
 *    ХОЁР feature-тэй, «БАГЦ1|29/3», «БАГЦ2|5/8» footprint-гүй (амьдаар баталсан —
 *    `blockProgress.check` KNOWN_DUP/KNOWN_ORPHAN) тул Багц 1 · 2 нэг дэлгэц дээр
 *    хоёр өөр хувьтай харагддаг байв. Одоо бүгд `blockProgress.pkgProgressOf`.
 *
 * Шалгана:
 *   1. `pkgProgressOf` ≡ `physLatest(buildPhys(...))` — жагсаалтын тоо ба бусад
 *      дэлгэцийн тоо нэг өгөгдлөөс ЯГ таарна.
 *   2. `buildPacks(rows, pkgPct)` — барилгын багцын `progress` нь Map-аас; Map-д
 *      байхгүй бол `null` (feature-ийн дундаж руу буцаж унахгүй); Map-гүй бол хуучин.
 *   3. `PackKpi` — сонгосон багцын «гүйцэтгэл» хавтан `active.progress`-ийг зурна
 *      (давхардсан feature-ээр дахин дундажлахгүй).
 *
 * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): хуваарь нь бөглөх хуудасны БҮХ блок (`universe`),
 *    тайлагнаагүй (эсвэл нүд нь цэвэрлэгдсэн) блок 0%; ОГТ тайлагнаагүй багц 0% (урьд нь
 *    Map-д ордоггүй, null). Доорх хүлээгдэж буй утгууд шинэ дүрмээр (60 → 45, 12.5 → 6.25).
 */
import assert from 'node:assert/strict';

/* ── Хөтөчийн хамгийн бага глобалууд (модулийн дээд түвшний шалгалтад) ── */
const g = globalThis;
const noop = () => {};
const mem = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: () => null, get length() { return m.size; },
  };
};
const elem = () => ({
  style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop, getAttribute: () => null, appendChild: (c) => c, removeChild: (c) => c,
  querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop,
});
Object.assign(g, {
  window: g,
  document: { documentElement: { ...elem(), lang: 'mn' }, body: elem(), head: elem(), createElement: elem,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop, removeEventListener: noop },
  localStorage: mem(), sessionStorage: mem(),
  matchMedia: (q) => ({ matches: false, media: q, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop, removeEventListener: noop,
  location: Object.assign(new URL('http://localhost/'), { assign: noop, replace: noop, reload: noop }),
  history: { pushState: noop, replaceState: noop, state: null },
});
/* ⚠️ Сүлжээ ҮГҮЙ */
g.fetch = () => Promise.reject(new Error('pkgProgress.ui.check: сүлжээгүй'));
for (const fn of ['setInterval', 'setTimeout']) {
  const orig = g[fn];
  g[fn] = (...a) => { const t = orig(...a); t?.unref?.(); return t; };
}

const { pkgProgressOf } = await import('@/lib/blockProgress.ts');
const { buildPhys } = await import('@/lib/finPhys.ts');
const { buildingKey } = await import('@/lib/services.ts');
const { monthKey } = await import('@/lib/format.ts');
const { physLatest, projectPlanOf, physNow, contractMonths } = await import('@/modules/Finance.tsx');
const { buildPacks, PackKpi, blockCount } = await import('@/modules/Bagts.tsx');
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');

/* ── 1. pkgProgressOf ≡ physLatest ── */
const now = monthKey();
const [ny, nm] = now.split('-').map(Number);
const ym = (back) => {
  const d = new Date(ny, nm - 1 - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const m2 = ym(2); const m1 = ym(1);
/* Бөглөх хуудасны түүх (`loadBlockHistory`-ийн хэлбэр): БАГЦ1 — 3 блок (29/3 нь
   давхаргад footprint-гүй ч хуудсанд бий), нэг блок нүд нь ЦЭВЭРЛЭГДСЭН (null). */
const hist = new Map([
  [buildingKey('Багц 1', '29/1'), [{ date: `${m2}-05`, pct: 40 }, { date: `${m1}-10`, pct: 90 }]],
  [buildingKey('Багц 1', '29/2'), [{ date: `${m2}-05`, pct: 30 }]],
  [buildingKey('Багц 1', '29/3'), [{ date: `${m1}-12`, pct: 60 }]],
  [buildingKey('Багц 1', '29/4'), [{ date: `${m2}-05`, pct: 20 }, { date: `${m1}-01`, pct: null }]],
  [buildingKey('Багц 2', '5/1'), [{ date: `${m2}-20`, pct: 12.5 }]],
]);
/* `blockProgress.compute`-ийн дүрэм: блок бүрийн СҮҮЛИЙН бичлэг, null бол хасна */
const pm = new Map();
for (const [k, pts] of hist) {
  const last = pts[pts.length - 1];
  if (last.pct != null) pm.set(k, { overall: last.pct, date: last.date, phases: [] });
}
/* ⚠️ 2026-10-01: бөглөх хуудасны блокийн хуваарь — Багц 2-т тайлагнаагүй 5/2, Багц 3.1 огт тайлагнаагүй */
const uni = new Map([
  ['БАГЦ1', ['29/1', '29/2', '29/3', '29/4'].map((b) => buildingKey('Багц 1', b))],
  ['БАГЦ2', ['5/1', '5/2'].map((b) => buildingKey('Багц 2', b))],
  ['БАГЦ31', [buildingKey('Багц 3.1', '5/1')]],
]);
const means = pkgProgressOf(pm, uni);
assert.equal(means.get('БАГЦ1').pct, 45, '(90 + 30 + 60 + 0) / 4 — цэвэрлэгдсэн 29/4 0%-иар хуваарьт (урьд нь /3 = 60)');
assert.equal(means.get('БАГЦ1').blocks, 3);
assert.equal(means.get('БАГЦ1').total, 4);
assert.equal(means.get('БАГЦ2').pct, 6.25, '(12.5 + 0) / 2 — тайлагнаагүй 5/2 0% (урьд нь 12.5)');
assert.equal(means.get('БАГЦ31').pct, 0, 'огт тайлагнаагүй багц 0% (урьд нь Map-д ордоггүй)');
assert.equal(means.has('БАГЦ3'), false, 'хуваарьгүй багц Map-д орохгүй (null ≠ 0)');

const axis = [ym(3), m2, m1, now];
const { phys, physN, physAt } = buildPhys(hist, axis, now, uni);
const monthsOf = (k) => axis.map((label) => ({ label, given: 0, phys: phys.get(k)?.get(label) ?? null }));
for (const k of ['БАГЦ1', 'БАГЦ2']) {
  assert.equal(physLatest(monthsOf(k)), means.get(k).pct,
    `${k}: жагсаалтын «бодит гүйцэтгэл» (physLatest) ≠ pkgProgressOf — дэлгэцүүд зөрнө`);
}
/* ⚠️ 2026-10-01: огт тайлагнаагүй багц — жагсаалт (`contractMonths` → `physLatest`) ч 0%, «—» БИШ */
{
  const fin0 = { given: new Map(), phys, physAt, physN };
  const ms = contractMonths({ bagts: 'Багц 3.1' }, fin0);
  assert.equal(physLatest(ms), means.get('БАГЦ31').pct, 'БАГЦ31: жагсаалт 0% биш (pkgProgressOf-оос зөрөв)');
  assert.equal(ms.filter((m) => m.phys != null).length, 1, 'тайлагнаагүй багцад ганц (энэ сарын) 0 цэг');
  /* Хуваарьгүй багц — «—» хэвээр */
  assert.equal(physLatest(contractMonths({ bagts: 'Багц 3.3' }, fin0)), null);
}

/* ── 2. buildPacks(rows, pkgPct) ── */
const blk = (oid, bagts, blok, progress) => ({
  oid, key: buildingKey(bagts, blok), bagts, blok, contractor: 'X', ail: 10, floors: 9, progress, phases: new Map(),
});
/* Давхаргын feature: 29/1 ХОЁР удаа, 29/3 алга (Багц 2 гэж бичигдсэн) */
const rows = [
  blk(1, 'Багц 1', '29/1', 90), blk(2, 'Багц 1', '29/1', 90), blk(3, 'Багц 1', '29/2', 30),
  blk(4, 'Багц 2', '29/3', null), blk(5, 'Багц 2', '5/1', 12.5),
  blk(6, 'Багц 3.1', '5/1', null),
];
const pkgPct = new Map([...means].map(([k, v]) => [k, v.pct]));
const packs = buildPacks(rows, pkgPct);
const pk = (key) => packs.find((p) => p.key === key);
assert.equal(pk('БАГЦ1').progress, 45, 'buildPacks: pkgPct-ийг дагасангүй (feature-ийн дундаж 70 гарах ёсгүй)');
assert.equal(pk('БАГЦ2').progress, 6.25);
/* ⚠️ 2026-10-01: тайлагнаагүй багц pkgPct-д 0 — feature-ийн дундаж руу унахгүй */
assert.equal(pk('БАГЦ31').progress, 0, 'тайлагнаагүй багц 0% (урьд нь null)');
assert.equal(buildPacks(rows, new Map()).find((p) => p.key === 'БАГЦ31').progress, null,
  'pkgPct-д байхгүй (хуваарьгүй) багц null — feature-ийн дундаж руу унахгүй');
assert.equal(pk('БАГЦ1').blocks.length, 3, 'блокийн жагсаалт (feature, OID-оор) хэвээр');
/* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ТОО нь түлхүүрээр — давхардсан «29/1» полигон НЭГ блок */
assert.equal(blockCount(pk('БАГЦ1')), 2, 'давхардсан полигон блокийн тоонд хоёр орсон');
assert.equal(pk('БАГЦ1').households, 20, 'давхардсан полигоны айл хоёр тоологдов');
/* pkgPct-гүй (хуучин дуудагч) → түлхүүрийн дундаж (90 + 30) / 2 = 60 (урьд нь feature-ээр 70) */
assert.equal(buildPacks(rows).find((p) => p.key === 'БАГЦ1').progress, 60);

/* ── 3. PackKpi — сонгосон багцын «гүйцэтгэл» хавтан ── */
const html = renderToStaticMarkup(React.createElement(PackKpi, { active: pk('БАГЦ1'), packs }));
assert.ok(html.includes('45.0%'), `PackKpi: сонгосон багцын хувь 45.0% биш — ${html.slice(0, 200)}`);
assert.ok(!html.includes('70.0%'), 'PackKpi: feature-ээр дахин дундажласан 70.0% гарав');

/* ── 3b. ⚠️ 2026-10-01 (ШИЙДВЭР): багц СОНГООГҮЙ үеийн «гүйцэтгэл» = төслийн нэгдсэн орон сууцны
      тоо (`physNow`, «Гүйцэтгэл»-ийн толгойтой нэг) — блокийн энгийн дундаж БИШ ── */
{
  const none = renderToStaticMarkup(React.createElement(PackKpi, { active: null, packs, project: { pct: 41.25, loading: false } }));
  assert.ok(none.includes('41.3%'), `сонголтгүй: төслийн тоо гарсангүй — ${none.slice(0, 300)}`);
  assert.ok(none.includes('бодит гүйцэтгэлийн хувь'), '«Гүйцэтгэл»-ийн толгойтой ижил нэр');
  const loading = renderToStaticMarkup(React.createElement(PackKpi, { active: null, packs, project: { pct: null, loading: true } }));
  assert.ok(loading.includes('…'), 'ачаалж байхад «…»');
  /* блокийн энгийн дундаж руу БУЦАЖ УНАХГҮЙ */
  const noProj = renderToStaticMarkup(React.createElement(PackKpi, { active: null, packs }));
  assert.ok(!/\d+\.\d%/.test(noProj.split('бодит гүйцэтгэлийн хувь')[0].slice(-80)), 'project-гүй үед блокийн дундаж гарав');
  /* сонголттой үед — багцын тоо, давхардсан полигон нэг блок */
  const act = renderToStaticMarkup(React.createElement(PackKpi, { active: pk('БАГЦ1'), packs }));
  assert.ok(act.includes('>2<'), `сонгосон багцын блок 2 биш — ${act.slice(0, 300)}`);
}
{
  /* physNow — pkgShared-ийн дахин экспорт ба Finance-ийн эх нэг функц */
  const shared = await import('@/modules/pkgShared.ts');
  assert.equal(shared.physNow, physNow, 'pkgShared.physNow ≠ Finance.physNow');
}

/* ── 4. ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ — бодит (`physNow`)-той НЭГ (ХО) жин (`Finance.projectPlanOf`) ──
      ⚠️ 2026-09-30: бодит тал ХО дүнгээр жигнэгдэх болсон атал төлөвлөгөө (`PlanCurve.months`)
      БЛОКИЙН тоогоор үлдэж, TsKpi · удирдлагын тайлан · `lagOf`-ийн «төлөвлөсөн − бодит»
      хоёр өөр жинг хасдаг байв. Жин нь ИЖИЛ `contracts`-оос (`pkgCostWeight`). */
{
  const fin = {
    contracts: [
      { bagts: 'Багц 1', ho_dun_geree: 400, bagts_tuvshin1: '1' },
      { bagts: 'Багц 2', ho_dun_geree: 600, bagts_tuvshin1: '1' },
      /* «Нийт»-ийн гадна (7-р хэсэг) — жинд орохгүй */
      { bagts: 'Багц 2', ho_dun_geree: 9999, bagts_tuvshin1: '7' },
    ],
  };
  const pc = {
    /* блокоор жигнэсэн хуучин төслийн муруй — тэнхлэг/vol эндээс */
    months: [{ label: m2, pct: 111, vol: 5 }, { label: m1, pct: 222, vol: null }],
    byBagts: new Map([
      ['БАГЦ1', [{ label: m2, pct: 10, vol: null }, { label: m1, pct: 20, vol: null }]],
      ['БАГЦ2', [{ label: m1, pct: 50, vol: null }]],
    ]),
    bySheet: new Map(), from: null, to: null, failed: [],
  };
  const s = projectPlanOf(fin, pc);
  /* m2: Б2 эхлээгүй → (400·10 + 600·0)/1000 = 4; m1: (400·20 + 600·50)/1000 = 38 */
  assert.deepEqual(s.map((p) => p.pct), [4, 38], 'projectPlanOf ХО дүнгээр жигнэсэнгүй');
  assert.equal(s[0].vol, 5, 'vol нь PlanCurve.months-оос');
  assert.deepEqual(projectPlanOf(fin, { ...pc, months: [] }), [], 'хуудас унасан (months хоосон) → хоосон');
}

/* ── 5. ⚠️ 2026-10-01 (ШИЙДВЭР): «Багцын санхүү»-гийн «олгосон хувь» = олгосон ÷ ГЭРЭЭЛСЭН ДҮН
      (`gdash.contractedScope`) — удирдлагын тайлантай нэг хуваарь, шошго «гэрээний дүнгийн %» ── */
{
  const { pkgFinRows, paidPctOf } = await import('@/modules/PkgFin.tsx');
  assert.equal(paidPctOf(25, 100), 25);
  assert.equal(paidPctOf(25, 0), null, 'гэрээлсэн дүн 0 — хувь зохиохгүй');
  const fin = {
    contracts: [
      /* Багц 1: гэрээлсэн 400 + гэрээгүй мөрийн ХО 600 (төлөвлөгөөнд орно, хуваарьт ОРОХГҮЙ) */
      { bagts: 'Багц 1', geree_dun: 400, ho_dun_geree: 400, ho_dungiin_tailbar: 'Гэрээлсэн дүн', bagts_tuvshin1: '2' },
      { bagts: 'Багц 1', geree_dun: null, ho_dun_geree: 600, ho_dungiin_tailbar: '', bagts_tuvshin1: '2' },
      /* Багц 2: гэрээгүй */
      { bagts: 'Багц 2', geree_dun: null, ho_dun_geree: 500, ho_dungiin_tailbar: '', bagts_tuvshin1: '2' },
    ],
    planTotal: new Map([['БАГЦ1', 1000], ['БАГЦ2', 500]]),
    givenTotal: new Map([['БАГЦ1', 100], ['БАГЦ2', 50]]),
    given: new Map(), phys: new Map(), physCnt: new Map(), physAt: new Map(), pays: [],
  };
  const fr = pkgFinRows(packs, fin).rows;
  const r1 = fr.find((r) => r.key === 'БАГЦ1');
  const r2 = fr.find((r) => r.key === 'БАГЦ2');
  assert.equal(r1.contract, 400);
  assert.equal(r1.pct, 25, 'олгосон 100 ÷ гэрээлсэн 400 = 25% (урьд нь ÷ төлөвлөгөө 1000 = 10%)');
  assert.equal(r2.pct, null, 'гэрээгүй багц — «—»');
}

console.log('pkgProgress.ui.check.mjs — БҮГД ТЭНЦЛЭЭ');
