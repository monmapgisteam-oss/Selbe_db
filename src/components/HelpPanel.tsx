'use client';

/**
 * ПОРТАЛЫН ТУСЛАМЖ — «?» товчоор нээгдэх цонх (2026-09-30).
 *
 * ⚠️ ЯАГААД: 23 харагдацын нэр («Гүйцэтгэл» · «Багцын гүйцэтгэл», «Чанар
 *    (QAQC)» · «Чанарын баримт») ойролцоо тул барилгын ажилтан аль нь өөрт нь
 *    хэрэгтэйг таамаглаж, буруу хуудас нээдэг байв. Энд хэрэглэгчийн ЭРХЭНД
 *    байгаа харагдац бүрийг ажлын төрлөөр (`NAV_GROUPS`) бүлэглэж, «юунд
 *    зориулсан» (`VIEWS.desc`) ба «хэн ашигладаг» (`WHO`) гэж нэг мөрөөр хэлнэ.
 *
 * ⚠️ `WHO` нь `Record<ViewKey, …>` — шинэ харагдац нэмэгдэхэд tsc энд
 *    заавал мөр нэмүүлнэ (тусламж хоцрохгүй).
 *
 * ⚠️ Анх орсон хүнд НЭГ УДАА «?» товчийг заасан зөвлөмж (`HelpTip`) гарна —
 *    localStorage-д тэмдэглэнэ. Хувийн горимд localStorage шиддэг тул
 *    try/catch; уншиж чадахгүй бол зөвлөмж ХАРУУЛАХГҮЙ (давтан гарахаас сэргийлнэ).
 */

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { NAV_GROUPS, VIEWS, VIEW_BY_KEY, ALL_MODE_HIDE, type ViewKey } from '@/lib/services';
import { Icon } from './Icon';
import s from './help.module.css';

/** Харагдац бүрийг голчлон хэн ашигладаг — энгийн үгээр */
const WHO: Record<ViewKey, () => string> = {
  gdash: () => tr('Удирдлага ба бүх ажилтан'),
  dashboard: () => tr('Удирдлага, төлөвлөлтийн мэргэжилтэн'),
  plan: () => tr('Төлөвлөлтийн мэргэжилтэн, инженерүүд'),
  pkgFin: () => tr('Санхүүгийн хэлтэс, удирдлага'),
  pkgProg: () => tr('Удирдлага, багцын менежер, хяналтын инженер'),
  gazar: () => tr('Газар чөлөөлөлтийн баг'),
  analysis: () => tr('Төлөвлөлтийн мэргэжилтэн'),
  irged: () => tr('Удирдлага, олон нийттэй харилцах баг'),
  huvaari: () => tr('Гүйцэтгэгч компани, багцын менежер'),
  huvaariBatlah: () => tr('Хуваарь батлах эрхтэй менежер'),
  ajilBatlah: () => tr('Нэмэлт ажил батлах эрхтэй менежер'),
  tailan: () => tr('Удирдлага, тайлан бэлтгэгч'),
  tuh: () => tr('Төслийн удирдлагын хэсэг, удирдлага'),
  finance: () => tr('Санхүүгийн хэлтэс'),
  habea: () => tr('ХАБЭА-н ажилтан, талбайн хяналт'),
  iot: () => tr('Инженерүүд, хяналтын баг'),
  ersdel: () => tr('Инженерүүд, удирдлага'),
  dedButets: () => tr('Инженерийн шугам сүлжээний инженер'),
  zovshoorol: () => tr('Зөвшөөрөл хариуцсан ажилтан, удирдлага'),
  guitsetgel: () => tr('Гүйцэтгэгч, хяналтын инженер, менежер'),
  qaqc: () => tr('Чанарын инженер'),
  chanar: () => tr('Гүйцэтгэгч, чанарын хэлтэс, хянагчид'),
  schem: () => tr('Удирдлага, шинэ ажилтан'),
  sysdoc: () => tr('Админ, өгөгдөл хариуцагч'),
};

