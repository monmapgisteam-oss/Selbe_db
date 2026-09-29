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
import { huvaariScope } from './huvaariAcl';
import { t as tr } from '@/lib/i18nCore';
import { arcgisPost } from '@/lib/authToken';
import { currentUser, requireCap } from './who';

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

/**
 * ArcGIS REST дуудлага.
 * ⚠️ ArcGIS алдаагаа HTTP 200 + `{error:{…}}` биеэр буцаадаг — шалгахгүй бол
 * хагас дутуу хүснэгт үүсгээд URL-ыг нь кэшилнэ (`permsRemote`-ийн сургамж).
 */
async function req(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  /* ⚠️ Хүснэгт Organization-only — нэвтэрсэн хэрэглэгчийн токен ЗААВАЛ (2026-09-17).
     ⚠️ 2026-09-29: токеныг хүсэлтийн өмнө шинэчилж, 498-д нэг удаа дахин оролдоно;
     алдаанд унасан замыг нэрлэнэ (`authToken.arcgisPost`). */
  return arcgisPost(url, params);
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
  const search = await req(`${restBase()}/search`, {
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
  const created = await req(
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
  await req(`${adminUrl}/addToDefinition`, { token, addToDefinition: JSON.stringify(table) });
  await req(
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
    const j = await req(url, {});
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
  for (let off = 0; ; off += 1000) {
    const j = await req(`${url}/query`, {
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
    if (fs.length < 1000) break;
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
  /* ⚠️ Хэд хэдэн pending үүссэн бол (зэрэгцээ илгээлтийн race) СҮҮЛИЙНХ ялна —
     `permsRemote`-ийн «их OBJECTID ялна» дүрэмтэй ижил. */
  return list.length ? list[list.length - 1] : null;
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
    if (x) last.set(x.pkgKey, x);
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
  const list = rows.map(toSubmission).filter((x): x is PlanSubmission => x != null);
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
    const j = await req(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.addResults)
      ? { ok: true }
      : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
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
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.approver},${F.approverAt},${F.author},${F.pkgGroup}`);
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
  /* ⚠️ 2026-09-25 аудит: ӨӨР батлагч түгжсэн (эх хуудсанд бичиж буй) бол шийдвэр
     гаргахгүй — хоёр дахь батлагчийн буцаалт/батлалт эхнийхийн бичилтийг дарна. */
  const holder = claimHolder(cur[0]);
  if (holder && holder !== me) {
    return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', holder) };
  }
  /* ⚠️ 2026-09-29 аудит: БАТЛАХАД түгжээ ӨӨРИЙНХ байх ёстой (хугацаа дууссан ч).
     `save` 10 минутаас хэтэрвэл өөр батлагч түгжиж чаддаг байв — тэр үед энэ
     батлалт нөгөөгийн бичилтийг «батлагдсан» болгоно. `approver` хоосон (татсан/
     түгжээгүй) эсвэл өөр хүн бол зогсоно; буцаалт (`approve=false`) хуучин дүрмээр. */
  if (args.approve) {
    const raw = s(cur[0][F.approver])?.trim().toLowerCase() ?? '';
    if (raw && raw !== me) {
      return { ok: false, error: tr('{0} энэ илгээлтийг түгжсэн байна — таны түгжээ хугацаа дууссан. Хуудсаа шинэчилнэ үү.', raw) };
    }
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
  try {
    const j = await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.updateResults)
      ? { ok: true, warn }
      : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
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
  const at = Date.now();
  try {
    const j = await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.approver]: me, [F.approverAt]: at } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
  /* ⚠️ Дахин уншиж БАТАЛГААЖУУЛНА: зэрэг түгжсэн хоёр дахь батлагч (эсвэл завсарт
     татсан зохиогч) бичсэн бол бидний түгжээ хүчингүй — эх хуудсанд бичихгүй. */
  const back = await query(`${F.oid} = ${Number(args.oid)}`, fields);
  const ok = back.length > 0
    && s(back[0][F.status]) === PLAN_STATUS.pending
    && (s(back[0][F.approver])?.toLowerCase() ?? '') === me
    /* Огнооны талбар секундээр тайрагдаж болзошгүй — 1 с-ийн хүлцэл */
    && Math.abs(Number(back[0][F.approverAt]) - at) < 1000;
  if (!ok) return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
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
    await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.approver]: null, [F.approverAt]: null } }]),
      rollbackOnFailure: 'true',
    });
  } catch { /* CLAIM_TTL-ээр тайлагдана */ }
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
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.author},${F.approver},${F.approverAt}`);
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
    const j = await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.updateResults)
      ? { ok: true }
      : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}
