/**
 * ЗУРГИЙН БҮРТГЭЛИЙН PDF — нэг баримтад ХЭДЭН Ч PDF (2026-11-17, хэрэглэгч: «PDF гэрээ болон материал гэж 2 байх … хэд ч
 * орж болох боломжтой байх ёстой»).
 *
 * PDF бүр Enterprise геопорталд тусдаа item. Холбоосыг хүснэгтийн нүдэнд БИШ (нэг нүд = нэг утга), item-ийн ТАГ-аар:
 *   · `selbe-zurag`            — энэ бүртгэлийн бүх PDF (`ZURAG_BURTGEL.tag`)
 *   · `zt-<төрөл>`             — гэрээ · материал · хүлээж авсан акт · хүлээлгэж өгсөн акт · бусад
 *   · `zb-<objectid>`          — аль баримтынх (гэрээнээс бусад төрөл)
 *   · `zg-<гэрээний түлхүүр>`  — аль ГЭРЭЭнийх (төрөл = гэрээ): нэг удаа оруулахад тэр гэрээний бүх мөрөнд харагдана
 *
 * Цэвэр — `zuragPdf.check.mjs`.
 */
import { gereeKey, type ZRow } from './zuragBurtgel';

export const Z_PDF_KINDS = ['geree', 'material', 'huleej_akt', 'ogson_akt', 'busad'] as const;
export type ZPdfKind = (typeof Z_PDF_KINDS)[number];

export const kindTag = (k: ZPdfKind): string => `zt-${k}`;
export const docTag = (oid: number): string => `zb-${oid}`;
/** Гэрээний түлхүүр → таг: таг таслал, тусгай тэмдэггүй байхаар тэмдэгт бүрийн кодыг 36-тын тооллоор */
export const gereeTag = (geree: string): string => {
  const k = gereeKey(geree);
  return k ? `zg-${[...k].map((c) => c.charCodeAt(0).toString(36)).join('-')}` : '';
};

/** Энэ баримтад PDF оруулахад тавих тагууд; гэрээний PDF бол гэрээний дугаар заавал (алга бол `null`) */
export function tagsFor(r: Pick<ZRow, 'oid' | 'gereeDugaar'>, kind: ZPdfKind): string[] | null {
  if (kind !== 'geree') return [kindTag(kind), docTag(r.oid)];
  const g = gereeTag(r.gereeDugaar);
  return g ? [kindTag(kind), g] : null;
}

type Item = { id: string; tags?: string[] };
export type ZPdf<T extends Item> = { kind: ZPdfKind; item: T };

const kindOf = (tags: readonly string[]): ZPdfKind => {
  for (const k of Z_PDF_KINDS) if (tags.includes(kindTag(k))) return k;
  return 'busad';
};

/** Порталын item-үүд → баримт (objectid) ба гэрээ (таг)-аар индекс */
export function pdfIndex<T extends Item>(items: readonly T[]): { byDoc: Map<number, ZPdf<T>[]>; byGeree: Map<string, ZPdf<T>[]> } {
  const byDoc = new Map<number, ZPdf<T>[]>();
  const byGeree = new Map<string, ZPdf<T>[]>();
  const push = <K>(m: Map<K, ZPdf<T>[]>, k: K, v: ZPdf<T>) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
  for (const item of items) {
    const tags = item.tags ?? [];
    const v = { kind: kindOf(tags), item };
    for (const t of tags) {
      const d = /^zb-(\d+)$/.exec(t);
      if (d) push(byDoc, Number(d[1]), v);
      else if (t.startsWith('zg-')) push(byGeree, t, v);
    }
  }
  return { byDoc, byGeree };
}

/** Нэг баримтын бүх PDF — гэрээнийх эхэнд, дараа нь төрлийн дарааллаар */
export function pdfsOf<T extends Item>(r: Pick<ZRow, 'oid' | 'gereeDugaar'>, idx: ReturnType<typeof pdfIndex<T>>): ZPdf<T>[] {
  const g = gereeTag(r.gereeDugaar);
  const all = [...(g ? idx.byGeree.get(g) ?? [] : []), ...(idx.byDoc.get(r.oid) ?? [])];
  const seen = new Set<string>();
  return all
    .filter((x) => (seen.has(x.item.id) ? false : (seen.add(x.item.id), true)))
    .sort((a, b) => Z_PDF_KINDS.indexOf(a.kind) - Z_PDF_KINDS.indexOf(b.kind));
}
