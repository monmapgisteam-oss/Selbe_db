'use client';

/**
 * «ШИНЭ ЭРХ» БҮЛЭГ (2026-11-23) — админ порталын хажуугийн цэсний эхний бүлэг: «Хүмүүс» · «Багцууд» · «Албан үүрэг».
 * Албан үүргийн загвар (`lib/jobModel.ts`) дээр: админ хүнд «албан үүрэг · багц» сонгож, онцгой эрхийг ИЛ ялгаагаар нэмж/хасна;
 * хадгалахад одоогийн бичих функцүүдээр (`lib/erhNewLive.ts`) ЗӨВХӨН зөрсөн хэсэг бичигдэнэ. Хуучин хуудсууд хэвээр (харьцуулж,
 * буцаж болно). Цэвэр логик `lib/erhNew.ts` — энэ файл нимгэн.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { currentUser } from '@/lib/who';
import { BOOTSTRAP_SUPER, isCodeSuper, type Role } from '@/lib/services';
import { isRootAdmin, subscribe } from '@/lib/permissions';
import { subscribeCaps } from '@/lib/caps';
import { subscribeAcl } from '@/lib/guitsetgelAcl';
import { subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { subscribeObyemAcl } from '@/lib/obyemAcl';
import { subscribeChanarAcl } from '@/lib/chanarAcl';
import { subscribeAjilAcl } from '@/lib/ajilAcl';
import { subscribeButetsAcl } from '@/lib/butetsAcl';
import { subscribeHabeaAcl } from '@/lib/habeaAcl';
import { aclPendingFor, allAclReady, lockMsg, subscribeAclPending } from '@/lib/aclOps';
import { typeApplyBusy } from '@/lib/roleTypeApply';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { coverage, normRights, sameRights, type Person, type Rights } from '@/lib/jobModel';
import {
  NO_JOB, buildRows, copyPreview, covSummary, filterRows, holdersOf, jobGroups, jobInfos, newNameError, newPerson,
  pkgRows, rightsOf, setJob, wantOf, whoCanRows, whoChoices, SLOT_DEFS, type PersonRow,
} from '@/lib/erhNew';
import { liveSnapshot, removedAccounts } from '@/lib/erhNewLive';
import { ErhNewPerson } from './ErhNewPerson';
import s from './erhNew.module.css';

export type ErhNewPane = 'nPeople' | 'nPkgs' | 'nJobs';

/** ArcGIS хэрэглэгчийн лавлагаа — `UserAdmin`-ы `lookupArcgisUser` (сүлжээ тэнд) */
type Lookup = (name: string) => Promise<'ok' | 'missing' | 'org' | 'unknown'>;

type Edit = { user: string; display: string; isNew: boolean; draft: Person | null; note?: string };

const lc = (x: string): string => x.trim().toLowerCase();

/** Бүх эрхийн дэлгүүрийн өөрчлөлт — хүснэгтийг дахин бодно */
function useStoreTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = (): void => setN((x) => x + 1);
    const offs = [
      subscribe(bump), subscribeCaps(bump), subscribeAcl(bump), subscribeHuvaariAcl(bump), subscribeObyemAcl(bump),
      subscribeChanarAcl(bump), subscribeAjilAcl(bump), subscribeButetsAcl(bump), subscribeHabeaAcl(bump), subscribeAclPending(bump),
    ];
    return () => { for (const off of offs) off(); };
  }, []);
  return n;
}

