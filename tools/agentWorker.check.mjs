/**
 * AI релейн Cloudflare Worker хувилбар (`agent-proxy/worker.mjs`) — `export default.fetch`-ийг
 * хуурамч `env` (KV stub) ба хуурамч `fetch`-ээр дуудаж шалгана (2026-10-09, аудит №6).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/agentWorker.check.mjs
 *
 * ⚠️ Урьд `worker.mjs` нэг ч шалгуургүй байв — `server.mjs`-ийн толин хувилбар гэдэг ч гар аргаар
 *    л тааруулдаг. Энд хаалтууд: (а) буруу Origin → 403; (б) `x-bot-secret` буруу (ArcGIS
 *    токенгүй) → 401; (в) дээд үйлчилгээ (Anthropic) 401 → 502 `upstream_auth`.
 * ⚠️ 2026-10-21 (аудит): + (г) `ARCGIS_ORG_ID` хоосон → ботоос бусдад 503 (урьд нээлттэй);
 *    (д) токен хүчинтэй ч порталын эрхийн хүснэгтэд МӨРГҮЙ → 403, устгагдсан (`views: 'removed'`) → 403,
 *    хүснэгт уншигдахгүй → 503 retryable; баталгаажсан хэрэглэгч кэшлэгдэж `community/self` · хүснэгт дахин асуугдахгүй;
 *    (е) `RL_KV` холбоогүй → isolate бүрд НЭГ чанга анхааруулга.
 * ⚠️ 2026-10-22 (аудит): (е) нь зөвхөн анхааруулгыг тоолж, модулийн түвшний `warnedNoKv`-ээс болж хэсгүүдийн ДАРААЛЛААС
 *    хамаардаг байв — одоо ШИНЭ модулийн хувь дээр, ½ төсвийг (`budgetCapFor`) зан төлөвөөр нь батална;
 *    + (ё) `server.mjs`-ийн `hasPortalRow`/`checkArcGIS` толин хуулбар (урьд огт шалгагддаггүй байв).
 * ⚠️ `worker.mjs` нь `fetch`-ийг ГЛОБАЛААС дууддаг (Worker орчинд өөр зам байхгүй) — тестэд
 *    `globalThis.fetch`-ийг түр сольж, дууссаны дараа буцаана. Refactor хэрэггүй.
 * ⚠️ Worker-ийн минутын тоолуур модулийн түвшинд — нэг процесст цөөн хүсэлт тул хүрэхгүй.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import worker from '../agent-proxy/worker.mjs';

/** KV stub — `get`/`put` санах ойд (worker `RL_KV` холбосон замаа ч гүйлгэнэ) */
function kvStub() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
    size: () => m.size,
  };
}
const ctx = { waitUntil: () => {} };
const ORIGIN = 'https://smart.selbecity.mn';
const ORG = 'org123';
const baseEnv = () => ({
  ALLOW_ORIGIN: `${ORIGIN},http://localhost:8123`,
  ANTHROPIC_API_KEY: 'sk-test',
  ARCGIS_ORG_ID: ORG,
  RL_KV: kvStub(),
});
const chatBody = () => JSON.stringify({
  system: 'Та туслах.',
  messages: [{ role: 'user', content: 'Сайн уу' }],
  tools: [],
});
const post = (env, headers, body = chatBody()) =>
  worker.fetch(new Request('https://relay.test/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }), env, ctx);

/* ⚠️ 2026-10-21: ArcGIS-ийн хоёр дуудлага (`community/self` · эрхийн хүснэгт) ба Anthropic-ийг замаар нь ялгана.
   Токен URL-д хэзээ ч орохгүй (POST биед) — `tools/tokenInUrl.check.mjs`-ийн дүрэм энд ч шалгагдана. */
const SELF = 'https://gis.selbecity.mn/geoportal/sharing/rest/community/self';
const PERMS = /SYS_Selbe_Permissions\/FeatureServer\/230\/query$/;
const jsonRes = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const okUpstream = () => jsonRes({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: 'Сайн байна уу' }],
  usage: { input_tokens: 10, output_tokens: 5 },
  id: 'msg_1', model: 'x',
});
const calls = { self: 0, perms: 0, up: 0, lastWhere: '' };
const reset = () => { calls.self = 0; calls.perms = 0; calls.up = 0; calls.lastWhere = ''; };
/** `self`/`perms` — биеийн `token`-ыг авч хариу буцаана; `upstream` — Anthropic */
function route({ self, perms, upstream = okUpstream }) {
  return async (url, init) => {
    const u = String(url);
    assert.ok(!/token=/.test(u), `токен URL-д орж болохгүй: ${u}`);
    const body = new URLSearchParams(String(init?.body ?? ''));
    if (u === SELF) {
      calls.self++;
      assert.equal(init.method, 'POST');
      return jsonRes(await self(body.get('token')));
    }
    if (PERMS.test(u)) {
      calls.perms++;
      calls.lastWhere = body.get('where') ?? '';
      assert.equal(body.get('outFields'), 'username,role,views', 'хүснэгтийн талбар жижиг үсгээр');
      assert.equal(body.get('f'), 'json');
      const r = await perms(body.get('token'), body.get('where'));
      if (r instanceof Error) throw r;
      return jsonRes(r);
    }
    calls.up++;
    return upstream(u, init);
  };
}
const selfOf = (username, orgId = ORG) => async (tok) => { assert.ok(tok, 'self: токен биед байх ёстой'); return { username, orgId }; };
const rowOf = (username, views = '[]') => async (tok) => { assert.ok(tok, 'perms: ХЭРЭГЛЭГЧИЙН токен биед'); return { features: [{ attributes: { username, role: 'beginner', views } }] }; };

