'use client';

/**
 * ХАБЭА — БҮРТГЭЛ ОРУУЛАХ ЦОНХНУУД (2026-10-08, хэрэглэгчийн хүсэлт: «энд байгаа мэдээлэл
 * дээр дата нэмдэг хэсэг — хэрэглэгчийн эрхээр, бусдад энгийн харагдана»).
 *
 *   · `RegisterAddDialog` — «Бусад үзүүлэлт»: төрөл (талбайн зааварчилгаа · сануулах
 *     хуудас · хариуцлага тооцох) сонгоод тэр хүснэгтийн талбаруудыг бөглөнө. Талбарууд
 *     МЕТАДАТААС (`loadEntryFields`) — хүснэгтэд багана нэмэгдвэл маягт өөрөө дагана.
 *   · `WasteAddDialog` — «Хог хаягдал»: долоо хоног × төрөл сонгоод багц бүрийн тоо.
 *     ⚠️ 2026-10-08 (хэрэглэгчийн шийдвэр): хадгалах бүрд ДООР ШИНЭ МӨР нэмнэ — байгаа мөрийг
 *     дарж бичихгүй. Карт бүх мөрийг нийлүүлдэг тул нэг долоо хоногийн хэд хэдэн мөр зөв нийлбэр.
 *
 * ⚠️ Эрх: товч нь зөвхөн `habeaData` эрхтэйд (`Habea.tsx`); бичих функц өөрөө ч шалгана.
 * ⚠️ Огноо `Date.UTC` — хүснэгтийн байгаа мөрүүд UTC шөнө дундаар хадгалагдсан тул ижил хэв.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { HABEA } from '@/lib/services';
import { friendlyError } from '@/components/ui';
import {
  addRegister, loadEntryFields, loadWasteRaw, nextNumber, saveWaste, lastFullWeek,
  type EntryField, type WasteRaw,
} from '@/lib/habeaRegisters';
import x from './uzlegExport.module.css';
import e from './habeaEntry.module.css';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** «YYYY-MM-DD» → UTC шөнө дунд (хүснэгтийн байгаа хэвтэй ижил) */
const utcDay = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
};
/** «№» / «д/д» — автоматаар дараагийн дугаар санал болгох талбар */
const isSeq = (f: EntryField) => f.type === 'number' && /^(№|д\/д)$/i.test(f.alias.trim());

/** Картын гарчгийн жижиг «+ Нэмэх» товч — ЗӨВХӨН эрхтэйд зурагдана (дуудагч шийднэ) */
export function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={e.add} onClick={onClick} title={tr('Бүртгэл нэмэх')}>
      + {tr('Нэмэх')}
    </button>
  );
}

