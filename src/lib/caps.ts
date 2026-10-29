'use client';

/**
 * НЭМЭЛТ ЭРХҮҮД (capabilities) — харагдацаас ТУСДАА, нэг бүрчлэн олгодог.
 */

import { AUTH, roleForUser, type ViewKey } from './services';
import type { CapRow } from './permsRemote';
import { _newerThanSnapshot, _touchSeq } from './scopedAcl';

/** Одоогоор нэг эрх — жагсаалт өсөхөд UI автоматаар дагана. */
export type CapKey =
  | 'addRow'
  | 'zovshoorol'
  | 'finEdit'
  | 'finRow'
  | 'plan'
  | 'planApprove'
  | 'obyemEdit'
  | 'obyemApprove'
  | 'ajilApprove'
  | 'gazar'
  | 'butets'
  | 'chanarAuthor'
  | 'chanarReview'
  | 'hamaaral'
  | 'habeaData'
  | 'sysClose'
  | 'docsUpload'
  | 'docsGroups'
  | 'zuragEdit'
  | 'cfSwitch';

/**
 * Панелд харуулах бүртгэл — ЗӨВХӨН түлхүүр.
 */
export const CAPS: { key: CapKey; icon: string }[] = [
  { key: 'addRow', icon: 'plus' },
  /**
   * ЗӨВШӨӨРӨЛ — «Зөвшөөрөл» харагдац дээр зөвшөөрөл нэмэх, засах, устгах.
   */
  { key: 'zovshoorol', icon: 'file' },
  /**
   * САНХҮҮГИЙН БҮРТГЭЛ — Cashflow (/173) ба IPC (/172) хүснэгтийн нүдний утга
   * засах эрх.
   */
  { key: 'finEdit', icon: 'calc' },
  /**
   * САНХҮҮГИЙН БҮРТГЭЛ — мөр НЭМЭХ ба УСТГАХ эрх.
   */
  { key: 'finRow', icon: 'plus' },
  /**
   * ХУВААРЬ ТӨЛӨВЛӨХ — «Хуваарь» харагдацад ажлын эхлэх/дуусах огноог засах.
   */
  { key: 'plan', icon: 'calendar' },
  /**
   * ХУВААРЬ БАТЛАХ — гүйцэтгэгчийн илгээсэн хуваарийг батлах / буцаах.
   */
  { key: 'planApprove', icon: 'shield' },
  /**
   * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ ЗАСАХ — «Гүйцэтгэл бөглөх» хуудасны
   * «Инженерийн төлөвлөсөн обьём» баганын нүднүүдийг засаж, батлуулахаар
   * илгээх эрх (2026-09-08).
   */
  { key: 'obyemEdit', icon: 'frame' },
  /**
   * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ БАТЛАХ — илгээгдсэн засварыг батлах/буцаах.
   */
  { key: 'obyemApprove', icon: 'shield' },
  { key: 'ajilApprove', icon: 'shield' },
  /**
   * ГАЗРЫН ТӨЛӨВ ЗАСАХ — «Газар чөлөөлөлт» дээр нэгж талбарын `Tuluv`,
   * `явцын_мэдээ`, эзэмшигч, тайлбарыг засах.
   */
  { key: 'gazar', icon: 'frame' },
  /**
   * ДЭД БҮТЦИЙН АТРИБУТ ЗАСАХ — «Дэд бүтэц» харагдац дээр инженерийн
   * шугамын атрибут (`urt_m`, `ZONE_ID`, `DocName`, `bagts_name` …) засах.
   */
  { key: 'butets', icon: 'network' },
  /**
   * БАГЦЫН ХАМААРАЛ (2026-10-04) — «Багцын хамаарал» харагдац дээр багц хоорондын
   * холбоо нэмэх, устгах. ЗӨВХӨН холбоо — батлагчгүй. Эрхгүй хүн харагдацыг ХАРНА, засахгүй.
   */
  { key: 'hamaaral', icon: 'network' },
  /**
   * ХАБЭА-ИЙН БҮРТГЭЛ ОРУУЛАХ (2026-10-08) — «Бусад үзүүлэлт» (талбайн зааварчилгаа ·
   * сануулах хуудас · хариуцлага тооцох) ба «Хог хаягдал» картад мөр нэмэх/засах.
   * 2026-10-08: үзлэгийн тайлан татах (`UzlegExportButton`) мөн энэ эрхээр.
   * Батлагчгүй, багцаар хуваарилагдахгүй — шууд ArcGIS-д. Эрхгүй хүн карт ЭНГИЙН харна.
   */
  { key: 'habeaData', icon: 'shield' },
  /** ТЭЗҮ · ЗУРАГ ТӨСӨЛ ЗАСАХ (2026-10-26) — навч мөрийн огноо, явц; батлагчгүй, аккаунтаар. */
  { key: 'zuragEdit', icon: 'pen' },
  /**
   * САРЫН МӨНГӨ ГАРААР → ХУВААРЬ (2026-10-26) — гэрээний гараар оруулсан сарын мөрийг УСТГАЖ Хуваарийн обьём × нэгж
   * өртгөөр тооцох (`monthlyMoney.switchToHuvaari`). Буцаахгүй — «Төлөвлөлтийн ахлах инженер»-т олгоно.
   */
  { key: 'cfSwitch', icon: 'calendar' },
  /**
   * СИСТЕМ ТҮР ХААХ (2026-10-19, нийслэлийн дата төв рүү шилжүүлэх) — порталыг бусад бүх хэрэглэгчид
   * «Систем түр хаагдсан» цонхоор хааж, дахин нээх (`permissions.setSystemClosed`, `__sys__:maintenance` мөр).
   */
  { key: 'sysClose', icon: 'bolt' },
  /**
   * БАРИМТ БИЧГИЙН САН (2026-10-23, хэрэглэгч: «баримт бичгийн сан болгож бүлэглэн PDF оруулах») — бүлэг нэмэх,
   * нэр солих, устгах; PDF оруулах, устгах (`lib/docLib.ts`). Харах нь нэвтэрсэн БҮХ хэрэглэгчид — энэ эрх зөвхөн засвар.
   */
  { key: 'docsUpload', icon: 'file' },
  /**
   * БАРИМТ БИЧГИЙН САНГИЙН БҮЛЭГ (2026-10-23, хэрэглэгч: «бүлэг үүсгэх, баримт оруулахыг тусдаа эрхийн тохиргоотой болго») —
   * бүлэг нэмэх · нэр солих · (хоосон) устгах. PDF оруулах нь ТУСДАА `docsUpload`. Харагдац нээхгүй (`CAP_HOST_VIEW` хоосон).
   */
  { key: 'docsGroups', icon: 'grid' },
  /**
   * ЧАНАРЫН БАРИМТ — АРГАЧЛАЛ ИРҮҮЛЭХ (гүйцэтгэгч). Зураглалын 1 · 2 · 6 · 9
   * алхам: боловсруулж ирүүлнэ, буцаагдвал сайжруулж дахин ирүүлнэ.
   */
  { key: 'chanarAuthor', icon: 'pen' },
  /**
   * ЧАНАРЫН БАРИМТ — ХЯНАХ (ТУХ · Чанар · ХАБЭА). Зураглалын 3 · 4а · 4б.
   */
  { key: 'chanarReview', icon: 'shield' },
];

