/**
 * «ХУВААРЬ» ХАРАХ ХҮРЭЭ — хуурамч ArcGIS дээр (⚠️ 2026-10-26, хэрэглэгчийн шийдвэр).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/huvaariView.check.mjs
 *
 * Хамгаалж буй шийдвэрүүд:
 *   §1 эрхийн төрлийн «Хуваарь харах» (Бүх багц · Өөрийн багц · Үгүй) — анхдагч утгууд; хадгалсан загварт тэмдэггүй бол
 *      анхдагч, тэмдэгтэй бол хадгалсан утга (`roleTypes.withPlanDefault`); мөрийг дахин бичихгүй.
 *   §2 хүрээ = төрөл ∪ «Харагч» ∪ зохиогч ∪ батлагч; «Өөрийн багц» = урсгал · хуваарь · нэмэлт ажил · обьём · дэд бүтэц
 *      (`huvaariView.huvaariViewScope`) — «Хуваарь» цэс зөвхөн хүрээ хоосон биш үед (`permissions.workflowViewsOf`).
 *   §3 «Харагч» ЭРХ ОЛГОХГҮЙ (`plan`/`planApprove` алга, засах/батлах хүрээ `[]`); зохиогчийг хасаад харагч үлдэхэд
 *      `plan` эрх буцаагдана; картын эх сурвалж («Хуваарийн эрх · Харагч», «Эрхийн төрөл · Бүх багц») ↔ `resolveAccess`.
 *   §4 «Хуваарь» хуудасны бичих зам бүр засах эрхээр хаалттай (эх код) · «Зөвхөн харах» тэмдэг · `ErhTypes` сонгогч.
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
};
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
const [g1, g2, g3] = PKG_GROUPS;

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

  /* «Үгүй» төрөл — зөвхөн «Харагч» */
  ok((await run(OPS.scopedCellOp('huvaari', U.chan, 'viewer', g3, true))).ok, `${tag} харагч`);
  eq(HVV.huvaariViewScope(U.chan), [g3], `${tag} «Үгүй» төрөл + харагч → тэр багц л`);
  ok(views(U.chan).includes('huvaari') && !views(U.chan).includes('huvaariBatlah'), `${tag} харагч → «Хуваарь» л`);
  agree(U.chan, tag);
  ok(HVV.canViewHuvaari(U.chan, g3) && !HVV.canViewHuvaari(U.chan, g1), `${tag} canViewHuvaari`);
  console.log('✅ §2 хүрээ = төрөл ∪ харагч ∪ зохиогч ∪ батлагч; өөрийн багц = хуваарилалтууд; цэс ↔ хүрээ');
}

/* ── §3 «Харагч» эрх олгохгүй · зохиогч хасагдахад эрх буцна · эх сурвалж ── */
{
  const tag = '§3';
  const caps = (u) => CAPS.capsOf(u);
  ok(!caps(U.chan).includes('plan') && !caps(U.chan).includes('planApprove'), `${tag} харагч — plan/planApprove эрхгүй`);
  eq(HV.huvaariScope(U.chan, 'author'), [], `${tag} харагч — зохиогчийн хүрээ хоосон`);
  eq(HV.huvaariScope(U.chan, 'approver'), [], `${tag} харагч — батлагчийн хүрээ хоосон`);
  eq(fake.json('__cap__:', U.chan) ?? [], [], `${tag} харагч — ArcGIS __cap__ мөр алга`);
  const e = ERH.userErh(OPS.liveErhSource(), U.chan);
  eq(ERH.orphanCaps(e), [], `${tag} өнчин эрх алга`);
  eq(ERH.missingCaps(e), [], `${tag} дутуу эрх алга (харагч эрх шаардахгүй)`);
  const src = hvRow(U.chan).sources;
  ok(src.length === 1 && src[0].sys === 'huvaari' && src[0].role === 'viewer' && src[0].viewOnly, `${tag} эх сурвалж «Хуваарийн эрх · Харагч»`);
  const st = hvRow(U.tan).sources.find((x) => x.sys === 'type');
  ok(st && st.role === 'all' && st.bagts === null && st.viewOnly, `${tag} эх сурвалж «Эрхийн төрөл · Бүх багц»`);
  eq(WF.ungrantedCaps(rowsOf(U.chan)), [], `${tag} «Дахин олгох» гарахгүй`);

  /* зохиогч + харагч → зохиогчийг хасахад plan буцна, харагч үлдэнэ */
  ok((await run(OPS.scopedCellOp('huvaari', U.ed, 'author', g1, true))).ok, `${tag} зохиогч`);
  ok((await run(OPS.scopedCellOp('huvaari', U.ed, 'viewer', g2, true))).ok, `${tag} харагч`);
  ok(caps(U.ed).includes('plan'), `${tag} зохиогч → plan`);
  ok((await run(OPS.scopedCellOp('huvaari', U.ed, 'author', g1, false))).ok, `${tag} зохиогч хасах`);
  ok(!caps(U.ed).includes('plan'), `${tag} зохиогч хасагдахад plan буцав (харагч эрх барихгүй)`);
  eq(HVV.huvaariViewScope(U.ed), [g2], `${tag} харагч үлдэв`);
  agree(U.ed, tag);
  console.log('✅ §3 «Харагч» эрх олгохгүй · эрхийн зөрүү/өнчин анхааруулгагүй · эх сурвалж ↔ resolveAccess');
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
  ok(ha.includes("roles: ['author', 'approver', 'viewer']"), '§4 «Хуваарийн эрх» — «Харагч» багана');
  console.log('✅ §4 бичих зам бүр засах/батлах/мөр нэмэх эрхээр · «Зөвхөн харах» тэмдэг · ErhTypes · «Харагч» багана');
}

eq(fake.unexpected, [], 'амьд сүлжээ рүү хүсэлт явах ёсгүй');
console.log(`✅ huvaariView: ${checks} шалгалт — бүгд давлаа`);
