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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  URL as ZOV_URL, TOLOV, PENDING_STALE_DAYS, byBagts, filterZov, isStalePending, loadZovResult,
  pendingAgeDays, summarize, type Zov, type ZovDraft, type ZovFilter,
} from '@/lib/zovshoorol';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { date } from '@/lib/format';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useAuth } from '@/components/AuthGate';
import { userError } from '@/components/ui';
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
  get [TOLOV.wait]() { return tr('Хүлээгдэж буй'); },
  get [TOLOV.ok]() { return tr('Зөвшөөрсөн'); },
  get [TOLOV.no]() { return tr('Зөвшөөрөөгүй'); },
  get unknown() { return tr('танигдаагүй'); },
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

/**
 * Шүүлтийн товчнууд — дараалал нь ач холбогдлоор.
 * ⚠️ Шошгыг render үед `tr()`-ээр (модулийн түвшинд БИШ — хэл солиход дагана).
 */
const FILTERS: { key: ZovFilter; label: () => string }[] = [
  { key: 'all', label: () => tr('Бүгд') },
  { key: 'stale', label: () => tr('{0}+ хоног хүлээгдэж буй', PENDING_STALE_DAYS) },
  { key: 'wait', label: () => tr('Хүлээгдэж буй') },
  { key: 'no', label: () => tr('Зөвшөөрөөгүй') },
  { key: 'ok', label: () => tr('Зөвшөөрсөн') },
  { key: 'unknown', label: () => tr('танигдаагүй') },
];

function Chip({ z, now, onPick }: { z: Zov; now: number; onPick: (z: Zov) => void }) {
  const cls = z.tolov === TOLOV.ok ? s.ok
    : z.tolov === TOLOV.no ? s.no
      : z.tolov === TOLOV.wait ? s.wait
        : s.unknown;
  /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): `PENDING_STALE_DAYS`-аас удаж буй
     хүлээгдэж буй зөвшөөрөл ТОД тэмдэглэгдэнэ (шар хүрээ + «N хоног»).
     ⚠️ АНИВЧИХГҮЙ — файлын толгойн дүрэм: анивчих нь зөвхөн «Зөвшөөрөөгүй». */
  const stale = isStalePending(z, now);
  const age = stale ? pendingAgeDays(z, now) : null;
  /* ⚠️ 2026-09-25: төлөв зөвхөн тэмдгээр (✓ ⏳ !) илэрдэг байсан тул дэлгэц
     уншигч «шалгах тэмдэг» л уншдаг байв — нэр, төлөв, огноог шууд нэрлэнэ. */
  return (
    <button
      type="button"
      className={`${s.chip} ${cls} ${stale ? s.stale : ''}`}
      onClick={() => onPick(z)}
      title={tr('Дэлгэрэнгүй харах')}
      aria-label={[
        z.ner, TOLOV_TEXT[z.tolov], z.ognoo != null ? dt(z.ognoo) : '',
        age != null ? tr('{0} хоног хүлээгдэж байна', age) : '',
      ].filter(Boolean).join(' · ')}
      aria-haspopup="dialog"
    >
      <span className={s.chipIcon} aria-hidden>{ICON[z.tolov] ?? '?'}</span>
      <span className={s.chipName}>{z.ner}</span>
      {z.ognoo != null && <span className={s.chipDate}>{dt(z.ognoo)}</span>}
      {age != null && <span className={s.chipAge} aria-hidden>{tr('{0} хоног', age)}</span>}
    </button>
  );
}

