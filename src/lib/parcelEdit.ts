'use client';

/**
 * НЭГЖ ТАЛБАРЫН ТӨЛӨВ ЗАСАХ — өгөгдлийн давхарга.
 *
 * ⚠️ REACT ЭНД ОРОХГҮЙ. Зөвхөн унших/бичих/шалгах цэвэр функцүүд тул
 * `parcelEdit.check.mjs` түүнийг шууд импортлон шалгана.
 *
 * ⚠️ ЯАГААД (2026-08-31, хэрэглэгчийн шийдвэр): төлөв солих цорын ганц зам нь
 * ArcGIS Experience Builder-ийн ТУСДАА апп байсан. Хэрэглэгч порталаас гарч,
 * өөр систем нээж, ажлаа тэнд хийгээд буцаж ирдэг байв. Одоо тэр үйл
 * ажиллагааг систем дотроо давтана — embed БИШ, өөрийн маягт.
 *
 * ⚠️ ХАМГИЙН ЧУХАЛ ХОЁР ДҮРЭМ:
 *
 *   1. ЗӨВХӨН ӨӨРЧЛӨГДСӨН ТАЛБАРЫГ БИЧНЭ (`diffParcel`). Бүтэн мөрийг буцааж
 *      бичвэл яг тэр агшинд өөр хүн зассан баганыг ДАРЖ БИЧНЭ. ArcGIS-д мөрийн
 *      түвшний түгжээ байхгүй тул энэ нь чимээгүй өгөгдөл алдагдуулна.
 *
 *   2. ТҮҮХИЙ УТГЫГ ХЭВЭЭР ХАДГАЛНА. Үйлчилгээнд «гэрээлсэн», «гэрээлсэн.»,
 *      «гэрээлсэн. » гэсэн ГУРВАН өөр бичиглэл бодитоор байгаа
 *      (`PARCEL_PROGRESS_HUES`-ийн давхардсан түлхүүрүүд үүний гэрч). Тэднийг
 *      «цэвэрлэх» гэж trim хийвэл тухайн мөр бусдаасаа тасарч, өнгөний зураглал,
 *      бүлэглэлт хоёулаа зөрнө. Сонголтын жагсаалт нь ҮЙЛЧИЛГЭЭНЭЭС амьдаар
 *      уншигдана — кодод бэхлэгдэхгүй.
 */

import { t as tr } from '@/lib/i18nCore';
import { PARCEL_LEFT, PARCEL_STATUS_HUES } from '@/lib/services';
import { arcgisPost, queryFeatures, queryGroup, count, sqlStr, type Row } from '@/lib/query';
import { applyAll } from '@/lib/tableWrite';
import { requireCap } from '@/lib/who';
import { invalidate } from '@/lib/dataBus';
import { cached } from '@/lib/live';

const F = PARCEL_LEFT.fields;

/**
 * ⚠️ 2026-09-06: `'OBJECTID'` → `PARCEL_LEFT.oid` (`'FID'`).
 *
 * Шинэ үйлчилгээнд `OBJECTID` нэртэй талбар МӨН БАЙГАА боловч тэр нь ЭНГИЙН
 * Integer багана — жинхэнэ OID нь `FID`. Хуучнаар үлдээвэл `applyEdits` буруу
 * мөр рүү бичих (эсвэл огт олохгүй) эрсдэлтэй. Одоо `services.ts`-ийн
 * заалтаас гарна — хоёр газар бичихгүй.
 */
export const PARCEL_OID = PARCEL_LEFT.oid;

/**
 * ЗАСАГДАХ ТӨЛӨВҮҮД — `PARCEL_STATUS_HUES`-ийн түлхүүрээс.
 *
 * ⚠️ Тусдаа жагсаалт бичихгүй: газрын зургийн будалт ба маягтын сонголт НЭГ
 * эх сурвалжаас гарах ёстой. Хоёр газар бичвэл шинэ төлөв нэмэгдэхэд аль нэг нь
 * хоцорч, зураг дээр өнгөтэй атлаа маягтад сонгогдохгүй утга үүснэ.
 */
export const STATUS_LIST: string[] = Object.keys(PARCEL_STATUS_HUES);

