/**
 * ТАЙЛАНГИЙН ӨРГӨТГӨСӨН ӨГӨГДӨЛ — 8–11-р хэсгийн БҮХ тоо ЭНД нэгтгэгдэнэ.
 *
 * ⚠️ Дэлгэц (`Tailan.tsx`) ба PDF (`reportPdf.ts`) ХОЁУЛАА ЯГ ЭНЭ объектыг
 * хэрэглэнэ. Хоёр газар тус тусад нь тооцвол PDF нь дэлгэцээс зөрч, аль нь зөв
 * болох нь мэдэгдэхгүй болно — тиймээс тооцоолол энд ГАНЦ УДАА хийгдэнэ.
 *
 * ⚠️ САНХҮҮ: `CASHFLOW` (BUS_cashflow) хүснэгтийн мөнгөн БҮХ багана өнөөдөр
 * ХООСОН (7 мөр, дүн бүр 0). Тиймээс санхүүг `CASHFLOW2`
 * (`cashflow_0813/FeatureServer/173`, 209 мөр)-оос авна — «Цогцолбор»
 * дашбоардын толгойн тоо ч мөн эндээс гардаг.
 *
 * ⚠️ 2026-08-31: CASHFLOW2 нь «нэг гэрээ = нэг мөр» БАЙХАА БОЛИВ — 209 мөрийн
 * 76 нь ГЭРЭЭ (мастер), 131 нь САР, 2 нь ӨМНӨХ ШИЛЖҮҮЛСЭН. Тиймээс энэ файлын
 * гэрээний ТООЛОЛТ, багц/төрлийн бүлэглэлт БҮГД `where.master`-аар шүүгдэнэ.
 * Мөнгөн НИЙЛБЭР шүүлтгүй ч зөв гарна (мастер багана үеийн мөрөнд NULL) тул
 * алдаа нь зөвхөн ТООНД харагдана — хамгийн чимээгүй төрлийн эвдрэл.
 *
 * ⚠️ CASHFLOW2 нь гэрээ бүрийн САНХҮҮЖИЛТИЙН ХУВААРЬ буюу ТӨЛӨВЛӨГӨӨ —
 * «бодитоор олгосон» дүнг эндээс ХЭЗЭЭ Ч гаргаж болохгүй (ирээдүйн сарууд ч
 * орсон байдаг). Бодит олголт нь IPC актын лог (`IPC_LOG` — `ipc_0813/172`,
 * 59 мөр)-оос гарна — Finance/ExecKpi/Tsogts бүгд тэндээс уншдаг, тайлан ч
 * мөн адил.
 *
 * ⚠️ ХӨРӨНГӨ ОРУУЛАЛТЫН ГУРВАН ӨӨР ТОО байдгийг бүү хольж уншаарай:
 *     · 2,333.9 тэрбум — илтгэлийн «гэрээ, захирамжид тусгагдсан» дүн (`brief`)
 *     · 2,541.5 тэрбум — `CASHFLOW2`-ийн ЗАХИРАМЖИЙН дүн (амьд)
 *     · 2,073.1 тэрбум — `CASHFLOW2`-ийн ГЭРЭЭНИЙ дүн (амьд)
 *   Тайланд аль нь болохыг гарчигт нь ЗААВАЛ бичнэ.
 *
 * ⚠️ ХАБЭА-гийн хүн хүчний маягт нь өдөр тутмын цуваа БИШ: нийт 1 бүртгэлтэй
 * бөгөөд гүйцэтгэгч бүр ӨӨРИЙН баганын бүлэгтэй (`laborCompanyFields`).
 * Тиймээс энэ нь «сүүлийн байдлаарх агшны төлөв» болохоос түүх биш.
 */

import { useAsync, type Async } from '@/lib/useAsync';
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';
import { queryFeatures } from '@/lib/query';
import { cached, loadClearance } from '@/lib/live';
import { layerTotals } from '@/lib/totals';
import {
  BUILDING, CASHFLOW2, HABEA, IPC_LOG, LAYER_GROUPS, GROUP_LAYERS, LAYER_BY_ID,
  bagtsKey, pkgKeyOf, laborCompanyFields, cfMonthAxis, cfMonthKey, ipcNet,
} from '@/lib/services';

/* ═══════════════ Төрөл ═══════════════ */

export type BlockRow = { block: string; bagts: string; pct: number };

export type ReportExtra = {
  /**
   * Төслийн НИЙТ гүйцэтгэл — БАГЦААР, төсвийн жингээр.
   *
   * ⚠️ 2026-08-27: `stages` нь урьд «ТЭЗҮ · Зөвшөөрөл · Барилга угсралт…»
   * гэсэн ҮЕ ШАТУУД байсан. Тэр бүтэц зөвхөн `Төсөл_Гүйцэтгэл_` хүснэгтэд
   * байсан бөгөөд тэр нь хасагдсан тул мөр бүр одоо НЭГ БАГЦ.
   */
  /*
   * ⚠️ БҮХ ХУВЬ 0–100. `format.ts::pct()` нь 100-аар ҮРЖҮҮЛДЭГГҮЙ — зөвхөн
   *    «%» тэмдэг залгадаг тул 0–1 масштабтай утга дамжуулбал 26.3% нь
   *    «0.3%» болж ЧИМЭЭГҮЙ буурч харагдана.
   */
  overall: {
    /** Жингээр нормчилсон нийт гүйцэтгэл, 0–100 */
    pct: number;
    /**
     * Жингийн нийлбэр, 0–100 — гүйцэтгэл бүртгэгдсэн багцуудын эзлэх төсвийн
     * хувь. 100-аас бага бол зарим багц хараахан бөглөгдөөгүй гэсэн үг.
     */
    weightSum: number;
    /** Тооцоонд орсон БЛОКИЙН тоо */
    rows: number;
    stages: {
      label: string;
      /** Тухайн багцын блокийн тоо */
      rows: number;
      /** Төслийн төсөвт эзлэх хувь, 0–100 */
      weight: number;
      /** Бодит гүйцэтгэл, 0–100 */
      actual: number;
      planned: number | null;
    }[];
  };
  /** Газар чөлөөлөлт — `land:left` давхарга */
  land: {
    parcels: number;
    areaM2: number;
    /** Шийдвэрлэгдсэн нэгж талбарын эзлэх хувь, 0–100 */
    pct: number | null;
    byStatus: { label: string; n: number }[];
    /** Үлдсэн нэгж талбарын шалтгаан — хоосон нүд орохгүй */
    byReason: { label: string; n: number }[];
  };
  /** Нийгмийн үйлчилгээний барилга — «Нийгмийн дэд бүтэц» багцын давхаргууд */
  social: {
    rows: { title: string; n: number; areaM2: number }[];
    n: number;
    areaM2: number;
  };
  progress: {
    blocks: number;
    /** Блокуудын гүйцэтгэлийн дундаж, % — дашбоардын толгойн тоотой нэг загвар */
    overall: number;
    /** Хамгийн сүүлийн тайлагнасан огноо */
    date: string;
    /** Үе шат тус бүрийн дундаж гүйцэтгэл */
    phases: { no: string; name: string; pct: number }[];
    byBagts: { bagts: string; blocks: number; pct: number }[];
    /** Хамгийн бага гүйцэтгэлтэй 10 блок */
    slowest: BlockRow[];
    /**
     * 1%-иас доош гүйцэтгэлтэй БҮХ блокийн тоо.
     * ⚠️ `slowest`-ээс тоолж БОЛОХГҮЙ — тэр зөвхөн эхний 10 мөр тул бодит тоо
     * 10-аас их байхад «яг 10» гэж худал дүгнэлт гарна.
     */
    stalled: number;
  };
  finance: {
    rows: number;
    budget: number;
    orderTotal: number;
    contractAmount: number;
    sources: { label: string; value: number }[];
    /**
     * Сар бүрийн САНХҮҮЖИЛТИЙН ХУВААРЬ (төлөвлөгөө) — CASHFLOW2.
     * ⚠️ Олголт БИШ: ирээдүйн сарууд ч орсон тул «олгосон» гэж шошгохгүй.
     */
    months: { label: string; amount: number; cum: number }[];
    /**
     * Бодитоор олгосон санхүүжилт — IPC актын НИЙЛБЭР, ₮.
     * ⚠️ Хадгалсан багана байхгүй болсон тул `ipcNet()`-ээр БОДОГДОНО
     *    (гүйцэтгэлийн дүн − 4 суутгал).
     */
    paid: number;
    byType: { type: string; n: number; budget: number; contract: number }[];
    /** Багцын түлхүүр (`BagtsRow.key`) → урьдчилсан төсөвт өртөг, ₮ */
    byBagts: Record<string, number>;
  };
  /* ⚠️ 2026-08-24: `cost` талбар ХАСАГДАВ — «Өртгийн загвараар тооцсон дүн»
     нь зохиомол `negj_une` өгөгдөл дээр тогтдог байсан тул тайлангаас гарсан. */
  infra: {
    groups: {
      key: string; title: string; layers: number;
      n: number; len: number; area: number;
    }[];
    totals: { layers: number; n: number; len: number; area: number };
  };
  habea: {
    date: string;
    workers: number; mongol: number; gadaad: number; tehnik: number;
    byCompany: {
      label: string; bagts: string | null;
      workers: number; mongol: number; gadaad: number; tehnik: number;
    }[];
    incidents: number;
  };
};

