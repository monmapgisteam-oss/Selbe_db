'use client';

import { useState, useEffect, useMemo, useRef, Fragment, type MouseEvent, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Data, Empty } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { cached } from '@/lib/live';

/**
 * ӨДӨР ТУТАМ ЗАСАГДДАГ хүснэгтийн кэшийн хугацаа.
 *
 * ⚠️ 5 минут байсныг 1 минут болгов (2026-08-28). Хоёр өөр эрсдэл бий:
 *   · ӨӨРИЙН засвар — `invalidate()` шууд харуулна, TTL хамаагүй.
 *   · ӨӨР ХЭРЭГЛЭГЧИЙН засвар — зөвхөн TTL л барина. IPC/CASHFLOW нь өдөр
 *     бүр олон хүн засдаг тул 5 минут нь хоёр хүн ЗӨРСӨН тоо хараад маргах
 *     хангалттай урт хугацаа.
 *
 * ⚠️ Илүү богиносговол ашиг бага, зардал их: хүснэгт бүтнээрээ (257 талбар)
 * татагддаг тул минутанд нэгээс олон удаа татах нь сүлжээг дэмий эзэлнэ.
 */
const LIVE_TTL = 60_000;
import { loadBlockHistory } from '@/lib/blockProgress';
import {
  CASHFLOW2, CASHFLOW_NEW, IPC_LOG, TASK_SHEET, bagtsKey, blockKey, pkgKeyOf, cfMonthAxis, cfMonthKey, ipcNet,
} from '@/lib/services';
import { finFieldLabel } from '@/lib/financeFieldLabels';
import { useColWidths } from '@/modules/sheet/colWidths';
import {
  FIN_FACETS, EMPTY_FILTER, isDirty as filterDirty,
  facetValues, distinct, rowMatches,
  type FinFilter, type Facet, type FacetKey,
} from '@/lib/finFilter';
import {
  buildGroups, type FinKind, type GroupRow,
} from '@/lib/finGroup';
import {
  CF_PERIOD_FIELDS, IPC_MAIN_FIELDS, splitContracts, sumOrNull, groupPeriodsByYear,
  usedFields, CF_KPI_FIELDS, CF_PASS_GROUPS,
  dedOrNull, paidOrNull, netOrNull, netTotalOrNull,
} from '@/lib/finCard';
import { mnt, num, text, cat } from '@/lib/format';
import { fitLabels, textW, useChartWidth } from '@/lib/chartFit';
import { ResizableTable } from '@/components/ResizableTable';
import { applyAll } from '@/lib/tableWrite';
import { invalidate, type DataKey } from '@/lib/dataBus';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import f from './finance.module.css';

/* ═══════════════════════════════════════════════════════════
   САНХҮҮЖИЛТ — CASHFLOW (төлөвлөгөө) + IPC (олгосон акт).
   МӨР (гэрээ/багц) БҮРД тусдаа график: сар бүр хэдэн хувьд гүйцэтгэж,
   хэдэн төгрөг ТӨЛӨВЛӨСӨН (PLAN слот) ба IPC-ээр хэдийг ОЛГОСОН (ACT слот).
   ═══════════════════════════════════════════════════════════ */

/** Утгыг тоо руу — ArcGIS Double эсвэл "0" мэт мөр ирдэг */
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** IPC огноог "YYYY-MM" болгох ("2026.05.04" ба "2026-05-04" 2-уул) */
/**
 * IPC-ийн огнооноос «YYYY-MM» сар гаргана.
 *
 * ⚠️ Живэ хүснэгтэд ГУРВАН формат зэрэг явдаг (2026-08-29-нд хэмжсэн):
 *   · `2025-12-28` (ISO) — 62 мөр
 *   · `5/27/2026` (АМЕРИКАН M/D/YYYY) — 7 мөр: хуучин parser таньдаггүй
 *     тул эдгээр акт дараагийн талбар руу унаж, БУРУУ САРД бүртгэгддэг байв
 *   · `20026-06-30` (алдаатай он) — хуучин regex дундаас нь «0026-06» гэж
 *     таслаад ТӨСЛИЙН ЭХНИЙ САР руу clamp-ладаг байв
 * Оны утгыг 2000–2100 мужид шалгана — гажигтай нь `null` буцаж, дараагийн
 * (ихэвчлэн зөв) огнооны талбар хэрэглэгдэнэ.
 */
