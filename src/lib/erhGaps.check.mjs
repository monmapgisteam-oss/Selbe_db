/**
 * АДМИН САМБАРЫН ГАЦААНЫ ЦООРХОЙНУУД — хуурамч ArcGIS хүснэгт дээр (2026-10-22, аудит).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs --import./tools/test-users.mjs src/lib/erhGaps.check.mjs
 *
 * Хамгаалж буй алдаанууд (амьд аудитаар батлагдсан):
 *   §1 ПОРТАЛД АЛГА аккаунт (хүснэгтэд мөртэй) «Гүйцэтгэгч компани» шатны цорын ганц эзэн мэт тоологдож 21 багцын
 *      гацаа хаана ч гардаггүй байв → `portalPresence` тулгалт: зөвхөн БАТАЛГААТАЙ «алга» (400 COM_0018) гацаанд тусна;
 *      мэдэхгүй (сүлжээ · эрхгүй) → ХЭЗЭЭ Ч «алга» биш (fail-open).
 *   §2 урсгалын ТӨРӨЛ («Газрын дарга» …) шат олгодоггүй — `typeStageGaps` (шатгүй · өөр шат).
 *   §3 аккаунт УСТГАХ асуулт: шинэ гацаа (`removalBlockingText`) ба тэр хүний шатанд хүлээгдэж буй гүйцэтгэл
 *      (`flowWaitingFor`) — урьд нь цорын ганц инженерийг устгахад 21 багц чимээгүй тасардаг байв.
 * АМЬД ArcGIS РУУ ЮУ Ч ЯВАХГҮЙ (`fake.unexpected` хоосон).
 */
import assert from 'node:assert/strict';
import { fake, settle } from './aclE2E.fake.mjs';

const SV = await import('@/lib/services.ts');
const SUPER = Object.entries(SV.ROLE_BY_USER).find(([, r]) => r === 'super')[0];
fake.owner = SUPER;

const P = await import('@/lib/permissions.ts');
const OPS = await import('@/lib/aclOps.ts');
const PP = await import('@/lib/portalPresence.ts');
const EO = await import('@/lib/erhOverview.ts');
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');
const { STAGE_ORDER } = await import('@/lib/hyanalt.ts');

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const J = JSON.stringify;
const G0 = PKG_GROUPS[0];
const G1 = PKG_GROUPS[1];

/* Урсгалын 7 шат (2026-10-23) бүгд «бүх багц»-аар бүрэн + төрлийн зөрөөтэй хоёр + хоёр дахь инженер (§3) */
const STAGE_USER = { company: 'gp_comp', engineer: 'gp_eng', manager: 'gp_man', planner: 'gp_plan', director: 'gp_dir', head: 'gp_head', chief: 'gp_chief' };
const STAGE_TYPE = { company: 'guitsetgegch', engineer: 'injener', manager: 'menejer', planner: 'tolovloltiin', director: 'eronhii', head: 'heltsiin', chief: 'gazriin' };
fake.seed([
  ...STAGE_ORDER.flatMap((st) => [
    { username: STAGE_USER[st], role: STAGE_TYPE[st], views: J(['plan']), docs: 0 },
    { username: `__flow__:${STAGE_USER[st]}`, views: J({ stage: st, bagts: ['*'] }) },
  ]),
  /* «Газрын дарга» төрөлтэй атлаа томилгоогүй (амьд `munkhbaatar`-ын дүр) */
  { username: 'gp_type_chief', role: 'gazriin', views: J(['plan']), docs: 0 },
  /* «Хяналтын инженер» төрөлтэй атлаа менежерийн шатанд — зөвхөн G1 */
  { username: 'gp_mis', role: 'injener', views: J(['plan']), docs: 0 },
  { username: '__flow__:gp_mis', views: J({ stage: 'manager', bagts: [G1] }) },
  /* Зөвхөн харна инженер — шийдвэрлэгч БИШ */
  { username: 'gp_eng_vo', role: 'injener', views: J(['plan']), docs: 0 },
  { username: '__flow__:gp_eng_vo', views: J({ stage: 'engineer', bagts: ['*'], viewOnly: true }) },
]);
ok(await P.initRemote(false, true), 'initRemote');
await settle();
ok(OPS.allAclReady(), 'бүх туг бэлэн');

const flowBad = () => EO.allPkgErh(OPS.liveErhSource())
  .flatMap((p) => p.issues.filter((i) => i.key === 'flowGap').map((i) => ({ bagts: p.bagts, cols: i.cols })));
eq(flowBad(), [], 'эхэнд урсгалын цоорхой алга');

