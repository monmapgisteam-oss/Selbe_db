'use client';

/**
 * ЗӨВШӨӨРӨЛ — багц бүрийн зөвшөөрлүүдийг ШАТ ДАРААЛЛААР харуулах харагдац.
 *
 * ⚠️ Багц бүр өөрийн гинжтэй: 1 → 2 → 3 … Товч бүр нэг зөвшөөрөл.
 *   ✅ Зөвшөөрсөн · ⏳ Хүлээгдэж буй · 🔴 Зөвшөөрөөгүй (АНИВЧИНА)
 *
 * ⚠️ Анивчих нь зөвхөн «Зөвшөөрөөгүй»-д. Хүлээгдэж буй нь хэвийн явц тул
 * анивчуулбал бүх дэлгэц анивчиж, жинхэнэ асуудал нүднээс мултарна.
 *
 * ⚠️ ҮЙЛЧИЛГЭЭ ХОЛБОГДООГҮЙ үед хоосон жагсаалт БИШ, «холбогдоогүй» гэсэн
 * тодорхой мессеж гарна — эс бөгөөс «зөвшөөрөл байхгүй» гэж уншигдана.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  URL as ZOV_URL, TOLOV, byBagts, loadZov, summarize, type Zov, type ZovDraft,
} from '@/lib/zovshoorol';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import { ZovshoorolEdit } from './ZovshoorolEdit';
import s from './zovshoorol.module.css';

/**
 * ТӨЛӨВИЙН БИЧВЭР.
 *
 * ⚠️ `z.tolov` нь ArcGIS-ээс ирдэг МОНГОЛ мөр тул түүхийгээр нь зурвал англи
 * горимд «Status | Хүлээгдэж буй» гэсэн ХОЛИМОГ мөр гардаг байв. `tr(z.tolov)`
 * гэсэн ДИНАМИК дуудлага ч хангалтгүй: `i18n-extract` нь зөвхөн статик
 * `tr('…')`-ыг олдог тул `en.ts`-д түлхүүр орхигдож, «Зөвшөөрөөгүй» нь ХЭЗЭЭ Ч
 * орчуулагдахгүй үлдэнэ. Тиймээс гурвуулан ИЛ бичигдэнэ.
 */
const TOLOV_TEXT: Record<Zov['tolov'], string> = {
  [TOLOV.wait]: tr('Хүлээгдэж буй'),
  [TOLOV.ok]: tr('Зөвшөөрсөн'),
  [TOLOV.no]: tr('Зөвшөөрөөгүй'),
  unknown: tr('танигдаагүй'),
};

/** Шинэ зөвшөөрлийн хоосон ноорог — багц нь урьдчилан бөглөгдсөн. */
const blank = (bagts: string, shat: number): ZovDraft => ({
  bagts, shat, ner: '', selbe: '', tolov: TOLOV.wait,
  ognoo: null, dugaar: '', baiguullaga: '', hariutsagch: '', tailbar: '',
});

