/**
 * ХАРАГДАЦЫН БҮРТГЭЛИЙН ШАЛГУУР — `VIEWS` ↔ `VIEW_REGISTRY` хоёр талдаа.
 *   node src/components/viewRegistry.check.mjs
 *
 * ⚠️ СТАТИК (regex) — `viewRegistry.tsx` нь `next/dynamic` ба JSX импортолдог
 *    тул Node-д шууд ачаалж болохгүй; бусад `*.check.mjs`-тэй ижил зарчмаар
 *    эх кодыг ӨӨРИЙГ нь уншиж тулгана. Хуулбар тоо байхгүй тул хоцрохгүй.
 *
 * Хамгаалж буй алдаа:
 *   1. `ViewKey`-д шинэ харагдац нэмэгдээд бүртгэлд ОРООГҮЙ (isFull → хоосон).
 *   2. Бүртгэлд `VIEWS`-д байхгүй түлхүүр үлдэх (устгагдсан харагдац).
 *   3. `standalone` харагдац бүртгэлгүй / зураг+самбарын харагдац бүртгэлтэй.
 *   4. `Portal.tsx`-д модулийн импорт буцаж орох (бүртгэлийг тойрсон зам).
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8').split('\r\n').join('\n');

/* ⚠️ 2026-09-30: `services.ts` нь barrel болж `VIEWS` нь `services/views.ts`-д
   шилжсэн; хуучин байрлалыг ч хүлээнэ. */
const VIEWS_SRC = existsSync('src/lib/services/views.ts')
  ? read('src/lib/services/views.ts') : read('src/lib/services.ts');
const REG = read('src/components/viewRegistry.tsx');
const PORTAL = read('src/components/Portal.tsx');

let pass = 0;
const ok = (name, cond, detail = '') => {
  assert.ok(cond, `✗ ${name}${detail ? ' · ' + detail : ''}`);
  console.log('  ✓', name + (detail ? ' · ' + detail : ''));
  pass++;
};

/* ── ViewKey нэгдэл ── */
const unionBlock = VIEWS_SRC.slice(VIEWS_SRC.indexOf('export type ViewKey ='));
const unionEnd = unionBlock.search(/;\s*\n/);
const viewKeys = [...unionBlock.slice(0, unionEnd).matchAll(/\|\s*"([A-Za-z0-9]+)"/g)].map((m) => m[1]);

/* ── VIEWS массив: түлхүүр бүр standalone эсэх ── */
const vStart = VIEWS_SRC.indexOf('export const VIEWS');
const vEnd = VIEWS_SRC.indexOf('export const VIEW_BY_KEY');
const VIEW_BLOCK = VIEWS_SRC.slice(vStart, vEnd);
const entries = VIEW_BLOCK.split(/^\s*key:\s*"/m).slice(1);
const views = entries.map((e) => ({
  key: e.slice(0, e.indexOf('"')),
  standalone: /^\s*standalone:\s*true/m.test(e),
}));

/* ── Бүртгэл ── */
const rStart = REG.indexOf('export const VIEW_REGISTRY');
const rEnd = REG.indexOf('\n};', rStart);
const REG_BLOCK = REG.slice(rStart, rEnd);
const regKeys = [...REG_BLOCK.matchAll(/^  ([A-Za-z0-9]+):\s*\(/gm)].map((m) => m[1]);
const mapOnly = [...(REG.match(/export type MapOnlyViewKey = ([^;]+);/)?.[1] ?? '').matchAll(/'([A-Za-z0-9]+)'/g)].map((m) => m[1]);

console.log('\n1. Эх сурвалж');
ok('ViewKey нэгдэл олдсон', viewKeys.length > 0, `${viewKeys.length} түлхүүр`);
ok('VIEWS массив олдсон', views.length > 0, `${views.length} харагдац`);
ok('VIEWS ↔ ViewKey тэнцүү', views.length === viewKeys.length && views.every((v) => viewKeys.includes(v.key)));
ok('Бүртгэл олдсон', regKeys.length > 0, `${regKeys.length} мөр`);
ok('MapOnlyViewKey олдсон', mapOnly.length > 0, mapOnly.join(', '));

console.log('\n2. Хоёр талын тулгалт');
const notInViews = regKeys.filter((k) => !viewKeys.includes(k));
ok('Бүртгэлийн түлхүүр бүр ViewKey-д байна', notInViews.length === 0, notInViews.join(', '));
const dup = regKeys.filter((k, i) => regKeys.indexOf(k) !== i);
ok('Бүртгэлд давхардал байхгүй', dup.length === 0, dup.join(', '));
const missing = views.filter((v) => v.standalone && !regKeys.includes(v.key)).map((v) => v.key);
ok('standalone харагдац бүр бүртгэлтэй', missing.length === 0, missing.length ? 'ДУТУУ: ' + missing.join(', ') : '');
const wrongReg = views.filter((v) => !v.standalone && regKeys.includes(v.key)).map((v) => v.key);
ok('зураг+самбарын харагдац бүртгэлд ОРООГҮЙ', wrongReg.length === 0, wrongReg.join(', '));
const wrongMap = views.filter((v) => !v.standalone && !mapOnly.includes(v.key)).map((v) => v.key);
ok('зураг+самбарын харагдац бүр MapOnlyViewKey-д', wrongMap.length === 0, wrongMap.join(', '));
const covered = viewKeys.filter((k) => !regKeys.includes(k) && !mapOnly.includes(k));
ok('ViewKey бүр бүртгэл ЭСВЭЛ MapOnly', covered.length === 0, covered.join(', '));

console.log('\n3. Portal бүртгэлээр л зурна');
ok('Portal ViewSlot-оор зурна', /from '@\/components\/viewRegistry'/.test(PORTAL) && /<ViewSlot\b/.test(PORTAL));
const portalModImports = [...PORTAL.matchAll(/import\('@\/modules\/([A-Za-z/]+)'\)/g)].map((m) => m[1]);
ok('Portal-д зөвхөн ViewPanel динамик', portalModImports.length === 1 && portalModImports[0] === 'ViewPanel', portalModImports.join(', '));
ok('Portal-д харагдацын статик импорт байхгүй', !/^import .* from '@\/modules\//m.test(PORTAL));
ok('ErrorBoundary key={view} хэвээр', /<ErrorBoundary scope="view" key=\{view\}/.test(PORTAL));
const dyn = (REG.match(/ssr: false/g) ?? []).length;
ok('Бүртгэлийн модулиуд dynamic (Dashboard-оос бусад)', dyn >= regKeys.length - 1, `${dyn} dynamic ↔ ${regKeys.length} мөр`);

console.log(`\n${pass} шалгалт бүгд амжилттай.\n`);
