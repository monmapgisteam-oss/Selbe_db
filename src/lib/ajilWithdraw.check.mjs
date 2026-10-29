/**
 * НЭМЭЛТ АЖЛЫН ИЛГЭЭЛТЭЭ ТАТАХ (`ajilBatlah.withdrawAjil`) — хуурамч сервертэй, сүлжээгүй (2026-10-22, аудит №6).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/ajilWithdraw.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. УРАЛДАА — урьд нь уншилт (түгжээгүй) → бичилт л байсан тул батлагч тэр завсарт шийдвэрлэвэл хоёр бичилт
 *      бие биеэ дардаг байв. Одоо эхлээд `claimAjil` (CAS) — өөр хүний хүчинтэй түгжээ байвал татгалзана.
 *   2. ХАРИУ АЛДАГДСАН — «Татсан» серверт суусан ч алдаа буцааж зохиогчийн мөрүүд хуудсанд буцдаггүй байв. Одоо
 *      дахин уншиж «Татсан» бол амжилт; хүлээгдсэн хэвээр бол алдаа; дахин уншилт ч унавал `unsure`.
 */
import assert from 'node:assert/strict';
const { registerIdentity } = await import('@/lib/authToken.ts');
const { AUTH } = await import('@/lib/services.ts');
registerIdentity({ findCredential: () => ({ token: 'FAKE', userId: 'author_a' }) }, `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing`);
const { GUITS } = await import('@/lib/services/env.ts');
const AB = await import('@/lib/ajilBatlah.ts');
const URLT = `${GUITS}/189`;

let row;
const reset = (o = {}) => {
  row = {
    objectid: 1, bagts_key: 'b1_9f', bagts_group: 'Багц 1', toloh: AB.AJIL_STATUS.pending, zohiogch: 'author_a',
    ilgeesen_ognoo: Date.now() - 60_000, batlagch: null, shiidver_ognoo: null, butsaasan_shaltgaan: null,
    tailbar: null, mor_too: 1, aguulga: '{"v":1,"pkgKey":"b1_9f","adds":[]}', ...o,
  };
};
const key = (n) => Object.keys(row).find((k) => k.toLowerCase() === String(n).trim().toLowerCase());
/** Дэгээ: `afterCommit(attrs)` — бичилт СЕРВЕРТ суусны дараа (хариу алдагдах загварт шиднэ); `failQuery` — уншилт унах */
let hook = {};
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const p = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')));
  if (!u.startsWith(URLT)) return json({ error: { code: 500, message: `mock: гадны хаяг ${u}` } });
  if (u.endsWith('/query')) {
    if (hook.failQuery?.()) throw new TypeError('Failed to fetch');
    if (p.outStatistics) return json({ features: [{ attributes: { srv_now: Date.now() } }] });
    const attrs = {};
    for (const f of String(p.outFields || '*').split(',')) { const k = key(f); if (k) attrs[f] = row[k]; }
    return json({ features: [{ attributes: attrs }] });
  }
  if (u.endsWith('/applyEdits')) {
    const ups = JSON.parse(p.updates ?? '[]');
    for (const x of ups) {
      for (const [k0, v] of Object.entries(x.attributes)) { const k = key(k0); if (k && k !== 'objectid') row[k] = v; }
      hook.afterCommit?.(x.attributes);
    }
    return json({ updateResults: ups.map(() => ({ objectId: 1, success: true })) });
  }
  return json({ error: { code: 400, message: 'mock' } });
};
const isWithdrawWrite = (a) => Object.values(a).includes(AB.AJIL_STATUS.withdrawn);

/* 1. Энгийн таталт — түгжээ авч, «Татсан» бичиж, тэмдгийг арилгана */
reset(); hook = {};
let r = await AB.withdrawAjil({ oid: 1, me: 'author_a' });
assert.deepEqual(r, { ok: true });
assert.equal(row.toloh, AB.AJIL_STATUS.withdrawn);
assert.equal(row.butsaasan_shaltgaan, null, 'түгжээний тэмдэг арилсан');
console.log('✅ энгийн таталт');

