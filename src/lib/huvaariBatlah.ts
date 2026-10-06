'use client';

/**
 * ХУВААРИЙН БАТЛАХ УРСГАЛ — гүйцэтгэгч зохионо, батлагч батална.
 *
 * ⚠️ ЯАГААД ЭНЭ ХЭРЭГТЭЙ БОЛОВ (2026-09-07, хэрэглэгчийн шийдвэр): урьд нь
 * `plan` эрхтэй хүн «Хадгалах» дармагц огноо нь ЭХ ХУУДСАНД шууд бичигдэж,
 * тэр агшнаас эхлэн төлөвлөгөөт хувь, тайлан, хоцрогдлын дохио бүгд дагаж
 * хөдөлдөг байв. Хяналт БАЙХГҮЙ: нэг хүн хуваарийг дур мэдэн хойш чирээд
 * өөрийн хоцрогдлыг арилгаж чадна. Одоо гүйцэтгэгч ЗОХИОНО → «Батлуулах»
 * дарна → БАТЛАГЧ хараад батална → тэр үед л эх хуудсанд бичигдэнэ.
 *
 * ⚠️ ЭХ ХУВААРЬ БАТЛАГДТАЛ ХӨДЛӨХГҮЙ. Илгээлт нь ЭНЭ хүснэгтэд хүлээнэ.
 * Тиймээс батлагдаагүй саналууд тайлан, дашбоард, хоцрогдлын тооцоонд ОГТ
 * нөлөөлөхгүй — хянагч нь «юу байсан → юу болох» хоёрыг зэрэг харна.
 *
 * ⚠️ ГҮЙЦЭТГЭЛИЙН УРСГАЛААС (`hyanalt.ts`) ТУСДАА. Тэр нь БОДИТ гүйцэтгэлийн
 * 4 шатат урсгал (компани → инженер → менежер → захирал), энэ нь ТӨЛӨВЛӨГӨӨНИЙ
 * 2 шатат урсгал. Хольвол «хуваарийг зөвшөөрсөн» нь «гүйцэтгэлийг зөвшөөрсөн»
 * гэж уншигдаж, хариуцлага замхарна. Мөн `hyanalt` үйлчилгээний талбарууд
 * гүйцэтгэлийн 60 баганын загварт хатуу уягдсан тул хуваарийн зурвасыг
 * тэнд хийж болохгүй (2026-09-17-ноос ижил оргод ч тусдаа үйлчилгээ).
 *
 * ⚠️ ХАДГАЛАЛТ: ӨӨРИЙН ArcGIS хүснэгт (`Selbe_Huvaari_Batlah`).
 * `Selbe_Permissions`-ийн `__flow__:`/`__cap__:`/`__qaqc__:` мөрийн загварыг
 * АШИГЛААГҮЙ: тэнд `views` талбар 2048 тэмдэгттэй бөгөөд нэг илгээлт нь
 * хэдэн зуун мөрийн огноо + уялдаа + сарын обьём агуулдаг тул багтахгүй.
 * Хүснэгтийг эхний хэрэгцээнд super админы токеноор ӨӨРӨӨ үүсгэнэ
 * (`permsRemote.createTable`-тай ижил зарчим) — гар ажиллагаа шаардахгүй.
 *
 * ⚠️ FAIL-CLOSED: хүснэгт уншигдахгүй бол «батлагдсан» гэж ҮЗЭХГҮЙ.
 */

import { AUTH, ROLE_BY_USER } from './services';
import { huvaariAclReady, huvaariScope } from './huvaariAcl';
import { capsRemoteReady, hasCap } from './caps';
import { t as tr } from '@/lib/i18nCore';
/* ⚠️ `arcgisPost` (2026-09-30): урьд нь ижил утгатай дотоод `req` байв — хүснэгт
   Organization-only тул нэвтэрсэн хэрэглэгчийн токен ЗААВАЛ (2026-09-17), токеныг
   хүсэлтийн өмнө шинэчилж 498-д нэг удаа дахин оролдоно (2026-09-29). */
import { arcgisPost } from '@/lib/authToken';
import { currentUser, requireCap } from './who';
import { invalidate } from './dataBus';
import { cached } from '@/lib/live';

/** Илгээлтийн төлөв */
export const PLAN_STATUS = {
  /** Гүйцэтгэгч илгээсэн — батлагчийг хүлээж байна */
  pending: 'Хүлээгдэж буй',
  approved: 'Батлагдсан',
  returned: 'Буцаагдсан',
  /**
   * ЗОХИОГЧ ӨӨРӨӨ ТАТСАН (2026-09-21). Урьд нь зохиогч илгээснээ буцаах
   * замгүй байв: `decidePlan` нь зохиогч=батлагч буцаалтыг татгалздаг, UI-д
   * товч ч байгаагүй — алдаатай илгээлт өөр батлагч буцаатал багцыг түгжинэ.
   * ⚠️ `returned`-ээс ТУСДАА утга: буцаалт нь батлагчийн шийдвэр, татах нь
   *    зохиогчийн. Нэгтгэвэл «хэн буцаасан» нь `batlagch` талбараас
   *    таагдах болж, түүхийн тайлан зөрнө. Өгөгдөл тул ОРЧУУЛАГДАХГҮЙ.
   */
  withdrawn: 'Татсан',
} as const;
export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

/**
 * БАТЛАХ/ХАДГАЛАХ ГИНЖ ЯВЖ БУЙ эсэх — `Portal` харагдац солихоос өмнө асууна
 * (2026-09-25 аудит #4).
 * ⚠️ ЯАГААД: батлах гинж (`save` → `applyUpdates` → `decidePlan`) нь `Huvaari`
 *    бүрэлдэхүүний эффектэд явдаг. Харагдац солиход бүрэлдэхүүн салж, эх хуудсанд
 *    бичсэний ДАРАА, `decidePlan`-ээс ӨМНӨ тасарвал хуваарь батлагдалгүй хөдөлж,
 *    илгээлт `pending` хэвээр үлддэг байв.
 * ⚠️ ЭНД (хөнгөн lib) — `Huvaari` нь `dynamic` ачаалалттай тул `Portal` түүнийг
 *    шууд импортлохгүй. Бүрэлдэхүүн бүр өөрийн `symbol`-оор тэмдэглэнэ.
 */
const navBusy = new Set<symbol>();
export function setPlanNavBusy(id: symbol, on: boolean): void {
  if (on) navBusy.add(id); else navBusy.delete(id);
}
export function planNavBusy(): boolean {
  return navBusy.size > 0;
}

/**
 * НЭГ ИЛГЭЭЛТ — нэг багцын хуваарийн санал.
 *
 * ⚠️ `payload` нь `Huvaari`-ийн ГУРВАН ноорогийг агуулна (огноо · уялдаа ·
 *    сарын обьём). Гурвуулаа нэг «Хадгалах»-д нийлдэг тул тусад нь батлуулбал
 *    хагас батлагдсан хуваарь үүсэж, огноо нь шинэ, обьём нь хуучин болно.
 */
export type PlanSubmission = {
  oid: number;
  /** Багцын түлхүүр (`Pkg.key`) — жишээ нь `b2_9f` */
  pkgKey: string;
  /** Багцын БҮЛЭГ (`Pkg.group`) — эрхийн хүрээ үүгээр шалгагдана */
  pkgGroup: string;
  status: PlanStatus;
  /** Илгээсэн хүн (ArcGIS-ийн нэр, жижиг үсгээр) */
  author: string;
  authorSent: number | null;
  /** Шийдвэр гаргасан хүн */
  approver: string | null;
  approverAt: number | null;
  /** Буцаасан шалтгаан — ЗӨВХӨН `returned` төлөвт утгатай */
  reason: string | null;
  /** Гүйцэтгэгчийн тайлбар (сонголтоор) */
  note: string | null;
  /** Өөрчлөгдөх мөрийн тоо — жагсаалтад харуулна (payload задлахгүйгээр) */
  rowCount: number;
  /** Хадгалагдсан ноорог — задлахад `parsePayload` */
  payload: string;
  /**
   * БАТЛАГЧИЙН ЗӨВШӨӨРСӨН МӨРҮҮД — мөрийн `oid` (2026-09-25, хэрэглэгч:
   * «гүйцэтгэлтэй адил алийг нь зөвшөөрсөн, алийг нь зөвшөөрөөгүйг гүйцэтгэгч харна»).
   *
   * ⚠️ `hyanalt.okCells`-ийн ЗАГВАР: зөвхөн ЗӨВШӨӨРСӨН мөрийг хадгална —
   *    «өөрчлөгдсөн боловч энд ороогүй» нь улаан (засах ёстой) гэсэн үг.
   * ⚠️ `null` ≠ `[]`: `null` = талбар хүснэгтэд БАЙХГҮЙ эсвэл тэмдэглээгүй
   *    (хуучин буцаалт) → гүйцэтгэгчид улаан/ногоон ОГТ харуулахгүй;
   *    `[]` = бүгдийг зөвшөөрөөгүй → өөрчлөгдсөн бүх мөр улаан.
   */
  okRows: number[] | null;
};

/**
 * ХУВААРИЙН ТӨРӨЛ — илгээлт АЛЬ огнооны багцад хамаарах вэ (2026-09-11).
 *
 * ⚠️ `plan`  = ТӨЛӨВЛӨСӨН (`F…_Эхлэх`/`…_Дуусах`) — ажлын явцад хөдөлдөг.
 *    `geree` = ГЭРЭЭНИЙ (`F…_geree_ehleh`/`…_geree_duusah`) — лавлагаа.
 * ⚠️ Энэ нь `Huvaari.tsx`-ийн `PlanKind`-ийн ХУУЛБАР БИШ, ЭХ тодорхойлолт:
 *    модуль нь React-гүй тестлэгддэг тул төрлөө өөрөө эзэмшинэ.
 */
export type PlanPayloadKind = 'plan' | 'geree';

