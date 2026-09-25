/**
 * БАГЦТАЙ ДАВХЦАЖ БУЙ «ҮЛДСЭН НЭГЖ ТАЛБАР» — орон зайн огтлолцол.
 *
 * «Үлдсэн нэгж талбар» гэдэг нь чөлөөлөгдөөгүй, БАРИЛГА ЭХЛҮҮЛЭХЭД СААД болж буй
 * газар. Багцын мөрөн дээр ийм талбар байвал тэр ажил эхлэх боломжгүй тул багц
 * сонгоход ЭНЭ ТОО хамгийн эхэнд хэрэгтэй.
 *
 * ⚠️ Багц нь ЗӨВХӨН барилгын блок БИШ: дэд бүтцийн 48 багц нь өөрсдийн
 *    давхаргатай (шугам хоолой, зам, цахилгаан). Тиймээс эх сурвалжийг ЖАГСААЛТ
 *    хэлбэрээр авна — сонгосон нэг багц ч, бүх багц ч ижил замаар тоологдоно.
 *
 * ⚠️ Геометрийн ТӨРӨЛ гурав (талбай · шугам · цэг) бөгөөд ArcGIS-ийн нэг асуулга
 *    НЭГ төрөл хүлээж авдаг. Тиймээс төрөл тус бүрд нэг асуулга явуулж, гарсан
 *    ObjectID-уудыг НЭГТГЭНЭ (давхардлыг Set арилгана).
 *
 * ⚠️ Хоёр давхарга ХОЁУЛАА UTM 32648 боловч үүнд НАЙДАХГҮЙ: эх геометрийг
 *    парселийн давхаргын проекцоор ЗААЖ авна (`outSR`). Проекц зөрвөл огтлолцол
 *    чимээгүй ХООСОН гарч, «саадгүй» гэсэн ХУДАЛ дүгнэлт өгнө.
 */

import { PARCEL_LEFT, LAYER_BY_ID, parcelLeftWhere } from './services';
import { tokenParam, tokenQs } from '@/lib/authToken';
import { withSlot } from './query';
import { register } from './dataBus';
import { t as tr } from '@/lib/i18nCore';

/**
 * Барилга эхлүүлэхэд саад болж буй нэгж талбарын SQL нөхцөл.
 *
 * ⚠️ 2026-09-06: урьд нь `LEFT_STATUS = 'Үлдсэн нэгж талбар'` гэсэн ГАНЦ утга
 * байв. Шинэ эхэд тэр ангилал БАЙХГҮЙ — «Бүрэн чөлөөлсөн»-өөс бусад БҮХ утга
 * (зөвшилцөх · татгалзсан · маргаантай …) нь шийдвэрлэгдээгүй гэсэн үг тул
 * нөхцөл нь ТЭНЦҮҮ БИШ болов (`parcelLeftWhere`).
 */

/** Огтлолцуулах эх сурвалж — давхарга + (сонголтоор) түүний шүүлт. */
export type Src = { layerId: string; where?: string | null };

export type Overlap = {
  /** Давхцаж буй ҮЛДСЭН нэгж талбарын ObjectID-ууд */
  oids: number[];
  /**
   * ТАТАГДААГҮЙ эх сурвалжуудын `layerId` — хоосон бол бүрэн тоологдсон.
   *
   * ⚠️ 2026-09-11: `Promise.allSettled` нь унасан давхаргыг ЧИМЭЭГҮЙ алгасдаг
   * тул 48 давхаргын хэд нь татагдаагүй ч үлдсэнээр тооцоод үр дүн АМЖИЛТТАЙ
   * шийдэгддэг байв. Хоосон `oids` нь «саад алга» ГЭСЭН УТГАТАЙ учир энэ нь
   * файлын толгойд анхааруулсан «чимээгүй ХООСОН гарч "саадгүй" гэсэн ХУДАЛ
   * дүгнэлт» — яг тэр ангиллын алдаа.
   *
   * ⚠️ Талбар нь СОНГОЛТОТ (`?`): `execTriage.ts`-ийн `.catch(() => ({ oids: [] }))`
   * зэрэг байгаа объект литералуудыг эвдэхгүй. Дуудагч `failed?.length`-ээр
   * шалгана; `pkgSaad.ts` нь өөрийн `failed: boolean` тугтай (тэр нь БҮХ
   * багц унасныг тэмдэглэдэг) — хоёр нь ӨӨР түвшний мэдээлэл.
   */
  failed?: string[];
};

/* ⚠️ withSlot (2026-08-21 гүйцэтгэлийн аудит): энэ модулийн fetch нь query.ts-ийн
   6 слотын хязгаарлагчийг ТОЙРЧ гардаг байсан тул нүүр хуудасны ~53 давхцлын
   ажил зэрэг бууж ArcGIS «Too many requests» өдөөж, бусад картын асуулгыг
   хардаг байв. Одоо бүх хүсэлт нэг дарааллаар шатлан явна. */