/* ══════════ §1. Порталд алга — гацаанд тусна, мэдэхгүй бол үгүй ══════════ */
{
  const all = () => P.listUsers().map((u) => u.username);
  /* (а) Энгийн гишүүн (бүх гишүүнийг харах эрхгүй) — «inaccessible» нь хаалттай профайл ч байж болно → юу ч тэмдэглэхгүй */
  PP._setPortalLookup(async () => 'missing', async () => false);
  await PP.checkPortalPresence(all());
  eq(PP.portalMissingList(), [], '§1а эрхгүй үзэгч — «алга» тэмдэглэхгүй');
  eq(PP.portalCheckStatus(), 'noPrivilege', '§1а төлөв noPrivilege');
  eq(flowBad(), [], '§1а гацаа өөрчлөгдөөгүй');

  /* (б) Мэдэхгүй (сүлжээ · токен · хоосон хариу) ба шидсэн лавлагч — fail-open */
  PP._setPortalLookup(async (n) => { if (n === 'gp_comp') throw new Error('net'); return 'unknown'; }, async () => true);
  await PP.checkPortalPresence(all());
  ok(!PP.portalMissing('gp_comp'), '§1б шидсэн/мэдэхгүй → «алга» биш');
  eq(flowBad(), [], '§1б гацаа өөрчлөгдөөгүй');
  /* үзэгчийн эрх тодорхойгүй (null) — дараагийн нээлтэд дахин оролдоно */
  PP._setPortalLookup(async () => 'missing', async () => null);
  await PP.checkPortalPresence(all());
  eq(PP.portalMissingList(), [], '§1б үзэгч тодорхойгүй — тэмдэглэхгүй');

  /* (в) Баталгаатай «алга» — компанийн цорын ганц эзэн */
  let calls = 0;
  PP._setPortalLookup(async (n) => { calls += 1; return n === 'gp_comp' ? 'missing' : 'ok'; }, async () => true);
  await PP.checkPortalPresence(all());
  ok(PP.portalMissing('GP_COMP'), '§1в порталд алга (том/жижиг үсэг хамаарахгүй)');
  const src = OPS.liveErhSource();
  ok(src.gone.includes('gp_comp') && src.absent.includes('gp_comp'), `§1в gone/absent-д орсон (${src.gone} · ${src.absent})`);
  const bad = flowBad();
  eq(bad.length, PKG_GROUPS.length, `§1в багц бүрд урсгалын цоорхой (${bad.length}/${PKG_GROUPS.length})`);
  ok(bad.every((b) => b.cols.includes('flow:company')), '§1в цоорхой нь «Гүйцэтгэгч компани» багана');
  ok(OPS.removalBlockingText(['gp_comp']) === '', '§1в аль хэдийн тоологдоогүй хүнийг устгах нь ШИНЭ гацаа биш');
  /* сешнд НЭГ удаа: дахин дуудахад лавлахгүй */
  const before = calls;
  await PP.checkPortalPresence(all());
  eq(calls, before, '§1в баталгаатай хариутай нэрийг дахин лавлахгүй');
  /* (г) Типийн зөрөөнд порталд алга хүн орохгүй */
  ok(!EO.typeStageGaps(src).some((g) => g.user === 'gp_comp'), '§1г порталд алга хүн төрөл↔шатанд давхар гарахгүй');
  PP._setPortalLookup(null);
  eq(flowBad(), [], '§1 цэвэрлэсний дараа гацаа алга');
}
console.log('✅ §1 порталд алга: баталгаатай «алга» л гацаанд · эрхгүй/мэдэхгүй/алдаа → fail-open · сешнд нэг удаа');

/* ══════════ §2. Урсгалын ТӨРӨЛ шат олгодоггүй ══════════ */
{
  const gaps = EO.typeStageGaps(OPS.liveErhSource());
  eq(gaps.filter((g) => g.user.startsWith('gp_')), [
    { user: 'gp_mis', want: 'engineer', have: 'manager' },
    { user: 'gp_type_chief', want: 'chief', have: null },
  ], `§2 шатгүй ба өөр шаттай (${J(gaps)})`);
}
console.log('✅ §2 төрөл ↔ шат: «Газрын дарга» томилгоогүй · инженер менежерийн шатанд');

