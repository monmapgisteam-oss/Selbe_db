import { t as tr } from '@/lib/i18nCore';
import { ENT_HOSTED, HABEA_SVC, SELBE_ET, HAB_KRAN, IRGED } from './env';
import type { LayerDef } from './layerDef';
import { LAYER_BY_ID } from './layers';

/* ══════════════════════ Растр ба 3D ══════════════════════ */

/**
 * 3D бодит загвар (IntegratedMesh).
 */

/**
 * АГААРЫН ЗУРАГ (ОРТОФОТО) — системийн ГАНЦ ортофото: `Selbe_September_tif`
 * MapServer (2026 оны 9-р сарын «True Ortho»). 2D газрын зургийн СУУРЬ.
 */
/* Сэлбэ ENTERPRISE-ийн `…/rest/services/Hosted` (`env.ENT_HOSTED` = `NEXT_PUBLIC_ENT_DATA`) — BIM · меш · ХАБЭА · бүх өгөгдөл. */
/** Enterprise ArcGIS Server-ийн `…/map/rest/services` суурь (`Hosted`-гүй) — ортофото (ImageServer · MapServer) эндээс */
const ENT_REST = ENT_HOSTED.replace(/\/Hosted$/i, "");

/**
 * НИСЛЭГ БҮРИЙН ОРТОФОТО — системийн суурь ортофото (2026-10-20, Enterprise руу БҮРЭН шилжилт).
 */
export const ORTHO_FLIGHTS: Record<MeshVer, { key: string; title: string; url: string }[]> = {
  old: [
    { key: "ortho11", get title() { return tr('Ортофото — нислэг 1 (1)'); }, url: `${ENT_REST}/Ortho_nisleg_1_1_tif/MapServer` },
    { key: "ortho12", get title() { return tr('Ортофото — нислэг 1 (2)'); }, url: `${ENT_REST}/Ortho_nisleg_1_2_tif/MapServer` },
  ],
  new: [
    { key: "ortho21", get title() { return tr('Ортофото — нислэг 2'); }, url: `${ENT_REST}/Ortho_nisleg_2/MapServer` },
  ],
};

/**
 * Системийн ортофото — каталог (`dataCatalog` img:ortho) ба `SuitMap`-д. `layers` = анхдагч нислэгийн хэсгүүд
 * (`TileLayer`), `url` = эхний хэсэг (каталогийн мөрийн хаяг). Нислэг солих нь зөвхөн `MapCanvas`-д (`ORTHO_FLIGHTS`).
 */
export const IMAGERY = {
  get title() { return tr('Агаарын зураг (ортофото)'); },
  get layers() { return ORTHO_FLIGHTS[DEFAULT_MESH_VER]; },
  get url() { return ORTHO_FLIGHTS[DEFAULT_MESH_VER][0].url; },
};

/**
 * «Иргэдэд хүрэх үр өгөөж» харагдацын 3D БОДИТ ЗАГВАР — гурван IntegratedMesh.
 */
export const IRGED_SCENE = {
  layers: [
    {
      key: "irged1",
      get title() { return tr('Бодит загвар — Сэлбэ 1'); },
      url: `${ENT_HOSTED}/Mesh_before_1_1/SceneServer`,
    },
    {
      key: "irged2",
      get title() { return tr('Бодит загвар — Сэлбэ 2'); },
      url: `${ENT_HOSTED}/Mesh_before_1_2/SceneServer`,
    },
    {
      key: "irged3",
      get title() { return tr('Бодит загвар — Сэлбэ 3'); },
      url: `${ENT_HOSTED}/Mesh_before_1_3/SceneServer`,
    },
  ],
} as const;

/**
 * НҮХЭН ЖОРЛОН — «Иргэдэд хүрэх үр өгөөж» харагдацын цэгэн давхарга (1,675 цэг).
 */
export const IRGED_TOILET = {
  id: "irged:toilet",
  get title() { return tr('Нүхэн жорлон'); },
  url: `${IRGED}/218`,
  /**
   * УЛБАР ШАР (хэрэглэгчийн сонголт) — гэрэлтэх эффекттэй хамт ажиллана.
   */
  hue: "#f97316",
} as const;

