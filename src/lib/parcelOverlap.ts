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
import { arcgisPost } from './query';
import { register } from './dataBus';
import { subscribeTotals } from './totals';
import { t as tr } from '@/lib/i18nCore';
import { isClearedStatus } from './land';

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
   хардаг байв. Одоо бүх хүсэлт нэг дарааллаар шатлан явна.
   ⚠️ 2026-09-30: слотыг `query.arcgisPost` өөрөө авна (мөн timeout · 429 backoff ·
   498 шинэчлэлт) — гаднаас `withSlot`-оор ДАВХАР ороохгүй (слот дуусахад гацна). */
const post = (url: string, params: Record<string, string>) =>
  arcgisPost<{ features?: unknown[]; exceededTransferLimit?: boolean; objectIds?: number[] }>(`${url}/query`, params);

/** Парселийн давхаргын проекц — нэг л удаа асууж кэшлэнэ. */
let srCache: Promise<number> | null = null;
function parcelSR(): Promise<number> {
  if (!srCache)
    /* ⚠️ 2026-09-30: GET + токен query string → `arcgisPost` (`?f=json` метаг POST-оор) */
    srCache = arcgisPost<{ extent?: { spatialReference?: { wkid?: number; latestWkid?: number } } }>(PARCEL_LEFT.url, {})
      .then((m) => {
        const sr = m?.extent?.spatialReference;
        return Number(sr?.wkid ?? sr?.latestWkid) || 32648;
      })
      /* ⚠️ 2026-10-09: түр зуурын уналтын нөөц утгыг КЭШЛЭХГҮЙ — урьд нь 32648 сесс дуустал
         үлдэж, метадата сэргэсэн ч дахин асуудаггүй байв. Энэ дуудлагад л нөөцийг буцаана. */
      .catch(() => {
        srCache = null;
        return 32648;
      });
  return srCache;
}

type Geoms = { rings: number[][][]; paths: number[][][]; points: number[][] };
/**
 * НЭГ ОБЪЕКТЫН геометр (2026-10-01). Урьд нь давхаргын геометр шууд `Geoms` болж
 * хавтгайрдаг байв; одоо объект бүр тусдаа — (1) OID-оор дэд олонлог гаргах, (2) клиент
 * талын хамаарлыг объектын бүх цагиргаар (нүхтэй полигон) зөв шалгахад.
 * `oid` нь зөвхөн OID-той татсан үед (`withOid`), бусад үед `null`.
 */
type Feat = { oid: number | null; rings?: number[][][]; paths?: number[][][]; pt?: number[] };

const toGeoms = (fs: readonly Feat[]): Geoms => {
  const g: Geoms = { rings: [], paths: [], points: [] };
  for (const f of fs) {
    if (f.rings) g.rings.push(...f.rings);
    else if (f.paths) g.paths.push(...f.paths);
    else if (f.pt) g.points.push(f.pt);
  }
  return g;
};

/* ⚠️ 2026-09-25: хуудаслалтын `orderByFields`-д давхаргын ЖИНХЭНЭ OID талбар
   хэрэгтэй (`objectid`/`FID` байж болно — `ceo/workforce.ts`-ийн сургамж).
   Метадата унавал `OBJECTID` — буруу нэр бол сервер алдаа буцааж давхарга
   `failed`-д орно (чимээгүй дутуу үр дүн биш). */
/* ⚠️ 2026-09-25 (аудит 8): `paging` — давхарга `resultOffset`-ийг ДЭМЖДЭГ эсэх
   (`advancedQueryCapabilities.supportsPagination`). Дэмжихгүй үйлчилгээ offset-ийг
   үл тоож ИЖИЛ хуудсыг буцаадаг тул `exceededTransferLimit` хэвээр → 200 хуудас
   давтаад л унадаг байв. Мэдэгдэхгүй (метадата унасан) бол `true` — хуучин зан. */
