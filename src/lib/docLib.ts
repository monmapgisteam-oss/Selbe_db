'use client';
/**
 * БАРИМТ БИЧГИЙН САН (2026-10-23, хэрэглэгч: «баримт бичгийн сан болгож бүлэглэн PDF оруулах боломжтой болго; баримт
 * бичиг Enterprise-д хадгалагдана; өмнө оруулсан ТЭЗҮ-БОНУ-г устга» — хуучин файлууд «ТЭЗҮ-БОНУ» бүлэгт үлдэнэ).
 *
 *   · БҮЛЭГ — `docsGroups` эрхтэй хүн нэмнэ / нэр солино / устгана (PDF оруулах нь тусдаа `docsUpload`); эрхийн хүснэгтийн `__sys__:docgroups` мөр
 *     (`permsRemote.docGroupsRead/Write`). Мөр алга бол анхдагч ганц «ТЭЗҮ-БОНУ» бүлэг.
 *   · PDF — Enterprise геопорталын item (`entDocs.entUploadPdf`), эзний «barimt bichig pdf» хавтсанд (`DOC_FOLDER`),
 *     байгууллагад хуваалцана. Бүлэг нь item-ийн таг `selbe-docgrp:<id>`; тагГҮЙ (хуучин) item → «ТЭЗҮ-БОНУ».
 *   · ХУУЧИН СТАТИК баримтууд (`lib/docs.ts` — `public/docs/*.pdf` · гадаад холбоос) «ТЭЗҮ-БОНУ» бүлэгт ЗӨВХӨН УНШИХ.
 *
 * ⚠️ Харах нь нэвтэрсэн БҮХ хэрэглэгчид; бичих бүх зам `requireCap('docsUpload')` (UI нуугдсан ч консолоос хаана).
 * ⚠️ PDF устгах/шилжүүлэх нь порталын дүрмээр ЗӨВХӨН эзэн эсвэл порталын админ — бусдад портал өөрөө татгалзана.
 */
import { docGroupsRead, docGroupsWrite, type DocGroupRow } from './permsRemote';
import { entDeletePdf, entListPdfs, entSetTags, entUploadPdf, ENT_TAG, type EntPdf } from './entDocs';
import { requireCap } from './who';
import { t as tr } from './i18nCore';

export type DocGroup = DocGroupRow;

/** Хуучин (бүлгийн тагГҮЙ) PDF ба статик баримтын бүлэг */
export const TEZU_GROUP = 'tezu';
/** Item-ийн бүлгийн тагийн угтвар */
export const GROUP_TAG = 'selbe-docgrp:';
/** PDF хадгалах геопорталын хавтас (эзэн тус бүрд — `entDocs.folderId`) */
export const DOC_FOLDER = 'barimt bichig pdf';

export const defaultGroups = (): DocGroup[] => [{ id: TEZU_GROUP, title: tr('ТЭЗҮ-БОНУ') }];

/**
 * ⚠️ 2026-10-26 (аудит): «ТЭЗҮ-БОНУ» бүлгийн нэр ArcGIS-д ХЭЛНЭЭС ҮЛ ХАМААРАХ МОНГОЛ ЭХ ТЕКСТЭЭР хадгалагдана
 *    (`huvaariBatlah.STUCK_PREFIX_SRC`-ийн сургамж) — дэлгэцэнд `tr()`-ээр. Урьд нь `defaultGroups()`-ийн ОРЧУУЛСАН нэр
 *    анхны засварлагчийн хэлээр (англи горимд «Feasibility study & research») `__sys__:docgroups`-д бичигдэж, бусад бүх
 *    хэрэглэгчид тэр хэлээр л харагдах байв. Гараар солисон нэр хэвээр.
 */
export const TEZU_TITLE_SRC = 'ТЭЗҮ-БОНУ';
/** Анхдагч нэрийн хадгалагдаж болзошгүй хэлбэрүүд — эх ба (урьд нь бичигдсэн байж болох) англи орчуулга */
const TEZU_TITLE_FORMS = new Set([TEZU_TITLE_SRC, 'Feasibility study & research']);
const isTezuDefault = (g: DocGroup): boolean =>
  g.id === TEZU_GROUP && (TEZU_TITLE_FORMS.has(g.title) || g.title === tr('ТЭЗҮ-БОНУ'));
/** Хадгалах хэлбэр — анхдагч нэр нь эх текстээр */
export const storeGroups = (gs: readonly DocGroup[]): DocGroup[] =>
  gs.map((g) => (isTezuDefault(g) ? { ...g, title: TEZU_TITLE_SRC } : g));
/** Харуулах хэлбэр — анхдагч нэр нь идэвхтэй хэлээр */
export const showGroups = (gs: readonly DocGroup[]): DocGroup[] =>
  gs.map((g) => (isTezuDefault(g) ? { ...g, title: tr('ТЭЗҮ-БОНУ') } : g));

