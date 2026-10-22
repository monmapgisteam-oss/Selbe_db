'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { AUTH, BOOTSTRAP_SUPER, isCodeSuper, roleForUser, type Role } from '@/lib/services';
import { initRemote, hasAccess, roleOf, remoteReady, closedFor, subscribe as subscribePerms } from '@/lib/permissions';
import { subscribeCaps } from '@/lib/caps';
import type { SysState } from '@/lib/permsRemote';
import { dateTime } from '@/lib/format';
import { setCurrentUser } from '@/lib/who';
import { installEntInterceptor } from '@/lib/entInterceptor';
import {
  cancelSignOut, dismissSessionDead, ensureFreshToken, lastRefreshFail, noteSignOut, registerIdentity, reopenSessionDead,
  retrySession, sessionDead, subscribeSessionDead,
} from '@/lib/authToken';
import { hasUnsavedWork } from '@/components/LocaleToggle';
import { useFocusTrap } from '@/lib/useFocusTrap';
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

/**
 * ⚠️ 2026-10-21 (аудит): SUPER-ИЙН БАТЛАХ ХҮСНЭГТҮҮДИЙН ҮҮСГЭЛТ — ХУУДАСНЫ ТУРШ НЭГ Л УДАА. Нэвтрэлтийн эффект дахин
 *    ажиллахад (deps · StrictMode-ийн давхар mount) `planTableReady(true)` / `obyemTableReady(true)` зэрэгцэн давхар
 *    явж, хүснэгт олдоогүй агшинд ХОЁР удаа үүсгэх эрсдэлтэй байв (`tableUrl` зөвхөн АМЖИЛТЫГ кэшлэдэг). Бэлэн болоогүй
 *    (унасан) бол амлалтыг тэглэнэ — дараагийн нэвтрэлтэд дахин оролдоно. Алдааг ЗАЛГИНА (доорх ⚠️: нэвтрэлтийн зам).
 */
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
  /**
   * ⚠️ 2026-10-05: ArcGIS-ийн токены шинэчлэлт ЭЦЭСЛЭН унасан (`authToken.sessionDead`) —
   *    `status` нь `signed-in` ХЭВЭЭР (Portal амьд), `AuthNotice` дээр нь «дахин нэвтрэх»
   *    цонх гаргана. Сүлжээний түр тасалдалд ХЭЗЭЭ Ч үнэн болохгүй.
   */
  sessionExpired: boolean;
  /**
   * ⚠️ 2026-10-19: СИСТЕМ ТҮР ХААГДСАН — ЭНЭ хэрэглэгчид (`permissions.closedFor`: `sysClose` эрхгүй, кодын super биш).
   *    `status` нь `signed-in` ХЭВЭЭР, харин `authorized` худал: `Root` дотор байсан Portal-ыг `frozen` загвараар
   *    амьд үлдээж (хадгалаагүй ажил устахгүй), `AuthNotice` дээр нь `SystemClosed` цонх гаргана. `null` = нээлттэй.
   */
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
 *
 * ⚠️ ЯАГААД ЗААВАЛ: хатуу нууцлалтай хөтөч (Firefox strict · Safari «бүх
 *    cookie хаах» · байгууллагын «сайтын өгөгдөл хаах» бодлого) нь
 *    `sessionStorage`-д хандахад ЗҮГЭЭР `null` буцаадаггүй, ШИДДЭГ.
 *
 * ⚠️ НӨЛӨӨ нь бүх апп: доорх дуудлагууд нэвтрэлтийн эффект ба «Нэвтрэх»
 *    товчны дотор байдаг тул шидсэн алдаа нь порталыг бүхэлд нь root
 *    ErrorBoundary-ийн бүтэн дэлгэцийн алдаа болгож, ХЭН Ч НЭВТРЭЖ
 *    ЧАДАХГҮЙ болно. `signIn`-д бүр хоёр дахин: `try`-д шидээд `catch`-д
 *    дахин шидэж, баригдаагүй promise болж гардаг байв.
 *
 * ⚠️ Энэ хамгаалалт `Root.tsx` (2026-09-15), `AgentChat`, `permissions`,
 *    `caps`, `guitsetgelAcl`, `scopedAcl`-д АЛЬ ХЭДИЙН хийгдсэн байсан ч
 *    БҮХ ЗАМЫГ гаталдаг ЭНЭ файл мартагдсан байв.
 *
 * ⚠️ Уншилт унавал `null` (=«оролдлого байгаагүй») — тэр нь зөв fallback:
 *    хамгийн ихдээ нэг удаагийн алдааны мессеж харагдахгүй, нэвтрэлт нь
 *    ХЭВЭЭР ажиллана.
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
 *
 * ⚠️ ЯАГААД: `location.assign`/`getCredential` (popup:false) нь хуудсыг ArcGIS руу
 *    чиглүүлдэг. Хадгалаагүй ажилтай модуль `beforeunload`-оор «Хуудаснаас гарах уу?»
 *    асуудаг — хэрэглэгч «Үлдэх» дарвал ЯМАР Ч үйл явдал ирэхгүй, амлалт үүрд хүлээнэ.
 *    Урьд нь «Дахин нэвтрэх» цонхны 4 товч ҮҮРД идэвхгүй, фокус урхинд гацдаг байв.
 * ⚠️ Дохио: хуудас харагдсаар (`pagehide` ирээгүй) БАЙХАД хэрэглэгчийн оролт
 *    (pointerdown/keydown/focus/visibilitychange) эсвэл `ms` хугацаа өнгөрсөн → цуцлагдсан.
 *    Удаан навигацид хуурамч эерэг гарч болно — тиймээс `cb` нь ЗӨВХӨН хор хөнөөлгүй
 *    зүйл хийнэ (товч идэвхжүүлэх, төлөв буцаах). Буцаах функц нь хяналтыг зогсооно.
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

