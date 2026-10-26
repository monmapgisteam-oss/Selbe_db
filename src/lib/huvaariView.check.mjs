/**
 * «ХУВААРЬ» ХАРАХ ХҮРЭЭ — хуурамч ArcGIS дээр (⚠️ 2026-10-26, хэрэглэгчийн шийдвэр).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/huvaariView.check.mjs
 *
 * Хамгаалж буй шийдвэрүүд:
 *   §1 эрхийн төрлийн «Хуваарь харах» (Бүх багц · Өөрийн багц · Үгүй) — анхдагч утгууд; хадгалсан загварт тэмдэггүй бол
 *      анхдагч, тэмдэгтэй бол хадгалсан утга (`roleTypes.withPlanDefault`); мөрийг дахин бичихгүй.
 *   §2 хүрээ = төрөл ∪ зохиогч ∪ батлагч; «Өөрийн багц» = урсгал · хуваарь · нэмэлт ажил · обьём · дэд бүтэц
 *      (`huvaariView.huvaariViewScope`) — «Хуваарь» цэс зөвхөн хүрээ хоосон биш үед (`permissions.workflowViewsOf`).
 *   §3 ⚠️ 2026-10-26 (хэрэглэгч: «Харагч хэрэггүй»): «Хуваарийн эрх»-ийн «Харагч» (`viewer`) ХАСАГДСАН. ArcGIS-д үлдсэн
 *      `viewer` grant ЧИМЭЭГҮЙ хаягдана — хүрээ/эрх нээхгүй, өнчин/дутуу/танигдахгүй анхааруулгагүй, дараагийн бичилтэд
 *      мөрөөс арилна; картын эх сурвалж («Эрхийн төрөл · Бүх багц») ↔ `resolveAccess`.
 *   §5 ⚠️ 2026-10-26: карт ↔ `resolveAccess` — «Ерөнхий захирал»-ын «Гүйцэтгэл» (төрлөөр, томилгоогүй) ба ТАНИГДААГҮЙ
 *      багцтай хуваарилалт («Хуваарь»-ыг нээхгүй — `huvaariViewScope` `PKG_GROUPS`-ээр шүүдэг).
 *   §4 «Хуваарь» хуудасны бичих зам бүр засах эрхээр хаалттай (эх код) · «Зөвхөн харах» тэмдэг · `ErhTypes` сонгогч ·
 *      «Хуваарийн эрх» хоёр баганатай.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fake, takeConfirms, settle } from './aclE2E.fake.mjs';

const { ROLE_BY_USER, bagtsKey } = await import('@/lib/services.ts');
const SUPER = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'super')[0];
fake.owner = SUPER;

const P = await import('@/lib/permissions.ts');
const CAPS = await import('@/lib/caps.ts');
const OPS = await import('@/lib/aclOps.ts');
OPS.setHeldByReader(async () => []);
const HV = await import('@/lib/huvaariAcl.ts');
const RT = await import('@/lib/roleTypes.ts');
const HVV = await import('@/lib/huvaariView.ts');
const ERH = await import('@/lib/erhOverview.ts');
const WF = await import('@/lib/workflowSources.ts');
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');
const { BUTETS_PACKS } = await import('@/lib/butetsPacks.ts');

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

/* ── §0 FAIL-CLOSED: синкээс өмнө төрлийн хүрээ «Үгүй», уншигчийн хүрээ хоосон ── */
for (const r of RT.TYPE_ORDER) eq(RT.typeHuvaariScope(r), 'none', `§0 ${r}: синкээс өмнө «Үгүй» (fail-closed)`);
eq(RT.typeHuvaariScope('beginner'), 'none', '§0 хуучин үүрэг — «Үгүй»');

