/**
 * ТОКЕН · REFERER (`tools/draft-gc.mjs` · `tools/liveFetch.mjs`) — сүлжээгүй (2026-11-24). CI синк (sync-all) 2026-11-24-нд хасагдсан.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs tools/syncAll.check.mjs
 *
 * Хамгаалж буй алдаа:
 *   1. Referer токен (`client: 'referer'`) авсан ч хүсэлтэд `Referer` толгой алга → 498 «Invalid token».
 *   2. CI-ийн hoSync гэрээний мөрийг хөтчийн хамгаалалтгүй (нэмэхийн өмнө дахин уншиж, нэмсний дараа давхардлыг устгах) нэмдэг
 *      байв → хөтөч ба CI зэрэг нэмбэл давхар гэрээний мөр (бүртгэлийн олгосон дүн давхар).
 */
import assert from 'node:assert/strict';
import { installTokenInjection, syncToken, withReferer } from './liveFetch.mjs';

/* ── 1. Referer толгой — хүсэлт бүрд, зөвхөн Enterprise-ийн хаягт ── */
{
  const seen = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    seen.push({ url: String(input?.url ?? input), init });
    return new Response('{}', { status: 200 });
  };
  try {
    installTokenInjection({ tok: 'T', referer: 'https://gis.example.mn/portal' }, ['https://gis.example.mn/']);
    await fetch('https://gis.example.mn/server/rest/services/X/FeatureServer/1/query?f=json');
    await fetch('https://gis.example.mn/server/rest/services/X/FeatureServer/1/applyEdits', { method: 'POST', body: new URLSearchParams({ f: 'json' }) });
    await fetch('https://gis.example.mn/server/rest/services/X/FeatureServer/1/query', { method: 'POST', body: 'f=json', headers: { 'X-A': '1' } });
    await fetch('https://other.example.com/a');
    const ref = (i) => new Headers(seen[i].init?.headers).get('Referer');
    assert.equal(ref(0), 'https://gis.example.mn/portal', 'GET→POST хүсэлтэд Referer');
    assert.equal(new Headers(seen[0].init.headers).get('Content-Type'), 'application/x-www-form-urlencoded', 'GET→POST толгой хэвээр');
    assert.equal(new URLSearchParams(seen[0].init.body).get('token'), 'T');
    assert.equal(ref(1), 'https://gis.example.mn/portal', 'URLSearchParams body-тэй POST-д Referer');
    assert.equal(ref(2), 'https://gis.example.mn/portal', 'string body-тэй POST-д Referer');
    assert.equal(new Headers(seen[2].init.headers).get('X-A'), '1', 'дуудагчийн толгой хадгалагдана');
    assert.equal(seen[3].init, undefined, 'гадны хаягт хөндөхгүй');
  } finally {
    globalThis.fetch = before;
  }
  assert.equal(withReferer('u', undefined, ''), undefined, 'referer-гүй (админ токен) бол хөндөхгүй');
  assert.equal(new Headers(withReferer('u', { headers: { Referer: 'x' } }, 'y').headers).get('Referer'), 'x', 'байгаа Referer-ийг дарахгүй');
  const req = new Request('https://gis.example.mn/a', { headers: { 'X-B': '2' } });
  assert.equal(new Headers(withReferer(req, undefined, 'r').headers).get('X-B'), '2', 'Request объектын толгой хадгалагдана');
}

/* ── 2. syncToken — referer токен нь referer-ээ буцаана; generateToken-д client: 'referer' ── */
{
  const env = { ...process.env };
  const before = globalThis.fetch;
  let body = null;
  globalThis.fetch = async (_u, init) => { body = new URLSearchParams(init.body); return new Response(JSON.stringify({ token: 'G' })); };
  try {
    process.env.ARCGIS_SYNC_USER = 'u';
    process.env.ARCGIS_SYNC_PASS = 'p';
    process.env.NEXT_PUBLIC_ENT_PORTAL_URL = 'https://gis.example.mn/portal/';
    const t = await syncToken();
    assert.equal(t.tok, 'G');
    assert.equal(t.referer, 'https://gis.example.mn/portal', 'referer = generateToken-д өгсөн портал');
    assert.equal(body.get('client'), 'referer');
    assert.equal(body.get('referer'), t.referer, 'токены referer ба толгойн referer ижил');
  } finally {
    globalThis.fetch = before;
    process.env = env;
  }
}

console.log('syncAll: ok');