export function ErhNew({ pane, onPane, oldDrafts, onDirty, lookup, askLeave }: {
  pane: ErhNewPane;
  onPane: (p: ErhNewPane) => void;
  /** «Хэрэглэгчдийн эрх удирдах» хуудсанд хадгалаагүй ноорогтой хүмүүс (жижиг үсгээр) */
  oldDrafts: ReadonlySet<string>;
  /** Хадгалаагүй ноорогтой хүн (`null` = алга) — порталаас гарах/хуудас солиход асуухад */
  onDirty: (user: string | null) => void;
  lookup: Lookup;
  /** «Хадгалаагүй өөрчлөлт байна. Хадгалалгүй гарах уу?» */
  askLeave: () => Promise<boolean>;
}) {
  const tick = useStoreTick();
  /* Дэлгүүрийн өөрчлөлтийг `tick` илэрхийлнэ — түүгээр дахин уншина */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => liveSnapshot(), [tick]);
  const rows = useMemo(() => buildRows(snap), [snap]);
  const pkgs = useMemo(() => pkgRows(coverage(holdersOf(rows))), [rows]);
  const names = useMemo(() => new Map(rows.map((r) => [r.key, r.user])), [rows]);
  const nameOf = (k: string): string => names.get(k) ?? k;

  const [edit, setEdit] = useState<Edit | null>(null);
  const editRow = edit ? rows.find((r) => r.key === edit.user) ?? null : null;
  const have: Rights = edit ? (editRow?.rights ?? rightsOf(snap, edit.user)) : normRights({});
  const draft: Person | null = edit ? (edit.draft ?? editRow?.person ?? newPerson(edit.user)) : null;
  const isNew = !!edit && (edit.isNew && !editRow);
  const dirty = !!edit && !!draft && (isNew || (!!edit.draft && !sameRights(wantOf(draft, have, false), have)));
  useEffect(() => { onDirty(dirty && edit ? edit.user : null); }, [dirty, edit, onDirty]);
  useEffect(() => () => onDirty(null), [onDirty]);

  const me = lc(currentUser() ?? '');
  const root = isRootAdmin(me);

  const open = async (user: string, init?: Partial<Edit>): Promise<void> => {
    const k = lc(user);
    if (dirty && edit && edit.user !== k && !(await askLeave())) return;
    setEdit({ user: k, display: init?.display ?? nameOf(k), isNew: false, draft: null, ...init });
  };
  const close = async (): Promise<void> => {
    if (dirty && !(await askLeave())) return;
    setEdit(null);
  };

  const panel = edit && draft ? (() => {
    const u = edit.user;
    const codeAdmin = isCodeSuper(u);
    const adminRow = have.role === 'super' && !isNew;
    const readOnly = codeAdmin
      ? tr('Кодонд бүртгэлтэй админы (super) эрх самбараас тохируулагдахгүй.')
      : adminRow && !root ? tr('Админы эрхийн мөрийг зөвхөн үндсэн админ ({0}) засна.', BOOTSTRAP_SUPER) : null;
    const saveLock = !allAclReady() ? lockMsg()
      : oldDrafts.has(u) ? tr('Энэ хүнд «Хэрэглэгчдийн эрх удирдах» хуудсанд хадгалаагүй ноорог байна — эхлээд тэнд хадгална уу эсвэл болино уу.')
        : aclPendingFor(u) || typeApplyBusy(u) ? tr('Энэ хэрэглэгчид тохируулга явагдаж байна — дуустал хүлээнэ үү.') : null;
    return (
      <ErhNewPerson
        key={u}
        user={u}
        display={edit.display}
        isNew={isNew}
        have={have}
        draft={draft}
        dirty={dirty}
        onDraft={(p) => setEdit({ ...edit, draft: p })}
        onReset={() => setEdit({ ...edit, draft: isNew ? newPerson(u) : null })}
        readOnly={readOnly}
        canSuper={root}
        jobLock={u === me && have.role === 'super' ? tr('Өөрийн super эрх — өөр super админ өөрчилнө') : null}
        removeLock={u === me ? tr('Өөрийн аккаунтыг хасахгүй.') : readOnly}
        saveLock={saveLock}
        rows={rows}
        note={edit.note}
        onClose={() => { void close(); }}
        onSaved={() => setEdit({ ...edit, isNew: false, draft: null, note: undefined })}
        onRemoved={() => setEdit(null)}
      />
    );
  })() : null;

  return (
    <>
      {pane === 'nPeople' && (
        <People
          rows={rows} pkgs={pkgs} snap={snap} onPane={onPane} onOpen={open} lookup={lookup} openUser={edit?.user ?? null}
          onNote={(u, note) => setEdit((e) => (e && e.user === lc(u) ? { ...e, note } : e))}
        />
      )}
      {pane === 'nPkgs' && <Packages rows={rows} pkgs={pkgs} nameOf={nameOf} onOpen={(u) => { void open(u); }} />}
      {pane === 'nJobs' && <Jobs rows={rows} />}
      {panel}
    </>
  );
}

