'use client';

import {
  useState, useEffect, useMemo, useRef, useCallback, useId, type MouseEvent,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  Data, Empty, userError, tabFocusNav,
} from '@/components/ui';
import { askConfirm } from '@/lib/confirm';
import { CashflowPlan } from '@/modules/CashflowPlan';
import { useAsync } from '@/lib/useAsync';
import {
  queryFeatures, arcgisPost,
} from '@/lib/query';
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
import { loadBlockHistory, loadBlockUniverse, loadInfraHistory, loadInfraUniverse } from '@/lib/blockProgress';
/*
 * ⚠️ ХУВААРИАС бодсон БИЕТ төлөвлөгөөний муруй (2026-09-04). `lagOf` нь урьд
 *    нь cashflow-ийн ӨССӨН МӨНГӨН хувийг (`cumPct`) БИЕТ гүйцэтгэлийн хувьтай
 *    хасдаг байв — НЭГЖ нь зөрсөн харьцуулалт. Дээрээс нь `cfMonthAxis()`
 *    цонх нь 2025-10…2026-09 (12 сар) бөгөөд cashflow-ийн 133 үеийн 131 нь
 *    түүн дотор багтдаг тул `cumPct` нь 2026-09-д ЯГ 100.0% болно. Амьд
 *    хэмжилт (2026-09-04): хэмжигдсэн 9 багц ТУС БҮР `planned = 100.0`,
 *    `gap ≈ 100` → 9/9 нь УЛААН. Одоо энэ нь ГАНЦ хоцрогдол: мөнгөний
 *    хоцрогдол (`finLagOf`) нь 2026-09-06-нд сарын төлөвлөгөөтэйгөө хамт
 *    хасагдсан — шинэ cashflow-д сарын хуваарь БАЙХГҮЙ.
 *    Импортын мөчлөг үүсэхгүй: `planProgress` нь `Finance`-ээс юу ч авдаггүй.
 */
import { loadPlanCurveCached, planPctAt, measureDayOf, planCoverage, coverageOk, type PlanCurve, type PlanPoint } from '@/lib/planProgress';
import { buildPhys, type PhysAtMap } from '@/lib/finPhys';
/* ⚠️ 2026-09-30: төслийн төлөвлөгөөг бодит талтай НЭГ (ХО) жингээр — `projectPlanOf`.
   Мөчлөггүй: `gdash` нь `Finance`-ээс юу ч импортолдоггүй. */
import {
  housingPlanSeries, housingSeries, planScope, pkgCostWeight, cfWeightRow, HOUSING_PKGS,
} from '@/lib/gdash';
import {
  CASHFLOW_NEW, HO_IPC, pkgKeyOf, cfMonthAxis, hoAmount,
  CF_WORK_WHERE, CF_MONTH_WHERE, CF_MONTH, bagtsKey,
} from '@/lib/services';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import { MAP_PKG_ALIAS } from '@/lib/pkgAlias';
/* ⚠️ 2026-09-09: IPC-ийн ГЭРЭЭ ба ТӨЛБӨР гэсэн ХОЁР ТҮВШИН — `@/lib/ipc`-ээс.
   Мөр = НЭГ ГҮЙЛГЭЭ; гэрээний талбар `geree_kod` бүрд ДАВТАГДАНА тул
   гэрээний дүнг мөрөөр SUM хийвэл Багц-4.1 (7 мөр) -ийн төсөв 7 дахин
   хөөрөгдөнө. Гэрээний тоог ЗӨВХӨН `groupHo`/`hoTotals`-оос ав. */
import { loadHoRows, groupHo, type HoContract } from '@/lib/ipc';
import {
  setFinNavDirty,
} from '@/lib/finEdit';
import {
  finXlRowHidden, finXlChartCat,
} from '@/lib/finExcelLayout';
import {
  mnt, num, pct, date, monthKey, dayKey,
} from '@/lib/format';
import { fitLabels, textW, useChartWidth } from '@/lib/chartFit';
import { CHART, lineSegments } from '@/lib/chartStyle';
import {
  invalidate,
} from '@/lib/dataBus';
import {
  hasCap, subscribeCaps,
} from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import { IpcTable } from '@/modules/IpcTable';
/* ⚠️ 2026-10-26: сарын мөнгөний эх («Гараар» / «Хуваарь») — CashflowPlan аль хэдийн статикаар импортолдог тул нэмэлт багц үгүй */
import {
  loadMonthlyMoney, monthSourceOf, confirmAndSwitch, switchPhaseWhy, PKG_KEYS, SRC_HUVAARI, CF_SWITCH_CAP, type MonthlyMoney,
} from '@/lib/monthlyMoney';
/* ⚠️ 2026-10-26: «Төсөл төлөвлөгөө биелэлт» — ачаалагч нь ДИНАМИК импорт (`loadProjectPlanLazy`): Finance-ийг
   execReport · Нүүр г.м. олон газар импортолдог тул газрын/хуваарийн тооцооны код тэдгээрт татагдахгүй. Энд зөвхөн төрөл. */
import type { ProjectPlan } from '@/lib/projectPlanInputs';
import type { PlanNode, PlanValues, BlockStatus } from '@/lib/projectPlan';
import f from './finance.module.css';

/**
 * `loadProjectPlan.failed`-ийн ДОТООД түлхүүрийг (`schedule:b1_9f` · `land:БАГЦ161` · `footprints`…) хүний нэр рүү.
 * ⚠️ 2026-10-26 (аудит): анхааруулга кодын түлхүүрийг шууд харуулдаг тул аль эх уншигдаагүйг ойлгохгүй байв.
 *    Дотоод түлхүүрүүд (`failedGroups` г.м.) ӨӨРЧЛӨГДӨХГҮЙ — зөвхөн харуулалт.
 */
function planFailedLabels(failed: readonly string[]): string[] {
  const out = new Set<string>();
  for (const k of failed) {
    const [head, rest] = k.split(/:(.*)/s);
    if (head === 'schedule') {
      const p = rest ? PKGS.find((x) => x.key === rest) : undefined;
      out.add(p ? tr('{0}: {1}', tr('Хуваарь'), p.label) : tr('Хуваарь'));
    } else if (head === 'land') {
      out.add(rest ? tr('{0}: {1}', tr('Газар чөлөөлөлт'), rest) : tr('Газар чөлөөлөлт'));
    } else if (k === 'parcels') out.add(tr('Нэгж талбар'));
    else if (k === 'footprints') out.add(tr('Барилгын давхарга'));
    else if (k === 'blockProgress' || k === 'blockUniverse' || k === 'infraProgress' || k === 'actual') out.add(tr('Гүйцэтгэл'));
    else out.add(k);
  }
  return [...out];
}

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
  /* ⚠️ 2026-10-09: `format.monthKey` (локал сар) — портал сарыг ХААНА Ч локалаар түлхүүрлэдэг;
     UTC сар нь Улаанбаатарын (UTC+8) сарын 1-ний 00–08 цагийн гүйлгээг ӨМНӨХ сард оруулдаг байв. */
  if (typeof v === 'number' && v > 1e12) return monthKey(v);
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
/* ⚠️ 2026-09-06: `PLAN` (индиго — төлөвлөгөөт муруй) ХАСАГДСАН, тэр цуваа
   өөрөө байхгүй болсон тул. Слот 1/2 нь CVD-ийн шалгуурт хамгийн сайн
   салгагдсан хос хэвээр. */
/* ⚠️ 2026-10-23: Environment — график НЭГ өнгө (хэрэглэгчийн шийдвэр): `cat(0)`/`cat(1)` → бодит
   (олголт) = `--data` БҮТЭН, биет = `--chart-plan` ТАСАРХАЙ (`CHART.planDash`). Хоёр цувааг өнгө биш
   ХЭЛБЭР (бүтэн/тасархай) ялгана; PkgFin-ийн тайлбар (легенд) мөн ижил. */
const ACT = 'var(--data)'; // олгосон санхүүжилтийн өссөн ₮ — бүтэн шугам
const PHYS = 'var(--chart-plan)'; // биет гүйцэтгэлийн % — тасархай шугам

type Row = Record<string, unknown>;

/**
 * Нэг сарын цэг: олгосон ₮ + биет гүйцэтгэл %.
 *
 * ⚠️ 2026-09-06: `amount` / `amountCum` / `cumPct` (сарын санхүүжилтийн
 *    ТӨЛӨВЛӨГӨӨ) ХАСАГДСАН. Тэдгээр нь `cashflow_0813`-ийн «САР» мөрүүдээс
 *    гардаг байсан бөгөөд тэр үйлчилгээ бүрмөсөн хаягдсан; шинэ
 *    `Cashflow_0909`-т он/сарын багана ОГТ БАЙХГҮЙ. Үлдсэн хоёр цуваа нь
 *    хоёулаа БОДИТ ХЭМЖИЛТ — төлөвлөгөө нь биет талд (`planProgress`).
 */
export type MonthPt = {
  label: string; // «2025-10»
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
  /**
   * `phys`-ийн ХЭМЖИЛТИЙН огноо «YYYY-MM-DD» (`FinData.physAt`).
   * ⚠️ Байхгүй (`undefined`/`null`) бол `lagOf` сарын ЭЦСЭЭР бодно —
   *    `ceo/schedule.lagPoint` сорил яг тэр хуучин зан төлөвт тулгуурладаг.
   */
  physAt?: string | null;
  /**
   * БАГЦЫН ТҮЛХҮҮР — `phys` аль багцаас гарсан бэ (`bagtsKey`/`pkgKeyOf`).
   *
   * ⚠️ ЗӨВХӨН `lagOf`-д (2026-09-04): хоцрогдлыг бодохдоо ЯГ ТЭР багцын
   *    хуваарийн муруйг (`PlanCurve.byBagts`) авахад хэрэгтэй. `lagOf(months)`
   *    гарын үсэг нь ГУРВАН файлд (ExecKpi · PkgProg · PkgFin) хэрэглэгддэг
   *    тул өөрчилж болохгүй — багцын түлхүүрийг цэг дотроо авч явснаар
   *    гарын үсэг хэвээр үлдэж, `planned` нь зөв багцынхаа хуваариас гарна.
   *
   * ⚠️ `undefined` = ТӨСЛИЙН НЭГТГЭЛ (`aggregateMonths`) — тэр үед төслийн
   *    нийт муруй (`PlanCurve.months`) хэрэглэгдэнэ. Тиймээс сонголтгүй
   *    (optional): PkgProg/PkgFin доторх `aggregateMonths` эдгээр файлын
   *    эзэмшил тул тэднийг хөндөхгүйгээр зөв зан төлөв гарна.
   */
  pkg?: string;
  /**
   * ⚠️ 2026-10-09 (аудит №2): ХОЦРОГДЛЫН «бодит» тал — ЗӨВХӨН хуваарьтай багцаар
   * (`gdash.planScope`), төлөвлөгөө (`projectPlanOf`)-тэй НЭГ олонлог. Зөвхөн
   * `aggregateMonths` (төслийн зам) бөглөнө; `undefined` бол `lagOf` `phys`-ийг авна.
   * Толгойн «Биет гүйцэтгэл» (`physNow`) `phys`-ээс, ХӨНДӨГДӨХГҮЙ.
   * ⚠️ 2026-10-22 (аудит): `phys` нь одоо ОРОН СУУЦНЫ багцаар (`aggregateMonths`-ийн ⚠️) — «бүх багцаар» биш.
   */
  physLag?: number | null;
  /** `physLag`-ийн хэмжилтийн огноо — `physAt`-тай ижил утгатай */
  physLagAt?: string | null;
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
   * ГЭРЭЭНИЙ мөрүүд (76) — `Cashflow_0909`.
   *
   * ⚠️ 2026-09-06: мөрийн ТӨРЛИЙН шүүлт хэрэггүй болов. Хуучин
   *    `cashflow_0813` нэг хүснэгтэд гэрээ + сар + өмнөх шилжүүлсэн гэсэн
   *    гурван грейн агуулдаг байсан тул `where.master` заавал байх ёстой
   *    байв; шинэ хүснэгтийн мөр БҮР нэг гэрээ.
   */
  contracts: Row[];
  /**
   * Багц → ГЭРЭЭНИЙ НИЙТ ДҮН, ₮ (`Geree_erh_dun`; хоосон бол
   * `Urdch_tusuwt_urtug`).
   *
   * ⚠️ 2026-09-06: сарын ТӨЛӨВЛӨГӨӨНИЙ (`plan`) ОРЛУУЛАГЧ. Урьд нь
   *    «төлөвлөгөөт дүн» гэдэг нь `cfMonthAxis()`-ийн 12 сарын ЦОНХОНД
   *    багтсан сарын мөрүүдийн нийлбэр байв — өөрөөр хэлбэл цонхны гадна
   *    үлдсэн үе НЬ ОГТ ТООЛОГДОХГҮЙ. Гэрээний дүн нь бүтэн, тогтвортой,
   *    бөгөөд хэрэглэгчийн ойлголттой шууд нийцнэ.
   * ⚠️ Түлхүүр нь `givenTotal`-тай ИЖИЛ (`pkgKeyOf(pkg2) || pkgKeyOf(pkg)`)
   *    тул хоёрыг шууд хувааж «олгосон / гэрээ» гаргаж болно.
   */
  planTotal: Map<string, number>;
  given: GivenMap;
  /**
   * Багц → нийт олгосон (цэвэр) дүн — ОГНООГҮЙ актыг ч ОРУУЛНА.
   *
   * ⚠️ 45 төлбөрийн 5-д гүйлгээний огноо алга. Тэдгээрийг
   *    `given`-ий сарын цуваанд оруулбал сүүлийн сар дээр хуурамч оргил
   *    үүснэ (null ≠ 0), огт хаявал нийт дүн дутна — тиймээс цуваанаас
   *    хасаж, НИЙЛБЭРТ энд үлдээв.
   */
  givenTotal: Map<string, number>;
  phys: PhysMap;
  physCnt: PhysMap;
  /**
   * Багц → сар → тэр цэгийн ХЭМЖИЛТИЙН огноо «YYYY-MM-DD» (2026-09-25).
   * ⚠️ `lagOf` төлөвлөгөөг сарын эцсээр БИШ, энэ өдрөөр завсарлана — эс
   *    бөгөөс сарын 5-нд хэмжсэн гүйцэтгэлийг 30-ны төлөвлөгөөтэй жишиж
   *    хиймэл «хоцрогдол» гарна (`negtgelAuto.housingPlanOf`-ийн дүрэм).
   */
  physAt: PhysAtMap;
  /**
   * Багц → блокийн ХУВААРЬ (бөглөх хуудасны блок) — `finPhys.PhysBuild.physN`.
   * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): `phys`-д цэггүй атлаа энд байгаа багц = ОГТ
   *    тайлагнаагүй, 0% (`aggregateMonths`, `contractMonths`). Хуучин кэш/тестийн
   *    обьектод байхгүй байж болох тул optional.
   */
  physN?: Map<string, number>;
  /**
   * ТӨЛБӨРИЙН МӨРҮҮД (45) — `HO_IPC` түүхий мөр, OID дарааллаар.
   *
   * ⚠️ `given` нь тэдгээрийг сар бүрийн НИЙЛБЭР болгож хураадаг тул төлбөр
   *    бүрийн дугаар, төрөл (урьдчилгаа/гүйцэтгэл), гүйлгээний огноо
   *    алдагддаг. «Энэ мөнгө ЯМАР төлбөрөөр олгогдсон бэ» гэдэг нь гол
   *    мөрдөх мөр тул түүхий мөрийг ХАДГАЛНА.
   * ⚠️ 2026-09-09: нэр нь `acts` → `pays`. Шинэ эх нь АКТ БИШ ТӨЛБӨР —
   *    урьдчилгааны гүйлгээ ч энд орно (хэрэглэгчийн шийдвэр: «олгосон» =
   *    урьдчилгаа + гүйцэтгэл).
   */
  pays: Row[];
  /**
   * ГЭРЭЭНИЙ ТҮВШИН (22) — `groupHo`-оор dedup хийсэн.
   *
   * ⚠️ Гэрээний ДҮНГ (төсөв, гэрээт төсөв, хэмнэлт) ЗӨВХӨН эндээс ав, `pays`
   *    мөрөөр БИШ: тэдгээр талбар гэрээний мөр бүрд ДАВТАГДАНА тул мөрөөр
   *    нийлүүлбэл 7 дахин давхардана.
   * ⚠️ CASHFLOW_NEW-ийн 76 гэрээг ОРЛОХГҮЙ — HO нь зөвхөн 22 гэрээ хамарна.
   *    `planTotal` ХЭВЭЭР CASHFLOW_NEW-ээс, эс тэгвээс 54 багцад «гэрээний
   *    дүн» алга болж гүйцэтгэлийн хувь бодогдохгүй.
   */
  contractsHo: HoContract[];
};

