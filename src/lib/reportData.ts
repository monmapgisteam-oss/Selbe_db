/**
 * ТАЙЛАНГИЙН ӨРГӨТГӨСӨН ӨГӨГДӨЛ — 8–11-р хэсгийн БҮХ тоо ЭНД нэгтгэгдэнэ.
 *
 * ⚠️ Дэлгэц (`Tailan.tsx`) ба PDF (`reportPdf.ts`) ХОЁУЛАА ЯГ ЭНЭ объектыг
 * хэрэглэнэ. Хоёр газар тус тусад нь тооцвол PDF нь дэлгэцээс зөрч, аль нь зөв
 * болох нь мэдэгдэхгүй болно — тиймээс тооцоолол энд ГАНЦ УДАА хийгдэнэ.
 *
 * ⚠️ САНХҮҮ: `CASHFLOW` (BUS_cashflow) хүснэгтийн мөнгөн БҮХ багана өнөөдөр
 * ХООСОН (7 мөр, дүн бүр 0). Тиймээс санхүүг `CASHFLOW2`
 * (`Cashflow/FeatureServer/106`, 76 мөр)-оос авна — «Цогцолбор» дашбоардын
 * толгойн тоо ч мөн эндээс гардаг.
 *
 * ⚠️ CASHFLOW2 нь гэрээ бүрийн САНХҮҮЖИЛТИЙН ХУВААРЬ буюу ТӨЛӨВЛӨГӨӨ —
 * «бодитоор олгосон» дүнг эндээс ХЭЗЭЭ Ч гаргаж болохгүй (ирээдүйн сарууд ч
 * орсон байдаг). Бодит олголт нь IPC актын лог (`IPC_LOG` /107)-оос гарна —
 * Finance/ExecKpi/Tsogts бүгд тэндээс уншдаг, тайлан ч мөн адил.
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
import { cached } from '@/lib/live';
import { layerTotals } from '@/lib/totals';
import {
  BUILDING, CASHFLOW2, HABEA, IPC_LOG, LAYER_GROUPS, GROUP_LAYERS, LAYER_BY_ID,
  PROJECT_PROGRESS, bagtsKey, pkgKeyOf, laborCompanyFields,
} from '@/lib/services';

/* ═══════════════ Төрөл ═══════════════ */

export type BlockRow = { block: string; bagts: string; pct: number };

