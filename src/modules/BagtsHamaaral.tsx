'use client';

/**
 * «БАГЦЫН ХАМААРАЛ» (2026-10-04) — ТУХ-ын багцуудыг ХООРОНД НЬ холбож харуулна.
 *
 * ⚠️ Хэрэглэгчийн шийдвэрүүд (2026-10-04, ярилцаж тохиролцсон):
 *    · Зөвхөн багц ↔ багц — багц доторх ажлын уялдаа (`deps.ts`) ХАМААГҮЙ.
 *    · ГАНЦ ЖАГСААЛТ: мөр бүр = багц → түүний АРД талд хамааралтай багцууд + «нэмэх».
 *    · Засвар нь ЗӨВХӨН холбоо нэмэх/устгах — багцын жагсаалт системээс
 *      (`tuhData.buildTuhPkgs`), нэмж хасахгүй. Батлагч БАЙХГҮЙ.
 *    · Эрх нь «Эрх» доторх бүрэн ТУСДАА хуудас (`capText` → `hamaaral`).
 *      Эрхгүй хүн бүгдийг ХАРНА, засахгүй («харах ≠ засах», `viewEdit.check`).
 * ⚠️ 2026-10-04: СХЕМ (эхлээд бүх багцыг сумаар, дараа нь нэг багцад төвлөрсөн) ба
 *    KPI мөр ХАСАГДСАН — хэрэглэгч «ойлгомжгүй», «схем ч хэрэггүй» гэсэн. Буцааж бүү нэм.
 * ⚠️ Загвар нь ТУХ-ынх (`tuh.module.css`-ийн ХУУЛБАР — харагдацууд стайл хуваалцахгүй).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { CONTRACTED } from '@/lib/gdash';
import { TUH_GROUPS, matchesSearch, buildTuhPkgs, progressOf, type TuhGroup, type TuhPkg } from '@/lib/tuhData';
import { loadDeps, saveChange, linkError, downstreamOf, type Dep } from '@/lib/bagtsHamaaral';
import { useAuth } from '@/components/AuthGate';
import { friendlyError } from '@/components/ui';
import { loadFinData, pkgMonthsMap, physLatest } from '@/modules/Finance';
import s from './bagtsHamaaral.module.css';

type OnChange = (op: 'add' | 'remove', dep: Dep) => void;

export function BagtsHamaaral() {
  const finQ = useAsync(loadFinData, []);
  const depQ = useAsync(loadDeps, []);
  const { user } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `capN` нь эрх өөрчлөгдсөн дохио (`Zovshoorol`-той ижил)
  const canEdit = useMemo(() => hasCap(user?.username, 'hamaaral'), [user, capN]);

  const [grp, setGrp] = useState<TuhGroup | 'all'>('all');
  const [q, setQ] = useState('');
  /** Хадгалсны дараах жагсаалт — `depQ`-ийг дарна (дахин татахгүй) */
  const [saved, setSaved] = useState<Dep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pkgs = useMemo<TuhPkg[]>(
    () => (finQ.state === 'ready' ? buildTuhPkgs(finQ.data.contracts, CONTRACTED) : []),
    [finQ],
  );
  const byKey = useMemo(() => new Map(pkgs.map((p) => [p.key, p])), [pkgs]);
  /*
   * БАГЦ БҮРИЙН БОДИТ ГҮЙЦЭТГЭЛ (0–100) — ТУХ-ын `buildModel`-тэй ЯГ нэг дүрэм: орон сууц нь
   * `physLatest` (сарын цэгийн «бодит»), бусад нь Cashflow мөрийн гүйцэтгэл (`progressOf`).
   * ⚠️ Хэмжилтгүй бол `null` → «—» (0 биш).
   */
  const progress = useMemo(() => {
    const out = new Map<string, number | null>();
    if (finQ.state !== 'ready') return out;
    const actual = new Map<string, number>();
    pkgMonthsMap(finQ.data).forEach((m, k) => {
      const v = physLatest(m);
      if (v != null) actual.set(k, v);
    });
    for (const p of pkgs) out.set(p.key, progressOf(p, actual));
    return out;
  }, [finQ, pkgs]);
  /* ⚠️ Өнчин холбоо (багц нь жагсаалтаас алга болсон) — ХАРУУЛАХГҮЙ, хадгалалтад үлдэнэ */
  const deps = useMemo(() => {
    const all = saved ?? (depQ.state === 'ready' ? depQ.data.deps : []);
    return all.filter((d) => byKey.has(d.from) && byKey.has(d.to));
  }, [saved, depQ, byKey]);
  const shown = useMemo(() => pkgs.filter((p) => (grp === 'all' || p.group === grp)
    && matchesSearch(q, p.code, [p.name, p.contractor])), [pkgs, grp, q]);

  const change = useCallback<OnChange>(async (op, dep) => {
    if (busy) return;
    setErr('');
    setBusy(true);
    try {
      const res = await saveChange({ op, dep });
      if (res.ok) setSaved(res.state.deps);
      else setErr(res.error);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  if (finQ.state === 'loading') return <div className={s.wrap}><p className={s.loading}>{tr('Ачаалж байна…')}</p></div>;
  if (finQ.state === 'error') {
    return (
      <div className={s.wrap}>
        <p className={s.failNote} role="alert">
          {tr('Багцын жагсаалт татагдсангүй')}: {friendlyError(finQ.error)}
          {' '}<button type="button" className={s.retryBtn} onClick={() => finQ.retry?.()}>{tr('Дахин оролдох')}</button>
        </p>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      {/* ── Hero (ТУХ) ── */}
      <section className={s.hero}>
        <p className={s.eyebrow}>{tr('ТУХ · багцын хяналт')}</p>
        {/* ⚠️ 2026-10-04 (хэрэглэгч): гарчгийн АРД нийт багцын тоо */}
        <h1>{tr('Багцын хамаарал')} <small className={s.total}>{tr('{0} багц', num(pkgs.length))}</small></h1>
        <p className={s.heroSub}>{tr('Аль багц аль багцаас хамаардгийг харуулна.')}</p>
      </section>

      {depQ.state === 'error' && (
        <p className={s.failNote} role="alert">
          {tr('Хамаарлын бүртгэл уншигдсангүй')}: {friendlyError(depQ.error)}
          {' '}<button type="button" className={s.retryBtn} onClick={() => depQ.retry?.()}>{tr('Дахин оролдох')}</button>
        </p>
      )}
      {err && <p className={s.failNote} role="alert">{err}</p>}

      {/* ── Шүүлтүүр (ТУХ) ── */}
      <div className={s.filters}>
        <div className={s.seg} role="group" aria-label={tr('Бүлэг')}>
          <button type="button" className={s.segBtn} aria-pressed={grp === 'all'} onClick={() => setGrp('all')}>{tr('Бүгд')}</button>
          {TUH_GROUPS.filter((g) => pkgs.some((p) => p.group === g.key)).map((g) => (
            <button key={g.key} type="button" className={s.segBtn} aria-pressed={grp === g.key} onClick={() => setGrp(g.key)}>{g.label()}</button>
          ))}
        </div>
        <input className={s.search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Багц хайх…')} aria-label={tr('Багц хайх')} />
      </div>

      <List pkgs={shown} all={pkgs} deps={deps} byKey={byKey} progress={progress} canEdit={canEdit}
        busy={busy || depQ.state !== 'ready'} onChange={change} />
    </div>
  );
}

/* ══════════════ ЖАГСААЛТ — багц → ард багцууд ══════════════ */

function List({ pkgs, all, deps, byKey, progress, canEdit, busy, onChange }: {
  pkgs: TuhPkg[]; all: TuhPkg[]; deps: Dep[]; byKey: Map<string, TuhPkg>;
  /** Багц → бодит гүйцэтгэл (0–100), хэмжилтгүй бол `null` */
  progress: ReadonlyMap<string, number | null>;
  canEdit: boolean; busy: boolean; onChange: OnChange;
}) {
  const [addFor, setAddFor] = useState<string | null>(null);
  /* Ард багц дээр дарвал тэр багцын МӨР рүү гүйлгэнэ */
  const jump = (k: string) => document.getElementById(`hm-row-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>{tr('Багц')}</th>
            <th aria-hidden />
            <th>{tr('Хамаардаг (ард) багцууд')}</th>
          </tr>
        </thead>
        <tbody>
          {pkgs.length === 0 && <tr className={s.emptyRow}><td colSpan={3}>{tr('Багц олдсонгүй')}</td></tr>}
          {pkgs.map((p) => {
            const down = downstreamOf(deps, p.key);
            return (
              <tr key={p.key} id={`hm-row-${p.key}`}>
                <td className={s.pkgCell}>
                  <b>{p.code}</b>
                  {/* ⚠️ 2026-10-04 (хэрэглэгч): нэрний АРД бодит гүйцэтгэлийн хувь */}
                  <small>{p.name} <span className={s.pct} title={tr('Бодит гүйцэтгэл')}>{pct(progress.get(p.key) ?? null, 1)}</span></small>
                </td>
                <td className={s.arrowCell} aria-hidden>→</td>
                <td>
                  <span className={s.chips}>
                    {down.length === 0 && <span className={s.mute}>—</span>}
                    {down.map((k) => {
                      const x = byKey.get(k);
                      return (
                        <span key={k} className={s.chip}>
                          <button type="button" className={s.chipLink} title={x?.name} onClick={() => jump(k)}>{x?.code ?? k}</button>
                          {canEdit && (
                            <button type="button" className={s.chipX} disabled={busy}
                              /* ⚠️ 2026-10-05: УСТГАХЫН ӨМНӨ асууна — жижиг ✕ дээр андуурч дарахад холбоо
                                 шууд (буцаах аргагүй) устдаг байв. Бусад модулийн устгалтай ижил `confirm`. */
                              onClick={() => {
                                if (!window.confirm(tr('«{0}» → «{1}» хамаарлыг устгах уу?', p.code, x?.code ?? k))) return;
                                onChange('remove', { from: p.key, to: k });
                              }}
                              title={tr('Холбоо устгах')} aria-label={tr('Холбоо устгах')}>✕</button>
                          )}
                        </span>
                      );
                    })}
                    {canEdit && addFor !== p.key && (
                      <button type="button" className={s.addChip} onClick={() => setAddFor(p.key)}>+ {tr('нэмэх')}</button>
                    )}
                  </span>
                  {canEdit && addFor === p.key && (
                    <AddLink pkgs={all} self={p.key} busy={busy} label={tr('Ард багц нэмэх')}
                      errOf={(k) => linkError(deps, p.key, k)}
                      onAdd={(k) => { onChange('add', { from: p.key, to: k }); setAddFor(null); }}
                      onCancel={() => setAddFor(null)} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════ Холбоо нэмэх ══════════════ */

function AddLink({ pkgs, self, busy, label, errOf, onAdd, onCancel }: {
  pkgs: TuhPkg[]; self: string; busy: boolean; label: string;
  /** Нэмэх боломжгүй бол шалтгаан — сонголтод идэвхгүй харагдана */
  errOf: (k: string) => string | null;
  onAdd: (k: string) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState('');
  const err = v ? errOf(v) : null;
  return (
    <div className={s.addRow}>
      <select className={s.select} value={v} onChange={(e) => setV(e.target.value)} aria-label={label}>
        <option value="">+ {label}…</option>
        {TUH_GROUPS.map((g) => {
          const mine = pkgs.filter((p) => p.group === g.key && p.key !== self);
          if (!mine.length) return null;
          return (
            <optgroup key={g.key} label={g.label()}>
              {mine.map((p) => <option key={p.key} value={p.key} disabled={!!errOf(p.key)}>{p.code} — {p.name}</option>)}
            </optgroup>
          );
        })}
      </select>
      <button type="button" className={s.ghostBtn} disabled={!v || !!err || busy} onClick={() => { onAdd(v); setV(''); }}>
        {busy ? tr('Хадгалж байна…') : tr('Нэмэх')}
      </button>
      {onCancel && <button type="button" className={s.ghostBtn} onClick={onCancel}>{tr('Болих')}</button>}
      {err && <p className={s.note}>{err}</p>}
    </div>
  );
}
