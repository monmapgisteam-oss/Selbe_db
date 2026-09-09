'use client';

import { useState, useEffect, useMemo, useRef, Fragment, type MouseEvent, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { t as tr } from '@/lib/i18nCore';

/**
 * ОГНООНЫ КАЛЕНДАР — «Гүйцэтгэл бөглөх» хуудсынхтай ЯГ ИЖИЛ бүрэлдэхүүн.
 *
 * ⚠️ `<input type="date">` БИШ: түүний календарыг ХӨТӨЧ зурдаг тул нэр
 * («Clear»/«Today»), хэл, өнгө нь системийн тохиргооноос хамаарч, хуудаснаас
 * өөрчлөгддөггүй (`DatePicker.tsx`-ийн толгойн тайлбарыг үз).
 *
 * ⚠️ `dynamic` — тэр модуль `sheet.module.css`-ийг дагуулдаг тул огноо
 * засахгүй хэрэглэгчид татагдахгүй.
 */
const DatePicker = dynamic(() => import('@/modules/sheet/DatePicker'), { ssr: false });

/** Огнооны талбар мөн үү — календар зөвхөн эдгээрт нээгдэнэ */
const DATE_TYPES = new Set(['esriFieldTypeDate', 'esriFieldTypeDateOnly']);
import { Data, Empty, Note } from '@/components/ui';
import { CashflowPlan } from '@/modules/CashflowPlan';
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
import { loadPlanCurve, type PlanCurve } from '@/lib/planProgress';
import {
  CASHFLOW_NEW, HO_IPC, TASK_SHEET, bagtsKey, blockKey, pkgKeyOf, cfMonthAxis, hoAmount,
  CF_WORK_WHERE, CF_MONTH_WHERE,
} from '@/lib/services';
/* ⚠️ 2026-09-09: IPC-ийн ГЭРЭЭ ба ТӨЛБӨР гэсэн ХОЁР ТҮВШИН — `@/lib/ipc`-ээс.
   Мөр = НЭГ ГҮЙЛГЭЭ; гэрээний талбар `geree_kod` бүрд ДАВТАГДАНА тул
   гэрээний дүнг мөрөөр SUM хийвэл Багц-4.1 (7 мөр) -ийн төсөв 7 дахин
   хөөрөгдөнө. Гэрээний тоог ЗӨВХӨН `groupHo`/`hoTotals`-оос ав. */
import { loadHoRows, groupHo, type HoContract } from '@/lib/ipc';
import { finFieldLabel } from '@/lib/financeFieldLabels';
import {
  FIN_XL_ORDER, FIN_XL_LEAF, FIN_XL_WIDTH, FIN_XL_MERGE, FIN_XL_BAND_H, finXlGroup,
  FIN_XL_SECTION, FIN_XL_GROUP_FIELD, FIN_XL_GROUP3_FIELD, FIN_XL_CODE,
  FIN_XL_HIDE, FIN_XL_TOTAL_LABEL, finXlInTotal,
  FIN_XL_PCT, FIN_XL_PCT_WEIGHT, FIN_XL_ORDER_V,
} from '@/lib/finExcelLayout';
import { useColWidths } from '@/modules/sheet/colWidths';
import { useSheetCols } from '@/modules/sheet/sheetCols';
import {
  FIN_FACETS, EMPTY_FILTER, isDirty as filterDirty,
  facetValues, distinct, rowMatches,
  type FinFilter, type Facet, type FacetKey,
} from '@/lib/finFilter';
import {
  buildGroups, type FinKind, type GroupRow,
} from '@/lib/finGroup';
import { HO_MAIN_FIELDS, sumOrNull } from '@/lib/finCard';
import { mnt, num, text, cat, date } from '@/lib/format';
import { fitLabels, textW, useChartWidth } from '@/lib/chartFit';
import { ResizableTable } from '@/components/ResizableTable';
import { applyAll } from '@/lib/tableWrite';
import { invalidate, type DataKey } from '@/lib/dataBus';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import { IpcTable } from '@/modules/IpcTable';
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
/* ⚠️ 2026-09-06: `PLAN` (индиго — төлөвлөгөөт муруй) ХАСАГДСАН, тэр цуваа
   өөрөө байхгүй болсон тул. Слот 1/2 нь CVD-ийн шалгуурт хамгийн сайн
   салгагдсан хос хэвээр. */
const ACT = cat(0); // олгосон санхүүжилтийн өссөн ₮ — усан цэнхэр (аппын акцент)
const PHYS = cat(1); // биет гүйцэтгэлийн % — улбар шар (муруй, хоёуланаас тодрох)

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
  const N = items.length;

  /*
   * ── Өссөн S-муруйн өгөгдөл — ₮ ТЭНХЛЭГ: олгосон санхүүжилт · биет гүйцэтгэл.
   *
   * ⚠️ 2026-09-06: ТӨЛӨВЛӨГӨӨНИЙ цуваа ХАСАГДСАН. Тэр нь `cashflow_0813`-ийн
   *    «САР» мөрөөс гардаг байсан бөгөөд шинэ `Cashflow_0909`-т он/сарын
   *    багана ОГТ БАЙХГҮЙ. Тиймээс тэнхлэгийн дээд хязгаар нь одоо
   *    ТӨЛӨВЛӨГӨӨ биш, өссөн ОЛГОЛТ. Хоёулаа хоосон бол `1` — 0-д хуваахаас.
   */
  let gsum = 0;
  const cums = items.map((it) => { gsum += it.given; return gsum; });
  const yMax = Math.max(1, ...cums);
  const rows = items.map((it, i) => ({
    label: it.label,
    financing: cums[i], // өссөн олгосон санхүүжилт ₮
    // ⚠️ Дата алга (null) бол 0 өндөртэй цэг зурвал «биет гүйцэтгэл тэг»
    //    гэсэн ХУДАЛ уншилт өгнө — доорх `lastPhys` нь ийм саруудыг алгасна.
    physical: ((it.phys ?? 0) / 100) * yMax, // биет гүйцэтгэлийн үнэ цэнэ ₮
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
  const padR = 30;  // баруун — сүүлийн шошгыг багтаах зай
  const padT = 26;
  const padB = 30;  // доор — ЗӨВХӨН он сар (хувиуд tooltip руу шилжсэн)

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xFor = (i: number) => padL + (N <= 1 ? plotW / 2 : (i / (N - 1)) * plotW);
  const yFor = (v: number) => padT + (1 - Math.max(0, Math.min(yMax, v)) / yMax) * plotH;

  /* Сүүлийн УТГАТАЙ цэгүүд — тэдгээр дээр л шошго, том цэг үлдэнэ */
  const lastGiven = rows.reduce((a, r, i) => (r.givenCum > 0 ? i : a), -1);

  /* Цэгүүдийг нэг л удаа бодно — зам, шошго бүгд эндээс */
  const givenPts = rows.slice(0, lastGiven + 1).map((r, i) => ({ x: xFor(i), y: yFor(r.givenCum) }));
  const physPts = rows.slice(0, lastPhys + 1).map((r, i) => ({ x: xFor(i), y: yFor(r.physical) }));

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
  const fitFor = (last: number, valOf: (r: typeof rows[number]) => string) => new Set(
    fitLabels(rows.slice(0, last + 1).map((r, i) => ({
      i,
      x: xFor(i),
      w: textW(valOf(r)),
      anchor: anchorFor(i),
    }))),
  );
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
        aria-label={tr('Санхүүжилтийн явц: олгосон санхүүжилт, биет гүйцэтгэл')}
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

        {/* ── МУРУЙНУУД — олгосон санхүүжилт (зузаан, бүтэн) ба биет гүйцэтгэл ── */}
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
            ⚠️ Мөргөлдөхөөс сэргийлэх дүрэм: олголт нь муруйнхаа ДООР, биет нь
               түүнээс илүү доор бичигдэнэ — хоёр цуваа ойртсон ч давхцахгүй. */}
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
          <p className={f.tipRow}><i style={{ background: ACT }} />{tr('Олгосон санхүүжилт')}<b className="num">{pt.givenCum > 0 ? mnt(pt.givenCum) : '—'}</b></p>
          {!hidePhys && <p className={f.tipRow}><i style={{ background: PHYS }} />{/* «—» = ХЭМЖИГДЭЭГҮЙ; жинхэнэ 0% нь «0.0%» гэж гарна */}
            {tr('Биет гүйцэтгэл')}<b className="num">{pt.physPct == null ? '—' : `${pt.physPct.toFixed(1)}%`}</b></p>}
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
 * Санхүүжилтийн бүх дата — CASHFLOW_NEW (гэрээ) + IPC (олгосон, цэвэрлэсэн) +
 * TASK_SHEET (биет гүйцэтгэл, сарын эцсийн байдлаар).
 * ⚠️ export — «Барилгын цогц хяналт» (Tsogts) мөн энэ ГАНЦ ачаалагчийг ашиглана.
 * ⚠️ 5 мин кэш (2026-08-21 гүйцэтгэлийн аудит): Нүүр (супер) · Tsogts · Санхүү
 *   гурвуулаа дууддаг тул харагдац сэлгэх бүрд 3 query + O(багц×сар×блок)
 *   тооцоо ДАХИН хийгддэг байв.
 */
export const loadFinData = cached(loadFinDataRaw, LIVE_TTL, ['HO_IPC', 'CASHFLOW_NEW', 'BAGTS_SHEET']);

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
    orderBy: `Cashflow_ID ASC, Cashflow_start ASC`,
    limit: 8000,
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

async function loadFinDataRaw(): Promise<FinData> {
  const S = TASK_SHEET.fields;
    const [contracts, ipc, hist] = await Promise.all([
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
      loadPlanCurve()
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
      const mon = raw < first ? first : raw > last ? last : raw;
      const byMon = given.get(k) ?? new Map<string, number>();
      byMon.set(mon, (byMon.get(mon) ?? 0) + amt);
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
        axis.forEach((label) => {
          if (label > nowYm) return; // ирээдүйн сард биет дата байхгүй
          let sum = 0;
          let cnt = 0;
          blocks.forEach((arr) => {
            // тухайн сарын эцсээс өмнөх сүүлийн бичилт
            let best: { d: string; g: number | null } | null = null;
            arr.forEach((e) => {
              if (e.d.slice(0, 7) <= label && (!best || e.d > best.d)) best = e;
            });
            // Сүүлийн бичилт нь null бол блок «мэдээлэлгүй» — дунджид ОРУУЛАХГҮЙ
            // (blockProgress.compute-ийн дүрэмтэй ижил: 0% гэж будвал худал мэдээлэл)
            const g = (best as { d: string; g: number | null } | null)?.g;
            if (g != null) {
              sum += g;
              cnt++;
            }
          });
          if (cnt > 0) { byMon.set(label, (sum / cnt) * 100); cntMon.set(label, cnt); }
        });
        phys.set(k, byMon);
        physCnt.set(k, cntMon);
      });
    }
    return {
      contracts, planTotal, given, givenTotal, phys, physCnt,
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
   * САРЫН ЗАДАРГАА — `Cashflow_final`-ийн доторх нэмэлт мөрүүд.
   * ⚠️ `cashflow`-д ОРОХГҮЙ: гол хүснэгт нь 78 ажлын мөр л байна.
   */
  cfMonths: Row[];
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
const loadFinRegister = cached(loadFinRegisterRaw, LIVE_TTL, ['HO_IPC', 'CASHFLOW_NEW']);

async function loadFinRegisterRaw(): Promise<FinTables> {
  const [cfFields, ipcFields, cashflow, ipc, cfMonths] = await Promise.all([
    loadFields(CASHFLOW_NEW.url),
    loadFields(HO_IPC.url),
    loadCashflowNewRows(),
    loadHoRows(),
    /* ⚠️ Сарын задаргаа унасан ч бүртгэл нээгдэх ёстой — хоосон жагсаалтад
       буцна. Тэр өгөгдөл байхгүй бол 5-р түвшин хоосон, бусад нь бүтэн. */
    loadCfMonthRows().catch(() => [] as Row[]),
  ]);
  return { cashflow, ipc, cfFields, ipcFields, cfMonths };
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
  /*
   * ⚠️ ХОЦРОГДЛЫН ТӨЛӨВЛӨГӨӨГ БОДОХ БАГЦЫН ТҮЛХҮҮР (2026-09-04) — `phys` ЯМАР
   *    багцаас гарсан, ЯГ ТЭР багцынх. `lagOf` нь `planned − actual` бодох
   *    бөгөөд `actual` нь `phys`-ээс гардаг тул хоёул НЭГ багцынх байх ёстой;
   *    эс тэгвээс нэг багцын хуваарийг нөгөө багцын гүйцэтгэлээс хасна.
   *    Дээрх `??` гинжтэй ЯГ ижил дараалал (`k2` тэргүүлнэ, дараа нь `k3`).
   */
  const pkg = (phys.has(k2) ? k2 : phys.has(k3) ? k3 : (k2 || k3)) || undefined;

  /* ⚠️ Тэнхлэгийг ӨГӨГДЛӨӨС угсрахгүй — хэмжилтгүй сар (2026-01, 2026-03) мөр
     үүсгэдэггүй тул алгасвал түүнээс хойшхи бүх цэг зүүн тийш шилжинэ. */
  return cfMonthAxis().map((label) => ({
    label,
    given: byMon?.get(label) ?? 0,
    phys: ph?.get(label) ?? null,
    pkg,
  }));
}

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
 */
export function lagOf(months: MonthPt[]): { month: string; planned: number; actual: number; gap: number } | null {
  const nowYm = new Date().toISOString().slice(0, 7);
  let mi = -1;
  months.forEach((m, i) => {
    // ⚠️ `!= null`: 0% нь бодит хэмжилт — хоцрогдлын тооцооноос хасахгүй
    if (m.label <= nowYm && m.phys != null) mi = i;
  });
  if (mi < 0) return null;
  /*
   * ⚠️ Хуваарийн муруй ирээгүй бол `null` — cashflow руу БУЦАЖ УНАХГҮЙ.
   *    Тэр fallback нь яг л энэ согогийг (бүх багц улаан) авчирна; «хоцрогдол
   *    мэдэгдэхгүй» нь «100% хоцорсон гэж худал хэлэх»-ээс дээр.
   */
  const pc = planCurveCache;
  if (!pc) return null;
  /* Багцын муруй (`pkg` тодорхой) эсвэл ТӨСЛИЙН нийт муруй (`aggregateMonths`) */
  const key = months.find((m) => m.pkg)?.pkg;
  const series = key ? pc.byBagts.get(key) : pc.months;
  if (!series?.length) return null;
  /* Төлөвлөгөө: ХЭМЖИЛТ ХИЙГДСЭН тэр сарын байдлаар — цаг хугацаагаар тэнцүү
     харьцуулалт (өнөөдрийн төлөвлөгөөг хуучин хэмжилтээс хасахгүй). */
  let planned = 0;
  let found = false;
  for (const p of series) {
    if (p.label > months[mi].label) break;
    planned = p.pct;
    found = true;
  }
  /* ⚠️ `planned <= 0` → `null` нь ХУУЧИН гэрээ (дуудагчид `lag &&`-ээр шалгадаг):
     хуваарь тэр сард хараахан эхлээгүй бол «хоцрогдол» гэж ярих утгагүй. */
  if (!found || planned <= 0) return null;
  const actual = months[mi].phys ?? 0;
  return { month: months[mi].label, planned, actual, gap: planned - actual };
}

/** Хоцрогдлын зэрэглэл: ≥10% улаан, 5–10% шар, бусад нь alert биш */
export const lagLevel = (gap: number): 'red' | 'yellow' | null =>
  gap >= 10 ? 'red' : gap >= 5 ? 'yellow' : null;

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

/**
 * EDITOR TRACKING — «хэн, хэзээ зассан».
 *
 * ⚠️ 2026-09-04-нд `Cashflow_0909` дээр асаагдав. Сешний ногоон тэмдэглэгээ
 * (`cellSaved`) нь хуудас сэргээхэд арилдаг тул удаан хугацааны хариулт нь
 * ЭНЭ — үйлчилгээ өөрөө мөр бүрийн сүүлийн засварыг тамгалдаг.
 *
 * ⚠️ МӨРИЙН түвшний бүртгэл. ArcGIS нь «аль НҮД өөрчлөгдсөн» гэдгийг
 * ХАДГАЛДАГГҮЙ — зөвхөн мөр хэзээ, хэний гараар сүүлд хөндөгдсөнийг. Тиймээс
 * нүдний нарийвчлалыг сешний ногооноор нөхөж, мөрийн нарийвчлалыг эндээс авна.
 * Хоёрыг хольж «энэ нүдийг тэр хүн зассан» гэж бичвэл ХУДАЛ мэдэгдэл болно.
 *
 * ⚠️ Талбар БАЙХГҮЙ ч байж болно (Editor Tracking унтраасан үйлчилгээ) —
 * тэр үед тэмдэглэгээ зүгээр л гарахгүй, хүснэгт хэвийн ажиллана.
 */
const ET_FIELDS = { editor: 'Editor', editDate: 'EditDate' } as const;

type EditStamp = { who: string; ms: number } | null;

const editStamp = (r: Row): EditStamp => {
  const ms = Number(r[ET_FIELDS.editDate]);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return { who: String(r[ET_FIELDS.editor] ?? '').trim(), ms };
};

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
  HO_IPC.payFields.ipcNo,          // IPC дугаар
  /* ⚠️ `on_` нь Integer тул ерөнхий тоон дүрэмд орж «2,025» гэж гарна. */
  HO_IPC.payFields.year,           // Он
  HO_IPC.contractFields.no,        // № (гэрээний дугаарлалт)
]);

/**
 * ДЭЛГЭЦЭД ГАРГАХГҮЙ талбарууд.
 *
 * ⚠️ GlobalID — утгагүй UUID (хэрэглэгчийн хүсэлт).
 * ⚠️ 2026-09-01: OBJECTID ба «Гэрээний код» (IPC02) мөн ХАСАГДАВ
 *    («object id, гэрээний код огт хэрэггүй»). Хоёулаа ДОТООД ТАНИГЧ — хүнд
 *    юу ч хэлдэггүй атлаа 38 баганат хүснэгтийн эхний хоёр байрыг эзэлдэг.
 * ⚠️ OBJECTID нь ХАРАГДАХГҮЙ болохоос АЛГА болохгүй: засварын түлхүүр
 *    (`pend`-ийн `oid:талбар`), устгалын жагсаалт, мөрийн `key` бүгд
 *    `r[oidField]`-ээс ШУУД уншдаг — баганын жагсаалтаас хамаардаггүй.
 * ⚠️ Модулийн хамрах хүрээнд: бүрэлдэхүүн дотор тодорхойлбол render бүрд
 *    шинэ функц болж, `cols`-ийн `useMemo` кэш утгагүй болно.
 */
/**
 * ⚠️ EDITOR TRACKING-ийн 4 багана (`CreationDate`, `Creator`, `EditDate`,
 * `Editor`) ХҮСНЭГТЭД ГАРАХГҮЙ. 2026-09-04-нд үйлчилгээн дээр асаагдмагц
 * тэдгээр нь метадатагаас автоматаар багана болж, аль хэдийн 33 баганатай
 * хүснэгтийг дөрвөөр өргөсгөж, бүх мөрөнд ижил утга давтагдаж байв.
 *
 * ⚠️ ӨГӨГДӨЛ НЬ АЛДАГДААГҮЙ: мөрүүд `outFields:'*'`-аар татагддаг тул
 * `EditDate`/`Editor` нь мөр бүрд ХЭВЭЭР ирнэ — «Сүүлд зассан» тамга (№
 * баганын ногоон зураас, `editStamp`) тэднийг уншсаар байна. Энд зөвхөн
 * ХАРАГДАЦААС хасаж байна.
 */
const isSkip = (name: string, type: string, oidField: string): boolean =>
  type === 'esriFieldTypeGlobalID'
  || /globalid/i.test(name)
  || /^(creationdate|creator|editdate|editor)$/i.test(name)
  || name === oidField;
/* ⚠️ 2026-09-09: «Гэрээний код» баганыг НУУХАА БОЛИВ. Хуучин `IPC02` нь
   G01…G76 гэсэн ДОТООД танигч байсан тул нуугддаг байв; шинэ `geree_kod` нь
   «Багц-1» — ХҮНД УТГАТАЙ бөгөөд 45 мөрийг 22 гэрээнд хуваадаг ГОЛ түлхүүр.
   Нуувал хэрэглэгч аль төлбөр аль гэрээнийх болохыг ялгаж чадахгүй. */

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
  /* ⚠️ 2026-09-08 (аудит): `esriFieldTypeDate`-д ЭРГЭЛТИЙН шалгалт НЭМЭВ.
     `new Date('2026-02-30T00:00:00Z')` нь NaN БИШ — 2026-03-02 болж ГҮЙНЭ
     (`2026-06-31` → 2026-07-01). Хуучин код тэр гүйлтийг чимээгүй хүлээж,
     «N мөр хадгалагдав» гэж ногоон мэдэгдэл гаргадаг байсан тул хэрэглэгч
     бичсэн огноогоо хадгалсан гэж итгэх атал үйлчилгээнд ӨӨР огноо суудаг байв.
     Дээрх мөр 1023-ын «esriFieldTypeDate талбар НЭГ Ч БАЙХГҮЙ» гэсэн таамаг нь
     хуучин `cashflow_0813`-ынх — шинэ `Cashflow_0909`-т Ehleh_ognoo ·
     Duusah_ognoo · Zahiramj_ognoo ГУРВУУЛАА `esriFieldTypeDate` тул энэ салаа
     одоо АМЬД. Хажуугийн `DateOnly` салаатай ЯГ НЭГ дүрэм.
     ⚠️ Цаг-минуттай БҮТЭН огноо (ISO datetime) хэвээр зөвшөөрөгдөнө — тэр
     хэлбэрийг `YYYY-MM-DD` эргэлтээр шалгах боломжгүй. */
  if (type === 'esriFieldTypeDate') {
    if (v.length === 10) {
      const d = new Date(`${v}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v)
        throw new Error(tr('«{0}» — огноо ЖЖЖЖ-СС-ӨӨ хэлбэрээр байх ёстой: {1}', label, v));
      return d.getTime();
    }
    const d = new Date(v);
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
  title, subtitle, rows, fields, url, oidField, dataKey, facets, months = [],
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
   * САРЫН ЗАДАРГАА — ажлын мөрийн ДОР 5-р түвшинд гарна.
   * ⚠️ `rows`-д НЭГТГЭХГҮЙ: шатлал, зурвасын нийлбэр, багцын нэгтгэл
   * бүгд `rows`-ийн индексээр ажилладаг тул тэнд мөр шургуулбал гажина.
   */
  months?: Row[];
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
   * ⚠️ ЗӨВХӨН СЕШНИЙ ХУГАЦААНД. `Cashflow_0909`-д Editor Tracking асаагүй тул
   * серверээс «энэ нүд хэзээ өөрчлөгдсөн» гэдгийг мэдэх БОЛОМЖГҮЙ — хуудас
   * дахин ачаалахад тэмдэглэгээ арилна. Үүнийг ТҮҮХ гэж ойлгож болохгүй.
   */
  const [saved, setSaved] = useState<Set<string>>(new Set());
  /** Нийтлээгүй ШИНЭ мөрүүд — сөрөг түр дугаартай */
  const [adds, setAdds] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  /* ── ХАРАГДАЦ · ШҮҮЛТ · БҮЛЭГЛЭЛТ (2026-09-01) ── */
  const [flt, setFlt] = useState<FinFilter>(EMPTY_FILTER);
  /** Багана бүрийн шүүлтийн мөр нээлттэй эсэх — анхдагчаар ХААЛТТАЙ */
  const [colOpen, setColOpen] = useState(false);
  /**
   * ТОЛГОЙН ШҮҮЛТИЙН ЦЭС — ArcGIS-ийн атрибут хүснэгтийн маяг.
   * Нээлттэй баганын нэр ба дэлгэц дээрх байрлал (товчны доор).
   *
   * ⚠️ Байрлалыг `position: fixed`-ээр ЭНД хадгална, `th` дотор `absolute`
   * БИШ: царцсан багануудад `overflow: hidden` бий тул дотор нь зурсан цонх
   * тасарна, мөн `z-index`-ийн шатлал нь хөрш баганад дарагдана.
   */
  const [hMenu, setHMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  /**
   * ЧИРЭГДЭЖ БУЙ БАГАНА — толгойгоос толгой руу зөөнө.
   *
   * ⚠️ HTML5 drag-and-drop-ыг `th`-д ШУУД тавина: тусдаа «бариул» гаргавал
   * толгойд аль хэдийн хоёр удирдлага (шүүлтийн ▾, өргөний чирэх зураас)
   * байгаа тул гурав дахь нь нүдийг дүүргэнэ.
   */
  const [drag, setDrag] = useState<string | null>(null);
  /**
   * СОНГОГДСОН БАГАНУУД — Excel-ийн зан (2026-09-08, хэрэглэгчийн хүсэлт).
   *
   * ⚠️ ТОО НЬ ДУРЫН: хэрэглэгч 1 ч, 8 ч багана сонгож болно. Excel-д баганы
   * толгойг товшиж сонгоод «Freeze Panes» дардагтай ижил.
   *
   * ⚠️ ЗӨВХӨН ХАРАГДАЦ, өгөгдөл БИШ: сонголт нь мөр шүүхгүй, зөвхөн дараагийн
   * үйлдэл (царцаах, нуух) хэнд хамаарахыг заана.
   */
  const [pick, setPick] = useState<string[]>([]);
  /** Мужаар сонгоход (Shift) суурь болох сүүлийн товшилт */
  const lastPick = useRef<string | null>(null);

  /**
   * ЭВХЭГДСЭН БҮЛГҮҮД — Excel-ийн мөрийн бүлэглэлт (`+` · `−`).
   *
   * ⚠️ Эх Excel-д мөрийн 3 түвшний outline бий (`outlineLevelRow="3"`): 76 мөр
   * нэг дэлгэцэнд багтдаггүй тул хэрэглэгч хэрэггүй хэсгээ хумьж, харьцуулах
   * гэсэн хоёр бүлгээ зэрэгцүүлдэг. Порталд ч тэр зан ХЭРЭГТЭЙ.
   *
   * ⚠️ Түлхүүр нь УТГААР («s:БАРИЛГА УГСРАЛТ»), индексээр БИШ: шүүлт хийхэд
   * мөрийн индекс шилждэг тул индексээр хадгалбал огт өөр бүлэг эвхэгдэнэ.
   * ⚠️ ХАДГАЛАГДАХГҮЙ (сешний төлөв): эвхэлт нь тухайн агшны ажлын хэрэгсэл,
   * дараагийн удаа нээхэд хүснэгт БҮТНЭЭР харагдах ёстой.
   */
  const [fold, setFold] = useState<Set<string>>(new Set());

  /**
   * ИДЭВХТЭЙ ТҮВШИН — товчийг тодруулахад л хэрэгтэй.
   *
   * ⚠️ 0 = «холимог»: хэрэглэгч нэг бүлгийг гараар хумисан бол аль ч түвшин
   * бүтнээрээ биелэхээ больсон тул НЭГ Ч товч тодрох ёсгүй. Эс бөгөөс дэлгэц
   * дээрх байдалтай зөрчилдсөн тодруулга үлдэнэ.
   */
  const [lvl, setLvl] = useState(4);

  /**
   * ТҮВШНИЙ ЗУРВАС харагдах уу.
   *
   * ⚠️ ЗАСВАРЫН горимд Ч харагдана (2026-09-09): «5» товч нь тэнд сарын
   * задаргааг нээх ЦОРЫН ГАНЦ зам — хугацаа янзалсны дараа сарын хувийг
   * тэндээс бөглөнө. 1–4 нь засварын горимд шатлалын зурвасгүй тул нөлөөгүй.
   */
  const xlLevelsOn = dataKey === 'CASHFLOW_NEW';

  /**
   * САРЫН МӨРҮҮД АЖЛААР — `Cashflow_ID` → тухайн ажлын саруудын жагсаалт.
   * ⚠️ `OBJECTID`-аар БИШ `Cashflow_ID`-аар холбоно: OBJECTID нь мөр
   * устгаад дахин нэмэхэд өөрчлөгддөг, Cashflow_ID нь тогтвортой дугаар.
   */
  const monthBy = useMemo(() => {
    const m = new Map<number, Row[]>();
    for (const r of months) {
      const id = Number(r.Cashflow_ID);
      if (!Number.isFinite(id)) continue;
      const arr = m.get(id) ?? [];
      arr.push(r);
      m.set(id, arr);
    }
    /* ⚠️ Огноогоор эрэмбэлнэ — үйлчилгээний дараалалд найдахгүй
       (2000 мөрийн хуудаслалт дараалал алдагдуулж болно). */
    for (const arr of m.values()) {
      arr.sort((a, b) => Number(a.Cashflow_start ?? 0) - Number(b.Cashflow_start ?? 0));
    }
    return m;
  }, [months]);

  /**
   * МӨРИЙН ЭЦГҮҮДИЙН ЭВХЭЛТИЙН ТҮЛХҮҮР — гүехэнээс гүн рүү.
   *
   * ⚠️ ХООСОН түвшинг АЛГАСНА. Excel-ийн шинэ бүтэц (REV00) нь бүх салаанд
   * гурван түвшинтэй БИШ: «НИЙГМИЙН ДЭД БҮТЭЦ» ба «БОНДЫН ХҮҮ» нь ердөө нэг
   * түвшинтэй, 3-р түвшин зөвхөн инженерийн дэд бүтцэд бий. Хоосон түвшнийг
   * гинжинд оруулбал утгагүй зурвас (хоосон гарчиг) үүсч, түвшний товч тэр
   * хэсэгт огт үйлчлэхгүй болно.
   * ⚠️ Түлхүүр нь ЭЦГИЙНХЭЭ түлхүүрийг агуулна: өөр хоёр хэсэгт ижил нэртэй
   * төрөл гарвал нэгийг нь эвхэхэд нөгөө нь ч хумигдах байсан.
   */
  const xlKeys = (r: Record<string, unknown>): string[] => {
    const a = String(r[FIN_XL_SECTION] ?? '');
    const b = String(r[FIN_XL_GROUP_FIELD] ?? '');
    const c = String(r[FIN_XL_GROUP3_FIELD] ?? '');
    const ks = [`s:${a}`];
    if (b !== '') ks.push(`g:${a}|${b}`);
    if (b !== '' && c !== '') ks.push(`h:${a}|${b}|${c}`);
    return ks;
  };

  /**
   * ТҮВШНЭЭР ДЭЛГЭХ — Excel-ийн outline «1 2 3 4».
   *
   *   1 → НИЙТ + хэсгийн зурвас · 2 → + төрлийн нийлбэр ·
   *   3 → + дэд төрлийн нийлбэр · 4 → бүх мөр
   *
   * ⚠️ ТҮЛХҮҮР нь УТГААР бүтдэг тул ШҮҮГДЭЭГҮЙ `rows`-оос угсарч болно:
   * шүүлт нь зөвхөн харагдах мөрийг цөөрүүлдэг ба илүү түлхүүр хор хүргэхгүй.
   * Ингэснээр товч нь хүснэгтээс ГАДНА, шүүлтийн зурвас дээр сууж чадна.
   * ⚠️ Тухайн мөрийн гинж богино байвал ХАМГИЙН ГҮН нь эвхэгдэнэ — эс бөгөөс
   * гурван түвшингүй хэсгүүд 2–3-р түвшинд бүтнээрээ дэлгээтэй үлдэж, товч
   * утгаа алдана.
   */
  const setLevel = (n: number) => {
    setLvl(n);
    /* ⚠️ 4 ба 5 хоёулаа БҮХ мөрийг дэлгэнэ; ялгаа нь зөвхөн сарын задаргаа
       (`monthOn`). Тиймээс эвхэлт хоёуланд нь хоосон. */
    if (n >= 4) { setFold(new Set()); return; }
    /*
     * ⚠️ 1-р түвшинд НИЙТ мөрийг ХУМИХГҮЙ (`XL_ALL` нэмэхгүй): Excel-д мөр 7-ийн
     * хамт хэсгийн зурвас БҮГД харагддаг. «Зөвхөн нийт дүн» гэсэн төлөв нь
     * НИЙТ мөрийн өөрийнх нь «−» товчоор гарна.
     */
    const nx = new Set<string>();
    for (const r of rows) {
      const ks = xlKeys(r);
      nx.add(ks[Math.min(n - 1, ks.length - 1)]);
    }
    setFold(nx);
  };
  /*
   * ⚠️ МӨР ТУС БҮРИЙН `+`/`−` ТОВЧ ХАСАГДСАН (2026-09-09, хэрэглэгчийн заавар:
   * «түвшингээр шүүж болж байгаа учраас +/− delete»). Excel-ийн outline-ийн
   * үүргийг хүснэгтийн дээрх «Түвшин 1 2 3 4» зурвас БҮРЭН гүйцэтгэдэг тул
   * зурвасын мөр бүрд нэмэлт товч байх нь давхардсан удирдлага байв.
   * ⚠️ Иймд `lvl` нь ХЭЗЭЭ Ч 0 («холимог») болохгүй: эвхэлт зөвхөн түвшний
   * товчоор л өөрчлөгддөг.
   */
  /**
   * НЭЭЛТТЭЙ КАЛЕНДАР — аль нүднийх, хаана, юу бичих вэ.
   *
   * ⚠️ `set` нь ФУНКЦ тул `useState`-д ШУУД дамжуулж болохгүй байсан —
   * объект дотор боож хадгална (React функцийг «шинэчлэгч» гэж ойлгодог).
   */
  const [cal, setCal] = useState<
    { value: string; anchor: DOMRect; set: (v: string) => void } | null
  >(null);
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


  /*
   * ЭРЭМБЭ — зөвхөн хавтгай хүснэгтэд (гэрээний бүртгэл).
   * ⚠️ Анхдагчаар ЭХНИЙ багана («Төрөл») өсөхөөр. Бүлэглэлтгүй 76 мөр эмх
   * замбараагүй байвал ижил төрлийн гэрээ тарж, харьцуулах боломжгүй болно.
   * ⚠️ `null` = эрэмбэлэхгүй, эх дараалал хэвээр.
   */

  const autoShut = useRef(false);
  /** IPC-ийн ДЭЛГЭСЭН актууд — дэлгэрэнгүй талбарууд нь мөрийн доор гарна */
  const [xp, setXp] = useState<Set<number | string>>(new Set());

  const dirty = Object.keys(pend).length + adds.length;

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
  const reset = () => { setPend({}); setAdds([]); setErr(null); };

  const publish = async () => {
    if (busy || !dirty) return;
    /*
     * ⚠️ ЭНЭ ХҮСНЭГТ ЭХ МӨРИЙГ УСТГАХГҮЙ (2026-09-08, хэрэглэгчийн заавар).
     * Урьд нь мөр устгах товч байсан бөгөөд нийтлэхийн өмнө баталгаа асуудаг
     * байв. Гэвч эдгээр үйлчилгээнд хувилбарын түүх асаагүй тул устгасан мөр
     * БҮРМӨСӨН алга болдог — баталгааны цонх нь хангалттай хамгаалалт биш.
     * Устгал шаардлагатай бол ArcGIS-ийн өөрийн хэрэгслээр, ухамсартайгаар.
     *
     * ⚠️ Иймд нийтлэх нь ЗАСВАР ба НЭМЭЛТ хоёрыг л илгээнэ — баталгаа
     * асуухгүй: өдөр тутмын ажил бүрд цонх гарвал хүн уншихаа болино.
     */
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
      /*
       * ⚠️ `deletes` ЭНД ХЭЗЭЭ Ч ИРЭХГҮЙ (2026-09-08, хэрэглэгчийн заавар):
       * энэ хүснэгт нь эх үйлчилгээний мөрийг УСТГАХГҮЙ. Засах ба нэмэх л
       * зөвшөөрөгдөнө. Устгал хэрэгтэй бол ArcGIS-ийн өөрийн хэрэгслээр,
       * ухамсартайгаар хийгдэх ёстой.
       */

      /* ══════ САРЫН ЗАДАРГААГ ХУГАЦААНД НИЙЦҮҮЛЭХ ══════
       *
       * ⚠️ Төлөвлөгөөт хугацаа өөрчлөгдвөл сарын мөрүүд нь ДАГАЖ өөрчлөгдөх
       * ёстой — эс бөгөөс S-муруй хуучин хуваарийг харуулж, хугацаа заасан
       * хүн өөрчлөлтөө огт олж харахгүй.
       *
       * ⚠️ БӨГЛӨГДСӨН САРЫГ ХЭЗЭЭ Ч УСТГАХГҮЙ. Мужаас гарсан ч `Cashflow_huwi`
       * утгатай мөр ҮЛДЭНЭ, зөвхөн мэдэгдэл өгнө: тэр бол хүний оруулсан
       * ажил бөгөөд хугацаа алдаатай засагдсан байж болно. Хоосон сарыг л
       * цэвэрлэнэ.
       * ⚠️ Энэ бол «эх мөрийг устгахгүй» дүрмийн ГАНЦ үл хамаарах зүйл:
       * эдгээр мөр нь эх өгөгдөл БИШ, хугацаанаас БОДОГДСОН хуваарь.
       */
      const monthAdds: Record<string, unknown>[] = [];
      const monthDels: number[] = [];
      let keptOut = 0;
      if (dataKey === 'CASHFLOW_NEW') {
        const rowByOid = new Map(rows.map((r) => [Number(r[oidField]), r]));
        /** Огнооны утга — засвартай бол ТҮҮНИЙГ, эс бөгөөс мөрийнхийг */
        const dateOf = (a: Record<string, unknown>, r: Row | undefined, fld: string) => {
          const v = fld in a ? a[fld] : r?.[fld];
          const x = Number(v);
          return Number.isFinite(x) && x > 0 ? new Date(x) : null;
        };
        /** «2026-03» */
        const keyOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

        for (const [oid, a] of upd) {
          if (!('ehleh_ognoo' in a) && !('duusah_ognoo' in a)) continue;
          const r = rowByOid.get(oid);
          const id = Number(r?.Cashflow_ID);
          if (!Number.isFinite(id)) continue;
          const st = dateOf(a, r, 'ehleh_ognoo');
          const en = dateOf(a, r, 'duusah_ognoo');
          /* ⚠️ Хоёр огнооны АЛЬ НЭГ нь дутуу бол сарын жагсаалт тодорхойгүй —
             хуучин мөрүүдийг ХЭВЭЭР үлдээнэ, таамаглаж устгахгүй. */
          if (st == null || en == null) continue;

          /* Шинэ мужийн сарууд */
          const want = new Map<string, { s: number; e: number }>();
          let y = st.getUTCFullYear();
          let m = st.getUTCMonth();
          const n2 = Math.min(480, Math.max(1,
            (en.getUTCFullYear() - y) * 12 + (en.getUTCMonth() - m) + 1));
          for (let i = 0; i < n2; i += 1) {
            want.set(`${y}-${String(m + 1).padStart(2, '0')}`, {
              s: Date.UTC(y, m, 1),
              e: Date.UTC(y, m + 1, 1) - 86400000,
            });
            m += 1;
            if (m > 11) { m = 0; y += 1; }
          }

          const have = new Map<string, Row>();
          for (const mr of monthBy.get(id) ?? []) {
            const t = Number(mr.Cashflow_start);
            if (Number.isFinite(t)) have.set(keyOf(new Date(t)), mr);
          }

          /* Шинээр гарсан сар — нэмнэ (хувь нь ХООСОН, хүн бөглөнө) */
          for (const [k, v] of want) {
            if (have.has(k)) continue;
            monthAdds.push({ Cashflow_ID: id, Cashflow_start: v.s, Cashflow_end: v.e });
          }
          /* Мужаас гарсан сар — ЗӨВХӨН хоосныг устгана */
          for (const [k, mr] of have) {
            if (want.has(k)) continue;
            const filled = mr.Cashflow_huwi != null && String(mr.Cashflow_huwi).trim() !== '';
            const moid = Number(mr[oidField]);
            if (filled) { keptOut += 1; continue; }
            if (Number.isFinite(moid)) monthDels.push(moid);
          }
        }

        /* ══════ САРЫН ДҮНГ ХУВИАС БОДОХ ══════
         * ⚠️ `Cashflow_dun` нь ГАРААР бичигддэггүй: хувь × эцгийн ХО дүн.
         * Хоёуланг нь гараар бөглөвөл хэзээ нэгэн цагт зөрөх нь тодорхой.
         */
        const monthByOid = new Map(months.map((r) => [Number(r[oidField]), r]));
        for (const [oid, a] of upd) {
          if (!('Cashflow_huwi' in a)) continue;
          const mr = monthByOid.get(oid);
          const parent = rows.find((r) => Number(r.Cashflow_ID) === Number(mr?.Cashflow_ID));
          const cost = Number(parent?.ho_dun_geree);
          const pct = Number(a.Cashflow_huwi);
          /* ⚠️ Хувийг АРИЛГАВАЛ дүн ч арилна (`null`), 0 болохгүй */
          a.Cashflow_dun = a.Cashflow_huwi == null || !Number.isFinite(pct) || !Number.isFinite(cost)
            ? null
            : (cost * pct) / 100;
        }
      }
      const { n } = await applyAll(url, oidField, {
        updates: [...upd.values()],
        adds: [...newRows, ...monthAdds],
        /* ⚠️ ГАНЦ ЗӨВШӨӨРӨГДСӨН УСТГАЛ: хугацаанаас гарсан ХООСОН сарын мөр
           (дээрх тайлбарыг үз). Эх өгөгдлийн мөр энд ХЭЗЭЭ Ч ирэхгүй. */
        deletes: monthDels,
      });

      /* ⚠️ Кэшийг зөвхөн АМЖИЛТТАЙ бичилтийн дараа хаяна */
      invalidate(dataKey);
      /* ⚠️ `reset()`-ЭЭС ӨМНӨ зөөнө — тэр `pend`-ийг хоослоно. Устгасан
         мөрийн нүд тэмдэглэгдэхгүй: тэр мөр өөрөө алга болсон. */
      setSaved((prev) => {
        const nx = new Set(prev);
        for (const k of Object.keys(pend)) nx.add(k);
        return nx;
      });
      reset();
      setMsg([
        tr('{0} мөр хадгалагдав', n),
        monthAdds.length ? tr('сар нэмэгдсэн: {0}', monthAdds.length) : '',
        monthDels.length ? tr('хоосон сар хасагдсан: {0}', monthDels.length) : '',
        /* ⚠️ Бөглөсөн сар мужаас гарсныг ЗААВАЛ хэлнэ — чимээгүй үлдээвэл
           хүн S-муруйд яагаад илүү сар байгааг олж чадахгүй. */
        keptOut ? tr('⚠ мужаас гарсан ч бөглөгдсөн тул үлдээсэн: {0}', keptOut) : '',
      ].filter(Boolean).join(' · '));
      onSaved();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };
  /**
   * ГЭРЭЭНИЙ БҮРТГЭЛИЙН БАГАНЫ ДАРААЛАЛ.
   *
   * ⚠️ Үйлчилгээний метадатагийн дараалал нь ажлын логиктой тохирдоггүй —
   * «Багц 74» ба «Гүйцэтгэлийн хувь» хоёр хамаагүй хол унасан байдаг.
   * ⚠️ Жагсаалтад БАЙХГҮЙ талбар алдагдахгүй — шүүгээд биш ЭРЭМБЭЛЖ байна.
   */
  /*
   * ⚠️ 2026-09-08: эрэмбэ нь `Сэлбэ дэд төв_ХО төлөвлөгөө_arcgis.xlsx`-ийн
   * B…Z баганы дараалал болов (`finExcelLayout.ts`). Гүйцэтгэл бөглөдөг хүмүүс
   * тэр Excel-ийг өдөр бүр хардаг тул порталын хүснэгт нь тэдний нүдэнд ТАНИЛ
   * дараалалтай байх ёстой.
   */
  const FLAT_LEAD = FIN_XL_ORDER;

  /** БҮХ багана — нуулт/дараалал хэрэглэхээс ӨМНӨХ жагсаалт */
  const allCols: FieldDef[] = useMemo(() => {
    const base = (
      fields.length
        ? fields
        : rows[0]
          ? Object.keys(rows[0]).map((k) => ({ name: k, alias: k, type: 'esriFieldTypeString' }))
          : []
    ).filter((c) => !isSkip(c.name, c.type, oidField));

    if (dataKey !== 'CASHFLOW_NEW') return base;
    /*
     * ⚠️ ЗАДАРГААНЫ ТҮВШНҮҮД БАГАНА болж ГАРАХГҮЙ: Excel-д тэдгээр нь багана
     * биш, бүх өргөнөөр татсан ЗУРВАС мөр. Утга нь зурваснаас бүрэн уншигдана
     * — өгөгдөл нуугдахгүй. Багана болгож үлдээвэл 78 мөрд ижил утга дахин
     * дахин давтагдаж, зурвастай давхардана.
     * ⚠️ КОДЫН талбарууд (`bagts_tuvshin*`) ч мөн адил — тэдгээр нь зурвасын
     * шошгын урд («4.1 · Гадна цахилгаан холбоо») гарна.
     */
    const STRUCT = new Set<string>([
      FIN_XL_SECTION, FIN_XL_GROUP_FIELD, FIN_XL_GROUP3_FIELD, ...FIN_XL_CODE,
    ]);
    const noSec = base.filter((c) => !STRUCT.has(c.name));
    const rank = (n: string) => {
      const i = FLAT_LEAD.indexOf(n);
      return i < 0 ? FLAT_LEAD.length : i;
    };
    // ⚠️ Тогтвортой эрэмбэ — тэнцүү зэрэгтэй багана эх дараалалдаа үлдэнэ
    return noSec
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

  /**
   * БАГАНЫ БҮТЭЦ — нуух · царцаах · зөөх · мөр таслах (2026-09-08).
   *
   * ⚠️ 33 багана нь бүгд нэг зэрэг хэрэгтэй БАЙДАГГҮЙ: хэрэглэгч ажлынхаа
   * төрлөөс шалтгаалж 5–10-ыг нь л хардаг. Excel-ийн энгийн үйлдлүүдийг
   * (нуух, царцаах, зөөх) өгснөөр 33 баганыг хэрэглэгч өөрөө өөрийн
   * хүснэгт болгоно.
   *
   * ⚠️ Анхдагчаар «Нарийвчилсан төрөл» МӨР ТАСАРСАН: тэр нь ажлын бүтэн нэр
   * агуулдаг цорын ганц урт талбар бөгөөд урьд нь нүд бүр дээр дарж дэлгэх
   * шаардлагатай байв (хэрэглэгчийн шүүмж).
   */
  /**
 * ⚠️ ТОГТВОРТОЙ ХООСОН МАССИВ — `useSheetCols`-ийн `hideV` нь агуулгаараа
 * тооцогддог ч `useMemo`-гийн хамаарал нь ИШЛЭЛЭЭР жишдэг. Рендер бүрт `[]`
 * шинээр үүсгэвэл доторх санамжууд дэмий дахин тооцогдоно.
 */
const EMPTY_HIDE: string[] = [];

const DEF_WRAP = useMemo(() => ['ajil_uilchilgee'], []);
  const colNames = useMemo(() => allCols.map((c) => c.name), [allCols]);
  /**
   * АНХДАГЧААР НУУГДАХ багана — ЗӨВХӨН гэрээний бүртгэлд.
   * ⚠️ IPC-д анхдагч нуулт байхгүй тул хоосон массив: `useSheetCols`-ийн
   * `hideV` нь агуулгаараа тооцогддог учир хоосон нь «анхдагчгүй» гэсэн үг.
   */
  const defHidden = dataKey === 'CASHFLOW_NEW' ? FIN_XL_HIDE : EMPTY_HIDE;
  const sc = useSheetCols(`fin-${dataKey}`, colNames, DEF_WRAP, defHidden, FIN_XL_ORDER_V);

  /**
   * ХАРАГДАХ багана — хэрэглэгчийн дараалал ба нуултыг хэрэглэсэн.
   *
   * ⚠️ `allCols` нь эх сурвалж хэвээр: цэс, «бүгдийг харуулах» хоёр түүнээс
   * уншина — нуугдсан баганыг буцаах зам хаагдах ёсгүй.
   */
  /**
   * ⚠️ МӨР ТАСАЛСАН багана нь ДЭЛГЭХ шаардлагагүй: бичвэр аль хэдийн бүтнээрээ
   * харагдаж байгаа тул нүд дарахад «мурийж дэлгэгдэх» нь ердөө байрлал л
   * зөрүүлнэ (2026-09-08). Тасралтгүй багананд л дэлгэлт утгатай.
   */
  const EXPANDABLE = useMemo(
    () => ['ajil_uilchilgee'].filter((n) => !sc.wrap.has(n)),
    [sc.wrap],
  );

  const cols: FieldDef[] = useMemo(() => {
    const by = new Map(allCols.map((c) => [c.name, c]));
    return sc.view.map((n) => by.get(n)).filter((c): c is FieldDef => c != null);
  }, [allCols, sc.view]);

  /**
   * OUTLINE ЗУРВАСЫН ӨРГӨН — Excel-ийн зүүн захын бүлэглэлтийн зурвас.
   *
   * ⚠️ ТУСДАА БАГАНА БОЛГОСОНГҮЙ: царцсан багануудын `left` нь өргөний
   * хуримтлалаар тооцогддог тул шинэ баганыг эхэнд оруулбал тэр гинж
   * бүхэлдээ шилжиж, толгой ба мөр хоёр зөрөх эрсдэлтэй. Оронд нь № нүдийг
   * өргөсгөж, зурвасыг түүний дотор ҮНЭМЛЭХҮЙ байрлуулав.
   * ⚠️ Зөвхөн гэрээний бүртгэлд — IPC-д ийм шатлал байхгүй.
   */
  /**
   * EXCEL-ИЙН ХАРАГДАЦ — зүүн гарын ГУТАЛ БАГАНА БАЙХГҮЙ.
   *
   * ⚠️ 2026-09-09-нд хасав (хэрэглэгчийн хүсэлт: «зүгээр hide байж болохгүй
   * юу»). Тэр багана мөрийн дугаар агуулдаг байсан нь Excel-ийн ӨӨРИЙН «№»
   * баганатай (`dugaar`) ДАВХАРДАЖ, нэг хүснэгтэд хоёр дугаарлалт гарч байв.
   * ⚠️ Outline-ийн `+`/`−` товч АЛГА БОЛООГҮЙ — зурвасын мөрийн «БАГЦ» нүд рүү
   * шилжсэн (`bandCell`). Excel-д тэр товч торны зүүн гадна суудаг ч порталд
   * тусдаа багана болговол царцсан багануудын `left` гинж шилжинэ.
   * ⚠️ ЗАСВАР ба IPC-д гутал ХЭВЭЭР: тэнд Excel-ийн № багана байхгүй тул
   * мөрийн дугаар нь цорын ганц чиглүүлэгч, мөн засварын тамга тэнд гарна.
   */
  const xlView = dataKey === 'CASHFLOW_NEW' && !edit;
  const OUT_W = 0;

  /** Анхны өргөн — эхний 5 багана (гутал + царцсан баганууд) */
  const FZ_DEF = [xlView ? 0 : 46, 230, 210, 120, 120];

  /**
   * ТУСГАЙ АНХНЫ ӨРГӨН — урт бичвэртэй багана.
   *
   * ⚠️ Зөвхөн «Нарийвчилсан төрөл»: тэр нь ажлын БҮТЭН нэр агуулдаг цорын ганц
   * талбар бөгөөд анхдагч өргөнд хоёр үг л багтдаг байв. Мөр таслалттай тул
   * өндөр нь өснө — өргөн нь тэр өсөлтийг хязгаарлана (нарийн багана нь
   * найман мөр болж, хүснэгт бүхэлдээ сунана).
   */
  /*
   * ⚠️ ХОЦРОГДСОН: анхны өргөн одоо `FIN_XL_WIDTH`-ээс ирнэ (Excel-ийн
   * харьцаа). Энэ хүснэгт нь ЗӨВХӨН IPC-д (Excel-д байхгүй талбарууд) үлдэв.
   */
  const WIDE: Record<string, number> = {};

  /**
   * ЕРДИЙН БАГАНЫ АНХНЫ ӨРГӨН — `FZ_DEF`-д ч, `WIDE`-д ч байхгүй үед.
   *
   * ⚠️ ЦАРЦСАН багананд ЗААВАЛ хэрэгтэй: түүний `left` нь өмнөх багануудын
   * өргөний НИЙЛБЭР тул өргөн нь «агуулгаараа» гэж үлдвэл нийлбэр тооцогдохгүй.
   */
  const DEF_COL = 150;

  /**
   * АНХДАГЧ ӨРГӨН — Excel-ийн зохиомжоос, эс бөгөөс хуучин утгууд.
   * ⚠️ Хэрэглэгчийн чирсэн өргөн (`colW`) үүнийг ҮРГЭЛЖ дарна.
   */
  const defW = (name: string, i: number): number => (
    FIN_XL_WIDTH[name] ?? (i < 4 ? FZ_DEF[i + 1] : (WIDE[name] ?? DEF_COL))
  );

  /** Царцаалтад хэрэглэх БАТАЛГААТАЙ өргөн — хэзээ ч `undefined` буцаахгүй */
  const wOf = (name: string, i: number): number => colW(name, defW(name, i)) ?? DEF_COL;

  /** Тухайн баганын одоогийн өргөн (чирсэн бол түүнийг, эс бөгөөс анхныхыг) */
  const colW = (name: string, dflt?: number): number | undefined => {
    const v = (colStyle as Record<string, string>)[`--w-${name}`];
    if (v) return parseInt(v, 10);
    return dflt;
  };

  /**
   * ЦАРЦСАН БАГАНУУДЫН ЗҮҮН ШИЛЖИЛТ — өргөний хуримтлагдсан нийлбэрээр.
   *
   * ⚠️ ТООГ ХЭРЭГЛЭГЧ ТОГТООНО (`sc.frozen`), 4 гэж хатуу бичихээ БОЛИВ
   * (2026-09-08). Хүн бүрийн ажил өөр: зарим нь зөвхөн «Төрөл»-ийг барих
   * хэрэгтэй, зарим нь зургаан баганыг.
   */
  const frzLeft = useMemo(() => {
    const out = [FZ_DEF[0]];
    for (let i = 0; i < sc.frozen; i += 1) out.push(out[i] + wOf(cols[i]?.name ?? '', i));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colStyle, cols, sc.frozen]);

  /* ══════════ ШҮҮЛТ ══════════ */

  /**
   * Засвартай мөрийн OID-ууд.
   * ⚠️ Эдгээр мөрийг шүүлт ХЭЗЭЭ Ч нуухгүй. Хэрэглэгч нүд засаад утга нь
   *    шүүлтэнд таарахаа болиход мөр нь гар доороос алга болвол хийсэн ажил
   *    нь харагдахгүй үлдэж, «Нийтлэх (3)» гэсэн тоо нь юуг заасныг мэдэхгүй
   *    болно.
   */
  const keepOids = useMemo(() => {
    const s = new Set<number>();
    for (const k of Object.keys(pend)) {
      const oid = Number(k.slice(0, k.indexOf(':')));
      if (Number.isFinite(oid)) s.add(oid);
    }
    return s;
  }, [pend]);

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
   * ⚠️ `Cashflow_0909` нь ГЭРЭЭ/САР гэсэн мөрийн төрөлгүй — гэрээ бүр НЭГ мөр.
   * `cf` горимд зурвал `splitContracts` мастер мөр олохгүй тул хүснэгт ХООСОН
   * гарна. Тиймээс хавтгай горим.
   */
  /* ⚠️ 2026-09-06: «cf» горим (хуучин `cashflow_0813`-ийн паспорт+хуваарь
     карт) БҮРМӨСӨН хасагдсан — тэр үйлчилгээ байхгүй болсон. Үлдсэн хоёр
     хүснэгт: гэрээний бүртгэл (нэг бүтэн хүснэгт) ба актын урсгал. */
  const kind: FinKind = dataKey === 'HO_IPC' ? 'ho' : 'flat';
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
   * ЦАРЦСАН БАГАНА — хэвтээ гүйлгэхэд байрандаа үлдэнэ.
   * ⚠️ Зөвхөн `position: sticky` хангалтгүй: багана бүрийн `left` нь өмнөхүүдийн
   * ӨРГӨНИЙ НИЙЛБЭР байх ёстой (`frzLeft`).
   */
  /**
   * ⚠️ НЭГ КЛАСС, инлайн `left`/`z-index` (2026-09-08). Урьд нь `.xlF1…4`
   * гэсэн ДӨРВӨН класс байсан тул царцаалтын тоо CSS-д хатуу шингэсэн байв.
   * Хэрэглэгч 6 багана царцаахыг хүсвэл CSS засах шаардлагатай болно.
   */
  /**
   * ⚠️ ХИЛИЙН ЗУРААС нь ТОЛГОЙД ба МӨР БҮРД (2026-09-08, хэрэглэгчийн заавар).
   * Урьд нь зөвхөн `th`-д тавигддаг байсан тул царцсан хэсэг хаана дуусахыг
   * зөвхөн дээд ирмэгээс уншиж, доош гүйхэд хил нь алга болдог байв.
   */
  const frz = (i: number): string => (i < sc.frozen
    ? [f.xlFz, i === sc.frozen - 1 ? f.xlFzEdge : ''].filter(Boolean).join(' ')
    : '');

  /** Нүдний өргөн ба (царцсан бол) зүүн шилжилт */
  const colSty = (c: FieldDef, i: number, head = false): CSSProperties => {
    const on = i < sc.frozen;
    /* ⚠️ Царцсан бол өргөн нь ЗААВАЛ тодорхой (§`wOf`); эс бөгөөс агуулгаараа */
    const w = on ? wOf(c.name, i) : colW(c.name, defW(c.name, i));
    const st: CSSProperties = w != null ? { width: w, minWidth: w, maxWidth: w } : {};
    if (on) {
      st.left = frzLeft[i];
      /*
       * ⚠️ Зүүн тийш ӨСӨХ z-index: баруун талын царцсан багана нь зүүнийхийнхээ
       * ДООГУУР гүйх ёстой, эс бөгөөс гүйлгэхэд хоёр нь давхарлаж хоёулаа
       * уншигдахгүй болно.
       *
       * ⚠️ ТОЛГОЙД 25-аас ЭХЛЭНЭ (2026-09-08-ны засвар): толгойн нүд нь мөрийн
       * нүднээс ч, энгийн (царцаагүй) толгойноос ч ДЭЭР байх ёстой. Инлайн
       * z-index нь `.xlTbl thead .xlFz`-ийн дүрмийг ДАРДАГ тул царцсан толгой
       * 4·3·2·1 болж, энгийн толгойн (2) дор орж, гүйлгэхэд «толгой гүйж»
       * байв.
       */
      st.zIndex = (head ? 25 : 0) + (sc.frozen - i);
    }
    /* ⚠️ МӨР ТАСЛАХ — өргөнийг ХЭВЭЭР үлдээж зөвхөн бичвэрийг мурийлгана:
       `width: auto` тавибал урт утга багануудыг түлхэж хүснэгт сунана. */
    if (sc.wrap.has(c.name)) {
      st.whiteSpace = 'normal';
      st.overflow = 'visible';
      st.wordBreak = 'break-word';
      /*
       * ⚠️ ХОЁР ТАЛААР ЖИГДЭЛНЭ (`justify`) — ЗӨВХӨН тасарсан баганы ӨГӨГДЛИЙН
       * нүдэнд. Тасралтгүй нүдэнд утгагүй (нэг мөр нь жигдрэх зүйлгүй), харин
       * олон мөртэй нүдний баруун ирмэг сэмрэх нь багана хоорондын хилийг
       * бүдгэрүүлдэг.
       *
       * ⚠️ ТОЛГОЙД ХЭРЭГЛЭХГҮЙ (2026-09-08): «Нарийвчилсан төрөл» гэсэн хоёр
       * үг `justify`-д хоёр ирмэг рүү тарж, дунд нь том цоорхой үлддэг байв.
       */
      if (!head) st.textAlign = 'justify';
    }
    return st;
  };

  /* ═══════════ EXCEL-ИЙН БҮЛЭГЛЭСЭН ТОЛГОЙ (2026-09-08) ═══════════
   *
   * ⚠️ Эх нь «Сэлбэ дэд төв_ХО төлөвлөгөө_arcgis.xlsx»: тэнд толгой нь ГУРВАН
   * мөр — «Захирамжийн дүн» нь J1:Q1-ийг, түүний доторх «Хөрөнгө оруулалтын эх
   * үүсвэр» нь M2:Q2-ийг хамарна. Гүйцэтгэл бөглөдөг хүмүүс тэр бүтцээр
   * баримжаалдаг тул порталд ч ижил байх ёстой (хэрэглэгчийн заавар).
   *
   * ⚠️ Зурвас нь ОДООГИЙН харагдах баганаас угсарна — хэрэглэгч багана нуух ·
   * зөөхөд зурвас нь өөрөө богиносч, тасарч, хоёр хэсэг болно. Урьдчилан
   * бэлдсэн тогтмол зурвас байвал зөөсний дараа буруу баганыг нэрлэнэ.
   */
  type Band = {
    /** Навчны баганы индекс; зурвас бол −1 */
    leaf: number;
    label: string;
    from: number;
    span: number;
    /** ДЭЭД шатны бүлгийн нэр — өнгөний аясыг үүгээр сонгоно */
    top0: string;
  };

  const bandRows = useMemo<Band[][]>(() => {
    const paths = cols.map((c) => finXlGroup(c.name));
    const depth = paths.reduce((a, p) => Math.max(a, p.length), 0);
    const rows: Band[][] = [];
    for (let lv = 0; lv <= depth; lv += 1) {
      const row: Band[] = [];
      let i = 0;
      while (i < cols.length) {
        const p = paths[i];
        /* Багана өөрийн гүнд НЭГ УДАА гарна; түүнээс доош мөрд алгасагдана */
        if (p.length < lv) { i += 1; continue; }
        if (p.length === lv) {
          row.push({ leaf: i, label: '', from: i, span: 1, top0: p[0] ?? '' });
          i += 1;
          continue;
        }
        /* ⚠️ Зурвас нь ЗАМААРАА нэгдэнэ, зөвхөн нэрээрээ БИШ: өөр бүлгийн
           доторх ижил нэртэй дэд бүлэг санамсаргүй нийлэх ёсгүй. */
        const key = (k: number) => JSON.stringify(paths[k].slice(0, lv + 1));
        const k0 = key(i);
        let j = i + 1;
        while (j < cols.length && paths[j].length > lv && key(j) === k0) j += 1;
        row.push({ leaf: -1, label: p[lv], from: i, span: j - i, top0: p[0] });
        i = j;
      }
      rows.push(row);
    }
    return rows;
  }, [cols]);

  /**
   * ЗУРВАСУУДЫН ӨНДРИЙГ ХЭМЖИНЭ — наалдмал `top` нь тэднээс хамаарна.
   *
   * ⚠️ Тогтмол өндөр бичиж БОЛОХГҮЙ: навчны нэр 1–3 мөр болж мурийдаг ба
   * `rowSpan`-тай нүдний илүү өндөр нь СҮҮЛИЙН мөрөнд очдог тул зурвасын
   * бодит өндөр хөтчөөс хамаарч хэлбэлзэнэ. Зөрвөл толгойн мөрүүд гүйлгэх үед
   * бие бие рүүгээ шургана.
   *
   * ⚠️ Хэмжилт нь ResizeObserver-ийн ДОТОР — эффектийн биед `setState`
   * дуудвал `react-hooks/set-state-in-effect` дүрэм зөрчигдөнө. Ажиглагч нь
   * `observe` хийсэн даруйдаа нэг удаа дуудагддаг тул анхны хэмжилт ч эндээс
   * гарна.
   */
  const theadRef = useRef<HTMLTableSectionElement | null>(null);
  const [hTops, setHTops] = useState<number[]>([]);
  useEffect(() => {
    const el = theadRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      let acc = 0;
      const next = Array.from(el.children).map((r) => {
        const top = acc;
        acc += (r as HTMLElement).getBoundingClientRect().height;
        return top;
      });
      setHTops((prev) => (prev.length === next.length
        && prev.every((v, i) => Math.abs(v - next[i]) < 0.5) ? prev : next));
    });
    ro.observe(el);
    for (const r of Array.from(el.children)) ro.observe(r);
    return () => ro.disconnect();
  }, [bandRows]);

  /** Наалдмал шилжилт — хэмжигдээгүй байхад Excel-ийн нэрлэсэн өндрөөр */
  const hTop = (lv: number) => hTops[lv] ?? lv * FIN_XL_BAND_H;

  /**
   * ТОЛГОЙН ӨНГӨНИЙ АЯС — Excel-ийнхтэй ижил хоёр өнгө.
   * ⚠️ «Захирамжийн дүн» блок нь Excel-д ЦЭНХЭР (#2E75B6), бусад нь ХАР ХӨХ
   * (#203864). Тэр ялгаа нь мөнгөний эх үүсвэрийн блокийг нэг харцаар
   * тусгаарладаг тул хадгалагдана.
   */
  const xlTone = (top0: string) => (top0 === tr('Захирамжийн дүн') ? f.xlHdr2 : f.xlHdr1);

  /** Зурвас БҮХЭЛДЭЭ царцсан бүсэд байна уу — тийм бол өөрөө ч наалдана */
  const bandFz = (b: Band) => sc.frozen > 0 && b.from + b.span <= sc.frozen;

  /**
   * ⚠️ Царцсан бүсийг ДАВСАН зурвас наалддаггүй: түүний зүүн ирмэг царцсан
   * баганы дор шургаж, баруун хэсэг нь гүйнэ. Ийм зурвасыг наалдуулбал
   * баганаасаа тасарч, огт өөр багануудын дээр очно.
   */
  const bandSty = (b: Band, lv: number): CSSProperties => {
    const st: CSSProperties = { top: hTop(lv), height: FIN_XL_BAND_H };
    if (bandFz(b)) {
      st.left = frzLeft[b.from];
      st.zIndex = 25 + (sc.frozen - b.from);
    }
    return st;
  };

  /**
   * ОГНООНЫ НҮДНИЙ ЗАСВАРЛАГЧ — бичих ба календараас сонгох ХОЁУЛАА.
   *
   * ⚠️ Гараар бичих замыг ХААХГҮЙ: 76 мөрийн огноо оруулахад календар нээж
   * дарах нь товшилт олон дахин нэмнэ. Хэлбэр нь `YYYY-MM-DD` — `parseCell`
   * яг үүнийг хүлээж авдаг бөгөөд «27.05.2026» гэх мэт бичиглэлийг ЧИМЭЭГҮЙ
   * зөвшөөрөхгүй (`Error` шиднэ).
   */
  const dateEdit = (cur: string, onEdit: (v: string) => void) => (
    <span className={f.dateCell}>
      <input
        className={f.cellInput}
        value={cur}
        placeholder="YYYY-MM-DD"
        onChange={(ev) => onEdit(ev.target.value)}
      />
      <button
        type="button"
        className={f.calBtn}
        title={tr('Календараас сонгох')}
        aria-label={tr('Календараас сонгох')}
        onClick={(ev) => {
          const host = (ev.currentTarget.parentElement ?? ev.currentTarget) as HTMLElement;
          setCal({ value: cur, anchor: host.getBoundingClientRect(), set: onEdit });
        }}
      >📅</button>
    </span>
  );

  const xCell = (
    r: Row, oid: number | null, dropped: boolean, c: FieldDef,
    extra = '', sty?: CSSProperties,
    /**
     * БОСОО НЭГТГЭЛ — хэдэн мөрийг дамжин суух.
     *
     * ⚠️ ЗӨВХӨН уншлагын горимд ирнэ. Засварын горимд нүд бүр ӨӨРИЙН
     * оролттой байх ёстой: нэгтгэвэл гүйдлийн эхний мөрөөс бусад нь
     * засагдах боломжгүй болно.
     */
    span?: number,
    /**
     * ХӨНДЛӨН НЭГТГЭЛ — хэдэн баганыг эзлэх.
     *
     * ⚠️ Дуудагч нь өргөнийг ЗААВАЛ өөрөө нийлүүлж `sty`-д өгнө: царцсан
     * багануудын `left` нь өргөний хуримтлалаас тооцогддог тул нэгтгэсэн
     * нүд нарийхан үлдвэл түүнээс хойшхи бүх багана зөрнө.
     */
    cSpan?: number,
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
          {DATE_TYPES.has(c.type) ? dateEdit(cur, onEdit) : (
            <input
              className={`${f.cellInput} ${NUMERIC_TYPES.has(c.type) ? 'num' : ''}`}
              value={cur}
              onChange={(ev) => onEdit(ev.target.value)}
            />
          )}
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
        rowSpan={span}
        colSpan={cSpan}
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
          /* Excel-ийн merge шиг — олон мөрийг дамжсан нүд голдоо */
          span && span > 1 ? f.xlMerged : '',
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
      const put = (v: string) => setPend((p) => {
        const nx = { ...p };
        if (v === editText(r[c.name], c.type)) delete nx[key];
        else nx[key] = v;
        return nx;
      });
      if (DATE_TYPES.has(c.type)) return dateEdit(cur, put);
      return (
        <input
          className={`${f.cellInput} ${NUMERIC_TYPES.has(c.type) ? 'num' : ''}`}
          value={cur}
          onChange={(ev) => put(ev.target.value)}
        />
      );
    }
    const cell = fmtCell(r[c.name], c.type, c.name);
    return cell.text === ''
      ? <span className={f.pEmpty}>—</span>
      : <span className={cell.num ? 'num' : undefined}>{cell.text}</span>;
  };

  /* Багануудын хуваарилалт — хуваарийнх нь `finCard.CF_PERIOD_FIELDS`,
     үлдсэн нь паспорт. HO: үндсэн баганууд + дэлгэрэнгүй.
     ⚠️ `HO_MAIN_FIELDS`-д гэрээний ТОМ ДҮН (`tosov_niit` г.м.) ОРООГҮЙ —
     тэдгээр нь гэрээний 7 мөрд ДАВТАГДАЖ нүд гутаана. Дэлгэрэнгүйд үлдэнэ. */
  const ipcMainCols = useMemo(
    () => HO_MAIN_FIELDS
      .map((n) => cols.find((c) => c.name === n))
      .filter((c): c is FieldDef => c != null),
    [cols],
  );
  const ipcDetailCols = useMemo(
    () => cols.filter((c) => !HO_MAIN_FIELDS.includes(c.name)),
    [cols],
  );
  /** Толгой баруун зэрэгцэх үү — мөнгөн багана тийм, он·сар·дугаар үгүй */
  const thRight = (c: FieldDef) => NUMERIC_TYPES.has(c.type) && !PLAIN_INT.has(c.name);

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
    /*
     * ⚠️ ГЭРЭЭНИЙ БҮРТГЭЛ нь EXCEL-ИЙН МӨРИЙН ДАРААЛЛААР (2026-09-08).
     * Тэр дараалал нь санамсаргүй биш: ХЭСЭГ → ТӨРӨЛ → БАГЦ гэсэн шатлалыг
     * авч явдаг бөгөөд зурвас ба нэгтгэл ЗӨВХӨН түүн дээр зөв тогтоно.
     * Талбараар эрэмбэлбэл нэг төрлийн мөрүүд салж, «ИНЖЕНЕРИЙН ДЭД БҮТЭЦ»
     * гурван тусдаа бүлэг болж хуваагдана.
     * ⚠️ OID нь Excel-ийн мөрийн дугаартай нэг зэрэгтэй (1…76) — файлыг
     * ачаалахдаа дараалал нь хадгалагдсан.
     */
    if (dataKey === 'CASHFLOW_NEW') {
      /*
       * ⚠️ OID-ААР БИШ, ЗАДАРГААНЫ КОДООР (2026-09-09, хэрэглэгчийн шүүмж:
       * «1-7 дараалалыг янзлаад өгөөч»).
       *
       * Урьд нь OID = Excel-ийн мөрийн дугаар гэж найдаж байсан. Гэвч
       * үйлчилгээн дээр шатлалыг гараар засмагц («ОРОН СУУЦНЫ ХОРООЛОЛ» нь
       * 1-р түвшин, код 3 болов) OID-ийн дараалал кодтойгоо зөрж, зурвас нь
       * 1 · 3 · 2 · 4 … гэж гарч байв.
       *
       * ⚠️ Код нь «4.2» мэт ЦЭГТЭЙ тул хэсэг бүрийг ТООГООР жишнэ: текстээр
       * бол «10» нь «2»-оос ӨМНӨ ирнэ.
       * ⚠️ Тэнцүүг OID-аар тасална — нэг багц доторх ажлын дараалал Excel-ийн
       * файлынхаараа үлдэнэ.
       */
      const seg = (v: unknown): number[] => String(v ?? '').trim().split('.')
        .map((t) => {
          const n = Number(t);
          /* ⚠️ Кодгүй бол ХАМГИЙН СҮҮЛД (`Infinity`): «Газар чөлөөлөлт» мэт
             кодгүй дэд бүлэг эцгийнхээ дотор эмх замбараагүй хөвөх ёсгүй. */
          return Number.isFinite(n) && t !== '' ? n : Infinity;
        });
      const cmpSeg = (a: number[], b: number[]): number => {
        for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
          const d = (a[i] ?? -1) - (b[i] ?? -1);
          if (d !== 0) return Number.isNaN(d) ? 0 : d;
        }
        return 0;
      };
      const keyOf = (r: Row) => FIN_XL_CODE.map((f2) => seg(r[f2]));
      return list.slice().sort((x, y) => {
        const kx = keyOf(x.row);
        const ky = keyOf(y.row);
        for (let d = 0; d < kx.length; d += 1) {
          const c = cmpSeg(kx[d], ky[d]);
          if (c !== 0) return c;
        }
        return (x.oid ?? 0) - (y.oid ?? 0);
      });
    }
    const col = cols[0]?.name;
    if (!col) return list;
    // ⚠️ Хуулбарыг эрэмбэлнэ — эх массивыг өөрчилвөл дээд түвшний тооцоо гажна
    // ⚠️ Тэнцүүг OID-аар тасална — эс бөгөөс дараалал ачаалалт бүрд хөвнө
    return list.slice().sort((x, y) => cmpVals(y.row[col], x.row[col])
      || ((x.oid ?? 0) - (y.oid ?? 0)));
  };

  /**
   * ТОЛГОЙН ШҮҮЛТИЙН ЦЭС — ArcGIS-ийн атрибут хүснэгттэй ижил зан.
   *
   * Багана бүрийн ЯЛГААТАЙ утгууд чагттай жагсаалтаар гарна; сонгосон нь
   * `flt.pick[багана]`-д хадгалагдаж, `rowMatches` тэдгээрийн аль нэгтэй ЯГ
   * тэнцүү мөрийг үлдээнэ.
   *
   * ⚠️ ЭРЭМБЭ ЭНД БАЙХГҮЙ. ArcGIS-ийн цэсэнд «A→Z» байдаг ч энэ хүснэгтийн
   * эрэмбийг 2026-09-04-нд хэрэглэгч ТОГТМОЛ болгохоор шийдсэн («иим sort
   * дээр чи хадгалаад болсон, өөр хүн sort хийхгүй») — цэсэнд эрэмбэ
   * нэмбэл тэр шийдвэр чимээгүй буцна.
   *
   * ⚠️ Утга нь ХАРАГДАЖ БУЙ текст (`fmtCell`-ийн гаралт) — эс бөгөөс
   * жагсаалтад «1787270400000», хүснэгтэд «2026-09-04» гэж хоёр өөр зүйл
   * харагдана.
   *
   * ⚠️ Жагсаалтыг ШҮҮГДЭЭГҮЙ бүх мөрөөс (`rows`) гаргана: өөр багана
   * шүүгдсэн байхад энэ баганын сонголт хумигдвал хэрэглэгч буцаж
   * өргөсгөх боломжгүй мухарт ордог.
   */
  const headMenu = () => {
    if (!hMenu) return null;
    const c = cols.find((x) => x.name === hMenu.name);
    if (!c) return null;
    return (
      <>
        {/* Гадна дарахад хаана — цэс нээлттэй үлдэж хүснэгтийг халхлахаас сэргийлнэ */}
        <div className={f.thMenuVeil} onClick={() => setHMenu(null)} />
        <div
          className={f.thMenu}
          style={{ left: Math.min(hMenu.x, Math.max(8, window.innerWidth - 280)), top: hMenu.y }}
          /* ⚠️ Цэс дэх товшилт нь ХҮСНЭГТИЙН цэвэрлэгч рүү хүрэх ёсгүй — эс
             бөгөөс «Сонгосон 4 баганыг царцаах» дарахад сонголт нь тэр товшилтоор
             аль хэдийн тайлагдчихсан байна. */
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className={f.thMenuHead}>
            {finFieldLabel(c.name) === c.name ? c.alias : finFieldLabel(c.name)}
          </div>

          {/*
            * БАГАНЫН ҮЙЛДЛҮҮД — Excel-ийн энгийн багц (2026-09-08).
            *
            * ⚠️ ШҮҮЛТЭЭС ЗУРААСААР тусгаарлав: шүүлт нь ӨГӨГДӨЛД, эдгээр нь
            * ХАРАГДАЦАД үйлчилнэ. Нэг бүлэгт нийлүүлбэл «нуух» нь мөр
            * шүүдэг мэт уншигдана.
            */}
          {/* ⚠️ ЭДГЭЭР ШОШГО АНГЛИАР — хэрэглэгчийн шууд заавар (2026-09-08).
              Excel/ArcGIS-ийн ижил үйлдлүүд англиараа танигддаг тул орчуулга нь
              эсрэгээрээ таних хугацааг уртасгана. Тиймээс `tr()`-гүй. */}
          <div className={f.thMenuCols}>
            {/*
              * ⚠️ СОНГОЛТ БАЙВАЛ ТҮҮГЭЭР, эс бөгөөс ЭНЭ баганаар. Excel-д ч
              * ялгаагүй: сонголтгүй үед цэс нээсэн багана өөрөө сонголт болно.
              *
              * ⚠️ Царцаалт нь ҮРГЭЛЖ ЗҮҮНЭЭС эхэлдэг ТАСРАЛТГҮЙ блок тул
              * сонголтын ХАМГИЙН БАРУУН баганаар хэмжинэ — дунд нь алгассан
              * багана байсан ч тэр нь царцаалтад орно. Эс бөгөөс «энэ хоёрыг
              * царцаа» гэсэн боломжгүй хүсэлт үүснэ.
              */}
            <button
              type="button"
              onClick={() => {
                if (pick.length > 0) sc.hideMany(pick); else sc.hide(c.name);
                setPick([]);
                setHMenu(null);
              }}
            >
              {pick.length > 1 ? `Hide ${num(pick.length)} columns` : 'Hide column'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (pick.length > 0) {
                  const last = Math.max(...pick.map((n) => cols.findIndex((x) => x.name === n)));
                  sc.setFrozen(sc.frozen === last + 1 ? 0 : last + 1);
                } else {
                  sc.freezeTo(c.name);
                }
                setHMenu(null);
              }}
            >
              {pick.length > 1
                ? `Freeze ${num(pick.length)} columns`
                : cols.findIndex((x) => x.name === c.name) === sc.frozen - 1
                  ? 'Unfreeze'
                  : 'Freeze up to here'}
            </button>
            <button type="button" onClick={() => sc.toggleWrap(c.name)}>
              {sc.wrap.has(c.name) ? 'No wrap' : 'Wrap text'}
            </button>
            {pick.length > 0 && (
              <button type="button" onClick={() => { setPick([]); setHMenu(null); }}>
                Clear selection
              </button>
            )}
            {sc.hidden.size > 0 && (
              <button type="button" onClick={() => { sc.showAll(); setHMenu(null); }}>
                {`Show ${num(sc.hidden.size)} hidden columns`}
              </button>
            )}
            {/*
              * АНХДАГЧ ХАРАГДАЦ — «бүгдийг харуул»-ын ЭСРЭГ.
              *
              * ⚠️ ЗААВАЛ ХЭРЭГТЭЙ: «нуусныг харуулах» нь анхдагчийг
              * бүрмөсөн унтраадаг тул түүнгүйгээр хэрэглэгч нэг харснаа
              * буцаахын тулд 19 баганыг гараар нуух ёстой болно
              * (2026-09-10-ны шүүмж).
              * ⚠️ Зөвхөн нуулт — дараалал, царцаалт, өргөн хэвээр.
              */}
            {defHidden.some((n: string) => !sc.hidden.has(n)) && (
              <button type="button" onClick={() => { sc.hideDefaults(); setHMenu(null); }}>
                {tr('Анхдагч харагдац ({0} багана нуух)', num(defHidden.filter((n: string) => !sc.hidden.has(n)).length))}
              </button>
            )}
          </div>

        </div>
      </>
    );
  };

  /**
   * ТОЛГОЙН НАВЧНЫ НҮД — Excel-ийн 3-р мөрийн жинхэнэ баганы нэр.
   *
   * ⚠️ Урьд нь `<thead>`-д ШУУД бичигдсэн байв. Бүлгийн зурвас нэмэгдсэнээр
   * (`bandRows`) нэг нүд ХЭД Ч МӨРӨӨС гарч болох болсон тул тусад нь
   * гаргав — чирэх · сонгох · цэс нээх зан бүхэлдээ ХЭВЭЭР.
   *
   * @param rowSpan хэдэн толгойн мөрийг дамжин суух (бүлэггүй багана бүгдийг)
   * @param top     наалдмал байрлалын шилжилт (дээрх зурвасуудын өндөр)
   */
  const leafTh = (c: FieldDef, ci: number, rowSpan: number, top: number) => (
            <th
              rowSpan={rowSpan > 1 ? rowSpan : undefined}
              key={c.name}
              title={`${finFieldLabel(c.name) === c.name ? c.alias : finFieldLabel(c.name)} · ${c.name}`}
              style={{ ...colSty(c, ci, true), top }}
              className={[
                frz(ci),
                xlTone(finXlGroup(c.name)[0] ?? ''),
                thRight(c) ? f.thR : '',
                drag === c.name ? f.thDrag : '',
                pick.includes(c.name) ? f.thPick : '',
              ].filter(Boolean).join(' ')}
              /*
               * ⚠️ БАГАНА ЗӨӨХ — Excel-ийн зан. `draggable` нь `th` дээр
               * шууд: толгойд аль хэдийн шүүлтийн товч ба өргөний бариул
               * хоёр байгаа тул гурав дахь удирдлага нүдийг дүүргэнэ.
               *
               * ⚠️ Өргөний бариул (`grip`) нь өөрийн `pointerdown`-оор
               * чирэлтийг зогсоодог тул хоёр үйлдэл зөрчилдөхгүй.
               */
              draggable
              onDragStart={(ev) => {
                setDrag(c.name);
                ev.dataTransfer.effectAllowed = 'move';
                /* Firefox чирэлт эхлүүлэхийн тулд өгөгдөл ШААРДДАГ */
                ev.dataTransfer.setData('text/plain', c.name);
              }}
              onDragOver={(ev) => { if (drag && drag !== c.name) ev.preventDefault(); }}
              onDrop={(ev) => {
                ev.preventDefault();
                if (drag) sc.move(drag, c.name);
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
              /*
               * ⚠️ БАРУУН ТОВШИЛТ нь ижил цэсийг нээнэ (2026-09-08,
               * хэрэглэгчийн хүсэлт): Excel-д баганы үйлдлүүд яг тэндээс
               * гардаг. ▾ товч нь ХЭВЭЭР — баруун товшилт нь мэддэг хүнд
               * богино зам, товч нь мэдэхгүй хүнд ил зам.
               */
              /*
               * ⚠️ ТОВШИЛТЫН ГУРВАН ХЭЛБЭР — Excel-тэй ижил:
               *   · энгийн  → ЗӨВХӨН энэ багана
               *   · Ctrl/⌘  → нэмж/хасаж сонгоно
               *   · Shift   → сүүлийн товшилтоос ЭНЭ хүртэлх МУЖ
               *
               * ⚠️ Шүүлтийн ▾ товч ба өргөний бариул нь `stopPropagation`
               * хийдэг тул тэднийг дарахад сонголт өөрчлөгдөхгүй.
               */
              onClick={(ev) => {
                const names = cols.map((x) => x.name);
                if (ev.shiftKey && lastPick.current) {
                  const a = names.indexOf(lastPick.current);
                  const b = names.indexOf(c.name);
                  if (a >= 0 && b >= 0) {
                    setPick(names.slice(Math.min(a, b), Math.max(a, b) + 1));
                    return;
                  }
                }
                lastPick.current = c.name;
                if (ev.ctrlKey || ev.metaKey) {
                  setPick((v) => (v.includes(c.name)
                    ? v.filter((x) => x !== c.name)
                    : [...v, c.name]));
                  return;
                }
                setPick((v) => (v.length === 1 && v[0] === c.name ? [] : [c.name]));
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                setHMenu((m) => (m?.name === c.name
                  ? null
                  : { name: c.name, x: ev.clientX, y: ev.clientY }));
              }}
            >
              {/*
                * ⚠️ Толинд байхгүй талбар нь ТҮҮХИЙ НЭРЭЭРЭЭ (`Bagts_74`)
                * гарахгүй — үйлчилгээний ӨӨРИЙН alias руу уначихна.
                * Ингэснээр шинэ багана нэмэгдэхэд код хөндөхгүйгээр
                * монголоор харагдана.
                */}
              {/* ⚠️ Excel-ийн БОГИНО нэр («Дугаар», «Нийт дүн», «Эхлэх») —
                  бүтэн утга нь дээрх зурвастай хамт уншигдана. Excel-д
                  байхгүй талбар нь толины урт нэрээрээ, тэр ч байхгүй бол
                  үйлчилгээний alias-аар. */}
              {FIN_XL_LEAF[c.name]
                ?? (finFieldLabel(c.name) === c.name ? c.alias : finFieldLabel(c.name))}
              {/*
                * ⚠️ ЦЭСНИЙ ТОВЧ (▾) ХАСАГДСАН (2026-09-08, хэрэглэгчийн заавар):
                * цэс нь БАРУУН ТОВШИЛТООР нээгддэг болсон тул товч нь толгой
                * бүрд зай эзлээд юу ч нэмэхгүй байв. Урьд нь ШҮҮЛТ тэндээс
                * гардаг байсан бөгөөд тэр нь дээд зурвас руу шилжсэн.
                */}
              {/* Чирэх бариул — давхар товшвол анхны өргөнд буцна */}
              <i {...grip(c.name)} />
            </th>
  );

  /**
   * ХАВТГАЙ ХҮСНЭГТ — гэрээний бүртгэлд (`Cashflow_0909`).
   * ⚠️ Багана нь метадатагаас (`cols`) ирнэ, гараар жагсаахгүй: үйлчилгээнд
   * талбар нэмэгдэхэд өөрөө гарч ирнэ.
   */
  const flatTable = (raw: GroupRow[]) => {
    const list = sortRows(raw);
    /*
     * БОСОО НЭГТГЭЛ — Excel-ийн `B6:B12`, `C47:C53` merge.
     *
     * ⚠️ Excel-д ТӨРӨЛ ба БАГЦ нь дараалсан ижил утгуудаараа НЭГ нүд болдог.
     * Тэр нь зүгээр гоо сайхан биш: 76 мөрд «ИНЖЕНЕРИЙН ДЭД БҮТЭЦ» гэсэн үг
     * 23 удаа давтагдахаар нүд харах утгаа алдаж, бүлгийн хил үл мэдэгдэх
     * болно.
     *
     * ⚠️ ЗАСВАРЫН горимд ХИЙХГҮЙ: нэгтгэсэн нүдэнд ганцхан оролт үлдэх тул
     * гүйдлийн 2-оос хойшхи мөрийн утгыг засах зам хаагдана.
     * ⚠️ ХООСОН утгыг нэгтгэхгүй — «мэдээлэлгүй» мөрүүд санамсаргүй нэг
     * бүлэг мэт харагдах ёсгүй.
     * ⚠️ ЭРЭМБЭ/ШҮҮЛТ өөрчлөгдөх бүрд ДАХИН тооцогдоно (`list`-ээс) — эс
     * бөгөөс эрэмбэлсний дараа зэрэгцээгүй мөрүүд нэгдэж, хүснэгт худал
     * бүлэглэл харуулна.
     */
    /**
     * EXCEL-ИЙН МӨРИЙН БҮТЭЦ асаалттай юу.
     *
     * ⚠️ ЗӨВХӨН гэрээний бүртгэлд, ЗӨВХӨН уншлагад. Засварын горимд бүтцийн
     * мөр (зурвас · нийлбэр) нь нүднүүдийг гүйлгэж, засварын `oid:талбар`
     * түлхүүрийг ойлгомжгүй болгоно; IPC-д ийм шатлал байхгүй.
     */
    const xlOn = dataKey === 'CASHFLOW_NEW' && !edit;
    /**
     * САРЫН ЗАДАРГАА ХАРАГДАХ УУ — 5-р түвшин.
     * ⚠️ Засварын горимд ХААЛТТАЙ: тэнд мөр бүр өөрийн оролттой байх ёстой
     * бөгөөд сарын мөр нь ажлын мөртэй ижил `oid:талбар` түлхүүр
     * хуваалцдаггүй ч хүснэгтийн бүтцийг ойлгомжгүй болгоно.
     */
    /* ⚠️ `xlOn`-оос ХАМААРАХГҮЙ: засварын горимд сарын мөр ЗААВАЛ харагдах
       ёстой — `Cashflow_huwi`-г тэндээс л бөглөнө. Сарын мөр бүр өөрийн
       OBJECTID-тай тул засвар нь ердийн замаараа явна. */
    const monthOn = dataKey === 'CASHFLOW_NEW' && lvl >= 5 && monthBy.size > 0;

    /**
     * МӨРИЙН ШАТЛАЛ — Excel-ийн E баганы «1 · 1.2 · 4.1» кодтой ХОС.
     *
     * ⚠️ Түвшин бүр ХОЁР талбартай: нэр (`ajil_tuvshin*`) ба КОД
     * (`bagts_tuvshin*`). Хүмүүс ажлаа кодоор нь ярьдаг («дөрөв нэг дээр…»)
     * тул зурвасын шошгонд код нь ЭХЭЛЖ гарна.
     * ⚠️ ХООСОН түвшин гинжийг ТАСАЛНА (`xlKeys`-тэй ижил дүрэм): 3-р түвшин
     * зөвхөн инженерийн дэд бүтцэд бөглөгдсөн тул бусад хэсэгт гурав дахь
     * зурвас ҮҮСЭХГҮЙ.
     */
    const NAME_F = [FIN_XL_SECTION, FIN_XL_GROUP_FIELD, FIN_XL_GROUP3_FIELD];
    const chainOf = (p: GroupRow): { name: string; code: string }[] => {
      const out: { name: string; code: string }[] = [];
      for (let d = 0; d < NAME_F.length; d += 1) {
        const name = String(p.row[NAME_F[d]] ?? '').trim();
        if (d > 0 && name === '') break;
        out.push({ name, code: String(p.row[FIN_XL_CODE[d]] ?? '').trim() });
      }
      return out;
    };

    /** Нэг зурвасын мөр — Excel-ийн нийлбэр/гарчгийн мөр */
    type XlBand = {
      /** 0 = хэсэг · 1 = төрөл · 2 = дэд төрөл */
      depth: number;
      /** Excel-ийн код («4.1») — байхгүй бол хоосон */
      code: string;
      label: string;
      /** Эвхэлтийн түлхүүр (`xlKeys`-тэй ЯГ ижил бүтэцтэй) */
      key: string;
      /** Зурвасын нийлбэрт орох БҮХ мөр */
      rows: GroupRow[];
    };
    /** Мөр тус бүрийн бүтцийн тэмдэглэгээ */
    type XlMark = {
      /** Энэ мөрийн ӨМНӨ татах зурвасууд — гүехэнээс гүн рүү */
      bands: XlBand[];
      /** Эцгүүдийн эвхэлтийн түлхүүр — аль нэг нь хумигдсан бол мөр нуугдана */
      keys: string[];
    };
    const mark: XlMark[] = list.map(() => ({ bands: [], keys: [] }));
    if (xlOn) {
      const chains = list.map(chainOf);
      const keysOf = (ch: { name: string }[]) => ch.map((_, d) => (
        d === 0 ? `s:${ch[0].name}` : (d === 1 ? `g:${ch[0].name}|${ch[1].name}` : `h:${ch[0].name}|${ch[1].name}|${ch[2].name}`)
      ));
      for (let i = 0; i < list.length; i += 1) mark[i].keys = keysOf(chains[i]);
      for (let i = 0; i < list.length; i += 1) {
        const ch = chains[i];
        const prev = i > 0 ? chains[i - 1] : [];
        /* Эцгийн гинж хаанаас салсныг олно — тэндээс доош ШИНЭ зурвас */
        let d = 0;
        while (d < ch.length && d < prev.length && ch[d].name === prev[d].name) d += 1;
        for (; d < ch.length; d += 1) {
          const key = mark[i].keys[d];
          /* Зурвасын нийлбэрт орох мөрүүд — гинжний тэр угтвартай БҮХ дараалсан мөр */
          let j = i;
          while (j < list.length && mark[j].keys[d] === key) j += 1;
          mark[i].bands.push({
            depth: d, code: ch[d].code, label: ch[d].name, key, rows: list.slice(i, j),
          });
        }
      }
    }

    /*
     * БАГЦЫН БОСОО НЭГТГЭЛ — Excel-ийн `C17:C19`, `C47:C53` merge.
     *
     * ⚠️ Гүйдэл нь ТӨРЛИЙН ХИЛИЙГ ДАВЖ БОЛОХГҮЙ: хилийн дээр нийлбэр мөр
     * ордог тул давсан `rowSpan` нь тэр мөрийг сүлбэж, хүснэгт эвдэрнэ.
     * ⚠️ ХООСОН утгыг нэгтгэхгүй — «мэдээлэлгүй» мөрүүд санамсаргүй нэг
     * бүлэг мэт харагдах ёсгүй.
     */
    /*
     * БАГЦЫН БОСОО НЭГТГЭЛ — Excel-ийн `E` баганы merge.
     *
     * ⚠️ 0909-д БАГЦ нь ГАНЦ багана (хуучин «Багц»/«Дэд багц» хос нийлсэн)
     * тул хөндлөн нэгтгэл БАЙХГҮЙ — зөвхөн дараалсан ижил утгууд босоогоор
     * нийлнэ («БАГЦ 1-6 БАГЦ 8-17» мөр 1-2 г.м.).
     * ⚠️ Гүйдэл нь ЗУРВАСЫГ ДАВЖ БОЛОХГҮЙ: хилийн дээр нийлбэр мөр ордог тул
     * давсан `rowSpan` нь тэр мөрийг сүлбэж, хүснэгт эвдэрнэ.
     * ⚠️ ХООСОН утгыг нэгтгэхгүй — «мэдээлэлгүй» мөрүүд санамсаргүй нэг
     * бүлэг мэт харагдах ёсгүй.
     */
    const mgSpan = new Map<string, number[]>();
    /*
     * ⚠️ САРЫН ЗАДАРГАА АСААЛТТАЙ ҮЕД БОСОО НЭГТГЭЛ ХИЙХГҮЙ (2026-09-09-ны
     * алдаа: «freeze хийлээ асар замбараагүй харагдаж байна»).
     *
     * `rowSpan` нь ХҮСНЭГТИЙН ДАРААХ МӨРҮҮДИЙГ дамждаг — тэр нь ажлын мөр эсэх
     * ялгаагүй. 5-р түвшинд ажлын мөр хооронд сарын мөр шургадаг тул
     * `rowSpan={3}` нь эцэг багцын дараагийн ХОЁР АЖЛЫГ биш, түүний ХОЁР
     * САРЫГ дамжиж, багана бүхэлдээ зөрж эхэлнэ.
     */
    if (!edit && !monthOn) {
      for (const name of FIN_XL_MERGE) {
        if (!cols.some((c) => c.name === name)) continue;
        const sp = new Array<number>(list.length).fill(1);
        let i = 0;
        while (i < list.length) {
          const v = String(list[i].row[name] ?? '');
          let j = i + 1;
          if (v !== '') {
            while (
              j < list.length
              && String(list[j].row[name] ?? '') === v
              && !(xlOn && mark[j].bands.length > 0)
            ) j += 1;
          }
          sp[i] = j - i;
          for (let k = i + 1; k < j; k += 1) sp[k] = 0;
          i = j;
        }
        mgSpan.set(name, sp);
      }
    }

    /*
     * ЗУРВАСЫН МӨРИЙН НҮД — ХОЁР ТӨРЛИЙН НЭГТГЭЛ.
     *
     * ⚠️ Мөнгө · тоо ширхэг → НИЙЛБЭР. ХУВЬ → ӨРТГӨӨР ЖИГНЭСЭН ДУНДАЖ
     * (`FIN_XL_PCT`). Хувийг нэмбэл 50 ажлын 100% нь «5,000» болж, дээд
     * хязгаар нь 100 байх ёстой багана утгаа алддаг (2026-09-09-ны
     * хэрэглэгчийн шүүмж).
     */
    /** Тухайн багана зурваст ТОО гаргах уу */
    const summable = (c: FieldDef) => (
      NUMERIC_TYPES.has(c.type) && !PLAIN_INT.has(c.name)
    );
    /** Тухайн багана ХУВЬ мөн үү — нийлбэр биш, жигнэсэн дундаж */
    const isPct = (name: string) => FIN_XL_PCT.includes(name);

    /**
     * Зурвасын нүдний ТЕКСТ — нийлбэр эсвэл жигнэсэн дундаж.
     *
     * ⚠️ `null` ≠ 0: хэмжилтгүй мөр дундажийн ХУВААРЬТ Ч, ХҮРТВЭРТ Ч ОРОХГҮЙ.
     * Тэднийг 0 гэж үзвэл бөглөгдөөгүй багц бүр бүлгийн хувийг доош татна.
     * ⚠️ Жингүй (өртөггүй) мөр ч дундажид орохгүй — эс бөгөөс 0 жинтэй мөр
     * хуваарийг өөрчлөхгүй атлаа хүртвэрийг тэглэнэ.
     */
    const sumText = (c: FieldDef, rows: GroupRow[]) => {
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      if (isPct(c.name)) {
        let w = 0;
        let top = 0;
        for (const p of rows) {
          const v = num(p.row[c.name]);
          const g = num(p.row[FIN_XL_PCT_WEIGHT]);
          if (v == null || g == null || g <= 0) continue;
          w += g;
          top += g * v;
        }
        return w === 0 ? '' : fmtCell(top / w, c.type, c.name).text;
      }
      const sum = rows.reduce((a, p) => a + (num(p.row[c.name]) ?? 0), 0);
      return sum === 0 ? '' : fmtCell(sum, c.type, c.name).text;
    };

    /*
     * ЗУРВАС/НИЙТ МӨРИЙН НИЙЛБЭРИЙН НҮД — ЦАРЦААГҮЙ багануудад.
     *
     * ⚠️ Дэвсгэрийг ЭНД тавихгүй: `.xlSec td` ба `.xlTot td` дүрмүүд бүх
     * нүдийг будна. Инлайн дэвсгэр өгвөл тэр дүрмийг дарж, зурвас тасарна.
     */
    /**
     * ЗУРВАСЫН НЭГ НҮД — Excel-ийн мөр 7·8·9 … -ийн бүтэц.
     *
     * ⚠️ ШОШГО нь «АЖИЛ, ҮЙЛЧИЛГЭЭ» баганад, КОД нь «БАГЦ» баганад — Excel-д
     * ЯГ ТИЙМ (`E9="1.1"`, `H9="Барилга,ГИШС - ТЭЗҮ, зураг төсөл"`). № багана
     * хоосон.
     * ⚠️ Урьд нь эхний хэдэн баганыг НЭГТГЭЖ, кодыг шошгын урд наадаг байсныг
     * 2026-09-09-нд ЗАСАВ (хэрэглэгчийн шүүмж: «НИЙТ … гэдэг үг Ажил
     * үйлчилгээ дээр байхад чинийх багц дээрээ байгаад байна»). Нэгтгэсэн нүд
     * нь царцаалтын хилтэй ч зөрчилддөг байв — одоо багана бүр өөрийн нүдтэй
     * тул тэр асуудал үндсээрээ алга.
     */
    const bandCell = (
      c: FieldDef,
      ci: number,
      b: { code: string; label: string; rows: GroupRow[]; depth?: number },
    ) => {
      const numeric = summable(c);
      let text = '';
      if (numeric) text = sumText(c, b.rows);
      else if (c.name === 'bagts') text = b.code;
      else if (c.name === 'ajil_uilchilgee') text = b.label;
      return (
        <td
          key={c.name}
          /* ⚠️ `frz(ci)` ЗААВАЛ: царцсан бүсэд орсон багана ч наалдмал байх
             ёстой, эс бөгөөс гүйлгэхэд зурвасын нүд хөршүүдээсээ сална. */
          className={[frz(ci), numeric ? `num ${f.cellNum}` : ''].filter(Boolean).join(' ')}
          /* ⚠️ Гүн нь ЗҮҮН ЗАЙГААР уншигдана (Excel-ийн outline шат) — өнгө нь
             гүнийг аль хэдийн хэлдэг ч зайгүй бол 1.1 ба 4.1 нэг шатанд
             харагдана. */
          style={c.name === 'bagts' && b.depth
            ? { ...colSty(c, ci), paddingLeft: 10 + b.depth * 9 }
            : colSty(c, ci)}
          title={!numeric && text ? text : undefined}
        >{text}</td>
      );
    };

    /**
     * НИЙТ МӨРИЙН ХАМРАХ ХҮРЭЭ — Excel-ийн `=+I8+I21`.
     *
     * ⚠️ Бүх мөр БИШ: 5-р (нийгмийн дэд бүтэц), 6-р (газар чөлөөлөлт), 7-р
     * (бондын хүү) хэсэг эх файлын НИЙТ дүнд ОРДОГГҮЙ. Дэлгэрэнгүйг
     * `finExcelLayout.ts` → `FIN_XL_TOTAL_CODES`-оос үз.
     * ⚠️ Тэдгээр хэсгүүд хүснэгтээс АЛГА БОЛОХГҮЙ — өөрсдийн зурвасын
     * нийлбэртэйгээ хэвээр гарна; зөвхөн дээд мөрийн нийлбэрт ордоггүй.
     */
    const totRows = list.filter((p) => finXlInTotal(p.row));

    /**
     * ЗУРВАСЫН МӨР — Excel-ийн шатлалын гарчиг БА нийлбэр нэг мөрөнд.
     *
     * ⚠️ Гурван түвшин НЭГ Л функцээр гарна: Excel-д ч тэдгээр мөрүүд ялгаагүй
     * бүтэцтэй, ердөө outline-ийн гүн ба өнгө нь өөр. Түвшин бүрд тусдаа JSX
     * бичих нь гурван газраас нийлбэрийн дүрмийг зэрэг засах шаардлага
     * үүсгэнэ.
     * ⚠️ КОД нь «БАГЦ», ШОШГО нь «АЖИЛ, ҮЙЛЧИЛГЭЭ» баганад — Excel-ийн E ба H
     * баганатай ЯГ ижил. Хоёулаа царцсан бүсэд байдаг тул баруун тийш
     * гүйлгэхэд ч «одоо аль хэсгийг харж байна» гэдэг алдагдахгүй.
     */
    const bandTr = (b: XlBand) => (
        <tr
          key={`band:${b.key}`}
          /* ⚠️ Хоёр ангилал ЯГ ИЖИЛ өнгөтэй (2026-09-09) — ялгаа нь зөвхөн
             үсгийн зузаан. Ангилал хэвээр үлдсэн шалтгаан: хэсэг ба дэд
             бүлгийг ялгаж загварчлах хэрэгцээ дахин гарвал CSS-ээс шууд
             тавина, JSX хөндөх шаардлагагүй. */
          className={b.depth === 0 ? f.xlSec : f.xlGrp}
        >
          {!xlView && (
            <td className={f.xlNo} style={{ width: FZ_DEF[0], minWidth: FZ_DEF[0] }} />
          )}
          {cols.map((c, ci) => bandCell(c, ci, b))}
        </tr>
    );
    return (
    /*
     * ⚠️ ГАДНА ТОВШВОЛ СОНГОЛТ ТАЙЛАГДАНА (2026-09-08, хэрэглэгчийн заавар).
     * Урьд нь сонголтоо цуцлахын тулд ЯГ ТЭР толгойг дахин дарах шаардлагатай
     * байсан нь Excel-ийн зантай зөрчилддөг: тэнд нүд дарамагц баганы сонголт
     * алга болдог.
     *
     * ⚠️ Толгой дээрх товшилтыг ОРХИНО (`closest('th')`) — эс бөгөөс сонголт
     * хийсэн тэр товшилт өөрөө шууд тайлагдана.
     */
    <div
      className={f.xlWrap}
      onClick={(ev) => {
        if (!(ev.target as HTMLElement).closest('th')) setPick([]);
      }}
    >
      {headMenu()}
      <table className={f.xlTbl}>
        <thead ref={theadRef}>
          {bandRows.map((row, lv) => (
            <tr key={`h${lv}`}>
              {/* ⚠️ ГУТАЛ БАГАНА ЗӨВХӨН ЗАСВАР/IPC-д: Excel-ийн харагдацад тэр
                  нь өөрийн «№» баганатай давхардаж байв (2026-09-09-ны
                  хэрэглэгчийн хүсэлт). Outline товч «БАГЦ» нүдэнд шилжсэн. */}
              {lv === 0 && !xlView && (
                <th
                  className={f.xlNo}
                  rowSpan={bandRows.length}
                  style={{ width: FZ_DEF[0], minWidth: FZ_DEF[0] }}
                  aria-label="№"
                >
                  <span className={f.xlNoHead}>№</span>
                </th>
              )}
              {row.map((it) => (it.leaf >= 0
                ? leafTh(cols[it.leaf], it.leaf, bandRows.length - lv, hTop(lv))
                : (
                  <th
                    key={`g${lv}-${it.from}`}
                    colSpan={it.span}
                    className={[f.xlBand, xlTone(it.top0), bandFz(it) ? f.xlFz : ""]
                      .filter(Boolean).join(" ")}
                    style={bandSty(it, lv)}
                  >{it.label}</th>
                )))}
              {lv === 0 && edit && canRow && (
                <th rowSpan={bandRows.length} aria-label={tr('Мөр')} />
              )}
            </tr>
          ))}
        </thead>
        <tbody>
          {/*
            * НИЙТ ДҮНГИЙН МӨР — Excel-ийн МӨР 4.
            *
            * ⚠️ Энэ мөр үйлчилгээнд БАЙХГҮЙ, харагдац дээр л тооцогдоно. Excel-д
            * тэр нь хамгийн дээд (1-р) outline түвшин: бүгдийг хумихад ердөө энэ
            * мөр үлддэг. Түүнгүйгээр «1-р түвшин» хоосон дэлгэц болно
            * (хэрэглэгчийн шүүмж 2026-09-08).
            * ⚠️ Нийлбэр нь ШҮҮСЭН мөрүүдээр: дээд зурвасын шүүлт хийсний дараа
            * нийт дүн нь харагдаж буй мөрүүдтэйгээ таарах ёстой.
            * ⚠️ ХАМРАХ ХҮРЭЭ нь `finXlInTotal` — Excel-ийн `=+I8+I21` томьёо
            * ЗӨВХӨН 1 ба 2-р хэсгийг нэмдэг (`finExcelLayout.ts`-ийн тайлбарыг
            * үз). Бүх мөрийг нэмбэл эх файлд БАЙХГҮЙ тоо гарна.
            */}
          {xlOn && list.length > 0 && (
            <tr className={f.xlTot}>
              {!xlView && (
                <td className={f.xlNo} style={{ width: FZ_DEF[0], minWidth: FZ_DEF[0] }} />
              )}
              {/* ⚠️ Excel-ийн мөр 7: E (БАГЦ) ХООСОН, H (АЖИЛ, ҮЙЛЧИЛГЭЭ)-д
                  «НИЙТ (Орон сууцны хороолол+ГИШС)». Кодгүй тул `code: ''` —
                  «БАГЦ» нүдэнд ердөө бүгдийг хумих `+`/`−` товч үлдэнэ. */}
              {cols.map((c, ci) => bandCell(c, ci, {
                code: '', label: FIN_XL_TOTAL_LABEL, rows: totRows,
              }))}
            </tr>
          )}
          {list.map((p, i) => {
            const dropped = false;
            const m = mark[i];
            /*
             * ⚠️ ЭВХЭЛТИЙН ТҮЛХҮҮР нь УТГААР бүтдэг (`mark[i].keys`) бөгөөд
             * ЭЦГИЙНХЭЭ түлхүүрийг агуулна: өөр хоёр хэсэгт ижил нэртэй төрөл
             * гарвал нэгийг нь эвхэхэд нөгөө нь ч хумигдах байсан.
             * ⚠️ АЛЬ Ч эцэг хумигдсан бол мөр нуугдана — зөвхөн шууд эцгийг
             * шалгавал «хэсгийг хумиад дотор нь төрлийг дэлгэсэн» тохиолдолд
             * мөрүүд зурвасгүй хөвж үлдэнэ.
             */
            const rowHid = xlOn && m.keys.some((k) => fold.has(k));
            return (
              <Fragment key={p.oid ?? `r${i}`}>
              {/*
                * ШАТЛАЛЫН ЗУРВАСУУД — Excel-ийн хэсэг · төрөл · дэд төрлийн мөр.
                *
                * ⚠️ Зурвас нь ЭЦГҮҮД нь бүгд дэлгээтэй үед л гарна: хумигдсан
                * хэсгийн доторх төрлийн зурвас харагдвал шатлал худал болно.
                */}
              {m.bands.map((b) => (
                m.keys.slice(0, b.depth).some((k) => fold.has(k)) ? null : bandTr(b)
              ))}
              {!rowHid && (
              <tr className={dropped ? f.rowDel : undefined}>
                {(() => {
                  /* ⚠️ Тамгыг № БАГАНАД тавина, тусдаа багана НЭМЭХГҮЙ: хүснэгт
                     аль хэдийн 33 баганатай бөгөөд хоёр багана нэмбэл гол
                     өгөгдөл улам баруун тийш түлхэгдэнэ. № нь ямар ч тохиолдолд
                     царцсан тул тамга ҮРГЭЛЖ нүдний өмнө байна.
                     ⚠️ Excel-ийн харагдацад гутал багана байхгүй — тэнд тамга нь
                     ЭХНИЙ нүдэнд (доорх `cols.map`) наалдана. */
                  if (xlView) return null;
                  const st = editStamp(p.row);
                  return (
                    <td
                      className={[f.xlNo, OUT_W ? f.xlNoOut : '', st ? f.xlNoEdited : ''].filter(Boolean).join(' ')}
                      style={{ width: FZ_DEF[0], minWidth: FZ_DEF[0] }}
                      title={st
                        ? tr('Сүүлд зассан: {0} · {1}', st.who || tr('тодорхойгүй'), date(st.ms))
                        : undefined}
                    >
                      {i + 1}
                    </td>
                  );
                })()}
                {cols.map((c, ci) => {
                  /* 0 = дээд мөрийн нэгтгэлд шингэсэн — нүд ОГТ гарахгүй */
                  const sp = mgSpan.get(c.name)?.[i];
                  if (sp === 0) return null;
                  /* ⚠️ БАГЦ нь ГОЛДОО — Excel-ийн E багана ч тийм. Хүснэгтийн
                     бусад нүд зүүн талдаа (2026-09-04-ний шийдвэр) тул энэ нь
                     ганцхан баганад үйлчлэх ЗОРИУДЫН үл нийцэл. */
                  /* ⚠️ ЗАСВАРЫН ТАМГА — гутал баганагүй үед ЭХНИЙ нүдний зүүн
                     ирмэгт (ногоон зурвас). Тамгагүй бол ангилал ч нэмэгдэхгүй. */
                  const stamp = xlView && ci === 0 ? editStamp(p.row) : null;
                  return xCell(
                    p.row, p.oid, dropped, c,
                    [frz(ci), c.name === 'bagts' ? f.xlCtr : '', stamp ? f.xlNoEdited : '']
                      .filter(Boolean).join(' '),
                    colSty(c, ci),
                    sp != null && sp > 1 ? sp : undefined,
                  );
                })}
                {/* ⚠️ Устгах товч ХАСАГДСАН — нүд нь ноорог мөрийн «×»-тэй нэг
                    баганад байх ёстой тул хоосон үлдэнэ. */}
                {edit && canRow && <td className={f.rowBtnCell} />}
              </tr>
              )}
              {/*
                * САРЫН ЗАДАРГАА — ажлын мөрийн ЯГ ДООР.
                *
                * ⚠️ Эдгээр нь `list`-д БАЙХГҮЙ тул зурвасын нийлбэр, багцын
                * нэгтгэл, № дугаарлалт бүгд хөндөгдөхгүй.
                * ⚠️ ЗӨВХӨН `Cashflow_*` баганууд утгатай, БУСАД БҮГД ХООСОН.
                * Урьд нь «Ажил, үйлчилгээ» баганад сарыг («2026-03») бичдэг
                * байсныг 2026-09-09-нд ХАСАВ (хэрэглэгчийн шүүмж: «ажил
                * үйлчилгээ баганад яагаад date format явж байна»): тэр багана
                * нь АЖЛЫН НЭР-ийнх, огноо тэнд байх нь баганы утгыг эвдэнэ.
                * Сар нь «Сар эхлэх» баганаас уншигдана.
                */}
              {!rowHid && monthOn && (monthBy.get(Number(p.row.Cashflow_ID)) ?? []).map((mr) => (
                <tr key={`m${mr[oidField]}`} className={f.xlMonth}>
                  {!xlView && (
                    <td className={f.xlNo} style={{ width: FZ_DEF[0], minWidth: FZ_DEF[0] }} />
                  )}
                  {cols.map((c, ci) => {
                    const oid = typeof mr[oidField] === 'number' ? (mr[oidField] as number) : null;
                    /* ⚠️ Эцгийн утгыг ДАВТАХГҮЙ — нэг мөнгө хоёр удаа уншигдана */
                    if (!c.name.startsWith('Cashflow_')) {
                      return <td key={c.name} className={frz(ci)} style={colSty(c, ci)} />;
                    }
                    return xCell(mr, oid, false, c, frz(ci), colSty(c, ci));
                  })}
                  {edit && canRow && <td className={f.rowBtnCell} />}
                </tr>
              ))}
              </Fragment>
            );
          })}

          {/*
            * ШИНЭ МӨР — ХҮСНЭГТИЙН ЁСТОЙ ДООД ТАЛД (2026-09-04, хэрэглэгчийн
            * хүсэлт: «засах гэж дархаар доошоо мөр нэмж болдог болго»).
            *
            * ⚠️ Товчийг ТОЛГОЙД биш ДООР тавьсан шалтгаан: Excel-д шинэ мөр
            * үргэлж доороос ургадаг бөгөөд хүн 76 мөрийг гүйлгээд ирсэн
            * газраасаа шууд нэмнэ. Толгойд байвал нэмсэн мөрөө хайж дахин
            * доош гүйх болно.
            *
            * ⚠️ Эдгээр мөр ШҮҮЛТЭД ОРОХГҮЙ, дугаарлалт нь жагсаалтын ард
            * үргэлжилнэ — OID байхгүй тул засвар нь `pend` биш `adds[ai]`-д
            * бичигдэнэ (`publish` тэднийг `adds` болгон илгээнэ).
            */}
          {/*
            * ШИНЭ МӨР — EXCEL-ИЙН ЗАН (2026-09-04, хэрэглэгчийн хүсэлт:
            * «шууд доошоо Excel шиг row нэмдэг болго»).
            *
            * Жагсаалтын ард `adds.length + 1` мөр зурна: сүүлийнх нь ҮРГЭЛЖ
            * ХООСОН «ноорог» мөр. Тэнд бичмэгц тэр мөр жинхэнэ болж, доор нь
            * шинэ хоосон мөр аяндаа гарна — товч дарах шаардлагагүй.
            *
            * ⚠️ ТҮЛХҮҮР НЬ ИНДЕКСЭЭР байх ЁСТОЙ. Ноорог мөр `new-${adds.length}`
            * түлхүүртэй; бичихэд `adds` уртсаад ТЭР МӨР ижил түлхүүрээ
            * хадгална. Тогтвортой түлхүүргүй бол React нүдийг remount хийж,
            * эхний үсэг бичсний дараа ФОКУС АЛДАГДАНА — Excel шиг үргэлжлүүлэн
            * бичих боломжгүй болно.
            *
            * ⚠️ Эдгээр мөр ШҮҮЛТЭД ОРОХГҮЙ: OID байхгүй тул засвар нь `pend`
            * биш `adds[ai]`-д бичигдэж, `publish` тэднийг `adds` болгон
            * илгээнэ. Хоосон ноорог мөр `dirty`-д ТООЛОГДОХГҮЙ (жинхэнэ
            * болтлоо `adds`-д ороогүй) тул «Нийтлэх (0)» худал өсөхгүй.
            */}
          {edit && canRow && Array.from({ length: adds.length + 1 }, (_, ai) => {
            const a = adds[ai] ?? {};
            const draft = ai === adds.length;
            /** Ноорог бол ШИНЭ мөр үүсгэнэ, эс бөгөөс байгааг нь засна */
            const put = (name: string, v: string) => setAdds((st) => (
              ai >= st.length ? [...st, { [name]: v }] : st.map((x, k) => (k === ai ? { ...x, [name]: v } : x))
            ));
            return (
              <tr key={`new-${ai}`} className={draft ? f.rowDraft : f.rowNew}>
                {/*
                  * ⚠️ `+` НЬ ТОВЧ — дарахад Excel-ийн «insert row» шиг ЭНЭ
                  * дэлгэц дээрээ шинэ мөр үүснэ. Урьд нь зөвхөн тэмдэг байсан
                  * тул хэрэглэгч дарж үзээд юу ч болохгүйд эргэлзэж байв.
                  * Ноорог мөрд бичих зам ч ХЭВЭЭР — хоёулаа ижил үр дүнд хүрнэ.
                  */}
                <td className={f.xlNo} style={{ width: FZ_DEF[0], minWidth: FZ_DEF[0] }}>
                  {draft ? (
                    <button
                      type="button"
                      className={f.rowIns}
                      title={tr('Шинэ мөр нэмэх')}
                      aria-label={tr('Шинэ мөр нэмэх')}
                      onClick={() => setAdds((st) => [...st, {}])}
                    >+</button>
                  ) : list.length + ai + 1}
                </td>
                {cols.map((c, ci) => (
                  <td
                    key={c.name}
                    className={`${f.cellEdit} ${frz(ci)}`}
                    style={colSty(c, ci)}
                  >
                    {SERVER_RO.test(c.name) ? null : c.choices?.length ? (
                      <select
                        className={f.cellPick}
                        value={a[c.name] ?? ''}
                        onChange={(ev) => put(c.name, ev.target.value)}
                      >
                        <option value="">—</option>
                        {c.choices.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : DATE_TYPES.has(c.type) ? (
                      /* Огноо — календар + `YYYY-MM-DD`; чөлөөт текст оруулах
                         зам нээлттэй үлдвэл нийтлэл `parseCell` дээр унана */
                      dateEdit(a[c.name] ?? '', (v) => put(c.name, v))
                    ) : (
                      <input
                        className={`${f.cellInput} ${NUMERIC_TYPES.has(c.type) ? 'num' : ''}`}
                        value={a[c.name] ?? ''}
                        placeholder={draft && ci === 0 ? tr('Энд бичихэд шинэ мөр үүснэ') : undefined}
                        onChange={(ev) => put(c.name, ev.target.value)}
                      />
                    )}
                  </td>
                ))}
                <td className={f.rowBtnCell}>
                  {/* Ноорог мөрд устгах товч утгагүй — хараахан мөр биш */}
                  {!draft && (
                    <button
                      type="button"
                      className={f.rowBtn}
                      title={tr('Мөр хасах')}
                      onClick={() => setAdds((st) => st.filter((_, k) => k !== ai))}
                    >×</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    );
  };

  const ipcTable = (list: GroupRow[]) => {
    const HP = HO_IPC.payFields;
    const rowsOnly = list.map((p) => p.row);
    /*
     * ⚠️ 2026-09-09: ХУУЧИН 4 KPI (гүйцэтгэлийн дүн · суутгал · цэвэр дүн ·
     *    шилжүүлсэн) -ийн ГУРАВ нь УТГАГҮЙ болов — шинэ эх сурвалжид суутгал
     *    ОГТ БАЙХГҮЙ тул `gross` ≡ `net` ≡ «шилжүүлсэн» бүгд НЭГ тоо (`dun`).
     *    Мөн 2026-09-08-ны «grossTot − dedTot === netTot тождество» асуудал ба
     *    «дүнгүй акт нийлбэрт ороогүй» Note хоёул СУУТГАЛ ба дүнгүй актын
     *    ХОСЛОЛООС үүсдэг байсан тул хоёулаа хамаарлаа алдав.
     *
     * ⚠️ ОРОНД НЬ гурван ТӨЛБӨРИЙН хэмжилт: нийт олгосон ба төрлөөр задаргаа.
     *    ГЭРЭЭНИЙ дүн (төсөв, гэрээт төсөв, хэмнэлт) ЭНД ГАРАХГҮЙ — `list` нь
     *    ТӨЛБӨРИЙН мөрүүд бөгөөд гэрээний талбар мөрд ДАВТАГДДАГ тул
     *    нийлүүлбэл Багц-4.1 (7 мөр) -ийнх 7 ДАХИН хөөрөгдөнө. Гэрээний
     *    түвшний тоог ЗӨВХӨН `hoTotals()`/`groupHo()`-оос авна.
     *
     * ⚠️ `sumOrNull` — БҮХ мөр хоосон бол `null`, 0 БИШ. 45-ийн 2 мөрд `dun`
     *    хоосон (БАГЦ-6.3 гэрээ бүхэлдээ төлбөргүй, ХО-0045 кодгүй гэрээ);
     *    тэднийг 0 гэж унших нь «олгосон 0₮» гэсэн ХУДАЛ хэмжилт үүсгэнэ.
     */
    const advRows = rowsOnly.filter((r) => r[HP.kind] === HO_IPC.kinds.advance);
    const workRows = rowsOnly.filter((r) => r[HP.kind] === HO_IPC.kinds.work);
    const paidTot = sumOrNull(rowsOnly, HP.amount);
    const advTot = sumOrNull(advRows, HP.amount);
    const workTot = sumOrNull(workRows, HP.amount);
    /* ⚠️ Ангилагдаагүй мөр (`tulult_turul` хоосон, амьдаар 2) — ЧИМЭЭГҮЙ
       ХАЯХГҮЙ. Урьдчилгаа + гүйцэтгэл ≠ нийт болохыг хэрэглэгч нүдээр хасаад
       олох тул шалтгааныг ИЛ бичнэ. */
    const noKind = rowsOnly.length - advRows.length - workRows.length;
    /* ⚠️ БОДОГДСОН БАГАНА АЛГА (хуучин 3) — доорх толгойн ⚠️-г үз. */
    const nCols = 1 + ipcMainCols.length + (edit && canRow ? 1 : 0);
    /* Нийлбэрийг `dun` баганын ЯГ доор тавихын тулд түүний байрлалыг олно.
       ⚠️ Байрлалыг ТООГООР бүү бич — `HO_MAIN_FIELDS` өөрчлөгдвөл нийлбэр
       буруу багана дор гулсана. */
    const amtIx = ipcMainCols.findIndex((c) => c.name === HP.amount);
    return (
      <div>
        {/* Мөнгөний зам — багцын нийлбэрээр: нийт олгосон = урьдчилгаа + гүйцэтгэл */}
        <div className={f.kpiRow}>
          {kpiTile(tr('Олгосон нийт'), paidTot)}
          {kpiTile(tr('Урьдчилгаа төлбөр'), advTot)}
          {kpiTile(tr('Гүйцэтгэлийн төлбөр'), workTot)}
        </div>
        {noKind > 0 && (
          <Note>
            {tr('Төлбөрийн төрөл бүртгэгдээгүй {0} мөр — задаргаанд ороогүй.', num(noKind))}
          </Note>
        )}
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
              {/* ⚠️ 2026-09-09: «Суутгал» · «Цэвэр дүн» · «Шилжүүлсэн» ГУРВАН
                  БОДОГДСОН БАГАНА ХАСАГДСАН. Суутгал байхгүй тул гурвуулаа
                  `dun` баганатай ЯГ ижил тоог давтаж, гурван утгагүй багана
                  үлдэх байв. Олгосон дүн нь `dun` (үндсэн багана) дээр ил. */}
              {edit && canRow && <th className={f.rowBtnCell} aria-label={tr('Мөр')} />}
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => {
              const dropped = false;
              const k = p.oid ?? `i-${i}`;
              const isOpen = xp.has(k);

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
                    {/* ⚠️ ТӨЛВИЙН ЧИП (батлагдсан / хянагдаж байна) ХАСАГДСАН —
                        `IPC08` төлөв шинэ эхэд ОГТ БАЙХГҮЙ. Мөр бүр нь АЛЬ
                        ХЭДИЙН хийгдсэн гүйлгээ тул «хянагдаж байна» гэсэн шат
                        бүртгэгддэггүй; чип үлдээвэл ҮРГЭЛЖ хоосон байх байв. */}
                    {ipcMainCols.map((c) => xCell(p.row, p.oid, dropped, c))}
                    {/* ⚠️ Устгах товч ХАСАГДСАН — эх мөрийг устгахгүй */}
                    {edit && canRow && <td className={f.rowBtnCell} />}
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
            {/* ⚠️ НИЙТ нь ЗӨВХӨН `dun` баганын ДООР. Гэрээний талбарын
                (төсөв, гэрээт төсөв) баганад нийлбэр тавьбал мөрд давтагдсан
                тоо нийлж 7 дахин хөөрөгдөнө — тиймээс тэдгээр багана НИЙТ
                мөрөнд ХООСОН үлдэнэ. `sumOrNull` тул бүх мөр хоосон бол «—». */}
            <tr className={f.sTotal}>
              <td colSpan={1 + Math.max(0, amtIx)}>{tr('НИЙТ ОЛГОСОН')}</td>
              <td className={`num ${f.cellNum} ${f.cellStrong}`}>
                {paidTot == null ? '—' : num(paidTot)}
              </td>
              {ipcMainCols.slice(amtIx + 1).map((c) => <td key={c.name} />)}
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
                {(() => {
                  if (SERVER_RO.test(c.name)) return null;
                  const cur = a[c.name] ?? '';
                  const put = (v: string) =>
                    setAdds((st) => st.map((x, k) => (k === ai ? { ...x, [c.name]: v } : x)));
                  /*
                   * ⚠️ ЗАСВАРЛАГЧ НЬ ХҮСНЭГТИЙНХТЭЙ ИЖИЛ БАЙХ ЁСТОЙ. 2026-09-04:
                   * энд зөвхөн энгийн `input` байсан тул шинэ мөрийн ОГНООГ
                   * хүн чөлөөт текстээр бичиж «202159655665» гэх мэт утга
                   * үүсдэг байв — `parseCell` түүнийг татгалзаж, нийтлэл
                   * бүхэлдээ унана. Одоо огноонд календар + `YYYY-MM-DD`
                   * хэлбэр, domain талбарт сонголтын жагсаалт.
                   */
                  if (DATE_TYPES.has(c.type)) return dateEdit(cur, put);
                  if (c.choices?.length) {
                    return (
                      <select className={f.cellPick} value={cur} onChange={(ev) => put(ev.target.value)}>
                        <option value="">—</option>
                        {c.choices.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    );
                  }
                  return (
                    <input
                      className={`${f.cellInput} ${NUMERIC_TYPES.has(c.type) ? 'num' : ''}`}
                      value={cur}
                      onChange={(ev) => put(ev.target.value)}
                    />
                  );
                })()}
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
    const dropped = false;
    return (
      <tr key={oid ?? `i-${i}`} className={`${f.dRow} ${dropped ? f.rowDel : ''}`}>
        {/* ⚠️ Устгах баганыг ЗАСВАРЫН горимд л гаргана — уншиж буй
            хэрэглэгчийн хүснэгтийн өргөнийг дэмий иддэггүй. */}
        {/* ⚠️ Устгах товч ХАСАГДСАН — эх мөрийг устгахгүй */}
        {edit && canRow && <td className={f.rowBtnCell} />}
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
                {/* ⚠️ Гэрээний бүртгэлд энэ товч ТОЛГОЙД гарахгүй — тэнд шинэ
                    мөр ХҮСНЭГТИЙН ДООД ТАЛД нэмэгддэг (`flatTable`-ийн
                    §ШИНЭ МӨР). Excel-ийн зан: мөр доороос ургана. */}
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
      {/* ⚠️ Календарыг ХАМГИЙН ГАДНА зурна: `position: fixed`-ээр байрладаг
          тул хүснэгтийн `overflow: auto` дотор байвал тасарч, царцсан
          баганын `z-index`-д дарагдана. */}
      {cal && (
        <DatePicker
          value={cal.value}
          anchor={cal.anchor}
          onPick={(v) => { cal.set(v); setCal(null); }}
          onClose={() => setCal(null)}
        />
      )}
      {err && <p className={f.editErr} role="alert">{err}</p>}
      {msg && !err && <p className={f.editOk} role="status" aria-live="polite">{msg}</p>}

      {/* ══════════ ШҮҮЛТИЙН ЗУРВАС ══════════
          ⚠️ Тоолол ҮРГЭЛЖ харагдана («209 → 34 мөр»): шүүлт асаалттай гэдгээ
          мартаад «мөр алга болжээ» гэж эргэлзэх нь энэ хүснэгтийн хамгийн
          бодит эрсдэл. */}
      {cols.length > 0 && (
        <div className={f.finBar}>
          {/*
            * ТҮВШНИЙ ТОВЧ — Excel-ийн outline «1 2 3 4».
            *
            *   1 = НИЙТ + хэсгийн зурвас · 2 = + төрлийн нийлбэр ·
            *   3 = + дэд төрлийн нийлбэр · 4 = бүх мөр
            *
            * ⚠️ ХАЙЛТЫН ӨМНӨ (2026-09-08, хэрэглэгчийн заавар): хүснэгтийн
            * дээр тусдаа зурвас байхад хоёр эгнээ удирдлага үүсч, зай ч
            * идэгдэж байв. Шүүлттэй нэг эгнээнд байх нь «юу харагдаж байна»
            * гэдгийг нэг дор хэлнэ.
            * ⚠️ «Нэгтгэл гүйцэтгэл» табтай ИЖИЛ хэлбэртэй — нэг порталд нэг
            * үүрэгтэй хоёр өөр загвар байх ёсгүй.
            */}
          {xlLevelsOn && (
            <span className={f.lvBar}>
              <span className={f.lvLbl}>{tr('Түвшин')}</span>
              {[1, 2, 3, 4, 5].map((nn) => (
                <button
                  key={nn}
                  type="button"
                  className={lvl === nn ? f.lvOn : ''}
                  /* ⚠️ 5 нь ТҮВШИН биш ЗАДАРГАА: бүх мөр дээр нэмээд ажил
                     тус бүрийн сарын төлөвлөгөөг нээнэ. */
                  title={nn === 5
                    ? tr('Бүх мөр + сарын задаргаа')
                    : tr('{0}-р түвшин хүртэл дэлгэх', nn)}
                  onClick={() => setLevel(nn)}
                >{nn}</button>
              ))}
            </span>
          )}
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
          {/*
            * «+ Мөр нэмэх» — МӨРИЙН ТООНЫ УРД (2026-09-04, хэрэглэгчийн хүсэлт).
            *
            * ⚠️ Хүснэгтийн ДООД зурвастай ДАВХАРДДАГГҮЙ, хоёулаа хэрэгтэй:
            * доод нь шинэ мөр ГАРЧ ИРЭХ газартаа байдаг, энэ нь 76 мөрийг
            * гүйлгэлгүйгээр дээрээс шууд нэмэх зам. Хоёулаа ижил `adds`-д
            * бичих тул төлөв салахгүй.
            *
            * ⚠️ Зөвхөн ЗАСАХ горимд: горимоос гадуур нэмсэн мөр хаана ч
            * харагдахгүй байж «Нийтлэх (1)» гэсэн тоо л өснө.
            */}
          <span className={`${f.finCount} num`}>
            {active
              ? tr('{0} → {1} мөр', num(rows.length), num(shown.length))
              : tr('{0} мөр', num(rows.length))}
          </span>
          {/*
            * «+ Мөр нэмэх» — МӨРИЙН ТООНЫ БАРУУН ТАЛД (2026-09-04).
            *
            * ⚠️ `.finCount`-д `margin-left:auto` бий тул түүний ДАРАА тавьсан
            * элемент зурвасны баруун захад наалдана — байрлалыг гараар
            * тооцох шаардлагагүй.
            *
            * ⚠️ `.finTgl` (саарал toggle) БИШ `.finAdd`: хажуудах «Багана
            * бүрийн шүүлт» зэрэг нь ХАРАГДАЦ сэлгэдэг унтраалга, энэ нь
            * ӨГӨГДӨЛ үүсгэдэг үйлдэл. Ижил төрхтэй байвал хүн санамсаргүй
            * дарж хоосон мөр үүсгэнэ.
            *
            * ⚠️ Зөвхөн ЗАСАХ горимд: горимоос гадуур нэмсэн мөр хаана ч
            * харагдахгүй байж «Нийтлэх (1)» гэсэн тоо л өснө.
            */}
          {isFlat && canRow && edit && (
            <button
              type="button"
              className={f.finAdd}
              disabled={busy}
              title={tr('Хүснэгтийн доод талд шинэ мөр нэмнэ')}
              onClick={() => setAdds((st) => [...st, {}])}
            >
              {tr('+ Мөр нэмэх')}
            </button>
          )}
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
              /* Багцын нийлбэр — бүгд хоосон бол ОГТ бичихгүй (0 худал).
                 ⚠️ 2026-09-09: `netTotalOrNull` (цэвэр = gross − суутгал)
                 → `sumOrNull(dun)`. Суутгал байхгүй тул «цэвэр» гэсэн ойлголт
                 үхэж, `dun` нь өөрөө бодит олгосон дүн болов. */
              const hdSum = sumOrNull(p.rows.map((g) => g.row), HO_IPC.payFields.amount);
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
                      {tr('Олгосон {0}', mnt(hdSum))}
                    </span>
                  )}
                </button>
                {/* HO → төлбөрийн урсгал. Хэвтээ гүйлт нь хүснэгт ДОТРОО (`.tscroll`). */}
                {!off && ipcTable(p.rows)}
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
   * амьдардаг (доорх `IpcRawTableUnused`). Cashflow-ийнх хэвээр.
   *
   * ⚠️ ГУРАВДАХЬ ТАБ «Cashflow хувиарлах» (2026-09-09): сарын хувийг
   * гэрээний бүртгэлийн 33 багана дундаас бөглөх нь хүнд байсан.
   * Тэнд бөглөх зам ХЭВЭЭР (5-р түвшин) — энэ нь түүнийг орлохгүй,
   * зэрэгцээ зам: нэг ажилдаа төвлөрсөн, өргөнөөр гүйлгэх шаардлагагүй.
   */
  const [tab, setTab] = useState<'cf' | 'ipc' | 'plan'>('cf');

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
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'plan'}
            className={`${f.tab} ${tab === 'plan' ? f.tabOn : ''}`}
            onClick={() => setTab('plan')}
          >
            {tr('Cashflow хувиарлах')}
          </button>
        </div>
      </header>

      {/* ⚠️ `key` нь ЗААВАЛ: хоёр салаа НЭГ байрлалд, НЭГ төрлийн бүрэлдэхүүн
          тул React instance-ыг ДАХИН АШИГЛАНА. Түлхүүргүй бол Cashflow-д
          тавьсан `CF006` шүүлт IPC-д үлдэж, тэнд тийм талбар байхгүй тул
          хүснэгт ХООСОН гарна — шалтгаан нь огт харагдахгүй. */}
      {tab === 'plan' ? (
      /* ⚠️ `key` нь ЗААВАЛ (доорх тайлбарыг үз) — гурван салаа НЭГ
         байрлалд сууна. */
      <CashflowPlan
        key="plan"
        works={d.cashflow}
        months={d.cfMonths}
        onSaved={onSaved}
      />
      ) : tab === 'cf' ? (
      <FullTable
        key="cf"
        title={tr('Гэрээний бүртгэл — захирамж, гэрээ, санхүүжилтийн эх үүсвэр')}
        subtitle={tr('{0} мөр · {1} багана', num(d.cashflow.length), d.cfFields.length)}
        rows={d.cashflow}
        fields={d.cfFields}
        url={CASHFLOW_NEW.url}
        oidField={CASHFLOW_NEW.oid}
        dataKey="CASHFLOW_NEW"
        months={d.cfMonths}
        facets={FIN_FACETS.CASHFLOW_NEW}
        canEdit={canEdit}
        canRow={canRow}
        onSaved={onSaved}
      />
      ) : (
      /* ⚠️ `groupHo` нь 45 мөрийг 22 гэрээ болгож ДЕДУП хийнэ — энд
         мөрөөр нийлүүлбэл гэрээний төсөв 7 дахин давхардана. */
      <IpcTable contracts={groupHo(d.ipc)} />
      )}
    </>
  );
}

/* ⚠️ ХУУЧИН ТҮҮХИЙ IPC ХҮСНЭГТ — 2026-09-09-нд НАВИГАЦИАС ХАСАГДСАН.
   Хэрэглэгчийн шийдвэр: «IPC service дээрх бүх мэдээллийг харах ёстой НЭГ
   page байх ёстой». Одоо бүх талбар `IpcTable`-ийн дэлгэрэнгүйд гарна.

   ⚠️ ГЭВЧ ЭНЭ ЗАМААР ЗАСВАР ХИЙГДДЭГ БАЙСАН: талбар засах, мөр нэмэх,
   баганаар шүүх БҮГД `FullTable`-д амьдардаг бөгөөд `IpcTable` нь ЗӨВХӨН
   УНШИНА. Тиймээс IPC-ийн засварын боломж ОДООГООР АЛГА. Cashflow-ийнх
   хэвээр (тэр таб хөндөгдөөгүй).

   Кодыг УСТГААГҮЙ — засвар дахин хэрэгтэй болбол `FinTablesView`-д
   `tab === 'ipcRaw'` салаа болгож буцаан залгана. */
export function IpcRawTableUnused({
  d, canEdit, canRow, onSaved,
}: {
  d: FinTables; canEdit: boolean; canRow: boolean; onSaved: () => void;
}) {
  return (
      <FullTable
        key="ipc"
        /* ⚠️ 2026-09-09: гарчгаас «акт» гэдэг үг ХАСАГДСАН — шинэ эх нь акт БИШ,
           гүйцэтгэгч компанид өгсөн ТӨЛБӨРИЙН гүйлгээ (урьдчилгаа ч орно). */
        title={tr('Хөрөнгө оруулалтын гүйцэтгэл — олгосон санхүүжилт (/196)')}
        subtitle={tr('{0} мөр · {1} багана', num(d.ipc.length), d.ipcFields.length)}
        rows={d.ipc}
        fields={d.ipcFields}
        url={HO_IPC.url}
        oidField={HO_IPC.oid}
        dataKey="HO_IPC"
        facets={FIN_FACETS.HO_IPC}
        canEdit={canEdit}
        canRow={canRow}
        onSaved={onSaved}
      />
  );
}
