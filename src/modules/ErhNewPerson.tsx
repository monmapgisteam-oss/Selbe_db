'use client';

/**
 * «ШИНЭ ЭРХ» — НЭГ ХҮНИЙ САМБАР (2026-11-23). Албан үүрэг · багц · нэмэлт/хасагдсан эрх · «юу хийж чадах вэ» · ганц
 * «Хадгалах». Хадгалахаас өмнө `rightsDiff`-ийн жагсаалтаар баталгаажуулна; бичих нь `erhNewLive.applyPlan` (аккаунт →
 * урсгал → хуваарилалт → эрх), алхам бүрийн үр дүнг харуулна. Логик бүгд `lib/erhNew.ts`-д — энд зөвхөн зурна.
 */

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { askConfirm } from '@/lib/confirm';
import { STAGE_ORDER, type Stage } from '@/lib/hyanalt';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import type { CapKey } from '@/lib/caps';
import type { Role, ViewKey } from '@/lib/services';
import { capLabel } from '@/modules/capText';
import {
  ALL, JOB_DEFS, canDo, compile, findDef, validate, type Diff, type Person, type Rights, type Sys,
} from '@/lib/jobModel';
import {
  ADDABLE_CAPS, AUTO_VIEW, AUTO_VIEW_FIN, addRight, autoHugatsaa, autoIpc, baseItems, blockers, confirmList, diffText, dropBase, dropDiff,
  jobGroups, jobLabel, newStuck, pkgFamilies, pkgOptions, roleChoices, setBagts, setJob, shown, stepLabel, suggestion,
  viewChoices, viewTitle, wantOf, writePlan, type PersonRow, type Step,
} from '@/lib/erhNew';
import { applyPlan, removeAccount, type StepResult } from '@/lib/erhNewLive';
import {
  flowWaitingFor, flowWaitingText, heldByText, pendingHeldBy, removalBlockingText,
} from '@/lib/aclOps';
import { userError } from '@/components/ui';
import { lastSuperWarn, superDemoteMsg, superGrantMsg } from '@/components/UserTypeSection';
import s from './erhNew.module.css';

const lc = (x: string): string => x.trim().toLowerCase();

/* ══════════════════════ Багц сонгогч ══════════════════════ */

