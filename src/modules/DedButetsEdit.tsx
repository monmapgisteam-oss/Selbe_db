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
 * ⚠️ ХОЁР БАЙРЛАЛ (2026-09-14, хэрэглэгч: «ArcGIS Experience Builder-ийн edit
 * widget шиг»): `docked` үед БАРУУН САМБАР дотор, үгүй бол ТӨВИЙН цонх.
 *
 * ⚠️ САМБАР нь зөвхөн «илүү жижиг цонх» БИШ — зарчмын ялгаа нь ГАЗРЫН ЗУРАГ
 * НЭЭЛТТЭЙ ҮЛДЭНЭ. Тиймээс: (1) backdrop БАЙХГҮЙ (байвал зураг дарагдана),
 * (2) Escape нь ХААХГҮЙ (самбар нь горимын байнгын хэсэг, түр цонх биш;
 * Escape дарахад зурсан дүрс цуцлагдах ёстой), (3) гадуур товшиход
 * хаагдахгүй — зураг дээр ажиллах нь энгийн үйлдэл.
 *
 * ⚠️ ГЕОМЕТРЭЭС ГАРАХ ХЭМЖЭЭ (`Shape__Length`) ЗАСАГДАХГҮЙ — үйлчилгээ өөрөө
 * `editable: false` гэж хэлдэг. Идэвхгүй `input` болговол «яагаад бичиж
 * болохгүй байна» гэсэн асуулт төрөх тул ТОДОРХОЙЛОЛТ (`<dl>`) хэлбэрээр
 * үзүүлнэ (`GazarEdit`-ийн «Талбай»-тай ижил шийдэл).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useSyncRef } from '@/lib/useSyncRef';
import { km, num } from '@/lib/format';
import { LAYER_BY_ID } from '@/lib/services';
import type { Row } from '@/lib/query';
import {
  createRow, emptyPatch, loadGeometry, loadLayerMeta, loadRow, revertAttrs, rowToPatch,
  isLostResponse, saveRow, validateChanged, validateRow,
  type FieldDef, type LayerMeta, type Patch,
} from '@/lib/butetsEdit';
import { geomAreaM2, geomLengthM, lenFieldUnit, lenFieldValue, measureKind } from '@/lib/butetsLen';

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
  | { kind: 'attr'; oid: number; attrs: Record<string, unknown> }
  /** Олон мөрийн засвар (`DedButetsBatch`) — мөр бүр ӨӨРИЙН хуучин утгатай */
  | { kind: 'batch'; rows: { oid: number; attrs: Record<string, unknown> }[] };
