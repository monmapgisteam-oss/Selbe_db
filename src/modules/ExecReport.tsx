'use client';

/**
 * УДИРДЛАГЫН ТАЙЛАН — «Тайлан» харагдацын ХОЁР ДАХЬ горим (2026-09-17).
 *
 * Шийдвэр гаргагчид зориулсан ТОВЧ тайлан: 01. Ерөнхий дашбоард · 05. Багцын
 * гүйцэтгэл · 04. Багцын санхүү · Зөвшөөрөл — дөрвөн эхийн дэлгэцийн тоог
 * нэг хуудсанд. Хоёр гарц:
 *   · PDF (инфографик хуудас + 2–3 хуудас хүснэгт)
 *   · Инфографик PNG (нэг зураг — мессенжер, илтгэлд)
 * мөн AI дүгнэлт (реле асаалттай үед) — тайлангийн тоонд л тулгуурлана.
 *
 * ⚠️ Өгөгдөл `@/lib/execReport`-оос — энд тооцоо ХИЙХГҮЙ. Дэлгэц, PDF,
 *    инфографик, AI дөрвүүлээ нэг объект уншина.
 * ⚠️ Ерөнхий (10 хэсэгтэй) тайлан ХЭВЭЭР — `Tailan.tsx`-ийн горим сэлгэгчээр
 *    солигдоно. Энэ модуль түүнийг ОРЛОХГҮЙ, харин удирдлагад зориулсан
 *    богино хувилбар.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Fig, KpiRow, RankBars, Meter } from '@/modules/tailanChart';
import { Data } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { num, pct } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { loadExecReport, execFindings, askExecSummary } from '@/lib/execReport';
import { buildInfographicSvg, money } from '@/lib/execInfographic';
import { downloadExecPdf, downloadInfographic } from '@/lib/execPdf';
import { relayAlive } from '@/lib/agent/client';
import { TOLOV } from '@/lib/zovshoorol';
import r from './report.module.css';
import e from './execReport.module.css';

/** Хүснэгтийн дугаартай тайлбар */
function Cap({ no, children }: { no: string; children: React.ReactNode }) {
  return <p className={r.caption}>{tr('Хүснэгт')} {no}. <span>{children}</span></p>;
}

