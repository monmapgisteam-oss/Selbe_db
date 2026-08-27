'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН УРСГАЛЫН ЭРХ — ХЭН, АЛЬ ШАТАНД, АЛЬ БАГЦАД.
 *
 * ⚠️ ЭНЭ НЬ `permissions.ts`-ЭЭС ӨӨР АСУУЛТАД хариулна: тэр нь «хэн ямар
 * харагдац үзэх вэ», энэ нь «хэн аль багцын гүйцэтгэлийг бөглөх / хянах вэ».
 * Хоёр нь ТУСДАА хадгалагдана — гэхдээ ХОЛБООТОЙ ажиллана: шатанд томилохдоо
 * `permissions`-д үүрэг ба `guitsetgel` харагдацыг ДАГУУЛЖ өгнө (доорх
 * `grantFlowAccess`), хасахад БУЦААЖ авна (`revokeFlowAccess`).
 *
 * ⚠️ АККАУНТЫН ТООНД ХЯЗГААР БАЙХГҮЙ. Багц бүрд өөр гүйцэтгэгч, өөр инженер
 * байх тул урьдчилан таамагласан дээд тоо нь заавал буруу гарна.
 *
 * ⚠️ ХАДГАЛАЛТ (2026-08-27): ArcGIS-ийн ХУВААЛЦСАН хүснэгтэд (`permsRemote`,
 * `__flow__:` угтвартай мөрүүд) + localStorage (offline cache). Урьд нь ЗӨВХӨН
 * localStorage байсан тул томилогдсон хүний өөрийнх нь төхөөрөмж дээр томилгоо
 * огт харагдахгүй — багцын хязгаарлалт хаана ч биелдэггүй, Ерөнхий менежерийн
 * онцгой эрх (мөр нэмэх г.м.) хэзээ ч асдаггүй байв. Одоо `permissions.initRemote`
 * нэвтрэх үед + 5 мин тутам татаж `_syncRemoteAssigns`-аар энд буулгана.
 */

import { STAGE_ORDER, type Stage } from './hyanalt';
import { ROLE_ACCESS, roleForUser, type Role, type ViewKey } from './services';

/**
 * ШАТ → ПОРТАЛЫН ҮҮРЭГ.
 *
 * ⚠️ Шатанд томилохдоо үүргийг нь БАС өгнө. Эс бөгөөс аккаунт нь урсгалд
 *    жагссан атлаа «Гүйцэтгэлийн хяналт» харагдацыг огт нээж чадахгүй —
 *    админ «томилчихлоо» гэж бодох боловч тэр хүн нэвтрээд юу ч олохгүй.
 */
export const STAGE_ROLE: Record<Stage, Role> = {
  company: 'guitsetgegch',
  engineer: 'injener',
  manager: 'menejer',
  director: 'eronhii',
};

/** Урсгалын дөрвөн үүрэг — «энэ хүний ажил зөвхөн урсгал» гэж таних олонлог */
const FLOW_ROLES = new Set<Role>(Object.values(STAGE_ROLE));

/** «Бүх багц» — тодорхой багц сонгоогүй гэсэн утга */
export const ALL_BAGTS = '*';

/** Нэг томилгоо: нэг аккаунт, нэг шат, багцуудын жагсаалт */
export type Assign = {
  /** ArcGIS-ийн хэрэглэгчийн нэр (ЖИЖИГ үсгээр хадгална) */
  user: string;
  stage: Stage;
  /** Багцын нэрс (`PKG_GROUPS`). `[ALL_BAGTS]` = бүх багц. */
  bagts: string[];
};

const KEY = 'selbe-guitsetgel-acl-v1';
const EVENT = 'selbe-guitsetgel-acl-change';

let cache: Assign[] | null = null;

function load(): Assign[] {
  if (cache) return cache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as Assign[];
    cache = Array.isArray(raw) ? raw : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(list: Assign[]): void {
  cache = list;
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  }
}

const STAGES = new Set<string>(STAGE_ORDER);

/**
 * REMOTE-ООС ИРСЭН томилгоог cache-д буулгана — `permissions.initRemote` дуудна.
 *
 * ⚠️ BOOTSTRAP: remote ХООСОН атлаа энэ browser-т (хуучин localStorage-only
 * хувилбарын) томилгоо байгаа бол, ЗӨВХӨН super admin (`canSeed`) дээр локал
 * жагсаалтыг remote руу түлхэж өгнө — шинэчлэлтийн дараа админы хийсэн
 * тохиргоо алдагдахгүй. Энгийн хэрэглэгчийн хуучирсан localStorage remote-ыг
 * дарж чадахгүй.
 */
