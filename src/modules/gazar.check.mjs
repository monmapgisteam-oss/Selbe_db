/**
 * «ГАЗАР ЧӨЛӨӨЛӨЛТ» — «Талбар засах» горим ба полигон (AOI)-ын ГЭРЭЭ.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/gazar.check.mjs
 *
 * ⚠️ ЯАГААД (2026-09-30). «Талбар засах» горим сэргээгдэхдээ `enterEdit`-ийн
 * тайлбарт «AOI-г ч `clear`-ээр хаяна» гэж бичигдсэн боловч код нь зөвхөн
 * `setHighlight(null)` дууддаг байв:
 *   · полигон зурж тооцоолсны дараа горимд ороод гарахад самбарууд
 *     «Сонгосон талбай · полигоноор шүүсэн» тоо харуулж байхад зураг БҮХ
 *     талбайг тодоор харуулна (бүдгэрүүлэлт алга, `aoi` хэвээр);
 *   · засварын горимд зурагт үлдсэн полигон дотор товшиход SketchViewModel
 *     полигоныг засах горимд оруулж, чирэлт нь AOI-г чимээгүй өөрчилнө;
 *   · «Полигон зурах» товч засварын горимд идэвхтэй тул зурах цэг бүр
 *     нэгж талбарын маягт нээнэ.
 *
 * `Gazar.tsx` нь React + ArcGIS шаарддаг тул ажиллуулж шалгах боломжгүй —
 * `viewEdit.check.mjs`-ийн аргаар ЭХ КОДЫГ (тайлбаргүйгээр) тулгана.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Тайлбарыг арилгана — `⚠️` тайлбарт бичигдсэн код хэлбэрийн текст ХУДАЛ таарц өгдөг */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const src = strip(fs.readFileSync('src/modules/Gazar.tsx', 'utf8'));

/* ── 1. Засварын горимд ОРОХОД AOI бүрэн хаягдана ── */
{
  const m = /const enterEdit = useCallback\(\(\) => \{([\s\S]*?)\}, \[/.exec(src);
  assert.ok(m, '`enterEdit` олдсонгүй');
  const body = m[1];
  for (const [re, why] of [
    [/setAoi\(null\)/, '`aoi` state хаягдах ёстой — эс бөгөөс самбарын тоо полигоноор шүүгдсэн хэвээр'],
    [/aoiGeomRef\.current\s*=\s*null/, 'хоцорсон геометр `pickFlt`-д дахин орох ёсгүй'],
    [/keepAoiRef\.current\s*=\s*false/, '`clearToken`-ийн `onSketch(null)` AOI-г хадгалах ёсгүй'],
    [/setClearToken\(/, 'зурагт үлдсэн полигон (SketchViewModel) арилах ёстой'],
    [/setDrawing\(false\)/, 'зурж буй ноорог горим унтрах ёстой'],
    [/setEditMode\(true\)/, 'горим асах ёстой'],
  ]) {
    assert.match(body, re, `Газар/enterEdit: ${why}`);
  }
}
console.log('✅ «Талбар засах» руу ороход полигон (AOI) бүрэн хаягдана');

/* ── 2. «Полигон зурах» товч засварын горимд ИДЭВХГҮЙ ── */
{
  const m = /icon="polygon"[\s\S]*?disabled=\{([^}]*)\}/.exec(src);
  assert.ok(m, 'Полигон зурах товч олдсонгүй');
  assert.match(m[1], /editMode/, 'Газар: засварын горимд полигон зурах товч идэвхгүй байх ёстой');
  /* 2D-ийн хязгаар хэвээр */
  assert.match(m[1], /dim\s*!==\s*'2d'/, 'Газар: полигон зөвхөн 2D-д зурагдана');
}
console.log('✅ Засварын горимд полигон зурахгүй');

/* ── 3. «Талбар засах» товч зурж байхад идэвхгүй хэвээр (эсрэг чиглэл) ── */
{
  const m = /icon="pen"[\s\S]*?disabled=\{([^}]*)\}/.exec(src);
  assert.ok(m, '«Талбар засах» товч олдсонгүй');
  assert.match(m[1], /drawing/, 'Газар: полигон зурж байхад засварын горимд орохгүй');
}
console.log('✅ Полигон зурж байхад засварын горимд орохгүй');

/* ══════════════ 2026-10-01 (хэрэглэгч: бүгдийг зас) ══════════════ */

/* ── 4. «Бүрэн чөлөөлсөн»-ийн бүх бичиглэл — дашбоардтай (`land.ts`) НЭГ функцээр ── */
{
  assert.match(src, /import \{[^}]*\bstatusKey\b[^}]*\} from '@\/lib\/land'/,
    'Газар: төлөвийн түлхүүрийг `land.statusKey`-ээс авах ёстой (дашбоардтай нэг дүрэм)');
  assert.match(src, /statusKey\(r\[L\.fields\.status\]\)/, 'Газар: `smap`-ийн түлхүүр `statusKey`-ээр');
  assert.doesNotMatch(src, /let k = text\(r\[L\.fields\.status\]\)\.trim\(\)/,
    'Газар: хуучин trim-only түлхүүр буцаж ирэв — «Бүрэн чөлөөлсөн.» чөлөөлсөнд тоологдохгүй');
  /* SQL нь зөвхөн ЯГ «Бүрэн чөлөөлсөн»-ийг хасдаг тул шалтгаанд хувилбарууд нь хасагдах ёстой */
  assert.match(src, /isClearedStatus\(r\[L\.fields\.progress\]\)/,
    'Газар: шалтгаанаас «Бүрэн чөлөөлсөн»-ийн хувилбарыг хасах ёстой');
}
console.log('✅ «Бүрэн чөлөөлсөн»-ийн бичиглэлүүд дашбоардтай ижил бүлэглэгдэнэ');

