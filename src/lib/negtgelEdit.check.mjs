/**
 * НЭГТГЭЛ ГҮЙЦЭТГЭЛ — ЗАСАХ · НИЙТЛЭХ-ийн загвар (2026-10-15, `negtgelEdit.ts`).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/negtgelEdit.check.mjs
 *
 * Хамгаалж буй зүйл (хэрэглэгч: «Cashflow шиг засах болон нийтлэх нэм, тоог өөрчлөхөд томьёоны дагуу
 * тооцоолол гарна»):
 *   1. Томьёо танилт — хадгалсан утгаас (E = Σ, F = E ÷ E(эцэг), G = F × G(эцэг), N…S = Σ F × хүүхэд);
 *      таараагүй (гараар бичсэн) эцэг нь ОРОЛТ.
 *   2. Засваргүй үед загвар = хадгалсан (бичих зөрүү 0).
 *   3. Навчны төсөв → E өвгүүд · ахан дүүсийн F · G · жигнэсэн нийлбэр дагаж өөрчлөгдөнө.
 *   4. Навчны гүйцэтгэл → өвгүүдийн S, биелэлт T…W.
 *   5. «Нийлбэрт орохгүй» мөр — багана бүрийн мужаар (`in` / `all`).
 *   6. Зөрүү — зөвхөн өөрчлөгдсөн талбар, хүснэгтийн масштабаар (хувь ×100).
 */
import assert from 'node:assert/strict';

const E = await import('./negtgelEdit.ts');
const { TUSUL_NEGTGEL } = await import('./services.ts');
const FL = TUSUL_NEGTGEL.fields;

const row = (o) => ({
  oid: o.oid, code: o.code ?? String(o.oid), name: o.name ?? '', bagts: '', depth: o.depth,
  w: o.w ?? null, p: o.p ?? null, budget: o.budget ?? null, outside: o.outside,
  act: o.act ?? null, planG: o.planG ?? null, planGch: null, planGu: null, planNw: null, planPw: o.planPw ?? null,
  perfG: o.perfG ?? null, perfGch: null, perfGu: null, perfWk: o.perfWk ?? null,
});
const near = (a, b, m) => assert.ok(a != null && Math.abs(a - b) < 1e-9, `${m}: ${a} ≠ ${b}`);

/*
 * 1 Үе шат (G 0.8 оролт)
 *   2  Бүлэг A  E = 100 (Σ), F = 1 (оролт), G = 0.8 (F × G)
 *     3  навч a  E 60 → F 0.6, G 0.48, S 0.5, N 0.8
 *     4  навч b  E 40 → F 0.4, G 0.32, S 0.25, N 0.5
 *   5  Нийслэл (outside) F 0.1, S 1
 * Үе шатны S = Σ «in» = 1 × 0.4 = 0.4 (outside хасна); N «all» = 1 × 0.68 + 0.1 × 1 = 0.78 (outside оруулна)
 */
const base = () => [
  row({ oid: 1, depth: 1, p: 0.8, act: 0.4, planG: 0.78, perfG: 0.4 / 0.78 }),
  row({ oid: 2, depth: 2, budget: 100, w: 1, p: 0.8, act: 0.4, planG: 0.68, perfG: 0.4 / 0.68 }),
  row({ oid: 3, depth: 3, budget: 60, w: 0.6, p: 0.48, act: 0.5, planG: 0.8, perfG: 0.625 }),
  row({ oid: 4, depth: 3, budget: 40, w: 0.4, p: 0.32, act: 0.25, planG: 0.5, perfG: 0.5 }),
  row({ oid: 5, depth: 2, w: 0.1, p: 0.08, act: 1, planG: 1, outside: true }),
];