/**
 * ЭРХ БҮРИЙН «ГЭР» ХАРАГДАЦ — эрх нь зөвхөн тэр харагдац дээр утгатай.
 */
export const CAP_HOST_VIEW: Record<CapKey, ViewKey[]> = {
  addRow: ['huvaari'],
  zovshoorol: ['zovshoorol'],
  finEdit: ['finance'],
  finRow: ['finance'],
  plan: ['huvaari'],
  planApprove: ['huvaariBatlah', 'huvaari'],
  obyemEdit: ['guitsetgel'],
  obyemApprove: ['guitsetgel'],
  ajilApprove: ['ajilBatlah'],
  gazar: ['gazar'],
  butets: ['dedButets'],
  chanarAuthor: ['ma'],
  chanarReview: ['ma'],
  hamaaral: ['bagtsHamaaral'],
  habeaData: ['habea'],
  sysClose: [],
  docsUpload: [],
  docsGroups: [],
  zuragEdit: ['zuragTosol'],
  cfSwitch: ['finance'],
};

/**
 * УРСГАЛТАЙ ХАРАГДАЦУУД — хэрэглэгчийн картын «Харагдац» унтраалгад ОРОХГҮЙ
 * (2026-09-30, хэрэглэгчийн шийдвэр): Гүйцэтгэл · Хуваарь · Хуваарь батлах ·
 * Нэмэлт ажил батлах · Чанарын баримт · Материал баталгаажуулалт (2026-10-23: «Чанар (QAQC)» хасагдсан)
 * (`ma`, 2026-10-09 аудит №6: `chanarAuthor/chanarReview`-д орсон — нийт 7). Тэдгээр нь урсгалын
 * хуваарилалтаар (эрх → `CAP_HOST_VIEW`, урсгалын шат → `grantFlowAccess`)
 * автоматаар нээгдэж, хуваарилалт хасахад буцаагдана.
 */