export type Parcel = {
  oid: number;
  /** Кадастрын дугаар — ЗӨВХӨН харуулна */
  parcelNo: string;
  owner: string;
  /** `Tuluv` — ТҮҮХИЙ утга */
  status: string;
  /** `явцын_мэдээ` — ТҮҮХИЙ утга (арын зай, цэг хэвээр) */
  progress: string;
  /**
   * Талбай м² — ЗӨВХӨН харуулна.
   * ⚠️ Геометрээс гардаг тул гараар засвал зурагтай зөрнө. Experience
   *    Builder-т засагддаг нь тэр апп геометрийг ч засдагтай холбоотой.
   */
  areaM2: number | null;
  address: string;
  note: string;
  /**
   * СҮҮЛД ЗАСВАРЛАСАН ХҮН ба ЦАГ — ArcGIS Editor Tracking-ээс (ЗӨВХӨН харуулна).
   * ⚠️ 2026-10-01: давхаргын `editFieldsInfo` байхгүй (тохиргоо унтраалттай) эсвэл
   *    мөрд утга алга бол `null` — «хэн ч засаагүй» гэсэн утга БИШ, «мэдэхгүй».
   */
  editedBy: string | null;
  /** ms epoch; `null` = мэдэгдэхгүй (0 БИШ) */
  editedAt: number | null;
};

/** Маягтаас ирэх засварлагдах хэсэг */
export type ParcelPatch = Pick<Parcel, 'owner' | 'status' | 'progress' | 'address' | 'note'>;

/* ══════════════════ Уншилт ══════════════════ */

const str = (v: unknown): string => (v == null ? '' : String(v));
const numOrNull = (v: unknown): number | null => {
  const x = Number(v);
  return v != null && Number.isFinite(x) ? x : null;
};
/** ⚠️ 0/сөрөг тамга нь «огноо алга» — 1970 он гэж харуулахгүй */
const stampOrNull = (v: unknown): number | null => {
  const t = numOrNull(v);
  return t != null && t > 0 ? t : null;
};

/**
 * EDITOR TRACKING-ИЙН ТАЛБАРУУД — давхаргын метадатагийн `editFieldsInfo`-оос.
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): талбарын нэрийг ХАТУУ бичихгүй —
 *    ArcGIS Online-д анхдагч нь `Editor`/`EditDate` боловч Enterprise ба
 *    shapefile-аас нийтэлсэн үйлчилгээнд өөр нэртэй байж болно. Метадата нь
 *    үнэн эх. Тохиргоо унтраалттай бол `editFieldsInfo` нь `null` → энэ функц
 *    `null` буцааж, маягт «сүүлд засварласан» мөрийг ОГТ харуулахгүй.
 *    Тохиргоог асаамагц код өөрчлөхгүйгээр идэвхжинэ (амьдаар 2026-10-01-нд
 *    `Selbe_jijuur` давхаргад асаалттай байгааг баталсан).
 */
export type EditFields = { editor: string | null; editDate: string | null };

export function editFieldsOf(meta: unknown): EditFields | null {
  const e = (meta as { editFieldsInfo?: unknown } | null)?.editFieldsInfo;
  if (!e || typeof e !== 'object') return null;
  const pick = (k: string): string | null => {
    const v = (e as Record<string, unknown>)[k];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  const editor = pick('editorField');
  const editDate = pick('editDateField');
  return editor || editDate ? { editor, editDate } : null;
}

/**
 * Метадатаг НЭГ удаа татаж кэшлэнэ.
 * ⚠️ Алдаа нь засварыг ХААХГҮЙ — `null` (мөрийг харуулахгүй) болж, кэш
 *    цэвэрлэгдэнэ: дараагийн маягт дахин оролдоно. Энэ бол бүдүүвчийн мета
 *    (мөр БИШ) тул `PARCEL_LEFT`-ийн хүчингүйжүүлэлтэд холбох шаардлагагүй.
 */
let editFieldsP: Promise<EditFields | null> | null = null;
export function loadEditFields(): Promise<EditFields | null> {
  if (!editFieldsP) {
    const p: Promise<EditFields | null> = arcgisPost(PARCEL_LEFT.url, {})
      .then((m) => editFieldsOf(m))
      .catch(() => {
        if (editFieldsP === p) editFieldsP = null;
        return null;
      });
    editFieldsP = p;
  }
  return editFieldsP;
}

/** Мөрийг `Parcel` болгоно — талбарын нэрийг НЭГ газар зураглана */
export function rowToParcel(r: Row, ef: EditFields | null = null): Parcel | null {
  /* ⚠️ `Number(null)` нь 0 — `isFinite` дангаараа хоосон OID-г нэвтрүүлнэ */
  const raw = r[PARCEL_OID];
  const oid = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(oid)) return null;
  return {
    oid,
    parcelNo: str(r[F.parcelNo]),
    owner: str(r[F.owner]),
    status: str(r[F.status]),
    progress: str(r[F.progress]),
    /* ⚠️ Геометргүй 11 мөрд ЗӨВХӨН `Талбай` утгатай — нөхөх зам хэвээр */
    areaM2: numOrNull(r[F.area]) ?? numOrNull(r[F.areaAlt]),
    address: str(r[F.address]),
    note: str(r[F.note]),
    editedBy: ef?.editor ? str(r[ef.editor]).trim() || null : null,
    editedAt: ef?.editDate ? stampOrNull(r[ef.editDate]) : null,
  };
}