/* ═══════════════ Туслах ═══════════════ */

const nn = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * ⚠️ Мөрийн ТАСРАЛТ хүртэл цэвэрлэнэ: `CASHFLOW2`-ийн зарим ангилал
 * («ГАДНА ТОХИЖИЛТ,\nӨНДӨРЖИЛТ») дотроо `\n` агуулдаг — цэвэрлэхгүй бол
 * хүснэгтийн нүд хоёр мөр болж эвдэрнэ.
 */
const str = (v: unknown): string => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

/** `БАГЦ1|5/1` → `{ bagts: 'БАГЦ1', block: '5/1' }` */
function splitKey(key: string): { bagts: string; block: string } {
  const i = key.indexOf('|');
  return i < 0 ? { bagts: '', block: key } : { bagts: key.slice(0, i), block: key.slice(i + 1) };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);

/**
 * «БАРИЛГЫН АЖИЛ» → «Барилгын ажил».
 * ⚠️ Эх хүснэгтэд үе шатны нэр БҮХ ТОМ үсгээр бичигдсэн байдаг. Албан ёсны
 * тайланд ийнхүү гаргавал хашгирсан мэт уншигдана.
 */
const sentenceCase = (s: string) => {
  const t = s.trim();
  if (!t) return t;
  // Зөвхөн ТОМ үсгээр бичигдсэн үед л хөрвүүлнэ — зөв бичсэнийг эвдэхгүй
  return t === t.toLocaleUpperCase('mn-MN') && t !== t.toLocaleLowerCase('mn-MN')
    ? t.charAt(0) + t.slice(1).toLocaleLowerCase('mn-MN')
    : t;
};

/* ═══════════════ Багцын нэр ═══════════════ */

/**
 * `bagtsKey` → УНШИГДАХ нэр («БАГЦ32» → «Багц 3.2»).
 *
 * ⚠️ Гүйцэтгэлийн түлхүүр нь `bagtsKey`-ээр цэг, зай, зураасаа алддаг тул
 * буцааж сэргээх аргагүй — цорын ганц эх нь барилгын давхаргын `BAGTS` талбар.
 * ⚠️ `loadOverall` ба `loadProgress` ХОЁУЛАА хэрэглэдэг тул кэштэй: эс бөгөөс
 * тайлан үүсгэх бүрд 113 мөрийн асуулга хоёр удаа явна.
 */
/* ⚠️ `loadHousing` (live.ts) МӨН `BUILDING`-ээс уншдаг — ижил тагтай. */
const loadPkgLabels = cached(async (): Promise<Map<string, string>> => {
  const rows = await queryFeatures(BUILDING.url, { outFields: [BUILDING.fields.bagts] });
  const m = new Map<string, string>();
  rows.forEach((b) => {
    const name = str(b[BUILDING.fields.bagts]);
    if (name) m.set(bagtsKey(name), name);
  });
  return m;
}, 5 * 60_000, ['BUILDING']);

/* ═══════════════ Төслийн нийт гүйцэтгэл ═══════════════ */

/**
 * ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ — багц бүрийн блокийн дундажийг ТӨСВИЙН ЖИНГЭЭР.
 *
 * ⚠️ 2026-08-21: `Төсөл_Гүйцэтгэл_` (Excel-ээс гараар импортлогддог 162 мөр)
 * төслөөс БҮРЭН ХАСАГДСАН — жингийн нийлбэр 81.53%, `Төсөл` багана 20 мөрд
 * буруу, төлөвлөгөө 74 мөрд хоосон байсан тест өгөгдөл.
 *
 * ⚠️ ҮЕ ШАТНЫ (ТЭЗҮ · Зөвшөөрөл · Сонгон шалгаруулалт…) задаргаа АЛГА БОЛОВ —
 * тэр бүтэц зөвхөн хуучин хүснэгтэд байсан. Оронд нь мөр бүр НЭГ БАГЦ.
 *
 * ⚠️ 2026-08-27: энэ функц урьд нь `Selbe_guitsetgel_consolidated` руу ӨӨРИЙН
 * асуулга явуулж, `loadBlockProgress`-ийн ЯГ ижил тооцоог давтдаг байв. Тэр
 * үйлчилгээ хаагдсан (499) тул НЭГ эх сурвалж руу нэгтгэв.
 *
 * ⚠️ ЖИН нь БЛОКИЙН ТОО БИШ, ТӨСӨВ. Блокоор жигнэвэл 20 блоктой хямд багц
 * 4 блоктой үнэтэй багцаас таван дахин их нөлөөлнө — төслийн гүйцэтгэлийн
 * утга нь мөнгө болохоос барилгын ширхэг биш. Мөн блокоор жигнэсэн дүн нь
 * 6-р хэсгийн энгийн дундажтай ЯГ давхцаж, хоёр хэсэг нэг тоог давтана.
 *
 * ⚠️ Төсөвгүй багцад блокийн тоог нөөц жин болгоно — эс бөгөөс тэр багц
 * нийт дүнд ОГТ оролцохгүй, гүйцэтгэл нь чимээгүй өндөрсөнө.
 */
