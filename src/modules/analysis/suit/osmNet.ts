/**
 * БОДИТ ЗАМЫН СҮЛЖЭЭ (OSM) — одоо газар дээр байгаа зам.
 *
 * ⚠️ ХОЁР ӨӨР ЗАМЫН СҮЛЖЭЭ байдгийг андуурч болохгүй:
 *   · `roadNet.ts` → `et:5` «Замын тэнхлэг» = ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨНИЙ зам.
 *     Ихэнх нь хараахан БАРИГДААГҮЙ. Эгнээний тоо байхгүй.
 *   · `osmNet.ts`  → OSM = ОДОО БОДИТООР байгаа зам. Ангилал, зарим газар
 *     эгнээ/нэг чиглэл/хурдны хязгаартай.
 * Хоёуланг нь ИЖИЛ эрэлтээр ажиллуулж харьцуулснаар «шинэ төлөвлөлт ачааллыг
 * бууруулж байна уу» гэсэн асуултад хариулна.
 *
 * ⚠️ Өгөгдөл нь СТАТИК файлаас ирнэ (`public/data/osm-roads.json`), Overpass-аас
 * шууд БИШ: сайт нь статик export бөгөөд Overpass удаан, хязгаартай, унадаг.
 * Шинэчлэх бол `node tools/osm_roads.mjs`.
 *
 * ⚠️ ЛИЦЕНЗ: ODbL — «© OpenStreetMap contributors» эшлэл газрын зурагт заавал.
 */

import { CAPACITY_PER_LANE } from '@/lib/analysis/transport';
import { buildNetwork, type Network, type Pt } from './traffic';
import { WM_UNITS_PER_M } from './roadNet';

/** `tools/osm_roads.mjs`-ийн гаралт */
export type OsmRoads = {
  meta: {
    source: string; license: string; attribution: string; generated: string;
    bbox: string; crs: string; ways: number; km: number; lanesTagged: number;
  };
  /** Ангиллын нэрс — `ways[].c` нь энэ массивын индекс */
  classes: string[];
  /** Ангилал → чиглэл тус бүрийн эгнээний ТААМАГ (шошго байхгүй үед) */
  lanesByClass: Record<string, number>;
  ways: {
    /** `classes`-ийн индекс */
    c: number;
    /** Чиглэл тус бүрийн эгнээ — OSM-д шошиглогдсон бол; үгүй бол `null` */
    l: number | null;
    /** 1 = нэг чиглэлтэй */
    o: 0 | 1;
    n?: string;
    /** Хурдны хязгаар (км/ц) — шошиглогдсон бол */
    s?: number;
    /** Оройнууд, Web Mercator */
    g: [number, number][];
  }[];
};

/** Статик файлын байрлал — `basePath` ашиглахгүй тул үндэс замаас */
const DATA_URL = '/data/osm-roads.json';

/** Ангилалд харгалзах чөлөөт урсгалын хурд (км/ц) — `maxspeed` шошго байхгүй үед */
const SPEED_BY_CLASS: Record<string, number> = {
  motorway: 80, trunk: 70, primary: 60, secondary: 50, tertiary: 40,
  unclassified: 40, residential: 30, living_street: 20, service: 20,
};

/* ══════════════════ Уулзвар дээр таслах (noding) ══════════════════ */

/**
 * Замуудыг ХУВААЛЦСАН оройн дээр нь тасална.
 *
 * ⚠️ ЭНЭ АЛХАМГҮЙГЭЭР СҮЛЖЭЭ БУТАРНА. `buildNetwork` нь зөвхөн замын ҮЗҮҮРИЙГ
 * зангилаа болгодог — тэр нь CAD өгөгдөлд (`et:5`) тохирно, учир нь тэнд нэг
 * гудамж олон богино хэрчим болж аль хэдийн хуваагдсан байдаг.
 *
 * OSM-д харин нэг `way` хэдэн уулзварыг ДАМЖИН өнгөрдөг: хажуугийн гудамжны
 * үзүүр гол замын ДУНД орой дээр тулдаг. Хэмжилтээр 437 ийм тохиолдол байсан
 * бөгөөд тасалгаагүй үед граф 279 салангид хэсэг болж, хамгийн том нь ердөө
 * 17% байв — машин хэдхэн зуун метр яваад мухардана.
 *
 * ⚠️ Байрлалыг ЯГ ТААРУУЛЖ харьцуулна (эпсилон биш): `tools/osm_roads.mjs` нь
 * координатыг 0.1 нэгж (~7 см) хүртэл бөөрөнхийлдөг бөгөөд OSM-ийн хуваалцсан
 * зангилаа хоёр way-д ЯГ ижил lon/lat-тай ирдэг тул тэдгээр нь адилхан тоо болно.
 */
