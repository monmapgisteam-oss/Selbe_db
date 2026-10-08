'use client';

/**
 * АГЕНТЫН ГОГЦОО — browser талд ажиллана.
 *
 * ⚠️ ЯАГААД BROWSER-Т ВЭ (сервер талд биш): энд `LAYERS`, `VIEWS`, `query.ts`,
 * хэрэглэгчийн эрх бүгд порталтай ИЖИЛ кодоор ачаалагдана. Тиймээс давхарга
 * нэмэгдэх/хасагдахад агент тэр даруй мэднэ — синхрон алдагдах БОЛОМЖГҮЙ.
 * Сервер тал давхаргын хуулбар хөтөлбөл тэр хуулбар хоцроод агент байхгүй
 * зүйлийн тухай ярьж эхэлнэ. Реле нь зөвхөн API түлхүүр барина.
 *
 * ⚠️ Өгөгдөл ArcGIS-ээс ШУУД browser рүү ирнэ (өнөөдрийнхтэй адил) — реле рүү
 * дамжихгүй. Реле рүү зөвхөн асуулт, давхаргын тайлбар ба нэгтгэсэн үр дүн явна.
 */

import { AGENT_TOOLS, asToolData, describeCall, runTool } from './tools';
import { t as tr } from '@/lib/i18nCore';
import { buildSystemPrompt, type AgentScope } from './registry';
import { AUTH } from '@/lib/services';

/* ── Anthropic-ийн агуулгын блокууд (реле дамжуулдаг хэлбэр) ── */

export type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown };
export type TextBlock = { type: 'text'; text: string };
export type ContentBlock = TextBlock | ToolUseBlock | { type: string; [k: string]: unknown };
export type ApiMessage = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

/**
 * ⚠️ Хамгийн олон эргэлт. Агент нэг асуултад давхарга шалгаад (1) асууж (2),
 * дараа нь нарийвчлах (3-4) хэрэгтэй болдог. 6-аас цааш явбал ихэвчлэн
 * төөрсөн гэсэн үг — хязгааргүй гогцоо болохоос сэргийлнэ.
 */
const MAX_TURNS = 6;

/**
 * Реле сервер — env-ээр солино, эс бөгөөс локал dev.
 *
 * ⚠️ `.trim()` ЗААВАЛ: GitHub-ийн Variable-д хаягийг хуулж буулгахад ард нь
 * ХАРАГДАХГҮЙ мөр таслалт (`\r\n`) үлддэг. Тэрийг арилгахгүй бол хүсэлт
 * `…workers.dev⏎/chat` рүү явж, URL хүчингүй болж AI чимээгүйхэн ажиллахаа
 * болино. (Бодитоор тохиолдсон: 2026.08.13, амьд багцаас илрүүлсэн.)
 */
/* ⚠️ 2026-09-17: fallback (localhost) ХАСАГДАВ — хаяг зөвхөн env-ээс (Variables `AGENT_API` / `.env`).
   Хоосон бол `relayAlive()` false → AI товч идэвхгүй, бусад хэсэг хэвийн. */
/* ⚠️ 2026-10-06: дээрх «товч идэвхгүй» нь урьд ХЭРЭГЖЭЭГҮЙ байв — одоо хаяг хоосон бол
   `AgentButton` огт зурагдахгүй, `alive === false` үед `AgentChat` оролт/илгээхийг хаана. */
/* ⚠️ 2026-09-28: НӨӨЦ ХОСТ — `AGENT_API` таслалаар хэд хэдэн хаяг авна
   (`https://pc1….ts.net,https://pc2….ts.net`). Tailscale Funnel нь машин бүрд ТУСДАА
   хаяг өгдөг бөгөөд хооронд нь өөрөө шилжүүлдэггүй тул нэг хост унтарвал
   дараагийнх руу үйлчлүүлэгч тал шилжинэ (`relayFetch`, `relayAlive`). */
export const AGENT_APIS: readonly string[] = (process.env.NEXT_PUBLIC_AGENT_API ?? '')
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);
/** Дэлгэц/логт харуулах — бүх хаяг */
export const AGENT_API = AGENT_APIS.join(', ');

/** Сүүлд амжилттай хариулсан хостын индекс — дараагийн хүсэлт эндээс эхэлнэ */
let active = 0;

