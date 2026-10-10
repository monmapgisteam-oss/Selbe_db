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
 * ⚠️ 2026-10-09: хадгалсны дараа картыг `invalidate('HABEA')` (өгөгдлийн автобус) шинэчилнэ —
 *    `onSaved → retry` ХАСАГДАВ (хоёр дахин татдаг байв).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { HABEA } from '@/lib/services';
import { friendlyError } from '@/components/ui';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { ubDayKey } from '@/lib/ceo/workforce';
import {
  addRegister, addWaste, entryFieldLabel, HabeaLostWrite, isWeekNo, lastFullWeek, loadEntryFields,
  loadWasteMetrics, newGlobalId, nextNumber, registerSig, type EntryField,
} from '@/lib/habeaRegisters';
import x from './uzlegExport.module.css';
import e from './habeaEntry.module.css';

/* ⚠️ 2026-10-09 (аудит): ӨНӨӨДӨР = Улаанбаатарын хуанли (`ubDayKey`) — урьд нь хөтчийн ЛОКАЛ огноо
   тул гадаадаас/UTC машинаас 00:00–08:00 (UB)-д өчигдрийн огноо санал болгодог байв. */
const todayStr = () => ubDayKey(Date.now());
/** «YYYY-MM-DD» → UTC шөнө дунд (хүснэгтийн байгаа хэвтэй ижил) */
const utcDay = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
};
/** «№» / «д/д» — автоматаар дараагийн дугаар санал болгох талбар */
const isSeq = (f: EntryField) => f.type === 'number' && /^(№|д\/д)$/i.test(f.alias.trim());
/** Хариу алдагдсан бичилтийн мессеж нь өөрөө тайлбартай — `friendlyError` ангилалд оруулахгүй */
const errText = (ex: unknown) => (ex instanceof HabeaLostWrite ? ex.message : friendlyError(ex));
/** «Багц 3.1» (шүүлтийн түлхүүр) → дэлгэцийн нэр */
export const pkgColLabel = (name: string) => tr('Багц {0}', name.replace(/^Багц\s*/, ''));

