'use client';

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { AUTH, roleForUser, type Role } from '@/lib/services';
import { initRemote, hasAccess, roleOf, remoteReady } from '@/lib/permissions';
import { setCurrentUser } from '@/lib/who';
import {
  dismissSessionDead, ensureFreshToken, noteSignOut, registerIdentity, retrySession, sessionDead,
  subscribeSessionDead,
} from '@/lib/authToken';
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
        /* ⚠️ Бүх REST `fetch` энэ бүртгэлээр токеноо авна (`authToken.ts`). */
        registerIdentity(esriId, sharingUrl());

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
        const hard = roleForUser(info.username);
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
        const remoteOk = await initRemote(hard === 'super');
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
          try {
            const { planTableReady } = await import('@/lib/huvaariBatlah');
            await planTableReady(true);
          } catch { /* хүснэгт үүсээгүй — «Хуваарь» хуудас шалтгааныг хэлнэ */ }
          /*
           * ⚠️ ИНЖЕНЕРИЙН ОБЬЁМЫН БАТЛАХ ХҮСНЭГТ — ЯГ ИЖИЛ ШАЛТГААН
           * (2026-09-08-ны 100% аудитаар илэрсэн). Модуль нь `canCreate`
           * параметртэй `obyemTableReady`-г экспортлодог ч түүнийг ХААНААС Ч
           * дуудахгүй байсан тул бүх зам `tableUrl(false)`-ээр явж, хүснэгт
           * ХЭЗЭЭ Ч үүсэхгүй байв: инженер «Обьём батлуулах» дарахад
           * «Батлах хүснэгт олдсонгүй — админд хандана уу» гэж мөнхөд
           * няцаагдана. Хуваарийн хүснэгтийн 2026-09-07-ны сургамжийг
           * давтсан алдаа.
           */
          try {
            const { obyemTableReady } = await import('@/lib/obyemBatlah');
            await obyemTableReady(true);
          } catch { /* хүснэгт үүсээгүй — хуудас шалтгааныг хэлнэ */ }
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
        setPermsRead(remoteOk || !!hard);
        console.info('[selbe] нэвтэрсэн:', info.username, '· orgId:', info.orgId, '· үүрэг:', r ?? '—', '· admitted:', admitted);

        if (!alive) return;
        attemptClear();
        /* ⚠️ lib-түвшний эрхийн шалгуур (`who.requireCap`) энэ нэрийг уншина. */
        setCurrentUser(admitted ? info.username : null);
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
        if (!ok && !rok) return;
        /* ⚠️ lib-түвшний эрхийн шалгуур (`who.requireCap`) ч мөн дагана (2026-09-17):
           урьд нь зөвхөн анхны нэвтрэлтэд бичигдэж, denied→signed-in сэргэлтэд
           `current=null` үлдэж F5 хүртэл бүх бичилт «эрхгүй» гэдэг байв. */
        setCurrentUser(ok ? user.username : null);
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
    const period = () => (status === 'denied' || !remoteReady() ? 15_000 : 5 * 60_000);
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
  }, [status, user?.username]);

  const recheckPerms = async () => { await checkRef.current?.(); };

  const signIn = async () => {
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
    /* ⚠️ 2026-10-05: итгэмжлэл устахыг «сешн дууссан» гэж тэмдэглэхгүй (`authToken.noteSignOut`) */
    noteSignOut();
    esriId.destroyCredentials();
    const back = encodeURIComponent(location.origin + location.pathname);
    /* ⚠️ Энэ бол ArcGIS-ийн ГАДААД гарах хаяг — Next.js-ийн дотоод хуудас БИШ
       тул `router.push` тохирохгүй: бүтэн навигаци ЗААВАЛ хэрэгтэй (ArcGIS
       өөрөө cookie-гоо цэвэрлээд бидэн рүү буцаана). Дүрэм нь дотоод/гадаад
       хаягийг ялгадаггүй тул ЭНД л унтраана — бусад газарт хүчинтэй хэвээр. */
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(
      `${sharingUrl()}/rest/oauth2/signout?client_id=${encodeURIComponent(AUTH.appId)}&redirect_uri=${back}`,
    );
  };

  const authorized = status === 'signed-in' || status === 'off';

  return (
    <Ctx.Provider value={{ status, authorized, user, role, error, permsRead, accessLost, sessionExpired, recheckPerms, signIn, signOut, clearError: () => setError(null) }}>
      {children}
    </Ctx.Provider>
  );
}

/**
 * Нэвтрэлтийн МЭДЭГДЭЛ — эрх татгалзсан (буруу байгууллага) эсвэл нэвтрэлт унасан
 * үед л хөвөгч цонхоор гарна. Бусад үед `null` — нүүр хуудас чөлөөтэй харагдана.
 */
export function AuthNotice() {
  const { status, user, error, permsRead, accessLost, sessionExpired, signIn, signOut, clearError } = useAuth();
  /*
   * ⚠️ 2026-10-05: СЕШН ДУУССАН — Portal доор нь АМЬД (`status` нь `signed-in` хэвээр тул
   *    `Root` юу ч солихгүй). `AccessLost`-ийн ижил хаалтын цонх; дахин нэвтрэх нь хуудсыг
   *    ArcGIS руу чиглүүлдэг (доорх `SessionExpired`-ийн ⚠️) тул хэрэглэгч эхлээд ажлаа
   *    хуулж авах боломжтой.
   */
  if (sessionExpired && status === 'signed-in') return <SessionExpired username={user?.username} onSignOut={signOut} />;
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
    <div className={s.screen}>
      <div className={s.card}>
        <img src="/logo.svg" alt="" className={s.logo} />
        <div className={s.title}>{tr('Сэлбэ портал')}</div>

        {status === 'denied' && (
          <>
            {user && (
              <div className={s.user}>
                {user.thumbnail && (
                  <img src={user.thumbnail} alt="" className={s.avatar} />
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
    </div>
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
 *      · «Түр хаах» — цонхыг хааж хадгалаагүй ажлаа хуулж авах боломж; дараагийн хүсэлт
 *        дахин татгалзагдахад цонх БУЦАЖ гарна. Эрх нэмэгдэхгүй — сервер токеныг аль хэдийн
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
  const reauth = async () => {
    setBusy(true);
    setNote('');
    try {
      const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
      /* Хуучин (үхсэн) итгэмжлэлийг устгана — эс бөгөөс `getCredential` түүнийг буцаагаад чиглүүлэхгүй.
         ⚠️ `noteSignOut` ДУУДАХГҮЙ: тэр нь цонхыг хаадаг — чиглүүлэлт унавал (offline) алдаа
            харагдах газаргүй болно. Цонх чиглүүлэх хүртэл нээлттэй үлдэнэ. */
      esriId.destroyCredentials();
      attemptSet();
      await esriId.getCredential(sharingUrl());
      /* Чиглүүлэлгүй хүрсэн бол (хүчинтэй итгэмжлэл олдсон) шалгалтыг эхнээс нь */
      window.location.reload();
    } catch (e) {
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
