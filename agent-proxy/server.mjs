/**
 * Сэлбэ AI туслах — LLM РЕЛЕ (proxy).
 *
 * ⚠️ ЯАГААД ТУСДАА ҮЙЛЧИЛГЭЭ ВЭ: портал нь `output: 'export'` (бүрэн статик) бөгөөд
 * GitHub Pages дээр байрладаг — тэнд сервер тал ОГТ ажиллахгүй тул Next-ийн route
 * handler бичих боломжгүй. Мөн API түлхүүр browser-т ХЭЗЭЭ Ч гарч болохгүй.
 * Тиймээс энэ реле тусдаа процесс, тусдаа `package.json`-той: `npm ci`/`npm run build`
 * үүнийг огт хөндөхгүй тул одоогийн deploy эвдрэхгүй.
 *
 * ⚠️ ЭНЭ ФАЙЛ АГЕНТЫН ЛОГИКГҮЙ. Хэрэгсэл гүйцэтгэх, давхаргын бүртгэл унших,
 * эрх шалгах бүхэн browser талд (`src/lib/agent/*`) явна — учир нь тэнд `LAYERS`,
 * `VIEWS`, `query.ts` нь порталтай ЯГ ижил кодоор ажиллана. Ингэснээр давхарга
 * нэмэгдэх/хасагдахад релег огт засахгүй (гол шаардлага №3).
 *
 * Ажиллуулах:  cd agent-proxy && npm install && npm start
 */

import { createServer } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.PORT || 8787);

/**
 * ⚠️ CORS — портал өөр эх (`localhost:8123`, `selbe.monmap.mn`)-ээс дуудна.
 * `ALLOW_ORIGIN`-д таслалаар тусгаарлан жагсаана. Анхдагч нь зөвхөн локал dev.
 */
const ALLOWED = (process.env.ALLOW_ORIGIN || 'http://localhost:8123,http://127.0.0.1:8123')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * ⚠️ ЗАГВАР БА ТОХИРГООГ СЕРВЕР ТАЛ ТОГТООНО — browser-оос ирсэн утгыг ХЭРЭГЛЭХГҮЙ.
 * Эс бөгөөс хэн ч энэ релег дуудаж дурын үнэтэй тохиргоогоор токен зарцуулна.
 *
 * ⚠️ АНХДАГЧ нь `claude-opus-5` — хамгийн зөв дүгнэлт гаргана. ТУРШИЛТЫН үед
 * зардал хэмнэхийг хүсвэл `AGENT_MODEL=claude-haiku-4-5` (≈5 дахин хямд).
 *
 * ⚠️ `effort: 'low'` — хариултын ХУРД гол шаардлага (№1). Агентын ажил нь «зөв
 * давхарга сонгож, тоог ArcGIS-д бодуулаад үг болгох» тул гүн бодох шаардлагагүй.
 * Чанар дутвал 'medium' болгоно.
 *
 * ⚠️ Claude Opus 5-д бодох (thinking) нь АНХНААСАА асаалттай бөгөөд `max_tokens`
 * нь бодолт + хариу ХОЁУЛАНГ хамарна — тиймээс хариултын уртаас хамаагүй өгөөмөр.
 */
const MODEL = process.env.AGENT_MODEL || 'claude-opus-5';
const MAX_TOKENS = 8000;
const EFFORT = process.env.AGENT_EFFORT || 'low';

/** Нэг хүсэлтэд зөвшөөрөх биеийн дээд хэмжээ — бүртгэл + яриа (2 МБ) */
const MAX_BODY = 2 * 1024 * 1024;

const client = new Anthropic();

