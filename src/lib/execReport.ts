/**
 * УДИРДЛАГЫН ТАЙЛАН — шийдвэр гаргагчид зориулсан ТОВЧ тайлангийн өгөгдөл.
 *
 * ДӨРВӨН эх сурвалжийн ДЭЛГЭЦ ДЭЭРХ тоог ЯГ ТЭР ХЭВЭЭР нь нэгтгэнэ:
 *   · 01. Ерөнхий дашбоард  — `GeneralDash.KpiStrip` (`gdash.kpisOf`)
 *   · 05. Багцын гүйцэтгэл  — `PkgProg.TsKpi` (биет vs төлөвлөгөө) + багцууд
 *   · 04. Багцын санхүү     — `PkgFin.pkgFinRows` (гэрээ vs олгосон)
 *   · Зөвшөөрөл             — `zovshoorol.summarize`
 *
 * ⚠️ ЭНД ШИНЭ ТООЦОО ХИЙХГҮЙ. Тайлангийн тоо дашбоардын тоотой ЗӨРВӨЛ
 *    удирдлага аль нь үнэн болохыг мэдэхгүй болно — тиймээс энэ файл нь
 *    зөвхөн ДУУДАГЧ: тооцоог тухайн харагдацын экспортолсон функцээр хийнэ.
 *    Тэдгээр функц өөрчлөгдвөл тайлан автоматаар дагана.
 *
 * ⚠️ БҮГД-ЭСВЭЛ-ЮУ-Ч-ҮГҮЙ БИШ (`reportData.loadReportExtra`-аас ялгаатай):
 *    зөвшөөрлийн үйлчилгээ холбогдоогүй (`loadZov` → null) байж болно.
 *    Тэр үед тайлан ХЭСЭГЧИЛСЭН биш, харин тухайн хэсэг «мэдээлэлгүй» гэж
 *    ИЛ тэмдэглэгдэнэ (null ≠ 0). Бусад гурван эх унавал бүхэлдээ унана.
 *
 * ⚠️ Дэлгэц (`ExecReport.tsx`), PDF (`execPdf.ts`), инфографик
 *    (`execInfographic.ts`), AI дүгнэлт (`askExecSummary`) ДӨРВҮҮЛЭЭ ЯГ ЭНЭ
 *    объектыг уншина — нэг тоо, дөрвөн хэлбэр.
 */

import { cached, loadFillPkgProgress } from '@/lib/live';
import { t as tr } from '@/lib/i18nCore';
import { num, pct, mnt, monthKey, sentenceCase } from '@/lib/format';
import {
  loadGdashCf, loadContractSum, loadHseNow, kpisOf, chartTypeCost, chartSourceMerged, CONTRACTED,
} from '@/lib/gdash';
import { FIN_XL_ROW_HIDE } from '@/lib/finExcelLayout';
import { loadLandStatus } from '@/lib/land';
import { loadPlanCurve } from '@/lib/planProgress';
import { loadZov, summarize, byBagts, TOLOV } from '@/lib/zovshoorol';
import { PROGRESS_LEVELS } from '@/lib/services';
import { loadBuildings } from '@/modules/BuildingPanel';
import { buildPacks } from '@/modules/Bagts';
import { loadFinData } from '@/modules/Finance';
import { aggregateMonths } from '@/modules/PkgProg';
import { pkgFinRows } from '@/modules/PkgFin';
import { AGENT_API, arcgisToken } from '@/lib/agent/client';

/* ═══════════════ Төрөл ═══════════════ */

