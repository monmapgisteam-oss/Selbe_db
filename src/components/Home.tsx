'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { LocaleToggle } from '@/components/LocaleToggle';
import { useAuth } from './AuthGate';
import { useAsync } from '@/lib/useAsync';
import {
  loadBudget, loadClearance, loadHeadline, loadHousing, loadProjectProgress, loadSocial,
} from '@/lib/live';
import { mntShort, num, pct } from '@/lib/format';
import { DocViewer } from './DocViewer';
import { ExecKpi } from './ExecKpi';
import { Icon } from './Icon';
import { Ring } from './MiniChart';
import type { ViewKey } from '@/lib/services';
import s from './home.module.css';

/** Нүүрт товч болж гарах харагдац — мета нь `VIEWS`-ээс ирнэ (`Root` шүүнэ) */
export type HomeView = {
  key: ViewKey;
  title: string;
  desc: string;
  /** ⚠️ Ашиглагдахаа больсон (нэг акцент) — `Root`-ийн дамжуулалттай нийцүүлж үлдээв */
  hue: string;
};

/** Сэдвийн бүлэг — `HOME_SECTIONS` + хамрагдаагүйг цуглуулсан «Бусад» */
export type HomeGroup = {
  id: string;
  title: string;
  views: HomeView[];
};

/** Нэг KPI нүд — бүгд АМЬД (services.ts-ээс), ачаалж байхад «…» */
type Kpi = {
  key: string;
  value: string;
  label: string;
  /** Утгын доорх нэмэлт мөр — задаргаа, хувь, эсвэл эх сурвалж */
  sub?: string;
  icon: string;
  /** Дарахад очих харагдац — байхгүй бол зөвхөн уншина */
  view?: ViewKey;
  /** Статусын өнгө — ЦАГИРАГТ л нөлөөлнө (утга нь нэгдсэн аястай үлдэнэ) */
  tone?: string;
  /**
   * Нүдний акцент өнгө. Дүрс, хүрээ, цагираг, утга бүгд үүнээс.
   * ⚠️ Hex ШУУД бичихгүй — тэр нь гэрэл/харанхуй горимд дагахгүй.
   */
  hue?: string;
  /**
   * Цагирагт үзүүлэх ХУВЬ (0…100).
   * ⚠️ ЗӨВХӨН бодит харьцаа байвал. Хүн амын тоо мэт харьцаагүй үзүүлэлтэд
   * цагираг зурах гэж хуваарь ЗОХИОХГҮЙ.
   */
  ring?: number;
};

/**
 * НҮҮРИЙН БҮХ ҮЗҮҮЛЭЛТ — таван ачаалагчаас.
 *
 * ⚠️ 2026-08-18 (хэрэглэгчийн хүсэлт): нүүр нь «лендинг» биш ЕРӨНХИЙ KPI
 * ДАШБОАРД болов. Тиймээс өмнөх 5 үзүүлэлт дээр бусад хэсгээс (санхүүжилт,
 * газар чөлөөлөлт, нийгмийн үйлчилгээ, орон сууц) гол тоонуудыг ТАТАЖ нэгтгэв —
 * хэрэглэгч дотогш орохоос өмнө төслийн бүтэн зургийг харна.
 *
 * ⚠️ Бүх ачаалагч `cached` тул порталд орсны дараа ДАХИН татагдахгүй — эдгээр
 * нь тэр хэсгүүдийн кэшийг УРЬДЧИЛАН дүүргэж, шилжилтийг хурдасгана.
 */
