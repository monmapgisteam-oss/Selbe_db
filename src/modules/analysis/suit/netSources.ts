/**
 * ХАРЬЦУУЛАХ ЗАМЫН СҮЛЖЭЭНИЙ БҮРТГЭЛ — «ажлын талбар».
 *
 * Зорилго: хэрэглэгч замын line (ArcGIS давхарга) өгмөгц ШУУД ажиллах. Line
 * ирэхэд зөвхөн доорх `url`-ыг бөглөнө — бусад код (хөдөлгүүр, зуралт, эрэлт)
 * өөрчлөгдөхгүй.
 *
 * ДӨРВӨН СҮЛЖЭЭ (тус тусдаа, өөр үзүүлэлттэй):
 *   · real   — одоо газрын гадарга дээрх БОДИТ зам
 *   · plan   — ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨНИЙ зам
 *   · relief — АЧААЛЛЫГ БУУРУУЛАХ шинэ замын санал (одоогоор зөвхөн харагдана)
 *   · test   — ТУРШИЛТЫН талбар: дурын line-ыг түр холбож шалгах
 *
 * ⚠️ ХАРЬЦУУЛАЛТЫН ГОЛ ЗАРЧИМ: бүгд ИЖИЛ эрэлтээр (ижил тооны машин),
 * ижил тээврийн холимогоор ажиллана — эс бөгөөс «шинэ зам ачааллыг бууруулж
 * байна уу» гэсэн асуултад шударгаар хариулж чадахгүй. Тиймээс эрэлтийн тоо
 * (`peakCars`) ба тээврийн холимог сүлжээнээс ХАМААРАХГҮЙ, гаднаас нэг утгаар
 * өгөгдөнө.
 *
 * ⚠️ Геометр сүлжээ бүрд ArcGIS line-аас ирнэ; гэрлэн дохио нь ЗӨВХӨН БОДИТ
 * `gerlen_dohio` service-ээс (`loadRealSignalsCached`) БҮГДЭД нь ижил наагдана.
 * Дүрмийн (synthesize) ба OSM дохио ХАСАГДСАН — зөвхөн service-ээр шийднэ.
 */

import { LAYER_BY_ID, layerUrl } from '@/lib/services';
import { agsToken } from '@/lib/agsToken';
import { t as tr } from '@/lib/i18nCore';
import {
  buildNetwork, markDuplicates, nodeByIntersection,
  type Network, type Pt, type SignalDef, type SignalLine,
} from './traffic';
import { loadPathsFrom, WM_UNITS_PER_M } from './roadNet';

export type NetKind = 'real' | 'plan' | 'relief';

export const NET_KINDS: NetKind[] = ['real', 'plan', 'relief'];