const WORKFLOW_CAPS: readonly CapKey[] = [
  'addRow', 'ajilApprove', 'plan', 'planApprove', 'obyemEdit', 'obyemApprove', 'chanarAuthor', 'chanarReview',
];
export const WORKFLOW_VIEWS: readonly ViewKey[] = [...new Set(WORKFLOW_CAPS.flatMap((c) => CAP_HOST_VIEW[c]))];
export const isWorkflowView = (v: ViewKey): boolean => WORKFLOW_VIEWS.includes(v);

/**
 * Хэрэглэгчийн эрхүүдээс гарах харагдацууд (давхардалгүй).
 */
export function capViewsOf(username?: string | null): ViewKey[] {
  return [...new Set(capsOf(username).flatMap((c) => CAP_HOST_VIEW[c]))];
}

const VALID = new Set<string>(CAPS.map((c) => c.key));
const KEY = 'selbe-caps-v1';
const DIRTY_KEY = 'selbe-caps-dirty-v1';
const EVENT = 'selbe-caps-change';

type Store = Record<string, CapKey[]>;

/**
 * ArcGIS-д хүрч ЧАДААГҮЙ локал өөрчлөлтүүд: түлхүүр → зорьсон эрхийн жагсаалт
 * (`[]` = мөрийг устгах гэсэн).
 */
type DirtyCaps = Record<string, { by: string; caps: CapKey[] }>;

/**
 * Объектын түлхүүр болгож болохгүй нэрс (prototype pollution).
 */
export const UNSAFE_KEY: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * ЭНЭ runtime-д бичилт нь унаж dirty-д орсон түлхүүр → жагсаалтын JSON.
 */
const mineCaps = new Map<string, string>();
const serCaps = (c: CapKey[]): string => JSON.stringify(c);

/**
 * НЭГ ХЭРЭГЛЭГЧИЙН `__cap__:` БИЧИЛТҮҮД ДАРААЛНА (2026-09-25, аудитын засвар).
 */
const capQueue = new Map<string, Promise<unknown>>();
/** Хэрэглэгч бүрийн сүүлийн локал бичилтийн агшин — `_syncRemoteCaps`-д (`scopedAcl`-ийн толгой) */
const capTouched = new Map<string, number>();

function enqueueCap<T>(u: string, fn: () => Promise<T>): Promise<T> {
  capTouched.set(u, _touchSeq());
  const prev = capQueue.get(u) ?? Promise.resolve();
  const p = prev.then(fn, fn);
  const tail = p.then(() => undefined, () => undefined);
  capQueue.set(u, tail);
  void tail.then(() => {
    capTouched.set(u, _touchSeq());
    if (capQueue.get(u) === tail) capQueue.delete(u);
  });
  return p;
}

/** Одоо нэвтэрсэн хэрэглэгч — dirty мөрийн `by`. Динамик: `who.ts` энэ файлыг импортлодог. */
async function authorName(): Promise<string> {
  try {
    return (await import('./who')).currentUser() ?? '';
  } catch {
    return '';
  }
}

/** Танигдахгүй түлхүүрийг хаяна — хуучин/эвдэрсэн мөр эрх нээхгүй. */
const sane = (v: unknown): CapKey[] =>
  Array.isArray(v) ? (v.filter((x) => typeof x === 'string' && VALID.has(x)) as CapKey[]) : [];

