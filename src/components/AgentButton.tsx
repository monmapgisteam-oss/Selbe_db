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
import { Sparkles } from 'lucide-react';
import { t as tr } from '@/lib/i18nCore';
import s from '@/components/agent.module.css';

/**
 * Реле хаяг тохируулсан эсэх — `client.ts`-ийн `AGENT_APIS`-тэй ИЖИЛ дүрэм.
 * ⚠️ 2026-10-06: `@/lib/agent/client`-ээс ИМПОРТЛОХГҮЙ (дээрх салгалтын ⚠️) — env-ийг
 *    шууд уншина (build үед орлуулагдана). Хаяггүй build-д товч ОГТ гарахгүй; урьд нь
 *    харагдаж, нээхэд оролт идэвхтэй байсан тул асуулт бүр алдаагаар буцдаг байв.
 */
const CONFIGURED = (process.env.NEXT_PUBLIC_AGENT_API ?? '').split(',').some((u) => u.trim());

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
  if (open || !CONFIGURED) return null;
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

/**
 * Оч — `Icon`-д тохирох дүрс байхгүй тул энд шууд (`AgentChat`-ийн толгой ч ашиглана).
 * ⚠️ 2026-10-23: Environment — гараар зурсан дүүргэлттэй SVG-ийн оронд lucide `Sparkles`
 *    (хүрээ 1.75, `currentColor`) — порталын бусад дүрстэй нэг хэл.
 */
export function Spark() {
  return <Sparkles size={15} strokeWidth={1.75} aria-hidden />;
}
