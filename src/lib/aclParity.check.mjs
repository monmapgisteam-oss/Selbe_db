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
const ACL_FILES = [
  ['src/lib/huvaariAcl.ts', 'huvaari'],
  ['src/lib/obyemAcl.ts', 'obyem'],
  ['src/lib/qaqcAcl.ts', 'qaqc'],
];

for (const [f, name] of ACL_FILES) {
  const src = readCode(f);
  const weak = src.match(/markResult\(u,\s*r\.ok\)/g) ?? [];
  assert.equal(weak.length, 0,
    `${name}: markResult(u, r.ok) үлдсэн (${weak.length}) — эрх олголтын үр дүнг залгиж байна. `
    + '`r.ok && r.g` байх ёстой (set ба remove ХОЁУЛАА).');

  const strong = src.match(/markResult\(u,\s*r\.ok\s*&&\s*r\.g\)/g) ?? [];
  assert.equal(strong.length, 2,
    `${name}: markResult(u, r.ok && r.g) нь ЯГ 2 удаа (set + remove) байх ёстой, олдсон: ${strong.length}`);

  /* `sync` буцаах утга нь мөн адил хоёуланг барина */
  const ret = src.match(/return r\.ok\s*&&\s*r\.g;/g) ?? [];
  assert.equal(ret.length, 2,
    `${name}: sync нь 'r.ok && r.g' буцаах ёстой (2 газар), олдсон: ${ret.length}`);
}
console.log('✅ set*Assign ба remove*Assign — 3 модульд ижил хатуу шалгуур (r.ok && r.g)');

/* ══════════ 2. _syncRemote* нь username-ыг trim() хийнэ ══════════ */
/**
 * ⚠️ Бичих тал (`set*Assign`) нь `trim().toLowerCase()` хийдэг. Уншихдаа
 * `trim()` хийхгүй бол remote мөрөнд санамсаргүй зай орсон үед түлхүүр нь
 * ХЭЗЭЭ Ч таарахгүй — хуваарилалт «алга болсон» мэт харагдана.
 */
const SYNC_FILES = [
  ['src/lib/guitsetgelAcl.ts', '_syncRemoteAssigns'],
  ['src/lib/qaqcAcl.ts', '_syncRemoteQaqc'],
  ['src/lib/huvaariAcl.ts', '_syncRemoteHuvaari'],
  ['src/lib/obyemAcl.ts', '_syncRemoteObyem'],
  ['src/lib/caps.ts', '_syncRemoteCaps'],
];
for (const [f, fn] of SYNC_FILES) {
  const src = readCode(f);
  const i = src.indexOf(`export function ${fn}`);
  assert.ok(i > 0, `${f}: ${fn} олдсонгүй`);
  const body = src.slice(i, i + 1400);
  assert.ok(/\.trim\(\)\.toLowerCase\(\)/.test(body),
    `${f}: ${fn} нь username-ыг trim().toLowerCase() хийх ёстой — бичих талтай таарахгүй болно`);
  assert.ok(!/r\.user\.toLowerCase\(\)/.test(body),
    `${f}: ${fn}-д trim()-гүй r.user.toLowerCase() үлдсэн`);
}
console.log('✅ _syncRemote* (5 модуль) — username бүгд trim().toLowerCase()');

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