export function _syncRemoteAssigns(rows: { user: string; stage: string; bagts: string[] }[], canSeed: boolean): void {
  const valid: Assign[] = rows
    .filter((r) => r.user && STAGES.has(r.stage))
    .map((r) => ({ user: r.user.toLowerCase(), stage: r.stage as Stage, bagts: r.bagts.filter((b) => typeof b === 'string') }));

  if (valid.length === 0 && canSeed) {
    const local = load();
    if (local.length > 0) {
      void (async () => {
        try {
          const m = await import('./permsRemote');
          for (const a of local) await m.flowUpsert(a.user, a.stage, a.bagts);
        } catch { /* дараагийн initRemote дахин оролдоно */ }
      })();
      return; // локал хэвээр — дараагийн таталтаар remote-оос эргэж ирнэ
    }
  }
  save(valid);
}

export const listAssigns = (): Assign[] => load();

/** Нэг шатны томилгоонууд — панелийн багана */
export const assignsOf = (stage: Stage): Assign[] =>
  load().filter((a) => a.stage === stage);

/** Томилгоог remote руу бичих — унавал `false` (панел анхааруулга харуулна) */
async function pushFlow(user: string): Promise<boolean> {
  try {
    const m = await import('./permsRemote');
    const a = load().find((x) => x.user === user);
    return a ? m.flowUpsert(a.user, a.stage, a.bagts) : m.flowRemove(user);
  } catch {
    return false;
  }
}

/**
 * Аккаунт нэмэх/шинэчлэх (шатанд томилох).
 *
 * ⚠️ Нэг аккаунт нэг шатанд ЗӨВХӨН НЭГ мөртэй — багц нь нэг мөрд жагсана.
 *    Хоёр мөр зөвшөөрвөл аль нь үнэн болох нь тодорхойгүй болно.
 *
 * @param grant `false` бол порталын эрхийг (`grantFlowAccess`) ЭНД олгохгүй —
 *   багц солиход эрх аль хэдийн олгогдсон тул дахин бичих нь дэмий.
 * @returns `ok` — локал бичилт; `sync` — remote бичилтийн амлалт (панел
 *   `false` үед «ArcGIS-т хадгалагдсангүй» анхааруулга харуулна).
 */
export function setAssign(
  user: string, stage: Stage, bagts: string[], grant = true,
): { ok: boolean; error?: string; sync?: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  if (!u) return { ok: false, error: 'Аккаунтын нэрээ бичнэ үү' };

  const list = load();
  const exists = list.some((a) => a.stage === stage && a.user === u);
  /*
   * ⚠️ НЭГ АККАУНТ ЗӨВХӨН НЭГ ШАТАНД. Нэг хүн бөглөгч ба хянагч хоёулаа
   *    байвал өөрийнхөө ажлыг өөрөө батлах зам нээгдэж, дөрвөн шатны
   *    хяналт бүхэлдээ утгагүй болно. Тиймээс өмнөх шатнаас нь ХАСНА.
   */
  const cleaned = list.filter((a) => !(a.user === u && a.stage !== stage));
  const next = exists
    ? cleaned.map((a) => (a.stage === stage && a.user === u ? { ...a, bagts } : a))
    : [...cleaned, { user: u, stage, bagts }];
  save(next);

  /*
   * ЭРХИЙГ ДАГУУЛЖ ӨГНӨ — томилгоо нь ажиллах чадвартай байх ёстой.
   * Remote бичилт (`pushFlow`) нь эрх олголттой ЗЭРЭГ явна; хоёулаа өөр
   * мөрөнд бичдэг тул уралдахгүй.
   */
  const sync = pushFlow(u);
  if (grant) void grantFlowAccess(u, stage);
  return { ok: true, sync };
}

/**
 * Томилгоог хасах + олгосон эрхийг БУЦААХ.
 *
 * ⚠️ 2026-08-27: урьд нь зөвхөн жагсаалтаас хасдаг байв — олгогдсон үүрэг ба
 * «Гүйцэтгэлийн хяналт» харагдац нь ҮЛДЭЖ, багцын хязгаарлалт нь арилснаар
 * тэр хүн урсгалаас гарсан атлаа БҮХ багцын хяналтын хуудсыг үзсээр байлаа.
 *
 * @param revoke `false` бол олгосон эрхийг БУЦААХГҮЙ — аккаунт бүхэлдээ
 *   устгагдах гэж байгаа үед (UserAdmin-ы устгах зам) хэрэглэнэ. Эс бөгөөс
 *   энд бичих `clearOverride`/`setUser` нь дараагийн tombstone бичилттэй
 *   УРАЛДАЖ, устгагдсан хэрэглэгчийг remote дээр амилуулж болно.
 */
