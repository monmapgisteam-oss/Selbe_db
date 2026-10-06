'use client';

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХИЙН RUNTIME STORE.
 *
 * Суурь эрх нь `services.ts`-ийн хатуу тохиргоо (`ROLE_BY_USER` + `ROLE_ACCESS`).
 * Super admin панелаас хийсэн өөрчлөлт нь ArcGIS дээрх ХУВААЛЦСАН хүснэгтэд
 * (`permsRemote.ts`) хадгалагдаж, бүх хэрэглэгчид (өөр төхөөрөмжөөс ч) үйлчилнэ.
 *
 * Урсгал: нэвтрэнгүүт `initRemote()` хүснэгтээс cache-д татна → sync `resolveAccess`
 * cache-аас уншина → засвар нь cache + `localStorage` + хүснэгт рүү бичнэ.
 * ArcGIS байхгүй/алдаа бол `localStorage` cache-аар offline ажиллана.
 *
 * ⚠️ DIRTY-SET (2026-08-27): ArcGIS бичилт унасан локал өөрчлөлтийг түлхүүрээр
 * нь тэмдэглэж localStorage-д хадгална. Урьд нь `initRemote` (5 мин тутам)
 * cache-ийг remote-оор БҮХЭЛД нь дарж бичдэг байсан тул бичилт нь унасан
 * админы засвар ≤5 минутын дотор чимээгүй буцдаг байв. Одоо: initRemote бүрд
 * dirty мөрүүдийг ЭХЛЭЭД дахин бичиж үзнэ (retry) — бүтвэл цэвэрлэнэ, унавал
 * локал утгыг нь remote snapshot дээр давхарлан үлдээнэ. UserAdmin-ы
 * «ArcGIS-т хадгалагдсангүй» тэмдэг энэ dirty-set-ээс уншдаг тул ҮНЭН.
 * ⚠️ 2026-09-25: автомат retry/overlay нь ЗӨВХӨН энэ runtime-д үүссэн мөрт
 * (`mine`). Өмнөх сешний / гараар тарьсан мөрийг «Дахин синк» → ИЛ
 * баталгаажуулалтаар л бичнэ — хуваалцсан компьютер дээр super-ийн токеноор
 * чимээгүй эрх олгох замыг хаав.
 */

import {
  ROLE_ACCESS,
  ROLE_BY_USER,
  VIEWS,
  roleForUser,
  type Role,
  type ViewKey,
} from './services';
import { capViewsOf, isWorkflowView } from './caps';
import { _typesMark, roleAccess } from './roleTypes';
import { currentUser } from './who';
import { _beginRemoteFetch, _newerThanSnapshot, _touchSeq } from './scopedAcl';
/* ⚠️ 2026-10-01: урсгалтай харагдацын эх сурвалж (`workflowViewsOf`). Статик импорт аюулгүй —
   `guitsetgelAcl` энэ файлыг ЗӨВХӨН динамикаар (`await import('./permissions')`) дууддаг. */
import { stageOfUser } from './guitsetgelAcl';

/** Нэг хэрэглэгчийн эрх — харагдацууд ('all' = бүгд) ба ТЭЗҮ-БОНУ баримт */
export type Access = { views: ViewKey[] | 'all'; docs: boolean };

/**
 * ⚠️ `true` бол нэвтэрсэн БҮХ аккаунт бүх харагдацыг үзнэ (үүрэг/override
 * хязгаарлалт үл хэрэгсэгдэнэ). `false` — эрх/үүргийн хязгаарлалт идэвхтэй.
 * (Жагсаалтгүй бүртгэлийг `AuthGate` хэвээр denied болгоно.)
 */
const GRANT_ALL = false;

/** Панелд харуулах нэг мөр — суурь эсвэл override хэрэглэгч */
export type UserPerm = {
  username: string;
  /** Суурь үүрэг (байвал) — зөвхөн лавлагаа/preset-д */
  role: Role | null;
  views: ViewKey[] | 'all';
  docs: boolean;
  /** localStorage-д override-той юу (суурь бус) */
  overridden: boolean;
};

const KEY = 'selbe-perms-v1';
const DIRTY_KEY = 'selbe-perms-dirty-v1';
const EVENT = 'selbe-perms-change';

/**
 * ⚠️ `removed` — аккаунт УСТГАГДСАН тэмдэглэгээ (tombstone). Хатуу тохиргооны
 * (`ROLE_BY_USER`) хэрэглэгчийг кодоос хасалгүйгээр админ панелаас устгахад
 * хэрэгтэй: энгийн delete нь суурь эрхийг нь буцааж «амилуулдаг» байв.
 * Тэмдэглэгээтэй хэрэглэгч жагсаалтад гарахгүй, `hasAccess` нэвтрэлтийг нь
 * татгалзана. Панелийн «Буцаах» товч тэмдэглэгээг арилгаж суурь эрхийг сэргээнэ.
 */
type Entry = {
  views: ViewKey[] | 'all'; docs: boolean; role: Role | null; removed?: boolean;
};
type Store = Record<string, Entry>;

/**
 * ArcGIS-д хүрч ЧАДААГҮЙ локал өөрчлөлтүүд: түлхүүр → зорьсон мөр
 * (`e`, `null` = мөрийг устгах гэсэн) + бичсэн хүн (`by`). localStorage-д
 * хадгалагдана — refresh даваад ч «Дахин синк»-ээр retry хийгдэнэ.
 *
 * ⚠️ `by` (2026-09-25, аудитын засвар) — БИЧСЭН хэрэглэгч. Урьд нь мөр нь
 *    хэн бичсэнийг огт тэмдэглэдэггүй, browser-ийн БҮХ аккаунтад хуваалцсан
 *    тул super нэвтрэхэд `initRemote(trusted)` бүгдийг super-ийн токеноор
 *    ЧИМЭЭГҮЙ бичдэг байв (доорх `mine`-ийн тайлбар). `by` нь localStorage-оос
 *    уншигддаг тул ХУУРАМЧ байж болно — зөвхөн «Дахин синк»-ийн баталгаажуулах
 *    асуултад ЛАВЛАГАА болгон харуулна, итгэлийн шалгуур БИШ.
 * ⚠️ Хуучин хэлбэрийн (`Entry | null` шууд) мөр `by: ''` гэж уншигдана.
 */
type DirtyItem = { by: string; e: Entry | null };
type DirtyMap = Record<string, DirtyItem>;

/**
 * ЭНЭ СЕШНД (JS runtime) бичилт нь унаж dirty-д орсон түлхүүрүүд → зорьсон
 * утгын JSON.
 *
 * ⚠️ АВТОМАТ RETRY/OVERLAY-ИЙН ГАНЦ ИТГЭЛИЙН ЭХ СУРВАЛЖ (2026-09-25, аудитын
 *    засвар). Dirty-set нь localStorage-д байдаг тул хуваалцсан компьютер дээр
 *    энгийн хэрэглэгч `selbe-perms-dirty-v1`-д `{me: {views:'all', role:
 *    'eronhii'}}` (эсвэл `selbe-caps-dirty-v1`-д `finRow`) тарьж орхиход
 *    дараа нь нэвтэрсэн хатуу super-ийн `initRemote(true)` тэр мөрийг super-ийн
 *    токеноор АСУУЛГҮЙ бичдэг байв — өөрөө өөртөө эрх олгох зам. `by` талбарыг
 *    ч хуурамчаар бичиж болно (super-ийн нэр кодонд ил), тиймээс санах ойд
 *    л үлддэг энэ Map-ыг шалгуур болгоно: зөвхөн ЭНЭ runtime-д ЭНЭ хэрэглэгчийн
 *    дуудлагаар (`setUser`/`removeUser`/`clearOverride`) үүссэн, утга нь
 *    ӨӨРЧЛӨГДӨӨГҮЙ мөрийг автоматаар дахин илгээж, snapshot дээр давхарлана.
 *    Бусад (өмнөх сешн, өөр таб, өөр аккаунт, гараар тарьсан) мөрийг ЗӨВХӨН
 *    `UserAdmin`-ы «Дахин синк» → ИЛ баталгаажуулалтаар бичнэ.
 */