const realFetch = globalThis.fetch;
const realWarn = console.warn;
let upstreamCalls = 0;
try {
  /* ── (а) буруу Origin → 403 (дээд үйлчилгээ рүү ОГТ явахгүй) ── */
  {
    globalThis.fetch = async () => { upstreamCalls++; throw new Error('дуудагдах ёсгүй'); };
    const res = await post(baseEnv(), { Origin: 'https://evil.example' });
    assert.equal(res.status, 403, `буруу origin → 403 биш (${res.status})`);
    const j = await res.json();
    assert.match(j.error, /зөвшөөрөл/);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null, 'буруу origin-д CORS толгой өгөх ёсгүй');
    assert.equal(upstreamCalls, 0);
    console.log('✅ worker: буруу Origin → 403, дээд үйлчилгээ дуудагдахгүй');
  }

  /* ── (б) `x-bot-secret` буруу, ArcGIS токенгүй → 401 (ботын нууц таарахгүй бол энгийн хэрэглэгч мэт шалгагдана) ── */
  {
    globalThis.fetch = async () => { upstreamCalls++; throw new Error('дуудагдах ёсгүй'); };
    const env = { ...baseEnv(), BOT_SECRET: 'correct-secret' };
    const res = await post(env, { 'x-bot-secret': 'wrong-secret', 'x-bot-user': '42' });
    assert.equal(res.status, 401, `буруу x-bot-secret → 401 биш (${res.status})`);
    const j = await res.json();
    assert.equal(j.retryable, false);
    assert.equal(j.code, undefined, 'ArcGIS нэвтрэлтийн 401-д `code` байх ёсгүй (клиент токеноо шинэчилнэ)');
    assert.equal(upstreamCalls, 0, 'токенгүй хүсэлт ArcGIS/Anthropic руу явах ёсгүй');
    console.log('✅ worker: x-bot-secret буруу → 401, дээд үйлчилгээ дуудагдахгүй');
  }

  /* ── (г) 2026-10-21: `ARCGIS_ORG_ID` ХООСОН → ботоос бусдад 503 (урьд нээлттэй — fail-open) ── */
  {
    reset();
    globalThis.fetch = route({ self: selfOf('bat'), perms: rowOf('bat') });
    const env = { ...baseEnv(), ARCGIS_ORG_ID: '', BOT_SECRET: 'correct-secret' };
    const res = await post(env, { Origin: ORIGIN, 'x-arcgis-token': 'tok-open' });
    assert.equal(res.status, 503, `ORG_ID хоосон → 503 биш (${res.status})`);
    const j = await res.json();
    assert.equal(j.retryable, false);
    assert.equal(calls.self + calls.perms + calls.up, 0, 'тохиргоогүй реле хаашаа ч хандахгүй');
    /* бот (нууц таарсан) хэвээр ажиллана */
    const rb = await post(env, { 'x-bot-secret': 'correct-secret', 'x-bot-user': '7' });
    assert.equal(rb.status, 200, `бот ORG_ID-гүй ч ажиллана (${rb.status})`);
    assert.equal(calls.up, 1);
    assert.equal(calls.self + calls.perms, 0, 'бот ArcGIS руу явахгүй');
    console.log('✅ worker: ARCGIS_ORG_ID хоосон → 503 (бот хэвээр)');
  }

  /* ── (в) дээд үйлчилгээ 401 → 502 `upstream_auth` (ArcGIS токен хүчинтэй, эрхийн мөртэй) ── */
  {
    reset();
    globalThis.fetch = route({
      self: selfOf('bat'),
      perms: rowOf('bat'),
      upstream: (url, init) => {
        assert.match(String(url), /api\.anthropic\.com\/v1\/messages/);
        assert.equal(init.headers['x-api-key'], 'sk-test');
        /* ⚠️ 2026-10-19: анхдагч Opus 5.5 — явцын тэмдэглэл (`display: 'updates'`) + beta толгой */
        assert.equal(init.headers['anthropic-beta'], 'thinking-display-updates-2026-08-18');
        assert.deepEqual(JSON.parse(init.body).thinking, { type: 'adaptive', display: 'updates' });
        return jsonRes({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401);
      },
    });
    const env = baseEnv();
    const res = await post(env, { Origin: ORIGIN, 'x-arcgis-token': 'tok-v' });
    assert.equal(res.status, 502, `дээд үйлчилгээний 401 → 502 биш (${res.status})`);
    const j = await res.json();
    assert.equal(j.code, 'upstream_auth');
    assert.equal(j.retryable, false);
    assert.equal(j.error, 'Туслахын серверийн тохиргооны алдаа');
    assert.ok(!/x-api-key|invalid/i.test(j.error), 'Anthropic-ийн түүхий мессеж клиентэд очих ёсгүй');
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.equal(calls.up, 1);
    assert.equal(calls.self, 1); assert.equal(calls.perms, 1);
    assert.equal(calls.lastWhere, "username = 'bat'", 'хүснэгтийн where — нэр жижиг үсгээр');
    console.log('✅ worker: Anthropic 401 → 502 upstream_auth (түүхий мессежгүй)');
  }

  /* ── амжилттай хариу шууд дамжина (толин хэлбэр `{stop_reason, content, usage}`) + баталгаажсан кэш ── */
  {
    reset();
    globalThis.fetch = route({ self: selfOf('Dorj_Selbe'), perms: rowOf('dorj_selbe', '"all"') });
    const env = baseEnv();
    const res = await post(env, { Origin: ORIGIN, 'x-arcgis-token': 'tok-ok' });
    assert.equal(res.status, 200, `амжилттай → 200 биш (${res.status})`);
    const j = await res.json();
    assert.deepEqual(Object.keys(j).sort(), ['content', 'stop_reason', 'usage']);
    assert.equal(j.content[0].text, 'Сайн байна уу');
    assert.equal(calls.lastWhere, "username = 'dorj_selbe' OR username = 'Dorj_Selbe'", 'том үсэгтэй нэр — жижиг + эх үсгээр хоёулаа');
    /* ⚠️ 2026-10-21: баталгаажсан хэрэглэгч кэшлэгдэнэ — дараагийн хүсэлт ArcGIS/хүснэгт рүү явахгүй */
    const res2 = await post(env, { Origin: ORIGIN, 'x-arcgis-token': 'tok-ok' });
    assert.equal(res2.status, 200);
    assert.equal(calls.self, 1, 'community/self дахин асуугдахгүй (кэш)');
    assert.equal(calls.perms, 1, 'эрхийн хүснэгт дахин асуугдахгүй (кэш)');
    assert.equal(calls.up, 2);
    console.log('✅ worker: амжилттай хариу `{stop_reason, content, usage}`-аар · баталгаажсан токен кэшлэгдэв');
  }

  /* ── (д) 2026-10-21: токен хүчинтэй ч порталын эрхийн хүснэгтэд МӨРГҮЙ → 403 (кэшлэхгүй, дээд үйлчилгээ рүү явахгүй) ── */
  {
    reset();
    globalThis.fetch = route({ self: selfOf('ganbat'), perms: async () => ({ features: [] }) });
    const env = baseEnv();
    const res = await post(env, { Origin: ORIGIN, 'x-arcgis-token': 'tok-norow' });
    assert.equal(res.status, 403, `мөргүй → 403 биш (${res.status})`);
    const j = await res.json();
    assert.equal(j.retryable, false);
    assert.match(j.error, /бүртгэлгүй/);
    assert.equal(calls.up, 0, 'эрхгүй хэрэглэгч дээд үйлчилгээ рүү явахгүй');
    const res2 = await post(env, { Origin: ORIGIN, 'x-arcgis-token': 'tok-norow' });
    assert.equal(res2.status, 403);
    assert.equal(calls.perms, 2, 'татгалзсан нь кэшлэгдэхгүй — дахин шалгана');
    /* устгагдсан мөр (`views: 'removed'`) — мөн 403 */
    reset();
    globalThis.fetch = route({ self: selfOf('gone'), perms: rowOf('gone', 'removed') });
    const r3 = await post(env, { Origin: ORIGIN, 'x-arcgis-token': 'tok-tomb' });
    assert.equal(r3.status, 403, `устгагдсан мөр → 403 биш (${r3.status})`);
    assert.equal(calls.up, 0);
    /* хүснэгт уншигдахгүй (сүлжээ / ArcGIS 200+error) → 503 retryable, дээд үйлчилгээгүй */
    reset();
    globalThis.fetch = route({ self: selfOf('bat2'), perms: async () => new Error('сүлжээ') });
    const r4 = await post(env, { Origin: ORIGIN, 'x-arcgis-token': 'tok-err' });
    assert.equal(r4.status, 503, `хүснэгт уншигдахгүй → 503 биш (${r4.status})`);
    assert.equal((await r4.json()).retryable, true);
    globalThis.fetch = route({ self: selfOf('bat3'), perms: async () => ({ error: { code: 403, message: 'no access' } }) });
    const r5 = await post(env, { Origin: ORIGIN, 'x-arcgis-token': 'tok-err2' });
    assert.equal(r5.status, 503, `ArcGIS 200+error → 503 биш (${r5.status})`);
    assert.equal(calls.up, 0);
    console.log('✅ worker: эрхийн мөргүй/устгагдсан → 403 · хүснэгт уншигдахгүй → 503 retryable');
  }

  /* ── (е) 2026-10-21: `RL_KV` холбоогүй → isolate бүрд НЭГ чанга анхааруулга, isolate доторх төсөв ½, реле ажилласаар ──
     ⚠️ 2026-10-22 (аудит): ШИНЭ модулийн хувь (`?…` — шинэ isolate-ийн оронд) дээр: `warnedNoKv` модулийн түвшинд тул урьд
     нь дээрх хэсгүүдийн аль нэг нь KV-гүй хүсэлт эрт явуулбал анхааруулга 0 болж шалгуур ДАРААЛЛААС хамаардаг байв.
     ½ төсвийг (`budgetCapFor`) зан төлөвөөр: 300k төсөвт 200k зарцуулсны дараа KV-гүй бол 429 `daily_budget` (таг 150k),
     KV-тэй бол бүтэн 300k (2-р хүсэлт 200, 3-р нь 429 — KV тоолдог). */
  {
    const fresh = async (tag) => (await import(new URL(`../agent-proxy/worker.mjs?${tag}`, import.meta.url).href)).default;
    const postTo = (w, env) => w.fetch(new Request('https://relay.test/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'x-arcgis-token': 'tok-kv' },
      body: chatBody(),
    }), env, ctx);
    /* нэг хариу = 200k токен (`usage`) — төсвийн тооцоо `settleTokens` */
    const big = () => jsonRes({
      stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 200_000, output_tokens: 0 }, id: 'msg_big', model: 'x',
    });
    reset();
    const warns = [];
    console.warn = (...a) => { warns.push(a.join(' ')); };
    globalThis.fetch = route({ self: selfOf('kvless'), perms: rowOf('kvless'), upstream: big });
    const noKv = await fresh('kv-none');
    const env = { ...baseEnv(), DAILY_TOKEN_BUDGET: '300000' };
    delete env.RL_KV;
    const r1 = await postTo(noKv, env);
    assert.equal(r1.status, 200, `KV-гүй 1-р хүсэлт → 200 биш (${r1.status})`);
    await r1.json();
    const r2 = await postTo(noKv, env);
    assert.equal(r2.status, 429, `KV-гүй: 200k зарцуулсны дараа ½ төсөв (150k) хэтэрсэн → 429 биш (${r2.status})`);
    assert.equal((await r2.json()).code, 'daily_budget');
    const kvWarns = warns.filter((w) => /RL_KV/.test(w));
    assert.equal(kvWarns.length, 1, `RL_KV анхааруулга isolate бүрд НЭГ удаа (${kvWarns.length})`);
    /* KV холбосон — бүтэн төсөв, анхааруулгагүй */
    warns.length = 0;
    const withKv = await fresh('kv-on');
    const envKv = { ...baseEnv(), DAILY_TOKEN_BUDGET: '300000' };
    const k1 = await postTo(withKv, envKv);
    assert.equal(k1.status, 200); await k1.json();
    const k2 = await postTo(withKv, envKv);
    assert.equal(k2.status, 200, `KV-тэй: 200k < 300k (хумихгүй) → 200 биш (${k2.status})`); await k2.json();
    const k3 = await postTo(withKv, envKv);
    assert.equal(k3.status, 429, `KV-тэй: 400k ≥ 300k → 429 биш (${k3.status})`);
    assert.equal(warns.filter((w) => /RL_KV/.test(w)).length, 0, 'KV холбосон бол анхааруулгагүй');
    console.warn = realWarn;
    console.log('✅ worker: RL_KV холбоогүй → нэг чанга анхааруулга, төсөв ½ (KV-тэй бол бүтэн), реле ажилласаар');
  }

  /* ── (ё) 2026-10-22 (аудит): `server.mjs`-ийн `hasPortalRow`/`checkArcGIS` ТОЛИН ХУУЛБАР ──
     `server.mjs` нь импортлоход сервер асааж (`listen`), `@anthropic-ai/sdk`-ийг (agent-proxy/node_modules — CI-д
     суулгадаггүй) шаарддаг тул ЭХ КОДООС `tokenHash … checkArcGIS` хэсгийг таслан хуурамч `fetch`-тэй (`route`)
     ажиллуулна. Урьд энэ хуулбар огт шалгагддаггүй байв (worker-ийнх л): мөргүй → 403, хүснэгт уншигдахгүй
     (сүлжээ · 200+error) → 503, нэрийн `'` зайлуулалт, ЗӨВХӨН амжилт токен тус бүрд кэшлэгдэнэ. */
  {
    const src = readFileSync(new URL('../agent-proxy/server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const a = src.indexOf('const tokenHash = ');
    const b = src.indexOf('async function checkArcGIS(token)');
    let end = -1;
    for (let i = src.indexOf('{', b), depth = 0; b > 0 && i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    assert.ok(a > 0 && b > a && end > b, 'server.mjs: `tokenHash … checkArcGIS` хэсэг олдсонгүй');
    const PORTAL = 'https://gis.selbecity.mn/geoportal';
    const PERMS_URL = 'https://gis.selbecity.mn/map/rest/services/Hosted/SYS_Selbe_Permissions/FeatureServer/230';
    const factory = vm.runInThisContext(
      `(function (fetch, createHash, ARCGIS_PORTAL, ARCGIS_PERMS_URL, ARCGIS_ORG_ID, VERIFIED_MAX) {\n${src.slice(a, end)}\nreturn { checkArcGIS, verified, tokenHash };\n})`,
      { filename: 'agent-proxy/server.mjs (checkArcGIS)' },
    );
    const load = (fetchImpl) => factory(fetchImpl, createHash, PORTAL, PERMS_URL, ORG, 500);

    /* мөргүй → 403, кэшлэхгүй (дахин шалгана) */
    reset();
    let S = load(route({ self: selfOf('ganbat'), perms: async () => ({ features: [] }) }));
    let r = await S.checkArcGIS('tok-norow');
    assert.equal(r.ok, false); assert.equal(r.status, 403, `server: мөргүй → 403 биш (${r.status})`);
    assert.match(r.reason, /бүртгэлгүй/);
    await S.checkArcGIS('tok-norow');
    assert.equal(calls.perms, 2, 'server: татгалзсан нь кэшлэгдэхгүй — дахин шалгана');
    assert.equal(S.verified.size, 0);
    /* устгагдсан мөр (`views: 'removed'`) → 403 */
    S = load(route({ self: selfOf('gone'), perms: rowOf('gone', 'removed') }));
    r = await S.checkArcGIS('tok-tomb');
    assert.equal(r.status, 403, `server: устгагдсан мөр → 403 биш (${r.status})`);
    /* хүснэгт уншигдахгүй: сүлжээ → 503; ArcGIS 200 + error → 503; кэшлэхгүй */
    S = load(route({ self: selfOf('bat2'), perms: async () => new Error('сүлжээ') }));
    r = await S.checkArcGIS('tok-err');
    assert.equal(r.status, 503, `server: сүлжээ → 503 биш (${r.status})`);
    assert.match(r.reason, /түр хүлээгээд/);
    assert.equal(S.verified.size, 0);
    S = load(route({ self: selfOf('bat3'), perms: async () => ({ error: { code: 403, message: 'no access' } }) }));
    r = await S.checkArcGIS('tok-err2');
    assert.equal(r.status, 503, `server: ArcGIS 200+error → 503 биш (${r.status})`);
    /* нэрийн `'` зайлуулалт — жижиг үсэгтэй ба том үсэгтэй нэр; worker-тэй ИЖИЛ where */
    for (const name of ["o'brien", "O'Brien"]) {
      reset();
      S = load(route({ self: selfOf(name), perms: rowOf(name.toLowerCase()) }));
      r = await S.checkArcGIS(`tok-q-${name}`);
      assert.equal(r.ok, true, `server: ${name} → ok`);
      const serverWhere = calls.lastWhere;
      assert.equal(serverWhere, name === name.toLowerCase()
        ? "username = 'o''brien'"
        : "username = 'o''brien' OR username = 'O''Brien'", `server: «${name}»-ийн where`);
      reset();
      globalThis.fetch = route({ self: selfOf(name), perms: rowOf(name.toLowerCase()) });
      const wr = await post(baseEnv(), { Origin: ORIGIN, 'x-arcgis-token': `tok-wq-${name}` });
      assert.equal(wr.status, 200);
      assert.equal(calls.lastWhere, serverWhere, `worker ба server-ийн where зөрөв («${name}»)`);
    }
    /* ЗӨВХӨН амжилт кэшлэгдэнэ, токен ТУС БҮРД (түлхүүр нь токены хэш) */
    reset();
    S = load(route({ self: selfOf('dorj'), perms: rowOf('dorj') }));
    r = await S.checkArcGIS('tok-a');
    assert.equal(r.ok, true); assert.equal(r.username, 'dorj');
    await S.checkArcGIS('tok-a');
    assert.equal(calls.self, 1, 'server: баталгаажсан токен кэшлэгдэнэ (community/self дахин асуугдахгүй)');
    assert.equal(calls.perms, 1, 'server: эрхийн хүснэгт дахин асуугдахгүй');
    await S.checkArcGIS('tok-b');
    assert.equal(calls.self, 2, 'server: ӨӨР токен тусдаа шалгагдана');
    assert.equal(S.verified.size, 2);
    assert.ok(S.verified.has(S.tokenHash('tok-a')) && !S.verified.has('tok-a'), 'server: кэшийн түлхүүр — токены SHA-256 хэш (түүхий токен биш)');
    console.log('✅ server.mjs: мөргүй/устгагдсан → 403 · хүснэгт уншигдахгүй → 503 · `\'` зайлуулалт (worker-тэй ижил) · зөвхөн амжилт токен тус бүрд кэшлэгдэнэ');
  }
} finally {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
}
