'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { AUTH, roleForUser, type Role } from '@/lib/services';
import { initRemote, hasAccess } from '@/lib/permissions';
import s from './auth.module.css';

/**
 * ArcGIS Online нэвтрэлт — КОНТЕКСТ хэлбэрээр.
 *
 * ⚠️ Урьд нь `AuthGate` бүх аппыг ороож, нэвтрээгүй бол ЮУГ Ч харуулдаггүй байв.
 * Одоо нүүр хуудас (видео, сэдвийн картууд) нэвтрэлтгүй ч харагдах ёстой тул
 * хаалт болгохоо больж, төлөв ба `signIn`-ыг context-оор түгээнэ. Нэвтрэлт нь
 * ЗӨВХӨН хэрэглэгч сэдэв сонгож ороход шаардагдана (`useAuth().authorized`).
 *
 * OAuth 2.0 (PKCE, authorization-code, бүтэн хуудсаар чиглүүлэх) — статик сайтад
 * тохирно. `AUTH.appId` хоосон бол нэвтрэлт унтраалттай (`status: 'off'`).
 *
 * ⚠️ ArcGIS identity модулиудыг ЗӨВХӨН effect дотор динамик import — статик
 * экспортын SSR үед унахаас сэргийлнэ.
 */

type User = { username: string; fullName: string; thumbnail: string | null; orgId: string | null };
export type AuthStatus = 'checking' | 'signed-in' | 'signed-out' | 'denied' | 'off';

type AuthCtx = {
  status: AuthStatus;
  /** Аппын харагдацад орох эрхтэй юу (нэвтэрсэн эсвэл нэвтрэлт унтраалттай) */
  authorized: boolean;
  user: User | null;
  /** Нэвтэрсэн хэрэглэгчийн үүрэг — эрхийн хүрээг үүгээр тогтооно */
  role: Role | null;
  error: string | null;
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

const describe = (e: unknown): string => {
  if (e instanceof Error) {
    const d = (e as { details?: { message?: string; httpStatus?: number } }).details;
    const parts = [e.message, d?.message, d?.httpStatus ? `HTTP ${d.httpStatus}` : ''];
    return parts.filter(Boolean).join(' · ');
  }
  return String(e);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (AUTH.appId ? 'checking' : 'off'));
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ⚠️ registerOAuthInfos дууссаныг илтгэх promise — бүртгэл дуусаагүй үед getCredential
  //    PKCE redirect хийдэггүй тул эрт дарсан «Нэвтрэх» race-д унахаас сэргийлж
  //    signIn эхэндээ үүнийг хүлээнэ.
  const oauthReadyRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    // Тохируулаагүй бол нэвтрэлтгүйгээр ажиллана
    if (!AUTH.appId) { setStatus('off'); return; }

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

        await esriId.checkSignInStatus(sharingUrl());

        const portal = new Portal({ url: AUTH.portalUrl });
        await portal.load();
        const u = portal.user;
        const info: User = {
          username: u?.username ?? '',
          fullName: u?.fullName || u?.username || '',
          thumbnail: u?.thumbnailUrl ?? null,
          orgId: u?.orgId ?? null,
        };
        const r = roleForUser(info.username);
        const orgOk = !AUTH.allowedOrgId || info.orgId === AUTH.allowedOrgId;

        // ⚠️ Эрхийн ХУВААЛЦСАН хүснэгтийг ЭХЭЛЖ татна (super бол байхгүй үед үүсгэнэ)
        //    — панелаас нэмсэн хэрэглэгчийг таних тул нэвтрүүлэхээс ӨМНӨ ачаална.
        await initRemote(r === 'super');
        // Нэвтрэх эрх: хатуу жагсаалт ЭСВЭЛ панелаас нэмсэн (store) хэрэглэгч.
        const admitted = orgOk && hasAccess(info.username);
        console.info('[selbe] нэвтэрсэн:', info.username, '· orgId:', info.orgId, '· үүрэг:', r ?? '—', '· admitted:', admitted);

        if (!alive) return;
        sessionStorage.removeItem(ATTEMPT_KEY);
        setUser(info);
        setRole(r);
        setStatus(admitted ? 'signed-in' : 'denied');
      } catch (e) {
        // «not-authenticated» бол ердийн (нэвтрээгүй) төлөв — улаан алдаа биш
        const notAuthed = (e as { name?: string })?.name === 'identity-manager:not-authenticated';
        if (notAuthed) console.debug('[selbe] нэвтрээгүй байна (хэвийн):', e);
        else console.error('[selbe] нэвтрэлт шалгах үед:', e);
        if (!alive) return;
        const wasAttempt = sessionStorage.getItem(ATTEMPT_KEY);
        sessionStorage.removeItem(ATTEMPT_KEY);
        if (wasAttempt) setError(describe(e));
        setStatus('signed-out');
      } finally {
        // ⚠️ import унасан ч signIn мөнхөд хүлээхгүй — давхар resolve нь хоргүй
        oauthReady();
      }
    })();

    return () => { alive = false; };
  }, []);

  /*
   * ЭРХИЙН ХҮЧИНГҮЙЖИЛТ — нэвтэрсэн ХЭВЭЭР байхад эрх нь хасагдсаныг барина.
   *
   * ⚠️ 2026-08-25: `initRemote` нь ЗӨВХӨН нэвтрэх агшинд ажилладаг байв —
   * админ аккаунтыг устгасан ч тэр хүн таб хаагаагүй л бол өдөржин порталд
   * үлддэг байлаа. Одоо 5 минут тутам ба таб идэвхжих бүрд хуваалцсан
   * хүснэгтийг дахин уншиж, эрх нь алга болсон бол шууд «denied» болгоно.
   * ⚠️ ArcGIS унасан үед `initRemote` cache-ээ ХЭВЭЭР үлдээдэг тул сүлжээний
   * түр тасалдал хэрэглэгчийг гаргахгүй.
   */
  useEffect(() => {
    if (status !== 'signed-in' || !user?.username) return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        await initRemote(false);
        if (alive && !hasAccess(user.username)) setStatus('denied');
      } catch { /* сүлжээний тасалдал — эрхийг хэвээр үлдээнэ */ }
    };
    const iv = setInterval(() => { void check(); }, 5 * 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [status, user?.username]);

  const signIn = async () => {
    setError(null);
    sessionStorage.setItem(ATTEMPT_KEY, '1');
    try {
      // ⚠️ OAuthInfo бүртгэл дуусахыг хүлээнэ — эрт дарахад redirect алдагдах race-аас сэргийлнэ
      await oauthReadyRef.current;
      const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
      // popup:false тул энэ нь хуудсыг ArcGIS нэвтрэлт рүү чиглүүлж, буцаж ирнэ
      await esriId.getCredential(sharingUrl());
    } catch (e) {
      console.error('[selbe] нэвтрэх үед:', e);
      sessionStorage.removeItem(ATTEMPT_KEY);
      setError(describe(e));
    }
  };

  /**
   * ГАРАХ — ЗӨВХӨН локал итгэмжлэлийг устгаад зогсохгүй, ArcGIS-ийн SSO сешнийг ч
   * хаана.
   *
   * ⚠️ 2026-08-19: Урьд нь `destroyCredentials()` + `reload()` хийдэг байв. Тэр нь
   * порталын cookie-г ХӨНДӨХГҮЙ тул «Өөр бүртгэлээр нэвтрэх» → «Нэвтрэх» дарахад
   * `/oauth2/authorize` нь ЯГ ТЭР хэрэглэгчид дуугүйхэн шинэ код олгож, эрх
   * татгалзсан дэлгэц рүү нь буцаадаг байлаа — өөр бүртгэлээр орох цорын ганц зам
   * нь browser-ийн cookie-г гараар цэвэрлэх байв.
   *
   * ⚠️ `redirect_uri` нь query-гүй ЦЭВЭР зам: буцаж ирээд `?v=…` үлдвэл хэрэглэгч
   * дөнгөж гарсан харагдац руугаа шууд эргэж ордог.
   */
  const signOut = async () => {
    const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
    esriId.destroyCredentials();
    const back = encodeURIComponent(location.origin + location.pathname);
    location.href =
      `${sharingUrl()}/rest/oauth2/signout?client_id=${encodeURIComponent(AUTH.appId)}&redirect_uri=${back}`;
  };

  const authorized = status === 'signed-in' || status === 'off';

  return (
    <Ctx.Provider value={{ status, authorized, user, role, error, signIn, signOut, clearError: () => setError(null) }}>
      {children}
    </Ctx.Provider>
  );
}

