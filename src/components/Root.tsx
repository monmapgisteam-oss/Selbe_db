'use client';

// ⚠️ @arcgis/core-аас ӨМНӨ ачаалагдах ЁСТОЙ — UBHUB ортофотогийн console-алдааг
// шүүхийн тулд ArcGIS-ийн Logger `console.error`-оо хадгалахаас өмнө patch хийнэ.
import '@/lib/silenceOrthoLogs';
import { t as tr } from '@/lib/i18nCore';

import dynamic from 'next/dynamic';
import { useEffect, useReducer, useState } from 'react';
import { Home } from './Home';
import { Landing } from './Landing';
import { AuthNotice, useAuth } from './AuthGate';
import { resolveAccess, roleOf, subscribe } from '@/lib/permissions';
import {
  ALL_MODE_HIDE,
  DEFAULT_VIEW,
  HOME_SECTIONS,
  ROLE_ACCESS,
  VIEWS,
  VIEW_BY_KEY,
  roleForUser,
  type ViewKey,
} from '@/lib/services';

/**
 * АППЫН ҮНДЭС — НҮҮР vs ПОРТАЛ.
 *
 * Орох горим URL-д тусна (F5, Back дэмжинэ):
 *   · `?all=1&v=<харагдац>` — портал: дээд навигацид БҮХ харагдац.
 *   · юу ч биш              — дэвсгэр зурагтай НҮҮР хуудас.
 *
 * ⚠️ `?g=<сэдэв-id>` нь ХУУЧИН формат — навигацийг сэдвээр хязгаарладаг байсныг
 * 2026-08-13-нд хассан. Хуучин холбоос ирвэл «бүх» гэж үзнэ.
 *
 * `writeParams` (Portal) нь зөвхөн өөрийн патчилсан түлхүүрийг устгадаг тул
 * харагдац соливол `all` хадгалагдана.
 */
const Portal = dynamic(() => import('./Portal'), {
  ssr: false,
  loading: () => (
    <div
      style={{ height: '100dvh', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: '0.85rem' }}
    >
      {tr('Сэлбэ порталыг ачаалж байна…')}
    </div>
  ),
});

/** Нэвтрэлтээс буцаж ирэхэд орох цэгийг хадгалах түлхүүр (view key эсвэл `all:<id>`) */
const PENDING_KEY = 'selbe-pending-view';

/** Орсон горим: null = нүүр, 'all' = бүх харагдац, эсвэл навигацид гарах харагдацууд */
type NavScope = null | 'all' | ViewKey[];

/**
 * ⚠️ 2026-08-13: СЭДВИЙН ХЯЗГААРЛАЛТЫГ ХАСАВ. Урьд нь сэдвээр орвол дээд
 * навигацид зөвхөн тэр сэдвийн харагдац + `ALWAYS_NAV_VIEWS` гарч, үлдсэн нь
 * НУУГДДАГ байв (жиш. «Барилгын хяналт»-аар орход дашбоард, төлөвлөгөө,
 * гүйцэтгэл, иргэд дөрөв алга болно). Хэрэглэгч өөр хэсэг рүү очихын тулд
 * нүүр рүү буцаж, дахин орох шаардлагатай байсан — нэмэлт алхам, төөрөгдөл.
 *
 * Одоо сэдэв нь зөвхөн ОРОХ ЦЭГ: аль ч цэгээс орсон навигацид БҮГД гарна
 * (эрхээр л шүүгдэнэ). Сэдвийн бүлэглэл нь нүүр хуудсанд хэвээр ажиллана.
 *
 * ⚠️ Хуучин `?g=<сэдэв>` холбоосууд ажилласаар байна — тэдгээрийг «бүх» гэж
 * үзнэ. Хүчингүй болгож 404 өгөх шалтгаан алга.
 */
const scopeFromUrl = (): NavScope => {
  const p = new URLSearchParams(window.location.search);
  if (p.get('all') === '1') return 'all';
  if (p.get('g')) return 'all';
  const v = p.get('v');
  // ⚠️ `Object.hasOwn` — URL-ын утга хэрэглэгчийн гар дор: `?v=__proto__` нь
  //    энгийн индексжүүлэлтээр prototype-ийн гишүүнийг «олж» худал true өгнө.
  if (v && Object.hasOwn(VIEW_BY_KEY, v)) return 'all';
  return null;
};