const mine = new Map<string, string>();
const ser = (e: Entry | null): string => JSON.stringify(e);

/**
 * НЭГ ТҮЛХҮҮРИЙН remote бичилтүүд ДАРААЛНА (2026-09-25, аудитын засвар).
 * ⚠️ Урьд нь `setUser` ба `retryDirtyOnce` нэг түлхүүрт зэрэг бичиж болдог
 *    байв: retry-ийн гогцоо эхэндээ авсан ХУУЧИН утгыг, админы дөнгөж
 *    амжилттай хадгалсан шинэ утгын ДАРАА бичиж засварыг нь дардаг байлаа.
 *    `scopedAcl.enqueue`-тэй ижил загвар.
 */
const chain = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chain.get(key) ?? Promise.resolve();
  const p = prev.then(fn, fn);
  const tail = p.then(() => undefined, () => undefined);
  chain.set(key, tail);
  void tail.then(() => { if (chain.get(key) === tail) chain.delete(key); });
  return p;
}

/**
 * ⚠️ 2026-09-29 (аудит 10): ХЭРЭГЛЭГЧИЙН БИЧИЛТ (`setUser` · `removeUser` · `clearOverride`)
 *    — `serial` + агшны тэмдэг. `caps.enqueueCap` · `scopedAcl.enqueue`-д 2026-09-25-нд
 *    нэмэгдсэн хамгаалалт энд ХУУЛАГДААГҮЙ байв: `initRemoteInner` зөвхөн `chain.has(k)`
 *    (`applyDone`) шалгадаг тул бичилт ДУУССАНЫ дараа буусан, бичилтээс ӨМНӨ авагдсан
 *    snapshot `cache[u]`-г дараагийн poll хүртэл (5 мин) хуучин утгаар дардаг байлаа.
 * ⚠️ `retryDirtyOnce` энэ замаар ЯВАХГҮЙ (шууд `serial`): retry нь `initRemoteInner`-ийн
 *    ДОТОР, snapshot-ын дараа ажилладаг тул тэмдэглэвэл БҮХ dirty түлхүүр (өөр сешний,
 *    гараар тарьсан мөр ч) «snapshot-оос шинэ» болж локал утга нь давамгайлна —
 *    `mine`-ийн хаасан өөртөө эрх олгох зам дахин нээгдэнэ.
 */
const touched = new Map<string, number>();
/** Дуусаагүй хэрэглэгчийн бичилтийн тоо (түлхүүрээр) — snapshot-оос ӨМНӨ эхэлсэн ч дуусаагүйг хамгаална */
const writing = new Map<string, number>();
function serialWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
  touched.set(key, _touchSeq());
  writing.set(key, (writing.get(key) ?? 0) + 1);
  const p = serial(key, fn);
  const done = (): void => {
    touched.set(key, _touchSeq());
    const n = (writing.get(key) ?? 1) - 1;
    if (n > 0) writing.set(key, n); else writing.delete(key);
  };
  void p.then(done, done);
  return p;
}

/** ЗӨВ харагдацын түлхүүрүүд — бүртгэлээс автоматаар */
const VALID_VIEWS = new Set<string>(VIEWS.map((v) => v.key));

/**
 * Хадгалагдсан views-ийг ЦЭВЭРЛЭНЭ — бүртгэлээс хасагдсан түлхүүр
 * (жиш. 2026-08-27-нд хасагдсан `bagts`, `monitor`) үлдсэн бол шүүнэ.
 * ⚠️ Эс бөгөөс Root-ийн `clamp` тэр түлхүүрийг navScope-д нэвтрүүлж,
 * Portal `VIEW_BY_KEY[key]` → undefined дээр БҮХЭЛДЭЭ унадаг байв.
 */
/**
 * ХОЦРОГСДЫН ЗУРАГЛАЛ — устгагдсан харагдацын түлхүүрийг залгамжлагч руу.
 *
 * ⚠️ `sheet` («Гүйцэтгэл бөглөх») нь `guitsetgel` дотор ТАБ болж нэгдсэн.
 * Энэ зураглалгүй бол ArcGIS-т хадгалагдсан хуучин эрх нь `VALID_VIEWS`-д
 * байхгүй тул чимээгүй хасагдаж, тэр хүн гүйцэтгэлийн хуудсаа бүрмөсөн
 * алдана — эрх ЧИМЭЭГҮЙ хумигдах нь хамгийн муу төрлийн алдаа.
 */
const LEGACY_VIEW: Record<string, ViewKey> = {
  sheet: 'guitsetgel',
  /*
   * ⚠️ `tsogts` («Багцын хяналт») нь 2026-08-21-нд `pkgProg` (биет явц) ба
   *    `pkgFin` (санхүү) ХОЁР болж салсан (23a326b) — гэвч зураглал энд
   *    нэмэгдээгүй тул тэр түлхүүртэй override мөр (амьд хүснэгтэд
   *    `selbe_redesign`, 2026-09-08-ны шалгалт) чимээгүй хасагдаж, хэрэглэгч
   *    «Багцын хяналт»-аа бүрмөсөн алдсан байв.
   *
   * ⚠️ ЗӨВХӨН `pkgProg` руу — `pkgFin` БИШ (санаатай): тэр өдрийн шийдвэрээр
   *    санхүүгийн тал нь хязгаарлагдмал (`ROLE_ACCESS.beginner`-ийн тайлбар).
   *    Хуучин нэг түлхүүрээс санхүүгийн хуудас автоматаар нээгдэх ёсгүй;
   *    хэрэгтэй бол админ `pkgFin`-ийг тусад нь олгоно.
   */
  tsogts: 'pkgProg',
};

const sanitizeViews = (v: ViewKey[] | 'all'): ViewKey[] | 'all' => {
  if (v === 'all') return 'all';
  if (!Array.isArray(v)) return [];
  const out: ViewKey[] = [];
  for (const k of v) {
    const m = LEGACY_VIEW[k as string] ?? k;
    if (VALID_VIEWS.has(m) && !out.includes(m)) out.push(m);
  }
  return out;
};

/**
 * ⚠️ 2026-09-30: ҮҮРГИЙГ Ч ШҮҮНЭ — танигдахгүй утга (`Role`-д байхгүй: хуучин build-ийн нэр,
 *    гараар засагдсан мөр) → `null` (fail-closed, 05-erh-batlah §2 «түлхүүр танигдахгүй → эрхгүй»).
 *    Урьд нь `permsRemote.fetchAll` үүргийг шалгалгүй тээвэрлэж, энд ч шүүгддэггүй байв: `roleOf`
 *    тэр утгыг буцааж, `Root`-ийн нүүр цонхны `roleAccess(r).home` нь `ROLE_ACCESS[r]` → `undefined`
 *    дээр ШИДЭЖ тэр хэрэглэгчийн портал бүхэлдээ унадаг байв.
 */
const VALID_ROLES = new Set<string>(Object.keys(ROLE_ACCESS));
const sanitizeEntry = (e: Entry): Entry => ({
  ...e,
  views: sanitizeViews(e.views),
  role: e.role && VALID_ROLES.has(e.role) ? e.role : null,
});

