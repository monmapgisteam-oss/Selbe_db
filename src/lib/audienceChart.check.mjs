/**
 * ХҮЛЭЭН АВАГЧИЙН ТАЙЛАНГИЙН ГРАФИК — `audienceChart.ts` (цэвэр SVG, DOM-гүй, PDF-д).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/audienceChart.check.mjs
 *
 * Хамгаалж буй дүрмүүд (2026-11-05, хэрэглэгч: «загвар хог» → дахин):
 *   1. Төрөл бүр ЗӨВ SVG (515pt, фонт өвлөнө, escape); хоосон → «мэдээлэлгүй».
 *   2. Мөнгө ТЭРБУМ ₮-өөр; тэнхлэг (0 · ½ · дээд, сар); утга тэмдэг дээрээ; шошго давхцахгүй, зурагнаас гарахгүй.
 *   3. Урт баганан график `splitSpec`-ээр ≤ 24 мөрөөр хуваагдана (PDF хуудаснаас халихгүй).
 *   4. Давхарласан график 10 хүртэл ЯЛГААТАЙ дүүргэлттэй (өнгө + хээ).
 */
import assert from 'node:assert/strict';
import { chartSvg, emptySvg, fmtUnit, bn, wrapText, svgHeight, splitSpec, BARS_PER_CHART, FILLS, CHART_W } from './audienceChart.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };
const count = (s, re) => (s.match(re) ?? []).length;
/** Бүх <text> — x · anchor · утга */
const texts = (s) => [...s.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)"[^>]*?(?:text-anchor="(\w+)")?>([^<]*)<\/text>/g)]
  .map((m) => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), anchor: m[4] ?? 'start', t: m[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') }));
function validSvg(s, w = CHART_W) {
  assert.ok(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && s.trimEnd().endsWith('</svg>'), 'SVG хүрээ');
  assert.match(s, new RegExp(`^<svg[^>]*\\swidth="${w}"`), 'өргөн');
  const h = svgHeight(s);
  assert.ok(h > 0, 'өндөр');
  assert.equal(count(s, /<text\b/g), count(s, /<\/text>/g), 'text нээлт/хаалт');
  assert.equal(count(s, /<svg\b/g), 1);
  assert.ok(!/&(?!amp;|lt;|gt;|quot;)/.test(s), 'escape хийгдээгүй &');
  assert.ok(!/font-family/.test(s), 'фонт заагдсан — өвлөх ёстой');
  assert.ok(!/NaN|undefined|Infinity/.test(s), 'NaN/undefined');
  /* Шошго зурагнаас гарахгүй: x ∈ [0, w], y ∈ (0, h] */
  for (const t of texts(s)) {
    assert.ok(t.x >= 0 && t.x <= w, `шошго зүүн/баруунаас гарав: «${t.t}» x=${t.x}`);
    assert.ok(t.y > 0 && t.y <= h, `шошго дээр/доороос гарав: «${t.t}» y=${t.y}`);
    const est = t.t.length * t.size * 0.56;
    const x0 = t.anchor === 'end' ? t.x - est : t.anchor === 'middle' ? t.x - est / 2 : t.x;
    assert.ok(x0 >= -1 && x0 + est <= w + 1, `шошго тасрав: «${t.t}» [${x0.toFixed(0)}, ${(x0 + est).toFixed(0)}] / ${w}`);
  }
  return s;
}
/** Нэг y мөрөнд байгаа шошгууд давхцахгүй */
function noOverlap(s, size) {
  const rows = new Map();
  for (const t of texts(s).filter((t) => t.size === size)) {
    const est = t.t.length * size * 0.56;
    const x0 = t.anchor === 'end' ? t.x - est : t.anchor === 'middle' ? t.x - est / 2 : t.x;
    (rows.get(t.y) ?? rows.set(t.y, []).get(t.y)).push([x0, x0 + est, t.t]);
  }
  for (const [y, list] of rows) {
    list.sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < list.length; k += 1) assert.ok(list[k][0] >= list[k - 1][1] - 0.5, `давхцсан шошго y=${y}: «${list[k - 1][2]}» ↔ «${list[k][2]}»`);
  }
}

