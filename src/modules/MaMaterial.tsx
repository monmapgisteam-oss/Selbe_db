'use client';

/**
 * МАТЕРИАЛЫН НӨӨЦ ба АЖЛЫН МАТЕРИАЛ (2026-10-21) — «Материал баталгаажуулалт» (`Ma.tsx`)-ын хоёр таб.
 *
 *   · «Материалын нөөц» — `material_noots` хүснэгтийг материалын НЭРЭЭР нэгтгэж харуулна (`nootsSummary`).
 *     Мөр нь гараар нэмэгдэхгүй — MA + MIR батлагдмагц автоматаар (`syncNoots`, `Ma.tsx`).
 *   · «Ажлын материал» — гүйцэтгэлийн хүснэгтийн `ashiglah_material_ner`-ийг ажил бүрд НЭГ УДАА тохируулна:
 *     нөөцөд байгаа материалаас СОНГОНО (гараар бичихгүй), нэг ажилд олон материал.
 * ⚠️ Хадгалалт зөвхөн ӨӨРЧЛӨГДСӨН ажлыг бичнэ (`materialAjil.saveWorkMats` — хуваарийн хамгаалалттай ижил).
 */
import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAsync } from '@/lib/useAsync';
import { num } from '@/lib/format';
import { useAuth } from '@/components/AuthGate';
import { friendlyError, userError } from '@/components/ui';
import { subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { setNavDirty } from '@/lib/navGuard';
import { loadNoots, nootsSummary, TOLOV, type SyncResult } from '@/lib/materialNoots';
import { canEditMats, matsOf, saveWorkMats } from '@/lib/materialAjil';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import s from './ma.module.css';

const qty = (v: number | null) => (v == null ? '—' : num(v));

/* ⚠️ 2026-10-22 (аудит): ТӨЛӨВИЙН ДЭЛГЭЦИЙН НЭР — утга нь ӨГӨГДӨЛ (`tolov` баганад монголоор, `materialNoots.TOLOV`), зөвхөн
   ДЭЛГЭЦЭД орчуулна; урьд нь `{m.status}` түүхийгээр англи горимд «Дууссан»/«Дуусаагүй» хэвээр үлддэг байв. Хоёр л утгатай
   тул ЛИТЕРАЛ `tr()` (динамик `tr(m.status)` биш — i18n-extract түлхүүрийг шалгана); танихгүй утга хэвээр. Өнгөний
   харьцуулалт (`TOLOV.done`) түүхий утгаараа. */
const statusLabel = (v: string): string =>
  v === TOLOV.done ? tr('Дууссан') : v === TOLOV.open ? tr('Дуусаагүй') : v;

/** Синкийн төлөв — `Ma.tsx` удирдана. `disabled` — автомат бүртгэл идэвхгүй (`mir_id` алга/тохирохгүй), нөөц зөвхөн харагдана */
export type NootsSync =
  | { state: 'idle' | 'running' } | { state: 'done'; res: SyncResult } | { state: 'error'; error: string } | { state: 'disabled'; reason: string };

/* ⚠️ 2026-10-21 (аудит №2): ХЭСЭГЧИЛСЭН НИЙЛБЭР ИЛ — тоо хэмжээгүй (null) ачаа байвал нийлбэрийн хажууд тэмдэглэнэ (null ≠ 0) */
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
      {q.state === 'loading' ? <p className={s.note}>{tr('Ачаалж байна…')}</p>
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
                  <th>{tr('Материал')}</th><th>{tr('Нэгж')}</th><th>{tr('Ирсэн')}</th><th>{tr('Ашигласан')}</th>
                  <th>{tr('Үлдэгдэл')}</th><th>{tr('Төлөв')}</th><th>{tr('Ачаа')}</th>
                </tr>
              </thead>
              <tbody>
                {sums.length === 0 ? (
                  <tr className={s.emptyRow}><td colSpan={7}>{tr('Нөөцөд материал алга — MA ба MIR батлагдсаны дараа орно.')}</td></tr>
                ) : sums.map((m) => (
                  <tr key={m.name} className={s.row}>
                    <td>{m.name}</td>
                    {/* ⚠️ Нэг материал өөр нэгжээр ирвэл нийлбэр утгагүй — нэгжүүдийг ил харуулж анхааруулна */}
                    <td className={m.units.length > 1 ? s.expired : ''} title={m.units.length > 1 ? tr('Өөр өөр нэгжээр ирсэн — нийлбэр буруу байж болно') : undefined}>
                      {m.units.join(', ') || '—'}
                    </td>
                    <PartialQty sum={m.inSum} unknown={m.inUnknown} />
                    <PartialQty sum={m.usedSum} unknown={m.usedUnknown} />
                    <td className={s.num} title={m.rest == null && (m.inUnknown || m.usedUnknown) ? tr('Үлдэгдэл тодорхойгүй — тоо хэмжээгүй ачаа байна') : undefined}>{qty(m.rest)}</td>
                    <td><span className={m.status === TOLOV.done ? s.expired : s.valid}>{statusLabel(m.status)}</span></td>
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
  const names = useMemo(() => (nq.state === 'ready' ? nootsSummary(nq.data).map((m) => m.name) : []), [nq]);
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeHuvaariAcl(() => setAclN((x) => x + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `aclN` нь хуваарилалт өөрчлөгдсөн дохио
  const canEdit = useMemo(() => canEditMats(user?.username, pkg.group), [user, pkg.group, aclN]);

  /** Ноорог: `des` → нэрс (зөвхөн өөрчилсөн ажлууд) */
  const [draft, setDraft] = useState<Map<number, string[]>>(new Map());
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const dirty = draft.size > 0;
  useEffect(() => {
    setNavDirty('maMaterial', dirty, tr('Ажлын материал'));
    return () => setNavDirty('maMaterial', false);
  }, [dirty]);

  const switchPkg = (k: string) => {
    if (dirty && !window.confirm(tr('Хадгалаагүй өөрчлөлт байна. Хаяад өөр багц руу шилжих үү?'))) return;
    setDraft(new Map()); setOpen(null); setMsg(null); setPkgKey(k);
  };

  const rows = sheet.state === 'ready' ? sheet.data.rows : [];
  const cur = (des: number, base: string[]) => draft.get(des) ?? base;
  const toggle = (des: number, base: string[], name: string) => {
    const now = cur(des, base);
    const next = now.includes(name) ? now.filter((x) => x !== name) : [...now, name];
    setDraft((m) => {
      const n = new Map(m);
      /* Анхны утга руу буцвал ноорогоос хасна — зөвхөн БОДИТ өөрчлөлт бичигдэнэ */
      const same = next.length === base.length && next.every((x) => base.includes(x));
      if (same) n.delete(des); else n.set(des, next);
      return n;
    });
  };

  const save = async () => {
    if (sheet.state !== 'ready' || !draft.size) return;
    setBusy(true); setMsg(null);
    try {
      /* ⚠️ 2026-10-22 (аудит №8): ХУУДАС АЧААЛСАН ҮЕИЙН утга (`base`) — энэ хооронд өөр хүн хадгалсан бол lib нийлүүлнэ
         (`materialAjil.saveWorkMats`-ийн ⚠️); урьд нь бүх жагсаалт дарагдаж бусдын нэрс чимээгүй устдаг байв. */
      const byDes = new Map(sheet.data.rows.filter((x) => x.des != null).map((x) => [x.des as number, x]));
      const base = new Map<number, string[]>();
      for (const des of draft.keys()) { const r0 = byDes.get(des); if (r0) base.set(des, matsOf(r0)); }
      const r = await saveWorkMats(pkg, sheet.data.sc, draft, base);
      setDraft(new Map()); setOpen(null);
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

  const f = filter.trim().toLowerCase();
  const shown = f ? rows.filter((r) => `${r.no} ${r.work} ${matsOf(r).join(' ')}`.toLowerCase().includes(f)) : rows;

  return (
    <div className={s.block}>
      <div className={s.filters}>
        <select className={s.select} value={pkg.key} onChange={(e) => switchPkg(e.target.value)} aria-label={tr('Багц')} disabled={busy}>
          {PKGS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <input className={s.search} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tr('Ажил, материалаар хайх')} />
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

      {sheet.state === 'loading' ? <p className={s.note}>{tr('Ачаалж байна…')}</p>
        : sheet.state === 'error' ? (
          <p className={s.failNote} role="alert">
            {friendlyError(sheet.error)}
            {sheet.retry && <button type="button" className={s.retryBtn} onClick={sheet.retry}>{tr('Дахин оролдох')}</button>}
          </p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>{tr('№')}</th><th>{tr('Ажил')}</th><th>{tr('Ашиглах материал')}</th></tr></thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr className={s.emptyRow}><td colSpan={3}>{tr('Ажил олдсонгүй')}</td></tr>
                ) : shown.map((r) => {
                  const des = r.des as number;
                  const base = matsOf(r);
                  const mine = cur(des, base);
                  const changed = draft.has(des);
                  /* Сонгогдсон ч нөөцөөс хасагдсан материал — жагсаалтад үлдээж хасах боломжтой */
                  const opts = [...names, ...mine.filter((x) => !names.includes(x))];
                  return (
                    <tr key={des} className={`${s.row} ${changed ? s.rowOn : ''}`}>
                      <td className={s.num}>{r.no}</td>
                      <td>{r.work}</td>
                      <td>
                        <div className={s.chips}>
                          {mine.length ? mine.map((m) => (
                            <span key={m} className={`${s.chip} ${names.includes(m) ? '' : s.expired}`}
                              title={names.includes(m) ? undefined : tr('Нөөцөд алга')}>{m}</span>
                          )) : <span className={s.note}>—</span>}
                          {canEdit && (
                            <button type="button" className={s.ghostBtn} disabled={busy} aria-expanded={open === des}
                              onClick={() => setOpen(open === des ? null : des)}>
                              {open === des ? tr('Хаах') : tr('Сонгох')}
                            </button>
                          )}
                        </div>
                        {canEdit && open === des && (
                          <div className={s.matPick} role="group" aria-label={tr('Ашиглах материал')}>
                            {opts.length === 0 ? <span className={s.note}>{tr('Нөөцөд материал алга')}</span> : opts.map((m) => (
                              <label key={m} className={s.matOpt}>
                                <input type="checkbox" checked={mine.includes(m)} disabled={busy} onChange={() => toggle(des, base, m)} />
                                <span>{m}</span>
                              </label>
                            ))}
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
