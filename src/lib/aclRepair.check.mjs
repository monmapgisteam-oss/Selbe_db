/**
 * ЭРХИЙН ЗАСВАРЫН ЗАМУУД — хуурамч ArcGIS дээр (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/aclRepair.check.mjs
 *
 * Хамгаалж буй шийдвэрүүд:
 *   §1 урсгалтай 6 харагдац ЗӨВХӨН хуваарилалтаар (`permissions.workflowViewsOf`) — хадгалсан
 *      `views` дахь утга үл тоологдоно; картын эх сурвалж (`workflowSources.workflowRows`) нь
 *      `resolveAccess`-тэй ЯГ таарна.
 *   §2 «Дахин олгох» (`aclOps.regrantOp`) — хуваарилалт бий атлаа эрх алга → эрх сэргэнэ,
 *      хуваарилалт өөрчлөгдөхгүй; устгагдсан / super-т татгалзана.
 *   §3 «Дахин илгээх» (`aclOps.retryOp`) — унасан нэмэлт ба хасалт (үүрэгтэй систем · урсгал).
 *   §4 устгагдсан аккаунтын үлдэгдэл (`goneRightsOf` · `goneCleanupOp`) — хуваарилалттай ба
 *      энгийн эрхийн хуудас; порталд байгаа аккаунтад op алга.
 *   §5 «Төрлөөр тохируулах» урсгалтай харагдацыг БИЧИХГҮЙ, харин томилгоогоор нээлттэй хэвээр.
 * ОРЧИН: `aclE2E.fake.mjs` — АМЬД ArcGIS РУУ ЮУ Ч ЯВАХГҮЙ.
 */
import assert from 'node:assert/strict';
import { fake, takeConfirms, settle } from './aclE2E.fake.mjs';

const { ROLE_BY_USER } = await import('@/lib/services.ts');
const SUPER = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'super')[0];
fake.owner = SUPER;

const P = await import('@/lib/permissions.ts');
const CAPS = await import('@/lib/caps.ts');
const OPS = await import('@/lib/aclOps.ts');
const FL = await import('@/lib/guitsetgelAcl.ts');
const HV = await import('@/lib/huvaariAcl.ts');
const OB = await import('@/lib/obyemAcl.ts');
const ERH = await import('@/lib/erhOverview.ts');
const WF = await import('@/lib/workflowSources.ts');
const RTA = await import('@/lib/roleTypeApply.ts');
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const sorted = (x) => [...x].sort();

/* ⚠️ Аккаунт бүрд ХАДГАЛСАН урсгалтай харагдац («Гүйцэтгэл» · «Чанар (QAQC)») — үл тоологдох ёстой */
const POOL = Array.from({ length: 30 }, (_, i) => `rp_u${String(i + 1).padStart(2, '0')}`);
fake.seed(POOL.map((u) => ({ username: u, role: 'taniltsah', views: JSON.stringify(['gdash', 'guitsetgel', 'qaqc']), docs: 0 })));
let next = 0;
const mkUser = () => POOL[next++];

async function run(op) {
  takeConfirms();
  let err = '';
  const res = await OPS.runOp(op, (m) => { err = m; });
  await settle();
  return { ok: res, err, confirms: takeConfirms() };
}
async function roundTrip() {
  await settle();
  ok(await P.initRemote(false, true), 'initRemote хуурамч хүснэгтээс уншигдах ёстой');
  await settle();
}
const views = (u) => P.resolveAccess(u)?.views ?? [];
const rowsOf = (u) => WF.workflowRows(ERH.userErh(OPS.liveErhSource(), u));
/** Картын «нээлттэй» = `resolveAccess` — хоёр газар ИЖИЛ дүрэм */
const agree = (u, tag) => {
  for (const r of rowsOf(u)) eq(r.open, views(u).includes(r.view), `${tag} ${u}: карт ↔ resolveAccess (${r.view})`);
};

await roundTrip();
ok(OPS.allAclReady(), 'бүх 9 туг бэлэн');
const [g1, g2] = PKG_GROUPS;

