/**
 * САНХҮҮГИЙН БҮРТГЭЛИЙН НҮДНИЙ ХӨРВҮҮЛЭЛТ — `Finance.tsx`-ийн засварын цөм.
 *
 * ⚠️ 2026-09-25: `Finance.tsx`-ээс ГАРГАВ. `finEdit.check.mjs` урьд нь эдгээр
 *    функцийн ГАРААР ХУУЛСАН хувилбарыг шалгадаг байсан (node TSX уншихгүй) —
 *    эх код өөрчлөгдөхөд (жиш. `DateOnly` салаа, `dayKey`) тест хуучин дүрмийг
 *    «ногоон» гэж баталсаар байв. Одоо тест энэ файлыг ШУУД импортолно.
 *
 * ⚠️ ИМПОРТГҮЙ БАЙХ ЁСТОЙ: `npm test` нь энэ тестийг ts-alias-гүй цэвэр
 *    `node`-оор ажиллуулдаг (төрөл хасалт) — `@/…` эсвэл өргөтгөлгүй импорт
 *    нэмбэл тест унана. Тиймээс алдааны текстийг дуудагч (`msg`) өгнө
 *    (`Finance` нь `tr()`-ээр орчуулна), орон нутгийн өдрийг энд бодно.
 */

/** Тоон талбарын төрлүүд */
export const NUMERIC_TYPES = new Set([
  'esriFieldTypeDouble', 'esriFieldTypeInteger', 'esriFieldTypeSingle',
  'esriFieldTypeSmallInteger', 'esriFieldTypeBigInteger', 'esriFieldTypeOID',
]);

/**
 * ЗАСАХ БОЛОМЖГҮЙ талбарууд — серверийн удирддаг багана.
 * ⚠️ `tableWrite.ts` эдгээрийг илгээхийн өмнө ч шүүдэг (давхар хамгаалалт).
 */
export const SERVER_RO = /^(objectid|globalid|shape|shape__|creationdate|creator|editdate|editor)/i;

/**
 * ОРОН НУТГИЙН «YYYY-MM-DD» — `format.dayKey`-тэй ЯГ ИЖИЛ (тэр файл `@/…`
 * импорттой тул энд давтав). ⚠️ `toISOString().slice(0,10)` БИШ: +08 бүсэд
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
 *
 * ⚠️ Харагдацын форматлагчийг (`fmtCell`) ХЭРЭГЛЭХГҮЙ: тэр нь мянгатын таслал
 * нэмдэг тул засварт оруулбал хадгалахад тоо болж хөрвөхгүй.
 */
export function editText(v: unknown, type: string): string {
  if (v == null) return '';
  if (type === 'esriFieldTypeDateOnly') return dateOnlyText(v);
  if (type === 'esriFieldTypeDate') {
    const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
    /* ⚠️ Орон нутгийн өдөр (2026-09-21) — харагдацтай ижил өдөр */
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
};

/** Анхдагч (орчуулгагүй) текст — тест ба `msg`-гүй дуудалтад */
export const PARSE_MSG_MN: ParseMsg = {
  dateFmt: (l, v) => `«${l}» — огноо ЖЖЖЖ-СС-ӨӨ хэлбэрээр байх ёстой: ${v}`,
  dateBad: (l, v) => `«${l}» — огноо буруу: ${v}`,
  numBad: (l, v) => `«${l}» — тоо буруу: ${v}`,
};

/** `YYYY-MM-DD` хэлбэр ба ХУАНЛИД байгаа эсэх (2026-02-30 → 03-02 руу гүйхгүй) */
const isCalendarDay = (v: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/**
 * Засварласан текстийг үйлчилгээ хүлээж авах ТӨРӨЛ рүү хөрвүүлнэ.
 *
 * ⚠️ Хоосон нүд нь `null` — хоосон мөр (`''`) БИШ. Тоон талбарт `''` илгээвэл
 * ArcGIS 0 болгож хадгалдаг: «бөглөөгүй» ба «тэг» хоёр ЗААВАЛ ялгаатай.
 * ⚠️ Буруу тоо/огноог ЧИМЭЭГҮЙ 0 болгохгүй — `Error` шиднэ.
 */
export function parseCell(s: string, type: string, label: string, msg: ParseMsg = PARSE_MSG_MN): unknown {
  const v = s.trim();
  if (v === '') return null;
  /* ⚠️ `DateOnly` — epoch БИШ, `YYYY-MM-DD` МӨР буцаана. «27.05.2026» эсвэл
     «2026-13-45» нь `new Date`-д чимээгүй хөрвөх/NaN болдог тул хатуу шалгана. */
  if (type === 'esriFieldTypeDateOnly') {
    if (!isCalendarDay(v)) throw new Error(msg.dateFmt(label, v));
    return v;
  }
  /* ⚠️ 2026-09-08: `esriFieldTypeDate`-д ЭРГЭЛТИЙН шалгалт — `2026-02-30` нь
     NaN БИШ, 2026-03-02 болж ГҮЙНЭ. Цаг-минуттай ISO datetime зөвшөөрөгдөнө. */
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
    const x = Number(v.replace(/[\s, ]/g, ''));
    if (!Number.isFinite(x)) throw new Error(msg.numBad(label, v));
    return x;
  }
  return v;
}
