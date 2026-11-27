/**
 * «ШИНЭ ЭРХ» БИЧИЛТИЙН ШАЛГУУР (2026-11-23) — хуурамч ArcGIS хүснэгт дээр (`aclE2E.fake.mjs`, сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/erhNewLive.check.mjs
 *
 *   1. Шинэ гүйцэтгэгч «Багц-3.1» — аккаунт → урсгал → хуваарь · нэмэлт ажил; дахин уншсаны дараа бодит мөр = ноорог;
 *      хуваарилалтаас гардаг эрх (plan · addRow) олгогдсон; урсгалын томилгоо албан үүрэг · харагдацыг ДАРААГҮЙ.
 *   2. Хоёр багцад инженер-хянагч (+ «хассан» харагдац) — урсгалын шат солигдож, хуучин хуваарийн эрх (plan) буцаагдана,
 *      хасагдсан харагдац эргэж ирэхгүй.
 *   3. Санхүүгийн ажилтан + IPC батлах — энгийн эрх ЗӨВХӨН нэмэгдэнэ, бусад админы эрх хэвээр.
 *   4. Өөрчлөлтгүй ноорог — бичих алхамгүй; аккаунт хасах — нэвтрэлт хаагдаж, бүх мөр цэвэрлэгдэнэ.
 */
import assert from 'node:assert/strict';
import { fake, settle } from './aclE2E.fake.mjs';

const SV = await import('@/lib/services.ts');
const SUPER = Object.entries(SV.ROLE_BY_USER).find(([, r]) => r === 'super')[0];
fake.owner = SUPER;

const P = await import('@/lib/permissions.ts');
const CAPS = await import('@/lib/caps.ts');
const OPS = await import('@/lib/aclOps.ts');
OPS.setHeldByReader(async () => []);
const FL = await import('@/lib/guitsetgelAcl.ts');
const HV = await import('@/lib/huvaariAcl.ts');
HV._setPlanOneRule(false);
const RT = await import('@/lib/roleTypes.ts');
const M = await import('@/lib/jobModel.ts');
const N = await import('@/lib/erhNew.ts');
const L = await import('@/lib/erhNewLive.ts');

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const POOL = ['nw_a', 'nw_b', 'nw_c', 'nw_d'];
fake.seed(POOL.map((u) => ({ username: u, role: 'taniltsah', views: JSON.stringify(['gdash']), docs: 0 })));
{
  const hvBase = RT._defaultTpl('taniltsah');
  fake.seed([{ username: '__type__:taniltsah', views: JSON.stringify({ ...hvBase, on: RT.withHvScope(hvBase.on, 'none'), seen: RT.tplSeenKeys() }) }]);
}
ok(await P.initRemote(false, true), 'initRemote');
await settle();
ok(OPS.allAclReady(), 'бүх хүснэгт уншигдсан');

const live = (u) => N.rightsOf(L.liveSnapshot(), u);
/** Ноорогийг самбар шиг хадгална: want → төлөвлөгөө → бичилт → дахин уншилт */
async function save(draft, isNew = false) {
  const have = live(draft.user);
  const want = N.wantOf(draft, have, isNew);
  const steps = N.writePlan(want, have, isNew);
  const res = await L.applyPlan(draft.user, steps);
  await settle();
  return { want, steps, res };
}

/* ══════════ 1. Шинэ гүйцэтгэгч «Багц-3.1» ══════════ */
{
  const u = 'nw_new.contractor';
  const draft = N.setBagts(N.setJob(N.newPerson(u), 'guitsetgegch'), ['Багц-3.1']);
  const { want, steps, res } = await save(draft, true);
  eq(steps.map((s) => s.kind), ['account', 'flow', 'acl', 'acl'], '§1 дараалал');
  ok(res.every((r) => r.ok), `§1 бүх алхам: ${JSON.stringify(res.map((r) => [r.step.kind, r.ok, r.error]))}`);
  ok(P.listUsers().some((x) => x.username.toLowerCase() === u), '§1 аккаунт үүссэн');
  eq(P.roleOf(u), 'guitsetgegch', '§1 албан үүрэг — урсгалын томилгоо дарсангүй');
  ok(M.sameRights(live(u), want), `§1 бодит = ноорог (${JSON.stringify(live(u))})`);
  eq(FL.stageOfUser(u), 'company', '§1 шат');
  ok(CAPS.capsOf(u).includes('plan') && CAPS.capsOf(u).includes('addRow'), `§1 хуваарилалтын эрх олгогдсон (${CAPS.capsOf(u)})`);
  ok(P.resolveAccess(u).views.includes('guitsetgel'), '§1 «Гүйцэтгэл» томилгооноос');
  ok(P.resolveAccess(u).views.includes('hyanaltHugatsaa'), '§1 «Хяналтын хугацаа» автоматаар');
  /* өөрчлөлтгүй — бичихгүй */
  const again = N.personRow(u, live(u)).person;
  eq(N.writePlan(N.wantOf(again, live(u), false), live(u), false), [], '§1 дахин хадгалахад алхамгүй');
}

