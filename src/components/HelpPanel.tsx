'use client';

/**
 * ПОРТАЛЫН ТУСЛАМЖ — «?» товчоор нээгдэх цонх (2026-09-30).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { isTopFocusTrap, useFocusTrap } from '@/lib/useFocusTrap';
import { NAV_GROUPS, VIEWS, VIEW_BY_KEY, ALL_MODE_HIDE, roleForUser, type ViewKey } from '@/lib/services';
import { resolveFlowStage } from '@/lib/guitsetgelAcl';
import { buildLabel } from '@/lib/buildInfo';
import { Icon } from './Icon';
import s from './help.module.css';

/** Харагдац бүрийг голчлон хэн ашигладаг — энгийн үгээр */
const WHO: Record<ViewKey, () => string> = {
  gdash: () => tr('Удирдлага ба бүх ажилтан'),
  dashboard: () => tr('Удирдлага, төлөвлөлтийн мэргэжилтэн'),
  plan: () => tr('Төлөвлөлтийн мэргэжилтэн, инженерүүд'),
  hesegET: () => tr('Төлөвлөлтийн мэргэжилтэн, инженерүүд'),
  pkgFin: () => tr('Санхүүгийн хэлтэс, удирдлага'),
  pkgProg: () => tr('Удирдлага, багцын ахлах инженер, хяналтын инженер'),
  gazar: () => tr('Газар чөлөөлөлтийн баг'),
  analysis: () => tr('Төлөвлөлтийн мэргэжилтэн'),
  irged: () => tr('Удирдлага, олон нийттэй харилцах баг'),
  huvaari: () => tr('Гүйцэтгэгч компани, багцын ахлах инженер'),
  huvaariBatlah: () => tr('Хуваарь батлах эрхтэй менежер'),
  ajilBatlah: () => tr('Нэмэлт ажил батлах эрхтэй менежер'),
  tailan: () => tr('Удирдлага, тайлан бэлтгэгч'),
  tuh: () => tr('Төслийн удирдлагын хэсэг, удирдлага'),
  bagtsHamaaral: () => tr('Төслийн удирдлагын хэсэг, багцын ахлах инженер'),
  finance: () => tr('Санхүүгийн хэлтэс'),
  zuragTosol: () => tr('Зураг төсөл хариуцсан инженер'),
  tuvshin6: () => tr('Төлөвлөлтийн ахлах инженер, удирдлага'),
  habea: () => tr('ХАБЭА-н ажилтан, талбайн хяналт'),
  iot: () => tr('Инженерүүд, хяналтын баг'),
  ersdel: () => tr('Инженерүүд, удирдлага'),
  dedButets: () => tr('Инженерийн шугам сүлжээний инженер'),
  zovshoorol: () => tr('Зөвшөөрөл хариуцсан ажилтан, удирдлага'),
  guitsetgel: () => tr('Гүйцэтгэгч, хяналтын инженер, менежер'),
  ma: () => tr('Чанарын хэлтэс, хяналтын инженер'),
  schem: () => tr('Удирдлага, шинэ ажилтан'),
  sysdoc: () => tr('Админ, өгөгдөл хариуцагч'),
};

/**
 * «ХЭРХЭН…» — АЛХАМ АЛХМААР ЗААВАР (2026-10-23, UX аудит S18).
 */
const HOWTO: { id: string; view: ViewKey; title: () => string; steps: (full: boolean) => string[] }[] = [
  {
    id: 'fill',
    view: 'guitsetgel',
    title: () => tr('Гүйцэтгэл бөглөж илгээх'),
    steps: () => [
      tr('«Гүйцэтгэл» хэсгийг нээж «Гүйцэтгэл бөглөх» табаас багцаа сонгоно.'),
      tr('«Бөглөх» дарж засах горимыг нээгээд нүдэнд гүйцэтгэлийн хувь эсвэл обьём бичнэ — ноорог автоматаар хадгалагдана, хуудсаа хаасан ч алдагдахгүй.'),
      tr('Бөглөж дуусмагц «Дуусгах» дарж бэлэн байдлыг шалгуулна — ингэснээр «Илгээх» идэвхжинэ.'),
      tr('«Илгээх» дарна. Илгээсний дараа хяналт дуустал тэр хуудсыг засах боломжгүй.'),
      tr('Хамтран бөглөгч байвал тэр «Дуусгасан» дарсны дараа илгээлт хяналтад орно.'),
    ],
  },
  {
    id: 'review',
    view: 'guitsetgel',
    title: () => tr('Илгээсэн гүйцэтгэл 7 шатаар батлагдах'),
    steps: (full) => full ? [
      tr('Дараалал: гүйцэтгэгч → хяналтын инженер → багцын ахлах инженер → төлөвлөлтийн инженер → төлөвлөлтийн ахлах инженер → хэлтсийн дарга → газрын дарга.'),
      tr('Хянагч бүр «Батлах ажил» табаас нүд бүрийг шалгаж зөвшөөрнө эсвэл шалтгаантай буцаана.'),
      tr('Газрын дарга зөвшөөрсний дараа л гүйцэтгэл үндсэн өгөгдөлд бүртгэгдэнэ.'),
      tr('Явцыг «Илгээсэн ажил» табаас харна.'),
    ] : [
      tr('Илгээлт 7 шатаар хянагдана — эхлээд хяналтын инженер шалгана.'),
      tr('Буцаавал «Илгээсэн ажил» табд шалтгаантай нь ирнэ.'),
      tr('Эцсийн шат зөвшөөрсний дараа л гүйцэтгэл үндсэн өгөгдөлд бүртгэгдэнэ.'),
      tr('Явцыг «Илгээсэн ажил» табаас харна.'),
    ],
  },
  {
    id: 'fix',
    view: 'guitsetgel',
    title: () => tr('Буцаасан гүйцэтгэлийг засах'),
    steps: () => [
      tr('Цэсний улаан тоо буцаасан илгээлт байгааг илтгэнэ.'),
      tr('«Илгээсэн ажил» табаас «Буцаасан» шүүлтээр олж, буцаасан шалтгааныг уншина.'),
      tr('«Гүйцэтгэл бөглөх» табд тэр багцыг нээж засаад дахин «Илгээх» дарна.'),
    ],
  },
  {
    id: 'plan',
    view: 'huvaari',
    title: () => tr('Хуваарь чирж төлөвлөх'),
    steps: () => [
      tr('«Хуваарь» хэсгийн дээд талаас багц, бүлгээ сонгоно.'),
      tr('Доод хуанли дээр ажлын мөрийн ард чирж хугацааны муж татна, голоос нь чирж зөөнө, ирмэгээс нь татаж уртасгана.'),
      tr('Өөрчлөлт ноорог болж хадгалагдана. Дуусаад «Батлуулах» → «Илгээх» дарна — батлагдтал эх хуваарь хөдлөхгүй.'),
    ],
  },
  {
    id: 'extra',
    view: 'huvaari',
    title: () => tr('Нэмэлт ажил нэмж батлуулах'),
    steps: () => [
      tr('«Хуваарь» хэсэгт бүлгийн мөрийн «+» (бүлэгт ажил нэмэх) товчоор шинэ ажлын мөр нэмнэ.'),
      tr('«Нэмэлт ажил батлуулах» дарж илгээнэ — батлагдтал үндсэн өгөгдөлд бичигдэхгүй.'),
      tr('Эрхтэй менежер «Нэмэлт ажил батлах» хэсгээс баталж эсвэл шалтгаантай буцаана.'),
    ],
  },
  {
    id: 'report',
    view: 'tailan',
    title: () => tr('Тайлан татах'),
    steps: () => [
      tr('«Тайлан» хэсгийг нээнэ.'),
      tr('«PDF татах» дарвал файл татагдана; «Outlook-оор илгээх» дарвал PDF хавсаргасан мэйл нээгдэнэ.'),
    ],
  },
];

