/**
 * ЭРХИЙН ТОХИРГОО БҮРИЙН E2E ШАЛГУУР — хуурамч ArcGIS дээр (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/aclE2E.check.mjs
 *
 * ⚠️ ЯАГААД: хэрэглэгч «нэг багцаас хасахад бүх багцаас хасагдаж байна» гэж мэдээлэв.
 *    Одоогийн шалгуурууд (`aclGrid` · `guitsetgelGrid` · `aclParity`) цэвэр дүрэм ба
 *    локал төлөвийг шалгадаг — харин ЖИНХЭНЭ op-ыг (`aclOps`) `runOp`-оор ажиллуулж,
 *    ArcGIS-ийн мөр · эрх (`__cap__:`) · хүрээ (`*Scope`) · харагдац (`resolveAccess`)
 *    дөрвийг НЭГ ДОР, remote-оос дахин уншсаны ДАРАА ч шалгадаг шалгуур байгаагүй.
 *
 * ОРЧИН (`aclE2E.fake.mjs`): `Selbe_Permissions` хүснэгтийг санах ойд дуурайна
 *    (`FeatureLayer.queryFeatures/applyEdits` + `search`). АМЬД ArcGIS РУУ ЮУ Ч ЯВАХГҮЙ.
 *
 * ХЭСГҮҮД (даалгаврын дугаараар):
 *   §7  түгжээ — remote уншигдаагүй үед op татгалзана (эхэнд, `initRemote`-оос өмнө)
 *   §1  «бүх багц» / ил жагсаалт / сүүлийн багц — 5 систем × үүрэг бүр · 6 шат (2026-10-23: QAQC хасагдсан)
 *   §2  нэмэх — шинэ · байгаа · «бүх багц» (no-op) · шат шилжүүлэх · super татгалзал
 *   §3  нэг системд олон үүрэг · §4 хуваалцсан `chanarReview`
 *   §5  энгийн эрх (`capDirectOp`) · super-ийн хязгаарлалт · өнчин эрх
 *   §6  хэрэглэгчийн карт — үүрэг/харагдац · «Төрлөөр тохируулах» · устгах · сэргээх
 *   §7b зэрэг бичилт (алдагдалгүй) · бичилт унах
 *   §8  remote round-trip — §1–§7-ийн дараа бүр `initRemote`-оор дахин уншиж давтан шалгана
 *   §11 систем түр хаах (`__sys__:maintenance`, ⚠️ 2026-10-19) — хаах/нээх · хэн нэвтрэх · fail-open · эрхгүй бичилт
 * UI давхарга (✕ аль op-ыг ямар багц/үүргээр дууддаг вэ) — `src/modules/aclE2E.ui.check.mjs`.
 */
import assert from 'node:assert/strict';
import { fake, takeConfirms, settle, setConfirmAnswer } from './aclE2E.fake.mjs';

const SV = await import('@/lib/services.ts');
const { ROLE_BY_USER } = SV;
const SUPER = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'super')[0];
fake.owner = SUPER;

const P = await import('@/lib/permissions.ts');
const CAPS = await import('@/lib/caps.ts');
const OPS = await import('@/lib/aclOps.ts');
/* ⚠️ 2026-10-12 (CI уналт): `runOp`-ын pendingHeldBy амьд хүснэгт уншдаг — хуурамцаар (сүлжээгүй, шууд) */
OPS.setHeldByReader(async () => []);
const FL = await import('@/lib/guitsetgelAcl.ts');
/* ⚠️ 2026-10-23: QAQC хасагдсан */
const HV = await import('@/lib/huvaariAcl.ts');
const OB = await import('@/lib/obyemAcl.ts');
const AJ = await import('@/lib/ajilAcl.ts');
const CH = await import('@/lib/chanarAcl.ts');
const BT = await import('@/lib/butetsAcl.ts');
const RTA = await import('@/lib/roleTypeApply.ts');
const RT = await import('@/lib/roleTypes.ts');
const { ROLE_CAPS, PLAIN_CAPS } = await import('@/lib/aclRoleCaps.ts');
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');
const { BUTETS_PACKS } = await import('@/lib/butetsPacks.ts');
const { STAGE_ORDER } = await import('@/lib/hyanalt.ts');

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const sorted = (x) => [...x].sort();

/* ══════════ Аккаунтууд ══════════
 * ⚠️ Панелаас нэмсэн (хатуу жагсаалтад БАЙХГҮЙ) аккаунт — `role: taniltsah`, суурь харагдац
 *    `['gdash']`: урсгалтай харагдац (`WORKFLOW_VIEWS`) суурьт байхгүй тул эрхээр нээгдэж/
 *    хаагдахыг цэвэр ялгана. Хэрэглэгч бүр ТУСДАА (өмнөх хэсгийн үлдэгдэл нөлөөлөхгүй). */
const POOL = Array.from({ length: 120 }, (_, i) => `e2e_u${String(i + 1).padStart(3, '0')}`);
fake.seed(POOL.map((u) => ({ username: u, role: 'taniltsah', views: JSON.stringify(['gdash']), docs: 0 })));
let next = 0;
const mkUser = () => POOL[next++];

/** Op-ыг UI шиг ажиллуулна — асуултуудыг цуглуулж, бичилт дуустал хүлээнэ */
async function run(op, ready) {
  takeConfirms();
  let err = '';
  const res = await OPS.runOp(op, (m) => { err = m; }, ready);
  await settle();
  return { ok: res, err, confirms: takeConfirms() };
}
/** Remote-оос бүгдийг ДАХИН уншина (§8) — локал-зөвхөн төлөв энд алга болно */
async function roundTrip() {
  await settle();
  ok(await P.initRemote(false, true), 'initRemote хуурамч хүснэгтээс уншигдах ёстой');
  await settle();
}
/** verify-г одоо ба remote-оос дахин уншсаны дараа */
async function both(verify) { verify('локал'); await roundTrip(); verify('remote'); }

/* ══════════ Системийн тодорхойлолт ══════════ */
const SYS = {
  huvaari: { list: HV.listHuvaariAssigns, scope: HV.huvaariScope, prefix: '__huvaari__:', universe: PKG_GROUPS },
  obyem: { list: OB.listObyemAssigns, scope: OB.obyemScope, prefix: '__obyem__:', universe: PKG_GROUPS },
  ajil: { list: AJ.listAjilAssigns, scope: AJ.ajilScope, prefix: '__ajil__:', universe: PKG_GROUPS },
  chanar: { list: CH.listChanarAssigns, scope: CH.chanarScope, prefix: '__chanar__:', universe: PKG_GROUPS },
  butets: { list: BT.listButetsAssigns, scope: (u) => BT.butetsScope(u), prefix: '__butets__:', universe: BUTETS_PACKS.map((p) => p.key) },
};

/**
 * Үүргийн grant-ыг ЛОКАЛ жагсаалт · ArcGIS мөр · хүрээ (`scope`) гурвуулаас шалгана.
 * @param want `'*'` · багцын массив · `null` (тэр үүрэг алга)
 */
function grantIs(sys, u, role, want, tag) {
  const d = SYS[sys];
  const local = d.list().find((a) => a.user === u)?.grants.find((g) => g.role === role)?.bagts ?? null;
  const remote = fake.json(d.prefix, u)?.grants?.find((g) => g.role === role)?.bagts ?? null;
  const exp = want === '*' ? ['*'] : want;
  eq(local && sorted(local), exp && sorted(exp), `${tag} ${sys}.${role} ${u}: локал grant`);
  eq(remote && sorted(remote), exp && sorted(exp), `${tag} ${sys}.${role} ${u}: ArcGIS grant`);
  const sc = d.scope(u, role);
  if (want === '*') eq(sc, null, `${tag} ${sys}.${role}: scope = хязгааргүй`);
  else eq(sorted(sc), sorted(want ?? []), `${tag} ${sys}.${role}: scope`);
}
/** Мөр бүхэлдээ алга (локал + ArcGIS) */
function rowGone(sys, u, tag) {
  ok(!SYS[sys].list().some((a) => a.user === u), `${tag} ${sys} ${u}: локал мөр хасагдах ёстой`);
  eq(fake.find(SYS[sys].prefix + u), [], `${tag} ${sys} ${u}: ArcGIS мөр хасагдах ёстой`);
}
/** Эрх — `capsOf` (туг) ба ArcGIS `__cap__:` мөр */
function capIs(u, cap, on, tag) {
  eq(CAPS.capsOf(u).includes(cap), on, `${tag} ${u}: эрх ${cap} ${on ? 'байх' : 'хасагдах'} ёстой`);
  eq((fake.json('__cap__:', u) ?? []).includes(cap), on, `${tag} ${u}: ArcGIS __cap__ ${cap}`);
}
/** Эрхийн гэр харагдац нээлттэй/хаалттай — суурь ба БУСАД эрхээр нээгдсэнийг тооцно */
function hostIs(u, cap, on, tag) {
  const a = P.resolveAccess(u);
  const views = a ? a.views : [];
  const base = P.resolveBaseAccess(u)?.views ?? [];
  const others = new Set(CAPS.capsOf(u).filter((c) => c !== cap).flatMap((c) => CAPS.CAP_HOST_VIEW[c]));
  for (const v of CAPS.CAP_HOST_VIEW[cap]) {
    if (on) ok(views === 'all' || views.includes(v), `${tag} ${u}: «${v}» харагдац нээгдэх ёстой (${cap})`);
    else if (base !== 'all' && !base.includes(v) && !others.has(v)) {
      ok(views !== 'all' && !views.includes(v), `${tag} ${u}: «${v}» харагдац хаагдах ёстой (${cap})`);
    }
  }
}

/* ══════════ §7. ТҮГЖЭЭ — remote уншигдаагүй үед ══════════ */
{
  eq(OPS.allAclReady(), false, 'эхэндээ түгжээтэй');
  const u = POOL[POOL.length - 1];
  const before = fake.edits;
  for (const op of [
    OPS.scopedCellOp('huvaari', u, 'author', PKG_GROUPS[0], true),
    OPS.flowCellOp(u, 'engineer', PKG_GROUPS[0], true),
    OPS.capDirectOp(u, 'zovshoorol', true),
  ]) {
    if (!op) continue; // capDirectOp: `capsOf` хоосон тул on=true → op байна
    const r = await run(op);
    eq(r.ok, false, '§7 түгжээтэй үед бичихгүй');
    eq(r.err, OPS.lockMsg(), '§7 түгжээний зурвас');
  }
  eq(fake.edits, before, '§7 ArcGIS-т нэг ч бичилт явах ёсгүй');
  /* Панелийн 3 тугтай түгжээ ч мөн (`ready` параметр) */
  const r = await run(OPS.scopedCellOp('obyem', u, 'editor', PKG_GROUPS[0], true), () => false);
  eq(r.ok, false, '§7 панелийн ready=false');
  console.log('✅ §7 түгжээ: remote уншигдаагүй үед 5 op татгалзав, ArcGIS хөндөгдөөгүй');
}

await roundTrip();
ok(OPS.allAclReady(), 'initRemote-ийн дараа бүх 9 туг бэлэн');
ok(P.listUsers().some((x) => x.username === POOL[0]), 'хуурамч хүснэгтийн аккаунт жагсаалтад');