/* 2. Батлагч (өөр хүн) хүчинтэй түгжээ барьж байна → татгалзана, төлөв хөндөгдөхгүй */
reset({ butsaasan_shaltgaan: `${AB.AJIL_CLAIM_MARK}:${Date.now()}:othertab:manager_3` });
r = await AB.withdrawAjil({ oid: 1, me: 'author_a' });
assert.equal(r.ok, false);
assert.match(r.error, /manager_3/, `батлагчийн нэр хэлэгдэх ёстой: ${r.error}`);
assert.equal(row.toloh, AB.AJIL_STATUS.pending, 'батлагчийн шийдвэрийн дундуур татагдсангүй');
console.log('✅ батлагчийн түгжээтэй үед татахгүй (уралдаа)');

/* 3. Таталтын түгжээ ТАВИГДСАНЫ дараа батлагчийн түгжээ авах оролдлого (`casAjilClaim`) татгалзана */
reset();
hook = {
  afterCommit: (a) => {
    if (String(Object.values(a).find((v) => String(v ?? '').startsWith(AB.AJIL_CLAIM_MARK)) ?? '').length) {
      hook.markSeen = row.butsaasan_shaltgaan;
    }
  },
};
r = await AB.withdrawAjil({ oid: 1, me: 'author_a' });
assert.equal(r.ok, true);
assert.ok(String(hook.markSeen ?? '').includes(':author_a'), 'татахаас ӨМНӨ зохиогчийн түгжээ тавигдсан');
{
  const held = AB.ajilClaimOf(AB.AJIL_STATUS.pending, hook.markSeen);
  assert.equal(held?.who, 'author_a', 'тэр завсарт батлагч `decideAjil` «author_a түгжиж байна» гэж татгалзана');
}
console.log('✅ таталт эхлээд түгжээ авна (CAS)');

/* 4. ХАРИУ АЛДАГДСАН, бичилт СУУСАН → дахин уншиж амжилт (мөрүүд буулгагдана) */
reset();
hook = { afterCommit: (a) => { if (isWithdrawWrite(a)) throw new TypeError('Failed to fetch'); } };
r = await AB.withdrawAjil({ oid: 1, me: 'author_a' });
assert.deepEqual(r, { ok: true }, `хариу алдагдсан ч «Татсан» суусан бол амжилт: ${JSON.stringify(r)}`);
console.log('✅ хариу алдагдсан — дахин уншиж «Татсан» бол амжилт');

/* 5. ХАРИУ АЛДАГДСАН, бичилт СУУГААГҮЙ → хүлээгдсэн хэвээр, алдаа (unsure биш) */
reset();
{
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const p = new URLSearchParams(String(init?.body ?? ''));
    if (String(url).endsWith('/applyEdits') && String(p.get('updates') ?? '').includes(AB.AJIL_STATUS.withdrawn)) throw new TypeError('Failed to fetch');
    return real(url, init);
  };
  r = await AB.withdrawAjil({ oid: 1, me: 'author_a' });
  globalThis.fetch = real;
}
assert.equal(r.ok, false);
assert.equal(r.unsure, undefined);
assert.match(r.error, /татагдаагүй/, r.error);
assert.equal(row.toloh, AB.AJIL_STATUS.pending);
console.log('✅ хариу алдагдсан, суугаагүй — хүлээгдсэн хэвээр гэж хэлнэ');

/* 6. ХАРИУ АЛДАГДСАН ба дахин уншилт ч унасан → `unsure` (дуудагч мөрүүдийг тэмдэглэнэ) */
reset();
{
  let lost = false;
  hook = {
    afterCommit: (a) => { if (isWithdrawWrite(a)) { lost = true; throw new TypeError('Failed to fetch'); } },
    failQuery: () => lost,
  };
  r = await AB.withdrawAjil({ oid: 1, me: 'author_a' });
}
assert.equal(r.ok, false);
assert.equal(r.unsure, true, 'тодорхойгүй үр дүн `unsure`');
console.log('✅ хариу ба дахин уншилт алдагдсан — unsure');

/* 7. Өөр хүн татах гэвэл — зохиогчийн дүрэм сүлжээнээс өмнө/серверийн `author`-оор */
reset(); hook = {};
r = await AB.withdrawAjil({ oid: 1, me: 'someone_else' });
assert.equal(r.ok, false);
assert.equal(row.toloh, AB.AJIL_STATUS.pending);
console.log('✅ зөвхөн зохиогч');

console.log('ajilWithdraw.check: OK');