/* ══════════ §1. Урсгалтай харагдац ЗӨВХӨН хуваарилалтаар ══════════ */
{
  const tag = '§1';
  const u = mkUser();
  ok(P.listUsers().find((x) => x.username === u).views.includes('guitsetgel'), `${tag}: хадгалсан «Гүйцэтгэл» бий (тест бэлтгэл)`);
  eq(views(u), ['gdash'], `${tag}: хадгалсан урсгалтай харагдац хүчингүй`);
  for (const r of rowsOf(u)) ok(!r.open && !r.sources.length, `${tag}: ${r.view} — эх сурвалжгүй, хаалттай`);
  agree(u, tag);

  ok((await run(OPS.flowCellOp(u, 'engineer', g1, true))).ok, `${tag}: урсгал`);
  ok((await run(OPS.scopedCellOp('huvaari', u, 'author', g1, true))).ok, `${tag}: хуваарь зохиогч`);
  ok((await run(OPS.qaqcCellOp(u, g2, true))).ok, `${tag}: QAQC`);
  const rows = Object.fromEntries(rowsOf(u).map((r) => [r.view, r]));
  eq(rows.guitsetgel.sources.map((s) => [s.sys, s.role, s.bagts]), [['flow', 'engineer', [g1]]], `${tag}: «Гүйцэтгэл» ← урсгал`);
  eq(rows.huvaari.sources.map((s) => [s.sys, s.role, s.cap, s.granted]), [['huvaari', 'author', 'plan', true]], `${tag}: «Хуваарь» ← Хуваарийн эрх · Зохиогч`);
  eq(rows.qaqc.sources.map((s) => [s.sys, s.bagts, s.granted]), [['qaqc', [g2], true]], `${tag}: «Чанар (QAQC)» ← QAQC`);
  ok(!rows.huvaariBatlah.open && !rows.chanar.open && !rows.ajilBatlah.open, `${tag}: бусад хаалттай`);
  agree(u, tag);
  await roundTrip();
  agree(u, `${tag} remote`);

  /* томилгоо хасагдахад хадгалсан утга байсан ч «Гүйцэтгэл» хаагдана */
  ok((await run(OPS.flowCellOp(u, 'engineer', g1, false))).ok, `${tag}: урсгал хасах`);
  ok(!views(u).includes('guitsetgel'), `${tag}: томилгоогүй → «Гүйцэтгэл» хаалттай`);
  agree(u, `${tag} хассаны дараа`);

  /* super — хөндөгдөхгүй, карт «нээлттэй» */
  eq(P.resolveAccess(SUPER).views, 'all', `${tag}: super бүх харагдац`);
  ok(rowsOf(SUPER).every((r) => r.open), `${tag}: super-ийн карт бүгд нээлттэй`);
  console.log('✅ §1 урсгалтай харагдац хуваарилалтаар · карт ↔ resolveAccess таарна · super хөндөгдөхгүй');
}

/* ══════════ §2. «Дахин олгох» ══════════ */
{
  const tag = '§2';
  const u = mkUser();
  ok((await run(OPS.scopedCellOp('huvaari', u, 'approver', g1, true))).ok, `${tag}: хуваарь батлагч`);
  ok(CAPS.capsOf(u).includes('planApprove'), `${tag}: эрх олгогдсон`);
  const before = fake.json('__huvaari__:', u);
  /* эрх олголт «унасан» мэт — эрхийг шууд арилгана */
  ok(await CAPS.setCaps(u, []), `${tag}: эрх арилгав`); await settle();
  const e = ERH.userErh(OPS.liveErhSource(), u);
  eq(ERH.missingCaps(e), ['planApprove'], `${tag}: missingCaps`);
  eq(WF.ungrantedCaps(rowsOf(u)), ['planApprove'], `${tag}: картын «эрх олгогдоогүй»`);
  ok(!views(u).includes('huvaariBatlah') && !views(u).includes('huvaari'), `${tag}: эрхгүй тул хаалттай`);
  agree(u, tag);
  const r = await run(OPS.regrantOp(u, ['planApprove']));
  ok(r.ok && r.confirms.length === 0, `${tag}: «Дахин олгох» («${r.err}»)`);
  ok(CAPS.capsOf(u).includes('planApprove') && fake.json('__cap__:', u).includes('planApprove'), `${tag}: эрх сэргэв (локал + ArcGIS)`);
  eq(fake.json('__huvaari__:', u), before, `${tag}: хуваарилалт өөрчлөгдөөгүй`);
  ok(views(u).includes('huvaariBatlah') && views(u).includes('huvaari'), `${tag}: хуудас нээгдэв`);
  await roundTrip();
  ok(CAPS.capsOf(u).includes('planApprove'), `${tag} remote: эрх хэвээр`);
  /* хуваарилалтгүй эрх → op алга; устгагдсан / super → татгалзана */
  eq(OPS.regrantOp(u, ['obyemEdit']), null, `${tag}: хуваарилалтгүй системд op алга`);
  ok('error' in OPS.regrantOp('rp_ghost_none', ['plan']), `${tag}: устгагдсан аккаунтад татгалзана`);
  ok('error' in OPS.regrantOp(SUPER, ['plan']), `${tag}: super-т татгалзана`);
  console.log('✅ §2 «Дахин олгох» — эрх сэргэнэ, хуваарилалт хөндөгдөхгүй, устгагдсан/super татгалзана');
}

