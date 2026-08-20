import { t as tr } from '@/lib/i18nCore';
/**
 * ТЭЗҮ ба судалгааны БАРИМТ БИЧГҮҮД — навбарын «ТЭЗҮ» товчны popup-д харагдана.
 *
 * ⚠️ Файлууд `public/docs/`-д байрлана (статик экспорт тул `/docs/...` URL-аар
 * дуудагдана). Эх нэр нь кирилл/зайтай тул URL-д найдвартай ASCII slug болгосон.
 * `.gitignore`-т `*.pdf` байгаа тул git-д орохгүй — локал болон локал build-д л
 * ажиллана (deploy-ийн тайлбарыг төлөвлөгөөнөөс үзнэ үү).
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
  {
    key: "bonnu",
    title: tr('БОННҮ тайлан'),
    sub: tr('Хот төлөвлөлтийн институт — хавсралт'),
    file: "bonnu-tailan.pdf",
  },
];

/** `public/docs/` дэд замын үндэс */
export const DOCS_BASE = "/docs";

/** Баримтын бүтэн зам (browser URL) */
export const docUrl = (d: DocItem) => `${DOCS_BASE}/${d.file}`;
