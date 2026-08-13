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
export const AGENT_API =
  process.env.NEXT_PUBLIC_AGENT_API?.trim().replace(/\/+$/, '') || 'http://localhost:8787';

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
async function arcgisToken(): Promise<string | null> {
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
  const res = await fetch(`${AGENT_API}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // ⚠️ Токенгүй үед толгойг ОГТ нэмэхгүй — хоосон утга илгээвэл локал реле
      //    (нэвтрэлт шалгадаггүй) рүү илүү preflight толгой явна.
      ...(token ? { 'x-arcgis-token': token } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  const reply = (await res.json().catch(() => ({}))) as RelayReply;
  if (!res.ok) {
    throw new Error(
      reply.error ??
        (res.status === 401
          ? 'AI үйлчилгээний түлхүүр буруу байна.'
          : `Реле алдаа (HTTP ${res.status})`),
    );
  }
  return reply;
}

/** Реле асаалттай эсэх — UI үүнээс хамааран товчоо идэвхгүй болгоно */
export async function relayAlive(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_API}/health`, { signal });
    return res.ok;
  } catch {
    return false;
  }
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
  onProgress?.('Бодож байна…');

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const reply = await callRelay({ system, messages: history, tools: AGENT_TOOLS }, signal);

    if (reply.stop_reason === 'refusal') {
      const msg = reply.note ?? 'Энэ хүсэлтэд хариулах боломжгүй байна.';
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
      return { text: text || 'Хариулт хоосон ирлээ.', turns: turn };
    }

    onProgress?.(describeCall(calls[0].name, calls[0].input));

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

    // ⚠️ БҮХ үр дүн НЭГ мессежид орно. Салгавал загвар зэрэгцээ дуудлага
    //    хийхээ болино.
    history.push({ role: 'user', content: results as unknown as ContentBlock[] });
    onProgress?.('Хариултыг бэлдэж байна…');
  }

  const msg = `Хариулт ${MAX_TURNS} алхамд гарсангүй. Асуултаа илүү тодорхой болгож үзнэ үү.`;
  history.push({ role: 'assistant', content: [{ type: 'text', text: msg }] });
  return { text: msg, turns: MAX_TURNS };
}
