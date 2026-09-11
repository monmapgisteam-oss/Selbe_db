/**
 * ХӨРӨНГӨ ОРУУЛАЛТЫН ГҮЙЦЭТГЭЛ — ХОЁР ТҮВШНИЙ ачаалагч ба цэвэр тооцоо.
 * Эх сурвалж: `HO_IPC` (`HO_guitsetgel_arcgis_csv/196`, амьдаар 52 мөр).
 *
 * ⚠️ ЯАГААД ХОЁР ТҮВШИН ВЭ. Мөр = НЭГ ТӨЛБӨРИЙН ГҮЙЛГЭЭ; гэрээний талбар
 * (`tosov_niit`, `gereet_tosov_niit`, `guitsetgegch`…) нь `geree_kod` бүрд
 * ДАВТАГДАНА. 52 мөр = 22 гэрээ. Мөр бүрээр SUM хийвэл Багц-4.1 (8 мөр)
 * -ийн төсөв 8 ДАХИН давхардана — `reportData.ts`-д баримтжуулсан «5.4
 * дахин хөөрөгдөх» алдааны ЯГ ЭНЭ ЛЭ хэлбэр. Тиймээс:
 *   · ГЭРЭЭНИЙ тоо → `groupHo()`-ийн `HoContract` (dedup хийсэн, 22)
 *   · ТӨЛБӨРИЙН тоо → мөрүүд өөрсдөө (52)
 *
 * ⚠️ «ЭХНИЙ МӨРӨӨР DEDUP» ГЭДЭГ ХУУЧИН ИНВАРИАНТ ХҮЧИНГҮЙ БОЛСОН
 * (2026-09-11-нд амьд өгөгдлөөр хэмжив). Тухайн үед (2026-09-09) «гэрээ
 * бүрд гэрээний талбарын uniq утга ЯГ 1» гэж бичигдсэн боловч ТЭР ҮЕД
 * `ipcAuto` -ийн үүсгэсэн AUTO мөр хараахан байгаагүй юм. ОДОО 52 мөрийн 7
 * нь AUTO (`murun_id` нь `AUTO|` угтвартай, OBJECTID 46–52) бөгөөд
 * `ipcAuto.autoInsert` нь гэрээний талбарыг ОГТ БИЧДЭГГҮЙ — тэдгээр мөрд
 * `tosov_niit`, `gereet_tosov_niit`, `guitsetgegch` … БҮГД `null`. Үүнээс
 * 7 гэрээнд (Багц-1, 2, 3.1, 3.2, 3.3, 4.1, 4.2) талбар бүрт `[утга, null]`
 * гэсэн ХОЁР uniq утга үүсэв.
 *
 * ⚠️ ХЭР АЮУЛТАЙ ВЭ (хэмжив): AUTO мөр бүлгийн ЭХЭНД ирвэл тэдгээр 7
 * гэрээний төсөв `null` болж, `hoTotals().budget` нь 2,090,198,253,462 →
 * 166,054,833,462 ₮ (−1,924.1 тэрбум), `contract` нь 2,005,709,962,931 →
 * 148,071,054,945 ₮ болж ЧИМЭЭГҮЙ унана. Одоо унаагүй байгаа цорын ганц
 * шалтгаан нь AUTO мөрүүд OBJECTID 46–52 буюу гараар оруулсны ДАРАА сууж,
 * `loadHoRows` нь `OBJECTID ASC`-аар татдагт л бий — өгөгдлийн ДАРААЛАЛ
 * дээр тогтсон аюул. Тиймээс `groupHo` нь одоо «эхний мөр» БИШ, «утгатай
 * (non-null) ЭХНИЙ мөр»-өөс гэрээний талбарыг авна (`pickField` доор) —
 * дарааллаас ХАМААРАХГҮЙ.
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
/* ⚠️ `hoSaving` ХАСАГДСАН (2026-09-11): тэр нь НЭГ мөрөөс төсөв/гэрээт хоёрыг
   уншдаг тул AUTO мөр бүлгийн толгой болвол `null` буцаана. Хэмнэлтийг одоо
   `pickField`-ээр сонгосон хоёр утгаас `groupHo` дотор бодно. `hoSaving`
   өөрөө `services.ts`-д ХЭВЭЭР (ipcTable-ийн «хадгалагдсантай тулгах» шалгуур
   түүнийг ганц мөрөөр дууддаг нь ЗӨВ хэрэглээ). */
import { HO_IPC, hoAmount, num, pkgKeyOf } from '@/lib/services';
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

/** Утга «байгаа» эсэх — `null`, `undefined`, хоосон мөр гурав нь БАЙХГҮЙ. */
const has = (v: unknown): boolean => v != null && v !== '';

