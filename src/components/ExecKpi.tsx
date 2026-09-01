'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAsync } from '@/lib/useAsync';
import {
  cached, loadBudget, loadClearance, loadHeadline, loadHousing, loadSocial,
} from '@/lib/live';
import { loadFinData, contractMonths, lagOf, lagLevel } from '@/modules/Finance';
/* ⚠️ '@/modules/Dashboard' БИШ (2026-08-21): тэр зам MapCanvas → ArcGIS SDK-г
   бүхэлд нь нэвтрэх хуудасны chunk-д чирдэг байв */
import { useBagtsTable, useSuitability, buildProgressOf } from '@/lib/execData';
import { HABEA, CASHFLOW2, cfMonthAxis, pkgKeyOf, type ViewKey } from '@/lib/services';
import { count, queryGroup } from '@/lib/query';
import { loadVariance, loadOverlaps, loadDamage } from '@/lib/execTriage';
import {
  LEVEL_TONE, LEVEL_MARK, levelLabel, levelRank, worstOf, SIGNAL_LEVELS,
  pctLevel, finGapLevel, contractGapLevel, missingLevel, failedPkgLevel,
  incidentLevel, scoreLevel, overlapLevel, reviewAgeLevel, REVIEW_STALE_DAYS,
  VAR_BAD_MNT, DMG_BAD_N,
  type Level,
} from '@/lib/kpiLevels';
import { queryAll } from '@/lib/hyanalt';
import { toRow } from '@/lib/hyanaltStore';
import { groupWorks, pendingAging } from '@/lib/hyanaltGroup';
import {
  CATEGORIES, AUDIENCES, byCategory, forAudience,
  type Metric, type CategoryKey, type Audience,
} from '@/lib/kpiModel';
import { scoreLabel } from '@/lib/analysis/score';
import { num, pct, date, mntShort } from '@/lib/format';
import { Icon } from './Icon';
import { Bars, HBars, Ring, Spark } from './MiniChart';
import s from './execKpi.module.css';

/**
 * УДИРДЛАГЫН (CEO) САМБАР — НЭГ самбар, таван СЭДЭВЧИЛСЭН ангилал, ангилал
 * бүрийн дотор үзүүлэлт тус бүр гурван түвшний өнгөтэй.
 *
 * ⚠️ 2026-08-24-ний бүтцийн өөрчлөлт (CEO_KPI_PROMPT). Урьд нь ХОЁР самбар
 * зэрэгцэж байв: `Home`-ийн ангилалгүй 10 нүд ба энэ файлын СТАТУСААР
 * бүлэглэсэн 9 карт. Хоёр асуудалтай байлаа:
 *   · Статусаар бүлэглэхэд «Яаралтай» доор ХАБЭА-гийн осол, обьёмын зөрүү
 *     зэрэгцэж болдог — огт өөр албаны, огт өөр шийдвэрийн зүйлс.
 *   · Газар чөлөөлөлт ГУРВАН газар, гүйцэтгэл ХОЁР газар давхардаж байв.
 * Одоо: ангилал = СЭДЭВ, өнгө = ТҮВШИН. Хуучин `TIERS` бүлэглэл УСТСАН.
 *
 * ⚠️ Хот төлөвлөлтийн оноо (`useSuitability`) нь ХҮНД орон зайн анализ тул
 * арын дэвсгэрт (кэшлэн) ачаална — тухайн карт «…»-ээс бодогдоод гарна,
 * бусад картууд шууд харагдана.
 */

/** Мөнгөн дүнг товч бичих — зөрүүний картад (тэрбум/сая ₮) */
const money = (v: number): string =>
  v >= 1e9 ? tr('{0} тэрбум ₮', num(v / 1e9, 2))
  : v >= 1e6 ? tr('{0} сая ₮', num(v / 1e6, 1))
  : tr('{0} ₮', num(v, 0));

/**
 * Ачаалагдаагүй үзүүлэлт — АЧААЛЖ БАЙГАА ба АЛДАА хоёрыг ялгана.
 *
 * ⚠️ 2026-08-24: алдаа нь `bad` БИШ, `unknown` (CEO_KPI_PROMPT §4-6).
 * «Татагдсангүй» гэдэг нь «муу байна» гэсэн үг биш — өмнө нь алдаатай карт
 * «Яаралтай шийдвэрлэх» бүлэгт орж, өгөгдлийн сүлжээний доголдлыг төслийн
 * эрсдэл мэт харуулдаг байв. Хоёулаа саарал боловч тайлбар нь өөр.
 *
 * ⚠️ Дуудлага нь ЗААВАЛ `state !== 'ready'` хамгаалалтын ДОТОР байна — тэгж
 * байж TypeScript үлдсэн кодод `q.data`-г null БИШ гэж нарийсгана.
 */
const notReady = (
  label: string,
  loadingNote: string,
  qs: { state: string; retry?: () => void }[],
): Omit<Metric, 'key' | 'cat'> => {
  const failed = qs.find((q) => q.state === 'error');
  if (failed)
    return { label, value: '—', note: tr('Татагдсангүй — дарж дахин оролдоно уу'), level: 'unknown', retry: failed.retry };
  return { label, value: '…', note: loadingNote, level: 'unknown' };
};

/* ⚠️ ХОЙШЛУУЛСАН ачаалагч (2026-08-21 гүйцэтгэлийн аудит): нүүр нээгдмэгц
   давхцлын ~53 ажил + 10 хүснэгтийн variance зэрэг бууж хөнгөн картуудын
   асуулгыг хааж, ArcGIS «Too many requests» өдөөдөг байв. Хүнд ачаалагчдыг
   браузер чөлөөтэй болсны дараа шатлан эхлүүлнэ — хөнгөн картууд эхэлж
   зурагдана, нийт дуусах хугацаа өөрчлөгдөхгүй. */
/**
 * ХЯНАЛТЫН ХҮЛЭЭГДЛИЙН АЧААЛАГЧ — МОДУЛИЙН түвшинд.
 *
 * ⚠️ Компонент дотор бичиж БОЛОХГҮЙ: `Date.now()` нь цэвэр бус функц бөгөөд
 * render-ийн үед үүссэн функц дотор дуудвал `react-hooks/purity` дүрэм АЛДАА
 * өгнө (дахин рендер бүрд өөр утга гарч, тогтворгүй үр дүнд хүргэнэ).
 * Модулийн түвшинд байрлуулснаар цаг нь ЗӨВХӨН татах агшинд уншигдана.
 *
 * ⚠️ Мөр бүр НЭГ ТОЙРОГ — нэг ажил 5 удаа буцвал 5 мөр болно. `groupWorks` нь
 * тэдгээрийг нэг ажил болгож, ОДООГИЙН тойргийг нь заана.
 *
 * ⚠️ 2026-08 аудит (олдвор #13): `cached` — урьд нь портал → Нүүр буцах бүрд
 * хяналтын БҮТЭН хүснэгтийг '*'-аар дахин татдаг байв (энэ файлын бусад бүх
 * ачаалагч кэштэй, энэ ганц нь орхигдсон). `cached` алдааг кэшлэхгүй тул
 * картын «дахин оролдох» хэвээр ажиллана; 5 мин TTL нь хоног-нарийвчлалтай
 * хүлээгдлийн үзүүлэлтэд үл мэдэгдэнэ.
 */
const loadReviewAging = cached(async () => {
  const rows = (await queryAll()).map(toRow);
  return pendingAging(groupWorks(rows), Date.now());
}, 5 * 60_000);

