'use client';

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { DOCS, docUrl, isExternalDoc } from '@/lib/docs';
import { useFocusTrap } from '@/lib/useFocusTrap';
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
  const modalRef = useRef<HTMLDivElement>(null);

  /* ⚠️ ФОКУСЫН УРХИ (`useFocusTrap`) — `aria-modal="true"` нь зөвхөн дэлгэц
     уншигчид зориулагдсан бөгөөд ХӨТЧИЙН Tab-д нөлөөгүй: урхигүй үед Tab
     дарсаар байхад фокус модалаас гарч, ард байгаа порталын товч, хүснэгтийн
     нүд рүү шилждэг байв. Мөн хаахад фокусыг нээсэн товч («ТЭЗҮ») дээр нь
     буцаана — эс тэгвээс Tab хуудасны эхнээс дахин эхэлнэ. */
  useFocusTrap(modalRef, open);

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
        ref={modalRef}
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tr('ТЭЗҮ ба судалгааны баримт бичиг')}
      >
        <header className={s.head}>
          <span className={s.headIcon}><Icon name="file" size={17} /></span>
          <h2 className={s.title}>{tr('ТЭЗҮ ба судалгааны баримт бичиг')}</h2>
          <button type="button" className={s.close} onClick={onClose} aria-label={tr('Хаах')}>✕</button>
        </header>

        <div className={s.body}>
          {/* Зүүн — баримт солих жагсаалт */}
          <nav className={s.side} aria-label={tr('Баримтууд')}>
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
              {tr('Шинэ таб-д нээх ↗')}
            </a>
          </nav>

          {/* Баруун — сонгосон PDF (уугуул харагч). `key` нь баримт солиход
              iframe-ыг бүрэн шинэчилж, зарим браузерын кэш асуудлаас сэргийлнэ. */}
          <div className={s.viewer}>
            {/*
              * ⚠️ ГАДААД баримтыг `<iframe>`-д ТАВИХГҮЙ (2026-09-10):
              * SharePoint/OneDrive нь `X-Frame-Options`-оор дотоод хүрээг
              * хаадаг тул хоосон цагаан талбай л гарна. Оронд нь шинэ таб-д
              * нээх ТОВЧ — юу болсныг ил хэлж, нэг товшилтоор нээгдэнэ.
              */}
            {isExternalDoc(doc) ? (
              <div className={s.ext}>
                {/* ⚠️ Тайлбар мөр ХАСАГДСАН (2026-09-10, хэрэглэгчийн заавар):
                    товч өөрөө юу болохыг хэлж байгаа тул дээрх өгүүлбэр нь
                    зөвхөн техникийн шалтгаан тоочсон давхардал байв. */}
                <a
                  className={s.extBtn}
                  href={docUrl(doc)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {doc.cta ?? tr('{0} — шинэ таб-д нээх ↗', doc.title)}
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
