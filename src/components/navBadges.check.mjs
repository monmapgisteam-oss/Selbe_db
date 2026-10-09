/**
 * Цэсний тэмдэг — ДАРААЛАЛГҮЙ ирсэн хариу шинэ тоог дарахгүй (2026-10-01).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/navBadges.check.mjs
 *
 * ⚠️ `makeBadgeRefresher`: дуудлага бүр дугаартай; хариу ирэхэд илүү шинэ дуудлага
 *    эхэлсэн бол `null` (хэрэглэхгүй). Сүлжээгүй — ачаалагчийг орлуулна.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBadgeRefresher, BADGE_VIEWS } from '@/components/navBadges';

/* ── ⚠️ 2026-10-08: «Хуваарь» харагдацад зохиогчийн БУЦААГДСАН илгээлтийн тэмдэг (`countPlanReturned`),
   «Хуваарь батлах»-д батлагчийн хүлээгдэж буй (`countPlanPending`) — хоёулаа `huvaariBatlah.ts`-д ── */
{
  assert.ok(BADGE_VIEWS.has('huvaariBatlah'), 'huvaariBatlah тэмдэггүй');
  assert.ok(BADGE_VIEWS.has('huvaari'), 'huvaari (буцаагдсан) тэмдэггүй');
  const L = fs.readFileSync('src/lib/huvaariBatlah.ts', 'utf8');
  assert.ok(/export async function countPlanReturned\(username: string \| null \| undefined\): Promise<number \| null>/.test(L), 'countPlanReturned алга');
  assert.ok(/export async function countPlanPending\(username: string \| null \| undefined\): Promise<number \| null>/.test(L), 'countPlanPending алга');
  const body = L.slice(L.indexOf('export async function countPlanReturned('));
  assert.ok(body.includes("x.status === PLAN_STATUS.returned") && body.includes("huvaariScope(me, 'author')") && L.includes("cached(loadLastPerPkg, BADGE_TTL, ['HUVAARI_BATLAH'])"),
    'countPlanReturned: буцаагдсан · зохиогчийн хүрээ · HUVAARI_BATLAH кэш');
  /* ⚠️ 2026-10-09: «Хуваарь» тэмдэг = буцаагдсан + саяхан батлагдсан (`countPlanApproved`, 3 хоног, хараагүй) */
  assert.ok(/export async function countPlanApproved\(username: string \| null \| undefined\): Promise<number \| null>/.test(L), 'countPlanApproved алга');
  const ab = L.slice(L.indexOf('export async function countPlanApproved('));
  assert.ok(ab.includes('x.status === PLAN_STATUS.approved') && ab.includes('PLAN_APPROVED_TTL') && ab.includes('!seen.has(x.oid)'),
    'countPlanApproved: батлагдсан · 3 хоног · хараагүй');
  const N = fs.readFileSync('src/components/navBadges.ts', 'utf8');
  assert.ok(N.includes("['countPlanApproved']"), 'navBadges: countPlanApproved холбогдоогүй');
  const V = fs.readFileSync('src/components/ViewRail.tsx', 'utf8');
  assert.ok(V.includes("k === 'huvaari' ? tr('шинэ шийдвэр {0} (буцаагдсан · батлагдсан)', num(n))"), 'ViewRail: «Хуваарь» тэмдгийн утга «шинэ шийдвэр N» биш');
  console.log('✅ хуваарийн тэмдэг — батлагчид хүлээгдэж буй · зохиогчид буцаагдсан/батлагдсан');
}

/** Гараар шийдэх Promise — хариуны дарааллыг тест удирдана */
const deferred = () => {
  let resolve, reject;
  const p = new Promise((r, j) => { resolve = r; reject = j; });
  return { p, resolve, reject };
};

/* ── Хуучин (удаан) хариу шинэ хариуны ДАРАА ирвэл хаягдана ── */
{
  const calls = [];
  const refresh = makeBadgeRefresher((user, scope) => {
    const d = deferred();
    calls.push({ user, scope, d });
    return d.p;
  });
  const first = refresh('bat', 'all');
  const second = refresh('bat', 'all');
  /* Шинэ нь ЭХЭЛЖ ирнэ (бичилтийн дараах тоо), хуучин нь дараа нь */
  calls[1].d.resolve({ ajilBatlah: 0 });
  calls[0].d.resolve({ ajilBatlah: 5 });
  assert.deepEqual(await second, { ajilBatlah: 0 });
  assert.equal(await first, null, 'хуучин хариу шинэ тоог дарав');
  console.log('✅ дараалалгүй хариу: хуучин нь хаягдана, шинэ тоо үлдэнэ');
}

/* ── Дарааллаар ирвэл хоёулаа хэрэглэгдэнэ (сүүлийнх нь л сүүлд) ── */
{
  const ds = [];
  const refresh = makeBadgeRefresher(() => { const d = deferred(); ds.push(d); return d.p; });
  const a = refresh(null, 'all');
  ds[0].resolve({ chanar: 1 });
  assert.deepEqual(await a, { chanar: 1 });
  const b = refresh(null, 'all');
  ds[1].resolve({ chanar: 2 });
  assert.deepEqual(await b, { chanar: 2 });
  console.log('✅ дарааллаар ирсэн хариу бүр хэрэглэгдэнэ');
}

/* ── Хэрэглэгч солигдоход өмнөх хүний удаан хариу шинэ хүний тоог дарахгүй ── */
{
  const ds = [];
  const refresh = makeBadgeRefresher((user) => { const d = deferred(); ds.push({ user, d }); return d.p; });
  const old = refresh('huuchin', 'all');
  const cur = refresh('shine', 'all');
  ds[1].d.resolve({ huvaariBatlah: 1 });
  ds[0].d.resolve({ huvaariBatlah: 9 });
  assert.deepEqual(await cur, { huvaariBatlah: 1 });
  assert.equal(await old, null);
  console.log('✅ хэрэглэгч солигдоход өмнөх хүний тоо гарахгүй');
}

/* ── Алдаа → null (чимээгүй, өмнөх тоо хэвээр); шидэхгүй ── */
{
  const refresh = makeBadgeRefresher(async () => { throw new Error('сүлжээ'); });
  assert.equal(await refresh(null, 'all'), null);
  console.log('✅ алдаа → null (тэмдэг чимээгүй)');
}
