'use client';

/**
 * ТУХ — БАГЦЫН ДЭЛГЭРЭНГҮЙ. Жишээ HTML-ийн дараалал:
 *   гарчиг → KPI → [Тойм · Хуваарь · Гүйцэтгэл · Ашиглалт|Хамааралтай орон сууц ·
 *   Зураг · Материал · Төлбөр (IPC) · Асуудал].
 *
 * ⚠️ Хуваарийн мэдээлэл (гол үе шат, Level 3, хүн хүч/техник, улсын комисс) нь
 *    «Хуваарь»-ийн бөглөх хуудаснаас (`loadPkgSchedule`) — ЗӨВХӨН энэ багцынх.
 * ⚠️ Эх сурвалжгүй хэсэг бүтцээрээ «—» (хэрэглэгчийн сонголт, 2026-09-30).
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): БҮХЭЛДЭЭ хоосон хэсэг (Зураг, Асуудал, Хамааралтай
 *    орон сууц, баримтгүй Материал) ХУРААГДСАН (`Section empty`); ачаалж буй тоо «…»;
 *    «Сүүлд тайлагнасан» нь ЭНЭ багцынх (урьд нь төслийн нийт огноо байв).
 */
import { useMemo } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num, pct, mnt, date } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { CASHFLOW_NEW, HO_IPC, PKG_BY_BAGTS, LAYER_BY_ID } from '@/lib/services';
import { isContracted } from '@/lib/gdash';
import { MS_STATUS, statusLabel } from '@/lib/chanarMs';
import { statusOf as planStatus } from '@/lib/plan';
import {
  groupLabel, milestonesOf, resourcesOf, rowSpan, rowAct, elapsedPct, HO_PENDING,
  statusOf as tuhStatus, firstFilled, rowProgress,
} from '@/lib/tuhData';
import { payRows } from '@/lib/ipcTable';
import { lz, depRows, commissionText, type TuhModel, type TuhRow } from './model';
import { loadPkgSchedule, sheetsOf } from './tuhSchedule';
import { Meter, Legend, Gantt, GANTT_LEGEND, type GanttRow } from './charts';
/* Системийн карт ба цуваа — «ХАБЭА»-гийн «Ажилтан — өдрөөр» графиктай ижил (`ui.Series`) */
import { Section as Card, Series, type SeriesLineDef } from '@/components/ui';
/* ⚠️ Системийн графикууд — «Гүйцэтгэлийн явц» (PkgProg) ба «Санхүүжилтийн явц» (Finance).
   ТУХ өөрийн S-муруй/мөнгөн график зурахгүй (2026-09-30, «үндсэн системтэй адилхан»). */
import { ProgChart } from '@/modules/PkgProg';
import { ComboChart, lagLevel } from '@/modules/Finance';
import {
  Section, StatusChip, EmptyRow, GanttLegend, ReportAge, ganttDomain, level1Rows, pp, barSt,
  PREREQ_LANES, DepList, calDaysBetween,
} from './Overview';
import s from '../tuh.module.css';

/**
 * ЗӨРҮҮНИЙ ӨНГӨ — (бодит − төлөвлөгөө), нэгж хувь; сөрөг = хоцролт.
 * ⚠️ 2026-10-04: урьд нь `< 0` бол улаан, бусад (`null` ч) НОГООН байв — 0.1 нэгж хоцролт
 *    улаан, «мэдэгдэхгүй» ногоон. Одоо порталын НЭГ босго (`Finance.lagLevel`: 5 шар · 10
 *    улаан); `null` саармаг (өнгөгүй), хоцроогүй бол ногоон.
 */
const gapTone = (gap: number | null): string => {
  if (gap == null) return '';
  const lv = lagLevel(-gap);
  return lv === 'red' ? s.bad : lv === 'yellow' ? s.warn : s.good;
};

const numOf = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

const NAV = (housing: boolean, hasDeps: boolean) => [
  ['overview', tr('Тойм')],
  ['schedule', tr('Хуваарь')],
  ['progress', tr('Гүйцэтгэл')],
  ...(housing ? [['commissioning', tr('Ашиглалт')]] : hasDeps ? [['dependents', tr('Хамааралтай орон сууц')]] : []),
  ['drawings', tr('Зураг')],
  ['materials', tr('Материал')],
  ['payments', tr('Төлбөр (IPC)')],
  ['issues', tr('Асуудал')],
] as [string, string][];