import d from './dedButets.module.css';
import { userError } from '@/components/ui';

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
/* ⚠️ 2026-10-01: `LEN_FIELD` → `butetsLen.lenFieldUnit` (нэр + давхаргын `qty.field`, нэгжтэй нь) */

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
 *
 * ⚠️ 2026-09-16-нд маягтын доторх `field()`-ээс ЭКСПОРТ болгон гаргав:
 * олон мөрийн маягт (`DedButetsBatch`) ЯГ ижил оролт зурах ёстой — хуулбар
 * бичвэл домэйн, тоон оролт, уртын хязгаарын дүрэм хоёр газарт зөрж хоцорно
 * (файлын толгойн «нэг маягт» зарчим).
 *
 * ⚠️ `type="text"` САНААТАЙ — `type="number"` нь хөтөч бүрд өөр бөөрөнхийлж,
 * аравтын таслалыг чимээгүй иддэг. Шалгалт нь `validateRow`-д.
 *
 * ⚠️ `placeholder` нь олон мөрийн маягтад «бүү хөндө» гэдгийг хэлдэг — дан
 * маягт өгөхгүй.
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
          {/* ⚠️ Хоосон сонголт нь ЗӨВХӨН nullable талбарт — эс бөгөөс
              шаардлагатай талбарыг санамсаргүй хоослох зам нээгдэнэ.
              Олон мөрийн маягтад (`placeholder` өгсөн) хоосон = «бүү хөндө»
              тул ҮРГЭЛЖ байна. */}
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
   * ⚠️ `undo` нь `null` байж болно: юу ч өөрчлөгдөөгүй бол буцаах зүйл алга.
   */
  onDone: (changed: number, undo: UndoInfo | null) => void;
  onCancel: () => void;
  /**
   * БАРУУН САМБАР дотор эсэх. Дээрх толгойн ⚠️-г үз — зөвхөн зохиомжийн
   * биш, ЗАН ТӨЛВИЙН ялгаа (backdrop, Escape, гадуур товшилт).
   */
  docked?: boolean;
  /**
   * Маягтын ДООР нэмэх хэсэг — хэлбэр засах, устгах зэрэг ГЕОМЕТРИЙН
   * үйлдлүүд. ⚠️ Эдгээрийг ЭНД биш ДУУДАГЧ талд байлгасан шалтгаан:
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
  /**
   * ⚠️ 2026-10-01: маягт ӨӨРӨӨ утга бичсэн (хэлбэр засварын дараа уртыг геометрээс
   *    бөглөсөн) — оролтын `onChange` дамжихгүй тул эцэг (`DedButets.formDirty`) мэдэхгүй
   *    байх байв; «хадгалаагүй» асуулт ажиллахын тулд дуудна.
   */
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
  /**
   * ⚠️ 2026-10-05: «Нэмэх»-ийн ХАРИУ АЛДАГДСАН (timeout/сүлжээ) — объект үүссэн эсэх
   *    тодорхойгүй. Урьд нь маягт идэвхтэй үлдэж, дахин дарахад объект ДАВХАРДДАГ байв.
   *    `true` үед «Нэмэх» хаалттай; хэрэглэгч газрын зураг дээр шалгаад өөрөө нээнэ.
   */
  const [unsure, setUnsure] = useState(false);
  const dirty = useRef(false);
  /** Амжилттай хадгалалтын тоолуур — маягт нээлттэй үлдвэл мөрийг дахин татна (2026-09-21) */
  const [saved, setSaved] = useState(0);
  /**
   * ⚠️ 2026-10-01: геометрээс АВТОМАТААР бөглөгдсөн уртын талбарын нэр — доор нь «геометрээс
   *    бөглөв» гэж ил хэлнэ (хэрэглэгч гараар бичээгүй утгыг өөрийнх гэж андуурахгүй).
   */
  const [auto, setAuto] = useState('');
  /** Геодезийн урт (м) — Web Mercator/газарзүйн давхаргад геометрээс (проекцолсонд `null`) */
  const [geoLen, setGeoLen] = useState<number | null>(null);
  /** Геодезийн талбай (м²) — `geoLen`-ийн ижил дүрэм */
  const [geoArea, setGeoArea] = useState<number | null>(null);
  const onDirtyRef = useRef(onDirty);
  useSyncRef(onDirtyRef, onDirty);

  /**
   * ⚠️ СХЕМ БА МӨРИЙГ ЭНД ТАТНА. Газрын зургийн `onPick` нь давхаргын
   * `outFields`-д ачаалагдсан талбарыг л буцаадаг тул түүгээр маягт нээвэл
   * зарим талбар хоосон харагдаж, хадгалахад ЖИНХЭНЭ утгыг нь дарж бичих
   * эрсдэлтэй (`GazarEdit`-ийн ижил шалтгаан).
   */
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: татах эффект — түлхүүр солигдоход ачаалж буй/өмнөх төлөвийг синхрон тэглээд шинээр татна; render үед гаргавал бүтэц өөрчлөгдөнө
    setLoad(true); setFail(''); setErr({}); setUnsure(false);
    /**
     * ⚠️ ХУУЧИН МӨРИЙГ ЗААВАЛ ЦЭВЭРЛЭНЭ. `before` нь ЗӨВХӨН амжилттай
     * уншилтад бичигддэг тул цэвэрлэхгүй бол өмнөх объектын мөр үлдэнэ:
     * нэг объект зассаны ДАРАА шинэ объект зурахад (`oid == null`) толгойн
     * «Геометрийн урт» нь ӨМНӨХ объектын уртыг харуулж, хэрэглэгч зурсан
     * зүйлийнхээ хэмжээг буруу уншина.
     */
    setBefore(null);
    setP(null);
    setAuto('');
    setGeoLen(null);
    setGeoArea(null);
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
          const p0 = emptyPatch(m);
          /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ШИНЭ ШУГАМЫН уртын талбарыг зурсан
             геометрээс АВТОМАТААР бөглөнө (геодезийн — зурсан дүрс Web Mercator). Урьд нь
             хоосон үлдэж, km-ийн KPI-д «уртгүй объект» болж ордог байв. Хэрэглэгч засаж болно. */
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
    /* ⚠️ 2026-10-01: `geometry` — ШИНЭ зурсан дүрс бүр шинэ маягт (уртыг тэр дүрсээс бөглөнө).
       Байгаа объектод `undefined` тул нөлөөгүй; эцэг нь `pick`-ийг ижил лавлагаатай барина. */
  }, [layerId, oid, saved, geometry]);

  /**
   * ⚠️ 2026-09-29 (аудит 10): ХЭЛБЭР хадгалсан / буцаасны дараа `before`-ийн
   * `Shape__Length/Area` хуучирч, `urt_m`-ийн доорх «Геометрийн бодит урт» нь
   * ХУУЧИН уртыг харуулдаг байв. Мөрийг дахин татаж ЗӨВХӨН `Shape__*`-ийг
   * солино — `p` (хадгалаагүй оролт) ба `dirty`-г ХӨНДӨХГҮЙ. Дээрх ачаалах
   * эффектийг ашиглавал бичсэн оролт дарагдана.
   * ⚠️ `lastRev` — `layerId`/`oid` солигдоход энэ эффект ажиллахгүй (тэр үед
   * дээрх эффект бүтэн мөрийг аль хэдийн татна).
   */
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
        /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ХЭЛБЭР өөрчлөгдсөний дараа уртын талбарыг
           ШИНЭ геометрээс бөглөнө (хадгалахгүй — хэрэглэгч «Хадгалах» дарна). Урьд нь
           `Urt_m` хуучин уртаараа үлдэж km-ийн KPI зөрдөг байв. Маягтыг «хадгалаагүй»
           болгож эцэгт мэдэгдэнэ (`onDirty`). */
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

  /**
   * ⚠️ 2026-10-01: Web Mercator/газарзүйн давхаргад `Shape__Length` нь ХАВТГАЙ Web Mercator
   *    урт (энэ өргөрөгт ~1.49 дахин их) — геометрийг татаж ГЕОДЕЗИЙН урт/талбайг бодно
   *    (`Shape__Area` ч мөн ~2.2 дахин их). Проекцолсон (UTM) давхаргад сүлжээнд залгахгүй.
   */
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
  }, [meta, oid]);

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
   *
   * ⚠️ 2026-09-23: `window.confirm` хөтчид хаагдсан үед үргэлж `false`
   * буцаан бөглөсөн маягт ХААГДАХГҮЙ гацдаг байв (`DedButets.confirmQ`-ийн
   * ижил сургамж). Асуулт самбарт гарна; талбар засвал арилна.
   */
  const [askClose, setAskClose] = useState(false);
  /* ⚠️ 2026-09-29 (аудит 10): маягт `key`-гүй тул объект солигдоход `askClose`
     үлдэж, Б объектын ЦЭВЭР маягт «Хадгалаагүй өөрчлөлт байна» гэж нээгддэг
     байв. Объект солигдоход рендерийн үед тэглэнэ («өмнөх prop» хэв —
     эффект доторх синхрон setState-ийг lint хориглодог). */
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
   *
   * ⚠️ САМБАРЫН горимд БҮРТГЭГДЭХГҮЙ: тэнд Escape нь газрын зургийн
   * зураалтыг цуцлах зориулалттай бөгөөд самбар нь горимын байнгын хэсэг тул
   * санамсаргүй хаагдвал бөглөж байсан маягт алга болно.
   */
  useEffect(() => {
    if (docked) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') tryClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tryClose, docked]);

  const submit = async () => {
    if (!meta || !p) return;
    if (!isNew && !before) return;
    /* ⚠️ 2026-09-30: байгаа мөрт ЗӨВХӨН өөрчилсөн талбар (`validateChanged`-ийн тайлбар) */
    const e = isNew ? validateRow(meta, p) : validateChanged(meta, before as Row, p);
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
      /* ⚠️ 2026-09-21: эцэг `onDone`-д маягтыг хаадаг ч хэрэглэгч хадгалаагүй
         хэлбэрийн засвараа хаяхаас татгалзвал (`DedButets.closeEdit` → `false`)
         маягт НЭЭЛТТЭЙ үлдэнэ. Тэр үед `before` хуучирч (дараагийн хадгалалт
         буруу diff бичнэ), `dirty` нь худал «хадгалаагүй» асуулт гаргана.
         Тиймээс бичсэний дараа ноорог цэвэр гэж тэмдэглээд мөрийг дахин
         татна (`saved` тоолуур ачаалах эффектийг сэргээнэ); маягт салсан бол
         эдгээр setState нь хор хөнөөлгүй. */
      dirty.current = false;
      onDone(n, n > 0 ? { kind: 'attr', oid: oid as number, attrs: back } : null);
      setSaved((x) => x + 1);
    } catch (x) {
      /* ⚠️ Маягт ХААГДАХГҮЙ — бичсэн зүйл үлдэнэ */
      /* ⚠️ 2026-10-05: шинэ объектын хариу алдагдсан бол дахин илгээхийг хаана (`unsure`) */
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
   * ⚠️ 2026-10-01: SR-ээр (`serverLenM`-ийн дүрэм): шинэ объектод зурсан геометрээс
   *    (геодезийн), Web Mercator давхаргад геодезийн (`geoLen`), UTM-д `Shape__Length`.
   */
  const geomLen = isNew
    ? geomLengthM(geometry)
    : geoLen ?? (meta && measureKind(meta.wkid) !== 'planar' ? null : before ? numOf(before[GEOM_LEN]) : null);
  const geomArea = geoArea ?? (meta && measureKind(meta.wkid) !== 'planar' ? null : before ? numOf(before[GEOM_AREA]) : null);

  /* ⚠️ 2026-09-30: давхаргын УРТЫН талбар (`LayerDef.qty.field`) — `LEN_FIELD` нь зөвхөн
     `urt_m`/`urt_km`/`length_km`-ийг таньдаг тул `Length_m`, `Length_metr`, `Shugam_Urt`
     талбартай 12 шугам давхаргад «Геометрийн бодит урт» зөрүүний сануулга гардаггүй байв. */
  const qtyDef = LAYER_BY_ID[layerId]?.qty ?? null;
  const field = (f: FieldDef) => {
    /* ⚠️ 2026-10-01: уртын талбар ба нэгж — `butetsLen.lenFieldUnit` (км талбарт км-ээр бөглөнө) */
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
            {/* ⚠️ «Урт ← геометр» — талбарыг геометрийн уртаар (талбарын нэгжээр) дарж бичнэ */}
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

  /**
   * ⚠️ БҮРХҮҮЛ нь хоёр өөр, ДОТОР нь ИЖИЛ. Хуулбарлаж хоёр салангид маягт
   * бичих сонголт байсан ч татгалзсан: талбарын жагсаалт, шалгуур, алдааны
   * дүрэм, хадгалах урсгал бүгд ижил тул нэгийг засахад нөгөө нь хоцорно.
   */
  const body = (
      <>
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

            {/* ⚠️ ГЕОМЕТРИЙН үйлдлүүд — дуудагч талаас (дээрх `extra`-гийн
                тайлбарыг үз). Хадгалах товчнуудын ДЭЭР: тэдгээр нь өөр
                объектод биш ЭНЭ мөрөнд үйлчилдэг тул маягтын үргэлжлэл. */}
            {extra}

            {/* ⚠️ 2026-10-05: хариу алдагдсан «Нэмэх» — `unsure`-ийн тайлбар */}
            {unsure && (
              <div className={d.askRow} role="alertdialog">
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
              <div className={d.askRow} role="alertdialog">
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
              {/* ⚠️ ШИНЭ объектод `fields.length === 0` нь саад БИШ: атрибутгүй
                  давхаргад ч геометр нэмэх нь утгатай. Засах горимд харин
                  бөглөх зүйлгүй тул товч хаалттай. */}
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

  /* ⚠️ САМБАР — `role="dialog"`-гүй: энэ нь модаль БИШ, горимын байнгын
     хэсэг. `aria-modal` тавибал дэлгэц уншигч газрын зургийг «ард нь далд»
     гэж зарлаж, зурагтай ажиллах боломжийг нуух болно. */
  if (docked) return <aside className={d.pane}>{body}</aside>;

  return (
    <div className={d.backdrop} role="dialog" aria-modal="true" onClick={tryClose}>
      <div className={d.modal} onClick={(e) => e.stopPropagation()}>{body}</div>
    </div>
  );
}