function load(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const j = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Store = {};
    for (const [k, v] of Object.entries(j)) {
      const key = k.toLowerCase();
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      out[key] = sane(v);
    }
    return out;
  } catch {
    return {};
  }
}

let cache: Store = load();

/**
 * Энэ сешнд remote эрх (`__cap__:` мөрүүд) НЭГ Ч УДАА уншигдсан уу.
 */
let remoteSynced = false;

function save(s: Store) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* хувийн горим / квот дүүрсэн — санах ойд хэвээр ажиллана */ }
}

function notify() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT));
}

function loadDirty(): DirtyCaps {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(DIRTY_KEY) || '{}') as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return {};
    const out: DirtyCaps = {};
    for (const [k, v] of Object.entries(raw)) {
      if (UNSAFE_KEY.has(k.toLowerCase())) continue;
      if (Array.isArray(v)) { out[k.toLowerCase()] = { by: '', caps: sane(v) }; continue; }
      const o = (v ?? {}) as { by?: unknown; caps?: unknown };
      out[k.toLowerCase()] = { by: typeof o.by === 'string' ? o.by : '', caps: sane(o.caps) };
    }
    return out;
  } catch {
    return {};
  }
}

function saveDirty(d: DirtyCaps): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
  } catch { /* хувийн горим / квот дүүрсэн */ }
}

/**
 * Бичилтийн үр дүнг dirty-set-д тусгана (ok → цэвэрлэ, унав → тэмдэглэ).
 */
async function trackWrite(key: string, intended: CapKey[], ok: boolean): Promise<void> {
  const by = ok ? '' : await authorName();
  const d = loadDirty();
  if (ok) {
    mineCaps.delete(key);
    if (!(key in d)) return;
    delete d[key];
  } else {
    d[key] = { by, caps: intended };
    mineCaps.set(key, serCaps(intended));
  }
  saveDirty(d);
  notify();
}

/** ArcGIS-т хүрээгүй эрхийн өөрчлөлттэй түлхүүрүүд — UserAdmin-ы тэмдэгт */
export function dirtyCapKeys(): string[] {
  return Object.keys(loadDirty());
}

/** ЭНЭ СЕШНД ҮҮСЭЭГҮЙ dirty эрхүүд (2026-09-25) — «Дахин синк»-ийн баталгаажуулалтад */
export function foreignCapsDirty(): { key: string; by: string }[] {
  return Object.entries(loadDirty())
    .filter(([k, v]) => mineCaps.get(k) !== serCaps(v.caps))
    .map(([key, v]) => ({ key, by: v.by }));
}

/**
 * DIRTY эрхүүдийг remote руу ДАХИН бичиж үзнэ (`_syncRemoteCaps` дуудна).
 * Буцаана: энэ удаад АМЖИЛТТАЙ бичигдсэн түлхүүр → жагсаалт (кэшид тусгахад).
 *
 * @param onlyMine `true` — ЗӨВХӨН энэ runtime-ийн, өөрчлөгдөөгүй мөр (автомат
 *   зам). `false` — бүгд, зөвхөн админы ИЛ «Дахин синк»-ээс.
 */
async function retryDirtyCaps(onlyMine: boolean): Promise<Record<string, CapKey[]>> {
  const done: Record<string, CapKey[]> = {};
  const keys = Object.keys(loadDirty());
  if (!keys.length) return done;
  let m: typeof import('./permsRemote');
  try {
    m = await import('./permsRemote');
  } catch {
    return done; // модуль ачаалагдсангүй — бүгд dirty хэвээр
  }
  for (const key of keys) {
    await enqueueCap(key, async () => {
      const item = loadDirty()[key];
      if (!item) return; // хооронд нь амжилттай хадгалагдсан
      const want = serCaps(item.caps);
      if (onlyMine && mineCaps.get(key) !== want) return;
      let ok = false;
      try {
        ok = item.caps.length ? await m.capUpsert(key, item.caps) : await m.capRemove(key);
      } catch {
        ok = false;
      }
      if (!ok) return;
      const now = loadDirty();
      if (now[key] && serCaps(now[key].caps) === want) {
        delete now[key];
        saveDirty(now);
      }
      if (mineCaps.get(key) === want) mineCaps.delete(key);
      done[key] = item.caps;
    });
  }
  return done;
}

