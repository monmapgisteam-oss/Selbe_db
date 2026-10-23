'use client';

/**
 * ЭРХИЙН ТӨРЛИЙГ ХЭРЭГЛЭГЧИД ХЭРЭГЖҮҮЛЭХ — «Төрлөөр тохируулах» (2026-09-25 · 2026-09-30).
 *
 * Нэг дарахад төрлийн загварын (`roleTypes.roleAccess`) ХАРАХ тохиргоо тухайн
 * хүнд бичигдэнэ: харагдац · ТЭЗҮ-БОНУ · үүрэг (нүүр цонх үүргээсээ гарна).
 *
 * ⚠️ ЗӨВХӨН ХАРАХ (2026-09-30, хэрэглэгчийн шийдвэр). Урьд нь энэ модуль урсгалын
 *    шат · QAQC · таван үүрэгтэй систем · энгийн дөрвөн эрхийг ч загвараар
 *    бичиж/хасдаг байв («төрөл = бүрэн тодорхойлолт»). Одоо засах эрх БҮР админ
 *    порталын ӨӨРИЙН хуудсанд багц/аккаунтаар олгогдоно — энэ модуль хуваарилалт
 *    ба `__cap__:` мөрийг ОГТ хөндөхгүй; багц сонголт (`PkgSel` · `currentPkgs` ·
 *    `pkgsFromName`) хэрэггүй болж устсан. Ингэснээр «Төрлөөр тохируулах» нь
 *    хэн нэгний засах эрхийг чимээгүй тэлж/хумьж чадахгүй.
 * ⚠️ Бичих зам ШИНЭ БИШ — `permissions.setUser` (харагдац/үүргийн мөр).
 * ⚠️ Түгжээ: эрхийн хүснэгт уншигдаагүй бол татгалзана (`remoteReady`) — уншигдаагүй
 *    сешнд `roleOf`/override хүчингүй тул бичвэл бодит мөрийг дарна.
 * ⚠️ 2026-10-21 (хэрэглэгчийн шийдвэр): SUPER = ЭРХИЙН ТОХИРГОО (`roles._setTableSupers`) — Super төрлийг самбараас
 *    зөвхөн SUPER АДМИН олгоно/хасна (мөр бичигдэнэ); өөрийн super-ийг өөрөө хасахгүй. Кодын (тестийн) super л
 *    доошлохгүй, мөр нь бичигдэхгүй (`permissions.setUser`). Урьд (2026-09-25 · 10-19) super зөвхөн кодоор байв.
 */

import { t as tr } from './i18nCore';
import { isCodeSuper, roleForUser, type Role } from './services';
import { listUsers, remoteReady, setUser } from './permissions';
import { currentUser } from './who';
import { roleAccess, typesReady } from './roleTypes';
import { WORKFLOW_VIEWS } from './caps';
import { flowAclReady, stageOfUser } from './guitsetgelAcl';

/* ══════════════════════ Түгжээ · ноорог (2026-09-25) ══════════════════════ */

/**
 * ХЭРЭГЛЭГЧ БҮРИЙН ТҮГЖЭЭ — карт ба бөөнөөр хэрэгжүүлэлт ХУВААЛЦАНА.
 * ⚠️ ЯАГААД: хоёр `applyType` нэг хүнд зэрэг явбал бичилтүүд уралдаж үр дүн
 *    аль ч төрөлтэй таарахгүй.
 */
const userLocks = new Set<string>();
const LOCK_EVENT = 'selbe-roletype-lock';
const emit = (ev: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(ev)); };
export const typeApplyBusy = (user: string): boolean => userLocks.has(user.trim().toLowerCase());
export function subscribeTypeLock(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(LOCK_EVENT, fn);
  return () => window.removeEventListener(LOCK_EVENT, fn);
}

/**
 * «ХЭРЭГЛЭГЧИД» САМБАРЫН ХАДГАЛААГҮЙ НООРОГТОЙ ХЭРЭГЛЭГЧИД — `UserAdmin` бүртгэнэ.
 * ⚠️ Хэрэгжүүлэлт нь эрхийн мөрийг (`setUser`) бичдэг тул ноорогтой хүнд
 *    бичвэл дараагийн «Хадгалах» нь манай бичилтийг ХУУЧИН ноорогоор дарна.
 */
let draftUsers = new Set<string>();
export function setTypeDraftUsers(keys: Iterable<string>): void {
  draftUsers = new Set([...keys].map((k) => k.trim().toLowerCase()));
}

/* ══════════════════════ Хэрэгжүүлэлт ══════════════════════ */

export type ApplyResult = {
  ok: boolean; errors: string[];
  /** ⚠️ 2026-10-23: «Ерөнхий захирал» болгоход хэрэглэгч урсгалын шатанд томилгоотой — дуудагч асууж томилгоог хасаад дахин дуудна */
  flowStage?: string;
};

