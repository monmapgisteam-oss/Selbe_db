'use client';

/**
 * AI ТУСЛАХЫН ЦОНХ — баруун доод буланд хөвөгч.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { t as tr, perLocale } from '@/lib/i18nCore';
import { AGENT_API, agentErrorText, ask, relayAlive, stripThinking, type ApiMessage } from '@/lib/agent/client';
import type { AgentScope } from '@/lib/agent/registry';
import { AgentMarkdown } from '@/components/AgentMarkdown';
import { AgentPlan } from '@/components/AgentPlan';
import s from '@/components/agent.module.css';
import { Spark } from '@/components/AgentButton';
export { AgentButton } from '@/components/AgentButton';

type Bubble = { role: 'user' | 'bot' | 'plan'; text: string; done?: boolean };

/** Өргөн горимын сонголтыг хадгалах түлхүүр */
const WIDE_KEY = 'selbe-agent-wide';

/**
 * Дахин илгээх түүхийн дээд хэмжээ (2026-09-25).
 */
const MAX_HISTORY_MSGS = 30;
const MAX_HISTORY_BYTES = 1_500_000;
const TRIM_TO_MSGS = 15;
const TRIM_TO_BYTES = 750_000;

/**
 * Түүхийг БАЙРАНД нь (in-place) огтолно — `tools/telegram-bot.mjs`-ийн
 * `trimCut`-тай ижил дүрэм: зөвхөн хэрэглэгчийн АСУУЛТ (role 'user', string
 * content) эхэлдэг цэгээс тасална.
 */
function trimHistory(h: ApiMessage[]): void {
  const enc = new TextEncoder();
  const sizes = h.map((m) => enc.encode(JSON.stringify(m)).length);
  const all = sizes.reduce((a, b) => a + b, 0);
  if (h.length <= MAX_HISTORY_MSGS && all <= MAX_HISTORY_BYTES) return;
  /* Эхлээд ЗОРИЛТ (`TRIM_TO_*`); сүүлийн нэг асуулт л гэхэд зорилтоос урт (олон хэрэгслийн эргэлт) бол дээд
     хязгаараар — урьдын зан, түүхийг бүхэлд нь цэвэрлэхээс сэргийлнэ. */
  for (const [maxMsgs, maxBytes] of [[TRIM_TO_MSGS, TRIM_TO_BYTES], [MAX_HISTORY_MSGS, MAX_HISTORY_BYTES]]) {
    let total = all;
    for (let i = 0; i < h.length; i++) {
      const m = h[i];
      if (i > 0 && m.role === 'user' && typeof m.content === 'string'
        && h.length - i <= maxMsgs && total <= maxBytes) {
        h.splice(0, i);
        stripThinking(h);
        return;
      }
      total -= sizes[i];
    }
  }
  h.length = 0;
}

/**
 * Эхлэхэд санал болгох асуултууд — хэрэглэгч юу асуухаа мэдэхгүй байх нь түгээмэл.
 */
/** `STARTERS` дахь санхүүгийн жишээний индекс — эрхээр шүүнэ */
const FIN_STARTER = 3;
const STARTERS = perLocale(() => [
  tr('Төсөлд нийт хэдэн барилга байгаа вэ?'),
  tr('Багц 1 мэдээллийг дэлгэрэнгүй харуулаач'),
  tr('Барилгын төлөв бүрээр хэдэн барилга вэ?'),
  tr('Багц 6.1-ийн гэрээний дүн хэд вэ?'),
]);

