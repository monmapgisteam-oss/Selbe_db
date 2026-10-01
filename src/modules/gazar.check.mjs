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

/* ── 5. Талбай: area_m2 ?? Талб_1 — дашбоардтай ИЖИЛ нөхөлт ── */
{
  assert.match(src, /parcelAltAreaWhere\(\)/, 'Газар: `Талб_1` нөхөлтийн асуулга алга');
  assert.match(src, /sum\(L\.fields\.areaAlt,/, 'Газар: `areaAlt`-ийн нийлбэр асуугдах ёстой');
  assert.match(src, /area:\s*Number\(lStat\.area \?\? 0\)\s*\+\s*altTotal/,
    'Газар: «Нийт талбай» нөхөлтийг агуулах ёстой (`land.ts`-ийн `areaM2`-тэй ижил)');
  /* нөхөлт төлөв ба шалтгаан бүрд нэмэгдэнэ */
  assert.match(src, /for \(const r of lAlt\)[^\n]*addStatus\(r, 0,/, 'Газар: төлөв бүрд нөхөлт');
  assert.match(src, /for \(const r of lAltReason \?\? lAlt\)[^\n]*addReason\(r, 0,/, 'Газар: шалтгаан бүрд нөхөлт');
}
console.log('✅ Газар ба дашбоард талбайг ИЖИЛ дүрмээр (area_m2 ?? Талб_1)');

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
    [/askDrop\(\)/, 'хадгалаагүй маягтыг асуухгүйгээр солих ёсгүй'],
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
  assert.match(ed, /validateParcelChanged\(before, d\)/, 'GazarEdit: `validateParcelChanged` ашиглах ёстой');
  assert.doesNotMatch(ed, /validateParcel\(d\)/, 'GazarEdit: бүтэн шалгуур хөндөөгүй төлөвөөр хадгалалтыг хаана');
  assert.match(ed, /before\.editedBy/, 'GazarEdit: «сүүлд засварласан» мөр алга');
  assert.match(ed, /tr\('Сүүлд засварласан'\)/);
}
console.log('✅ GazarEdit: хөндөөгүй төлөв хадгалалтыг хаахгүй, сүүлд засварласныг харуулна');

console.log('\ngazar.check: ok — засварын горим ба полигоны шүүлт зөрөхгүй');