/** Remote руу бичигдсэн жагсаалтуудыг кэш дээр тусгана — дараалалд бичилт хүлээж буйг алгасна */
function applyDone(s: Store, done: Record<string, CapKey[]>): void {
  for (const [k, c] of Object.entries(done)) {
    if (capQueue.has(k)) continue; // шинэ бичилт хүлээгдэж байна — локал нь илүү шинэ
    if (c.length) s[k] = c; else delete s[k];
  }
}

/**
 * Нэг хэрэглэгчийн олгогдсон эрхүүд.
 */
export function capsOf(username?: string | null): CapKey[] {
  if (!username) return [];
  if (roleForUser(username) === 'super') return Object.keys(CAP_HOST_VIEW) as CapKey[];
  if (!remoteSynced) return [];
  return cache[username.toLowerCase()] ?? [];
}

/** Remote эрх энэ сешнд уншигдсан уу — UI-д «offline» тэмдэг харуулахад */
export const capsRemoteReady = (): boolean => remoteSynced;

export function _markCapsSynced(v: boolean): void {
  remoteSynced = v;
}

/**
 * ХАДГАЛАГДСАН жагсаалт — remote-ийн тугаас ҮЛ ХАМААРАН (зөвхөн БИЧИХ замд).
 */
export function capsStored(username?: string | null): CapKey[] {
  if (!username) return [];
  return cache[username.toLowerCase()] ?? [];
}

/**
 * ЭРХТЭЙ БҮХ ТҮЛХҮҮР (2026-10-01, «хэрэглэгч: бүгдийг зас») — устгагдсан аккаунтын үлдсэн
 * `__cap__:` мөрийг эрхийн хуудсанд олж цэвэрлэхэд (`aclOps.goneRightsOf`).
 */
export function capUsers(): string[] {
  if (!remoteSynced) return [];
  return Object.keys(cache).filter((k) => (cache[k] ?? []).length > 0).sort();
}

/**
 * Тухайн эрх олгогдсон эсэх.
 */
export function hasCap(username: string | null | undefined, cap: CapKey): boolean {
  if (!AUTH.appId) return true;
  return capsOf(username).includes(cap);
}

/**
 * Хэрэглэгчийн эрхийн ЖАГСААЛТЫГ БҮТНЭЭР солино.
 */
/**
 * @param opts.absolute 2026-10-09 (аудит №6): `true` бол `caps` хоосон байх ёстой ба мөрийг
 *   НЭГТГЭЛГҮЙ бүрмөсөн арилгана (`capRemove`). Аккаунт устгах/сэргээх зам (`UserAdmin.saveAll`)
 *   урьд нь `setCaps(u, [])`-аар явж, ялгаа = «кэш − []» тул ЭНЭ табын кэшид байхгүй (өөр админы
 *   олгосон) эрх `fresh`-д үлдэж, устгагдсан аккаунтад `__cap__:` мөр наалддаг байв.
 */
export async function setCaps(username: string, caps: CapKey[], opts?: { absolute?: boolean }): Promise<boolean> {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const absolute = opts?.absolute === true && caps.length === 0;
  const base = capsStored(u);
  const next = sane(caps);
  cache = { ...cache, [u]: next };
  if (next.length === 0) delete cache[u];
  save(cache);
  notify();
  return enqueueCap(u, async () => {
    let ok = false;
    let out = next;
    try {
      const r = await import('./permsRemote');
      const dirtyItem = loadDirty()[u];
      if (absolute || (dirtyItem && mineCaps.get(u) === serCaps(dirtyItem.caps))) {
        ok = next.length ? await r.capUpsert(u, next) : await r.capRemove(u);
        await trackWrite(u, out, ok);
        return ok;
      }
      const fresh = await r.capRead(u);
      if (fresh) {
        out = mergeCapDelta(base, next, sane(fresh));
        ok = out.length ? await r.capUpsert(u, out) : await r.capRemove(u);
        /* Нөгөө админы өөрчлөлтийг локал кэшид ч тусгана — дараагийн засвар түүн дээрээс */
        if (ok && serCaps(out) !== serCaps(next)) {
          cache = { ...cache, [u]: out };
          if (out.length === 0) delete cache[u];
          save(cache);
          notify();
        }
      }
    } catch {
      ok = false;
    }
    await trackWrite(u, out, ok);
    return ok;
  });
}

