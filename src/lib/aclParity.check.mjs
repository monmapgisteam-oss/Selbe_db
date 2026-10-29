/**
 * ЭРХИЙН ДЭД СИСТЕМҮҮДИЙН ТЭГШ БАЙДАЛ — offline эх кодын гэрээ.
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/aclParity.check.mjs
 *
 * Эрхийн систем нь БАРАГ ИЖИЛ дөрвөн ACL модуль (`guitsetgel` · `qaqc` ·
 * `huvaari` · `obyem`) ба UserAdmin доторх ГУРВАН БАРАГ ИЖИЛ салаанаас
 * («qaqc», «plan», «obyem») бүрддэг. Шалгалтаар олдсон 13 алдааны 7 нь ЯГ
 * НЭГ хэв шинжтэй байв: **засвар нь ижил кодын НЭГД нь л хүрч, бусад руу
 * хуулагдаагүй**.
 *
 *   · 2026-09-07-нд `qaqc` салаанд super-ийн шалгалт нэмэгдсэн →
 *     `plan` салаанд хуулагдаагүй тул 7 super админ «Хуваарь»-ийг зөвхөн
 *     уншдаг болж, дээрээс нь ХУДАЛ алдаа харуулж байв.
 *   · 2026-09-08-нд `remove*Assign` дээр `r.ok && r.g` болгосон →
 *     `set*Assign` талд хуулагдаагүй тул эрх олгох унасныг «амжилттай»
 *     гэж мэдээлдэг байв (3 модульд зэрэг).
 *
 * Ийм зөрүүг ажиллуулж барих боломжгүй (ArcGIS шаардана) тул ЭХ КОДЫГ
 * шууд тулгана. Шинэ ACL модуль нэмэхэд энэ тест түүнийг ч мөн шалгуурт
 * оруулах ёстой — жагсаалтад нэмнэ.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
/**
 * ТАЙЛБАРГҮЙ эх код — шалгуурууд нь кодын БОДИТ бичилтийг тулгах ёстой.
 */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const readCode = (p) => strip(read(p));
/** §14-ийн товч туслах (2026-10-19) */
const ok14 = (c, m) => assert.ok(c, m);

/**
 * `<scopeFn>(…) ?? []`  ба  `<scopeFn>(…) || []` хэв шинж.
 */
const BAD_SCOPE = '\\([^)]*\\)\\s*(\\?\\?|\\|\\|)\\s*\\[\\]';

/* ══════════ 1. set*Assign ба remove*Assign нь ИЖИЛ хатуу шалгууртай ══════════ */
/**
 * Гурван бүрхүүл (`qaqcAcl` · `huvaariAcl` · `obyemAcl`) нь `makeAcl`-ийг
 * дуудахаас өөр логикгүй байх ЁСТОЙ — тэдгээрт `markResult` дахин гарч ирвэл
 * давхардал буцаж ирсэн гэсэн үг (доорх 1b шалгуур барина).
 */
{
  const core = readCode('src/lib/scopedAcl.ts');
  const weak = core.match(/markResult\(u,\s*r\.ok\)(?!\s*&&)/g) ?? [];
  assert.equal(weak.length, 0,
    'scopedAcl: markResult(u, r.ok) үлдсэн — эрх олголтын үр дүнг залгиж байна. '
    + '`r.ok && r.g` байх ёстой (set ба remove ХОЁУЛАА).');

  const strong = core.match(/markResult\(u,\s*r\.ok\s*&&\s*r\.g\)/g) ?? [];
  assert.equal(strong.length, 3,
    `scopedAcl: markResult(u, r.ok && r.g) нь ЯГ 3 удаа (set + remove + retry) байх ёстой, олдсон: ${strong.length}`);

  /* `sync` буцаах утга нь мөн адил хоёуланг барина */
  const ret = core.match(/return r\.ok\s*&&\s*r\.g;/g) ?? [];
  assert.equal(ret.length, 3,
    `scopedAcl: sync нь 'r.ok && r.g' буцаах ёстой (3 газар), олдсон: ${ret.length}`);

  assert.match(core, /revoke\s*&&\s*!load\(\)\.some\(\(a\) => a\.user === u\)\s*\?\s*await syncCaps\(u,\s*\[\] as R\[\]\)/,
    'scopedAcl.removeAssign: revoke нь дахин хуваарилагдсан эсэхийг шалгах ёстой');
  assert.doesNotMatch(core, /const g = revoke \? await syncCaps\(u, \[\] as R\[\]\) : true;/,
    'scopedAcl.removeAssign: болзолгүй syncCaps(u, []) эргэж ирэв');
  const g = readCode('src/lib/guitsetgelAcl.ts');
  assert.match(g, /revoke\s*&&\s*!stageOfUser\(u\)\s*\?\s*await revokeFlowAccess/,
    'guitsetgelAcl.removeAssign: дахин томилогдсон хүний эрхийг буцаах ёсгүй');

  for (const [f, flag] of [
    ['src/lib/scopedAcl.ts', 'let remoteSynced = false;'],
    ['src/lib/guitsetgelAcl.ts', 'let remoteSynced = false;'],
    ['src/lib/caps.ts', 'let remoteSynced = false;'],
  ]) {
    const src = readCode(f);
    assert.ok(src.includes(flag), `${f}: «${flag}» алга — remote-гүй сешнд localStorage хүчинтэй болно`);
    assert.ok(src.includes('remoteSynced = true;'), `${f}: sync нь тугийг асаахгүй байна`);
  }
  assert.match(readCode('src/lib/caps.ts'), /export function capsOf[\s\S]{0,200}if \(!remoteSynced\) return \[\];/,
    'caps.capsOf: remote-гүй бол хоосон буцаах ёстой');
}
console.log('✅ scopedAcl — set ба remove ижил хатуу шалгуур (r.ok && r.g)');