/* ══════════ Аккаунт ба хадгалсан загвар ══════════ */
const U = {
  tan: 'hv_tan', gui: 'hv_gui', chan: 'hv_chan', gaz: 'hv_gaz', inj: 'hv_inj', men: 'hv_men', hel: 'hv_hel', zah: 'hv_zah', ed: 'hv_ed',
  lv: 'hv_lv', unk: 'hv_unk', unk2: 'hv_unk2',
};
/* ⚠️ 2026-10-26: нэр нь солигдсон (`PKG_GROUPS`-д алга) багц */
const UNK = 'Багц 99 (хуучин нэр)';
const [g1, g2, g3] = PKG_GROUPS;
fake.seed([
  { username: U.tan, role: 'taniltsah', views: JSON.stringify(['gdash']) },
  { username: U.gui, role: 'guitsetgegch', views: JSON.stringify(['gdash']) },
  { username: U.chan, role: 'chanar', views: JSON.stringify(['gdash']) },
  { username: U.gaz, role: 'gazar', views: JSON.stringify(['gdash']) },
  { username: U.inj, role: 'injener', views: JSON.stringify(['gdash']) },
  { username: U.men, role: 'menejer', views: JSON.stringify(['gdash']) },
  { username: U.hel, role: 'heltsiin', views: JSON.stringify(['gdash']) },
  { username: U.zah, role: 'zahiral', views: JSON.stringify(['gdash']) },
  { username: U.ed, role: 'chanar', views: JSON.stringify(['gdash']) },
  { username: U.lv, role: 'chanar', views: JSON.stringify(['gdash']) },
  /* ⚠️ 2026-10-26: ХУУЧИН «Харагч» (`viewer`) grant-тай мөрүүд — ганцхан харагч · зохиогч+харагч */
  { username: `__huvaari__:${U.lv}`, views: JSON.stringify({ roles: ['viewer'], bagts: [g2], grants: [{ role: 'viewer', bagts: [g2] }] }) },
  { username: `__huvaari__:${U.ed}`, views: JSON.stringify({
    roles: ['author', 'viewer'], bagts: [g1, g2], grants: [{ role: 'author', bagts: [g1] }, { role: 'viewer', bagts: [g2] }],
  }) },
  { username: `__cap__:${U.ed}`, views: JSON.stringify(['plan']) },
  /* ⚠️ 2026-10-26: танигдаагүй багцтай хуваарилалт — «Өөрийн багц» төрлийн обьём · «Үгүй» төрлийн зохиогч (plan эрхгүй) */
  { username: U.unk, role: 'injener', views: JSON.stringify(['gdash']) },
  { username: U.unk2, role: 'chanar', views: JSON.stringify(['gdash']) },
  { username: `__obyem__:${U.unk}`, views: JSON.stringify({ roles: ['editor'], bagts: [UNK], grants: [{ role: 'editor', bagts: [UNK] }] }) },
  { username: `__huvaari__:${U.unk2}`, views: JSON.stringify({ roles: ['author'], bagts: [UNK], grants: [{ role: 'author', bagts: [UNK] }] }) },
  /* «Багцын ахлах инженер» — ЭНЭ тохиргооноос ӨМНӨ хадгалсан (тэмдэггүй) мөр → анхдагч «Өөрийн багц» */
  { username: '__type__:menejer', views: JSON.stringify({ on: ['view:gdash'], home: 'gdash', seen: RT.tplViewKeys() }) },
  /* «Хэлтсийн дарга» — админ «Үгүй» гэж шийдсэн (тэмдэгтэй) мөр → «Үгүй» (анхдагч «Бүх багц» биш) */
  { username: '__type__:heltsiin', views: JSON.stringify({ on: ['view:gdash'], home: 'gdash', seen: RT.tplSeenKeys() }) },
]);

async function run(op) {
  takeConfirms();
  let err = '';
  const res = await OPS.runOp(op, (m) => { err = m; });
  await settle();
  return { ok: res, err };
}
await settle();
ok(await P.initRemote(false, true), 'initRemote хуурамч хүснэгтээс');
await settle();
ok(OPS.allAclReady(), 'бүх туг бэлэн');
const views = (u) => P.resolveAccess(u)?.views ?? [];
const rowsOf = (u) => WF.workflowRows(ERH.userErh(OPS.liveErhSource(), u));
const hvRow = (u) => rowsOf(u).find((r) => r.view === 'huvaari');
const agree = (u, tag) => eq(hvRow(u).open, views(u).includes('huvaari'), `${tag} ${u}: карт ↔ resolveAccess (huvaari)`);

