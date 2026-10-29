/**
 * «ЕРӨНХИЙ ДАШБОАРД» — давхаргын сэргээх цэг ба «Багц 74»-ийн ажлын унтраалт (2026-10-21, аудит).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/modules/generalDashLayers.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. `pickReason`: чартын хөндлөн сонголт (`xsPick`) идэвхтэй байхад шалтгаан сонгоход
 *      `beforeReason = visible` (= сонголтын давхаргууд) гэж авч, `beforeXs`-ийг тэглэдэг тул шалтгааныг
 *      цуцлахад хэрэглэгчийн ӨӨРИЙН асаасан давхаргууд алдагдаж, чартын сонголтынх сэргэдэг байв.
 *      → `beforeReason = beforeXs ?? visible`.
 *   2. `PkgWorkList`: ажлыг унтраахад `w.ids` БҮГДИЙГ хасдаг тул хэрэглэгчийн өмнө нь асаасан, эсвэл ӨӨР
 *      идэвхтэй ажилд хамаарах (багц дундаа хуваалцдаг) давхарга хамт унтардаг байв.
 *      → асаахад НЭМЭГДСЭН давхаргыг бүртгэж (`addedRef`), унтраахад зөвхөн тэднийг, бусад идэвхтэй ажлынхыг
 *        үлдээж хасна.
 *   3. 2026-10-22 (аудит): «бусад идэвхтэй ажил»-ыг ХАРАГДАЖ БУЙ (`visible`) давхаргаас боддог байсан тул нэг багцын
 *      ИЖИЛ давхаргатай (`PKG_BY_BAGTS[key]` нэг) хоёр ажлыг хэзээ ч унтрааж чаддаггүй байв.
 *      → «бусад» = хэрэглэгч ИЛ асаасан (`addedRef`-д бүртгэлтэй) ажил.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pkgWorkAdded, pkgWorkDrop, pkgWorkOn } from './generalDashLayers.ts';

const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');
const src = strip(readFileSync(new URL('./GeneralDash.tsx', import.meta.url), 'utf8'));

/* 1. Шалтгааны сэргээх цэг — хөндлөн сонголтын ӨМНӨХ давхаргууд */
{
  const line = 'if (beforeReason.current == null) beforeReason.current = beforeXs.current ?? visible;';
  const i = src.indexOf(line);
  assert.ok(i > 0, '`beforeReason` нь `beforeXs ?? visible`-ээс авах ёстой');
  const j = src.indexOf('beforeXs.current = null;', i);
  assert.ok(j > i, '`beforeXs` нь сэргээх цэгийг авсны ДАРАА тэглэгдэх ёстой');
  assert.ok(!src.includes('if (beforeReason.current == null) beforeReason.current = visible;'), 'хуучин `= visible` зам үлдсэн');
}
console.log('✅ pickReason: beforeReason = beforeXs ?? visible');

