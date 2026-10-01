/**
 * ПОРТАЛААС ГАРАХ ХАМГААЛАЛТ — `Portal.confirmLeave` ба Back товч (2026-09-30).
 *   node src/components/portalLeave.check.mjs
 *
 * ⚠️ СТАТИК (regex) — `Portal.tsx`/`Root.tsx` нь ArcGIS, `next/dynamic`, DOM-ын
 *    `history`-д түшиглэдэг тул Node-д ажиллуулж болохгүй; `viewRegistry.check.mjs`-ийн
 *    хэвээр эх кодыг ӨӨРИЙГ нь уншиж холболтыг тулгана.
 *
 * Хамгаалж буй алдаа:
 *   1. «Дэд бүтэц»/«Газар»/«Зөвшөөрөл»-ийн засвар (`navGuard.setNavDirty`) харагдац
 *      солих, лого, «Гарах»-д асуултгүй алга болдог байв → `confirmLeave` нь
 *      `navDirtyLabels()`-ийг асууна.
 *   2. НҮҮР рүү Back: `Root`-ийн popstate (эхэлж бүртгэгдсэн) scope-ыг ШУУД null
 *      болгодог тул Portal «Гарах уу?» гэж асууж байх хооронд ч, «Үгүй» гэсэн ч
 *      Portal unmount болж ажил алга болдог байв (URL портал, дэлгэц нүүр).
 *      → Root хойшлуулж уншина; Portal порталаас гарахад `confirmLeave()` асууж,
 *      татгалзвал `all=1`-тэй URL-ыг буцааж бичнэ.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').split('\r\n').join('\n');
const PORTAL = read('./Portal.tsx');
const ROOT = read('./Root.tsx');

let pass = 0;
const ok = (name, cond, detail = '') => {
  assert.ok(cond, `✗ ${name}${detail ? ' · ' + detail : ''}`);
  console.log('  ✓', name);
  pass += 1;
};

/** `const name = useCallback((…) => { … }, [deps]);` — хаалтын балансаар бие */
function bodyOf(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d += 1;
    else if (src[i] === '}') { d -= 1; if (d === 0) return src.slice(open, i + 1); }
  }
  return '';
}

console.log('\n1. confirmLeave — ерөнхий navGuard');
const clAt = PORTAL.indexOf('const confirmLeave = useCallback(');
ok('confirmLeave олдлоо', clAt > 0);
const cl = bodyOf(PORTAL, clAt);
ok("navGuard-оос импортолно", /import \{[^}]*\bnavDirtyLabels\b[^}]*\} from '@\/lib\/navGuard'/.test(PORTAL));
ok('planNavBusy · finNavDirty · navDirtyLabels гурвуулаа асуугдана',
  /planNavBusy\(\)/.test(cl) && /finNavDirty\(\)/.test(cl) && /navDirtyLabels\(\)/.test(cl));
ok('хадгалаагүй хэсгийн нэрсийг асуултад дурдана',
  /tr\('\{0\}: хадгалаагүй засвар байна\. Гарвал алдагдана\. Гарах уу\?', labels\.join\(/.test(cl));
ok('лого ба «Гарах» confirmLeave-ээр', (PORTAL.match(/if \(confirmLeave\(\)\)/g) ?? []).length >= 2);

console.log('\n2. Back → нүүр: Portal асууна, Root хойшлуулна');
const popAt = PORTAL.indexOf('const onPop = () =>');
ok('Portal-ийн popstate олдлоо', popAt > 0);
const pop = bodyOf(PORTAL, popAt);
ok('порталаас гарах (URL-д хүрээ алга) → confirmLeave(), татгалзвал all=1-тэй URL сэргээнэ',
  /if \(!inPortalUrl\(\)\) \{\s*if \(!confirmLeave\(\)\) restoreUrl\(\{ all: '1' \}\);\s*return;\s*\}/.test(pop));
ok('харагдац хооронд → setView (хамгаалалттай), татгалзвал URL сэргээнэ',
  /if \(!setView\(next\)\) \{\s*restoreUrl\(\);\s*return;\s*\}/.test(pop));
ok('restoreUrl нь PUSH (Back-ийн өмнөх бичлэг хэвээр)', /restoreUrl = [\s\S]*?writeParams\([\s\S]*?\{ push: true \}\)/.test(PORTAL));

/* inPortalUrl ↔ Root.scopeFromUrl — ИЖИЛ гурван нөхцөл */
const ipAt = PORTAL.indexOf('const inPortalUrl = ');
ok('inPortalUrl олдлоо', ipAt > 0);
const ip = PORTAL.slice(ipAt, PORTAL.indexOf('};', ipAt));
ok("inPortalUrl: all=1 · g · хүчинтэй v", /readParam\('all'\) === '1'/.test(ip) && /readParam\('g'\)/.test(ip) && /Object\.hasOwn\(VIEW_BY_KEY, v\)/.test(ip));
const sfAt = ROOT.indexOf('const scopeFromUrl = ');
const sf = ROOT.slice(sfAt, ROOT.indexOf('};', sfAt));
ok("Root.scopeFromUrl ИЖИЛ нөхцөлтэй", /p\.get\('all'\) === '1'/.test(sf) && /p\.get\('g'\)/.test(sf) && /Object\.hasOwn\(VIEW_BY_KEY, v\)/.test(sf));

const rpAt = ROOT.indexOf("window.addEventListener('popstate', onPop)");
const rootPop = ROOT.slice(ROOT.lastIndexOf('useEffect(() => {', rpAt), rpAt);
ok('Root popstate-ээ setTimeout-оор хойшлуулна (Portal-ийн баталгаанаас хойш)',
  /setTimeout\(\(\) => \{[^}]*setScope\(scopeFromUrl\(\)\)/.test(rootPop), rootPop.slice(0, 200));
ok('Root popstate ШУУД setScope хийхгүй', !/const onPop = \(\) => setScope\(/.test(ROOT));

console.log(`\nportalLeave: ${pass} шалгалт амжилттай.`);