/* ══════════════════════ Хүмүүс ══════════════════════ */

type Tool = null | 'add' | 'replace' | 'copy';

function People({ rows, pkgs, snap, onPane, onOpen, lookup, openUser, onNote }: {
  rows: PersonRow[];
  pkgs: ReturnType<typeof pkgRows>;
  snap: ReturnType<typeof liveSnapshot>;
  onPane: (p: ErhNewPane) => void;
  onOpen: (user: string, init?: Partial<Edit>) => Promise<void>;
  lookup: Lookup;
  openUser: string | null;
  /** Шинэ аккаунтын ArcGIS-ийн лавлагааны анхааруулга — ноорогт хүрэхгүй */
  onNote: (user: string, note: string) => void;
}) {
  const [q, setQ] = useState('');
  const [job, setJobF] = useState('');
  const [pkg, setPkg] = useState('');
  const [diff, setDiff] = useState(false);
  const [problem, setProblem] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [handover, setHandover] = useState<{ from: string; to: string } | null>(null);
  const shownRows = filterRows(rows, { q, job, pkg, diff, problem });
  const sum = covSummary(pkgs);
  const locked = !allAclReady();

  return (
    <div className={s.wrap}>
      <div className={s.summary}>
        <span>{shownRows.length === rows.length
          ? tr('{0} хүн', String(rows.length))
          : tr('{0} / {1} хүн', String(shownRows.length), String(rows.length))}</span>
        {sum.bad + sum.warn > 0 ? (
          <button type="button" className={s.linkBtn} onClick={() => onPane('nPkgs')}>
            {tr('Багцууд: {0} багцад ажил зогсоно · {1} багц дутуу →', String(sum.bad), String(sum.warn))}
          </button>
        ) : <span className={s.muted}>{tr('Багц бүр бүрэн томилогдсон.')}</span>}
      </div>
      {locked && <p className={s.err} role="alert">{lockMsg()}</p>}

      <div className={s.toolbar}>
        <input
          className={s.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr('Нэр, албан үүрэг, багц, эрхээр хайх…')}
          aria-label={tr('Хүн хайх')}
        />
        <select className={s.select} value={job} onChange={(e) => setJobF(e.target.value)} aria-label={tr('Албан үүрэг')}>
          <option value="">{tr('Бүх албан үүрэг')}</option>
          {jobGroups().map((g) => (
            <optgroup key={g.title} label={g.title}>
              {g.defs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </optgroup>
          ))}
          <option value={NO_JOB}>{tr('Албан үүрэггүй')}</option>
        </select>
        <select className={s.select} value={pkg} onChange={(e) => setPkg(e.target.value)} aria-label={tr('Багц')}>
          <option value="">{tr('Бүх багц')}</option>
          {PKG_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <label className={s.check}><input type="checkbox" checked={diff} onChange={(e) => setDiff(e.target.checked)} />{tr('зөрүүтэй')}</label>
        <label className={s.check}><input type="checkbox" checked={problem} onChange={(e) => setProblem(e.target.checked)} />{tr('асуудалтай')}</label>
      </div>
      <div className={s.toolbar}>
        <button type="button" className={`${s.btn} ${s.primary}`} disabled={locked} onClick={() => setTool(tool === 'add' ? null : 'add')}>{tr('Хүн нэмэх')}</button>
        <button type="button" className={s.btn} disabled={locked} onClick={() => setTool(tool === 'replace' ? null : 'replace')}>{tr('Хүн солих')}</button>
        <button type="button" className={s.btn} disabled={locked} onClick={() => setTool(tool === 'copy' ? null : 'copy')}>{tr('Яг энэ хүн шиг')}</button>
      </div>

      {tool === 'add' && (
        <AddTool
          rows={rows}
          onCancel={() => setTool(null)}
          onGo={(name, role) => {
            setTool(null);
            const draft = setJob(newPerson(name), role);
            void onOpen(name, { display: name.trim(), isNew: true, draft });
            void lookup(name.trim()).then((res) => {
              const note = res === 'missing'
                ? tr('⚠️ «{0}» нэртэй ArcGIS хэрэглэгч олдсонгүй (эсвэл харагдахгүй). Нэрээ дахин шалгана уу — буруу бол хадгалахаас өмнө ноорогоос хасна уу.', name.trim())
                : res === 'org' ? tr('⚠️ «{0}» нь манай байгууллагын ArcGIS бүртгэл биш — нэвтрэхэд татгалзагдана. Нэрээ дахин шалгана уу.', name.trim()) : '';
              if (note) onNote(name, note);
            });
          }}
        />
      )}
      {(tool === 'replace' || tool === 'copy') && (
        <CopyTool
          mode={tool}
          rows={rows}
          snap={snap}
          onCancel={() => setTool(null)}
          onGo={(from, to, person, fresh) => {
            setTool(null);
            if (tool === 'replace') setHandover({ from: from.key, to: lc(to) });
            void onOpen(to, { display: to.trim(), isNew: fresh, draft: person });
          }}
        />
      )}
      {handover && (
        <p className={s.warn} role="status">
          {tr('«{0}»-д «{1}»-ийн эрхийг хуулсан. Хадгалсны дараа «{1}»-ийн эрхийг хасна уу.', handover.to, handover.from)}
          {' '}
          <button type="button" className={s.linkBtn} onClick={() => { void onOpen(handover.from); }}>{tr('«{0}»-ийг нээх', handover.from)}</button>
          {' · '}
          <button type="button" className={s.linkBtn} onClick={() => setHandover(null)}>{tr('Нуух')}</button>
        </p>
      )}

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>{tr('Нэр')}</th>
              <th>{tr('Албан үүрэг')}</th>
              <th>{tr('Багц')}</th>
              <th className={s.num}>{tr('Зөрүү')}</th>
              <th className={s.num}>{tr('Асуудал')}</th>
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r) => {
              const errs = r.problems.filter((x) => x.level === 'error').length;
              return (
                <tr
                  key={r.key}
                  className={openUser === r.key ? s.rowOn : undefined}
                  tabIndex={0}
                  onClick={() => { void onOpen(r.key); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void onOpen(r.key); } }}
                >
                  <td className={s.name}>{r.user}</td>
                  <td>{r.jobLabel}</td>
                  <td className={s.muted} title={r.pkgs.length > 2 ? r.pkgs.join(', ') : undefined}>{r.pkgText}</td>
                  <td className={s.num}>
                    {r.diffs > 0 ? <span className={`${s.badge} ${s.bDiff}`} title={tr('Албан үүргээс зөрөх эрх (нэмсэн / хассан)')}>{r.diffs}</span> : <span className={s.muted}>—</span>}
                  </td>
                  <td className={s.num}>
                    {r.problems.length > 0
                      ? <span className={`${s.badge} ${errs ? s.bBad : s.bWarn}`} title={r.problems.map((x) => x.text).join('\n')}>{r.problems.length}</span>
                      : <span className={s.muted}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shownRows.length && <p className={s.note} style={{ padding: 12 }}>{tr('Тохирох хүн алга.')}</p>}
      </div>
    </div>
  );
}

function AddTool({ rows, onCancel, onGo }: {
  rows: PersonRow[]; onCancel: () => void; onGo: (name: string, role: Role) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('taniltsah');
  const err = newNameError(name, rows.map((r) => r.user), removedAccounts());
  return (
    <div className={s.tool}>
      <div className={s.toolHead}>{tr('Хүн нэмэх')}</div>
      <div className={s.row}>
        <input
          className={s.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && !err) onGo(name, role); }}
          placeholder={tr('ArcGIS хэрэглэгчийн нэр')}
          aria-label={tr('Шинэ хэрэглэгчийн нэр')}
        />
        <JobSelect value={role} onChange={setRole} />
        <button type="button" className={`${s.btn} ${s.primary}`} disabled={!name.trim() || !!err} onClick={() => onGo(name, role)}>{tr('Үргэлжлүүлэх')}</button>
        <button type="button" className={s.btn} onClick={onCancel}>{tr('Болих')}</button>
      </div>
      {err && <p className={s.err} role="alert">{err}</p>}
      <p className={s.note}>{tr('Дараагийн алхамд багц сонгож, «Хадгалах» дарахад аккаунт үүснэ.')}</p>
    </div>
  );
}

/** Албан үүргийн сонгогч — админы албан үүрэг ОРОХГҮЙ (самбараас олгоно) */
function JobSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <select className={s.select} value={value} onChange={(e) => onChange(e.target.value as Role)} aria-label={tr('Албан үүрэг')}>
      {jobGroups().map((g) => (
        <optgroup key={g.title} label={g.title}>
          {g.defs.filter((d) => !d.admin).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function CopyTool({ mode, rows, snap, onCancel, onGo }: {
  mode: 'replace' | 'copy';
  rows: PersonRow[];
  snap: ReturnType<typeof liveSnapshot>;
  onCancel: () => void;
  onGo: (from: PersonRow, to: string, person: Person, fresh: boolean) => void;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const src = rows.find((r) => r.key === from) ?? null;
  const target = rows.find((r) => r.key === lc(to)) ?? null;
  const fresh = !!to.trim() && !target;
  const err = fresh ? newNameError(to, rows.map((r) => r.user), removedAccounts()) : src && target && src.key === target.key ? tr('Өөр хүн сонгоно уу.') : null;
  const prev = src && to.trim() && !err ? copyPreview(src.person, to, target ? target.rights : (fresh ? rightsOf(snap, to) : null)) : null;
  const listId = `erh-new-${mode}-to`;
  return (
    <div className={s.tool}>
      <div className={s.toolHead}>{mode === 'replace' ? tr('Хүн солих') : tr('Яг энэ хүн шиг')}</div>
      <p className={s.note}>
        {mode === 'replace'
          ? tr('Хуучин хүний албан үүрэг, багц, онцгой эрхийг шинэ хүнд шилжүүлнэ. Шинэ хүнийг хадгалсны дараа хуучныг хасна.')
          : tr('Сонгосон хүний албан үүрэг, багц, онцгой эрхийг өөр хүнд яг адилхан олгоно.')}
      </p>
      <div className={s.row}>
        <select className={s.select} value={from} onChange={(e) => setFrom(e.target.value)} aria-label={mode === 'replace' ? tr('Хэнийг') : tr('Хэн шиг')}>
          <option value="">{mode === 'replace' ? tr('Хэнийг солих…') : tr('Хэн шиг…')}</option>
          {rows.map((r) => <option key={r.key} value={r.key}>{`${r.user} — ${r.jobLabel}`}</option>)}
        </select>
        <span className={s.muted}>→</span>
        <input
          className={s.input}
          list={listId}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={tr('Хэнд (байгаа эсвэл шинэ нэр)')}
          aria-label={tr('Хэнд')}
        />
        <datalist id={listId}>{rows.map((r) => <option key={r.key} value={r.user} />)}</datalist>
      </div>
      {err && <p className={s.err} role="alert">{err}</p>}
      {prev && (
        <div className={s.confirm}>
          <div className={s.secHead}>{fresh ? tr('Шинэ аккаунт «{0}»', to.trim()) : tr('«{0}»-д өөрчлөгдөх зүйл', target?.user ?? to)}</div>
          {prev.changes.length
            ? prev.changes.map((c, i) => <div key={`${i}:${c.text}`} className={c.op === 'add' ? s.chAdd : s.chDel}>{c.text}</div>)
            : <p className={s.note}>{tr('Өөрчлөлт алга — эрх нь аль хэдийн ижил.')}</p>}
        </div>
      )}
      <div className={s.row}>
        <button type="button" className={`${s.btn} ${s.primary}`} disabled={!prev || !src}
          onClick={() => { if (prev && src) onGo(src, to.trim(), prev.person, fresh); }}>
          {tr('Самбарт нээх')}
        </button>
        <button type="button" className={s.btn} onClick={onCancel}>{tr('Болих')}</button>
      </div>
      <p className={s.note}>{tr('Энд юу ч бичигдэхгүй — самбарт шалгаад «Хадгалах» дарна.')}</p>
    </div>
  );
}

/* ══════════════════════ Багцууд ══════════════════════ */

function Packages({ rows, pkgs, nameOf, onOpen }: {
  rows: PersonRow[];
  pkgs: ReturnType<typeof pkgRows>;
  nameOf: (k: string) => string;
  onOpen: (user: string) => void;
}) {
  const [onlyBad, setOnlyBad] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState('role:huvaari:approver');
  const [wPkg, setWPkg] = useState('');
  const choices = useMemo(() => whoChoices(), []);
  const picked = choices.find((c) => c.id === choice) ?? null;
  const found = picked ? whoCanRows(picked.q, wPkg || null, rows) : [];
  const shown = onlyBad ? pkgs.filter((p) => p.tone || p.issues.length) : pkgs;
  const sum = covSummary(pkgs);
  const groups: { title: string; span: number }[] = [];
  for (const d of SLOT_DEFS) {
    const g = d.group();
    const last = groups[groups.length - 1];
    if (last && last.title === g) last.span += 1; else groups.push({ title: g, span: 1 });
  }
  const flip = (b: string): void => setOpen((prev) => { const n = new Set(prev); if (n.has(b)) n.delete(b); else n.add(b); return n; });

  return (
    <div className={s.wrap}>
      <div className={s.summary}>
        <span>{tr('{0} багц', String(pkgs.length))}</span>
        <span className={`${s.badge} ${s.bBad}`}>{tr('ажил зогсоно: {0}', String(sum.bad))}</span>
        <span className={`${s.badge} ${s.bWarn}`}>{tr('дутуу: {0}', String(sum.warn))}</span>
        <label className={s.check}><input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} />{tr('зөвхөн асуудалтай')}</label>
      </div>

      <div className={s.tool}>
        <div className={s.toolHead}>{tr('Хэн … хийж чадах вэ?')}</div>
        <div className={s.row}>
          <select className={s.select} value={choice} onChange={(e) => setChoice(e.target.value)} aria-label={tr('Юу')}>
            {[...new Set(choices.map((c) => c.group))].map((g) => (
              <optgroup key={g} label={g}>
                {choices.filter((c) => c.group === g).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </optgroup>
            ))}
          </select>
          <select className={s.select} value={wPkg} onChange={(e) => setWPkg(e.target.value)} aria-label={tr('Багц')}>
            <option value="">{tr('Аль ч багц')}</option>
            {PKG_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className={s.row} role="status">
          {found.length
            ? found.map((u) => <button key={u} type="button" className={s.fam} onClick={() => onOpen(u)}>{nameOf(u)}</button>)
            : <span className={s.muted}>{tr('Хэн ч алга.')}</span>}
        </div>
      </div>

      <div className={s.pkgWrap}>
        <table className={s.pkg}>
          <thead>
            <tr>
              <th className={s.stick} rowSpan={2}>{tr('Багц')}</th>
              {groups.map((g) => <th key={g.title} colSpan={g.span}>{g.title}</th>)}
            </tr>
            <tr>
              {SLOT_DEFS.map((d) => <th key={d.id}>{d.label()}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <Fragment key={p.bagts}>
                <tr>
                  <th className={s.stick} scope="row">
                    <button type="button" className={s.pkgName} aria-expanded={open.has(p.bagts)} onClick={() => flip(p.bagts)}>
                      {p.bagts}
                    </button>
                    {p.issues.length > 0 && (
                      <div>
                        <span className={`${s.badge} ${p.tone === 'bad' ? s.bBad : s.bWarn}`}>{tr('{0} асуудал', String(p.issues.length))}</span>
                      </div>
                    )}
                  </th>
                  {p.slots.map((c) => (
                    <td key={c.id} className={`${s.cell} ${c.tone === 'bad' ? s.cBad : c.tone === 'warn' ? s.cWarn : ''}`} title={c.why || undefined}>
                      {c.holders.map((u) => (
                        <button key={u} type="button" className={s.who} onClick={() => onOpen(u)} title={nameOf(u)}>{nameOf(u)}</button>
                      ))}
                      {c.viewers.map((u) => (
                        <button key={`v-${u}`} type="button" className={`${s.who} ${s.whoView}`} onClick={() => onOpen(u)} title={tr('{0} — зөвхөн харна', nameOf(u))}>{nameOf(u)}</button>
                      ))}
                      {!c.holders.length && (
                        c.tone === 'bad' ? <span className={`${s.mark} ${s.mBad}`}>{tr('ажил зогсоно')}</span>
                          : c.tone === 'warn' ? <span className={`${s.mark} ${s.mWarn}`}>{tr('дутуу')}</span>
                            : !c.viewers.length && <span className={s.muted}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
                {open.has(p.bagts) && (
                  <tr className={s.issues}>
                    <td colSpan={SLOT_DEFS.length + 1}>
                      {p.issues.length ? (
                        <ul className={s.list}>
                          {p.issues.map((i) => <li key={i.text} className={i.tone === 'bad' ? s.mBad : s.mWarn}>{i.text}</li>)}
                        </ul>
                      ) : <span className={s.muted}>{tr('Асуудалгүй.')}</span>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.note}>{tr('Улаан — ажил зогсоно (гүйцэтгэгч компанигүй урсгал ч). Шар — дутуу эсвэл зөрчилтэй. Налуу нэр — зөвхөн харна. Нэр дээр дарж тэр хүний самбарыг нээнэ; багцын нэр дээр дарж асуудлыг харна.')}</p>
    </div>
  );
}

/* ══════════════════════ Албан үүрэг ══════════════════════ */

function Jobs({ rows }: { rows: PersonRow[] }) {
  const info = jobInfos(rows);
  const tags = (xs: string[]) => (xs.length ? <div className={s.tags}>{xs.map((x) => <span key={x} className={s.tag}>{x}</span>)}</div> : <span className={s.muted}>—</span>);
  return (
    <div className={s.wrap}>
      <p className={s.note}>{tr('Энэ үе шатанд зөвхөн харна — албан үүргийн тодорхойлолтыг засах нь дараагийн шатанд.')}</p>
      <div className={s.tableWrap}>
        <table className={`${s.table} ${s.jobs}`}>
          <thead>
            <tr>
              <th>{tr('Албан үүрэг')}</th>
              <th>{tr('Урсгалын шат')}</th>
              <th>{tr('Багц')}</th>
              <th>{tr('Багцын үүрэг')}</th>
              <th>{tr('Эрх')}</th>
              <th>{tr('Харагдац')}</th>
              <th className={s.num}>{tr('Хүн')}</th>
            </tr>
          </thead>
          <tbody>
            {info.map((j) => (
              <tr key={j.def.key} style={{ cursor: 'default' }}>
                <td className={s.name}>{j.def.label}</td>
                <td>{j.stage}</td>
                <td>{j.scope}</td>
                <td>{tags(j.roles)}</td>
                <td>{tags(j.caps)}</td>
                <td>{tags(j.views)}</td>
                <td className={s.num}>{j.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