type LayerMeta = { oid: string; paging: boolean };
const oidCache = new Map<string, Promise<LayerMeta>>();
function oidFieldOf(url: string): Promise<LayerMeta> {
  let p = oidCache.get(url);
  if (!p) {
    p = arcgisPost<{
      objectIdField?: string;
      fields?: { name: string; type: string }[];
      advancedQueryCapabilities?: { supportsPagination?: boolean };
    }>(url, {})
      .then((m) => ({
        oid: m?.objectIdField || m?.fields?.find((f) => f.type === 'esriFieldTypeOID')?.name || 'OBJECTID',
        paging: m?.advancedQueryCapabilities?.supportsPagination !== false,
      }))
      .catch(() => ({ oid: 'OBJECTID', paging: true }));
    oidCache.set(url, p);
  }
  return p;
}

/** Нэг давхаргаас татах хуудасны дээд тоо — хамгаалалт (хязгааргүй давталтаас) */
const MAX_PAGES = 200;

/* ⚠️ ДАВХАРГА БҮРИЙН ГЕОМЕТРИЙН КЭШ (2026-08-21 гүйцэтгэлийн аудит):
   нүүр (53 ажил) ба Tsogts (3 эффект) ИЖИЛ давхаргуудын геометрийг олон
   дахин татдаг байв — МБ-аар хэмжигдэх JSON бүрийг нэг л удаа татна.
   Амжилтгүй амлалтыг кэшлэхгүй («дахин оролдох» сэргэнэ). */
const geomCache = new Map<string, Promise<Feat[]>>();

const srcWhere = (src: Src): string => src.where ?? LAYER_BY_ID[src.layerId]?.where ?? '1=1';
const geomKey = (layerId: string, where: string, wkid: number) => `${layerId}|${where}|${wkid}`;

/**
 * Нэг давхаргын геометрийг ХУУДАСЛАН татна.
 *
 * ⚠️ `maxAllowableOffset` — геометрийг 1 м нарийвчлалаар ЕРӨНХИЙЛНӨ. Замын
 *    шугам зэрэг олон мянган цэгтэй объектын payload-ыг эрс багасгах бөгөөд
 *    нэгж талбарын хэмжээ (арав гаруй метр) дээр огтлолцлын үр дүн өөрчлөгдөхгүй.
 * ⚠️ 2026-09-25 аудит: ХУУДАСЛАЛТ. `orderByFields` ЗААВАЛ (CLAUDE.md: эрэмбэгүй offset
 *    давхардал/алдагдал үүсгэнэ). Хуудас хоосон атлаа `exceededTransferLimit` бол —
 *    хуудаслалт дэмжигдэхгүй — ДУТУУ үр дүн буцаахгүй, шидэж давхаргыг `failed`-д оруулна.
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас», CEO «Газар» 295 хүсэлт): МЕТАДАТА ЗӨВХӨН
 *    ХЭРЭГТЭЙ ҮЕД. Эхний хуудас нь offset-гүй (эрэмбэ хамаагүй) — давхарга нэг хуудсанд
 *    багтвал (ихэнх нь) метадатын хүсэлт ОГТ явахгүй. Хязгаарт хүрвэл OID-ийг асууж
 *    ЭХНЭЭС нь эрэмбэтэй хуудаслана (хуучин дүрэм) — үр дүн ижил, хүсэлт ~2 дахин цөөн.
 */
