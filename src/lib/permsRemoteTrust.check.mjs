/**
 * АДМИНЫ МӨРИЙГ ЗӨВХӨН ҮНДСЭН АДМИН (2026-11-24, засвар) — хуурамч ArcGIS дээр, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/permsRemoteTrust.check.mjs
 *
 *   §1 унших тал: үндсэн бус админы бичсэн super мөр · админы мөр (эрх · `__cap__:` · `__flow__:` · хуваарилалт) хүчингүй;
 *      үндсэн админыг өөр хүн хасах/устгах боломжгүй
 *   §2 итгэмжлэгдээгүй super мөрийн орлох мөр — самбарт харагдана, нэвтрэлт · баримтын сан өгөхгүй
 *   §3 дахин хадгалалт (`restampRowsOf`) унавал админаас хасах/устгах зогсоно, юу ч бичигдэхгүй
 *   §4 lib түвшин: үндсэн бус админ өөр админы нэмэлт эрх · урсгал · хуваарилалтыг бичихгүй
 */
import assert from 'node:assert/strict';
import { fake, settle } from './aclE2E.fake.mjs';

const SV = await import('@/lib/services.ts');
const { ROLE_BY_USER, BOOTSTRAP_SUPER, AUTH } = SV;
const SUPER = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'super')[0];
fake.owner = SUPER;

const P = await import('@/lib/permissions.ts');
const CAPS = await import('@/lib/caps.ts');
const OPS = await import('@/lib/aclOps.ts');
const FL = await import('@/lib/guitsetgelAcl.ts');
const HV = await import('@/lib/huvaariAcl.ts');
const WHO = await import('@/lib/who.ts');
const { STAGE_ORDER } = await import('@/lib/hyanalt.ts');
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');

const ROOT = BOOTSTRAP_SUPER;
const ADM2 = 'trust_adm2';
const ADM3 = 'trust_adm3';
const NEWADM = 'trust_newadm';
const PLAIN = 'trust_plain';
const GHOST = 'trust_ghost';
const reload = async () => { await settle(); assert.ok(await P.initRemote(false, true), 'initRemote'); await settle(); };
const untrusted = () => P.remoteMalformed().filter((m) => m.reason === 'untrusted').map((m) => m.key);