export type NetSource = {
  kind: NetKind;
  /** Самбар/легендэд харагдах бүтэн нэр */
  label: string;
  /** Сонгогч товчны богино нэр */
  short: string;
  /** Дүрслэлийн өнгө (сонгогч, легенд) */
  hue: string;
  /**
   * ArcGIS line давхаргын БҮТЭН URL (`…/FeatureServer/<n>`).
   * ⚠️ Line ирэхэд ЗӨВХӨН ЭНД бөглөнө. `null` бол сүлжээ хараахан холбогдоогүй.
   */
  url: string | null;
  /**
   * Каталогийн id-аар авах хувилбар (`url`-гүй үед). Одоо ажиллаж буй
   * төлөвлөгөөт зам = et:5 «Замын тэнхлэг» — түүнийг энэ замаар холбоно.
   */
  layerId?: string;
  /**
   * Геометрийн огтлолцол дээр таслах уу (`nodeByIntersection`).
   * ⚠️ Тасраагүй урт шугамтай эх сурвалжид ЗААВАЛ (жиш. `Monmap_zam` бодит зам):
   * үгүй бол уулзварыг гатлах шугам сүлжээг бутаргаж, машин гацна. `et:5` мэтийн
   * аль хэдийн тасарсан CAD-д ХЭРЭГГҮЙ (илүүц, удаан).
   */
  nodeIntersections?: boolean;
  /**
   * ЧИГЛЭЛТЭЙ сүлжээ юу — машин зөвхөн шугамын сум (дижитал дараалал) дагуу явна.
   * ⚠️ Бодит замын line сумтай тул `real` = true. `et:5` CAD чиглэлгүй тул false.
   */
  directed?: boolean;
  /**
   * Энэ сүлжээн дээр МАШИН ЯВАХ уу. `false` бол зөвхөн газрын зурагт харагдана.
   *
   * ⚠️ «Шинэ зам» нь одоогоор ЗӨВХӨН ХАРАГДАНА: түүний line (`Selbe_shine_zam`)
   * нь одоо байгаа замтай хараахан ХОЛБОГДООГҮЙ тусдаа хэсгүүд тул тэнд машин
   * явуулбал мухарт гацаж, бодит бус дүр зурна. Замын сүлжээ нь бодит/төлөвлөгөөт
   * замтай уулзвараар холбогдмол цагт `cars` -ыг `true` болгоно.
   */
  cars?: boolean;
  /**
   * ДАВХАРДСАН шугамыг урсгалаас хасах уу (анхдагч — тийм).
   *
   * ⚠️ `false` бол бие бие дээрээ хэвтэх шугамууд БҮГД ажиллана. Энэ нь
   * ЭРГЭЛТИЙН ЗУРВАС зурсан өгөгдөлд ЗААВАЛ хэрэгтэй: тэнд баруун/зүүн эргэх
   * хөдөлгөөнийг тусад нь шугамаар зурдаг бөгөөд тэдгээр нь голч замын дээгүүр
   * давхарлан хэвтдэг. Хасвал эргэлт бүр хаагдана — `Monmap_zam_update_SL`
   * дээр 7.4 км (нийтийн 18%) зам ингэж хаагдаж, машин зүүн эргэж чадахгүй
   * байв.
   * ⚠️ Харин НЭГ гудамжийг санамсаргүй хоёр удаа зурсан өгөгдөлд (бодит зам)
   * хасалт ХЭРЭГТЭЙ — тэнд хоёр жагсаа бие бие дээрээ зурагдана.
   */
  dedupe?: boolean;
  /**
   * Line ирээгүй үед товчны tooltip-д харуулах ЗААВАР.
   * ⚠️ «Хараахан ирээгүй» гэдэг нь хэрэглэгчид ЮУ ХИЙХИЙГ хэлдэггүй — туршилтын
   * сүлжээнд хаягийг хаанаас өгөхийг зааж өгнө.
   */
  note?: string;
  /**
   * Энэ сүлжээг сонгоход АВТОМАТААР асах газрын зургийн давхаргууд
   * (`MAP_LAYERS[].key`). Машингүй сүлжээ зөвхөн эдгээрээр харагдана.
   */
  display?: string[];
};

/**
 * ⚠️ URL-ууд хараахан ХООСОН (`null`) — хэрэглэгч line өгөөгүй. `plan` нь одоо
 * ажиллаж буй et:5-д түр холбогдсон тул өнөөдөр ч ажиллана. `real`/`relief`
 * line ирэхэд `url`-ыг нь бөглөхөд шууд идэвхжинэ.
 */