/**
 * Хост «унтарсан» гэж үзэх хариу: тунель/прокси хост руу хүрч чадаагүй (502/504,
 * Cloudflare 530), эсвэл реле Claude Code-оос гарсан (503).
 * ⚠️ 429 (хурдны хязгаар) ОРОХГҮЙ — өөр хост руу шилжвэл хэрэглэгч бүрийн
 *    хязгаар хост тоогоор үржинэ.
 */
const FAILOVER_STATUS = new Set([502, 503, 504, 530]);

/** `/health` шалгалтын дээд хүлээлт — унтарсан хост хариугүй унжиж болно */
const HEALTH_TIMEOUT_MS = 8_000;

/**
 * Реле рүү хүсэлт — хост унтарсан бол жагсаалтын дараагийнх руу шилжинэ.
 *
 * ⚠️ Хэрэглэгч цуцалсан (`signal.aborted`) бол ШИЛЖИХГҮЙ, шууд шидэнэ.
 * ⚠️ Сүүлийн хостын хариуг статусаас үл хамааран буцаана — алдааны мессежийг
 *    дуудагч өөрөө задална.
 * ⚠️ ХАЯГГҮЙ бол ЭНД зогсоно. Урьд нь хоосон жагсаалт нь `fetch('/chat')` болж
 *    ХАРЬЦАНГУЙ хаяг руу (статик сайт өөрөө) явж, 404/405-ын JSON биш хариуг
 *    «AI алдаа» гэж задалдаг байв — шалтгаан нь тохиргоо гэдэг нь харагдахгүй.
 *    `relayAlive()` товчийг аль хэдийн хаадаг тул энэ нь зөвхөн гүн хамгаалалт
 *    (`askExecSummary` зэрэг товчгүй зам).
 */
/**
 * ⚠️ 2026-09-30: реле хүсэлтийн ДЭЭД хугацаа. Релегийн Claude Code timeout нь 180с
 *    (`claudeCode.mjs` `CLAUDE_TIMEOUT_MS`) тул түүнээс УРТ — эс бөгөөс хууль ёсны
 *    удаан хариуг клиент өөрөө таслана. Хэрэглэгчийн `init.signal`-тай нэгтгэнэ.
 */
const RELAY_TIMEOUT_MS = 240_000;

/**
 * ⚠️ 2026-10-06 (аудит): НӨӨЦ ХОСТ руу ШИЛЖИХЭЭС ӨМНӨХ БОГИНО ШАЛГАЛТ. Урьд нь унжсан
 *    (хариугүй) хост дээр `RELAY_TIMEOUT_MS` (240с) бүтэн хүлээгээд л дараагийнх руу
 *    шилждэг байв — хоёр хосттой үед хэрэглэгч 4 минут «Бодож байна…» хардаг. `/chat` нь
 *    хариугаа бүрэн бэлдсэний ДАРАА л толгойгоо илгээдэг тул түүнд богино timeout тавих
 *    БОЛОМЖГҮЙ (хууль ёсны удаан хариу тасарна). Тиймээс олон хосттой үед хүсэлтийн
 *    ӨМНӨ `/health`-ийг `HEALTH_TIMEOUT_MS`-ээр шалгаж, хариугүй бол шууд дараагийнх руу;
 *    сүүлд амьд гэж батлагдсан хост (`HEALTH_FRESH_MS` дотор) шалгалтгүй явна.
 *    Жинхэнэ хариуны хүлээлт урт хэвээр (240с).
 */
const HEALTH_FRESH_MS = 60_000;
const aliveAt = new Map<string, number>();

/** Нэг хостын `/health` — `HEALTH_TIMEOUT_MS`-ээр хязгаарлагдсан; амьд бол `aliveAt` тэмдэглэнэ */
async function probeHealth(base: string, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false;
  const ac = new AbortController();
  const stop = () => ac.abort();
  const tm = setTimeout(stop, HEALTH_TIMEOUT_MS);
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const res = await fetch(`${base}/health`, { signal: ac.signal });
    if (res.ok) aliveAt.set(base, Date.now());
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(tm);
    signal?.removeEventListener('abort', stop);
  }
}

