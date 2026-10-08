/**
 * БАГЦЫН ЗӨВШӨӨРЛҮҮД — шат дараалсан хяналт.
 *
 * ⚠️ ҮЙЛЧИЛГЭЭ ХАРААХАН ХОЛБОГДООГҮЙ. `URL` хоосон байхад бүх дуудлага
 * `null` буцааж, дэлгэц нь «холбогдоогүй» гэж ИЛ хэлнэ — хоосон жагсаалт
 * харуулж «зөвшөөрөл алга» гэж ойлгуулахгүй. Үйлчилгээ бэлэн болмогц
 * ЗӨВХӨН доорх `URL`-ыг бөглөнө, өөр юу ч засах шаардлагагүй.
 */

import { agsFetch } from '@/modules/sheet/ags';
import { HJ } from '@/lib/services';
import { t as tr } from '@/lib/i18nCore';
import { invalidate } from '@/lib/dataBus';
import { requireCap } from '@/lib/who';
import { isLostWrite } from '@/lib/lostWrite';

/**
 * ⚠️ Давхаргын дугаар нь 0 БИШ — 171. Нэг үйлчилгээнд олон хүснэгт
 * нийтлэгдэхэд ArcGIS дугаарыг үргэлжлүүлэн өгдөг тул «/0» гэж таамаглаж
 * бичвэл огт өөр хүснэгт уншина.
 */
export const URL =
  `${HJ}/bagts_ajliin_zovshoorliin_burtgel/FeatureServer/171`;

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
  /**
   * ⚠️ 2026-09-04: Энэ нь `'ObjectID'` гэж бичигдсэн байсан ч амьд хүснэгтийн
   * талбар нь `OBJECTID` (БҮГД ТОМ үсгээр) — `a['ObjectID']` нь `undefined`
   * буцааж, 5/5 мөр `oid = 0` болж ачаалагдаж байв. Үүнээс гарсан 3 БОДИТ
   * алдаа:
   *   · `saveZov` (доор) — `if (d.oid)` худал тул ЗАСВАР БҮР `adds` болж
   *     ШИНЭ мөр нэмнэ: жагсаалт давхардаж, хуучин мөр хэвээр үлдэнэ;
   *   · `ZovshoorolEdit.tsx` — `if (!d.oid) return;` тул «Устгах» товч
   *     ЧИМЭЭГҮЙ юу ч хийхгүй (алдаа ч гарахгүй);
   *   · `validateZov` ба маягтын `nextShat` — `r.oid !== d.oid` нь `0 !== 0`
   *     = `false` тул давхардлын сануулга ОГТ гарахгүй.
   *
   * ⚠️ Энэ нь ЗӨВХӨН нөөц утга. Ажиллах үед `oidField()` нь үйлчилгээний
   * метадатагийн `objectIdField`-ыг уншиж, уншилтад `oidKey()` нь мөрийн
   * түлхүүрээс `/^objectid$/i`-ээр олно (`bagts.pkg.ts:299` яг ийм аргаар
   * энэ ангиллын алдаанаас сэргийлдэг). Хатуу мөр үлдээвэл дараагийн
   * үйлчилгээ өөр үсгийн бичлэгтэй байхад дахин давтагдана.
   */
  oid: 'OBJECTID',
} as const;

/**
 * ТӨЛӨВҮҮД. ⚠️ Гурав, өөр байхгүй — үйлчилгээнд танихгүй утга орвол
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
   *
   * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): `ognoo` нь ШИЙДВЭРЛЭСЭН огноо тул
   *    «Хүлээгдэж буй» мөрд ЗААВАЛ хоосон (`validateZov`) — хүлээлтийн насыг
   *    түүгээр тоолж болохгүй. ArcGIS Editor Tracking-ийн `CreationDate`
   *    (давхаргын `editFieldsInfo`-оос нэрийг нь уншина) байхгүй бол
   *    `EditDate`, тэр ч алга бол `null` — нас нь МЭДЭГДЭХГҮЙ (0 хоног БИШ),
   *    тэмдэглэгээ гарахгүй. Амьдаар (2026-10-01) хүснэгтэд асаалттай.
   * ⚠️ СОНГОЛТОТ (`?`): маягтын ноорог (`ZovDraft`) ба бусад дуудагчийн
   *    литералууд эвдрэхгүй; бичих замд (`zovAttrs`) ОГТ орохгүй — серверийн
   *    талбар.
   */
  since?: number | null;
};

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * ОГНОО — ХОЁР хэлбэрийг хүлээж авна.
 *
 * ⚠️ Талбар нь `DateOnly` төрөлтэй тул ArcGIS нь `"2026-05-06"` гэсэн
 * ТЕКСТ буцаадаг; энгийн `Date` талбар бол ms тоо буцаана. Зөвхөн тоо гэж
 * үзвэл бүх огноо `NaN` болж, хуудас чимээгүй огноогүй харагдана.
 *
 * ⚠️ Текстийг UTC-гээр уншина — орон нутгийн бүсээр уншвал огноо нэг
 * хоногоор ухарч болзошгүй.
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
 *
 * ⚠️ 2026-09-04: ArcGIS үйлчилгээ бүр өөр бичлэг ашиглана — `OBJECTID`,
 * `ObjectID`, `objectid`, `FID`, `OBJECTID_1`. Хатуу бичсэн нэр нь тухайн
 * үйлчилгээнд таарахгүй бол алдаа ШИДДЭГГҮЙ, зүгээр `undefined` буцаана.
 * Тиймээс уншилтын зам нь ямар ч сүлжээний нэмэлт дуудлагагүйгээр мөрөөс
 * шууд олох ёстой.
 */