export type ExecReport = {
  /** 01. Ерөнхий дашбоард — дээд зурвасын зургаан индикатор + төрлийн задаргаа */
  gdash: {
    budget: number;
    contract: number;
    /** Зургаан шатны жигнэсэн гүйцэтгэл, 0–100; хэмжигдээгүй бол null */
    progress: number | null;
    packages: number;
    types: number;
    landPct: number | null;
    /**
     * Газар чөлөөлөлт — 01-ийн «Газар чөлөөлөлт» карттай ИЖИЛ эх (`loadLandStatus`):
     * төлөв бүрийн тоо ба чөлөөлөгдөөгүй шалтгаанууд (тоогоор буурах).
     */
    land: {
      total: number; cleared: number; remaining: number; areaM2: number;
      byStatus: { label: string; n: number; areaM2: number }[];
      reasons: { label: string; n: number }[];
    };
    /**
     * ХАБ — 01-ийн «ХАБ» карттай ИЖИЛ (`loadHseNow`): СҮҮЛИЙН бөглөгдсөн
     * бүртгэлийн агшин; `null` = бүртгэл алга (0 БИШ).
     */
    hse: { date: string; workers: number; equipment: number; manHours: number } | null;
    /** Ажлын төрөл бүрийн төсөв · гэрээлсэн · гүйцэтгэл (өртгөөр буурах) */
    byType: { label: string; cost: number; contract: number; perf: number | null; n: number; contracted: number }[];
    /**
     * ЗАХИРАМЖИЙН ЭХ ҮҮСВЭР — мөнгө ба ажлын тоо (дүнгээр буурах).
     *
     * ⚠️ Суурь нь НИЙТ ТӨСӨВ БИШ, эх үүсвэрийн талбаруудын нийлбэр:
     * захирамжийн дүн бүх ажилд бүрэн бүртгэгдээгүй тул хувь нь
     * «эх үүсвэрүүдийн дотор эзлэх хувь» (`chartSourceAmount` §тайлбар).
     */
    bySource: { label: string; amount: number; contracted: number; n: number }[];
  };
  /** 05. Багцын гүйцэтгэл */
  prog: {
    blocks: number;
    households: number;
    /** Бөглөгдөөгүй блок */
    noData: number;
    asOf: string;
    /** Орон сууцны биет гүйцэтгэл — блокоор жигнэсэн, одоогийн сар хүртэлх сүүлийн хэмжилт */
    actual: number | null;
    /** Хуваарийн төлөвлөгөө — одоогийн сар хүртэлх сүүлийн цэг */
    planned: number | null;
    /** төлөвлөгөө − бодит; эерэг = хоцрогдол */
    gap: number | null;
    packs: { key: string; name: string; kind: 'build' | 'infra'; blocks: number; households: number; progress: number | null }[];
    /** Блокийн гүйцэтгэлийн түвшний тархалт */
    levels: { label: string; range: string; n: number; color: string }[];
  };
  /** 04. Багцын санхүү */
  fin: {
    planTotal: number;
    given: number;
    share: number | null;
    remain: number;
    rows: { key: string; label: string; plan: number; given: number; pct: number | null }[];
  };
  /** Зөвшөөрөл — үйлчилгээ холбогдоогүй бол `null` (мэдээлэлгүй ≠ 0) */
  zov: {
    total: number; ok: number; wait: number; no: number; unknown: number;
    byBagts: { bagts: string; total: number; ok: number; wait: number; no: number; unknown: number }[];
    /** Анхаарал шаардах мөрүүд — зөвшөөрөөгүй ба хүлээгдэж буй */
    issues: { bagts: string; ner: string; baiguullaga: string; tolov: string; shat: number }[];
  } | null;
};

/* ═══════════════ Ачаалагч ═══════════════ */

/**
 * ⚠️ Кэштэй (5 мин) — «Тайлан» харагдацыг хоёр горимын хооронд сэлгэхэд
 *    дахин татахгүй. Доторх ачаалагчид бүгд өөрсдөө кэштэй тул давхар
 *    сүлжээний хүсэлт ҮҮСЭХГҮЙ; энд зөвхөн нэгтгэлийн үр дүнг хадгална.
 */
export const loadExecReport = cached(loadExecReportRaw, 5 * 60_000,
  ['CASHFLOW_NEW', 'HO_IPC', 'BAGTS_SHEET', 'BUILDING', 'PARCEL_LEFT', 'HABEA', 'ZOVSHOOROL']); // ⚠️ зөвшөөрлийн засвар шууд тусна (2026-09-17)

