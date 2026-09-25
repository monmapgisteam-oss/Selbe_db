/**
 * CLAUDE CODE ГОРИМ — релег API түлхүүрийн ОРОНД энэ PC дээр нэвтэрсэн
 * Claude Code (`claude -p`) руу холбоно (2026-09-17, хэрэглэгчийн шийдвэр:
 * «энэ PC Claude-ийг хостлоно»).
 *
 * ⚠️ ГЭРЭЭНИЙ ХЭЛБЭР ӨӨРЧЛӨГДӨХГҮЙ: портал (`src/lib/agent/client.ts`,
 *    `execReport.askExecSummary`) урьдын адил Messages API хэлбэрээр
 *    `{system, messages, tools}` илгээж `{stop_reason, content}` авна. Энэ
 *    файл тэр хэлбэрийг `claude -p`-ийн текст оролт/гаралт руу ХӨРВҮҮЛНЭ.
 *
 * ⚠️ ХЭРЭГСЭЛ BROWSER-Т ГҮЙЦЭТГЭГДЭНЭ (ArcGIS асуулга) — Claude Code-д
 *    хэрэгсэл ӨГӨХГҮЙ (`--tools ""`). Оронд нь загварт хэрэгслийн тодорхойлолтыг
 *    текстээр өгч, дуудлагыг `<tool_call>{json}</tool_call>` хэлбэрээр бичүүлнэ;
 *    энд түүнийг `tool_use` блок болгож буцаана. Дараагийн эргэлтэд browser-ийн
 *    үр дүн (`tool_result`) текст болж яриандаа орно.
 *
 * ⚠️ АЮУЛГҮЙ БАЙДАЛ: `claude` нь `--tools ""` (файл, shell, веб — ЮУ Ч үгүй),
 *    `--setting-sources ""` (CLAUDE.md, hooks, plugin уншихгүй),
 *    `--strict-mcp-config` (MCP сервергүй), хоосон түр хавтсанд ажиллана.
 *    ArcGIS-ийн өгөгдөл дотор prompt injection байсан ч загвар энэ PC-ийн
 *    юуг ч хөндөх боломжгүй.
 *
 * ⚠️ ХЭРЭГЛЭЭ нь энэ PC дээр нэвтэрсэн Claude бүртгэлийн хязгаараас явна.
 *    Олон хэрэглэгчтэй үед хязгаар хурдан дуусна — `MAX_PARALLEL`, релейн
 *    хурдны хязгаар хоёр нь тэрийг хамгаална.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";

/** Нэг хүсэлтийн дээд хугацаа — агентын нэг эргэлт ихэвчлэн 5–30с */
const TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 180_000);
/** Зэрэг ажиллах `claude` процессын тоо — бусад нь дараалалд хүлээнэ */
const MAX_PARALLEL = Number(process.env.CLAUDE_MAX_PARALLEL || 3);
/**
 * Дараалалд хүлээх дээд тоо — хэтэрвэл шууд 429.
 * ⚠️ Хязгааргүй дараалал нь ачаалалтай үед хүсэлт бүрийг TIMEOUT хүртэл
 *    хүлээлгэж, хэрэглэгч «гацсан» гэж ойлгоно; эрт «завгүй» гэж хэлэх нь дээр.
 */
const MAX_QUEUE = Number(process.env.CLAUDE_MAX_QUEUE || 12);
/**
 * ХАРИУНЫ КЭШ — ЯГ ижил `{system, messages, tools}` хүсэлтэд.
 * ⚠️ Гол хэрэглэгч нь «Удирдлагын тайлан»-гийн AI дүгнэлт: өгөгдөл 5 минут
 *    кэштэй тул олон удирдлага нэг цагт дарахад ЯГ ижил баримт илгээгдэнэ —
 *    Claude бүртгэлийн хязгаарыг давхар зарцуулах шаардлагагүй.
 * ⚠️ Агентын чатад ч аюулгүй: хариу нь зөвхөн тухайн яриа ба хэрэглэгчийн
 *    эрхээр угсарсан системийн зааварт хамаарна — өөр эрхтэй хэрэглэгчийн
 *    заавар өөр тул түлхүүр нь өөр болно.
 */
