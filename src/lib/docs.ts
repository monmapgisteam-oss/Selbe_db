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
  /** `public/docs/` доторх файлын нэр */
  file: string;
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
];

/** `public/docs/` дэд замын үндэс */
export const DOCS_BASE = "/docs";

/** Баримтын бүтэн зам (browser URL) */
export const docUrl = (d: DocItem) => `${DOCS_BASE}/${d.file}`;
