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
import { dateTime, num } from '@/lib/format';
import { PARCEL_LEFT, PARCEL_STATUS_HUES } from '@/lib/services';
import {
  STATUS_LIST, loadFieldLens, loadParcel, loadProgressValues, saveParcel, validateParcelChanged,
  type FieldLens, type Parcel, type ParcelPatch,
} from '@/lib/parcelEdit';
import g from './gazar.module.css';
import { userError } from '@/components/ui';

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
   * ⚠️ 2026-10-01: урьд нь баганын тоо байв (`saveParcel`-ийн ⚠️).
   */
  onDone: (changed: number) => void;
  onCancel: () => void;
  /**
   * ⚠️ «Хадгалаагүй өөрчлөлт байна уу» гэдгийг ЭЦЭГТ мэдэгдэнэ
   *    (2026-09-15-ны хэрэглээний аудит).
   *
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
  /* ⚠️ 2026-10-05: текст талбарын дээд урт — метадатагаас (`parcelEdit.loadFieldLens`) */
  const [lens, setLens] = useState<FieldLens>({});
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: татах эффект — түлхүүр солигдоход ачаалж буй/өмнөх төлөвийг синхрон тэглээд шинээр татна; render үед гаргавал бүтэц өөрчлөгдөнө
    setLoad(true); setFail('');
    /* ⚠️ 2026-10-06 (аудит): ӨМНӨХ ПАРСЕЛИЙН ноорог/тугийг ТЭГЛЭНЭ
       (`DedButetsEdit`-ийн адил). Урьд нь `oid` солигдоход `before`/`d`/`dirty`
       үлдэж, Б парсел ачаалагдаж чадаагүй бол маягт А-г харуулсаар
       «Хадгалах» нь А руу бичдэг, хуучин `dirty=true` нь хуурамч «хадгалаагүй»
       асуулт гаргадаг байв. Эцэг (`Gazar`) нь `key={editOid}`-ээр мөн дахин
       mount хийдэг — энэ нь давхар хамгаалалт. Эцгийн туг (`onDirty`) нь
       `Gazar.askDrop`/`closeEdit` дотор `markDirty(false)`-ээр аль хэдийн
       унтардаг тул энд дахин дуудахгүй. */
    setBefore(null); setD(null); setErr({});
    dirty.current = false;
    Promise.all([loadParcel(oid), loadProgressValues().catch(() => [] as string[]), loadFieldLens()])
      .then(([p, list, ln]) => {
        if (!alive) return;
        setLens(ln);
        if (!p) { setFail(tr('Нэгж талбар олдсонгүй.')); return; }
        setBefore(p);
        setD(patchOf(p));
        /* ⚠️ Одоогийн утга жагсаалтад байхгүй бол НЭМНЭ — бохир бичиглэл
           (арын зайтай) сонголтоос унавал хадгалахад чимээгүй өөрчлөгдөнө. */
        setOpts(p.progress && !list.includes(p.progress) ? [p.progress, ...list] : list);
      })
      .catch((e) => alive && setFail(userError(e)))
      .finally(() => alive && setLoad(false));
    return () => { alive = false; };
  }, [oid]);

  const set = (k: keyof ParcelPatch, v: string) => {
    dirty.current = true;
    /* ⚠️ Эцэгт МЭДЭГДЭНЭ — `Gazar.exitEdit` энэ тугаар баталгаа асууна */
    onDirty?.(true);
    setD((p) => (p ? { ...p, [k]: v } : p));
    setErr((p) => ({ ...p, [k]: undefined }));
    setFail('');
  };

  const tryClose = useCallback(() => {
    if (busy) return;
    if (dirty.current && !window.confirm(tr('Хадгалаагүй өөрчлөлт байна. Хаах уу?'))) return;
    /* ⚠️ Хаяхаар шийдсэн тул тугийг унтраана — эцэг дахин асуух ёсгүй */
    dirty.current = false;
    onDirty?.(false);
    onCancel();
  }, [busy, onCancel, onDirty]);

  /* Esc-ээр хаагдана — цонх нээгээд гарах товч хайх шаардлагагүй */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') tryClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tryClose]);

  /*
   * ⚠️ Нийтлээгүй засвартай байхад таб ХААХАД/дахин ачаалахад хөтөч
   *    анхааруулна. `tryClose` нь зөвхөн МОДАЛ хаах үед асуудаг тул F5,
   *    таб хаах, буцах товчинд бөглөсөн маягт ЧИМЭЭГҮЙ алдагддаг байв
   *    (2026-09-02 аудит). Finance · Huvaari · FillNew · Pivot · UserAdmin
   *    бүгд ийм хамгаалалттай — эдгээр маягт л гацсан байсан.
   * ⚠️ `dirty` нь ref тул render дахин хийгддэггүй. Тиймээс сонсогчийг
   *    БАЙНГА бүртгэж, дотроос нь ref-ээ уншина: `dirty.current`-ыг deps-д
   *    тавьбал өөрчлөлт мэдрэгдэхгүй.
   */
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const submit = async () => {
    if (!before || !d) return;
    /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ЗӨВХӨН өөрчилсөн талбар шалгагдана —
       хуучин/танигдахгүй төлөвтэй мөрийн эзэмшигч, хаягийг засахад хөндөөгүй
       төлөвөөс болж хадгалалт хаагддаг байв (`validateParcelChanged`). */
    const e = validateParcelChanged(before, d, lens);
    setErr(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true); setFail('');
    try {
      const n = await saveParcel(before, d);
      /* ⚠️ Хадгалагдмагц тугийг УНТРААНА — эс бөгөөс горимоос гарахад
         «хадгалаагүй өөрчлөлт байна» гэж ХУДАЛ асууна */
      dirty.current = false;
      onDirty?.(false);
      onDone(n);
    } catch (x) {
      /* ⚠️ Маягт ХААГДАХГҮЙ — бичсэн зүйл үлдэнэ */
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
                {/* ⚠️ 2026-10-01: ArcGIS Editor Tracking — давхаргад асаалттай үед л
                    (`parcelEdit.loadEditFields`). Утга алга бол мөр ОГТ гарахгүй:
                    «—» нь «хэн ч засаагүй» гэж худал уншигдана. Зөвхөн СҮҮЛИЙН
                    засвар — түүх биш (үйлчилгээ өөрөө түүх хадгалдаггүй). */}
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
                  maxLength={lens.owner}
                  onChange={(e) => set('owner', e.target.value)} />
                {err.owner && <span className={g.fErr}>{err.owner}</span>}
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
                {err.status ? <span className={g.fErr}>{err.status}</span>
                  /* ⚠️ 2026-10-01: хуучин/танигдахгүй утга аль ч товчинд таарахгүй тул
                     «юу ч сонгогдоогүй» харагдана — хөндөхгүй бол ХЭВЭЭР үлдэхийг хэлнэ
                     (`validateParcelChanged`). */
                  : before.status && d.status === before.status && !STATUS_LIST.includes(before.status)
                    ? <span className={g.fHint}>
                      {tr('Одоогийн утга «{0}» жагсаалтад байхгүй — сонгохгүй бол хэвээр үлдэнэ', before.status)}
                    </span>
                    : null}
              </div>

              {/* ⚠️ 2026-09-21: `status` ба `progress` НЭГ талбар (`явцы_1`) бол
                  ЭНЭ хяналтыг харуулахгүй — «Төлөв» радио нь бүх 9 амьд утгыг
                  агуулдаг (`STATUS_LIST`), хоёр хяналт нэг талбарт зэрэг бичвэл
                  аль нь хадгалагдах нь хэрэглэгчид мэдэгдэхгүй (`diffParcel`). */}
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
                  maxLength={lens.address}
                  onChange={(e) => set('address', e.target.value)} />
                {err.address && <span className={g.fErr}>{err.address}</span>}
              </label>

              <label className={g.f}>
                <span className={g.fLabel}>{tr('Тайлбар (дэлгэрэнгүй)')}</span>
                <textarea className={`${g.input} ${g.area}`} value={d.note}
                  disabled={!canEdit || busy}
                  maxLength={lens.note}
                  onChange={(e) => set('note', e.target.value)} />
                {err.note && <span className={g.fErr}>{err.note}</span>}
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
