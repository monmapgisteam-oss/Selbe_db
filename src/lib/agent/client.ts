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

import { AGENT_TOOLS, describeCall, runTool } from './tools';
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

export async function relayFetch(path: string, init: RequestInit): Promise<Response> {
  if (!AGENT_APIS.length) throw new Error(tr('AI үйлчилгээний хаяг тохируулагдаагүй байна.'));
  const n = Math.max(AGENT_APIS.length, 1);
  let lastErr: unknown;
  for (let k = 0; k < n; k++) {
    const i = (active + k) % n;
    const last = k === n - 1;
    const ac = new AbortController();
    const stop = () => ac.abort(init.signal?.reason);
    if (init.signal?.aborted) stop();
    else init.signal?.addEventListener('abort', stop, { once: true });
    const tm = setTimeout(() => ac.abort(new DOMException(`timeout ${RELAY_TIMEOUT_MS}ms`, 'TimeoutError')), RELAY_TIMEOUT_MS);
    try {
      const res = await fetch(`${AGENT_APIS[i] ?? ''}${path}`, { ...init, signal: ac.signal });
      if (!last && FAILOVER_STATUS.has(res.status)) continue;
      active = i;
      return res;
    } catch (e) {
      if (init.signal?.aborted) throw e;
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
export async function arcgisToken(): Promise<string | null> {
  if (!AUTH.appId) return null;
  try {
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
  retryable?: boolean;
};

async function callRelay(
  body: { system: string; messages: ApiMessage[]; tools: typeof AGENT_TOOLS },
  signal?: AbortSignal,
): Promise<RelayReply> {
  const token = await arcgisToken();
  const res = await relayFetch('/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // ⚠️ Токенгүй үед толгойг ОГТ нэмэхгүй — хоосон утга илгээвэл локал реле
      //    (нэвтрэлт шалгадаггүй) рүү илүү preflight толгой явна.
      ...(token ? { 'x-arcgis-token': token } : {}),
      // ⚠️ Browser-гүй үйлчлүүлэгч (бот) ArcGIS токенгүй тул нууц түлхүүрээр
      //    батална. Browser build-д `BOT_SECRET` нь `undefined` — толгой алга.
      ...(BOT_SECRET ? { 'x-bot-secret': BOT_SECRET } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  const reply = (await res.json().catch(() => ({}))) as RelayReply;
  if (!res.ok) {
    throw new Error(
      reply.error ??
        (res.status === 401
          ? tr('AI үйлчилгээний түлхүүр буруу байна.')
          : tr('Реле алдаа (HTTP {0})', res.status)),
    );
  }
  return reply;
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
    const ac = new AbortController();
    const stop = () => ac.abort();
    const tm = setTimeout(stop, HEALTH_TIMEOUT_MS);
    signal?.addEventListener('abort', stop, { once: true });
    try {
      const res = await fetch(`${AGENT_APIS[i]}/health`, { signal: ac.signal });
      if (res.ok) {
        active = i;
        return true;
      }
    } catch {
      // Дараагийн хост
    } finally {
      clearTimeout(tm);
      signal?.removeEventListener('abort', stop);
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
}): Promise<AskResult> {
  const { question, history, scope, onProgress, signal } = opts;

  // ⚠️ Заавар нь бүртгэлээс ЯГ ОДОО тооцоологдоно — өмнөх хариултын хуучирсан
  //    хуулбар хэзээ ч хэрэглэгдэхгүй.
  const system = buildSystemPrompt(scope);

  history.push({ role: 'user', content: question });
  onProgress?.(tr('Бодож байна…'));

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const reply = await callRelay({ system, messages: history, tools: AGENT_TOOLS }, signal);

    if (reply.stop_reason === 'refusal') {
      const msg = reply.note ?? tr('Энэ хүсэлтэд хариулах боломжгүй байна.');
      history.push({ role: 'assistant', content: [{ type: 'text', text: msg }] });
      return { text: msg, turns: turn };
    }

    const blocks = reply.content ?? [];
    // ⚠️ Блокуудыг ЯГ ИРСЭН ХЭВЭЭР нь буцааж хийнэ (бодолтын блок орсон байж
    //    болзошгүй) — засвал дараагийн хүсэлт татгалзагдана.
    history.push({ role: 'assistant', content: blocks });

    const calls = blocks.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    if (!calls.length) {
      const text = textOf(blocks);
      return { text: text || tr('Хариулт хоосон ирлээ.'), turns: turn };
    }

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
          content: out.text,
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
