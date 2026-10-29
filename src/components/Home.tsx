'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronDown } from 'lucide-react';
import { t as tr } from '@/lib/i18nCore';
import { LocaleToggle } from '@/components/LocaleToggle';
import { useAuth } from './AuthGate';
import dynamic from 'next/dynamic';
import { DocViewer } from './DocViewer';
const CeoScorecard = dynamic(() => import('./CeoScorecard').then((m) => m.CeoScorecard), { ssr: false });
import type { ViewKey } from '@/lib/services';
import s from './home.module.css';

/** Нүүрт товч болж гарах харагдац — мета нь `VIEWS`-ээс ирнэ (`Root` шүүнэ) */
export type HomeView = {
  key: ViewKey;
  title: string;
  desc: string;
  hue: string;
};

/** Сэдвийн бүлэг — `HOME_SECTIONS` + хамрагдаагүйг цуглуулсан «Бусад» */
export type HomeGroup = {
  id: string;
  title: string;
  views: HomeView[];
};

/**
 * Одоо БҮХ үзүүлэлт `ExecKpi`-ийн таван сэдэвчилсэн ангилалд амьдарна —
 * эдгээр нүд «Хамрах хүрээ» ангилалд `neutral` төлөвтэйгээр шингэсэн.
 * Ачаалагчид (`loadHeadline`, `loadHousing`, `loadSocial` г.м.) тийш нүүсэн
 * бөгөөд бүгд `cached` тул ХҮСЭЛТИЙН ТОО НЭМЭГДЭЭГҮЙ.
 */

/** Нэрнээс товч үсэг (avatar) — эхний хоёр үгийн эхний үсэг */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * НҮҮР ХУУДАС — ЕРӨНХИЙ KPI ДАШБОАРД.
 */
