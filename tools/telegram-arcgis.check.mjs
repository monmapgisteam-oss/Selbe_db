/**
 * TELEGRAM БОТЫН ArcGIS УНШИЛТЫН ТОКЕН — тохиргоо · үүсгэлт/шинэчлэлт · `query.ts`-ийн замд залгалт (⚠️ 2026-10-22, аудит).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/telegram-arcgis.check.mjs
 *
 * ⚠️ ЯАГААД: бот Node-д `authToken()` ҮРГЭЛЖ `null` тул Organization-only бүх эх сурвалж «Token Required» авч, хэрэглэгч
 *    «түр хүлээгээд дахин оролдоно уу» гэсэн ХУДАЛ мессеж хардаг байв. Энд:
 *      1. env → горим (`none` · `static` · `password`), нууц нь статусын текстэд ОРОХГҮЙ;
 *      2. нэр/нууц үг → `generateToken` (POST биеэр), 200-аар ирсэн алдаа, татгалзлын дараа порталыг давтан цохихгүй;
 *      3. `registerIdentity` → `query.arcgisPost` токеныг POST биед залгана (ботын `../src/lib/authToken.ts` ба
 *         `@/lib/authToken` НЭГ модуль), хугацаа дуусахаас өмнө ба 498-д шинэчилнэ, тогтмол токен татгалзахад тэмдэглэнэ;
 *      4. хэрэглэгчийн текст — тохируулаагүй ≠ татгалзсан ≠ бусад алдаа;
 *      5. ботын эх кодын гэрээ (регистр нь агентын цөмөөс ӨМНӨ, тохируулаагүй бол AI-г дуудахгүй).
 *    АМЬД СҮЛЖЭЭ РҮҮ ЮУ Ч ЯВАХГҮЙ — `fetch` бүрэн хуурамч.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOT_TOKEN_MISSING_TEXT, BOT_TOKEN_REJECTED_TEXT, botAuthConfig, botAuthErrorText, createBotCredential, isTokenFailure,
} from './telegram-arcgis.mjs';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

/* ── 1. Тохиргоо ── */
eq(botAuthConfig({}).mode, 'none', 'хоосон → none');
eq(botAuthConfig({ ARCGIS_BOT_TOKEN: ' t0 ' }), { mode: 'static', token: 't0', minutes: 120 }, 'тогтмол токен (trim)');
eq(botAuthConfig({ ARCGIS_BOT_USERNAME: 'bot', ARCGIS_BOT_PASSWORD: 'pw', ARCGIS_BOT_TOKEN: 't0', ARCGIS_BOT_TOKEN_MINUTES: '60' }),
  { mode: 'password', username: 'bot', password: 'pw', minutes: 60 }, 'нэр/нууц үг давамгайлна');
eq(botAuthConfig({ ARCGIS_BOT_USERNAME: 'bot', ARCGIS_BOT_PASSWORD: '' }).mode, 'none', 'нууц үггүй нэр → none');
eq(botAuthConfig({ ARCGIS_BOT_USERNAME: 'b', ARCGIS_BOT_PASSWORD: 'p', ARCGIS_BOT_TOKEN_MINUTES: '1' }).minutes, 120, 'хэт бага хугацаа → 120');
console.log('✅ тохиргоо: none · static · password (давамгайлна) · хугацааны хязгаар');

/* ── 2. generateToken — POST бие, 200-аар ирсэн алдаа, давтан цохихгүй ── */
const PORTAL = 'https://portal.example/geoportal/';
{
  let t = 1_000_000;
  const now = () => t;
  const calls = [];
  let answer = { token: 'T1', expires: t + 3_600_000 };
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: String(init.body) });
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const c = createBotCredential({ mode: 'password', username: 'bot', password: 's3cret!', minutes: 120 }, { portalUrl: PORTAL, fetchImpl, now });
  eq(c.sharing, 'https://portal.example/geoportal/sharing', 'sharing хаяг');
  const cred = c.findCredential();
  ok(cred && cred.expires === 1, 'эхэндээ хугацаа нь өнгөрсөн (1) — эхний хүсэлт токен үүсгэнэ');
  await c.init();
  eq(cred.token, 'T1', 'токен авав');
  eq(calls[0].url, 'https://portal.example/geoportal/sharing/rest/generateToken', 'порталын generateToken');
  const body = new URLSearchParams(calls[0].body);
  eq([body.get('username'), body.get('password'), body.get('client'), body.get('expiration'), body.get('f')],
    ['bot', 's3cret!', 'requestip', '120', 'json'], 'нууц нь POST БИЕЭР');
  ok(!calls[0].url.includes('s3cret') && !JSON.stringify(c.status()).includes('s3cret') && !JSON.stringify(c.status()).includes('T1'),
    'нууц/токен URL ба статуст алга');
  /* 200 + {error} — татгалзал, 10 мин дахин цохихгүй */
  answer = { error: { code: 400, message: 'Unable to generate token.', details: ['Invalid username or password.'] } };
  await assert.rejects(() => cred.refreshToken(), (e) => e.name === 'BotTokenError' && e.details?.httpStatus === 400 && /Invalid username/.test(e.message));
  ok(c.rejectedSince(t), 'татгалзал тэмдэглэгдэв');
  const n = calls.length;
  t += 5 * 60_000;
  await assert.rejects(() => cred.refreshToken(), /татгалзав/);
  eq(calls.length, n, 'буруу нууц үгээр 10 мин дотор порталыг дахин цохихгүй');
  t += 6 * 60_000;
  answer = { token: 'T2', expires: t + 3_600_000 };
  await cred.refreshToken();
  eq(cred.token, 'T2', 'хүлээлтийн дараа дахин авав');
  checks += 1;
  /* сүлжээний уналт — «network» ангилал (сешн дууссан БИШ) */
  const cNet = createBotCredential({ mode: 'password', username: 'b', password: 'p', minutes: 120 },
    { portalUrl: PORTAL, fetchImpl: async () => { throw new TypeError('fetch failed'); }, now });
  await assert.rejects(() => cNet.init(), (e) => /Network request failed/.test(e.message) && e.kind === 'network');
  ok(!cNet.rejectedSince(0), 'сүлжээний уналт татгалзал биш');
}
console.log('✅ generateToken: POST биеэр · 200-ийн {error} · 10 мин давтахгүй · сүлжээ ≠ татгалзал · нууц логгүй');

