'use client';

// ⚠️ @arcgis/core-аас ӨМНӨ ачаалагдах ЁСТОЙ — UBHUB ортофотогийн console-алдааг
// шүүхийн тулд ArcGIS-ийн Logger `console.error`-оо хадгалахаас өмнө patch хийнэ.
import '@/lib/silenceOrthoLogs';
import { t as tr } from '@/lib/i18nCore';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { Home } from './Home';
import { Landing } from './Landing';
import { AuthNotice, useAuth } from './AuthGate';
import { remoteReady, resolveAccess, roleOf, subscribe } from '@/lib/permissions';
import { roleAccess } from '@/lib/roleTypes';
import {
  ALL_MODE_HIDE,
  DEFAULT_VIEW,
  HOME_SECTIONS,
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

/**
 * Сүүлд ажилласан харагдац (Portal хадгалдаг) — өдөр бүр ижил хэсэгт ажилладаг
 * хэрэглэгч «Орох» дараад шууд ажлын цэгтээ очно. Хүчингүй бол `DEFAULT_VIEW`.
 * ⚠️ localStorage нь гаднын утга: харагдацын түлхүүр мөн эсэхийг
 *    Object.hasOwn-оор шалгана (`__proto__` г.м. prototype халдлагаас), мөн
 *    навигациас нуугдсан (ALL_MODE_HIDE) харагдацад буцаахгүй.
 * ⚠️ 2026-10-04: `openAll` ба урьдчилан татах (`prefetchView`) ХОЁУЛАА үүгээр —
 *    таамаг ба жинхэнэ орох цэг зөрөхгүй.
 */
function lastOrDefaultView(): ViewKey {
  let last: string | null = null;
  try { last = localStorage.getItem('selbe-last-view'); } catch { /* хаалттай орчин */ }
  return last && Object.hasOwn(VIEW_BY_KEY, last) && !ALL_MODE_HIDE.includes(last as ViewKey)
    ? (last as ViewKey) : DEFAULT_VIEW;
}

/**
 * Хөтөч СУЛ үед нэг удаа ажиллуулна (⚠️ 2026-10-04, урьдчилан татахад) — цэвэрлэх
 * функц буцаана (`useEffect`-д шууд). `requestIdleCallback`-гүй хөтөчид (Safari)
 * богино хоцроолттой `setTimeout`. `timeout` — завгүй хуудсанд ч эцэст нь ажиллана.
 */
function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }
  const t = setTimeout(fn, 1200);
  return () => clearTimeout(t);
}

/** Нэвтрэлтээс буцаж ирэхэд орох цэгийг хадгалах түлхүүр (view key эсвэл `all:<id>`) */
const PENDING_KEY = 'selbe-pending-view';

/** Орсон горим: null = нүүр, 'all' = бүх харагдац, эсвэл навигацид гарах харагдацууд */
type NavScope = null | 'all' | ViewKey[];

