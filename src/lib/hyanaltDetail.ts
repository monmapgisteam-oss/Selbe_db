'use client';

/**
 * НИЙТЭЛСЭН ГҮЙЦЭТГЭЛИЙГ ХЯНАГЧИД ХАРУУЛАХ.
 */

import { PKGS, fillSchema } from '@/modules/sheet/bagts.pkg';
import { arcgisPost } from '@/lib/query';
import { TREES } from '@/modules/sheet/bagts.trees';
import { baseBlankCount, computeAll, firstFrame, lastFrame, loadRows, msToDay, nullFragmentFits } from '@/modules/sheet/bagtsSheet';
import { describeNegCells, laterAsOf, needsFrameOcc, negTotalAt, overlaySubmission, withFrameOcc } from '@/modules/sheet/sheetFrame';
import { readSubmissionByOid, type SubmissionPayload } from '@/lib/submission';
import { t as tr } from '@/lib/i18nCore';
import { rowSids } from '@/lib/hyanaltOkCells';
import { bagtsKey } from '@/lib/services';

/** Нэг мөр — «Гүйцэтгэл бөглөх» хуудасны багануудтай ижил бүрэлдэхүүн */
export type Filled = {
  no: string;
  work: string;
  /** Хувийн жин — дээд мөрд эзлэх (excel C) */
  wC: number | null;
  /** Хувийн жин — үе шатанд эзлэх (excel D) */
  wD: number | null;
  /** Одоо байгаа хувийн жин (excel E) */
  wE: number | null;
  /** Мөрийн ЭХ обьём (эх хүснэгтээс) */
  vol: number | null;
  /** Блокуудад бөглөсөн обьёмын нийлбэр */
  sum: number | null;
  unit: number | null;
  money: number | null;
  plan: number | null;
  act: number | null;
  ratio: number | null;
  /** Блок бүрийн бөглөсөн обьём — `blocks` шошготой ижил дараалалтай */
  cells: (number | null)[];
  /** Блок бүрийн ГҮЙЦЭТГЭЛИЙН ХУВЬ — бөглөх хуудасны нүдтэй ижил хоёр дахь мөр */
  acts: (number | null)[];
  /**
   * Тухайн нүд ӨМНӨХ АГШНААС ӨӨРЧЛӨГДСӨН эсэх.
   */
  changed: boolean[];
  /** Өмнөх агшны утга — өөрчлөлтийг «юунаас юу болсон» гэж харуулахад. */
  before: (number | null)[];
  /** Модны гүн (0–4). Бүлгийн мөр эсэхийг `group`-оос. */
  depth: number;
  /** Бүлгийн мөр үү — дэд мөрүүдээсээ бодогддог, бөглөгддөггүй. */
  group: boolean;
};

/** Нэг ӨӨРЧЛӨГДСӨН нүд — жагсаалтаас дарж хүснэгт рүү үсрэхэд. */
export type Change = {
  /** `rows` доторх мөрийн индекс */
  row: number;
  /** Блокийн индекс (`blocks`-той ижил дараалалтай); обьёмгүй блок бол `-1` (2026-09-24) */
  col: number;
  no: string;
  work: string;
  block: string;
  from: number | null;
  to: number | null;
  /**
   * ХУВИЙН өөрчлөлт (0–1 бутархай) — Обьёмгүй мөрд «%NN» засвар `obyem`-ийг
   * хөндөхгүй зөвхөн `act`-д суудаг (2026-09-24, FillNew `changedKeys`-тэй
   * ижил дүрэм). `from === to` бол харуулах тал ЭДГЭЭРИЙГ үзүүлнэ.
   */
  fromPct?: number | null;
  toPct?: number | null;
  /**
   * ЭНЭ УДААГИЙН НЭМЭЛТ (2026-09-25, нэмэлтийн горим — `SubmissionPayload.mode`):
   * обьём бол `to − (from ?? 0)`, хувь бол `toPct − (fromPct ?? 0)`. Хянагч
   * «40 → 55» гэсэн нийттэй ХАМТ «+15»-ыг харна. Шинэ нийт нь `null` бол `null`.
   */
  inc?: number | null;
  incPct?: number | null;
  /**
   * МӨРИЙН ТОГТВОРТОЙ ТАНИГЧ — `"<oid>|<sid>"` (`hyanaltOkCells.rowSids`).
   */
  rid?: string;
  neg?: true;
};