function Shell({ title, busy, onClose, children, foot }: {
  title: string; busy: boolean; onClose: () => void; children: React.ReactNode; foot: React.ReactNode;
}) {
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);
  return (
    <div className={x.back} role="presentation" onClick={() => { if (!busy) onClose(); }}>
      <div className={`${x.box} ${e.box}`} role="dialog" aria-modal="true" aria-label={title} onClick={(ev) => ev.stopPropagation()}>
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

export function RegisterAddDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const kinds = HABEA.registers.items.filter((it) => it.table != null);
  const [kind, setKind] = useState(kinds[0]?.key ?? '');
  const item = kinds.find((k) => k.key === kind) ?? kinds[0];
  const [fields, setFields] = useState<EntryField[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const t = item?.table;
    if (t == null) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- төрөл солигдоход маягтыг цэвэрлэж дахин ачаална
    setFields(null);
    setErr('');
    loadEntryFields(t)
      .then(async (fs) => {
        const init: Record<string, string> = {};
        for (const f of fs) if (f.type === 'date') init[f.name] = todayStr();
        const seq = fs.find(isSeq);
        if (seq) init[seq.name] = String(await nextNumber(t, seq.name).catch(() => 1));
        if (alive) { setFields(fs); setVals(init); }
      })
      .catch((ex: unknown) => { if (alive) setErr(friendlyError(ex)); });
    return () => { alive = false; };
  }, [item?.table]);

  const dateField = fields?.find((f) => f.type === 'date');
  const ok = !!fields && (!dateField || !!vals[dateField.name]);

  const save = async () => {
    if (!fields || item?.table == null) return;
    setBusy(true);
    setErr('');
    try {
      const attrs: Record<string, unknown> = {};
      for (const f of fields) {
        const v = (vals[f.name] ?? '').trim();
        if (!v) continue;
        attrs[f.name] = f.type === 'date' ? utcDay(v) : f.type === 'number' ? Number(v) : v;
      }
      await addRegister(item.table, attrs);
      onSaved();
      onClose();
    } catch (ex) {
      setErr(friendlyError(ex));
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
            <button type="button" className={`${x.btn} ${x.pri}`} onClick={() => { void save(); }} disabled={busy || !ok}>
              {busy ? tr('Хадгалж байна…') : tr('Хадгалах')}
            </button>
          </div>
        </>
      )}
    >
      <div className={x.chips} role="radiogroup" aria-label={tr('Төрөл')}>
        {kinds.map((k) => (
          <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} disabled={busy}
            className={`${x.chip} ${kind === k.key ? x.chipOn : ''}`} onClick={() => setKind(k.key)}>
            {k.label}
          </button>
        ))}
      </div>
      {!fields && !err && <p className={e.muted}>{tr('Ачаалж байна…')}</p>}
      {fields && (
        <div className={e.grid}>
          {fields.map((f) => (
            <label key={f.name} className={`${x.field} ${f.type === 'long' ? e.wide : ''}`}>
              <span>{f.alias}{f.type === 'date' ? ' *' : ''}</span>
              {f.type === 'long'
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

export function WasteAddDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const W = HABEA.waste;
  const [raw, setRaw] = useState<{ rows: WasteRaw[]; metrics: string[] } | null>(null);
  const [week, setWeek] = useState(() => String(lastFullWeek().no));
  const [metric, setMetric] = useState<string>(W.kinds[0].metric);
  const [cols, setCols] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    loadWasteRaw().then((d) => { if (alive) setRaw(d); }).catch((ex: unknown) => { if (alive) setErr(friendlyError(ex)); });
    return () => { alive = false; };
  }, []);

  const metrics = raw?.metrics.length ? raw.metrics : W.kinds.map((k) => k.metric);
  const ok = Number.isInteger(Number(week)) && Number(week) > 0 && !!metric;

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const out: Record<string, number> = {};
      for (const [c] of W.pkgCols) out[c] = Math.max(0, Math.round(Number(cols[c] || 0)));
      await saveWaste(Number(week), metric, out, null);
      onSaved();
      onClose();
    } catch (ex) {
      setErr(friendlyError(ex));
    } finally {
      setBusy(false);
    }
  };

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
            <button type="button" className={`${x.btn} ${x.pri}`} onClick={() => { void save(); }} disabled={busy || !ok || !raw}>
              {busy ? tr('Хадгалж байна…') : tr('Хадгалах')}
            </button>
          </div>
        </>
      )}
    >
      <div className={e.grid}>
        <label className={x.field}>
          <span>{tr('Долоо хоног')}</span>
          <input className={e.input} type="number" min={1} max={53} value={week} disabled={busy} onChange={(ev) => setWeek(ev.target.value)} />
        </label>
        <label className={x.field}>
          <span>{tr('Төрөл')}</span>
          <select className={e.input} value={metric} disabled={busy} onChange={(ev) => setMetric(ev.target.value)}>
            {metrics.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <div className={e.grid}>
        {W.pkgCols.map(([c, name]) => (
          <label key={c} className={x.field}>
            <span>{name}</span>
            <input className={e.input} type="number" min={0} value={cols[c] ?? ''} disabled={busy || !raw}
              onChange={(ev) => setCols((v) => ({ ...v, [c]: ev.target.value }))} />
          </label>
        ))}
      </div>
    </Shell>
  );
}
