'use client';

/**
 * «ЗӨВШӨӨРӨЛ» ХУУДАСНЫ ҮНДСЭН ХЭСЭГ — «ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ»-ИЙН «ЗӨВШӨӨРӨЛ» ХЭСГИЙН МӨРҮҮД (2026-11-19, хэрэглэгч:
 * «үндсэн зөвшөөрөл хэсгийг ТТБ-ийн data source-той болгох; ТТБ-ийн Зөвшөөрөл бүлгийн дагуу загварчилж нэмдэг байх»).
 *
 * Эх нь ганц — `Guitsetgel_talbe/182` («Төсөл төлөвлөгөө биелэлт»)-ийн «Зөвшөөрөл» үе шатны мод. Энд засах нь тэр хүснэгтэд
 * шууд бичигдэнэ (`lib/planEdit` — «Төсөл төлөвлөгөө биелэлт» хуудастай НЭГ дүрэм), тиймээс хоёр газар өөр утга үүсэхгүй.
 * Гараар бөглөх нь: гүйцэтгэлийн хувь (доод мөрд), захирамжийн дугаар, огноо. Бүлгийн хувь, жин автоматаар бодогдоно.
 */
import { useMemo, useRef, useState } from 'react';
import { askConfirm } from '@/lib/confirm';
import { t as tr } from '@/lib/i18nCore';
import { Loading, userError } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { num } from '@/lib/format';
import { loadProjectPlan } from '@/lib/projectPlanInputs';
import type { PlanNode } from '@/lib/projectPlan';
import { addPlanRows, addWhy, deletePlanRow, deleteWhy, editWhy, importCutoff, isNewGroup, savePlanValue } from '@/lib/planEdit';
import s from './zovPlan.module.css';

type State = 'ok' | 'part' | 'wait';
const stateOf = (p: number): State => (p >= 99.995 ? 'ok' : p > 0 ? 'part' : 'wait');
const stateText = (st: State): string => (st === 'ok' ? tr('Зөвшөөрсөн') : st === 'part' ? tr('Явцтай') : tr('Хүлээгдэж буй'));
const dayOf = (ms: unknown): string => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '');

