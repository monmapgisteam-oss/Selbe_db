'use client';

import { type KeyboardEvent as KEvt, useEffect, useRef } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { REASON_MAX } from '@/lib/huvaariBatlah';
import { useLatest } from './useLatest';
import h from '../huvaari.module.css';

/* ══════════════════ Батлах урсгалын цонх ══════════════════ */

/**
 * ИЛГЭЭХ / ШИЙДВЭРЛЭХ цонх — нэг бүрэлдэхүүн хоёуланд.
 *
 * ⚠️ `PlanModal`-ийн CSS ангиудыг ДАХИН ашиглана: хоёр өөр загвартай цонх нь
 *    нэг хуудсанд танигдахгүй болно.
 */
export function FlowBox({
  title, desc, label, okText, rejectText, busy, err, text, onText, onPreview, onClose, onOk, onReject,
}: {
  title: string; desc: string; label: string; okText: string;
  rejectText?: string; busy: boolean;
  /** ⚠️ Текст ЭЦЭГТ хадгалагдана — ард нь дарж/Esc-ээр хаахад устахгүй (2026-09-23) */
  text: string;
  onText: (v: string) => void;
  /** Шийдвэрлэх цонхны «Урьдчилан харах» — өгөгдсөн үед л товч гарна */
  onPreview?: () => void;
  /**
   * ⚠️ АЛДААГ ЦОНХ ДОТОР (2026-09-21). Урсгалын алдаанууд (`setErr`: тэнцээгүй
   *    задаргаа, эрхгүй, агуулга уншигдсангүй, төрөл зөрсөн, зэрэгцээ өөрчлөлт)
   *    цонхыг хаадаггүй тул хуудасны баннер модалын АРД гарч, хэрэглэгч товч
   *    дарсан атлаа юу ч болоогүй мэт хардаг байв. Хуудасны баннер хэвээр —
   *    цонх хаагдсаны дараа ч уншигдана.
   */
  err?: string;
  onClose: () => void;
  onOk: (text: string) => void;
  onReject?: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  const txt = text;
  const setTxt = onText;
  /* ⚠️ Esc → хаах (2026-09-23), `PlanModal`-тай ижил. Хуудасны нийтлэг Esc нь
     `[role=dialog]` нээлттэй үед юу ч хийдэггүй тул энд өөрөө барина. */
  /* ⚠️ 2026-10-06 аудит: ЯВЦЫН ДУНД (`busy`) ХААХГҮЙ — Esc · ард товших · «×» гурвуулаа.
     Урьд нь илгээх/шийдвэрлэх хүсэлт явж байхад цонх хаагдаж, алдаа гарвал түүнийг
     харуулах цонх (`err`) алга болсон байдаг байв. Ref-ээр — сонсогч `busy` бүрд
     дахин бүртгэгдэхгүй. */
  const busyRef = useLatest(busy);
  const close = () => { if (!busyRef.current) onClose(); };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, busyRef]);
  /* ⚠️ 2026-10-06 аудит: Enter → үндсэн товч (`onOk`), `PlanModal`-тай ижил. Тайлбарын
     `textarea` дотор Enter нь ШИНЭ МӨР хэвээр; товч дээрх Enter нь тэр товчийг дарна. */
  const onEnter = (e: KEvt<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented || e.nativeEvent.isComposing || busy) return;
    if ((e.target as HTMLElement).closest('textarea, button, select, a, input')) return;
    e.preventDefault();
    onOk(txt);
  };
  return (
    <div className={h.mdBack} role="presentation" onClick={close}>
      <div ref={ref} className={h.md} role="dialog" aria-modal="true"
        onKeyDown={onEnter}
        onClick={(e) => e.stopPropagation()}>
        <header className={h.mdHead}>
          <b className={h.mdWork}>{title}</b>
          <button type="button" className={h.mdX} onClick={close} disabled={busy} aria-label={tr('Хаах')}>×</button>
        </header>
        <p className={h.note}>{desc}</p>
        {err && <p className={h.err} role="alert">{err}</p>}
        <label className={h.mdField}>
          {label}
          <textarea
            className={h.flowText}
            rows={3}
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            disabled={busy}
            /* ⚠️ Талбар 2048 — хэтэрвэл `applyEdits` бүхэлдээ унана (2026-09-29) */
            maxLength={REASON_MAX}
          />
        </label>
        <div className={h.mdFoot}>
          {onPreview && (
            <button type="button" className={h.discard} disabled={busy} onClick={onPreview}>
              {tr('Урьдчилан харах')}
            </button>
          )}
          <span className={h.spacer} />
          {onReject && (
            <button
              type="button"
              className={h.discard}
              disabled={busy || !txt.trim()}
              title={txt.trim() ? undefined : tr('Буцаах шалтгааныг бичнэ үү.')}
              onClick={() => onReject(txt)}
            >
              {rejectText}
            </button>
          )}
          <button type="button" className={h.save} disabled={busy} onClick={() => onOk(txt)}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}
