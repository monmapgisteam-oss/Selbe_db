'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { AUTH } from '@/lib/services/env';
import { BOOTSTRAP_SUPER, isCodeSuper, roleForUser, type Role } from '@/lib/services/roles';
import { initRemote, hasAccess, roleOf, remoteReady, closedFor, subscribe as subscribePerms } from '@/lib/permissions';
import { subscribeCaps } from '@/lib/caps';
import type { SysState } from '@/lib/permsRemote';
import { dateTime } from '@/lib/format';
import { setCurrentUser } from '@/lib/who';
import { ENT_SERVER, installEntInterceptor } from '@/lib/entInterceptor';
import { clearMetaCache } from '@/lib/metaCache';
import {
  cancelSignOut, dismissSessionDead, ensureFreshToken, lastRefreshFail, noteSignOut, primeServerCredential, registerIdentity,
  reopenSessionDead, retrySession, sessionDead, subscribeSessionDead,
} from '@/lib/authToken';
import { hasUnsavedWork } from '@/components/LocaleToggle';
import { useFocusTrap } from '@/lib/useFocusTrap';
import s from './auth.module.css';

/**
 * ArcGIS Online нэвтрэлт — КОНТЕКСТ хэлбэрээр.
 *
 * OAuth 2.0 (PKCE, authorization-code, бүтэн хуудсаар чиглүүлэх) — статик сайтад
 * тохирно. `AUTH.appId` хоосон бол нэвтрэлт унтраалттай (`status: 'off'`).
 */

type User = { username: string; fullName: string; thumbnail: string | null; orgId: string | null };

let superTablesOnce: Promise<void> | null = null;
function ensureSuperTables(): Promise<void> {
  if (!superTablesOnce) {
    superTablesOnce = (async () => {
      let ok = true;
      try {
        const { planTableReady } = await import('@/lib/huvaariBatlah');
        ok = (await planTableReady(true)) && ok;
      } catch { ok = false; /* хүснэгт үүсээгүй — «Хуваарь» хуудас шалтгааныг хэлнэ */ }
      try {
        const { obyemTableReady } = await import('@/lib/obyemBatlah');
        ok = (await obyemTableReady(true)) && ok;
      } catch { ok = false; /* хүснэгт үүсээгүй — хуудас шалтгааныг хэлнэ */ }
      if (!ok) superTablesOnce = null;
    })();
  }
  return superTablesOnce;
}
/** Эрхийн хүснэгт уншигдсан эсэх — татгалзлын ЖИНХЭНЭ шалтгааныг ялгана */
export type AuthStatus = 'checking' | 'signed-in' | 'signed-out' | 'denied' | 'off';

type AuthCtx = {
  status: AuthStatus;
  /** Аппын харагдацад орох эрхтэй юу (нэвтэрсэн эсвэл нэвтрэлт унтраалттай) */
  authorized: boolean;
  user: User | null;
  /** Нэвтэрсэн хэрэглэгчийн үүрэг — эрхийн хүрээг үүгээр тогтооно */
  role: Role | null;
  error: string | null;
  /** Эрхийн хүснэгт уншигдсан уу — `false` бол татгалзал нь СҮЛЖЭЭНИЙХ, эрхийнх БИШ */
  permsRead: boolean;
  /**
   * Порталд АЖИЛЛАЖ БАЙХ ҮЕД эрх хасагдсан уу (2026-09-30) — `signed-in` →
   * `denied` шилжилт зөвхөн үечилсэн шалгалтаас. `Root` үүгээр Portal-ыг
   * УСТГАЛГҮЙ үлдээж, дээр нь хаалтын цонх (`AuthNotice`) гаргана.
   */
  accessLost: boolean;
  sessionExpired: boolean;
  sysClosed: SysState | null;
  /** Эрхийн хүснэгтийг ОДОО дахин уншина (15 с / 5 мин хүлээлгүй) — «Дахин оролдох» товч */
  recheckPerms: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Алдааны мэдэгдлийг хаах — signed-out+error дэлгэцээс гарах гарц */
  clearError: () => void;
};