/* ── 3. query.ts-ийн замд — ботын модуль ба `@/lib/authToken` НЭГ инстанц ── */
{
  const A = await import('../src/lib/authToken.ts');
  const Q = await import('@/lib/query');
  const { AUTH } = await import('@/lib/services');
  const portal = AUTH.portalUrl.replace(/\/+$/, '');
  const target = `${portal}/sharing/rest/portals/self`;
  let gen = 0;
  const seen = [];
  /* серверийн хуурамч — 1-р токеныг нэг удаа 498-аар татгалзана */
  const reject = new Set();
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const p = new URLSearchParams(String(init?.body ?? ''));
    if (url.endsWith('/sharing/rest/generateToken')) {
      gen += 1;
      return new Response(JSON.stringify({ token: `G${gen}`, expires: Date.now() + 3_600_000 }), { status: 200 });
    }
    seen.push({ url, token: p.get('token') });
    if (reject.has(p.get('token'))) return new Response(JSON.stringify({ error: { code: 498, message: 'Invalid token.' } }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const c = createBotCredential({ mode: 'password', username: 'b', password: 'p', minutes: 120 }, { portalUrl: portal });
  A.registerIdentity(c, c.sharing);
  await Q.arcgisPost(target, {});
  eq(seen.at(-1), { url: target, token: 'G1' }, 'эхний хүсэлтийн өмнө токен үүсгэж POST биед залгав (НЭГ модуль)');
  eq(new URL(seen.at(-1).url).search, '', 'токен URL-д ОРООГҮЙ');
  reject.add('G1');
  await Q.arcgisPost(target, {});
  eq(seen.slice(-2).map((x) => x.token), ['G1', 'G2'], '498 → шинэчилж НЭГ удаа дахин (G2)');
  eq(gen, 2, 'generateToken 2 удаа');

  /* тогтмол токен татгалзвал — тэмдэглэж, ArcGISError (токены алдаа) */
  const s = createBotCredential({ mode: 'static', token: 'S1', minutes: 120 }, { portalUrl: portal });
  A.registerIdentity(s, s.sharing);
  reject.add('S1');
  const t0 = Date.now();
  let err = null;
  try { await Q.arcgisPost(target, {}); } catch (e) { err = e; }
  ok(err && isTokenFailure(err), `тогтмол токен татгалзав → токены алдаа (${err?.message})`);
  ok(s.rejectedSince(t0), 'тогтмол токены татгалзал тэмдэглэгдэв (бот хариунд шалтгаан нэмнэ)');
  eq(botAuthErrorText(err, 'static'), BOT_TOKEN_REJECTED_TEXT, 'тохируулсан ч татгалзсан → ил шалтгаан');
}
console.log('✅ query.ts замд: POST биеэр залгав · 498 → шинэчилж дахин · тогтмол токены татгалзал тэмдэглэгдэв');

/* ── 4. Хэрэглэгчийн текст ── */
eq(botAuthErrorText({ name: 'ArcGISError', code: 499, message: 'Token Required' }, 'none'), BOT_TOKEN_MISSING_TEXT, 'тохируулаагүй → MISSING');
eq(botAuthErrorText({ name: 'ArcGISError', code: 400, message: 'Invalid URL' }, 'none'), null, 'токены биш алдаа → null (ерөнхий текст)');
ok(!/түр хүлээгээд/.test(BOT_TOKEN_MISSING_TEXT) && /түр саатал БИШ/.test(BOT_TOKEN_MISSING_TEXT), 'MISSING нь түр саатал гэж хэлэхгүй');

/* ── 5. Ботын эх кодын гэрээ ── */
{
  const bot = readFileSync(new URL('./telegram-bot.mjs', import.meta.url), 'utf8');
  const reg = bot.indexOf('registerIdentity(arcgisAuth, arcgisAuth.sharing)');
  ok(reg > 0 && reg < bot.indexOf("await import('../src/lib/agent/client.ts')"), 'итгэмжлэл агентын цөмөөс ӨМНӨ бүртгэгдэнэ');
  ok(bot.includes("if (BOT_AUTH.mode === 'none') {\r\n    await reply(chatId, BOT_TOKEN_MISSING_TEXT);") || bot.includes("if (BOT_AUTH.mode === 'none') {\n    await reply(chatId, BOT_TOKEN_MISSING_TEXT);"),
    'тохируулаагүй бол AI-г дуудахгүй, ил текст');
  ok(bot.includes('const tok = botAuthErrorText(e, BOT_AUTH.mode);'), 'userErrorText токены алдааг ялгана');
  ok(bot.includes('arcgisAuth.rejectedSince(t0)'), 'асуултын явцад татгалзвал хариунд шалтгаан');
  ok(!/ARCGIS_BOT_PASSWORD[^\n]*console\.|console\.[^\n]*BOT_AUTH\.(password|token)/.test(bot), 'нууц логлогдохгүй');
}
console.log('✅ ботын гэрээ: бүртгэл цөмөөс өмнө · тохируулаагүй бол ил текст · асуултын явцын татгалзал');

console.log(`\ntelegram-arcgis: ok — ${checks} шалгалт`);
