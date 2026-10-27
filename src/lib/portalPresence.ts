'use client';

/**
 * ПОРТАЛД БАЙГАА ЭСЭХ — эрхийн хүснэгтийн аккаунтыг Enterprise порталын бүртгэлтэй ТУЛГАНА (⚠️ 2026-10-22, аудит).
 *
 * ⚠️ ЯАГААД: «устгагдсан» гэдэг нь урьд нь ЗӨВХӨН «эрхийн хүснэгтэд мөргүй» гэсэн утгатай байв (`aclOps.liveErhSource`
 *    · `GuitsetgelAcl.known`). Гэтэл хүснэгтэд мөр нь үлдсэн атлаа ПОРТАЛД БАЙХГҮЙ аккаунт (амьд жишээ: `selbe_redesign` —
 *    AGOL-оос шилжихэд хасагдсан, `services/roles.ts`-ийн 2026-10-20 ⚠️) нэвтэрч чадахгүй хэрнээ «Гүйцэтгэгч компани» шатны
 *    ЦОРЫН ГАНЦ эзэн мэт тоологдож, 21 багцын гацаа (`flowGap`) нь хүснэгт ч, «Тойм»-д ч ХЭЗЭЭ Ч гардаггүй байв.
 * ⚠️ ДҮРЭМ (fail-open):
 *    · админ самбар нээгдэхэд НЭГ удаа (нэр бүрийг сешнд нэг л удаа) `community/users/<нэр>`-ээр нэвтэрсэн админы
 *      токеноор (POST биеэр) лавлана — ЗӨВХӨН УНШИНА;
 *    · «алга» = порталын тодорхой хариу `400 COM_0018 «User does not exist or is inaccessible»` (амьд шалгасан);
 *      сүлжээ · токен · хоосон хариу · бусад алдаа → «мэдэхгүй» (кэшлэхгүй, дараагийн нээлтэд дахин) — ХЭЗЭЭ Ч «алга»
 *      гэж тэмдэглэхгүй;
 *    · «inaccessible» нь энгийн гишүүнд ХААЛТТАЙ ПРОФАЙЛТАЙ хүнийг ч хэлдэг тул нэвтэрсэн хүн бүх гишүүнийг харах эрхтэй
 *      (`org_admin` эсвэл `portal:admin:viewUsers`, `portals/self`) үед л лавлана; эрхгүй бол юу ч тэмдэглэхгүй (`noPrivilege`).
 * ⚠️ БИЧИЛТ БАЙХГҮЙ: энэ нь зөвхөн «гацааны шалгуурт эзэн гэж тоолохгүй» (`ErhSource.gone`) ба «порталд алга» тэмдэг —
 *    хуваарилалт/эрхийг админ өөрөө хасна/шилжүүлнэ. Хүснэгтээс устгагдсаны (`isCleanup`) бичих дүрэм ӨӨРЧЛӨГДӨӨГҮЙ.
 * ⚠️ Нэвтрэлт унтраалттай / токенгүй (Node тест, бот) үед лавлахгүй — шалгуур `_setPortalLookup`-оор хуурамч өгнө.
 */

import { arcgisPost } from './query';
import { authToken } from './authToken';
import { AUTH } from './services';

/** Нэг нэрийн хариу — `unknown` нь кэшлэгдэхгүй */
export type PortalAnswer = 'ok' | 'missing' | 'unknown';
export type PortalLookup = (name: string) => Promise<PortalAnswer>;
/** Нэвтэрсэн хүн порталын бүх гишүүнийг харж чадах уу — `null` = мэдэхгүй (дараа дахин) */
export type PortalViewer = () => Promise<boolean | null>;
/** Шалгалтын төлөв — «Тойм»-ын тайлбарт */
export type PortalCheckStatus = 'idle' | 'running' | 'done' | 'noPrivilege' | 'off';

const norm = (s: string): string => s.trim().toLowerCase();
const base = (): string => AUTH.portalUrl.replace(/\/+$/, '');

/**
 * ⚠️ Хоосон хариу (`{}`) — «байгаа» ч биш, «алга» ч биш: хүчингүй токенд Enterprise ингэж хариулдаг (амьд шалгасан) —
 *    `unknown`. Зөвхөн `400` + «does not exist / inaccessible» нь «алга».
 */