/** `payload`-ийн задарсан хэлбэр — `Huvaari`-ийн гурван ноорог */
export type PlanPayload = {
  /**
   * ЯМАР ОГНООНЫ багцад хамаарах (2026-09-11).
   *
   * ⚠️ ЗААВАЛ БИЧИГДЭНЭ. Урьд нь БАЙГААГҮЙ тул батлагч нь ӨӨРИЙН харж буй
   *    табаар бичих талбарыг дур мэдэн шийддэг байв: «Гэрээ» таб дээр байхад
   *    ТӨЛӨВЛӨГӨӨНИЙ санал `…_geree_*` талбарт бичигдэж, гэрээний лавлагаа
   *    чимээгүй эвдэрдэг байсан (2026-09-11-ний аудитын S1).
   * ⚠️ ХУУЧИН илгээлтэд энэ талбар БАЙХГҮЙ — `parsePayload` нь тэднийг
   *    `'plan'` гэж үзнэ (тэр үед зөвхөн төлөвлөгөө байсан тул ҮНЭН).
   */
  kind: PlanPayloadKind;
  /** `oid` → блок бүрийн муж (`null` = тухайн блокт хуваарь байхгүй) */
  spans: Record<string, ({ start: number; end: number } | null)[]>;
  /** `oid` → уялдааны текст */
  deps: Record<string, string>;
  /** `${ажлын код}|${блок}` → сар → обьём */
  obyem: Record<string, Record<string, number>>;
  /**
   * САРЫН НӨӨЦ — `${код}|${блок}` → сар → { хүн хүч, машин } (2026-09-24).
   * ⚠️ `obyem`-той ЗЭРЭГЦЭЭ, тусдаа: хуучин илгээлтэд БАЙХГҮЙ → `{}`.
   *    Батлагчийн `save()` сарын нөөц байвал мөрийн hun/mashin-ийг нийлбэрээр бичнэ.
   */
  obres?: Record<string, Record<string, { hun: number | null; mashin: number | null }>>;
  /**
   * ИЛГЭЭХ ҮЕИЙН СУУРЬ — сервер дээр тэр агшинд ЮУ байсан (2026-09-21).
   *
   * ⚠️ ЯАГААД: `spans` нь мөрийн БҮХ блокийн (22) бүтэн агшин. Батлагч
   *    `save` нь түүнийг ОДООГИЙН сервер мөртэй харьцуулж «өөрчлөгдсөн»
   *    блокийг бичдэг тул илгээснээс хойш өөр илгээлтээр батлагдсан блок
   *    (зохиогч хөндөөгүй) нь зохиогчийн хуучин утгаар ЧИМЭЭГҮЙ буцдаг байв.
   *    Суурьтай бол: `spans[b] === base[b]` → зохиогч хөндөөгүй → серверийн
   *    одоогийн утга үлдэнэ; `base[b] !== сервер` → зэрэгцээ өөрчлөлт →
   *    батлагчид ил хэлнэ.
   * ⚠️ СОНГОЛТТОЙ — 2026-09-21-ээс ӨМНӨХ илгээлтэд байхгүй; тэр үед бүх
   *    блокийг «зохиогчийн зассан» гэж үзнэ (хуучин зан үйл, буцаж нийцтэй).
   * ⚠️ `deps`-ийн `null` = тэр үед уялдаа хоосон байсан.
   */
  base?: {
    spans: Record<string, ({ start: number; end: number } | null)[]>;
    deps: Record<string, string | null>;
    obyem: Record<string, Record<string, number>>;
    /** Бодит огноо · нөөцийн суурь (2026-09-23) — `actual`/`res`-тэй ижил хэлбэр */
    actual?: Record<string, { start: (number | null)[]; end: (number | null)[] }>;
    res?: Record<string, { hun: number | null; mashin: number | null }>;
    /** Сарын нөөцийн суурь (2026-09-24) */
    obres?: Record<string, Record<string, { hun: number | null; mashin: number | null }>>;
  };
  /**
   * БОДИТ ЭХЭЛСЭН/ДУУССАН огноо — `oid` → блок бүрийн { start[], end[] }
   * (2026-09-23). `null` = тэр блокт бүртгэлгүй.
   *
   * ⚠️ ХОЁР ТУСДАА МАССИВ, `spans` шиг муж БИШ: эхэлсэн ч дуусаагүй нь
   *    хэвийн төлөв. Уртууд блокийн тоотой тэнцүү.
   * ⚠️ СОНГОЛТТОЙ — 2026-09-23-аас өмнөх илгээлтэд байхгүй; `parsePayload`
   *    тэр үед `{}` өгнө (буцаж нийцтэй). Огнооны ноорогтой НЭГ илгээлтээр
   *    явна — тусад нь батлуулбал батлагч хоёр удаа шийддэг.
   * ⚠️ `kind`-ээс ХАМААРАХГҮЙ (гэрээ/төлөвлөгөө хоёулаа нэг бодит талбарт
   *    бичнэ) — гэвч ноорог нь таб солиход бусадтай хамт цэвэрлэгдэнэ.
   */
  actual: Record<string, { start: (number | null)[]; end: (number | null)[] }>;
  /** Хүн хүч · машин механизм — `oid` → { hun, mashin } (2026-09-23). Сонголттой, дээрхтэй ижил. */
  res: Record<string, { hun: number | null; mashin: number | null }>;
  /**
   * МӨРИЙН ТОГТВОРТОЙ ТҮЛХҮҮР — `oid` → ажлын код (`des`) (2026-09-29).
   *
   * ⚠️ ЯАГААД: `spans`/`deps`/`actual`/`res` нь ИЛГЭЭСЭН ҮЕИЙН жаазын `oid`-оор
   *    түлхүүрлэгддэг. Хооронд нь шинэ жааз нийтлэгдвэл (гүйцэтгэл батлагдах ·
   *    нэмэлт ажил · «Улсын комисс») бүх `oid` солигдож, санал «мөр олдсонгүй»
   *    болж батлагдах ч, буцаагдаад ноорогт буух ч боломжгүй болдог байв.
   *    Ажлын код нь жааз солигдоход ХАДГАЛАГДДАГ (сарын обьём, уялдаа түүгээр
   *    түлхүүрлэгддэг) тул `remapPayload` түүгээр одоогийн `oid` руу зөөнө.
   * ⚠️ СОНГОЛТТОЙ — өмнөх илгээлтэд байхгүй; тэр үед зөөлтгүй (хуучин зан үйл).
   *    Кодгүй мөр (`des == null`) энд ОРОХГҮЙ — зөөгдөхгүй.
   */
  keys?: Record<string, number>;
};

/**
 * ИЛГЭЭЛТИЙН `oid`-ЫГ ОДООГИЙН ЖААЗ РУУ ЗӨӨНӨ — ажлын кодоор (2026-09-29).
 *
 * ⚠️ ЦЭВЭР функц (сүлжээгүй). `cur` = одоогийн жаазын мөрүүд.
 * ⚠️ Одоогийн жаазад БАЙГАА `oid` хөндөгдөхгүй. Байхгүй нь `keys`-ийн кодоор
 *    хайгдана; код одоогийн жаазад ДАВХАРДСАН бол зөөхгүй (буруу мөрд буулгахаас
 *    «олдсонгүй» гэж хэлэх нь аюулгүй). Хоёр хуучин `oid` нэг мөр рүү зөөгдөхгүй.
 * ⚠️ `obyem`/`obres` нь угаасаа кодоор түлхүүрлэгддэг — хөндөхгүй.
 */
export function remapPayload(
  p: PlanPayload,
  cur: readonly { oid: number; des: number | null }[],
): { pay: PlanPayload; map: Map<number, number> } {
  const map = new Map<number, number>();
  if (!p.keys) return { pay: p, map };
  const have = new Set(cur.map((r) => r.oid));
  const byDes = new Map<number, number | null>();
  for (const r of cur) {
    if (r.des == null) continue;
    byDes.set(r.des, byDes.has(r.des) ? null : r.oid);
  }
  const taken = new Set<number>();
  for (const [k, des] of Object.entries(p.keys)) {
    const oid = Number(k);
    if (!Number.isInteger(oid) || have.has(oid)) continue;
    const to = byDes.get(des);
    if (to == null || taken.has(to) || String(to) in p.spans || String(to) in p.deps) continue;
    taken.add(to);
    map.set(oid, to);
  }
  if (!map.size) return { pay: p, map };
  const re = <T,>(rec: Record<string, T> | undefined): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(rec ?? {})) {
      const nk = String(map.get(Number(k)) ?? k);
      if (!(nk in out)) out[nk] = v;
    }
    return out;
  };
  const pay: PlanPayload = {
    ...p,
    spans: re(p.spans),
    deps: re(p.deps),
    actual: re(p.actual),
    res: re(p.res),
    keys: re(p.keys),
    ...(p.base ? {
      base: {
        ...p.base,
        spans: re(p.base.spans),
        deps: re(p.base.deps),
        ...(p.base.actual ? { actual: re(p.base.actual) } : {}),
        ...(p.base.res ? { res: re(p.base.res) } : {}),
      },
    } : {}),
  };
  return { pay, map };
}

const TITLE = 'Selbe_Huvaari_Batlah';
const TABLE_NAME = 'huvaari_batlah';

/** Талбарын нэр — амьд үйлчилгээтэй ЯГ тохирно */
export const F = {
  oid: 'OBJECTID',
  pkgKey: 'bagts_key',
  pkgGroup: 'bagts_group',
  status: 'toloh',
  author: 'zohiogch',
  authorSent: 'ilgeesen_ognoo',
  approver: 'batlagch',
  approverAt: 'shiidver_ognoo',
  reason: 'butsaasan_shaltgaan',
  note: 'tailbar',
  rowCount: 'mor_too',
  payload: 'aguulga',
  /**
   * Зөвшөөрсөн мөрийн `oid`-ийн JSON массив (2026-09-25) — `PlanSubmission.okRows`.
   * ⚠️ 2026-09-25-ноос ӨМНӨ үүссэн хүснэгтэд БАЙХГҮЙ — код үүсгэхгүй (хүснэгтийн
   *    бүтцийг зөвхөн хэрэглэгч AGOL дээр өөрчилнө). Байгаа эсэхийг
   *    `okRowsField()` шалгана; байхгүй бол бичихгүй, уншихгүй, ил анхааруулна.
   */
  okRows: 'zovshoorson_mor',
} as const;

/**
 * ХАГАС БИЧИГДСЭН БАТЛАЛТЫН СЕРВЕРИЙН ТЭМДЭГ (2026-10-01).
 *
 * ⚠️ ЯАГААД: батлагчийн `save` нь огноо (`applyUpdates`) ба сарын обьёмыг
 *    (`applyPlanEdits`) тусдаа бичээд, ДАРАА нь `decidePlan`-аар төлвийг хөдөлгөдөг.
 *    Завсарт унавал санал эх хуудсанд (хэсэгчлэн ч) суусан атлаа `pending` хэвээр.
 *    Урьд нь хамгаалалт нь зөвхөн санах ойд (`Huvaari.partialRef`) ба `CLAIM_TTL`
 *    (10 мин) түгжээнд байсан тул хуудас сэргээх эсвэл 10 минутын дараа зохиогч
 *    ТАТАХ, жагсаалтаас БУЦААХ хоёулаа амжилттай болж, «татсан/буцаагдсан» саналын
 *    огноо эх хуудсанд үлддэг байв.
 * ⚠️ ХЭЛБЭР: ШИНЭ ТАЛБАР НЭМЭЭГҮЙ — `pending` мөрийн `butsaasan_shaltgaan` (буцаах
 *    шалтгаан нь ЗӨВХӨН `returned`-д утгатай, `pending`-д хэзээ ч уншигддаггүй) талбарт
 *    `${PARTIAL_MARK}:${батлагч}` бичнэ. Хугацаагүй: зөвхөн `decidePlan(approve:true)`
 *    амжилттай болоход (`reason: null`) арилна.
 * ⚠️ Тэмдэгтэй үед: `withdrawPlan` ба `decidePlan(approve:false)` ТАТГАЛЗАНА; батлах нь
 *    (бичилтийг гүйцээх) ЗӨВШӨӨРӨГДӨНӨ — өөр батлагч ч `claimPlan`-аар хугацаа нь
 *    дууссан түгжээг авч гүйцээж болно. Өгөгдөл тул ОРЧУУЛАГДАХГҮЙ.
 */
export const PARTIAL_MARK = '__hagas_bichigdsen__';
/**
 * Хагас бичсэн батлагчийн нэр (`''` = нэргүй тэмдэг), тэмдэггүй бол `null`.
 * ⚠️ ЦЭВЭР — `huvaariBatlah.check` тестэлнэ. Зөвхөн `pending` мөрд хүчинтэй.
 */
export function partialBy(status: string | null | undefined, reason: string | null | undefined): string | null {
  if (status !== PLAN_STATUS.pending) return null;
  const r = (reason ?? '').trim();
  if (r !== PARTIAL_MARK && !r.startsWith(`${PARTIAL_MARK}:`)) return null;
  return r.slice(PARTIAL_MARK.length + 1).trim().toLowerCase();
}

/**
 * ДАВХАР ИЛГЭЭЛТИЙН ЦУЦЛАЛТЫН ТЭМДЭГ (2026-10-01) — `submitPlan`-ийн давхардал арилгах
 * зам устгал унахад ялагдсан мөрийг `withdrawn` болгохдоо `butsaasan_shaltgaan`-д бичнэ.
 * ⚠️ ЯАГААД: тэр мөр (их OBJECTID) нь `loadLastPerPkg`/`loadHistory`-д багцын «сүүлийн
 *    шийдвэр» болж, жинхэнэ буцаалтын шалтгааныг зохиогчоос нууж, «Ноорогт буцаах»
 *    (`restoreWithdrawn`) нь цуцлагдсан саналыг сэргээх байв. Шийдвэр БИШ — алгасна.
 */
export const DUP_MARK = '__davhar_tsutslagdsan__';
/**
 * Давхардлын улмаас цуцлагдсан мөр мөн эсэх — «сүүлийн шийдвэр»-ээс хасна.
 * ⚠️ `approverAt == null` нөөц шалгуур: тэмдэггүй (2026-10-01-ний өмнөх кодоор) бичигдсэн
 *    цуцлалт ч мөн ийм — жинхэнэ `withdrawPlan` ҮРГЭЛЖ `approverAt`-ийг бичдэг.
 */
export function isDupCancel(x: Pick<PlanSubmission, 'status' | 'reason' | 'approverAt'>): boolean {
  if (x.status !== PLAN_STATUS.withdrawn) return false;
  return (x.reason ?? '').trim() === DUP_MARK || x.approverAt == null;
}

/* ══════════════════════ ArcGIS давхарга ══════════════════════ */

async function getToken(): Promise<{ token: string; user: string } | null> {
  try {
    const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
    const cred = esriId.findCredential(`${AUTH.portalUrl.replace(/\/+$/, '')}/sharing`);
    if (!cred?.token) return null;
    return { token: cred.token, user: (cred.userId as string) ?? '' };
  } catch {
    return null;
  }
}

