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
 */

import { LAYER_BY_ID, layerUrl, SELBE_ET } from '@/lib/services';
import { arcgisPost, type ArcgisBody } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import {
  buildNetwork, markDuplicates, nodeByIntersection,
  type Network, type Pt, type SignalDef, type SignalLine,
} from './traffic';
import { loadPathsFrom, WM_UNITS_PER_M } from './roadNet';

export type NetKind = 'real' | 'plan';

export const NET_KINDS: NetKind[] = ['real', 'plan'];

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
   */
  url: string | null;
  /**
   * Каталогийн id-аар авах хувилбар (`url`-гүй үед). Одоо ажиллаж буй
   * төлөвлөгөөт зам = et:5 «Замын тэнхлэг» — түүнийг энэ замаар холбоно.
   */
  layerId?: string;
  /**
   * Геометрийн огтлолцол дээр таслах уу (`nodeByIntersection`).
   */
  nodeIntersections?: boolean;
  /**
   * ЧИГЛЭЛТЭЙ сүлжээ юу — машин зөвхөн шугамын сум (дижитал дараалал) дагуу явна.
   */
  directed?: boolean;
  /**
   * Энэ сүлжээн дээр МАШИН ЯВАХ уу. `false` бол зөвхөн газрын зурагт харагдана.
   */
  cars?: boolean;
  /**
   * ДАВХАРДСАН шугамыг урсгалаас хасах уу (анхдагч — тийм).
   */
  dedupe?: boolean;
  /**
   * Line ирээгүй үед товчны tooltip-д харуулах ЗААВАР.
   */
  note?: string;
  /**
   * Энэ сүлжээг сонгоход АВТОМАТААР асах газрын зургийн давхаргууд
   * (`MAP_LAYERS[].key`). Машингүй сүлжээ зөвхөн эдгээрээр харагдана.
   */
  display?: string[];
};

export const NET_SOURCES: Record<NetKind, NetSource> = {
  real: {
    kind: 'real',
    get label() { return tr('Одоогийн бодит зам'); },
    get short() { return tr('Бодит'); },
    hue: '#38bdf8',
    // ① Одоогийн бодит замын line (Monmap_zam_selbe, 113 feature, polyline).
    //    Гэрлэн дохио нь бодит gerlen_dohio service-ээс; геометр энэ давхаргаас.
    // test_data [98] monmap_road_simulation — 2026-08-13 шилжив (113 feature)
    url: `${SELBE_ET}/113`,
    nodeIntersections: true,
    directed: true,
  },
  plan: {
    kind: 'plan',
    get label() { return tr('Ерөнхий төлөвлөгөөний зам'); },
    get short() { return tr('Төлөвлөгөө'); },
    hue: '#a78bfa',
    // ② Ерөнхий төлөвлөгөөний машин явах line (selbe_zam_tuluwlult, 205 feature).
    //    et:5 «Замын тэнхлэг»-ийг СОЛЬСОН: энэ нь машин явахаар зурсан жинхэнэ line.
    // test_data [104] ET_road_simulation — 2026-08-13 шилжив (205 feature)
    url: `${SELBE_ET}/102`,
    nodeIntersections: true,
    directed: true, // line сумтай — 141 мухар бүгд 60м дотор гарцтай (тасралтгүй)
  },
};

/**
 * Сүлжээ СОНГОХОД БЭЛЭН үү — line ирсэн эсвэл ядаж харуулах давхаргатай юу.
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
 */
export function loadNetworkCached(kind: NetKind): Promise<Network> {
  let p = cache.get(kind);
  if (!p) {
    const src = NET_SOURCES[kind];
    // Геометрийг ArcGIS line-аас, гэрлэн дохиог ЗӨВХӨН бодит service-ээс.
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
        const geom = src.nodeIntersections
          ? nodeByIntersection(paths, { unitsPerMeter: WM_UNITS_PER_M })
          : paths;
        const net = buildNetwork(geom, {
          unitsPerMeter: WM_UNITS_PER_M,
          signals,
          directed: src.directed,
        });
        if (src.dedupe === false) {
          console.info(`[selbe] «${src.label}»: давхардлын шүүлт УНТРААЛТТАЙ (эргэлтийн зурвас)`);
        } else {
          const dup = markDuplicates(net);
          if (dup) console.info(`[selbe] «${src.label}»: давхардсан ${dup}/${net.edges.length} ирмэгийг урсгалаас хасав`);
        }
        if (signalsFailed) { net.signalsFailed = true; cache.delete(kind); }
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
  `${SELBE_ET}/103`;

let signalCache: Promise<SignalDef[]> | null = null;

/**
 * Бодит гэрлэн дохионы уулзваруудыг НЭГ УДАА татаж кэшлэнэ.
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
  const feats: SignalFeature[] = [];
  for (let off = 0; ; ) {
    const q = new URLSearchParams({
      where: '1=1',
      outFields: 'uulzwar_name,gerlen_dohio_code',
      returnGeometry: 'true',
      outSR: '3857',
      orderByFields: 'objectid ASC',
      resultOffset: String(off),
      resultRecordCount: '2000',
      f: 'json',
    });
    const page = await arcgisPost<ArcgisBody & {
      features?: SignalFeature[];
      exceededTransferLimit?: boolean;
    }>(`${SIGNAL_LAYER_URL}/query`, Object.fromEntries(q));
    if (page.error) throw new Error(page.error.message ?? tr('гэрлэн дохио query алдаа'));
    const got = page.features ?? [];
    feats.push(...got);
    if (!page.exceededTransferLimit || got.length === 0) break;
    off += got.length;
  }
  const r: { features?: SignalFeature[] } = { features: feats };

  /** Уулзвар бүрийн оройнууд ба approach line-ууд (бүлэгтэй) */
  const groups = new Map<string, { pts: Pt[]; lines: SignalLine[] }>();
  let skipped = 0;
  for (const f of r.features ?? []) {
    const name = String(f.attributes.uulzwar_name ?? '').trim();
    const code = Number(f.attributes.gerlen_dohio_code);
    const path = f.geometry?.paths?.[0];
    if (!path || path.length < 2) continue;
    if (!name || !Number.isFinite(code) || code <= 0) { skipped++; continue; }
    let g = groups.get(name);
    if (!g) { g = { pts: [], lines: [] }; groups.set(name, g); }
    for (const p of path) g.pts.push(p as Pt);
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
