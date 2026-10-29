'use client';

/**
 * ТАЙЛАН — «Ерөнхий мэдээлэл» дашбоардын өгөгдлийг БАРИМТ (тайлан) хэлбэрээр.
 *
 * Бүтэц нь захиалагчийн Word жишээ тайлантай ижил: гарчиг · товч танилцуулга ·
 * дугаарласан бүлэг · шинжилгээний өгүүлбэр · дугаартай хүснэгт · дүгнэлт.
 * Ингэснээр энэ хуудсыг шууд ХЭВЛЭХ / PDF болгож, мэйлд хавсаргах боломжтой.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import type { Dim } from '@/components/MapCanvas';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { buildPacks, type Pack } from '@/modules/Bagts';
import { useBuildings } from '@/modules/BuildingPanel';
import { TuhMap } from '@/modules/tuh/TuhMap';
import { Fig, KpiRow, RankBars } from '@/modules/tailanChart';
import { Data } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { num, pct, dateTime, mnt } from '@/lib/format';
import { invalidateAll } from '@/lib/dataBus';
import { useBagtsTable, type BagtsRow } from '@/modules/Dashboard';
import { ailTotal, loadBagtsRows } from '@/lib/execData';
import { useAsync } from '@/lib/useAsync';
import { emailViaEml, emailViaMailto, downloadReportPdf, REPORT_RECIPIENTS } from '@/lib/emailReport';
import {
  useReportExtra, buildFindings, loadReportExtra, type ReportExtra,
  loadOverall, loadProgress, loadFinance, loadLand, loadHabeaSummary,
  BAGTS_GAP_PTS,
} from '@/lib/reportData';
import { ResizableTable } from '@/components/ResizableTable';
import { ExecReport } from '@/modules/ExecReport';
import { ReportContents, ReportHero } from './ReportContents';
import { Segmented } from '@/components/Switch';
import r from './report.module.css';

/** ₮ — БҮТЭН дүн, мянгатын таслалтай (2026-09-01, товчлолыг бүрэн хассан) */
const bn = (v: number) => num(v);
const bnOrDash = (v: number) => (v > 0 ? bn(v) : '—');

/** Хүснэгтийн дугаартай тайлбар — ХҮСНЭГТИЙН ДЭЭД талд байрлана */
function Cap({ no, children }: { no: string; children: React.ReactNode }) {
  return <p className={r.caption}>{tr('Хүснэгт')} {no}. <span>{children}</span></p>;
}

/* ═══════════════ ХҮЛЭЭЛТИЙН ТӨЛӨВ ═══════════════ */

const PROBES: { key: string; label: () => string; load: () => Promise<unknown> }[] = [
  { key: 'overall', label: () => tr('Нийт гүйцэтгэл (багцын жингээр)'), load: loadOverall },
  { key: 'progress', label: () => tr('Барилга угсралтын гүйцэтгэл'), load: loadProgress },
  { key: 'finance', label: () => tr('Санхүүжилт (захирамж, гэрээ, олголт)'), load: loadFinance },
  { key: 'land', label: () => tr('Газар чөлөөлөлт'), load: loadLand },
  { key: 'habea', label: () => tr('Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй'), load: loadHabeaSummary },
];

/**
 * Аль эх сурвалж БЭЛЭН БОЛСНЫГ хянана.
 */
function useSourceProgress(active: boolean): Record<string, boolean> {
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!active) return;
    let alive = true;
    for (const p of PROBES) {
      p.load().then(
        () => { if (alive) setDone((d) => (d[p.key] ? d : { ...d, [p.key]: true })); },
        () => {},
      );
    }
    return () => { alive = false; };
  }, [active]);
  return done;
}

/** Хүлээсэн хугацаа (сек) — «зогссон уу?» гэсэн эргэлзээг арилгах цорын ганц хөдөлгөөн */
function useElapsed(active: boolean): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t0 = Date.now();
    const upd = () => setSecs(Math.round((Date.now() - t0) / 1000));
    const first = setTimeout(upd, 0);
    const id = setInterval(upd, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [active]);
  return secs;
}

/** Араг ясны саарал мөр — өргөнийг өөр өөр өгснөөр текст мэт уншигдана */
function SkelBar({ w }: { w: string }) {
  return (
    <div
      aria-hidden
      style={{
        height: 9, width: w, marginBottom: 7, borderRadius: 4,
        background: 'var(--surface-2)',
      }}
    />
  );
}

/**
 * Хүлээлтийн харагдац — явцын самбар + тайлангийн араг яс.
 */
function ReportWaiting({ steps, secs }: { steps: { label: string; done: boolean }[]; secs: number }) {
  const ready = steps.filter((s) => s.done).length;
  const sections = [
    tr('1. Үндсэн үзүүлэлт'),
    tr('2. Орон сууцны багцууд'),
    tr('3. Багцын жигнэсэн гүйцэтгэл'),
    tr('4. Газар чөлөөлөлт'),
    tr('5. Нийгмийн үйлчилгээний барилга'),
    tr('6. Барилга угсралтын гүйцэтгэл'),
    tr('7. Санхүүжилтийн явц'),
    tr('8. Дэд бүтцийн хэрэгжилт'),
    tr('9. Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй'),
    tr('10. Дүгнэлт, анхаарах асуудал'),
  ];
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        style={{
          border: '1px solid var(--line)', borderRadius: 'var(--r, 6px)',
          padding: '14px 16px', marginBottom: 22, background: 'var(--surface-2)',
        }}
      >
        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          {tr('Тайлан бэлтгэгдэж байна — {0} эх сурвалжаас {1} нь ирлээ', num(steps.length), num(ready))}
        </p>
        {/* Явцын зурвас — тоо ба урт нь ИЖИЛ эх сурвалжаас, зөрөх боломжгүй */}
        <div
          aria-hidden
          style={{
            height: 5, marginTop: 10, borderRadius: 3, overflow: 'hidden',
            background: 'color-mix(in srgb, var(--ink-3) 22%, transparent)',
          }}
        >
          <div
            style={{
              height: '100%', width: `${(ready / steps.length) * 100}%`,
              background: 'var(--accent)', transition: 'width .25s ease',
            }}
          />
        </div>
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, fontSize: 11.5 }}>
          {steps.map((s) => (
            <li
              key={s.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
                color: s.done ? 'var(--ink-2)' : 'var(--ink-3)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 7, height: 7, borderRadius: '50%', flex: 'none',
                  background: s.done ? 'var(--accent)' : 'transparent',
                  border: s.done ? 'none' : '1px solid var(--ink-3)',
                }}
              />
              <span>{s.label}</span>
              <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                {s.done ? tr('бэлэн') : tr('татагдаж байна…')}
              </span>
            </li>
          ))}
        </ul>
        <p className={r.note} style={{ marginTop: 10 }}>
          {tr('Ихэвчлэн 15–25 секунд үргэлжилнэ. Одоогоор {0} секунд болов.', num(secs))}
          {' '}
          {tr('Дэд бүтэц ба нийгмийн үйлчилгээний давхаргууд мөн зэрэг татагдаж байгаа ч явцыг нь тусад нь хэмждэггүй.')}
        </p>
      </div>

      {sections.map((title, i) => (
        <section key={title} className={r.section}>
          <h2 className={r.h2} style={{ color: 'var(--ink-3)' }}>
            {title}
            <span style={{ float: 'right', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {tr('хараахан ирээгүй')}
            </span>
          </h2>
          <SkelBar w="92%" />
          <SkelBar w="78%" />
          {/* Хүснэгттэй хэсгүүд ӨНДӨР тул араг яс нь ч өндөр — өгөгдөл ирэхэд
              хуудас бага үсэрнэ */}
          {i !== 9 && <><SkelBar w="60%" /><SkelBar w="86%" /><SkelBar w="45%" /></>}
        </section>
      ))}
    </>
  );
}