const restBase = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest`;

/** Хатуу тохиргооны super админууд — хүснэгтийн эзэн эдний нэг байх ёстой */
const SUPER_OWNERS = new Set(
  Object.entries(ROLE_BY_USER).filter(([, r]) => r === 'super').map(([u]) => u.toLowerCase()),
);

/**
 * ХУУЧИН ЭЗЭД — `ROLE_BY_USER`-ээс хасагдсан ч хүснэгтийг үүсгэсэн байж
 * болох аккаунтууд (2026-09-11, `permsRemote.FORMER_TABLE_OWNERS`-ийн загвар).
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ: хүснэгтийг үүсгэсэн хүн дараа нь super жагсаалтаас
 *    хасагдвал `findTableUrl` нь БАЙГАА хүснэгтээ «эзэн танигдахгүй» гэж
 *    няцааж, шинээр үүсгэхийг ч хориглоно (`ownerMismatch`). Тэр үед
 *    батлах урсгал бүхэлдээ зогсоно — 2026-09-11-нд яг ийм байдал үүсэв.
 * ⚠️ Энд нэмэх нь ЗӨВХӨН УНШИХ эрхийг нээнэ: хүснэгт өөрөө AGOL дээр
 *    хуваалцагдсан хэвээр, бичих эрх нь тэндээс хамаарна.
 */
const FORMER_TABLE_OWNERS: string[] = [];
const TABLE_OWNERS = new Set([
  ...SUPER_OWNERS,
  ...FORMER_TABLE_OWNERS.map((u) => u.toLowerCase()),
]);

let tableUrlCache: string | undefined;
/** Ижил нэртэй боловч танигдахгүй эзэнтэй хүснэгт — шинээр үүсгэхийг хориглоно */
let ownerMismatch = false;

/**
 * ⚠️ ЭЗНИЙГ ШАЛГАНА (`permsRemote.findTableUrl`-тай ижил шалтгаан): title
 * хайлт нь org доторх ХЭНИЙ Ч үүсгэсэн ижил нэртэй item-ыг буцааж болно.
 * Хуурамч хүснэгт үүсгэсэн хүн бүх багцын хуваарийг батлах зам нээх байлаа.
 */
async function findTableUrl(token: string): Promise<string | null> {
  const search = await arcgisPost(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    /*
     * ⚠️ 100 (2026-09-11, `permsRemote.ts:176-181`-ийн засварыг тараав):
     * хайлт нь org доторх ХЭНИЙ Ч ижил нэртэй item-ыг буцаадаг тул хэн
     * нэгэн 10+ хуурамч item үүсгэвэл ЖИНХЭНЭ хүснэгт эхний 10-т багтахаа
     * больж, `ownerMismatch` асаад бүх клиентийн урсгал УНТАРНА.
     */
    num: '100',
  });
  const results = (search.results as Array<{ url?: string; title?: string; owner?: string; access?: string }>) ?? [];
  const same = results.filter((x) => x.title === TITLE && x.url);
  const hit = same.find((x) => TABLE_OWNERS.has(String(x.owner ?? '').toLowerCase()));
  /* ⚠️ Нийтэд нээлттэй эсэхийг ЭНД барина — `access` нь хайлтын хариунд
     хамт ирдэг тул нэмэлт хүсэлт хэрэггүй (`permsRemote`-ийн загвар). */
  if (String(hit?.access ?? '') === 'public') {
    console.error(
      `[selbe] ${TITLE} хүснэгт НИЙТЭД (public) нээлттэй — нэвтрээгүй хэн ч`,
      'батлах мөрийг засаж чадна. AGOL дээр Share-ийг «Organization» болгоно уу.',
    );
  }
  ownerMismatch = !hit && same.length > 0;
  if (ownerMismatch) {
    console.error(
      `[selbe] ${TITLE} хүснэгтийн эзэн танигдсангүй:`,
      same.map((x) => x.owner).join(', '), '— super-т reassign хийнэ үү',
    );
  }
  return hit?.url ? `${hit.url}/0` : null;
}

/**
 * `aguulga` талбарын урт (тэмдэгт). ⚠️ 2026-09-29: `base` (2026-09-21) нэмэгдсэнээс
 * хойш «бүх мөр багтана» гэсэн таамаг худал — `submitPlan` илгээхийн өмнө шалгана.
 */
export const PAYLOAD_MAX = 1_048_576;
/** Буцаах шалтгаан · тайлбарын талбарын урт — UI `maxLength` үүнтэй ижил */
export const REASON_MAX = 2000;

/**
 * Хүснэгт үүсгэх (publish эрхтэй super admin).
 *
 * ⚠️ `aguulga` нь 1,048,576 тэмдэгт — нэг багцын огноо, уялдаа, сарын обьём
 *    ихэвчлэн багтана (том багцад `base`-тэй хамт хэтэрч болно — `PAYLOAD_MAX`).
 *    `permsRemote`-ийн 2048 тэмдэгтэд ЯМАР Ч ТОХИОЛДОЛД багтахгүй тул тэнд мөр
 *    нэмэх замыг сонгоогүй.
 */
async function createTable(token: string, user: string): Promise<string | null> {
  const createParameters = {
    name: TITLE,
    serviceDescription: tr('Сэлбэ порталын хуваарийн батлах урсгал'),
    hasStaticData: false,
    maxRecordCount: 10000,
    capabilities: 'Query,Editing,Create,Update,Delete',
    spatialReference: { wkid: 102100 },
    allowGeometryUpdates: false,
    units: 'esriMeters',
  };
  const created = await arcgisPost(
    `${restBase()}/content/users/${encodeURIComponent(user)}/createService`,
    { token, createParameters: JSON.stringify(createParameters), outputType: 'featureService' },
  );
  const serviceUrl = created.encodedServiceURL as string | undefined;
  const itemId = created.itemId as string | undefined;
  if (!serviceUrl || !itemId) return null;

  const adminUrl = serviceUrl.replace('/rest/services/', '/rest/admin/services/');
  const table = {
    tables: [{
      name: TABLE_NAME,
      type: 'Table',
      objectIdField: 'OBJECTID',
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', nullable: false, editable: false },
        { name: F.pkgKey, type: 'esriFieldTypeString', length: 64, nullable: false, editable: true },
        { name: F.pkgGroup, type: 'esriFieldTypeString', length: 128, nullable: true, editable: true },
        { name: F.status, type: 'esriFieldTypeString', length: 32, nullable: false, editable: true },
        { name: F.author, type: 'esriFieldTypeString', length: 256, nullable: true, editable: true },
        { name: F.authorSent, type: 'esriFieldTypeDate', nullable: true, editable: true },
        { name: F.approver, type: 'esriFieldTypeString', length: 256, nullable: true, editable: true },
        { name: F.approverAt, type: 'esriFieldTypeDate', nullable: true, editable: true },
        { name: F.reason, type: 'esriFieldTypeString', length: 2048, nullable: true, editable: true },
        { name: F.note, type: 'esriFieldTypeString', length: 2048, nullable: true, editable: true },
        { name: F.rowCount, type: 'esriFieldTypeInteger', nullable: true, editable: true },
        { name: F.payload, type: 'esriFieldTypeString', length: PAYLOAD_MAX, nullable: true, editable: true },
        { name: F.okRows, type: 'esriFieldTypeString', length: 65536, nullable: true, editable: true },
      ],
    }],
  };
  await arcgisPost(`${adminUrl}/addToDefinition`, { token, addToDefinition: JSON.stringify(table) });
  await arcgisPost(
    `${restBase()}/content/users/${encodeURIComponent(user)}/items/${itemId}/share`,
    { token, org: 'true', everyone: 'false' },
  );
  return `${serviceUrl}/0`;
}

/**
 * Хүснэгтийн URL — олох, эс бөгөөс (super) үүсгэх.
 * ⚠️ Зөвхөн ОЛДСОН URL-ыг кэшлэнэ: `null`-ыг кэшлэвэл порталын search-ийн
 *    түр зуурын алдаа сешн даяар тогтмолжино (`permsRemote`-ийн сургамж).
 */
async function tableUrl(canCreate: boolean): Promise<string | null> {
  if (tableUrlCache) return tableUrlCache;
  const auth = await getToken();
  if (!auth) return null;
  let url = await findTableUrl(auth.token);
  /* ⚠️ ЗӨВХӨН ЭЗЭН ҮҮСГЭНЭ (`permsRemote`-ийн 2026-09-15-ны дүрэм, энд 2026-09-17). */
  if (!url && canCreate && !ownerMismatch && TABLE_OWNERS.has(auth.user.toLowerCase()))
    url = await createTable(auth.token, auth.user);
  if (url) tableUrlCache = url;
  return url;
}

/**
 * ХҮСНЭГТ БЭЛЭН ҮҮ — ба ҮГҮЙ бол ЯАГААД (2026-09-11).
 *
 * ⚠️ Урьд нь зөвхөн `boolean` буцаадаг байсан тул ГУРВАН огт өөр шалтгаан
 *    (нэвтрээгүй · эзэн танигдахгүй · порталын алдаа) нэг л «олдсонгүй»
 *    мессеж болж нийлдэг байв. Админ юу засахаа мэдэхгүй — 2026-09-11-нд
 *    баннер гарсан үед жинхэнэ шалтгаан нь `ownerMismatch` байсныг олоход
 *    амьд сүлжээний шалгалт шаардлагатай болсон.
 * ⚠️ `ok` нь хуучин `boolean`-той ИЖИЛ утгатай — дуудагч талын нөхцөл
 *    өөрчлөгдөхгүй, зөвхөн шалтгаан НЭМЭГДЭНЭ.
 */
export type PlanTableState = {
  ok: boolean;
  /**
   * `auth`   — ArcGIS-д нэвтрээгүй (токен алга)
   * `owner`  — ижил нэртэй хүснэгт бий ч эзэн нь танигдахгүй
   * `none`   — хүснэгт олдсонгүй (super нэвтрэхэд үүснэ)
   * `error`  — порталын хайлт алдаа өгсөн (мессеж нь `detail`-д)
   */
  why: 'ok' | 'auth' | 'owner' | 'none' | 'error';
  detail?: string;
};

export async function planTableState(canCreate = false): Promise<PlanTableState> {
  try {
    /* ⚠️ Токеныг ТУСАД НЬ шалгана: `tableUrl` нь токенгүй үед ч зүгээр
       `null` буцаадаг тул «нэвтрээгүй» ба «олдсонгүй» хоёр ялгагдахгүй. */
    if (!(await getToken())) return { ok: false, why: 'auth' };
    const url = await tableUrl(canCreate);
    if (url) return { ok: true, why: 'ok' };
    return { ok: false, why: ownerMismatch ? 'owner' : 'none' };
  } catch (e) {
    return { ok: false, why: 'error', detail: String((e as Error)?.message ?? e) };
  }
}

/** Хүснэгт бэлэн эсэх — хуучин дуудагчдад зориулсан нимгэн бүрхүүл */
export async function planTableReady(canCreate = false): Promise<boolean> {
  return (await planTableState(canCreate)).ok;
}

type Attrs = Record<string, unknown>;

const s = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

/** Мөрийг задлах — танигдахгүй төлөв нь `pending` руу УНАХГҮЙ, алгасна */
function toSubmission(a: Attrs): PlanSubmission | null {
  const oid = Number(a[F.oid]);
  if (!Number.isInteger(oid)) return null;
  const pkgKey = s(a[F.pkgKey]);
  if (!pkgKey) return null;
  const st = s(a[F.status]);
  const known = Object.values(PLAN_STATUS).find((x) => x === st);
  if (!known) return null;
  const n = (v: unknown): number | null => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  return {
    oid,
    pkgKey,
    pkgGroup: s(a[F.pkgGroup]) ?? '',
    status: known,
    author: (s(a[F.author]) ?? '').toLowerCase(),
    authorSent: n(a[F.authorSent]),
    approver: s(a[F.approver])?.toLowerCase() ?? null,
    approverAt: n(a[F.approverAt]),
    reason: s(a[F.reason]),
    note: s(a[F.note]),
    rowCount: Number(a[F.rowCount]) || 0,
    payload: String(a[F.payload] ?? ''),
    okRows: parseOkRows(okRowsAttr(a)),
  };
}

/**
 * Зөвшөөрсөн мөрийн жагсаалтыг задлах.
 * ⚠️ FAIL-CLOSED: эвдэрсэн/танигдахгүй бол `null` — «тэмдэглээгүй» гэж үзнэ,
 *    хагас задарсан жагсаалтаар зарим мөрийг ХУДЛАА ногоон болгохгүй.
 */
export function parseOkRows(v: unknown): number[] | null {
  if (v == null || String(v).trim() === '') return null;
  try {
    const j = JSON.parse(String(v)) as unknown;
    if (!Array.isArray(j)) return null;
    const out: number[] = [];
    for (const x of j) {
      const n = Number(x);
      if (!Number.isInteger(n)) return null;
      out.push(n);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * `zovshoorson_mor` талбар хүснэгтэд БАЙГАА ЭСЭХ (2026-09-25).
 * ⚠️ Зөвхөн АМЖИЛТТАЙ хариуг кэшлэнэ — сүлжээний түр алдаа «талбар алга»
 *    болж сешн даяар тогтмолжихоос сэргийлнэ (`tableUrl`-ийн ижил дүрэм).
 * ⚠️ Байхгүй талбарыг `outFields`-д нэрлэвэл ArcGIS БҮХ query-г алдаатай
 *    буцаадаг — тиймээс толгойн талбарын жагсаалт ҮҮНЭЭС хамаарна.
 */
/* ⚠️ ЗӨВХӨН «БАЙГАА»-г кэшлэнэ (2026-09-25 аудит): «алга» гэснийг кэшлэвэл админ
   AGOL дээр талбар нэмсний ДАРАА ч сешн даяар «алга» гэж үргэлжилнэ. */
let okRowsLenCache = 0;
/**
 * ⚠️ «АЛГА» ХАРИУГ БОГИНО ХУГАЦААНД кэшлэнэ (2026-09-25 аудит #9): урьд нь огт
 *    кэшлэдэггүй тул талбаргүй хүснэгтэд `loadPending`/`loadHistory`/`decidePlan`
 *    бүр layer-ийн мэдээллийг ДАХИН татдаг байв (дуудлага бүр +1 хүсэлт).
 *    60 секунд — админ AGOL дээр талбар нэмсний дараа сешн даяар «алга» гэж
 *    гацахгүй. ⚠️ Зөвхөн АМЖИЛТТАЙ хариу (талбарын жагсаалт ирсэн) кэшлэгдэнэ;
 *    сүлжээний алдаа кэшлэгдэхгүй.
 */
const OK_ROWS_MISS_TTL = 60_000;
let okRowsMissAt = 0;
/**
 * Талбарын ЖИНХЭНЭ нэр (том/жижиг үсэг AGOL-ийнхоор) — `outFields`, бичилт,
 * уншилт гурвуулаа үүгээр (2026-09-25 аудит #9). ⚠️ ArcGIS attributes-ийн
 * түлхүүр нь схемийн нэрийн ЯГ бичлэгээр ирдэг тул `a[F.okRows]` нь
 * `Zovshoorson_Mor` г.м. нэртэй талбарыг уншихгүй байв.
 */
let okRowsName: string = F.okRows;
/** Талбарын урт (тэмдэгт); `0` = талбар алга; `-1` = уншигдсангүй (сүлжээ/хүснэгтгүй) */
async function okRowsFieldLen(): Promise<number> {
  if (okRowsLenCache > 0) return okRowsLenCache;
  if (okRowsMissAt && Date.now() - okRowsMissAt < OK_ROWS_MISS_TTL) return 0;
  const url = await tableUrl(false);
  if (!url) return -1;
  try {
    const j = await arcgisPost(url, {});
    const fields = (j.fields as { name?: string; length?: number }[] | undefined) ?? [];
    /* ⚠️ 2026-09-29: талбарын жагсаалт ирээгүй = уншигдсангүй, «алга» биш */
    if (!fields.length) return -1;
    const f = fields.find((x) => (x.name ?? '').toLowerCase() === F.okRows);
    /* урт заагаагүй бол AGOL-ийн анхдагч 256 гэж үзнэ */
    const len = f ? (Number(f.length) > 0 ? Number(f.length) : 256) : 0;
    if (len > 0) { okRowsLenCache = len; okRowsName = f?.name ?? F.okRows; okRowsMissAt = 0; }
    /* ⚠️ Талбарын жагсаалт ИРСЭН үед л «алга»-г кэшлэнэ — хоосон/буруу хариу биш */
    else okRowsMissAt = Date.now();
    return len;
  } catch {
    return -1;
  }
}

/**
 * `catch`-ийн алдааг `{ ok: false, error }`-д ТЕКСТ болгоно (⚠️ 2026-10-06 аудит).
 * ⚠️ `String(e.message)` нь `query.ts`-ийн `sessionExpired` тэмдгийг ХАЯДАГ тул UI-ийн
 *    `userError` 499-ийг «эрх алга» гэж буруу ангилдаг байв — тэмдэгтэйг энд нэвтрэлтийн
 *    мессеж болгоно. Бусад нь түүхий хэвээр; дэлгэцэнд `userError`-оор орчуулагдана
 *    (lib нь `components/ui`-г импортлохгүй).
 */
function errText(e: unknown): string {
  if ((e as { sessionExpired?: boolean } | null)?.sessionExpired === true) {
    return tr('Нэвтрэлтийн хугацаа дууссан байна. Хуудсыг дахин ачаалж нэвтэрнэ үү.');
  }
  return String((e as Error | null)?.message || e);
}

/**
 * Дуудагчийн өгсөн нэр НЭВТЭРСЭН хэрэглэгчтэй ижил үү (хөтөчид, `AUTH.appId` үед).
 * ⚠️ 2026-09-29 аудит: `submitPlan`/`decidePlan`/`claimPlan` хүрээг `currentUser`-оор
 *    шалгаад НЭРИЙГ args-аас бичдэг байсан тул консолоос өөр нэр дамжуулж
 *    өөрийн илгээлтээ батлах, түүхэнд өөр нэр үлдээх боломжтой байв.
 *    Зөрвөл алдаа, эс бөгөөс `null`.
 */
function sameAsLogin(name: string): { ok: false; error: string } | null {
  if (typeof window === 'undefined' || !AUTH.appId) return null;
  const meNow = currentUser();
  if (!meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  if (meNow.toLowerCase() !== name.trim().toLowerCase()) return { ok: false, error: tr('Нэр нэвтэрсэн хэрэглэгчтэй зөрж байна — хуудсаа шинэчилнэ үү.') };
  return null;
}
/** Мөрийн attributes-аас `zovshoorson_mor`-ыг нэрийн том/жижиг үсэг үл харгалзан уншина */
function okRowsAttr(a: Attrs): unknown {
  if (okRowsName in a) return a[okRowsName];
  if (F.okRows in a) return a[F.okRows];
  const k = Object.keys(a).find((x) => x.toLowerCase() === F.okRows);
  return k ? a[k] : undefined;
}
export async function okRowsField(): Promise<boolean> {
  return (await okRowsFieldLen()) > 0;
}

async function query(where: string, outFields: string): Promise<Attrs[]> {
  const url = await tableUrl(false);
  if (!url) return [];
  const out: Attrs[] = [];
  for (let off = 0; ;) {
    const j = await arcgisPost(`${url}/query`, {
      where,
      outFields,
      returnGeometry: 'false',
      /* ⚠️ Хуудаслалтад `orderByFields` ЗААВАЛ — эс бөгөөс ArcGIS хуудас
         хооронд мөр давхардуулах/алгасах эрхтэй. */
      orderByFields: `${F.oid} ASC`,
      resultOffset: String(off),
      resultRecordCount: '1000',
    });
    const fs = (j.features as { attributes: Attrs }[]) ?? [];
    out.push(...fs.map((f) => f.attributes));
    /* ⚠️ `exceededTransferLimit`-ЭЭР таслана, `fs.length < 1000`-ААР БИШ (2026-10-06 аудит,
       `ajilBatlah.query`-ийн 2026-09-24-ний дүрэм): үйлчилгээний `maxRecordCount` 1000-аас
       бага бол эхний хуудас цөөн мөр буцаад давталт зогсож, үлдсэн илгээлт чимээгүй алга
       болдог байв. Шилжилт нь ИРСЭН мөрийн тоогоор, тогтмол 1000 БИШ. */
    if (!j.exceededTransferLimit || fs.length === 0) break;
    off += fs.length;
  }
  return out;
}

/** Бүх илгээлтийн ТОЛГОЙ — `payload`-гүй (жагсаалт хөнгөн байх ёстой) */
const HEAD_FIELDS = [
  F.oid, F.pkgKey, F.pkgGroup, F.status, F.author, F.authorSent,
  F.approver, F.approverAt, F.reason, F.note, F.rowCount,
].join(',');
/** Толгой + зөвшөөрсөн мөр (талбар БАЙГАА үед л — `okRowsField`-ийн ⚠️) */
const headFields = async (): Promise<string> =>
  ((await okRowsField()) ? `${HEAD_FIELDS},${okRowsName}` : HEAD_FIELDS);

/**
 * Багцын СҮҮЛИЙН илгээлт — хуудас нээхэд «хүлээгдэж буй юу» гэдгийг мэднэ.
 *
 * ⚠️ Зөвхөн `pending` нь хуваарийг ТҮГЖИНЭ. `approved`/`returned` нь түүх тул
 *    гүйцэтгэгч дахин засаж болно.
 */
export async function loadPending(pkgKey: string): Promise<PlanSubmission | null> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} = N'${PLAN_STATUS.pending}'`,
    HEAD_FIELDS,
  );
  const list = rows.map(toSubmission).filter((x): x is PlanSubmission => x != null);
  /* ⚠️ Хэд хэдэн pending үүссэн бол (зэрэгцээ илгээлтийн race) ЭХНИЙХ (бага OBJECTID) ялна —
     `submitPlan`-ийн давхардал арилгах дүрэмтэй ИЖИЛ (2026-10-01): тэнд бага нь үлдэж, их нь
     устдаг. Урьд «их ялна» байсан тул цуцлагдсан илгээлт хүлээгдэж буй мэт харагдах байв. */
  list.sort((a, b) => a.oid - b.oid);
  return list[0] ?? null;
}