/* ══════════ §1. НЭГ БАГЦААС ХАСАХ — ҮЛДСЭН БАГЦУУД ХЭВЭЭР (мэдээлсэн алдаа) ══════════ */
let s1 = 0;
for (const [sys, d] of Object.entries(SYS)) {
  for (const role of Object.keys(ROLE_CAPS[sys])) {
    const cap = ROLE_CAPS[sys][role];
    const tag = `§1 ${sys}.${role}`;
    const U = d.universe;
    const px = U[Math.min(2, U.length - 1)];
    const rest = U.filter((x) => x !== px);

    /* (а) «Бүх багц»-тай → нэг багцаас хасах → бусад БҮХ багц ил жагсаалтаар үлдэнэ */
    const ua = mkUser();
    let r = await run(OPS.setRoleAllOp(sys, ua, role));
    ok(r.ok, `${tag}: «бүх багц» олгох`);
    grantIs(sys, ua, role, '*', tag);
    capIs(ua, cap, true, tag);
    /* «Цуцлах» → юу ч бичихгүй («бүх багц» хэвээр) */
    if (sys !== 'butets') {
      const before = fake.edits;
      setConfirmAnswer(false);
      r = await run(OPS.scopedCellOp(sys, ua, role, px, false));
      setConfirmAnswer(true);
      eq(r.ok, false, `${tag}: цуцалбал false`);
      eq(fake.edits, before, `${tag}: цуцалбал ArcGIS хөндөхгүй`);
      grantIs(sys, ua, role, '*', `${tag} цуцалсны дараа`);
    }
    r = await run(OPS.scopedCellOp(sys, ua, role, px, false));
    ok(r.ok, `${tag}: нэг багцаас хасах`);
    eq(r.confirms.length, sys === 'butets' ? 0 : 1, `${tag}: «бүх багц» → ил жагсаалт асуулт`);
    if (sys !== 'butets') ok(/ил жагсаалт/.test(r.confirms[0]) && !/БҮХЭЛД/.test(r.confirms[0]), `${tag}: асуулт нь «бүхэлд нь хасах» БИШ`);
    await both((w) => {
      grantIs(sys, ua, role, rest, `${tag} ${w} [бүх→${rest.length}]`);
      ok(!d.scope(ua, role).includes(px), `${tag} ${w}: хассан багц хүрээнд үлдэхгүй`);
      capIs(ua, cap, true, `${tag} ${w}`);
      hostIs(ua, cap, true, `${tag} ${w}`);
    });

    /* (б) ил [P1, P2] → P1 хасах → [P2] */
    const ub = mkUser();
    const [p1, p2] = U;
    ok((await run(OPS.scopedCellOp(sys, ub, role, p1, true))).ok, `${tag}: P1 нэмэх`);
    r = await run(OPS.scopedCellOp(sys, ub, role, p2, true));
    ok(r.ok && r.confirms.length === 0, `${tag}: P2 нэмэх асуулгагүй`);
    grantIs(sys, ub, role, [p1, p2], tag);
    r = await run(OPS.scopedCellOp(sys, ub, role, p1, false));
    ok(r.ok && r.confirms.length === 0, `${tag}: P1 хасах асуулгагүй`);
    await both((w) => {
      grantIs(sys, ub, role, [p2], `${tag} ${w} [P1,P2]→[P2]`);
      capIs(ub, cap, true, `${tag} ${w}`);
      hostIs(ub, cap, true, `${tag} ${w}`);
    });

    /* (в) сүүлийн багц → мөр бүхэлдээ хасагдана, эрх буцна, харагдац хаагдана */
    r = await run(OPS.scopedCellOp(sys, ub, role, p2, false));
    ok(r.ok, `${tag}: сүүлийн багц хасах`);
    eq(r.confirms.length, 1, `${tag}: сүүлийн багц → бүтэн хасалтын асуулт`);
    await both((w) => {
      rowGone(sys, ub, `${tag} ${w}`);
      eq(d.scope(ub, role), [], `${tag} ${w}: хүрээ хоосон (fail-closed, «бүх багц» руу буцахгүй)`);
      capIs(ub, cap, false, `${tag} ${w}`);
      hostIs(ub, cap, false, `${tag} ${w}`);
    });

    s1 += 1;
  }
}
console.log(`✅ §1 үүрэгтэй 5 систем × ${s1} үүрэг: «бүх багц»-аас нэгийг хасахад бусад нь ил жагсаалтаар үлдэв; [P1,P2]→[P2]; сүүлийнх → мөр · эрх · харагдац хасагдав; round-trip тэнцүү`);

/* ⚠️ 2026-10-23: QAQC хасагдсан */

/* §1 Гүйцэтгэлийн урсгал — 6 шат */
{
  const px = PKG_GROUPS[2];
  const rest = PKG_GROUPS.filter((x) => x !== px);
  const fIs = (u, stage, want, t) => {
    const local = FL.listAssigns().find((a) => a.user === u);
    const remote = fake.json('__flow__:', u);
    if (want === null) {
      eq(local, undefined, `${t} ${u}: локал томилгоо алга`);
      eq(remote, undefined, `${t} ${u}: ArcGIS томилгоо алга`);
      eq(FL.stageOfUser(u), null, `${t}: шатгүй`);
      return;
    }
    eq(local?.stage, stage, `${t}: локал шат`);
    eq(remote?.stage, stage, `${t}: ArcGIS шат`);
    eq(sorted(local.bagts), sorted(want), `${t}: локал багц`);
    eq(sorted(remote.bagts), sorted(want), `${t}: ArcGIS багц`);
    const b = FL.bagtsFor(u, stage);
    eq(b === null ? null : sorted(b), want.includes('*') ? null : sorted(want), `${t}: bagtsFor`);
  };
  const guits = (u) => { const a = P.resolveAccess(u); return !!a && (a.views === 'all' || a.views.includes('guitsetgel')); };
  for (const stage of STAGE_ORDER) {
    const tag = `§1 flow.${stage}`;
    const ua = mkUser();
    let r = await run(OPS.flowStageOp(ua, stage));
    ok(r.ok, `${tag}: «бүх багц» томилох`);
    fIs(ua, stage, ['*'], tag);
    ok(guits(ua), `${tag}: «Гүйцэтгэл» нээгдэнэ`);
    r = await run(OPS.flowCellOp(ua, stage, px, false));
    ok(r.ok && r.confirms.length === 1 && /ил жагсаалт/.test(r.confirms[0]), `${tag}: ил жагсаалт асуулт`);
    await both((t) => { fIs(ua, stage, rest, `${tag} ${t}`); ok(guits(ua), `${tag} ${t}: «Гүйцэтгэл» хэвээр`); });

    const ub = mkUser();
    ok((await run(OPS.flowCellOp(ub, stage, PKG_GROUPS[0], true))).ok, `${tag}: P1`);
    ok((await run(OPS.flowCellOp(ub, stage, PKG_GROUPS[1], true))).ok, `${tag}: P2`);
    r = await run(OPS.flowCellOp(ub, stage, PKG_GROUPS[0], false));
    ok(r.ok && r.confirms.length === 0, `${tag}: P1 хасах асуулгагүй`);
    await both((t) => fIs(ub, stage, [PKG_GROUPS[1]], `${tag} ${t}`));
    r = await run(OPS.flowCellOp(ub, stage, PKG_GROUPS[1], false));
    ok(r.ok && r.confirms.length === 1, `${tag}: сүүлийн багц → асууна`);
    await both((t) => { fIs(ub, stage, null, `${tag} ${t}`); ok(!guits(ub), `${tag} ${t}: «Гүйцэтгэл» хаагдана`); });
  }
  console.log('✅ §1 урсгалын 6 шат: «бүх багц»-аас нэгийг хасахад бусад нь үлдэв; сүүлийнх → томилгоо · «Гүйцэтгэл» хаагдав');
}

/* ══════════ §2. НЭМЭХ ══════════ */
{
  const tag = '§2';
  const [p1, p2, p3] = PKG_GROUPS;
  /* шинэ аккаунт → эрх олгоно, харагдац нээгдэнэ */
  const u = mkUser();
  let r = await run(OPS.scopedCellOp('obyem', u, 'approver', p1, true));
  ok(r.ok && r.confirms.length === 0, `${tag}: шинэ мөр асуулгагүй`);
  grantIs('obyem', u, 'approver', [p1], tag);
  capIs(u, 'obyemApprove', true, tag);
  hostIs(u, 'obyemApprove', true, tag);
  /* байгаа аккаунт, ижил үүрэг → багц нэмэгдэнэ */
  r = await run(OPS.scopedCellOp('obyem', u, 'approver', p2, true));
  ok(r.ok && r.confirms.length === 0, `${tag}: байгаа мөрөнд багц нэмэх`);
  await both((w) => grantIs('obyem', u, 'approver', [p1, p2], `${tag} ${w}`));
  /* «бүх багц»-тай → нэмэх нь no-op (хумигдахгүй) */
  const ua = mkUser();
  await run(OPS.setRoleAllOp('huvaari', ua, 'approver'));
  eq(OPS.scopedCellOp('huvaari', ua, 'approver', p3, true), null, `${tag}: «бүх багц»-тай → null`);
  grantIs('huvaari', ua, 'approver', '*', tag);
  /* ⚠️ 2026-10-23: QAQC хасагдсан */
  /* урсгал: өөр шатанд байгаа → шилжүүлэх асуулт, хуучин багц ба «Зөвхөн харна» арилна */
  const uf = mkUser();
  await run(OPS.flowCellOp(uf, 'engineer', p1, true));
  await run(OPS.flowCellOp(uf, 'engineer', p2, true));
  r = await run(OPS.flowViewOnlyOp(uf, true));
  ok(r.ok && FL.isViewOnly(uf) && fake.json('__flow__:', uf).viewOnly === true, `${tag}: «Зөвхөн харна» ArcGIS-т`);
  r = await run(OPS.flowCellOp(uf, 'manager', p3, true));
  ok(r.ok && r.confirms.length === 1 && /шилжүүлэх/.test(r.confirms[0]), `${tag}: шат шилжүүлэх асуулт`);
  await both((w) => {
    eq(FL.stageOfUser(uf), 'manager', `${tag} ${w}: шинэ шат`);
    eq(FL.bagtsFor(uf, 'manager'), [p3], `${tag} ${w}: зөвхөн шинэ багц`);
    eq(FL.bagtsFor(uf, 'engineer'), [], `${tag} ${w}: хуучин шатны багц арилна`);
    eq(FL.isViewOnly(uf), false, `${tag} ${w}: «Зөвхөн харна» арилна`);
  });
  /* «Цуцлах» → шилжихгүй */
  setConfirmAnswer(false);
  r = await run(OPS.flowCellOp(uf, 'director', p1, true));
  setConfirmAnswer(true);
  ok(!r.ok && FL.stageOfUser(uf) === 'manager', `${tag}: цуцалбал шат хэвээр`);
  /* урсгал: «бүх багц»-тай шатанд нэмэх → null */
  const ufa = mkUser();
  await run(OPS.flowStageOp(ufa, 'director'));
  eq(OPS.flowCellOp(ufa, 'director', p1, true), null, `${tag}: урсгал «бүх багц» → null`);
  /* super — хуваарилалт татгалзана (хязгаар үйлчилдэггүй) */
  for (const op of [
    OPS.scopedCellOp('chanar', SUPER, 'author', p1, true),
    OPS.flowCellOp(SUPER, 'engineer', p1, true),
  ]) {
    r = await run(op);
    ok(!r.ok && /super/i.test(r.err), `${tag}: super-т хуваарилахгүй («${r.err}»)`);
  }
  ok(!CH.listChanarAssigns().some((a) => a.user === SUPER.toLowerCase()), `${tag}: super мөр үүсээгүй`);
  console.log('✅ §2 нэмэх: шинэ (эрх+харагдац) · байгаа · «бүх багц» no-op · шат шилжүүлэх (асуулт, «Зөвхөн харна» арилна) · super татгалзал');
}

