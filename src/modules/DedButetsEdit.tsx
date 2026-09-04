'use client';

/**
 * ДЭД БҮТЦИЙН ОБЪЕКТЫН АТРИБУТ ЗАСАХ — маягт.
 *
 * ⚠️ БҮТЭЦ нь `GazarEdit.tsx`-ийг ДАГАНА (тэр нь `ZovshoorolEdit`-ээс гарсан
 * репогийн маягтын жишиг): ноорог нэг объектод, `dirty` ref, талбар тус
 * бүрийн алдаа + сэрвэрийн нэг мөр, Escape ба backdrop-оор хаах, `busy` үед
 * бүх товч идэвхгүй.
 *
 * ⚠️ ЯЛГАА — ТАЛБАРУУД ТОГТМОЛ БИШ. `GazarEdit` нь нэг үйлчилгээний мэдэгдэж
 * буй 5 баганыг гараар зурдаг; энд 16 давхарга ӨӨР ӨӨР схемтэй тул маягт
 * `loadLayerMeta`-гийн буцаасан талбарын жагсаалтаар БАЙГУУЛАГДАНА. Шинэ
 * багана нэмэгдвэл маягтад өөрөө гарч ирнэ, код засах шаардлагагүй.
 *
 * ⚠️ АМЖИЛТГҮЙ БОЛ МАЯГТ ХААГДАХГҮЙ. Сүлжээ унасан үед хаагдвал бичсэн зүйл
 * алдагдана; хэрэглэгч дахин бичихээс өөр аргагүй болно.
 *
 * ⚠️ ХОЁР ГОРИМ: `oid` өгвөл БАЙГАА мөрийг засна, өгөхгүй бол
 * (`geometry` заавал) ШИНЭ объект үүсгэнэ — ArcGIS Experience Builder-ийн
 * editor-ын «зурж нэмээд маягт бөглөх» урсгал (хэрэглэгчийн хүсэлт,
 * 2026-09-02). Хоёр горим НЭГ маягт хуваалцана: талбарын жагсаалт, шалгуур,
 * алдааны дүрэм ижил тул хоёр файл болговол аль нэг нь чимээгүй хоцорно.
 *
 * ⚠️ ГЕОМЕТРЭЭС ГАРАХ ХЭМЖЭЭ (`Shape__Length`) ЗАСАГДАХГҮЙ — үйлчилгээ өөрөө
 * `editable: false` гэж хэлдэг. Идэвхгүй `input` болговол «яагаад бичиж
 * болохгүй байна» гэсэн асуулт төрөх тул ТОДОРХОЙЛОЛТ (`<dl>`) хэлбэрээр
 * үзүүлнэ (`GazarEdit`-ийн «Талбай»-тай ижил шийдэл).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { km, num } from '@/lib/format';
import type { Row } from '@/lib/query';
import {
  createRow, emptyPatch, loadLayerMeta, loadRow, revertAttrs, rowToPatch,
  saveRow, validateRow,
  type FieldDef, type LayerMeta, type Patch,
} from '@/lib/butetsEdit';

/**
 * ХАДГАЛСНЫ ДАРАА БУЦААХАД хэрэгтэй мэдээлэл.
 *
 * ⚠️ Буцаалтыг ЭНД бэлдэх нь чухал: хуучин утгууд зөвхөн маягтын дотор
 * (`before`) байдаг бөгөөд маягт хаагдмагц алга болно. Дуудагч тал дараа нь
 * үйлчилгээнээс дахин уншиж «хуучин утга»-г сэргээх боломжгүй — тэр үед
 * ШИНЭ утга л тэнд байх болно.
 */
export type UndoInfo =
  | { kind: 'add'; oid: number }
  | { kind: 'attr'; oid: number; attrs: Record<string, unknown> };
import d from './dedButets.module.css';

/**
 * ГЕОМЕТРЭЭС ГАРАХ СИСТЕМИЙН ХЭМЖЭЭ — толгойн тодорхойлолтод.
 * ⚠️ Эдгээр нь `meta.readOnly`-д ирдэг ч жагсаалтаар нь зурвал «Shape__Length»
 *    гэсэн техникийн нэр гарна; хүн уншихаар нэрлээд НЭГЖТЭЙ нь харуулна.
 */
const GEOM_LEN = 'Shape__Length';
const GEOM_AREA = 'Shape__Area';

