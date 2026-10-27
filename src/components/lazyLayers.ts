/**
 * ДАВХАРГЫГ MAP-Д ХОЙШЛУУЛЖ НЭМЭХ («lazy») — `MapCanvas`-ийн `buildLayers` сан (pool).
 *
 * ⚠️ 2026-10-22 (гүйцэтгэл, хэмжсэн): ArcGIS JS 4.34 нь Map-д байгаа давхарга БҮРД (`visible: false` ч) LayerView
 *    үүсгэж метадата (`…/FeatureServer/N?f=json`) татдаг. `buildLayers`-ийн ~180 давхарга бүгд Map-д шууд ордог байсан
 *    тул «Ерөнхий дашбоард» нээхэд ~410 мета хүсэлт (Bagts_ajluud 198 · selbe_ET 78 · Guitsetgel_talbe 48 …) эхний 5 с-д
 *    явж, ил байгаа 3–4 давхаргын зургийг хойшлуулдаг байв. Одоо инстанц бүр ЭНД хадгалагдаж, Map-д анх ИЛ болоход
 *    (`lazyShowVisible`) эсвэл LayerView хэрэгтэй үед (`ensureMapLayer`) л нэмэгдэнэ; нэмэгдсэнийг буцааж ХАСАХГҮЙ.
 * ⚠️ ДАРААЛАЛ — `buildLayers`-ийн дараалал (зэрэглэл) хадгалагдана: шинэ давхарга нь өөрөөсөө ӨНДӨР зэрэглэлтэй анхны
 *    сангийн давхаргын ӨМНӨ, байхгүй бол `LAZY_END` тэмдэгтийн ӨМНӨ орно. Тиймээс бусад кодын нэмдэг давхарга урьдын
 *    байрандаа үлдэнэ: «ортофотогийн дараа» (индекс 1 — меш, эрсдэлийн растр) нь сангийн бүх давхаргаас ДООР,
 *    төгсгөлд нэмэгддэг (sketch · pulse · overlap · need · BIM …) нь `LAZY_END`-ээс ХОЙШ буюу ДЭЭР.
 * ⚠️ `map.findLayerById` нь зөвхөн Map-д БАЙГААГ олно. Шинж тавих, `queryFeatures` (Map-д байх албагүй) → `mapLayer`
 *    (НЭМЭХГҮЙ); LayerView / hitTest / swipe / snapping (Map-д байх ёстой) → `ensureMapLayer`.
 * ⚠️ ЦЭВЭР модуль — ArcGIS-ийн ажиллах үеийн импортгүй (`lazyLayers.check.mjs` хуурамч Map-аар шалгана).
 */
import type ArcMap from '@arcgis/core/Map';
import type Layer from '@arcgis/core/layers/Layer';

/** Сангийн давхаргын ДЭЭД хил (хоосон GraphicsLayer-ийн id) — үүнээс ХОЙШ нэмэгдсэн давхарга сангийнхаас ДЭЭР үлдэнэ */
export const LAZY_END = 'lazy:end';

type Coll = __esri.Collection<Layer>;
type Pool = {
  /** `buildLayers`-ийн дараалал — дээд түвшинд ба бүлэг дотроо тус тусдаа */
  rank: Record<string, number>;
  /** Одоогийн инстанц (Map-д байгаа эсэхээс үл хамаарна) — «Дахин оролдох» сольбол `lazyReplace` */
  byId: Record<string, Layer>;
  /** Эцэг бүлэг (`imagery`); `null` = Map-ын дээд түвшин */
  parent: Record<string, Layer | null>;
};
const pools = new WeakMap<ArcMap, Pool>();

const collOf = (map: ArcMap, g: Layer | null): Coll =>
  (g ? (g as unknown as { layers: Coll }).layers : map.layers);

/** Сангийн ОДООГИЙН инстанцын зэрэглэл; сангийнх биш (эсвэл солигдсон хуучин инстанц) бол `undefined` */
const rankOf = (p: Pool, l: Layer): number | undefined => {
  const id = String(l.id);
  return p.byId[id] === l ? p.rank[id] : undefined;
};

/** Дээд түвшинд `LAZY_END`-ийн индекс (байхгүй бол урт) — бүлэг дотор бүх урт */
const endOf = (items: readonly Layer[], top: boolean): number => {
  const i = top ? items.findIndex((x) => x.id === LAZY_END) : -1;
  return i < 0 ? items.length : i;
};

/**
 * ОРУУЛАХ ИНДЕКС — `[0, end)` мужид өөрөөсөө (`r`) ӨНДӨР зэрэглэлтэй АНХНЫ давхаргын байр, байхгүй бол `end`.
 * Зэрэглэлгүй (`undefined` — сангийнх биш) давхаргыг алгасна.
 */
export function lazySlot(ranks: readonly (number | undefined)[], r: number, end: number): number {
  for (let i = 0; i < end; i++) {
    const x = ranks[i];
    if (x !== undefined && x > r) return i;
  }
  return end;
}

/**
 * Санг бүртгэнэ. `top` — `buildLayers`-ийн БҮХ дээд түвшний давхарга (дарааллаар нь; Map-д аль хэдийн байгаа нь ч);
 * `groups` — хүүхдүүдийг нь мөн хойшлуулах бүлэг (хүүхдийн БҮРЭН жагсаалт, дарааллаар).
 */