/* ── §1 анхдагч ба хадгалсан загвар ── */
{
  const want = {
    guitsetgegch: 'own', injener: 'own', menejer: 'own', tolovloltiin: 'all', eronhii: 'all', heltsiin: 'none',
    gazriin: 'all', zahiral: 'all', taniltsah: 'all', chanar: 'none', gazar: 'none', super: 'all',
  };
  for (const r of RT.TYPE_ORDER) eq(RT.typeHuvaariScope(r), want[r], `§1 ${r}: «Хуваарь харах» = ${want[r]}`);
  /* тэмдэггүй хадгалсан мөр — хүснэгтэд ДАХИН бичигдээгүй */
  eq(JSON.parse(fake.rows.find((x) => x.username === '__type__:menejer').views).on, ['view:gdash'], '§1 хадгалсан мөр хөндөгдөөгүй');
  /* cleanTpl — хоёулаа байвал НАРИЙН нь; танигдахгүй `view:huvaari` хаягдана */
  eq(RT.hvScopeOf(RT.cleanTpl('injener', { on: [RT.HV_ALL, RT.HV_OWN], home: 'gdash' }).on), 'own', '§1 эвдэрсэн мөр → own');
  ok(!RT.cleanTpl('injener', { on: ['view:huvaari'], home: 'gdash' }).on.includes('view:huvaari'), '§1 хуучин view:huvaari хаягдана');
  /* `views` талбар 2048 тэмдэгтэд багтана — хамгийн өргөн загвар */
  const widest = { on: [...RT.settingGroups().flatMap((g) => g.rows.map((x) => x.id)).filter((id) => id.startsWith('view:')), 'docs', 'admin', RT.HV_OWN], home: 'gdash', seen: RT.tplSeenKeys() };
  ok(JSON.stringify(widest).length < 2048, `§1 загварын JSON ${JSON.stringify(widest).length} < 2048`);
  console.log('✅ §1 «Хуваарь харах» анхдагч · тэмдэггүй мөрд анхдагч · тэмдэгтэй мөрд хадгалсан утга · 2048-д багтана');
}