/**
 * НЭГ нэгж талбарыг дугаараар нь татна.
 *
 * ⚠️ Газрын зургийн `onPick` нь давхаргын `outFields`-д АЧААЛАГДСАН талбарыг л
 * буцаадаг тул маягтыг тэр өгөгдлөөр нээвэл хагас бөглөгдсөн байж болно.
 * Тиймээс OID-г л авч, мөрийг ЭНД бүтнээр нь дахин татна.
 */
export async function loadParcel(oid: number): Promise<Parcel | null> {
  if (!Number.isFinite(oid)) return null;
  /* ⚠️ `outFields: *` (анхдагч) тул Editor Tracking-ийн талбарууд ч хамт ирнэ;
     метадата нь аль талбар болохыг хэлнэ (`loadEditFields` хэзээ ч унахгүй). */
  const [rows, ef] = await Promise.all([
    queryFeatures(PARCEL_LEFT.url, {
      where: `${PARCEL_OID} = ${Math.trunc(oid)}`,
      limit: 1,
    }),
    loadEditFields(),
  ]);
  return rows.length ? rowToParcel(rows[0], ef) : null;
}

/** Дугаараар хайсан үр дүнгийн нэг мөр — жагсаалтаас сонгуулахад хангалттай */
export type ParcelHit = { oid: number; parcelNo: string; owner: string; status: string };

/** Нэг хайлтын дээд мөр — олон таарвал эхний N-ийг л жагсаана */
export const PARCEL_FIND_LIMIT = 20;
/** Хэсэгчилсэн (LIKE) хайлтын доод урт — 1–3 оронгоор хайвал бараг бүх мөр таарна */
export const PARCEL_FIND_MIN_LIKE = 4;

/**
 * Хэсэгчилсэн хайлтын SQL — `LIKE N'%…%'`.
 * ⚠️ LIKE-ийн тусгай тэмдэгтүүдийг (`%` `_` `[` `]`) ХАСНА: кадастрын дугаарт
 *    байдаггүй бөгөөд үлдээвэл хэрэглэгчийн бичсэн «_» бүх тэмдэгтэд таарна.
 */
export const parcelNoLikeWhere = (no: string): string =>
  `${F.parcelNo} LIKE ${sqlStr(`%${no.replace(/[%_[\]]/g, '')}%`)}`;

/**
 * КАДАСТРЫН ДУГААРААР ХАЙНА (2026-10-01, хэрэглэгч: бүгдийг зас).
 *
 * Эхлээд ЯГ таарцаар (`parcelNoWhere`); олдохгүй бөгөөд ≥4 тэмдэгт бол
 * хэсэгчилсэн таарцаар. ⚠️ Олон мөр буцааж болно — амьдаар нэг дугаар 2
 * мөрд байх тохиолдол бий (2026-10-01) тул дуудагч ЖАГСААЖ сонгуулна.
 * ⚠️ `orderBy` ЗААВАЛ (OID) — `limit`-тэй хуудаслалт эрэмбэгүй бол тогтворгүй.
 */