/** Бүлгүүд — уншиж чадаагүй бол алдаа шиднэ (хоосон жагсаалтаар дарж бичихгүйн тулд) */
export async function loadGroups(): Promise<DocGroup[]> {
  const r = await docGroupsRead();
  if (r === undefined) throw new Error(tr('Баримтын бүлгүүдийг уншиж чадсангүй — дахин оролдоно уу.'));
  if (r === null || r.length === 0) return defaultGroups();
  return r.some((g) => g.id === TEZU_GROUP) ? showGroups(r) : [...defaultGroups(), ...r];
}

/**
 * Бүлгийн жагсаалтыг хадгална — `apply` нь ШИНЭЭР уншсан жагсаалт дээр ЗӨВХӨН энэ үйлдлийн өөрчлөлтийг (нэмэх · нэр
 * солих · устгах) хийнэ; бичигдсэн жагсаалтыг буцаана.
 * ⚠️ 2026-10-23: өмнө нь цонх нээхэд уншсан ХУУЧИН жагсаалтаар `__sys__:docgroups` мөрийг бүхэлд нь дарж бичдэг байв —
 * зэрэг засварлавал нөгөө хүний бүлэг алга болж, тэр бүлгийн PDF-үүд чимээгүй «ТЭЗҮ-БОНУ» руу шилждэг байв.
 */
export async function saveGroups(apply: (cur: DocGroup[]) => DocGroup[]): Promise<DocGroup[]> {
  /* ⚠️ 2026-10-23: бүлэг засах нь ТУСДАА эрх (`docsGroups`) — PDF оруулах (`docsUpload`)-аас салгав */
  requireCap('docsGroups');
  const next = apply(await loadGroups());
  if (!(await docGroupsWrite(storeGroups(next)))) throw new Error(tr('Баримтын бүлгийг хадгалж чадсангүй — дахин оролдоно уу.'));
  return next;
}

/** `groupId` бүлгийн ТАГтай PDF байна уу — устгахын өмнөх шалгалт (`groupOf` үл мэдэгдэх id-г ТЭЗҮ руу унагадаг) */
export const hasGroupTag = (list: readonly EntPdf[], groupId: string): boolean => {
  const tag = (GROUP_TAG + groupId).toLowerCase();
  return list.some((d) => (d.tags ?? []).some((t) => t.toLowerCase() === tag));
};

/** Шинэ бүлгийн тогтвортой id (нэрнээс хамааралгүй — нэр солиход PDF-ийн таг хөндөгдөхгүй) */
export const newGroupId = (): string => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Item аль бүлгийнх вэ — тагГҮЙ эсвэл үл мэдэгдэх бүлэг → «ТЭЗҮ-БОНУ» */
export function groupOf(pdf: EntPdf, groups: readonly DocGroup[]): string {
  const t = (pdf.tags ?? []).find((x) => x.toLowerCase().startsWith(GROUP_TAG));
  const id = t ? t.slice(GROUP_TAG.length) : '';
  return id && groups.some((g) => g.id === id) ? id : TEZU_GROUP;
}

/**
 * FIC · М-актын PDF мөн үү — тэдгээр нь чанарын урсгалынх (`ficMakt`), сангийн баримт БИШ. Шинэ item `selbe-fm` тагтай;
 * хуучин (тагГҮЙ) item-ийг `ficMakt.addFm`-ийн гарчгийн хэлбэрээр («FIC · …» · «М-акт · …») танина.
 */
export const isFmPdf = (d: EntPdf): boolean =>
  (d.tags ?? []).some((t) => t.toLowerCase() === 'selbe-fm') || /^(FIC|М-акт) · /.test(d.title);

export const listPdfs = async (): Promise<EntPdf[]> => (await entListPdfs()).filter((d) => !isFmPdf(d));

export async function uploadPdf(file: File, groupId: string): Promise<{ item: EntPdf; warn?: string }> {
  requireCap('docsUpload');
  return entUploadPdf(file, undefined, [GROUP_TAG + groupId], DOC_FOLDER);
}

export async function deletePdf(pdf: EntPdf): Promise<void> {
  requireCap('docsUpload');
  await entDeletePdf(pdf.id, pdf.owner);
}

/** PDF-ийг өөр бүлэгт шилжүүлнэ — хуучин бүлгийн тагийг хасаж, шинийг нэмнэ */
export async function movePdf(pdf: EntPdf, groupId: string): Promise<string[]> {
  requireCap('docsUpload');
  const keep = (pdf.tags ?? []).filter((x) => !x.toLowerCase().startsWith(GROUP_TAG));
  const tags = [...new Set([ENT_TAG, ...keep, GROUP_TAG + groupId])];
  await entSetTags(pdf.id, pdf.owner, tags);
  return tags;
}
