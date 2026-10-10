/**
 * ЭРХИЙН ДЭД СИСТЕМҮҮДИЙН ТЭГШ БАЙДАЛ — offline эх кодын гэрээ.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/aclParity.check.mjs
 *
 * ⚠️ ЯАГААД ЭНЭ ТЕСТ БАЙХ ЁСТОЙ ВЭ (2026-09-08-ны эрхийн бүрэн шалгалт).
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
 *
 * ⚠️ Энэ файлын шалгуурууд өөрсдөө кодын хэв маягийг мөрөөр хайдаг тул зассан
 *    алдааг ТАЙЛБАРТ дурдахад (⚠️ тэмдэглэгээ нь энэ төслийн дүрэм) тэр тайлбар
 *    нь «алдаа хэвээр байна» гэсэн ХУДАЛ уналт өгдөг — яг тэр нь энэ тестийг
 *    бичих үед тохиолдсон. Тиймээс блок ба мөрийн тайлбарыг эхлээд хасна.
 */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const readCode = (p) => strip(read(p));

/**
 * `<scopeFn>(…) ?? []`  ба  `<scopeFn>(…) || []` хэв шинж.
 * ⚠️ Тусад нь тогтмол: regex-ийн escape-ийг нэг л газар бичнэ.
 */
const BAD_SCOPE = '\\([^)]*\\)\\s*(\\?\\?|\\|\\|)\\s*\\[\\]';

/* ══════════ 1. set*Assign ба remove*Assign нь ИЖИЛ хатуу шалгууртай ══════════ */
/**
 * ⚠️ `sync` нь «бүх зүйл бүтсэн үү» гэсэн ГАНЦ хариу — админы UI түүнээс
 * улаан анхааруулга гаргадаг. Хуваарилалтын мөр (`r.ok`) бичигдээд эрхийн
 * `__cap__:` мөр (`r.g`) унавал тэр хүн хуваарилагдсан ч хуудсаа нээж
 * ЧАДАХГҮЙ — тиймээс хоёулаа шалгагдана.
 */
/**
 * ⚠️ 2026-09-09: ГУРВАН МОДУЛЬ НЭГ ЦӨМ БОЛСОН (`scopedAcl.ts`). Урьд нь энэ
 * шалгуур гурван файлыг ТУС ТУСАД нь тулгадаг байв — учир нь тэдгээр нь
 * нэрээс бусад бүрэн ижил ~250 мөрийн ХУУЛБАР байсан. Одоо логик нэг газарт
 * тул шалгуур ч тийш чиглэнэ.
 *
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

  /* ⚠️ 2026-10-01: + `retry` («Дахин илгээх» · «Дахин олгох») — мөн хоёуланг барина */
  const strong = core.match(/markResult\(u,\s*r\.ok\s*&&\s*r\.g\)/g) ?? [];
  assert.equal(strong.length, 3,
    `scopedAcl: markResult(u, r.ok && r.g) нь ЯГ 3 удаа (set + remove + retry) байх ёстой, олдсон: ${strong.length}`);

  /* `sync` буцаах утга нь мөн адил хоёуланг барина */
  const ret = core.match(/return r\.ok\s*&&\s*r\.g;/g) ?? [];
  assert.equal(ret.length, 3,
    `scopedAcl: sync нь 'r.ok && r.g' буцаах ёстой (3 газар), олдсон: ${ret.length}`);

  /* ⚠️ 2026-09-21: хасалтын revoke нь ГҮЙЦЭТГЭХ агшиндаа «дахин хуваарилагдсан
     уу» гэж шалгана — `guitsetgelAcl.removeAssign`-ийн `revoke && !stageOfUser(u)`
     дүрэмтэй тэгш. Болзолгүй `syncCaps(u, [])` буцаж ирвэл хойшилсон хасалт
     шинэ хуваарилалтын эрхийг арчина (huvaariAcl.check-ийн runtime шалгуур). */
  assert.match(core, /revoke\s*&&\s*!load\(\)\.some\(\(a\) => a\.user === u\)\s*\?\s*await syncCaps\(u,\s*\[\] as R\[\]\)/,
    'scopedAcl.removeAssign: revoke нь дахин хуваарилагдсан эсэхийг шалгах ёстой');
  assert.doesNotMatch(core, /const g = revoke \? await syncCaps\(u, \[\] as R\[\]\) : true;/,
    'scopedAcl.removeAssign: болзолгүй syncCaps(u, []) эргэж ирэв');
  const g = readCode('src/lib/guitsetgelAcl.ts');
  assert.match(g, /revoke\s*&&\s*!stageOfUser\(u\)\s*\?\s*await revokeFlowAccess/,
    'guitsetgelAcl.removeAssign: дахин томилогдсон хүний эрхийг буцаах ёсгүй');

  /* ⚠️ 2026-09-21: remote ачаалагдаагүй сешнд localStorage-ийн хуваарилалт /
     эрх ҮЛ ТООЦОГДОНО — гурван модульд ижил туг. Нэгд нь арилвал (сүлжээ
     хаагаад локалд тарьсан эрх) тэр модульд өөрөө өөртөө эрх олгох зам нээгдэнэ. */
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
  ['src/lib/qaqcAcl.ts', 'qaqc'],
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
/**
 * ⚠️ Бичих тал (`set*Assign`) нь `trim().toLowerCase()` хийдэг. Уншихдаа
 * `trim()` хийхгүй бол remote мөрөнд санамсаргүй зай орсон үед түлхүүр нь
 * ХЭЗЭЭ Ч таарахгүй — хуваарилалт «алга болсон» мэт харагдана.
 */