/* ══════════ 2. Хоёр багцад инженер-хянагч ══════════ */
{
  const u = 'nw_new.contractor';
  let draft = N.personRow(u, live(u)).person;
  draft = N.setBagts(N.setJob(draft, 'injener'), ['Багц-1', 'Багц-2']);
  const tuh = N.baseItems(draft).find((i) => i.id === 'view:tuh');
  if (tuh) draft = N.dropBase(draft, tuh);
  const { want, res } = await save(draft);
  ok(res.every((r) => r.ok), `§2 бүх алхам: ${JSON.stringify(res.map((r) => [r.step.kind, r.ok, r.error]))}`);
  eq(P.roleOf(u), 'injener', '§2 албан үүрэг');
  eq(FL.stageOfUser(u), 'engineer', '§2 шат солигдов');
  eq(FL.bagtsFor(u, 'engineer'), ['Багц-1', 'Багц-2'], '§2 хоёр багц');
  ok(M.sameRights(live(u), want), '§2 бодит = ноорог');
  ok(!CAPS.capsOf(u).includes('plan'), `§2 хуваарийн эрх буцаагдсан (${CAPS.capsOf(u)})`);
  ok(CAPS.capsOf(u).includes('ajilApprove') && CAPS.capsOf(u).includes('obyemEdit'), '§2 инженерийн эрх');
  if (tuh) ok(!P.resolveAccess(u).views.includes('tuh'), '§2 хассан харагдац эргэж ирээгүй');
}

/* ══════════ 3. Санхүү + IPC батлах — бусад админы эрх хэвээр ══════════ */
{
  const u = 'nw_b';
  ok(await CAPS.setCaps(u, ['zovshoorol']), '§3 өөр админы олгосон эрх');
  await settle();
  let draft = N.setJob(N.personRow(u, live(u)).person, 'sanhuu');
  const { steps, res } = await save(draft);
  ok(res.every((r) => r.ok), '§3 бүх алхам');
  ok(steps.some((s) => s.kind === 'caps'), '§3 эрхийн алхам');
  ok(['finEdit', 'ipcApprove', 'ttbSwitch', 'ipcCreate'].every((c) => CAPS.capsOf(u).includes(c)), `§3 санхүүгийн эрх (${CAPS.capsOf(u)})`);
  ok(CAPS.capsOf(u).includes('zovshoorol'), '§3 «нэмсэн» эрх хэвээр (decompile)');
  /* IPC үүсгэхийг хасъя — «хассан» ялгаа */
  draft = N.personRow(u, live(u)).person;
  draft = N.dropBase(draft, N.baseItems(draft).find((i) => i.id === 'cap:ipcCreate'));
  const r2 = await save(draft);
  eq(r2.steps, [{ kind: 'caps', add: [], remove: ['ipcCreate'] }], '§3 зөвхөн нэг эрх хасагдана');
  ok(!CAPS.capsOf(u).includes('ipcCreate') && CAPS.capsOf(u).includes('ipcApprove'), '§3 IPC үүсгэх хасагдсан, батлах хэвээр');
  eq(N.personRow(u, live(u)).person.remove.filter(N.shown).length, 1, '§3 «хассан» ялгаа ил');
}

/* ══════════ 4. Аккаунт хасах ══════════ */
{
  const u = 'nw_new.contractor';
  const r = await L.removeAccount(u);
  await settle();
  ok(r.ok, `§4 хасагдсан (${r.error ?? ''})`);
  eq(P.hasAccess(u), false, '§4 нэвтрэлт хаагдсан');
  eq(FL.stageOfUser(u), null, '§4 урсгалын мөр алга');
  eq(CAPS.capsOf(u), [], '§4 эрх алга');
  ok(L.removedAccounts().includes(u), '§4 «Устгагдсан» жагсаалтад');
  ok(N.newNameError(u, P.listUsers().map((x) => x.username), L.removedAccounts()), '§4 ижил нэрээр шинэ хүн нэмэхгүй');
}

console.log(`✅ erhNewLive: ${checks} шалгалт — шинэ дэлгэцийн бичилт хуурамч хүснэгтэд`);