const dt = (ms: number | null): string => {
  if (ms == null) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

const ICON: Record<string, string> = {
  [TOLOV.ok]: '✓',
  [TOLOV.wait]: '⏳',
  [TOLOV.no]: '!',
};

function Chip({ z, onPick }: { z: Zov; onPick: (z: Zov) => void }) {
  const cls = z.tolov === TOLOV.ok ? s.ok
    : z.tolov === TOLOV.no ? s.no
      : z.tolov === TOLOV.wait ? s.wait
        : s.unknown;
  return (
    <button
      type="button"
      className={`${s.chip} ${cls}`}
      onClick={() => onPick(z)}
      title={tr('Дэлгэрэнгүй харах')}
    >
      <span className={s.chipIcon}>{ICON[z.tolov] ?? '?'}</span>
      <span className={s.chipName}>{z.ner}</span>
      {z.ognoo != null && <span className={s.chipDate}>{dt(z.ognoo)}</span>}
    </button>
  );
}

function Detail({ z, canEdit, onEdit, onClose }: {
  z: Zov; canEdit: boolean; onEdit: () => void; onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  /*
   * ⚠️ Esc-ээр хаагдана — цонх нээгээд гарах товч хайх шаардлагагүй.
   *
   * ⚠️ Мөн Tab-ыг модал дотор БАРИНА, нээгдэхэд фокусыг модал руу ЗӨӨНӨ.
   *    `aria-modal="true"` нь ард байгаа БҮХ агуулгыг хүртээмжийн модноос
   *    хасдаг: фокус нь дуудсан chip товчин дээрээ (ард, нуугдсан мужид)
   *    үлдэхэд дэлгэц уншигч «диалог» гэж зарлаад цааш уншиж юу ч олдоггүй,
   *    Tab нь харагдахгүй элементүүд рүү явдаг байв (WCAG 2.4.3).
   *    Загвар: `UserAdmin.tsx`.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      const root = modalRef.current;
      if (e.key !== 'Tab' || !root) return;
      const f = [...root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => closeRef.current?.focus(), 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const rows: [string, string][] = [
    [tr('Багц'), z.bagts],
    [tr('Дараалал'), String(z.shat)],
    [tr('Төлөв'), TOLOV_TEXT[z.tolov]],
    [tr('Шийдвэрлэсэн огноо'), dt(z.ognoo) || '—'],
    [tr('Зөвшөөрлийн дугаар'), z.dugaar || '—'],
    [tr('Шийдвэрлэх байгууллага'), z.baiguullaga || '—'],
    [tr('Байгууллагын хариуцагч'), z.hariutsagch || '—'],
    [tr('Сэлбэ талын хариуцагч'), z.selbe || '—'],
    [tr('Тайлбар'), z.tailbar || '—'],
  ];

  /* ⚠️ `aria-labelledby` — нэргүй `role="dialog"` нь дэлгэц уншигчид зүгээр
     «диалог» гэж уншигддаг: аль зөвшөөрөл нээгдснийг мэдэх арга үлдэхгүй. */
  return (
    <div
      className={s.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`zov-title-${z.oid}`}
      onClick={onClose}
    >
      <div ref={modalRef} className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}>
          <span id={`zov-title-${z.oid}`} className={s.modalTitle}>{z.ner}</span>
          <button ref={closeRef} type="button" className={s.close} onClick={onClose} aria-label={tr('Хаах')}>✕</button>
        </div>
        <dl className={s.dl}>
          {rows.map(([k, v]) => (
            <div key={k} className={s.dlRow}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {canEdit && (
          <div className={s.actions}>
            <span className={s.spacer} />
            <button type="button" className={s.primary} onClick={onEdit}>{tr('Засах')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Zovshoorol() {
  const [rows, setRows] = useState<Zov[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [pick, setPick] = useState<Zov | null>(null);
  /** Засварын маягтын ноорог — `null` бол маягт хаалттай */
  const [edit, setEdit] = useState<ZovDraft | null>(null);
  const [n, setN] = useState(0);

  const { user } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  /**
   * ЗАСАХ ЭРХ — «Хэрэглэгчдийн эрх удирдах» хэсгээс тусад нь олгоно.
   * ⚠️ Харахаас ТУСДАА: зөвшөөрлийн төлөв нь ажил эхлүүлэх шийдвэрт шууд
   * нөлөөлдөг тул хардаг бүх хүн засаж чадах ёсгүй.
   */
  const canEdit = useMemo(
    () => hasCap(user?.username, 'zovshoorol'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, capN],
  );

  useEffect(() => {
    let alive = true;
    setBusy(true);
    void loadZov().then((r) => {
      if (!alive) return;
      setRows(r);
      setBusy(false);
    });
    return () => { alive = false; };
  }, [n]);

  /** Хадгалсны дараа ДАХИН ТАТНА — локал таамаглал нь серверээс зөрж болно. */
  const done = () => { setEdit(null); setPick(null); setN((x) => x + 1); };

  /* ⚠️ ГУРВАН өөр төлөвийг ЯЛГАНА: холбогдоогүй · ачаалж буй · хоосон.
     Гурвуулаа «юу ч харагдахгүй» боловч шалтгаан нь тэс өөр. */
  if (!ZOV_URL) {
    return (
      <div className={s.wrap}>
        <div className={s.notice}>
          <b>{tr('Зөвшөөрлийн үйлчилгээ хараахан холбогдоогүй байна.')}</b>
          <p>
            {tr('ArcGIS дээр хүснэгтийг нийтэлсний дараа түүний хаягийг `src/lib/zovshoorol.ts` дахь `URL`-д бичихэд энэ хуудас шууд ажиллана. Бусад тохиргоо шаардлагагүй.')}
          </p>
        </div>
      </div>
    );
  }

  if (busy) return <div className={s.wrap}><div className={s.notice}>{tr('Ачаалж байна…')}</div></div>;

  if (rows == null) {
    return (
      <div className={s.wrap}>
        <div className={`${s.notice} ${s.bad}`}>
          {tr('Үйлчилгээнээс өгөгдөл татаж чадсангүй. Холболт эсвэл хандах эрхээ шалгана уу.')}
        </div>
      </div>
    );
  }

  /**
   * ЗӨВХӨН ЗӨВШӨӨРӨЛТЭЙ БАГЦ.
   *
   * ⚠️ Хоосон багцыг харуулбал жагсаалт нь агуулгагүй хайрцгуудаар дүүрч,
   * бодит мэдээлэл доошоо түлхэгдэнэ. Шинэ багцад зөвшөөрөл нэмэх нь
   * толгойн «+ Зөвшөөрөл нэмэх» товчоор — багцыг маягт дотроос сонгоно.
   *
   * ⚠️ Эрэмбэ нь НЭРЭЭР, монгол цагаан толгой + тоон дарааллаар («Багц 10»
   * нь «Багц 2»-ын дараа орно). Урьдчилан бичсэн жагсаалтад тулгуурлавал
   * дэд бүтэц, нийгмийн барилгын багцууд эрэмбийн гадна үлдэнэ.
   */
  const groups: [string, Zov[]][] = [...byBagts(rows)]
    .filter(([, l]) => l.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0], 'mn', { numeric: true }));

  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <div className={s.headRow}>
          <h1 className={s.h1}>{tr('Зөвшөөрлийн хяналт')}</h1>
          <span className={s.spacer} />
          {/* ⚠️ ДАХИН АЧААЛАХ — өөр хүн зэрэг засаж болно. Товчгүй бол
              хуудсаа шинэчлэхийн тулд харагдац солих шаардлагатай болно. */}
          <button
            type="button"
            className={s.btn}
            onClick={() => setN((x) => x + 1)}
            disabled={busy}
            title={tr('Дахин ачаалах')}
          >
            ↻
          </button>
          {canEdit && (
            /* ⚠️ Багцыг УРЬДЧИЛАН СОНГОХГҮЙ (`bagts: ''`) — маягт дотор
               сонгоно. Ингэснээр аль ч багцад, бүртгэлгүй багцад ч нэмнэ. */
            <button type="button" className={s.primary} onClick={() => setEdit(blank('', 1))}>
              + {tr('Зөвшөөрөл нэмэх')}
            </button>
          )}
        </div>
        <p className={s.sub}>
          {tr('Багц бүрийн зөвшөөрлүүд шат дараалалаар. Товч дээр дарж дэлгэрэнгүйг харна.')}
        </p>
      </header>

      {/* ⚠️ «Хоосон жагсаалт» гэсэн салаа ХЭРЭГГҮЙ болсон: `groups` нь
          зөвшөөрөлтэй багцуудаас гардаг. */}
      {(
        groups.map(([bagts, list]) => {
          const sm = summarize(list);
          return (
            <section key={bagts} className={`${s.pack} ${sm.alert ? s.packAlert : ''}`}>
              <div className={s.packHead}>
                <span className={s.packName}>{bagts}</span>
                {canEdit && (
                  <button
                    type="button"
                    className={s.addBtn}
                    title={tr('«{0}»-д зөвшөөрөл нэмэх', bagts)}
                    onClick={() => setEdit(blank(bagts, Math.max(0, ...list.map((r) => r.shat)) + 1))}
                  >
                    + {tr('нэмэх')}
                  </button>
                )}
                <span className={s.counts}>
                  <b className={s.cOk}>{sm.ok}</b> {tr('зөвшөөрсөн')}
                  {sm.wait > 0 && <> · <b className={s.cWait}>{sm.wait}</b> {tr('хүлээгдэж буй')}</>}
                  {sm.no > 0 && <> · <b className={s.cNo}>{sm.no}</b> {tr('зөвшөөрөөгүй')}</>}
                  {sm.unknown > 0 && <> · <b className={s.cNo}>{sm.unknown}</b> {tr('танигдаагүй төлөв')}</>}
                </span>
              </div>
              <div className={s.chain}>
                {list.map((z, i) => (
                  <div key={z.oid || `${z.shat}-${z.ner}`} className={s.step}>
                    {i > 0 && <span className={s.arrow} aria-hidden>→</span>}
                    <Chip z={z} onPick={setPick} />
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}

      {pick && (
        <Detail
          z={pick}
          canEdit={canEdit}
          onEdit={() => { setEdit({ ...pick, tolov: pick.tolov === 'unknown' ? TOLOV.wait : pick.tolov }); setPick(null); }}
          onClose={() => setPick(null)}
        />
      )}
      {edit && rows && (
        <ZovshoorolEdit init={edit} all={rows} onDone={done} onCancel={() => setEdit(null)} />
      )}
    </div>
  );
}