async function loadExecReportRaw(): Promise<ExecReport> {
  const [cf, contracts, land, fillProg, bld, fin, plan, zovRows, hse] = await Promise.all([
    loadGdashCf(),
    loadContractSum(),
    loadLandStatus(),
    loadFillPkgProgress(),
    loadBuildings(),
    loadFinData(),
    loadPlanCurve(),
    /* ⚠️ Зөвшөөрөл унавал тайлан бүхэлдээ унахгүй — `null` = мэдээлэлгүй */
    loadZov().catch(() => null),
    /* ⚠️ ХАБ мөн адил: маягт нь тусдаа survey тул унавал `null` (0 биш) */
    loadHseNow().catch(() => null),
  ]);

  /* ── 05. Багцын гүйцэтгэл — `PkgProg.TsKpi`-тай ИЖИЛ ── */
  const packs = buildPacks(bld.rows);
  const months = aggregateMonths(fin);
  const nowYm = monthKey();
  let actual: number | null = null;
  for (const m of months) {
    if (m.label > nowYm) continue;
    if (m.phys != null) actual = m.phys;
  }
  let planned: number | null = null;
  for (const p of plan.months) if (p.label <= nowYm) planned = p.pct;
  const gap = planned != null && actual != null ? planned - actual : null;

  /* ── 01. Ерөнхий дашбоард — `GeneralDash.KpiStrip`-тэй ИЖИЛ ──
     ⚠️ Хугацааны шүүлт ба чартын сонголтгүй (бүх мөр) — тайлан нь дашбоардын
        АНХДАГЧ (шүүлтгүй) төлөвийг хэвлэнэ. */
  const csum = cf.reduce((s, r) => (r.note === CONTRACTED ? s + (contracts.get(r.oid) ?? 0) : s), 0);
  const k = kpisOf(cf, csum, land.pct);
  /* ⚠️ «ОРОН СУУЦНЫ ХОРООЛОЛ»-ын гүйцэтгэл нь блок-жигнэсэн биет хувь —
     `GeneralDash.catPct`-тай ижил дүрэм. */
  const catPct = new Map<string, number>();
  if (actual != null) catPct.set('ОРОН СУУЦНЫ ХОРООЛОЛ', actual);
  /**
   * ⚠️ ХЭРЭГЛЭГЧЭЭС НУУСАН ХЭСЭГ ЧАРТАД Ч ОРОХГҮЙ (2026-09-17).
   *
   * «7 БОНДЫН ХҮҮ» нь санхүүжилтийн хүснэгтээс аль хэдийн нуугдсан
   * (`FIN_XL_ROW_HIDE`, 2026-09-10-ны заавар: «хүмүүст ерөөсөө харуулахгүй»)
   * атлаа тайлангийн ажлын төрлийн чартад «0 ₮ · —» гэсэн хоосон мөр болж
   * гарсаар байв. Мөнгө нь 0 тул нийлбэр хөндөгдөхгүй.
   */
  const shown = cf.filter((r) => !FIN_XL_ROW_HIDE.includes(r.sec));
  const byType = chartTypeCost(shown, fillProg, catPct)
    .map((b) => ({
      /* ⚠️ Эх үйлчилгээний БҮХ ТОМ ҮСЭГТ нэрийг уншигдахуйц болгоно
         (`sentenceCase` §тайлбар, 2026-09-17 хэрэглэгчийн заавар). */
      label: sentenceCase(b.label), cost: b.value, contract: b.sub, perf: b.perf ?? null,
      n: b.count ?? 0, contracted: b.countSub ?? 0,
    }))
    .sort((a, b) => b.cost - a.cost);
  /* ⚠️ Дашбоардын «Захирамжийн эх үүсвэр» чарттай ИЖИЛ эх */
  const bySource = chartSourceMerged(cf).map((b) => ({
    label: sentenceCase(b.label), amount: b.value, contracted: b.sub, n: b.count ?? 0,
  }));

  /* ── 04. Багцын санхүү — `PkgFin.pkgFinRows`-тэй ИЖИЛ ── */
  const pf = pkgFinRows(packs, fin);

  /* ── Зөвшөөрөл ── */
  let zov: ExecReport['zov'] = null;
  if (zovRows) {
    const s = summarize(zovRows);
    const groups = [...byBagts(zovRows)].map(([bagts, list]) => ({ bagts, ...summarize(list) }))
      .sort((a, b) => a.bagts.localeCompare(b.bagts, 'mn'));
    const issues = zovRows
      .filter((r) => r.tolov !== TOLOV.ok)
      .sort((a, b) => (a.tolov === TOLOV.no ? -1 : 1) - (b.tolov === TOLOV.no ? -1 : 1) || a.bagts.localeCompare(b.bagts, 'mn') || a.shat - b.shat)
      .map((r) => ({
        bagts: r.bagts, ner: r.ner, baiguullaga: r.baiguullaga, shat: r.shat,
        tolov: r.tolov === 'unknown' ? tr('Танигдаагүй төлөв') : r.tolov,
      }));
    zov = {
      total: s.total, ok: s.ok, wait: s.wait, no: s.no, unknown: s.unknown,
      byBagts: groups.map((g) => ({ bagts: g.bagts, total: g.total, ok: g.ok, wait: g.wait, no: g.no, unknown: g.unknown })),
      issues,
    };
  }

  const withData = bld.rows.filter((b) => b.progress != null);
  return {
    gdash: {
      budget: k.budget, contract: k.contract, progress: k.progress,
      packages: k.packages, types: k.types, landPct: land.pct,
      land: {
        total: land.total, cleared: land.cleared, remaining: land.remaining, areaM2: land.areaM2,
        byStatus: land.byStatus.map((b) => ({ label: b.label, n: b.n, areaM2: b.areaM2 })),
        reasons: land.reasons.map((r) => ({ label: r.label, n: r.n })),
      },
      hse: hse ? { date: hse.date, workers: hse.workers, equipment: hse.equipment, manHours: hse.manHours } : null,
      byType,
      bySource,
    },
    prog: {
      blocks: bld.blocks, households: bld.households, noData: bld.noData, asOf: bld.asOf,
      actual, planned, gap,
      packs: packs.map((p) => ({
        key: p.key, name: p.name, kind: p.kind, blocks: p.blocks.length,
        households: p.households, progress: p.progress,
      })),
      levels: PROGRESS_LEVELS.map((l) => ({
        label: l.label, range: l.range, color: l.color,
        n: withData.filter((b) => b.progress! >= l.min && b.progress! < l.max).length,
      })),
    },
    fin: {
      planTotal: pf.planTotal, given: pf.givenTotal,
      share: pf.planTotal > 0 ? (pf.givenTotal / pf.planTotal) * 100 : null,
      remain: Math.max(0, pf.planTotal - pf.givenTotal),
      rows: pf.rows,
    },
    zov,
  };
}