const CACHE_TTL = Number(process.env.CLAUDE_CACHE_TTL_MS || 10 * 60_000);
const CACHE_MAX = 200;
const cache = new Map();
const inflight = new Map();

/**
 * `claude` гүйцэтгэх файлыг олно: `CLAUDE_BIN` → PATH → VS Code өргөтгөлийн
 * хамгийн шинэ хувилбар.
 *
 * ⚠️ VS Code өргөтгөл шинэчлэгдэхэд хавтасны нэр (хувилбар) солигддог тул
 *    замыг ХАТУУ бичихгүй — эхлэх бүрд дахин хайна.
 */
/**
 * ⚠️ Зам нь хүсэлт бүрд ШАЛГАГДАНА: VS Code өргөтгөл шинэчлэгдэхэд хуучин
 *    хувилбарын хавтас устаж, асаалттай реле «claude олдсонгүй» гэж унадаг.
 */
let binCache = null;
export function claudeBin() {
  if (binCache && existsSync(binCache)) return binCache;
  binCache = findClaudeBin();
  return binCache;
}

export function findClaudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  for (const dir of (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":")) {
    if (dir && existsSync(join(dir, exe))) return join(dir, exe);
    if (dir && process.platform === "win32" && existsSync(join(dir, "claude.cmd"))) return join(dir, "claude.cmd");
  }
  /* Бие даасан суулгалт (`irm https://claude.ai/install.ps1 | iex`) — VS Code-оос
     хамааралгүй тул production-д ҮҮНИЙГ зөвлөнө */
  const local = join(homedir(), ".local", "bin", exe);
  if (existsSync(local)) return local;
  const extRoot = join(homedir(), ".vscode", "extensions");
  if (existsSync(extRoot)) {
    const cands = readdirSync(extRoot)
      .filter((d) => d.startsWith("anthropic.claude-code-"))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const d of cands) {
      const p = join(extRoot, d, "resources", "native-binary", exe);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/* ═══════════════ Хөрвүүлэлт ═══════════════ */

const TOOL_PROTOCOL = (tools) => `

# ХЭРЭГСЭЛ ДУУДАХ ЖУРАМ
Чамд доорх хэрэгслүүд байна. Хэрэгсэл дуудахын тулд хариултдаа ЗӨВХӨН дараах
хэлбэрийн мөр(үүд) бич — өөр тайлбар, markdown code fence БҮҮ нэм:
<tool_call>{"name": "<хэрэгслийн нэр>", "input": { ... }}</tool_call>
Нэг хариултад хэд хэдэн <tool_call> зэрэг бичиж болно. Хэрэгслийн үр дүн
дараагийн мессежид «[ХЭРЭГСЛИЙН ҮР ДҮН]» гэж ирнэ. Хангалттай мэдээлэл цугларсан
бол <tool_call>-гүйгээр эцсийн хариултаа бич. Үр дүнг хэзээ ч өөрөө зохиож бичихгүй.

Хэрэгслүүд (JSON Schema):
${JSON.stringify(
  tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
  null,
  1,
)}`;

const blockText = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map(blockText).join("\n") : c?.text ?? "");

/** Messages API-ийн яриаг нэг текст болгоно */
function transcript(messages) {
  const out = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push(`${m.role === "user" ? "[ХЭРЭГЛЭГЧ]" : "[ТУСЛАХ]"}\n${m.content}`);
      continue;
    }
    const parts = [];
    for (const b of m.content || []) {
      if (b.type === "text" && b.text) parts.push(b.text);
      else if (b.type === "tool_use") parts.push(`<tool_call>${JSON.stringify({ name: b.name, input: b.input })}</tool_call>`);
      else if (b.type === "tool_result") {
        parts.push(`[ХЭРЭГСЛИЙН ҮР ДҮН${b.is_error ? " — АЛДАА" : ""}]\n${blockText(b.content)}`);
      }
      /* ⚠️ thinking/redacted_thinking блок Claude Code-оос ирэхгүй — алгасна */
    }
    if (!parts.length) continue;
    const isResults = m.role === "user" && (m.content || []).every((b) => b.type === "tool_result");
    out.push(`${m.role === "assistant" ? "[ТУСЛАХ]" : isResults ? "" : "[ХЭРЭГЛЭГЧ]\n"}${m.role === "assistant" ? "\n" : ""}${parts.join("\n\n")}`);
  }
  out.push("[ТУСЛАХ] — дараагийн хариултаа бич:");
  return out.join("\n\n");
}

