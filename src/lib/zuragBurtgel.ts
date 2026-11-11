/**
 * ЗУРАГ ТӨСЛИЙН БҮРТГЭЛ (2026-11-11, хэрэглэгч: «ЗУРАГ ТӨСӨЛ-LOG»-ийн загвараар, PDF системээр оруулдаг) — хүснэгт 234.
 * Харагдац: `src/modules/ZuragBurtgel.tsx` («ТЭЗҮ · Ажлын зураг төсөл» хуудасны «Зургийн бүртгэл» таб).
 * Цэвэр хэсэг (`toZRow`, `groupZ`, `zuragPkgStats`) тестлэгдэнэ (`zuragBurtgel.check.mjs`).
 */
import { ZURAG_BURTGEL, bagtsKey } from '@/lib/services';
import { queryFeatures } from '@/lib/query';
import { cached, SESSION_TTL_MS } from '@/lib/live';

type Row = Record<string, unknown>;

/** Огнооны талбарууд (ms) */
export const Z_DATES = ['batlagdsan_ognoo', 'magadlal_ognoo', 'davtan_magadlal_ognoo', 'huleej_avsan_ognoo', 'guitsetgegchid_ogson_ognoo'] as const;
export type ZDate = (typeof Z_DATES)[number];

export type ZRow = {
  oid: number;
  buleg: string;
  dedBuleg: string;
  dd: number | null;
  bagts: string;
  gereeDugaar: string;
  ner: string;
  shifr: string;
  hyanah: string;
  zohiogch: string;
  dates: Record<ZDate, number | null>;
  rev: string;
  burdel: string;
  helber: string;
  pdfHuudas: number | null;
  pdfNer: string;
  pdfItem: string;
  asuudal: string;
  tailbar: string;
};

const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Хүснэгтийн мөр → `ZRow` (цэвэр) */
export function toZRow(a: Row): ZRow {
  return {
    oid: Number(a.objectid),
    buleg: str(a.buleg),
    dedBuleg: str(a.ded_buleg),
    dd: num(a.dd),
    bagts: str(a.bagts),
    gereeDugaar: str(a.geree_dugaar),
    ner: str(a.ner),
    shifr: str(a.shifr),
    hyanah: str(a.hyanah_ajiltan),
    zohiogch: str(a.zohiogch),
    dates: Object.fromEntries(Z_DATES.map((k) => [k, num(a[k])])) as Record<ZDate, number | null>,
    rev: str(a.rev),
    burdel: str(a.burdel),
    helber: str(a.helber),
    pdfHuudas: num(a.pdf_huudas),
    pdfNer: str(a.pdf_ner),
    pdfItem: str(a.pdf_item_id),
    asuudal: str(a.asuudal),
    tailbar: str(a.tailbar),
  };
}

/** Бүлэг → дэд бүлэг → мөрүүд, хүснэгтийн дарааллаар (цэвэр) */
export function groupZ(rows: readonly ZRow[]): { buleg: string; subs: { ded: string; rows: ZRow[] }[] }[] {
  const out: { buleg: string; subs: { ded: string; rows: ZRow[] }[] }[] = [];
  for (const r of rows) {
    let g = out.find((x) => x.buleg === r.buleg);
    if (!g) { g = { buleg: r.buleg, subs: [] }; out.push(g); }
    let s = g.subs.find((x) => x.ded === r.dedBuleg);
    if (!s) { s = { ded: r.dedBuleg, rows: [] }; g.subs.push(s); }
    s.rows.push(r);
  }
  return out;
}

/**
 * Багц бүрийн тоо (цэвэр): нийт, магадлалд орсон, зохиогчоос хүлээж авсан, PDF-тэй. «Багц 1,2» шиг олон багцын мөр
 * багц бүрт тоологдоно. Төсөв (005) орохгүй. Дэд бүлэг нь «… БАГЦ 3-2» бол багцыг ТЭНДЭЭС авна (Excel-ийн «300.40. БАГЦ 3-2»
 * хэсгийн мөрүүдэд «Багц 3-1» гэж буруу бичигдсэн).
 */
export function zuragPkgStats(rows: readonly ZRow[]): Map<string, { total: number; magadlal: number; received: number; pdf: number }> {
  const out = new Map<string, { total: number; magadlal: number; received: number; pdf: number }>();
  for (const r of rows) {
    if (r.buleg.startsWith('005')) continue;
    const fromSub = pkgKeysOf(r.dedBuleg);
    for (const k of fromSub.length ? fromSub : pkgKeysOf(r.bagts)) {
      const s = out.get(k) ?? { total: 0, magadlal: 0, received: 0, pdf: 0 };
      s.total += 1;
      if (r.dates.magadlal_ognoo != null || r.dates.davtan_magadlal_ognoo != null) s.magadlal += 1;
      if (r.dates.huleej_avsan_ognoo != null) s.received += 1;
      if (r.pdfItem) s.pdf += 1;
      out.set(k, s);
    }
  }
  return out;
}

/** «Багц 1,2» → [БАГЦ1, БАГЦ2]; «Багц 3-1» → [БАГЦ31]; «Бүх багц»/«Байхгүй» → [] */
export function pkgKeysOf(v: string): string[] {
  const m = /багц\s*([\d.,\s-]+)/i.exec(v);
  if (!m) return [];
  const parts = m[1].split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) return parts.map((p) => bagtsKey(`Багц ${p}`)).filter(Boolean);
  return [bagtsKey(`Багц ${parts[0] ?? ''}`)].filter(Boolean);
}

/** ЗУРАГ ТӨСЛИЙН ЯВЦ (2026-11-11, хэрэглэгч: «Магадлалд орсон»): багц → магадлалд орсон ÷ нийт × 100 (0–100) */
export function zuragPctMap(rows: readonly ZRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, s] of zuragPkgStats(rows)) if (s.total > 0) out.set(k, (s.magadlal / s.total) * 100);
  return out;
}

async function fetchZ(): Promise<ZRow[]> {
  const rows = await queryFeatures(ZURAG_BURTGEL.url, { outFields: ['*'], orderBy: `${ZURAG_BURTGEL.oid} ASC` });
  return rows.map(toZRow);
}
export const loadZuragBurtgel = cached(fetchZ, SESSION_TTL_MS, ['ZURAG_BURTGEL']);
