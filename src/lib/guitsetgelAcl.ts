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
 * ⚠️ ШАТЫН ГАНЦ ЭХ СУРВАЛЖ = ТОМИЛГОО (2026-08-29, `resolveFlowStage`).
 * Урьд нь «Гүйцэтгэлийн хяналт» хуудас шатыг ҮҮРГЭЭС (`ROLE_STAGE[role]`)
 * гаргадаг байв. Харин томилохдоо урсгалын бус үүрэгтэй (beginner/tolovlolt —
 * панелаас нэмсэн аккаунт бүр `tolovlolt`) хүний үүргийг САНААТАЙ хэвээр
 * үлдээдэг тул `selbe_et`-ийг «Гүйцэтгэгч компани · бүх багц» гэж томилсон ч
 * хуудас нь «Хяналтын инженер» шат руу унаж, «нэг ч багц хуваарилагдаагүй»
 * гэдэг байлаа. Одоо үүрэг нь ЗӨВХӨН хатуу super-ийг ялгана; шат ба багц нь
 * томилгооноос гарна.
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
 *
 * ⚠️ НЭГ ХЭРЭГЛЭГЧИЙН БИЧИЛТҮҮД ДАРААЛНА (2026-08-29, `enqueue`): хасаад шууд
 * дахин нэмэхэд хойшилсон `revokeFlowAccess` нь шинэ `grantFlowAccess`-ийн
 * ДАРАА буулгаж, томилогдсон хүнийг харагдацгүй/үүрэггүй орхидог байв. Одоо
 * нэг аккаунтын remove→revoke→add→grant яг энэ дарааллаар явна.
 */

import { STAGE_ORDER, type Stage } from './hyanalt';
import {
  ROLE_ACCESS, ROLE_STAGE, STAGE_ROLE, roleForUser, type Role, type ViewKey,
} from './services';

/**
 * ⚠️ ШАТ → ҮҮРЭГ хүснэгт нь `services.ts`-д (`STAGE_ROLE`) — урьд нь энд давхар
 *    бичигдэж, `ROLE_STAGE`-тэй гараар урвуулж хөтөлдөг байв (зөрвөл «томилогдсон
 *    атлаа зөвхөн харах» чимээгүй алдаа). Шатанд томилохдоо үүргийг нь БАС өгнө —
 *    эс бөгөөс аккаунт нь урсгалд жагссан атлаа «Гүйцэтгэлийн хяналт» харагдацыг
 *    огт нээж чадахгүй.
 */

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
  /**
   * ХӨНДЛӨНГИЙН ХЯНАЛТ — ХАРНА, ШИЙДВЭРЛЭХГҮЙ (2026-09-09).
   *
   * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ: аудитор, захиалагчийн төлөөлөгч, зөвлөх инженер
   *    зэрэг хүн гүйцэтгэлийн явцыг ХАРАХ ёстой ч батлах/буцаах эрхгүй.
   *    Урьд нь хоёрхон сонголт байсан бөгөөд хоёулаа буруу:
   *      · томилвол   → шийдвэрлэх эрхтэй болно
   *      · томилохгүй → `bagtsFor` нь `[]` өгч жагсаалт ХООСОН болно
   *    Дундах зам байгаагүй.
   *
   * ⚠️ ЯАГААД ЭНД, «Хэрэглэгчдийн эрх удирдах»-д БИШ: тэнд БАГЦ гэсэн
   *    ойлголт ОГТ байхгүй (зөвхөн харагдац + 11 эрх). Тэнд хийвэл багцын
   *    хүрээг ХОЁР ДАХЬ удаа зохиох шаардлагатай болж, яг тэр давхардлаас
   *    2026-09-08 · 09-нд 9 алдаа гарсан хэв шинж давтагдана.
   *
   * ⚠️ ШИНЭ ШАТ БИШ: шат нь ЯМАР нүдээр харахыг (миний ажил ↔ бусад)
   *    тодорхойлдог тул харагч ч мөн шаттай байх ёстой. Зөвхөн ШИЙДВЭР
   *    хаагдана (`resolveFlowStage` → `canReview: false`).
   *
   * ⚠️ FAIL-CLOSED: `undefined` = хуучин мөр = ЖИРИЙН томилгоо (шийдвэрлэнэ).
   *    Энэ туг нь эрхийг ХАСДАГ болохоос НЭМДЭГГҮЙ тул хуучин мөр аюулгүй.
   */
  viewOnly?: boolean;
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

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function save(list: Assign[]): void {
  cache = list;
  /*
   * ⚠️ `localStorage` БҮТЭЛГҮЙТЭЖ БОЛНО (2026-09-07-ны 100% аудит):
   * хувийн горим, квот дүүрэх, сайтын өгөгдөл хаасан тохиргоо — гурвуулаа
   * ШИДДЭГ. Хамгаалалтгүй бол `save` шидэж, дуудагч (`setAssign` г.м.)
   * унаж, админы панел эвдэрнэ; бүр муу нь `notify()` хүрэхгүй тул
   * захиалагчид ХУУЧИН эрхээ хараад үлдэнэ.
   * ⚠️ Санах ойн `cache` нь дээр аль хэдийн шинэчлэгдсэн бөгөөд алсын
   * бичилт тусдаа явдаг тул локал хадгалалт унасан ч ажиллагаа
   * ҮРГЭЛЖИЛНЭ — зөвхөн хуудас дахин ачаалахад кэш хоосон эхэлнэ.
   * `caps.ts`-ийн `save`-ийн ижил загвар.
   */
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch { /* хувийн горим / квот дүүрсэн — санах ойд хэвээр ажиллана */ }
  }
  notify();
}

