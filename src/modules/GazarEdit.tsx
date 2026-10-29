'use client';

/**
 * НЭГЖ ТАЛБАРЫН ТӨЛӨВ ЗАСАХ — маягт.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { t as tr } from '@/lib/i18nCore';
import { dateTime, num } from '@/lib/format';
import { PARCEL_LEFT, PARCEL_STATUS_HUES } from '@/lib/services';
import {
  STATUS_LIST, loadFieldLens, loadParcel, loadProgressValues, saveParcel, validateParcelChanged,
  type FieldLens, type Parcel, type ParcelPatch,
} from '@/lib/parcelEdit';
import g from './gazar.module.css';
import { Loading, userError } from '@/components/ui';

/** Төлөв ба явцын мэдээ НЭГ талбар уу (2026-09-21, `services.ts` `PARCEL_LEFT.fields`) */
const SAME_FIELD = PARCEL_LEFT.fields.status === PARCEL_LEFT.fields.progress;

const patchOf = (p: Parcel): ParcelPatch => ({
  owner: p.owner,
  status: p.status,
  progress: p.progress,
  address: p.address,
  note: p.note,
});

export function GazarEdit({
  oid, canEdit, onDone, onCancel, onDirty,
}: {
  oid: number;
  canEdit: boolean;
  /**
   * Амжилттай хадгалсны дараа — хадгалагдсан НЭГЖ ТАЛБАРЫН тоог (0 | 1) дамжуулна.
   */
  onDone: (changed: number) => void;
  onCancel: () => void;
  /**
   *    `Gazar.exitEdit` нь `editOid`-ыг `null` болгож энэ компонентыг ШУУД
   *    салгадаг тул доорх `tryClose`-ийн баталгаа ХЭЗЭЭ Ч дуудагддаггүй байв:
   *    «Талбар засах» товчийг дахин дарах, эсвэл «Хаах» дарахад бөглөсөн бүх
   *    зүйл асуулгүй алга болдог байлаа. Эцэг нь энэ тугийг хараад өөрөө
   *    асууна.
   */
  onDirty?: (dirty: boolean) => void;
}) {
  const [before, setBefore] = useState<Parcel | null>(null);
  const [d, setD] = useState<ParcelPatch | null>(null);
  const [opts, setOpts] = useState<string[]>([]);
  const [lens, setLens] = useState<FieldLens>({});
  const [load, setLoad] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Partial<Record<keyof ParcelPatch, string>>>({});
  const [fail, setFail] = useState('');
  const dirty = useRef(false);
  const mdRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mdRef);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoad(true); setFail('');
    setBefore(null); setD(null); setErr({});
    dirty.current = false;
    Promise.all([loadParcel(oid), loadProgressValues().catch(() => [] as string[]), loadFieldLens()])
      .then(([p, list, ln]) => {
        if (!alive) return;
        setLens(ln);
        if (!p) { setFail(tr('Нэгж талбар олдсонгүй.')); return; }
        setBefore(p);
        setD(patchOf(p));
        setOpts(p.progress && !list.includes(p.progress) ? [p.progress, ...list] : list);
      })
      .catch((e) => alive && setFail(userError(e)))
      .finally(() => alive && setLoad(false));
    return () => { alive = false; };
  }, [oid]);

  const set = (k: keyof ParcelPatch, v: string) => {
    dirty.current = true;
    onDirty?.(true);
    setD((p) => (p ? { ...p, [k]: v } : p));
    setErr((p) => ({ ...p, [k]: undefined }));
    setFail('');
    setAskClose(false);
  };

  /**
   * ХААХЫН ӨМНӨХ АСУУЛТ — маягт дотор мөр («Тийм»/«Үгүй»).
   */
  const [askClose, setAskClose] = useState(false);
  const [askFor, setAskFor] = useState(oid);
  if (askFor !== oid) {
    setAskFor(oid);
    setAskClose(false);
  }

  /** Хаяхаар шийдсэн — тугийг унтраана (эцэг дахин асуух ёсгүй), хаана */
  const dropClose = useCallback(() => {
    dirty.current = false;
    onDirty?.(false);
    onCancel();
  }, [onCancel, onDirty]);

  const tryClose = useCallback(() => {
    if (busy) return;
    if (dirty.current) { setAskClose(true); return; }
    dropClose();
  }, [busy, dropClose]);

  /* Esc-ээр хаагдана — цонх нээгээд гарах товч хайх шаардлагагүй */
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

  const submit = async () => {
    if (!before || !d) return;
    const e = validateParcelChanged(before, d, lens);
    setErr(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true); setFail('');
    try {
      const n = await saveParcel(before, d);
      dirty.current = false;
      onDirty?.(false);
      onDone(n);
    } catch (x) {
      setFail(userError(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={g.backdrop} role="dialog" aria-modal="true" aria-labelledby="gazar-edit-title" onClick={tryClose}>
      <div ref={mdRef} className={g.modal} onClick={(e) => e.stopPropagation()}>
        <div className={g.modalHead}>
          <span id="gazar-edit-title" className={g.modalTitle}>{tr('Нэгж талбарын төлөв')}</span>
          {before && <span className={g.modalNo}>{before.parcelNo || `#${before.oid}`}</span>}
          <button type="button" className={g.close} onClick={tryClose}
            disabled={busy} aria-label={tr('Хаах')}>✕</button>
        </div>

        {load ? (
          <Loading />
        ) : !before || !d ? (
          <p className={g.modalMsg}>{fail || tr('Нэгж талбар олдсонгүй.')}</p>
        ) : (
          <>
            <div className={g.form}>
              {/* ЗАСАГДАХГҮЙ — таних тэмдэг ба геометрээс гарах хэмжээ */}
              <dl className={g.ro}>
                <dt>{tr('Кадастрын дугаар')}</dt>
                <dd>{before.parcelNo || '—'}</dd>
                <dt>{tr('Талбай')}</dt>
                <dd>{before.areaM2 == null ? '—' : tr('{0} м²', num(before.areaM2))}</dd>
                {(before.editedBy || before.editedAt != null) && (
                  <>
                    <dt>{tr('Сүүлд засварласан')}</dt>
                    <dd>
                      {[before.editedBy, before.editedAt != null ? dateTime(before.editedAt) : null]
                        .filter(Boolean).join(' · ')}
                    </dd>
                  </>
                )}
              </dl>

              <label className={g.f}>
                <span className={g.fLabel}>{tr('Овог, нэр')}</span>
                <input className={g.input} value={d.owner} disabled={!canEdit || busy}
                  maxLength={lens.owner ?? 200}
                  onChange={(e) => set('owner', e.target.value)} />
                {err.owner && <span className={g.fErr}>{err.owner}</span>}
              </label>

              <div className={g.f}>
                <span className={g.fLabel} id="gazar-edit-tolov">{tr('Төлөв')}</span>
                <div className={g.radios} role="radiogroup" aria-labelledby="gazar-edit-tolov">
                  {STATUS_LIST.map((s) => (
                    <button key={s} type="button" disabled={!canEdit || busy}
                      role="radio" aria-checked={d.status === s}
                      className={`${g.radio} ${d.status === s ? g.radioOn : ''}`}
                      onClick={() => set('status', s)}>
                      {/* Өнгө нь газрын зурагтай ИЖИЛ эх сурвалжаас */}
                      <i className={g.dot} style={{ '--dot': PARCEL_STATUS_HUES[s] } as React.CSSProperties} />
                      {tr(s)}
                    </button>
                  ))}
                </div>
                {err.status ? <span className={g.fErr}>{err.status}</span>
                  : before.status && d.status === before.status && !STATUS_LIST.includes(before.status)
                    ? <span className={g.fHint}>
                      {tr('Одоогийн утга «{0}» жагсаалтад байхгүй — сонгохгүй бол хэвээр үлдэнэ', before.status)}
                    </span>
                    : null}
              </div>

              {!SAME_FIELD && (
              <label className={g.f}>
                <span className={g.fLabel}>{tr('Явцын мэдээ')}</span>
                <select className={g.input} value={d.progress} disabled={!canEdit || busy}
                  onChange={(e) => set('progress', e.target.value)}>
                  <option value="">{tr('— сонгоогүй —')}</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <span className={g.fHint}>
                  {tr('Утгууд үйлчилгээнээс уншигдана — бичиглэл нь хэвээр хадгалагдана')}
                </span>
              </label>
              )}

              <label className={g.f}>
                <span className={g.fLabel}>{tr('Хаяг')}</span>
                <input className={g.input} value={d.address} disabled={!canEdit || busy}
                  maxLength={lens.address ?? 100}
                  onChange={(e) => set('address', e.target.value)} />
                {err.address && <span className={g.fErr}>{err.address}</span>}
              </label>

              <label className={g.f}>
                <span className={g.fLabel}>{tr('Тайлбар (дэлгэрэнгүй)')}</span>
                <textarea className={`${g.input} ${g.area}`} value={d.note}
                  disabled={!canEdit || busy}
                  maxLength={lens.note ?? 2000}
                  onChange={(e) => set('note', e.target.value)} />
                {err.note && <span className={g.fErr}>{err.note}</span>}
              </label>

              {fail && <div className={g.formErr} role="alert">{fail}</div>}
            </div>

            {/* Самбарын асуулт — `askClose`-ийн тайлбар (2026-10-09, аудит №6) */}
            {askClose && (
              <div className={g.askRow} role="group" aria-live="assertive">
                <span className={g.askMsg}>{tr('Хадгалаагүй өөрчлөлт байна. Хаах уу?')}</span>
                <button type="button" className={g.primary} onClick={dropClose} disabled={busy}>
                  {tr('Тийм')}
                </button>
                <button type="button" className={g.btn} onClick={() => setAskClose(false)} disabled={busy}>
                  {tr('Үгүй')}
                </button>
              </div>
            )}

            <div className={g.actions}>
              <span className={g.spacer} />
              <button type="button" className={g.btn} onClick={tryClose} disabled={busy}>
                {tr('Болих')}
              </button>
              <button type="button" className={g.primary} onClick={submit}
                disabled={busy || !canEdit}>
                {busy ? tr('Хадгалж байна…') : tr('Хадгалах')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
