'use client';

/**
 * ХАБЭА — БҮРТГЭЛ ОРУУЛАХ ЦОНХНУУД (2026-10-08, хэрэглэгчийн хүсэлт: «энд байгаа мэдээлэл
 * дээр дата нэмдэг хэсэг — хэрэглэгчийн эрхээр, бусдад энгийн харагдана»).
 *
 *   · `RegisterAddDialog` — «Бусад үзүүлэлт»: төрөл (талбайн зааварчилгаа · сануулах
 *     хуудас · хариуцлага тооцох) сонгоод тэр хүснэгтийн талбаруудыг бөглөнө. Талбарууд
 *     МЕТАДАТААС (`loadEntryFields`) — хүснэгтэд багана нэмэгдвэл маягт өөрөө дагана.
 *   · `WasteAddDialog` — «Хог хаягдал»: долоо хоног × төрөл сонгоод багц бүрийн тоо.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { HABEA } from '@/lib/services';
import { friendlyError, Loading } from '@/components/ui';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { ubDayKey } from '@/lib/ceo/workforce';
import {
  addRegister, addWaste, entryFieldLabel, habeaEntConfigured, HabeaEntSignInRequired, HabeaLostWrite, isWeekNo, lastFullWeek, loadEntryFields,
  loadWasteMetrics, newGlobalId, nextNumber, registerSig, type EntryField,
} from '@/lib/habeaRegisters';
import { EntSignIn, useEntSession } from '@/components/EntSignIn';
import x from './uzlegExport.module.css';
import e from './habeaEntry.module.css';

const todayStr = () => ubDayKey(Date.now());
/** «YYYY-MM-DD» → UTC шөнө дунд (хүснэгтийн байгаа хэвтэй ижил) */
const utcDay = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
};
/** «№» / «д/д» — автоматаар дараагийн дугаар санал болгох талбар */
const isSeq = (f: EntryField) => f.type === 'number' && /^(№|д\/д)$/i.test(f.alias.trim());
/** Хариу алдагдсан бичилтийн мессеж нь өөрөө тайлбартай — `friendlyError` ангилалд оруулахгүй */
const errText = (ex: unknown) => (ex instanceof HabeaLostWrite || ex instanceof HabeaEntSignInRequired ? ex.message : friendlyError(ex));

function EntGate({ ok }: { ok: boolean }) {
  if (!habeaEntConfigured()) {
    return (
      <p className={e.muted} role="note">
        {tr('Геопортал тохируулагдаагүй — бүртгэл нэвтрэлтгүй (нэргүй) хадгалагдана. Админд мэдэгдэнэ үү.')}
      </p>
    );
  }
  if (ok) return <EntSignIn compact />;
  return (
    <>
      <p className={e.muted} role="status">
        {tr('ХАБЭА-гийн бүртгэл Enterprise геопорталд хадгалагддаг — хадгалахын өмнө Enterprise-д нэвтэрнэ үү.')}
      </p>
      <EntSignIn compact />
    </>
  );
}
/** «Багц 3.1» (шүүлтийн түлхүүр) → дэлгэцийн нэр */
export const pkgColLabel = (name: string) => tr('Багц {0}', name.replace(/^Багц\s*/, ''));

/**
 * Картын гарчгийн жижиг «+ Нэмэх» товч — ЗӨВХӨН эрхтэйд зурагдана (дуудагч шийднэ).
 */
export function AddButton({ onClick, disabled = false, note }: { onClick?: () => void; disabled?: boolean; note?: string }) {
  const btn = (
    <button type="button" className={e.add} onClick={onClick} disabled={disabled}
      title={note ?? tr('Бүртгэл нэмэх')} aria-label={note ? `${tr('Нэмэх')} — ${note}` : undefined}>
      + {tr('Нэмэх')}
    </button>
  );
  return disabled && note ? <span title={note}>{btn}</span> : btn;
}