export function AgentChat({
  open,
  onClose,
  scope,
}: {
  open: boolean;
  onClose: () => void;
  scope: AgentScope;
}) {
  const [log, setLog] = useState<Bubble[]>([]);
  const [plan, setPlan] = useState<{ raw: string } | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<{ text: string; detail?: string } | null>(null);
  const [alive, setAlive] = useState<boolean | null>(null);

  /**
   * Баруун талын өргөн самбар горим.
   */
  const [wide, setWide] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWide(localStorage.getItem(WIDE_KEY) === '1');
    } catch { /* хувийн горим — нарийн харагдац хэвээр */ }
  }, []);
  const toggleWide = () => {
    const next = !wide;
    setWide(next);
    try {
      localStorage.setItem(WIDE_KEY, next ? '1' : '0');
    } catch { /* хувийн горим — тохиргоо хадгалагдахгүй, харагдац ажиллана */ }
  };

  const history = useRef<ApiMessage[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  const scopeKey = scope === 'all' ? 'all' : [...scope].sort().join(',');
  const [seenScopeKey, setSeenScopeKey] = useState(scopeKey);
  const [scopeNotice, setScopeNotice] = useState(false);
  if (scopeKey !== seenScopeKey) {
    setSeenScopeKey(scopeKey);
    setLog([]);
    setError(null);
    setScopeNotice(true);
  }
  const historyScope = useRef(scopeKey);
  useEffect(() => {
    if (historyScope.current === scopeKey) return;
    historyScope.current = scopeKey;
    abort.current?.abort();
    history.current = [];
  }, [scopeKey]);

  /**
   * «Дахин шалгах» товчны тоолуур — өөрчлөгдөхөд доорх эффект `/health`-ийг ДАХИН шалгана.
   */
  const [recheck, setRecheck] = useState(0);
  const [checking, setChecking] = useState(false);
  /** Реле асаалттай эсэхийг цонх нээгдэх бүрд шалгана */
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    void relayAlive(c.signal)
      .then((ok) => { if (!c.signal.aborted) setAlive(ok); })
      .catch(() => { if (!c.signal.aborted) setAlive(false); })
      .finally(() => { if (!c.signal.aborted) setChecking(false); });
    return () => c.abort();
  }, [open, recheck]);
  const recheckRelay = () => {
    setChecking(true);
    setRecheck((n) => n + 1);
  };
  /** Реле унтарсан гэж БАТЛАГДСАН үед илгээх боломжгүй (`null` = шалгаж байна — хориглохгүй) */
  const offline = alive === false;

  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /** Шинэ мессеж ирэхэд доош гүйлгэнэ */
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [log, progress]);

  /** Цонх хаагдвал явж буй хүсэлтийг зогсооно */
  useEffect(() => {
    if (!open) abort.current?.abort();
  }, [open]);

  /**
   * Компонент бүрмөсөн unmount хийхэд (жиш. брэнд/НҮҮР товч дарж Portal задрахад)
   * явж буй хүсэлтийг зогсооно — эс бөгөөс fetch + ArcGIS асуулгууд дэмий
   * үргэлжилнэ.
   */
  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || busy || offline) return;

      setInput('');
      setError(null);
      setScopeNotice(false);
      setLog((l) => [...l, { role: 'user', text: q }]);
      setBusy(true);
      setProgress(tr('Бодож байна…'));

      const controller = new AbortController();
      abort.current = controller;

      // ask() нь history.current-ыг ЯВЦ ДУНД өөрчилдөг (асуулт, assistant tool_use,
      // tool_result мөрүүд). Тасалсан/алдаатай эргэлтэд эдгээр дутуу мөрүүд үлдвэл
      // дараагийн хүсэлт эвдэрдэг (400: role ээлжлэх / tool_use араас tool_result)
      // тул эргэлтийн ӨМНӨХ уртыг тэмдэглэж, амжилтгүй үед яг тэр рүү буцаана.
      //
      const h = history.current;
      trimHistory(h);
      const base = h.length;
      let planText = '';

      try {
        const { text } = await ask({
          question: q,
          history: h,
          scope,
          onProgress: setProgress,
          onPlan: (p) => { planText = p; setPlan({ raw: p }); },
          signal: controller.signal,
        });
        setLog((l) => [...l, ...(planText ? [{ role: 'plan' as const, text: planText, done: true }] : []), { role: 'bot' as const, text }]);
      } catch (e) {
        // Түүхийг тэнцвэртэй (role ээлжилсэн, tool_use бүр tool_result-тай) байдалд
        // буцаана — тасалсан ба алдаатай ХОЁУЛАНД (өмнө нь зөвхөн сүүлийн user
        // мөрийг хасдаг байсан тул дан assistant tool_use дүүжлэгдэж үлддэг байв).
        h.length = base;
        if (controller.signal.aborted) return;
        setError(agentErrorText(e));
        setInput((cur) => (cur.trim() ? cur : q));
      } finally {
        setBusy(false);
        setProgress('');
        setPlan(null);
        abort.current = null;
      }
    },
    [busy, scope, offline],
  );

  const clear = () => {
    abort.current?.abort();
    history.current = [];
    setLog([]);
    setError(null);
    setScopeNotice(false);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[aria-modal="true"]')) return;
      onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={`${s.panel} ${wide ? s.panelWide : ''}`} role="complementary" aria-label={tr('AI туслах')}>
      <div className={s.head}>
        <span aria-hidden style={{ color: 'var(--hue)', display: 'grid', placeItems: 'center' }}>
          <Spark />
        </span>
        <span>
          <span className={s.title}>{tr('AI туслах')}</span>
          <br />
          <span className={s.sub}>{tr('Төслийн өгөгдлөөс шууд хариулна')}</span>
        </span>
        <span className={s.spacer} />
        <button
          type="button"
          className={s.iconBtn}
          onClick={toggleWide}
          aria-pressed={wide}
          title={wide ? tr('Жижигрүүлэх') : tr('Баруун талд өргөтгөх')}
          aria-label={wide ? tr('Жижигрүүлэх') : tr('Баруун талд өргөтгөх')}
        >
          <Expand wide={wide} />
        </button>
        <button type="button" className={s.iconBtn} onClick={clear} title={tr('Яриаг цэвэрлэх')} aria-label={tr('Яриаг цэвэрлэх')}>
          ⟲
        </button>
        <button type="button" className={s.iconBtn} onClick={onClose} title={tr('Хаах')} aria-label={tr('Хаах')}>
          ✕
        </button>
      </div>

      {offline && (
        <div className={s.offline} role="status">
          {tr('AI туслах түр ажиллахгүй байна, дараа дахин оролдоно уу.')}
          {' '}
          <button
            type="button"
            className={s.chip}
            onClick={recheckRelay}
            disabled={checking}
            aria-busy={checking || undefined}
          >
            {checking ? tr('Шалгаж байна…') : tr('Дахин шалгах')}
          </button>
          {process.env.NODE_ENV === 'development' && (
            <>
              <br />
              {tr('Локалаар асаахдаа (нэг удаа):')}
              <br />
              <code>cd agent-proxy; npm install</code>
              <br />
              {tr('Түлхүүргүй — энэ PC-д нэвтэрсэн Claude Code-оор (PowerShell ба bash):')}
              <br />
              <code>npm run start:claude-code</code>
              <br />
              {tr('API түлхүүртэй (PowerShell):')}
              <br />
              <code>$env:ANTHROPIC_API_KEY=&quot;…&quot;; node server.mjs</code>
              <br />
              {tr('API түлхүүртэй (bash):')}
              <br />
              <code>ANTHROPIC_API_KEY=… node server.mjs</code>
              <br />
              {tr('Эсвэл түлхүүрийг agent-proxy/.env.local-д бичээд:')} <code>npm start</code>
              <br />
              {tr('Хаяг:')} <code>{AGENT_API}</code>
            </>
          )}
        </div>
      )}

      <div className={s.log} ref={logRef} aria-live="polite">
        {scopeNotice && (
          <div className={s.progress} role="status">
            {tr('Эрх өөрчлөгдсөн тул яриа шинээр эхэллээ.')}
          </div>
        )}
        {!log.length && (
          <div className={s.chips}>
            {STARTERS().filter((_q, i) => i !== FIN_STARTER || scope === 'all' || scope.includes('pkgFin')).map((q) => (
              <button key={q} type="button" className={s.chip} onClick={() => void send(q)} disabled={offline || busy}>
                {q}
              </button>
            ))}
          </div>
        )}

        {log.map((m, i) => (
          m.role === 'plan'
            ? <AgentPlan key={i} raw={m.text} complete={m.done} />
            : (
              <div key={i} className={`${s.msg} ${m.role === 'user' ? s.user : s.bot}`}>
                {m.role === 'bot' ? <AgentMarkdown text={m.text} /> : m.text}
              </div>
            )
        ))}

        {busy && plan && <AgentPlan raw={plan.raw} running />}

        {busy && progress && (
          <div className={s.progress}>
            <span className={s.dot} />
            {progress}
          </div>
        )}

        {error && (
          <div className={s.error} role="alert">
            {error.text}
            {error.detail && error.detail !== error.text && (
              <span className={s.errorDetail}>{error.detail}</span>
            )}
          </div>
        )}
      </div>

      <div className={s.foot}>
        <textarea
          ref={inputRef}
          className={s.input}
          value={input}
          placeholder={tr('Асуултаа бичнэ үү…')}
          rows={1}
          disabled={alive === false}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter — илгээх, Shift+Enter — шинэ мөр
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (alive === false) return;
              void send(input);
            }
          }}
        />
        <button
          type="button"
          className={s.send}
          disabled={busy || offline || !input.trim()}
          title={offline ? tr('AI туслах түр ажиллахгүй байна, дараа дахин оролдоно уу.') : undefined}
          onClick={() => void send(input)}
        >
          {tr('Илгээх')}
        </button>
      </div>
    </div>
  );
}

/**
 * Өргөтгөх / жижигрүүлэх дүрс — баруун талын самбарыг илэрхийлнэ.
 */
function Expand({ wide }: { wide: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <line x1="14" y1="4" x2="14" y2="20" stroke="currentColor" strokeWidth="1.6" />
      <path
        d={wide ? 'M10.5 9.5l2.5 2.5-2.5 2.5' : 'M6.5 9.5L4 12l2.5 2.5'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