async function fetchFeats(url: string, where: string, wkid: number, layerId: string, withOid: boolean): Promise<Feat[]> {
  let meta: LayerMeta | null = withOid ? await oidFieldOf(url) : null;
  let out: Feat[] = [];
  let off = 0;
  type G = { rings?: number[][][]; paths?: number[][][]; x?: number; y?: number };
  for (let page = 0; ; page += 1) {
    if (page >= MAX_PAGES) throw new Error(tr('ArcGIS: {0} давхаргын хуудаслалт хэт урт', layerId));
    const params: Record<string, string> = {
      where,
      returnGeometry: 'true',
      outSR: String(wkid),
      maxAllowableOffset: '1',
    };
    if (meta) {
      params.outFields = meta.oid;
      params.orderByFields = `${meta.oid} ASC`;
      params.resultOffset = String(off);
    }
    const j = await post(url, params);
    const fs = (j.features ?? []) as { geometry?: G; attributes?: Record<string, unknown> }[];
    for (const f of fs) {
      const g = f.geometry;
      if (!g) continue;
      const raw = meta ? Number(f.attributes?.[meta.oid]) : NaN;
      const oid = Number.isFinite(raw) ? raw : null;
      if (g.rings) out.push({ oid, rings: g.rings });
      else if (g.paths) out.push({ oid, paths: g.paths });
      else if (typeof g.x === 'number' && typeof g.y === 'number') out.push({ oid, pt: [g.x, g.y] });
    }
    if (!j.exceededTransferLimit) break;
    if (!meta) {
      /* эрэмбэгүй эхний хуудас хязгаарт хүрэв — эрэмбэтэйгээр ЭХНЭЭС нь */
      meta = await oidFieldOf(url);
      out = [];
      off = 0;
      continue;
    }
    /* ⚠️ Хуудаслалтгүй давхарга дээр offset давтахгүй — шууд `failed` (дутуу үр дүн биш) */
    if (!fs.length || !meta.paging) throw new Error(tr('ArcGIS: {0} давхарга бүрэн татагдсангүй', layerId));
    off += fs.length;
  }
  return out;
}

function layerFeats(src: Src, wkid: number): Promise<Feat[]> {
  const d = LAYER_BY_ID[src.layerId];
  if (!d) return Promise.resolve([]);
  const where = srcWhere(src);
  const key = geomKey(src.layerId, where, wkid);
  let p = geomCache.get(key);
  if (!p) {
    p = fetchFeats(d.url as string, where, wkid, src.layerId, false);
    p.catch(() => geomCache.delete(key));
    geomCache.set(key, p);
  }
  return p;
}

/** `<талбар> IN (1,2,3)` хэлбэрийн OID шүүлт (`execTriage`-ийн барилгын багцууд) */
const OID_IN = /^\s*\(?\s*([A-Za-z_]\w*)\s+IN\s*\(([\d\s,]+)\)\s*\)?\s*$/i;

/**
 * НЭГ давхаргын ОЛОН `OID IN (…)` шүүлтийг НЭГ татлагаас задална (2026-10-01).
 * ⚠️ Урьд нь барилгын багц бүр (`execTriage.loadOverlaps`) `mon:building`-ийг өөрийн
 *    `OID IN` шүүлтээр ТУСДАА татдаг байв; дараа нь бүтэн давхаргыг (`where: null`)
 *    ДАХИН татдаг. Одоо бүтэн давхаргыг OID-тайгаар НЭГ удаа татаж, дэд олонлогуудыг
 *    OID-оор таслана — ижил объект, ижил ерөнхийлөлт (`maxAllowableOffset`) тул үр дүн ижил;
 *    бүтэн давхаргын кэш (`where: null`-ийн түлхүүр) мөн бөглөгдөнө.
 * ⚠️ Зөвхөн давхаргын өөрийн шүүлт (`d.where`) ХООСОН үед — эс бөгөөс бүтэн татлага
 *    нь `OID IN`-ээс өөр олонлог. Шүүлтийн талбар нь жинхэнэ OID биш бол алгасна.
 *    Алдаа гарвал юу ч хийхгүй — ердийн замаар тус тусдаа татагдана.
 */