/* ══════════ §1 ══════════ */
fake.seed([
  { username: ROOT, role: 'super', views: JSON.stringify(['gdash']), last_edited_user: ROOT },
  { username: ADM2, role: 'super', views: JSON.stringify(['gdash']), last_edited_user: ROOT },
  { username: ADM3, role: 'super', views: JSON.stringify(['gdash']), last_edited_user: ROOT },
  { username: PLAIN, role: 'taniltsah', views: JSON.stringify(['gdash']), last_edited_user: ADM2 },
  /* үндсэн бус админ REST-ээр шинэ админ үүсгэв */
  { username: NEWADM, role: 'super', views: JSON.stringify('all'), last_edited_user: ADM2 },
  /* үндсэн бус админ үндсэн админыг устгах тэмдэг нэмэв */
  { username: ROOT, role: null, views: 'removed', last_edited_user: ADM2 },
  /* админы нэмэлт эрх · урсгал · хуваарилалтыг үндсэн бус админ бичэв */
  { username: `__cap__:${ADM3}`, views: JSON.stringify(['finEdit']), last_edited_user: ADM2 },
  { username: `__flow__:${ADM3}`, views: JSON.stringify({ stage: STAGE_ORDER[0], bagts: ['*'] }), last_edited_user: ADM2 },
  { username: `__huvaari__:${ADM3}`, views: JSON.stringify({ grants: [{ role: 'author', bagts: ['*'] }] }), last_edited_user: ADM2 },
  /* үндсэн админы бичсэн — хүчинтэй */
  { username: `__cap__:${ADM2}`, views: JSON.stringify(['finEdit']), last_edited_user: ROOT },
  /* энгийн хэрэглэгчийн мөрийг үндсэн бус админ — урьдын адил хүчинтэй */
  { username: `__cap__:${PLAIN}`, views: JSON.stringify(['finEdit']), last_edited_user: ADM2 },
]);
await reload();
assert.equal(P.roleOf(NEWADM) === 'super', false, '§1: үндсэн бус админы бичсэн super мөр админ болгох ёсгүй');
assert.equal(P.roleOf(ROOT), 'super', '§1: үндсэн админыг өөр хүн устгах ёсгүй');
assert.ok(P.hasAccess(ROOT) && !P.listRemoved().includes(ROOT), '§1: үндсэн админ нэвтэрнэ');
assert.equal(P.roleOf(ADM2), 'super', '§1: үндсэн админы томилсон админ хэвээр');
assert.ok(!CAPS.capsOf(ADM3).includes('finEdit'), '§1: админы нэмэлт эрхийг үндсэн бус админ бичих ёсгүй');
assert.equal(FL.stageOfUser(ADM3), null, '§1: админы урсгалын томилгоог үндсэн бус админ бичих ёсгүй');
assert.ok(!HV.listHuvaariAssigns().some((a) => a.user === ADM3), '§1: админы хуваарилалтыг үндсэн бус админ бичих ёсгүй');
assert.ok(CAPS.capsOf(ADM2).includes('finEdit'), '§1: үндсэн админы бичсэн админы эрх хүчинтэй');
assert.ok(CAPS.capsOf(PLAIN).includes('finEdit'), '§1: үндсэн бус админ энгийн хэрэглэгчийн эрхийг удирдсаар');
assert.equal(P.roleOf(PLAIN), 'taniltsah', '§1: энгийн хэрэглэгчийн мөр хүчинтэй');
for (const k of [NEWADM, ROOT, `__cap__:${ADM3}`, `__flow__:${ADM3}`, `__huvaari__:${ADM3}`]) {
  assert.ok(untrusted().includes(k), `§1: «${k}» итгэмжлэгдээгүй жагсаалтад`);
}
/* үндсэн админы ганц мөрийг REST-ээр шууд дарав (update) — хүчингүй, үндсэн админ хэвээр */
fake.rows = fake.rows.filter((r) => !(r.username === ROOT && r.views === 'removed'));
Object.assign(fake.find(ROOT)[0], { role: 'taniltsah', views: JSON.stringify([]), last_edited_user: ADM2 });
await reload();
assert.equal(P.roleOf(ROOT), 'super', '§1: үндсэн админы мөрийг өөр хүн дарсан ч super хэвээр');
/* үндсэн админы мөрийг устгав (бусад админ байсаар) — super хэвээр */
fake.rows = fake.rows.filter((r) => r.username !== ROOT);
await reload();
assert.equal(P.roleOf(ROOT), 'super', '§1: үндсэн админы мөр устгагдсан ч super хэвээр');
fake.seed([{ username: ROOT, role: 'super', views: JSON.stringify(['gdash']), last_edited_user: ROOT }]);
console.log('✅ §1 super мөр ба админы мөр зөвхөн үндсэн админы бичсэн бол хүчинтэй · үндсэн админыг хасах боломжгүй');

/* ══════════ §2 ══════════ */
fake.seed([{ username: GHOST, role: 'super', views: JSON.stringify('all'), docs: 1, last_edited_user: ADM2 }]);
await reload();
assert.equal(P.hasAccess(GHOST), false, '§2: итгэмжлэгдээгүй super мөр нэвтрэлт өгөх ёсгүй');
assert.equal(P.resolveAccess(GHOST), null, '§2: эрхгүй (баримтын сан ч — `docsAllowed = !!access`)');
assert.ok(P.listUsers().some((u) => u.username.toLowerCase() === GHOST), '§2: самбарт харагдана (засахад)');
fake.rows = fake.rows.filter((r) => r.username !== GHOST);
await reload();
console.log('✅ §2 итгэмжлэгдээгүй super мөр — самбарт л, нэвтрэлт · баримтын сан өгөхгүй');

