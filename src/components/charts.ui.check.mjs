/**
 * `ui.tsx`-ийн графикийн бүрэлдэхүүн — нэгдсэн стандарт (2026-10-09, «бүх графикийн загварыг жигдлэх»).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/charts.ui.check.mjs
 *
 * ⚠️ Барьдаг дүрмүүд: `Meter` null → «—» + aria-valuenow-гүй (null ≠ 0), role="meter", pct() 1 орон;
 *    `Bars` display-гүй утга num(), null → дүүргэлтгүй «—»; `Series` null → баганагүй, 0 → 0 өндөр,
 *    items[].color; `Donut`/`Ring` хэмжээний стандарт (chartStyle).
 * ⚠️ 2026-10-23: Environment — уугуул `title` (багана/мөр/зүсмэг), «Дээд: X» pill-гүй, дүрсгүй хоосон
 *    төлөв, Donut-ын тайлбар 1 оронтой хувь, `BarChart` тэнхлэг/тор.
 */
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { monotonePath } from '@/lib/chartStyle';
import { Meter, Bars, Series, Donut, Ring, Trend, Stack, Empty, monotonePath as uiMonotone } from '@/components/ui';

assert.equal(uiMonotone, monotonePath, 'ui.tsx-ийн monotonePath нь chartStyle-ийн дахин экспорт');

/* ── ui.tsx: Meter ── */
const m1 = renderToStaticMarkup(h(Meter, { value: 42.345, plan: 50, label: 'Гүйцэтгэл' }));
assert.match(m1, /role="meter"/);
assert.match(m1, /aria-valuenow="42.345"/);
assert.match(m1, />42\.3%</, 'утга pct() 1 оронтой');
const m0 = renderToStaticMarkup(h(Meter, { value: null, label: 'Гүйцэтгэл' }));
assert.ok(!m0.includes('aria-valuenow'), 'null → aria-valuenow байхгүй (null ≠ 0)');
assert.match(m0, />—</, 'null → «—»');
assert.ok(!/0\.0%|>0%</.test(m0), 'null-ыг 0% гэж бичихгүй');

/* ── ui.tsx: Bars — display-гүй утга num(), null → «—» ба дүүргэлтгүй ── */
const b = renderToStaticMarkup(h(Bars, { items: [
  { key: 'a', label: 'A', value: 20162536361 },
  { key: 'b', label: 'B', value: null },
] }));
assert.ok(b.includes('20,162,536,361'), 'түүхий тоо биш num()');
assert.match(b, />—</);
assert.equal((b.match(/chartFill/g) || []).length, 1, 'null мөрд дүүргэлт зурахгүй');
/* ⚠️ 2026-10-23: Environment RowChart — уугуул title, шүүх заавар хэвээр */
const bSel = renderToStaticMarkup(h(Bars, { items: [{ key: 'a', label: 'A', value: 3 }], onSelect: () => {} }));
assert.match(bSel, /title="A · 3\nДарж газрын зурагт шүүнэ"/, 'Bars: title = нэр · утга + заавар');
assert.ok(renderToStaticMarkup(h(Bars, { items: [] })).includes('Үзүүлэлт байхгүй'), 'Bars: хоосон → .chart-empty');

/* ── ui.tsx: Series — null багана зурахгүй, 0 нь хамгийн бага багана ── */
const sr = renderToStaticMarkup(h(Series, { items: [
  { key: '1', label: '1', value: 0 },
  { key: '2', label: '2', value: null },
  { key: '3', label: '3', value: 5, color: 'var(--c2)' },
] }));
/* ⚠️ 2026-10-23: хэмжсэн 0 → 2px суурь зураас (>8 баганад шошго нуугдах тул null-аас ялгагдана) */
assert.equal((sr.match(/height:0%/g) || []).length, 0, '0 → 0% өндөр биш');
assert.equal((sr.match(/height:2px/g) || []).length, 1, '0 → 2px суурь зураас');
{
  const many = renderToStaticMarkup(h(Series, { items: Array.from({ length: 12 }, (_, i) => ({ key: String(i), label: String(i), value: i === 3 ? null : i === 5 ? 0 : 4 })) }));
  assert.equal((many.match(/height:2px/g) || []).length, 1, '>8 багана: 0 нь 2px зураастай');
  assert.equal((many.match(/seriesBar/g) || []).length, 11, '>8 багана: null нь баганагүй');
}
assert.match(sr, />0</, '0 утга баганын дээр бичигдэнэ (≤8 багана)');
assert.equal((sr.match(/seriesBar/g) || []).length, 2, 'null → баганагүй');
assert.ok(sr.includes('--tone:var(--c2)'), 'items[].color хүндэтгэнэ');

/* ── ⚠️ 2026-10-09 (аудит №3): олон цувааны муруй — шугам БҮР өөрийн талбайтай
   (2026-10-06 хэрэглэгчийн «доод талын fill»; жигдрэл хассан байсныг сэргээв) ── */
