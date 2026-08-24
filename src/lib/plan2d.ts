import { t as tr } from '@/lib/i18nCore';
/**
 * PLAN2D — "Selbe 2D map 0804" webmap-ийн 14 давхарга.
 *
 * МЕТА (id/sub/title/geom) нь ЭНД синхрон — services.ts үүгээр LayerDef үүсгэнэ.
 * RENDERER (webmap style, модны зураг, текстур) нь БАЙТ ихтэй тул bundle-д
 * оруулахгүй — /plan2d-style.json-оос ажиллах үед татна (loadPlan2dStyle).
 * MapCanvas газрын зураг барихаасаа ӨМНӨ ачаалж дуусгадаг тул buildLayers
 * дотор plan2dStyleOf() нь синхрон уншигдана.
 */
export type Plan2DLayer = {
  id: string;
  sub: number;
  title: string;
  geom: "point" | "line" | "area";
  opacity: number;
};

export const PLAN2D_LAYERS: Plan2DLayer[] = [
  {
    "id": "sb:0",
    "sub": 0,
    "title": tr('Мод'),
    "geom": "point",
    "opacity": 1
  },
  {
    "id": "sb:1",
    "sub": 1,
    "title": tr('Ногоон байгууламж'),
    "geom": "area",
    "opacity": 1
  },
  {
    "id": "sb:2",
    "sub": 2,
    "title": tr('Автозам'),
    "geom": "area",
    "opacity": 1
  },
  {
    "id": "sb:3",
    "sub": 3,
    "title": tr('Явган зам'),
    "geom": "area",
    "opacity": 1
  },
  {
    "id": "sb:4",
    "sub": 4,
    "title": tr('Барилга'),
    "geom": "area",
    "opacity": 1
  },
  {
    "id": "sb:5",
    "sub": 5,
    "title": tr('Замын цагаан зураас'),
    "geom": "line",
    "opacity": 1
  },
  {
    "id": "sb:7",
    "sub": 7,
    "title": "Sport area line",
    "geom": "line",
    "opacity": 1
  },
  {
    "id": "sb:8",
    "sub": 8,
    "title": tr('Спорт талбай'),
    "geom": "area",
    "opacity": 1
  },
  {
    "id": "sb:10",
    "sub": 10,
    "title": "Huuhdiin togloom line",
    "geom": "line",
    "opacity": 1
  },
  {
    "id": "sb:11",
    "sub": 11,
    "title": "Huuhdiin togloom polygon",
    "geom": "area",
    "opacity": 1
  },
  {
    "id": "sb:13",
    "sub": 13,
    "title": "Suudrevch line",
    "geom": "line",
    "opacity": 1
  },
  {
    "id": "sb:14",
    "sub": 14,
    "title": "Suudrevch polygon",
    "geom": "area",
    "opacity": 1
  },
  {
    "id": "sb:15",
    "sub": 15,
    "title": tr('Дугуйн зам'),
    "geom": "area",
    "opacity": 1
  },
  {
    "id": "sb:16",
    "sub": 16,
    "title": tr('Гол'),
    "geom": "area",
    "opacity": 1
  }
];

/* ── Renderer-ийн кэш — /plan2d-style.json (нэг удаа татна) ── */
let STYLES: Record<string, unknown> | null = null;
let pending: Promise<void> | null = null;

/** Style JSON-ыг урьдчилан ачаална — Map барихаас ӨМНӨ дуудна */
export function loadPlan2dStyle(): Promise<void> {
  if (STYLES) return Promise.resolve();
  pending ??= fetch("/plan2d-style.json")
    .then((r) => (r.ok ? r.json() : {}))
    .then((j) => { STYLES = j as Record<string, unknown>; })
    .catch(() => { STYLES = {}; });
  return pending;
}

/**
 * КАТАЛОГ → ПЛАН2D alias — «Ерөнхий төлөвлөгөө 2D map»-ийн style-ийг ижил
 * утгатай каталогийн давхаргуудад мөн өмсгөнө (хэрэглэгчийн хүсэлт: бүх
 * давхаргыг план 2D map-тай жигдлэх). Эдгээр `sb:*` renderer нь `simple`
 * (талбар шаардахгүй) тул өөр үйлчилгээний давхаргад найдвартай тавигдана.
 *
 * ⚠️ Зөвхөн физик/газрын бүрхэвчийн давхаргууд — инженерийн шугам, бүс,
 * хяналт, багц зэрэг план2d webmap-д ЭКВИВАЛЕНТГҮЙ давхаргууд өөрийн
 * загвартаа үлдэнэ (тэдгээрт өмсгөх план2d style алга).
 */
const PLAN2D_ALIAS: Record<string, string> = {
  "et:24": "sb:4",   // Барилга
  "et:29": "sb:2",   // Зам (талбай) → Автозам
  "et:27": "sb:3",   // Явган хүний зам
  "dugui": "sb:15",  // Дугуйн зам
  "nogoon": "sb:1",  // Ногоон байгууламж
  "tree": "sb:0",    // Мод
};

/**
 * id-гаар webmap renderer-ийг олох (ачаалагдаагүй бол undefined — fallback style).
 * Шууд `sb:*` олдохгүй бол alias-аар ижил утгатай план2d давхаргын style-ийг авна.
 */
export const plan2dStyleOf = (id: string): unknown => STYLES?.[id] ?? STYLES?.[PLAN2D_ALIAS[id]];

/**
 * План2d style-ийг ALIAS-аар авсан каталогийн давхаргууд. ⚠️ Тэдгээрийн ихэнх нь
 * зурган текстур (esriPFS/esriPMS) тул SceneView-д дэмжигдэхгүй — 3D/BIM горимд
 * MapCanvas эдгээрийг нуана («picture-fill is unsupported in 3D» алдааны эх).
 * 3D-д меш газрын бүрхэвчийг өөрөө харуулдаг тул визуал алдагдалгүй.
 */
export const PLAN2D_ALIASED: ReadonlySet<string> = new Set(Object.keys(PLAN2D_ALIAS));
