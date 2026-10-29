import { t as tr } from '@/lib/i18nCore';
/**
 * ТЭЗҮ ба судалгааны БАРИМТ БИЧГҮҮД — навбарын «ТЭЗҮ» товчны popup-д харагдана.
 */
export type DocItem = {
  key: string;
  title: string;
  sub: string;
  /** `public/docs/` доторх файлын нэр — ГАДААД баримтад байхгүй */
  file?: string;
  /**
   * ГАДААД БАРИМТЫН ХАЯГ (SharePoint/OneDrive/Drive) — 2026-09-10.
   */
  href?: string;
  /**
   * ГАДААД БАРИМТЫН ТОВЧНЫ БИЧВЭР (2026-09-10, хэрэглэгчийн заавар).
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
  {
    key: 'barilgajilt',
    get title() { return tr('Барилгажилтын төсөл'); },
    get sub() { return tr('107 хуудас · A0 зураг · гадаад холбоос'); },
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