const STAGES = new Set<string>(STAGE_ORDER);

/**
 * REMOTE-ООС ИРСЭН томилгоог cache-д буулгана — `permissions.initRemote` дуудна.
 *
 * ⚠️ REMOTE = ЭЦСИЙН ҮНЭН. 2026-08-27-ны «bootstrap seed» (remote хоосон бол
 * super-ийн localStorage-оос түлхэх) салаа 2026-08-29-нд ХАСАГДСАН: шилжилт
 * дууссан (хүснэгтэд `__flow__:` мөрүүд бий), харин тэр салаа нь долоон
 * super-ийн АЛЬ Ч хуучирсан browser-оос устгагдсан томилгоог амилуулж, мөн
 * `canSeed` утгаасаа хамаарч нэг сешнд хоёр өөр үр дүн өгдөг байв.
 *
 * ⚠️ НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР: давхар мөр ирвэл СҮҮЛИЙНХ (их OBJECTID) ялна —
 * `permsRemote.upsertByKey`-ийн бичилтийн дүрэмтэй ижил (урьд нь эхнийх нь
 * уншигдаж, бичилттэй зөрдөг байв).
 */
export function _syncRemoteAssigns(
  rows: { user: string; stage: string; bagts: string[]; viewOnly?: boolean }[],
): void {
  const byUser = new Map<string, Assign>();
  for (const r of rows) {
    if (!r.user || !STAGES.has(r.stage)) continue;
    /* ⚠️ trim() (2026-09-08): remote мөрийн username-д санамсаргүй хоосон зай
       орвол түлхүүр нь бичилтийн талын (set*Assign нь trim().toLowerCase()
       хийдэг) түлхүүртэй ТААРАХГҮЙ болж, хуваарилалт «алга болдог» байв. */
    const user = r.user.trim().toLowerCase();
    byUser.set(user, {
      user,
      stage: r.stage as Stage,
      bagts: (Array.isArray(r.bagts) ? r.bagts : []).filter((b) => typeof b === 'string'),
      /* ⚠️ ЗӨВХӨН ЯГ `true` — «1», «yes» гэх мэт утга эрх ХАСАХГҮЙ. Тугийн
         утга нь эргэлзээтэй бол ЖИРИЙН томилгоо гэж үзнэ (хуучин мөр). */
      ...(r.viewOnly === true ? { viewOnly: true as const } : {}),
    });
  }
  save([...byUser.values()]);
}

export const listAssigns = (): Assign[] => load();

