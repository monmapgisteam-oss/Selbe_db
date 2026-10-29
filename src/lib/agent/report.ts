/**
 * ТАЙЛАН ФАЙЛ — ```report блокийн задлалт ба баримтын загвар (ЦЭВЭР логик).
 */

import { t as tr } from '@/lib/i18nCore';
import { headingOf, type MdBlock } from './blocks';

export const REPORT_FORMATS = ['pdf', 'docx', 'xlsx', 'csv'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export type ReportSpec = {
  /** Хоосон байж болно — дэлгэцэд `tr('Тайлан')` орлуулна (орчуулга UI талд) */
  title: string;
  formats: ReportFormat[];
};

/** Гарчгийн дээд урт — PDF-ийн толгой, Excel-ийн хуудасны нэрэнд багтана */
export const MAX_TITLE = 60;

/**
 * ```report блокийн биеийг `ReportSpec` болгоно. Хэлбэр таарахгүй бол `null`
 * (дуудагч блокийг алгасна — хэрэглэгчид түүхий JSON ХЭЗЭЭ Ч харагдахгүй).
 */
export function parseReport(raw: string): ReportSpec | null {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;

  const title = String(o.title ?? '').trim().slice(0, MAX_TITLE);

  const raw1 = Array.isArray(o.formats) ? o.formats : [];
  const seen = new Set<ReportFormat>();
  for (const f of raw1) {
    const k = ALIAS[String(f).trim().toLowerCase()];
    if (k) seen.add(k);
  }
  const formats = seen.size ? REPORT_FORMATS.filter((f) => seen.has(f)) : [...REPORT_FORMATS];

  return { title, formats };
}

/** Загварын хэлж болох нэрс → бидний формат */
const ALIAS: Record<string, ReportFormat> = {
  pdf: 'pdf',
  docx: 'docx', doc: 'docx', word: 'docx',
  xlsx: 'xlsx', xls: 'xlsx', excel: 'xlsx',
  csv: 'csv',
};

/* ══════════ Баримтын загвар — бүх форматын НЭГ оролт ══════════ */

export type ReportDoc = {
  title: string;
  /** Толгойд бичигдэх огноо — дуудагч өгнө (цэвэр функц үлдээхийн тулд) */
  date: string;
  /** ```report блокоо ХАССАН хариултын блокууд */
  blocks: MdBlock[];
};

/** Хүснэгт — Excel-ийн хуудас, CSV-ийн хэсэг тус бүр нэг */
export type ReportTable = { name: string; head: string[]; rows: string[][] };

/**
 * Файлд орох хүснэгтүүд — markdown хүснэгт БА графикийн өгөгдөл хоёулаа.
 */
export function reportTables(doc: ReportDoc): ReportTable[] {
  const out: ReportTable[] = [];
  let head: string | null = null;
  for (const b of doc.blocks) {
    const h = headingOf(b);
    if (h) { head = h; continue; }
    if (b.kind === 'table') {
      out.push({ name: head || doc.title || tr('Хүснэгт'), head: b.head, rows: b.rows });
      continue;
    }
    if (b.kind === 'chart' && b.spec) {
      const unit = b.spec.unit ? `${tr('Утга')}, ${b.spec.unit}` : tr('Утга');
      out.push({
        name: b.spec.title || head || tr('График'),
        head: [tr('Шошго'), unit],
        rows: b.spec.data.map((d) => [d.label, d.value == null ? '' : String(d.value)]),
      });
    }
  }
  return out;
}

/** Файлын нэрэнд тохирох латин слаг — кирилл галиглана */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'ye', ё: 'yo', ж: 'j', з: 'z', и: 'i',
  й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slug(title: string): string {
  const s = [...title.toLowerCase()]
    .map((c) => TRANSLIT[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s || 'tailan';
}