export const NET_SOURCES: Record<NetKind, NetSource> = {
  real: {
    kind: 'real',
    label: tr('Одоогийн бодит зам'),
    short: tr('Бодит'),
    hue: '#38bdf8',
    // ① Одоогийн бодит замын line (Monmap_zam_selbe, 113 feature, polyline).
    //    Гэрлэн дохио нь бодит gerlen_dohio service-ээс; геометр энэ давхаргаас.
    // test_data [98] monmap_road_simulation — 2026-08-13 шилжив (113 feature)
    url: 'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services/test_data/FeatureServer/98',
    nodeIntersections: true, // ⚠️ урт шугам уулзвар гатална — таслахгүй бол сүлжээ бутарна
    directed: true, // ⚠️ line сумтай — машин зөвхөн тэр зүг явна
  },
  plan: {
    kind: 'plan',
    label: tr('Ерөнхий төлөвлөгөөний зам'),
    short: tr('Төлөвлөгөө'),
    hue: '#a78bfa',
    // ② Ерөнхий төлөвлөгөөний машин явах line (selbe_zam_tuluwlult, 205 feature).
    //    et:5 «Замын тэнхлэг»-ийг СОЛЬСОН: энэ нь машин явахаар зурсан жинхэнэ line.
    // test_data [104] ET_road_simulation — 2026-08-13 шилжив (205 feature)
    url: 'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services/test_data/FeatureServer/104',
    nodeIntersections: true, // ⚠️ таслахгүй бол 3.7% холбогдоно; таславал 88.9%
    directed: true, // line сумтай — 141 мухар бүгд 60м дотор гарцтай (тасралтгүй)
  },
  relief: {
    kind: 'relief',
    label: tr('Ачаалал бууруулах зам'),
    short: tr('Шинэ зам'),
    hue: '#4ade80',
    /* ⚠️ Замын сүлжээ болгож УГСАРДАГГҮЙ (`cars: false`) — line нь `Selbe_shine_zam`
       service дээр 4 тусдаа хэсэг (77 объект) бөгөөд одоо байгаа замтай уулзвараар
       холбогдоогүй. Тиймээс энд `url` хэрэггүй: сонгоход доорх давхаргууд асаж,
       шинэ замын саналыг газрын зураг дээр харуулна. */
    url: null,
    cars: false,
    display: ['sz:0', 'sz:1', 'sz:2', 'sz:3'],
  },
};

/**
 * Сүлжээ СОНГОХОД БЭЛЭН үү — line ирсэн эсвэл ядаж харуулах давхаргатай юу.
 * ⚠️ Машингүй (`cars: false`) сүлжээ ч БЭЛЭН тооцогдоно: түүнийг сонгоход
 * газрын зураг дээр line нь харагдана (машин зөвхөн явдаг сүлжээнд гүйнэ).
 */
export function isNetReady(kind: NetKind): boolean {
  const s = NET_SOURCES[kind];
  if (s.display?.length) return true;
  return !!(s.url || (s.layerId && LAYER_BY_ID[s.layerId]));
}

/** Энэ сүлжээн дээр машин явах уу (анхдагч — тийм). */
export function netHasCars(kind: NetKind): boolean {
  return NET_SOURCES[kind].cars !== false;
}

/** Эх сурвалжийн бодит query URL — url давуу, эс бөгөөс каталогийн давхарга. */
function sourceUrl(s: NetSource): string {
  if (s.url) return s.url;
  if (s.layerId) {
    const def = LAYER_BY_ID[s.layerId];
    if (def) return layerUrl(def);
  }
  throw new Error(
    tr('«{0}» замын line хараахан холбогдоогүй — netSources.ts-д url оруулна уу.', s.label),
  );
}

/** Сүлжээ бүрийн ГЕОМЕТР кэш (ирмэг индекс тогтвортой байх ёстой тул нэг удаа). */
const cache = new Map<NetKind, Promise<Network>>();

/**
 * Сонгосон сүлжээг НЭГ УДАА татаж кэшлэнэ (геометр + гэрлэн дохио).
 *
 * ⚠️ `baseLoad` (эрэлтийн жин) энд оноогдохгүй — тэр нь бүсийн өгөгдлөөс
 * хамаардаг тул дуудагч тал `assignLoads(net, rows)`-ыг ӨӨРӨӨ дуудна
 * (`roadNet.ts`), яг одоогийн et:5-ийн урсгалтай ижил.
 */
