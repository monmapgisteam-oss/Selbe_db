/**
 * MA ХАВСРАЛТЫН БАГЦЫН ХҮРЭЭ (2026-10-19, аудит №3) — `ma.maAttachScopeDeny`.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/maAttachScope.check.mjs
 *
 * ⚠️ Урьд нь `addMaAtt`/`deleteMaAtt` нь зөвхөн `chanarAuthor`/`chanarReview` эрхийг шалгадаг тул Багц 1-ийн
 *    ирүүлэгч Багц 5-ын MA-гийн гэрчилгээг нэмж/устгаж чаддаг байв. Одоо `ficMakt.scopeDeny` ·
 *    `chanarStore.attachDeny`-ийн ижил дүрэм: (ирүүлэгчийн эрх БА тэр багцад ирүүлэгч) ЭСВЭЛ
 *    (хянагчийн эрх БА тэр багцад хянагчийн үүрэг). Танигдахгүй багц → татгалзана. Сүлжээгүй.
 */
import assert from 'node:assert/strict';

/* ── window/localStorage shim — 'use client' ACL модулиуд ── */
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

const { maAttachScopeDeny } = await import('@/lib/ma.ts');
const CH = await import('@/lib/chanarAcl.ts');
const CAPS = await import('@/lib/caps.ts');
const WHO = await import('@/lib/who.ts');
const { PKGS } = await import('@/modules/sheet/bagts.pkg.ts');
const { AUTH, ROLE_BY_USER } = await import('@/lib/services.ts');

let n = 0;
const ok = async (name, fn) => { await fn(); n += 1; console.log('  ✓', name); };

/* Хоёр ӨӨР бүлгийн хуудас */
const pA = PKGS[0];
const pB = PKGS.find((p) => p.group !== pA.group);
assert.ok(pB, 'хоёр өөр багцын хуудас олдсонгүй');

CH._syncRemoteChanar([
  { user: 'ma_author', grants: [{ role: 'author', bagts: [pA.group] }] },
  { user: 'ma_tuh', grants: [{ role: 'tuh', bagts: [pB.group] }] },
]);
CAPS._syncRemoteCaps([
  { user: 'ma_author', caps: ['chanarAuthor'] },
  { user: 'ma_tuh', caps: ['chanarReview'] },
  /* эрхтэй ч хуваарилалтгүй (өнчин эрх) */
  { user: 'ma_orphan', caps: ['chanarAuthor', 'chanarReview'] },
]);

await ok('ирүүлэгч — ӨӨРИЙН багцын MA-д зөвшөөрнө, ӨӨР багцынхад татгалзана', async () => {
  WHO.setCurrentUser('ma_author');
  assert.equal(await maAttachScopeDeny(pA.key, true), null);
  assert.equal(typeof await maAttachScopeDeny(pB.key, true), 'string');
});
await ok('хянагч (ТУХ) — зөвхөн хуваарилагдсан багцад', async () => {
  WHO.setCurrentUser('ma_tuh');
  assert.equal(await maAttachScopeDeny(pB.key, true), null);
  assert.equal(typeof await maAttachScopeDeny(pA.key, true), 'string');
});
await ok('эрхтэй ч хуваарилалтгүй (өнчин эрх) → татгалзана', async () => {
  WHO.setCurrentUser('ma_orphan');
  assert.equal(typeof await maAttachScopeDeny(pA.key, true), 'string');
});
await ok('танигдахгүй багц → татгалзана (fail-closed)', async () => {
  WHO.setCurrentUser('ma_author');
  assert.match(await maAttachScopeDeny('no_such_pkg', true), /танигдсангүй/);
});
await ok('нэвтрээгүй → татгалзана', async () => {
  WHO.setCurrentUser(null);
  assert.equal(typeof await maAttachScopeDeny(pA.key, true), 'string');
});
await ok('хатуу super — бүх багц (хуваарилалт үйлчлэхгүй)', async () => {
  const sup = Object.entries(ROLE_BY_USER).find(([, r]) => r === 'super')[0];
  WHO.setCurrentUser(sup);
  assert.equal(await maAttachScopeDeny(pA.key, true), null);
  assert.equal(await maAttachScopeDeny(pB.key, true), null);
});
if (AUTH.appId) {
  await ok('хуваарилалттай ч ЭРХ алга → татгалзана (эрх ба хүрээ хоёулаа)', async () => {
    CH._syncRemoteChanar([{ user: 'ma_nocap', grants: [{ role: 'author', bagts: [pA.group] }] }]);
    WHO.setCurrentUser('ma_nocap');
    assert.equal(typeof await maAttachScopeDeny(pA.key, true), 'string');
  });
}
await ok('strict=false (Node · нэвтрэлт унтраалттай) → шалгахгүй', async () => {
  WHO.setCurrentUser('ma_author');
  assert.equal(await maAttachScopeDeny(pB.key, false), null);
});
WHO.setCurrentUser(null);

/* ⚠️ Бичих хоёр зам хоёулаа хүрээг шалгана (эх кодоор — сүлжээгүй) */
{
  const { readFileSync } = await import('node:fs');
  const S = readFileSync('src/lib/ma.ts', 'utf8');
  for (const fn of ['addMaAtt', 'deleteMaAtt']) {
    const body = S.slice(S.indexOf(`export async function ${fn}(`), S.indexOf('\n}', S.indexOf(`export async function ${fn}(`)));
    await ok(`${fn}: requireAttachScope дуудагдана`, () => assert.ok(body.includes('await requireAttachScope(oid);'), body));
  }
}

console.log(`maAttachScope: ${n} шалгуур давлаа`);
