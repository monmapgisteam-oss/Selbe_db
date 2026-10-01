/**
 * ХЭЛ СОЛИХОД ХАДГАЛААГҮЙ АЖИЛ АЛДАГДАХГҮЙ — `LocaleToggle` (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/LocaleToggle.ui.check.mjs
 *
 * Хамгаалж буй алдаа: хэл солих нь 2026-09-30-наас хуудсыг дахин ачаалахгүй —
 * `LocaleProvider` аппыг `key`-ээр REMOUNT хийнэ. Reload үед модулиудын
 * `beforeunload` хамгаалалт «Хуудаснаас гарах уу?» асуудаг байсан бол remount нь
 * `beforeunload` үүсгэдэггүй тул Санхүү · Хуваарь · QAQC · Газар · «Гүйцэтгэл
 * бөглөх» … хадгалаагүй засвар АСУУЛТГҮЙ алга болдог байв.
 * Мөн `SkipLink` (LocaleProvider-ийн гадна) хэл солиход хуучин хэлээрээ үлддэг байв.
 *
 * ⚠️ `*.ui.check.mjs` — CSS модулийн стуб хэрэгтэй (`tools/ts-alias.mjs`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hasUnsavedWork, confirmLocaleSwitch, LocaleToggle } from '@/components/LocaleToggle';
import { setNavDirty, _resetNavDirty } from '@/lib/navGuard';

let pass = 0;
const ok = (name, cond, detail = '') => {
  assert.ok(cond, `✗ ${name}${detail ? ' · ' + detail : ''}`);
  console.log('  ✓', name);
  pass += 1;
};

/* Хөтчийн `window` — `beforeunload` сонсогчид жинхэнэ EventTarget дээр */
const win = new EventTarget();
let asked = [];
let answer = false;
win.confirm = (msg) => { asked.push(msg); return answer; };
globalThis.window = win;

console.log('\n1. hasUnsavedWork — модулиудын ЯГ ТЭР beforeunload сонсогчдоос');
ok('сонсогчгүй → хадгалаагүй ажил алга', hasUnsavedWork() === false);

/* Finance/Huvaari/CashflowPlan хэв: `(e) => { e.preventDefault(); }` (dirty үед л бүртгэгдэнэ) */
const finance = (e) => { e.preventDefault(); };
win.addEventListener('beforeunload', finance);
ok('preventDefault хийдэг сонсогч → true', hasUnsavedWork() === true);
win.removeEventListener('beforeunload', finance);

/* Qaqc/Pivot/useDraftSync хэв: `e.returnValue = ''` */
const pivot = (e) => { e.returnValue = ''; };
win.addEventListener('beforeunload', pivot);
ok("returnValue = '' хэв → true", hasUnsavedWork() === true);
win.removeEventListener('beforeunload', pivot);

/* GazarEdit/ZovshoorolEdit хэв: ref цэвэр бол юу ч хийхгүй */
const dirtyRef = { current: false };
const gazar = (e) => { if (dirtyRef.current) e.preventDefault(); };
win.addEventListener('beforeunload', gazar);
ok('цэвэр ref-тэй сонсогч → false', hasUnsavedWork() === false);
dirtyRef.current = true;
ok('бохир ref → true', hasUnsavedWork() === true);
win.removeEventListener('beforeunload', gazar);

/* Ерөнхий `navGuard` (Дэд бүтэц · Газар · Зөвшөөрөл) — өөрөө beforeunload бүртгэдэг */
setNavDirty('butets', true, 'Инженерийн дэд бүтэц');
ok('navGuard.setNavDirty → true', hasUnsavedWork() === true);
setNavDirty('butets', false);
ok('navGuard цэвэрлэсний дараа → false', hasUnsavedWork() === false);
_resetNavDirty();

console.log('\n2. confirmLocaleSwitch — хадгалаагүй үед л асууна');
asked = [];
ok('цэвэр → асуултгүй зөвшөөрнө', confirmLocaleSwitch() === true && asked.length === 0);
win.addEventListener('beforeunload', finance);
answer = false;
ok('бохир + «Цуцлах» → солихгүй', confirmLocaleSwitch() === false && asked.length === 1);
ok('асуулт нь хэл солихыг нэрлэнэ', /хэл солиход алдагдана/.test(asked[0] ?? ''), asked[0]);
answer = true;
ok('бохир + «OK» → солино', confirmLocaleSwitch() === true && asked.length === 2);
win.removeEventListener('beforeunload', finance);

console.log('\n3. Холболт — товч ба SkipLink');
const src = readFileSync(new URL('./LocaleToggle.tsx', import.meta.url), 'utf8');
ok('товч setLocale-ийн ӨМНӨ confirmLocaleSwitch() асууна',
  /onClick=\{\(\) => \{\s*if \(confirmLocaleSwitch\(\)\) setLocale\(next\);\s*\}\}/.test(src));
const html = renderToStaticMarkup(createElement(LocaleToggle, {}));
ok('товч зурагдана (mn → EN)', /<button[^>]*>/.test(html) && html.includes('EN'), html);
const skip = readFileSync(new URL('./SkipLink.tsx', import.meta.url), 'utf8');
ok('SkipLink хэлний store-ыг захиална (LocaleProvider-ийн гадна)',
  /useSyncExternalStore\(\s*subscribeLocale\s*,\s*getLocale\s*,\s*getServerLocale\s*\)/.test(skip));

delete globalThis.window;
console.log(`\nLocaleToggle: ${pass} шалгалт амжилттай.`);
