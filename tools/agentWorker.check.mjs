/**
 * AI релейн Cloudflare Worker хувилбар (`agent-proxy/worker.mjs`) — `export default.fetch`-ийг
 * хуурамч `env` (KV stub) ба хуурамч `fetch`-ээр дуудаж шалгана (2026-10-09, аудит №6).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/agentWorker.check.mjs
 *
 * ⚠️ Урьд `worker.mjs` нэг ч шалгуургүй байв — `server.mjs`-ийн толин хувилбар гэдэг ч гар аргаар
 *    л тааруулдаг. Энд гурван хаалт: (а) буруу Origin → 403; (б) `x-bot-secret` буруу (ArcGIS
 *    токенгүй) → 401; (в) дээд үйлчилгээ (Anthropic) 401 → 502 `upstream_auth`.
 * ⚠️ `worker.mjs` нь `fetch`-ийг ГЛОБАЛААС дууддаг (Worker орчинд өөр зам байхгүй) — тестэд
 *    `globalThis.fetch`-ийг түр сольж, дууссаны дараа буцаана. Refactor хэрэггүй.
 * ⚠️ Worker-ийн минутын тоолуур модулийн түвшинд — нэг процесст цөөн хүсэлт тул хүрэхгүй.
 */
import assert from 'node:assert/strict';
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
const baseEnv = () => ({
  ALLOW_ORIGIN: `${ORIGIN},http://localhost:8123`,
  ANTHROPIC_API_KEY: 'sk-test',
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

const realFetch = globalThis.fetch;
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
    const env = { ...baseEnv(), BOT_SECRET: 'correct-secret', ARCGIS_ORG_ID: 'org123' };
    const res = await post(env, { 'x-bot-secret': 'wrong-secret', 'x-bot-user': '42' });
    assert.equal(res.status, 401, `буруу x-bot-secret → 401 биш (${res.status})`);
    const j = await res.json();
    assert.equal(j.retryable, false);
    assert.equal(j.code, undefined, 'ArcGIS нэвтрэлтийн 401-д `code` байх ёсгүй (клиент токеноо шинэчилнэ)');
    assert.equal(upstreamCalls, 0, 'токенгүй хүсэлт ArcGIS/Anthropic руу явах ёсгүй');
    console.log('✅ worker: x-bot-secret буруу → 401, дээд үйлчилгээ дуудагдахгүй');
  }

  /* ── (в) дээд үйлчилгээ 401 → 502 `upstream_auth` (ArcGIS шалгалтгүй орчин — ORG_ID алга) ── */
  {
    globalThis.fetch = async (url, init) => {
      upstreamCalls++;
      assert.match(String(url), /api\.anthropic\.com\/v1\/messages/);
      assert.equal(init.headers['x-api-key'], 'sk-test');
      return new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    };
    const env = baseEnv();
    const res = await post(env, { Origin: ORIGIN });
    assert.equal(res.status, 502, `дээд үйлчилгээний 401 → 502 биш (${res.status})`);
    const j = await res.json();
    assert.equal(j.code, 'upstream_auth');
    assert.equal(j.retryable, false);
    assert.equal(j.error, 'Туслахын серверийн тохиргооны алдаа');
    assert.ok(!/x-api-key|invalid/i.test(j.error), 'Anthropic-ийн түүхий мессеж клиентэд очих ёсгүй');
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.equal(upstreamCalls, 1);
    console.log('✅ worker: Anthropic 401 → 502 upstream_auth (түүхий мессежгүй)');
  }

  /* ── нэмэлт: амжилттай хариу шууд дамжина (толин хэлбэр `{stop_reason, content, usage}`) ── */
  {
    globalThis.fetch = async () => new Response(JSON.stringify({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Сайн байна уу' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      id: 'msg_1', model: 'x',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const env = baseEnv();
    const res = await post(env, { Origin: ORIGIN });
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.deepEqual(Object.keys(j).sort(), ['content', 'stop_reason', 'usage']);
    assert.equal(j.content[0].text, 'Сайн байна уу');
    console.log('✅ worker: амжилттай хариу `{stop_reason, content, usage}`-аар');
  }
} finally {
  globalThis.fetch = realFetch;
}