/* ── §2 хүрээ ── */
{
  const tag = '§2';
  eq(HVV.huvaariViewScope(U.tan), null, `${tag} мэдээлэл танилцах → бүх багц`);
  eq(HVV.huvaariViewScope(U.zah), null, `${tag} ерөнхий захирал → төрлийнхөө утга (бүх багц)`);
  eq(HVV.huvaariViewScope(SUPER), null, `${tag} хатуу super → бүх багц`);
  ok(views(U.tan).includes('huvaari'), `${tag} бүх багц → «Хуваарь» цэс`);
  eq(HVV.huvaariViewScope(U.gui), [], `${tag} гүйцэтгэгч (өөрийн багц), хуваарилалтгүй → хоосон`);
  ok(!views(U.gui).includes('huvaari'), `${tag} хоосон хүрээ → «Хуваарь» цэсгүй`);
  eq(HVV.huvaariViewScope(U.hel), [], `${tag} «Үгүй» гэж хадгалсан төрөл → хоосон`);
  eq(HVV.huvaariViewScope(U.gaz), [], `${tag} газар чөлөөлөлт → хоосон`);
  agree(U.gui, tag); agree(U.tan, tag);

  /* өөрийн багц — урсгалын томилгоо */
  ok((await run(OPS.flowCellOp(U.gui, 'company', g1, true))).ok, `${tag} урсгал`);
  eq(HVV.huvaariViewScope(U.gui), [g1], `${tag} өөрийн багц = урсгалын багц`);
  ok(views(U.gui).includes('huvaari'), `${tag} өөрийн багцтай → «Хуваарь» цэс`);
  agree(U.gui, tag);
  eq(HV.huvaariScope(U.gui, 'author'), [], `${tag} харах хүрээ засах эрх БИШ`);

  /* өөрийн багц — обьём · дэд бүтэц (BUTETS түлхүүр → багцын нэр) */
  ok((await run(OPS.scopedCellOp('obyem', U.inj, 'editor', g2, true))).ok, `${tag} обьём`);
  const gB = PKG_GROUPS.find((g) => g !== g2 && BUTETS_PACKS.some((p) => p.key === bagtsKey(g)));
  if (gB) ok((await run(OPS.scopedCellOp('butets', U.inj, 'editor', bagtsKey(gB), true))).ok, `${tag} дэд бүтэц`);
  eq(HVV.huvaariViewScope(U.inj), PKG_GROUPS.filter((g) => g === g2 || g === gB), `${tag} өөрийн багц = обьём ∪ дэд бүтэц`);

  /* «Үгүй» төрөл — зөвхөн «Хуваарийн эрх»-ийн батлагчийн багц */
  ok((await run(OPS.scopedCellOp('huvaari', U.chan, 'approver', g3, true))).ok, `${tag} батлагч`);
  eq(HVV.huvaariViewScope(U.chan), [g3], `${tag} «Үгүй» төрөл + батлагч → тэр багц л`);
  ok(views(U.chan).includes('huvaari'), `${tag} батлагч → «Хуваарь»`);
  agree(U.chan, tag);
  ok(HVV.canViewHuvaari(U.chan, g3) && !HVV.canViewHuvaari(U.chan, g1), `${tag} canViewHuvaari`);
  console.log('✅ §2 хүрээ = төрөл ∪ зохиогч ∪ батлагч; өөрийн багц = хуваарилалтууд; цэс ↔ хүрээ');
}

/* ── §3 ХУУЧИН «Харагч» (`viewer`) grant ЧИМЭЭГҮЙ хаягдана (⚠️ 2026-10-26, хэрэглэгч: «Харагч хэрэггүй») ── */
{
  const tag = '§3';
  /* ганцхан харагч — хуваарилалт огт байхгүй мэт */
  eq(HV.huvaariScope(U.lv, 'author'), [], `${tag} харагч — зохиогчийн хүрээ хоосон`);
  eq(HV.huvaariScope(U.lv, 'approver'), [], `${tag} харагч — батлагчийн хүрээ хоосон`);
  eq(HVV.huvaariViewScope(U.lv), [], `${tag} харагч — харах хүрээнд ОРОХГҮЙ`);
  ok(!views(U.lv).includes('huvaari'), `${tag} харагч — «Хуваарь» цэсгүй`);
  ok(!HV.listHuvaariAssigns().some((x) => x.user === U.lv), `${tag} харагч — самбарын жагсаалтад алга`);
  const e = ERH.userErh(OPS.liveErhSource(), U.lv);
  eq(e.huvaari, [], `${tag} харагч — эрхийн тойм хоосон`);
  eq(ERH.orphanCaps(e), [], `${tag} өнчин эрх алга`);
  eq(ERH.missingCaps(e), [], `${tag} дутуу эрх алга`);
  eq(e.unknownBagts, [], `${tag} танигдахгүй багц алга`);
  eq(hvRow(U.lv).sources, [], `${tag} картын эх сурвалж алга`);
  agree(U.lv, tag);
  ok(!ERH.unknownPkgUsers(OPS.liveErhSource()).some((x) => x.user === U.lv), `${tag} unknownPkgUsers-д алга`);

  /* зохиогч + харагч — зохиогч л үлдэнэ; дараагийн бичилтэд `viewer` мөрөөс арилна */
  eq(HV.huvaariScope(U.ed, 'author'), [g1], `${tag} зохиогч хэвээр`);
  eq(HVV.huvaariViewScope(U.ed), [g1], `${tag} харах хүрээ = зохиогчийн багц л`);
  ok(HV.listHuvaariAssigns().find((x) => x.user === U.ed).grants.every((g) => g.role !== 'viewer'), `${tag} жагсаалтад viewer алга`);
  const e2 = ERH.userErh(OPS.liveErhSource(), U.ed);
  eq(ERH.orphanCaps(e2), [], `${tag} зохиогч+харагч — өнчин эрх алга`);
  eq(ERH.missingCaps(e2), [], `${tag} зохиогч+харагч — дутуу эрх алга`);
  ok(hvRow(U.ed).sources.every((x) => x.role !== 'viewer'), `${tag} картын эх сурвалжид viewer алга`);
  agree(U.ed, tag);
  ok((await run(OPS.scopedCellOp('huvaari', U.ed, 'author', g3, true))).ok, `${tag} зохиогч нэмэх`);
  const row = fake.json('__huvaari__:', U.ed);
  ok(row.grants.every((g) => g.role !== 'viewer') && !row.roles.includes('viewer'), `${tag} бичилтийн дараа мөрөнд viewer алга`);
  eq(HV.huvaariScope(U.ed, 'author'), [g1, g3], `${tag} зохиогч g1 · g3`);

  const st = hvRow(U.tan).sources.find((x) => x.sys === 'type');
  ok(st && st.role === 'all' && st.bagts === null && st.viewOnly, `${tag} эх сурвалж «Эрхийн төрөл · Бүх багц»`);
  ok(!OPS.SCOPED_SYS.huvaari.roles.includes('viewer'), `${tag} SCOPED_SYS.huvaari.roles-д viewer алга`);
  console.log('✅ §3 хуучин «Харагч» grant чимээгүй хаягдана · анхааруулгагүй · бичилтэд арилна');
}