export function nodeWays(ways: OsmRoads['ways']): { paths: Pt[][]; owner: number[] } {
  const key = (p: [number, number]) => `${p[0]},${p[1]}`;

  /** Байрлал → түүнийг ашигласан ӨӨР замын тоо */
  const users = new Map<string, number>();
  for (const w of ways) {
    // ⚠️ Нэг зам ижил оройг хоёр удаа дайрвал (гогцоо) давхар тоолохгүй
    const own = new Set<string>();
    for (const p of w.g) own.add(key(p));
    for (const k of own) users.set(k, (users.get(k) ?? 0) + 1);
  }

  const paths: Pt[][] = [];
  const owner: number[] = [];
  const add = (pts: Pt[], i: number) => { if (pts.length >= 2) { paths.push(pts); owner.push(i); } };

  for (let i = 0; i < ways.length; i++) {
    const g = ways[i].g as Pt[];
    if (g.length < 2) continue;
    let start = 0;
    for (let v = 1; v < g.length - 1; v++) {
      // Дотоод орой нь ӨӨР замд ч хамаарч байвал → уулзвар → тасална
      if ((users.get(key(g[v] as [number, number])) ?? 0) >= 2) {
        add(g.slice(start, v + 1), i);
        start = v;
      }
    }
    add(g.slice(start), i);
  }
  return { paths, owner };
}

export type OsmNetwork = {
  net: Network;
  data: OsmRoads;
  /** Ирмэг бүрийн ХОЁР ЧИГЛЭЛИЙН нийт хүчин чадал (авто/цаг) */
  capacity: Float64Array;
  /** Ирмэг бүрийн чөлөөт урсгалын хурд (км/ц) */
  speed: Float64Array;
  /** Ирмэг бүрийн ангиллын индекс (`data.classes`) */
  klass: Int16Array;
  /** Эгнээ нь ШОШГООС гарсан ирмэгийн тоо (таамгаас биш) — чанарын үзүүлэлт */
  laneFromTag: number;
};

/**
 * Ирмэг бүрийн хүчин чадлыг бодно.
 *
 * ⚠️ Эгнээний эх сурвалж ХОЁР: OSM-ийн `lanes` шошго (энэ бүсэд ~11%) эсвэл
 * ангиллын таамаг. Аль нь болохыг `laneFromTag`-аар тайлагнана — шинжилгээний
 * найдвартай байдлыг хэрэглэгч мэдэх ёстой.
 *
 * ⚠️ Хүчин чадал нь ХОЁР ЧИГЛЭЛИЙН нийлбэр: `l` нь чиглэл тус бүрийн эгнээ тул
 * хоёр чиглэлтэй замд 2 дахин авна. Манай эрэлтийн хуваарилалт чиглэл ялгадаггүй
 * тул харьцуулах хүчин чадал нь мөн чиглэлгүй байх ёстой.
 *
 * ⚠️ ОДООГООР ХЭРЭГЛЭГДЭХГҮЙ (энэ модулийг хаанаас ч дуудахгүй). ХЭРЭГЛЭХЭЭСЭЭ ӨМНӨ
 * ЗАСВАРЛА: доор `nodeWays()` ДУУДАХГҮЙ шууд `buildNetwork` хийж байгаа тул OSM-ийн
 * дундуур дайрсан уулзвар дээр сүлжээ ХЭСЭГЛЭНЭ (buildNetwork зөвхөн замын эхлэл/төгсгөл
 * оройг зангилаа болгодог). Зөв: `const { paths, owner } = nodeWays(data.ways);` дараа нь
 * ирмэг → way буулгалтыг `data.ways[owner[net.edges[i].src]]` (line 141) болгож солино.
 */
export function osmNetwork(data: OsmRoads): OsmNetwork {
  const paths: Pt[][] = data.ways.map((w) => w.g as Pt[]);
  const net = buildNetwork(paths, { unitsPerMeter: WM_UNITS_PER_M });

  const capacity = new Float64Array(net.edges.length);
  const speed = new Float64Array(net.edges.length);
  const klass = new Int16Array(net.edges.length);
  let laneFromTag = 0;

  for (let i = 0; i < net.edges.length; i++) {
    const w = data.ways[net.edges[i].src];
    if (!w) continue;
    const cls = data.classes[w.c] ?? 'residential';
    klass[i] = w.c;

    const perDir = w.l ?? data.lanesByClass[cls] ?? 1;
    if (w.l != null) laneFromTag++;
    // Нэг чиглэлтэй бол чиглэл ганц; эс бөгөөс хоёр тал руу
    capacity[i] = perDir * (w.o ? 1 : 2) * CAPACITY_PER_LANE;
    speed[i] = w.s ?? SPEED_BY_CLASS[cls] ?? 30;
  }

  return { net, data, capacity, speed, klass, laneFromTag };
}

/* ══════════════════ Ачаалалт ба кэш ══════════════════ */

let cache: Promise<OsmNetwork> | null = null;

/**
 * Бодит замын сүлжээг НЭГ УДАА татаж кэшлэнэ.
 * ⚠️ Алдаа гарвал кэшийг цэвэрлэнэ — түр зуурын саатал сессийн турш хатахгүй.
 */
export function loadOsmNetworkCached(): Promise<OsmNetwork> {
  if (!cache) {
    cache = fetch(DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`OSM өгөгдөл олдсонгүй (${r.status}) — tools/osm_roads.mjs ажиллуулсан уу?`);
        return r.json() as Promise<OsmRoads>;
      })
      .then(osmNetwork)
      .catch((e) => { cache = null; throw e; });
  }
  return cache;
}
