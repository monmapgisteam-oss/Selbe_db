import { t as tr } from '@/lib/i18nCore';

/* ══════════════════════ Өртгийн загвар ══════════════════════ */

export type Quantity = { field: string; unit: "м" | "км" | "м²" };

/* ══════════════════════ Сэдэв ══════════════════════ */

/**
 * ХОЁРХОН бүлэг.
 */
export type TopicKey = "plan" | "monitor" | "gazar" | "iot";

export const TOPICS: {
  key: TopicKey;
  title: string;
  icon: string;
  hue: string;
}[] = [
  { key: "plan", get title() { return tr('Ерөнхий төлөвлөгөө'); }, icon: "layers", hue: "#0d9488" },
  { key: "monitor", get title() { return tr('Барилгын хяналт'); }, icon: "target", hue: "#ea580c" },
  { key: "gazar", get title() { return tr('Газар чөлөөлөлт'); }, icon: "frame", hue: "#16a34a" },
  { key: "iot", get title() { return tr('IoT мэдрэгч'); }, icon: "radio", hue: "#0891b2" },
];

export const topicTitle = (k: TopicKey) =>
  TOPICS.find((t) => t.key === k)!.title;

/* ══════════════════════ Давхаргын каталог ══════════════════════ */

export type LayerDef = {
  /** Порталын доторх id — `et:<FeatureServer-ийн давхаргын дугаар>` */
  id: string;
  /** FeatureServer доторх давхаргын дугаар */
  n: number;
  title: string;
  topic: TopicKey;
  geom: "area" | "line" | "point";
  hue: string;
  /** Зураасны хээ — ижил гэр бүлийн шугамуудыг ялгана */
  dash?: "solid" | "dash" | "dot" | "dash-dot" | "long-dash";
  width?: number;
  fill?: number;
  marker?: "circle" | "square" | "diamond";
  size?: number;
  /**
 * Полигоны ХҮРЭЭНИЙ өнгө — өгөөгүй бол `hue` (дүүргэлттэй ижил).
   */
  stroke?: string;
  /** Полигоны хүрээний ХЭЭ — Холбооны худаг эх зурагт ТАСАРХАЙ хүрээтэй */
  strokeDash?: "solid" | "dash" | "dot" | "dash-dot" | "long-dash";
  /**
   * ЭХ ҮЙЛЧИЛГЭЭНИЙ СИМБОЛЫГ ЯГ ТЭР ХЭВЭЭР зурна (2026-09-14, хэрэглэгчийн
   * «яг энэ map шиг харагдацтай болго»).
   */
  srcSym?: true;
  /**
   * НЭВТРЭЛТ ШААРДЛАГАТАЙ давхарга (2026-09-15) — үйлчилгээ нэргүй хэрэглэгчид
   * асуулгыг хаасан (`allowAnonymousToQuery: false`).
   */
  auth?: true;
  /** Зөвхөн ойртоход зурагдана (олон мянган объекттой давхарга) */
  minScale?: number;
  qty?: Quantity;
  /** Ангиллын задаргаа — дашбоардад багана болж, дарахад зурагт шүүнэ */
  facets?: { field: string; label: string; canon?: (raw: string) => string }[];
  /**
   * КАТАЛОГТ анхны ангиллаараа задарна — зүүн баганад давхаргын доор дэд мөр
   * болж гарч, дарахад зурагт тэр төрөл нь шүүгдэнэ.
   */
  catalogFacet?: true;
  /**
   * Ангиллаар ӨНГӨ ялгах (≤6 утгатай ТЕКСТ талбарт).
   */
  paint?: {
    field: string;
    values: Record<string, string>;
    /**
     * ТҮҮХИЙ УТГЫН ХҮНИЙ НЭР (2026-09-15) — тоон кодтой талбарт ЗААВАЛ.
     */
    labels?: Record<string, string>;
    /**
     * ЭНЭ ЗАГВАР WEBMAP-ЫН СНАПШОТААС ДАВАМГАЙЛАХ УУ (2026-09-15).
     */
    force?: boolean;
    emptyLabel: string;
    /**
     * `values`-д ОРООГҮЙ утгын өнгө (2026-10-08). Заагаагүй бол саарал (`ZONE_TYPE_EMPTY_HUE`).
     */
    defaultHue?: string;
    /** Диаграмын палитр — заагаагүй бол `values` (зургийнх) хэрэглэгдэнэ */
    chartValues?: Record<string, string>;
  };
  /**
   * ТООН талбарыг завсраар өнгөөр ялгах (гүйцэтгэлийн %).
   */
  breaks?: {
    field: string;
    levels: readonly {
      label: string;
      range: string;
      min: number;
      max: number;
      color: string;
    }[];
    emptyLabel: string;
  };
  /**
   * `ZONE_ID` талбар БАЙХГҮЙ давхарга.
   */
  noZone?: true;
  /**
   * Бүсийн кодыг агуулах талбар — анхдагч `ZONE_ID`.
   */
  zoneField?: string;
  /**
   * Давхаргын БҮТЭН URL — өгөгдлийн жинхэнэ хаяг.
   */
  url?: string;
  /**
   * Давхаргын ТОГТМОЛ шүүлт (definitionExpression-ийн суурь).
   */
  where?: string;
  /**
   * ҮЙЛЧИЛГЭЭНИЙ ӨӨРИЙН рендерерийн АНГИЛЛЫН ӨНГӨ (`drawingInfo`) — `MapCanvas` өөрийн renderer
   * ТАВИХГҮЙ, харин ачаалагдсаны дараа ангилал бүрийн өнгийг хадгалан дүүргэлтийн тунгалаг
   * `fill` (0–1), хүрээ нь ТУХАЙН АНГИЛЛЫН өнгөөр `outline` px болгоно (2026-10-13, хэрэглэгч:
   * «Zoning өнгийг ЕТ дагуу өнгө өнгө type based» — Redesign Zone, `zone` талбараар).
   */
  serviceStyle?: { fill: number; outline: number };
  /**
   * OID талбарын нэр — анхдагч `OBJECTID`.
   */
  oid?: string;
  /**
   * Ерөнхий (каталогаас автоматаар үүсэх) дашбоардын оронд БЭСПОК самбар.
   * Гүйцэтгэлийн 16 үе шат, Survey123-ийн холбоост хүснэгтүүд зэрэг нь
   * ерөнхий «тоо + хэмжээ + ангилал» загварт багтахгүй.
   */
  detail?: "building";
  note?: string;
};

