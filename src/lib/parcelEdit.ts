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
import { queryFeatures, queryGroup, count, sqlStr, type Row } from '@/lib/query';
import { applyAll } from '@/lib/tableWrite';
import { invalidate } from '@/lib/dataBus';
import { cached } from '@/lib/live';

const F = PARCEL_LEFT.fields;

/**
 * ⚠️ `PARCEL_LEFT`-д `oid` тодорхойлолт БАЙХГҮЙ (`GAZAR_PARCEL`, `BUILDING`-аас
 * ялгаатай). Давхаргын бүртгэл (`land:left`) ба энэ үйлчилгээ рүү ханддаг бүх
 * код `'OBJECTID'`-г шууд бичдэг тул энд нэг газар нэрлэв.
 */
export const PARCEL_OID = 'OBJECTID';

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
};

/** Маягтаас ирэх засварлагдах хэсэг */
export type ParcelPatch = Pick<Parcel, 'owner' | 'status' | 'progress' | 'address' | 'note'>;

/* ══════════════════ Уншилт ══════════════════ */

const str = (v: unknown): string => (v == null ? '' : String(v));
const numOrNull = (v: unknown): number | null => {
  const x = Number(v);
  return v != null && Number.isFinite(x) ? x : null;
};

/** Мөрийг `Parcel` болгоно — талбарын нэрийг НЭГ газар зураглана */
export function rowToParcel(r: Row): Parcel | null {
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
  const rows = await queryFeatures(PARCEL_LEFT.url, {
    where: `${PARCEL_OID} = ${Math.trunc(oid)}`,
    limit: 1,
  });
  return rows.length ? rowToParcel(rows[0]) : null;
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
  put(F.status, before.status, patch.status);
  put(F.progress, before.progress, patch.progress);
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
 * @returns бичигдсэн талбарын тоо (0 = өөрчлөлт байгаагүй)
 */
export async function saveParcel(
  before: Parcel,
  patch: ParcelPatch,
): Promise<number> {
  const d = diffParcel(before, patch);
  const n = Object.keys(d).length;
  if (n === 0) return 0;

  await applyAll(PARCEL_LEFT.url, PARCEL_OID, {
    updates: [{ [PARCEL_OID]: before.oid, ...d }],
  });

  /**
   * ⚠️ БҮХ ХАМААРАЛТАЙ КЭШИЙГ ХАЯНА. `PARCEL_LEFT` түлхүүрт `loadClearance`,
   * дашбоардын үлдсэн талбар, тайлан, схем, мөн (2026-08-31-нээс) `land.ts`-ийн
   * `loadLandStatus` ба `parcelOverlap`-ийн геометрийн кэш бүртгэгдсэн.
   */
  invalidate('PARCEL_LEFT');
  return n;
}

/** Тухайн талбарыг зурагт тодруулах SQL */
export const parcelWhere = (oid: number): string => `${PARCEL_OID} = ${Math.trunc(oid)}`;

/** Дугаараар хайх (маягтын гарчигт) — кадастрын дугаар нь текст талбар */
export const parcelNoWhere = (no: string): string => `${F.parcelNo} = ${sqlStr(no)}`;