export function Home({
  onEnterAll,
  groups,
  onEnterView,
  docsAllowed = true,
  isSuper = false,
  boardAllowed,
  homeView,
  permsDown = false,
  onRetryPerms,
}: {
  /** «Нэвтрэх» / «Орох» — эрхийн дагуу орох цэгт хүргэнэ */
  onEnterAll: () => void;
  groups: HomeGroup[];
  onEnterView: (key: ViewKey) => void;
  /**
   * «Баримт бичиг» цэс харагдах эсэх — хэрэглэгчийн `docs` эрх.
   */
  docsAllowed?: boolean;
  /**
   * «Сэлбэ ухаалаг хот» самбар ЗӨВХӨН супер хэрэглэгчид (2026-08-21,
   * хэрэглэгчийн хүсэлт) — нүүр нь дэд самбар болж, энгийн хэрэглэгчид зөвхөн
   * платформын хэсгүүдийн навигаци үлдэнэ.
   */
  isSuper?: boolean;
  /**
   * Удирдлагын самбар харагдах эсэх.
   */
  boardAllowed?: boolean;
  /**
   * Хэрэглэгчийн үүргийн НҮҮР харагдац (`ROLE_ACCESS.home` / override) —
   * хязгаарлагдмал хэрэглэгчийн картуудад «Таны үндсэн хэсэг» гэж тодруулна.
   */
  homeView?: ViewKey;
  permsDown?: boolean;
  onRetryPerms?: () => void;
}) {
  const { status, user, signOut } = useAuth();

  /** Нээлттэй сэдвийн id — нэг зэрэг ГАНЦ dropdown */
  const [open, setOpen] = useState<string | null>(null);
  /** Баримт үзэгч нээлттэй эсэх */
  const [docs, setDocs] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  /**
   * Гадуур дарах ба Escape — dropdown хаана.
   */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={s.home}>
      {/* ── Дээд навигацийн зурвас — лого · цэс · нэвтрэлт ── */}
      <header className={s.navbar}>
        <div className={s.brand}>
          <img src="/logo.svg" alt="" className={s.logo} />
          <span className={s.brandDivider} aria-hidden />
          <span className={s.brandText}>
            <b>{tr('СЭЛБЭ')}</b> {tr('Ухаалаг хот')}
            <small className={s.brandTag}>Digital Twin Platform</small>
          </span>
        </div>

        <div className={s.spacer} aria-hidden />

        {/* ── Сэдвийн цэс — дарахад доош dropdown нээгдэнэ ── */}
        {groups.length > 0 && (
          <nav
            className={s.menuRow}
            ref={bar}
            aria-label={tr('Платформын хэсгүүд')}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(null); }}
          >
            {groups.map((g) => {
              const on = open === g.id;
              return (
                <div
                  key={g.id}
                  className={s.menuItem}
                  onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(g.id); }}
                >
                  <button
                    type="button"
                    className={`${s.menuBtn} ${on ? s.menuBtnOn : ''}`}
                    aria-expanded={on}
                    aria-controls={`home-menu-${g.id}`}
                    /* Хүрэлт ба ГАР (Enter/Space)-т — hover байхгүй тул товшилт хэвээр */
                    onClick={(e) => {
                      if (on && (e.nativeEvent as PointerEvent).pointerType === 'mouse') return;
                      setOpen(on ? null : g.id);
                    }}
                  >
                    {g.title}
                    <span className={`${s.caret} ${on ? s.caretOn : ''}`} aria-hidden><ChevronDown size={13} strokeWidth={1.75} /></span>
                  </button>

                  {on && (
                    <div className={s.dropdown} id={`home-menu-${g.id}`}>
                      {g.views.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          className={s.viewBtn}
                          onClick={() => { setOpen(null); onEnterView(v.key); }}
                          title={v.desc}
                        >
                          <span className={s.viewText}>
                            <span className={s.viewTitle}>{v.title}</span>
                            <span className={s.viewDesc}>{v.desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* «Баримт бичиг» — задрахгүй, ГАНЦ товч. `docs` эрхгүй бол ОГТ
                зурагдахгүй (идэвхгүй болгохгүй): байхгүй эрхийг саарал товчоор
                сануулах нь хэрэглэгчид ямар ч тус болохгүй. */}
            {docsAllowed && (
              <button
                type="button"
                className={s.menuBtn}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(null); }}
                onClick={() => { setOpen(null); setDocs(true); }}
              >
                {tr('Баримт бичиг')}
              </button>
            )}
          </nav>
        )}

        <div className={s.spacer} aria-hidden />

        <div className={s.auth}>
          <LocaleToggle />
          {status === 'signed-in' && user ? (
            <>
              <span className={s.userChip}>
                {user.thumbnail ? (
                  <img src={user.thumbnail} alt="" className={s.avatar} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <span className={s.avatarFallback} aria-hidden>{initials(user.fullName)}</span>
                )}
                <span className={s.userName}>{user.fullName}</span>
              </span>
              {/* Нэвтэрсэн хэрэглэгч порталд ОРОХ — эс бөгөөс нүүр хуудсанд гацна */}
              <button type="button" className={`${s.signBtn} ${s.signIn}`} onClick={onEnterAll}>
                {tr('Порталд орох')}
                <span className={s.signInArrow} aria-hidden><ArrowRight size={14} strokeWidth={1.75} /></span>
              </button>
              <button type="button" className={s.signBtn} onClick={signOut}>{tr('Гарах')}</button>
            </>
          ) : (
            <button type="button" className={`${s.signBtn} ${s.signIn}`} onClick={onEnterAll}>
              {tr('Нэвтрэх')}
              <span className={s.signInArrow} aria-hidden><ArrowRight size={14} strokeWidth={1.75} /></span>
            </button>
          )}
        </div>
      </header>

      {/* ── Дашбоард — супер БА «бүх харагдац» эрхтэй удирдлага (2026-08-21,
             хамрах хүрээ 2026-09-15-нд өргөжсөн — `boardAllowed`) ── */}
      {(boardAllowed ?? isSuper) && (
      <main className={s.board}>
        <header className={s.boardHead}>
          <div className={s.intro}>
            <p className={s.kicker}><span aria-hidden />{tr('Улаанбаатар хотын Сэлбэ дэд төв')}</p>
            <h1 className={s.title}>
              {tr('Сэлбэ ухаалаг хот')}
              <br />
              <span className={s.titleSub}>Digital Twin Platform</span>
            </h1>
            <p className={s.lede}>
              {tr('Төслийн үндсэн үзүүлэлтийг ArcGIS мэдээллийн сангаас шууд нэгтгэн харуулав.')}
            </p>
            {/* Толгойн зурвасын «Порталд орох» / «Баримт бичиг»-тэй ИЖИЛ үйлдэл, ИЖИЛ нөхцөл (нэвтэрсэн ·
                `docsAllowed`) — Environment-ийн `.action-primary` + `.action-text` */}
            {status === 'signed-in' && user && (
              <div className={s.actions}>
                <button type="button" className={s.actionPrimary} onClick={onEnterAll}>
                  {tr('Порталд орох')} <ArrowRight size={17} strokeWidth={1.75} aria-hidden />
                </button>
                {docsAllowed && (
                  <button type="button" className={s.actionText} onClick={() => setDocs(true)}>
                    {tr('Баримт бичиг')} <ArrowUpRight size={17} strokeWidth={1.75} aria-hidden />
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        {status === 'signed-in' || status === 'off' ? (
          <CeoScorecard onView={onEnterView} />
        ) : status === 'checking' ? (
          <div className={s.boardGate} aria-busy="true">
            <p>{tr('Шалгаж байна…')}</p>
          </div>
        ) : status === 'denied' ? (
          <div className={s.boardGate} role="alert">
            <p>{tr('Энэ бүртгэлд порталд хандах эрх олгогдоогүй байна — админд хандана уу.')}</p>
            <button type="button" className={s.signBtn} onClick={signOut}>{tr('Өөр бүртгэлээр нэвтрэх')}</button>
          </div>
        ) : (
          <div className={s.boardGate}>
            <p>{tr('Удирдлагын үзүүлэлтүүд нэвтэрсний дараа харагдана.')}</p>
            <button type="button" className={s.actionPrimary} onClick={onEnterAll}>{tr('Нэвтрэх')} →</button>
          </div>
        )}
      </main>
      )}

      {/*
        * ── ХЯЗГААРЛАГДМАЛ ХЭРЭГЛЭГЧИЙН НҮҮР (2026-09-30) ──
        */}
      {status === 'signed-in' && !(boardAllowed ?? isSuper) && groups.length === 0 && (
        <main className={s.board}>
          <div className={s.boardGate} role="status">
            <p>{permsDown
              ? tr('Эрхийн жагсаалтыг уншиж чадсангүй — таны эрх ХАСАГДААГҮЙ байж магадгүй. Холболтоо шалгаад хуудсыг дахин ачаална уу. Давтагдвал админд хандана уу.')
              : tr('Танд харагдац олгогдоогүй байна — админд хандана уу.')}</p>
            <p>{tr('Хэрэглэгч:')} {user?.username || '—'}</p>
            {permsDown && onRetryPerms && (
              <button type="button" className={s.actionPrimary} onClick={onRetryPerms}>{tr('Дахин оролдох')}</button>
            )}
            <button type="button" className={s.actionText} onClick={signOut}>{tr('Өөр бүртгэлээр нэвтрэх')}</button>
          </div>
        </main>
      )}

      {!(boardAllowed ?? isSuper) && groups.length > 0 && (
        <main className={s.board}>
          <header className={s.boardHead}>
            <div className={s.intro}>
              <p className={s.kicker}><span aria-hidden />{tr('Улаанбаатар хотын Сэлбэ дэд төв')}</p>
              <h1 className={s.title}>
                {tr('Сэлбэ ухаалаг хот')}
                <br />
                <span className={s.titleSub}>Digital Twin Platform</span>
              </h1>
              <p className={s.lede}>{tr('Танд нээлттэй хэсгүүд. Ажиллах хэсгээ сонгоод «Орох» дарна уу.')}</p>
            </div>
          </header>
          {groups.map((g) => {
            /* Үндсэн хэсэг бүлгийнхээ ЭХЭНД */
            const views = homeView
              ? [...g.views].sort((a, b) => Number(b.key === homeView) - Number(a.key === homeView))
              : g.views;
            return (
              <section key={g.id} className={s.cardGroup} aria-label={g.title}>
                <h2 className={s.cardGroupTitle}>{g.title}</h2>
                <ul className={s.cardGrid}>
                  {views.map((v) => {
                    const main = v.key === homeView;
                    return (
                      <li key={v.key} className={`${s.viewCard} ${main ? s.viewCardMain : ''}`}>
                        {main && <span className={s.viewCardTag}>{tr('Таны үндсэн хэсэг')}</span>}
                        <h3 className={s.viewCardTitle}>{v.title}</h3>
                        <p className={s.viewCardDesc}>{v.desc}</p>
                        <button
                          type="button"
                          className={`${s.signBtn} ${main ? s.signIn : ''} ${s.viewCardBtn}`}
                          onClick={() => onEnterView(v.key)}
                          aria-label={tr('«{0}» хэсэгт орох', v.title)}
                        >
                          {tr('Орох')} <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </main>
      )}

      {/* Баримт үзэгч — порталынхтай ИЖИЛ компонент, нэвтрэх шаардлагагүй */}
      <DocViewer open={docsAllowed && docs} onClose={() => setDocs(false)} />
    </div>
  );
}
