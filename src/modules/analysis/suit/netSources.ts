/**
 * ХАРЬЦУУЛАХ 3 ЗАМЫН СҮЛЖЭЭНИЙ БҮРТГЭЛ — «ажлын талбар».
 *
 * Зорилго: хэрэглэгч замын line (ArcGIS давхарга) өгмөгц ШУУД ажиллах. Line
 * ирэхэд зөвхөн доорх `url`-ыг бөглөнө — бусад код (хөдөлгүүр, зуралт, эрэлт)
 * өөрчлөгдөхгүй.
 *
 * ГУРВАН СҮЛЖЭЭ (тус тусдаа, өөр үзүүлэлттэй):
 *   · real   — одоо газрын гадарга дээрх БОДИТ зам
 *   · plan   — ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨНИЙ зам
 *   · relief — төлөвлөгөөт замтай холбогдож АЧААЛЛЫГ БУУРУУЛАХ зорилготой зам
 *
 * ⚠️ ХАРЬЦУУЛАЛТЫН ГОЛ ЗАРЧИМ: гурвуулаа ИЖИЛ эрэлтээр (ижил тооны машин),
 * ижил тээврийн холимогоор ажиллана — эс бөгөөс «шинэ зам ачааллыг бууруулж
 * байна уу» гэсэн асуултад шударгаар хариулж чадахгүй. Тиймээс эрэлтийн тоо
 * (`peakCars`) ба тээврийн холимог сүлжээнээс ХАМААРАХГҮЙ, гаднаас нэг утгаар
 * өгөгдөнө.
 *
 * ⚠️ Геометр 3 сүлжээ бүрд ArcGIS line-аас ирнэ; гэрлэн дохио нь ЗӨВХӨН БОДИТ
 * `gerlen_dohio` service-ээс (`loadRealSignalsCached`) БҮГДЭД нь ижил наагдана.
 * Дүрмийн (synthesize) ба OSM дохио ХАСАГДСАН — зөвхөн service-ээр шийднэ.
 */

import { LAYER_BY_ID, layerUrl } from '@/lib/services';
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
};

/**
 * ⚠️ URL-ууд хараахан ХООСОН (`null`) — хэрэглэгч line өгөөгүй. `plan` нь одоо
 * ажиллаж буй et:5-д түр холбогдсон тул өнөөдөр ч ажиллана. `real`/`relief`
 * line ирэхэд `url`-ыг нь бөглөхөд шууд идэвхжинэ.
 */
export const NET_SOURCES: Record<NetKind, NetSource> = {
  real: {
    kind: 'real',
    label: 'Одоогийн бодит зам',
    short: 'Бодит',
    hue: '#38bdf8',
    // ① Одоогийн бодит замын line (Monmap_zam_selbe, 113 feature, polyline).
    //    Гэрлэн дохио нь бодит gerlen_dohio service-ээс; геометр энэ давхаргаас.
    url: 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/Monmap_zam_selbe/FeatureServer/0',
    nodeIntersections: true, // ⚠️ урт шугам уулзвар гатална — таслахгүй бол сүлжээ бутарна
    directed: true, // ⚠️ line сумтай — машин зөвхөн тэр зүг явна
  },
  plan: {
    kind: 'plan',
    label: 'Ерөнхий төлөвлөгөөний зам',
    short: 'Төлөвлөгөө',
    hue: '#a78bfa',
    // ② Ерөнхий төлөвлөгөөний машин явах line (selbe_zam_tuluwlult, 205 feature).
    //    et:5 «Замын тэнхлэг»-ийг СОЛЬСОН: энэ нь машин явахаар зурсан жинхэнэ line.
    url: 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_zam_tuluwlult/FeatureServer/0',
    nodeIntersections: true, // ⚠️ таслахгүй бол 3.7% холбогдоно; таславал 88.9%
    directed: true, // line сумтай — 141 мухар бүгд 60м дотор гарцтай (тасралтгүй)
  },
  relief: {
    kind: 'relief',
    label: 'Ачаалал бууруулах зам',
    short: 'Шинэ зам',
    hue: '#4ade80',
    url: null, // TODO(line): төлөвлөгөөт замтай холбогдох замын ArcGIS line URL
  },
};

/** Сүлжээ холбогдсон эсэх (line эсвэл каталогийн давхарга бэлэн үү). */
export function isNetReady(kind: NetKind): boolean {
  const s = NET_SOURCES[kind];
  return !!(s.url || (s.layerId && LAYER_BY_ID[s.layerId]));
}

/** Эх сурвалжийн бодит query URL — url давуу, эс бөгөөс каталогийн давхарга. */
function sourceUrl(s: NetSource): string {
  if (s.url) return s.url;
  if (s.layerId) {
    const def = LAYER_BY_ID[s.layerId];
    if (def) return layerUrl(def);
  }
  throw new Error(
    `«${s.label}» замын line хараахан холбогдоогүй — netSources.ts-д url оруулна уу.`,
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
    p = Promise.all([
      loadPathsFrom(sourceUrl(src)),
      loadRealSignalsCached().catch(() => [] as SignalDef[]), // service унавал дохиогүй
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
        // ⚠️ ДАВХАРДСАН шугамууд (нэг гудамжийг хоёр line-аар зурсан) дээр машин
        //    явуулбал хоёр жагсаа бие бие дээрээ зурагдана — тэднийг тэмдэглэж
        //    урсгалаас хасна (ирмэгийг устгахгүй тул холболт хэвээр).
        const dup = markDuplicates(net);
        if (dup) console.info(`[selbe] «${src.label}»: давхардсан ${dup}/${net.edges.length} ирмэгийг урсгалаас хасав`);
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
  'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/gerlen_dohio/FeatureServer/0';

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
  const r: { features?: SignalFeature[]; error?: { message?: string } } =
    await fetch(`${SIGNAL_LAYER_URL}/query?${q}`).then((x) => x.json());
  if (r.error) throw new Error(r.error.message ?? 'гэрлэн дохио query алдаа');

  /** Уулзвар бүрийн оройнууд ба approach line-ууд (бүлэгтэй) */
  const groups = new Map<string, { pts: Pt[]; lines: SignalLine[] }>();
  for (const f of r.features ?? []) {
    const name = String(f.attributes.uulzwar_name ?? '');
    const code = Number(f.attributes.gerlen_dohio_code);
    const path = f.geometry?.paths?.[0];
    if (!path || path.length < 2) continue;
    let g = groups.get(name);
    if (!g) { g = { pts: [], lines: [] }; groups.set(name, g); }
    for (const p of path) g.pts.push(p as Pt);
    // ⚠️ ТҮҮХИЙ кодыг хадгална — ээлжид хуваарилах нь ЗОХИЦУУЛАЛТЫН ХӨТӨЛБӨРИЙН
    //    ажил (`SignalPlan`). Ингэснээр хэрэглэгч хөтөлбөр солиход сүлжээг
    //    дахин татах/угсрах шаардлагагүй.
    g.lines.push({ pts: path.map((p) => p as Pt), code });
  }

  const out: SignalDef[] = [];
  for (const g of groups.values()) {
    if (!g.pts.length) continue;
    const cx = g.pts.reduce((s, p) => s + p[0], 0) / g.pts.length;
    const cy = g.pts.reduce((s, p) => s + p[1], 0) / g.pts.length;
    out.push({ pt: [cx, cy], lines: g.lines });
  }
  return out;
}