export function ExecReport() {
  /** Огноо — ЗӨВХӨН клиент дээр (`Tailan`-тай ижил: hydration зөрөхөөс сэргийлнэ) */
  const [date, setDate] = useState('');
  useEffect(() => {
    setDate(new Date().toLocaleString('mn-MN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }));
  }, []);
  const q = useAsync(loadExecReport, []);
  const [busy, setBusy] = useState<'' | 'pdf' | 'png' | 'ai'>('');
  const [fail, setFail] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  /** Реле амьд эсэх — AI товчийг зөвхөн боломжтой үед идэвхжүүлнэ */
  const [ai, setAi] = useState<boolean | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    relayAlive(ac.signal).then(setAi, () => setAi(false));
    return () => ac.abort();
  }, []);

  const x = q.state === 'ready' ? q.data : null;
  const findings = useMemo(() => (x ? execFindings(x) : []), [x]);
  /* Инфографикийн урьдчилсан харагдац — SVG-г шууд <img>-д (PNG хөрвүүлэлтгүй, хурдан) */
  const previewSrc = useMemo(() => {
    if (!x) return '';
    const svg = buildInfographicSvg(x, date || new Date().toLocaleDateString('mn-MN'), findings, summary);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [x, date, findings, summary]);

  const run = useCallback(async (what: 'pdf' | 'png' | 'ai') => {
    if (!x || busy) return;
    setFail('');
    setBusy(what);
    try {
      const d = date || new Date().toLocaleString('mn-MN');
      if (what === 'pdf') await downloadExecPdf(x, d, summary);
      else if (what === 'png') await downloadInfographic(x, d, summary);
      else setSummary(await askExecSummary(x));
    } catch (err) {
      console.error('[selbe] удирдлагын тайлан:', err);
      const label = what === 'pdf' ? 'PDF' : what === 'png' ? tr('Инфографик') : tr('AI дүгнэлт');
      setFail(tr('{0} үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.', label));
    } finally {
      setBusy('');
    }
  }, [x, busy, date, summary]);

  return (
    <>
      <div className={r.toolbar}>
        <div className={r.tools}>
          <button type="button" className={r.btn} disabled={!x || !!busy} onClick={() => run('pdf')}
            title={tr('Инфографик хуудас + хүснэгтүүд — 3–4 хуудас PDF')}>
            <Icon name="file" size={15} />
            {busy === 'pdf' ? tr('Бэлтгэж байна…') : tr('PDF татах')}
          </button>
          <button type="button" className={r.btn} disabled={!x || !!busy} onClick={() => run('png')}
            title={tr('Нэг хуудас инфографик зураг (PNG) — мессенжер, илтгэлд')}>
            <Icon name="chart" size={15} />
            {busy === 'png' ? tr('Бэлтгэж байна…') : tr('Инфографик (PNG)')}
          </button>
          <button type="button" className={e.btn2} disabled={!x || !!busy || ai !== true} onClick={() => run('ai')}
            title={ai === false ? tr('AI реле (agent-proxy) асаагүй байна') : tr('Тайлангийн тоонд тулгуурлан AI товч дүгнэлт бичнэ')}>
            <Icon name="target" size={15} />
            {busy === 'ai' ? tr('Бодож байна…') : summary ? tr('AI дүгнэлт дахин үүсгэх') : tr('AI дүгнэлт үүсгэх')}
          </button>
        </div>
        {fail && <p className={r.fail} role="alert">{fail}</p>}
      </div>

      <article className={r.paper}>
        <header className={r.docHead}>
          <h1 className={r.title}>{tr('Сэлбэ 20 минутын хот — Удирдлагын тайлан')}</h1>
          <p className={r.sub}>
            {tr('Шийдвэр гаргагчид зориулсан товч тайлан')}{date && <> {tr('· Огноо:')} {date}</>}
          </p>
        </header>

        <Data q={q} loading={tr('Дөрвөн дашбоардын өгөгдлийг нэгтгэж байна…')}>
          {(x) => (
            <>
              {/* ── AI дүгнэлт / дүрэмд суурилсан дүгнэлт ── */}
              <div className={e.ai}>
                <div className={e.aiHead}>
                  <span>{summary ? tr('AI дүгнэлт') : tr('Гол дүгнэлт')}</span>
                  {ai === false && <span>{tr('AI реле асаагүй — дүрэмд суурилсан дүгнэлт')}</span>}
                </div>
                {summary ?? findings.map((s) => `• ${s}`).join('\n')}
              </div>

              {/* ── Инфографик ── */}
              <Fig no="1">{tr('Нэг хуудас инфографик — PNG/PDF-д яг энэ хэлбэрээр орно')}</Fig>
              <div className={e.preview}>
                {previewSrc && <img src={previewSrc} alt={tr('Удирдлагын инфографик')} />}
              </div>

              {/* ── 1. Ерөнхий үзүүлэлт ── */}
              <section className={r.section}>
                <h2 className={r.h2}>{tr('1. Ерөнхий үзүүлэлт')} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-3)' }}>· {tr('01. Ерөнхий дашбоард')}</span></h2>
                <KpiRow items={[
                  { label: tr('Нийт төсөв'), value: money(x.gdash.budget) },
                  { label: tr('Нийт гэрээлсэн дүн'), value: money(x.gdash.contract), sub: x.gdash.budget > 0 ? tr('төсвийн {0}', pct((x.gdash.contract / x.gdash.budget) * 100, 1)) : undefined },
                  { label: tr('Төслийн гүйцэтгэл'), value: x.gdash.progress == null ? '—' : pct(x.gdash.progress, 1), sub: tr('6 шатны жигнэсэн хувь') },
                  { label: tr('Багц ажлын тоо'), value: num(x.gdash.packages), sub: tr('{0} төрөл', num(x.gdash.types)) },
                  { label: tr('Газар чөлөөлөлт'), value: x.gdash.landPct == null ? '—' : pct(x.gdash.landPct, 1), sub: tr('{0} нэгж талбар үлдсэн', num(x.gdash.land.remaining)) },
                  { label: tr('Олгосон санхүүжилт'), value: money(x.fin.given), sub: x.fin.share == null ? undefined : tr('гэрээний {0}', pct(x.fin.share, 1)) },
                ]} />
                <Fig no="2">{tr('Ажлын төрлөөр — төсөвт өртөг (гүйцэтгэлийн хувь ард нь)')}</Fig>
                <RankBars
                  title={tr('Ажлын төрөл бүрийн төсөв')}
                  items={x.gdash.byType.map((t, i) => ({
                    label: t.label, value: t.cost, hot: i === 0,
                    text: `${money(t.cost)}${t.perf == null ? '' : ` · ${pct(t.perf, 1)}`}`,
                  }))}
                />
                <Cap no="1">{tr('Ажлын төрлөөр — төсөв, гэрээлсэн дүн, гүйцэтгэл')}</Cap>
                <table className={r.table}>
                  <thead><tr><th>{tr('Төрөл')}</th><th className={r.num}>{tr('Ажил')}</th><th className={r.num}>{tr('Гэрээт')}</th><th className={r.num}>{tr('Төсөв (₮)')}</th><th className={r.num}>{tr('Гэрээлсэн (₮)')}</th><th className={r.num}>{tr('Гүйц.')}</th></tr></thead>
                  <tbody>
                    {x.gdash.byType.map((t) => (
                      <tr key={t.label}>
                        <td>{t.label}</td><td className={r.num}>{num(t.n)}</td><td className={r.num}>{num(t.contracted)}</td>
                        <td className={r.num}>{num(t.cost)}</td><td className={r.num}>{t.contract > 0 ? num(t.contract) : '—'}</td>
                        <td className={r.num}>{t.perf == null ? '—' : pct(t.perf, 1)}</td>
                      </tr>
                    ))}
                    <tr className={r.total}>
                      <td>{tr('Нийт')}</td>
                      <td className={r.num}>{num(x.gdash.byType.reduce((a, t) => a + t.n, 0))}</td>
                      <td className={r.num}>{num(x.gdash.byType.reduce((a, t) => a + t.contracted, 0))}</td>
                      <td className={r.num}>{num(x.gdash.byType.reduce((a, t) => a + t.cost, 0))}</td>
                      <td className={r.num}>{num(x.gdash.byType.reduce((a, t) => a + t.contract, 0))}</td>
                      <td className={r.num} />
                    </tr>
                  </tbody>
                </table>
                <p className={r.note}>{tr('Нийт төсөв (KPI) нь Excel-ийн НИЙТ хамрах хүрээгээр; төрлийн хүснэгтийн нийлбэр нь бүх мөрөөр тул зөрж болно.')}</p>
              </section>

              <div className={e.two}>
                {/* ── 2. Багцын гүйцэтгэл ── */}
                <section className={r.section}>
                  <h2 className={r.h2}>{tr('2. Багцын гүйцэтгэл')} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-3)' }}>· 05</span></h2>
                  <KpiRow items={[
                    { label: tr('Бодит'), value: x.prog.actual == null ? '—' : pct(x.prog.actual, 1), sub: x.prog.asOf ? tr('хэмжилт {0}', x.prog.asOf) : undefined },
                    { label: tr('Төлөвлөсөн'), value: x.prog.planned == null ? '—' : pct(x.prog.planned, 1) },
                    { label: tr('Зөрүү'), value: x.prog.gap == null ? '—' : `${x.prog.gap > 0 ? '−' : x.prog.gap < 0 ? '+' : ''}${num(Math.abs(x.prog.gap), 1)}`, sub: x.prog.gap == null ? undefined : x.prog.gap >= 5 ? tr('хоцрогдол') : x.prog.gap < 0 ? tr('түрүүлэлт') : tr('хуваарийн дагуу') },
                  ]} />
                  <Meter value={x.prog.actual} plan={x.prog.planned} label={tr('Орон сууцны барилга угсралт')} />
                  <Fig no="3">{tr('Багц тус бүрийн биет гүйцэтгэл')}</Fig>
                  <RankBars
                    title={tr('Багц тус бүрийн биет гүйцэтгэл')}
                    max={100}
                    fmt={(v) => pct(v, 1)}
                    items={x.prog.packs.filter((p) => p.kind === 'build').sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1))
                      .map((p, i) => ({ label: p.name, value: p.progress, hot: i === 0 && p.progress != null }))}
                  />
                  <Cap no="2">{tr('Блокийн гүйцэтгэлийн түвшин')}</Cap>
                  <table className={r.table}>
                    <thead><tr><th>{tr('Түвшин')}</th><th>{tr('Хувь')}</th><th className={r.num}>{tr('Блок')}</th></tr></thead>
                    <tbody>
                      {x.prog.levels.map((l) => <tr key={l.label}><td>{l.label}</td><td>{l.range}</td><td className={r.num}>{num(l.n)}</td></tr>)}
                      <tr><td className={e.warn}>{tr('Бөглөгдөөгүй')}</td><td className={e.warn}>—</td><td className={`${r.num} ${e.warn}`}>{num(x.prog.noData)}</td></tr>
                      <tr className={r.total}><td>{tr('Нийт')}</td><td>{num(x.prog.households)} {tr('өрх')}</td><td className={r.num}>{num(x.prog.blocks)}</td></tr>
                    </tbody>
                  </table>
                </section>

                {/* ── 3. Багцын санхүү ── */}
                <section className={r.section}>
                  <h2 className={r.h2}>{tr('3. Багцын санхүү')} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-3)' }}>· 04</span></h2>
                  <KpiRow items={[
                    { label: tr('Гэрээний нийт дүн'), value: money(x.fin.planTotal) },
                    { label: tr('Олгосон'), value: money(x.fin.given), sub: x.fin.share == null ? undefined : pct(x.fin.share, 1) },
                    { label: tr('Үлдэгдэл'), value: money(x.fin.remain) },
                  ]} />
                  <Fig no="4">{tr('Багц тус бүр — олгосон санхүүжилт гэрээний дүнд эзлэх хувь')}</Fig>
                  <RankBars
                    title={tr('Багц тус бүрийн санхүүжилтийн хувь')}
                    max={100}
                    items={x.fin.rows.map((f) => ({
                      label: f.label, value: f.pct, hot: f.pct != null && f.pct >= 50,
                      text: `${f.pct == null ? '—' : pct(f.pct, 1)} · ${money(f.given)}`,
                    }))}
                  />
                  <Cap no="3">{tr('Багц тус бүрийн санхүүжилт — олгосон ба гэрээний дүн')}</Cap>
                  <table className={r.table}>
                    <thead><tr><th>{tr('Багц')}</th><th className={r.num}>{tr('Гэрээ (₮)')}</th><th className={r.num}>{tr('Олгосон (₮)')}</th><th className={r.num}>{tr('Хувь')}</th></tr></thead>
                    <tbody>
                      {x.fin.rows.map((f) => (
                        <tr key={f.key}>
                          <td>{f.label}</td><td className={r.num}>{f.plan > 0 ? num(f.plan) : '—'}</td><td className={r.num}>{num(f.given)}</td>
                          <td className={`${r.num} ${f.pct != null && f.pct < 10 && f.plan > 0 ? e.warn : ''}`}>{f.pct == null ? '—' : pct(f.pct, 1)}</td>
                        </tr>
                      ))}
                      <tr className={r.total}><td>{tr('Нийт')}</td><td className={r.num}>{num(x.fin.planTotal)}</td><td className={r.num}>{num(x.fin.given)}</td><td className={r.num}>{x.fin.share == null ? '—' : pct(x.fin.share, 1)}</td></tr>
                    </tbody>
                  </table>
                </section>
              </div>

              {/* ── 4. Зөвшөөрөл ── */}
              <section className={r.section}>
                <h2 className={r.h2}>{tr('4. Зөвшөөрөл')}</h2>
                {!x.zov ? (
                  <p className={r.note}>{tr('Зөвшөөрлийн бүртгэл холбогдоогүй тул энэ хэсэг мэдээлэлгүй.')}</p>
                ) : (
                  <>
                    <KpiRow items={[
                      { label: tr('Зөвшөөрсөн'), value: `${num(x.zov.ok)} / ${num(x.zov.total)}` },
                      { label: tr('Хүлээгдэж буй'), value: num(x.zov.wait) },
                      { label: tr('Зөвшөөрөөгүй'), value: num(x.zov.no), sub: x.zov.unknown ? tr('танигдаагүй {0}', num(x.zov.unknown)) : undefined },
                    ]} />
                    <Cap no="4">{tr('Багц тус бүрийн зөвшөөрлийн төлөв')}</Cap>
                    <table className={r.table}>
                      <thead><tr><th>{tr('Багц')}</th><th className={r.num}>{tr('Нийт')}</th><th className={r.num}>{tr('Зөвшөөрсөн')}</th><th className={r.num}>{tr('Хүлээгдэж')}</th><th className={r.num}>{tr('Зөвшөөрөөгүй')}</th></tr></thead>
                      <tbody>
                        {x.zov.byBagts.map((b) => (
                          <tr key={b.bagts}>
                            <td>{b.bagts}</td><td className={r.num}>{num(b.total)}</td>
                            <td className={`${r.num} ${b.ok === b.total && b.total > 0 ? e.good : ''}`}>{num(b.ok)}</td>
                            <td className={r.num}>{num(b.wait)}</td>
                            <td className={`${r.num} ${b.no + b.unknown > 0 ? e.bad : ''}`}>{num(b.no + b.unknown)}</td>
                          </tr>
                        ))}
                        <tr className={r.total}><td>{tr('Нийт')}</td><td className={r.num}>{num(x.zov.total)}</td><td className={r.num}>{num(x.zov.ok)}</td><td className={r.num}>{num(x.zov.wait)}</td><td className={r.num}>{num(x.zov.no + x.zov.unknown)}</td></tr>
                      </tbody>
                    </table>
                    {x.zov.issues.length > 0 && (
                      <>
                        <Cap no="5">{tr('Анхаарал шаардах зөвшөөрлүүд')}</Cap>
                        <table className={r.table}>
                          <thead><tr><th>{tr('Багц')}</th><th className={r.num}>{tr('Шат')}</th><th>{tr('Зөвшөөрөл')}</th><th>{tr('Байгууллага')}</th><th>{tr('Төлөв')}</th></tr></thead>
                          <tbody>
                            {x.zov.issues.slice(0, 40).map((i, k) => (
                              <tr key={`${i.bagts}-${i.shat}-${k}`}>
                                <td>{i.bagts}</td><td className={r.num}>{num(i.shat)}</td><td>{i.ner}</td><td>{i.baiguullaga || '—'}</td>
                                <td className={i.tolov === TOLOV.no ? e.bad : e.warn}>{tr(i.tolov)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {x.zov.issues.length > 40 && <p className={r.note}>{tr('Эхний 40 мөр; нийт {0}.', num(x.zov.issues.length))}</p>}
                      </>
                    )}
                  </>
                )}
              </section>

              <p className={r.note} style={{ marginTop: 22 }}>
                {tr('Эх сурвалж: Сэлбэ портал — 01. Ерөнхий дашбоард · 05. Багцын гүйцэтгэл · 04. Багцын санхүү · Зөвшөөрөл. Бүх тоо тайлан үүсгэх агшинд ArcGIS-ээс амьдаар татагдсан; дэлгэц дээрх дашбоардтай ижил.')}
              </p>
            </>
          )}
        </Data>
      </article>
    </>
  );
}
