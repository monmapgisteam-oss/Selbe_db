/**
 * ХӨРӨНГӨ ОРУУЛАЛТЫН ГҮЙЦЭТГЭЛ — ХОЁР ТҮВШНИЙ ачаалагч ба цэвэр тооцоо.
 * Эх сурвалж: `HO_IPC` (`HO_guitsetgel_arcgis_csv/196`, 45 мөр).
 *
 * ⚠️ ЯАГААД ХОЁР ТҮВШИН ВЭ. Мөр = НЭГ ТӨЛБӨРИЙН ГҮЙЛГЭЭ; гэрээний талбар
 * (`tosov_niit`, `gereet_tosov_niit`, `guitsetgegch`…) нь `geree_kod` бүрд
 * ДАВТАГДАНА. 45 мөр = 22 гэрээ. Мөр бүрээр SUM хийвэл Багц-4.1 (7 мөр)
 * -ийн төсөв 7 ДАХИН давхардана — `reportData.ts`-д баримтжуулсан «5.4
 * дахин хөөрөгдөх» алдааны ЯГ ЭНЭ ЛЭ хэлбэр. Тиймээс:
 *   · ГЭРЭЭНИЙ тоо → `groupHo()`-ийн `HoContract` (dedup хийсэн, 22)
 *   · ТӨЛБӨРИЙН тоо → мөрүүд өөрсдөө (45)
 * АМЬДААР БАТЛАВ (2026-09-09): гэрээ бүрд гэрээний талбар бүрийн uniq утга
 * ЯГ 1 — эхний мөрөөр dedup хийх нь БҮРЭН аюулгүй.
 *
 * ⚠️ React импортлохгүй, DOM хөндөхгүй — `ipc.check.mjs` шууд Node дээр
 * ачаална. Сүлжээний дуудлага нь ЗӨВХӨН `loadHoRows`-д; бусад бүх экспорт
 * ЦЭВЭР функц (ижил оролт → ижил гаралт).
 *
 * ⚠️ БАГЦААР ХОЛБОХОД `pkgKeyOf` — `bagtsKey` БИШ. HO-д «Багц-1-4» ба
 * «БАГЦ-10,  БАГЦ-11, БАГЦ-13, БАГЦ-15» гэсэн ХОЁР ДИАПАЗОН мөр бий
 * (нийт 5,971,417,432 ₮). `bagtsKey('Багц-1-4')` = `БАГЦ14` бөгөөд энэ нь
 * БОДИТ «Багц 14»-ийн ЯГ түлхүүр — тэр дүн буруу багцад наалдана.
 * `pkgKeyOf` тэднийг `''` болгож хамгаална: дүн АЛДАГДАХГҮЙ (нийт
 * `paidTotal`-д үлдэнэ), зүгээр л буруу эзэнд очихгүй.
 *
 * ⚠️ ТИЙМЭЭС: багцаар задалсан Map-ыг НИЙЛҮҮЛЖ төслийн нийт дүн ГАРГАЖ
 * БОЛОХГҮЙ. Амьдаар багцын нийлбэр 524.90 тэрбум ≠ жинхэнэ нийт 530.87
 * тэрбум. Нийтийг `hoTotals()`-оос ав.
 *
 * ⚠️ `null ≠ 0` БҮХ ЗАМД. `dun` 45-ийн 2 мөрд ХООСОН (БАГЦ-6.3 гэрээ
 * бүхэлдээ төлбөргүй, ХО-0045 кодгүй гэрээ). `?? 0` дарвал «олгосон 0 ₮»
 * гэсэн ХУДАЛ хэмжилт үүсч, 2026-09-04-ний I30 алдаа өөр нэрээр
 * давтагдана. Нийлбэрүүд БҮГД `number | null` — бүх мөр хоосон бол `null`.
 */
import { HO_IPC, hoAmount, hoSaving, num, pkgKeyOf } from '@/lib/services';
import { queryFeatures } from '@/lib/query';
import { cached } from '@/lib/live';

export type Row = Record<string, unknown>;

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;

/* ─────────────────────────── АЧААЛАГЧ ─────────────────────────── */

/** Кэшийн ТТЛ — Finance.tsx-ийн `LIVE_TTL`-тэй ижил */
const HO_TTL = 60_000;