/** `to − (from ?? 0)`; шинэ утга `null` бол `null` (`null ≠ 0` — «мэдээлэлгүй»). */
const deltaOf = (from: number | null | undefined, to: number | null | undefined): number | null =>
  to == null ? null : to - (from ?? 0);

/**
 * ХУВААРИЙН ОГНООНЫ ЗАСВАР — хянагчид ХАРАГДАХ ёстой өөрчлөлт.
 */
export type DateChange = {
  no: string;
  work: string;
  block: string;
  /** `s` = эхлэх, `e` = дуусах */
  se: 's' | 'e';
  /** `YYYY-MM-DD` эсвэл `null` (хоосон) */
  from: string | null;
  to: string | null;
};

export type Submission = {
  /** Аль үйлчилгээнээс — «Багц 1 · 9 давхар» */
  pkgLabel: string;
  /** `PKGS`-ийн түлхүүр — бөглөх хуудсыг ЯГ ТЭР багцаар нээхэд. */
  pkgKey: string;
  /**
   * Аль АГШИН (`YYYY-MM-DD`) — хянагчид бөглөх хуудсыг ЭНЭ өдрөөр нээнэ.
   */
  day: string;
  /** Блокийн шошго — «5/1», «5/2» г.м. */
  blocks: string[];
  /** Өмнөх агшинтай жишсэн эсэх (анхны нийтлэлд `false`) */
  compared: boolean;
  /**
   * Өмнөх агшны асуулга АЛДААТАЙ дууссан — жишилт «тодорхойгүй».
   */
  prevError: boolean;
  /** Архивт нэмэгдсэн нийт мөр */
  rows: number;
  /**
   * Агшны БҮХ мөр — хуудасны дараалалаар (бүлэг + ажил).
   */
  filled: Filled[];
  /** Обьём бөглөгдсөн ажлын тоо */
  filledCount: number;
  /** Өөрчлөгдсөн нүднүүд — дарж хүснэгт рүү үсрэх жагсаалт */
  changes: Change[];
  /**
   * ХУВААРИЙН ОГНООНЫ ЗАСВАР (дээрх `DateChange`).
   */
  dateChanges: DateChange[];
  /**
   * «ШИНЭЧЛЭГДСЭН ОГНОО»-г илгээлт өөрчилсөн үү.
   */
  asOfChanged: boolean;
  asOfFrom?: string | null;
  asOfTo?: string | null;
  /**
   * Илгээлтийн СҮҮЛИЙН агшин (ms) — хяналтын мөрийн «Компани илгээсэн»
   * огноотой жишихэд.
   */
  subAt?: number;
  /**
   * ИЛГЭЭЛТИЙН мөрийн OBJECTID — хараахан архивлагдаагүй (staged) харагдац.
   */
  subOid?: number;
  remapped?: boolean;
  unmoved?: number;
  negative?: number;
  negCells?: string[];
};

/**
 * Огноог SQL-д бичих.
 */
const ts = (ms: number) => `timestamp '${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}'`;