async function prefetchOidSubsets(asks: readonly Ask[], wkid: number): Promise<void> {
  const byLayer = new Map<string, Set<string>>();
  for (const a of asks) {
    for (const s of a.sources) {
      const d = LAYER_BY_ID[s.layerId];
      if (!d || (d.where && d.where !== '1=1') || !s.where || !OID_IN.test(s.where)) continue;
      if (geomCache.has(geomKey(s.layerId, s.where, wkid))) continue;
      const set = byLayer.get(s.layerId) ?? new Set<string>();
      set.add(s.where);
      byLayer.set(s.layerId, set);
    }
  }
  await Promise.all([...byLayer].map(async ([layerId, wheres]) => {
    if (wheres.size < 2) return;
    const url = LAYER_BY_ID[layerId].url as string;
    try {
      const meta = await oidFieldOf(url);
      const fullKey = geomKey(layerId, '1=1', wkid);
      const full = fetchFeats(url, '1=1', wkid, layerId, true);
      const feats = await full;
      if (feats.some((f) => f.oid == null)) return;
      geomCache.set(fullKey, full);
      for (const w of wheres) {
        const m = OID_IN.exec(w);
        if (!m || m[1].toLowerCase() !== meta.oid.toLowerCase()) continue;
        const ids = new Set(m[2].split(',').map((x) => Number(x.trim())).filter(Number.isFinite));
        geomCache.set(geomKey(layerId, w, wkid), Promise.resolve(feats.filter((f) => f.oid != null && ids.has(f.oid))));
      }
    } catch {
      /* ердийн замаар (тус бүрд) — алдааг энд залгина, давхарга бүр өөрөө `failed` болно */
    }
  }));
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
/* ⚠️ 2026-09-30: ДЭД БҮТЦИЙН давхаргын геометр ч энд кэшлэгддэг (57 давхарга) — нэмэх ·
   устгах · хэлбэр засахад сесс дуустал хуучирдаг байв. `DedButets`-ийн бичих зам бүр
   `dropTotalsCache()`-аар дуусдаг (автобусын таг байхгүй) тул тэр эрийг сонсоно. */
subscribeTotals(() => { geomCache.clear(); resultCache.clear(); });

/* ══════════════════════ БАГЦЛАЛТ (2026-10-01) ══════════════════════ */

/**
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): CEO «Газар» KPI нь 295 хүсэлт / 9.3 сек байв —
 *    `execTriage.loadOverlaps` ~50 багц бүрд `overlapLeftParcels`-ийг ЗЭРЭГ дууддаг бөгөөд
 *    тус бүр (а) давхаргын метадата, (б) геометр, (в) нэгж талбартай огтлолцлын 1+ асуулга
 *    явуулдаг байв. Одоо НЭГ мөчид (нэг tick-д) ирсэн дуудлагууд НЭГ БАГЦ болно:
 *      1. геометр — давхарга бүрд нэг удаа (кэш), метадатагүй (`fetchFeats`-ийн ⚠️),
 *         барилгын багцууд нэг татлагаас (`prefetchOidSubsets`);
 *      2. огтлолцол — БҮХ багцын геометрийн НЭГДЛЭЭР серверт (400-аар хэсэглэсэн) → нэр
 *         дэвшигч талбарууд (огтлолцлуудын нэгдэл = нэгдлийн огтлолцол — НИЙТ тоо серверийнх);
 *      3. дэвшигчдийн геометр НЭГ асуулгаар (`objectIds`), багц бүрийн хуваарилалт клиент
 *         талд (`hitsFeat` — ArcGIS-ийн «intersects»: хүрэлцэх ч орно, 1 мм хүлцэл).
 *    Ганц дуудлага (Bagts, PkgProg …) ХУУЧИН замаар — серверийн огтлолцол шууд.
 * ⚠️ Багцын аль ч шатанд алдаа гарвал дуудлага бүрийг ХУУЧИН замаар (тус тусад нь)
 *    дахин ажиллуулна — хурд алдагдана, үр дүн/уналтын зан хэвээр.
 */
type Ask = { sources: Src[]; resolve: (o: Overlap) => void; reject: (e: unknown) => void };
let queue: Ask[] = [];

function overlapUncached(sources: Src[]): Promise<Overlap> {
  return new Promise<Overlap>((resolve, reject) => {
    queue.push({ sources, resolve, reject });
    if (queue.length === 1) {
      setTimeout(() => {
        const b = queue;
        queue = [];
        void runBatch(b);
      }, 0);
    }
  });
}

async function runBatch(b: Ask[]): Promise<void> {
  if (b.length === 1) {
    overlapSingle(b[0].sources).then(b[0].resolve, b[0].reject);
    return;
  }
  let out: Array<{ ok: Overlap } | { err: unknown }>;
  try {
    out = await overlapBatch(b);
  } catch {
    /* ⚠️ Багцын зам унасан — тус бүрд хуучин замаар (үр дүн, уналтын зан ижил) */
    for (const a of b) overlapSingle(a.sources).then(a.resolve, a.reject);
    return;
  }
  out.forEach((r, i) => ('ok' in r ? b[i].resolve(r.ok) : b[i].reject(r.err)));
}

const withFailed = (oids: number[], failed: string[]): Overlap =>
  /* ⚠️ `failed` нь ХООСОН үед талбарыг ОГТ нэмэхгүй — бүрэн тоологдсон үр дүн
     нь өмнөх хэлбэрээрээ үлдэж, дуудагчийн `failed?.length` шалгуур зөв
     ажиллана (кэшлэх эсэхийг `overlapLeftParcels` мөн үүгээр шийднэ). */
  (failed.length ? { oids, failed } : { oids });

const allFailed = (n: number) => new Error(tr('ArcGIS: {0} эх сурвалж бүгд татагдсангүй', n));

/** Эх сурвалжуудын геометр — `parts` нь [кэшийн түлхүүр, объектууд] (нэгдэлд давхардал арилгана) */
async function gather(sources: Src[], wkid: number): Promise<{ parts: Array<[string, Feat[]]>; failed: string[] }> {
  // ⚠️ Зэрэг татна — 57 дэд бүтцийн давхаргыг дараалуулбал секунд хүлээнэ.
  //    Нэг давхарга унасан ч бусад нь үргэлжлэх ёстой (`allSettled`).
  const settled = await Promise.allSettled(sources.map((s) => layerFeats(s, wkid)));
  /*
   * ⚠️ 2026-09-11: УНАСАН ЭХ СУРВАЛЖИЙГ ТООЛНО. `allSettled` дангаараа
   * уналтыг ЧИМЭЭГҮЙ залгидаг тул хагас татагдсан геометрээр бодсон үр дүн
   * «бүрэн» мэт буцдаг байв — файлын толгойн анхааруулга (проекц зөрвөл
   * «саадгүй» гэсэн ХУДАЛ дүгнэлт) яг энэ ангилалд хамаарна. Аль давхарга
   * унасныг НЭРЭЭР нь дамжуулж, дуудагч тал ил хэлэх боломжтой болгоно.
   */
  const parts: Array<[string, Feat[]]> = [];
  const failed: string[] = [];
  settled.forEach((r, i) => {
    const s = sources[i];
    if (r.status === 'rejected') failed.push(s.layerId);
    else parts.push([geomKey(s.layerId, srcWhere(s), wkid), r.value]);
  });
  return { parts, failed };
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
function shapesOf(g: Geoms, wkid: number): Array<[string, string]> {
  const cut = <T,>(a: T[]): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < a.length; i += CHUNK) out.push(a.slice(i, i + CHUNK));
    return out;
  };
  return [
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
}

/**
 * «Бүрэн чөлөөлсөн»-ийн ХУВИЛБАР бичиглэлтэй (цэг · зай · том/жижиг үсэг) дэвшигчдийг хасна.
 *
 * ⚠️ 2026-10-09: `parcelLeftWhere` нь ЯГ таарцын SQL тул «Бүрэн чөлөөлсөн.» гэх мэт мөр
 *    дашбоард дээр (`land.isClearedStatus`) ЧӨЛӨӨЛСӨН, харин давхцалд СААД болж ЗӨРДӨГ байв.
 *    SQL-ээр хэвийншүүлэх найдваргүй (кирилл LOWER/TRIM үйлчилгээ бүрд ялгаатай) тул дэвшигч
 *    OID-уудын төлөвийг асууж клиент талд ижил дүрмээр шүүнэ. Хариунд ирээгүй OID-г ҮЛДЭЭНЭ
 *    (саад гэж үзэх нь «саадгүй» гэсэн худлаас аюулгүй).
 */
async function dropCleared(ids: Set<number>): Promise<Set<number>> {
  if (!ids.size) return ids;
  const oidF = PARCEL_LEFT.oid;
  const all = [...ids];
  const STEP = 500;
  const pages: number[][] = [];
  for (let i = 0; i < all.length; i += STEP) pages.push(all.slice(i, i + STEP));
  const res = await Promise.all(pages.map((p) => post(PARCEL_LEFT.url, {
    objectIds: p.join(','),
    outFields: `${oidF},${PARCEL_LEFT.fields.status}`,
    returnGeometry: 'false',
  })));
  const out = new Set(ids);
  for (const j of res) {
    if (j.exceededTransferLimit) throw new Error(tr('ArcGIS: нэгж талбарын давхцлын жагсаалт бүрэн ирсэнгүй'));
    for (const f of (j.features ?? []) as { attributes?: Record<string, unknown> }[]) {
      const id = Number(f.attributes?.[oidF]);
      if (Number.isFinite(id) && isClearedStatus(f.attributes?.[PARCEL_LEFT.fields.status])) out.delete(id);
    }
  }
  return out;
}

/** Серверийн огтлолцол — хэлбэр бүртэй огтлолцох ҮЛДСЭН нэгж талбарын OID-ууд */
async function askLeft(shapes: Array<[string, string]>, wkid: number): Promise<Set<number>> {
  // ⚠️ `N'…'` угтвар — талбар нь Unicode (nvarchar); зарим үйлчилгээнд
  //    угтваргүй кирилл харьцуулалт ХООСОН буцаадаг.
  const leftWhere = parcelLeftWhere();
  const res = await Promise.all(shapes.map(([geometryType, geometry]) => post(PARCEL_LEFT.url, {
    geometry,
    geometryType,
    spatialRel: 'esriSpatialRelIntersects',
    inSR: String(wkid),
    where: leftWhere,
    returnIdsOnly: 'true',
  })));
  /* ⚠️ 2026-09-25: ID-ийн асуулга ч хязгаарт хүрвэл ДУТУУ жагсаалт буцна —
     «саад цөөн» гэсэн худал тоо өгөхийн оронд алдаа (кэшлэгдэхгүй). */
  if (res.some((r) => r?.exceededTransferLimit)) {
    throw new Error(tr('ArcGIS: нэгж талбарын давхцлын жагсаалт бүрэн ирсэнгүй'));
  }
  const left = new Set<number>();
  for (const r of res) for (const id of (r.objectIds ?? []) as number[]) left.add(id);
  return left;
}

/** ХУУЧИН ЗАМ — нэг дуудлага, серверийн огтлолцол шууд */
async function overlapSingle(sources: Src[]): Promise<Overlap> {
  const wkid = await parcelSR();
  const { parts, failed } = await gather(sources, wkid);
  /* ⚠️ БҮГД унасан бол энэ нь үр дүн БИШ, АЛДАА — хоосон `oids` нь «саад
     алга» гэж уншигдах тул шидэж, дуудагчийн `catch` замд оруулна. */
  if (failed.length === sources.length) throw allFailed(failed.length);
  const shapes = shapesOf(toGeoms(parts.flatMap(([, fs]) => fs)), wkid);
  /* ⚠️ Геометр огт гараагүй ч УНАСАН давхарга байвал түүнийг дамжуулна —
     эс бөгөөс «хэлбэр алга» нь «саад алга» гэж ХУДАЛ уншигдана. */
  if (!shapes.length) return withFailed([], failed);
  /* ⚠️ 2026-10-09: чөлөөлсөн-ий хувилбар бичиглэлийг хасна (`dropCleared`) */
  return withFailed([...await dropCleared(await askLeft(shapes, wkid))], failed);
}

/**
 * Дэвшигч нэгж талбаруудын БҮТЭН геометр (ерөнхийлөлтгүй — сервер ч бүтнээр тулгадаг).
 * ⚠️ 2026-10-09: төлөвийг ХАМТ авч «Бүрэн чөлөөлсөн»-ий хувилбар бичиглэлтэйг ХАСНА
 *    (`dropCleared`-ийн дүрэм — багцын зам нэмэлт хүсэлтгүй).
 */
async function parcelRings(ids: number[], wkid: number): Promise<Map<number, number[][][]>> {
  const oidF = PARCEL_LEFT.oid;
  const out = new Map<number, number[][][]>();
  const cleared = new Set<number>();
  const STEP = 500;
  const pages: number[][] = [];
  for (let i = 0; i < ids.length; i += STEP) pages.push(ids.slice(i, i + STEP));
  const res = await Promise.all(pages.map((p) => post(PARCEL_LEFT.url, {
    objectIds: p.join(','),
    outFields: `${oidF},${PARCEL_LEFT.fields.status}`,
    returnGeometry: 'true',
    outSR: String(wkid),
  })));
  for (const j of res) {
    if (j.exceededTransferLimit) throw new Error(tr('ArcGIS: нэгж талбарын давхцлын жагсаалт бүрэн ирсэнгүй'));
    for (const f of (j.features ?? []) as { attributes?: Record<string, unknown>; geometry?: { rings?: number[][][] } }[]) {
      const id = Number(f.attributes?.[oidF]);
      if (!Number.isFinite(id)) continue;
      if (isClearedStatus(f.attributes?.[PARCEL_LEFT.fields.status])) cleared.add(id);
      else if (f.geometry?.rings?.length) out.set(id, f.geometry.rings);
    }
  }
  /* ⚠️ Дэвшигч дутвал хуваарилалт ДУТУУ болно — алдаа (дуудагч хуучин зам руу шилжинэ) */
  if (ids.some((id) => !out.has(id) && !cleared.has(id))) throw new Error(tr('ArcGIS: нэгж талбарын давхцлын жагсаалт бүрэн ирсэнгүй'));
  return out;
}

async function overlapBatch(b: Ask[]): Promise<Array<{ ok: Overlap } | { err: unknown }>> {
  const wkid = await parcelSR();
  await prefetchOidSubsets(b, wkid);
  const per = await Promise.all(b.map((a) => gather(a.sources, wkid)));
  /* НЭГДЭЛ — ижил давхарга/шүүлт олон дуудлагад байвал нэг л удаа */
  const uniq = new Map<string, Feat[]>();
  for (const p of per) for (const [k, fs] of p.parts) uniq.set(k, fs);
  const shapes = shapesOf(toGeoms([...uniq.values()].flat()), wkid);
  const cand = shapes.length ? await askLeft(shapes, wkid) : new Set<number>();
  const parcels = cand.size ? await parcelRings([...cand], wkid) : new Map<number, number[][][]>();
  const pList = [...parcels].map(([id, rings]) => ({ id, rings, bb: bboxOf(rings) }));
  /* ⚠️ Хүлцэл: проекцтой (метр) координатад 1 мм (ArcGIS-ийн анхдагч XY tolerance),
     градусад 1e-8 — `wkid`-ээс биш координатаас (сервер `outSR`-оор буцаасан) */
  const eps = pList.length && Math.abs(pList[0].rings[0]?.[0]?.[0] ?? 1e6) <= 360 ? 1e-8 : 1e-3;
  return b.map((a, i) => {
    const p = per[i];
    if (p.failed.length === a.sources.length) return { err: allFailed(p.failed.length) };
    const feats = p.parts.flatMap(([, fs]) => fs);
    if (!feats.length || !pList.length) return { ok: withFailed([], p.failed) };
    const fx = feats.map((f) => ({ f, bb: featBox(f) }));
    const oids = pList
      .filter((q) => fx.some(({ f, bb }) => boxHit(q.bb, bb, eps) && hitsFeat(q.rings, q.bb, f, eps)))
      .map((q) => q.id);
    return { ok: withFailed(oids, p.failed) };
  });
}

/* ══════════════ Клиент талын «intersects» — зөвхөн БАГЦЫН хуваарилалтад ══════════════ */

type Box = [number, number, number, number];

function bboxOf(rings: number[][][]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rings) {
    for (const [x, y] of r) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return [x0, y0, x1, y1];
}

const featBox = (f: Feat): Box => (f.rings ? bboxOf(f.rings) : f.paths ? bboxOf(f.paths) : f.pt ? [f.pt[0], f.pt[1], f.pt[0], f.pt[1]] : [Infinity, Infinity, -Infinity, -Infinity]);

const boxHit = (a: Box, b: Box, e: number) => a[0] <= b[2] + e && b[0] <= a[2] + e && a[1] <= b[3] + e && b[1] <= a[3] + e;

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** p цэг [a,b] хэрчмээс ≤ e зайд уу (хүрэлцэх = огтлолцох) */
function nearSeg(ax: number, ay: number, bx: number, by: number, px: number, py: number, e: number): boolean {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy <= e * e;
}

function segHit(a: number[], b: number[], c: number[], d: number[], e: number): boolean {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]);
  const o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  const o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]);
  const o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  return nearSeg(a[0], a[1], b[0], b[1], c[0], c[1], e) || nearSeg(a[0], a[1], b[0], b[1], d[0], d[1], e)
    || nearSeg(c[0], c[1], d[0], d[1], a[0], a[1], e) || nearSeg(c[0], c[1], d[0], d[1], b[0], b[1], e);
}

