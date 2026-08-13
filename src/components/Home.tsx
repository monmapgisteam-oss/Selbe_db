'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuth } from './AuthGate';
import { useAsync } from '@/lib/useAsync';
import { loadHeadline, loadHousing, loadProjectProgress } from '@/lib/live';
import { num, pct } from '@/lib/format';
import { DocViewer } from './DocViewer';
import type { ViewKey } from '@/lib/services';
import s from './home.module.css';

/** Нүүрт товч болж гарах харагдац — мета нь `VIEWS`-ээс ирнэ (`Root` шүүнэ) */
export type HomeView = {
  key: ViewKey;
  title: string;
  desc: string;
  /** Зөвхөн hover-ийн акцент өнгөнд (`--tone`) — дүрс энд ХЭРЭГЛЭХГҮЙ */
  hue: string;
};

/** Сэдвийн бүлэг — `HOME_SECTIONS` + хамрагдаагүйг цуглуулсан «Бусад» */
export type HomeGroup = {
  id: string;
  title: string;
  views: HomeView[];
};

/**
 * Гол үзүүлэлтүүд — БҮГД АМЬД (services.ts-ээс). Урьд нь илтгэлийн бэхлэгдсэн дүн
 * (158 га · 44,518 · 8,575 · 58.11 га · 36.35%) харагддаг байсныг үйлчилгээний
 * бодит утгаар сольсон; ачаалж буй үед «…». (brief.ts-ийн HEADLINE/OVERALL
 * хатуу тоо устсан тул амьд эх л үлдэв.)
 */