/** Нэг шатны томилгоонууд — панелийн багана */
export const assignsOf = (stage: Stage): Assign[] =>
  load().filter((a) => a.stage === stage);

/* ══════════════ Remote бичилтийн дараалал ба үр дүн ══════════════ */

/**
 * ArcGIS бичилт нь СҮҮЛД унасан хэрэглэгчид (энэ сешн). Панел мөр бүрд тэмдэг
 * тавина — урьд нь баганад нэг boolean байсан тул өөр мөрийн дараагийн амжилт
 * өмнөх мөрийн алдааг чимээгүй арчдаг байв.
 * ⚠️ Урсгалын мөрд `permissions`-ийн адил dirty-set/retry ХАРААХАН байхгүй —
 *    унасан бичилт дараагийн `initRemote`-оор remote-оор дарагдана. Тэмдэг нь
 *    ядаж админд «дахин хий» гэж хэлнэ.
 */
const failed = new Set<string>();

function markResult(u: string, ok: boolean): void {
  const before = failed.has(u);
  if (ok) failed.delete(u); else failed.add(u);
  if (before !== failed.has(u)) notify();
}

/** Remote бичилт нь унасан хэрэглэгчид — панелийн тэмдэг */
export const flowFailedUsers = (): string[] => [...failed];

/** Нэг хэрэглэгчийн remote үйлдлүүд ДАРААЛНА — remove/add/chip уралдахгүй */
const chain = new Map<string, Promise<unknown>>();

function enqueue<T>(u: string, fn: () => Promise<T>): Promise<T> {
  const prev = chain.get(u) ?? Promise.resolve();
  const p = prev.then(fn, fn);
  const tail = p.then(() => undefined, () => undefined);
  chain.set(u, tail);
  void tail.then(() => { if (chain.get(u) === tail) chain.delete(u); });
  return p;
}

/**
 * Томилгоог remote руу бичих — унавал `false` (панел анхааруулга харуулна).
 * ⚠️ Жагсаалтыг ГҮЙЦЭТГЭХ агшиндаа уншина: дараалалд хүлээж байх хооронд хэрэглэгч
 *    хасагдсан/дахин нэмэгдсэн бол сүүлийн байдал нь бичигдэнэ.
 */