export function lazyRegister(
  map: ArcMap, top: readonly Layer[], groups: readonly { group: Layer; kids: readonly Layer[] }[] = [],
): void {
  const p: Pool = { rank: {}, byId: {}, parent: {} };
  const put = (l: Layer, i: number, g: Layer | null) => {
    const id = String(l.id);
    p.rank[id] = i;
    p.byId[id] = l;
    p.parent[id] = g;
  };
  top.forEach((l, i) => put(l, i, null));
  for (const { group, kids } of groups) kids.forEach((l, i) => put(l, i, group));
  pools.set(map, p);
}

/** Map-д байгаа, эсвэл санд хүлээж буй инстанц — Map-д НЭМЭХГҮЙ (шинж тавих, `queryFeatures`-д) */
export function mapLayer(map: ArcMap | null | undefined, id: string): Layer | null {
  if (!map || map.destroyed) return null;
  const hit = map.findLayerById(id);
  if (hit) return hit;
  const l = pools.get(map)?.byId[id];
  return l && !l.destroyed ? l : null;
}

function insert(map: ArcMap, p: Pool, l: Layer): void {
  const g = p.parent[String(l.id)] ?? null;
  const coll = collOf(map, g);
  const items = coll.toArray();
  coll.add(l, lazySlot(items.map((x) => rankOf(p, x)), p.rank[String(l.id)], endOf(items, !g)));
}

/** Санд байгаа давхаргыг Map-д (зэрэглэлийн байранд нь) нэмж буцаана; аль хэдийн Map-д байвал тэрийгээ */
export function ensureMapLayer(map: ArcMap | null | undefined, id: string): Layer | null {
  if (!map || map.destroyed) return null;
  const hit = map.findLayerById(id);
  if (hit) return hit;
  const p = pools.get(map);
  const l = p?.byId[id];
  if (!p || !l || l.destroyed) return null;
  insert(map, p, l);
  return l;
}

/** `g` цуглуулгад байгаа + санд хүлээж буй (`g`-ийн) инстанцууд */
function withAbsent(map: ArcMap, g: Layer | null): Layer[] {
  const out = collOf(map, g).toArray();
  const p = pools.get(map);
  if (!p) return out;
  const has = new Set(out);
  for (const id of Object.keys(p.byId)) {
    const l = p.byId[id];
    if ((p.parent[id] ?? null) === g && !l.destroyed && !has.has(l)) out.push(l);
  }
  return out;
}

/** Map-ын дээд түвшний давхаргууд + Map-д хараахан ОРООГҮЙ сангийн дээд түвшний инстанцууд (шинж тавих эффектүүдэд) */
export const lazyTop = (map: ArcMap): Layer[] => withAbsent(map, null);

/** Бүлгийн хүүхдүүд — бүлэгт байгаа + санд хүлээж буй */
export const lazyKids = (map: ArcMap, group: Layer): Layer[] => withAbsent(map, group);

/** Map-д ороогүй БҮХ сангийн инстанц (бүлгийн хүүхэд ч) — «Дахин оролдох»-д */
export function lazyAbsent(map: ArcMap): Layer[] {
  const p = pools.get(map);
  if (!p) return [];
  return Object.keys(p.byId)
    .map((id) => p.byId[id])
    .filter((l) => !l.destroyed && !collOf(map, p.parent[String(l.id)] ?? null).includes(l));
}

/** «Дахин оролдох» унасан инстанцыг шинээр сольсон — сан шинийг заана (Map-д байгаа эсэхээс үл хамаарна) */
export function lazyReplace(map: ArcMap, old: Layer, fresh: Layer): void {
  const p = pools.get(map);
  const id = String(old.id);
  if (p && p.byId[id] === old) p.byId[id] = fresh;
}

/**
 * Сангийн дарааллыг сэргээнэ. ⚠️ Гаднын `reorder` — `ChangeBoundary` khil1-ийг ХУУЧИН ИНДЕКС рүү нь буцаадаг; хойшлуулсан
 * нэмэлтийн дараа тэр индекс хуучирч, хил хэдэн давхаргын ДООР орж болно. `LAZY_END`-ээс ХОЙШХИЙГ (төгсгөл рүү
 * зориуд зөөсөн) хөндөхгүй. Ердийн үед нэг ч `reorder` хийгдэхгүй.
 */
function heal(map: ArcMap, p: Pool): void {
  for (let guard = 0; guard < 64; guard++) {
    const items = map.layers.toArray();
    const end = endOf(items, true);
    let prev = -Infinity;
    let bad: Layer | null = null;
    for (let i = 0; i < end && !bad; i++) {
      const r = rankOf(p, items[i]);
      if (r === undefined) continue;
      if (r < prev) bad = items[i];
      else prev = r;
    }
    if (!bad) return;
    const rest = items.filter((x) => x !== bad);
    map.layers.reorder(bad, lazySlot(rest.map((x) => rankOf(p, x)), rankOf(p, bad) ?? 0, endOf(rest, true)));
  }
}

/**
 * ИЛ болсон (`visible`) боловч Map-д ороогүй сангийн давхаргыг зэрэглэлийн байранд нь нэмнэ — эцэг бүлэг нь нуугдсан
 * бол хүлээнэ (жиш. ортофото унтраалттай үед нислэгийн тайл). Нэмсэн тоог буцаана.
 */
export function lazyShowVisible(map: ArcMap | null | undefined): number {
  const p = map && !map.destroyed ? pools.get(map) : undefined;
  if (!map || !p) return 0;
  heal(map, p);
  let n = 0;
  for (const id of Object.keys(p.byId)) {
    const l = p.byId[id];
    const g = p.parent[id] ?? null;
    if (l.destroyed || !l.visible || (g && (g.destroyed || !g.visible))) continue;
    if (collOf(map, g).includes(l)) continue;
    insert(map, p, l);
    n += 1;
  }
  return n;
}
