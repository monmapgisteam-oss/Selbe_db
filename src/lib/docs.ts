import { t as tr } from '@/lib/i18nCore';
/**
 * ТЭЗҮ ба судалгааны БАРИМТ БИЧГҮҮД — навбарын «ТЭЗҮ» товчны popup-д харагдана.
 *
 * ⚠️ Файлууд `public/docs/`-д байрлана (статик экспорт тул `/docs/...` URL-аар
 * дуудагдана). Эх нэр нь кирилл/зайтай тул URL-д найдвартай ASCII slug болгосон.
 * `.gitignore`-ийн `!public/docs/*.pdf` тул эдгээр PDF git-д ОРДОГ — deploy-д
 * хамт явна. ⚠️ Cloudflare Pages-ийн нэг файлын хязгаар 25 MB: түүнээс том
 * баримт энд нэмж БОЛОХГҮЙ (deploy бүхэлдээ унана).
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
   * ⚠️ Cloudflare Pages нь нэг файлыг 25 MB-аар, GitHub 100 MB-аар
   *    хязгаарладаг. «Барилгажилтын төсөл» (107 хуудас A0 зураг,
   *    621 MB) хоёуланг нь давсан тул репод ОРОХГҮЙ — гадна хостод
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
    title: tr('ТЭЗҮ (Rev-01)'),
    sub: tr('Техник эдийн засгийн үндэслэл'),
    file: "tezu-rev-01.pdf",
  },
  {
    key: "deia18",
    title: tr('ДБОНҮ 2018'),
    sub: tr('Байгаль орчны нарийвчилсан үнэлгээ (MN)'),
    file: "deia-2018-mn.pdf",
  },
  {
    key: "deia13",
    title: "DEIA 2013",
    sub: "Selbe subcenter final report (EN)",
    file: "selbe-subcenter-deia-2013.pdf",
  },
  /* ⚠️ 2026-08-25: «БОННҮ тайлан» (bonnu-tailan.pdf, 89.7 MB) ХАСАГДАВ —
     Cloudflare Pages-ийн нэг файлын 25 MB хязгаараас хэтэрдэг тул deploy-г
     унагана. Хэрэгтэй болвол R2/өөр хостод байршуулж энд буцааж нэмнэ. */
  {
    key: 'barilgajilt',
    title: tr('Барилгажилтын төсөл'),
    sub: tr('107 хуудас · A0 зураг · гадаад холбоос'),
    /* ⚠️ 621 MB тул репод ОРОХГҮЙ — `href`-ийн тайлбарыг үз */
    href: 'https://monmapm-my.sharepoint.com/:b:/g/personal/maralgoo_monmap_mn/IQBNrkEg2fPoTbCZL_lgoGmHASsRJIwiELl6ytVr2V9Xgo0?e=TfyFJp',
    cta: tr('Барилгажилтын төслийг шинэ таб-д нээж харна уу'),
  },
];

/** `public/docs/` дэд замын үндэс */
export const DOCS_BASE = "/docs";

/** Баримтын бүтэн зам (browser URL) — гадаад бол түүний хаяг */
export const docUrl = (d: DocItem) => d.href ?? `${DOCS_BASE}/${d.file}`;

/** Гадаад хостод байгаа юу — `<iframe>`-д тавихгүй (`href`-ийн тайлбар) */
export const isExternalDoc = (d: DocItem) => d.href != null;