function useHomeStats(): { stats: { value: string; label: string }[]; progress: number | null } {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const h = useAsync(loadHeadline, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hh = useAsync(loadHousing, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const p = useAsync(loadProjectProgress, []);
  const hd = h.state === 'ready' ? h.data : null;
  const hs = hh.state === 'ready' ? hh.data : null;
  const pp = p.state === 'ready' ? p.data : null;
  return {
    stats: [
      { value: hd ? `${num(hd.areaHa, 1)} га` : '…', label: 'Төслийн талбай' },
      { value: hd ? num(hd.population) : '…', label: 'Хамрагдах хүн ам' },
      { value: hs ? num(hs.ail) : '…', label: 'Өрхийн орон сууц' },
      { value: hd?.greenHa != null ? `${num(hd.greenHa, 1)} га` : '…', label: 'Ногоон байгууламж' },
      { value: pp ? pct(pp.actual, 2) : '…', label: 'Төслийн гүйцэтгэл' },
    ],
    // Явцын зурвасын АМЬД тоо — бэхлэгдсэн OVERALL.reported-ыг сольсон
    progress: pp ? pp.actual : null,
  };
}

/** Нэрнээс товч үсэг (avatar) — эхний хоёр үгийн эхний үсэг */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * НҮҮР ХУУДАС — «Сэлбэ 20 минутын хот» дижитал ихэр платформын лендинг.
 *
 * Дээд navbar-т төслийн нэр, ArcGIS НЭВТРЭЛТ. Гол хэсэгт төслийн нэр, товч
 * танилцуулга, албан ёсны үзүүлэлтүүд, доор нь ХАРАГДАЦЫН ТОВЧНУУД. «Нэвтрэх»
 * дарж ороход нэвтрээгүй бол ArcGIS руу чиглүүлж, буцаж ирэхэд автоматаар орно.
 *
 * ⚠️ Картуудын агуулга нь `HOME_SECTIONS` ба `VIEWS`-ээс — `Root` нь эрхээр
 * шүүгээд дамжуулна. Энд ХАТУУ жагсаалт бичихгүй: харагдац нэмэхэд нүүр
 * хуудас автоматаар дагана.
 *
 * ⚠️ Сэдвүүд нь navbar-ын доор ХЭВТЭЭ МӨР болж, дарахад доош dropdown нээгдэнэ.
 * Dropdown доторх харагдац дарахад шууд тэр цонх руу орно.
 */
export function Home({
  onEnterAll,
  groups,
  onEnterView,
}: {
  /** «Нэвтрэх» / «Орох» — эрхийн дагуу орох цэгт хүргэнэ */
  onEnterAll: () => void;
  groups: HomeGroup[];
  onEnterView: (key: ViewKey) => void;
}) {
  const { status, user, signOut } = useAuth();
  const { stats, progress } = useHomeStats();

  /** Нээлттэй сэдвийн id — нэг зэрэг ГАНЦ dropdown */
  const [open, setOpen] = useState<string | null>(null);
  /** Баримт үзэгч нээлттэй эсэх */
  const [docs, setDocs] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  /**
   * Гадуур дарах ба Escape — dropdown хаана.
   *
   * ⚠️ `pointerdown` (click БИШ): доторх товчны `click` ажиллахаас ӨМНӨ гадуурх
   * даралт бүртгэгдэх ёстой. `click`-ээр сонсвол сонголт хийх агшинд эхлээд
   * хаагдаад, зарим browser-т дарагдалт алдагддаг.
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
      {/* Дэвсгэр — WebP (444KB; 2.9MB PNG fallback хасав — бүх орчин үеийн browser webp дэмжинэ) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={s.bg} src="/high_resolution_1.webp" alt="" />
      <div className={s.scrim} aria-hidden />
      <div className={s.grid} aria-hidden />

      {/* ── Дээд навигацийн зурвас — лого · цэс · нэвтрэлт ── */}
      <header className={s.navbar}>
        <div className={s.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className={s.logo} />
          <span className={s.brandDivider} aria-hidden />
          <span className={s.brandText}>
            <b>СЭЛБЭ</b> 20 минутын хот
            <small className={s.brandTag}>Digital Twin Platform</small>
          </span>
        </div>

        <div className={s.spacer} aria-hidden />

        {/* ── Сэдвийн цэс — дарахад доош dropdown нээгдэнэ ── */}
        {groups.length > 0 && (
          <nav
            className={s.menuRow}
            ref={bar}
            aria-label="Платформын хэсгүүд"
            /**
             * ⚠️ Зөвхөн ХУЛГАНА. Хүрэлтэнд (`touch`) hover гэж байхгүй — хуруу
             * хүрэхэд `pointerenter` мөн буудаг тул шүүхгүй бол цэс нээгдээд,
             * араас нь `click` ирж шууд хаагдана.
             */
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
                    aria-haspopup="true"
                    /* Хүрэлт ба ГАР (Enter/Space)-т — hover байхгүй тул товшилт хэвээр */
                    onClick={() => setOpen(on ? null : g.id)}
                  >
                    {g.title}
                    <span className={`${s.caret} ${on ? s.caretOn : ''}`} aria-hidden>▾</span>
                  </button>

                  {on && (
                    <div className={s.dropdown} role="menu">
                      {g.views.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          role="menuitem"
                          className={s.viewBtn}
                          style={{ '--tone': v.hue } as CSSProperties}
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

            {/* «Баримт бичиг» — задрахгүй, ГАНЦ товч. Дарахад аппын өөрийн
                баримт үзэгч (порталынхтай ижил) нээгдэнэ: 4 PDF, томруулах,
                хуудсаар алхах, татах бүгд бэлэн. Нэвтрэх шаардлагагүй. */}
            <button
              type="button"
              className={s.menuBtn}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(null); }}
              onClick={() => { setOpen(null); setDocs(true); }}
            >
              Баримт бичиг
            </button>
          </nav>
        )}

        <div className={s.spacer} aria-hidden />

        <div className={s.auth}>
          {status === 'signed-in' && user ? (
            <>
              <span className={s.userChip}>
                {user.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.thumbnail} alt="" className={s.avatar} />
                ) : (
                  <span className={s.avatarFallback} aria-hidden>{initials(user.fullName)}</span>
                )}
                <span className={s.userName}>{user.fullName}</span>
              </span>
              {/* Нэвтэрсэн хэрэглэгч порталд ОРОХ — эс бөгөөс нүүр хуудсанд гацна */}
              <button type="button" className={`${s.signBtn} ${s.signIn}`} onClick={onEnterAll}>
                Орох
                <span className={s.signInArrow} aria-hidden>→</span>
              </button>
              <button type="button" className={s.signBtn} onClick={signOut}>Гарах</button>
            </>
          ) : (
            <button type="button" className={`${s.signBtn} ${s.signIn}`} onClick={onEnterAll}>
              Нэвтрэх
              <span className={s.signInArrow} aria-hidden>→</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Гол — төслийн нэр ба мэдээлэл ── */}
      <main className={s.hero}>
        <span className={s.eyebrow}>Улаанбаатар хот · Сэлбэ дэд төв</span>
        <h1 className={s.title}>
          Сэлбэ 20 минутын хот
          <span className={s.titleSub}>Digital Twin Platform</span>
        </h1>
        <p className={s.lede}>
          Ерөнхий төлөвлөгөө, барилгын явц, инженерийн шугам сүлжээ, газар
          чөлөөлөлт, санхүүжилтийг нэг орон зайн платформд нэгтгэж, шийдвэр
          гаргалтыг өгөгдөлд түшиглүүлнэ.
        </p>

        <dl className={s.stats}>
          {stats.map((st) => (
            <div key={st.label} className={s.stat}>
              <dt className={s.statValue}>{st.value}</dt>
              <dd className={s.statLabel}>{st.label}</dd>
            </div>
          ))}
        </dl>

        {/* Төслийн нийт гүйцэтгэл — тоог нэг харцаар ойлгуулах зурвас */}
        <div className={s.progress}>
          <div
            className={s.progressTrack}
            role="progressbar"
            aria-valuenow={progress ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Төслийн нийт гүйцэтгэл"
          >
            <span className={s.progressFill} style={{ width: `${progress ?? 0}%` }} />
          </div>
          <span className={s.progressNote}>Төслийн нийт гүйцэтгэл {progress != null ? pct(progress, 2) : '…'}</span>
        </div>
      </main>

      {/* Баримт үзэгч — порталынхтай ИЖИЛ компонент, нэвтрэх шаардлагагүй */}
      <DocViewer open={docs} onClose={() => setDocs(false)} />
    </div>
  );
}
