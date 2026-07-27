'use client';

import { useEffect, useState } from 'react';
import { DOCS, docUrl } from '@/lib/docs';
import { Icon } from './Icon';
import s from './docviewer.module.css';

/**
 * ТЭЗҮ БА СУДАЛГААНЫ БАРИМТ — глобал popup (модал).
 *
 * Навбарын «ТЭЗҮ» товчоор нээгдэж, порталын аль ч харагдац дээр давхарлана
 * (`position: fixed`). Зүүн талд баримтын жагсаалт (солих хэсэг), баруун талд
 * сонгосон PDF-ийг браузерын уугуул харагчаар (`<iframe>`) бүрэн үзүүлнэ —
 * томруулах, хуудсаар алхах, татах, хэвлэх бүгд бэлэн.
 */
export function DocViewer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [active, setActive] = useState(DOCS[0].key);

  // ⚠️ Escape-ээр хаах + нээлттэй үед фоны гүйлгэлтийг түгжих.
  //    Эффектийг нөхцөлт дуудахгүй (hook дүрэм) — дотор нь `open`-оор шалгана.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const doc = DOCS.find((d) => d.key === active) ?? DOCS[0];

  return (
    <div className={s.overlay} onClick={onClose} role="presentation">
      <div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="ТЭЗҮ ба судалгааны баримт бичиг"
      >
        <header className={s.head}>
          <span className={s.headIcon}><Icon name="file" size={17} /></span>
          <h2 className={s.title}>ТЭЗҮ ба судалгааны баримт бичиг</h2>
          <button type="button" className={s.close} onClick={onClose} aria-label="Хаах">✕</button>
        </header>

        <div className={s.body}>
          {/* Зүүн — баримт солих жагсаалт */}
          <nav className={s.side} aria-label="Баримтууд">
            {DOCS.map((d) => {
              const on = d.key === active;
              return (
                <button
                  key={d.key}
                  type="button"
                  aria-current={on}
                  className={`${s.item} ${on ? s.itemOn : ''}`}
                  onClick={() => setActive(d.key)}
                >
                  <span className={s.itemIcon}><Icon name="file" size={15} /></span>
                  <span className={s.itemText}>
                    <span className={s.itemTitle}>{d.title}</span>
                    <span className={s.itemSub}>{d.sub}</span>
                  </span>
                </button>
              );
            })}

            <a
              className={s.openNew}
              href={docUrl(doc)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Шинэ таб-д нээх ↗
            </a>
          </nav>

          {/* Баруун — сонгосон PDF (уугуул харагч). `key` нь баримт солиход
              iframe-ыг бүрэн шинэчилж, зарим браузерын кэш асуудлаас сэргийлнэ. */}
          <div className={s.viewer}>
            <iframe
              key={doc.key}
              className={s.frame}
              src={docUrl(doc)}
              title={doc.title}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