/**
 * ⚠️ ЭКСПОРТЛОГДСОН БА ТУСДАА КЭШТЭЙ (2026-08-31).
 *
 * Урьд нь эдгээр нь модулийн дотоод, кэшгүй байсан бөгөөд гадагш зөвхөн
 * `loadReportExtra` гарч байв. Тиймээс энэ дүнгийн ЖИЖИГ хэсэг хэрэгтэй
 * хэрэглэгч (ж: «Үйл ажиллагааны схем») бүтэн тайланг татах шаардлагатай
 * болж, дагаад `loadInfra`-ийн ~88 stat хүсэлт явдаг байлаа.
 *
 * ⚠️ Тусдаа кэш нь ДАВХАРДАЛ ҮҮСГЭХГҮЙ: `loadReportExtraRaw` нь эдгээр
 *    ороомгуудыг дуудна тул «Тайлан» ба «Схем» хоёр НЭГ хүсэлт хуваалцана.
 */
export const loadOverall = cached(loadOverallRaw, 5 * 60_000, ['BAGTS_SHEET', 'CASHFLOW2']);

async function loadOverallRaw(): Promise<ReportExtra['overall']> {
  const F = CASHFLOW2.fields;
  const { loadBlockProgress } = await import('@/lib/blockProgress');
  const [cells, labels, cf] = await Promise.all([
    loadBlockProgress(),
    loadPkgLabels(),
    /* Зөвхөн 3 талбар — `loadFinance` нь «*»-оор бүтнээр татдаг ч энэ нь
       тусдаа кэштэй дуудалт тул хөнгөн байлгав.
       ⚠️ `where.master` ЗААВАЛ: төсөв нь ЗӨВХӨН ГЭРЭЭ мөрөнд бичигдсэн бөгөөд
       үеийн 133 мөр нь багцаа давтдаг тул шүүлтгүй бол нэг гэрээ олон удаа
       ирж, жин нь худал өснө. */
    queryFeatures(CASHFLOW2.url, {
      where: CASHFLOW2.where.master,
      outFields: [F.pkg2, F.pkg, F.budget],
    }),
  ]);

  /** багцын түлхүүр → урьдчилсан төсөвт өртөг, ₮ */
  const budget = new Map<string, number>();
  cf.forEach((r) => {
    // ⚠️ `pkg2` (CF007, НАВЧ) ЭХЭЛЖ: `pkg` (CF006) нь дээд багц тул
    //    «БАГЦ-16.1…16.7»-г НЭГ түлхүүрт нурааж, багцын жин холилдоно.
    // ⚠️ `pkgKeyOf` (bagtsKey БИШ): «БАГЦ 1-4» мэт ДИАПАЗОН мөр хоосон түлхүүр
    //    авах тул бодит «Багц 14»-т харийн төсөв наалдахгүй.
    const k = pkgKeyOf(r[F.pkg2]) || pkgKeyOf(r[F.pkg]);
    if (!k || k === '0') return;
    budget.set(k, (budget.get(k) ?? 0) + nn(r[F.budget]));
  });

  /** багц → блокийн гүйцэтгэлүүд (0–1) */
  const byPkg = new Map<string, number[]>();
  for (const [key, cell] of cells) {
    // Түлхүүр нь `${БАГЦ}|${блок}` (`buildingKey`) — багцын хэсгийг нь авна
    const pkg = key.split('|')[0];
    if (!pkg) continue;
    const arr = byPkg.get(pkg) ?? [];
    // `cell.overall` нь аль хэдийн 0–100 — хөрвүүлэлт ХЭРЭГГҮЙ
    arr.push(cell.overall);
    byPkg.set(pkg, arr);
  }

  /* Төсвийн НИЙТ дүн — жинг 0–1 болгож нормчилох хуваарь */
  const budgetAll = [...budget.values()].reduce((a, b) => a + b, 0);

  const raw = [...byPkg.entries()].map(([pkg, list]) => ({
    label: labels.get(pkg) ?? pkg,
    rows: list.length,
    /* Төсөв байхгүй бол блокийн тоо — нэгж нь өөр ч доор нормчлогдоно */
    money: budget.get(pkg) ?? 0,
    actual: list.length ? list.reduce((x, y) => x + y, 0) / list.length : 0,
    planned: null as number | null,
  }));

  /* ⚠️ Аль ч багцад төсөв олдоогүй бол блокийн тоонд БҮРЭН шилжинэ — хагас
     хагасаар холивол нэгж нь зөрж, жин нь утгагүй болно. */
  const useMoney = budgetAll > 0 && raw.some((s) => s.money > 0);
  const denom = useMoney ? budgetAll : raw.reduce((a, s) => a + s.rows, 0);

  const stages = raw
    .map(({ money, ...s }) => ({
      ...s,
      weight: denom ? ((useMoney ? money : s.rows) / denom) * 100 : 0,
    }))
    .sort((x, y) => y.weight - x.weight || x.label.localeCompare(y.label, 'mn', { numeric: true }));

  const weightSum = stages.reduce((a, s) => a + s.weight, 0);
  const done = stages.reduce((a, s) => a + s.weight * s.actual, 0);

  return {
    // ⚠️ Жингийн НИЙЛБЭРТ харьцуулна, 1-д БИШ: бүртгэгдээгүй багцыг «0%
    //    гүйцэтгэлтэй» гэж тооцвол төслийн дүн худал буурна.
    pct: weightSum ? done / weightSum : 0,
    weightSum,
    rows: stages.reduce((a, s) => a + s.rows, 0),
    stages,
  };
}

/* ═══════════════ Газар чөлөөлөлт ═══════════════ */

/** «Үлдсэн нэгж талбар» — шийдвэрлэгдээгүйг таних ЦОРЫН ГАНЦ дүрэм */
/* ⚠️ ЗӨВХӨН тайлбар бичвэрийн «үлдсэн талбарын ТОО»-нд (2026-08-29). Чөлөөлөлтийн
   ХУВЬ үүгээр бодогдохоо больсон — тэр нь дашбоардтай нэг эх `loadClearance`. */
const isLeftParcel = (label: string) => /Үлдсэн/i.test(label);

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТ.
 *
 * ⚠️ 2026-08-27: гүйцэтгэлийн хувийг урьд нь `loadOverall()`-ийн үе шатны
 * хүснэгтээс («Газар чөлөөлөлт» нэртэй мөр) авдаг байв. Тэр хүснэгт
 * БАГЦУУДЫН жагсаалт болсон тул тийм нэртэй мөр хэзээ ч олдохгүй бөгөөд
 * хувь нь ҮРГЭЛЖ `null` — тайланд «—» гэж чимээгүй хоосорч байлаа.
 * Одоо давхаргын ӨӨРИЙНХ нь төлвөөс бодно: шийдвэрлэгдсэн ÷ нийт.
 */
export const loadLand = cached(loadLandRaw, 5 * 60_000, ['PARCEL_LEFT']);