/** Батлагчийн жагсаалт — хүлээгдэж буй БҮХ илгээлт */
export async function loadAllPending(): Promise<PlanSubmission[]> {
  const rows = await query(`${F.status} = N'${PLAN_STATUS.pending}'`, HEAD_FIELDS);
  return rows.map(toSubmission).filter((x): x is PlanSubmission => x != null);
}

/**
 * БАГЦ БҮРИЙН СҮҮЛИЙН ИЛГЭЭЛТ — толгой л (`payload`-гүй) (2026-09-29).
 * ⚠️ «Хуваарь батлах» хуудас зохиогчид БУЦААГДСАН илгээлтийг шалтгаантай нь харуулахад:
 *    буцаалт нь тухайн багцын СҮҮЛИЙН илгээлт байх үед л хүчинтэй (дараа нь дахин
 *    илгээсэн бол хуучин шалтгаан хамааралгүй). «Их OBJECTID ялна» (`loadPending`-тэй ижил).
 */
export async function loadLastPerPkg(): Promise<PlanSubmission[]> {
  const rows = await query('1=1', await headFields());
  const last = new Map<string, PlanSubmission>();
  for (const a of rows) {
    const x = toSubmission(a);
    /* ⚠️ 2026-10-01: давхардлын цуцлалт шийдвэр биш (`isDupCancel`) — буцаалтыг нуухгүй */
    if (x && !isDupCancel(x)) last.set(x.pkgKey, x);
  }
  return [...last.values()];
}

/** Багцын түүх — сүүлийн шийдвэрүүд (батлагдсан ба буцаагдсан) */
export async function loadHistory(pkgKey: string, limit = 20): Promise<PlanSubmission[]> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} <> N'${PLAN_STATUS.pending}'`,
    /* ⚠️ Түүхэнд л зөвшөөрсөн мөр хэрэгтэй (буцаагдсаныг гүйцэтгэгч харна) —
       хүлээгдэж буй жагсаалт хөнгөн хэвээр (`HEAD_FIELDS`). */
    await headFields(),
  );
  /* ⚠️ 2026-10-01: давхардлын цуцлалтыг хасна (`isDupCancel`) — `limit` хасалтын ДАРАА */
  const list = rows.map(toSubmission).filter((x): x is PlanSubmission => x != null && !isDupCancel(x));
  return list.slice(-limit).reverse();
}

/** Нэг илгээлтийн АГУУЛГА — батлахад л хэрэгтэй тул тусад нь татна */
export async function loadPayload(oid: number): Promise<PlanPayload | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.payload}`);
  if (!rows.length) return null;
  return parsePayload(String(rows[0][F.payload] ?? ''));
}