/**
 * ⚠️ 2026-08-13: СЭДВИЙН ХЯЗГААРЛАЛТЫГ ХАСАВ. Урьд нь сэдвээр орвол дээд
 * навигацид зөвхөн тэр сэдвийн харагдац + тогтмол дөрөв (газар · санхүү ·
 * анализ · тайлан) гарч, үлдсэн нь
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
  const { authorized, signIn, signOut, status, user, accessLost, recheckPerms } = useAuth();
  const [scope, setScope] = useState<NavScope>(scopeFromUrl);

  /** Эрхийн store өөрчлөгдвөл (super admin засвар) дахин тооцоолно */
  const [, forcePerms] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribe(forcePerms), []);

  /**
   * Нүүр хуудсан дээр байхад Portal (том ArcGIS chunk)-ыг ДЭВСГЭРТ урьдчилан
   * татна — «Орох» дарахад шилжилт шуурхай болно (chunk аль хэдийн ачаалагдсан).
   *
   * ⚠️ 2026-10-04 (ачааллын аудит): mount-ын ДАРУЙ биш, хөтөч СУЛ болоход
   *    (`whenIdle`). `import()` нь chunk-ийг татаад ГҮЙЦЭТГЭДЭГ (ArcGIS-ийн
   *    модулиуд ч) — урьд нь нүүр/нээлтийн хуудасны анхны зурах, нэвтрэлтийн
   *    шалгалт, KPI-ийн хүсэлттэй зэрэг үндсэн thread-ийг эзэлдэг байв.
   *    `?v=…` холбоосоор шууд орсон бол Portal өөрөө нэн даруй ачаалагдана.
   */
  useEffect(() => whenIdle(() => {
    import('./Portal').catch(() => { /* жинхэнэ нээлтэд `dynamic()` дахин оролдоно */ });
  }), []);

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
  /**
   * ⚠️ FAIL-CLOSED (2026-09-16-ны гүн шалгалт). Урьд нь `access?.views ?? 'all'`
   *    байв — `resolveAccess` нь `null` буцаах ХОЁР тохиолдолд (бүртгэлгүй хүн,
   *    УСТГАГДСАН аккаунт) эрх ОЛГОХ тийш унадаг байлаа.
   *
   *    Практикт `AuthGate` тэднийг `hasAccess === false`-ээр `denied` төлөвт
   *    барьдаг тул эрх алдагдаагүй. ГЭХДЭЭ тэр нь ГАНЦ хамгаалалт: `AuthGate`-д
   *    гарсан ямар ч алдаа (эсвэл ирээдүйд шинэ нэвтрэх зам) энэ анхдагчаар
   *    дамжин ШУУД бүх харагдац нээнэ. Гүн хамгаалалтын зарчмаар энд ч хаана.
   *
   *    `status === 'off'` (dev, нэвтрэлт унтраалттай) үед дээрх `access` нь
   *    аль хэдийн `{ views: 'all' }` болдог тул энэ өөрчлөлт dev-д нөлөөгүй.
   */
  const allowed: ViewKey[] | 'all' = hardSuper ? 'all' : (access?.views ?? []);

  /** Дурын хүрээг зөвшөөрсөн харагдацуудаар хайчилна */
  const clamp = (sc: NavScope): NavScope => {
    if (!sc || allowed === 'all') return sc;
    if (sc === 'all') return allowed;
    return sc.filter((v) => allowed.includes(v));
  };

  /** БҮХ сэдэв (Удирдлага) — бүх харагдац навигацид */
  const openAll = () => {
    /* Сүүлд ажилласан харагдацыг сэргээнэ — `lastOrDefaultView`-ийн ⚠️ */
    const v = lastOrDefaultView();
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

  /**
   * Нэвтрэнгүүт эрхийн дагуу орох: бүх эрхтэй → бүгд; бусад → үүргийн `home`
   * харагдац (эрхэд нь байвал), эс бөгөөс эхний зөвшөөрөгдсөн харагдац.
   * ⚠️ `home`-ыг мөрддөг тул `ROLE_ACCESS.views` массивын ДАРААЛАЛ өөрчилвөл ч
   *    хэрэглэгч зөв нүүр харагдацдаа орно (өмнө нь allowed[0]-д хэврэгээр найдаж байв).
   */
  const openEntry = () => {
    if (allowed === 'all') { openAll(); return; }
    /* ⚠️ ХАРАГДАЦГҮЙ ч нэвтрэх эрхтэй хүнд «Порталд орох» ЮУ Ч хийдэггүй байв
       (2026-09-21) — урьд нь энд чимээгүй `return`. Одоо портал руу орж,
       доорх `noAccess` дэлгэц «харагдац олгогдоогүй — админд хандана уу» гэж
       нэртэй нь хэлнэ. */
    if (!allowed.length) { openAll(); return; }
    // ⚠️ `roleOf` — override-ыг тооцно: панелаас нэмсэн инженер `guitsetgel`
    //    нүүртэйгээ орно (урьд нь хатуу жагсаалтаас л авдаг тул `plan`-д унадаг байв)
    const role = roleOf(user?.username);
    const home = role ? roleAccess(role).home : undefined;
    openView(home && allowed.includes(home) ? home : allowed[0]);
  };

  /** Нэвтрэлтээс буцаж эрх авмагц хүлээгдэж буй цэгт орно */
  useEffect(() => {
    if (!authorized) return;
    /* ⚠️ try/catch (2026-09-15-ны аудит): хатуу нууцлалын тохиргоотой хөтөч
       дээр `sessionStorage`-д хандахад ШИДДЭГ. Энэ нь эффектийн дотор тул
       хамгаалахгүй бол БҮХ апп унаж, зөвхөн root ErrorBoundary-ийн бүтэн
       дэлгэцийн алдаа үлддэг байв. Дээрх `localStorage` аль хэдийн хамгаалсан. */
    let p: string | null = null;
    try {
      p = sessionStorage.getItem(PENDING_KEY);
      if (p) sessionStorage.removeItem(PENDING_KEY);
    } catch { p = null; }
    if (!p) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: нэвтрэлтээс буцаж ирэхэд `sessionStorage` (гаднын систем)-оос хүлээгдэж буй цэгийг уншиж URL + хүрээг тавина; рендер дотор тооцож болохгүй (history.pushState гаднын нөлөө)
    if (p === 'enter' || p === 'all') openEntry();
    // ⚠️ sessionStorage ч гаднын утга — prototype түлхүүрээс хамгаална
    else if (Object.hasOwn(VIEW_BY_KEY, p)) openView(p as ViewKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  /** Back/Forward — URL-аас горимыг сэргээнэ */
  /* ⚠️ 2026-09-30: ХОЙШЛУУЛЖ (`setTimeout`) уншина — Portal-ийн popstate сонсогч
     («Гарах уу?» баталгаа, `Portal.inPortalUrl`) ЭХЭЛЖ ажиллах ёстой: хэрэглэгч
     татгалзвал тэр нь URL-ыг буцааж бичдэг. Энэ сонсогч эхэлж бүртгэгддэг тул урьд
     нь ЭХЭЛЖ ажиллаж scope-ыг null болгоод, «Үгүй» гэсэн ч Portal unmount болж
     хадгалаагүй ажил алга болдог байв (URL портал, дэлгэц нүүр — зөрнө).
     ⚠️ Микро-даалгавар (`queueMicrotask`) ХАНГАЛТГҮЙ: сонсогч бүрийн дараа
     микро-даалгаврууд ажилладаг тул Portal-ийн сонсогчоос ӨМНӨ гүйнэ. */
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onPop = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; setScope(scopeFromUrl()); }, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (t) clearTimeout(t);
    };
  }, []);

  const enterAll = () => {
    if (authorized) openEntry();
    /* ⚠️ Бичилт унавал нэвтрэлт ЗОГСОХГҮЙ — зөвхөн буцаж ирэхэд хүлээгдсэн
       цэг рүү үсрэхгүй (ач холбогдол бага). Хамгаалахгүй бол «Нэвтрэх» огт
       ажиллахгүй болно. */
    else { try { sessionStorage.setItem(PENDING_KEY, 'enter'); } catch { /* нууцлалын горим */ } signIn(); }
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
    else { try { sessionStorage.setItem(PENDING_KEY, key); } catch { /* нууцлалын горим */ } signIn(); }
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
  const clampedNow = clamp(scope);
  /* ⚠️ 2026-10-06 (аудит): `clamp()` рендер бүрт ШИНЭ массив буцаадаг (эрхийн poll 15 с–5 мин
     тутам рендерлэнэ) — Portal-ын эрхийн guard эффект (`navScope` deps) дахин дахин ажиллаж
     «Гарах уу?» асуулт давтагдах / чимээгүй шилжих эрсдэлтэй байв. АГУУЛГЫН түлхүүрээр л
     шинэ лавлагаа үүсгэнэ. */
  const clampedKey = clampedNow == null ? '' : clampedNow === 'all' ? 'all' : `[${clampedNow.join(',')}]`;
  const clamped = useMemo<NavScope>(
    () => (clampedKey === '' ? null
      : clampedKey === 'all' ? 'all'
        : (clampedKey.slice(1, -1).split(',').filter(Boolean) as ViewKey[])),
    [clampedKey],
  );
  const noAccess = Array.isArray(clamped) && !clamped.length;

  /**
   * ⚠️ 2026-09-30: АЖИЛЛАЖ БАЙХАД ЭРХ ХАСАГДВАЛ PORTAL-ЫГ УСТГАХГҮЙ.
   *    Урьд нь үечилсэн шалгалт `denied` болгомогц `authorized` худал болж
   *    Portal unmount хийгдэж, хадгалаагүй бөглөлт/хуваарь/санхүүгийн засвар
   *    чимээгүй алга болдог байв. Одоо СҮҮЛИЙН хүчинтэй хүрээгээр Portal-ыг
   *    амьд үлдээж, дээр нь `AuthNotice`-ийн хаалтын цонх гарна (ард нь
   *    ажиллах боломжгүй). Эрх сэргэвэл цонх хаагдаж ажил үргэлжилнэ.
   * ⚠️ Хүрээг хадгалах шалтгаан: эрх хасагдсаны дараа `access` нь `null` →
   *    `clamped` хоосон → Portal-ын оронд «эрх хүрэлцэхгүй» дэлгэц гарч
   *    мөн л unmount болно.
   */
  /* ⚠️ 2026-09-30: ref биш STATE — «рендер дотор ref бичих/унших» (eslint
     react-hooks/refs) оронд React-ийн «өмнөх рендерийн мэдээлэл хадгалах»
     хэв: хүчинтэй хүрээ ӨӨРЧЛӨГДСӨН үед л (агуулгын түлхүүрээр тулгана —
     `clamped` массив рендер бүрт шинэ лавлагаатай) рендер дотор setState.
     React үүнийг шууд дахин зурна; commit-д хүрэх үр дүн урьдынхтай ижил. */
  const [lastPortal, setLastPortal] = useState<{ navScope: 'all' | ViewKey[]; docsAllowed: boolean; key: string } | null>(null);
  if (scope && authorized && !noAccess) {
    const navScope = clamped as 'all' | ViewKey[];
    const docsAllowed = access?.docs ?? false;
    const key = `${navScope === 'all' ? 'all' : navScope.join(',')}|${docsAllowed ? 1 : 0}`;
    if (lastPortal?.key !== key) setLastPortal({ navScope, docsAllowed, key });
  }
  const frozen = scope && accessLost && status === 'denied' ? lastPortal : null;

  /* Үүргийн нүүр харагдац — хязгаарлагдмал хэрэглэгчийн нүүрт тодруулна (`openEntry`-тэй ижил эх) */
  const roleHome = (() => {
    const r = roleOf(user?.username);
    return r ? roleAccess(r).home : undefined;
  })();

  /**
   * ⚠️ 2026-10-04 (ачааллын аудит): нүүр хуудсан дээр байхад «Порталд орох»-ын
   *    ОЧИХ харагдацын chunk-ийг ДЭВСГЭРТ татна (`openEntry`-тэй ИЖИЛ сонголт).
   *    Урьд нь «Орох» дарахад Portal зурагдаад ДАРАА НЬ л харагдацын chunk
   *    (жиш. «Ерөнхий дашбоард») хүсэгддэг тул хоёр дахь хүлээлт гардаг байв.
   *    Таамаг буруу (хэрэглэгч өөр карт дарсан) бол зөвхөн нэмэлт татан авалт.
   *    `allowed` массив рендер бүрт шинэ — агуулгын түлхүүрээр (`allowedSig`).
   */
  const onHome = authorized && !scope;
  const allowedSig = allowed === 'all' ? 'all' : allowed.join(',');
  useEffect(() => {
    if (!onHome) return;
    const list: 'all' | ViewKey[] = allowedSig === 'all' ? 'all' : (allowedSig ? (allowedSig.split(',') as ViewKey[]) : []);
    const v = list === 'all'
      ? lastOrDefaultView()
      : list.length ? (roleHome && list.includes(roleHome) ? roleHome : list[0]) : null;
    if (!v) return;
    return whenIdle(() => {
      import('./viewRegistry').then((r) => r.prefetchView(v)).catch(() => { /* жинхэнэ нээлтэд дахин оролдоно */ });
    });
  }, [onHome, allowedSig, roleHome]);
  /* ⚠️ Нэг ч харагдацгүй (админ бүгдийг унтраасан / шинэ бүртгэл) — «энэ хэсэг»
     биш «ерөөсөө» гэсэн ӨӨР мессеж (2026-09-21, `openEntry`-ийн тайлбар). */
  const noViews = Array.isArray(allowed) && !allowed.length;
  /*
   * ⚠️ 2026-10-05: ЭРХИЙН ХҮСНЭГТ УНШИГДААГҮЙ бол ЖИНХЭНЭ шалтгааныг хэлнэ. Хатуу жагсаалтын
   *    хэрэглэгч remote-гүй ч нэвтэрдэг (`AuthGate`: `permsRead = remoteOk || !!hard`), гэвч
   *    урсгалтай харагдац ба override нь remote уншигдтал ХААЛТТАЙ (fail-closed —
   *    `permissions.resolveAccess` · `workflowViewsOf`). Урьд нь тэр хүн «Танд харагдац
   *    олгогдоогүй — админд хандана уу» гэсэн ХУДАЛ шалтгаан хардаг байв: эрх нь хасагдаагүй,
   *    зөвхөн жагсаалт уншигдаагүй. «Уншиж чадсангүй» текст урьд нь зөвхөн татгалзлын
   *    дэлгэцэд (`AuthNotice`) байсан.
   * ⚠️ Эрх НЭЭГДЭХГҮЙ — зөвхөн мессеж ба «Дахин оролдох». Уншилт бүтмэгц store-ийн
   *    мэдэгдлээр (`subscribe`) энэ компонент дахин зурагдаж Portal нээгдэнэ; 15 сек тутмын
   *    автомат шалгалт ч хэвээр. `remoteReady()`-г рендерт шууд уншина (тэр store-ийн төлөв).
   */
  const permsDown = status === 'signed-in' && !remoteReady();
  const [rechecking, setRechecking] = useState(false);

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
      ) : frozen ? (
        /* ⚠️ Дээрх `frozen`-ийн тайлбар — ИЖИЛ байрлал, ИЖИЛ төрөл тул React
           Portal-ыг дахин үүсгэхгүй (төлөв хэвээр). */
        <Portal
          onHome={goHome}
          navScope={frozen.navScope}
          docsAllowed={frozen.docsAllowed}
          isSuper={isSuper}
        />
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
              {permsDown ? (
                <>
                  <p style={{ margin: 0 }}>{tr('Эрхийн жагсаалтыг уншиж чадсангүй — таны эрх ХАСАГДААГҮЙ байж магадгүй. Холболтоо шалгаад хуудсыг дахин ачаална уу. Давтагдвал админд хандана уу.')}</p>
                  <p style={{ margin: 0, fontSize: '0.8rem' }}>{tr('Хэрэглэгч:')} {user?.username || '—'}</p>
                  <button
                    type="button"
                    disabled={rechecking}
                    onClick={() => {
                      setRechecking(true);
                      void recheckPerms().finally(() => setRechecking(false));
                    }}
                    style={{
                      padding: '8px 18px', borderRadius: 8, border: '1px solid var(--line)',
                      background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer',
                    }}
                  >
                    {rechecking ? tr('Шалгаж байна…') : tr('Дахин оролдох')}
                  </button>
                </>
              ) : noViews ? (
                <>
                  <p style={{ margin: 0 }}>{tr('Танд харагдац олгогдоогүй байна — админд хандана уу.')}</p>
                  <p style={{ margin: 0, fontSize: '0.8rem' }}>{tr('Хэрэглэгч:')} {user?.username || '—'}</p>
                </>
              ) : (
                <p style={{ margin: 0 }}>{tr('Таны эрх энэ хэсгийг үзэхэд хүрэлцэхгүй байна.')}</p>
              )}
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
              {/* ⚠️ Өөр бүртгэлийн зам (2026-09-23, `AuthNotice`-тэй ижил): эрхгүй
                  бүртгэлээр орсон хүн нүүр рүү буцаад мөн л ижил бүртгэлээр
                  гацдаг байв — гарах товчгүй бол F5 ч тус болохгүй. */}
              {status === 'signed-in' && (
                <button
                  type="button"
                  onClick={signOut}
                  style={{
                    padding: '8px 18px', borderRadius: 8, border: '1px solid var(--line)',
                    background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer',
                  }}
                >
                  {tr('Өөр бүртгэлээр нэвтрэх')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <Portal
            onHome={goHome}
            navScope={clamped as 'all' | ViewKey[]}
            docsAllowed={access?.docs ?? false}
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
          docsAllowed={access?.docs ?? false}
          isSuper={isSuper}
          /*
           * ⚠️ УДИРДЛАГЫН САМБАР — «бүх харагдац» эрхтэй хүнд ч нээгдэнэ
           *    (2026-09-15-ны хэрэглээний аудит). Урьд нь `isSuper` дангаар
           *    хаадаг байсан тул харах эрх олгогдсон дарга нэвтэрвэл зөвхөн
           *    навигацийн зурвастай ХООСОН хуудас хардаг байв. Самбар нь
           *    зөвхөн УНШИХ бөгөөд бичих үйлдэлгүй тул нуух шалтгаангүй;
           *    `admin` товч нь `isSuper`-ээр ХЭВЭЭР хаагдсан.
           */
          boardAllowed={isSuper || allowed === 'all'}
          homeView={roleHome}
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