export async function findParcelsByNo(input: string): Promise<ParcelHit[]> {
  const no = input.trim();
  if (!no) return [];
  const ask = (where: string) => queryFeatures(PARCEL_LEFT.url, {
    where,
    outFields: [PARCEL_OID, F.parcelNo, F.owner, F.status],
    orderBy: `${PARCEL_OID} ASC`,
    limit: PARCEL_FIND_LIMIT,
  });
  let rows = await ask(parcelNoWhere(no));
  if (!rows.length && no.replace(/[%_[\]]/g, '').length >= PARCEL_FIND_MIN_LIKE) {
    rows = await ask(parcelNoLikeWhere(no));
  }
  return rows
    .map((r) => rowToParcel(r))
    .filter((p): p is Parcel => p != null)
    .map((p) => ({ oid: p.oid, parcelNo: p.parcelNo, owner: p.owner, status: p.status }));
}

/**
 * ЯВЦЫН МЭДЭЭНИЙ утгуудыг ҮЙЛЧИЛГЭЭНЭЭС.
 *
 * ⚠️ Кодод бэхлэхгүй: бохир бичиглэлүүд (арын зай, цэг) бодитоор байгаа бөгөөд
 * тэднийг сонголтод харуулахгүй бол тухайн мөрийг засах гэсэн хүн утгыг нь
 * санамсаргүй «цэвэр» хувилбар руу шилжүүлж, өмнөх бүлэглэлтийг эвдэнэ.
 */
export const loadProgressValues = cached<string[]>(async () => {
  const rows = await queryGroup(PARCEL_LEFT.url, F.progress, [count(PARCEL_OID, 'n')]);
  return rows
    .map((r) => str(r[F.progress]))
    .filter((v) => v !== '')
    .sort((a, b) => a.localeCompare(b, 'mn'));
}, undefined, ['PARCEL_LEFT']);

/* ══════════════════ Шалгуур ══════════════════ */

/**
 * ⚠️ МЭДЭЭЛНЭ, ЗАСАХГҮЙ. Хэрэглэгчийн бичсэнийг чимээгүй өөрчлөхгүй — зөвхөн
 * буруу гэдгийг хэлнэ (`validateZov`-ийн зарчим).
 */
export function validateParcel(p: ParcelPatch): Partial<Record<keyof ParcelPatch, string>> {
  const e: Partial<Record<keyof ParcelPatch, string>> = {};
  if (!p.status.trim()) {
    e.status = tr('Төлөв сонгоно уу');
  } else if (!STATUS_LIST.includes(p.status)) {
    /* Зурагт өнгөгүй утга орвол тэр талбар газрын зураг дээр алга болно */
    e.status = tr('Танигдахгүй төлөв — жагсаалтаас сонгоно уу');
  }
  return e;
}

/**
 * ЗӨВХӨН ӨӨРЧЛӨГДСӨН талбарыг шалгана (`butetsEdit.validateChanged`-ийн зарчим).
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): урьд нь `validateParcel` нь төлөвийг
 *    ҮРГЭЛЖ шалгадаг байв. Хуучин/танигдахгүй төлөвтэй мөр (жиш. 2026-09-06-ны
 *    шилжилтээс өмнөх «Үлдсэн нэгж талбар», эсвэл хоосон) дээр хэрэглэгч ЗӨВХӨН
 *    эзэмшигч/хаягийг засахад «Танигдахгүй төлөв» гэж хадгалалт ХААГДДАГ байв —
 *    огт хөндөөгүй талбарын төлөө. Одоо төлөв нь ӨӨРЧЛӨГДСӨН үед л шалгагдана;
 *    хөндөөгүй бол `diffParcel` түүнийг БИЧИХГҮЙ тул түүхий утга хэвээр үлдэнэ.
 */
export function validateParcelChanged(
  before: Parcel,
  patch: ParcelPatch,
): Partial<Record<keyof ParcelPatch, string>> {
  if (patch.status === before.status) return {};
  return validateParcel(patch);
}

/* ══════════════════ Бичилт ══════════════════ */

/**
 * ӨӨРЧЛӨГДСӨН ТАЛБАРУУДЫГ ялгаж, `applyEdits`-ийн `attributes` болгоно.
 *
 * ⚠️ Хоосон мөр → `null`, `""` БИШ. ArcGIS-ийн текст талбарт хоосон мөр бичвэл
 *    «утга байхгүй» биш «хоосон утга» болж, `IS NULL` шүүлтэд орохгүй.
 * ⚠️ ТҮҮХИЙ утгыг trim ХИЙХГҮЙ (файлын толгойн 2-р дүрэм).
 *
 * @returns өөрчлөлтгүй бол ХООСОН объект — дуудагч тал сүлжээнд огт залгахгүй
 */