export function ZovPlan({ canEdit }: { canEdit: boolean }) {
  const q = useAsync(() => loadProjectPlan(), []);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<'all' | State>('all');
  const [busy, setBusy] = useState(false);
  /* хадгалалтын дараалал — `run` (доор) */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const [err, setErr] = useState('');
  const [addAt, setAddAt] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', pct: '', weight: '' });

  const model = useMemo(() => {
    if (q.state !== 'ready') return null;
    const plan = q.data;
    const phase = plan.tree.root.children.find((n) => n.phase === 'zovshoorol') ?? null;
    if (!phase) return { plan, phase: null, rows: [] as PlanNode[], leaves: [] as PlanNode[] };
    const rows: PlanNode[] = [];
    const walk = (n: PlanNode) => { for (const c of n.children) { rows.push(c); walk(c); } };
    walk(phase);
    return { plan, phase, rows, leaves: rows.filter((n) => n.children.length === 0) };
  }, [q]);

  if (q.state === 'loading') return <section className={s.box}><Loading /></section>;
  if (q.state === 'error' || !model) {
    return <section className={s.box}><p className={s.bad} role="alert">{tr('«Төсөл төлөвлөгөө биелэлт»-ийн мөр уншигдсангүй.')} {q.state === 'error' ? userError(q.error) : ''}</p></section>;
  }
  const { plan, phase, rows, leaves } = model;
  if (!phase) return <section className={s.box}><p className={s.muted}>{tr('«Төсөл төлөвлөгөө биелэлт»-д «Зөвшөөрөл» хэсэг алга.')}</p></section>;

  /* хэмжигдээгүй = 0% */
  const pctOf = (n: PlanNode): number => plan.result.values.get(n)?.S ?? 0;
  const count = (st: State) => leaves.filter((n) => stateOf(pctOf(n)) === st).length;
  const cutoff = importCutoff(plan.stored ?? []);
  const base = phase.depth;

  /* харагдах мөр: эцэг бүр нээлттэй; шүүлтэд таарсан доод мөр ба түүний эцгүүд */
  const keep = new Set<PlanNode>();
  if (filter !== 'all') {
    for (const n of leaves) {
      if (stateOf(pctOf(n)) !== filter) continue;
      for (let x: PlanNode | null = n; x && x !== phase; x = x.parent) keep.add(x);
    }
  }
  const visible = rows.filter((n) => {
    if (filter !== 'all') return keep.has(n);
    for (let p = n.parent; p && p !== phase; p = p.parent) if (!open.has(p.code)) return false;
    return true;
  });

  /* 2026-11-23 (давтан аудит): нүдний оролт хадгалалтын үед ИДЭВХТЭЙ (Tab-аар шилжинэ) тул хадгалалтыг ДАРААЛУУЛНА — давхцаж
     бичихгүй, «×»/«+» сүүлийн хадгалалт дуустал идэвхгүй */
  const run = (fn: () => Promise<unknown>): Promise<void> => {
    pending.current += 1;
    setBusy(true); setErr('');
    const next = queue.current.then(async () => {
      try { await fn(); } catch (e) { setErr(userError(e)); }
    }).finally(() => {
      pending.current -= 1;
      if (pending.current === 0) setBusy(false);
    });
    queue.current = next;
    return next;
  };
  /* 2026-11-23 (аудит): буруу утгыг нүдэнд үлдээхгүй — хадгалсан утгаар буцаана */
  const savePct = (n: PlanNode, el: HTMLInputElement) => {
    const raw = el.value;
    const t = raw.trim().replace(',', '.');
    const v = t === '' ? null : Number(t);
    if (v != null && (!Number.isFinite(v) || v < 0 || v > 100)) {
      setErr(tr('Гүйцэтгэлийн хувь 0–100 хооронд байх ёстой'));
      el.value = n.row?.guitsetgel_huvi == null ? '' : String(n.row.guitsetgel_huvi);
      return;
    }
    if ((n.row?.guitsetgel_huvi ?? null) === v) return;
    void run(() => savePlanValue(n, 'pct', v));
  };
  const saveText = (n: PlanNode, raw: string) => {
    const v = raw.trim() || null;
    if ((n.row?.zahiramj_dugaar ?? null) === v) return;
    void run(() => savePlanValue(n, 'orderNo', v));
  };
  /* 2026-11-23 (аудит): дутуу бичсэн огноо (`badInput`) хоосон утга мэт ирдэг — хадгалсан огноог устгахгүй */
  const saveDate = (n: PlanNode, el: HTMLInputElement) => {
    const raw = el.value;
    if (el.validity.badInput) { el.value = dayOf(n.row?.zahiramj_ognoo); return; }
    const v = raw ? Date.parse(`${raw}T00:00:00Z`) : null;
    if (dayOf(n.row?.zahiramj_ognoo) === raw) return;
    void run(() => savePlanValue(n, 'orderDate', v));
  };
  const submitAdd = (parent: PlanNode) => {
    const pct = draft.pct.trim() === '' ? null : Number(draft.pct.replace(',', '.'));
    const weight = draft.weight.trim() === '' ? null : Number(draft.weight.replace(',', '.'));
    void run(async () => {
      await addPlanRows(plan.tree, parent, [{ name: draft.name, pct, weight }]);
      setAddAt(null); setDraft({ name: '', pct: '', weight: '' });
      setOpen((o) => new Set(o).add(parent.code));
    });
  };
  const toggle = (code: string) => setOpen((o) => { const x = new Set(o); if (x.has(code)) x.delete(code); else x.add(code); return x; });

  const chips: ['all' | State, string, number][] = [
    ['all', tr('Бүгд'), leaves.length], ['ok', tr('Зөвшөөрсөн'), count('ok')], ['part', tr('Явцтай'), count('part')], ['wait', tr('Хүлээгдэж буй'), count('wait')],
  ];

  return (
    <section className={s.box} aria-busy={busy}>
      <div className={s.head}>
        <h2 className={s.h2}>{tr('Зөвшөөрөл — «Төсөл төлөвлөгөө биелэлт»-ийн мөрүүд')}</h2>
        <span className={s.total}>{tr('Нийт гүйцэтгэл')} <b className="num">{num(pctOf(phase), 1)}%</b></span>
      </div>
      <div className={s.chips} role="group" aria-label={tr('Төлөвөөр шүүх')}>
        {chips.map(([k, label, n]) => (
          <button key={k} type="button" className={`${s.chip} ${filter === k ? s.chipOn : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {label} <b className="num">{num(n)}</b>
          </button>
        ))}
        {filter === 'all' && (
          <button type="button" className={s.link} onClick={() => setOpen(open.size ? new Set() : new Set(rows.filter((n) => n.children.length).map((n) => n.code)))}>
            {open.size ? tr('Бүгдийг хураах') : tr('Бүгдийг дэлгэх')}
          </button>
        )}
      </div>
      {err && <p className={s.bad} role="alert">{err}</p>}
      {plan.failed.length > 0 && <p className={s.muted} role="status">{tr('{0} эх сурвалж уншигдаагүй — зарим хувь дутуу байж болно.', num(plan.failed.length))}</p>}
      <div className={s.scroll} tabIndex={0} role="region" aria-label={tr('Зөвшөөрлийн мөрүүд')}>
        <table className={s.tbl}>
          <thead>
            <tr>
              <th>{tr('Д/Д')}</th>
              <th>{tr('Ажил, үйлчилгээ')}</th>
              <th>{tr('Багц')}</th>
              <th className={s.r}>{tr('Гүйцэтгэл')}</th>
              <th>{tr('Төлөв')}</th>
              <th>{tr('Захирамжийн дугаар')}</th>
              <th>{tr('Захирамжийн огноо')}</th>
              {canEdit && <th aria-label={tr('Үйлдэл')} />}
            </tr>
          </thead>
          <tbody>
            {visible.map((n) => {
              const leaf = n.children.length === 0;
              const p = pctOf(n);
              const st = stateOf(p);
              const pctLock = editWhy(n, 'pct');
              const canPct = canEdit && leaf && !pctLock;
              const canMeta = canEdit && !editWhy(n, 'orderNo');
              const aWhy = canEdit ? addWhy(plan.tree, n) : 'x';
              const dWhy = canEdit && leaf ? deleteWhy(n, cutoff) : 'x';
              return [
                <tr key={n.code} className={leaf ? undefined : s.group}>
                  <td className="num">{n.code}</td>
                  <td style={{ paddingLeft: 6 + (n.depth - base - 1) * 14 }}>
                    {!leaf && filter === 'all' ? (
                      <button type="button" className={s.tog} aria-expanded={open.has(n.code)} onClick={() => toggle(n.code)}>
                        <span aria-hidden>{open.has(n.code) ? '▾' : '▸'}</span> {n.row?.ajil_uilchilgee}
                      </button>
                    ) : n.row?.ajil_uilchilgee}
                  </td>
                  <td>{n.row?.bagts ?? ''}</td>
                  <td className={s.r}>
                    {canPct ? (
                      <input
                        key={`${n.code}:${n.row?.guitsetgel_huvi ?? ''}`}
                        className={s.inNum} inputMode="decimal"
                        defaultValue={n.row?.guitsetgel_huvi == null ? '' : String(n.row.guitsetgel_huvi)}
                        aria-label={tr('{0} — гүйцэтгэлийн хувь', String(n.row?.ajil_uilchilgee ?? n.code))}
                        onBlur={(e) => savePct(n, e.target)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                    ) : <span className="num" title={leaf && pctLock ? pctLock : undefined}>{num(p, 1)}%</span>}
                  </td>
                  <td><span className={`${s.tag} ${s[st]}`}>{stateText(st)}</span></td>
                  <td>
                    {canMeta ? (
                      <input
                        key={`${n.code}:no:${n.row?.zahiramj_dugaar ?? ''}`} className={s.inTxt}
                        defaultValue={n.row?.zahiramj_dugaar ?? ''} aria-label={tr('{0} — захирамжийн дугаар', String(n.row?.ajil_uilchilgee ?? n.code))}
                        onBlur={(e) => saveText(n, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                    ) : n.row?.zahiramj_dugaar ?? ''}
                  </td>
                  <td>
                    {canMeta ? (
                      <input
                        key={`${n.code}:d:${dayOf(n.row?.zahiramj_ognoo)}`} className={s.inTxt} type="date"
                        defaultValue={dayOf(n.row?.zahiramj_ognoo)} aria-label={tr('{0} — захирамжийн огноо', String(n.row?.ajil_uilchilgee ?? n.code))}
                        onBlur={(e) => saveDate(n, e.target)}
                      />
                    ) : dayOf(n.row?.zahiramj_ognoo)}
                  </td>
                  {canEdit && (
                    <td className={s.act}>
                      {!aWhy && (
                        <button type="button" className={s.mini} disabled={busy} title={tr('«{0}» доор мөр нэмэх', String(n.row?.ajil_uilchilgee ?? n.code))}
                          onClick={() => { setAddAt(addAt === n.code ? null : n.code); setDraft({ name: '', pct: '', weight: '' }); }}>+</button>
                      )}
                      {!dWhy && (
                        <button type="button" className={s.mini} disabled={busy} title={tr('Гараар нэмсэн мөрийг устгах')}
                          onClick={() => {
                            void (async () => {
                              if (!(await askConfirm(tr('«{0}» мөрийг устгах уу?', String(n.row?.ajil_uilchilgee ?? n.code)), { danger: true, ok: tr('Устгах') }))) return;
                              await run(() => deletePlanRow(n, cutoff));
                            })();
                          }}>×</button>
                      )}
                    </td>
                  )}
                </tr>,
                addAt === n.code && (
                  <tr key={`${n.code}:add`} className={s.addRow}>
                    <td />
                    <td colSpan={2}>
                      <input className={s.inTxt} autoFocus placeholder={tr('Зөвшөөрлийн нэр')} aria-label={tr('Шинэ мөрийн нэр')}
                        value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    </td>
                    <td className={s.r}>
                      <input className={s.inNum} inputMode="decimal" placeholder="%" aria-label={tr('Шинэ мөрийн гүйцэтгэлийн хувь')}
                        value={draft.pct} onChange={(e) => setDraft({ ...draft, pct: e.target.value })} />
                    </td>
                    <td colSpan={2}>
                      {isNewGroup(n) && (
                        <input className={s.inNum} inputMode="decimal" placeholder={tr('жин %')} aria-label={tr('Шинэ мөрийн жин')}
                          value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: e.target.value })} />
                      )}
                    </td>
                    <td colSpan={2} className={s.act}>
                      <button type="button" className={s.save} disabled={busy || !draft.name.trim()} onClick={() => submitAdd(n)}>{tr('Нэмэх')}</button>
                      <button type="button" className={s.mini} onClick={() => setAddAt(null)} aria-label={tr('Болих')}>×</button>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      {canEdit && addWhy(plan.tree, phase) == null && (
        <p className={s.muted}>{tr('Мөрийн «+» товчоор тэр бүлгийн доор зөвшөөрөл нэмнэ. Бүлгийн хувь, жин автоматаар бодогдоно.')}</p>
      )}
    </section>
  );
}
