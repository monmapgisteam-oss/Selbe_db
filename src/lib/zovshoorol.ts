/**
 * БАГЦЫН ЗӨВШӨӨРЛҮҮД — шат дараалсан хяналт.
 *
 * ⚠️ ҮЙЛЧИЛГЭЭ ХАРААХАН ХОЛБОГДООГҮЙ. `URL` хоосон байхад бүх дуудлага
 * `null` буцааж, дэлгэц нь «холбогдоогүй» гэж ИЛ хэлнэ — хоосон жагсаалт
 * харуулж «зөвшөөрөл алга» гэж ойлгуулахгүй. Үйлчилгээ бэлэн болмогц
 * ЗӨВХӨН доорх `URL`-ыг бөглөнө, өөр юу ч засах шаардлагагүй.
 */

import { agsFetch } from '@/modules/sheet/ags';
import { t as tr } from '@/lib/i18nCore';
import { invalidate } from '@/lib/dataBus';

/**
 * ⚠️ Давхаргын дугаар нь 0 БИШ — 171. Нэг үйлчилгээнд олон хүснэгт
 * нийтлэгдэхэд ArcGIS дугаарыг үргэлжлүүлэн өгдөг тул «/0» гэж таамаглаж
 * бичвэл огт өөр хүснэгт уншина.
 */
export const URL =
  'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/bagts_ajliin_zovshoorliin_burtgel/FeatureServer/171';

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
export const oidKey = (a: Record<string, unknown>): string | null =>
  Object.keys(a).find((k) => /^objectid$/i.test(k)) ?? null;

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
    oidFieldP = agsFetch(URL, {})
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

/**
 * Бүх зөвшөөрлийг татна. Үйлчилгээ холбогдоогүй эсвэл унасан бол `null` —
 * ХООСОН МАССИВ БИШ. Хоосон массив нь «зөвшөөрөл байхгүй» гэсэн ХАРИУЛТ
 * болж уншигддаг тул «мэдэхгүй»-гээс заавал ялгана.
 */
export async function loadZov(): Promise<Zov[] | null> {
  if (!URL) return null;
  try {
    const out: Zov[] = [];
    for (let offset = 0; ; ) {
      const j = await agsFetch(`${URL}/query`, {
        where: '1=1',
        outFields: '*',
        returnGeometry: 'false',
        orderByFields: `${F.bagts} ASC, ${F.shat} ASC`,
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
        const k = oidKey(a);
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
        });
      }
      if (!j.exceededTransferLimit || fs.length === 0) break;
      offset += fs.length;
    }
    return out;
  } catch {
    return null;
  }
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
export function summarize(list: Zov[]): {
  ok: number; wait: number; no: number; unknown: number; total: number; alert: boolean;
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
  return { ok, wait, no, unknown, total: list.length, alert: no > 0 || unknown > 0 };
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
  tolov: Exclude<Tolov, 'unknown'>;
};

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
 */
export async function saveZov(d: ZovDraft): Promise<number> {
  if (!URL) throw new Error(tr('Зөвшөөрлийн үйлчилгээ холбогдоогүй байна.'));
  const attributes: Record<string, unknown> = {
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
  };
  const edit: Record<string, string> = { rollbackOnFailure: 'true' };
  if (d.oid) {
    /* ⚠️ 2026-09-04: OBJECTID-ын нэрийг метадатагаас авна. Хатуу `'ObjectID'`
       байхад ArcGIS нь танихгүй талбарыг ЧИМЭЭГҮЙ хаяж, «аль мөрийг засах»
       нь тодорхойгүй болно. Кэштэй тул сүлжээний дуудлага нэг л удаа. */
    const oidName = await oidField();
    edit.updates = JSON.stringify([{ attributes: { [oidName]: d.oid, ...attributes } }]);
  } else {
    edit.adds = JSON.stringify([{ attributes }]);
  }

  const j = await agsFetch(`${URL}/applyEdits`, edit);
  const res = [...(j.addResults ?? []), ...(j.updateResults ?? [])] as {
    success?: boolean; objectId?: number; error?: { description?: string };
  }[];
  if (res.length === 0) throw new Error(tr('Үйлчилгээ хариу буцаасангүй.'));
  const bad = res.find((r) => r.success === false);
  if (bad) throw new Error(bad.error?.description || tr('Хадгалах амжилтгүй боллоо.'));
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
  /* ⚠️ Төлөв ба огноо ЗААВАЛ нийцнэ: огноогүй «Зөвшөөрсөн» нь хэзээ
     зөвшөөрөгдснийг мэдэгдэхгүй, огноотой «Хүлээгдэж буй» нь худал. */
  if (d.tolov !== TOLOV.wait && d.ognoo == null) {
    e.ognoo = tr('«{0}» төлөвт шийдвэрлэсэн огноо заавал шаардлагатай.', d.tolov);
  }
  if (d.tolov === TOLOV.wait && d.ognoo != null) {
    e.ognoo = tr('«Хүлээгдэж буй» төлөвт огноо байх ёсгүй.');
  }
  return e;
}