/**
 * Агуулгыг задлах — эвдэрсэн бол `null`.
 * ⚠️ Хагас задарсан ноорог хэрэглэвэл огноо ЧИМЭЭГҮЙ устана. Тиймээс бүтэн
 *    эсэхийг шалгаж, эргэлзвэл ТАТГАЛЗАНА.
 */
/**
 * `spans`-ийг ШАЛГАЖ ЦЭВЭРЛЭНЭ (2026-09-16 аудит).
 *
 * ⚠️ Урьд нь `typeof === "object"` л шалгаад `as` гэж хөрвүүлдэг байв. Нэг
 *    эвдэрсэн мөр (`{"12": 5}`, `{"12": null}`) дараалалд дэлгэгдэхэд render
 *    дотор `a.filter` TypeError шидэж, `ErrorBoundary` БҮХ «Хуваарь батлах»
 *    харагдацыг унагадаг байлаа — нэг мөр биш. Одоо мөр тус бүрээр
 *    fail-closed: массив бус утга, тоо бус `start`/`end` ХАЯГДАНА.
 * ⚠️ ХООСОН `{}` нь ХҮЧИНТЭЙ (`huvaariBatlah.check` §«хоосон spans»): «юу ч
 *    өөрчлөгдөөгүй» илгээлтийг `null` болговол батлагч «агуулга уншигдсангүй»
 *    гэсэн ХУДАЛ алдаа хараад илгээлт мөнхөд гацна. Тиймээс энд `null`
 *    буцаахгүй — эвдэрсэн зүйлийг л хаяна, юу ч үлдэхгүй бол `{}`.
 */
function sanitizeSpans(raw: object): PlanPayload['spans'] {
  const out: PlanPayload['spans'] = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    /* ⚠️ `map` — `filter` БИШ (2026-09-17): эвдэрсэн элементийг хаявал хойших
       блокуудын индекс нэгээр гулсаж, огноо өөр блокт бичигддэг байв. `null` = тэр
       блокт зурвасгүй. `start > end` мөн эвдэрсэнд тооцно. */
    const ok = v.map((x) => (
      x != null
      && typeof x === 'object'
      && Number.isFinite((x as { start?: unknown }).start)
      && Number.isFinite((x as { end?: unknown }).end)
      && (x as { start: number }).start <= (x as { end: number }).end
        ? x : null
    ));
    out[k] = ok as PlanPayload['spans'][string];
  }
  return out;
}

/** Тоо эсвэл `null` — бусад бүхэн (мөр, NaN, undefined) `null` (fail-closed) */
const numOrNull = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * `actual`-ыг ШАЛГАЖ ЦЭВЭРЛЭНЭ (2026-09-23) — `sanitizeSpans`-ын ижил ёс:
 * мөр тус бүрээр fail-closed, эвдэрсэн элемент `null` (`map`, `filter` БИШ —
 * индекс гулсвал огноо өөр блокт бичигдэнэ). `start`/`end` хоёул массив
 * биш бол мөрийг хаяна.
 */
function sanitizeActual(raw: object): PlanPayload['actual'] {
  const out: PlanPayload['actual'] = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const s = (v as { start?: unknown }).start;
    const e = (v as { end?: unknown }).end;
    if (!Array.isArray(s) || !Array.isArray(e)) continue;
    out[k] = { start: s.map(numOrNull), end: e.map(numOrNull) };
  }
  return out;
}

/* ⚠️ Сарын/мөрийн нөөц БҮХЭЛ тоо (2026-09-24): мөрийн талбар Integer тул бутархай
   илгээлт батлагдахад нийлбэр зөрдөг байв. */
const intOrNull = (x: unknown): number | null => { const v = numOrNull(x); return v == null ? null : Math.floor(v); };

/** `res` (хүн хүч · машин) — объект биш мөрийг хаяна, тоо биш утга `null`.
    ⚠️ Мөрийн талбар Integer тул `intOrNull` (2026-09-24 аудит) — сарын нөөцтэй ижил. */
function sanitizeRes(raw: object): PlanPayload['res'] {
  const out: PlanPayload['res'] = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    out[k] = {
      hun: intOrNull((v as { hun?: unknown }).hun),
      mashin: intOrNull((v as { mashin?: unknown }).mashin),
    };
  }
  return out;
}

/** `obres` (сарын нөөц, 2026-09-24) — түлхүүр → сар → {hun, mashin}; эвдэрсэн сар хаягдана */
function sanitizeObRes(raw: object): NonNullable<PlanPayload['obres']> {
  const out: NonNullable<PlanPayload['obres']> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const months: Record<string, { hun: number | null; mashin: number | null }> = {};
    for (const [sar, x] of Object.entries(v as Record<string, unknown>)) {
      if (!x || typeof x !== 'object') continue;
      months[sar] = { hun: intOrNull((x as { hun?: unknown }).hun), mashin: intOrNull((x as { mashin?: unknown }).mashin) };
    }
    out[k] = months;
  }
  return out;
}

/** `keys` — эвдэрсэн хосыг хаяна (зөөлт нэмэлт; нэг буруу хос бүх саналыг унагахгүй) */
function sanitizeKeys(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const des = typeof v === 'number' ? v : Number.NaN;
    if (Number.isInteger(Number(k)) && Number.isInteger(des)) out[k] = des;
  }
  return out;
}

export function parsePayload(raw: string): PlanPayload | null {
  try {
    const j = JSON.parse(raw) as Partial<PlanPayload>;
    if (!j || typeof j !== 'object') return null;
    const spans = j.spans && typeof j.spans === 'object' ? sanitizeSpans(j.spans) : null;
    if (!spans) return null;
    /*
     * ⚠️ БУЦАЖ НИЙЦТЭЙ: 2026-09-11-ээс ӨМНӨХ илгээлтэд `kind` БАЙХГҮЙ.
     *    Тэр үед зөвхөн ТӨЛӨВЛӨСӨН огноо байсан тул `'plan'` гэж үзэх нь
     *    ҮНЭН — таамаг биш, баримт. Танихгүй утга ирвэл мөн `'plan'`:
     *    хуваарийг гэрээний талбарт БУРУУ бичихээс сэргийлнэ.
     */
    const kind: PlanPayloadKind = j.kind === 'geree' ? 'geree' : 'plan';
    /* ⚠️ `base` (2026-09-21) — байхгүй/эвдэрсэн бол `undefined`: дуудагч
       «бүх блок зассан» гэсэн хуучин зан үйл рүү унана, илгээлт унахгүй. */
    const b = j.base && typeof j.base === 'object' ? j.base : null;
    const base = b && b.spans && typeof b.spans === 'object'
      ? {
        spans: sanitizeSpans(b.spans),
        deps: (b.deps && typeof b.deps === 'object' ? b.deps : {}) as NonNullable<PlanPayload['base']>['deps'],
        obyem: (b.obyem && typeof b.obyem === 'object' ? b.obyem : {}) as NonNullable<PlanPayload['base']>['obyem'],
        /* Бодит огноо · нөөцийн суурь (2026-09-23) — байвал л */
        ...(b.actual && typeof b.actual === 'object' ? { actual: sanitizeActual(b.actual) } : {}),
        ...(b.res && typeof b.res === 'object' ? { res: sanitizeRes(b.res) } : {}),
        ...(b.obres && typeof b.obres === 'object' ? { obres: sanitizeObRes(b.obres) } : {}),
      }
      : undefined;
    return {
      kind,
      spans,
      deps: (j.deps && typeof j.deps === 'object' ? j.deps : {}) as PlanPayload['deps'],
      obyem: (j.obyem && typeof j.obyem === 'object' ? j.obyem : {}) as PlanPayload['obyem'],
      /* ⚠️ БУЦАЖ НИЙЦТЭЙ (2026-09-23): хуучин илгээлтэд байхгүй → `{}` — унахгүй. */
      actual: j.actual && typeof j.actual === 'object' ? sanitizeActual(j.actual) : {},
      res: j.res && typeof j.res === 'object' ? sanitizeRes(j.res) : {},
      /* Сарын нөөц (2026-09-24) — хуучин илгээлтэд байхгүй → `{}` */
      obres: j.obres && typeof j.obres === 'object' ? sanitizeObRes(j.obres) : {},
      ...(base ? { base } : {}),
      /* Мөрийн тогтвортой түлхүүр (2026-09-29) — бүхэл тоон `oid` → бүхэл код л үлдэнэ */
      ...(j.keys && typeof j.keys === 'object' ? { keys: sanitizeKeys(j.keys) } : {}),
    };
  } catch {
    return null;
  }
}

const editOk = (res: unknown): boolean => {
  const arr = (res as { success?: boolean }[]) ?? [];
  return arr.length > 0 && arr.every((r) => r.success === true);
};

/**
 * ИЛГЭЭХ — гүйцэтгэгчийн «Батлуулах».
 *
 * ⚠️ Эх хуудсанд ЮУ Ч бичихгүй. Зөвхөн энэ хүснэгтэд хүлээнэ.
 * ⚠️ Тухайн багцад хүлээгдэж буй илгээлт БАЙВАЛ татгалзана — хоёр санал
 *    зэрэг хүлээвэл батлагч алийг нь батлахаа мэдэхгүй, мөн хоёулаа
 *    батлагдвал сүүлийнх нь өмнөхийг чимээгүй дарна.
 */