/*
 * ⚠️ 2026-09-09: Чанар · Хуваарь · Обьём гурвын `_syncRemote*` нь одоо
 *    `scopedAcl.syncRemote`-д НЭГ удаа бичигдсэн (бүрхүүл нь зөвхөн
 *    дамжуулна). Тиймээс цөмийг НЭГ удаа, үлдсэн хоёр модулийг тус тусад нь.
 */
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
/**
 * ⚠️ `permissions.ts`-д 2026-08-27-нд нэмэгдсэн хамгаалалт `caps.ts`-д
 * ХУУЛАГДААГҮЙ байв: ArcGIS бичилт унасан эрхийг хаана ч тэмдэглэдэггүй тул
 * дараагийн `initRemote` (5 мин тутам) кэшийг бүхэлд нь дарж бичихэд админы
 * засвар ЧИМЭЭГҮЙ буцдаг байлаа.
 */
{
  const src = readCode('src/lib/caps.ts');
  for (const need of ['DIRTY_KEY', 'loadDirty', 'saveDirty', 'trackWrite', 'retryDirtyCaps', 'dirtyCapKeys']) {
    assert.ok(src.includes(need), `caps.ts: dirty-set-ийн '${need}' алга — унасан эрхийн бичилт retry хийгдэхгүй`);
  }
  /* `setCaps` нь үр дүнгээ ЗААВАЛ тэмдэглэнэ */
  const i = src.indexOf('export async function setCaps');
  assert.ok(i > 0, 'caps.ts: setCaps олдсонгүй');
  const body = src.slice(i, src.indexOf('export function toggleCap'));
  /* ⚠️ 2026-10-04: `out` — шинэ мөр дээр нэгтгэсэн жагсаалт (`mergeCapDelta`); dirty үед `next` */
  assert.ok(/trackWrite\(u,\s*(next|out),\s*ok\)/.test(body),
    'caps.ts: setCaps нь trackWrite(u, next, ok) дуудах ёстой');

  /* ⚠️ ХООСОН жагсаалтыг АЛГАСАХГҮЙ: `c.length` шүүлтүүр буцаж ирвэл барина */
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
/**
 * ⚠️ caps.ts-д dirty-set нэмсэн ч UserAdmin зөвхөн permissions-ийн dirtyKeys()-ийг
 * уншиж байсан — эрхийн бичилт унасан тэмдэг refresh-ээр арилж, retry товч ч
 * түүнийг дахин илгээдэггүй байв. Тэмдэг ба retry нэг эх сурвалжаас гарна.
 */
{
  const ua = readCode('src/components/UserAdmin.tsx');
  /* ⚠️ regex БИШ, includes(): энэ блок анх `node -e` + bash quoting-оор
     бичигдэхэд бүх `\` идэгдэж, regex-үүд утгагүй болж санамсаргүй тэнцэж
     байв (CLAUDE.md-ийн `node -e` занга). Энгийн мөр тулгалт аюулгүй. */
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
    `initRemote-ийн 9 ACL синк бүр console.error-той байх ёстой, олдсон: ${logged.length}`);
  /* caps нь trusted-ыг дамжуулна */
  assert.ok(/_syncRemoteCaps\(remote\.caps,\s*trusted\)/.test(body),
    'initRemote: _syncRemoteCaps-д trusted дамжуулаагүй');
}
console.log('✅ permissions.initRemote — 8 синк бүр console.error, caps нь trusted авна');

