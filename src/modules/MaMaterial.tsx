'use client';

/**
 * МАТЕРИАЛЫН НӨӨЦ ба АЖЛЫН МАТЕРИАЛ (2026-10-21) — «Материал баталгаажуулалт» (`Ma.tsx`)-ын хоёр таб.
 *
 *   · «Материалын нөөц» — `material_noots` хүснэгтийг материалын НЭРЭЭР нэгтгэж харуулна (`nootsSummary`).
 *     Мөр нь гараар нэмэгдэхгүй — MA + MIR батлагдмагц автоматаар (`syncNoots`, `Ma.tsx`).
 *   · «Ажлын материал» — гүйцэтгэлийн хүснэгтийн `ashiglah_material_ner`-ийг ажил бүрд НЭГ УДАА тохируулна:
 *     нөөцөд байгаа материалаас СОНГОНО (гараар бичихгүй), нэг ажилд олон материал.
 */
import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { askConfirm } from '@/lib/confirm';
import { useAsync } from '@/lib/useAsync';
import { fixCyr, num } from '@/lib/format';
import { useAuth } from '@/components/AuthGate';
import { friendlyError, userError, Loading } from '@/components/ui';
import { subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { setNavDirty } from '@/lib/navGuard';
import { loadNoots, nootsSummary, setMaterialNorm, TOLOV, type SyncResult } from '@/lib/materialNoots';
import { canEditMats, entryName, matsOf, parseEntry, saveWorkMats, setEntryNorm } from '@/lib/materialAjil';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import s from './ma.module.css';

const qty = (v: number | null) => (v == null ? '—' : num(v));
/** Нормын оролт → тоо; хоосон = null, буруу = undefined */
const normIn = (t: string): number | null | undefined => {
  const v = t.trim().replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Материалын үндсэн норм засах нүд — Enter/«Хадгалах»-аар бичнэ, дараа нь зарцуулалт дахин бодогдоно (`onSaved`) */
function NormCell({ name, norm, onSaved }: { name: string; norm: number | null; onSaved: (() => void) | null }) {
  const [v, setV] = useState(norm == null ? '' : String(norm));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const n = normIn(v);
  const changed = n !== undefined && n !== norm;
  if (!onSaved) return <td className={`${s.num} ${norm == null ? s.expired : ''}`}>{norm == null ? tr('норм алга') : num(norm)}</td>;
  const save = async () => {
    if (n === undefined || !changed) return;
    setBusy(true); setErr('');
    try { await setMaterialNorm(name, n); onSaved(); } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };
  return (
    <td className={s.num}>
      <input className={`${s.input} ${s.normIn}`} inputMode="decimal" value={v} disabled={busy} placeholder={tr('норм алга')}
        aria-label={tr('{0} — үндсэн норм', name)} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
      {changed && <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void save(); }}>{tr('Хадгалах')}</button>}
      {n === undefined && <span className={s.expired}> {tr('Тоо оруулна уу')}</span>}
      {err && <div className={s.errNote} role="alert">{err}</div>}
    </td>
  );
}

const statusLabel = (v: string | null): string =>
  v === TOLOV.done ? tr('Дууссан') : v === TOLOV.open ? tr('Дуусаагүй') : v ?? '—';

/** Синкийн төлөв — `Ma.tsx` удирдана. `disabled` — автомат бүртгэл идэвхгүй (`mir_id` алга/тохирохгүй), нөөц зөвхөн харагдана */
export type NootsSync =
  | { state: 'idle' | 'running' } | { state: 'done'; res: SyncResult } | { state: 'error'; error: string } | { state: 'disabled'; reason: string };

function PartialQty({ sum, unknown }: { sum: number | null; unknown: number }) {
  return (
    <td className={s.num} title={unknown ? tr('{0} ачааны тоо хэмжээ мэдэгдэхгүй — нийлбэр дутуу', unknown) : undefined}>
      {qty(sum)}{sum != null && unknown > 0 && <span className={s.expired}> {tr('({0} ачаа тоогүй)', unknown)}</span>}
    </td>
  );
}

