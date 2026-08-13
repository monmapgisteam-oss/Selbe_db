'use client';

/**
 * AI ТУСЛАХЫН ЦОНХ — баруун доод буланд хөвөгч.
 *
 * ⚠️ Цонх нь порталын БҮХ харагдацад нэг л удаа зурагдана (`Portal`-ын төгсгөлд,
 * `DocViewer`-ийн адилаар). Харагдац бүрт тусад нь тавьбал яриа солигдох бүрт
 * тасарна.
 *
 * ⚠️ Агент нь `scope`-оор хязгаарлагдана — тэр нь хэрэглэгчийн ҮЗЭЖ БОЛОХ
 * харагдацуудын жагсаалт (`Root`-оос ирсэн эрх). Ингэснээр эрхгүй хэрэглэгч
 * агентаар дамжуулж бусад хэсгийн өгөгдлийг харах боломжгүй.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENT_API, ask, relayAlive, type ApiMessage } from '@/lib/agent/client';
import type { AgentScope } from '@/lib/agent/registry';
import { AgentMarkdown } from '@/components/AgentMarkdown';
import s from '@/components/agent.module.css';

type Bubble = { role: 'user' | 'bot'; text: string };

/** Өргөн горимын сонголтыг хадгалах түлхүүр */
const WIDE_KEY = 'selbe-agent-wide';

/**
 * Эхлэхэд санал болгох асуултууд — хэрэглэгч юу асуухаа мэдэхгүй байх нь түгээмэл.
 * ⚠️ Агентын ЧАДВАРЫГ төлөөлүүлж сонгосон: нэгтгэл, ангиллын задаргаа, бүсийн
 * бүрэн тойм, санхүү — дөрөв нь дөрвөн өөр зам ажиллуулна.
 */
