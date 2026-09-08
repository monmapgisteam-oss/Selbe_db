/**
 * CEO ҮЗҮҮЛЭЛТ — ЧАНАРЫН ХЯНАЛТ (QAQC): БАРИМТ БҮРДЭЭГҮЙ АЖИЛ.
 *
 * 10 багцын Inspection Test Plan хүснэгтийг (`QAQC`/`QAQC2` үйлчилгээ)
 * бүтнээр уншиж, ажил бүрийн 9 баримтын багана (М-акт · FIC · MA · MIR) хэр
 * бөглөгдсөнийг тоолно. Гол тоо нь НЭГ Ч БАРИМТГҮЙ ажлын тоо.
 *
 * ⚠️ ХАГАС ХЭРЭГЖИЛТ ДЭЭР СУУРИЛНА: `src/lib/qaqc.ts` нь ЗӨВХӨН нэг багцыг
 *    уншдаг (`loadQaqcRows`) — 10 багцыг нэгтгэх давхарга нь ЭНД.
 *
 * ⚠️ БҮЛГИЙН МӨРИЙГ ЯЛГАХ ГАНЦ ЗАМ — БӨГЛӨХ ХУУДАСНЫ МОД. `loadQaqcRows` нь
 *    ҮРГЭЛЖ `group: false, depth: 0` буцаадаг (QAQC хүснэгтэд шатлалын
 *    багана байхгүй, `qaqc.ts`-ийн тайлбар). Тиймээс багц бүрд бөглөх
 *    хуудасны мөрийг (`loadSchema` + `loadRows`, зөвхөн 4 талбар) татаж
 *    `attachTree`-ээр холбоно — «Чанар» харагдац (`Qaqc.tsx`) яг ингэдэг тул
 *    энд гарах «баримтгүй» тоо тэр харагдацын толгойн тоотой ТААРНА.
 *    Мод холбогдохгүй бол (хуудас унасан, мөр зөрсөн) багцыг ХАЯХГҮЙ —
 *    хавтгайгаар тоолоод `flat` гэж тэмдэглэнэ: тэр багцад бүлгийн мөр
 *    (ойролцоогоор мөрийн 8–15%) «ажил» болж давхар тоологдоно гэдгийг
 *    `issues` ба `facts`-д ИЛ хэлнэ, чимээгүй хөөрөгдөхгүй.
 *
 * ⚠️ ХҮЧИНГҮЙ БОЛГОХ ТҮЛХҮҮР ХАГАС. `dataBus`-т QAQC-ийн `DataKey` алга тул
 *    `saveQaqc` («Чанар» харагдацаас хадгалахад) ЭНЭ кэшийг хүчингүй
 *    болгодоггүй — зөвхөн 5 минутын TTL-ээр шинэчлэгдэнэ. Харин мод нь
 *    бөглөх хуудаснаас ирдэг тул `['BAGTS_SHEET']` таг — хуудсанд мөр
 *    нэмэгдэхэд шатлал өөрчлөгдөж, холболт дахин хийгдэх ёстой.
 *    Хэрэв хожим `'QAQC'` түлхүүр `dataBus.ts`-д нэмэгдвэл энд нэмнэ.
 *
 * ⚠️ ЗЭРЭГ 3 ХҮСЭЛТЭЭС ИЛҮҮГҮЙ (`QAQC_CONCURRENCY`). Багц бүр QAQC метадата +
 *    хуудаслалт + бөглөх хуудасны схем + хуудаслалт гэсэн 4+ дуудалттай; 10-ыг
 *    зэрэг тавьбал ArcGIS «Too many requests» буцааж хагас багц уншигдахгүй
 *    үлддэг. Нэг багцын дуудалтууд хязгаарлагчийн НЭГ байранд дараалан явна.
 *
 * ⚠️ `null` ≠ 0. Нэг ч багц уншигдаагүй бол ачаалагч АЛДАА шиднэ (гэрээ:
 *    зөвхөн ЮУ Ч уншигдаагүй үед); тооцооны функц нь ийм оролтод «—» ба
 *    `unknown` буцаана. Уншигдсан ч ажлын мөргүй хүснэгт (total = 0) мөн
 *    `unknown` — 0/0 нь хувь биш.
 *
 * ⚠️ Тооцоо (`computeQaqc`, `attachOrFlat`) ба татац (`loadQaqcKpi`) ТУСДАА —
 *    `qaqc.check.mjs` сүлжээгүйгээр тооцоог шалгана.
 */
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';
import { cached } from '@/lib/live';
import type { Level } from '@/lib/kpiLevels';
import {
  QAQC_COLS, attachTree, filledCount, isDataRow, loadQaqcRows, qaqcTableOf,
  type QaqcRow, type TreeRow,
} from '@/lib/qaqc';
import { PKGS, loadSchema, type Pkg } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { cell, settled, table, type KpiIssue, type KpiResult } from './kpi';