export function removeAssign(user: string, stage: Stage, revoke = true): { sync: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  save(load().filter((a) => !(a.stage === stage && a.user === u)));
  const sync = (async () => {
    let ok = true;
    try {
      const m = await import('./permsRemote');
      ok = await m.flowRemove(u);
    } catch { ok = false; }
    if (revoke) await revokeFlowAccess(u, stage).catch(() => {});
    return ok;
  })();
  return { sync };
}

/**
 * Урсгалын эрхийг олгоно: үүргийг тавьж, харагдацыг тохируулна.
 *
 * ⚠️ ХАРАГДАЦЫН БОДЛОГО: урсгалын хүн (үүрэггүй эсвэл урсгалын үүрэгтэй) —
 * ЗӨВХӨН `ROLE_ACCESS`-ийн зааснаар (`guitsetgel` л). Урьд нь одоо байгаа
 * харагдац дээр НЭМДЭГ байсан тул «Төлөвлөлт» preset-тэй хүнийг инженер
 * болгоход хуучин харагдацууд нь дагаад үлдэж, үүргийн хил бүдгэрдэг байв.
 * Урсгалын БУС үүрэгтэй (super/beginner/tolovlolt) хүнд харин НЭМЖ өгнө —
 * давхар үүрэгтэй хүний бусад ажлыг хумихгүй.
 *
 * ⚠️ Динамик import — гогцоо болон серверийн зурагдалтад `localStorage`
 *    хөндөхөөс сэргийлнэ.
 */
async function grantFlowAccess(user: string, stage: Stage): Promise<boolean> {
  try {
    const { resolveAccess, roleOf, setUser } = await import('./permissions');
    const role = STAGE_ROLE[stage];
    const curRole = roleOf(user);
    const cur = resolveAccess(user);
    const pureFlow = curRole == null || FLOW_ROLES.has(curRole);
    const views: ViewKey[] | 'all' = pureFlow
      ? ROLE_ACCESS[role].views
      : cur?.views === 'all'
        ? 'all'
        : [...new Set<ViewKey>([...(cur?.views ?? []), 'guitsetgel'])];
    const docs = pureFlow ? ROLE_ACCESS[role].docs : (cur?.docs ?? ROLE_ACCESS[role].docs);
    // Урсгалын бус үүрэгтэй хүний ҮНДСЭН үүргийг нь хадгална (супер хэвээр)
    const keepRole = pureFlow ? role : curRole;
    return setUser(user, { views, docs }, keepRole);
  } catch {
    return false;
  }
}

/**
 * Урсгалын эрхийг БУЦААНА — томилгооноос хасагдсан хүнд.
 * · Хатуу тохиргоотой хэрэглэгч → override-ыг арилгаж СУУРЬ эрх рүү нь буцаана.
 * · Панелаас нэмсэн, зөвхөн урсгалын хүн → `guitsetgel` харагдацыг хасна
 *   (үлдсэн харагдац нь хэвээр — админ хүсвэл панелаас бүрмөсөн устгана).
 */
async function revokeFlowAccess(user: string, stage: Stage): Promise<void> {
  const { resolveAccess, roleOf, setUser, clearOverride } = await import('./permissions');
  if (roleForUser(user)) {
    await clearOverride(user);
    return;
  }
  const cur = resolveAccess(user);
  if (!cur) return;
  const views = cur.views === 'all' ? 'all' : cur.views.filter((v) => v !== 'guitsetgel');
  const curRole = roleOf(user);
  const role = curRole === STAGE_ROLE[stage] ? null : curRole;
  await setUser(user, { views, docs: cur.docs }, role);
}

/** Аккаунт аль шатанд томилогдсон бэ (томилогдоогүй бол `null`) */
export function stageOfUser(user?: string | null): Stage | null {
  if (!user) return null;
  const a = load().find((x) => x.user === user.toLowerCase());
  return a?.stage ?? null;
}

/**
 * Тухайн хэрэглэгч энэ шатанд АЛЬ БАГЦУУДЫГ хариуцах вэ.
 *
 * `null` = хязгаарлалт байхгүй (томилгоо огт хийгээгүй, эсвэл «бүх багц»).
 * ⚠️ Томилгоогүй үед ХООСОН массив буцаавал систем шинээр асахад хэн ч юу ч
 *    харахгүй болж, тохируулах хүн өөрөө орж чадахгүй болно.
 */
export function bagtsFor(user: string | null | undefined, stage: Stage): string[] | null {
  if (!user) return null;
  const a = load().find((x) => x.stage === stage && x.user === user.toLowerCase());
  if (!a) return null;
  if (a.bagts.includes(ALL_BAGTS) || a.bagts.length === 0) return null;
  return a.bagts;
}

/** Өөрчлөлтөд захиалах — цэвэрлэх функц буцаана */
export function subscribeAcl(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) { cache = null; fn(); }
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}
