/**
 * ХОЁР АДМИН ЗЭРЭГ — эрх/багцын бичилт бие биенийхээ өөрчлөлтийг АРЧИХГҮЙ (2026-10-04).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/aclMerge.check.mjs
 *
 * ⚠️ ЯАГААД: `caps.setCaps` · `scopedAcl.pushRow` нь ≤5 мин настай кэшээс БҮТЭН жагсаалт
 *    бичдэг байв — Б админ (хуучин кэштэй) нэг эрх/багц нэмэхэд А админы саяхан нэмсэн
 *    эрх/багц ArcGIS-аас чимээгүй алга болно. Одоо бичихийн өмнө мөрийг ДАХИН уншиж
 *    зөвхөн ганц өөрчлөлтийг давхарлана (`mergeCapDelta` · `mergeGrantDelta`).
 * ОРЧИН: `aclE2E.fake.mjs` — «нөгөө админ» = хуурамч хүснэгтийг шууд засах (энэ сешний
 *    кэш хуучирсан хэвээр). АМЬД ArcGIS РУУ ЮУ Ч ЯВАХГҮЙ.
 */
import assert from 'node:assert/strict';
import { fake, settle } from './aclE2E.fake.mjs';

const { ROLE_BY_USER } = await import('@/lib/services.ts');
const SUPER = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'super')[0];
fake.owner = SUPER;

const P = await import('@/lib/permissions.ts');
const CAPS = await import('@/lib/caps.ts');
const HV = await import('@/lib/huvaariAcl.ts');
const { mergeGrantDelta } = await import('@/lib/scopedAcl.ts');
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const sorted = (x) => [...x].sort();

/* ── Цэвэр дүрэм ── */
eq(sorted(CAPS.mergeCapDelta(['addRow'], ['addRow', 'qaqc'], ['addRow', 'finRow'])), sorted(['addRow', 'finRow', 'qaqc']),
  'нэмэлт: нөгөө админы finRow хадгалагдана');
eq(sorted(CAPS.mergeCapDelta(['addRow', 'qaqc'], ['addRow'], ['addRow', 'qaqc', 'finRow'])), sorted(['addRow', 'finRow']),
  'хасалт: зөвхөн qaqc хасагдана');
eq(CAPS.mergeCapDelta(['addRow'], [], []), [], 'бүгдийг хассан, remote хоосон');
eq(mergeGrantDelta([{ role: 'a', bagts: ['P1'] }], [{ role: 'a', bagts: ['P1', 'P2'] }], [{ role: 'a', bagts: ['P1', 'P3'] }]),
  [{ role: 'a', bagts: ['P1', 'P3', 'P2'] }], 'багц нэмэлт: нөгөөгийн P3 хадгалагдана');
eq(mergeGrantDelta([{ role: 'a', bagts: ['P1', 'P2'] }], [{ role: 'a', bagts: ['P2'] }], [{ role: 'a', bagts: ['P1', 'P2', 'P3'] }]),
  [{ role: 'a', bagts: ['P2', 'P3'] }], 'багц хасалт: зөвхөн P1');
eq(mergeGrantDelta([], [{ role: 'b', bagts: ['*'] }], [{ role: 'b', bagts: ['P1'] }, { role: 'a', bagts: ['P2'] }]),
  [{ role: 'b', bagts: ['*'] }, { role: 'a', bagts: ['P2'] }], '«бүх багц» нь бусдыг шингээнэ');
eq(mergeGrantDelta([{ role: 'a', bagts: ['P1'] }], [], [{ role: 'a', bagts: ['P1'] }, { role: 'b', bagts: ['P9'] }]),
  [{ role: 'b', bagts: ['P9'] }], 'мөр хасалт: нөгөөгийн үүрэг үлдэнэ');

/* ── E2E: хуурамч хүснэгт ── */
const U = 'merge_u1';
fake.seed([{ username: U, role: 'taniltsah', views: JSON.stringify(['gdash']), docs: 0 }]);
assert.ok(await P.initRemote(false, true), 'initRemote');
await settle();

/* Эрх: энэ сешн addRow олгосон */
assert.ok(await CAPS.setCaps(U, ['addRow']));
await settle();
/* Нөгөө админ (энэ сешний кэш мэдэхгүй) finRow нэмэв */
const capRow = fake.find('__cap__:' + U)[0];
capRow.views = JSON.stringify(['addRow', 'finRow']);
/* Энэ сешн хуучин кэшээсээ qaqc нэмнэ — finRow алга болох ЁСГҮЙ */
assert.ok(await CAPS.toggleCap(U, 'qaqc', true));
await settle();
eq(sorted(fake.json('__cap__:', U)), sorted(['addRow', 'finRow', 'qaqc']), 'ArcGIS: хоёр админы эрх хоёулаа');
eq(sorted(CAPS.capsStored(U)), sorted(['addRow', 'finRow', 'qaqc']), 'локал кэш шинэ утгаар');
/* Нөгөө админ addRow хассан; энэ сешн qaqc хасна — addRow сэргэх ЁСГҮЙ */
fake.find('__cap__:' + U)[0].views = JSON.stringify(['finRow', 'qaqc']);
assert.ok(await CAPS.toggleCap(U, 'qaqc', false));
await settle();
eq(fake.json('__cap__:', U), ['finRow'], 'ArcGIS: хасагдсан addRow сэргээгүй');