function useHomeKpis(): { main: Kpi[]; more: Kpi[]; progress: number | null } {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const h = useAsync(loadHeadline, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hh = useAsync(loadHousing, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const p = useAsync(loadProjectProgress, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const c = useAsync(loadClearance, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const b = useAsync(loadBudget, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const so = useAsync(loadSocial, []);

  const hd = h.state === 'ready' ? h.data : null;
  const hs = hh.state === 'ready' ? hh.data : null;
  const pp = p.state === 'ready' ? p.data : null;
  const cl = c.state === 'ready' ? c.data : null;
  const bg = b.state === 'ready' ? b.data : null;
  const sc = so.state === 'ready' ? so.data : null;

  /**
   * Төсвийн ГЭРЭЭЛСЭН хувь — гэрээт дүн ÷ нийт төсөв.
   *
   * ⚠️ `transferred` (CF-ийн шилжүүлсэн багана) БИШ: амьд өгөгдөлд тэр нь 0
   * байгаа тул «0% шилжүүлсэн» гэсэн утгагүй мөр гарч, төсөв огт хөдлөөгүй
   * мэт төөрөгдүүлж байв. Гэрээлсэн дүн нь бодитоор бөглөгдсөн бөгөөд
   * төсвийн хэдийг нь ажилд холбосныг шууд хэлнэ.
   */
  const contractPct = bg && bg.total > 0 ? (bg.contract / bg.total) * 100 : null;

  return {
    // ГОЛ ДӨРӨВ — том нүд, дээд эгнээнд
    main: [
      {
        key: 'prog',
        value: pp ? pct(pp.actual, 1) : '…',
        label: tr('Төслийн гүйцэтгэл'),
        sub: pp ? tr('{0}% багц бүртгэгдсэн', num(pp.coverage, 0)) : undefined,
        icon: 'chart',
        view: 'tsogts',
        hue: 'var(--data)',
        ring: pp?.actual,
      },
      {
        key: 'fin',
        value: bg ? mntShort(bg.total) : '…',
        label: tr('Нийт төсөв'),
        sub: contractPct != null ? tr('{0} гэрээлсэн', pct(contractPct, 0)) : undefined,
        icon: 'calc',
        view: 'finance',
        hue: 'var(--data)',
        // Цагираг нь НИЙТ ТӨСВИЙГ биш, түүний ГЭРЭЭЛСЭН хувийг үзүүлнэ
        ring: contractPct ?? undefined,
      },
      {
        key: 'clear',
        value: cl?.pct != null ? pct(cl.pct, 1) : '…',
        label: tr('Газар чөлөөлөлт'),
        sub: cl ? tr('{0} талбар үлдсэн · {1} га', num(cl.remaining), num(cl.remainingHa, 1)) : undefined,
        icon: 'polygon',
        view: 'gazar',
        hue: 'var(--data)',
        ring: cl?.pct ?? undefined,
        tone: cl?.pct == null ? undefined
          : cl.pct >= 95 ? 'var(--good)' : cl.pct >= 80 ? 'var(--warn)' : 'var(--bad)',
      },
      {
        key: 'pop',
        value: hd ? num(hd.population) : '…',
        label: tr('Хамрагдах хүн ам'),
        sub: hs ? tr('{0} өрхийн орон сууц', num(hs.ail)) : undefined,
        icon: 'users',
        view: 'irged',
        hue: 'var(--data)',
        // ⚠️ Цагираг ЗОРИУДААР байхгүй — хүн ам нь хувь БИШ, харьцуулах суурьгүй
      },
    ],
    // НЭМЭЛТ — жижиг нүд, доод эгнээнд
    more: [
      { key: 'area', value: hd ? tr('{0} га', num(hd.areaHa, 1)) : '…', label: tr('Төслийн талбай'), icon: 'frame', view: 'plan', hue: 'var(--data)' },
      { key: 'green', value: hd?.greenHa != null ? tr('{0} га', num(hd.greenHa, 1)) : '…', label: tr('Ногоон байгууламж'), icon: 'droplet', view: 'plan', hue: 'var(--data)' },
      { key: 'blocks', value: hs ? num(hs.blocks) : '…', label: tr('Барилгын блок'), icon: 'building', view: 'tsogts', hue: 'var(--data)' },
      { key: 'contract', value: bg ? mntShort(bg.contract) : '…', label: tr('Гэрээт дүн'), icon: 'file', view: 'finance', hue: 'var(--data)' },
      { key: 'social', value: sc ? num(sc.totalN) : '…', label: tr('Нийгмийн байгууламж'), icon: 'grid', view: 'irged', hue: 'var(--data)' },
      { key: 'cleared', value: cl ? num(cl.cleared) : '…', label: tr('Чөлөөлсөн талбар'), icon: 'target', view: 'gazar', hue: 'var(--data)' },
    ],
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
 * НҮҮР ХУУДАС — ЕРӨНХИЙ KPI ДАШБОАРД.
 *
 * ⚠️ 2026-08-18 (хэрэглэгчийн шийдвэр): ДЭВСГЭР ЗУРАГ ХАСАГДАВ. Урьд нь 444KB
 * агаарын зураг + харанхуй scrim + тор дээр цагаан бичиг байсан — гоё ч
 * (а) 444KB нь эхний зурагтыг удаашруулдаг, (б) хагас тунгалаг бичиг нь
 * үзүүлэлтийн тоог уншихад муу, (в) порталын дотоод дүр төрхөөс ТЭС өөр тул
 * орох үед харагдац огцом үсэрдэг байв. Одоо порталтай ИЖИЛ гадаргуу, ижил
 * токен — нүүр нь порталын нэг хэсэг мэт үргэлжилнэ.
 */
export function Home({
  onEnterAll,
  groups,
  onEnterView,
  isSuper = false,
}: {
  /** «Нэвтрэх» / «Орох» — эрхийн дагуу орох цэгт хүргэнэ */
  onEnterAll: () => void;
  groups: HomeGroup[];
  onEnterView: (key: ViewKey) => void;
  /**
   * «Төслийн ерөнхий үзүүлэлтүүд» самбар ЗӨВХӨН супер хэрэглэгчид (2026-08-21,
   * хэрэглэгчийн хүсэлт) — нүүр нь дэд самбар болж, энгийн хэрэглэгчид зөвхөн
   * платформын хэсгүүдийн навигаци үлдэнэ.
   */
  isSuper?: boolean;
}) {
  const { status, user, signOut } = useAuth();
  const { main, more, progress } = useHomeKpis();

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

  /** KPI нүд — `view` байвал дарж болох товч, эс бөгөөс зүгээр л уншина */
  const tile = (k: Kpi, big: boolean) => {
    const text = (
      <>
        {/* ⚠️ Утгын өнгө нь НЭГДСЭН аяс (`--kpi`). Статусыг ЦАГИРАГ илэрхийлнэ. */}
        <span className={`${s.kpiValue} num`} style={{ color: 'var(--kpi, var(--ink))' }}>
          {k.value}
        </span>
        {k.sub && <span className={s.kpiSub}>{k.sub}</span>}
      </>
    );
    const inner = (
      <>
        <span className={s.kpiTop}>
          <span className={s.kpiIcon}><Icon name={k.icon} size={big ? 16 : 14} /></span>
          <span className={s.kpiLabel}>{k.label}</span>
          {k.view && <span className={s.kpiGo} aria-hidden>→</span>}
        </span>
        {big ? (
          <span className={s.kpiBody}>
            <span className={s.kpiText}>{text}</span>
            {/*
              * ⚠️ Цагираг ЗӨВХӨН бодит хувьтай нүдэнд. Харьцаагүй нүдэнд дүрсийг
              * бүдэг усан тамга болгоно — тэр нь ГРАФИК БИШ, зөвхөн чимэглэл.
              * ⚠️ Цагираг нь СТАТУСЫН өнгийг (`tone`) барина; SVG нь
              * `currentColor` ашигладаг тул энд `color` тавихад хангалттай.
              */}
            <span
              className={`${s.kpiArt} ${k.ring == null ? s.kpiArtFaint : ''}`}
              style={k.tone ? { color: k.tone } : undefined}
              aria-hidden
            >
              {k.ring != null
                ? <Ring value={k.ring} size={56} width={7} />
                : <Icon name={k.icon} size={40} />}
            </span>
          </span>
        ) : text}
      </>
    );
    const cls = `${s.kpi} ${big ? s.kpiBig : ''}`;
    // ⚠️ `--kpi` нь дүрс, хүрээ, цагираг, утгын өнгийг НЭГ ЦЭГЭЭС удирдана
    const style = k.hue ? ({ ['--kpi']: k.hue } as CSSProperties) : undefined;
    return k.view ? (
      <button
        key={k.key}
        type="button"
        className={cls}
        style={style}
        onClick={() => onEnterView(k.view!)}
        title={tr('{0} — дэлгэрэнгүй рүү очих', k.label)}
      >
        {inner}
      </button>
    ) : (
      <div key={k.key} className={cls} style={style}>{inner}</div>
    );
  };

  return (
    <div className={s.home}>
      {/* ── Дээд навигацийн зурвас — лого · цэс · нэвтрэлт ── */}
      <header className={s.navbar}>
        <div className={s.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className={s.logo} />
          <span className={s.brandDivider} aria-hidden />
          <span className={s.brandText}>
            <b>{tr('СЭЛБЭ')}</b> {tr('20 минутын хот')}
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

            {/* «Баримт бичиг» — задрахгүй, ГАНЦ товч. */}
            <button
              type="button"
              className={s.menuBtn}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(null); }}
              onClick={() => { setOpen(null); setDocs(true); }}
            >
              {tr('Баримт бичиг')}
            </button>
          </nav>
        )}

        <div className={s.spacer} aria-hidden />

        <div className={s.auth}>
          <LocaleToggle />
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
                {tr('Порталд орох')}
                <span className={s.signInArrow} aria-hidden>→</span>
              </button>
              <button type="button" className={s.signBtn} onClick={signOut}>{tr('Гарах')}</button>
            </>
          ) : (
            <button type="button" className={`${s.signBtn} ${s.signIn}`} onClick={onEnterAll}>
              {tr('Нэвтрэх')}
              <span className={s.signInArrow} aria-hidden>→</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Дашбоард — ЗӨВХӨН СУПЕР (дэд самбар, 2026-08-21) ── */}
      {isSuper && (
      <main className={s.board}>
        <header className={s.boardHead}>
          <div>
            <h1 className={s.title}>{tr('Төслийн ерөнхий үзүүлэлтүүд')}</h1>
            {/* ⚠️ Албан ёсны үг хэллэг — бүтэн өгүүлбэр, үйл үгээр төгсөнө */}
            <p className={s.lede}>
              {tr('Төслийн үндсэн үзүүлэлтийг ArcGIS мэдээллийн сангаас шууд нэгтгэн харуулав.')}
            </p>
          </div>
          {/* Төслийн нийт гүйцэтгэл — толгойн баруун талд, нэг харцаар */}
          <div className={s.progressBox}>
            <span className={s.progressTop}>
              <span className={s.progressLabel}>{tr('Нийт гүйцэтгэл')}</span>
              <span className={`${s.progressPct} num`}>{progress != null ? pct(progress, 2) : '…'}</span>
            </span>
            <div
              className={s.progressTrack}
              role="progressbar"
              aria-valuenow={progress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={tr('Төслийн нийт гүйцэтгэл')}
            >
              <span className={s.progressFill} style={{ width: `${progress ?? 0}%` }} />
            </div>
          </div>
        </header>

        {/* ГОЛ дөрөв — том нүд */}
        <section className={s.kpiMain} aria-label={tr('Гол үзүүлэлт')}>
          {main.map((k) => tile(k, true))}
        </section>

        {/* НЭМЭЛТ зургаа — жижиг нүд */}
        <section className={s.kpiMore} aria-label={tr('Нэмэлт үзүүлэлт')}>
          {more.map((k) => tile(k, false))}
        </section>

        {/* Удирдлагад зориулсан амьд KPI үнэлгээ — карт дарж холбоотой харагдац руу */}
        <ExecKpi onView={onEnterView} />
      </main>
      )}

      {/* Баримт үзэгч — порталынхтай ИЖИЛ компонент, нэвтрэх шаардлагагүй */}
      <DocViewer open={docs} onClose={() => setDocs(false)} />
    </div>
  );
}