export function PkgDetail({ r, m, onBack, onOpen, onOpenDeps }: {
  r: TuhRow;
  m: TuhModel;
  onBack: () => void;
  onOpen: (key: string) => void;
  /** ⚠️ 2026-10-06: «Багцын хамаарал» харагдац руу (`Tuh.onOpenDeps`) — өгөөгүй бол холбоосгүй */
  onOpenDeps?: () => void;
}) {
  const housing = r.p.group === 'housing';
  const now = m.now;
  /* ⚠️ 2026-10-09 (аудит): хуваарийн огноо (`rowSpan`, гол үе шат) нь UTC шөнө дундын ms — «Хуваарь»
     (`huvaari/util.todayUtc`)-тай ижил ЛОКАЛ өдрийн UTC шөнө дундаар жишнэ. Урьд нь `Date.now()`
     (`m.now`) тул өнөөдөр дуусах ажил тэр өдрийн турш «Хоцорсон» болж, гол үе шат «өнгөрсөн» гэж
     тэмдэглэгддэг байв. */
  const today = useMemo(() => { const d = new Date(now); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }, [now]);
  /* ⚠️ 2026-09-30: хуваарь нь түлхүүрийн ЭЗЭН мөрийнх (`TuhRow.own`) — зураг төслийн мөр барилгын
     хуваарийг (гол үе шат, Level 3, нөөц) өөрийнх мэт харуулахгүй (`tuhData.keyOwners`-ийн ⚠️) */
  const hasSheets = r.own && sheetsOf(r.p.pkgKey).length > 0;
  const schedQ = useAsync(
    () => (hasSheets ? loadPkgSchedule(r.p.pkgKey) : Promise.resolve([])),
    [r.p.pkgKey, hasSheets],
  );
  const sched = schedQ.state === 'ready' ? schedQ.data : null;
  /** Хуваарь ачаалж байхад «—» → «…» (`model.lz`-ийн ⚠️) */
  const schedWait = (t: string): string => (t === '—' && hasSheets && schedQ.state === 'loading' ? '…' : t);
  /* ⚠️ 2026-10-07: хуваарь унахад «Дахин оролдох» — урьд нь `schedQ.retry` холбогдоогүй тул
     зөвхөн бүтэн хуудас refresh-ээр л дахин татдаг байв (газрын зураг ч дахин ачаалагдана). */
  const schedFail = (
    <p className={s.failNote}>
      {tr('Хуваарь уншигдсангүй')}
      {' '}
      <button type="button" className={s.retryBtn} onClick={schedQ.retry}>{tr('Дахин оролдох')}</button>
    </p>
  );
  /** ХАБЭА (хүн хүч) ачаалж байна — бодит тоо ирэх хүртэл «…» (доорх «Хүн хүч»-ийн ⚠️) */
  const wfWait = m.loading.has('workforce');

  const derived = useMemo(() => {
    if (!sched) return null;
    const multi = sched.length > 1;
    const milestones = sched.flatMap((x) => milestonesOf(x.rows).map((ms) => ({ ...ms, name: multi ? `${ms.name} · ${x.sheet.label}` : ms.name })))
      .sort((a, b) => (a.end ?? Infinity) - (b.end ?? Infinity));
    let hun: number | null = null;
    let mashin: number | null = null;
    let finish: number | null = null;
    const l3: GanttRow[] = [];
    for (const x of sched) {
      const res = resourcesOf(x.rows);
      if (res.hun != null) hun = (hun ?? 0) + res.hun;
      if (res.mashin != null) mashin = (mashin ?? 0) + res.mashin;
      if (!x.rows.length) continue;
      const top = Math.min(...x.rows.map((q) => q.depth));
      if (multi) l3.push({ key: `h:${x.sheet.key}`, label: x.sheet.label, heading: true });
      x.rows.forEach((q, i) => {
        if (q.depth > top + 1 || !q.work.trim()) return;
        const sp = rowSpan(x.rows, i);
        if (sp.end != null && (finish == null || sp.end > finish)) finish = sp.end;
        const act = rowAct(q);
        const st = sp.start != null && sp.end != null ? planStatus({ start: sp.start, end: sp.end }, act, today) : 'none';
        l3.push({
          key: `${x.sheet.key}:${i}`,
          label: q.depth === top ? <b>{q.work}</b> : q.work,
          start: sp.start,
          end: sp.end,
          progress: act == null ? null : act * 100,
          st,
        });
      });
    }
    return { milestones, hun, mashin, finish, l3 };
  }, [sched, today]);

  const elapsed = elapsedPct(r.p.start, r.p.end, now);
  /* ⚠️ 2026-10-09: үлдсэн хоног хуанлийн өдрөөр (`calDaysBetween`) — `Math.round` биш */
  const left = calDaysBetween(now, r.p.end);
  const layerTitles = (PKG_BY_BAGTS[r.p.pkgKey] ?? []).map((id) => LAYER_BY_ID[id]?.title).filter(Boolean);
  /* ⚠️ 2026-10-06 (аудит): «Багцын хамаарал»-ын холбоосууд — урьд нь `hasDeps` хатуу `false`,
     урьдчилсан нөхцөлийн эгнээ «—», «хамаарал бүртгэгдээгүй» гэсэн ХУДАЛ бичигтэй байв.
     `null` = хамаарал ирээгүй (ачаалж/унасан). */
  const upRows = depRows(m, r.p.key, 'up');
  const downRows = depRows(m, r.p.key, 'down');
  const depsWait = m.loading.has('deps');
  const nav = NAV(housing, !!downRows?.length || depsWait);
  /** «Багцын хамаарал» руу холбоос (эрх/дуудагч өгсөн үед) */
  const depsLink = onOpenDeps ? (
    <>{' '}<button type="button" className={s.rowLink} onClick={onOpenDeps}>{tr('Багцын хамаарал')} →</button></>
  ) : null;
  const go = (id: string) => document.getElementById(`tuh-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* IPC */
  /**
   * Олголтын бүртгэл — огноогоор, хуримтлалтай (render дотор хувьсагч өөрчлөхгүй).
   * ⚠️ 2026-09-30: (1) ЗӨВХӨН дүнтэй мөр — AUTO мөр (`dun` хоосон, огноо нь батлалтын
   *    өдөр) олголт БИШ (`ipcTable.payCount`-ийн ⚠️); урьд нь «олгосон огноо»-той мөр болж
   *    харагддаг байв. (2) «гэрээний %»-ийн ТООЛОГЧ = гэрээт дүн нь тодорхой гэрээний
   *    олголт (`cumKnown`) — хуваарь (`contractTotal`)-тай нэг хүрээ (`ipcOf.paidPct` ·
   *    `ipcTable.ipcTotals`); «Хуримтлагдсан» ₮ нь хэвээр БҮХ олголт.
   */
  /*
   * ⚠️ 2026-10-09: ГЭРЭЭ БҮРЭЭР `ipcTable.payRows`-ийн КАНОНИК дараалал (урьдчилгаа эхэнд, дараа нь
   *    IPC № өсөх). Урьд нь `guilgee_ognoo` МӨРӨӨР эрэмбэлдэг байв — огноогүй мөр (45-ийн 5) ЭХЭНД
   *    орж, хуримтлал буруу мөрд наалдана (`payRows`-ийн ⚠️); бас багцын бүх гэрээг нэг хуримтлалд холино.
   * ⚠️ 2026-10-09 (аудит): «Хуримтлагдсан» ба «гэрээний %» нь УРЬДЧИЛГААГ ОРУУЛСАН хуримтлал — гэрээний
   *    «олгосон %» (`ipcOf.paidPct` · CEO · IPC-ийн `paidTotal`) урьдчилгааг багтаадаг. Урьд нь
   *    `PayRow.cum` (зөвхөн гүйцэтгэлийн мөр, урьдчилгаанд `null`) хэрэглэдэг тул бүртгэлийн сүүлийн %
   *    гэрээний олгосон %-иас урьдчилгааны хэмжээгээр бага гардаг байв. Одоо дараалал дагуу бүх дүнтэй
   *    мөрийг нэмнэ (урьдчилгаа эхэнд тул гүйцэтгэлийн мөрийн хуримтлал = урьдчилгаа + `PayRow.cum`);
   *    урьдчилгааны мөр ч ӨӨРИЙН хуримтлалтай. `PayRow.cum`-ийг ӨӨРЧЛӨХГҮЙ (`ipcLink`-ийн зөрүү үүнээс).
   *    «гэрээний %» = тухайн мөрийн хуримтлал ÷ ТУХАЙН гэрээний гэрээт дүн (тодорхой, > 0 үед).
   */
  const payLog = useMemo(() => (r.ipc?.contracts ?? []).flatMap((c) => {
    const tot = c.contractTotal != null && c.contractTotal > 0 ? c.contractTotal : null;
    let acc = 0;
    return payRows(c.pays)
      .filter((x) => x.amount != null)
      .map((x) => {
        acc += x.amount ?? 0;
        return { x, cum: acc, contract: c.code, ofContract: tot != null ? (acc / tot) * 100 : null };
      });
  }), [r.ipc]);
  const l1 = useMemo(() => level1Rows(m.rows.filter((x) => x.p.key === r.p.key), onOpen, r.p.key), [m.rows, r.p.key, onOpen]);
  const dom = ganttDomain([
    { start: r.p.start, end: r.p.end, extra: [r.commission, ...(derived?.l3.flatMap((g) => [g.start ?? null, g.end ?? null]) ?? [])] },
  ], now);

  return (
    <>
      <nav className={s.crumbs}>
        <button type="button" className={s.rowLink} onClick={onBack}>← {tr('Бүх багц руу')}</button>
        <span>/ {groupLabel(r.p.group)}</span>
      </nav>

      <header className={s.titleBlock}>
        <div className={s.tbMain}>
          <span className={s.tbCode}>{r.p.code}</span>
          <div>
            <h1>{r.p.name || '—'}</h1>
            <div className={s.chips}>
              <StatusChip st={r.status} />
              <span className={s.chip}>{tr('Сүүлд тайлагнасан')} <ReportAge r={r} /></span>
            </div>
          </div>
        </div>
        <dl className={s.tbGrid}>
          <div><dt>{tr('Гэрээний нийт дүн')}</dt><dd>{mnt(r.p.cost)}</dd></div>
          <div><dt>{tr('Гэрээт хугацаа')}</dt><dd>{date(r.p.start)} – {date(r.p.end)}</dd></div>
          <div><dt>{tr('Ерөнхий гүйцэтгэгч')}</dt><dd>{r.p.contractor || '—'}</dd></div>
          <div><dt>{tr('Гэрээт байгууллага')}</dt><dd>—</dd></div>
          <div><dt>{tr('Захиалагчийн хяналт')}</dt><dd>{r.p.client || '—'}</dd></div>
          <div><dt>{tr('Хяналтын баг')}</dt><dd>—</dd></div>
        </dl>
      </header>

      <div className={s.stats} style={{ marginTop: 8 }}>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('Нийт гүйцэтгэл')}</span>
          <span className={s.statValue}>{pct(r.progress, 2)}</span>
          <Meter value={r.progress} plan={r.planContract} />
          <span className={s.statNote}>{tr('Гэрээний төлөвлөгөө {0}', lz(m, 'cfPlan')(pct(r.planContract)))}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('7 хоногийн ахиц')}</span>
          <span className={s.statValue}>{lz(m, 'hist')(pp(r.week))}</span>
          <span className={s.statNote}>{tr('Өнгөрсөн 7 хоногийн төлөвлөгөө: {0}', '—')}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('Гүйцэтгэгчийн төлөвлөгөөнөөс')}</span>
          <span className={`${s.statValue} ${gapTone(r.gapContractor)}`}>{lz(m, 'plan')(pp(r.gapContractor))}</span>
          <span className={s.statNote}>{tr('SPI (гүйцэтгэгч) {0}', lz(m, 'plan')(r.ev.spiContractor == null ? '—' : num(r.ev.spiContractor, 2)))}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('Гэрээний төлөвлөгөөнөөс')}</span>
          <span className={`${s.statValue} ${gapTone(r.gapContract)}`}>{lz(m, 'cfPlan')(pp(r.gapContract))}</span>
          <span className={s.statNote}>{tr('SPI (гэрээ) {0}', lz(m, 'cfPlan')(r.ev.spiContract == null ? '—' : num(r.ev.spiContract, 2)))}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('Хүн хүч')}</span>
          {/* ⚠️ 2026-09-30: багц ХАБЭА-д холбоотой бол ЗӨВХӨН ХАБЭА (тайлангүй → «—»); хуваарийн
              ТӨЛӨВЛӨСӨН нөөцийн нийлбэрийг (`resourcesOf`) бодит тоо мэт орлуулахгүй */}
          {/* ⚠️ 2026-10-06 (аудит): ХАБЭА ачаалж байхад «…» — урьд нь энэ хооронд ТӨЛӨВЛӨСӨН
              нөөц (`resourcesOf`) бодит мэт гараад, ХАБЭА ирэхэд өөр тоо руу үсэрдэг байв. ХАБЭА-д
              холбоогүй багцад хуваарийн нөөц рүү буцна — тэр үед «төлөвлөсөн» гэж ИЛ шошголно. */}
          <span className={s.statValue}>
            {r.workerDays.length ? num(r.workers) : wfWait ? '…' : schedWait(num(derived?.hun ?? null))}
            <small>{tr('хүн')}{!r.workerDays.length && !wfWait && derived?.hun != null ? ` · ${tr('төлөвлөсөн')}` : ''}</small>
          </span>
          <span className={s.statNote}>{tr('шууд / шууд бус: {0}', '—')}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('Машин, техник')}</span>
          <span className={s.statValue}>
            {r.workerDays.length ? num(r.technik) : wfWait ? '…' : schedWait(num(derived?.mashin ?? null))}
            <small>{tr('нэгж')}{!r.workerDays.length && !wfWait && derived?.mashin != null ? ` · ${tr('төлөвлөсөн')}` : ''}</small>
          </span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('Гэрээт хугацаа')}</span>
          <span className={`${s.statValue} ${left != null && left < 0 ? s.bad : ''}`}>
            {left == null ? '—' : left >= 0 ? num(left) : num(-left)}<small>{left != null && left < 0 ? tr('хоног хэтэрсэн') : tr('хоног')}</small>
          </span>
          <span className={s.statNote}>{tr('гэрээ дуусахад · {0}', pct(elapsed, 0))}</span>
        </div>
      </div>

      <nav className={s.secNav} aria-label={tr('Хэсгүүд')}>
        {nav.map(([id, label]) => <button key={id} type="button" onClick={() => go(id)}>{label}</button>)}
      </nav>

      {/* ── Тойм ── */}
      <Section id="tuh-overview" title={tr('Одоо хаана байна')}>
        <div className={s.panels}>
          <div className={s.panel}>
            <h3>{tr('Гол үе шат')}</h3>
            {!hasSheets ? <p className={s.note}>—</p> : schedQ.state === 'loading' ? <p className={s.note}>{tr('Ачаалж байна…')}</p>
              : schedQ.state === 'error' ? schedFail
                : derived && derived.milestones.length ? (
                  <ol className={s.milestones}>
                    {derived.milestones.map((ms, i) => (
                      <li key={i} data-past={ms.end != null && ms.end < today}><span>{date(ms.end)}</span><span>{ms.name}</span></li>
                    ))}
                  </ol>
                ) : <p className={s.note}>—</p>}
            <div className={s.elapsed}><span>{tr('Гэрээт хугацаа')}</span><Meter value={elapsed} tone="mute" /><span className={s.num}>{pct(elapsed, 0)}</span></div>
            <div className={s.elapsed}><span>{tr('Нийт гүйцэтгэл')}</span><Meter value={r.progress} /><span className={s.num}>{pct(r.progress)}</span></div>
          </div>
          <div className={s.panel}>
            <h3>{tr('Digital twin холбоос')}</h3>
            <dl className={s.kv}>
              <dt>{tr('GIS давхарга')}</dt><dd>{housing ? tr('Барилга (блок)') : layerTitles.length ? layerTitles.join(', ') : '—'}</dd>
              <dt>{tr('BIM/IFC загвар')}</dt><dd>—</dd>
              <dt>ID</dt><dd>{r.p.pkgKey || '—'}</dd>
            </dl>
          </div>
        </div>
      </Section>

      {/* ── Хуваарь ── */}
      <Section id="tuh-schedule" title={tr('Хуваарь')} lead={tr('Level 1 — мастер, Level 2 — багц, Level 3 — ажлын («Хуваарь» хэсгийн мөрүүд), Level 4 — 7 хоногийн төлөвлөгөө.')}>
        <ol className={s.levels}>
          <li><b>L1</b>{tr('Мастер хуваарь')}</li>
          <li><b>L2</b>{tr('Багцын хуваарь')}</li>
          <li><b>L3</b>{tr('Дэлгэрэнгүй хуваарь')}</li>
          <li><b>L4</b>{tr('7 хоногийн төлөвлөгөө')}</li>
        </ol>
        <h3>{tr('Level 2 — Багцын хуваарь')}</h3>
        <Card>
        <GanttLegend />
        <Gantt
          rows={[
            {
              key: 'main', label: <b>{r.p.code}</b>, start: r.p.start, end: r.p.end, progress: r.progress,
              st: barSt(r.status),
              thin: derived?.finish != null ? { start: r.p.start, end: derived.finish } : null,
              marks: r.commission != null ? [{ at: r.commission, kind: 'commission', label: tr('Улсын комисс') }] : [],
            },
            ...(derived?.milestones ?? []).map((ms, i) => ({
              key: `ms${i}`, label: ms.name, start: ms.start, end: ms.end, progress: ms.act == null ? null : ms.act * 100,
              st: ms.start != null && ms.end != null ? planStatus({ start: ms.start, end: ms.end }, ms.act, today) : 'none' as const,
            })),
          ]}
          from={dom.from} to={dom.to} now={now}
        />
        </Card>
        <div className={s.tableWrap} style={{ marginTop: 8 }}>
          <table className={s.table}>
            <caption className={s.note} style={{ textAlign: 'left', padding: '6px 8px' }}>{tr('Дэд багцууд, гэрээт байгууллага')}</caption>
            <thead>
              <tr>
                <th>{tr('Код')}</th><th>{tr('Ажлын нэр')}</th><th>{tr('Гүйцэтгэгч')}</th>
                <th className={s.num}>{tr('Дүн')}</th><th>{tr('Дуусах')}</th><th className={s.num}>{tr('Гүйц.')}</th><th>{tr('Төлөв')}</th>
              </tr>
            </thead>
            <tbody>
              {r.p.rows.map((c, i) => {
                const C = CASHFLOW_NEW.fields;
                const F = { pkg: C.pkg, name: C.detail, contractor: C.contractor, cost: C.budget, end: C.endDate, note: C.amountNote };
                const one = r.p.rows.length === 1;
                /* ⚠️ 2026-10-01: зураг төслийн мөрд шатны талбар (`tuhData.rowProgress`) — барилгын
                   `guitsetgel_huvi` биш; хоосон бол «Мэдээлэлгүй» (`statusOf`-ийн `nullAs`) */
                const pr = one ? r.progress : rowProgress(r.p.group, c);
                const st = one ? r.status : tuhStatus({
                  /* ⚠️ 2026-10-09: порталын НЭГ дүрэм (`gdash.isContracted` — дотоод зай нэгтгэнэ) */
                  contracted: isContracted(c), progress: pr, gap: null,
                  nullAs: r.p.group === 'design' ? 'unknown' : 'todo',
                });
                return (
                  <tr key={i}>
                    <td>{String(c[F.pkg] ?? '—')}</td>
                    <td>{String(c[F.name] ?? '—')}<small>{String(c[F.note] ?? '')}</small></td>
                    <td>{String(c[F.contractor] ?? '') || tr('Гэрээлээгүй')}</td>
                    <td className={s.num}>{mnt(numOf(c[F.cost]))}</td>
                    <td>{date(numOf(c[F.end]))}</td>
                    <td className={s.num}>{pct(pr)}</td>
                    <td><StatusChip st={st} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3>{tr('Level 3 — Дэлгэрэнгүй хуваарь')}</h3>
        {!hasSheets ? <p className={s.note}>—</p>
          : schedQ.state === 'loading' ? <p className={s.note}>{tr('Ачаалж байна…')}</p>
            : schedQ.state === 'error' ? schedFail
              : derived && derived.l3.length ? (
                <Card>
                  <Legend items={GANTT_LEGEND()} />
                  <Gantt rows={derived.l3} from={dom.from} to={dom.to} now={now} />
                </Card>
              ) : <p className={s.note}>—</p>}
        <h3>{tr('Level 4 — 7 хоногийн төлөвлөгөө')}</h3>
        <div className={s.chips} style={{ marginBottom: 6 }}>
          <span className={s.chip}>PPC —</span>
          <span className={s.chip}>{tr('Шийдэгдээгүй саад {0}', '—')}</span>
        </div>
        <div className={s.weeks}>
          <div className={s.week}><b>{tr('Өнгөрсөн 7 хоног')}</b>—</div>
          <div className={s.week}><b>{tr('Энэ 7 хоног')}</b>—</div>
          <div className={s.week}><b>{tr('+1 долоо хоног')}</b>—</div>
          <div className={s.week}><b>{tr('+2 долоо хоног')}</b>—</div>
        </div>
        <h3>{tr('Level 1 — Мастер хуваарь')}</h3>
        <Card>
          <Gantt rows={l1} from={dom.from} to={dom.to} now={now} />
        </Card>
      </Section>

      {/* ── Гүйцэтгэл ── */}
      <Section id="tuh-progress" title={tr('S-curve — хуримтлагдсан гүйцэтгэл')}>
        {/* ⚠️ 2026-10-09: ачаалж/унасан муруй «дата алга» биш (`TuhRow.planFailed` — ЗӨВХӨН энэ багцынх) */}
        <ProgChart months={r.prog} title={tr('Гүйцэтгэлийн явц')} loading={m.loading.has('plan')} planFailed={r.planFailed} />
        {/* ⚠️ «ХАБЭА»-гийн «Ажилтан — өдрөөр»-тэй ИЖИЛ `ui.Series` (line + утга). Тайлангүй өдөр
            0 БИШ (null ≠ 0) — 0 цэгээр «ажилтангүй» гэж худал харуулахгүй. */}
        {/* ⚠️ 2026-10-09: тайлангүй өдрийг ХАСАХГҮЙ — ЦООРХОЙ (`Series.lines`-ийн `null`). Урьд нь шүүгдэж
            хасагддаг тул тэнхлэг хуанлиа алдаж, 3 хоногийн завсар хөрш өдрүүд мэт нийлж зурагддаг байв. */}
        {(() => {
          const days = r.workerDays;
          const reported = days.some((d) => d.value != null);
          /* `value` нь ЗӨВХӨН тэнхлэг/дарах талбайд — `lines` өгөгдсөн үед муруй, масштаб, hover нь `lines`-ээс */
          const items = days.map((d) => ({ key: d.key, label: d.key.slice(5).replace('-', '.'), value: d.value ?? 0 }));
          const lines: SeriesLineDef[] = [{ key: 'workers', label: tr('ажилтан'), color: 'var(--c1)', values: days.map((d) => d.value) }];
          return (
            <Card title={tr('Ажилтан — өдрөөр')} note={reported ? tr('ХАБЭА-гийн өдрийн тайлан — сүүлийн {0} өдөр', num(days.length)) : undefined}>
              {reported ? <Series items={items} height={110} line lines={lines} showValues /> : <p className={s.note}>—</p>}
            </Card>
          );
        })()}
        <h3>{tr('EV ба PV')}</h3>
        <div className={s.stats}>
          {([
            ['EV', mnt(r.ev.ev)],
            [tr('PV (гэрээ)'), lz(m, 'cfPlan')(mnt(r.ev.pvContract))],
            [tr('PV (гүйцэтгэгч)'), lz(m, 'plan')(mnt(r.ev.pvContractor))],
            [tr('SV (гэрээ)'), lz(m, 'cfPlan')(r.ev.svContract == null ? '—' : `${r.ev.svContract < 0 ? '−' : ''}${mnt(Math.abs(r.ev.svContract))}`)],
            [tr('SPI (гэрээ)'), lz(m, 'cfPlan')(r.ev.spiContract == null ? '—' : num(r.ev.spiContract, 2))],
            [tr('SPI (гүйцэтгэгч)'), lz(m, 'plan')(r.ev.spiContractor == null ? '—' : num(r.ev.spiContractor, 2))],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className={s.stat}><span className={s.statLabel}>{k}</span><span className={s.statValue} style={{ fontSize: '1rem' }}>{v}</span></div>
          ))}
        </div>
        <p className={s.note}>{tr('EV = гэрээний дүн × биет гүйцэтгэл; PV = гэрээний дүн × төлөвлөгөөт гүйцэтгэл; SPI = EV ÷ PV.')}</p>
      </Section>

      {/* ── Ашиглалт / Хамааралтай ── */}
      {housing ? (
        <Section id="tuh-commissioning" title={tr('Улсын комисст бэлэн байдал')}>
          <div className={s.flow}>
            <div>
              <span className={s.stepNo}>{tr('1 · Урьдчилсан нөхцөл')}</span>
              <div className={s.lanes}>
                {PREREQ_LANES.map((l) => (
                  <div key={l.group} className={s.lane}>
                    <b>{l.label()}</b>
                    <DepList rows={upRows && upRows.filter((x) => x.p.group === l.group)} loading={depsWait} onOpen={onOpen} />
                  </div>
                ))}
                {/* Дөрвөн эгнээнд багтаагүй бүлгийн урд талын багц (нийгмийн дэд бүтэц, бусад, зураг төсөл) */}
                {(() => {
                  const rest = upRows?.filter((x) => !PREREQ_LANES.some((l) => l.group === x.p.group)) ?? [];
                  return rest.length ? (
                    <div className={s.lane}><b>{tr('Бусад')}</b><DepList rows={rest} loading={false} onOpen={onOpen} /></div>
                  ) : null;
                })()}
              </div>
            </div>
            <div className={s.flowArrow}>→</div>
            <div className={s.panel}>
              <span className={s.stepNo}>{tr('2 · Гол багц')}</span>
              <b>{r.p.code}</b>
              <dl className={s.kv}>
                <dt>{tr('Нийт гүйцэтгэл')}</dt><dd>{pct(r.progress)}</dd>
                <dt>{tr('Гэрээт дуусах')}</dt><dd>{date(r.p.end)}</dd>
                <dt>{tr('Барилга дуусах (гүйцэтгэгчийн төлөвлөгөө)')}</dt><dd>{schedWait(date(derived?.finish ?? null))}</dd>
                <dt>{tr('Гэрээний төлөвлөгөөнөөс')}</dt><dd>{lz(m, 'cfPlan')(pp(r.gapContract))}</dd>
              </dl>
            </div>
          </div>
          <div className={s.commission}>
            <span className={s.stepNo}>{tr('3 · Улсын комисс')}</span>
            <dl className={s.kv}>
              <dt>{tr('Гэрээт дуусах')}</dt><dd>{date(r.p.end)}</dd>
              <dt>{tr('Хамгийн эрт ашиглалтад')}</dt><dd><b>{commissionText(m, r)}</b></dd>
              <dt>{tr('Хоцролт')}</dt><dd className={r.delay != null && r.delay > 0 ? s.bad : ''}>{lz(m, 'commission')(r.delay == null ? '—' : tr('{0} хоног', `${r.delay > 0 ? '+' : ''}${num(r.delay)}`))}</dd>
            </dl>
          </div>
          <p className={s.note}>
            {tr('Огноо нь «Хуваарь» хэсгийн «Улсын комисс» мөрөөс. Салбар багцууд «Багцын хамаарал» хэсэгт бүртгэсэн холбоосоос; «—» — холбоо бүртгээгүй.')}
            {depsLink}
          </p>
        </Section>
      ) : (
        /* ⚠️ 2026-10-01: эх сурвалжгүй — хураагдсан (`Section empty`) */
        /* ⚠️ 2026-10-06 (аудит): эх нь «Багцын хамаарал» — энэ багцаас ХАМААРДАГ (ард талын)
           багцууд (орон сууц эхэнд). Холбоогүй бол хураагдсан хэвээр. */
        <Section id="tuh-dependents" title={tr('Хамааралтай орон сууц')} empty={!downRows?.length && !depsWait}>
          <p className={s.note}>
            <DepList
              rows={downRows && [...downRows].sort((a, b) => Number(b.p.group === 'housing') - Number(a.p.group === 'housing'))}
              loading={depsWait}
              onOpen={onOpen}
            />
          </p>
          <p className={s.note}>{tr('«Багцын хамаарал» хэсэгт бүртгэсэн холбоосоос.')}{depsLink}</p>
        </Section>
      )}

      {/* ── Зураг ── (эх сурвалжгүй — хураагдсан) */}
      <Section id="tuh-drawings" title={tr('Зураг')} empty>
        <p className={s.note}>—</p>
      </Section>

      {/* ── Материал ── (MA/MIR алга, ачаалж дууссан бол хураагдсан) */}
      <Section id="tuh-materials" title={tr('Материалын хуваарь, төлөв')}
        empty={!r.docs.some((d) => d.kind === 'MA' || d.kind === 'MIR') && !m.loading.has('docs')}>
        <h3>{tr('Материалын 3-6-9 долоо хоногийн төлөвлөгөө')}</h3>
        <div className={s.weeks}>
          <div className={s.week}><b>{tr('Хугацаа хэтэрсэн')}</b>—</div>
          <div className={s.week}><b>{tr('3 долоо хоног')}</b>—</div>
          <div className={s.week}><b>{tr('6 долоо хоног')}</b>—</div>
          <div className={s.week}><b>{tr('9 долоо хоног')}</b>—</div>
        </div>
        <h3>{tr('MA / MIR')}</h3>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>{tr('Төрөл')}</th><th>{tr('Дугаар / хувилбар')}</th><th>{tr('Нэр')}</th><th>{tr('Ирүүлсэн')}</th><th>{tr('Шийдвэрлэсэн')}</th><th>{tr('Төлөв')}</th></tr></thead>
            <tbody>
              {r.docs.filter((d) => d.kind === 'MA' || d.kind === 'MIR').map((d) => (
                <tr key={d.oid}>
                  <td>{d.kind}</td><td>{d.docNo}</td><td>{d.title || '—'}</td>
                  <td>{date(d.sentAt)}</td><td>{date(d.decidedAt)}</td>
                  <td><span className={s.chip} data-tone={d.status === MS_STATUS.approved ? 'good' : d.status === MS_STATUS.returned ? 'bad' : 'warn'}>{statusLabel(d.kind, d.status)}</span></td>
                </tr>
              ))}
              {!r.docs.some((d) => d.kind === 'MA' || d.kind === 'MIR') && <EmptyRow cols={6} loading={m.loading.has('docs')} />}
            </tbody>
          </table>
        </div>
        <h3>{tr('Материалын хуваарь, төлөв')}</h3>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>
              <th>{tr('Материал')}</th><th>{tr('Нэгж')}</th><th className={s.num}>{tr('Хэрэгцээ')}</th><th className={s.num}>{tr('Захиалсан')}</th>
              <th className={s.num}>{tr('Ирсэн')}</th><th className={s.num}>{tr('Суурилуулсан')}</th><th>{tr('Нийлүүлэгч / PO')}</th>
              <th>{tr('Талбайд байх')}</th><th>{tr('Нийлүүлэх')}</th><th>{tr('Төлөв')}</th>
            </tr></thead>
            <tbody><EmptyRow cols={10} /></tbody>
          </table>
        </div>
        <h3>{tr('Материалын түүврийн төлөв')}</h3>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>
              <th>{tr('Материал')}</th><th>{tr('Ирүүлсэн')}</th><th>{tr('Хянагч')}</th><th>{tr('Одоо хэн дээр')}</th>
              <th>{tr('Хариу өгөх')}</th><th>{tr('Шийдвэрлэсэн')}</th><th className={s.num}>{tr('Хоног')}</th><th>{tr('Төлөв')}</th>
            </tr></thead>
            <tbody><EmptyRow cols={8} /></tbody>
          </table>
        </div>
      </Section>

      {/* ── Төлбөр (IPC) ── */}
      <Section id="tuh-payments" title={tr('Явцын төлбөрийн гэрчилгээ (IPC)')}>
        <div className={s.stats}>
          <div className={s.stat}>
            <span className={s.statLabel}>{tr('Гэрээний дүн')}</span>
            <span className={s.statValue}>{mnt(r.ipc?.contractTotal ?? null)}</span>
            <span className={s.statNote}>{r.ipc && r.ipc.contracts.length > 1 ? tr('{0} гэрээ', num(r.ipc.contracts.length)) : (r.ipc?.contracts[0]?.contractNo || '—')}</span>
          </div>
          <div className={s.stat}>
            <span className={s.statLabel}>{tr('Олгосон санхүүжилт')}</span>
            <span className={s.statValue}>{mnt(r.ipc?.paid ?? null)}</span>
            <Meter value={r.ipc?.paidPct ?? null} plan={r.progress} />
            <span className={s.statNote}>
              {tr('{0} гэрээний · биет гүйцэтгэл {1}', pct(r.ipc?.paidPct ?? null), pct(r.progress))}
              {/* ⚠️ 2026-10-01: хувьд ороогүй олголт тусад нь («IPC» хуудастай ижил) */}
              {r.ipc?.paidOther != null && r.ipc.paidOther !== 0 && <> · {tr('гэрээт дүн тодорхойгүй гэрээнд олгосон {0} (хувьд ороогүй)', mnt(r.ipc.paidOther))}</>}
            </span>
          </div>
          <div className={s.stat}>
            <span className={s.statLabel}>{tr('Урьдчилгаа')}</span>
            <span className={s.statValue}>{mnt(r.ipc?.advance ?? null)}</span>
          </div>
          <div className={s.stat}>
            <span className={s.statLabel}>{tr('Олгосон IPC')}</span>
            <span className={s.statValue}>{num(r.ipc?.ipcNos.length ?? null)}</span>
            <span className={s.statNote}>{r.ipc?.lastIpc != null ? `IPC-${r.ipc.lastIpc} · ${r.ipc.lastPaidDate ?? '—'}` : '—'}</span>
          </div>
          <div className={s.stat}>
            <span className={s.statLabel}>{tr('Хүлээгдэж буй')}</span>
            <span className={s.statValue}>{r.ipc?.pending == null ? '—' : mnt(r.ipc.pending)}</span>
          </div>
        </div>
        <h3>{tr('Санхүүжилтийн явц')}</h3>
        {r.months?.length ? (
          <ComboChart
            items={r.months}
            height={280}
            lagMonth={r.lag?.month}
            lagLvl={r.lag ? lagLevel(r.lag.gap) : null}
            contract={r.p.cost != null && r.p.cost > 0 ? r.p.cost : null}
          />
        ) : <p className={s.note}>—</p>}
        <p className={s.note}>{tr('Төлөвлөсөн IPC-ийн хуваарь системд бүртгэгдээгүй.')}</p>
        <h3>{tr('Олголтын бүртгэл')}</h3>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>
              {(r.ipc?.contracts.length ?? 0) > 1 && <th>{tr('Код')}</th>}
              <th>{tr('Төрөл')}</th><th>{tr('Олгосон огноо')}</th><th className={s.num}>{tr('Дүн')}</th>
              <th className={s.num}>{tr('Хуримтлагдсан')}</th><th className={s.num}>{tr('гэрээний %')}</th>
            </tr></thead>
            <tbody>
              {payLog.map(({ x, cum, contract, ofContract }, i) => (
                <tr key={i}>
                  {(r.ipc?.contracts.length ?? 0) > 1 && <td>{contract || '—'}</td>}
                  <td><span className={s.chip} data-tone={x.advance ? 'mute' : 'good'}>{x.code}</span></td>
                  <td>{String(x.date ?? '').slice(0, 10) || '—'}</td>
                  <td className={s.num}>{mnt(x.amount)}</td>
                  <td className={s.num}>{mnt(cum)}</td>
                  <td className={s.num}>{pct(ofContract)}</td>
                </tr>
              ))}
              {!payLog.length && <EmptyRow cols={(r.ipc?.contracts.length ?? 0) > 1 ? 6 : 5} />}
            </tbody>
          </table>
        </div>
        <h3>{tr('Гэрээ, санхүүжилтийн эх үүсвэр')}</h3>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>
              <th>{tr('Код')}</th><th>{tr('Гүйцэтгэгч')}</th><th>{tr('Гэрээ / захирамж')}</th>
              <th className={s.num}>{tr('Батлагдсан төсөв')}</th><th className={s.num}>{tr('Гэрээний дүн')}</th><th className={s.num}>{tr('Хэмнэлт')}</th>
              <th className={s.num}>{tr('Нийслэлийн төсөв')}</th><th className={s.num}>{tr('Борлуулалтын орлого')}</th><th className={s.num}>{tr('Хүлээгдэж буй')}</th>
            </tr></thead>
            <tbody>
              {(r.ipc?.contracts ?? []).map((c) => {
                /* ⚠️ 2026-09-30: `c.pays[0]` (толгой мөр) БИШ — `tuhData.firstFilled`-ийн ⚠️ */
                const CF = HO_IPC.contractFields;
                const pick = (k: string) => firstFilled(c.pays, k);
                const pend = c.pays.flatMap((p) => Object.values(HO_PENDING).map((f) => numOf(p[f]))).filter((x): x is number => x != null);
                return (
                  <tr key={`${c.code}|${c.contractNo}`}>
                    <td>{c.code || '—'}</td>
                    <td>{c.contractor || '—'}</td>
                    <td>{c.contractNo || '—'}<small>{[pick(CF.order1No), pick(CF.order2No), pick(CF.order3No)].filter(Boolean).join(' · ')}</small></td>
                    <td className={s.num}>{mnt(c.budgetTotal)}</td>
                    <td className={s.num}>{mnt(c.contractTotal)}</td>
                    <td className={s.num}>{mnt(c.saving)}</td>
                    <td className={s.num}>{mnt(numOf(pick(CF.budgetCity)))}</td>
                    <td className={s.num}>{mnt(numOf(pick(CF.budgetSales)))}</td>
                    <td className={s.num}>{pend.length ? mnt(pend.reduce((a, b) => a + b, 0)) : '—'}</td>
                  </tr>
                );
              })}
              {!r.ipc && <EmptyRow cols={9} />}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Асуудал ── */}
      {/* ⚠️ 2026-10-01: эх сурвалжгүй — хураагдсан */}
      <Section id="tuh-issues" title={tr('Асуудал')} empty>
        <div className={s.three}>
          <div className={s.panel}><h3>{tr('Өнгөрсөн 7 хоногийн ололт')}</h3><p className={s.note}>—</p></div>
          <div className={s.panel} data-tone="bad"><h3>{tr('Тулгамдсан асуудал')}</h3><p className={s.note}>—</p></div>
          <div className={s.panel}><h3>{tr('Дараа 7 хоногийн төлөвлөгөө')}</h3><p className={s.note}>—</p></div>
        </div>
      </Section>
    </>
  );
}