/* ⚠️ 2026-10-20: Enterprise-ийн жижиг үсэгтэй талбар → эх нэр — JS API-ийн ямар ч давхарга (ноорог · эрхийн хүснэгт ·
   газрын зураг) үүсэхээс ӨМНӨ, аппын эхэнд нэг удаа (`lib/entInterceptor.ts`). Node/SSR-д чимээгүй алгасна. */
if (typeof window !== 'undefined') void installEntInterceptor();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (AUTH.appId ? 'checking' : 'off'));
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * ⚠️ Эрхийн ХУВААЛЦСАН хүснэгт уншигдсан эсэх (2026-09-08). `hasAccess` нь
   * панелаас нэмсэн хэрэглэгчийг ЗӨВХӨН уншилт амжилттай үед нэвтрүүлдэг
   * (fail-closed). Уншилт унасныг ЯЛГАЖ хэлэхгүй бол «эрх олгогдоогүй» гэсэн
   * ХУДАЛ шалтгаан гарч, админ эрхийг нь дахин дахин шалгаж цаг алдана.
   */
  const [permsRead, setPermsRead] = useState(true);
  /** Ажиллаж байхад эрх хасагдсан (`AuthCtx.accessLost`-ийн тайлбар) */
  const [accessLost, setAccessLost] = useState(false);
  /** ⚠️ 2026-10-19: систем ЭНЭ хэрэглэгчид хаалттай (`AuthCtx.sysClosed`-ийн тайлбар) */
  const [sysClosed, setSysClosed] = useState<SysState | null>(null);
  /** Poll-ын давтамжид (`period`) — эффектийн deps-д ороогүй тул ref (зөвхөн callback дотор бичнэ) */
  const sysClosedRef = useRef(false);
  /* ⚠️ Агуулга ижил бол хуучин объект — poll бүрд контекстын хэрэглэгчид дахин зурагдахгүй */
  const applySysClosed = useCallback((next: SysState | null) => {
    sysClosedRef.current = !!next;
    setSysClosed((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  // ⚠️ registerOAuthInfos дууссаныг илтгэх promise — бүртгэл дуусаагүй үед getCredential
  //    PKCE redirect хийдэггүй тул эрт дарсан «Нэвтрэх» race-д унахаас сэргийлж
  //    signIn эхэндээ үүнийг хүлээнэ.
  const oauthReadyRef = useRef<Promise<void> | null>(null);
  /** Нэвтрэх үеийн байгууллагын шалгалтын дүн — revocation дахин ашиглана */
  const orgOkRef = useRef(true);
  /** Үечилсэн шалгалтын одоогийн функц — `recheckPerms` гараар дуудна (2026-10-05) */
  const checkRef = useRef<(() => Promise<void>) | null>(null);
  /*
   * ⚠️ 2026-10-05: СЕШН ДУУССАН төлөв (`AuthCtx.sessionExpired`-ийн тайлбар). Эх сурвалж нь
   *    `authToken` (хүсэлтийн давхарга) — энд зөвхөн React руу дамжуулна.
   */
  const sessionExpired = useSyncExternalStore(subscribeSessionDead, sessionDead, () => false);

  useEffect(() => {
    // Тохируулаагүй бол нэвтрэлтгүйгээр ажиллана
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: hydration — серверийн зурагт «шалгаж байна» гарч, mount-ын дараа л «off» болно; анхны төлөвт тавьбал статик HTML зөрнө
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
        /* ⚠️ 2026-10-21 (оношилгоо, ЗӨВХӨН dev): JS API-ийн «Sign in» цонх ЯМАР хаягаас гарч байгааг консолд
           хэвлэнэ — цонх өөрөө URL-аа хэлдэггүй («ArcGIS Online (item)»). Production багцад орохгүй. */
        if (process.env.NODE_ENV !== 'production') {
          const mgr = esriId as unknown as { signIn: (...a: unknown[]) => unknown };
          const orig = mgr.signIn.bind(esriId);
          mgr.signIn = (...a: unknown[]) => {
            console.warn('[selbe] IdentityManager нэвтрэлт шаардав — хаяг:', a[0], '· сервер:', (a[1] as { server?: string } | undefined)?.server);
            return orig(...a);
          };
        }
        /* ⚠️ Бүх REST `fetch` энэ бүртгэлээр токеноо авна (`authToken.ts`). */
        registerIdentity(esriId, sharingUrl());

        await esriId.checkSignInStatus(sharingUrl());

        const portal = new Portal({ url: AUTH.portalUrl });
        await portal.load();
        const u = portal.user;
        const info: User = {
          username: u?.username ?? '',
          fullName: u?.fullName || u?.username || '',
          /* ⚠️ 2026-10-21 (аудит): JS API `thumbnailUrl`-д OAuth токеныг query string-ээр залгадаг (`Portal.normalizeUrl`) —
             <img src>-ээр лог · кэш · түүхэнд үлддэг тул ХАСНА (`authToken.ts`-ийн «токен URL-д бичихгүй» дүрэм).
             Токенгүй уншигдахгүй бол зураг нуугдана (`onError`). */
          thumbnail: u?.thumbnailUrl ? u.thumbnailUrl.replace(/([?&])token=[^&]*(&?)/, (_m, a: string, b: string) => (b ? a : '')).replace(/[?&]$/, '') : null,
          orgId: u?.orgId ?? null,
        };
        /* ⚠️ 2026-10-21 (хэрэглэгчийн шийдвэр): SUPER = эрхийн хүснэгтийн мөр (`roles._setTableSupers`) — хүснэгт
           уншигдахаас ӨМНӨ хэн ч super биш, тиймээс `hard`-ыг `initRemote`-ийн ДАРАА бодно (доор). Хүснэгт үүсгэх
           эрх (`canCreate`): кодын (тестийн) super эсвэл анхны админ (`BOOTSTRAP_SUPER` — хүснэгт байхгүй = super мөргүй). */
        const canCreate = isCodeSuper(info.username) || info.username.trim().toLowerCase() === BOOTSTRAP_SUPER;
        const orgOk = !AUTH.allowedOrgId || info.orgId === AUTH.allowedOrgId;
        orgOkRef.current = orgOk;

        // ⚠️ Эрхийн ХУВААЛЦСАН хүснэгтийг ЭХЭЛЖ татна (super бол байхгүй үед үүсгэнэ)
        //    — панелаас нэмсэн хэрэглэгчийг таних тул нэвтрүүлэхээс ӨМНӨ ачаална.
        //    Хүснэгт үүсгэх эрхийг ЗӨВХӨН хатуу тохиргооны super-ээр тогтооно.
        /*
         * ⚠️ ҮР ДҮНГ ЗААВАЛ БАРИНА (2026-09-08, хэрэглэгч: «бүртгэсэн хэрнээ
         * нэвтэрч болохгүй байна»). Урьд нь `await initRemote(...)` гэж утгыг
         * нь ХАЯДАГ байв — гэтэл `hasAccess` нь панелаас нэмсэн хэрэглэгчийг
         * ЗӨВХӨН `remoteLoaded === true` үед л нэвтрүүлдэг (fail-closed,
         * localStorage-оо гараар засаад өөрийгөө нэмэхээс хамгаалдаг). Тиймээс
         * хүснэгтийн уншилт унавал (сүлжээ, токен, түр саат) шинээр бүртгэсэн
         * хүн «эрх олгогдоогүй» гэсэн дэлгэц хараад ҮЛДДЭГ байлаа — шалтгаан нь
         * хаана ч гарахгүй, админ эрхийг нь дахин дахин шалгаж цаг алддаг.
         *
         * ⚠️ Хатуу жагсаалтын хүн (`roleForUser`) нөлөөлөхгүй — тэд remote-гүй
         * нэвтэрнэ. Асуудал нь ЗӨВХӨН панелаас нэмсэн аккаунтуудад хамаарна.
         */
        const remoteOk = await initRemote(canCreate);
        /* ⚠️ 2026-10-21 (аудит): `alive`-ийг ЭНД шалгана — урьд нь зөвхөн `setPermsRead`-ийн ДАРАА байсан тул
           эффект цэвэрлэгдсэн (unmount / дахин ажилласан) хойно ч хүснэгт үүсгэлт · `setPermsRead` явдаг байв. */
        if (!alive) return;
        /* ⚠️ 2026-10-21: хүснэгт уншигдсаны ДАРАА — хүснэгтийн super (эсвэл super мөргүй хүснэгтэд анхны админ) энд л танигдана */
        const hard = roleForUser(info.username);
        /*
         * ⚠️ ХУВААРИЙН БАТЛАХ ХҮСНЭГТИЙГ ч мөн super нэвтрэхэд үүсгэнэ
         *    (2026-09-07-ны аудит). Урьд нь тэр нь ЗӨВХӨН super «Хуваарь»
         *    хуудсыг НЭЭХЭД үүсдэг байв — админ тэр хуудас руу хэзээ ч
         *    орохгүй бол гүйцэтгэгчид хуваарь илгээж чадахгүй, өөрсдөө
         *    засах ЗАМГҮЙ түгждэг байлаа. Эрхийн хүснэгттэй ижил зан төлөв.
         *
         * ⚠️ Алдааг ЗАЛГИНА: энэ нь нэвтрэлтийн ЗАМ дээр байгаа тул хүснэгт
         *    үүсэхгүй байснаас болж хэн ч порталд орж чадахгүй болох ёсгүй.
         *    Хуудас өөрөө шалтгааныг ил хэлнэ (`flowReady === false`).
         */
        if (hard === 'super') {
          /*
           * ⚠️ ИНЖЕНЕРИЙН ОБЬЁМЫН БАТЛАХ ХҮСНЭГТ — ЯГ ИЖИЛ ШАЛТГААН
           * (2026-09-08-ны 100% аудитаар илэрсэн). Модуль нь `canCreate`
           * параметртэй `obyemTableReady`-г экспортлодог ч түүнийг ХААНААС Ч
           * дуудахгүй байсан тул бүх зам `tableUrl(false)`-ээр явж, хүснэгт
           * ХЭЗЭЭ Ч үүсэхгүй байв: инженер «Обьём батлуулах» дарахад
           * «Батлах хүснэгт олдсонгүй — админд хандана уу» гэж мөнхөд
           * няцаагдана. Хуваарийн хүснэгтийн 2026-09-07-ны сургамжийг
           * давтсан алдаа.
           * ⚠️ 2026-10-21 (аудит): хоёулаа `ensureSuperTables` — модулийн түвшний НЭГ амлалт (дээрх ⚠️).
           */
          await ensureSuperTables();
          if (!alive) return;
        }
        /*
         * ҮҮРЭГ — override-ыг тооцсон ГАНЦ эх сурвалж (`roleOf`).
         * ⚠️ Урьд нь зөвхөн хатуу жагсаалтаас авдаг байсан тул панелаас
         * нэмсэн урсгалын аккаунтын role нь null үлдэж, «Гүйцэтгэлийн
         * хяналт» дээр шат сонгогч нээлттэй болдог байв (өөрийн ажлаа
         * өөрөө батлах зам). initRemote-ийн ДАРАА дуудна — store бэлэн.
         */
        const r = roleOf(info.username);
        // Нэвтрэх эрх: хатуу жагсаалт ЭСВЭЛ панелаас нэмсэн (store) хэрэглэгч.
        const admitted = orgOk && hasAccess(info.username);
        /* ⚠️ ЗӨВХӨН панелаас нэмсэн (хатуу жагсаалтад БАЙХГҮЙ) хүнд утгатай:
           хатуу үүрэгтэй хүн remote-гүй ч нэвтэрдэг тул тэдэнд худал
           анхааруулга гаргах ёсгүй. */
        /* ⚠️ 2026-10-21 (аудит): `alive`-ийн ДАРАА — цэвэрлэгдсэн эффект салсан компонентын төлөв бичихгүй */
        if (!alive) return;
        setPermsRead(remoteOk || !!hard);
        console.info('[selbe] нэвтэрсэн:', info.username, '· orgId:', info.orgId, '· үүрэг:', r ?? '—', '· admitted:', admitted);

        attemptClear();
        /* ⚠️ 2026-10-19: СИСТЕМ ТҮР ХААГДСАН (`__sys__:maintenance`) — нэвтрэх эрхтэй ч `sysClose`/super биш бол
           `signed-in` хэвээр, `authorized` худал (`AuthCtx.sysClosed`). Төлөв `initRemote`-ийн ДАРАА бэлэн. */
        const lock = admitted ? closedFor(info.username) : null;
        applySysClosed(lock);
        /* ⚠️ lib-түвшний эрхийн шалгуур (`who.requireCap`) энэ нэрийг уншина. Хаалттай үед хоосон — бичилт татгалзана. */
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
        /* ⚠️ Нэвтэрсэн атлаа portal/эрхийн хүснэгт унавал (`!notAuthed`)
           шалтгааныг ИЛ харуулна (2026-09-17) — урьд нь чимээгүй «нэвтрээгүй»
           дэлгэц гарч, «Нэвтрэх» дарахад credential хүчинтэй тул redirect ч
           үгүй, төлөв ч солигдохгүй мөнхөд гацдаг байв. */
        if (wasAttempt || !notAuthed) setError(describe(e));
        setCurrentUser(null);
        setStatus('signed-out');
      } finally {
        // ⚠️ import унасан ч signIn мөнхөд хүлээхгүй — давхар resolve нь хоргүй
        oauthReady();
      }
    })();

    return () => { alive = false; };
  }, [applySysClosed]);

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
  /*
   * ⚠️ ХЯЗГААР (баримтжуулсан): энэ нь зөвхөн ПОРТАЛЫН UI-г хаадаг — ArcGIS-ийн
   * OAuth token нь хугацаа дуустлаа хүчинтэй үлдэх тул үйлчилгээ рүү шууд REST
   * хандалтыг зогсоохгүй. Өгөгдлийн түвшний эрх нь ArcGIS-ийн өөрийн sharing
   * дээр байх ёстой; энд клиент талд түүнээс чанга хамгаалалт байхгүй.
   */
  useEffect(() => {
    if ((status !== 'signed-in' && status !== 'denied') || !user?.username) return;
    // Байгууллага нь таарахгүй бол poll хийх утгагүй — эрх сэргэх боломжгүй
    if (!orgOkRef.current) return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        /* ⚠️ 2026-10-05: шалгалтын ӨМНӨ токеныг шинэчилж үзнэ. Урьд нь энэ шалгалт «токен
           үхсэн» ба «сүлжээ тасарсан» хоёрыг ялгадаггүй — хоёулаа `rok === false`. Одоо
           шинэчлэлт ЭЦЭСЛЭН унавал `authToken` сешн дууссаныг тэмдэглэж (`sessionExpired`),
           сүлжээний саатал бол урьдын адил чимээгүй (эрх хэвээр). */
        await ensureFreshToken();
        // ⚠️ canCreate=false (poll-д хүснэгт үүсгэхгүй), trusted=хатуу super
        const rok = await initRemote(false, roleForUser(user.username) === 'super');
        if (!alive) return;
        /* ⚠️ Уншилтын байдлыг ч шинэчилнэ — татгалзлын дэлгэц ЖИНХЭНЭ шалтгааныг
           харуулна (2026-09-08). Хатуу үүрэгтэй хүнд remote хамаагүй. */
        setPermsRead(rok || !!roleForUser(user.username));
        const ok = hasAccess(user.username);
        /* ⚠️ 2026-09-30: ТҮР УНШИЛТЫН АЛДААГААР ХААХГҮЙ. Эрхийн хүснэгт
           уншигдаагүй (`rok === false`) бол «эрхгүй» гэдэг нь ТОДОРХОЙ ДҮН
           биш — зөвхөн «мэдэхгүй». Урьд нь ийм үед ч `denied` болж, Portal
           устгагдаж хадгалаагүй ажил алга болдог байв. Хаахыг ЗӨВХӨН амжилттай
           уншилтын дараа. Нээх (`ok`) нь хэвээр шууд. */
        /* ⚠️ 2026-10-06: энд үлдэх `cache` нь remote уншигдсаны дараа localStorage-оор
           ӨРГӨСӨХГҮЙ (`permissions.subscribe` → `narrowOnly`) — эрт буцалт хуурамч эрх хадгалахгүй. */
        if (!ok && !rok) return;
        /* ⚠️ 2026-10-19: «Систем түр хаах» — уншилт унасан (`!rok`) бол `closedFor` СҮҮЛИЙН мэдэгдэж буй төлөвөөр
           (fail-open, `permissions._syncRemoteSys`-ийн ⚠️). Нээгдвэл F5 шаардалгүй цонх хаагдаж ажил үргэлжилнэ. */
        const lock = ok ? closedFor(user.username) : null;
        applySysClosed(lock);
        /* ⚠️ lib-түвшний эрхийн шалгуур (`who.requireCap`) ч мөн дагана (2026-09-17):
           урьд нь зөвхөн анхны нэвтрэлтэд бичигдэж, denied→signed-in сэргэлтэд
           `current=null` үлдэж F5 хүртэл бүх бичилт «эрхгүй» гэдэг байв. */
        setCurrentUser(ok && !lock ? user.username : null);
        // Эрх ХАСАГДВАЛ шууд хаана; БУЦААЖ СЭРГЭЭГДВЭЛ F5 шаардалгүй нээнэ
        /* ⚠️ 2026-09-30: ажиллаж байхад хасагдсаныг тэмдэглэнэ — `Root` Portal-ыг
           үлдээж, дээр нь хаалтын цонх гаргана (ажил алга болохгүй). */
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
    /*
     * ⚠️ ТАТГАЛЗСАН үед ХУРДАН дахин оролдоно (2026-09-08). Эрхийн хүснэгтийн
     * уншилт унавал панелаас нэмсэн хэрэглэгч «эрх олгогдоогүй» дэлгэцэнд
     * гацна — 5 минут хүлээх нь хэтэрхий урт, хэрэглэгч хуудсаа хааж админ
     * руу залгана. Сүлжээ сэргэмэгц 15 секундэд өөрөө нээгдэнэ. Нэвтэрсэн
     * (`signed-in`) үед remote уншигдсан бол 5 минут — тэнд яарах шалтгаангүй.
     *
     * ⚠️ `signed-in` ч REMOTE УНШИГДААГҮЙ бол 15 сек (2026-09-21, аудитын
     *    засвар). Эрх нь fail-closed (`caps`·`guitsetgelAcl`·`scopedAcl` бүгд
     *    remote-гүй бол хоосон) болсноос хойш хатуу жагсаалтын хэрэглэгч
     *    (remote-гүй нэвтэрдэг) remote унасан бол 5 мин хүртэл БҮХ нэмэлт
     *    эрхгүй суудаг байв — `caps.ts`-ийн толгойн «15 сек–5 мин» тайлбар
     *    кодтой зөрж байлаа. Хугацааг оролдлого БҮРИЙН дараа дахин сонгоно
     *    (`setTimeout` гинж): remote уншигдмагц 5 мин руу буцна.
     */
    checkRef.current = check;
    /* ⚠️ 2026-10-19: систем ХААЛТТАЙ хэрэглэгчид 30 с — дахин нээгдэхийг хурдан мэдэж цонх өөрөө хаагдана
       (5 мин хүлээлгэхгүй). Хаалттай үед ч `denied`/remote-гүй 15 с нь давамгайлна. */
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

  /*
   * ⚠️ 2026-10-19 (аудит): ХААЛТЫГ ЭРХИЙН STORE-ИЙН МЭДЭГДЭЛ БҮРД ДАХИН ТООЦНО. `initRemote`-ийг энэ файлаас
   *    гадна ч дууддаг (`permissions.scheduleRemoteRefresh`/storage үйл явдал · `Guitsetgel.retryAcl` · `UserAdmin`) —
   *    тэдгээрт ирсэн «хаагдсан» төлөв урьд нь энд хүрэхгүй, дараагийн 5 мин-ийн poll хүртэл хэрэглэгч дотор
   *    үлдэж (`who` нэртэй — бичилт ч явна), харин Portal-ын шар зурвас «бусдад хаалттай» гэж худал хэлдэг байв.
   * ⚠️ Зөвхөн `signed-in` үед; нэвтрэх эрх (`hasAccess`) алга бол юу ч хийхгүй — татгалзлыг poll шийднэ
   *    (уншилтын амжилтыг тэр л мэднэ). caps-ийн мэдэгдэлд ч (`sysClose` олгогдох/хасагдах).
   */
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

  /* ⚠️ 2026-10-06 (аудит, гүйцэтгэл): контекстын функцууд ТОГТМОЛ лавлагаатай (`useCallback`) —
     доорх `value`-ийн `useMemo`-тай хамт `useAuth()`-ын хэрэглэгчид рендер бүрт дахин зурагдахгүй. */
  const recheckPerms = useCallback(async () => { await checkRef.current?.(); }, []);

  const signIn = useCallback(async () => {
    setError(null);
    attemptSet();
    try {
      // ⚠️ OAuthInfo бүртгэл дуусахыг хүлээнэ — эрт дарахад redirect алдагдах race-аас сэргийлнэ
      await oauthReadyRef.current;
      const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
      // popup:false тул энэ нь хуудсыг ArcGIS нэвтрэлт рүү чиглүүлж, буцаж ирнэ
      await esriId.getCredential(sharingUrl());
      /* ⚠️ Энд ХҮРСЭН бол redirect болоогүй — localStorage-д хүчинтэй
         credential байсан (шалгалт өөр шалтгаанаар унасан). Эффект `[]`
         deps тул дахин ажиллахгүй — хуудсыг дахин ачаалж шалгалтыг
         эхнээс нь явуулна (2026-09-17). Урьд нь гарц зөвхөн F5 байв. */
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
  const signOut = useCallback(async () => {
    const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
    /* ⚠️ 2026-10-05: итгэмжлэл устахыг «сешн дууссан» гэж тэмдэглэхгүй (`authToken.noteSignOut`) */
    noteSignOut();
    /* ⚠️ 2026-10-06 (аудит): эрхийн КЭШИЙГ устгана — хуваалцсан компьютер дээр дараагийн хүнд
       өмнөх хэрэглэгчийн эрхийн хүснэгт (хэн ямар эрхтэй) үлдэхгүй. ЗӨВХӨН кэш: dirty-set
       (`*-dirty-v1` — админы ArcGIS-т хүрээгүй засвар)-ийг ХӨНДӨХГҮЙ, «Дахин синк»-ийн эх. */
    /* ⚠️ 2026-10-09: урсгалын ACL-ийн кэшүүд (`*-acl-v1` — хэн аль шатанд батлах эрхтэй) ба эрхийн
       төрлийн кэш (`selbe-roletypes-cache-v1`) мөн устна — урьд зөвхөн perms/caps устдаг тул
       дараагийн хүнд өмнөх хэрэглэгчийн байгууллагын эрхийн бүтэц үлддэг байв. */
    const clearPermsCache = () => {
      for (const k of [
        'selbe-perms-v1', 'selbe-caps-v1', 'selbe-roletypes-cache-v1',
        'selbe-guitsetgel-acl-v1', 'selbe-huvaari-acl-v1', 'selbe-obyem-acl-v1', 'selbe-ajil-acl-v1',
        'selbe-chanar-acl-v1', 'selbe-qaqc-acl-v1', 'selbe-butets-acl-v1',
      ]) {
        try { localStorage.removeItem(k); } catch { /* хувийн горим */ }
      }
    };
    /* ⚠️ 2026-10-06 (аудит): ХАДГАЛААГҮЙ АЖИЛТАЙ үед итгэмжлэлийг навигацийн ӨМНӨ устгахгүй.
       Модулийн `beforeunload` «Хуудаснаас гарах уу?» асуухад «Үлдэх» дарвал портал нээлттэй
       ч токенгүй үлдэж, хадгалалт бүр 499 → «эрх алга» болдог, `ending` үүрд үнэн тул «сешн
       дууссан» цонх ч гардаггүй байв. Одоо: итгэмжлэл ЗӨВХӨН хуудас үнэхээр гарахад
       (`pagehide`) устана; цуцлагдсан бол `ending`-ийг буцаана (`cancelSignOut`).
       ⚠️ `pagehide` сонсогчийг цуцлалтын дараа ч ҮЛДЭЭНЭ: удаан навигацийг цуцлалт гэж
       андуурвал итгэмжлэл үлдэж, ArcGIS-ээс буцаж ирэхэд ИЖИЛ хэрэглэгчээр дуугүй нэвтэрнэ
       (дээрх 2026-08-19-ний ⚠️). Хэрэглэгч гарахыг аль хэдийн хүссэн тул дараагийн F5-д
       гарсан байх нь зөв.
       Хадгалаагүй ажилгүй үед асуулт гарахгүй — урьдын адил шууд устгана. */
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
    /* ⚠️ Энэ бол ArcGIS-ийн ГАДААД гарах хаяг — Next.js-ийн дотоод хуудас БИШ
       тул `router.push` тохирохгүй: бүтэн навигаци ЗААВАЛ хэрэгтэй (ArcGIS
       өөрөө cookie-гоо цэвэрлээд бидэн рүү буцаана). Дүрэм нь дотоод/гадаад
       хаягийг ялгадаггүй тул ЭНД л унтраана — бусад газарт хүчинтэй хэвээр. */
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(
      `${sharingUrl()}/rest/oauth2/signout?client_id=${encodeURIComponent(AUTH.appId)}&redirect_uri=${back}`,
    );
  }, []);

  const clearError = useCallback(() => setError(null), []);
  /* ⚠️ 2026-10-19: систем хаалттай хэрэглэгч `signed-in` атлаа харагдацад ОРОХГҮЙ (`AuthCtx.sysClosed`) */
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
  /*
   * ⚠️ 2026-10-05: СЕШН ДУУССАН — Portal доор нь АМЬД (`status` нь `signed-in` хэвээр тул
   *    `Root` юу ч солихгүй). `AccessLost`-ийн ижил хаалтын цонх; дахин нэвтрэх нь хуудсыг
   *    ArcGIS руу чиглүүлдэг (доорх `SessionExpired`-ийн ⚠️) тул хэрэглэгч эхлээд ажлаа
   *    хуулж авах боломжтой.
   * ⚠️ 2026-10-19 (аудит): `SystemClosed`-ООС ӨМНӨ. Урьд нь хаалтын цонх түрүүнд байсан тул сешн нь дууссан
   *    хаалттай хэрэглэгч «Дахин нэвтрэх» товчийг ХАРАХГҮЙ, «Дахин шалгах» нь токенгүй тул үүрд унаж — систем
   *    нээгдсэн ч цонх хаагдахгүй гацдаг байв. Дахин нэвтэрсний дараа хаалттай бол `SystemClosed` гарна.
   */
  if (sessionExpired && status === 'signed-in') return <SessionExpired username={user?.username} onSignOut={signOut} />;
  /*
   * ⚠️ 2026-10-19: СИСТЕМ ТҮР ХААГДСАН — сешн дууссан цонхны ДАРАА, бусад бүх цонхноос өмнө: хаалттай үед
   *    татгалзал/алдааны цонх утгагүй. `signed-in` үед л (татгалзсан хүнд өөрийн шалтгаан).
   */
  if (sysClosed && status === 'signed-in') {
    return <SystemClosed info={sysClosed} username={user?.username} onRecheck={recheckPerms} onSignOut={signOut} />;
  }
  if (status !== 'denied' && !(status === 'signed-out' && error)) return null;

  /*
   * ⚠️ 2026-09-30: АЖИЛЛАЖ БАЙХАД ЭРХ ХАСАГДСАН — Portal доор нь АМЬД үлдэнэ
   *    (`Root`). Бүтэн дэлгэцийн хаалт (ард нь ажиллах боломжгүй), гэхдээ
   *    эрх сэргээгдвэл (15 с тутмын шалгалт) цонх өөрөө хаагдаж хадгалаагүй
   *    ажил хэвээр үлдэнэ. Дахин ачаалах/гарах нь хэрэглэгчийн сонголт.
   */
  if (status === 'denied' && accessLost) return <AccessLost username={user?.username} onSignOut={signOut} />;
  /*
   * ТАТГАЛЗСАН ШАЛТГААНЫ ДАРААЛАЛ (2026-09-21): org зөрөв → эрхийн жагсаалт
   * уншигдсангүй → эрх олгогдоогүй.
   *
   * ⚠️ Урьд нь `noRole = !role && !orgMismatch` гэж `role`-оос салаалдаг байв.
   *    Гэтэл `roleOf()` нь localStorage кэшээс үүргийг буцаадаг тул remote
   *    унасан ч `role` нь `null` биш → `noRole` ХЭЗЭЭ Ч үнэн болохгүй →
   *    `permsRead === false`-ийн «эрхийн жагсаалтыг уншиж чадсангүй» салаа
   *    хэзээ ч гарахгүй, оронд нь org ИЖИЛ атлаа «танай байгууллагын
   *    хэрэглэгч биш» гэсэн ХУДАЛ мессеж гардаг байлаа. Одоо `role`-оос огт
   *    хамаарахгүй: org таарч байвал org-mismatch мессеж ХЭЗЭЭ Ч гарахгүй.
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
            {/*
              * ⚠️ ХОЁР ӨӨР ШАЛТГААНЫГ ЯЛГАНА (2026-09-08). `hasAccess` нь
              * панелаас нэмсэн хэрэглэгчийг ЗӨВХӨН эрхийн хүснэгт амжилттай
              * уншигдсан үед нэвтрүүлдэг. Уншилт унавал (сүлжээ, токен, түр
              * саат) «эрх олгогдоогүй» гэсэн ХУДАЛ шалтгаан гарч, шинээр
              * бүртгүүлсэн хүн админ руу дэмий хандаж, админ эрхийг нь
              * дахин дахин шалгаж цаг алддаг байв.
              * ⚠️ 2026-09-21: салаалалт `reason`-оор (дээрх тайлбар) — `role`
              *    кэшээс ирдэг тул шалтгааны шийдвэрт ОРОХГҮЙ.
              */}
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
                {/* ⚠️ 2026-10-06 (аудит): урьд нь цорын ганц гарц нь БҮТЭН гарах байв — уншилт
                    түр унасан бол эрхийн хүснэгтийг шууд дахин уншина (15 сек хүлээлгүй). */}
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
    </NoticeDialog>
  );
}

/**
 * ⚠️ 2026-10-06 (аудит, хүртээмж): татгалзал / нэвтрэлтийн алдааны карт нь бүтэн дэлгэцийн
 *    хаалт атлаа `role="dialog"`, фокусын урхигүй байв — Tab ард нь харагдахгүй товчнууд
 *    руу гардаг. `AccessLost` · `SessionExpired`-тэй ижил: тусдаа компонент (hook нь
 *    `AuthNotice`-ийн эрт `return`-үүдийн дараа дуудагдах ёсгүй).
 */
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
 * АЖИЛЛАЖ БАЙХАД ЭРХ ХАСАГДСАН — хаалтын цонх (2026-09-30, `AuthNotice`-ийн ⚠️).
 * ⚠️ Тусдаа компонент: фокусын урхи (`useFocusTrap`) hook тул `AuthNotice`-ийн
 *    эрт `return`-үүдийн дараа дуудаж болохгүй. Урхигүй бол Tab нь доорх
 *    порталын товчнууд руу гарна.
 */
/**
 * НЭВТРЭЛТИЙН ХУГАЦАА ДУУССАН — хаалтын цонх (2026-10-05, `authToken`-ийн «СЕШН ДУУССАН» ⚠️).
 *
 * ⚠️ ХУУДСЫГ ДАХИН АЧААЛАЛГҮЙ НЭВТРЭХ БОЛОМЖГҮЙ (одоогийн OAuth тохиргоонд): `OAuthInfo` нь
 *    `popup: false` (бүтэн хуудсаар чиглүүлнэ) — popup нэвтрэлтэд тусдаа callback хуудас
 *    ба ArcGIS апп дээр түүний redirect URI бүртгэл хэрэгтэй (төслийн эзний шийдвэр). Тиймээс:
 *      · «Дахин шалгах» — токеныг дахин шинэчилж үзнэ; сэргэвэл цонх хаагдаж ажил ХЭВЭЭР.
 *      · «Түр хаах» — цонхыг хааж хадгалаагүй ажлаа хуулж авах боломж; ⚠️ 2026-10-09 (аудит №2):
 *        10 минутын турш ард явдаг poll-ууд (эрхийн шалгалт · тэмдэг · IoT) цонхыг БУЦААЖ
 *        ГАРГАХГҮЙ (`authToken.dismissSessionDead`-ийн ⚠️), түүнээс хойшхи татгалзалд л буцаж
 *        гарна; энэ хооронд хүсэлтүүд алдаагаа өөрсдөө хэлнэ. Эрх нэмэгдэхгүй — сервер токеныг аль хэдийн
 *        татгалзаж байгаа тул ард нь юу ч хадгалагдахгүй, уншигдахгүй.
 *      · «Дахин нэвтрэх» — итгэмжлэлийг устгаад ArcGIS руу чиглүүлнэ; буцаж ирэхэд ИЖИЛ
 *        харагдац (`?v=`) нээгдэнэ, гэхдээ хадгалаагүй өөрчлөлт АЛГА болно — текстэд ИЛ хэлнэ.
 * ⚠️ «Ноорог локалд хадгалагдсан» гэж ХЭЛЭХГҮЙ: энэ нь зөвхөн зарим хуудсанд үнэн.
 * ⚠️ Тусдаа компонент — `AccessLost`-ийн адил фокусын урхи hook-той.
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
  /* ⚠️ 2026-10-06: хадгалаагүй ажилтай үед ЭХНИЙ даралт зөвхөн анхааруулна, ХОЁР ДАХЬ нь чиглүүлнэ */
  const [armed, setArmed] = useState(false);
  const reauth = async () => {
    /* ⚠️ 2026-10-06 (аудит): ХАДГАЛААГҮЙ АЖИЛ байвал эхлээд «Түр хаах»-ыг санал болгоно —
       чиглүүлэлтэд модулийн `beforeunload` «Гарах уу?» асуух бөгөөд «Үлдэх» дарвал урьд нь
       цонхны 4 товч ҮҮРД идэвхгүй (`busy`), фокус урхинд гацдаг байв. */
    if (!armed && hasUnsavedWork()) {
      setArmed(true);
      setNote(tr('Хадгалаагүй ажил байна — дахин нэвтрэхэд алдагдана. Эхлээд «Түр хаах» дарж ажлаа хуулж авна уу. Үргэлжлүүлэх бол «Дахин нэвтрэх»-ийг дахин дарна уу.'));
      return;
    }
    setBusy(true);
    setNote('');
    let stopWatch: (() => void) | null = null;
    try {
      const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
      /* Хуучин (үхсэн) итгэмжлэлийг устгана — эс бөгөөс `getCredential` түүнийг буцаагаад чиглүүлэхгүй.
         ⚠️ `noteSignOut` ДУУДАХГҮЙ: тэр нь цонхыг хаадаг — чиглүүлэлт унавал (offline) алдаа
            харагдах газаргүй болно. Цонх чиглүүлэх хүртэл нээлттэй үлдэнэ.
         ⚠️ 2026-10-06: устгахаас ӨМНӨ хуулбарлана — чиглүүлэлт ЦУЦЛАГДВАЛ («Үлдэх») сэргээж,
            «Дахин шалгах» (`retrySession`) дахин ажиллах боломжтой үлдэнэ. `getCredential`-д
            хуучин итгэмжлэл БАЙХ ёсгүй тул устгалтыг `pagehide` хүртэл хойшлуулах боломжгүй. */
      let saved: unknown = null;
      try { saved = esriId.toJSON(); } catch { saved = null; }
      esriId.destroyCredentials();
      attemptSet();
      /* ⚠️ 2026-10-06: «Үлдэх» дарсан (хуудас хэвээр) бол цонхыг ДАХИН идэвхжүүлнэ — `busy` хэзээ ч гацахгүй */
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
    <div ref={ref} className={`${s.screen} ${s.screenOver}`} role="alertdialog" aria-modal="true" aria-labelledby="selbe-session-expired">
      <div className={s.card}>
        <img src="/logo.svg" alt="" className={s.logo} />
        <div className={s.title} id="selbe-session-expired">{tr('Нэвтрэлтийн хугацаа дууссан')}</div>
        <p className={`${s.sub} ${s.subTight}`}>
          {tr('ArcGIS-ийн нэвтрэлтийн хугацаа дууссан тул өгөгдөл унших, хадгалах боломжгүй боллоо. Нээлттэй ажил тань энэ цонхны ард хэвээр байна.')}
        </p>
        <p className={s.sub}>
          {tr('Дахин нэвтрэхэд хуудас дахин ачаалагдаж, ХАДГАЛААГҮЙ өөрчлөлт алга болно. Хэрэгтэй бол эхлээд энэ цонхыг түр хааж, хадгалаагүй ажлаа хуулж авна уу.')}
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
 * СИСТЕМ ТҮР ХААГДСАН — бүтэн дэлгэцийн хаалтын цонх (⚠️ 2026-10-19, `permissions.setSystemClosed`).
 * ⚠️ `AccessLost`-ийн загвар: `.screen .screenOver` (Portal ард нь амьд — хадгалаагүй ажил устахгүй), фокусын урхи.
 * ⚠️ Тогтмол текст ЗААВАЛ (хэрэглэгчийн шийдвэр) + хаагчийн нэмэлт тайлбар ба «Дахин нээгдэх» (сонголттой).
 * ⚠️ «Дахин шалгах» нь эрхийн хүснэгтийг шууд дахин уншина (`recheckPerms`) — нээгдсэн бол цонх өөрөө хаагдана;
 *    автоматаар 30 с тутам ч шалгана (`AuthProvider`-ийн `period`).
 * ⚠️ ЭКСПОРТ — `smoke.ui.check` зурж шалгана.
 */
export function SystemClosed({ info, username, onRecheck, onSignOut }: {
  info: SysState; username?: string; onRecheck: () => Promise<void>; onSignOut: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  const [busy, setBusy] = useState(false);
  /*
   * ⚠️ 2026-10-19 (аудит): «Дахин шалгах» нь НЭВТРЭЛТ ДУУССАН үед ч ажиллана. Хэрэглэгч `SessionExpired`-ийг
   *    «Түр хаах»-аар хаасан бол (10 мин чимээгүй) энэ цонх л үлдэж, шалгалт токенгүй тул ҮҮРД унадаг байв.
   *    Одоо: токен үхсэн бол эхлээд сэргээж үзнэ (`retrySession`); бүтэхгүй бол «Дахин нэвтрэх» цонхыг дахин
   *    гаргана (`reopenSessionDead` — `AuthNotice`-д энэ цонхноос ДЭЭР).
   */
  const recheck = async () => {
    if (lastRefreshFail() === 'dead' && !(await retrySession())) { reopenSessionDead(); return; }
    await onRecheck();
    if (lastRefreshFail() === 'dead') reopenSessionDead();
  };
  return (
    <div ref={ref} className={`${s.screen} ${s.screenOver}`} role="alertdialog" aria-modal="true" aria-labelledby="selbe-sys-closed">
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

function AccessLost({ username, onSignOut }: { username?: string; onSignOut: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  return (
    <div ref={ref} className={`${s.screen} ${s.screenOver}`} role="alertdialog" aria-modal="true" aria-labelledby="selbe-access-lost">
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