console.log('\n1. Туслах');
ok('bn · fmtUnit · wrapText · emptySvg', () => {
  assert.equal(bn(2_495_841_880_529), '2,495,841,880,529 ₮', 'бүтэн дүн — 2026-09-01 дүрэм');
  assert.equal(bn(530.87e9), '530,870,000,000 ₮');
  assert.equal(bn(876_465_164), '876,465,164 ₮');
  assert.equal(bn(1234), '1,234 ₮');
  assert.equal(bn(null), 'мэдээлэлгүй');
  assert.equal(fmtUnit(12.34, 'pct'), '12.3%');
  assert.equal(fmtUnit(2_495_841_880_529, 'mnt'), '2,495,841,880,529 ₮');
  assert.equal(fmtUnit(1311, 'num'), '1,311');
  assert.equal(fmtUnit(null, 'num'), 'мэдээлэлгүй');
  const lines = wrapText('Орон сууцны барилга угсралт хуваариас 9.6 нэгж хувиар хоцорч байна', 120);
  assert.ok(lines.length >= 3 && lines.join(' ') === 'Орон сууцны барилга угсралт хуваариас 9.6 нэгж хувиар хоцорч байна', JSON.stringify(lines));
  assert.deepEqual(wrapText('', 100), ['']);
  const e = validSvg(emptySvg(CHART_W));
  assert.ok(e.includes('>мэдээлэлгүй</text>') && e.includes('stroke-dasharray'));
});