/**
 * НҮХЭН ЖОРЛОНГИЙН КАТАЛОГИЙН БИЧЛЭГ — давхаргын жагсаалтад мөр болж гарахын тулд.
 *
 * Каталог нь мөрөө `LAYER_BY_ID`-аас зурдаг тул ЗӨВХӨН тэнд бүртгэхэд хангалттай —
 * ил эсэхийг `visible` жагсаалт урьдын адил удирдана (`MapCanvas` дахь
 * `on.has(IRGED_TOILET.id)` шалгалт хэвээр ажиллана).
 */
export const IRGED_TOILET_DEF: LayerDef = {
  id: IRGED_TOILET.id,
  n: 0,
  url: IRGED_TOILET.url,
  get title() { return IRGED_TOILET.title; },
  topic: "plan",
  geom: "point",
  hue: IRGED_TOILET.hue,
  marker: "circle",
  size: 7,
  noZone: true,
};
LAYER_BY_ID[IRGED_TOILET_DEF.id] = IRGED_TOILET_DEF;

/**
 * ГЭР ХОРООЛЛЫН ОДООГИЙН БАРИЛГА — «Иргэдэд хүрэх үр өгөөж»-ийн «ӨМНӨ» тал.
 *
 * 6,627 полигон: «Байшин» 5,872 (225,151 м²) · «Гэр» 755 (58,308 м²)
 * — 2026-09-02-нд амьд үйлчилгээнээс хэмжсэн.
 */
export const IRGED_BUILT = {
  id: "irged:built",
  get title() { return tr('Одоогийн барилга (гэр хороолол)'); },
  url: `${IRGED}/217`,
  /** Ангиллын талбар — ЗӨВХӨН хоёр утгатай */
  typeField: "type",
  types: { house: "Байшин", ger: "Гэр" },
  areaField: "SHAPE__Area",
} as const;

/**
 * КАТАЛОГИЙН БИЧЛЭГ — `LAYERS`-д ОРУУЛААГҮЙ (`IRGED_TOILET_DEF`-ийн ижил
 * шалтгаан: `buildLayers` нь `LAYERS`-ийг шүүлтгүй давтдаг тул давхардсан id
 * үүснэ). Каталог мөрөө `LAYER_BY_ID`-аас зурна.
 */
export const IRGED_BUILT_DEF: LayerDef = {
  id: IRGED_BUILT.id,
  n: 0,
  url: IRGED_BUILT.url,
  get title() { return IRGED_BUILT.title; },
  topic: "gazar",
  geom: "area",
  hue: "#e879f9",
  fill: 0.18,
  width: 1.8,
  noZone: true,
  paint: {
    field: IRGED_BUILT.typeField,
    values: {
      [IRGED_BUILT.types.house]: "#e879f9",
      [IRGED_BUILT.types.ger]: "#22d3ee",
    },
    get emptyLabel() { return tr('Тодорхойгүй'); },
  },
  facets: [{ field: IRGED_BUILT.typeField, get label() { return tr('Төрөл'); } }],
};
/**
 * ЗУРГАН ДЭЭРХ бүдэг өнгө — байшин/гэр.
 */
export const IRGED_BUILT_MAP_HUE: Record<string, string> = {
  [IRGED_BUILT.types.house]: "#b58cc2",
  [IRGED_BUILT.types.ger]: "#6aa8b5",
};

LAYER_BY_ID[IRGED_BUILT_DEF.id] = IRGED_BUILT_DEF;

/**
 * ЗАМЫН ТӨЛӨВЛӨЛТ — «Иргэдэд хүрэх үр өгөөж» харагдацын вектор тайл давхарга.
 */
export const IRGED_ROAD = {
  id: "irged:road",
  get title() { return tr('Зам'); },
  url: `${ENT_HOSTED}/selberoad_TILE_1/VectorTileServer` as string,
} as const;


/**
 * БҮТЭЭН БАЙГУУЛАЛТЫН ӨМНӨХ ОРТОФОТО — зөвхөн «Иргэдэд хүрэх үр өгөөж»-д
 * (2026-10-05, хэрэглэгч: «иргэдийн үр өгөөжид бүтээн байгуулалтын өмнөх ортог нэм»).
 */
