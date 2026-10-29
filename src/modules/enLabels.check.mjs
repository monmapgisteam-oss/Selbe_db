/**
 * АНГЛИ ГОРИМ — бүсийн ангилал ба материалын төлөв ОРЧУУЛАГДАНА (2026-10-22, аудит).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/modules/enLabels.check.mjs
 *
 * §1 Бүсийн ангилал: амьд `Angilal`-ын 8 түүхий (жижиг үсгийн) утга ба `ZONE_TYPES`-ийн каноник нэр бүр каталогийн
 *    facet/шүүлтийн чип (`tr(zoneType(…))`) ба анализ (`zoneTypeLabel`)-аар НЭГ англи нэртэй; анализын CSV ч.
 * §2 Эх код: каталогийн шүүлтийн чип (`Portal.ActiveFilterChip` дахин орчуулдаггүй) орчуулсан нэр авна; анализын
 *    легенд · жагсаалт · hover · дэлгэрэнгүй · FAR/BCR хүснэгт `zoneTypeLabel`-ээр (шүүлт түүхий `type`-аар хэвээр).
 * §3 Материалын төлөв: «Дууссан»/«Дуусаагүй» англиар; `MaMaterial` дэлгэцэд `statusLabel` (өгөгдөл монголоор хэвээр).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLocaleDict, setLocale, t as tr } from '@/lib/i18nCore';
import { zoneType, ZONE_TYPES } from '@/lib/services';
import { TOLOV } from '@/lib/materialNoots';
import { zoneTypeLabel } from './analysis/suit/format.ts';
import { zoneCsv } from './analysis/suit/rankUtil.ts';

await loadLocaleDict('en');
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').split('\r\n').join('\n');
const CYR = /[А-Яа-яЁёӨөҮү]/;

/* ── §1 Бүсийн ангилал ── */
{
  /* 2026-10-22-ны аудитаар амьд бүсийн давхаргын `Angilal`-ын ялгаатай утгууд (жижиг үсэг; «тохжилт» — өгөгдлийн бичиглэл) */
  const LIVE = ['газар чөлөөлөлт дутуу', 'дэд бүтэц', 'нийгмийн дэд бүтэц', 'ногоон байгууламж тохжилт',
    'одоо байгаа барилга', 'олон нийтийн бүс', 'орон сууцны бүс', 'таун хаус'];
  setLocale('en');
  for (const v of [...LIVE, ...Object.keys(ZONE_TYPES)]) {
    const facet = tr(zoneType(v));
    assert.ok(!CYR.test(facet), `каталог/чип: «${v}» → «${facet}» — англи нэргүй`);
    assert.equal(zoneTypeLabel(v), facet, `анализ ба каталог НЭГ нэр: «${v}»`);
  }
  assert.equal(zoneTypeLabel('Орон сууцны бүс'), 'Residential zone');
  assert.equal(zoneTypeLabel('таун хаус'), 'Townhouse');
  /* CSV — толгой аль хэдийн англи; ангилал ч англи (холимог биш) */
  const ind = { id: 'density', short: 'Density', unit: '', decimals: 0 };
  const row = {
    id: 'A-1', type: 'Орон сууцны бүс', urban: 50, residentPop: 1, households: 1, areaHa: 1,
    raw: { density: 1 }, rawActual: { density: 1 }, parts: { density: { value: 1, score: 50, weight: 1 } },
  };
  const line = zoneCsv([row], 'urban', ind, [ind]).split('\r\n')[1];
  assert.ok(line.includes(',A-1,Residential zone,'), line);
  setLocale('mn');
  assert.equal(zoneTypeLabel('орон сууцны бүс'), 'Орон сууцны бүс', 'монгол горимд каноник нэр');
  console.log('✅ бүсийн ангилал — амьд 8 утга + каноник нэр англиар, анализ = каталог');
}

/* ── §2 Эх код ── */
{
  const lc = src('../components/LayerCatalog.tsx');
  const fr = lc.slice(lc.indexOf('function FacetRows('));
  assert.ok(/const nameOf = \(label: string\): string => tr\(f\.canon\n/.test(fr), 'facet: нэр НЭГ газраас (`nameOf`)');
  assert.match(fr, /toggle\(\{\s*key,\s*label: name,/, 'шүүлтийн чип орчуулсан нэр авна');
  assert.ok(!/label: item\.label/.test(fr), 'чип рүү түүхий утга очихгүй');
  assert.match(fr, /<span className=\{s\.facetName\}>\{name\}<\/span>/, 'мөр ба чип ижил нэр');
  assert.match(fr, /where: groupWhere\(f\.field, item\)/, 'шүүлтийн нөхцөл түүхий утгаар хэвээр');

  const suit = src('./analysis/Suitability.tsx');
  assert.ok(suit.includes('esc(zoneTypeLabel(r.type))') && suit.includes('esc(zoneTypeLabel(row.type))'), 'hover');
  assert.ok(suit.includes('const name = zoneTypeLabel(c.type);') && /WebkitLineClamp: 2 \}\}>\{name\}<\/span>/.test(suit), 'легенд');
  assert.ok(!/\{c\.type\}<\/span>/.test(suit) && suit.includes('onClick={() => pick(c.type)}'), 'легенд: нэр орчуулагдана, шүүлт түүхий');
  assert.ok(src('./analysis/SuitDetail.tsx').includes('{zoneTypeLabel(r.type)} ·'), 'дэлгэрэнгүй');
  assert.ok(src('./analysis/suit/Ranking.tsx').includes('<i>{zoneTypeLabel(r.type)}</i>'), 'эрэмбийн жагсаалт');
  assert.ok(src('./analysis/suit/Urban.tsx').includes('<span>{zoneTypeLabel(t)}</span>'), 'FAR/BCR хүснэгт');
  console.log('✅ каталогийн чип · анализын легенд/жагсаалт/hover/дэлгэрэнгүй — орчуулсан нэр');
}

/* ── §3 Материалын төлөв ── */
{
  /* `statusLabel` нь литерал `tr('Дууссан')`/`tr('Дуусаагүй')` — TOLOV өөрчлөгдвөл энд унана */
  assert.equal(TOLOV.done, 'Дууссан');
  assert.equal(TOLOV.open, 'Дуусаагүй');
  setLocale('en');
  assert.ok(!CYR.test(tr(TOLOV.done)) && !CYR.test(tr(TOLOV.open)), 'хоёр төлөв англи нэртэй');
  setLocale('mn');
  const ma = src('./MaMaterial.tsx');
  assert.ok(ma.includes("v === TOLOV.done ? tr('Дууссан') : v === TOLOV.open ? tr('Дуусаагүй') : v"), 'statusLabel');
  assert.ok(ma.includes('{statusLabel(m.status)}') && !ma.includes('>{m.status}<'), 'дэлгэцэд орчуулна');
  assert.ok(ma.includes('m.status === TOLOV.done ? s.expired : s.valid'), 'өнгө түүхий утгаар');
  console.log('✅ материалын төлөв — англиар, өгөгдөл монголоор хэвээр');
}
