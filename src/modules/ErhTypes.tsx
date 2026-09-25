'use client';

/**
 * «ЭРХИЙН ТӨРӨЛ» ХУУДАС — 10 төрөл × системийн бүх тохиргоо (2026-09-25).
 *
 * Төрөл бүрд юу ХАРАХ, юу ЗАСАХ-ыг чеклээд «Хадгалах» — загвар `__type__:`
 * мөрөнд бичигдэнэ. Хадгалсны дараа «Хэрэгжүүлэх» нь тэр төрлийн бүх
 * хэрэглэгчид загварыг дахин тараана (`roleTypeApply.applyType`).
 *
 * ⚠️ ЗАГВАР ≠ ЭРХ: чеклэх нь хэн нэгний эрхийг шууд өөрчлөхгүй (харагдац ба
 *    нүүр цонхоос бусад нь — тэдгээрийг `roleAccess` шууд уншдаг тул «Сэргээх»
 *    ба урсгалын томилгоо шинэ загвараар явна). Хуваарилалт нь зөвхөн
 *    «Хэрэгжүүлэх»-ээр — админ хэзээ тарахаа өөрөө шийднэ.
 * ⚠️ «Хэрэгжүүлэх» нь хадгалаагүй өөрчлөлттэй баганад хаалттай — хуучин
 *    загварыг тарааж, админы харж буйгаас өөр зүйл бичихгүйн тулд.
 * ⚠️ 2026-09-25: бөөнөөр хэрэгжүүлэлтийн төлөв МОДУЛЬД (`roleTypeApply.applyTypeBulk`)
 *    — таб солиход (unmount) давталт тасрахгүй, буцаж ороход явц нь харагдаж,
 *    хоёр дахь давталт эхлэхгүй.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { VIEWS, type Role, type ViewKey } from '@/lib/services';
import { listUsers, remoteReady, roleOf, subscribe } from '@/lib/permissions';
import { allAclReady, lockMsg } from '@/lib/aclOps';
import {
  TYPE_ORDER, isStoredTpl, saveTpl, settingGroups, subscribeTypes, tplOf, typeLabel, typesReady,
  type TypeTpl,
} from '@/lib/roleTypes';
import { applyTypeBulk, bulkStatus, subscribeBulk } from '@/lib/roleTypeApply';
import ua from '@/components/userAdmin.module.css';
import s from './erhTypes.module.css';

type Drafts = Partial<Record<Role, TypeTpl>>;

const eq = (a: TypeTpl, b: TypeTpl): boolean =>
  a.home === b.home && a.scope === b.scope && a.on.length === b.on.length && a.on.every((x) => b.on.includes(x));

export function ErhTypes() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    const a = subscribeTypes(f);
    const b = subscribe(f);
    const c = subscribeBulk(f);
    return () => { a(); b(); c(); };
  }, []);

  const [drafts, setDrafts] = useState<Drafts>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const bulk = bulkStatus();
  const busy = saving || !!bulk?.running;

  const groups = settingGroups();
  const allIds = groups.flatMap((g) => g.rows.map((r) => r.id));

  const cur = (r: Role): TypeTpl => drafts[r] ?? tplOf(r);
  const isDirty = (r: Role): boolean => !!drafts[r] && !eq(drafts[r] as TypeTpl, tplOf(r));
  const dirtyRoles = TYPE_ORDER.filter(isDirty);

  const put = (r: Role, t: TypeTpl) => { setMsg(''); setDrafts((d) => ({ ...d, [r]: t })); };
  const flip = (r: Role, id: string, v: boolean) => {
    const t = cur(r);
    put(r, { ...t, on: v ? [...new Set([...t.on, id])] : t.on.filter((x) => x !== id) });
  };
  const allowed = (r: Role, id: string): boolean => id !== 'admin' || r === 'super';

  const usersOf = (r: Role): string[] => listUsers()
    .filter((u) => roleOf(u.username) === r)
    .map((u) => u.username.toLowerCase());

  const canSave = remoteReady() && !busy;

  const save = async () => {
    if (!canSave || !dirtyRoles.length) return;
    setSaving(true); setErr(''); setMsg('');
    /* ⚠️ 2026-09-25: try/finally — бичилт шидвэл товч үүрд хаалттай үлдэхгүй */
    try {
      const failed: Role[] = [];
      for (const r of dirtyRoles) {
        if (!(await saveTpl(r, cur(r)))) failed.push(r);
      }
      setDrafts((d) => {
        const n = { ...d };
        for (const r of dirtyRoles) if (!failed.includes(r)) delete n[r];
        return n;
      });
      if (failed.length) setErr(tr('ArcGIS-т хадгалагдсангүй: {0}', failed.map(typeLabel).join(', ')));
      else setMsg(tr('Хадгалагдлаа. Хэрэглэгчдэд тараахын тулд баганын «Хэрэгжүүлэх»-ийг дарна уу.'));
    } finally {
      setSaving(false);
    }
  };

  const applyAll = async (r: Role) => {
    if (busy) return;
    if (!allAclReady()) { setErr(lockMsg()); return; }
    if (!typesReady()) { setErr(tr('Эрхийн төрлийн загвар уншигдаагүй — дахин ачаална уу.')); return; }
    const users = usersOf(r);
    if (!users.length) return;
    if (!window.confirm(tr('«{0}» төрлийн {1} хэрэглэгчид загварыг хэрэгжүүлэх үү? Загварт чеклээгүй хуваарилалт, эрх нь хасагдана.', typeLabel(r), String(users.length)))) return;
    setErr(''); setMsg('');
    if (!(await applyTypeBulk(r, users))) setErr(tr('Өөр хэрэгжүүлэлт явагдаж байна — дуустал хүлээнэ үү.'));
  };

  /* Бөөнөөр хэрэгжүүлэлтийн явц/үр дүн — модулийн төлөвөөс */
  const bulkDone = bulk ? bulk.ok + bulk.errors.length + bulk.skipped.length : 0;
  const bulkMsg = !bulk ? '' : bulk.running
    ? tr('«{0}»: хэрэгжүүлж байна… {1}/{2}', typeLabel(bulk.role), String(bulkDone), String(bulk.total))
    : tr('«{0}»: {1}/{2} хэрэглэгчид хэрэгжлээ.', typeLabel(bulk.role), String(bulk.ok), String(bulk.total));
  const bulkErr = !bulk ? '' : [
    ...(bulk.skipped.length ? [tr('Хадгалаагүй ноорогтой тул алгассан: {0}', bulk.skipped.join(', '))] : []),
    ...bulk.errors,
  ].join('\n');

  if (!typesReady()) {
    return <div className={ua.capNote}>{tr('Эрхийн хүснэгт уншигдаж байна… Уншигдсаны дараа төрлийн загвар засах боломжтой.')}</div>;
  }

  return (
    <>
      <div className={s.wrap}>
        <table className={s.tbl}>
          <thead>
            <tr>
              <th className={s.corner}>{tr('Тохиргоо')}</th>
              {TYPE_ORDER.map((r, i) => {
                const n = usersOf(r).length;
                return (
                  <th key={r} className={`${s.head} ${isDirty(r) ? s.dirty : ''}`}>
                    <span className={s.headNo}>
                      {r === 'super' ? tr('админ') : String(i + 1)}
                      {isStoredTpl(r) ? '' : ` · ${tr('анхдагч')}`}
                    </span>
                    {typeLabel(r)}
                    <div className={s.headBtns}>
                      <button type="button" className={s.mini} disabled={busy}
                        aria-label={`${tr('бүгд')} — ${typeLabel(r)}`}
                        onClick={() => put(r, { ...cur(r), on: allIds.filter((id) => allowed(r, id)) })}>
                        {tr('бүгд')}
                      </button>
                      <button type="button" className={s.mini} disabled={busy}
                        aria-label={`${tr('арилгах')} — ${typeLabel(r)}`}
                        onClick={() => put(r, { ...cur(r), on: [] })}>
                        {tr('арилгах')}
                      </button>
                    </div>
                    <div className={s.headBtns}>
                      <button
                        type="button"
                        className={s.mini}
                        disabled={busy || !n || isDirty(r)}
                        aria-label={`${tr('Хэрэгжүүлэх ({0})', String(n))} — ${typeLabel(r)}`}
                        title={isDirty(r) ? tr('Эхлээд хадгална уу') : tr('Энэ төрлийн бүх хэрэглэгчид загварыг дахин хэрэгжүүлнэ')}
                        onClick={() => { void applyAll(r); }}
                      >
                        {tr('Хэрэгжүүлэх ({0})', String(n))}
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr className={s.sec}><td className={s.secLbl} colSpan={TYPE_ORDER.length + 1}>{tr('Нүүр цонх ба хамрах хүрээ')}</td></tr>
            <tr>
              <td className={s.lbl}><span className={s.lblText}>{tr('Нэвтрэхэд нээгдэх цонх')}</span></td>
              {TYPE_ORDER.map((r) => (
                <td key={r}>
                  <select id={`tt-home-${r}`} className={s.sel} value={cur(r).home} disabled={busy}
                    aria-label={`${tr('Нэвтрэхэд нээгдэх цонх')} — ${typeLabel(r)}`}
                    onChange={(e) => put(r, { ...cur(r), home: e.target.value as ViewKey })}>
                    {VIEWS.map((v) => <option key={v.key} value={v.key}>{v.title}</option>)}
                  </select>
                </td>
              ))}
            </tr>
            <tr>
              <td className={s.lbl}>
                <span className={s.lblText}>{tr('Багцын хамрах хүрээ')}</span>
                <span className={s.lblHint}>{tr('Өөрийн багц = хэрэглэгчийн картад сонгосон багцууд')}</span>
              </td>
              {TYPE_ORDER.map((r) => (
                <td key={r}>
                  <select id={`tt-scope-${r}`} className={s.sel} value={cur(r).scope} disabled={busy || r === 'super'}
                    aria-label={`${tr('Багцын хамрах хүрээ')} — ${typeLabel(r)}`}
                    onChange={(e) => put(r, { ...cur(r), scope: e.target.value === 'all' ? 'all' : 'own' })}>
                    <option value="own">{tr('Өөрийн багц')}</option>
                    <option value="all">{tr('Бүх багц')}</option>
                  </select>
                </td>
              ))}
            </tr>
            {groups.map((g) => (
              <Group key={g.title} title={g.title} rows={g.rows} cur={cur} flip={flip} allowed={allowed} busy={busy} />
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.bar}>
        <button type="button" className={ua.saveBtn} disabled={!canSave || !dirtyRoles.length} onClick={() => { void save(); }}>
          {dirtyRoles.length ? tr('Хадгалах ({0} төрөл)', String(dirtyRoles.length)) : tr('Хадгалах')}
        </button>
        {dirtyRoles.length > 0 && (
          <button type="button" className={ua.cancelBtn} disabled={busy} onClick={() => setDrafts({})}>
            {tr('Цуцлах')}
          </button>
        )}
        {!remoteReady() && <span className={s.err}>{lockMsg()}</span>}
        {msg && <span className={s.ok}>{msg}</span>}
        {bulkMsg && <span className={s.ok} role="status">{bulkMsg}</span>}
      </div>
      {err && <div className={s.err} role="alert">{err}</div>}
      {bulkErr && <div className={s.err} role="alert">{bulkErr}</div>}
    </>
  );
}

function Group({
  title, rows, cur, flip, allowed, busy,
}: {
  title: string;
  rows: { id: string; label: string; hint?: string }[];
  cur: (r: Role) => TypeTpl;
  flip: (r: Role, id: string, v: boolean) => void;
  allowed: (r: Role, id: string) => boolean;
  busy: boolean;
}) {
  return (
    <>
      <tr className={s.sec}><td className={s.secLbl} colSpan={TYPE_ORDER.length + 1}>{title}</td></tr>
      {rows.map((row) => (
        <tr key={row.id}>
          <td className={s.lbl}>
            <span className={s.lblText}>{row.label}</span>
            {row.hint && <span className={s.lblHint}>{row.hint}</span>}
          </td>
          {TYPE_ORDER.map((r) => (
            <td key={r}>
              <input
                id={`tt-${r}-${row.id.replace(/[^a-zA-Z0-9]/g, '_')}`}
                type="checkbox"
                className={s.cb}
                checked={cur(r).on.includes(row.id)}
                disabled={busy || !allowed(r, row.id)}
                aria-label={`${row.label} — ${typeLabel(r)}`}
                onChange={(e) => flip(r, row.id, e.target.checked)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
