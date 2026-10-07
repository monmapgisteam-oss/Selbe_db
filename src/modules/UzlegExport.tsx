'use client';

/**
 * ҮЗЛЭГИЙН ТАЙЛАН ТАТАХ — товч ба цонх (2026-10-06, хэрэглэгчийн хүсэлт).
 *
 * «Асуумжаа сонгоод, хугацаагаа сонгоод, компаниа сонгоод татах — нэгийг PDF-ээр
 * (`2026-09-29 Морин сувд.pdf` шиг), олныг Excel-ээр, iAuditor шиг».
 *
 * ⚠️ ДӨРВӨН АЛХАМ (2026-10-06 загвар сайжруулалт): Асуумж → Хугацаа → Компани → Үзлэг.
 *    Дугаар нь бодит дараалал — өмнөх алхам дараагийнх нь жагсаалтыг шүүнэ.
 * ⚠️ ФОРМАТ АВТОМАТААР: нэг үзлэг сонгосон бол PDF, олон бол Excel. Хэрэглэгч гараар
 *    сольж болно — олон үзлэгийг ч НЭГ PDF-д (тайлан бүр шинэ хуудаснаас) гаргана.
 * ⚠️ PDF-д зураг ОРНО тул олон үзлэгийн PDF удаан (зураг бүр татагдана) — анхааруулна.
 * ⚠️ Өгөгдөл нь ХАБЭА хуудастай НЭГ ачаалагчаас (`loadUzlegBoth`) — кэш хуваалцана.
 */

import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { HABEA, HABEA_UZLEG_LAYER_ID, LAYER_BY_ID } from '@/lib/services';
import { num } from '@/lib/format';
import { friendlyError } from '@/components/ui';
import { renderPdfBase64, download } from '@/lib/emailReport';
import {
  loadUzFields, loadUzAttachments, loadUzLocations, attUrl, buildUzReport, loadReportImages,
  buildUzPdf, buildUzXlsx, companyShort, fmtDate, reportTitle, type UzReport,
} from '@/lib/uzlegReport';
import { loadUzlegBoth, type UzlegKind, type UzlegRow } from './habeaUzleg';
import type { Row } from '@/lib/query';
import x from './uzlegExport.module.css';

const KINDS: UzlegKind[] = ['zahialagch', 'v11', 'guitsetgegch'];
/** Файлын нэр ба Excel-ийн хуудасны гарчигт — «Морин сувд - Захиалагчийн үзлэг 2026-09-29» */
const FORM_SHORT: Record<UzlegKind, string> = {
  zahialagch: 'Захиалагчийн үзлэг',
  v11: 'Ажлын байрны үзлэг V1.1',
  guitsetgegch: 'Гүйцэтгэгчийн үзлэг',
};
const PDF_MANY_WARN = 15;

const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** «YYYY-MM-DD» → орон нутгийн өдрийн эхлэл/төгсгөл (ms) */
const dayStart = (v: string) => new Date(`${v}T00:00:00`).getTime();
const dayEnd = (v: string) => new Date(`${v}T23:59:59.999`).getTime();

/** Хугацааны бэлэн сонголт — эхлэх огноог өнөөдрөөс тооцно */
/* ⚠️ 2026-10-06: «Нэг өдөр» — хэрэглэгчийн хүсэлт («нэг өдрийн дата зааж татах»).
   Эхлэх = дуусах = сонгосон өдөр; огнооны ГАНЦ талбар гарна. */
type Preset = 'day' | 'w' | 'm30' | 'month' | 'all';
const presetFrom = (p: Preset, today: Date): string => {
  if (p === 'day') return dayStr(today);
  if (p === 'w') return dayStr(new Date(today.getTime() - 6 * 86400000));
  if (p === 'm30') return dayStr(new Date(today.getTime() - 29 * 86400000));
  if (p === 'month') return dayStr(new Date(today.getFullYear(), today.getMonth(), 1));
  return '2020-01-01';
};
const presetLabel = (p: Preset) => (p === 'day' ? tr('Өдрөөр') : p === 'w' ? tr('7 хоног') : p === 'm30' ? tr('30 хоног') : p === 'month' ? tr('Энэ сар') : tr('Бүгд'));