/** Загварын текстээс `tool_use` блокуудыг салгана */
export function parseReply(text) {
  const content = [];
  const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let rest = text;
  let m;
  while ((m = re.exec(text))) {
    try {
      const raw = m[1].replace(/^```(?:json)?\s*|\s*```$/g, "");
      const call = JSON.parse(raw);
      if (call && typeof call.name === "string") {
        content.push({
          type: "tool_use",
          id: `toolu_cc_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
          name: call.name,
          input: call.input && typeof call.input === "object" ? call.input : {},
        });
        rest = rest.replace(m[0], "");
      }
    } catch {
      /* ⚠️ Эвдэрсэн JSON — текстэнд нь үлдээнэ (хэрэглэгч хараад мэдэгдэнэ) */
    }
  }
  const t = rest.trim();
  if (t) content.unshift({ type: "text", text: t });
  return { content, stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn" };
}

/* ═══════════════ Дараалал ═══════════════ */

let running = 0;
const waiters = [];
const acquire = () => {
  if (running < MAX_PARALLEL) { running++; return Promise.resolve(); }
  if (waiters.length >= MAX_QUEUE) {
    return Promise.reject(new ClaudeCodeError("AI туслах завгүй байна — хэдэн секундийн дараа дахин оролдоно уу.", { status: 429, retryable: true }));
  }
  return new Promise((r) => waiters.push(r));
};
const release = () => {
  const next = waiters.shift();
  if (next) next();
  else running--;
};

/* ═══════════════ Дуудлага ═══════════════ */

/**
 * ⚠️ API түлхүүр орчинд байвал `claude` ТҮҮНИЙГ ашиглана — энэ горимын утга нь
 *    PC-ийн НЭВТЭРСЭН бүртгэл тул түлхүүрийг зориуд УСТГАНА (хоосон мөр биш:
 *    зарим хувилбар хоосон утгыг «тохируулсан» гэж үздэг).
 */
function childEnv() {
  const env = { ...process.env, CLAUDE_CODE_ENTRYPOINT: "selbe-agent-proxy" };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_BASE_URL;
  return env;
}

/**
 * ЭХЛЭХ ҮЕИЙН ӨӨРИЙГӨӨ ШАЛГАХ — жижиг хүсэлт нэг удаа явуулж Claude Code
 * нэвтэрсэн эсэхийг батална. `/health` үүгээр «бэлэн эсэх»-ийг хэлнэ.
 * ⚠️ Хямд загвар (haiku) — бүртгэлийн хязгаараас бараг идэхгүй.
 */
export async function selfTest() {
  const bin = claudeBin();
  if (!bin) return { ok: false, reason: "claude олдсонгүй" };
  try {
    await callRaw({
      system: "Reply with OK.", messages: [{ role: "user", content: "ping" }],
      tools: [], model: process.env.CLAUDE_SELFTEST_MODEL || "claude-haiku-4-5", bin,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export class ClaudeCodeError extends Error {
  constructor(message, { status = 502, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * @param {{system?: string, messages: any[], tools?: any[], model: string, effort?: string, bin: string}} opts
 * @returns {Promise<{stop_reason: string, content: any[], usage?: any}>}
 */
export async function callClaudeCode(opts) {
  const key = createHash("sha256")
    .update(JSON.stringify([opts.model, opts.effort, opts.system ?? "", opts.tools ?? [], opts.messages]))
    .digest("hex");
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return { ...hit.value, cached: true };
  /* ⚠️ Зэрэг ирсэн ИЖИЛ хүсэлт нэг процесс хуваалцана */
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = callRaw(opts).then((value) => {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { value, until: Date.now() + CACHE_TTL });
    return value;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Ачааллын агшин — `/health` ба лог */
export const stats = () => ({ running, queued: waiters.length, cached: cache.size });

/**
 * `.cmd` ШИМИЙГ SHELL-ГҮЙГЭЭР АЖИЛЛУУЛНА (2026-09-25, аудит №6).
 *
 * ⚠️ Урьд нь `shell: bin.endsWith(".cmd")` байв. `shell: true` үед Node
 *    аргументуудыг зайгаар л залгаж ОГТ хашилтанд оруулдаггүй тул
 *    `--tools ""` ба `--setting-sources ""`-ийн ХООСОН утга алга болж
 *    (`--tools` нь «--setting-sources»-ийг утгаа болгон авна), толгой хэсгийн
 *    АЮУЛГҮЙ БАЙДЛЫН хаалт (хэрэгсэлгүй, тохиргоогүй) чимээгүй унадаг байв —
 *    хүсэлт бүрд PC-ийн hooks, CLAUDE.md, тохиргоо ачаалагдана. Хэрэглэгчийн
 *    нэрэнд зай байвал bin / `--system-prompt-file`-ийн зам хуваагдаж бүх
 *    хүсэлт унадаг байв.
 * ⚠️ Одоо: npm-ийн `claude.cmd` шимээс ЖИНХЭНЭ зорилтыг (cli.js эсвэл .exe)
 *    уншиж ШУУД ажиллуулна (Node аргумент бүрийг өөрөө зөв хашилтална).
 *    Шимийг таньж чадахгүй бол `cmd.exe /d /s /c`-ээр, аргумент БҮРИЙГ
 *    хашилтанд (хоосныг `""`) оруулж ажиллуулна.
 */
const launchCache = new Map();
function resolveLaunch(bin) {
  if (process.platform !== "win32" || !/\.(cmd|bat)$/i.test(bin)) return { file: bin, pre: [], viaCmd: false };
  const hit = launchCache.get(bin);
  if (hit && existsSync(hit.file) && hit.pre.every((p) => existsSync(p))) return hit;
  let launch = { file: bin, pre: [], viaCmd: true };
  try {
    /* npm cmd-shim: `"%dp0%\node_modules\@anthropic-ai\claude-code\cli.js" %*`
       (хуучин хувилбарт `%~dp0`) — `%*`-ийн ӨМНӨХ хашилттай зам нь зорилт. */
    const src = readFileSync(bin, "utf8");
    const rel = [...src.matchAll(/"%~?dp0%?\\?([^"%]+)"\s*%\*/gi)].at(-1)?.[1];
    const target = rel ? join(dirname(bin), rel) : null;
    if (target && existsSync(target)) {
      if (/\.exe$/i.test(target)) launch = { file: target, pre: [], viaCmd: false };
      else if (/\.[cm]?js$/i.test(target)) {
        /* Шим нь хажуудаа node.exe байвал түүнийг, үгүй бол релейн өөрийн node-ыг */
        const localNode = join(dirname(bin), "node.exe");
        launch = { file: existsSync(localNode) ? localNode : process.execPath, pre: [target], viaCmd: false };
      }
    }
  } catch {
    /* Уншигдахгүй шим — доорх cmd.exe (бүх аргумент хашилттай) замаар */
  }
  launchCache.set(bin, launch);
  return launch;
}

/** cmd.exe-д нэг аргумент — ХООСОН утга `""` болж заавал хүрнэ */
const cmdQuote = (a) => `"${String(a).replace(/"/g, '""')}"`;

/**
 * ⚠️ Хугацаа хэтрэхэд процессын МОДЫГ бүхэлд нь алана: cmd.exe-ээр
 *    ажилласан үед `child.kill()` нь зөвхөн cmd.exe-г алж, доторх claude
 *    үргэлжлэн ажиллаж MAX_PARALLEL-ийн гадна бүртгэлийн хязгаар зарцуулдаг.
 */
function killTree(child) {
  if (process.platform === "win32" && child.pid) {
    const k = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    k.on("error", () => child.kill());
    return;
  }
  child.kill();
}

async function callRaw({ system, messages, tools, model, effort, bin }) {
  await acquire();
  /* ⚠️ Хүсэлт бүрд ТУСДАА хоосон хавтас — CLAUDE.md, .claude/ тохиргоо олдохгүй,
     зэрэг хүсэлтүүд бие биеийнхээ файлыг хөндөхгүй. */
  const dir = join(tmpdir(), "selbe-agent-cc", randomUUID());
  try {
    /* ⚠️ mkdir нь try ДОТОР (2026-09-25): `acquire()` слот авсан тул энд
       шидсэн алдаа (ENOSPC/EACCES) `finally`-ийн `release()`-ийг алгасаж,
       3 удаа унахад реле бүрмөсөн «завгүй» болдог байв. */
    mkdirSync(dir, { recursive: true });
    const sysText = (system || "") + (tools?.length ? TOOL_PROTOCOL(tools) : "");
    /* ⚠️ Системийн заавар ФАЙЛААР — давхаргын бүртгэл олон мянган тэмдэгт тул
       Windows-ийн командын мөрийн хязгаарыг (32K) давна. */
    const sysFile = join(dir, "system.txt");
    writeFileSync(sysFile, sysText || "Та туслах.", "utf8");

    const args = [
      "-p",
      "--output-format", "json",
      "--model", model,
      "--tools", "",
      "--setting-sources", "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--system-prompt-file", sysFile,
      ...(effort && !/haiku/i.test(model) ? ["--effort", effort] : []),
    ];

    const launch = resolveLaunch(bin);
    const stdout = await new Promise((resolve, reject) => {
      const common = {
        cwd: dir,
        windowsHide: true,
        /* ⚠️ API түлхүүр орчинд байвал `claude` ТҮҮНИЙГ ашиглана — энэ горимын
           утга нь PC-ийн НЭВТЭРСЭН бүртгэл тул түлхүүрийг зориуд авч хаяна. */
        env: childEnv(),
      };
      /* ⚠️ `shell: true` ХЭРЭГЛЭХГҮЙ — дээрх `resolveLaunch`-ийн тайлбарыг үз */
      const child = launch.viaCmd
        ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${[bin, ...args].map(cmdQuote).join(" ")}"`], {
            ...common,
            windowsVerbatimArguments: true,
          })
        : spawn(launch.file, [...launch.pre, ...args], common);
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        killTree(child);
        reject(new ClaudeCodeError(`Claude Code ${Math.round(TIMEOUT_MS / 1000)} секундэд хариу өгсөнгүй`, { status: 504, retryable: true }));
      }, TIMEOUT_MS);
      child.stdout.on("data", (d) => { out += d; });
      child.stderr.on("data", (d) => { err += d; });
      child.on("error", (e) => { clearTimeout(timer); reject(new ClaudeCodeError(`claude ажиллуулж чадсангүй: ${e.message}`, { status: 500 })); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (out.trim()) resolve(out);
        else reject(new ClaudeCodeError(`claude алдаатай дууслаа (код ${code}): ${err.trim().slice(0, 400)}`, { status: 502, retryable: true }));
      });
      child.stdin.end(transcript(messages), "utf8");
    });

    let j;
    try {
      j = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).pop());
    } catch {
      throw new ClaudeCodeError(`claude-ийн гаралтыг уншиж чадсангүй: ${stdout.slice(0, 300)}`);
    }
    if (j.is_error) {
      const msg = String(j.result || j.subtype || "Тодорхойгүй алдаа");
      /* ⚠️ Нэвтрээгүй / хязгаар дууссан үеийн мессежийг ойлгомжтой болгоно */
      if (/log ?in|auth|credential|unauthori/i.test(msg)) {
        throw new ClaudeCodeError("Энэ PC дээр Claude Code нэвтрээгүй байна — терминалд `claude` ажиллуулаад /login хийнэ үү.", { status: 401 });
      }
      if (/limit|quota|usage/i.test(msg)) {
        throw new ClaudeCodeError(`Claude бүртгэлийн хэрэглээний хязгаар хүрсэн: ${msg}`, { status: 429, retryable: true });
      }
      throw new ClaudeCodeError(msg);
    }
    const parsed = parseReply(String(j.result ?? ""));
    return { ...parsed, usage: j.usage };
  } finally {
    /* ⚠️ Цэвэрлэгээ `release()`-ийг ХЭЗЭЭ Ч алгасахгүй (2026-09-25): хугацаа
       хэтрэхэд `killTree` асинхрон тул Windows дээр claude `cwd=dir`-ээ барьсаар
       байх үед `rmSync` EPERM шидэж, `release()` ажиллахгүй, клиент 504-ийн
       оронд 500 авч, 3 удаа болоход реле бүрмөсөн «завгүй» болдог байв.
       Синхрон `maxRetries` event loop-ийг хаах тул дахин оролдлогыг асинхроноор. */
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }).catch(() => {});
    } finally {
      release();
    }
  }
}