export const IRGED_ORTHO_PRE = {
  id: "irged:ortho-pre",
  get title() { return tr('Өмнөх ортофото (бүтээн байгуулалтаас өмнө)'); },
  url: (process.env.NEXT_PUBLIC_IRGED_ORTHO_PRE ?? "").trim().replace(/\/+$/, ""),
} as const;

/**
 * ХАМРАХ ХҮРЭЭНИЙ БУФЕР — нийгмийн байгууламжийн нормативын үйлчилгээний
 * радиус, ГАЗРЫН ЗУРАГТ тойрог болж зурагдана.
 */
export const REACH_BUFFERS: {
  key: string;
  title: string;
  /** Радиус, метр */
  m: number;
  hue: string;
  ids: string[];
}[] = [
  /**
   * «Нийгмийн дэд бүтэц» зурагт хамрах хүрээг ЯГ ингэж кодолсон: цэцэрлэг —
   * шар, сургууль — цайвар хөх. Портал тэр хэлийг давтаж байгаа нь танил
   * байдлыг хадгална.
   */
  /**
   * Зурган дээрх өнгө бүр аль хэдийн утга эзэлсэн: улбар шар — нүхэн жорлон,
   * ягаан/хөх — гэр хорооллын байшин, гэр, ногоон — нийгмийн барилга. Шар ба
   * цэнхэр буфер тэдгээртэй нийлж, «энэ ямар өнгө вэ» гэдэг тайлагдахаа
   * больсон. Цагаан нь ортофотогийн ямар ч дэвсгэр дээр ялгарах бөгөөд
   * порталын өгөгдлийн палитрт ЭЗЭНГҮЙ — тиймээс «хил, бүс» гэсэн БҮТЦИЙН
   * утгыг цэвэр дамжуулна.
   */
  {
    key: "kinder",
    get title() { return tr('Цэцэрлэг · 300 м'); },
    m: 300,
    hue: "#ffffff",
    ids: ["pkg:226", "pkg:234", "pkg:235", "pkg:236", "pkg:237"],
  },
  {
    key: "school",
    get title() { return tr('Сургууль · 500 м'); },
    m: 500,
    hue: "#7dd3fc",
    ids: ["pkg:230", "pkg:228", "pkg:232"],
  },
];

export const SCENE = {
  layers: [
    {
      key: "mesh1",
      get title() { return tr('Бодит загвар — Сэлбэ 1'); },
      url: `${ENT_HOSTED}/Mesh_nisleg_1_1/SceneServer`,
    },
    {
      key: "mesh2",
      get title() { return tr('Бодит загвар — Сэлбэ 2'); },
      url: `${ENT_HOSTED}/Mesh_nisleg_1_2/SceneServer`,
    },
  ],
} as const;

/**
 * 3D МЕШИЙН ХУВИЛБАР — «Нислэг 2» (2026-09-17, төслийн талбайн БҮТЭН меш)
 * ба «Нислэг 1» (Сэлбэ 1, 2). Сонгогч нь зургийн доод голд тусдаа хоёр товч.
 */
export type MeshVer = 'new' | 'old';

export const MESH_VERSIONS = {
  new: {
    get title() { return tr('Нислэг 2 (2026-09-17)'); },
    layers: [
      {
        key: "mesh0917",
        get title() { return tr('Бодит загвар — нислэг 2 (2026-09-17)'); },
        url: `${ENT_HOSTED}/Mesh_nisleg_2/SceneServer`,
      },
    ],
  },
  old: {
    get title() { return tr('Нислэг 1 (Сэлбэ 1, 2)'); },
    layers: SCENE.layers,
  },
} as const;

export const DEFAULT_MESH_VER: MeshVer = 'new';

/** Харьцуулалтын меш давхаргын id угтвар (`mesh:cmp:<key>`) */
export const MESH_CMP_PREFIX = 'mesh:cmp:';

/**
 * Гадаргуугийн өндөр — 3D-д ЗААВАЛ. Меш нь 1325–1440 м ортометрик өндөрт байх
 * бөгөөд хавтгай (0 м) гадаргуу дээр вектор давхаргууд түүний ~1350 м доор үлдэнэ.
 */
export const ELEVATION_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