/* ── §5 карт ↔ resolveAccess: «Ерөнхий захирал»-ын «Гүйцэтгэл» · танигдаагүй багц (⚠️ 2026-10-26) ── */
{
  const tag = '§5';
  const gz = rowsOf(U.zah).find((r) => r.view === 'guitsetgel');
  ok(views(U.zah).includes('guitsetgel'), `${tag} ерөнхий захирал — «Гүйцэтгэл» нээлттэй (төрлөөр)`);
  eq(gz.open, true, `${tag} ерөнхий захирал — карт «Гүйцэтгэл» нээлттэй`);
  ok(gz.sources.some((x) => x.sys === 'type' && x.role === 'zahiral' && x.bagts === null && x.viewOnly),
    `${tag} эх сурвалж «Эрхийн төрөл · Ерөнхий захирал · зөвхөн харна»`);
  for (const u of [U.tan, U.gui, U.chan]) {
    eq(rowsOf(u).find((r) => r.view === 'guitsetgel').open, views(u).includes('guitsetgel'), `${tag} ${u}: карт ↔ resolveAccess (guitsetgel)`);
  }
  /* танигдаагүй багц — «Өөрийн багц» төрлийн хүрээ хоосон, plan эрхгүй зохиогч ч нээхгүй */
  eq(HVV.huvaariViewScope(U.unk), [], `${tag} танигдаагүй обьёмын багц → хүрээ хоосон`);
  ok(!views(U.unk).includes('huvaari'), `${tag} танигдаагүй багц → «Хуваарь» цэсгүй`);
  eq(hvRow(U.unk).open, false, `${tag} танигдаагүй обьёмын багц → карт хаалттай`);
  ok(!hvRow(U.unk).sources.some((x) => x.sys === 'type'), `${tag} танигдаагүй багц → «Өөрийн багц» эх сурвалжгүй`);
  agree(U.unk, tag);
  eq(HVV.huvaariViewScope(U.unk2), [], `${tag} танигдаагүй багцын зохиогч → хүрээ хоосон`);
  eq(hvRow(U.unk2).open, false, `${tag} танигдаагүй багцын зохиогч → карт хаалттай`);
  agree(U.unk2, tag);
  console.log('✅ §5 ерөнхий захирлын «Гүйцэтгэл» картад нээлттэй · танигдаагүй багц «Хуваарь» нээхгүй');
}

