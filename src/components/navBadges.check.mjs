/**
 * Цэсний тэмдэг — ДАРААЛАЛГҮЙ ирсэн хариу шинэ тоог дарахгүй (2026-10-01).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/navBadges.check.mjs
 *
 * ⚠️ `makeBadgeRefresher`: дуудлага бүр дугаартай; хариу ирэхэд илүү шинэ дуудлага
 *    эхэлсэн бол `null` (хэрэглэхгүй). Сүлжээгүй — ачаалагчийг орлуулна.
 */
import assert from 'node:assert/strict';
import { makeBadgeRefresher } from '@/components/navBadges';

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
