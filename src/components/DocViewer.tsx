'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { DOCS, docUrl, isExternalDoc } from '@/lib/docs';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { Icon } from './Icon';
import { ENT_KEY, EntDocFrame, EntDocsSide } from './EntDocs';
import s from './docviewer.module.css';

/**
 * ТЭЗҮ БА СУДАЛГААНЫ БАРИМТ — глобал popup (модал).
 *
 * Навбарын «ТЭЗҮ» товчоор нээгдэж, порталын аль ч харагдац дээр давхарлана
 * (`position: fixed`). Зүүн талд баримтын жагсаалт (солих хэсэг), баруун талд
 * сонгосон PDF-ийг браузерын уугуул харагчаар (`<iframe>`) бүрэн үзүүлнэ —
 * томруулах, хуудсаар алхах, татах, хэвлэх бүгд бэлэн.
 */

/**
 * НАРИЙН ДЭЛГЭЦ (≤720px) — CSS-ийн `@media (max-width: 720px)`-тэй ИЖИЛ хил.
 * ⚠️ 2026-10-06 (аудит): гар утсанд 168px жагсаалт iframe-ийн хажууд үлдэж PDF ~150px өргөнтэй
 *    болдог, мөн гар утасны хөтчүүд PDF iframe-ийг муу (эхний хуудас л, эсвэл хоосон) зурдаг.
 *    Тиймээс нарийн дэлгэцэд жагсаалт ДЭЭР овоологдож, iframe-ийн ОРОНД «шинэ таб-д нээх» товч.
 * ⚠️ Сервер/тест (window-гүй) дээр `false` — hydration зөрөхгүй (эхний зураг iframe-гүй тул).
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
  /* ⚠️ 2026-10-06 (аудит): анхдагч СОНГОЛТГҮЙ (`null`). Урьд нь `DOCS[0]` сонгогдсон байдлаар нээгдэж
     iframe нь 22 MB `tezu-rev-01.pdf`-ийг шууд татдаг байв (зөвхөн жагсаалт харах гэсэн ч, гар утсанд
     ч). Одоо iframe-ийн `src` нь хэрэглэгч баримт СОНГОСНЫ дараа л тавигдана. */
  const [active, setActive] = useState<string | null>(null);
  const narrow = useSyncExternalStore(subNarrow, isNarrow, () => false);
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

  const doc = active == null ? null : (DOCS.find((d) => d.key === active) ?? null);
  /* ⚠️ 2026-10-08 (туршилт): `ent:<id>` = Enterprise геопорталын PDF item (`EntDocs.tsx`) */
  const entId = active?.startsWith(ENT_KEY) ? active.slice(ENT_KEY.length) : null;

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

            <EntDocsSide active={active} onPick={setActive} />

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
            {/*
              * ⚠️ ГАДААД баримтыг `<iframe>`-д ТАВИХГҮЙ (2026-09-10):
              * SharePoint/OneDrive нь `X-Frame-Options`-оор дотоод хүрээг
              * хаадаг тул хоосон цагаан талбай л гарна. Оронд нь шинэ таб-д
              * нээх ТОВЧ — юу болсныг ил хэлж, нэг товшилтоор нээгдэнэ.
              */}
            {entId ? (
              <EntDocFrame id={entId} narrow={narrow} />
            ) : !doc ? (
              <div className={s.ext}>
                <p className={s.pick}>{tr('Үзэх баримтаа жагсаалтаас сонгоно уу.')}</p>
              </div>
            ) : isExternalDoc(doc) || narrow ? (
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
                  {/* ⚠️ 2026-10-06: нарийн дэлгэцийн дотоод PDF-д `cta` (гадаад холбоосын текст) хамаарахгүй */}
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
