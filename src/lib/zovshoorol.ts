/**
 * БАГЦЫН ЗӨВШӨӨРЛҮҮД — шат дараалсан хяналт.
 */

import { agsFetch } from '@/modules/sheet/ags';
import { GUITS } from '@/lib/services';
import { t as tr } from '@/lib/i18nCore';
import { invalidate } from '@/lib/dataBus';
import { requireCap } from '@/lib/who';
import { isLostWrite } from '@/lib/lostWrite';

export const URL =
  `${GUITS}/181`;

/** Талбарын нэрс — CSV-ийн толгойтой ЯГ ижил. */
export const F = {
  bagts: 'bagts',
  shat: 'shat',
  ner: 'zovshoorol_ner',
  selbe: 'selbe_hariutsagch',
  tolov: 'tolov',
  ognoo: 'ognoo',
  dugaar: 'dugaar',
  baiguullaga: 'shiidverleh_baiguullaga',
  hariutsagch: 'shiidverleh_hariutsagch',
  tailbar: 'tailbar',
  oid: 'objectid',
} as const;

/**
 * ТӨЛӨВҮҮД. Гурав, өөр байхгүй — үйлчилгээнд танихгүй утга орвол
 * `unknown` болж, ногооноор ЧИМЭЭГҮЙ «зөвшөөрөгдсөн» гэж харагдахгүй.
 */
export const TOLOV = {
  wait: 'Хүлээгдэж буй',
  ok: 'Зөвшөөрсөн',
  no: 'Зөвшөөрөөгүй',
} as const;
export type Tolov = (typeof TOLOV)[keyof typeof TOLOV] | 'unknown';

export type Zov = {
  oid: number;
  bagts: string;
  shat: number;
  ner: string;
  selbe: string;
  tolov: Tolov;
  /** ms epoch, хоосон бол `null` */
  ognoo: number | null;
  dugaar: string;
  baiguullaga: string;
  hariutsagch: string;
  tailbar: string;
  /**
   * БҮРТГЭГДСЭН ЦАГ (ms) — «хэдэн хоног хүлээгдэж байна»-ыг тоолох суурь.
   */
  since?: number | null;
};

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * ОГНОО — ХОЁР хэлбэрийг хүлээж авна.
 */
const dateMs = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v).trim());
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const isTolov = (v: string): v is Exclude<Tolov, 'unknown'> =>
  (Object.values(TOLOV) as string[]).includes(v);

/* ═══════════════ OBJECTID-ын НЭРИЙГ АЖИЛЛАХ ҮЕД ОЛОХ ═══════════════ */

/**
 * Мөрийн түлхүүрүүдээс OBJECTID-ыг ҮСГИЙН МЭДРЭМЖГҮЙ олно.
 */
export const oidKey = (a: Record<string, unknown>, name?: string | null): string | null => {
  const keys = Object.keys(a);
  if (name) {
    const n = name.toLowerCase();
    const hit = keys.find((k) => k.toLowerCase() === n);
    if (hit) return hit;
  }
  return keys.find((k) => /^objectid$/i.test(k)) ?? null;
};

/**
 * ДАВХАРГЫН МЕТАДАТА — НЭГ удаа татна (OID нэр ба Editor Tracking хоёул эндээс).
 */
let metaP: Promise<Record<string, unknown>> | null = null;
function zovMeta(): Promise<Record<string, unknown>> {
  if (!metaP) {
    const p: Promise<Record<string, unknown>> = agsFetch(URL, {});
    metaP = p;
    p.catch(() => { if (metaP === p) metaP = null; });
  }
  return metaP;
}

/**
 * Үйлчилгээний метадатагаас `objectIdField`-ыг унших (нэг удаа кэшлэнэ).
 * БИЧИХ зам (`applyEdits` → `updates`) энэ нэрийг хэрэглэнэ.
 */
