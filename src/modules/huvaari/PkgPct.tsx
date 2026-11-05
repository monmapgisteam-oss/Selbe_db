'use client';

/**
 * БАГЦЫН САРЫН САНХҮҮЖИЛТИЙН ХУВЬ — «Хуваарь» хуудасны товч + цонх (2026-11-05, хэрэглэгч: «гараар бичсэн датаг Хуваарь
 * руу оруулаад солих»). Гүйцэтгэлийн хүснэгттэй багцын сарын хувь «Cashflow хуваарилах»-аас ЭНД шилжсэн: нэг багц нэг
 * газар төлөвлөгдөнө. Хадгалалт — Хуваарийн хүснэгт (`huvaariObyem.savePkgPct`, `turul = 'sar_huvi'`); сарын мөнгө =
 * хувь × гэрээний ХО дүн (`monthlyMoney`). Ажил бүрийн огноо/сарын обьёмыг хөндөхгүй.
 */

import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { mnt, num } from '@/lib/format';
import { userError } from '@/components/ui';
import { queryFeatures } from '@/lib/query';
import { CASHFLOW_NEW, CF_MONTH, CF_WORK_WHERE, bagtsKey, pkgKeyOf } from '@/lib/services';
import { cfStartKeyOf } from '@/lib/gdash';
import { isSwitchPhase, monthSourceOf, SRC_HUVAARI } from '@/lib/monthlyMoney';
import { loadPkgPct, monthStart, savePkgPct } from '@/lib/huvaariObyem';
import s from '@/modules/ipcTable.module.css';
import c from '@/modules/cfplan.module.css';

type Loaded = {
  /** Гэрээний нэр (ажил) — байхгүй бол null (энэ багцад «Барилга угсралт» мөнгөний мөр алга) */
  name: string | null;
  cost: number | null;
  /** Гэрээний сарын мөнгөний эх «Хуваарь» мөн үү — үгүй бол хувь «Cashflow хуваарилах»-д гараар хэвээр */
  huv: boolean;
  /** Төлөвлөгөөт хугацаа («YYYY-MM») — сарын мөрийн анхны хүрээ */
  from: string | null;
  to: string | null;
  pct: Map<string, number>;
};

const numOf = (v: string): number | null => {
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
};

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

/** Харуулах саруудын хүрээ — хадгалсан сарууд ба төлөвлөгөөт хугацааны НЭГДЭЛ */
export function pctMonths(pct: ReadonlyMap<string, number>, from: string | null, to: string | null): string[] {
  const keys = [...pct.keys()].filter((k) => monthStart(k) != null).sort();
  const lo = [keys[0], from].filter((x): x is string => !!x).sort()[0];
  const hi = [keys[keys.length - 1], to].filter((x): x is string => !!x).sort().pop();
  return lo && hi ? monthRange(lo, hi) : [];
}

async function load(group: string): Promise<Loaded> {
  const F = CASHFLOW_NEW.fields;
  const key = bagtsKey(group);
  const [works, pp] = await Promise.all([
    queryFeatures(CASHFLOW_NEW.url, {
      where: CF_WORK_WHERE,
      outFields: [CF_MONTH.id, F.pkg, F.phase, F.budget, F.monthSource, F.startDate, F.endDate, 'ajil_uilchilgee'],
    }),
    loadPkgPct(),
  ]);
  const w = works.find((r) => pkgKeyOf(r[F.pkg]) === key && isSwitchPhase(r[F.phase])) ?? null;
  const cost = Number(w?.[F.budget]);
  return {
    name: w ? String(w.ajil_uilchilgee ?? '').trim() || group : null,
    cost: Number.isFinite(cost) && cost > 0 ? cost : null,
    huv: !!w && monthSourceOf(w[F.monthSource]) === SRC_HUVAARI,
    from: w?.[F.startDate] != null ? cfStartKeyOf(w[F.startDate]) || null : null,
    to: w?.[F.endDate] != null ? cfStartKeyOf(w[F.endDate]) || null : null,
    pct: new Map(pp.pct.get(key) ?? []),
  };
}

export function PkgPctButton({ group, canEdit }: { group: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={c.clear} onClick={() => setOpen(true)}
        title={tr('Энэ багцын санхүүжилтийн сарын хувь — «Cashflow хуваарилах»-аас Хуваарь руу шилжсэн')}>
        {tr('Сарын санхүүжилтийн хувь')}
      </button>
      {open && <PkgPctDialog group={group} canEdit={canEdit} onClose={() => setOpen(false)} />}
    </>
  );
}

