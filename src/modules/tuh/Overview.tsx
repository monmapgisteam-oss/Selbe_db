'use client';

/**
 * ТУХ — ТОЙМ ХУУДАС. Жишээ HTML-ийн ДАРААЛАЛ (бүтэц алдагдуулахгүй):
 *   hero → KPI → Улсын комисст бэлэн байдал → IPC-ийн явц → Багцууд →
 *   S-curve → Level 1 мастер хуваарь → Материал → ТУХ-ын арга хэмжээ → Журмууд.
 *
 * ⚠️ Бүх тоо `TuhModel`-оос (системийн эх сурвалж). Эх сурвалжгүй багана/хэсэг
 *    бүтцээрээ үлдэж «—» харуулна (хэрэглэгчийн сонголт, 2026-09-30).
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): БҮХЭЛДЭЭ хоосон хэсэг (ТУХ-ын арга хэмжээ,
 *    захирамжгүй журам, MA/MIR-гүй материал) ХУРААГДСАН (`Section empty`) — бүтэц нь
 *    `<details>` дотор хэвээр, дарахад нээгдэнэ. Ачаалж буй тоо «…» (`model.lz`).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num, pct, mnt, date } from '@/lib/format';
import {
  TUH_GROUPS, TUH_STATUS, TUH_STALE_DAYS, statusMeta, matchesSearch, lateFirst, heatWinterYear, daysBetween,
  type TuhGroup, type TuhStatus,
} from '@/lib/tuhData';
import { lz, type TuhModel, type TuhRow } from './model';
import { Meter, Legend, Gantt, type GanttRow } from './charts';
/* ⚠️ Системийн «Гүйцэтгэлийн явц» график — ТУХ өөрийн график зурахгүй (2026-09-30,
   хэрэглэгч: «чартуудыг үндсэн системтэй адилхан»). */
import { ProgChart } from '@/modules/PkgProg';
import s from '../tuh.module.css';