/**
 * ХОЁР ГОРИМ (2026-09-17):
 *   · «Дэлгэрэнгүй тайлан» — доорх 10 хэсэгтэй ерөнхий тайлан (хэвээр)
 *   · «Удирдлагын тайлан» — `ExecReport`: 01 · 05 · 04 · Зөвшөөрөл дөрвөн
 *     эхийн товч хувилбар, инфографик ба AI дүгнэлттэй
 */
export function Tailan({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  const [mode, setModeRaw] = useState<'full' | 'exec'>('exec');
  /** Ерөнхий тайлан нэг удаа нээгдсэн эсэх — тэр хойно mount хэвээр (доорх 2026-10-06) */
  const [fullSeen, setFullSeen] = useState(false);
  const setMode = (m: 'full' | 'exec') => { if (m === 'full') setFullSeen(true); setModeRaw(m); };
  const { hostRef, ...side } = useSideResize('tailan');
  const bq = useBuildings();
  const packs = useMemo<Pack[]>(() => buildPacks(bq.state === 'ready' ? bq.data.rows : null), [bq]);
  /* Тайланд багцын дэлгэрэнгүй хуудас байхгүй — блок дарвал зөвхөн тодорно (`TuhMap` өөрөө) */
  const onPickPkg = useCallback(() => {}, []);
  return (
    <div ref={hostRef} className={`${r.tailan} ${side.hostClass}`} style={side.style}>
      <SplitGrip {...side.right} />
      <div className={r.content}>
        {/* Горим сэлгэгч — ТУХ-ын шүүлтүүрийн сегменттэй ижил хэлбэр. */}
        <div className={r.filters}>
          <Segmented value={mode} onChange={setMode} label={tr('Тайлангийн горим')}
            options={[{ value: 'exec', label: tr('Удирдлагын тайлан') }, { value: 'full', label: tr('Дэлгэрэнгүй тайлан') }]} />
        </div>
        <div style={{ display: mode === 'exec' ? 'contents' : 'none' }}><ExecReport /></div>
        {fullSeen && <div style={{ display: mode === 'full' ? 'contents' : 'none' }}><TailanFull /></div>}
      </div>
      <div className={r.side}>
        <TuhMap dim={dim} setDim={setDim} sel={null} packs={packs} onPickPkg={onPickPkg} />
      </div>
    </div>
  );
}

const loadReportPair = (): Promise<[BagtsRow[], ReportExtra]> => Promise.all([loadBagtsRows(), loadReportExtra()]);

function TailanFull() {
  /** Огноо — ЗӨВХӨН клиент дээр (сервертэй зөрж hydration эвдэхээс сэргийлнэ). */
  const [date, setDate] = useState('');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDate(dateTime(Date.now())); }, []);

  const bagts = useBagtsTable();
  const ex = useReportExtra();
  const pair = useAsync(loadReportPair, []);
  const rows = pair.state === 'ready' ? pair.data[0] : null;
  const extra: ReportExtra | null = pair.state === 'ready' ? pair.data[1] : null;

  /** Мэйл үүсгэх явц — pdfmake динамик ачаалалт хормын зуур авна.
   */
  const [busyKind, setBusyKind] = useState<'eml' | 'web' | 'pdf' | null>(null);
  const busy = busyKind != null;
  /**
   * Тайлан үүсгэхэд гарсан алдаа — зурвасын доор нэрлэсэн мэдэгдэл болно.
   */
  const [fail, setFail] = useState('');

  /**
   * ГУРВАН ГАРЦ — нэг ажил, гурван орчинд.
   */
  /** Амжилтын мөр — товч дарсны дараа юу болсныг хэлнэ (2026-09-23) */
  const [ok, setOk] = useState('');
  const run = useCallback(
    async (kind: 'eml' | 'web' | 'pdf', fn: (r: BagtsRow[], d: string, x: ReportExtra) => Promise<void>, what: string, done: string) => {
      if (!rows || !extra || busy) return;
      setFail('');
      setOk('');
      setBusyKind(kind);
      try {
        await fn(rows, dateTime(Date.now()), extra);
        setOk(done);
      } catch (e) {
        console.error('[selbe] тайлан:', e);
        setFail(tr('{0} үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.', what));
      } finally {
        setBusyKind(null);
      }
    },
    [rows, extra, busy],
  );

  const send = useCallback(
    () => run('eml', emailViaEml, tr('Тайлан'), tr('Selbe_tailan.eml татагдлаа — Outlook-оор нээнэ үү')),
    [run],
  );
  const sendWeb = useCallback(
    () => run('web', emailViaMailto, tr('Мэйл'), tr('Мэйл нээгдээгүй бол Selbe_tailan.pdf-ийг гараар хавсаргана уу')),
    [run],
  );
  const savePdf = useCallback(() => run('pdf', downloadReportPdf, 'PDF', tr('Selbe_tailan.pdf татагдлаа')), [run]);

  const ready = !!rows && !!extra;
  const hasTo = REPORT_RECIPIENTS.length > 0;
  /**
   * ШИНЭЧЛЭХ — тайлангийн 5 минутын кэшийг хаяна (2026-09-23). `loadReportExtra`
   * ба `useBagtsTable`-ийн уншдаг хүснэгтүүдийн тагийг хүчингүй болгоход
   * `useAsync` дахин татна.
   */
  const refresh = useCallback(() => invalidateAll(), []);

  const failed = bagts.state === 'error' || ex.state === 'error' || pair.state === 'error';
  const waiting = !failed && (bagts.state === 'loading' || ex.state === 'loading' || pair.state === 'loading');
  const doneMap = useSourceProgress(waiting);
  const secs = useElapsed(waiting);
  const steps = [
    { label: tr('Багцын нэгдсэн хүснэгт'), done: bagts.state === 'ready' },
    ...PROBES.map((p) => ({ label: p.label(), done: !!doneMap[p.key] })),
  ];

  return (
    <>
      <div className={r.toolbar}>
        <div className={r.tools}>
          <button
            type="button"
            className={r.btn}
            disabled={!ready || busy || !hasTo}
            onClick={send}
            title={tr('Outlook нээгдэж, мэйл бичигдсэн, PDF хавсаргагдсан, Send дарахад бэлэн (юу ч чирэх шаардлагагүй)')}
          >
            <Icon name="chart" size={15} />
            {busyKind === 'eml' ? tr('Бэлтгэж байна…') : tr('Outlook-оор илгээх')}
          </button>
          <button
            type="button"
            className={r.btn}
            disabled={!ready || busy || !hasTo}
            onClick={sendWeb}
            title={tr('New Outlook эсвэл вэб хувилбар (OWA) ашигладаг бол мэйл бичих цонх нээгдэж, PDF нь тусад нь татагдана')}
          >
            <Icon name="chart" size={15} />
            {busyKind === 'web' ? tr('Бэлтгэж байна…') : tr('Шинэ Outlook / вэб')}
          </button>
          {/* Мэйлгүй зам — файлыг өөрөө хадгалаад хүссэн сувгаараа илгээнэ */}
          <button
            type="button"
            className={r.btn}
            disabled={!ready || busy}
            onClick={savePdf}
            title={tr('Зөвхөн PDF файлыг татах, мэйл програм нээхгүй')}
          >
            <Icon name="chart" size={15} />
            {busyKind === 'pdf' ? tr('Бэлтгэж байна…') : tr('PDF татах')}
          </button>
          <button
            type="button"
            className={r.btn}
            disabled={busy || waiting}
            onClick={refresh}
            title={tr('Тайлангийн түр санах ойг хаяж өгөгдлийг дахин татна')}
          >
            <Icon name="chart" size={15} />
            {tr('Шинэчлэх')}
          </button>
        </div>
        {/* Хүлээн авагч ба Outlook-ийн зөвлөмж — товчнуудын доор, үргэлж харагдана */}
        <p className={r.sub} style={{ margin: '4px 0 0' }}>
          {hasTo
            ? tr('Хүлээн авагч: {0}', REPORT_RECIPIENTS.join(', '))
            : tr('Хүлээн авагч тохируулаагүй — админд мэдэгдэнэ үү')}
          {' · '}
          {tr('Classic Outlook → «Outlook-оор илгээх»; New Outlook / вэб → «Шинэ Outlook / вэб»')}
        </p>
        {fail && <p className={r.fail} role="alert">{fail}</p>}
        {ok && <p className={r.sub} role="status" style={{ margin: '4px 0 0' }}>{ok}</p>}
      </div>

      <article className={r.paper}>
        <ReportHero
          meta={<>
            {date && <>{tr('Огноо:')} {date}</>}
            {extra && <> {tr('· Өгөгдөл:')} {dateTime(extra.fetchedAt)}</>}
          </>}
          title={tr('Сэлбэ 20 минутын хотын ерөнхий тайлан')}
          sub={tr('Ерөнхий төлөвлөгөө ба төсвийн нэгдсэн үзүүлэлт')}
          figLabel={tr('Төслийн нийт гүйцэтгэл')}
          value={extra?.projectPct ?? null}
          loading={!extra && !failed}
          note={extra && <>
            {tr('Орон сууцны гүйцэтгэл')} {pct(extra.overall.pct, 2)} · {tr('Барилга угсралтын гүйцэтгэл (блокийн дундаж)')} {pct(extra.progress.overall, 2)}
          </>}
        />

        {waiting ? <ReportWaiting steps={steps} secs={secs} /> : (
        <Data q={bagts} loading={tr('Багцын өгөгдөл нэгтгэж байна…')}>
          {(rows) => (
            <Data q={ex} loading={tr('Гүйцэтгэл, санхүү, газар, дэд бүтэц, ХАБЭА-гийн өгөгдөл нэгтгэж байна…')}>
              {(x) => {
                const blocks = rows.reduce((a, b) => a + b.blocks, 0);
                const ailOf = (rs: readonly BagtsRow[]) => {
                  const t = ailTotal(rs);
                  return t.ail == null ? '—' : t.partial ? `${num(t.ail)} (${tr('дутуу')})` : num(t.ail);
                };
                const ail = ailOf(rows);
                const ailCell = (b: BagtsRow) => ailOf([b]);
                const budgetOf = (k: string) => x.finance.byBagts[k] ?? 0;
                const budget = rows.reduce((a, b) => a + budgetOf(b.key), 0);
                const sorted = [...rows].sort((a, b) => budgetOf(b.key) - budgetOf(a.key));
                const bagtsAvg = x.overall.pct;
                const srcTotal = x.finance.sources.reduce((a, s) => a + s.value, 0);
                const d = buildFindings(x, rows);
                const bagtsGapWide = d.bestBagts != null && d.worstBagts != null
                  && d.bestBagts.pct - d.worstBagts.pct > BAGTS_GAP_PTS;
                const bestRow = rows.find((b) => b.label === d.bestBagts?.bagts) ?? null;

                return (
                  <>
                    {/* ── Товч танилцуулга ── */}
                    <ReportContents prefix="full" titles={[tr('Үндсэн үзүүлэлт'), tr('Орон сууцны багцууд'), tr('Багцын жигнэсэн гүйцэтгэл'), tr('Газар чөлөөлөлт'), tr('Нийгмийн үйлчилгээний барилга'), tr('Барилга угсралтын гүйцэтгэл'), tr('Санхүүжилтийн явц'), tr('Дэд бүтцийн хэрэгжилт'), tr('Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй'), tr('Дүгнэлт, анхаарах асуудал')]} />
                    <div className={r.lead}>
                      <h2 className={r.summaryTitle}>{tr('Товч хураангуй')}</h2>
                      <p>
                        {x.projectPct != null
                          ? <>{tr('Сэлбэ 20 минутын хотын төслийн хэрэгжилт тайлан үүсгэх өдрийн байдлаар')} <strong>{pct(x.projectPct, 2)}</strong>{tr('-тай байна. Төслийн төсвийн')}</>
                          : tr('Төслийн нийт гүйцэтгэл (нэгтгэл гүйцэтгэл) уншигдсангүй. Төслийн төсвийн')}
                        {' '}<strong>{pct(d.buildWeight, 1)}</strong>{tr('-ийг эзэлдэг барилга угсралтын ажил (ХО-оор жигнэсэн)')} <strong>{pct(d.buildActual, 2)}</strong>{tr('-ийн гүйцэтгэлтэй')}
                        {d.buildLag != null && (
                          <> {tr('буюу төлөвлөгөөнөөс')} <strong>{num(d.buildLag, 1)} {tr('нэгж хувиар')}</strong> {tr('хоцорч байна')}</>
                        )}
                        {tr('. Газар чөлөөлөлтийн гүйцэтгэл нэгж талбарын төлвөөр')}
                        {' '}<strong>{pct(x.land.pct, 1)}</strong> {tr('байгаа ч')}
                        {' '}{num(d.landLeft)} {tr('нэгж талбар шийдвэрлэгдээгүй үлдсэн байна.')}
                      </p>
                      {x.finance.paid == null ? (
                        <p>
                          {tr('Санхүүгийн хувьд захирамжаар {0} ₮ батлагдсанаас {1} ₮{2} нь гэрээгээр баталгаажсан; олгосон санхүүжилтийн мэдээлэл уншигдсангүй.', bn(x.finance.orderTotal), bn(x.finance.contractAmount), d.contractRate != null ? ` (${pct(d.contractRate, 1)})` : '')}
                        </p>
                      ) : (
                      <p>
                        {tr('Санхүүгийн хувьд захирамжаар')} <strong>{bn(x.finance.orderTotal)} {tr('₮')}</strong>
                        {' '}{tr('батлагдсанаас')} <strong>{bn(x.finance.contractAmount)} {tr('₮')}</strong>
                        {d.contractRate != null && <> ({pct(d.contractRate, 1)})</>} {tr('нь гэрээгээр баталгаажиж,')}
                        {' '}<strong>{mnt(x.finance.paid)}</strong>
                        {d.paidRate != null && <> ({tr('гэрээлсэн багцад {0} ₮ — гэрээлсэн дүнгийн {1}', bn(x.finance.paidContracted), pct(d.paidRate, 1))})</>} {tr('нь бодитоор олгогдсон байна.')}
                      </p>
                      )}
                      <p>
                        {tr('Барилгын талбайд {0} ажилтан, {1} нэгж техник ажиллаж байгаа бөгөөд орон сууцны {2} блок, {3} өрхийн орон сууц баригдаж байна.', num(x.habea.workers), num(x.habea.tehnik), num(blocks), ail)}
                      </p>
                    </div>

                    {/* ── 1. Үндсэн үзүүлэлт ── */}
                    <section id="full-1" tabIndex={-1} className={r.section}>
                      <h2 className={r.h2}>{tr('1. Үндсэн үзүүлэлт')}</h2>
                      <p className={r.intro}>
                        {tr('Энэ хэсэгт төслийн цар хүрээ, гүйцэтгэл, санхүүжилтийн долоон гол үзүүлэлтийг нэгтгэв. Гүйцэтгэлийн хоёр өөр хэмжүүрийг ялган үзэх нь зүйтэй: орон сууцны багцуудын жигнэсэн гүйцэтгэл нь багц бүрийн блокийн дундажийг төсвийн жингээр нь нэгтгэсэн дүн бол барилга угсралтын гүйцэтгэл нь бүх блокийн энгийн дундаж. Удирдлагын тайлангийн «Төслийн нийт гүйцэтгэл» нь өөр хэмжүүр буюу нэгтгэл гүйцэтгэлийн хүснэгтэд ТЭЗҮ-гээс төсөл хүлээлгэн өгөх хүртэлх үе шатыг төсөлд эзлэх хувиар нь нэгтгэсэн дүн.')}
                      </p>
                      <KpiRow items={[
                        { label: tr('Орон сууцны блок'), value: num(blocks) },
                        { label: tr('Өрхийн орон сууц'), value: ail },
                        { label: tr('Орон сууцны гүйцэтгэл (багцаар, төсвийн жинтэй)'), value: pct(x.overall.pct, 2) },
                        { label: tr('Барилга угсралтын гүйцэтгэл (блокийн энгийн дундаж)'), value: pct(x.progress.overall, 2) },
                        { label: tr('Захирамжаар батлагдсан'), value: `${bn(x.finance.orderTotal)} ₮` },
                        { label: tr('Гэрээгээр байгуулагдсан'), value: `${bn(x.finance.contractAmount)} ₮` },
                        { label: tr('Бодитоор олгосон'), value: mnt(x.finance.paid) },
                      ]} />
                      {/* Санхүүжилтийн гурван шат нь ХООРОНДОО хамаарна:
                          захирамж ⊇ гэрээ ⊇ олголт. Тиймээс хэсэг-бүтэн БИШ,
                          нэг тэнхлэг дээрх харьцуулалт. */}
                      <Fig no="1">{tr('Санхүүжилтийн гурван шат (захирамжаас олголт хүртэл)')}</Fig>
                      <RankBars
                        title={tr('Санхүүжилтийн гурван шатны харьцуулалт')}
                        items={[
                          { label: tr('Захирамжаар батлагдсан'), value: x.finance.orderTotal, text: `${bn(x.finance.orderTotal)} ₮` },
                          { label: tr('Гэрээгээр байгуулагдсан'), value: x.finance.contractAmount, text: `${bn(x.finance.contractAmount)} ₮` },
                          { label: tr('Бодитоор олгосон'), value: x.finance.paid, text: mnt(x.finance.paid), hot: true },
                        ]}
                      />
                      <Cap no="1">{tr('Төслийн нэгдсэн үзүүлэлт')}</Cap>
                      <ResizableTable storeKey="tailan.tovch" className={r.table}>
                        <thead><tr><th>{tr('Үзүүлэлт')}</th><th className={r.num}>{tr('Утга')}</th></tr></thead>
                        <tbody>
                          <tr><td>{tr('Орон сууцны блок')}</td><td className={r.num}>{num(blocks)}</td></tr>
                          <tr><td>{tr('Өрхийн орон сууц')}</td><td className={r.num}>{ail}</td></tr>
                          <tr>
                            <td title={tr('Орон сууцны багц бүрийн блокийн дундаж гүйцэтгэлийг багцын төсвийн жингээр нэгтгэсэн (3-р хэсэг)')}>{tr('Орон сууцны гүйцэтгэл (багцаар, төсвийн жинтэй)')}</td>
                            <td className={r.num}>{pct(x.overall.pct, 2)}</td>
                          </tr>
                          <tr>
                            <td title={tr('Хяналтын бүх блокийн энгийн дундаж (6-р хэсэг)')}>{tr('Барилга угсралтын гүйцэтгэл (блокийн энгийн дундаж)')}</td>
                            <td className={r.num}>{pct(x.progress.overall, 2)}</td>
                          </tr>
                          <tr>
                            <td>{tr('Захирамжаар батлагдсан дүн')}</td>
                            <td className={r.num}>{bn(x.finance.orderTotal)} {tr('₮')}</td>
                          </tr>
                          <tr>
                            <td>{tr('Гэрээгээр байгуулагдсан дүн')}</td>
                            <td className={r.num}>{bn(x.finance.contractAmount)} {tr('₮')}</td>
                          </tr>
                          <tr className={r.total}>
                            <td>{tr('Бодитоор олгосон санхүүжилт')}</td>
                            <td className={r.num}>{mnt(x.finance.paid)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('Орон сууцны гүйцэтгэл (багцаар, төсвийн жинтэй) нь')} {num(x.overall.rows)} {tr('блокийг багцынх нь төсвийн жингээр тооцсон дүн (3-р хэсэг); барилга угсралтын гүйцэтгэл нь хяналтын')} {num(x.progress.blocks)} {tr('блокийн энгийн дундаж (6-р хэсэг).')}
                      </p>
                    </section>

                    {/* ── 2. Орон сууцны багцууд ── */}
                    <section id="full-2" tabIndex={-1} className={r.section}>
                      <h2 className={r.h2}>{tr('2. Орон сууцны багцууд')}</h2>
                      <p className={r.intro}>
                        {tr('Орон сууцны барилгажилт')} {num(sorted.length)} {tr('багцад хуваагдан хэрэгжиж байна. Нийт')} {num(blocks)} {tr('блокт')} {ail} {tr('өрхийн орон сууц төлөвлөгдсөн бөгөөд төсөвт өртөг')} {bnOrDash(budget)} {bagtsGapWide
                          ? tr('₮ байна. Багц хоорондын гүйцэтгэлийн зөрүү их байна: хамгийн өндөр нь')
                          : tr('₮ байна. Багц хоорондын гүйцэтгэл ойролцоо байна: хамгийн өндөр нь')} {tr(d.bestBagts?.bagts ?? '—')}
                        ({pct(d.bestBagts?.pct ?? null, 2)}{tr('), хамгийн бага нь')}
                        {' '}{tr(d.worstBagts?.bagts ?? '—')} ({pct(d.worstBagts?.pct ?? null, 2)}).
                      </p>
                      <Fig no="2.1">{tr('Багц тус бүрийн төсөвт өртөг')}</Fig>
                      <RankBars
                        title={tr('Багц тус бүрийн төсөвт өртөг')}
                        items={sorted.map((b) => ({
                          label: tr(b.label),
                          value: budgetOf(b.key) > 0 ? budgetOf(b.key) : null,
                          text: budgetOf(b.key) > 0 ? `${bn(budgetOf(b.key))} ₮` : '—',
                        }))}
                      />
                      <Fig no="2.2">{tr('Багц тус бүрийн гүйцэтгэл (хамгийн өндөр нь тодруулсан)')}</Fig>
                      <RankBars
                        title={tr('Багц тус бүрийн гүйцэтгэлийн хувь')}
                        max={100} fmt={(v) => pct(v, 1)}
                        items={[...sorted]
                          .sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1))
                          .map((b) => ({
                            label: tr(b.label),
                            value: b.progress,
                            text: pct(b.progress, 2),
                            hot: b.key === bestRow?.key,
                          }))}
                      />
                      <Cap no="2">{tr('Багц тус бүрийн блок, өрх, төсөв ба гүйцэтгэл (төсөвт өртгөөр буурах эрэмбээр)')}</Cap>
                      <ResizableTable storeKey="tailan.bagts" className={r.table}>
                        <thead>
                          <tr>
                            <th>{tr('Багц')}</th>
                            <th className={r.num}>{tr('Блок')}</th>
                            <th className={r.num}>{tr('Өрх')}</th>
                            <th className={r.num}>{tr('Төсөв (₮)')}</th>
                            <th className={r.num}>{tr('Гүйцэтгэл')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((b) => (
                            <tr key={b.key}>
                              <td>{tr(b.label)}</td>
                              <td className={r.num}>{num(b.blocks)}</td>
                              <td className={r.num}>{ailCell(b)}</td>
                              <td className={r.num}>{budgetOf(b.key) > 0 ? bn(budgetOf(b.key)) : '—'}</td>
                              <td className={r.num}>{pct(b.progress, 2)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(blocks)}</td>
                            <td className={r.num}>{ail}</td>
                            <td className={r.num}>{bnOrDash(budget)}</td>
                            <td className={r.num}>{pct(bagtsAvg, 2)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                    </section>

                    {/* ── 3. Багцын жигнэсэн гүйцэтгэл ── */}
                    <section id="full-3" tabIndex={-1} className={r.section}>
                      <h2 className={r.h2}>{tr('3. Багцын жигнэсэн гүйцэтгэл')}</h2>
                      <p className={r.intro}>
                        {tr('Багц бүр төслийн төсөвт эзлэх өөрийн жинтэй тул нийт гүйцэтгэл нь энгийн дундаж биш, жин харгалзан тооцсон дүн болно.')}
                        {d.heavyStage && tr(' Одоогийн байдлаар төслийн төсвийн {0}-ийг «{1}» багц эзэлж байгаа тул нийт гүйцэтгэл голчлон түүнээс хамаарч байна.', pct(d.heavyStage.weight, 1), tr(d.heavyStage.label))}
                      </p>
                      <Fig no="3">{tr('Багц бүрийн төсөвт эзлэх жин (нийт гүйцэтгэл голчлон эндээс хамаарна)')}</Fig>
                      <RankBars
                        title={tr('Багц бүрийн төсөвт эзлэх жин')}
                        fmt={(v) => pct(v, 1)}
                        items={[...x.overall.stages]
                          .filter((s) => s.weight != null && s.weight > 0)
                          .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
                          .map((s, i) => ({
                            label: tr(s.label),
                            value: s.weight ?? 0,
                            text: pct(s.weight, 1),
                            hot: i === 0,
                          }))}
                      />
                      <Cap no="3">{tr('Багцын эзлэх жин ба бодит гүйцэтгэл')}</Cap>
                      <ResizableTable storeKey="tailan.uyeshat" className={r.table}>
                        <thead>
                          <tr>
                            <th>{tr('Багц')}</th>
                            <th className={r.num}>{tr('Блок')}</th>
                            <th className={r.num}>{tr('Эзлэх жин')}</th>
                            <th className={r.num}>{tr('Гүйцэтгэл')}</th>
                            <th className={r.num}>{tr('Төлөвлөгөө (алга)')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {x.overall.stages.map((s) => (
                            <tr key={s.label}>
                              <td>{tr(s.label)}</td>
                              <td className={r.num}>{num(s.rows)}</td>
                              <td className={r.num}>{pct(s.weight, 2)}</td>
                              <td className={r.num}>{pct(s.actual, 2)}</td>
                              <td className={r.num}>{s.planned == null ? '—' : pct(s.planned, 1)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(x.overall.rows)}</td>
                            <td className={r.num}>{pct(x.overall.weightSum, 2)}</td>
                            <td className={r.num}>{pct(x.overall.pct, 2)}</td>
                            <td className={r.num}>—</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('Эзлэх жингийн нийлбэр {0} — жин нь багц бүрийн төслийн нийт төсөвт эзлэх хувь бөгөөд орон сууцны бус (бөглөх хуудасгүй) багцууд энэ хүснэгтэд ороогүй тул нийлбэр 100%-иас бага; нийт гүйцэтгэлийг жингийн нийлбэрт харьцуулан тооцов. Багцын түвшинд төлөвлөгөөт хувь одоогоор байхгүй тул «—» тэмдгээр илэрхийлэв.', pct(x.overall.weightSum, 2))}
                      </p>
                    </section>

                    {/* ── 4. Газар чөлөөлөлт ── */}
                    <section id="full-4" tabIndex={-1} className={r.section}>
                      <h2 className={r.h2}>{tr('4. Газар чөлөөлөлт')}</h2>
                      <p className={r.intro}>
                        {tr('Төслийн талбайд нийт')} {x.land.parcels == null ? tr('татагдсангүй') : num(x.land.parcels)} {tr('нэгж талбар (')}{x.land.areaM2 == null ? tr('татагдсангүй') : num(x.land.areaM2)} {tr('м²) бүртгэгдсэн бөгөөд шийдвэрлэгдсэн нь')}
                        {' '}{x.land.pct != null ? pct(x.land.pct, 1) : '—'}. {tr('Шийдвэрлэгдээгүй нэгж талбарын тоо: {0}.', num(d.landLeft))}
                      </p>
                      <Fig no="4">{tr('Нэгж талбарын төлөв (шийдвэрлэсэн ба үлдсэн)')}</Fig>
                      <RankBars
                        title={tr('Нэгж талбарын төлөв')}
                        items={[...x.land.byStatus]
                          .sort((a, b) => b.n - a.n)
                          .map((s) => ({
                            label: tr(s.label),
                            value: s.n,
                            text: `${num(s.n)} · ${x.land.parcels ? pct((s.n / x.land.parcels) * 100, 1) : '—'}`,
                          }))}
                      />
                      <Cap no="4.1">{tr('Нэгж талбарын төлөв')}</Cap>
                      <ResizableTable storeKey="tailan.gazar" className={r.table}>
                        <thead><tr><th>{tr('Төлөв')}</th><th className={r.num}>{tr('Нэгж талбар')}</th><th className={r.num}>{tr('Эзлэх хувь')}</th></tr></thead>
                        <tbody>
                          {x.land.byStatus.map((s) => (
                            <tr key={s.label}>
                              <td>{tr(s.label)}</td>
                              <td className={r.num}>{num(s.n)}</td>
                              <td className={r.num}>
                                {x.land.parcels ? pct((s.n / x.land.parcels) * 100, 1) : '—'}
                              </td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{x.land.parcels == null ? tr('татагдсангүй') : num(x.land.parcels)}</td>
                            <td className={r.num}>{x.land.parcels == null ? '—' : '100%'}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>

                      {x.land.byReason.length > 0 && (
                        <>
                          <Cap no="4.2">
                            {tr('Шийдвэрлэгдээгүй нэгж талбарын шалтгаан')}
                            {d.topReason && tr(' — тэргүүлэх шалтгаан «{0}»', tr(d.topReason.label))}
                          </Cap>
                          <ResizableTable storeKey="tailan.shaltgaan" className={r.table}>
                            <thead><tr><th>{tr('Шалтгаан')}</th><th className={r.num}>{tr('Нэгж талбар')}</th></tr></thead>
                            <tbody>
                              {x.land.byReason.map((s) => (
                                <tr key={s.label}>
                                  <td>{tr(s.label)}</td>
                                  <td className={r.num}>{num(s.n)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </ResizableTable>
                        </>
                      )}
                    </section>

                    {/* ── 5. Нийгмийн үйлчилгээний барилга ── */}
                    <section id="full-5" tabIndex={-1} className={r.section}>
                      <h2 className={r.h2}>{tr('5. Нийгмийн үйлчилгээний барилга')}</h2>
                      <p className={r.intro}>
                        {tr('Орон сууцны хорооллыг дагалдан ерөнхий төлөвлөгөөнд')}
                        {' '}{num(x.social.n)} {tr('нийгмийн үйлчилгээний байгууламж, нийт')}
                        {' '}{tr('барилгын талбай')} {num(x.social.areaM2)} {tr('м² тусгагдсан байна. Эдгээр нь сургууль, цэцэрлэг, төрийн үйлчилгээ, хүүхдийн хөгжлийн байгууламжийг хамарна.')}
                      </p>
                      <Cap no="5">{tr('Нийгмийн үйлчилгээний байгууламжийн жагсаалт')}</Cap>
                      <ResizableTable storeKey="tailan.niitiin" className={r.table}>
                        <thead><tr><th>{tr('Байгууламж')}</th><th className={r.num}>{tr('Тоо')}</th><th className={r.num}>{tr('Талбай (м²)')}</th></tr></thead>
                        <tbody>
                          {x.social.rows.map((s) => (
                            <tr key={s.title}>
                              <td>{tr(s.title)}</td>
                              <td className={r.num}>{num(s.n)}</td>
                              <td className={r.num}>{s.areaM2 > 0 ? num(s.areaM2) : '—'}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(x.social.n)}</td>
                            <td className={r.num}>{num(x.social.areaM2)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                    </section>

                    {/* ── 6. Барилга угсралтын гүйцэтгэл ── */}
                    <section id="full-6" tabIndex={-1} className={r.section}>
                      <h2 className={r.h2}>{tr('6. Барилга угсралтын гүйцэтгэл')}</h2>
                      <p className={r.intro}>
                        {tr('Хяналтын {0} блокийн нийт гүйцэтгэлийн энгийн дундаж {1} байна{2}{3}. 6.2-р хүснэгтийн үе шатын дундаж нь зөвхөн тайлагнасан {4} блокоор тооцогдоно.',
                          num(x.progress.blocks), pct(x.progress.overall, 2),
                          x.progress.date ? tr(' (сүүлийн тайлагнал {0})', x.progress.date) : '',
                          x.progress.blocks > x.progress.reported ? tr('; тайлагнаагүй {0} блок 0%-иар тооцогдсон', num(x.progress.blocks - x.progress.reported)) : '',
                          num(x.progress.reported))}
                        {d.startedPhases.length > 0 && (
                          tr(' Одоогоор «{0}» үе шат эхэлсэн', d.startedPhases.map((x: string) => tr(x)).join('», «'))
                        )}
                        {d.notStartedPhases.length > 0 && (
                          <> {tr('бөгөөд үлдсэн')} {num(d.notStartedPhases.length)} {tr('үе шат хараахан эхлээгүй байна')}</>
                        )}
                        {(d.startedPhases.length > 0 || d.notStartedPhases.length > 0) && '.'}
                      </p>
                      <Fig no="6.1">{tr('Багц тус бүрийн барилга угсралтын гүйцэтгэл')}</Fig>
                      <RankBars
                        title={tr('Багц тус бүрийн барилга угсралтын гүйцэтгэл')}
                        max={100} fmt={(v) => pct(v, 1)}
                        items={[...x.progress.byBagts]
                          .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
                          .map((b) => ({ label: tr(b.bagts), value: b.pct, text: pct(b.pct, 2) }))}
                      />
                      <Cap no="6.1">{tr('Багц тус бүрийн барилга угсралтын гүйцэтгэл')}</Cap>
                      <ResizableTable storeKey="tailan.guits-bagts" className={r.table}>
                        <thead><tr><th>{tr('Багц')}</th><th className={r.num}>{tr('Блок')}</th><th className={r.num}>{tr('Гүйцэтгэл')}</th></tr></thead>
                        <tbody>
                          {x.progress.byBagts.map((b) => (
                            <tr key={b.bagts}>
                              <td>{tr(b.bagts)}</td>
                              <td className={r.num}>{num(b.blocks)}</td>
                              <td className={r.num}>{pct(b.pct, 2)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(x.progress.blocks)}</td>
                            <td className={r.num}>{pct(x.progress.overall, 2)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>

                      <Fig no="6.2">{tr('Ажлын үе шат тус бүрийн дундаж гүйцэтгэл')}</Fig>
                      <RankBars
                        title={tr('Ажлын үе шат тус бүрийн дундаж гүйцэтгэл')}
                        max={100} fmt={(v) => pct(v, 1)}
                        items={x.progress.phases.map((p) => ({ label: tr(p.name), value: p.pct, text: pct(p.pct, 2) }))}
                      />
                      <Cap no="6.2">{tr('Ажлын үе шат тус бүрийн дундаж гүйцэтгэл')}</Cap>
                      <ResizableTable storeKey="tailan.guits-shat" className={r.table}>
                        <thead><tr><th>{tr('Үе шат')}</th><th className={r.num}>{tr('Дундаж гүйцэтгэл')}</th></tr></thead>
                        <tbody>
                          {x.progress.phases.map((p) => (
                            <tr key={p.no}>
                              <td>{tr(p.no)}. {tr(p.name)}</td>
                              <td className={r.num}>{pct(p.pct, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </ResizableTable>

                      <Cap no="6.3">
                        {tr('Гүйцэтгэл хамгийн бага арван блок (анхаарал шаардсан ажлууд)')}
                      </Cap>
                      <ResizableTable storeKey="tailan.udaan" className={r.table}>
                        <thead><tr><th>{tr('Багц')}</th><th>{tr('Блок')}</th><th className={r.num}>{tr('Гүйцэтгэл')}</th></tr></thead>
                        <tbody>
                          {x.progress.slowest.map((b) => (
                            <tr key={`${b.bagts}|${b.block}`}>
                              <td>{tr(b.bagts)}</td>
                              <td>{tr(b.block)}</td>
                              <td className={r.num}>{pct(b.pct, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('Дундаж нь блок бүрийг тэнцүү жинтэйгээр тооцсон; 2-р хэсгийн багцын гүйцэтгэлтэй нэг эх сурвалжаас гарна.')}
                      </p>
                    </section>

                    {/* ── 7. Санхүүжилтийн явц ── */}
                    <section id="full-7" tabIndex={-1} className={r.section}>
                      <h2 className={r.h2}>{tr('7. Санхүүжилтийн явц')}</h2>
                      <p className={r.intro}>
                        {tr('Захирамж, гэрээгээр баталгаажсан {0} багц ажлын санхүүжилт {1} эх үүсвэрээс бүрдэж байна.', num(x.finance.rows), num(x.finance.sources.length))}
                        {d.topSource && (
                          <> {tr('Санхүүжилтийн дийлэнх хэсгийг «{0}» эх үүсвэр бүрдүүлж, нийт дүнгийн {1}-ийг эзэлж байна.', tr(d.topSource.label), pct(d.topSource.share, 1))}</>
                        )}
                      </p>
                      <Fig no="7.1">{tr('Санхүүжилтийн эх үүсвэрийн бүтэц')}</Fig>
                      <RankBars
                        title={tr('Санхүүжилтийн эх үүсвэрийн бүтэц')}
                        items={[...x.finance.sources]
                          .sort((a, b) => b.value - a.value)
                          .map((s, i) => ({
                            label: tr(s.label),
                            value: s.value,
                            text: `${bn(s.value)} ₮`,
                            hot: i === 0,
                          }))}
                      />
                      <Cap no="7.1">{tr('Санхүүжилтийн эх үүсвэрийн бүтэц')}</Cap>
                      <ResizableTable storeKey="tailan.eh-uusver" className={r.table}>
                        <thead><tr><th>{tr('Эх үүсвэр')}</th><th className={r.num}>{tr('Дүн (₮)')}</th><th className={r.num}>{tr('Хувь')}</th></tr></thead>
                        <tbody>
                          {x.finance.sources.map((s) => (
                            <tr key={s.label}>
                              <td>{tr(s.label)}</td>
                              <td className={r.num}>{bn(s.value)}</td>
                              <td className={r.num}>{srcTotal ? pct((s.value / srcTotal) * 100, 1) : '—'}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{bn(srcTotal)}</td>
                            <td className={r.num}>{srcTotal ? pct(100, 1) : '—'}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>

                      <Cap no="7.2">{tr('Ажлын төрлөөр (төсөв ба гэрээний дүн)')}</Cap>
                      <ResizableTable storeKey="tailan.torol" className={r.table}>
                        <thead><tr><th>{tr('Төрөл')}</th><th className={r.num}>{tr('Ажил')}</th><th className={r.num}>{tr('Төсөв')}</th><th className={r.num}>{tr('Гэрээлсэн')}</th></tr></thead>
                        <tbody>
                          {x.finance.byType.map((t) => (
                            <tr key={t.type}>
                              <td>{tr(t.type)}</td>
                              <td className={r.num}>{num(t.n)}</td>
                              <td className={r.num}>{bnOrDash(t.budget)}</td>
                              <td className={r.num}>{bnOrDash(t.contract)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(x.finance.byType.reduce((a, t) => a + t.n, 0))}</td>
                            <td className={r.num}>{bn(x.finance.byTypeTotal.budget)}</td>
                            <td className={r.num}>{bn(x.finance.byTypeTotal.contract)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('Эх сурвалж: Cashflow_0909. §1 ба §7.1-ийн «нийт төсөв» нь эх Excel-ийн НИЙТ томьёоны хамрах хүрээ (Орон сууцны хороолол + ГИШС), харин энэ хүснэгт нь гэрээний БҮХ мөрийг төрлөөр задалсан тул нийлбэр нь илүү гарна. Зөрүү нь газар чөлөөлөлт, буулгалт цэвэрлэгээ болон хамрах хүрээнээс гадуурх ажлууд.')}
                      </p>
                    </section>

                    {/* ── 8. Дэд бүтцийн хэрэгжилт ── */}
                    <section id="full-8" tabIndex={-1} className={r.section}>
                      <h2 className={r.h2}>{tr('8. Дэд бүтцийн хэрэгжилт')}</h2>
                      <p className={r.intro}>
                        {tr('Ерөнхий төлөвлөгөөний')} {num(x.infra.totals.layers)} {tr('давхаргад')}
                        {' '}{num(x.infra.totals.n)} {tr('объект бүртгэгдсэн бөгөөд шугам сүлжээний нийт урт')} {num(x.infra.totals.len)} {tr('м, талбайн хэмжээ')}
                        {' '}{num(x.infra.totals.area)} {tr('м² байна.')}
                      </p>
                      <Fig no="8">{tr('Ажлын бүлэг тус бүрийн объектын тоо')}</Fig>
                      <RankBars
                        title={tr('Ажлын бүлэг тус бүрийн объектын тоо')}
                        items={[...x.infra.groups]
                          .sort((a, b) => b.n - a.n)
                          .map((g) => ({ label: tr(g.title), value: g.n, text: num(g.n) }))}
                      />
                      <Cap no="8">{tr('Ажлын бүлэг тус бүрийн объект ба хэмжээ')}</Cap>
                      <ResizableTable storeKey="tailan.ajliin-buleg" className={r.table}>
                        <thead>
                          <tr>
                            <th>{tr('Ажлын бүлэг')}</th>
                            <th className={r.num}>{tr('Давхарга')}</th>
                            <th className={r.num}>{tr('Объект')}</th>
                            <th className={r.num}>{tr('Урт (м)')}</th>
                            <th className={r.num}>{tr('Талбай (м²)')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {x.infra.groups.map((g) => (
                            <tr key={g.key}>
                              <td>{tr(g.title)}</td>
                              <td className={r.num}>{num(g.layers)}</td>
                              <td className={r.num}>{num(g.n)}</td>
                              <td className={r.num}>{g.len > 0 ? num(g.len) : '—'}</td>
                              <td className={r.num}>{g.area > 0 ? num(g.area) : '—'}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td className={r.num}>{num(x.infra.totals.layers)}</td>
                            <td className={r.num}>{num(x.infra.totals.n)}</td>
                            <td className={r.num}>{num(x.infra.totals.len)}</td>
                            <td className={r.num}>{num(x.infra.totals.area)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('«—» тэмдэглэгээ нь тухайн бүлэгт өгөгдсөн хэмжигдэхүүн хамаарахгүйг илэрхийлнэ (жишээ нь цэгэн объектод урт, талбай байхгүй).')}
                      </p>
                    </section>

                    {/* ── 9. ХАБЭА ── */}
                    <section id="full-9" tabIndex={-1} className={r.section}>
                      <h2 className={r.h2}>{tr('9. Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй')}</h2>
                      <p className={r.intro}>
                        {x.habea.date && <>{x.habea.date}{tr('-ны байдлаар')} </>}
                        {tr('барилгын талбайд')} {num(x.habea.workers)} {tr('ажилтан (дотоодын')}
                        {' '}{num(x.habea.mongol)}{tr(', гадаадын')} {num(x.habea.gadaad)}),
                        {' '}{num(x.habea.tehnik)} {tr('нэгж техник ажиллаж байна. Дотоодын ажиллах хүч нийт ажиллагсдын')} {pct(d.mongolShare, 1)}{tr('-ийг эзэлж байна.')}
                      </p>
                      <Fig no="9">{tr('Гүйцэтгэгч байгууллага тус бүрийн ажиллах хүч')}</Fig>
                      <RankBars
                        title={tr('Гүйцэтгэгч байгууллага тус бүрийн ажилтны тоо')}
                        items={[...x.habea.byCompany]
                          .sort((a, b) => b.workers - a.workers)
                          .map((co) => ({ label: tr(co.label), value: co.workers, text: num(co.workers) }))}
                      />
                      <Cap no="9">{tr('Гүйцэтгэгч байгууллага тус бүрийн хүн хүч, техник')}</Cap>
                      <ResizableTable storeKey="tailan.guitsetgegch" className={r.table}>
                        <thead>
                          <tr>
                            <th>{tr('Гүйцэтгэгч')}</th>
                            <th>{tr('Багц')}</th>
                            <th className={r.num}>{tr('Ажилтан')}</th>
                            <th className={r.num}>{tr('Дотоод')}</th>
                            <th className={r.num}>{tr('Гадаад')}</th>
                            <th className={r.num}>{tr('Техник')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {x.habea.byCompany.map((c) => (
                            <tr key={c.label}>
                              <td>{tr(c.label)}</td>
                              <td>{tr(c.bagts ?? '—')}</td>
                              <td className={r.num}>{num(c.workers)}</td>
                              <td className={r.num}>{num(c.mongol)}</td>
                              <td className={r.num}>{num(c.gadaad)}</td>
                              <td className={r.num}>{num(c.tehnik)}</td>
                            </tr>
                          ))}
                          <tr className={r.total}>
                            <td>{tr('Нийт')}</td>
                            <td>—</td>
                            <td className={r.num}>{num(x.habea.workers)}</td>
                            <td className={r.num}>{num(x.habea.mongol)}</td>
                            <td className={r.num}>{num(x.habea.gadaad)}</td>
                            <td className={r.num}>{num(x.habea.tehnik)}</td>
                          </tr>
                        </tbody>
                      </ResizableTable>
                      <p className={r.note}>
                        {tr('Бүртгэлийн эхнээс хойш нийт')} {num(x.habea.incidents)} {tr('осол, зөрчил бүртгэгдсэн байна. Хүн хүчний тоо нь өдөр тутмын хуримтлагдсан үзүүлэлт биш, сүүлийн бүртгэлийн агшны байдлыг илэрхийлнэ.')}
                      </p>
                    </section>

                    {/* ── 10. Дүгнэлт ── */}
                    <section id="full-10" tabIndex={-1} className={r.section}>
                      <h2 className={r.h2}>{tr('10. Дүгнэлт, анхаарах асуудал')}</h2>
                      <p className={r.intro}>
                        {tr('Дээрх өгөгдөлд тулгуурлан анхаарал шаардсан дараах асуудлыг тодруулав.')}
                      </p>
                      <ul className={r.findings}>
                        {d.findings.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </section>
                  </>
                );
              }}
            </Data>
          )}
        </Data>
        )}

      </article>
    </>
  );
}
