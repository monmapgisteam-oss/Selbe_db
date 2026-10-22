/**
 * ArcGIS давхаргын codedValue ДОМЭЙН — код → нэр (2026-10-21, аудит).
 *
 * ⚠️ Survey123 (ХАБЭА осол) домэйны КОД нь 31 тэмдэгтэд тасардаг («Моторт тээврийн хэрэгсэлийн осо»),
 *    НЭР нь бүтэн («…осол зөрчил»); «other» код → «Бусад». Урьд нь ослын төрөл, шалтгааны төрлийг кодоор нь
 *    харуулж хоёр хэлэнд тасархай, «other» латинаар гардаг байв. Одоо метадатаас толь уншиж нэрээр нь
 *    харуулна; толинд байхгүй код (домэйн өөрчлөгдсөн) ӨӨРӨӨ хэвээр — чимээгүй хоосон биш.
 * ⚠️ Мета татагдахгүй бол `{}` — дуудагч код хэвээр харуулна, хуудас унахгүй (`loadCodedMaps`).
 * ⚠️ Талбарын нэр Enterprise-д жижиг үсэг тул том/жижиг үл хамааран тулгана.
 */
import { arcgisPost } from '@/lib/query';

export type CodedMap = Map<string, string>;
/** Талбарын нэр (дуудагчийн бичсэнээр) → код → нэр */
export type CodedMaps = Record<string, CodedMap>;

export type MetaField = {
  name?: string;
  domain?: { type?: string; codedValues?: { code?: unknown; name?: unknown }[] } | null;
};

/** Метадатын талбаруудаас өгөгдсөн нэрсийн codedValue домэйн; домэйнгүй/хоосон талбар толинд ОРОХГҮЙ */
export function codedMaps(fields: MetaField[] | undefined, names: string[]): CodedMaps {
  const out: CodedMaps = {};
  for (const n of names) {
    const f = fields?.find((x) => String(x.name ?? '').toLowerCase() === n.toLowerCase());
    const cv = f?.domain?.codedValues;
    if (!cv?.length) continue;
    out[n] = new Map(cv.map((c) => [String(c.code).trim(), String(c.name ?? c.code).trim()]));
  }
  return out;
}

/** Код → домэйны нэр; домэйнгүй/танихгүй бол код өөрөө (зайг хассан), хоосон/null → '' */
export function codedName(m: CodedMap | undefined, v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s) return '';
  return m?.get(s) ?? s;
}

/** Давхаргын метадатаас (`?f=json`) домэйнуудыг татна — унавал `{}` (анхааруулга, алдаа шидэхгүй) */
export async function loadCodedMaps(url: string, names: string[]): Promise<CodedMaps> {
  try {
    const j = await arcgisPost<{ fields?: MetaField[] }>(url, { f: 'json' });
    return codedMaps(j.fields, names);
  } catch (e) {
    console.warn('[selbe] домэйн татагдсангүй — код хэвээр харагдана:', url, e);
    return {};
  }
}