/* ══════════ §3. НЭГ СИСТЕМД ОЛОН ҮҮРЭГ ══════════ */
{
  const tag = '§3';
  const [p1, p2] = PKG_GROUPS;
  const u = mkUser();
  await run(OPS.scopedCellOp('ajil', u, 'editor', p1, true));
  await run(OPS.scopedCellOp('ajil', u, 'approver', p2, true));
  capIs(u, 'addRow', true, tag);
  capIs(u, 'ajilApprove', true, tag);
  eq(AJ.ajilScope(u, 'approver'), [p2], `${tag}: батлагчийн хүрээ зөвхөн P2 (үржвэргүй)`);
  const r = await run(OPS.scopedCellOp('ajil', u, 'approver', p2, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: нэг үүргийн сүүлийн багц — мөр үлдэх тул асуулгагүй`);
  await both((w) => {
    grantIs('ajil', u, 'editor', [p1], `${tag} ${w}`);
    grantIs('ajil', u, 'approver', null, `${tag} ${w}`);
    capIs(u, 'addRow', true, `${tag} ${w}`);
    capIs(u, 'ajilApprove', false, `${tag} ${w}`);
    hostIs(u, 'ajilApprove', false, `${tag} ${w}`);
    hostIs(u, 'addRow', true, `${tag} ${w}`);
  });
  /* хуваарь: зохиогч + батлагч нэг багцад → зохиогчийг хасахад батлагч + «Хуваарь» харагдац үлдэнэ */
  const h = mkUser();
  await run(OPS.scopedCellOp('huvaari', h, 'author', p1, true));
  await run(OPS.scopedCellOp('huvaari', h, 'approver', p1, true));
  await run(OPS.scopedCellOp('huvaari', h, 'author', p1, false));
  await both((w) => {
    grantIs('huvaari', h, 'approver', [p1], `${tag} ${w}`);
    capIs(h, 'plan', false, `${tag} ${w}`);
    capIs(h, 'planApprove', true, `${tag} ${w}`);
    hostIs(h, 'planApprove', true, `${tag} ${w}`);
  });
  console.log('✅ §3 олон үүрэг: нэг үүргийг хасахад нөгөө үүрэг ба эрх нь хэвээр, хассан үүргийн эрх л буцав');
}

/* ══════════ §4. ХУВААЛЦСАН ЭРХ — `chanarReview` (5 хянагч) ══════════ */
{
  const tag = '§4';
  const [p1, p2] = PKG_GROUPS;
  const u = mkUser();
  await run(OPS.scopedCellOp('chanar', u, 'tuh', p1, true));
  await run(OPS.scopedCellOp('chanar', u, 'habea', p2, true));
  await run(OPS.scopedCellOp('chanar', u, 'tuh', p1, false));
  await both((w) => {
    grantIs('chanar', u, 'habea', [p2], `${tag} ${w}`);
    capIs(u, 'chanarReview', true, `${tag} ${w} (өөр хянагч үүрэг үлдсэн)`);
    hostIs(u, 'chanarReview', true, `${tag} ${w}`);
  });
  const r = await run(OPS.scopedCellOp('chanar', u, 'habea', p2, false));
  ok(r.ok && r.confirms.length === 1, `${tag}: сүүлийн grant → бүтэн хасалт`);
  await both((w) => { rowGone('chanar', u, `${tag} ${w}`); capIs(u, 'chanarReview', false, `${tag} ${w}`); });
  /* зохиогч + хянагч → хянагчийг хасахад зохиогчийн эрх ба «Чанарын баримт» харагдац үлдэнэ */
  const a = mkUser();
  await run(OPS.scopedCellOp('chanar', a, 'author', p1, true));
  await run(OPS.scopedCellOp('chanar', a, 'cheng', p2, true));
  await run(OPS.scopedCellOp('chanar', a, 'cheng', p2, false));
  await both((w) => {
    capIs(a, 'chanarAuthor', true, `${tag} ${w}`);
    capIs(a, 'chanarReview', false, `${tag} ${w}`);
    hostIs(a, 'chanarAuthor', true, `${tag} ${w}`);
  });
  /* тав бүгд «бүх багц» → нэгээс нь нэг багц хасах → бусад дөрөв «бүх багц» хэвээр */
  const all5 = mkUser();
  for (const role of CH.CHANAR_REVIEWERS) await run(OPS.setRoleAllOp('chanar', all5, role));
  await run(OPS.scopedCellOp('chanar', all5, 'tug', p1, false));
  await both((w) => {
    for (const role of CH.CHANAR_REVIEWERS) {
      grantIs('chanar', all5, role, role === 'tug' ? PKG_GROUPS.filter((x) => x !== p1) : '*', `${tag} ${w}`);
    }
    capIs(all5, 'chanarReview', true, `${tag} ${w}`);
  });
  /* нэг хянагч үүргийг бүх багцаас (dropRoleOp) → бусад хянагч үлдэх тул эрх хэвээр */
  await run(OPS.dropRoleOp('chanar', all5, 'tuh'));
  await both((w) => { grantIs('chanar', all5, 'tuh', null, `${tag} ${w}`); capIs(all5, 'chanarReview', true, `${tag} ${w}`); });
  console.log('✅ §4 chanarReview: нэг хянагч үүрэг хасагдахад өөр хянагч үүрэг үлдсэн бол эрх хэвээр; сүүлийнх → буцав');
}

/* ══════════ §5. ЭНГИЙН ЭРХ — `capDirectOp` ══════════ */
{
  const tag = '§5';
  for (const cap of PLAIN_CAPS) {
    const u = mkUser();
    let r = await run(OPS.capDirectOp(u, cap, true));
    ok(r.ok && r.confirms.length === 0, `${tag} ${cap}: олгох асуулгагүй`);
    await both((w) => { capIs(u, cap, true, `${tag} ${w}`); hostIs(u, cap, true, `${tag} ${w}`); });
    eq(OPS.capDirectOp(u, cap, true), null, `${tag} ${cap}: давхар олгох → null`);
    r = await run(OPS.capDirectOp(u, cap, false));
    ok(r.ok && r.confirms.length === 1, `${tag} ${cap}: хасах асууна`);
    await both((w) => { capIs(u, cap, false, `${tag} ${w}`); hostIs(u, cap, false, `${tag} ${w}`); });
  }
  /* санхүү: утга + мөр → нэгийг хасахад «Санхүү» харагдац нөгөөгөөр нээлттэй */
  const f = mkUser();
  await run(OPS.capDirectOp(f, 'finEdit', true));
  await run(OPS.capDirectOp(f, 'finRow', true));
  await run(OPS.capDirectOp(f, 'finEdit', false));
  await both((w) => { capIs(f, 'finRow', true, `${tag} ${w}`); hostIs(f, 'finRow', true, `${tag} ${w}`); });
  /* гаргалгаатай эрхийг super-ээс бусдад шууд олгохгүй */
  const x = mkUser();
  const deny = OPS.capDirectOp(x, 'plan', true);
  ok(deny && 'error' in deny, `${tag}: гаргалгаатай эрх → татгалзал`);
  const rd = await run(deny);
  ok(!rd.ok && /багц/.test(rd.err), `${tag}: татгалзлын зурвас`);
  capIs(x, 'plan', false, tag);
  /* ⚠️ 2026-10-12: super БҮХ эрхтэй тохиргоогүйгээр — олгох no-op, хасах татгалзана, __cap__ мөр бичигдэхгүй */
  ok(OPS.capDirectOp(SUPER, 'planApprove', true) === null, `${tag}: super-т олгох — no-op`);
  const sd = OPS.capDirectOp(SUPER, 'planApprove', false);
  ok(sd && 'error' in sd && /super/i.test(sd.error), `${tag}: super-ээс хасах — татгалзал`);
  ok(Object.keys(CAPS.CAP_HOST_VIEW).every((c) => CAPS.capsOf(SUPER).includes(c)), `${tag}: super бүх эрхтэй`);
  ok(CAPS.hasCap(SUPER, 'planApprove') && CAPS.hasCap(SUPER, 'finRow'), `${tag}: super hasCap`);
  ok((fake.json('__cap__:', SUPER.toLowerCase()) ?? []).length === 0, `${tag}: super-т __cap__ мөр бичигдээгүй`);
  let r;
  /* өнчин гаргалгаатай эрх (хуваарилалтгүй) — ХАСАХ нь зөвшөөрөгдөнө */
  const o = mkUser();
  await CAPS.setCaps(o, ['addRow']); await settle();
  r = await run(OPS.capDirectOp(o, 'addRow', false));
  /* ⚠️ 2026-10-19: мөр нэмэх «Хуваарь»-д (`CAP_HOST_VIEW.addRow`) — асуулт тэр хуудсыг нэрлэнэ */
  ok(r.ok && /Хуваарь/.test(r.confirms[0]), `${tag}: addRow-ийн тусгай асуулт`);
  await both((w) => capIs(o, 'addRow', false, `${tag} ${w}`));
  console.log(`✅ §5 энгийн ${PLAIN_CAPS.length} эрх олгох/хасах · харагдац нээх/хаах · санхүүгийн хуваалцсан харагдац · super · өнчин эрх`);
}

/* ══════════ §6. ХЭРЭГЛЭГЧИЙН КАРТ ══════════ */
{
  const tag = '§6';
  const [p1] = PKG_GROUPS;
  /* Бүх төрлийн хуваарилалттай хүн */
  const u = mkUser();
  await run(OPS.flowCellOp(u, 'engineer', p1, true));
  await run(OPS.scopedCellOp('huvaari', u, 'author', p1, true));
  await run(OPS.scopedCellOp('butets', u, 'editor', BUTETS_PACKS[0].key, true));
  await run(OPS.capDirectOp(u, 'gazar', true));
  const acl = () => fake.rows.filter((r) => r.username.startsWith('__') && r.username.endsWith(`:${u}`))
    .map((r) => `${r.username}=${r.views}`).sort();
  const aclBefore = acl();
  const capsBefore = sorted(CAPS.capsOf(u));
  const stored = () => P.listUsers().find((x) => x.username.toLowerCase() === u).views;
  ok(stored().includes('guitsetgel'), `${tag}: урсгалын шат «Гүйцэтгэл»-ийг хадгалсан`);

  /* «Төрлөөр тохируулах» — зөвхөн харах тохиргоо; эрх/хуваарилалт/урсгалтай харагдац хөндөхгүй */
  ok(RT.typesReady(), `${tag}: загвар уншигдсан`);
  let res = await RTA.applyType(u, 'gazar'); await settle();
  ok(res.ok, `${tag}: applyType (${res.errors})`);
  await both((w) => {
    eq(acl(), aclBefore, `${tag} ${w}: applyType хуваарилалт/эрхийн мөр хөндөхгүй`);
    eq(sorted(CAPS.capsOf(u)), capsBefore, `${tag} ${w}: applyType эрх хөндөхгүй`);
    /* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): урсгалтай харагдац ЗӨВХӨН хуваарилалтаар —
       applyType тэдгээрийг БИЧИХГҮЙ, харин урсгалын томилгоогоор «Гүйцэтгэл» нээлттэй хэвээр */
    ok(!stored().some((v) => CAPS.WORKFLOW_VIEWS.includes(v)), `${tag} ${w}: урсгалтай харагдац хадгалагдахгүй`);
    ok(P.resolveAccess(u).views.includes('guitsetgel'), `${tag} ${w}: томилгоогоор «Гүйцэтгэл» нээлттэй`);
    eq(P.roleOf(u), 'gazar', `${tag} ${w}: үүрэг солигдоно`);
    eq(FL.stageOfUser(u), 'engineer', `${tag} ${w}: урсгалын шат хэвээр`);
    for (const v of RT.roleAccess('gazar').views) ok(P.resolveAccess(u).views.includes(v), `${tag} ${w}: загварын «${v}»`);
  });
  /* ⚠️ 2026-10-21 (хэрэглэгчийн шийдвэр): SUPER = эрхийн тохиргоо — super админ л олгоно/хасна (нэвтэрсэн хэрэглэгч
     тодорхойгүй бол татгалзана); кодын (тестийн) super доошлохгүй; өөрийн super-ийг өөрөө хасахгүй */
  const WHO6 = await import('@/lib/who.ts');
  res = await RTA.applyType(u, 'super');
  ok(!res.ok, `${tag}: нэвтэрсэн super админгүй — super олгохгүй`);
  WHO6.setCurrentUser(SUPER);
  res = await RTA.applyType(u, 'super'); await settle();
  ok(res.ok, `${tag}: super админ super олгоно (${res.errors})`);
  await both((w) => {
    eq(SV.roleForUser(u), 'super', `${tag} ${w}: хүснэгтийн role:super мөр → super`);
    eq(P.roleOf(u), 'super', `${tag} ${w}: roleOf super`);
    eq(P.resolveAccess(u).views, 'all', `${tag} ${w}: бүх харагдац`);
    ok(P.listUsers().some((x) => x.username.toLowerCase() === u && x.role === 'super' && x.views === 'all' && !x.overridden), `${tag} ${w}: самбарт super мөр`);
    ok(CAPS.capsOf(u).includes('plan') && CAPS.capsOf(u).includes('sysClose'), `${tag} ${w}: super бүх эрхтэй`);
  });
  res = await RTA.applyType(SUPER, 'injener');
  ok(!res.ok, `${tag}: кодын (тестийн) super-ийг доошлуулахгүй`);
  WHO6.setCurrentUser(u);
  res = await RTA.applyType(u, 'gazar');
  ok(!res.ok, `${tag}: өөрийн super-ийг өөрөө хасахгүй`);
  WHO6.setCurrentUser(SUPER);
  res = await RTA.applyType(u, 'gazar'); await settle();
  ok(res.ok, `${tag}: өөр super админ хасна (${res.errors})`);
  await both((w) => {
    eq(SV.roleForUser(u), null, `${tag} ${w}: super хасагдсан`);
    eq(P.roleOf(u), 'gazar', `${tag} ${w}: үүрэг gazar`);
    eq(FL.stageOfUser(u), 'engineer', `${tag} ${w}: урсгалын шат хэвээр`);
  });
  WHO6.setCurrentUser(null);

  /* Карт «Хадгалах» (харагдац/үүрэг) — `permissions.setUser`: урсгалтай харагдацыг
     картаас засдаггүй (`UserAdmin.TOGGLE_KEYS`); эрхээр нээгдсэн нь хадгалалтаас үл хамаарна */
  const views = stored().filter((v) => v !== 'gdash');
  ok(await P.setUser(u, { views, docs: false }, 'taniltsah'), `${tag}: setUser`);
  await both((w) => {
    ok(!P.resolveAccess(u).views.includes('gdash'), `${tag} ${w}: картаас хаасан харагдац хаагдана`);
    ok(P.resolveAccess(u).views.includes('huvaari'), `${tag} ${w}: «plan» эрхийн «Хуваарь» хадгалалтаас үл хамааран нээлттэй`);
    eq(acl(), aclBefore, `${tag} ${w}: setUser хуваарилалт хөндөхгүй`);
  });

  /* УСТГАХ — `UserAdmin.saveAll`-ийн `remove` салааны ЯГ дараалал */
  const del = async (name) => {
    const rs = [
      await FL.purgeAssign(name), await HV.purgeHuvaariAssign(name),
      await OB.purgeObyemAssign(name), await CH.purgeChanarAssign(name), await AJ.purgeAjilAssign(name),
      await BT.purgeButetsAssign(name), await CAPS.setCaps(name, []), await P.removeUser(name),
    ];
    await settle();
    return rs.every(Boolean);
  };
  ok(await del(u), `${tag}: устгах бүх бичилт амжилттай`);
  await both((w) => {
    eq(acl(), [], `${tag} ${w}: устгасан аккаунтын хуваарилалт/эрхийн мөр үлдэхгүй`);
    eq(CAPS.capsOf(u), [], `${tag} ${w}: эрх алга`);
    eq(P.hasAccess(u), false, `${tag} ${w}: нэвтрэхгүй`);
    ok(!P.listUsers().some((x) => x.username.toLowerCase() === u), `${tag} ${w}: жагсаалтаас хасагдана`);
    eq(FL.stageOfUser(u), null, `${tag} ${w}: урсгалгүй`);
  });
  /* Хатуу жагсаалтын аккаунт → tombstone; «Буцаах» → хатуу суурь, хуучин эрх ЭРГЭЖ ИРЭХГҮЙ */
  /* ⚠️ 2026-10-19: кодод урсгалын (жишээ) аккаунт алга — урсгалын бус хатуу аккаунт (`tolovlolt`) */
  const hard = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'tolovlolt')[0];
  await run(OPS.flowCellOp(hard, 'manager', p1, true));
  await run(OPS.scopedCellOp('obyem', hard, 'editor', p1, true));
  ok(await del(hard), `${tag}: хатуу аккаунт устгах`);
  await both((w) => {
    eq(P.hasAccess(hard), false, `${tag} ${w}: tombstone — нэвтрэхгүй`);
    ok(P.listRemoved().includes(hard), `${tag} ${w}: «Устгагдсан» жагсаалтад`);
    eq(fake.find(hard)[0]?.views, 'removed', `${tag} ${w}: ArcGIS tombstone`);
  });
  eq(OPS.flowCellOp(hard, 'manager', p1, true) !== null, true, `${tag}: (устгагдсан) — op бүтнэ`);
  const rt = await run(OPS.flowCellOp(hard, 'manager', p1, true));
  ok(!rt.ok || FL.stageOfUser(hard) === null, `${tag}: устгагдсан аккаунтыг урсгалд томилохгүй`);
  await settle();
  /* ⚠️ 2026-10-11 (аудит №7): tombstone-ыг зөвхөн «Буцаах» (`revive`) арилгана — энгийн clear татгалзана */
  eq(await P.clearOverride(hard), false, `${tag}: энгийн clearOverride tombstone-ыг арчихгүй`);
  eq(fake.find(hard)[0]?.views, 'removed', `${tag}: ArcGIS tombstone хэвээр`);
  ok(await P.clearOverride(hard, { revive: true }), `${tag}: сэргээх («Буцаах»)`);
  ok(await FL.regrantFlowAccess(hard), `${tag}: regrant`);
  await both((w) => {
    eq(P.hasAccess(hard), true, `${tag} ${w}: сэргээсний дараа нэвтэрнэ`);
    eq(FL.stageOfUser(hard), null, `${tag} ${w}: хуучин шат эргэж ирэхгүй`);
    eq(OB.obyemScope(hard, 'editor'), [], `${tag} ${w}: хуучин обьём эргэж ирэхгүй`);
    eq(CAPS.capsOf(hard), [], `${tag} ${w}: хуучин эрх эргэж ирэхгүй`);
    eq(P.roleOf(hard), 'tolovlolt', `${tag} ${w}: хатуу суурь үүрэг`);
  });
  console.log('✅ §6 карт: applyType хуваарилалт/эрх/урсгалтай харагдац хөндөөгүй · setUser эрхийн харагдацыг хаадаггүй · устгах (7 purge + эрх) · tombstone · сэргээх');
}

/* ══════════ §7b. ЗЭРЭГ БИЧИЛТ · УНАСАН БИЧИЛТ ══════════ */
{
  const tag = '§7b';
  const [p1, p2, p3] = PKG_GROUPS;
  fake.latency = 25;
  /* нэг аккаунт, нэг систем — хоёр товшилт дараалан (op нь дарах агшинд бүтнэ) */
  const u = mkUser();
  const a = OPS.runOp(OPS.scopedCellOp('huvaari', u, 'approver', p1, true), () => {});
  const b = OPS.runOp(OPS.scopedCellOp('huvaari', u, 'approver', p2, true), () => {});
  const c = OPS.runOp(OPS.scopedCellOp('huvaari', u, 'approver', p3, true), () => {});
  eq(await Promise.all([a, b, c]), [true, true, true], `${tag}: гурвуулаа амжилттай`);
  await settle();
  /* нэг аккаунт, ӨӨР системүүд зэрэг — эрхийн жагсаалт (`__cap__:`) алдагдахгүй */
  const v = mkUser();
  const all = await Promise.all([
    OPS.runOp(OPS.scopedCellOp('obyem', v, 'editor', p1, true), () => {}),
    OPS.runOp(OPS.scopedCellOp('ajil', v, 'approver', p1, true), () => {}),
    OPS.runOp(OPS.capDirectOp(v, 'zovshoorol', true), () => {}),
    OPS.runOp(OPS.capDirectOp(v, 'finRow', true), () => {}),
  ]);
  ok(all.every(Boolean), `${tag}: 4 зэрэг бичилт`); /* ⚠️ 2026-10-23: QAQC хасагдсан */
  await settle();
  fake.latency = 0;
  await both((w) => {
    grantIs('huvaari', u, 'approver', [p1, p2, p3], `${tag} ${w}`);
    for (const cap of ['obyemEdit', 'ajilApprove', 'zovshoorol', 'finRow']) capIs(v, cap, true, `${tag} ${w}`);
  });
  /* унасан бичилт → «ArcGIS-т хадгалагдсангүй», `failed` тэмдэг, дараагийн уншилт локалыг арчихгүй */
  const f = mkUser();
  fake.failWrites = true;
  const r = await run(OPS.scopedCellOp('obyem', f, 'editor', p1, true));
  fake.failWrites = false;
  ok(!r.ok && /ArcGIS/.test(r.err), `${tag}: унасан бичилтийг хэлнэ («${r.err}»)`);
  ok(OB.obyemFailedUsers().includes(f), `${tag}: failed тэмдэг`);
  await roundTrip();
  ok(OB.listObyemAssigns().some((x) => x.user === f), `${tag}: унасан хуваарилалт poll-д арчигдахгүй (failed локал давамгайлна)`);
  console.log('✅ §7b зэрэг бичилт алдагдалгүй (нэг систем 3 · таван систем/эрх зэрэг) · унасан бичилт ил, локал хадгалагдав');
}

/* ══════════ §9. ЦЭВЭРЛЭХ МӨР — устгагдсан аккаунт · хатуу super-ийн хуучин мөр (2026-09-30) ══════════
 * ⚠️ Хамгаалж буй алдаанууд:
 *    (а) устгагдсан аккаунтын чипийн ✕ (олон багцтай) → `setGrants` (grant=true) түүнд `__cap__:` мөр
 *        ДАХИН үүсгэдэг байв → ижил нэрийг дахин нэмэхэд «хуучин засах эрх үлдсэн» гэж түгждэг;
 *    (б) super-ийн хуучин мөрийн НЭГ багцыг хасахад `setGrants`/`setAssign` super-ийг татгалзаж ✕ ҮРГЭЛЖ
 *        унадаг (мөрийг арилгах зам алга);
 *    (в) super-ийн мөрийг бүхэлд нь хасахад түүнд ШУУД олгосон эрх (`plan` · `gazar`) буцдаг байв
 *        (`aclOps.revokeGoneRoles` · `scopedAcl.syncCaps`). */
{
  const tag = '§9';
  const [p1, p2, p3] = PKG_GROUPS;
  const S2 = Object.entries(ROLE_BY_USER).filter(([, r]) => r === 'super').map(([u]) => u.toLowerCase())[1];
  ok(S2 && S2 !== SUPER.toLowerCase(), `${tag}: хоёр дахь хатуу super`);
  const ghost = 'e2e_ghost_deleted';
  const G = (grants) => JSON.stringify({ roles: [...new Set(grants.map((g) => g.role))], bagts: [...new Set(grants.flatMap((g) => g.bagts))], grants });
  const directCaps = ['plan', 'obyemApprove', 'gazar', 'zovshoorol']; /* ⚠️ 2026-10-23: QAQC хасагдсан */
  fake.seed([
    { username: `__huvaari__:${ghost}`, views: G([{ role: 'author', bagts: [p1, p2] }]) },
    { username: `__obyem__:${ghost}`, views: G([{ role: 'editor', bagts: ['*'] }]) },
    { username: `__flow__:${ghost}`, views: JSON.stringify({ stage: 'engineer', bagts: [p1, p2] }) },
    { username: `__huvaari__:${S2}`, views: G([{ role: 'author', bagts: [p1, p2] }]) },
    { username: `__obyem__:${S2}`, views: G([{ role: 'approver', bagts: [p1] }]) },
    { username: `__flow__:${S2}`, views: JSON.stringify({ stage: 'manager', bagts: [p1, p2] }) },
    { username: `__cap__:${S2}`, views: JSON.stringify(directCaps) },
  ]);
  await roundTrip();
  ok(!P.listUsers().some((x) => x.username.toLowerCase() === ghost), `${tag}: ghost порталд алга (устгагдсан)`);
  const noGhostCaps = (w) => eq(fake.find(`__cap__:${ghost}`), [], `${tag} ${w}: устгагдсан аккаунтад __cap__ мөр үүсэх ёсгүй`);

  /* (а) устгагдсан аккаунт — ✕ нь мөрийг БҮХЭЛД НЬ, асуулгагүй, эрх үүсгэхгүй */
  let r = await run(OPS.scopedCellOp('huvaari', ghost, 'author', p1, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: ghost huvaari ✕ асуулгагүй («${r.err}»)`);
  r = await run(OPS.scopedCellOp('obyem', ghost, 'editor', p3, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: ghost obyem «бүх багц» ✕ — ил жагсаалт болгохыг асуухгүй`);
  r = await run(OPS.flowCellOp(ghost, 'engineer', p2, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: ghost урсгал ✕`);
  await both((w) => {
    rowGone('huvaari', ghost, `${tag} ${w}`);
    rowGone('obyem', ghost, `${tag} ${w}`);
    eq(FL.stageOfUser(ghost), null, `${tag} ${w}: ghost урсгалгүй`);
    eq(fake.find(`__flow__:${ghost}`), [], `${tag} ${w}: ghost урсгалын ArcGIS мөр алга`);
    noGhostCaps(w);
  });

  /* (б)+(в) хатуу super-ийн хуучин мөр — ✕ бүтнэ, шууд олгосон эрх ХЭВЭЭР */
  r = await run(OPS.scopedCellOp('huvaari', S2, 'author', p1, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: super huvaari ✕ (олон багц) бүтэх ёстой («${r.err}»)`);
  r = await run(OPS.flowCellOp(S2, 'manager', p1, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: super урсгал ✕ (олон багц) бүтэх ёстой («${r.err}»)`);
  /* хуучин op (`dropRoleOp` → `revokeGoneRoles`) ба lib-ийн анхдагч revoke (`syncCaps`) ч super-ийн эрхийг хөндөхгүй */
  r = await run(OPS.dropRoleOp('obyem', S2, 'approver'));
  ok(r.ok, `${tag}: dropRoleOp super`);
  await both((w) => {
    rowGone('huvaari', S2, `${tag} ${w}`);
    rowGone('obyem', S2, `${tag} ${w}`);
    eq(fake.find(`__flow__:${S2}`), [], `${tag} ${w}: super урсгалын мөр алга`);
    /* ⚠️ 2026-10-12: `capsOf(super)` = бүх эрх (кодоос); хадгалагдсан мөр (`capsStored`/ArcGIS) хөндөгдөхгүй */
    eq(sorted(CAPS.capsStored(S2)), sorted(directCaps), `${tag} ${w}: super-ийн хадгалагдсан __cap__ хэвээр`);
    eq(sorted(fake.json('__cap__:', S2)), sorted(directCaps), `${tag} ${w}: ArcGIS __cap__ хэвээр`);
    ok(Object.keys(CAPS.CAP_HOST_VIEW).every((c) => CAPS.capsOf(S2).includes(c)), `${tag} ${w}: super бүх эрхтэй`);
  });
  console.log('✅ §9 цэвэрлэх мөр: устгагдсан аккаунтын ✕ — мөр бүхэлдээ, эрх үүсэхгүй · super-ийн хуучин мөр — ✕ бүтнэ, шууд олгосон эрх хэвээр');
}

/* ══════════ §10. ХҮСНЭГТИЙН ӨГӨГДЛИЙН ТЭСВЭР (2026-10-19, аудит №10) ══════════
 * Эвдэрсэн мөр чимээгүй алгасагдахгүй (`remoteMalformed`) · угтвар том/жижиг үсэг үл хамаарна · энгийн мөрийн
 * түлхүүр trim/жижиг үсэг (унших ба бичих) · эвдэрсэн мөр эрх НЭЭХГҮЙ (fail-closed хэвээр). */
{
  const tag = '§10';
  const [p1] = PKG_GROUPS;
  const up = mkUser();
  /* ⚠️ POOL-оос БИШ — POOL-ын хэрэглэгч аль хэдийн (зайгүй) мөртэй */
  const sp = 'spaced_user_e2e';
  fake.seed([
    { username: '__flow__:bad_json_u', views: '{эвдэрсэн' },
    { username: '__flow__:no_stage_u', views: JSON.stringify({ bagts: [p1] }) },
    { username: '__cap__:bad_cap_u', views: JSON.stringify({ not: 'array' }) },
    { username: '__huvaari__:', views: JSON.stringify({ grants: [] }) },
    /* том үсэгтэй угтвар ба зайтай нэр — танигдах ёстой */
    { username: `__CAP__:${up.toUpperCase()}`, views: JSON.stringify(['zovshoorol']) },
    { username: `  ${sp.toUpperCase()}  `, role: 'taniltsah', views: JSON.stringify(['gdash', 'plan']), docs: 1 },
  ]);
  await roundTrip();
  const bad = P.remoteMalformed();
  const has = (k, why) => bad.some((m) => m.key === k && m.reason === why);
  ok(has('__flow__:bad_json_u', 'json'), `${tag}: эвдэрсэн JSON тоймд гарсангүй (${JSON.stringify(bad)})`);
  ok(has('__flow__:no_stage_u', 'stage'), `${tag}: шатгүй урсгалын мөр тоймд гарсангүй`);
  ok(has('__cap__:bad_cap_u', 'json'), `${tag}: массив биш эрхийн мөр тоймд гарсангүй`);
  ok(has('__huvaari__:', 'user'), `${tag}: нэргүй хуваарилалтын мөр тоймд гарсангүй`);
  ok(FL.stageOfUser('bad_json_u') === null && FL.stageOfUser('no_stage_u') === null, `${tag}: эвдэрсэн мөр эрх нээв`);
  ok(!CAPS.capsOf('bad_cap_u').length, `${tag}: эвдэрсэн эрхийн мөр эрх нээв`);
  ok(CAPS.capsOf(up).includes('zovshoorol'), `${tag}: «__CAP__:» (том үсэг) угтвар танигдсангүй`);
  ok(!P.listUsers().some((u) => u.username.toLowerCase().startsWith('__cap__:')), `${tag}: угтвартай мөр энгийн хэрэглэгч болж уншигдав`);
  /* ⚠️ 2026-10-19 (аудит): ЗАЙТАЙ мөр эрх ОЛГОХГҮЙ — урьд нь trim-ээр олгодог атлаа `LOWER(username) = …`-ээр олдохгүй
     тул хасах боломжгүй байв. Одоо цэвэрлэгээнд (`space`, OID-той), устгах нь `removeMalformedRow`. */
  const a = P.resolveBaseAccess(sp);
  ok(!a || !Array.isArray(a.views) || !a.views.includes('plan'), `${tag}: зайтай нэрийн мөр эрх олгов (${JSON.stringify(a)})`);
  const spacedRow = bad.find((m) => m.reason === 'space' && m.key === `  ${sp.toUpperCase()}  `);
  ok(spacedRow && typeof spacedRow.oid === 'number', `${tag}: зайтай мөр цэвэрлэгээнд (OID-той) гарсангүй (${JSON.stringify(bad)})`);
  /* бичих тал ч ижил түлхүүр — зайтай/том үсгээр дуудсан ч ижил (trim · жижиг үсэг) түлхүүрээр бичиж уншина.
     ⚠️ SQL-д TRIM хэрэглэдэггүй тул ХУУЧИН зайтай мөр олдохгүй — шинэ мөр (их OID) нэмэгдэж уншилтад ЯЛНА. */
  await P.setUser(`  ${sp.toUpperCase()} `, { views: ['gdash'], docs: false }, 'taniltsah');
  await settle();
  ok(fake.rows.some((r) => r.username === sp.toUpperCase()), `${tag}: бичсэн мөрийн нэр зайгүй байх ёстой`);
  await roundTrip();
  ok(JSON.stringify(P.resolveBaseAccess(sp)?.views) === JSON.stringify(['gdash']), `${tag}: зайтай нэрийн бичилт уншигдсангүй (${JSON.stringify(P.resolveBaseAccess(sp))})`);
  /* ⚠️ 2026-10-19: зайтай мөрийг OID-оор устгана — өөр нэр зөрвөл устгахгүй */
  const { removeMalformedRow } = await import('./permsRemote.ts');
  ok(!(await removeMalformedRow(spacedRow.oid, 'өөр нэр')), `${tag}: нэр зөрсөн ч устгав`);
  ok(fake.rows.some((r) => r.OBJECTID === spacedRow.oid), `${tag}: нэр зөрсөн мөр устсан`);
  ok(await removeMalformedRow(spacedRow.oid, spacedRow.key), `${tag}: зайтай мөрийг OID-оор устгаж чадсангүй`);
  ok(!fake.rows.some((r) => r.OBJECTID === spacedRow.oid), `${tag}: зайтай мөр хүснэгтэд үлдэв`);
  /* цэвэрлэсний дараа жагсаалтаас арилна */
  fake.rows = fake.rows.filter((r) => !['__flow__:bad_json_u', '__flow__:no_stage_u', '__cap__:bad_cap_u', '__huvaari__:'].includes(r.username));
  await roundTrip();
  ok(!P.remoteMalformed().some((m) => m.key.endsWith('_u') || m.key === '__huvaari__:' || m.reason === 'space'), `${tag}: цэвэрлэсэн мөр жагсаалтад үлдэв`);
  console.log('✅ §10 эвдэрсэн мөр тоймд · угтвар том/жижиг үсэг · нэрийн trim (унших/бичих) · fail-closed');
}

/* ══════════ §11. СИСТЕМ ТҮР ХААХ (⚠️ 2026-10-19) ══════════
 * `sysClose` эзэмшигч хаана → энгийн хэрэглэгчид хаалттай, эзэмшигч ба кодын super-т үгүй · `__sys__:` мөр хий хэрэглэгч
 * болохгүй · уншилт унахад СҮҮЛИЙН төлөв (fail-open) · нээх · эрхгүй хүний бичилт татгалзана (ArcGIS-т юу ч явахгүй). */
{
  const tag = '§11';
  const WHO = await import('@/lib/who.ts');
  const { AUTH } = await import('@/lib/services.ts');
  const holder = mkUser();
  const plain = mkUser();
  const KEY = '__sys__:maintenance';
  let r = await run(OPS.capDirectOp(holder, 'sysClose', true));
  ok(r.ok && r.confirms.length === 0, `${tag}: sysClose олгох («${r.err}»)`);
  await roundTrip();
  ok(P.canBypassClosed(holder) && !P.canBypassClosed(plain), `${tag}: эзэмшигч ба энгийн ялгагдана`);

  /* эрхгүй хүн бичих → татгалзана (нэвтрэлт асаалттай орчинд — `hasCap` нь appId хоосон үед бүгдэд үнэн) */
  if (AUTH.appId) {
    WHO.setCurrentUser(plain);
    const before = fake.edits;
    await assert.rejects(P.setSystemClosed(true, 'x'), /эрх/, `${tag}: эрхгүй хүний хаалт татгалзах ёстой`);
    checks += 1;
    eq(fake.edits, before, `${tag}: эрхгүй үед ArcGIS бичилт явах ёсгүй`);
    eq(fake.find(KEY), [], `${tag}: эрхгүй үед мөр үүсэх ёсгүй`);
  }

  /* эзэмшигч хаана */
  WHO.setCurrentUser(holder);
  ok(await P.setSystemClosed(true, 'Шилжүүлэлт', '10-20 09:00'), `${tag}: эзэмшигч хаах`);
  eq(JSON.parse(fake.find(KEY)[0].views).on, true, `${tag}: ArcGIS мөр on:true`);
  await both((w) => {
    eq(P.closedFor(plain)?.note, 'Шилжүүлэлт', `${tag} ${w}: энгийн хэрэглэгчид хаалттай (тайлбартай)`);
    eq(P.closedFor(plain)?.until, '10-20 09:00', `${tag} ${w}: дахин нээгдэх хугацаа`);
    eq(P.systemClosed()?.by, holder, `${tag} ${w}: хэн хаасан`);
    eq(P.closedFor(holder), null, `${tag} ${w}: эзэмшигчид хаалтгүй`);
    eq(P.closedFor(SUPER), null, `${tag} ${w}: кодын super-т хаалтгүй`);
    ok(!P.listUsers().some((u) => u.username.toLowerCase().startsWith('__sys__')), `${tag} ${w}: __sys__ мөр хий хэрэглэгч болов`);
    ok(!P.remoteMalformed().some((m) => m.key.startsWith('__sys__')), `${tag} ${w}: __sys__ мөр эвдэрсэн гэж тоологдов`);
  });

  /* уншилт унавал — сүүлийн мэдэгдэж буй төлөв (fail-open: хаалттай байсныг дураар нээхгүй ч, түгжихгүй) */
  fake.failReads = true;
  ok(!(await P.initRemote(false, true)), `${tag}: уншилт унах ёстой`);
  fake.failReads = false;
  eq(P.closedFor(plain)?.on, true, `${tag}: уншилт унахад хаалттай төлөв хэвээр`);

  /* нээх */
  ok(await P.setSystemClosed(false), `${tag}: эзэмшигч нээх`);
  await both((w) => {
    eq(P.systemClosed(), null, `${tag} ${w}: нээлттэй`);
    eq(P.closedFor(plain), null, `${tag} ${w}: энгийн хэрэглэгч орно`);
  });
  eq(fake.find(KEY).length, 1, `${tag}: нэг л мөр (upsert)`);
  fake.failReads = true;
  await P.initRemote(false, true);
  fake.failReads = false;
  eq(P.systemClosed(), null, `${tag}: нээлттэй үед уншилт унасан ч нээлттэй хэвээр`);

  /* кодын super ч хааж/нээж чадна */
  WHO.setCurrentUser(SUPER);
  ok(await P.setSystemClosed(true) && P.closedFor(plain) != null, `${tag}: super хаах`);
  ok(await P.setSystemClosed(false) && P.systemClosed() == null, `${tag}: super нээх`);

  /* ⚠️ 2026-10-19 (аудит №2): ХУУЧИРСАН ТӨЛӨВ — цонхонд харагдсан (`expect`) нь ArcGIS-ийнхаас зөрвөл юу ч бичихгүй */
  ok(await P.setSystemClosed(true, 'a', '', { expect: null }), `${tag}: expect таарсан хаалт`);
  const shown = P.systemClosed();
  ok(shown?.note === 'a', `${tag}: харагдсан төлөв`);
  /* өөр эзэмшигч завсарт НЭЭВ (энэ таб мэдээгүй) */
  fake.find(KEY)[0].views = JSON.stringify({ on: false, by: 'other', at: 7 });
  let ed = fake.edits;
  await assert.rejects(
    P.setSystemClosed(true, 'b', '', { expect: shown, update: true }),
    (e) => e instanceof P.SysStaleError && e.fresh === null,
    `${tag}: «Тайлбар шинэчлэх» нээлттэй системийг ДАХИН хаав (on→on сохор бичилт)`,
  );
  checks += 1;
  eq(fake.edits, ed, `${tag}: зөрсөн үед ArcGIS бичилт явах ёсгүй`);
  eq(JSON.parse(fake.find(KEY)[0].views).on, false, `${tag}: нээлттэй хэвээр`);
  eq(P.systemClosed(), null, `${tag}: шинэ (нээлттэй) төлөв локалд тусгагдсан`);
  /* «Нээх» ч мөн — харагдсан хаалттай, бодит нь нээлттэй */
  await assert.rejects(P.setSystemClosed(false, '', '', { expect: shown }), P.SysStaleError, `${tag}: хуучирсан «Нээх»`);
  checks += 1;
  /* update нь шинэ төлөв нээлттэй бол expect таарсан ч татгалзана */
  await assert.rejects(P.setSystemClosed(true, 'c', '', { expect: null, update: true }), P.SysStaleError, `${tag}: нээлттэй үед update`);
  checks += 1;
  /* цонх нээгдэхэд дахин уншина — өөр хүний хаалт харагдана */
  fake.find(KEY)[0].views = JSON.stringify({ on: true, note: 'бусад', by: 'other', at: 9 });
  eq((await P.refreshSystemClosed())?.by, 'other', `${tag}: refreshSystemClosed шинэ төлөв`);
  eq(P.systemClosed()?.note, 'бусад', `${tag}: store шинэчлэгдсэн`);
  /* уншилт унавал БИЧИХГҮЙ (батлах боломжгүй) */
  fake.failReads = true;
  ed = fake.edits;
  ok(!(await P.setSystemClosed(false, '', '', { expect: P.systemClosed() })), `${tag}: уншилт унасан үед бичилт`);
  eq(await P.refreshSystemClosed(), undefined, `${tag}: уншилт унавал undefined`);
  fake.failReads = false;
  eq(fake.edits, ed, `${tag}: уншилт унасан үед ArcGIS бичилт явах ёсгүй`);
  ok(await P.setSystemClosed(false, '', '', { expect: P.systemClosed() }) && P.systemClosed() == null, `${tag}: таарсан нээлт`);

  WHO.setCurrentUser(null);
  console.log('✅ §11 систем түр хаах: эзэмшигч хаах/нээх · энгийнд хаалттай, эзэмшигч/super-т үгүй · fail-open · эрхгүй бичилт татгалзав · хуучирсан төлөв дээр бичихгүй');
}

/* ══════════ §9b. ХҮСНЭГТИЙН SUPER-ИЙН МӨР — энгийн мөр (⚠️ 2026-10-21, аудит) ══════════
 * Super = `role:'super'` мөр (доошлуулж болно) тул түүний хуваарилалт «цэвэрлэх мөр» БИШ: ✕ нэг багцыг л хасна,
 * сүүлийнх асууж эрх буцаана; эрх (`__cap__:`) хуваарилалттайгаа синклэгдэнэ; super мөр нь хөндөгдөхгүй
 * (`grantFlowAccess`/`revokeFlowAccess`); доошлуулсны дараа хуваарилалт хэвээр. Кодын (тестийн) super-ийн мөр §9-өөр хэвээр. */
{
  const tag = '§9b';
  const [p1, p2] = PKG_GROUPS;
  const WHO9 = await import('@/lib/who.ts');
  const T = mkUser();
  /* super байхад `scope` → null (хязгааргүй) тул `grantIs` биш — мөрийн grant-ыг локал · ArcGIS-аас шууд */
  const hvAuthor = (w) => {
    const local = HV.listHuvaariAssigns().find((a) => a.user === T)?.grants.find((g) => g.role === 'author')?.bagts ?? null;
    const remote = fake.json('__huvaari__:', T)?.grants?.find((g) => g.role === 'author')?.bagts ?? null;
    eq(local && sorted(local), w && sorted(w), `${tag}: huvaari.author локал grant`);
    eq(remote && sorted(remote), w && sorted(w), `${tag}: huvaari.author ArcGIS grant`);
  };
  WHO9.setCurrentUser(SUPER);
  let res = await RTA.applyType(T, 'super'); await settle();
  ok(res.ok, `${tag}: хүснэгтийн super олгох (${res.errors})`);
  eq(SV.roleForUser(T), 'super', `${tag}: хүснэгтийн super`);
  ok(!SV.isCodeSuper(T), `${tag}: кодын super биш`);
  /* хуваарилалт — super байхад нь ч бичигдэнэ (доошлуулсны дараах тохиргоо) */
  let r = await run(OPS.scopedCellOp('huvaari', T, 'author', p1, true));
  ok(r.ok, `${tag}: super-т хуваарь олгох («${r.err}»)`);
  r = await run(OPS.scopedCellOp('huvaari', T, 'author', p2, true));
  ok(r.ok, `${tag}: хоёр дахь багц («${r.err}»)`);
  r = await run(OPS.flowCellOp(T, 'manager', p1, true));
  ok(r.ok, `${tag}: урсгалд томилох («${r.err}»)`);
  r = await run(OPS.flowCellOp(T, 'manager', p2, true));
  ok(r.ok, `${tag}: урсгал хоёр дахь багц («${r.err}»)`);
  await both((w) => {
    hvAuthor([p1, p2]);
    eq(FL.stageOfUser(T), 'manager', `${tag} ${w}: шат`);
    eq(SV.roleForUser(T), 'super', `${tag} ${w}: super хэвээр (grantFlowAccess мөрийг хөндөхгүй)`);
    ok((fake.json('__cap__:', T) ?? []).includes('plan'), `${tag} ${w}: __cap__ мөр синклэгдсэн`); /* ⚠️ 2026-10-23: QAQC хасагдсан */
    eq(HV.huvaariScope(T, 'author'), null, `${tag} ${w}: super байхад хүрээ хязгааргүй`);
  });
  /* ✕ нэг багц — мөр бүхэлдээ арилахгүй (цэвэрлэх мөр биш), асуухгүй */
  r = await run(OPS.scopedCellOp('huvaari', T, 'author', p1, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: нэг багц хасах («${r.err}»)`);
  r = await run(OPS.flowCellOp(T, 'manager', p1, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: урсгалын нэг багц хасах («${r.err}»)`);
  await both((w) => {
    hvAuthor([p2]);
    eq(FL.stageOfUser(T), 'manager', `${tag} ${w}: урсгалын мөр хэвээр`);
    eq(SV.roleForUser(T), 'super', `${tag} ${w}: super хэвээр`);
  });
  /* сүүлийн багц — асууж (цэвэрлэх мөр биш) эрх буцаана; super мөр хэвээр */
  r = await run(OPS.flowCellOp(T, 'manager', p2, false));
  ok(r.ok && r.confirms.length === 1, `${tag}: урсгалын сүүлийн багц — асууна («${r.err}»)`);
  await both((w) => {
    eq(FL.stageOfUser(T), null, `${tag} ${w}: урсгалгүй`);
    eq(SV.roleForUser(T), 'super', `${tag} ${w}: super хэвээр (revokeFlowAccess мөрийг арчихгүй)`);
    ok(Object.keys(CAPS.CAP_HOST_VIEW).every((c) => CAPS.capsOf(T).includes(c)), `${tag} ${w}: super байхад бүх эрх`);
  });
  /* доошлуулах — үлдсэн хуваарилалт хэвээр, эрх нь хуваарилалтаас */
  res = await RTA.applyType(T, 'gazar'); await settle();
  ok(res.ok, `${tag}: доошлуулах (${res.errors})`);
  await both((w) => {
    eq(SV.roleForUser(T), null, `${tag} ${w}: super хасагдсан`);
    grantIs('huvaari', T, 'author', [p2], `${tag} ${w}: доошлуулсны дараа хуваарь хэвээр`);
    capIs(T, 'plan', true, `${tag} ${w}`);
  });
  WHO9.setCurrentUser(null);
  console.log('✅ §9b хүснэгтийн super: хуваарилалт энгийн мөр — ✕ нэг багц · сүүлийнх асууна · эрх синк · super мөр хөндөгдөхгүй · доошлуулсны дараа хэвээр');
}

/* ══════════ §12. АНХНЫ АДМИН (`roles.BOOTSTRAP_SUPER`) — super олгохдоо өөрийн мөрөө бичнэ (⚠️ 2026-10-21, аудит) ══════════
 * Хүснэгтэд super мөргүй үед анхны админ super; өөр хүнд super олгомогц урьд өөрөө super-ээ алдаж (мөргүй) дараагийн
 * нэвтрэлтэд түгжигддэг байв. Одоо `permissions.setUser` өөрийн `role:'super'` мөрийг ЭХЭЛЖ бичнэ. */
{
  const tag = '§12';
  const WHO12 = await import('@/lib/who.ts');
  const boot = SV.BOOTSTRAP_SUPER;
  /* super мөргүй хүснэгт — анхны админ идэвхтэй */
  fake.rows = fake.rows.filter((r) => r.role !== 'super');
  await roundTrip();
  eq(SV.tableSuperUsers(), [], `${tag}: super мөргүй хүснэгт`);
  eq(SV.roleForUser(boot), 'super', `${tag}: анхны админ super`);
  ok(P.listUsers().some((x) => x.username === boot && x.role === 'super' && x.views === 'all' && !x.overridden), `${tag}: анхны админ самбарт (синтетик мөр)`);
  const B = mkUser();
  WHO12.setCurrentUser(boot);
  let res = await RTA.applyType(B, 'super'); await settle();
  ok(res.ok, `${tag}: анхны админ super олгоно (${res.errors})`);
  await both((w) => {
    eq(SV.roleForUser(B), 'super', `${tag} ${w}: нөгөөх super`);
    eq(SV.roleForUser(boot), 'super', `${tag} ${w}: анхны админ super ХЭВЭЭР (өөрийн мөр)`);
    eq(P.hasAccess(boot), true, `${tag} ${w}: анхны админ нэвтэрнэ`);
    eq(fake.find(boot)[0]?.role, 'super', `${tag} ${w}: ArcGIS-т өөрийн super мөр`);
    ok(SV.tableSuperUsers().includes(boot) && SV.tableSuperUsers().includes(B), `${tag} ${w}: хоёулаа хүснэгтийн super`);
  });
  /* өөр super анхны админыг доошлуулж болно (ердийн super мөрийн дүрэм) — super мөр бий тул bootstrap үйлчлэхгүй */
  WHO12.setCurrentUser(B);
  res = await RTA.applyType(boot, 'gazar'); await settle();
  ok(res.ok, `${tag}: өөр super анхны админыг доошлуулна (${res.errors})`);
  await both((w) => {
    eq(SV.roleForUser(boot), null, `${tag} ${w}: анхны админ энгийн`);
    eq(P.roleOf(boot), 'gazar', `${tag} ${w}: үүрэг gazar`);
  });
  /* цэвэрлэх — дараагийн хэсэгт super мөр үлдээхгүй */
  WHO12.setCurrentUser(SUPER);
  res = await RTA.applyType(B, 'gazar'); await settle();
  ok(res.ok, `${tag}: цэвэрлэх (${res.errors})`);
  WHO12.setCurrentUser(null);
  console.log('✅ §12 анхны админ: super олгохдоо өөрийн super мөрөө бичнэ — super хэвээр · нэвтэрнэ · самбарт харагдана · өөр super доошлуулна');
}

/* ══════════ §12b. АНХНЫ АДМИН — өөрийн мөрийн бичилт УНАСНЫ дараах олголт (⚠️ 2026-10-22, аудит №4) ══════════
 * Урьд нь `setUser` super тэмдгийг бичихээс ӨМНӨ тавьдаг тул унасан бичилтийн дараа supers=[анхны админ] болж, дараагийн
 * олголт «өөрийн мөрөө эхэлж бич» салааг алгасдаг байв → remote-д зөвхөн нөгөөх super, анхны админ мөргүй → дахин
 * ачаалахад нэвтэрч чадахгүй. */
{
  const tag = '§12b';
  const WHO = await import('@/lib/who.ts');
  const boot = SV.BOOTSTRAP_SUPER;
  fake.rows = fake.rows.filter((r) => r.role !== 'super' && r.username.toLowerCase() !== boot);
  await roundTrip();
  eq(SV.roleForUser(boot), 'super', `${tag}: super мөргүй — анхны админ super`);
  const C = mkUser();
  const D = mkUser();
  WHO.setCurrentUser(boot);
  fake.failWrites = true;
  let res = await RTA.applyType(C, 'super'); await settle();
  fake.failWrites = false;
  ok(!res.ok, `${tag}: өөрийн мөр бичигдээгүй — олголт татгалзана`);
  eq(SV.tableSuperUsers(), [], `${tag}: унасан бичилт super тэмдэг ҮЛДЭЭХГҮЙ`);
  res = await RTA.applyType(D, 'super'); await settle();
  ok(res.ok, `${tag}: дахин оролдлого (${res.errors})`);
  eq(fake.find(boot)[0]?.role, 'super', `${tag}: ArcGIS-т анхны админы өөрийн super мөр ЭХЭЛЖ бичигдсэн`);
  await both((w) => {
    eq(SV.roleForUser(boot), 'super', `${tag} ${w}: анхны админ super хэвээр`);
    eq(P.hasAccess(boot), true, `${tag} ${w}: анхны админ нэвтэрнэ`);
    eq(SV.roleForUser(D), 'super', `${tag} ${w}: нөгөөх super`);
    ok(SV.roleForUser(C) !== 'super', `${tag} ${w}: татгалзсан олголт super биш`);
  });
  WHO.setCurrentUser(SUPER);
  for (const u of [D, boot]) { res = await RTA.applyType(u, 'gazar'); await settle(); ok(res.ok, `${tag}: цэвэрлэх ${u} (${res.errors})`); }
  WHO.setCurrentUser(null);
  console.log('✅ §12b анхны админ: өөрийн мөр унасны дараах олголт өөрийн мөрийг эхэлж бичнэ — түгжигдэхгүй');
}

/* ══════════ §12c. «Дахин синк» — ТАРЬСАН (өөр сешний) `role:'super'` dirty мөрийг БИЧИХГҮЙ (⚠️ 2026-10-22, аудит №4) ══════════
 * Dirty-set нь localStorage-д (browser-ийн бүх аккаунтад) — гараар тарьсан super мөр super-ийн токеноор бичигдэж бүрэн
 * super болдог байв. */
{
  const tag = '§12c';
  const WHO = await import('@/lib/who.ts');
  const E = mkUser();
  WHO.setCurrentUser(SUPER);
  localStorage.setItem('selbe-perms-dirty-v1', JSON.stringify({ [E]: { by: SV.BOOTSTRAP_SUPER, e: { views: 'all', docs: true, role: 'super' } } }));
  ok(P.foreignDirty().some((f) => f.key === E && f.role === 'super'), `${tag}: батлах цонхонд super олголт гэж танигдана`);
  const left = await P.retryDirty(false); await settle();
  eq(left, 0, `${tag}: тарьсан мөр dirty-д ҮЛДЭХГҮЙ (хаягдсан)`);
  ok(fake.find(E).every((r) => r.role !== 'super'), `${tag}: ArcGIS-т super бичигдээгүй`);
  await both((w) => ok(SV.roleForUser(E) !== 'super', `${tag} ${w}: тарьсан мөр super болоогүй`));
  WHO.setCurrentUser(null);
  console.log('✅ §12c «Дахин синк»: тарьсан super мөрийг бичихгүй — хаяж, анхааруулна');
}

/* ══════════ §13. «Хэрэглэгчийн эрх тохируулах» засварууд (⚠️ 2026-10-23, хэрэглэгч: «бүгдийг зас») ══════════
 * (а) ноорогийн хамгаалалт БҮХ хуудсанд (`aclOps.draftGuard` — урьд нь матрицад л);
 * (б) шатнаас хасахад админы ИЛ төрөл үлдэнэ, зөвхөн автоматаар тавьсан төрөл арилна (`Assign.autoRole`);
 * (в) хүснэгтийн super-т шууд эрх ХАДГАЛАГДАНА (`capDirectOp` — `capsStored`), тоймд хадгалсан эрх (`liveErhSource`);
 * (г) устгасан аккаунт tombstone-тай — урсгалын томилгоо түүнийг амилуулахгүй. */
{
  const tag = '§13';
  const ERL = await import('@/modules/erhLabels.ts');
  const WHO = await import('@/lib/who.ts');
  const [p1] = PKG_GROUPS;
  WHO.setCurrentUser(SUPER);
  /* (а) */
  const N = mkUser();
  OPS.setAclDrafts([[N, { isNew: true }]]);
  let r = await run(OPS.scopedCellOp('huvaari', N, 'author', p1, true));
  ok(!r.ok && r.err === ERL.newAccountMsg(), `${tag}: шинэ (хадгалаагүй) аккаунтад хуваарь бичихгүй («${r.err}»)`);
  r = await run(OPS.capDirectOp(N, 'zovshoorol', true));
  ok(!r.ok && r.err === ERL.newAccountMsg(), `${tag}: энгийн эрх ч хориглоно`);
  OPS.setAclDrafts([[N, { remove: true }]]);
  r = await run(OPS.flowCellOp(N, 'engineer', p1, true));
  ok(!r.ok && r.err === ERL.removeMarkedMsg(), `${tag}: устгахаар тэмдэглэсэнд урсгал бичихгүй`);
  OPS.setAclDrafts([[N, {}]]);
  r = await run(OPS.scopedCellOp('huvaari', N, 'author', p1, true));
  ok(r.ok, `${tag}: энгийн ноорогтой хүнд хуваарь бичигдэнэ («${r.err}»)`);
  r = await run(OPS.flowCellOp(N, 'engineer', p1, true));
  ok(!r.ok && r.err === ERL.draftFlowMsg(), `${tag}: ноорогтой хүнд урсгалын томилгоо хориглоно`);
  OPS.setAclDrafts([]);
  r = await run(OPS.flowCellOp(N, 'engineer', p1, true));
  ok(r.ok, `${tag}: ноорог алга — урсгал бичигдэнэ («${r.err}»)`);
  eq(fake.json('__flow__:', N)?.autoRole, undefined, `${tag}: урсгалын бус төрөл (taniltsah) — автомат төрөл БИШ`);
  /* (б) ил төрөл (injener) → инженер шат → хасах: төрөл ҮЛДЭНЭ */
  const X = mkUser();
  let res = await RTA.applyType(X, 'injener'); await settle();
  ok(res.ok, `${tag}: ил төрөл (${res.errors})`);
  r = await run(OPS.flowCellOp(X, 'engineer', p1, true));
  ok(r.ok, `${tag}: X томилох («${r.err}»)`);
  eq(fake.json('__flow__:', X)?.autoRole, undefined, `${tag}: ил төрөлтэй — autoRole тугагүй`);
  r = await run(OPS.flowCellOp(X, 'engineer', p1, false));
  ok(r.ok, `${tag}: X хасах («${r.err}»)`);
  await both((w) => eq(P.roleOf(X), 'injener', `${tag} ${w}: админы ил төрөл шатнаас хасахад хэвээр`));
  /* өөр урсгалын төрөл (menejer) → инженер шат: төрөл автоматаар солигдоно → хасахад арилна */
  const Z = mkUser();
  res = await RTA.applyType(Z, 'menejer'); await settle();
  ok(res.ok, `${tag}: Z төрөл (${res.errors})`);
  r = await run(OPS.flowCellOp(Z, 'engineer', p1, true));
  ok(r.ok, `${tag}: Z томилох («${r.err}»)`);
  await both((w) => {
    eq(P.roleOf(Z), 'injener', `${tag} ${w}: томилгоо төрлийг автоматаар солив`);
    eq(fake.json('__flow__:', Z)?.autoRole, true, `${tag} ${w}: autoRole туг ArcGIS-т`);
    eq(FL.listAssigns().find((a) => a.user === Z)?.autoRole, true, `${tag} ${w}: autoRole туг локалд`);
  });
  r = await run(OPS.flowCellOp(Z, 'engineer', p1, false));
  ok(r.ok, `${tag}: Z хасах («${r.err}»)`);
  await both((w) => eq(P.roleOf(Z), null, `${tag} ${w}: автоматаар тавьсан төрөл арилав`));
  /* (в) хүснэгтийн super-т шууд эрх хадгалагдана; тоймд хадгалсан эрх */
  const S = mkUser();
  res = await RTA.applyType(S, 'super'); await settle();
  ok(res.ok && SV.roleForUser(S) === 'super', `${tag}: хүснэгтийн super (${res.errors})`);
  r = await run(OPS.capDirectOp(S, 'finRow', true));
  ok(r.ok, `${tag}: super-т finRow хадгалах («${r.err}»)`);
  await both((w) => {
    ok((fake.json('__cap__:', S) ?? []).includes('finRow'), `${tag} ${w}: ArcGIS __cap__ finRow`);
    eq(OPS.liveErhSource().caps[S], ['finRow'], `${tag} ${w}: тоймд super-ийн ХАДГАЛСАН эрх (бүх эрх биш)`);
    ok(!(OPS.liveErhSource().codeSupers ?? []).includes(S), `${tag} ${w}: кодын super биш`);
  });
  eq(await run(OPS.capDirectOp(S, 'finRow', true)).then((x) => x.ok), false, `${tag}: аль хэдийн хадгалсан — no-op`);
  /* (г) устгасан панелийн аккаунт — tombstone; урсгалын олголт амилуулахгүй */
  const D = mkUser();
  ok(await P.removeUser(D), `${tag}: устгах`);
  await settle();
  eq(fake.find(D).map((x) => x.views), ['removed'], `${tag}: ArcGIS-т tombstone`);
  ok(P.listRemoved().includes(D), `${tag}: «Устгагдсан аккаунтууд»-д`);
  const w = FL.setAssign(D, 'engineer', [p1]);
  await w.sync; await settle();
  await both((ww) => eq(P.hasAccess(D), false, `${tag} ${ww}: урсгалын томилгоо устгагдсан аккаунтыг амилуулахгүй`));
  ok(await P.restoreUser(D), `${tag}: «Буцаах»`);
  await both((ww) => {
    eq(P.hasAccess(D), true, `${tag} ${ww}: сэргээгдсэн аккаунт нэвтэрнэ`);
    eq(P.roleOf(D), 'taniltsah', `${tag} ${ww}: өмнөх төрөл буцав`);
  });
  WHO.setCurrentUser(null);
  console.log('✅ §13 эрх тохируулах: ноорогийн хамгаалалт бүх хуудсанд · ил төрөл шатнаас хасахад үлдэнэ · super-т хадгалсан эрх · tombstone + «Буцаах»');
}

/* ══════════ §14. «ЕРӨНХИЙ ЗАХИРАЛ» (`zahiral`) — зөвхөн харах удирдлага (⚠️ 2026-10-23) ══════════
 * Хүчинтэй төрөл · засах/батлах эрхгүй · урсгалын шат биш (гацаа/төрөл↔шат зөрөө үүсгэхгүй) · «Гүйцэтгэл»-ийг зөвхөн харна. */
{
  const tag = '§14';
  const WHO = await import('@/lib/who.ts');
  const ERH = await import('@/lib/erhOverview.ts');
  WHO.setCurrentUser(SUPER);
  const Zh = mkUser();
  const res = await RTA.applyType(Zh, 'zahiral'); await settle();
  ok(res.ok, `${tag}: төрөл хэрэгжив (${res.errors})`);
  ok(RT.TYPE_ORDER.includes('zahiral') && RT.typeLabel('zahiral') === 'Ерөнхий захирал', `${tag}: төрлийн жагсаалт · шошго`);
  ok(!Object.values(SV.STAGE_ROLE).includes('zahiral') && SV.ROLE_STAGE.zahiral === undefined, `${tag}: урсгалын шат биш`);
  await both((w) => {
    eq(P.roleOf(Zh), 'zahiral', `${tag} ${w}: хүчинтэй үүрэг (fail-closed шүүлтэд хаягдахгүй)`);
    eq(CAPS.capsOf(Zh), [], `${tag} ${w}: засах/батлах эрхгүй`);
    const a = P.resolveAccess(Zh);
    ok(a && a.views !== 'all' && a.views.includes('guitsetgel') && a.views.includes('gdash') && a.views.includes('finance'), `${tag} ${w}: удирдлагын харагдац + «Гүйцэтгэл» (${a && a.views})`);
    eq(a.docs, true, `${tag} ${w}: ТЭЗҮ-БОНУ`);
    const fs = FL.resolveFlowStage(Zh, 'zahiral');
    ok(fs.viewAll === true && fs.canReview === false && fs.canPick === false && fs.scope === null && fs.stage === 'chief', `${tag} ${w}: «Гүйцэтгэл» бүх багц, шийдвэргүй`);
    eq(FL.resolveFlowStage(Zh, 'zahiral', 'engineer').stage, 'engineer', `${tag} ${w}: шат сонгож харна`);
    const src = OPS.liveErhSource();
    eq(src.typeStage?.[Zh], undefined, `${tag} ${w}: төрлөөс хүлээгдэх шат алга`);
    ok(!ERH.typeStageGaps(src).some((g) => g.user === Zh), `${tag} ${w}: төрөл↔шат зөрөөний анхааруулга гарахгүй`);
    ok(!src.flow.some((f) => f.user === Zh), `${tag} ${w}: урсгалын томилгоогүй`);
  });
  WHO.setCurrentUser(null);
  console.log('✅ §14 «Ерөнхий захирал»: хүчинтэй төрөл · эрхгүй · шат биш · «Гүйцэтгэл» зөвхөн харна · гацаа/зөрөө үүсгэхгүй');
}

/* ══════════ §15. 2026-10-23-ны засварууд — захирал урсгалд биш · «Буцаах»-ын retry · урагш нийцтэй бичилт ══════════
 * (а) «Ерөнхий захирал»: `setAssign` татгалзана; томилгоотой хүнд `applyType('zahiral')` татгалзана (`flowStage`);
 *     хуучин томилгоотой захирал — тэмдэгт 0, шатны эзэн биш (`pkgErh`), төрөл↔шат зөрөөнд (`want: null`);
 * (б) «Буцаах»-ын бичилт унасан → retry tombstone-ыг ЗОРИУД дарна (`DirtyItem.revive`);
 * (в) танигдахгүй үүрэг (шинэ build) — бичихэд remote-ын утга хэвээр; танигдахгүй шаттай мөрийг хасалт устгахгүй. */
{
  const tag = '§15';
  const WHO = await import('@/lib/who.ts');
  const ERH = await import('@/lib/erhOverview.ts');
  const HS = await import('@/lib/hyanaltStore.ts');
  const [p1] = PKG_GROUPS;
  WHO.setCurrentUser(SUPER);
  /* (а) */
  const Z = mkUser();
  let res = await RTA.applyType(Z, 'zahiral'); await settle();
  ok(res.ok, `${tag}: захирал төрөл (${res.errors})`);
  const w = FL.setAssign(Z, 'engineer', [p1]);
  ok(!w.ok && /Ерөнхий захирал/.test(w.error ?? ''), `${tag}: захиралыг урсгалд томилохгүй («${w.error}»)`);
  await settle();
  ok(!FL.listAssigns().some((a) => a.user === Z) && fake.find('__flow__:' + Z).length === 0, `${tag}: локал/ArcGIS-т урсгалын мөр үүсээгүй`);
  const Y = mkUser();
  let r = await run(OPS.flowCellOp(Y, 'engineer', p1, true));
  ok(r.ok, `${tag}: Y томилох («${r.err}»)`);
  res = await RTA.applyType(Y, 'zahiral'); await settle();
  ok(!res.ok && res.flowStage === 'engineer' && P.roleOf(Y) !== 'zahiral', `${tag}: томилгоотой хүнийг захирал болгохгүй (${res.errors})`);
  /* хуучин өгөгдөл: томилгоотой атлаа төрөл нь захирал (төрөл шууд бичигдсэн) */
  ok(await P.setUser(Y, { views: ['gdash'], docs: false }, 'zahiral'), `${tag}: Y-ийн төрлийг шууд бичих`);
  await settle();
  await both((ww) => {
    eq(P.roleOf(Y), 'zahiral', `${tag} ${ww}: Y захирал`);
    const src = OPS.liveErhSource();
    ok((src.viewRoles ?? []).includes(Y), `${tag} ${ww}: viewRoles-д`);
    const pe = ERH.pkgErh(src, p1);
    ok(!pe.flow.engineer.includes(Y) && pe.flowViewers.engineer.includes(Y), `${tag} ${ww}: захирал шатны эзэн биш (харагч)`);
    ok(ERH.typeStageGaps(src).some((g) => g.user === Y && g.want === null && g.have === 'engineer'), `${tag} ${ww}: төрөл↔шат зөрөөнд гарна`);
  });
  eq(await HS.countReviewPending(Y), 0, `${tag}: захиралын хянах тэмдэг 0`);
  /* (б) */
  const D = mkUser();
  ok(await P.removeUser(D), `${tag}: устгах`);
  await settle();
  fake.failWrites = true;
  ok(!(await P.restoreUser(D)), `${tag}: «Буцаах» бичилт унав`);
  fake.failWrites = false;
  await settle();
  ok(P.dirtyKeys().includes(D), `${tag}: сэргээлт dirty-д`);
  const left = await P.retryDirty(false); await settle();
  ok(!P.dirtyKeys().includes(D), `${tag}: retry сэргээлтийг бичив (үлдсэн ${left})`);
  await both((ww) => {
    eq(P.hasAccess(D), true, `${tag} ${ww}: retry-ийн дараа сэргээгдсэн аккаунт нэвтэрнэ`);
    ok(fake.find(D).every((x) => x.views !== 'removed'), `${tag} ${ww}: ArcGIS-т tombstone арилсан`);
  });
  /* (в) танигдахгүй үүрэг */
  const U = mkUser();
  fake.find(U)[0].role = 'future_role';
  await roundTrip();
  eq(P.roleOf(U), null, `${tag}: танигдахгүй үүрэг уншихад null (fail-closed)`);
  ok(await P.setUser(U, { views: ['gdash', 'plan'], docs: false }, null), `${tag}: U-ийн харагдац засах`);
  await settle();
  eq(fake.find(U)[0].role, 'future_role', `${tag}: хуучирсан клиент танигдахгүй үүргийг арчсангүй`);
  ok(JSON.parse(fake.find(U)[0].views).includes('plan'), `${tag}: харагдацын засвар бичигдэв`);
  /* (в) танигдахгүй шат — хасалт мөрийг устгахгүй */
  const V = mkUser();
  r = await run(OPS.flowCellOp(V, 'engineer', p1, true));
  ok(r.ok, `${tag}: V томилох («${r.err}»)`);
  const fr = fake.find('__flow__:' + V)[0];
  fr.views = JSON.stringify({ ...JSON.parse(fr.views), stage: 'future_stage' });
  await FL.removeAssign(V, 'engineer', false).sync; await settle();
  eq(fake.json('__flow__:', V)?.stage, 'future_stage', `${tag}: шинэ шатны томилгоо хуучирсан клиентийн хасалтаар устсангүй`);
  /* (г) UserAdmin: хадгалаагүй шинэ аккаунтыг «устгах» = ноорог хаях (tombstone бичихгүй) — эх код */
  const UA = (await import('node:fs')).readFileSync('src/components/UserAdmin.tsx', 'utf8');
  const fr2 = UA.slice(UA.indexOf('const flipRemove = (u: UserPerm) => {'), UA.indexOf('putDraft(u, { ...d, remove: !d.remove });'));
  ok(fr2.includes('if (d.isNew && !users.some('), `${tag}: flipRemove шинэ аккаунтын ноорогийг шууд хаяхгүй байна`);
  ok(UA.includes('if (d.isNew && !listUsers().some((x) => x.username.toLowerCase() === key)) continue;'), `${tag}: saveAll шинэ аккаунтад tombstone бичиж болзошгүй`);
  WHO.setCurrentUser(null);
  console.log('✅ §15 захирал урсгалд биш · «Буцаах» retry tombstone-ыг дарна · танигдахгүй үүрэг/шат хадгалагдана · шинэ аккаунтын устгал бичилтгүй');
}

eq(fake.unexpected, [], 'амьд сүлжээ рүү хүсэлт явах ёсгүй');
console.log(`✅ aclE2E: ${checks} шалгалт — бүгд давлаа (ArcGIS бичилт ${fake.edits}, хуурамч хүснэгтэд)`);
