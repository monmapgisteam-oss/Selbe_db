'use client';

import {
  useCallback, useEffect, useRef, useState, type ReactNode,
  type MouseEvent as RMouseEvent, type FocusEvent as RFocusEvent, type PointerEvent as RPointerEvent,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { Icon } from './Icon';
import { VIEWS, VIEW_BY_KEY, ALL_MODE_HIDE, NAV_GROUPS, type ViewKey } from '@/lib/services';
import { badgeLabelFor } from './navBadges';
import s from './tree.module.css';

/**
 * Цэсний тэмдэгт — харагдац → хүлээгдэж буй зүйлийн тоо (`navBadges.ts`).
 */
export type NavBadges = Partial<Record<ViewKey, number | null>>;

/**
 * Зүүн багана — ХОЁР харагдац.
 */
export function ViewRail({
  view,
  setView,
  header = false,
  collapsed = false,
  navScope = 'all',
  onDocs,
  docsActive = false,
  onAdmin,
  adminActive = false,
  onSysClose,
  sysCloseActive = false,
  sysClosedNow = false,
  userName,
  onSignOut,
  badges,
}: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  /**
   * Навигацийн ХҮРЭЭ. `'all'` = БҮХ харагдац; харагдацын жагсаалт бол зөвхөн
   * тэдгээр. ТЭЗҮ баримт нь аль ч тохиолдолд байнга (доор).
   */
  navScope?: 'all' | ViewKey[];
  /**
   * Толгойн ХЭВТЭЭ хувилбар — зүүн баганы оронд толгойд таб болж багтана.
   */
  header?: boolean;
  /** «ТЭЗҮ-БОНУ» баримтын popup нээх — байвал табуудын ХАЖУУД нэг бүлэгт орно */
  onDocs?: () => void;
  /** Popup нээлттэй эсэх (идэвхтэй тэмдэг) */
  docsActive?: boolean;
  /**
   * Хэрэглэгчийн эрхийн modal нээх — ЗӨВХӨН super admin-д (`Portal` шийднэ:
   * эрхгүй бол огт дамжуулахгүй тул мөр ч гарахгүй).
   */
  onAdmin?: () => void;
  /** Эрхийн modal нээлттэй эсэх (идэвхтэй тэмдэг) */
  adminActive?: boolean;
  onSysClose?: () => void;
  /** Цонх нээлттэй эсэх (идэвхтэй тэмдэг) */
  sysCloseActive?: boolean;
  /** Систем одоо хаалттай — мөрийн тайлбарт «одоо хаалттай» */
  sysClosedNow?: boolean;
  /** ХУРААГДСАН босоо горим — зөвхөн дүрс үлдэнэ (нэр tooltip-д) */
  collapsed?: boolean;
  /**
   * Нэвтэрсэн хэрэглэгчийн нэр — «Систем» бүлэгт (2026-09-23). Порталын
   * толгойд хэрэглэгчийн мөр байхгүй тул хэн нэвтэрсэн, яаж гарах нь
   * зөвхөн нүүр хуудсанд харагддаг байв.
   */
  userName?: string;
  /** «Гарах» — `AuthGate.signOut`; өгөөгүй бол (auth унтраалттай) мөр гарахгүй */
  onSignOut?: () => void;
  /**
   * Хүлээгдэж буй зүйлийн тоо (2026-09-30) — батлах дараалалд юм байвал
   * цэсэнд тоон тэмдэг гарна. Тоо ирээгүй (`undefined`) эсвэл 0 бол ЮУ Ч
   * зурахгүй — «мэдэхгүй»-г 0 гэж харуулахгүй.
   */
  badges?: NavBadges;
}) {
  /**
   * ХУРААГДСАН ГОРИМЫН TOOLTIP (2026-09-30).
   */
  const [tip, setTip] = useState<{ text: string; sub?: string; x: number; y: number } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  useEffect(() => () => { if (pressTimer.current) clearTimeout(pressTimer.current); }, []);
  const cancelPress = useCallback(() => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }, []);
  const startPress = useCallback((show: () => void) => {
    longPressed.current = false;
    cancelPress();
    pressTimer.current = setTimeout(() => { longPressed.current = true; show(); }, 450);
  }, [cancelPress]);
  /** Удаан дарсан бол `true` (тугийг арилгана) — товшилт/contextmenu-г залгихад */
  const consumeLongPress = useCallback((reset = true) => {
    if (!longPressed.current) return false;
    if (reset) longPressed.current = false;
    return true;
  }, []);

  /**
   * НАРИЙН ДЭЛГЭЦИЙН ЦЭС (≤1180px) — нээлттэй эсэх.
   */
  const [menuOpen, setMenuOpen] = useState(false);
  const railRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!railRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  /** Мөр бүрийн tooltip-ийн үйл явдлууд — зөвхөн хураагдсан босоо горимд */
  const tipProps = (text: string, sub?: string) => {
    if (!collapsed || header) return {};
    const show = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      setTip({ text, sub, x: r.right + 8, y: r.top + r.height / 2 });
    };
    const hide = () => setTip(null);
    return {
      onMouseEnter: (e: RMouseEvent<HTMLElement>) => show(e.currentTarget),
      onMouseLeave: hide,
      onFocus: (e: RFocusEvent<HTMLElement>) => show(e.currentTarget),
      onBlur: hide,
      onPointerDown: (e: RPointerEvent<HTMLElement>) => {
        if (e.pointerType !== 'touch') return;
        const el = e.currentTarget;
        startPress(() => show(el));
      },
      onPointerUp: cancelPress,
      onPointerCancel: () => { cancelPress(); hide(); },
      onContextMenu: (e: RMouseEvent) => { if (consumeLongPress(false)) e.preventDefault(); },
    };
  };
  /** Удаан дарсны дараах товшилтыг залгина (дээрх) */
  const guardClick = (fn: () => void) => () => {
    if (consumeLongPress()) return;
    setTip(null);
    setMenuOpen(false);
    fn();
  };

  const badgeOf = (k: ViewKey): number => {
    const n = badges?.[k];
    return typeof n === 'number' && n > 0 ? n : 0;
  };
  const badgeLabel = (n: number, k?: ViewKey) => (n
    ? (k === 'huvaari'
      ? tr('шинэ шийдвэр {0} (буцаасан · батлагдсан)', num(n))
      : (k ? badgeLabelFor(k, n, num) : null) ?? tr('{0} хүлээгдэж байна', num(n)))
    : '');

  {/* «ТЭЗҮ-БОНУ» баримт — харагдацуудтай ИЖИЛ хэлбэрээр.
      Харагдац биш, popup нээдэг тул `aria-current` биш `aria-pressed`. */}
  const docsButton = onDocs ? (
    <button
      type="button"
      aria-pressed={docsActive}
      aria-label={tr('Баримт бичгийн сан')}
      title={collapsed ? undefined : tr('Баримт бичгийн сан')}
      className={`${s.item} ${s.docItem} ${docsActive ? s.itemOn : ''}`}
      {...tipProps(tr('Баримт бичгийн сан'), tr('Бүлэглэсэн PDF баримтууд'))}
      onClick={guardClick(onDocs)}
    >
      {!header && <span className={s.no} aria-hidden />}
      <span className={s.icon}><Icon name="file" /></span>
      <span className={s.text}>
        <span className={s.title}>{tr('Баримт бичгийн сан')}</span>
      </span>
    </button>
  ) : null;

  /**
   * НАВИГАЦИД харагдах харагдацууд — `navScope`-ийг `Root` бүрэн бодож өгнө.
   * `'all'` = «Удирдлага» (бүгд, `ALL_MODE_HIDE`-аас бусад); эс бөгөөс тэр
   * сэдвийн жагсаалт. Сэдэв солихын тулд «Нүүр» рүү буцна.
   */
  const shown =
    navScope === 'all'
      ? VIEWS.filter((v) => !ALL_MODE_HIDE.includes(v.key))
      : VIEWS.filter((v) => navScope.includes(v.key));
  const inScope = new Set(shown.map((v) => v.key));

  /* Бүлэг бүрт хүрээнд байгаа харагдацууд; хоосон бүлэг зурагдахгүй. */
  const covered = new Set(NAV_GROUPS.flatMap((g) => g.views));
  const groups = [
    ...NAV_GROUPS.filter((g) => g.id !== 'system').map((g) => ({
      id: g.id as string,
      title: g.title,
      views: g.views.filter((k) => inScope.has(k)).map((k) => VIEW_BY_KEY[k]),
    })),
    { id: 'other', title: tr('Бусад'), views: shown.filter((v) => !covered.has(v.key)) },
  ].filter((g) => g.views.length > 0);
  const systemViews = (NAV_GROUPS.find((g) => g.id === 'system')?.views ?? [])
    .filter((k) => inScope.has(k))
    .map((k) => VIEW_BY_KEY[k]);

  /* Дугаар — бүлгүүдийг дамжин үргэлжилнэ (зөвхөн нүдний зангуу) */
  const order = new Map<ViewKey, number>(
    [...groups.flatMap((g) => g.views), ...systemViews].map((v, i) => [v.key, i + 1]),
  );
  const viewButton = (v: (typeof VIEWS)[number], extraCls = '') => {
    const no = order.get(v.key) ?? 0;
    const on = v.key === view;
    const n = badgeOf(v.key);
    return (
      <button
        key={v.key}
        type="button"
        aria-current={on}
        aria-label={n ? `${v.title} · ${badgeLabel(n, v.key)}` : v.title}
        /* Дэлгэгдсэн үед нэр харагдаж байгаа тул hover-т ТАЙЛБАРЫГ нь; хураагдсан
           үед өөрийн tooltip (`tipProps`) — давхар гарахгүйн тулд `title`-гүй. */
        title={collapsed && !header ? undefined : (n ? `${badgeLabel(n, v.key)} — ${v.desc}` : v.desc)}
        className={`${s.item} ${on ? s.itemOn : ''} ${extraCls}`}
        {...tipProps(v.title, n ? `${badgeLabel(n, v.key)} — ${v.desc}` : v.desc)}
        onClick={guardClick(() => setView(v.key))}
      >
        {/* envhub-ийн хэлтсийн жагсаалт шиг дугаарлалт — зөвхөн БОСОО горимд.
            Дараалал нь мэдээлэл БИШ, зөвхөн нүдээр хөтлөх зүүн зангуу. */}
        {!header && <span className={`${s.no} num`} aria-hidden>{String(no).padStart(2, '0')}</span>}
        <span className={s.icon}>
          <Icon name={v.icon} />
          {n > 0 && <span className={`${s.badge} ${s.badgeDot}`} aria-hidden>{n > 99 ? '99+' : n}</span>}
        </span>
        <span className={s.text}>
          <span className={s.title}>{v.title}</span>
          {!header && <span className={s.desc}>{v.desc}</span>}
        </span>
        {n > 0 && <span className={`${s.badge} ${s.badgeInline} num`} aria-hidden>{n > 99 ? '99+' : n}</span>}
      </button>
    );
  };

  /* Толгойн хэвтээ горим — бүлэггүй хавтгай таб (56px өндөрт гарчиг багтахгүй) */
  if (header) {
    return (
      <nav className={s.railRow} aria-label={tr('Харагдац')}>
        {groups.flatMap((g) => g.views).concat(systemViews).map((v) => viewButton(v))}
        {docsButton}
      </nav>
    );
  }

  const section = (key: string, title: string, children: ReactNode, cls = '') => (
    <div key={key} className={`${s.railGroup} ${cls}`} role="group" aria-label={title}>
      <div className={s.railHead} aria-hidden>{title}</div>
      {children}
    </div>
  );

  const totalBadges = shown.reduce((a, v) => a + badgeOf(v.key), 0);
  const retBadges = shown.some((v) => v.key === 'huvaari') ? badgeOf('huvaari') : 0;
  const totalLabel = [badgeLabel(totalBadges - retBadges), badgeLabel(retBadges, 'huvaari')].filter(Boolean).join(' · ');
  const current = VIEW_BY_KEY[view];

  return (
    <nav
      ref={railRef}
      className={`${s.rail} ${collapsed ? s.railMin : ''} ${menuOpen ? s.railOpen : ''}`}
      aria-label={tr('Харагдац')}
    >
      {/* ── Нарийн дэлгэцийн цэсний товч (≤1180px-д л харагдана) ── */}
      <button
        type="button"
        className={s.menuBtn}
        aria-expanded={menuOpen}
        aria-controls="selbe-rail-list"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span className={s.menuBurger} aria-hidden>☰</span>
        <span className={s.menuCurrent}>{current?.title ?? tr('Цэс')}</span>
        {totalBadges > 0 && (
          <span className={`${s.badge} ${s.badgeInline} num`} aria-label={totalLabel}>
            {totalBadges > 99 ? '99+' : totalBadges}
          </span>
        )}
        <span className={s.menuCaret} aria-hidden>{menuOpen ? '▴' : '▾'}</span>
      </button>

      <div className={s.railList} id="selbe-rail-list">
        {groups.map((g) => section(g.id, g.title, g.views.map((v) => viewButton(v))))}

        {/* ТЭЗҮ-БОНУ товч — БҮХ сэдэвт харагдана (харагдацуудын ард). */}
        {/* envhub-ийн «СИСТЕМ» бүлэг шиг — баримт бичиг нь харагдацуудаас
            зураасаар тусгаарлагдсан ӨӨР төрлийн зүйл (popup, харагдац биш). */}
        {docsButton && section('docs', tr('Баримт'), docsButton)}

        {/* СИСТЕМ — цэсний ХАМГИЙН ДООД бүлэг (жагсаалтын төгсгөл). */}
        {(systemViews.length > 0 || onAdmin || onSysClose || onSignOut) && section('system', tr('Систем'), (
          <>
            {systemViews.map((v) => viewButton(v, s.railAction))}
            {onAdmin && (
            <button
              type="button"
              aria-pressed={adminActive}
              aria-label={tr('Хэрэглэгчийн эрх тохируулах')}
              title={collapsed ? undefined : tr('Хэрэглэгчийн эрх тохируулах')}
              className={`${s.item} ${s.railAction} ${adminActive ? s.itemOn : ''}`}
              {...tipProps(tr('Хэрэглэгчийн эрх тохируулах'))}
              onClick={guardClick(onAdmin)}
            >
              <span className={s.no} aria-hidden />
              <span className={s.icon}><Icon name="users" /></span>
              <span className={s.text}>
                <span className={s.title}>{tr('Хэрэглэгчийн эрх тохируулах')}</span>
              </span>
            </button>
            )}
            {onSysClose && (
            <button
              type="button"
              aria-pressed={sysCloseActive}
              aria-label={sysClosedNow ? `${tr('Систем түр хаах')} · ${tr('одоо хаалттай')}` : tr('Систем түр хаах')}
              title={collapsed ? undefined : tr('Систем түр хаах')}
              className={`${s.item} ${s.railAction} ${sysCloseActive ? s.itemOn : ''}`}
              {...tipProps(tr('Систем түр хаах'), sysClosedNow ? tr('одоо хаалттай') : undefined)}
              onClick={guardClick(onSysClose)}
            >
              <span className={s.no} aria-hidden />
              <span className={s.icon}><Icon name="bolt" /></span>
              <span className={s.text}>
                <span className={s.title}>{tr('Систем түр хаах')}</span>
                {sysClosedNow && <span className={s.desc}>{tr('одоо хаалттай')}</span>}
              </span>
            </button>
            )}
            {/* ХЭРЭГЛЭГЧ + ГАРАХ (2026-09-23) — нэг мөр: нэр нь тайлбар, дарвал гарна. */}
            {onSignOut && (
            <button
              type="button"
              aria-label={userName ? `${tr('Гарах')} · ${userName}` : tr('Гарах')}
              title={collapsed ? undefined : (userName ? `${userName} · ${tr('Гарах')}` : tr('Гарах'))}
              className={`${s.item} ${s.railAction}`}
              {...tipProps(tr('Гарах'), userName)}
              onClick={guardClick(onSignOut)}
            >
              <span className={s.no} aria-hidden />
              <span className={s.icon}><Icon name="reset" /></span>
              <span className={s.text}>
                <span className={s.title}>{tr('Гарах')}</span>
                {userName && <span className={s.desc}>{userName}</span>}
              </span>
            </button>
            )}
          </>
        ), s.railFoot)}
      </div>

      {/* Цэс дэлгэгдвэл tooltip хэрэггүй */}
      {tip && collapsed && (
        <div className={s.tip} role="tooltip" style={{ left: tip.x, top: tip.y }}>
          <span className={s.tipTitle}>{tip.text}</span>
          {tip.sub && <span className={s.tipSub}>{tip.sub}</span>}
        </div>
      )}
    </nav>
  );
}