/* ══════════ 5. permsRemote — НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР бүх угтварт ══════════ */
/**
 * ⚠️ `caps` ганцаараа массив байсан тул давхар `__cap__:` мөр ХОЁУЛАА
 * жагсаалтад орж, ХАССАН эрх дараалал зөрөхөд СЭРГЭДЭГ байв. Бусад дөрөв
 * Map ашигладаг — тэдэнтэй ижил дүрэмд оруулав.
 */
{
  const src = readCode('src/lib/permsRemote.ts');
  for (const m of ['flowBy', 'capsBy', 'qaqcBy', 'huvaariBy', 'obyemBy', 'ajilBy', 'butetsBy']) {
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

  /* ⚠️ GRANTS УНШИЛТЫН ТЭГШ ХЭМ — 2026-09-16-ны аудитын олдвор.
     `fetchAll` нь `grants`-ыг ЗӨВХӨН `__chanar__:` салаанд уншдаг байв;
     `__huvaari__:` ба `__obyem__:` хаядаг байсан тул хуудас сэргээх бүрд
     үүрэг×багцын ҮРЖВЭР эргэж ирж, «Багц 1-д зохиогч, Багц 5-д батлагч»
     гэсэн хүн Багц 1-д Ч БАТЛАГЧ болж, `decidePlan`-ийн зохиогч=батлагч
     татгалзалтаар тэр багц ГАЦДАГ байлаа. Гурван салаа ижил уншина. */
  /* ⚠️ 2026-10-04: ЗӨВХӨН `fetchAll`-ийн биеэс — `scopedRead` (бичихийн өмнөх нэгтгэлийн уншилт) нь ижил задлалттай 6 дахь газар */
  const fetchAllSrc = src.slice(src.indexOf('export async function fetchAll'), src.indexOf('async function findOids'));
  const grantsReads = (fetchAllSrc.match(/Array\.isArray\(d\.grants\) \? \{ grants: d\.grants \} : \{\}/g) ?? []).length;
  assert.ok(/export async function scopedRead[\s\S]*?Array\.isArray\(d\.grants\) \? \{ grants: d\.grants \} : \{\}/.test(src),
    'scopedRead: grants-ыг fetchAll-тай ижил уншина');
  assert.equal(grantsReads, 5,
    `fetchAll: grants уншилт ЯГ 5 байх ёстой (huvaari · obyem · chanar · ajil · butets), олдсон: ${grantsReads}`);
  /* Бичих тал ч гурвуулаа — уншилт бичилттэйгээ тэнцүү байх ёстой */
  const grantsWrites = (src.match(/grants \? \{ roles, bagts, grants \} : \{ roles, bagts \}/g) ?? []).length;
  assert.equal(grantsWrites, 5,
    `upsert: grants бичилт ЯГ 5 байх ёстой (huvaari · obyem · chanar · ajil · butets), олдсон: ${grantsWrites}`);
  /* ⚠️ Мөрийн ТӨРӨЛД `grants` ИЛ зарлагдсан байх — cast-аар нуувал дараагийн
     салаа нэмэхэд төрлийн систем анхааруулахаа болино. */
  for (const t of ['HuvaariRow', 'ObyemRow', 'ChanarRow', 'AjilRow']) {
    const decl = src.slice(src.indexOf(`export type ${t} = {`), src.indexOf(`export type ${t} = {`) + 220);
    assert.match(decl, /grants\?: Grant\[\]/,
      `${t}: \`grants\` талбар ил зарлагдаагүй — cast-аар нуугдвал уншилт дахин орхигдоно`);
  }
}
console.log('✅ permsRemote — 6 угтвар Map · хуудаслалт · хайлт 100 · grants 4/4 тэгш хэм');

/* ══════════ 6. UserAdmin — ХУВААРИЛАЛТЫГ ӨӨРӨӨ БИЧИХГҮЙ (2026-09-25) ══════════ */
/**
 * ⚠️ 2026-09-09-нд `qaqc` · `plan` · `obyem` гурван салааг `flipScoped` болгож
 * нэгтгэсэн байв (super · `r.ok` · `.trim()` алдаанууд). 2026-09-25-нд
 * `flipScoped` БҮХЭЛДЭЭ УСТСАН (баталсан төлөвлөгөө): тэр унтраалга нь
 * хуваарилалтын ХОЁР ДАХЬ эх сурвалж болж `[ALL]`-аар хүрээг тэлдэг байв.
 * Одоо хуваарилалт зөвхөн `aclOps`-оор (карт · матриц · панел) — энэ шалгуур
 * `UserAdmin` дахин `set*Grants` дуудаж эхлэхийг барина. `aclOps`-ийн дүрэм
 * (§8) нь super · `r.ok` · `.trim()`-ийг тэнд НЭГ газар барина.
 */
{
  const src = readCode('src/components/UserAdmin.tsx');
  assert.ok(!src.includes('const flipScoped'),
    'UserAdmin: `flipScoped` буцаж ирэв — хуваарилалтыг унтраалгаас бичих ёсгүй (aclOps-оор)');
  for (const fn of ['setHuvaariGrants', 'setObyemGrants', 'setAjilGrants', 'setChanarGrants',
    'setButetsGrants', 'setQaqcAssign']) {
    assert.ok(!src.includes(fn),
      `UserAdmin: «${fn}» буцаж ирэв — хуваарилалтын бичилт зөвхөн aclOps-оор`);
  }
  /* ⚠️ 2026-09-30: картын «Нэмэлт эрх» унтраалга (`flipCap` · `dropOrphan`) УСТСАН —
     эрх бүр өөрийн хуудсанд. `__cap__:` бичилт ЗӨВХӨН `aclOps.capDirectOp`-оор
     (`PlainCapAcl` · `CapOrphanNote`); `UserAdmin`/`UserRights`/`UserCard` toggleCap дуудахгүй. */
  for (const f of ['src/components/UserAdmin.tsx', 'src/components/UserRights.tsx', 'src/components/UserCard.tsx', 'src/components/UserRow.tsx']) {
    const c = readCode(f);
    assert.ok(!c.includes('toggleCap('), `${f}: toggleCap буцаж ирэв — эрх зөвхөн aclOps.capDirectOp-оор (эрхийн хуудас)`);
    assert.ok(!c.includes('flipCap') && !c.includes('dropOrphan') && !c.includes('onFlipCap'),
      `${f}: картын нэмэлт эрхийн унтраалга буцаж ирэв — «Хэрэглэгчдийн эрх удирдах» зөвхөн харагдац`);
  }
  const ops = readCode('src/lib/aclOps.ts');
  const co = ops.slice(ops.indexOf('export function capDirectOp('), ops.indexOf('export async function runOp('));
  /* (a) гаргалгаатай эрх super-ээс бусдад ШУУД олгогдохгүй — хуваарилалтын хоёр дахь эх сурвалж болохгүй */
  assert.ok(co.includes("if (on && isDerivedCap(cap) && roleForUser(u) !== 'super')"),
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
  for (const fn of ['listQaqcAssigns', 'listHuvaariAssigns', 'listObyemAssigns']) {
    assert.ok(body.includes(fn),
      `add(): ${fn} шалгалт алга — устгагдсан аккаунтын хуваарилалт шинэ нэрэнд ЧИМЭЭГҮЙ наалдана`);
  }
}
console.log('✅ UserAdmin.add() — 4 ACL-ийн өнчин мөр бүгд шалгагдана');

/* ══════════ 8. ScopedAclPanel — GRANT ТУС БҮРИЙГ хөнддөг ══════════ */
/**
 * ⚠️ 2026-09-09-нд ХАДГАЛАЛТ СОЛИГДСОН: `{roles[], bagts[]}` (үүрэг × багцын
 * үржвэр) → `grants[]` (үүрэг бүр ӨӨРИЙН багцтай). Урьд нь панелд `wide` /
 * `widening` нэртэй хамгаалалтууд байсан нь үржвэрийн сул талыг нөхөх
 * зорилготой байв: нэг багцад нэмсэн үүрэг БУСАД багцад тарж, зохиогч=батлагч
 * давхцал үүсгэн багц ГАЦДАГ байлаа. Тэр хамгаалалтууд бүгд «болохгүй» гэж
 * хэлдэг тул админ «Багц 1-д зохиогч, Багц 5-д батлагч» гэсэн ЭНГИЙН
 * томилгоог хийж чаддаггүй байсан. Одоо тарах ЗАМ БАЙХГҮЙ тул хамгаалалт
 * хэрэггүй — шалгуур нь БҮТЦИЙГ барина.
 *
 * ⚠️ 2026-09-10: `HuvaariAcl` ба `ObyemAcl` хоёрын ЛОГИК нь
 * `ScopedAclPanel.tsx`-д нэгдсэн.
 * ⚠️ 2026-09-25: бичих дүрэм `aclOps.ts`-д шилжсэн (`addPkgOp` · `removePkgOp`) —
 * хэрэглэгчийн карт ба матриц ч ИЖИЛ op-оор бичдэг. Тиймээс шалгуур нь тэр
 * НЭГ файлыг тулгана; панелууд (`ScopedAclPanel` · `ChanarAcl` · `DedButetsAcl`)
 * НИМГЭН хэвээр эсэхийг тусад нь барина.
 */
{
  const f = 'src/lib/aclOps.ts';
  const src = readCode(f);
  const i = src.indexOf('export function addPkgOp(');
  assert.ok(i > 0, `${f}: addPkgOp олдсонгүй`);
  /* ⚠️ 2026-10-09 (аудит №6): `removePkgOp` устсан — `addPkgOp`-ийн бие дараагийн `export function` хүртэл */
  const body = src.slice(i, src.indexOf('export function', i + 10));

  /* (а) Хуучин үржвэрийн логик буцаж ирээгүй */
  assert.doesNotMatch(body, /cur\?\.roles|cur\.roles/,
    `${f}: addPkgOp нь хуучин \`roles[]\` уншиж байна — grants ашиглах ёстой`);
  assert.match(body, /\.grants\b/,
    `${f}: addPkgOp нь grants-аар ажиллах ёстой`);

  /* (б) ЗӨВХӨН тухайн үүргийн grant хөндөгдөнө — бусад нь хэвээр */
  assert.match(body, /grants\.find\(\(g\) => g\.role === role\)/,
    `${f}: addPkgOp нь ТУХАЙН үүргийн grant-ыг олж хөндөх ёстой`);

  /* (в) ⚠️ ХҮРЭЭ ТЭЛЭХГҮЙ: ALL_BAGTS-тай grant-д багц нэмбэл хүрээ нь
     бүх багцаас ганц багц руу ХУМИГДАНА — тиймээс шалгаж алгасна. */
  assert.match(body, /!mine\.bagts\.includes\(ALL_BAGTS\)/,
    `${f}: ALL_BAGTS-тай grant-д багц нэмбэл хүрээ хумигдана — шалгах ёстой`);
  assert.match(body, /\.trim\(\)\.toLowerCase\(\)/,
    `${f}: addPkgOp нь нэрийг trim().toLowerCase() хийх ёстой`);

  /* (г) ⚠️ 2026-10-09 (аудит №6): гэрээ `removePkgOp`-оос `scopedCellOp` руу шилжсэн (хуучин op устсан).
     ALL_BAGTS-тай хүнийг нэг нүднээс хасахад гацахгүй: `aclGrid.planGrantRemove` → `narrow`
     (бусад багцын ил жагсаалт, асууна), дэд бүтцэд асуухгүй; сүүлийн grant → `drop`. */
  /* (`setRoleAllOp` · `dropRoleOp` · `flowStageOp` нь `aclE2E` шалгуурын бэлтгэлд үлдсэн — aclOps-ийн ⚠️) */
  for (const dead of ['removePkgOp', 'qaqcAddOp', 'qaqcRemoveOp', 'flowAddOp', 'flowRemoveOp', 'flowAllOp', 'flowChipOp']) {
    assert.ok(!src.includes(`export function ${dead}(`), `${f}: үхмэл op «${dead}» буцаж ирэв — нүд бүр *CellOp-оор`);
  }
  assert.ok(!src.includes('export function removeAllMsg('), `${f}: removeAllMsg экспортгүй байх ёстой (дуудагч зөвхөн энд)`);
  const rm = src.slice(src.indexOf('export function scopedCellOp('), src.indexOf('export function qaqcDropOp('));
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

  /* (д) ⚠️ БАГЦГҮЙ ҮЛДСЭН GRANT ӨӨРӨӨ УНАНА — хоосон `bagts` бүхий grant
     хадгалагдвал тэр хүн «хуваарилагдсан ч нэг ч багцгүй» гэсэн утгагүй
     төлөвт орно (цөм нь түүнийг хаядаг ч op бичих ёсгүй). Дүрэм одоо `aclGrid.ts`-д. */
  assert.match(readCode('src/lib/aclGrid.ts'), /filter\(\(g\) => g\.bagts\.length > 0\)/,
    'aclGrid: багцгүй үлдсэн grant хасагдах ёстой');

  /* (е) ⚠️ revoke=false — таван системийн `removeNoRevoke` бүр `, false)` дамжуулна */
  const noRev = src.match(/removeNoRevoke: \(u\) => remove\w+Assign\(u, false\)/g) ?? [];
  assert.equal(noRev.length, 5,
    `${f}: таван системийн removeNoRevoke бүр revoke=false байх ёстой, олдсон: ${noRev.length}`);

  /* (ё) `runOp` — `r.ok` шалгалт ЯГ НЭГ, await-ын ӨМНӨ; түгжээ дарах агшинд */
  const ro = src.slice(src.indexOf('export async function runOp('));
  assert.equal((ro.match(/if \(!r\.ok\)/g) ?? []).length, 1,
    `${f}: runOp-д r.ok шалгалт ЯГ 1 байх ёстой`);
  assert.ok(ro.indexOf('if (!r.ok)') < ro.indexOf('await '),
    `${f}: runOp нь r.ok-ыг await-ын ӨМНӨ шалгах ёстой`);
  assert.ok(ro.includes('if (!ready()) { setErr(lockMsg()); return false; }'),
    `${f}: runOp-д түгжээний шалгалт алга`);
}

/* ⚠️ ГУРВАН БҮРХҮҮЛ НИМГЭН ХЭВЭЭР — логик буцаж хуулагдвал давхардал сэргэнэ */
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

/* ⚠️ Панелууд op-оор бичнэ — шууд set*Grants / remove*Assign дуудахгүй (2026-09-25).
   ⚠️ 2026-09-30: хөзөр → «багц × үүрэг» хүснэгт (`AclGrid`) — нүд бүр `scopedCellOp` (дүрэм `aclGrid.planGrant*`) */
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
  /* ⚠️ 2026-09-30: багана → «багц × шат» хүснэгт; нүд нь `cell` — orphanFail түүнээс ӨМНӨ, гадна */
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
/**
 * ⚠️ Эхний шалгалт 15 алдаа зассан ч дараах ЦООРХОЙнууд үлдсэн байв —
 * бүгд «ижил кодын нэгд нь л засвар хүрсэн» ижил хэв шинжтэй.
 */
{
  /* (а) `guitsetgelAcl.setAssign` — 3 модульд зассан `r.ok && r.g` энд орхигдсон */
  const ga = readCode('src/lib/guitsetgelAcl.ts');
  assert.equal((ga.match(/markResult\(u,\s*r\.ok\)/g) ?? []).length, 0,
    'guitsetgelAcl: markResult(u, r.ok) үлдсэн — эрх олголтын уналт админд ХУДАЛ «амжилттай» гэж харагдана');
  /* ⚠️ `removeAssign` нь бусад модулиас ӨӨР бүтэцтэй (`{sync}` л буцаана,
     `r.g` талбаргүй) тул тэнд `markResult(u, ok && g)` хэлбэртэй. Чухал нь
     ХОЁУЛАА эрхийн үр дүнг барих явдал, хэлбэр нь биш. */
  assert.ok(ga.includes('markResult(u, r.ok && r.g)'),
    'guitsetgelAcl.setAssign: эрх ОЛГОЛТЫН үр дүн (`r.g`) шалгагдахгүй байна');
  assert.ok(ga.includes('markResult(u, ok && g)'),
    'guitsetgelAcl.removeAssign: эрх БУЦААЛТЫН үр дүн шалгагдахгүй байна');
  /* `revokeFlowAccess` нь үр дүнгээ буцаана — `void` бол дуудагч мэдэхгүй */
  assert.ok(ga.includes('async function revokeFlowAccess(user: string, stage: Stage): Promise<boolean>'),
    'guitsetgelAcl: revokeFlowAccess нь Promise<boolean> байх ёстой (үр дүнгээ хаяхгүй)');

  /* (б) `syncCaps` нь ГАРААР олгосон эрхийг устгах ёсгүй.
     ⚠️ 2026-09-09: гурван модулийн `syncCaps` нь `scopedAcl`-д НЭГ болов. */
  {
    const s = readCode('src/lib/scopedAcl.ts');
    const i = s.indexOf('async function syncCaps');
    assert.ok(i > 0, 'scopedAcl: syncCaps олдсонгүй');
    const b = s.slice(i, i + 1600);
    /* ⚠️ 2026-09-21: `capsStored` (тугтай `capsOf` биш) — remote унасан үед ч хадгалсан эрхийг УНШИЖ арчихгүй. */
    /* ⚠️ 2026-10-09: `|| b.includes('c.capsOf(user)')` хувилбарыг хасав — дээрх шалтгаанаар `capsOf`
       руу буцах нь РЕГРЕСС (remote унахад эрх арчигдана), шалгуур түүнийг давуулах ёсгүй. */
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

  /* (в) `r.ok` шалгалт.
     ⚠️ 2026-09-09: гурван салаа `flipScoped` болж нэгдсэн тул НЭГ удаа.
     ⚠️ 2026-09-25: `flipScoped` устаж бичилт `aclOps.runOp`-д шилжсэн — тэнд НЭГ удаа. */
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
 * ⚠️ 2026-09-16-ны аудитын олдвор (`Qaqc.tsx`). `scopedAcl.scope`-ийн ГЭРЭЭ:
 *    `null` = ХЯЗГААРГҮЙ, `[]` = ЮУ Ч БИШ. Хэрэглэгч талд
 *    `(scope(...) ?? []).includes(x)` гэж бичвэл `null` нь `[]` болж,
 *    «БҮХ багц» хуваарилагдсан хүн ямар ч багц дээр эрхгүй болно.
 *
 *    Тэр нь АНХДАГЧ зам байв: эрх олгох хоёр стандарт зам хоёулаа
 *    `[ALL_BAGTS]` бичдэг тул `scope` нь `null` буцаадаг. Панелд эрх
 *    ОЛГОГДСОН гэж харагдаж, хуудас нээгдэж, гэвч засагдахгүй байлаа —
 *    чимээгүй инверс, улаан алдаа ч, тайлбар ч байхгүй.
 *
 * ⚠️ Гурван хөрш модуль ЗӨВ байсан (`Huvaari` `inScope`, `FillNew`
 *    `sc0 === null || …`, `chanarAcl`) — тэгш байдлын шалгуур яг ийм
 *    зөрүүг барих ёстой байсан ч бариагүй.
 *
 * ДҮРЭМ: хүрээ буцаадаг функцийн хариуг `?? []` / `|| []`-ЭЭР хавсаргаад
 * шууд `.includes` дуудаж БОЛОХГҮЙ — `x === null || x.includes(...)` бич.
 */
{
  const SCOPE_FNS = [
    'bagtsScope', 'qaqcScope', 'huvaariScope', 'obyemScope', 'chanarScope', 'bagtsFor',
  ];
  const consumers = [
    'src/modules/Qaqc.tsx',
    'src/modules/Huvaari.tsx',
    'src/modules/HuvaariBatlah.tsx',
    'src/modules/Chanar.tsx',
    'src/modules/Guitsetgel.tsx',
    'src/modules/sheet/FillNew.tsx',
    'src/lib/hyanaltStore.ts',
  ];
  /* ⚠️ 2026-10-09 (аудит №3): нэр солигдсон/устгагдсан хэрэглэгчийг ЧИМЭЭГҮЙ алгасдаг байв
     (`continue`) — шинэ нэртэй файл хамгаалалтгүй үлддэг. Одоо ЧАНГА унана: жагсаалтыг шинэчил. */
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
/**
 * ⚠️ Fail-closed засвар нь УНШИГЧ API-г хоосон болгосон ч БИЧИГЧ зам
 *    (`toggleCap` · `syncCaps`) `capsStored` = localStorage-оос эхэлдэг. Шинэ
 *    browser-т тэр нь `[]` тул remote уншигдаагүй атлаа бичилт бүтвэл
 *    `[] ∪ {cap}` ArcGIS дээрх бүтэн жагсаалтыг дарна. Мөн UserAdmin нь уншихдаа
 *    тугтай, бичихдээ туггүй функц холиход хуваарилалтын хүрээ ALL болж тэлдэг.
 *    Дөрвөн газар ижил хаалт байх ЁСТОЙ — нэг нь арилвал бусад нь утгагүй.
 */
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
  /* ⚠️ 2026-09-24: долоон ACL-ийн өөрийн туг ч орно (flow · qaqc · huvaari · obyem · chanar · ajil · butets).
     ⚠️ 2026-09-25: илэрхийлэл `aclOps.allAclReady`-д НЭГ газар — есөн туг бүгд тэнд. */
  const ops = readCode('src/lib/aclOps.ts');
  const ar = ops.slice(ops.indexOf('export const allAclReady'), ops.indexOf('export const lockMsg'));
  for (const r of ['remoteReady', 'capsRemoteReady', 'flowAclReady', 'qaqcAclReady', 'huvaariAclReady',
    'obyemAclReady', 'chanarAclReady', 'ajilAclReady', 'butetsAclReady']) {
    assert.ok(ar.includes(r + '()'), 'aclOps.allAclReady: ' + r + ' туг дутуу');
  }
  assert.ok(ua.includes('const capsLocked = !allAclReady();'),
    'UserAdmin: capsLocked нь allAclReady()-аас гарах ёстой — remote-гүй панел уншихдаа [], бичихдээ кэш холино');
  assert.ok(readCode('src/modules/ErhOverview.tsx').includes('const locked = !allAclReady();'),
    'ErhOverview: түгжээ allAclReady()-аас гарах ёстой');
  /* ⚠️ 2026-09-30: карт хуваарилалт бичихээ больсон — «Төрлөөр тохируулах» (зөвхөн харагдац) remoteReady-ээр түгжигдэнэ */
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
  /* ⚠️ 2026-09-30: `flipCap` · `dropOrphan` устсан — зөвхөн `add()` үлдэнэ */
  for (const fn of ['const add = () =>']) {
    const i = ua.indexOf(fn);
    assert.ok(i > 0, `UserAdmin: ${fn} олдсонгүй`);
    assert.ok(ua.slice(i, i + 1200).includes('if (capsLocked) { setAddErr(LOCK_MSG); return; }'),
      `UserAdmin.${fn.trim()}: remote-гүй хаалт алга`);
  }
  assert.ok(ua.includes('capsLocked ? capsStored(u.username) : capsOf(u.username)'),
    'UserAdmin: remote-гүй бол эрхээр нээгдсэн харагдацын тэмдэг кэшнээс (`capsStored`) харагдах ёстой');
  assert.ok(/if \(r && !\(await regrantFlowAccess\(uname\)\)\) bad = true;/.test(ua),
    'UserAdmin.saveAll: regrantFlowAccess-ийг stageOfUser-оор урьдчилж шүүж байна (remote-гүй бол алгасна)');
  /* ⚠️ 2026-09-30: энгийн эрхийн хуудас (`PlainCapAcl`) — QaqcAcl-тай ИЖИЛ түгжээ */
  const pc = readCode('src/modules/PlainCapAcl.tsx');
  assert.ok(pc.includes('const ready = () => remoteReady() && capsRemoteReady();'),
    'PlainCapAcl: түгжээ remoteReady && capsRemoteReady байх ёстой');
  assert.ok(pc.includes('useAclRunner(ready)'), 'PlainCapAcl: runner нь өөрийн түгжээгээ авах ёстой');
  assert.ok(pc.includes('locked ? capsStored(u) : capsOf(u)'), 'PlainCapAcl: remote-гүй бол жагсаалт кэшнээс');

  /* AuthGate: remote уншигдаагүй бол signed-in ч 15 сек */
  const ag = readCode('src/components/AuthGate.tsx');
  assert.ok(ag.includes("status === 'denied' || !remoteReady() ? 15_000 : 5 * 60_000"),
    'AuthGate: signed-in + remote-гүй үед 5 мин хүлээж байна — 15 сек байх ёстой');

  /* query.isOrgUrl: org сегмент зөвхөн *.arcgis.com хостод */
  const q = readCode('src/lib/query.ts');
  assert.ok(q.includes('ARCGIS_COM_HOST.test(url) && url.includes(`/${ORG_SEG}/`)'),
    'query.isOrgUrl: org сегментийн шалгуур хост шалгалтгүй — гадны хост руу токен явна');
}
console.log('✅ remote-гүй сешн — toggleCap · syncCaps · regrant · UserAdmin capsLocked · AuthGate 15с · isOrgUrl хост');

console.log('✅ хоёр дахь шалгалт — guitsetgel r.g · syncCaps · r.ok×3 · cap orphan · ноорог үлдэх');

/* ══════════ ҮҮРЭГ → ЭРХИЙН ГАНЦ ХҮСНЭГТ (2026-09-25) ══════════ */
/**
 * ⚠️ «Хуваарь зохиогч → `plan`» зураглал урьд нь НАЙМ газар давтагдсан байв
 *    (таван `*Acl.ts`, гурван панел, ChanarAcl-ийн хоёр inline, DedButetsAcl,
 *    flipScoped). Одоо `aclRoleCaps.ROLE_CAPS` — бусад нь ТҮҮНИЙГ заана.
 */
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
  assert.ok(readCode('src/lib/qaqcAcl.ts').includes('soleCap: QAQC_CAP,'), 'qaqcAcl: soleCap нь QAQC_CAP байх ёстой');
  /* Панелуудад inline зураглал үлдээгүй */
  for (const f of ['src/modules/ChanarAcl.tsx', 'src/modules/DedButetsAcl.tsx', 'src/modules/ScopedAclPanel.tsx',
    'src/modules/HuvaariAcl.tsx', 'src/modules/ObyemAcl.tsx', 'src/modules/AjilAcl.tsx', 'src/components/UserAdmin.tsx']) {
    const src = readCode(f);
    assert.doesNotMatch(src, /(author|editor|approver|tuh|habea|tug|cheng): '(plan|planApprove|obyemEdit|obyemApprove|addRow|ajilApprove|chanarAuthor|chanarReview|butets)'/,
      `${f}: үүрэг → эрхийн гар зураглал үлдсэн — aclRoleCaps.ROLE_CAPS-ийг хэрэглэнэ`);
  }

  /* Гаргалгаатай ∪ энгийн = CAPS, давхцалгүй, энгийн ЯГ 6 (2026-10-04: + hamaaral; 2026-10-08: + habeaData) */
  const { ROLE_CAPS, PLAIN_CAPS, QAQC_CAP, isDerivedCap } = await import('@/lib/aclRoleCaps.ts');
  const capsSrc = readCode('src/lib/caps.ts');
  const all = [...capsSrc.slice(capsSrc.indexOf('export type CapKey'), capsSrc.indexOf('export const CAPS'))
    .matchAll(/'(\w+)'/g)].map((m) => m[1]);
  const derived = new Set([QAQC_CAP, ...Object.values(ROLE_CAPS).flatMap((m) => Object.values(m))]);
  assert.equal(PLAIN_CAPS.length, 6, `энгийн эрх ЯГ 6 байх ёстой, олдсон: ${PLAIN_CAPS.length}`);
  for (const c of PLAIN_CAPS) assert.ok(!derived.has(c), `${c}: энгийн ба гаргалгаатай хоёуланд`);
  assert.deepEqual([...new Set([...derived, ...PLAIN_CAPS])].sort(), [...all].sort(),
    'гаргалгаатай ∪ энгийн ≠ CapKey — шинэ эрх аль нэгэнд бүртгэгдээгүй');
  assert.equal(derived.size, 10, `гаргалгаатай эрх 10 байх ёстой, олдсон: ${derived.size}`);
  for (const c of all) assert.equal(isDerivedCap(c), derived.has(c), `isDerivedCap(${c}) буруу`);
}
console.log('✅ aclRoleCaps — ROLE_CAPS нэг эх · гаргалгаатай 10 ∪ энгийн 6 = CAPS');

/* ══════════ 12b. capText — НЭГ УРСГАЛ = НЭГ ХУУДАС (2026-09-30) ══════════ */
/**
 * ⚠️ Хэрэглэгч үйлдэл бүрийг тусад нь 14 хуудас болгосныг ТАТГАЛЗСАН — зохиогч ба
 *    батлагч нэг хуудсанд. Энэ шалгуур: хуудас 9 (+ урсгал), эрх БҮР яг нэг
 *    хуудсанд, картын унтраалга урсгалтай 6 харагдацыг зурахгүй, «Бүгдийг
 *    асаах/унтраах» тэдгээрийг хөндөхгүй.
 */
{
  const { ERH_PANES, PANE_CAPS, paneOfCap } = await import('@/modules/capText.ts');
  const { WORKFLOW_VIEWS, CAP_HOST_VIEW } = await import('@/lib/caps.ts');
  assert.deepEqual([...ERH_PANES], ['huvaari', 'ajil', 'obyem', 'chanar', 'qaqc', 'butets', 'zovshoorol', 'fin', 'gazar', 'hamaaral', 'habea'],
    'capText.ERH_PANES: хажуугийн цэсний 11 хуудас (2026-10-04: + Багцын хамаарал; 2026-10-08: + ХАБЭА-ийн бүртгэл), энэ дарааллаар');
  const capsSrc = readCode('src/lib/caps.ts');
  const all = [...capsSrc.slice(capsSrc.indexOf('export type CapKey'), capsSrc.indexOf('export const CAPS'))
    .matchAll(/'(\w+)'/g)].map((m) => m[1]);
  const placed = Object.values(PANE_CAPS).flat();
  assert.deepEqual([...placed].sort(), [...all].sort(), 'PANE_CAPS: эрх бүр ЯГ нэг хуудсанд байх ёстой');
  assert.deepEqual(PANE_CAPS.huvaari, ['plan', 'planApprove'], 'Хуваарийн эрх: зохиогч + батлагч нэг хуудсанд');
  assert.deepEqual(PANE_CAPS.fin, ['finEdit', 'finRow'], 'Санхүү: утга + мөр нэг хуудсанд');
  for (const c of all) assert.ok(PANE_CAPS[paneOfCap(c)].includes(c), `paneOfCap(${c}) буруу`);
  /* ⚠️ 2026-10-09 (аудит №6): CapKey БҮР хоёр шошгоны хүснэгтэд (`capText.capLabel` · `erhLabels.capLabelShort`) —
     `hamaaral` · `habeaData` богино шошгоноос дутуу байж түлхүүр нь ил харагдаж байв */
  for (const [lf, fn] of [['src/modules/capText.ts', 'capLabel'], ['src/modules/erhLabels.ts', 'capLabelShort']]) {
    const lsrc = readCode(lf);
    const at = lsrc.indexOf(`export const ${fn} = `);
    assert.ok(at > 0, `${lf}: ${fn} олдсонгүй`);
    const lbody = lsrc.slice(at, lsrc.indexOf('};', at));
    for (const c of all) assert.ok(lbody.includes(`k === '${c}'`), `${lf}: ${fn}-д «${c}» шошго алга`);
  }
  /* ⚠️ 2026-10-09: + «ma» (MA — материал баталгаажуулалт, чанарын эрхээр нээгдэнэ) → 7 */
  assert.equal(new Set(WORKFLOW_VIEWS).size, 7, 'WORKFLOW_VIEWS 7 байх ёстой');
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
/**
 * ⚠️ Дээрх §8 нь эх кодын ХЭВ ШИНЖИЙГ тулгадаг; энэ хэсэг op-уудыг ЖИНХЭНЭЭР
 *    ажиллуулж ҮР ДҮНГ шалгана: жагсаалтыг `_syncRemote*`-ээр бөглөж, op-ыг
 *    бүтээж, `confirm` ба `run()`-ийн дараах локал төлөвийг харна.
 * ⚠️ Сүлжээгүй: `fetch` нь шууд унана — remote бичилт `false` өгч, локал
 *    төлөв (op-ын гол гэрээ) хэвээр шалгагдана.
 */
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
  const QA = await import('@/lib/qaqcAcl.ts');
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
  /* ⚠️ Хэрэглэгч бүр ТУСДАА: offline бичилт `failed`-д орж, дараагийн `_syncRemote*` тэр хүний
     ЛОКАЛ төлөвийг давамгайлуулдаг (`scopedAcl.syncRemote`-ийн ⚠️) — нэг нэрийг дахин бөглөж болохгүй. */
  const K = Object.entries(ROLE_BY_USER).filter(([, r]) => r !== 'super').map(([u]) => u.toLowerCase());
  assert.ok(K.length >= 6, 'хатуу жагсаалтад 6+ энгийн аккаунт хэрэгтэй');
  const settle = async (w) => { await w.sync; await w.granted; };
  /* ⚠️ 2026-09-30: `aclOps.isCleanup` — порталд БАЙХГҮЙ нэрийг устгагдсан аккаунт гэж үзэж нүдний ✕ нь
     мөрийг бүхэлд нь (асуулгагүй, эрх хөндөхгүй) цэвэрлэнэ. Доорх зохиомол нэрс «порталд байгаа»
     аккаунтын дүрмийг шалгадаг тул store-д бүртгэнэ (remote бичилт offline унана — хамаагүй). */
  {
    const P = await import('@/lib/permissions.ts');
    /* ⚠️ 2026-10-09 (аудит №6): + `b_all` — дэд бүтцийн ALL → ил жагсаалт шалгуур `scopedCellOp`-оор (доор) */
    for (const n of ['q_all2', 'c_all', 'c_new', 'c_ball', 'c_q', 'b_all']) void P.setUser(n, { views: [], docs: false }, null);
  }

  /* ── QAQC: шинэ мөр grant=true · багц солих grant=false ──
     ⚠️ 2026-10-09 (аудит №6): `qaqcAddOp` устсан — хүснэгтийн нүд `qaqcCellOp(…, true)` ижил гэрээтэй */
  CAPS._syncRemoteCaps([]);
  QA._syncRemoteQaqc([]);
  const add1 = OPS.qaqcCellOp('q_new', G0, true);
  assert.ok(add1 && !add1.confirm, 'qaqcCellOp: шинэ мөр асуулгагүй');
  const w1 = add1.run();
  assert.deepEqual(QA.listQaqcAssigns().find((a) => a.user === 'q_new').bagts, [G0]);
  await settle(w1);
  assert.ok(CAPS.capsStored('q_new').includes('qaqc'), 'qaqcCellOp: ШИНЭ мөрөнд эрх олгох ёстой (grant=true)');

  CAPS._syncRemoteCaps([]);
  const w2 = OPS.qaqcCellOp('q_new', G1, true).run();
  assert.deepEqual(QA.listQaqcAssigns().find((a) => a.user === 'q_new').bagts, [G0, G1]);
  await settle(w2);
  assert.ok(!CAPS.capsStored('q_new').includes('qaqc'), 'qaqcCellOp: багц солиход эрх дахин бичих ёсгүй (grant=false)');
  assert.equal(OPS.qaqcCellOp('q_new', G1, true), null, 'qaqcCellOp: аль хэдийн байгаа багц → null');

  /* qaqcCellOp (хүснэгтийн нүд, 2026-09-30 — хуучин qaqcAllOp/qaqcChipOp-ийн оронд):
     шинэ → grant=true; «Бүх багц»-аас нэг мөр → бусад багцын ил жагсаалт; сүүлийн багц → ✕-ийн зам */
  const w3 = OPS.qaqcCellOp('q_all', G0, true).run();
  await settle(w3);
  assert.ok(CAPS.capsStored('q_all').includes('qaqc'), 'qaqcCellOp: шинэ мөрөнд эрх олгох ёстой');
  assert.deepEqual(QA.listQaqcAssigns().find((a) => a.user === 'q_all').bagts, [G0]);
  QA._syncRemoteQaqc([{ user: 'q_all2', bagts: ['*'] }]);
  await settle(OPS.qaqcCellOp('q_all2', G1, false).run());
  assert.deepEqual(QA.listQaqcAssigns().find((a) => a.user === 'q_all2').bagts, PKG_GROUPS.filter((g) => g !== G1),
    'qaqcCellOp: ALL → бусад багцын ил жагсаалт');
  QA._syncRemoteQaqc([{ user: K[0], bagts: [G0] }]);
  const last = OPS.qaqcCellOp(K[0], G0, false);
  assert.equal(last.confirm?.length, 1, 'qaqcCellOp: сүүлийн багц → асуух ёстой (✕-ийн зам)');
  const wl = last.run();
  assert.equal(QA.listQaqcAssigns().some((a) => a.user === K[0]), false, 'qaqcCellOp: сүүлийн багц → мөр хасагдах ёстой');
  /* ⚠️ Дараалал дуустал хүлээнэ — эс бөгөөс дараагийн `_syncRemote*` локалыг давамгайлуулна */
  await settle(wl);

  /* qaqcCellOp (хасах): ALL → нэг асуулт (ил жагсаалт болгох); устгагдсан аккаунт → асуулгагүй
     ⚠️ 2026-10-09 (аудит №6): `qaqcRemoveOp` (ALL → 2 асуулт, бүхэлд нь хасдаг) устсан — хүснэгтийн дүрэм */
  QA._syncRemoteQaqc([{ user: K[1], bagts: ['*'] }, { user: 'gone_x', bagts: [G0] }]);
  assert.equal(OPS.qaqcCellOp(K[1], G0, false).confirm?.length, 1, 'qaqcCellOp: ALL → ил жагсаалт болгохыг асууна');
  assert.equal(OPS.qaqcCellOp('gone_x', G0, false).confirm, undefined, 'qaqcCellOp: устгагдсан аккаунт → асуулгагүй (revoke=false)');

  /* ── Урсгал: шат шилжүүлэх асууна, багц ба viewOnly арилна ──
     ⚠️ 2026-10-09 (аудит №6): `flowAddOp` · `flowStageOp` · `flowChipOp` · `flowRemoveOp` устсан — `flowCellOp` */
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

  /* ── addPkgOp — «Бүх багц» (⚠️ 2026-10-09, аудит №6: `removePkgOp` устсан — хасах гэрээ доорх `scopedCellOp`-д) ── */
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

  /* ── «Багц × үүрэг» хүснэгтийн нүд (2026-09-30): scopedCellOp · qaqcCellOp ── */
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
  QA._syncRemoteQaqc([{ user: 'c_q', bagts: ['*'] }]);
  assert.equal(OPS.qaqcCellOp('c_q', G0, true), null, 'qaqcCellOp: ALL хамарсан → null');
  assert.equal(OPS.qaqcCellOp('c_q', G0, false).confirm?.length, 1, 'qaqcCellOp: ALL → ил жагсаалт болгохыг асууна');
  assert.equal(OPS.qaqcCellOp('c_qnew', G0, true).confirm, undefined, 'qaqcCellOp: шинэ аккаунт асуулгагүй');

  /* Явагдаж буй бичилтийн тэмдэг — `runOp` дуусахад арилна */
  globalThis.confirm = () => true;
  const pr = OPS.runOp(OPS.qaqcCellOp('p_user', G0, true), () => {}, () => true);
  assert.equal(OPS.aclPendingFor('p_user'), true, 'aclPendingFor: бичилтийн үед үнэн');
  await pr;
  assert.equal(OPS.aclPendingFor('p_user'), false, 'aclPendingFor: дууссаны дараа худал');
}
/* ⚠️ QAQC ба урсгалын панел ч op-оор бичнэ (2026-09-25) — карт ба матрицтай ИЖИЛ асуулт */
{
  const g = readCode('src/modules/GuitsetgelAcl.tsx');
  assert.doesNotMatch(g, /\b(setAssign|removeAssign|setViewOnly)\(/, 'GuitsetgelAcl: шууд бичилт буцаж ирэв — aclOps.flow*Op-оор');
  /* ⚠️ 2026-09-30: «багц × шат» хүснэгт — нүд бүр `flowCellOp` (дотроо flowDropOp-ын зам), туг `flowViewOnlyOp` */
  for (const op of ['flowCellOp(', 'flowViewOnlyOp(']) assert.ok(g.includes(op), 'GuitsetgelAcl: ' + op + ' алга');
  assert.equal((g.match(/useAclRunner\(/g) ?? []).length, 1, 'GuitsetgelAcl: НЭГ runner (нэг түгжээ) бүх хүснэгтэд');
  const oc = readCode('src/lib/aclOps.ts');
  const at = oc.indexOf('export function flowCellOp(');
  const cellOp = oc.slice(at, oc.indexOf('export function', at + 10));
  assert.ok(cellOp.includes("case 'drop': return flowDropOp(u)"), 'flowCellOp: бүхэлд нь хасах нь flowDropOp-ын зам байх ёстой');
  assert.ok(cellOp.includes('moveMsg('), 'flowCellOp: шат шилжүүлэх нь moveMsg асуух ёстой');
  const q = readCode('src/modules/QaqcAcl.tsx');
  assert.doesNotMatch(q, /\b(setQaqcAssign|removeQaqcAssign)\(/, 'QaqcAcl: шууд бичилт буцаж ирэв — aclOps.qaqc*Op-оор');
  /* ⚠️ 2026-09-30: хүснэгт — нүд `qaqcCellOp`, устгагдсан аккаунтын өнчин мөр `qaqcDropOp` */
  for (const op of ['qaqcCellOp(', 'qaqcDropOp(', '<AclGrid']) assert.ok(q.includes(op), 'QaqcAcl: ' + op + ' алга');
  assert.ok(g.includes('<AclGrid'), 'GuitsetgelAcl: нийтлэг хүснэгт (AclGrid)-ээр зурах ёстой');
}
console.log('✅ aclOps зан төлөв — QAQC grant · шат шилжүүлэх · сүүлийн багц · ALL · дэд бүтэц · pending');
