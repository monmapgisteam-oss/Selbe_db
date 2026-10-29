/**
 * САНХҮҮГИЙН БҮРТГЭЛИЙН НҮДНИЙ ХӨРВҮҮЛЭЛТ — `Finance.tsx`-ийн засварын цөм.
 */

/**
 * САНХҮҮГИЙН ХАДГАЛААГҮЙ ЗАСВАР — `Portal.setView` харагдац солихоос өмнө асууна.
 */
const finDirty = new Set<string>();
export function setFinNavDirty(key: string, on: boolean): void {
  if (on) finDirty.add(key); else finDirty.delete(key);
}
export function finNavDirty(): boolean {
  return finDirty.size > 0;
}

/**
 * НИЙТЛЭЛИЙН ДАРААХ ДАХИН АЧААЛАЛТ ДУУСААГҮЙ ЮУ — «Гэрээний бүртгэл»-ийн хоёр дахь
 * нийтлэлийн хаалт.
 */
export function awaitingReload(publishedFrom: object | null, rows: object): boolean {
  return publishedFrom != null && publishedFrom === rows;
}

/** Тоон талбарын төрлүүд */
export const NUMERIC_TYPES = new Set([
  'esriFieldTypeDouble', 'esriFieldTypeInteger', 'esriFieldTypeSingle',
  'esriFieldTypeSmallInteger', 'esriFieldTypeBigInteger', 'esriFieldTypeOID',
]);

/**
 * ЗАСАХ БОЛОМЖГҮЙ талбарууд — серверийн удирддаг багана.
 */
export const SERVER_RO = /^(objectid|globalid|shape|shape__|creationdate|creator|editdate|editor|created_user|created_date|last_edited_user|last_edited_date)/i;

/**
 * ОРОН НУТГИЙН «YYYY-MM-DD» — `format.dayKey`-тэй ЯГ ИЖИЛ (тэр файл `@/…`
 * импорттой тул энд давтав). `toISOString.slice(0,10)` БИШ: +08 бүсэд
 * 00:00–07:59-ийн огноо ӨМНӨХ өдөр болно.
 */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * `DateOnly` утгыг `YYYY-MM-DD` болгоно. Epoch ирвэл орон нутгийн өдөр.
 * `DateOnly` нь epoch БИШ, `YYYY-MM-DD` МӨР — задлахгүйгээр нэг хэвэнд оруулна.
 */
export const dateOnlyText = (v: unknown): string => {
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : localDay(d.getTime());
  }
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : String(v);
};

/**
 * Нүдийг ЗАСАХ талбарт тавих түүхий текст.
 */
export function editText(v: unknown, type: string): string {
  if (v == null) return '';
  if (type === 'esriFieldTypeDateOnly') return dateOnlyText(v);
  if (type === 'esriFieldTypeDate') {
    const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : localDay(d.getTime());
  }
  return String(v);
}

/** Алдааны текст үүсгэгч — `Finance` нь `tr()`-ээр орчуулж өгнө */
export type ParseMsg = {
  /** «{label}» — огноо ЖЖЖЖ-СС-ӨӨ хэлбэрээр байх ёстой: {v} */
  dateFmt: (label: string, v: string) => string;
  /** «{label}» — огноо буруу: {v} */
  dateBad: (label: string, v: string) => string;
  /** «{label}» — тоо буруу: {v} */
  numBad: (label: string, v: string) => string;
  /** «{label}» — таслал мянгатын уу, аравтын уу тодорхойгүй: {v} (2026-10-05) */
  numAmbig: (label: string, v: string) => string;
  /** «{label}» — хувь 0–100 хооронд байх ёстой: {v} (2026-10-05) */
  pctRange: (label: string, v: string) => string;
};

/** Анхдагч (орчуулгагүй) текст — тест ба `msg`-гүй дуудалтад */
export const PARSE_MSG_MN: ParseMsg = {
  dateFmt: (l, v) => `«${l}» — огноо ЖЖЖЖ-СС-ӨӨ хэлбэрээр байх ёстой: ${v}`,
  dateBad: (l, v) => `«${l}» — огноо буруу: ${v}`,
  numBad: (l, v) => `«${l}» — тоо буруу: ${v}`,
  numAmbig: (l, v) => `«${l}» — «${v}»: таслал мянгатын уу, аравтын уу тодорхойгүй. Таслалгүй (1250) эсвэл цэгтэй (1.25) бичнэ үү.`,
  pctRange: (l, v) => `«${l}» — хувь 0–100 хооронд байх ёстой: ${v}`,
};