/**
 * 45 мөрийг БҮТНЭЭР татна.
 *
 * ⚠️ ГАНЦ query. Гэрээний түвшинг тусдаа `returnDistinctValues` query-ээр
 * авах ГЭЖ БҮҮ ОРОЛД — талбар давтагдана гэдэг батлагдсан тул клиент дээр
 * `groupHo()`-ээр нурааж нэг сүлжээний дуудлага хэмнэнэ.
 *
 * ⚠️ `orderBy` ЗААВАЛ. maxRecordCount 2000 тул 45 мөр нэг хуудсанд багтах ч
 * ArcGIS эрэмбэгүй хариуны дарааллыг БАТАЛГААЖУУЛДАГГҮЙ — `ipc_dugaar`-ийн
 * дараалал ба «эхний мөрөөр dedup» хоёулаа тогтвортой дараалал шаардана.
 *
 * ⚠️ `outFields: ['*']` — 36 талбар бүгд UI-ийн бүрэн хүснэгтэд хэрэгтэй.
 */
export const loadHoRows = cached(
  () => queryFeatures(HO_IPC.url, {
    outFields: ['*'],
    orderBy: `${HO_IPC.oid} ASC`,
  }) as Promise<Row[]>,
  HO_TTL,
  ['HO_IPC'],
);

/* ─────────────────────────── НИЙЛБЭР ─────────────────────────── */

/**
 * Мөрүүдийн төлбөрийн нийлбэр — БҮГД хоосон бол `null`, `0` БИШ.
 * ⚠️ `0` буцаавал «хэмжигдээгүй» ба «тэг олголт» хоёр нэгдэж, төлбөргүй
 * гэрээ «0 ₮ олгосон» гэж ХУДЛААР баталгаажна.
 */
export function sumPaid(rows: readonly Row[]): number | null {
  let acc: number | null = null;
  for (const r of rows) {
    const v = hoAmount(r);
    if (v == null) continue;
    acc = (acc ?? 0) + v;
  }
  return acc;
}

/** Тухайн ТӨРЛИЙН (урьдчилгаа/гүйцэтгэл) төлбөрийн нийлбэр */
export function sumPaidByKind(rows: readonly Row[], kind: string): number | null {
  return sumPaid(rows.filter((r) => r[P.kind] === kind));
}

/* ─────────────────────── ГЭРЭЭНИЙ ТҮВШИН ─────────────────────── */

/**
 * НЭГ ГЭРЭЭ — 45 төлбөрийн мөрөөс нурааж хураасан 22-ийн нэг.
 * ⚠️ Мөнгөн талбарууд БҮГД `number | null`: `null` = ХЭМЖИГДЭЭГҮЙ.
 */
export type HoContract = {
  /** `geree_kod` «Багц-1». Кодгүй мөрд `''` (амьдаар ХО-0045 нэг ширхэг) */
  code: string;
  /** `pkgKeyOf(bagts)` — багц↔гэрээ холбоосын түлхүүр. ⚠️ ДИАПАЗОН мөрд `''` */
  key: string;
  /** `bagts` түүхий утга — ХАРАГДАХ нэр */
  pkg: string;
  project: string;
  contractor: string;
  workType: string;
  contractNo: string;
  /** Нийт төсөвт өртөг /Захирамж/ — ГЭРЭЭНД НЭГ УДАА */
  budgetTotal: number | null;
  /** Гэрээ байгуулагдсан төсөв — ГЭРЭЭНД НЭГ УДАА */
  contractTotal: number | null;
  /** ⚠️ БОДОГДСОН (`hoSaving`), хадгалагдсан `hemnelt_hetrelt` БИШ */
  saving: number | null;
  /** Тухайн гэрээний төлбөрийн мөрүүд, OID дарааллаар */
  pays: Row[];
  /** Σ `dun`, `tulult_turul` = урьдчилгаа */
  advanceTotal: number | null;
  /** Σ `dun`, `tulult_turul` = гүйцэтгэл */
  workTotal: number | null;
  /** Σ `dun` БҮХ төлбөр — «ОЛГОСОН» (хэрэглэгчийн шийдвэр: урьдчилгаа ОРНО) */
  paidTotal: number | null;
  /** `paidTotal / contractTotal` × 100 — 0–100. ⚠️ `pct()` 100-аар үржүүлдэггүй */
  paidPct: number | null;
};

const str = (v: unknown): string => (v == null ? '' : String(v));

