import { t as tr } from '@/lib/i18nCore';
import { entDeletePdf, entItemBlob, entSearch, entUploadDoc, type EntPdf } from '@/lib/entDocs';

/**
 * MA · MIR-ИЙН БАРИМТ (гэрчилгээ · лабораторийн дүн · зураг …) — ГЕОПОРТАЛЫН ТУСДАА ITEM (2026-10-29, хэрэглэгчийн
 * шийдвэр: «тусдаа item болгож орхи, survey-ийн хавтсанд»). FIC · М-акт-тай ижил зам (`entDocs`): item бүр байгууллагад
 * хуваалцагдана, оруулагчийн «Survey-MA» / «Survey-MIR» хавтсанд.
 *
 *   · Холбоос — item-ийн ТАГ: `selbe-chanar-doc` + `ma:<хариу бичгийн №>` эсвэл `mir:<uniquerowid>`; жагсаалт = тагаар хайлт.
 *   · Мета (төрөл · гэрчилгээний № · стандарт · хүчинтэй хугацаа · нэр) — item-ийн `description`-д `k=v;…` (`formatKeywords`).
 *   · Feature service-ийн attachment БИШ — MA давхаргад attachments асаах оролдлого (updateDefinition) хэрэгжээгүй.
 */
export const DOC_TAG = 'selbe-chanar-doc';

export const ATT_TYPES = ['response', 'submittal', 'conf', 'lab', 'qual', 'spec', 'maker', 'photo', 'transl', 'other'] as const;
export type AttType = (typeof ATT_TYPES)[number];
export const attTypeLabel = (t: string): string => ({
  response: tr('Хариу бичгийн эх скан'), submittal: tr('Гүйцэтгэгчийн MA хүсэлт'), conf: tr('Тохирлын гэрчилгээ'),
  lab: tr('Лабораторийн дүн'), qual: tr('Чанарын гэрчилгээ'), spec: tr('Техникийн үзүүлэлт / каталог'),
  maker: tr('Үйлдвэрлэгчийн бүртгэл, зөвшөөрөл'), photo: tr('Зураг'), transl: tr('Орчуулга'), other: tr('Бусад'),
} as Record<string, string>)[t] ?? t;

/** Баримтын мета — `k=v;…` хэлбэрээр (≤255 тэмдэгт; `;` `=` утгаас хасна) */
export type AttMeta = { type: AttType | string; no?: string; std?: string; valid?: string; title?: string };
const clean = (s: string | undefined, max: number) => (s ?? '').replace(/[;=]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export function formatKeywords(m: AttMeta): string {
  const parts = [`t=${clean(m.type, 16) || 'other'}`];
  if (m.no) parts.push(`no=${clean(m.no, 60)}`);
  if (m.std) parts.push(`std=${clean(m.std, 60)}`);
  if (m.valid && /^\d{4}-\d{2}-\d{2}$/.test(m.valid)) parts.push(`valid=${m.valid}`);
  if (m.title) parts.push(`ti=${clean(m.title, 80)}`);
  return parts.join(';').slice(0, 255);
}
export function parseKeywords(k: string | null | undefined): AttMeta {
  const m: AttMeta = { type: 'other' };
  for (const p of (k ?? '').split(';')) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    const key = p.slice(0, i).trim(); const v = p.slice(i + 1).trim();
    if (key === 't' && v) m.type = v;
    else if (key === 'no') m.no = v;
    else if (key === 'std') m.std = v;
    else if (key === 'valid' && /^\d{4}-\d{2}-\d{2}$/.test(v)) m.valid = v;
    else if (key === 'ti') m.title = v;
  }
  /* Survey123-ын өөрийн хавсралт (keywords = асуултын нэр) → төрөл нь тэр нэр */
  if (m.type === 'other' && k && !k.includes('=')) m.type = k.trim();
  return m;
}
/** Хүчинтэй хугацаа дууссан эсэх (өнөөдрөөс өмнө) */
export const isExpired = (valid: string | undefined, now = Date.now()): boolean =>
  !!valid && new Date(`${valid}T23:59:59`).getTime() < now;

export type ChanarDoc = {
  /** Порталын item id */
  id: string;
  name: string;
  size: number | null;
  contentType: string;
  meta: AttMeta;
  owner: string;
  modified: number;
};

/** Баримтын эзэн (MA эсвэл MIR): `key` — холбоосын таг, `folder` — оруулагчийн геопорталын хавтас */
export type DocSubject = { key: string; folder: string };

/** Хайлтын таг — `ma:<№>` · `mir:<guid>`; тагт зай · таслал орохгүй (портал тагийг таслалаар задалдаг) */
export const docKey = (kind: 'ma' | 'mir', id: string): string => `${kind}:${id.replace(/[,\s{}"']/g, '').toLowerCase()}`;

export function docOfItem(it: EntPdf): ChanarDoc {
  return {
    id: it.id, name: it.name || it.title, size: it.size, contentType: it.type === 'Image' ? 'image/*' : 'application/pdf',
    meta: { ...parseKeywords(it.description), ...(it.description?.includes('ti=') ? {} : { title: it.title }) },
    owner: it.owner, modified: it.modified,
  };
}

/** Тухайн MA/MIR-ийн баримтууд (сүүлд өөрчлөгдсөн нь эхэнд). Хайлт тагаар; үр дүнг тагаар дахин шүүнэ (хайлт ойролцоо таардаг). */
export async function listDocs(key: string): Promise<ChanarDoc[]> {
  const items = await entSearch(`tags:"${DOC_TAG}" AND tags:"${key}"`);
  return items.filter((it) => (it.tags ?? []).includes(key)).map(docOfItem);
}

export async function addDoc(subject: DocSubject, file: File, meta: AttMeta): Promise<{ doc: ChanarDoc; warn?: string }> {
  const title = (meta.title ?? '').trim() || file.name.replace(/\.(pdf|jpe?g|png)$/i, '');
  const { item, warn } = await entUploadDoc(file, {
    title, folder: subject.folder, description: formatKeywords({ ...meta, title }),
    tags: [DOC_TAG, subject.key, `t:${(meta.type || 'other').replace(/[,\s]/g, '')}`],
  });
  return { doc: docOfItem({ ...item, description: formatKeywords({ ...meta, title }), name: item.name || file.name }), warn };
}

/** Item устгана — порталд зөвхөн эзэн / админ; бусдад портал татгалзана (алдаа ил) */
export const deleteDoc = (doc: ChanarDoc): Promise<void> => entDeletePdf(doc.id, doc.owner);

/** Баримтын файл — токентой POST, Blob (objectURL-ээр нээнэ) */
export const docBlob = (doc: ChanarDoc): Promise<Blob> => entItemBlob(doc.id);