/* ══════════ §3 ══════════ */
assert.ok(AUTH.appId, 'шалгуурт нэвтрэлт асаалттай байх ёстой');
WHO._setWriteGuards(true);
WHO.setCurrentUser(SUPER);
fake.editor = SUPER;
{
  const before = fake.edits;
  const rowsBefore = JSON.stringify(fake.rows);
  fake.failReads = true;
  await assert.rejects(() => P.setUser(ADM2, { views: ['gdash'], docs: false }, 'taniltsah'), /дахин баталгаажуулж чадсангүй/, '§3: уншилт унавал хасалт зогсоно');
  await assert.rejects(() => P.removeUser(ADM2), /дахин баталгаажуулж чадсангүй/, '§3: уншилт унавал устгал зогсоно');
  fake.failReads = false;
  fake.failWrites = true;
  await assert.rejects(() => P.setUser(ADM2, { views: ['gdash'], docs: false }, 'taniltsah'), /дахин баталгаажуулж чадсангүй/, '§3: дахин хадгалалт унавал (null) хасалт зогсоно');
  fake.failWrites = false;
  await settle();
  assert.equal(P.roleOf(ADM2), 'super', '§3: админ хэвээр');
  assert.equal(JSON.stringify(fake.rows), rowsBefore, '§3: хүснэгтэд юу ч бичигдээгүй');
  assert.ok(fake.edits - before <= 1, '§3: зөвхөн унасан дахин хадгалалтын оролдлого');
  /* амжилттай — дахин хадгалаад хасна */
  assert.equal(await P.setUser(ADM2, { views: ['gdash'], docs: false }, 'taniltsah'), true, '§3: хэвийн үед хасалт явна');
  await settle();
  assert.equal(fake.find(`__cap__:${PLAIN}`)[0].last_edited_user, SUPER, '§3: админы бичсэн мөр үндсэн админы нэрээр дахин хадгалагдсан');
  /* 2026-11-27: итгэмжлэгдээгүй мөрийг (super мөр · админы тухай мөр) дахин хадгалахгүй — үндсэн админы нэрээр хүчинтэй болох ёсгүй */
  for (const k of [NEWADM, `__cap__:${ADM3}`, `__flow__:${ADM3}`, `__huvaari__:${ADM3}`]) {
    assert.ok(fake.find(k).every((r) => r.last_edited_user === ADM2), `§3: «${k}» дахин хадгалагдах ёсгүй`);
  }
  await reload();
  assert.ok(CAPS.capsOf(PLAIN).includes('finEdit'), '§3: хасагдсан админы бичсэн хүний эрх хэвээр');
  assert.notEqual(P.roleOf(NEWADM), 'super', '§3: дахин хадгалалт итгэмжлэгдээгүй super мөрийг хүчинтэй болгох ёсгүй');
  assert.ok(!CAPS.capsOf(ADM3).includes('finEdit'), '§3: дахин хадгалалт админы тухай итгэмжлэгдээгүй мөрийг хүчинтэй болгох ёсгүй');
}
console.log('✅ §3 дахин хадгалалт унавал (алдаа · null) админаас хасах/устгах зогсоно, юу ч бичигдэхгүй');

/* ══════════ §4 ══════════ */
{
  /* ADM2-г дахин админ болгоод түүний нэрээр ажиллана (үндсэн бус админ) */
  assert.equal(await P.setUser(ADM2, { views: ['gdash'], docs: false }, 'super'), true);
  await reload();
  assert.equal(P.roleOf(ADM2), 'super');
  WHO.setCurrentUser(ADM2);
  const NO = /зөвхөн үндсэн админ/;
  await assert.rejects(() => CAPS.setCaps(ADM3, ['finEdit']), NO, '§4: setCaps — өөр админд');
  assert.throws(() => CAPS.toggleCap(ADM3, 'finEdit', true), NO, '§4: toggleCap — өөр админд');
  assert.match(OPS.capDirectOp(ADM3, 'finEdit', true)?.error ?? '', NO, '§4: capDirectOp — өөр админд');
  assert.throws(() => FL.setAssign(ADM3, STAGE_ORDER[0], [PKG_GROUPS[0]]), NO, '§4: setAssign — өөр админд');
  assert.throws(() => FL.removeAssign(ADM3, STAGE_ORDER[0]), NO, '§4: removeAssign — өөр админд');
  assert.match(HV.setHuvaariGrants(ADM3, [{ role: 'author', bagts: [PKG_GROUPS[0]] }]).error ?? '', NO, '§4: хуваарилалт — өөр админд');
  assert.match(HV.removeHuvaariAssign(ADM3).error ?? '', NO, '§4: хуваарилалт хасах — өөр админд');
  assert.throws(() => CAPS.toggleCap(ADM2, 'finEdit', true), NO, '§4: өөрийн (админы) эрхийг ч');
  /* энгийн хэрэглэгчид — урьдын адил */
  assert.equal(OPS.capDirectOp(PLAIN, 'docsUpload', true)?.error, undefined, '§4: энгийн хэрэглэгчид саадгүй');
  await assert.doesNotReject(() => CAPS.setCaps(PLAIN, ['finEdit', 'docsUpload']), '§4: энгийн хэрэглэгчид setCaps');
  await settle();
  /* үндсэн админ — бүгдийг */
  WHO.setCurrentUser(SUPER);
  await assert.doesNotReject(() => CAPS.setCaps(ADM3, ['finEdit']), '§4: үндсэн админ өөр админд');
  await settle();
}
WHO._setWriteGuards(false);
assert.deepEqual(fake.unexpected, [], 'хүлээгээгүй сүлжээний хүсэлт');
console.log('✅ §4 үндсэн бус админ өөр админы нэмэлт эрх · урсгал · хуваарилалтыг бичихгүй (lib түвшин)');
process.exit(0);