{
  const b = base();
  const form = E.negForm(b);
  assert.equal(form.eSum[1], 'all', 'E = Σ хүүхэд');
  assert.equal(form.eSum[2], null, 'навчны E — оролт');
  assert.equal(form.fRatio[2], true, 'F = E ÷ E(эцэг)');
  assert.equal(form.fRatio[1], false, 'үе шатны дор E-гүй эцэг — F оролт');
  assert.equal(form.gChain[2], true, 'G = F × G(эцэг)');
  assert.equal(form.gChain[0], false, 'үе шатны G — оролт');
  assert.equal(form.roll.act[0], 'in', 'S — «нийлбэрт орохгүй»-г хассан');
  assert.equal(form.roll.planG[0], 'all', 'N — бүх хүүхэд (багана бүр өөр муж)');
  assert.equal(form.roll.act[1], 'in');
  /* засагдах */
  assert.equal(E.negEditable(b, form, 2, 'budget'), true, 'навчны төсөв');
  assert.equal(E.negEditable(b, form, 1, 'budget'), false, 'Σ төсөв');
  assert.equal(E.negEditable(b, form, 2, 'w'), false, 'томьёот F');
  assert.equal(E.negEditable(b, form, 1, 'w'), true, 'гараар өгсөн F');
  assert.equal(E.negEditable(b, form, 0, 'p'), true, 'үе шатны G');
  assert.equal(E.negEditable(b, form, 2, 'p'), false, 'томьёот G');
  assert.equal(E.negEditable(b, form, 2, 'act'), true, 'навчны S');
  assert.equal(E.negEditable(b, form, 2, 'act', true), false, 'системийн S — засагдахгүй');
  assert.equal(E.negEditable(b, form, 1, 'act'), false, 'томьёот S');
  /* засваргүй */
  assert.equal(E.negEditDiff(b, E.applyNegEdits(b, form, new Map())).length, 0, 'засваргүй — зөрүү 0');
}
{
  /* навчны төсөв 60 → 140: E(2) 180, F a 0.7777…, b 0.2222…, G = F × 0.8, S(2) = Σ F × S */
  const b = base();
  const form = E.negForm(b);
  const m = E.applyNegEdits(b, form, new Map([[3, { budget: 140 }]]));
  near(m[1].budget, 180, 'E — Σ');
  near(m[2].w, 140 / 180, 'F(a)');
  near(m[3].w, 40 / 180, 'F(b) — ах дүү ч дагаж');
  near(m[2].p, (140 / 180) * 0.8, 'G(a) = F × G(эцэг)');
  near(m[1].act, (140 / 180) * 0.5 + (40 / 180) * 0.25, 'S(бүлэг)');
  near(m[0].act, m[1].act, 'S(үе шат) = 1 × S(бүлэг)');
  near(m[0].perfG, m[0].act / m[0].planG, 'T = S ÷ N');
  near(m[4].w, 0.1, 'outside мөр хөндөгдөхгүй');
  /* зөрүү — хувь ×100, төсөв ₮ */
  const d = E.negEditDiff(b, m);
  const r3 = d.find((x) => x[TUSUL_NEGTGEL.oid] === 3);
  assert.equal(r3[FL.budget], 140);
  near(r3[FL.inSection], (140 / 180) * 100, 'F ×100');
  assert.ok(!(FL.actPct in r3), 'өөрчлөгдөөгүй S бичигдэхгүй');
}
{
  /* навчны S 0.25 → 1: бүлэг 0.6 + 0.4 = 1.0; үе шат 1.0; N өөрчлөгдөхгүй */
  const b = base();
  const form = E.negForm(b);
  const m = E.applyNegEdits(b, form, new Map([[4, { act: 1 }]]));
  near(m[1].act, 0.6 * 0.5 + 0.4 * 1, 'S(бүлэг)');
  near(m[0].act, 1 * m[1].act, 'S(үе шат)');
  near(m[3].perfG, 1 / 0.5, 'T(b)');
  near(m[0].planG, 0.78, 'N хөндөгдөхгүй');
  assert.equal(E.negEditDiff(b, m).length, 3, 'b · бүлэг · үе шат');
}
{
  /* гараар бичсэн эцэг (Excel-ийн мужийн алдаа) — таараагүй тул ОРОЛТ, хүүхэд өөрчлөгдсөн ч хөндөгдөхгүй */
  const b = base();
  b[1].act = 0.33;
  b[0].act = 0.33;
  const form = E.negForm(b);
  assert.equal(form.roll.act[1], null, 'таараагүй S — оролт');
  const m = E.applyNegEdits(b, form, new Map([[4, { act: 1 }]]));
  near(m[1].act, 0.33, 'гараар бичсэн эцэг хэвээр');
}
{
  /* хоослох — null нь 0 БИШ: эцгийн нийлбэрт 0-ээр орно (Excel-ийн SUMPRODUCT), харин мөр нь хоосон */
  const b = base();
  const form = E.negForm(b);
  const m = E.applyNegEdits(b, form, new Map([[4, { act: null }]]));
  assert.equal(m[3].act, null);
  near(m[1].act, 0.6 * 0.5, 'хоосон хүүхэд 0');
  assert.equal(m[3].perfG, null, 'хоосон S → биелэлт хоосон');
  const r4 = E.negEditDiff(b, m).find((x) => x[TUSUL_NEGTGEL.oid] === 4);
  assert.equal(r4[FL.actPct], null, 'null бичигдэнэ');
}
{
  /* ⚠️ 2026-10-19 (аудит): бүх хүүхдийн төсөв хоосорвол эцгийн Σ E → null; эцгийн E null → хүүхдийн F · G → null */
  const b = base();
  const form = E.negForm(b);
  const m = E.applyNegEdits(b, form, new Map([[3, { budget: null }], [4, { budget: null }]]));
  assert.equal(m[1].budget, null, 'Σ E — хүүхэд бүгд хоосон → null (хуучин 100 биш)');
  assert.equal(m[2].w, null, 'F — эцгийн E null → null (хуучин 0.6 биш)');
  assert.equal(m[2].p, null, 'G = F × G — F null → null');
  /* эцгийн E = 0 → F тодорхойгүй */
  const z = E.applyNegEdits(b, form, new Map([[3, { budget: 0 }], [4, { budget: 0 }]]));
  near(z[1].budget, 0, 'Σ E = 0');
  assert.equal(z[3].w, null, 'F — эцгийн E 0 → null');
  /* N…S — бүх хүүхэд хоосон → эцэг null */
  const s = E.applyNegEdits(b, form, new Map([[3, { act: null }], [4, { act: null }]]));
  assert.equal(s[1].act, null, 'S(бүлэг) — хүүхэд бүгд хоосон → null (хуучин 0.4 биш)');
}
{
  /* ⚠️ 2026-10-19 (аудит): оролтын шалгалт */
  const P = E.parseNegInput;
  assert.deepEqual(P('12,5', 'act'), { ok: true, v: 0.125 });
  assert.deepEqual(P('12.5%', 'w'), { ok: true, v: 0.125 });
  assert.deepEqual(P('', 'p'), { ok: true, v: null }, 'хоосон → null');
  assert.equal(P('100.5', 'act').ok, false, 'хувь > 100');
  assert.equal(P('-1', 'planG').ok, false, 'сөрөг хувь');
  assert.equal(P('101', 'w').ok, false, 'F > 100');
  assert.equal(P('abc', 'act').ok, false, 'тоо биш');
  assert.deepEqual(P('1 234 567', 'budget'), { ok: true, v: 1234567 });
  assert.deepEqual(P('1234,5', 'budget'), { ok: true, v: 1234.5 }, '«1234,5» — бутархай (урьд нь 12345)');
  assert.deepEqual(P('1,234,567', 'budget'), { ok: true, v: 1234567 }, 'мянгатын таслал');
  assert.deepEqual(P('1,234,567.5', 'budget'), { ok: true, v: 1234567.5 });
  assert.deepEqual(P('1.234.567,5', 'budget'), { ok: true, v: 1234567.5 });
  assert.equal(P('1,234', 'budget').ok, false, '«1,234» — тодорхойгүй');
  assert.equal(P('-5', 'budget').ok, false, 'сөрөг төсөв');
  assert.deepEqual(P('0', 'budget'), { ok: true, v: 0 });
}
{
  /* ⚠️ 2026-10-19 (аудит): нийт мөр — дэлгэцийн томьёо (жинтэй хоосон → null; Σ жингээр нормчлол) */
  const T = E.negTotals([
    { p: 0.5, act: 0.4, planG: 0.5, planGch: 0.5, planGu: null, planNw: 0.1, planPw: 0.2 },
    { p: 0.4, act: 0.1, planG: 0.2, planGch: 0.2, planGu: 0.3, planNw: 0.1, planPw: 0.2 },
    { p: null, act: 1, planG: 1, planGch: 1, planGu: 1, planNw: 1, planPw: 1 },
  ]);
  near(T.p, 0.9, 'Σ жин');
  near(T.act, (0.5 * 0.4 + 0.4 * 0.1) / 0.9, 'S — Σ жингээр нормчилсон');
  assert.equal(T.planGu, null, 'жинтэй үе шатны P хоосон → нийт null');
  assert.equal(T.perfGu, null);
  near(T.perfG, T.act / T.planG, 'T = S ÷ N');
  const one = E.negTotals([{ p: 1, act: 0, planG: 0, planGch: null, planGu: null, planNw: null, planPw: null }]);
  assert.equal(one.perfG, 0, 'N = 0 → биелэлт 0');
}
{
  /* ⚠️ 2026-10-19 (аудит): зэрэг засвар — өөр хүний өөрчлөлт зөрчил; манай өмнөх (хариу алдагдсан) бичилт зөрчил биш */
  const b = base();
  const form = E.negForm(b);
  const m = E.applyNegEdits(b, form, new Map([[4, { act: 1 }]]));
  const ups = E.negEditDiff(b, m);
  assert.deepEqual(E.negStale(ups, b, base()), [], 'өөрчлөлтгүй');
  const other = base();
  other[3].act = 0.3;
  assert.deepEqual(E.negStale(ups, b, other), [4], 'өөр хүн S-ийг өөрчилсөн');
  const ours = E.negMerge(base(), ups);
  assert.deepEqual(E.negStale(ups, b, ours), [], 'манай өмнөх бичилт — зөрчил биш');
  assert.equal(E.negLanded(ups, ours, []), true, 'бичигдсэн');
  assert.equal(E.negLanded(ups, base(), []), false, 'бичигдээгүй');
  const moved = base().slice(1);
  assert.equal(E.negStale(ups, b, moved).length, ups.length, 'мөрийн бүтэц өөрчлөгдсөн — бүгд хуучирсан');
  /* нийт мөр */
  const root = { oid: 99, code: '0', act: 0.4, planG: 0.78, planGch: null, planGu: null, planNw: null, planPw: null, perfG: 0.4 / 0.78, perfGch: null, perfGu: null, perfWk: null };
  const ru = E.negRootUpdate(ours, root, root);
  assert.equal(ru.stale, false);
  near(ru.attrs[FL.actPct], 0.8 * (0.6 * 0.5 + 0.4 * 1) / 0.8 * 100, 'S(нийт) — Σ G × S ÷ Σ G, ×100');
  const elsewhere = { ...root, act: 0.55 };
  assert.equal(E.negRootUpdate(ours, elsewhere, root).stale, true, 'нийт мөр өөр газраас өөрчлөгдсөн');
  /* ⚠️ 2026-10-19: давхцаагүй өөр нийтлэгч — мөр 3-ыг засаж нийт мөрийг томьёогоор дахин бичсэн → зөрчил БИШ */
  const fresh2 = base();
  fresh2[2].act = 0.9;
  fresh2[1].act = 0.6 * 0.9 + 0.4 * 0.25;
  fresh2[0].act = fresh2[1].act;
  const T2 = E.negTotals(fresh2.filter((r) => r.depth === 1));
  const root2 = { ...root, act: T2.act, perfG: T2.perfG };
  const merged2 = E.negMerge(fresh2, E.negEditDiff(b, m).filter((u) => u[TUSUL_NEGTGEL.oid] === 4));
  assert.equal(E.negRootUpdate(merged2, root2, root, fresh2).stale, false, 'нийт мөр — шинэ мөрийн дахин бодолт, зөрчил биш');
  assert.equal(E.negRootUpdate(merged2, { ...root2, act: 0.123 }, root, fresh2).stale, true, 'томьёогоор тайлбарлагдахгүй өөрчлөлт — зөрчил');
}
{
  /* ⚠️ 2026-10-19: Σ жин 0 / бүх жин хоосон → нийт null (0 биш); нийт мөрт 0 бичихгүй */
  const nul = { act: 0.4, planG: 0.5, planGch: 0.5, planGu: 0.5, planNw: 0.1, planPw: 0.2 };
  const a = E.negTotals([{ p: null, ...nul }, { p: null, ...nul }]);
  assert.equal(a.act, null, 'бүх жин хоосон → S null');
  assert.equal(a.p, null, 'Σ жин null');
  assert.equal(a.perfG, null);
  const z = E.negTotals([{ p: 0, ...nul }]);
  assert.equal(z.act, null, 'Σ жин 0 → null');
  near(z.p, 0, 'Σ жин 0');
  const root = { oid: 99, code: '0', act: 0.4, planG: 0.5, planGch: null, planGu: null, planNw: null, planPw: null, perfG: 0.8, perfGch: null, perfGu: null, perfWk: null };
  const rows = [row({ oid: 1, depth: 1, act: 0.4, planG: 0.5 })];
  const ru = E.negRootUpdate(rows, root, root, rows);
  assert.ok(ru.attrs == null || Object.values(ru.attrs).every((v, i) => i === 0 || v !== 0), 'нийт мөрт 0 бичигдэхгүй');
  /* бүх хүүхдийн жин хоосон → эцгийн N…S null */
  const b = [
    row({ oid: 1, depth: 1, p: 1, act: 0.5 }),
    row({ oid: 2, depth: 2, w: 1, act: 0.5 }),
    row({ oid: 3, depth: 3, w: 0.5, act: 0.4 }),
    row({ oid: 4, depth: 3, w: 0.5, act: 0.6 }),
  ];
  const form = E.negForm(b);
  assert.equal(form.roll.act[1], 'in');
  const m = E.applyNegEdits(b, form, new Map([[3, { w: null }], [4, { w: null }]]));
  assert.equal(m[1].act, null, 'S(эцэг) — хүүхдийн жин бүгд хоосон → null (0 биш)');
  /* хадгалсан утгад бүх жин хоосон бол томьёо биш (засваргүй — зөрүү 0) */
  const nw = [row({ oid: 1, depth: 1, act: 0 }), row({ oid: 2, depth: 2, act: 0.5 })];
  const f2 = E.negForm(nw);
  assert.equal(f2.roll.act[0], null, 'жингүй муж — оролт');
  assert.equal(E.negEditDiff(nw, E.applyNegEdits(nw, f2, new Map())).length, 0);
}
assert.equal(E.parseCanUpdate('Query'), false);
assert.equal(E.parseCanUpdate('Query,Editing,Create,Update,Delete'), true);
assert.equal(E.parseCanUpdate('Query,Editing'), true, 'хуучин хэлбэр — дан Editing');
assert.equal(E.parseCanUpdate('Query,Editing,Create'), false, 'Create л — засахгүй');
assert.equal(E.parseCanUpdate(undefined), null);
assert.equal(E.negDiffers(null, 0), true, 'null ≠ 0');
assert.equal(E.negDiffers(0.1, 0.1 + 1e-9), false, 'бутархайн зөрүү үл тооцно');
assert.equal(E.negDiffers(100, 100.4, true), false, 'төсөв ₮ 0.5 хүртэл');

console.log('negtgelEdit: ok — томьёо танилт · засваргүй 0 · төсөв → E/F/G/Σ · S → өвөг/биелэлт · гараар бичсэн эцэг · null');