/**
 * Мөрүүдийг ГЭРЭЭ болгон нурааж хураана.
 *
 * ⚠️ БҮЛЭГЛЭХ ТҮЛХҮҮР нь `geree_kod`. Кодгүй мөр (амьдаар ХО-0045, 1 ширхэг)
 * ХАЯГДАХГҮЙ — `code: ''` бүхий тусдаа гэрээ болж нийт төсөвт үлдэнэ.
 * Хаявал 533,100,000 ₮-ийн төсөв чимээгүй алга болно.
 *
 * ⚠️ Гэрээний талбарыг бүлгийн ЭХНИЙ мөрөөс авна — амьдаар (2026-09-09)
 * гэрээ бүрд эдгээрийн uniq утга ЯГ 1 гэж батлагдсан. Мөр бүрээр
 * нийлүүлбэл Багц-4.1-ийн төсөв 7 ДАХИН давхардана.
 *
 * ⚠️ ДАРААЛАЛ хадгалагдана (`Map` нь оруулсан дарааллаар давтагддаг) —
 * дуудагч тал `loadHoRows`-ийн OID эрэмбийг үргэлжлүүлэн найдаж болно.
 */
export function groupHo(rows: readonly Row[]): HoContract[] {
  const byCode = new Map<string, Row[]>();
  for (const r of rows) {
    const code = str(r[C.code]).trim();
    const g = byCode.get(code);
    if (g) g.push(r); else byCode.set(code, [r]);
  }

  const out: HoContract[] = [];
  for (const [code, pays] of byCode) {
    const h = pays[0];
    const contractTotal = num(h[C.contractTotal]);
    const paidTotal = sumPaid(pays);
    out.push({
      code,
      key: pkgKeyOf(h[C.pkg]),
      pkg: str(h[C.pkg]),
      project: str(h[C.project]),
      contractor: str(h[C.contractor]),
      workType: str(h[C.workType]),
      contractNo: str(h[C.contractNo]),
      budgetTotal: num(h[C.budgetTotal]),
      contractTotal,
      saving: hoSaving(h),
      pays,
      advanceTotal: sumPaidByKind(pays, HO_IPC.kinds.advance),
      workTotal: sumPaidByKind(pays, HO_IPC.kinds.work),
      paidTotal,
      /* ⚠️ Хуваарь нь 0 эсвэл хэмжигдээгүй бол хувь БОДОГДОХГҮЙ (`null`) —
         0-д хуваавал Infinity гарч график эвдэрнэ. */
      paidPct: paidTotal == null || contractTotal == null || contractTotal === 0
        ? null
        : (paidTotal / contractTotal) * 100,
    });
  }
  return out;
}

/* ─────────────────────── БАГЦААР ЗАДЛАХ ─────────────────────── */

/**
 * БАГЦЫН ТҮЛХҮҮР → олгосон нийт ₮.
 *
 * ⚠️ Түлхүүр нь `pkgKeyOf(bagts)` — ДИАПАЗОН мөр (`''`) ба `bagts` хоосон
 * мөр Map-д ОГТ ОРОХГҮЙ. Тэдгээрийн дүн энэ Map-аас гадуур үлдэнэ, тиймээс
 * ЭНЭ MAP-ЫН НИЙЛБЭР нь ТӨСЛИЙН НИЙТ ДҮН БИШ (амьдаар 524.90 ↔ 530.87
 * тэрбум). Нийт хэрэгтэй бол `hoTotals().paid`.
 *
 * ⚠️ Хэмжигдээгүй (`dun` хоосон) мөр Map-д хувь нэмэр оруулахгүй; тухайн
 * багцын БҮХ мөр хоосон бол багц Map-д ОГТ ГАРАХГҮЙ — «0 ₮ олгосон» гэж
 * ХУДЛААР харагдахаас сэргийлнэ.
 */
export function paidByPkg(rows: readonly Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = hoAmount(r);
    if (v == null) continue;
    const k = pkgKeyOf(r[C.pkg]);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + v);
  }
  return m;
}

/**
 * Багцад ХОЛБОГДООГҮЙ төлбөрийн мөрүүд — диапазон/хоосон `bagts`.
 * ⚠️ Эдгээр нь `paidByPkg`-д ХЭЗЭЭ Ч харагдахгүй тул UI-д ЗААВАЛ тусад нь
 * ил гаргана (амьдаар 2 мөр, 5.97 тэрбум ₮). Чимээгүй алдагдуулахгүй.
 */
export function unlinkedPays(rows: readonly Row[]): Row[] {
  return rows.filter((r) => hoAmount(r) != null && !pkgKeyOf(r[C.pkg]));
}

