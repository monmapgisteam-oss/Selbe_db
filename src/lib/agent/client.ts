'use client';

/**
 * АГЕНТЫН ГОГЦОО — browser талд ажиллана.
 */

import { AGENT_TOOLS, asToolData, describeCall, runTool } from './tools';
import { t as tr } from '@/lib/i18nCore';
import { buildSystemPrompt, type AgentScope } from './registry';
import { AUTH } from '@/lib/services';

/* ── Anthropic-ийн агуулгын блокууд (реле дамжуулдаг хэлбэр) ── */

export type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown };
export type TextBlock = { type: 'text'; text: string };
export type ThinkingBlock = { type: 'thinking'; thinking: string; signature?: string };
export type ContentBlock = TextBlock | ToolUseBlock | { type: string; [k: string]: unknown };
export type ApiMessage = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

const MAX_TURNS = 6;

const QUESTION_TIMEOUT_MS = 360_000;

/**
 * Реле сервер — env-ээр солино, эс бөгөөс локал dev.
 */
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
 */
const FAILOVER_STATUS = new Set([502, 503, 504, 530]);

/** `/health` шалгалтын дээд хүлээлт — унтарсан хост хариугүй унжиж болно */
const HEALTH_TIMEOUT_MS = 8_000;

/**
 * Реле рүү хүсэлт — хост унтарсан бол жагсаалтын дараагийнх руу шилжинэ.
 */
const RELAY_TIMEOUT_MS = 240_000;

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
 * СИСТЕМИЙН ЗААВРЫН ГАРЫН ҮСЭГ (2026-10-09, аудит №1) — реле дээр `PROMPT_HMAC` тохируулсан
 * үед ИЖИЛ утгыг энд өгнө: бот/Node — `AGENT_PROMPT_HMAC` (`BOT_SECRET`-ийн адил browser-т
 * `undefined`), browser build — `NEXT_PUBLIC_AGENT_PROMPT_HMAC` (GitHub Variable).
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

/** `/chat`-ийн 5xx хариуг өөр хост руу давтаж болох уу — дээрх `relayFetch` 2026-10-19 */
async function relayMayRetry(res: Response): Promise<boolean> {
  const b = (await res.clone().json().catch(() => null)) as { error?: unknown; retryable?: unknown; upstream?: unknown; code?: unknown } | null;
  /* Манай релейн хариу биш (тунелийн HTML/хоосон, эсвэл өөр бүтэцтэй JSON) — релей хүрээгүй */
  if (!b || typeof b !== 'object' || (!('error' in b) && !('retryable' in b))) return true;
  if (b.code === 'upstream_auth') return true;
  return b.upstream !== true;
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
      if (!last && FAILOVER_STATUS.has(res.status) && (!path.startsWith('/chat') || await relayMayRetry(res))) {
        aliveAt.delete(base);
        continue;
      }
      active = i;
      aliveAt.set(base, Date.now());
      return res;
    } catch (e) {
      if (init.signal?.aborted) throw e;
      aliveAt.delete(base);
      const reason: unknown = ac.signal.reason;
      if (path.startsWith('/chat') && reason instanceof DOMException && reason.name === 'TimeoutError') throw reason;
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
 */
const BOT_SECRET = process.env.AGENT_BOT_SECRET;

/**
 * Нэвтэрсэн хэрэглэгчийн ArcGIS токен — реле үүгээр хэн болохыг батална.
 */
export async function arcgisToken(force = false): Promise<string | null> {
  if (!AUTH.appId) return null;
  try {
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
      ...(token ? { 'x-arcgis-token': token } : {}),
      ...(BOT_SECRET ? { 'x-bot-secret': BOT_SECRET } : {}),
      ...(BOT_SECRET && botUser && /^\d{1,20}$/.test(botUser) ? { 'x-bot-user': botUser } : {}),
    },
    body: json,
    signal,
  });
  const token = await arcgisToken();
  let res = await post(token);
  let reply = (await res.json().catch(() => null)) as RelayReply | null;
  if (res.status === 401 && !reply?.code && token && !signal?.aborted) {
    const fresh = await arcgisToken(true);
    if (fresh && fresh !== token) {
      res = await post(fresh);
      reply = (await res.json().catch(() => null)) as RelayReply | null;
    }
  }
  if (!res.ok) {
    throw new RelayError(res.status, reply?.error, reply?.code);
  }
  if (!reply || typeof reply !== 'object') throw new RelayError(res.status, tr('Уншигдахгүй хариу'));
  return reply;
}

/**
 * Реле HTTP алдаа — `message` нь хэрэглэгчид ойлгомжтой (`tr`), `detail` нь
 * серверийн түүхий мөр (зөвхөн дэлгэрэнгүйд).
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
  if (status === 429 && code === 'daily_budget') {
    return tr('Өнөөдрийн AI хэрэглээний хязгаар дууслаа — маргааш дахин оролдоно уу.');
  }
  if (status === 429 && code === 'concurrent') {
    return tr('Өөр цонхонд асуусан асуултын хариу хүлээгдэж байна — дуусахыг хүлээгээд дахин оролдоно уу.');
  }
  if (code === 'upstream_auth') {
    return tr('AI туслахын серверийн тохиргоонд алдаа гарлаа — системийн администраторт хандана уу.');
  }
  if (status === 401) return tr('AI туслахын нэвтрэлт баталгаажсангүй — хуудсыг дахин ачаалж нэвтэрнэ үү.');
  if (status === 403) return tr('AI туслах руу хандах зөвшөөрөл алга.');
  if (status === 413) return tr('Яриа хэт урт боллоо — ⟲ дарж шинээр эхлүүлнэ үү.');
  if (status === 429) return tr('AI туслах завгүй байна — хэсэг хүлээгээд дахин оролдоно уу.');
  if (status === 504) return tr('AI туслах хугацаандаа хариу өгсөнгүй — дахин оролдоно уу.');
  if (status === 529) return tr('AI үйлчилгээ одоогоор хэт ачаалалтай байна — хэдэн минутын дараа дахин оролдоно уу.');
  if (FAILOVER_STATUS.has(status)) return tr('AI туслах түр ажиллахгүй байна, дараа дахин оролдоно уу.');
  return tr('Реле алдаа (HTTP {0})', status);
}

/**
 * Агентын алдааг дэлгэцийн мөр болгоно: `text` — `tr`-ээр, `detail` — техникийн мөр.
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
 */