// ═══════════════════════════════════════════════════════════
//  КОМБО ГРАФИК (envhub хэлээр) — градиентгүй, glow-гүй хавтгай дүрслэл.
//  ⚠️ 2026-10-23: Environment — дахин glow-гүй (2026-10-09-ний гэрэлтэлт хасагдсан); тор нь
//  хэвтээ квартал (0/¼/½/¾/1) БҮГД тасархай `3 4` (ёроол ч), босоо торгүй. Хоёр цуваа: олголт =
//  `--data` бүтэн (доороо .22→.02 талбай), биет = `--chart-plan` тасархай — `cat(0)`/`cat(1)` ХАСАГДСАН.
//  Цэг бүр үргэлж 5px (.5; заасан 1, бусад .15), шошго 10px/400 ink-2, tooltip нь Environment
//  `AreaChart`-ынх шиг ЦЭГИЙН дэргэд; «PointCallout» pill · «SvgHoverMarker» ХАСАГДСАН.
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
  contract = null,
}: {
  items: MonthPt[];
  height?: number;
  /**
   * ГЭРЭЭНИЙ НИЙТ ДҮН, ₮ — биет % -ийг ₮ тэнхлэгт буулгах суурь.
   *
   * ⚠️ 2026-09-25: урьд нь биет % × `yMax` (ӨССӨН ОЛГОЛТЫН дээд) гэж
   *    зурагддаг байв — 30% биет нь «олгосон мөнгөний 30%» өндөрт гарч, ₮
   *    тэнхлэгийн тоотой ямар ч холбоогүй, олголт өсөх бүрд биет муруй
   *    ХӨДӨЛДӨГ байлаа. Одоо: гэрээний дүн өгвөл биет ₮ = % × гэрээ (олголттой
   *    нэг ₮ тэнхлэгт шууд жишигдэнэ); өгөөгүй бол биет нь ӨӨРИЙН 0–100%
   *    тэнхлэгтэй (баруун талд %-ийн шошго).
   */
  contract?: number | null;
  /** Хоцрогдол хэмжсэн сар — тэр сарын БИЕТ багана анивчина */
  lagMonth?: string;
  lagLvl?: 'red' | 'yellow' | null;
  /**
   * БИЕТ гүйцэтгэлийн цуваа, шошго, тултипын мөрийг НУУНА.
   *
   * ⚠️ 2026-08-21: «Багцын санхүү» харагдац нь ЗӨВХӨН мөнгөний асуултад
   * хариулна — биет явц нь «Багцын гүйцэтгэл» талд.
   *
   * ⚠️ 2026-09-06: нуувал график НЭГ цуваатай болно (өссөн олголт) — урьд нь
   * төлөвлөгөө/олголтын хоёр шугам үлддэг байсан. Сарын ТӨЛӨВЛӨГӨӨ нь
   * `cashflow_0813`-тайгаа хамт хасагдсан.
   */
  hidePhys?: boolean;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /* Олголтын талбайн градиентийн id — нэг хуудсанд хэд хэдэн ComboChart байж болно */
  const gid = useId().replace(/:/g, '');
  const N = items.length;

  /*
   * ── Өссөн S-муруйн өгөгдөл — ₮ ТЭНХЛЭГ: олгосон санхүүжилт · биет гүйцэтгэл.
   *
   * ⚠️ 2026-09-06: ТӨЛӨВЛӨГӨӨНИЙ цуваа ХАСАГДСАН. Тэр нь `cashflow_0813`-ийн
   *    «САР» мөрөөс гардаг байсан бөгөөд шинэ `Cashflow_0909`-т он/сарын
   *    багана ОГТ БАЙХГҮЙ. Тиймээс тэнхлэгийн дээд хязгаар нь одоо
   *    ТӨЛӨВЛӨГӨӨ биш, өссөн ОЛГОЛТ. Хоёулаа хоосон бол `1` — 0-д хуваахаас.
   */
  const cums = items.reduce<number[]>((a, it) => { a.push((a[a.length - 1] ?? 0) + it.given); return a; }, []);
  /** Биет нь ӨӨРИЙН %-ийн тэнхлэгтэй эсэх — `contract`-ийн ⚠️ */
  const ownAxis = !(contract != null && Number.isFinite(contract) && contract > 0);
  const physVal = (p: number | null): number | null => (
    p == null || ownAxis ? null : (Math.max(0, Math.min(100, p)) / 100) * (contract as number)
  );
  const yMax = Math.max(1, ...cums, ...(hidePhys ? [] : items.map((it) => physVal(it.phys) ?? 0)));
  const rows = items.map((it, i) => ({
    label: it.label,
    financing: cums[i], // өссөн олгосон санхүүжилт ₮
    /* ⚠️ Дата алга (null) бол 0 өндөртэй цэг зурвал «биет гүйцэтгэл тэг»
       гэсэн ХУДАЛ уншилт өгнө. 2026-09-25: `?? 0` ХАСАГДСАН — урьд нь null
       сар 0 өндөрт буулгагдаж, муруй дундаа тэг рүү унадаг байв; одоо цоорхой. */
    physical: physVal(it.phys), // биет гүйцэтгэлийн үнэ цэнэ ₮ (өөр тэнхлэгтэй бол null)
    physPct: it.phys, // шошго/тултипт харуулах биет % (null = хэмжигдээгүй)
    givenCum: cums[i],
    it,
  }));
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
  /* баруун — сүүлийн шошгыг багтаах зай; биет өөрийн тэнхлэгтэй бол «100%» шошго */
  const padR = ownAxis && !hidePhys ? 40 : 30;
  const padT = 26;
  const padB = 30;  // доор — ЗӨВХӨН он сар (хувиуд tooltip руу шилжсэн)

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xFor = (i: number) => padL + (N <= 1 ? plotW / 2 : (i / (N - 1)) * plotW);
  const yFor = (v: number) => padT + (1 - Math.max(0, Math.min(yMax, v)) / yMax) * plotH;
  /** Биет цэгийн Y — ₮ тэнхлэгт (гэрээтэй) эсвэл өөрийн 0–100% тэнхлэгт */
  const yPhys = (r: { physical: number | null; physPct: number | null }) => (
    ownAxis
      ? padT + (1 - Math.max(0, Math.min(100, r.physPct ?? 0)) / 100) * plotH
      : yFor(r.physical ?? 0)
  );

  /* Сүүлийн УТГАТАЙ цэгүүд — тэдгээр дээр л шошго, том цэг үлдэнэ */
  const lastGiven = rows.reduce((a, r, i) => (r.givenCum > 0 ? i : a), -1);

  /* Цэгүүдийг нэг л удаа бодно — зам, шошго бүгд эндээс */
  const givenPts = rows.slice(0, lastGiven + 1).map((r, i) => ({ x: xFor(i), y: yFor(r.givenCum) }));
  /*
   * ⚠️ 2026-09-25: БИЕТ муруй ХЭСЭГЧИЛЖ зурагдана — хэмжигдээгүй (null) сар
   *    ЦООРХОЙ үлдэнэ (null ≠ 0). Урьд нь бүх сар нэг замд орж, null сар 0
   *    өндөрт буугаад муруй дундаа тэг рүү унадаг байв.
   */
  /* ⚠️ 2026-10-09 («графикийн жигдрэл»): тасалгааг `chartStyle.lineSegments` хийнэ (null =
     цоорхой) — локал Catmull-Rom `smoothPath` ХАСАГДСАН: тэр нь хуримтлагдсан муруйд
     ХЭТЭРЧ (overshoot) «олголт буурсан» мэт унжилт гаргадаг байв. Одоо МОНОТОН. */
  const physSegs = lineSegments(rows.slice(0, lastPhys + 1).map((r, i) => (
    r.physPct == null ? null : { x: xFor(i), y: yPhys(r) }
  )));
  const givenSegs = lineSegments(givenPts);

  /* ⚠️ ЗӨРҮҮГИЙН ТАЛБАЙ (төлөвлөгөө ↔ олголт) 2026-09-06-нд ХАСАГДСАН —
     төлөвлөгөөний муруй байхгүй болсон тул будах зай ч байхгүй. */

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
  /** Цэгийн тунгалаг — Environment `AreaChart`: энгийн .5, заасан 1, бусад .15 */
  const dotOp = (i: number) => (hi == null ? 0.5 : i === hi ? 1 : 0.15);

  const anchorFor = (i: number): 'start' | 'middle' | 'end' => (i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle');

  /*
   * ── ШОШГЫН БАГТААМЖ ──
   * ⚠️ 2026-09-03: урьд нь `ceil(N/8)` гэсэн ТОГТМОЛ АЛХМААР сонгодог байсан
   *    бөгөөд дээрээс нь сүүлийн цэгийг үргэлж нэмдэг байв. N=12 үед алхам 2
   *    болж, 10 ба 11-р цэг ЗЭРЭГЦЭЭ шошготой болно: 17 оронтой дүн ~105px
   *    эзэлдэг атлаа цэг хоорондын зай ердөө ~104px тул хоёр тоо дээр
   *    дээрээсээ давхарлан бичигддэг байлаа. Одоо ЖИНХЭНЭ өргөнөөр нь хэмжиж,
   *    багтахыг нь л үлдээнэ (`fitLabels`) — эхэн ба төгсгөл хэвээр.
   * ⚠️ Цуваа бүр ТУСДАА: олголт муруйнхаа дээр, биет доор бичигддэг тул
   *    хоорондоо мөргөлдөхгүй; нэг цувааны дотор л зай шалгах ёстой.
   */
  /* ⚠️ 2026-10-23: Environment `AreaChart` — эхлээд ≥11% алхмаар сийрэгжүүлнэ (эхний ба сүүлчийнх
     ҮРГЭЛЖ, сүүлчийнхтэй 11%-иас ойр завсрынх алгасна), дараа нь дээрх ⚠️-ийн ЖИНХЭНЭ пикселийн
     багтаамж (`fitLabels`). Дунд цэгүүдийн утга харагдсаар (зөвхөн төгсгөл БИШ). */
  const envThin = (i: number, last: number) => {
    if (N <= 1 || i === 0 || i === last) return true;
    const gap = 100 / (N - 1);
    const step = Math.max(1, Math.ceil(11 / gap));
    return i % step === 0 && (last - i) * gap >= 11;
  };
  const fitFor = (last: number, valOf: (r: typeof rows[number]) => string) => new Set(
    fitLabels(rows.slice(0, last + 1).map((r, i) => ({
      i,
      x: xFor(i),
      w: textW(valOf(r)),
      anchor: anchorFor(i),
    })).filter((l) => envThin(l.i, last))),
  );
  const givenLbl = fitFor(lastGiven, (r) => num(r.givenCum));
  /* ⚠️ 2026-10-09: `pct(v, 1)` — диаграм ба tooltip НЭГ формат (урьд нь toFixed(0) vs toFixed(1)) */
  const physLbl = fitFor(lastPhys, (r) => pct(r.physPct, 1));
  /* X тэнхлэгийн он·сар — «2026-09» тогтмол 7 тэмдэгт */
  const axisLbl = new Set(fitLabels(rows.map((r, i) => ({
    i, x: xFor(i), w: textW(r.label, 11), anchor: anchorFor(i),
  })), 14));

  /** Гарын удирдлагын анхдагч цэг — сүүлийн утгатай сар (эсвэл сүүлийн сар) */
  const homeIdx = Math.max(lastGiven, lastPhys) >= 0 ? Math.max(lastGiven, lastPhys) : N - 1;

  return (
    <div
      className={f.chartWrap}
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={() => setHi(null)}
      /* ⚠️ 2026-10-09 («графикийн жигдрэл»): ГАРААР ч уншигдана — ProgChart-ын 2026-10-06-ны
         дүрэмтэй ижил. Tab-аар фокуслоход сүүлийн утгатай сар дээр зогсож, ←/→ сараар,
         Home/End эхлэл/төгсгөл рүү; уншилт нь доорх `aria-live` мөрөнд. */
      tabIndex={N > 0 ? 0 : undefined}
      role="group"
      aria-label={tr('{0} — сар сонгохдоо ← → товч', tr('Санхүүжилтийн явц'))}
      onFocus={() => setHi((h) => h ?? homeIdx)}
      onBlur={() => setHi(null)}
      onKeyDown={(e) => {
        if (!N) return;
        const cur = hi ?? homeIdx;
        const next = e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowRight' ? cur + 1
          : e.key === 'Home' ? 0 : e.key === 'End' ? N - 1 : null;
        if (next == null) return;
        e.preventDefault();
        setHi(Math.max(0, Math.min(N - 1, next)));
      }}
    >
      {/* Дэлгэц уншигчийн уншилт — tooltip-тэй ИЖИЛ тоо */}
      <span aria-live="polite" className={f.srOnly}>
        {pt ? [
          pt.label,
          `${tr('Олгосон санхүүжилт')}: ${pt.givenCum > 0 ? mnt(pt.givenCum) : '—'}`,
          ...(hidePhys ? [] : [`${tr('Биет гүйцэтгэл')}: ${pct(pt.physPct, 1)}`]),
        ].join(', ') : ''}
      </span>
      <svg
        className={f.comboSvg}
        style={{ height: H }}
        viewBox={`0 0 ${W} ${H}`}
        /* ⚠️ `preserveAspectRatio="none"` ХАСАГДСАН: `viewBox` нь одоо бодит
           пикселтэй тэнцүү тул сунгах шаардлагагүй — үсэг гажихаа болив. */
        role="img"
        aria-label={tr('Санхүүжилтийн явц: олгосон санхүүжилт, биет гүйцэтгэл')}
      >
        {/* ── ТОР ба Y тэнхлэг ──
            ⚠️ 2026-09-01: шошго нь урьд торны ДЭЭР, зүүн ирмэгт наалддаг байсан
            (богино товчилсон дүн тул зай эдийг нь хэмнэдэг байв). Дүн бүтнээр
            бичигдэх болсноор муруйн эхлэлийг халхалдаг тул ТУСДАА багана
            (`padL`) гаргаж, баруун зэрэгцүүлэв. Мөн 5 биш 4 шугам — нягт тор
            нь өгөгдлөөс илүү анхаарал татдаг. */}
        {/* ⚠️ 2026-10-09 (лавлах CRM загвар — өнгө хэвээр): БОСОО тор — он·сарын шошготой сар бүрд
            1px `--chart-grid`; хэвтээ 4 шугам (тэнхлэгийн тоо) хэвээр.
            ⚠️ 2026-10-23: Environment — БОСОО тор ХАСАГДСАН; хэвтээ нь 1px ТАСАРХАЙ.
            ⚠️ 2026-10-23 (Environment `AreaChart`): 4 шугам (⅓) → КВАРТАЛ 0/¼/½/¾/1, БҮГД тасархай `3 4`
               (ёроол ч — урьдын бүтэн/`3 3` зөрүү засагдсан); Y шошго 9px бүтэн тунгалаг. */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const gy = yFor(t * yMax);
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={gy} y2={gy} className={f.curveGrid} />
              <text x={padL - 8} y={gy + 3} className={f.sAxisY} textAnchor="end">
                {t === 0 ? '0' : num(t * yMax)}
              </text>
              {/* ⚠️ 2026-09-25: биет ӨӨРИЙН тэнхлэгтэй үед (гэрээний дүнгүй) баруун
                  талд %-ийн шошго — ₮ шошгоор биет муруйг уншуулахгүй. */}
              {ownAxis && !hidePhys && (
                <text x={W - padR + 6} y={gy + 3} className={f.sAxisY} textAnchor="start" style={{ fill: PHYS }}>
                  {pct(t * 100, 0)}
                </text>
              )}
            </g>
          );
        })}

        {/* ХОЦРОГДСОН САР — тасархай босоо шугам + лугшдаг цэг */}
        {lagMonth != null && lagLvl != null && (() => {
          const li = rows.findIndex((r) => r.label === lagMonth);
          if (li < 0) return null;
          const color = lagLvl === 'red' ? 'var(--bad)' : 'var(--warn)';
          const cx = xFor(li);
          return (
            <g>
              {/* ⚠️ 2026-10-09: өнгө `style`-аар — SVG presentation ШИНЖ (`stroke=`/`fill=`)
                  дотор `var()` задардаггүй (format.ts-ийн дүрэм); урьд нь attribute байв. */}
              <line
                x1={cx} x2={cx} y1={padT} y2={padT + plotH}
                style={{ stroke: color, strokeWidth: 1.5, strokeDasharray: '4 4', opacity: 0.45 }}
              />
              {rows[li].physPct != null && (
                <circle
                  cx={cx} cy={yPhys(rows[li])} r={5} style={{ fill: color }}
                  className={lagLvl === 'red' ? f.barBlinkRed : f.barBlinkYellow}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })()}

        {/* ── МУРУЙНУУД — олгосон санхүүжилт (зузаан, бүтэн) ба биет гүйцэтгэл ── */}
        {/* ⚠️ 2026-10-09: хоёр шугам 2px (`CHART.stroke`; урьд олголт 2.8).
            ⚠️ 2026-10-09 (лавлах CRM загвар — өнгө хэвээр): цувааныхаа өнгөөр ГЭРЭЛТЭНЭ (`glow`;
            хэвлэхэд `chartGlow` унтраана). Дээрх «градиентгүй, glow-гүй» envhub-ийн хэлийг ОРЛОНО.
            ⚠️ 2026-10-23: Environment — гэрэлтэлт ХАСАГДСАН (2px цул шугам).
            ⚠️ 2026-10-23 (Environment `AreaChart`): олголтын муруйн ДООР `--data` .22→.02 градиент
               талбай; биет нь `--chart-plan` ТАСАРХАЙ (`CHART.planDash`, `butt` үзүүр) — нэг өнгөт
               графикт хоёр цувааг хэлбэрээр ялгана. */}
        <defs>
          <linearGradient id={`cmb-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: ACT, stopOpacity: CHART.areaTop }} />
            <stop offset="100%" style={{ stopColor: ACT, stopOpacity: CHART.areaBottom }} />
          </linearGradient>
        </defs>
        {givenSegs.map((seg) => (seg.single ? null : (
          <path
            key={`ga-${seg.from}`}
            d={`${seg.d} L${seg.pts[seg.pts.length - 1].x},${padT + plotH} L${seg.pts[0].x},${padT + plotH} Z`}
            style={{ fill: `url(#cmb-${gid})`, stroke: 'none' }}
          />
        )))}
        {givenSegs.map((seg) => (seg.single ? null : (
          <path key={`gs-${seg.from}`} d={seg.d} className={f.actLine} style={{ stroke: ACT, strokeWidth: CHART.stroke }} vectorEffect="non-scaling-stroke" />
        )))}
        {/* Ганцаарчилсан хэмжилт (хоёр талдаа цоорхой) — шугамгүй; цэгийг доорх ЦЭГҮҮД давхарга зурна */}
        {physSegs.map((seg) => (seg.single ? null : (
          <path
            key={`ps-${seg.from}`}
            d={seg.d}
            className={f.physLine}
            style={{ stroke: PHYS, strokeWidth: CHART.stroke, strokeDasharray: CHART.planDash, strokeLinecap: 'butt' }}
            vectorEffect="non-scaling-stroke"
          />
        )))}

        {/* ── HOVER — босоо шугам ──
            ⚠️ 2026-10-23 (Environment `AreaChart`): crosshair нь `--data` 1px `2 2` .7; заасан сарын
               7px тэмдэг (`SvgHoverMarker`) ХАСАГДСАН — цэг нь доорх давхаргад 1 тунгалагтай тодорно. */}
        {hi != null && (
          <line x1={xFor(hi)} x2={xFor(hi)} y1={padT} y2={padT + plotH} className={f.curveCursor} />
        )}

        {/* ── ЦЭГҮҮД — Environment `AreaChart`: 5px + 2px `--surface` цагираг, ҮРГЭЛЖ харагдана
            (.5; заасан сар 1, бусад .15; томруулахгүй). ⚠️ Биет нь зөвхөн ХЭМЖИГДСЭН сард (null ≠ 0). */}
        {rows.map((r, i) => (i <= lastGiven ? (
          <circle
            key={`gd-${i}`}
            cx={xFor(i)}
            cy={yFor(r.givenCum)}
            r={CHART.markerR + CHART.ring / 2}
            className={f.sDot}
            style={{ fill: ACT, strokeWidth: CHART.ring, opacity: dotOp(i) }}
          />
        ) : null))}
        {rows.map((r, i) => (i <= lastPhys && r.physPct != null ? (
          <circle
            key={`pd-${i}`}
            cx={xFor(i)}
            cy={yPhys(r)}
            r={CHART.markerR + CHART.ring / 2}
            className={f.sDot}
            style={{ fill: PHYS, strokeWidth: CHART.ring, opacity: dotOp(i) }}
          />
        ) : null))}

        {/* ── ЦЭГ БҮР ДЭЭР УТГА ──
            ⚠️ Зөвхөн эцсийн утга үзүүлэх нь БУРУУ байв: 12 сарын урт графикийг
               гаргаад ганц тоо уншуулах юм бол график хэрэггүй. Сар бүрийн
               утга нүдэнд харагдах ёстой.
            ⚠️ Мөргөлдөхөөс сэргийлэх дүрэм: олголт нь муруйнхаа ДООР, биет нь
               түүнээс илүү доор бичигдэнэ — хоёр цуваа ойртсон ч давхцахгүй. */}
        {/* ⚠️ 2026-10-23 (Environment `AreaChart`): бичиг 10px/400 `--ink-2` (заасан сард `--ink`),
            halo-гүй; заасан сарын бичиг ч ҮЛДЭНЭ (pill хасагдсан). */}
        {rows.map((r, i) => {
          if (i > lastGiven || r.givenCum <= 0 || !givenLbl.has(i)) return null;
          const x = xFor(i);
          const y = yFor(r.givenCum);
          return (
            <g key={`gv-${i}`}>
              <text x={x} y={Math.min(padT + plotH - 4, y + 16)} className={`${f.ptVal} ${i === hi ? f.ptValOn : ''}`} textAnchor={anchorFor(i)}>
                {num(r.givenCum)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          // ⚠️ `== null` (`<= 0` БИШ): 0% нь бодит хэмжилт тул шошготой байна
          if (i > lastPhys || r.physPct == null || !physLbl.has(i)) return null;
          const x = xFor(i);
          const y = yPhys(r);
          return (
            <g key={`ph-${i}`}>
              <text x={x} y={Math.min(padT + plotH - 4, y + 28)} className={`${f.ptVal} ${i === hi ? f.ptValOn : ''}`} textAnchor={anchorFor(i)}>
                {pct(r.physPct, 1)}
              </text>
            </g>
          );
        })}

        {/* ── X тэнхлэг — ЗӨВХӨН он сар. Хоёр хувийн мөр tooltip руу шилжсэн:
            тэдгээр нь харьцуулах биш, лавлах тоо тул байнга харагдах шаардлагагүй
            бөгөөд график доор гурван мөр эзэлж, муруйд өгөх зайг иддэг байв. */}
        {rows.map((r, i) => (axisLbl.has(i) ? (
          <text key={r.label} x={xFor(i)} y={H - 10} className={`${f.axisX} ${i === hi ? f.axisXOn : ''}`} textAnchor={anchorFor(i)}>
            {r.label}
          </text>
        ) : null))}
      </svg>

      {/* ── TOOLTIP — задаргаа бүхэлдээ энд ──
          ⚠️ 2026-10-07: `xFor(hi)` пикселээр — `viewBox` = бодит өргөн (`W` = wrap) тул
             муруйн цэгтэй яг давхцана; урьд нь wrap-ийн %-оор тул `padL`-ийн хэрээр зүүн тийш зөрдөг байв.
          ⚠️ 2026-10-23 (Environment `AreaChart` Tooltip): курсорын дээд талд биш ЦЭГИЙН дэргэд —
             t < .22 зүүнээс, > .78 баруунаас, бусад голлуулна; цэг дээд 45%-д бол ДООР, эс бөгөөс ДЭЭР
             (10px зай). Утгын pill (`PointCallout`) ХАСАГДСАН — утга нь энд 17px-ээр. */}
      {pt && hi != null && (() => {
        /* Түшиц цэг — олголт (байвал), эс бөгөөс хэмжигдсэн биет, эс бөгөөс ёроол */
        const ty = hi <= lastGiven ? yFor(pt.givenCum)
          : hi <= lastPhys && pt.physPct != null ? yPhys(pt) : padT + plotH;
        const t = (xFor(hi) - padL) / Math.max(1, plotW);
        const shift = t < 0.22 ? '0%' : t > 0.78 ? '-100%' : '-50%';
        const below = (ty / H) * 100 < 45;
        /* Сарын олголт = өссөн дүнгийн өөрчлөлт (Environment-ийн ▲/▼ мөр) */
        const d = hi > 0 ? pt.it.given : null;
        return (
          <div
            className={f.tip}
            style={{ left: xFor(hi), top: ty, transform: `translate(${shift}, ${below ? '10px' : 'calc(-100% - 10px)'})` }}
          >
            <div className={f.tipHd}>
              <span className={f.tipDot} style={{ background: ACT }} />
              <span className="num">{pt.label}</span>
            </div>
            <div className={f.tipBody}>
              <div className={f.tipMain}>
                <span className={`num ${f.tipBig}`} style={{ color: ACT }}>{pt.givenCum > 0 ? num(pt.givenCum) : '—'}</span>
                <span className={f.tipUnit}>₮ · {tr('Олгосон санхүүжилт')}</span>
              </div>
              {d != null && pt.givenCum > 0 && (
                <div className={f.tipMeta}>
                  <span className="num" style={{ color: d !== 0 ? 'var(--data)' : 'var(--ink-3)' }}>
                    {d > 0 ? '▲' : d < 0 ? '▼' : '='} {num(Math.abs(d))} ₮
                  </span>
                </div>
              )}
              {!hidePhys && (
                <p className={f.tipRow}>
                  <i className={f.tipSwDash} />
                  {/* «—» = ХЭМЖИГДЭЭГҮЙ; жинхэнэ 0% нь «0.0%» гэж гарна */}
                  {tr('Биет гүйцэтгэл')}<b className="num">{pct(pt.physPct, 1)}</b>
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ДАТА
// ═══════════════════════════════════════════════════════════

/**
 * Санхүүжилтийн бүх дата — CASHFLOW_NEW (гэрээ) + IPC (олгосон, цэвэрлэсэн) +
 * TASK_SHEET (биет гүйцэтгэл, сарын эцсийн байдлаар).
 * ⚠️ export — «Барилгын цогц хяналт» (Tsogts) мөн энэ ГАНЦ ачаалагчийг ашиглана.
 * ⚠️ 5 мин кэш (2026-08-21 гүйцэтгэлийн аудит): Нүүр (супер) · Tsogts · Санхүү
 *   гурвуулаа дууддаг тул харагдац сэлгэх бүрд 3 query + O(багц×сар×блок)
 *   тооцоо ДАХИН хийгддэг байв.
 */
/* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): хуваарийн муруй УНАСАН/ХАГАС үед кэшлэхгүй (`planCurveComplete`) —
   урьд нь тэр үр дүн 1 мин (TTL) кэшлэгдэж, муруйг дахин уншихгүй тул `lagOf` · «Багц ажлын оноо»
   муруйгүйгээр бодогдсоор байв. Одоо дараагийн дуудалт муруйг дахин оролдоно. */
/* ⚠️ 2026-10-01: `HUVAARI_OBYEM` — хуваарийн муруй (`loadPlanCurveCached`) сарын обьёмын батлалтаар
   хаягддаг; энэ кэш ч дагаж хаягдахгүй бол `lagOf` 1 мин хуучин муруйгаар бодно. */
export const loadFinData = cached(loadFinDataRaw, LIVE_TTL, ['HO_IPC', 'CASHFLOW_NEW', 'BAGTS_SHEET', 'HUVAARI_OBYEM'], () => planCurveComplete());

/**
 * ГЭРЭЭНИЙ БҮРТГЭЛ — НЭГ кэштэй эх (2026-08-24 аудит): урьд нь
 * `loadFinDataRaw` ба `loadFinRegister` ижил хүснэгтийг тус тусдаа
 * '*'-аар татдаг тул Нүүр (ExecKpi) · Багцын санхүү · Санхүүжилт гурвыг
 * дараалан нээхэд давхар татагдаж, 6 слотын хязгаарлагчийг дэмий эзэлдэг
 * байв.
 *
 * ⚠️ `outFields: '*'` ХЭВЭЭР — Санхүүгийн бүртгэл (FullTable) үйлчилгээний
 * талбар БҮРИЙГ баганаар харуулдаг тул нарийсгаж болохгүй.
 *
 * ⚠️ 2026-09-06: хуучин `cashflow_0813`-ийн ачаалагч (`loadCashflowRows`)
 * ХАСАГДСАН — хоёр хүснэгт зэрэг татдаг байсан нь одоо нэг болов.
 */
const loadCashflowNewRows = cached(
  () => queryFeatures(CASHFLOW_NEW.url, { where: CF_WORK_WHERE, outFields: ['*'], orderBy: `${CASHFLOW_NEW.oid} ASC` }),
  LIVE_TTL,
  ['CASHFLOW_NEW'],
);
/**
 * САРЫН ЗАДАРГАА — S-муруйн төлөвлөгөө (`Cashflow_final`-ийн доторх мөрүүд).
 *
 * ⚠️ АЖЛЫН мөрөөс ТУСДАА уншина: гол хүснэгт нь 78 ажлын мөр л байх ёстой
 * (`CF_WORK_WHERE`), эдгээр нь 5-р түвшинд ажлынхаа доор нэмэгдэнэ.
 * ⚠️ Хоосон буцаж БОЛНО — сарын мөр үүсээгүй эсвэл устсан үед хүснэгт
 * хуучин байдлаараа ажиллах ёстой.
 */
const loadCfMonthRows = cached(
  () => queryFeatures(CASHFLOW_NEW.url, {
    where: CF_MONTH_WHERE,
    outFields: ['*'],
    /* ⚠️ 2026-10-06 (аудит): oid-ийн tiebreak ЗААВАЛ — ижил (ID, start)-тай мөр (давхардсан
       сар) хуудас хооронд дараалал нь тогтворгүй тул давхардах/алгасагдах эрхтэй. */
    orderBy: `cashflow_id ASC, cashflow_start ASC, ${CASHFLOW_NEW.oid} ASC`,
    /* ⚠️ 2026-10-05: `limit: 8000` ХАСАГДАВ — 8000-аас давсан сарын мөр ЧИМЭЭГҮЙ тайрагдаж,
       тайрагдсан ажлын сарууд «байхгүй» мэт харагдан хугацаа засахад дахин нэмэгдэх
       эрсдэлтэй байв. `queryFeatures` нь `orderBy`-той үед бүх хуудсыг өөрөө татна. */
  }),
  LIVE_TTL,
  ['CASHFLOW_NEW'],
);
/* ⚠️ Төлбөрийн мөрийн ачаалагч нь `@/lib/ipc`-ийн `loadHoRows` — энд ДАВХАР
   тодорхойлохгүй (хоёр кэш үүсвэл ижил хүснэгт хоёр удаа татагдана). Тэнд
   `orderBy: OBJECTID ASC` заавал байдаг: ArcGIS эрэмбэгүй хариуны дарааллыг
   баталгаажуулдаггүй бөгөөд `groupHo`-ийн «эхний мөрөөр dedup» нь тогтвортой
   дараалал шаардана. */

/**
 * ХУВААРИЙН МУРУЙН МОДУЛ-ТҮВШНИЙ КЭШ — `lagOf` СИНХРОН тул үүнээс уншина.
 *
 * ⚠️ ЯАГААД кэш (2026-09-04): `lagOf(months)` нь гурван файлаас (ExecKpi ·
 *    PkgProg · PkgFin) синхроноор дуудагддаг ба гарын үсгийг нь өөрчилж
 *    болохгүй (тэр гурав энэ агентын эзэмшилд биш). Хуваарийн муруй нь
 *    сүлжээнээс ирдэг тул модулын кэшээр дамжуулна.
 *
 * ⚠️ Кэшийг `loadFinDataRaw` дотор ЗААВАЛ бөглөнө — `lagOf`-ийн БҮХ дуудагч
 *    эхлээд `loadFinData()`-г await хийдэг тул муруй нь хоцорч ирээд «alert
 *    гарч ирэхгүй» гэсэн уралдаан ҮҮСЭХГҮЙ. Хэрэв ирээдүйд `lagOf`-ийг
 *    `loadFinData`-гүйгээр дуудвал `null` (хоцрогдол мэдэгдэхгүй) буцна —
 *    ХУДАЛ УЛААНААС дээр, гэхдээ энэ хамаарлыг санах хэрэгтэй.
 */
let planCurveCache: PlanCurve | null = null;
/**
 * ТӨСЛИЙН (орон сууцны) ТӨЛӨВЛӨГӨӨ — ХО дүнгээр жигнэсэн (`projectPlanOf`), `lagOf`-ийн
 * БАГЦГҮЙ (төслийн нэгтгэл) зам үүнийг уншина. `planCurveCache`-тэй ХОС бөглөгдөнө.
 * ⚠️ 2026-09-30: урьд нь `lagOf` төслийн түвшинд `PlanCurve.months` (БЛОКИЙН тоогоор)
 *    уншдаг байсан тул ХО-оор жигнэсэн бодит (`aggregateMonths`)-аас хасахад хоёр өөр
 *    жин холилдож байв (`gdash.housingPlanSeries`-ийн ⚠️).
 */
let planProjectCache: PlanPoint[] | null = null;

/**
 * ХУВААРИЙН МУРУЙ БҮРЭН УНШИГДСАН ЭСЭХ — `loadFinData`-ийн кэшийн `keep`.
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): унасан (`null`) эсвэл ХАГАС
 *    (`failed.length`) муруйтай үр дүнг кэшлэхгүй.
 */
export function planCurveComplete(): boolean {
  return planCurveCache != null && planCurveCache.failed.length === 0;
}

/**
 * ТУХАЙН БАГЦЫН ХУВААРИЙН МУРУЙ УНШИГДААГҮЙ ЮУ — `lagOf` `null` буцаасны ШАЛТГААНЫГ ялгана.
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): «Багц ажлын оноо» муруй унасан үед барилгын
 *    мөрийг ЧИМЭЭГҮЙ Cashflow-ийн хувиар (огнооны шугам) оноолдог байв. Одоо дуудагч
 *    үүгээр «хуваарь уншигдаагүй»-г «хуваарьгүй/хэмжилтгүй»-гээс ялгаж картад тэмдэглэнэ.
 * @param key багцын түлхүүр (`bagtsKey`) — өгөөгүй бол ТӨСЛИЙН муруй
 *   (аль нэг хуудас унасан бол төслийн муруй хоосон — `PlanCurve.failed`-ийн ⚠️).
 */
export function planCurveMissing(key?: string | null): boolean {
  const pc = planCurveCache;
  if (!pc) return true;
  if (!pc.failed.length) return false;
  if (!key) return true;
  return PKGS.some((p) => pc.failed.includes(p.key) && bagtsKey(p.group) === key);
}

/**
 * ТӨСЛИЙН «ОРОН СУУЦНЫ» НЭГТГЭЛИЙН БАГЦУУД — `gdash.HOUSING_PKGS` (`housingMoney`-тэй НЭГ олонлог).
 * ⚠️ 2026-10-22 (аудит): 2026-10-13-нд блокгүй (дэд бүтцийн) багцууд `phys`-д орсноос хойш «Орон сууцны
 *    гүйцэтгэл» шошготой `physNow`/`aggregateMonths` 21 багцаар бодогдож (23.10%) орон сууц дангаараа (24.55%)-аас
 *    зөрж, төлөвлөгөө (хуваарьтай 7 багц) ба зөрүү өөр олонлогоос гардаг байв. Одоо төслийн нэгтгэл · төлөвлөгөө ·
 *    хоцрогдол бүгд ЭНЭ олонлогоор; дэд бүтэц өөрийн ангилалд (`physNowOf`), багц бүрийн цуваа (`contractMonths`) хэвээр.
 */
const HOUSING_SET: ReadonlySet<string> = new Set(HOUSING_PKGS);
const housingKeys = (fin: Pick<FinData, 'phys' | 'physN'>): string[] =>
  [...new Set([...fin.phys.keys(), ...(fin.physN?.keys() ?? [])])].filter((k) => HOUSING_SET.has(k));

/**
 * ТӨСЛИЙН ТӨЛӨВЛӨГӨӨТ ХУВИЙН ЦУВАА — бодит тал (`pkgShared.aggregateMonths`/`physNow`)-тай
 * ЯГ НЭГ жин (`gdash.pkgCostWeight` ← ижил `contracts`). PkgProg `TsKpi` + графикийн
 * төслийн муруй · удирдлагын тайлан · `lagOf` (Дашбоард, PkgFin) бүгд ЭНЭ функцээр.
 */
export function projectPlanOf(fin: Pick<FinData, 'contracts' | 'phys' | 'physN'>, pc: PlanCurve): PlanPoint[] {
  /* ⚠️ 2026-10-09 (аудит): багцын олонлог бодит талтай (`phys` ∪ `physN`) НЭГ —
     `gdash.housingPlanSeries`-ийн `pkgs` ⚠️ (хуваарьгүй багц хоцрогдлыг хэтрүүлэхгүй)
     ⚠️ 2026-10-09 (аудит №2): хуваарьгүй багц байвал ХООСОН буцаахаа БОЛИВ — шугам
     ХУВААРЬТАЙ багцаар; хоцрогдлын бодит тал ч ТЭР олонлогоор (`physLag`, `projectLagNow`).
     ⚠️ 2026-10-22 (аудит): бодит тал орон сууцаар (`housingKeys`) тул энд ч мөн — дэд бүтэц «хасагдсан
     хуваарьгүй багц» болж «(хуваарьтай багцаар)» тэмдэглэл, тусдаа бодит (`physLag`) үүсгэхгүй. */
  const pkgs = housingKeys(fin);
  return housingPlanSeries(pc.byBagts, pkgCostWeight(fin.contracts.map(cfWeightRow)), pc.months, pkgs);
}

/**
 * ⚠️ 2026-10-09 (аудит №2): ХОЦРОГДЛЫН БАГЦЫН ОЛОНЛОГ (`gdash.planScope`) — `keys` = хуваарьтай
 * (түлхүүрээр), `excluded` = бодит талд жинтэй боловч хуваарьгүй (БАГЦЫН НЭРЭЭР, `PKGS.group`).
 * Муруй алга бол `null` (хоцрогдол аль хэдийн «тодорхойгүй»).
 */
export function projectPlanScope(
  fin: Pick<FinData, 'contracts' | 'phys' | 'physN'>,
  pc: PlanCurve | null = planCurveCache,
): { keys: Set<string>; excluded: string[] } | null {
  if (!pc) return null;
  /* ⚠️ 2026-10-22 (аудит): орон сууцны олонлог (`housingKeys`) — `projectPlanOf`-той нэг */
  const sc = planScope(pc.byBagts, pkgCostWeight(fin.contracts.map(cfWeightRow)), housingKeys(fin));
  /* PKGS-д алга (дэд бүтэц г.м.) бол «БАГЦ14» → «Багц 14» */
  const name = (k: string) => PKGS.find((p) => bagtsKey(p.group) === k)?.group ?? k.replace(/^БАГЦ/, 'Багц ');
  return { keys: sc.keys, excluded: sc.excluded.map(name) };
}

/**
 * ⚠️ 2026-10-09 (аудит №2): ТӨСЛИЙН ХОЦРОГДОЛ «ОДОО» — төлөвлөгөө (`projectPlanOf`) ба бодит
 * (`physLag`) ХОЁУЛАА хуваарьтай багцаар (нэг олонлог). PkgProg `TsKpi` · удирдлагын тайлан ·
 * ТУХ-ийн нэг дүрэм. `actual` нь ХАРЬЦУУЛАЛТЫН тал — толгойн тоо (`physNow`) биш;
 * `excluded` хоосон бол хоёр ЯГ ижил. Хэмжилтийн өдөр — `measureDayOf` (`lagOf`-той нэг).
 * ⚠️ 2026-10-22 (аудит): `coverage` — төлөвлөгөөний муруйн хуваарийн хамралт (`planCoverage`, ХО жингээр);
 *    `coverageOk` биш бол дуудагч хоцорсон/хэвийн гэж ДҮГНЭХГҮЙ, төлөвлөсөн %-ийн хажууд `coverageNote`.
 */
export function projectLagNow(
  fin: FinData,
  pc: PlanCurve | null,
  nowYm: string = monthKey(),
  today: string = dayKey(Date.now()),
): { planned: number | null; actual: number | null; gap: number | null; measAt: string; physAsOf: string; excluded: string[]; coverage: number | null } {
  const sc = projectPlanScope(fin, pc);
  let last: { label: string; phys: number; physAt: string | null | undefined } | null = null;
  for (const m of aggregateMonths(fin, pc)) {
    if (m.label > nowYm) continue;
    const v = m.physLag !== undefined ? m.physLag : m.phys;
    if (v != null) last = { label: m.label, phys: v, physAt: m.physLagAt !== undefined ? m.physLagAt : m.physAt };
  }
  const measAt = last ? measureDayOf(last.label, last.physAt, today) : `${nowYm}-31`;
  const plan = pc?.months.length ? projectPlanOf(fin, pc) : [];
  const planned = plan.length ? planPctAt(plan, measAt) : null;
  const actual = last ? last.phys : null;
  return {
    planned, actual,
    gap: planned != null && actual != null ? planned - actual : null,
    measAt,
    physAsOf: last ? (last.physAt ?? last.label) : '',
    excluded: sc?.excluded ?? [],
    coverage: plan.length ? planCoverage(plan) : null,
  };
}

/* ⚠️ 2026-10-09 (аудит №2): тэмдэглэл нь цэвэр `gdash`-д (ExecReport/PDF Finance-гүй ашиглана) */
export { planScopeNote } from '@/lib/gdash';

/**
 * ТӨСЛИЙН НЭГДСЭН сарын цэгүүд — IPC олголт + ХО дүнгээр жигнэсэн биет гүйцэтгэл.
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): `pkgShared.ts`-ээс ЭНД шилжив (тэр нь
 *    дахин экспортлодог — дуудагчид хөндөгдөөгүй). «Багцын мэдээлэл» (`Bagts.tsx`)
 *    сонголтгүй үедээ «Гүйцэтгэл»-ийн толгойтой ЯГ нэг тоо (`physNow`) харуулах ёстой,
 *    харин `pkgShared` нь `Bagts`-ээс утга импортолдог тул `Bagts → pkgShared` импорт
 *    модулийн мөчлөг (TDZ) үүсгэнэ. `Finance` нь хоёулангаас нь юу ч авдаггүй.
 * ⚠️ 2026-09-06: САРЫН ТӨЛӨВЛӨГӨӨ (`amount`/`amountCum`/`cumPct`) ХАСАГДСАН.
 */
export function aggregateMonths(
  d: FinData,
  pc: PlanCurve | null = planCurveCache,
): { label: string; given: number; phys: number | null; physAt: string | null; physLag?: number | null; physLagAt?: string | null }[] {
  /* ⚠️ Тэнхлэгийг өгөгдөлд БАЙГАА саруудаас угсрахгүй — хэмжилтгүй сар
     (2026-01) мөр ҮҮСГЭДЭГГҮЙ тул график нэг нүд шилжинэ. */
  const labels = cfMonthAxis();
  /*
   * ⚠️ 2026-09-25: `FinData.phys` нь ЗӨВХӨН шинэ бичилттэй сард цэгтэй
   *    (`finPhys.buildPhys`-ийн дүрэм 2). Нэгтгэлд багц бүрийн СҮҮЛИЙН мэдэгдэж
   *    буй утгыг (as-of) авч, ТОГТМОЛ жинтэй жигнэнэ; хараахан тайлагнаагүй багц 0%.
   * ⚠️ 2026-09-30: ЖИН = ХО ДҮН (`gdash.pkgCostWeight`), БЛОКИЙН ТОО БИШ — бүгд
   *    `gdash.housingPct` — нэг томьёо.
   * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): ОГТ тайлагнаагүй багц (`physN`) ч 0%-иар орно.
   * ⚠️ 2026-10-22 (аудит): ЗӨВХӨН орон сууцны багцаар (`HOUSING_SET`, `housingKeys`-ийн ⚠️) — «Орон сууцны
   *    гүйцэтгэл» гэж нэрлэгддэг бүх тоо (physNow · TsKpi · ТУХ · удирдлагын тайлан · GeneralDash) дэд бүтцийг
   *    агуулахаа болив. `given` (олголт) БҮХ багцаар хэвээр.
   */
  const cost = pkgCostWeight(d.contracts.map(cfWeightRow));
  const series = housingSeries(d.phys, d.physCnt, d.physAt, cost, labels, d.physN, HOUSING_SET);
  /* ⚠️ 2026-10-09 (аудит №2): хуваарьгүй (ХО жинтэй) багц байвал хоцрогдлын бодит талыг
     ХУВААРЬТАЙ багцаар тусад нь (`physLag`) — төлөвлөгөө (`projectPlanOf`)-тэй нэг олонлог.
     `phys` (толгойн тоо) ХӨНДӨГДӨХГҮЙ. Хасагдсан багц алга бол `physLag` огт тавигдахгүй. */
  const sc = pc ? projectPlanScope(d, pc) : null;
  const lagS = sc?.excluded.length
    ? housingSeries(d.phys, d.physCnt, d.physAt, cost, labels, d.physN, sc.keys)
    : null;
  return series.map((s, i) => {
    let given = 0;
    d.given.forEach((byMon) => { given += byMon.get(s.label) ?? 0; });
    /* ⚠️ Хэмжилтгүй сар `phys: null` (0 биш); `physAt` — `lagOf`-ийн завсар */
    const out: { label: string; given: number; phys: number | null; physAt: string | null; physLag?: number | null; physLagAt?: string | null } =
      { label: s.label, given, phys: s.phys, physAt: s.physAt };
    if (lagS) { out.physLag = lagS[i].phys; out.physLagAt = lagS[i].physAt; }
    return out;
  });
}

/** `physNow`-ийн кэш (2026-10-04) — доорх ⚠️ */
const PHYS_NOW = new WeakMap<FinData, Map<string, number | null>>();

/**
 * ТӨСЛИЙН БИЕТ ГҮЙЦЭТГЭЛ «ОДОО» — `aggregateMonths`-ийн одоогийн сар хүртэлх СҮҮЛИЙН
 * хэмжигдсэн сарын ХО дүнгээр жигнэсэн % (`gdash.housingPct`). PkgProg `TsKpi` ·
 * Дашбоард · ExecReport · «Багцын мэдээлэл» бүгд ЭНЭ туслахаас — нэг үзүүлэлт, нэг тоо.
 * Тайлагнаагүй бол `null` («мэдээлэлгүй», 0 биш).
 */
export function physNow(d: FinData, nowYm: string = monthKey()): number | null {
  /* ⚠️ 2026-10-04 (рендерийн гүйцэтгэл): ҮР ДҮНГ `FinData` объект бүрд КЭШЛЭНЭ. Дашбоард нэг
     зурагдалтад 12+ удаа дууддаг (хажуугийн 9 зурвас тус бүр `railStat` → энэ, IndStrip, хэсгүүд) бөгөөд
     дуудлага бүр `aggregateMonths` (76 гэрээний ХО жин + багц × сарын цуваа)-ыг бүтнээр нь гүйдэг байв —
     тунгалаг байдлын гулсуур/чартын товшилт бүрд. `FinData` нь ачааллын үр дүн, ХЭЗЭЭ Ч өөрчлөгддөггүй
     (шинэ ачаалал = шинэ объект). Түлхүүрт тэнхлэгийн сар (`cfMonthAxis` нь ОДООГИЙН сараас) орно —
     сар солигдоход дахин бодно. Утга ЯГ ИЖИЛ. */
  const key = `${nowYm}|${monthKey()}`;
  let byKey = PHYS_NOW.get(d);
  if (!byKey) { byKey = new Map(); PHYS_NOW.set(d, byKey); }
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;
  let actual: number | null = null;
  for (const m of aggregateMonths(d)) {
    if (m.label > nowYm) continue;
    if (m.phys != null) actual = m.phys;
  }
  byKey.set(key, actual);
  return actual;
}

/**
 * БАГЦЫН ОЛОНЛОГИЙН БИЕТ ГҮЙЦЭТГЭЛ «ОДОО» — `physNow`-той ЯГ НЭГ томьёо (`gdash.housingSeries`: ХО дүнгээр
 * жигнэсэн, хуудастай боловч тайлагнаагүй багц 0%), зөвхөн `only` багцаар. Хэмжилтгүй бол `null` (0 биш).
 * ⚠️ 2026-10-22 (аудит): «Инженерийн дэд бүтэц» ангилал (GeneralDash · удирдлагын тайлан) ӨӨРИЙН батлагдсан
 *    хувьтай болов — урьд нь орон сууцны тоонд холилдож, ангилал нь «Гүйцэтгэл хэмжигдээгүй» гэж гардаг байв
 *    (5.1 · 5.2 · 7.1 батлагдсан хувьтай атал).
 */
export function physNowOf(d: FinData, only: ReadonlySet<string>, nowYm: string = monthKey()): { pct: number; at: string } | null {
  if (!only.size) return null;
  const cost = pkgCostWeight(d.contracts.map(cfWeightRow));
  let out: { pct: number; at: string } | null = null;
  for (const s of housingSeries(d.phys, d.physCnt, d.physAt, cost, cfMonthAxis(), d.physN, only)) {
    if (s.label > nowYm) continue;
    if (s.phys != null) out = { pct: s.phys, at: s.label };
  }
  return out;
}

/** Cashflow-ийн ажлын төрөл (`CfRow.type`) — инженерийн дэд бүтэц (2026-10-22, `typePhysNow`) */
export const INFRA_TYPE = 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ';

/**
 * АЖЛЫН ТӨРЛИЙН (ангиллын) БИЕТ ГҮЙЦЭТГЭЛ «ОДОО» — тэр төрлийн мөрүүдийн багцаар (`pkgKeyOf(pkg2)`) `physNowOf`.
 * ⚠️ 2026-10-22 (аудит): GeneralDash «Төсөв, гэрээлсэн дүн» ба удирдлагын тайлангийн «Ажлын төрлөөр» хүснэгт
 *    НЭГ функцээр — дэд бүтцийн ангилал «Гүйцэтгэл хэмжигдээгүй» биш, өөрийн батлагдсан хувьтай. Бөглөх хуудасгүй
 *    багц (8, 7.2 г.м.) олонлогт ороод ч `phys`/`physN`-д алга тул тооцоонд ОРОХГҮЙ (null ≠ 0).
 */
export function typePhysNow(
  d: FinData,
  rows: Iterable<{ type: string; pkg2: string }>,
  type: string,
  nowYm: string = monthKey(),
): { pct: number; at: string } | null {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.type !== type) continue;
    const k = pkgKeyOf(r.pkg2);
    if (k && k !== '0') keys.add(k);
  }
  return physNowOf(d, keys, nowYm);
}

/**
 * «ИНЖЕНЕРИЙН ДЭД БҮТЭЦ»-ийн биет хувь `FinData.contracts`-аас (ТҮҮХИЙ мөр — ангилал `finXlChartCat`, `gdash.loadGdashCf`-ийн
 * `CfRow.type`-тай НЭГ дүрэм) — «Гүйцэтгэл»-ийн «Төслийн төрөл» (2026-10-22, аудит). GeneralDash · удирдлагын тайлантай
 * (`typePhysNow(…, CfRow[])`) ижил тоо.
 */
export function infraPhysNow(d: FinData, nowYm: string = monthKey()): { pct: number; at: string } | null {
  const C = CASHFLOW_NEW.fields;
  return typePhysNow(
    d,
    d.contracts.map((r) => ({ type: finXlChartCat(r), pkg2: String(r[C.pkg2] ?? '').trim() })),
    INFRA_TYPE,
    nowYm,
  );
}

async function loadFinDataRaw(): Promise<FinData> {
    const [contracts, ipc, histB, universeB, histI, universeI] = await Promise.all([
      loadCashflowNewRows(),
      loadHoRows(),
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
      /* ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): багц бүрийн блокийн хуваарь — тайлагнаагүй
         блок/багц 0% (`finPhys.buildPhys`). `loadSchema` кэштэй тул нэмэлт хүсэлтгүй. */
      loadBlockUniverse(),
      /* ⚠️ 2026-10-13 (хэрэглэгч: «бүх гүйцэтгэлийг 01-ийн батлагдсан хэсгээс нэгтгэ»): БЛОКГҮЙ багцууд
         (5.x · 6.x · 7.1 · 10) — бөглөх хуудасны синтетик блокийн «Б.» мөр (`blockProgress.loadInfra*`-ийн ⚠️).
         Урьд нь энд ОРДОГГҮЙ тул «Багцын гүйцэтгэл»-ийн жагсаалт тэдгээрт «мэдээлэлгүй», төслийн биет
         гүйцэтгэл (`physNow`) зөвхөн орон сууцны 7 багцаар байв. Түлхүүр нь блоктойгоос ДАВХЦАХГҮЙ. */
      loadInfraHistory(),
      loadInfraUniverse(),
      /*
       * ⚠️ Хуваарийн муруйг ЗЭРЭГ татаж кэшлэнэ — `lagOf` үүнийг синхроноор
       *    уншина. ЖАГСААЛТЫН ТӨГСГӨЛД байх ёстой: дээрх задаргаа
       *    (`[cashflow, ipc, hist]`) байрлалаар явдаг тул дунд нь оруулбал
       *    `hist` буруу элемент авна.
       *
       * ⚠️ Унавал `planCurveCache` нь `null` үлдэнэ: хоцрогдол харагдахгүй
       *    болохоос БИШ, буруу (мөнгөн нэгжтэй) тоо гарахгүй. Алдааг залгих
       *    нь ЗОРИУДЫНХ — санхүүгийн бүх дата хуваарийн улмаас унах ёсгүй.
       */
      /* ⚠️ 2026-09-25: КЭШТЭЙ (`loadPlanCurveCached`) — PkgProg · negtgel ·
         execReport-той НЭГ хуулбар; урьд нь энд КЭШГҮЙ дуудагдаж, багцын
         гүйцэтгэл нээхэд 10 хуудас ХОЁР удаа бүтнээр уншигддаг байв.
         ⚠️ ХАГАС муруй (`failed.length`) кэшлэгдэхгүй — дараагийн ачаалалт
         шинээр уншина; энэ удаад `lagOf` унасан багцад `null` («—») өгнө. */
      loadPlanCurveCached()
        .then((pc) => { planCurveCache = pc; })
        .catch(() => { planCurveCache = null; }),
    ]);

    /*
     * HO төлбөр → багц бүрд: сар → олгосон дүн.
     *
     * ⚠️ 2026-09-09: СУУТГАЛ ГЭСЭН ОЙЛГОЛТ ХАСАГДСАН. Шинэ эх сурвалжид
     *    барьцаа, урьдчилгааны эргэн төлөлт, зохиогчийн хяналт гэсэн багана
     *    ОГТ БАЙХГҮЙ; `dun` нь аль хэдийн БОДИТ ОЛГОСОН дүн. Тиймээс хуучин
     *    `ipcNet` (gross − 4 суутгал) -ийн оронд шууд `hoAmount`.
     * ⚠️ УТГЫН ӨӨРЧЛӨЛТ: «олгосон» одоо УРЬДЧИЛГАА төлбөрийг ч агуулна
     *    (хэрэглэгчийн шийдвэр: гүйцэтгэгч компанид өгсөн БҮХ санхүүжилт).
     *    Тиймээс дүн нь хуучин «цэвэр олголт»-оос ~1.67 дахин ӨНДӨР (318.42 →
     *    530.87 тэрбум ₮). Энэ нь АЛДАА БИШ, СЕМАНТИКИЙН өөрчлөлт — өмнөх
     *    дэлгэцийн тоог санаж буй хүн «хоёр дахин өслөө» гэж түгших
     *    магадлалтай тул энд ил тэмдэглэв.
     * ⚠️ Огноогүй төлбөрийг сарын цуваанд ОРУУЛАХГҮЙ (45-ийн 5). Хуучин код
     *    `?? last`-аар сүүлийн сар руу шахдаг байв — мөнгө нэг сарын нүдэнд
     *    овоорч хуурамч оргил үүсгэнэ. Нийт дүн `givenTotal`-д бүрэн үлдэнэ.
     */
    /*
     * БАГЦ → ГЭРЭЭНИЙ ДҮН. Нэг багцад олон гэрээ байж болно (жиш. зураг
     * төсөл + ажил) тул НИЙЛБЭР.
     * ⚠️ `pkgKeyOf` (bagtsKey БИШ): «БАГЦ 1-4» мэт диапазон мөр хоосон
     *    түлхүүртэй болж, аль нэг багцад буруу наалдахгүй.
     * ⚠️ Гэрээний эрхийн дүн хоосон бол урьдчилсан төсөвт өртгөөр — эс
     *    тэгвээс гэрээ хараахан байгуулагдаагүй багц «төлөвлөгөөгүй» болж,
     *    гүйцэтгэлийн хувь нь тодорхойгүй болно.
     */
    const CFN = CASHFLOW_NEW.fields;
    const planTotal = new Map<string, number>();
    contracts.forEach((r) => {
      const k = pkgKeyOf(r[CFN.pkg2]) || pkgKeyOf(r[CFN.pkg]);
      if (!k || k === '0') return;
      const v = n(r[CFN.contractAmount]) || n(r[CFN.budget]);
      if (!v) return;
      planTotal.set(k, (planTotal.get(k) ?? 0) + v);
    });

    const HC = HO_IPC.contractFields;
    const HP = HO_IPC.payFields;
    /* ⚠️ СУНГАСАН тэнхлэг (cfMonthAxis) — хуваарь 2026-09-өөр төгсдөг тул
       түүнээс хойшхи акт, хэмжилт нүхгүй үлдэж, сүүлийн сард овоорч эсвэл
       царцдаг байв. Сунгалт нь өнөөдрийг хүртэл. */
    const axis = cfMonthAxis();
    const first = axis[0];
    const last = axis[axis.length - 1];
    const given: GivenMap = new Map();
    const givenTotal = new Map<string, number>();
    ipc.forEach((r) => {
      const amt = hoAmount(r);
      /* ⚠️ `null` нь «ТӨЛБӨРИЙН ДҮН ОГТ БӨГЛӨГДӨӨГҮЙ» гэсэн үг (45-ийн 2),
         0₮ олголт БИШ. Хоёуланг нь адилхан алгасна (цувааны гадна), гэхдээ
         шалтгааныг ялган бичив: `null`-ыг 0 болгож нийлбэрт нэмбэл «олгосон
         0₮» гэсэн ХУДАЛ хэмжилт үүснэ (2026-09-04-ний I30 алдааны хэлбэр). */
      if (amt == null || amt === 0) return;
      /* ⚠️ `pkgKeyOf` — `bagtsKey` БИШ. HO-д «Багц-1-4» ба «БАГЦ-10,  БАГЦ-11,
         БАГЦ-13, БАГЦ-15» гэсэн ХОЁР ДИАПАЗОН мөр бий (нийт 5.97 тэрбум ₮);
         `bagtsKey('Багц-1-4')` = `БАГЦ14` бөгөөд энэ нь БОДИТ Багц 14-ийн ЯГ
         түлхүүр тул тэр дүн буруу багцад наалдана. Хуучин `ipc_0813`-д
         диапазон мөр БАЙГААГҮЙ тул `bagtsKey` аюулгүй байв — ОДОО БИШ.
         `pkgKeyOf` тэднийг `''` болгож хамгаална: дүн нь `hoTotals().paid`-д
         үлдэж, зүгээр л буруу эзэнд очихгүй.
         ⚠️ ДЭД БАГЦЫН fallback ХАСАГДСАН — HO-д `pkg2` талбар БАЙХГҮЙ,
         `bagts` өөрөө «Багц-3.1» гэсэн дэд түвшнийг агуулна. */
      const k = pkgKeyOf(r[HC.pkg]);
      if (!k || k === '0') return;
      givenTotal.set(k, (givenTotal.get(k) ?? 0) + amt);
      /* ⚠️ ГАНЦ огноо. Хуучин 4 талбарын fallback гинж (submitDate → periodTo
         → approvedDate → payDate) хасагдав — шинэ эхэд `guilgee_ognoo`
         ганцаараа бөгөөд 40/45 бөглөгдсөн тул цуваа САЙЖИРНА (хуучин 30/59). */
      const raw = ym(r[HP.payDate]);
      if (!raw) return; // огноогүй — цувааны гадна (дээрх ⚠️)
      /* ⚠️ 2026-09-25: тэнхлэгээс ГАДУУРХ огноо (2025-10-оос өмнө / ирээдүй)
         сарын цуваанд ОРОХГҮЙ — урьд нь ирмэгийн сар руу clamp хийгдэж,
         эхний/сүүлийн сард хуурамч оргил үүсгэдэг байв. Нийт дүн
         (`givenTotal`) дээр аль хэдийн бүрэн тоологдсон. */
      if (raw < first || raw > last) return;
      const mon = raw;
      const byMon = given.get(k) ?? new Map<string, number>();
      byMon.set(mon, (byMon.get(mon) ?? 0) + amt);
      given.set(k, byMon);
    });

    /*
     * Биет гүйцэтгэл → багц бүрд: сар → % (0–100).
     * ⚠️ 2026-09-25: бүтээлт `@/lib/finPhys.buildPhys`-д шилжсэн — ТОГТМОЛ
     *    хуваагч, давтсан (carry-forward) цэггүй, хэмжилтийн огноо (`physAt`).
     *    Дүрмүүдийг тэр файлын толгойноос үз; `phys.check.mjs` түүнийг шууд
     *    импортолж шалгана (хуулбар БИШ).
     */
    const nowYm = monthKey(); /* ⚠️ ОРОН НУТГИЙН сар — UTC slice нь сарын 1-ний шөнө ӨМНӨХ сар өгдөг */
    /* ⚠️ 2026-10-13: блоктой + блокгүй — НЭГ `buildPhys` (ХО дүнгээр жигнэх нэг дүрэм, дээрх ⚠️) */
    const hist = new Map([...histB, ...histI]);
    const universe = new Map([...universeB, ...universeI]);
    const { phys, physCnt, physAt, physN } = buildPhys(hist, axis, nowYm, universe);
    /* ⚠️ 2026-09-30: төслийн төлөвлөгөө — бодит талтай НЭГ (ХО) жин (`planProjectCache`).
       ⚠️ 2026-10-09 (аудит): `phys`/`physN` бэлэн болсны ДАРАА — багцын олонлог ч НЭГ (`projectPlanOf`). */
    planProjectCache = planCurveCache ? projectPlanOf({ contracts, phys, physN }, planCurveCache) : null;
    return {
      contracts, planTotal, given, givenTotal, phys, physCnt, physAt, physN,
      pays: ipc,
      /* ⚠️ ГЭРЭЭНИЙ ТҮВШИН — энд НЭГ УДАА хурааж бүх дуудагчид өгнө.
         Дуудагч тал өөрөө мөрөөр нийлүүлбэл давхардана. */
      contractsHo: groupHo(ipc),
    };
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
  /**
   * Баганын метадата татагдсангүй (2026-09-23). ⚠️ Урьд нь `loadFields` алдаанд
   * `[]` буцааж, тэр хоосон жагсаалт 5 минут КЭШЛЭГДЭЖ хүснэгт баганагүй
   * харагддаг байв — шалтгаан нь хаана ч гардаггүй. Одоо тэмдэглэгдэж,
   * «Дахин оролдох» нь кэшийг хаяна.
   */
  fieldsError: boolean;
  /**
   * САРЫН ЗАДАРГАА — `Cashflow_final`-ийн доторх нэмэлт мөрүүд.
   * ⚠️ `cashflow`-д ОРОХГҮЙ: гол хүснэгт нь 78 ажлын мөр л байна.
   */
  cfMonths: Row[];
  /**
   * Сарын задаргаа УНШИГДСАНГҮЙ (2026-09-29 аудит 10). ⚠️ Урьд нь алдаа `[]`
   * болж «сар огт үүсээгүй»-тэй ялгагдахгүй байв — хугацаа засахад БҮХ сар
   * дахин нэмэгдэж давхардан, S-муруй хоёр дахин тоологддог. `publish` энэ үед
   * сарын нийцүүлэлтийг зогсооно; «Cashflow хувиарлах» «уншигдсангүй» гэж хэлнэ.
   */
  cfMonthsError: boolean;
};

/**
 * Давхаргын талбарын метадата (`?f=json`) — alias нь хүний уншихуйц баганын нэр.
 * ⚠️ Алдаанд ШИДНЭ (`[]` биш) — дуудагч `fieldsError`-оор тэмдэглэнэ.
 */
async function loadFields(url: string): Promise<FieldDef[]> {
  /* ⚠️ 2026-09-30: `arcgisPost` (POST `f=json` — давхаргын мета POST-оор ч ирдэг):
     токен биеэр (URL-д биш), 30с timeout, слот, 429 backoff, 200-аар ирдэг `{error}`
     → `ArcGISError` шидэгдэнэ (дуудагч `fieldsError`-оор тэмдэглэнэ). */
  const j = await arcgisPost<{ fields?: unknown }>(url, { f: 'json' });
  if (!Array.isArray(j?.fields)) throw new Error('fields missing');
  return j.fields.map((x: {
    name: string; alias?: string; type: string;
    domain?: { type?: string; codedValues?: { name?: string }[] };
  }) => ({
    name: x.name,
    alias: x.alias || x.name,
    type: x.type,
    choices: x.domain?.type === 'codedValue'
      ? (x.domain.codedValues ?? []).map((v) => String(v.name ?? '')).filter(Boolean)
      : undefined,
  }));
}

/**
 * ⚠️ 5 мин кэш (2026-08-24 аудит) — урьд нь Санхүү харагдац mount болох бүрд
 * 4 хүсэлт (метадата ×2 + бүтэн хүснэгт ×2) кэшгүй дахин явдаг байв; мөрүүд нь
 * одоо `loadCashflowRows`/`loadIpcRows`-оор `loadFinData`-тай хуваалцагдана.
 */
/* ⚠️ 2026-10-06 (аудит): `keep` — хэсэгчилсэн үр дүн (метадата/сарын задаргаа унасан) КЭШЛЭГДЭХГҮЙ.
   Урьд нь доорх «хоосон жагсаалтыг амжилт гэж кэшлэхгүй» тайлбартай зөрж `fieldsError` ·
   `cfMonthsError`-той утга TTL турш үлдэж, дахин нээхэд ч алдааны мөр арилдаггүй байв. */
const loadFinRegister = cached(loadFinRegisterRaw, LIVE_TTL, ['HO_IPC', 'CASHFLOW_NEW'],
  (v) => !v.fieldsError && !v.cfMonthsError);

async function loadFinRegisterRaw(): Promise<FinTables> {
  const [cfFields, ipcFields, cashflow, ipc, cfMonths] = await Promise.all([
    /* ⚠️ Метадата унасан ч бүртгэл нээгдэнэ — `null` → `fieldsError`, хоосон
       жагсаалтыг «амжилт» гэж кэшлэхгүй. */
    loadFields(CASHFLOW_NEW.url).catch((e) => { console.warn('[selbe] cf fields:', e); return null; }),
    loadFields(HO_IPC.url).catch((e) => { console.warn('[selbe] ipc fields:', e); return null; }),
    loadCashflowNewRows(),
    loadHoRows(),
    /* ⚠️ Сарын задаргаа унасан ч бүртгэл нээгдэх ёстой — хоосон жагсаалтад
       буцна. Тэр өгөгдөл байхгүй бол 5-р түвшин хоосон, бусад нь бүтэн. */
    /* ⚠️ 2026-09-29 (аудит 10): алдааг `null` болгож ТЭМДЭГЛЭНЭ (`cfMonthsError`) —
       хоосон `[]` нь «сар үүсээгүй»-тэй ялгагдахгүй байв. */
    loadCfMonthRows().catch((e) => { console.warn('[selbe] cf months:', e); return null; }),
  ]);
  /*
   * ⚠️ «БОНДЫН ХҮҮ» мөр ЭНД шүүгдэнэ (2026-09-10) — хүснэгт ба «Cashflow
   * хувиарлах» хоёуланд нь нэг дор үйлчилнэ. Дэлгэрэнгүйг
   * `finXlRowHidden`-ийн тайлбараас үз.
   * ⚠️ Дашбоардын тоонуудад НӨЛӨӨЛӨХГҮЙ: тэдгээр нь `loadGdashCf`-ээр
   * тусдаа уншигддаг бөгөөд Excel-ийн НИЙТ томьёо тэр мөрийг аль хэдийн
   * хасдаг (`FIN_XL_TOTAL_SKIP`).
   */
  return {
    cashflow: cashflow.filter((r) => !finXlRowHidden(r)),
    ipc,
    cfFields: cfFields ?? [],
    ipcFields: ipcFields ?? [],
    fieldsError: cfFields == null || ipcFields == null,
    cfMonths: cfMonths ?? [],
    cfMonthsError: cfMonths == null,
  };
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

/**
 * Гэрээний мөрөөс сарын цэгүүд — IPC олголт + биет гүйцэтгэл.
 *
 * ⚠️ 2026-09-06: САНХҮҮЖИЛТИЙН ТӨЛӨВЛӨГӨӨ (сарын `amount`, өссөн дүн, өссөн
 *    хувь) ХАСАГДСАН. Тэр нь `cashflow_0813`-ийн «САР» мөрүүдээс гардаг
 *    байсан бөгөөд шинэ `Cashflow_0909`-т он/сарын багана ОГТ БАЙХГҮЙ.
 *    Үлдсэн хоёр цуваа хоёулаа БОДИТ ХЭМЖИЛТ.
 *
 * ⚠️ Гэрээний мөр өөрөө сарын утга ОГТ АГУУЛАХГҮЙ болсон ч параметр нь
 *    ХЭВЭЭР: багцын түлхүүр (`pkg2` → `pkg`) түүнээс гарч, тэрхүү түлхүүр нь
 *    `given`/`phys`-ийг сонгоно.
 */
export function contractMonths(r: Row, fin: FinData): MonthPt[] {
  const C = CASHFLOW_NEW.fields;
  const { given, phys } = fin;
  // ⚠️ `pkgKeyOf` (bagtsKey БИШ): «БАГЦ 1-4» мэт диапазон мөр нь bagtsKey-ээр
  //    «БАГЦ14» болж, бодит «Багц 14»-ийн олголт/биет гүйцэтгэлийг өөрийн болгон
  //    зурдаг байв. Диапазон мөр одоо хоосон түлхүүртэй — юутай ч таарахгүй.
  const k2 = pkgKeyOf(r[C.pkg2]);
  const k3 = pkgKeyOf(r[C.pkg]);
  const byMon = given.get(k2) ?? given.get(k3);
  const ph = phys.get(k2) ?? phys.get(k3);
  const at = fin.physAt?.get(k2) ?? fin.physAt?.get(k3);
  /* ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): ОГТ тайлагнаагүй багц (`physN`-д л байгаа) —
     ЭНЭ сард 0% гэсэн ганц цэг (`physAt: null`). Урьд нь бүх сар `null` тул
     `physLatest` «мэдээлэлгүй» буцааж, жагсаалтад «—» гардаг байв. Төслийн нэгтгэлийн
     цуваанд (`aggregateMonths`) энэ цэг ОРОХГҮЙ — тэнд `housingSeries(…, physN)`. */
  const zeroPkg = !ph && !!(fin.physN?.has(k2) || fin.physN?.has(k3));
  const nowYm = zeroPkg ? monthKey() : '';
  /*
   * ⚠️ ХОЦРОГДЛЫН ТӨЛӨВЛӨГӨӨГ БОДОХ БАГЦЫН ТҮЛХҮҮР (2026-09-04) — `phys` ЯМАР
   *    багцаас гарсан, ЯГ ТЭР багцынх. `lagOf` нь `planned − actual` бодох
   *    бөгөөд `actual` нь `phys`-ээс гардаг тул хоёул НЭГ багцынх байх ёстой;
   *    эс тэгвээс нэг багцын хуваарийг нөгөө багцын гүйцэтгэлээс хасна.
   *    Дээрх `??` гинжтэй ЯГ ижил дараалал (`k2` тэргүүлнэ, дараа нь `k3`).
   */
  const pkg = (phys.has(k2) ? k2 : phys.has(k3) ? k3
    : zeroPkg ? (fin.physN?.has(k2) ? k2 : k3) : (k2 || k3)) || undefined;

  /* ⚠️ Тэнхлэгийг ӨГӨГДЛӨӨС угсрахгүй — хэмжилтгүй сар (2026-01, 2026-03) мөр
     үүсгэдэггүй тул алгасвал түүнээс хойшхи бүх цэг зүүн тийш шилжинэ. */
  return cfMonthAxis().map((label) => ({
    label,
    given: byMon?.get(label) ?? 0,
    phys: ph?.get(label) ?? (zeroPkg && label === nowYm ? 0 : null),
    physAt: at?.get(label) ?? null,
    pkg,
  }));
}

/**
 * БАГЦ БҮРИЙН САРЫН ЦЭГҮҮД — гэрээний мөрийг багцын түлхүүрээр (`pkg2` → `pkg`)
 * тааруулж НЭГ УДАА бэлдэнэ. «Гүйцэтгэл» (`PkgProg`) ба «Багцын мэдээлэл»
 * (`Bagts`) жагсаалтын БОДИТ гүйцэтгэл ба хоцрогдол ҮҮНЭЭС.
 * ⚠️ 2026-09-30: `PkgProg.finMap`-аас ЭНД шилжүүлэв — хоёр харагдац НЭГ дүрмээр
 *    (хуулбарлавал нэг нь `pkgKeyOf` засвараас хоцорно).
 * ⚠️ `pkgKeyOf` — «БАГЦ 1-4» мэт ОЛОН багц хамарсан мөр нь хоосон түлхүүртэй
 *    (bagtsKey-ээр «БАГЦ14» болж, бодит «Багц 14»-т харийн гэрээ наалддаг байв).
 */
export function pkgMonthsMap(fin: FinData): Map<string, MonthPt[]> {
  const C = CASHFLOW_NEW.fields;
  const m = new Map<string, MonthPt[]>();
  fin.contracts.forEach((r) => {
    const k2 = pkgKeyOf(r[C.pkg2]);
    const k3 = pkgKeyOf(r[C.pkg]);
    [k2, k3].forEach((k) => {
      if (k && !m.has(k)) m.set(k, contractMonths(r, fin));
    });
  });
  /* ⚠️ 2026-10-26 (аудит): газрын зургийн багцын түлхүүрээр (`MAP_PKG_ALIAS`, БАГЦ71 → БАГЦ7) — «Багцын гүйцэтгэл»-ийн
     жагсаалт газрын зургийн багцаар хайдаг тул Багц 7-д «—», хоцрогдлын тэмдэггүй гарч байв. Өөрийн мөр байвал ДАВАМГАЙЛНА
     (тиймээс түүхий түлхүүрүүдийн ДАРАА нэмнэ). `contractMonths` нь phys/given-ийг түүхий түлхүүрээр хайна. */
  for (const [src, { key }] of Object.entries(MAP_PKG_ALIAS)) {
    const pts = m.get(src);
    if (pts && !m.has(key)) m.set(key, pts);
  }
  return m;
}

/**
 * БАГЦЫН БОДИТ ГҮЙЦЭТГЭЛ — ЭНЭ САР хүртэлх хамгийн сүүлийн биет % (0–100).
 * `lagOf().actual`-тай ИЖИЛ цэг (`m.label <= nowYm && m.phys != null`).
 * ⚠️ `null` = хэмжилт алга — 0 БИШ (0% нь «эхлээгүй» гэсэн хэмжилт).
 * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): бөглөх хуудастай боловч ОГТ тайлагнаагүй багц
 *    0% буцаана (`contractMonths`-ийн одоогийн сарын 0 цэг); `null` нь зөвхөн
 *    хуваарьгүй (хуудасгүй / уншигдаагүй) багц.
 */
export function physLatest(months: MonthPt[] | null | undefined): number | null {
  if (!months) return null;
  const nowYm = monthKey(); /* ⚠️ ОРОН НУТГИЙН сар (`lagOf`-ийн ⚠️) */
  let v: number | null = null;
  for (const m of months) if (m.label <= nowYm && m.phys != null) v = m.phys;
  return v;
}

/** `lagOf`-ийн үр дүн — ⚠️ 2026-10-22 (аудит): `coverage` = тухайн муруйн хуваарийн хамралт (`planCoverage`, 0–100) */
export type LagPoint = { month: string; planned: number; actual: number; gap: number; coverage: number | null };

/**
 * ХОЦРОГДЛЫН ШАЛГАЛТ — БИЕТ гүйцэтгэлийн ХУВИЙГ жишнэ (дүн биш):
 * сүүлийн биет дататай сар дээр «хуваариар байх ЁСТОЙ биет %» − «бодит биет %».
 * Хоёул бөглөгдсөн үед л утга буцаана — өрөөсгөл дататай харьцуулалт хийхгүй.
 *
 * ⚠️ 2026-09-04: `planned` нь `months[i].cumPct` (cashflow-ийн ӨССӨН МӨНГӨН
 *    хувь) байснаа ХУВААРИЙН муруй (`loadPlanCurve` → `planCurveCache`) болов.
 *    ХОЁР согог зэрэг байв:
 *      1. НЭГЖ ЗӨРНӨ — мөнгөний өссөн хувийг биет ажлын хувиас хасдаг байв.
 *      2. `cumPct`-ийн хуваагч нь `cfMonthAxis()`-ийн 12 сарын ЦОНХНЫ нийлбэр
 *         (2025-10…2026-09). Cashflow-ийн 133 үеийн 131 нь тэр цонхонд багтдаг
 *         тул `cumPct` нь 2026-09-д ЯГ 100.0% болно.
 *    Амьд хэмжилт (2026-09-04, хэмжигдсэн 9 багц): ХУУЧИН `planned` нь 9/9-д
 *    100.0, `gap` 99.9–100.0 → 9/9 УЛААН. ШИНЭ `planned` нь 53.0–79.8
 *    (хуваарь 2027-12-д дуусдаг), `gap` 53.0–79.8. Бодит биет нь 0.00–0.06%
 *    тул улаан ХЭВЭЭР ч тоо нь ҮНЭН болов — «100% хоцорсон» гэсэн худал
 *    ХЭМЖЭЭ арилав.
 *
 * ⚠️ 2026-09-06: мөнгөний хоцрогдол (`finLagOf`) ХАСАГДСАН — төлөвлөсөн ₮
 *    сар бүрээр гэдэг өгөгдөл шинэ cashflow-д огт байхгүй. Тиймээс энэ нь
 *    порталын ГАНЦ хоцрогдлын хэмжүүр болов.
 *
 * ⚠️ ГАРЫН ҮСЭГ ХЭВЭЭР (`lagOf(months)`) — ExecKpi · PkgProg · PkgFin гурав
 *    үүнийг дууддаг. Багцын түлхүүр нь `MonthPt.pkg`-ээр цэг дотроо явна.
 * ⚠️ 2026-10-22 (аудит): үр дүнд `coverage` (тухайн муруйн хуваарийн хамралт, `planCoverage`) НЭМЭГДЭВ —
 *    огноогүй ажил төлөвлөгөөнд 0-ээр ордог тул хамралт бага муруйн `planned` хэт бага, `gap` нь «түрүүлсэн»
 *    мэт гардаг. Дүгнэлт (`lagLevelOf`/`lagJudged`) зөвхөн `coverageOk` үед; тоо (`planned`) хэвээр.
 */
export function lagOf(months: MonthPt[]): LagPoint | null {
  const nowYm = monthKey(); /* ⚠️ ОРОН НУТГИЙН сар — UTC slice нь сарын 1-ний шөнө ӨМНӨХ сар өгдөг */
  let mi = -1;
  months.forEach((m, i) => {
    // ⚠️ `!= null`: 0% нь бодит хэмжилт — хоцрогдлын тооцооноос хасахгүй
    // ⚠️ 2026-10-09 (аудит №2): `lagPhys` — төслийн замд хуваарьтай багцын бодит (`physLag`)
    if (m.label <= nowYm && lagPhys(m) != null) mi = i;
  });
  if (mi < 0) return null;
  const series = lagSeriesCurve(months);
  if (!series) return null;
  return lagPointAt(months[mi], series);
}

/**
 * `lagOf`-ийн ТӨЛӨВЛӨГӨӨТ МУРУЙ — `null` бол хоцрогдол мэдэгдэхгүй.
 * ⚠️ Хуваарийн муруй ирээгүй бол `null` — cashflow руу БУЦАЖ УНАХГҮЙ. Тэр fallback нь
 *    яг л «бүх багц улаан» согогийг авчирна; «мэдэгдэхгүй» нь «100% хоцорсон» гэж худал
 *    хэлэхээс дээр.
 * ⚠️ 2026-09-30: төслийн зам — ХО дүнгээр жигнэсэн (`planProjectCache`), бодит тал
 *    (`aggregateMonths`)-тай нэг жин. Багцын зам хэвээр (багц дотор блокоор — бодит ч блокоор).
 */
function lagSeriesCurve(months: readonly MonthPt[]): PlanPoint[] | null {
  const pc = planCurveCache;
  if (!pc) return null;
  /* Багцын муруй (`pkg` тодорхой) эсвэл ТӨСЛИЙН нийт муруй (`aggregateMonths`) */
  const key = months.find((m) => m.pkg)?.pkg;
  const series = key ? pc.byBagts.get(key) : (planProjectCache ?? pc.months);
  return series?.length ? series : null;
}

/**
 * НЭГ ХЭМЖИЛТИЙН ЦЭГИЙН ХОЦРОГДОЛ. Төлөвлөгөө нь ХЭМЖИЛТ ХИЙГДСЭН тэр ӨДРИЙН байдлаар —
 * цаг хугацаагаар тэнцүү харьцуулалт (өнөөдрийн төлөвлөгөөг хуучин хэмжилтээс хасахгүй).
 * ⚠️ 2026-09-25: урьд нь хэмжилтийн САРЫН ЭЦСИЙН төлөвлөгөө жишдэг байв; одоо `physAt`
 *    өдрөөр завсарлана (`planProgress.planPctAt` = `negtgelAuto.housingPlanOf`-ийн дүрэм).
 * ⚠️ 2026-10-04: `physAt` алга (ОГТ тайлагнаагүй багцын одоогийн сарын 0% цэг) бол
 *    ӨНӨӨДӨР, сарын эцэс биш (`planProgress.measureDayOf`).
 * ⚠️ `planned <= 0` → `null` нь ХУУЧИН гэрээ (дуудагчид `lag &&`-ээр шалгадаг): хуваарь тэр
 *    өдөр хараахан эхлээгүй бол «хоцрогдол» гэж ярих утгагүй.
 */
/**
 * ⚠️ 2026-10-09 (аудит №2): хоцрогдлын БОДИТ тал — `physLag` (төлөвлөгөөтэй нэг багцын олонлог,
 * `aggregateMonths`) байвал тэр, үгүй бол `phys`. Огноо ч мөн адил.
 */
function lagPhys(m: MonthPt): number | null {
  return m.physLag !== undefined ? m.physLag : m.phys;
}
function lagPhysAt(m: MonthPt): string | null | undefined {
  return m.physLagAt !== undefined ? m.physLagAt : m.physAt;
}

function lagPointAt(m: MonthPt, series: readonly PlanPoint[]): LagPoint | null {
  const planned = planPctAt(series, measureDayOf(m.label, lagPhysAt(m), dayKey(Date.now())));
  if (planned == null || planned <= 0) return null;
  const actual = lagPhys(m) ?? 0;
  /* ⚠️ 2026-10-22 (аудит): хамралт — ЯГ ЭНЭ муруйн төгсгөл (`lagOf`-ийн ⚠️) */
  return { month: m.label, planned, actual, gap: planned - actual, coverage: planCoverage(series) };
}

/**
 * ХОЦРОГДЛЫН САРЫН ЦУВАА — хэмжилттэй сар БҮРД `lagOf`-ийн ЯГ ижил дүрэм (муруй, өдөр,
 * `planned <= 0` алгасна). Сүүлийн элемент == `lagOf(months)` (тэр сард хуваарь эхэлсэн бол).
 * ⚠️ 2026-10-04: Дашбоард 02-ын «Төлөвлөгөө vs бодит — сараар» · «Хоцрогдлын өөрчлөлт —
 *    сараар» урьд нь `selbe_bagts_guitsetgel_negtgel`-ийн ТУРШИЛТЫН мөрөөс зурагддаг байв
 *    (сүүлийн мөр 09-09, Б3.1 алга, төлөвлөгөө буруу) — одоо PkgProg/ТУХ-тай нэг эх.
 */
export function lagSeriesOf(months: MonthPt[]): LagPoint[] {
  const series = lagSeriesCurve(months);
  if (!series) return [];
  const nowYm = monthKey();
  const out: LagPoint[] = [];
  for (const m of months) {
    if (m.label > nowYm || lagPhys(m) == null) continue;
    const p = lagPointAt(m, series);
    if (p) out.push(p);
  }
  return out;
}

/**
 * `lagOf` `null` БУЦААСАН ШАЛТГААН — хоцрогдол тодорхой бол `'ok'`.
 *   · `'no-phys'`    — биет хэмжилт алга;
 *   · `'no-curve'`   — хуваарийн муруй уншигдаагүй (`planCurveMissing`);
 *   · `'not-started'`— муруй уншигдсан ч энэ багцад хуваарь алга эсвэл хэмжилтийн өдөр
 *                      хараахан эхлээгүй (`planned <= 0`).
 * ⚠️ 2026-10-04: CEO-ийн оноо (`scorecardLoad`) «хуваарь эхлээгүй» мөрийг огнооны шугам +
 *    Cashflow-ийн хувиар ЧИМЭЭГҮЙ оноолдог байв — одоо оноогүй, шалтгаантай.
 */
export function lagReasonOf(months: MonthPt[]): 'ok' | 'no-phys' | 'no-curve' | 'not-started' {
  const nowYm = monthKey();
  if (!months.some((m) => m.label <= nowYm && m.phys != null)) return 'no-phys';
  if (lagOf(months)) return 'ok';
  const key = months.find((m) => m.pkg)?.pkg;
  if (!planCurveCache || planCurveMissing(key)) return 'no-curve';
  return 'not-started';
}

/** Хоцрогдлын зэрэглэл: ≥10% улаан, 5–10% шар, бусад нь alert биш */
export const lagLevel = (gap: number): 'red' | 'yellow' | null =>
  gap >= 10 ? 'red' : gap >= 5 ? 'yellow' : null;

/**
 * ХОЦРОГДЛЫГ ДҮГНЭЖ БОЛОХ УУ — муруй хангалттай хамарсан (`planProgress.coverageOk`, ≥ 95%).
 * ⚠️ 2026-10-22 (аудит): хамралт бага үед улаан/шар/«хэвийн», «хоцорсон/түрүүлсэн» үг, хуваарийн оноо ГАРАХГҮЙ —
 *    хуваарьгүй ажлын жин төлөвлөгөөнд 0-ээр орж хоцорсон багцыг «Хэвийн» гэж харуулдаг байв. Төлөвлөсөн % нь
 *    хамралтын тэмдэглэлтэй (`coverageNote`) харагдсаар.
 */
export const lagJudged = (lag: { coverage?: number | null } | null | undefined): boolean =>
  !!lag && coverageOk(lag.coverage);

/** `lagLevel` — ЗӨВХӨН дүгнэж болох хоцрогдолд (`lagJudged`), эс бөгөөс `null` (2026-10-22) */
export const lagLevelOf = (lag: { gap: number; coverage?: number | null } | null | undefined): 'red' | 'yellow' | null =>
  (lag && lagJudged(lag) ? lagLevel(lag.gap) : null);

/**
 * `Cashflow_ID` — хоосон бол `null`.
 * ⚠️ 2026-09-29 (аудит 10): урьд нь `Number(r.Cashflow_ID)` шууд — `Number(null)` = 0
 *    тул `Cashflow_ID`-гүй ажил `0` гэж түлхүүрлэгдэж, `Cashflow_ID: 0` сарын мөр
 *    үүсгэдэг, ийм хоёр ажил нэг сарын жагсаалтыг ХУВААЛЦДАГ байв.
 */
const cfIdOf = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/* ═══ САРЫН МӨНГӨНИЙ ЭХ — «Гараар» / «Хуваарь» (2026-10-26, `monthlyMoney`-ийн толгой) ═══ */

/** Тооцоолсон ('huvaari') сарын СИНТЕТИК мөрийн тэмдэг — OID-гүй, засагдахгүй */
const HUV_ROW = '__huv';

/** Сарын мөр → `monthlyMoney`-ийн оролт (`gdash.CfPlanRow`) — `CashflowPlan.manualOf`-тэй ижил дүрэм */
const manualCfRows = (rows: readonly Row[]) => rows
  .map((r) => {
    const amt = r[CF_MONTH.amount];
    const pc = r[CF_MONTH.pct];
    const numOr = (v: unknown) => (v == null || String(v).trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
    return { id: cfIdOf(r[CF_MONTH.id]) ?? -1, start: cfIdOf(r[CF_MONTH.start]), pct: numOr(pc), amount: numOr(amt) };
  })
  .filter((r) => r.id > 0 && r.start != null);

/**
 * 5-р түвшний сарын дэд мөрд утгаа харуулах багана мөн эсэх (`cashflow_*`).
 *
 * ⚠️ 2026-10-26: Enterprise-ийн талбарын нэр ЖИЖИГ үсэгтэй (`cashflow_huwi` · `cashflow_dun` ·
 * `cashflow_start` …). entMap хасагдсаны (f26c7f9) дараа `startsWith('Cashflow_')` (том C) үргэлж
 * худал болж, гараар ба тооцоолсон ('huvaari') сарын мөр бүхэлдээ хоосон нүдтэй гардаг байв —
 * үсгийг харгалзахгүй харьцуулна.
 */
export const isCfMonthCol = (name: string): boolean => name.toLowerCase().startsWith('cashflow_');

/**
 * Тооцоолсон сарын мөнгө → 5-р түвшний синтетик сарын мөр (гараар мөрийн талбарын нэрээр).
 * `Cashflow_huwi` = дүн ÷ ХО дүн × 100 (0–100, гараар мөрийн нэгж); ХО дүнгүй бол null («—», 0 биш).
 * `start`/`end` — тэр сарын 1 ба сүүлийн өдрийн UTC үд дунд (`publish`-ийн бичилтийн конвенц).
 */
export function huvMonthRows(money: MonthlyMoney | null | undefined): Map<number, Row[]> {
  const out = new Map<number, Row[]>();
  if (!money) return out;
  for (const c of money.contracts.values()) {
    if (c.source !== SRC_HUVAARI) continue;
    out.set(c.id, [...c.months.keys()].sort().map((k) => {
      const [y, mo] = k.split('-').map(Number);
      const amount = c.months.get(k)!;
      return {
        [HUV_ROW]: true,
        [CF_MONTH.id]: c.id,
        [CF_MONTH.start]: Date.UTC(y, mo - 1, 1, 12),
        [CF_MONTH.end]: Date.UTC(y, mo, 0, 12),
        [CF_MONTH.pct]: c.cost != null ? (amount / c.cost) * 100 : null,
        [CF_MONTH.amount]: amount,
      };
    }));
  }
  return out;
}

/* ⚠️ 2026-10-27 (хэрэглэгч: «хуучныг бүр мөсөн устга»): «Гэрээ (Cashflow)» таб (хуучин Cashflow_0909-ийн хавтгай
   бүртгэл `FullTable`) УСТГАСАН — Cashflow нь Excel V3-ийн «Төсөл төлөвлөгөө биелэлт» (`ProjectPlanView`). Хуучин код git түүхэнд. */

/* ═══════════════════════════════════════════════════════════
   ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ — Excel (261007 V3)-ийн үндсэн хуудас (2026-10-26)

   ⚠️ Тооцоо БҮГД `projectPlan.computePlan`-д (Excel-ийн томьёо = код) — энд ЗӨВХӨН зурна, дахин бодохгүй.
   ⚠️ Бүх хувь 0–100 (`pct()` 100-аар үржүүлдэггүй); null → «—» (0 БИШ — мэдээлэлгүй блок 0% гэж харагдахгүй).
   ⚠️ Excel-ийн «Д/Д» (B) давхардалтай (35 код) тул МОДНЫ БАЙРЛАЛААС үүсгэнэ (1 · 1.2 · 1.2.3) — `dd_kod` нь
      эрэмбийн түлхүүр л (cf-wave2 «Тохиролцоо»).
   ⚠️ Гэрээний бүртгэлийн хавтгай хүснэгт (`FullTable`) ХЭВЭЭР — зөвхөн мөнгөний мөр (`CF_WORK_WHERE`); энэ таб
      Excel-ийн БҮХ мөрийг (`dd_kod IS NOT NULL`) уншина.
   ═══════════════════════════════════════════════════════════ */

/** Ачаалагч — динамик импорт (импортын ⚠️) */
const loadProjectPlanLazy = (): Promise<ProjectPlan> =>
  import('@/lib/projectPlanInputs').then((m) => m.loadProjectPlan());

type PpKind = 'money' | 'w' | 'date' | 'pct';
type PpCol = { k: Exclude<keyof PlanValues, 'status'>; label: string; kind: PpKind; title?: string };
type PpGroup = { label: string | null; cols: PpCol[] };

/**
 * Excel-ийн үндсэн хуудасны баганууд (E…W), дарааллаар нь.
 * ⚠️ ОГНООНЫ ХОС: хөдөлгүүрийн (`computePlan`) түлхүүр нь ХАДГАЛСАН ТАЛБАРААР — H/I = `geree_*`, J/K = `gazar_*`,
 *    L/M = `guits_*` (O нь J/K-аас, P нь L/M-ээс).
 * ⚠️ 2026-10-26: ХАРУУЛАХ дараалал нь Excel-ийн толгойгоор (cf-wave2 «Тохиролцоо»): Гэрээ (H/I) → «Гүйцэтгэгч»
 *    төлөвлөгөөт (Excel J/K = `guits_*` → хөдөлгүүрийн L/M) → «ОСНАУГ/Газар чөлөөлөлт» бодит (Excel L/M = `gazar_*`
 *    → хөдөлгүүрийн J/K). Урьд нь J/K-г «Газар чөлөөлөлт» гэж Excel-ийн гүйцэтгэгчийн огноог доор нь харуулж,
 *    хоёр хос эсрэгээр байв. N/O/P · T/U/V нь утгаараа (O = газар чөлөөлөлт, P = гүйцэтгэгч).
 * ⚠️ Импортын `DATE_COLS` (J/K → `guits_*`, L/M → `gazar_*`) тохиролцоотой нийцэх ёстой — эс бөгөөс өгөгдөл
 *    буруу шошгон дор хадгалагдана.
 */
function ppGroups(): PpGroup[] {
  const pctCol = (k: PpCol['k'], label: string, title?: string): PpCol => ({ k, label, kind: 'pct', title });
  return [
    { label: null, cols: [{ k: 'E', label: tr('Урьдчилсан төсөвт өртөг'), kind: 'money' }] },
    { label: null, cols: [{ k: 'F', label: tr('Хэсэгт эзлэх'), kind: 'w' }] },
    { label: null, cols: [{ k: 'G', label: tr('Төсөлд эзлэх'), kind: 'w' }] },
    { label: tr('Гэрээ (хавсралт 5)'), cols: [{ k: 'H', label: tr('Эхлэх'), kind: 'date' }, { k: 'I', label: tr('Дуусах'), kind: 'date' }] },
    { label: tr('Гүйцэтгэгч · төлөвлөгөөт'), cols: [{ k: 'L', label: tr('Эхлэх'), kind: 'date' }, { k: 'M', label: tr('Дуусах'), kind: 'date' }] },
    { label: tr('ОСНАУГ / Газар чөлөөлөлт · бодит'), cols: [{ k: 'J', label: tr('Эхлэх'), kind: 'date' }, { k: 'K', label: tr('Дуусах'), kind: 'date' }] },
    {
      label: tr('Төлөвлөгөөт хувь'),
      cols: [pctCol('N', tr('Гэрээ')), pctCol('O', tr('Газар чөлөөлөлт')), pctCol('P', tr('Гүйцэтгэгч'))],
    },
    { label: null, cols: [pctCol('Q', tr('Ирэх долоо хоног'), '+7')] },
    { label: null, cols: [pctCol('R', tr('Өмнө долоо хоног'), '−7')] },
    { label: null, cols: [pctCol('S', tr('Гүйцэтгэлийн хувь'))] },
    {
      label: tr('Биелэлт'),
      cols: [
        pctCol('T', tr('Гэрээ'), 'S / N'), pctCol('U', tr('Газар чөлөөлөлт'), 'S / O'),
        pctCol('V', tr('Гүйцэтгэгч'), 'S / P'), pctCol('W', tr('Өмнө долоо хоног'), 'S / R'),
      ],
    },
  ];
}

const ppFmt = (kind: PpKind, v: number | null): string => {
  if (kind === 'money') return num(v);
  if (kind === 'w') return pct(v, 2);
  if (kind === 'date') return date(v);
  return pct(v, 1);
};

const ppStatusText = (s: BlockStatus): string =>
  s === 'done' ? tr('Дууссан') : s === 'started' ? tr('Эхэлсэн') : tr('Эхлээгүй');

/**
 * «Төсөл төлөвлөгөө биелэлт» таб — ачаалагч.
 * ⚠️ `useAsync` автобусаар дахин татна: шилжүүлэлт (`switchToHuvaari`) `CASHFLOW_NEW`-ийг хүчингүй болгоход тэмдэг шинэчлэгдэнэ.
 */
function ProjectPlanView(props: {
  works: Row[];
  months: Row[];
  monthsError: boolean;
  canSwitch: boolean;
  onSaved: () => void;
}) {
  const q = useAsync<ProjectPlan>(loadProjectPlanLazy, []);
  return (
    <section className={`${f.reg} ${f.ppReg}`}>
      <Data q={q} loading={tr('Төсөл төлөвлөгөө тооцоолж байна…')}>
        {(plan) => (plan.empty ? (
          <Empty
            label={tr('Төсөл төлөвлөгөөний өгөгдөл хараахан импортлогдоогүй')}
            hint={tr('Excel-ийн «Төсөл төлөвлөгөө биелэлт» хуудсыг Cashflow хүснэгтэд импортлоход энд шатлалтай харагдана.')}
          />
        ) : <ProjectPlanTable plan={plan} {...props} />)}
      </Data>
    </section>
  );
}

export function ProjectPlanTable({
  plan, works, months, monthsError, canSwitch, onSaved,
}: {
  plan: ProjectPlan;
  works: Row[];
  months: Row[];
  monthsError: boolean;
  canSwitch: boolean;
  onSaved: () => void;
}) {
  const { tree, result } = plan;
  const groups = useMemo(() => ppGroups(), []);
  const cols = useMemo(() => groups.flatMap((g) => g.cols), [groups]);

  /** Д/Д — модны байрлалаас (толгойн ⚠️) */
  const ddOf = useMemo(() => {
    const m = new Map<PlanNode, string>();
    const go = (n: PlanNode, pre: string) => n.children.forEach((c, i) => {
      const s = pre ? `${pre}.${i + 1}` : String(i + 1);
      m.set(c, s);
      go(c, s);
    });
    go(tree.root, '');
    return m;
  }, [tree]);
  const maxDepth = useMemo(() => tree.nodes.reduce((a, n) => Math.max(a, n.depth), 1), [tree]);

  /**
   * ЭВХЭЛТ — Excel-ийн outline: түвшин (`lvl`, тэр гүн хүртэл дэлгэнэ) + мөр бүрийн гар солилт (`tog`, `index`-ээр).
   * ⚠️ Анхдагч 2 — үе шат ба тэдгээрийн шууд хэсэг/багц; ~905 мөрийг нэг дор зурахгүй. Түвшин солиход гар солилт арилна.
   */
  const [lvl, setLvl] = useState(2);
  const [tog, setTog] = useState<Map<number, boolean>>(new Map());
  const isOpen = (n: PlanNode) => tog.get(n.index) ?? n.depth < lvl;
  const setLevel = (v: number) => { setLvl(v); setTog(new Map()); };
  const toggle = (n: PlanNode) => setTog((m) => new Map(m).set(n.index, !isOpen(n)));

  const vis: PlanNode[] = [];
  const walk = (n: PlanNode) => {
    for (const c of n.children) {
      vis.push(c);
      if (c.children.length && isOpen(c)) walk(c);
    }
  };
  walk(tree.root);

  /* ── Сарын мөнгөний эх — мөнгөний мөр (`cashflow_id`) бүрд ── */
  const F = CASHFLOW_NEW.fields;
  const workBy = useMemo(() => {
    const m = new Map<number, Row>();
    for (const w of works) {
      const id = cfIdOf(w[CF_MONTH.id]);
      if (id != null && !m.has(id)) m.set(id, w);
    }
    return m;
  }, [works]);
  /**
   * Гэрээ бүрийн ГАРААР сарын мөрийн тоо ба нийт ₮ (`Cashflow_dun`) — батлуулах цонхны «N сарын мөр (нийт X) устана».
   * ⚠️ `total` null = дүнтэй мөр алга (0 БИШ — `CashflowPlan.curManualTotal`-тэй нэг дүрэм).
   */
  const monthCnt = useMemo(() => {
    const m = new Map<number, { n: number; total: number | null }>();
    for (const r of months) {
      const id = cfIdOf(r[CF_MONTH.id]);
      if (id == null) continue;
      const c = m.get(id) ?? { n: 0, total: null };
      c.n += 1;
      const raw = r[CF_MONTH.amount];
      const v = raw == null || String(raw).trim() === '' ? null : Number(raw);
      if (v != null && Number.isFinite(v)) c.total = (c.total ?? 0) + v;
      m.set(id, c);
    }
    return m;
  }, [months]);

  const [busyId, setBusyId] = useState<number | null>(null);
  /* ⚠️ `ref` — давхар товшилт `setBusyId`-ийн дахин зурагдалтаас ӨМНӨ хаагдана */
  const busyRef = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  /**
   * «ГАРААР → ХУВААРЬ» — гараар сарын мөр УСТАНА, буцаахгүй. Шалгалт (эрх · мөнгөний мөр ганц · багц хуудастай ·
   * үе шат · атом бичилт · алдагдсан хариуг дахин уншиж батлах) бүгд `switchToHuvaari` дотор.
   * ⚠️ 2026-10-26 (хяналт №2): `CashflowPlan`-тай НЭГ урсгал (`monthlyMoney.confirmAndSwitch`) — урьд нь энд
   *    `previewSwitch`-гүй, нэг цонхоор шууд шилжүүлдэг тул устах ₮ / гарах тооцоог хэлдэггүй, хоосон тооцоог ч
   *    ялгадаггүй байв. Одоо: шинэ тооцоо → устах ба тооцоолсон нийттэй цонх → дутуу бол 2-р цонх → батласан
   *    дүгнэлттэй тулгаж бичнэ.
   */
  const doSwitch = async (id: number, w: Row) => {
    if (busyRef.current) return;
    busyRef.current = true;
    /* ⚠️ 2026-10-26: ГЭРЭЭГ нэрлэнэ — багцад олон мөнгөний мөр (≈10 багцад 78 гэрээ) байх тул «Багц-1» л гэвэл аль
       гэрээний сарын мөр устахыг ялгахгүй, багц бүхэлдээ устах мэт ойлгогдоно; шилжүүлэлт ГАНЦ `Cashflow_ID`-д. */
    const pkgText = String(w[F.pkg] ?? '').trim() || '—';
    const ajil = String(w.ajil_uilchilgee ?? '').trim() || '—';
    const mc = monthCnt.get(id);
    setErr(null);
    setMsg(null);
    try {
      const fl = await confirmAndSwitch({
        cashflowId: id,
        name: tr('{0} · {1} (Cashflow_ID {2})', pkgText, ajil, id),
        pkg: pkgKeyOf(w[F.pkg]),
        phase: w[F.phase],
        manualRows: mc?.n ?? 0,
        manualTotal: mc?.total ?? null,
        money: mnt,
        ask: askConfirm,
        onBusy: (b) => setBusyId(b ? id : null),
      });
      if (fl.kind === 'refused') { setErr(fl.msg); return; }
      if (fl.kind === 'cancel') return;
      const r = fl.result;
      setMsg(r.already ? tr('Аль хэдийн Хуваарь эхтэй') : tr('Хуваарь руу шилжүүлэв · {0} сарын мөр устгав', r.deleted));
      onSaved();
    } catch (e) {
      setErr(userError(e));
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const moneyCell = (n: PlanNode) => {
    const id = n.row?.cashflow_id;
    if (id == null) return <td className={f.ppMoney} />;
    const w = workBy.get(id);
    if (!w) {
      return <td className={f.ppMoney} title={tr('Гэрээний бүртгэлд Cashflow_ID {0} мөр алга', id)}>—</td>;
    }
    const huv = monthSourceOf(w[F.monthSource]) === SRC_HUVAARI;
    const srcText = huv ? tr('Хуваарь') : tr('Гараар');
    const pkgOk = PKG_KEYS.has(pkgKeyOf(w[F.pkg]));
    /* ⚠️ 2026-10-26 (хяналт №2): үе шат (`uy_shat`) ИЛ «Барилга угсралт» биш бол хаалттай — хоосон ч (`switchPhaseWhy`) */
    const why = !pkgOk
      ? tr('Энэ гэрээний багцад Хуваарийн бөглөх хуудас алга — шилжүүлэх боломжгүй')
      : switchPhaseWhy(w[F.phase])
        ?? (monthsError ? tr('Сарын задаргаа уншигдсангүй — хуудсыг дахин ачаална уу') : undefined);
    return (
      <td className={f.ppMoney}>
        <span className={`${f.ppSrc} ${huv ? f.ppSrcHuv : ''}`} title={tr('Сарын мөнгө: {0}', srcText)}>{srcText}</span>
        {canSwitch && !huv && (
          <button
            type="button"
            className={f.ppSwitch}
            disabled={busyId != null || !!why}
            title={why}
            onClick={() => void doSwitch(id, w)}
          >
            {busyId === id ? tr('Шилжүүлж байна…') : tr('Хуваарь руу шилжүүлэх')}
          </button>
        )}
      </td>
    );
  };

  const rowCls = (n: PlanNode): string => [
    n.depth === 1 ? f.ppL1 : n.depth === 2 ? f.ppL2 : '',
    n.blok ? f.ppBlk : '',
    n.outside ? f.ppOut : '',
  ].filter(Boolean).join(' ');

  const valCells = (v: PlanValues | undefined, blk: boolean) => cols.map((c) => {
    const x = v ? v[c.k] : null;
    const st = c.k === 'S' && blk && v?.status ? v.status : null;
    return (
      <td key={c.k} className={`${f.cellNum} ${c.kind === 'date' ? f.ppDate : ''}`} title={st ? ppStatusText(st) : undefined}>
        {st && <i className={`${f.ppDot} ${st === 'done' ? f.ppDone : st === 'started' ? f.ppOn : f.ppNot}`} aria-hidden />}
        {ppFmt(c.kind, x)}
      </td>
    );
  });

  const rootV = result.values.get(tree.root);
  return (
    <>
      <header className={f.regHd}>
        <h2>{tr('Төсөл төлөвлөгөө биелэлт')}</h2>
        <span>{tr('{0}-ний байдлаар · {1} мөр', date(result.today), num(tree.nodes.length))}</span>
      </header>
      <div className={f.ppBar}>
        <span className={f.ppBarLbl}>{tr('Түвшин')}</span>
        <div className={f.tabs} role="group" aria-label={tr('Түвшин')}>
          {Array.from({ length: maxDepth }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={lvl === v && tog.size === 0}
              className={`${f.tab} ${lvl === v && tog.size === 0 ? f.tabOn : ''}`}
              onClick={() => setLevel(v)}
            >
              {v === maxDepth ? tr('Бүгд') : String(v)}
            </button>
          ))}
        </div>
        {err && <p role="alert" className={f.editErr}>{err}</p>}
        {msg && <p role="status" className={f.editOk}>{msg}</p>}
      </div>
      {plan.failed.length > 0 && (
        <p role="status" className={f.ppWarn}>
          {tr('Зарим эх уншигдсангүй ({0}) — холбогдох мөрүүд «—».', planFailedLabels(plan.failed).join(', '))}
        </p>
      )}
      {tree.issues.length > 0 && (
        <details className={f.ppIssues}>
          <summary>{tr('Бүтцийн анхааруулга: {0}', num(tree.issues.length))}</summary>
          <ul>{tree.issues.slice(0, 200).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </details>
      )}
      <div className={f.ppWrap}>
        <table className={`${f.tbl} ${f.ppTbl}`}>
          <thead>
            <tr>
              <th rowSpan={2} className={`${f.ppFz0} ${f.ppNo}`}>{tr('Д/Д')}</th>
              <th rowSpan={2} className={`${f.ppFz1} ${f.ppPkg}`}>{tr('Багц')}</th>
              <th rowSpan={2} className={`${f.ppFz2} ${f.ppName}`}>{tr('Ажлын нэр')}</th>
              {groups.map((g, gi) => (g.label
                ? <th key={gi} colSpan={g.cols.length} className={f.ppGrp}>{g.label}</th>
                : <th key={gi} rowSpan={2} className={f.ppHd} title={g.cols[0].title}>{g.cols[0].label}</th>))}
              <th rowSpan={2} className={f.ppHd}>{tr('Сарын мөнгө')}</th>
            </tr>
            <tr>
              {groups.filter((g) => g.label).flatMap((g) => g.cols).map((c) => (
                <th key={c.k} className={f.ppHd} title={c.title}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className={f.ppTot}>
              <td className={`${f.ppFz0} ${f.ppNo}`} />
              <td className={`${f.ppFz1} ${f.ppPkg}`} />
              <td className={`${f.ppFz2} ${f.ppName}`}>{tr('Төслийн нийт')}</td>
              {valCells(rootV, false)}
              <td className={f.ppMoney} />
            </tr>
            {vis.map((n) => {
              const r = n.row!;
              const v = result.values.get(n);
              const kids = n.children.length > 0;
              const open = kids && isOpen(n);
              return (
                <tr key={n.index} className={rowCls(n)}>
                  <td className={`${f.ppFz0} ${f.ppNo}`}>{ddOf.get(n)}</td>
                  <td className={`${f.ppFz1} ${f.ppPkg}`}>{n.blok ?? (r.bagts || '')}</td>
                  <td className={`${f.ppFz2} ${f.ppName}`} title={r.ajil_uilchilgee ?? undefined}>
                    <span className={f.ppIndent} style={{ paddingLeft: (n.depth - 1) * 14 }}>
                      {kids ? (
                        <button
                          type="button"
                          className={f.ppCaret}
                          aria-expanded={open}
                          aria-label={open ? tr('Хумих') : tr('Дэлгэх')}
                          onClick={() => toggle(n)}
                        >{open ? '−' : '+'}</button>
                      ) : <i className={f.ppCaretSp} aria-hidden />}
                      {r.ajil_uilchilgee || '—'}
                    </span>
                  </td>
                  {valCells(v, !!n.blok)}
                  {moneyCell(n)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={f.ppFoot}>
        {tr('Хувь 0–100; «—» = мэдээлэлгүй (0 биш). Гүйцэтгэгчийн төлөвлөгөө: блок → Хуваарь, бусад → огнооны хооронд жигд. Биелэлт = гүйцэтгэл ÷ төлөвлөгөө.')}
      </p>
    </>
  );
}

/** Санхүүжилтийн табууд */
type FinTab = 'ipc' | 'plan' | 'proj';

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
  /* ⚠️ 2026-10-26: «Гараар → Хуваарь» шилжүүлэх — тусдаа эрх (гараар сарын мөр УСТГАНА, буцаахгүй) */
  const canSwitch = hasCap(user?.username, CF_SWITCH_CAP);

  /**
   * САРЫН МӨНГӨ — 'huvaari' гэрээний тооцоолсон сарууд (`monthlyMoney`).
   * ⚠️ Тийм гэрээ НЭГ Ч БАЙХГҮЙ бол юу ч ачаалахгүй (`null`) — 'garaar'-ын зан төлөв ӨӨРЧЛӨГДӨХГҮЙ.
   * ⚠️ Ачаалж байх/унасан үед `undefined` — CashflowPlan өөрөө ачаална, гэрээний бүртгэл 'huvaari' гэрээний сарыг
   *    түр хоосон харуулна (гараар хуучин мөр «тооцоолсон» мэт харагдахгүй).
   */
  const srcField = CASHFLOW_NEW.fields.monthSource;
  const huvIds = useMemo(() => {
    const s = new Set<number>();
    for (const w of d.cashflow) {
      const id = cfIdOf(w[CF_MONTH.id]);
      if (id != null && monthSourceOf(w[srcField]) === SRC_HUVAARI) s.add(id);
    }
    return s;
  }, [d.cashflow, srcField]);
  const hasHuv = huvIds.size > 0;
  const moneyQ = useAsync<MonthlyMoney | null>(
    () => (hasHuv ? loadMonthlyMoney(manualCfRows(d.cfMonths)) : Promise.resolve(null)),
    [hasHuv, d.cfMonths],
  );
  const money: MonthlyMoney | null | undefined = !hasHuv ? null : moneyQ.state === 'ready' ? moneyQ.data : undefined;

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
  /**
   * ⚠️ 2026-09-09: IPC-ийн ТҮҮХИЙ хүснэгт навигациас ХАСАГДСАН.
   * Хэрэглэгчийн шийдвэр: «IPC service дээрх бүх мэдээллийг харах ёстой
   * НЭГ page байх ёстой». Хоёр таб (бүлэглэсэн + түүхий) нь тэр
   * шаардлагыг хангахгүй байв — хүн хоёр газар харах шаардлагатай болно.
   *
   * ⚠️ Одоо БҮХ талбар `IpcTable`-д: төлбөрийн талбарууд мөрөнд,
   * гэрээний талбарууд дэлгэрэнгүйд. Мэдээлэл АЛДАГДААГҮЙ.
   *
   * ⚠️ ГЭВЧ IPC-ийн ЗАСВАР ОДООГООР АЛГА — засвар нь `FullTable`-д
   * амьдардаг байсан (`IpcRawTableUnused` — 2026-09-30-нд УСТГАСАН, git түүхэнд
   * бий; дахин хэрэгтэй бол `FullTable`-ийг `HO_IPC`-ээр буцаан залгана).
   * Cashflow-ийнх хэвээр.
   *
   * ⚠️ ГУРАВДАХЬ ТАБ «Cashflow хувиарлах» (2026-09-09): сарын хувийг
   * гэрээний бүртгэлийн 33 багана дундаас бөглөх нь хүнд байсан.
   * Тэнд бөглөх зам ХЭВЭЭР (5-р түвшин) — энэ нь түүнийг орлохгүй,
   * зэрэгцээ зам: нэг ажилдаа төвлөрсөн, өргөнөөр гүйлгэх шаардлагагүй.
   */
  /* ⚠️ 2026-10-26: 'proj' — «Төсөл төлөвлөгөө биелэлт» (Excel-ийн шатлалтай үндсэн хуудас, `ProjectPlanView`) */
  const [tab, setTab] = useState<FinTab>('proj');
  /* ⚠️ 2026-09-23: «Cashflow хувиарлах» хадгалаагүй засвартай байхад таб солибол
     компонент unmount болж засвар АЛГА БОЛДОГ байв — баталгаажуулалт асууна.
     `ref` (state биш): dirty солигдох бүрд энэ хуудсыг дахин зурах хэрэггүй. */
  const planDirty = useRef(false);
  /* ⚠️ 2026-09-29 (аудит 10): модулийн түвшний `setFinNavDirty` — `Portal.setView`
     харагдац солихоос өмнө асууна (`finEdit.finNavDirty`-ийн ⚠️). */
  const onPlanDirty = useCallback((v: boolean) => { planDirty.current = v; setFinNavDirty('plan', v); }, []);
  /* ⚠️ 2026-10-23 (UX аудит X1): апп доторх `askConfirm` (async) — `window.confirm` нь «дахин бүү асуу»-гийн дараа
     чимээгүй false буцааж таб огт солигддоггүй байв. */
  const switchTab = async (t: FinTab) => {
    if (t === tab) return;
    if (tab === 'plan' && planDirty.current
      && !(await askConfirm(tr('Cashflow хувиарлалтад хадгалаагүй засвар байна. Таб солибол алдагдана. Үргэлжлүүлэх үү?'), { danger: true, ok: tr('Таб солих') }))) return;
    setTab(t);
  };

  return (
    <>
      <header className={f.pageHd}>
        {d.fieldsError && (
          <p role="status" style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--warn)' }}>
            {tr('Баганын мэдээлэл ачаалагдсангүй')}{' '}
            <button type="button" className={f.tab} onClick={() => invalidate('CASHFLOW_NEW', 'HO_IPC')}>
              {tr('Дахин оролдох')}
            </button>
          </p>
        )}
        {/*
          * ⚠️ Гарчиг хасагдсан тул табууд ЗҮҮН тийш үсэрдэг (`space-between`
          * ганц хүүхэдтэй үед эхэнд нь наана). `margin-left: auto` нь тэднийг
          * БАРУУН талд нь үлдээнэ.
          */}
        {/* Хүснэгт солих — идэвхтэй нь дүүргэлттэй */}
        {/* ⚠️ 2026-10-26 (UX U8): ←/→ · Home · End нь фокусыг л шилжүүлнэ (`tabFocusNav`) — `switchTab` асинхрон
            (ачаалал · хадгалаагүй засварын асуулт) тул сонголт нь Enter/Space-ээр */}
        <div className={f.tabs} role="tablist" style={{ marginLeft: 'auto' }} onKeyDown={(e) => tabFocusNav(e)}>
          <button
            type="button"
            role="tab"
            /* ⚠️ 2026-10-26: merge-ээр roving tabIndex-гүй үлдсэн (U8) — идэвхгүй үед Tab-ын 2 дахь зогсоол болдог байв */
            tabIndex={tab === 'proj' ? 0 : -1}
            aria-selected={tab === 'proj'}
            className={`${f.tab} ${tab === 'proj' ? f.tabOn : ''}`}
            onClick={() => void switchTab('proj')}
          >
            {tr('Төсөл төлөвлөгөө биелэлт')}
          </button>
          <button
            type="button"
            role="tab"
            tabIndex={tab === 'ipc' ? 0 : -1}
            aria-selected={tab === 'ipc'}
            className={`${f.tab} ${tab === 'ipc' ? f.tabOn : ''}`}
            onClick={() => void switchTab('ipc')}
          >
            {tr('Төлбөрийн акт (IPC)')}
          </button>
          <button
            type="button"
            role="tab"
            tabIndex={tab === 'plan' ? 0 : -1}
            aria-selected={tab === 'plan'}
            className={`${f.tab} ${tab === 'plan' ? f.tabOn : ''}`}
            onClick={() => void switchTab('plan')}
          >
            {tr('Cashflow хувиарлах')}
          </button>
        </div>
      </header>

      {/* ⚠️ `key` нь ЗААВАЛ: хоёр салаа НЭГ байрлалд, НЭГ төрлийн бүрэлдэхүүн
          тул React instance-ыг ДАХИН АШИГЛАНА. Түлхүүргүй бол Cashflow-д
          тавьсан `CF006` шүүлт IPC-д үлдэж, тэнд тийм талбар байхгүй тул
          хүснэгт ХООСОН гарна — шалтгаан нь огт харагдахгүй. */}
      {tab === 'proj' ? (
      <ProjectPlanView
        key="proj"
        works={d.cashflow}
        months={d.cfMonths}
        monthsError={d.cfMonthsError}
        canSwitch={canSwitch}
        onSaved={onSaved}
      />
      ) : tab === 'plan' ? (
      /* ⚠️ `key` нь ЗААВАЛ (доорх тайлбарыг үз) — гурван салаа НЭГ
         байрлалд сууна. */
      <CashflowPlan
        key="plan"
        canEdit={canEdit}
        works={d.cashflow}
        months={d.cfMonths}
        monthsError={d.cfMonthsError}
        onSaved={onSaved}
        onDirty={onPlanDirty}
        canSwitch={canSwitch}
        money={money}
      />
      ) : (
      /* ⚠️ `groupHo` нь 45 мөрийг 22 гэрээ болгож ДЕДУП хийнэ — энд
         мөрөөр нийлүүлбэл гэрээний төсөв 7 дахин давхардана. */
      <IpcTable contracts={groupHo(d.ipc)} />
      )}
    </>
  );
}

