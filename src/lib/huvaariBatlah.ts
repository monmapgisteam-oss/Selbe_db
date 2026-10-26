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

import { GUITS } from '@/lib/services/env';
import { AUTH, ROLE_BY_USER, roleForUser } from './services';
import { huvaariAclReady, huvaariScope } from './huvaariAcl';
import { t as tr } from '@/lib/i18nCore';
/* ⚠️ `arcgisPost` (2026-09-30): урьд нь ижил утгатай дотоод `req` байв — хүснэгт
   Organization-only тул нэвтэрсэн хэрэглэгчийн токен ЗААВАЛ (2026-09-17), токеныг
   хүсэлтийн өмнө шинэчилж 498-д нэг удаа дахин оролдоно (2026-09-29). */
import { arcgisPost } from '@/lib/authToken';
import { currentUser } from './who';
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
 * Төлөвийн ДЭЛГЭЦИЙН нэр (⚠️ 2026-10-12, аудит) — `PLAN_STATUS` нь ӨГӨГДӨЛ (орчуулагдахгүй), харин
 * алдааны мессежид («… шийдвэрлэсэн байна ({1})») түүхий утга орж англи UI-д монголоор гардаг байв.
 * ⚠️ Литерал `tr()` — динамик `tr(st)` биш (i18n-extract түлхүүрийг AST-аар олно).
 * Танихгүй утга түүхийгээрээ (хоосон бол `''`).
 */