/** `YYYY-MM-DD` хэлбэр ба ХУАНЛИД байгаа эсэх (2026-02-30 → 03-02 руу гүйхгүй) */
const isCalendarDay = (v: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/**
 * Засварласан текстийг үйлчилгээ хүлээж авах ТӨРӨЛ рүү хөрвүүлнэ.
 */
export function parseCell(
  s: string, type: string, label: string, msg: ParseMsg = PARSE_MSG_MN,
  /**
   * ХУВИЙН талбар (0–100: `Cashflow_huwi`, `FIN_XL_PCT`) — нэг таслал ҮРГЭЛЖ аравтын.
   */
  pct = false,
): unknown {
  const v = s.trim();
  if (v === '') return null;
  if (type === 'esriFieldTypeDateOnly') {
    if (!isCalendarDay(v)) throw new Error(msg.dateFmt(label, v));
    return v;
  }
  if (type === 'esriFieldTypeDate') {
    if (v.length === 10) {
      if (!isCalendarDay(v)) throw new Error(msg.dateFmt(label, v));
      return new Date(`${v}T00:00:00Z`).getTime();
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new Error(msg.dateBad(label, v));
    return d.getTime();
  }
  if (NUMERIC_TYPES.has(type)) {
    /* Хэрэглэгч хуулж тавихад мянгатын таслал/зай дагалдаж болно */
    const t = v.replace(/[\s ]/g, '');
    let u = t;
    const hasComma = t.includes(',');
    if (hasComma && t.includes('.')) {
      if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(t)) u = t.replace(/,/g, '');
      else if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t)) u = t.replace(/\./g, '').replace(',', '.');
      else throw new Error(msg.numBad(label, v));
    } else if (hasComma) {
      if (/^-?\d{1,3}(,\d{3}){2,}$/.test(t)) u = t.replace(/,/g, '');
      else if (!/^-?\d+,\d+$/.test(t)) throw new Error(msg.numBad(label, v));
      else if (!pct && /^-?[1-9]\d{0,2},\d{3}$/.test(t)) throw new Error(msg.numAmbig(label, v));
      else u = t.replace(',', '.');
    }
    const x = Number(u);
    if (!Number.isFinite(x)) throw new Error(msg.numBad(label, v));
    if (pct && (x < 0 || x > 100)) throw new Error(msg.pctRange(label, v));
    return x;
  }
  return v;
}

/** v3 stores every fraction-percent input (share · advance %) in percentage units; v2 only the share; unversioned drafts used fractions. */
export type FinanceDraft = {
  v?: number;
  pend: Record<string, string>;
  adds: Record<string, string>[];
  at: number;
  legacyShareInvalid?: string[];
};

/** Preserve invalid legacy input for correction instead of reinterpreting its commas as percentages. */
export function upgradeFinanceDraft(draft0: FinanceDraft, shareField: string, fractionFields: readonly string[] = []): FinanceDraft | null {
  const draft = lowerDraftFields(draft0);
  if (draft.v === 3) return draft;
  if (draft.v !== undefined && draft.v !== 2) return null;
  const scaledFields = new Set(draft.v === 2
    ? fractionFields.filter((f) => f !== shareField)
    : [shareField, ...fractionFields]);
  const invalid = new Set<string>(draft.legacyShareInvalid ?? []);
  const scale = (text: string): string => {
    try {
      const value = parseCell(text, 'esriFieldTypeDouble', shareField);
      if (typeof value !== 'number') return text;
      const [mantissa, exponent = '0'] = String(value).split('e');
      const scaled = Number(`${mantissa}e${Number(exponent) + 2}`);
      if (!Number.isFinite(scaled)) { invalid.add(text); return text; }
      return String(scaled);
    } catch {
      invalid.add(text);
      return text;
    }
  };
  const pend = Object.fromEntries(Object.entries(draft.pend).map(([key, text]) =>
    [key, scaledFields.has(key.slice(key.indexOf(':') + 1)) ? scale(text) : text]));
  const adds = draft.adds.map((row) => {
    const next = { ...row };
    for (const f of scaledFields) if (Object.hasOwn(row, f)) next[f] = scale(row[f]);
    return next;
  });
  return { ...draft, v: 3, pend, adds, ...(invalid.size ? { legacyShareInvalid: [...invalid] } : {}) };
}

function lowerDraftFields(draft: FinanceDraft): FinanceDraft {
  const lowKey = (k: string): string => { const i = k.indexOf(':'); return i < 0 ? k : k.slice(0, i + 1) + k.slice(i + 1).toLowerCase(); };
  const pendKeys = Object.keys(draft.pend);
  const pendChanged = pendKeys.some((k) => lowKey(k) !== k);
  const addsChanged = draft.adds.some((row) => Object.keys(row).some((k) => k.toLowerCase() !== k));
  if (!pendChanged && !addsChanged) return draft;
  return {
    ...draft,
    pend: pendChanged ? Object.fromEntries(Object.entries(draft.pend).map(([k, v]) => [lowKey(k), v])) : draft.pend,
    adds: addsChanged ? draft.adds.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]))) : draft.adds,
  };
}

/** Legacy ambiguous/malformed text keeps its original validation until the user corrects it. */
export function parseFinanceShare(
  text: string, type: string, label: string, legacyInvalid: readonly string[] = [], msg: ParseMsg = PARSE_MSG_MN,
): unknown {
  if (legacyInvalid.includes(text)) parseCell(text, type, label, msg);
  const value = parseCell(text, type, label, msg, true);
  return typeof value === 'number' ? value / 100 : value;
}