function Shell({ title, busy, onClose, children, foot }: {
  title: string; busy: boolean; onClose: () => void; children: React.ReactNode; foot: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const downOnBack = useRef(false);
  useFocusTrap(boxRef);
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);
  return (
    <div
      className={x.back}
      role="presentation"
      onMouseDown={(ev) => { downOnBack.current = ev.target === ev.currentTarget; }}
      onMouseUp={(ev) => {
        const both = downOnBack.current && ev.target === ev.currentTarget;
        downOnBack.current = false;
        if (both && !busy) onClose();
      }}
    >
      <div ref={boxRef} className={`${x.box} ${e.box}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className={x.head}>
          <div><h2 className={x.title}>{title}</h2></div>
          <button type="button" className={x.close} onClick={onClose} aria-label={tr('Хаах')} disabled={busy}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className={x.body}>{children}</div>
        <footer className={x.foot}>{foot}</footer>
      </div>
    </div>
  );
}

/* ═════════════ «Бусад үзүүлэлт» — бүртгэл нэмэх ═════════════ */

export function RegisterAddDialog({ onClose }: { onClose: () => void }) {
  const kinds = HABEA.registers.items.filter((it) => it.table != null);
  const [kind, setKind] = useState(kinds[0]?.key ?? '');
  const item = kinds.find((k) => k.key === kind) ?? kinds[0];
  const [fields, setFields] = useState<EntryField[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  /** Санал болгосон дугаар — хэрэглэгч өөрчлөөгүй бол хадгалахын ЯГ ӨМНӨ дахин бодно */
  const [seqHint, setSeqHint] = useState<{ name: string; value: string } | null>(null);
  const [gid, setGid] = useState(newGlobalId);
  const [prior, setPrior] = useState<{ sig: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ent = useEntSession();
  const entOk = !!ent || !habeaEntConfigured();

  const pickKind = useCallback((k: string) => {
    setKind(k);
    setGid(newGlobalId());
    setPrior(null);
  }, []);

  useEffect(() => {
    let alive = true;
    const t = item?.table;
    if (t == null) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- төрөл солигдоход маягтыг цэвэрлэж дахин ачаална
    setFields(null);
    setErr('');
    setSeqHint(null);
    loadEntryFields(t)
      .then(async (fs) => {
        const init: Record<string, string> = {};
        const dateName = fs.find((f) => f.type === 'date' && f.name === item?.date)?.name
          ?? fs.find((f) => f.type === 'date')?.name;
        if (dateName) init[dateName] = todayStr();
        const seq = fs.find(isSeq);
        let hint: { name: string; value: string } | null = null;
        if (seq) {
          const n = await nextNumber(t, seq.name).catch(() => null);
          if (n != null) { init[seq.name] = String(n); hint = { name: seq.name, value: String(n) }; }
        }
        if (alive) { setFields(fs); setVals(init); setSeqHint(hint); }
      })
      .catch((ex: unknown) => { if (alive) setErr(friendlyError(ex)); });
    return () => { alive = false; };
  }, [item?.table, item?.date]);

  const dateField = fields?.find((f) => f.type === 'date' && f.name === item?.date) ?? fields?.find((f) => f.type === 'date');
  const ok = !!fields && (!dateField || !!vals[dateField.name]);

  const save = async () => {
    if (!fields || item?.table == null) return;
    setBusy(true);
    setErr('');
    const attrs: Record<string, unknown> = {};
    for (const f of fields) {
      const v = (vals[f.name] ?? '').trim();
      if (!v) continue;
      attrs[f.name] = f.type === 'date' ? utcDay(v) : f.type === 'number' ? Number(v) : v;
    }
    const sig = registerSig(attrs);
    const retry = prior != null && prior.sig === sig;
    try {
      const autoSeq = seqHint && (vals[seqHint.name] ?? '').trim() === seqHint.value ? seqHint.name : undefined;
      const g = prior != null && !retry ? newGlobalId() : gid;
      if (g !== gid) setGid(g);
      await addRegister(item.table, attrs, g, { autoSeq, retry });
      onClose();
    } catch (ex) {
      setPrior({ sig });
      setErr(errText(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title={tr('Бүртгэл нэмэх')}
      busy={busy}
      onClose={onClose}
      foot={(
        <>
          {err && <p className={x.err} role="alert">{err}</p>}
          <div className={x.actions}>
            <button type="button" className={x.btn} onClick={onClose} disabled={busy}>{tr('Болих')}</button>
            <button type="button" className={`${x.btn} ${x.pri}`} onClick={() => { void save(); }} disabled={busy || !ok || !entOk}>
              {busy ? tr('Хадгалж байна…') : tr('Хадгалах')}
            </button>
          </div>
        </>
      )}
    >
      <EntGate ok={!!ent} />
      <div className={x.chips} role="radiogroup" aria-label={tr('Төрөл')}>
        {kinds.map((k) => (
          <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} disabled={busy}
            className={`${x.chip} ${kind === k.key ? x.chipOn : ''}`} onClick={() => pickKind(k.key)}>
            {k.label}
          </button>
        ))}
      </div>
      {!fields && !err && <Loading />}
      {fields && (
        <div className={e.grid}>
          {fields.map((f) => (
            <label key={f.name} className={`${x.field} ${f.type === 'long' ? e.wide : ''}`}>
              <span>{entryFieldLabel(f)}{f.name === dateField?.name ? ' *' : ''}</span>
              {f.options
                ? <select className={e.input} value={vals[f.name] ?? ''} disabled={busy}
                    onChange={(ev) => setVals((v) => ({ ...v, [f.name]: ev.target.value }))}>
                    <option value="">{tr('Сонгоно…')}</option>
                    {f.options.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
                  </select>
                : f.type === 'long'
                ? <textarea className={e.input} rows={3} value={vals[f.name] ?? ''} disabled={busy}
                    onChange={(ev) => setVals((v) => ({ ...v, [f.name]: ev.target.value }))} />
                : <input className={e.input} type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                    value={vals[f.name] ?? ''} disabled={busy}
                    onChange={(ev) => setVals((v) => ({ ...v, [f.name]: ev.target.value }))} />}
            </label>
          ))}
        </div>
      )}
    </Shell>
  );
}

/* ═════════════ «Хог хаягдал» — долоо хоногийн тоо ═════════════ */

/**
 * Багцын нүд — хоосон бол `null` (0 БИШ — «хэмжээгүй» ба «0 рейс» өөр), сөрөг/бутархай/буруу бол
 * `undefined` (хадгалах хаагдана).
 */
const cellOf = (v: string | undefined): number | null | undefined => {
  const s = (v ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function WasteAddDialog({ onClose }: { onClose: () => void }) {
  const W = HABEA.waste;
  /** Домэйны кодууд — ачаалагдсан эсэх нь үйлчилгээ хүрэх эсэхийн шалгуур */
  const [dom, setDom] = useState<{ code: string; name: string }[] | null>(null);
  const [week, setWeek] = useState(() => String(lastFullWeek().no));
  const [metric, setMetric] = useState<string>(W.kinds[0].metric);
  const [cols, setCols] = useState<Record<string, string>>({});
  const [prior, setPrior] = useState<{ before: number; sig: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ent = useEntSession();
  const entOk = !!ent || !habeaEntConfigured();

  useEffect(() => {
    let alive = true;
    loadWasteMetrics().then((d) => { if (alive) setDom(d); }).catch((ex: unknown) => { if (alive) setErr(friendlyError(ex)); });
    return () => { alive = false; };
  }, []);

  const kinds = useMemo(() => {
    const codes = dom?.map((c) => c.code) ?? [];
    if (!codes.length) return W.kinds.map((k) => ({ metric: k.metric, label: k.label }));
    const base = (m: string) => m.replace(/\s*\((рейс|kg|кг|m3|м3)\)\s*$/i, '').trim().toLowerCase();
    const used = new Set<string>();
    const card: { metric: string; label: string }[] = [];
    for (const k of W.kinds) {
      const c = (dom ?? []).find((x) => !used.has(x.code) && base(x.code) === base(k.metric));
      if (c) { used.add(c.code); card.push({ metric: c.code, label: k.label }); }
    }
    const rest = (dom ?? []).filter((c) => !used.has(c.code)).map((c) => ({ metric: c.code, label: c.name.trim() }));
    return [...card, ...rest];
  }, [dom, W.kinds]);
  const metricOk = kinds.some((k) => k.metric === metric);
  useEffect(() => {
    if (dom && kinds.length && !metricOk) setMetric(kinds[0].metric);
  }, [dom, kinds, metricOk]);
  const weekN = /^\d+$/.test(week.trim()) ? Number(week) : null;
  const weekOk = isWeekNo(weekN);
  const parsed = Object.fromEntries(W.pkgCols.map(([c]) => [c, cellOf(cols[c])]));
  const cellsOk = Object.values(parsed).every((v) => v !== undefined);
  const anyVal = Object.values(parsed).some((v) => v != null);
  const ok = weekOk && cellsOk && anyVal && metricOk;

  const save = async () => {
    if (!ok || weekN == null) return;
    setBusy(true);
    setErr('');
    try {
      await addWaste(weekN, metric, parsed as Record<string, number | null>, prior);
      onClose();
    } catch (ex) {
      if (ex instanceof HabeaLostWrite && ex.before != null && ex.sig) setPrior({ before: ex.before, sig: ex.sig });
      setErr(errText(ex));
    } finally {
      setBusy(false);
    }
  };

  const hint = !dom ? ''
    : !kinds.length ? tr('Үйлчилгээний домэйнд төрөл алга — хадгалах боломжгүй.')
      : !metricOk ? tr('Төрөл сонгоно уу.')
        : !weekOk ? tr('Долоо хоног 1–53 байна.')
          : !cellsOk ? tr('Тоо нь 0 ба түүнээс их байна.')
            : '';

  return (
    <Shell
      title={tr('Хог хаягдал оруулах')}
      busy={busy}
      onClose={onClose}
      foot={(
        <>
          {err && <p className={x.err} role="alert">{err}</p>}
          <div className={x.actions}>
            <button type="button" className={x.btn} onClick={onClose} disabled={busy}>{tr('Болих')}</button>
            <button type="button" className={`${x.btn} ${x.pri}`} onClick={() => { void save(); }} disabled={busy || !ok || !dom || !entOk}>
              {busy ? tr('Хадгалж байна…') : tr('Хадгалах')}
            </button>
          </div>
        </>
      )}
    >
      <EntGate ok={!!ent} />
      <div className={e.grid}>
        <label className={x.field}>
          <span>{tr('Долоо хоног')}</span>
          <input className={e.input} type="number" min={1} max={53} step={1} value={week} disabled={busy}
            aria-invalid={!weekOk} onChange={(ev) => setWeek(ev.target.value)} />
        </label>
        <label className={x.field}>
          <span>{tr('Төрөл')}</span>
          <select className={e.input} value={metric} disabled={busy} onChange={(ev) => setMetric(ev.target.value)}>
            {kinds.map((k) => <option key={k.metric} value={k.metric}>{k.label}</option>)}
          </select>
        </label>
      </div>
      <div className={e.grid}>
        {W.pkgCols.map(([c, name]) => (
          <label key={c} className={x.field}>
            <span>{pkgColLabel(name)}</span>
            <input className={e.input} type="number" min={0} step="any" value={cols[c] ?? ''} disabled={busy || !dom}
              aria-invalid={parsed[c] === undefined}
              onChange={(ev) => setCols((v) => ({ ...v, [c]: ev.target.value }))} />
          </label>
        ))}
      </div>
      {hint && <p className={e.muted}>{hint}</p>}
    </Shell>
  );
}
