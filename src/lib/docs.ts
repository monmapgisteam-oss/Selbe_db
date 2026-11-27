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
  /* 2026-11-27 (аудит): ТЭЗҮ (Rev-01), ДБОНҮ 2018, DEIA 2013 PDF-үүд `public/docs/`-д байж GitHub Pages-ээр нэвтрэлтгүй нээгддэг
     байсан тул хасав — баримтын сангийн «ТЭЗҮ-БОНУ» бүлэгт геопорталын item болгон оруулна (токеноор, байгууллагад). */
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
