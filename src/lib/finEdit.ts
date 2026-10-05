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

/**
 * САНХҮҮГИЙН ХАДГАЛААГҮЙ ЗАСВАР — `Portal.setView` харагдац солихоос өмнө асууна.
 *
 * ⚠️ 2026-09-29 (аудит 10): урьд нь «Гэрээний бүртгэл»-ийн `pend`/`adds` ба
 *    «Cashflow хувиарлах»-ын засвар зөвхөн `Finance` доторх ТАБ солилтод
 *    хамгаалагддаг байв; өөр харагдац руу шилжихэд `Finance` unmount болж засвар
 *    баталгаагүй алга болдог. `huvaariBatlah.planNavBusy`-тэй ижил загвар.
 * ⚠️ ЭНД (импортгүй lib) — `Finance` нь `dynamic` ачаалалттай тул `Portal` түүнийг
 *    шууд импортлохгүй. Табын түлхүүр бүр (`cf` · `plan`) өөрөө тэмдэглэнэ.
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
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): нийтэлсний дараа `onSaved` нь хүснэгтийг
 *    ДАХИН татдаг, харин тэр хооронд (1–3 с) `rows`/`months` ХУУЧИН хэвээр. Тэр үед
 *    огноог дахин засаж нийтэлбэл ӨМНӨХ нийтлэлийн нэмсэн сарууд хуучин `months`-д
 *    алга тул ДАХИН нэмэгдэж, сарын мөр давхардан S-муруй хоёр тоологдоно.
 *    Нийтлэлийн агшны `rows` лавлагааг хадгалж, ШИНЭ мөрүүд (өөр лавлагаа) ирэх
 *    хүртэл хаалттай байна. `loadFinRegister` дуудалт бүрд шинэ массив буцаадаг.
 * @param publishedFrom амжилттай нийтлэлийн агшин дахь `rows` (байхгүй бол `null`)
 * @param rows одоогийн `rows`
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
 *
 * ⚠️ Хоосон нүд нь `null` — хоосон мөр (`''`) БИШ. Тоон талбарт `''` илгээвэл
 * ArcGIS 0 болгож хадгалдаг: «бөглөөгүй» ба «тэг» хоёр ЗААВАЛ ялгаатай.
 * ⚠️ Буруу тоо/огноог ЧИМЭЭГҮЙ 0 болгохгүй — `Error` шиднэ.
 */
export function parseCell(
  s: string, type: string, label: string, msg: ParseMsg = PARSE_MSG_MN,
  /**
   * ХУВИЙН талбар (0–100: `Cashflow_huwi`, `FIN_XL_PCT`) — нэг таслал ҮРГЭЛЖ аравтын.
   * ⚠️ 2026-09-30: мянгатын дүрэм (`1,234` → 1234) хувьд утгагүй бөгөөд аюултай:
   *    Excel-ээс (аравтын таслалтай) хуулсан сарын хувь «8,333» нь 8333 болж
   *    `Cashflow_dun = ХО × 8333 / 100` (гэрээний 83 дахин) S-муруйд бичигддэг,
   *    харин «Cashflow хувиарлах» (`CashflowPlan.nOf`) ижил текстийг 8.333 гэж
   *    уншдаг байв. Хувь биш талбарт дүрэм ХЭВЭЭР.
   */
  pct = false,
): unknown {
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
    /* ⚠️ 2026-09-29 (аудит 10): таслалыг ХОЁР утгаар ялгана. Урьд нь бүх таслал
       хасагддаг тул «12,5» (аравтын таслал) бүртгэлд 125 болж, «Cashflow
       хувиарлах» (`CashflowPlan.nOf`) дээр 12.5 болдог байв — нэг хувь хоёр
       утгатай. Одоо: `12,5` / `12,50` → аравтын; `1,234` / `1,234.5` → мянгатын;
       бусад таслалтай хэлбэр → «тоо буруу» (чимээгүй таамаглахгүй). */
    const t = v.replace(/[\s ]/g, '');
    /* ⚠️ 2026-10-05: «Гүйцэтгэл бөглөх»-ийн дүрэмтэй (`sheet/paste.normCell` ·
       `isAmbiguousComma`) НЭГ болгов — урьд нь «0,125» мянгатын хэвд таарч 125 болдог
       байв (бөглөх хуудас ижил текстийг 0.125 гэж уншдаг). Одоо:
         · `1,234,567` (2+ бүлэг) · `1,234.5` → мянгат; `1.234,5` → цэг мянгат, таслал аравтын;
         · `0,125` · `12,5` · `1234,5` · `1234,5678` → аравтын (мянгатын бичлэг байж ЧАДАХГҮЙ);
         · `1,250` (1–3 орон + яг 3 орон) → ТОДОРХОЙГҮЙ: таамаглахгүй, `numAmbig` алдаа;
         · хувийн талбарт (`pct`) нэг таслал ҮРГЭЛЖ аравтын (2026-09-30-ны ⚠️ хэвээр).
       ⚠️ `paste.ts`-ээс ИМПОРТЛООГҮЙ, дүрмийг давтав — энэ файл импортгүй байх ёстой
          (файлын толгойн ⚠️). `paste.ts`-ийн дүрэм өөрчлөгдвөл ЭНД ч өөрчил. */
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
    /* ⚠️ 2026-10-05: хувийн талбар (0–100) сөрөг эсвэл 100-аас их байж болохгүй — урьд нь
       «-20» / «250» шууд бичигдэж `Cashflow_dun` сөрөг/гэрээнээс их болон S-муруйд ордог байв. */
    if (pct && (x < 0 || x > 100)) throw new Error(msg.pctRange(label, v));
    return x;
  }
  return v;
}