export const oidKey = (a: Record<string, unknown>, name?: string | null): string | null => {
  const keys = Object.keys(a);
  /* ⚠️ 2026-10-09: метадатагийн `objectIdField` (`oidField()`) ЭХЭНД — урьд нь зөвхөн
     `/^objectid$/i` тул `FID`/`OBJECTID_1` OID-той үйлчилгээнд мөр бүр `oid = 0` болж,
     дээрх 2026-09-04-ний алдаа давтагдах байв (`F.oid`-ийн ⚠️). Нэр өгөөгүй/таараагүй бол
     хуучин дүрэм нөөц. */
  if (name) {
    const n = name.toLowerCase();
    const hit = keys.find((k) => k.toLowerCase() === n);
    if (hit) return hit;
  }
  return keys.find((k) => /^objectid$/i.test(k)) ?? null;
};

/**
 * ДАВХАРГЫН МЕТАДАТА — НЭГ удаа татна (OID нэр ба Editor Tracking хоёул эндээс).
 * ⚠️ 2026-10-01: урьд нь зөвхөн `oidField` метадата татдаг байв; одоо
 *    `sinceFields` ч хэрэглэх тул ХОЁР хүсэлт болохоос сэргийлж хуваалцана.
 *    Алдаа гарвал кэш цэвэрлэгдэж, дараагийн дуудлага дахин оролдоно.
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
 *
 * ⚠️ Алдаа гарвал кэшийг цэвэрлэж, нөөц `F.oid`-оор үргэлжилнэ — метадата
 * татагдаагүйн улмаас засвар бүхэлдээ унах ёсгүй. Дараагийн дуудлага дахин
 * оролдоно.
 */