function PkgPctDialog({ group, canEdit, onClose }: { group: string; canEdit: boolean; onClose: () => void }) {
  const [d, setD] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Засвар — сар → бичсэн текст */
  const [pend, setPend] = useState<Record<string, string>>({});
  /** Хүрээг өргөтгөсөн сарын тоо (өмнө · хойно) */
  const [ext, setExt] = useState<[number, number]>([0, 0]);
  /** Дахин унших дохио — хадгалсны дараа ахина */
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let on = true;
    load(group).then(
      (x) => { if (on) { setD(x); setPend({}); } },
      (e) => { if (on) setErr(userError(e)); },
    );
    return () => { on = false; };
  }, [group, tick]);

  const months = useMemo(() => {
    if (!d) return [];
    const base = pctMonths(d.pct, d.from, d.to);
    if (!base.length) return [];
    return monthRange(addMonths(base[0], -ext[0]), addMonths(base[base.length - 1], ext[1]));
  }, [d, ext]);
  const textOf = (k: string): string => (k in pend ? pend[k] : d?.pct.has(k) ? String(d.pct.get(k)) : '');
  const sum = months.reduce((a, k) => a + (numOf(textOf(k)) ?? 0), 0);
  const any = months.some((k) => numOf(textOf(k)) != null);
  const dirty = Object.keys(pend).length;
  const editable = canEdit && !!d?.huv && !busy;

  const save = async () => {
    if (!d || !editable || !dirty) return;
    const bad = months.filter((k) => { const t = textOf(k).trim(); const x = numOf(t); return t !== '' && (x == null || x < 0 || x > 100); });
    if (bad.length) { setErr(tr('Сарын хувь 0–100 хооронд тоо байх ёстой: {0}.', bad.join(', '))); return; }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const next = new Map<string, number | null>(months.map((k) => [k, numOf(textOf(k))]));
      const [a, u, dl] = await savePkgPct(bagtsKey(group), group, next);
      setMsg(tr('Хадгалагдав · нэмсэн {0} · шинэчилсэн {1} · устгасан {2}', a, u, dl));
      setTick((n) => n + 1);
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.dlgBack} role="presentation" onClick={() => { if (!busy && !dirty) onClose(); }}>
      <div className={s.dlg} role="dialog" aria-modal="true" aria-label={tr('Сарын санхүүжилтийн хувь')} onClick={(e) => e.stopPropagation()}>
        <h3 className={s.dlgTitle}>{tr('Сарын санхүүжилтийн хувь — {0}', group)}</h3>
        {d == null ? (
          err ? <p className={c.warn} role="alert">{err}</p> : <p className={c.hint}>{tr('Уншиж байна…')}</p>
        ) : d.name == null ? (
          <p className={c.hint}>{tr('Энэ багцад «Барилга угсралт» үе шатын гэрээний мөр алга — сарын хувь оруулах гэрээгүй.')}</p>
        ) : (
          <>
            <p className={c.sub}>{d.name} · {tr('ХО дүн: {0}', mnt(d.cost))}</p>
            {!d.huv && (
              <p className={c.warn}>{tr('Энэ гэрээний сарын хувь «Санхүүжилт → Cashflow хуваарилах»-д гараар байна. Тэндээс «Хуваарь руу шилжүүлэх» дарахад хувь энд шилжинэ.')}</p>
            )}
            {d.cost == null && <p className={c.warn}>{tr('Гэрээний дүнгүй — ₮ бодогдохгүй')}</p>}
            {months.length === 0 ? (
              <p className={c.hint}>{tr('Төлөвлөгөөт хугацаа бөглөгдөөгүй, хадгалсан сар алга — сарын мөр үүсгэх хүрээ тодорхойгүй.')}</p>
            ) : (
              <div style={{ maxHeight: '56vh', overflowY: 'auto' }}>
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
                                const orig = d.pct.has(k) ? String(d.pct.get(k)) : '';
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
          </>
        )}
        <div className={c.bar}>
          {editable && months.length > 0 && (
            <>
              <button type="button" className={c.clear} onClick={() => setExt(([a, b]) => [a + 1, b])}>{tr('+ өмнөх сар')}</button>
              <button type="button" className={c.clear} onClick={() => setExt(([a, b]) => [a, b + 1])}>{tr('+ дараагийн сар')}</button>
            </>
          )}
          <button type="button" className={c.clear} disabled={busy} onClick={onClose}>{tr('Хаах')}</button>
          {canEdit && d?.huv && (
            <button type="button" className={c.save} disabled={!editable || !dirty} onClick={() => { void save(); }}>
              {busy ? tr('Хадгалж байна…') : tr('Хадгалах ({0})', dirty)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
