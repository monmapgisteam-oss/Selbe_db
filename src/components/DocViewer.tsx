'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { DOCS, docUrl, isExternalDoc } from '@/lib/docs';
import { isTopFocusTrap, useFocusTrap } from '@/lib/useFocusTrap';
import { Icon } from './Icon';
import { ENT_KEY, EntDocFrame } from './EntDocs';
import { DocLibSide } from './DocLibSide';
import s from './docviewer.module.css';

/**
 * БАРИМТ БИЧГИЙН САН — глобал popup (модал). 2026-10-23: бүлэглэсэн сан (`DocLibSide`, `lib/docLib.ts`) —
 * хуучин «ТЭЗҮ-БОНУ» жагсаалт «ТЭЗҮ-БОНУ» бүлэгт шилжсэн.
 *
 * Навбарын «ТЭЗҮ» товчоор нээгдэж, порталын аль ч харагдац дээр давхарлана
 * (`position: fixed`). Зүүн талд баримтын жагсаалт (солих хэсэг), баруун талд
 * сонгосон PDF-ийг браузерын уугуул харагчаар (`<iframe>`) бүрэн үзүүлнэ —
 * томруулах, хуудсаар алхах, татах, хэвлэх бүгд бэлэн.
 */

/**
 * НАРИЙН ДЭЛГЭЦ (≤720px) — CSS-ийн `@media (max-width: 720px)`-тэй ИЖИЛ хил.
 */
const NARROW = '(max-width: 720px)';
const subNarrow = (fn: () => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const m = window.matchMedia(NARROW);
  m.addEventListener('change', fn);
  return () => m.removeEventListener('change', fn);
};
const isNarrow = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches;

export function DocViewer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [active, setActive] = useState<string | null>(null);
  const narrow = useSyncExternalStore(subNarrow, isNarrow, () => false);
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isTopFocusTrap(modalRef.current)) onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const doc = active == null ? null : (DOCS.find((d) => d.key === active) ?? null);
  const entId = active?.startsWith(ENT_KEY) ? active.slice(ENT_KEY.length) : null;

  return (
    <div className={s.overlay} onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tr('Баримт бичгийн сан')}
      >
        <header className={s.head}>
          <span className={s.headIcon}><Icon name="file" size={17} /></span>
          <h2 className={s.title}>{tr('Баримт бичгийн сан')}</h2>
          <button type="button" className={s.close} onClick={onClose} aria-label={tr('Хаах')}>✕</button>
        </header>

        <div className={s.body}>
          {/* Зүүн — баримт солих жагсаалт */}
          <nav className={s.side} aria-label={tr('Баримтууд')}>
            <DocLibSide active={active} onPick={setActive} />

            {doc && (
              <a
                className={s.openNew}
                href={docUrl(doc)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {tr('Шинэ таб-д нээх ↗')}
              </a>
            )}
          </nav>

          {/* Баруун — сонгосон PDF (уугуул харагч). `key` нь баримт солиход
              iframe-ыг бүрэн шинэчилж, зарим браузерын кэш асуудлаас сэргийлнэ. */}
          <div className={s.viewer}>
            {entId ? (
              <EntDocFrame id={entId} narrow={narrow} />
            ) : !doc ? (
              <div className={s.ext}>
                <p className={s.pick}>{tr('Үзэх баримтаа жагсаалтаас сонгоно уу.')}</p>
              </div>
            ) : isExternalDoc(doc) || narrow ? (
              <div className={s.ext}>
                <a
                  className={s.extBtn}
                  href={docUrl(doc)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {(isExternalDoc(doc) ? doc.cta : undefined) ?? tr('{0} — шинэ таб-д нээх ↗', doc.title)}
                </a>
              </div>
            ) : (
              <iframe
                key={doc.key}
                className={s.frame}
                src={docUrl(doc)}
                title={doc.title}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
