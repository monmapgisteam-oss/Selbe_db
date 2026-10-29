'use client';

/**
 * AI ТУСЛАХЫН ХӨВӨГЧ ТОВЧ — `AgentChat.tsx`-ээс салгав (2026-10-04, ачааллын аудит).
 */

import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { t as tr } from '@/lib/i18nCore';
import s from '@/components/agent.module.css';

/**
 * Реле хаяг тохируулсан эсэх — `client.ts`-ийн `AGENT_APIS`-тэй ИЖИЛ дүрэм.
 */
const CONFIGURED = (process.env.NEXT_PUBLIC_AGENT_API ?? '').split(',').some((u) => u.trim());

/** Нээх товч — цонх хаалттай үед харагдана */
export function AgentButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) ref.current?.focus();
    wasOpen.current = open;
  }, [open]);
  if (open || !CONFIGURED) return null;
  return (
    <button ref={ref} type="button" className={s.fab} onClick={onToggle} aria-pressed={open} title={tr('AI туслах')}>
      <Spark />
      <span className={s.fabLabel}>{tr('AI туслах')}</span>
    </button>
  );
}

export function AgentLoading() {
  return (
    <div className={s.panel} role="status" aria-live="polite">
      <div className={s.progress} style={{ gridRow: '1 / -1', placeSelf: 'center' }}>
        <span className={s.dot} />
        {tr('AI туслах ачаалж байна…')}
      </div>
    </div>
  );
}

/**
 * Оч — `Icon`-д тохирох дүрс байхгүй тул энд шууд (`AgentChat`-ийн толгой ч ашиглана).
 */
export function Spark() {
  return <Sparkles size={15} strokeWidth={1.75} aria-hidden />;
}