async function loadLandRaw(): Promise<ReportExtra['land']> {
  // ⚠️ `url` нь заавал биш (BuildingSceneLayer г.м. давхаргад байхгүй) — шалгана
  const d = LAYER_BY_ID['land:left'];
  if (!d?.url) return { parcels: 0, areaM2: 0, pct: null, byStatus: [], byReason: [] };
  /* Зөвхөн тоолдог 3 талбар (2026-08-21 гүйцэтгэлийн аудит): «*» нь 2,119
     парселийн БҮХ баганыг (эзний нэр, хаяг зэрэг хувийн мэдээллийг оролцуулаад)
     ~2-4МБ-аар татдаг байв — тайланд огт хэрэггүй. */
  const rows = await queryFeatures(d.url, {
    outFields: ['Tuluv', 'явцын_мэдээ', d.qty?.field ?? 'area_m2'],
  });

  const tally = (field: string, skipEmpty: boolean) => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = str(r[field]);
      if (!k && skipEmpty) return;
      m.set(k || tr('Тодорхойгүй'), (m.get(k || tr('Тодорхойгүй')) ?? 0) + 1);
    });
    return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  };

  const byStatus = tally('Tuluv', false);
  /*
   * ⚠️ ХУВЬ нь ДАШБОАРДТАЙ НЭГ ЭХ СУРВАЛЖААС (2026-08-29). Урьд нь энд
   * «нийт − үлдсэн» гэж боддог байсан бол дашбоард/«Газар чөлөөлөлт» нь
   * «бүрэн чөлөөлсөн + цэвэрлэсэн» гэж тоолдог — хэлэлцээр хийж буй зэрэг
   * завсрын төлөв нэгэнд нь «шийдэгдсэн», нөгөөд нь «биш» болж тайлан 91.9%,
   * дашбоард 89.9% гэж зөрдөг байв. Одоо `loadClearance`-ийн ганц дүрэм.
   */
  const clearance = await loadClearance();

  return {
    parcels: rows.length,
    areaM2: rows.reduce((a, r) => a + nn(r[d.qty?.field ?? 'area_m2']), 0),
    pct: clearance.pct,
    byStatus,
    // «явцын_мэдээ» нь ЗӨВХӨН шийдэгдээгүй нэгж талбарт бөглөгддөг — хоосныг хасна
    byReason: tally('явцын_мэдээ', true),
  };
}

/* ═══════════════ Нийгмийн үйлчилгээний барилга ═══════════════ */

async function loadSocial(): Promise<ReportExtra['social']> {
  const ids = GROUP_LAYERS.pkgSoc ?? [];
  const rows = (await Promise.all(ids.map(async (id) => {
    const d = LAYER_BY_ID[id];
    if (!d) return null;
    try {
      const t = await layerTotals(d, '1=1');
      return { title: d.title, n: t.n, areaM2: d.qty?.unit === 'м²' ? (t.q ?? 0) : 0 };
    } catch { return null; }
  }))).filter((r): r is NonNullable<typeof r> => !!r);

  return {
    rows,
    n: rows.reduce((a, r) => a + r.n, 0),
    areaM2: rows.reduce((a, r) => a + r.areaM2, 0),
  };
}

/* ═══════════════ Барилга угсралтын гүйцэтгэл ═══════════════ */

export const loadProgress = cached(loadProgressRaw, 5 * 60_000, ['BAGTS_SHEET']);

async function loadProgressRaw(): Promise<ReportExtra['progress']> {
  const { loadBlockProgress } = await import('@/lib/blockProgress');
  const [map, labelOf] = await Promise.all([
    loadBlockProgress(),
    // ⚠️ Багцын УНШИГДАХ нэр («Багц 3.2») зөвхөн барилгын давхаргад бий:
    // гүйцэтгэлийн түлхүүр нь `bagtsKey`-ээр цэгээ алдсан («БАГЦ32») тул
    // буцааж сэргээх аргагүй. `loadOverall` ч мөн үүнийг хэрэглэдэг тул
    // кэштэй ГАНЦ ачаалагчаар (`loadPkgLabels`) явна.
    loadPkgLabels(),
  ]);

  const label = (k: string) => labelOf.get(k) ?? (k || '—');

  type Phase = { no: string; name: string; pct: number | null };
  const rows: (BlockRow & { date: string; phases: readonly Phase[] })[] =
    [...map.entries()].map(([key, v]) => ({
      ...splitKey(key),
      pct: nn(v.overall),
      date: v.date ?? '',
      phases: v.phases ?? [],
    }));

  /*
   * Үе шатны дундаж — үе шатны дугаараар нэгтгэнэ (блок бүрт ижил 5 үе шат).
   * ⚠️ `pct === null` нь «тухайн блокт ХАМААРАХГҮЙ» гэсэн утга: тэгээр
   * орлуулбал дундаж хиймлээр буурна. Тиймээс дунджаас ХАСНА.
   */
  const phaseMap = new Map<string, { no: string; name: string; xs: number[] }>();
  rows.forEach((r) => r.phases.forEach((p) => {
    const e = phaseMap.get(p.no) ?? { no: p.no, name: p.name, xs: [] };
    if (p.pct != null && Number.isFinite(p.pct)) e.xs.push(p.pct);
    phaseMap.set(p.no, e);
  }));

  /* Багцаар */
  const bagtsMap = new Map<string, number[]>();
  rows.forEach((r) => {
    const a = bagtsMap.get(r.bagts) ?? [];
    a.push(r.pct);
    bagtsMap.set(r.bagts, a);
  });

  return {
    blocks: rows.length,
    overall: mean(rows.map((r) => r.pct)),
    date: rows.map((r) => r.date).filter(Boolean).sort().pop() ?? '',
    /**
     * ⚠️ ХЭМЖИЛТГҮЙ ҮЕ ШАТЫГ ОРУУЛАХГҮЙ (2026-09-03-ны аудит).
     *
     * `mean([])` нь 0 буцаадаг тул нэг ч блокт хувь бүртгэгдээгүй үе шат
     * «0.00%» гэж хэвлэгдэж, улмаар тайлангийн дүгнэлтэд «N үе шат
     * хараахан ЭХЛЭЭГҮЙ байна» гэсэн ХУДАЛ өгүүлбэр болдог байв —
     * «хэмжигдээгүй» ба «эхлээгүй» хоёр огт өөр утга. Хэмжилттэй үе шат
     * л жагсаалтад орно.
     */
    phases: [...phaseMap.values()]
      .filter((p) => p.xs.length > 0)
      .sort((a, b) => a.no.localeCompare(b.no, 'mn'))
      .map((p) => ({ no: p.no, name: sentenceCase(p.name), pct: mean(p.xs) })),
    byBagts: [...bagtsMap.entries()]
      .map(([k, xs]) => ({ bagts: label(k), blocks: xs.length, pct: mean(xs) }))
      .sort((a, b) => b.pct - a.pct),
    slowest: rows
      .slice()
      .sort((a, b) => a.pct - b.pct || a.block.localeCompare(b.block, 'mn'))
      .slice(0, 10)
      .map((r) => ({ block: r.block, bagts: label(r.bagts), pct: r.pct })),
    stalled: rows.filter((r) => r.pct < 1).length,
  };
}

/* ═══════════════ 9 · Санхүүжилтийн явц ═══════════════ */

/*
 * ⚠️ 2026-08-31: `isRealAct` (`/^(IPC|APC|АРС)[-\s]?\d+/`) ХАСАГДАВ. Тэр нь
 * хуучин `IPC_/107`-гийн 90 мөрөөс 31 хог мөрийг (Contract Price псевдо-мөр,
 * дугааргүй мөр) хасах зориулалттай байсан. Шинэ `ipc_0813/172`-ийн 59 мөр
 * БҮГД жинхэнэ акт бөгөөд дугаар нь «1,2,3…» тоо (дэлгэцийн «IPC-03» кодыг
 * `ipcCode()` угсардаг) тул тэр шүүлт БҮХ мөрийг хаяж, олгосон дүн 0 болно.
 */

export const loadFinance = cached(loadFinanceRaw, 5 * 60_000, ['CASHFLOW2', 'IPC_LOG']);