export function planStatusLabel(st: string | null | undefined): string {
  switch (st) {
    case PLAN_STATUS.pending: return tr('Хүлээгдэж буй');
    case PLAN_STATUS.approved: return tr('Батлагдсан');
    /* ⚠️ 2026-10-23 (UX аудит X7): харуулах нэр «Буцаасан» (нэг нэр томьёо); серверийн утга `PLAN_STATUS.returned` ХЭВЭЭР */
    case PLAN_STATUS.returned: return tr('Буцаасан');
    case PLAN_STATUS.withdrawn: return tr('Татсан');
    default: return st ?? '';
  }
}

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
  /** Өөрчлөгдөх мөрийн тоо — жагсаалтад харуулна (payload задлахгүйгээр).
   *  ⚠️ 2026-10-21: `mor_too` хоосон бол `null` — урьд нь «0 мөр» гэж харагддаг байв; харуулахад `num` → «—» */
  rowCount: number | null;
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
  /**
   * ⚠️ 2026-10-08: АГУУЛГЫН ТӨРӨЛ (`payload.kind`) — толгойд ЗӨВХӨН мэдэгдэж байвал
   *    (`loadPending(pkg, kind)` · `loadAllPending`-ийн давхардлын шүүлт). Толгойн талбар
   *    байхгүй тул `aguulga LIKE`-ээр ялгана (`KIND_SQL`); `undefined` = шалгаагүй.
   */
  kind?: PlanPayloadKind;
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
    /* ⚠️ 2026-10-08: мөргөлдөөний хамгаалалт `actual`/`res`/`keys`-ийг ч шалгана — урьд нь
       зөвхөн `spans`/`deps` тул бодит огноо/нөөцөөр л орсон мөр дээр өөр мөр зөөгдөж дарагддаг байв. */
    const tk = String(to);
    if (to == null || taken.has(to) || tk in p.spans || tk in p.deps || tk in p.actual || tk in p.res || tk in p.keys) continue;
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
  oid: 'objectid',
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
      objectIdField: 'objectid',
      fields: [
        { name: 'objectid', type: 'esriFieldTypeOID', nullable: false, editable: false },
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
  /* ⚠️ 2026-10-20: Enterprise-ийн БОДИТ хаягаар ШУУД (Guitsetgel_talbe/192) — порталын хайлт/үүсгэлтгүй (AGOL-ын item хайлт
     Enterprise-д утгагүй). ⚠️ 2026-10-26: хөрвүүлэх хүснэгт (`entMap.entDirect`) хасагдсан — хаяг шууд. */
  const direct: string | null = `${GUITS}/192`;
  if (direct) {
    tableUrlCache = direct;
    return direct;
  }
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
    /* ⚠️ 2026-10-21: хоосон `mor_too` = мэдэгдэхгүй (`null`), 0 биш (`rowCount`-ийн ⚠️) */
    rowCount: a[F.rowCount] == null || a[F.rowCount] === '' || !Number.isFinite(Number(a[F.rowCount])) ? null : Number(a[F.rowCount]),
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
 * СЕРВЕРИЙН ЦАГ — түгжээний агшин ба хугацааг ҮҮГЭЭР (⚠️ 2026-10-12, аудит).
 *
 * ⚠️ ЯАГААД: түгжээ (`approverAt`) нь бичсэн хүний ХӨТЧИЙН `Date.now()`, хугацаа дууссан эсэх
 *    (`CLAIM_TTL`) нь уншиж буй хүний ӨӨР хөтчийн цагаар хэмжигддэг байв. Хоёр компьютерын цаг
 *    хэдэн минут зөрвөл (2026-10-12-нд энэ машин л AGOL-оос ~100 с түрүүлж байв) нэг нь амьд түгжээг
 *    «дууссан» гэж үзэж дарж бичих, эсвэл дууссан түгжээг «амьд» гэж хүлээх боломжтой.
 * ⚠️ ЯАГААД ЭНЭ АРГА: (1) Editor Tracking (`EditDate`) — хүснэгтийг код өөрөө `createService`-ээр
 *    үүсгэдэг (`createTable`) бөгөөд засварын бүртгэл АСААГҮЙ; бүтцийг зөвхөн хэрэглэгч AGOL дээр
 *    өөрчилнө. (2) Хариуны `Date` толгой — AGOL `Access-Control-Expose-Headers`-т `Date`-ийг ОРУУЛДАГГҮЙ
 *    (2026-10-12-нд шалгав: зөвхөн `Request-Context`) тул хөтчийн JS уншиж ЧАДАХГҮЙ. (3) ҮЛДСЭН нь:
 *    `outStatistics` max(`CURRENT_TIMESTAMP`) — hosted давхаргад ажилладаг (2026-10-12-нд амьд шалгав,
 *    `Date` толгойтой секундээр таарав). ⚠️ AGOL query-н хариуг КЭШЛЭДЭГ (ижил хүсэлтэд хуучин
 *    `CURRENT_TIMESTAMP` ирсэн) — тиймээс `where`-д санамсаргүй тоо (`OBJECTID > -N`) нэмнэ.
 * ⚠️ ЗӨРҮҮ (`clockOff`) = сервер − хөтчийн дундаж (хүсэлтийн хоёр үзүүрийн дундаж; RTT/2-ын нарийвчлал,
 *    10 мин-ийн TTL-д хангалттай). 10 минут тутам шинэчилнэ; уншиж чадаагүй бол сүүлийн мэдэгдсэн (эхэндээ 0 —
 *    хуучин зан) хэвээр, 60 с-ийн дараа дахин оролдоно. 10 с-ээс урт хүсэлтийг хэмжилтэд авахгүй.
 * ⚠️ Хүснэгт ХООСОН бол max нь `null` — түгжээ ч байхгүй тул зөрүү хамааралгүй.
 */
let clockOff = 0;
let clockAt = 0;
let clockTryAt = 0;
let clockFlight: Promise<void> | null = null;
const CLOCK_TTL = 10 * 60_000;
const CLOCK_RETRY = 60_000;
/** Серверийн одоогийн агшин (ms) — сүүлийн хэмжсэн зөрүүгээр (`syncServerClock`) */
export function serverNow(): number {
  return Date.now() + clockOff;
}
/** Зөрүүг бодох цэвэр томьёо — `srv` (серверийн агшин), `t0`/`t1` (хүсэлтийн өмнө/дараах хөтчийн цаг) */
export function clockOffsetOf(srv: number, t0: number, t1: number): number {
  return Math.round(srv - (t0 + t1) / 2);
}
/** Серверийн цагийн зөрүүг шинэчилнэ (кэштэй, явагдаж буйг хуваалцана) — алдааг залгина */
export async function syncServerClock(): Promise<void> {
  const t = Date.now();
  if (clockAt && t - clockAt < CLOCK_TTL) return;
  if (clockFlight) return clockFlight;
  if (clockTryAt && t - clockTryAt < CLOCK_RETRY) return;
  clockTryAt = t;
  clockFlight = (async () => {
    try {
      const url = await tableUrl(false);
      if (!url) return;
      /* ⚠️ 2026-10-21: хэмжилт `serverClock.measureServerTime` (Enterprise-д outStatistics CURRENT_TIMESTAMP 500 → хоёртын хайлт) */
      const { measureServerTime, clockOffsetOk, warnClockOff } = await import('./serverClock');
      const m = await measureServerTime(url, F.oid);
      if (!m) return;
      const off = clockOffsetOf(m.srv, m.t0, m.t1);
      /* ⚠️ 2026-10-21 (аудит №2): 15 мин-ээс их зөрүүг хүлээн авахгүй — `serverClock.MAX_CLOCK_OFF`-ийн ⚠️ */
      if (!clockOffsetOk(off)) { warnClockOff(off); clockAt = m.t1; return; }
      clockOff = off;
      clockAt = m.t1;
    } catch { /* сүүлийн мэдэгдсэн зөрүү хэвээр — CLOCK_RETRY-ийн дараа дахин */ } finally {
      clockFlight = null;
    }
  })();
  return clockFlight;
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

/**
 * ⚠️ 2026-10-09: `strict` — ТҮГЖЭЭ/ХҮЛЭЭГДЭЖ БУЙ шалгалтад (`loadPending` → `ajilApply`) хүснэгт
 *    ОЛДОХГҮЙ ба «шалгаж ЧАДАХГҮЙ» хоёрыг ялгана (fail-closed). Эзэн танигдахгүй (`ownerMismatch`)
 *    эсвэл нэвтрэлттэй горимд токен алга бол ШИДНЭ — урьд нь `[]` буцааж «хүлээгдэж буй илгээлт
 *    алга» гэж үзэн хагас бичигдсэн хуваарийн дээгүүр жааз солигддог байв. Токентой, эзэн
 *    танигдсан атлаа хүснэгт ҮНЭХЭЭР алга (хэн ч илгээгээгүй) бол `[]` хэвээр — эс бөгөөс шинэ
 *    орчинд нэмэлт ажил хэзээ ч буулгагдахгүй. Нэвтрэлтгүй горимд (`!AUTH.appId`) урсгал байхгүй.
 */
async function query(where: string, outFields: string, strict = false): Promise<Attrs[]> {
  const url = await tableUrl(false);
  if (!url) {
    if (strict && (ownerMismatch || (AUTH.appId && !(await getToken()))))
      throw new Error(tr('Батлах хүснэгт олдсонгүй — админд хандана уу.'));
    return [];
  }
  /* ⚠️ 2026-10-12: түгжээг уншиж/шүүх бүх зам серверийн цагтай байхаар (`serverNow`) — ихэвчлэн
     кэшээс шууд буцна (10 мин); алдааг залгина, query-г хэзээ ч унагахгүй. */
  await syncServerClock();
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
/**
 * ⚠️ 2026-10-08: АГУУЛГЫН ТӨРЛИЙН SQL ШҮҮЛТ. `kind` нь ЗӨВХӨН `aguulga` JSON дотор (толгойн
 *    талбар алга, хүснэгтийн бүтцийг зөвхөн хэрэглэгч AGOL дээр өөрчилнө) — `JSON.stringify`
 *    нь `"kind":"geree"` гэж зайгүй бичдэг тул `LIKE`-ээр ялгана. `plan` = `geree` БИШ бүхэн
 *    (2026-09-11-ээс өмнөх `kind`-гүй илгээлт ч — `parsePayload`-тай НЭГ дүрэм).
 */
const KIND_SQL = (kind: PlanPayloadKind): string => (kind === 'geree'
  ? `${F.payload} LIKE '%"kind":"geree"%'`
  : `NOT (${F.payload} LIKE '%"kind":"geree"%')`);

/**
 * Мөрүүдийн агуулгын төрөл — `oid` → `kind` (2026-10-08). Эхлээд НЭГ `LIKE` query-гээр;
 * ⚠️ `LIKE` 1 MB талбарт унавал (үйлчилгээ дэмжихгүй) мөр бүрийн агуулгыг татаж задална —
 *    ховор зам (давхардсан `pending` эсвэл `LIKE` алдаа), тэр ч унавал `kind`-гүй үлдээнэ.
 */
async function pendingKinds(oids: number[]): Promise<Map<number, PlanPayloadKind>> {
  const out = new Map<number, PlanPayloadKind>();
  if (!oids.length) return out;
  try {
    const g = await query(`${F.oid} IN (${oids.map(Number).join(',')}) AND ${KIND_SQL('geree')}`, F.oid);
    const geree = new Set(g.map((a) => Number(a[F.oid])));
    for (const o of oids) out.set(o, geree.has(o) ? 'geree' : 'plan');
    return out;
  } catch { /* доорх нөөц зам */ }
  for (const o of oids) {
    const p = await loadPayload(o).catch(() => null);
    if (p) out.set(o, p.kind);
  }
  return out;
}

/**
 * ⚠️ 2026-10-08: `kind` өгвөл ЗӨВХӨН тэр төрлийн хүлээгдэж буй илгээлт — гэрээний ба
 *    төлөвлөгөөний санал нэг багцад ЗЭРЭГ хүлээж болно (`submitPlan`-ийн давхардал ч
 *    (багц · төрөл)-өөр). Өгөхгүй бол хуучин зан (аль ч төрлийн эхнийх).
 */
export async function loadPending(pkgKey: string, kind?: PlanPayloadKind): Promise<PlanSubmission | null> {
  const esc = pkgKey.replace(/'/g, "''");
  const base = `${F.pkgKey} = '${esc}' AND ${F.status} = N'${PLAN_STATUS.pending}'`;
  let list: PlanSubmission[];
  if (kind) {
    try {
      const rows = await query(`${base} AND ${KIND_SQL(kind)}`, HEAD_FIELDS, true);
      list = rows.map(toSubmission).filter((x): x is PlanSubmission => x != null).map((x) => ({ ...x, kind }));
    } catch {
      /* `LIKE` унавал: бүх pending → агуулгаар шүүнэ (`pendingKinds`-ийн нөөц зам) */
      const rows = await query(base, HEAD_FIELDS, true);
      const all = rows.map(toSubmission).filter((x): x is PlanSubmission => x != null);
      const kinds = await pendingKinds(all.map((x) => x.oid));
      list = all.filter((x) => kinds.get(x.oid) === kind).map((x) => ({ ...x, kind }));
    }
  } else {
    const rows = await query(base, HEAD_FIELDS, true);
    list = rows.map(toSubmission).filter((x): x is PlanSubmission => x != null);
  }
  /* ⚠️ Хэд хэдэн pending үүссэн бол (зэрэгцээ илгээлтийн race) ЭХНИЙХ (бага OBJECTID) ялна —
     `submitPlan`-ийн давхардал арилгах дүрэмтэй ИЖИЛ (2026-10-01): тэнд бага нь үлдэж, их нь
     устдаг. Урьд «их ялна» байсан тул цуцлагдсан илгээлт хүлээгдэж буй мэт харагдах байв. */
  list.sort((a, b) => a.oid - b.oid);
  return list[0] ?? null;
}

/**
 * ⚠️ 2026-10-09: БАГЦЫН ХОЁР ТӨРЛИЙН хүлээгдэж буй илгээлт НЭГ ДОР — «Хуваарь»-ийн төрөл тус бүрийн
 *    түгжээний давтамжит шалгалтад (нөгөө төрлийг харах). ХЯМД: эхлээд НЭГ query (бүх төрлийн `pending`);
 *    хоосон бол (ердийн тохиолдол) шууд `{ plan: null, geree: null }`, байвал л төрөл тус бүрийг
 *    `loadPending(k, kind)`-аар (бага OBJECTID ялна — ижил дүрэм).
 * ⚠️ STRICT: уншилт унавал ШИДНЭ (хүснэгт олдохгүй ч — `query(…, true)`) — «хүлээгдэж буй алга» гэж ҮЗЭХГҮЙ.
 */
export async function loadPendingBoth(pkgKey: string): Promise<{ plan: PlanSubmission | null; geree: PlanSubmission | null }> {
  const esc = pkgKey.replace(/'/g, "''");
  const any = await query(`${F.pkgKey} = '${esc}' AND ${F.status} = N'${PLAN_STATUS.pending}'`, F.oid, true);
  if (!any.length) return { plan: null, geree: null };
  const [plan, geree] = await Promise.all([loadPending(pkgKey, 'plan'), loadPending(pkgKey, 'geree')]);
  return { plan, geree };
}

/** Батлагчийн жагсаалт — хүлээгдэж буй БҮХ илгээлт */
export async function loadAllPending(): Promise<PlanSubmission[]> {
  const rows = await query(`${F.status} = N'${PLAN_STATUS.pending}'`, HEAD_FIELDS);
  const list = rows.map(toSubmission).filter((x): x is PlanSubmission => x != null);
  /* ⚠️ 2026-10-08: нэг багцад хэд хэдэн `pending` үлдсэн бол (давхардал арилгах устгал унасан)
     ХАМГИЙН БАГА OBJECTID л жагсаалтад — `loadPending`-тэй НЭГ дүрэм; урьд нь хоёулаа харагдаж
     батлагч цуцлагдах ёстой илүүдлийг шийдвэрлэж чаддаг байв.
     ⚠️ 2026-10-08 (төрөл): давхардал нь (багц · ТӨРӨЛ)-өөр — гэрээний ба төлөвлөгөөний санал
     нэг багцад зэрэг хүлээж болох тул ХОЁУЛАА жагсаалтад. Төрлийг зөвхөн давхардсан багцын
     мөрүүдэд л татна (`pendingKinds`); уншигдахгүй бол хуучин дүрэм (багцаар бага OBJECTID). */
  const byPkg = new Map<string, PlanSubmission[]>();
  for (const x of list) (byPkg.get(x.pkgKey) ?? byPkg.set(x.pkgKey, []).get(x.pkgKey)!).push(x);
  const dupOids = [...byPkg.values()].filter((v) => v.length > 1).flatMap((v) => v.map((x) => x.oid));
  const kinds = await pendingKinds(dupOids).catch(() => new Map<number, PlanPayloadKind>());
  const first = new Map<string, PlanSubmission>();
  for (const x of list) {
    const k = kinds.get(x.oid);
    if (k) x.kind = k;
    const key = `${x.pkgKey}|${k ?? ''}`;
    const was = first.get(key);
    if (!was || x.oid < was.oid) first.set(key, x);
  }
  return list.filter((x) => first.get(`${x.pkgKey}|${x.kind ?? ''}`) === x);
}

/**
 * БАГЦ БҮРИЙН СҮҮЛИЙН ИЛГЭЭЛТ — толгой л (`payload`-гүй) (2026-09-29).
 * ⚠️ «Хуваарь батлах» хуудас зохиогчид БУЦААГДСАН илгээлтийг шалтгаантай нь харуулахад:
 *    буцаалт нь тухайн багцын СҮҮЛИЙН илгээлт байх үед л хүчинтэй (дараа нь дахин
 *    илгээсэн бол хуучин шалтгаан хамааралгүй). «Их OBJECTID ялна» (query-ийн дарааллаар сүүлийнх).
 *    ⚠️ 2026-10-09 (аудит №6): `loadPending` нь ЭСРЭГ дүрэмтэй — зэрэгцээ илгээлтийн давхардалд БАГА OBJECTID
 *    (эхнийх) ялна; урьд нь «`loadPending`-тэй ижил» гэж буруу бичсэн байв.
 */
/**
 * ⚠️ 2026-10-09: СҮҮЛИЙН илгээлт (багц · ТӨРӨЛ) тус бүрд — гэрээний ба төлөвлөгөөний санал бие
 *    биеэ дардаггүй (`submitPlan`/`loadPending`-ийн давхардал ч (багц · төрөл)-өөр). Урьд нь багцаар
 *    нэг л «сүүлийн» байсан тул буцаагдсан төлөвлөгөөг дараа нь илгээсэн ГЭРЭЭНИЙ санал нууж, зохиогч
 *    буцаалтаа (ба `countPlanReturned`-ийн тэмдэг) алддаг байв. Төрлийг `KIND_SQL('geree')`-ийн НЭГ
 *    query-гээр; `LIKE` унавал хуучин дүрэм (багцаар, `kind`-гүй).
 */
/**
 * ⚠️ 2026-10-12 (аудит): ХӨНГӨН ЗАМ — урьд нь `1=1`-ээр БҮХ илгээлтийн толгойг (+ 65536 тэмдэгтийн
 *    `zovshoorson_mor`) татаж «сүүлийнх»-ийг клиент дээр сонгодог байв; цэсний тэмдэг (`loadBadgeLast`)
 *    минут тутам дууддаг тул хүснэгт өсөхийн хэрээр хүндэрнэ. Одоо: (1) СЕРВЕР ДЭЭР багцаар бүлэглэж
 *    max(OBJECTID)-ийг төрөл тус бүрд (`KIND_SQL`) авна — давхардлын цуцлалт (`isDupCancel`) ба танихгүй
 *    төлөвийг SQL-ээр хасна (`LAST_SQL`); (2) тэр ≤ (багц × 2) мөрийн толгойг л `HEAD_FIELDS`-ээр татна
 *    (`okRows`-гүй — энэ жагсаалтын уншигчид түүнийг ашигладаггүй).
 * ⚠️ ХУГАЦААНЫ ЦОНХ ТАВИАГҮЙ: хуучин буцаалт багцын СҮҮЛИЙН шийдвэр хэвээр бол зохиогчид харагдах ёстой —
 *    цонх нь тэднийг чимээгүй нууна (зөв байдал алдагдана).
 * ⚠️ SQL-ийн `NULL` логик: `butsaasan_shaltgaan` хоосон (`NULL`) жинхэнэ татлагыг хасахгүйн тулд `IS NULL OR`.
 * ⚠️ Бүлэглэлт/`LIKE` унавал ЭСВЭЛ сонгогдсон мөр нь цуцлалт гарвал (SQL ба `isDupCancel` зөрөв) — дуудагч
 *    хуучин бүтэн уншилт руу унана (үр дүн ИЖИЛ).
 */
const LAST_SQL = `${F.status} IN (${Object.values(PLAN_STATUS).map((x) => `N'${x}'`).join(',')})`
  + ` AND (${F.status} <> N'${PLAN_STATUS.withdrawn}' OR (${F.approverAt} IS NOT NULL AND (${F.reason} IS NULL OR ${F.reason} <> '${DUP_MARK}')))`;
async function lastOidsBy(url: string, where: string): Promise<number[]> {
  const j = await arcgisPost(`${url}/query`, {
    where,
    groupByFieldsForStatistics: F.pkgKey,
    outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: F.oid, outStatisticFieldName: 'last_oid' }]),
    returnGeometry: 'false',
  });
  const fs = j.features as { attributes?: Attrs }[] | undefined;
  if (!Array.isArray(fs)) throw new Error('stats');
  return fs.map((f) => {
    const a = f.attributes ?? {};
    const k = Object.keys(a).find((x) => x.toLowerCase() === 'last_oid');
    return k ? Number(a[k]) : Number.NaN;
  }).filter((x) => Number.isInteger(x));
}
async function loadLastFast(): Promise<PlanSubmission[]> {
  const url = await tableUrl(false);
  if (!url) return [];
  let kinds: Map<number, PlanPayloadKind> | null = new Map();
  let oids: number[];
  try {
    const [g, p] = await Promise.all([
      lastOidsBy(url, `${LAST_SQL} AND ${KIND_SQL('geree')}`),
      /* `NULL` агуулга бүтэн уншилтад `plan` гэж тооцогддог — `NOT (NULL LIKE …)` нь хасах тул ил */
      lastOidsBy(url, `${LAST_SQL} AND (${F.payload} IS NULL OR ${KIND_SQL('plan')})`),
    ]);
    for (const o of g) kinds.set(o, 'geree');
    for (const o of p) kinds.set(o, 'plan');
    oids = [...g, ...p];
  } catch {
    /* `LIKE` унавал хуучин дүрэм — багцаар, `kind`-гүй */
    kinds = null;
    oids = await lastOidsBy(url, LAST_SQL);
  }
  if (!oids.length) return [];
  const out: PlanSubmission[] = [];
  for (const a of await query(`${F.oid} IN (${oids.join(',')})`, HEAD_FIELDS)) {
    const x = toSubmission(a);
    if (!x) continue;
    if (isDupCancel(x)) throw new Error('dup');
    if (kinds) x.kind = kinds.get(x.oid);
    out.push(x);
  }
  return out;
}

export async function loadLastPerPkg(): Promise<PlanSubmission[]> {
  try { return await loadLastFast(); } catch { /* доорх бүтэн уншилт */ }
  /* ⚠️ 2026-10-12: `HEAD_FIELDS` — `okRows` (65536) энэ жагсаалтад хэрэггүй */
  const rows = await query('1=1', HEAD_FIELDS);
  let geree: Set<number> | null = null;
  try {
    geree = new Set((await query(KIND_SQL('geree'), F.oid)).map((a) => Number(a[F.oid])));
  } catch { geree = null; }
  const last = new Map<string, PlanSubmission>();
  for (const a of rows) {
    const x = toSubmission(a);
    /* ⚠️ 2026-10-01: давхардлын цуцлалт шийдвэр биш (`isDupCancel`) — буцаалтыг нуухгүй */
    if (!x || isDupCancel(x)) continue;
    if (geree) x.kind = geree.has(x.oid) ? 'geree' : 'plan';
    last.set(`${x.pkgKey}|${x.kind ?? ''}`, x);
  }
  return [...last.values()];
}

/**
 * Багцын түүх — сүүлийн шийдвэрүүд (батлагдсан ба буцаагдсан).
 * ⚠️ 2026-10-09: `kind` өгвөл ЗӨВХӨН тэр төрлийнх (`loadPending(pkg, kind)`-ийн `KIND_SQL` арга) —
 *    «Хуваарь» хуудас идэвхтэй төрлийн сүүлийн шийдвэрийг (`loadHistory(pkg, 1, kind)`) харуулахад;
 *    урьд нь өөр төрлийн шинэ шийдвэр буцаалтыг нууж байв. `LIKE` унавал шинээс нь агуулгыг нэг
 *    нэгээр задлан `limit` хүртэл шүүнэ (агуулга уншигдаагүй мөр алгасагдана).
 */
export async function loadHistory(pkgKey: string, limit = 20, kind?: PlanPayloadKind): Promise<PlanSubmission[]> {
  const esc = pkgKey.replace(/'/g, "''");
  const base = `${F.pkgKey} = '${esc}' AND ${F.status} <> N'${PLAN_STATUS.pending}'`;
  /* ⚠️ Түүхэнд л зөвшөөрсөн мөр хэрэгтэй (буцаагдсаныг гүйцэтгэгч харна) —
     хүлээгдэж буй жагсаалт хөнгөн хэвээр (`HEAD_FIELDS`). */
  const fields = await headFields();
  /* ⚠️ 2026-10-01: давхардлын цуцлалтыг хасна (`isDupCancel`) — `limit` хасалтын ДАРАА */
  const keep = (rows: Attrs[]): PlanSubmission[] =>
    rows.map(toSubmission).filter((x): x is PlanSubmission => x != null && !isDupCancel(x));
  if (!kind) return keep(await query(base, fields)).slice(-limit).reverse();
  try {
    return keep(await query(`${base} AND ${KIND_SQL(kind)}`, fields)).map((x) => ({ ...x, kind })).slice(-limit).reverse();
  } catch { /* доорх нөөц зам */ }
  const all = keep(await query(base, fields)).reverse();
  const out: PlanSubmission[] = [];
  for (const x of all) {
    if (out.length >= limit) break;
    const p = await loadPayload(x.oid).catch(() => null);
    if (p?.kind === kind) out.push({ ...x, kind });
  }
  return out;
}

/* ══════════════ НЯГТ АГУУЛГА (v2) — ⚠️ 2026-10-22 (аудит №4) ══════════════
 *
 * ⚠️ ЯАГААД: `aguulga` 1,048,576 тэмдэгт. Хуучин хэлбэр (`JSON.stringify(PlanPayload)`) огноог `{"start":1761955200000,
 *    "end":…}` гэж, суурийг (`base.spans`) ДАХИН бүтнээр бичдэг тул бүтэн хуваарь (бүх мөр × бүх блок) b41_9f-д 1.30M,
 *    b42_9f-д 1.41M, b2_9f-д 2.65M тэмдэгт болж илгээгдэх боломжгүй байв (мессеж нь «хэд хэдэн илгээлтэд хуваа» гэдэг
 *    атал нэг багцад нэг л илгээлт хүлээгдэнэ).
 * ⚠️ ХЭЛБЭР (`z: 2`) — АЛДАГДАЛГҮЙ: `parsePayload(encodePayload(p))` нь `parsePayload(JSON.stringify(p))`-тэй ЯГ ИЖИЛ
 *    `PlanPayload` өгнө (тест: `huvaariBatlah.check.mjs`). Тиймээс бүх хэрэглэгч (`payloadToDrafts` · `backMarkMapOf` ·
 *    `HuvaariBatlah`-ийн тоонууд) өөрчлөлтгүй.
 *      · Огноо → `d0`-оос тоолсон ХОНОГ (бүхэл хоног бол); цагтай мс нь МӨР («1761955200001») — андуурагдахгүй.
 *      · Муж `[эхлэх, дуусах]`; суурьтай ИЖИЛ блок нь `0` (утга нь суурьт нэг л удаа — «хөндөөгүй блокийн суурь давхардахгүй»).
 *      · Сарын задаргаа → `[эхний сарын индекс, утга…]` (дундах хоосон сар `null`); «YYYY-MM» биш түлхүүр байвал хуучин объект.
 *      · Богино түлхүүр: `sp`/`bs` (муж/суурь), `ob`/`bob` (сарын обьём), `or`/`bor` (сарын нөөц), `ac`/`bac` (бодит огноо),
 *        `rs`/`brs` (нөөц), `bdeps` (уялдааны суурь), `hb` = суурь БАЙГАА (хуучин суурьгүй илгээлтийн «бүх блок зассан» зан).
 * ⚠️ `kind` ЭХНИЙ түлхүүр, `"kind":"geree"` хэлбэрээр — `KIND_SQL`-ийн `LIKE` үүгээр ялгадаг.
 * ⚠️ ХУУЧИН клиент `spans`-гүй тул `parsePayload` нь `null` буцаана (fail-closed — «агуулга уншигдсангүй»), буруу
 *    задлаж «юу ч өөрчлөөгүй» гэж батлахгүй. ХУУЧИН илгээлт (`z`-гүй) урьдын адил уншигдана.
 */
const PAY_DAY = 86_400_000;
type Enc = number | string | null;
/** Огноо (мс) → хоногийн зөрүү (бүхэл хоног бол) эсвэл мс-ийн мөр */
const encMs = (ms: number | null | undefined, d0: number): Enc => {
  if (ms == null || typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  return Number.isInteger(ms) && ms % PAY_DAY === 0 ? ms / PAY_DAY - d0 : String(ms);
};
const decMs = (x: unknown, d0: number): number | null => {
  if (typeof x === 'number' && Number.isFinite(x)) return (d0 + x) * PAY_DAY;
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x);
  return null;
};
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const monIdx = (k: string): number | null => {
  const m = MONTH_RE.exec(k);
  if (!m) return null;
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? Number(m[1]) * 12 + (mo - 1) : null;
};
const monKey = (i: number): string => `${String(Math.floor(i / 12)).padStart(4, '0')}-${String((i % 12) + 1).padStart(2, '0')}`;
/** Сар → утга объектыг `[эхний индекс, …утга]` болгоно; түлхүүр/утга хэвийн биш бол объектоор нь (алдагдалгүй) */
function encMonths<V>(rec: Record<string, V>, ok: (v: V) => boolean, enc: (v: V) => unknown): unknown {
  const ks = Object.keys(rec);
  if (!ks.length) return [];
  const idx = ks.map(monIdx);
  if (idx.some((i) => i == null) || ks.some((k) => !ok(rec[k]))) return rec;
  const lo = Math.min(...(idx as number[]));
  const hi = Math.max(...(idx as number[]));
  if (hi - lo > 1200) return rec;
  const out: unknown[] = [lo];
  for (let i = lo; i <= hi; i += 1) {
    const k = monKey(i);
    out.push(k in rec ? enc(rec[k]) : null);
  }
  return out;
}
function decMonths(x: unknown, dec: (v: unknown) => unknown): unknown {
  if (!Array.isArray(x)) return x;
  const out: Record<string, unknown> = {};
  if (!x.length) return out;
  const lo = Number(x[0]);
  if (!Number.isInteger(lo)) return out;
  for (let k = 1; k < x.length; k += 1) if (x[k] !== null) out[monKey(lo + k - 1)] = dec(x[k]);
  return out;
}
const mapRec = <A, B>(rec: Record<string, A> | undefined, f: (v: A, k: string) => B): Record<string, B> =>
  Object.fromEntries(Object.entries(rec ?? {}).map(([k, v]) => [k, f(v, k)]));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** `PlanPayload` → нягт JSON мөр (v2). Илгээх (`submitPlan`) үүгээр. */
export function encodePayload(p: PlanPayload): string {
  /* Хоногийн эх — бүх бүхэл хоногийн огнооны MIN (зөрүүнүүд сөрөг биш, богино) */
  let d0 = Number.POSITIVE_INFINITY;
  const see = (ms: number | null | undefined) => {
    if (typeof ms === 'number' && Number.isInteger(ms) && ms % PAY_DAY === 0 && ms / PAY_DAY < d0) d0 = ms / PAY_DAY;
  };
  const seeSpans = (rec: PlanPayload['spans'] | undefined) => {
    for (const arr of Object.values(rec ?? {})) for (const s of arr ?? []) if (s) { see(s.start); see(s.end); }
  };
  const seeActual = (rec: PlanPayload['actual'] | undefined) => {
    for (const v of Object.values(rec ?? {})) { for (const x of v?.start ?? []) see(x); for (const x of v?.end ?? []) see(x); }
  };
  seeSpans(p.spans); seeSpans(p.base?.spans); seeActual(p.actual); seeActual(p.base?.actual);
  if (!Number.isFinite(d0)) d0 = 0;
  const sp1 = (s: { start: number; end: number } | null | undefined): unknown =>
    (s ? [encMs(s.start, d0), encMs(s.end, d0)] : null);
  const same = (a: { start: number; end: number } | null | undefined, b: { start: number; end: number } | null | undefined) =>
    !!a && !!b && a.start === b.start && a.end === b.end;
  const sp = mapRec(p.spans, (arr, k) => {
    const bs = p.base?.spans?.[k];
    return (arr ?? []).map((s, b) => (bs && same(s, bs[b]) ? 0 : sp1(s)));
  });
  /* Хэлбэр нь эвдэрсэн мөр `null` — хуучин задлалт ч тэр мөрийг хаядаг (`sanitizeActual`/`sanitizeRes`) */
  const ac1 = (v: { start: (number | null)[]; end: (number | null)[] }) =>
    (v && Array.isArray(v.start) && Array.isArray(v.end)
      ? [v.start.map((x) => encMs(x, d0)), v.end.map((x) => encMs(x, d0))]
      : null);
  const rs1 = (v: { hun: number | null; mashin: number | null }) =>
    (v && typeof v === 'object' ? [v.hun ?? null, v.mashin ?? null] : null);
  const obEnc = (rec: Record<string, number>) => encMonths(rec, isNum, (v) => v);
  const orEnc = (rec: Record<string, { hun: number | null; mashin: number | null }>) =>
    encMonths(rec, (v) => !!v && typeof v === 'object', (v) => [v.hun ?? null, v.mashin ?? null]);
  const b = p.base;
  const w: Record<string, unknown> = {
    /* ⚠️ ЭХНИЙ түлхүүр — `KIND_SQL` (`"kind":"geree"` LIKE) */
    kind: p.kind,
    z: 2,
    d0,
    sp,
    deps: p.deps ?? {},
    ob: mapRec(p.obyem, obEnc),
    or: mapRec(p.obres, orEnc),
    ac: mapRec(p.actual, ac1),
    rs: mapRec(p.res, rs1),
    ...(p.keys ? { keys: p.keys } : {}),
    ...(b ? {
      hb: 1,
      bs: mapRec(b.spans, (arr) => (arr ?? []).map(sp1)),
      bdeps: b.deps ?? {},
      bob: mapRec(b.obyem, obEnc),
      ...(b.actual ? { bac: mapRec(b.actual, ac1) } : {}),
      ...(b.res ? { brs: mapRec(b.res, rs1) } : {}),
      ...(b.obres ? { bor: mapRec(b.obres, orEnc) } : {}),
    } : {}),
  };
  return JSON.stringify(w);
}

/**
 * Нягт (v2) объект → ХУУЧИН хэлбэрийн объект — `parsePayload` цааш нь урьдын шалгалтаар цэвэрлэнэ.
 * ⚠️ Эвдэрсэн хэсэг нь хуучин хэлбэрт «эвдэрсэн» утга болж (жиш. `null`) хуучин дүрмээр хаягдана; бүтэц нь
 *    танигдахгүй бол шиднэ — дуудагч `null` буцаана (fail-closed).
 */
function expandPayload(w: Record<string, unknown>): Record<string, unknown> {
  const d0 = Number(w.d0);
  if (!Number.isFinite(d0)) throw new Error('d0');
  const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});
  const spanOf = (x: unknown) => {
    if (!Array.isArray(x)) return null;
    const s = decMs(x[0], d0);
    const e = decMs(x[1], d0);
    return s == null || e == null ? { start: Number.NaN, end: Number.NaN } : { start: s, end: e };
  };
  const bsRec = mapRec(rec(w.bs) as Record<string, unknown>, (arr) => (Array.isArray(arr) ? arr.map(spanOf) : arr));
  const spans = mapRec(rec(w.sp) as Record<string, unknown>, (arr, k) => {
    if (!Array.isArray(arr)) return arr;
    const bs = bsRec[k];
    return arr.map((x, i) => (x === 0 ? (Array.isArray(bs) ? bs[i] ?? null : null) : spanOf(x)));
  });
  const acOf = (v: unknown) => (Array.isArray(v) && Array.isArray(v[0]) && Array.isArray(v[1])
    ? { start: (v[0] as unknown[]).map((x) => decMs(x, d0)), end: (v[1] as unknown[]).map((x) => decMs(x, d0)) }
    : null);
  const rsOf = (v: unknown) => (Array.isArray(v) ? { hun: v[0] ?? null, mashin: v[1] ?? null } : null);
  const obOf = (v: unknown) => decMonths(v, (x) => x);
  const orOf = (v: unknown) => decMonths(v, (x) => (Array.isArray(x) ? { hun: x[0] ?? null, mashin: x[1] ?? null } : x));
  const out: Record<string, unknown> = {
    kind: w.kind,
    spans,
    deps: rec(w.deps),
    obyem: mapRec(rec(w.ob) as Record<string, unknown>, obOf),
    obres: mapRec(rec(w.or) as Record<string, unknown>, orOf),
    actual: mapRec(rec(w.ac) as Record<string, unknown>, acOf),
    res: mapRec(rec(w.rs) as Record<string, unknown>, rsOf),
    ...(w.keys !== undefined ? { keys: w.keys } : {}),
  };
  if (w.hb === 1) {
    out.base = {
      spans: bsRec,
      deps: rec(w.bdeps),
      obyem: mapRec(rec(w.bob) as Record<string, unknown>, obOf),
      ...(w.bac !== undefined ? { actual: mapRec(rec(w.bac) as Record<string, unknown>, acOf) } : {}),
      ...(w.brs !== undefined ? { res: mapRec(rec(w.brs) as Record<string, unknown>, rsOf) } : {}),
      ...(w.bor !== undefined ? { obres: mapRec(rec(w.bor) as Record<string, unknown>, orOf) } : {}),
    };
  }
  return out;
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
    const j0 = JSON.parse(raw) as Record<string, unknown> | null;
    if (!j0 || typeof j0 !== 'object') return null;
    /* ⚠️ 2026-10-22 (аудит №4): НЯГТ хэлбэр (`z: 2`, `encodePayload`) — хуучин хэлбэр рүү задлаад доорх ИЖИЛ шалгалтаар */
    const j = (j0.z === 2 ? expandPayload(j0) : j0) as Partial<PlanPayload>;
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
  /* ⚠️ 2026-10-26: `oid` — шинэ илгээлтийн OBJECTID (`addResults`), 191-ийн илгээх агшны хуулбарын түлхүүр (`n:hsub:<OBJECTID>`) */
}): Promise<{ ok: boolean; error?: string; oid?: number }> {
  /* ⚠️ 2026-09-29 аудит: `aguulga` 1,048,576 тэмдэгт — `base` нэмэгдсэнээс хойш
     том багцад (1,459 мөр × 22 блок) хэтэрч `applyEdits` шалтгаангүй унадаг байв.
     Цэвэр шалгуур тул эрх/сүлжээнээс ӨМНӨ. */
  /* ⚠️ 2026-10-22 (аудит №4): НЯГТ хэлбэрээр (`encodePayload` — хоног, хөндөөгүй блокийн суурь давхардахгүй) — бүтэн
     хуваарь (b2_9f 2.65M) ч 1 MB-д багтана. Мессеж «хэд хэдэн илгээлтэд хуваа» гэдэг байсан нь ХУДАЛ: нэг багц · төрөлд
     зөвхөн НЭГ хүлээгдэж буй илгээлт зөвшөөрөгдөнө (`loadPending` доор) — одоо бодит гарцыг хэлнэ. */
  const payloadJson = encodePayload(args.payload);
  if (payloadJson.length > PAYLOAD_MAX) {
    return { ok: false, error: tr('Илгээлтийн агуулга хэт том ({0} тэмдэгт, дээд {1}). Нэг багцад нэг л илгээлт хүлээгдэх тул хуваан зэрэг илгээх боломжгүй — өөрчлөлтийн нэг хэсгийг эхлээд батлуулж, дараа нь үлдсэнийг илгээнэ үү (эсвэл админд хандана уу).', String(payloadJson.length), String(PAYLOAD_MAX)) };
  }
  /* ⚠️ 2026-10-12 (аудит): БҮЛГИЙГ БАГЦЫН ТҮЛХҮҮРЭЭС гаргана (`PKGS`) — урьд нь хүрээг дуудагчийн
     өгсөн `pkgGroup`-оор шалгаад `pkgKey`-тэй тулгадаггүй тул консолоос эрхтэй бүлгийн нэр + эрхгүй
     багцын түлхүүр дамжуулж БУСДЫН багцад илгээх (батлагчийн хүрээ ч тэр худал бүлгээр шүүгдэнэ)
     боломжтой байв. Танихгүй түлхүүр ч татгалзана. `bagts.pkg`-ийг динамикаар (`ajilApply`-ийн загвар). */
  let pkgGroup: string;
  try {
    const { PKGS } = await import('@/modules/sheet/bagts.pkg');
    const pk = PKGS.find((p) => p.key === args.pkgKey);
    if (!pk || pk.group !== args.pkgGroup) {
      return { ok: false, error: tr('Багцын түлхүүр ба бүлэг зөрж байна — хуудсаа шинэчилнэ үү.') };
    }
    pkgGroup = pk.group;
  } catch (e) {
    return { ok: false, error: errText(e) };
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
    if (sc !== null && !sc.includes(pkgGroup))
      return { ok: false, error: tr('Энэ багцад хуваарь илгээх эрхгүй.') };
  }
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  /* ⚠️ 2026-10-08: давхардал (багц · ТӨРӨЛ)-өөр — гэрээний ба төлөвлөгөөний санал зэрэг хүлээж болно */
  const already = await loadPending(args.pkgKey, args.payload.kind);
  if (already) {
    return { ok: false, error: tr('Энэ багцад батлагдаагүй илгээлт байна — эхлээд шийдвэрлүүлнэ үү.') };
  }
  const attrs: Attrs = {
    [F.pkgKey]: args.pkgKey,
    [F.pkgGroup]: pkgGroup,
    [F.status]: PLAN_STATUS.pending,
    [F.author]: args.author.toLowerCase(),
    /* ⚠️ 2026-10-12: серверийн цагаар (`serverNow`-ийн ⚠️) */
    [F.authorSent]: serverNow(),
    [F.rowCount]: args.rowCount,
    [F.note]: args.note?.trim() || null,
    [F.payload]: payloadJson,
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.addResults)) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    invalidate('HUVAARI_BATLAH');
    /*
     * ⚠️ ДАВХАР ИЛГЭЭЛТ АРИЛГАХ (2026-10-01, хэрэглэгч). Дээрх `loadPending` шалгалт ба
     *    `adds` хоёрын завсарт хоёр хүн зэрэг дарвал хоёулаа шалгалтыг давж, нэг багцад
     *    хоёр `pending` үүсдэг байв. Бичсэний ДАРАА дахин уншиж, БАГА OBJECTID-тай (түрүүлж
     *    бичигдсэн) илгээлт байвал ӨӨРИЙНХӨӨ мөрийг устгана — хоёр тал ижил дүрмээр
     *    шийддэг тул яг нэг нь үлдэнэ. Устгал унавал `withdrawn` болгоно (pending-ээс гарна).
     */
    const mine = Number((j.addResults as { objectId?: number }[])[0]?.objectId);
    /* ⚠️ Давхардлын шалгалт унавал (сүлжээ · 498) илгээлт ХАДГАЛАГДСАН хэвээр.
       ⚠️ 2026-10-12 (аудит): урьд нь энд `ok: true` буцааж «илгээгдлээ» гэж хэлдэг байв — гэвч давхардал
       шалгагдаагүй тул энэ мөр цуцлагдах ёстой илүүдэл байж болно (`loadPending` бага OBJECTID-г
       сонгоно). Одоо `ok: false` + «шинэчилнэ үү» — хуудас шинэчлэхэд `loadPending` аль нь хүчинтэйг
       харуулна (хадгалагдсан илгээлт түгжээгээ барина), дахин илгээх нь «илгээлт байна»-д зөв унана. */
    if (Number.isFinite(mine)) try {
      /* ⚠️ 2026-10-08: ижил ТӨРЛИЙН pending л давхардал (`KIND_SQL`) — өөр төрлийнх зэрэгцэн хүлээнэ */
      const rows = await query(
        `${F.pkgKey} = '${args.pkgKey.replace(/'/g, "''")}' AND ${F.status} = N'${PLAN_STATUS.pending}' AND ${KIND_SQL(args.payload.kind)}`,
        `${F.oid},${F.author}`,
      );
      const first = rows.map((a) => Number(a[F.oid])).filter(Number.isFinite).sort((a, b) => a - b)[0];
      if (first != null && first < mine) {
        const del = await arcgisPost(`${url}/applyEdits`, { deletes: String(mine) }).catch(() => null);
        const who = s(rows.find((a) => Number(a[F.oid]) === first)?.[F.author]);
        if (!editOk(del?.deleteResults)) {
          /* ⚠️ 2026-10-01: `DUP_MARK`-аар ялгана — «сүүлийн шийдвэр» болохгүй (`isDupCancel`) */
          const upd = await arcgisPost(`${url}/applyEdits`, {
            updates: JSON.stringify([{ attributes: { [F.oid]: mine, [F.status]: PLAN_STATUS.withdrawn, [F.reason]: DUP_MARK, [F.approverAt]: null } }]),
          }).catch(() => null);
          /* ⚠️ 2026-10-12 (аудит): нөөц `updates`-ийн ҮР ДҮНГ шалгана (алдаа HTTP 200-аар ирдэг) — урьд нь
             шалгадаггүй тул устгал ч, цуцлалт ч унасан үед «цуцлагдлаа» гэж ХУДАЛ хэлж, илүүдэл `pending`
             мөр батлагчийн жагсаалтад үлддэг байв. */
          if (!editOk(upd?.updateResults)) {
            invalidate('HUVAARI_BATLAH');
            return { ok: false, error: tr('{0} энэ багцын хуваарийг түрүүлж илгээсэн байна — таны давхар илгээлтийг цуцалж чадсангүй. Хуудсыг шинэчилнэ үү.', who || tr('Өөр хэрэглэгч')) };
          }
        }
        invalidate('HUVAARI_BATLAH');
        return { ok: false, error: tr('{0} энэ багцын хуваарийг түрүүлж илгээсэн байна — таны илгээлт цуцлагдлаа. Эхлээд шийдвэрлүүлнэ үү.', who || tr('Өөр хэрэглэгч')) };
      }
    } catch {
      return { ok: false, error: tr('Илгээлт хадгалагдсан боловч давхардлыг шалгаж чадсангүй — хуудсыг шинэчилнэ үү.') };
    }
    return Number.isFinite(mine) ? { ok: true, oid: mine } : { ok: true };
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
  /**
   * ⚠️ 2026-10-08: `claimPlan`-ийн буцаасан түгжээний агшин (`at`). Өгвөл түгжээ ӨӨРИЙНХ
   *    байсан ч `approverAt` ТЭРТЭЙ таарахыг шаардана — нэг батлагчийн ХОЁР цонх зэрэг
   *    батлагддаг байв; одоо сүүлд түгжсэн цонх л үргэлжилнэ, нөгөө нь эрт унана.
   * ⚠️ 2026-10-12 (аудит): «эрт унана» гэдэг нь 2026-10-08-нд ХУДАЛ байв — шалгалт ЗӨВХӨН энд (`decidePlan`)
   *    байсан тул ХОЁР цонх хоёулаа эх хуудсанд (`applyUpdates`) ба сарын обьёмд бичсэний ДАРАА л нэг нь
   *    унадаг байв. Одоо ижил `claimAt` дүрэм бичилтийн ӨМНӨХ хамгаалалтууд дээр ч: `approveGuard(…, claimAt)`
   *    ба `markPlanPartial({ claimAt })` — нөгөө цонх эх хуудсанд юу ч бичихээс өмнө зогсоно. Урт `save`-д
   *    түгжээг `renewPlanClaim`-аар сунгавал шинэ `at`-ийг дуудагч `claimAt` болгон хадгална.
   */
  claimAt?: number;
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
  /* ⚠️ 2026-10-06: УНШИЛТЫГ `try` дотор — урьд нь `tableUrl`/`query` (сүлжээ · токен) шидвэл
     `decidePlan` амлалтаа татгалзуулж, дуудагч (`Huvaari`-ийн батлах эффект) `catch`-гүй тул
     алдаа чимээгүй алга болдог байв. Одоо бусад алдааны адил `{ ok: false, error }`. */
  let url: string;
  let cur: Attrs[];
  try {
    const u = await tableUrl(false);
    if (!u) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
    url = u;
    cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.approver},${F.approverAt},${F.author},${F.pkgGroup},${F.reason}`);
  } catch (e) {
    /* ⚠️ 2026-10-12: `errText` — `String(e.message)` нь сешн дууссаны тэмдгийг хаядаг (`errText`-ийн ⚠️) */
    return { ok: false, error: errText(e) };
  }
  /*
   * ⚠️ ШИЙДВЭР ГАРСАН ЭСЭХИЙГ ДАХИН ШАЛГАНА (2026-09-07-ны шалгалт).
   *    Хоёр батлагч хуудсаа зэрэг нээгээд нэг нь баталчихвал нөгөөгийн
   *    дэлгэц ХУУЧИН хэвээр («Шийдвэрлэх» товч харагдсаар) үлдэнэ. Түүнийг
   *    дарахад ижил огноо ХОЁР ДАХЬ УДАА бичигдэж, шийдвэр гаргасан хүний
   *    нэр чимээгүй дарагдана. Мөр нь ганц тул `applyEdits` алдаа өгөхгүй —
   *    ЗӨВХӨН энэ шалгуур л барина. (`cur` — дээрх `try` дотор уншигдсан, 2026-10-06)
   */
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
        /* ⚠️ 2026-10-12: төлөв ДЭЛГЭЦИЙН нэрээр (`planStatusLabel`) — түүхий өгөгдөл англи UI-д монголоор гардаг байв */
        ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, planStatusLabel(curStatus))
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
  /* ⚠️ 2026-10-08: өөрийн түгжээ ч ӨӨР ЦОНХНЫХ байж болно — `claimAt` зөрвөл зогсоно (дээрх ⚠️) */
  if (holder === me && args.claimAt != null && Math.abs(Number(cur[0][F.approverAt]) - args.claimAt) >= 1000) {
    return { ok: false, error: tr('Энэ илгээлтийг таны өөр цонх түгжсэн байна — тэр цонхноос үргэлжлүүлнэ үү, эсвэл хуудсаа шинэчилнэ үү.') };
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
  /* ⚠️ 2026-10-12 (аудит): БУЦААЛТЫН ӨМНӨ ХАГАС БИЧИЛТИЙН ТЭМДГИЙГ ДАХИН ШАЛГАНА — дээрх шалгалт нь
     ЭХНИЙ уншилтын (`cur`) утгаар; түүнээс хойш (түгжээ авах завсарт) өөрийн өөр цонх эсвэл түгжээ нь
     сая дууссан батлагч `markPlanPartial`-аар тэмдэг тавьж эх хуудсанд бичиж эхэлсэн байж болно. Бичихийн
     ЯГ өмнө дахин уншаад тэмдэгтэй бол буцаахгүй (өөрөө авсан түгжээг тайлна). Батлалтад хамаарахгүй. */
  if (!args.approve) {
    let pb: string | null;
    try {
      const re = (await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.reason}`))[0] ?? null;
      if (!re || s(re[F.status]) !== PLAN_STATUS.pending) {
        if (tookClaim) void releasePlanClaim({ oid: args.oid, approver: me });
        return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
      }
      pb = partialBy(s(re[F.status]), s(re[F.reason]));
    } catch (e) {
      if (tookClaim) void releasePlanClaim({ oid: args.oid, approver: me });
      return { ok: false, error: errText(e) };
    }
    if (pb != null) {
      if (tookClaim) void releasePlanClaim({ oid: args.oid, approver: me });
      return { ok: false, error: tr('Энэ илгээлтийн хуваарийг батлагч ({0}) эх хуудсанд ХЭСЭГЧЛЭН бичсэн — буцаах боломжгүй. «Батлах»-ыг дахин дарж бичилтийг гүйцээнэ үү.', pb || '—') };
    }
  }
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: args.approve ? PLAN_STATUS.approved : PLAN_STATUS.returned,
    [F.approver]: me,
    /* ⚠️ 2026-10-12: серверийн цагаар (`serverNow`-ийн ⚠️) */
    [F.approverAt]: serverNow(),
    [F.reason]: args.approve ? null : (args.reason?.trim()?.slice(0, REASON_MAX) ?? null),
  };
  let warn: string | undefined;
  if (args.okRows) {
    const js = JSON.stringify(args.okRows.filter((x) => Number.isInteger(x)));
    /* ⚠️ 2026-10-06: шидвэл «уншигдсангүй» (−1) — түгжээ авсны ДАРАА тул унагавал түгжээ үлдэнэ */
    const len = await okRowsFieldLen().catch(() => -1);
    /* ⚠️ 2026-09-29 аудит: «уншигдсангүй» (−1) ≠ «алга» (0) — сүлжээний алдаанд
       «AGOL дээр талбар нэмнэ үү» гэсэн худал заавар өгдөг байв. */
    /* ⚠️ 2026-10-23 (UX аудит X2/X3): талбарын техник нэр · AGOL-гүй — хэрэглэгчид «админд мэдэгдэнэ үү»; техник дэлгэрэнгүй консолд */
    if (len < 0) warn = tr('Зөвшөөрсөн мөрийн тэмдэглэгээ хадгалагдсангүй (шийдвэр хадгалагдсан) — холболт тасарсан байж магадгүй.');
    else
    /* ⚠️ УРТ ХЭТЭРВЭЛ БИЧИХГҮЙ (2026-09-25 аудит): AGOL-ийн анхдагч 256 тэмдэгттэй
       талбарт ~35-аас олон мөр багтахгүй — хэтэрсэн утга `applyEdits`-ийг бүхэлд нь
       унагаж, батлагч БУЦААЖ ЧАДАХГҮЙ болно. Шийдвэр чухал, тэмдэглэгээ нэмэлт. */
    if (len > 0 && js.length <= len) attrs[okRowsName] = js;
    else if (len > 0) warn = tr('Зөвшөөрсөн мөрийн тэмдэглэгээ хүснэгтийн талбарт багтсангүй (шийдвэр хадгалагдсан) — админд мэдэгдэнэ үү.');
    else warn = tr('Батлах хүснэгтэд зөвшөөрсөн мөрийн тэмдэглэгээний талбар алга (шийдвэр хадгалагдсан) — админд мэдэгдэнэ үү.');
    if (len === 0 || (len > 0 && js.length > len)) console.warn(`[selbe] huvaariBatlah: «${F.okRows}» талбар ${len > 0 ? `богино (${len})` : 'алга'} — String (урт 65536) болгоно`);
  }
  /* ⚠️ 2026-10-01: ӨӨРӨӨ авсан түгжээг шийдвэр бичигдээгүй үед тайлна — эс бөгөөс
     `CLAIM_TTL` (10 мин) дуустал зохиогч татаж, өөр батлагч шийдэж чадахгүй. */
  const undo = () => { if (tookClaim) void releasePlanClaim({ oid: args.oid, approver: me }); };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) { undo(); return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') }; }
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
  /* ⚠️ 2026-10-12: анхдагч нь СЕРВЕРИЙН цаг (`serverNow`-ийн ⚠️) — бичих агшин ба хугацааны шүүлт хоёулаа */
  const now = io.now ?? serverNow;
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
      ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', f.holder, planStatusLabel(f.status))
      : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.');
    case 'expired': return tr('{0} энэ илгээлтийг түгжсэн байна — таны түгжээ хугацаа дууссан. Хуудсаа шинэчилнэ үү.', f.holder ?? '');
    case 'write': return tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.');
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
 * ⚠️ 2026-10-08: `decidePlan`-ийн ХАРИУ АЛДАГДСАН (timeout) үед — толгой `approved` болсон бөгөөд
 *    батлагч нь ЯГ ЭНЭ хэрэглэгч үү. Урьд нь `Huvaari` зөвхөн `status === approved`-ийг шалгадаг
 *    тул өөр батлагчийн зэрэг гаргасан шийдвэрийг ӨӨРИЙНХ гэж авдаг байв. Уншигдахгүй бол «үгүй»
 *    (fail-closed); `loadSubmissionHead().approver` нь жижиг үсгээр ирдэг.
 */
export async function isApprovedBy(oid: number, user: string): Promise<boolean> {
  const me = user.trim().toLowerCase();
  if (!me) return false;
  const h = await loadSubmissionHead(oid).catch(() => null);
  return !!h && h.status === PLAN_STATUS.approved && h.approver === me;
}

/**
 * ЭХ ХУУДСАНД БИЧИХИЙН ӨМНӨХ ХАМГААЛАЛТ — цэвэр функц (2026-10-01, хэрэглэгч: бүгдийг зас).
 *
 * ⚠️ ЯАГААД: батлагч `claimPlan`-аар түгжээд `save` руу ордог ч хооронд нь (урт
 *    бэлтгэл, сүлжээ удаан, түгжээ 10 минутаас хэтэрсэн) зохиогч ТАТАХ, өөр батлагч
 *    ШИЙДЭХ боломжтой. Тэр үед эх хуудсанд бичвэл «татсан/буцаагдсан» санал хуваарьт
 *    суух байв. Бичихийн ЯГ ӨМНӨ төлвийг дахин уншаад энэ функцээр шийднэ.
 * @returns `null` = бичиж болно; мөр = яагаад зогссон (хэрэглэгчид харуулна)
 *
 * ⚠️ 2026-10-12 (аудит): `claimAt` — `claimPlan`/`renewPlanClaim`-ийн буцаасан түгжээний агшин. Өгвөл
 *    түгжээ ӨӨРИЙНХ байсан ч `approverAt` ±1000 мс дотор таарахыг шаардана (`decidePlan`-ийн ижил дүрэм,
 *    огнооны талбар секундээр тайрагдаж болох тул хүлцэл). Нэг батлагчийн ХОЁР цонх зэрэг батлахад
 *    хоёулаа «holder === me» тул урьд нь хоёулаа эх хуудсанд бичдэг байв — одоо сүүлд түгжсэн цонх л.
 *    Өгөөгүй бол хуучин зан (буцаж нийцтэй). `now` — тест/дуудагчид; анхдагч СЕРВЕРИЙН цаг.
 */
export function approveGuard(
  fresh: Pick<PlanSubmission, 'oid' | 'status' | 'approver' | 'approverAt'> | null,
  oid: number,
  me: string,
  claimAt?: number,
  now = serverNow(),
): string | null {
  const mine = me.trim().toLowerCase();
  if (!fresh || fresh.oid !== oid) return tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.');
  if (fresh.status === PLAN_STATUS.withdrawn) {
    return tr('Зохиогч илгээлтээ татсан байна — эх хуудсанд юу ч бичигдсэнгүй. Хуудсаа шинэчилнэ үү.');
  }
  if (fresh.status !== PLAN_STATUS.pending) {
    return fresh.approver
      ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', fresh.approver, planStatusLabel(fresh.status))
      : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.');
  }
  const h = claimHolderOf(fresh, now);
  if (h === mine) {
    if (claimAt != null && !sameClaimAt(fresh.approverAt, claimAt)) {
      return tr('Энэ илгээлтийг таны өөр цонх түгжсэн байна — тэр цонхноос үргэлжлүүлнэ үү, эсвэл хуудсаа шинэчилнэ үү.');
    }
    return null;
  }
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
/**
 * Түгжээний агшин дуудагчийн барьсан агшинтай ИЖИЛ үү — ±1000 мс (огнооны талбар секундээр
 * тайрагдаж болно; `casClaim`-ийн ижил хүлцэл). `null`/эвдэрсэн бол үгүй (2026-10-12).
 */
export function sameClaimAt(at: unknown, claimAt: number): boolean {
  const v = Number(at);
  return at != null && Number.isFinite(v) && v > 0 && Math.abs(v - claimAt) < 1000;
}
/** `pending` мөрийг хугацаа нь дуусаагүй түгжээтэй байлгаж буй хүн (жижиг үсгээр), эсвэл `null`.
    ⚠️ 2026-10-12: `now` анхдагч нь СЕРВЕРИЙН цаг (`serverNow`-ийн ⚠️) */
function claimHolder(a: Attrs, now = serverNow()): string | null {
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
export function claimHolderOf(sub: Pick<PlanSubmission, 'status' | 'approver' | 'approverAt'>, now = serverNow()): string | null {
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
export async function claimPlan(args: { oid: number; approver: string; author?: string }): Promise<{ ok: boolean; error?: string; at?: number }> {
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
  /* ⚠️ 2026-10-08: түгжээний агшныг дуудагчид буцаана — `decidePlan({ claimAt })` үүгээр
     нэг батлагчийн өөр цонхны түгжээг ялгана. */
  let at0: number | undefined;
  try {
    const got = await casClaim({
      read: async () => {
        if (first) { const f = first; first = null; return f; }
        return (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
      },
      write: (at) => { at0 = at; return writeClaim(url, args.oid, me, at); },
    }, me, { requireEmpty: false });
    if (!got.ok) return { ok: false, error: claimError(got) };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  return { ok: true, at: at0 };
}

/**
 * ТҮГЖЭЭГ СУНГАХ — урт `save`-ийн явцад (⚠️ 2026-10-12, аудит).
 *
 * ⚠️ ЯАГААД: `save` (эх хуудас + 500-ийн багцтай сарын обьём) `CLAIM_TTL`-ээс (10 мин) удаан үргэлжилбэл
 *    түгжээ дуусаж, өөр батлагч `claimPlan`-аар авч болно — тэр үед хоёр батлагч нэг хуваарийг давхар
 *    бичнэ. Дуудагч (`Huvaari`) TTL дотор үе үе дуудаж шинэ агшинг (`at`) өөрийн `claimAt` болгоно.
 * ⚠️ ЗӨВХӨН ӨӨРИЙН АМЬД ТҮГЖЭЭ: `pending` · түгжигч = би (хугацаа дуусаагүй) · `approverAt` ≈ `claimAt`
 *    (өөр цонх/сешн дахин түгжээгүй). Дууссан түгжээг СУНГАХГҮЙ — тэр үед `claimPlan` (бусдын түгжээг
 *    шалгадаг) шаардлагатай. `casClaim`-ийн ижил «унш → бич → дахин уншиж баталгаажуул» (ArcGIS-д
 *    нөхцөлт update алга); баталгаажуулалтад ялагдвал `ok: false` — дуудагч бичилтээ зогсооно.
 * ⚠️ `approver`/`approverAt`-аас өөр талбар хөндөхгүй — хагас бичилтийн тэмдэг (`reason`) хэвээр.
 */
export async function renewPlanClaim(args: { oid: number; approver: string; claimAt: number }): Promise<{ ok: boolean; at?: number; error?: string }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const own = sameAsLogin(me);
  if (own) return own;
  const fields = `${F.oid},${F.status},${F.approver},${F.approverAt}`;
  try {
    const url = await tableUrl(false);
    if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
    const read = async () => (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
    const cur = await read();
    if (!cur) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
    if (s(cur[F.status]) !== PLAN_STATUS.pending) return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
    const h = claimHolder(cur);
    if (h !== me) {
      return { ok: false, error: h
        ? tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', h)
        : tr('Таны батлах түгжээний хугацаа дууссан — эх хуудсанд юу ч бичигдсэнгүй. «Батлах»-ыг дахин дарна уу.') };
    }
    if (!sameClaimAt(cur[F.approverAt], args.claimAt)) {
      return { ok: false, error: tr('Энэ илгээлтийг таны өөр цонх түгжсэн байна — тэр цонхноос үргэлжлүүлнэ үү, эсвэл хуудсаа шинэчилнэ үү.') };
    }
    const at = serverNow();
    if (!(await writeClaim(url, args.oid, me, at))) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    const back = await read();
    if (!back || s(back[F.status]) !== PLAN_STATUS.pending || s(back[F.approver])?.toLowerCase() !== me || !sameClaimAt(back[F.approverAt], at)) {
      return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
    }
    return { ok: true, at };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
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
 * ⚠️ Түгжээ ӨӨРИЙНХ эсэхийг дуудагч (`Huvaari.save` → `approveGuard`) сая шалгасан (хурдны
 *    төлөө энд давхар дүрэм үгүй); зөвхөн `butsaasan_shaltgaan`-д тэмдэг бичнэ (`approver`/
 *    `approverAt` хөндөхгүй → түгжээ хэвээр).
 * ⚠️ 2026-10-08: ГЭХДЭЭ CAS хамгаалалттай — `approveGuard` ба энэ бичилтийн ЗАВСАРТ зохиогч
 *    татах/өөр батлагч түгжих боломжтой байсан тул тэмдэг «татсан»/бусдын мөрөнд суудаг байв.
 *    Одоо: төлөв/түгжээг дахин уншиж (`pending` ба түгжээ = би), бичээд, ДАХИН уншиж тэмдэг
 *    суусныг баталгаажуулна. Хоёр нэмэлт уншилт — тэмдэг нь эх хуудсанд бичихийн өмнөх
 *    ГАНЦ хамгаалалт тул үнэ цэнэтэй.
 * ⚠️ FAIL-CLOSED: бичигдээгүй бол дуудагч эх хуудсанд ЮУ Ч бичихгүй — тэмдэггүй хагас
 *    бичилт нь хамгаалалтгүй үлдэнэ. ArcGIS алдаа HTTP 200-аар ирдэг тул `editOk`.
 * ⚠️ 2026-10-12 (аудит): (1) `claimAt` — `approveGuard`-ийн ижил дүрэм: өөрийн ӨӨР цонхны түгжээтэй бол
 *    тэмдэг тавихгүй (тэр цонх эх хуудсанд бичиж эхэлсэн байж болно). (2) ТЭМДЭГ АЛЬ ХЭДИЙН БАЙВАЛ (хэний ч)
 *    ДАРЖ БИЧИХГҮЙ — `{ ok: true, existing: <эзэн> }`. Урьд нь өмнөх батлагчийн (түгжээ нь дууссан, бичилт нь
 *    хагас суусан) тэмдгийг өөрийн нэрээр дардаг тул «хэн хагас бичсэн» гэдэг мэдээлэл алдагдаж, тэр
 *    эзэн `clearPlanPartial(oid, owner)`-ээр арилгах эсэхийг шийдэх боломжгүй болдог байв. Тэмдэг хэвээр тул
 *    хамгаалалт (буцаах/татах хаалттай) хэвээр — дуудагч эх хуудсанд бичиж болно.
 */
export async function markPlanPartial(args: { oid: number; approver: string; claimAt?: number }): Promise<{ ok: boolean; error?: string; existing?: string }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const mark = `${PARTIAL_MARK}:${me}`;
  const fields = `${F.oid},${F.status},${F.approver},${F.approverAt},${F.reason}`;
  const otherWindow = () => tr('Энэ илгээлтийг таны өөр цонх түгжсэн байна — тэр цонхноос үргэлжлүүлнэ үү, эсвэл хуудсаа шинэчилнэ үү.');
  try {
    const cur = (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
    if (!cur) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
    if (s(cur[F.status]) !== PLAN_STATUS.pending) return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
    const h = claimHolder(cur);
    if (h !== me) {
      return { ok: false, error: h
        ? tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', h)
        : tr('Таны батлах түгжээний хугацаа дууссан — эх хуудсанд юу ч бичигдсэнгүй. «Батлах»-ыг дахин дарна уу.') };
    }
    if (args.claimAt != null && !sameClaimAt(cur[F.approverAt], args.claimAt)) return { ok: false, error: otherWindow() };
    /* ⚠️ 2026-10-12: байгаа тэмдгийг ДАРАХГҮЙ (дээрх ⚠️ (2)) */
    const had = partialBy(s(cur[F.status]), s(cur[F.reason]));
    if (had != null) return { ok: true, existing: had };
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.reason]: mark } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    invalidate('HUVAARI_BATLAH');
    const back = (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
    if (!back || s(back[F.status]) !== PLAN_STATUS.pending || claimHolder(back) !== me || (s(back[F.reason]) ?? '').trim() !== mark) {
      return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
    }
    if (args.claimAt != null && !sameClaimAt(back[F.approverAt], args.claimAt)) return { ok: false, error: otherWindow() };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/**
 * ХАГАС БИЧИЛТИЙН ТЭМДЭГ АРИЛГАХ (2026-10-01) — эх хуудсанд НЭГ Ч мөр бичигдээгүй унасан үед.
 * ⚠️ Зөвхөн тэмдэг байгаа үед (`partialBy`) — бодит буцаалтын шалтгааныг дарахгүй.
 * ⚠️ Унавал чимээгүй: тэмдэг үлдэх нь аюулгүй тал (буцаах хаагдсан ч дахин батлаж болно).
 * ⚠️ 2026-10-12 (аудит): `owner` өгвөл ЗӨВХӨН тэмдгийн эзэн нь тэр (жижиг үсгээр, хоосон зайгүй) бол
 *    арилгана, эс бөгөөс бичихгүй `false`. Урьд нь «миний оролдлого 0 мөр бичсэн» гэдгээр ӨӨР батлагчийн
 *    (эсвэл өөрийн өмнөх оролдлогын) хагас бичилтийн тэмдгийг арилгаж, хагас суусан саналыг буцаах/татах
 *    боломжтой болгодог байв. `owner`-гүй дуудлага — хуучин зан (зөвхөн аврах замууд).
 */
export async function clearPlanPartial(oid: number, owner?: string): Promise<boolean> {
  const url = await tableUrl(false);
  if (!url) return false;
  try {
    const cur = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.status},${F.reason}`);
    const pb = cur.length ? partialBy(s(cur[0][F.status]), s(cur[0][F.reason])) : null;
    if (pb == null) return false;
    if (owner != null && pb !== owner.trim().toLowerCase()) return false;
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
 * `returnStuckPlan`-ийн шалтгааны угтвар — зохиогч «бичигдсэн огноо хэвээр» гэдгийг харна.
 *
 * ⚠️ 2026-10-12 (аудит): ArcGIS-д ХЭЛНЭЭС ҮЛ ХАМААРАХ МОНГОЛ ЭХ ТЕКСТ (`STUCK_PREFIX_SRC`) бичигдэнэ.
 *    Урьд нь `tr()`-ийн үр дүнг бичдэг тул англи UI-тай батлагчийн буцаалт өгөгдөлд англиар суугаад
 *    монгол зохиогчид англиар харагддаг (эсрэгээр ч) байв. Дэлгэцэнд `displayReason`-оор орчуулна.
 *    `STUCK_PREFIX()` (орчуулсан) — ЗӨВХӨН дэлгэцэд; хуучин дуудагчдад нийцтэй.
 */
export const STUCK_PREFIX_SRC = 'Хагас бичигдсэн батлалт буцаагдав — хуудсанд аль хэдийн бичигдсэн огноо хэвээр.';
export const STUCK_PREFIX = (): string => tr('Хагас бичигдсэн батлалт буцаагдав — хуудсанд аль хэдийн бичигдсэн огноо хэвээр.');
/**
 * «Хуанли дээр нээлгүй буцаасан» тайлбар (`HuvaariBatlah`-ийн дарааллаас буцаах) — БИЧИХДЭЭ энэ эх
 * текстийг (`tr()`-гүй) шалтгааны сүүлийн мөрөнд залгана; дэлгэцэнд `displayReason` орчуулна (2026-10-12).
 */
export const BLIND_NOTE_SRC = '(Батлагч хуваарийг хуанли дээр нээлгүй буцаасан — өөрчлөгдсөн бүх мөрийг шалгана уу.)';
/**
 * ХАДГАЛСАН ШАЛТГААН/ТАЙЛБАРЫГ ДЭЛГЭЦЭНД (⚠️ 2026-10-12, аудит) — системийн тогтмол мөрүүдийг (`STUCK_PREFIX_SRC`
 * · `BLIND_NOTE_SRC`) идэвхтэй хэлээр орчуулна; хэрэглэгчийн бичсэн текст ХЭВЭЭР. Мөр тус бүрээр тулгана
 * (угтвар нь эхний мөр, тайлбар нь сүүлийн мөр — `\n`-ээр залгагддаг). `null`/хоосон → `''` (дуудагч
 * «шалтгаан бичигдээгүй» г.м.-ийг өөрөө харуулна). ⚠️ Литерал `tr()` — i18n-extract түлхүүрийг олно.
 * Урьд нь орчуулагдаж (англиар) хадгалагдсан хуучин мөр түүхийгээрээ харагдана.
 */
export function displayReason(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.split('\n').map((ln) => {
    const t = ln.trim();
    if (t === STUCK_PREFIX_SRC) return tr('Хагас бичигдсэн батлалт буцаагдав — хуудсанд аль хэдийн бичигдсэн огноо хэвээр.');
    if (t === BLIND_NOTE_SRC) return tr('(Батлагч хуваарийг хуанли дээр нээлгүй буцаасан — өөрчлөгдсөн бүх мөрийг шалгана уу.)');
    return ln;
  }).join('\n');
}

/**
 * ГАЦСАН (ХАГАС БИЧИГДСЭН) ИЛГЭЭЛТИЙГ БУЦААХ — батлагч эсвэл super (2026-10-08).
 * ⚠️ ЯАГААД: `PARTIAL_MARK`-тай `pending` мөрийг `decidePlan(approve:false)` ч, `withdrawPlan` ч
 *    татгалздаг — батлагч бичилтийг гүйцээж чадахгүй бол (агшин солигдсон, мөр алга, эрх
 *    хасагдсан) илгээлт МӨНХӨД `pending` үлдэж багц түгжигддэг байв (`ajilBatlah.returnStuckAjil`-ийн
 *    ижил сургамж). Одоо тэмдэгтэй ч `returned` болж, шалтгаан нь `STUCK_PREFIX`-ээр угтуулагдана:
 *    зохиогч эх хуудсанд ОРСОН огноог мэдэж засна. Түгжээ (`approver`/`approverAt`) шийдвэрийн
 *    утгаар дарагдаж тайлагдана.
 * ⚠️ Эх хуудсанд ЮУ Ч бичихгүй — хуудсанд суусан хэсгийг буцааж татахгүй (мэдэхгүй). Хүрээ —
 *    серверийн багцаар; зохиогч өөрөө буцаахгүй (`decidePlan`-ийн дүрэм). Тэмдэггүй `pending`-д
 *    ЭНЭ зам хаалттай — жирийн «Буцаах» (`decidePlan`) ашиглана.
 */
export async function returnStuckPlan(args: { oid: number; approver: string; reason: string }): Promise<{ ok: boolean; error?: string }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const why = args.reason.trim();
  if (!why) return { ok: false, error: tr('Буцаах шалтгааныг бичнэ үү.') };
  const own = sameAsLogin(me);
  if (own) return own;
  let url: string;
  let cur: Attrs[];
  try {
    const u = await tableUrl(false);
    if (!u) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
    url = u;
    cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.author},${F.pkgGroup},${F.reason},${F.approver},${F.approverAt}`);
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const who = meNow ?? me;
    const sc = roleForUser(who) === 'super' ? null : huvaariScope(who, 'approver');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцын хуваарийг батлах эрхгүй.') };
  }
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (author && me === author) {
    return { ok: false, error: tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== PLAN_STATUS.pending) return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
  if (partialBy(curStatus, s(cur[0][F.reason])) == null) {
    return { ok: false, error: tr('Энэ илгээлт хагас бичигдээгүй — жирийн «Буцаах»-аар буцаана уу.') };
  }
  /* ⚠️ 2026-10-08: ӨӨР батлагчийн ХҮЧИНТЭЙ түгжээтэй бол буцаахгүй (`decidePlan`-тай НЭГ дүрэм) —
     урьд нь гэйтгүй тул яг одоо бичилтээ гүйцээж буй батлагчийн илгээлтийг хоёр дахь батлагч
     «гацсан» гэж буцааж, бичилт нь «буцаагдсан» санал болж хуваарьт үлддэг байв.
     Хугацаа нь дууссан түгжээ саад биш (гацсан гэдэг нь яг тэр). */
  const holder = claimHolder(cur[0]);
  if (holder && holder !== me) {
    return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', holder) };
  }
  /* ⚠️ 2026-10-09: УНШААД-ШАЛГААД-БИЧИХ завсарт өөр батлагч түгжиж бичилтээ гүйцээж эхэлж болох
     байсан — одоо буцаалтын ӨМНӨ `casClaim`-аар түгжээг АТОМААР авна (`claimPlan`-тай НЭГ зам;
     эхний уншилт нь дээрх `cur`). Хугацаа нь дууссан түгжээг авч болно (`requireEmpty: false`).
     Буцаалт бичигдээгүй бол өөрийн түгжээг тайлна. */
  const claimFields = `${F.oid},${F.status},${F.approver},${F.approverAt}`;
  let first: Attrs | null = cur[0];
  try {
    const got = await casClaim({
      read: async () => {
        if (first) { const f = first; first = null; return f; }
        return (await query(`${F.oid} = ${Number(args.oid)}`, claimFields))[0] ?? null;
      },
      write: (at) => writeClaim(url, args.oid, me, at),
    }, me, { requireEmpty: false });
    if (!got.ok) return { ok: false, error: claimError(got) };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  /* ⚠️ 2026-10-12: эх (орчуулаагүй) угтвар — `STUCK_PREFIX_SRC`-ийн ⚠️ */
  const reason = `${STUCK_PREFIX_SRC}\n${why}`.slice(0, REASON_MAX);
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: {
        [F.oid]: args.oid,
        [F.status]: PLAN_STATUS.returned,
        [F.approver]: me,
        [F.approverAt]: serverNow(),
        [F.reason]: reason,
      } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) {
      await releasePlanClaim({ oid: args.oid, approver: me });
      return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    }
    invalidate('HUVAARI_BATLAH');
    return { ok: true };
  } catch (e) {
    /* ⚠️ 2026-10-09: хариу алдагдсан ч аюулгүй — `releasePlanClaim` зөвхөн `pending` + өөрийн түгжээг тайлна */
    await releasePlanClaim({ oid: args.oid, approver: me });
    return { ok: false, error: errText(e) };
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
 *    ⚠️ 2026-10-12 (дарааллын аудит): `requireCap('plan')` ХАСАГДСАН — татах нь эрх биш эзэмшил (доорх ⚠️).
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
  /* ⚠️ 2026-10-12 (дарааллын аудит): `requireCap('plan')` ХАСАГДСАН — өөрийн илгээлтээ татах нь ЭРХ биш ЭЗЭМШИЛ.
     Урьд нь зохиогчийн «хуваарь» эрхийг хассан (үүрэг хасагдсан, шат солигдсон) бол түүний хүлээгдэж буй илгээлт
     хэн ч татаж чадахгүй гацдаг байв (батлагч буцаатал багц `locked`). Эзэмшлийн шалгалт хэвээр ХАТУУ: татагч =
     НЭВТЭРСЭН хүн (доор) ба СЕРВЕРИЙН `F.author` = тэр хүн. Эрхгүй хүн БУСДЫН илгээлтийг урьдын адил татаж чадахгүй. */
  const me = args.me.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  if (typeof window !== 'undefined' && AUTH.appId) {
    const meNow = currentUser();
    if (!meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    if (meNow !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ татна.') };
  }
  /* ⚠️ 2026-10-12: уншилтыг `try` дотор (`decidePlan`-ийн 2026-10-06-ны дүрэм) — шидвэл амлалт татгалзагдаж
     дуудагч алдааг чимээгүй алддаг байв. */
  let url: string;
  let cur: Attrs[];
  try {
    const u = await tableUrl(false);
    if (!u) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
    url = u;
    cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.author},${F.approver},${F.approverAt},${F.reason}`);
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (author !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ татна.') };
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== PLAN_STATUS.pending) {
    const by = s(cur[0][F.approver]);
    return {
      ok: false,
      error: by
        ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, planStatusLabel(curStatus))
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
  /* ⚠️ 2026-10-12: өөрийн (зохиогчийн) үлдсэн түгжээ саад биш — доорх CAS-ийн тасарсан оролдлогоос үлдсэн байж болно */
  if (holder && holder !== me) {
    return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — татах боломжгүй. Хэсэг хугацааны дараа дахин оролдоно уу.', holder) };
  }
  /*
   * ⚠️ 2026-10-12 (аудит): ТАТАХЫН ӨМНӨ ТҮГЖЭЭГ ЗОХИОГЧ АТОМААР АВНА (`casClaim`, `returnStuckPlan`-ийн загвар).
   *    Урьд нь «уншаад-шалгаад-бичих» байсан тул дээрх шалгалт ба бичилтийн ЗАВСАРТ батлагч `claimPlan`-аар
   *    түгжиж эх хуудсанд бичиж эхэлж болох байв — тэр бичилт «татсан» саналын огноог хуваарьт суулгана.
   *    Одоо: (1) `casClaim` (өөр хүний амьд түгжээтэй бол татгалзана; хугацаа нь дууссаныг авч болно);
   *    (2) ДАХИН уншиж түгжээ МИНИЙХ (агшин нь таарна) ба хагас бичилтийн тэмдэггүйг шалгана — батлагч
   *        түгжээ авахаас өмнө `markPlanPartial` тавьсан байж болно; (3) бичнэ; (4) ДАХИН уншиж `withdrawn`
   *    болсныг баталгаажуулна. Татгалзах/унах бүрд өөрийн түгжээг тайлна (`releasePlanClaim` зөвхөн
   *    `pending` + өөрийн амьд түгжээг тайлдаг тул хариу алдагдсан бичилтэд ч аюулгүй).
   *    Түгжээ нь `approver` баганад зохиогчийн нэрээр хэдхэн хором харагдана — батлагчид «X батлаж байна».
   */
  const claimFields = `${F.oid},${F.status},${F.approver},${F.approverAt}`;
  const readHead = async (fields: string) => (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
  let first: Attrs | null = cur[0];
  let at0: number | undefined;
  try {
    const got = await casClaim({
      read: async () => {
        if (first) { const f = first; first = null; return f; }
        return readHead(claimFields);
      },
      write: (at) => { at0 = at; return writeClaim(url, args.oid, me, at); },
    }, me, { requireEmpty: false });
    if (!got.ok) return { ok: false, error: claimError(got) };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  const release = () => releasePlanClaim({ oid: args.oid, approver: me });
  try {
    const re = await readHead(`${claimFields},${F.reason}`);
    if (!re || s(re[F.status]) !== PLAN_STATUS.pending) {
      await release();
      return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
    }
    const pb2 = partialBy(s(re[F.status]), s(re[F.reason]));
    if (pb2 != null) {
      await release();
      return { ok: false, error: tr('Батлагч ({0}) энэ илгээлтийн хуваарийг эх хуудсанд ХЭСЭГЧЛЭН бичсэн — татах боломжгүй. Батлагч батлалтыг гүйцээнэ.', pb2 || '—') };
    }
    if (claimHolder(re) !== me || at0 == null || !sameClaimAt(re[F.approverAt], at0)) {
      await release();
      return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
    }
  } catch (e) {
    await release();
    return { ok: false, error: errText(e) };
  }
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: PLAN_STATUS.withdrawn,
    /* Түгжээний үлдэгдэл (зохиогчийн CAS түгжээ ч) «батлагч» баганад үлдэхгүй */
    [F.approver]: null,
    /* ⚠️ 2026-10-12: серверийн цагаар (`serverNow`-ийн ⚠️) */
    [F.approverAt]: serverNow(),
    [F.reason]: null,
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) { await release(); return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') }; }
    invalidate('HUVAARI_BATLAH');
  } catch (e) {
    await release();
    return { ok: false, error: errText(e) };
  }
  /* (4) баталгаажуулалт — уншилт унавал бичилт амжилттай хариутай тул `ok` (хуудас шинэчлэхэд харагдана) */
  try {
    const back = await readHead(`${F.oid},${F.status}`);
    if (!back || s(back[F.status]) !== PLAN_STATUS.withdrawn) {
      return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
    }
  } catch { /* бичилт `editOk` — амжилттай */ }
  return { ok: true };
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
      /* ⚠️ 2026-10-19 (аудит): ЗӨВХӨН ХҮРЭЭ (`huvaariScope`) — `decidePlan`-тай ИЖИЛ дүрэм. `planApprove` эрх нь хуваарилалтын
         ТУСГАЛ (`scopedAcl.syncCaps`) тул тусад нь шаардахад эрхийн бичилт унасан (өнчин/дутуу эрх) хүнд тэмдэг 0, батлах
         товч идэвхтэй гэсэн зөрчил гардаг байв. Хүрээ хоосон бол доор 0. */
      if (!me || !huvaariAclReady()) return null;
    }
    if (!(await planTableState(false)).ok) return null;
    const sc = AUTH.appId ? huvaariScope(me, 'approver') : null;
    if (Array.isArray(sc) && sc.length === 0) return 0;
    const rows = await loadBadgePending();
    /* ⚠️ 2026-10-12: серверийн цагаар, уншилтын ДАРАА (`query` зөрүүг шинэчилсэн байна) */
    const now = serverNow();
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

/**
 * ЗОХИОГЧИД БУЦААГДСАН, ДАХИН ИЛГЭЭГЭЭГҮЙ ИЛГЭЭЛТИЙН ТОО — «Хуваарь» цэсний тэмдэгт (2026-10-08).
 *
 * `HuvaariBatlah`-ийн «Буцаагдсан — засаад дахин илгээнэ» хэсэгтэй ИЖИЛ дүрэм: багцын СҮҮЛИЙН
 * илгээлт (`loadLastPerPkg`) `returned` · зохиогч нь би · зохиогчийн хүрээнд (`huvaariScope(…,
 * 'author')`). Дахин илгээсэн бол сүүлийнх нь `pending`/өөр тул тоологдохгүй.
 * ⚠️ 2026-10-09: ТӨРӨЛ тус бүрд — `loadLastPerPkg` нь (багц · төрөл)-өөр сүүлийнхийг өгдөг тул
 *    буцаагдсан төлөвлөгөө нь ИЖИЛ ТӨРЛИЙН шинэ шийдвэр/илгээлт гартал тоологдсоор; гэрээний шинэ
 *    илгээлт төлөвлөгөөний буцаалтыг арилгахгүй (ба эсрэгээр).
 * ⚠️ `null` ≠ 0 — `countPlanPending`-тэй ижил: мэдэхгүй бол `null`, `plan` эрхгүй бол 0.
 * ⚠️ `cached` — `HUVAARI_BATLAH` тагтай: илгээх/буцаах бүр хүчингүй болгодог тул өөрийн үйлдлийн
 *    дараа шууд шинэ тоо; бусдын буцаалтыг TTL барина.
 */
const loadBadgeLast = cached(loadLastPerPkg, BADGE_TTL, ['HUVAARI_BATLAH']);

export async function countPlanReturned(username: string | null | undefined): Promise<number | null> {
  try {
    const me = (username ?? '').trim().toLowerCase();
    if (!me) return AUTH.appId ? null : 0;
    if (AUTH.appId) {
      /* ⚠️ 2026-10-19 (аудит): ЗӨВХӨН зохиогчийн ХҮРЭЭ — `submitPlan`-тай ИЖИЛ (`countPlanPending`-ийн ⚠️) */
      if (!huvaariAclReady()) return null;
    }
    if (!(await planTableState(false)).ok) return null;
    const sc = AUTH.appId ? huvaariScope(me, 'author') : null;
    if (Array.isArray(sc) && sc.length === 0) return 0;
    const rows = await loadBadgeLast();
    return rows.filter((x) => x.status === PLAN_STATUS.returned
      && x.author.trim().toLowerCase() === me
      && (sc == null || sc.includes(x.pkgGroup))).length;
  } catch {
    return null;
  }
}

/**
 * ЗОХИОГЧИД САЯХАН БАТЛАГДСАН, ХАРААГҮЙ ИЛГЭЭЛТ — «Хуваарь» цэсний тэмдэгт (2026-10-09).
 *
 * ⚠️ ЯАГААД: буцаалт тэмдэгтэй (`countPlanReturned`) атлаа батлагдсан тухай зохиогч «Хуваарь» хуудсаа нээж
 *    сүүлийн шийдвэрийг харах хүртэл мэддэггүй байв. Богино настай: батлагдсанаас хойш `PLAN_APPROVED_TTL`
 *    (3 хоног) дотор, зохиогч «Хуваарь» хуудсанд тэр илгээлтийг хараагүй (`markPlanApprovedSeen`) бол л.
 * ⚠️ «Харсан» нь ЭНЭ ХӨТЧИЙН localStorage — өөр төхөөрөмжид дахин тоологдож болно (3 хоногоор хязгаарлагдана).
 * ⚠️ Дүрэм `countPlanReturned`-тэй ижил: (багц · төрөл)-ийн СҮҮЛИЙН илгээлт · зохиогч нь би · зохиогчийн хүрээнд.
 */
export const PLAN_APPROVED_TTL = 3 * 86_400_000;
const APPROVED_SEEN_KEY = 'selbe-huvaari-approved-seen';
function approvedSeen(): Set<number> {
  try {
    const v = JSON.parse(localStorage.getItem(APPROVED_SEEN_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : []);
  } catch { return new Set(); }
}
/** Зохиогч батлагдсан илгээлтийг «Хуваарь» хуудсанд харсныг тэмдэглэнэ (сүүлийн 200 л хадгална) */
export function markPlanApprovedSeen(oid: number): void {
  try {
    const s = approvedSeen();
    if (s.has(oid)) return;
    s.add(oid);
    localStorage.setItem(APPROVED_SEEN_KEY, JSON.stringify([...s].slice(-200)));
  } catch { /* хаалттай орчин — тэмдэг 3 хоногийн дараа өөрөө алга болно */ }
}
export async function countPlanApproved(username: string | null | undefined): Promise<number | null> {
  try {
    const me = (username ?? '').trim().toLowerCase();
    if (!me) return AUTH.appId ? null : 0;
    if (AUTH.appId) {
      /* ⚠️ 2026-10-19 (аудит): ЗӨВХӨН зохиогчийн ХҮРЭЭ — `submitPlan`-тай ИЖИЛ (`countPlanPending`-ийн ⚠️) */
      if (!huvaariAclReady()) return null;
    }
    if (!(await planTableState(false)).ok) return null;
    const sc = AUTH.appId ? huvaariScope(me, 'author') : null;
    if (Array.isArray(sc) && sc.length === 0) return 0;
    const rows = await loadBadgeLast();
    const seen = approvedSeen();
    /* ⚠️ 2026-10-12: `approverAt` серверийн цагаар бичигддэг тул харьцуулалт ч серверийн цагаар */
    const now = serverNow();
    return rows.filter((x) => x.status === PLAN_STATUS.approved
      && x.author.trim().toLowerCase() === me
      && x.approverAt != null && now - x.approverAt < PLAN_APPROVED_TTL
      && !seen.has(x.oid)
      && (sc == null || sc.includes(x.pkgGroup))).length;
  } catch {
    return null;
  }
}