export default function Root() {
  const { authorized, signIn, status, user } = useAuth();
  const [scope, setScope] = useState<NavScope>(scopeFromUrl);

  /** Эрхийн store өөрчлөгдвөл (super admin засвар) дахин тооцоолно */
  const [, forcePerms] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribe(forcePerms), []);

  /**
   * Нүүр хуудсан дээр байхад Portal (том ArcGIS chunk)-ыг ДЭВСГЭРТ урьдчилан
   * татна — «Орох» дарахад шилжилт шуурхай болно (chunk аль хэдийн ачаалагдсан).
   */
  useEffect(() => { void import('./Portal'); }, []);

  /**
   * ХЭРЭГЛЭГЧИЙН ЭРХ → навигацийн хүрээ. `permissions` store-оос (override эсвэл
   * хатуу суурь). Нэвтрэлт унтраалттай (`off`, dev) үед бүх эрхтэй. Нэвтэрсэн бол
   * `AuthGate` эрхгүй бүртгэлийг оруулахгүй тул эрх ҮРГЭЛЖ олдоно.
   */
  const access = resolveAccess(user?.username) ?? (status === 'off' ? { views: 'all' as const, docs: true } : null);
  // ⚠️ Админ панел зөвхөн ЖИНХЭНЭ super үүрэгт (GRANT_ALL-аас хамааралгүй)
  const hardSuper = roleForUser(user?.username) === 'super';
  const isSuper = hardSuper || status === 'off';
  // ⚠️ Хатуу super-ийг НИКОГДА түгжихгүй: UserAdmin дээр санамсаргүй бүх view-г
  //    унтраасан override байсан ч, super нь ҮРГЭЛЖ бүх эрхтэй — эс бөгөөс өөрийгөө
  //    админ панелаас гаргаж, засах арга үгүй болно (noAccess дэлгэц Portal-ыг орлоно).
  const allowed: ViewKey[] | 'all' = hardSuper ? 'all' : (access?.views ?? 'all');

  /** Дурын хүрээг зөвшөөрсөн харагдацуудаар хайчилна */
  const clamp = (sc: NavScope): NavScope => {
    if (!sc || allowed === 'all') return sc;
    if (sc === 'all') return allowed;
    return sc.filter((v) => allowed.includes(v));
  };

  /**
   * Нэвтрэнгүүт эрхийн дагуу орох: бүх эрхтэй → бүгд; бусад → үүргийн `home`
   * харагдац (эрхэд нь байвал), эс бөгөөс эхний зөвшөөрөгдсөн харагдац.
   * ⚠️ `home`-ыг мөрддөг тул `ROLE_ACCESS.views` массивын ДАРААЛАЛ өөрчилвөл ч
   *    хэрэглэгч зөв нүүр харагдацдаа орно (өмнө нь allowed[0]-д хэврэгээр найдаж байв).
   */
  const openEntry = () => {
    if (allowed === 'all') { openAll(); return; }
    if (!allowed.length) return;
    // ⚠️ `roleOf` — override-ыг тооцно: панелаас нэмсэн инженер `guitsetgel`
    //    нүүртэйгээ орно (урьд нь хатуу жагсаалтаас л авдаг тул `plan`-д унадаг байв)
    const role = roleOf(user?.username);
    const home = role ? ROLE_ACCESS[role]?.home : undefined;
    openView(home && allowed.includes(home) ? home : allowed[0]);
  };

  /** Нэвтрэлтээс буцаж эрх авмагц хүлээгдэж буй цэгт орно */
  useEffect(() => {
    if (!authorized) return;
    const p = sessionStorage.getItem(PENDING_KEY);
    if (!p) return;
    sessionStorage.removeItem(PENDING_KEY);
    if (p === 'enter' || p === 'all') openEntry();
    // ⚠️ sessionStorage ч гаднын утга — prototype түлхүүрээс хамгаална
    else if (Object.hasOwn(VIEW_BY_KEY, p)) openView(p as ViewKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  /** Back/Forward — URL-аас горимыг сэргээнэ */
  useEffect(() => {
    const onPop = () => setScope(scopeFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** БҮХ сэдэв (Удирдлага) — бүх харагдац навигацид */
  const openAll = () => {
    /* Сүүлд ажилласан харагдацыг сэргээнэ (Portal хадгалдаг) — өдөр бүр ижил
       хэсэгт ажилладаг хэрэглэгч «Орох» дараад шууд ажлын цэгтээ очно.
       ⚠️ localStorage нь гаднын утга: харагдацын түлхүүр мөн эсэхийг
       Object.hasOwn-оор шалгана (`__proto__` г.м. prototype халдлагаас), мөн
       навигациас нуугдсан (ALL_MODE_HIDE) харагдацад буцаахгүй. */
    let last: string | null = null;
    try { last = localStorage.getItem('selbe-last-view'); } catch { /* хаалттай орчин */ }
    const v = last && Object.hasOwn(VIEW_BY_KEY, last) && !ALL_MODE_HIDE.includes(last as ViewKey)
      ? (last as ViewKey) : DEFAULT_VIEW;
    const u = new URL(window.location.href);
    u.searchParams.set('v', v);
    u.searchParams.set('all', '1');
    u.searchParams.delete('g');
    window.history.pushState({}, '', u);
    setScope('all');
  };

  /**
   * Тодорхой харагдацад орох.
   * ⚠️ Навигацийн хүрээ нь ҮРГЭЛЖ «бүх» — сэдэв нь зөвхөн орох цэг (дээрх
   * `scopeFromUrl`-ийн тайлбарыг үз). `?g=` бичихээ больсон.
   */
  const openView = (key: ViewKey) => {
    const u = new URL(window.location.href);
    u.searchParams.set('v', key);
    u.searchParams.set('all', '1');
    u.searchParams.delete('g');
    window.history.pushState({}, '', u);
    setScope('all');
  };

  const enterAll = () => {
    if (authorized) openEntry();
    else { sessionStorage.setItem(PENDING_KEY, 'enter'); signIn(); }
  };

  /**
   * НҮҮР ХУУДАСНААС ХАРАГДАЦАД ШУУД ОРОХ.
   *
   * ⚠️ Нэвтрээгүй бол харагдацын түлхүүрийг `PENDING_KEY`-д хадгална — ArcGIS-аас
   * буцаж ирэхэд дээрх эффект түүнийг уншиж ЯГ тэр цэгт оруулна («Нэвтрэх» дараад
   * дараа нь цэсээ дахин хайх шаардлагагүй).
   */
  const enterView = (key: ViewKey) => {
    if (authorized) openView(key);
    else { sessionStorage.setItem(PENDING_KEY, key); signIn(); }
  };

  /**
   * НҮҮРИЙН СЭДВИЙН КАРТУУД.
   *
   * ⚠️ Нэвтрээгүй үед БҮГДИЙГ харуулна: эрх нь хараахан мэдэгдэхгүй байхад
   * сонголтыг нуувал хэрэглэгч платформд юу байдгийг ч мэдэхгүй. Дарахад
   * нэвтрэлт рүү чиглүүлээд, буцаж ирэхэд тэр цэгт нь оруулна.
   *
   * ⚠️ `HOME_SECTIONS` нь БҮХ харагдацыг хамардаггүй — ердөө `tsogts`, `habea`,
   * `analysis`, `sheet` дөрөв. Дашбоард, төлөвлөгөө, газар, санхүүжилт, тайлан,
   * иргэд нь ямар ч сэдэвт ороогүй. Тэдгээрийг «Бусад» бүлэгт цуглуулахгүй бол
   * нүүрнээс ХҮРЭХ ЗАМГҮЙ болно.
   */
  const shown = VIEWS
    .filter((v) => !ALL_MODE_HIDE.includes(v.key))
    .filter((v) => !authorized || allowed === 'all' || allowed.includes(v.key));
  const meta = (k: ViewKey) => shown.find((v) => v.key === k);

  const covered = new Set(HOME_SECTIONS.flatMap((s) => (s.all ? [] : s.views)));
  const groups = [
    ...HOME_SECTIONS.filter((s) => !s.all).map((s) => ({
      id: s.id,
      title: s.title,
      views: s.views.map(meta).filter((v) => v != null),
    })),
    {
      id: 'other',
      title: tr('Бусад хэсэг'),
      views: shown.filter((v) => !covered.has(v.key)),
    },
  ]
    // Эрхээр шүүсний дараа ХООСОН үлдсэн бүлгийг харуулахгүй
    .filter((g) => g.views.length > 0)
    .map((g) => ({
      id: g.id,
      title: g.title,
      views: g.views.map((v) => ({
        key: v.key, title: v.title, desc: v.desc, hue: v.hue,
      })),
    }));

  const goHome = () => {
    const u = new URL(window.location.href);
    u.searchParams.delete('v');
    u.searchParams.delete('all');
    u.searchParams.delete('g');
    window.history.pushState({}, '', u);
    setScope(null);
  };

  /**
   * ⚠️ Хайчилсан хүрээ ХООСОН бол Portal-ыг ОГТ зурахгүй: Portal хоосон
   * navScope-ыг «бүх эрх» гэж андуурч эрхгүй агуулга харагдаж байсан тул
   * (жиш. эрх нь зөвхөн `plan`-тай хэрэглэгчийн эрхийг бүрмөсөн хассан бол)
   * эндээс шүүж «эрх хүрэлцэхгүй» мэдэгдэл харуулна.
   */
  const clamped = clamp(scope);
  const noAccess = Array.isArray(clamped) && !clamped.length;

  return (
    <>
      <AuthNotice />
      {/*
        * ⚠️ НЭВТРЭЛТ ШАЛГАГДАЖ БАЙХАД ЮУ Ч ШИЙДЭХГҮЙ. `checking` төлөвт
        * `authorized` нь `false` тул шууд `Landing` зурвал НЭВТЭРСЭН хэрэглэгч
        * хуудсаа сэргээх бүрд нээлтийн хуудас АНИВЧААД дараа нь самбар руу
        * үсэрнэ. Шалгалт дуустал төвийг сахисан мэдэгдэл үзүүлнэ.
        */}
      {status === 'checking' ? (
        <div
          style={{
            height: '100dvh', display: 'grid', placeItems: 'center',
            color: 'var(--ink-3)', fontSize: '0.85rem',
          }}
        >
          {tr('Нэвтрэлтийг шалгаж байна…')}
        </div>
      ) : scope && authorized ? (
        noAccess ? (
          <div
            role="alert"
            style={{
              height: '100dvh', display: 'grid', placeItems: 'center',
              color: 'var(--ink-3)', fontSize: '0.9rem', textAlign: 'center', padding: 24,
            }}
          >
            <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
              <p style={{ margin: 0 }}>{tr('Таны эрх энэ хэсгийг үзэхэд хүрэлцэхгүй байна.')}</p>
              <button
                type="button"
                onClick={goHome}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: '1px solid var(--line)',
                  background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer',
                }}
              >
                {tr('Нүүр хуудас руу буцах')}
              </button>
            </div>
          </div>
        ) : (
          <Portal
            onHome={goHome}
            navScope={clamped as 'all' | ViewKey[]}
            docsAllowed={access?.docs ?? true}
            isSuper={isSuper}
          />
        )
      ) : authorized ? (
        <Home
          onEnterAll={enterAll}
          groups={groups}
          onEnterView={enterView}
          /* Порталын хажуугийн цэстэй ЯГ ижил эх сурвалж (мөр 291) — нэг
             хэрэглэгчийн эрх хоёр газарт өөрөөр тайлбарлагдахаас сэргийлнэ. */
          docsAllowed={access?.docs ?? true}
          isSuper={isSuper}
        />
      ) : (
        /*
         * ⚠️ НЭВТРЭЭГҮЙ бол KPI самбар ХАРАГДАХГҮЙ (хэрэглэгчийн шийдвэр,
         * 2026-08-20). Урьд нь `Home` нь нэвтрэлтээс үл хамааран нээлттэй
         * байсан — одоо түүний оронд нээлтийн хуудас гарна.
         */
        <Landing />
      )}
    </>
  );
}