const STARTERS = [
  'Төсөлд нийт хэдэн барилга байгаа вэ?',
  'Багц 1 мэдээллийг дэлгэрэнгүй харуулаач',
  'Барилгын төлөв бүрээр хэдэн барилга вэ?',
  'Багц 6.1-ийн гэрээний дүн хэд вэ?',
];

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
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [alive, setAlive] = useState<boolean | null>(null);

  /**
   * Баруун талын өргөн самбар горим.
   * ⚠️ Сонголтыг `localStorage`-д хадгална — хэрэглэгч цонх хаагаад дахин
   * нээх бүрд өргөтгөж суух нь ядаргаатай.
   */
  const [wide, setWide] = useState(false);
  useEffect(() => {
    setWide(localStorage.getItem(WIDE_KEY) === '1');
  }, []);
  const toggleWide = () => {
    setWide((v) => {
      localStorage.setItem(WIDE_KEY, v ? '0' : '1');
      return !v;
    });
  };

  /**
   * ⚠️ Ярианы ЖИНХЭНЭ түүх (хэрэгслийн дуудлага, үр дүн бүхий) энд. `log` нь
   * зөвхөн ДЭЛГЭЦИЙН хувилбар. Хоёрыг нэгтгэвэл tool блокууд хэрэглэгчид
   * харагдаж, эсвэл загварт дутуу түүх очно.
   */
  const history = useRef<ApiMessage[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  /** Реле асаалттай эсэхийг цонх нээгдэх бүрд шалгана */
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    void relayAlive(c.signal).then(setAlive).catch(() => setAlive(false));
    return () => c.abort();
  }, [open]);

  /** Шинэ мессеж ирэхэд доош гүйлгэнэ */
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [log, progress]);

  /** Цонх хаагдвал явж буй хүсэлтийг зогсооно */
  useEffect(() => {
    if (!open) abort.current?.abort();
  }, [open]);

  const send = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || busy) return;

      setInput('');
      setError(null);
      setLog((l) => [...l, { role: 'user', text: q }]);
      setBusy(true);
      setProgress('Бодож байна…');

      const controller = new AbortController();
      abort.current = controller;

      try {
        const { text } = await ask({
          question: q,
          history: history.current,
          scope,
          onProgress: setProgress,
          signal: controller.signal,
        });
        setLog((l) => [...l, { role: 'bot', text }]);
      } catch (e) {
        if (controller.signal.aborted) return;
        // ⚠️ Алдааг ЧИМЭЭГҮЙ залгихгүй — хэрэглэгч хуучин хариултыг шинэ гэж
        //    андуурвал буруу шийдвэр гаргана.
        setError(e instanceof Error ? e.message : String(e));
        // Амжилтгүй эргэлтийн дараа түүх тэнцвэргүй үлддэг (хариулт ирээгүй)
        // тул сүүлийн хэрэглэгчийн мөрийг хасна — дараагийн асуулт зөв явна.
        const h = history.current;
        while (h.length && h[h.length - 1].role === 'user') h.pop();
      } finally {
        setBusy(false);
        setProgress('');
        abort.current = null;
      }
    },
    [busy, scope],
  );

  const clear = () => {
    abort.current?.abort();
    history.current = [];
    setLog([]);
    setError(null);
  };

  if (!open) return null;

  return (
    <div className={`${s.panel} ${wide ? s.panelWide : ''}`} role="dialog" aria-label="AI туслах">
      <div className={s.head}>
        <span aria-hidden style={{ color: 'var(--hue)', display: 'grid', placeItems: 'center' }}>
          <Spark />
        </span>
        <span>
          <span className={s.title}>AI туслах</span>
          <br />
          <span className={s.sub}>Төслийн өгөгдлөөс шууд хариулна</span>
        </span>
        <span className={s.spacer} />
        <button
          type="button"
          className={s.iconBtn}
          onClick={toggleWide}
          aria-pressed={wide}
          title={wide ? 'Жижигрүүлэх' : 'Баруун талд өргөтгөх'}
          aria-label={wide ? 'Жижигрүүлэх' : 'Баруун талд өргөтгөх'}
        >
          <Expand wide={wide} />
        </button>
        <button type="button" className={s.iconBtn} onClick={clear} title="Яриаг цэвэрлэх" aria-label="Яриаг цэвэрлэх">
          ⟲
        </button>
        <button type="button" className={s.iconBtn} onClick={onClose} title="Хаах" aria-label="Хаах">
          ✕
        </button>
      </div>

      {alive === false && (
        <div className={s.offline}>
          AI үйлчилгээ ажиллахгүй байна. Локалаар асаахдаа:
          <br />
          <code>cd agent-proxy &amp;&amp; npm install</code>
          <br />
          <code>ANTHROPIC_API_KEY=… node server.mjs</code>
          <br />
          Хаяг: <code>{AGENT_API}</code>
        </div>
      )}

      <div className={s.log} ref={logRef}>
        {/* ⚠️ Тайлбар бичиг ЗОРИУДААР байхгүй — зөвхөн дарж болох жишээ асуултууд.
            Хэрэглэгч уншихаас илүү дарж эхэлдэг. */}
        {!log.length && (
          <div className={s.chips}>
            {STARTERS.map((q) => (
              <button key={q} type="button" className={s.chip} onClick={() => void send(q)}>
                {q}
              </button>
            ))}
          </div>
        )}

        {log.map((m, i) => (
          <div key={i} className={`${s.msg} ${m.role === 'user' ? s.user : s.bot}`}>
            {m.role === 'bot' ? <AgentMarkdown text={m.text} /> : m.text}
          </div>
        ))}

        {busy && progress && (
          <div className={s.progress}>
            <span className={s.dot} />
            {progress}
          </div>
        )}

        {error && <div className={s.error} role="alert">{error}</div>}
      </div>

      <div className={s.foot}>
        <textarea
          className={s.input}
          value={input}
          placeholder="Асуултаа бичнэ үү…"
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter — илгээх, Shift+Enter — шинэ мөр
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button
          type="button"
          className={s.send}
          disabled={busy || !input.trim()}
          onClick={() => void send(input)}
        >
          Илгээх
        </button>
      </div>
    </div>
  );
}

/** Нээх товч — цонх хаалттай үед харагдана */
export function AgentButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  if (open) return null;
  return (
    <button type="button" className={s.fab} onClick={onToggle} aria-pressed={open} title="AI туслах">
      <Spark />
      AI туслах
    </button>
  );
}

/**
 * Өргөтгөх / жижигрүүлэх дүрс — баруун талын самбарыг илэрхийлнэ.
 * ⚠️ Сумны чиглэл нь ҮЙЛДЛИЙГ заана: жижиг үед «зүүн тийш тат» (өргөтгөх),
 * өргөн үед «баруун тийш түлх» (жижигрүүлэх).
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

/** Оч — `Icon`-д тохирох дүрс байхгүй тул энд шууд */
function Spark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"
        fill="currentColor"
      />
      <path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" fill="currentColor" opacity=".6" />
    </svg>
  );
}