async function post(url: string, params: Record<string, string>) {
  return withSlot(async () => {
    const res = await fetch(`${url}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...tokenParam(), ...params, f: 'json' }),
    });
    if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'ArcGIS error');
    return j;
  });
}

/** Парселийн давхаргын проекц — нэг л удаа асууж кэшлэнэ. */
let srCache: Promise<number> | null = null;
function parcelSR(): Promise<number> {
  if (!srCache)
    srCache = fetch(`${PARCEL_LEFT.url}?f=json${tokenQs()}`)
      .then((r) => r.json())
      .then((m) => {
        const sr = m?.extent?.spatialReference;
        return Number(sr?.wkid ?? sr?.latestWkid) || 32648;
      })
      .catch(() => 32648);
  return srCache;
}

type Geoms = { rings: number[][][]; paths: number[][][]; points: number[][] };

/* ⚠️ 2026-09-25: хуудаслалтын `orderByFields`-д давхаргын ЖИНХЭНЭ OID талбар
   хэрэгтэй (`objectid`/`FID` байж болно — `ceo/workforce.ts`-ийн сургамж).
   Метадата унавал `OBJECTID` — буруу нэр бол сервер алдаа буцааж давхарга
   `failed`-д орно (чимээгүй дутуу үр дүн биш). */
const oidCache = new Map<string, Promise<string>>();
function oidFieldOf(url: string): Promise<string> {
  let p = oidCache.get(url);
  if (!p) {
    p = fetch(`${url}?f=json${tokenQs()}`)
      .then((r) => r.json())
      .then((m: { objectIdField?: string; fields?: { name: string; type: string }[] }) =>
        m?.objectIdField || m?.fields?.find((f) => f.type === 'esriFieldTypeOID')?.name || 'OBJECTID')
      .catch(() => 'OBJECTID');
    oidCache.set(url, p);
  }
  return p;
}

/** Нэг давхаргаас татах хуудасны дээд тоо — хамгаалалт (хязгааргүй давталтаас) */
const MAX_PAGES = 200;

/**
 * Нэг давхаргын геометрийг татаж, төрлөөр нь хуримтлуулна.
 *
 * ⚠️ `maxAllowableOffset` — геометрийг 1 м нарийвчлалаар ЕРӨНХИЙЛНӨ. Замын
 *    шугам зэрэг олон мянган цэгтэй объектын payload-ыг эрс багасгах бөгөөд
 *    нэгж талбарын хэмжээ (арав гаруй метр) дээр огтлолцлын үр дүн өөрчлөгдөхгүй.
 */
/* ⚠️ ДАВХАРГА БҮРИЙН ГЕОМЕТРИЙН КЭШ (2026-08-21 гүйцэтгэлийн аудит):
   нүүр (53 ажил) ба Tsogts (3 эффект) ИЖИЛ давхаргуудын геометрийг олон
   дахин татдаг байв — МБ-аар хэмжигдэх JSON бүрийг нэг л удаа татна.
   Амжилтгүй амлалтыг кэшлэхгүй («дахин оролдох» сэргэнэ). */
const geomCache = new Map<string, Promise<Geoms>>();

function layerGeoms(src: Src, wkid: number): Promise<Geoms> {
  const d = LAYER_BY_ID[src.layerId];
  if (!d) return Promise.resolve({ rings: [], paths: [], points: [] });
  const where = src.where ?? d.where ?? '1=1';
  const key = `${src.layerId}|${where}|${wkid}`;
  let p = geomCache.get(key);
  if (!p) {
    /* ⚠️ 2026-09-25 аудит: ХУУДАСЛАЛТ. Урьд нь нэг асуулга л явдаг тул
       `maxRecordCount`-оос (1000/2000) их объекттой давхаргын үлдсэн хэсэг
       ЧИМЭЭГҮЙ тасарч, тэр хэсэгтэй давхцах нэгж талбар «саадгүй» гэж гардаг
       байв. `orderByFields` ЗААВАЛ (CLAUDE.md: эрэмбэгүй offset давхардал/алдагдал
       үүсгэнэ). Хуудас хоосон атлаа `exceededTransferLimit` бол — хуудаслалт
       дэмжигдэхгүй — ДУТУУ үр дүн буцаахгүй, шидэж давхаргыг `failed`-д оруулна. */
    const url = d.url as string;
    p = (async () => {
      const oidF = await oidFieldOf(url);
      const out: Geoms = { rings: [], paths: [], points: [] };
      type G = { rings?: number[][][]; paths?: number[][][]; x?: number; y?: number };
      let off = 0;
      for (let page = 0; ; page += 1) {
        if (page >= MAX_PAGES) throw new Error(tr('ArcGIS: {0} давхаргын хуудаслалт хэт урт', src.layerId));
        const j = await post(url, {
          where,
          returnGeometry: 'true',
          outFields: oidF,
          outSR: String(wkid),
          maxAllowableOffset: '1',
          orderByFields: `${oidF} ASC`,
          resultOffset: String(off),
        });
        const fs = (j.features ?? []) as { geometry?: G }[];
        for (const f of fs) {
          const g = f.geometry;
          if (!g) continue;
          if (g.rings) out.rings.push(...g.rings);
          else if (g.paths) out.paths.push(...g.paths);
          else if (typeof g.x === 'number' && typeof g.y === 'number') out.points.push([g.x, g.y]);
        }
        if (!j.exceededTransferLimit) break;
        if (!fs.length) throw new Error(tr('ArcGIS: {0} давхарга бүрэн татагдсангүй', src.layerId));
        off += fs.length;
      }
      return out;
    })();
    p.catch(() => geomCache.delete(key));
    geomCache.set(key, p);
  }
  return p;
}

/**
 * Өгсөн эх сурвалжуудтай ДАВХЦАЖ буй үлдсэн нэгж талбарууд.
 *
 * @param sources Багцын давхарга(ууд) ба тэдгээрийн шүүлт.
 */
export async function overlapLeftParcels(sources: Src[]): Promise<Overlap> {
  if (!sources.length) return { oids: [] };
  /* ҮР ДҮНГИЙН КЭШ — ижил эх сурвалжийн олонлогоор дахин дуудахад (харагдац
     сэлгэх, багц дахин сонгох) сүлжээ огт хөндөхгүй. Түлхүүр нь ЭРЭМБЭЛСЭН
     жагсаалт — дарааллын ялгаа нэг ажил гэж тоологдоно. */
  const rKey = sources.map((s) => `${s.layerId}|${s.where ?? ''}`).sort().join(';');
  const hit = resultCache.get(rKey);
  if (hit) return hit;
  const run = overlapUncached(sources);
  run.catch(() => resultCache.delete(rKey));
  /*
   * ⚠️ 2026-09-11: ХЭСЭГЧИЛСЭН үр дүнг КЭШЛЭХГҮЙ. Урьд нь `run.catch()` нь
   * ЗӨВХӨН reject-ийг кэшнээс хасдаг байсан тул давхарга нь унасан ч
   * `allSettled` дээр «амжилттай» шийдэгдсэн ХАГАС үр дүн кэшэд баталгаатай
   * хариу мэт үлдэж, сесс дуустал «саад алга» гэж харагддаг байв (дахин
   * оролдох ч боломжгүй — кэш нь буцаагаад тэр хагасаа өгнө). Одоо
   * `failed` тугтай хариуг кэшнээс ХАСНА: дараагийн дуудлага дахин оролдож,
   * сүлжээ сэргэмэгц БҮРЭН тоо гарна.
   */
  void run.then((r) => {
    if (r.failed?.length) resultCache.delete(rKey);
  }).catch(() => {});
  resultCache.set(rKey, run);
  return run;
}

const resultCache = new Map<string, Promise<Overlap>>();

/**
 * ⚠️ КЭШИЙГ ӨГӨГДЛИЙН АВТОБУСАД ХОЛБОВ (2026-08-31). Хоёулаа модулийн
 * түвшний Map тул `invalidate('PARCEL_LEFT')` тэднийг хөнддөггүй байв.
 * Нэгж талбарын `Tuluv`-ыг «Үлдсэн»-ээс өөр болгомогц тэр талбар давхцлын
 * тооцооноос ГАРАХ ёстой; кэш цэвэрлэгдэхгүй бол «Саад — багцаар» зурвас
 * сешн дуустал хуучин OID-уудаа харуулж, зассан ажил хийгдээгүй мэт харагдана.
 */
register(() => { geomCache.clear(); resultCache.clear(); }, ['PARCEL_LEFT']);

async function overlapUncached(sources: Src[]): Promise<Overlap> {
  const wkid = await parcelSR();
  const g: Geoms = { rings: [], paths: [], points: [] };

  // ⚠️ Зэрэг татна — 57 дэд бүтцийн давхаргыг дараалуулбал секунд хүлээнэ.
  //    Нэг давхарга унасан ч бусад нь үргэлжлэх ёстой (`allSettled`).
  const settled = await Promise.allSettled(sources.map(async (s) => {
    const lg = await layerGeoms(s, wkid);
    g.rings.push(...lg.rings);
    g.paths.push(...lg.paths);
    g.points.push(...lg.points);
  }));
  /*
   * ⚠️ 2026-09-11: УНАСАН ЭХ СУРВАЛЖИЙГ ТООЛНО. `allSettled` дангаараа
   * уналтыг ЧИМЭЭГҮЙ залгидаг тул хагас татагдсан геометрээр бодсон үр дүн
   * «бүрэн» мэт буцдаг байв — файлын толгойн анхааруулга (проекц зөрвөл
   * «саадгүй» гэсэн ХУДАЛ дүгнэлт) яг энэ ангилалд хамаарна. Аль давхарга
   * унасныг НЭРЭЭР нь дамжуулж, дуудагч тал ил хэлэх боломжтой болгоно.
   */
  const failed = settled
    .map((r, i) => (r.status === 'rejected' ? sources[i].layerId : null))
    .filter((x): x is string => x !== null);
  /* ⚠️ БҮГД унасан бол энэ нь үр дүн БИШ, АЛДАА — хоосон `oids` нь «саад
     алга» гэж уншигдах тул шидэж, дуудагчийн `catch` замд оруулна. */
  if (failed.length === sources.length) {
    throw new Error(tr('ArcGIS: {0} эх сурвалж бүгд татагдсангүй', failed.length));
  }

  /**
   * ⚠️ ХЭСЭГЧИЛСЭН АСУУЛГА — гүйцэтгэлийн ГОЛ хүчин зүйл.
   *
   * Бүх багцын геометр нь ~8,000 хэсэгтэй (голдуу шугам хоолой). Түүнийг НЭГ
   * асуулгаар илгээхэд сервер 2,119 нэгж талбарыг тэр асар том геометртэй
   * тулгаж **57 секунд** боддог байв. 400-аар хувааж ЗЭРЭГ асуухад ижил үр дүн
   * **1.8 секундэд** гарна (хэмжсэн). Геометр татах нь ердөө 1.1 сек тул гацаа
   * нь ЗӨВХӨН энд байсан.
   */
  const CHUNK = 400;
  const cut = <T,>(a: T[]): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < a.length; i += CHUNK) out.push(a.slice(i, i + CHUNK));
    return out;
  };
  const shapes: Array<[string, string]> = [
    ...cut(g.rings).map(
      (c) => ['esriGeometryPolygon', JSON.stringify({ rings: c, spatialReference: { wkid } })] as [string, string],
    ),
    ...cut(g.paths).map(
      (c) => ['esriGeometryPolyline', JSON.stringify({ paths: c, spatialReference: { wkid } })] as [string, string],
    ),
    ...cut(g.points).map(
      (c) => ['esriGeometryMultipoint', JSON.stringify({ points: c, spatialReference: { wkid } })] as [string, string],
    ),
  ];
  /* ⚠️ Геометр огт гараагүй ч УНАСАН давхарга байвал түүнийг дамжуулна —
     эс бөгөөс «хэлбэр алга» нь «саад алга» гэж ХУДАЛ уншигдана. */
  if (!shapes.length) return failed.length ? { oids: [], failed } : { oids: [] };

  const ask = (geometryType: string, geometry: string, where: string) =>
    post(PARCEL_LEFT.url, {
      geometry,
      geometryType,
      spatialRel: 'esriSpatialRelIntersects',
      inSR: String(wkid),
      where,
      returnIdsOnly: 'true',
    });

  // ⚠️ `N'…'` угтвар — талбар нь Unicode (nvarchar); зарим үйлчилгээнд
  //    угтваргүй кирилл харьцуулалт ХООСОН буцаадаг.
  const leftWhere = parcelLeftWhere();
  const res = await Promise.all(shapes.map(([t, geom]) => ask(t, geom, leftWhere)));
  /* ⚠️ 2026-09-25: ID-ийн асуулга ч хязгаарт хүрвэл ДУТУУ жагсаалт буцна —
     «саад цөөн» гэсэн худал тоо өгөхийн оронд алдаа (кэшлэгдэхгүй). */
  if (res.some((r) => r?.exceededTransferLimit)) {
    throw new Error(tr('ArcGIS: нэгж талбарын давхцлын жагсаалт бүрэн ирсэнгүй'));
  }

  const left = new Set<number>();
  for (const r of res) for (const id of (r.objectIds ?? []) as number[]) left.add(id);
  /* ⚠️ `failed` нь ХООСОН үед талбарыг ОГТ нэмэхгүй — бүрэн тоологдсон үр дүн
     нь өмнөх хэлбэрээрээ үлдэж, дуудагчийн `failed?.length` шалгуур зөв
     ажиллана (кэшлэх эсэхийг `overlapLeftParcels` мөн үүгээр шийднэ). */
  return failed.length ? { oids: [...left], failed } : { oids: [...left] };
}
