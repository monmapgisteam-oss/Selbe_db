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
  isCodeSuper,
  BOOTSTRAP_SUPER,
  tableSuperUsers,
  _markTableSuper,
  _setTableSupers,
  type Role,
  type ViewKey,
} from './services';
import { capViewsOf, capsRemoteReady, capsStored, hasCap, isWorkflowView, UNSAFE_KEY } from './caps';
import { NEW_ACCOUNT_ROLE, _typesMark, roleAccess } from './roleTypes';
import { currentUser, requireCap } from './who';
import { _beginRemoteFetch, _newerThanSnapshot, _touchSeq } from './scopedAcl';
/* ⚠️ 2026-10-01: урсгалтай харагдацын эх сурвалж (`workflowViewsOf`). Статик импорт аюулгүй —
   `guitsetgelAcl` энэ файлыг ЗӨВХӨН динамикаар (`await import('./permissions')`) дууддаг. */
import { _setRoleReader, stageOfUser } from './guitsetgelAcl';
import type { SysState } from './permsRemote';

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
/* ⚠️ 2026-10-11 (аудит №7): `revive` — «Буцаах»-ийн устгал (`clearOverride(…, { revive: true })`):
   retry-д remote tombstone олдсон ч устгалыг ҮРГЭЛЖЛҮҮЛНЭ (сэргээх зорилго). Энгийн `e: null`
   («Сэргээх»/`removeUser`) tombstone дээр урьдын адил хаягдана.
   ⚠️ 2026-10-23: `restoreUser`-ийн ЖИРИЙН мөр (`e !== null`) ч `revive`-тэй — урьд нь зөвхөн `null`-д тугтай тул унасан
   сэргээлтийн retry/«Дахин илгээх» remote tombstone-ыг «өөр админ устгасан» гэж үзэж сэргээлтийг ЧИМЭЭГҮЙ хаядаг байв. */
type DirtyItem = { by: string; e: Entry | null; revive?: boolean };
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
/**
 * ⚠️ 2026-10-23 (урагш нийцтэй): ТАНИГДАХГҮЙ үүрэг (шинэ build-ийн шинэ төрөл) — бичихэд хадгална (`setUser`-ийн ⚠️).
 *    Уншилтад хэвээр `null` (fail-closed, `sanitizeEntry`) — зөвхөн хуучирсан клиент түүнийг АРЧИХГҮЙ. Хоосон/танигдах
 *    утга → `null` (тэр нь `out.role`-оор аль хэдийн шийдэгдсэн). `super` ХЭЗЭЭ Ч (VALID_ROLES-д байгаа тул энд хүрэхгүй).
 */
const unknownRole = (raw: string | null): Role | null =>
  raw && raw.trim() && raw.length <= 32 && !VALID_ROLES.has(raw) && !UNSAFE_KEY.has(raw) ? (raw as Role) : null;
const sanitizeEntry = (e: Entry): Entry => ({
  ...e,
  views: sanitizeViews(e.views),
  role: e.role && VALID_ROLES.has(e.role) ? e.role : null,
});

/**
 * Санах ойн CACHE — sync унших цорын ганц эх сурвалж. Эхэндээ `localStorage`-оос
 * (offline/хурдан), нэвтэрсний дараа `initRemote()`-оор ArcGIS хүснэгтээс шинэчлэгдэнэ.
 */