const post = (url: string, body: Record<string, string>) => arcgisPost(`${url}/query`, body);

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * ХЯНАГЧИД ХАРУУЛАХ АГУУЛГА — гурван зам (дизайн D).
 *
 * 1. `sheetOid` нь ИЛГЭЭЛТИЙН мөр бөгөөд хараахан батлагдаагүй (`sub|…`)
 *    → `loadStaged`: архивын сүүлийн жааз + илгээлтийн overlay.
 * 2. Илгээлт батлагдсан (`done|…`) → архивт жааз үүссэн тул `payload.archiveOid`-оор
 *    ХУУЧИН зам.
 * 3. Илгээлт огт олдохгүй (энэ өөрчлөлтөөс өмнөх мөрүүд) → `sheetOid` нь өөрөө
 *    архивын OBJECTID — ХУУЧИН зам.
 *
 * @param bagts    хяналтын бүртгэл дэх «Багц» (жиш. «Багц 1»)
 * @param sheetOid `Эх_мөрийн_дугаар` — илгээлтийн (эсвэл хуучин мөрд архивын) OBJECTID
 */
export async function loadSubmission(bagts: string, sheetOid: number): Promise<Submission | null> {
  const read = await readSubmissionByOid(sheetOid);
  if (!read.ok) throw new Error(read.error);
  const staged = read.sub;
  if (staged && !staged.done && staged.payload.archiveOid == null)
    return loadStaged(bagts, sheetOid, staged.payload);
  const oid = staged ? staged.payload.archiveOid : sheetOid;
  if (oid == null) return null;
  return loadArchived(bagts, oid, staged ? staged.payload.pkgKey : null);
}

/**
 * ХАРААХАН АРХИВЛАГДААГҮЙ ИЛГЭЭЛТИЙГ хянагчид харуулна.
 *
 * Архивын СҮҮЛИЙН жааз дээр илгээлтийн diff-ийг давхарлаж (`overlaySubmission`),
 * бөглөх хуудсынхтай ЯГ ижил мөрүүдийг угсарна — `FillNew` нь `view.subOid`
 * үед ЯГ ижил зүйлийг хийдэг тул мөрийн индекс хоёр талд тэнцэнэ (өөрчлөлтийн
 * жагсаалтаас дарж үсрэх нь тэр индекс дээр тулгуурладаг).
 */
