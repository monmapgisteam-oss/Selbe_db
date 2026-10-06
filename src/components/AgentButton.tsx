'use client';

/**
 * AI ТУСЛАХЫН ХӨВӨГЧ ТОВЧ — `AgentChat.tsx`-ээс салгав (⚠️ 2026-10-04, ачааллын аудит).
 *
 * ⚠️ ЯАГААД ТУСДАА: товч нь порталын анхны зурагтад ҮРГЭЛЖ харагддаг тул `Portal`
 *    статикаар импортлоно; харин чатын цонх (`AgentChat` — агентын клиент, датасетийн
 *    бүртгэл, markdown) нь ховор нээгддэг тул `dynamic`. Нэг файлд байхад товчийг
 *    импортлох нь бүх цонхыг Portal-ын chunk-д чирдэг байв.
 * ⚠️ Энэ файл `@/lib/agent/*`-ийг ИМПОРТЛОХГҮЙ — эс бөгөөс салгалтын ач холбогдол алга.
 */

import { useEffect, useRef } from 'react';
import { t as tr } from '@/lib/i18nCore';
import s from '@/components/agent.module.css';

/**
 * ⚠️ 2026-10-06 (аудит): AI-ийн реле хаяг тохируулагдсан эсэх. `NEXT_PUBLIC_AGENT_API`
 *    хоосон бол товч ОГТ гарахгүй — урьд нь товч гарч, дарахад «ажиллахгүй байна» л
 *    харуулдаг байв. `agent/client.AGENT_APIS`-тай ИЖИЛ задлал (таслал, хоосон зай) —
 *    энэ файл `@/lib/agent/*`-ийг импортлохгүй тул (дээрх ⚠️) энд давтав.
 */
const HAS_AGENT = (process.env.NEXT_PUBLIC_AGENT_API ?? '').split(',').some((u) => u.trim() !== '');

/** Нээх товч — цонх хаалттай үед харагдана */
export function AgentButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  /* ⚠️ 2026-09-29 (аудит 10): самбар хаагдахад фокус body дээр үлддэг байв — FAB
     дахин гарч ирэхэд (нээлттэй → хаалттай шилжилт) өөр дээрээ фокус авна. */
  const ref = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) ref.current?.focus();
    wasOpen.current = open;
  }, [open]);
  if (open || !HAS_AGENT) return null;
  return (
    <button ref={ref} type="button" className={s.fab} onClick={onToggle} aria-pressed={open} title={tr('AI туслах')}>
      <Spark />
      {tr('AI туслах')}
    </button>
  );
}

/**
 * ⚠️ 2026-10-06 (аудит): AI цонхны chunk (`AgentChat`, `dynamic`) ачаалагдах хооронд —
 *    товч дармагц алга болж (`open`) цонх хэдэн секунд гарахгүй, хэрэглэгч дахин дарах
 *    гэж товчоо хайдаг байв. Ижил байрлалд (`.panel`) эргэлдэгчтэй түр самбар.
 */
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

/** Оч — `Icon`-д тохирох дүрс байхгүй тул энд шууд (`AgentChat`-ийн толгой ч ашиглана) */
export function Spark() {
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