async function loadFinanceRaw(): Promise<ReportExtra['finance']> {
  const F = CASHFLOW2.fields;
  const I = IPC_LOG.fields;
  const [rows, ipc] = await Promise.all([
    /* ⚠️ Мөрийн ГУРВАН төрөл нэг хүснэгтэд (ГЭРЭЭ · САР · ӨМНӨХ ШИЛЖҮҮЛСЭН)
       тул нэг удаа татаад ЭНД задална — гэрээний тоо/бүлэглэлт мастер мөрөөс,
       сарын урсгал үеийн мөрөөс. */
    queryFeatures(CASHFLOW2.url, { outFields: ['*'] }),
    /* ⚠️ Олгох дүн одоо БОДОГДОНО (`ipcNet`) тул суутгалын 4 багана хэрэгтэй —
       хадгалсан `net` багана байхгүй болсон. */
    queryFeatures(IPC_LOG.url, { outFields: [I.gross, ...IPC_LOG.deductions] }),
  ]);

  /** Гэрээний МАСТЕР мөр (76) — гэрээний бүх шинж зөвхөн энд */
  const master = rows.filter((r) => str(r[F.rowType]) === CASHFLOW2.rows.master);
  /** Хэмжилттэй мөрүүд (САР + ӨМНӨХ ШИЛЖҮҮЛСЭН, 133) */
  const periods = rows.filter((r) => str(r[F.rowType]) !== CASHFLOW2.rows.master);
  const sum = (f: string) => master.reduce((a, r) => a + nn(r[f]), 0);

  /*
   * САРЫН ХУВААРЬ — үеийн мөрүүдийг `CF003`/`CF004`-ээр бүлэглэнэ.
   *
   * ⚠️ Тэнхлэгийг өгөгдөлд БАЙГАА саруудаас угсарч БОЛОХГҮЙ: 2026-01-д ямар ч
   *    хэмжилт алга тул график нэг сар алгасаж, түүнээс хойшхи бүх багана нэг
   *    нүд зүүн тийш шилжинэ. `cfMonthAxis()` нь ТАСРАЛТГҮЙ хуанли өгдөг —
   *    мөргүй сар 0-ээр нөхөгдөнө.
   * ⚠️ Өссөн дүн (`cum`) МӨН БОДОГДОНО — хуучин «өссөн» багана хасагдсан.
   * ⚠️ «ӨМНӨХ ШИЛЖҮҮЛСЭН» мөрд сар байхгүй (`cfMonthKey` → null) тул энэ
   *    цуваанд ОРОХГҮЙ: тэр нь өмнөх оных бөгөөс аль ч сард ногдуулбал
   *    хуурамч оргил үүснэ.
   */
  const byMonth = new Map<string, number>();
  periods.forEach((r) => {
    const k = cfMonthKey(r);
    if (!k) return;
    byMonth.set(k, (byMonth.get(k) ?? 0) + nn(r[F.amount]));
  });
  let cum = 0;
  const months = cfMonthAxis().map((m) => {
    const amount = byMonth.get(m.label) ?? 0;
    cum += amount;
    return { label: m.label, amount, cum };
  });

  /*
   * «Бодитоор олгосон» — IPC актын логийн олгох дүнгийн нийлбэр.
   * ⚠️ Урьд нь CASHFLOW2-ийн сарын ТӨЛӨВЛӨГӨӨГ хуримтлуулж `paid` болгодог
   * байсан нь бодит олголтоос олон дахин их (ирээдүйн саруудыг ч багтаасан)
   * худал тоо байв.
   * ⚠️ ШҮҮЛТГҮЙ — 59 мөр бүгд жинхэнэ акт. Багцаар шүүх хуучин хамгаалалт ч
   *    хасагдав: одоо `IPC03` нь багцын НЭР (утга нь «0» байхаа больсон) тул
   *    тэр шалгуур бодит актуудыг чимээгүй хаядаг.
   *
   * ⚠️ ДҮРЭМ — ТӨСЛИЙН НИЙТ ОЛГОЛТ = БҮХ АКТЫН `ipcNet` НИЙЛБЭР. Багцаар
   *    задалсан аливаа Map-ыг нийлүүлж төслийн дүн ГАРГАЖ БОЛОХГҮЙ: актын
   *    8 мөрд (OBJECTID 40–43, 56–59) `IPC03`/`IPC04` хоёулаа NULL тул тэдгээр
   *    багцын аль нэгэнд ч харьяалагдахгүй. Тэдний цэвэр дүн 1,835,065,071 ₮ —
   *    багцын нийлбэр 314.5 тэрбум, жинхэнэ нийт 316.35 тэрбум ₮. Тайлан ·
   *    PDF · схем ЭНЭ тоог хэрэглэдэг тул зөрүү нь ЭНД биш, багцын Map-ыг
   *    нийлүүлдэг талд (`Finance.givenTotal` → `ExecKpi`) байна.
   *    Энэ мөрийг «дашбоардтай тааруулъя» гэж багцаар ШҮҮВЭЛ бодит олголтыг
   *    1.84 тэрбум ₮-ээр дутуу тайлагнана — тэр нь хоёр дэлгэц зөрөхөөс ДОР.
   */
  const paid = ipc.reduce((a, r) => a + ipcNet(r), 0);

  /*
   * Төрлөөр — ЗӨВХӨН мастер мөрөөс (эс тэгвээс нэг гэрээ 14 удаа тоологдоно).
   * ⚠️ Ангилалгүй 4 гэрээ: хуучин схемд `CF002` нь «0» гэсэн ТЕКСТ байсан,
   *    шинэд `CF005` нь NULL — `str()` хоёуланг нь хоосон болгодог тул энэ
   *    шалгуур хэвээр ажиллана.
   */
  const typeMap = new Map<string, { n: number; budget: number; contract: number }>();
  master.forEach((r) => {
    const t = str(r[F.type]);
    if (!t || t === '0') return;
    const e = typeMap.get(t) ?? { n: 0, budget: 0, contract: 0 };
    e.n += 1;
    e.budget += nn(r[F.budget]);
    e.contract += nn(r[F.contractAmount]);
    typeMap.set(t, e);
  });

  /**
   * БАГЦ БҮРИЙН урьдчилсан төсөвт өртөг — `BagtsRow.key`-ээр хайхад бэлэн.
   *
   * ⚠️ Урьд нь тайлангийн «Багц бүрээр» хүснэгт `BagtsRow.budget`-ыг уншдаг
   * байсан бөгөөд тэр нь BUS_cashflow-оос ирдэг байв. Тэр эх сурвалж
   * 2026-08-13-нд ХАСАГДСАН (санхүүгийн ЦОРЫН ГАНЦ зөв эх нь Cashflow /106)
   * тул талбар нь `BagtsRow`-оос ч устсан. Одоо ижил тоог зөв эх сурвалжаас
   * энд бэлдэнэ — тайлангийн багана хэвээр ажиллана.
   *
   * ⚠️ `pkgKeyOf` (bagtsKey БИШ): «БАГЦ 1-4» мэт ОЛОН багц хамарсан мөр нь
   * bagtsKey-ээр «БАГЦ14» болж, бодит «Багц 14»-т ХАРИЙН гэрээний төсвийг
   * наадаг. Диапазон мөр хоосон түлхүүр авах тул аль ч багцад нэмэгдэхгүй.
   *
   * ⚠️ Нэг багцад олон гэрээ ногдож болно (ТЭЗҮ, барилга…) тул НИЙЛБЭР.
   *
   * ⚠️ Дэд багц (`CF007`) ЭХЭЛЖ: `CF006` нь дээд багц тул «БАГЦ-16.1…16.7»
   *    бүгд нэг түлхүүрт нийлж, багцын хүснэгт нэг мөр болж хумигдана.
   * ⚠️ ЗӨВХӨН мастер мөрөөс — үеийн мөр багцаа давтдаг тул нэг гэрээний төсөв
   *    14 дахин нэмэгдэнэ (мөнгөн багана NULL тул НИЙТ дүнд илрэхгүй!).
   */
  const byBagts: Record<string, number> = {};
  master.forEach((r) => {
    const k = pkgKeyOf(r[F.pkg2]) || pkgKeyOf(r[F.pkg]);
    if (!k || k === '0') return;
    byBagts[k] = (byBagts[k] ?? 0) + nn(r[F.budget]);
  });

  return {
    // ⚠️ Гэрээний тоо = МАСТЕР мөрийн тоо (76), хүснэгтийн бүх мөр (209) БИШ
    rows: master.length,
    budget: sum(F.budget),
    orderTotal: sum(F.orderTotal),
    contractAmount: sum(F.contractAmount),
    // ⚠️ `s.total` — эх үүсвэрийн ГЭРЭЭНИЙ нийт дүн. `s.period` нь тухайн
    //    үеийн задаргаа тул мастер мөрөнд хоосон.
    sources: CASHFLOW2.sources.map((s) => ({ label: s.label, value: sum(s.total) })),
    months,
    paid,
    byType: [...typeMap.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.budget - a.budget),
    byBagts,
  };
}