/* ══════════════ Босго ══════════════ */

/**
 * ⚠️ САНАЛ (2026-09-06) — хэрэглэгч хараахан БАТЛААГҮЙ. Баримт нь ажил
 *    явахын хэрээр АЛГУУР бөглөгдөнө: ихэнх ажил хараахан эхлээгүй тул
 *    «баримтгүй» эзлэх хувь угаасаа өндөр. Тиймээс зөвхөн МАШ өндөр хувь л
 *    дохио: 90%+ улаан, 50–90 шар, 50-иас доош ногоон. `kpiLevels.ts`-д
 *    нэгтгэх эсэхийг хэрэглэгч шийднэ.
 */
export const QAQC_EMPTY_WARN_SHARE = 0.5;
export const QAQC_EMPTY_BAD_SHARE = 0.9;

/**
 * Баримтгүй ажлын ЭЗЛЭХ ХУВИЙН түвшин — ТООГООР авна, хувиар БИШ.
 * ⚠️ `empty ÷ total` бутархайг босготой ШУУД харьцуулна: `pct → ÷100` гэж
 *    буцааж хөрвүүлбэл бутархайн алдаагаар босгыг алгасах эрсдэлтэй.
 */
export const qaqcEmptyLevel = (empty: number, total: number): Level =>
  total <= 0 ? 'unknown'
    : empty / total >= QAQC_EMPTY_BAD_SHARE ? 'bad'
      : empty / total >= QAQC_EMPTY_WARN_SHARE ? 'warn' : 'good';

/* ══════════════ Багц тус бүрийн тооцоо (цэвэр) ══════════════ */

/** Багцын танигдах хэсэг — `Pkg`-ийн `url`, `floors` энд хэрэггүй */
export type PkgLite = { key: string; label: string };

/** Хагас бүрдсэн мөр — дутуу баримтын богино нэрс (`QAQC_COLS.short`) хамт */
export type PartialRow = { row: QaqcRow; missing: string[] };

export type PkgQaqc = {
  pkg: PkgLite;
  /** Жинхэнэ ажлын мөр — excel-ийн толгой ба бүлгийн мөр хасагдсан */
  total: number;
  /** 9 баримтын нэг нь ч бөглөгдөөгүй */
  empty: number;
  /** Зарим нь бөглөгдсөн, бүгд биш */
  partial: number;
  /** Бөглөгдсөн нүд, бүх мөрөөр (`filledCount`) */
  filled: number;
  /** `empty ÷ total`, 0–1. ⚠️ Ажлын мөргүй хүснэгтэд `null`, 0 БИШ */
  share: number | null;
  /**
   * Мод холбогдоогүй — бүлгийн мөр ялгагдаагүй тул `total`/`empty` нь
   * бүлгийн мөрийг ч агуулна (хөөрөгдсөн). Дуудагч ИЛ хэлнэ.
   */
  flat: boolean;
  emptyRows: QaqcRow[];
  partialRows: PartialRow[];
};

/**
 * Нүд бөглөгдсөн үү. `toRows` хоосныг аль хэдийн `null` болгодог ч зөвхөн
 * зайнаас бүрдсэн мөрийг давхар хамгаална — «бөглөгдсөн» гэж худал тоолохгүй.
 */
const filledDoc = (d: string | null | undefined): boolean => d != null && d.trim() !== '';

/**
 * Нэг багцын QAQC мөрүүдийг ангилна.
 * ⚠️ `!r.group` нь ЗӨВХӨН мод холбогдсон (`attachOrFlat`) мөрөнд утгатай —
 *    `loadQaqcRows`-ийн түүхий мөр бүгд `group: false`. `flat` багцад энэ
 *    шүүлт юу ч хасахгүй; түүнийг мэдэж `flat` тугийг дамжуулна.
 */
export function summarizePkg(pkg: PkgLite, rows: readonly QaqcRow[], flat = false): PkgQaqc {
  const data = rows.filter((r) => isDataRow(r) && !r.group);
  const emptyRows: QaqcRow[] = [];
  const partialRows: PartialRow[] = [];
  for (const r of data) {
    const n = QAQC_COLS.filter((_, i) => filledDoc(r.docs[i])).length;
    if (n === 0) {
      emptyRows.push(r);
    } else if (n < QAQC_COLS.length) {
      partialRows.push({
        row: r,
        missing: QAQC_COLS.filter((_, i) => !filledDoc(r.docs[i])).map((c) => c.short),
      });
    }
  }
  const total = data.length;
  return {
    pkg,
    total,
    empty: emptyRows.length,
    partial: partialRows.length,
    filled: filledCount(rows),
    share: total > 0 ? emptyRows.length / total : null,
    flat,
    emptyRows,
    partialRows,
  };
}

