'use client';

/**
 * САР БҮРИЙН IPC БАРИМТ ТАТАХ (2026-09-29, хэрэглэгч: «ipc баримтуудыг загвар гэж бодоод
 * бодит утгууд нь системээс гараад яг ийм форматаар pdf татаж авна · гүйцэтгэлийг сард
 * нэг удаа бөглөнө гэж тооцоод тухайн сард нэг ийм баримт гарна»).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { loadIpcSource, sheetsOf, type IpcSource } from '@/lib/ipcDocLoad';
import { buildIpcDoc, type IpcNote } from '@/lib/ipcDoc';
import { downloadIpcPdf, EMPTY_SIGNERS, type IpcSigners } from '@/lib/ipcPdf';
import s from './ipcDoc.module.css';
import { userError } from '@/components/ui';
import { parseCell, type ParseMsg } from '@/lib/finEdit';

type Saved = {
  capacity: string;
  annual: string;
  rate: string;
  recoveryFrom: string;
  signers: IpcSigners;
};
const LS = (packKey: string) => `selbe-ipc-doc|${packKey}`;
function readSaved(packKey: string): Partial<Saved> {
  try { return JSON.parse(localStorage.getItem(LS(packKey)) ?? '{}') as Partial<Saved>; } catch { return {}; }
}
function writeSaved(packKey: string, v: Saved): void {
  try { localStorage.setItem(LS(packKey), JSON.stringify(v)); } catch { /* хаалттай орчин */ }
}

const NOTE_UI = (n: IpcNote): string => ({
  noPrev: tr('Системд өмнөх сарын батлагдсан гүйцэтгэл алга — тайлант үеийн гүйцэтгэл нь эхнээсээ хуримтлагдсан дүн.'),
  noAdvance: tr('ХО-д урьдчилгааны бүртгэл алга — урьдчилгаа ба эргэн төлөлт 0.'),
  negative: tr('Энэ сарын гүйцэтгэл өмнөх сараас буурсан (засвар) — сөрөг дүн.'),
  over: tr('Хуримтлагдсан гүйцэтгэл гэрээний дүнгээс давсан.'),
}[n]);

const SIGNER_LABELS = (): [keyof IpcSigners, string][] => [
  ['approve', tr('Батлав — НЗДТГ-ын хөрөнгө оруулалтын хэлтсийн дарга')],
  ['ceo', tr('Гүйцэтгэх захирал')],
  ['chiefAcc', tr('Ерөнхий нягтлан бодогч')],
  ['hoSpec', tr('Хөрөнгө оруулалтын хэлтсийн мэргэжилтэн')],
  ['pmoHead', tr('Төслийн удирдлагын газрын дарга')],
  ['pmoDept', tr('Төслийн удирдлагын хэлтсийн дарга')],
  ['pm', tr('Төслийн менежер')],
  ['cDir', tr('Гүйцэтгэгч — захирал')],
  ['cAcc', tr('Гүйцэтгэгч — нягтлан бодогч')],
  ['cEng', tr('Гүйцэтгэгч — инженер')],
];

const PARSE_MSG: ParseMsg = {
  dateFmt: (l, v) => tr('«{0}» — огноо ЖЖЖЖ-СС-ӨӨ хэлбэрээр байх ёстой: {1}', l, v),
  dateBad: (l, v) => tr('«{0}» — огноо буруу: {1}', l, v),
  numBad: (l, v) => tr('«{0}» — тоо буруу: {1}', l, v),
  numAmbig: (l, v) => tr('«{0}» — «{1}»: таслал мянгатын уу, аравтын уу тодорхойгүй. Таслалгүй (1250) эсвэл цэгтэй (1.25) бичнэ үү.', l, v),
  pctRange: (l, v) => tr('«{0}» — хувь 0–100 хооронд байх ёстой: {1}', l, v),
};

/** Тоон талбар — утга (хоосон бол `null`) эсвэл алдааны текст */
type NumField = { v: number | null; err: string };
const parseNum = (raw: string, label: string, pct = false): NumField => {
  try {
    return { v: parseCell(raw, 'esriFieldTypeDouble', label, PARSE_MSG, pct) as number | null, err: '' };
  } catch (e) {
    return { v: null, err: e instanceof Error ? e.message : String(e) };
  }
};

/** Бөглөх хуудастай (барилгын) багц мөн үү — IPC баримт зөвхөн эдгээрт */
export const hasIpcDoc = (packKey: string): boolean => !!packKey && sheetsOf(packKey).length > 0;