/* ═══════════════ 10 · Дэд бүтцийн хэрэгжилт ═══════════════ */

async function loadInfra(): Promise<ReportExtra['infra']> {
  const groups = await Promise.all(LAYER_GROUPS.map(async (g) => {
    const ids = GROUP_LAYERS[g.key] ?? [];
    const parts = await Promise.all(ids.map(async (id) => {
      const d = LAYER_BY_ID[id];
      if (!d) return null;
      try {
        const t = await layerTotals(d, '1=1');
        return { unit: d.qty?.unit ?? '', ...t };
      } catch {
        // Нэг давхарга унасан ч бүлгийн бусад нь тоологдоно — тайлан хоосрохгүй
        return null;
      }
    }));
    const ok = parts.filter((p): p is NonNullable<typeof p> => !!p);
    return {
      key: g.key,
      title: g.title,
      layers: ids.length,
      n: ok.reduce((a, p) => a + p.n, 0),
      // ⚠️ Нэг бүлэгт «м» ба «м²» ХОЛИЛДОНО — нийлбэрлэвэл утгагүй тул тусад нь
      len: ok.filter((p) => p.unit === 'м').reduce((a, p) => a + (p.q ?? 0), 0),
      area: ok.filter((p) => p.unit === 'м²').reduce((a, p) => a + (p.q ?? 0), 0),
    };
  }));

  return {
    groups,
    totals: {
      layers: groups.reduce((a, g) => a + g.layers, 0),
      n: groups.reduce((a, g) => a + g.n, 0),
      len: groups.reduce((a, g) => a + g.len, 0),
      area: groups.reduce((a, g) => a + g.area, 0),
    },
  };
}

/* ═══════════════ 11 · ХАБЭА ═══════════════ */

export const loadHabeaSummary = cached(loadHabeaSummaryRaw, 5 * 60_000, ['HABEA']);

async function loadHabeaSummaryRaw(): Promise<ReportExtra['habea']> {
  const L = HABEA.labor.fields;
  const [labor, incident] = await Promise.all([
    /* Огноо + компани тус бүрийн тоон талбарууд — «*» бүх баганыг татдаг байв
       (2026-08-21 гүйцэтгэлийн аудит) */
    queryFeatures(HABEA.labor.url, {
      /*
       * ⚠️ `bagts` талбарыг ХАСНА. Сүүлийн 5 гүйцэтгэгчид маягтад багц
       *    заагдаагүй тул `Bagts_SC` мэт багана ОГТ БАЙХГҮЙ — түүнийг
       *    асуувал ArcGIS «Invalid query parameters» гэж БҮХ хүсэлтийг
       *    унагаж, ХАБЭА-гийн тайлан бүхэлдээ хоосон болдог байв.
       */
      outFields: [
        L.ognoo,
        ...HABEA.labor.companies.flatMap((c) => {
          const f = laborCompanyFields(c.sfx);
          return [f.mongol, f.gadaad, f.niitAjiltan, f.niitTehnik];
        }),
      ],
    }),
    queryFeatures(HABEA.incident.url, { outFields: [HABEA.incident.fields.ognoo] }),
  ]);

  /* Хамгийн сүүлийн бүртгэл — маягт нэг мөрөөр «өнөөдрийн байдал»-ыг илэрхийлнэ */
  const last = labor.slice().sort((a, b) => nn(b[L.ognoo]) - nn(a[L.ognoo]))[0];
  const day = last ? labor.filter((r) => nn(r[L.ognoo]) === nn(last[L.ognoo])) : [];
  const at = (f: string) => day.reduce((a, r) => a + nn(r[f]), 0);

  const byCompany = HABEA.labor.companies.map((c) => {
    const f = laborCompanyFields(c.sfx);
    return {
      label: c.label,
      bagts: c.bagts,
      workers: at(f.niitAjiltan),
      mongol: at(f.mongol),
      gadaad: at(f.gadaad),
      tehnik: at(f.niitTehnik),
    };
  }).filter((c) => c.workers > 0 || c.tehnik > 0)
    .sort((a, b) => b.workers - a.workers);

  const ts = last ? nn(last[L.ognoo]) : 0;
  return {
    date: ts ? new Date(ts).toISOString().slice(0, 10) : '',
    workers: byCompany.reduce((a, c) => a + c.workers, 0),
    mongol: byCompany.reduce((a, c) => a + c.mongol, 0),
    gadaad: byCompany.reduce((a, c) => a + c.gadaad, 0),
    tehnik: byCompany.reduce((a, c) => a + c.tehnik, 0),
    byCompany,
    incidents: incident.length,
  };
}

/* ═══════════════ Нэгтгэл ═══════════════ */

/**
 * Дөрвөн хэсгийг ЗЭРЭГ татна. Нэг нь унавал бүхэл тайлан унахгүй байх нь
 * чухал тул `allSettled` — амжилтгүй хэсэг нь хоосон утгаараа гарна.
 *
 * ⚠️ 5 мин кэш (`cached`, гүйцэтгэлийн аудит): «Тайлан» view mount бүрд
 * `loadInfra` дангаараа ~88 статистик хүсэлт (бүх бүлгийн давхаргад
 * `layerTotals`) дахин явуулдаг байсан — 6 слотын хязгаарлагч дээр хэдэн
 * секунд цувдаг. `cached` нь reject-ийг кэшлэхгүй тул «дахин оролдох» сэргэнэ;
 * `allSettled`-ийн хэсэгчилсэн уналт хоосон утгаараа хамгийн ихдээ TTL
 * хугацаанд үлдэх нь хүлээн зөвшөөрсөн тохироо.
 */
/*
 * ⚠️ `reads` (2026-08-29) — урьд нь автобусанд БҮРТГЭГДЭЭГҮЙ тул нийтлэх,
 * санхүүгийн засвар, хуваарь хадгалсны дараа дашбоард тэр дор нь шинэчлэгдэх
 * атлаа Тайлан (+PDF) 5 минут хуучин тоогоо барьж, хоёр дэлгэц зөрдөг байв.
 */