/**
 * ЭРХИЙН ӨӨРЧЛӨЛТИЙГ ШИНЭ УТГА ДЭЭР ДАВХАРЛАНА — цэвэр (`caps.check.mjs`, 2026-10-04).
 * `next − base` = нэмсэн, `base − next` = хассан; `fresh` (remote-оос дөнгөж уншсан) дээр
 * хассаныг хасаж, нэмснийг нэмнэ — бусад админы завсрын өөрчлөлт хадгалагдана.
 */
export function mergeCapDelta(base: readonly string[], next: readonly string[], fresh: readonly string[]): CapKey[] {
  const b = new Set(base);
  const n = new Set(next);
  const out = new Set(fresh.filter((c) => !(b.has(c) && !n.has(c))));
  for (const c of next) if (!b.has(c)) out.add(c);
  return sane([...out]);
}

/** Нэг эрхийг асаах/унтраах товчлол. */
export function toggleCap(username: string, cap: CapKey, on: boolean): Promise<boolean> {
  if (!remoteSynced) return Promise.resolve(false);
  const cur = capsStored(username);
  return setCaps(username, on ? [...new Set([...cur, cap])] : cur.filter((c) => c !== cap));
}

export function subscribeCaps(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/**
 * Гараар «дахин синк» — UserAdmin-ы товчноос (`permissions.retryDirty`-ийн хос).
 * Үлдсэн dirty тоог буцаана.
 */
export async function retryCapsDirty(onlyMine = false): Promise<number> {
  const done = await retryDirtyCaps(onlyMine);
  if (Object.keys(done).length) {
    const merged: Store = { ...cache };
    applyDone(merged, done);
    cache = merged;
    save(merged);
  }
  notify();
  return Object.keys(loadDirty()).length;
}

/**
 * ArcGIS-аас ирсэн мөрүүдийг локал кэш болгоно (`initRemote` дуудна).
 */
/**
 * @param trusted dirty-set-ийг дахин илгээж, унасныг snapshot дээр давхарлах эрх
 *   (`permissions.initRemote`-ийн хатуу super сешн). Итгэмжлэгдээгүй сешнд
 *   давхарлахгүй: dirty-set нь localStorage-д байдаг тул ЯМАР Ч аккаунт өөртөө
 *   `zovshoorol`/`finRow` зэрэг эрх тарьж, remote бичилт нь (эрхгүй тул) унамагц
 *   тэр нь snapshot дээр мөнхөд давхарлагдана — өөрөө өөртөө эрх олгох зам.
 *   `permissions.initRemote(trusted)`-ийн ЯГ ижил үндэслэл.
 */
export function _syncRemoteCaps(rows: CapRow[], trusted = false): void {
  const s: Store = Object.create(null) as Store;
  for (const r of rows) {
    if (!r.user) continue;
    if (UNSAFE_KEY.has(r.user.trim().toLowerCase())) continue;
    s[r.user.trim().toLowerCase()] = sane(r.caps);
  }
  const keep = new Set<string>(capQueue.keys());
  for (const [u, t] of capTouched) if (_newerThanSnapshot(t)) keep.add(u);
  for (const u of keep) {
    const loc = cache[u];
    if (loc && loc.length) s[u] = loc; else delete s[u];
  }
  cache = s;
  remoteSynced = true;
  save(s);
  notify();

  if (!trusted) return;
  void retryDirtyCaps(true).then((done) => {
    const merged: Store = { ...cache };
    /* Retry нь snapshot-ын ДАРАА бичсэн тул тэр утгууд snapshot-од байхгүй */
    applyDone(merged, done);
    /* Үлдсэн (унасан) энэ runtime-ийн засварыг давхарлана */
    for (const [k, v] of Object.entries(loadDirty())) {
      if (mineCaps.get(k) !== serCaps(v.caps) || capQueue.has(k)) continue;
      if (v.caps.length) merged[k] = v.caps;
      else delete merged[k];
    }
    cache = merged;
    save(merged);
    notify();
  });
}