export function HelpPanel({
  open,
  onClose,
  navScope,
  view,
  onGo,
}: {
  open: boolean;
  onClose: () => void;
  navScope: 'all' | ViewKey[];
  /** Одоо нээлттэй харагдац — жагсаалтад тодруулна */
  view: ViewKey;
  /** Харагдац руу шилжих — `Portal.setView` (хадгалаагүй ажлын хамгаалалттай) */
  onGo: (v: ViewKey) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  /*
   * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ХААХАД ФОКУС «?» ТОВЧ РУУ.
   *    `useFocusTrap` нь нээхийн өмнөх фокусыг буцаадаг ч анхны зөвлөмжөөс (`HelpTip`)
   *    нээхэд тэр товч устсан байдаг тул фокус `<body>`-д унаж, гарын хэрэглэгч
   *    «хаана байгаагаа» алддаг байв. Нээх товч нь `aria-haspopup="dialog"` +
   *    `aria-expanded="true"` (Portal) — нээгдсэн агшинд түүнийг олж, хаахад
   *    (Esc · ✕ · фон · хэсэг сонгох) тэр рүү буцаана. Олдохгүй бол `useFocusTrap`-ийнх хэвээр.
   *    Энэ эффект `useFocusTrap`-ийн ДАРАА зарлагдсан тул цэвэрлэгээ нь сүүлд ажиллана.
   */
  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.querySelector<HTMLElement>('button[aria-haspopup="dialog"][aria-expanded="true"]');
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const shown = new Set(
    (navScope === 'all' ? VIEWS.filter((v) => !ALL_MODE_HIDE.includes(v.key)) : VIEWS.filter((v) => navScope.includes(v.key)))
      .map((v) => v.key),
  );
  const covered = new Set(NAV_GROUPS.flatMap((g) => g.views));
  const groups = [
    ...NAV_GROUPS.map((g) => ({ id: g.id as string, title: g.title, views: g.views.filter((k) => shown.has(k)) })),
    { id: 'other', title: tr('Бусад'), views: [...shown].filter((k) => !covered.has(k)) },
  ].filter((g) => g.views.length > 0);

  return (
    <div className={s.backdrop} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref}
        className={s.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="selbe-help-title"
      >
        <header className={s.head}>
          <div>
            <h2 id="selbe-help-title" className={s.title}>{tr('Порталын хэсгүүд')}</h2>
            <p className={s.lede}>
              {tr('Танд нээлттэй хэсэг бүр юунд зориулагдсан, хэн ашигладгийг доор харуулав. Нэр дээр дарж шууд очно.')}
            </p>
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label={tr('Хаах')}>✕</button>
        </header>

        <div className={s.body}>
          {groups.map((g) => (
            <section key={g.id} className={s.group} aria-label={g.title}>
              <h3 className={s.groupTitle}>{g.title}</h3>
              <ul className={s.list}>
                {g.views.map((k) => {
                  const v = VIEW_BY_KEY[k];
                  const on = k === view;
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        className={`${s.row} ${on ? s.rowOn : ''}`}
                        aria-current={on ? 'page' : undefined}
                        onClick={() => { onClose(); onGo(k); }}
                      >
                        <span className={s.icon} aria-hidden><Icon name={v.icon} /></span>
                        <span className={s.text}>
                          <span className={s.name}>
                            {v.title}
                            {on && <span className={s.here}>{tr('одоо энд байна')}</span>}
                          </span>
                          <span className={s.desc}>{v.desc}</span>
                          <span className={s.who}>{tr('Хэн ашиглах:')} {WHO[k]()}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className={s.foot}>
            {tr('Эрх хүрэхгүй хэсэг хэрэгтэй бол админд хандана уу. Цэсний улаан тоо нь таныг хүлээж буй зүйлийн тоо.')}
          </p>
        </div>
      </div>
    </div>
  );
}

const TIP_KEY = 'selbe-help-tip-seen';

/**
 * АНХНЫ ОРОЛТЫН ЗӨВЛӨМЖ — толгойн «?» товчийг заана. Нэг л удаа.
 */
export function HelpTip({ onOpen }: { onOpen: () => void }) {
  /* ⚠️ Lazy init — Portal нь `ssr:false` тул энд үргэлж хөтөч (localStorage бий) */
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem(TIP_KEY); } catch { return false; /* хувийн горим */ }
  });
  const done = () => {
    setShow(false);
    try { localStorage.setItem(TIP_KEY, '1'); } catch { /* хувийн горим */ }
  };
  if (!show) return null;
  return (
    <div className={s.tip} role="status">
      <span className={s.tipArrow} aria-hidden />
      <p className={s.tipText}>
        {tr('Шинээр орж байна уу? «?» товчоос хэсэг бүр юунд зориулагдсаныг харна уу.')}
      </p>
      <div className={s.tipActions}>
        <button type="button" className={s.tipPrimary} onClick={() => { done(); onOpen(); }}>
          {tr('Тусламж нээх')}
        </button>
        <button type="button" className={s.tipGhost} onClick={done}>{tr('Ойлголоо')}</button>
      </div>
    </div>
  );
}