export function HelpPanel({
  open,
  onClose,
  navScope,
  view,
  onGo,
  user,
}: {
  open: boolean;
  user?: string | null;
  onClose: () => void;
  navScope: 'all' | ViewKey[];
  /** Одоо нээлттэй харагдац — жагсаалтад тодруулна */
  view: ViewKey;
  /** Харагдац руу шилжих — `Portal.setView` (хадгалаагүй ажлын хамгаалалттай) */
  onGo: (v: ViewKey) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.querySelector<HTMLElement>('button[aria-haspopup="dialog"][aria-expanded="true"]');
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && isTopFocusTrap(ref.current)) onClose(); };
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
  const howto = HOWTO.filter((h) => shown.has(h.view));
  const fullFlow = resolveFlowStage(user, roleForUser(user)).stage !== 'company';

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
          {howto.length > 0 && (
            <section className={s.group} aria-labelledby="selbe-help-howto">
              <h3 id="selbe-help-howto" className={s.groupTitle}>{tr('Хэрхэн хийх вэ — алхам алхмаар')}</h3>
              <div className={s.howList}>
                {howto.map((h) => (
                  <details key={h.id} className={s.how}>
                    <summary className={s.howSum}>{h.title()}</summary>
                    <ol className={s.howSteps}>
                      {h.steps(fullFlow).map((st, i) => <li key={i}>{st}</li>)}
                    </ol>
                    {h.view !== view && (
                      <button type="button" className={s.howGo} onClick={() => { onClose(); onGo(h.view); }}>
                        {tr('«{0}» хэсгийг нээх', VIEW_BY_KEY[h.view].title)}
                      </button>
                    )}
                  </details>
                ))}
              </div>
            </section>
          )}
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
          <p className={s.foot}>{tr('Хувилбар: {0}', buildLabel())}</p>
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
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem(TIP_KEY); } catch { return false; /* хувийн горим */ }
  });
  const tipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!show) return undefined;
    try { localStorage.setItem(TIP_KEY, '1'); } catch { /* хувийн горим */ }
    const timer = setTimeout(() => setShow(false), 15000);
    const onDown = (e: PointerEvent) => {
      if (!tipRef.current?.contains(e.target as Node)) setShow(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', onDown); };
  }, [show]);
  const done = () => {
    const hadFocus = tipRef.current?.contains(document.activeElement) ?? false;
    setShow(false);
    try { localStorage.setItem(TIP_KEY, '1'); } catch { /* хувийн горим */ }
    if (hadFocus) document.querySelector<HTMLElement>('header button[aria-haspopup="dialog"]')?.focus();
  };
  const [arrowRight, setArrowRight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!show) return undefined;
    const place = () => {
      const q = document.querySelector<HTMLElement>('header button[aria-haspopup="dialog"]');
      const tip = tipRef.current;
      if (!q || !tip) { setArrowRight(null); return; }
      const qr = q.getBoundingClientRect();
      const tr0 = tip.getBoundingClientRect();
      const r = tr0.right - (qr.left + qr.width / 2) - 6;
      setArrowRight(Math.max(8, Math.min(tr0.width - 20, r)));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [show]);
  if (!show) return null;
  return (
    <div ref={tipRef} className={s.tip} role="status">
      <span className={s.tipArrow} style={arrowRight == null ? undefined : { right: arrowRight }} aria-hidden />
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
