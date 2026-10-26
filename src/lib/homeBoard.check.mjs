/**
 * НҮҮРИЙН САМБАР ба «СҮҮЛИЙН ХАРАГДАЦАА АЛДСАН» ХӨЛДӨӨЛТ — ⚠️ 2026-10-22 (аудит).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/homeBoard.check.mjs
 *
 *   1. `boardAllowedFor`: 2026-10-01-ээс super биш хүнд `allowed` ХЭЗЭЭ Ч 'all' биш тул удирдлага (Төлөвлөлтийн ахлах инженер ·
 *      Хэлтсийн · Газрын дарга) самбарыг хардаггүй байв — урсгалтай БУС бүх харагдацтай бол нээгдэнэ.
 *   2. `Root` (эх кодын гэрээ — Portal/ArcGIS/DOM шаарддаг тул статик): ажиллаж байхдаа сүүлийн харагдацаа алдвал Portal
 *      хөлдөж (`lastPortal`), дээр нь `AccessLost` цонх; нүүр рүү гарахад хөлдөөлтийн хүрээ мартагдана.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { boardAllowedFor } = await import('@/lib/homeBoard.ts');
const { VIEWS } = await import('@/lib/services.ts');
const { WORKFLOW_VIEWS } = await import('@/lib/caps.ts');
const { roleAccess } = await import('@/lib/roleTypes.ts');

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

const nonWf = VIEWS.map((v) => v.key).filter((k) => !WORKFLOW_VIEWS.includes(k));
ok(boardAllowedFor('all', false), "'all' → самбартай");
ok(boardAllowedFor([], true), 'super → самбартай');
ok(boardAllowedFor(nonWf, false), 'урсгалтай бус бүх харагдац (super биш удирдлага) → самбартай');
ok(boardAllowedFor([...nonWf, 'guitsetgel'], false), 'нэмэлт урсгалтай харагдац саад биш');
ok(!boardAllowedFor(nonWf.slice(1), false), 'нэг ч урсгалтай бус харагдац дутвал — самбаргүй');
ok(!boardAllowedFor([], false), 'харагдацгүй → самбаргүй');
ok(!boardAllowedFor(['guitsetgel', 'plan'], false), 'гүйцэтгэгч → самбаргүй');
/* амьд `munkhbaatar`-ын (Газрын дарга) хадгалсан жагсаалт — урсгалтай бус бүгд
   ⚠️ 2026-10-26: + `zuragTosol` · `tuvshin6` — шинэ харагдацын эрхийг удирдлагын хэрэглэгчдэд олгосон (хэрэглэгчийн шийдвэр) */
ok(boardAllowedFor(['gdash', 'dashboard', 'plan', 'hesegET', 'pkgFin', 'pkgProg', 'gazar', 'analysis', 'irged', 'tailan', 'tuh',
  'bagtsHamaaral', 'finance', 'habea', 'iot', 'ersdel', 'dedButets', 'zovshoorol', 'schem', 'sysdoc', 'zuragTosol', 'tuvshin6'], false), 'амьд «Газрын дарга» → самбартай');
ok(!boardAllowedFor(['gdash', 'dashboard', 'plan', 'hesegET', 'pkgFin', 'pkgProg', 'gazar', 'analysis', 'irged', 'tailan', 'tuh',
  'bagtsHamaaral', 'finance', 'habea', 'iot', 'ersdel', 'dedButets', 'zovshoorol', 'schem', 'sysdoc'], false), 'шинэ 2 харагдацгүй хуучин жагсаалт → самбаргүй (эрх олгоно)');
/* ⚠️ Синкээс өмнөх нарийн нөөц загвар (`roleTypes.narrowTpl` — урсгалын төрөлд зөвхөн «Гүйцэтгэл») самбар нээхгүй — fail-closed */
ok(!boardAllowedFor(roleAccess('gazriin').views === 'all' ? [] : roleAccess('gazriin').views, false), 'синкгүй нөөц загвар → самбаргүй');
console.log('✅ самбар: super · урсгалтай бус бүх харагдац (удирдлага) → нээлттэй; дутуу → хаалттай');

const root = readFileSync(new URL('../components/Root.tsx', import.meta.url), 'utf8');
const ag = readFileSync(new URL('../components/AuthGate.tsx', import.meta.url), 'utf8');
/* ⚠️ 2026-10-23: + үүрэг («Ерөнхий захирал» — самбар үргэлж) */
ok(root.includes('boardAllowed={boardAllowedFor(allowed, isSuper, roleOf(user?.username))}'), 'Root: самбар `boardAllowedFor`-оор');
ok(boardAllowedFor([], false, 'zahiral'), '«Ерөнхий захирал» → самбартай (харагдац хумигдсан ч)');
ok(boardAllowedFor(roleAccess('zahiral').views === 'all' ? 'all' : roleAccess('zahiral').views, false), '«Ерөнхий захирал»-ын загвар — удирдлагын бүх харагдац');
ok(!boardAllowedFor([], false, 'gazar'), 'бусад үүрэг харагдацгүй бол самбаргүй');
ok(root.includes("const frozen = scope && ((accessLost && status === 'denied') || viewsLost || (sysClosed && status === 'signed-in')) ? lastPortal : null;"),
  'Root: сүүлийн харагдацаа алдсан үед Portal хөлдөнө (lastPortal)');
ok(root.includes("const viewsLost = !!scope && authorized && noAccess && noViewsNow && !(status === 'signed-in' && !remoteReady());"),
  'Root: эрхийн хүснэгт уншигдаагүй нь эрх хасалт биш');
ok(root.includes('{frozen && viewsLost && <AccessLost username={user?.username} onSignOut={signOut} />}'), 'Root: «Таны хандах эрх өөрчлөгдлөө» цонх');
ok(root.includes('if (!scope && lastPortal) setLastPortal(null);'), 'Root: нүүр рүү гарахад хөлдөөлтийн хүрээ мартагдана');
ok(ag.includes('export function AccessLost('), 'AuthGate: AccessLost экспорт');
console.log('✅ Root: сүүлийн харагдацаа алдвал Portal хөлдөж AccessLost цонх; нүүрээс дахин ороход хөлдөөхгүй');
console.log(`\nhomeBoard: ok — ${checks} шалгалт`);