export function NootsTab({ tick, sync, onSync }: { tick: number; sync: NootsSync; onSync: (() => void) | null }) {
  const q = useAsync(loadNoots, [tick]);
  const sums = useMemo(() => (q.state === 'ready' ? nootsSummary(q.data) : []), [q]);
  return (
    <div className={s.block}>
      <div className={s.toolRow}>
        {onSync && (
          <button type="button" className={s.ghostBtn} disabled={sync.state === 'running'} onClick={onSync}>
            {sync.state === 'running' ? tr('Түр хүлээнэ үү…') : tr('MA · MIR-ээс шинэчлэх')}
          </button>
        )}
        <span className={s.note}>
          {sync.state === 'running' ? tr('MA · MIR-ээс нөөцийг тулгаж байна…')
            : sync.state === 'done' ? tr('Нөөц шинэчлэгдлээ — нэмсэн {0} · зассан {1} · хассан {2}.', sync.res.added, sync.res.updated, sync.res.removed)
              : sync.state === 'disabled' ? tr('Автомат бүртгэл идэвхгүй — нөөцийг зөвхөн харна.')
                : tr('MA ба MIR батлагдсан материал нөөцөд автоматаар орно; нэг материалыг нэрээр нь нэгтгэнэ.')}
        </span>
      </div>
      {sync.state === 'error' && <p className={s.errNote} role="alert">{tr('Нөөцийн автомат бүртгэл амжилтгүй: {0}', sync.error)}</p>}
      {q.state === 'loading' ? <Loading />
        : q.state === 'error' ? (
          <p className={s.failNote} role="alert">
            {friendlyError(q.error)}
            {q.retry && <button type="button" className={s.retryBtn} onClick={q.retry}>{tr('Дахин оролдох')}</button>}
          </p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>{tr('Материал')}</th><th>{tr('Нэгж')}</th>
                  <th title={tr('Ажлын 1 нэгжид орох материалын хэмжээ — материал сонгоход ажилд автоматаар дагаж орно')}>{tr('Норм')}</th>
                  <th>{tr('Ирсэн')}</th><th>{tr('Ашигласан')}</th>
                  <th>{tr('Үлдэгдэл')}</th><th>{tr('Төлөв')}</th><th>{tr('Ачаа')}</th>
                </tr>
              </thead>
              <tbody>
                {sums.length === 0 ? (
                  <tr className={s.emptyRow}><td colSpan={8}>{tr('Нөөцөд материал алга — MA ба MIR батлагдсаны дараа орно.')}</td></tr>
                ) : sums.map((m) => (
                  <tr key={m.name} className={s.row}>
                    <td>{m.name}</td>
                    <td className={m.unitConflict ? s.expired : ''} title={m.unitConflict ? tr('Нэгж зөрүүтэй эсвэл дутуу — нийлбэр, төлөв тооцоогүй') : undefined}>
                      {m.units.join(', ') || '—'}
                      {m.unitConflict && <div>{tr('Нэгж зөрүүтэй')}</div>}
                    </td>
                    <NormCell key={`${m.name}|${m.norm ?? ''}`} name={m.name} norm={m.norm} onSaved={onSync} />
                    <PartialQty sum={m.inSum} unknown={m.inUnknown} />
                    <PartialQty sum={m.usedSum} unknown={m.usedUnknown} />
                    <td className={s.num} title={m.rest == null && (m.inUnknown || m.usedUnknown) ? tr('Үлдэгдэл тодорхойгүй — тоо хэмжээгүй ачаа байна') : undefined}>{qty(m.rest)}</td>
                    <td><span className={m.status == null ? undefined : m.status === TOLOV.done ? s.expired : s.valid}>{statusLabel(m.status)}</span></td>
                    <td className={s.num}>{m.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

/** Ажлын материал тохируулах — багц сонгоод ажил бүрд нөөцөөс материал сонгоно */
export function AjilMatTab({ tick }: { tick: number }) {
  const { user } = useAuth();
  const [pkgKey, setPkgKey] = useState(PKGS[0]?.key ?? '');
  const pkg = PKGS.find((p) => p.key === pkgKey) ?? PKGS[0];
  const [rev, setRev] = useState(0);
  const sheet = useAsync(async () => {
    const sc = await loadSchema(pkg);
    const { rows } = await loadRows(pkg, sc);
    return { sc, rows: rows.filter((r) => !r.group && r.des != null) };
  }, [pkg, rev]);
  const nq = useAsync(loadNoots, [tick]);
  const sums = useMemo(() => (nq.state === 'ready' ? nootsSummary(nq.data) : []), [nq]);
  const names = useMemo(() => sums.map((m) => m.name), [sums]);
  /** Материалын үндсэн норм (нөөцөөс) — ажилд сонгоход дагаж орно */
  const defNorm = useMemo(() => new Map(sums.map((m) => [m.name, m.norm] as const)), [sums]);
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeHuvaariAcl(() => setAclN((x) => x + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `aclN` нь хуваарилалт өөрчлөгдсөн дохио
  const canEdit = useMemo(() => canEditMats(user?.username, pkg.group), [user, pkg.group, aclN]);

  /** Ноорог: `des` → нэрс (зөвхөн өөрчилсөн ажлууд) */
  const [draft, setDraft] = useState<Map<number, string[]>>(new Map());
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  /** 2026-10-30: шүүлт — '' бүгд · '__none' материалгүй · '__some' материалтай · бусад нь материалын нэр */
  const [matF, setMatF] = useState('');
  /** 2026-10-30: олон ажилд нэг дор оноох — сонгосон ажлууд (`des`) ба оноох материал */
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [bulkMat, setBulkMat] = useState('');
  const [bulkNorm, setBulkNorm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const dirty = draft.size > 0;
  useEffect(() => {
    setNavDirty('maMaterial', dirty, tr('Ажлын материал'));
    return () => setNavDirty('maMaterial', false);
  }, [dirty]);

  const switchPkg = async (k: string) => {
    if (dirty && !(await askConfirm(tr('Хадгалаагүй өөрчлөлт байна. Хаяад өөр багц руу шилжих үү?'), { danger: true, ok: tr('Хаяад шилжих') }))) return;
    setDraft(new Map()); setOpen(null); setMsg(null); setSel(new Set()); setPkgKey(k);
  };

  const rows = sheet.state === 'ready' ? sheet.data.rows : [];
  const cur = (des: number, base: string[]) => draft.get(des) ?? base;
  /** Нэг ажлын шинэ жагсаалтыг ноорогт тавина — анхны утга руу буцвал ноорогоос хасна (зөвхөн БОДИТ өөрчлөлт бичигдэнэ) */
  const putDraft = (n: Map<number, string[]>, des: number, base: string[], next: string[]) => {
    const same = next.length === base.length && next.every((x) => base.includes(x));
    if (same) n.delete(des); else n.set(des, next);
  };
  /** Материалыг сонгох/хасах — нэрээр (тусгай норм нь хасахад хамт арилна) */
  const toggle = (des: number, base: string[], name: string) => {
    const now = cur(des, base);
    const has = now.some((x) => entryName(x) === name);
    const next = has ? now.filter((x) => entryName(x) !== name) : [...now, name];
    setDraft((m) => { const n = new Map(m); putDraft(n, des, base, next); return n; });
  };
  /** Энэ ажилд тусгай норм тавих/арилгах (`null` = үндсэн норм) */
  const setNorm = (des: number, base: string[], name: string, norm: number | null) => {
    const next = setEntryNorm(cur(des, base), name, norm);
    setDraft((m) => { const n = new Map(m); putDraft(n, des, base, next); return n; });
  };
  /** Сонгосон бүх ажилд нэг материалыг нэмэх / хасах (ноорогт — «Хадгалах» хүртэл бичигдэхгүй) */
  const bulk = (mode: 'add' | 'remove' | 'norm') => {
    if (!bulkMat || !sel.size) return;
    if (mode === 'norm' && normIn(bulkNorm) === undefined) return;
    setDraft((m) => {
      const n = new Map(m);
      for (const r of rows) {
        const des = r.des as number;
        if (!sel.has(des)) continue;
        const base = matsOf(r);
        const now = n.get(des) ?? base;
        const has = now.some((x) => entryName(x) === bulkMat);
        let next: string[];
        if (mode === 'add') next = has ? now : [...now, bulkMat];
        else if (mode === 'remove') next = now.filter((x) => entryName(x) !== bulkMat);
        else next = has ? setEntryNorm(now, bulkMat, normIn(bulkNorm) ?? null) : now;
        putDraft(n, des, base, next);
      }
      return n;
    });
  };

  const save = async () => {
    if (sheet.state !== 'ready' || !draft.size) return;
    setBusy(true); setMsg(null);
    try {
      const byDes = new Map(sheet.data.rows.filter((x) => x.des != null).map((x) => [x.des as number, x]));
      const base = new Map<number, string[]>();
      for (const des of draft.keys()) { const r0 = byDes.get(des); if (r0) base.set(des, matsOf(r0)); }
      const r = await saveWorkMats(pkg, sheet.data.sc, draft, base);
      setDraft(new Map()); setOpen(null); setSel(new Set());
      const mergedNote = r.merged.length
        ? ' ' + tr('{0} ажлын материалыг энэ хооронд өөр хүн өөрчилсөн байсан — таны өөрчлөлттэй нийлүүлэв (код: {1}).', r.merged.length, r.merged.join(', '))
        : '';
      setMsg(r.lost.length
        ? { kind: 'err', text: tr('{0} ажил хадгалагдлаа; {1} ажил шинэ хуудсанд олдсонгүй (код: {2}) — дахин тохируулна уу.', r.written, r.lost.length, r.lost.join(', ')) + mergedNote }
        : { kind: 'ok', text: tr('{0} ажлын материал хадгалагдлаа.', r.written) + mergedNote });
      setRev((x) => x + 1);
    } catch (e) {
      setMsg({ kind: 'err', text: userError(e) });
    } finally {
      setBusy(false);
    }
  };

  const f = fixCyr(filter.trim().toLowerCase());
  /* Шүүлт ноорог дээрх (хадгалаагүй) жагсаалтаар — сонгосон ажил шүүлтээс шууд гарч алга болохгүй тулд хайлттай нэг дүрэм */
  const matOk = (r: (typeof rows)[number]) => {
    if (!matF) return true;
    const ms = cur(r.des as number, matsOf(r));
    return matF === '__none' ? ms.length === 0 : matF === '__some' ? ms.length > 0 : ms.some((x) => entryName(x) === matF);
  };
  const shown = rows.filter((r) => matOk(r) && (!f || fixCyr(`${r.no} ${r.work} ${cur(r.des as number, matsOf(r)).join(' ')}`).toLowerCase().includes(f)));
  const doneN = rows.filter((r) => cur(r.des as number, matsOf(r)).length > 0).length;
  const shownSel = shown.filter((r) => sel.has(r.des as number)).length;
  const allSel = shown.length > 0 && shownSel === shown.length;
  const toggleAll = () => setSel((p) => {
    const n = new Set(p);
    for (const r of shown) { if (allSel) n.delete(r.des as number); else n.add(r.des as number); }
    return n;
  });
  const usedNames = [...new Set(rows.flatMap((r) => cur(r.des as number, matsOf(r)).map(entryName)))].sort((a, b) => a.localeCompare(b, 'mn'));

  return (
    <div className={s.block}>
      <div className={s.filters}>
        <select className={s.select} value={pkg.key} onChange={(e) => { void switchPkg(e.target.value); }} aria-label={tr('Багц')} disabled={busy}>
          {PKGS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <input className={s.search} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tr('Ажил, материалаар хайх')} />
        <select className={s.select} value={matF} onChange={(e) => setMatF(e.target.value)} aria-label={tr('Материалаар шүүх')}>
          <option value="">{tr('Бүх ажил')}</option>
          <option value="__none">{tr('Материалгүй ажлууд')}</option>
          <option value="__some">{tr('Материалтай ажлууд')}</option>
          {usedNames.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {sheet.state === 'ready' && (
          <span className={s.note}>{tr('{0}/{1} ажилд материал тохируулсан', doneN, rows.length)}</span>
        )}
        {canEdit && (
          <button type="button" className={s.ghostBtn} disabled={busy || !dirty} onClick={() => { void save(); }}>
            {busy ? tr('Түр хүлээнэ үү…') : dirty ? tr('Хадгалах ({0})', draft.size) : tr('Хадгалах')}
          </button>
        )}
        {canEdit && dirty && (
          <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { setDraft(new Map()); setOpen(null); }}>{tr('Болих')}</button>
        )}
      </div>
      {!canEdit && <p className={s.note}>{tr('Зөвхөн харна — материал тохируулахад тухайн багцын Хуваарийн зохиогчийн эрх шаардлагатай.')}</p>}
      {canEdit && nq.state === 'ready' && names.length === 0 && (
        <p className={s.note}>{tr('Нөөцөд материал алга — MA ба MIR батлагдсан материал л сонгогдоно.')}</p>
      )}
      {nq.state === 'error' && <p className={s.errNote} role="alert">{tr('Материалын нөөц ачаалагдсангүй: {0}', friendlyError(nq.error))}</p>}
      {msg && <p className={msg.kind === 'err' ? s.errNote : s.note} role={msg.kind === 'err' ? 'alert' : undefined}>{msg.text}</p>}
      {canEdit && sel.size > 0 && (
        <div className={s.filters} role="group" aria-label={tr('Олон ажилд оноох')}>
          <span className={s.note}>{tr('Сонгосон {0} ажилд:', sel.size)}</span>
          <select className={s.select} value={bulkMat} onChange={(e) => setBulkMat(e.target.value)} aria-label={tr('Материал')} disabled={busy}>
            <option value="">{tr('— материал сонгох —')}</option>
            {[...new Set([...names, ...usedNames])].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button type="button" className={s.ghostBtn} disabled={busy || !bulkMat} onClick={() => bulk('add')}>{tr('Нэмэх')}</button>
          <button type="button" className={s.ghostBtn} disabled={busy || !bulkMat} onClick={() => bulk('remove')}>{tr('Хасах')}</button>
          <input className={`${s.input} ${s.normIn}`} inputMode="decimal" value={bulkNorm} onChange={(e) => setBulkNorm(e.target.value)}
            placeholder={tr('тусгай норм')} aria-label={tr('Тусгай норм')} disabled={busy || !bulkMat} />
          <button type="button" className={s.ghostBtn} disabled={busy || !bulkMat || normIn(bulkNorm) === undefined}
            title={tr('Сонгосон ажлуудад энэ материалын тусгай норм тавина; хоосон бол үндсэн норм руу буцаана')}
            onClick={() => bulk('norm')}>{tr('Норм тавих')}</button>
          <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => setSel(new Set())}>{tr('Сонголт цуцлах')}</button>
        </div>
      )}

      {sheet.state === 'loading' ? <Loading />
        : sheet.state === 'error' ? (
          <p className={s.failNote} role="alert">
            {friendlyError(sheet.error)}
            {sheet.retry && <button type="button" className={s.retryBtn} onClick={sheet.retry}>{tr('Дахин оролдох')}</button>}
          </p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  {canEdit && (
                    <th>
                      <input type="checkbox" checked={allSel} disabled={busy || shown.length === 0} onChange={toggleAll}
                        aria-label={tr('Харагдаж буй бүх ажлыг сонгох')} />
                    </th>
                  )}
                  <th>{tr('№')}</th><th>{tr('Ажил')}</th><th>{tr('Ашиглах материал')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr className={s.emptyRow}><td colSpan={canEdit ? 4 : 3}>{tr('Ажил олдсонгүй')}</td></tr>
                ) : shown.map((r) => {
                  const des = r.des as number;
                  const base = matsOf(r);
                  const mine = cur(des, base);
                  const changed = draft.has(des);
                  /* Сонгогдсон ч нөөцөөс хасагдсан материал — жагсаалтад үлдээж хасах боломжтой */
                  const opts = [...names, ...mine.map(entryName).filter((x) => !names.includes(x))];
                  return (
                    <tr key={des} className={`${s.row} ${changed ? s.rowOn : ''}`}>
                      {canEdit && (
                        <td>
                          <input type="checkbox" checked={sel.has(des)} disabled={busy} aria-label={tr('Сонгох')}
                            onChange={() => setSel((p) => { const n = new Set(p); if (n.has(des)) n.delete(des); else n.add(des); return n; })} />
                        </td>
                      )}
                      <td className={s.num}>{r.no}</td>
                      <td>{fixCyr(r.work)}</td>
                      <td>
                        <div className={s.chips}>
                          {mine.length ? mine.map((m) => {
                            const e = parseEntry(m);
                            const inStock = names.includes(e.name);
                            const norm = e.norm ?? defNorm.get(e.name) ?? null;
                            return (
                              <span key={e.name} className={`${s.chip} ${inStock && norm != null ? '' : s.expired}`}
                                title={!inStock ? tr('Нөөцөд алга') : norm == null ? tr('Норм тавиагүй — зарцуулалт бодогдохгүй')
                                  : e.norm != null ? tr('Энэ ажлын тусгай норм') : tr('Материалын үндсэн норм')}>
                                {e.name} {norm == null ? tr('· норм алга') : e.norm != null ? <b>×{num(norm)}</b> : `×${num(norm)}`}
                              </span>
                            );
                          }) : <span className={s.note}>—</span>}
                          {canEdit && (
                            <button type="button" className={s.ghostBtn} disabled={busy} aria-expanded={open === des}
                              onClick={() => setOpen(open === des ? null : des)}>
                              {open === des ? tr('Хаах') : tr('Сонгох')}
                            </button>
                          )}
                        </div>
                        {canEdit && open === des && (
                          <div className={s.matPick} role="group" aria-label={tr('Ашиглах материал')}>
                            {opts.length === 0 ? <span className={s.note}>{tr('Нөөцөд материал алга')}</span> : opts.map((name) => {
                              const ent = mine.map(parseEntry).find((x) => x.name === name);
                              const dn = defNorm.get(name) ?? null;
                              return (
                                <span key={name} className={s.matOpt}>
                                  <label className={s.matOpt}>
                                    <input type="checkbox" checked={!!ent} disabled={busy} onChange={() => toggle(des, base, name)} />
                                    <span>{name}</span>
                                  </label>
                                  {ent && (
                                    <input className={`${s.input} ${s.normIn}`} inputMode="decimal" disabled={busy}
                                      key={`${name}|${ent.norm ?? ''}`}
                                      defaultValue={ent.norm == null ? '' : String(ent.norm)}
                                      placeholder={dn == null ? tr('норм алга') : tr('үндсэн {0}', num(dn))}
                                      aria-label={tr('{0} — энэ ажлын тусгай норм', name)}
                                      title={tr('Хоосон бол материалын үндсэн норм хэрэглэгдэнэ')}
                                      onBlur={(ev) => { const v = normIn(ev.target.value); if (v !== undefined && v !== ent.norm) setNorm(des, base, name, v); }} />
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