/* ═══════════════ Дүгнэлт — дүрэмд суурилсан ═══════════════ */

/**
 * АНХААРАХ АСУУДЛУУД — амьд тооноос үүсэх өгүүлбэрүүд. AI байхгүй үед ч
 * тайлан дүгнэлттэй байна; AI дүгнэлт нь ҮҮНИЙГ ОРЛОХГҮЙ, ХАЖУУД нь гарна.
 *
 * ⚠️ Босго тоонууд (5 нэгж хувь, 50%) нь ЗӨВХӨН «анхаарал татах» шүүлт —
 *    албан ёсны шалгуур биш. Албан босго тогтвол энд нэг газар солино.
 */
/**
 * Нэг дүгнэлт — ТАЙЛАНГИЙН МӨР (2026-09-17, хэрэглэгчийн заавар:
 * «ойлгомжтой тайлангийн формат руу оруул»).
 *
 * ⚠️ Урьд нь энэ нь энгийн `string[]` байсан тул 34 багцын нэр НЭГ
 * өгүүлбэр дотор таслалаар цувж, хүн уншиж чаддаггүй байв. Одоо нэр
 * жагсаалт нь `items`-д ТУСДАА гарч, дэлгэц дээр жагсаалт болж зурагдана.
 *
 * ⚠️ `sev` нь ЗӨВХӨН харагдацын эрэмбэ — албан ёсны ангилал БИШ. Босго
 * тоонууд доор нэг газар бичигдсэн.
 */
export type ExecFinding = {
  /** Хүндрэлийн зэрэг: bad = шийдвэр шаардсан, warn = анхаарах, info = мэдээлэл */
  sev: 'bad' | 'warn' | 'info';
  /** Аль хэсгийн асуудал бэ — тайлангийн бүлгийн нэр */
  area: string;
  /** Нэг өгүүлбэр — тоог агуулсан гол мэдэгдэл */
  text: string;
  /** Нэрсийн жагсаалт (багц, талбар…) — өгүүлбэрт ЦУВУУЛАХГҮЙ */
  items?: string[];
  /**
   * ЗӨВЛӨМЖ — энэ асуудалд авах үйл ажиллагаа.
   * ⚠️ Дүгнэлт нь «юу болсныг», зөвлөмж нь «юу хийхийг» хэлнэ. Хоёрыг
   * нэг өгүүлбэрт нийлүүлбэл аль нь баримт, аль нь санал болох нь
   * ялгагдахаа болино.
   */
  advice?: string;
};

/**
 * АНХААРАХ АСУУДЛУУД — амьд тооноос үүсэх бүтэцтэй мөрүүд.
 *
 * ⚠️ Эрэмбэ нь ЧУХЛААС бага руу: зөвшөөрөл ба санхүүжилтийн гацаа нь
 * шийдвэр шаарддаг тул дээр, мэдээллийн дутуу байдал доор.
 */
