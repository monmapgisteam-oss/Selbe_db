import { t as tr } from '@/lib/i18nCore';
/**
 * ТЭЗҮ ба судалгааны БАРИМТ БИЧГҮҮД — навбарын «ТЭЗҮ» товчны popup-д харагдана.
 *
 * ⚠️ Файлууд `public/docs/`-д байрлана (статик экспорт тул `/docs/...` URL-аар
 * дуудагдана). Эх нэр нь кирилл/зайтай тул URL-д найдвартай ASCII slug болгосон.
 * `.gitignore`-ийн `!public/docs/*.pdf` тул эдгээр PDF git-д ОРДОГ — deploy-д
 * хамт явна. ⚠️ 2026-10-09 (аудит): хост одоо GitHub Pages (урьд Cloudflare Pages, 25 MB).
 * Git/GitHub нэг файлыг 100 MB-аар хязгаарладаг (түүнээс том файл push-д татгалзагдана),
 * Pages-ийн сайт бүхэлдээ ≤1 GB байхыг зөвлөдөг — том PDF нэмэхээс өмнө нийт хэмжээг бод.
 */
export type DocItem = {
  key: string;
  title: string;
  sub: string;
  /** `public/docs/` доторх файлын нэр — ГАДААД баримтад байхгүй */
  file?: string;
  /**
   * ГАДААД БАРИМТЫН ХАЯГ (SharePoint/OneDrive/Drive) — 2026-09-10.
   *
   * ⚠️ 2026-10-09 (аудит): хост одоо GitHub Pages — GitHub нэг файлыг 100 MB-аар
   *    хязгаарладаг (Pages-ийн сайт нийт ≤1 GB зөвлөмжтэй). «Барилгажилтын төсөл»
   *    (107 хуудас A0 зураг, 621 MB) үүнийг давсан тул репод ОРОХГҮЙ — гадна хостод
   *    байрлаж, эндээс зөвхөн ЛИНКЭЭР холбогдоно.
   * ⚠️ Ийм баримтыг `<iframe>`-д ШУУД тавихгүй: SharePoint нь
   *    `X-Frame-Options`-оор дотоод хүрээг хаадаг тул хоосон цагаан
   *    хүрээ л гарна. `DocViewer` тэдгээрт нээх ТОВЧ гаргана.
   */
  href?: string;
  /**
   * ГАДААД БАРИМТЫН ТОВЧНЫ БИЧВЭР (2026-09-10, хэрэглэгчийн заавар).
   *
   * ⚠️ Гарчгийг ТОМЬЁОНД оруулахгүй, БҮТЭН өгүүлбэрээр бичнэ: монгол хэлэнд
   * нэр нь тийн ялгалаар хувирдаг («Барилгажилтын төсөл» → «…төслийг»)
   * тул `{0}-ийг` гэсэн загвар нь «төсөл-ийг» гэж эвдэрнэ.
   */
  cta?: string;
};

export const DOCS: DocItem[] = [
  {
    key: "tezu",
    get title() { return tr('ТЭЗҮ (Rev-01)'); },
    get sub() { return tr('Техник эдийн засгийн үндэслэл'); },
    file: "tezu-rev-01.pdf",
  },
  {
    key: "deia18",
    get title() { return tr('ДБОНҮ 2018'); },
    get sub() { return tr('Байгаль орчны нарийвчилсан үнэлгээ (MN)'); },
    file: "deia-2018-mn.pdf",
  },
  {
    key: "deia13",
    title: "DEIA 2013",
    sub: "Selbe subcenter final report (EN)",
    file: "selbe-subcenter-deia-2013.pdf",
  },
  /* ⚠️ 2026-08-25: «БОННҮ тайлан» (bonnu-tailan.pdf, 89.7 MB) ХАСАГДАВ —
     тухайн үеийн хост Cloudflare Pages-ийн нэг файлын 25 MB хязгаараас хэтэрдэг байв.
     ⚠️ 2026-10-09 (аудит): хост одоо GitHub Pages (нэг файл 100 MB хүртэл, сайт нийт ≤1 GB
     зөвлөмж) — 89.7 MB нь техникийн хувьд багтах ч хязгаарт ойр бөгөөд git-ийн түүхэнд
     үүрд үлдэнэ (GitHub 50 MB-аас дээш файлд анхааруулдаг). Буцааж нэмэхээр бол гадна
     хостод байршуулж `href`-ээр холбох нь дээр. */
  {
    key: 'barilgajilt',
    get title() { return tr('Барилгажилтын төсөл'); },
    get sub() { return tr('107 хуудас · A0 зураг · гадаад холбоос'); },
    /* ⚠️ 621 MB тул репод ОРОХГҮЙ — `href`-ийн тайлбарыг үз */
    href: 'https://monmapm-my.sharepoint.com/:b:/g/personal/maralgoo_monmap_mn/IQBNrkEg2fPoTbCZL_lgoGmHASsRJIwiELl6ytVr2V9Xgo0?e=TfyFJp',
    get cta() { return tr('Барилгажилтын төслийг шинэ таб-д нээж харна уу'); },
  },
];

/** `public/docs/` дэд замын үндэс */
export const DOCS_BASE = "/docs";

/** Баримтын бүтэн зам (browser URL) — гадаад бол түүний хаяг */
export const docUrl = (d: DocItem) => d.href ?? `${DOCS_BASE}/${d.file}`;

/** Гадаад хостод байгаа юу — `<iframe>`-д тавихгүй (`href`-ийн тайлбар) */
export const isExternalDoc = (d: DocItem) => d.href != null;