/* ─────────────────────── СУУРЬ ХЭМЖИЛТ ─────────────────────── */

export type HoTotals = {
  /** Гэрээний тоо (dedup хийсэн) */
  contracts: number;
  /** Төлбөрийн мөрийн тоо */
  pays: number;
  /** Σ `tosov_niit` — ⚠️ ГЭРЭЭ БҮРД НЭГ УДАА */
  budget: number | null;
  /** Σ `gereet_tosov_niit` — ⚠️ ГЭРЭЭ БҮРД НЭГ УДАА */
  contract: number | null;
  /** Σ (төсөв − гэрээт) — ⚠️ БОДОГДСОН */
  saving: number | null;
  /** Σ `dun` БҮХ төлбөр — «олгосон нийт» */
  paid: number | null;
  advance: number | null;
  work: number | null;
  /** `paid / contract` × 100 — 0–100 */
  paidPct: number | null;
};

/**
 * Төслийн НИЙТ хэмжилт.
 * ⚠️ `budget`/`contract`/`saving` нь ГЭРЭЭНИЙ түвшнээс (`groupHo`) —
 * мөрөөр нийлүүлбэл давхардана. `paid`/`advance`/`work` нь ТӨЛБӨРИЙН
 * түвшнээс — гэрээгээр нийлүүлэх нь ижил үр дүн ч мөрөөр бодох нь шууд.
 * АМЬД ХҮЛЭЭЛТ (2026-09-09): budget 2,090.198 · contract 2,005.710 ·
 * saving 84.488 · paid 530.873 (advance 314.010 + work 216.863) тэрбум ₮.
 */
export function hoTotals(rows: readonly Row[]): HoTotals {
  const cs = groupHo(rows);
  const acc = (pick: (c: HoContract) => number | null): number | null => {
    let a: number | null = null;
    for (const c of cs) { const v = pick(c); if (v != null) a = (a ?? 0) + v; }
    return a;
  };
  const contract = acc((c) => c.contractTotal);
  const paid = sumPaid(rows);
  return {
    contracts: cs.length,
    pays: rows.length,
    budget: acc((c) => c.budgetTotal),
    contract,
    saving: acc((c) => c.saving),
    paid,
    advance: sumPaidByKind(rows, HO_IPC.kinds.advance),
    work: sumPaidByKind(rows, HO_IPC.kinds.work),
    paidPct: paid == null || contract == null || contract === 0
      ? null
      : (paid / contract) * 100,
  };
}

/* ─────────────────────── IPC ДУГААРЫН ЦУВАА ─────────────────────── */

/**
 * Гэрээний IPC дугаарууд — ӨСӨХ дарааллаар, давхардалгүй.
 * ⚠️ Урьдчилгаа мөрд `ipc_dugaar` ҮРГЭЛЖ null (амьдаар 20/20) тул эндээс
 * АВТОМАТААР хасагдана — «IPC хэд вэ» гэсэн тоонд урьдчилгааг тоолохгүй.
 */
export function ipcNumbers(pays: readonly Row[]): number[] {
  const s = new Set<number>();
  for (const r of pays) {
    const n = num(r[P.ipcNo]);
    if (n != null) s.add(n);
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * IPC дугаар 1-ээс эхэлж ЦООРХОЙГҮЙ үргэлжилж байна уу?
 *
 * ⚠️ Амьд өгөгдөлд гэрээ БҮРД 1..n цоорхойгүй (Багц-1: 1,2 · Багц-3.3:
 * 1..5 …). Цоорхой гарвал энэ нь ӨГӨГДӨЛ ДУТУУ гэсэн ДОХИО — акт
 * бүртгэгдээгүй эсвэл татахад мөр унасан. UI-д анхааруулга болгож гарга.
 * Дугаар ОГТ байхгүй (зөвхөн урьдчилгаа) бол `true` — шалгах зүйл алга.
 */
export function ipcSeqOk(pays: readonly Row[]): boolean {
  const ns = ipcNumbers(pays);
  return ns.every((n, i) => n === i + 1);
}

/** Дугаарын цоорхой — «1,2,4» → `[3]`. Цоорхойгүй бол хоосон массив. */
export function ipcGaps(pays: readonly Row[]): number[] {
  const ns = ipcNumbers(pays);
  if (!ns.length) return [];
  const have = new Set(ns);
  const gaps: number[] = [];
  for (let i = 1; i <= ns[ns.length - 1]; i++) if (!have.has(i)) gaps.push(i);
  return gaps;
}