const afterIdle = <T,>(fn: () => Promise<T>, ms: number) => (): Promise<T> =>
  new Promise<void>((r) => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window)
      window.requestIdleCallback(() => r(), { timeout: ms });
    else setTimeout(r, ms);
  }).then(fn);

export function ExecKpi({ onView }: { onView: (key: ViewKey) => void }) {
  const finQ = useAsync(loadFinData, []);
  const budgetQ = useAsync(loadBudget, []);
  const bagtsQ = useBagtsTable();
  /* ⚠️ «Хамрах хүрээ» ангиллын ачаалагчид — урьд нь `Home.useHomeKpis()`-д
     байсныг энд ШИЛЖҮҮЛЭВ. Бүгд `cached` тул ХҮСЭЛТИЙН ТОО НЭМЭГДЭХГҮЙ:
     Home тэднийг дуудахаа больсон, энд нэг л удаа дуудагдана. */
  const headQ = useAsync(loadHeadline, []);
  const housQ = useAsync(loadHousing, []);
  const socQ = useAsync(loadSocial, []);
  /*
   * Осол/зөрчлийг ТӨРЛӨӨР нь бүлэглэж татна.
   * ⚠️ Урьд нь `queryCount` — зөвхөн нийт тоо. Тэгвэл картын график зурах
   * ЖИНХЭНЭ задаргаа байхгүй байв. Бүлэглэсэн асуулга нь нэг хүсэлтээр нийт
   * дүн БА задаргаа хоёуланг өгнө (нийт нь бүлгүүдийн нийлбэр).
   */
  const incQ = useAsync(() => queryGroup(
    HABEA.incident.url, HABEA.incident.fields.turul, [count('objectid', 'n')],
  ), []);
  const suitQ = useSuitability(true); // арын дэвсгэрт (хүнд, кэшлэнэ)
  const clearQ = useAsync(loadClearance, []);
  /* Хүнд гурав — execTriage модульдаа кэшлэгдэнэ, хоёр нь хойшлуулалттай. */
  const ovQ = useAsync(afterIdle(loadOverlaps, 1500), []);
  const varQ = useAsync(afterIdle(loadVariance, 2500), []);
  const dmgQ = useAsync(loadDamage, []);

  /**
   * ТӨСЛИЙН АЛБАН ЁСНЫ ГҮЙЦЭТГЭЛ — `buildProgressOf` (бүх блокоор жигнэсэн).
   * ⚠️ 2026-08-24, §7-A: гурван өрсөлдөгч тооны аль нь албан ёсны болохыг
   * хэрэглэгч шийдсэн. `loadProjectProgress().actual` нь энэ самбарт
   * ГҮЙЦЭТГЭЛ болж ГАРАХГҮЙ — түүний `byStage`/`coverage` л ашиглагдана.
   */
  const official = useMemo(
    () => (bagtsQ.state === 'ready' ? buildProgressOf(bagtsQ.data) : null),
    [bagtsQ],
  );

  /* ═══════════════ 1 · ХАМРАХ ХҮРЭЭ (бүгд neutral) ═══════════════ */

  const scope = useMemo<Metric[]>(() => {
    const hd = headQ.state === 'ready' ? headQ.data : null;
    const hs = housQ.state === 'ready' ? housQ.data : null;
    const sc = socQ.state === 'ready' ? socQ.data : null;
    /* ⚠️ Ангилал бүхэлдээ `neutral` — CEO_KPI_PROMPT §3-1. Хэмжээний тоог
       «сайн/муу» гэж будвал утгагүй асуулт төрүүлнэ. Өгөгдөл ирээгүй нүд л
       `unknown` болно (саарал боловч тайлбар нь өөр). */
    const lvl = (ok: boolean): Level => (ok ? 'neutral' : 'unknown');
    const dash = (ok: boolean, v: string) => (ok ? v : '…');
    return [
      {
        key: 'area', cat: 'scope', view: 'plan',
        label: tr('Төслийн талбай'),
        value: dash(!!hd, hd ? tr('{0} га', num(hd.areaHa, 1)) : ''),
        note: tr('төлөвлөлтийн хилээр'),
        level: lvl(!!hd),
      },
      {
        key: 'pop', cat: 'scope', view: 'irged',
        label: tr('Хамрагдах хүн ам'),
        value: dash(!!hd, hd ? num(hd.population) : ''),
        note: hs ? tr('{0} өрхийн орон сууц', num(hs.ail)) : tr('оршин суух хүн ам'),
        level: lvl(!!hd),
      },
      {
        key: 'status', cat: 'scope', view: 'plan',
        label: tr('Барилгын төлөв'),
        /* ⚠️ `byStatus.length` шалгалт (олдвор #22): `loadHeadline` allSettled
           болсноос хойш барилгын эх сурвалж унавал `byStatus = []` ирдэг —
           тэр үед «0» гэж худал тоо биш, «…» (unknown) харуулна. */
        value: dash(!!hd && hd.byStatus.length > 0, hd ? num(hd.byStatus.reduce((a, x) => a + x.n, 0)) : ''),
        /* ⚠️ Задаргаа нь ТООН уншилтаар — график нь дэмжлэг, дангаараа биш */
        note: hd && hd.byStatus.length ? hd.byStatus.map((x) => `${x.label} ${num(x.n)}`).join(' · ') : tr('Barilga_ty задаргаа'),
        level: lvl(!!hd && hd.byStatus.length > 0),
        chart: hd && hd.byStatus.length
          ? <Bars data={hd.byStatus.map((x) => x.n)} w={104} h={44} />
          : undefined,
      },
      {
        key: 'blocks', cat: 'scope', view: 'pkgProg',
        label: tr('Барилгын блок'),
        value: dash(!!hs, hs ? num(hs.blocks) : ''),
        note: tr('орон сууцны блокийн тоо'),
        level: lvl(!!hs),
      },
      {
        key: 'usable', cat: 'scope', view: 'plan',
        label: tr('Барилгажих талбай'),
        value: dash(!!hd, hd ? tr('{0} м²', num(hd.usableM2, 0)) : ''),
        note: tr('нийт шалны талбай — өртөг үүн дээр үржинэ'),
        level: lvl(!!hd),
      },
      {
        key: 'social', cat: 'scope', view: 'irged',
        label: tr('Нийгмийн байгууламж'),
        value: dash(!!sc, sc ? num(sc.totalN) : ''),
        note: tr('сургууль, цэцэрлэг, эмнэлэг г.м.'),
        level: lvl(!!sc),
      },
      {
        key: 'green', cat: 'scope', view: 'plan',
        label: tr('Ногоон байгууламж'),
        value: dash(hd?.greenHa != null, hd?.greenHa != null ? tr('{0} га', num(hd.greenHa, 1)) : ''),
        note: tr('ногоон байгууламжийн талбай'),
        level: lvl(hd?.greenHa != null),
      },
    ];
  }, [headQ, housQ, socQ]);

  /* ═══════════════ 2 · МӨНГӨ ═══════════════ */

  /**
   * IPC-ээр ОЛГОСОН нийт дүн — юүлүүрийн дөрөв дэх шат.
   *
   * ⚠️ 2026-08-31: сарын задаргаа (`given`) БИШ, `givenTotal`. Шинэ
   *    `ipc_0813`-ийн 59 актын 29-д ашиглаж болох огноо ОГТ байхгүй бөгөөд
   *    тэдгээрийн НЭГ нь 9.4 тэрбум ₮ (Багц-4.2) авч явна. Огноогүй актыг
   *    сарын цуваанд хиймэл сар руу шахахгүй (null ≠ 0) ч НИЙТ дүнгээс хасвал
   *    юүлүүрийн «Олгосон (IPC)» шат ~3%-иар дутуу гарна — тиймээс KPI-ийн
   *    нийлбэрийг `givenTotal`-оос, графикийн цувааг `given`-ээс авна.
   */
  const given = useMemo<number | null>(() => {
    if (finQ.state !== 'ready') return null;
    let g = 0;
    finQ.data.givenTotal.forEach((v) => { g += v; });
    return g;
  }, [finQ]);

  const funnel = useMemo<Metric>(() => {
    const base = { key: 'funnel', cat: 'money' as const, view: 'finance' as ViewKey };
    if (budgetQ.state !== 'ready')
      return { ...base, ...notReady(tr('Төсвийн мэдээлэл'), tr('Cashflow ачаалж байна'), [budgetQ]) };
    const b = budgetQ.data;
    /*
     * ЮҮЛҮҮРИЙН ЭХНИЙ ШАТ = БАТЛАГДСАН ТӨСӨВ (CF006).
     * ⚠️ 2026-08-24, хэрэглэгчийн шийдвэр (§7-Б). ЕТ-ийн нэгж үнийн тооцоо
     * (барилга дангаараа ≈7.16 их наяд ₮) нь ОГТ ӨӨР хамрах хүрээтэй — түүнийг
     * юүлүүрийн эхэнд тавибал доорх бүх шат хэдхэн хувь болж, «юу ч хийгдээгүй»
     * мэт худал зураг гарна. ЕТ-ийн тооцоо «Ерөнхий төлөвлөгөө»-нд хэвээр.
     */
    const steps = [
      { label: tr('Батлагдсан төсөв'), v: b.total },
      { label: tr('Захирамжийн дүн'), v: b.orderTotal },
      { label: tr('Гэрээт дүн'), v: b.contract },
      { label: tr('Олгосон (IPC)'), v: given ?? 0 },
      { label: tr('Шилжүүлсэн'), v: b.transferred },
    ].filter((x) => x.v > 0);
    /* ⚠️ Юүлүүр нь ХЭМЖЭЭНИЙ задаргаа — §5-д түүнд босго тодорхойлогдоогүй тул
       өнгө оногдуулахгүй (§4-2). Гацлыг өнгөөр биш, ХАРЬЦААГААР харуулна. */
    const last = steps[steps.length - 1];
    return {
      ...base,
      label: tr('Төсвийн мэдээлэл'),
      value: mntShort(b.total),
      note: steps.length > 1 && b.total > 0
        ? tr('{0} хүртэл {1} үлдсэн', last.label, pct((last.v / b.total) * 100, 0))
        : tr('батлагдсан төсөвт өртөг'),
      level: 'neutral',
      chart: steps.length > 1
        ? <HBars items={steps.map((x) => ({ label: x.label, value: x.v }))} max={steps[0].v} fmt={mntShort} />
        : undefined,
    };
  }, [budgetQ, given]);

  const contractGap = useMemo<Metric>(() => {
    const base = { key: 'contractGap', cat: 'money' as const, view: 'finance' as ViewKey };
    if (budgetQ.state !== 'ready' || bagtsQ.state !== 'ready' || !official)
      return { ...base, ...notReady(tr('Гэрээлэлт ба гүйцэтгэлийн харьцаа'), tr('тооцож байна'), [budgetQ, bagtsQ]) };
    const b = budgetQ.data;
    const cPct = b.total > 0 ? (b.contract / b.total) * 100 : null;
    if (cPct == null || official.pct == null)
      return { ...base, label: tr('Гэрээлэлт ба гүйцэтгэлийн харьцаа'), value: '—', note: tr('өгөгдөл дутуу'), level: 'unknown' };
    const gap = cPct - official.pct;
    return {
      ...base,
      label: tr('Гэрээлэлт ба гүйцэтгэлийн харьцаа'),
      value: tr('Гэрээлсэн {0} · Биет {1}', pct(cPct, 0), pct(official.pct, 0)),
      /* ⚠️ Сөрөг зөрүү = биет ажил гэрээлснээс ТҮРҮҮЛСЭН → гэрээгүй ажил */
      note: gap >= 0
        ? tr('гэрээлэлт гүйцэтгэлээс {0}пп түрүүлж байна', gap.toFixed(0))
        : tr('биет гүйцэтгэл гэрээнээс {0}пп түрүүлж байна — гэрээгүй ажлын эрсдэл', (-gap).toFixed(0)),
      level: contractGapLevel(gap),
    };
  }, [budgetQ, bagtsQ, official]);

  const finance = useMemo<Metric>(() => {
    const base = { key: 'finance', cat: 'money' as const, view: 'finance' as ViewKey };
    if (finQ.state !== 'ready' || budgetQ.state !== 'ready' || !official)
      return { ...base, ...notReady(tr('Санхүүжилт ба гүйцэтгэлийн зөрүү'), tr('тооцож байна'), [finQ, budgetQ, bagtsQ]) };
    const budget = budgetQ.data.total;
    const finPct = budget > 0 ? ((given ?? 0) / budget) * 100 : 0;
    const physPct = official.pct;
    if (physPct == null)
      return { ...base, label: tr('Санхүүжилт ба гүйцэтгэлийн зөрүү'), value: '—', note: tr('өгөгдөл дутуу'), level: 'unknown' };
    const gap = finPct - physPct;
    /*
     * САР БҮРИЙН IPC олголт — `cfMonthAxis()`-ийн бодит цуваа.
     * ⚠️ Өсөлтийн ХАНДЛАГА биш, сар тутмын ДҮН тул шугам биш БАГАНА-аар
     * үзүүлнэ — шугам нь хуримтлалыг илэрхийлдэг.
     * ⚠️ 2026-08-31: хуучин `CASHFLOW2.months` (12 сарын БАГАНЫН код) устсан —
     *    сар одоо `CF003`/`CF004` утга. Тэнхлэгийг өгөгдөлд БАЙГАА саруудаас
     *    угсарч БОЛОХГҮЙ: 2026-01-д ямар ч хэмжилт алга тул график нэг слот
     *    гулсаж, тэрнээс хойшхи бүх багана буруу сар дээр зогсоно.
     */
    const all = cfMonthAxis().map((m) => {
      let sum = 0;
      finQ.data.given.forEach((byMon) => { sum += byMon.get(m.label) ?? 0; });
      return sum;
    });
    // ⚠️ Сүүлийн хоосон саруудыг тайрна — «олголт зогссон» мэт хуурамч сүүл гарна
    let mLast = all.length - 1;
    while (mLast >= 0 && all[mLast] <= 0) mLast -= 1;
    const monthly = mLast < 0 ? [] : all.slice(0, mLast + 1);
    return {
      ...base,
      label: tr('Санхүүжилт ба гүйцэтгэлийн зөрүү'),
      value: tr('Санхүүжилт {0} · Биет {1}', pct(finPct, 0), pct(physPct, 0)),
      note: Math.abs(gap) <= 5 ? tr('санхүүжилт гүйцэтгэлтэй тэнцвэртэй')
        : gap > 0 ? tr('санхүүжилт гүйцэтгэлээс {0}пп түрүүлж байна', gap.toFixed(0))
          : tr('гүйцэтгэл санхүүжилтээс {0}пп түрүүлж байна', (-gap).toFixed(0)),
      level: finGapLevel(gap),
      chart: monthly.some((x) => x > 0) ? <Bars data={monthly} w={104} h={44} /> : undefined,
    };
  }, [finQ, budgetQ, bagtsQ, official, given]);

  const variance = useMemo<Metric>(() => {
    /* ⚠️ `ceoOnly` — хүснэгтийн мөрийн түвшний зөрүү нь гүйцэтгэлийн хяналтын
       ажил (`MAYOR_KPI_BENCHMARK` §3: «Обьёмын зөрүү илэрсэн → CEO / хяналт»). */
    const base = { key: 'variance', cat: 'money' as const, view: 'guitsetgel' as ViewKey, ceoOnly: true as const };
    const label = tr('Обьёмын зөрүү');
    if (varQ.state !== 'ready')
      return { ...base, ...notReady(label, tr('12 багцын хүснэгт уншиж байна'), [varQ]) };
    const d = varQ.data;
    if (d.works === 0)
      return {
        ...base, label,
        value: tr('Зөрүүгүй'),
        note: tr('бодит гүйцэтгэл төлөвлөгдсөн обьёмоос хэтрээгүй'),
        level: 'good',
      };
    const top = d.top[0];
    return {
      ...base, label,
      value: money(d.totalMnt),
      note: tr('{0} ажил хэтэрсэн · топ: {1} — {2}', num(d.works), top.work, money(top.mnt)),
      level: d.totalMnt >= VAR_BAD_MNT ? 'bad' : 'warn',
      chart: <HBars items={d.top.slice(0, 4).map((w) => ({ label: w.work, value: w.mnt }))} max={d.top[0].mnt} fmt={money} />,
    };
  }, [varQ]);

  /* ═══════════════ 3 · ХУГАЦАА ═══════════════ */

  const progress = useMemo<Metric>(() => {
    const base = { key: 'progress', cat: 'time' as const, view: 'pkgProg' as ViewKey };
    const label = tr('Барилга угсралтын гүйцэтгэл');
    if (bagtsQ.state !== 'ready' || !official)
      return { ...base, ...notReady(label, tr('багц ачаалж байна'), [bagtsQ]) };
    if (official.pct == null)
      return { ...base, label, value: '—', note: tr('өгөгдөл алга'), level: 'unknown' };
    return {
      ...base, label,
      value: pct(official.pct, 1),
      /* ⚠️ `missing`-ийг ЗААВАЛ хамт: 0%-аар орж буй блок хэд байгааг хэлэхгүй
         бол энэ тоо төөрөгдүүлнэ (§7-A-ийн сонголтын шууд үр дагавар). */
      note: tr('{0} блокоор жигнэсэн · {1} блок тайлангүй', num(official.blocks), num(official.missing)),
      /* ⚠️ `neutral`: §5-д түүхий гүйцэтгэлийн хувьд босго тодорхойлогдоогүй.
         «Хэр хурдан явах ёстой вэ» гэдгийг ХУВААРИЙН БИЕЛЭЛТ хэлнэ. */
      level: 'neutral',
      chart: <Ring value={official.pct} size={74} width={9} label={pct(official.pct, 0)} />,
    };
  }, [bagtsQ, official]);

  const schedule = useMemo<Metric>(() => {
    const base = { key: 'schedule', cat: 'time' as const, view: 'pkgProg' as ViewKey };
    const label = tr('Хуваарийн биелэлт');
    if (finQ.state !== 'ready') return { ...base, ...notReady(label, tr('Cashflow+IPC ачаалж байна'), [finQ]) };
    const C = CASHFLOW2.fields;
    const d = finQ.data;
    const seen = new Set<string>();
    let red = 0, yellow = 0, worst = 0, total = 0;
    // ⚠️ Багц бүрийн хоцрогдлыг ХАДГАЛНА — график энэ бодит цуваанаас зурагдана
    const gaps: number[] = [];
    /*
     * САР БҮРИЙН БИЕТ ГҮЙЦЭТГЭЛ — шугаман графикийн бодит эх сурвалж.
     * ⚠️ Дүн БИШ, ДУНДАЖ: гэрээ бүр өөр өөр сард эхэлдэг тул нийлбэр авбал
     * зүгээр л гэрээний тоог давхарлан харуулна.
     */
    /* ⚠️ Тэнхлэгийн урт нь `contractMonths`-ийнхтой ЯГ ижил байх ёстой (хоёул
       `cfMonthAxis()`) — эс тэгвээс доорх `physSum[i]` индекс өөр сар руу
       унана. Хуучин `CASHFLOW2.months` 12 тогтмол багана байсан, одоо
       өнөөдөр хүртэл сунадаг. */
    const mn = cfMonthAxis().length;
    const physSum = new Array<number>(mn).fill(0);
    const physCnt = new Array<number>(mn).fill(0);
    /* ⚠️ `d.contracts` нь ЗӨВХӨН мастер мөрүүд (`CF002 = 'ГЭРЭЭ'`, 76 ш).
       Шинэ `cashflow_0813` нь гэрээ×үе гриэйнтэй 209 мөртэй тул шүүлтгүй
       гүйлгэвэл нэг гэрээ 14 удаа тоологдож «хоцорсон багц»-ийн тоо
       хөөрөгдөнө. Шүүлтийг `loadFinData` хийнэ. */
    d.contracts.forEach((r) => {
      // ⚠️ `pkgKeyOf` — «БАГЦ 1-4» мэт диапазон мөр `bagtsKey`-ээр «БАГЦ14» болж,
      //    бодит «Багц 14»-ийн оронд тоологдож хоцрогдлын тоог гажуудуулдаг байв.
      //    ⚠️ 2026-08-31: багц одоо CF006 (үндсэн) / CF007 (дэд) — ХУУЧИН
      //    CF003/CF004 БИШ. Диапазон («БАГЦ 1-4», «БАГЦ 1-6 БАГЦ 8-17»),
      //    «БҮХ БАГЦ» ба NULL мөрүүд ШИНЭ хүснэгтэд ч ХЭВЭЭР тул хамгаалалт
      //    үлдэнэ; харин литерал «0» утга алга болсон (шалгасан) — `!key` нь
      //    NULL-ыг барих тул `key === '0'` зөвхөн хуучин датад зориулсан үлдэц.
      const key = pkgKeyOf(r[C.pkg2]) || pkgKeyOf(r[C.pkg]);
      if (!key || key === '0' || seen.has(key)) return;
      seen.add(key);
      // ⚠️ 2026-08-31: гарын үсэг өөрчлөгдөв — `contractMonths(r, fin)`.
      //    Төлөвлөгөө одоо гэрээний мөрөнд БИШ, `fin.plan` (гэрээ → сар → дүн)-д.
      const ms = contractMonths(r, d);
      // ⚠️ `!= null`: жинхэнэ 0% нь ХЭМЖИЛТ тул дундажид орох ёстой;
      //    хэмжигдээгүй сар л хасагдана (0 гэж тоовол дундаж худал буурна).
      ms.forEach((m, i) => { if (m.phys != null) { physSum[i] += m.phys; physCnt[i] += 1; } });
      const lag = lagOf(ms);
      if (!lag) return;
      total += 1;
      const lvl = lagLevel(lag.gap);
      if (lvl === 'red') red += 1;
      else if (lvl === 'yellow') yellow += 1;
      if (lag.gap > worst) worst = lag.gap;
      if (lag.gap > 0) gaps.push(lag.gap);
    });
    const lagging = red + yellow;
    /*
     * ⚠️ ХОЁР ТАЛААС нь хоосон саруудыг тайрна.
     *   ЭХЭНД — төсөл эхлэхээс өмнөх 0-үүд хавтгай сүүл болж өсөлтийг шахна.
     *   СҮҮЛД — мэдээлэл ирээгүй сар 0 болж бичигдэн ЭГЦ УНАЛТ мэт харагдана.
     *     «Өгөгдөл алга» гэдэг нь «гүйцэтгэл тэг болов» гэсэн үг БИШ.
     */
    const avg = physSum.map((v, i) => (physCnt[i] ? v / physCnt[i] : 0));
    const first = avg.findIndex((v) => v > 0);
    let lastIdx = avg.length - 1;
    while (lastIdx >= 0 && avg[lastIdx] <= 0) lastIdx -= 1;
    const series = first < 0 || lastIdx < first ? [] : avg.slice(first, lastIdx + 1);
    return {
      ...base, label,
      value: lagging === 0 ? tr('Хэвийн') : tr('{0} багц хоцорч байна', num(lagging)),
      note: lagging === 0
        ? tr('{0} багц хуваарьтаа нийцэж байна', num(total))
        : tr('{0} эрсдэлтэй · {1} анхаарах · хамгийн муу −{2}%', num(red), num(yellow), worst.toFixed(0)),
      level: red > 0 ? 'bad' : yellow > 0 ? 'warn' : 'good',
      chart: series.length >= 2
        ? <Spark data={series} w={104} h={44} />
        : gaps.length ? <Bars data={gaps.sort((a, b) => b - a).slice(0, 10)} w={104} h={44} />
          : undefined,
    };
  }, [finQ]);


  /**
   * ХЯНАЛТАД ХҮЛЭЭГДЭЖ БУЙ АЖИЛ — хэн дээр хэдэн хоног (хэрэглэгчийн хүсэлт,
   * 2026-08-24).
   *
   * ⚠️ ЭНЭ НЬ ШИНЭ ArcGIS ХҮСЭЛТ. `CEO_KPI_PROMPT` §0-д «шинэ хүсэлт нэмэхгүй»
   * гэсэн хориг бий боловч хяналтын урсгалын өгөгдөл ямар ч одоо байгаа
   * ачаалагчид БАЙХГҮЙ (тэр нь ӨӨР байгууллагын үйлчилгээ — `hyanalt.ts`-ийг
   * үз). Хэрэглэгч энэ үзүүлэлтийг тодорхой хүссэн тул нэмэв.
   *
   * ⚠️ Хамгийн сүүлд, `afterIdle`-ээр хойшлуулна — хөнгөн картуудын асуулгыг
   * хаахгүйн тулд (үлдсэн хүнд ачаалагчидтай ижил хэв маяг).
   */
  const reviewQ = useAsync(afterIdle(loadReviewAging, 4000), []);

  const review = useMemo<Metric>(() => {
    /* ⚠️ `ceoOnly` — хяналтын дараалал нь дотоод урсгалын асуудал */
    const base = { key: 'review', cat: 'time' as const, view: 'guitsetgel' as ViewKey, ceoOnly: true as const };
    const label = tr('Хяналтад хүлээгдэж буй ажил');
    if (reviewQ.state !== 'ready')
      return { ...base, ...notReady(label, tr('хяналтын бүртгэл уншиж байна'), [reviewQ]) };
    const list = reviewQ.data;
    if (!list.length)
      return { ...base, label, value: tr('Хүлээгдэлгүй'), note: tr('хяналтын дараалалд ажил алга'), level: 'good' };

    const worst = list[0];
    const stale = list.filter((p) => p.days > REVIEW_STALE_DAYS);

    /* ХАРИУЦАГЧААР нэгтгэнэ — «хэн дээр» гэдэг асуултын шууд хариу.
       ⚠️ Хүн бүрд ХАМГИЙН УРТ хүлээлтийг авна, нийлбэр/дундаж БИШ: хоёр ажлын
       нэг нь 12 хоног, нөгөө нь 1 хоног бол дундаж 6.5 гэж босгоос доогуур
       гарч, гацсан ажил нуугдана. */
    const byWho = new Map<string, number>();
    for (const p of list) byWho.set(p.who, Math.max(byWho.get(p.who) ?? 0, p.days));
    const ranked = [...byWho.entries()]
      .map(([who, days]) => ({ label: who, value: days }))
      .sort((a, b) => b.value - a.value);

    return {
      ...base, label,
      value: tr('{0} хоног', num(worst.days)),
      note: tr('«{0}» дээр {1} хоног · {2} хоногоос дээш {3} ажил',
        worst.who, num(worst.days), num(REVIEW_STALE_DAYS), num(stale.length)),
      level: reviewAgeLevel(worst.days),
      chart: <HBars items={ranked.slice(0, 4)} max={ranked[0].value} fmt={(v) => tr('{0} хоног', num(v))} />,
    };
  }, [reviewQ]);


  /* ═══════════════ 4 · СААД ═══════════════ */

  const clearance = useMemo<Metric>(() => {
    const base = { key: 'clearance', cat: 'blockers' as const, view: 'gazar' as ViewKey };
    const label = tr('Газар чөлөөлөлт');
    if (clearQ.state !== 'ready') return { ...base, ...notReady(label, tr('кадастр ачаалж байна'), [clearQ]) };
    const d = clearQ.data;
    if (d.pct == null)
      return { ...base, label, value: '—', note: tr('өгөгдөл алга'), level: 'unknown' };
    return {
      ...base, label,
      value: tr('Чөлөөлсөн {0}', pct(d.pct, 1)),
      note: tr('{0} нэгж талбар чөлөөлөгдөөгүй ({1} га)', num(d.remaining), num(d.remainingHa, 1)),
      level: pctLevel(d.pct),
      chart: <Ring value={d.pct} size={74} width={9} label={pct(d.pct, 0)} />,
    };
  }, [clearQ]);

  const overlap = useMemo<Metric>(() => {
    const base = { key: 'overlap', cat: 'blockers' as const, view: 'pkgProg' as ViewKey };
    const label = tr('Давхцсан үлдсэн нэгж талбар');
    if (ovQ.state !== 'ready') return { ...base, ...notReady(label, tr('орон зайн огтлолцол бодож байна'), [ovQ]) };
    const d = ovQ.data;
    if (d.total === 0)
      return { ...base, label, value: tr('Саадгүй'), note: tr('багцын талбайд давхцсан талбар алга'), level: 'good' };
    return {
      ...base, label,
      value: tr('{0} талбар', num(d.total)),
      // ⚠️ Багц ажлын НЭРИЙН хамт (хэрэглэгчийн хүсэлт) — аль багц саадтайг шууд
      note: d.byPkg.slice(0, 3).map((p) => `${p.name} (${num(p.parcels)})`).join(' · ')
        + (d.byPkg.length > 3 ? tr(' · бас {0} багц', num(d.byPkg.length - 3)) : ''),
      /* ⚠️ Дундын түвшин БАЙХГҮЙ — §7-В (2026-08-24 дахин баталсан). */
      level: overlapLevel(d.total),
      chart: d.byPkg.length
        ? <HBars items={d.byPkg.slice(0, 4).map((p) => ({ label: p.name, value: p.parcels }))} max={d.byPkg[0].parcels} fmt={(v) => num(v)} />
        : undefined,
    };
  }, [ovQ]);

  const missing = useMemo<Metric>(() => {
    /* ⚠️ `ceoOnly` — тайлагнаагүй блок нь гүйцэтгэгчийн сахилга бат, даргын
       эрх мэдлээр шийдэгддэггүй */
    const base = { key: 'missing', cat: 'blockers' as const, view: 'pkgProg' as ViewKey, ceoOnly: true as const };
    const label = tr('Тайлан ирээгүй блок');
    if (bagtsQ.state !== 'ready' || !official)
      return { ...base, ...notReady(label, tr('багц ачаалж байна'), [bagtsQ]) };
    const worst = [...bagtsQ.data]
      .filter((r) => r.missing > 0)
      .sort((a, b) => b.missing - a.missing);
    return {
      ...base, label,
      value: official.missing === 0 ? tr('Бүрэн') : tr('{0} блок', num(official.missing)),
      note: official.missing === 0
        ? tr('{0} блок бүгд тайлагнасан', num(official.blocks))
        : tr('{0}/{1} блок · хамгийн их: {2} ({3})', num(official.missing), num(official.blocks), tr(worst[0].label), num(worst[0].missing)),
      level: missingLevel(official.missing, official.blocks),
      chart: worst.length
        ? <HBars items={worst.slice(0, 4).map((r) => ({ label: r.label, value: r.missing }))} max={worst[0].missing} fmt={(v) => num(v)} />
        : undefined,
    };
  }, [bagtsQ, official]);

  const failed = useMemo<Metric>(() => {
    /* ⚠️ `ceoOnly` — энэ нь ТӨСЛИЙН биш, ПОРТАЛЫН эрүүл мэнд. Дарга системийн
       доголдлыг засдаггүй. */
    const base = { key: 'failed', cat: 'blockers' as const, view: 'guitsetgel' as ViewKey, ceoOnly: true as const };
    const label = tr('Уншигдаагүй багц');
    if (varQ.state !== 'ready') return { ...base, ...notReady(label, tr('12 багцын хүснэгт уншиж байна'), [varQ]) };
    const n = varQ.data.failedPkgs;
    return {
      ...base, label,
      value: n === 0 ? tr('Бүгд уншигдсан') : tr('{0} багц', num(n)),
      /* ⚠️ Энэ нь ТӨСЛИЙН биш, ПОРТАЛЫН эрүүл мэнд: багц уншигдахгүй бол
         обьёмын зөрүү дутуу суурин дээр бодогдож байна гэсэн үг. */
      note: n === 0
        ? tr('обьёмын хүснэгт бүрэн уншигдав')
        : tr('обьёмын зөрүү дутуу тооцогдож байна'),
      level: failedPkgLevel(n),
    };
  }, [varQ]);

  /* ═══════════════ 5 · ХҮН БА ЧАНАР ═══════════════ */

  const safety = useMemo<Metric>(() => {
    const base = { key: 'safety', cat: 'people' as const, view: 'habea' as ViewKey };
    const label = tr('ХАБЭА — осол, зөрчил');
    if (incQ.state !== 'ready') return { ...base, ...notReady(label, tr('ХАБЭА бүртгэл'), [incQ]) };
    const F = HABEA.incident.fields;
    // ⚠️ Төрөл ХООСОН мөр ч байж болно — тоолохоос хасахгүй, шошгыг нь л орлуулна
    const byType = incQ.data
      .map((r) => ({ label: String(r[F.turul] ?? '') || tr('Тодорхойгүй'), n: Number(r.n) || 0 }))
      .sort((a, b) => b.n - a.n);
    const n = byType.reduce((acc, x) => acc + x.n, 0);
    const top = byType[0];
    return {
      ...base, label,
      value: n === 0 ? tr('Бүртгэлгүй') : tr('{0} осол/зөрчил', num(n)),
      note: top && n > 0
        ? tr('{0} төрөл · хамгийн олон нь «{1}» ({2})', num(byType.length), top.label, num(top.n))
        : tr('ХАБЭА-гийн нийт бүртгэл'),
      level: incidentLevel(n),
      chart: n > 0 ? <Bars data={byType.map((x) => x.n)} w={104} h={44} /> : undefined,
    };
  }, [incQ]);

  const damage = useMemo<Metric>(() => {
    const base = { key: 'damage', cat: 'people' as const, view: 'habea' as ViewKey };
    const label = tr('ХАБЭА — хохирол');
    if (dmgQ.state !== 'ready') return { ...base, ...notReady(label, tr('ослын бүртгэл уншиж байна'), [dmgQ]) };
    const d = dmgQ.data;
    if (d.n === 0)
      return { ...base, label, value: tr('Бүртгэлгүй'), note: tr('хохирлын төрлийн осол бүртгэгдээгүй'), level: 'good' };
    return {
      ...base, label,
      value: tr('{0} хохирол', num(d.n)),
      note: (d.last ? tr('сүүлийнх {0}', date(d.last)) : '') + (d.sample.length ? ' · ' + d.sample[0] : ''),
      level: d.n >= DMG_BAD_N ? 'bad' : 'warn',
    };
  }, [dmgQ]);

  const contractor = useMemo<Metric>(() => {
    const base = { key: 'contractor', cat: 'people' as const, view: 'pkgProg' as ViewKey };
    const label = tr('Гүйцэтгэгчийн зэрэглэл');
    if (bagtsQ.state !== 'ready') return { ...base, ...notReady(label, tr('багц ачаалж байна'), [bagtsQ]) };
    const by = new Map<string, { blocks: number; wsum: number }>();
    bagtsQ.data.forEach((r) => {
      if (!r.contractor || r.contractor === '—' || r.progress == null) return;
      const cur = by.get(r.contractor) ?? { blocks: 0, wsum: 0 };
      cur.blocks += r.blocks;
      cur.wsum += r.progress * r.blocks;
      by.set(r.contractor, cur);
    });
    const ranked = [...by.entries()]
      .map(([c, v]) => ({ c, p: v.blocks ? v.wsum / v.blocks : 0 }))
      .sort((a, b) => b.p - a.p);
    if (!ranked.length)
      return { ...base, label, value: '—', note: tr('мэдээлэл алга'), level: 'unknown' };
    const best = ranked[0];
    const last = ranked[ranked.length - 1];
    return {
      ...base, label,
      value: tr('Тэргүүлэгч {0}', pct(best.p, 0)),
      note: tr('{0} · хойгуур {1} ({2})', tr(best.c), tr(last.c), pct(last.p, 0)),
      /* ⚠️ ЗОРИУДААР `neutral` (§3-5) — зэрэглэл нь харьцуулалт, гэрлэн дохио
         БИШ. Хамгийн хойгуур гүйцэтгэгч нь «яаралтай» гэсэн үг биш. */
      level: 'neutral',
      chart: <HBars items={ranked.slice(0, 4).map((r) => ({ label: r.c, value: r.p }))} max={100} fmt={(v) => pct(v, 0)} />,
    };
  }, [bagtsQ]);

  /* ═══════════════ 6 · ТӨЛӨВЛӨЛТИЙН ҮЗҮҮЛЭЛТ ═══════════════ */

  /**
   * НОРМЫН БИЕЛЭЛТ — үзүүлэлт бүрээр, БҮСИЙН тоогоор (2026-08-24).
   *
   * ⚠️ БАГЦААР БИШ, СЭДЭВЭЭР (хэрэглэгчийн хүсэлт). Багц↔бүсийн орон зайн
   * холбоос ОГТ шаардлагагүй болсон — үзүүлэлт бүр бүх бүсээр шууд нэгтгэгдэнэ.
   *
   * ⚠️ Мөр бүр УТГА · НОРМ · ЗӨРҮҮ гурвыг агуулна. Зөвхөн оноо харуулбал
   * «юуг хэдээр засах вэ» гэдэг нь тодорхойгүй үлдэнэ.
   */
  const planning = useMemo<Metric[]>(() => {
    if (suitQ.state !== 'ready')
      return [{
        key: 'plan:wait', cat: 'planning',
        ...notReady(tr('Нормын биелэлт'), tr('орон зайн анализ бодож байна'), [suitQ]),
      }];

    const norms: Metric[] = suitQ.data.byIndicator.map((f) => {
      const w = f.worst;
      const unit = f.unit ? ` ${f.unit}` : '';
      /* ⚠️ Зөрчил = ШУУД улаан: `STRICT_NORM` тул норм зөрчсөн бүс аль хэдийн
         44 оноо буюу улаан бүсэд байна — дундын түвшин зохиохгүй.
         ⚠️ ГАНЦ үл хамаарах нь `assumed` үзүүлэлт: эх өгөгдөл нь найдваргүй
         тул шар — «шалгах хэрэгтэй», «яаралтай зас» БИШ. */
      const level: Level = f.scored === 0 ? 'unknown'
        : f.fails === 0 ? 'good'
          : f.assumed ? 'warn' : 'bad';
      return {
        key: `plan:${f.id}`,
        cat: 'planning' as const,
        view: 'analysis' as ViewKey,
        label: f.name,
        value: f.scored === 0 ? '—'
          : f.fails === 0 ? tr('Норм хангасан')
            : tr('{0}/{1} бүс зөрчсөн', num(f.fails), num(f.scored)),
        note: [
          w
            ? tr('хамгийн муу {0}: {1}{2} · норм {3} · {4} зөрүү',
              w.zone, num(w.value, 1), unit, f.normLabel, num(w.gap, 1))
            : tr('норм {0}', f.normLabel),
          // ⚠️ Найдваргүй эх өгөгдлийг ИЛ хэлнэ — чимээгүй улаан болговол
          //    зураг төслийг буруу үндэслэлээр өөрчлүүлж болзошгүй
          f.assumed ? tr('· эх өгөгдөл батлагдаагүй') : '',
        ].filter(Boolean).join(' '),
        level,
      };
    });

    /**
     * ЗАМЫН СИМУЛЯЦЫН ЭРЭЛТ.
     *
     * ⚠️ Энэ нь амьд машин агентын статистик БИШ. Тэр нь анимац ажиллаж байж
     * гардаг бөгөөд замын сүлжээг бүтнээр нь ачаалахыг шаардана — нүүр хуудсанд
     * тохирохгүй. Энд харуулж буй нь симуляцыг ТЭЖЭЭДЭГ эрэлтийн загвар
     * (`zoneTrips`): бүс бүрийн оргил цагийн аялал үүсгэлт. Шинэ хүсэлт
     * нэмэгдэхгүй — бүсийн хүн ам аль хэдийн санах ойд бий.
     */
    const road = suitQ.data.road;
    norms.push({
      key: 'plan:road',
      cat: 'planning',
      view: 'analysis',
      label: tr('Замын ачааллын эрэлт'),
      value: road.trips > 0 ? tr('{0} машин/ц', num(road.trips, 0)) : '—',
      note: road.top.length
        ? tr('оргил цагийн аялал · хамгийн их {0} ({1})', road.top[0].zone, num(road.top[0].trips, 0))
        : tr('оргил цагийн аялал үүсгэлт'),
      /* ⚠️ `neutral` — аялалын тоонд НОРМ байхгүй. Эгнээний тоо (lane count)
         эх өгөгдөлд алга тул хүчин чадалтай харьцуулж V/C бодох боломжгүй;
         норм зохиохоос эрчмийг нь харуулах нь үнэнч. */
      level: road.trips > 0 ? 'neutral' : 'unknown',
      chart: road.top.length
        ? <HBars items={road.top.slice(0, 4).map((x) => ({ label: x.zone, value: x.trips }))} max={road.top[0].trips} fmt={(v) => num(v, 0)} />
        : undefined,
    });
    return norms;
  }, [suitQ]);

  const urban = useMemo<Metric>(() => {
    /* ⚠️ «Хот төлөвлөлтийн оноо» нь `people`-ээс `planning` руу ШИЛЖСЭН
       (2026-08-24): тэр нь бүсийн норм биелэлтийн НЭГТГЭСЭН дүн тул доорх
       үзүүлэлт бүрийн задаргаатай нэг ангилалд байх нь логиктой. */
    const base = { key: 'urban', cat: 'planning' as const, view: 'analysis' as ViewKey };
    const label = tr('Хот төлөвлөлтийн оноо');
    if (suitQ.state !== 'ready') return { ...base, ...notReady(label, tr('орон зайн анализ бодож байна'), [suitQ]) };
    const sc = suitQ.data.avgScore;
    if (sc == null)
      return { ...base, label, value: '—', note: tr('өгөгдөл дутуу'), level: 'unknown' };
    return {
      ...base, label,
      value: `${Math.round(sc)} / 100`,
      note: tr('{0} · {1} бүсийн дундаж', scoreLabel(sc), num(suitQ.data.zones)),
      level: scoreLevel(sc),
      /*
       * ⚠️ Онооны ТҮҮХЭН цуваа БАЙХГҮЙ — өнөөдрийн ганц утга л бий. Өсөлтийн
       * шугам зурвал болоогүй ахиц зурсан болно. Тиймээс бүсүүдийн онооны
       * БОДИТ хуваарилалтыг (SCORE_LEVELS тус бүрд хэдэн бүс) үзүүлэв.
       */
      chart: <Spark data={suitQ.data.levels.map((L) => L.n)} w={104} h={44} />,
    };
  }, [suitQ]);

  /**
   * ХУРААСАН ангиллууд.
   *
   * ⚠️ Анхдагчаар БҮГД НЭЭЛТТЭЙ. `Section`-ий «бүгд хураалттай эхэлнэ» дүрмийг
   * ЭНД хэрэглэхгүй: удирдлагын самбарын зорилго нь эхний харцаар байдлыг
   * харуулах бөгөөд бүгд хаалттай нээгдвэл хэрэглэгч таван товч дарж байж л
   * ямар нэг тоо олж харна.
   *
   * ⚠️ САНАХГҮЙ (localStorage-д хадгалахгүй) — refresh хийхэд бүгд буцаад
   * нээгдэнэ. Хураалт нь «одоо энэ хэсгийг харахгүй байя» гэсэн түр үйлдэл.
   */
  const [shut, setShut] = useState<Set<CategoryKey>>(() => new Set());

  /**
   * ХЭНИЙ ХАРАГДАЦ — CEO эсвэл Хотын дарга (2026-08-24, хэрэглэгчийн хүсэлт).
   *
   * ⚠️ Анхдагч нь `ceo` — самбар нь төслийн удирдлагад зориулагдсан, даргын
   * харагдац нь түүний ЦӨӨРСӨН хувилбар. Эсрэгээр эхлүүлбэл байнгын хэрэглэгч
   * бүр орох болгондоо сэлгэх шаардлагатай болно.
   *
   * ⚠️ САНАХГҮЙ: сэлгэлт нь илтгэл тайлагнах агшны сонголт, байнгын тохиргоо
   * биш. Refresh хийхэд CEO рүү буцна.
   */
  const [audience, setAudience] = useState<Audience>('ceo');

  const metrics: Metric[] = [
    ...scope,
    funnel, contractGap, finance, variance,
    progress, schedule, review,
    clearance, overlap, missing, failed,
    safety, damage, contractor,
    /* ⚠️ Нэгтгэсэн оноо ЭХЭНД, дараа нь үзүүлэлт бүрийн задаргаа — эрэмбийг
       `levelRank` дахин зохицуулна (улаан дээшээ). */
    urban, ...planning,
  ];

  const card = (m: Metric): ReactNode => (
    <button
      key={m.key}
      type="button"
      className={s.card}
      style={{ ['--st']: LEVEL_TONE[m.level] } as CSSProperties}
      /* ⚠️ Карт нь өөрөө `<button>` тул дотор нь «дахин оролдох» товч
         ҮҮРЛҮҮЛЭХ боломжгүй (HTML зөвшөөрөхгүй). Алдаатай үед картын
         өөрийнх нь даралт л дахин татах үйлдэл болно — сум нь ⟲ болж
         өөрчлөгдөж, юу болохыг урьдчилан хэлнэ. */
      onClick={() => (m.retry ? m.retry() : m.view ? onView(m.view) : undefined)}
      title={m.retry ? tr('{0} — дахин татах', m.label) : tr('{0} — дэлгэрэнгүй рүү очих', m.label)}
    >
      {/* ⚠️ ХҮСНЭГТИЙН ЭГНЭЭ (2026-08-24): доторх элементүүд нь `.card` grid-ийн
          ШУУД хүүхдүүд. Урьд нь `.top`/`.body`/`.text` гэсэн гурван хайрцагт
          үүрлэсэн байсан тул мөр бүр өөрийн дотоод хуваарьтай байж, багана нь
          эгнэдэггүй байв — жагсаалт нь хүснэгт БИШ, дараалсан карт болж
          харагддаг байлаа. Хавтгай бүтэц нь бүх мөрийн багануудыг нэг
          `grid-template-columns` дээр эгнүүлнэ. */}
      {/* ⚠️ Тэмдэг нь `aria-hidden` БИШ — өнгө ганцаараа утга дамжуулж
          болохгүй (WCAG 1.4.1). Дэлгэц уншигчид шошгыг нь уншина. */}
      <i className={s.dot}><span className={s.mark}>{LEVEL_MARK[m.level]}</span></i>
      <span className={s.label}>{m.label}</span>
      <span className={s.value}>{m.value}</span>
      <span className={s.note}>{m.note}</span>
      {/* ⚠️ Графикийн НҮД ҮРГЭЛЖ зурагдана — графикгүй мөрд ч ХООСОН нүд
          үлдээнэ. Эс бөгөөс тэр мөр нэг багана дутуу болж, түүнээс хойшхи
          бүх багана зүүн тийш гулсаж хүснэгт эвдэрнэ.
          ⚠️ График нь `--st` өнгийг `color`-оор өвлөнө — SVG нь `currentColor`
          ашигладаг тул энд өөр өнгө тавихгүй. */}
      <span className={s.chart}>{m.chart}</span>
      <span className={s.lvl}>{levelLabel(m.level)}</span>
      <span className={s.go} aria-hidden>{m.retry ? '⟲' : '→'}</span>
    </button>
  );

  return (
    <section className={s.panel} aria-label={tr('Удирдлагын үзүүлэлт')}>
      <header className={s.head}>
        <h2>{tr('Удирдлагын үзүүлэлт')}</h2>
        {/**
          * ХЭНИЙ ХАРАГДАЦ — сегментчилсэн сонгогч.
          * ⚠️ Даргын харагдац нь ЦӨӨРСӨН: ижил зургаан ангилал, зөвхөн үйл
          * ажиллагааны нарийвчлал хасагдана. Тиймээс «хоёр самбар» гэсэн
          * сэтгэгдэл төрүүлэхгүйн тулд toggle нь гарчгийн ХАЖУУД, тусдаа таб биш.
          */}
        <div className={s.aud} role="group" aria-label={tr('Хэний харагдац')}>
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              type="button"
              aria-pressed={audience === a.key}
              className={`${s.audBtn} ${audience === a.key ? s.audOn : ''}`}
              onClick={() => setAudience(a.key)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </header>

      {CATEGORIES.map((c) => {
        const list = byCategory(metrics, c.key, levelRank)
          .filter((m) => forAudience(m, audience));
        /* ⚠️ Даргын харагдацад ангилал ХООСОРВОЛ огт зурахгүй — хоосон гарчиг
           нь «энд юу ч байхгүй» гэсэн худал мэдээлэл өгнө. */
        if (!list.length) return null;
        /* ⚠️ Тоолуурт ЗӨВХӨН гэрлэн дохионы гурав. `neutral`/`unknown`-ыг
           тоолвол «Хамрах хүрээ 7» гэж гарч, тэр 7 нь асуудал мэт уншигдана. */
        const signals = list.filter((m) => (SIGNAL_LEVELS as readonly Level[]).includes(m.level));
        const worst: Level = c.neutral ? 'neutral' : worstOf(signals.map((m) => m.level));
        const counts = SIGNAL_LEVELS
          .map((l) => ({ l, n: signals.filter((m) => m.level === l).length }))
          .filter((x) => x.n > 0);
        const open = !shut.has(c.key);
        return (
          <div key={c.key} className={s.cat} style={{ ['--tc']: LEVEL_TONE[worst] } as CSSProperties}>
            {/**
              * ⚠️ Толгой нь БҮХЭЛДЭЭ товч — жижиг сум онилохоос хялбар
              * (`components/ui.tsx`-ийн `Section`-той ижил зарчим).
              *
              * ⚠️ Тоолуур нь ХУРААСАН үед ч харагдана: ангилал хаалттай байхад
              * «энд 2 улаан байна» гэдгийг хэлж чадахгүй бол хураах боломж нь
              * мэдээллийг нуух алдаа болно.
              */}
            <button
              type="button"
              className={s.catHead}
              aria-expanded={open}
              onClick={() => setShut((prev) => {
                const next = new Set(prev);
                if (open) next.add(c.key); else next.delete(c.key);
                return next;
              })}
              title={open ? tr('{0} — хураах', c.title) : tr('{0} — дэлгэх', c.title)}
            >
              <span className={`${s.catCaret} ${open ? s.catCaretOpen : ''}`} aria-hidden>▾</span>
              <span className={s.catIcon}><Icon name={c.icon} size={15} /></span>
              <span className={s.catText}>
                <h3 className={s.catTitle}>{c.title}</h3>
                <span className={s.catQ}>{c.desc}</span>
              </span>
              <span className={s.catCounts}>
                {counts.length === 0
                  /* Гэрлэн дохиогүй ангилал — тоолуурын оронд шалтгаанаа хэлнэ */
                  ? <span className={s.catNeutral}>{tr('Хэмжээний үзүүлэлт')}</span>
                  : counts.map((x) => (
                    <span
                      key={x.l}
                      className={`${s.catCount} num`}
                      style={{ ['--cc']: LEVEL_TONE[x.l] } as CSSProperties}
                      title={levelLabel(x.l)}
                    >
                      <i aria-hidden>{LEVEL_MARK[x.l]}</i>
                      {num(x.n)}
                      <em className={s.srOnly}>{levelLabel(x.l)}</em>
                    </span>
                  ))}
              </span>
            </button>
            {/* ⚠️ `hidden` атрибут БОЛОХГҮЙ: `.grid`-ийн `display: grid` нь
                UA-гийн `display: none`-ыг дардаг. Нөхцөлт рендер. */}
            {open && <div className={s.grid}>{list.map(card)}</div>}
          </div>
        );
      })}
    </section>
  );
}