/**
 * Нэвтрэлтийн МЭДЭГДЭЛ — эрх татгалзсан (буруу байгууллага) эсвэл нэвтрэлт унасан
 * үед л хөвөгч цонхоор гарна. Бусад үед `null` — нүүр хуудас чөлөөтэй харагдана.
 */
export function AuthNotice() {
  const { status, user, role, error, signIn, signOut, clearError } = useAuth();
  if (status !== 'denied' && !(status === 'signed-out' && error)) return null;
  // Татгалзсан шалтгаан: (a) үүрэггүй бүртгэл, эсвэл (b) буруу байгууллага
  const orgMismatch = !!user && !!AUTH.allowedOrgId && user.orgId !== AUTH.allowedOrgId;
  const noRole = !role && !orgMismatch;

  return (
    <div className={s.screen}>
      <div className={s.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className={s.logo} />
        <div className={s.title}>{tr('Сэлбэ портал')}</div>

        {status === 'denied' && (
          <>
            {user && (
              <div className={s.user}>
                {user.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.thumbnail} alt="" className={s.avatar} />
                )}
                <div style={{ textAlign: 'left' }}>
                  <div className={s.userName}>{user.fullName}</div>
                  <div className={s.userSub}>{user.username}</div>
                </div>
              </div>
            )}
            {noRole ? (
              <>
                <p className={s.sub}>
                  {tr('Энэ бүртгэлд порталд хандах эрх олгогдоогүй байна. Эрх нээлгэхийг хүсвэл дараах хэрэглэгчийн нэрийг админд илгээнэ үү.')}
                </p>
                <p className={s.error}>{tr('Хэрэглэгч:')} {user?.username || '—'}</p>
              </>
            ) : (
              <>
                <p className={s.sub}>
                  {tr('Энэ бүртгэл танай байгууллагын хэрэглэгч биш тул хандах эрхгүй байна.')}
                </p>
                <p className={s.error}>
                  {tr('Бүртгэлийн orgId:')} {user?.orgId || '—'} {tr('· шаардлагатай:')} {AUTH.allowedOrgId}
                </p>
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
            {/* ⚠️ .screen бүтэн дэлгэцийг халхалдаг тул гарцгүй бол хэрэглэгч F5-гүйгээр гацна */}
            <button type="button" className={s.btn} onClick={signIn} style={{ marginTop: 16 }}>
              {tr('Дахин оролдох')}
            </button>
            <button type="button" className={s.btnGhost} onClick={clearError}>
              {tr('Хаах')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