/* Багц: энэ сешн P0 олгосон */
const [P0, P1, P2] = PKG_GROUPS;
const w1 = HV.setHuvaariGrants
  ? HV.setHuvaariGrants(U, [{ role: 'author', bagts: [P0] }])
  : HV.setHuvaariAssign(U, ['author'], [P0]);
assert.ok(w1.ok, w1.error);
await w1.sync; await settle();
/* Нөгөө админ P1 нэмэв */
const hvRow = fake.find('__huvaari__:' + U)[0];
const d = JSON.parse(hvRow.views);
d.grants = [{ role: 'author', bagts: [P0, P1] }];
hvRow.views = JSON.stringify(d);
/* Энэ сешн хуучин кэшээсээ P2 нэмнэ */
const w2 = HV.setHuvaariGrants
  ? HV.setHuvaariGrants(U, [{ role: 'author', bagts: [P0, P2] }])
  : HV.setHuvaariAssign(U, ['author'], [P0, P2]);
assert.ok(w2.ok, w2.error);
await w2.sync; await settle();
eq(sorted(fake.json('__huvaari__:', U).grants[0].bagts), sorted([P0, P1, P2]), 'ArcGIS: P1 (нөгөө админ) хадгалагдав');
eq(sorted(HV.listHuvaariAssigns().find((a) => a.user === U).grants[0].bagts), sorted([P0, P1, P2]), 'локал нэгтгэгдэв');

/* ── Dirty → tombstone (⚠️ 2026-10-09, аудит №6) ──
   А админ сүлжээгүй үед X-ийг засав (dirty) → Б админ X-ийг устгав → А-гийн дараагийн poll
   (`retryDirtyOnce`) ба dirty салаатай `setUser` хоёулаа tombstone-ыг ДАРАХ ЁСГҮЙ. */
{
  const T1 = 'merge_t1';
  const T2 = 'merge_t2';
  fake.seed([
    { username: T1, role: 'taniltsah', views: JSON.stringify(['gdash']), docs: 0 },
    { username: T2, role: 'taniltsah', views: JSON.stringify(['gdash']), docs: 0 },
  ]);
  assert.ok(await P.initRemote(false, true), 'initRemote (tombstone)');
  await settle();
  eq(P.hasAccess(T1), true, 'T1 нэвтэрнэ');
  fake.failWrites = true;
  eq(await P.setUser(T1, { views: ['gdash', 'plan'], docs: false }, 'taniltsah'), false, 'T1: бичилт унана → dirty');
  eq(await P.setUser(T2, { views: ['gdash', 'plan'], docs: false }, 'taniltsah'), false, 'T2: бичилт унана → dirty');
  await settle();
  fake.failWrites = false;
  eq(P.dirtyKeys().includes(T1) && P.dirtyKeys().includes(T2), true, 'хоёулаа dirty');
  /* Нөгөө админ T1-ийг устгав (tombstone = `views: 'removed'`) */
  const tomb = (t) => Object.assign(fake.find(t)[0], { views: 'removed', role: null, docs: 0 });
  tomb(T1);
  /* (а) poll → retryDirtyOnce: T1 tombstone хэвээр, dirty хаягдана, локалд устгагдсан.
     Бичилт унасаар (`failWrites`) тул T2 dirty ХЭВЭЭР — (б)-д dirty салааг шалгахад */
  fake.failWrites = true;
  assert.ok(await P.initRemote(false, true), 'initRemote (poll)');
  await settle();
  fake.failWrites = false;
  eq(fake.find(T1)[0].views, 'removed', 'T1: retry tombstone-ыг дараагүй');
  eq(P.dirtyKeys().includes(T1), false, 'T1: dirty хаягдав');
  eq(P.hasAccess(T1), false, 'T1: локалд tombstone — нэвтрэхгүй');
  eq(P.dirtyKeys().includes(T2), true, 'T2: dirty хэвээр');
  /* (б) dirty салаатай `setUser`: нөгөө админ T2-ийг устгасан бол бүтэн upsert явуулахгүй */
  tomb(T2);
  eq(await P.setUser(T2, { views: ['gdash', 'iot'], docs: false }, 'taniltsah'), false, 'T2: dirty салаа tombstone дээр бичихгүй');
  eq(fake.find(T2)[0].views, 'removed', 'T2: ArcGIS tombstone хэвээр');
  eq(P.dirtyKeys().includes(T2), false, 'T2: хуучин dirty хаягдав');
  eq(P.hasAccess(T2), false, 'T2: нэвтрэхгүй');
}

eq(fake.unexpected, [], 'амьд сүлжээ рүү хүсэлт явсангүй');
console.log(`✅ aclMerge: ${checks} шалгалт — хоёр админы зэрэг засвар алдагдалгүй · dirty → tombstone дарахгүй`);