/** Цэг полигон ДОТОР уу — бүх цагиргаар even-odd (нүх зөв тооцогдоно) */
function inRings(rings: number[][][], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Хэрчмүүдийн (цагираг/шугам) аль нэг нь нэгж талбарын хилтэй огтлолцох/хүрэлцэх уу */
function edgesHit(parcel: number[][][], pbb: Box, line: number[][], e: number): boolean {
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1], b = line[i];
    if (Math.max(a[0], b[0]) < pbb[0] - e || Math.min(a[0], b[0]) > pbb[2] + e
      || Math.max(a[1], b[1]) < pbb[1] - e || Math.min(a[1], b[1]) > pbb[3] + e) continue;
    for (const r of parcel) for (let k = 1; k < r.length; k += 1) if (segHit(a, b, r[k - 1], r[k], e)) return true;
  }
  return false;
}

function onBoundary(rings: number[][][], x: number, y: number, e: number): boolean {
  for (const r of rings) for (let k = 1; k < r.length; k += 1) {
    if (nearSeg(r[k - 1][0], r[k - 1][1], r[k][0], r[k][1], x, y, e)) return true;
  }
  return false;
}

/**
 * ArcGIS `esriSpatialRelIntersects`-тэй ижил утга: дотор, хилээр хүрэлцэх, давхцах — бүгд «тийм».
 * ⚠️ Хил огтлолцохгүй бол нэг нь нөгөөгөө бүхэлд нь агуулна эсвэл салангид — тиймээс
 *    нэг оройг шалгахад хангалттай.
 */
