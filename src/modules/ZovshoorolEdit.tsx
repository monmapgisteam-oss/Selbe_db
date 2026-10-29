'use client';

/**
 * ЗӨВШӨӨРӨЛ НЭМЭХ / ЗАСАХ МАЯГТ.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '@/lib/useFocusTrap';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { buildPacks } from '@/modules/Bagts';
import { useBuildings } from '@/modules/BuildingPanel';
import {
  TOLOV, ZovClashError, deleteZov, loadOneZov, loadZovFieldLens, saveZov, validateZov,
  type Tolov, type Zov, type ZovDraft, type ZovFieldLens,
} from '@/lib/zovshoorol';
import { setNavDirty } from '@/lib/navGuard';
import s from './zovshoorol.module.css';
import { userError } from '@/components/ui';
import { DateField } from '@/modules/huvaari/DateField';
import { isLostResponse } from '@/lib/butetsEdit';
import { invalidate } from '@/lib/dataBus';

/** ms → YYYY-MM-DD (UTC). Огноогүй бол хоосон. */
const toInput = (ms: number | null): string => {
  if (ms == null) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
};

/** YYYY-MM-DD → ms (UTC). Орон нутгийн бүсээр уншвал нэг хоног ухарна. */
const fromInput = (v: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const TOLOV_LIST: Exclude<Tolov, 'unknown'>[] = [TOLOV.wait, TOLOV.ok, TOLOV.no];

const TOLOV_LABEL: Record<Exclude<Tolov, 'unknown'>, () => string> = {
  [TOLOV.wait]: () => tr('Хүлээгдэж буй'),
  [TOLOV.ok]: () => tr('Зөвшөөрсөн'),
  [TOLOV.no]: () => tr('Зөвшөөрөөгүй'),
};

export function ZovshoorolEdit({ init, all, onDone, onCancel }: {
  init: ZovDraft;
  all: Zov[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<ZovDraft>(init);
  const [before] = useState<Zov | null>(() =>
    (init.oid ? all.find((r) => r.oid === init.oid) ?? null : null));
  const dirty = useRef(false);
  const markDirty = () => {
    dirty.current = true;
    setNavDirty('zovshoorol', true, tr('Зөвшөөрөл'));
  };
  useEffect(() => () => setNavDirty('zovshoorol', false), []);
  const mdRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mdRef);
  const [err, setErr] = useState<Partial<Record<keyof ZovDraft, string>>>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  const [unsure, setUnsure] = useState(false);
  const [kept, setKept] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const editing = init.oid != null;
  const [lens, setLens] = useState<ZovFieldLens>({});
  useEffect(() => {
    let alive = true;
    void loadZovFieldLens().then((l) => { if (alive) setLens(l); });
    return () => { alive = false; };
  }, []);

  useEffect(() => { firstRef.current?.focus(); }, []);
  /**
   * МАЯГТ ДОТОРХ АСУУЛТ — `window.confirm`-ийн оронд (хаах · ирээдүйн огноо · устгах).
   */
  const [confirmQ, setConfirmQ] = useState<{ msg: string; onYes: () => void; danger?: boolean } | null>(null);
  /** Хаахыг оролдох — өөрчлөлт байвал асууна. */
  const tryClose = useCallback(() => {
    if (busy) return;
    if (dirty.current) {
      setConfirmQ({ msg: tr('Хадгалаагүй өөрчлөлт байна. Хаах уу?'), onYes: () => onCancel() });
      return;
    }
    onCancel();
  }, [busy, onCancel, setConfirmQ]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') tryClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tryClose]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  /**
   * БАГЦЫН СОНГОЛТ — «Багцын гүйцэтгэл» харагдацын ЯГ ТЭР жагсаалтаас.
   */
  const bq = useBuildings();
  const bRows = bq.state === 'ready' ? bq.data.rows : null;
  const bagtsOpts = useMemo(() => {
    const set = new Set<string>(buildPacks(bRows).map((p) => p.name));
    for (const r of all) if (r.bagts) set.add(r.bagts);
    return [...set].sort((a, b) => a.localeCompare(b, 'mn', { numeric: true }));
  }, [all, bRows]);

  /**
   * Багц солиход ДАРААЛЛЫГ санал болгоно (сүүлийнх + 1).
   */
  const nextShat = (bagts: string): number => {
    const mine = all.filter((r) => r.bagts === bagts && r.oid !== d.oid);
    return mine.length ? Math.max(...mine.map((r) => r.shat)) + 1 : 1;
  };

  const set = (k: keyof ZovDraft, v: unknown) => {
    markDirty();
    setD((p) => ({ ...p, [k]: v }) as ZovDraft);
    setErr((p) => ({ ...p, [k]: undefined }));
    setFail('');
    setConfirmQ(null);
  };

  /** Огнооны талбарт бичсэн текст огноо болж задрахгүй байна (`DateField.onBad`) */
  const [badDate, setBadDate] = useState(false);
  const stashOgnoo = useRef<number | null>(null);
  const [ognooCleared, setOgnooCleared] = useState(false);
  const setTolov = (t: ZovDraft['tolov']) => {
    markDirty();
    let ognoo = d.ognoo;
    if (t === TOLOV.wait && d.ognoo != null) {
      stashOgnoo.current = d.ognoo;
      ognoo = null;
      setOgnooCleared(true);
    } else if (t !== TOLOV.wait) {
      if (d.tolov === TOLOV.wait && d.ognoo == null && stashOgnoo.current != null) ognoo = stashOgnoo.current;
      setOgnooCleared(false);
    }
    setD((p) => ({ ...p, tolov: t, ognoo }));
    setErr((p) => ({ ...p, tolov: undefined, ognoo: undefined }));
    setFail('');
    setConfirmQ(null);
  };

  const submit = async () => {
    if (editing && !d.oid) {
      setFail(tr('Мөрийн дугаар уншигдаагүй тул засах боломжгүй — хуудсыг дахин ачаалаад оролдоно уу.'));
      return;
    }
    const e = validateZov(d, all);
    if (badDate) e.ognoo = tr('Огноо буруу — жишээ: 2026-10-04');
    setErr(e);
    if (Object.values(e).some(Boolean)) return;
    if (d.ognoo != null) {
      const now = new Date();
      const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      if (d.ognoo > today) {
        setConfirmQ({
          msg: tr('Шийдвэрлэсэн огноо ({0}) өнөөдрөөс ХОЙШ байна. Зөв үү?', toInput(d.ognoo)),
          onYes: () => { void doSave(); },
        });
        return;
      }
    }
    await doSave();
  };

  /** Хадгалалтын өөрөө — шалгалт давсны (ба ирээдүйн огнооны асуултын) дараа */
  const doSave = async () => {
    setBusy(true);
    setFail('');
    try {
      await saveZov({ ...d, ner: d.ner.trim(), bagts: d.bagts.trim() }, before);
      onDone();
    } catch (x) {
      if (x instanceof ZovClashError) {
        if (x.kept) {
          setFail(x.message);
          setKept(true);
          dirty.current = false;
          return;
        }
        setFail(x.message);
        return;
      }
      if (!editing && isLostResponse(x)) {
        setUnsure(true);
        setFail('');
        return;
      }
      setFail(userError(x));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!d.oid) {
      setFail(tr('Мөрийн дугаар уншигдаагүй тул устгах боломжгүй — хуудсыг дахин ачаалаад оролдоно уу.'));
      return;
    }
    const oid = d.oid;
    setConfirmQ({
      msg: tr('«{0}» зөвшөөрлийг бүрмөсөн устгах уу? Буцаах боломжгүй.', d.ner),
      danger: true,
      onYes: () => { void doRemove(oid); },
    });
  };

  /** Устгалын өөрөө — самбарын асуултад «Тийм» дарсны дараа */
  const doRemove = async (oid: number) => {
    setBusy(true);
    setFail('');
    try {
      await deleteZov(oid);
      onDone();
    } catch (x) {
      if (isLostResponse(x)) {
        let still: Zov | null | undefined;
        try { still = await loadOneZov(oid); } catch { still = undefined; }
        if (still === null) {
          invalidate('ZOVSHOOROL');
          onDone();
          return;
        }
        if (still === undefined) {
          setFail(tr('Серверээс хариу ирсэнгүй — зөвшөөрөл устгагдсан эсэх ТОДОРХОЙГҮЙ. Хуудсыг дахин ачаалж шалгана уу.'));
          return;
        }
        setFail(tr('Серверээс хариу ирсэнгүй — үр дүн тодорхойгүй: зөвшөөрөл одоогоор устгагдаагүй харагдаж байна. Хуудсыг дахин ачаалж шалгаад шаардлагатай бол дахин устгана уу.'));
        return;
      }
      setFail(userError(x));
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof ZovDraft, label: string, node: ReactNode, hint?: string) => (
    <label className={s.f}>
      <span className={s.fLabel}>{label}</span>
      {node}
      {err[k] ? <span className={s.fErr}>{err[k]}</span> : hint ? <span className={s.fHint}>{hint}</span> : null}
    </label>
  );

  const tolovIdx = Math.max(0, d.tolov ? TOLOV_LIST.indexOf(d.tolov) : -1);
  const tolovKey = (e: ReactKeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = d.tolov == null
      ? TOLOV_LIST[step > 0 ? 0 : TOLOV_LIST.length - 1]
      : TOLOV_LIST[(tolovIdx + step + TOLOV_LIST.length) % TOLOV_LIST.length];
    setTolov(next);
    const grp = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => grp.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  };

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-labelledby="zov-edit-title" onClick={tryClose}>
      <div ref={mdRef} className={s.modal + ' ' + s.modalWide} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}>
          <span id="zov-edit-title" className={s.modalTitle}>
            {editing ? tr('Зөвшөөрөл засах') : tr('Зөвшөөрөл нэмэх')}
          </span>
          <button type="button" className={s.close} onClick={tryClose} disabled={busy} aria-label={tr('Хаах')}>✕</button>
        </div>

        <div className={s.form}>
          <div className={s.grid2}>
            {field('bagts', tr('Багц'), (
              <select
                className={s.input}
                value={d.bagts}
                onChange={(e) => {
                  const b = e.target.value;
                  markDirty();
                  setD((p) => ({ ...p, bagts: b, shat: p.oid || !b ? p.shat : nextShat(b) }));
                  setErr((p) => ({ ...p, bagts: undefined }));
                  setFail('');
                  setConfirmQ(null);
                }}
              >
                <option value="">{tr('— сонгох —')}</option>
                {bagtsOpts.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            ))}
            {field('shat', tr('Дараалал'), (
              <input
                className={s.input}
                type="number"
                min={1}
                step={1}
                value={Number.isNaN(d.shat) ? '' : String(d.shat)}
                onChange={(e) => set('shat', e.target.value === '' ? NaN : Number(e.target.value))}
              />
            ), tr('Гинжин дэх байрлал — 1-ээс эхэлнэ'))}
          </div>

          {field('ner', tr('Зөвшөөрлийн нэр'), (
            <input
              ref={firstRef}
              className={s.input}
              value={d.ner}
              maxLength={lens.ner ?? 200}
              placeholder={tr('жиш. Барилга барих зөвшөөрөл')}
              onChange={(e) => set('ner', e.target.value)}
            />
          ))}

          <div className={s.grid2}>
            <div className={s.f}>
              <span id="zov-edit-tolov" className={s.fLabel}>{tr('Төлөв')}</span>
              <div className={s.radios} role="radiogroup" aria-labelledby="zov-edit-tolov" onKeyDown={tolovKey}>
                {TOLOV_LIST.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={d.tolov === t}
                    tabIndex={t === TOLOV_LIST[tolovIdx] ? 0 : -1}
                    className={s.radio + ' ' + (d.tolov === t ? s.radioOn : '')}
                    onClick={() => setTolov(t)}
                  >
                    {TOLOV_LABEL[t]()}
                  </button>
                ))}
              </div>
              {err.tolov ? <span className={s.fErr}>{err.tolov}</span>
                : d.tolov == null ? <span className={s.fHint}>{tr('Одоогийн төлөв танигдаагүй — сонгоно уу')}</span> : null}
            </div>
            <div className={s.f}>
              <span className={s.fLabel}>{tr('Шийдвэрлэсэн огноо')}</span>
              <DateField
                label={tr('Шийдвэрлэсэн огноо')}
                value={toInput(d.ognoo)}
                disabled={busy}
                onBad={setBadDate}
                onChange={(v) => { setOgnooCleared(false); set('ognoo', fromInput(v)); }}
              />
              {err.ognoo ? <span className={s.fErr}>{err.ognoo}</span>
                : ognooCleared ? <span className={s.fHint}>{tr('«Хүлээгдэж буй» болсон тул огноог арилгав')}</span>
                  : d.tolov === TOLOV.wait ? <span className={s.fHint}>{tr('Хүлээгдэж буй үед хоосон')}</span> : null}
            </div>
          </div>

          <div className={s.grid2}>
            {field('dugaar', tr('Зөвшөөрлийн дугаар'), (
              <input className={s.input} value={d.dugaar} maxLength={lens.dugaar ?? 100}
                onChange={(e) => set('dugaar', e.target.value)} />
            ), d.tolov === TOLOV.ok && !d.dugaar.trim()
              ? tr('Зөвшөөрсөн боловч дугаар бичээгүй байна')
              : undefined)}
            {field('baiguullaga', tr('Шийдвэрлэх байгууллага'), (
              <input className={s.input} value={d.baiguullaga} maxLength={lens.baiguullaga ?? 150}
                onChange={(e) => set('baiguullaga', e.target.value)} />
            ))}
          </div>

          <div className={s.grid2}>
            {field('hariutsagch', tr('Байгууллагын хариуцагч'), (
              <input className={s.input} value={d.hariutsagch} maxLength={lens.hariutsagch ?? 100}
                onChange={(e) => set('hariutsagch', e.target.value)} />
            ))}
            {field('selbe', tr('Сэлбэ талын хариуцагч'), (
              <input className={s.input} value={d.selbe} maxLength={lens.selbe ?? 100}
                onChange={(e) => set('selbe', e.target.value)} />
            ))}
          </div>

          {field('tailbar', tr('Тайлбар'), (
            <textarea className={s.input + ' ' + s.area} rows={3} value={d.tailbar} maxLength={lens.tailbar ?? 2000}
              onChange={(e) => set('tailbar', e.target.value)} />
          ))}

          {fail && <div className={s.formErr} role="alert">{fail}</div>}
          {unsure && (
            <div className={s.formErr} role="alert">
              {tr('Серверээс хариу ирсэнгүй — зөвшөөрөл нэмэгдсэн эсэх ТОДОРХОЙГҮЙ. Дахин хадгалахаас өмнө хуудсыг дахин ачаалж, зөвшөөрөл үүссэн эсэхийг шалгана уу.')}
              {' '}
              <button type="button" className={s.btn} onClick={() => setUnsure(false)} disabled={busy}>
                {tr('Шалгасан — үүсээгүй, дахин нэмэх')}
              </button>
            </div>
          )}
        </div>

        {/* МАЯГТ ДОТОРХ АСУУЛТ — `confirmQ`-ийн тайлбар (2026-10-09, аудит №6) */}
        {confirmQ && (
          <div className={s.askRow} role="group" aria-live="assertive" aria-label={confirmQ.msg}>
            <span className={s.askMsg}>{confirmQ.msg}</span>
            <button
              type="button"
              className={confirmQ.danger ? s.danger : s.primary}
              disabled={busy}
              onClick={() => { const q = confirmQ; setConfirmQ(null); q.onYes(); }}
            >
              {tr('Тийм')}
            </button>
            <button type="button" className={s.btn} onClick={() => setConfirmQ(null)} disabled={busy}>
              {tr('Үгүй')}
            </button>
          </div>
        )}

        <div className={s.actions}>
          {editing && !kept && (
            <button type="button" className={s.danger} onClick={remove} disabled={busy}>
              {tr('Устгах')}
            </button>
          )}
          <span className={s.spacer} />
          <button type="button" className={s.btn} onClick={kept ? onDone : tryClose} disabled={busy}>
            {kept ? tr('Хаах') : tr('Болих')}
          </button>
          <button type="button" className={s.primary} onClick={submit} disabled={busy || unsure || kept}>
            {busy ? tr('Хадгалж байна…') : tr('Хадгалах')}
          </button>
        </div>
      </div>
    </div>
  );
}