/**
 * Санах ойн CACHE — sync унших цорын ганц эх сурвалж. Эхэндээ `localStorage`-оос
 * (offline/хурдан), нэвтэрсний дараа `initRemote()`-оор ArcGIS хүснэгтээс шинэчлэгдэнэ.
 */
let cache: Store = loadLocal();

/**
 * Энэ сешнд remote хүснэгт НЭГ Ч УДАА амжилттай уншигдсан уу.
 * ⚠️ Панелаас нэмсэн (хатуу жагсаалтад байхгүй) хэрэглэгчийг ЗӨВХӨН remote
 * баталгаажсан үед л нэвтрүүлнэ — эс бөгөөс localStorage-оо гараар засаад
 * өөрийгөө нэмсэн бүртгэл нэвтэрч чаддаг байв (fail-open admission).
 */
let remoteLoaded = false;

function loadLocal(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Store;
    const out: Store = {};
    for (const [k, e] of Object.entries(raw)) out[k] = sanitizeEntry(e);
    return out;
  } catch {
    return {};
  }
}

function saveLocal(s: Store): void {
  /*
   * ⚠️ ХАМГААЛАЛТГҮЙ БАЙВ (2026-09-07-ны 100% аудит). `localStorage` нь
   * хувийн горим, квот дүүрэх, сайтын өгөгдөл хаасан тохиргоонд ШИДДЭГ.
   * `saveLocal` нь `initRemote`-ийн дотор дуудагддаг тул шидсэн алдаа нь
   * ДӨРВӨН ACL-ийн (`caps` · `flow` · `qaqc` · `huvaari`) синхрончлолыг
   * бүхэлд нь таслаж, нэвтрэлтийн урсгал унана — хэрэглэгч эрхгүй хоцорно.
   * Локал кэш нь ердөө хурдасгуур: алсын эх сурвалж (`Selbe_Permissions`)
   * үргэлж дахин уншигдана.
   */
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* хувийн горим / квот дүүрсэн — алсын эх сурвалж хэвээр */ }
}

function loadDirty(): DirtyMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(DIRTY_KEY) || '{}') as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return {};
    const out: DirtyMap = {};
    for (const [k, v] of Object.entries(raw)) {
      /* ⚠️ Хуучин хэлбэр (`Entry | null` шууд) — бичсэн хүн тодорхойгүй */
      const item = v && typeof v === 'object' && 'e' in v && 'by' in v
        ? (v as DirtyItem)
        : { by: '', e: (v ?? null) as Entry | null };
      out[k] = { by: typeof item.by === 'string' ? item.by : '', e: item.e ?? null };
    }
    return out;
  } catch {
    return {};
  }
}

function saveDirty(d: DirtyMap): void {
  /* ⚠️ try/catch (2026-09-07): `saveLocal`-тай ижил шалтгаан — шидвэл
     эрхийн бичилтийн үр дүн тэмдэглэгдэхгүй, дуудагч урсгал унана.
     Dirty-set нь дахин оролдлогын ТЭМДЭГЛЭЛ; алдагдвал дараагийн
     `initRemote` алсаас бүгдийг дахин уншина. */
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
  } catch { /* хувийн горим / квот дүүрсэн */ }
}

/** Бичилтийн үр дүнг dirty-set-д тусгана (ok → цэвэрлэ, унав → тэмдэглэ) */
function trackWrite(key: string, intended: Entry | null, ok: boolean): void {
  const d = loadDirty();
  if (ok) {
    mine.delete(key);
    if (!(key in d)) return;
    delete d[key];
  } else {
    /* ⚠️ Бичсэн хүн + ЭНЭ runtime-ийн тэмдэг (`mine`) — автомат retry-ийн шалгуур */
    d[key] = { by: currentUser() ?? '', e: intended };
    mine.set(key, ser(intended));
  }
  saveDirty(d);
  notify();
}

/** ArcGIS-т хүрээгүй өөрчлөлттэй түлхүүрүүд — UserAdmin-ы тэмдэгт */
export function dirtyKeys(): string[] {
  return Object.keys(loadDirty());
}

/**
 * ЭНЭ СЕШНД ҮҮСЭЭГҮЙ dirty мөрүүд (2026-09-25) — «Дахин синк» бичихээс өмнө
 * ИЛ баталгаажуулахад. `by` нь localStorage-оос — баталгаагүй лавлагаа.
 */