export const loadReportExtra = cached(loadReportExtraRaw, 5 * 60_000,
  ['BAGTS_SHEET', 'CASHFLOW2', 'IPC_LOG', 'PARCEL_LEFT', 'HABEA', 'BAGTS_NEGTGEL']);

async function loadReportExtraRaw(): Promise<ReportExtra> {
  /*
   * ⚠️ 2026-08-27: урьд нь `loadOverall()` ЭХЛЭЖ дуусах ёстой байв — газар
   * чөлөөлөлтийн хувийг түүний үе шатны хүснэгтээс уншдаг байсан. Тэр
   * хүснэгт багцуудын жагсаалт болсноор тэр мөр хэзээ ч олдохгүй болсон тул
   * `loadLand` нь одоо өөрөө боддог. Дараалал шаардлагагүй болсон — бүх
   * хэсэг ЗЭРЭГ ачаалагдана.
   */
  const [o, p, f, i, h, l, s] = await Promise.allSettled([
    loadOverall(), loadProgress(), loadFinance(), loadInfra(), loadHabeaSummary(),
    loadLand(), loadSocial(),
  ]);
  /**
   * ⚠️ УНАЛТЫГ ТЭГЭЭР НӨХӨХГҮЙ (2026-09-03-ны аудитын олдвор).
   *
   * Урьд нь унасан эх сурвалж бүр `{ pct: 0, paid: 0, blocks: 0, … }` болж,
   * алдаа нь ЗӨВХӨН `console.error`-т үлддэг байв. Үр дүнд «Бодитоор
   * олгосон 0 ₮», «нийт гүйцэтгэл 0.00%» гэсэн тоонууд АЛБАН ЁСНЫ PDF ба
   * мэйлд хэмжилт мэт хэвлэгдэнэ — `Tailan.tsx`-ийн `ready` шалгуур ч тэг
   * объектыг «бэлэн» гэж үзэж товчийг идэвхжүүлдэг байлаа. Энэ нь
   * төслийн хамгийн чанга дүрэм (`null ≠ 0`)-ийн хамгийн өндөр эрсдэлтэй
   * гаралт дээрх зөрчил байв.
   *
   * ⚠️ Хэсэгчилсэн тайлан ГАРГАХГҮЙ: аль хэсэг нь дутууг уншигч мэдэхгүй
   * тул «хагас үнэн» баримт нь худал баримттай ижил эрсдэлтэй. Унасан
   * эх сурвалжийг НЭРЛЭЖ шиднэ — `useAsync` түүнийг дэлгэцэд гаргаж,
   * «Дахин оролдох» товч ажиллана.
   */
  const parts: [string, PromiseSettledResult<unknown>][] = [
    [tr('нийт гүйцэтгэл'), o], [tr('гүйцэтгэл'), p], [tr('санхүү'), f],
    [tr('дэд бүтэц'), i], [tr('ХАБЭА'), h], [tr('газар'), l],
    [tr('нийгмийн барилга'), s],
  ];
  const down = parts.filter(([, r]) => r.status === 'rejected');
  if (down.length) {
    for (const [name, r] of down) {
      console.error(`[selbe] тайлан · ${name}:`, (r as PromiseRejectedResult).reason);
    }
    throw new Error(
      tr('Тайлангийн {0} эх сурвалж татагдсангүй: {1}. Дутуу тоогоор тайлан гаргахгүй — сүлжээгээ шалгаад дахин оролдоно уу.',
        down.length, down.map(([n]) => n).join(', ')),
    );
  }

  /* ⚠️ Энэ цэгт БҮГД амжилттай — доорх хандалтууд аюулгүй. */
  return {
    overall: (o as PromiseFulfilledResult<Awaited<ReturnType<typeof loadOverall>>>).value,
    land: (l as PromiseFulfilledResult<Awaited<ReturnType<typeof loadLand>>>).value,
    social: (s as PromiseFulfilledResult<Awaited<ReturnType<typeof loadSocial>>>).value,
    progress: (p as PromiseFulfilledResult<Awaited<ReturnType<typeof loadProgress>>>).value,
    finance: (f as PromiseFulfilledResult<Awaited<ReturnType<typeof loadFinance>>>).value,
    infra: (i as PromiseFulfilledResult<Awaited<ReturnType<typeof loadInfra>>>).value,
    habea: (h as PromiseFulfilledResult<Awaited<ReturnType<typeof loadHabeaSummary>>>).value,
  };
}

export function useReportExtra(): Async<ReportExtra> {
  return useAsync(loadReportExtra, []);
}

/* ═══════════════ Шинжилгээ — товч танилцуулга ба дүгнэлт ═══════════════ */

export type Findings = {
  buildWeight: number; buildActual: number; buildLag: number | null;
  landLeft: number; topReason: { label: string; n: number } | null;
  contractRate: number | null; paidRate: number | null;
  peakMonth: { label: string; amount: number } | null;
  bestBagts: { bagts: string; pct: number } | null;
  worstBagts: { bagts: string; pct: number } | null;
  mongolShare: number | null;
  /** Хамгийн их жинтэй үе шат — 3-р хэсгийн тайлбарт */
  heavyStage: { label: string; weight: number; actual: number } | null;
  /** Эхэлсэн ба эхлээгүй ажлын үе шатны нэрс — 6-р хэсгийн тайлбарт */
  startedPhases: string[];
  notStartedPhases: string[];
  /** Хамгийн том санхүүжилтийн эх үүсвэр — 7-р хэсгийн тайлбарт */
  topSource: { label: string; share: number } | null;
  /** Дэлгэц ба PDF-д ижилхэн гарах дүгнэлтийн өгүүлбэрүүд */
  findings: string[];
};

/**
 * Тайлангийн ТАЙЛБАР ТЕКСТИЙГ амьд тооноос үүсгэнэ.
 *
 * ⚠️ Эдгээр өгүүлбэрийг гараар бичиж БОЛОХГҮЙ. Өгөгдөл сар бүр өөрчлөгддөг
 * тул хатуу бичсэн дүгнэлт хэдхэн долоо хоногт худал болно. Энд зөвхөн
 * ЛОГИК бичигдэж, тоо нь тайлан үүсэх агшинд орно.
 *
 * ⚠️ Дэлгэц (`Tailan.tsx`) ба PDF (`reportPdf.ts`) ХОЁУЛАА үүнийг дуудна —
 * тиймээс дүгнэлт хоёр баримтад ЯГ ижил гарна.
 */