/**
 * УСАН САН — ЗӨВХӨН 3D/BIM горимд нэмэгдэх талбайн давхарга (6 полигон).
 */
export const USAN_SAN = {
  id: "d3:usan_san",
  get title() { return tr('Усан сан'); },
  // test_data [89] usan_san_5 — 2026-08-13 шилжив (6 объект)
  url: `${SELBE_ET}/123`,
  /** Эх веб зургийн `5_n_usan_san` симбол — дүүргэлт 25%, хүрээ бүтэн */
  hue: "#003399",
} as const;

/**
 * ХАБЭА — Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй. ГУРВАН Survey123/FeatureServer:
 *   · labor    — өдрийн ажилтан/техникийн тоо (Survey123, цэг)
 *   · incident — осол, зөрчлийн бүртгэл (Survey123, цэг)
 *   · crane    — цамхагт краны цэг (layer 50) + аюулгүйн бүсийн полигон (layer 51)
 */
export const HABEA = {
  labor: {
    url: `${HABEA_SVC.labor}/FeatureServer/0`,
    /**
     * ЗӨВХӨН маягтын НИЙТ (roll-up) талбарууд. Шинэ маягт нь ажилтан/техникийг
     * ЗӨВХӨН гүйцэтгэгчийн дагавартай баганаар хөтөлдөг тул монгол/гадаад
     * задаргаа, техникийн ТӨРЛИЙН задаргаа дээд түвшинд БАЙХГҮЙ —
     * `laborCompanyFields(sfx)`-ээр компани тус бүрээс уншина.
     */
    fields: {
      ognoo: "ognoo",
      niitAjiltan: "niit_ajiltan",
      hunTsag: "hun_tsag",
      niitTehnik: "niit_tehnik",
    },
    /**
     * ӨРГӨН схем: маягтын НЭГ бүртгэл = өдрийн нэгдсэн тайлан бөгөөд ГҮЙЦЭТГЭГЧ
     * бүр өөрийн баганын бүлэгтэй (Survey123-ийн repeat → suffix-тэй багана).
     * Талбарын нэрийг `laborCompanyFields(sfx)`-ээр угсарна. `bagts` нь маягтын
     * domain-д ХАТУУ заагдсан багц; сүүлийн 5 нь багц заагдаагүй гүйцэтгэгч
     * (Bagts_* талбаргүй — bagts: null).
     */
    companies: [
      { sfx: "HHDMGK", code: "ХХДМГК", get label() { return tr('Хятадын хоёр дахь металлурги групп корпорац ХХК'); }, bagts: 'Багц -1' },
      { sfx: "HBZIT", code: "ХБЗИТ", get label() { return tr('Хятадын барилгын зургаадугаар инженерийн товчоо ХХК'); }, bagts: 'Багц -2' },
      { sfx: "HBTIT", code: "ХБТИТ", get label() { return tr('Хятадын барилгын тавдугаар инженерийн товчоо ХХК'); }, bagts: 'Багц -3.1' },
      { sfx: "MSK", code: "МСК", get label() { return tr('Морин сувд констракшн ХХК'); }, bagts: 'Багц -3.2' },
      { sfx: "NBG", code: "НБГ", get label() { return tr('Нутгийн буян групп ХХК'); }, bagts: 'Багц -3.3' },
      { sfx: "MK", code: "МК", get label() { return tr('Монкон констракшн ХХК'); }, bagts: 'Багц -4.1' },
      { sfx: "P", code: "П", get label() { return tr('Професионалстрой ХХК'); }, bagts: 'Багц -4.2' },
      { sfx: "MMSE", code: "ММСЕ", label: "MMSE", bagts: null },
      { sfx: "SC", code: "SC", label: "Smart craft", bagts: null },
      { sfx: "OSNAAG", code: "ОСНААГ", get label() { return tr('ОСНААГ'); }, bagts: null },
      { sfx: "GUBB", code: "ГУББ", get label() { return tr('ГУББ'); }, bagts: null },
      { sfx: "CHHO", code: "ЧХО", get label() { return tr('Чингэлтэй хөрөнгө оруулалтын'); }, bagts: null },
    ],
  },
  incident: {
    url: `${HABEA_SVC.incident}/FeatureServer/0`,
    fields: {
      ognoo: "field_22", company: "field_5", bagts: "field_6", dugaar: "field_9",
      turul: "field_7", medeelel: "field_14", shaltgaanTurul: "field_11",
      shaltgaan: "field_13", argaHemjee: "field_18",
    },
  },
  /**
   * ЦАМХАГТ КРАН — ЭХ ҮЙЛЧИЛГЭЭ (2026-09-04, хэрэглэгчийн хүсэлт).
   */
  crane: {
    url: `${HAB_KRAN}/194`,
    bufferUrl: `${HAB_KRAN}/195`,
    fields: {
      dugaar: 'краны_дугаар', blok: 'блок', bagts: 'багц',
      sunUrt: 'краны_суны_урт_m',
      undur: 'краны_өндөр_m', tuluv: "tuluv",
      oid: 'objectid',
      bufferLink: 'orig_fid',
      link: 'orig_oid',
    },
  },

  /**
   * АЖЛЫН БАЙРНЫ ҮЗЛЭГ — ХОЁР Survey123 маягт (2026-09-06, хэрэглэгчийн
   * хүсэлт). Хоёулаа ~50 шалгах зүйлтэй, тус бүр 5 утгатай домэйнтэй,
   * дээр нь тэдгээрийн НИЙЛБЭР болох `cnt_*` таван талбар.
   */
  /**
   * ХАБ-ЫН БҮРТГЭЛҮҮД — «Бусад үзүүлэлт» карт (2026-10-08, хэрэглэгчийн хүсэлт).
   * ХҮСНЭГТҮҮД (давхарга биш). `table: null` = эх сурвалж хараахан байхгүй мөр (карт «—»).
   */
  registers: {
    url: `${ENT_HOSTED}/${encodeURIComponent('Сэлбэ_ХАБ1015')}/FeatureServer`,
    /** GlobalID талбар (`supportsApplyEditsWithGlobalIds`) — хариу алдагдвал үүгээр шалгана */
    gidField: 'globalid',
    items: [
      { key: 'zaavar', table: 40, date: 'огноо', get label() { return tr('Талбайн зааварчилгаа'); } },
      { key: 'sanuulah', table: 42, date: 'баримтын_он__сар__өдөр', get label() { return tr('Сануулах хуудас'); } },
      { key: 'hariutslaga', table: 37, date: 'огноо', get label() { return tr('Хариуцлага тооцох'); } },
      { key: 'ayul', table: null, date: null, get label() { return tr('Аюулыг мэдээлэх хуудас'); } },
      { key: 'saijruulalt', table: 33, date: null, week: 'week', sum: 'тоо', get label() { return tr('Сайжруулалт'); } },
    ] as {
      key: string; table: number | null; date: string | null;
      /** Огноогүй хүснэгт — долоо хоногийн дугаарын талбар ба нийлүүлэх тооны талбар */
      week?: string; sum?: string;
      readonly label: string;
    }[],
  },
  /**
   * ХОГ ХАЯГДАЛ — «Хог хаягдал» карт (2026-10-08, хэрэглэгчийн хүсэлт). `Хог_хаягдал`
   * FeatureServer/0 — нийтэд нээлттэй ХҮСНЭГТ. Мөр = (долоо хоног × хаягдлын төрөл),
   * багана = багц бүрийн тоо. Талбарын нэрс амьд метадатаас ЯГ хуулав.
   */
  waste: {
    url: `${ENT_HOSTED}/${encodeURIComponent('Сэлбэ_ХАБ1015')}/FeatureServer/43`,
    fields: { week: 'week', metric: 'metric', category: 'category', oid: 'objectid' },
    /**
     * Багцын багана → хуудасны «Багц» шүүлтийн нэр (`habeaPkgKey`-д).
     */
    pkgCols: [
      ['bagts1', 'Багц 1'], ['bagts2', 'Багц 2'], ['bagst3_1', 'Багц 3.1'], ['bagst3_2', 'Багц 3.2'],
      ['bagst3_3', 'Багц 3.3'], ['bagst4_1', 'Багц 4.1'], ['bagst4_2', 'Багц 4.2'],
    ] as [string, string][],
    /** Донатын төрлүүд — ЯГ `Metric` домэйны кодоор, дэлгэцийн нэр ба өнгө */
    kinds: [
      { metric: 'Бетон (рейс)', get label() { return tr('Бетон'); }, color: '#e8a33d' },
      { metric: 'Ахуйн хог (рейс)', get label() { return tr('Ахуйн хог'); }, color: '#4a90e2' },
      { metric: 'Модны хог (рейс)', get label() { return tr('Модны хаягдал'); }, color: '#2fa36b' },
      { metric: 'Арматур (рейс)', get label() { return tr('Арматур'); }, color: '#8a94a6' },
      { metric: 'Аюултай хог (рейс)', get label() { return tr('Аюултай хог'); }, color: '#d9534f' },
      { metric: 'Барилгын хог хаягдал', get label() { return tr('Барилгын хог'); }, color: '#b07d3c' },
      { metric: 'Бохир соруулах', get label() { return tr('Бохир соруулах'); }, color: '#7c6fb0' },
    ],
  },
  /**
   * ҮЛ НИЙЦЛИЙН АРИЛГАЛТ — `HSE_Action` (2026-10-26, `modules/HabeaAction.tsx`). Нэг үйлчилгээнд V1.1 ба захиалагчийн
   * маягтын үл нийцэл хоёулаа (`survey` талбараар ялгана). Давхарга 2 (0 БИШ — амьд метадата).
   */
  action: {
    url: `${ENT_HOSTED}/HSE_Action/FeatureServer/2`,
    survey: 'Захиалагчийн ажлын байрны үзлэг 2026',
  },
  uzleg: {
    v11: {
      get title() { return tr('Ажлын байрны үзлэг V1.1'); },
      url: `${HABEA_SVC.uzlegV11}/FeatureServer/0`,
    },
    guitsetgegch: {
      get title() { return tr('Гүйцэтгэгчийн ажлын байрны үзлэг'); },
      url: `${HABEA_SVC.uzlegG}/FeatureServer/0`,
    },
    /**
     * ЗАХИАЛАГЧИЙН АЖЛЫН БАЙРНЫ ҮЗЛЭГ (2026-09-17, хэрэглэгчийн хүсэлт).
     * «Захиалагчийн ажлын байрны үзлэг» фокуст V1.1-тэй ЗЭРЭГЦЭЭ баруун талд.
     */
    zahialagch: {
      get title() { return tr('Захиалагчийн ажлын байрны үзлэг'); },
      url: `${HABEA_SVC.uzlegZahialagch}/FeatureServer/0`,
    },
    env: {
      get title() { return tr('Байгаль орчны үзлэг'); },
      url: `${HABEA_SVC.uzEnv}/FeatureServer/0`,
    },
    cold: {
      get title() { return tr('Барилгын талбайн хүйтний үеийн түр зогсолтын бэлтгэл ажлын үзлэг шалгалт'); },
      url: `${HABEA_SVC.uzCold}/FeatureServer/0`,
    },
    fire: {
      get title() { return tr('ХАБЭАБО-н Ажлын байрны галын аюулгүй байдлын үзлэг - Барилгын талбай'); },
      url: `${HABEA_SVC.uzFire}/FeatureServer/0`,
    },
    hazard: {
      get title() { return tr('ХАБЭАБО-н Аюулыг илрүүлэх үзлэг - Барилгын талбай'); },
      url: `${HABEA_SVC.uzHazard}/FeatureServer/0`,
    },
    autocrane: {
      get title() { return tr('ХАБЭАБО-н Барилгын автокран шалгалт'); },
      url: `${HABEA_SVC.uzAutocrane}/FeatureServer/0`,
    },
    pump: {
      get title() { return tr('ХАБЭАБО-н Барилгын автопомп шалгалт'); },
      url: `${HABEA_SVC.uzPump}/FeatureServer/0`,
    },
    gondola: {
      get title() { return tr('ХАБЭАБО-н Барилгын люльк буюу дүүжинт өргүүрийн шалгалт'); },
      url: `${HABEA_SVC.uzGondola}/FeatureServer/0`,
    },
    tower: {
      get title() { return tr('ХАБЭАБО-н Барилгын цамхагт кран шалгалт'); },
      url: `${HABEA_SVC.uzTower}/FeatureServer/0`,
    },
    /** «Аюулыг илрүүлэх үзлэг»-ийн илрүүлэлтийн ХҮСНЭГТ (`findings`, `parentrowid` → эцгийн `uniquerowid`) — тайланд */
    hazardFindingsUrl: `${HABEA_SVC.uzHazard}/FeatureServer/1`,
    /** Хоёр маягтад ИЖИЛ талбарын нэрс */
    fields: {
      site: 'site', siteOther: 'site_other',
      company: 'company', companyOther: 'company_other',
      block: 'site_block', week: 'week', shift: 'shift',
      ognoo: 'insp_datetime',
      /** Үл нийцлийн зэрэг тус бүрийн ТОО — маягтын өөрийн нийлбэр талбарууд */
      major: 'cnt_major', minor: 'cnt_minor', obs: 'cnt_obs',
      conf: 'cnt_conf', na: 'cnt_na',
      /**
       * НИЙТ ОНОО — авсан ба боломжит (2026-09-17, амьд метадатаар батлав).
       */
      scEarned: 'sc_all_earned', scAppl: 'sc_all_appl',
    },
    fieldsBy: {
      env: { major: 'cnt_nc', minor: '', obs: '', conf: 'cnt_ok', na: 'cnt_na', scEarned: '', scAppl: '' },
      hazard: { major: 'cnt_high', minor: 'cnt_medium', obs: 'cnt_low', conf: 'cnt_fixed', na: 'cnt_obs', scEarned: '', scAppl: '' },
    },
  },
} as const;