export async function submitPlan(args: {
  pkgKey: string;
  pkgGroup: string;
  author: string;
  rowCount: number;
  note?: string;
  payload: PlanPayload;
}): Promise<{ ok: boolean; error?: string }> {
  /* ⚠️ 2026-09-29 аудит: `aguulga` 1,048,576 тэмдэгт — `base` нэмэгдсэнээс хойш
     том багцад (1,459 мөр × 22 блок) хэтэрч `applyEdits` шалтгаангүй унадаг байв.
     Цэвэр шалгуур тул эрх/сүлжээнээс ӨМНӨ. */
  const payloadJson = JSON.stringify(args.payload);
  if (payloadJson.length > PAYLOAD_MAX) {
    return { ok: false, error: tr('Илгээлтийн агуулга хэт том ({0} тэмдэгт, дээд {1}) — ноорогоо хэд хэдэн илгээлтэд хуваана уу.', String(payloadJson.length), String(PAYLOAD_MAX)) };
  }
  /* ⚠️ ХҮРЭЭГ lib-д ШАЛГАНА (2026-09-17): урьд нь зөвхөн UI. `null` = хязгааргүй. */
  if (AUTH.appId) {
    /* ⚠️ НЭВТЭРСЭН хэрэглэгчээр (дуудагчийн `author` БИШ) — консолоос super-ийн
       нэр дамжуулж алгасахаас (2026-09-17). Хөтөчид нэвтрээгүй бол хаана. */
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    /* ⚠️ 2026-09-29 аудит: хадгалагдах ЗОХИОГЧ = нэвтэрсэн хүн. Урьд нь хүрээг
       `meNow`-оор шалгаад нэрийг `args.author`-оос бичдэг тул консолоос өөр нэр
       дамжуулж илгээгээд ӨӨРӨӨ батлах боломжтой байв (`withdrawPlan`-тай ижил дүрэм). */
    const own = sameAsLogin(args.author);
    if (own) return own;
    const sc = huvaariScope(meNow ?? args.author, 'author');
    if (sc !== null && !sc.includes(args.pkgGroup))
      return { ok: false, error: tr('Энэ багцад хуваарь илгээх эрхгүй.') };
  }
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const already = await loadPending(args.pkgKey);
  if (already) {
    return { ok: false, error: tr('Энэ багцад батлагдаагүй илгээлт байна — эхлээд шийдвэрлүүлнэ үү.') };
  }
  const attrs: Attrs = {
    [F.pkgKey]: args.pkgKey,
    [F.pkgGroup]: args.pkgGroup,
    [F.status]: PLAN_STATUS.pending,
    [F.author]: args.author.toLowerCase(),
    [F.authorSent]: Date.now(),
    [F.rowCount]: args.rowCount,
    [F.note]: args.note?.trim() || null,
    [F.payload]: payloadJson,
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.addResults)) return { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    invalidate('HUVAARI_BATLAH');
    /*
     * ⚠️ ДАВХАР ИЛГЭЭЛТ АРИЛГАХ (2026-10-01, хэрэглэгч). Дээрх `loadPending` шалгалт ба
     *    `adds` хоёрын завсарт хоёр хүн зэрэг дарвал хоёулаа шалгалтыг давж, нэг багцад
     *    хоёр `pending` үүсдэг байв. Бичсэний ДАРАА дахин уншиж, БАГА OBJECTID-тай (түрүүлж
     *    бичигдсэн) илгээлт байвал ӨӨРИЙНХӨӨ мөрийг устгана — хоёр тал ижил дүрмээр
     *    шийддэг тул яг нэг нь үлдэнэ. Устгал унавал `withdrawn` болгоно (pending-ээс гарна).
     */
    const mine = Number((j.addResults as { objectId?: number }[])[0]?.objectId);
    /* ⚠️ Давхардлын шалгалт унавал (сүлжээ · 498) илгээлт ХАДГАЛАГДСАН хэвээр — `ok:false`
       буцаавал UI түгжигдэхгүй, дахин илгээх нь «илгээлт байна»-д унадаг байв. */
    if (Number.isFinite(mine)) try {
      const rows = await query(
        `${F.pkgKey} = '${args.pkgKey.replace(/'/g, "''")}' AND ${F.status} = N'${PLAN_STATUS.pending}'`,
        `${F.oid},${F.author}`,
      );
      const first = rows.map((a) => Number(a[F.oid])).filter(Number.isFinite).sort((a, b) => a - b)[0];
      if (first != null && first < mine) {
        const del = await arcgisPost(`${url}/applyEdits`, { deletes: String(mine) }).catch(() => null);
        if (!editOk(del?.deleteResults)) {
          /* ⚠️ 2026-10-01: `DUP_MARK`-аар ялгана — «сүүлийн шийдвэр» болохгүй (`isDupCancel`) */
          await arcgisPost(`${url}/applyEdits`, {
            updates: JSON.stringify([{ attributes: { [F.oid]: mine, [F.status]: PLAN_STATUS.withdrawn, [F.reason]: DUP_MARK, [F.approverAt]: null } }]),
          }).catch(() => null);
        }
        invalidate('HUVAARI_BATLAH');
        const who = s(rows.find((a) => Number(a[F.oid]) === first)?.[F.author]);
        return { ok: false, error: tr('{0} энэ багцын хуваарийг түрүүлж илгээсэн байна — таны илгээлт цуцлагдлаа. Эхлээд шийдвэрлүүлнэ үү.', who || tr('Өөр хэрэглэгч')) };
      }
    } catch { /* давхардлыг `loadPending` (бага OBJECTID ялна) шийднэ */ }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/**
 * ШИЙДВЭР — батлах эсвэл буцаах.
 *
 * ⚠️ ЭХ ХУУДАСНД БИЧИХ нь ЭНД БИШ, дуудагч талд (`Huvaari`) — учир нь тэр
 *    ажил нь схем, мөрийн зураглал, агшин солигдох зэрэг эх хуудасны бүх
 *    нарийн ширийнийг мэддэг `applyUpdates`-ыг шаарддаг. Энэ модуль зөвхөн
 *    урсгалын ТӨЛӨВИЙГ хөтөлнө.
 *
 * ⚠️ Дараалал: эх хуудсанд АМЖИЛТТАЙ бичигдсэний ДАРАА л энэ мөрийг
 *    `approved` болгоно. Эсрэгээр хийвэл бичилт унасан үед «батлагдсан» гэж
 *    харагдах атлаа хуваарь хуучин хэвээр үлдэнэ.
 */
export async function decidePlan(args: {
  oid: number;
  approve: boolean;
  approver: string;
  /**
   * Илгээсэн хүн — ЗӨВХӨН нөөц (fallback).
   *
   * ⚠️ 2026-09-15-ны аудит: дүрмийн ЖИНХЭНЭ эх нь ЭНЭ БИШ, СЕРВЕРИЙН мөрийн
   *    `F.author` (доор `cur`-аас уншина). Дуудагчийн өгсөн утгад найдвал
   *    консолоос `author: ''` дамжуулаад хамгаалалтыг бүрэн алгасаж болно.
   */
  author?: string;
  reason?: string;
  /**
   * Батлагчийн ЗӨВШӨӨРСӨН мөрүүд (2026-09-25) — `PlanSubmission.okRows`.
   * ⚠️ `undefined` = тэмдэглээгүй (талбарт ХҮРЭХГҮЙ). Талбар хүснэгтэд байхгүй
   *    бол шийдвэр ХАДГАЛАГДАНА, гэвч `warn`-аар ил хэлнэ — гүйцэтгэгч
   *    улаан/ногоон тэмдэглэгээг харахгүй.
   */
  okRows?: number[];
}): Promise<{ ok: boolean; error?: string; warn?: string }> {
  /*
   * ⚠️ ДҮРМҮҮДИЙГ СҮЛЖЭЭНЭЭС ӨМНӨ шалгана. `tableUrl`-ийн ДАРАА байрлуулбал
   *    ArcGIS уншигдахгүй орчинд «хүснэгт олдсонгүй» гэсэн буруу шалтгаан
   *    буцааж, дүрэм нь чимээгүй алга болно (тест яг үүнийг барьсан).
   *
   * ⚠️ ЗОХИОГЧ ӨӨРИЙГӨӨ БАТЛАХГҮЙ. Энэ шалгуур UI-д БИШ, ЭНД байх ёстой:
   *    товч нуух нь харагдацын асуудал, харин дүрэм нь өгөгдлийнх. Хоёр эрх
   *    (`plan` + `planApprove`) нэг хүнд олгогдвол товч нь идэвхтэй болох тул
   *    ганц хамгаалалт нь энэ.
   *
   * ⚠️ ХОЁР ДАВХАР ШАЛГУУР (2026-09-15-ны аудит):
   *      (1) ЭНД — дуудагчийн өгсөн `author`-оор, СҮЛЖЭЭНЭЭС ӨМНӨ. Энэ нь
   *          ArcGIS уншигдахгүй орчинд дүрэм чимээгүй алга болохоос сэргийлнэ
   *          (тест яг үүнийг барьдаг).
   *      (2) `cur`-ийн ДАРАА — СЕРВЕРИЙН мөрийн `F.author`-оор. Учир нь (1)
   *          нь дуудагчийн өгсөн утгад найддаг тул консолоос `author: ''`
   *          дамжуулаад бүрэн алгасаж болно. Жинхэнэ эх нь ЗӨВХӨН сервер.
   */
  const me = args.approver.trim().toLowerCase();
  const claimed = (args.author ?? '').trim().toLowerCase();
  if (me && claimed && me === claimed) {
    return { ok: false, error: tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  if (!args.approve && !args.reason?.trim()) {
    return { ok: false, error: tr('Буцаах шалтгааныг бичнэ үү.') };
  }
  /* ⚠️ 2026-10-01: нэргүй шийдвэр түгжээ авч чадахгүй (`casClaim` нэрээр баталгаажуулдаг) —
     урьд нь нэвтрэлтгүй горимд «батлагч: хоосон» шийдвэр бичигддэг байв. */
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  /* ⚠️ 2026-09-29 аудит: хадгалагдах БАТЛАГЧ = нэвтэрсэн хүн (`withdrawPlan`-тай ижил) —
     `args.approver`-т өөр нэр дамжуулж «өөрийгөө батлахгүй» дүрмийг тойрдог байв. */
  const own = sameAsLogin(me);
  if (own) return own;
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  /*
   * ⚠️ ШИЙДВЭР ГАРСАН ЭСЭХИЙГ ДАХИН ШАЛГАНА (2026-09-07-ны шалгалт).
   *    Хоёр батлагч хуудсаа зэрэг нээгээд нэг нь баталчихвал нөгөөгийн
   *    дэлгэц ХУУЧИН хэвээр («Шийдвэрлэх» товч харагдсаар) үлдэнэ. Түүнийг
   *    дарахад ижил огноо ХОЁР ДАХЬ УДАА бичигдэж, шийдвэр гаргасан хүний
   *    нэр чимээгүй дарагдана. Мөр нь ганц тул `applyEdits` алдаа өгөхгүй —
   *    ЗӨВХӨН энэ шалгуур л барина.
   */
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.approver},${F.approverAt},${F.author},${F.pkgGroup},${F.reason}`);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  /* ⚠️ БАТЛАГЧИЙН ХҮРЭЭГ СЕРВЕРИЙН БАГЦААР (2026-09-17): урьд нь зөвхөн UI. */
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc = huvaariScope(meNow ?? me, 'approver');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцын хуваарийг батлах эрхгүй.') };
  }
  /*
   * ⚠️ ХОЁР ДАХЬ ШАЛГУУР — ЗОХИОГЧ СЕРВЕРЭЭС (2026-09-15-ны аудит).
   *    Дээрх эрт шалгуур нь дуудагчийн өгсөн утгад найддаг тул консолоос
   *    `author: ''` дамжуулаад (эсвэл UI-д `pending` null болсон агшинд
   *    `pending?.author ?? ''` → `''` болох тул) бүрэн алгасагдаж,
   *    `plan`+`planApprove` хоёулаа бүхий хүн өөрийн хуваарийг өөрөө батлаж
   *    чаддаг байв. Мөрийн жинхэнэ зохиогчийг ЗӨВХӨН сервер мэднэ.
   */
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (me && author && me === author) {
    return { ok: false, error: tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== PLAN_STATUS.pending) {
    const by = s(cur[0][F.approver]);
    return {
      ok: false,
      error: by
        ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, curStatus ?? '')
        : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'),
    };
  }
  /* ⚠️ ХАГАС БИЧИГДСЭН САНАЛЫГ БУЦААХГҮЙ (2026-10-01, `PARTIAL_MARK`-ийн ⚠️) — огноо нь эх
     хуудсанд аль хэдийн орсон; буцаавал «буцаагдсан» санал хуваарьт үлдэнэ. Батлах нь
     (бичилтийг гүйцээх) зөвшөөрөгдөнө. Хугацаагүй, сервер дээр — сэргээлт/TTL-ээр алга болохгүй. */
  if (!args.approve) {
    const pb = partialBy(curStatus, s(cur[0][F.reason]));
    if (pb != null) {
      return { ok: false, error: tr('Энэ илгээлтийн хуваарийг батлагч ({0}) эх хуудсанд ХЭСЭГЧЛЭН бичсэн — буцаах боломжгүй. «Батлах»-ыг дахин дарж бичилтийг гүйцээнэ үү.', pb || '—') };
    }
  }
  /* ⚠️ 2026-09-25 аудит: ӨӨР батлагч түгжсэн (эх хуудсанд бичиж буй) бол шийдвэр
     гаргахгүй — хоёр дахь батлагчийн буцаалт/батлалт эхнийхийн бичилтийг дарна. */
  const holder = claimHolder(cur[0]);
  if (holder && holder !== me) {
    return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', holder) };
  }
  /* ⚠️ 2026-09-29 аудит: БАТЛАХАД түгжээ ӨӨРИЙНХ байх ёстой (хугацаа дууссан ч).
     `save` 10 минутаас хэтэрвэл өөр батлагч түгжиж чаддаг байв — тэр үед энэ
     батлалт нөгөөгийн бичилтийг «батлагдсан» болгоно. ӨӨР хүний (хугацаа нь
     дууссан ч) түгжээтэй бол батлахгүй; буцаалт (`approve=false`) хуучин дүрмээр.
     ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): урьд энд «`approver` ХООСОН бол зогсоно»
     гэж бичсэн ч код нь хоосон түгжээг ӨНГӨРӨӨЖ, түгжээгүйгээр шийддэг байв (зохиогчийн
     татахтай зэрэг явж болох). ОДОО: хоосон (эсвэл өөрийн хугацаа дууссан) түгжээг
     доорх `casClaim`-аар АТОМААР авна (дахин унш → хоосон хэвээр бол өөр дээрээ тавь
     → дахин уншиж баталгаажуул), ДАРАА нь шийднэ; өөр хүн барьж авбал НЭРИЙГ нь хэлж
     татгалзана. Буцаалт ч мөн түгжээгүйгээр шийдэхгүй. */
  const raw = s(cur[0][F.approver])?.trim().toLowerCase() ?? '';
  if (args.approve && raw && raw !== me) {
    return { ok: false, error: tr('{0} энэ илгээлтийг түгжсэн байна — таны түгжээ хугацаа дууссан. Хуудсаа шинэчилнэ үү.', raw) };
  }
  /** Энэ дуудлага өөрөө түгжээ авсан уу — шийдвэрийн бичилт унавал тайлна */
  let tookClaim = false;
  if (holder !== me) {
    const fields = `${F.oid},${F.status},${F.approver},${F.approverAt}`;
    try {
      const got = await casClaim({
        read: async () => (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null,
        write: (at) => writeClaim(url, args.oid, me, at),
      }, me, { requireEmpty: args.approve });
      if (!got.ok) return { ok: false, error: claimError(got) };
    } catch (e) {
      return { ok: false, error: errText(e) };
    }
    tookClaim = true;
  }
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: args.approve ? PLAN_STATUS.approved : PLAN_STATUS.returned,
    [F.approver]: me,
    [F.approverAt]: Date.now(),
    [F.reason]: args.approve ? null : (args.reason?.trim()?.slice(0, REASON_MAX) ?? null),
  };
  let warn: string | undefined;
  if (args.okRows) {
    const js = JSON.stringify(args.okRows.filter((x) => Number.isInteger(x)));
    const len = await okRowsFieldLen();
    /* ⚠️ 2026-09-29 аудит: «уншигдсангүй» (−1) ≠ «алга» (0) — сүлжээний алдаанд
       «AGOL дээр талбар нэмнэ үү» гэсэн худал заавар өгдөг байв. */
    if (len < 0) warn = tr('«{0}» талбарын урт уншигдсангүй (сүлжээ) — зөвшөөрсөн мөрийн тэмдэглэгээ хадгалагдсангүй (шийдвэр хадгалагдсан).', F.okRows);
    else
    /* ⚠️ УРТ ХЭТЭРВЭЛ БИЧИХГҮЙ (2026-09-25 аудит): AGOL-ийн анхдагч 256 тэмдэгттэй
       талбарт ~35-аас олон мөр багтахгүй — хэтэрсэн утга `applyEdits`-ийг бүхэлд нь
       унагаж, батлагч БУЦААЖ ЧАДАХГҮЙ болно. Шийдвэр чухал, тэмдэглэгээ нэмэлт. */
    if (len > 0 && js.length <= len) attrs[okRowsName] = js;
    else if (len > 0) warn = tr('«{0}» талбар богино ({1} тэмдэгт) — зөвшөөрсөн мөрийн тэмдэглэгээ багтсангүй (шийдвэр хадгалагдсан). AGOL дээр талбарын уртыг 65536 болгоно уу.', F.okRows, String(len));
    else warn = tr('Батлах хүснэгтэд «{0}» талбар алга — зөвшөөрсөн мөрийн тэмдэглэгээ хадгалагдсангүй (шийдвэр хадгалагдсан). AGOL дээр String (урт 65536) талбар нэмнэ үү.', F.okRows);
  }
  /* ⚠️ 2026-10-01: ӨӨРӨӨ авсан түгжээг шийдвэр бичигдээгүй үед тайлна — эс бөгөөс
     `CLAIM_TTL` (10 мин) дуустал зохиогч татаж, өөр батлагч шийдэж чадахгүй. */
  const undo = () => { if (tookClaim) void releasePlanClaim({ oid: args.oid, approver: me }); };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) { undo(); return { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') }; }
    invalidate('HUVAARI_BATLAH');
    return { ok: true, warn };
  } catch (e) {
    undo();
    return { ok: false, error: errText(e) };
  }
}

/**
 * ТҮГЖЭЭГ АТОМААР АВАХ (CAS) — `claimPlan` ба `decidePlan` хоёулаа (2026-10-01,
 * хэрэглэгч: бүгдийг зас).
 *
 * ⚠️ ArcGIS-д нөхцөлт update БАЙХГҮЙ тул «харьцуулаад солих»-ыг гурван алхмаар:
 *    (1) ДАХИН УНШ — `pending` хэвээр, өөр хүний хүчинтэй түгжээгүй (`requireEmpty`
 *        үед: өөр хүний хугацаа дууссан түгжээ ч байхгүй) байх ёстой;
 *    (2) ӨӨР ДЭЭРЭЭ БИЧ (`approver = me`, `approverAt = at`);
 *    (3) ДАХИН УНШИЖ баталгаажуул — зэрэг бичсэн хүн ялсан бол түүний НЭРИЙГ буцаана.
 *    Зэрэг хоёр түгжилтийн завсар маш богино болно, тэг биш (`claimPlan`-ийн ⚠️).
 * ⚠️ ЦЭВЭР (сүлжээг `io`-оор) — `huvaariBatlah.check` хуурамч `io`-оор тестэлнэ.
 */
export type ClaimFail = { ok: false; why: 'gone' | 'decided' | 'held' | 'expired' | 'write' | 'lost'; holder: string | null; status?: string | null };
export async function casClaim(
  io: { read: () => Promise<Attrs | null>; write: (at: number) => Promise<boolean>; now?: () => number },
  me: string,
  opt: { requireEmpty: boolean },
): Promise<{ ok: true } | ClaimFail> {
  const now = io.now ?? Date.now;
  const row = await io.read();
  if (!row) return { ok: false, why: 'gone', holder: null };
  const st = s(row[F.status]);
  if (st !== PLAN_STATUS.pending) return { ok: false, why: 'decided', holder: s(row[F.approver])?.toLowerCase() ?? null, status: st };
  const h = claimHolder(row, now());
  if (h && h !== me) return { ok: false, why: 'held', holder: h };
  const raw = s(row[F.approver])?.toLowerCase() ?? '';
  if (opt.requireEmpty && raw && raw !== me) return { ok: false, why: 'expired', holder: raw };
  const at = now();
  if (!(await io.write(at))) return { ok: false, why: 'write', holder: null };
  const back = await io.read();
  const who = back ? s(back[F.approver])?.toLowerCase() ?? null : null;
  const ok = !!back
    && s(back[F.status]) === PLAN_STATUS.pending
    && who === me
    /* Огнооны талбар секундээр тайрагдаж болзошгүй — 1 с-ийн хүлцэл */
    && Math.abs(Number(back[F.approverAt]) - at) < 1000;
  if (ok) return { ok: true };
  return { ok: false, why: 'lost', holder: who && who !== me ? who : null };
}

/** `casClaim`-ийн татгалзлыг хэрэглэгчийн мессеж болгоно — БАЙГАА мөрүүд (шинэ tr() үгүй) */
function claimError(f: ClaimFail): string {
  switch (f.why) {
    case 'gone': return tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.');
    case 'decided': return f.holder
      ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', f.holder, f.status ?? '')
      : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.');
    case 'expired': return tr('{0} энэ илгээлтийг түгжсэн байна — таны түгжээ хугацаа дууссан. Хуудсаа шинэчилнэ үү.', f.holder ?? '');
    case 'write': return tr('ArcGIS-т хадгалагдсангүй.');
    case 'held':
    case 'lost':
    default: return f.holder
      ? tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', f.holder)
      : tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.');
  }
}

/** Түгжээг бичнэ (`approver`/`approverAt`) — амжилттай бол `HUVAARI_BATLAH`-ыг хүчингүй болгоно */
async function writeClaim(url: string, oid: number, me: string, at: number): Promise<boolean> {
  const j = await arcgisPost(`${url}/applyEdits`, {
    updates: JSON.stringify([{ attributes: { [F.oid]: oid, [F.approver]: me, [F.approverAt]: at } }]),
    rollbackOnFailure: 'true',
  });
  if (!editOk(j.updateResults)) return false;
  invalidate('HUVAARI_BATLAH');
  return true;
}

/**
 * НЭГ ИЛГЭЭЛТИЙН ТОЛГОЙ (`payload`-гүй) — `oid`-оор (2026-10-01).
 * ⚠️ Батлагч эх хуудсанд бичихийн ӨМНӨ төлвийг дахин уншихад (`approveGuard`):
 *    `loadPending(pkgKey)` нь «татсан» ба «шийдвэрлэсэн»-ийг ялгахгүй (хоёулаа `null`).
 */
export async function loadSubmissionHead(oid: number): Promise<PlanSubmission | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, HEAD_FIELDS);
  return rows.length ? toSubmission(rows[0]) : null;
}

/**
 * ЭХ ХУУДСАНД БИЧИХИЙН ӨМНӨХ ХАМГААЛАЛТ — цэвэр функц (2026-10-01, хэрэглэгч: бүгдийг зас).
 *
 * ⚠️ ЯАГААД: батлагч `claimPlan`-аар түгжээд `save` руу ордог ч хооронд нь (урт
 *    бэлтгэл, сүлжээ удаан, түгжээ 10 минутаас хэтэрсэн) зохиогч ТАТАХ, өөр батлагч
 *    ШИЙДЭХ боломжтой. Тэр үед эх хуудсанд бичвэл «татсан/буцаагдсан» санал хуваарьт
 *    суух байв. Бичихийн ЯГ ӨМНӨ төлвийг дахин уншаад энэ функцээр шийднэ.
 * @returns `null` = бичиж болно; мөр = яагаад зогссон (хэрэглэгчид харуулна)
 */
export function approveGuard(
  fresh: Pick<PlanSubmission, 'oid' | 'status' | 'approver' | 'approverAt'> | null,
  oid: number,
  me: string,
  now = Date.now(),
): string | null {
  const mine = me.trim().toLowerCase();
  if (!fresh || fresh.oid !== oid) return tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.');
  if (fresh.status === PLAN_STATUS.withdrawn) {
    return tr('Зохиогч илгээлтээ татсан байна — эх хуудсанд юу ч бичигдсэнгүй. Хуудсаа шинэчилнэ үү.');
  }
  if (fresh.status !== PLAN_STATUS.pending) {
    return fresh.approver
      ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', fresh.approver, fresh.status)
      : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.');
  }
  const h = claimHolderOf(fresh, now);
  if (h === mine) return null;
  if (h) return tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', h);
  return tr('Таны батлах түгжээний хугацаа дууссан — эх хуудсанд юу ч бичигдсэнгүй. «Батлах»-ыг дахин дарна уу.');
}

/**
 * БАТЛАХ ТҮГЖЭЭ (claim) — 2026-09-25 аудит.
 *
 * ⚠️ ЯАГААД: батлах гинж нь ЭХЛЭЭД эх хуудсанд бичээд (`save`), ДАРАА нь төлөвийг
 *    `approved` болгодог. Завсарт нь зохиогч татах эсвэл хоёр дахь батлагч
 *    буцаах/батлах боломжтой байсан тул «татсан»/«буцаагдсан» санал эх хуудсанд
 *    бичигдэж, хоёр батлагч ижил хуваарийг давхар бичдэг байв.
 * ⚠️ ХЭЛБЭР: ШИНЭ ТӨЛӨВ НЭМЭЭГҮЙ — `pending` хэвээр, `approver` = түгжигч,
 *    `approverAt` = түгжсэн агшин. Шинэ төлөв нэмбэл `loadPending`/`loadHistory`/
 *    дараалал/`submitPlan`-ийн «хүлээгдэж буй» шүүлт бүгд зөрнө. `pending` мөрийн
 *    `approver`-ийг өөр хаана ч уншдаггүй.
 * ⚠️ ХУГАЦААТАЙ (`CLAIM_TTL`): хөтөч батлах явцад хаагдвал түгжээ мөнхөд үлдэхгүй.
 * ⚠️ ArcGIS-д нөхцөлт update БАЙХГҮЙ — бичсэний дараа дахин уншиж өөрийнх эсэхийг
 *    шалгана (`claimPlan`). Зэрэг хоёр түгжилтийн завсар маш богино болно, тэг биш.
 */
const CLAIM_TTL = 10 * 60_000;
/** `pending` мөрийг хугацаа нь дуусаагүй түгжээтэй байлгаж буй хүн (жижиг үсгээр), эсвэл `null` */
function claimHolder(a: Attrs, now = Date.now()): string | null {
  if (s(a[F.status]) !== PLAN_STATUS.pending) return null;
  const who = s(a[F.approver])?.toLowerCase() ?? null;
  const at = Number(a[F.approverAt]);
  if (!who || !Number.isFinite(at) || at <= 0) return null;
  return now - at < CLAIM_TTL ? who : null;
}
/**
 * Жагсаалтын мөрөөс түгжигчийг уншина (`claimHolder`-тай ИЖИЛ дүрэм) — 2026-09-29
 * аудит: батлагчийн жагсаалт «X батлаж байна» гэж харуулж, хоёр дахь батлагч бүтэн
 * хяналт хийгээд сая `claimPlan` дээр унахаас сэргийлнэ.
 */
export function claimHolderOf(sub: Pick<PlanSubmission, 'status' | 'approver' | 'approverAt'>, now = Date.now()): string | null {
  if (sub.status !== PLAN_STATUS.pending) return null;
  const who = sub.approver?.trim().toLowerCase() || null;
  const at = sub.approverAt;
  if (!who || at == null || !Number.isFinite(at) || at <= 0) return null;
  return now - at < CLAIM_TTL ? who : null;
}

/**
 * БАТЛАХААР ТҮГЖИХ — эх хуудсанд бичихээс ӨМНӨ (`Huvaari.decide`).
 * `decidePlan`-ийн дүрмүүд (өөрийгөө биш · хүрээ · `pending`) + өөр хүний
 * хүчинтэй түгжээ байхгүй. Амжилттай бол `decidePlan` нь ЭНЭ батлагчид л
 * зөвшөөрөгдөнө, `withdrawPlan` татгалзана.
 */
export async function claimPlan(args: { oid: number; approver: string; author?: string }): Promise<{ ok: boolean; error?: string }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const claimed = (args.author ?? '').trim().toLowerCase();
  if (claimed && me === claimed) {
    return { ok: false, error: tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  /* ⚠️ 2026-09-29 аудит: түгжигчийн нэр = нэвтэрсэн хүн (`decidePlan`-тай ижил) */
  const own = sameAsLogin(me);
  if (own) return own;
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const fields = `${F.oid},${F.status},${F.approver},${F.approverAt},${F.author},${F.pkgGroup}`;
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, fields);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc = huvaariScope(meNow ?? me, 'approver');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцын хуваарийг батлах эрхгүй.') };
  }
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (author && me === author) {
    return { ok: false, error: tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  if (s(cur[0][F.status]) !== PLAN_STATUS.pending) {
    return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
  }
  const holder = claimHolder(cur[0]);
  if (holder && holder !== me) {
    return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', holder) };
  }
  /* ⚠️ 2026-10-01: бичих + дахин уншиж баталгаажуулах нь `casClaim`-д (`decidePlan`-тай
     НЭГ зам). Эхний «дахин унших» нь дээр сая уншсан `cur` — давхар хүсэлтгүй.
     Зэрэг түгжсэн хоёр дахь батлагч (эсвэл завсарт татсан зохиогч) бичсэн бол
     бидний түгжээ хүчингүй — эх хуудсанд бичихгүй; ялсан хүний нэрийг хэлнэ.
     ⚠️ `requireEmpty: false` — өөр хүний ХУГАЦАА ДУУССАН түгжээг авч болно (хуучин дүрэм). */
  let first: Attrs | null = cur[0];
  try {
    const got = await casClaim({
      read: async () => {
        if (first) { const f = first; first = null; return f; }
        return (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
      },
      write: (at) => writeClaim(url, args.oid, me, at),
    }, me, { requireEmpty: false });
    if (!got.ok) return { ok: false, error: claimError(got) };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  return { ok: true };
}

/**
 * ТҮГЖЭЭГ ТАЙЛАХ — бичилт унасан/тасарсан үед (`Huvaari`). Зөвхөн ӨӨРИЙН,
 * `pending` хэвээр мөрийг. Алдааг залгина: ямар ч байсан `CLAIM_TTL`-ээр тайлагдана.
 */
export async function releasePlanClaim(args: { oid: number; approver: string }): Promise<void> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return;
  try {
    const url = await tableUrl(false);
    if (!url) return;
    const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.approver},${F.approverAt}`);
    if (!cur.length || claimHolder(cur[0]) !== me) return;
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.approver]: null, [F.approverAt]: null } }]),
      rollbackOnFailure: 'true',
    });
    if (editOk(j.updateResults)) invalidate('HUVAARI_BATLAH');
  } catch { /* CLAIM_TTL-ээр тайлагдана */ }
}