/**
 * ГАРААР БИЧИГДСЭН УРТЫН талбарууд — эдгээр нь порталын БҮХ уртын нийлбэрийн
 * эх сурвалж (`LayerDef.qty.field = 'urt_m'`).
 *
 * ⚠️ Хориглоогүй, ХАРИН геометрийн бодит уртыг хажууд нь бичнэ: гараар өөр тоо
 * тавибал каталогийн багана, «Дэд бүтэц»-ийн км, «Эрсдэлийн загвар»-ын
 * хохирлын үнэлгээ гурвуулаа дагаж зөрнө. Хэрэглэгч зөрүүг ХАРААД шийднэ.
 */
const LEN_FIELD = /^(urt_m|urt_km|length_km)$/i;

const numOf = (v: unknown): number | null => {
  const x = Number(v);
  return v != null && v !== '' && Number.isFinite(x) ? x : null;
};

export function DedButetsEdit({
  layerId, oid, geometry, canEdit, onDone, onCancel,
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
   * ⚠️ `undo` нь `null` байж болно: юу ч өөрчлөгдөөгүй бол буцаах зүйл алга.
   */
  onDone: (changed: number, undo: UndoInfo | null) => void;
  onCancel: () => void;
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
  const dirty = useRef(false);

  /**
   * ⚠️ СХЕМ БА МӨРИЙГ ЭНД ТАТНА. Газрын зургийн `onPick` нь давхаргын
   * `outFields`-д ачаалагдсан талбарыг л буцаадаг тул түүгээр маягт нээвэл
   * зарим талбар хоосон харагдаж, хадгалахад ЖИНХЭНЭ утгыг нь дарж бичих
   * эрсдэлтэй (`GazarEdit`-ийн ижил шалтгаан).
   */
  useEffect(() => {
    let alive = true;
    setLoad(true); setFail(''); setErr({});
    /**
     * ⚠️ ХУУЧИН МӨРИЙГ ЗААВАЛ ЦЭВЭРЛЭНЭ. `before` нь ЗӨВХӨН амжилттай
     * уншилтад бичигддэг тул цэвэрлэхгүй бол өмнөх объектын мөр үлдэнэ:
     * нэг объект зассаны ДАРАА шинэ объект зурахад (`oid == null`) толгойн
     * «Геометрийн урт» нь ӨМНӨХ объектын уртыг харуулж, хэрэглэгч зурсан
     * зүйлийнхээ хэмжээг буруу уншина.
     */
    setBefore(null);
    setP(null);
    dirty.current = false;
    (async () => {
      const m = await loadLayerMeta(layerId);
      /* ⚠️ Шинэ объектод татах мөр БАЙХГҮЙ — схем л хэрэгтэй */
      const row = oid == null ? null : await loadRow(m, oid);
      return { m, row };
    })()
      .then(({ m, row }) => {
        if (!alive) return;
        setMeta(m);
        if (oid == null) {
          /* ⚠️ `before` нь `null` хэвээр — `diffRow` дуудагдахгүй, шинэ мөр
             нь `createRow`-оор бүтнээрээ бичигдэнэ. */
          setP(emptyPatch(m));
          return;
        }
        if (!row) { setFail(tr('Объект олдсонгүй.')); return; }
        setBefore(row);
        setP(rowToPatch(m, row));
      })
      .catch((e) => alive && setFail(String((e as Error).message || e)))
      .finally(() => alive && setLoad(false));
    return () => { alive = false; };
  }, [layerId, oid]);

  const set = (name: string, v: string) => {
    dirty.current = true;
    setP((x) => (x ? { ...x, [name]: v } : x));
    setErr((x) => ({ ...x, [name]: '' }));
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
    if (!meta || !p) return;
    if (!isNew && !before) return;
    const e = validateRow(meta, p);
    setErr(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true); setFail('');
    try {
      if (isNew) {
        const newOid = await createRow(meta, geometry, p);
        /* ⚠️ Шинэ объектод «хэдэн талбар бичигдсэн» гэдэг утгагүй — НЭГ МӨР
           нэмэгдсэн гэдгийг 1-ээр дамжуулна (дуудагч тал давхаргаа дахин
           уншуулах эсэхээ үүгээр шийднэ). */
        onDone(1, { kind: 'add', oid: newOid });
        return;
      }
      /* ⚠️ Буцаах утгуудыг БИЧИХЭЭС ӨМНӨ бэлдэнэ — дараа нь `before` нь
         хуучирсан хуулбар болох ч энэ объект аль хэдийн салангид. */
      const back = revertAttrs(meta, before as Row, p);
      const n = await saveRow(meta, oid as number, before as Row, p);
      onDone(n, n > 0 ? { kind: 'attr', oid: oid as number, attrs: back } : null);
    } catch (x) {
      /* ⚠️ Маягт ХААГДАХГҮЙ — бичсэн зүйл үлдэнэ */
      setFail(String((x as Error).message || x));
    } finally {
      setBusy(false);
    }
  };

  /** Геометрийн урт (м) — уртын талбарын доор зөрүүг харуулахад */
  const geomLen = before ? numOf(before[GEOM_LEN]) : null;
  const geomArea = before ? numOf(before[GEOM_AREA]) : null;

  const field = (f: FieldDef) => {
    const v = p?.[f.name] ?? '';
    const e = err[f.name];
    const lenHint = LEN_FIELD.test(f.name) && geomLen != null;
    return (
      <label className={d.f} key={f.name}>
        <span className={d.fLabel}>{f.alias}</span>
        {f.codes ? (
          <select className={d.input} value={v} disabled={!canEdit || busy}
            onChange={(ev) => set(f.name, ev.target.value)}>
            {/* ⚠️ Хоосон сонголт нь ЗӨВХӨН nullable талбарт — эс бөгөөс
                шаардлагатай талбарыг санамсаргүй хоослох зам нээгдэнэ. */}
            {f.nullable && <option value="">{tr('— сонгоогүй —')}</option>}
            {f.codes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        ) : (
          <input
            className={d.input}
            value={v}
            disabled={!canEdit || busy}
            /* ⚠️ `type="text"` САНААТАЙ — `type="number"` нь хөтөч бүрд өөр
               бөөрөнхийлж, аравтын таслалыг чимээгүй иддэг. Шалгалт нь
               `validateRow`-д (`Number.isFinite`). */
            inputMode={f.kind === 'number' ? 'decimal' : undefined}
            maxLength={f.length ?? undefined}
            onChange={(ev) => set(f.name, ev.target.value)}
          />
        )}
        {lenHint && (
          <span className={d.fHint}>
            {tr('Геометрийн бодит урт: {0} м', num(geomLen, 1))}
          </span>
        )}
        {e && <span className={d.fErr}>{e}</span>}
      </label>
    );
  };

  return (
    <div className={d.backdrop} role="dialog" aria-modal="true" onClick={tryClose}>
      <div className={d.modal} onClick={(e) => e.stopPropagation()}>
        <div className={d.modalHead}>
          <span className={d.modalTitle}>{meta?.title ?? tr('Дэд бүтцийн объект')}</span>
          <span className={d.modalNo}>{isNew ? tr('шинэ') : `#${oid}`}</span>
          <button type="button" className={d.close} onClick={tryClose}
            disabled={busy} aria-label={tr('Хаах')}>✕</button>
        </div>

        {load ? (
          <p className={d.modalMsg}>{tr('Ачаалж байна…')}</p>
        ) : !meta || !p || (!isNew && !before) ? (
          <p className={d.modalMsg}>{fail || tr('Объект олдсонгүй.')}</p>
        ) : (
          <>
            <div className={d.form}>
              {/* ЗАСАГДАХГҮЙ — таних тэмдэг ба геометрээс гарах хэмжээ.
                  ⚠️ Шинэ объектод дугаар БАЙХГҮЙ (сервер оноодог) бөгөөд
                  геометрийн хэмжээ ч сервер дээр л бодогдоно — тиймээс
                  «зурсан» гэдгийг л хэлнэ. */}
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

              {/* ⚠️ Үйлчилгээ засварыг зөвшөөрөхгүй бол ЭНД шууд хэлнэ —
                  хэрэглэгч бөглөж дуусаад хадгалах дарж байж мэдэх нь хожуу. */}
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

            <div className={d.actions}>
              <span className={d.spacer} />
              <button type="button" className={d.btn} onClick={tryClose} disabled={busy}>
                {tr('Болих')}
              </button>
              {/* ⚠️ ШИНЭ объектод `fields.length === 0` нь саад БИШ: атрибутгүй
                  давхаргад ч геометр нэмэх нь утгатай. Засах горимд харин
                  бөглөх зүйлгүй тул товч хаалттай. */}
              <button type="button" className={d.primary} onClick={submit}
                disabled={busy || !canEdit
                  || (isNew ? !meta.canCreate : !meta.canUpdate || meta.fields.length === 0)}>
                {busy ? tr('Хадгалж байна…') : isNew ? tr('Нэмэх') : tr('Хадгалах')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