/* ══════════ §3. Аккаунт устгах — шинэ гацаа ба шатанд хүлээгдэж буй гүйцэтгэл ══════════ */
{
  /* ганц шийдвэрлэх инженер (зөвхөн харна нь тоологдохгүй) → багц бүрд шинэ цоорхой */
  const txt = OPS.removalBlockingText(['gp_eng']);
  ok(txt.startsWith('⚠️ Энэ өөрчлөлтөөр ажил ГАЦААХ шинэ цоорхой үүснэ:'), `§3 устгахад гацааны текст (${txt.slice(0, 80)})`);
  ok(/… ба өөр \d+ цоорхой/.test(txt), '§3 олон багц — товчилсон жагсаалт');
  eq(OPS.removalBlockingText([]), '', '§3 хоосон жагсаалт — текстгүй');
  eq(OPS.removalBlockingText(['gp_type_chief']), '', '§3 хуваарилалтгүй хүн — шинэ гацаагүй');

  /* хүлээгдэж буй гүйцэтгэл: G0/G1 инженерт · G0 дууссан · G0 менежерт */
  OPS.setFlowWorksReader(async () => [
    { bagts: G0, owner: 'engineer', done: false },
    { bagts: G1, owner: 'engineer', done: false },
    { bagts: G0, owner: 'engineer', done: true },
    { bagts: G0, owner: 'manager', done: false },
  ]);
  eq(await OPS.flowWaitingFor(['GP_ENG']), [{ user: 'gp_eng', stage: 'engineer', waiting: 2, orphaned: 2 }],
    '§3 инженерийн шатанд 2 · бүгд өөр шийдвэрлэгчгүй (зөвхөн харагч тоологдохгүй)');
  /* менежерийн шат: gp_man «бүх багц», gp_mis зөвхөн G1 → G0-ийн ажлыг устгахад gp_mis хамрахгүй */
  eq(await OPS.flowWaitingFor(['gp_man']), [{ user: 'gp_man', stage: 'manager', waiting: 1, orphaned: 1 }], '§3 менежер — G0-д өөр менежергүй');
  eq(await OPS.flowWaitingFor(['gp_eng_vo']), [], '§3 зөвхөн харагч — тоолохгүй');
  eq(await OPS.flowWaitingFor(['gp_type_chief']), [], '§3 томилгоогүй — уншилтгүй хоосон');
  /* порталд алга «өөр» шийдвэрлэгч тоологдохгүй: хоёр дахь инженерийг нэмээд порталд алга болгоно */
  fake.seed([
    { username: 'gp_eng2', role: 'injener', views: J(['plan']), docs: 0 },
    { username: '__flow__:gp_eng2', views: J({ stage: 'engineer', bagts: [G0] }) },
  ]);
  ok(await P.initRemote(false, true), 'initRemote (2-р инженер)');
  await settle();
  eq((await OPS.flowWaitingFor(['gp_eng']))[0].orphaned, 1, '§3 G0-д 2-р инженер бий → зөвхөн G1 гацна');
  eq(OPS.removalBlockingText(['gp_eng']).includes(G0), false, '§3 G0 шинэ цоорхойд орохгүй (2-р инженер)');
  PP._setPortalLookup(async (n) => (n === 'gp_eng2' ? 'missing' : 'ok'), async () => true);
  await PP.checkPortalPresence(P.listUsers().map((u) => u.username));
  eq((await OPS.flowWaitingFor(['gp_eng']))[0].orphaned, 2, '§3 порталд алга 2-р инженер шийдвэрлэгч биш');
  PP._setPortalLookup(null);
  /* уншилт унавал — мэдэхгүй (null) ба ил текст */
  OPS.setFlowWorksReader(async () => { throw new Error('down'); });
  eq(await OPS.flowWaitingFor(['gp_eng']), null, '§3 уншилт унасан → null (мэдэхгүй ≠ 0)');
  ok(OPS.flowWaitingText(null).includes('шалгаж чадсангүй'), '§3 null → «шалгаж чадсангүй» текст');
  ok(OPS.flowWaitingText([{ user: 'gp_eng', stage: 'engineer', waiting: 3, orphaned: 2 }]).includes('«Хяналтын инженер» шатанд 3 ажил'), '§3 текст: шат · тоо');
  OPS.setFlowWorksReader(null);
}
console.log('✅ §3 устгах: шинэ гацааны текст · шатанд хүлээгдэж буй/өнчрөх гүйцэтгэл · уншилт унахад «мэдэхгүй»');

/* UserAdmin устгах асуулт хоёуланг нь залгадаг (эх кодын гэрээ) */
{
  const { readFileSync } = await import('node:fs');
  const ua = readFileSync(new URL('../components/UserAdmin.tsx', import.meta.url), 'utf8');
  const sv = ua.slice(ua.indexOf('const saveAll = async'), ua.indexOf('setSaving(true);', ua.indexOf('const saveAll = async')));
  ok(sv.includes('removalBlockingText(gone)') && sv.includes('flowWaitingFor(gone)') && sv.includes('flowWaitingText(flowHeld)'),
    'UserAdmin.saveAll: устгах асуултад шинэ гацаа + гүйцэтгэл');
  ok(ua.includes('void checkPortalPresence(listUsers().map((u) => u.username));'), 'UserAdmin: самбар нээгдэхэд порталтай тулгана');
}

eq(fake.unexpected, [], 'амьд сүлжээ рүү хүсэлт явах ёсгүй');
console.log(`\nerhGaps: ok — ${checks} шалгалт`);
process.exit(0);