let oidFieldP: Promise<string> | null = null;
export function oidField(): Promise<string> {
  if (!oidFieldP) {
    oidFieldP = zovMeta()
      .then((j) => {
        const meta = typeof j.objectIdField === 'string' ? j.objectIdField.trim() : '';
        if (meta) return meta;
        /* ⚠️ Зарим үйлчилгээ `objectIdField`-ыг буцаадаггүй — тухайн үед
           талбарын ТӨРӨЛ (`esriFieldTypeOID`) нь нэрнээс найдвартай. */
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

/**
 * ⚠️ 2026-10-09: маягтын `maxLength` (200/100/150/2000) ХАТУУ бичигдсэн байв — үйлчилгээний
 *    жинхэнэ урт өөр бол урт текст зөвхөн ХАДГАЛАХ үед ArcGIS-ийн бүрхэг алдаагаар унана
 *    (эсвэл боломжит уртыг дэмий хасна). `parcelEdit.fieldLensOf`-ийн загвар: метадатагийн
 *    `fields[].length` үнэн эх; уншигдаагүй талбарт дуудагч өөрийн нөөц утгыг хэрэглэнэ.
 */
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

/** ⚠️ Хэзээ ч унахгүй — метадата татагдаагүй бол `{}` (маягт нөөц уртаа хэрэглэнэ) */
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
 * ⚠️ Нэрийг ХАТУУ бичихгүй (`parcelEdit.editFieldsOf`-ийн ижил шалтгаан).
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

/** ⚠️ Хэзээ ч унахгүй — метадата татагдаагүй бол `null` (нас мэдэгдэхгүй) */
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
 *
 * ⚠️ 2026-10-06 (аудит): урьд нь `catch { return null; }` шалтгааныг бүрмөсөн
 *    хаядаг байсан тул «Зөвшөөрөл» харагдац 499 (эрх) · сүлжээ · талбар
 *    байхгүй гурвыг ялгах аргагүй, консолд ч юу ч үлддэггүй байв. Одоо
 *    консолд бичиж, `error`-оор дуудагчид өгнө.
 * ⚠️ `loadZov`-ийн `null` гэрээг ӨӨРЧЛӨХГҮЙ — `ceo/permits` · `scorecardLoad` ·
 *    `execReport` · `schemData` бүгд «унавал null, шиддэггүй» гэдэгт
 *    тулгуурладаг. Шалтгаан хэрэгтэй дуудагч (`Zovshoorol.tsx`) ЭНИЙГ дуудна.
 * ⚠️ `URL` хоосон (холбогдоогүй) үед `error: null` — тэр нь алдаа биш, тохиргоо.
 */
export async function loadZovResult(): Promise<{ rows: Zov[] | null; error: Error | null }> {
  if (!URL) return { rows: null, error: null };
  try {
    const out: Zov[] = [];
    /* ⚠️ 2026-10-01: хүлээлтийн насны талбарууд (`since`) — метадата унасан ч
       жагсаалт ачаалагдана, зөвхөн «удаж буй» тэмдэглэгээ гарахгүй. */
    /* ⚠️ 2026-10-09: OID-ын нэр уншилтад ч метадатагаас (`oidField` — хэзээ ч шидэхгүй,
       унавал `F.oid`) — урьд нь `orderByFields` хатуу `OBJECTID` байв. */
    const [sf, oidName] = await Promise.all([sinceFields(), oidField()]);
    for (let offset = 0; ; ) {
      const j = await agsFetch(`${URL}/query`, {
        where: '1=1',
        outFields: '*',
        returnGeometry: 'false',
        /* ⚠️ OID нь tie-breaker (2026-09-17): (bagts, shat) давтагдаж болох тул
           2000-аас дээш үед хуудасны заагт мөр давхардах/алдагдах байв. */
        orderByFields: `${F.bagts} ASC, ${F.shat} ASC, ${oidName} ASC`,
        resultRecordCount: '2000',
        resultOffset: String(offset),
      });
      const fs = (j.features ?? []) as { attributes: Record<string, unknown> }[];
      for (const f of fs) {
        const a = f.attributes;
        const t = str(a[F.tolov]);
        /**
         * ⚠️ 2026-09-04: `a[F.oid]` гэж ХАТУУ түлхүүрээр уншиж байгаад
         * `'ObjectID'` ≠ `OBJECTID` тул 5/5 мөр `oid = 0` болсон. Одоо
         * мөрийн өөрийнх нь түлхүүрээс үсгийн мэдрэмжгүй олно.
         *
         * ⚠️ `oid` олдоогүй бол ЧИМЭЭГҮЙ 0 болгохгүй — консолд ил гаргана.
         * `oid = 0` нь «шинэ мөр» гэсэн утгатай тул засвар нь давхардал
         * үүсгэдэг: энэ бол өгөгдлийн алдаа, нуух ёсгүй.
         */
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
 *
 * ⚠️ 2026-09-11: зэрэгцээ засварыг дарахгүйн тулд ялгааг ХАМГИЙН СҮҮЛИЙН
 * серверийн утгатай жишнэ. Маягтын ноорог нь нээгдэх үеийн хуулбар тул
 * түүнийг өөртэй нь жишвэл өөр хүний завсарт хийсэн засвар харагдахгүй.
 *
 * ⚠️ Олдоогүй бол `null` — ХООСОН мөр БУЦААХГҮЙ. Дуудагч тал үүнийг алдаа
 * гэж үзэж, бүтэн мөр дарж бичихийн оронд зогсоно.
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
 * ⚠️ «Зөвшөөрөөгүй» нь ганц ч байвал тэр нь ЗОНХИЛНО: цөөнх нь эрсдэл юм.
 */
export function summarize(list: Zov[], now?: number): {
  ok: number; wait: number; no: number; unknown: number; total: number; alert: boolean;
  /**
   * `PENDING_STALE_DAYS`-аас удаж буй хүлээгдэж буй (2026-10-01). `wait`-ийн ДЭД
   * олонлог — нийлбэрт давхар тоологдохгүй. `now` өгөөгүй бол 0 (тооцоогүй).
   * ⚠️ `alert`-д ОРОХГҮЙ: хүлээлт нь хэвийн явц (файлын толгойн анивчих дүрэм).
   */
  stale: number;
} {
  const ok = list.filter((r) => r.tolov === TOLOV.ok).length;
  const no = list.filter((r) => r.tolov === TOLOV.no).length;
  const wait = list.filter((r) => r.tolov === TOLOV.wait).length;
  /**
   * ⚠️ ТАНИГДААГҮЙ төлөв ч ТООЛОГДОНО. Урьд нь гурван тоолуурын аль нь ч
   * түүнийг авдаггүй байсан тул үйлчилгээнд буруу утга орвол товч нь «?»
   * болж харагдах ч толгойн тоо нь юу ч хэлэхгүй, нийлбэр нь мөрийн тоотой
   * ЗӨРНӨ. Ийм мөр нь засвар шаарддаг тул `alert`-д ч оруулна.
   */
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
  /* ⚠️ 2026-10-06: `null` = төлөв СОНГОГДООГҮЙ — серверийн утга танигдаагүй мөрийг
     засахаар нээхэд. Урьд нь «Хүлээгдэж буй» болгож нээдэг тул буруу бичсэн
     «зөвшөөрсөн» мөр хадгалахад чимээгүй «хүлээгдэж буй» болдог байв.
     `validateZov` нь сонголтыг ЗААВАЛ шаардана, `diffZov` нь `null`-ыг бичихгүй. */
  tolov: Exclude<Tolov, 'unknown'> | null;
};

/**
 * НООРОГИЙГ `applyEdits`-ийн бүтэн `attributes` болгоно (ШИНЭ мөрд).
 *
 * ⚠️ Хоосон мөр → `null`, `''` БИШ. ArcGIS-ийн текст талбарт хоосон мөр
 * бичвэл «утга байхгүй» биш «хоосон утга» болж, `IS NULL` шүүлтэд орохгүй
 * (`parcelEdit.diffParcel`-ийн ЯГ ижил дүрэм).
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
 * ⚠️ 2026-09-11: урьд нь `saveZov` нь БҮТЭН мөрийг (10 талбар) `updates`-д
 * илгээдэг байв. ArcGIS-д мөрийн түвшний ТҮГЖЭЭ БАЙХГҮЙ тул хоёр хүн нэг
 * зөвшөөрлийг зэрэг засахад сүүлд хадгалсан нь нөгөөгийн `tailbar`,
 * `hariutsagch`-ийг өөрийн ХУУЧИН хуулбараар дарж бичнэ — алдаа ч гарахгүй,
 * хэрэглэгч ч мэдэхгүй. Маягт нээгдэх үеийн агшнаас хойш өөр хүний бичсэн
 * багана ҮЛДЭХ ёстой.
 *
 * ⚠️ Хоосон/`null`-ийн дүрэм `diffParcel`-тэй ИЖИЛ: харьцуулалт нь
 * ХЭВИЙНШҮҮЛСЭН мөрөн дээр явна (`null` ба `''` нь ИЖИЛ гэж тооцогдоно, тул
 * хоосон хэвээр байгаа талбар дэмий илгээгдэхгүй), бичих утга нь хоосон
 * бол `null` болно. Эс бөгөөс `loadZov`-ийн `str()` нь `null`-ыг `''`
 * болгодог учир өөрчлөгдөөгүй хоосон талбар бүр ялгаа мэт харагдана.
 *
 * ⚠️ Огноог ms-ээр нь жишнэ, ТЕКСТЭЭР биш — `toDateOnly` нь `null`-ыг
 * `null` болгодог тул хоёуланг нь хөрвүүлж жиших нь адил үр дүн өгнө.
 *
 * @returns өөрчлөгдсөн талбарууд; ХООСОН объект = ялгаа алга
 */
export function diffZov(before: Zov, d: ZovDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const next = zovAttrs(d);
  const prev = zovAttrs({ ...before, tolov: before.tolov === 'unknown' ? d.tolov : before.tolov });
  /* ⚠️ ТАНИГДААГҮЙ ТӨЛӨВ ЗААВАЛ БИЧИГДЭНЭ (2026-09-25 аудит): урьд нь `prev`-ийн
     төлөвийг `d.tolov`-оор орлуулдаг тул ялгаа хэзээ ч гардаггүй — «зөвшөөрсөн»
     (буруу бичлэг) мөрийг маягтаас засаж чадахгүй, чип «танигдаагүй» хэвээр
     үлддэг байв. Серверийн утга танигдаагүй = маягтын сонголтоос ялгаатай. */
  if (before.tolov === 'unknown') prev[F.tolov] = null;
  /* ⚠️ `null` ба `''`-ийг ИЖИЛ гэж үзнэ (`diffParcel`-ийн дүрэм). */
  const norm = (v: unknown): unknown => (v == null || v === '' ? null : v);
  for (const k of Object.keys(next)) {
    if (norm(prev[k]) !== norm(next[k])) out[k] = next[k];
  }
  /* ⚠️ 2026-10-06: хэрэглэгч төлөв СОНГООГҮЙ (`null`) бол төлөвийг ОГТ бичихгүй —
     танигдаагүй серверийн утгыг таамгаар дарахгүй (`validateZov` үүнийг аль хэдийн
     хаадаг; энэ нь хоёрдугаар хамгаалалт). */
  if (d.tolov == null) delete out[F.tolov];
  return out;
}

/**
 * Багц+шатын байрыг эзэлсэн мөрүүд (OID өсөхөөр) — давхардлын шалгалтад.
 * ⚠️ 2026-10-09: `exceptOid` — засварын үед өөрийгөө хасна (`<> oid`).
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
  /* ⚠️ OID уншигдаагүй мөрийг ХАСАХГҮЙ — давхардал нь давхардал (`oid` нь NaN байж болно) */
  return ((j.features ?? []) as { attributes?: Record<string, unknown> }[])
    .map((f) => ({ oid: Number(f.attributes?.[oidName]), ner: str(f.attributes?.[F.ner]) }));
}

/**
 * ⚠️ 2026-10-09: ЗЭРЭГЦЭЭ НЭМЭЛТИЙН ДАВХАРДАЛ (бичсэний дараа илэрсэн).
 * `kept` — манай мөр серверт ҮЛДСЭН эсэх (үлдсэн бол маягтыг дахин «Хадгалах»-гүй хаах ёстой —
 * дахин дарахад урьдчилсан шалгалт өөрийн мөртэй нь давхацна).
 */
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

/**
 * ⚠️ 2026-10-09: ШИНЭ мөрийн хариу АЛДАГДСАН — багц+шатын мөрүүдийг уншиж бичигдсэн эсэхийг
 * тогтооно (бичилтийг ДАХИН ИЛГЭЭХГҮЙ). Нэрээр нь манай мөрийг таньна. Олдоогүй бол сервер
 * хүсэлтээ удаан боловсруулж байж болох тул НЭГ удаа 3с хүлээж дахин уншина. Унших өөрөө
 * унавал анхны алдааг (`x`, «тодорхойгүй») дамжуулна.
 */
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
  /* ⚠️ 2026-10-09: ХАРИУ АЛДАГДСАН замд ЮУГ Ч УСТГАХГҮЙ. Урьд нь ижил нэртэй мөрүүдээс OID нь
     ХАМГИЙН ИХ-ийг «манайх» гэж үзээд `resolveAddClash`-аар устгадаг байв — гэвч ижил нэрийг
     өөр хэрэглэгч ч зэрэг нэмсэн байж болох тул тэр нь БУСДЫН мөр байх эрсдэлтэй (тодорхойгүй
     дээр бусдын мөрийг устгахгүй). Одоо ижил нэртэйн ХАМГИЙН БАГА OID-г «манайх» гэж үзэж,
     давхардал байвал зөвхөн МЭДЭЭЛНЭ (`kept=true` → маягт хаагдана), хэрэглэгч жагсаалтаас
     шалгаж илүүдлийг гараар устгана. */
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
 *
 * ⚠️ Амжилтгүй бол ЗААВАЛ шалтгаантай `Error` шиднэ — `false` буцаавал
 * дуудагч тал «болсон» гэж үзэж, хэрэглэгч засвараа алдсанаа мэдэхгүй.
 *
 * ⚠️ Серверийн талбаруудыг (`OBJECTID`, `GlobalID`) илгээхгүй — засварын
 * үед зөвхөн OBJECTID таних зорилгоор явна.
 * (2026-09-04: тайлбарт `ObjectID` гэж бичигдсэн байсныг амьд хүснэгтийн
 *  жинхэнэ бичлэг `OBJECTID` болгож залруулав.)
 *
 * ⚠️ 2026-09-11: ЗАСВАРЫН зам нь ЗӨВХӨН ӨӨРЧЛӨГДСӨН баганыг илгээнэ
 * (`diffZov`). `before` нь маягт нээгдэх үеийн ЭХ мөр — дуудагч өгөөгүй бол
 * `all`-аас эсвэл үйлчилгээнээс олж авна. Ялгаа огт байхгүй бол сүлжээний
 * дуудлага ОГТ ХИЙХГҮЙ (`diffParcel`/`saveParcel`-ийн ижил гэрээ).
 */
export async function saveZov(d: ZovDraft, before?: Zov | null): Promise<number> {
  requireCap('zovshoorol'); // ⚠️ lib-түвшний эрх (2026-09-17) — урьд нь зөвхөн UI
  if (!URL) throw new Error(tr('Зөвшөөрлийн үйлчилгээ холбогдоогүй байна.'));
  const attributes = zovAttrs(d);
  const edit: Record<string, string> = { rollbackOnFailure: 'true' };
  if (d.oid) {
    /* ⚠️ 2026-09-04: OBJECTID-ын нэрийг метадатагаас авна. Хатуу `'ObjectID'`
       байхад ArcGIS нь танихгүй талбарыг ЧИМЭЭГҮЙ хаяж, «аль мөрийг засах»
       нь тодорхойгүй болно. Кэштэй тул сүлжээний дуудлага нэг л удаа. */
    const oidName = await oidField();
    /* ⚠️ Эх мөрийг дуудагч өгөөгүй бол ҮЙЛЧИЛГЭЭНЭЭС дахин уншина. Энэ нь
       зэрэгцээ засварыг дарахаас сэргийлэх ЦОРЫН ГАНЦ найдвартай суурь:
       маягтын ноорог өөрөө хуучин хуулбар тул түүнийг өөртэй нь жишвэл
       ялгаа гарахгүй. Уншилт бүтэлгүй бол (сүлжээ) БҮТЭН мөр бичихгүй —
       алдаа шиднэ, эс бөгөөс чимээгүй дарж бичих эрсдэл эргэж ирнэ. */
    /* ⚠️ 2026-09-25 аудит: СУУРЬ НЬ МАЯГТ НЭЭГДЭХ ҮЕИЙН АГШИН (`before`) байх ёстой.
       Шинэ уншсан мөртэй жишвэл маягт нээгдсэний ДАРАА өөр хүний зассан талбар
       «ялгаа» болж маягтын хуучин утгаар дарагдана — `ZovshoorolEdit` одоо
       агшингаа ЗААВАЛ өгнө. Доорх унших нь зөвхөн агшингүй дуудагчийн нөөц зам. */
    const base = before ?? (await loadOneZov(d.oid));
    if (!base) throw new Error(tr('Эх мөрийг уншиж чадсангүй — засварыг хадгалсангүй.'));
    const delta = diffZov(base, d);
    /* ⚠️ Өөрчлөлтгүй бол сүлжээ ОГТ хөндөхгүй — «хадгаллаа» гэж хаагдана. */
    if (Object.keys(delta).length === 0) return d.oid;
    /* ⚠️ 2026-10-09: ЗАСВАРААР багц/шатыг өөрчлөхөд ч давхардлыг серверээс шалгана — урьд нь
       зөвхөн нэмэлтийн замд байсан тул засвараар өөр зөвшөөрлийн байранд «нүүж» болдог байв.
       Өөрийгөө (`<> oid`) хасна, эс бөгөөс багцаа солиогүй ч өөртэйгөө давхацна. */
    if (F.bagts in delta || F.shat in delta) {
      const dup = (await slotRows(oidName, d.bagts, d.shat, d.oid))[0];
      if (dup) throw new Error(tr('{0}-д {1}-р дараалал «{2}»-д аль хэдийн эзлэгдсэн.', d.bagts, String(d.shat), dup.ner));
    }
    edit.updates = JSON.stringify([{ attributes: { [oidName]: d.oid, ...delta } }]);
  } else {
    /* ⚠️ 2026-10-09: ДАВХАРДСАН ДАРААЛАЛ (зэрэгцээ нэмэлт). `validateZov` нь маягт нээгдэх
       үеийн `all` жагсаалтаар л шалгадаг тул хоёр хүн нэг багцад нэг `shat`-ыг зэрэг нэмэхэд
       хоёул өнгөрч, гинжинд хоёр зөвшөөрөл нэг байранд зурагддаг байв. Бичихийн ЯГ ӨМНӨ
       серверээс дахин асууна. Асуулга унавал шиднэ — бичилт явахаас өмнө тул аюулгүй. */
    const dup = (await slotRows(await oidField(), d.bagts, d.shat))[0];
    if (dup) {
      throw new Error(tr('{0}-д {1}-р дараалал «{2}»-д аль хэдийн эзлэгдсэн.', d.bagts, String(d.shat), dup.ner));
    }
    edit.adds = JSON.stringify([{ attributes }]);
  }

  /* ⚠️ 2026-10-06: ШИНЭ мөрийн хариу алдагдвал (timeout, сүлжээ) сервер БИЧСЭН байж
     магадгүй. Кэшийг хүчингүй болгоод алдааг ДАМЖУУЛНА — дуудагч (`ZovshoorolEdit.submit`,
     `isLostResponse`) дахин илгээхийг хааж, хэрэглэгчээр шалгуулна. Эс бөгөөс «Хадгалах»-ыг
     дахин дарахад ДАВХАРДСАН зөвшөөрөл үүснэ. Шидэгдсэн бүх алдаанд хүчингүй болгох нь
     хор хөнөөлгүй (дараагийн уншилт л шинэ) — `butetsEdit`-ийг энд импортлохгүй. */
  let j: Awaited<ReturnType<typeof agsFetch>>;
  try {
    j = await agsFetch(`${URL}/applyEdits`, edit);
  } catch (x) {
    if (!d.oid) invalidate('ZOVSHOOROL');
    /* ⚠️ 2026-10-09: ШИНЭ мөрийн хариу алдагдвал хэрэглэгчээр «дахин ачаалж шалга» гэлгүй
       ЯГ тэр шалгалтыг (багц+шатын мөрүүд) автоматаар хийнэ — бичилтийг ДАХИН ИЛГЭЭХГҮЙ,
       зөвхөн УНШИНА. Шалгалт өөрөө унавал анхны (алдагдсан) алдааг дамжуулна → «тодорхойгүй». */
    if (!d.oid && isLostWrite(x)) return verifyLostAdd(d, x);
    throw x;
  }
  const res = [...(j.addResults ?? []), ...(j.updateResults ?? [])] as {
    success?: boolean; objectId?: number; error?: { description?: string };
  }[];
  if (res.length === 0) throw new Error(tr('Үйлчилгээ хариу буцаасангүй.'));
  const bad = res.find((r) => r.success === false);
  if (bad) throw new Error(bad.error?.description || tr('Хадгалах амжилтгүй боллоо.'));
  /* ⚠️ 2026-10-09: ЗЭРЭГЦЭЭ НЭМЭЛТИЙН УРАЛДААН — урьдчилсан шалгалт ба бичилтийн хооронд өөр
     хүн ижил багц+шатад нэмж болно. Бичсэний ДАРАА дахин тоолно: >1 бол давхардал. OID нь
     ХАМГИЙН БАГА мөр үлдэнэ (хоёр талын клиент ижил дүрмээр шийдэх тул нэг нь л үлдэнэ). */
  if (!d.oid && res[0].objectId != null) {
    invalidate('ZOVSHOOROL');
    await resolveAddClash(d, Math.trunc(res[0].objectId));
  }
  /*
   * ⚠️ Урьд нь энэ дуудлага БАЙГААГҮЙ: зөвшөөрөл хадгалахад «Үйл
   * ажиллагааны схем» (`schemData` нь `loadZov`-ыг 5 минут кэшэлдэг)
   * ХУУЧИН тоо барьж, шинэ зөвшөөрөл ороогүй мэт харагдана.
   *
   * ⚠️ `rollbackOnFailure: 'true'` + нэг мөр тул амжилт нь бүхэлдээ —
   * `hyanalt.ts`-ийн олон мөрийн хагас бичилтээс ЯЛГААТАЙ, тиймээс
   * зөвхөн амжилтын замд хүчингүй болгоно.
   */
  invalidate('ZOVSHOOROL');
  return res[0].objectId ?? d.oid ?? 0;
}

/** Устгах. ⚠️ Буцаах боломжгүй тул дуудагч тал ЗААВАЛ баталгаажуулсан байна. */
export async function deleteZov(oid: number): Promise<void> {
  requireCap('zovshoorol');
  if (!URL) throw new Error(tr('Зөвшөөрлийн үйлчилгээ холбогдоогүй байна.'));
  /**
   * ⚠️ 2026-09-04: `oid = 0` нь «OBJECTID уншигдаагүй» гэсэн утгатай. Урьд нь
   * дуудагч тал (`ZovshoorolEdit.tsx`-ийн `remove`) `if (!d.oid) return;` гэж
   * ЧИМЭЭГҮЙ буцдаг байсан тул «Устгах» товч юу ч хийхгүй, хэрэглэгч
   * шалтгааныг мэдэхгүй үлддэг байв.
   * ⚠️ 2026-09-04 (2 дахь засвар): энэ шалгуур ГАНЦААРАА хэрэглэгчид хүрдэггүй
   * байсан — дуудагч нь `deleteZov` хүртэл ХЭЗЭЭ Ч ирдэггүй тул. Тиймээс
   * `ZovshoorolEdit.remove` мөн ИЖИЛ мессежийг `setFail`-ээр гаргадаг болов.
   * Энэ шалгуур нь одоо ХОЁРДУГААР хамгаалалт (шууд дуудагч, ирээдүйн дуудагч)
   * — хасвал `oid = 0` нь `applyEdits`-т явж, серверийн ойлгомжгүй алдаа
   * буцаана. Хоёр мессеж ЯГ ижил байх ёстой: i18n-д нэг л түлхүүр.
   */
  if (!Number.isFinite(oid) || oid <= 0) {
    throw new Error(tr('Мөрийн OBJECTID уншигдаагүй тул устгах боломжгүй.'));
  }
  const j = await agsFetch(`${URL}/applyEdits`, {
    deletes: JSON.stringify([oid]),
    rollbackOnFailure: 'true',
  });
  const res = (j.deleteResults ?? []) as { success?: boolean; error?: { description?: string } }[];
  /* ⚠️ ХООСОН ХАРИУГ АМЖИЛТ ГЭЖ ҮЗЭХГҮЙ (2026-09-16-ны аудит).
     Урьд нь `deleteResults` талбар БАЙХГҮЙ хариунд `res` нь `[]` болж,
     `bad` нь `undefined`, функц хэвийн буцаж кэш цэвэрлэгддэг байв —
     хэрэглэгч «устгалаа» гэж хараад зөвшөөрөл серверт ХЭВЭЭР үлдэнэ.
     `agsFetch` нь зөвхөн ДЭЭД ТҮВШНИЙ `{error:…}`-ыг барьдаг тул хагас
     дутуу 200 (схем зөрөх, proxy дахин бичих, буруу endpoint) ЭНД
     баригдана. Дээрх `saveZov` аль хэдийн ижил хамгаалалттай. */
  if (res.length === 0) throw new Error(tr('Үйлчилгээ хариу буцаасангүй.'));
  const bad = res.find((r) => r.success === false);
  if (bad) throw new Error(bad.error?.description || tr('Устгах амжилтгүй боллоо.'));
  invalidate('ZOVSHOOROL');
}

/**
 * МАЯГТЫН ШАЛГУУР — хадгалахаас ӨМНӨ.
 *
 * ⚠️ Зөрчлийг ЗАСВАРЛАХГҮЙ, зөвхөн хэлнэ: чимээгүй засвар нь хэрэглэгчийн
 * оруулсан утгыг өөрчилж, тэр мэдэхгүй үлдэнэ.
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
    /* ⚠️ Багц дотор дараалал ДАВХАРДВАЛ гинж дэх байрлал тодорхойгүй болж,
       хоёр зөвшөөрөл нэг байранд зурагдана. Зөрчсөн зөвшөөрлийн НЭРИЙГ
       хэлнэ — «давхардлаа» гэсэн ганц өгүүлбэр нь хаана байгааг хэлдэггүй. */
    const dup = all.find(
      (r) => r.oid !== d.oid && r.bagts === d.bagts.trim() && r.shat === d.shat,
    );
    if (dup) e.shat = tr('{0}-д {1}-р дараалал «{2}»-д аль хэдийн эзлэгдсэн.', d.bagts, String(d.shat), dup.ner);
  }
  /* ⚠️ 2026-10-06: танигдаагүй төлөвтэй мөрд хэрэглэгч төлөвийг ӨӨРӨӨ сонгоно —
     анхдагч утга тавихгүй (`ZovDraft.tolov`-ийн тайлбар). */
  if (d.tolov == null) e.tolov = tr('Төлөвийг сонгоно уу — одоогийн утга танигдаагүй.');
  /* ⚠️ Төлөв ба огноо ЗААВАЛ нийцнэ: огноогүй «Зөвшөөрсөн» нь хэзээ
     зөвшөөрөгдснийг мэдэгдэхгүй, огноотой «Хүлээгдэж буй» нь худал. */
  if (d.tolov != null && d.tolov !== TOLOV.wait && d.ognoo == null) {
    e.ognoo = tr('«{0}» төлөвт шийдвэрлэсэн огноо заавал шаардлагатай.', d.tolov);
  }
  if (d.tolov === TOLOV.wait && d.ognoo != null) {
    e.ognoo = tr('«Хүлээгдэж буй» төлөвт огноо байх ёсгүй.');
  }
  /* ⚠️ 2026-10-05: УТГАГҮЙ ОН («20226», «0202» г.м. гарын алдаа) хадгалагддаг байв.
     Төсөл 2020-иод онд тул 2000–2100-аас гадуурхыг татгалзана. Өнөөдрөөс ХОЙШХИ огноо нь
     хориг биш — маягт (`ZovshoorolEdit.submit`) баталгаажуулж асууна. */
  if (d.ognoo != null && !e.ognoo) {
    const y = new Date(d.ognoo).getUTCFullYear();
    if (!Number.isFinite(y) || y < 2000 || y > 2100) e.ognoo = tr('Огнооны он буруу байна (2000–2100).');
  }
  return e;
}