/* ⚠️ 2026-10-09: `UNSAFE_KEY` (prototype pollution-ий түлхүүрүүд) нь `caps.ts`-ээс импортлогдоно —
   `permsRemote.ts`-тэй НЭГ жагсаалт. Статик импорт тул `loadLocal` (модуль ачаалахад) үед бэлэн. */
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
    /* ⚠️ 2026-10-09: `__proto__` · `constructor` · `prototype` түлхүүрийг АЛГАСНА — localStorage-ийг
       гараар засаж `{"__proto__": …}` бичвэл энгийн объект дээр `out[k] = …` нь прототипыг
       солиж, бүртгэлгүй нэрэнд ч «оруулга» харагдах (prototype pollution) боломжтой байв. */
    for (const [k, e] of Object.entries(raw)) if (!UNSAFE_KEY.has(k)) out[k] = sanitizeEntry(e);
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
      /* ⚠️ 2026-10-09: `__proto__` г.м. түлхүүрийг АЛГАСНА (`loadLocal`-ийн ижил дүрэм) */
      if (UNSAFE_KEY.has(k)) continue;
      /* ⚠️ Хуучин хэлбэр (`Entry | null` шууд) — бичсэн хүн тодорхойгүй */
      const item = v && typeof v === 'object' && 'e' in v && 'by' in v
        ? (v as DirtyItem)
        : { by: '', e: (v ?? null) as Entry | null };
      out[k] = {
        by: typeof item.by === 'string' ? item.by : '',
        e: item.e ?? null,
        /* ⚠️ 2026-10-11 (аудит №7): «Буцаах»-ийн зорилго retry хүртэл хадгалагдана (ЗӨВХӨН яг `true`) */
        ...(item.revive === true ? { revive: true } : {}),
      };
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
function trackWrite(key: string, intended: Entry | null, ok: boolean, revive = false): void {
  const d = loadDirty();
  if (ok) {
    mine.delete(key);
    if (!(key in d)) return;
    delete d[key];
  } else {
    /* ⚠️ Бичсэн хүн + ЭНЭ runtime-ийн тэмдэг (`mine`) — автомат retry-ийн шалгуур */
    /* ⚠️ 2026-10-11 (аудит №7): `revive` — «Буцаах»-ийн устгал tombstone-ыг зориуд арилгана (`DirtyItem`) */
    /* ⚠️ 2026-10-23: жирийн мөрийн сэргээлт (`restoreUser`) ч тугтай — `DirtyItem`-ийн ⚠️ */
    d[key] = { by: currentUser() ?? '', e: intended, ...(revive ? { revive: true } : {}) };
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
export function foreignDirty(): { key: string; by: string; role: Role | null }[] {
  return Object.entries(loadDirty())
    .filter(([k, v]) => mine.get(k) !== ser(v.e))
    /* ⚠️ 2026-10-22: `role` — super олголтыг «Дахин синк» илгээхгүй тул `UserAdmin` анхааруулна (`retryDirtyOnce`) */
    .map(([key, v]) => ({ key, by: v.by, role: v.e && !v.e.removed ? v.e.role ?? null : null }));
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function loadStore(): Store {
  return cache;
}

/** Кэшийн super мөрүүд (устгагдаагүй `role:'super'`) — `roles._setTableSupers`-д (⚠️ 2026-10-21) */
const supersIn = (s: Store): string[] =>
  Object.entries(s).filter(([, r]) => r && !r.removed && r.role === 'super').map(([u]) => u);

function saveStore(s: Store): void {
  cache = s;
  saveLocal(s);
  notify();
}

/**
 * SUPER эсэх — tombstone-д автдаггүй (доорх тайлбар).
 * ⚠️ 2026-10-21 (хэрэглэгчийн шийдвэр): кодын хатуу super ХАСАГДСАН — `roleForUser` одоо ЭРХИЙН ХҮСНЭГТИЙН `role:'super'`
 *    мөрөөс (`roles._setTableSupers`, `initRemoteInner` тавина). Доорх «хатуу super» тайлбарууд энэ утгаар (кодын +
 *    хүснэгтийн super) уншигдана; ЗӨВХӨН КОДЫН (тестийн) super-т хамаарах газар `isCodeSuper`.
 */
const isHardSuper = (username: string): boolean => roleForUser(username) === 'super';

/**
 * Нэвтэрсэн хэрэглэгч ЗӨВХӨН АНХНЫ АДМИНААР super (`roles.BOOTSTRAP_SUPER` — хүснэгт уншигдсан, super мөргүй) бол
 * түүний түлхүүр, үгүй бол `null` — `setUser`-ийн «өөрийн мөрөө эхэлж бич» дүрэмд (⚠️ 2026-10-21).
 */
const bootstrapOnlySuper = (): string | null => {
  const me = (currentUser() ?? '').trim().toLowerCase();
  if (!me || me !== BOOTSTRAP_SUPER.toLowerCase()) return null;
  const sup = tableSuperUsers();
  return sup && sup.length === 0 ? me : null;
};

/**
 * Dirty тэмдгийг арилгана — ЗӨВХӨН утга нь хэвээр (`want`) бол (хооронд нь шинэ бичилт орсон бол
 * тэр нь өөрөө тэмдэглэгдэнэ). ⚠️ 2026-10-09 (аудит №6): remote-д tombstone олдоход retry ба
 * `setUser` хоёулаа энэ замаар хаяна — `mine`-ээс ч хасна, эс бөгөөс `mineDirty()` давхарлана.
 */
function dropDirty(key: string, want: string): void {
  const now = loadDirty();
  if (now[key] && ser(now[key].e) === want) {
    delete now[key];
    saveDirty(now);
  }
  if (mine.get(key) === want) mine.delete(key);
}

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
      /*
       * ⚠️ 2026-10-09 (аудит №6): TOMBSTONE-ЫГ ДАРЖ БИЧИХГҮЙ — `setUser`-ийн 2026-10-05-ны
       *    хамгаалалт энд ХУУЛАГДААГҮЙ байв. А админ сүлжээгүй үед X-ийг засав (dirty) → Б админ
       *    X-ийг устгав (remote-д `removed`) → А-гийн дараагийн poll энэ retry-ээр dirty мөрийг
       *    бүтнээр бичиж tombstone-ыг арчдаг — устгагдсан хүн ДАХИН нэвтэрнэ. Одоо бичихийн
       *    өмнө мөрийг шинээр уншина: remote-д tombstone, зорьсон нь tombstone биш бол БИЧИХГҮЙ,
       *    dirty-г арилгаж (retry дахин оролдохгүй), локалд tombstone-ыг тусгана (`done`-оор
       *    кэшид). Уншиж чадаагүй бол dirty хэвээр (fail-closed). Хатуу super-т tombstone
       *    үйлчилдэггүй (`hasAccess`) тул уншилт алгасна.
       * ⚠️ 2026-10-11 (аудит №7): «Буцаах»-ийн устгал (`item.revive`, `e === null`) нь tombstone-ыг
       *    ЗОРИУД арилгах тул уншилтыг алгасаж үргэлжлүүлнэ — урьд нь `null` бүгд адилхан хаягдаж
       *    сүлжээгүй дарсан «Буцаах» хэзээ ч биелэхгүй байв. Энгийн `null` урьдын адил хаягдана.
       */
      /* ⚠️ 2026-10-22 (аудит №4): ЭНЭ runtime-д үүсээгүй `role:'super'` мөрийг «Дахин синк» БИЧИХГҮЙ. Dirty-set нь
         localStorage-д (browser-ийн бүх аккаунтад хуваалцсан) тул гараар тарьсан мөр батлах цонхонд зөвхөн `нэр (бичсэн хүн)`
         гэж харагдаад (бичсэн хүн нь хуурамч байж болно) super-ийн токеноор бичигдэж БҮРЭН super болдог байв (10-21-ээс өмнө
         ийм мөр зөвхөн харагдац дардаг). Тэмдгийг хаяна — жинхэнэ олголт бол самбараас дахин олгоно (`UserAdmin` анхааруулна). */
      if (e && e.role === 'super' && !e.removed && mine.get(key) !== want) {
        dropDirty(key, want);
        console.warn(`[selbe] «${key}»: өмнөх сешний super олголтыг илгээсэнгүй — шаардлагатай бол самбараас дахин олгоно уу`);
        return;
      }
      /* ⚠️ 2026-10-23: `restoreUser`-ийн жирийн мөр ч (`e !== null`) — tombstone-ыг ЗОРИУД дарна (`DirtyItem`-ийн ⚠️) */
      const revive = item.revive === true && !e?.removed;
      /* ⚠️ 2026-10-21: зөвхөн КОДЫН super-т tombstone үйлчлэхгүй — хүснэгтийн super-ийн мөр энгийн мөр */
      /* ⚠️ 2026-10-23 (урагш нийцтэй): remote-ын танигдахгүй үүргийг хадгална (`unknownRole`-ийн ⚠️) */
      let rawRole: string | null = null;
      if (!e?.removed && !revive && !isCodeSuper(key)) {
        let fresh: Awaited<ReturnType<typeof m.userRead>> = null;
        try { fresh = await m.userRead(key); } catch { fresh = null; }
        if (!fresh) return; // уншиж чадсангүй — dirty хэвээр, дараагийн retry
        rawRole = typeof fresh.row?.role === 'string' ? fresh.row.role : null;
        if (fresh.row?.removed) {
          dropDirty(key, want);
          done[key] = sanitizeEntry({ views: [], docs: false, role: null, removed: true });
          console.warn(`[selbe] «${key}» remote-д устгагдсан — хүлээгдэж буй локал засварыг хаяв (tombstone хэвээр)`);
          return;
        }
      }
      let ok = false;
      try {
        ok = e === null
          ? await m.remove(key)
          : await m.upsert({ username: key, role: e.role ?? (e.removed ? null : unknownRole(rawRole)), views: e.views, docs: e.docs, removed: e.removed });
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
      /* ⚠️ 2026-10-22: бичигдсэн утгын super төлөв (`setUser`-ийн ижил дүрэм — олголт зөвхөн амжилтын дараа) */
      _markTableSuper(key, !!e && e.role === 'super' && !e.removed);
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
  /* ⚠️ 2026-10-19 (аудит): алгассан (эвдэрсэн) мөрүүд — админы тоймд (`remoteMalformed`) */
  malformedRows = remote.malformed ?? [];

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
  /* ⚠️ 2026-10-23: БАТАЛГААЖСАН төлөв (remote + амжилттай retry) — super-ийн жагсаалт ЗӨВХӨН эндээс (доорх ⚠️) */
  const conf: Store = { ...s };
  const dirtyNow = trusted ? mineDirty() : {};
  if (trusted) {
    for (const [k, intended] of Object.entries(dirtyNow)) {
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
  /* ⚠️ 2026-10-21: SUPER = эрхийн хүснэгтийн `role:'super'` мөр (устгагдаагүй) — `roles._setTableSupers`-ийн ⚠️.
     Уншилт бүрд дахин тавина (өөр админ super олгосон/хассан бол 5 минутын poll-д хүрнэ).
     ⚠️ 2026-10-23: давхарласан `s`-ээс БИШ, баталгаажсан `conf`-оос — унасан (`mineDirty`) эсвэл явж буй (`keep`) super олголт
     хүснэгтийн super болж тоологдвол анхны админ (`bootstrapOnlySuper`) өөрийн мөрийг бичихээ алгасаж, дахин ачаалахад
     түгжигддэг байв (`setUser`-ийн 2026-10-22 ⚠️: олголт ЗӨВХӨН амжилттай бичилтийн дараа). Хасалт шууд тусна. */
  const prevSup = tableSuperUsers();
  const sup = new Set(supersIn(conf));
  for (const [k, intended] of Object.entries(dirtyNow)) {
    if (!intended || intended.role !== 'super' || intended.removed) sup.delete(k);
  }
  if (prevSup) {
    /* явж буй / snapshot-ын дараах түлхүүр — `setUser` · retry-гийн тавьсан тэмдгийг хадгална */
    const prev = new Set(prevSup);
    for (const k of keep) { if (prev.has(k)) sup.add(k); else sup.delete(k); }
  }
  _setTableSupers(sup);
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

  // 5) ⚠️ 2026-10-23: Чанарын (QAQC) хуваарилалт (`__qaqc__:`) ХАСАГДСАН — «Чанар (QAQC)» системээс устсан.

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

  // 11б) ⚠️ 2026-10-26: «Хуваарь харах» хүрээний уншигч (`_setHuvaariViewReader`) — модуль ачаалагдахдаа бүртгэнэ.
  //      ACL-ууд (6–10) ба загвар (11) синклэгдсэний ДАРАА — эс бөгөөс хоосон хүрээгээр «Хуваарь» хаалттай үлдэнэ (fail-closed).
  try {
    await import('./huvaariView');
  } catch (e) {
    console.error('[selbe] хуваарь харах хүрээний модуль ачаалагдсангүй:', e);
  }

  // 12) «Систем түр хаах» төлөв (`__sys__:maintenance`, ⚠️ 2026-10-19)
  //     ⚠️ ЗӨВХӨН амжилттай уншилтад шинэчлэгдэнэ — уншилт унавал (дээрх `!remote` эрт буцалт) СҮҮЛИЙН
  //        мэдэгдэж буй төлөв хэвээр (fail-open: ArcGIS-ийн түр саатал бүх хүнийг гаргахгүй, хаалттай байсныг ч
  //        дураар нээхгүй). Агуулга ижил бол хуучин объект — `useSyncExternalStore`-ийн агшин тогтвортой.
  _syncRemoteSys(remote.sys ?? null);

  notify();
  return true;
}

/** Энэ сешнд remote эрх амжилттай уншигдсан уу — админ панелийн offline тэмдэг */
export const remoteReady = (): boolean => remoteLoaded;

/**
 * ЭРХИЙН ХҮСНЭГТИЙН ЗАДЛАГДААГҮЙ МӨРҮҮД (2026-10-19, аудит) — сүүлийн амжилттай `initRemote`-ийн.
 * ⚠️ Тэдгээр нь эрх НЭЭГЭЭГҮЙ (fail-closed, алгассан) — энэ нь зөвхөн админд «цэвэрлэ» гэж хэлэх жагсаалт
 *    (`ErhOverview`). Урьд нь чимээгүй алгасдаг тул «томилсон атлаа ажиллахгүй» шалтгаан хаана ч харагдахгүй байв.
 */
let malformedRows: import('./permsRemote').MalformedRow[] = [];
export const remoteMalformed = (): readonly import('./permsRemote').MalformedRow[] => malformedRows;

/* ═══════════════ СИСТЕМ ТҮР ХААХ (maintenance) — ⚠️ 2026-10-19 ═══════════════
 * Нийслэлийн дата төв рүү шилжих үед порталыг түр хаана. Төлөв нь эрхийн хүснэгтийн `__sys__:maintenance`
 * мөрөнд (байгууллагад хуваалцсан, статик сайт сервергүй) — `initRemote` бүрд (нэвтрэх · 5 мин · таб идэвхжих ·
 * хаалттай хэрэглэгчид 30 с) уншигдана.
 * ⚠️ Хаалттай үед ЗӨВХӨН `sysClose` эрхтэй аккаунт ба кодын super нэвтэрнэ (`canBypassClosed`); бусдад
 *    `AuthGate` бүтэн дэлгэцийн «Систем түр хаагдсан» цонх гаргаж `who`-г хоосолно (lib бичилт татгалзана).
 * ⚠️ Клиент талын хаалт (05 §1-ийн ⚠️, `acl-client-only` хүлээн зөвшөөрсөн) — ArcGIS-ийн токен хүчинтэй хэвээр.
 * ⚠️ localStorage-д КЭШЛЭХГҮЙ: дахин ачаалахад төлөв зөвхөн remote-оос — уншилт унавал нээлттэй (fail-open).
 */
let sysState: SysState | null = null;

const sysSig = (x: SysState | null): string => (x ? JSON.stringify([x.on, x.note ?? '', x.until ?? '', x.by, x.at]) : '');

/** Remote-оос уншсан төлөвийг тусгана — `initRemoteInner` ба шалгуур (`*.check.mjs`) */
export function _syncRemoteSys(next: SysState | null): void {
  if (sysSig(next) === sysSig(sysState)) return;
  sysState = next;
}

/** Систем ХААЛТТАЙ бол төлөв (хэн · хэзээ · тайлбар · дахин нээгдэх), эс бөгөөс `null` */
export const systemClosed = (): SysState | null => (sysState?.on ? sysState : null);

/**
 * Хаалттай үед нэвтэрч чадах уу — кодын super ЭСВЭЛ `sysClose` эрхтэй.
 * ⚠️ `hasCap` нь remote эрх уншигдаагүй сешнд ХООСОН (fail-closed) — гэхдээ хаалтын төлөв ч зөвхөн тэр уншилтаас
 *    ирдэг тул «хаалттай атлаа эрх уншигдаагүй» төлөв зөвхөн caps-ийн синк унасан үед; тэр үед super нэвтэрнэ.
 */
export function canBypassClosed(username?: string | null): boolean {
  if (!username) return false;
  if (isHardSuper(username) || hasCap(username, 'sysClose')) return true;
  /*
   * ⚠️ 2026-10-19 (аудит): CAPS-ИЙН СИНК УНАСАН атлаа `__sys__` мөр уншигдсан (нэг уншилт — `initRemoteInner`-ийн
   *    алхам 4 шидсэн: chunk ачаалагдаагүй г.м.) бол `hasCap` ХООСОН (fail-closed) тул `sysClose` эзэмшигч
   *    ӨӨРИЙНХӨӨ хаасан системд түгжигдэж, нээх ч замгүй болдог байв. Энэ сешнд caps НЭГ Ч удаа уншигдаагүй үед
   *    л СҮҮЛИЙН АМЖИЛТТАЙ синкийн кэшийг (`caps.capsStored` — `selbe-caps-v1`) хаалтыг давахад тооцно.
   *    ⚠️ Зөвхөн ЭНЭ шийдвэрт (хаалтыг давах); бичих зам (`requireCap`) fail-closed хэвээр — хаах/нээх бичилт
   *    caps уншигдмагц л. Клиент талын хаалт (`acl-client-only` хүлээн зөвшөөрсөн) тул кэшийг гараар засах эрсдэл
   *    нь хаалтын тойргоос хэтрэхгүй.
   */
  return !capsRemoteReady() && capsStored(username).includes('sysClose');
}

/** ЭНЭ хэрэглэгчид систем хаалттай бол төлөв (`AuthGate` блоклоно), эс бөгөөс `null` */
export const closedFor = (username?: string | null): SysState | null =>
  (systemClosed() && !canBypassClosed(username) ? systemClosed() : null);

/**
 * СИСТЕМИЙГ ХААХ / НЭЭХ — `sysClose` эрхтэй эсвэл кодын super (`who.requireCap` — super бүх эрхтэй).
 * ⚠️ Эрхгүй бол ШИДНЭ (дуудагч алдааг ил харуулна). Бичээд ДАХИН УНШИЖ батална — `upsertByKey` ArcGIS-ийн
 *    200-аар ирдэг алдааг аль хэдийн барьдаг ч «хадгалсан» гэж худал мэдээлэхгүйн тулд эцсийн утгыг харна.
 * ⚠️ Уншилт унавал (бичилт бүтсэн) бичсэн утгыг локалд тусгана — дараагийн poll засна.
 * @returns ArcGIS-т бичигдэж, уншигдсан утга `on`-той таарсан эсэх (шалтгаан — `permsRemote.takeWriteError`)
 */
/**
 * ⚠️ 2026-10-19 (аудит): ХУУЧИРСАН ТӨЛӨВ ДЭЭР СОХОР БИЧИЛТ — удирдлагын цонх нээгдэх үеийн (эсвэл 5 мин-ийн
 *    poll-ын) төлөв дээр «Нээх»/«Шинэчлэх» дардаг тул завсарт өөр эзэмшигч нээсэн системийг «Тайлбар, хугацааг
 *    шинэчлэх» нь ДАХИН ХААДАГ (on→on), эсвэл хоёр дахь «Хаах» нь эхнийхийн тайлбарыг дардаг байв. `expect`
 *    (цонхонд харагдсан төлөв, `systemClosed()`-ийн хэлбэр — нээлттэй = `null`) өгвөл бичихийн ЯГ ӨМНӨ
 *    `sysRead`-ээр дахин уншиж, зөрвөл шинэ төлөвийг тусгаад `SysStaleError` шиднэ (юу ч бичихгүй).
 *    `update: true` (тайлбар/хугацааг шинэчлэх) нь шинэ төлөв ХААЛТТАЙ байхыг ч шаардана.
 */
export class SysStaleError extends Error {
  constructor(readonly fresh: SysState | null) {
    super('sys-stale');
    this.name = 'SysStaleError';
  }
}

/** Хаалттай төлөвийн гарын үсэг — `on: false` мөр = нээлттэй (`null`)-тэй ижил */
const closedSig = (x: SysState | null | undefined): string => sysSig(x?.on ? x : null);

/**
 * «Систем түр хаах» төлөвийг ОДОО дахин уншина (⚠️ 2026-10-19 — удирдлагын цонх нээгдэхэд).
 * @returns шинэ төлөв (`systemClosed()`-ийн хэлбэр), уншиж чадаагүй бол `undefined` (сүүлийн мэдэгдэж буй хэвээр)
 */
export async function refreshSystemClosed(): Promise<SysState | null | undefined> {
  const { sysRead } = await import('./permsRemote');
  const r = await sysRead();
  if (!r) return undefined;
  _syncRemoteSys(r.state);
  notify();
  return systemClosed();
}

export async function setSystemClosed(
  on: boolean, note = '', until = '', opts?: { expect?: SysState | null; update?: boolean },
): Promise<boolean> {
  requireCap('sysClose');
  const n = note.trim().slice(0, 500);
  const u = until.trim().slice(0, 100);
  const st: SysState = {
    on,
    ...(on && n ? { note: n } : {}),
    ...(on && u ? { until: u } : {}),
    by: currentUser() ?? '',
    at: Date.now(),
  };
  const { sysRead, sysUpsert } = await import('./permsRemote');
  if (opts && 'expect' in opts) {
    /* ⚠️ Уншиж чадаагүй бол БИЧИХГҮЙ — төлөвийг батлахгүйгээр сохор бичилт хийхгүй (дуудагч алдааг харуулна) */
    const fresh = await sysRead();
    if (!fresh) return false;
    if (closedSig(fresh.state) !== closedSig(opts.expect) || (opts.update && !fresh.state?.on)) {
      _syncRemoteSys(fresh.state);
      notify();
      throw new SysStaleError(systemClosed());
    }
  }
  if (!(await sysUpsert(st))) return false;
  const back = await sysRead();
  _syncRemoteSys(back ? back.state : st);
  notify();
  return (systemClosed() != null) === on;
}

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
  const ov = loadStore()[username.trim().toLowerCase()];
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
 * ⚠️ SUPER ХӨНДӨГДӨХГҮЙ — урьдын зан төлөв. 2026-10-19 (аудит): зөвхөн КОДЫН хатуу super; панелийн хуучин
 *    `role:'super'` override мөр энгийн хэрэглэгчийн дүрмээр (`resolveAccess`-ийн ⚠️).
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
/**
 * «ХУВААРЬ ХАРАХ» УНШИГЧ (⚠️ 2026-10-26) — `huvaariView.ts` ачаалагдахдаа бүртгэнэ (`_setRoleReader`-ийн загвар).
 * ⚠️ ЯАГААД СТАТИК ИМПОРТ БИШ: тэр модуль `huvaariAcl` (→ `permsRemote`, `permissions`) · `ajilAcl` · `obyemAcl` ·
 *    `butetsAcl`-ийг уншдаг — энэ файл ACL-уудыг ЗӨВХӨН динамикаар ачаалдаг (`initRemote`) тул тойрог импорт үүсгэхгүй.
 */
let hvViewReader: ((user: string) => boolean) | null = null;
export function _setHuvaariViewReader(f: (user: string) => boolean): void { hvViewReader = f; }

export function workflowViewsOf(username?: string | null): ViewKey[] {
  if (!username) return [];
  const out = new Set<ViewKey>(capViewsOf(username).filter(isWorkflowView));
  if (stageOfUser(username)) out.add('guitsetgel');
  /* ⚠️ 2026-10-23: «Ерөнхий захирал» (`zahiral`) — «Гүйцэтгэл»-ийг томилгоогүйгээр ЗӨВХӨН ХАРАНА (бүх багц, бүх шат —
     `guitsetgelAcl.resolveFlowStage` → `viewAll`, `canReview: false`). `roleOf` нь remote уншигдаагүй бол override-ын
     үүргийг үл тооцдог тул fail-closed хэвээр. */
  if (roleOf(username) === 'zahiral') out.add('guitsetgel');
  /* ⚠️ 2026-10-26 (хэрэглэгч): «ХУВААРЬ ХАРАХ» ХҮРЭЭ (төрлийн «Бүх/Өөрийн багц» ∪ зохиогч · батлагчийн багц —
     `huvaariView.huvaariViewScope`) хоосон биш бол «Хуваарь» ЗӨВХӨН ХАРАХ-аар нээгдэнэ. Засах/илгээх/батлах нь `huvaariScope`-оор
     хэвээр хаалттай (`Huvaari.canEditRole` · `canApprove`, lib-ийн `submitPlan` · `decidePlan`). Уншигч бүртгэгдээгүй (ACL
     уншигдаагүй) бол хаалттай — fail-closed (`_setHuvaariViewReader`). */
  if (hvViewReader?.(username)) out.add('huvaari');
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
  /* ⚠️ 2026-10-19 (аудит): ЗӨВХӨН КОДЫН хатуу super (`isHardSuper`) — `roleOf` БИШ. Панелийн super 2026-10-15-нөөс
     олгогдохгүй; урьд нь хуучин `role:'super'` override мөртэй аккаунт энэ салаагаар хадгалсан `'all'`-аа БҮТНЭЭР
     (урсгалтай 7 харагдацтай нь) авч, «урсгалтай харагдац зөвхөн хуваарилалтаар» дүрмийг тойрдог байв. Тийм мөр
     одоо доорх энгийн замаар (хадгалсан урсгалгүй харагдац + эрх/томилгоо). Хатуу super-ийн суурь үргэлж `'all'`. */
  if (isHardSuper(username)) {
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
  const ov = loadStore()[username.trim().toLowerCase()];
  // Устгагдсан аккаунт — GRANT_ALL ч эрх өгөхгүй. Хатуу super халдашгүй.
  if (ov?.removed) return isHardSuper(username) ? baseline(username) : null;
  /* ⚠️ 2026-10-12 (super жигд биш): ХАТУУ super-т override ҮЛ ТООЦНО — үргэлж суурь ('all' · docs).
     Урьд нь панелаас super-ийн харагдацыг хөндсөн (эсвэл хуучин мөр) бол `ov.views`/`ov.docs`
     буцаж, super бүр өөр өөр тоотой харагддаг (Root нь nav-д 'all' гэж албаддаг ч самбарын
     унтраалга/тоолуур, ТЭЗҮ-БОНУ `docs`, `erhOverview` зөрдөг) байв. Super = код
     (`ROLE_BY_USER`); панелийн мөр нь зөвхөн хумих/нэмэх эрхгүй үлдэгдэл. */
  if (isHardSuper(username)) return baseline(username);
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
  /* ⚠️ 2026-10-12 (super жигд биш): хатуу super-ийн override `role` ҮЛ ТООЦНО. 2026-09-30-аас өмнө
     мөрийн сонгогч super-т `injener` г.м. бичдэг байсан тул тийм хуучин мөртэй super нь
     «Эрхийн төрөл»-ийн тоололд өөр баганад, Гүйцэтгэлийн «Нэгтгэл» табгүй, `resolveAccess`-д
     урсгалтай харагдац нь хасагддаг — бусад super-ээс зөрдөг байв. */
  if (isHardSuper(username)) return 'super';
  const ov = loadStore()[username.trim().toLowerCase()];
  if (ov?.removed) return null;
  /* ⚠️ 2026-09-29 (аудит 10): remote уншигдаагүй бол override-ын үүргийг үл тооцно —
     `resolveBaseAccess`-ийн тайлбар (localStorage-д өөртөө `role:'super'` бичих зам). */
  return (remoteLoaded ? ov?.role : null) ?? roleForUser(username);
}
/* ⚠️ 2026-10-23: `guitsetgelAcl.setAssign` «Ерөнхий захирал»-ыг СИНХРОН татгалзана — тойрог импортгүйгээр уншигч бүртгэнэ */
_setRoleReader(roleOf);

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
    /* ⚠️ 2026-10-12 (super жигд биш): хатуу super-ийн override мөр самбарт ч ҮЛ ТООЦОГДОНО —
       мөр нь суурь ('all' · docs · super) хэвээр, `overridden: false` («Сэргээх» ч гарахгүй: мөр нь
       `resolveBaseAccess`/`roleOf`-д үйлчлэхгүй үлдэгдэл). Урьд нь хуучин мөртэй super нь өөр
       үүрэг/цөөн харагдацтай гэж харагдаж, супер бүр өөр өөр байв. */
    if (isCodeSuper(uname)) continue;
    /* ⚠️ 2026-10-21: ХҮСНЭГТИЙН super — мөр нь өөрөө эрхийн эх; самбарт 'all' · docs · super, «Сэргээх»-гүй
       (`overridden: false`), харин үүрэг/устгалт нь ӨӨР super админд нээлттэй (`roleTypeApply.applyType`-ийн дүрэм). */
    if (roleForUser(uname) === 'super') {
      rows.set(uname.toLowerCase(), { username: uname, role: 'super', views: 'all', docs: true, overridden: false });
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
  /* ⚠️ 2026-10-21 (аудит): ИДЭВХТЭЙ АНХНЫ АДМИН (`roles.BOOTSTRAP_SUPER` — хүснэгтэд super мөргүй үед) мөргүй тул самбарт
     огт гардаггүй байв: «Төрлөөр тохируулах»-аар өөрийгөө бүртгэх гэвэл `roleTypeApply.applyType` «устгагдсан аккаунт»
     гэж худал татгалзана, `aclOps.isKnown` ч танихгүй. Синтетик super мөр (`overridden: false`, «Сэргээх»-гүй). */
  const boot = BOOTSTRAP_SUPER.toLowerCase();
  if (!rows.has(boot) && roleForUser(boot) === 'super') {
    rows.set(boot, { username: boot, role: 'super', views: 'all', docs: true, overridden: false });
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
 * Аккаунтыг УСТГАХ — tombstone бичнэ (жагсаалтаас нуугдаж, нэвтрэлт нь татгалзагдана; «Буцаах»-аар
 * сэргээгдэнэ — `restoreUser`). ⚠️ 2026-10-23: панелаас нэмсэн ба хүснэгтийн super-т ч tombstone (доорх ⚠️).
 * · Кодын (тестийн) SUPER — ТАТГАЛЗАНА; өөрийн super-ийг өөрөө устгахгүй.
 */
export function removeUser(username: string): Promise<boolean> {
  /* ⚠️ 2026-10-21: КОДЫН (тестийн) super л халдашгүй; ХҮСНЭГТИЙН super-ийн мөрийг өөр super админ арилгана
     (`clearOverride` — панелаас нэмсэн аккаунттай ижил), харин ӨӨРИЙН super-ийг өөрөө хасахгүй (сүүлчийн админ
     түгжигдэхээс сэргийлнэ — `roleTypeApply.applyType`-ийн ижил дүрэм). */
  if (isCodeSuper(username)) return Promise.resolve(false);
  /* ⚠️ 2026-10-19 (аудит): trim + жижиг үсэг — `permsRemote.fetchAll`/`upsert`-тэй НЭГ түлхүүр */
  const key = username.trim().toLowerCase();
  const role = roleForUser(username);
  if (role === 'super' && key === (currentUser() ?? '').trim().toLowerCase()) return Promise.resolve(false);
  /*
   * ⚠️ 2026-10-23 (хэрэглэгч: «бүгдийг зас»): КОДЫН super-ээс БУСАД БҮХ аккаунтад TOMBSTONE бичнэ. Урьд нь зөвхөн
   *    `ROLE_BY_USER`-ийн (production-д ХООСОН) энгийн хэрэглэгчид tombstone бичиж, панелаас нэмсэн аккаунт ба хүснэгтийн
   *    super-ийн мөрийг бүрмөсөн УСТГАДАГ (`clearOverride`) байв — мөр алга тул хуучин ноорог · `grantFlowAccess` ·
   *    «Дахин илгээх» (dirty retry) тэр нэрийг ЖИРИЙН мөрөөр дахин үүсгэж устгагдсан хүнийг амилуулдаг, «Устгагдсан
   *    аккаунтууд / Буцаах» жагсаалтад ч гардаггүй байв. Tombstone дээр бүх бичих зам аль хэдийн татгалздаг.
   * ⚠️ Өмнөх ЭРХИЙН ТӨРЛИЙГ (super-ээс бусад) tombstone-д хадгална — «Буцаах» (`restoreUser`) түүгээр сэргээнэ. Super
   *    хэзээ ч хадгалагдахгүй (устгагдсан super «Буцаах»-аар super болж буцахгүй); `supersIn` · `roleOf` · `hasAccess`
   *    `removed` мөрийн үүргийг үл тооцно.
   */
  const prevRole = roleOf(username);
  const keepRole: Role | null = prevRole && prevRole !== 'super' ? prevRole : null;
  const entry: Entry = { views: [], docs: false, role: keepRole, removed: true };
  const store = { ...loadStore() };
  store[key] = entry;
  saveStore(store);
  _markTableSuper(key, false);
  /* ⚠️ `serial` — retry ба бусад бичилттэй дараална (2026-09-25); `serialWrite` — агшны тэмдэг (2026-09-29) */
  return serialWrite(key, () => import('./permsRemote')
    .then((m) => m.upsert({ username, role: keepRole, views: [], docs: false, removed: true }))
    .catch(() => false)
    .then((ok) => { trackWrite(key, entry, ok); return ok; }));
}

/**
 * УСТГАГДСАН АККАУНТЫГ СЭРГЭЭХ — «Устгагдсан аккаунтууд / Буцаах» (⚠️ 2026-10-23).
 * · Кодын суурьтай (`ROLE_BY_USER`, зөвхөн тест) — tombstone-ыг арилгана (`clearOverride(revive)`), суурь эрх буцна.
 * · Бусад (панелаас нэмсэн · хуучин хүснэгтийн super) — tombstone-ын оронд ЖИРИЙН мөр бичнэ: tombstone-д хадгалсан
 *   төрөл (байхгүй бол шинэ аккаунтын төрөл `NEW_ACCOUNT_ROLE`) ба тэр төрлийн загварын (урсгалгүй) харагдац.
 *   ⚠️ Урьд нь «Буцаах» зөвхөн мөрийг устгадаг тул панелаас нэмсэн аккаунт мөргүй үлдэж НЭВТЭРЧ ЧАДАХГҮЙ байв.
 *   ⚠️ Super хэзээ ч сэргэхгүй; хуваарилалт · засах эрх устгахад арилсан тул дахин олгоно.
 *   ⚠️ `setUser` нь локалд tombstone байгааг (`base.removed`) мэдэж байж л мөрийг дарна — энэ ил үйлдэл.
 */
export async function restoreUser(username: string): Promise<boolean> {
  const key = username.trim().toLowerCase();
  if (!key || isCodeSuper(key)) return false;
  const tomb = loadStore()[key];
  if (Object.hasOwn(ROLE_BY_USER, key)) return clearOverride(username, { revive: true });
  const kept = tomb?.removed && tomb.role && tomb.role !== 'super' && VALID_ROLES.has(tomb.role) ? tomb.role : null;
  const role: Role = kept ?? NEW_ACCOUNT_ROLE;
  const a = roleAccess(role);
  const views: ViewKey[] = (a.views === 'all' ? VIEWS.map((v) => v.key) : a.views).filter((v) => !isWorkflowView(v));
  /* ⚠️ 2026-10-23: `revive` — унасан бичилтийн dirty тэмдэг сэргээх зорилгыг хадгална (`DirtyItem`-ийн ⚠️) */
  return setUser(username, { views, docs: a.docs }, role, undefined, { revive: true });
}

/**
 * Хэрэглэгчийн эрхийг хадгалах (override) — cache + localStorage + ArcGIS хүснэгт.
 * ⚠️ ArcGIS бичилтийн үр дүнг (амжилттай эсэх) promise-оор буцаана — `false`
 * бол өөрчлөлт зөвхөн энэ browser-т үлдсэн гэсэн үг: dirty-set-д тэмдэглэгдэж,
 * дараагийн `initRemote`/`retryDirty` дээр автоматаар дахин бичигдэнэ.
 */
export function setUser(
  username: string, access: Access, role: Role | null = null, baseOf?: UserBase,
  /** ⚠️ 2026-10-23: `revive` — ЗӨВХӨН `restoreUser`: remote tombstone-ыг зориуд дарна (унасан бол dirty тугтай) */
  opts: { revive?: boolean } = {},
): Promise<boolean> {
  /* ⚠️ 2026-10-19 (аудит): trim + жижиг үсэг — `permsRemote.fetchAll`/`upsert`-тэй НЭГ түлхүүр */
  const key = username.trim().toLowerCase();
  /* ⚠️ 2026-10-12 (super жигд биш): ХАТУУ super-т override БИЧИХГҮЙ — эрх нь кодоос, панелийн мөр
     нь `resolveBaseAccess`/`roleOf`/`listUsers`-д үл тооцогддог тул бичих нь зөвхөн зөрүүтэй
     үлдэгдэл үүсгэнэ (`roleTypeApply.applyType`-ийн «super-т мөр бичихгүй» дүрэмтэй нэг). */
  /* ⚠️ 2026-10-21: зөвхөн КОДЫН (тестийн) super-т бичихгүй — хүснэгтийн super-ийн мөр нь өөрөө эрхийн эх (бичнэ) */
  if (isCodeSuper(username)) return Promise.resolve(true);
  /* ⚠️ 2026-10-21 (аудит): АНХНЫ АДМИН (`roles.BOOTSTRAP_SUPER` — зөвхөн хүснэгтэд super мөргүй үед super) өөр хүнд super
     олгохдоо ӨӨРИЙН `role:'super'` мөрөө ЭХЭЛЖ бичнэ. Урьд нь доорх `_markTableSuper(нөгөөх, true)` агшинд `tableSupers`
     хоосон биш болж `roleForUser(анхны админ)` → null: админ самбар шууд хаагдаж, мөргүй тул `hasAccess` дараагийн
     нэвтрэлтэд татгалзана (реле `hasPortalRow` ч 403) — сэргээх зам нь Enterprise дээр тэр super мөрийг гараар устгах л
     байв. Өөрийн мөр ArcGIS-т бичигдээгүй бол (сүлжээ) нөгөөд ОЛГОХГҮЙ (`false`, fail-closed): remote-д зөвхөн нөгөөх
     super болж, өөрөө дахин ачаалахад түгжигдэхээс сэргийлнэ; локалд өөрийн мөр dirty — retry дахин бичнэ. Хоёр дахь
     дуудлагад `tableSupers` хоосон биш тул энэ салаа дахин орохгүй. */
  const boot = role === 'super' ? bootstrapOnlySuper() : null;
  if (boot && boot !== key) {
    return setUser(boot, { views: 'all', docs: true }, 'super')
      .then((own) => (own ? setUser(username, access, role, baseOf, opts) : false));
  }
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
  /* ⚠️ 2026-10-21: super = хүснэгт — ЭНЭ мөрийн super төлөвийг тусгана (`roles._markTableSuper`; remote уншигдаагүй
     сешнд no-op). Кэшийг бүхэлд нь дахин уншдаггүй — localStorage-ийн гараар тарьсан `role:'super'` мөр super болохгүй.
     ⚠️ 2026-10-22 (аудит №4): super-ийг ХАСАХ нь шууд (fail-closed), харин ОЛГОХ тэмдэг ArcGIS-т АМЖИЛТТАЙ бичигдсэний
     ДАРАА л (доор, `out.role`-оор). Урьд нь бичихээс өмнө тавьдаг тул унасан бичилтийн дараа ч `tableSupers`-д үлдэж,
     анхны админы дараагийн олголт (`bootstrapOnlySuper` → supers=[өөрөө]) «өөрийн мөрөө эхэлж бич» салааг алгасдаг байв:
     remote-д зөвхөн нөгөөх super болж, анхны админ мөргүй үлдээд дахин ачаалахад түгжигддэг байв. */
  if (role !== 'super') _markTableSuper(key, false);
  /* ⚠️ `serial` — retry ба бусад бичилттэй дараална (2026-09-25); `serialWrite` — агшны тэмдэг (2026-09-29) */
  return serialWrite(key, async () => {
    let out = entry;
    let ok = false;
    let revive = opts.revive === true;
    /* remote мөрийн ТҮҮХИЙ үүрэг (шүүгээгүй) — доорх `unknownRole`-ийн ⚠️ */
    let rawRole: string | null = null;
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
      /* ⚠️ 2026-10-09 (аудит №6): dirty салаа ч ШИНЭЭР УНШИНА — зөвхөн tombstone-ын шалгалтад
         (нэгтгэл нь урьдын адил алгасагдана, доорх ⚠️). Урьд нь `key in loadDirty()` бол бүтэн
         `upsert` явж, нөгөө админы ДӨНГӨЖ тавьсан tombstone-ыг дарж устгагдсан хүнийг амилуулдаг
         байв — `retryDirtyOnce`-ийн ижил цоорхой. Хатуу super-т tombstone үйлчилдэггүй. */
      const wasDirty = key in loadDirty();
      /* ⚠️ 2026-10-23: сэргээлтийн зорилго — энэ дуудлага (`restoreUser`) эсвэл өмнөх унасан сэргээлтийн dirty тэмдэг.
         Сэргээлт retry-гээ хүлээж байхад тэр хүнийг дахин засвал (шинэ `setUser`) зорилго алдагдаж tombstone дээр
         хаягдахаас сэргийлнэ. */
      revive = opts.revive === true || loadDirty()[key]?.revive === true;
      /* ⚠️ 2026-10-21: зөвхөн кодын super-т tombstone үйлчлэхгүй (`isCodeSuper`) */
      const hard = isCodeSuper(username);
      if (!wasDirty || !hard) {
        const fresh = await m.userRead(username);
        if (!fresh) { trackWrite(key, entry, false, revive); return false; }
        rawRole = typeof fresh.row?.role === 'string' ? fresh.row.role : null;
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
         * ⚠️ 2026-10-09 (аудит №6): өмнөх унасан бичилтийн dirty тэмдгийг ч хаяна (`dropDirty`) —
         *    эс бөгөөс `retryDirtyOnce`/`mineDirty` тэр хуучин зорилгыг tombstone дээр давхарлана.
         */
        if (fr?.removed && !base?.removed && !hard && !revive) {
          dropDirty(key, ser(loadDirty()[key]?.e ?? null));
          const s = { ...loadStore() };
          s[key] = fr;
          saveStore(s);
          _markTableSuper(key, false);
          return false;
        }
        /* ⚠️ Өмнөх бичилт нь УНАСАН (dirty) бол кэш нь баталгаажаагүй ЗОРИЛГО — ялгаа бодох суурь
           БИШ; тэр үед урьдын адил бүтнээр нь (`retryDirtyOnce` ч бүтнээр бичдэг). */
        if (!wasDirty) out = mergeUserDelta(base, entry, fr);
        /* Нөгөө админы өөрчлөлтийг локал кэшид ч тусгана — дараагийн засвар түүн дээрээс */
        if (ser(out) !== ser(entry)) {
          const s = { ...loadStore() };
          s[key] = out;
          saveStore(s);
        }
      }
      /* ⚠️ 2026-10-23 (урагш нийцтэй): remote мөрийн үүрэг ЭНЭ клиентэд ТАНИГДАХГҮЙ (шинэ build-ийн шинэ төрөл) бол
         `sanitizeEntry` түүнийг `null` болгодог (fail-closed уншилт) тул бичихэд `null` очиж хуучирсан клиент шинэ төрлийг
         АРЧДАГ байв. Энэ бичилт үүрэг тавиагүй (`out.role === null`) бол remote-ын утгыг ХЭВЭЭР бичнэ. */
      ok = await m.upsert({ username, role: out.role ?? unknownRole(rawRole), views: out.views, docs: out.docs });
    } catch {
      ok = false;
    }
    /* ⚠️ 2026-10-22: super тэмдэг ЗӨВХӨН бичигдсэн утгаар (`mergeUserDelta` үүргийг өөрчилж болно) — дээрх ⚠️ */
    if (ok) _markTableSuper(key, out.role === 'super');
    trackWrite(key, out, ok, revive);
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

/**
 * Override-ыг устгах — cache + localStorage + ArcGIS хүснэгтээс. Үр дүн: setUser-тэй адил.
 * ⚠️ 2026-10-11 (аудит №7): TOMBSTONE-ЫГ ЗӨВХӨН `{ revive: true }`-ЭЭР АРИЛГАНА. Урьд нь «Сэргээх»
 *    (`UserAdmin.saveAll`-ийн `d.clear`) · `removeUser` · `revokeFlowAccess` бүгд энэ замаар remote
 *    мөрийг шалгалгүй устгадаг тул нөгөө админы ДӨНГӨЖ тавьсан tombstone (манай кэш мэдээгүй)
 *    арчигдаж, устгагдсан хүн дахин нэвтэрдэг байв. Одоо бичихийн өмнө мөрийг шинээр уншина
 *    (`setUser`-ийн ижил загвар): remote-д tombstone, `revive` биш бол ЮУ Ч устгахгүй — локалд
 *    tombstone-ыг тусгаж `false` (dirty-д ТЭМДЭГЛЭХГҮЙ). Уншиж чадаагүй бол бичихгүй (`false` → dirty,
 *    retry дахин уншина). «Буцаах» товч л `revive: true` өгнө. Хатуу super-т tombstone үйлчилдэггүй.
 * ⚠️ Локал мөрийг remote устгал АМЖИЛТТАЙ болсны ДАРАА л арилгана — урьд нь эхлээд локалоос
 *    арчдаг тул remote унасан ч tombstone кэшээс алга болж, тэр хүн энэ табд нэвтэрдэг байв.
 *    Унасан устгал dirty (`null`)-д үлдэж `retryDirtyOnce`/`mineDirty` дахин оролдоно.
 */
export function clearOverride(username: string, opts: { revive?: boolean } = {}): Promise<boolean> {
  /* ⚠️ 2026-10-19 (аудит): trim + жижиг үсэг — `permsRemote.fetchAll`/`upsert`-тэй НЭГ түлхүүр */
  const key = username.trim().toLowerCase();
  const revive = opts.revive === true;
  /* ⚠️ `serial` — retry ба бусад бичилттэй дараална (2026-09-25); `serialWrite` — агшны тэмдэг (2026-09-29) */
  return serialWrite(key, async () => {
    let ok = false;
    try {
      const m = await import('./permsRemote');
      /* ⚠️ 2026-10-21: зөвхөн кодын super-т tombstone үйлчлэхгүй (`isCodeSuper`) */
      if (!revive && !isCodeSuper(key)) {
        const fresh = await m.userRead(username);
        /* ⚠️ 2026-10-11 (аудит №7, 2): remote УНШИГДАХГҮЙ (offline) бол `setUser`-тэй ИЖИЛ — локал мөр
           tombstone БИШ л бол локалоос шууд арчиж dirty-д үлдээнэ (`retryDirtyOnce` remote tombstone-ыг
           дахин шалгана); локал мөр tombstone бол remote-оор батлагдахгүйгээр арчихгүй — энэ хөтөч
           устгагдсан хүнийг оруулахгүй. */
        if (!fresh) {
          if (!loadStore()[key]?.removed) { const s0 = { ...loadStore() }; delete s0[key]; saveStore(s0); _markTableSuper(key, false); }
          trackWrite(key, null, false);
          return false;
        }
        if (fresh.row?.removed) {
          dropDirty(key, ser(loadDirty()[key]?.e ?? null));
          const s = { ...loadStore() };
          s[key] = sanitizeEntry({ views: [], docs: false, role: null, removed: true });
          saveStore(s);
          _markTableSuper(key, false);
          return false;
        }
      }
      ok = await m.remove(username);
    } catch {
      ok = false;
    }
    if (ok) {
      const store = { ...loadStore() };
      delete store[key];
      saveStore(store);
      /* ⚠️ 2026-10-21: мөр арилсан — хүснэгтийн super ч арилна (`roles._markTableSuper`) */
      _markTableSuper(key, false);
    }
    trackWrite(key, null, ok, revive);
    return ok;
  });
}

/**
 * ⚠️ 2026-10-06 (аудит): ӨӨР ТАБЫН localStorage-ийг remote уншигдсаны ДАРАА зөвхөн ХУМИХ
 *    чиглэлд авна. Урьд нь `storage` сонсогч `cache = loadLocal()` хийдэг тул хэрэглэгч
 *    өөр табаас (эсвэл devtools-оор) `selbe-perms-v1`-д өөртөө `views:'all'` / `role:'super'`
 *    бичихэд ЭНЭ таб тэр утгыг «remote-оор баталгаажсан» (`remoteLoaded === true`) гэж үзэж
 *    эрх олгодог байв — `resolveBaseAccess`-ийн fail-closed ⚠️-тэй зөрчилдөнө.
 *    Одоо: tombstone ба харагдац/баримтын ХАСАЛТ шууд (хор хөнөөлгүй — зөвхөн хумина),
 *    шинэ мөр · өргөтгөл · үүргийн солилтыг ҮЛ ТООЦНО; оронд нь remote-оос дахин уншина
 *    (`scheduleRemoteRefresh`) — бодит админы засвар тэр замаар ирнэ.
 */
function narrowOnly(cur: Store, loc: Store): Store {
  const out: Store = { ...cur };
  for (const [k, l] of Object.entries(loc)) {
    const c = cur[k];
    if (!c) continue; // шинэ мөр — нэмэхгүй (remote-оос л)
    /* ⚠️ 2026-10-09 (аудит №6): өөр табын tombstone-ыг ЗӨВХӨН нэвтэрсэн хэрэглэгчийн ӨӨРИЙН мөрөнд
       авна (өөрийгөө шууд хаах — хор хөнөөлгүй). Бусад нэрийн tombstone-ыг localStorage-оос
       авбал devtools-оор тарьсан `removed:true` мөр энэ табын админ панелд тэр аккаунтыг
       «устгагдсан» мэт харуулж, `saveAll`-ийн `gone` шалгалт түүний ноорогийг алгасна —
       бодит устгал `scheduleRemoteRefresh`-ийн remote уншилтаар ирнэ. */
    if (l.removed) {
      if (k === (currentUser() ?? '').toLowerCase()) out[k] = l;
      continue;
    }
    if (c.removed) continue; // локал нь tombstone-ыг арилгах гэсэн — үл тооцно
    const views: Entry['views'] = l.views === 'all'
      ? c.views
      : c.views === 'all' ? l.views : c.views.filter((v) => (l.views as ViewKey[]).includes(v));
    out[k] = { views, docs: c.docs && l.docs, role: c.role };
  }
  return out;
}

/** Өөр табын өөрчлөлтийн дараах remote дахин уншилт — 30 сек-д ДЭЭД ТАЛ нь нэг (табууд хооронд ping-pong-гүй) */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let lastRefresh = 0;
function scheduleRemoteRefresh(): void {
  if (refreshTimer) return;
  const wait = Math.max(2_000, lastRefresh + 30_000 - Date.now());
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    lastRefresh = Date.now();
    const u = currentUser();
    /* ⚠️ trusted = зөвхөн хатуу super (AuthGate-ийн poll-той ижил дүрэм) */
    initRemote(false, !!u && isHardSuper(u)).catch(() => { /* дараагийн poll дахин уншина */ });
  }, wait);
}

/** localStorage/өөр таб дахь өөрчлөлтөд захиалах — цэвэрлэх функц буцаана */
export function subscribe(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== DIRTY_KEY) return;
    // ⚠️ Өөр табын бичилтийг cache-д ЗААВАЛ татна — урьд нь зөвхөн fn()
    //    дуудаад cache хуучнаараа үлдэж, дахин зурсан UI хуучин эрхийг
    //    харуулсаар байв.
    /* ⚠️ 2026-10-06: remote уншигдсан бол зөвхөн хумина + remote дахин уншина (`narrowOnly`-ийн ⚠️).
       Remote-гүй сешнд override нь `resolveBaseAccess`/`hasAccess`-д аль хэдийн зөвхөн хумидаг. */
    if (!remoteLoaded) {
      cache = loadLocal();
    } else {
      const loc = loadLocal();
      if (JSON.stringify(loc) !== JSON.stringify(cache)) {
        cache = narrowOnly(cache, loc);
        scheduleRemoteRefresh();
      }
    }
    fn();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}