function hitsFeat(parcel: number[][][], pbb: Box, f: Feat, e: number): boolean {
  if (f.pt) return inRings(parcel, f.pt[0], f.pt[1]) || onBoundary(parcel, f.pt[0], f.pt[1], e);
  if (f.paths) {
    for (const p of f.paths) {
      if (!p.length) continue;
      if (edgesHit(parcel, pbb, p, e)) return true;
      if (inRings(parcel, p[0][0], p[0][1])) return true;
    }
    return false;
  }
  if (f.rings) {
    for (const r of f.rings) if (edgesHit(parcel, pbb, r, e)) return true;
    /* ⚠️ 2026-10-09: ОЛОН хэсэгтэй нэгж талбарын ЦАГИРАГ БҮРИЙН эхний оройг шалгана — урьд нь
       зөвхөн `parcel[0][0]` тул эхний хэсэг гадна, бусад хэсэг эх полигон дотор бол алдагддаг байв. */
    for (const pr of parcel) {
      const v = pr[0];
      if (v && inRings(f.rings, v[0], v[1])) return true;        // нэгж талбар эх полигон дотор
    }
    for (const r of f.rings) if (r.length && inRings(parcel, r[0][0], r[0][1])) return true; // эх нь нэгж талбар дотор
  }
  return false;
}
