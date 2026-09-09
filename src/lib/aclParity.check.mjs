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

  const strong = core.match(/markResult\(u,\s*r\.ok\s*&&\s*r\.g\)/g) ?? [];
  assert.equal(strong.length, 2,
    `scopedAcl: markResult(u, r.ok && r.g) нь ЯГ 2 удаа (set + remove) байх ёстой, олдсон: ${strong.length}`);

  /* `sync` буцаах утга нь мөн адил хоёуланг барина */
  const ret = core.match(/return r\.ok\s*&&\s*r\.g;/g) ?? [];
  assert.equal(ret.length, 2,
    `scopedAcl: sync нь 'r.ok && r.g' буцаах ёстой (2 газар), олдсон: ${ret.length}`);
}
console.log('✅ scopedAcl — set ба remove ижил хатуу шалгуур (r.ok && r.g)');

/* ══════════ 1b. Гурван бүрхүүл НИМГЭН хэвээр — давхардал буцаж ирээгүй ══════════ */
const ACL_FILES = [
  ['src/lib/huvaariAcl.ts', 'huvaari'],
  ['src/lib/obyemAcl.ts', 'obyem'],
  ['src/lib/qaqcAcl.ts', 'qaqc'],
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
  assert.ok(/trackWrite\(u,\s*next,\s*ok\)/.test(body),
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
  assert.equal(logged.length, 5,
    `initRemote-ийн 5 ACL синк бүр console.error-той байх ёстой, олдсон: ${logged.length}`);
  /* caps нь trusted-ыг дамжуулна */
  assert.ok(/_syncRemoteCaps\(remote\.caps,\s*trusted\)/.test(body),
    'initRemote: _syncRemoteCaps-д trusted дамжуулаагүй');
}
console.log('✅ permissions.initRemote — 5 синк бүр console.error, caps нь trusted авна');

/* ══════════ 5. permsRemote — НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР бүх угтварт ══════════ */
/**
 * ⚠️ `caps` ганцаараа массив байсан тул давхар `__cap__:` мөр ХОЁУЛАА
 * жагсаалтад орж, ХАССАН эрх дараалал зөрөхөд СЭРГЭДЭГ байв. Бусад дөрөв
 * Map ашигладаг — тэдэнтэй ижил дүрэмд оруулав.
 */
{
  const src = readCode('src/lib/permsRemote.ts');
  for (const m of ['flowBy', 'capsBy', 'qaqcBy', 'huvaariBy', 'obyemBy']) {
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
}
console.log('✅ permsRemote — 5 угтвар бүр Map · findOids хуудаслалттай · хайлт 100');

/* ══════════ 6. UserAdmin.flipScoped — ГУРВАН ДЭД СИСТЕМД НЭГ ЗАМ ══════════ */
/**
 * ⚠️ 2026-09-09: `qaqc` · `plan` · `obyem` гурван БАРАГ ИЖИЛ салааг
 * `flipScoped` болгож нэгтгэв. Урьд нь тэдгээрийн ялгаанаас ГУРВАН удаа
 * дараалан алдаа гарсан: super-ийн шалгалт (09-07), `r.ok` (09-08),
 * `.trim()` (09-09). Одоо шалгуур нь тэр НЭГ замыг барина.
 */
{
  const src = readCode('src/components/UserAdmin.tsx');
  const i = src.indexOf('const flipScoped =');
  assert.ok(i > 0, 'UserAdmin: `flipScoped` олдсонгүй — гурван салаа буцаж салсан уу?');
  const body = src.slice(i, src.indexOf('const flipRemove =') > i
    ? src.indexOf('const flipRemove =') : i + 9000);

  /* (а) super-ийн шалгалт НЭГ удаа — гурван салаад давхардахгүй */
  const supers = body.match(/roleForUser\(u\.username\) === 'super'/g) ?? [];
  assert.equal(supers.length, 1,
    `flipScoped: super шалгалт ЯГ 1 удаа байх ёстой (нэгтгэсэн зам), олдсон: ${supers.length}`);

  /* (б) super салаа `toggleCap`-ийн үр дүнг барина — .then алга бол алдаа нуугдана */
  const bare = body.match(/void toggleCap\([^)]*\);\s*$/gm) ?? [];
  assert.equal(bare.length, 0,
    `flipScoped: .then-гүй toggleCap ${bare.length} үлдсэн — бичилтийн уналт нуугдана`);

  /* (в) sync БА granted хоёуланг хүлээнэ */
  const both = body.match(/Promise\.all\(\[\s*[\s\S]{0,80}?r\.sync[\s\S]{0,120}?r\.granted/g) ?? [];
  assert.equal(both.length, 1,
    `flipScoped: sync+granted-ийг ЯГ 1 удаа хүлээх ёстой, олдсон: ${both.length}`);

  /* (г) ⚠️ `.trim()` — 2026-09-09-нд илэрсэн алдаа. Гурван салааны ЗӨВХӨН
     нэгэнд байсан тул нэрэнд зай орсон хэрэглэгчийн хүрээ бүх багц руу
     чимээгүй тэлдэг байв. Нэгтгэсний дараа НЭГ газар. */
  assert.match(body, /const key = u\.username\.trim\(\)\.toLowerCase\(\);/,
    'flipScoped: хуваарилалтыг `.trim().toLowerCase()`-ээр хайх ёстой — '
    + 'бичих тал тэгдэг тул таарахгүй бол хүрээ чимээгүй тэлнэ');
  assert.doesNotMatch(body, /\.find\(\(a\) => a\.user === u\.username\.toLowerCase\(\)\)/,
    'flipScoped: trim()-гүй хайлт эргэж ирэв');

  /* (д) ⚠️ ХӨНДЛӨН ҮРЖВЭР БҮТЦЭЭР ШИЙДЭГДСЭН — 2026-09-09.
     Урьд нь хадгалалт `{roles[], bagts[]}` буюу үүрэг × багцын ҮРЖВЭР байсан
     тул тодорхой багцтай хүнд ХОЁР ДАХЬ үүрэг нэмбэл тэр нь БҮХ багцад нь
     тарж, зохиогч=батлагч давхцал үүсгэн багцыг ГАЦААДАГ байв. Түүнээс
     сэргийлэх хамгаалалт панел бүрд бичигдсэн байсан бөгөөд тэдгээр нь бүгд
     «болохгүй» гэж хэлдэг — админ хүссэн томилгоогоо хийж чаддаггүй байлаа.
     Одоо `grants[]`: үүрэг бүр ӨӨРИЙН багцтай тул тарах ЗАМ БАЙХГҮЙ.
     Тиймээс энэ шалгуур нь хамгаалалт биш, БҮТЦИЙГ барина. */
  assert.doesNotMatch(body, /\broles\.includes\(role\)/,
    'flipScoped: хуучин roles[] үржвэрийн логик эргэж ирэв — grants ашиглах ёстой');
  assert.match(body, /\.grants\b/,
    'flipScoped: хуваарилалтыг grants-аар уншиж байх ёстой');

  /* (е) ⚠️ АСААХАД ХҮРЭЭГ ТЭЛЭХГҮЙ. Шинэ үүрэг нэмэхэд болзолгүй
     `[ALL_BAGTS]` бичвэл тодорхой багцтай хүний хүрээ ЧИМЭЭГҮЙ бүх багц
     болно — fail-closed зарчигтай зөрчилдөнө. Одоо байгаа багцаас өвлүүлнэ. */
  assert.match(body, /inherit\.length \? inherit : \[ALL\]/,
    'flipScoped: шинэ үүргийн хүрээг одоо байгаа багцаас өвлүүлэх ёстой — '
    + 'болзолгүй ALL_BAGTS нь хүрээг чимээгүй тэлнэ');

  /* (ё) ⚠️ УНТРААХАД ЗӨВХӨН ТЭР ҮҮРГИЙГ хасна — бусад grant хэвээр үлдэнэ */
  assert.match(body, /grants\.filter\(\(g\) => g\.role !== role\)/,
    'flipScoped: унтраахад зөвхөн тэр үүргийн grant хасагдах ёстой');
}
console.log('✅ UserAdmin.flipScoped — нэг зам · trim · grants (үржвэр бүтцээр хаагдсан)');

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
 * `ScopedAclPanel.tsx`-д нэгдсэн. Тиймээс шалгуур нь тэр НЭГ файлыг тулгана;
 * хоёр бүрхүүл нь НИМГЭН (зөвхөн тохиргоо) хэвээр эсэхийг тусад нь барина.
 */
{
  const f = 'src/modules/ScopedAclPanel.tsx';
  const src = readCode(f);
  const i = src.indexOf('const addTo =');
  assert.ok(i > 0, `${f}: addTo олдсонгүй`);
  const body = src.slice(i, src.indexOf('const removeFrom ='));

  /* (а) Хуучин үржвэрийн логик буцаж ирээгүй */
  assert.doesNotMatch(body, /cur\?\.roles|cur\.roles/,
    `${f}: addTo нь хуучин \`roles[]\` уншиж байна — grants ашиглах ёстой`);
  assert.match(body, /\.grants\b/,
    `${f}: addTo нь grants-аар ажиллах ёстой`);

  /* (б) ЗӨВХӨН тухайн үүргийн grant хөндөгдөнө — бусад нь хэвээр */
  assert.match(body, /grants\.find\(\(g\) => g\.role === role\)/,
    `${f}: addTo нь ТУХАЙН үүргийн grant-ыг олж хөндөх ёстой`);

  /* (в) ⚠️ ХҮРЭЭ ТЭЛЭХГҮЙ: ALL_BAGTS-тай grant-д багц нэмбэл хүрээ нь
     бүх багцаас ганц багц руу ХУМИГДАНА — тиймээс шалгаж алгасана. */
  assert.match(body, /!mine\.bagts\.includes\(ALL_BAGTS\)/,
    `${f}: ALL_BAGTS-тай grant-д багц нэмбэл хүрээ хумигдана — шалгах ёстой`);

  /* (г) removeFrom нь ALL_BAGTS-тай хүнийг ХАСАЖ чадна — эс бөгөөс гацна */
  const rm = src.slice(src.indexOf('const removeFrom ='), src.indexOf('const [note1'));
  assert.match(rm, /mine\.bagts\.includes\(ALL_BAGTS\)/,
    `${f}: removeFrom-д ALL_BAGTS салаа алга`);
  assert.match(rm, /window\.confirm/,
    `${f}: ALL_BAGTS-тай грантыг бүхэлд нь хасахыг баталгаажуулах ёстой`);
  assert.match(rm, /spec\.remove\(user\)/,
    `${f}: сүүлчийн grant хасагдахад мөрийг бүхэлд нь хасах зам алга`);

  /* (д) ⚠️ БАГЦГҮЙ ҮЛДСЭН GRANT ӨӨРӨӨ УНАНА — хоосон \`bagts\` бүхий grant
     хадгалагдвал тэр хүн «хуваарилагдсан ч нэг ч багцгүй» гэсэн утгагүй
     төлөвт орно (цөм нь түүнийг хаядаг ч панел бичих ёсгүй). */
  assert.match(rm, /filter\(\(g\) => g\.bagts\.length > 0\)/,
    `${f}: багцгүй үлдсэн grant хасагдах ёстой`);
}

/* ⚠️ ХОЁР БҮРХҮҮЛ НИМГЭН ХЭВЭЭР — логик буцаж хуулагдвал давхардал сэргэнэ */
for (const f of ['src/modules/HuvaariAcl.tsx', 'src/modules/ObyemAcl.tsx']) {
  const src = readCode(f);
  assert.match(src, /ScopedAclPanel/,
    `${f}: нэгдсэн панелийг ашиглахаа больжээ — давхардал сэргэв`);
  for (const banned of ['const addTo =', 'const removeFrom =', 'function PkgCol', 'function RoleBlock']) {
    assert.ok(!src.includes(banned),
      `${f}: «${banned}» буцаж ирэв — логик нь ScopedAclPanel.tsx-д байх ёстой`);
  }
  /* Тохиргоо нь БҮРЭН байх ёстой — дутуу талбар нь ажиллах үед л илэрнэ */
  for (const key of ['roles:', 'roleLabel:', 'emptyLabel:', 'list:', 'failedUsers:',
    'subscribe:', 'setGrants:', 'remove:', 'notes:', 'confirmRemoveAll:',
    'stuckMsg:', 'noApproverMsg:']) {
    assert.ok(src.includes(key), `${f}: тохиргооны «${key}» талбар дутуу`);
  }
}
console.log('✅ ScopedAclPanel — grant тус бүр тусад нь · хоёр бүрхүүл нимгэн');

/* ══════════ 9. GuitsetgelAcl — orphanFail НЭГ УДАА ══════════ */
{
  const src = readCode('src/modules/GuitsetgelAcl.tsx');
  const decl = src.indexOf('const orphanFail');
  const col = src.indexOf('function Column(');
  assert.ok(decl > 0 && col > 0, 'GuitsetgelAcl: orphanFail эсвэл Column олдсонгүй');
  assert.ok(decl < col,
    'orphanFail нь Column ДОТОР тодорхойлогдсон — 4 баганад давхардаж, 4 өөр асуудал мэт харагдана');
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
    assert.ok(b.includes('c.capsOf(user)'),
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

  /* (в) UserAdmin — `r.ok` шалгалт.
     ⚠️ 2026-09-09: гурван салаа `flipScoped` болж нэгдсэн тул НЭГ удаа. */
  const ua = readCode('src/components/UserAdmin.tsx');
  assert.equal((ua.match(/if \(!r\.ok\) \{ mark\(false\); return; \}/g) ?? []).length, 1,
    'UserAdmin.flipScoped: `r.ok` шалгалт байх ёстой — эс бөгөөс `{ok:false}` үед '
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
  for (const st of ['setSel(new Set())', 'setCapErr(new Map())']) {
    assert.ok(rb.includes(st),
      `UserAdmin.requestClose: ${st} алга — панел дахин нээхэд хуучин сонголт/алдаа үлдэнэ`);
  }
}
console.log('✅ хоёр дахь шалгалт — guitsetgel r.g · syncCaps · r.ok×3 · cap orphan · ноорог үлдэх');