/* ══════════ 1b. Гурван бүрхүүл НИМГЭН хэвээр — давхардал буцаж ирээгүй ══════════ */
const ACL_FILES = [
  ['src/lib/huvaariAcl.ts', 'huvaari'],
  ['src/lib/obyemAcl.ts', 'obyem'],
  ['src/lib/chanarAcl.ts', 'chanar'],
  ['src/lib/butetsAcl.ts', 'butets'],
];
for (const [f, name] of ACL_FILES) {
  const src = readCode(f);
  assert.match(src, /makeAcl</,
    `${name}: `);
  for (const dup of ['markResult', 'function enqueue', 'function save(', 'localStorage']) {
    assert.doesNotMatch(src, new RegExp(dup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${name}: «${dup}» бүрхүүлд эргэж ирэв — логик нь \`scopedAcl.ts\`-д байх ёстой. `
      + 'Давхардал буцаж ирвэл «нэгд нь зассан, бусдад хуулаагүй» алдаа дахин эхэлнэ.');
  }
}
console.log('✅ гурван бүрхүүл нимгэн — логик цөмд хэвээр');

/* ══════════ 2. _syncRemote* нь username-ыг trim() хийнэ ══════════ */
const SYNC_FILES = [
  ['src/lib/scopedAcl.ts', 'const syncRemote'],
  ['src/lib/guitsetgelAcl.ts', 'export function _syncRemoteAssigns'],
  ['src/lib/caps.ts', 'export function _syncRemoteCaps'],
];
for (const [f, decl] of SYNC_FILES) {
  const src = readCode(f);
  const i = src.indexOf(decl);
  assert.ok(i > 0, `${f}: «${decl}» олдсонгүй`);
  const body = src.slice(i, i + 1400);
  assert.ok(/\.trim\(\)\.toLowerCase\(\)/.test(body),
    `${f}: ${decl} нь username-ыг trim().toLowerCase() хийх ёстой — бичих талтай таарахгүй болно`);
  assert.ok(!/r\.user\.toLowerCase\(\)/.test(body),
    `${f}: ${decl}-д trim()-гүй r.user.toLowerCase() үлдсэн`);
}
console.log('✅ _syncRemote* (цөм + 2 модуль) — username бүгд trim().toLowerCase()');

/* ══════════ 3. caps.ts — dirty-set БАЙХ ёстой ══════════ */
{
  const src = readCode('src/lib/caps.ts');
  for (const need of ['DIRTY_KEY', 'loadDirty', 'saveDirty', 'trackWrite', 'retryDirtyCaps', 'dirtyCapKeys']) {
    assert.ok(src.includes(need), `caps.ts: dirty-set-ийн '${need}' алга — унасан эрхийн бичилт retry хийгдэхгүй`);
  }
  /* `setCaps` нь үр дүнгээ ЗААВАЛ тэмдэглэнэ */
  const i = src.indexOf('export async function setCaps');
  assert.ok(i > 0, 'caps.ts: setCaps олдсонгүй');
  const body = src.slice(i, src.indexOf('export function toggleCap'));
  assert.ok(/trackWrite\(u,\s*(next|out),\s*ok\)/.test(body),
    'caps.ts: setCaps нь trackWrite(u, next, ok) дуудах ёстой');

  assert.ok(!/if\s*\(r\.user\s*&&\s*c\.length\)/.test(src),
    'caps.ts: _syncRemoteCaps нь хоосон эрхийн жагсаалтыг алгасаж байна (c.length шүүлтүүр)');

  /* overlay нь ЗӨВХӨН trusted сешнд — өөрөө өөртөө эрх олгох замыг хаана */
  assert.ok(/_syncRemoteCaps\(rows: CapRow\[\], trusted = false\)/.test(src),
    'caps.ts: _syncRemoteCaps нь trusted параметртэй (анхдагч false) байх ёстой');
  assert.ok(/if\s*\(!trusted\)\s*return;/.test(src),
    'caps.ts: itгэмжлэгдээгүй сешнд dirty overlay хийгдэх ёсгүй');
}
console.log('✅ caps.ts — dirty-set · trackWrite · trusted overlay');

/* ══════════ 3б. Dirty-set нь UI-д ХОЛБОГДСОН (2026-09-08-ны амьд шалгалт) ══════════ */
{
  const ua = readCode('src/components/UserAdmin.tsx');
  assert.ok(ua.includes('new Set([...dirtyKeys(), ...dirtyCapKeys()])'),
    'UserAdmin: dirtyRemote нь dirtyKeys() ба dirtyCapKeys() ХОЁУЛАНГ нэгтгэх ёстой');
  assert.ok(ua.includes('Promise.all([retryDirty(), retryCapsDirty()])'),
    'UserAdmin: retrySync нь caps dirty-г ч дахин илгээх ёстой');
  assert.ok(ua.includes('permsTablePublic() && ('),
    'UserAdmin: хүснэгт нийтэд нээлттэй үеийн анхааруулга алга');
  const pm = readCode('src/lib/permissions.ts');
  assert.ok(pm.includes("tsogts: 'pkgProg'"),
    'permissions: LEGACY_VIEW-д tsogts→pkgProg зураглал алга — «Багцын хяналт» чимээгүй хасагдана');
}
console.log('✅ UserAdmin — caps dirty тэмдэг+retry · public баннер · LEGACY tsogts');

/* ══════════ 4. permissions.initRemote — ЧИМЭЭГҮЙ catch байхгүй ══════════ */
{
  const src = readCode('src/lib/permissions.ts');
  const i = src.indexOf('export async function initRemote');
  const body = src.slice(i, src.indexOf('export const remoteReady'));
  const silent = body.match(/}\s*catch\s*\{/g) ?? [];
  assert.equal(silent.length, 0,
    `initRemote-д ЧИМЭЭГҮЙ catch ${silent.length} үлдсэн — ACL синк унасныг хэн ч мэдэхгүй`);
  const logged = body.match(/catch\s*\(e\)\s*\{[\s\S]*?console\.error/g) ?? [];
  /* 2026-09-16: 6 дахь нь чанарын баримт (`__chanar__:`);
     2026-09-22: 7 дахь нь нэмэлт ажил (`__ajil__:`);
     2026-09-23: 8 дахь нь дэд бүтцийн засвар (`__butets__:`);
     2026-09-25: 9 дэх нь эрхийн төрлийн загвар (`__type__:`) */
  assert.equal(logged.length, 9,
    `initRemote-ийн 8 ACL синк + хуваарь харах модуль бүр console.error-той байх ёстой, олдсон: ${logged.length}`);
  /* caps нь trusted-ыг дамжуулна */
  assert.ok(/_syncRemoteCaps\(remote\.caps,\s*trusted\)/.test(body),
    'initRemote: _syncRemoteCaps-д trusted дамжуулаагүй');
}
console.log('✅ permissions.initRemote — 8 синк бүр console.error, caps нь trusted авна');

/* ══════════ 5. permsRemote — НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР бүх угтварт ══════════ */
{
  const src = readCode('src/lib/permsRemote.ts');
  for (const m of ['flowBy', 'capsBy', 'huvaariBy', 'obyemBy', 'ajilBy', 'butetsBy']) {
    assert.ok(new RegExp(`const ${m} = new Map<`).test(src),
      `permsRemote: ${m} нь Map байх ёстой — давхар мөрөөс хассан эрх сэргэнэ`);
  }
  assert.ok(!/const caps: CapRow\[\] = \[\]/.test(src),
    'permsRemote: caps нь массив хэвээр — Map байх ёстой');

  /* findOids нь хуудаслалттай ба эрэмбэтэй */
  const i = src.indexOf('async function findOids');
  const body = src.slice(i, i + 900);
  assert.ok(/exceededTransferLimit/.test(body),
    'findOids: хуудаслалтгүй — maxRecordCount-аас дээш давхардал цэвэрлэгдэхгүй');
  assert.ok(/orderByFields/.test(body),
    'findOids: orderByFields алга — offset нь мөр алгасна (ArcGIS-ийн занга)');

  /* findTableUrl-ийн хайлтын цонх нь DoS-д тэсвэртэй */
  assert.ok(!/num: '10',/.test(src),
    "findTableUrl: num:'10' — 11 хуурамч item үүсгэвэл жинхэнэ хүснэгт цонхноос гарч remote УНТАРНА");
  assert.ok(/num: '100',/.test(src), "findTableUrl: num нь '100' байх ёстой");

  const fetchAllSrc = src.slice(src.indexOf('export async function fetchAll'), src.indexOf('async function findOids'));
  const grantsReads = (fetchAllSrc.match(/Array\.isArray\(d\.grants\) \? \{ grants: d\.grants \} : \{\}/g) ?? []).length;
  assert.ok(/export async function scopedRead[\s\S]*?Array\.isArray\(d\.grants\) \? \{ grants: d\.grants \} : \{\}/.test(src),
    'scopedRead: grants-ыг fetchAll-тай ижил уншина');
  assert.equal(grantsReads, 1, `fetchAll: grants уншилт нэг туслахад (scoped) байх ёстой, олдсон: ${grantsReads}`);
  const scopedList = fetchAllSrc.slice(fetchAllSrc.indexOf('const SCOPED'), fetchAllSrc.indexOf('rowLoop:'));
  for (const pfx of ['AJIL_PREFIX', 'BUTETS_PREFIX', 'CHANAR_PREFIX', 'OBYEM_PREFIX', 'HUVAARI_PREFIX']) {
    assert.ok(scopedList.includes(`[${pfx}, `), `fetchAll: ${pfx} нийтлэг (grants уншдаг) задлалаар явахгүй байна`);
  }
  /* Бичих тал ч гурвуулаа — уншилт бичилттэйгээ тэнцүү байх ёстой */
  const grantsWrites = (src.match(/grants \? \{ roles, bagts, grants \} : \{ roles, bagts \}/g) ?? []).length;
  assert.equal(grantsWrites, 1, `upsert: grants бичилт НЭГ туслахад (scopedUpsert) байх ёстой, олдсон: ${grantsWrites}`);
  assert.ok(/export function scopedUpsert\([\s\S]*?SCOPED_PREFIX\[kind\][\s\S]*?grants \? \{ roles, bagts, grants \}/.test(src), 'scopedUpsert: SCOPED_PREFIX-ээр grants бичихгүй байна');
  for (const k of ['huvaari', 'obyem', 'chanar', 'ajil', 'butets']) {
    assert.ok(src.includes(`return scopedUpsert('${k}', user, roles, bagts, grants);`), `${k}Upsert: scopedUpsert-ээр явахгүй байна`);
    assert.ok(src.includes(`return scopedRemove('${k}', user);`), `${k}Remove: scopedRemove-ээр явахгүй байна`);
  }
  for (const t of ['HuvaariRow', 'ObyemRow', 'ChanarRow', 'AjilRow']) {
    const decl = src.slice(src.indexOf(`export type ${t} = {`), src.indexOf(`export type ${t} = {`) + 220);
    assert.match(decl, /grants\?: Grant\[\]/,
      `${t}: \`grants\` талбар ил зарлагдаагүй — cast-аар нуугдвал уншилт дахин орхигдоно`);
  }
}
console.log('✅ permsRemote — 6 угтвар Map · хуудаслалт · хайлт 100 · grants 4/4 тэгш хэм');

/* ══════════ 6. UserAdmin — ХУВААРИЛАЛТЫГ ӨӨРӨӨ БИЧИХГҮЙ (2026-09-25) ══════════ */
{
  const src = readCode('src/components/UserAdmin.tsx');
  assert.ok(!src.includes('const flipScoped'),
    'UserAdmin: `flipScoped` буцаж ирэв — хуваарилалтыг унтраалгаас бичих ёсгүй (aclOps-оор)');
  for (const fn of ['setHuvaariGrants', 'setObyemGrants', 'setAjilGrants', 'setChanarGrants',
    'setButetsGrants']) {
    assert.ok(!src.includes(fn),
      `UserAdmin: «${fn}» буцаж ирэв — хуваарилалтын бичилт зөвхөн aclOps-оор`);
  }
  for (const f of ['src/components/UserAdmin.tsx', 'src/components/UserRights.tsx', 'src/components/UserCard.tsx', 'src/components/UserRow.tsx']) {
    const c = readCode(f);
    assert.ok(!c.includes('toggleCap('), `${f}: toggleCap буцаж ирэв — эрх зөвхөн aclOps.capDirectOp-оор (эрхийн хуудас)`);
    assert.ok(!c.includes('flipCap') && !c.includes('dropOrphan') && !c.includes('onFlipCap'),
      `${f}: картын нэмэлт эрхийн унтраалга буцаж ирэв — «Хэрэглэгчдийн эрх удирдах» зөвхөн харагдац`);
  }
  const ops = readCode('src/lib/aclOps.ts');
  const co = ops.slice(ops.indexOf('export function capDirectOp('), ops.indexOf('export async function runOp('));
  /* (a) гаргалгаатай эрх super-ээс бусдад ШУУД олгогдохгүй — хуваарилалтын хоёр дахь эх сурвалж болохгүй */
  assert.ok(co.includes("const tableSuper = roleForUser(u) === 'super';") && co.includes('if (on && isDerivedCap(cap) && !tableSuper)'),
    'capDirectOp: гаргалгаатай эрх super-ээс бусдад шууд олгогдож байна');
  /* (b) хасалт баталгаажуулалттай; addRow-д «Бөглөх» таб хаагдахыг ил хэлнэ */
  assert.ok(co.includes("cap === 'addRow'"), 'capDirectOp: addRow хасахад «Бөглөх» таб хаагдах анхааруулга алга');
  assert.ok(co.includes('sync: toggleCap(u, cap, on)'), 'capDirectOp: toggleCap-ийн үр дүн sync-ээр буцах ёстой (уналт нуугдахгүй)');
  /* (c) хуудсууд op-оор бичнэ, шууд toggleCap биш */
  const pc = readCode('src/modules/PlainCapAcl.tsx');
  assert.ok(!pc.includes('toggleCap(') && pc.includes('capDirectOp('), 'PlainCapAcl: бичилт capDirectOp-оор байх ёстой');
  const on = readCode('src/modules/CapOrphanNote.tsx');
  assert.ok(on.includes('capDirectOp(u, cap, false)'), 'CapOrphanNote: өнчин эрхийг capDirectOp(false)-оор хасах ёстой');
  assert.ok(on.includes('if (!allAclReady()) return null;'), 'CapOrphanNote: бүх ACL уншигдтал өнчин тэмдэг гаргахгүй байх ёстой');
  assert.ok(on.includes('if (aclPendingFor(u)) continue;'), 'CapOrphanNote: бичилт явагдаж буй хүнийг алгасах ёстой');
}
console.log('✅ UserAdmin — flipScoped · flipCap устсан · set*Grants алга · capDirectOp (super шууд · өнчин эрх ИЛ)');

/* ══════════ 7. add() — ДӨРВҮҮЛЭН ACL-ийн өнчин мөрийг шалгана ══════════ */
{
  const src = readCode('src/components/UserAdmin.tsx');
  const i = src.indexOf('const add = () =>');
  assert.ok(i > 0, 'UserAdmin: add() олдсонгүй');
  const body = src.slice(i, i + 3000);
  assert.ok(/stageOfUser\(key\)/.test(body), 'add(): урсгалын өнчин шалгалт алга');
  for (const fn of ['listHuvaariAssigns', 'listObyemAssigns']) {
    assert.ok(body.includes(fn),
      `add(): ${fn} шалгалт алга — устгагдсан аккаунтын хуваарилалт шинэ нэрэнд ЧИМЭЭГҮЙ наалдана`);
  }
}
console.log('✅ UserAdmin.add() — 4 ACL-ийн өнчин мөр бүгд шалгагдана');

/* ══════════ 8. ScopedAclPanel — GRANT ТУС БҮРИЙГ хөнддөг ══════════ */
{
  const f = 'src/lib/aclOps.ts';
  const src = readCode(f);
  const i = src.indexOf('export function addPkgOp(');
  assert.ok(i > 0, `${f}: addPkgOp олдсонгүй`);
  const body = src.slice(i, src.indexOf('export function', i + 10));

  /* (а) Хуучин үржвэрийн логик буцаж ирээгүй */
  assert.doesNotMatch(body, /cur\?\.roles|cur\.roles/,
    `${f}: addPkgOp нь хуучин \`roles[]\` уншиж байна — grants ашиглах ёстой`);
  assert.match(body, /\.grants\b/,
    `${f}: addPkgOp нь grants-аар ажиллах ёстой`);

  /* (б) ЗӨВХӨН тухайн үүргийн grant хөндөгдөнө — бусад нь хэвээр */
  assert.match(body, /grants\.find\(\(g\) => g\.role === role\)/,
    `${f}: addPkgOp нь ТУХАЙН үүргийн grant-ыг олж хөндөх ёстой`);

  /* (в) ХҮРЭЭ ТЭЛЭХГҮЙ: ALL_BAGTS-тай grant-д багц нэмбэл хүрээ нь
     бүх багцаас ганц багц руу ХУМИГДАНА — тиймээс шалгаж алгасна. */
  assert.match(body, /!mine\.bagts\.includes\(ALL_BAGTS\)/,
    `${f}: ALL_BAGTS-тай grant-д багц нэмбэл хүрээ хумигдана — шалгах ёстой`);
  assert.match(body, /\.trim\(\)\.toLowerCase\(\)/,
    `${f}: addPkgOp нь нэрийг trim().toLowerCase() хийх ёстой`);

  /* (г) 2026-10-09 (аудит №6): гэрээ `removePkgOp`-оос `scopedCellOp` руу шилжсэн (хуучин op устсан).
     ALL_BAGTS-тай хүнийг нэг нүднээс хасахад гацахгүй: `aclGrid.planGrantRemove` → `narrow`
     (бусад багцын ил жагсаалт, асууна), дэд бүтцэд асуухгүй; сүүлийн grant → `drop`. */
  /* (`setRoleAllOp` · `dropRoleOp` · `flowStageOp` нь `aclE2E` шалгуурын бэлтгэлд үлдсэн — aclOps) */
  for (const dead of ['removePkgOp', 'qaqcAddOp', 'qaqcRemoveOp', 'flowAddOp', 'flowRemoveOp', 'flowAllOp', 'flowChipOp']) {
    assert.ok(!src.includes(`export function ${dead}(`), `${f}: үхмэл op «${dead}» буцаж ирэв — нүд бүр *CellOp-оор`);
  }
  assert.ok(!src.includes('export function removeAllMsg('), `${f}: removeAllMsg экспортгүй байх ёстой (дуудагч зөвхөн энд)`);
  const rm = src.slice(src.indexOf('export function scopedCellOp('), src.indexOf('/* ══════════════════════ Гүйцэтгэлийн урсгал (шаттай)'));
  assert.match(rm, /planGrantRemove\(cur, role, pkg, spec\.universe\(\)\)/,
    `${f}: scopedCellOp хасах шийдвэрээ aclGrid.planGrantRemove-оос авах ёстой`);
  assert.match(rm, /case 'narrow'/, `${f}: scopedCellOp-д ALL → ил жагсаалт (narrow) салаа алга`);
  assert.match(rm, /sys === 'butets' \? \[\] : \[narrowMsg\(u, label, p\.left\.length\)\]/,
    `${f}: ALL → ил жагсаалт болгохыг асуух (дэд бүтцэд асуухгүй — 2026-09-23) ёстой`);
  assert.match(rm, /removeRevokingRoles\(u, spec\.list, spec\.removeNoRevoke, spec\.roleCaps\)/,
    `${f}: сүүлчийн grant хасагдахад мөрийг бүхэлд нь (revoke=false) хасах зам алга`);
  assert.match(rm, /setGrantsRevokingRoles\(u, p\.grants,/,
    `${f}: хэсэгчилсэн хасалт хасагдсан үүргийн эрхийг буцаах ёстой`);
  assert.match(rm, /confirm: \[removeAllMsg\(sys, u\)\]/,
    `${f}: мөрийг бүхэлд нь хасахыг баталгаажуулах ёстой`);

  /* (д) БАГЦГҮЙ ҮЛДСЭН GRANT ӨӨРӨӨ УНАНА — хоосон `bagts` бүхий grant
     хадгалагдвал тэр хүн «хуваарилагдсан ч нэг ч багцгүй» гэсэн утгагүй
     төлөвт орно (цөм нь түүнийг хаядаг ч op бичих ёсгүй). Дүрэм одоо `aclGrid.ts`-д. */
  assert.match(readCode('src/lib/aclGrid.ts'), /filter\(\(g\) => g\.bagts\.length > 0\)/,
    'aclGrid: багцгүй үлдсэн grant хасагдах ёстой');

  /* (е) revoke=false — таван системийн `removeNoRevoke` бүр `, false)` дамжуулна */
  const noRev = src.match(/removeNoRevoke: \(u\) => remove\w+Assign\(u, false\)/g) ?? [];
  assert.equal(noRev.length, 5,
    `${f}: таван системийн removeNoRevoke бүр revoke=false байх ёстой, олдсон: ${noRev.length}`);

  /* (ё) `runOp` — `r.ok` шалгалт ЯГ НЭГ, await-ын ӨМНӨ; түгжээ дарах агшинд */
  const ro = src.slice(src.indexOf('export async function runOp('));
  assert.equal((ro.match(/if \(!r\.ok\)/g) ?? []).length, 1,
    `${f}: runOp-д r.ok шалгалт ЯГ 1 байх ёстой`);
  assert.ok(ro.indexOf('if (!r.ok)') < ro.indexOf('await Promise.all('),
    `${f}: runOp нь r.ok-ыг sync-ийн await-ын ӨМНӨ шалгах ёстой`);
  assert.ok(ro.includes('if (!ready()) { setErr(lockMsg()); return false; }'),
    `${f}: runOp-д түгжээний шалгалт алга`);
}

for (const f of ['src/modules/HuvaariAcl.tsx', 'src/modules/ObyemAcl.tsx', 'src/modules/AjilAcl.tsx']) {
  const src = readCode(f);
  assert.match(src, /ScopedAclPanel/,
    `${f}: нэгдсэн панелийг ашиглахаа больжээ — давхардал сэргэв`);
  for (const banned of ['const addTo =', 'const removeFrom =', 'function PkgCol', 'function RoleBlock',
    'removeRevokingRoles', 'setGrants:', 'roleCaps:']) {
    assert.ok(!src.includes(banned),
      `${f}: «${banned}» буцаж ирэв — логик нь aclOps.ts / ScopedAclPanel.tsx-д байх ёстой`);
  }
  /* Тохиргоо нь БҮРЭН байх ёстой — дутуу талбар нь ажиллах үед л илэрнэ */
  for (const key of ['sys:', 'roles:', 'roleLabel:', 'emptyLabel:', 'list:', 'failedUsers:',
    'subscribe:', 'ready:', 'notes:', 'stuckMsg:', 'noApproverMsg:']) {
    assert.ok(src.includes(key), `${f}: тохиргооны «${key}» талбар дутуу`);
  }
}

for (const [f, sys] of [
  ['src/modules/ScopedAclPanel.tsx', 'spec.sys'],
  ['src/modules/ChanarAcl.tsx', "'chanar'"],
  ['src/modules/DedButetsAcl.tsx', "'butets'"],
]) {
  const src = readCode(f);
  const add = src.slice(src.indexOf('const addTo ='), src.indexOf('const removeFrom ='));
  const rm = src.slice(src.indexOf('const removeFrom ='), src.indexOf('const removeFrom =') + 400);
  assert.ok(/scopedCellOp\([^;]*, true\)/.test(add) && add.includes(`scopedCellOp(${sys}`), `${f}: addTo нь aclOps.scopedCellOp(…, true)-оор бичих ёстой`);
  assert.ok(/scopedCellOp\([^;]*, false/.test(rm) && rm.includes(`scopedCellOp(${sys}`), `${f}: removeFrom нь aclOps.scopedCellOp(…, false)-оор бичих ёстой`);
  assert.ok(src.includes('<AclGrid'), `${f}: нийтлэг хүснэгт (AclGrid)-ээр зурах ёстой`);
  for (const dead of ['function PkgCol', 'function RoleBlock', 'function PackBlock', 's.aclGrid', 's.aclRole']) {
    assert.ok(!src.includes(dead), `${f}: хуучин хөзрийн загвар (${dead}) буцаж ирэв`);
  }
  assert.doesNotMatch(src, /set(Huvaari|Obyem|Ajil|Chanar|Butets)Grants\(|remove(Huvaari|Obyem|Ajil|Chanar|Butets)Assign\(/,
    `${f}: шууд бичилт буцаж ирэв — aclOps-оор явах ёстой`);
}
console.log('✅ aclOps — grant тус бүр тусад нь · ALL хамгаалалт · revoke=false · панелууд нимгэн');

/* ══════════ 9. GuitsetgelAcl — orphanFail НЭГ УДАА ══════════ */
{
  const src = readCode('src/modules/GuitsetgelAcl.tsx');
  const decl = src.indexOf('const orphanFail');
  const col = src.indexOf('const cell =');
  assert.ok(decl > 0 && col > 0, 'GuitsetgelAcl: orphanFail эсвэл cell олдсонгүй');
  assert.ok(decl < col,
    'orphanFail нь нүд ДОТОР тодорхойлогдсон — нүд бүрд давхардаж, олон өөр асуудал мэт харагдана');
  const uses = src.match(/\{orphanFail && \(/g) ?? [];
  assert.equal(uses.length, 1, `orphanFail нь ЯГ 1 удаа зурагдах ёстой, олдсон: ${uses.length}`);
}
console.log('✅ GuitsetgelAcl — orphanFail эцэг бүрэлдэхүүнд, нэг удаа');

console.log('\naclParity.check: ok');

/* ══════════ 10. 2026-09-08-ны ХОЁР ДАХЬ ШАЛГАЛТЫН ГЭРЭЭ ══════════ */
{
  /* (а) `guitsetgelAcl.setAssign` — 3 модульд зассан `r.ok && r.g` энд орхигдсон */
  const ga = readCode('src/lib/guitsetgelAcl.ts');
  assert.equal((ga.match(/markResult\(u,\s*r\.ok\)/g) ?? []).length, 0,
    'guitsetgelAcl: markResult(u, r.ok) үлдсэн — эрх олголтын уналт админд ХУДАЛ «амжилттай» гэж харагдана');
  assert.ok(ga.includes('markResult(u, r.ok && r.g)'),
    'guitsetgelAcl.setAssign: эрх ОЛГОЛТЫН үр дүн (`r.g`) шалгагдахгүй байна');
  assert.ok(ga.includes('markResult(u, ok && g)'),
    'guitsetgelAcl.removeAssign: эрх БУЦААЛТЫН үр дүн шалгагдахгүй байна');
  /* `revokeFlowAccess` нь үр дүнгээ буцаана — `void` бол дуудагч мэдэхгүй */
  assert.ok(ga.includes('async function revokeFlowAccess(user: string, stage: Stage, autoRole = false): Promise<boolean>'),
    'guitsetgelAcl: revokeFlowAccess нь Promise<boolean> байх ёстой (үр дүнгээ хаяхгүй)');

  /* (б) `syncCaps` нь ГАРААР олгосон эрхийг устгах ёсгүй. */
  {
    const s = readCode('src/lib/scopedAcl.ts');
    const i = s.indexOf('async function syncCaps');
    assert.ok(i > 0, 'scopedAcl: syncCaps олдсонгүй');
    const b = s.slice(i, i + 1600);
    assert.ok(b.includes('c.capsStored(user)'),
      'scopedAcl: syncCaps нь одоогийн эрхийг УНШИХГҮЙ байна — гараар олгосон эрхийг чимээгүй устгана');
    assert.ok(!/toggleCap\(user,\s*'\w+',\s*roles\.includes/.test(b),
      'scopedAcl: syncCaps нь болзолгүй toggleCap хэрэглэсээр байна');
    /* «Хуваарилалт бүхэлдээ арилах» тохиолдлыг ялгана — эс бөгөөс нэг үүрэг
       хасахад НӨГӨӨГИЙН эрх ч хасагдана (эсвэл эсрэгээр, хэзээ ч хасагдахгүй). */
    assert.ok(/const none = roles\.length === 0;/.test(b),
      'scopedAcl: syncCaps нь «хуваарилалт бүхэлдээ арилах» тохиолдлыг ялгах ёстой');
    assert.ok(/else if \(none\) next\.delete\(cap\);/.test(b),
      'scopedAcl: syncCaps нь эрхийг ЗӨВХӨН бүх үүрэг арилах үед хасах ёстой');
  }

  /* (в) `r.ok` шалгалт. */
  const ua = readCode('src/components/UserAdmin.tsx');
  assert.equal((readCode('src/lib/aclOps.ts').match(/if \(!r\.ok\)/g) ?? []).length, 1,
    'aclOps.runOp: `r.ok` шалгалт ЯГ 1 байх ёстой — эс бөгөөс `{ok:false}` үед '
    + '`Promise.all` нь false өгч ТӨӨРӨГДҮҮЛСЭН «ArcGIS-т бичигдсэнгүй» алдаа гарна');
  /* Хоосон багц нь ALL руу унана (`??` нь `[]`-г NULL гэж үзэхгүй) */
  assert.ok(!/cur\?\.bagts \?\? \[(HUVAARI|OBYEM)_ALL_BAGTS\]/.test(ua),
    'UserAdmin: `cur?.bagts ?? [ALL]` нь хоосон массивыг дамжуулж `{ok:false}` үүсгэнэ — `?.length ?` шалгах ёстой');
  /* `add()` нь нэмэлт эрхийн өнчин мөрийг ч шалгана */
  const ai = ua.indexOf('const add = () =>');
  assert.ok(ua.slice(ai, ai + 3600).includes('capsOf(key)'),
    'UserAdmin.add(): өнчин `__cap__:` мөр шалгагдахгүй — buцаах аргагүй эрх (finRow) чимээгүй наалдана');
  /* Унасан мөрийн ноорог үлдэнэ */
  assert.ok(ua.includes('!failedKeys.has(k)'),
    'UserAdmin: унасан мөрийн ноорог арчигдаж байна — админд дахин оролдох зам үлдэхгүй');
  /* Панел хаагдахад салангид төлөв цэвэрлэгдэнэ */
  const ri = ua.indexOf('const requestClose = () =>');
  const rb = ua.slice(ri, ri + 1400);
  for (const st of ['setSel(new Set())', 'setCard(null)']) {
    assert.ok(rb.includes(st),
      `UserAdmin.requestClose: ${st} алга — панел дахин нээхэд хуучин сонголт/алдаа үлдэнэ`);
  }
}

/* ══════════ ХҮРЭЭНИЙ `null` ≠ `[]` — ХЭРЭГЛЭГЧ ТАЛД ══════════ */
/**
 *    Тэр нь АНХДАГЧ зам байв: эрх олгох хоёр стандарт зам хоёулаа
 *    `[ALL_BAGTS]` бичдэг тул `scope` нь `null` буцаадаг. Панелд эрх
 *    ОЛГОГДСОН гэж харагдаж, хуудас нээгдэж, гэвч засагдахгүй байлаа —
 *    чимээгүй инверс, улаан алдаа ч, тайлбар ч байхгүй.
 *
 * ДҮРЭМ: хүрээ буцаадаг функцийн хариуг `?? []` / `|| []`-ЭЭР хавсаргаад
 * шууд `.includes` дуудаж БОЛОХГҮЙ — `x === null || x.includes(...)` бич.
 */
{
  const SCOPE_FNS = [
    'bagtsScope', 'huvaariScope', 'obyemScope', 'chanarScope', 'bagtsFor',
  ];
  const consumers = [
    'src/modules/Huvaari.tsx',
    'src/modules/HuvaariBatlah.tsx',
    'src/modules/Guitsetgel.tsx',
    'src/modules/sheet/FillNew.tsx',
    'src/lib/hyanaltStore.ts',
  ];
  for (const p of consumers) {
    assert.ok(fs.existsSync(p), p + ': хүрээний хэрэглэгч олдсонгүй (нэр солигдсон/устгагдсан?) — `consumers` жагсаалтыг шинэчил');
    const code = readCode(p);
    for (const fn of SCOPE_FNS) {
      const re = new RegExp(fn + BAD_SCOPE);
      assert.ok(!re.test(code),
        p + ': ' + fn + ' -ийн ХЯЗГААРГҮЙ (null) хариуг `?? []` болгож байна — «бүх багц» хуваарилагдсан хүн эрхгүй болно');
    }
  }
}
console.log('✅ хүрээний null ≠ [] — хэрэглэгч талд `?? []` хориотой');

/* ══════════ REMOTE-ГҮЙ СЕШНД БИЧИХ ЗАМ ч ХААЛТТАЙ (2026-09-21, аудитын засвар) ══════════ */
{
  const caps = readCode('src/lib/caps.ts');
  assert.match(caps, /export function toggleCap[\s\S]{0,300}if \(!remoteSynced\) return Promise\.resolve\(false\);/,
    'caps.toggleCap: remote-гүй бол татгалзах ёстой — [] ∪ {cap} remote-ийг дарна');
  const core = readCode('src/lib/scopedAcl.ts');
  assert.match(core, /async function syncCaps[\s\S]{0,300}if \(!c\.capsRemoteReady\(\)\) return false;/,
    'scopedAcl.syncCaps: remote-гүй бол татгалзах ёстой (caps.toggleCap-тай тэгш)');
  const g = readCode('src/lib/guitsetgelAcl.ts');
  assert.match(g, /export function regrantFlowAccess[\s\S]{0,200}if \(!remoteSynced\) return Promise\.resolve\(false\);/,
    'guitsetgelAcl.regrantFlowAccess: remote-гүй бол чимээгүй true биш, false буцаах ёстой');
  assert.match(g, /export function removeAssign\([\s\S]{0,200}if \(!u\) return \{ sync: Promise\.resolve\(false\) \};/,
    'guitsetgelAcl.removeAssign: хоосон нэрийн хамгаалалт алга (scopedAcl-тэй тэгш)');

  const ua = readCode('src/components/UserAdmin.tsx');
  const ops = readCode('src/lib/aclOps.ts');
  const ar = ops.slice(ops.indexOf('export const allAclReady'), ops.indexOf('export const lockMsg'));
  for (const r of ['remoteReady', 'capsRemoteReady', 'flowAclReady', 'huvaariAclReady',
    'obyemAclReady', 'chanarAclReady', 'ajilAclReady', 'butetsAclReady']) {
    assert.ok(ar.includes(r + '()'), 'aclOps.allAclReady: ' + r + ' туг дутуу');
  }
  assert.ok(ua.includes('const capsLocked = !allAclReady();'),
    'UserAdmin: capsLocked нь allAclReady()-аас гарах ёстой — remote-гүй панел уншихдаа [], бичихдээ кэш холино');
  assert.ok(readCode('src/modules/ErhOverview.tsx').includes('const locked = !allAclReady();'),
    'ErhOverview: түгжээ allAclReady()-аас гарах ёстой');
  assert.ok(!readCode('src/components/UserCard.tsx').includes('aclOps'),
    'UserCard: aclOps бичилт буцаж ирэв — карт зөвхөн харагдац (2026-09-30)');
  assert.ok(readCode('src/components/UserTypeSection.tsx').includes('!remoteReady()'),
    'UserTypeSection: түгжээ remoteReady()-аас гарах ёстой');
  assert.ok(readCode('src/lib/roleTypeApply.ts').includes('if (!remoteReady())'),
    'roleTypeApply.applyType: remote-гүй бол татгалзах ёстой');
  /* Матриц — `useAclRunner()` анхдагч түгжээ = allAclReady (runOp дарах агшинд шалгана) */
  assert.ok(readCode('src/modules/ErhMatrix.tsx').includes('useAclRunner();'),
    'ErhMatrix: бичилт useAclRunner()-оор (allAclReady түгжээтэй) явах ёстой');
  assert.ok(readCode('src/modules/useAclRunner.ts').includes('ready: () => boolean = allAclReady'),
    'useAclRunner: анхдагч түгжээ allAclReady биш');
  assert.ok(ops.includes('ready: () => boolean = allAclReady'), 'aclOps.runOp: анхдагч түгжээ allAclReady биш');
  for (const fn of ['const add = () =>']) {
    const i = ua.indexOf(fn);
    assert.ok(i > 0, `UserAdmin: ${fn} олдсонгүй`);
    assert.ok(ua.slice(i, i + 1200).includes('if (capsLocked) { setAddErr(LOCK_MSG); return; }'),
      `UserAdmin.${fn.trim()}: remote-гүй хаалт алга`);
  }
  assert.ok(ua.includes('capsLocked ? capsStored(u.username) : capsOf(u.username)'),
    'UserAdmin: remote-гүй бол эрхээр нээгдсэн харагдацын тэмдэг кэшнээс (`capsStored`) харагдах ёстой');
  assert.ok(!ua.includes('if (d.clear)') && !ua.includes('markClear'), 'UserAdmin.saveAll: устгасан «Сэргээх» (d.clear) зам буцаж орсон');
  assert.ok(ua.includes('restoreUser(k)'), 'UserAdmin: «Буцаах» нь permissions.restoreUser-ээр сэргээх ёстой');
  const pc = readCode('src/modules/PlainCapAcl.tsx');
  assert.ok(pc.includes('const ready = () => remoteReady() && capsRemoteReady();'),
    'PlainCapAcl: түгжээ remoteReady && capsRemoteReady байх ёстой');
  assert.ok(pc.includes('useAclRunner(ready)'), 'PlainCapAcl: runner нь өөрийн түгжээгээ авах ёстой');
  assert.ok(pc.includes('locked ? capsStored(u) : capsOf(u)'), 'PlainCapAcl: remote-гүй бол жагсаалт кэшнээс');

  /* AuthGate: remote уншигдаагүй бол signed-in ч 15 сек */
  const ag = readCode('src/components/AuthGate.tsx');
  assert.ok(ag.includes("status === 'denied' || !remoteReady() ? 15_000 : sysClosedRef.current ? 30_000 : 5 * 60_000"),
    'AuthGate: signed-in + remote-гүй үед 5 мин хүлээж байна — 15 сек байх ёстой');

  /* query.isOrgUrl: 2026-10-20 — байгууллага = Enterprise (`NEXT_PUBLIC_ENT_DATA`-ийн сервер, startsWith); AGOL org сегмент хасагдсан */
  const q = readCode('src/lib/query.ts');
  assert.ok(q.includes("const ORG_BASE = (process.env.NEXT_PUBLIC_ENT_DATA ?? '').trim()") && q.includes('url.startsWith(`${ORG_BASE}/`)'),
    'query.isOrgUrl: Enterprise суурийн (NEXT_PUBLIC_ENT_DATA) startsWith шалгуур алга — гадны хост руу токен явна');
  assert.ok(!q.includes('ARCGIS_COM_HOST'), 'query.isOrgUrl: AGOL org сегментийн шалгуур буцаж ирсэн (AGOL 2026-10-20-нд хасагдсан)');
}
console.log('✅ remote-гүй сешн — toggleCap · syncCaps · regrant · UserAdmin capsLocked · AuthGate 15с · isOrgUrl хост');

console.log('✅ хоёр дахь шалгалт — guitsetgel r.g · syncCaps · r.ok×3 · cap orphan · ноорог үлдэх');

/* ══════════ ҮҮРЭГ → ЭРХИЙН ГАНЦ ХҮСНЭГТ (2026-09-25) ══════════ */
{
  for (const [f, key] of [
    ['src/lib/huvaariAcl.ts', 'ROLE_CAPS.huvaari'],
    ['src/lib/obyemAcl.ts', 'ROLE_CAPS.obyem'],
    ['src/lib/ajilAcl.ts', 'ROLE_CAPS.ajil'],
    ['src/lib/chanarAcl.ts', 'ROLE_CAPS.chanar'],
    ['src/lib/butetsAcl.ts', 'ROLE_CAPS.butets'],
  ]) {
    const src = readCode(f);
    assert.ok(src.includes(`roleCaps: ${key},`), `${f}: roleCaps нь ${key} байх ёстой — гар хуулбар буцаж ирэв`);
  }
  /* Панелуудад inline зураглал үлдээгүй */
  for (const f of ['src/modules/ChanarAcl.tsx', 'src/modules/DedButetsAcl.tsx', 'src/modules/ScopedAclPanel.tsx',
    'src/modules/HuvaariAcl.tsx', 'src/modules/ObyemAcl.tsx', 'src/modules/AjilAcl.tsx', 'src/components/UserAdmin.tsx']) {
    const src = readCode(f);
    assert.doesNotMatch(src, /(author|editor|approver|tuh|habea|tug|cheng): '(plan|planApprove|obyemEdit|obyemApprove|addRow|ajilApprove|chanarAuthor|chanarReview|butets)'/,
      `${f}: үүрэг → эрхийн гар зураглал үлдсэн — aclRoleCaps.ROLE_CAPS-ийг хэрэглэнэ`);
  }

  /* Гаргалгаатай ∪ энгийн = CAPS, давхцалгүй, энгийн ЯГ 11 (2026-10-26: + zuragEdit, cfSwitch; 2026-10-04: + hamaaral; 2026-10-08: + habeaData; 2026-10-19: + sysClose; 2026-10-23: + docsUpload, docsGroups) */
  const { ROLE_CAPS, PLAIN_CAPS, isDerivedCap } = await import('@/lib/aclRoleCaps.ts');
  const capsSrc = readCode('src/lib/caps.ts');
  const all = [...capsSrc.slice(capsSrc.indexOf('export type CapKey'), capsSrc.indexOf('export const CAPS'))
    .matchAll(/'(\w+)'/g)].map((m) => m[1]);
  const derived = new Set(Object.values(ROLE_CAPS).flatMap((m) => Object.values(m)));
  assert.equal(PLAIN_CAPS.length, 11, `энгийн эрх ЯГ 11 байх ёстой, олдсон: ${PLAIN_CAPS.length}`);
  for (const c of PLAIN_CAPS) assert.ok(!derived.has(c), `${c}: энгийн ба гаргалгаатай хоёуланд`);
  assert.deepEqual([...new Set([...derived, ...PLAIN_CAPS])].sort(), [...all].sort(),
    'гаргалгаатай ∪ энгийн ≠ CapKey — шинэ эрх аль нэгэнд бүртгэгдээгүй');
  assert.equal(derived.size, 9, `гаргалгаатай эрх 9 байх ёстой, олдсон: ${derived.size}`);
  for (const c of all) assert.equal(isDerivedCap(c), derived.has(c), `isDerivedCap(${c}) буруу`);
}
console.log('✅ aclRoleCaps — ROLE_CAPS нэг эх · гаргалгаатай 9 ∪ энгийн 7 = CAPS');

/* ══════════ 12b. capText — НЭГ УРСГАЛ = НЭГ ХУУДАС (2026-09-30) ══════════ */
{
  const { ERH_PANES, PANE_CAPS, paneOfCap } = await import('@/modules/capText.ts');
  const { WORKFLOW_VIEWS, CAP_HOST_VIEW } = await import('@/lib/caps.ts');
  assert.deepEqual([...ERH_PANES], ['huvaari', 'ajil', 'obyem', 'chanar', 'butets', 'zovshoorol', 'fin', 'gazar', 'hamaaral', 'habea', 'zurag', 'sys'],
    'capText.ERH_PANES: хажуугийн цэсний 12 хуудас (2026-10-26: + ТЭЗҮ · зураг төсөл; 2026-10-04: + Багцын хамаарал; 2026-10-08: + ХАБЭА-ийн бүртгэл; 2026-10-19: + Систем түр хаах), энэ дарааллаар');
  assert.deepEqual(PANE_CAPS.sys, ['sysClose', 'docsUpload', 'docsGroups'], 'Систем хуудас: түр хаах · баримт оруулах · баримтын бүлэг');
  assert.deepEqual(CAP_HOST_VIEW.sysClose, [], 'sysClose: гэр харагдацгүй');
  const capsSrc = readCode('src/lib/caps.ts');
  const all = [...capsSrc.slice(capsSrc.indexOf('export type CapKey'), capsSrc.indexOf('export const CAPS'))
    .matchAll(/'(\w+)'/g)].map((m) => m[1]);
  const placed = Object.values(PANE_CAPS).flat();
  assert.deepEqual([...placed].sort(), [...all].sort(), 'PANE_CAPS: эрх бүр ЯГ нэг хуудсанд байх ёстой');
  assert.deepEqual(PANE_CAPS.huvaari, ['plan', 'planApprove'], 'Хуваарийн эрх: зохиогч + батлагч нэг хуудсанд');
  assert.deepEqual(PANE_CAPS.fin, ['finEdit', 'finRow', 'cfSwitch'], 'Санхүү: утга + мөр + сарын мөнгө шилжүүлэх нэг хуудсанд');
  for (const c of all) assert.ok(PANE_CAPS[paneOfCap(c)].includes(c), `paneOfCap(${c}) буруу`);
  for (const [lf, fn] of [['src/modules/capText.ts', 'capLabel'], ['src/modules/erhLabels.ts', 'capLabelShort']]) {
    const lsrc = readCode(lf);
    const at = lsrc.indexOf(`export const ${fn} = `);
    assert.ok(at > 0, `${lf}: ${fn} олдсонгүй`);
    const lbody = lsrc.slice(at, lsrc.indexOf('};', at));
    for (const c of all) assert.ok(lbody.includes(`k === '${c}'`), `${lf}: ${fn}-д «${c}» шошго алга`);
  }
  assert.equal(new Set(WORKFLOW_VIEWS).size, 5, 'WORKFLOW_VIEWS 5 байх ёстой');
  for (const v of WORKFLOW_VIEWS) assert.ok(Object.values(CAP_HOST_VIEW).some((vs) => vs.includes(v)), `WORKFLOW_VIEWS: ${v} CAP_HOST_VIEW-д алга`);

  const ua = readCode('src/components/UserAdmin.tsx');
  assert.ok(!ua.includes('ACTION_PANES') && ua.includes('ERH_PANES.map('), 'UserAdmin: хажуугийн цэс ERH_PANES-аар (нэг урсгал = нэг хуудас)');
  for (const bad of ['role="editor"', 'role="approver"', 'role="author"', 'mode="author"', 'mode="review"']) {
    assert.ok(!ua.includes(bad), `UserAdmin: ${bad} — үүргээр салгасан хуудас буцаж ирэв`);
  }
  assert.ok(ua.includes('if (WORKFLOW_VIEWS.includes(k)) return;'), 'UserAdmin.flipView: урсгалтай харагдац картаас засагдах ёсгүй');
  assert.ok(ua.includes("keepWorkflow(d.views, on ? [...TOGGLE_KEYS] : [])"), 'UserAdmin.setAllViews: урсгалтай 6-г хөндөхгүй байх ёстой');
  const ur = readCode('src/components/UserRights.tsx');
  assert.ok(ur.includes('VIEWS.filter((v) => !WORKFLOW_VIEWS.includes(v.key))'), 'UserRights: урсгалтай 6 харагдац унтраалгад орох ёсгүй');
  assert.ok(ur.includes('shownViews.map('), 'UserRights: жагсаалт шүүгдсэн харагдацаас зурагдах ёстой');
  for (const f of ['src/modules/ScopedAclPanel.tsx', 'src/modules/ChanarAcl.tsx']) {
    assert.ok(!readCode(f).includes('pageOf'), `${f}: үүргээр салгасан хуудасны үлдэгдэл (pageOf)`);
  }
}
console.log('✅ capText — 9 урсгалын хуудас · эрх бүр нэг хуудсанд · урсгалтай 6 харагдац картаас гадуур');

/* ══════════ 13. aclOps — ЗАН ТӨЛӨВИЙН ШАЛГУУР (2026-09-25, хянагчийн олдвор) ══════════ */
{
  const mem = new Map();
  globalThis.window = globalThis;
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.dispatchEvent = () => true;
  globalThis.fetch = async () => { throw new Error('offline (aclParity)'); };

  const OPS = await import('@/lib/aclOps.ts');
  const FL = await import('@/lib/guitsetgelAcl.ts');
  const HV = await import('@/lib/huvaariAcl.ts');
  const BT = await import('@/lib/butetsAcl.ts');
  const CAPS = await import('@/lib/caps.ts');
  const { ROLE_BY_USER } = await import('@/lib/services.ts');
  const { BUTETS_PACKS } = await import('@/lib/butetsPacks.ts');
  const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');
  const { STAGE_ORDER } = await import('@/lib/hyanalt.ts');
  const [G0, G1] = PKG_GROUPS;
  /* Порталд БАЙГАА (хатуу, super биш) аккаунт — `isKnown` үнэн, асуулт асуугдана */
  const K = [
    ...Object.entries(ROLE_BY_USER).filter(([, r]) => r !== 'super').map(([u]) => u.toLowerCase()),
    'k_known_a', 'k_known_b', 'k_known_c', 'k_known_d',
  ].slice(0, 6);
  assert.ok(K.length >= 6, '6 энгийн аккаунт хэрэгтэй');
  const settle = async (w) => { await w.sync; await w.granted; };
  {
    const P = await import('@/lib/permissions.ts');
    for (const n of ['q_all2', 'c_all', 'c_new', 'c_ball', 'c_q', 'b_all']) void P.setUser(n, { views: [], docs: false }, null);
    for (const n of K) if (!ROLE_BY_USER[n]) void P.setUser(n, { views: [], docs: false }, null);
  }

  CAPS._syncRemoteCaps([]);

  /* ── Урсгал: шат шилжүүлэх асууна, багц ба viewOnly арилна ── */
  const [S0, S1] = STAGE_ORDER;
  FL._syncRemoteAssigns([
    { user: K[2], stage: S0, bagts: [G0, G1], viewOnly: true },
    { user: K[3], stage: S0, bagts: [G0] },
    { user: K[4], stage: S0, bagts: [G0] },
    { user: K[5], stage: S0, bagts: ['*'] },
  ]);
  const mv = OPS.flowCellOp(K[2], S1, G1, true);
  assert.equal(mv.confirm?.length, 1, 'flowCellOp: өөр шат руу → асуух ёстой');
  const wm = mv.run();
  const moved = FL.listAssigns().find((a) => a.user === K[2]);
  assert.equal(moved.stage, S1);
  assert.deepEqual(moved.bagts, [G1], 'flowCellOp: хуучин багцууд арилах ёстой');
  assert.notEqual(moved.viewOnly, true, 'flowCellOp: «Зөвхөн харна» арилах ёстой');
  assert.equal(OPS.flowCellOp(K[2], S0, '*', true).confirm?.length, 1, 'flowCellOp: «бүх багц» мөрөөр өөр шат руу → асуух ёстой');
  assert.equal(OPS.flowCellOp(K[2], S1, G1, true), null, 'flowCellOp: ижил шат, хамарсан багц → null');
  await settle(wm);

  /* Сүүлийн багц → ✕-ийн зам (асууж, `removeAssign` revoke-той) */
  const fl = OPS.flowCellOp(K[3], S0, G0, false);
  assert.equal(fl.confirm?.length, 1, 'flowCellOp: сүүлийн багц → асуух ёстой');
  const wf = fl.run();
  assert.equal(FL.listAssigns().some((a) => a.user === K[3]), false, 'flowCellOp: сүүлийн багц → томилгоо хасагдах ёстой');
  await settle(wf);
  /* «багц × шат» хүснэгтийн нүд (2026-09-30): ALL-ыг нэг мөрөөс хасвал ил жагсаалт (1 асуулт) · сүүлийн багц → ✕-ийн зам · хамарсан → null */
  assert.equal(OPS.flowCellOp(K[5], S0, G0, false).confirm?.length, 1, 'flowCellOp: ALL → ил жагсаалт болгохыг асуух ёстой');
  assert.equal(OPS.flowCellOp(K[4], S0, G0, false).confirm?.length, 1, 'flowCellOp: сүүлийн багц → flowDropOp асуулт');
  assert.equal(OPS.flowCellOp(K[4], S0, G0, true), null, 'flowCellOp: аль хэдийн хамарсан → null');
  assert.equal(OPS.flowCellOp(K[5], S0, G1, true), null, 'flowCellOp: ALL хамарсан → null');
  assert.equal(OPS.flowCellOp(K[4], S1, G0, true).confirm?.length, 1, 'flowCellOp: өөр шат → шилжүүлэхийг асуух ёстой');
  assert.ok(OPS.flowViewOnlyOp(K[5], true), 'flowViewOnlyOp: асаах op');
  assert.equal(OPS.flowViewOnlyOp(K[5], false), null, 'flowViewOnlyOp: өөрчлөлтгүй → null');
  const ops = readCode('src/lib/aclOps.ts');
  const drop = ops.slice(ops.indexOf('export function flowDropOp('), ops.indexOf('export function flowStageOp('));
  assert.ok(drop.includes('asWrite(removeAssign(u, cur.stage))'), 'flowDropOp: мэдэгдэх аккаунтад revoke=true байх ёстой');
  assert.ok(drop.includes('asWrite(removeAssign(u, cur.stage, false))'), 'flowDropOp: устгагдсан аккаунтад revoke=false байх ёстой');

  /* ── addPkgOp — «Бүх багц» (2026-10-09, аудит №6: `removePkgOp` устсан — хасах гэрээ доорх `scopedCellOp`-д) ── */
  HV._syncRemoteHuvaari([{ user: 'h_all', grants: [{ role: 'author', bagts: ['*'] }, { role: 'approver', bagts: [G0] }] }]);
  assert.equal(OPS.addPkgOp('huvaari', 'h_all', 'author', G1), null, 'addPkgOp: ALL-д нэмбэл хумигдана → null');
  const hadd = OPS.addPkgOp('huvaari', 'h_new', 'approver', G1);
  hadd.run();
  assert.deepEqual(HV.listHuvaariAssigns().find((a) => a.user === 'h_new').grants, [{ role: 'approver', bagts: [G1] }]);

  /* Дэд бүтэц: ALL → бусад багц, асуулгагүй (`scopedCellOp`, порталд байгаа аккаунт `b_all`) */
  const P = BUTETS_PACKS.map((p) => p.key);
  BT._syncRemoteButets([{ user: 'b_all', grants: [{ role: 'editor', bagts: ['*'] }] }]);
  const br = OPS.scopedCellOp('butets', 'b_all', 'editor', P[0], false);
  assert.equal(br.confirm?.length ?? 0, 0, 'scopedCellOp(butets): ALL → асуулгагүй');
  br.run();
  assert.deepEqual(BT.listButetsAssigns().find((a) => a.user === 'b_all').grants[0].bagts, P.slice(1),
    'scopedCellOp(butets): ALL → бусад багцын ИЛ жагсаалт');

  /* ── «Багц × үүрэг» хүснэгтийн нүд (2026-09-30): scopedCellOp ── */
  HV._syncRemoteHuvaari([{ user: 'c_all', grants: [{ role: 'author', bagts: ['*'] }, { role: 'approver', bagts: [G0] }] }]);
  assert.equal(OPS.scopedCellOp('huvaari', 'c_all', 'author', G1, true), null, 'scopedCellOp: ALL хамарсан → null');
  const cn = OPS.scopedCellOp('huvaari', 'c_all', 'author', G1, false);
  assert.equal(cn.confirm?.length, 1, 'scopedCellOp: ALL → ил жагсаалт болгохыг асууна');
  cn.run();
  assert.deepEqual(HV.listHuvaariAssigns().find((a) => a.user === 'c_all').grants,
    [{ role: 'author', bagts: PKG_GROUPS.filter((g) => g !== G1) }, { role: 'approver', bagts: [G0] }],
    'scopedCellOp: ALL → бусад багц, бусад үүрэг хэвээр');
  const cr = OPS.scopedCellOp('huvaari', 'c_all', 'approver', G0, false);
  assert.equal(cr.confirm?.length ?? 0, 0, 'scopedCellOp: үүрэг унаж бусад үлдвэл асуулгагүй (removePkgOp-той ижил)');
  cr.run();
  assert.deepEqual(HV.listHuvaariAssigns().find((a) => a.user === 'c_all').grants.map((g) => g.role), ['author']);
  const cadd = OPS.scopedCellOp('huvaari', 'c_new', 'approver', G1, true);
  assert.equal(cadd.confirm, undefined, 'scopedCellOp: шинэ аккаунт асуулгагүй');
  cadd.run();
  assert.deepEqual(HV.listHuvaariAssigns().find((a) => a.user === 'c_new').grants, [{ role: 'approver', bagts: [G1] }]);
  assert.equal(OPS.scopedCellOp('huvaari', 'c_new', 'approver', G1, false).confirm?.length, 1,
    'scopedCellOp: сүүлийн grant → мөрийг бүхэлд нь хасахыг асууна');
  BT._syncRemoteButets([{ user: 'c_ball', grants: [{ role: 'editor', bagts: ['*'] }] }]);
  assert.equal(OPS.scopedCellOp('butets', 'c_ball', 'editor', P[0], false).confirm?.length ?? 0, 0,
    'scopedCellOp(butets): ALL → ил жагсаалт асуулгагүй (2026-09-23-ны дүрэм)');

  /* Явагдаж буй бичилтийн тэмдэг — `runOp` дуусахад арилна */
  globalThis.confirm = () => true;
  const pr = OPS.runOp(OPS.scopedCellOp('huvaari', 'p_user', 'author', G0, true), () => {}, () => true);
  assert.equal(OPS.aclPendingFor('p_user'), true, 'aclPendingFor: бичилтийн үед үнэн');
  await pr;
  assert.equal(OPS.aclPendingFor('p_user'), false, 'aclPendingFor: дууссаны дараа худал');
}
{
  const g = readCode('src/modules/GuitsetgelAcl.tsx');
  assert.doesNotMatch(g, /\b(setAssign|removeAssign|setViewOnly)\(/, 'GuitsetgelAcl: шууд бичилт буцаж ирэв — aclOps.flow*Op-оор');
  for (const op of ['flowCellOp(', 'flowViewOnlyOp(']) assert.ok(g.includes(op), 'GuitsetgelAcl: ' + op + ' алга');
  assert.equal((g.match(/useAclRunner\(/g) ?? []).length, 1, 'GuitsetgelAcl: НЭГ runner (нэг түгжээ) бүх хүснэгтэд');
  const oc = readCode('src/lib/aclOps.ts');
  const at = oc.indexOf('export function flowCellOp(');
  const cellOp = oc.slice(at, oc.indexOf('export function', at + 10));
  assert.ok(cellOp.includes("case 'drop': return flowDropOp(u)"), 'flowCellOp: бүхэлд нь хасах нь flowDropOp-ын зам байх ёстой');
  assert.ok(cellOp.includes('moveMsg('), 'flowCellOp: шат шилжүүлэх нь moveMsg асуух ёстой');
  assert.ok(g.includes('<AclGrid'), 'GuitsetgelAcl: нийтлэг хүснэгт (AclGrid)-ээр зурах ёстой');
}
console.log('✅ aclOps зан төлөв — шат шилжүүлэх · сүүлийн багц · ALL · дэд бүтэц · pending');

/* ══════════ 13. 2026-10-19 АУДИТ — эрхийн гэр харагдац · хүрээний нэгдэл · super · шошго ══════════ */
/**
 * №1 мөр нэмэх «Хуваарь»-д (гэр харагдац ч тэнд), сонгогч = хуваарийн ∪ нэмэлт ажлын хүрээ; нэмэлт ажлын батлагч
 *    «Нэмэлт ажил батлах»-д. №2 обьёмын үүрэг «Гүйцэтгэл бөглөх» табыг ба өөрийн багцуудыг нээнэ. №6 Нэгтгэл —
 *    КОДЫН super. №7 хуваарийн тэмдэг/комисс — хүрээгээр. №11 FIC — AGOL нэр. №12 алдаанд эрхийн нэр.
 */
{
  const { CAP_HOST_VIEW } = await import('@/lib/caps.ts');
  assert.deepEqual(CAP_HOST_VIEW.addRow, ['huvaari'], '№1: addRow-ийн гэр харагдац «Хуваарь» байх ёстой');
  assert.deepEqual(CAP_HOST_VIEW.ajilApprove, ['ajilBatlah'], '№1: ajilApprove-ийн гэр харагдац «Нэмэлт ажил батлах»');

  const hv = readCode('src/modules/Huvaari.tsx');
  const go = hv.slice(hv.indexOf('const groupOpts = useMemo('), hv.indexOf('const canEditRole = useMemo('));
  assert.ok(/hasCap\(user\?\.username, 'addRow'\) \? ajilScope\(user\?\.username, 'editor'\)/.test(go), '№1: Huvaari.groupOpts нэмэлт ажлын хүрээг нэгтгэхгүй байна');
  assert.ok(hv.indexOf('const [capN, setCapN]') < hv.indexOf('const groupOpts = useMemo('), '№1: capN groupOpts-оос ӨМНӨ зарлагдах ёстой (TDZ)');
  assert.ok(/const canEdit = canEditRole && !savedView;/.test(hv), '№1: canEdit = эрх && !savedView');
  assert.ok(/const canEditRole = useMemo\(\s*\(\) => !review && \(status === 'off' \|\| inScope\(huvaariScope\(user\?\.username, 'author'\)/.test(hv), '№1: огноо засах эрх хуваарийн хүрээгээр хэвээр');

  const gu = readCode('src/modules/Guitsetgel.tsx');
  const cf = gu.slice(gu.indexOf('const canFill ='), gu.indexOf('\n', gu.indexOf('const canFill =')));
  assert.ok(!cf.includes("'addRow'") && cf.includes('obyemRole'), `№2: Guitsetgel.canFill (${cf})`);
  assert.ok(/obyemScope\(user\?\.username, c === 'obyemEdit' \? 'editor' : 'approver'\)/.test(gu), '№2: obyemRole хүрээгээр');
  assert.ok(gu.includes("roleForUser(user?.username) === 'super'") && !/const isSuperRole = role === 'super';/.test(gu), '№6: Нэгтгэл таб КОДЫН super-ээр');

  const fn = readCode('src/modules/sheet/FillNew.tsx');
  const mb = fn.slice(fn.indexOf('const myBagts = useMemo('), fn.indexOf('const groupOpts = useMemo('));
  assert.ok(mb.includes('bagtsScope(user?.username)') && mb.includes('obyemScope(user?.username, role)'), '№2: FillNew.myBagts обьёмын хүрээг нэгтгэхгүй байна');

  const ne = readCode('src/lib/negtgelEdit.ts');
  assert.ok(ne.includes("roleForUser(user) === 'super'") && !ne.includes('roleOf(user)'), '№6: canEditNegtgel КОДЫН super');
  const pm = readCode('src/lib/permissions.ts');
  const ra = pm.slice(pm.indexOf('export function resolveAccess('), pm.indexOf('export function resolveBaseAccess('));
  assert.ok(ra.includes('if (isHardSuper(username))') && !ra.includes("roleOf(username) === 'super'"), '№6: resolveAccess — зөвхөн хатуу super');

  const hb = readCode('src/lib/huvaariBatlah.ts');
  for (const f of ['countPlanPending', 'countPlanReturned', 'countPlanApproved']) {
    const body = hb.slice(hb.indexOf(`export async function ${f}(`), hb.indexOf('\n}', hb.indexOf(`export async function ${f}(`)));
    assert.ok(!body.includes('hasCap('), `№7: ${f} эрхээр биш хүрээгээр (decidePlan/submitPlan-тай ижил)`);
  }
  assert.ok(!readCode('src/lib/ulsiinKomiss.ts').includes("requireCap('plan')"), '№7: ensureKomissRow хүрээгээр');

  const fm = readCode('src/lib/ficMakt.ts');
  assert.ok(fm.includes('[F.uploadedBy]: actorOf(s)') && fm.includes('[F.decidedBy]: actor,') && fm.includes('isOwnUpload(fresh.uploadedBy, actor, s.user)'), '№11: FIC/М-акт өөрийгөө батлах шалгуур AGOL нэрээр');
  const { isOwnUpload } = await import('@/lib/ficMakt.ts');
  assert.equal(isOwnUpload('Bat_AGOL', 'bat_agol', 'ent_bat'), true);
  assert.equal(isOwnUpload('ent_bat', 'bat_agol', 'ENT_BAT'), true, 'хуучин мөр (Enterprise нэр) ч тулгагдана');
  assert.equal(isOwnUpload('dorj', 'bat_agol', 'ent_bat'), false);
  assert.equal(isOwnUpload('', 'bat_agol', 'ent_bat'), false);

  const who = readCode('src/lib/who.ts');
  assert.ok(who.includes('capLabel(cap)'), '№12: requireCap алдаанд эрхийн нэр (capLabel)');
  assert.ok(!readCode('src/lib/ma.ts').includes('«chanarAuthor»'), '№12: MA алдаанд түүхий түлхүүр');
}
console.log('✅ 2026-10-19 аудит — гэр харагдац · хүрээний нэгдэл · кодын super · хүрээгээр тэмдэг · AGOL нэр · эрхийн шошго');

/* ══════════ 14. «СИСТЕМ ТҮР ХААХ» — AuthGate · Root · permsRemote эх кодын гэрээ (2026-10-19) ══════════
 */
{
  const ag = readCode('src/components/AuthGate.tsx');
  const an = ag.slice(ag.indexOf('export function AuthNotice('), ag.indexOf('function NoticeDialog('));
  const iSys = an.indexOf('<SystemClosed');
  ok14(iSys > 0, 'AuthNotice: <SystemClosed> алга');
  for (const other of ['<AccessLost', '<NoticeDialog']) {
    ok14(iSys < an.indexOf(other), `AuthNotice: SystemClosed нь ${other}-оос ӨМНӨ байх ёстой`);
  }
  ok14(an.indexOf('<SessionExpired') > 0 && an.indexOf('<SessionExpired') < iSys, 'AuthNotice: SessionExpired нь SystemClosed-оос ӨМНӨ байх ёстой');
  const scc = ag.slice(ag.indexOf('export function SystemClosed('), ag.indexOf('function AccessLost('));
  ok14(scc.includes('reopenSessionDead()') && scc.includes('retrySession()') && scc.includes('void recheck()'), 'SystemClosed: «Дахин шалгах» сешн дууссан үед дахин нэвтрэх цонх гаргана');
  ok14(ag.includes('sysClosedRef.current ? 30_000 : 5 * 60_000'), 'AuthGate.period: хаалттай үед 30 с');
  ok14((ag.match(/setCurrentUser\([^)]*!lock[^)]*\)/g) ?? []).length === 2, 'AuthGate: хаалттай үед setCurrentUser(null) — нэвтрэлт ба poll ХОЁУЛАА');
  ok14((ag.match(/closedFor\(/g) ?? []).length === 3, 'AuthGate: closedFor — нэвтрэлт · poll · store-ийн мэдэгдэл');
  ok14(ag.includes('const a = subscribePerms(sync);') && ag.includes('const b = subscribeCaps(sync);') && ag.includes('setCurrentUser(lock ? null : name);'),
    'AuthProvider: эрхийн store/caps мэдэгдэлд хаалтыг дахин тооцдоггүй');
  const portal = readCode('src/components/Portal.tsx');
  ok14(portal.includes('{sysNow && canSys && !auth.sysClosed && !sysOpen && ('), 'Portal: шар зурвас ЗӨВХӨН хаалтыг давах эрхтэйд');
  const scd = readCode('src/components/SystemCloseDialog.tsx');
  ok14(scd.includes('void refreshSystemClosed()') && scd.includes('{ expect: cur, update }') && scd.includes('e instanceof SysStaleError'),
    'SystemCloseDialog: нээгдэхэд дахин уншиж, бичихдээ харагдсан төлөвийг (expect) шалгана');
  ok14(scd.includes("tr('Болих')") && !scd.includes("{tr('Хаах')}"), 'SystemCloseDialog: хаах товч «Болих» (Системийг хаах-тай андуурагдана)');
  const dr = readCode('src/lib/draftRemote.ts');
  const sv = dr.slice(dr.indexOf('export async function saveRemoteDraft('), dr.indexOf('export async function clearRemoteDraft('));
  ok14(sv.indexOf('draftWriteLocked()') > 0 && sv.indexOf('draftWriteLocked()') < sv.indexOf('getAuth()'), 'saveRemoteDraft: хаалттай (who хоосон) үед алсад бичихгүй');
  const gt = readCode('src/modules/Guitsetgel.tsx');
  ok14(gt.includes("if (obyemOnly && !tabPicked && tab === 'sent') {"), 'Guitsetgel: зөвхөн обьёмын эрхтэйд анхдагч таб «бөглөх»');
  ok14(ag.includes("const authorized = (status === 'signed-in' && !sysClosed) || status === 'off';"), 'AuthGate: хаалттай үед authorized худал');
  ok14(ag.includes("tr('Системийг нийслэлийн дата төв рүү шилжүүлж байгаа тул түр хаагдсан. Түр хүлээнэ үү.')"), 'SystemClosed: тогтмол текст');
  const root = readCode('src/components/Root.tsx');
  ok14(root.includes("(sysClosed && status === 'signed-in')) ? lastPortal : null"), 'Root.frozen: хаалттай үед Portal амьд (lastPortal)');
  const pr = readCode('src/lib/permsRemote.ts');
  const fa = pr.slice(pr.indexOf('export async function fetchAll('), pr.indexOf('async function findOids('));
  ok14(fa.indexOf('strip(lu, SYS_PREFIX)') > 0 && fa.indexOf('strip(lu, SYS_PREFIX)') < fa.indexOf('perms[lu] ='), 'fetchAll: __sys__ салаа хэрэглэгчийн мөрөөс ӨМНӨ');
  const pm = readCode('src/lib/permissions.ts');
  const sc = pm.slice(pm.indexOf('export async function setSystemClosed('), pm.indexOf('export function _markRemoteLoaded('));
  ok14(sc.indexOf("requireCap('sysClose')") > 0 && sc.indexOf("requireCap('sysClose')") < sc.indexOf('sysUpsert('), 'setSystemClosed: requireCap бичихээс ӨМНӨ');
  const sc2 = pm.slice(pm.indexOf('export async function setSystemClosed('), pm.indexOf('export function _markRemoteLoaded('));
  ok14(sc2.indexOf('await sysRead()') > 0 && sc2.indexOf('await sysRead()') < sc2.indexOf('sysUpsert(st)') && sc2.includes('throw new SysStaleError('),
    'setSystemClosed: expect — бичихийн ӨМНӨ дахин уншиж зөрвөл татгалзана');
}
console.log('✅ «Систем түр хаах» — SessionExpired › SystemClosed › бусад · 30 с poll · who хоосон · frozen Portal · __sys__ салаа');