export type ReportExtra = {
  /** Төслийн НИЙТ гүйцэтгэл ба хэрэгжилтийн үе шат — `Төсөл_Гүйцэтгэл` хүснэгт */
  overall: {
    /** Жингээр нормчилсон нийт гүйцэтгэл, % */
    pct: number;
    /** Жингийн нийлбэр, % — 100 биш болохыг тайлбарт хэлнэ */
    weightSum: number;
    rows: number;
    stages: {
      label: string; rows: number; weight: number;
      actual: number; planned: number | null;
    }[];
  };
  /** Газар чөлөөлөлт — `land:left` давхарга ба үе шатны гүйцэтгэл */
  land: {
    parcels: number;
    areaM2: number;
    /** Үе шатны хүснэгтээс гарах албан ёсны гүйцэтгэл, % */
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
    /** Бодитоор олгосон санхүүжилт — IPC актын net (IPC40) нийлбэр, ₮ */
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

/* ═══════════════ Төслийн нийт гүйцэтгэл ба үе шат ═══════════════ */

/**
 * ⚠️ `Төсөлд_эзлэх_хувь` жингийн нийлбэр 100 БИШ, 81.53% — эх хүснэгтэд
 * бүх ажил бүртгэгдээгүй. Тиймээс нийт гүйцэтгэлийг жингийн НИЙЛБЭРЭЭР
 * нормчилно (22.54 / 81.53 → 27.65%), эс бөгөөс дүн хиймлээр буурна.
 */
async function loadOverall(): Promise<ReportExtra['overall']> {
  const P = PROJECT_PROGRESS.fields;
  /* Зөвхөн 4 хэрэглэдэг талбар — «*» нь 162 мөрийн бүх баганыг татдаг байв
     (2026-08-21 гүйцэтгэлийн аудит) */
  const rows = await queryFeatures(PROJECT_PROGRESS.url, {
    outFields: [P.stage, P.weight, P.actual, P.planned],
  });

  const w = (r: Record<string, unknown>) => nn(r[P.weight]);
  const done = (rs: typeof rows) => rs.reduce((a, r) => a + w(r) * nn(r[P.actual]) / 100, 0);
  const wSum = (rs: typeof rows) => rs.reduce((a, r) => a + w(r), 0);

  const total = wSum(rows);

  const stages = PROJECT_PROGRESS.stages.map((s) => {
    const g = rows.filter((r) => str(r[P.stage]) === s.value);
    const gw = wSum(g);
    // ⚠️ `Төлөвлөгөөт_хувь` нь 162-оос 74 мөрд ХООСОН — бөглөсөн мөрөөр л жишинэ
    const pl = g.filter((r) => r[P.planned] != null && str(r[P.planned]) !== '');
    const plW = wSum(pl);
    return {
      label: s.label,
      rows: g.length,
      weight: gw,
      actual: gw ? (done(g) / gw) * 100 : 0,
      planned: pl.length && plW
        ? (pl.reduce((a, r) => a + w(r) * nn(r[P.planned]) / 100, 0) / plW) * 100
        : null,
    };
  });

  return {
    pct: total ? (done(rows) / total) * 100 : 0,
    weightSum: total,
    rows: rows.length,
    stages,
  };
}

/* ═══════════════ Газар чөлөөлөлт ═══════════════ */

async function loadLand(pct: number | null): Promise<ReportExtra['land']> {
  // ⚠️ `url` нь заавал биш (BuildingSceneLayer г.м. давхаргад байхгүй) — шалгана
  const d = LAYER_BY_ID['land:left'];
  if (!d?.url) return { parcels: 0, areaM2: 0, pct, byStatus: [], byReason: [] };
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

  return {
    parcels: rows.length,
    areaM2: rows.reduce((a, r) => a + nn(r[d.qty?.field ?? 'area_m2']), 0),
    pct,
    byStatus: tally('Tuluv', false),
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

async function loadProgress(): Promise<ReportExtra['progress']> {
  const { loadBlockProgress } = await import('@/lib/blockProgress');
  const [map, blocks] = await Promise.all([
    loadBlockProgress(),
    // ⚠️ Багцын УНШИГДАХ нэр («Багц 3.2») зөвхөн энэ давхаргад бий: гүйцэтгэлийн
    // түлхүүр нь `bagtsKey`-ээр цэгээ алдсан («БАГЦ32») тул буцааж сэргээх аргагүй.
    queryFeatures(BUILDING.url, { outFields: [BUILDING.fields.bagts] }),
  ]);

  const labelOf = new Map<string, string>();
  blocks.forEach((b) => {
    const name = str(b[BUILDING.fields.bagts]);
    if (name) labelOf.set(bagtsKey(name), name);
  });
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
    phases: [...phaseMap.values()]
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

/**
 * Жинхэнэ акт мөн үү — "Contract Price" псевдо-мөр, хоосон мөрийг хасна.
 * ⚠️ `Finance.tsx`-ийн `isRealAct`-тай ЯГ ИЖИЛ дүрэм (тэнд export-гүй тул энд
 * давхарлав) — өөрчлөх бол ХОЁУЛАНГ нь хамт засна, эс бөгөөс тайлангийн
 * «олгосон» дүн бусад дэлгэцээс зөрнө.
 */
const isRealAct = (no: unknown) => /^(IPC|APC|АРС)[-\s]?\d+/i.test(String(no ?? '').trim());

async function loadFinance(): Promise<ReportExtra['finance']> {
  const F = CASHFLOW2.fields;
  const I = IPC_LOG.fields;
  const [rows, ipc] = await Promise.all([
    queryFeatures(CASHFLOW2.url, { outFields: ['*'] }),
    // Бодит олголтод хэрэглэх 3 талбар л хангалттай — «*» бүх баганыг татна
    queryFeatures(IPC_LOG.url, { outFields: [I.no, I.net, I.pkg] }),
  ]);
  const sum = (f: string) => rows.reduce((a, r) => a + nn(r[f]), 0);

  let cum = 0;
  const months = CASHFLOW2.months.map((m) => {
    const amount = sum(m.amount);
    cum += amount;
    return { label: m.label, amount, cum };
  });

  /*
   * «Бодитоор олгосон» — IPC актын логоос, `Finance.tsx`-ийн `loadFinDataRaw`-ын
   * given-тэй ИЖИЛ шүүлтээр (жинхэнэ акт + net ≠ 0 + багцтай мөр): тэгвэл
   * ExecKpi/Tsogts-ийн «Олгосон (IPC)» нийлбэртэй яг тэнцэнэ.
   * ⚠️ Урьд нь CASHFLOW2-ийн сарын ТӨЛӨВЛӨГӨӨГ хуримтлуулж `paid` болгодог
   * байсан нь бодит олголтоос олон дахин их (ирээдүйн саруудыг ч багтаасан)
   * худал тоо байв.
   */
  const paid = ipc.reduce((a, r) => {
    if (!isRealAct(r[I.no])) return a;
    const net = nn(r[I.net]);
    if (net === 0) return a;
    const k = bagtsKey(r[I.pkg]);
    if (!k || k === '0') return a;
    return a + net;
  }, 0);

  /* Төрлөөр — маягтын хоосон утга («0») хасагдана */
  const typeMap = new Map<string, { n: number; budget: number; contract: number }>();
  rows.forEach((r) => {
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
   */
  const byBagts: Record<string, number> = {};
  rows.forEach((r) => {
    const k = pkgKeyOf(r[F.pkg2]) || pkgKeyOf(r[F.pkg]);
    if (!k || k === '0') return;
    byBagts[k] = (byBagts[k] ?? 0) + nn(r[F.budget]);
  });

  return {
    rows: rows.length,
    budget: sum(F.budget),
    orderTotal: sum(F.orderTotal),
    contractAmount: sum(F.contractAmount),
    sources: CASHFLOW2.sources.map((s) => ({ label: s.label, value: sum(s.field) })),
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

async function loadHabeaSummary(): Promise<ReportExtra['habea']> {
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
export const loadReportExtra = cached(loadReportExtraRaw, 5 * 60_000);

async function loadReportExtraRaw(): Promise<ReportExtra> {
  /*
   * ⚠️ Газар чөлөөлөлтийн албан ёсны хувь нь ҮЕ ШАТНЫ хүснэгтээс гардаг тул
   * `loadOverall()` эхэлж дуусах ёстой — бусад нь түүнээс хамаарахгүй.
   */
  const o = await loadOverall().catch((e) => {
    console.error('[selbe] тайлан · нийт гүйцэтгэл:', e);
    return null;
  });
  const landPct = o?.stages.find((s) => s.label === 'Газар чөлөөлөлт')?.actual ?? null;

  const [p, f, i, h, l, s] = await Promise.allSettled([
    loadProgress(), loadFinance(), loadInfra(), loadHabeaSummary(),
    loadLand(landPct), loadSocial(),
  ]);
  const fail = (name: string, r: PromiseSettledResult<unknown>) => {
    if (r.status === 'rejected') console.error(`[selbe] тайлан · ${name}:`, r.reason);
  };
  fail(tr('гүйцэтгэл'), p); fail(tr('санхүү'), f); fail(tr('дэд бүтэц'), i); fail(tr('ХАБЭА'), h);
  fail(tr('газар'), l); fail(tr('нийгмийн барилга'), s);

  return {
    overall: o ?? { pct: 0, weightSum: 0, rows: 0, stages: [] },
    land: l.status === 'fulfilled' ? l.value
      : { parcels: 0, areaM2: 0, pct: landPct, byStatus: [], byReason: [] },
    social: s.status === 'fulfilled' ? s.value : { rows: [], n: 0, areaM2: 0 },
    progress: p.status === 'fulfilled' ? p.value
      : { blocks: 0, overall: 0, date: '', phases: [], byBagts: [], slowest: [], stalled: 0 },
    finance: f.status === 'fulfilled' ? f.value
      : { rows: 0, budget: 0, orderTotal: 0, contractAmount: 0, sources: [], months: [], paid: 0, byType: [], byBagts: {} },
    infra: i.status === 'fulfilled' ? i.value
      : { groups: [], totals: { layers: 0, n: 0, len: 0, area: 0 } },
    habea: h.status === 'fulfilled' ? h.value
      : { date: '', workers: 0, mongol: 0, gadaad: 0, tehnik: 0, byCompany: [], incidents: 0 },
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
  const build = x.overall.stages.find((s) => s.label === 'Барилга угсралт');
  const buildWeight = build?.weight ?? 0;
  const buildActual = build?.actual ?? 0;
  const buildLag = build?.planned != null ? build.planned - build.actual : null;

  const byBagts = x.progress.byBagts;
  const bestBagts = byBagts[0] ?? null;
  const worstBagts = byBagts.length ? byBagts[byBagts.length - 1] : null;
  const stalled = x.progress.stalled;

  const landLeft = x.land.byStatus
    .filter((s) => /үлдсэн/i.test(s.label))
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

  if (build && buildLag != null && buildLag > 0) {
    f.push(tr('Барилга угсралтын ажил төлөвлөгөөнөөс {0} нэгж хувиар хоцорч байна (гүйцэтгэл {1}, төлөвлөгөө {2}). Энэ үе шат төслийн жингийн {3}-ийг эзэлдэг тул нийт гүйцэтгэлд шууд нөлөөлж байна.', num(buildLag, 1), pct(buildActual, 2), pct(build.planned, 1), pct(buildWeight, 1)));
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
    f.push(tr('Захирамжаар батлагдсан дүнгийн {0} нь гэрээгээр баталгаажсан бөгөөд гэрээний дүнгийн {1} нь бодитоор олгогдсон байна. Олгогдоогүй үлдэгдэл {2} тэрбум ₮ байна.', pct(contractRate, 1), pct(paidRate, 1), num((x.finance.contractAmount - x.finance.paid) / 1e9, 1)));
  }

  if (prev3 > 0 && last3 > 0) {
    const k = last3 / prev3;
    f.push(tr('Хуваарийн сүүлийн гурван сард {0} тэрбум ₮ олгохоор төлөвлөгдсөн нь өмнөх гурван сарын {1} тэрбумаас {2} дахин {3} буюу төлөвлөгөөт санхүүжилтийн эрчим {4} байна.', num(last3 / 1e9, 1), num(prev3 / 1e9, 1), num(k, 1), k >= 1 ? tr('их') : tr('бага'), k >= 1 ? tr('нэмэгдсэн') : tr('буурсан')));
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