/** Муу нь эхэнд: эзлэх хувь буурахаар → баримтгүй тоо → нэр. Хувьгүй (ажилгүй) багц сүүлд */
export const worstFirst = (a: PkgQaqc, b: PkgQaqc): number =>
  (b.share ?? -1) - (a.share ?? -1) || b.empty - a.empty || a.pkg.label.localeCompare(b.pkg.label);

/* ══════════════ Мод холбох (цэвэр) ══════════════ */

export type QaqcLoaded = {
  pkg: PkgLite;
  rows: readonly QaqcRow[];
  /** Бөглөх хуудасны мод холбогдоогүй — бүлгийн мөр ажил болж тоологдоно */
  flat: boolean;
};

/**
 * QAQC мөрөнд бөглөх хуудасны шатлалыг холбоно; болохгүй бол ХАВТГАЙ.
 *
 * ⚠️ `attachTree` нь мөрийн тоо/дараалал зөрвөл `null` буцаадаг (таамагладаггүй,
 *    `qaqc.ts`) — тэр үед болон хуудас огт татагдаагүй (`sheet == null`) үед
 *    түүхий мөрийг хэвээр авч `flat: true` тавина. Багцыг унасанд ТООЛОХГҮЙ:
 *    QAQC хүснэгт өөрөө уншигдсан, зөвхөн бүлгийн ялгаа алга.
 */
export function attachOrFlat(
  pkg: PkgLite,
  rows: readonly QaqcRow[],
  sheet: readonly TreeRow[] | null,
): QaqcLoaded {
  const tree = sheet ? attachTree(rows, sheet) : null;
  return tree ? { pkg, rows: tree, flat: false } : { pkg, rows, flat: true };
}

/* ══════════════ Нэгтгэл → KpiResult (цэвэр) ══════════════ */

/**
 * Уншигдсан багцуудаас үзүүлэлт угсарна.
 * @param loaded амжилттай уншигдсан багцууд (`flat` нь мод холбогдоогүйг заана)
 * @param failed уншигдаагүй багцын НЭРС (`Pkg.label`) — тоо биш, нэр
 */