async function loadStaged(
  bagts: string,
  subOid: number,
  pl0: SubmissionPayload,
): Promise<Submission | null> {
  let pl = pl0;
  const pkg = PKGS.find((p) => p.key === pl.pkgKey);
  if (!pkg) throw new Error(tr('Илгээлтийн багц олдсонгүй: {0}', pl.pkgKey));
  if (bagtsKey(pkg.group) !== bagtsKey(bagts))
    throw new Error(tr('Илгээлт «{0}» багцынх — хяналтын бүртгэл «{1}»', pkg.group, bagts));

  const sc = await fillSchema(pkg);
  const nBld = sc.bld.length;
  const hasObyem = sc.obyem.map((f) => !!f);
  const loaded = await loadRows(pkg, sc);
  if (pl.base != null && needsFrameOcc(pl, loaded.rows)) {
    try { pl = withFrameOcc(pl, (await loadRows(pkg, sc, msToDay(pl.base))).rows); } catch { /* хэвээр — доорх `unmoved` */ }
  }
  const ov = overlaySubmission(loaded.rows, pl, sc, nBld);
  const asOf = laterAsOf(ov.asOf, loaded.asOf);
  const sids = rowSids(ov.rows);
  /* ── САРЫН ЗАДАРГАА — бөглөх/архивлахтай ИЖИЛ томъёо ────────────────
   */
  const { loadPkgPlan, planPctFromMonths } = await import('@/lib/huvaariObyem');
  let obPlan: Awaited<ReturnType<typeof loadPkgPlan>>['plan'] | null = null;
  try {
    obPlan = (await loadPkgPlan(pkg.key)).plan;
  } catch {
    obPlan = null;
  }
  const c = computeAll(ov.rows, nBld, asOf, {}, {}, hasObyem, (row, b) => {
    if (!obPlan || row.des == null || asOf == null) return null;
    const blok = sc.bld[b];
    const m = blok ? obPlan.get(row.des)?.get(blok) : undefined;
    return m ? planPctFromMonths(m, asOf, { start: row.start[b] ?? null, end: row.end[b] ?? null }) : null;
  }, "abs", sc.synthetic);

  /* Обьёмтой блокуудын дараалал — `blocks`/`cells`/`acts` бүгд ҮҮГЭЭР индекслэгдэнэ. */
  const blocks = sc.bld.filter((_, i) => sc.obyem[i]);
  /** Блокийн ЖИНХЭНЭ индекс (`b`) → `blocks` доторх багана; обьёмгүй бол `-1`. */
  const colOf: number[] = [];
  {
    let k = 0;
    for (let b = 0; b < nBld; b += 1) colOf[b] = sc.obyem[b] ? k++ : -1;
  }
  /* Overlay-аас ӨМНӨХ утга — «юунаас юу болсон» гэдгийг зөвхөн үүгээр мэдэнэ. */
  const baseObyem = new Map<number, (number | null)[]>();
  for (const r of loaded.rows) baseObyem.set(r.oid, r.obyem);
  const baseAct = new Map<number, (number | null)[]>();
  for (const r of loaded.rows) baseAct.set(r.oid, r.act);
  /* Илгээлт БУУСАН нүднүүд — `${oid}:${b}` */
  const touched = new Set(ov.cellKeys);

  /* ── ОГНООНЫ ЗАСВАР ба «Шинэчлэгдсэн огноо» (дээрх `DateChange`) ── */
  const baseDates = new Map<number, { s: (number | null)[]; e: (number | null)[] }>();
  for (const r of loaded.rows) baseDates.set(r.oid, { s: r.start, e: r.end });
  const rowAt = new Map<number, number>();
  ov.rows.forEach((r, i) => rowAt.set(r.oid, i));
  const dateChanges: DateChange[] = [];
  for (const k of ov.dateKeys) {
    const parts = k.split(':');
    const oid = Number(parts[0]);
    const b = Number(parts[1]);
    const se = parts[2] === 'e' ? 'e' : 's';
    const i = rowAt.get(oid);
    if (i == null || !Number.isInteger(b) || b < 0 || b >= nBld) continue;
    const r = ov.rows[i];
    const to = msToDay((se === 's' ? r.start[b] : r.end[b]) ?? null);
    const base = baseDates.get(oid);
    const from = base ? msToDay((se === 's' ? base.s[b] : base.e[b]) ?? null) : '';
    if (from === to) continue;
    dateChanges.push({
      no: r.no,
      work: r.work || '—',
      block: sc.bld[b] ?? String(b + 1),
      se,
      from: from || null,
      to: to || null,
    });
  }

  const changes: Change[] = [];
  const filled: Filled[] = ov.rows.map((r, i) => {
    const base = baseObyem.get(r.oid);
    const baseA = baseAct.get(r.oid);
    const cells: (number | null)[] = [];
    const acts: (number | null)[] = [];
    const before: (number | null)[] = [];
    const changed: boolean[] = [];
    /* Хувийн «юунаас юу» — `blocks`-ийн индексээр (`obyem` өөрчлөгдөөгүй нүдэнд харуулна) */
    const pctFrom: (number | null)[] = [];
    const pctTo: (number | null)[] = [];
    const negs: boolean[] = [];
    for (let b = 0; b < nBld; b += 1) {
      if (colOf[b] < 0) {
        if (!touched.has(`${r.oid}:${b}`)) continue;
        const toA0 = r.act[b] ?? null;
        const fromA0 = baseA ? (baseA[b] ?? null) : null;
        if (fromA0 === toA0) continue;
        changes.push({
          row: i,
          col: -1,
          no: r.no,
          work: r.work || '—',
          block: sc.bld[b] ?? String(b + 1),
          from: null,
          to: null,
          fromPct: fromA0,
          toPct: toA0,
          incPct: deltaOf(fromA0, toA0),
          rid: `${r.oid}|${sids[i]}`,
          ...(negTotalAt(r, b) ? { neg: true as const } : {}),
        });
        continue;
      }
      const to = c[i].obyem[b];
      const from = base ? base[b] : null;
      const toA = r.act[b] ?? null;
      const fromA = baseA ? (baseA[b] ?? null) : null;
      cells.push(to);
      acts.push(c[i].act[b]);
      before.push(from);
      pctFrom.push(fromA);
      pctTo.push(toA);
      changed.push(touched.has(`${r.oid}:${b}`) && (from !== to || fromA !== toA));
      negs.push(negTotalAt(r, b));
    }
    changed.forEach((yes, k) => {
      if (!yes) return;
      changes.push({
        row: i,
        col: k,
        no: r.no,
        work: r.work || '—',
        block: blocks[k] ?? String(k + 1),
        from: before[k],
        to: cells[k],
        fromPct: pctFrom[k],
        toPct: pctTo[k],
        inc: deltaOf(before[k], cells[k]),
        incPct: deltaOf(pctFrom[k], pctTo[k]),
        rid: `${r.oid}|${sids[i]}`,
        ...(negs[k] ? { neg: true as const } : {}),
      });
    });
    return {
      cells,
      acts,
      changed,
      before,
      depth: r.depth,
      group: r.group,
      no: r.no,
      work: r.work || '—',
      wC: c[i].C,
      wD: c[i].D,
      wE: c[i].E,
      vol: r.vol,
      sum: c[i].obyemSum,
      unit: r.unit,
      money: c[i].H,
      plan: c[i].I,
      act: c[i].J,
      ratio: c[i].K,
    };
  });

  return {
    pkgLabel: pkg.label,
    pkgKey: pkg.key,
    day: msToDay(pl.fillMs),
    blocks,
    /* Илгээлт нь суурь жаазтайгаа шууд жишигдсэн — таамаг байхгүй. */
    compared: true,
    prevError: false,
    rows: ov.rows.length,
    filled,
    filledCount: filled.filter((f) => (f.sum ?? 0) > 0).length,
    changes,
    dateChanges,
    asOfChanged: asOf != null && asOf !== loaded.asOf,
    asOfFrom: loaded.asOf != null ? msToDay(loaded.asOf) : null,
    asOfTo: asOf != null ? msToDay(asOf) : null,
    subOid,
    subAt: pl.at,
    remapped: ov.remapped,
    unmoved: ov.unmoved,
    negative: ov.negative,
    negCells: ov.negative > 0 ? describeNegCells(ov.negKeys, ov.rows, sc.bld, ov.negInc) : [],
  };
}

