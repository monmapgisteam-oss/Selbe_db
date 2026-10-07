/**
 * Газрын зургийн ИДЭВХТЭЙ ШҮҮЛТИЙН ЧИП (✕) — `MapTools.tsx` (2026-10-01).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/mapFilterChip.ui.check.mjs
 *
 * Хамгаалж буй алдаа: модуль `setHighlight`-ийг шууд дуудсан шүүлт зөвхөн тэр
 * модулийн дотор цуцлагддаг тул самбар солигдох/хаагдахад зураг бүдэг хэвээр
 * «гацдаг» байв. Одоо зурвасын дээд мөрөнд ✕-тэй чип ҮРГЭЛЖ гарна.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { activeFilterLabel, ActiveFilterChip, MapTools } from '@/components/MapTools';

/* ── Бичиглэл: самбарын шүүлт > тодруулга > байхгүй ── */
assert.equal(activeFilterLabel(null, { where: null }), null, 'шүүлтгүй үед чип гарах ёсгүй');
assert.equal(activeFilterLabel({ group: 'Барилга', label: 'Эхэлсэн' }, { where: "X='1'" }), 'Барилга: Эхэлсэн');
assert.equal(activeFilterLabel({ group: '', label: 'Эхэлсэн' }, { where: null }), 'Эхэлсэн');
assert.equal(activeFilterLabel(null, { where: "ZONE_ID='A'" }), 'Газрын зургийн шүүлт', 'шууд setHighlight → ерөнхий чип');
assert.equal(activeFilterLabel(null, { where: null, geometry: { rings: [] } }), 'Газрын зургийн шүүлт', 'орон зайн шүүлт ч мөн');
console.log('✅ activeFilterLabel: самбарын шүүлт · шууд тодруулга · геометр · шүүлтгүй');

/* ── Шүүлтгүй үед юу ч зурахгүй; MapTools хэвийн зурагдана ── */
assert.equal(renderToStaticMarkup(h(ActiveFilterChip)), '');
const html = renderToStaticMarkup(h(MapTools, { dim: '2d', setDim: () => {} }));
/* ⚠️ 2026-10-07: зурвас АНХДАГЧ ХУРААГДСАН (хэрэглэгчийн хүсэлт) — «харуулах» бариул л зурагдана */
assert.ok(!html.includes('mapToolsBar'), 'зурвас анхдагчаар хураагдсан байх ёстой');
assert.ok(html.includes('Товчнуудыг харуулах'), 'хураасан зурвасын бариул зурагдсангүй');
assert.ok(!html.includes('mapFilterChip'), 'шүүлтгүй үед чип гарав');
console.log('✅ шүүлтгүй: чип алга · зурвас анхдагч хураагдсан, бариул бий');

/* ── Холболт: цуцлах нь хоёр эх сурвалжийг хоёуланг нь цэвэрлэнэ ── */
const src = readFileSync(new URL('./MapTools.tsx', import.meta.url), 'utf8');
assert.match(src, /if \(filter\.active\) filter\.clear\(\);/);
assert.match(src, /if \(highlight\.where \|\| highlight\.geometry\) setHighlight\(null\);/);
assert.match(src, /<ActiveFilterChip \/>/, 'чип зурвасанд орсонгүй');
assert.match(src, /aria-label=\{tr\('Шүүлтийг цуцлах'\)\}/);
console.log('✅ ✕ → filter.clear() + setHighlight(null) · зурвасын дээд мөрөнд');