export function IpcDocDialog({ packKey, packName, month: month0, ipcNo: ipcNo0, onClose }: {
  packKey: string;
  packName: string;
  /** Картын сар (`YYYY-MM`) — архивт байхгүй бол хамгийн сүүлийн сар */
  month?: string;
  /** Картын IPC дугаар (гэрээний гүйцэтгэлийн төлбөрүүдийн дараалал) */
  ipcNo?: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  const [src, setSrc] = useState<IpcSource | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = useMemo(() => readSaved(packKey), [packKey]);
  const [month, setMonth] = useState('');
  const [ipcNo, setIpcNo] = useState('');
  const [annual, setAnnual] = useState(saved.annual ?? '');
  const [rate, setRate] = useState(saved.rate ?? '25');
  const [recoveryFrom, setRecoveryFrom] = useState(saved.recoveryFrom ?? '');
  const [capacity, setCapacity] = useState(saved.capacity ?? '');
  const [signers, setSigners] = useState<IpcSigners>({ ...EMPTY_SIGNERS, ...(saved.signers ?? {}) });

  useEffect(() => {
    let alive = true;
    loadIpcSource(packKey)
      .then((x) => {
        if (!alive) return;
        setSrc(x);
        const want = month0 ? x.months.find((m) => m.month === month0) : undefined;
        const pick = want ?? x.months[x.months.length - 1];
        if (!pick) return;
        setMonth(pick.month);
        setIpcNo(String(want && ipcNo0 ? ipcNo0 : x.months.indexOf(pick) + 1));
        if (month0 && !want) setErr(tr('{0} сард батлагдсан гүйцэтгэл архивт алга — хамгийн сүүлийн сарыг сонголоо.', month0));
      })
      .catch((e) => { if (alive) setErr(userError(e)); });
    return () => { alive = false; };
  }, [packKey, month0, ipcNo0]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);

  const rateF = useMemo(() => parseNum(rate, tr('Эргэн төлөлтийн хувь (%)'), true), [rate]);
  const annualF = useMemo((): NumField => {
    const label = tr('Тухайн онд батлагдсан санхүүжилт');
    const f = parseNum(annual, label);
    return !f.err && f.v != null && f.v < 0 ? { v: null, err: tr('«{0}» — тоо буруу: {1}', label, annual.trim()) } : f;
  }, [annual]);
  const ipcNoF = useMemo((): NumField => {
    const label = tr('IPC дугаар');
    const f = parseNum(ipcNo, label);
    if (f.err) return f;
    return f.v != null && Number.isInteger(f.v) && f.v >= 1
      ? f
      : { v: null, err: tr('«{0}» — 1-ээс багагүй бүхэл тоо байх ёстой: {1}', label, ipcNo.trim()) };
  }, [ipcNo]);
  const invalid = !!(rateF.err || annualF.err || ipcNoF.err);

  const doc = useMemo(() => {
    if (!src || !month || src.contract == null || invalid || ipcNoF.v == null) return null;
    return buildIpcDoc({
      ...src,
      contract: src.contract,
      month,
      recoveryFrom: recoveryFrom || null,
      recoveryRate: rateF.v != null ? rateF.v / 100 : undefined,
      annual: annualF.v,
      ipcNo: ipcNoF.v,
    });
  }, [src, month, recoveryFrom, rateF, annualF, ipcNoF, invalid]);

  const download = async () => {
    if (!doc || busy || invalid) return;
    setBusy(true); setErr('');
    try {
      writeSaved(packKey, { capacity, annual, rate, recoveryFrom, signers });
      await downloadIpcPdf(doc, { capacity, signers });
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  };

  const monthsDesc = src ? [...src.months].reverse() : [];
  const nowRow = doc?.t7.find((r) => r.label === 'Гүйцэтгэгчид төлөх дүн') ?? null;
  const gross = doc?.g1[doc.g1.length - 1]?.now ?? null;
  const fundNow = doc?.t7[0]?.now ?? null;

  return (
    <div className={s.back} role="presentation" onClick={() => { if (!busy) onClose(); }}>
      <div ref={ref} className={s.box} role="dialog" aria-modal="true" aria-label={tr('IPC баримт татах')}
        onClick={(e) => e.stopPropagation()}>
        <div className={s.head}>
          <b>{tr('IPC баримт — {0}', packName)}</b>
          <button type="button" className={s.x} onClick={onClose} aria-label={tr('Хаах')} disabled={busy}>×</button>
        </div>
        <p className={s.sub}>
          {tr('Хүснэгт 7 · Гүйцэтгэл-1 · Хавсралт №12 — тухайн сарын батлагдсан гүйцэтгэлээс (обьём × нэгж өртөг) ба ХО-гийн гэрээнээс. Сард нэг баримт.')}
        </p>

        {err && <p className={s.err} role="alert">{err}</p>}
        {!src && !err && <p className={s.sub}>{tr('Гүйцэтгэлийн архивыг уншиж байна…')}</p>}
        {src && !src.months.length && <p className={s.err}>{tr('Энэ багцад батлагдсан гүйцэтгэл алга.')}</p>}
        {src?.warn && <p className={s.note}>⚠ {src.warn}</p>}
        {src && src.contract == null && <p className={s.err}>{tr('ХО-д энэ багцын гэрээний дүн бүртгэгдээгүй — баримт гаргах боломжгүй.')}</p>}

        {src && src.months.length > 0 && (
          <div className={s.grid}>
            <label className={s.field}>
              {tr('Сар')}
              <select value={month} onChange={(e) => {
                setMonth(e.target.value);
                const i = src.months.findIndex((m) => m.month === e.target.value);
                const base = month0 ? src.months.findIndex((m) => m.month === month0) : -1;
                const n0 = Number(ipcNo0);
                if (i >= 0) setIpcNo(String(base >= 0 && Number.isFinite(n0) && n0 > 0 ? Math.max(1, n0 + (i - base)) : i + 1));
              }}>
                {monthsDesc.map((m) => <option key={m.month} value={m.month}>{m.month} · {m.day}</option>)}
              </select>
            </label>
            <label className={s.field}>
              {tr('IPC дугаар')}
              <input inputMode="numeric" value={ipcNo} onChange={(e) => setIpcNo(e.target.value)}
                aria-invalid={!!ipcNoF.err || undefined} />
              {ipcNoF.err && <span className={s.err} role="alert">{ipcNoF.err}</span>}
            </label>
            <label className={s.field}>
              {tr('Тухайн онд батлагдсан санхүүжилт')}
              <input inputMode="decimal" value={annual} placeholder={tr('системд алга — сонголттой')}
                onChange={(e) => setAnnual(e.target.value)} aria-invalid={!!annualF.err || undefined} />
              {annualF.err && <span className={s.err} role="alert">{annualF.err}</span>}
            </label>
            <label className={s.field}>
              {tr('Хүчин чадал')}
              <input value={capacity} placeholder={tr('жишээ: 71 айлын 9-н давхар барилга, 12 блок')}
                onChange={(e) => setCapacity(e.target.value)} />
            </label>
            <label className={s.field}>
              {tr('Урьдчилгааны эргэн төлөлт эхлэх сар')}
              <select value={recoveryFrom} onChange={(e) => setRecoveryFrom(e.target.value)}>
                <option value="">{tr('Эхний сараас')}</option>
                {src.months.map((m) => <option key={m.month} value={m.month}>{m.month}</option>)}
              </select>
            </label>
            <label className={s.field}>
              {tr('Эргэн төлөлтийн хувь (%)')}
              <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)}
                aria-invalid={!!rateF.err || undefined} />
              {rateF.err && <span className={s.err} role="alert">{rateF.err}</span>}
            </label>
          </div>
        )}

        {doc && (
          <div className={s.sum}>
            <span>{tr('Тайлант үеийн гүйцэтгэл')}<b>{gross == null ? '—' : num(gross, 0)}</b></span>
            <span>{tr('Одоо санхүүжих')}<b>{fundNow == null ? '—' : num(fundNow, 0)}</b></span>
            <span>{tr('Гүйцэтгэгчид төлөх')}<b>{nowRow?.now == null ? '—' : num(nowRow.now, 0)}</b></span>
          </div>
        )}
        {doc?.notes.map((n) => <p key={n} className={s.note}>⚠ {NOTE_UI(n)}</p>)}
        {doc && doc.lateSheets.length > 0 && (
          <p className={s.note}>
            {tr('⚠ {0} хуудасны анхны батлагдсан гүйцэтгэл энэ сард — өмнөх IPC саруудад хэмжигдээгүй тул энэ IPC-ийн тайлант гүйцэтгэлд гэрээний эхнээс хуримтлагдсан ажил орсон.', doc.lateSheets.join(', '))}
          </p>
        )}

        {src && src.months.length > 0 && (
          <details className={s.sig}>
            <summary>{tr('Гарын үсэг зурах хүмүүс (сонголттой)')}</summary>
            <div className={s.grid}>
              {SIGNER_LABELS().map(([k, label]) => (
                <label key={k} className={s.field}>
                  {label}
                  <input value={signers[k]} placeholder={tr('жишээ: Б.Болд')}
                    onChange={(e) => setSigners((x) => ({ ...x, [k]: e.target.value }))} />
                </label>
              ))}
            </div>
          </details>
        )}

        <div className={s.foot}>
          <button type="button" className={s.btn} onClick={onClose} disabled={busy}>{tr('Хаах')}</button>
          <button type="button" className={`${s.btn} ${s.pri}`} disabled={!doc || busy || invalid} onClick={() => void download()}>
            {busy ? tr('Бэлтгэж байна…') : tr('PDF татах')}
          </button>
        </div>
      </div>
    </div>
  );
}