export function execFindings(x: ExecReport): ExecFinding[] {
  const out: ExecFinding[] = [];
  const A_PROG = tr('Гүйцэтгэл');
  const A_FIN = tr('Санхүүжилт');
  const A_LAND = tr('Газар чөлөөлөлт');
  const A_ZOV = tr('Зөвшөөрөл');
  const A_DATA = tr('Мэдээллийн бүрэн байдал');

  /* ── Зөвшөөрөл — ажил эхлүүлэхэд шууд саад ── */
  if (x.zov) {
    if (x.zov.no > 0) {
      out.push({
        sev: 'bad', area: A_ZOV,
        text: tr('{0} зөвшөөрөл олгогдоогүй, ажил эхлүүлэх шийдвэрт шууд нөлөөлнө.', num(x.zov.no)),
        advice: tr('Олгосон байгууллагатай яаралтай уулзаж татгалзсан үндэслэлийг тодруулан, шаардлагатай нэмэлт материалыг бүрдүүлж дахин хүсэлт гаргах.'),
      });
    }
    if (x.zov.wait > 0) {
      out.push({
        sev: 'warn', area: A_ZOV,
        text: tr('{0} зөвшөөрөл хүлээгдэж байна.', num(x.zov.wait)),
        advice: tr('Холбогдох байгууллагуудаас хариу өгөх хугацааг баталгаажуулж, шаардлагатай бол зохицуулах хурал зарлан шийдвэрлэх хугацааг товлох.'),
      });
    }
    if (x.zov.unknown > 0) {
      out.push({ sev: 'info', area: A_ZOV, text: tr('{0} зөвшөөрлийн төлөв танигдахгүй байна, бүртгэлийг засах шаардлагатай.', num(x.zov.unknown)) });
    }
  } else {
    out.push({ sev: 'info', area: A_ZOV, text: tr('Зөвшөөрлийн бүртгэл холбогдоогүй тул энэ тайланд зөвшөөрлийн мэдээлэл ороогүй.') });
  }

  /* ── Санхүүжилт ── */
  if (x.fin.share != null && x.fin.share < 20) {
    out.push({
      sev: 'bad',
      area: A_FIN,
      /* ⚠️ `mnt()` нь ₮-г ӨӨРӨӨ нэмнэ — загварт давхар бичвэл «… ₮ ₮» болно */
      text: tr('Гэрээний дүнгийн ердөө {0} нь олгогдсон; олгогдоогүй үлдэгдэл {1}.', pct(x.fin.share, 1), mnt(x.fin.remain)),
      advice: tr('Санхүүжилтийн графикийг гэрээний хуваарьтай уялдуулан дахин хянаж, олголтын саатлын шалтгааныг багц тус бүрээр тодруулах.'),
    });
  }
  const lowFin = x.fin.rows.filter((r) => r.pct != null && r.pct < 10 && r.plan > 0);
  if (lowFin.length) {
    out.push({
      sev: 'warn',
      area: A_FIN,
      text: tr('{0} багцын санхүүжилт гэрээний дүнгийн 10%-д хүрээгүй.', num(lowFin.length)),
      advice: tr('Санхүүжилтийн эрэмбийг тухайн ажлын эхлэх хуваарьтай уялдуулан дахин харах; олголт огт эхлээгүй багцуудын явцыг сар бүр хянах.'),
      items: lowFin.map((r) => r.label),
    });
  }
  if (x.gdash.budget > 0 && x.gdash.contract > 0) {
    const share = (x.gdash.contract / x.gdash.budget) * 100;
    if (share < 90) {
      out.push({
        sev: 'warn',
        area: A_FIN,
        text: tr('Нийт төсвийн {0} нь гэрээгээр баталгаажсан; {1} гэрээлэгдээгүй үлдсэн.', pct(share, 1), mnt(x.gdash.budget - x.gdash.contract)),
        advice: tr('Үлдэгдэл ажлын гүйцэтгэгч сонгон шалгаруулах, гэрээ байгуулах ажлыг эрчимжүүлж төлөвлөгөөт хугацаанд багтаах.'),
      });
    }
  }

  /* ── Газар чөлөөлөлт ── */
  if (x.gdash.landPct != null && x.gdash.land.remaining > 0) {
    const top = x.gdash.land.reasons[0];
    out.push({
      sev: 'warn',
      area: A_LAND,
      text: top
        ? tr('Газар чөлөөлөлт {0}, {1} нэгж талбар чөлөөлөгдөөгүй. Гол шалтгаан «{2}» ({3} талбар).', pct(x.gdash.landPct, 1), num(x.gdash.land.remaining), top.label, num(top.n))
        : tr('Газар чөлөөлөлт {0}, {1} нэгж талбар чөлөөлөгдөөгүй.', pct(x.gdash.landPct, 1), num(x.gdash.land.remaining)),
      advice: tr('Үлдсэн талбаруудад зориулсан хэлэлцээрийн баг байгуулж, гол шалтгаан тус бүрээр шийдвэрлэх хугацаатай зорилт тавих.'),
    });
  }

  /* ── Гүйцэтгэл ── */
  const stalled = x.prog.packs.filter((p) => p.kind === 'build' && p.progress != null && p.progress < 5);
  if (stalled.length) {
    out.push({
      sev: 'bad',
      area: A_PROG,
      text: tr('{0} багц 5%-иас доош гүйцэтгэлтэй.', num(stalled.length)),
      advice: tr('Эдгээр багцын ажил эхлэхэд саад болж буй хүчин зүйлийг (зөвшөөрөл, газар, санхүүжилт) тус бүрд нь тодруулж, хариуцагч томилох.'),
      items: stalled.map((p) => p.name),
    });
  }
  if (x.prog.gap != null && x.prog.gap >= 5) {
    out.push({
      sev: 'warn',
      area: A_PROG,
      text: tr('Орон сууцны барилга угсралт хуваариас {0} нэгж хувиар хоцорч байна (төлөвлөгөө {1}, бодит {2}).', num(x.prog.gap, 1), pct(x.prog.planned, 1), pct(x.prog.actual, 1)),
      advice: tr('Хоцрогдолтой блокуудад хүн хүч, техник хэрэгслийн нэмэлт хуваарилалт хийж, сар бүрийн биет хэмжилтээр явцыг хянах.'),
    });
  } else if (x.prog.gap != null && x.prog.gap < 0) {
    out.push({
      sev: 'info',
      area: A_PROG,
      text: tr('Орон сууцны барилга угсралт хуваариас {0} нэгж хувиар түрүүлж байна.', num(-x.prog.gap, 1)),
      advice: tr('Одоогийн хурдыг барихын тулд хүн хүч, техник хэрэгслийн хуваарилалтыг тогтвортой хадгалж, хамгийн бага гүйцэтгэлтэй багцуудад нэмэлт анхаарал хандуулах.'),
    });
  }

  /* ── Мэдээллийн дутуу байдал — тоог гажуудуулдаг тул ЗААВАЛ хэлнэ ── */
  if (x.prog.noData > 0) {
    out.push({
      sev: 'info',
      area: A_DATA,
      text: tr('{0} блокийн гүйцэтгэл хараахан бөглөгдөөгүй, тайлангийн биет хувь тэдгээрийг агуулахгүй.', num(x.prog.noData)),
    });
  }
  if (!x.gdash.hse) {
    out.push({
      sev: 'info',
      area: A_DATA,
      text: tr('ХАБ-ын хүн хүчний бүртгэл олдсонгүй, талбайн ажиллах хүчний мэдээлэл энэ тайланд алга.'),
    });
  }
  return out;
}

