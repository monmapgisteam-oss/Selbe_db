'use client';

/**
 * ДЭД БҮТЦИЙН ОБЪЕКТЫН АТРИБУТ ЗАСАХ — маягт.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useSyncRef } from '@/lib/useSyncRef';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { km, num } from '@/lib/format';
import { LAYER_BY_ID } from '@/lib/services';
import type { Row } from '@/lib/query';
import {
  createRow, diffRow, emptyPatch, loadGeometry, loadLayerMeta, loadRow, revertAttrs, rowToPatch,
  isLostResponse, saveRow, validateChanged, validateRow,
  type FieldDef, type LayerMeta, type Patch,
} from '@/lib/butetsEdit';
import { geomAreaM2, geomLengthM, lenFieldUnit, lenFieldValue, measureKind } from '@/lib/butetsLen';
import { statusValsChanged } from './DedButetsStatus';

/**
 * ХАДГАЛСНЫ ДАРАА БУЦААХАД хэрэгтэй мэдээлэл.
 */
export type UndoInfo =
  | { kind: 'add'; oid: number }
  | { kind: 'attr'; oid: number; attrs: Record<string, unknown>; wrote?: Record<string, unknown> }
  /** Олон мөрийн засвар (`DedButetsBatch`) — мөр бүр ӨӨРИЙН хуучин утгатай */
  | { kind: 'batch'; rows: { oid: number; attrs: Record<string, unknown>; wrote?: Record<string, unknown> }[] };
import d from './dedButets.module.css';
import { Loading, userError } from '@/components/ui';

/**
 * ГЕОМЕТРЭЭС ГАРАХ СИСТЕМИЙН ХЭМЖЭЭ — толгойн тодорхойлолтод.
 */
const GEOM_LEN = 'SHAPE__Length';
const GEOM_AREA = 'SHAPE__Area';

/**
 * ГАРААР БИЧИГДСЭН УРТЫН талбарууд — эдгээр нь порталын БҮХ уртын нийлбэрийн
 * эх сурвалж (`LayerDef.qty.field = 'urt_m'`).
 */

const numOf = (v: unknown): number | null => {
  const x = Number(v);
  return v != null && v !== '' && Number.isFinite(x) ? x : null;
};

/** Маягтын УРТЫН талбар (эхнийх) ба нэгж — байхгүй бол `null` */
const lenFieldOf = (meta: LayerMeta, layerId: string): { f: FieldDef; unit: 'm' | 'km' } | null => {
  const qty = LAYER_BY_ID[layerId]?.qty ?? null;
  for (const f of meta.fields) {
    if (f.kind !== 'number') continue;
    const unit = lenFieldUnit(f.name, qty);
    if (unit) return { f, unit };
  }
  return null;
};

/**
 * ОБЪЕКТЫН ГЕОМЕТРИЙН УРТ (м) — давхаргын SR-ээр (`butetsLen`-ийн дүрэм).
 * Проекцолсон давхаргад серверийн `Shape__Length` (давхаргын SR-ийн хавтгай урт);
 * Web Mercator/газарзүйнд геометрээс ГЕОДЕЗИЙН урт (`Shape__Length` хэтэрхий).
 */
async function serverLenM(meta: LayerMeta, oid: number, row: Row | null): Promise<number | null> {
  if (measureKind(meta.wkid) === 'planar') {
    const s = row ? numOf(row[GEOM_LEN]) : null;
    if (s != null) return s;
  }
  const g = await loadGeometry(meta, oid);
  return g ? geomLengthM(g) : null;
}

/**
 * НЭГ ТАЛБАРЫН ОРОЛТ — домэйнтэй бол `<select>`, үгүй бол `<input>`.
 */