console.log('\n2. Төрөл бүр');
ok('kpi — 5 карт нэг мөрөнд; шошго, утга, дэд мөр, өөрчлөлт; хоосон → орлуулагч', () => {
  const items = [
    { label: 'Төслийн нийт явц', value: '31.7%', sub: 'төлөвлөгөө 39.0%' },
    { label: 'Барилгын явц', value: '26.7%', sub: 'хэмжилт 2026-10-28', trend: '+5.4 н.х' },
    { label: 'Газар чөлөөлөлт', value: '91.4%', sub: '179 нэгж талбар үлдсэн' },
    { label: 'Олголт', value: '26.0%', sub: 'гэрээлсэн дүнгийн', trend: '+30,870,000,000 ₮' },
    { label: 'Хуваарийн төлөв', value: 'хамрах хүрээ 59%', sub: 'төлөвлөгөө 35.5%' },
  ];
  const s = validSvg(chartSvg({ kind: 'kpi', items }));
  for (const t of ['Төслийн нийт явц', '31.7%', 'төлөвлөгөө 39.0%', '26.7%', '+5.4 н.х', '91.4%', '26.0%', 'хамрах хүрээ 59%']) assert.ok(s.includes(t), t);
  assert.equal(count(s, /<rect[^>]*stroke=/g), 5, 'таван карт');
  assert.ok(svgHeight(s) <= 70, 'нэг мөр — намхан');
  assert.ok(chartSvg({ kind: 'kpi', items: [] }).includes('мэдээлэлгүй'));
  assert.equal(count(validSvg(chartSvg({ kind: 'kpi', items: items.slice(0, 3) })), /<rect[^>]*stroke=/g), 3);
});
ok('bars — тэнхлэг, утга бүр, төлөвлөгөөний тэмдэг, null → мэдээлэлгүй, хэтэрсэн утга багтана, мөнгө тэрбумаар', () => {
  const s = validSvg(chartSvg({ kind: 'bars', unit: 'pct', max: 100, items: [
    { label: 'Багц 1', value: 32.9, mark: 36, text: '32.9% · хоцрогдол 3.1 н.х', hot: true },
    { label: 'Багц 2', value: 18.4 },
    { label: 'Багц 3', value: null },
    { label: 'Багц 9', value: 140, text: '140.0%' },
  ] }));
  assert.ok(s.includes('32.9% · хоцрогдол 3.1 н.х') && s.includes('>18.4%</text>') && s.includes('>мэдээлэлгүй</text>') && s.includes('>140.0%</text>'), s);
  assert.ok(s.includes('>0%</text>') && s.includes('>70%</text>') && s.includes('>140%</text>'), 'тэнхлэгийн шошго 0 · ½ · дээд');
  assert.ok(s.includes('төлөвлөгөө (хуваарь)'), 'төлөвлөгөөний тайлбар');
  assert.equal(count(s, /<line[^>]*stroke-width="1.6"/g), 2, 'нэг тэмдэг + тайлбарын тэмдэг');
  const widths = [...s.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="8"/g)].map((m) => Number(m[1]));
  const track = Math.max(...widths);
  assert.ok(widths.every((w) => w <= track + 1e-6), '140% замаас хэтрэхгүй');
  assert.ok(chartSvg({ kind: 'bars', unit: 'num', items: [] }).includes('мэдээлэлгүй'));
  assert.ok(chartSvg({ kind: 'bars', unit: 'num', items: [{ label: 'a', value: null }] }).includes('stroke-dasharray'), 'бүгд null → орлуулагч');
  const m = validSvg(chartSvg({ kind: 'bars', unit: 'mnt', items: [{ label: 'Гэрээлсэн', value: 2.1e12 }, { label: 'Олгосон', value: 530.87e9 }] }));
  assert.ok(m.includes('2,100,000,000,000 ₮') && m.includes('530,870,000,000 ₮') && m.includes('>2,100,000,000,000</text>'), 'бүтэн дүн, тэнхлэг ч бүтэн');
});
ok('bars — урт нэр тасарна, 40 мөр `splitSpec`-ээр 2 график (24 + 16) болно', () => {
  const items = Array.from({ length: 40 }, (_, k) => ({ label: `Багц ${k + 1} — маш урт нэртэй дэд бүтцийн ажлын багц ${k}`, value: k * 2 }));
  const parts = splitSpec({ kind: 'bars', unit: 'pct', max: 100, items });
  assert.equal(parts.length, 2);
  assert.equal(parts[0].items.length, BARS_PER_CHART);
  assert.equal(parts[1].items.length, 16);
  for (const p of parts) assert.ok(svgHeight(validSvg(chartSvg(p))) < 420, 'хуудасны хагасаас намхан');
  assert.equal(splitSpec({ kind: 'kpi', items: [] }).length, 1, 'бусад төрөл хуваагдахгүй');
  assert.ok(validSvg(chartSvg(parts[0])).includes('…'), 'урт нэр тасарсан');
});
ok('line — тэнхлэг бүтэн дүнгээр, сарын шошго, утга эхний/дээд/сүүлийн цэгт давхцахгүй, тасархай лавлах шугам, сарын багана', () => {
  const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const cum = [0, 179.5e9, 263.4e9, 281.2e9, 320.7e9, 444.6e9, 500.2e9, 500.2e9];
  const s = validSvg(chartSvg({
    kind: 'line', months, unit: 'mnt',
    series: [{ label: 'Хуримтлагдсан олголт', values: cum }, { label: 'Гэрээлсэн нийт дүн', values: months.map(() => 2041.9e9), dashed: true }],
    bars: { label: 'Сарын олголт', values: [0, 179.5e9, 83.9e9, 17.8e9, 39.5e9, 123.9e9, 55.6e9, 0], unit: 'mnt' },
  }));
  assert.equal(count(s, /<polyline/g), 2);
  assert.equal(count(s, /<polyline[^>]*stroke-dasharray/g), 1, 'лавлах шугам тасархай');
  assert.ok(s.includes('>0</text>') && s.includes('>2,500,000,000,000</text>'), 'зүүн тэнхлэг бүтэн дүн, дээд утга гэрээлсэн дүнг багтаана');
  assert.ok(s.includes('>500,200,000,000 ₮</text>'), 'сүүлийн (дээд) утга');
  assert.ok(s.includes('>2026-03</text>') && s.includes('>2026-10</text>'), 'сарын шошго');
  for (const l of ['Хуримтлагдсан олголт', 'Гэрээлсэн нийт дүн', 'Сарын олголт']) assert.ok(s.includes(`>${l}</text>`), l);
  noOverlap(s, 7.5);
  noOverlap(s, 7);
  const p = validSvg(chartSvg({ kind: 'line', months: months.slice(0, 5), unit: 'pct', series: [{ label: 'Төлөвлөгөө', values: [10, 16, 22, 28, 34.2], dashed: true }, { label: 'Бодит', values: [8, 12, null, 21.9, 24.6] }] }));
  assert.equal(count(p, /<polyline/g), 3, 'төлөвлөгөө 1 + бодит 2 (null цоорхой)');
  assert.ok(p.includes('>34.2%</text>') && p.includes('>24.6%</text>') && p.includes('>100%</text>'), 'хувийн тэнхлэг 0–100');
  assert.ok(chartSvg({ kind: 'line', months: [], series: [], unit: 'pct' }).includes('мэдээлэлгүй'));
  assert.ok(chartSvg({ kind: 'line', months, series: [{ label: 'x', values: months.map(() => null) }], unit: 'pct' }).includes('мэдээлэлгүй'), 'бүгд null');
  const many = validSvg(chartSvg({ kind: 'line', months: Array.from({ length: 60 }, (_, k) => `2026-${String(k + 1).padStart(2, '0')}`), series: [{ label: 'Хүн', values: Array.from({ length: 60 }, (_, k) => 1000 + k) }], unit: 'num' }));
  assert.ok(count(many, /<text/g) < 30, 'сарын шошго сийрэгжсэн');
  noOverlap(many, 7);
});
ok('stacked — 9 хэсэг бүгд ЯЛГААТАЙ дүүргэлттэй (өнгө + хээ), хувь ба утга, 0 орохгүй, хоосон → орлуулагч', () => {
  const items = ['Бүрэн чөлөөлсөн', 'Зөвшилцөх', 'Татгалзсан', 'Маргаантай', 'Үлдэх саналтай', 'АТД', 'Шүүх', 'Хэлэлцээр', 'Бусад'].map((label, k) => ({ label, value: 400 - k * 40 }));
  const s = validSvg(chartSvg({ kind: 'stacked', unit: 'num', items: [...items, { label: 'Хоосон', value: 0 }] }));
  const fills = [...s.matchAll(/<rect x="[\d.]+" y="0" width="[\d.]+" height="20" fill="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(fills.length, 9);
  assert.equal(new Set(fills).size, 9, 'дүүргэлт давтагдав');
  assert.ok(fills.some((f) => f.startsWith('url(#')) && s.includes('<pattern'), 'хээ');
  assert.ok(s.includes('400 · ') && !s.includes('Хоосон'));
  assert.equal(FILLS.length, 10);
  assert.ok(chartSvg({ kind: 'stacked', unit: 'num', items: [] }).includes('мэдээлэлгүй'));
});
ok('list — мөр таслагдана, өнгөт зураас; хоосон → «алга»; escape', () => {
  const s = validSvg(chartSvg({ kind: 'list', items: [
    { text: 'Багц 2 хуваариас 12.0 нэгж хувиар хоцорсон (төлөвлөгөө 30.4%, бодит 18.4%) — хүн хүч & техник <нэмэх> "шийдэх".', tone: 'bad' },
    { text: 'Богино.', tone: 'info' },
  ] }));
  assert.ok(count(s, /<text/g) >= 2, 'мөр');
  assert.ok(s.includes('&amp;') && s.includes('&lt;нэмэх&gt;') && s.includes('&quot;'), 'escape');
  assert.ok(chartSvg({ kind: 'list', items: [] }).includes('Анхаарах асуудал алга.'));
});

console.log(`\n✅ audienceChart: ${n} шалгуур давлаа`);
