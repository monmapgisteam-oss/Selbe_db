'use client';

import {
  useCallback, useEffect, useRef, useState, type ReactNode,
  type MouseEvent as RMouseEvent, type FocusEvent as RFocusEvent, type PointerEvent as RPointerEvent,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { Icon } from './Icon';
import { VIEWS, VIEW_BY_KEY, ALL_MODE_HIDE, NAV_GROUPS, type ViewKey } from '@/lib/services';
import s from './tree.module.css';

/**
 * Цэсний тэмдэгт — харагдац → хүлээгдэж буй зүйлийн тоо (`navBadges.ts`).
 * ⚠️ 2026-10-06: `null` = эх сурвалж(ууд) уншигдсангүй («мэдэхгүй») — тэмдэг ЗУРАХГҮЙ
 *    (`badgeOf`), `navBadges.mergeNavBadges` өмнөх тоог хадгалахад ялгана.
 */
export type NavBadges = Partial<Record<ViewKey, number | null>>;

/**
 * Зүүн багана — ХОЁР харагдац.
 *
 * ⚠️ Урьд нь энд 6 товч байв (бүс, барилга, инженер, зам, ногоон, хяналт).
 * Тэдгээрийн эхний тав нь БҮГД нэг үйлчилгээ, нэг ерөнхий төлөвлөгөөний хэсэг
 * тул хиймэл хуваалт болж, хэрэглэгч давхаргаа хайхад таван товч нээх
 * шаардлагатай болдог байлаа. Одоо «Ерөнхий мэдээлэл» дарахад БҮХ давхарга нэг
 * жагсаалтад багцалж гарна.
 *
 * ⚠️ Идэвхтэй харагдац дээр ДАХИН дарахад жагсаалт хумигдана/дэлгэгдэнэ — эс
 * бөгөөс жагсаалтыг хаачихсан хэрэглэгч дахин нээх арга олохгүй.
 *
 * ⚠️ 2026-09-30: харагдацууд АЖЛЫН ТӨРЛӨӨР бүлэглэгдэв (`NAV_GROUPS` — Миний
 *    ажил · Батлах · Хяналт · Санхүү · Тайлан · Систем). 23 харагдацын
 *    дугаартай ганц жагсаалтад хэрэглэгч хаанаас эхлэхээ олдоггүй байв.
 *    Дугаар нь бүлгүүдийг дамжин үргэлжилнэ (зөвхөн нүдний зангуу).
 */
export function ViewRail({
  view,
  setView,
  catalogOpen,
  header = false,
  collapsed = false,
  navScope = 'all',
  onDocs,
  docsActive = false,
  onAdmin,
  adminActive = false,
  userName,
  onSignOut,
  badges,
}: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  /** Давхаргын каталогийн багана нээлттэй эсэх — сумны чиглэлээр заана */
  catalogOpen: boolean;
  /**
   * Навигацийн ХҮРЭЭ. `'all'` = БҮХ харагдац; харагдацын жагсаалт бол зөвхөн
   * тэдгээр. ТЭЗҮ баримт нь аль ч тохиолдолд байнга (доор).
   *
   * ⚠️ 2026-08-13-аас хойш `Root` нь ҮРГЭЛЖ `'all'` дамжуулж, эрхээр л хайчилдаг
   * болсон — сэдвийн хязгаарлалт хасагдсан. Жагсаалтын горим нь эрх хязгаарлагдмал
   * хэрэглэгчид л ажиллана.
   */
  navScope?: 'all' | ViewKey[];
  /**
   * Толгойн ХЭВТЭЭ хувилбар — зүүн баганы оронд толгойд таб болж багтана.
   * ⚠️ Тайлбар текст (desc), гарчиг, доод тусламж хасагдаж, зөвхөн дүрс + нэр
   * үлдэнэ: 56px өндөр толгойд бүтэн босоо мод багтахгүй.
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
   *
   * ⚠️ `title` шинж нь зөвхөн хулганы hover-т гарна: гараар (Tab) очсон эсвэл
   *    хүрэлтээр ашиглаж буй хүн дүрс бүр юу болохыг мэдэх арга байгаагүй.
   *    Одоо hover · focus · удаан дарах (≈0.45 с) гурвуулаа ижил хөвөгч шошго
   *    гаргана. `position: fixed` — `.nav` нь `overflow-y: auto` тул дотор нь
   *    absolute байрлуулбал таслагдана.
   * ⚠️ Удаан дарсны дараах `click` нь навигац хийхгүй — хэрэглэгч зөвхөн нэрийг
   *    нь харах гэж дарсан.
   */
  const [tip, setTip] = useState<{ text: string; sub?: string; x: number; y: number } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  useEffect(() => () => { if (pressTimer.current) clearTimeout(pressTimer.current); }, []);
  /* ⚠️ 2026-09-30: ref-д хүрэх бүх логик ТОГТМОЛ callback-уудад — `tipProps`
     нь рендерийн үед дуудагддаг тул түүний дотор ref-д хүрэх нь eslint
     react-hooks/refs (рендерийн үед ref) гэж тэмдэглэгддэг байв. */
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
   *
   * ⚠️ 2026-09-30: урьд нь 23 табтай ХЭВТЭЭ гүйдэг зурвас болдог байв —
   *    таблет дээр хаана юу байгааг харахгүй, хуруугаар гүйлгэж хайна.
   *    Одоо «☰ Одоогийн хэсэг» товч + бүлэглэсэн унжих жагсаалт. Өргөн
   *    дэлгэцэд энэ товч CSS-ээр нуугдаж, жагсаалт ердийнхөөрөө харагдана.
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
  /** Удаан дарсны дараах товшилтыг залгина (дээрх ⚠️) */
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
  /* ⚠️ 2026-10-08: харагдац тус бүрийн тэмдгийн утга — «Хуваарь» дээрх тоо нь зохиогчид БУЦААГДСАН
     илгээлт (`navBadges` → `countPlanReturned`), «хүлээгдэж байна» биш. Бусад харагдац хуучнаараа. */
  /* ⚠️ 2026-10-09: тоо `num()`-аар (мянгатын тусгаарлагч · хэл) — урьд нь түүхий тоо */
  /* ⚠️ 2026-10-09: «Хуваарь»-ын тоо = буцаагдсан + саяхан БАТЛАГДСАН (`countPlanApproved`) — «буцаагдсан»
     гэвэл батлагдсан мэдэгдэл худал нэрлэгдэнэ; хоёуланг багтаасан «шинэ шийдвэр». */
  const badgeLabel = (n: number, k?: ViewKey) => (n
    ? (k === 'huvaari' ? tr('шинэ шийдвэр {0} (буцаагдсан · батлагдсан)', num(n)) : tr('{0} хүлээгдэж байна', num(n)))
    : '');

  {/* «ТЭЗҮ-БОНУ» баримт — харагдацуудтай ИЖИЛ хэлбэрээр.
      Харагдац биш, popup нээдэг тул `aria-current` биш `aria-pressed`.
      ⚠️ 2026-08-17: Урьд нь `header &&` гэж хаагдсан байсан тул БОСОО (зүүн
      багана) горимд огт гардаггүй байв. Одоо хоёуланд. */}
  const docsButton = onDocs ? (
    <button
      type="button"
      aria-pressed={docsActive}
      aria-label={tr('ТЭЗҮ-БОНУ баримт бичиг')}
      title={collapsed ? undefined : tr('ТЭЗҮ ба судалгааны баримт бичиг')}
      className={`${s.item} ${s.docItem} ${docsActive ? s.itemOn : ''}`}
      {...tipProps(tr('ТЭЗҮ-БОНУ'), tr('ТЭЗҮ ба судалгааны баримт бичиг'))}
      onClick={guardClick(onDocs)}
    >
      {!header && <span className={s.no} aria-hidden />}
      <span className={s.icon}><Icon name="file" /></span>
      <span className={s.text}>
        <span className={s.title}>{tr('ТЭЗҮ-БОНУ')}</span>
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

  /* Бүлэг бүрт хүрээнд байгаа харагдацууд; хоосон бүлэг зурагдахгүй.
     ⚠️ `NAV_GROUPS`-д ороогүй харагдац «Бусад» бүлэгт — цэснээс алга болохгүй. */
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
    // Каталогтой харагдацууд — тусдаа бүрэн дэлгэцтэй (дашбоард, анализ) нь үгүй.
    // ⚠️ Толгойн хэвтээ горимд каталог нь зурган дээрх «Давхарга» товчоор
    //    нээгддэг тул таб задардаггүй — сум харуулахгүй. Босоо (зүүн) горимд
    //    л таб дээрх сумаар каталог дэлгэгдэнэ.
    const expandable = !v.standalone && !header;
    const expanded = expandable && on && catalogOpen;
    const n = badgeOf(v.key);
    return (
      <button
        key={v.key}
        type="button"
        aria-current={on}
        /* ⚠️ 2026-09-30: тэмдэгтийн тоо ч нэрэнд — дэлгэц уншигч «3 хүлээгдэж байна» гэж сонсоно */
        aria-label={n ? `${v.title} · ${badgeLabel(n, v.key)}` : v.title}
        /* Дэлгэгдсэн үед нэр харагдаж байгаа тул hover-т ТАЙЛБАРЫГ нь; хураагдсан
           үед өөрийн tooltip (`tipProps`) — давхар гарахгүйн тулд `title`-гүй. */
        title={collapsed && !header ? undefined : v.desc}
        {...(expandable ? { 'aria-expanded': expanded } : {})}
        className={`${s.item} ${on ? s.itemOn : ''} ${extraCls}`}
        {...tipProps(v.title, v.desc)}
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
        {expandable && (
          <span className={`${s.chev} ${expanded ? s.chevOn : ''}`} aria-hidden>›</span>
        )}
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
  /* ⚠️ 2026-10-09: цэсний товчны нийт тэмдгийн `aria-label` — «Хуваарь»-ын тоо нь БУЦААГДСАН илгээлт
     (`badgeLabel`-ийн ⚠️) тул «N хүлээгдэж байна» гэж нийлүүлбэл худал; хоёр хэсгээр нэрлэнэ. */
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

        {/* ТЭЗҮ-БОНУ товч — БҮХ сэдэвт харагдана (харагдацуудын ард).
            ⚠️ Урьд нь «Ерөнхий дашбоард»-ын ард байсан тул тэр харагдацгүй сэдэвт
               алга болдог байв; одоо сэдвээс үл хамааран төгсгөлд байнга. */}
        {/* envhub-ийн «СИСТЕМ» бүлэг шиг — баримт бичиг нь харагдацуудаас
            зураасаар тусгаарлагдсан ӨӨР төрлийн зүйл (popup, харагдац биш). */}
        {docsButton && section('docs', tr('Баримт'), docsButton)}

        {/* СИСТЕМ — цэсний ХАМГИЙН ДООД бүлэг (жагсаалтын төгсгөл).
            ⚠️ 2026-09-30: «Системийн баримт» харагдац ч энд (`NAV_GROUPS.system`)
               — мета/админ зүйлс нэг дор, хамгийн сүүлд.
            ⚠️ Сав нь `.railFoot` — хураагдсан горимд (`.railMin`) гарчиг
               нуугдаж зөвхөн дүрс үлдэнэ. */}
        {(systemViews.length > 0 || onAdmin || onSignOut) && section('system', tr('Систем'), (
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
            {/* ХЭРЭГЛЭГЧ + ГАРАХ (2026-09-23) — нэг мөр: нэр нь тайлбар, дарвал гарна.
                ⚠️ Хураагдсан горимд нэр нуугдаж дүрс үлдэнэ (tooltip-д нэр). */}
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