const pp = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${num(v, 1)} pp`);

export function StatusChip({ st }: { st: TuhStatus }) {
  const m = statusMeta(st);
  return <span className={s.chip} data-tone={m.tone}>{m.icon} {m.label()}</span>;
}

/**
 * Хэсэг. `empty` — агуулга нь БҮХЭЛДЭЭ эх сурвалжгүй/хоосон: гарчиг + «Мэдээлэл алга» мөр
 * болж ХУРААГДАНА; бүтэц (хүснэгтийн толгой) нь `<details>` дотор, дарахад нээгдэнэ.
 * ⚠️ 2026-10-01: урьд нь хоосон хүснэгт бүтнээрээ зурагдаж хуудсыг уртасгадаг байв.
 */
export function Section({ id, title, lead, actions, empty, children }: {
  id: string; title: string; lead?: string; actions?: ReactNode; empty?: boolean; children: ReactNode;
}) {
  if (empty) {
    return (
      <section id={id} className={s.section}>
        <details className={s.collapsed}>
          <summary>
            <h2>{title}</h2>
            <span className={s.collapsedNote}>{tr('Мэдээлэл алга')}</span>
          </summary>
          {lead && <p className={s.lead}>{lead}</p>}
          {children}
        </details>
      </section>
    );
  }
  return (
    <section id={id} className={s.section}>
      <header className={s.sectionHead}>
        <div>
          <h2>{title}</h2>
          {lead && <p className={s.lead}>{lead}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Хоосон мөр — эх сурвалжгүй хүснэгтэд бүтэц үлдээнэ. `loading` — ачаалж буй бол «…» */
export function EmptyRow({ cols, loading }: { cols: number; loading?: boolean }) {
  return <tr className={s.emptyRow}><td colSpan={cols}>{loading ? '…' : '—'}</td></tr>;
}

/** Сүүлд тайлагнасан огноо — `TUH_STALE_DAYS`-ээс удсан бол тодруулна */
export function ReportAge({ r }: { r: Pick<TuhRow, 'lastReport' | 'reportAge'> }) {
  const stale = r.reportAge != null && r.reportAge >= TUH_STALE_DAYS;
  return (
    <span className={stale ? s.stale : undefined} title={stale ? tr('{0}+ хоног тайлангүй', num(TUH_STALE_DAYS)) : undefined}>
      {r.lastReport ?? '—'}
      {r.reportAge != null && <small> · {tr('{0} хоногийн өмнө', num(r.reportAge))}</small>}
    </span>
  );
}

/** Level 1 гантт — багцын мөрүүд бүлгээр */
export function level1Rows(rows: TuhRow[], onOpen: (k: string) => void, active?: string): GanttRow[] {
  const out: GanttRow[] = [];
  for (const g of TUH_GROUPS) {
    const mine = rows.filter((r) => r.p.group === g.key);
    if (!mine.length) continue;
    out.push({ key: `h:${g.key}`, label: g.label(), heading: true });
    for (const r of mine) {
      out.push({
        key: r.p.key,
        label: <><b>{r.p.code}</b> {r.p.name}</>,
        start: r.p.start,
        end: r.p.end,
        progress: r.progress,
        tone: statusMeta(r.status).tone,
        marks: r.commission != null ? [{ at: r.commission, kind: 'commission', label: tr('Улсын комисс') }] : [],
        onClick: () => onOpen(r.p.key),
        active: active === r.p.key,
      });
    }
  }
  return out;
}

export function ganttDomain(rows: { start: number | null; end: number | null; extra?: (number | null)[] }[], now: number) {
  let from = now;
  let to = now;
  for (const r of rows) {
    for (const v of [r.start, r.end, ...(r.extra ?? [])]) {
      if (v == null) continue;
      if (v < from) from = v;
      if (v > to) to = v;
    }
  }
  const a = new Date(from);
  const b = new Date(to);
  return { from: Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1), to: Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 1) };
}

export function GanttLegend() {
  return (
    <Legend items={[
      { key: 'bar', label: tr('Гэрээт хугацаа'), color: 'var(--data)', box: true },
      { key: 'fill', label: tr('Нийт гүйцэтгэл'), color: 'var(--ink-2)', box: true },
      { key: 'com', label: tr('Улсын комисс'), color: 'var(--data)', diamond: true },
      { key: 'heat', label: tr('Дулаан авах'), color: 'var(--bad)', diamond: true },
      { key: 'win', label: tr('Өвөл'), color: 'var(--sunken)', box: true },
    ]} />
  );
}

export function Overview({ m, contractTotal, onOpen }: {
  m: TuhModel;
  /** «Гэрээний нийт дүн» — `loadBudget().contract` (бусад харагдацтай ижил эх) */
  contractTotal: number | null;
  onOpen: (key: string) => void;
}) {
  const [grp, setGrp] = useState<TuhGroup | 'all'>('all');
  const [q, setQ] = useState('');
  /* ⚠️ 2026-10-01: төлвийн шүүлт — KPI-ийн «Багцын төлөв»-ийн тоон дээр дарж тавина */
  const [st, setSt] = useState<TuhStatus | null>(null);
  const now = m.now;
  const housing = m.rows.filter((r) => r.p.group === 'housing');
  /* ⚠️ 2026-09-30: барилгын давхарга ирээгүй/унасан бол «—» (0 биш) — `TuhRow.blocks`-ийн ⚠️ */
  const households = housing.some((r) => r.households == null) ? null : housing.reduce((a, r) => a + (r.households ?? 0), 0);
  const blocks = housing.some((r) => r.blocks == null) ? null : housing.reduce((a, r) => a + (r.blocks ?? 0), 0);

  /* ⚠️ 2026-10-01: хайлт нормалчилсан (`tuhData.matchesSearch` — «багц 5.1» = «БАГЦ-5.1» =
     «bagts 5.1»), төлвөөр шүүнэ, «Хоцорсон» ЭХЭНД (`lateFirst`) */
  const shown = useMemo(() => lateFirst(m.rows.filter((r) => (grp === 'all' || r.p.group === grp)
    && (st == null || r.status === st)
    && matchesSearch(q, r.p.code, [r.p.name, r.p.contractor]))), [m.rows, grp, st, q]);
  const pickStatus = (k: TuhStatus) => {
    setSt((cur) => (cur === k ? null : k));
    document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const heatYear = heatWinterYear(m.today);

  const l1 = useMemo(() => level1Rows(m.rows, onOpen), [m.rows, onOpen]);
  const dom = ganttDomain(m.rows.map((r) => ({ start: r.p.start, end: r.p.end, extra: [r.commission] })), now);
  const orders = useMemo(() => {
    const by = new Map<string, { no: string; date: number | null; codes: string[] }>();
    for (const r of m.rows) for (const o of r.p.orders) {
      const k = `${o.no}|${o.date ?? ''}`;
      const cur = by.get(k) ?? { no: o.no, date: o.date, codes: [] };
      if (!cur.codes.includes(r.p.code)) cur.codes.push(r.p.code);
      by.set(k, cur);
    }
    return [...by.values()].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  }, [m.rows]);
  const [regType, setRegType] = useState<'all' | 'procedure' | 'law' | 'terms' | 'order'>('all');
  const ipcRows = m.rows.filter((r) => r.ipc);
  const matRows = m.rows.filter((r) => r.ma || r.mir);

  return (
    <>
      {/* ── Hero ── */}
      <section className={s.hero}>
        <div>
          <p className={s.eyebrow}>{tr('Сүүлд тайлагнасан')} {m.lastReport ?? '—'}</p>
          <h1>{tr('Сэлбэ дэд төвийн барилгажилтын төсөл')}</h1>
          <p className={s.heroSub}>{tr('Багцын хяналтын самбар')}</p>
        </div>
        <div className={s.heroFig}>
          <span className={s.eyebrow}>{tr('Орон сууцны гүйцэтгэл')}</span>
          <span className={s.heroNum}>{pct(m.hero.actual)}</span>
          <Meter value={m.hero.actual} plan={m.hero.planContract} wide />
          <span className={s.heroNote}>
            {tr('Гэрээний төлөвлөгөө {0} · Гүйцэтгэгчийн төлөвлөгөө {1} · гэрээний дүнгээр жигнэсэн', lz(m, 'cfPlan')(pct(m.hero.planContract)), lz(m, 'plan')(pct(m.hero.planContractor)))}
          </span>
        </div>
      </section>

      {/* ── KPI ── */}
      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('Гэрээний нийт дүн')}</span>
          <span className={s.statValue}>{lz(m, 'budget')(mnt(contractTotal))}</span>
          <span className={s.statNote}>{tr('{0} багц', num(m.rows.length))}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('Орон сууцны гүйцэтгэл')}</span>
          {(() => {
            const d = m.hero.actual != null && m.hero.planContract != null ? m.hero.actual - m.hero.planContract : null;
            return <span className={`${s.statValue} ${d != null && d < 0 ? s.bad : ''}`}>{lz(m, 'cfPlan')(pp(d))}</span>;
          })()}
          <span className={s.statNote}>{tr('гэрээний төлөвлөгөөтэй харьцуулахад')}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('{0} багц', num(housing.length))}</span>
          <span className={s.statValue}>{lz(m, 'packs')(num(households))}<small>{tr('айл')}</small></span>
          <span className={s.statNote}>{tr('{0} блок', lz(m, 'packs')(num(blocks)))}</span>
        </div>
        <div className={s.stat}>
          {/* ⚠️ 2026-10-01: он нь ӨНӨӨДРӨӨС (`heatWinterYear`) — урьд нь «2026» хатуу бичигдсэн байв */}
          <span className={s.statLabel}>{tr('{0} оны өвөл дулаан авах', heatYear == null ? '—' : String(heatYear))}</span>
          <span className={s.statValue}>—</span>
          <span className={s.statNote}>{tr('блок')}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('Нийт олгосон санхүүжилт')}</span>
          <span className={s.statValue}>{mnt(m.paid.total)}</span>
          <span className={s.statNote}>
            {tr('{0} IPC · {1} гэрээний', num(m.paid.ipcCount), pct(m.paid.pct))}
            {/* ⚠️ 2026-10-01: хувьд ороогүй олголт — «IPC» хуудастай ижил тусад нь (`ipcTotals.paidOther`) */}
            {m.paid.other != null && m.paid.other !== 0 && <> · {tr('гэрээт дүн тодорхойгүй гэрээнд олгосон {0} (хувьд ороогүй)', mnt(m.paid.other))}</>}
          </span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>{tr('Багцын төлөв')}</span>
          {/* ⚠️ 2026-10-01: тоон дээр дарахад «Багцууд» тэр төлвөөр шүүгдэнэ (дахин дарвал арилна) */}
          <span className={s.stateCounts}>
            {TUH_STATUS.map((x) => {
              const n = m.statusCount.get(x.key) ?? 0;
              return (
                <button key={x.key} type="button" className={s.stateBtn} aria-pressed={st === x.key} disabled={!n && st !== x.key} onClick={() => pickStatus(x.key)}>
                  <StatusChip st={x.key} /><b>{num(n)}</b>
                </button>
              );
            })}
          </span>
        </div>
      </div>
      {m.failed.length > 0 && (
        <p className={s.failNote}>{tr('Уншигдаагүй эх сурвалж: {0} — холбогдох тоо «—» харагдана.', m.failed.join(', '))}</p>
      )}

      {/* ── Улсын комисст бэлэн байдал ── */}
      <Section id="commissioning" title={tr('Улсын комисст бэлэн байдал')}
        lead={tr('Орон сууцны багц бүр улсын комисст орохын өмнө доорх салбар багцууд 100% дууссан байх ёстой. Хамгийн сүүлд дуусах салбар багц ашиглалтын огноог тодорхойлно.')}>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>{tr('Гол багц')}</th>
                <th>{tr('Гэрээт дуусах')}</th>
                <th>{tr('Хамгийн эрт ашиглалтад')}</th>
                <th className={s.num}>{tr('Хоцролт')}</th>
                <th>{tr('Инженерийн шугам сүлжээ')}</th>
                <th>{tr('Эрчим хүч, холбоо')}</th>
                <th>{tr('Дулааны эх үүсвэр')}</th>
                <th>{tr('Гадна тохижилт, өндөржилт')}</th>
              </tr>
            </thead>
            <tbody>
              {housing.map((r) => (
                <tr key={r.p.key}>
                  <td>
                    <button type="button" className={s.rowLink} onClick={() => onOpen(r.p.key)}>{r.p.code}</button>
                    <small>{pct(r.progress, 2)}</small>
                  </td>
                  <td>{date(r.p.end)}</td>
                  <td><b>{lz(m, 'commission')(date(r.commission))}</b><small>{tr('Хуваарийн «Улсын комисс»')}</small></td>
                  <td className={`${s.num} ${r.delay != null && r.delay > 0 ? s.bad : ''}`}>
                    {lz(m, 'commission')(r.delay == null ? '—' : tr('{0} хоног', `${r.delay > 0 ? '+' : ''}${num(r.delay)}`))}
                  </td>
                  <td>—</td><td>—</td><td>—</td><td>—</td>
                </tr>
              ))}
              {!housing.length && <EmptyRow cols={8} />}
            </tbody>
          </table>
        </div>
        <p className={s.note}>{tr('Салбар багцын хамаарал системд бүртгэгдээгүй тул нүднүүд хоосон. Мөр дээр дарж дэлгэрэнгүйг нээнэ.')}</p>
      </Section>

      {/* ── IPC-ийн явц, санхүүжилт ── */}
      <Section id="ipc" title={tr('IPC-ийн явц, санхүүжилт')}
        lead={tr('Багц бүрийн гэрээний дүн, олгосон санхүүжилт ба биет гүйцэтгэл (зураас).')}>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>{tr('Код')}</th>
                <th>{tr('Гүйцэтгэгч')}</th>
                <th className={s.num}>{tr('Гэрээний дүн')}</th>
                <th>{tr('Олгосон санхүүжилт')}</th>
                <th className={s.num}>{tr('Олгосон IPC')}</th>
                <th>{tr('Сүүлд олгосон')}</th>
                <th>{tr('Хянагдаж буй IPC')}</th>
                <th>{tr('Одоо хэн дээр')}</th>
                <th className={s.num}>{tr('хоног')}</th>
              </tr>
            </thead>
            <tbody>
              {ipcRows.map((r) => {
                const ipc = r.ipc!;
                /* ⚠️ 2026-10-01: хянагдаж буй IPC — гүйцэтгэлээс үүссэн, олгоогүй AUTO мөр
                   (`tuhData.pendingAutoOf`); «хоног» — хамгийн эртнийх нь хүлээгдсэн хугацаа */
                const rv = ipc.review;
                const wait = rv?.oldest ? daysBetween(Date.parse(`${rv.oldest}T00:00:00`), now) : null;
                return (
                  <tr key={r.p.key}>
                    <td><button type="button" className={s.rowLink} onClick={() => onOpen(r.p.key)}>{r.p.code}</button></td>
                    <td>{ipc.contracts.length > 1 ? tr('{0} гэрээ', num(ipc.contracts.length)) : (ipc.contracts[0]?.contractor || '—')}</td>
                    <td className={s.num}>{mnt(ipc.contractTotal)}</td>
                    <td style={{ minWidth: 180 }}>
                      <Meter value={ipc.paidPct} plan={r.progress} />
                      <small>{mnt(ipc.paid)} · {pct(ipc.paidPct)}</small>
                      {ipc.paidOther != null && ipc.paidOther !== 0 && (
                        <small>{tr('гэрээт дүн тодорхойгүй гэрээнд олгосон {0} (хувьд ороогүй)', mnt(ipc.paidOther))}</small>
                      )}
                      <small>{tr('PV (гэрээ) {0} · EV {1}', lz(m, 'cfPlan')(mnt(r.ev.pvContract)), mnt(r.ev.ev))}</small>
                    </td>
                    <td className={s.num}>{num(ipc.ipcNos.length)}</td>
                    <td>{ipc.lastIpc != null ? `IPC-${ipc.lastIpc}` : '—'}<small>{ipc.lastPaidDate ?? '—'}</small></td>
                    <td>
                      {rv ? (
                        <>
                          {tr('{0} акт', num(rv.count))} · {mnt(rv.une)}
                          <small>{rv.oldest === rv.latest ? (rv.latest ?? '—') : `${rv.oldest ?? '—'} – ${rv.latest ?? '—'}`}</small>
                        </>
                      ) : '—'}
                    </td>
                    <td>—</td>
                    <td className={`${s.num} ${wait != null && wait >= TUH_STALE_DAYS ? s.bad : ''}`}>{wait == null ? '—' : num(wait)}</td>
                  </tr>
                );
              })}
              {!ipcRows.length && <EmptyRow cols={9} />}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Багцууд ── */}
      <Section id="packages" title={tr('Багцууд')} lead={tr('Багц дээр «Энд нээх» дарж дэлгэрэнгүйг нээнэ; газрын зураг тэр багц руу томорно.')}>
        <div className={s.filters}>
          <div className={s.seg} role="group" aria-label={tr('Бүлэг')}>
            <button type="button" className={s.segBtn} aria-pressed={grp === 'all'} onClick={() => setGrp('all')}>{tr('Бүгд')}</button>
            {TUH_GROUPS.map((g) => (
              <button key={g.key} type="button" className={s.segBtn} aria-pressed={grp === g.key} onClick={() => setGrp(g.key)}>{g.label()}</button>
            ))}
          </div>
          <input
            className={s.search}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr('Код, нэр, гүйцэтгэгчээр хайх')}
            aria-label={tr('Хайх')}
          />
          {st != null && (
            <span className={s.chips}>
              <span className={s.chip}>{tr('Төлөв: {0}', statusMeta(st).label())}</span>
              <button type="button" className={s.ghostBtn} onClick={() => setSt(null)}>✕ {tr('Шүүлт цэвэрлэх')}</button>
            </span>
          )}
        </div>
        {TUH_GROUPS.map((g) => {
          const mine = shown.filter((r) => r.p.group === g.key);
          if (!mine.length) return null;
          return (
            <div key={g.key}>
              <h3 className={s.groupTitle}>{g.label()}</h3>
              <div className={s.cards}>
                {/* ⚠️ 2026-10-01: `TUH_STALE_DAYS`+ хоног тайлангүй багц тодорно (`data-stale`) */}
                {mine.map((r) => (
                  <article
                    key={r.p.key}
                    className={s.card}
                    data-tone={statusMeta(r.status).tone}
                    data-stale={r.reportAge != null && r.reportAge >= TUH_STALE_DAYS ? 'true' : undefined}
                  >
                    <div className={s.cardTop}>
                      <span className={s.code}>{r.p.code}</span>
                      <StatusChip st={r.status} />
                    </div>
                    <h4 className={s.cardTitle}>{r.p.name || '—'}</h4>
                    <div className={s.cardProg}>
                      <span className={s.cardPct}>{pct(r.progress)}</span>
                      <span className={s.cardWeek}>
                        {tr('7 хоногт')} <b className={r.week != null && r.week > 0 ? s.good : ''}>{lz(m, 'hist')(pp(r.week))}</b>
                      </span>
                    </div>
                    <Meter value={r.progress} plan={r.planContract} />
                    {/* ⚠️ Хэмжигчийн ЗУРААС юуг заадгийг бичнэ — тайлбаргүй зураас уншигдахгүй */}
                    <div className={s.meterCap}>
                      <span><i className={s.capFill} />{tr('Бодит')} {pct(r.progress)}</span>
                      <span><i className={s.capTick} />{tr('Гэрээний төлөвлөгөө')} {lz(m, 'cfPlan')(pct(r.planContract))}</span>
                    </div>
                    <div className={s.cardFacts}>
                      <div className={s.wide}><span>{tr('Дүн')}</span><b>{mnt(r.p.cost)}</b></div>
                      <div><span>{tr('Дуусах')}</span><b>{date(r.p.end)}</b></div>
                      {r.p.group === 'housing' && (
                        <div><span>{tr('Хамгийн эрт ашиглалтад')}</span><b>{lz(m, 'commission')(date(r.commission))}</b></div>
                      )}
                      <div className={s.wide}><span>{tr('Сүүлд тайлагнасан')}</span><b><ReportAge r={r} /></b></div>
                      <div className={s.wide}><span>{tr('Ерөнхий гүйцэтгэгч')}</span><b>{r.p.contractor || '—'}</b></div>
                    </div>
                    <div className={s.cardFoot}>
                      <button type="button" className={s.ghostBtn} onClick={() => onOpen(r.p.key)}>{tr('Энд нээх')}</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
        {!shown.length && <p className={s.note}>{st != null || q.trim() || grp !== 'all' ? tr('Шүүлтэнд тохирох мөр алга.') : '—'}</p>}
      </Section>

      {/* ── S-curve ── */}
      <Section id="housing-curves" title={tr('S-curve — хуримтлагдсан гүйцэтгэл')}
        lead={tr('Орон сууцны багц бүрийн хуваарийн төлөвлөгөө ба бодит гүйцэтгэл — «Багцын гүйцэтгэл» хэсгийн ижил график.')}>
        <div className={s.multiples}>
          {housing.map((r) => (
            <div key={r.p.key} className={s.progCell}>
              <ProgChart months={r.prog} title={`${r.p.code} · ${tr('Гүйцэтгэлийн явц')}`} />
              <button type="button" className={s.ghostBtn} onClick={() => onOpen(r.p.key)}>{tr('Энд нээх')}</button>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Level 1 ── */}
      <Section id="level1" title={tr('Level 1 — Мастер хуваарь')}
        lead={tr('Багц бүрийн гэрээт хугацаа, гүйцэтгэл ба улсын комиссын огноо («Хуваарь»).')}>
        <GanttLegend />
        <Gantt rows={l1} from={dom.from} to={dom.to} now={now} />
      </Section>

      {/* ── Материал ── */}
      <Section id="supply" title={tr('Материал: 3-6-9 төлөвлөгөө, MA/MIR, түүвэр')}
        empty={!matRows.length && !m.loading.has('docs')}
        lead={tr('MA (материалын зөвшөөрөл) ба MIR (материал хүлээн авах үзлэг) — «Чанар» хэсгийн баримтаас.')}>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>{tr('Код')}</th>
                <th>{tr('Материал')}</th>
                <th className={s.num}>{tr('Хоцорсон')}</th>
                <th className={s.num}>{tr('3 д/х')}</th>
                <th className={s.num}>{tr('6 д/х')}</th>
                <th className={s.num}>{tr('9 д/х')}</th>
                <th className={s.num}>{tr('MA батлагдаагүй')}</th>
                <th className={s.num}>{tr('MIR батлагдаагүй')}</th>
                <th className={s.num}>{tr('түүвэр')}</th>
                <th className={s.num}>{tr('Батлагдсан')}</th>
                <th className={s.num}>{tr('хянагдаж буй')}</th>
                <th className={s.num}>{tr('Хугацаа хэтэрсэн')}</th>
              </tr>
            </thead>
            <tbody>
              {matRows.map((r) => (
                <tr key={r.p.key}>
                  <td><button type="button" className={s.rowLink} onClick={() => onOpen(r.p.key)}>{r.p.code}</button></td>
                  <td>—</td>
                  <td className={s.num}>—</td><td className={s.num}>—</td><td className={s.num}>—</td><td className={s.num}>—</td>
                  <td className={s.num}>{r.ma ? num(r.ma.total - r.ma.approved) : '—'}</td>
                  <td className={s.num}>{r.mir ? num(r.mir.total - r.mir.approved) : '—'}</td>
                  <td className={s.num}>—</td>
                  <td className={s.num}>{num((r.ma?.approved ?? 0) + (r.mir?.approved ?? 0))}</td>
                  <td className={s.num}>{num((r.ma?.review ?? 0) + (r.mir?.review ?? 0))}</td>
                  <td className={s.num}>—</td>
                </tr>
              ))}
              {!matRows.length && <EmptyRow cols={12} loading={m.loading.has('docs')} />}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── ТУХ-ын арга хэмжээ ── */}
      {/* ⚠️ Эх сурвалжгүй — үргэлж хураагдсан (2026-10-01) */}
      <Section id="pmo" title={tr('ТУХ-ын төсөл дамнасан арга хэмжээ')} empty>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>№</th>
                <th>{tr('Ажлын нэр')}</th>
                <th>{tr('Хамрах хүрээ')}</th>
                <th>{tr('Хариуцагч')}</th>
                <th>{tr('Хугацаа')}</th>
                <th>{tr('Гүйц.')}</th>
                <th>{tr('Явц')}</th>
              </tr>
            </thead>
            <tbody><EmptyRow cols={7} /></tbody>
          </table>
        </div>
      </Section>

      {/* ── Журмууд ── */}
      <Section id="regulations" title={tr('Хүчин төгөлдөр мөрдөгдөж буй журмууд')} empty={!orders.length}>
        <div className={s.filters}>
          <div className={s.seg} role="group" aria-label={tr('Төрөл')}>
            {([
              ['all', tr('Бүгд ({0})', num(orders.length))],
              ['procedure', tr('Дотоод журам ({0})', num(0))],
              ['law', tr('Хууль ({0})', num(0))],
              ['terms', tr('Гэрээний жишиг нөхцөл ({0})', num(0))],
              ['order', tr('Захирамж ({0})', num(orders.length))],
            ] as const).map(([k, label]) => (
              <button key={k} type="button" className={s.segBtn} aria-pressed={regType === k} onClick={() => setRegType(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>{tr('Төрөл')}</th>
                <th>{tr('Нэр')}</th>
                <th>{tr('Дугаар / хувилбар')}</th>
                <th>{tr('Баталсан')}</th>
                <th>{tr('Огноо')}</th>
                <th>{tr('Хамрах багц')}</th>
                <th>{tr('Төлөв')}</th>
              </tr>
            </thead>
            <tbody>
              {(regType === 'all' || regType === 'order') && orders.map((o) => (
                <tr key={`${o.no}|${o.date ?? ''}`}>
                  <td>{tr('Захирамж')}</td>
                  <td>—</td>
                  <td>{o.no}</td>
                  <td>—</td>
                  <td>{date(o.date)}</td>
                  <td><span className={s.chips}>{o.codes.map((c) => <span key={c} className={s.chip}>{c}</span>)}</span></td>
                  <td>—</td>
                </tr>
              ))}
              {((regType !== 'all' && regType !== 'order') || !orders.length) && <EmptyRow cols={7} />}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

export { pp };
