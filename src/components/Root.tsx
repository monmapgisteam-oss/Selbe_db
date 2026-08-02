'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Home } from './Home';
import { AuthNotice, useAuth } from './AuthGate';
import {
  ALWAYS_NAV_VIEWS,
  DEFAULT_VIEW,
  HOME_SECTIONS,
  VIEW_BY_KEY,
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
  const { authorized, signIn } = useAuth();
  const [scope, setScope] = useState<NavScope>(scopeFromUrl);

  /** Нэвтрэлтээс буцаж эрх авмагц хүлээгдэж буй цэгт орно */
  useEffect(() => {
    if (!authorized) return;
    const p = sessionStorage.getItem(PENDING_KEY);
    if (!p) return;
    sessionStorage.removeItem(PENDING_KEY);
    if (p === 'all') openAll();
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
    if (authorized) openAll();
    else { sessionStorage.setItem(PENDING_KEY, 'all'); signIn(); }
  };

  const goHome = () => {
    const u = new URL(window.location.href);
    u.searchParams.delete('v');
    u.searchParams.delete('all');
    u.searchParams.delete('g');
    window.history.pushState({}, '', u);
    setScope(null);
  };

  return (
    <>
      <AuthNotice />
      {scope && authorized ? (
        <Portal onHome={goHome} navScope={scope} />
      ) : (
        <Home onEnterAll={enterAll} />
      )}
    </>
  );
}