/**
 * СИСТЕМИЙН ЗААВРЫН ГАРЫН ҮСЭГ (⚠️ 2026-10-09, аудит №1) — реле дээр `PROMPT_HMAC` тохируулсан
 * үед ИЖИЛ утгыг энд өгнө: бот/Node — `AGENT_PROMPT_HMAC` (`BOT_SECRET`-ийн адил browser-т
 * `undefined`), browser build — `NEXT_PUBLIC_AGENT_PROMPT_HMAC` (GitHub Variable).
 * ⚠️ Browser-ийн утга JS багцад ИЛ — энэ нь хамгаалалтын хил БИШ, санамсаргүй curl/скриптээр
 *    релег ерөнхий LLM прокси болгохыг хүндрүүлэх саад л (`agent-proxy/README.md`).
 *    Бодит хязгаар нь релейн өдрийн токены төсөв.
 * ⚠️ Хоосон бол толгой нэмэгдэхгүй — зан огт өөрчлөгдөхгүй.
 */
const PROMPT_KEY = process.env.AGENT_PROMPT_HMAC || process.env.NEXT_PUBLIC_AGENT_PROMPT_HMAC || '';

/** `system`-ийн HMAC-SHA256 (hex) — реле (`server.mjs` `promptSig`, `worker.mjs` `hmacHex`)-тэй ИЖИЛ */
async function promptSig(system: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(PROMPT_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(system));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * `/chat`-ийн биед `x-prompt-sig` толгой нэмнэ (`PROMPT_KEY` байвал л). `relayFetch`-д
 * байгаа тул бүх дуудагч (агентын гогцоо, `execReport.askExecSummary`) хамрагдана.
 * ⚠️ Бие нь мөр (JSON) байх ёстой; задлагдахгүй бол толгойгүй явна — реле 403-аар хэлнэ.
 */
async function withPromptSig(path: string, init: RequestInit): Promise<RequestInit> {
  if (!PROMPT_KEY || !path.startsWith('/chat') || typeof init.body !== 'string') return init;
  try {
    const parsed = JSON.parse(init.body) as { system?: unknown };
    const system = typeof parsed.system === 'string' ? parsed.system : '';
    const headers = new Headers(init.headers);
    headers.set('x-prompt-sig', await promptSig(system));
    return { ...init, headers };
  } catch {
    return init;
  }
}

export async function relayFetch(path: string, rawInit: RequestInit): Promise<Response> {
  if (!AGENT_APIS.length) throw new Error(tr('AI үйлчилгээний хаяг тохируулагдаагүй байна.'));
  const init = await withPromptSig(path, rawInit);
  const n = Math.max(AGENT_APIS.length, 1);
  let lastErr: unknown;
  for (let k = 0; k < n; k++) {
    const i = (active + k) % n;
    const last = k === n - 1;
    const base = AGENT_APIS[i] ?? '';
    /* ⚠️ 2026-10-06: шилжих боломжтой (сүүлийнх биш) хостыг эхлээд богино шалгана (дээрх ⚠️) */
    if (!last && Date.now() - (aliveAt.get(base) ?? 0) > HEALTH_FRESH_MS) {
      const ok = await probeHealth(base, init.signal ?? undefined);
      if (init.signal?.aborted) throw init.signal.reason ?? new DOMException('aborted', 'AbortError');
      if (!ok) { lastErr = new Error(`relay ${base} /health`); continue; }
    }
    const ac = new AbortController();
    const stop = () => ac.abort(init.signal?.reason);
    if (init.signal?.aborted) stop();
    else init.signal?.addEventListener('abort', stop, { once: true });
    const tm = setTimeout(() => ac.abort(new DOMException(`timeout ${RELAY_TIMEOUT_MS}ms`, 'TimeoutError')), RELAY_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}${path}`, { ...init, signal: ac.signal });
      if (!last && FAILOVER_STATUS.has(res.status)) { aliveAt.delete(base); continue; }
      active = i;
      aliveAt.set(base, Date.now());
      return res;
    } catch (e) {
      if (init.signal?.aborted) throw e;
      aliveAt.delete(base);
      lastErr = e;
    } finally {
      clearTimeout(tm);
      init.signal?.removeEventListener('abort', stop);
    }
  }
  throw lastErr;
}

/**
 * Browser-ГҮЙ үйлчлүүлэгчийн (Telegram бот) реле-баталгаа.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ: байршуулсан реле (worker) нь `ARCGIS_ORG_ID`-тай үед
 * хүсэлт бүрд ArcGIS хэрэглэгчийн токен ШААРДАНА. Telegram бот нь ArcGIS
 * хэрэглэгч БИШ тул токен байхгүй — токен шаарддаг реле рүү очвол бүх хүсэлт
 * 401 болно. Тиймээс бот өөрийн нууц түлхүүрээр (реле дээрх `BOT_SECRET`-тэй
 * ижил) батална. Ботын хандалтыг ботын ӨӨРИЙН цагаан жагсаалт барина.
 *
 * ⚠️ BROWSER-Т АЮУЛГҮЙ: `NEXT_PUBLIC_` угтваргүй тул статик build-д `undefined`
 * болж, толгой нэмэгдэхгүй — порталын зан төлөв огт өөрчлөгдөхгүй. Утга нь
 * ЗӨВХӨН Node процесс (бот)-ын `process.env`-ээс гарна.
 */
const BOT_SECRET = process.env.AGENT_BOT_SECRET;

/**
 * Нэвтэрсэн хэрэглэгчийн ArcGIS токен — реле үүгээр хэн болохыг батална.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ: реле нь нийтэд нээлттэй хаяг дээр байрлах тул зөвхөн
 * CORS-д найдаж болохгүй (curl түүнийг тоохгүй). Токенгүй бол хаягийг олсон
 * хэн ч байгууллагын AI эрхээр токен зарцуулна.
 *
 * ⚠️ `getCredential` БИШ `findCredential` — эхнийх нь токен байхгүй үед
 * нэвтрэлтийн хуудас руу ЧИГЛҮҮЛНЭ. Хэрэглэгч асуулт бичиж байхад гэнэт хуудас
 * солигдвол бичсэн зүйл нь алдагдана. `findCredential` нь зөвхөн ОДОО байгааг
 * буцаадаг тул хажуугийн үр дагаваргүй.
 *
 * ⚠️ Нэвтрэлт унтраалттай (`AUTH.appId` хоосон) эсвэл локал реле үед энэ нь
 * `null` буцаана — тэр тохиолдолд реле ч токен шаардахгүй.
 */
/* ⚠️ 2026-09-17: экспортлогдсон — «Удирдлагын тайлан»-гийн AI дүгнэлт
   (`execReport.askExecSummary`) хэрэгсэлгүй ГАНЦ хүсэлтээр реле рүү явдаг
   тул `ask()`-ийн гогцоог хэрэглэхгүй, харин ижил нэвтрэлтийн толгой хэрэгтэй. */
export async function arcgisToken(force = false): Promise<string | null> {
  if (!AUTH.appId) return null;
  try {
    /* ⚠️ 2026-10-06 (аудит): дамжуулахаас ӨМНӨ токеныг ШИНЭЧИЛЖ уншина — таб нуугдах/компьютер
       унтахад JS API-ийн цаг хэмжигч хоцорч `findCredential().token` ХУГАЦАА ДУУССАН токен
       буцаадаг (`authToken.ensureFreshToken`-ийн ⚠️). Урьд нь реле 401 буцааж асуулт унадаг байв.
       Шинэчлэлт унавал чимээгүй — реле өөрөө татгалзаж, доорх 401-ийн давталт нэг удаа (`force`) оролдоно.
       Динамик импорт — `authToken` → `query`-г бот/Node-ийн замд (`AUTH.appId` хоосон тул энд
       хүрэхгүй ч) статикаар чирэхгүй. */
    const { ensureFreshToken } = await import('@/lib/authToken');
    await ensureFreshToken(force);
    const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
    const url = `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing`;
    return esriId.findCredential(url)?.token ?? null;
  } catch {
    // Нэвтрээгүй байх нь ХЭВИЙН — реле нь ойлгомжтой мессежээр татгалзана
    return null;
  }
}

export type AskResult = { text: string; turns: number };

type RelayReply = {
  stop_reason?: string;
  content?: ContentBlock[];
  note?: string;
  error?: string;
  /** ⚠️ 2026-10-09: `'daily_budget'` — өдрийн токены төсөв дууссан (релейн 429) */
  code?: string;
  retryable?: boolean;
};

async function callRelay(
  body: { system: string; messages: ApiMessage[]; tools: typeof AGENT_TOOLS },
  signal?: AbortSignal,
  botUser?: string,
): Promise<RelayReply> {
  const json = JSON.stringify(body);
  const post = (token: string | null) => relayFetch('/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // ⚠️ Токенгүй үед толгойг ОГТ нэмэхгүй — хоосон утга илгээвэл локал реле
      //    (нэвтрэлт шалгадаггүй) рүү илүү preflight толгой явна.
      ...(token ? { 'x-arcgis-token': token } : {}),
      // ⚠️ Browser-гүй үйлчлүүлэгч (бот) ArcGIS токенгүй тул нууц түлхүүрээр
      //    батална. Browser build-д `BOT_SECRET` нь `undefined` — толгой алга.
      ...(BOT_SECRET ? { 'x-bot-secret': BOT_SECRET } : {}),
      /* ⚠️ 2026-10-09: ботын Telegram хэрэглэгчийн ID — реле `bot:<id>`-аар хурдны хязгаар, зэрэг
         хүсэлт, өдрийн төсвийг хэрэглэгч тус бүрд тоолно (`agent-proxy/rateLimit.mjs` `botCaller`).
         ЗӨВХӨН бот (`BOT_SECRET`) — browser-т хэзээ ч нэмэгдэхгүй (CORS-д ч зөвшөөрөгдөөгүй). */
      ...(BOT_SECRET && botUser && /^\d{1,20}$/.test(botUser) ? { 'x-bot-user': botUser } : {}),
    },
    body: json,
    signal,
  });
  const token = await arcgisToken();
  let res = await post(token);
  /* ⚠️ 2026-10-06 (аудит): реле 401 — токен хуучирсан байж болно: ХҮЧЭЭР шинэчилж, токен
     СОЛИГДСОН бол НЭГ удаа дахин илгээнэ (`query.ts`-ийн 498-ийн давталттай ижил зарчим).
     Токен өөрчлөгдөөгүй бол давтах нь утгагүй — доорх алдаа хэвээр. */
  if (res.status === 401 && token && !signal?.aborted) {
    const fresh = await arcgisToken(true);
    if (fresh && fresh !== token) res = await post(fresh);
  }
  /* ⚠️ 2026-10-06: JSON биш хариу `null` болно (урьд нь `{}`) — 200 атал уншигдахгүй бол
     хоосон хариу мэт түүхэд `{content: []}` орж дараагийн хүсэлт 400 болдог байв. */
  const reply = (await res.json().catch(() => null)) as RelayReply | null;
  if (!res.ok) {
    /* ⚠️ 2026-10-06: релейн `error` (хатуу монгол, серверийн) зөвхөн ДЭЛГЭРЭНГҮЙ — гол
       мөр нь статусаас `tr()`-ээр (`RelayError`). Урьд нь `reply.error ?? …` байсан тул
       реле ямагт `error` буцаадаг учраас орчуулга хэзээ ч ажилладаггүй байв. */
    throw new RelayError(res.status, reply?.error, reply?.code);
  }
  if (!reply || typeof reply !== 'object') throw new RelayError(res.status, tr('Уншигдахгүй хариу'));
  return reply;
}

/**
 * Реле HTTP алдаа — `message` нь хэрэглэгчид ойлгомжтой (`tr()`), `detail` нь
 * серверийн түүхий мөр (зөвхөн дэлгэрэнгүйд).
 * ⚠️ 2026-10-06: параметрийн шинж (`constructor(readonly …)`) ХЭРЭГЛЭХГҮЙ — тестүүд
 *    `.ts`-ийг Node-ийн төрөл хасагчаар ажиллуулдаг, тэр нь үүнийг дэмждэггүй.
 */
export class RelayError extends Error {
  status: number;
  detail?: string;
  code?: string;
  constructor(status: number, detail?: string, code?: string) {
    super(relayStatusText(status, code));
    this.name = 'RelayError';
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

function relayStatusText(status: number, code?: string): string {
  /* ⚠️ 2026-10-09: өдрийн төсөв — «завгүй, дахин оролдоно уу» гэвэл хэрэглэгч дахин дахин
     оролдож дэмий хүлээнэ; маргааш хүртэл нээгдэхгүйг ил хэлнэ. */
  if (status === 429 && code === 'daily_budget') {
    return tr('Өнөөдрийн AI хэрэглээний хязгаар дууслаа — маргааш дахин оролдоно уу.');
  }
  /* ⚠️ 2026-10-09: дуудагчийн ЗЭРЭГ хүсэлтийн таг (реле `LIMITS.concurrent`) — өөр таб/цонхонд асуулт явж байна */
  if (status === 429 && code === 'concurrent') {
    return tr('Өөр цонхонд асуусан асуултын хариу хүлээгдэж байна — дуусахыг хүлээгээд дахин оролдоно уу.');
  }
  if (status === 401) return tr('AI туслахын нэвтрэлт баталгаажсангүй — хуудсыг дахин ачаалж нэвтэрнэ үү.');
  if (status === 403) return tr('AI туслах руу хандах зөвшөөрөл алга.');
  if (status === 413) return tr('Яриа хэт урт боллоо — ⟲ дарж шинээр эхлүүлнэ үү.');
  if (status === 429) return tr('AI туслах завгүй байна — хэсэг хүлээгээд дахин оролдоно уу.');
  if (status === 504) return tr('AI туслах хугацаандаа хариу өгсөнгүй — дахин оролдоно уу.');
  if (FAILOVER_STATUS.has(status)) return tr('AI туслах түр ажиллахгүй байна, дараа дахин оролдоно уу.');
  return tr('Реле алдаа (HTTP {0})', status);
}

/**
 * Агентын алдааг дэлгэцийн мөр болгоно: `text` — `tr()`-ээр, `detail` — техникийн мөр.
 * ⚠️ 2026-10-06: урьд нь түүхий «Failed to fetch», «timeout 240000ms»,
 *    серверийн хатуу монгол текст шууд гардаг байв (англи горимд ч).
 */
export function agentErrorText(e: unknown): { text: string; detail?: string } {
  if (e instanceof RelayError) return { text: e.message, ...(e.detail ? { detail: e.detail } : {}) };
  const name = (e as { name?: string } | null)?.name ?? '';
  const raw = e instanceof Error ? e.message : String(e ?? '');
  if (name === 'TimeoutError') {
    return { text: tr('AI туслах хугацаандаа хариу өгсөнгүй — дахин оролдоно уу.'), detail: raw };
  }
  if (name === 'AbortError') return { text: tr('Хүсэлт цуцлагдлаа.') };
  /* `fetch`-ийн сүлжээний алдаа (CORS, DNS, тунель унтарсан) нь ямагт TypeError */
  if (e instanceof TypeError) {
    return { text: tr('AI туслахтай холбогдож чадсангүй — сүлжээгээ шалгаад дахин оролдоно уу.'), detail: raw };
  }
  /* Манай өөрийн `tr()`-тэй алдаа (хаяг тохируулаагүй г.м.) — хэвээр */
  return { text: raw || tr('Тодорхойгүй алдаа') };
}

/**
 * Реле асаалттай эсэх — UI үүнээс хамааран товчоо идэвхгүй болгоно.
 *
 * ⚠️ Жагсаалтын ЭХНИЙ хостоос эхэлнэ — үндсэн хост буцаж асвал түүн рүү эргэнэ.
 *    Амьд хостыг `active` болгож, дараагийн `/chat` шууд тийш явна.
 */
export async function relayAlive(signal?: AbortSignal): Promise<boolean> {
  for (let i = 0; i < AGENT_APIS.length; i++) {
    if (signal?.aborted) return false;
    /* ⚠️ 2026-10-06: `probeHealth` — `relayFetch`-ийн урьдчилсан шалгалттай НЭГ биелэлт */
    if (await probeHealth(AGENT_APIS[i], signal)) {
      active = i;
      return true;
    }
  }
  return false;
}

const textOf = (blocks: ContentBlock[]): string =>
  blocks
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

/**
 * Нэг асуултыг бүрэн хариултанд хүргэнэ.
 *
 * @param history Өмнөх ярианы мессежүүд — АГЕНТ өөрөө нэмнэ, дуудагч хадгална.
 * @param onProgress Хэрэгсэл дуудагдах бүрд явцын мөр (хэрэглэгч юу болж байгааг харна).
 */
export async function ask(opts: {
  question: string;
  history: ApiMessage[];
  scope: AgentScope;
  onProgress?: (label: string) => void;
  signal?: AbortSignal;
  /** ⚠️ 2026-10-09: зөвхөн Telegram бот — `x-bot-user` толгой (`callRelay`-ийн ⚠️) */
  botUser?: string;
}): Promise<AskResult> {
  const { question, history, scope, onProgress, signal, botUser } = opts;

  // ⚠️ Заавар нь бүртгэлээс ЯГ ОДОО тооцоологдоно — өмнөх хариултын хуучирсан
  //    хуулбар хэзээ ч хэрэглэгдэхгүй.
  const system = buildSystemPrompt(scope);

  history.push({ role: 'user', content: question });
  onProgress?.(tr('Бодож байна…'));

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const reply = await callRelay({ system, messages: history, tools: AGENT_TOOLS }, signal, botUser);

    if (reply.stop_reason === 'refusal') {
      const msg = reply.note ?? tr('Энэ хүсэлтэд хариулах боломжгүй байна.');
      history.push({ role: 'assistant', content: [{ type: 'text', text: msg }] });
      return { text: msg, turns: turn };
    }

    const blocks = Array.isArray(reply.content) ? reply.content : [];
    const calls = blocks.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    const text = textOf(blocks);

    /* ⚠️ 2026-10-06: `max_tokens` — хариу ТАСАРСАН. Урьд нь бүтэн мэт харагддаг байв.
       Тасарсан tool_use-ийн оролт дутуу байж болох тул ГҮЙЦЭТГЭХГҮЙ; түүхэд зөвхөн
       текстийг (tool_result-гүй tool_use үлдвэл дараагийн хүсэлт 400) хийнэ. */
    if (reply.stop_reason === 'max_tokens') {
      const note = tr('⚠️ Хариу тасарсан (хэт урт болсон) — асуултаа хувааж эсвэл товчлон асууна уу.');
      const msg = text ? `${text}\n\n${note}` : note;
      history.push({ role: 'assistant', content: [{ type: 'text', text: msg }] });
      return { text: msg, turns: turn };
    }

    if (!calls.length && !text) {
      /* ⚠️ 2026-10-06: ХООСОН assistant агуулгыг түүхэд ХЭЗЭЭ Ч хийхгүй — `{content: []}`
         нь дараагийн бүх хүсэлтийг 400 болгодог байв. Татгалзлын адил текстээр орлуулна. */
      const msg = tr('Хариулт хоосон ирлээ.');
      history.push({ role: 'assistant', content: [{ type: 'text', text: msg }] });
      return { text: msg, turns: turn };
    }

    // ⚠️ Блокуудыг ЯГ ИРСЭН ХЭВЭЭР нь буцааж хийнэ (бодолтын блок орсон байж
    //    болзошгүй) — засвал дараагийн хүсэлт татгалзагдана.
    history.push({ role: 'assistant', content: blocks });

    if (!calls.length) return { text, turns: turn };

    onProgress?.(describeCall(calls[0].name, calls[0].input));

    /* ⚠️ 2026-09-29 (аудит 10): `signal` хэрэгслийн гүйцэтгэлд дамждаггүй — ✕/Esc/⟲ зөвхөн
       релегийн fetch-ийг таслаад хэрэгслүүд (~10 с) үргэлжилж, `busy` тогтож байв.
       Гүйцэтгэлийн өмнө ба дараа таслалтыг шалгаж AbortError шидэнэ. */
    const aborted = () => { if (signal?.aborted) throw new DOMException('aborted', 'AbortError'); };
    aborted();
    // Зэрэг дуудлагуудыг ЗЭРЭГ гүйцэтгэнэ — `query.ts` өөрөө 6-аар хязгаарлана
    const results = await Promise.all(
      calls.map(async (c) => {
        const out = await runTool(c.name, c.input, scope);
        return {
          type: 'tool_result' as const,
          tool_use_id: c.id,
          /* ⚠️ 2026-10-09 (аудит №6): «ӨГӨГДӨЛ — заавар биш» хашилт (`tools.ts`-ийн ⚠️) */
          content: asToolData(out.text),
          ...(out.isError ? { is_error: true } : {}),
        };
      }),
    );
    aborted();

    // ⚠️ БҮХ үр дүн НЭГ мессежид орно. Салгавал загвар зэрэгцээ дуудлага
    //    хийхээ болино.
    history.push({ role: 'user', content: results as unknown as ContentBlock[] });
    onProgress?.(tr('Хариултыг бэлдэж байна…'));
  }

  const msg = tr('Хариулт {0} алхамд гарсангүй. Асуултаа илүү тодорхой болгож үзнэ үү.', MAX_TURNS);
  history.push({ role: 'assistant', content: [{ type: 'text', text: msg }] });
  return { text: msg, turns: MAX_TURNS };
}