export function foreignDirty(): { key: string; by: string }[] {
  return Object.entries(loadDirty())
    .filter(([k, v]) => mine.get(k) !== ser(v.e))
    .map(([key, v]) => ({ key, by: v.by }));
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function loadStore(): Store {
  return cache;
}

function saveStore(s: Store): void {
  cache = s;
  saveLocal(s);
  notify();
}

/** Хатуу тохиргооны ХАЛДАШГҮЙ super эсэх — tombstone-д автдаггүй (доорх тайлбар) */
const isHardSuper = (username: string): boolean => roleForUser(username) === 'super';

/**
 * DIRTY мөрүүдийг remote руу ДАХИН бичиж үзнэ.
 * Буцаана: энэ удаад АМЖИЛТТАЙ бичигдсэн түлхүүр → утга (cache-д тусгахад).
 *
 * @param onlyMine `true` бол ЗӨВХӨН энэ runtime-д үүссэн, өөрчлөгдөөгүй мөр
 *   (`mine`-ийн тайлбар) — автомат зам (`initRemote`). `false` — бүгд, зөвхөн
 *   админы ИЛ «Дахин синк»-ээс.
 *
 * ⚠️ ТҮЛХҮҮР БҮРИЙГ ГҮЙЦЭТГЭХ АГШИНД ДАХИН УНШИНА (2026-09-25, аудитын засвар).
 *    Урьд нь map-ыг эхэнд нь авч, гогцооны төгсгөлд `saveDirty(left)`-ээр
 *    БҮХЭЛД нь дардаг байв: (а) гогцооны явцад `trackWrite`-ийн нэмсэн шинэ
 *    түлхүүр арчигдаж, тэмдэг нь алга болоод дахин оролдогдохгүй; (б) явцад нь
 *    амжилттай хадгалсан түлхүүрийн ХУУЧИН утгыг дараа нь бичиж админы засварыг
 *    дардаг. Одоо: түлхүүр бүр `serial`-аар бусад бичилттэй дараалж, тэр
 *    агшны dirty-г уншина (алга/өөр утга бол алгасна), бичсэний дараа утга нь
 *    ХЭВЭЭР бол л арилгана.
 */
async function retryDirtyOnce(onlyMine: boolean): Promise<Record<string, Entry | null>> {
  const done: Record<string, Entry | null> = {};
  const keys = Object.keys(loadDirty());
  if (!keys.length) return done;
  let m: typeof import('./permsRemote');
  try {
    m = await import('./permsRemote');
  } catch {
    return done; // модуль ачаалагдсангүй — бүгд dirty хэвээр
  }
  for (const key of keys) {
    await serial(key, async () => {
      const item = loadDirty()[key];
      if (!item) return; // хооронд нь амжилттай хадгалагдсан
      const want = ser(item.e);
      if (onlyMine && mine.get(key) !== want) return;
      const e = item.e;
      let ok = false;
      try {
        ok = e === null
          ? await m.remove(key)
          : await m.upsert({ username: key, role: e.role, views: e.views, docs: e.docs, removed: e.removed });
      } catch {
        ok = false;
      }
      if (!ok) return;
      const now = loadDirty();
      if (now[key] && ser(now[key].e) === want) {
        delete now[key];
        saveDirty(now);
      }
      if (mine.get(key) === want) mine.delete(key);
      done[key] = e;
    });
  }
  return done;
}

/** Remote руу бичигдсэн утгуудыг cache дээр тусгана (дараалалд бичилт хүлээж буйг алгасна) */
function applyDone(s: Store, done: Record<string, Entry | null>): void {
  for (const [k, e] of Object.entries(done)) {
    if (chain.has(k)) continue; // шинэ бичилт хүлээгдэж байна — локал утга нь илүү шинэ
    if (e === null) delete s[k];
    else s[k] = sanitizeEntry(e);
  }
}

/** ЭНЭ runtime-д үүссэн, одоо ч dirty мөрүүд — snapshot дээр давхарлана */
function mineDirty(): Record<string, Entry | null> {
  const out: Record<string, Entry | null> = {};
  for (const [k, v] of Object.entries(loadDirty())) {
    if (mine.get(k) === ser(v.e)) out[k] = v.e;
  }
  return out;
}

/**
 * Гараар «дахин синк» — UserAdmin-ы товчноос. Үлдсэн dirty тоог буцаана.
 * @param onlyMine `true` — админ өмнөх сешний мөрийг бичихийг ЗӨВШӨӨРӨӨГҮЙ үед
 */
export async function retryDirty(onlyMine = false): Promise<number> {
  const done = await retryDirtyOnce(onlyMine);
  if (Object.keys(done).length) {
    const s = { ...loadStore() };
    applyDone(s, done);
    cache = s;
    saveLocal(s);
  }
  notify();
  return Object.keys(loadDirty()).length;
}

/**
 * ArcGIS хүснэгтээс эрхийг татаж cache-д хийнэ. Super admin (`canCreate`) анх
 * дуудахад хүснэгт байхгүй бол автоматаар үүсгэнэ. Нэвтэрсний дараа дуудна.
 * ArcGIS байхгүй/алдаа бол `localStorage`-ийн cache хэвээр (offline).
 *
 * Буцаана: remote амжилттай уншигдсан эсэх (админ панел offline тэмдэг харуулна).
 *
 * ⚠️ Урсгалын томилгоог (`__flow__:` мөрүүд) мөн эндээс `guitsetgelAcl` руу
 * дамжуулна — нэг таталтаар хоёр дэд систем шинэчлэгдэнэ.
 */
/**
 * @param canCreate хүснэгт байхгүй бол үүсгэх эрх (зөвхөн нэвтрэх агшны хатуу super)
 * @param trusted  dirty-set-ийг дахин илгээж, давхарлах эрх (хатуу super-ийн сешн).
 *   ⚠️ 2026-08-29: dirty-set нь localStorage-д байдаг тул org-ийн ЯМАР Ч аккаунт
 *   өөртөө `role:'super'` мөр тарьж, remote бичилт нь (editor эрхгүй тул) унамагц
 *   тэр мөр snapshot дээр давхарлагдаж `remoteLoaded=true`-тэй хамт «баталгаажсан»
 *   болдог байв — өөрийгөө super болгох зам. Итгэмжлэгдээгүй сешнд dirty map-ыг
 *   ХӨНДӨХГҮЙ (арчихгүй — хуваалцсан компьютер дээрх админы хүлээгдэж буй засвар
 *   алдагдахгүй), зөвхөн давхарлахгүй, дахин илгээхгүй.
 *   `canCreate`-ээс ТУСДАА параметр: 5 минутын poll-д `canCreate=true` өгвөл
 *   транзит хайлтын алдаанд давхар хүснэгт үүсгэх эрсдэлтэй.
 *   ⚠️ 2026-09-25: итгэмжлэгдсэн сешн ч ЗӨВХӨН өөрийн runtime-д үүссэн dirty
 *   мөрийг автоматаар илгээнэ (`mine`-ийн тайлбар) — localStorage-д тарьсан
 *   мөрийг super-ийн токеноор чимээгүй бичихгүй.
 */
export async function initRemote(canCreate: boolean, trusted: boolean = canCreate): Promise<boolean> {
  /* ⚠️ Агшны хүсэлт ЭХЭЛСЭН мөчийг тэмдэглэнэ (2026-09-25) — ACL/caps-ийн
     `syncRemote` энэ мөчөөс ХОЙШ локалд бичигдсэн хэрэглэгчийн төлөвийг хуучин
     snapshot-оор дарахгүй (`scopedAcl._beginRemoteFetch`). */
  const fetched = _beginRemoteFetch();
  try {
    return await initRemoteInner(canCreate, trusted);
  } finally {
    fetched();
  }
}

async function initRemoteInner(canCreate: boolean, trusted: boolean): Promise<boolean> {
  const { fetchAll } = await import('./permsRemote');
  /* ⚠️ 2026-09-25: загварын тэмдэг — хүсэлтээс ХОЙШ хадгалсан загварыг энэ snapshot дарахгүй (`roleTypes._typesMark`) */
  const typesMark = _typesMark();
  const remote = await fetchAll(canCreate);
  if (!remote) return false; // ArcGIS алга — cache хэвээр

  // 1) Унасан локал бичилтүүдийг эхлээд дахин тулгана — «локал үүрд ялна»
  //    биш, retry-then-clear: өөр админы засварыг мөнхөд дарахгүй.
  //    ⚠️ ЗӨВХӨН энэ runtime-ийнх (`onlyMine`, 2026-09-25).
  const done = trusted ? await retryDirtyOnce(true) : {};

  // 2) Remote snapshot + дөнгөж бичигдсэн + үлдсэн (энэ runtime-ийн) dirty давхарга
  const s: Store = {};
  for (const [k, r] of Object.entries(remote.perms)) {
    s[k] = sanitizeEntry({ views: r.views, docs: r.docs, role: r.role, ...(r.removed ? { removed: true } : {}) });
  }
  /* ⚠️ Retry нь snapshot-ын ДАРАА бичсэн тул тэр утгууд snapshot-од байхгүй */
  applyDone(s, done);
  if (trusted) {
    for (const [k, intended] of Object.entries(mineDirty())) {
      if (intended === null) delete s[k];
      else s[k] = sanitizeEntry(intended);
    }
  }
  /* ⚠️ 2026-09-29 (аудит 10): ДУУСААГҮЙ ба SNAPSHOT-ЫН ДАРАА БИЧИГДСЭН түлхүүрийн ЛОКАЛ
     утга давамгайлна (`caps._syncRemoteCaps`-ийн ижил дүрэм, `serialWrite`-ийн тайлбар).
     Дараагийн poll (тэмдэг нь бичилтээс хойш) remote-оор засна. */
  const keep = new Set<string>(writing.keys());
  for (const [k, t] of touched) if (_newerThanSnapshot(t)) keep.add(k);
  for (const k of keep) {
    const loc = cache[k];
    if (loc) s[k] = loc; else delete s[k];
  }
  cache = s;
  remoteLoaded = true;
  saveLocal(s);

  // 3) Урсгалын томилгоо → guitsetgelAcl (динамик — SSR/гогцооноос сэргийлнэ)
  try {
    const acl = await import('./guitsetgelAcl');
    acl._syncRemoteAssigns(remote.flow);
  } catch (e) {
    /* ⚠️ 2026-09-08: урьд нь ХООСОН catch байв. Модуль байхгүй (тест) ба
       синк УНАСАН хоёрыг ялгадаггүй тул ACL бүхэлдээ хуучин утгаараа үлдэхэд
       хаана ч мэдэгдэхгүй байлаа. Алгасах нь зөв (fail-closed кэш хэвээр) ч
       ЧИМЭЭГҮЙ алгасах нь буруу. */
    console.error('[selbe] урсгалын томилгооны синк амжилтгүй:', e);
  }

  // 4) Нэмэлт эрхүүд (`__cap__:`) → caps.ts
  try {
    const caps = await import('./caps');
    /* ⚠️ `trusted` дамжуулна — эрхийн dirty-set-ийн retry/overlay нь ЗӨВХӨН
       хатуу super сешнд (permissions.ts-ийн dirty-тэй ижил үндэслэл). */
    caps._syncRemoteCaps(remote.caps, trusted);
  } catch (e) {
    console.error('[selbe] нэмэлт эрхийн (caps) синк амжилтгүй:', e);
  }

  // 5) Чанарын (QAQC) багцын хуваарилалт (`__qaqc__:`) → qaqcAcl.ts
  //    ⚠️ Урсгалынхаас ТУСДАА — чанарын хяналт нь дөрвөн шатны аль нь ч биш.
  try {
    const q = await import('./qaqcAcl');
    q._syncRemoteQaqc(remote.qaqc);
  } catch (e) {
    console.error('[selbe] QAQC хуваарилалтын синк амжилтгүй:', e);
  }

  // 6) Хуваарийн хуваарилалт (`__huvaari__:`) → huvaariAcl.ts
  //    ⚠️ Урсгалынхаас ТУСДАА — хуваарь нь төлөвлөгөө, гүйцэтгэл биш.
  try {
    const hv = await import('./huvaariAcl');
    hv._syncRemoteHuvaari(remote.huvaari);
  } catch (e) {
    console.error('[selbe] хуваарийн хуваарилалтын синк амжилтгүй:', e);
  }

  // 7) Инженерийн төлөвлөсөн обьёмын хуваарилалт (`__obyem__:`) → obyemAcl.ts
  //    ⚠️ Хуваарийнхаас ТУСДАА — тэр нь огноо, энэ нь обьём төлөвлөнө.
  try {
    const ob = await import('./obyemAcl');
    ob._syncRemoteObyem(remote.obyem);
  } catch (e) {
    console.error('[selbe] обьёмын хуваарилалтын синк амжилтгүй:', e);
  }

  // 8) Чанарын баримтын хуваарилалт (`__chanar__:`) → chanarAcl.ts
  //    ⚠️ QAQC-ийнхаас ТУСДАА — тэр нь ITP бөглөх, энэ нь баримт батлуулах.
  try {
    const ch = await import('./chanarAcl');
    ch._syncRemoteChanar(remote.chanar ?? []);
  } catch (e) {
    console.error('[selbe] чанарын баримтын хуваарилалтын синк амжилтгүй:', e);
  }

  // 9) Нэмэлт ажлын хуваарилалт (`__ajil__:`) → ajilAcl.ts
  //    ⚠️ Обьёмынхоос ТУСДАА — тэр нь БАЙГАА мөрийн хэмжээ, энэ нь мөр
  //       гэрээнд ЕРӨӨС нэмэгдэх эсэх.
  try {
    const aj = await import('./ajilAcl');
    aj._syncRemoteAjil(remote.ajil ?? []);
  } catch (e) {
    console.error('[selbe] нэмэлт ажлын хуваарилалтын синк амжилтгүй:', e);
  }

  // 10) Дэд бүтцийн засварын хуваарилалт (`__butets__:`) → butetsAcl.ts
  //     ⚠️ `butets` эрхийн ХҮРЭЭ — аль багцын давхаргыг засах вэ.
  try {
    const bt = await import('./butetsAcl');
    bt._syncRemoteButets(remote.butets ?? []);
  } catch (e) {
    console.error('[selbe] дэд бүтцийн засварын хуваарилалтын синк амжилтгүй:', e);
  }

  // 11) Эрхийн төрлийн загвар (`__type__:`) → roleTypes.ts (2026-09-25)
  //     ⚠️ Харагдац/нүүр цонх нь үүнээс (`roleAccess`) — синк унавал сүүлийн кэш,
  //        кэшгүй бол `ROLE_ACCESS`-ийн нарийн нөөц (2026-09-25, fail-closed).
  try {
    const rt = await import('./roleTypes');
    rt._syncRemoteTypes(remote.types ?? [], typesMark);
  } catch (e) {
    console.error('[selbe] эрхийн төрлийн загварын синк амжилтгүй:', e);
  }

  notify();
  return true;
}

/** Энэ сешнд remote эрх амжилттай уншигдсан уу — админ панелийн offline тэмдэг */
export const remoteReady = (): boolean => remoteLoaded;

/**
 * ⚠️ ЗӨВХӨН ШАЛГУУРТ (`*.check.mjs`, 2026-09-29 аудит 10): offline орчинд `initRemote`
 *    амжилттай болох замгүй тул override уншилтыг (`resolveBaseAccess` · `roleOf`)
 *    шалгахад remote уншигдсан төлөвийг дуурайна. Аппын кодоос ДУУДАХГҮЙ.
 */
export function _markRemoteLoaded(v = true): void {
  remoteLoaded = v;
}

/** Хатуу тохиргооноос суурь эрх — override байхгүй хэрэглэгчид */
function baseline(username: string): Access | null {
  const role = roleForUser(username);
  if (!role) return null;
  const a = roleAccess(role);
  return { views: a.views, docs: a.docs };
}

/**
 * НЭВТРЭХ ЭРХ (admission) — хэрэглэгч порталд орж чадах уу.
 *
 * ⚠️ `GRANT_ALL`-аас ХАМААРАХГҮЙ: хатуу жагсаалт ЭСВЭЛ панелаас нэмсэн (store)
 * хэрэглэгч л нэвтэрнэ. Аль алинд байхгүй бол `AuthGate` татгалзана.
 *
 * ⚠️ Store-д тулгуурласан нэвтрэлт ЗӨВХӨН `remoteLoaded` үед: localStorage-оо
 * гараар засаад өөрийгөө нэмсэн бүртгэл remote-д байхгүй тул нэвтрэхгүй.
 *
 * ⚠️ Хатуу тохиргооны SUPER нь tombstone-д АВТАХГҮЙ: хуваалцсан хүснэгт org
 * доторхи бичих эрхтэй хэн бүхэнд нээлттэй тул `removed` мөр бичээд бүх
 * админыг түгжих боломжтой байв. Super-ийг хасах цорын ганц зам = код
 * (`ROLE_BY_USER`) өөрчлөх. Панел ч super дээр «Устгах» товч гаргахгүй.
 */
export function hasAccess(username?: string | null): boolean {
  if (!username) return false;
  if (isHardSuper(username)) return true;
  // ⚠️ Тombstone-ыг ХАМГИЙН ТҮРҮҮНД: устгагдсан аккаунт хатуу жагсаалтад
  //    байсан ч нэвтрэхгүй — эс бөгөөс «устгах» нь зөвхөн нүднээс далдлаад
  //    нэвтрэлтэд нөлөөгүй худал аюулгүй байдал болно.
  const ov = loadStore()[username.toLowerCase()];
  if (ov?.removed) return false;
  if (roleForUser(username)) return true;
  return remoteLoaded && !!ov;
}

/*
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): УРСГАЛТАЙ 6 ХАРАГДАЦ (`caps.WORKFLOW_VIEWS` —
 *    Гүйцэтгэл · Хуваарь · Хуваарь батлах · Нэмэлт ажил батлах · Чанарын баримт · Чанар (QAQC))
 *    ЗӨВХӨН ХУВААРИЛАЛТААР нээгдэнэ. Super-ээс бусдад ХАДГАЛАГДСАН `views` дахь (override эсвэл
 *    хатуу үүргийн нөөц `ROLE_ACCESS` — `beginner`-т «Гүйцэтгэл»+«Хуваарь», урсгалын 6 үүрэгт
 *    «Гүйцэтгэл», `chanar`-т «Чанар (QAQC)»+«Чанарын баримт») тэдгээр утгыг ҮЛ ТООЦНО — зөвхөн
 *    `workflowViewsOf` (эрхийн гэр харагдац + урсгалын томилгоо) нээнэ. Урьд нь картаас унтраах
 *    замгүй атлаа хадгалагдсан утга нь хуваарилалт хасагдсан ч хуудсыг нээлттэй үлдээдэг байв
 *    («хасахад хаагдана» дүрэм зөрчигдөнө).
 * ⚠️ SUPER (хатуу эсвэл override үүрэг `super`) ХӨНДӨГДӨХГҮЙ — урьдын зан төлөв.
 * ⚠️ Дараалал = `VIEWS`-ийн дараалал (тогтвортой) — `Root.openEntry` нүүр цонх хүрэхгүй бол
 *    ЭХНИЙ зөвшөөрөгдсөн харагдац руу ордог (2026-10-01-нээс урсгалын хүний нүүр «Гүйцэтгэл»
 *    хуваарилалтгүй бол хаагдах тул тэр нөөц зам ажиллана).
 */
const VIEW_ORDER = new Map<string, number>(VIEWS.map((v, i) => [v.key, i]));

/**
 * ХУВААРИЛАЛТААР БАТАЛГААЖСАН УРСГАЛТАЙ ХАРАГДАЦУУД (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *   · засах эрхийн гэр харагдац (`CAP_HOST_VIEW` ∩ `WORKFLOW_VIEWS`) — эрх нь хуваарилалтаас
 *   · урсгалын шатанд томилогдсон (`stageOfUser`, «Зөвхөн харна» ч) → «Гүйцэтгэл»
 * ⚠️ Хоёр эх сурвалж хоёулаа remote уншигдаагүй сешнд ХООСОН (fail-closed — `capsOf` ·
 *    `guitsetgelAcl.effective`): томилгоо уншигдтал урсгалтай хуудас хаалттай.
 */
export function workflowViewsOf(username?: string | null): ViewKey[] {
  if (!username) return [];
  const out = new Set<ViewKey>(capViewsOf(username).filter(isWorkflowView));
  if (stageOfUser(username)) out.add('guitsetgel');
  return [...out];
}

/**
 * Нэвтэрсэн хэрэглэгчийн эцсийн эрх: override байвал түүнийг, эс бөгөөс хатуу
 * суурийг. Аль нь ч байхгүй бол `null` (нэвтрэх эрхгүй).
 *
 * ⚠️ ЭРХИЙН ХАРАГДАЦЫГ НЭГТГЭНЭ (2026-08-29): «Мөр нэмэх», «QAQC», «Зөвшөөрөл
 * засах», «Санхүү», «Хуваарь» эрхтэй хүнд тухайн эрхийн гэр харагдац
 * (`CAP_HOST_VIEW`) харагдацын жагсаалтад нь байхгүй ч нээгдэнэ. Эс бөгөөс
 * эрх олгосон атлаа хуудас руу орох замгүй — эрх чимээгүй утгагүй.
 * Устгагдсан (tombstone) аккаунтад нөлөөлөхгүй.
 *
 * ⚠️ НЭГ эрх НЭГЭЭС ИЛҮҮ харагдац нээж болно (2026-09-16): `CAP_HOST_VIEW`
 * нь массив болов. Энд кодын засвар шаардахгүй — `capViewsOf` нь
 * `flatMap`-аар аль хэдийн хавтгай `ViewKey[]` буцаана.
 *
 * ⚠️ 2026-10-01: урсгалтай 6 харагдац ЗӨВХӨН хуваарилалтаар — дээрх ⚠️. Super-ээс бусад
 *    `'all'` хадгалалт ч задарч (урсгалтайг хасаад) жагсаалт болно.
 */
export function resolveAccess(username?: string | null): Access | null {
  const base = resolveBaseAccess(username);
  if (!base || !username) return base;
  if (roleOf(username) === 'super') {
    /* ⚠️ Super — урьдын дүрэм: хадгалсан + эрхийн гэр харагдац */
    if (base.views === 'all') return base;
    const extra = capViewsOf(username).filter((v) => !(base.views as ViewKey[]).includes(v));
    return extra.length ? { ...base, views: [...(base.views as ViewKey[]), ...extra] } : base;
  }
  const stored: ViewKey[] = base.views === 'all' ? VIEWS.map((v) => v.key) : base.views;
  const set = new Set<ViewKey>(stored.filter((v) => !isWorkflowView(v)));
  for (const v of capViewsOf(username)) set.add(v);
  for (const v of workflowViewsOf(username)) set.add(v);
  const views = [...set].sort((a, b) => (VIEW_ORDER.get(a) ?? 999) - (VIEW_ORDER.get(b) ?? 999));
  return { ...base, views };
}

/**
 * СУУРЬ эрх — нэмэлт эрхийн (`CAP_HOST_VIEW`) харагдацгүйгээр.
 * ⚠️ Хадгалагдах утга ЭНДЭЭС гарна (`guitsetgelAcl` grant/revoke): `resolveAccess`-ийн
 *    cap-аар нэмэгдсэн харагдацыг override мөрөнд бичвэл эрхийг нь хасахад харагдац
 *    нь үлддэг байв (2026-08-29).
 */
export function resolveBaseAccess(username?: string | null): Access | null {
  if (!username) return null;
  const ov = loadStore()[username.toLowerCase()];
  // Устгагдсан аккаунт — GRANT_ALL ч эрх өгөхгүй. Хатуу super халдашгүй.
  if (ov?.removed) return isHardSuper(username) ? baseline(username) : null;
  // ТҮР: бүх нэвтэрсэн аккаунт бүх эрхтэй
  if (GRANT_ALL) return { views: 'all', docs: true };
  /* ⚠️ 2026-09-29 (аудит 10): FAIL-CLOSED — remote нэг ч удаа уншигдаагүй сешнд override-ыг
     ҮЛ ТООЦНО (`caps.capsOf` · `scopedAcl.effective` · `guitsetgelAcl.effective`-ийн
     2026-09-21-ний ижил дүрэм). `cache` нь эхэндээ localStorage-оос тул хатуу жагсаалтын
     хэрэглэгч `selbe-perms-v1`-д өөртөө `views:'all'` бичээд сүлжээгээ хаавал бүх
     харагдац нээгддэг байв. Tombstone (`removed`) дээр ХЭВЭЭР шалгагдана — тэр нь
     эрхийг зөвхөн ХУМИНА. Дев (`status==='off'`) хэрэглэгчгүй тул энд хүрэхгүй.
     ⚠️ Гэхдээ override-ыг БҮРЭН хаявал эсрэг талдаа НЭЭГДЭНЭ: админ хатуу жагсаалтын
     хүний харагдацыг ХУМЬСАН бол ArcGIS унасан сешнд тэр хүн суурийн ӨРГӨН эрхээ
     буцааж авна. Тиймээс баталгаажаагүй override зөвхөн ХУМЬЖ чадна — суурь ∩ override
     (tombstone-той ижил зарчим: локал утга эрхийг нэмэхгүй, зөвхөн хасна). */
  if (ov && remoteLoaded) return { views: ov.views, docs: ov.docs };
  const base = baseline(username);
  if (!ov || !base) return base;
  const views: Access['views'] = ov.views === 'all'
    ? base.views
    : base.views === 'all' ? ov.views : base.views.filter((v) => (ov.views as ViewKey[]).includes(v));
  return { views, docs: base.docs && ov.docs };
}

/**
 * ХЭРЭГЛЭГЧИЙН ИДЭВХТЭЙ ҮҮРЭГ — override-ын role, эс бөгөөс хатуу тохиргоо.
 *
 * ⚠️ 2026-08-27: урьд нь `AuthGate` зөвхөн `roleForUser` (хатуу жагсаалт)
 * хэрэглэдэг байсан тул панелаас нэмсэн урсгалын аккаунтын `role` нь `null`
 * үлдэж, «Гүйцэтгэлийн хяналт» дээр ШАТ СОНГОГЧ нээлттэй болдог байв — тэр
 * хүн инженер/менежер/ерөнхий шатыг дураараа сольж ӨӨРИЙН ажлаа ӨӨРӨӨ
 * батлах боломжтой. Одоо энэ функц үүргийн ГАНЦ эх сурвалж.
 *
 * ⚠️ 2026-10-06: ПАНЕЛИЙН «super» (override `role:'super'`) нь ЗӨВХӨН
 *    харагдац/нүүр/шат сонголтод нөлөөлнө — БАТЛАХ ХҮРЭЭ БИШ. Батлах урсгалын
 *    хүрээ (`scopedAcl.scope`/`hasRole`, `ajilScope`, `huvaariScope` …) ба
 *    lib-ийн хамгаалалтууд ЗӨВХӨН хатуу super-ийг (`roleForUser`) хязгааргүй
 *    гэж үздэг; панелийн super-т багц хуваарилалт тусад нь хэрэгтэй. Үүнийг
 *    `roleOf`-оор «хязгааргүй» болгож болохгүй — панелийн нэг товчоор бүх
 *    багцын батлах эрх нээгдэнэ. Батлах хуудсууд тийм хэрэглэгчид «хүрээ нь
 *    хуваарилалтаас» гэж ИЛ хэлнэ (`AjilBatlah`).
 */
export function roleOf(username?: string | null): Role | null {
  if (!username) return null;
  const ov = loadStore()[username.toLowerCase()];
  if (ov?.removed) return isHardSuper(username) ? 'super' : null;
  /* ⚠️ 2026-09-29 (аудит 10): remote уншигдаагүй бол override-ын үүргийг үл тооцно —
     `resolveBaseAccess`-ийн тайлбар (localStorage-д өөртөө `role:'super'` бичих зам). */
  return (remoteLoaded ? ov?.role : null) ?? roleForUser(username);
}

/** Панелийн жагсаалт — хатуу тохиргооны бүх хэрэглэгч + override-той шинэ хэрэглэгч */
export function listUsers(): UserPerm[] {
  const store = loadStore();
  const rows = new Map<string, UserPerm>();

  // 1) Хатуу тохиргооны хэрэглэгчид
  for (const [uname, role] of Object.entries(ROLE_BY_USER)) {
    const a = roleAccess(role);
    rows.set(uname.toLowerCase(), {
      username: uname,
      role,
      views: a.views,
      docs: a.docs,
      overridden: false,
    });
  }
  // 2) Override — суурийг дарж бичих, шинэ хэрэглэгч нэмэх; устгагдсан нь нуугдана
  //    (халдашгүй super-ээс бусад нь — түүнд tombstone үйлчлэхгүй тул суурь нь үлдэнэ)
  for (const [uname, ov] of Object.entries(store)) {
    if (ov.removed) {
      if (!isHardSuper(uname)) rows.delete(uname.toLowerCase());
      continue;
    }
    const existing = rows.get(uname.toLowerCase());
    rows.set(uname.toLowerCase(), {
      username: existing?.username ?? uname,
      role: ov.role ?? existing?.role ?? null,
      views: ov.views,
      docs: ov.docs,
      overridden: true,
    });
  }
  return [...rows.values()].sort((a, b) => a.username.localeCompare(b.username));
}

/** УСТГАГДСАН аккаунтууд — панелийн «Буцаах» жагсаалтад (халдашгүй super орохгүй) */
export function listRemoved(): string[] {
  return Object.entries(loadStore())
    .filter(([k, v]) => v.removed && !isHardSuper(k))
    .map(([k]) => k)
    .sort();
}

/**
 * Аккаунтыг УСТГАХ.
 * · Хатуу тохиргоотой (`ROLE_BY_USER`) хэрэглэгч — tombstone бичнэ (жагсаалтаас
 *   нуугдаж, нэвтрэлт нь татгалзагдана; «Буцаах»-аар сэргээгдэнэ).
 * · Панелаас нэмсэн хэрэглэгч — мөрийг бүрмөсөн арилгана (`clearOverride`-той ижил).
 * · Хатуу SUPER — ТАТГАЛЗАНА: код өөрчлөхөөс өөр замаар super хасагдахгүй.
 */
export function removeUser(username: string): Promise<boolean> {
  if (isHardSuper(username)) return Promise.resolve(false);
  const key = username.toLowerCase();
  if (roleForUser(username)) {
    const entry: Entry = { views: [], docs: false, role: null, removed: true };
    const store = { ...loadStore() };
    store[key] = entry;
    saveStore(store);
    /* ⚠️ `serial` — retry ба бусад бичилттэй дараална (2026-09-25); `serialWrite` — агшны тэмдэг (2026-09-29) */
    return serialWrite(key, () => import('./permsRemote')
      .then((m) => m.upsert({ username, role: null, views: [], docs: false, removed: true }))
      .catch(() => false)
      .then((ok) => { trackWrite(key, entry, ok); return ok; }));
  }
  return clearOverride(username);
}

/**
 * Хэрэглэгчийн эрхийг хадгалах (override) — cache + localStorage + ArcGIS хүснэгт.
 * ⚠️ ArcGIS бичилтийн үр дүнг (амжилттай эсэх) promise-оор буцаана — `false`
 * бол өөрчлөлт зөвхөн энэ browser-т үлдсэн гэсэн үг: dirty-set-д тэмдэглэгдэж,
 * дараагийн `initRemote`/`retryDirty` дээр автоматаар дахин бичигдэнэ.
 */
export function setUser(
  username: string, access: Access, role: Role | null = null, baseOf?: UserBase,
): Promise<boolean> {
  const key = username.toLowerCase();
  const entry: Entry = { views: sanitizeViews(access.views), docs: access.docs, role };
  /*
   * ⚠️ 2026-10-05: ЭНЭ ДУУДЛАГЫН ӨӨРЧЛӨЛТ = `entry` − суурь. Суурь нь дуудагчийн өгсөн
   *    (`UserAdmin`-ы ноорог ҮҮСЭХ агшны утга — ноорог хэдэн минут настай байж болно) эсвэл
   *    одоогийн кэш (override, үгүй бол хатуу суурь). Remote-д бичихдээ ШИНЭЭР уншсан мөр
   *    дээр зөвхөн энэ ялгааг давхарлана (`mergeUserDelta`) — доорх ⚠️.
   */
  const prev = loadStore()[key];
  const bl = baseline(username);
  const base: Entry | null = baseOf
    ? { views: sanitizeViews(baseOf.views), docs: baseOf.docs, role: baseOf.role }
    : prev ?? (bl ? { views: bl.views, docs: bl.docs, role: roleForUser(username) } : null);
  const store = { ...loadStore() };
  store[key] = entry;
  saveStore(store);
  /* ⚠️ `serial` — retry ба бусад бичилттэй дараална (2026-09-25); `serialWrite` — агшны тэмдэг (2026-09-29) */
  return serialWrite(key, async () => {
    let out = entry;
    let ok = false;
    try {
      const m = await import('./permsRemote');
      /*
       * ⚠️ 2026-10-05: БИЧИХИЙН ЯГ ӨМНӨ ДАХИН УНШИЖ НЭГТГЭНЭ (`caps.setCaps` · `scopedAcl.pushRow`-ийн
       *    2026-10-04-ний ижил загвар — хэрэглэгчийн мөрд хуулагдаагүй байв). Урьд нь ноорогийн
       *    БҮТЭН `views` жагсаалтыг бичдэг тул хоёр админ нэг хүний харагдацыг зэрэг засахад
       *    сүүлд хадгалсан нь өмнөхийн нээсэн/хаасныг ЧИМЭЭГҮЙ буцаадаг байв. Уншиж чадаагүй
       *    бол БИЧИХГҮЙ (`false` → dirty, «ArcGIS-т хадгалагдсангүй»).
       * ⚠️ Өмнөх бичилт нь УНАСАН (dirty) бол кэш нь баталгаажаагүй ЗОРИЛГО — ялгаа бодох суурь
       *    БИШ; тэр үед урьдын адил бүтнээр нь (`retryDirtyOnce` ч бүтнээр бичдэг).
       */
      if (!(key in loadDirty())) {
        const fresh = await m.userRead(username);
        if (!fresh) { trackWrite(key, entry, false); return false; }
        const fr = fresh.row
          ? sanitizeEntry({
            views: fresh.row.views, docs: fresh.row.docs, role: fresh.row.role,
            ...(fresh.row.removed ? { removed: true } : {}),
          })
          : null;
        /*
         * ⚠️ TOMBSTONE-ЫГ ДАРЖ БИЧИХГҮЙ (fail-closed). Нөгөө админ энэ аккаунтыг ДӨНГӨЖ устгасан
         *    (remote-д `removed`, манай кэш хараахан мэдээгүй) бол жирийн мөрөөр дарвал устгагдсан
         *    хүн дахин нэвтэрнэ — `UserAdmin.saveAll` · `grantFlowAccess` · `applyType`-ийн кэшид
         *    тулгуурласан хамгаалалтын remote хувилбар. Локалд tombstone-ыг тусгаж `false`
         *    буцаана (dirty-д ТЭМДЭГЛЭХГҮЙ — retry tombstone-ыг дарна). Сэргээх зам = «Буцаах».
         *    Хатуу super-т tombstone үйлчилдэггүй (`hasAccess`) тул хамаарахгүй.
         */
        if (fr?.removed && !base?.removed && !isHardSuper(username)) {
          const s = { ...loadStore() };
          s[key] = fr;
          saveStore(s);
          return false;
        }
        out = mergeUserDelta(base, entry, fr);
        /* Нөгөө админы өөрчлөлтийг локал кэшид ч тусгана — дараагийн засвар түүн дээрээс */
        if (ser(out) !== ser(entry)) {
          const s = { ...loadStore() };
          s[key] = out;
          saveStore(s);
        }
      }
      ok = await m.upsert({ username, role: out.role, views: out.views, docs: out.docs });
    } catch {
      ok = false;
    }
    trackWrite(key, out, ok);
    return ok;
  });
}

/** `setUser`-ийн ялгаа бодох суурь — ноорог үүсэх агшны харагдац · баримт · үүрэг */
export type UserBase = { views: ViewKey[] | 'all'; docs: boolean; role: Role | null };

/**
 * ХЭРЭГЛЭГЧИЙН МӨРИЙН ӨӨРЧЛӨЛТИЙГ ШИНЭ УТГА ДЭЭР ДАВХАРЛАНА — цэвэр (2026-10-05).
 * `base` → `next` нь ЭНЭ админы өөрчлөлт; `fresh` нь remote-оос дөнгөж уншсан мөр (`null` = алга).
 *   · Харагдац: `next − base` = нээсэн, `base − next` = хаасан → `fresh` дээр. Гурвын аль нэг нь
 *     `'all'` бол ялгаа тодорхойгүй — `next`-ийг бүтнээр нь (урьдын зан).
 *   · Баримт (`docs`) ба үүрэг (`role`): энэ админ ӨӨРЧИЛСӨН бол `next`-ийнх, үгүй бол `fresh`-ийнх.
 *   · `fresh` алга, эсвэл суурь мэдэгдэхгүй (`base === null`, шинэ аккаунт) бол `next`.
 * ⚠️ Эрхийг `fresh ∪ next`-ээс ХЭТРҮҮЛЭХГҮЙ: гарах харагдац бүр аль нэг админы ил шийдвэр.
 */
export function mergeUserDelta(base: UserBase | null, next: UserBase, fresh: UserBase | null): UserBase {
  if (!fresh || !base) return next;
  let views: ViewKey[] | 'all' = next.views;
  if (next.views !== 'all' && base.views !== 'all' && fresh.views !== 'all') {
    const b = new Set<ViewKey>(base.views);
    const n = new Set<ViewKey>(next.views);
    const out = fresh.views.filter((v) => !(b.has(v) && !n.has(v)));
    for (const v of next.views) if (!b.has(v) && !out.includes(v)) out.push(v);
    views = out;
  }
  return {
    views,
    docs: base.docs === next.docs ? fresh.docs : next.docs,
    role: base.role === next.role ? fresh.role : next.role,
  };
}

/** Override-ыг устгах — cache + localStorage + ArcGIS хүснэгтээс. Үр дүн: setUser-тэй адил. */
export function clearOverride(username: string): Promise<boolean> {
  const key = username.toLowerCase();
  const store = { ...loadStore() };
  delete store[key];
  saveStore(store);
  /* ⚠️ `serial` — retry ба бусад бичилттэй дараална (2026-09-25); `serialWrite` — агшны тэмдэг (2026-09-29) */
  return serialWrite(key, () => import('./permsRemote')
    .then((m) => m.remove(username))
    .catch(() => false)
    .then((ok) => { trackWrite(key, null, ok); return ok; }));
}

/** localStorage/өөр таб дахь өөрчлөлтөд захиалах — цэвэрлэх функц буцаана */
export function subscribe(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== DIRTY_KEY) return;
    // ⚠️ Өөр табын бичилтийг cache-д ЗААВАЛ татна — урьд нь зөвхөн fn()
    //    дуудаад cache хуучнаараа үлдэж, дахин зурсан UI хуучин эрхийг
    //    харуулсаар байв.
    // ⚠️ 2026-10-06: ГЭХДЭЭ ЗӨВХӨН remote уншигдахаас ӨМНӨ. Урьд нь үргэлж
    //    `cache = loadLocal()` хийдэг тул хэрэглэгч өөр табад `selbe-perms-v1`-д
    //    өөртөө `role:'super'`, `views:'all'` гэж ГАРААР бичихэд энэ таб түүнийг
    //    кэшэд авч, `remoteLoaded=true` тул `resolveBaseAccess`/`roleOf` ҮНЭН
    //    гэж итгэдэг байв (`guitsetgelAcl.subscribeAcl`-ийн 2026-09-25-ны ижил
    //    цоорхой). Remote-ын дараа өөр табын ЖИНХЭНЭ өөрчлөлт remote-д бичигддэг
    //    тул `initRemote` (нэвтрэх · polling · visibilitychange) авчирна — энд
    //    зөвхөн дахин зурна.
    if (!remoteLoaded) cache = loadLocal();
    fn();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}