export function computeQaqc(loaded: readonly QaqcLoaded[], failed: readonly string[]): KpiResult {
  const pkgs = loaded.map((l) => summarizePkg(l.pkg, l.rows, l.flat)).sort(worstFirst);
  const flat = pkgs.filter((p) => p.flat);
  /**
   * ⚠️ ХАВТГАЙ БАГЦЫГ НЭГТГЭЛД ОРУУЛАХГҮЙ (2026-09-07-ны аудит).
   *
   * Мод холбогдоогүй үед `summarizePkg`-ийн `!r.group` шүүлт ЮУ Ч хасахгүй
   * (түүхий мөр бүгд `group: false`) тул БҮЛГИЙН гарчгийн мөрүүд «баримтгүй
   * ажил» гэж тоологдоно. Багц 3.3-д тэр нь ~90 хуурамч мөр нэмж, порталын
   * НИЙТ үзүүлэлтийг гажуудуулж байв.
   *
   * ⚠️ Бүлгийг QAQC-ийн ӨӨРИЙН өгөгдлөөр таних БОЛОМЖГҮЙ: 2026-09-07-нд
   *    9 багцын мод дээр хэмжихэд `№` нь бүлэг ба навчид ИЖИЛ хэлбэртэй
   *    («1», «1.1» хоёуланд), баримтын багана хоёуланд нь хоосон. Ялгах
   *    цорын ганц багана (`Хувийн_жин`) 2026-09-03-нд хасагдсан.
   *
   * ⚠️ ХАСАХ нь НУУХ гэсэн үг БИШ: багц нь `tables`-д хэвээр жагсана, мөн
   *    `issues`-д шалтгаан ба хийх ажлыг ил хэлнэ. Зөвхөн ХУУРАМЧ тоог
   *    нийлбэрээс гаргав — буруу тоо нь тооцоогүйгээс ДОР.
   */
  const counted = pkgs.filter((p) => !p.flat);
  const total = counted.reduce((n, p) => n + p.total, 0);
  const empty = counted.reduce((n, p) => n + p.empty, 0);
  const partial = counted.reduce((n, p) => n + p.partial, 0);
  /* ⚠️ Ажлын мөр огт байхгүй бол хувь БАЙХГҮЙ (0 биш) — «—» болно */
  const emptyPct = total > 0 ? (empty / total) * 100 : null;

  /* ⚠️ Зөвхөн ТОО бүхий богино хэсгүүд — өгүүлбэр, тайлбар ХОРИОТОЙ (kpi.ts) */
  const facts: string[] = [];
  if (emptyPct != null) facts.push(tr('{0} нийт {1} ажлаас', pct(emptyPct), num(total)));
  if (total > 0) facts.push(tr('{0} ажил хагас бүрдсэн', num(partial)));
  if (failed.length > 0) facts.push(tr('{0} багц уншигдаагүй', num(failed.length)));
  if (flat.length > 0) facts.push(tr('{0} багц мод холбогдоогүй', num(flat.length)));

  const byPkg = table(
    tr('Багцаар'),
    [tr('Багц'), tr('Ажил'), tr('Баримтгүй'), tr('Хагас'), tr('Баримтгүй %')],
    pkgs.map((p) => [
      cell(p.pkg.label),
      cell(p.total, 'count'),
      cell(p.empty, 'count'),
      cell(p.partial, 'count'),
      /* ⚠️ `pct` нүдэнд 0–100 — `share` нь 0–1 тул энд 100-аар үржүүлнэ */
      cell(p.share == null ? null : p.share * 100, 'pct'),
    ]),
  );

  /* Багцаар бүлэглэнэ (багцын дараалал = дээрх муу-нь-эхэндээ); багц дотор хуудасны дараалал */
  const emptyTable = table(
    tr('Баримтгүй ажлууд'),
    [tr('Багц'), tr('№'), tr('Ажил')],
    pkgs.flatMap((p) => p.emptyRows.map((r) => [
      cell(p.pkg.label), cell(r.no || null), cell(r.work || null),
    ])),
  );

  /* Багц дотор дутуу баримт ОЛОНТОЙ нь эхэнд; тэнцвэл хуудасны дараалал (sort тогтвортой) */
  const partialTable = table(
    tr('Хагас бүрдсэн ажлууд'),
    [tr('Багц'), tr('№'), tr('Ажил'), tr('Дутуу баримт')],
    pkgs.flatMap((p) => [...p.partialRows]
      .sort((a, b) => b.missing.length - a.missing.length)
      .map(({ row, missing }) => [
        cell(p.pkg.label),
        cell(row.no || null),
        cell(row.work || null),
        /* ⚠️ `short` нь `Qaqc.tsx`-тэй адил `tr()`-ээр — толгойн нэр хоёр газар ижил орчуулагдана */
        cell(missing.map((m) => tr(m)).join(', ')),
      ])),
  );

  /* Унасан багц эхэнд (өгөгдөл огт алга), дараа нь мод холбогдоогүй багц (тоо хөөрөгдсөн) */
  const issues: KpiIssue[] = [
    ...failed.map((label): KpiIssue => ({
      text: tr('{0} — QAQC хүснэгт уншигдсангүй', label),
      tone: 'warn',
    })),
    /*
     * ⚠️ ШАЛТГААНЫГ ИЛ ХЭЛНЭ (2026-09-07-ны аудит). Урьд нь «мод холбогдсонгүй»
     *    гэдэг л мэдээлдэг байсан тул хэрэглэгч ЮУГ засахаа мэдэхгүй байв.
     *    Хэмжилтээр: Багц 3.3-ын QAQC хүснэгт 1,258 мөртэй атлаа бөглөх хуудас
     *    1,459 — дутуу 201 мөр нь ТӨГСГӨЛД биш, 46-р мөрөөс эхлэн ДУНД нь
     *    тархсан (QAQC нь Excel-ийн ХУУЧИН хувилбараас үүссэн). Тиймээс
     *    програмаас нөхөх боломжгүй: аль мөр аль ажилд харьяалагдахыг таамаглавал
     *    чанарын акт БУРУУ ажилд бичигдэнэ.
     */
    ...flat.map((p): KpiIssue => ({
      text: tr('{0} — QAQC хүснэгтийн мөр бөглөх хуудастай таарахгүй тул шатлал холбогдсонгүй. Бүлгийн мөрийг ажлаас ялгах боломжгүй тул энэ багц НИЙТ үзүүлэлтэд ОРООГҮЙ. QAQC хүснэгтийг эх хүснэгтийн шинэ хувилбараар дахин үүсгэх шаардлагатай.', p.pkg.label),
      tone: 'warn',
    })),
  ];

  return {
    /* ⚠️ Ажлын мөргүй бол «—»: тоолсон зүйл байхгүй, «0 баримтгүй» гэж худал уншигдана */
    value: total > 0 ? num(empty) : num(null),
    unit: tr('ажил баримтгүй'),
    facts,
    level: qaqcEmptyLevel(empty, total),
    tables: [byPkg, emptyTable, partialTable],
    issues,
    /* QAQC хүснэгтэд огнооны талбар байхгүй — агшин тодорхойгүй */
    asOf: null,
    failedSources: [...failed],
  };
}

