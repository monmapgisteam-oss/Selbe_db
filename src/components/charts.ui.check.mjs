/**
 * `ui.tsx`-ийн графикийн бүрэлдэхүүн — нэгдсэн стандарт (2026-10-09, «бүх графикийн загварыг жигдлэх»).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/charts.ui.check.mjs
 *
 * ⚠️ Барьдаг дүрмүүд: `Meter` null → «—» + aria-valuenow-гүй (null ≠ 0), role="meter", pct() 1 орон;
 *    `Bars` display-гүй утга num(), null → дүүргэлтгүй «—»; `Series` null → баганагүй, 0 → 1.5%,
 *    items[].color; `Donut`/`Ring` хэмжээний стандарт (chartStyle), өнгөгүй зүсмэг cat(i).
 */
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { monotonePath } from '@/lib/chartStyle';
import { Meter, Bars, Series, Donut, Ring, monotonePath as uiMonotone } from '@/components/ui';

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

/* ── ui.tsx: Series — null багана зурахгүй, 0 нь хамгийн бага багана ── */
const sr = renderToStaticMarkup(h(Series, { items: [
  { key: '1', label: '1', value: 0 },
  { key: '2', label: '2', value: null },
  { key: '3', label: '3', value: 5, color: 'var(--c2)' },
] }));
assert.equal((sr.match(/height:1\.5%/g) || []).length, 1, '0 → 1.5% багана');
assert.equal((sr.match(/seriesBar/g) || []).length, 2, 'null → баганагүй');
assert.ok(sr.includes('--tone:var(--c2)'), 'items[].color хүндэтгэнэ');

/* ── ui.tsx: Donut / Ring — хэмжээний стандарт, өнгө cat(i) ── */
const dn = renderToStaticMarkup(h(Donut, { items: [{ key: 'x', label: 'X', value: 3 }, { key: 'y', label: 'Y', value: 1 }], size: 'sm' }));
assert.match(dn, /width="96"/);
assert.ok(dn.includes('var(--c1)') && dn.includes('var(--c2)'), 'өнгөгүй зүсмэг → cat(i)');
const rg = renderToStaticMarkup(h(Ring, { value: 50, size: 'md' }));
assert.match(rg, /width="120"/);
assert.match(rg, /stroke-width="12"/, 'зузаан = 10%');

/* ── 2026-10-09 (лавлах CRM загвар — өнгө хэвээр) ── */
/* Series: бүдэг тор + зүүн тэнхлэгийн тоо; багана 0..niceTop хуваарьт (5 → тэнхлэг 0..6) */
assert.ok(sr.includes('gridH') && sr.includes('axisYLbl'), 'Series: тор + тэнхлэг');
assert.ok(/height:83\.3+\d*%/.test(sr), 'Series: 5 / 6 (niceTicks-ийн дээд) ≈ 83.3%');
/* Series line: цэг анхдагчаар нуугдмал, ДЭЭД цэгт «Дээд: X» pill; null → цоорхой хэвээр */
const sl = renderToStaticMarkup(h(Series, { line: true, items: [
  { key: 'a', label: 'a', value: 3 }, { key: 'b', label: 'b', value: 68 }, { key: 'c', label: 'c', value: null }, { key: 'd', label: 'd', value: 10 },
] }));
assert.match(sl, /Дээд: 68/, 'showMax → «Дээд: 68»');
assert.ok(sl.includes('chartGlow'), 'шугам гэрэлтэлттэй (хэвлэхэд унтрах класс)');
assert.ok(sl.includes('seriesLineDot'), 'ганц цэгтэй хэсэг (d) цэгээр харагдана');
assert.ok(!renderToStaticMarkup(h(Series, { line: true, showMax: false, items: [{ key: 'a', label: 'a', value: 3 }, { key: 'b', label: 'b', value: 5 }] })).includes('Дээд'), 'showMax=false');
/* Donut: хөндий цагираган тэмдэг + ≥8% зүсмэгт дотор хувь (их үлдэгдлийн арга — 75/25) */
assert.ok(dn.includes('legendRing'), 'тайлбарын тэмдэг цагираг');
assert.ok(dn.includes('donutPctIn') && dn.includes('>75%<') && dn.includes('>25%<'), 'зурвас дотор хувь');
assert.ok(dn.includes('stroke-linecap:round'), 'бөөрөнхий үзүүр');
/* Ring: зам нь нимгэн 2px */
assert.match(rg, /ringTrack[^>]*stroke-width="2"/, 'Ring-ийн зам 2px');

console.log('✅ ui графикууд: Meter · Bars · Series · Donut · Ring — нэгдсэн стандарт + лавлах CRM загвар');