/* ── 5. Талбай: дашбоардтай ИЖИЛ дүрэм ──
   ⚠️ 2026-10-22 (аудит): серверийн `SUM(area_m2)` + `Талб_1` нөхөлтийн асуулга → МӨРӨӨР (`land.loadParcelAreaRows` +
   `parcelGroupRows`): `area_m2 = 0` → полигоны талбай, хуваагдсан нэгж талбар нэг удаа, `Талб_1` нөхөлт багтсан. `land.ts`
   ЯГ тэр хоёр функцийг хэрэглэх ёстой — эс бөгөөс «Нийт талбай» хоёр газар зөрнө. */
{
  assert.match(src, /loadParcelAreaRows\('1=1', area\)/, 'Газар: нэгж талбарын мөрүүд (AOI-тай) `land.loadParcelAreaRows`-оор');
  assert.match(src, /const lStatus = parcelGroupRows\(lRows\)/, 'Газар: төлөв бүрийн тоо/талбай `parcelGroupRows`-оор');
  const landSrc = strip(fs.readFileSync('src/lib/land.ts', 'utf8'));
  assert.match(landSrc, /loadParcelAreaRows\(\)\.then\(\(rows\) => buildLandStatus\(parcelGroupRows\(rows\), \[\]\)\)/,
    'land.ts: дашбоардын эх ИЖИЛ функцээр');
  assert.match(src, /area:\s*Number\(lStat\.area \?\? 0\)\s*\+\s*altTotal/,
    'Газар: «Нийт талбай» нөхөлтийг агуулах ёстой (`land.ts`-ийн `areaM2`-тэй ижил)');
  /* нөхөлт төлөв ба шалтгаан бүрд нэмэгдэнэ */
  assert.match(src, /for \(const r of lAlt\)[^\n]*addStatus\(r, 0,/, 'Газар: төлөв бүрд нөхөлт');
  assert.match(src, /for \(const r of lAltReason \?\? lAlt\)[^\n]*addReason\(r, 0,/, 'Газар: шалтгаан бүрд нөхөлт');
}
console.log('✅ Газар ба дашбоард талбайг ИЖИЛ дүрмээр (мөрөөр: area_m2 > 0 ?? Талб_1 ?? полигон, хуваагдсан нэг удаа)');

/* ── 6. Хадгалсны мэдэгдэл нь НЭГЖ ТАЛБАР тоолно ── */
{
  assert.match(src, /tr\('\{0\} нэгж талбар хадгалагдлаа'/, 'Газар: мэдэгдэл нэгж талбараар');
  assert.doesNotMatch(src, /tr\('\{0\} талбар хадгалагдлаа'/,
    'Газар: «N талбар хадгалагдлаа» (баганын тоо) мэдэгдэл буцаж ирэв');
}
console.log('✅ «N нэгж талбар хадгалагдлаа»');

/* ── 7. Кадастрын дугаараар хайх ── */
{
  assert.match(src, /findParcelsByNo\(/, 'Газар: дугаараар хайх зам алга');
  const m = /const openParcel = useCallback\(\(oid: number\) => \{([\s\S]*?)\}, \[/.exec(src);
  assert.ok(m, '`openParcel` олдсонгүй');
  for (const [re, why] of [
    /* ⚠️ 2026-10-09 (аудит №6): `askDrop(run)` callback хэлбэр — самбарын асуулт (`window.confirm` хаагдсан хөтчид гацдаг байв) */
    [/askDrop\(\(\) => \{/, 'хадгалаагүй маягтыг асуухгүйгээр солих ёсгүй'],
    [/setEditOid\(oid\)/, 'маягт нээгдэх ёстой'],
    [/setHighlight\(parcelWhere\(oid\)/, 'талбар тодрох ёстой'],
    [/zoomToWhere\(PARCEL_LAYER_ID, parcelWhere\(oid\)/, 'зураг тэр талбар руу очих ёстой'],
  ]) assert.match(m[1], re, `Газар/openParcel: ${why}`);
  /* олон таарвал жагсааж сонгуулна — эхнийхийг чимээгүй нээхгүй */
  assert.match(src, /list\.length === 1\) openParcel\(list\[0\]\.oid\)/);
  assert.match(src, /setHits\(list\)/, 'Газар: олон үр дүнг жагсаах ёстой');
}
console.log('✅ Кадастрын дугаараар хайж, олдсон талбарыг нээнэ');

/* ── 8. GazarEdit — зөвхөн өөрчилсөн төлөвийг шалгана · сүүлд засварласан ── */
{
  const ed = strip(fs.readFileSync('src/modules/GazarEdit.tsx', 'utf8'));
  /* ⚠️ 2026-10-05: 3 дахь аргумент `lens` (текст талбарын дээд урт) нэмэгдсэн */
  assert.match(ed, /validateParcelChanged\(before, d(, lens)?\)/, 'GazarEdit: `validateParcelChanged` ашиглах ёстой');
  assert.doesNotMatch(ed, /validateParcel\(d\)/, 'GazarEdit: бүтэн шалгуур хөндөөгүй төлөвөөр хадгалалтыг хаана');
  assert.match(ed, /before\.editedBy/, 'GazarEdit: «сүүлд засварласан» мөр алга');
  assert.match(ed, /tr\('Сүүлд засварласан'\)/);
}
console.log('✅ GazarEdit: хөндөөгүй төлөв хадгалалтыг хаахгүй, сүүлд засварласныг харуулна');

/* ── 2026-10-09: «Тодорхойгүй» баганын WHERE — «—» ба зөвхөн зайтай түүхий утгууд орно ── */
{
  const { statusRawsWhere, statusKey } = await import('../lib/land.ts');
  assert.equal(statusKey('—'), '', '«—» нь «Тодорхойгүй» бүлэгт');
  assert.equal(statusKey('   '), '', 'зөвхөн зай нь «Тодорхойгүй» бүлэгт');
  const w = statusRawsWhere('F', new Set(['—', '   ']), true, 'Тодорхойгүй');
  assert.equal(w, "(F IS NULL OR F = '' OR F = N'—' OR F = N'   ')");
  assert.equal(statusRawsWhere('F', new Set(), true, 'Тодорхойгүй'), "(F IS NULL OR F = '')");
  assert.equal(statusRawsWhere('F', new Set(['a ', 'a']), false, 'a'), "(F = N'a ' OR F = N'a')");
  assert.equal(statusRawsWhere('F', new Set(), false, 'a'), "F = N'a'");
  assert.match(src, /statusRawsWhere\(L\.fields\.status, s\.raws, value === 'Тодорхойгүй', value\)/, 'Gazar нь туслахыг хэрэглэнэ');
}
console.log('✅ Тодорхойгүй баганын WHERE: NULL · хоосон · «—» · зай');

/* ⚠️ 2026-10-21 (аудит): `toItems` харагдац `query.Group.stats`-аас — хэмжилтгүй бүлэг «—», 0 биш */
assert.match(src, /display: grp\.stats\[valueKey\] == null \? '—' : `\$\{num\(grp\.stats\[valueKey\]\)\} \$\{unit\}`/, 'toItems харагдац stats-аас биш');
console.log('✅ toItems: хэмжилтгүй бүлэг «—»');

/* ── ⚠️ 2026-10-21 (аудит): хоцорсон хайлтын хариу засах маягтыг нээхгүй ── */
{
  assert.match(src, /const findSeq = useRef\(0\);/, '`findSeq` тоолуур алга');
  const m = /const findParcel = useCallback\(async \(\) => \{([\s\S]*?)\}, \[findNo, openParcel\]\);/.exec(src);
  assert.ok(m, '`findParcel` олдсонгүй');
  const body = m[1];
  assert.match(body, /const seq = \+\+findSeq\.current;/, 'хайлт бүр шинэ дугаар авах ёстой');
  assert.match(body, /await findParcelsByNo\(no\);\s*if \(seq !== findSeq\.current\) return;/, 'хариу ирмэгц дугаар тулгах ёстой');
  assert.match(body, /if \(seq === findSeq\.current\) setFinding\(false\);/, 'хуучин хайлт шинийн `finding`-ийг тэглэх ёсгүй');
  const ex = /const exitEdit = useCallback\(\(\) => \{([\s\S]*?)\}, \[setHighlight, askDrop\]\);/.exec(src);
  assert.ok(ex, '`exitEdit` олдсонгүй');
  assert.match(ex[1], /findSeq\.current\+\+;\s*setFinding\(false\);/, '«Хаах» нислэгт яваа хайлтыг хүчингүй болгох ёстой');
  assert.match(src, /\{editMode && editOid != null && \(\s*<GazarEdit/, 'GazarEdit зөвхөн `editMode`-д зурагдах ёстой');
}
console.log('✅ Хоцорсон хайлт: `findSeq` · GazarEdit зөвхөн editMode-д');

console.log('\ngazar.check: ok — засварын горим ба полигоны шүүлт зөрөхгүй');