/** Онооны өнгө — ≥90 сайн, ≥75 анхаар, бусад муу (оноогүй бол саарал) */
const scoreTone = (p: number | null) => (p == null ? '' : p >= 90 ? x.good : p >= 75 ? x.warn : x.bad);

type Loaded = { kind: UzlegKind; raw: Row[]; rows: UzlegRow[] };

export function UzlegExportButton({ kind }: { kind?: UzlegKind | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={x.trigger} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12v1.5h10V12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {tr('Үзлэгийн тайлан татах')}
      </button>
      {open && <UzlegExportDialog initialKind={kind ?? 'zahialagch'} onClose={() => setOpen(false)} />}
    </>
  );
}

function UzlegExportDialog({ initialKind, onClose }: { initialKind: UzlegKind; onClose: () => void }) {
  const [kind, setKind] = useState<UzlegKind>(initialKind);
  const [data, setData] = useState<Loaded | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const today = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState<Preset | null>('w');
  const [from, setFrom] = useState(() => presetFrom('w', today));
  const [to, setTo] = useState(() => dayStr(today));
  const [cos, setCos] = useState<string[]>([]);
  /* Сонгосон үзлэгүүд — `null` = шүүлтэд орсон БҮГД */
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [fmt, setFmt] = useState<'auto' | 'pdf' | 'xlsx'>('auto');
  const [busy, setBusy] = useState('');
  /** Явцын хувь (0–1) — зураг татах үед; `null` = тодорхойгүй */
  const [prog, setProg] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    let alive = true;
    loadUzlegBoth(kind)
      .then((d) => { if (alive) { setData({ kind, ...d }); setLoadErr(''); } })
      .catch((e: unknown) => { if (alive) setLoadErr(friendlyError(e)); });
    return () => { alive = false; };
  }, [kind]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);

  const ready = data && data.kind === kind ? data : null;
  const inRange = useMemo(() => {
    if (!ready) return [] as number[];
    const a = dayStart(from); const b = dayEnd(to);
    return ready.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.d >= a && r.d <= b).map(({ i }) => i);
  }, [ready, from, to]);
  const companies = useMemo(() => {
    if (!ready) return [] as { key: string; n: number }[];
    const m = new Map<string, number>();
    for (const i of inRange) {
      const c = ready.rows[i].company || '—';
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()].map(([key, n]) => ({ key, n })).sort((p, q) => q.n - p.n || p.key.localeCompare(q.key, 'mn'));
  }, [ready, inRange]);
  const list = useMemo(() => {
    if (!ready) return [] as number[];
    return inRange
      .filter((i) => !cos.length || cos.includes(ready.rows[i].company || '—'))
      .sort((p, q) => ready.rows[q].d - ready.rows[p].d);
  }, [ready, inRange, cos]);
  const chosen = useMemo(() => (picked ? list.filter((i) => picked.has(i)) : list), [list, picked]);
  const effFmt = fmt === 'auto' ? (chosen.length === 1 ? 'pdf' : 'xlsx') : fmt;
  const allOn = chosen.length === list.length && list.length > 0;

  const resetPick = () => { setPicked(null); setDone(''); };
  const pickPreset = (p: Preset) => { setPreset(p); setFrom(presetFrom(p, today)); setTo(dayStr(today)); resetPick(); };
  const togglePick = (i: number) => {
    const next = new Set(picked ?? list);
    if (next.has(i)) next.delete(i); else next.add(i);
    setPicked(next);
    setDone('');
  };
  const toggleCo = (c: string) => {
    setCos((cur) => (cur.includes(c) ? cur.filter((v) => v !== c) : [...cur, c]));
    resetPick();
  };

  const run = async () => {
    if (!ready || !chosen.length) return;
    setErr(''); setDone(''); setProg(null);
    try {
      const url = HABEA.uzleg[kind].url;
      const form = HABEA.uzleg[kind].title;
      setBusy(tr('Маягтын бүтцийг уншиж байна…'));
      const fields = await loadUzFields(url);
      const oids = chosen.map((i) => ready.rows[i].oid);
      /* ⚠️ Excel ч ЗУРАГТАЙ (жишээ файлын «ObjectID N» хуудсанд нүдэнд шигтгэсэн) тул хавсралт,
         байршлыг хоёр форматад хоёуланд нь татна. */
      setBusy(tr('Хавсралтын жагсаалтыг уншиж байна…'));
      const [atts, locs] = await Promise.all([loadUzAttachments(url, oids), loadUzLocations(url, oids)]);
      const reports: UzReport[] = chosen.map((i) => {
        const r = ready.rows[i];
        return buildUzReport(form, fields, ready.raw[i], r.oid, atts.get(r.oid) ?? [], (id) => attUrl(url, r.oid, id), {
          pkg: r.site, company: r.company, date: r.d, formShort: FORM_SHORT[kind], location: locs.get(r.oid) ?? '',
        });
      });
      const one = reports.length === 1 ? reports[0] : null;
      /* Файлын нэр: PDF — «2026-09-29 Морин сувд», Excel — «Морин сувд - Захиалагчийн үзлэг 2026-09-29».
         Олон компани/өдөр бол «Олон компани - … 2026-09-22–2026-09-29». */
      const coSet = [...new Set(reports.map((r) => companyShort(r.company)).filter(Boolean))];
      const days = [...new Set(reports.map((r) => (r.date > 0 ? fmtDate(r.date) : '')).filter(Boolean))].sort();
      const span = days.length <= 1 ? (days[0] ?? from) : `${days[0]}–${days[days.length - 1]}`;
      const xlsBase = one ? reportTitle(one) : `${coSet.length === 1 ? coSet[0] : 'Олон компани'} - ${FORM_SHORT[kind]} ${span}`;
      const base = one
        ? `${one.date > 0 ? fmtDate(one.date) : 'огноогүй'} ${companyShort(one.company) || one.pkg}`
        : xlsBase;
      const img = await loadReportImages(reports, (d, t) => {
        setBusy(tr('Зураг татаж байна… {0}/{1}', num(d), num(t)));
        setProg(t > 0 ? d / t : null);
      });
      setProg(null);
      let file: string;
      if (effFmt === 'pdf') {
        setBusy(tr('PDF үүсгэж байна…'));
        let logo: string | null = null;
        try { const res = await fetch('/logo.svg'); if (res.ok) logo = await res.text(); } catch { logo = null; }
        const b64 = await renderPdfBase64(buildUzPdf(reports, img, logo));
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        file = `${base}.pdf`;
        download(file, new Blob([bytes], { type: 'application/pdf' }));
      } else {
        setBusy(tr('Excel үүсгэж байна…'));
        const bytes = buildUzXlsx(reports, img);
        file = `${xlsBase}.xlsx`;
        download(file, new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      }
      setBusy(''); setProg(null);
      setDone(tr('Татагдлаа: {0}', file));
    } catch (e) {
      setBusy(''); setProg(null);
      setErr(friendlyError(e));
    }
  };

  const lock = !!busy;
  return (
    <div className={x.back} role="presentation" onClick={() => { if (!lock) onClose(); }}>
      <div className={x.box} role="dialog" aria-modal="true" aria-labelledby="uz-exp-title" onClick={(e) => e.stopPropagation()}>
        <header className={x.head}>
          <div>
            <h2 id="uz-exp-title" className={x.title}>{tr('Үзлэгийн тайлан татах')}</h2>
          </div>
          <button type="button" className={x.close} onClick={onClose} aria-label={tr('Хаах')} disabled={lock}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>

        <div className={x.body}>
          {/* ── 1. Асуумж ── */}
          <section className={x.step}>
            <h3 className={x.stepHead}><i>1</i>{tr('Асуумж')}</h3>
            <div className={x.forms} role="radiogroup" aria-label={tr('Асуумж')}>
              {KINDS.map((k) => {
                const on = kind === k;
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} disabled={lock}
                    className={`${x.form} ${on ? x.formOn : ''}`}
                    onClick={() => { if (!on) { setKind(k); setCos([]); resetPick(); } }}>
                    <span className={x.formDot} style={{ background: LAYER_BY_ID[HABEA_UZLEG_LAYER_ID[k]]?.hue ?? 'var(--data)' }} aria-hidden />
                    <span className={x.formName}>{HABEA.uzleg[k].title}</span>
                    {on && ready && <span className={`${x.formCount} num`}>{tr('{0} үзлэг', num(ready.rows.length))}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── 2. Хугацаа ── */}
          <section className={x.step}>
            <h3 className={x.stepHead}><i>2</i>{tr('Хугацаа')}</h3>
            <div className={x.presets}>
              {(['day', 'w', 'm30', 'month', 'all'] as Preset[]).map((p) => (
                <button key={p} type="button" aria-pressed={preset === p} disabled={lock}
                  className={`${x.chip} ${preset === p ? x.chipOn : ''}`} onClick={() => pickPreset(p)}>
                  {presetLabel(p)}
                </button>
              ))}
            </div>
            {preset === 'day' ? (
            <div className={x.dates}>
              <label className={x.field}>
                <span>{tr('Огноо')}</span>
                <input type="date" value={from} max={dayStr(today)} disabled={lock}
                  onChange={(e) => { if (e.target.value) { setFrom(e.target.value); setTo(e.target.value); resetPick(); } }} />
              </label>
              {/* Өмнөх · дараагийн өдөр — нэг товшилтоор өдөр гүйлгэнэ */}
              <div className={x.dayNav}>
                <button type="button" className={x.chip} disabled={lock} aria-label={tr('Өмнөх өдөр')}
                  onClick={() => { const d = dayStr(new Date(dayStart(from) - 86400000)); setFrom(d); setTo(d); resetPick(); }}>‹</button>
                <button type="button" className={x.chip} disabled={lock || from >= dayStr(today)} aria-label={tr('Дараагийн өдөр')}
                  onClick={() => { const d = dayStr(new Date(dayStart(from) + 86400000)); setFrom(d); setTo(d); resetPick(); }}>›</button>
              </div>
            </div>
            ) : (
            <div className={x.dates}>
              <label className={x.field}>
                <span>{tr('Эхлэх огноо')}</span>
                <input type="date" value={from} max={to} disabled={lock}
                  onChange={(e) => { setFrom(e.target.value); setPreset(null); resetPick(); }} />
              </label>
              <span className={x.dash} aria-hidden>—</span>
              <label className={x.field}>
                <span>{tr('Дуусах огноо')}</span>
                <input type="date" value={to} min={from} disabled={lock}
                  onChange={(e) => { setTo(e.target.value); setPreset(null); resetPick(); }} />
              </label>
            </div>
            )}
          </section>

          {loadErr && <p className={x.err} role="alert">{tr('Татагдсангүй: {0}', loadErr)}</p>}
          {!ready && !loadErr && <div className={x.skeleton} aria-busy="true">{tr('Үзлэгүүдийг уншиж байна…')}</div>}

          {ready && (
            <>
              {/* ── 3. Компани ── */}
              <section className={x.step}>
                <h3 className={x.stepHead}>
                  <i>3</i>{tr('Компани')}
                  {cos.length > 0 && (
                    <button type="button" className={x.link} onClick={() => { setCos([]); resetPick(); }} disabled={lock}>{tr('Бүгд')}</button>
                  )}
                </h3>
                {companies.length
                  ? (
                    <div className={x.chips}>
                      {companies.map((c) => {
                        const on = cos.includes(c.key);
                        return (
                          <button key={c.key} type="button" aria-pressed={on} disabled={lock}
                            className={`${x.chip} ${on ? x.chipOn : ''}`} onClick={() => toggleCo(c.key)} title={c.key}>
                            <span className={x.chipText}>{c.key}</span>
                            <b className="num">{num(c.n)}</b>
                          </button>
                        );
                      })}
                    </div>
                  )
                  : <p className={x.empty}>{tr('Энэ хугацаанд үзлэг алга')}</p>}
              </section>

              {/* ── 4. Үзлэг ── */}
              <section className={x.step}>
                <h3 className={x.stepHead}>
                  <i>4</i>{tr('Үзлэг')}
                  <span className={`${x.meta} num`}>{tr('{0}/{1} сонгосон', num(chosen.length), num(list.length))}</span>
                  {list.length > 0 && (
                    <button type="button" className={x.link} disabled={lock}
                      onClick={() => { setPicked(allOn ? new Set() : null); setDone(''); }}>
                      {allOn ? tr('Бүгдийг болих') : tr('Бүгдийг сонгох')}
                    </button>
                  )}
                </h3>
                {list.length
                  ? (
                    <div className={x.list} role="list">
                      {list.map((i) => {
                        const r = ready.rows[i];
                        const on = !picked || picked.has(i);
                        const p = r.scA != null && r.scA > 0 && r.scE != null ? (r.scE / r.scA) * 100 : null;
                        const nc = r.major + r.minor;
                        return (
                          <label key={r.oid} className={`${x.row} ${on ? x.rowOn : ''}`} role="listitem">
                            <input type="checkbox" checked={on} onChange={() => togglePick(i)} disabled={lock} />
                            <span className={x.rowMain}>
                              <span className={x.rowTop}>
                                <b className="num">{r.d > 0 ? fmtDate(r.d) : '—'}</b>
                                <span className={x.pkg}>{r.site || '—'}</span>
                              </span>
                              <span className={x.rowCo} title={r.company}>{r.company || '—'}</span>
                            </span>
                            {nc > 0 && (
                              <span className={`${x.flag} ${r.major > 0 ? x.flagMajor : ''} num`} title={tr('Ноцтой {0} · Бага зэргийн {1}', num(r.major), num(r.minor))}>
                                {tr('{0} үл нийцэл', num(nc))}
                              </span>
                            )}
                            <span className={`${x.score} ${scoreTone(p)} num`}>{p == null ? '—' : `${p.toFixed(1)}%`}</span>
                          </label>
                        );
                      })}
                    </div>
                  )
                  : <p className={x.empty}>{tr('Сонгосон шүүлтэд үзлэг алга')}</p>}
              </section>
            </>
          )}
        </div>

        <footer className={x.foot}>
          {ready && (
            <div className={x.fmt} role="radiogroup" aria-label={tr('Формат')}>
              {(['pdf', 'xlsx'] as const).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={effFmt === f} disabled={lock}
                  className={`${x.fmtOpt} ${effFmt === f ? x.fmtOn : ''}`} onClick={() => setFmt(f)}>
                  <b>{f === 'pdf' ? 'PDF' : 'Excel'}</b>
                </button>
              ))}
            </div>
          )}
          {chosen.length > PDF_MANY_WARN && (
            <p className={x.note}>{tr('{0} үзлэгийн зургийг татах тул файл удаан үүснэ.', num(chosen.length))}</p>
          )}
          {err && <p className={x.err} role="alert">{err}</p>}
          {busy && (
            <div className={x.progress} aria-live="polite">
              <span>{busy}</span>
              <div className={x.bar}><i style={prog == null ? undefined : { width: `${Math.round(prog * 100)}%` }} className={prog == null ? x.barIndet : ''} /></div>
            </div>
          )}
          {done && !busy && <p className={x.done} role="status">{done}</p>}
          <div className={x.actions}>
            <button type="button" className={x.btn} onClick={onClose} disabled={lock}>{tr('Болих')}</button>
            <button type="button" className={`${x.btn} ${x.pri}`} onClick={() => { void run(); }}
              disabled={lock || !ready || !chosen.length}>
              {effFmt === 'pdf' ? tr('PDF татах') : tr('Excel татах')}
              {chosen.length > 0 && <span className={`${x.btnCount} num`}>{num(chosen.length)}</span>}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
