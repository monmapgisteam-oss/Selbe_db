'use client';

/**
 * НЭГЖ ТАЛБАРЫН ТӨЛӨВ ЗАСАХ — маягт.
 *
 * ⚠️ ЯАГААД (2026-08-31, хэрэглэгчийн шийдвэр): төлөв солих цорын ганц зам нь
 * ArcGIS Experience Builder-ийн ТУСДАА апп байсан. Түүнийг embed-ээр холбохгүй,
 * үйл ажиллагааг нь систем дотроо давтана.
 *
 * ⚠️ БҮТЭЦ нь `ZovshoorolEdit.tsx`-ийг ДАГАНА — репогийн ганц маягтын жишиг:
 * ноорог нэг объектод, `dirty` ref, талбар тус бүрийн алдаа + сэрвэрийн нэг
 * мөр, Escape ба backdrop-оор хаах, `busy` үед бүх товч идэвхгүй.
 *
 * ⚠️ АМЖИЛТГҮЙ БОЛ МАЯГТ ХААГДАХГҮЙ. Сүлжээ унасан үед хаагдвал бичсэн зүйл
 * алдагдана; хэрэглэгч дахин бичихээс өөр аргагүй болно.
 *
 * ⚠️ ТАЛБАЙ БА КАДАСТРЫН ДУГААР ЗАСАГДАХГҮЙ. Талбай нь геометрээс гардаг тул
 * гараар өөрчилвөл зурагтай зөрнө; дугаар нь кадастрын таних тэмдэг. Хоёуланг
 * идэвхгүй `input` болговол «яагаад бичиж болохгүй байна» гэсэн асуулт төрөх
 * тул ТОДОРХОЙЛОЛТ (`<dl>`) хэлбэрээр үзүүлнэ.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { PARCEL_STATUS_HUES } from '@/lib/services';
import {
  STATUS_LIST, loadParcel, loadProgressValues, saveParcel, validateParcel,
  type Parcel, type ParcelPatch,
} from '@/lib/parcelEdit';
import g from './gazar.module.css';

const patchOf = (p: Parcel): ParcelPatch => ({
  owner: p.owner,
  status: p.status,
  progress: p.progress,
  address: p.address,
  note: p.note,
});

export function GazarEdit({
  oid, canEdit, onDone, onCancel,
}: {
  oid: number;
  canEdit: boolean;
  /** Амжилттай хадгалсны дараа — хэдэн талбар бичигдсэнийг дамжуулна */
  onDone: (changed: number) => void;
  onCancel: () => void;
}) {
  const [before, setBefore] = useState<Parcel | null>(null);
  const [d, setD] = useState<ParcelPatch | null>(null);
  const [opts, setOpts] = useState<string[]>([]);
  const [load, setLoad] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Partial<Record<keyof ParcelPatch, string>>>({});
  const [fail, setFail] = useState('');
  const dirty = useRef(false);
  /* ⚠️ Фокусын урхи (2026-09-03-ны хүртээмжийн аудит) — `aria-modal` нь
     хөтчийн Tab-д нөлөөлдөггүй, урхигүй бол фокус ард руу гарна. */
  const mdRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mdRef);

  /**
   * ⚠️ МӨРИЙГ ЭНД ДАХИН ТАТНА. Газрын зургийн `onPick` нь давхаргын
   * `outFields`-д ачаалагдсан талбарыг л буцаадаг тул түүгээр маягт нээвэл
   * зарим талбар хоосон харагдаж, хадгалахад ЖИНХЭНЭ утгыг нь дарж бичих
   * эрсдэлтэй.
   */
  useEffect(() => {
    let alive = true;
    setLoad(true); setFail('');
    Promise.all([loadParcel(oid), loadProgressValues().catch(() => [] as string[])])
      .then(([p, list]) => {
        if (!alive) return;
        if (!p) { setFail(tr('Нэгж талбар олдсонгүй.')); return; }
        setBefore(p);
        setD(patchOf(p));
        /* ⚠️ Одоогийн утга жагсаалтад байхгүй бол НЭМНЭ — бохир бичиглэл
           (арын зайтай) сонголтоос унавал хадгалахад чимээгүй өөрчлөгдөнө. */
        setOpts(p.progress && !list.includes(p.progress) ? [p.progress, ...list] : list);
      })
      .catch((e) => alive && setFail(String((e as Error).message || e)))
      .finally(() => alive && setLoad(false));
    return () => { alive = false; };
  }, [oid]);

  const set = (k: keyof ParcelPatch, v: string) => {
    dirty.current = true;
    setD((p) => (p ? { ...p, [k]: v } : p));
    setErr((p) => ({ ...p, [k]: undefined }));
    setFail('');
  };

  const tryClose = useCallback(() => {
    if (busy) return;
    if (dirty.current && !window.confirm(tr('Хадгалаагүй өөрчлөлт байна. Хаах уу?'))) return;
    onCancel();
  }, [busy, onCancel]);

  /* Esc-ээр хаагдана — цонх нээгээд гарах товч хайх шаардлагагүй */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') tryClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tryClose]);

  const submit = async () => {
    if (!before || !d) return;
    const e = validateParcel(d);
    setErr(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true); setFail('');
    try {
      const n = await saveParcel(before, d);
      onDone(n);
    } catch (x) {
      /* ⚠️ Маягт ХААГДАХГҮЙ — бичсэн зүйл үлдэнэ */
      setFail(String((x as Error).message || x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={g.backdrop} role="dialog" aria-modal="true" onClick={tryClose}>
      <div ref={mdRef} className={g.modal} onClick={(e) => e.stopPropagation()}>
        <div className={g.modalHead}>
          <span className={g.modalTitle}>{tr('Нэгж талбарын төлөв')}</span>
          {before && <span className={g.modalNo}>{before.parcelNo || `#${before.oid}`}</span>}
          <button type="button" className={g.close} onClick={tryClose}
            disabled={busy} aria-label={tr('Хаах')}>✕</button>
        </div>

        {load ? (
          <p className={g.modalMsg}>{tr('Ачаалж байна…')}</p>
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
                <dd>{before.areaM2 == null ? '—' : `${num(before.areaM2)} м²`}</dd>
              </dl>

              <label className={g.f}>
                <span className={g.fLabel}>{tr('Овог, нэр')}</span>
                <input className={g.input} value={d.owner} disabled={!canEdit || busy}
                  onChange={(e) => set('owner', e.target.value)} />
              </label>

              <div className={g.f}>
                <span className={g.fLabel}>{tr('Төлөв')}</span>
                <div className={g.radios}>
                  {STATUS_LIST.map((s) => (
                    <button key={s} type="button" disabled={!canEdit || busy}
                      className={`${g.radio} ${d.status === s ? g.radioOn : ''}`}
                      onClick={() => set('status', s)}>
                      {/* Өнгө нь газрын зурагтай ИЖИЛ эх сурвалжаас */}
                      <i className={g.dot} style={{ '--dot': PARCEL_STATUS_HUES[s] } as React.CSSProperties} />
                      {s}
                    </button>
                  ))}
                </div>
                {err.status && <span className={g.fErr}>{err.status}</span>}
              </div>

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

              <label className={g.f}>
                <span className={g.fLabel}>{tr('Хаяг')}</span>
                <input className={g.input} value={d.address} disabled={!canEdit || busy}
                  onChange={(e) => set('address', e.target.value)} />
              </label>

              <label className={g.f}>
                <span className={g.fLabel}>{tr('Тайлбар (дэлгэрэнгүй)')}</span>
                <textarea className={`${g.input} ${g.area}`} value={d.note}
                  disabled={!canEdit || busy}
                  onChange={(e) => set('note', e.target.value)} />
              </label>

              {fail && <div className={g.formErr} role="alert">{fail}</div>}
            </div>

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