export function FieldInput({
  f, value, err, disabled, onChange, hint, placeholder,
}: {
  f: FieldDef;
  value: string;
  err?: string;
  disabled: boolean;
  onChange: (v: string) => void;
  hint?: ReactNode;
  placeholder?: string;
}) {
  return (
    <label className={d.f}>
      <span className={d.fLabel}>{f.alias}</span>
      {f.codes ? (
        <select className={d.input} value={value} disabled={disabled}
          onChange={(ev) => onChange(ev.target.value)}>
          {(f.nullable || placeholder != null) && (
            <option value="">{placeholder ?? tr('— сонгоогүй —')}</option>
          )}
          {f.codes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
      ) : (
        <input
          className={d.input}
          value={value}
          disabled={disabled}
          inputMode={f.kind === 'number' ? 'decimal' : undefined}
          maxLength={f.length ?? undefined}
          placeholder={placeholder}
          onChange={(ev) => onChange(ev.target.value)}
        />
      )}
      {hint}
      {err && <span className={d.fErr}>{err}</span>}
    </label>
  );
}

export function DedButetsEdit({
  layerId, oid, geometry, canEdit, onDone, onCancel, docked = false, extra, geomRev = 0, onDirty,
}: {
  layerId: string;
  /** БАЙГАА мөрийн дугаар. `null` бол ШИНЭ объект үүсгэх горим. */
  oid: number | null;
  /**
   * Шинэ объектын геометр — `__esri.Geometry.toJSON()`-ы үр дүн
   * (`spatialReference`-ээ агуулсан). Засах горимд хэрэглэгдэхгүй.
   */
  geometry?: unknown;
  canEdit: boolean;
  /**
   * Амжилттай хадгалсны дараа — хэдэн талбар бичигдсэн ба ЮУГ БУЦААХ вэ.
   */
  onDone: (changed: number, undo: UndoInfo | null) => void;
  onCancel: () => void;
  /**
   * БАРУУН САМБАР дотор эсэх. Дээрх толгой-г үз — зөвхөн зохиомжийн
   * биш, ЗАН ТӨЛВИЙН ялгаа (backdrop, Escape, гадуур товшилт).
   */
  docked?: boolean;
  /**
   * Маягтын ДООР нэмэх хэсэг — хэлбэр засах, устгах зэрэг ГЕОМЕТРИЙН
   * үйлдлүүд. Эдгээрийг ЭНД биш ДУУДАГЧ талд байлгасан шалтгаан:
   * тэдгээр нь `SketchViewModel`-тэй ажилладаг бөгөөд түүний төлөв
   * (`reshape`, `reshaped`) нь газрын зурагтай хамт `DedButets`-д амьдардаг.
   * Энд зөөвөл маягт газрын зургийн төлөвийг мэддэг болж, хоёр модуль
   * салшгүй холбогдоно.
   */
  extra?: ReactNode;
  /**
   * ГЕОМЕТР БИЧИГДСЭН тоолуур (`DedButets.geomRev`) — өсөхөд `before`-ийн
   * ЗӨВХӨН `Shape__*` талбаруудыг дахин уншина (доорх эффект).
   */
  geomRev?: number;
  onDirty?: () => void;
}) {
  /** Шинэ объект үүсгэж байна уу (эсвэл байгааг засаж байна уу) */
  const isNew = oid == null;
  const [meta, setMeta] = useState<LayerMeta | null>(null);
  const [before, setBefore] = useState<Row | null>(null);
  const [p, setP] = useState<Patch | null>(null);
  const [load, setLoad] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [fail, setFail] = useState('');
  const [unsure, setUnsure] = useState(false);
  const dirty = useRef(false);
  /** Амжилттай хадгалалтын тоолуур — маягт нээлттэй үлдвэл мөрийг дахин татна (2026-09-21) */
  const [saved, setSaved] = useState(0);
  const [auto, setAuto] = useState('');
  /** Геодезийн урт (м) — Web Mercator/газарзүйн давхаргад геометрээс (проекцолсонд `null`) */
  const [geoLen, setGeoLen] = useState<number | null>(null);
  /** Геодезийн талбай (м²) — `geoLen`-ийн ижил дүрэм */
  const [geoArea, setGeoArea] = useState<number | null>(null);
  const onDirtyRef = useRef(onDirty);
  useSyncRef(onDirtyRef, onDirty);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoad(true); setFail(''); setErr({}); setUnsure(false);
    setBefore(null);
    setP(null);
    setAuto('');
    setGeoLen(null);
    setGeoArea(null);
    dirty.current = false;
    (async () => {
      const m = await loadLayerMeta(layerId);
      const row = oid == null ? null : await loadRow(m, oid);
      return { m, row };
    })()
      .then(({ m, row }) => {
        if (!alive) return;
        setMeta(m);
        if (oid == null) {
          const p0 = emptyPatch(m);
          const lf = lenFieldOf(m, layerId);
          const len = lf ? geomLengthM(geometry) : null;
          if (lf && len != null) {
            p0[lf.f.name] = lenFieldValue(len, lf.unit, !!lf.f.int);
            setAuto(lf.f.name);
          }
          setP(p0);
          return;
        }
        if (!row) { setFail(tr('Объект олдсонгүй.')); return; }
        setBefore(row);
        setP(rowToPatch(m, row));
      })
      .catch((e) => alive && setFail(userError(e)))
      .finally(() => alive && setLoad(false));
    return () => { alive = false; };
  }, [layerId, oid, saved, geometry]);

  const lastRev = useRef(geomRev);
  useEffect(() => {
    if (geomRev === lastRev.current) return;
    lastRev.current = geomRev;
    if (oid == null) return;
    let alive = true;
    loadLayerMeta(layerId)
      .then(async (m) => ({ m, row: await loadRow(m, oid) }))
      .then(async ({ m, row }) => {
        if (!alive || !row) return;
        setBefore((b) => (b ? { ...b, [GEOM_LEN]: row[GEOM_LEN], [GEOM_AREA]: row[GEOM_AREA] } : b));
        const lf = lenFieldOf(m, layerId);
        if (!lf) return;
        const len = await serverLenM(m, oid, row);
        if (!alive || len == null) return;
        if (measureKind(m.wkid) !== 'planar') setGeoLen(len);
        const v = lenFieldValue(len, lf.unit, !!lf.f.int);
        setP((x) => (x && x[lf.f.name] !== v ? { ...x, [lf.f.name]: v } : x));
        setAuto(lf.f.name);
        dirty.current = true;
        onDirtyRef.current?.();
      })
      .catch(() => { /* хуучин урт үлдэнэ — маягтыг эвдэхгүй */ });
    return () => { alive = false; };
  }, [geomRev, layerId, oid]);

  useEffect(() => {
    if (!meta || oid == null || measureKind(meta.wkid) === 'planar') return;
    let alive = true;
    loadGeometry(meta, oid)
      .then((g) => {
        if (!alive || !g) return;
        setGeoLen(geomLengthM(g));
        setGeoArea(geomAreaM2(g));
      })
      .catch(() => { /* мэдэгдэхгүй — «—» */ });
    return () => { alive = false; };
  }, [meta, oid, saved]);

  const set = (name: string, v: string) => {
    dirty.current = true;
    if (name === auto) setAuto('');
    setP((x) => (x ? { ...x, [name]: v } : x));
    setErr((x) => ({ ...x, [name]: '' }));
    setFail('');
    setAskClose(false);
  };

  /**
   * ХААХЫН ӨМНӨХ АСУУЛТ — маягт дотор мөр («Тийм»/«Үгүй»).
   */
  const [askClose, setAskClose] = useState(false);
  const objKey = `${layerId}:${oid ?? 'new'}`;
  const [askFor, setAskFor] = useState(objKey);
  if (askFor !== objKey) {
    setAskFor(objKey);
    setAskClose(false);
  }

  const tryClose = useCallback(() => {
    if (busy) return;
    if (dirty.current) { setAskClose(true); return; }
    onCancel();
  }, [busy, onCancel]);

  /**
   * Esc-ээр хаагдана — цонх нээгээд гарах товч хайх шаардлагагүй.
   */
  useEffect(() => {
    if (docked) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') tryClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tryClose, docked]);

  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, !docked);

  const submit = async () => {
    if (!meta || !p) return;
    if (!isNew && !before) return;
    const e = isNew ? validateRow(meta, p) : validateChanged(meta, before as Row, p);
    setErr(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true); setFail('');
    try {
      if (isNew) {
        const newOid = await createRow(meta, geometry, p);
        statusValsChanged(layerId);
        onDone(1, { kind: 'add', oid: newOid });
        return;
      }
      const back = revertAttrs(meta, before as Row, p);
      const wrote = diffRow(meta, before as Row, p);
      const n = await saveRow(meta, oid as number, before as Row, p);
      if (n > 0) statusValsChanged(layerId);
      dirty.current = false;
      onDone(n, n > 0 ? { kind: 'attr', oid: oid as number, attrs: back, wrote } : null);
      setSaved((x) => x + 1);
    } catch (x) {
      if (isNew && isLostResponse(x)) {
        setUnsure(true);
        setFail('');
        return;
      }
      setFail(userError(x));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Геометрийн урт (м) — уртын талбарын доор зөрүүг харуулахад.
   */
  const geomLen = isNew
    ? geomLengthM(geometry)
    : geoLen ?? (meta && measureKind(meta.wkid) !== 'planar' ? null : before ? numOf(before[GEOM_LEN]) : null);
  const geomArea = geoArea ?? (meta && measureKind(meta.wkid) !== 'planar' ? null : before ? numOf(before[GEOM_AREA]) : null);

  const qtyDef = LAYER_BY_ID[layerId]?.qty ?? null;
  const field = (f: FieldDef) => {
    const unit = f.kind === 'number' ? lenFieldUnit(f.name, qtyDef) : null;
    const lenHint = unit != null && geomLen != null;
    const fromGeom = lenHint ? lenFieldValue(geomLen, unit, !!f.int) : '';
    return (
      <FieldInput
        key={f.name}
        f={f}
        value={p?.[f.name] ?? ''}
        err={err[f.name]}
        disabled={!canEdit || busy}
        onChange={(v) => set(f.name, v)}
        hint={lenHint && (
          <span className={d.fHint}>
            {tr('Геометрийн бодит урт: {0} м', num(geomLen, 1))}
            {auto === f.name && <> · <b>{tr('геометрээс бөглөв')}</b></>}
            {canEdit && (p?.[f.name] ?? '') !== fromGeom && (
              <>
                {' '}
                <button
                  type="button"
                  className={d.lenBtn}
                  disabled={busy}
                  onClick={() => { set(f.name, fromGeom); setAuto(f.name); }}
                  title={tr('Уртын талбарыг геометрийн уртаар бөглөнө')}
                >
                  {tr('Урт ← геометр')}
                </button>
              </>
            )}
          </span>
        )}
      />
    );
  };

  const body = (
      <>
        <div className={d.modalHead}>
          <span className={d.modalTitle}>{meta?.title ?? tr('Дэд бүтцийн объект')}</span>
          <span className={d.modalNo}>{isNew ? tr('шинэ') : `#${oid}`}</span>
          <button type="button" className={d.close} onClick={tryClose}
            disabled={busy} aria-label={tr('Хаах')}>✕</button>
        </div>

        {load ? (
          <Loading />
        ) : !meta || !p || (!isNew && !before) ? (
          <p className={d.modalMsg}>{fail || tr('Объект олдсонгүй.')}</p>
        ) : (
          <>
            <div className={d.form}>
              {/* ЗАСАГДАХГҮЙ — таних тэмдэг ба геометрээс гарах хэмжээ. */}
              <dl className={d.ro}>
                <dt>{tr('Объектын дугаар')}</dt>
                <dd>{isNew ? tr('хадгалахад олгогдоно') : oid}</dd>
                {geomLen != null && (
                  <>
                    <dt>{tr('Геометрийн урт')}</dt>
                    <dd>{geomLen < 1000 ? `${num(geomLen, 1)} ${tr('м')}` : `${km(geomLen, 2)} ${tr('км')}`}</dd>
                  </>
                )}
                {geomArea != null && (
                  <>
                    <dt>{tr('Геометрийн талбай')}</dt>
                    <dd>{num(geomArea, 1)} {tr('м²')}</dd>
                  </>
                )}
              </dl>

              {meta.fields.length === 0 ? (
                <p className={d.modalMsg}>
                  {tr('Энэ давхаргад засагдах атрибут байхгүй.')}
                </p>
              ) : (
                meta.fields.map(field)
              )}
              {isNew && (
                <p className={d.fHint}>
                  {tr('Бөглөөгүй талбар нь үйлчилгээний анхдагч утгаа авна.')}
                </p>
              )}

              {!isNew && !meta.canUpdate && (
                <div className={d.formErr} role="alert">
                  {tr('Энэ давхарга засварыг зөвшөөрөхгүй байна')}
                </div>
              )}
              {isNew && !meta.canCreate && (
                <div className={d.formErr} role="alert">
                  {tr('Энэ давхарга шинэ объект нэмэхийг зөвшөөрөхгүй байна')}
                </div>
              )}
              {fail && <div className={d.formErr} role="alert">{fail}</div>}
            </div>

            {extra}

            {unsure && (
              <div className={d.askRow} role="alert">
                <span className={d.askMsg}>
                  {tr('Серверээс хариу ирсэнгүй — объект нэмэгдсэн эсэх ТОДОРХОЙГҮЙ. Дахин нэмэхээс өмнө газрын зургийг шинэчилж, объект үүссэн эсэхийг шалгана уу.')}
                </span>
                <button type="button" className={d.btn} onClick={() => setUnsure(false)} disabled={busy}>
                  {tr('Шалгасан — үүсээгүй, дахин нэмэх')}
                </button>
              </div>
            )}

            {/* Самбарын асуулт — `askClose`-ийн тайлбар */}
            {askClose && (
              <div className={d.askRow} role="group" aria-live="assertive">
                <span className={d.askMsg}>{tr('Хадгалаагүй өөрчлөлт байна. Хаах уу?')}</span>
                <button type="button" className={d.primary} onClick={onCancel} disabled={busy}>
                  {tr('Тийм')}
                </button>
                <button type="button" className={d.btn} onClick={() => setAskClose(false)} disabled={busy}>
                  {tr('Үгүй')}
                </button>
              </div>
            )}

            <div className={d.actions}>
              <span className={d.spacer} />
              <button type="button" className={d.btn} onClick={tryClose} disabled={busy}>
                {docked ? tr('Хаах') : tr('Болих')}
              </button>
              <button type="button" className={d.primary} onClick={submit}
                disabled={busy || !canEdit || unsure
                  || (isNew ? !meta.canCreate : !meta.canUpdate || meta.fields.length === 0)}>
                {busy ? tr('Хадгалж байна…') : isNew ? tr('Нэмэх') : tr('Хадгалах')}
              </button>
            </div>
          </>
        )}
      </>
  );

  if (docked) return <aside className={d.pane}>{body}</aside>;

  return (
    <div className={d.backdrop} role="dialog" aria-modal="true" onClick={tryClose}>
      <div ref={modalRef} className={d.modal} onClick={(e) => e.stopPropagation()}>{body}</div>
    </div>
  );
}