export function loadNetworkCached(kind: NetKind): Promise<Network> {
  let p = cache.get(kind);
  if (!p) {
    const src = NET_SOURCES[kind];
    // Геометрийг ArcGIS line-аас, гэрлэн дохиог ЗӨВХӨН бодит service-ээс.
    // ⚠️ Дохионы service унавал ЧИМЭЭГҮЙ дохиогүй угсрагддаг байсан — warn бичиж,
    //    Network.signalsFailed тугаар UI-д мэдэгдэх боломж үлдээнэ.
    let signalsFailed = false;
    p = Promise.all([
      loadPathsFrom(sourceUrl(src)),
      loadRealSignalsCached().catch((e) => { // service унавал дохиогүй
        signalsFailed = true;
        console.warn('[selbe] Гэрлэн дохио ачаалагдсангүй — ДОХИОГҮЙ симуляц (page reload хүртэл):', e);
        return [] as SignalDef[];
      }),
    ])
      .then(([paths, signals]) => {
        // ⚠️ Огтлолцол дээр таслах — тасраагүй урт шугамтай эх сурвалжид
        const geom = src.nodeIntersections
          ? nodeByIntersection(paths, { unitsPerMeter: WM_UNITS_PER_M })
          : paths;
        const net = buildNetwork(geom, {
          unitsPerMeter: WM_UNITS_PER_M,
          signals,
          directed: src.directed,
        });
        /* ⚠️ ДАВХАРДСАН шугамууд (нэг гудамжийг хоёр line-аар зурсан) дээр машин
           явуулбал хоёр жагсаа бие бие дээрээ зурагдана — тэднийг тэмдэглэж
           урсгалаас хасна (ирмэгийг устгахгүй тул холболт хэвээр).
           ⚠️ `dedupe: false` бол АЛГАСНА — эргэлтийн зурвас зурсан өгөгдөлд
           давхарлал нь ЗӨВ бөгөөд хасвал эргэлт бүр хаагдана. */
        if (src.dedupe === false) {
          console.info(`[selbe] «${src.label}»: давхардлын шүүлт УНТРААЛТТАЙ (эргэлтийн зурвас)`);
        } else {
          const dup = markDuplicates(net);
          if (dup) console.info(`[selbe] «${src.label}»: давхардсан ${dup}/${net.edges.length} ирмэгийг урсгалаас хасав`);
        }
        if (signalsFailed) net.signalsFailed = true;
        return net;
      })
      .catch((e) => { cache.delete(kind); throw e; });
    cache.set(kind, p);
  }
  return p;
}

/* ══════════════════ Бодит гэрлэн дохио ══════════════════ */

/** `gerlen_dohio` FeatureServer — уулзвар бүр 4 line (approach), code 1-4. */
const SIGNAL_LAYER_URL =
  // test_data [103] gerlen_dohio — 2026-08-13 шилжив (талбарууд ижил)
  'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services/test_data/FeatureServer/103';

let signalCache: Promise<SignalDef[]> | null = null;

/**
 * Бодит гэрлэн дохионы уулзваруудыг НЭГ УДАА татаж кэшлэнэ.
 *
 * ⚠️ Дата бүтэц: уулзвар бүр (`uulzwar_name`) 4 approach line, тус бүр
 * `gerlen_dohio_code` 1–4. Codes **1,3 = нэг тэнхлэг**, **2,4 = нөгөө** — 30 сек
 * тутам ногоон↔улаан солигдоно. Line-ийн ЧИГЛЭЛ нь тухайн approach-ийн тэнхлэг
 * (босоо=N-S, хэвтээ=E-W) тул codes 1,3-ын тэнхлэг = эхний ногоон (`green0`).
 *
 * Уулзварын ТӨВ = 4 line-ийн бүх оройн дундаж (≈ уулзварын зангилаа).
 */
