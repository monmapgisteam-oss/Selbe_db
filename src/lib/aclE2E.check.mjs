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
 *   §1  «бүх багц» / ил жагсаалт / сүүлийн багц — 5 систем × үүрэг бүр · QAQC · 6 шат
 *   §2  нэмэх — шинэ · байгаа · «бүх багц» (no-op) · шат шилжүүлэх · super татгалзал
 *   §3  нэг системд олон үүрэг · §4 хуваалцсан `chanarReview`
 *   §5  энгийн эрх (`capDirectOp`) · super-ийн хязгаарлалт · өнчин эрх
 *   §6  хэрэглэгчийн карт — үүрэг/харагдац · «Төрлөөр тохируулах» · устгах · сэргээх
 *   §7b зэрэг бичилт (алдагдалгүй) · бичилт унах
 *   §8  remote round-trip — §1–§7-ийн дараа бүр `initRemote`-оор дахин уншиж давтан шалгана
 * UI давхарга (✕ аль op-ыг ямар багц/үүргээр дууддаг вэ) — `src/modules/aclE2E.ui.check.mjs`.
 */
import assert from 'node:assert/strict';
import { fake, takeConfirms, settle, setConfirmAnswer } from './aclE2E.fake.mjs';

const { ROLE_BY_USER } = await import('@/lib/services.ts');
const SUPER = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'super')[0];
fake.owner = SUPER;

const P = await import('@/lib/permissions.ts');
const CAPS = await import('@/lib/caps.ts');
const OPS = await import('@/lib/aclOps.ts');
const FL = await import('@/lib/guitsetgelAcl.ts');
const QA = await import('@/lib/qaqcAcl.ts');
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
    OPS.qaqcCellOp(u, PKG_GROUPS[0], true),
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