/* ══════════════ Татац ══════════════ */

/** Зэрэг явах QAQC хүсэлтийн дээд тоо */
export const QAQC_CONCURRENCY = 3;

/**
 * Зэрэгцээ ажлын ХЯЗГААРЛАГЧ — нэг зэрэг `max`-аас илүүгүй `task` явна.
 *
 * ⚠️ Чөлөөлөгдсөн байрыг хүлээгчид ШУУД өгнө (`active`-ийг бууруулахгүй).
 *    Эхлээд бууруулж дараа нь сэрээвэл тоолуур буурсан агшинд шинээр ирсэн
 *    ажил ба сэрсэн хүлээгч хоёул орж `max`-ыг давна.
 */
export function limiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (task) => {
    if (active < max) active += 1;
    else await new Promise<void>((wake) => { waiting.push(wake); });
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

/**
 * Бөглөх хуудасны ШАТЛАЛД хэрэгтэй мөрүүд — зөвхөн 4 талбар.
 *
 * ⚠️ `fields`-ээр хязгаарлана: бүтэн «*» татвал мөр ~60+ баганатай, 10 багц
 *    ~10–20МБ (`execTriage.ts`-ийн аудит). `loadRows`-д хэрэгтэй нь `oid`
 *    (эрэмбэ), `no` (жаазны заагч `lastFrame`), `work` (зэрэгцүүлэлт), `gun`
 *    (гүн — байхгүй бол `TREES` зураглалд буцна). Бусад нь модонд хэрэггүй.
 * ⚠️ Уналт нь `null` — дуудагч хавтгайгаар үргэлжилнэ, QAQC багцыг унагахгүй.
 */
async function loadTreeRows(pkg: Pkg): Promise<TreeRow[] | null> {
  try {
    const sc = await loadSchema(pkg);
    const need = [sc.f.oid, sc.f.no, sc.f.work, sc.f.gun].filter((x): x is string => Boolean(x));
    const { rows } = await loadRows(pkg, sc, undefined, need);
    return rows;
  } catch {
    return null;
  }
}

/** Нэг багц: QAQC мөр (унавал багц унана) → мод (унавал хавтгай) */
async function loadPkg(pkg: Pkg): Promise<QaqcLoaded> {
  const rows = await loadQaqcRows(pkg.key);
  const sheet = await loadTreeRows(pkg);
  return attachOrFlat({ key: pkg.key, label: pkg.label }, rows, sheet);
}

async function loadAll(): Promise<KpiResult> {
  const run = limiter(QAQC_CONCURRENCY);
  /* ⚠️ QAQC хүснэгтгүй багц (`qaqcTableOf` → null) нь «уналт» БИШ — жагсаалтад орохгүй */
  const targets = PKGS.filter((p) => qaqcTableOf(p.key) != null);
  const results = await Promise.allSettled(targets.map((p) => run(() => loadPkg(p))));
  const { ok, failed } = settled(results, targets.map((p) => p.label));
  /* ⚠️ Нэг ч багц уншигдаагүй → шиднэ: `cached` амжилтгүй амлалтыг кэшлэхгүй
     тул дараагийн дуудалт дахин оролдоно. Хэсэгчилсэн уналт ШИДЭХГҮЙ —
     `failedSources`-оор ил гарна. */
  if (ok.length === 0) {
    throw new Error(tr('QAQC хүснэгт нэг ч уншигдсангүй ({0} багц)', failed.length));
  }
  return computeQaqc(ok, failed);
}

/**
 * ⚠️ `['BAGTS_SHEET']` — мод бөглөх хуудаснаас ирдэг (файлын толгойн тайлбар).
 *    QAQC хүснэгтийн ӨӨРИЙН бичилтэд (`saveQaqc`) `DataKey` байхгүй тул түүнд
 *    зөвхөн 5 минутын TTL үйлчилнэ.
 */
export const loadQaqcKpi: () => Promise<KpiResult> = cached(loadAll, 5 * 60_000, ['BAGTS_SHEET']);