/**
 * ДҮГНЭЛТИЙГ ЭНГИЙН МӨР БОЛГОНО — PDF ба инфографикт.
 *
 * ⚠️ Тэр хоёр нь энгийн текстийн урсгал тул жагсаалтыг өгүүлбэрт нийлүүлнэ.
 * Дэлгэц нь ЭСРЭГЭЭР бүтцээ хадгалж, жагсаалтыг тусад нь зурна.
 */
export function execFindingLines(x: ExecReport): string[] {
  return execFindings(x).map((f) => (
    f.items?.length ? `${f.text} ${f.items.join(', ')}.` : f.text
  ));
}

/**
 * ЗӨВХӨН МЭДЭГДЭЛ — нэрсийн жагсаалтгүй (2026-09-17).
 *
 * ⚠️ ИНФОГРАФИКТ зориулав. Тэр нь НЭГ ХУУДСАНД багтах ёстой график бөгөөд
 * 34 багцын нэрийг тэнд цутгавал доод талын «Анхаарах асуудал» блок нь
 * долоон мөр болж, бусад бүх хэсгийг шахна (хэрэглэгчийн шүүмж). Нэрс нь
 * ТАЙЛАНД (дэлгэц ба PDF) бүрнээрээ гарна — мэдээлэл алдагдахгүй.
 */
export function execFindingBrief(x: ExecReport): string[] {
  return execFindings(x).map((f) => f.text);
}

/* ═══════════════ AI дүгнэлт ═══════════════ */