let oidFieldP: Promise<string> | null = null;
export function oidField(): Promise<string> {
  if (!oidFieldP) {
    oidFieldP = zovMeta()
      .then((j) => {
        const meta = typeof j.objectIdField === 'string' ? j.objectIdField.trim() : '';
        if (meta) return meta;
        const fields = (j.fields ?? []) as { name?: string; type?: string }[];
        const byType = fields.find((f) => f.type === 'esriFieldTypeOID')?.name;
        const byName = fields.find((f) => /^objectid$/i.test(String(f.name ?? '')))?.name;
        return byType || byName || F.oid;
      })
      .catch(() => {
        oidFieldP = null;
        return F.oid as string;
      });
  }
  return oidFieldP;
}

/* ═══════════════ ТЕКСТ ТАЛБАРЫН ДЭЭД УРТ (2026-10-09) ═══════════════ */

export type ZovTextKey = 'ner' | 'selbe' | 'dugaar' | 'baiguullaga' | 'hariutsagch' | 'tailbar';
export type ZovFieldLens = Partial<Record<ZovTextKey, number>>;
const ZOV_TEXT_KEYS: ZovTextKey[] = ['ner', 'selbe', 'dugaar', 'baiguullaga', 'hariutsagch', 'tailbar'];

export function zovFieldLensOf(meta: unknown): ZovFieldLens {
  const fs = (meta as { fields?: unknown } | null)?.fields;
  const out: ZovFieldLens = {};
  if (!Array.isArray(fs)) return out;
  for (const k of ZOV_TEXT_KEYS) {
    const name = F[k].toLowerCase();
    const f = fs.find((x) => String((x as { name?: unknown })?.name ?? '').toLowerCase() === name) as
      { type?: unknown; length?: unknown } | undefined;
    if (f && f.type === 'esriFieldTypeString' && typeof f.length === 'number' && f.length > 0) out[k] = f.length;
  }
  return out;
}

export const loadZovFieldLens = (): Promise<ZovFieldLens> =>
  (URL ? zovMeta().then(zovFieldLensOf, () => ({})) : Promise.resolve({}));

/* ═══════════════ ХҮЛЭЭЛТИЙН НАС — Editor Tracking (2026-10-01) ═══════════════ */

/** Хүлээгдэж буй зөвшөөрлийг «удаж буй» гэж тэмдэглэх босго (хоног) */
export const PENDING_STALE_DAYS = 30;
const DAY_MS = 86_400_000;

/** Editor Tracking-ийн огнооны талбарууд — `null` бол тохиргоо унтраалттай */
export type SinceFields = { created: string | null; edited: string | null };

/**
 * Метадатагийн `editFieldsInfo`-оос огнооны талбарын НЭРС (цэвэр функц).
 */
