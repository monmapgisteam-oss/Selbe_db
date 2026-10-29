'use client';

import '@/lib/silenceOrthoLogs';
import { t as tr } from '@/lib/i18nCore';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { Home } from './Home';
import { Landing } from './Landing';
import { AccessLost, AuthNotice, useAuth } from './AuthGate';
import { ConfirmHost } from './ConfirmHost';
import { boardAllowedFor } from '@/lib/homeBoard';
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
 */
function lastOrDefaultView(): ViewKey {
  let last: string | null = null;
  try { last = localStorage.getItem('selbe-last-view'); } catch { /* хаалттай орчин */ }
  return last && Object.hasOwn(VIEW_BY_KEY, last) && !ALL_MODE_HIDE.includes(last as ViewKey)
    ? (last as ViewKey) : DEFAULT_VIEW;
}

/**
 * Хөтөч СУЛ үед нэг удаа ажиллуулна (2026-10-04, урьдчилан татахад) — цэвэрлэх
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
 * Одоо сэдэв нь зөвхөн ОРОХ ЦЭГ: аль ч цэгээс орсон навигацид БҮГД гарна
 * (эрхээр л шүүгдэнэ). Сэдвийн бүлэглэл нь нүүр хуудсанд хэвээр ажиллана.
 */
const scopeFromUrl = (): NavScope => {
  const p = new URLSearchParams(window.location.search);
  if (p.get('all') === '1') return 'all';
  if (p.get('g')) return 'all';
  const v = p.get('v');
  if (v && Object.hasOwn(VIEW_BY_KEY, v)) return 'all';
  return null;
};

export default function Root() {
  const { authorized, signIn, signOut, status, user, accessLost, sysClosed, recheckPerms } = useAuth();
  const [scope, setScope] = useState<NavScope>(scopeFromUrl);

  /** Эрхийн store өөрчлөгдвөл (super admin засвар) дахин тооцоолно */
  const [, forcePerms] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribe(forcePerms), []);

  /**
   * Нүүр хуудсан дээр байхад Portal (том ArcGIS chunk)-ыг ДЭВСГЭРТ урьдчилан
   * татна — «Орох» дарахад шилжилт шуурхай болно (chunk аль хэдийн ачаалагдсан).
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
  const hardSuper = roleForUser(user?.username) === 'super';
  const isSuper = hardSuper || status === 'off';
  /**
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
    /* Сүүлд ажилласан харагдацыг сэргээнэ — `lastOrDefaultView` */
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
   */
  const openEntry = () => {
    if (allowed === 'all') { openAll(); return; }
    if (!allowed.length) { openAll(); return; }
    const role = roleOf(user?.username);
    const home = role ? roleAccess(role).home : undefined;
    openView(home && allowed.includes(home) ? home : allowed[0]);
  };

  /** Нэвтрэлтээс буцаж эрх авмагц хүлээгдэж буй цэгт орно */
  useEffect(() => {
    if (!authorized) return;
    let p: string | null = null;
    try {
      p = sessionStorage.getItem(PENDING_KEY);
      if (p) sessionStorage.removeItem(PENDING_KEY);
    } catch { p = null; }
    if (!p) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p === 'enter' || p === 'all') openEntry();
    else if (Object.hasOwn(VIEW_BY_KEY, p)) openView(p as ViewKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  /** Back/Forward — URL-аас горимыг сэргээнэ */
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
    else { try { sessionStorage.setItem(PENDING_KEY, 'enter'); } catch { /* нууцлалын горим */ } signIn(); }
  };

  /**
   * НҮҮР ХУУДАСНААС ХАРАГДАЦАД ШУУД ОРОХ.
   */
  const enterView = (key: ViewKey) => {
    if (authorized) openView(key);
    else { try { sessionStorage.setItem(PENDING_KEY, key); } catch { /* нууцлалын горим */ } signIn(); }
  };

  /**
   * НҮҮРИЙН СЭДВИЙН КАРТУУД.
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

  const clampedNow = clamp(scope);
  const clampedKey = clampedNow == null ? '' : clampedNow === 'all' ? 'all' : `[${clampedNow.join(',')}]`;
  const clamped = useMemo<NavScope>(
    () => (clampedKey === '' ? null
      : clampedKey === 'all' ? 'all'
        : (clampedKey.slice(1, -1).split(',').filter(Boolean) as ViewKey[])),
    [clampedKey],
  );
  const noAccess = Array.isArray(clamped) && !clamped.length;

  const [lastPortal, setLastPortal] = useState<{ navScope: 'all' | ViewKey[]; docsAllowed: boolean; key: string } | null>(null);
  if (scope && authorized && !noAccess) {
    const navScope = clamped as 'all' | ViewKey[];
    const docsAllowed = !!access;
    const key = `${navScope === 'all' ? 'all' : navScope.join(',')}|${docsAllowed ? 1 : 0}`;
    if (lastPortal?.key !== key) setLastPortal({ navScope, docsAllowed, key });
  }
  if (!scope && lastPortal) setLastPortal(null);
  const noViewsNow = Array.isArray(allowed) && !allowed.length;
  const viewsLost = !!scope && authorized && noAccess && noViewsNow && !(status === 'signed-in' && !remoteReady());
  const frozen = scope && ((accessLost && status === 'denied') || viewsLost || (sysClosed && status === 'signed-in')) ? lastPortal : null;

  /* Үүргийн нүүр харагдац — хязгаарлагдмал хэрэглэгчийн нүүрт тодруулна (`openEntry`-тэй ижил эх) */
  const roleHome = (() => {
    const r = roleOf(user?.username);
    return r ? roleAccess(r).home : undefined;
  })();

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
  const noViews = Array.isArray(allowed) && !allowed.length;
  const permsDown = status === 'signed-in' && !remoteReady();
  const [rechecking, setRechecking] = useState(false);

  return (
    <>
      <AuthNotice />
      <ConfirmHost />
      {frozen && viewsLost && <AccessLost username={user?.username} onSignOut={signOut} />}
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
            docsAllowed={!!access}
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
          docsAllowed={!!access}
          isSuper={isSuper}
          boardAllowed={boardAllowedFor(allowed, isSuper, roleOf(user?.username))}
          homeView={roleHome}
          permsDown={permsDown}
          onRetryPerms={() => { void recheckPerms(); }}
        />
      ) : (
        <Landing />
      )}
    </>
  );
}