/**
 * Загварт өгөх КОМПАКТ өгөгдөл — тайлангийн бүх тоо, гэхдээ товч.
 * ⚠️ Загвар ӨӨРӨӨ ТОО ЗОХИОХ ёсгүй тул зөвхөн энд байгаа тоог хэрэглэхийг
 *    системийн зааварт хатуу заана.
 */
export function execFacts(x: ExecReport): string {
  const L: string[] = [];
  L.push(`## 01. Ерөнхий дашбоард`);
  L.push(`Нийт төсөв: ${num(x.gdash.budget)} ₮`);
  L.push(`Нийт гэрээлсэн дүн: ${num(x.gdash.contract)} ₮`);
  L.push(`Гүйцэтгэлийн хувь (6 шатны жигнэсэн): ${x.gdash.progress == null ? 'мэдээлэлгүй' : pct(x.gdash.progress, 1)}`);
  L.push(`Багц ажлын тоо: ${x.gdash.packages}; төрлийн тоо: ${x.gdash.types}`);
  L.push(`Газар чөлөөлөлт: ${x.gdash.landPct == null ? 'мэдээлэлгүй' : pct(x.gdash.landPct, 1)} (нийт ${x.gdash.land.total}, чөлөөлсөн ${x.gdash.land.cleared}, үлдсэн ${x.gdash.land.remaining})`);
  L.push(`Газар чөлөөлөлт төлвөөр: ${x.gdash.land.byStatus.map((b) => `${b.label} ${b.n}`).join('; ') || '—'}`);
  L.push(`Чөлөөлөгдөөгүй шалтгаан: ${x.gdash.land.reasons.map((r) => `${r.label} ${r.n}`).join('; ') || '—'}`);
  L.push(`ХАБ (сүүлийн бүртгэл ${x.gdash.hse?.date || '—'}): ${x.gdash.hse ? `ажиллаж буй хүн ${x.gdash.hse.workers}, техник ${x.gdash.hse.equipment}, хүн цаг ${x.gdash.hse.manHours}` : 'мэдээлэлгүй'}`);
  L.push(`Ажлын төрлөөр (төсөв / гэрээлсэн / гүйцэтгэл):`);
  /* ⚠️ Өгөгдлийн мөрийг ЦЭВЭРЛЭНЭ (2026-09-17): мөр таслах/`#` гарчиг нь загварт заавар болохоос */
  const cl = (v: unknown) => String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/^\s*#+\s*/, '').trim();
  for (const t of x.gdash.byType) L.push(`- ${cl(t.label)}: ${num(t.cost)} / ${num(t.contract)} / ${t.perf == null ? '—' : pct(t.perf, 1)} (${t.n} ажил, ${t.contracted} гэрээлсэн)`);
  L.push(`## 05. Багцын гүйцэтгэл (орон сууцны барилга угсралт)`);
  L.push(`Блок: ${x.prog.blocks}; өрх: ${x.prog.households}; бөглөгдөөгүй блок: ${x.prog.noData}; сүүлийн хэмжилт: ${x.prog.asOf || '—'}`);
  L.push(`Бодит: ${x.prog.actual == null ? '—' : pct(x.prog.actual, 1)}; төлөвлөсөн: ${x.prog.planned == null ? '—' : pct(x.prog.planned, 1)}; зөрүү (төлөвлөгөө−бодит): ${x.prog.gap == null ? '—' : num(x.prog.gap, 1)}`);
  for (const p of x.prog.packs) L.push(`- ${cl(p.name)}: ${p.progress == null ? 'мэдээлэлгүй' : pct(p.progress, 1)}${p.kind === 'build' ? ` (${p.blocks} блок, ${p.households} өрх)` : ''}`);
  L.push(`Блокийн түвшин: ${x.prog.levels.map((l) => `${l.label} ${l.range}: ${l.n}`).join('; ')}`);
  L.push(`## 04. Багцын санхүү`);
  L.push(`Гэрээний нийт: ${num(x.fin.planTotal)} ₮; олгосон: ${num(x.fin.given)} ₮ (${x.fin.share == null ? '—' : pct(x.fin.share, 1)}); үлдэгдэл: ${num(x.fin.remain)} ₮`);
  for (const r of x.fin.rows) L.push(`- ${cl(r.label)}: гэрээ ${num(r.plan)} ₮, олгосон ${num(r.given)} ₮ (${r.pct == null ? '—' : pct(r.pct, 1)})`);
  L.push(`## Зөвшөөрөл`);
  if (!x.zov) L.push(`Мэдээлэлгүй (үйлчилгээ холбогдоогүй).`);
  else {
    L.push(`Нийт ${x.zov.total}: зөвшөөрсөн ${x.zov.ok}, хүлээгдэж буй ${x.zov.wait}, зөвшөөрөөгүй ${x.zov.no}, танигдаагүй ${x.zov.unknown}`);
    for (const g of x.zov.byBagts) L.push(`- ${cl(g.bagts)}: ${g.ok}/${g.total} зөвшөөрсөн, ${g.wait} хүлээгдэж, ${g.no} зөвшөөрөөгүй`);
    for (const i of x.zov.issues.slice(0, 20)) L.push(`  · ${cl(i.bagts)} · ${cl(i.shat)}-р шат · ${cl(i.ner)} — ${cl(i.tolov)} (${cl(i.baiguullaga) || '—'})`);
  }
  return L.join('\n');
}