async function pushFlow(user: string): Promise<boolean> {
  try {
    const m = await import('./permsRemote');
    const a = load().find((x) => x.user === user);
    return a ? m.flowUpsert(a.user, a.stage, a.bagts, a.viewOnly === true) : m.flowRemove(user);
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
 * ⚠️ Хатуу super-ийг ТОМИЛОХГҮЙ: түүнд шат/багцын хязгаар хэзээ ч үйлчилдэггүй
 *    (`resolveFlowStage`) тул томилгоо нь худал хязгаар харуулаад л дуусна.
 *
 * @param grant `false` бол порталын эрхийг (`grantFlowAccess`) ЭНД олгохгүй —
 *   багц солиход эрх аль хэдийн олгогдсон тул дахин бичих нь дэмий.
 * @returns `ok` — локал бичилт; `sync` — remote томилгооны амлалт (панел
 *   `false` үед «ArcGIS-т хадгалагдсангүй» анхааруулга харуулна); `granted` —
 *   эрх олголтын амлалт (тестэд хүлээнэ).
 */
export function setAssign(
  user: string, stage: Stage, bagts: string[], grant = true,
): { ok: boolean; error?: string; sync?: Promise<boolean>; granted?: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  if (!u) return { ok: false, error: 'Аккаунтын нэрээ бичнэ үү' };
  if (roleForUser(u) === 'super') {
    return { ok: false, error: 'Админ (super) томилгооноос үл хамаарна — бүх шат, бүх багц нээлттэй' };
  }
  if (!bagts.length) return { ok: false, error: 'Багц сонгоно уу' };

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
   * Remote бичилт (`pushFlow`) ба эрх олголт нэг хэрэглэгчийн дараалалд
   * (`enqueue`) явна — өмнөх хасалтын revoke-той уралдахгүй.
   */
  const run = enqueue(u, async () => {
    const ok = await pushFlow(u);
    const g = grant ? await grantFlowAccess(u, stage) : true;
    return { ok, g };
  });
  /*
   * ⚠️ ЭРХ ОЛГОЛТЫН ҮР ДҮНГ ЗАЛГИХГҮЙ (2026-09-08). Бусад гурван ACL модульд
   *    (`qaqc` · `huvaari` · `obyem`) энэ засвар орсон ч ЭНЭ модульд орхигдсон
   *    байв — гэтэл урсгал нь хамгийн чухал нь. Урьд нь `markResult(u, r.ok)`
   *    байсан тул: томилгооны мөр бичигдээд `grantFlowAccess` (харагдац олгох)
   *    УНАВАЛ админд «амжилттай» гэж ХУДАЛ харагдана. Хэрэглэгч томилогдсон ч
   *    «Гүйцэтгэл» харагдацгүй тул шатандаа ОГТ орж чадахгүй, панел дээр ямар ч
   *    дохио байхгүй.
   */
  const sync = run.then((r) => { markResult(u, r.ok && r.g); return r.ok && r.g; });
  const granted = run.then((r) => r.g);
  return { ok: true, sync, granted };
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
  const sync = enqueue(u, async () => {
    // Жагсаалтад байхгүй → flowRemove; хооронд нь дахин нэмэгдсэн бол upsert
    const ok = await pushFlow(u);
    /*
     * ⚠️ ДАРААЛАЛД ХҮЛЭЭХ ХООРОНД ДАХИН ТОМИЛОГДСОН БОЛ ЭРХИЙГ БУЦААХГҮЙ
     *    (2026-09-08-ны аудит).
     *
     *    `enqueue` нь ЗӨВХӨН энэ хөтчийн дуудлагуудыг цувуулдаг. Гэтэл шатын
     *    өөрчлөлт АЛСААС ч ирдэг: өөр админ, эсвэл `permissions.initRemote`
     *    → `_syncRemoteAssigns` (нэвтрэх үед + 5 мин тутам + visibilitychange).
     *    Тэр үед `stage` нь ЗАХИАЛСАН агшных хэвээр хөлдсөн байх тул шинэ
     *    томилгоотой болсон хүний `role`-ыг `null` болгож, `guitsetgel`
     *    харагдацыг хасдаг байв — хүн `manager` шатанд ЖИНХЭНЭ томилогдсон
     *    (`resolveFlowStage.canReview = true`) атлаа хуудсаа огт нээж чаддаггүй,
     *    панел дээр «томилогдсон» гэж харагдсаар байдаг тул админ шалтгааныг
     *    олохгүй.
     *
     *    Шийдэл: `pushFlow`-тэй ИЖИЛ дүрэм — гүйцэтгэх агшиндаа жагсаалтыг
     *    ДАХИН уншина. Хэрэглэгч ямар нэг шатанд байвал (өөр шат ч бай)
     *    түүний эрхийг нь тэр томилгоо хариуцна, энд буцааж авахгүй.
     */
    /*
     * ⚠️ ЭРХ БУЦААЛТЫН ҮР ДҮНГ ЗАЛГИХГҮЙ (2026-09-08-ны хоёр дахь шалгалт).
     *    Урьд нь `.catch(() => {})` гэж алдааг чимээгүй иддэг байв: `__flow__:`
     *    мөр устсан ч харагдацын буцаалт (`revokeFlowAccess` → `setUser`)
     *    ArcGIS-д унавал админд «амжилттай» гэж ХУДАЛ харагдана. Тэр хүн
     *    томилгоогүй атлаа «Гүйцэтгэл» харагдацаа хадгалж үлдэнэ — `qaqc`,
     *    `huvaari`, `obyem` гуравт 2026-09-08-нд зассан ЯГ ИЖИЛ алдаа.
     */
    const g = revoke && !stageOfUser(u) ? await revokeFlowAccess(u, stage).catch(() => false) : true;
    markResult(u, ok && g);
    return ok && g;
  });
  return { sync };
}

/**
 * Аккаунтын томилгоог БҮХ шатнаас (локал + remote) арилгана — эрх буцаахгүй.
 * ⚠️ UserAdmin-ы «Устгах»/«Сэргээх» зам: локалд томилгоо байхгүй байсан ч remote
 *    дээрх өнчин `__flow__:` мөрийг устгана — эс бөгөөс аккаунтыг сэргээх/дахин
 *    нэмэхэд хуучин шат, багц нь өөрөө буцаж наалддаг байв.
 */
export function purgeAssign(user: string): Promise<boolean> {
  const u = user.trim().toLowerCase();
  if (!u) return Promise.resolve(true);
  save(load().filter((a) => a.user !== u));
  return enqueue(u, async () => {
    const ok = await pushFlow(u);
    markResult(u, ok);
    return ok;
  });
}

/**
 * ХӨНДЛӨНГИЙН ХЯНАЛТЫН тугийг асаах / унтраах (2026-09-09).
 *
 * ⚠️ ЗӨВХӨН ТОМИЛОГДСОН хүнд утгатай: тэр нь ШИЙДВЭРЛЭХ эрхийг хасдаг
 *    болохоос багц ЭСВЭЛ шатыг өгдөггүй. Томилгоогүй хүнд дуудвал
 *    `{ ok: false }` — эс бөгөөс «харагч» гэж тэмдэглэсэн атлаа жагсаалт нь
 *    хоосон хэвээр байх утгагүй төлөв үүснэ.
 *
 * ⚠️ ЭРХ ХӨНДӨХГҮЙ: `guitsetgel` харагдац нь томилгооноос аль хэдийн
 *    олгогдсон (`grantFlowAccess`) бөгөөд харагч ч мөн ХАРАХ ёстой тул
 *    түүнийг хасах шаардлагагүй.
 */
export function setViewOnly(
  user: string, viewOnly: boolean,
): { ok: boolean; error?: string; sync?: Promise<boolean> } {
  const u = user.trim().toLowerCase();
  if (!u) return { ok: false, error: 'Аккаунтын нэрээ бичнэ үү' };
  const list = load();
  const cur = list.find((a) => a.user === u);
  if (!cur) {
    return { ok: false, error: 'Эхлээд шатанд томилно уу — хөндлөнгийн хяналт нь томилгоон дээр тавигдана' };
  }
  save(list.map((a) => (a.user === u
    ? (viewOnly ? { ...a, viewOnly: true } : { user: a.user, stage: a.stage, bagts: a.bagts })
    : a)));
  const sync = enqueue(u, async () => {
    const ok = await pushFlow(u);
    markResult(u, ok);
    return ok;
  });
  return { ok: true, sync };
}

const viewsEqual = (a: ViewKey[] | 'all', b: ViewKey[] | 'all'): boolean =>
  a === 'all' || b === 'all' ? a === b : a.length === b.length && a.every((v) => b.includes(v));

/**
 * Урсгалын эрхийг олгоно: үүргийг тавьж, харагдацыг тохируулна.
 *
 * ⚠️ ХАРАГДАЦЫН БОДЛОГО: урсгалын хүн (үүрэггүй эсвэл урсгалын үүрэгтэй) —
 * ЗӨВХӨН `ROLE_ACCESS`-ийн зааснаар (`guitsetgel` л). Урьд нь одоо байгаа
 * харагдац дээр НЭМДЭГ байсан тул «Төлөвлөлт» preset-тэй хүнийг инженер
 * болгоход хуучин харагдацууд нь дагаад үлдэж, үүргийн хил бүдгэрдэг байв.
 * Урсгалын БУС үүрэгтэй (super/beginner/tolovlolt — панелаас нэмсэн аккаунт
 * бүр `tolovlolt`) хүнд харин `guitsetgel`-ийг НЭМЖ өгөөд ҮҮРГИЙГ НЬ ХЭВЭЭР
 * үлдээнэ — давхар үүрэгтэй хүний бусад ажлыг хумихгүй. Шат нь үүргээс биш
 * томилгооноос гардаг (`resolveFlowStage`) тул үүрэг хэвээр байх нь саадгүй.
 *
 * ⚠️ `resolveBaseAccess` — cap-аар нэмэгдсэн харагдацыг (finance/huvaari…)
 *    override мөрөнд БИЧИХГҮЙ; эс бөгөөс эрхийг нь хасахад харагдац үлдэнэ.
 *
 * ⚠️ Динамик import — гогцоо болон серверийн зурагдалтад `localStorage`
 *    хөндөхөөс сэргийлнэ.
 */
async function grantFlowAccess(user: string, stage: Stage): Promise<boolean> {
  try {
    const { resolveBaseAccess, roleOf, setUser } = await import('./permissions');
    const role = STAGE_ROLE[stage];
    const curRole = roleOf(user);
    const cur = resolveBaseAccess(user);
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
 * · Устгагдсан (tombstone) аккаунт → ЮУ Ч ХИЙХГҮЙ.
 * · Хатуу УРСГАЛЫН үүрэгтэй хэрэглэгч → override-ыг арилгаж СУУРЬ эрх рүү нь буцаана.
 * · Хатуу урсгалын БУС үүрэгтэй (super/beginner/tolovlolt) → grant-тай тэгш хэмтэй:
 *   зөвхөн олгосныг (`guitsetgel`, суурьд нь байхгүй бол) хасна; админы бусад
 *   тохиргоо (нэмэлт харагдац, баримт) хэвээр. Үр дүн суурьтай ижил бол override
 *   хэрэггүй тул арилгана.
 * · Панелаас нэмсэн, зөвхөн урсгалын хүн → `guitsetgel` харагдацыг хасна
 *   (үлдсэн харагдац нь хэвээр — админ хүсвэл панелаас бүрмөсөн устгана).
 */
/**
 * ⚠️ ҮР ДҮНГЭЭ БУЦААНА (2026-09-08-ны хоёр дахь шалгалт). Урьд нь
 * `Promise<void>` байсан тул бүх салаа `setUser`/`clearOverride`-ийн
 * амжилтыг ХАЯДАГ байв — дуудагч тал (`removeAssign`) «эрх буцаагдсан»
 * гэж үзэж админд амжилттай гэж мэдээлнэ, гэтэл ArcGIS дээр харагдац нь
 * ҮЛДСЭН байж болно. `qaqc`/`huvaari`/`obyem`-ийн `syncCaps` нь үр дүнгээ
 * буцаадаг — энэ модуль тэдэнтэй тэнцэв.
 */
async function revokeFlowAccess(user: string, stage: Stage): Promise<boolean> {
  const { resolveBaseAccess, roleOf, setUser, clearOverride } = await import('./permissions');
  const cur = resolveBaseAccess(user);
  /*
   * ⚠️ TOMBSTONE (2026-08-29): устгагдсан аккаунтад `null` ирнэ — ЮУ Ч ХИЙХГҮЙ.
   * Урьд нь хатуу тохиргооны устгагдсан хүний хуучирсан томилгоог ✕-ээр хасахад
   * `clearOverride` tombstone-ыг нь арчиж, тэр хүн дахин нэвтэрдэг байв.
   */
  if (!cur) return true;
  const base = roleForUser(user);
  if (base && FLOW_ROLES.has(base)) {
    return await clearOverride(user);
  }
  const curRole = roleOf(user);
  const baseViews = base ? ROLE_ACCESS[base].views : null;
  const keepGuits = baseViews === 'all' || (Array.isArray(baseViews) && baseViews.includes('guitsetgel'));
  const views = cur.views === 'all' || keepGuits ? cur.views : cur.views.filter((v) => v !== 'guitsetgel');
  const role = curRole === STAGE_ROLE[stage] ? null : curRole;
  if (base) {
    const b = ROLE_ACCESS[base];
    if (role === base && cur.docs === b.docs && viewsEqual(views, b.views)) {
      return await clearOverride(user);
    }
  }
  return await setUser(user, { views, docs: cur.docs }, role);
}

/**
 * «Сэргээх»-ийн ДАРАА томилгоотой хүний урсгалын эрхийг дахин олгоно (UserAdmin).
 * ⚠️ Хатуу `tolovlolt` хэрэглэгчийн суурьд `guitsetgel` байхгүй тул `clearOverride`
 *    түүнийг хуудасгүй орхидог байв; томилгоо нь хэвээр тул эрхийг нь дагуулна.
 */
export function regrantFlowAccess(user: string): Promise<boolean> {
  const u = user.trim().toLowerCase();
  const st = stageOfUser(u);
  return st ? grantFlowAccess(u, st) : Promise.resolve(true);
}

/** Аккаунт аль шатанд томилогдсон бэ (томилогдоогүй бол `null`) */
export function stageOfUser(user?: string | null): Stage | null {
  if (!user) return null;
  const a = load().find((x) => x.user === user.trim().toLowerCase());
  return a?.stage ?? null;
}

/**
 * ХӨНДЛӨНГИЙН ХЯНАЛТ уу — ХАРНА, ШИЙДВЭРЛЭХГҮЙ (2026-09-09).
 *
 * ⚠️ FAIL-CLOSED БИШ, FAIL-SAFE: `undefined` (хуучин мөр) нь `false` буюу
 *    ЖИРИЙН томилгоо. Энэ туг нь эрхийг ХАСДАГ болохоос НЭМДЭГГҮЙ тул
 *    анхдагчаар унтраалттай байх нь эрх чөлөөлөхгүй — томилогдсон хүн
 *    урьдын адил шийдвэрлэсээр байна.
 */
export function isViewOnly(user?: string | null): boolean {
  if (!user) return false;
  return load().find((x) => x.user === user.trim().toLowerCase())?.viewOnly === true;
}

/**
 * Тухайн ШАТАНД хэрэглэгчийн харах/бөглөх БАГЦУУД.
 *
 * Буцаах утга:
 *   · `null`   — ХЯЗГААРГҮЙ. Зөвхөн `ALL_BAGTS` («Бүх багц») ил томилсон үед.
 *   · `[]`     — ТОМИЛОГДООГҮЙ, эсвэл багц заагаагүй. Юу ч харахгүй.
 *   · `[...]`  — заасан багцууд.
 *
 * ⚠️ 2026-08-28 FAIL-CLOSED БОЛГОВ. Урьд нь томилогдоогүй хүнд `null`
 * (хязгааргүй) буцаадаг байв — «шинэ систем дээр хэн ч юу ч харахгүй бол
 * тохируулагч өөрөө орж чадахгүй» гэсэн үндэслэлээр. Үр дүнд нь ХЯНАХ ЭРХ нь
 * ҮҮРГЭЭС гардаг тул нэг ч багц хуваарилагдаагүй `injener` БҮХ багцын
 * гүйцэтгэлийг хараад зөвшөөрч чаддаг байлаа. Одоо томилгоо нь ЗААВАЛ.
 *
 * ⚠️ 2026-08-29: ХООСОН `bagts` ч fail-closed (`[]`). Урьд нь `[]`-г «бүх багц»
 * гэж уншдаг байсан тул хүснэгт дээр гараар засагдсан/эвдэрсэн мөр (`bagts`
 * массив биш → `fetchAll` `[]` болгодог) бүх багцыг нээдэг байв. Панел хоосон
 * сонголтыг `[ALL_BAGTS]` болгож бичдэг тул UI-д өөрчлөлтгүй.
 *
 * ⚠️ Админ (`super`) нь энэ функцээр биш, дуудагч талд үл хамаарна — тиймээс
 * систем шинээр асахад тохируулагч түгжигдэхгүй.
 */
export function bagtsFor(user: string | null | undefined, stage: Stage): string[] | null {
  if (!user) return [];
  const a = load().find((x) => x.stage === stage && x.user === user.toLowerCase());
  if (!a) return [];
  if (a.bagts.includes(ALL_BAGTS)) return null;
  return a.bagts;
}

/**
 * БҮХ ШАТ дундах нэгдсэн багцын хамрах хүрээ.
 *
 * ⚠️ «Гүйцэтгэл бөглөх» хуудсанд хэрэгтэй: тэнд хүн `company` шатны
 * гүйцэтгэгч байж болно, эсвэл «Мөр нэмэх»/«QAQC» эрхээр орсон өөр шатны
 * ажилтан байж болно. Ганц шатаар шүүвэл сүүлийнх нь хоосон жагсаалт хараад
 * шинэ эрх нь утгагүй болно.
 */
export function bagtsScope(user: string | null | undefined): string[] | null {
  if (!user) return [];
  const out = new Set<string>();
  for (const st of STAGE_ORDER) {
    const b = bagtsFor(user, st);
    if (b === null) return null; // аль нэг шатанд «бүх багц» — хязгааргүй
    b.forEach((x) => out.add(x));
  }
  return [...out];
}

/** «Гүйцэтгэлийн хяналт» хуудасны шийдвэр — хэн, аль шатанд, аль багцад */
export type FlowStage = {
  /** Идэвхтэй шат (`null` = томилогдоогүй, урсгалын үүрэггүй) */
  stage: Stage | null;
  /** Зөвшөөрөх/буцаах эрхтэй юу */
  canReview: boolean;
  /** Шатыг гараар солих сонгогч нээлттэй юу (зөвхөн админ / дев) */
  canPick: boolean;
  /** Багцын хүрээ: `null` = хязгааргүй, `[]` = нэг ч багц */
  scope: string[] | null;
};

/**
 * ХЭРЭГЛЭГЧИЙН УРСГАЛЫН ШАТ — ГАНЦ ЭХ СУРВАЛЖ (2026-08-29).
 *
 * Дүрэм:
 *   1. Хатуу тохиргооны `super` (кодын `ROLE_BY_USER`) эсвэл нэвтрэлт
 *      унтраалттай дев орчин → сонгогчоор дурын шат, БҮХ багц. Панелаас
 *      «Супер» preset авсан override-super энд ОРОХГҮЙ: тэр нь зөвхөн
 *      харагдацын багц; хянах эрх нь томилгооноос л гарна (урьд нь panel-ийн
 *      «Супер» дөрвөн шатанд дурын багц батлах зам нээдэг байв).
 *   2. Томилогдсон → тэр шат, тэр багцууд. Үүрэг нь юу ч байсан (beginner,
 *      tolovlolt, урсгалын үүрэг) — томилгоо ДАВАМГАЙЛНА.
 *   3. Томилогдоогүй → зөвхөн харна (fail-closed): урсгалын үүрэгтэй бол
 *      үүргийнхээ шатыг харуулна (толгойн нэр), багц `[]`.
 *
 * ⚠️ Цэвэр функц — React-ээс гадуур тестлэгдэнэ (`guitsetgelAcl.check.mjs`).
 *    Дуудагч нь `subscribeAcl`-аар дахин зурж, томилгоо дараа ирэхэд шинэчилнэ.
 */
export function resolveFlowStage(
  user: string | null | undefined,
  role: Role | null,
  picked?: Stage | null,
  authOff = false,
): FlowStage {
  if (authOff || roleForUser(user) === 'super') {
    return { stage: picked ?? 'engineer', canReview: true, canPick: true, scope: null };
  }
  const st = stageOfUser(user);
  if (st) {
    /*
     * ⚠️ ХӨНДЛӨНГИЙН ХЯНАЛТ (2026-09-09): томилогдсон ч `viewOnly` тугтай бол
     *    ХАРНА, ШИЙДВЭРЛЭХГҮЙ. Багцын хүрээ нь ХЭВЭЭР үйлчилнэ — «Багц 1, 2-ыг
     *    хянана» гэсэн аудитор яг тэр хоёрыг л харна.
     * ⚠️ Шат нь ХЭВЭЭР: тэр нь ЯМАР нүдээр харахыг (миний ажил ↔ бусад)
     *    тодорхойлдог тул харагчид ч хэрэгтэй. Зөвхөн `canReview` хаагдана.
     */
    const viewOnly = isViewOnly(user);
    return {
      stage: st,
      canReview: !viewOnly,
      canPick: false,
      scope: bagtsFor(user, st),
    };
  }
  const byRole = role ? ROLE_STAGE[role] ?? null : null;
  return { stage: byRole, canReview: false, canPick: false, scope: [] };
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
