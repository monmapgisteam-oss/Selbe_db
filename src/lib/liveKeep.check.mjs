/**
 * `live.cached`-ийн `keep` — ЗӨВХӨН БҮРЭН үр дүнг кэшлэнэ (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/liveKeep.check.mjs
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): «Багц ажлын оноо», CEO самбарын картууд ба
 *    `loadFinData` хэсэгчилсэн (аль нэг эх унасан) үр дүнгээ 1–5 минут «хуучин нөөц» болгон
 *    барьдаг байв — эх сэргэсэн ч дахин оролдохгүй. Одоо: тэр үр дүн одоогийн дуудагчдад
 *    хүрнэ (унасан эхийн нэр дэлгэцэнд), ДАРААГИЙН дуудалт шинээр татна.
 */
import assert from 'node:assert/strict';
import { cached } from '@/lib/live';
import { invalidate } from '@/lib/dataBus';

const tick = () => new Promise((r) => setTimeout(r, 0));

/* 1. Хэсэгчилсэн → дараагийн дуудалт дахин татна; бүрэн болмогц кэшлэнэ */
{
  let n = 0;
  const load = cached(async () => { n += 1; return { failed: n < 3 ? ['QAQC'] : [] }; }, 5 * 60_000, ['BAGTS_SHEET'],
    (v) => v.failed.length === 0);
  const a = await load();
  assert.deepEqual(a.failed, ['QAQC'], 'хэсэгчилсэн үр дүн дуудагчид ХҮРНЭ (нэрээ хэлнэ)');
  await tick();
  await load();
  assert.equal(n, 2, 'хэсэгчилсэн үр дүн кэшлэгдсэнгүй — дахин татав');
  await tick();
  const c = await load();
  assert.equal(n, 3);
  assert.deepEqual(c.failed, []);
  await tick();
  await load();
  assert.equal(n, 3, 'бүрэн үр дүн кэшлэгдэв');
}

/* 2. Зэрэг дуудагчид НЭГ хүсэлтийг хуваалцана (хэсэгчилсэн ч) */
{
  let n = 0;
  const load = cached(async () => { n += 1; await tick(); return { ok: false }; }, undefined, ['HABEA'], (v) => v.ok);
  const [x, y] = await Promise.all([load(), load()]);
  assert.equal(n, 1, 'зэрэг дуудалт давхар хүсэлт үүсгэсэнгүй');
  assert.equal(x, y);
}

/* 3. Хоцорсон хэсэгчилсэн хариу ШИНЭ кэшийг устгахгүй (`p === mine` хаалт) */
{
  let n = 0;
  let releaseOld;
  const load = cached(() => {
    n += 1;
    if (n === 1) return new Promise((res) => { releaseOld = () => res({ ok: false }); });
    return Promise.resolve({ ok: true });
  }, undefined, ['ZOVSHOOROL'], (v) => v.ok);
  const old = load();
  invalidate('ZOVSHOOROL');
  const fresh = await load();
  assert.equal(fresh.ok, true);
  releaseOld();
  await old;
  await tick();
  await load();
  assert.equal(n, 2, 'хуучин хэсэгчилсэн хариу шинэ бүрэн кэшийг хаясан');
}

/* 4. `keep`-гүй — хуучин зан (амжилттай бүхнийг кэшлэнэ) */
{
  let n = 0;
  const load = cached(async () => { n += 1; return { failed: ['x'] }; }, undefined, ['HYANALT']);
  await load(); await tick(); await load();
  assert.equal(n, 1);
}

console.log('liveKeep.check: OK');