function ym(v: unknown): string | null {
  if (v == null || v === '' || v === 0) return null;
  // ArcGIS-ийн Date талбар — ms epoch тоо
  if (typeof v === 'number' && v > 1e12) {
    const d = new Date(v);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const s = String(v).trim().replace(/\./g, '-');
  const okYear = (y: number) => y >= 2000 && y <= 2100;
  // ISO: оныг мөрийн ЭХНЭЭС барина — «20026…» гэх гажигт дундаас таслахгүй
  let m = s.match(/^(\d{4})-(\d{1,2})(?:\D|$)/);
  if (m && okYear(Number(m[1]))) return `${m[1]}-${m[2].padStart(2, '0')}`;
  // Американ: M/D/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m && okYear(Number(m[3]))) return `${m[3]}-${m[1].padStart(2, '0')}`;
  return null;
}

/**
 * ⚠️ 2026-08-18: багцын түлхүүр нь `bagtsKey` (services.ts) — ЛОКАЛ `pkgKey`
 * хасагдав. Тэр нь цэгийг үлдээж, зурааныг хаядаг байсан тул «БАГЦ-3.1»
 * (/107 IPC) ба «Багц 3-1» (/106 Cashflow) хоёр өөр түлхүүр болж, тухайн
 * гэрээний «Өссөн олгосон» багана чимээгүй алга болдог байв. `phys`/`PhysMap`
 * аль хэдийн `bagtsKey` хэрэглэдэг байсан — одоо гурвуулаа НЭГ дүрэмтэй.
 */

/*
 * ⚠️ 2026-08-31: `isRealAct` ХАСАГДАВ. Хуучин `IPC_/107`-д 90 мөрийн 31 нь акт
 * БИШ байсан («Contract Price» псевдо-мөр, дугааргүй/дүнгүй мөр) тул дуудагч
 * бүр /^(IPC|APC|АРС)\d+/ шүүлт хийх ёстой байв. `ipc_0813`-ийн 59 мөр БҮГД
 * жинхэнэ акт — шүүлт хэрэггүй болоод зогсохгүй, шинэ `IPC03` нь багцын НЭР
 * тул хуучин шүүлт үлдвэл БҮХ мөрийг чимээгүй хаяна.
 */

/**
 * S-муруйн гурван цуваа — баталгаажсан палитрын слотууд.
 *
 * ⚠️ 2026-08-17: Урьд нь тогтмол hex байсан (`#0891b2 / #22c55e / #a855f7`) —
 * хоёр асуудалтай: горим дагадаггүй, мөн `#22c55e`/`#a855f7` нь цагаан дээр
 * 2.0–3.4:1 буюу хэмжээст тэмдэгт болоход сул.
 *
 * ⚠️ 2026-08-18: слот 1/4/7 → 1/2/3. Гурван цуваа нь графикт ЗЭРЭГЦЭЭ орох тул
 * аль ч хоёр нь зэрэгцэж болно — палитрын эхний ГУРВАН слот нь CVD-ийн
 * шалгуурт хамгийн сайн салгагдсан дараалал (усан цэнхэр · улбар шар · индиго).
 * Хуучин 1/4/7 нь усан цэнхэр↔ногоонийг зэрэгцүүлж, өнгө ялгах бэрхшээлтэй
 * хэрэглэгчид төлөвлөгөө/санхүүжилт хоёрыг ялгахад хүндрэлтэй байв.
 * ⚠️ Эдгээр нь `var(--cN)` буцаадаг тул ЗӨВХӨН CSS контекстэд ажиллана — энэ
 * файлын SVG будаг бүхэн `style={{ fill/stroke }}` руу шилжсэн (presentation
 * ШИНЖ дотор `var()` задардаггүй).
 */
const PLAN = cat(2); // төлөвлөгөөт өссөн % — индиго (суурь лавлагаа)
const ACT = cat(0); // олгосон санхүүжилтийн өссөн % — усан цэнхэр (аппын акцент)
const PHYS = cat(1); // биет гүйцэтгэлийн % — улбар шар (муруй, хоёуланаас тодрох)

type Row = Record<string, unknown>;

/** Нэг сарын цэг: төлөвлөгөө + олгосон + биет гүйцэтгэл */
export type MonthPt = {
  label: string; // «2025-10»
  amount: number; // тухайн сард авах санхүүжилт ₮ (төлөвлөгөө)
  amountCum: number; // өссөн төлөвлөгөө ₮
  cumPct: number; // өссөн гүйцэтгэлийн хувь (0–100)
  given: number; // тухайн сард IPC-ээр олгосон ₮ (net)
  /**
   * Сарын эцсийн байдлаарх БИЕТ гүйцэтгэл, % («Гүйцэтгэл бөглөх»).
   *
   * ⚠️ `null` = ТУХАЙН САРД ДАТА АЛГА. Энэ нь 0%-ЭЭС ЯЛГААТАЙ: 0% гэдэг нь
   *    «ажил эхлээгүй» гэсэн ХЭМЖИЛТ, null нь «хэмжигдээгүй» гэсэн үг.
   *    Урьд нь хоёуланг нь 0 гэж нэгтгэдэг байсан тул бөглөгдөөгүй багцын
   *    график дээр «Бодит гүйцэтгэл» ба «Зөрүү» шугам ОГТ зурагдахгүй,
   *    гэхдээ тайлбар нь тэдгээрийг амлаад зогсдог байв — хэрэглэгч
   *    графикийг эвдэрсэн гэж үздэг (2026-08-27).
   */
  phys: number | null;
};

/** Багц бүрийн IPC: сар → олгосон нийлбэр */
export type GivenMap = Map<string, Map<string, number>>;

/** Багц бүрийн биет гүйцэтгэл: сар → % (блокуудын дундаж, тухайн сарын эцсээр) */
export type PhysMap = Map<string, Map<string, number>>;

/**
 * `physCnt` — багц бүрийн сар тутмын БЛОКИЙН ТОО (phys дундаж хэдэн блокоос гарсан).
 * Төслийн нэгтгэсэн биет гүйцэтгэлийг багцуудаар блок-жигнэхэд (давхар дунджийг
 * зайлсхийхэд) ашиглана — `phys`-ийн утгыг ХӨНДӨХГҮЙ, зэрэгцээ мэдээлэл.
 */
export type FinData = {
  /**
   * ГЭРЭЭНИЙ мастер мөрүүд (76) — `CF002='ГЭРЭЭ'`.
   *
   * ⚠️ 2026-08-31: `cashflow_0813` нь 209 мөртэй бөгөөд гэрээ бүр 1 мастер +
   *    үеийн мөрүүдтэй. Энэ талбар нь ЗӨВХӨН мастер мөрүүдийг агуулна —
   *    гэрээний тоо/төсвийг шүүлтгүй нийлбэрлэвэл 209 мөр тоологдоно.
   */
  contracts: Row[];
  /** Хэмжилттэй үеийн мөрүүд (133) — САР + ӨМНӨХ ШИЛЖҮҮЛСЭН */
  periods: Row[];
  /**
   * Гэрээний код (CF001) → «2026-08» → тухайн сарын ТӨЛӨВЛӨГӨӨТ дүн (CF009).
   *
   * ⚠️ Хуваарь нь одоо багана биш МӨР тул гэрээний сарын дүнг энэ индексээс
   *    авна. Хэмжилтгүй сард мөр БАЙХГҮЙ (2026-01 бүхэлдээ алга) — тэнхлэгийг
   *    `cfMonthAxis()`-ээс аваад дутуу сарыг 0-ээр нөхнө.
   */
  plan: Map<string, Map<string, number>>;
  given: GivenMap;
  /**
   * Багц → нийт олгосон (цэвэр) дүн — ОГНООГҮЙ актыг ч ОРУУЛНА.
   *
   * ⚠️ 59 актын 29-д ямар ч огноо алга (нэг нь 9.4 тэрбумтай). Тэдгээрийг
   *    `given`-ий сарын цуваанд оруулбал сүүлийн сар дээр хуурамч оргил
   *    үүснэ (null ≠ 0), огт хаявал нийт дүн дутна — тиймээс цуваанаас
   *    хасаж, НИЙЛБЭРТ энд үлдээв.
   */
  givenTotal: Map<string, number>;
  phys: PhysMap;
  physCnt: PhysMap;
  /**
   * ГҮЙЦЭТГЭЛИЙН АКТУУД (IPC) — түүхий мөрүүд.
   *
   * ⚠️ `given` нь актуудыг сар бүрийн НИЙЛБЭР болгож хураадаг тул
   *    акт бүрийн дугаар, хамрах хугацаа, барьцаа, үлдэгдэл алдагддаг.
   *    Санхүүгийн дэлгэрэнгүйд «энэ мөнгө ЯМАР актаар олгогдсон бэ»
   *    гэдэг нь гол мөрдөх мөр тул түүхий мөрийг ХАДГАЛНА.
   */
  acts: Row[];
};

// ═══════════════════════════════════════════════════════════
//  КОМБО ГРАФИК (envhub хэлээр) — градиентгүй, glow-гүй хавтгай дүрслэл.
//  ГУРВАН шугам давхацна: төлөвлөгөө (PLAN) · олгосон санхүүжилт (ACT —
//  нарийн, цэгтэй; 2026-08-21-нд багана байсныг шугам болгов) · биет (PHYS).
//  X тэнхлэгт он сар + өссөн хувиуд цуваа өөрийн слотын өнгөөр.
// ═══════════════════════════════════════════════════════════

export function ComboChart({
  items,
  height = 280,
  lagMonth,
  lagLvl,
  hidePhys = false,
}: {
  items: MonthPt[];
  height?: number;
  /** Хоцрогдол хэмжсэн сар — тэр сарын БИЕТ багана анивчина */
  lagMonth?: string;
  lagLvl?: 'red' | 'yellow' | null;
  /**
   * БИЕТ гүйцэтгэлийн цуваа, шошго, тултипын мөрийг НУУНА.
   *
   * ⚠️ 2026-08-21: «Багцын санхүү» харагдац нь ЗӨВХӨН мөнгөний асуултад
   * хариулна — биет явц нь «Багцын гүйцэтгэл» талд. Цувааг нууснаар график
   * төлөвлөгөө/олголтын хоёр шугам болж, уншихад ойлгомжтой болно.
   */
  hidePhys?: boolean;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const N = items.length;

  // ── Өссөн S-муруйн өгөгдөл — ₮ ТЭНХЛЭГ (нэг тэнхлэг): төлөвлөгөө · санхүүжилт · биет.
  //    Мөнгө нь ₮-ээр (хуучинтай адил утга); биет нь ₮ өндөртэй ч %-аар шошголно. ──
  const totalPlan = Math.max(1, ...items.map((i) => i.amountCum));
  const yMax = totalPlan;
  let gsum = 0;
  const rows = items.map((it) => {
    gsum += it.given;
    return {
      label: it.label,
      planned: it.amountCum, // өссөн төлөвлөгөө ₮
      financing: gsum, // өссөн олгосон санхүүжилт ₮
      // ⚠️ Дата алга (null) бол 0 өндөртэй цэг зурвал «биет гүйцэтгэл тэг»
      //    гэсэн ХУДАЛ уншилт өгнө — доорх `lastPhys` нь ийм саруудыг алгасна.
      physical: ((it.phys ?? 0) / 100) * totalPlan, // биет гүйцэтгэлийн үнэ цэнэ ₮
      physPct: it.phys, // шошго/тултипт харуулах биет % (null = хэмжигдээгүй)
      givenCum: gsum,
      it,
    };
  });
  // Бодит муруйнууд (санхүүжилт, биет) зөвхөн ОДОО хүртэл; төлөвлөгөө л дуустал хүрнэ
  let lastPhys = -1;
  // ⚠️ `> 0` БИШ `!= null`: жинхэнэ 0% (ажил эхлээгүй) нь ХЭМЖИЛТ мөн тул
  //    муруй түүнээс эхлэх ёстой. Урьд нь эхний бодит тэгүүд таслагдаж,
  //    муруй хожуу сараас эхэлдэг байв.
  rows.forEach((r, i) => { if (r.physPct != null) lastPhys = i; });
  // Нуусан үед сүүлийн биет цэгийг -1 болгоно — доорх бүх зурах нөхцөл унтарна
  if (hidePhys) lastPhys = -1;

  /*
   * ── ХЭМЖЭЭ ─────────────────────────────────────────────────────────────
   * ⚠️ Тоон шошгыг ЦЭГ БҮР дээр бичихээ БОЛИВ (2026-08-25). 12 сар × 3 цуваа =
   *    36 шошго нь муруйг бүрхэж, хоорондоо мөргөлдөж, графикийг «тоонуудын
   *    хана» болгодог байв. Одоо: ЗӨВХӨН сүүлийн цэг тогтмол бичигдэнэ, бусад
   *    нь hover дээр tooltip-д гарна. Муруй өөрөө үлдэнэ — график нь ЧИГ
   *    ХАНДЛАГЫГ хэлэх ёстой, задаргааг tooltip хэлнэ.
   */
  /**
   * ⚠️ БОДИТ ӨРГӨН (px) — виртуал 1600 БИШ. Урьд нь `preserveAspectRatio="none"`
   * нь виртуал өргөнийг бодит рүү сунгадаг байсан тул үсэг нь хэвтээгээр
   * шахагдаж («1,176,410,780,272» нарийсаад) уншигдахаа больдог байв. Одоо
   * 1 нэгж = 1px: гажилт алга, мөн шошгын мөргөлдөөнийг ЖИНХЭНЭ пикселээр
   * тооцоолж болно (`fitLabels`).
   */
  const W = useChartWidth(wrapRef, 1600);
  const H = height;
  /**
   * Зүүн зай — Y тэнхлэгийн шошгын ТУСДАА багана.
   * ⚠️ 2026-09-01: урьд нь 8 байсан бөгөөд шошго нь торны ДЭЭР наалддаг байв
   *    (богино «2.66 их н.» тул зүгээр байсан). Мөнгөн дүн бүтнээр бичигдэх
   *    болсноор «2,660,000,000,000» нь муруйн эхний саруудыг халхалдаг тул
   *    тусдаа багана гаргав. 1600 виртуал өргөний 8% — муруйд мэдэгдэхүйц
   *    нөлөөгүй, харин тоо бүтнээрээ уншигдана.
   */
  /* ⚠️ Хамгийн урт Y шошгоос БОДОГДОНО — «1,176,410,780,272» (17 тэмдэгт)
     нь ~105px. Тогтмол 128 нь өөр төслийн дүнгийн урттай тааруулагдаагүй
     байсан: богино дүнд хоосон зай, урт дүнд тайралт үүсгэнэ. */
  const padL = Math.round(textW(num(yMax)) + 16);
  const padR = 30;  // баруун — сүүлийн шошгыг багтаах зай
  const padT = 26;
  const padB = 30;  // доор — ЗӨВХӨН он сар (хувиуд tooltip руу шилжсэн)

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xFor = (i: number) => padL + (N <= 1 ? plotW / 2 : (i / (N - 1)) * plotW);
  const yFor = (v: number) => padT + (1 - Math.max(0, Math.min(yMax, v)) / yMax) * plotH;

  /* Сүүлийн УТГАТАЙ цэгүүд — тэдгээр дээр л шошго, том цэг үлдэнэ */
  const lastPlan = rows.reduce((a, r, i) => (r.planned > 0 ? i : a), -1);
  const lastGiven = rows.reduce((a, r, i) => (r.givenCum > 0 ? i : a), -1);

  /* Цэгүүдийг нэг л удаа бодно — зам, талбай, шошго бүгд эндээс */
  const planPts = rows.slice(0, lastPlan + 1).map((r, i) => ({ x: xFor(i), y: yFor(r.planned) }));
  const givenPts = rows.slice(0, lastGiven + 1).map((r, i) => ({ x: xFor(i), y: yFor(r.givenCum) }));
  const physPts = rows.slice(0, lastPhys + 1).map((r, i) => ({ x: xFor(i), y: yFor(r.physical) }));

  /*
   * ── ЗӨРҮҮГИЙН ТАЛБАЙ ──────────────────────────────────────────────────
   * ⚠️ Энэ графикийн ГОЛ өгүүлэмж нь «төлөвлөгөө ба бодит олголтын хооронд
   *    хэдий хэмжээний зай байна вэ» — хоёр шугам ойрхон явахад тэр зай нүдэнд
   *    ОГТ баригддаггүй байв. Хооронд нь будсанаар зөрүү нь ХЭМЖЭЭ болж
   *    харагдана: талбай өргөсөх тусам хоцрогдол их.
   */
  const gapArea = givenPts.length > 1
    ? smoothPath(planPts.slice(0, givenPts.length))
      + ' L ' + [...givenPts].reverse().map((q) => q.x.toFixed(1) + ' ' + q.y.toFixed(1)).join(' L ')
      + ' Z'
    : '';

  /* ⚠️ ЗУРАГЛАЛ нь ГРАФИКИЙН ТАЛБАЙГААР, бүрхүүлийн бүтэн өргөнөөр БИШ:
     зүүн талд Y тэнхлэгийн ~120px багана, баруунд 30px зай бий. Бүтэн
     өргөнөөр бодоход заагуурын босоо шугам хулганаас нэг хүртэл сараар
     хазайж, tooltip нь өөр сарын тоог үзүүлдэг байв. */
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - r.left - padL) / Math.max(1, plotW);
    setHi(Math.max(0, Math.min(N - 1, Math.round(t * (N - 1)))));
  };
  const pt = hi != null ? rows[hi] : null;

  const anchorFor = (i: number): 'start' | 'middle' | 'end' => (i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle');

  /*
   * ── ШОШГЫН БАГТААМЖ ──
   * ⚠️ 2026-09-03: урьд нь `ceil(N/8)` гэсэн ТОГТМОЛ АЛХМААР сонгодог байсан
   *    бөгөөд дээрээс нь сүүлийн цэгийг үргэлж нэмдэг байв. N=12 үед алхам 2
   *    болж, 10 ба 11-р цэг ЗЭРЭГЦЭЭ шошготой болно: 17 оронтой дүн ~105px
   *    эзэлдэг атлаа цэг хоорондын зай ердөө ~104px тул хоёр тоо дээр
   *    дээрээсээ давхарлан бичигддэг байлаа. Одоо ЖИНХЭНЭ өргөнөөр нь хэмжиж,
   *    багтахыг нь л үлдээнэ (`fitLabels`) — эхэн ба төгсгөл хэвээр.
   * ⚠️ Цуваа бүр ТУСДАА: төлөвлөгөө муруйнхаа дээр, олголт доор бичигддэг тул
   *    хоорондоо мөргөлдөхгүй; нэг цувааны дотор л зай шалгах ёстой.
   */
  const fitFor = (last: number, valOf: (r: typeof rows[number]) => string) => new Set(
    fitLabels(rows.slice(0, last + 1).map((r, i) => ({
      i,
      x: xFor(i),
      w: textW(valOf(r)),
      anchor: anchorFor(i),
    }))),
  );
  const planLbl = fitFor(lastPlan, (r) => num(r.planned));
  const givenLbl = fitFor(lastGiven, (r) => num(r.givenCum));
  const physLbl = fitFor(lastPhys, (r) => `${r.physPct?.toFixed(0) ?? ''}%`);
  /* X тэнхлэгийн он·сар — «2026-09» тогтмол 7 тэмдэгт */
  const axisLbl = new Set(fitLabels(rows.map((r, i) => ({
    i, x: xFor(i), w: textW(r.label, 11), anchor: anchorFor(i),
  })), 14));

  return (
    <div className={f.chartWrap} ref={wrapRef} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
      <svg
        className={f.comboSvg}
        style={{ height: H }}
        viewBox={`0 0 ${W} ${H}`}
        /* ⚠️ `preserveAspectRatio="none"` ХАСАГДСАН: `viewBox` нь одоо бодит
           пикселтэй тэнцүү тул сунгах шаардлагагүй — үсэг гажихаа болив. */
        role="img"
        aria-label={tr('Санхүүжилтийн явц: төлөвлөсөн, олгосон, биет гүйцэтгэл')}
      >
        {/* ── ТОР ба Y тэнхлэг ──
            ⚠️ 2026-09-01: шошго нь урьд торны ДЭЭР, зүүн ирмэгт наалддаг байсан
            (богино товчилсон дүн тул зай эдийг нь хэмнэдэг байв). Дүн бүтнээр
            бичигдэх болсноор муруйн эхлэлийг халхалдаг тул ТУСДАА багана
            (`padL`) гаргаж, баруун зэрэгцүүлэв. Мөн 5 биш 4 шугам — нягт тор
            нь өгөгдлөөс илүү анхаарал татдаг. */}
        {[0, 1 / 3, 2 / 3, 1].map((t) => {
          const gy = yFor(t * yMax);
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={gy} y2={gy} className={f.curveGrid} />
              <text x={padL - 8} y={gy + 3} className={f.sAxisY} textAnchor="end">
                {t === 0 ? '0' : num(t * yMax)}
              </text>
            </g>
          );
        })}

        {/* ЗӨРҮҮГИЙН ТАЛБАЙ — төлөвлөгөө ба олголтын хоорондох зай */}
        {gapArea && <path d={gapArea} className={f.gapArea} style={{ fill: PLAN }} />}

        {/* ХОЦРОГДСОН САР — тасархай босоо шугам + лугшдаг цэг */}
        {lagMonth != null && lagLvl != null && (() => {
          const li = rows.findIndex((r) => r.label === lagMonth);
          if (li < 0) return null;
          const color = lagLvl === 'red' ? 'var(--bad)' : 'var(--warn)';
          const cx = xFor(li);
          return (
            <g>
              <line
                x1={cx} x2={cx} y1={padT} y2={padT + plotH}
                stroke={color} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.45}
              />
              {rows[li].physPct != null && (
                <circle
                  cx={cx} cy={yFor(rows[li].physical)} r={5} fill={color}
                  className={lagLvl === 'red' ? f.barBlinkRed : f.barBlinkYellow}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })()}

        {/* ── МУРУЙНУУД ──
            Төлөвлөгөө нь ЛАВЛАГАА тул нимгэн, тасархай; бодит олголт нь ГОЛ
            хариулт тул зузаан, бүтэн. Урьд нь хоёулаа ижил зузаантай байсан
            тул аль нь баримт, аль нь зорилт болох нь ялгардаггүй байв. */}
        {planPts.length > 1 && (
          <path d={smoothPath(planPts)} className={f.planLine} style={{ stroke: PLAN }} vectorEffect="non-scaling-stroke" />
        )}
        {givenPts.length > 1 && (
          <path d={smoothPath(givenPts)} className={f.actLine} style={{ stroke: ACT }} vectorEffect="non-scaling-stroke" />
        )}
        {physPts.length > 1 && (
          <path d={smoothPath(physPts)} className={f.physLine} style={{ stroke: PHYS }} vectorEffect="non-scaling-stroke" />
        )}

        {/* ── ЦЭГ БҮР ДЭЭР УТГА ──
            ⚠️ Зөвхөн эцсийн утга үзүүлэх нь БУРУУ байв: 12 сарын урт графикийг
               гаргаад ганц тоо уншуулах юм бол график хэрэггүй. Сар бүрийн
               утга нүдэнд харагдах ёстой.
            ⚠️ Мөргөлдөхөөс сэргийлэх дүрэм: төлөвлөгөө нь муруйнхаа ДЭЭР,
               олголт нь ДООР бичигдэнэ — хоёр цуваа ойртсон ч давхцахгүй.
               Биет нь олголттой ойрхон явдаг тул мөн доор, илүү зайтай. */}
        {rows.map((r, i) => {
          if (i > lastPlan || r.planned <= 0 || !planLbl.has(i)) return null;
          const x = xFor(i);
          const y = yFor(r.planned);
          return (
            <g key={`pl-${i}`}>
              <circle cx={x} cy={y} r={3} className={f.sDot} style={{ fill: PLAN }} vectorEffect="non-scaling-stroke" />
              {/* ⚠️ y-г 12-оос дээш барина: дээд ирмэгт хүрсэн цэгийн шошго
                  SVG-ийн гаднаас тасарч, тоо хагас харагддаг байв. */}
              <text x={x} y={Math.max(12, y - 9)} className={f.ptVal} style={{ fill: PLAN }} textAnchor={anchorFor(i)}>
                {num(r.planned)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          if (i > lastGiven || r.givenCum <= 0 || !givenLbl.has(i)) return null;
          const x = xFor(i);
          const y = yFor(r.givenCum);
          return (
            <g key={`gv-${i}`}>
              <circle cx={x} cy={y} r={3} className={f.sDot} style={{ fill: ACT }} vectorEffect="non-scaling-stroke" />
              <text x={x} y={Math.min(padT + plotH - 4, y + 16)} className={f.ptVal} style={{ fill: ACT }} textAnchor={anchorFor(i)}>
                {num(r.givenCum)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          // ⚠️ `== null` (`<= 0` БИШ): 0% нь бодит хэмжилт тул шошготой байна
          if (i > lastPhys || r.physPct == null || !physLbl.has(i)) return null;
          const x = xFor(i);
          const y = yFor(r.physical);
          return (
            <g key={`ph-${i}`}>
              <circle cx={x} cy={y} r={3} className={f.sDot} style={{ fill: PHYS }} vectorEffect="non-scaling-stroke" />
              <text x={x} y={Math.min(padT + plotH - 4, y + 28)} className={f.ptVal} style={{ fill: PHYS }} textAnchor={anchorFor(i)}>
                {r.physPct?.toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* ── HOVER — босоо шугам + цуваа бүрийн цэг ── */}
        {hi != null && (
          <g>
            <line x1={xFor(hi)} x2={xFor(hi)} y1={padT} y2={padT + plotH} className={f.curveCursor} />
            {rows[hi].planned > 0 && hi <= lastPlan && (
              <circle cx={xFor(hi)} cy={yFor(rows[hi].planned)} r={4} className={f.sDot} style={{ fill: PLAN }} vectorEffect="non-scaling-stroke" />
            )}
            {hi <= lastGiven && (
              <circle cx={xFor(hi)} cy={yFor(rows[hi].givenCum)} r={4} className={f.sDot} style={{ fill: ACT }} vectorEffect="non-scaling-stroke" />
            )}
            {hi <= lastPhys && rows[hi].physPct != null && (
              <circle cx={xFor(hi)} cy={yFor(rows[hi].physical)} r={4} className={f.sDot} style={{ fill: PHYS }} vectorEffect="non-scaling-stroke" />
            )}
          </g>
        )}

        {/* ── X тэнхлэг — ЗӨВХӨН он сар. Хоёр хувийн мөр tooltip руу шилжсэн:
            тэдгээр нь харьцуулах биш, лавлах тоо тул байнга харагдах шаардлагагүй
            бөгөөд график доор гурван мөр эзэлж, муруйд өгөх зайг иддэг байв. */}
        {rows.map((r, i) => (axisLbl.has(i) ? (
          <text key={r.label} x={xFor(i)} y={H - 10} className={f.axisX} textAnchor={anchorFor(i)}>
            {r.label}
          </text>
        ) : null))}
      </svg>

      {/* ── TOOLTIP — задаргаа бүхэлдээ энд ── */}
      {pt && (
        <div
          className={f.tip}
          style={{ left: `${(hi! / Math.max(1, N - 1)) * 100}%`, transform: `translateX(${hi! < N / 2 ? '10px' : 'calc(-100% - 10px)'})` }}
        >
          <p className={`num ${f.tipHd}`}>{pt.label}</p>
          <p className={f.tipRow}><i style={{ background: PLAN }} />{tr('Төлөвлөсөн санхүүжилт')}<b className="num">{pt.planned > 0 ? mnt(pt.planned) : '—'}</b></p>
          <p className={f.tipRow}><i style={{ background: ACT }} />{tr('Олгосон санхүүжилт')}<b className="num">{pt.givenCum > 0 ? mnt(pt.givenCum) : '—'}</b></p>
          {!hidePhys && <p className={f.tipRow}><i style={{ background: PHYS }} />{/* «—» = ХЭМЖИГДЭЭГҮЙ; жинхэнэ 0% нь «0.0%» гэж гарна */}
            {tr('Биет гүйцэтгэл')}<b className="num">{pt.physPct == null ? '—' : `${pt.physPct.toFixed(1)}%`}</b></p>}
          <p className={`${f.tipRow} ${f.tipGap}`}>
            {tr('Төлөвлөгөөний биелэлт')}
            <b className="num">{pt.it.cumPct > 0 ? `${pt.it.cumPct.toFixed(1)}%` : '—'}</b>
          </p>
          <p className={f.tipRow}>
            {tr('Олгосон хувь')}
            <b className="num">{pt.planned > 0 ? `${((pt.givenCum / pt.planned) * 100).toFixed(0)}%` : '—'}</b>
          </p>
          {/* ЗӨРҮҮ — графикийн будсан талбайн тоон илэрхийлэл */}
          <p className={f.tipRow}>
            {tr('Олгогдоогүй үлдэгдэл')}
            <b className="num">{pt.planned > pt.givenCum ? mnt(pt.planned - pt.givenCum) : '—'}</b>
          </p>
        </div>
      )}
    </div>
  );
}

/** Catmull-Rom → куб Безье гөлгөрүүлэлт — S-муруй жигд, эвдрэлгүй харагдана */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// ═══════════════════════════════════════════════════════════
//  ДАТА
// ═══════════════════════════════════════════════════════════

/**
 * Санхүүжилтийн бүх дата — CASHFLOW2 (төлөвлөгөө) + IPC (олгосон, цэвэрлэсэн) +
 * TASK_SHEET (биет гүйцэтгэл, сарын эцсийн байдлаар).
 * ⚠️ export — «Барилгын цогц хяналт» (Tsogts) мөн энэ ГАНЦ ачаалагчийг ашиглана.
 * ⚠️ 5 мин кэш (2026-08-21 гүйцэтгэлийн аудит): Нүүр (супер) · Tsogts · Санхүү
 *   гурвуулаа дууддаг тул харагдац сэлгэх бүрд 3 query + O(багц×сар×блок)
 *   тооцоо ДАХИН хийгддэг байв.
 */
export const loadFinData = cached(loadFinDataRaw, LIVE_TTL, ['IPC_LOG', 'CASHFLOW2', 'BAGTS_SHEET']);

/**
 * CASHFLOW2/IPC_LOG-ийн түүхий мөрүүд — НЭГ кэштэй эх (2026-08-24 аудит):
 * урьд нь `loadFinDataRaw` ба `loadFinRegister` ижил хоёр хүснэгтийг тус
 * тусдаа '*'-аар татдаг тул Нүүр (ExecKpi) · Tsogts · Санхүү гурвыг дараалан
 * нээхэд CASHFLOW2/IPC_LOG давхар татагдаж, 6 слотын хязгаарлагчийг дэмий
 * эзэлдэг байв. ⚠️ `outFields: '*'` ХЭВЭЭР — Санхүүгийн бүртгэл (FullTable)
 * үйлчилгээний талбар БҮРИЙГ баганаар харуулдаг тул нарийсгаж болохгүй.
 */
const loadCashflowRows = cached(
  () => queryFeatures(CASHFLOW2.url, { outFields: ['*'], orderBy: `${CASHFLOW2.oid} ASC` }),
  LIVE_TTL,
  ['CASHFLOW2'],
);
/**
 * ГЭРЭЭНИЙ ШИНЭ БҮРТГЭЛ — «Санхүүжилт» табын хүснэгт үүнээс уншина.
 * ⚠️ `loadCashflowRows`-ыг СОЛИХГҮЙ: тэр нь муруй, KPI, тайлангийн тооцоонд
 * хэрэглэгддэг САРЫН мөрүүдийг өгдөг бөгөөд шинэ хүснэгтэд тэдгээр байхгүй.
 */
const loadCashflowNewRows = cached(
  () => queryFeatures(CASHFLOW_NEW.url, { outFields: ['*'], orderBy: `${CASHFLOW_NEW.oid} ASC` }),
  LIVE_TTL,
  ['CASHFLOW_NEW'],
);
const loadIpcRows = cached(
  () => queryFeatures(IPC_LOG.url, { outFields: ['*'] }),
  LIVE_TTL,
  ['IPC_LOG'],
);

async function loadFinDataRaw(): Promise<FinData> {
  const S = TASK_SHEET.fields;
    const [cashflow, ipc, hist] = await Promise.all([
      loadCashflowRows(),
      loadIpcRows(),
      /*
       * БИЕТ ГҮЙЦЭТГЭЛ — блок бүрийн «Б.» мөрийн бүх агшин.
       *
       * ⚠️ 2026-08-25: урьд нь `Selbe_guitsetgel_consolidated`-ээс шууд асуудаг
       *    байв. Тэр хүснэгт CSV-гээр гараар шинэчлэгддэг бөгөөд 2026-07-25-нд
       *    зогссон тул график сарын өмнөх байдлыг үзүүлсээр байлаа. Одоо
       *    `loadBlockHistory()` нь `Bagts_*` бөглөх хуудсуудаас уншдаг болсон —
       *    ижил эх сурвалжийг ДАХИН асуухын оронд түүнийг хуваалцана.
       */
      loadBlockHistory(),
    ]);

    /*
     * ГЭРЭЭ vs ҮЕ — `cashflow_0813` нэг хүснэгтэд хоёр грейн агуулна тул
     * ЭНД САЛГАНА. Дуудагч тал бүрд шүүлт давтуулбал нэг нь мартагдаж
     * гэрээ 209 удаа тоологдоно.
     */
    const CFF = CASHFLOW2.fields;
    const contracts = cashflow.filter((r) => r[CFF.rowType] === CASHFLOW2.rows.master);
    const periods = cashflow.filter((r) => r[CFF.rowType] !== CASHFLOW2.rows.master);

    /* Гэрээ → сар → төлөвлөгөөт дүн */
    const plan = new Map<string, Map<string, number>>();
    periods.forEach((r) => {
      const mon = cfMonthKey(r);
      if (!mon) return; // ӨМНӨХ ШИЛЖҮҮЛСЭН — сарын тэнхлэгт байрлахгүй
      const g = String(r[CFF.geree] ?? '');
      const byMon = plan.get(g) ?? new Map<string, number>();
      byMon.set(mon, (byMon.get(mon) ?? 0) + n(r[CFF.amount]));
      plan.set(g, byMon);
    });

    /*
     * IPC → багц бүрд: сар → олгосон цэвэр дүн.
     *
     * ⚠️ Цэвэр дүн одоо БОДОГДОНО (`ipcNet` = гүйцэтгэлийн дүн − 4 суутгал) —
     *    хуучин хадгалагдсан багана нь засвар бүрд хуучирдаг байсан тул хасав.
     * ⚠️ Огноогүй актыг сарын цуваанд ОРУУЛАХГҮЙ. Хуучин код нь `?? last`-аар
     *    сүүлийн сар руу шахдаг байсан — 29 актын мөнгө нэг сарын нүдэнд
     *    овоорч хуурамч оргил үүсгэнэ. Нийт дүн `givenTotal`-д бүрэн үлдэнэ.
     */
    const F = IPC_LOG.fields;
    /* ⚠️ СУНГАСАН тэнхлэг (cfMonthAxis) — хуваарь 2026-09-өөр төгсдөг тул
       түүнээс хойшхи акт, хэмжилт нүхгүй үлдэж, сүүлийн сард овоорч эсвэл
       царцдаг байв. Сунгалт нь өнөөдрийг хүртэл. */
    const axis = cfMonthAxis();
    const labels = axis.map((m) => m.label);
    const first = labels[0];
    const last = labels[labels.length - 1];
    const given: GivenMap = new Map();
    const givenTotal = new Map<string, number>();
    ipc.forEach((r) => {
      const net = ipcNet(r);
      if (net === 0) return;
      /* Багц: дэд багц (навч) → үндсэн багц. Аль нь ч байхгүй бол гэрээгүй акт. */
      const k = bagtsKey(r[F.pkg2]) || bagtsKey(r[F.pkg]);
      if (!k || k === '0') return;
      givenTotal.set(k, (givenTotal.get(k) ?? 0) + net);
      const raw = ym(r[F.submitDate]) ?? ym(r[F.periodTo]) ?? ym(r[F.approvedDate]) ?? ym(r[F.payDate]);
      if (!raw) return; // огноогүй — цувааны гадна (дээрх ⚠️)
      const mon = raw < first ? first : raw > last ? last : raw;
      const byMon = given.get(k) ?? new Map<string, number>();
      byMon.set(mon, (byMon.get(mon) ?? 0) + net);
      given.set(k, byMon);
    });

    // Биет гүйцэтгэл → багц бүрд: сар → % (блокуудын дундаж, сарын эцсийн байдлаар).
    // Append-лог тул блок бүрийн тухайн сараас өмнөх ХАМГИЙН СҮҮЛИЙН бичилтийг авна.
    const nowYm = new Date().toISOString().slice(0, 7);
    const phys: PhysMap = new Map();
    const physCnt: PhysMap = new Map(); // багц·сар → блокийн тоо (жин)
    {
      // багц → блок → [огноо, гүйцэтгэл][] (огноогоор эрэмбэлсэн)
      const byPkg = new Map<string, Map<string, { d: string; g: number | null }[]>>();
      /*
       * `BlockHistory` нь `${БАГЦ}|${блок}` түлхүүртэй Map — доорх логик УРТ
       * мөр хүлээдэг тул задалж өгнө. Гүйцэтгэл нь 0–100 хувиар ирдэг ч энэ
       * тооцоолол 0–1 бутархайг хүлээдэг тул 100-д хуваана.
       */
      const sheet = [...hist].flatMap(([key, pts]) => {
        const [bg, bl] = key.split('|');
        return pts.map((pt) => ({
          [S.bagts]: bg,
          [S.block]: bl,
          [S.date]: pt.date,
          [S.progress]: pt.pct == null ? null : pt.pct / 100,
        }) as Row);
      });
      sheet.forEach((r) => {
        const k = bagtsKey(r[S.bagts]);
        const d = String(r[S.date] ?? '').slice(0, 10);
        /**
         * ⚠️ `blockKey` (2026-08-24 аудит) — түүхий нэрээр бүлэглэхэд «5/1
         * барилга» ба «5/1 блок» ХОЁР өөр блок болж, хуучирсан 12-р сарын
         * өндөр утга давхар тоологдон Багц 4.1-ийн биет % 29.8 гарч байв
         * (blockProgress-ийн зөв дундаж 21.6) — нэг мөрөнд хоёр өөр тоо.
         */
        const b = blockKey(r[S.block]);
        if (!k || !d || !b) return;
        const blocks = byPkg.get(k) ?? new Map<string, { d: string; g: number | null }[]>();
        const arr = blocks.get(b) ?? [];
        // null = нүд цэвэрлэгдсэн/бөглөгдөөгүй — 0 гэж тоолбол дундаж худал буурна
        arr.push({ d, g: r[S.progress] == null ? null : n(r[S.progress]) });
        blocks.set(b, arr);
        byPkg.set(k, blocks);
      });
      byPkg.forEach((blocks, k) => {
        const byMon = new Map<string, number>();
        const cntMon = new Map<string, number>();
        axis.forEach((m) => {
          if (m.label > nowYm) return; // ирээдүйн сард биет дата байхгүй
          let sum = 0;
          let cnt = 0;
          blocks.forEach((arr) => {
            // тухайн сарын эцсээс өмнөх сүүлийн бичилт
            let best: { d: string; g: number | null } | null = null;
            arr.forEach((e) => {
              if (e.d.slice(0, 7) <= m.label && (!best || e.d > best.d)) best = e;
            });
            // Сүүлийн бичилт нь null бол блок «мэдээлэлгүй» — дунджид ОРУУЛАХГҮЙ
            // (blockProgress.compute-ийн дүрэмтэй ижил: 0% гэж будвал худал мэдээлэл)
            const g = (best as { d: string; g: number | null } | null)?.g;
            if (g != null) {
              sum += g;
              cnt++;
            }
          });
          if (cnt > 0) { byMon.set(m.label, (sum / cnt) * 100); cntMon.set(m.label, cnt); }
        });
        phys.set(k, byMon);
        physCnt.set(k, cntMon);
      });
    }
    return { contracts, periods, plan, given, givenTotal, phys, physCnt, acts: ipc };
}

/**
 * САНХҮҮЖИЛТИЙН БҮРТГЭЛ — ГРАФИКГҮЙ, зөвхөн ХОЁР ХҮСНЭГТ (хэрэглэгчийн хүсэлт,
 * 2026-08-14): Cashflow (гэрээ/захирамжийн санхүүжилт /106) ба IPC (олгосон
 * акт /107). Хуучин комбо графикууд (ComboChart) энэ харагдацаас ХАСАГДСАН —
 * ComboChart нь «Багцын хяналт» (Tsogts)-д ХЭВЭЭР ашиглагдана.
 */
/** Үйлчилгээний талбарын тодорхойлолт — нэр, харагдах alias, төрөл */
type FieldDef = {
  name: string;
  alias: string;
  type: string;
  /**
   * Үйлчилгээний `codedValue` domain-ий сонголтууд — байвал нүд нь чөлөөт
   * бичвэр биш СОНГОЛТ болно.
   * ⚠️ `code` БИШ `name`-ийг хадгална: энэ үйлчилгээний өгөгдөлд бичвэр нь
   * («Гэрээлсэн дүн») сууж байгаа бөгөөд код («1») бичвэл утга нь эвдэрнэ.
   */
  choices?: string[];
};
type FinTables = {
  cashflow: Row[]; ipc: Row[];
  cfFields: FieldDef[]; ipcFields: FieldDef[];
};

/** Давхаргын талбарын метадата (`?f=json`) — alias нь хүний уншихуйц баганын нэр */
async function loadFields(url: string): Promise<FieldDef[]> {
  try {
    const res = await fetch(`${url}?f=json`);
    const j = await res.json();
    return Array.isArray(j?.fields)
      ? j.fields.map((x: {
        name: string; alias?: string; type: string;
        domain?: { type?: string; codedValues?: { name?: string }[] };
      }) => ({
        name: x.name,
        alias: x.alias || x.name,
        type: x.type,
        choices: x.domain?.type === 'codedValue'
          ? (x.domain.codedValues ?? []).map((v) => String(v.name ?? '')).filter(Boolean)
          : undefined,
      }))
      : [];
  } catch {
    return [];
  }
}

/**
 * ⚠️ 5 мин кэш (2026-08-24 аудит) — урьд нь Санхүү харагдац mount болох бүрд
 * 4 хүсэлт (метадата ×2 + бүтэн хүснэгт ×2) кэшгүй дахин явдаг байв; мөрүүд нь
 * одоо `loadCashflowRows`/`loadIpcRows`-оор `loadFinData`-тай хуваалцагдана.
 */
const loadFinRegister = cached(loadFinRegisterRaw, LIVE_TTL, ['IPC_LOG', 'CASHFLOW_NEW']);

async function loadFinRegisterRaw(): Promise<FinTables> {
  const [cfFields, ipcFields, cashflow, ipc] = await Promise.all([
    loadFields(CASHFLOW_NEW.url),
    loadFields(IPC_LOG.url),
    loadCashflowNewRows(),
    loadIpcRows(),
  ]);
  return { cashflow, ipc, cfFields, ipcFields };
}

export function Finance() {
  const q = useAsync<FinTables>(loadFinRegister, []);

  return (
    <div className={f.frame}>
      <Data q={q} loading={tr('Санхүүжилтийн бүртгэл…')}>
        {/*
          ⚠️ `onSaved` нь `retry` — нийтэлсний дараа энэ хуудасны мөрүүдийг
          ДАХИН татна. `invalidate()` нь кэшийг аль хэдийн хаясан тул энэ нь
          үйлчилгээ рүү шинэ хүсэлт болно; `useAsync` хуучин мөрүүдийг барьж
          байгаад солино (`dataBus`-ийн stale-while-revalidate).
        */}
        {(d) => <FinTablesView d={d} onSaved={() => q.retry?.()} />}
      </Data>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ХАРАГДАЦ — мөр (гэрээ/багц) бүрд ТУСДАА график
// ═══════════════════════════════════════════════════════════

/** Гэрээний мөрөөс сарын цэгүүд — ЯГ датаных нь дагуу + IPC олгосон + биет гүйцэтгэл */
export function contractMonths(r: Row, fin: FinData): MonthPt[] {
  const C = CASHFLOW2.fields;
  const { given, phys } = fin;
  // ⚠️ `pkgKeyOf` (bagtsKey БИШ): «БАГЦ 1-4» мэт диапазон мөр нь bagtsKey-ээр
  //    «БАГЦ14» болж, бодит «Багц 14»-ийн олголт/биет гүйцэтгэлийг өөрийн болгон
  //    зурдаг байв. Диапазон мөр одоо хоосон түлхүүртэй — юутай ч таарахгүй.
  const byMon = given.get(pkgKeyOf(r[C.pkg2])) ?? given.get(pkgKeyOf(r[C.pkg]));
  const ph = phys.get(pkgKeyOf(r[C.pkg2])) ?? phys.get(pkgKeyOf(r[C.pkg]));

  /*
   * ⚠️ ХАДГАЛАГДСАН `pctCum` (CF-ийн «өссөн хувь») БАГАНЫГ ХЭРЭГЛЭХГҮЙ —
   *    тэр нь ЖИЛ БҮР ТЭГЛЭГДДЭГ. Амьд өгөгдөл (2026-08-27, Багц 2):
   *
   *      2025-10..12  19.3%   → 2026-01..06  0.0%   → 2026-09  39.8%
   *
   *    Өссөн дүн ДУНДАА 0 болж унана гэдэг боломжгүй — график дээр
   *    төлөвлөгөөний муруй зургаан сар шалан дээр хэвтээд, эцсийн цэг нь
   *    100%-ийн оронд 39.8% дээр зогсдог байв. `services.ts` нь `amountCum`-ийн
   *    хувьд яг энэ занг («ЖИЛ БҮР ТЭГЛЭГДДЭГ») аль хэдийн тэмдэглэсэн
   *    бөгөөд `loadBudget` түүнийг хэрэглэхээс зайлсхийдэг.
   *
   *    Тиймээс өссөн хувийг гэрээний ӨӨРИЙНХ нь сарын дүнгээс бодно —
   *    үргэлж өсөх ба төгсгөлдөө 100% болно. Төслийн нэгтгэсэн график
   *    (`aggregateMonths`) аль хэдийн ЯГ ЭНЭ дүрмээр боддог тул хоёр
   *    график нэг хэлээр ярина.
   */
  /* ⚠️ Хуваарь одоо БАГАНА биш МӨР — гэрээний сарын дүнг `fin.plan`-аас авна.
     Хэмжилтгүй сард мөр огт байхгүй (2026-01 бүхэлдээ алга) тул тэнхлэгийг
     `cfMonthAxis()`-ээс авч, дутуу сарыг 0-ээр нөхнө; эс тэгвээс график нэг
     сар алгасаад цаашдын бүх цэг зүүн тийш шилжинэ. */
  const byPlan = fin.plan.get(String(r[C.geree] ?? ''));
  const axis = cfMonthAxis();
  const amounts = axis.map((m) => byPlan?.get(m.label) ?? 0);
  const total = amounts.reduce((a, b) => a + b, 0);
  let cum = 0;

  return axis.map((m, i) => {
    cum += amounts[i];
    return {
      label: m.label,
      amount: amounts[i],
      /* ⚠️ Өссөн дүн, өссөн хувь ХОЁУЛАА ЭНД бодогдоно. Хадгалагдсан
         багануудыг (`amountCum`, `pctCum`) шинэ үйлчилгээнээс ХАСАВ — тэдгээр
         нь ЖИЛ БҮР ТЭГЛЭГДДЭГ байсан тул төлөвлөгөөний муруй дунд нь 0 руу
         унаж, эцсийн цэг 100%-ийн оронд 39.8% дээр зогсдог байв (Багц 2,
         2026-08-27). Өөрийн сарын дүнгээс бодоход үргэлж өсөх ба 100%-д хүрнэ. */
      amountCum: cum,
      cumPct: total > 0 ? (cum / total) * 100 : 0,
      given: byMon?.get(m.label) ?? 0,
      phys: ph?.get(m.label) ?? null,
    };
  });
}

/**
 * ХОЦРОГДЛЫН ШАЛГАЛТ — гүйцэтгэлийн ХУВИЙГ жишнэ (дүн биш):
 * сүүлийн биет дататай сар дээр «төлөвлөсөн өссөн хувь (CF)» − «бодит биет %».
 * Хоёул бөглөгдсөн үед л утга буцаана — өрөөсгөл дататай харьцуулалт хийхгүй.
 */
export function lagOf(months: MonthPt[]): { month: string; planned: number; actual: number; gap: number } | null {
  const nowYm = new Date().toISOString().slice(0, 7);
  let mi = -1;
  months.forEach((m, i) => {
    // ⚠️ `!= null`: 0% нь бодит хэмжилт — хоцрогдлын тооцооноос хасахгүй
    if (m.label <= nowYm && m.phys != null) mi = i;
  });
  if (mi < 0) return null;
  // Төлөвлөгөө: тухайн сар хүртэлх сүүлийн бөглөгдсөн өссөн хувь
  let planned = 0;
  for (let i = 0; i <= mi; i++) if (months[i].cumPct > 0) planned = months[i].cumPct;
  if (planned <= 0) return null;
  const actual = months[mi].phys ?? 0;
  return { month: months[mi].label, planned, actual, gap: planned - actual };
}

/** Хоцрогдлын зэрэглэл: ≥10% улаан, 5–10% шар, бусад нь alert биш */
export const lagLevel = (gap: number): 'red' | 'yellow' | null =>
  gap >= 10 ? 'red' : gap >= 5 ? 'yellow' : null;

/**
 * САНХҮҮЖИЛТИЙН ХОЦРОГДОЛ — ТӨЛӨВЛӨГӨӨТ ХУВААРЬ vs БОДИТ ОЛГОЛТ.
 *
 * ⚠️ `lagOf` нь БИЕТ гүйцэтгэлийн хоцрогдлыг хэмждэг — өөр асуулт.
 *    Энэ нь: «төлөвлөгөөгөөр авах ёстой байсан хугацаа өнгөрсөн атлаа
 *    аваагүй» тохиолдлыг барина. Гүйцэтгэгч ажлаа хийсэн ч мөнгө нь
 *    хугацаандаа гараагүй бол энэ нь САНХҮҮГИЙН асуудал бөгөөд биет
 *    явцын хоцрогдлоос ТУСДАА мөрдөгдөх ёстой.
 *
 * ⚠️ ЗӨВХӨН ӨНГӨРСӨН сарууд. Ирээдүйн төлөвлөгөө «аваагүй» гэж
 *    тооцогдвол бүх багц улаан болно — хугацаа нь болоогүй мөнгө
 *    хоцрогдол БИШ.
 */
export function finLagOf(months: MonthPt[]): {
  /** Хугацаа нь өнгөрсөн сүүлийн төлөвлөгөөт сар */
  month: string;
  /** Тэр хүртэл авах ЁСТОЙ байсан өссөн дүн ₮ */
  planned: number;
  /** Бодитоор олгогдсон өссөн дүн ₮ */
  given: number;
  /** Дутуу олгогдсон ₮ (planned − given) */
  gap: number;
  /** Дутуугийн ХУВЬ — зэрэглэл үүгээр тогтоно */
  pct: number;
  /** Хугацаа нь өнгөрсөн ч дүн нь бүрэн ороогүй сарын тоо */
  lateMonths: number;
  /**
   * ОЛГОЛТЫН БҮРТГЭЛ ОГТ АЛГА (IPC акт нэг ч байхгүй).
   *
   * ⚠️ 2026-08-25-нд амьд өгөгдлөөр шалгахад: 65 багцын 41 нь «хоцорсон»
   *    гэж тэмдэглэгдэж байсны 34 нь ЭНЭ ангилалд байв — 84 актын 63 нь
   *    дүнгүй. Ийм мөрийг улаанаар тэмдэглэвэл «мөнгө хоцорсон» гэсэн ХУДАЛ
   *    дүгнэлт гарна: бид «төлөгдөөгүй» ба «бүртгэгдээгүй» хоёрыг ялгаж
   *    чадахгүй. Тиймээс тусад нь, ӨӨР хэлээр хэлнэ.
   */
  noRecord: boolean;
} | null {
  const nowYm = new Date().toISOString().slice(0, 7);
  let planned = 0;
  let given = 0;
  let month = "";
  let lateMonths = 0;
  let runPlan = 0;
  let runGiven = 0;
  for (const m of months) {
    if (m.label > nowYm) break;      // ирээдүй — хугацаа нь болоогүй
    runPlan += m.amount;
    runGiven += m.given;
    if (m.amount > 0) {
      month = m.label;
      planned = runPlan;
      given = runGiven;
      // Тэр сар хүртэлх ХУРИМТЛАЛААР дутуу байвал «хоцорсон сар»
      if (runGiven + 1 < runPlan) lateMonths += 1;
    }
  }
  if (planned <= 0) return null;
  const gap = planned - given;
  if (gap <= 0) return null;         // хугацаандаа, эсвэл илүү олгогдсон
  const noRecord = months.every((m) => m.given === 0);
  return { month, planned, given, gap, pct: (gap / planned) * 100, lateMonths, noRecord };
}

/**
 * Санхүүжилтийн хоцрогдлын зэрэглэл.
 *
 * ⚠️ ЗӨВХӨН хувиар БИШ, ДҮНГЭЭР ч шалгана: 500 сая төлөвлөснөөс 100 сая
 *    дутуу (20%) нь 200 тэрбумаас 20 тэрбум дутуутай (10%) ижил зэрэг
 *    БИШ. Аль нэг нь босго давбал улаан.
 */
export const finLagLevel = (
  pct: number,
  gap: number,
  noRecord = false,
): 'red' | 'yellow' | null => {
  /*
   * ⚠️ БҮРТГЭЛГҮЙ багц ХЭЗЭЭ Ч улаан болохгүй. «Олгоогүй» ба «бүртгээгүй»
   *    хоёрын аль нь болохыг өгөгдлөөс мэдэх БОЛОМЖГҮЙ тул хамгийн хүнд
   *    дүгнэлтийг сонгож болохгүй — тэр нь гүйцэтгэгчийг үндэслэлгүйгээр
   *    буруутгана. Дэлгэц дээр тэдгээр нь «бүртгэл алга» гэж тусдаа гарна.
   */
  if (noRecord) return null;
  if (pct >= 30 || gap >= 10_000_000_000) return 'red';
  if (pct >= 10 || gap >= 1_000_000_000) return 'yellow';
  return null;
};

/* ═══════════════════════════════════════════════════════════
   САНХҮҮЖИЛТ — ХОЁР БҮРЭН ХҮСНЭГТ (Cashflow · IPC), ГРАФИКГҮЙ
   ⚠️ Багана/мөрийг ҮЙЛЧИЛГЭЭ ЯГ БАЙГААГААР нь харуулна: багана нь давхаргын
   талбар БҮР (alias-аар нэрлэсэн, эх дараалалд), мөр нь БҮХ мөр.

   ⚠️ 2026-09-01: ШҮҮЛТ нэмэгдэв (хэрэглэгчийн хүсэлт). «Бүх мөр» гэдэг нь
   ХЭВЭЭР — анхдагч төлөв нь шүүлтгүй, шүүлт нь зөвхөн ХЭРЭГЛЭГЧИЙН сонголт.
   Шүүлт нь КЛИЕНТ дээр (`finFilter.ts`): бүх мөр аль хэдийн санах ойд байдаг
   (209 ба 59) тул серверийн `where` руу шилжүүлбэл кэш шүүлт бүрд хүчингүй
   болж, юу ч олохгүй.
   ═══════════════════════════════════════════════════════════ */

/**
 * ЗАСАХ БОЛОМЖГҮЙ талбарууд — серверийн удирддаг багана.
 *
 * ⚠️ `tableWrite.ts` эдгээрийг илгээхийн өмнө ч шүүдэг (давхар хамгаалалт).
 * Энд шүүх нь UI-д зориулагдсан: засаж болохгүй нүдэнд оролт харуулбал
 * хэрэглэгч бичээд, дараа нь чимээгүй алга болоход гайхна.
 */
const SERVER_RO = /^(objectid|globalid|shape|shape__|creationdate|creator|editdate|editor)/i;

const NUMERIC_TYPES = new Set([
  'esriFieldTypeDouble', 'esriFieldTypeInteger', 'esriFieldTypeSingle',
  'esriFieldTypeSmallInteger', 'esriFieldTypeBigInteger', 'esriFieldTypeOID',
]);

/**
 * ОГНООНЫ ТАЛБАР — `DateOnly`-г ЗААВАЛ хамруулна.
 *
 * ⚠️ 2026-09-01: `cashflow_0813/173` ба `ipc_0813/172`-ийн огнооны 14 талбар
 * (CF020, CF021, CF022, CF030 · IPC09, IPC10, IPC12, IPC14, IPC16, IPC24,
 * IPC25, IPC26, IPC28, IPC30) БҮГД `esriFieldTypeDateOnly` — `esriFieldTypeDate`
 * төрөлтэй талбар хоёуланд НЭГ Ч БАЙХГҮЙ. Урьд нь энд зөвхөн
 * `esriFieldTypeDate`-г шалгадаг байсан тул огнооны нүд ТЕКСТИЙН салаа руу
 * унаж, «27.05.2026» эсвэл «2026-13-45» мэт оролт шалгалтгүйгээр серверт
 * илгээгддэг байв — `parseCell`-ийн «буруу огноог ЧИМЭЭГҮЙ хөрвүүлэхгүй»
 * баталгаа бодит огнооны багананд ХЭЗЭЭ Ч биелдэггүй байсан.
 *
 * `DateOnly` нь epoch БИШ, `YYYY-MM-DD` МӨР — задлахгүйгээр нэг хэвэнд оруулна.
 */
const dateOnlyText = (v: unknown): string => {
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
  }
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : String(v);
};

/** Нүдний утгыг талбарын ТӨРЛӨӨР нь форматлана — үйлчилгээ дэх утгыг гажуудуулахгүй */
/**
 * ТООН ТАНИГЧ талбарууд — мянгатын таслал ТАВИХГҮЙ.
 *
 * ⚠️ 2026-09-01: «Жил» багана `2,025` гэж гарч байв. `CF003` нь Integer тул
 *    ерөнхий тоон дүрэмд орж бүлэглэгддэг байсан. Он, сар, актын дугаар нь
 *    ХЭМЖИГДЭХҮҮН биш ТАНИГЧ — мянгатаар тусгаарлавал утга нь гажина.
 */
const PLAIN_INT = new Set<string>([
  CASHFLOW2.fields.year, CASHFLOW2.fields.monthNo,   // Жил · Сар
  IPC_LOG.fields.no,                                 // Актын дугаар
]);

/**
 * ДЭЛГЭЦЭД ГАРГАХГҮЙ талбарууд.
 *
 * ⚠️ GlobalID — утгагүй UUID (хэрэглэгчийн хүсэлт).
 * ⚠️ 2026-09-01: OBJECTID ба «Гэрээний код» (CF001 · IPC02) мөн ХАСАГДАВ
 *    («object id, гэрээний код огт хэрэггүй»). Хоёулаа ДОТООД ТАНИГЧ — хүнд
 *    юу ч хэлдэггүй атлаа 38 баганат хүснэгтийн эхний хоёр байрыг эзэлдэг.
 * ⚠️ OBJECTID нь ХАРАГДАХГҮЙ болохоос АЛГА болохгүй: засварын түлхүүр
 *    (`pend`-ийн `oid:талбар`), устгалын жагсаалт, мөрийн `key` бүгд
 *    `r[oidField]`-ээс ШУУД уншдаг — баганын жагсаалтаас хамаардаггүй.
 * ⚠️ Модулийн хамрах хүрээнд: бүрэлдэхүүн дотор тодорхойлбол render бүрд
 *    шинэ функц болж, `cols`-ийн `useMemo` кэш утгагүй болно.
 */
const isSkip = (name: string, type: string, oidField: string): boolean =>
  type === 'esriFieldTypeGlobalID'
  || /globalid/i.test(name)
  || name === oidField
  || name === CASHFLOW2.fields.geree
  || name === IPC_LOG.fields.geree;

function fmtCell(v: unknown, type: string, name = ''): { text: string; num: boolean } {
  if (v == null || v === '') return { text: '', num: false };
  if (type === 'esriFieldTypeDateOnly') return { text: dateOnlyText(v), num: true };
  if (type === 'esriFieldTypeDate') {
    const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
    return { text: Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10), num: true };
  }
  if (NUMERIC_TYPES.has(type)) {
    const x = Number(v);
    if (!Number.isFinite(x)) return { text: String(v), num: true };
    /*
     * ⚠️ Бутархайг ч `num()`-оор — мянгатын таслал ба модулийн локал хадгална
     *    (өмнө нь `String(x)` бүлэглэлгүй, экспонент хэлбэрт ордог байв).
     *
     * ⚠️ 2026-09-01: ТОМ дүнгийн бутархайг ХАЯНА. Үйлчилгээнд
     *    «51776439307.6707» гэсэн утга бодитоор байдаг — 4 аравтын оронтой
     *    бичихэд 20 тэмдэгт болж нүднээс халж, төгрөгийн мянганы бутархай нь
     *    ямар ч мэдээлэл өгөхгүй. 1000-аас доош утгад (тоо ширхэг,
     *    коэффициент) 2 орон хүртэл ҮЛДЭЭНЭ.
     * ⚠️ Энэ нь зөвхөн ХАРАГДАЦ. `editText` нь `fmtCell`-ийг ХЭРЭГЛЭХГҮЙ тул
     *    засварын талбарт ТҮҮХИЙ утга бүтнээрээ гарч, хадгалахад бүтэн
     *    нарийвчлалаараа буцаж бичигдэнэ.
     */
    if (PLAIN_INT.has(name)) return { text: String(Math.trunc(x)), num: true };
    const raw = String(x).split('.')[1]?.length ?? 0;
    const dec = Math.abs(x) >= 1000 ? 0 : Math.min(2, raw);
    return { text: num(x, dec), num: true };
  }
  return { text: text(v), num: false };
}

/**
 * Шүүлтэд өгөх дүрслэл — `finFilter` нь ХАРАГДАХ текстээр жишдэг.
 * ⚠️ Модулийн хамрах хүрээнд: `useMemo`-ийн хамаарлын жагсаалтад тогтвортой
 *    байх ёстой (render бүрд шинэ функц үүсгэвэл кэш утгагүй болно).
 */
const cellStr = (v: unknown, t: string, n = ''): string => fmtCell(v, t, n).text;
const isNumericType = (t: string): boolean => NUMERIC_TYPES.has(t);

/**
 * Нүдийг ЗАСАХ талбарт тавих түүхий текст.
 *
 * ⚠️ `fmtCell`-ийн гаралтыг ХЭРЭГЛЭХГҮЙ: тэр нь мянгатын таслал нэмдэг
 * («62,791,703,684») тул засварт оруулбал хадгалахад тоо болж хөрвөхгүй.
 * Огноог `YYYY-MM-DD` болгоно — оруулахад ч мөн тэр хэлбэрийг хүлээнэ.
 */
function editText(v: unknown, type: string): string {
  if (v == null) return '';
  if (type === 'esriFieldTypeDateOnly') return dateOnlyText(v);
  if (type === 'esriFieldTypeDate') {
    const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
  }
  return String(v);
}

/**
 * Засварласан текстийг үйлчилгээ хүлээж авах ТӨРӨЛ рүү хөрвүүлнэ.
 *
 * ⚠️ Хоосон нүд нь `null` — хоосон мөр (`''`) БИШ. Тоон талбарт `''` илгээвэл
 * ArcGIS 0 болгож хадгалдаг: «бөглөөгүй» ба «тэг» хоёр ЗААВАЛ ялгаатай байх
 * ёстой, эс бөгөөс дашбоардын дундаж чимээгүй гажина.
 *
 * ⚠️ Буруу тоо/огноог ЧИМЭЭГҮЙ 0 болгохгүй — `Error` шиднэ, дуудагч тал
 * тухайн нүдийг тодруулж хэрэглэгчид буцаана.
 */
function parseCell(s: string, type: string, label: string): unknown {
  const v = s.trim();
  if (v === '') return null;
  /* ⚠️ `DateOnly` — epoch БИШ, `YYYY-MM-DD` МӨР буцаана. Хэлбэрийг хатуу
     шалгана: «27.05.2026» (Монголд түгээмэл) эсвэл «2026-13-45» нь `new Date`-д
     чимээгүй хөрвөх/NaN болох тул серверт ирээд шалтгаангүй мэт багц уналт
     үүсгэдэг байв. */
  if (type === 'esriFieldTypeDateOnly') {
    const d = new Date(`${v}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v)
      throw new Error(tr('«{0}» — огноо ЖЖЖЖ-СС-ӨӨ хэлбэрээр байх ёстой: {1}', label, v));
    return v;
  }
  if (type === 'esriFieldTypeDate') {
    const d = new Date(v.length === 10 ? v + 'T00:00:00Z' : v);
    if (Number.isNaN(d.getTime())) throw new Error(tr('«{0}» — огноо буруу: {1}', label, v));
    return d.getTime();
  }
  if (NUMERIC_TYPES.has(type)) {
    /* Хэрэглэгч хуулж тавихад мянгатын таслал/зай дагалдаж болно */
    const x = Number(v.replace(/[\s,\u00a0]/g, ''));
    if (!Number.isFinite(x)) throw new Error(tr('«{0}» — тоо буруу: {1}', label, v));
    return x;
  }
  return v;
}

/**
 * Үйлчилгээний БҮРЭН хүснэгт — талбар бүр багана (alias), мөр бүр яг байгаагаар.
 *
 * ⚠️ ЗАСВАРЫН ГОРИМ (2026-08-28). Эдгээр хоёр хүснэгт нь өдөр тутам засагддаг
 * тул AGOL руу орохгүйгээр порталаас шууд засах шаардлагатай болов. Гурван
 * зарчмаар барьсан:
 *
 *   1. ЗАСВАР ХУРИМТЛАГДАНА, шууд илгээгдэхгүй (`pend`). Нүд бүрийг тусад нь
 *      илгээвэл 250 нүд засахад 250 хүсэлт явж, дунд нь тасрахад хагас
 *      бичигдсэн мөр үлдэнэ. «Нийтлэх» дарахад л нэг багц болж явна.
 *   2. ЗӨВХӨН ӨӨРЧЛӨГДСӨН талбарыг илгээнэ. Бүтэн мөрийг буцааж бичвэл өөр
 *      хүний зэрэг зассан багана дарагдана (257 талбартай хүснэгтэд бодит
 *      эрсдэл).
 *   3. НИЙТЭЛСНИЙ ДАРАА `invalidate()` — дашбоардын тоо тэр дор нь дагана.
 *      Эс бөгөөс хэрэглэгч засвараа хараад «бичигдээгүй юм болов уу» гэж
 *      дахин дарна.
 */
function FullTable({
  title, subtitle, rows, fields, url, oidField, dataKey, facets,
  canEdit, canRow, onSaved,
}: {
  title: string;
  subtitle: string;
  rows: Row[];
  fields: FieldDef[];
  /** Бичих хаяг — засварын горим үүгээр л боломжтой */
  url: string;
  oidField: string;
  /** Нийтэлсний дараа хүчингүй болгох хүснэгтийн түлхүүр */
  dataKey: DataKey;
  /**
   * Шүүлтийн гурван нүүр (багц · он · төрөл) — талбарын код нь үйлчилгээ
   * бүрд ӨӨР тул ЭЦГЭЭС дамжина. ⚠️ `FullTable` нь дурын үйлчилгээнд
   * ажиллах ёстой бүрэлдэхүүн — `dataKey`-гээр кодыг энд сонговол
   * үйлчилгээний мэдлэг нэмэгдэнэ (`caps`-ийн шийдвэртэй ижил зарчим).
   */
  facets: Facet[];
  canEdit: boolean;
  canRow: boolean;
  /** Амжилттай нийтэлсний дараа — эцэг талд дахин татуулна */
  onSaved: () => void;
}) {
  /** Засварын горим асаалттай эсэх — эрхтэй хүнд л товч гарна */
  const [edit, setEdit] = useState(false);
  /** `oid:талбар` → шинэ ТЕКСТ. Хоосон мөр ('') нь «null болгоно» гэсэн үг. */
  const [pend, setPend] = useState<Record<string, string>>({});
  /**
   * НИЙТЭЛСЭН НҮД — «энэ сешнд юу өөрчлөгдсөн» гэдгийн тэмдэг.
   *
   * ⚠️ `pend` нь нийтлэхэд ЦЭВЭРЛЭГДДЭГ тул түүгээр л будвал хадгалсан
   * даруйдаа тэмдэглэгээ алга болж, хэрэглэгч 200 мөрийн дундаас юуг нь
   * зассанаа олохгүй болно. Тиймээс амжилттай бичигдсэн түлхүүрүүдийг ЭНД
   * зөөж, ногоон хэвээр үлдээнэ.
   *
   * ⚠️ Хоёр төлөв ЯЛГААТАЙ харагдана (`finance.module.css`):
   *     `.cellDirty` — ХАДГАЛААГҮЙ засвар (ногоон + бүтэн хүрээ)
   *     `.cellSaved` — НИЙТЭЛСЭН засвар (ногоон, хүрээгүй)
   * Эс бөгөөс «нийтлэх шаардлагатай» ба «нийтлэгдсэн» хоёр нэг өнгө болж,
   * хүн юугаа хадгалаагүйгээ мэдэхгүй.
   *
   * ⚠️ ЗӨВХӨН СЕШНИЙ ХУГАЦААНД. `Cashflow_0904`-д Editor Tracking асаагүй тул
   * серверээс «энэ нүд хэзээ өөрчлөгдсөн» гэдгийг мэдэх БОЛОМЖГҮЙ — хуудас
   * дахин ачаалахад тэмдэглэгээ арилна. Үүнийг ТҮҮХ гэж ойлгож болохгүй.
   */
  const [saved, setSaved] = useState<Set<string>>(new Set());
  /** Нийтлээгүй ШИНЭ мөрүүд — сөрөг түр дугаартай */
  const [adds, setAdds] = useState<Record<string, string>[]>([]);
  const [del, setDel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  /* ── ХАРАГДАЦ · ШҮҮЛТ · БҮЛЭГЛЭЛТ (2026-09-01) ── */
  const [flt, setFlt] = useState<FinFilter>(EMPTY_FILTER);
  /** Багана бүрийн шүүлтийн мөр нээлттэй эсэх — анхдагчаар ХААЛТТАЙ */
  const [colOpen, setColOpen] = useState(false);
  /**
   * БАГЦААР БҮТЭЦЛЭХ — анхдагчаар АСААЛТТАЙ.
   *
   * ⚠️ 2026-09-01, хэрэглэгчийн зурсан бүтэц: багцын нэр нь хөндлөн зурвас,
   *    доор нь тухайн багцын мөрүүд, зүүн талд ОН нь merge нүд; багц бүр
   *    доошоо дараалан үргэлжилнэ.
   * ⚠️ БАГАНА ХАСАГДАХГҮЙ. Түр зуур гурван багана (он · ажил · дүн) болгож
   *    хумьсныг ХЭРЭГЛЭГЧ БУЦААСАН: зураг нь «бүх мэдээллийг ингэж багцална»
   *    гэсэн санааг л харуулж байсан. Бүлэглэлт нь мөрийг ЭРЭМБЭЛНЭ, өгөгдөл
   *    хасахгүй — тиймээс засвар ч бүрэн хэвээр.
   */
  const [grouped, setGrouped] = useState(true);

  /**
   * ⚠️ ГЭРЭЭНИЙ БҮРТГЭЛД «Багцаар бүлэглэх» ТОВЧ БАЙХГҮЙ — хүснэгт нь Excel
   * шиг НЭГ бүтэн хуудас тул бүлэглэх утгагүй.
   *
   * Урсгал нь: «Засах» → нүд засна (өөрчлөлт нь НОГООН) → «Нийтлэх» дарж
   * үйлчилгээнд хадгална. Нийтлэх хүртэл ямар ч бичилт явахгүй.
   */
  const isFlat = dataKey === 'CASHFLOW_NEW';

  /**
   * Хураасан бүлгийн шошгууд.
   *
   * ⚠️ АНХДАГЧААР ЭХНИЙ 2 БАГЦ л дэлгээстэй (2026-09-02 аудит). Урьд нь
   *    хоосон эхэлдэг байсан тул Cashflow-ийн 209 мөр × 38 талбар (~7,900
   *    нүд) НЭГ ДОР зурагдаж, харагдац нээх нь мэдэгдэхүйц удаашрдаг байв.
   *    Виртуалчлал төсөлд байхгүй тул зурагдах хэмжээг өөрөө хязгаарлана.
   * ⚠️ Хэрэглэгчийн дараагийн үйлдлээр л өөрчлөгдөнө — `packs` шинэчлэгдэх
   *    болгонд дахин тооцвол хураасан багцууд нь өөрөө дэлгэгдэнэ.
   */
  const [shut, setShut] = useState<Set<string>>(new Set());

  /*
   * ДЭЛГЭСЭН НҮД — урт утгыг бүтнээр нь үзэх.
   * ⚠️ Багана нь тогтмол өргөнтэй тул урт бичвэр таслагдана. Нүд дээр дарахад
   * ЗӨВХӨН ТЭР НЭГ нүд мурийж дэлгэгдэнэ; дахин дарах эсвэл өөр нүд дарахад
   * хураагдана. Багана бүхэлдээ өргөсдөггүй — эс бөгөөс нэг урт утгаас болж
   * хүснэгт бүхэлдээ сунаж, бусад багана дэлгэцээс гарна.
   */
  const [openCell, setOpenCell] = useState<string | null>(null);

  /**
   * ДЭЛГЭХ БОЛОМЖТОЙ БАГАНА — зөвхөн энд заасан талбарууд.
   * ⚠️ Бүх баганад асаавал богино утгатай нүд дарахад ч мөр «үсэрч», хүснэгт
   * тайван байдлаа алддаг. Зөвхөн УРТ бичвэртэй багана хэрэгтэй.
   */
  const EXPANDABLE = ['Nariiwchilsan_turul'];


  /*
   * ЭРЭМБЭ — зөвхөн хавтгай хүснэгтэд (гэрээний бүртгэл).
   * ⚠️ Анхдагчаар ЭХНИЙ багана («Төрөл») өсөхөөр. Бүлэглэлтгүй 76 мөр эмх
   * замбараагүй байвал ижил төрлийн гэрээ тарж, харьцуулах боломжгүй болно.
   * ⚠️ `null` = эрэмбэлэхгүй, эх дараалал хэвээр.
   */

  const autoShut = useRef(false);
  /** IPC-ийн ДЭЛГЭСЭН актууд — дэлгэрэнгүй талбарууд нь мөрийн доор гарна */
  const [xp, setXp] = useState<Set<number | string>>(new Set());

  const dirty = Object.keys(pend).length + adds.length + del.size;

  /* ⚠️ Нийтлээгүй засвартай байхад таб хаахад хөтөч анхааруулна — «Гүйцэтгэл
     бөглөх»-тэй ижил зан. Гараар хийсэн 200 нүдний ажил алдагдах нь эргэж
     нөхөгдөшгүй. */
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  /* ⚠️ `saved`-ыг ЦЭВЭРЛЭХГҮЙ: энэ нь «болих» үйлдэл бөгөөд аль хэдийн
     нийтлэгдсэн засварыг үгүй хийхгүй — тэмдэглэгээ нь мөн үлдэх ёстой. */
  const reset = () => { setPend({}); setAdds([]); setDel(new Set()); setErr(null); };

  const publish = async () => {
    if (busy || !dirty) return;
    /*
     * ⚠️ УСТГАЛ БУЦААГДАХГҮЙ. Эдгээр үйлчилгээнд хувилбарын түүх асаагүй тул
     * устгасан мөр бүрмөсөн алга болно — «Нийтлэх (3)» гэсэн тоо нь тэдгээрийн
     * нэг нь БУЦААГДАШГҮЙ устгал гэдгийг хэлдэггүй. `UserAdmin`, `FillNew`
     * зэрэгт эргэлт буцалтгүй үйлдлийн өмнө баталгаажуулалт асуудаг дүрэмтэй
     * ижил.
     *
     * ⚠️ Зөвхөн УСТГАЛД асууна: утга засах, мөр нэмэхэд асуувал өдөр тутмын
     * ажил бүрд шаардлагагүй цонх гарч, хүн уншихаа болино — тэр үед жинхэнэ
     * анхааруулга ч мөн адил дарагдана.
     */
    if (del.size > 0
      && !window.confirm(tr('{0} мөр БУЦААГДАШГҮЙ устгагдана. Үргэлжлүүлэх үү?', del.size))) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const byName = new Map(fields.map((c) => [c.name, c]));
      const typeOf = (n: string) => byName.get(n)?.type ?? 'esriFieldTypeString';
      const labelOf = (n: string) => finFieldLabel(n);

      /* ── Засварласан утга — мөрөөр бүлэглэнэ ── */
      const upd = new Map<number, Record<string, unknown>>();
      for (const [k, v] of Object.entries(pend)) {
        const cut = k.indexOf(':');
        const oid = Number(k.slice(0, cut));
        const fld = k.slice(cut + 1);
        if (del.has(oid)) continue;                 // устгах мөрийн засвар утгагүй
        const a = upd.get(oid) ?? { [oidField]: oid };
        a[fld] = parseCell(v, typeOf(fld), labelOf(fld));
        upd.set(oid, a);
      }

      /* ── Шинэ мөрүүд ── */
      const newRows = adds.map((a) => {
        const o: Record<string, unknown> = {};
        for (const [fld, v] of Object.entries(a)) {
          if (v.trim() === '') continue;            // хоосон нүд — талбарыг огт илгээхгүй
          o[fld] = parseCell(v, typeOf(fld), labelOf(fld));
        }
        return o;
      }).filter((o) => Object.keys(o).length > 0);

      /* ⚠️ ГУРВЫГ НЭГ ХҮСЭЛТЭЭР — атомаар. Салгаж явуулбал нэмэлт амжилттай
         болоод устгал уначихад хэрэглэгч дахин дарж, нэмсэн мөр ДАВХАРДАНА. */
      const { n } = await applyAll(url, oidField, {
        updates: [...upd.values()],
        adds: newRows,
        deletes: [...del],
      });

      /* ⚠️ Кэшийг зөвхөн АМЖИЛТТАЙ бичилтийн дараа хаяна */
      invalidate(dataKey);
      /* ⚠️ `reset()`-ЭЭС ӨМНӨ зөөнө — тэр `pend`-ийг хоослоно. Устгасан
         мөрийн нүд тэмдэглэгдэхгүй: тэр мөр өөрөө алга болсон. */
      setSaved((prev) => {
        const nx = new Set(prev);
        for (const k of Object.keys(pend)) {
          const oid = Number(k.slice(0, k.indexOf(':')));
          if (!del.has(oid)) nx.add(k);
        }
        return nx;
      });
      reset();
      setMsg(tr('{0} мөр хадгалагдав', n));
      onSaved();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };
  /**
   * ГЭРЭЭНИЙ БҮРТГЭЛИЙН БАГАНЫ ДАРААЛАЛ (хэрэглэгчийн заавар 2026-09-04).
   *
   * ⚠️ Үйлчилгээний метадатагийн дараалал нь ажлын логиктой тохирдоггүй —
   * «Багц 74» ба «Гүйцэтгэлийн хувь» хоёр хамаагүй хол унасан байдаг. Эхний
   * зургааг ЭНД тогтооно; үлдсэн нь метадатагийн дарааллаараа хойно нь орно.
   * ⚠️ Жагсаалтад БАЙХГҮЙ талбар алдагдахгүй — шүүгээд биш ЭРЭМБЭЛЖ байна.
   */
  const FLAT_LEAD = [
    'Turul', 'Tusul', 'Bagts', 'Ded_bagts', 'Bagts_74', 'Guitsetgel_huwi',
  ];

  const cols: FieldDef[] = useMemo(() => {
    const base = (
      fields.length
        ? fields
        : rows[0]
          ? Object.keys(rows[0]).map((k) => ({ name: k, alias: k, type: 'esriFieldTypeString' }))
          : []
    ).filter((c) => !isSkip(c.name, c.type, oidField));

    if (dataKey !== 'CASHFLOW_NEW') return base;
    const rank = (n: string) => {
      const i = FLAT_LEAD.indexOf(n);
      return i < 0 ? FLAT_LEAD.length : i;
    };
    // ⚠️ Тогтвортой эрэмбэ — тэнцүү зэрэгтэй багана эх дараалалдаа үлдэнэ
    return base
      .map((c, i) => ({ c, i }))
      .sort((x, y) => rank(x.c.name) - rank(y.c.name) || x.i - y.i)
      .map((x) => x.c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, rows, oidField, dataKey]);
  /*
   * БАГАНЫ ӨРГӨН — Excel шиг чирж тохируулна («Гүйцэтгэл бөглөх»-тэй НЭГ
   * механизм, `localStorage`-д хадгалагдана).
   *
   * ⚠️ Багана нь ДИНАМИК (үйлчилгээний метадатагаас) тул CSS-д дүрэм бичих
   * боломжгүй — өргөнийг нүд бүрд ШУУД тавина.
   * ⚠️ ЦАРЦСАН баганын `left` нь өмнөх багануудын өргөний НИЙЛБЭР тул
   *    хэрэглэгч чирэхэд тэр нийлбэрийг ДАГАЖ дахин тооцох ёстой — эс бөгөөс
   *    царцсан багана хоорондоо зөрж, зай эсвэл давхцал үүснэ.
   */
  const { style: colStyle, grip, resetAll, resized } = useColWidths(`fin-${dataKey}`);

  /** Анхны өргөн — эхний 5 багана (№ + царцсан 4) */
  const FZ_DEF = [46, 230, 210, 120, 120];

  /** Тухайн баганын одоогийн өргөн (чирсэн бол түүнийг, эс бөгөөс анхныхыг) */
  const colW = (name: string, dflt?: number): number | undefined => {
    const v = (colStyle as Record<string, string>)[`--w-${name}`];
    if (v) return parseInt(v, 10);
    return dflt;
  };

  /** Царцсан 4 баганын зүүн шилжилт — өргөний нийлбэрээр */
  const frzLeft = useMemo(() => {
    const out = [FZ_DEF[0]];
    for (let i = 0; i < 3; i++) {
      out.push(out[i] + (colW(cols[i]?.name ?? '', FZ_DEF[i + 1]) ?? FZ_DEF[i + 1]));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colStyle, cols]);

  /* ══════════ ШҮҮЛТ ══════════ */

  /**
   * Засвартай мөрийн OID-ууд.
   * ⚠️ Эдгээр мөрийг шүүлт ХЭЗЭЭ Ч нуухгүй. Хэрэглэгч нүд засаад утга нь
   *    шүүлтэнд таарахаа болиход мөр нь гар доороос алга болвол хийсэн ажил
   *    нь харагдахгүй үлдэж, «Нийтлэх (3)» гэсэн тоо нь юуг заасныг мэдэхгүй
   *    болно.
   */
  const keepOids = useMemo(() => {
    const s = new Set<number>(del);
    for (const k of Object.keys(pend)) {
      const oid = Number(k.slice(0, k.indexOf(':')));
      if (Number.isFinite(oid)) s.add(oid);
    }
    return s;
  }, [pend, del]);

  const active = filterDirty(flt);

  const shown: Row[] = useMemo(() => {
    if (!active) return rows;
    return rows.filter((r) => {
      const oid = typeof r[oidField] === 'number' ? (r[oidField] as number) : null;
      if (oid != null && keepOids.has(oid)) return true;
      return rowMatches(r, cols, flt, facets, cellStr, isNumericType);
    });
  }, [active, rows, cols, flt, facets, oidField, keepOids]);

  /**
   * Багана бүрийн сонголтын жагсаалт — ялгаатай утга ЦӨӨН бол `<select>`.
   * ⚠️ Зөвхөн шүүлтийн мөр НЭЭЛТТЭЙ үед бодно: 36 багана × 209 мөр нь хаалттай
   *    үед дэмий ажил.
   * ⚠️ Тоон багананд жагсаалт өгөхгүй — тэнд `>1e9` мэтийн хэлээр шүүнэ.
   */
  const colOpts = useMemo<Record<string, string[]>>(() => {
    if (!colOpen) return {};
    const m: Record<string, string[]> = {};
    for (const c of cols) {
      if (isNumericType(c.type)) continue;
      const vals = distinct(rows, (r) => cellStr(r[c.name], c.type, c.name));
      if (vals.length > 1 && vals.length <= 25) m[c.name] = vals;
    }
    return m;
  }, [colOpen, cols, rows]);

  /**
   * Багц → он → мөр. ШҮҮГДСЭН мөрүүдээс байгуулна — шүүлт ба бүлэглэлт
   * хоорондоо зөрчилдөхгүй.
   */
  /*
   * ⚠️ `Cashflow_0904` нь ГЭРЭЭ/САР гэсэн мөрийн төрөлгүй — гэрээ бүр НЭГ мөр.
   * `cf` горимд зурвал `splitContracts` мастер мөр олохгүй тул хүснэгт ХООСОН
   * гарна. Тиймээс хавтгай горим.
   */
  const kind: FinKind = dataKey === 'IPC_LOG' ? 'ipc'
    : dataKey === 'CASHFLOW_NEW' ? 'flat' : 'cf';
  const packs = useMemo(
    () => (grouped ? buildGroups(shown, kind) : null),
    [grouped, shown, kind],
  );

  /* ⚠️ ЗӨВХӨН НЭГ УДАА — эхний өгөгдөл ирэхэд. Дараа нь хэрэглэгчийн сонголт
     эзэн: шүүлт солигдох бүрд дахин хуравал дэлгэсэн багц нь хаагдана. */
  useEffect(() => {
    if (autoShut.current || !packs || packs.length <= 2) return;
    autoShut.current = true;
    setShut(new Set(packs.slice(2).map((p) => p.key)));
  }, [packs]);

  const setFacet = (k: FacetKey, v: string) =>
    setFlt((s) => ({ ...s, facet: { ...s.facet, [k]: v } }));
  const setCol = (name: string, v: string) =>
    setFlt((s) => ({ ...s, col: { ...s.col, [name]: v } }));

  /**
   * Нийт баганын тоо — багцын зурвасын `colSpan`.
   * ⚠️ Бүлэглэсэн үед ЗҮҮН талд «Он» гэсэн НЭМЭЛТ багана нэмэгддэг; засварын
   *    горимд устгах багана ч нэмэгддэг. Гурвуулаа тооцоогүй бол зурвас
   *    хүснэгтийн өргөнөөс богино болж, баруун талд цоорхой үлдэнэ.
   */
  /**
   * Нийт баганын тоо — «мөр алга» мөрийн `colSpan`.
   * ⚠️ Засварын горимд устгах багана НЭМЭГДЭНЭ. Оны merge багана байсныг
   *    хассан тул түүний +1 ч хасагдав — үлдээвэл зурвас хүснэгтээс өргөн
   *    болж баруун талд цоорхой үүснэ.
   */
  const span = cols.length + (edit && canRow ? 1 : 0);


  /**
   * БАГАНА БҮРИЙН ШҮҮЛТИЙН МӨР — хоёр харагдацад ХУВААЛЦАНА.
   *
   * ⚠️ 2026-09-02: ЗӨВХӨН хавтгай («Багцаар бүлэглэх» унтраалттай) хүснэгтэд.
   *    Картын загварт багана гэж байхгүй (паспорт + хуваарь) тул товч нь
   *    тэнд ОГТ ГАРАХГҮЙ — гарч байгаад юу ч хийхгүй байснаас дээр.
   * ⚠️ `ResizableTable` нь `thead tr:last-child > th`-ээр баганын өргөнөө
   *    хэмждэг тул энэ мөр нь `<thead>`-ийн СҮҮЛИЙН `<tr>`, нүд нь ЗААВАЛ
   *    `<th>` байх ёстой (`<td>` бол хэмжилт хоосон буцаж, бариул алга болно).
   */
  const filterRow = () => (
    <tr className={f.fRow}>
      {edit && canRow && <th className={f.rowBtnCell} />}
      {cols.map((c) => {
        const v = flt.col[c.name] ?? '';
        const opts = colOpts[c.name];
        const on = v.trim() !== '';
        return (
          <th key={c.name}>
            {opts ? (
              <select
                className={`${f.fCell} ${on ? f.fCellOn : ''}`}
                aria-label={finFieldLabel(c.name)}
                value={v}
                onChange={(e) => setCol(c.name, e.target.value)}
              >
                <option value="">{tr('бүгд')}</option>
                {opts.map((o) => (
                  <option key={o || '—'} value={o}>{o === '' ? tr('(хоосон)') : o}</option>
                ))}
              </select>
            ) : (
              <input
                className={`${f.fCell} ${on ? f.fCellOn : ''} ${isNumericType(c.type) ? 'num' : ''}`}
                aria-label={finFieldLabel(c.name)}
                title={isNumericType(c.type)
                  ? tr('Жишээ: >1000 · <=5e6 · 100..200 · эсвэл текст')
                  : tr('Агуулах текст')}
                value={v}
                onChange={(e) => setCol(c.name, e.target.value)}
              />
            )}
          </th>
        );
      })}
    </tr>
  );

  /**
   * НИЙТЛЭЭГҮЙ ШИНЭ МӨРҮҮД — хоёр харагдацад ХУВААЛЦАНА.
   *
   * ⚠️ ШҮҮЛТЭЭС ГАДУУР, ҮРГЭЛЖ ТӨГСГӨЛД. Эдгээрт OID ч, утга ч байхгүй тул
   *    шүүлтэнд оруулбал шүүлт асаангуут алга болж, хэрэглэгч бөглөж байсан
   *    мөрөө алдана. БАГЦАД ч хамаарахгүй — багц нь хараахан бөглөгдөөгүй.
   * ⚠️ Бүлэглэсэн харагдацад ЗААВАЛ гарна. Урьд нь зөвхөн бүлэглээгүй
   *    хүснэгтэд зурагддаг байсан тул анхдагч горимд «+ Мөр нэмэх» дарахад
   *    «Нийтлэх (1)» гэсэн тоо нэмэгдэх ч МӨР НЬ ХААНА Ч ХАРАГДАХГҮЙ байв —
   *    хэрэглэгч хоосон мөр нийтлэх эрсдэлтэй.
   */
  const addRows = () => adds.map((a, ai) => (
    <tr key={`new-${ai}`} className={f.rowNew}>
      {canRow && (
        <td className={f.rowBtnCell}>
          <button
            type="button"
            className={f.rowBtn}
            title={tr('Мөр хасах')}
            onClick={() => setAdds((s) => s.filter((_, k) => k !== ai))}
          >×</button>
        </td>
      )}
      {cols.map((c) => (
        <td key={c.name} className={f.cellEdit}>
          {SERVER_RO.test(c.name) ? null : (
            <input
              className={`${f.cellInput} ${NUMERIC_TYPES.has(c.type) ? 'num' : ''}`}
              value={a[c.name] ?? ''}
              onChange={(ev) => {
                const v = ev.target.value;
                setAdds((s) => s.map((x, k) => (k === ai ? { ...x, [c.name]: v } : x)));
              }}
            />
          )}
        </td>
      ))}
    </tr>
  ));

  /**
   * ═══ ЭРГҮҮЛСЭН ХҮСНЭГТ — талбар нь МӨР, бичлэг нь БАГАНА ═══
   *
   * ⚠️ 2026-09-02, хэрэглэгчийн заавар: «багц болгоны дотоод мэдээллийг багана
   *    бүтэцтэй болго — дээд толгойнууд доош үргэлжилсэн, ард талд нь
   *    мэдээллүүд нь харагддаг болго». Багана бүр = НЭГ бичлэг тул нэг
   *    гэрээ/актыг дээрээс доош бүтнээр уншина; давтагддаг утга (ангилал,
   *    багц, гүйцэтгэгч) хажуугаараа зэрэгцэж ялгаа нь нүдэнд шууд харагдана.
   *
   * ⚠️ НҮДНИЙ ЛОГИК нь `renderRow`-тэй ЯГ ИЖИЛ — засварын түлхүүр
   *    `oid:талбар`, `SERVER_RO`, `editText`, `fmtCell`. Эргүүлэлт нь ЗӨВХӨН
   *    байрлал; өгөгдлийн давхарга огт хөндөгдөхгүй.
   *
   * ⚠️ Баганын толгой нь `#1 … #N` — дараалал. OBJECTID ба Гэрээний код
   *    хасагдсан (хэрэглэгчийн «огт хэрэггүй») тул илүү утгатай танигч
   *    байхгүй; ялгах утга нь эхний хэдэн мөрд (Үеийн төрөл · Жил · Сар)
   *    шууд харагдана.
   */
  /**
   * ЦАРЦСАН БАГАНА — эхний дөрөв нь хэвтээ гүйлгэхэд байрандаа үлдэнэ.
   * ⚠️ Зөвхөн `position: sticky` хангалтгүй: багана бүрийн `left` нь өмнөхүүдийн
   * ӨРГӨНИЙ НИЙЛБЭР байх ёстой тул өргөнийг CSS-д ТОГТМОЛ зааж, тэндээ
   * `calc()`-аар байрлуулна (`.xlF1…4`).
   */
  const frz = (i: number): string => (i < 4 ? (f[`xlF${i + 1}`] ?? '') : '');

  /** Нүдний өргөн ба (царцсан бол) зүүн шилжилт */
  const colSty = (c: FieldDef, i: number): CSSProperties => {
    const w = colW(c.name, i < 4 ? FZ_DEF[i + 1] : undefined);
    const st: CSSProperties = w != null ? { width: w, minWidth: w, maxWidth: w } : {};
    if (i < 4) st.left = frzLeft[i];
    return st;
  };

  const xCell = (
    r: Row, oid: number | null, dropped: boolean, c: FieldDef,
    extra = '', sty?: CSSProperties,
  ) => {
    const key = `${oid}:${c.name}`;
    if (edit && oid != null && !dropped && !SERVER_RO.test(c.name)) {
      const cur = key in pend ? pend[key] : editText(r[c.name], c.type);
      /*
       * ⚠️ ЗАССАН НҮД НОГООН. `pend`-д байгаа эсэхээр л шийднэ: `onChange` нь
       * анхны утга руугаа буцсан оролтыг `pend`-ээс УСТГАДАГ тул «засаад
       * буцаасан» нүд ногоон үлдэхгүй.
       */
      const touched = key in pend;
      /* Нийтэлсэн боловч дараа нь дахин заслаагүй нүд — дээрх тайлбарыг үз */
      const wasSaved = !touched && saved.has(key);
      const mark = touched ? f.cellDirty : wasSaved ? f.cellSaved : '';
      const onEdit = (v: string) => setPend((pv) => {
        const nx = { ...pv };
        /* Анхны утга руугаа буцвал «засвар» гэж тоолохгүй */
        if (v === editText(r[c.name], c.type)) delete nx[key];
        else nx[key] = v;
        return nx;
      });

      /*
       * СОНГОЛТЫН НҮД — үйлчилгээнд domain зарлагдсан талбарт.
       * ⚠️ Одоогийн утгыг жагсаалтад ЗААВАЛ нэмнэ: domain-д байхгүй хуучин
       * утгатай мөр байвал сонгогч түүнийг чимээгүй өөр утга руу үсэргэнэ.
       */
      if (c.choices?.length) {
        const opts = c.choices.includes(cur) || cur === '' ? c.choices : [cur, ...c.choices];
        return (
          <td key={key} style={sty} className={`${f.cellEdit} ${mark} ${extra}`}>
            <select
              className={f.cellPick}
              value={cur}
              onChange={(ev) => onEdit(ev.target.value)}
            >
              <option value="">—</option>
              {opts.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </td>
        );
      }

      /*
       * ⚠️ ЗАСАХ ГОРИМД Ч ДЭЛГЭНЭ. `Нарийвчилсан төрөл` нь хэдэн өгүүлбэр
       * урттай тул нэг мөрийн `input`-д зөвхөн эхний үгс нь багтаж,
       * хэрэглэгч ЮУ ЗАСААД БАЙГААГАА ХАРАХГҮЙ байв. Фокус авмагц нүд
       * дэлгэгдэж бичвэр мурийна — уншилтын горимын дэлгэлттэй ижил дүрэм.
       *
       * ⚠️ Дэлгэлтийг `td`-ийн ДАРАЛТААР БИШ, оролтын ФОКУСААР удирдана:
       *    засах үед нүд рүү дарах нь «түүчээ тавих» үйлдэл тул дарах бүрд
       *    хураагдаж/дэлгэгдвэл бичих боломжгүй болно.
       */
      if (EXPANDABLE.includes(c.name)) {
        const open = openCell === key;
        return (
          <td
            key={key}
            /* Хязгаарын гурвыг хамт суллах шалтгаан — доорх уншилтын нүдтэй ижил */
            style={open
              ? { ...sty, width: 'auto', maxWidth: 420, whiteSpace: 'normal', overflow: 'visible' }
              : sty}
            className={[
              f.cellEdit, mark, extra, open ? f.xlOpen : '',
            ].filter(Boolean).join(' ')}
          >
            <textarea
              className={`${f.cellInput} ${f.xlArea}`}
              value={cur}
              rows={open ? 4 : 1}
              onFocus={() => setOpenCell(key)}
              onBlur={() => setOpenCell((k) => (k === key ? null : k))}
              onChange={(ev) => onEdit(ev.target.value)}
            />
          </td>
        );
      }

      return (
        <td key={key} style={sty} className={`${f.cellEdit} ${mark} ${extra}`}>
          <input
            className={`${f.cellInput} ${NUMERIC_TYPES.has(c.type) ? 'num' : ''}`}
            value={cur}
            onChange={(ev) => onEdit(ev.target.value)}
          />
        </td>
      );
    }
    const cell = fmtCell(r[c.name], c.type, c.name);
    const canOpen = EXPANDABLE.includes(c.name);
    const open = canOpen && openCell === key;
    /* ⚠️ `title` — багана тасалж үзүүлдэг тул бүтэн утгыг хулганаар ч үзнэ */
    return (
      <td
        key={key}
        title={cell.text || undefined}
        /*
         * ⚠️ ДЭЛГЭСЭН НҮДНИЙ ХЯЗГААРЫГ ЭНД ДАРЖ БИЧНЭ. Царцсан багануудад
         * өргөнийг ШУУД (inline) тавьдаг тул CSS-ийн `!important` ч
         * `max-width`-ийг л суллаж, `width` нь хэвээр үлдэж, бичвэр
         * мурийхгүй байв. Одоо тэр гурвыг хамт суллана.
         */
        style={open
          ? { ...sty, width: 'auto', maxWidth: 420, whiteSpace: 'normal', overflow: 'visible' }
          : sty}
        onClick={canOpen ? () => setOpenCell((k) => (k === key ? null : key)) : undefined}
        className={[
          dropped ? f.xDel : '',
          cell.num ? `num ${f.cellNum}` : '',
          extra,
          canOpen ? f.xlCanOpen : '',
          open ? f.xlOpen : '',
          /* ⚠️ Засах горимоос ГАРСНЫ дараа ч тэмдэглэгээ үлдэнэ — «юу
             өөрчлөгдсөн»-ийг харах гол агшин нь яг тэр үе. */
          saved.has(key) ? f.cellSaved : '',
        ].filter(Boolean).join(' ')}
      >
        {cell.text}
      </td>
    );
  };

  /** Талбарын мөрийн зүүн хэсэг — нэр + (нээлттэй үед) шүүлтийн оролт */
  /**
   * ═══ «А» ЗАГВАР — ПАСПОРТ + ХУВААРЬ (2026-09-02, хэрэглэгчийн сонголт) ═══
   *
   * Багц бүрийн дотор ГЭРЭЭ мөр нь «паспорт» (түлхүүр/утгын тор), САР мөрүүд
   * нь доор нь цэвэр хуваарийн хүснэгт. IPC-д акт бүр нэг мөр — мөнгөний зам
   * (гүйцэтгэл → суутгал → цэвэр → шилжүүлсэн), үлдсэн талбар нь мөрийг
   * дэлгэхэд гарна.
   *
   * ⚠️ Яагаад: хоёр төрлийн мөр нэг торонд байхад аль ч чиглэлд нүдний тал нь
   *    ҮРГЭЛЖ хоосон байв. Салгаснаар хоосон нүд алга болно, талбар ХАСАГДАХГҮЙ.
   * ⚠️ Засвар хэвээр: нүд бүр эх мөрийн нэг талбар (`oid:талбар`).
   */

  /** Паспорт/дэлгэрэнгүйн нэг утга — унших эсвэл засах. `xCell`-тэй ИЖИЛ дүрэм. */
  const passVal = (r: Row, oid: number | null, dropped: boolean, c: FieldDef) => {
    const key = `${oid}:${c.name}`;
    if (edit && oid != null && !dropped && !SERVER_RO.test(c.name)) {
      const cur = key in pend ? pend[key] : editText(r[c.name], c.type);
      return (
        <input
          className={`${f.cellInput} ${NUMERIC_TYPES.has(c.type) ? 'num' : ''}`}
          value={cur}
          onChange={(ev) => {
            const v = ev.target.value;
            setPend((p) => {
              const nx = { ...p };
              if (v === editText(r[c.name], c.type)) delete nx[key];
              else nx[key] = v;
              return nx;
            });
          }}
        />
      );
    }
    const cell = fmtCell(r[c.name], c.type, c.name);
    return cell.text === ''
      ? <span className={f.pEmpty}>—</span>
      : <span className={cell.num ? 'num' : undefined}>{cell.text}</span>;
  };

  /* Багануудын хуваарилалт — хуваарийнх нь `finCard.CF_PERIOD_FIELDS`,
     үлдсэн нь паспорт. IPC: үндсэн баганууд + дэлгэрэнгүй. */
  const schedCols = useMemo(
    () => CF_PERIOD_FIELDS
      .map((n) => cols.find((c) => c.name === n))
      .filter((c): c is FieldDef => c != null),
    [cols],
  );
  const passCols = useMemo(
    () => cols.filter((c) => !CF_PERIOD_FIELDS.includes(c.name)
      && c.name !== CASHFLOW2.fields.rowType),
    [cols],
  );
  const ipcMainCols = useMemo(
    () => IPC_MAIN_FIELDS
      .map((n) => cols.find((c) => c.name === n))
      .filter((c): c is FieldDef => c != null),
    [cols],
  );
  const ipcDetailCols = useMemo(
    () => cols.filter((c) => !IPC_MAIN_FIELDS.includes(c.name)),
    [cols],
  );

  /** Хуваарийн толгойд «Үүнээс: » угтварыг хасна — багана бүрт давтагдаад нэмэргүй */
  const shortLabel = (name: string) => finFieldLabel(name).replace(/^Үүнээс:\s*/, '');

  /** Толгой баруун зэрэгцэх үү — мөнгөн багана тийм, он·сар·дугаар үгүй */
  const thRight = (c: FieldDef) => NUMERIC_TYPES.has(c.type) && !PLAIN_INT.has(c.name);

  const toggleDel = (oid: number) => setDel((sd) => {
    const nx = new Set(sd);
    if (nx.has(oid)) nx.delete(oid); else nx.add(oid);
    return nx;
  });

  /**
   * ═══ БАГЦЫН КАРТ — 2026-09-02-нд БҮРЭН ДАХИН загварчилсан ═══
   *
   * Хэрэглэгчийн заавар: «багц болгоны бүх мэдээллийг маш ойлгомжтой, бүрэн,
   * бүгдийг нь харж болохуйц». Уншлагын карт нь ШАТЛАЛТАЙ:
   *
   *   1. Нэр + гүйцэтгэгч (толгой)
   *   2. Мөнгөний ГОЛ дүнгүүд — KPI зурвас (төсөв → захирамж → гэрээ → төлөвлөсөн)
   *   3. Хөрөнгө оруулалтын хуваарь — ОН ДОТРОО САР САРААР, оны дэд нийлбэртэй
   *   4. Дэлгэрэнгүй — үлдсэн талбарууд утгаараа бүлэглэгдэж (Захирамж · Гэрээ ·
   *      Эх үүсвэр · Урьдчилгаа · Бусад)
   *
   * ⚠️ ХООСОН талбар уншлагад ГАРАХГҮЙ — хорин «—» нь мэдээлэл биш чимээ байсан
   *    нь өмнөх загварыг «бүрэн биш» мэт харагдуулж байв. Бүрэн байдлын
   *    баталгаа нь `finCard.check`: талбар бүр толгой/KPI/бүлгийн аль нэгэнд
   *    ЗААВАЛ харьяалагдана — утгатай бол ГАРЦААГҮЙ харагдана.
   * ⚠️ ЗАСВАРЫН горимд карт нь БҮХ талбараа дэлгэнэ (хоосныг нь ч) — эс бөгөөс
   *    хоосон талбарыг бөглөх боломжгүй болно. Нүд бүр `oid:талбар` хэвээр.
   */

  /** KPI хавтан — утгагүй бол ОГТ зурагдахгүй (0 худал) */
  const kpiTile = (label: string, v: number | null) => (v == null ? null : (
    <div key={label} className={f.kpi}>
      <span className={f.kpiL}>{label}</span>
      <span className={`${f.kpiV} num`}>{num(v)} <i>₮</i></span>
    </div>
  ));

  /** Тоон утга авах — хоосон/танигдахгүй бол null */
  const numOrNull = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };

  const cfCards = (list: GroupRow[]) => splitContracts(list).map((ct, ci) => {
    const m = ct.master;
    const mo = m?.oid ?? null;
    const mDrop = mo != null && del.has(mo);
    const prows = ct.periods.map((p) => p.row);
    const planned = sumOrNull(prows, CASHFLOW2.fields.amount);
    const title = m
      ? text(m.row[CASHFLOW2.fields.name], tr('Нэргүй гэрээ'))
      : tr('Гэрээний паспорт бүртгэлгүй');
    const sub = m
      ? [text(m.row[CASHFLOW2.fields.contractor], ''), text(m.row[CASHFLOW2.fields.type], '')]
        .filter(Boolean).join(' · ')
      : '';

    /* ══ ЗАСВАРЫН ГОРИМ — бүх талбар дэлгэгдэнэ, хоосон нь ч бөглөгдөнө ══ */
    if (edit) {
      return (
        <div key={ct.geree || `c-${ci}`} className={f.cCard}>
          <div className={f.cHead}>
            <span className={`${f.cTitle} ${mDrop ? f.xDel : ''}`}>{title}</span>
            {edit && canRow && mo != null && (
              <button
                type="button"
                className={f.rowBtn}
                title={mDrop ? tr('Устгахаа болих') : tr('Паспорт мөрийг устгах')}
                onClick={() => toggleDel(mo)}
              >
                {mDrop ? '↩' : '×'}
              </button>
            )}
          </div>
          {m && (
            <dl className={f.pass}>
              {passCols.map((c) => (
                <div key={c.name} className={f.pf}>
                  <dt title={c.name}>{finFieldLabel(c.name)}</dt>
                  <dd>{passVal(m.row, mo, mDrop, c)}</dd>
                </div>
              ))}
            </dl>
          )}
          {ct.periods.length > 0 && (
            <div className={f.tscroll}>
              <table className={`${f.tbl} ${f.sTbl}`}>
                <thead>
                  <tr>
                    {schedCols.map((c) => (
                      <th key={c.name} title={c.name} className={thRight(c) ? f.thR : undefined}>
                        {shortLabel(c.name)}
                      </th>
                    ))}
                    {canRow && <th className={f.rowBtnCell} aria-label={tr('Мөр')} />}
                  </tr>
                </thead>
                <tbody>
                  {ct.periods.map((p, i) => {
                    const dropped = p.oid != null && del.has(p.oid);
                    return (
                      <tr key={p.oid ?? `p-${i}`} className={`${f.dRow} ${dropped ? f.rowDel : ''}`}>
                        {schedCols.map((c) => xCell(p.row, p.oid, dropped, c))}
                        {canRow && (
                          <td className={f.rowBtnCell}>
                            {p.oid != null && (
                              <button
                                type="button"
                                className={f.rowBtn}
                                title={dropped ? tr('Устгахаа болих') : tr('Мөр устгах')}
                                onClick={() => toggleDel(p.oid as number)}
                              >
                                {dropped ? '↩' : '×'}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    /* ══ УНШЛАГЫН КАРТ ══ */
    const kpis = [
      ...CF_KPI_FIELDS.map((n) => kpiTile(finFieldLabel(n), m ? numOrNull(m.row[n]) : null)),
      kpiTile(tr('Төлөвлөсөн'), planned),
    ].filter(Boolean);

    /* Хуваарийн баганууд — Сарын дүн ҮРГЭЛЖ, бусад нь утгатай бол л */
    const schedUse = schedCols.filter((c) => c.name !== CASHFLOW2.fields.year
      && c.name !== CASHFLOW2.fields.monthNo
      && (c.name === CASHFLOW2.fields.amount
        || usedFields(prows, [c.name]).length > 0));

    const detail = m
      ? CF_PASS_GROUPS
        .map((gp) => ({
          label: gp.label,
          fields: gp.fields
            .map((n) => cols.find((c) => c.name === n))
            .filter((c): c is FieldDef => c != null)
            .filter((c) => {
              const v = m.row[c.name];
              return !(v == null || v === '');
            }),
        }))
        .filter((gp) => gp.fields.length > 0)
      : [];

    return (
      <div key={ct.geree || `c-${ci}`} className={f.cCard}>
        <div className={f.cHead2}>
          <div className={f.cName}>{title}</div>
          {sub && <div className={f.cSub}>{sub}</div>}
        </div>

        {kpis.length > 0 && <div className={f.kpiRow}>{kpis}</div>}

        {ct.periods.length > 0 && (
          <div className={f.secBox}>
            <div className={f.secLbl}>{tr('Хөрөнгө оруулалтын хуваарь')}</div>
            <div className={f.tscroll}>
              <table className={`${f.tbl} ${f.sTbl}`}>
                <thead>
                  <tr>
                    <th>{tr('Сар')}</th>
                    {schedUse.map((c) => (
                      <th key={c.name} title={c.name} className={thRight(c) ? f.thR : undefined}>
                        {shortLabel(c.name)}
                      </th>
                    ))}
                  </tr>
                </thead>
                {groupPeriodsByYear(ct.periods).map((yg) => {
                  const ySum = sumOrNull(yg.rows.map((r2) => r2.row), CASHFLOW2.fields.amount);
                  return (
                    <tbody key={yg.year || '—'}>
                      {/* ОН — секцийн толгой, оны дэд нийлбэртэй */}
                      <tr className={f.yRow}>
                        <td colSpan={1 + schedUse.length}>
                          <b className="num">{yg.year || '—'}</b>
                          {ySum != null && (
                            <span className={`${f.ySub} num`}>{tr('дэд нийлбэр {0}', num(ySum))}</span>
                          )}
                        </td>
                      </tr>
                      {yg.rows.map((p, ri) => (
                        <tr key={p.oid ?? `p-${yg.year}-${ri}`} className={f.dRow}>
                          {p.row[CASHFLOW2.fields.rowType] !== CASHFLOW2.rows.month ? (
                            <td className={f.rowKind}>
                              {text(p.row[CASHFLOW2.fields.rowType], '—')}
                            </td>
                          ) : (
                            <td className="num">
                              {tr('{0}-р сар', String(p.row[CASHFLOW2.fields.monthNo] ?? '—'))}
                            </td>
                          )}
                          {schedUse.map((c) => xCell(p.row, p.oid, false, c))}
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
                <tbody>
                  {/* ⚠️ НИЙТ — бүх мөр хоосон багана «—», 0 БИШ (утгын занга) */}
                  <tr className={f.sTotal}>
                    <td>{tr('НИЙТ')}</td>
                    {schedUse.map((c) => {
                      const t2 = sumOrNull(prows, c.name);
                      return (
                        <td key={c.name} className={`num ${f.cellNum}`}>
                          {t2 == null ? '—' : num(t2)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {detail.length > 0 && (
          <div className={f.detWrap}>
            {detail.map((gp) => (
              <div key={gp.label} className={f.dGrp}>
                <span className={f.dLbl}>{gp.label}</span>
                <div className={f.dItems}>
                  {gp.fields.map((c) => {
                    const cell = fmtCell((m as GroupRow).row[c.name], c.type, c.name);
                    return (
                      <span key={c.name} className={f.dItem} title={c.name}>
                        <i>{finFieldLabel(c.name)}</i>
                        <b className={cell.num ? 'num' : undefined}>{cell.text || '—'}</b>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  });

  /** IPC — актын урсгал: дүн → суутгал → цэвэр → шилжүүлсэн; дэлгэхэд бүх талбар */
  /**
   * ХАВТГАЙ ХҮСНЭГТ — гэрээний шинэ бүртгэлд (`Cashflow_0904`).
   * ⚠️ Багана нь метадатагаас (`cols`) ирнэ, гараар жагсаахгүй: үйлчилгээнд
   * талбар нэмэгдэхэд өөрөө гарч ирнэ.
   */
  /**
   * Хоёр утгыг харьцуулна.
   * ⚠️ Тоог мөр болгож харьцуулж БОЛОХГҮЙ — «10» нь «9»-ээс өмнө орно.
   * ⚠️ Хоосон утга ҮРГЭЛЖ ЭЦЭСТ — чиглэлээс үл хамааран. Эс бөгөөс буурахаар
   *    эрэмбэлэхэд хоосон мөрүүд дээшээ бөөгнөрч, өгөгдөл нь нуугдана.
   */
  const cmpVals = (a: unknown, b: unknown): number => {
    const ea = a == null || a === '';
    const eb = b == null || b === '';
    if (ea || eb) return ea === eb ? 0 : (ea ? 1 : -1);
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'mn', { numeric: true });
  };

  /**
   * ЭРЭМБЭ ТОГТМОЛ — эхний багана («Төрөл») БУУРАХААР (хэрэглэгчийн шийдвэр,
   * 2026-09-04). Толгой дарж солих боломж ЗОРИУДААР БАЙХГҮЙ: бүх хэрэглэгч
   * НЭГ ижил дарааллыг харах ёстой, эс бөгөөс хоёр хүн өөр өөр зураг харж,
   * «хэддэх мөр» гэж ярихад ойлголцохгүй.
   */
  const sortRows = (list: GroupRow[]): GroupRow[] => {
    const col = cols[0]?.name;
    if (!col) return list;
    // ⚠️ Хуулбарыг эрэмбэлнэ — эх массивыг өөрчилвөл дээд түвшний тооцоо гажна
    // ⚠️ Тэнцүүг OID-аар тасална — эс бөгөөс дараалал ачаалалт бүрд хөвнө
    return list.slice().sort((x, y) => cmpVals(y.row[col], x.row[col])
      || ((x.oid ?? 0) - (y.oid ?? 0)));
  };

  const flatTable = (raw: GroupRow[]) => {
    const list = sortRows(raw);
    return (
    <div className={f.xlWrap}>
      <table className={f.xlTbl}>
        <thead>
          <tr>
            <th className={f.xlNo} style={{ width: FZ_DEF[0], minWidth: FZ_DEF[0] }} aria-label="№">№</th>
            {cols.map((c, ci) => (
              <th
                key={c.name}
                title={c.name}
                style={colSty(c, ci)}
                className={[frz(ci), thRight(c) ? f.thR : ''].filter(Boolean).join(' ')}
              >
                {/*
                  * ⚠️ Толинд байхгүй талбар нь ТҮҮХИЙ НЭРЭЭРЭЭ (`Bagts_74`)
                  * гарахгүй — үйлчилгээний ӨӨРИЙН alias руу уначихна.
                  * Ингэснээр шинэ багана нэмэгдэхэд код хөндөхгүйгээр
                  * монголоор харагдана.
                  */}
                {finFieldLabel(c.name) === c.name ? c.alias : finFieldLabel(c.name)}
                {/* Чирэх бариул — давхар товшвол анхны өргөнд буцна */}
                <i {...grip(c.name)} />
              </th>
            ))}
            {edit && canRow && <th aria-label={tr('Мөр устгах')} />}
          </tr>
        </thead>
        <tbody>
          {list.map((p, i) => {
            const dropped = p.oid != null && del.has(p.oid);
            return (
              <tr key={p.oid ?? `r${i}`} className={dropped ? f.rowDrop : undefined}>
                <td className={f.xlNo} style={{ width: FZ_DEF[0], minWidth: FZ_DEF[0] }}>{i + 1}</td>
                {cols.map((c, ci) => xCell(p.row, p.oid, dropped, c, frz(ci), colSty(c, ci)))}
                {edit && canRow && (
                  <td className={f.rowBtnCell}>
                    {p.oid != null && (
                      <button
                        type="button"
                        className={f.rowBtn}
                        title={dropped ? tr('Устгахаа болих') : tr('Мөр устгах')}
                        onClick={() => toggleDel(p.oid as number)}
                      >
                        {dropped ? '↺' : '×'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    );
  };

  const ipcTable = (list: GroupRow[]) => {
    const IPS = IPC_LOG.fields;
    const rowsOnly = list.map((p) => p.row);
    const grossTot = sumOrNull(rowsOnly, IPS.gross);
    let dedTot: number | null = null;
    let paidTot: number | null = null;
    for (const r of rowsOnly) {
      const d2 = dedOrNull(r);
      if (d2 != null) dedTot = (dedTot ?? 0) + d2;
      const p2 = paidOrNull(r);
      if (p2 != null) paidTot = (paidTot ?? 0) + p2;
    }
    const netTot = netTotalOrNull(rowsOnly);
    const nCols = 1 + ipcMainCols.length + 3 + (edit && canRow ? 1 : 0);
    return (
      <div>
        {/* Мөнгөний зам — багцын нийлбэрээр: гүйцэтгэл → суутгал → цэвэр → шилжүүлсэн */}
        <div className={f.kpiRow}>
          {kpiTile(finFieldLabel(IPS.gross), grossTot)}
          {kpiTile(tr('Суутгал'), dedTot)}
          {kpiTile(tr('Цэвэр дүн'), netTot)}
          {kpiTile(tr('Шилжүүлсэн'), paidTot)}
        </div>
      <div className={f.tscroll}>
        <table className={`${f.tbl} ${f.sTbl}`}>
          <thead>
            <tr>
              <th className={f.xpCell} aria-label={tr('Дэлгэрэнгүй')} />
              {ipcMainCols.map((c) => (
                <th key={c.name} title={c.name} className={thRight(c) ? f.thR : undefined}>
                  {finFieldLabel(c.name)}
                </th>
              ))}
              {/* Бодогдсон баганууд — хадгалагддаг талбар БИШ тул засагдахгүй */}
              <th className={f.thR}>{tr('Суутгал')}</th>
              <th className={f.thR}>{tr('Цэвэр дүн')}</th>
              <th className={f.thR}>{tr('Шилжүүлсэн')}</th>
              {edit && canRow && <th className={f.rowBtnCell} aria-label={tr('Мөр')} />}
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => {
              const dropped = p.oid != null && del.has(p.oid);
              const k = p.oid ?? `i-${i}`;
              const isOpen = xp.has(k);
              const ded = dedOrNull(p.row);
              const net = netOrNull(p.row);
              const paid = paidOrNull(p.row);
              const stv = text(p.row[IPS.status], '');
              /* ⚠️ Уншлагад УТГАТАЙ талбар л дэлгэгдэнэ — хорин «—» нь чимээ.
                 Засварт БҮГД гарна, эс бөгөөс хоосон талбар бөглөгдөхгүй. */
              const dCols = edit ? ipcDetailCols : ipcDetailCols.filter((c2) => {
                const v2 = p.row[c2.name];
                return !(v2 == null || v2 === '');
              });
              return (
                <Fragment key={k}>
                  <tr className={`${f.dRow} ${dropped ? f.rowDel : ''}`}>
                    <td className={f.xpCell}>
                      <button
                        type="button"
                        className={f.xpBtn}
                        aria-expanded={isOpen}
                        title={tr('Бүх талбарыг дэлгэх')}
                        onClick={() => setXp((sx) => {
                          const nx = new Set(sx);
                          if (nx.has(k)) nx.delete(k); else nx.add(k);
                          return nx;
                        })}
                      >
                        {isOpen ? '▾' : '▸'}
                      </button>
                    </td>
                    {ipcMainCols.map((c) => {
                      /* Төлөв нь ЧИП — өнгө = утга (батлагдсан/хянагдаж буй) */
                      if (c.name === IPS.status && !edit) {
                        const cls = stv === IPC_LOG.statuses.approved ? f.chipOk
                          : stv === IPC_LOG.statuses.review ? f.chipWarn : '';
                        return (
                          <td key={c.name}>
                            {stv ? <span className={`${f.chip} ${cls}`}>{stv}</span> : '—'}
                          </td>
                        );
                      }
                      return xCell(p.row, p.oid, dropped, c);
                    })}
                    <td className={`num ${f.cellNum}`}>{ded == null ? '—' : `−${num(ded)}`}</td>
                    <td className={`num ${f.cellNum} ${f.cellStrong}`}>{net == null ? '—' : num(net)}</td>
                    <td className={`num ${f.cellNum}`}>{paid == null ? '—' : num(paid)}</td>
                    {edit && canRow && (
                      <td className={f.rowBtnCell}>
                        {p.oid != null && (
                          <button
                            type="button"
                            className={f.rowBtn}
                            title={dropped ? tr('Устгахаа болих') : tr('Мөр устгах')}
                            onClick={() => toggleDel(p.oid as number)}
                          >
                            {dropped ? '↩' : '×'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {isOpen && (
                    <tr className={f.xpRow}>
                      <td colSpan={nCols}>
                        {dCols.length === 0 ? (
                          <p className={f.cEmpty}>{tr('Нэмэлт мэдээлэл алга.')}</p>
                        ) : (
                        <dl className={f.pass}>
                          {dCols.map((c) => (
                            <div key={c.name} className={f.pf}>
                              <dt title={c.name}>{finFieldLabel(c.name)}</dt>
                              <dd className={NUMERIC_TYPES.has(c.type) ? (PLAIN_INT.has(c.name) ? 'num' : `num ${f.pMoney}`) : undefined}>
                                {passVal(p.row, p.oid, dropped, c)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            <tr className={f.sTotal}>
              <td colSpan={1 + Math.max(0, ipcMainCols.length - 1)}>{tr('НИЙТ')}</td>
              <td className={`num ${f.cellNum}`}>{grossTot == null ? '—' : num(grossTot)}</td>
              <td className={`num ${f.cellNum}`}>{dedTot == null ? '—' : `−${num(dedTot)}`}</td>
              <td className={`num ${f.cellNum}`}>{netTot == null ? '—' : num(netTot)}</td>
              <td className={`num ${f.cellNum}`}>{paidTot == null ? '—' : num(paidTot)}</td>
              {edit && canRow && <td className={f.rowBtnCell} />}
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    );
  };


  /**
   * НИЙТЛЭЭГҮЙ ШИНЭ МӨРҮҮД — мөн ЭРГҮҮЛСЭН.
   * ⚠️ Эдгээрт OID БАЙХГҮЙ тул засвар нь `pend` биш `adds[ai]`-д бичигдэнэ.
   *    Хоёрыг холивол нийтлэхэд шинэ мөр «байхгүй OID»-гоор шинэчлэл болж
   *    сервер алдаа буцаана.
   */
  const xAddTable = () => (
    <table className={`${f.tbl} ${f.xTbl}`}>
      <thead>
        <tr>
          <th className={f.xField} aria-label={tr('Талбар')} />
          {adds.map((_, ai) => (
            <th key={`nh-${ai}`} className={f.xHd}>
              <span className="num">{`#${ai + 1}`}</span>
              {canRow && (
                <button
                  type="button"
                  className={f.rowBtn}
                  title={tr('Мөр хасах')}
                  onClick={() => setAdds((s) => s.filter((_, k) => k !== ai))}
                >×</button>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cols.map((c) => (
          <tr key={c.name} className={f.dRow}>
            <th scope="row" title={c.name} className={f.xField}>{finFieldLabel(c.name)}</th>
            {adds.map((a, ai) => (
              <td key={`n-${ai}-${c.name}`} className={f.cellEdit}>
                {SERVER_RO.test(c.name) ? null : (
                  <input
                    className={`${f.cellInput} ${NUMERIC_TYPES.has(c.type) ? 'num' : ''}`}
                    value={a[c.name] ?? ''}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setAdds((s) => s.map((x, k) => (k === ai ? { ...x, [c.name]: v } : x)));
                    }}
                  />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  /* ══════════ Мөрийн зурагдалт — бүлэглэсэн ба энгийн горимд ХУВААЛЦАНА ══════════ */
  const renderRow = (r: Row, i: number) => {
    const oid = typeof r[oidField] === 'number' ? (r[oidField] as number) : null;
    const dropped = oid != null && del.has(oid);
    return (
      <tr key={oid ?? `i-${i}`} className={`${f.dRow} ${dropped ? f.rowDel : ''}`}>
        {/* ⚠️ Устгах баганыг ЗАСВАРЫН горимд л гаргана — уншиж буй
            хэрэглэгчийн хүснэгтийн өргөнийг дэмий иддэггүй. */}
        {edit && canRow && (
          <td className={f.rowBtnCell}>
            <button
              type="button"
              className={f.rowBtn}
              title={dropped ? tr('Устгахаа болих') : tr('Мөр устгах')}
              onClick={() => {
                if (oid == null) return;
                setDel((s) => {
                  const nx = new Set(s);
                  if (nx.has(oid)) nx.delete(oid); else nx.add(oid);
                  return nx;
                });
              }}
            >
              {dropped ? '↩' : '×'}
            </button>
          </td>
        )}
        {cols.map((c) => {
          const key = `${oid}:${c.name}`;
          const editable = edit && oid != null && !dropped && !SERVER_RO.test(c.name);
          if (editable) {
            const cur = key in pend ? pend[key] : editText(r[c.name], c.type);
            return (
              <td key={c.name} className={f.cellEdit}>
                <input
                  className={`${f.cellInput} ${NUMERIC_TYPES.has(c.type) ? 'num' : ''}`}
                  value={cur}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    setPend((p) => {
                      const nx = { ...p };
                      /* Анхны утга руугаа буцвал «засвар» гэж тоолохгүй */
                      if (v === editText(r[c.name], c.type)) delete nx[key];
                      else nx[key] = v;
                      return nx;
                    });
                  }}
                />
              </td>
            );
          }
          const cell = fmtCell(r[c.name], c.type, c.name);
          return (
            // envhub: тоон нүд бүр глобал «num» (tabular) + баруун зэрэгцүүлэлт
            <td key={c.name} className={cell.num ? `num ${f.cellNum}` : undefined}>{cell.text}</td>
          );
        })}
      </tr>
    );
  };

  return (
    /*
     * ⚠️ ЗАСВАРЫН ГОРИМД БҮТЭН ДЭЛГЭЦ (`position: fixed`). Хажуугийн цэс ба
     * дээд толгой алга болж, хүснэгт нүүрийг бүтнээр эзэлнэ.
     *
     * ⚠️ Яагаад overlay вэ, эцэг талын төлөв БИШ: цэс ба толгой нь `Portal`/
     * `Root`-д, өөр модульд байна. Тэднийг нуухын тулд төлөв дамжуулбал
     * «хэн юуг нууж байна» гэдэг гурван файлд тарна. `fixed` overlay нь
     * ЭНЭ ФАЙЛААС гарахгүйгээр яг тэр үр дүнг өгнө.
     */
    /*
     * ⚠️ ГЭРЭЭНИЙ БҮРТГЭЛД БҮТЭН ДЭЛГЭЦИЙН ГОРИМГҮЙ. `regFull` нь
     * `position: fixed; inset: 0` тул «Засах» дармагц хүснэгт хуудсыг бүрэн
     * халхалж, хэрэглэгчид ӨӨР ХУУДАС РУУ ШИЛЖСЭН мэт санагддаг. Энэ хүснэгт
     * аль хэдийн өөрийн хүрээндээ гүйдэг тул байрандаа засагдана.
     */
    <section className={`${f.reg} ${edit && !isFlat ? f.regFull : ''}`}>
      <header className={f.regHd}>
        <h2>{title}</h2>
        {/* ⚠️ Гэрээний бүртгэлд мөр·баганын тоолол ХАРАГДАХГҮЙ — хэрэглэгчид
            хэрэггүй тоо. IPC-д хэвээр. */}
        {!isFlat && <span className="num">{subtitle}</span>}
        {/* ⚠️ Зөвхөн ЧИРСЭН үед гарна — хэзээ ч хөндөөгүй хүнд хэрэггүй товч */}
        {resized && (
          <button type="button" className={f.finClear} onClick={resetAll}>
            {tr('Багануудын өргөнийг сэргээх')}
          </button>
        )}
        {/* ⚠️ Эрхгүй хэрэглэгчид товч ОГТ гарахгүй — унтраасан товч харуулбал
            «яагаад надад болохгүй байна вэ» гэсэн асуулт төрүүлнэ. */}
        {canEdit && isFlat && (
          /*
           * ГЭРЭЭНИЙ БҮРТГЭЛИЙН ХЭРЭГСЛҮҮД — хоёр товч ҮРГЭЛЖ зэрэг харагдана.
           * ⚠️ «Нийтлэх» нь урд, ӨӨР ӨНГӨТЭЙ: хадгалах үйлдэл нь горим солихоос
           * илүү ноцтой тул нүдэнд шууд ялгарах ёстой.
           * ⚠️ «Засах» нь ДАРААХ товч (toggle) — «Болих» товчгүй болсон тул
           * засварыг цуцлах цорын ганц зам нь энэ.
           */
          <div className={f.regAct}>
            <button
              type="button"
              className={`${f.editBtn} ${f.pubBtn}`}
              disabled={busy || dirty === 0}
              onClick={publish}
            >
              {busy ? tr('Хадгалж байна…') : tr('Нийтлэх ({0})', dirty)}
            </button>
            <button
              type="button"
              className={`${f.editBtn} ${edit ? f.editBtnOn : ''}`}
              aria-pressed={edit}
              disabled={busy}
              onClick={() => { if (edit) reset(); setEdit((v) => !v); }}
            >
              {tr('Засах')}
            </button>
          </div>
        )}
        {canEdit && !isFlat && (
          <div className={f.regAct}>
            {!edit ? (
              <button type="button" className={f.editBtn} onClick={() => setEdit(true)}>
                {tr('Засах')}
              </button>
            ) : (
              <>
                {/* ⚠️ «Мөр нэмэх» ТОЛГОЙД. Урьд нь хүснэгтийн доор байсан бөгөөд
                    бүтэн дэлгэцийн горимд хөвөгч товчнуудтай (хэрэглэгчийн
                    зураг, «AI туслах») давхцаж, хагас халхлагдаж байв. Бүх
                    үйлдэл НЭГ мөрөнд байх нь олоход ч хялбар. */}
                {/* ⚠️ Гэрээний бүртгэлд «+ Мөр нэмэх» БАЙХГҮЙ — мөр нь эх
                    үйлчилгээнд ArcGIS-аас нэмэгддэг, энэ хуудаснаас биш. */}
                {canRow && !isFlat && (
                  <button
                    type="button"
                    className={f.editBtn}
                    disabled={busy}
                    onClick={() => setAdds((s) => [...s, {}])}
                  >
                    {tr('+ Мөр нэмэх')}
                  </button>
                )}
                <button
                  type="button"
                  className={`${f.editBtn} ${dirty > 0 ? f.editBtnOn : ''}`}
                  disabled={busy || dirty === 0}
                  onClick={publish}
                >
                  {busy ? tr('Хадгалж байна…') : tr('Нийтлэх ({0})', dirty)}
                </button>
                {/* ⚠️ Гэрээний бүртгэлд «Болих» БАЙХГҮЙ — хэрэглэгч зөвхөн
                    «Засах» ба «Нийтлэх» хоёрыг хүссэн. Засварыг цуцлах нь
                    хуудсыг дахин ачаалахтай тэнцүү. */}
                {!isFlat && (
                <button
                  type="button"
                  className={f.editBtn}
                  disabled={busy}
                  onClick={() => { reset(); setEdit(false); }}
                >
                  {tr('Болих')}
                </button>
                )}
              </>
            )}
          </div>
        )}
      </header>
      {err && <p className={f.editErr} role="alert">{err}</p>}
      {msg && !err && <p className={f.editOk} role="status" aria-live="polite">{msg}</p>}

      {/* ══════════ ШҮҮЛТИЙН ЗУРВАС ══════════
          ⚠️ Тоолол ҮРГЭЛЖ харагдана («209 → 34 мөр»): шүүлт асаалттай гэдгээ
          мартаад «мөр алга болжээ» гэж эргэлзэх нь энэ хүснэгтийн хамгийн
          бодит эрсдэл. */}
      {cols.length > 0 && (
        <div className={f.finBar}>
          <input
            className={f.finSearch}
            value={flt.q}
            placeholder={tr('Бүх баганаар хайх…')}
            aria-label={tr('Бүх баганаар хайх')}
            onChange={(e) => setFlt((s) => ({ ...s, q: e.target.value }))}
          />
          {facets.map((fc) => (
            <select
              key={fc.key}
              className={`${f.finSel} ${flt.facet[fc.key] ? f.finSelOn : ''}`}
              aria-label={fc.label}
              title={fc.label}
              value={flt.facet[fc.key]}
              onChange={(e) => setFacet(fc.key, e.target.value)}
            >
              <option value="">{fc.allLabel}</option>
              {facetValues(rows, fc).map((v) => (
                <option key={v || '—'} value={v}>{v === '' ? tr('(хоосон)') : v}</option>
              ))}
            </select>
          ))}
          {/* ⚠️ Бүлэглэлт нь АНХДАГЧААР асаалттай. Унтраах товчийг үлдээв:
              бүх мөрийг эх дараалалаар нь харах хэрэгцээ (жишээ нь OID-гоор
              зөрүү хайх) заримдаа гардаг. Гэрээний бүртгэлд УТГАГҮЙ тул алга. */}
          {!isFlat && (
          <button
            type="button"
            className={`${f.finTgl} ${grouped ? f.finTglOn : ''}`}
            aria-pressed={grouped}
            title={tr('Багц бүрийг тусад нь, он merge нүдтэйгээр харуулна')}
            onClick={() => setGrouped((v) => !v)}
          >
            {tr('Багцаар бүлэглэх')}
          </button>
          )}
          {/* ⚠️ Багана бүрийн шүүлт нь зөвхөн ХАВТГАЙ хүснэгтэд — картын
              загварт багана биш паспорт/хуваарь тул утгагүй. Багц·он·төрлийн
              нүүр ба чөлөөт хайлт картад ч үйлчилнэ. */}
          {!grouped && (
          <button
            type="button"
            className={`${f.finTgl} ${colOpen ? f.finTglOn : ''}`}
            aria-pressed={colOpen}
            title={tr('Багана бүрд тусад нь шүүлт. Тоон баганад: >1000 · <=5e6 · 100..200')}
            onClick={() => setColOpen((v) => !v)}
          >
            {tr('Багана бүрийн шүүлт')}
          </button>
          )}
          <span className={`${f.finCount} num`}>
            {active
              ? tr('{0} → {1} мөр', num(rows.length), num(shown.length))
              : tr('{0} мөр', num(rows.length))}
          </span>
          {active && (
            <button
              type="button"
              className={f.finClear}
              onClick={() => setFlt(EMPTY_FILTER)}
            >
              {tr('Цэвэрлэх')}
            </button>
          )}
        </div>
      )}

      {rows.length === 0 || cols.length === 0 ? (
        <Empty label={tr('Мөр алга.')} />
      ) : (
        <div className={grouped ? f.bWrap : f.tblWrap}>
          {grouped && packs ? (
            <>
            {packs.length === 0 && adds.length === 0 && (
              <Empty label={tr('Шүүлтэнд тохирох мөр алга.')} />
            )}
            {/*
              * ⚠️ ГЭРЭЭНИЙ ШИНЭ БҮРТГЭЛ нь БАГЦААР ХУВААГДАХГҮЙ — Excel шиг НЭГ
              * бүтэн хүснэгт. Багцын нэр нь «БАГЦ-1», «БАГЦ - 1», «БАГЦ 1-4»
              * гэх мэт олон хувилбартай тул бүлэглэвэл 76 мөр 56 бүлэгт
              * бутарч, ганц ганцаараа сууна — уншихад ямар ч ашиггүй.
              * Багц нь ердийн БАГАНА хэвээр үлдэж, шүүлтээр ажиллана.
              */}
            {kind === 'flat'
              ? flatTable(packs.flatMap((p) => p.rows))
              : packs.map((p) => {
              const off = shut.has(p.key);
              /* Багцын нийлбэр — бүгд хоосон бол ОГТ бичихгүй (0 худал) */
              const hdSum = kind === 'cf'
                ? sumOrNull(p.rows.map((g) => g.row), CASHFLOW2.fields.amount)
                : netTotalOrNull(p.rows.map((g) => g.row));
              return (
              <section key={p.key} className={f.bBox}>
                {/* ⚠️ Багцын нэр нь ХҮСНЭГТЭЭС ГАДУУР: доторх хүснэгт нь хэвтээ
                    гүйдэг тул `<th>` дотор байвал баруун тийш гүйлгэхэд
                    нэр нь харагдахаа болино. */}
                <button
                  type="button"
                  className={f.bName}
                  aria-expanded={!off}
                  onClick={() => setShut((s) => {
                    const nx = new Set(s);
                    if (nx.has(p.key)) nx.delete(p.key); else nx.add(p.key);
                    return nx;
                  })}
                >
                  <span className={f.grpCaret}>{off ? '▸' : '▾'}</span>
                  {p.pkg}
                  <span className={`${f.grpCnt} num`}>{tr('{0} мөр', num(p.count))}</span>
                  {hdSum != null && (
                    <span className={`${f.bSum} num`}>
                      {kind === 'cf' ? tr('Төлөвлөсөн {0}', mnt(hdSum)) : tr('Цэвэр олгосон {0}', mnt(hdSum))}
                    </span>
                  )}
                </button>
                {/* «А» загвар: Cashflow → гэрээ бүрд паспорт + хуваарь;
                    IPC → актын урсгал. Хэвтээ гүйлт нь хүснэгт ДОТРОО (`.tscroll`). */}
                {!off && (kind === 'cf' ? cfCards(p.rows) : ipcTable(p.rows))}
              </section>
              );
            })}
            {/* ── НИЙТЛЭЭГҮЙ ШИНЭ МӨРҮҮД — тусдаа блок ──
                ⚠️ Багцын блокуудын ГАДНА, төгсгөлд. Шинэ мөрд багц нь
                хараахан бөглөгдөөгүй тул аль ч блокт хамаарахгүй; блокт
                оруулбал багц сонгомогц мөр нь өөр блок руу «үсэрч», бөглөж
                байсан хүн алдана. */}
            {edit && adds.length > 0 && (
              <section className={f.bBox}>
                <div className={f.bName}>
                  <span className={f.grpCaret}>+</span>
                  {tr('Нийтлээгүй шинэ мөр')}
                  <span className={`${f.grpCnt} num`}>{tr('{0} мөр', num(adds.length))}</span>
                </div>
                <div className={f.tscroll}>
                  {xAddTable()}
                </div>
              </section>
            )}
            </>
          ) : (
          <>
          {/* ⚠️ Түлхүүр нь ГАРЧГААС — энэ бүрэлдэхүүн хуудсанд хэд хэдэн
              удаа зурагддаг тул тогтмол түлхүүр өгвөл хүснэгтүүд нэг
              хадгалалтыг булаацалдаж, өргөн нь хоорондоо холилдоно. */}
          <ResizableTable
            storeKey={`finance.${title.replace(/\s+/g, "-").toLowerCase()}`}
            className={f.tbl}
          >
            <thead>
              <tr>
                {edit && canRow && <th className={f.rowBtnCell} aria-label={tr('Мөр')} />}
                {cols.map((c) => (
                  <th
                    key={c.name}
                    title={c.name}
                    className={flt.col[c.name]?.trim() ? f.thOn : undefined}
                  >
                    {finFieldLabel(c.name)}
                  </th>
                ))}
              </tr>
              {colOpen && filterRow()}
            </thead>
            <tbody>
              {/* ── ШҮҮГДСЭН МӨР АЛГА ── */}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={span} className={f.grpEmpty}>
                    {tr('Шүүлтэнд тохирох мөр алга.')}
                  </td>
                </tr>
              )}

              {/* ⚠️ Энэ зам нь зөвхөн БҮЛЭГЛЭЭГҮЙ үед — эх дараалалаар.
                  Бүлэглэсэн үед багц бүр ДЭЭР нь тусдаа блок болж зурагдана. */}
              {shown.map((r, i) => renderRow(r, i))}

              {edit && addRows()}
            </tbody>
          </ResizableTable>
          </>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Санхүүжилт — Cashflow ба IPC-ийн БҮРЭН хүснэгт (график огт байхгүй).
 *
 * ⚠️ ЭРХИЙГ ЭНД шалгаж доош дамжуулна, `FullTable` дотор БИШ: тэр бүрэлдэхүүн
 * дурын үйлчилгээнд ажиллах ёстой тул `caps`-аас хараат байх нь буруу
 * хамаарал болно.
 */
function FinTablesView({ d, onSaved }: { d: FinTables; onSaved: () => void }) {
  const { user } = useAuth();
  /* ⚠️ Эрх нь ArcGIS-ээс АСИНХРОНООР ирдэг (`initRemote`) тул захиалж, ирэхэд
     дахин зурна — эс бөгөөс админ эрх өгсний дараа хэрэглэгч хуудсаа дахин
     ачаалж байж товчоо олно. */
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeCaps(() => setTick((n) => n + 1)), []);
  void tick;
  /*
   * ⚠️ Нэвтрэлт унтраалттай (дев) үед бүх эрх нээлттэй байх дүрэм нь
   * `hasCap` дотор — ЭНД давтахгүй. Хоёр газарт бичвэл нэгийг нь өөрчлөхөд
   * нөгөө нь чимээгүй үлдэнэ.
   *
   * ⚠️ Нэвтэрсэн үед админ ч гэсэн эрхээ панелаас ӨӨРТӨӨ ил асаана
   * («Гүйцэтгэл бөглөх»-ийн «Мөр нэмэх»-тэй ижил дүрэм) — ингэснээр «хэн
   * санхүүгийн тоо засаж чадах вэ» гэдэг НЭГ жагсаалтаас бүрэн харагдана.
   */
  const canEdit = hasCap(user?.username, 'finEdit');
  const canRow = hasCap(user?.username, 'finRow');

  /**
   * ⚠️ ХОЁР ХҮСНЭГТ ДАРААЛЖ БИШ, СОЛИГДОЖ гарна.
   *
   * Урьд нь Cashflow (76 мөр) ба IPC (90 мөр) нэг хуудсанд дараалж
   * зурагддаг байв. Хоёулаа дотроо хоёр тэнхлэгээр гүйдэг тул хуудас
   * бүхэлдээ гурван өөр гүйлгэлттэй болж, доод хүснэгтийг олохын тулд
   * дээдийг нь өнгөрөх шаардлагатай байлаа. Нэг мөчид НЭГ хүснэгт.
   */
  /**
   * ⚠️ ТУСДАА «үзүүлэлтийн» ХАРАГДАЦ ҮҮСГЭХГҮЙ (2026-09-01, хэрэглэгчийн
   * заавар: «ийм нэмэлт хэсэг хэрэггүй, IPC/Cashflow-ийг дээр нь л засна»).
   * Богино хугацаанд багц бүрийн нэгтгэсэн үзүүлэлтийг тусдаа таб болгож
   * үзүүлсэн бөгөөд ХАСАГДСАН: хэрэглэгч эдгээр хүснэгт дээрээ ажилладаг,
   * зөвхөн уншдаг хуулбар нь ажлын урсгалыг ХОЁР ТАСАЛНА. Уншихад ойлгомжтой
   * болгох ажил нь ЭНЭ ХОЁР ХҮСНЭГТ ДЭЭРЭЭ хийгдэнэ — шүүлт, багцаар
   * бүлэглэлт, наалдсан толгой/багана.
   */
  const [tab, setTab] = useState<'cf' | 'ipc'>('cf');

  return (
    <>
      <header className={f.pageHd}>
        {/*
          * ⚠️ Гарчиг хасагдсан тул табууд ЗҮҮН тийш үсэрдэг (`space-between`
          * ганц хүүхэдтэй үед эхэнд нь наана). `margin-left: auto` нь тэднийг
          * БАРУУН талд нь үлдээнэ.
          */}
        {/* Хүснэгт солих — идэвхтэй нь дүүргэлттэй */}
        <div className={f.tabs} role="tablist" style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'cf'}
            className={`${f.tab} ${tab === 'cf' ? f.tabOn : ''}`}
            onClick={() => setTab('cf')}
          >
            {tr('Cashflow')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ipc'}
            className={`${f.tab} ${tab === 'ipc' ? f.tabOn : ''}`}
            onClick={() => setTab('ipc')}
          >
            {tr('IPC')}
          </button>
        </div>
      </header>

      {/* ⚠️ `key` нь ЗААВАЛ: хоёр салаа НЭГ байрлалд, НЭГ төрлийн бүрэлдэхүүн
          тул React instance-ыг ДАХИН АШИГЛАНА. Түлхүүргүй бол Cashflow-д
          тавьсан `CF006` шүүлт IPC-д үлдэж, тэнд тийм талбар байхгүй тул
          хүснэгт ХООСОН гарна — шалтгаан нь огт харагдахгүй. */}
      {tab === 'cf' ? (
      <FullTable
        key="cf"
        title={tr('Гэрээний бүртгэл — захирамж, гэрээ, санхүүжилтийн эх үүсвэр')}
        subtitle={tr('{0} мөр · {1} багана', num(d.cashflow.length), d.cfFields.length)}
        rows={d.cashflow}
        fields={d.cfFields}
        url={CASHFLOW_NEW.url}
        oidField={CASHFLOW_NEW.oid}
        dataKey="CASHFLOW_NEW"
        facets={FIN_FACETS.CASHFLOW_NEW}
        canEdit={canEdit}
        canRow={canRow}
        onSaved={onSaved}
      />
      ) : (
      <FullTable
        key="ipc"
        title={tr('IPC — олгосон акт (/172)')}
        subtitle={tr('{0} мөр · {1} багана', num(d.ipc.length), d.ipcFields.length)}
        rows={d.ipc}
        fields={d.ipcFields}
        url={IPC_LOG.url}
        oidField={IPC_LOG.oid}
        dataKey="IPC_LOG"
        facets={FIN_FACETS.IPC_LOG}
        canEdit={canEdit}
        canRow={canRow}
        onSaved={onSaved}
      />
      )}
    </>
  );
}
