'use client';

/**
 * «ҮНДСЭН ХУГАЦАА» — гэрээ (багц) бүрийн ТӨСӨӨЛЛИЙН хуваарь: эхлэх/дуусах огноо + сарын хувь (2026-11-05, хэрэглэгч:
 * «бүх багцад Үндсэн хугацаа гэдэг ажлаар багцын төсөөллийн хуваарийг түр хийнэ; ажлууд батлагдахад хүснэгтэд ажлуудыг
 * нэмж жинхэнээр төлөвлөнө»). «Cashflow хуваарилах» таб ҮҮГЭЭР солигдсон: нэг газар, бүх гэрээ.
 *   · огноо — гэрээний мөрийн «Төлөвлөгөөт хугацаа» (`guits_ehleh`/`guits_duusah`, CASHFLOW_NEW)
 *   · сарын хувь — Хуваарийн хүснэгт (`huvaariObyem`, `turul = 'sar_huvi'`), түлхүүр «CF:<Cashflow_ID>» (эхний 21 гэрээ
 *     багцын түлхүүрээр хадгалагдсан — хэвээр уншиж бичнэ)
 *   · сарын мөнгө = хувь × ХО дүн (`monthlyMoney`); гүйцэтгэлийн хувь ЭНД бөглөгдөхгүй
 */

import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { mnt, num } from '@/lib/format';
import { userError } from '@/components/ui';
import { queryFeatures } from '@/lib/query';
import { applyAll } from '@/lib/tableWrite';
import { invalidate } from '@/lib/dataBus';
import { CASHFLOW_NEW, CF_MONTH, CF_MONTH_WHERE, CF_WORK_WHERE, pkgKeyOf } from '@/lib/services';
import { cfStartKeyOf } from '@/lib/gdash';
import { isSwitchPhase, monthSourceOf, PKG_KEYS, SRC_HUVAARI } from '@/lib/monthlyMoney';
import { cfPctKey, loadPkgPct, monthStart, savePkgPct, type PkgPct } from '@/lib/huvaariObyem';
import { parseDay } from '@/lib/zuragTosol';
import s from '@/modules/ipcTable.module.css';
import c from '@/modules/cfplan.module.css';

type Row = Record<string, unknown>;
const F = CASHFLOW_NEW.fields;

/** Нэг гэрээ — жагсаалт ба цонхны мөр */
export type Contract = {
  id: number;
  oid: number;
  phase: string;
  pkgLabel: string;
  name: string;
  cost: number | null;
  huv: boolean;
  start: number | null;
  end: number | null;
  /** Сарын хувийн мөрүүд хадгалагдсан түлхүүр (`bagts`) */
  key: string;
  pct: Map<string, number>;
};

const numOf = (v: string): number | null => {
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
};
const msOrNull = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const dayText = (ms: number | null): string => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));

/** «YYYY-MM» ± n сар */
export const addMonths = (key: string, n: number): string => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** `a`…`b` (хоёулаа орно) сарын түлхүүрүүд; буруу/урвуу бол хоосон. Дээд тал 240 сар. */
export function monthRange(a: string, b: string): string[] {
  if (monthStart(a) == null || monthStart(b) == null || a > b) return [];
  const out: string[] = [];
  for (let k = a; k <= b && out.length < 240; k = addMonths(k, 1)) out.push(k);
  return out;
}

/** Харуулах саруудын хүрээ — хадгалсан сарууд ба «Үндсэн хугацаа»-ны (эхлэх…дуусах) НЭГДЭЛ */
export function pctMonths(pct: ReadonlyMap<string, number>, from: string | null, to: string | null): string[] {
  const keys = [...pct.keys()].filter((k) => monthStart(k) != null).sort();
  const lo = [keys[0], from].filter((x): x is string => !!x).sort()[0];
  const hi = [keys[keys.length - 1], to].filter((x): x is string => !!x).sort().pop();
  return lo && hi ? monthRange(lo, hi) : [];
}

/** Үе шатын дараалал — жагсаалтын эрэмбэ */
const PHASE_ORDER = ['ТЭЗҮ', 'Ажлын зураг төсөл', 'Барилга угсралт'];
const phaseRank = (p: string): number => { const i = PHASE_ORDER.indexOf(p); return i < 0 ? PHASE_ORDER.length : i; };

/**
 * Гэрээний сарын хувийн түлхүүр: «CF:<id>»-д мөр байвал тэр; эс бөгөөс гүйцэтгэлийн хүснэгттэй багцын «Барилга угсралт»
 * гэрээний хуучин (багцын) түлхүүрт мөр байвал тэр; хоёуланд нь алга бол шинээр «CF:<id>».
 */