export function loadRealSignalsCached(): Promise<SignalDef[]> {
  if (!signalCache) {
    signalCache = fetchRealSignals().catch((e) => { signalCache = null; throw e; });
  }
  return signalCache;
}

type SignalFeature = {
  attributes: { uulzwar_name?: string | null; gerlen_dohio_code?: number | null };
  geometry?: { paths?: number[][][] };
};

async function fetchRealSignals(): Promise<SignalDef[]> {
  const q = new URLSearchParams({
    where: '1=1',
    outFields: 'uulzwar_name,gerlen_dohio_code',
    returnGeometry: 'true',
    outSR: '3857',
    f: 'json',
  });
  // ⚠️ 2026-08-24 «Organization» хуваалцалт — нэвтэрсэн бол token нэмнэ
  const tok = await agsToken();
  const auth = tok ? `&token=${encodeURIComponent(tok)}` : '';
  const r: { features?: SignalFeature[]; error?: { message?: string } } =
    await fetch(`${SIGNAL_LAYER_URL}/query?${q}${auth}`).then((x) => x.json());
  if (r.error) throw new Error(r.error.message ?? tr('гэрлэн дохио query алдаа'));

  /** Уулзвар бүрийн оройнууд ба approach line-ууд (бүлэгтэй) */
  const groups = new Map<string, { pts: Pt[]; lines: SignalLine[] }>();
  let skipped = 0;
  for (const f of r.features ?? []) {
    const name = String(f.attributes.uulzwar_name ?? '').trim();
    const code = Number(f.attributes.gerlen_dohio_code);
    const path = f.geometry?.paths?.[0];
    if (!path || path.length < 2) continue;
    /* ⚠️ БӨГЛӨГДӨӨГҮЙ мөрийг АЛГАСНА (нэр эсвэл код хоосон).
       Ийм мөр эх өгөгдөлд байдаг — зураасаа татчихаад атрибутаа хойшлуулсан.
       Хамгаалалтгүй бол код 0 болж НЭГ Ч ЭЭЛЖИД ороогүй зогсолтын шугам үүсээд
       тэр чиглэлийн машин МӨНХӨД улаанд зогсоно; нэргүй тул хуваарь ч
       сонгогдохгүй. Атрибутыг дүүргэмэгц өөрөө орж ирнэ. */
    if (!name || !Number.isFinite(code) || code <= 0) { skipped++; continue; }
    let g = groups.get(name);
    if (!g) { g = { pts: [], lines: [] }; groups.set(name, g); }
    for (const p of path) g.pts.push(p as Pt);
    // ⚠️ ТҮҮХИЙ кодыг хадгална — ээлжид хуваарилах нь ЗОХИЦУУЛАЛТЫН ХӨТӨЛБӨРИЙН
    //    ажил (`SignalPlan`). Ингэснээр хэрэглэгч хөтөлбөр солиход сүлжээг
    //    дахин татах/угсрах шаардлагагүй.
    // ⚠️ Уулзварын НЭРИЙГ зураас бүрд наана: код уулзвар бүрд 1-ээс эхэлдэг тул
    //    хуваарийг нэрээр нь ялгана (`SignalPlan.byJunction`).
    g.lines.push({ pts: path.map((p) => p as Pt), code, j: name });
  }

  if (skipped) {
    console.warn(
      `[selbe] гэрлэн дохио: ${skipped} мөр атрибутгүй (uulzwar_name/gerlen_dohio_code хоосон) — алгасав`,
    );
  }

  const out: SignalDef[] = [];
  for (const [name, g] of groups) {
    if (!g.pts.length) continue;
    const cx = g.pts.reduce((s, p) => s + p[0], 0) / g.pts.length;
    const cy = g.pts.reduce((s, p) => s + p[1], 0) / g.pts.length;
    out.push({ pt: [cx, cy], lines: g.lines, name });
  }
  return out;
}