/**
 * ХАГАС БИЧИЛТИЙН ТЭМДЭГ ТАВИХ — батлагчийн `save` эх хуудсанд АНХНЫ бичилтээс ӨМНӨ
 * (2026-10-01, `PARTIAL_MARK`-ийн ⚠️).
 * ⚠️ Түгжээ ӨӨРИЙНХ эсэхийг дуудагч (`Huvaari.save` → `approveGuard`) сая шалгасан тул
 *    энд дахин уншихгүй — зөвхөн `butsaasan_shaltgaan`-д тэмдэг бичнэ (`approver`/
 *    `approverAt` хөндөхгүй → түгжээ хэвээр).
 * ⚠️ FAIL-CLOSED: бичигдээгүй бол дуудагч эх хуудсанд ЮУ Ч бичихгүй — тэмдэггүй хагас
 *    бичилт нь хамгаалалтгүй үлдэнэ. ArcGIS алдаа HTTP 200-аар ирдэг тул `editOk`.
 */
export async function markPlanPartial(args: { oid: number; approver: string }): Promise<{ ok: boolean; error?: string }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.reason]: `${PARTIAL_MARK}:${me}` } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    invalidate('HUVAARI_BATLAH');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/**
 * ХАГАС БИЧИЛТИЙН ТЭМДЭГ АРИЛГАХ (2026-10-01) — эх хуудсанд НЭГ Ч мөр бичигдээгүй унасан үед.
 * ⚠️ Зөвхөн тэмдэг байгаа үед (`partialBy`) — бодит буцаалтын шалтгааныг дарахгүй.
 * ⚠️ Унавал чимээгүй: тэмдэг үлдэх нь аюулгүй тал (буцаах хаагдсан ч дахин батлаж болно).
 */