/**
 * Гүйцэтгэгчийн баганын бүлгийн талбарууд — нэрс нь эх сервисээс ЯГ хуулагдсан
 * хэв маяг (`MNG_ajiltani_too_<SFX>` г.м). `Bagts_<SFX>` нь зөвхөн багц
 * заасан 7 гүйцэтгэгчид бий; бусдад нь байхгүй талбар уншихад undefined → 0.
 */
export const laborCompanyFields = (sfx: string) => {
  const s = sfx.toLowerCase();
  return {
    bagts: `bagts_${s}`,
    mongol: `mng_ajiltani_too_${s}`,
    gadaad: `g_ajiltanii_too_${s}`,
    niitAjiltan: `niit_ajiltan_${s}`,
    niitTehnik: `tehnik_${s}`,
  };
};

/**
 * BIM — барилгын мэдээллийн загвар (BuildingSceneLayer).
 */
const BIM_SCENE = ENT_HOSTED;

const BIM_SERVICES: { pkg: string; names: string[] }[] = [
  {
    pkg: '1',
    names: [
      'Багц_1_FID49_71_single', 'Багц_1_FID50_51_71_double', 'Багц_1_FID52_71_single',
      'Багц_1_FID53_54_71_double', 'Багц_1_FID55_117_single', 'Багц_1_FID56_117_single',
      'Багц_1_FID57_117_single', 'Багц_1_FID58_59_71_double', 'Багц_1_FID60_117_single',
      'Багц_1_FID61_117_single', 'Багц_1_FID62_63_71_double', 'Багц_1_FID64_117_single',
      'Багц_1_FID65_117_single', 'Багц_1_FID66_67_71_double', 'Багц_1_FID112_117_single',
    ],
  },
  {
    pkg: '2',
    names: [
      'Багц_2_FID78_71_single', 'Багц_2_FID79_80_71_double', 'Багц_2_FID81_71_single',
      'Багц_2_FID82_83_71_double', 'Багц_2_FID84_85_71_double', 'Багц_2_FID86_71_single',
      'Багц_2_FID87_71_single', 'Багц_2_FID88_71_single', 'Багц_2_FID89_71_single',
      'Багц_2_FID90_71_single', 'Багц_2_FID91_71_single', 'Багц_2_FID92_71_single',
      'Багц_2_FID93_71_single', 'Багц_2_FID94_71_single', 'Багц_2_FID95_71_single',
      'Багц_2_FID96_97_117_double', 'Багц_2_FID98_99_117_double', 'Багц_2_FID100_103_71_double',
      'Багц_2_FID101_71_single', 'Багц_2_FID102_71_single',
    ],
  },
  {
    pkg: '3.1',
    names: [
      'Багц_3_1_FID24_71_single', 'Багц_3_1_FID25_71_single', 'Багц_3_1_FID26_71_single',
      'Багц_3_1_FID27_71_single', 'Багц_3_1_FID28_71_single', 'Багц_3_1_FID29_71_single',
      'Багц_3_1_FID30_71_single', 'Багц_3_1_FID31_71_single', 'Багц_3_1_FID32_71_single',
      'Багц_3_1_FID33_71_single', 'Багц_3_1_FID34_71_single',
    ],
  },
  {
    pkg: '3.2',
    names: [
      'Багц_3_2_FID0_71_single', 'Багц_3_2_FID6_71_single', 'Багц_3_2_FID7_71_single',
      'Багц_3_2_FID8_9_71_double', 'Багц_3_2_FID17_71_single', 'Багц_3_2_FID18_71_single',
      'Багц_3_2_FID19_71_single', 'Багц_3_2_FID20_71_single', 'Багц_3_2_FID21_71_single',
      'Багц_3_2_FID22_71_single', 'Багц_3_2_FID23_71_single',
    ],
  },
  {
    pkg: '3.3',
    names: [
      'Багц_3_3_FID10_71_single', 'Багц_3_3_FID11_71_single', 'Багц_3_3_FID12_71_single',
      'Багц_3_3_FID13_71_single', 'Багц_3_3_FID14_71_single', 'Багц_3_3_FID15_71_single',
      'Багц_3_3_FID16_71_single', 'Багц_3_3_FID35_71_single', 'Багц_3_3_FID36_71_single',
      'Багц_3_3_FID37_71_single', 'Багц_3_3_FID38_71_single', 'Багц_3_3_FID39_71_single',
      'Багц_3_3_FID40_71_single', 'Багц_3_3_FID41_71_single',
    ],
  },
  {
    pkg: '4.1',
    names: [
      'Багц_4_1_FID1_71_single', 'Багц_4_1_FID2_71_single', 'Багц_4_1_FID3_71_71_double',
      'Багц_4_1_FID4_5_71_double', 'Багц_4_1_FID42_71_single', 'Багц_4_1_FID68_72_71_double',
      'Багц_4_1_FID69_70_71_double', 'Багц_4_1_FID73_71_single', 'Багц_4_1_FID74_71_single',
      'Багц_4_1_FID75_71_single', 'Багц_4_1_FID76_71_single', 'Багц_4_1_FID77_71_single',
    ],
  },
  {
    pkg: '4.2',
    names: [
      'Багц_4_2_FID43_71_single', 'Багц_4_2_FID44_71_single', 'Багц_4_2_FID45_71_single',
      'Багц_4_2_FID46_71_single', 'Багц_4_2_FID47_71_single', 'Багц_4_2_FID48_71_single',
      'Багц_4_2_FID104_71_tower', 'Багц_4_2_FID105_71_tower', 'Багц_4_2_FID106_71_tower',
      'Багц_4_2_FID107_71_tower', 'Багц_4_2_FID108_71_tower', 'Багц_4_2_FID109_71_tower',
      'Багц_4_2_FID110_71_tower', 'Багц_4_2_FID111_71_tower',
    ],
  },
];

/**
 * `Багц_1_FID62_63_71_double` → `62 · 63` · `Багц_4_2_FID104_71_tower` → `104`.
 */
const bimFids = (name: string): string => {
  const parts = name.match(/_FID(\d+(?:_\d+)*)_(?:single|double|tower)$/)?.[1]?.split('_');
  /* parts = [...FID, айл] — айлын хэсэг (сүүлийнх)-ийг хасна */
  return parts && parts.length > 1 ? parts.slice(0, -1).join(' · ') : name;
};

export const BIM = {
  layers: BIM_SERVICES.flatMap(({ pkg, names }) =>
    names.map((name) => ({
      key: `bim:${name}`,
      /** Багц — BIM сонгогчийн бүлэглэлт (`components/bimPicker`) */
      pkg,
      get title() { return tr('Багц {0} · FID {1}', pkg, bimFids(name)); },
      url: `${BIM_SCENE}/${encodeURIComponent(name)}/SceneServer`,
    })),
  ),
} as const;