export function buildFindings(x: ReportExtra): Findings {
  /*
   * БАРИЛГА УГСРАЛТ.
   *
   * ⚠️ 2026-08-27: урьд нь `stages.find(s => s.label === 'Барилга угсралт')`
   * гэж хайдаг байв. `stages` нь БАГЦУУДЫН жагсаалт болсноор тийм нэртэй мөр
   * хэзээ ч олдохгүй бөгөөд гурвуулаа 0/null болж, тайлангийн эхний өгүүлбэр
   * «0.00%-ийн гүйцэтгэлтэй» гэж ЧИМЭЭГҮЙ худал бичдэг байлаа.
   *
   * Одоо: гүйцэтгэл нь блокуудын дундаж (6-р хэсэгтэй нэг тоо), жин нь
   * тэдгээр багцын эзлэх төсвийн хувь (3-р хэсгийн жингийн нийлбэр).
   */
  const buildWeight = x.overall.weightSum;
  const buildActual = x.progress.overall;
  /*
   * ⚠️ ТӨЛӨВЛӨГӨӨ ОДООГООР БАЙХГҮЙ. `Төсөл_Гүйцэтгэл_` хасагдсанаас хойш
   * төлөвлөгөөт хувь нь зөвхөн бөглөх хуудасны мөр бүрд байгаа бөгөөд
   * багцын түвшинд нэгтгэгдээгүй. Тэг гэж БОДОХГҮЙ — «хоцроогүй» гэсэн
   * худал дүгнэлт төрүүлнэ; `null` нь дуудагч талд «—» болж гарна.
   */
  const buildLag = null as number | null;

  const byBagts = x.progress.byBagts;
  const bestBagts = byBagts[0] ?? null;
  const worstBagts = byBagts.length ? byBagts[byBagts.length - 1] : null;
  const stalled = x.progress.stalled;

  const landLeft = x.land.byStatus
    .filter((s) => isLeftParcel(s.label))
    .reduce((a, s) => a + s.n, 0);
  const topReason = x.land.byReason[0] ?? null;

  const contractRate = x.finance.orderTotal
    ? (x.finance.contractAmount / x.finance.orderTotal) * 100 : null;
  const paidRate = x.finance.contractAmount
    ? (x.finance.paid / x.finance.contractAmount) * 100 : null;

  // ⚠️ `months` нь санхүүжилтийн ХУВААРЬ (төлөвлөгөө) — ирээдүйн сарууд ч бий.
  //    Тиймээс эдгээрээс гарах дүгнэлтийг «олгосон» гэж бичихийг ХОРИГЛОНО.
  const months = x.finance.months;
  const peakMonth = months.length
    ? months.reduce((a, m) => (m.amount > a.amount ? m : a))
    : null;
  // Хуваарийн сүүлийн улирлыг өмнөхтэй нь жишиж төлөвлөлтийн эрчмийг хэмжинэ
  const last3 = months.slice(-3).reduce((a, m) => a + m.amount, 0);
  const prev3 = months.slice(-6, -3).reduce((a, m) => a + m.amount, 0);

  const mongolShare = x.habea.workers ? (x.habea.mongol / x.habea.workers) * 100 : null;

  /*
   * ⚠️ Тайлангийн ТАЙЛБАР ӨГҮҮЛБЭРТ «бэлтгэлийн ажил дууссан», «инженерийн
   * систем эхлээгүй» гэх мэт ДҮГНЭЛТИЙГ ХАТУУ бичиж болохгүй: өгөгдөл
   * өөрчлөгдөхөд худал болно. Тиймээс тухайн өгүүлбэрт орох нэр, хувийг
   * эндээс амьдаар гаргаж өгнө.
   */
  const heavyStage = x.overall.stages.length
    ? x.overall.stages.reduce((a, s) => (s.weight > a.weight ? s : a))
    : null;
  const startedPhases = x.progress.phases.filter((p) => p.pct > 0).map((p) => p.name);
  const notStartedPhases = x.progress.phases.filter((p) => p.pct <= 0).map((p) => p.name);
  const srcTotal = x.finance.sources.reduce((a, s) => a + s.value, 0);
  const topSrc = x.finance.sources.length
    ? x.finance.sources.reduce((a, s) => (s.value > a.value ? s : a))
    : null;
  const topSource = topSrc && srcTotal
    ? { label: topSrc.label, share: (topSrc.value / srcTotal) * 100 }
    : null;

  const f: string[] = [];

  /*
   * ⚠️ Урьд нь энэ дүгнэлт «төлөвлөгөөнөөс хоцорч байна» гэдэг байсныг
   * болив: төлөвлөгөөт хувь нь багцын түвшинд ОДООГООР байхгүй (`buildLag`
   * тайлбарыг үз) тул нөхцөл нь хэзээ ч биелдэггүй үхсэн салаа байлаа.
   * Одоо БАЙГАА хоёр тоо дээр тогтоно: гүйцэтгэл ба түүний төсвийн хамрал.
   */
  if (x.progress.blocks > 0) {
    f.push(tr('Барилга угсралтын ажлын гүйцэтгэл {0} байна (хяналтын {1} блокийн дундаж). Эдгээр багц төслийн төсвийн {2}-ийг эзэлдэг тул нийт гүйцэтгэлд шууд нөлөөлнө.', pct(buildActual, 2), num(x.progress.blocks), pct(buildWeight, 1)));
  }

  if (bestBagts && worstBagts && bestBagts.bagts !== worstBagts.bagts) {
    f.push(tr('Багц хоорондын гүйцэтгэлийн зөрүү {0} нэгж хувь байна: {1} — {2}, {3} — {4}. Хоцорсон багцад нөөц дахин хуваарилах асуудлыг авч үзэх шаардлагатай.', num(bestBagts.pct - worstBagts.pct, 1), tr(bestBagts.bagts), pct(bestBagts.pct, 2), tr(worstBagts.bagts), pct(worstBagts.pct, 2)));
  }

  if (stalled > 0) {
    f.push(tr('{0} блокийн гүйцэтгэл 1 хувиас доогуур буюу ажил бодитоор эхлээгүй байна.', num(stalled)));
  }

  if (landLeft > 0) {
    f.push(tr('Газар чөлөөлөлтөд {0} нэгж талбар шийдвэрлэгдээгүй үлдсэн{1}. Эдгээр нь холбогдох блокийн ажлыг саатуулах эрсдэлтэй тул шуурхай шийдвэрлэх шаардлагатай.', num(landLeft), topReason ? tr('; тэргүүлэх шалтгаан нь «{0}» ({1} нэгж талбар)', tr(topReason.label), num(topReason.n)) : ''));
  }

  if (contractRate != null && paidRate != null) {
    f.push(tr('Захирамжаар батлагдсан дүнгийн {0} нь гэрээгээр баталгаажсан бөгөөд гэрээний дүнгийн {1} нь бодитоор олгогдсон байна. Олгогдоогүй үлдэгдэл {2} ₮ байна.', pct(contractRate, 1), pct(paidRate, 1), num(x.finance.contractAmount - x.finance.paid)));
  }

  if (prev3 > 0 && last3 > 0) {
    const k = last3 / prev3;
    f.push(tr('Хуваарийн сүүлийн гурван сард {0} ₮ олгохоор төлөвлөгдсөн нь өмнөх гурван сарын {1} ₮-өөс {2} дахин {3} буюу төлөвлөгөөт санхүүжилтийн эрчим {4} байна.', num(last3), num(prev3), num(k, 1), k >= 1 ? tr('их') : tr('бага'), k >= 1 ? tr('нэмэгдсэн') : tr('буурсан')));
  }

  if (x.habea.incidents > 0) {
    f.push(tr('Бүртгэлийн хугацаанд {0} осол, зөрчил бүртгэгдсэн байна. Хөдөлмөрийн аюулгүй байдлын хяналтыг эрчимжүүлэх шаардлагатай.', num(x.habea.incidents)));
  }

  return {
    buildWeight, buildActual, buildLag,
    landLeft, topReason,
    contractRate, paidRate, peakMonth,
    bestBagts, worstBagts, mongolShare,
    heavyStage, startedPhases, notStartedPhases, topSource,
    findings: f,
  };
}