const ml = renderToStaticMarkup(h(Series, {
  line: true,
  items: [1, 2, 3, 4].map((k) => ({ key: String(k), label: String(k), value: k })),
  lines: [
    { key: 'a', label: 'A', color: 'var(--c1)', values: [1, 2, null, 4] },
    { key: 'b', label: 'B', color: 'var(--c2)', values: [3, 1, 2, 2] },
  ],
}));
const areas = ml.match(/fill:url\(#seriesArea[^)]*\)/g) || [];
assert.equal(areas.length, 2, `шугам бүрд талбай (ганц цэгтэй хэсэгт биш): ${areas.length}`);
assert.equal(new Set(areas).size, 2, 'шугам бүр өөрийн градиенттай');

/* ── ⚠️ 2026-10-09 (аудит №3): Trend анхдагч smooth=false (хэмжилтийн цуваа — хугарсан шугам) ── */
const tp = [{ label: '1', value: 1 }, { label: '2', value: 5 }, { label: '3', value: 2 }];
const pathDs = (html) => [...html.matchAll(/<path[^>]* d="([^"]+)"/g)].map((m) => m[1]);
assert.ok(pathDs(renderToStaticMarkup(h(Trend, { points: tp }))).every((d) => !d.includes('C')), 'анхдагч Trend зөөлрүүлэхгүй');
assert.ok(pathDs(renderToStaticMarkup(h(Trend, { points: tp, smooth: true }))).some((d) => d.includes('C')), 'smooth ил дамжуулбал муруй');

/* ── ui.tsx: Donut / Ring — хэмжээний стандарт ──
   ⚠️ 2026-10-23: Environment — өнгөгүй зүсмэг `cat(i)` БИШ, НЭГ `--data` + тунгалгийн шат (.92, .7) */
const dn = renderToStaticMarkup(h(Donut, { items: [{ key: 'x', label: 'X', value: 3 }, { key: 'y', label: 'Y', value: 1 }], size: 'sm' }));
assert.match(dn, /width="82"/, 'sm = 82 (Environment 112-ын харьцаа)');
assert.ok(dn.includes('fill:var(--data)') && !dn.includes('var(--c1)'), 'өнгөгүй зүсмэг → --data');
assert.ok(dn.includes('fill-opacity:0.92') && dn.includes('fill-opacity:0.7'), 'тунгалгийн шат .92 − i×.22');
const rg = renderToStaticMarkup(h(Ring, { value: 50, size: 'md' }));
assert.match(rg, /width="120"/);
assert.match(rg, /stroke-width="15\.6\d*"/, 'зузаан = R − .72R (Environment PieChart)');

/* ── 2026-10-09 (лавлах CRM загвар — өнгө хэвээр) ── */
/* ⚠️ 2026-10-23: Environment BarChart — тор + 34px тэнхлэг; масштаб = өгөгдлийн max (дээр нь утгын зай) */
assert.ok(sr.includes('gridLine') && sr.includes('barAxis'), 'Series: тор + тэнхлэг');
assert.ok(/height:84\.6\d*%/.test(sr), 'Series: 5 / 5 × (100 − 15.4) ≈ 84.6%');
assert.match(sr, /title="3 · 5"/, 'Series: уугуул title');
assert.ok(renderToStaticMarkup(h(Series, { items: [] })).includes('Үзүүлэлт байхгүй'), 'Series: хоосон → .chart-empty');
/* Series line (AreaChart): «Дээд: X» pill БАЙХГҮЙ; null → цоорхой хэвээр */
const sl = renderToStaticMarkup(h(Series, { line: true, items: [
  { key: 'a', label: 'a', value: 3 }, { key: 'b', label: 'b', value: 68 }, { key: 'c', label: 'c', value: null }, { key: 'd', label: 'd', value: 10 },
] }));
assert.ok(!sl.includes('Дээд'), 'Environment: «Дээд: X» pill хасагдсан');
assert.ok(!sl.includes('callout') && !sl.includes('hmark'), 'PointCallout / HoverMarker графикт байхгүй');
assert.ok(!sl.includes('chartGlow') && !sl.includes('drop-shadow'), 'шугам гэрэлтэлтгүй (2026-10-23: Environment)');
assert.ok(sl.includes('seriesLineDot'), 'ганц цэгтэй хэсэг (d) цэгээр харагдана');
/* Donut (2026-10-23: Environment): 7px цул тэмдэг, хувь нь ТАЙЛБАРТ (зүсмэг дотор биш),
   2px `--surface` зах, голд «НИЙТ» */
assert.ok(dn.includes('legendSwatch'), 'тайлбарын тэмдэг цул');
assert.ok(!dn.includes('donutPctIn') && dn.includes('>75.0%<') && dn.includes('>25.0%<'), 'хувь тайлбарт, 1 оронтой (75.0/25.0)');
assert.match(dn, /<title>X · 3 · 75\.0%<\/title>/, 'зүсмэг: уугуул <title>');
assert.ok(renderToStaticMarkup(h(Donut, { items: [{ key: 'z', label: 'Z', value: 0 }] })).includes('Үзүүлэлт байхгүй'), 'нийт 0 → .chart-empty («0» цагираг биш)');
assert.ok(dn.includes('stroke:var(--surface)') && !dn.includes('stroke-linecap:round'), '2px гадаргуун зах, бөөрөнхий үзүүргүй');
assert.ok(dn.includes('НИЙТ'), 'голын шошго «НИЙТ»');
/* Ring: зам нь нумтай ИЖИЛ зузаан (2026-10-23: Environment) */
assert.match(rg, /ringTrack[^>]*stroke-width="15\.6\d*"/, 'Ring-ийн зам = нумын зузаан');
assert.ok(!rg.includes('stroke-linecap'), 'Ring: шулуун үзүүр (Environment)');

/* ── ⚠️ 2026-10-09 (аудит №6): хувийн нийлбэр ЯГ 100 — Stack · Donut (тайлбар + aria) нэг арга ── */
const three = [{ key: 'a', label: 'A', value: 1 }, { key: 'b', label: 'B', value: 1 }, { key: 'c', label: 'C', value: 1 }];
const stk = renderToStaticMarkup(h(Stack, { items: three, legend: true }));
const stkPcts = [...stk.matchAll(/legendPct[^>]*>(\d+)%</g)].map((m) => Number(m[1]));
assert.deepEqual(stkPcts, [34, 33, 33], `Stack тайлбар 100% (их үлдэгдэл): ${stkPcts}`);
const dn3 = renderToStaticMarkup(h(Donut, { items: three, size: 'sm' }));
assert.match(dn3, /A 33\.4%, B 33\.3%, C 33\.3%/, 'Donut aria тойм тайлбартай ижил тоо (нийлбэр 100.0)');
const stkT = renderToStaticMarkup(h(Stack, { items: [{ key: 'a', label: 'A', value: 25 }, { key: 'b', label: 'B', value: 25 }], total: 100, legend: true }));
assert.deepEqual([...stkT.matchAll(/legendPct[^>]*>(\d+)%</g)].map((m) => m[1]), ['25', '25'], '`total` өгвөл 100 болгож сунгахгүй');

/* ── ⚠️ 2026-10-09 (аудит №6): Trend анхдагч fmt = autoNum — мянгатын таслал, хувь «26.3» хэвээр ── */
const tMoney = renderToStaticMarkup(h(Trend, { points: [{ label: '1', value: 2660000000000 }, { label: '2', value: 1500000000000 }], unit: ' ₮', alert: { value: 2000000000000 } }));
assert.ok(tMoney.includes('2,660,000,000,000 ₮'), 'мөнгөн цуваа таслалтай (урьд «2660000000000.0 ₮»)');
/* ⚠️ 2026-10-19: `data-report-chart` (тайлангийн Word графикийн JSON, дэлгэцэнд харагдахгүй) түүхий тоо агуулна — хасаж шалгана */
assert.ok(!tMoney.replace(/ data-report-chart="[^"]*"/g, '').includes('2660000000000'), 'түүхий тоо үлдэхгүй');
assert.ok(/data-report-chart="[^"]*2660000000000/.test(tMoney), 'тайлангийн графикт түүхий утга (Word форматлана)');
assert.ok(tMoney.includes('2,000,000,000,000 ₮'), 'босгын шошго ч форматлагдана');
const tPct = renderToStaticMarkup(h(Trend, { points: [{ label: '1', value: 26.3 }, { label: '2', value: 20 }], unit: '%' }));
assert.ok(tPct.includes('26.3%'), 'хувийн дуудагч «26.3%» хэвээр');

/* ── ⚠️ 2026-10-23: Environment — хоосон төлөв дүрсгүй; Stack (legend) = Composition; Meter уугуул title ── */
const em = renderToStaticMarkup(h(Empty, { label: 'Хоосон', icon: 'chart' }));
assert.ok(!em.includes('<svg') && em.includes('Хоосон'), 'Empty: дүрсгүй');
assert.ok(stk.includes('compBar'), 'Stack legend → Composition зурвас');
assert.ok(!renderToStaticMarkup(h(Stack, { items: three, legend: false })).includes('compBar'), 'Stack legend=false → 10px зам');
assert.match(m1, /title="Гүйцэтгэл · 42\.3%\nТөлөвлөгөө: 50\.0%"/, 'Meter: уугуул title + төлөвлөгөө');
/* Trend: уншилтын мөр / Y тэнхлэг байхгүй; тор бүгд тасархай (4 шугам) */
const tr4 = renderToStaticMarkup(h(Trend, { points: tp }));
assert.ok(!tr4.includes('trendHead') && !tr4.includes('trendYAxis'), 'Trend: readout ба Y тэнхлэг хасагдсан');
assert.equal((tr4.match(/class="trendGrid"/g) || []).length, 4, 'Trend: тор [.25 .5 .75 1]');

console.log('✅ ui графикууд: Meter · Bars · Series · Donut · Ring · Stack · Empty — Environment стандарт');