export function pctKeyFor(id: number, pkg: string, build: boolean, all: PkgPct): string {
  const cf = cfPctKey(id);
  if (all.get(cf)?.size) return cf;
  if (build && pkg && PKG_KEYS.has(pkg) && all.get(pkg)?.size) return pkg;
  return cf;
}

/** Мөнгөний мөрүүд + сарын хувь → гэрээнүүд (цэвэр) */
export function contractsOf(works: readonly Row[], all: PkgPct): Contract[] {
  const out: Contract[] = [];
  for (const w of works) {
    const id = Number(w[CF_MONTH.id]);
    const oid = Number(w[CASHFLOW_NEW.oid]);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(oid)) continue;
    const phase = String(w[F.phase] ?? '').trim();
    const pkg = pkgKeyOf(w[F.pkg]);
    const key = pctKeyFor(id, pkg, isSwitchPhase(phase), all);
    const cost = Number(w[F.budget]);
    out.push({
      id, oid, phase,
      pkgLabel: String(w[F.pkg2] ?? w[F.pkg] ?? '').trim(),
      name: String(w.ajil_uilchilgee ?? '').trim(),
      cost: Number.isFinite(cost) && cost > 0 ? cost : null,
      huv: monthSourceOf(w[F.monthSource]) === SRC_HUVAARI,
      start: msOrNull(w[F.startDate]),
      end: msOrNull(w[F.endDate]),
      key,
      pct: new Map(all.get(key) ?? []),
    });
  }
  return out.sort((a, b) => phaseRank(a.phase) - phaseRank(b.phase) || a.id - b.id);
}

async function loadContracts(): Promise<Contract[]> {
  const [works, pp] = await Promise.all([
    queryFeatures(CASHFLOW_NEW.url, {
      where: CF_WORK_WHERE,
      outFields: [CASHFLOW_NEW.oid, CF_MONTH.id, F.pkg, F.pkg2, F.phase, F.budget, F.monthSource, F.startDate, F.endDate, 'ajil_uilchilgee'],
      orderBy: `${CASHFLOW_NEW.oid} ASC`,
    }),
    loadPkgPct(),
  ]);
  return contractsOf(works, pp.pct);
}

const sumOf = (m: ReadonlyMap<string, number>): number | null => {
  if (!m.size) return null;
  let t = 0;
  for (const v of m.values()) t += v;
  return t;
};

/** «Хуваарь» хуудасны товч — бүх гэрээний «Үндсэн хугацаа» */
export function MainSpanButton({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={c.clear} onClick={() => setOpen(true)}
        title={tr('Гэрээ (багц) бүрийн төсөөллийн хуваарь: эхлэх/дуусах огноо ба сарын хувь — санхүүжилтийн S-муруйн эх')}>
        {tr('Үндсэн хугацаа')}
      </button>
      {open && <MainSpanList canEdit={canEdit} onClose={() => setOpen(false)} />}
    </>
  );
}

