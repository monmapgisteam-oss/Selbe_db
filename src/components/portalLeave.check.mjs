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
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/* ⚠️ 2026-10-21 (аудит): эрх хасагдсан харагдац — «Болих» дарсан ч эрхгүй агуулга ХАРАГДАХГҮЙ.
   Урьд нь `setView(navScope[0])` → `confirmLeave` «Гарах уу?» (шалтгаангүй), «Болих» → харагдац бүрэн
   зурагдсаар. Одоо: асуултад шалтгаан, рендерийн `viewAllowed` хамгаалалт (`inert` + `ViewLost`),
   цонхны товч АСУУЛГҮЙ (`force`) шилжинэ. */
console.log('\n3. Эрх хасагдсан харагдац — шалтгаантай асуулт, рендерийн хамгаалалт');
/* ⚠️ 2026-10-22 (аудит): хоёр дахь параметр `busyOnly` (4-р хэсэг) */
ok('confirmLeave шалтгаан авна', /const confirmLeave = useCallback\(\(reason\?: string, busyOnly = false\): boolean => \{/.test(PORTAL));
ok('асуулт бүр шалтгаанаар эхэлнэ', /const ask = \(msg: string\) => window\.confirm\(reason \? `\$\{reason\}\\n\\n\$\{msg\}` : msg\);/.test(PORTAL));
ok('confirmLeave дотор window.confirm шууд дуудагдахгүй (ask-аар)', !/window\.confirm\(tr\('Хуваарь хадгалагдаж/.test(cl2()));
ok('setView: { reason, force }', /const setView = useCallback\(\(v: ViewKey, opts\?: \{ reason\?: string; force\?: boolean \}\): boolean => \{/.test(PORTAL));
/* ⚠️ 2026-10-22 (аудит): `force` нь ЗӨВХӨН хадгалаагүй засварын асуултыг алгасна (4-р хэсэг) — урьд нь `!opts?.force && …` */
ok('force → busyOnly; бусад нь шалтгаантай бүрэн асуулт', /if \(!confirmLeave\(opts\?\.reason, !!opts\?\.force\)\) return false;/.test(PORTAL));
ok('force нь confirmLeave-ийг бүхэлд нь алгасахгүй', !/if \(!opts\?\.force && !confirmLeave\(/.test(PORTAL));
ok('эрхийн хамгаалалтын эффект шалтгаан дамжуулна',
  /setView\(navScope\[0\], \{ reason: tr\('Таны эрх өөрчлөгдсөн тул «\{0\}» харагдац хаагдана\.', from\) \}\)/.test(PORTAL));
ok('viewAllowed рендерт тооцогдоно', /const viewAllowed = navScope === 'all' \|\| navScope\.includes\(view\);/.test(PORTAL));
ok('порталын агуулга эрхгүй үед inert', /inert=\{!viewAllowed\}/.test(PORTAL));
ok('ViewLost цонх эрхгүй үед зурагдана, товч нь force', /\{!viewAllowed && \(\s*<ViewLost[\s\S]*?onGo=\{\(\) => setView\(navScope\[0\], \{ force: true \}\)\}/.test(PORTAL));
ok('ViewLost: alertdialog + фокусын урхи', /function ViewLost\([\s\S]*?useFocusTrap\(ref, true\);[\s\S]*?role="alertdialog" aria-modal="true"/.test(PORTAL));
function cl2() { return bodyOf(PORTAL, PORTAL.indexOf('const confirmLeave = useCallback(')); }

/* ⚠️ 2026-10-22 (аудит): эрх хасагдсан цонхны товч (`force`) ЯВЖ БУЙ бичилтийг асуусаар — урьд нь `force` бүх
   `confirmLeave`-ийг алгасаж, Хуваарийн save→decidePlan гинж (`planNavBusy`) ба илгээлт/шийдвэр/буулгалтын
   (`fillnew-send` · `hyanalt-apply` · `ajil-apply`) дундуур модуль unmount болдог байв. */
console.log('\n4. force — хадгалаагүй засварын асуултгүй, явж буй бичилтийг асууна');
{
  const c = cl2();
  const bo = c.indexOf('if (busyOnly) {');
  ok('busyOnly салаа planNavBusy-ийн ДАРАА', bo > 0 && bo > c.indexOf('planNavBusy()'));
  ok('busyOnly салаа хадгалаагүй засварын асуултаас (fin · navDirty · beforeunload) ӨМНӨ',
    bo < c.indexOf('finNavDirty()') && bo < c.indexOf('navDirtyLabels()') && bo < c.indexOf('hasUnsavedWork()'));
  ok('busyOnly: явж буй бичилтийн нэрсийг асууна',
    /if \(busyOnly\) \{\s*const busyL = navBusyLabels\(\);\s*return !busyL\.length\s*\|\| ask\(tr\('\{0\}: бичилт явж байна — одоо гарвал дундаа тасарч болзошгүй\. Гарах уу\?', busyL\.join\(' · '\)\)\);\s*\}/.test(c));
  const nbAt = PORTAL.indexOf('const navBusyLabels = (): string[] =>');
  ok('navBusyLabels олдлоо', nbAt > 0);
  const nb = bodyOf(PORTAL, nbAt);
  ok('navBusyLabels нь navDirtyLabels()-ээс шүүнэ', /return navDirtyLabels\(\)\.filter\(\(l\) => busy\.has\(l\)\);/.test(nb));
  /* Явж буй бичилтийн туг бүрийн НЭР Portal-ийн жагсаалтад — зөрвөл `force` тэр бичилтийг чимээгүй алгасна.
     Түлхүүрийн дүрэм: `-send` / `-apply` (setNavDirty-ийг бичилтийн өмнө асааж finally-д унтраадаг). */
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = readdirSync(root, { recursive: true })
    .map(String)
    .filter((p) => /\.tsx?$/.test(p) && !/\.check\./.test(p));
  const flags = [];
  for (const p of files) {
    const s = readFileSync(join(root, p), 'utf8');
    for (const m of s.matchAll(/setNavDirty\('([\w-]+-(?:send|apply))', true, tr\('([^']+)'\)\)/g)) flags.push({ p, key: m[1], label: m[2] });
  }
  ok('явж буй бичилтийн туг ≥ 3 олдлоо (fillnew-send · hyanalt-apply · ajil-apply)',
    ['fillnew-send', 'hyanalt-apply', 'ajil-apply'].every((k) => flags.some((f) => f.key === k)), JSON.stringify(flags.map((f) => f.key)));
  for (const f of flags) ok(`«${f.key}» (${f.p}) нэр navBusyLabels-д`, nb.includes(`tr('${f.label}')`), f.label);
}

console.log(`\nportalLeave: ${pass} шалгалт амжилттай.`);