const SYSTEM = `Чи «Сэлбэ ухаалаг хот» төслийн удирдлагын тайлангийн туслах. Хэрэглэгч чамд төслийн дөрвөн дашбоардын ӨНӨӨДРИЙН тоог өгнө. Чи шийдвэр гаргагчид (хотын удирдлага, төслийн захирал) зориулсан ТОВЧ, ОЙЛГОМЖТОЙ дүгнэлт МОНГОЛООР бичнэ.

ХАТУУ ДҮРЭМ:
1. ЗӨВХӨН өгөгдсөн тоог хэрэглэ. Тоо зохиохгүй, таамаглахгүй, гаднын мэдлэг нэмэхгүй.
2. «мэдээлэлгүй» гэсэн зүйлийг 0 гэж бүү ойлго — «мэдээлэл алга» гэж ил хэл.
3. Хувь нь өгөгдсөн хэлбэрээрээ (аравтын нэг орон) — бүхэлчлэхгүй.
4. Бүтэц: (а) «Гол дүгнэлт» — 3–5 өгүүлбэр; (б) «Анхаарах асуудал» — хамгийн ихдээ 5 зүйл, чухлаас нь эхэлж; (в) «Санал болгох шийдвэр» — 2–4 зүйл, тус бүр нэг өгүүлбэр.
5. Markdown ГАРЧИГ, ТОД, ХҮСНЭГТ хэрэглэхгүй — зөвхөн энгийн текст, мөр бүр «•»-ээр эхэлсэн жагсаалт. Хэсгийн нэрийг мөрийн эхэнд том үсгээр, ард нь хоёр цэг.
6. Нийт 220 үгээс хэтрэхгүй.`;

/**
 * AI дүгнэлт — реле (`agent-proxy`) → Anthropic. Хэрэгсэлгүй, нэг эргэлт:
 * бүх тоо аль хэдийн `execFacts`-д байгаа тул загвар ArcGIS руу хандах
 * шаардлагагүй. Ингэснээр хариулт хурдан, тоо нь дэлгэцтэй ЯГ ижил.
 *
 * ⚠️ `agent/client.ask` ХЭРЭГЛЭХГҮЙ: тэр нь 4 хэрэгсэлтэй агентын гогцоо
 *    бөгөөд загвар өөрөө давхарга шалгаж, тайлангийнхаас ӨӨР тоо олж
 *    ирэх эрсдэлтэй.
 */
export async function askExecSummary(x: ExecReport, signal?: AbortSignal): Promise<string> {
  /* ⚠️ Токенгүй үед толгойг ОГТ нэмэхгүй (`agent/client.callRelay`-тай ижил) */
  const token = await arcgisToken();
  const res = await fetch(`${AGENT_API}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-arcgis-token': token } : {}),
    },
    body: JSON.stringify({
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Огноо: ${new Date().toISOString().slice(0, 10)}.\n\n${execFacts(x)}`,
      }],
    }),
    signal,
  });
  const reply = (await res.json().catch(() => ({}))) as {
    content?: { type: string; text?: string }[]; error?: string; note?: string; stop_reason?: string;
  };
  if (!res.ok) {
    throw new Error(reply.error ?? (res.status === 401
      ? tr('AI үйлчилгээний түлхүүр буруу байна.')
      : tr('Реле алдаа (HTTP {0})', res.status)));
  }
  if (reply.stop_reason === 'refusal') return reply.note ?? tr('Энэ хүсэлтэд хариулах боломжгүй байна.');
  const text = (reply.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
  return text || tr('Хариулт хоосон ирлээ.');
}