export function PkgPicker({ options, value, onChange, disabled, label }: {
  options: { key: string; name: string }[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const [q, setQ] = useState('');
  const all = value[0] === ALL;
  const on = new Set(value);
  const needle = lc(q);
  const list = options.filter((o) => !needle || lc(o.name).includes(needle) || lc(o.key).includes(needle));
  const fams = pkgFamilies(options.map((o) => o.key));
  const ordered = (keys: Set<string>): string[] => options.map((o) => o.key).filter((k) => keys.has(k));
  const flip = (k: string): void => {
    const next = new Set(on);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange(ordered(next));
  };
  const flipFam = (members: string[]): void => {
    const next = new Set(on);
    const full = members.every((m) => next.has(m));
    for (const m of members) if (full) next.delete(m); else next.add(m);
    onChange(ordered(next));
  };
  return (
    <div className={s.picker} role="group" aria-label={label}>
      <div className={s.row}>
        <input
          className={s.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr('Багц хайх…')}
          aria-label={tr('Багц хайх')}
          disabled={disabled}
        />
        <label className={s.check}>
          <input type="checkbox" checked={all} disabled={disabled} onChange={(e) => onChange(e.target.checked ? [ALL] : [])} />
          {tr('Бүх багц')}
        </label>
        <span className={s.muted}>{all ? tr('Бүх багц') : tr('{0} сонгосон', String(value.length))}</span>
      </div>
      {!all && fams.length > 0 && (
        <div className={s.row}>
          {fams.map((f) => (
            <button
              key={f.family}
              type="button"
              className={`${s.fam} ${f.members.every((m) => on.has(m)) ? s.famOn : ''}`}
              disabled={disabled}
              onClick={() => flipFam(f.members)}
              title={f.members.join(', ')}
            >
              {tr('{0} бүгд', f.family)}
            </button>
          ))}
        </div>
      )}
      {!all && (
        <div className={s.pickList}>
          {list.map((o) => (
            <label key={o.key} className={s.pickItem} title={o.name}>
              <input type="checkbox" checked={on.has(o.key)} disabled={disabled} onChange={() => flip(o.key)} />
              <span>{o.name}</span>
            </label>
          ))}
          {!list.length && <span className={s.muted}>{tr('Тохирох багц алга')}</span>}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ «+ Эрх нэмэх» ══════════════════════ */

type AddKind = 'cap' | 'role' | 'stage' | 'view';

function AddRight({ rights, onAdd, disabled }: { rights: Rights; onAdd: (d: Diff) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AddKind>('cap');
  const [cap, setCap] = useState('');
  const [role, setRole] = useState('');
  const [stage, setStage] = useState<Stage | ''>('');
  const [viewOnly, setViewOnly] = useState(false);
  const [view, setView] = useState('');
  const [bagts, setBagtsSel] = useState<string[]>([]);
  if (!open) {
    return (
      <div>
        <button type="button" className={s.btn} disabled={disabled} onClick={() => setOpen(true)}>{tr('+ Эрх нэмэх')}</button>
      </div>
    );
  }
  const roles = roleChoices();
  const picked = roles.find((r) => `${r.sys}:${r.role}` === role) ?? null;
  const space: Sys | 'flow' = kind === 'role' ? (picked?.sys ?? 'huvaari') : 'flow';
  const needsPkgs = kind === 'role' || kind === 'stage';
  const caps = ADDABLE_CAPS.filter((c) => !rights.caps.includes(c));
  const views = viewChoices(rights);
  const ready = kind === 'cap' ? !!cap
    : kind === 'view' ? !!view
      : kind === 'role' ? !!picked && bagts.length > 0
        : !!stage && bagts.length > 0;
  const add = (): void => {
    if (!ready) return;
    if (kind === 'cap') onAdd({ kind: 'cap', cap: cap as CapKey });
    else if (kind === 'view') onAdd({ kind: 'view', view: view as ViewKey });
    else if (kind === 'role' && picked) onAdd({ kind: 'role', sys: picked.sys, role: picked.role, bagts });
    else if (stage) onAdd({ kind: 'stage', stage, bagts, ...(viewOnly ? { viewOnly: true } : {}) });
    setOpen(false); setCap(''); setRole(''); setStage(''); setView(''); setBagtsSel([]); setViewOnly(false);
  };
  return (
    <div className={s.tool}>
      <div className={s.row}>
        <select className={s.select} value={kind} onChange={(e) => { setKind(e.target.value as AddKind); setBagtsSel([]); }} aria-label={tr('Эрхийн төрөл')}>
          <option value="cap">{tr('Энгийн эрх')}</option>
          <option value="role">{tr('Багцын үүрэг')}</option>
          <option value="stage">{tr('Гүйцэтгэлийн урсгалын шат')}</option>
          <option value="view">{tr('Харагдац')}</option>
        </select>
        {kind === 'cap' && (
          <select className={s.select} value={cap} onChange={(e) => setCap(e.target.value)} aria-label={tr('Энгийн эрх')}>
            <option value="">{tr('Эрх сонгох…')}</option>
            {caps.map((c) => <option key={c} value={c}>{capLabel(c)}</option>)}
          </select>
        )}
        {kind === 'role' && (
          <select className={s.select} value={role} onChange={(e) => { setRole(e.target.value); setBagtsSel([]); }} aria-label={tr('Багцын үүрэг')}>
            <option value="">{tr('Үүрэг сонгох…')}</option>
            {roles.map((r) => <option key={`${r.sys}:${r.role}`} value={`${r.sys}:${r.role}`}>{r.label}</option>)}
          </select>
        )}
        {kind === 'stage' && (
          <>
            <select className={s.select} value={stage} onChange={(e) => setStage(e.target.value as Stage | '')} aria-label={tr('Шат')}>
              <option value="">{tr('Шат сонгох…')}</option>
              {STAGE_ORDER.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
            </select>
            <label className={s.check}>
              <input type="checkbox" checked={viewOnly} onChange={(e) => setViewOnly(e.target.checked)} />
              {tr('Зөвхөн харна')}
            </label>
          </>
        )}
        {kind === 'view' && (
          <select className={s.select} value={view} onChange={(e) => setView(e.target.value)} aria-label={tr('Харагдац')}>
            <option value="">{tr('Харагдац сонгох…')}</option>
            {views.map((v) => <option key={v} value={v}>{viewTitle(v)}</option>)}
          </select>
        )}
      </div>
      {kind === 'stage' && rights.flow && (
        <p className={s.note}>{tr('Нэг аккаунт зөвхөн нэг шат барина — өөр шат нэмбэл одоогийн шат солигдоно.')}</p>
      )}
      {kind === 'view' && autoHugatsaa(rights) && (
        <p className={s.note}>{tr('«{0}» — «Гүйцэтгэл»-ээс автоматаар нээлттэй.', viewTitle(AUTO_VIEW))}</p>
      )}
      {kind === 'view' && autoIpc(rights) && (
        <p className={s.note}>{tr('«{0}» — «Санхүүжилт»-ээс автоматаар нээлттэй.', viewTitle(AUTO_VIEW_FIN))}</p>
      )}
      {needsPkgs && (kind === 'stage' || picked) && (
        <PkgPicker options={pkgOptions(space)} value={bagts} onChange={setBagtsSel} label={tr('Багцууд')} />
      )}
      <div className={s.row}>
        <button type="button" className={`${s.btn} ${s.primary}`} disabled={!ready} onClick={add}>{tr('Нэмэх')}</button>
        <button type="button" className={s.btn} onClick={() => setOpen(false)}>{tr('Болих')}</button>
      </div>
    </div>
  );
}

/* ══════════════════════ Самбар ══════════════════════ */

export type PersonPanelProps = {
  /** Жижиг үсгийн нэр */
  user: string;
  display: string;
  isNew: boolean;
  /** Одоогийн (хадгалсан) эрх */
  have: Rights;
  draft: Person;
  dirty: boolean;
  onDraft: (p: Person) => void;
  onReset: () => void;
  /** Засах боломжгүй шалтгаан (админы мөр · кодын админ) */
  readOnly: string | null;
  /** «Админ (super)» албан үүрэг сонгож болох уу (үндсэн админ) */
  canSuper: boolean;
  /** Албан үүргийг солихгүй шалтгаан (өөрийн админ мөр) */
  jobLock: string | null;
  /** Хасах боломжгүй шалтгаан (`null` = болно) */
  removeLock: string | null;
  /** Хадгалахыг түр хаах шалтгаан (хүснэгт уншигдаагүй · хуучин самбарт ноорогтой · бичилт явагдаж байна) */
  saveLock: string | null;
  rows: readonly PersonRow[];
  /** Шинэ аккаунтын ArcGIS-ийн лавлагааны анхааруулга */
  note?: string;
  onClose: () => void;
  onSaved: () => void;
  onRemoved: () => void;
};

const changeKey = (i: number, text: string): string => `${i}:${text}`;

export function ErhNewPerson(p: PersonPanelProps) {
  const { draft, have, isNew, readOnly } = p;
  const [confirm, setConfirm] = useState<{ want: Rights; steps: Step[]; lines: { op: 'add' | 'remove'; text: string }[]; stuck: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<StepResult[] | null>(null);
  const [err, setErr] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { panelRef.current?.querySelector<HTMLElement>('select, button')?.focus(); }, [p.user]);

  const def = findDef(JOB_DEFS, draft.job);
  const want = wantOf(draft, have, isNew);
  const problems = validate(draft);
  const stop = blockers(draft);
  const sugg = readOnly ? null : suggestion(draft);
  const off = !!readOnly || busy;
  const edit = (next: Person): void => { setResults(null); setErr(''); setConfirm(null); p.onDraft(next); };
  const items = baseItems(draft);
  const adds = draft.add.filter(shown);
  const dels = draft.remove.filter(shown);
  const can = canDo(compile(draft));

  const askSave = (): void => {
    setErr(''); setResults(null);
    if (p.saveLock) { setErr(p.saveLock); return; }
    if (stop.length) { setErr(stop.map((x) => x.text).join(' ')); return; }
    const steps = writePlan(want, have, isNew);
    const lines = confirmList(want, have).map((c) => ({ op: c.op, text: c.text }));
    if (!steps.length) { setErr(tr('Өөрчлөлт алга — хадгалах зүйлгүй.')); return; }
    setConfirm({ want, steps, lines, stuck: newStuck(p.rows, p.user, want) });
  };

  const doSave = async (): Promise<void> => {
    if (!confirm || busy) return;
    if (p.saveLock) { setErr(p.saveLock); return; }
    const toSuper = confirm.want.role === 'super' && have.role !== 'super';
    const fromSuper = have.role === 'super' && confirm.want.role !== 'super' && !isNew;
    if (toSuper && !(await askConfirm(superGrantMsg(p.user), { danger: true, ok: tr('Админ эрх олгох') }))) return;
    if (fromSuper && !(await askConfirm(superDemoteMsg(p.user, jobLabel(confirm.want.role)), { danger: true, ok: tr('Админ эрх хасах') }))) return;
    setBusy(true);
    try {
      const out = await applyPlan(p.user, confirm.steps);
      setResults(out);
      setConfirm(null);
      if (out.every((r) => r.ok)) p.onSaved();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (): Promise<void> => {
    if (p.removeLock || busy) return;
    const [held, flowHeld] = await Promise.all([pendingHeldBy([p.user]), flowWaitingFor([p.user])]);
    const parts = [
      lastSuperWarn([p.user]),
      removalBlockingText([p.user]),
      flowHeld == null || flowHeld.length ? flowWaitingText(flowHeld) : '',
      held == null || held.length ? heldByText(held) : '',
    ].filter(Boolean);
    const msg = tr('«{0}» аккаунтыг хасах уу? Нэвтрэлт нь хаагдаж, гүйцэтгэлийн урсгал, багцын хуваарилалт, эрх бүгд арилна. «Хэрэглэгчдийн эрх удирдах» хуудасны «Буцаах»-аар сэргээж болно (эрх буцахгүй).', p.display)
      + (parts.length ? `\n\n${parts.join('\n\n')}` : '');
    if (!(await askConfirm(msg, { danger: true, ok: tr('Хасах') }))) return;
    setBusy(true);
    try {
      const r = await removeAccount(p.user);
      if (r.ok) p.onRemoved(); else setErr(r.error ? userError(r.error) : tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ хөтчид'));
    } finally {
      setBusy(false);
    }
  };

  const groups = jobGroups();
  const known = !draft.job || groups.some((g) => g.defs.some((d) => d.key === draft.job));

  return (
    <>
      <div className={s.scrim} onClick={p.onClose} aria-hidden />
      <div
        ref={panelRef}
        className={s.drawer}
        role="dialog"
        aria-label={tr('{0} — эрх', p.display)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); p.onClose(); } }}
      >
        <div className={s.dHead}>
          <span className={s.dName}>{p.display}</span>
          {isNew && <span className={`${s.badge} ${s.bDiff}`}>{tr('шинэ аккаунт')}</span>}
          {p.dirty && <span className={s.dirty} title={tr('Хадгалаагүй өөрчлөлттэй')} />}
          <button type="button" className={s.btn} onClick={p.onClose} aria-label={tr('Хаах')}>✕</button>
        </div>
        <div className={s.dBody}>
          {readOnly && <p className={s.warn} role="status">{readOnly}</p>}
          {p.note && <p className={s.warn} role="status">{p.note}</p>}
          {problems.length > 0 && (
            <div className={s.sec}>
              {problems.map((x) => (
                <p key={x.code + x.text} className={x.level === 'error' ? s.err : s.warn} role={x.level === 'error' ? 'alert' : undefined}>{x.text}</p>
              ))}
            </div>
          )}

          <div className={s.sec}>
            <div className={s.secHead}>{tr('Албан үүрэг')}</div>
            <select
              className={s.select}
              value={draft.job ?? ''}
              disabled={off || !!p.jobLock}
              aria-label={tr('Албан үүрэг')}
              onChange={(e) => edit(setJob(draft, (e.target.value || null) as Role | null))}
            >
              {!draft.job && <option value="">{tr('Албан үүрэг сонгох…')}</option>}
              {!known && draft.job && <option value={draft.job} disabled>{jobLabel(draft.job)}</option>}
              {groups.map((g) => (
                <optgroup key={g.title} label={g.title}>
                  {g.defs.map((d) => (
                    <option key={d.key} value={d.key} disabled={d.admin && !p.canSuper && draft.job !== d.key}>{d.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {p.jobLock && <p className={s.note}>{p.jobLock}</p>}
            {sugg && (
              <p className={s.ok}>
                {tr('Санал: {0} — {1} зөрүү багасна', sugg.def.label, String(sugg.saves))}
                {' '}
                <button type="button" className={s.linkBtn} disabled={off} onClick={() => edit(sugg.person)}>{tr('Хэрэглэх')}</button>
              </p>
            )}
          </div>

          {def?.scope === 'packages' && (
            <div className={s.sec}>
              <div className={s.secHead}>{tr('Багцууд')}</div>
              <PkgPicker
                options={pkgOptions('person')}
                value={draft.bagts}
                disabled={off}
                label={tr('Багцууд')}
                onChange={(next) => edit(setBagts(draft, next))}
              />
            </div>
          )}
          {def?.scope === 'all' && (
            <div className={s.sec}>
              <div className={s.secHead}>{tr('Багцууд')}</div>
              <p className={s.note}>{tr('Бүх багц — албан үүргээр.')}</p>
            </div>
          )}

          <div className={s.sec}>
            <div className={s.secHead}>{tr('Албан үүргээс ирэх эрх')}</div>
            {items.length ? (
              <div className={s.chips}>
                {items.map((it) => (
                  <span key={it.id} className={s.chip}>
                    <span className={s.chipText}>{it.text}</span>
                    {!off && (
                      <button type="button" className={s.chipX} title={tr('Энэ хүнээс хасах')} aria-label={tr('Хасах: {0}', it.text)}
                        onClick={() => edit(dropBase(draft, it))}>✕</button>
                    )}
                  </span>
                ))}
              </div>
            ) : <p className={s.note}>{tr('Албан үүрэг эрх олгохгүй.')}</p>}
          </div>

          <div className={s.sec}>
            <div className={s.secHead}>{tr('Нэмэлт / хасагдсан эрх')}</div>
            {adds.length + dels.length > 0 ? (
              <div className={s.chips}>
                {adds.map((d, i) => (
                  <span key={`a${changeKey(i, diffText(d))}`} className={`${s.chip} ${s.chipAdd}`}>
                    <span className={s.chipText}>+ {diffText(d)}</span>
                    {!off && (
                      <button type="button" className={s.chipX} title={tr('Нэмснийг болих')} aria-label={tr('Хасах: {0}', diffText(d))}
                        onClick={() => edit(dropDiff(draft, 'add', d))}>✕</button>
                    )}
                  </span>
                ))}
                {dels.map((d, i) => (
                  <span key={`r${changeKey(i, diffText(d))}`} className={`${s.chip} ${s.chipDel}`}>
                    <span className={s.chipText}>− {diffText(d)}</span>
                    {!off && (
                      <button type="button" className={s.chipX} title={tr('Албан үүргийн эрхийг буцаах')} aria-label={tr('Буцаах: {0}', diffText(d))}
                        onClick={() => edit(dropDiff(draft, 'remove', d))}>✕</button>
                    )}
                  </span>
                ))}
              </div>
            ) : <p className={s.note}>{tr('Албан үүргээсээ зөрөхгүй.')}</p>}
            <AddRight rights={compile(draft)} disabled={off} onAdd={(d) => edit(addRight(draft, d))} />
          </div>

          <div className={s.sec}>
            <div className={s.secHead}>{tr('Энэ хүн юу хийж чадах вэ')}</div>
            {can.length ? (
              <ul className={s.list}>
                {can.map((c) => <li key={c}>{c}</li>)}
                {autoHugatsaa(compile(draft)) && <li className={s.muted}>{tr('«{0}» — «Гүйцэтгэл»-ээс автоматаар', viewTitle(AUTO_VIEW))}</li>}
                {autoIpc(compile(draft)) && <li className={s.muted}>{tr('«{0}» — «Санхүүжилт»-ээс автоматаар', viewTitle(AUTO_VIEW_FIN))}</li>}
              </ul>
            ) : <p className={s.note}>{tr('Юу ч хийхгүй — порталд нэвтэрнэ, харагдацгүй.')}</p>}
          </div>

          {confirm && (
            <div className={`${s.sec} ${s.confirm}`} role="region" aria-label={tr('Хадгалахын өмнө шалгах')}>
              <div className={s.secHead}>{tr('Хадгалахад дараах өөрчлөлт бичигдэнэ')}</div>
              {confirm.lines.map((l, i) => (
                <div key={changeKey(i, l.text)} className={l.op === 'add' ? s.chAdd : s.chDel}>{l.text}</div>
              ))}
              {confirm.stuck.length > 0 && (
                <div className={s.err} role="alert">
                  {tr('Хадгалсны дараа ажил зогсоно:')}
                  <ul className={s.list}>{confirm.stuck.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              )}
              <p className={s.note}>{tr('Бичих дараалал: {0}.', confirm.steps.map(stepLabel).join(' → '))}</p>
              <div className={s.row}>
                <button type="button" className={`${s.btn} ${s.primary}`} disabled={busy} onClick={() => { void doSave(); }}>
                  {busy ? tr('Хадгалж байна…') : tr('Батлаад хадгалах')}
                </button>
                <button type="button" className={s.btn} disabled={busy} onClick={() => setConfirm(null)}>{tr('Буцах')}</button>
              </div>
            </div>
          )}

          {results && (
            <div className={s.sec} role="status">
              <div className={s.secHead}>{tr('Хадгалалтын үр дүн')}</div>
              {results.map((r, i) => (
                <p key={changeKey(i, stepLabel(r.step))} className={r.ok ? s.ok : r.skipped ? s.warn : s.err}>
                  {r.ok ? '✓ ' : r.skipped ? '… ' : '✗ '}
                  {stepLabel(r.step)}
                  {r.skipped ? ` — ${tr('алгасав (аккаунтын мөр бичигдээгүй)')}` : r.error ? ` — ${userError(r.error)}` : ''}
                </p>
              ))}
            </div>
          )}
          {err && <p className={s.err} role="alert">{err}</p>}
        </div>
        <div className={s.dFoot}>
          {!isNew && (
            <button type="button" className={`${s.btn} ${s.danger}`} disabled={!!p.removeLock || busy}
              title={p.removeLock ?? tr('Аккаунтыг хасна')} onClick={() => { void doRemove(); }}>
              {tr('Хасах')}
            </button>
          )}
          <span className={s.footInfo}>
            {p.dirty ? tr('Хадгалаагүй өөрчлөлт байна') : tr('Өөрчлөлтгүй')}
          </span>
          <button type="button" className={s.btn} disabled={!p.dirty || busy} onClick={() => { setConfirm(null); setResults(null); setErr(''); p.onReset(); }}>
            {tr('Болих')}
          </button>
          <button type="button" className={`${s.btn} ${s.primary}`} disabled={off || !p.dirty || !!confirm} onClick={askSave}>
            {tr('Хадгалах')}
          </button>
        </div>
      </div>
    </>
  );
}