/**
 * Картын гарчгийн жижиг «+ Нэмэх» товч — ЗӨВХӨН эрхтэйд зурагдана (дуудагч шийднэ).
 * ⚠️ 2026-10-09 (аудит): `disabled` + `note` — үйлчилгээ мөр нэмэхийг зөвшөөрөхгүй (`Create`-гүй)
 *    үед товчийг хааж ШАЛТГААНЫГ хэлнэ. Хаалттай товч хулганы үйл явдал авдаггүй тул тайлбарыг
 *    гаднах `span`-ий `title`-д, дэлгэц уншигчид `aria-label`-д.
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

/**
 * ⚠️ 2026-10-09 (хүртээмж): фокусын урхи (`useFocusTrap` — нээхэд дотор нь фокус, хаахад нээсэн
 *    товч руу БУЦААНА). Ард товшиход ЗӨВХӨН mousedown ба mouseup ХОЁУЛАА ард байвал хаана —
 *    урьд нь талбар дотор текст сонгоод хулганаа гадна суллахад цонх бөглөсөн утгатайгаа хаагддаг байв.
 */
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
  /**
   * ⚠️ 2026-10-09: КЛИЕНТИЙН GlobalID — маягт (төрөл) бүрд НЭГ. Хариу алдагдсаны дараа дахин
   *    «Хадгалах» дарахад ИЖИЛ id-аар эхлээд серверээс асууна (`addRegister`) — давхардахгүй.
   */
  const [gid, setGid] = useState(newGlobalId);
  /**
   * ⚠️ 2026-10-09 (аудит №6): унасан илгээлтийн утгын гарын үсэг (`registerSig`) — `addWaste`-ийн
   *    `prior.sig` загвар. Дахин дарахад утга ИЖИЛ бол л ижил `gid` + `retry` (серверээс эхлээд асууна);
   *    хэрэглэгч талбараа ЗАССАН бол ШИНЭ `gid`-ээр шинэ мөр — урьд нь `tried` туг л байсан тул
   *    анхны (алдагдсан гэж бодсон) бичилт суусан байвал засвар ХАЯГДДАГ байв.
   */
  const [prior, setPrior] = useState<{ sig: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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
        for (const f of fs) if (f.type === 'date') init[f.name] = todayStr();
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
  }, [item?.table]);

  const dateField = fields?.find((f) => f.type === 'date');
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
      /* ⚠️ 2026-10-09: санал болгосон дугаарыг өөрчлөөгүй бол бичихийн ӨМНӨ дахин бодно */
      const autoSeq = seqHint && (vals[seqHint.name] ?? '').trim() === seqHint.value ? seqHint.name : undefined;
      /* ⚠️ 2026-10-09 (аудит №6): утга өөрчлөгдсөн дахин илгээлт — шинэ GlobalID (давхар id-аар
         «аль хэдийн байна» гэж ХУДАЛ амжилт авахгүй) */
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
            className={`${x.chip} ${kind === k.key ? x.chipOn : ''}`} onClick={() => pickKind(k.key)}>
            {k.label}
          </button>
        ))}
      </div>
      {!fields && !err && <p className={e.muted}>{tr('Ачаалж байна…')}</p>}
      {fields && (
        <div className={e.grid}>
          {fields.map((f) => (
            <label key={f.name} className={`${x.field} ${f.type === 'long' ? e.wide : ''}`}>
              <span>{entryFieldLabel(f)}{f.type === 'date' ? ' *' : ''}</span>
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

/**
 * Багцын нүд — хоосон бол `null` (0 БИШ — «хэмжээгүй» ба «0 рейс» өөр), сөрөг/бутархай/буруу бол
 * `undefined` (хадгалах хаагдана).
 */
const cellOf = (v: string | undefined): number | null | undefined => {
  const s = (v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};

export function WasteAddDialog({ onClose }: { onClose: () => void }) {
  const W = HABEA.waste;
  /** Домэйны кодууд — ачаалагдсан эсэх нь үйлчилгээ хүрэх эсэхийн шалгуур */
  const [dom, setDom] = useState<string[] | null>(null);
  const [week, setWeek] = useState(() => String(lastFullWeek().no));
  const [metric, setMetric] = useState<string>(W.kinds[0].metric);
  const [cols, setCols] = useState<Record<string, string>>({});
  /** ⚠️ 2026-10-09: хариу алдагдсан илгээлт — ИЖИЛ утгаар дахин дарахад эхлээд дахин тоолно */
  const [prior, setPrior] = useState<{ before: number; sig: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    loadWasteMetrics().then((d) => { if (alive) setDom(d); }).catch((ex: unknown) => { if (alive) setErr(friendlyError(ex)); });
    return () => { alive = false; };
  }, []);

  /* ⚠️ 2026-10-09: ЗӨВХӨН картад харагдах төрлүүд (`W.kinds`, рейс) — kg/m3 төрлийг оруулбал
     картад хэзээ ч гарахгүй. Домэйнд байхгүй кодыг санал болгохгүй. */
  const kinds = W.kinds.filter((k) => !dom?.length || dom.includes(k.metric));
  const weekN = /^\d+$/.test(week.trim()) ? Number(week) : null;
  const weekOk = isWeekNo(weekN);
  const parsed = Object.fromEntries(W.pkgCols.map(([c]) => [c, cellOf(cols[c])]));
  const cellsOk = Object.values(parsed).every((v) => v !== undefined);
  const anyVal = Object.values(parsed).some((v) => v != null);
  const ok = weekOk && cellsOk && anyVal && kinds.some((k) => k.metric === metric);

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

  const hint = !dom ? '' : !weekOk ? tr('Долоо хоног 1–53 байна.')
    : !cellsOk ? tr('Тоо нь 0 ба түүнээс их бүхэл тоо байна.')
      : !anyVal ? tr('Ядаж нэг багцын тоог оруулна уу.') : '';

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
            <button type="button" className={`${x.btn} ${x.pri}`} onClick={() => { void save(); }} disabled={busy || !ok || !dom}>
              {busy ? tr('Хадгалж байна…') : tr('Хадгалах')}
            </button>
          </div>
        </>
      )}
    >
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
            <input className={e.input} type="number" min={0} step={1} value={cols[c] ?? ''} disabled={busy || !dom}
              aria-invalid={parsed[c] === undefined}
              onChange={(ev) => setCols((v) => ({ ...v, [c]: ev.target.value }))} />
          </label>
        ))}
      </div>
      {hint && <p className={e.muted}>{hint}</p>}
    </Shell>
  );
}