/* ══════════ §3. «Дахин илгээх» ══════════ */
{
  const tag = '§3';
  /* (а) үүрэгтэй систем — унасан НЭМЭЛТ */
  const u = mkUser();
  fake.failWrites = true;
  let r = await run(OPS.scopedCellOp('obyem', u, 'editor', g1, true));
  fake.failWrites = false;
  ok(!r.ok, `${tag}: бичилт унасан`);
  ok(OPS.failedUsersOf('obyem').includes(u), `${tag}: failed тэмдэг`);
  eq(fake.find(`__obyem__:${u}`), [], `${tag}: ArcGIS-т мөр алга`);
  r = await run(OPS.retryOp('obyem', u));
  ok(r.ok && r.confirms.length === 0, `${tag}: дахин илгээх («${r.err}»)`);
  ok(!OPS.failedUsersOf('obyem').includes(u), `${tag}: тэмдэг арилав`);
  eq(fake.json('__obyem__:', u)?.grants, [{ role: 'editor', bagts: [g1] }], `${tag}: ArcGIS мөр бичигдэв`);
  ok(CAPS.capsOf(u).includes('obyemEdit') && fake.json('__cap__:', u)?.includes('obyemEdit'), `${tag}: эрх олгогдов`);
  await roundTrip();
  eq(OB.obyemScope(u, 'editor'), [g1], `${tag} remote: хүрээ`);

  /* (б) унасан ХАСАЛТ — локалд мөр алга, ArcGIS-т үлдсэн → дахин илгээхэд устгагдана */
  const v = mkUser();
  ok((await run(OPS.scopedCellOp('huvaari', v, 'author', g2, true))).ok, `${tag}: хуваарь`);
  fake.failWrites = true;
  r = await run(OPS.scopedCellOp('huvaari', v, 'author', g2, false));
  fake.failWrites = false;
  ok(HV.huvaariFailedUsers().includes(v), `${tag}: хасалт унасан`);
  ok(fake.find(`__huvaari__:${v}`).length === 1, `${tag}: ArcGIS-т мөр үлдсэн`);
  r = await run(OPS.retryOp('huvaari', v));
  ok(r.ok, `${tag}: хасалтыг дахин илгээх («${r.err}»)`);
  eq(fake.find(`__huvaari__:${v}`), [], `${tag}: ArcGIS мөр устав`);
  await roundTrip();
  ok(!HV.listHuvaariAssigns().some((a) => a.user === v), `${tag} remote: мөр эргэж ирэхгүй`);

  /* (в) урсгал — унасан томилгоо */
  const w = mkUser();
  fake.failWrites = true;
  r = await run(OPS.flowCellOp(w, 'manager', g1, true));
  fake.failWrites = false;
  ok(OPS.failedUsersOf('flow').includes(w), `${tag}: урсгал failed`);
  r = await run(OPS.retryOp('flow', w));
  ok(r.ok, `${tag}: урсгал дахин илгээх («${r.err}»)`);
  ok(!OPS.failedUsersOf('flow').includes(w), `${tag}: урсгал тэмдэг арилав`);
  eq(fake.json('__flow__:', w)?.stage, 'manager', `${tag}: ArcGIS урсгалын мөр`);
  await roundTrip();
  eq(FL.stageOfUser(w), 'manager', `${tag} remote: шат`);
  ok(views(w).includes('guitsetgel'), `${tag}: «Гүйцэтгэл» нээлттэй`);
  console.log('✅ §3 «Дахин илгээх» — унасан нэмэлт · унасан хасалт · урсгал');
}