/**
 * ⚠️ 2026-10-23: «Ерөнхий захирал» (`zahiral`) — урсгалын томилгоотой хүнд ТАТГАЛЗАНА (`flowStage`). Захирал зөвхөн ХАРНА;
 *   томилгоо үлдвэл `grantFlowAccess` төрлийг хадгалсаар шат/хүрээ олгож, бөглөгч/батлагчаар тоологдож, гацааны
 *   анхааруулгыг нуудаг байв. Энэ модуль хуваарилалт БИЧИХГҮЙ (2026-09-30-ны шийдвэр) тул томилгоог дуудагч хасна —
 *   карт (`UserTypeSection`) асууж хасаад дахин дуудна; бөөнөөр хэрэгжүүлэлт алгасаж алдаанд нэрлэнэ.
 */
export async function applyType(user: string, role: Role): Promise<ApplyResult> {
  const u = user.trim().toLowerCase();
  if (!u) return { ok: false, errors: [tr('Аккаунтын нэрээ бичнэ үү')] };
  /* ⚠️ 2026-09-25: синкээс өмнө `tplOf` нь нарийн нөөц — түүнийг тараавал хүний эрх хумигдана */
  if (!typesReady()) return { ok: false, errors: [tr('Эрхийн төрлийн загвар уншигдаагүй — дахин ачаална уу.')] };
  if (!remoteReady()) return { ok: false, errors: [tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.')] };
  /* ⚠️ 2026-09-30: УСТГАГДСАН аккаунтад бичихгүй — `setUser` tombstone-ыг жирийн мөрөөр дарж
     устгагдсан хүн дахин нэвтэрдэг (`guitsetgelAcl.grantFlowAccess`-ийн 2026-09-25 ⚠️). Бөөнөөр
     хэрэгжүүлэлтийн явцад өөр админ устгасан, эсвэл хуучин жагсаалтаас дуудагдсан үед. */
  if (!listUsers().some((x) => x.username.toLowerCase() === u)) {
    return { ok: false, errors: [tr('«{0}» устгагдсан аккаунт — өөрчлөлт хадгалагдсангүй.', u)] };
  }
  /* ⚠️ Кодын (тестийн) super-ийг самбараас доошлуулахгүй — мөр нь бичигдэхгүй тул өөрчлөлт худал болно */
  if (isCodeSuper(u) && role !== 'super') {
    return { ok: false, errors: [tr('Кодонд бүртгэлтэй админыг (super) өөр төрөлд шилжүүлэх боломжгүй.')] };
  }
  /* ⚠️ 2026-10-21: SUPER = эрхийн тохиргоо. Олгох/хасах нь ЗӨВХӨН super админд (нэвтэрсэн хэрэглэгч — `who.currentUser`,
     тодорхойгүй бол ТАТГАЛЗАНА, fail-closed); өөрийн super-ийг өөрөө хасахгүй (сүүлчийн админ түгжигдэхээс сэргийлнэ —
     өөр super хасна). */
  const me = (currentUser() ?? '').trim().toLowerCase();
  const adminSuper = !!me && roleForUser(me) === 'super';
  const wasSuper = roleForUser(u) === 'super';
  if ((role === 'super' || wasSuper) && !adminSuper) {
    return { ok: false, errors: [tr('Super эрхийг зөвхөн super админ олгож, хасна.')] };
  }
  if (wasSuper && role !== 'super' && u === me) {
    return { ok: false, errors: [tr('Өөрийн super эрхийг өөрөө хасах боломжгүй — өөр super админ хасна.')] };
  }
  if (draftUsers.has(u)) {
    return { ok: false, errors: [tr('Хадгалаагүй ноорогтой — эхлээд «Хадгалах» эсвэл «Болих» дарна уу.')] };
  }
  if (userLocks.has(u)) {
    return { ok: false, errors: [tr('Энэ хэрэглэгчид тохируулга явагдаж байна — дуустал хүлээнэ үү.')] };
  }
  /* ⚠️ 2026-10-23: «Ерөнхий захирал» ба урсгалын томилгоо — `opts.dropFlow`-ийн ⚠️ */
  /* Урсгалын томилгоо уншигдаагүй бол «томилгоогүй» гэж дүгнэхгүй (fail-closed) */
  if (role === 'zahiral' && !flowAclReady()) {
    return { ok: false, errors: [tr('Гүйцэтгэлийн урсгалын эрх уншигдаагүй — дахин ачаална уу.')] };
  }
  const flowStage = role === 'zahiral' ? stageOfUser(u) : null;
  if (flowStage) {
    return {
      ok: false,
      errors: [tr('«{0}» гүйцэтгэлийн урсгалд томилгоотой — Ерөнхий захирал зөвхөн харна. Эхлээд урсгалын томилгоог хасна уу.', u)],
      flowStage,
    };
  }
  userLocks.add(u);
  emit(LOCK_EVENT);
  try {
    /* ⚠️ 2026-10-21: Super төрөл ч мөр бичнэ (`views: 'all'` · `role: 'super'`) — хүснэгтийн super (`permissions.setUser`
       кодын super-т л no-op) */
    const acc = roleAccess(role);
    /*
     * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): УРСГАЛТАЙ ХАРАГДАЦ БИЧИГДЭХГҮЙ. Урьд нь
     *    (2026-09-30) хадгалагдсан «Гүйцэтгэл» зэргийг ХЭВЭЭР үлдээдэг байв — тэр үед харагдац нь
     *    хадгалалтаас нээгддэг байсан. Одоо урсгалтай 6 харагдац ЗӨВХӨН хуваарилалтаас
     *    (`permissions.workflowViewsOf`) тул хадгалсан утга нь утгагүй үлдэгдэл — картын
     *    «Хадгалах»-тай (`UserAdmin.saveAll`) ижил цэвэрлэнэ. Загвар өөрөө тэднийг агуулдаггүй
     *    (`roleTypes.TPL_VIEWS`) — давхар шүүлт.
     */
    const views = acc.views === 'all' ? 'all' : acc.views.filter((v) => !WORKFLOW_VIEWS.includes(v));
    /* ⚠️ 2026-10-22 (аудит): урсгалын төрөл («Гүйцэтгэгч компани» … «Газрын дарга») ч ЗӨВХӨН үүрэг/харагдац бичнэ — шат,
       «Гүйцэтгэл» хуудас, батлах эрх ҮҮСЭХГҮЙ (шат = «Гүйцэтгэлийн урсгалын эрх»-ийн томилгоо, багцтай нь — энд багц мэдэгдэхгүй
       тул автоматаар «бүх багц» бичихгүй). Зөрөөг UI ил хэлнэ: карт (`UserCard` · `UserHeadBadges`), «Тойм»
       (`erhOverview.typeStageGaps`), «Хэрэгжүүлэх»-ийн дүн (`ErhTypes`). */
    const ok = await setUser(u, { views, docs: acc.docs }, role);
    return ok ? { ok: true, errors: [] } : { ok: false, errors: [tr('Харагдац: ArcGIS-т хадгалагдсангүй')] };
  } finally {
    userLocks.delete(u);
    emit(LOCK_EVENT);
  }
}

/* ══════════════════════ Бөөнөөр (2026-09-25) ══════════════════════ */

/**
 * «ХЭРЭГЖҮҮЛЭХ» — төрлийн бүх хэрэглэгчид.
 * ⚠️ МОДУЛИЙН ТҮВШНИЙ ТӨЛӨВ: урьд нь `ErhTypes`-ийн React төлөвт байсан тул
 *    таб солиход (unmount) давталт үргэлжилсээр, буцаж ороход «Хэрэгжүүлэх»
 *    дахин нээлттэй — хоёр давталт зэрэг явж болдог байв. Одоо нэг л давталт.
 * ⚠️ «Хэрэглэгчид» самбарт хадгалаагүй ноорогтой хүнийг АЛГАСЧ мэдээлнэ.
 */
export type BulkState = {
  role: Role; total: number; ok: number; errors: string[]; skipped: string[]; running: boolean;
};
let bulk: BulkState | null = null;
const BULK_EVENT = 'selbe-roletype-bulk';
export const bulkStatus = (): BulkState | null => bulk;
export function subscribeBulk(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(BULK_EVENT, fn);
  return () => window.removeEventListener(BULK_EVENT, fn);
}

/** @returns `false` — өөр давталт явагдаж байна */
export async function applyTypeBulk(role: Role, users: string[]): Promise<boolean> {
  if (bulk?.running) return false;
  let st: BulkState = { role, total: users.length, ok: 0, errors: [], skipped: [], running: true };
  const set = (n: BulkState) => { st = n; bulk = n; emit(BULK_EVENT); };
  set(st);
  try {
    for (const raw of users) {
      const u = raw.trim().toLowerCase();
      if (draftUsers.has(u)) { set({ ...st, skipped: [...st.skipped, u] }); continue; }
      const res = await applyType(u, role);
      set(res.ok
        ? { ...st, ok: st.ok + 1 }
        : { ...st, errors: [...st.errors, `${u}: ${res.errors.join('; ')}`] });
    }
  } catch (e) {
    set({ ...st, errors: [...st.errors, String(e)] });
  } finally {
    set({ ...st, running: false });
  }
  return true;
}