/**
 * Тухайн хянуулалтын АРХИВЫН АГШНЫГ олж, бөглөсөн ажлуудыг буцаана.
 *
 * @param bagts    хяналтын бүртгэл дэх «Багц» (жиш. «Багц 1»)
 * @param sheetOid архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID
 * @param pkgKey   илгээлтийн хуудас; `null` нь зөвхөн хуучин, илгээлтгүй бүртгэл
 */
async function loadArchived(bagts: string, sheetOid: number, pkgKey: string | null): Promise<Submission | null> {
  // Илгээлтийн pkgKey байвал тэр хуудсаар ХЯЗГААРЛАНА; зөвхөн хуучин мөрд давхруудаас хайна.
  const cands = pkgKey === null
    ? PKGS.filter((p) => bagtsKey(p.group) === bagtsKey(bagts))
    : PKGS.filter((p) => p.key === pkgKey);
  if (pkgKey !== null) {
    const pkg = cands[0];
    if (!pkg) throw new Error(tr('Илгээлтийн багц олдсонгүй: {0}', pkgKey));
    if (bagtsKey(pkg.group) !== bagtsKey(bagts))
      throw new Error(tr('Илгээлт «{0}» багцынх — хяналтын бүртгэл «{1}»', pkg.group, bagts));
  }
  if (!cands.length || !sheetOid) return null;
  let last = '';

  for (const p of cands) {
    try {
      const sc = await fillSchema(p);
      const fill = sc.f.fillDate;
      if (!fill) continue;

      const head = (await post(p.url, {
        where: `objectid = ${sheetOid}`,
        outFields: fill,
        returnGeometry: 'false',
      })) as { features?: { attributes: Record<string, unknown> }[] };

      const at = head.features?.[0]?.attributes?.[fill];
      if (typeof at !== 'number') continue;         // энэ үйлчилгээнд тэр мөр алга

      /*
       *    Нийтлэл нь мөрүүдээ бичээд ДАРАА нь огноог тамгалдаг. Тэр хоёр дахь
       *    шат тасарвал жаазын нэг хэсэг огноогүй үлдэнэ — «Багц 3.3»-д яг тийм:
       *    1,459 мөрийн 1,238-д огноо бичигдсэн, 221-д (жаазын ДУНД, OID
       *    6960…7180) үгүй. `bagtsSheet.latestWhere` тэднийг `((өдөр) OR
       *    fill IS NULL)` гэж жаазанд нь буцааж нэгтгэдэг атал энэ зам зөвхөн
       *    ТЭНЦҮҮГЭЭР шүүдэг байв.
       *
       *    Үр дагавар нь чимээгүй: `feats2` 1,238 мөр болж, `TREES[p.key]`
       *    1,459 тэмдэгттэй тул `tree[ri]` нь 46-р байрлалаас эхлэн 221-ээр
       *    ГУЛСАЖ, ажлын мөр бүлэг мэт, бүлэг ажил мэт тэмдэглэгдэнэ —
       *    хянагчийн хүснэгтийн шатлал бүхэлдээ холилдож, «Гүйцэтгэл бөглөх»
       *    хуудсынхтай танигдахаа болино. Мөн `rows` нь 1,238 гэсэн ХУДАЛ тоо
       *    үзүүлнэ.
       */
      const exact = `${fill} = ${ts(at)}`;
      const nExpect = (TREES[p.key] ?? '').length;
      const cntOf = async (w: string): Promise<number> => {
        const r = (await post(p.url, { where: w, returnCountOnly: 'true' })) as { count?: number };
        return Number(r.count ?? 0);
      };
      let nRows = await cntOf(exact);
      let where = exact;
      if (nExpect > 0 && nRows > 0 && nRows < nExpect) {
        const nNull = await cntOf(`${fill} IS NULL`);
        if (nullFragmentFits(nRows, nNull, nExpect, await baseBlankCount(p, sc))) {
          where = `((${exact}) OR ${fill} IS NULL)`;
          nRows += nNull;
        }
      }

      /*
       * ӨМНӨХ АГШНЫГ олно — өөрчлөлтийг зөвхөн түүнтэй жишиж мэдэж болно.
       */
      let prevFailed = false;
      let prevQ: { features?: { attributes: Record<string, unknown> }[] } = {};
      try {
        prevQ = (await post(p.url, {
          where: `${fill} < ${ts(at)}`,
          groupByFieldsForStatistics: fill,
          outStatistics: JSON.stringify([
            { statisticType: 'max', onStatisticField: fill, outStatisticFieldName: 'm' },
          ]),
          orderByFields: `${fill} DESC`,
          resultRecordCount: '1',
        })) as { features?: { attributes: Record<string, unknown> }[] };
      } catch {
        prevFailed = true;
      }
      const prevAt = num(prevQ.features?.[0]?.attributes?.[fill]);

      let filled: Filled[] = [];
      let filledCount = 0;
      const changes: Change[] = [];
      /** Суурь нь ИЖИЛ ӨДРИЙН өмнөх жааз уу (доорх `samePrev`) */
      let sameDay = false;
      const sum = sc.f.obyemSum;
      if (sum) {
        const w2 = where;
        {
          const obs = sc.obyem.filter(Boolean) as string[];
          const acts = sc.obyem.map((o, i) => (o ? sc.act[i] : null)).filter(Boolean) as string[];
          const cols = [sc.f.oid, sc.f.no, sc.f.work, sc.f.wC, sc.f.wD, sc.f.wE, sc.f.vol, sum,
            sc.f.unit, sc.f.money, sc.f.plan, sc.f.act, sc.f.ratio, sc.f.gun, ...obs, ...acts]
            .filter(Boolean) as string[];
          const feats: { attributes: Record<string, unknown> }[] = [];
          for (let off = 0; ; ) {
            const page = (await post(p.url, {
              where: w2,
              outFields: [...new Set(cols)].join(','),
              returnGeometry: 'false',
              orderByFields: 'objectid ASC',
              resultOffset: String(off),
              resultRecordCount: '2000',
            })) as { features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean };
            const got = page.features ?? [];
            feats.push(...got);
            if (!page.exceededTransferLimit || got.length === 0) break;
            off += got.length;
          }
          /*
           *    `bagtsSheet.loadRows` ЯГ ижил зүйл хийдэг (`feats2`) — хоёр
           *    тал НЭГ дүрмээр таслаж байж л индекс нь тэнцэнэ.
           */
          const expect = nExpect;
          const si = feats.findIndex((x) => Number(x.attributes[sc.f.oid]) === sheetOid);
          const feats2 = si >= 0 ? firstFrame(feats.slice(si), sc.f.no, expect, sc.f.work) : lastFrame(feats, sc.f.no, expect, sc.f.work);
          const samePrev0 = si > 0 ? lastFrame(feats.slice(0, si), sc.f.no, expect, sc.f.work) : [];
          const need = Math.min(expect, feats2.length);
          const samePrev = expect <= 0 || samePrev0.length >= need ? samePrev0 : [];
          /* Мөрийн тоо ч ЭНЭ жаазных — өдрийн бүх жаазны нийлбэр биш */
          if (si >= 0) nRows = feats2.length;
          const q = { features: feats2 };
          /*
           * ӨМНӨХ АГШНЫ ижил мөрүүд — `№`-ээр индекслэнэ.
           */
          const before = new Map<string, Record<string, unknown>>();
          const beforePos = new Map<string, Record<string, unknown>>();
          const indexBefore = (fs: { attributes: Record<string, unknown> }[]) => {
            const ss = rowSids(fs.map((x) => ({ no: String(x.attributes[sc.f.no] ?? ''), work: String(x.attributes[sc.f.work] ?? '') })));
            fs.forEach((x, i) => { before.set(ss[i], x.attributes); beforePos.set(String(i), x.attributes); });
          };
          const blankSid = (x: { attributes: Record<string, unknown> }) =>
            String(x.attributes[sc.f.no] ?? '').trim() === '' && String(x.attributes[sc.f.work] ?? '').trim() === '';
          if (samePrev.length) {
            sameDay = true;
            prevFailed = false;
            indexBefore(samePrev);
          } else if (prevAt != null) {
            const prevFeats: { attributes: Record<string, unknown> }[] = [];
            try {
              for (let off = 0; ; ) {
                const pv = (await post(p.url, {
                  where: `${fill} = ${ts(prevAt)}`,
                  outFields: [sc.f.no, sc.f.work, ...obs].join(','),
                  returnGeometry: 'false',
                  orderByFields: 'objectid ASC',
                  resultOffset: String(off),
                  resultRecordCount: '2000',
                })) as { features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean };
                const got = pv.features ?? [];
                prevFeats.push(...got);
                if (!pv.exceededTransferLimit || got.length === 0) break;
                off += got.length;
              }
            } catch {
              prevFailed = true;
            }
            if (!prevFailed) {
              const pExpect = (TREES[p.key] ?? '').length;
              const prev2 = lastFrame(prevFeats, sc.f.no, pExpect, sc.f.work);
              indexBefore(prev2);
            }
          }

          const tree = TREES[p.key] ?? '';
          const gunF = sc.f.gun;
          const qf = q.features ?? [];
          const gunDepth = gunF && qf.length > 0 && qf.every((x) => x.attributes[gunF] != null)
            ? qf.map((x) => Number(x.attributes[gunF]) || 0)
            : null;
          const blkLabels = sc.bld.filter((_, i) => sc.obyem[i]);
          const sidsA = rowSids((q.features ?? []).map((x) => ({
            no: String(x.attributes[sc.f.no] ?? ''),
            work: String(x.attributes[sc.f.work] ?? ''),
          })));
          filled = (q.features ?? []).map((x, ri) => {
            const a = x.attributes;
            const prev = blankSid(x) ? beforePos.get(String(ri)) : before.get(sidsA[ri]);
            const cells = obs.map((n) => num(a[n]));
            const beforeVals = obs.map((n) => (prev ? num(prev[n]) : null));
            const changed = obs.map((n, k) => {
              const now = cells[k];
              if (now == null) return false;
              if (prevFailed) return false;
              // Анхны нийтлэлд өмнөх агшин алга — утгатай нүд бүр ШИНЭ
              if (!prev) return true;
              return num(prev[n]) !== now;
            });
            const ch = tree[ri] ?? '0';
            const group = gunDepth
              ? ri + 1 < gunDepth.length && gunDepth[ri + 1] > gunDepth[ri]
              : ch >= 'A' && ch <= 'E';
            changed.forEach((yes, k) => {
              if (!yes) return;
              changes.push({
                row: ri,
                col: k,
                no: String(a[sc.f.no] ?? '').trim(),
                work: String(a[sc.f.work] ?? '').trim() || '—',
                block: blkLabels[k] ?? String(k + 1),
                from: beforeVals[k],
                to: cells[k],
                rid: `${num(a[sc.f.oid]) ?? -1}|${sidsA[ri]}`,
              });
            });
            if ((num(a[sum]) ?? 0) > 0) filledCount += 1;
            return {
              cells,
              acts: acts.map((n) => num(a[n])),
              changed,
              before: beforeVals,
              depth: gunDepth ? gunDepth[ri] : group ? ch.charCodeAt(0) - 65 : Number(ch),
              group,
              no: String(a[sc.f.no] ?? '').trim(),
              work: String(a[sc.f.work] ?? '').trim() || '—',
              wC: sc.f.wC ? num(a[sc.f.wC]) : null,
              wD: sc.f.wD ? num(a[sc.f.wD]) : null,
              wE: sc.f.wE ? num(a[sc.f.wE]) : null,
              vol: num(a[sc.f.vol]),
              sum: num(a[sum]),
              unit: sc.f.unit ? num(a[sc.f.unit]) : null,
              money: sc.f.money ? num(a[sc.f.money]) : null,
              plan: sc.f.plan ? num(a[sc.f.plan]) : null,
              act: sc.f.act ? num(a[sc.f.act]) : null,
              ratio: sc.f.ratio ? num(a[sc.f.ratio]) : null,
            };
          });
        }
      }

      return {
        pkgLabel: p.label,
        pkgKey: p.key,
        day: msToDay(at),
        blocks: sc.bld.filter((_, i) => sc.obyem[i]),
        compared: (prevAt != null || sameDay) && !prevFailed,
        prevError: prevFailed,
        rows: nRows,
        filled,
        filledCount,
        changes,
        dateChanges: [],
        asOfChanged: false,
      };
    } catch (e) {
      last = String((e as Error)?.message ?? e);
      continue;
    }
  }
  if (last) throw new Error(last);
  return null;
}