/**
 * НЭГ ГЭРЭЭНИЙ бүх мөрөөс тухайн гэрээний талбарын утгыг сонгоно.
 *
 * ⚠️ «ЭХНИЙ МӨР» БИШ, «УТГАТАЙ ЭХНИЙ МӨР». Учир нь `ipcAuto.autoInsert` нь
 * гэрээний талбарыг ОГТ бичдэггүй тул AUTO мөр бүр ХООСОН гэрээний талбартай
 * (амьдаар 52 мөрийн 7). AUTO мөр бүлгийн эхэнд ирвэл «эхний мөр» дүрэм нь
 * тухайн гэрээний төсвийг `null` болгож, `hoTotals().budget`-ыг 373–453
 * тэрбумаар ЧИМЭЭГҮЙ унагана (модулийн толгой дахь ⚠️-г үз). Non-null сонголт
 * нь мөрийн ДАРААЛЛААС хамаарахаа болино.
 *
 * ⚠️ ХОЁР ӨӨР NON-NULL УТГА гарвал ЮУ БОЛОХ ВЭ — ИЛ ШИЙДВЭР: ЭХНИЙ non-null
 * утгыг авч, `console.warn`-оор ДУУДЛАГА ӨГНӨ. Чимээгүй сонгохгүй байх нь
 * гол: тийм зөрчил нь эх сурвалж дээр НЭГ гэрээ хоёр өөр төсөвтэй бичигдсэн
 * гэсэн үг бөгөөд түүнийг код шийдэж чадахгүй, AGOL дээр л засна.
 *
 * ⚠️ Амьдаар (2026-09-11) мөнгөн болон бичвэр гэрээний талбар бүрд ХОЁР
 * ӨӨР non-null утга АЛГА — цорын ганц ялгаа нь `bagts`-ийн бичиглэл
 * («Багц-4.1» ↔ «Багц 4-1»). Тэр хоёр нь `bagtsKey`-ээр ИЖИЛ түлхүүрт
 * унадаг (цэг, зураас, зайг хаядаг) тул багц↔гэрээ холбоос ЭВДРЭХГҮЙ;
 * зөвхөн ХАРАГДАХ нэр л сонгогдоно. Тиймээс `pkg`-д анхааруулга гаргахгүй.
 */
function pickField(pays: readonly Row[], field: string, warn: boolean): unknown {
  let out: unknown = null;
  let found = false;
  for (const r of pays) {
    const v = r[field];
    if (!has(v)) continue;
    if (!found) { out = v; found = true; continue; }
    if (warn && v !== out) {
      /* ⚠️ Чимээгүй БИШ — эх сурвалжийн зөрчлийг ил хэлнэ. Эхний утгыг
         барина (дээрх ⚠️), гэхдээ хүн үүнийг мэдэх ёстой. */
      console.warn(
        `[ipc.groupHo] «${str(r[C.code])}» гэрээний «${field}» талбарт ХОЁР өөр утга: `
        + `${JSON.stringify(out)} ба ${JSON.stringify(v)}. Эхнийхийг авав — AGOL дээр залруул.`,
      );
    }
  }
  return out;
}

/**
 * Мөрүүдийг ГЭРЭЭ болгон нурааж хураана.
 *
 * ⚠️ БҮЛЭГЛЭХ ТҮЛХҮҮР нь `geree_kod`. Кодгүй мөр (амьдаар ХО-0045, 1 ширхэг)
 * ХАЯГДАХГҮЙ — `code: ''` бүхий тусдаа гэрээ болж нийт төсөвт үлдэнэ.
 * Хаявал 533,100,000 ₮-ийн төсөв чимээгүй алга болно.
 *
 * ⚠️ Гэрээний талбарыг «УТГАТАЙ ЭХНИЙ мөр»-өөс авна (`pickField`) — «эхний
 * мөр» БИШ. Хуучин дүрэм нь AUTO мөр (гэрээний талбар нь БҮГД хоосон)
 * бүлгийн эхэнд ирмэгц тухайн гэрээний төсвийг `null` болгодог байв;
 * дэлгэрэнгүйг модулийн толгой дахь ⚠️-ээс үз. Мөр бүрээр нийлүүлбэл
 * Багц-4.1-ийн төсөв 8 ДАХИН давхардана.
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
    /* ⚠️ Талбар БҮРИЙГ тусад нь сонгоно — НЭГ «толгой мөр» СОНГОХГҮЙ. Учир нь
       нэг мөрөнд төсөв нь бөглөгдсөн атлаа гүйцэтгэгч нь хоосон байж болно;
       «толгой мөр» сонгох загвар тийм тохиолдолд дутуу талбарыг чимээгүй
       `null` болгоно. `bagts` нь бичиглэлээрээ зөрдөг тул анхааруулгагүй
       (`pickField`-ийн ⚠️), бусад нь зөрвөл console.warn өгнө. */
    const pick = (f: string, warn = true) => pickField(pays, f, warn);
    const pkg = pick(C.pkg, false);
    /* ⚠️ Талбар бүрийг ЯГ НЭГ УДАА сонгоно. Хоёр удаа уншвал зөрчлийн
       анхааруулга ч ХОЁР удаа хэвлэгдэж, нэг зөрчил хоёр мэт харагдана. */
    const budgetTotal = num(pick(C.budgetTotal));
    const contractTotal = num(pick(C.contractTotal));
    const paidTotal = sumPaid(pays);
    out.push({
      code,
      key: pkgKeyOf(pkg),
      pkg: str(pkg),
      project: str(pick(C.project)),
      contractor: str(pick(C.contractor)),
      workType: str(pick(C.workType)),
      contractNo: str(pick(C.contractNo)),
      budgetTotal,
      contractTotal,
      /* ⚠️ Хэмнэлтийг СОНГОСОН хоёр утгаас бодно — `hoSaving(h)` нь нэг мөрийг
         шаарддаг тул AUTO мөр толгой болвол `null` буцаана.
         ⚠️ `pick`-ийг ДАХИН дуудахгүй, дээр сонгосон `budgetTotal`-ыг
         хэрэглэнэ: талбар бүрийг олон удаа уншвал нэг зөрчил олон
         анхааруулга болж хэвлэгдэнэ (амьдаар 1 зөрчил → 3 мөр). */
      saving: budgetTotal == null || contractTotal == null
        ? null
        : budgetTotal - contractTotal,
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