export function sinceFieldsOf(meta: unknown): SinceFields | null {
  const e = (meta as { editFieldsInfo?: unknown } | null)?.editFieldsInfo;
  if (!e || typeof e !== 'object') return null;
  const pick = (k: string): string | null => {
    const v = (e as Record<string, unknown>)[k];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  const created = pick('creationDateField');
  const edited = pick('editDateField');
  return created || edited ? { created, edited } : null;
}

const sinceFields = (): Promise<SinceFields | null> =>
  zovMeta().then(sinceFieldsOf, () => null);

/** Мөрийн бүртгэгдсэн цаг: үүсгэсэн → (байхгүй бол) сүүлд зассан → `null` */
export function sinceOf(a: Record<string, unknown>, sf: SinceFields | null): number | null {
  if (!sf) return null;
  for (const k of [sf.created, sf.edited]) {
    if (!k) continue;
    const t = Number(a[k]);
    if (a[k] != null && Number.isFinite(t) && t > 0) return t;
  }
  return null;
}

/**
 * Хүлээгдэж буй зөвшөөрлийн НАС (бүтэн хоног). Хүлээгдэж буй биш, эсвэл
 * бүртгэгдсэн цаг мэдэгдэхгүй бол `null` — 0 БИШ.
 */
export function pendingAgeDays(z: Pick<Zov, 'tolov' | 'since'>, now: number): number | null {
  if (z.tolov !== TOLOV.wait || z.since == null) return null;
  return Math.max(0, Math.floor((now - z.since) / DAY_MS));
}

/** `PENDING_STALE_DAYS`-аас ИЛҮҮ хоног хүлээгдэж буй эсэх */
export function isStalePending(
  z: Pick<Zov, 'tolov' | 'since'>, now: number, days = PENDING_STALE_DAYS,
): boolean {
  const age = pendingAgeDays(z, now);
  return age != null && age > days;
}

/** Жагсаалтын төлөвийн шүүлт */
export type ZovFilter = 'all' | 'wait' | 'stale' | 'ok' | 'no' | 'unknown';

export function filterZov(rows: Zov[], f: ZovFilter, now: number): Zov[] {
  switch (f) {
    case 'all': return rows;
    case 'stale': return rows.filter((r) => isStalePending(r, now));
    case 'wait': return rows.filter((r) => r.tolov === TOLOV.wait);
    case 'ok': return rows.filter((r) => r.tolov === TOLOV.ok);
    case 'no': return rows.filter((r) => r.tolov === TOLOV.no);
    case 'unknown': return rows.filter((r) => r.tolov === 'unknown');
  }
}

/**
 * Бүх зөвшөөрлийг татна. Үйлчилгээ холбогдоогүй эсвэл унасан бол `null` —
 * ХООСОН МАССИВ БИШ. Хоосон массив нь «зөвшөөрөл байхгүй» гэсэн ХАРИУЛТ
 * болж уншигддаг тул «мэдэхгүй»-гээс заавал ялгана.
 */
export async function loadZov(): Promise<Zov[] | null> {
  return (await loadZovResult()).rows;
}

/**
 * `loadZov` + УНАЛТЫН ШАЛТГААН.
 */
export async function loadZovResult(): Promise<{ rows: Zov[] | null; error: Error | null }> {
  if (!URL) return { rows: null, error: null };
  try {
    const out: Zov[] = [];
    const [sf, oidName] = await Promise.all([sinceFields(), oidField()]);
    for (let offset = 0; ; ) {
      const j = await agsFetch(`${URL}/query`, {
        where: '1=1',
        outFields: '*',
        returnGeometry: 'false',
        orderByFields: `${F.bagts} ASC, ${F.shat} ASC, ${oidName} ASC`,
        resultRecordCount: '2000',
        resultOffset: String(offset),
      });
      const fs = (j.features ?? []) as { attributes: Record<string, unknown> }[];
      for (const f of fs) {
        const a = f.attributes;
        const t = str(a[F.tolov]);
        const k = oidKey(a, oidName);
        const oidRaw = k ? Number(a[k]) : NaN;
        if (!Number.isFinite(oidRaw) || oidRaw <= 0) {
          console.warn(
            `[zovshoorol] OBJECTID уншигдсангүй (түлхүүрүүд: ${Object.keys(a).join(',')}) — ` +
              'энэ мөрийг засвал ШИНЭ мөр нэмэгдэж, устгах ажиллахгүй.',
          );
        }
        out.push({
          oid: Number.isFinite(oidRaw) && oidRaw > 0 ? oidRaw : 0,
          bagts: str(a[F.bagts]),
          shat: Number(a[F.shat]) || 0,
          ner: str(a[F.ner]),
          selbe: str(a[F.selbe]),
          tolov: isTolov(t) ? t : 'unknown',
          ognoo: dateMs(a[F.ognoo]),
          dugaar: str(a[F.dugaar]),
          baiguullaga: str(a[F.baiguullaga]),
          hariutsagch: str(a[F.hariutsagch]),
          tailbar: str(a[F.tailbar]),
          since: sinceOf(a, sf),
        });
      }
      if (!j.exceededTransferLimit || fs.length === 0) break;
      offset += fs.length;
    }
    return { rows: out, error: null };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error('[zovshoorol] жагсаалт татахад алдаа:', error);
    return { rows: null, error };
  }
}

/**
 * НЭГ мөрийг OBJECTID-аар нь татна — `saveZov`-ийн ялгаа гаргах СУУРЬ.
 */
export async function loadOneZov(oid: number): Promise<Zov | null> {
  if (!URL || !Number.isFinite(oid) || oid <= 0) return null;
  const [oidName, sf] = await Promise.all([oidField(), sinceFields()]);
  const j = await agsFetch(`${URL}/query`, {
    where: `${oidName} = ${Math.trunc(oid)}`,
    outFields: '*',
    returnGeometry: 'false',
  });
  const fs = (j.features ?? []) as { attributes: Record<string, unknown> }[];
  if (!fs.length) return null;
  const a = fs[0].attributes;
  const k = oidKey(a, oidName);
  const oidRaw = k ? Number(a[k]) : NaN;
  const t = str(a[F.tolov]);
  return {
    oid: Number.isFinite(oidRaw) && oidRaw > 0 ? oidRaw : 0,
    bagts: str(a[F.bagts]),
    shat: Number(a[F.shat]) || 0,
    ner: str(a[F.ner]),
    selbe: str(a[F.selbe]),
    tolov: isTolov(t) ? t : 'unknown',
    ognoo: dateMs(a[F.ognoo]),
    dugaar: str(a[F.dugaar]),
    baiguullaga: str(a[F.baiguullaga]),
    hariutsagch: str(a[F.hariutsagch]),
    tailbar: str(a[F.tailbar]),
    since: sinceOf(a, sf),
  };
}

/** Багцаар бүлэглэж, шатаар эрэмбэлнэ. */
export function byBagts(rows: Zov[]): Map<string, Zov[]> {
  const m = new Map<string, Zov[]>();
  for (const r of rows) {
    if (!m.has(r.bagts)) m.set(r.bagts, []);
    m.get(r.bagts)!.push(r);
  }
  for (const list of m.values()) list.sort((a, b) => a.shat - b.shat);
  return m;
}

/**
 * Багцын НЭГДСЭН дүгнэлт — картын толгойд.
 */
export function summarize(list: Zov[], now?: number): {
  ok: number; wait: number; no: number; unknown: number; total: number; alert: boolean;
  /**
   * `PENDING_STALE_DAYS`-аас удаж буй хүлээгдэж буй (2026-10-01). `wait`-ийн ДЭД
   * олонлог — нийлбэрт давхар тоологдохгүй. `now` өгөөгүй бол 0 (тооцоогүй).
   */
  stale: number;
} {
  const ok = list.filter((r) => r.tolov === TOLOV.ok).length;
  const no = list.filter((r) => r.tolov === TOLOV.no).length;
  const wait = list.filter((r) => r.tolov === TOLOV.wait).length;
  const unknown = list.filter((r) => r.tolov === 'unknown').length;
  const stale = now == null ? 0 : list.filter((r) => isStalePending(r, now)).length;
  return { ok, wait, no, unknown, total: list.length, alert: no > 0 || unknown > 0, stale };
}

/* ═══════════════════════ ЗАСВАР ═══════════════════════ */

/** Огноог ArcGIS `DateOnly`-д бичих хэлбэр рүү. Хоосон бол `null`. */
const toDateOnly = (ms: number | null): string | null => {
  if (ms == null) return null;
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

/** Маягтаас ирэх утга — `oid` байвал ЗАСВАР, эс бөгөөс НЭМЭЛТ. */
export type ZovDraft = Omit<Zov, 'oid' | 'tolov'> & {
  oid?: number;
  tolov: Exclude<Tolov, 'unknown'> | null;
};

/**
 * НООРОГИЙГ `applyEdits`-ийн бүтэн `attributes` болгоно (ШИНЭ мөрд).
 */
const zovAttrs = (d: ZovDraft): Record<string, unknown> => ({
  [F.bagts]: d.bagts,
  [F.shat]: d.shat,
  [F.ner]: d.ner,
  [F.selbe]: d.selbe || null,
  [F.tolov]: d.tolov,
  [F.ognoo]: toDateOnly(d.ognoo),
  [F.dugaar]: d.dugaar || null,
  [F.baiguullaga]: d.baiguullaga || null,
  [F.hariutsagch]: d.hariutsagch || null,
  [F.tailbar]: d.tailbar || null,
});

/**
 * ЗӨВХӨН ӨӨРЧЛӨГДСӨН ТАЛБАРЫГ ялгана (`parcelEdit.diffParcel`-ийн загвар).
 *
 * @returns өөрчлөгдсөн талбарууд; ХООСОН объект = ялгаа алга
 */
export function diffZov(before: Zov, d: ZovDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const next = zovAttrs(d);
  const prev = zovAttrs({ ...before, tolov: before.tolov === 'unknown' ? d.tolov : before.tolov });
  if (before.tolov === 'unknown') prev[F.tolov] = null;
  const norm = (v: unknown): unknown => (v == null || v === '' ? null : v);
  for (const k of Object.keys(next)) {
    if (norm(prev[k]) !== norm(next[k])) out[k] = next[k];
  }
  if (d.tolov == null) delete out[F.tolov];
  return out;
}

/**
 * Багц+шатын байрыг эзэлсэн мөрүүд (OID өсөхөөр) — давхардлын шалгалтад.
 */
async function slotRows(
  oidName: string, bagts: string, shat: number, exceptOid?: number,
): Promise<{ oid: number; ner: string }[]> {
  const q = (s: string) => `N'${s.replace(/'/g, "''")}'`;
  let where = `${F.bagts} = ${q(bagts.trim())} AND ${F.shat} = ${Math.trunc(shat)}`;
  if (exceptOid) where += ` AND ${oidName} <> ${Math.trunc(exceptOid)}`;
  const j = await agsFetch(`${URL}/query`, {
    where,
    outFields: `${oidName},${F.ner}`,
    orderByFields: `${oidName} ASC`,
    returnGeometry: 'false',
    resultRecordCount: '50',
  });
  return ((j.features ?? []) as { attributes?: Record<string, unknown> }[])
    .map((f) => ({ oid: Number(f.attributes?.[oidName]), ner: str(f.attributes?.[F.ner]) }));
}

export class ZovClashError extends Error {
  constructor(message: string, readonly kept: boolean, readonly oid?: number) {
    super(message);
    this.name = 'ZovClashError';
  }
}

/**
 * Шинэ мөр бичигдсэний ДАРАА багц+шатыг дахин тоолно. Ганцаараа бол юу ч хийхгүй.
 * Давхардсан бол OID нь ХАМГИЙН БАГА мөр үлдэнэ: манайх их бол өөрийгөө УСТГАНА (нэг удаа,
 * давталтгүй) — `ZovClashError(kept=false)`; манайх бага бол `ZovClashError(kept=true)`.
 * Шалгах асуулга унавал чимээгүй буцна — бичилт өөрөө амжилттай.
 */
async function resolveAddClash(d: ZovDraft, ours: number): Promise<void> {
  let rows: { oid: number; ner: string }[];
  try {
    rows = await slotRows(await oidField(), d.bagts, d.shat);
  } catch {
    return;
  }
  if (rows.length <= 1) return;
  const other = rows.find((r) => r.oid !== ours);
  const otherNer = other?.ner ?? '';
  /* OID уншигдаагүй мөр байвал хэн нь эхэлснийг тогтоохгүй — устгахгүй, зөвхөн мэдээлнэ */
  const known = rows.every((r) => Number.isFinite(r.oid));
  const lowest = known ? Math.min(...rows.map((r) => r.oid)) : ours;
  if (ours !== lowest) {
    try {
      await deleteZov(ours);
    } catch (e) {
      throw new ZovClashError(tr('{0}-д {1}-р дараалал «{2}»-тэй давхардсан. Таны нэмсэн мөрийг буцааж устгаж чадсангүй ({3}) — жагсаалтаас гараар устгана уу.',
        d.bagts, String(d.shat), otherNer, e instanceof Error ? e.message : String(e)), true, ours);
    }
    throw new ZovClashError(tr('{0}-д {1}-р дараалал «{2}»-д зэрэг эзлэгдсэн — таны нэмсэн мөрийг буцааж устгалаа. Өөр дараалал сонгоно уу.',
      d.bagts, String(d.shat), otherNer), false);
  }
  throw new ZovClashError(tr('{0}-д {1}-р дараалалд өөр хэрэглэгч «{2}»-г зэрэг нэмсэн. Таны мөр хадгалагдсан (эхэлж бичигдсэн); нөгөө мөрийг шалгана уу.',
    d.bagts, String(d.shat), otherNer), true, ours);
}

async function verifyLostAdd(d: ZovDraft, x: unknown): Promise<number> {
  const oidName = await oidField();
  const look = async () => {
    try { return await slotRows(oidName, d.bagts, d.shat); } catch { return null; }
  };
  const ner = d.ner.trim();
  let rows = await look();
  if (rows && !rows.some((r) => r.ner === ner)) {
    await new Promise((r) => setTimeout(r, 3000));
    rows = await look();
  }
  if (rows == null) throw x;
  const own = rows.filter((r) => r.ner === ner);
  if (own.length === 0) {
    if (rows.length) {
      throw new Error(tr('{0}-д {1}-р дараалал «{2}»-д аль хэдийн эзлэгдсэн.', d.bagts, String(d.shat), rows[0].ner));
    }
    throw new Error(tr('Серверийн хариу алдагдсан ч шалгахад зөвшөөрөл бичигдээгүй байна — дахин «Хадгалах» дарж болно.'));
  }
  const ids = own.map((r) => r.oid).filter((n) => Number.isFinite(n));
  const ours = ids.length ? Math.min(...ids) : 0;
  if (rows.length > 1) {
    const others = rows.filter((r) => r.oid !== ours).map((r) => `«${r.ner}»`).join(', ');
    throw new ZovClashError(tr('Серверийн хариу алдагдсан: {0}-д {1}-р дараалалд таны мөр бичигдсэн боловч давхардал илэрлээ ({2}). Юуг ч устгаагүй — жагсаалтаас шалгаж илүүдлийг гараар устгана уу.',
      d.bagts, String(d.shat), others), true, ours || undefined);
  }
  return ours;
}

/**
 * Нэмэх эсвэл засах.
 */
export async function saveZov(d: ZovDraft, before?: Zov | null): Promise<number> {
  requireCap('zovshoorol');
  if (!URL) throw new Error(tr('Зөвшөөрлийн үйлчилгээ холбогдоогүй байна.'));
  const invalid = Object.values(validateZov(d, [])).find(Boolean);
  if (invalid) throw new Error(invalid);
  const attributes = zovAttrs(d);
  const edit: Record<string, string> = { rollbackOnFailure: 'true' };
  if (d.oid) {
    const oidName = await oidField();
    const base = before ?? (await loadOneZov(d.oid));
    if (!base) throw new Error(tr('Эх мөрийг уншиж чадсангүй — засварыг хадгалсангүй.'));
    const delta = diffZov(base, d);
    if (Object.keys(delta).length === 0) return d.oid;
    if (F.bagts in delta || F.shat in delta) {
      const dup = (await slotRows(oidName, d.bagts, d.shat, d.oid))[0];
      if (dup) throw new Error(tr('{0}-д {1}-р дараалал «{2}»-д аль хэдийн эзлэгдсэн.', d.bagts, String(d.shat), dup.ner));
    }
    edit.updates = JSON.stringify([{ attributes: { [oidName]: d.oid, ...delta } }]);
  } else {
    const dup = (await slotRows(await oidField(), d.bagts, d.shat))[0];
    if (dup) {
      throw new Error(tr('{0}-д {1}-р дараалал «{2}»-д аль хэдийн эзлэгдсэн.', d.bagts, String(d.shat), dup.ner));
    }
    edit.adds = JSON.stringify([{ attributes }]);
  }

  let j: Awaited<ReturnType<typeof agsFetch>>;
  try {
    j = await agsFetch(`${URL}/applyEdits`, edit);
  } catch (x) {
    if (!d.oid) invalidate('ZOVSHOOROL');
    if (!d.oid && isLostWrite(x)) return verifyLostAdd(d, x);
    throw x;
  }
  const res = [...(j.addResults ?? []), ...(j.updateResults ?? [])] as {
    success?: boolean; objectId?: number; error?: { description?: string };
  }[];
  if (res.length !== 1) throw new Error(tr('Үйлчилгээ хариу буцаасангүй.'));
  const bad = res.find((r) => r.success !== true);
  if (bad) throw new Error(bad.error?.description || tr('Хадгалах амжилтгүй боллоо.'));
  if (!d.oid && res[0].objectId != null) {
    invalidate('ZOVSHOOROL');
    await resolveAddClash(d, Math.trunc(res[0].objectId));
  }
  invalidate('ZOVSHOOROL');
  return res[0].objectId ?? d.oid ?? 0;
}

/** Устгах. Буцаах боломжгүй тул дуудагч тал ЗААВАЛ баталгаажуулсан байна. */
export async function deleteZov(oid: number): Promise<void> {
  requireCap('zovshoorol');
  if (!URL) throw new Error(tr('Зөвшөөрлийн үйлчилгээ холбогдоогүй байна.'));
  if (!Number.isFinite(oid) || oid <= 0) {
    throw new Error(tr('Мөрийн дугаар уншигдаагүй тул устгах боломжгүй — хуудсыг дахин ачаалаад оролдоно уу.'));
  }
  const j = await agsFetch(`${URL}/applyEdits`, {
    deletes: JSON.stringify([oid]),
    rollbackOnFailure: 'true',
  });
  const res = (j.deleteResults ?? []) as { success?: boolean; error?: { description?: string } }[];
  if (res.length !== 1) throw new Error(tr('Үйлчилгээ хариу буцаасангүй.'));
  const bad = res.find((r) => r.success !== true);
  if (bad) throw new Error(bad.error?.description || tr('Устгах амжилтгүй боллоо.'));
  invalidate('ZOVSHOOROL');
}

/**
 * МАЯГТЫН ШАЛГУУР — хадгалахаас ӨМНӨ.
 */
export function validateZov(
  d: ZovDraft,
  all: Zov[],
): Partial<Record<keyof ZovDraft, string>> {
  const e: Partial<Record<keyof ZovDraft, string>> = {};
  if (!d.bagts.trim()) e.bagts = tr('Багц сонгоно уу.');
  if (!d.ner.trim()) e.ner = tr('Зөвшөөрлийн нэрийг оруулна уу.');
  if (!Number.isInteger(d.shat) || d.shat < 1) {
    e.shat = tr('Дараалал нь 1-ээс эхлэх бүхэл тоо байна.');
  } else {
    const dup = all.find(
      (r) => r.oid !== d.oid && r.bagts === d.bagts.trim() && r.shat === d.shat,
    );
    if (dup) e.shat = tr('{0}-д {1}-р дараалал «{2}»-д аль хэдийн эзлэгдсэн.', d.bagts, String(d.shat), dup.ner);
  }
  if (d.tolov == null) e.tolov = tr('Төлөвийг сонгоно уу — одоогийн утга танигдаагүй.');
  if (d.tolov != null && d.tolov !== TOLOV.wait && d.ognoo == null) {
    e.ognoo = tr('«{0}» төлөвт шийдвэрлэсэн огноо заавал шаардлагатай.', tr(d.tolov));
  }
  if (d.tolov === TOLOV.wait && d.ognoo != null) {
    e.ognoo = tr('«Хүлээгдэж буй» төлөвт огноо байх ёсгүй.');
  }
  if (d.ognoo != null && !e.ognoo) {
    const y = new Date(d.ognoo).getUTCFullYear();
    if (!Number.isFinite(y) || y < 2000 || y > 2100) e.ognoo = tr('Огнооны он буруу байна (2000–2100).');
  }
  return e;
}