export async function relayAlive(signal?: AbortSignal): Promise<boolean> {
  for (let i = 0; i < AGENT_APIS.length; i++) {
    if (signal?.aborted) return false;
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
 * ТӨЛӨВЛӨГӨӨНИЙ ТЕКСТ — хэрэгсэл дуудаж буй эргэлтийн блокуудаас (2026-10-19).
 */
export function planTextOf(blocks: readonly ContentBlock[]): string {
  const text = textOf(blocks as ContentBlock[]);
  if (text) return text;
  for (const b of blocks) {
    if (b.type !== 'thinking') continue;
    const raw = typeof (b as ThinkingBlock).thinking === 'string' ? (b as ThinkingBlock).thinking : '';
    const m = raw.match(/```plan[^\n]*\n[\s\S]*?```/);
    if (m) return m[0];
  }
  return '';
}

/**
 * ТҮҮХИЙН БОДОЛТЫН БЛОКИЙГ ХАСНА (in-place) — түүхийг ЭХНЭЭС нь огтолсны ДАРАА дуудна (2026-10-19).
 */
export function stripThinking(history: ApiMessage[]): void {
  for (const m of history) {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    const kept = m.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking');
    if (kept.length === m.content.length) continue;
    m.content = kept.length ? kept : [{ type: 'text', text: '…' }];
  }
}

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
  onPlan?: (text: string) => void;
  /**
   * Хэрэгслийн нэг багц гүйцэтгэгдэж дуусахад.
   */
  onStep?: () => void;
  signal?: AbortSignal;
  botUser?: string;
}): Promise<AskResult> {
  const ac = new AbortController();
  const onUser = () => ac.abort(opts.signal?.reason ?? new DOMException('aborted', 'AbortError'));
  if (opts.signal?.aborted) onUser();
  else opts.signal?.addEventListener('abort', onUser, { once: true });
  const tm = setTimeout(
    () => ac.abort(new DOMException(`timeout ${QUESTION_TIMEOUT_MS}ms`, 'TimeoutError')),
    QUESTION_TIMEOUT_MS,
  );
  try {
    return await askLoop({ ...opts, signal: ac.signal });
  } catch (e) {
    /* Хугацааны таслалт — доод давхаргын (fetch/ArcGIS) алдааны хэлбэрээс үл хамааран ЦЭВЭР `TimeoutError` */
    if (ac.signal.aborted && !opts.signal?.aborted) throw ac.signal.reason;
    throw e;
  } finally {
    clearTimeout(tm);
    opts.signal?.removeEventListener('abort', onUser);
  }
}

async function askLoop(opts: Parameters<typeof ask>[0]): Promise<AskResult> {
  const { question, history, scope, onProgress, onPlan, onStep, signal, botUser } = opts;

  const system = buildSystemPrompt(scope);

  history.push({ role: 'user', content: question });
  onProgress?.(tr('Бодож байна…'));
  /** Төлөвлөгөөг НЭГ удаа дамжуулна (дээрх `onPlan`) */
  let planned = false;

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

    if (reply.stop_reason === 'max_tokens') {
      const note = tr('⚠️ Хариу тасарсан (хэт урт болсон) — асуултаа хувааж эсвэл товчлон асууна уу.');
      const msg = text ? `${text}\n\n${note}` : note;
      history.push({ role: 'assistant', content: [{ type: 'text', text: msg }] });
      return { text: msg, turns: turn };
    }

    if (!calls.length && !text) {
      const msg = tr('Хариулт хоосон ирлээ.');
      history.push({ role: 'assistant', content: [{ type: 'text', text: msg }] });
      return { text: msg, turns: turn };
    }

    history.push({ role: 'assistant', content: blocks });

    if (!calls.length) return { text, turns: turn };

    if (!planned) {
      planned = true;
      const planText = planTextOf(blocks);
      if (planText) onPlan?.(planText);
    }

    onProgress?.(describeCall(calls[0].name, calls[0].input));

    const aborted = () => { if (signal?.aborted) throw new DOMException('aborted', 'AbortError'); };
    aborted();
    // Зэрэг дуудлагуудыг ЗЭРЭГ гүйцэтгэнэ — `query.ts` өөрөө 6-аар хязгаарлана
    const results = await Promise.all(
      calls.map(async (c) => {
        const out = await runTool(c.name, c.input, scope, signal);
        return {
          type: 'tool_result' as const,
          tool_use_id: c.id,
          content: asToolData(out.text),
          ...(out.isError ? { is_error: true } : {}),
        };
      }),
    );
    aborted();

    history.push({ role: 'user', content: results as unknown as ContentBlock[] });
    onStep?.();
    onProgress?.(tr('Хариултыг бэлдэж байна…'));
  }

  const msg = tr('Хариулт {0} алхамд гарсангүй. Асуултаа илүү тодорхой болгож үзнэ үү.', MAX_TURNS);
  history.push({ role: 'assistant', content: [{ type: 'text', text: msg }] });
  return { text: msg, turns: MAX_TURNS };
}