/* §1 QAQC — үүрэггүй систем */
{
  const tag = '§1 qaqc';
  const px = PKG_GROUPS[2];
  const rest = PKG_GROUPS.filter((x) => x !== px);
  const qIs = (u, want, t) => {
    const local = QA.listQaqcAssigns().find((a) => a.user === u)?.bagts ?? null;
    const remote = fake.json('__qaqc__:', u)?.bagts ?? null;
    eq(local && sorted(local), want && sorted(want), `${t} ${u}: локал`);
    eq(remote && sorted(remote), want && sorted(want), `${t} ${u}: ArcGIS`);
    eq(QA.qaqcScope(u) === null ? null : sorted(QA.qaqcScope(u)), want?.includes('*') ? null : sorted(want ?? []), `${t} ${u}: qaqcScope`);
  };
  const ua = mkUser();
  const w = QA.setQaqcAssign(ua, ['*']);
  await w.sync; await settle();
  qIs(ua, ['*'], tag);
  capIs(ua, 'qaqc', true, tag);
  let r = await run(OPS.qaqcCellOp(ua, px, false));
  ok(r.ok && r.confirms.length === 1 && /ил жагсаалт/.test(r.confirms[0]), `${tag}: «бүх багц» → ил жагсаалт асуулт`);
  await both((t) => { qIs(ua, rest, `${tag} ${t}`); capIs(ua, 'qaqc', true, `${tag} ${t}`); hostIs(ua, 'qaqc', true, `${tag} ${t}`); });

  const ub = mkUser();
  ok((await run(OPS.qaqcCellOp(ub, PKG_GROUPS[0], true))).ok, `${tag}: шинэ`);
  ok((await run(OPS.qaqcCellOp(ub, PKG_GROUPS[1], true))).ok, `${tag}: P2`);
  r = await run(OPS.qaqcCellOp(ub, PKG_GROUPS[0], false));
  ok(r.ok && r.confirms.length === 0, `${tag}: P1 хасах асуулгагүй`);
  await both((t) => { qIs(ub, [PKG_GROUPS[1]], `${tag} ${t}`); capIs(ub, 'qaqc', true, `${tag} ${t}`); });
  r = await run(OPS.qaqcCellOp(ub, PKG_GROUPS[1], false));
  ok(r.ok && r.confirms.length === 1, `${tag}: сүүлийн багц → асууна`);
  await both((t) => {
    qIs(ub, null, `${tag} ${t}`);
    capIs(ub, 'qaqc', false, `${tag} ${t}`);
    hostIs(ub, 'qaqc', false, `${tag} ${t}`);
  });
  console.log('✅ §1 QAQC: «бүх багц»-аас нэгийг хасахад бусад нь үлдэв; [P1,P2]→[P2]; сүүлийнх → эрх · харагдац буцав');
}

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
  eq(OPS.qaqcCellOp(ua, p3, true) !== null, true, `${tag}: өөр систем (QAQC) хамаагүй`);
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
    OPS.qaqcCellOp(SUPER, p1, true),
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
  /* super-т гаргалгаатай эрхийг шууд олгож/хасна (цорын ганц зам) */
  let r = await run(OPS.capDirectOp(SUPER, 'planApprove', true));
  ok(r.ok, `${tag}: super-т гаргалгаатай эрх`);
  await both((w) => capIs(SUPER.toLowerCase(), 'planApprove', true, `${tag} ${w}`));
  r = await run(OPS.capDirectOp(SUPER, 'planApprove', false));
  await both((w) => capIs(SUPER.toLowerCase(), 'planApprove', false, `${tag} ${w}`));
  /* өнчин гаргалгаатай эрх (хуваарилалтгүй) — ХАСАХ нь зөвшөөрөгдөнө */
  const o = mkUser();
  await CAPS.setCaps(o, ['addRow']); await settle();
  r = await run(OPS.capDirectOp(o, 'addRow', false));
  ok(r.ok && /Бөглөх/.test(r.confirms[0]), `${tag}: addRow-ийн тусгай асуулт`);
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
  await run(OPS.qaqcCellOp(u, p1, true));
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
  res = await RTA.applyType(u, 'super');
  ok(!res.ok, `${tag}: super төрөл зөвхөн хатуу super-т`);
  res = await RTA.applyType(SUPER, 'injener');
  ok(!res.ok, `${tag}: хатуу super-ийг доошлуулахгүй`);

  /* Карт «Хадгалах» (харагдац/үүрэг) — `permissions.setUser`: урсгалтай харагдацыг
     картаас засдаггүй (`UserAdmin.TOGGLE_KEYS`); эрхээр нээгдсэн нь хадгалалтаас үл хамаарна */
  const views = stored().filter((v) => v !== 'gdash');
  ok(await P.setUser(u, { views, docs: false }, 'taniltsah'), `${tag}: setUser`);
  await both((w) => {
    ok(!P.resolveAccess(u).views.includes('gdash'), `${tag} ${w}: картаас хаасан харагдац хаагдана`);
    ok(P.resolveAccess(u).views.includes('huvaari'), `${tag} ${w}: «plan» эрхийн «Хуваарь» хадгалалтаас үл хамааран нээлттэй`);
    ok(P.resolveAccess(u).views.includes('qaqc'), `${tag} ${w}: «qaqc» эрхийн харагдац нээлттэй`);
    eq(acl(), aclBefore, `${tag} ${w}: setUser хуваарилалт хөндөхгүй`);
  });

  /* УСТГАХ — `UserAdmin.saveAll`-ийн `remove` салааны ЯГ дараалал */
  const del = async (name) => {
    const rs = [
      await FL.purgeAssign(name), await QA.purgeQaqcAssign(name), await HV.purgeHuvaariAssign(name),
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
  const hard = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'menejer')[0];
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
  ok(await P.clearOverride(hard), `${tag}: сэргээх`);
  ok(await FL.regrantFlowAccess(hard), `${tag}: regrant`);
  await both((w) => {
    eq(P.hasAccess(hard), true, `${tag} ${w}: сэргээсний дараа нэвтэрнэ`);
    eq(FL.stageOfUser(hard), null, `${tag} ${w}: хуучин шат эргэж ирэхгүй`);
    eq(OB.obyemScope(hard, 'editor'), [], `${tag} ${w}: хуучин обьём эргэж ирэхгүй`);
    eq(CAPS.capsOf(hard), [], `${tag} ${w}: хуучин эрх эргэж ирэхгүй`);
    eq(P.roleOf(hard), 'menejer', `${tag} ${w}: хатуу суурь үүрэг`);
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
    OPS.runOp(OPS.qaqcCellOp(v, p1, true), () => {}),
    OPS.runOp(OPS.capDirectOp(v, 'zovshoorol', true), () => {}),
    OPS.runOp(OPS.capDirectOp(v, 'finRow', true), () => {}),
  ]);
  ok(all.every(Boolean), `${tag}: 5 зэрэг бичилт`);
  await settle();
  fake.latency = 0;
  await both((w) => {
    grantIs('huvaari', u, 'approver', [p1, p2, p3], `${tag} ${w}`);
    for (const cap of ['obyemEdit', 'ajilApprove', 'qaqc', 'zovshoorol', 'finRow']) capIs(v, cap, true, `${tag} ${w}`);
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
 *    (в) super-ийн мөрийг бүхэлд нь хасахад түүнд ШУУД олгосон эрх (`plan` · `qaqc`) буцдаг байв
 *        (`aclOps.revokeGoneRoles` · `scopedAcl.syncCaps`). */
{
  const tag = '§9';
  const [p1, p2, p3] = PKG_GROUPS;
  const S2 = Object.entries(ROLE_BY_USER).filter(([, r]) => r === 'super').map(([u]) => u.toLowerCase())[1];
  ok(S2 && S2 !== SUPER.toLowerCase(), `${tag}: хоёр дахь хатуу super`);
  const ghost = 'e2e_ghost_deleted';
  const G = (grants) => JSON.stringify({ roles: [...new Set(grants.map((g) => g.role))], bagts: [...new Set(grants.flatMap((g) => g.bagts))], grants });
  const directCaps = ['plan', 'obyemApprove', 'qaqc', 'zovshoorol'];
  fake.seed([
    { username: `__huvaari__:${ghost}`, views: G([{ role: 'author', bagts: [p1, p2] }]) },
    { username: `__obyem__:${ghost}`, views: G([{ role: 'editor', bagts: ['*'] }]) },
    { username: `__qaqc__:${ghost}`, views: JSON.stringify({ bagts: [p1, p2] }) },
    { username: `__flow__:${ghost}`, views: JSON.stringify({ stage: 'engineer', bagts: [p1, p2] }) },
    { username: `__huvaari__:${S2}`, views: G([{ role: 'author', bagts: [p1, p2] }]) },
    { username: `__obyem__:${S2}`, views: G([{ role: 'approver', bagts: [p1] }]) },
    { username: `__qaqc__:${S2}`, views: JSON.stringify({ bagts: [p1] }) },
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
  r = await run(OPS.qaqcCellOp(ghost, p1, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: ghost qaqc ✕`);
  r = await run(OPS.flowCellOp(ghost, 'engineer', p2, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: ghost урсгал ✕`);
  await both((w) => {
    rowGone('huvaari', ghost, `${tag} ${w}`);
    rowGone('obyem', ghost, `${tag} ${w}`);
    ok(!QA.listQaqcAssigns().some((a) => a.user === ghost), `${tag} ${w}: ghost qaqc мөр алга`);
    eq(fake.find(`__qaqc__:${ghost}`), [], `${tag} ${w}: ghost qaqc ArcGIS мөр алга`);
    eq(FL.stageOfUser(ghost), null, `${tag} ${w}: ghost урсгалгүй`);
    eq(fake.find(`__flow__:${ghost}`), [], `${tag} ${w}: ghost урсгалын ArcGIS мөр алга`);
    noGhostCaps(w);
  });

  /* (б)+(в) хатуу super-ийн хуучин мөр — ✕ бүтнэ, шууд олгосон эрх ХЭВЭЭР */
  r = await run(OPS.scopedCellOp('huvaari', S2, 'author', p1, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: super huvaari ✕ (олон багц) бүтэх ёстой («${r.err}»)`);
  r = await run(OPS.qaqcCellOp(S2, p1, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: super qaqc ✕ («${r.err}»)`);
  r = await run(OPS.flowCellOp(S2, 'manager', p1, false));
  ok(r.ok && r.confirms.length === 0, `${tag}: super урсгал ✕ (олон багц) бүтэх ёстой («${r.err}»)`);
  /* хуучин op (`dropRoleOp` → `revokeGoneRoles`) ба lib-ийн анхдагч revoke (`syncCaps`) ч super-ийн эрхийг хөндөхгүй */
  r = await run(OPS.dropRoleOp('obyem', S2, 'approver'));
  ok(r.ok, `${tag}: dropRoleOp super`);
  await both((w) => {
    rowGone('huvaari', S2, `${tag} ${w}`);
    rowGone('obyem', S2, `${tag} ${w}`);
    ok(!QA.listQaqcAssigns().some((a) => a.user === S2), `${tag} ${w}: super qaqc мөр алга`);
    eq(fake.find(`__flow__:${S2}`), [], `${tag} ${w}: super урсгалын мөр алга`);
    eq(sorted(CAPS.capsOf(S2)), sorted(directCaps), `${tag} ${w}: super-т ШУУД олгосон эрх хэвээр`);
    eq(sorted(fake.json('__cap__:', S2)), sorted(directCaps), `${tag} ${w}: ArcGIS __cap__ хэвээр`);
  });
  fake.seed([{ username: `__qaqc__:${S2}`, views: JSON.stringify({ bagts: [p2] }) }]);
  await roundTrip();
  await QA.removeQaqcAssign(S2).sync; await settle();
  await both((w) => eq(sorted(CAPS.capsOf(S2)), sorted(directCaps), `${tag} ${w}: removeQaqcAssign(revoke) super-ийн qaqc-ийг буцаахгүй`));
  console.log('✅ §9 цэвэрлэх мөр: устгагдсан аккаунтын ✕ — мөр бүхэлдээ, эрх үүсэхгүй · super-ийн хуучин мөр — ✕ бүтнэ, шууд олгосон эрх хэвээр');
}

eq(fake.unexpected, [], 'амьд сүлжээ рүү хүсэлт явах ёсгүй');
console.log(`✅ aclE2E: ${checks} шалгалт — бүгд давлаа (ArcGIS бичилт ${fake.edits}, хуурамч хүснэгтэд)`);