/* ══════════ 6. UserAdmin — гурван салаа ИЖИЛ бүтэцтэй ══════════ */
/**
 * ⚠️ `qaqc` · `plan` · `obyem` гурав нь ижил хэлбэрийн салаанууд. Аль нэгэнд
 * нь хийсэн засвар бусдад хүрээгүйгээс ХОЁР ноцтой алдаа гарсан.
 */
{
  const src = readCode('src/components/UserAdmin.tsx');
  const i = src.indexOf('const flipCap =');
  const body = src.slice(i, src.indexOf('const add =') > i ? src.indexOf('const add =') : i + 9000);

  /* (а) Гурван салаа бүр super-ийн шалгалттай */
  const supers = body.match(/roleForUser\(u\.username\) === 'super'/g) ?? [];
  assert.equal(supers.length, 3,
    `flipCap: super шалгалт ЯГ 3 салаанд (qaqc·plan·obyem) байх ёстой, олдсон: ${supers.length}`);

  /* (б) super салаа бүр toggleCap-ийн үр дүнг барина — .then алга байвал алдаа нуугдана */
  const bare = body.match(/void toggleCap\(u\.username,\s*c?,?[^)]*\);\s*$/gm) ?? [];
  assert.equal(bare.length, 0,
    `flipCap: .then-гүй toggleCap ${bare.length} үлдсэн — бичилтийн уналт нуугдана`);

  /* (в) Гурван салаа бүр sync БА granted хоёуланг хүлээнэ */
  const both = body.match(/Promise\.all\(\[\s*[\s\S]{0,80}?r\.sync[\s\S]{0,120}?r\.granted/g) ?? [];
  assert.equal(both.length, 3,
    `flipCap: sync+granted-ийг ЯГ 3 салаанд хүлээх ёстой, олдсон: ${both.length}`);
  assert.ok(!/void \(r\.sync \?\? Promise\.resolve\(false\)\)\.then/.test(body),
    'flipCap: зөвхөн sync-ийг хардаг салаа үлдсэн — granted-ыг ч шалгах ёстой');
}
console.log('✅ UserAdmin.flipCap — 3 салаа бүр super шалгалт · .then · sync+granted');

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

/* ══════════ 8. ALL_BAGTS нь хамгаалалтыг ТОЙРОХГҮЙ ══════════ */
/**
 * ⚠️ `ALL_BAGTS` (`'*'`) нь урт 1 тул `bagts.length > 1` шалгуурт БАРИГДАХГҮЙ
 * байв — гэтэл тэр нь хамгийн ӨРГӨН хүрээ. Үүнээс болж нэг багцад нэмсэн
 * үүрэг 7 багцад тарж, зохиогч=батлагч давхцал үүсгэн багц ГАЦДАГ байлаа.
 */
for (const f of ['src/modules/HuvaariAcl.tsx', 'src/modules/ObyemAcl.tsx']) {
  const src = readCode(f);
  const i = src.indexOf('const addTo =');
  assert.ok(i > 0, `${f}: addTo олдсонгүй`);
  const body = src.slice(i, src.indexOf('const removeFrom ='));
  assert.ok(/const wide = /.test(body) && /includes\(ALL_BAGTS\)/.test(body),
    `${f}: addTo-гийн хамгаалалт ALL_BAGTS-ыг тооцох ёстой ('wide')`);
  assert.ok(!/&& bagts\.length > 1\) \{/.test(body),
    `${f}: 'bagts.length > 1' хэвээр — ALL_BAGTS тойрч гарна`);
  assert.ok(/widening/.test(body),
    `${f}: багц өргөсгөх чиглэлд ALL_BAGTS шалгагдахгүй байна ('widening')`);

  /* removeFrom нь ALL_BAGTS-тай хүнийг ХАСАЖ чадна — эс бөгөөс гацна */
  const rm = src.slice(src.indexOf('const removeFrom ='), src.indexOf('return ('));
  const j = rm.indexOf('cur.bagts.includes(ALL_BAGTS)');
  assert.ok(j > 0, `${f}: removeFrom-д ALL_BAGTS салаа алга`);
  const branch = rm.slice(j, j + 800);
  assert.ok(/window\.confirm/.test(branch) && /remove(Huvaari|Obyem)Assign/.test(branch),
    `${f}: ALL_BAGTS-тай хүнийг хасах ЗАМ алга — санамсаргүй бүх багц болгосныг буцаах боломжгүй`);
}
console.log('✅ HuvaariAcl · ObyemAcl — ALL_BAGTS хамгаалалтад баригдаж, хасагдана');

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