function MainSpanList({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    loadContracts().then((x) => { if (on) { setRows(x); setErr(null); } }, (e) => { if (on) setErr(userError(e)); });
    return () => { on = false; };
  }, [tick]);
  const cur = sel == null ? null : rows?.find((r) => r.id === sel) ?? null;
  if (cur) {
    return <MainSpanDialog key={cur.id} d={cur} canEdit={canEdit} onClose={() => { setSel(null); setTick((n) => n + 1); }} />;
  }
  return (
    <div className={s.dlgBack} role="presentation" onClick={onClose}>
      <div className={s.dlg} role="dialog" aria-modal="true" aria-label={tr('Үндсэн хугацаа')} onClick={(e) => e.stopPropagation()}>
        <h3 className={s.dlgTitle}>{tr('Үндсэн хугацаа — гэрээ бүрийн төсөөллийн хуваарь')}</h3>
        <p className={c.hint}>{tr('Гэрээг дарж эхлэх/дуусах огноо, сарын хувийг оруулна. Сарын мөнгө = сарын хувь × ХО дүн. Ажлууд батлагдаж гүйцэтгэлийн хүснэгтэд орсны дараа хуваарийг ажил бүрээр жинхэнээр төлөвлөнө.')}</p>
        {rows == null ? (
          err ? <p className={c.warn} role="alert">{err}</p> : <p className={c.hint}>{tr('Уншиж байна…')}</p>
        ) : (
          <div className={s.dlgList} style={{ maxHeight: '62vh' }}>
            <table className={c.tbl}>
              <thead>
                <tr>
                  <th>{tr('Багц')}</th><th>{tr('Ажил')}</th><th className={c.r}>{tr('ХО дүн')}</th>
                  <th>{tr('Эхлэх')}</th><th>{tr('Дуусах')}</th><th className={c.r}>{tr('Сарын хувийн нийлбэр')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const head = i === 0 || rows[i - 1].phase !== r.phase;
                  const sm = sumOf(r.pct);
                  const st = sm == null ? c.rowNone : Math.abs(sm - 100) < 0.01 ? c.rowDone : '';
                  return [
                    head && (
                      <tr key={`p${r.phase}`}><th colSpan={6} style={{ textAlign: 'left' }}>{r.phase || tr('Үе шатгүй')}</th></tr>
                    ),
                    <tr key={r.id} className={st} style={{ cursor: 'pointer' }} tabIndex={0}
                      onClick={() => setSel(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(r.id); }}>
                      <td>{r.pkgLabel || '—'}</td>
                      <td>{r.name}</td>
                      <td className={c.r}>{mnt(r.cost)}</td>
                      <td>{dayText(r.start) || '—'}</td>
                      <td>{dayText(r.end) || '—'}</td>
                      <td className={c.r}>{sm == null ? tr('оруулаагүй') : `${num(sm, 2)}%`}</td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className={c.bar}>
          <button type="button" className={c.clear} onClick={onClose}>{tr('Хаах')}</button>
        </div>
      </div>
    </div>
  );
}

function MainSpanDialog({ d, canEdit, onClose }: { d: Contract; canEdit: boolean; onClose: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Хадгалсны дараах суурь — цонх нээлттэй үед дахин уншихгүй, өөрийн бичсэнээр шинэчилнэ */
  const [base, setBase] = useState<{ start: number | null; end: number | null; pct: Map<string, number>; huv: boolean }>(
    { start: d.start, end: d.end, pct: d.pct, huv: d.huv },
  );
  const [startTxt, setStartTxt] = useState(dayText(d.start));
  const [endTxt, setEndTxt] = useState(dayText(d.end));
  /** Засвар — сар → бичсэн текст */
  const [pend, setPend] = useState<Record<string, string>>({});
  /** Хүрээг өргөтгөсөн сарын тоо (өмнө · хойно) */
  const [ext, setExt] = useState<[number, number]>([0, 0]);

  const ps = parseDay(startTxt);
  const pe = parseDay(endTxt);
  const startMs = ps.ok ? (ps.v as number | null) : base.start;
  const endMs = pe.ok ? (pe.v as number | null) : base.end;
  const months = useMemo(() => {
    const b = pctMonths(base.pct, startMs == null ? null : cfStartKeyOf(startMs) || null, endMs == null ? null : cfStartKeyOf(endMs) || null);
    if (!b.length) return [];
    return monthRange(addMonths(b[0], -ext[0]), addMonths(b[b.length - 1], ext[1]));
  }, [base.pct, startMs, endMs, ext]);
  const textOf = (k: string): string => (k in pend ? pend[k] : base.pct.has(k) ? String(base.pct.get(k)) : '');
  const sum = months.reduce((a, k) => a + (numOf(textOf(k)) ?? 0), 0);
  const any = months.some((k) => numOf(textOf(k)) != null);
  const datesDirty = startTxt !== dayText(base.start) || endTxt !== dayText(base.end);
  const dirty = Object.keys(pend).length + (datesDirty ? 1 : 0);
  const editable = canEdit && !busy;

  const save = async () => {
    if (!editable || !dirty) return;
    if (!ps.ok || !pe.ok) { setErr(tr('Огноо буруу — жишээ нь 2026-08-01.')); return; }
    if (startMs != null && endMs != null && endMs < startMs) { setErr(tr('Дуусах огноо эхлэх огнооноос өмнө байна.')); return; }
    const bad = months.filter((k) => { const t = textOf(k).trim(); const x = numOf(t); return t !== '' && (x == null || x < 0 || x > 100); });
    if (bad.length) { setErr(tr('Сарын хувь 0–100 хооронд тоо байх ёстой: {0}.', bad.join(', '))); return; }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const pctDirty = Object.keys(pend).length > 0;
      /* «Гараар» эхтэй гэрээнд хуучин гараар сарын мөр үлдсэн бол давхар төлөвлөгөө үүсгэхгүй */
      if (pctDirty && !base.huv) {
        const left = await queryFeatures(CASHFLOW_NEW.url, {
          where: `(${CF_MONTH_WHERE}) AND ${CF_MONTH.id} = ${d.id} AND (${CF_MONTH.pct} IS NOT NULL OR ${CF_MONTH.amount} IS NOT NULL)`,
          outFields: [CASHFLOW_NEW.oid],
        });
        if (left.length) throw new Error(tr('Энэ гэрээнд хуучин гараар оруулсан {0} сарын мөр үлдсэн байна — админд мэдэгдэж шилжүүлнэ үү.', left.length));
      }
      const next = new Map<string, number | null>(months.map((k) => [k, numOf(textOf(k))]));
      if (pctDirty) await savePkgPct(d.key, d.pkgLabel || d.name, next);
      const upd: Row = {};
      if (datesDirty) { upd[F.startDate] = startMs; upd[F.endDate] = endMs; }
      if (pctDirty && !base.huv) upd[F.monthSource] = SRC_HUVAARI;
      if (Object.keys(upd).length) {
        await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: [{ [CASHFLOW_NEW.oid]: d.oid, ...upd }] }, { cap: 'finEdit' });
        invalidate('CASHFLOW_NEW');
      }
      const pct = new Map<string, number>();
      for (const [k, v] of next) if (v != null) pct.set(k, v);
      setBase({ start: startMs, end: endMs, pct: pctDirty ? pct : base.pct, huv: base.huv || pctDirty });
      setPend({});
      setStartTxt(dayText(startMs));
      setEndTxt(dayText(endMs));
      setMsg(tr('Хадгалагдав'));
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.dlgBack} role="presentation" onClick={() => { if (!busy && !dirty) onClose(); }}>
      <div className={s.dlg} role="dialog" aria-modal="true" aria-label={tr('Үндсэн хугацаа')} onClick={(e) => e.stopPropagation()}>
        <h3 className={s.dlgTitle}>{tr('Үндсэн хугацаа — {0}', [d.pkgLabel, d.name].filter(Boolean).join(' · '))}</h3>
        <p className={c.sub}>{d.phase} · {tr('ХО дүн: {0}', mnt(d.cost))}</p>
        {d.cost == null && <p className={c.warn}>{tr('Гэрээний дүнгүй — ₮ бодогдохгүй')}</p>}
        <div className={s.dlgForm}>
          <label>{tr('Эхлэх огноо')}
            <input className={s.dlgIn} type="date" value={startTxt} readOnly={!editable} onChange={(e) => setStartTxt(e.target.value)} />
          </label>
          <label>{tr('Дуусах огноо')}
            <input className={s.dlgIn} type="date" value={endTxt} readOnly={!editable} onChange={(e) => setEndTxt(e.target.value)} />
          </label>
        </div>
        {months.length === 0 ? (
          <p className={c.hint}>{tr('Эхлэх, дуусах огноог оруулахад сарын мөрүүд гарна.')}</p>
        ) : (
          <div style={{ maxHeight: '48vh', overflowY: 'auto' }}>
            <table className={c.tbl}>
              <thead>
                <tr><th>{tr('Сар')}</th><th className={c.r}>{tr('Хувь, %')}</th><th className={c.r}>{tr('Дүн')}</th></tr>
              </thead>
              <tbody>
                {months.map((k) => {
                  const raw = textOf(k);
                  const p = numOf(raw);
                  return (
                    <tr key={k} className={p == null ? c.rowNone : c.rowDone}>
                      <td>{k}</td>
                      <td className={c.r}>
                        <input className={c.inp} value={raw} inputMode="decimal" readOnly={!editable}
                          aria-label={tr('{0}-ны хувь', k)}
                          onChange={(e) => {
                            if (!editable) return;
                            const v = e.target.value;
                            const orig = base.pct.has(k) ? String(base.pct.get(k)) : '';
                            setPend((o) => { const nx = { ...o }; if (v === orig) delete nx[k]; else nx[k] = v; return nx; });
                          }} />
                      </td>
                      <td className={c.r}>{p == null ? '' : d.cost == null ? '—' : mnt((d.cost * p) / 100)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>{tr('НИЙТ')}</td>
                  <td className={c.r}>{any ? `${num(sum, 2)}%` : '—'}</td>
                  <td className={c.r}>{!any ? '' : d.cost == null ? '—' : mnt((d.cost * sum) / 100)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {any && Math.abs(sum - 100) >= 0.01 && (
          <p className={c.warn}>{tr('⚠ Нийлбэр 100% биш ({0}%) — үлдэгдэл нь S-муруйд орохгүй.', num(sum, 2))}</p>
        )}
        {err && <p className={c.warn} role="alert">{err}</p>}
        {msg && <p className={c.hint} role="status">{msg}</p>}
        <div className={c.bar}>
          {editable && months.length > 0 && (
            <>
              <button type="button" className={c.clear} onClick={() => setExt(([a, b]) => [a + 1, b])}>{tr('+ өмнөх сар')}</button>
              <button type="button" className={c.clear} onClick={() => setExt(([a, b]) => [a, b + 1])}>{tr('+ дараагийн сар')}</button>
            </>
          )}
          <button type="button" className={c.clear} disabled={busy} onClick={onClose}>{tr('Буцах')}</button>
          {canEdit && (
            <button type="button" className={c.save} disabled={!editable || !dirty} onClick={() => { void save(); }}>
              {busy ? tr('Хадгалж байна…') : tr('Хадгалах ({0})', dirty)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