/* ── §4 «Хуваарь» хуудас — бичих зам засах эрхээр хаалттай (эх код) ── */
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  const hv = strip(fs.readFileSync('src/modules/Huvaari.tsx', 'utf8'));
  ok(/const viewOnly = !review && status !== 'off' && !canEditRole && !canApprove && !canAddRow;/.test(hv), '§4 viewOnly = засах · батлах · мөр нэмэх эрхгүй');
  ok(/viewOnly && \(\s*<span className=\{h\.roBadge\}/.test(hv), '§4 «Зөвхөн харах» тэмдэг');
  ok(/if \(!dirtyN \|\| busy \|\| previewing \|\| !canEdit\) return;/.test(hv), '§4 илгээх — засах эрхгүй бол хаалттай');
  ok(/canEditRole = useMemo\([\s\S]{0,120}huvaariScope\(user\?\.username, 'author'\)/.test(hv), '§4 засах эрх = зохиогчийн хүрээ (харах хүрээ БИШ)');
  ok(/canApprove = useMemo\([\s\S]{0,120}huvaariScope\(user\?\.username, 'approver'\)/.test(hv), '§4 батлах эрх = батлагчийн хүрээ');
  ok(/if \(!canApprove\) \{ setErr/.test(hv), '§4 шийдвэрлэх — батлагчийн хүрээгүй бол хаалттай');
  ok(!/huvaariViewScope\([^)]*\)[\s\S]{0,40}canEdit/.test(hv), '§4 харах хүрээ засах эрхэд нөлөөлөхгүй');
  const sd = strip(fs.readFileSync('src/modules/huvaari/useSharedDraft.ts', 'utf8'));
  ok(/const hdWritable = canEdit && /.test(sd), '§4 хуваалцсан ноорог — засах эрхгүй бол бичихгүй');
  const aj = strip(fs.readFileSync('src/modules/huvaari/useAjil.ts', 'utf8'));
  ok(/if \(!canAddRow\) continue;/.test(aj), '§4 нэмэлт ажил — мөр нэмэх эрхгүй бол бичихгүй');
  const dp = strip(fs.readFileSync('src/modules/huvaari/useDragPlan.ts', 'utf8'));
  ok(/if \(!canEdit \|\| locked \|\| busy\)/.test(dp), '§4 чирэлт — засах эрхгүй бол хөдлөхгүй');
  const pm = strip(fs.readFileSync('src/modules/huvaari/PlanModal.tsx', 'utf8'));
  ok(/if \(!canEdit \|\| applyOff\) return;/.test(pm), '§4 PlanModal «Тавих» — засах эрхгүй бол хаалттай');
  const hb = strip(fs.readFileSync('src/lib/huvaariBatlah.ts', 'utf8'));
  ok(/huvaariScope\(meNow \?\? args\.author, 'author'\)/.test(hb), '§4 lib submitPlan — зохиогчийн хүрээ');
  const et = fs.readFileSync('src/modules/ErhTypes.tsx', 'utf8');
  ok(et.includes("<option value=\"all\">{tr('Бүх багц')}</option>") && et.includes("<option value=\"own\">{tr('Өөрийн багц')}</option>")
    && et.includes("<option value=\"none\">{tr('Үгүй')}</option>"), '§4 ErhTypes — «Хуваарь харах» сонгогч 3 утгатай');
  const ha = fs.readFileSync('src/modules/HuvaariAcl.tsx', 'utf8');
  ok(ha.includes("roles: ['author', 'approver'],") && !ha.includes("'viewer'"), '§4 «Хуваарийн эрх» — хоёр багана («Харагч» алга)');
  console.log('✅ §4 бичих зам бүр засах/батлах/мөр нэмэх эрхээр · «Зөвхөн харах» тэмдэг · ErhTypes · хоёр багана');
}

eq(fake.unexpected, [], 'амьд сүлжээ рүү хүсэлт явах ёсгүй');
console.log(`✅ huvaariView: ${checks} шалгалт — бүгд давлаа`);