/** Бүх давхаргад нийтлэг талбарууд */
export const OID = "objectid";
/** Давхарга БҮР энэ талбартай — бүсийн нэгдсэн шүүлт үүн дээр тогтоно */
export const ZONE_FIELD = "zone_id";
/**
 * Бүсийн мэдээлэл бөглөгдөөгүй объектын утга (хоосон биш, ийм ТЕКСТ).
 */
export const ZONE_NONE = ' Бүсийн мэдээлэл байхгүй ';

/**
 * АНГИЛЛЫН ТҮҮХИЙ УТГЫН ДЭЛГЭЦИЙН НЭР — `f.canon` (бүсийн ангилал) → `paint.labels` (кодтой талбар, «1» → «Явган хүний зам»),
 * орчуулсан. 2026-10-26 (аудит): `LayerCatalog`/`LayerTypeCharts`-ийн `nameOf`-ыг НЭГ газар — давхаргын самбарын facet,
 * «хэмжээгээр» чарт, hover, сонгосон объектын чип түүхий утга харуулж нэг ангилал нэг дэлгэцэд хоёр нэртэй байв.
 * ЗӨВХӨН харагдах нэр: түлхүүр · өнгө · `where` түүхий утгаараа.
 */
export function facetName(d: Pick<LayerDef, 'facets' | 'paint'>, field: string, raw: string): string {
  const f = d.facets?.find((x) => x.field === field);
  const name = f?.canon
    ? f.canon(raw)
    : field === d.paint?.field
      ? d.paint.labels?.[raw] ?? raw
      : raw;
  return tr(name);
}