/* ══════════ §4. Устгагдсан аккаунтын үлдэгдэл ══════════ */
{
  const tag = '§4';
  const ghost = 'rp_ghost_deleted';
  const G = (grants) => JSON.stringify({ roles: [...new Set(grants.map((g) => g.role))], bagts: [...new Set(grants.flatMap((g) => g.bagts))], grants });
  fake.seed([
    { username: `__huvaari__:${ghost}`, views: G([{ role: 'author', bagts: [g1] }]) },
    { username: `__flow__:${ghost}`, views: JSON.stringify({ stage: 'engineer', bagts: [g1] }) },
    { username: `__cap__:${ghost}`, views: JSON.stringify(['plan', 'zovshoorol', 'finRow']) },
  ]);
  await roundTrip();
  ok(!P.listUsers().some((x) => x.username.toLowerCase() === ghost), `${tag}: ghost порталд алга`);
  eq(OPS.goneRightsOf('huvaari', ['plan', 'planApprove']), [{ user: ghost, row: true, caps: ['plan'] }], `${tag}: хуваарийн хуудас`);
  eq(OPS.goneRightsOf('flow', []), [{ user: ghost, row: true, caps: [] }], `${tag}: урсгалын хуудас`);
  eq(OPS.goneRightsOf(null, ['zovshoorol']), [{ user: ghost, row: false, caps: ['zovshoorol'] }], `${tag}: зөвшөөрлийн хуудас (энгийн эрх)`);
  eq(OPS.goneRightsOf(null, ['gazar']), [], `${tag}: газрын хуудас — үлдэгдэлгүй`);
  eq(OPS.goneCleanupOp('huvaari', ['plan'], POOL[0]), null, `${tag}: порталд байгаа аккаунтад op алга`);

  let r = await run(OPS.goneCleanupOp('huvaari', ['plan', 'planApprove'], ghost));
  ok(r.ok && r.confirms.length === 0, `${tag}: нэг товшилтоор («${r.err}»)`);
  eq(fake.find(`__huvaari__:${ghost}`), [], `${tag}: хуваарийн мөр устав`);
  eq(sorted(fake.json('__cap__:', ghost)), ['finRow', 'zovshoorol'], `${tag}: зөвхөн ЭНЭ хуудасны эрх хасагдав`);
  r = await run(OPS.goneCleanupOp('flow', [], ghost));
  ok(r.ok, `${tag}: урсгал цэвэрлэх`);
  eq(fake.find(`__flow__:${ghost}`), [], `${tag}: урсгалын мөр устав`);
  r = await run(OPS.goneCleanupOp(null, ['finEdit', 'finRow'], ghost));
  ok(r.ok, `${tag}: санхүү цэвэрлэх`);
  r = await run(OPS.goneCleanupOp(null, ['zovshoorol'], ghost));
  ok(r.ok, `${tag}: зөвшөөрөл цэвэрлэх`);
  eq(fake.find(`__cap__:${ghost}`), [], `${tag}: бүх эрх арилж __cap__ мөр устав`);
  await roundTrip();
  eq(OPS.goneRightsOf('huvaari', ['plan', 'planApprove']), [], `${tag} remote: үлдэгдэлгүй`);
  eq(OPS.goneRightsOf(null, ['zovshoorol', 'finEdit', 'finRow']), [], `${tag} remote: энгийн эрхийн үлдэгдэлгүй`);
  console.log('✅ §4 устгагдсан аккаунтын үлдэгдэл — хуваарилалт · урсгал · энгийн эрх, хуудас бүрээр');
}

/* ══════════ §5. «Төрлөөр тохируулах» урсгалтай харагдацыг бичихгүй ══════════ */
{
  const tag = '§5';
  const u = mkUser();
  ok((await run(OPS.flowCellOp(u, 'engineer', g1, true))).ok, `${tag}: урсгал`);
  const res = await RTA.applyType(u, 'gazar'); await settle();
  ok(res.ok, `${tag}: applyType (${res.errors})`);
  await roundTrip();
  const stored = P.listUsers().find((x) => x.username === u).views;
  ok(!stored.some((v) => CAPS.WORKFLOW_VIEWS.includes(v)), `${tag}: хадгалалтад урсгалтай харагдац алга (${stored})`);
  ok(views(u).includes('guitsetgel'), `${tag}: томилгоогоор «Гүйцэтгэл» нээлттэй хэвээр`);
  console.log('✅ §5 «Төрлөөр тохируулах» — урсгалтай харагдац бичигдэхгүй, томилгоогоор нээлттэй');
}

eq(fake.unexpected, [], 'амьд сүлжээ рүү хүсэлт явах ёсгүй');
console.log(`✅ aclRepair: ${checks} шалгалт — бүгд давлаа`);