const cors = (res, origin) => {
  if (origin && ALLOWED.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
};

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

/** Хүсэлтийн биеийг цуглуулна — хэмжээнээс хэтэрвэл тасална */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Хүсэлтийн бие хэт том'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  cors(res, origin);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Эрүүл мэндийн шалгалт — порталын UI реле асаалттай эсэхийг эндээс мэднэ
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    json(res, 200, { ok: true, model: MODEL, effort: EFFORT });
    return;
  }

  if (req.method !== 'POST' || !req.url?.startsWith('/chat')) {
    json(res, 404, { error: 'Ийм зам байхгүй' });
    return;
  }

  // ⚠️ Танихгүй эхээс ирсэн хүсэлтийг татгалзана: browser CORS-ыг тойрч
  //    curl-ээр дуудаж болох тул серверт ч шалгана.
  if (origin && !ALLOWED.includes(origin)) {
    json(res, 403, { error: 'Энэ эх сурвалжид зөвшөөрөл алга' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (e) {
    json(res, 400, { error: `Биеийг уншиж чадсангүй: ${e.message}` });
    return;
  }

  const { system, messages, tools } = payload ?? {};
  if (!Array.isArray(messages) || !messages.length) {
    json(res, 400, { error: '`messages` хоосон байна' });
    return;
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: EFFORT },
      // ⚠️ Системийн зааврыг КЭШЛЭНЭ. Тэр нь давхаргын бүртгэл (мянган токен)
      //    агуулдаг бөгөөд яриа бүрт давтагдана — кэшгүй бол удаан ба үнэтэй.
      system: system
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : undefined,
      tools,
      messages,
    });

    // ⚠️ Аюулгүйн ангилагч татгалзвал HTTP 200 боловч `content` хоосон/дутуу
    //    ирнэ — `content[0]`-ыг шууд уншвал эвдэрнэ.
    if (response.stop_reason === 'refusal') {
      json(res, 200, {
        stop_reason: 'refusal',
        content: [],
        note: 'Хүсэлтийг аюулгүй байдлын шалгуур татгалзлаа.',
      });
      return;
    }

    json(res, 200, {
      stop_reason: response.stop_reason,
      content: response.content,
      usage: response.usage,
    });
  } catch (err) {
    const msg = err?.message ?? 'Тодорхойгүй алдаа';
    console.error('[agent-proxy]', msg);

    // ⚠️ ИТГЭМЖЛЭЛИЙН алдааг ТУСГАЙЛАН барина — SDK-ийн англи техник мессежийг
    //    дамжуулбал хэрэглэгч юу хийхээ ойлгохгүй. Windows дээрх түгээмэл
    //    шалтгаан нь `$env:…`-ыг релеэс ӨӨР цонхонд тавьсан явдал.
    //
    // ⚠️ Урьдчилж `ANTHROPIC_API_KEY`-г шалгах ЁСГҮЙ: `ant auth login`-оор
    //    нэвтэрсэн бол орчны хувьсагч хоосон ч SDK диск дээрх профайлаас уншина.
    if (
      err instanceof Anthropic.AuthenticationError ||
      /could not resolve authentication|api key|authentication/i.test(msg)
    ) {
      json(res, 401, {
        error:
          'AI үйлчилгээний түлхүүр тохируулагдаагүй эсвэл буруу байна. ' +
          '`agent-proxy/.env.local` файлд `ANTHROPIC_API_KEY=…` бичээд `npm start` ажиллуулна уу.',
        retryable: false,
      });
      return;
    }

    const retryable =
      err instanceof Anthropic.RateLimitError ||
      err instanceof Anthropic.InternalServerError ||
      err instanceof Anthropic.APIConnectionError;
    json(res, err instanceof Anthropic.APIError ? (err.status ?? 502) : 500, { error: msg, retryable });
  }
});

server.listen(PORT, () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[agent-proxy] ⚠️ ANTHROPIC_API_KEY тохируулаагүй байна — хүсэлт бүр татгалзана.');
  }
  console.log(`[agent-proxy] http://localhost:${PORT}  загвар=${MODEL}  effort=${EFFORT}`);
  console.log(`[agent-proxy] зөвшөөрсөн эх: ${ALLOWED.join(', ')}`);
});
