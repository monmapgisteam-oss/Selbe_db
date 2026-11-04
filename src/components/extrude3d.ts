/**
 * ПОЛИГОНЫГ 3D-Д БОСГОХ (2026-11-04, «Инженерийн дэд бүтэц»: «полигоныг 5 м дээшээ босго») — давхаргын ОДООГИЙН
 * рендерерийн өнгөөр. Шугам, цэг, бусад симболд хүрэхгүй. ArcGIS-гүй цэвэр функц (`extrude3d.check.mjs`).
 */

type Rgb = { r: number; g: number; b: number; a?: number };
type Sym = { type?: string; color?: Rgb | null; outline?: { color?: Rgb | null } | null };
type Slot = { symbol?: unknown };
/** Рендерерийн энд хэрэгтэй хэсэг — simple · unique-value · class-breaks */
type Rend = Slot & { defaultSymbol?: unknown; uniqueValueInfos?: Slot[] | null; classBreakInfos?: Slot[] | null };

/** Босгосон биеийн хамгийн бага тунгалаг бус байдал — нимгэн 0.3 дүүргэлтээр хана харагдахгүй */
const MIN_OPACITY = 0.8;

/** `simple-fill` → дээш босгосон `polygon-3d`; бусад симбол хэвээр */
export function extrudeSymbol(sym: unknown, meters: number): unknown {
  const s = sym as Sym | null | undefined;
  if (s?.type !== 'simple-fill') return sym;
  const fillOk = s.color && (s.color.a ?? 1) > 0;
  const c = fillOk ? s.color : s.outline?.color;
  if (!c) return sym;
  const dark = (v: number) => Math.round(v * 0.55);
  return {
    type: 'polygon-3d',
    symbolLayers: [{
      type: 'extrude',
      size: meters,
      material: { color: [c.r, c.g, c.b, Math.max(MIN_OPACITY, c.a ?? 1)] },
      edges: { type: 'solid', color: [dark(c.r), dark(c.g), dark(c.b), 1], size: 0.6 },
    }],
  };
}

/**
 * ШУГАМ → 3D ХООЛОЙ (2026-11-04, «3d symbol болгомоор») — `line-3d` + `path`, голч МЕТРЭЭР (пикселээр боломжгүй).
 * Өнгө хэвээр. Хоолойд тасархай хээ байхгүй: «буцах»/«өгөх» шугам ижил өнгөтэй бол ялгагдахгүй.
 */
export function tubeSymbol(sym: unknown, meters: number): unknown {
  const s = sym as { type?: string; color?: Rgb | null; data?: CimRef } | null | undefined;
  let color: number[] | null = null;
  if (s?.type === 'simple-line' && s.color) color = [s.color.r, s.color.g, s.color.b, s.color.a ?? 1];
  if (s?.type === 'cim') {
    const col = s.data?.symbol?.symbolLayers?.[0]?.color;
    if (col) color = [col[0], col[1], col[2], (col[3] ?? 100) / 100];
  }
  if (!color) return sym;
  return {
    type: 'line-3d',
    symbolLayers: [{
      type: 'path', profile: 'circle', width: meters, height: meters, cap: 'round', join: 'round', material: { color },
    }],
  };
}
type CimRef = { symbol?: { symbolLayers?: { color?: number[] }[] } };

/**
 * АЛСЫН ШУГАМ — `simple-line`, тогтмол зузаан (px), тасархай хэвээр. Хоолойн голч алсаас пикселээс нарийн тул харагдахгүй
 * атлаа мэш нь хүнд: тэр зайд энэ хөнгөн хувилбар (`TUBE_NEAR_SCALE`).
 */
export function flatLineSymbol(sym: unknown, px: number): unknown {
  const width = px * 0.75; // ArcGIS-ийн симбол pt-ээр
  const s = sym as { type?: string; color?: unknown; style?: string; data?: { symbol?: { symbolLayers?: { color?: number[]; effects?: unknown[] }[] } } } | null | undefined;
  if (s?.type === 'simple-line') return { type: 'simple-line', color: s.color, style: s.style ?? 'solid', width };
  if (s?.type !== 'cim') return sym;
  const stroke = s.data?.symbol?.symbolLayers?.[0];
  const col = stroke?.color;
  if (!col) return sym;
  return { type: 'simple-line', color: [col[0], col[1], col[2], (col[3] ?? 100) / 100], style: stroke.effects?.length ? 'dash' : 'solid', width };
}

/** Энэ масштабаас ойр (1:1500) л хоолой — 0.2 м голч дэлгэц дээр ойролцоогоор 0.5px-ээс томорно */
export const TUBE_NEAR_SCALE = 1500;

/** Хоолойд `on-the-ground` хүчингүй — газраас хагас голчоор өргөж газар дээр нь хэвтүүлнэ (өгөгдлийн Z-ийг үл тооно) */
export const tubeElevation = (meters: number) => ({
  mode: 'relative-to-ground', offset: meters / 2, featureExpressionInfo: { expression: '0' },
});

/**
 * ЦЭГ → 3D БИЕТ (2026-11-04, «point-ийг 3d symbol-той») — газар дээр зогсох цилиндр, хэмжээ МЕТРЭЭР, өнгө хэвээр.
 */
export function pillarSymbol(sym: unknown, meters: number): unknown {
  const s = sym as { type?: string; color?: Rgb | null } | null | undefined;
  if (s?.type !== 'simple-marker' || !s.color) return sym;
  return {
    type: 'point-3d',
    symbolLayers: [{
      type: 'object',
      resource: { primitive: 'cylinder' },
      width: meters, depth: meters, height: meters,
      anchor: 'bottom',
      material: { color: [s.color.r, s.color.g, s.color.b, s.color.a ?? 1] },
    }],
  };
}

/** Рендерерийн (ХУУЛБАРЫН) бүх симболыг газар дээр нь сольж, өөрийг нь буцаана */
function mapSymbols<R>(renderer: R, fn: (sym: unknown) => unknown): R {
  const r = renderer as Rend;
  if (r.symbol) r.symbol = fn(r.symbol);
  if (r.defaultSymbol) r.defaultSymbol = fn(r.defaultSymbol);
  for (const list of [r.uniqueValueInfos, r.classBreakInfos]) {
    for (const info of list ?? []) info.symbol = fn(info.symbol);
  }
  return renderer;
}

export const extrudeRenderer = <R>(renderer: R, meters: number): R => mapSymbols(renderer, (x) => extrudeSymbol(x, meters));
export const tubeRenderer = <R>(renderer: R, meters: number): R => mapSymbols(renderer, (x) => tubeSymbol(x, meters));
export const flatLineRenderer = <R>(renderer: R, px: number): R => mapSymbols(renderer, (x) => flatLineSymbol(x, px));
export const pillarRenderer = <R>(renderer: R, meters: number): R => {
  mapSymbols(renderer, (x) => pillarSymbol(x, meters));
  (renderer as { visualVariables?: unknown }).visualVariables = null;
  return renderer;
};