const Ctx = createContext<AuthCtx>({
  status: 'off',
  authorized: true,
  user: null,
  role: null,
  error: null,
  permsRead: true,
  accessLost: false,
  sessionExpired: false,
  sysClosed: null,
  recheckPerms: async () => {},
  signIn: async () => {},
  signOut: async () => {},
  clearError: () => {},
});

export const useAuth = () => useContext(Ctx);

/** portalUrl-ийн сүүлийн '/'-г арилгаад /sharing нэмнэ */
const sharingUrl = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing`;

/**
 * «Нэвтрэх товч дарж, ArcGIS руу чиглүүлсэн» тэмдэглэгээ. Анх орж ирэхэд нэвтрэлт
 * шалгах унах нь ХЭВИЙН; харин нэвтрэлтээс БУЦАЖ ирээд унасан бол жинхэнэ алдаа.
 */
const ATTEMPT_KEY = 'selbe-auth-attempt';

/**
 * `ATTEMPT_KEY`-ИЙН ХАМГААЛАГДСАН ХАНДАЛТ (2026-09-16-ны аудит).
 */
const attemptGet = (): string | null => {
  try { return sessionStorage.getItem(ATTEMPT_KEY); } catch { return null; }
};
const attemptSet = () => {
  try { sessionStorage.setItem(ATTEMPT_KEY, '1'); } catch { /* хатуу нууцлал */ }
};
const attemptClear = () => {
  try { sessionStorage.removeItem(ATTEMPT_KEY); } catch { /* хатуу нууцлал */ }
};
const describe = (e: unknown): string => {
  if (e instanceof Error) {
    const d = (e as { details?: { message?: string; httpStatus?: number } }).details;
    const parts = [e.message, d?.message, d?.httpStatus ? `HTTP ${d.httpStatus}` : ''];
    return parts.filter(Boolean).join(' · ');
  }
  return String(e);
};

/**
 * ХУУДАС ЧИГЛҮҮЛЭЛТ ЦУЦЛАГДСАНЫГ ИЛРҮҮЛНЭ (2026-10-06 аудит).
 */
function watchNavCancel(cb: () => void, ms: number): () => void {
  let done = false;
  const evs = ['pointerdown', 'keydown', 'focus'] as const;
  const fire = () => {
    if (done || document.visibilityState !== 'visible') return;
    stop();
    cb();
  };
  const onVis = () => { if (document.visibilityState === 'visible') fire(); };
  const onHide = () => stop();
  /* Эхний 400 мс-д ирсэн оролт нь товч дарсан үйлдлийн өөрийнх — тоолохгүй */
  const arm = setTimeout(() => {
    for (const ev of evs) window.addEventListener(ev, fire, true);
    document.addEventListener('visibilitychange', onVis);
  }, 400);
  const timer = setTimeout(fire, ms);
  window.addEventListener('pagehide', onHide);
  function stop() {
    done = true;
    clearTimeout(arm);
    clearTimeout(timer);
    for (const ev of evs) window.removeEventListener(ev, fire, true);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', onHide);
  }
  return stop;
}

if (typeof window !== 'undefined') void installEntInterceptor();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (AUTH.appId ? 'checking' : 'off'));
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permsRead, setPermsRead] = useState(true);
  /** Ажиллаж байхад эрх хасагдсан (`AuthCtx.accessLost`-ийн тайлбар) */
  const [accessLost, setAccessLost] = useState(false);
  const [sysClosed, setSysClosed] = useState<SysState | null>(null);
  /** Poll-ын давтамжид (`period`) — эффектийн deps-д ороогүй тул ref (зөвхөн callback дотор бичнэ) */
  const sysClosedRef = useRef(false);
  const applySysClosed = useCallback((next: SysState | null) => {
    sysClosedRef.current = !!next;
    setSysClosed((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  const oauthReadyRef = useRef<Promise<void> | null>(null);
  /** Нэвтрэх үеийн байгууллагын шалгалтын дүн — revocation дахин ашиглана */
  const orgOkRef = useRef(true);
  /** Үечилсэн шалгалтын одоогийн функц — `recheckPerms` гараар дуудна (2026-10-05) */
  const checkRef = useRef<(() => Promise<void>) | null>(null);
  const sessionExpired = useSyncExternalStore(subscribeSessionDead, sessionDead, () => false);

  useEffect(() => {
    // Тохируулаагүй бол нэвтрэлтгүйгээр ажиллана
    if (!AUTH.appId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('off');
      const devToken = process.env.NODE_ENV !== 'production' ? (process.env.NEXT_PUBLIC_DEV_TOKEN ?? '').trim() : '';
      if (devToken) {
        void import('@arcgis/core/identity/IdentityManager').then(({ default: esriId }) => {
          esriId.registerToken({ server: ENT_SERVER, token: devToken, ssl: true });
          esriId.registerToken({ server: `${sharingUrl()}/rest`, token: devToken, ssl: true });
          registerIdentity(esriId, sharingUrl());
          console.warn('[selbe] DEV: нэвтрэлт унтраалттай — өгөгдлийг NEXT_PUBLIC_DEV_TOKEN-оор уншиж байна');
        });
      }
      return;
    }

    let alive = true;
    let oauthReady: () => void = () => {};
    oauthReadyRef.current = new Promise<void>((res) => { oauthReady = res; });
    (async () => {
      try {
        const [{ default: esriId }, { default: OAuthInfo }, { default: Portal }] = await Promise.all([
          import('@arcgis/core/identity/IdentityManager'),
          import('@arcgis/core/identity/OAuthInfo'),
          import('@arcgis/core/portal/Portal'),
        ]);

        esriId.registerOAuthInfos([
          new OAuthInfo({
            appId: AUTH.appId,
            portalUrl: AUTH.portalUrl,
            popup: false, // бүтэн хуудсаар чиглүүлнэ — статик сайтад callback хуудас хэрэггүй
            flowType: 'authorization-code', // PKCE — client secret-гүй, SPA-д аюулгүй
          }),
        ]);
        oauthReady();
        if (process.env.NODE_ENV !== 'production') {
          const mgr = esriId as unknown as { signIn: (...a: unknown[]) => unknown };
          const orig = mgr.signIn.bind(esriId);
          mgr.signIn = (...a: unknown[]) => {
            console.warn('[selbe] IdentityManager нэвтрэлт шаардав — хаяг:', a[0], '· сервер:', (a[1] as { server?: string } | undefined)?.server);
            return orig(...a);
          };
        }
        registerIdentity(esriId, sharingUrl());

        await esriId.checkSignInStatus(sharingUrl());
        const serverCred = primeServerCredential(ENT_SERVER);

        const portal = new Portal({ url: AUTH.portalUrl });
        await portal.load();
        const u = portal.user;
        const info: User = {
          username: u?.username ?? '',
          fullName: u?.fullName || u?.username || '',
          thumbnail: u?.thumbnailUrl ? u.thumbnailUrl.replace(/([?&])token=[^&]*(&?)/, (_m, a: string, b: string) => (b ? a : '')).replace(/[?&]$/, '') : null,
          orgId: u?.orgId ?? null,
        };
        const canCreate = isCodeSuper(info.username) || info.username.trim().toLowerCase() === BOOTSTRAP_SUPER;
        const orgOk = !AUTH.allowedOrgId || info.orgId === AUTH.allowedOrgId;
        orgOkRef.current = orgOk;

        const remoteOk = await initRemote(canCreate);
        if (!alive) return;
        const hard = roleForUser(info.username);
        if (hard === 'super') {
          await ensureSuperTables();
          if (!alive) return;
        }
        /*
         * ҮҮРЭГ — override-ыг тооцсон ГАНЦ эх сурвалж (`roleOf`).
         */
        const r = roleOf(info.username);
        // Нэвтрэх эрх: хатуу жагсаалт ЭСВЭЛ панелаас нэмсэн (store) хэрэглэгч.
        const admitted = orgOk && hasAccess(info.username);
        await serverCred;
        if (!alive) return;
        setPermsRead(remoteOk || !!hard);
        console.info('[selbe] нэвтэрсэн:', info.username, '· orgId:', info.orgId, '· үүрэг:', r ?? '—', '· admitted:', admitted);

        attemptClear();
        const lock = admitted ? closedFor(info.username) : null;
        applySysClosed(lock);
        setCurrentUser(admitted && !lock ? info.username : null);
        setUser(info);
        setRole(r);
        setStatus(admitted ? 'signed-in' : 'denied');
      } catch (e) {
        // «not-authenticated» бол ердийн (нэвтрээгүй) төлөв — улаан алдаа биш
        const notAuthed = (e as { name?: string })?.name === 'identity-manager:not-authenticated';
        if (notAuthed) console.debug('[selbe] нэвтрээгүй байна (хэвийн):', e);
        else console.error('[selbe] нэвтрэлт шалгах үед:', e);
        if (!alive) return;
        const wasAttempt = attemptGet();
        attemptClear();
        if (wasAttempt || !notAuthed) setError(describe(e));
        setCurrentUser(null);
        setStatus('signed-out');
      } finally {
        oauthReady();
      }
    })();

    return () => { alive = false; };
  }, [applySysClosed]);

  /*
   * ЭРХИЙН ХҮЧИНГҮЙЖИЛТ — нэвтэрсэн ХЭВЭЭР байхад эрх нь хасагдсаныг барина.
   */
  useEffect(() => {
    if ((status !== 'signed-in' && status !== 'denied') || !user?.username) return;
    // Байгууллага нь таарахгүй бол poll хийх утгагүй — эрх сэргэх боломжгүй
    if (!orgOkRef.current) return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        await ensureFreshToken();
        const rok = await initRemote(false, roleForUser(user.username) === 'super');
        if (!alive) return;
        setPermsRead(rok || !!roleForUser(user.username));
        const ok = hasAccess(user.username);
        if (!ok && !rok) return;
        const lock = ok ? closedFor(user.username) : null;
        applySysClosed(lock);
        setCurrentUser(ok && !lock ? user.username : null);
        // Эрх ХАСАГДВАЛ шууд хаана; БУЦААЖ СЭРГЭЭГДВЭЛ F5 шаардалгүй нээнэ
        if (!ok && status === 'signed-in') setAccessLost(true);
        if (ok) setAccessLost(false);
        setStatus((prev) => {
          if (prev === 'signed-in' && !ok) return 'denied';
          if (prev === 'denied' && ok) return 'signed-in';
          return prev;
        });
        // Үүрэг нь солигдсон бол (шатанд томилогдох г.м.) дараагийн нэвтрэлт
        // хүлээлгүй шинэчилнэ — Гүйцэтгэлийн хяналтын шат зөв түгжигдэнэ.
        setRole(roleOf(user.username));
      } catch { /* сүлжээний тасалдал — эрхийг хэвээр үлдээнэ */ }
    };
    checkRef.current = check;
    const period = () => (status === 'denied' || !remoteReady() ? 15_000 : sysClosedRef.current ? 30_000 : 5 * 60_000);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timer = setTimeout(() => {
        void check().finally(() => { if (alive) schedule(); });
      }, period());
    };
    schedule();
    const onVis = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      if (checkRef.current === check) checkRef.current = null;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [status, user?.username, applySysClosed]);

  useEffect(() => {
    if (status !== 'signed-in' || !user?.username) return undefined;
    const name = user.username;
    const sync = () => {
      if (!hasAccess(name)) return;
      const lock = closedFor(name);
      applySysClosed(lock);
      setCurrentUser(lock ? null : name);
    };
    const a = subscribePerms(sync);
    const b = subscribeCaps(sync);
    return () => { a(); b(); };
  }, [status, user?.username, applySysClosed]);

  const recheckPerms = useCallback(async () => { await checkRef.current?.(); }, []);

  const signIn = useCallback(async () => {
    setError(null);
    attemptSet();
    try {
      await oauthReadyRef.current;
      const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
      // popup:false тул энэ нь хуудсыг ArcGIS нэвтрэлт рүү чиглүүлж, буцаж ирнэ
      await esriId.getCredential(sharingUrl());
      window.location.reload();
    } catch (e) {
      console.error('[selbe] нэвтрэх үед:', e);
      attemptClear();
      setError(describe(e));
    }
  }, []);

  /**
   * ГАРАХ — ЗӨВХӨН локал итгэмжлэлийг устгаад зогсохгүй, ArcGIS-ийн SSO сешнийг ч
   * хаана.
   */
  const signOut = useCallback(async () => {
    const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
    noteSignOut();
    clearMetaCache();
    const clearPermsCache = () => {
      for (const k of [
        'selbe-perms-v1', 'selbe-caps-v1', 'selbe-roletypes-cache-v1',
        'selbe-guitsetgel-acl-v1', 'selbe-huvaari-acl-v1', 'selbe-obyem-acl-v1', 'selbe-ajil-acl-v1',
        'selbe-chanar-acl-v1', 'selbe-qaqc-acl-v1', 'selbe-butets-acl-v1',
      ]) {
        try { localStorage.removeItem(k); } catch { /* хувийн горим */ }
      }
    };
    if (hasUnsavedWork()) {
      window.addEventListener('pagehide', () => {
        try { esriId.destroyCredentials(); } catch { /* хуудас гарч байна */ }
        clearPermsCache();
      }, { once: true });
      watchNavCancel(cancelSignOut, 2_000);
    } else {
      esriId.destroyCredentials();
      clearPermsCache();
    }
    const back = encodeURIComponent(location.origin + location.pathname);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(
      `${sharingUrl()}/rest/oauth2/signout?client_id=${encodeURIComponent(AUTH.appId)}&redirect_uri=${back}`,
    );
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const authorized = (status === 'signed-in' && !sysClosed) || status === 'off';
  const value = useMemo<AuthCtx>(() => ({
    status, authorized, user, role, error, permsRead, accessLost, sessionExpired, sysClosed, recheckPerms, signIn, signOut, clearError,
  }), [status, authorized, user, role, error, permsRead, accessLost, sessionExpired, sysClosed, recheckPerms, signIn, signOut, clearError]);

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

/**
 * Нэвтрэлтийн МЭДЭГДЭЛ — эрх татгалзсан (буруу байгууллага) эсвэл нэвтрэлт унасан
 * үед л хөвөгч цонхоор гарна. Бусад үед `null` — нүүр хуудас чөлөөтэй харагдана.
 */
export function AuthNotice() {
  const { status, user, error, permsRead, accessLost, sessionExpired, sysClosed, signIn, signOut, clearError, recheckPerms } = useAuth();
  if (sessionExpired && status === 'signed-in') return <SessionExpired username={user?.username} onSignOut={signOut} />;
  if (sysClosed && status === 'signed-in') {
    return <SystemClosed info={sysClosed} username={user?.username} onRecheck={recheckPerms} onSignOut={signOut} />;
  }
  if (status !== 'denied' && !(status === 'signed-out' && error)) return null;

  if (status === 'denied' && accessLost) return <AccessLost username={user?.username} onSignOut={signOut} />;
  /*
   * ТАТГАЛЗСАН ШАЛТГААНЫ ДАРААЛАЛ (2026-09-21): org зөрөв → эрхийн жагсаалт
   * уншигдсангүй → эрх олгогдоогүй.
   */
  const orgMismatch = !!user && !!AUTH.allowedOrgId && user.orgId !== AUTH.allowedOrgId;
  const reason: 'org' | 'perms' | 'noAccess' = orgMismatch ? 'org' : !permsRead ? 'perms' : 'noAccess';

  return (
    <NoticeDialog>
      <div className={s.card}>
        <img src="/logo.svg" alt="" className={s.logo} />
        <div className={s.title} id="selbe-auth-notice">{tr('Сэлбэ портал')}</div>

        {status === 'denied' && (
          <>
            {user && (
              <div className={s.user}>
                {user.thumbnail && (
                  <img src={user.thumbnail} alt="" className={s.avatar} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                )}
                <div style={{ textAlign: 'left' }}>
                  <div className={s.userName}>{user.fullName}</div>
                  <div className={s.userSub}>{user.username}</div>
                </div>
              </div>
            )}
            {reason === 'org' ? (
              <>
                <p className={s.sub}>
                  {tr('Энэ бүртгэл танай байгууллагын хэрэглэгч биш тул хандах эрхгүй байна.')}
                </p>
                <p className={s.error}>
                  {tr('Бүртгэлийн orgId:')} {user?.orgId || '—'} {tr('· шаардлагатай:')} {AUTH.allowedOrgId}
                </p>
              </>
            ) : reason === 'perms' ? (
              <>
                <p className={s.sub}>
                  {tr('Эрхийн жагсаалтыг уншиж чадсангүй — таны эрх ХАСАГДААГҮЙ байж магадгүй. Холболтоо шалгаад хуудсыг дахин ачаална уу. Давтагдвал админд хандана уу.')}
                </p>
                <p className={s.error}>{tr('Хэрэглэгч:')} {user?.username || '—'}</p>
                <RecheckButton recheck={recheckPerms} />
              </>
            ) : (
              <>
                <p className={s.sub}>
                  {tr('Энэ бүртгэлд порталд хандах эрх олгогдоогүй байна. Эрх нээлгэхийг хүсвэл дараах хэрэглэгчийн нэрийг админд илгээнэ үү.')}
                </p>
                <p className={s.error}>{tr('Хэрэглэгч:')} {user?.username || '—'}</p>
              </>
            )}
            <button type="button" className={s.btnGhost} onClick={signOut}>
              {tr('Өөр бүртгэлээр нэвтрэх')}
            </button>
          </>
        )}

        {status === 'signed-out' && error && (
          <>
            <p className={s.sub}>{tr('Нэвтрэх үед алдаа гарлаа.')}</p>
            <p className={s.error}>{error}</p>
            <button type="button" className={s.btn} onClick={signIn} style={{ marginTop: 16 }}>
              {tr('Дахин оролдох')}
            </button>
            <button type="button" className={s.btnGhost} onClick={clearError}>
              {tr('Хаах')}
            </button>
          </>
        )}
      </div>
    </NoticeDialog>
  );
}

function NoticeDialog({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  return (
    <div ref={ref} className={s.screen} role="dialog" aria-modal="true" aria-labelledby="selbe-auth-notice">
      {children}
    </div>
  );
}

/** «Дахин оролдох» — эрхийн хүснэгтийг дахин уншина (`recheckPerms`); амжилттай бол карт өөрөө хаагдана */
function RecheckButton({ recheck }: { recheck: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={s.btn}
      disabled={busy}
      style={{ marginTop: 16 }}
      onClick={() => {
        setBusy(true);
        void recheck().finally(() => setBusy(false));
      }}
    >
      {busy ? tr('Шалгаж байна…') : tr('Дахин оролдох')}
    </button>
  );
}

/**
 * АЖИЛЛАЖ БАЙХАД ЭРХ ХАСАГДСАН — хаалтын цонх (2026-09-30, `AuthNotice`).
 */
/**
 * НЭВТРЭЛТИЙН ХУГАЦАА ДУУССАН — хаалтын цонх (2026-10-05, `authToken`-ийн «СЕШН ДУУССАН»).
 */
function SessionExpired({ username, onSignOut }: { username?: string; onSignOut: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const retry = async () => {
    setBusy(true);
    setNote('');
    const ok = await retrySession();
    setBusy(false);
    /* Сэргэвэл `sessionDead` худал болж цонх өөрөө хаагдана */
    if (!ok) setNote(tr('Нэвтрэлт сэргэсэнгүй — холболтоо шалгах эсвэл дахин нэвтэрнэ үү.'));
  };
  const [armed, setArmed] = useState(false);
  const reauth = async () => {
    if (!armed && hasUnsavedWork()) {
      setArmed(true);
      setNote(tr('Хадгалаагүй ажил байна. «Гүйцэтгэл бөглөх»-ийн ноорог энэ хөтчид хадгалагдсан тул нэвтэрмэгц сэргэнэ; бусад хуудасны хадгалаагүй өөрчлөлт алдагдана — эхлээд «Түр хаах» дарж хуулж авна уу. Үргэлжлүүлэх бол «Дахин нэвтрэх»-ийг дахин дарна уу.'));
      return;
    }
    setBusy(true);
    setNote('');
    let stopWatch: (() => void) | null = null;
    try {
      const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
      /* Хуучин (үхсэн) итгэмжлэлийг устгана — эс бөгөөс `getCredential` түүнийг буцаагаад чиглүүлэхгүй. */
      let saved: unknown = null;
      try { saved = esriId.toJSON(); } catch { saved = null; }
      esriId.destroyCredentials();
      attemptSet();
      stopWatch = watchNavCancel(() => {
        try {
          if (saved && !esriId.findCredential(sharingUrl())) esriId.initialize(saved);
        } catch { /* сэргээгээгүй ч цонх ажиллана — «Дахин нэвтрэх» дахин оролдоно */ }
        attemptClear();
        setArmed(false);
        setBusy(false);
        setNote(tr('Дахин нэвтрэлт цуцлагдлаа. Ажлаа хуулж аваад дахин оролдоно уу.'));
      }, 6_000);
      await esriId.getCredential(sharingUrl());
      stopWatch();
      /* Чиглүүлэлгүй хүрсэн бол (хүчинтэй итгэмжлэл олдсон) шалгалтыг эхнээс нь */
      window.location.reload();
    } catch (e) {
      stopWatch?.();
      attemptClear();
      setBusy(false);
      setNote(describe(e));
    }
  };
  return (
    <div ref={ref} className={`${s.screen} ${s.screenOver} ${s.screenAuth}`} role="alertdialog" aria-modal="true" aria-labelledby="selbe-session-expired">
      <div className={s.card}>
        <img src="/logo.svg" alt="" className={s.logo} />
        <div className={s.title} id="selbe-session-expired">{tr('Нэвтрэлтийн хугацаа дууссан')}</div>
        <p className={`${s.sub} ${s.subTight}`}>
          {tr('ArcGIS-ийн нэвтрэлтийн хугацаа дууссан тул өгөгдөл унших, хадгалах боломжгүй боллоо. Нээлттэй ажил тань энэ цонхны ард хэвээр байна.')}
        </p>
        <p className={s.sub}>
          {tr('Дахин нэвтрэхэд хуудас дахин ачаалагдана. «Гүйцэтгэл бөглөх»-ийн ноорог энэ хөтчид хадгалагдсан тул нэвтэрмэгц сэргэнэ. Бусад хуудасны ХАДГАЛААГҮЙ өөрчлөлт алга болно — хэрэгтэй бол эхлээд энэ цонхыг түр хааж хуулж авна уу.')}
        </p>
        <p className={s.error}>{tr('Хэрэглэгч:')} {username || '—'}</p>
        {note && <p className={s.error} role="status">{note}</p>}
        <button type="button" className={s.btn} onClick={reauth} disabled={busy} style={{ marginTop: 16 }}>
          {tr('Дахин нэвтрэх')}
        </button>
        <button type="button" className={s.btnGhost} onClick={retry} disabled={busy}>
          {busy ? tr('Шалгаж байна…') : tr('Дахин шалгах')}
        </button>
        <button type="button" className={s.btnGhost} onClick={dismissSessionDead} disabled={busy}>
          {tr('Түр хаах — хадгалаагүй ажлаа хуулж авах')}
        </button>
        <button type="button" className={s.btnGhost} onClick={onSignOut} disabled={busy}>
          {tr('Гарах')}
        </button>
      </div>
    </div>
  );
}

/**
 * СИСТЕМ ТҮР ХААГДСАН — бүтэн дэлгэцийн хаалтын цонх (2026-10-19, `permissions.setSystemClosed`).
 */
export function SystemClosed({ info, username, onRecheck, onSignOut }: {
  info: SysState; username?: string; onRecheck: () => Promise<void>; onSignOut: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  const [busy, setBusy] = useState(false);
  const recheck = async () => {
    if (lastRefreshFail() === 'dead' && !(await retrySession())) { reopenSessionDead(); return; }
    await onRecheck();
    if (lastRefreshFail() === 'dead') reopenSessionDead();
  };
  return (
    <div ref={ref} className={`${s.screen} ${s.screenOver} ${s.screenAuth}`} role="alertdialog" aria-modal="true" aria-labelledby="selbe-sys-closed">
      <div className={s.card}>
        <img src="/logo.svg" alt="" className={s.logo} />
        <div className={s.title} id="selbe-sys-closed">{tr('Систем түр хаагдсан')}</div>
        <p className={`${s.sub} ${s.subTight}`}>
          {tr('Системийг нийслэлийн дата төв рүү шилжүүлж байгаа тул түр хаагдсан. Түр хүлээнэ үү.')}
        </p>
        {info.note && <p className={`${s.sub} ${s.subTight} ${s.sysNote}`}>{info.note}</p>}
        {info.until && <p className={`${s.sub} ${s.subTight}`}>{tr('Дахин нээгдэх: {0}', info.until)}</p>}
        {info.at > 0 && <p className={s.userSub}>{tr('Хаасан: {0}', dateTime(info.at))}</p>}
        <p className={s.error}>{tr('Хэрэглэгч:')} {username || '—'}</p>
        <button
          type="button"
          className={s.btn}
          disabled={busy}
          style={{ marginTop: 16 }}
          onClick={() => {
            setBusy(true);
            void recheck().finally(() => setBusy(false));
          }}
        >
          {busy ? tr('Шалгаж байна…') : tr('Дахин шалгах')}
        </button>
        <button type="button" className={s.btnGhost} onClick={onSignOut} disabled={busy}>
          {tr('Гарах')}
        </button>
      </div>
    </div>
  );
}

export function AccessLost({ username, onSignOut }: { username?: string; onSignOut: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  return (
    <div ref={ref} className={`${s.screen} ${s.screenOver} ${s.screenAuth}`} role="alertdialog" aria-modal="true" aria-labelledby="selbe-access-lost">
      <div className={s.card}>
        <img src="/logo.svg" alt="" className={s.logo} />
        <div className={s.title} id="selbe-access-lost">{tr('Таны хандах эрх өөрчлөгдлөө')}</div>
        <p className={s.sub}>
          {tr('Админ таны порталын эрхийг хассан эсвэл өөрчилсөн байна. Эрх сэргээгдвэл энэ цонх өөрөө хаагдаж, нээлттэй байсан ажил тань хэвээр үлдэнэ.')}
        </p>
        <p className={s.error}>{tr('Хэрэглэгч:')} {username || '—'}</p>
        <button type="button" className={s.btn} onClick={() => window.location.reload()} style={{ marginTop: 16 }}>
          {tr('Хуудсыг дахин ачаалах')}
        </button>
        <button type="button" className={s.btnGhost} onClick={onSignOut}>
          {tr('Гарах')}
        </button>
      </div>
    </div>
  );
}
