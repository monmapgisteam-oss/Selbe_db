'use client';

// ⚠️ @arcgis/core-аас ӨМНӨ ачаалагдах ЁСТОЙ — UBHUB ортофотогийн console-алдааг
// шүүхийн тулд ArcGIS-ийн Logger `console.error`-оо хадгалахаас өмнө patch хийнэ.
import '@/lib/silenceOrthoLogs';

import dynamic from 'next/dynamic';
import { useEffect, useReducer, useState } from 'react';
import { Home } from './Home';
import { AuthNotice, useAuth } from './AuthGate';
import { resolveAccess, subscribe } from '@/lib/permissions';
import {
  ALWAYS_NAV_VIEWS,
  DEFAULT_VIEW,
  HOME_SECTIONS,
  ROLE_ACCESS,
  VIEW_BY_KEY,
  roleForUser,
  type ViewKey,
} from '@/lib/services';

/**
 * АППЫН ҮНДЭС — НҮҮР vs ПОРТАЛ, ба орсон СЭДВИЙН навигацийн хүрээг шийднэ.
 *
 * Орох горим URL-д тусна (F5, Back дэмжинэ):
 *   · `?all=1`        — «Удирдлага»: дээд навигацид БҮХ харагдац.
 *   · `?g=<сэдэв-id>`  — тодорхой сэдэв: тэр сэдвийн харагдац + `ALWAYS_NAV_VIEWS`.
 *   · юу ч биш         — видео дэвсгэртэй НҮҮР хуудас.
 *
 * `writeParams` (Portal) нь зөвхөн өөрийн патчилсан түлхүүрийг устгадаг тул
 * харагдац соливол `all`/`g` хадгалагдана — сэдвийн хүрээ алдагдахгүй.
 */
const Portal = dynamic(() => import('./Portal'), {
  ssr: false,
  loading: () => (
    <div
      style={{ height: '100dvh', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: '0.85rem' }}
    >
      Сэлбэ порталыг ачаалж байна…
    </div>
  ),
});

/** Нэвтрэлтээс буцаж ирэхэд орох цэгийг хадгалах түлхүүр (view key эсвэл `all:<id>`) */
const PENDING_KEY = 'selbe-pending-view';

/** Орсон горим: null = нүүр, 'all' = бүх харагдац, эсвэл навигацид гарах харагдацууд */
type NavScope = null | 'all' | ViewKey[];

type Section = (typeof HOME_SECTIONS)[number];
/** Сэдвийн навигацийн жагсаалт — exact бол зөвхөн өөрийнх, эс бөгөөс + always */
const sectionScope = (sec: Section): ViewKey[] =>
  sec.exact ? sec.views : [...sec.views, ...ALWAYS_NAV_VIEWS];

const scopeFromUrl = (): NavScope => {
  const p = new URLSearchParams(window.location.search);
  if (p.get('all') === '1') return 'all';
  const g = p.get('g');
  const byId = HOME_SECTIONS.find((s) => s.id === g && !s.all);
  if (byId) return sectionScope(byId);
  // Fallback: ?v нь сэдвийн харагдац бол тэр сэдэв; өөр хүчинтэй харагдац бол «бүх»
  const v = p.get('v') as ViewKey | null;
  if (v) {
    const byView = HOME_SECTIONS.find((s) => !s.all && s.views.includes(v));
    if (byView) return sectionScope(byView);
    if (VIEW_BY_KEY[v]) return 'all';
  }
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
    const role = roleForUser(user?.username);
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
    else if (VIEW_BY_KEY[p as ViewKey]) openView(p as ViewKey);
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
    const u = new URL(window.location.href);
    u.searchParams.set('v', DEFAULT_VIEW);
    u.searchParams.set('all', '1');
    u.searchParams.delete('g');
    window.history.pushState({}, '', u);
    setScope('all');
  };

  /** Тодорхой харагдацад орох — түүний сэдвийн хүрээгээр */
  const openView = (key: ViewKey) => {
    const sec = HOME_SECTIONS.find((s) => !s.all && s.views.includes(key));
    const u = new URL(window.location.href);
    u.searchParams.set('v', key);
    u.searchParams.delete('all');
    if (sec) u.searchParams.set('g', sec.id);
    else u.searchParams.delete('g');
    window.history.pushState({}, '', u);
    setScope(sec ? sectionScope(sec) : 'all');
  };

  const enterAll = () => {
    if (authorized) openEntry();
    else { sessionStorage.setItem(PENDING_KEY, 'enter'); signIn(); }
  };

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
   * (жиш. tolovlolt эрхтэй хэрэглэгч `?g=suit` гүн холбоосоор орох) эндээс
   * шүүж «эрх хүрэлцэхгүй» мэдэгдэл харуулна.
   */
  const clamped = clamp(scope);
  const noAccess = Array.isArray(clamped) && !clamped.length;

  return (
    <>
      <AuthNotice />
      {scope && authorized ? (
        noAccess ? (
          <div
            role="alert"
            style={{
              height: '100dvh', display: 'grid', placeItems: 'center',
              color: 'var(--ink-3)', fontSize: '0.9rem', textAlign: 'center', padding: 24,
            }}
          >
            <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
              <p style={{ margin: 0 }}>Таны эрх энэ хэсгийг үзэхэд хүрэлцэхгүй байна.</p>
              <button
                type="button"
                onClick={goHome}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: '1px solid var(--line)',
                  background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer',
                }}
              >
                Нүүр хуудас руу буцах
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
      ) : (
        <Home onEnterAll={enterAll} />
      )}
    </>
  );
}