function Detail({ z, canEdit, onEdit, onClose }: {
  z: Zov; canEdit: boolean; onEdit: () => void; onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  /*
   * ⚠️ Tab-ыг модал дотор БАРИНА, нээгдэхэд фокусыг модал руу ЗӨӨНӨ.
   *    `aria-modal="true"` нь ард байгаа БҮХ агуулгыг хүртээмжийн модноос
   *    хасдаг: фокус нь дуудсан chip товчин дээрээ (ард, нуугдсан мужид)
   *    үлдэхэд дэлгэц уншигч «диалог» гэж зарлаад цааш уншиж юу ч олдоггүй,
   *    Tab нь харагдахгүй элементүүд рүү явдаг байв (WCAG 2.4.3).
   * ⚠️ 2026-10-06 (аудит): өөрийн гар урхины оронд төслийн `useFocusTrap` —
   *    хуучин урхи хаахад фокусыг ДУУДСАН chip руу БУЦААДАГГҮЙ байсан тул фокус
   *    `<body>`-д унаж, Tab хуудасны эхнээс эхэлдэг байв. `useFocusTrap` нь
   *    нээхэд эхний товч (✕) руу оруулж, хаахад өмнөх элемент рүү буцаана.
   */
  useFocusTrap(modalRef);
  /* ⚠️ Esc-ээр хаагдана — цонх нээгээд гарах товч хайх шаардлагагүй */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
    /* ⚠️ 2026-10-01: «N хоног хүлээгдэж буй» тэмдэглэгээний суурь — Editor Tracking
       байхгүй бол мөр ОГТ гарахгүй («—» нь «бүртгэгдээгүй» гэж худал уншигдана). */
    ...(z.since != null ? [[tr('Бүртгэгдсэн'), date(z.since)] as [string, string]] : []),
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
          <button type="button" className={s.close} onClick={onClose} aria-label={tr('Хаах')}>✕</button>
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
  /** Сүүлийн ачаалалт унасан шалтгаан (`loadZovResult`) — амжилттай бол `null` */
  const [loadErr, setLoadErr] = useState<Error | null>(null);
  const [pick, setPick] = useState<Zov | null>(null);
  /* ⚠️ 2026-09-29 (аудит 10): ТОГТВОРТОЙ заалт — `Detail`-ийн эффект `[onClose]`-оос
     хамаардаг тул рендер бүрд шинэ функц өгөхөд сонсогч дахин бүртгэгдэж, фокус
     60 мс-д ✕ рүү үсэрдэг байв. */
  const closePick = useCallback(() => setPick(null), []);
  /** Засварын маягтын ноорог — `null` бол маягт хаалттай */
  const [edit, setEdit] = useState<ZovDraft | null>(null);
  const [n, setN] = useState(0);
  /**
   * ⚠️ 2026-10-01: ТӨЛӨВИЙН ШҮҮЛТ (хэрэглэгч: бүгдийг зас). Санадаггүй — дахин
   *    ороход «Бүгд»-ээс эхэлнэ (нуусан зөвшөөрөл мартагдахгүйн тулд).
   */
  const [flt, setFlt] = useState<ZovFilter>('all');
  /**
   * «Одоо» — хүлээлтийн насыг тоолох агшин. ⚠️ Render дотор `Date.now()` дуудвал
   * цэвэр бус (React Compiler) тул ачаалал бүрийн агшинд тогтооно.
   */
  const [now, setNow] = useState(0);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: татах эффект — түлхүүр солигдоход ачаалж буй/өмнөх төлөвийг синхрон тэглээд шинээр татна; render үед гаргавал бүтэц өөрчлөгдөнө
    setBusy(true);
    void loadZovResult().then((r) => {
      if (!alive) return;
      setRows(r.rows);
      /* ⚠️ 2026-10-06 (аудит): унасан ШАЛТГААН — ерөнхий мөрийн доор харуулна */
      setLoadErr(r.error);
      setNow(Date.now());
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

  /* ⚠️ 2026-10-06 (аудит): БҮТЭН «Ачаалж байна…» ЗӨВХӨН жагсаалт хараахан алга үед
     (анхны ачаалалт · алдааны дараах дахин оролдлого). Урьд нь ↻ болон хадгалсны
     дараах `done()` бүрд жагсаалт бүхэлдээ салж (unmount), гүйлгэсэн байрлал
     алдагдаж, дэлгэц анивчдаг байв. Дахин татах зуур хуучин жагсаалт үлдэж,
     толгойд жижиг «Ачаалж байна…» гарна; унавал доорх алдааны дэлгэц рүү шилжинэ
     («хуучин тоо чимээгүй үлдэхгүй»). */
  if (busy && rows == null) return <div className={s.wrap}><div className={s.notice}>{tr('Ачаалж байна…')}</div></div>;

  if (rows == null) {
    return (
      <div className={s.wrap}>
        <div className={`${s.notice} ${s.bad}`}>
          {tr('Үйлчилгээнээс өгөгдөл татаж чадсангүй. Холболт эсвэл хандах эрхээ шалгана уу.')}
          {/* ⚠️ 2026-10-06 (аудит): ЖИНХЭНЭ шалтгаан — 499 · сүлжээ · талбар алгыг ялгана */}
          {loadErr && <p>{tr('Шалтгаан:')} {userError(loadErr)}</p>}
          {/* ⚠️ Дахин татах зам (2026-09-23): урьд нь зөвхөн F5. `n` нь ачаалах
              эффектийн хамаарал тул өсгөхөд л дахин татна. */}
          <div className={s.actions}>
            <span className={s.spacer} />
            <button type="button" className={s.primary} onClick={() => setN((x) => x + 1)}>
              {tr('Дахин оролдох')}
            </button>
          </div>
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
  /* ⚠️ 2026-10-01: шүүлт нь МӨРИЙН түвшинд — багц бүр зөвхөн таарсан алхмуудаа
     харуулж, нэг ч таарахгүй багц нуугдана. Багцын толгойн тоо (`summarize`) нь
     ШҮҮЛТЭЭС ҮЛ ХАМААРАН бүх алхмаар — «2 зөвшөөрсөн» гэж бичээд 1-ийг харуулбал
     нөгөө нь алга болсон мэт уншигдана. */
  const shown = filterZov(rows, flt, now);
  const all = byBagts(rows);
  const groups: [string, Zov[]][] = [...byBagts(shown)]
    .filter(([, l]) => l.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0], 'mn', { numeric: true }));
  /** Шүүлтийн товч бүрийн тоо — 0-тэй «танигдаагүй» товч гарахгүй */
  const fCount = (k: ZovFilter) => filterZov(rows, k, now).length;

  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <div className={s.headRow}>
          <h1 className={s.h1}>{tr('Зөвшөөрлийн хяналт')}</h1>
          <span className={s.spacer} />
          {/* ⚠️ 2026-10-06: дахин татах зуурын жижиг заалт (жагсаалт ХЭВЭЭР үлдэнэ) */}
          {busy && (
            <span role="status" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {tr('Ачаалж байна…')}
            </span>
          )}
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
        {rows.length > 0 && (
          <div className={s.filters} role="group" aria-label={tr('Төлөвөөр шүүх')}>
            {FILTERS.map((f) => {
              const c = fCount(f.key);
              /* Хоосон «танигдаагүй» товч мэдээлэл өгөхгүй — сонгогдсон бол үлдэнэ */
              if (f.key === 'unknown' && c === 0 && flt !== 'unknown') return null;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={flt === f.key}
                  className={`${s.fBtn} ${flt === f.key ? s.fOn : ''} ${f.key === 'stale' && c > 0 ? s.fStale : ''}`}
                  onClick={() => setFlt(f.key)}
                >
                  {f.label()} <span className={s.fNum}>{c}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ХООСОН ТӨЛӨВ БУЦААВ. Урьд нь
          «`groups` нь зөвшөөрөлтэй багцуудаас гардаг тул хоосон салаа хэрэггүй»
          гэж хасагдсан байв — гэвч үйлчилгээ холбогдсон, зөвшөөрөл 0 үед хуудас
          зөвхөн толгойтой ХООСОН үлдэж «ачаалагдаагүй юу, алга уу» гэдэг нь
          ойлгогдохгүй байв. Мөн шүүлт нэг ч мөрд таарахгүй үед ил хэлнэ. */}
      {rows.length === 0 ? (
        <div className={s.notice}>
          <b>{tr('Зөвшөөрөл бүртгэгдээгүй')}</b>
          {canEdit && <p>{tr('«+ Зөвшөөрөл нэмэх» товчоор эхний зөвшөөрлөө бүртгэнэ үү.')}</p>}
        </div>
      ) : groups.length === 0 ? (
        <div className={s.notice}>
          {tr('Энэ шүүлтэд тохирох зөвшөөрөл алга.')}
          <div className={s.actions}>
            <span className={s.spacer} />
            <button type="button" className={s.btn} onClick={() => setFlt('all')}>
              {tr('Бүгдийг харах')}
            </button>
          </div>
        </div>
      ) : (
        groups.map(([bagts, list]) => {
          /* ⚠️ Толгойн тоо БҮХ алхмаар (дээрх `shown`-ийн тайлбар) */
          const full = all.get(bagts) ?? list;
          const sm = summarize(full, now);
          return (
            <section key={bagts} className={`${s.pack} ${sm.alert ? s.packAlert : ''}`}>
              <div className={s.packHead}>
                <span className={s.packName}>{bagts}</span>
                {canEdit && (
                  <button
                    type="button"
                    className={s.addBtn}
                    title={tr('«{0}»-д зөвшөөрөл нэмэх', bagts)}
                    onClick={() => setEdit(blank(bagts, Math.max(0, ...full.map((r) => r.shat)) + 1))}
                  >
                    + {tr('нэмэх')}
                  </button>
                )}
                <span className={s.counts}>
                  <b className={s.cOk}>{sm.ok}</b> {tr('зөвшөөрсөн')}
                  {sm.wait > 0 && <> · <b className={s.cWait}>{sm.wait}</b> {tr('хүлээгдэж буй')}</>}
                  {sm.stale > 0 && <> (<b className={s.cStale}>{sm.stale}</b> {tr('нь {0}+ хоног', PENDING_STALE_DAYS)})</>}
                  {sm.no > 0 && <> · <b className={s.cNo}>{sm.no}</b> {tr('зөвшөөрөөгүй')}</>}
                  {sm.unknown > 0 && <> · <b className={s.cNo}>{sm.unknown}</b> {tr('танигдаагүй төлөв')}</>}
                </span>
              </div>
              <div className={s.chain}>
                {list.map((z, i) => (
                  <div key={z.oid || `${z.shat}-${z.ner}`} className={s.step}>
                    {i > 0 && <span className={s.arrow} aria-hidden>→</span>}
                    <Chip z={z} now={now} onPick={setPick} />
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
          /* ⚠️ 2026-10-06: танигдаагүй төлөв → `null` (СОНГОГДООГҮЙ). Урьд нь
             «Хүлээгдэж буй» болгож нээдэг тул буруу бичсэн «зөвшөөрсөн» мөр хадгалахад
             чимээгүй хүлээгдэж буй болдог байв (`ZovDraft.tolov`-ийн тайлбар). */
          onEdit={() => { setEdit({ ...pick, tolov: pick.tolov === 'unknown' ? null : pick.tolov }); setPick(null); }}
          onClose={closePick}
        />
      )}
      {edit && rows && (
        <ZovshoorolEdit init={edit} all={rows} onDone={done} onCancel={() => setEdit(null)} />
      )}
    </div>
  );
}
