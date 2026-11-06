'use client';

/**
 * ҮЛ НИЙЦЛИЙН АРИЛГАЛТ (HSE_Action) — ТАЙЛАН ТАТАХ ЦОНХ (2026-11-02, хэрэглэгчийн хүсэлт).
 * «Тайлан татах»-ын асуумжийн жагсаалтын «Action» хавтангаас нээгдэнэ (`UzlegExport`).
 *
 *   1. Хугацаа — сүүлийн 7 хоног · сүүлийн 30 хоног (сар) · огноо сонгох · бүгд
 *   2. Багц    — олон сонголт (хоосон = бүх багц), хугацаандаа тоотой
 *   Формат    — PDF (нийт → төрлөөр чарт → дэлгэрэнгүй жагсаалт) эсвэл Excel (Тойм · Action)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { ubDayKey } from '@/lib/ceo/workforce';
import { num } from '@/lib/format';
import { friendlyError } from '@/components/ui';
import { renderPdfBase64, download } from '@/lib/emailReport';
import { getAuth } from '@/lib/draftRemote';
import { devToken } from '@/lib/authToken';
import { buildActionPdf, buildActionXlsx, loadActionItems, loadActionPhotos, summarize, type ActionItem } from '@/lib/actionReport';
import { loadPhotoImages } from '@/lib/uzlegReport';
import { XLSX_MIME } from '@/lib/xlsx';
import { habeaPkgKey } from './habeaUzleg';
import x from './uzlegExport.module.css';

const dayStr = (d: number) => ubDayKey(d);
const dayStart = (v: string) => Date.parse(`${v}T00:00:00+08:00`);
const dayEnd = (v: string) => Date.parse(`${v}T23:59:59.999+08:00`);

type Preset = 'w' | 'm' | 'custom' | 'all';
const PRESETS: { key: Preset; label: () => string }[] = [
  { key: 'w', label: () => tr('Сүүлийн 7 хоног') },
  { key: 'm', label: () => tr('Сүүлийн сар') },
  { key: 'custom', label: () => tr('Огноо сонгох') },
  { key: 'all', label: () => tr('Бүгд') },
];

export function ActionExportDialog({ scope = null, onClose, onBack }: {
  /** ХАБЭА харах хүрээ (`habeaPkgKey`) — `null` = бүх багц (2026-11-03) */
  scope?: readonly string[] | null;
  onClose: () => void; onBack?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  useFocusTrap(boxRef, true);
  const [now] = useState(() => Date.now());
  const today = dayStr(now);
  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [preset, setPreset] = useState<Preset>('w');
  const [from, setFrom] = useState(() => dayStr(now - 6 * 86_400_000));
  const [to, setTo] = useState(today);
  const [pkgs, setPkgs] = useState<string[]>([]);
  const [fmt, setFmt] = useState<'pdf' | 'xlsx'>('pdf');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const auth = await getAuth();
      if (!auth && !devToken()) throw new Error(tr('Үзлэгийн маягтыг зөвхөн нэвтэрсэн хэрэглэгч харна — порталд нэвтэрнэ үү.'));
      return loadActionItems();
    })()
      .then((d) => { if (alive) setItems(d); })
      .catch((e: unknown) => { if (alive) setLoadErr(friendlyError(e)); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);

  const pickPreset = (p: Preset) => {
    setPreset(p); setDone(''); setErr('');
    if (p === 'w') { setFrom(dayStr(now - 6 * 86_400_000)); setTo(today); }
    if (p === 'm') { setFrom(dayStr(now - 29 * 86_400_000)); setTo(today); }
  };

  const inRange = useMemo(() => {
    if (!items) return [] as ActionItem[];
    const mine = scope ? items.filter((r) => scope.includes(habeaPkgKey(r.site))) : items;
    if (preset === 'all') return mine;
    const a = dayStart(from); const b = dayEnd(to);
    return mine.filter((r) => r.d > 0 && r.d >= a && r.d <= b);
  }, [items, preset, from, to, scope]);
  const pkgCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of inRange) { const k = r.site || '—'; m.set(k, (m.get(k) ?? 0) + 1); }
    /* Сонгосон багц энэ хугацаанд action-гүй бол 0 тоотойгоор үлдэнэ — шүүлт нуугдахгүй */
    for (const k of pkgs) if (!m.has(k)) m.set(k, 0);
    return [...m.entries()].sort((p, q) => p[0].localeCompare(q[0], 'mn', { numeric: true }));
  }, [inRange, pkgs]);
  const chosen = useMemo(
    () => (pkgs.length ? inRange.filter((r) => pkgs.includes(r.site || '—')) : inRange),
    [inRange, pkgs],
  );
  const sum = useMemo(() => summarize(chosen, now), [chosen, now]);
  const period = preset === 'all' ? tr('Бүх хугацаа') : `${from} – ${to}`;

  const run = async () => {
    if (!chosen.length) return;
    setErr(''); setDone('');
    try {
      const meta = { period, pkgs, now };
      const base = `HSE Non-Compliance Report ${preset === 'all' ? 'бүх хугацаа' : `${from}–${to}`}${pkgs.length === 1 ? ` ${pkgs[0]}` : ''}`;
      if (fmt === 'pdf') {
        setBusy(tr('PDF үүсгэж байна…'));
        let logo: string | null = null;
        try { const res = await fetch('/logo.svg'); if (res.ok) logo = await res.text(); } catch { logo = null; }
        const b64 = await renderPdfBase64(buildActionPdf(chosen, meta, logo));
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        download(`${base}.pdf`, new Blob([bytes], { type: 'application/pdf' }));
        setDone(tr('Татагдлаа: {0}', `${base}.pdf`));
      } else {
        setBusy(tr('Зургийг хайж байна…'));
        const photos = await loadActionPhotos(chosen);
        const refs = [...new Map([...photos.values()].flat().map((p) => [p.url, p])).values()].map((ref) => ({ ref, max: 640 }));
        const { images, failed } = await loadPhotoImages(refs, {
          mode: 'xlsx',
          onProgress: (d, t) => setBusy(tr('Зураг татаж байна… {0}/{1}', num(d), num(t))),
        });
        setBusy(tr('Excel үүсгэж байна…'));
        const bytes = buildActionXlsx(chosen, meta, photos, images);
        if (failed.length) setErr(tr('{0} зураг татагдсангүй', num(failed.length)));
        download(`${base}.xlsx`, new Blob([bytes as BlobPart], { type: XLSX_MIME }));
        setDone(tr('Татагдлаа: {0}', `${base}.xlsx`));
      }
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy('');
    }
  };

  const lock = !!busy;
  return (
    <div className={x.back} role="presentation" onClick={() => { if (!lock) onClose(); }}>
      <div ref={boxRef} className={x.box} role="dialog" aria-modal="true" aria-labelledby="act-exp-title" onClick={(e) => e.stopPropagation()}>
        <header className={x.head}>
          <div>
            <h2 id="act-exp-title" className={x.title}>{'HSE Non-Compliance Report'}</h2>
          </div>
          <button type="button" className={x.close} onClick={onClose} aria-label={tr('Хаах')} disabled={lock}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>

        <div className={x.body}>
          {/* ── 1. Хугацаа ── */}
          <section className={x.step}>
            <h3 className={x.stepHead}>
              <i>1</i>{tr('Хугацаа')}
              {onBack && <button type="button" className={x.link} onClick={onBack} disabled={lock}>{tr('‹ Асуумж')}</button>}
            </h3>
            <div className={x.presets}>
              {PRESETS.map((p) => (
                <button key={p.key} type="button" aria-pressed={preset === p.key} disabled={lock}
                  className={`${x.chip} ${preset === p.key ? x.chipOn : ''}`} onClick={() => pickPreset(p.key)}>
                  {p.label()}
                </button>
              ))}
            </div>
            {preset !== 'all' && (
              <div className={x.dates}>
                <label className={x.field}>
                  <span>{tr('Эхлэх огноо')}</span>
                  <input type="date" value={from} max={to} disabled={lock}
                    onChange={(e) => { setFrom(e.target.value); setPreset('custom'); setDone(''); }} />
                </label>
                <span className={x.dash} aria-hidden>—</span>
                <label className={x.field}>
                  <span>{tr('Дуусах огноо')}</span>
                  <input type="date" value={to} min={from} max={today} disabled={lock}
                    onChange={(e) => { setTo(e.target.value); setPreset('custom'); setDone(''); }} />
                </label>
              </div>
            )}
          </section>

          {loadErr && <p className={x.err} role="alert">{tr('Татагдсангүй: {0}', loadErr)}</p>}
          {!items && !loadErr && <div className={x.skeleton} aria-busy="true">{tr('Action-уудыг уншиж байна…')}</div>}

          {items && (
            <>
              {/* ── 2. Багц ── */}
              <section className={x.step}>
                <h3 className={x.stepHead}>
                  <i>2</i>{tr('Багц')}
                  {pkgs.length > 0 && (
                    <button type="button" className={x.link} onClick={() => { setPkgs([]); setDone(''); }} disabled={lock}>{tr('Бүгд')}</button>
                  )}
                </h3>
                {pkgCounts.length
                  ? (
                    <div className={x.chips}>
                      {pkgCounts.map(([k, n]) => {
                        const on = pkgs.includes(k);
                        return (
                          <button key={k} type="button" aria-pressed={on} disabled={lock}
                            className={`${x.chip} ${on ? x.chipOn : ''}`}
                            onClick={() => { setPkgs((cur) => (cur.includes(k) ? cur.filter((v) => v !== k) : [...cur, k])); setDone(''); }}>
                            <span className={x.chipText}>{k}</span>
                            <b className="num">{num(n)}</b>
                          </button>
                        );
                      })}
                    </div>
                  )
                  : <p className={x.empty}>{tr('Энэ хугацаанд action алга')}</p>}
              </section>

              {/* ── Тойм ── */}
              <section className={x.step}>
                <h3 className={x.stepHead}><i>3</i>{tr('Тойм')}</h3>
                <p className={x.note}>
                  {tr('{0} ажил · {1} дууссан · {2} нээлттэй · {3} хугацаа хэтэрсэн · {6} дуусах хугацаагүй · ноцтой {4} · бага зэргийн {5}',
                    num(sum.total), num(sum.done), num(sum.open), num(sum.overdue), num(sum.major), num(sum.minor), num(sum.noDue))}
                </p>
              </section>
            </>
          )}
        </div>

        <footer className={x.foot}>
          <div className={x.fmt} role="radiogroup" aria-label={tr('Формат')}>
            {(['pdf', 'xlsx'] as const).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={fmt === f} disabled={lock}
                className={`${x.fmtOpt} ${fmt === f ? x.fmtOn : ''}`} onClick={() => setFmt(f)}>
                <b>{f === 'pdf' ? 'PDF' : 'Excel'}</b>
              </button>
            ))}
          </div>
          {err && <p className={x.err} role="alert">{err}</p>}
          {busy && <div className={x.progress} aria-live="polite"><span>{busy}</span><div className={x.bar}><i className={x.barIndet} /></div></div>}
          {done && !busy && <p className={x.done} role="status">{done}</p>}
          <div className={x.actions}>
            <button type="button" className={x.btn} onClick={onClose} disabled={lock}>{tr('Болих')}</button>
            <button type="button" className={`${x.btn} ${x.pri}`} onClick={() => { void run(); }} disabled={lock || !items || !chosen.length}>
              {fmt === 'pdf' ? tr('PDF татах') : tr('Excel татах')}
              {chosen.length > 0 && <span className={`${x.btnCount} num`}>{num(chosen.length)}</span>}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