async function lookupLive(name: string): Promise<PortalAnswer> {
  try {
    const j = await arcgisPost(`${base()}/sharing/rest/community/users/${encodeURIComponent(name)}`, {});
    return typeof j?.username === 'string' && j.username ? 'ok' : 'unknown';
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    const msg = e instanceof Error ? e.message : '';
    return code === 400 && /does not exist|inaccessible/i.test(msg) ? 'missing' : 'unknown';
  }
}

async function viewerLive(): Promise<boolean | null> {
  try {
    const j = await arcgisPost(`${base()}/sharing/rest/portals/self`, {});
    const u = (j as { user?: { role?: unknown; privileges?: unknown } } | null)?.user;
    if (!u || typeof u !== 'object') return null;
    const privs = Array.isArray(u.privileges) ? u.privileges : [];
    return u.role === 'org_admin' || privs.includes('portal:admin:viewUsers');
  } catch {
    return null;
  }
}

let lookup: PortalLookup | null = null;
let viewer: PortalViewer | null = null;
/** нэр (жижиг үсгээр) → баталгаатай хариу; `unknown` энд ОРОХГҮЙ */
const known = new Map<string, 'ok' | 'missing'>();
let canSeeAll: boolean | null = null;
let status: PortalCheckStatus = 'idle';
let running: Promise<void> | null = null;
const EVENT = 'selbe-portal-presence';
const emit = (): void => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT)); };

/** Порталд БАЙХГҮЙ гэж БАТАЛГААЖСАН уу (мэдэхгүй бол `false` — fail-open) */
export const portalMissing = (user: string | null | undefined): boolean => !!user && known.get(norm(user)) === 'missing';
/** Порталд алга гэж баталгаажсан бүх нэр (жижиг үсгээр, эрэмбэтэй) */
export const portalMissingList = (): string[] => [...known].filter(([, v]) => v === 'missing').map(([k]) => k).sort();
export const portalCheckStatus = (): PortalCheckStatus => status;
export function subscribePortalPresence(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/** Зэрэг лавлах дээд тоо — `query.ts`-ийн слотоос бага (бусад уншилтыг хаахгүй) */
const PARALLEL = 3;

/**
 * Нэрсийг порталтай тулгана — СЕШНД НЭГ УДАА (баталгаатай хариутай нэрийг дахин асуухгүй). Зэрэг дуудлага нэг ажлыг
 * хуваалцана. Дуудагч хүлээх шаардлагагүй (`void`) — дууссаны дараа `subscribePortalPresence`-ээр мэдэгдэнэ.
 */
export function checkPortalPresence(names: readonly string[]): Promise<void> {
  if (running) return running;
  const look = lookup ?? ((AUTH.appId && authToken()) ? lookupLive : null);
  const see = viewer ?? (lookup ? async () => true : viewerLive);
  if (!look) { status = 'off'; return Promise.resolve(); }
  const todo = [...new Set(names.map(norm).filter(Boolean))].filter((n) => !known.has(n));
  if (!todo.length && canSeeAll !== false) { status = 'done'; return Promise.resolve(); }
  status = 'running';
  emit();
  running = (async () => {
    try {
      if (canSeeAll == null) canSeeAll = await see();
      if (canSeeAll !== true) { status = canSeeAll === false ? 'noPrivilege' : 'idle'; return; }
      let i = 0;
      const worker = async () => {
        while (i < todo.length) {
          const n = todo[i++];
          const r = await look(n).catch((): PortalAnswer => 'unknown');
          if (r !== 'unknown') known.set(n, r);
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
      status = 'done';
    } finally {
      running = null;
      emit();
    }
  })();
  return running;
}

/** Шалгуурт: хуурамч лавлагч (null — амьд руу буцна). Кэшийг цэвэрлэнэ. */
export function _setPortalLookup(fn: PortalLookup | null, see: PortalViewer | null = null): void {
  lookup = fn;
  viewer = see;
  _resetPortalPresence();
}
/** Шалгуурт: кэш ба төлөвийг тэглэнэ */
export function _resetPortalPresence(): void {
  known.clear();
  canSeeAll = null;
  status = 'idle';
  running = null;
  emit();
}