export function diffParcel(before: Parcel, patch: ParcelPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (field: string, was: string, now: string) => {
    if (was === now) return;
    out[field] = now === '' ? null : now;
  };
  put(F.owner, before.owner, patch.owner);
  /* ⚠️ 2026-09-21: `F.status` ба `F.progress` НЭГ талбар (`явцы_1`, `services.ts`-д
     санаатай). Хоёуланг нь `put` хийвэл сүүлийнх (progress) нь эхнийхээ
     чимээгүй дардаг байв — маягтын «Төлөв»-ийг сольсон ч хуучин «Явцын мэдээ»
     утга бичигдэх эрсдэлтэй. Нэг талбар бол ӨӨРЧЛӨГДСӨН нэгийг л бичнэ, хоёулаа
     өөрчлөгдвөл `status` (маягтын үндсэн хяналт) давамгайлна. Талбар нь
     ирээдүйд салвал хуучин зам хэвээр ажиллана. Амьд схемийг 2026-09-21-нд
     шалгах гэсэн боловч токен хүчингүй (498) — статик тодорхойлолтоор. */
  if (F.status === F.progress) {
    if (before.status !== patch.status) put(F.status, before.status, patch.status);
    else put(F.progress, before.progress, patch.progress);
  } else {
    put(F.status, before.status, patch.status);
    put(F.progress, before.progress, patch.progress);
  }
  put(F.address, before.address, patch.address);
  put(F.note, before.note, patch.note);
  return out;
}

/**
 * Засварыг үйлчилгээнд бичнэ.
 *
 * ⚠️ `applyAll` (`tableWrite.ts`) НЭГ атом хүсэлтээр явуулж, `rollbackOnFailure`
 * тавьж, серверийн талбарыг хасаж, HTTP-200-аар ирдэг мөр бүрийн алдааг
 * шалгадаг. Шинэ `applyEdits` бичих шаардлагагүй.
 *
 * ⚠️ Амжилттай болсны ДАРАА л кэшийг хүчингүй болгоно — амжилтгүй бичилтийн
 * дараа хүчингүй болговол сайн өгөгдлийг дэмий дахин татна.
 *
 * @returns хадгалагдсан НЭГЖ ТАЛБАРЫН тоо: 0 = өөрчлөлт байгаагүй, 1 = энэ талбар.
 *   ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): урьд нь БАГАНЫН тоо буцаадаг байсан
 *   тул нэг талбарын 3 багана засахад «3 талбар хадгалагдлаа» гэж бичигдэж, 3
 *   нэгж талбар засагдсан мэт уншигддаг байв.
 */
export async function saveParcel(
  before: Parcel,
  patch: ParcelPatch,
): Promise<number> {
  const d = diffParcel(before, patch);
  if (Object.keys(d).length === 0) return 0;
  /* ⚠️ Эрхийг lib-д (2026-09-17) — урьд нь зөвхөн `GazarEdit`-ийн товч. */
  requireCap('gazar');

  await applyAll(PARCEL_LEFT.url, PARCEL_OID, {
    updates: [{ [PARCEL_OID]: before.oid, ...d }],
  });

  /**
   * ⚠️ БҮХ ХАМААРАЛТАЙ КЭШИЙГ ХАЯНА. `PARCEL_LEFT` түлхүүрт `loadClearance`,
   * дашбоардын үлдсэн талбар, тайлан, схем, мөн (2026-08-31-нээс) `land.ts`-ийн
   * `loadLandStatus` ба `parcelOverlap`-ийн геометрийн кэш бүртгэгдсэн.
   */
  invalidate('PARCEL_LEFT');
  return 1;
}

/** Тухайн талбарыг зурагт тодруулах SQL */
export const parcelWhere = (oid: number): string => `${PARCEL_OID} = ${Math.trunc(oid)}`;

/** Дугаараар хайх (маягтын гарчигт) — кадастрын дугаар нь текст талбар */
export const parcelNoWhere = (no: string): string => `${F.parcelNo} = ${sqlStr(no)}`;
