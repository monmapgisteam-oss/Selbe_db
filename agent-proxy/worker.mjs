/**
 * Сэлбэ AI туслах — LLM РЕЛЕ, Cloudflare Worker хувилбар.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ: портал `output: 'export'` буюу бүрэн статик тул GitHub
 * Pages дээр сервер тал ОГТ ажиллахгүй. Anthropic-ийн түлхүүрийг статик build-д
 * шингээвэл JS багцаас хэн ч уншина. Тиймээс түлхүүр ЗӨВХӨН энд, Cloudflare-ийн
 * нууц хадгалалтад байна — хэрэглэгч юу ч бичихгүй.
 *
 * ⚠️ `server.mjs`-ийн ТОЛИН ХУВИЛБАР (локал хөгжүүлэлтэд тэрийг хэвээр
 * ашиглана). Загвар, effort, кэшлэлт, алдааны мессеж ижил байх ёстой —
 * аль нэгийг өөрчилвөл НӨГӨӨГ нь хамт засна.
 *
 * ⚠️ ЭНЭ ФАЙЛ АГЕНТЫН ЛОГИКГҮЙ. Хэрэгсэл гүйцэтгэх, давхаргын бүртгэл унших,
 * эрх шалгах бүхэн browser талд (`src/lib/agent/*`) явна. Ингэснээр давхарга
 * нэмэгдэх/хасагдахад релег огт засахгүй (гол шаардлага №3).
 *
 * ⚠️ SDK-гүй, зөвхөн `fetch` — Worker дээр багц угсрах алхам нэмэхгүйн тулд.
 *
 * Байршуулах:
 *   cd agent-proxy
 *   npx wrangler secret put ANTHROPIC_API_KEY     # нэг удаа
 *   npx wrangler deploy
 */

const API = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

const DEFAULTS = {
  MODEL: 'claude-opus-5',
  EFFORT: 'low',
  /** ⚠️ Opus 5-д бодолт анхнаасаа асаалттай ба `max_tokens` нь бодолт + хариу ХОЁУЛАНГ хамарна */
  MAX_TOKENS: 8000,
  PORTAL: 'https://www.arcgis.com',
};

/** Нэг хүсэлтэд зөвшөөрөх биеийн дээд хэмжээ — бүртгэл + яриа (2 МБ) */
const MAX_BODY = 2 * 1024 * 1024;

/**
 * Шалгагдсан ArcGIS токены КЭШ.
 *
 * ⚠️ Токен бүрийг ArcGIS руу дахин шалгуулбал асуулт бүрд нэмэлт 200–400мс
 * саатна (гол шаардлага №1 — хурд). Worker-ийн isolate богино настай тул энэ нь
 * зөвхөн ойрын хүсэлтүүдийг хурдасгах бөгөөд эрх хураахад 5 минутын дотор
 * хүчинтэй байдал дуусна.
 */
const TOKEN_TTL = 5 * 60 * 1000;
const verified = new Map();

const json = (code, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status: code,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });

/** Зөвшөөрсөн эхийн жагсаалт — таслалаар */
const allowedOrigins = (env) =>
  (env.ALLOW_ORIGIN || 'http://localhost:8123,http://127.0.0.1:8123')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function corsHeaders(origin, env) {
  const h = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    // ⚠️ `x-arcgis-token` — эс бөгөөс browser preflight-д унана
    'Access-Control-Allow-Headers': 'Content-Type, x-arcgis-token',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && allowedOrigins(env).includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

/**
 * ArcGIS токеныг ПОРТАЛААС шалгана.
 *
 * ⚠️ Токеныг зөвхөн «хоосон биш» гэж үзэж болохгүй — хүчинтэй эсэхийг ArcGIS
 * өөрөөр нь баталгаажуулж, шаардвал байгууллагын харьяаллыг нь шалгана.
 * Эс бөгөөс релег хэн ч дурын мөр илгээж ашиглана.
 *
 * @returns {Promise<{ok: true, username: string} | {ok: false, reason: string}>}
 */
async function checkArcGIS(token, env) {
  if (!token) return { ok: false, reason: 'Нэвтрэлтийн мэдээлэл алга' };

  const hit = verified.get(token);
  if (hit && hit.until > Date.now()) return { ok: true, username: hit.username };

  const portal = (env.ARCGIS_PORTAL || DEFAULTS.PORTAL).replace(/\/+$/, '');
  let data;
  try {
    const res = await fetch(`${portal}/sharing/rest/community/self?f=json&token=${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
    data = await res.json();
  } catch {
    return { ok: false, reason: 'Нэвтрэлт шалгах үйлчилгээ хариу өгсөнгүй' };
  }

  // ⚠️ ArcGIS буруу токенд ч HTTP 200 буцаадаг — биед нь `error` ирнэ
  if (!data || data.error || !data.username) {
    return { ok: false, reason: 'Нэвтрэлтийн хугацаа дууссан эсвэл хүчингүй байна' };
  }

  const wantOrg = env.ARCGIS_ORG_ID?.trim();
  if (wantOrg && data.orgId !== wantOrg) {
    return { ok: false, reason: 'Танай байгууллагад энэ үйлчилгээ нээгдээгүй байна' };
  }

  verified.set(token, { username: data.username, until: Date.now() + TOKEN_TTL });
  return { ok: true, username: data.username };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const MODEL = env.AGENT_MODEL || DEFAULTS.MODEL;
    const EFFORT = env.AGENT_EFFORT || DEFAULTS.EFFORT;
    const withEffort = Boolean(EFFORT) && !/haiku/i.test(MODEL);

    // Эрүүл мэндийн шалгалт — порталын UI реле асаалттай эсэхийг эндээс мэднэ
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json(200, { ok: true, model: MODEL, effort: EFFORT }, cors);
    }

    if (request.method !== 'POST' || !url.pathname.startsWith('/chat')) {
      return json(404, { error: 'Ийм зам байхгүй' }, cors);
    }

    // ⚠️ Танихгүй эхээс ирсэн хүсэлтийг татгалзана: browser CORS-ыг тойрч
    //    curl-ээр дуудаж болох тул серверт ч шалгана.
    if (origin && !allowedOrigins(env).includes(origin)) {
      return json(403, { error: 'Энэ эх сурвалжид зөвшөөрөл алга' }, cors);
    }

    /*
     * ⚠️ BROWSER-ГҮЙ ҮЙЛЧЛҮҮЛЭГЧ (Telegram бот). Бот нь ArcGIS хэрэглэгч БИШ тул
     * `x-arcgis-token` байхгүй — оронд нь `BOT_SECRET` тохируулсан бол
     * `x-bot-secret` толгойгоор батална. Тохирвол ArcGIS шалгалтыг алгасна.
     * Ботын хэн ашиглах эрхийг ботын ӨӨРИЙН цагаан жагсаалт (`tools/telegram-bot.mjs`)
     * барина. `BOT_SECRET` тохируулаагүй бол зан төлөв огт өөрчлөгдөхгүй.
     */
    const isBot = env.BOT_SECRET && request.headers.get('x-bot-secret') === env.BOT_SECRET;

    /*
     * ⚠️ ArcGIS НЭВТРЭЛТ. `ARCGIS_ORG_ID` тохируулсан үед л шаардана — ингэснээр
     * локал хөгжүүлэлт (`server.mjs`, тохиргоогүй) хэвээр ажиллана.
     */
    if (env.ARCGIS_ORG_ID && !isBot) {
      const auth = await checkArcGIS(request.headers.get('x-arcgis-token'), env);
      if (!auth.ok) return json(401, { error: auth.reason, retryable: false }, cors);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json(500, {
        error: 'AI үйлчилгээний түлхүүр тохируулагдаагүй байна. Системийн администраторт хандана уу.',
        retryable: false,
      }, cors);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY) return json(413, { error: 'Хүсэлтийн бие хэт том' }, cors);

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return json(400, { error: `Биеийг уншиж чадсангүй: ${e.message}` }, cors);
    }

    const { system, messages, tools } = payload ?? {};
    if (!Array.isArray(messages) || !messages.length) {
      return json(400, { error: '`messages` хоосон байна' }, cors);
    }

    let res;
    let body;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': VERSION,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: DEFAULTS.MAX_TOKENS,
          // ⚠️ Загвар, effort-ыг СЕРВЕР ТАЛ тогтооно — browser-оос ирсэн утгыг
          //    хэрэглэвэл хэн ч дурын үнэтэй тохиргоогоор токен зарцуулна.
          //
          // ⚠️ Haiku ЭНЭ ПАРАМЕТРИЙГ ДЭМЖДЭГГҮЙ — илгээвэл бүх хүсэлт
          //    «This model does not support the effort parameter» гэж унана.
          //    Тиймээс дэмждэггүй загвар дээр ба `AGENT_EFFORT` хоосон үед ОГТ
          //    илгээхгүй. (Батлагдсан: claude-haiku-4-5, 2026.08.13)
          ...(withEffort ? { output_config: { effort: EFFORT } } : {}),
          // ⚠️ Системийн зааврыг КЭШЛЭНЭ. Тэр нь давхаргын бүртгэл (мянган токен)
          //    агуулдаг бөгөөд яриа бүрт давтагдана — кэшгүй бол удаан ба үнэтэй.
          system: system
            ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
            : undefined,
          tools,
          messages,
        }),
      });
      body = await res.json();
    } catch (e) {
      return json(502, { error: `AI үйлчилгээтэй холбогдож чадсангүй: ${e.message}`, retryable: true }, cors);
    }

    if (!res.ok) {
      const msg = body?.error?.message ?? `AI үйлчилгээний алдаа (HTTP ${res.status})`;
      const authErr = res.status === 401 || res.status === 403;
      return json(res.status, {
        error: authErr
          ? 'AI үйлчилгээний түлхүүр буруу эсвэл хүчингүй байна. Системийн администраторт хандана уу.'
          : msg,
        // 429 (хэт олон хүсэлт) ба 5xx — дахин оролдоход утгатай
        retryable: res.status === 429 || res.status >= 500,
      }, cors);
    }

    // ⚠️ Аюулгүйн ангилагч татгалзвал HTTP 200 боловч `content` хоосон/дутуу
    //    ирнэ — `content[0]`-ыг шууд уншвал эвдэрнэ.
    if (body.stop_reason === 'refusal') {
      return json(200, {
        stop_reason: 'refusal',
        content: [],
        note: 'Хүсэлтийг аюулгүй байдлын шалгуур татгалзлаа.',
      }, cors);
    }

    return json(200, {
      stop_reason: body.stop_reason,
      content: body.content,
      usage: body.usage,
    }, cors);
  },
};
