'use client';

/**
 * НЭГЖ ТАЛБАРЫН ТӨЛӨВ ЗАСАХ — өгөгдлийн давхарга.
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
import { parcelAreaOf } from '@/lib/land';

const F = PARCEL_LEFT.fields;

/**
 * Шинэ үйлчилгээнд `OBJECTID` нэртэй талбар МӨН БАЙГАА боловч тэр нь ЭНГИЙН
 * Integer багана — жинхэнэ OID нь `FID`. Хуучнаар үлдээвэл `applyEdits` буруу
 * мөр рүү бичих (эсвэл огт олохгүй) эрсдэлтэй. Одоо `services.ts`-ийн
 * заалтаас гарна — хоёр газар бичихгүй.
 */
export const PARCEL_OID = PARCEL_LEFT.oid;

/**
 * ЗАСАГДАХ ТӨЛӨВҮҮД — `PARCEL_STATUS_HUES`-ийн түлхүүрээс.
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
   */
  areaM2: number | null;
  address: string;
  note: string;
  /**
   * СҮҮЛД ЗАСВАРЛАСАН ХҮН ба ЦАГ — ArcGIS Editor Tracking-ээс (ЗӨВХӨН харуулна).
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
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const stampOrNull = (v: unknown): number | null => {
  const t = numOrNull(v);
  return t != null && t > 0 ? t : null;
};

/**
 * EDITOR TRACKING-ИЙН ТАЛБАРУУД — давхаргын метадатагийн `editFieldsInfo`-оос.
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

/**
 * ТЕКСТ ТАЛБАРЫН ДЭЭД УРТ — давхаргын метадатагийн `fields[].length`-ээс.
 */
export type TextKey = 'owner' | 'address' | 'note';
export type FieldLens = Partial<Record<TextKey, number>>;
const TEXT_KEYS: TextKey[] = ['owner', 'address', 'note'];

export function fieldLensOf(meta: unknown): FieldLens {
  const fs = (meta as { fields?: unknown } | null)?.fields;
  const out: FieldLens = {};
  if (!Array.isArray(fs)) return out;
  for (const k of TEXT_KEYS) {
    const name = String(F[k] ?? '').toLowerCase();
    const f = fs.find((x) => String((x as { name?: unknown })?.name ?? '').toLowerCase() === name) as
      { type?: unknown; length?: unknown } | undefined;
    if (f && f.type === 'esriFieldTypeString' && typeof f.length === 'number' && f.length > 0) out[k] = f.length;
  }
  return out;
}

/** Метадатаг НЭГ удаа татаж кэшлэнэ — алдаа нь засварыг ХААХГҮЙ (`loadEditFields`-ийн дүрэм) */
let fieldLensP: Promise<FieldLens> | null = null;
export function loadFieldLens(): Promise<FieldLens> {
  if (!fieldLensP) {
    const p: Promise<FieldLens> = arcgisPost(PARCEL_LEFT.url, {})
      .then((m) => fieldLensOf(m))
      .catch(() => {
        if (fieldLensP === p) fieldLensP = null;
        return {};
      });
    fieldLensP = p;
  }
  return fieldLensP;
}

/** Мөрийг `Parcel` болгоно — талбарын нэрийг НЭГ газар зураглана */
export function rowToParcel(r: Row, ef: EditFields | null = null): Parcel | null {
  const raw = r[PARCEL_OID];
  const oid = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(oid)) return null;
  return {
    oid,
    parcelNo: str(r[F.parcelNo]),
    owner: str(r[F.owner]),
    status: str(r[F.status]),
    progress: str(r[F.progress]),
    areaM2: parcelAreaOf(r),
    address: str(r[F.address]),
    note: str(r[F.note]),
    editedBy: ef?.editor ? str(r[ef.editor]).trim() || null : null,
    editedAt: ef?.editDate ? stampOrNull(r[ef.editDate]) : null,
  };
}

/**
 * НЭГ нэгж талбарыг дугаараар нь татна.
 */
export async function loadParcel(oid: number): Promise<Parcel | null> {
  if (!Number.isFinite(oid)) return null;
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
 */
export const parcelNoLikeWhere = (no: string): string =>
  `${F.parcelNo} LIKE ${sqlStr(`%${no.replace(/[%_[\]]/g, '')}%`)}`;

/**
 * КАДАСТРЫН ДУГААРААР ХАЙНА (2026-10-01, хэрэглэгч: бүгдийг зас).
 *
 * Эхлээд ЯГ таарцаар (`parcelNoWhere`); олдохгүй бөгөөд ≥4 тэмдэгт бол
 * хэсэгчилсэн таарцаар. Олон мөр буцааж болно — амьдаар нэг дугаар 2
 * мөрд байх тохиолдол бий (2026-10-01) тул дуудагч ЖАГСААЖ сонгуулна.
 */
export async function findParcelsByNo(input: string): Promise<ParcelHit[]> {
  const no = input.trim();
  if (!no) return [];
  const ask = (where: string) => queryFeatures(PARCEL_LEFT.url, {
    where,
    outFields: [PARCEL_OID, F.parcelNo, F.owner, F.status],
    orderBy: `${PARCEL_OID} ASC`,
    limit: PARCEL_FIND_LIMIT + 1,
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
 */
export const loadProgressValues = cached<string[]>(async () => {
  const rows = await queryGroup(PARCEL_LEFT.url, F.progress, [count(PARCEL_OID, 'n')]);
  return rows
    .map((r) => str(r[F.progress]))
    .filter((v) => v !== '')
    .sort((a, b) => a.localeCompare(b, 'mn'));
}, undefined, ['PARCEL_LEFT']);

/* ══════════════════ Шалгуур ══════════════════ */

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
 */
export function validateParcelChanged(
  before: Parcel,
  patch: ParcelPatch,
  lens: FieldLens = {},
): Partial<Record<keyof ParcelPatch, string>> {
  const e: Partial<Record<keyof ParcelPatch, string>> = patch.status === before.status ? {} : validateParcel(patch);
  for (const k of TEXT_KEYS) {
    const max = lens[k];
    if (max != null && patch[k] !== before[k] && patch[k].length > max) {
      e[k] = tr('Хамгийн ихдээ {0} тэмдэгт', String(max));
    }
  }
  return e;
}

/* ══════════════════ Бичилт ══════════════════ */

/**
 * ӨӨРЧЛӨГДСӨН ТАЛБАРУУДЫГ ялгаж, `applyEdits`-ийн `attributes` болгоно.
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
 * @returns хадгалагдсан НЭГЖ ТАЛБАРЫН тоо: 0 = өөрчлөлт байгаагүй, 1 = энэ талбар.
 */
export async function saveParcel(
  before: Parcel,
  patch: ParcelPatch,
): Promise<number> {
  const d = diffParcel(before, patch);
  if (Object.keys(d).length === 0) return 0;
  requireCap('gazar');

  await applyAll(PARCEL_LEFT.url, PARCEL_OID, {
    updates: [{ [PARCEL_OID]: before.oid, ...d }],
  });

  invalidate('PARCEL_LEFT');
  return 1;
}

/** Тухайн талбарыг зурагт тодруулах SQL */
export const parcelWhere = (oid: number): string => `${PARCEL_OID} = ${Math.trunc(oid)}`;

/** Дугаараар хайх (маягтын гарчигт) — кадастрын дугаар нь текст талбар */
export const parcelNoWhere = (no: string): string => `${F.parcelNo} = ${sqlStr(no)}`;