/* 2. Багцын ажлын унтраалт — `PkgWorkList` нь `generalDashLayers.ts`-ийн функцүүдийг дуудна (дотоод хуулбаргүй) */
{
  assert.match(src, /import \{ pkgWorkAdded, pkgWorkDrop, pkgWorkOn \} from '@\/modules\/generalDashLayers';/, '`generalDashLayers` импорт алга');
  assert.match(src, /const addedRef = useRef\(new Map<CfRow\['oid'\], string\[\]>\(\)\);/, '`addedRef` бүртгэл алга');
  assert.match(src, /addedRef\.current\.set\(w\.oid, pkgWorkAdded\(w, visible\)\);/, 'асаахад НЭМЭГДСЭН давхаргыг бүртгэх ёстой');
  assert.match(src, /const drop = pkgWorkDrop\(works, w, addedRef\.current\);/, 'унтраахад `pkgWorkDrop` (ил асаасан бусад ажлынхыг үлдээнэ)');
  assert.match(src, /const isOn = pkgWorkOn\(w, visible\);/, 'мөрийн төлөв `pkgWorkOn`');
  assert.match(src, /works\.filter\(\(w\) => pkgWorkOn\(w, visible\)\)\.length/, '«N/74» тоолуур `pkgWorkOn`');
  assert.doesNotMatch(src, /setVisible\(\(v\) => v\.filter\(\(id\) => !w\.ids\.includes\(id\)\)\)/, 'хуучин «бүгдийг хас» зам үлдсэн');
  assert.doesNotMatch(src, /const others = new Set\(works/, 'дотоод «бусад» хуулбар (харагдаж буйгаас) үлдсэн');
}

/** `PkgWorkList.onClick`-ийн дараалал — React-гүй, ЗӨВХӨН бүтээгдэхүүний функцээр (холболтыг §2 тулгасан) */
function sim(works, visible0 = []) {
  const s = { visible: [...visible0], added: new Map() };
  s.click = (oid) => {
    const w = works.find((o) => o.oid === oid);
    if (pkgWorkOn(w, s.visible)) {
      const drop = pkgWorkDrop(works, w, s.added);
      s.added.delete(w.oid);
      s.visible = s.visible.filter((id) => !drop.includes(id));
    } else {
      s.added.set(w.oid, pkgWorkAdded(w, s.visible));
      s.visible = [...new Set([...s.visible, ...w.ids])];
    }
    return s;
  };
  s.on = (oid) => pkgWorkOn(works.find((o) => o.oid === oid), s.visible);
  return s;
}
{
  const works = [
    { oid: 1, ids: ['b1', 'shared'] },
    { oid: 2, ids: ['b2', 'shared'] },
  ];
  /* Хэрэглэгч `shared`-ийг өөрөө асаасан; ажил 1-ийг асаахад зөвхөн `b1` нэмэгдэнэ */
  assert.deepEqual(pkgWorkAdded(works[0], ['zone', 'shared']), ['b1'], 'асаахад зөвхөн харагдаагүйг бүртгэнэ');
  assert.deepEqual(pkgWorkDrop(works, works[0], new Map([[1, ['b1']]])), ['b1'], 'хэрэглэгчийн асаасан `shared` үлдэх ёстой');
  /* Ажил 2 ч ИЛ асаалттай (b2 нэмсэн) — ажил 1-ийг унтраахад `shared` ажил 2-т хэрэгтэй тул үлдэнэ */
  assert.deepEqual(pkgWorkDrop(works, works[0], new Map([[1, ['b1', 'shared']], [2, ['b2']]])), ['b1']);
  /* Бүртгэлгүй (анхнаасаа асаалттай) ажил 1 — ИЛ асаасан ажил 2-ынхыг үлдээнэ */
  assert.deepEqual(pkgWorkDrop(works, works[0], new Map([[2, ['b2']]])), ['b1']);
  assert.deepEqual(pkgWorkDrop(works, works[0], new Map()), ['b1', 'shared'], 'ил асаасан өөр ажил байхгүй бол бүгд унтарна');
  assert.deepEqual(pkgWorkDrop(works, works[0], new Map([[1, ['b1', 'shared']]])), ['b1', 'shared']);
  /* дараалал: 1 асаах → 2 асаах → 1 унтраах (shared үлдэнэ) → 2 унтраах → бүгд унтарсан */
  const s = sim(works).click(1).click(2);
  assert.ok(s.on(1) && s.on(2));
  s.click(1);
  assert.ok(!s.on(1) && s.on(2), '1 унтарч, 2 асаалттай хэвээр (shared үлдсэн)');
  s.click(2);
  assert.deepEqual(s.visible.filter((id) => id !== 'shared'), [], '2-ыг унтраахад өөрийн нэмсэн b2 хасагдана');
}
console.log('✅ PkgWorkList: унтраахад зөвхөн нэмсэн · ил асаасан бусад ажлын давхарга үлдэнэ');

/* 3. 2026-10-22 (аудит): ИЖИЛ давхаргатай ажлууд (нэг багц → `PKG_BY_BAGTS[key]` нэг жагсаалт) — урьд ХЭЗЭЭ Ч унтардаггүй байв */
{
  const works = [
    { oid: 'A', ids: ['L1', 'L2'] },
    { oid: 'B', ids: ['L1', 'L2'] },
  ];
  /* A асаахад B ч асаалттай харагдана; A-г унтраахад ХОЁУЛАА унтарна */
  const s = sim(works).click('A');
  assert.ok(s.on('A') && s.on('B'), 'ижил давхарга — хоёулаа асаалттай харагдана');
  assert.deepEqual(pkgWorkDrop(works, works[0], s.added), ['L1', 'L2'], 'A-г унтраахад бүх давхарга хасагдана (B бүртгэлгүй)');
  s.click('A');
  assert.deepEqual(s.visible, [], 'A унтарсан — урьд B «асаалттай» гэж тооцогдоод юу ч хасагддаггүй байв');
  assert.ok(!s.on('A') && !s.on('B'));
  /* B-ээр асааж B-ээр унтраана */
  s.click('B');
  assert.ok(s.on('A') && s.on('B'));
  s.click('B');
  assert.deepEqual(s.visible, [], 'B ч унтардаг');
  /* A ил асаалттай үед B-г дарах — A-д хэрэгтэй тул үлдэнэ; A-г дарахад хоёулаа унтарна (гацахгүй) */
  s.click('A').click('B');
  assert.ok(s.on('A') && s.on('B'), 'A ил асаалттай — B-г дарахад A-гийн давхарга үлдэнэ');
  s.click('A');
  assert.deepEqual(s.visible, [], 'A-г дарахад хоёулаа унтарна');
  /* хоёулаа анхнаасаа асаалттай (бүртгэлгүй) — аль нэгийг дарахад унтарна */
  const t = sim(works, ['zone', 'L1', 'L2']).click('B');
  assert.deepEqual(t.visible, ['zone'], 'бүртгэлгүй ижил ажлууд — B-г дарахад давхарга нь хасагдана, бусад нь үлдэнэ');
}
console.log('✅ PkgWorkList: ИЖИЛ давхаргатай ажлууд асааж/унтрааж болно (гацахгүй)');

console.log('\ngeneralDashLayers.check: ok');
