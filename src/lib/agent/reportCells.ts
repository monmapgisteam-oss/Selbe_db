/**
 * ТАЙЛАНГИЙН ХҮСНЭГТИЙН НҮДНИЙ ТӨРӨЛ — текстээс Excel/CSV-ийн ТОО руу.
 */

import type { ReportTable } from './report';

export type ColKind = 'pct' | 'money' | 'qty' | 'num' | 'text';

export type TypedCol = {
  /** Толгойн ЭХ бичвэр (нэгжгүй) */
  header: string;
  /** Тоон баганын нэгж — «%», «₮», «м²» … */
  unit?: string;
  kind: ColKind;
  /** Excel-ийн тоон формат (текст баганад байхгүй) */
  numFmt?: string;
  /** Аравтын орны тоо — CSV-д хувийг буцааж 0–100 болгоход хэрэгтэй */
  dec?: number;
};

export type TypedTable = {
  name: string;
  cols: TypedCol[];
  /** Мөр бүр баганын тоотой ТЭНЦҮҮ урттай; хоосон нүд `null` */
  rows: (number | string | null)[][];
};

/** Тэмдэглэгээг арилгасан цэвэр текст */
export const plain = (s: string) =>
  String(s ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim();

/**
 * Хэмжээний нэгжүүд — УРТААС нь эхлүүлж жагсаана (`agent/format.ts`-ийн адил:
 * богиноос эхэлбэл «м»-ийн улмаас «м²» таарахгүй).
 */
const UNITS = ['м²', 'м³', 'км²', 'км', 'га', 'цаг', 'хоног', 'өдөр', 'ширхэг', 'айл', 'өрх', 'хүн', 'блок', 'ш', 'м'];

/** Мөнгөн тэмдэг — агент «₮» бичдэг, PDF-д «төг» болдог */
const MONEY = /(₮|төг)\s*$/;

type Parsed = { kind: ColKind; value: number | string; unit?: string; dec: number; text: string };

/** Мянгатын таслал, зай, юникод хасахыг цэвэрлээд тоо болгоно */
function toNum(s: string): number | null {
  const t = s.replace(/[\s ,]/g, '').replace(/[−–—]/g, '-');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Аравтын орны тоо — форматын нарийвчлалд */
const decOf = (s: string) => (s.split('.')[1] ?? '').replace(/\D+$/, '').length;

/**
 * Нэг нүдийг уншина. Таних боломжгүй бол ТЕКСТ.
 */
export function parseCell(raw: string): Parsed | null {
  const s = plain(raw);
  if (!s) return null;

  /* Хувь — «19.7%» → 0.197 */
  if (s.endsWith('%')) {
    const body = s.slice(0, -1).trim();
    const n = toNum(body);
    if (n != null) {
      return { kind: 'pct', value: Number((n / 100).toFixed(10)), unit: '%', dec: decOf(body), text: s };
    }
    return null;
  }

  /* Мөнгө — «2,660,000,000 ₮» */
  const m = MONEY.exec(s);
  if (m) {
    const n = toNum(s.slice(0, m.index).trim());
    if (n != null) return { kind: 'money', value: n, unit: '₮', dec: 0, text: s };
    return null;
  }

  /* Хэмжээ — «1,788 м²» */
  for (const u of UNITS) {
    if (s.endsWith(u)) {
      const body = s.slice(0, -u.length).trim();
      const n = toNum(body);
      if (n != null) return { kind: 'qty', value: n, unit: u, dec: decOf(body), text: s };
    }
  }

  /* Цэвэр тоо — «1,788» */
  const n = toNum(s);
  if (n != null) return { kind: 'num', value: n, dec: decOf(s), text: s };

  return { kind: 'text', value: s, dec: 0, text: s };
}

/** Тоон баганын Excel формат */
function numFmtOf(kind: ColKind, unit: string | undefined, dec: number): string | undefined {
  if (kind === 'pct') return dec >= 2 ? '0.00%' : dec === 1 ? '0.0%' : '0%';
  const base = dec > 0 ? '#,##0.###' : '#,##0';
  if (kind === 'qty' && unit) return `${base} "${unit}"`;
  if (kind === 'money' || kind === 'num') return base;
  return undefined;
}

/**
 * Хүснэгтийн багана бүрийг нэг төрөлд хөрвүүлнэ.
 */
export function typeTable(t: ReportTable): TypedTable {
  const n = Math.max(t.head.length, ...t.rows.map((r) => r.length), 1);
  const cells: (Parsed | null)[][] = t.rows.map((r) =>
    Array.from({ length: n }, (_, i) => parseCell(r[i] ?? '')));

  /** Хувийн багананд утгыг 100-д хуваах эсэх (толгойноос таньсан үед) */
  const scale: number[] = Array.from({ length: n }, () => 1);

  const cols: TypedCol[] = Array.from({ length: n }, (_, i) => {
    const col = cells.map((r) => r[i]).filter((p): p is Parsed => p != null);
    const kinds = new Set(col.map((p) => p.kind));
    const header = plain(t.head[i] ?? '');
    if (!col.length || kinds.size !== 1 || kinds.has('text')) {
      return { header, kind: 'text' };
    }
    const unit0 = col[0].unit;
    /* Нэгж зөрвөл (м² ба км нэг баганад) — текст */
    if (col.some((p) => p.unit !== unit0)) return { header, kind: 'text' };
    const dec = Math.max(...col.map((p) => p.dec));

    const kind = col[0].kind;
    if (kind === 'num') {
      const u = headerUnit(header);
      if (u === '%') { scale[i] = 100; return { header, kind: 'pct', unit: u, numFmt: numFmtOf('pct', u, dec), dec }; }
      if (u === '₮') return { header, kind: 'money', unit: u, numFmt: numFmtOf('money', u, dec), dec };
      if (u) return { header, kind: 'qty', unit: u, numFmt: numFmtOf('qty', u, dec), dec };
    }
    return { header, kind, unit: unit0, numFmt: numFmtOf(kind, unit0, dec), dec };
  });

  const rows = cells.map((r) =>
    r.map((p, i) => {
      if (!p) return null;
      if (cols[i].kind === 'text') return p.text;
      const v = p.value as number;
      return scale[i] === 1 ? v : Number((v / scale[i]).toFixed(10));
    }));

  return { name: plain(t.name), cols, rows };
}

/** Толгой дахь нэгж — «Гүйцэтгэл (%)», «Утга, ₮», «Талбай, м²» */
function headerUnit(h: string): string | null {
  const m = /[(,]\s*(%|₮|төг|[^\s(),]+)\s*\)?\s*$/.exec(h.trim());
  if (!m) return null;
  const u = m[1] === 'төг' ? '₮' : m[1];
  return u === '%' || u === '₮' || UNITS.includes(u) ? u : null;
}

/**
 * Толгойн бичвэр нэгжтэйгээр.
 * @param inFormat Нэгж нь ТООН ФОРМАТ дотор орох уу (Excel-ийн `qty`) —
 *   тийм бол толгойд давхардуулахгүй.
 */
export function colHeader(c: TypedCol, inFormat: boolean): string {
  if (!c.unit) return c.header;
  if (inFormat && c.kind === 'qty') return c.header;
  return c.header.includes(c.unit) ? c.header : `${c.header} (${c.unit})`;
}

/**
 * CSV-ийн хувилбар — формат байхгүй тул НЭГЖИЙГ ТОЛГОЙД, хувийг 0–100-аар.
 */
export function csvTable(t: TypedTable): { head: string[]; rows: (number | string | null)[][] } {
  return {
    head: t.cols.map((c) => colHeader(c, false)),
    rows: t.rows.map((r) => r.map((v, i) => {
      if (v == null || typeof v !== 'number') return v;
      if (t.cols[i].kind !== 'pct') return v;
      return Number((v * 100).toFixed(Math.max(0, t.cols[i].dec ?? 1)));
    })),
  };
}