export async function clearPlanPartial(oid: number): Promise<boolean> {
  const url = await tableUrl(false);
  if (!url) return false;
  try {
    const cur = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.status},${F.reason}`);
    if (!cur.length || partialBy(s(cur[0][F.status]), s(cur[0][F.reason])) == null) return false;
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: oid, [F.reason]: null } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return false;
    invalidate('HUVAARI_BATLAH');
    return true;
  } catch {
    return false;
  }
}

/**
 * ИЛГЭЭЛТЭЭ ТАТАХ — зохиогч ӨӨРИЙН хүлээгдэж буй илгээлтийг буцааж авна
 * (2026-09-21).
 *
 * ⚠️ ЯАГААД: `decidePlan` нь зохиогч=батлагч бүх шийдвэрийг татгалздаг
 *    (зөв — өөрийгөө батлахгүй), гэвч түүний улмаас зохиогч алдаатай
 *    илгээлтээ буцаах замгүй байв: өөр батлагч буцаатал багц `locked`.
 * ⚠️ ЭХ ХУУДСАНД ЮУ Ч БИЧИХГҮЙ — зөвхөн урсгалын мөр `withdrawn` болно.
 * ⚠️ ЗӨВХӨН ЗОХИОГЧ: жинхэнэ дүрэм нь СЕРВЕРИЙН `F.author` — дуудагчийн
 *    өгсөн нэрэнд найдахгүй (`decidePlan`-ийн 2026-09-15-ны сургамж).
 *    Мөн `requireCap('plan')` — хуваарь илгээх эрхгүй хүн татаж ч чадахгүй.
 * ⚠️ Зөвхөн `pending` мөрийг татна — шийдвэрлэгдсэнийг татах нь батлагчийн
 *    шийдвэрийг дарах болно.
 * ⚠️ `approver`-т ЮУ Ч бичихгүй, `approverAt`-д татсан агшныг: түүх
 *    «хэзээ» гэдгийг мэднэ, «батлагч» багана нь зөвхөн батлагчийнх үлдэнэ.
 */
export async function withdrawPlan(args: {
  oid: number;
  /** Татаж буй хүн — нэвтэрсэн хэрэглэгч (`currentUser`) байх ёстой */
  me: string;
}): Promise<{ ok: boolean; error?: string }> {
  /* ⚠️ Дүрмүүд СҮЛЖЭЭНЭЭС ӨМНӨ — `decidePlan`-тай ижил шалтгаан (тест барина). */
  requireCap('plan');
  const me = args.me.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  if (typeof window !== 'undefined' && AUTH.appId) {
    const meNow = currentUser();
    if (!meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    if (meNow !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ татна.') };
  }
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.author},${F.approver},${F.approverAt},${F.reason}`);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (author !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ татна.') };
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== PLAN_STATUS.pending) {
    const by = s(cur[0][F.approver]);
    return {
      ok: false,
      error: by
        ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, curStatus ?? '')
        : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'),
    };
  }
  /* ⚠️ 2026-09-25 аудит: батлагч түгжсэн (эх хуудсанд бичиж буй) үед ТАТАХГҮЙ —
     урьд нь татсны дараа ч батлагчийн бичилт эх хуудсанд орж, «татсан» санал
     хуваарьт суудаг байв. */
  /* ⚠️ 2026-10-01: ХАГАС БИЧИГДСЭН бол ТАТАХГҮЙ (`PARTIAL_MARK`-ийн ⚠️) — түгжээний
     хугацаа (`CLAIM_TTL`) дууссан ч, хуудас сэргээсэн ч сервер дээрх тэмдэг хэвээр. */
  const pb = partialBy(curStatus, s(cur[0][F.reason]));
  if (pb != null) {
    return { ok: false, error: tr('Батлагч ({0}) энэ илгээлтийн хуваарийг эх хуудсанд ХЭСЭГЧЛЭН бичсэн — татах боломжгүй. Батлагч батлалтыг гүйцээнэ.', pb || '—') };
  }
  const holder = claimHolder(cur[0]);
  if (holder) {
    return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — татах боломжгүй. Хэсэг хугацааны дараа дахин оролдоно уу.', holder) };
  }
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: PLAN_STATUS.withdrawn,
    /* Түгжээний үлдэгдэл (хугацаа нь өнгөрсөн) «батлагч» баганад үлдэхгүй */
    [F.approver]: null,
    [F.approverAt]: Date.now(),
    [F.reason]: null,
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    invalidate('HUVAARI_BATLAH');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/**
 * ШИЙДВЭРЛЭХ БОЛОМЖТОЙ ХУВААРИЙН ИЛГЭЭЛТИЙН ТОО — цэсний тэмдэгт (2026-09-30).
 *
 * `HuvaariBatlah`-ийн «Шийдвэрлэх» + «Бүртгэлгүй багц»-тай ИЖИЛ дүрэм: `pending` ·
 * батлагчийн хүрээнд (`huvaariScope(…, 'approver')`, super/нэвтрэлтгүй бол
 * хязгааргүй) · ӨӨРИЙН илгээлт БИШ · ӨӨР батлагчийн хүчинтэй түгжээгүй
 * (`claimHolderOf` — тэр үед `claimPlan` татгалзана).
 *
 * ⚠️ 2026-09-30: `null` ≠ 0 — `null` нь «мэдэхгүй» (нэвтрээгүй, эрх/хуваарилалт
 *    уншигдаагүй, хүснэгт алга, сүлжээ унасан). ⚠️ Хүснэгт ҮҮСГЭХГҮЙ (`canCreate`
 *    false) — тэмдэгт тоолох нь бичих үйлдэл биш.
 */
/**
 * ⚠️ 2026-09-30: ТЭМДГИЙН ТООЛУУРЫН ӨГӨГДӨЛ — автобусад `HUVAARI_BATLAH` тагтай
 *    богино кэш. Энэ файлын бичих зам бүр `invalidate('HUVAARI_BATLAH')` дууддаг тул
 *    ӨӨРИЙН үйлдлийн дараа тэр дор нь шинэ тоо; бусдын бичилтийг TTL (цэсний 3 мин
 *    тутмын шинэчлэлтээс богино) барина. `loadAllPending` ӨӨРӨӨ кэшлэгдэхгүй —
 *    батлах хуудас, `submitPlan`-ийн давхардлын шалгалт үргэлж шинэ уншина.
 */
const BADGE_TTL = 60_000;
const loadBadgePending = cached(loadAllPending, BADGE_TTL, ['HUVAARI_BATLAH']);

export async function countPlanPending(username: string | null | undefined): Promise<number | null> {
  try {
    const me = (username ?? '').trim().toLowerCase();
    if (AUTH.appId) {
      if (!me || !capsRemoteReady() || !huvaariAclReady()) return null;
      if (!hasCap(me, 'planApprove')) return 0;
    }
    if (!(await planTableState(false)).ok) return null;
    const sc = AUTH.appId ? huvaariScope(me, 'approver') : null;
    if (Array.isArray(sc) && sc.length === 0) return 0;
    const now = Date.now();
    const rows = await loadBadgePending();
    return rows.filter((x) => {
      if (sc != null && !sc.includes(x.pkgGroup)) return false;
      if (x.author.trim().toLowerCase() === me) return false;
      const h = claimHolderOf(x, now);
      return !h || h === me;
    }).length;
  } catch {
    return null;
  }
}
