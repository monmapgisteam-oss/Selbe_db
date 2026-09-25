'use client';

/**
 * ДЭД БҮТЭЦ — инженерийн шугам сүлжээ ГАЗРЫН ЗУРАГ ДЭЭР, баруунд жагсаалт:
 *
 *   ┌────────────────────────────┬──────────────────┐
 *   │ Толгойн үзүүлэлт (4)        │ ГЭРЭЭНИЙ БАГЦ     │
 *   ├────────────────────────────┤ «Дэд бүтэц»       │
 *   │ Газрын зураг                │ 24 багц           │
 *   │ Давхарга · 2D/3D · Бүс      │                  │
 *   │ Мэдээлэл засах              │                  │
 *   └────────────────────────────┴──────────────────┘
 *
 * ⚠️ ЗҮҮН «Одоогийн сүлжээ» БАГАНА ХАСАГДСАН (2026-09-02, хэрэглэгчийн
 * хүсэлт). ЕТ-ийн 16 шугам (`et:*`) нь зурагт АНХНААСАА асаалттай хэвээр
 * бөгөөд каталогоос удирдагдана — зөвхөн ТУСДАА жагсаалт нь хэрэггүй байв.
 *
 * ⚠️ ЕТ-ийн шугам (`et:*`) ба ГЭРЭЭНИЙ БАГЦ (`pkg:*`) хоёрыг НЭГ жагсаалтад
 * нийлүүлж БОЛОХГҮЙ: нэг дулааны шугам хоёр өөр эх сурвалжид өөр өөр
 * геометртэй байдаг тул уртыг нь нэмбэл давхардана
 * (`services.ts` §pkgNet-ийн ижил анхааруулга).
 *
 * ⚠️ ЖАГСААЛТЫН ХЭЛБЭР нь «Гүйцэтгэл» харагдацынхтай (`PkgProg.TsPackList`)
 * ЯГ ИЖИЛ — хураагддаг `Section` + `List`/`ListItem`, «N багц · зурагт
 * харагдах давхарга» гэсэн тайлбартай (хэрэглэгчийн хүсэлт, 2026-09-02).
 * ЯЛГАА нь ЗӨВХӨН УТГАД: тэнд дэд бүтцийн биет явцын өгөгдөл байхгүй тул
 * «—» гардаг бол энд давхаргын УРТ бий.
 *
 * ⚠️ Урт нь БҮГД `usePlanTotals`-аас — каталогийн багана, «Ерөнхий мэдээлэл»-ийн
 * нийлбэртэй ЯГ ИЖИЛ эх сурвалж. Энд дахин тоолвол хоёр цонх өөр дүн харуулна.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools, MapToolBtn } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import {
  dropTotalsCache, retryTotals, usePlanTotals, usePlanTotalsLive,
  type LiveTotals, type Totals,
} from '@/lib/totals';
import { PackLayers, Swatch } from '@/components/PackLayers';
import { List, ListItem, Note, Section, Stat, Stats } from '@/components/ui';
import {
  CATALOG_LAYER_IDS, DED_BUTETS_LAYER_IDS, INFRA_SYSTEMS, LAYER_BY_ID, OID,
  PKG_FAMILY_BY_BAGTS,
} from '@/lib/services';
import { buildPacks, type Pack } from './Bagts';
import { km, num } from '@/lib/format';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { butetsScope, canEditButetsLayer, hasButetsRole, subscribeButetsAcl } from '@/lib/butetsAcl';
import { BUTETS_PACKS, PACK_OF_LAYER } from '@/lib/butetsPacks';
import { useAuth } from '@/components/AuthGate';
import { DedButetsEdit, type UndoInfo } from './DedButetsEdit';
import { DedButetsBatch } from './DedButetsBatch';
import {
  applyAttrs, cachedOidField, deleteRow, loadGeometry, loadLayerMeta, queryOidsIn, revertRows,
  saveGeometry,
} from '@/lib/butetsEdit';


import o from './dedButetsOv.module.css';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import d from './dedButets.module.css';

/* ══════════════════ ОДООГИЙН СҮЛЖЭЭ — ЕТ-ийн шугам ══════════════════ */

/**
 * ИНЖЕНЕРИЙН СИСТЕМҮҮД — `services.ts`-ийн `INFRA_SYSTEMS`-ээс ШУУД.
 *
 * ⚠️ Урьд нь энд 16 `et:*` id ГАРААР жагсаагдсан байсан бөгөөд `services.ts`-д
 * `DED_BUTETS_LAYER_IDS` гэсэн ХУУЛБАР нь бас байв. Хоёр нь зөрөхөөс
 * сэргийлэх dev-шалгуур доор бичигдсэн байсан нь яг тэр давхардлын шинж.
 * 2026-09-11-нд `INFRA_TABLE` (73 давхарга) руу шилжихэд хоёуланг нь НЭГ
 * эх сурвалж болгов — шалгуур нь одоо утгагүй ч хэвээр (хоосон зөрүү).
 */
const SYSTEMS = INFRA_SYSTEMS;

/**
 * Зүүн баганын БҮХ давхарга — нийлбэрийн хүсэлт ба зургийн суурьт.
 *
 * ⚠️ `services.ts`-ийн `DED_BUTETS_LAYER_IDS` нь `VIEWS.dedButets`-ийн
 * `layers`/`initial`-ыг тэжээдэг ЭХ СУРВАЛЖ; дээрх `SYSTEMS` нь түүнийг
 * ЗӨВХӨН БҮЛЭГЛЭНЭ. Хоёулаа тааруулж байгаа эсэхийг dev-д шалгана — шугам
 * нэмээд бүлэгт нь оруулахаа мартвал зурагт гарах ч жагсаалтад орохгүй байна.
 */
const NET_IDS = SYSTEMS.flatMap((s) => s.ids);

if (process.env.NODE_ENV !== "production") {
  const miss = DED_BUTETS_LAYER_IDS.filter((id) => !NET_IDS.includes(id));
  const extra = NET_IDS.filter((id) => !DED_BUTETS_LAYER_IDS.includes(id));
  if (miss.length || extra.length) {
    console.warn(
      "[selbe] DedButets: SYSTEMS ба DED_BUTETS_LAYER_IDS зөрж байна —"
      + ` бүлэгт ороогүй: ${miss.join(", ") || "—"};`
      + ` жагсаалтад алга: ${extra.join(", ") || "—"}`,
    );
  }
}

/**
 * ДАВХАРГЫН ГЕОМЕТР → `SketchViewModel`-ийн хэрэгсэл.
 *
 * ⚠️ Давхаргын бүртгэлээс (`LayerDef.geom`) уншина — үйлчилгээ рүү нэмэлт
 * хүсэлт явуулахгүй. Маягт нээгдэхдээ `loadLayerMeta` нь СЕРВЕРИЙН
 * `geometryType`-аар дахин шалгадаг тул хоёр эх сурвалж зөрвөл шинэ объект
 * үүсэхгүй, алдаа ил гарна.
 */
const DRAW_OF: Record<string, 'point' | 'polyline' | 'polygon'> = {
  point: 'point',
  line: 'polyline',
  area: 'polygon',
};

/* ══════════════════ ГЭРЭЭНИЙ БАГЦ — «Дэд бүтэц» ангилал ══════════════════ */

/**
 * ДЭД БҮТЦИЙН 24 БАГЦ — «Гүйцэтгэл»-ийн (`PkgProg`) «Дэд бүтэц» бүлэгтэй ЯГ
 * ИЖИЛ олонлог: блокгүй (`kind: 'infra'`) багцаас нийгмийн барилга (`soc`) ба
 * өндөржилт (`site`)-ийг хасна → үлдэх нь net · pow · src · com.
 *
 * ⚠️ ГАРААР ЖАГСААХГҮЙ — `buildPacks(null)` нь `PKG_BY_BAGTS`-ээс угсардаг тул
 * шинэ багц нэмэгдэхэд энэ жагсаалт өөрөө дагана. Хуулбарлавал «Гүйцэтгэл»
 * 24, энд 23 багц харуулах өдөр ирнэ.
 *
 * ⚠️ `buildPacks(null)` нь БАРИЛГЫН багцыг хоосон буцаана (блокийн мөр
 * дамжуулаагүй) — ямар ч сүлжээний хүсэлт явахгүй, цэвэр тооцоо.
 */
const INFRA_PACKS: Pack[] = buildPacks(null).filter((x) => {
  if (x.kind !== 'infra') return false;
  const fam = PKG_FAMILY_BY_BAGTS[x.key];
  return fam !== 'soc' && fam !== 'site';
});

/**
 * БОХИРЫН ХУДГИЙН давхаргууд — KPI-д.
 *
 * ⚠️ 2026-09-14 ЗАСВАР: урьд нь `cntOf(t, "et:3")` гэж НЭГ хуучин
 * давхаргаас уншдаг байв. Инженерийн дата `Test0911S` руу шилжсэнээр тэр id
 * нь энэ хуудсын нийлбэрийн жагсаалтад (`TOTAL_IDS`) ОРОХОО БОЛЬСОН тул
 * `cntOf` нь 0 буцааж, «Бохирын худаг» үзүүлэлт ТЭГ харагдаж байлаа —
 * алдаа нь чимээгүй, учир нь 0 бол хүчинтэй тоо шиг харагдана.
 *
 * ⚠️ ГАРААР ЖАГСААХГҮЙ — нэрээр нь олно. Шинэ багц нэмэгдэхэд (Багц 5.5 …)
 * жагсаалт өөрөө дагана. Давхаргын дугаар нь үйлчилгээ өөрчлөгдөхөд
 * шилждэг тул `infra:1` гэж бичих нь хамгийн эмзэг сонголт байх байв.
 */
/*
 * ⚠️ 2026-09-16 ЗАСВАР: шүүлт нь КИРИЛЛ regex байв (`/^Багц .*· Бохир худаг$/`).
 * Гэтэл `LAYER_BY_ID[id].title` нь `services.ts`-д МОДУЛЬ АЧААЛАХ ҮЕД `tr()`-ээр
 * орчуулагддаг тул en горимд «Package 5.1 · sewer chambers» болж, regex НЭГ Ч
 * давхаргатай таарахгүй → `WELL_IDS = []` → KPI чимээгүй ТЭГ. Яг 9 сарын 14-ний
 * `cntOf(t, "et:3")` алдааны давталт. Одоо суффиксийг `tr()`-ЭЭР ЗОХИОНО —
 * толинд орчуулга нь нэгэн ижил тул аль ч хэлэнд таарна.
 */
const WELL_SUFFIX = `· ${tr('Бохир худаг')}`;
const WELL_IDS = DED_BUTETS_LAYER_IDS.filter((id) =>
  (LAYER_BY_ID[id]?.title ?? '').endsWith(WELL_SUFFIX),
);

if (process.env.NODE_ENV !== 'production' && WELL_IDS.length === 0) {
  console.warn(
    "[selbe] DedButets: «Бохир худаг» давхарга олдсонгүй — KPI тэг харагдана."
    + " Нэр өөрчлөгдсөн бол WELL_IDS-ийн шүүлтийг шинэчил.",
  );
}

/** Багцуудын БҮХ давхарга — нийлбэрийн хүсэлтэд */
const PKG_IDS = [...new Set(INFRA_PACKS.flatMap((x) => x.layerIds))];

/** Хоёр баганын нийлбэрийг НЭГ хүсэлтийн багцаар (`usePlanTotals`) */
const TOTAL_IDS = [...new Set([...NET_IDS, ...PKG_IDS])];

/* ══════════════════ Туслах ══════════════════ */

/**
 * ДАВХАРГЫН OID НЭР — товшилт, тодруулга, олон сонголтод.
 *
 * ⚠️ 2026-09-24: урьд нь `LAYER_BY_ID[id].oid ?? OID` (бүртгэл) байсан бол
 *    бичилт (`butetsEdit`) нь серверийн `objectIdField`-ээр явдаг — зөрвөл
 *    буруу мөр засагдана. Дараалал: (1) кэшлэгдсэн серверийн схем,
 *    (2) товшсон атрибутын `objectid`/`fid` түлхүүр, (3) бүртгэл, (4) `OID`.
 *    Синхрон — `useCallback` доторх товшилтод хүлээлт байхгүй; схем нь
 *    `pickTemplate`/товшилтын урьдчилсан `loadLayerMeta`-аар кэшид ирнэ.
 */
const oidFieldOf = (id: string, a?: Record<string, unknown> | null): string =>
  cachedOidField(id)
  ?? (a ? Object.keys(a).find((k) => /^(objectid|fid)$/i.test(k)) : undefined)
  ?? LAYER_BY_ID[id]?.oid
  ?? OID;

/**
 * УРТААР ХЭМЖИГДЭХ ШУГАМ давхаргууд — км-ийн KPI-д ЗӨВХӨН эдгээр орно.
 *
 * ⚠️ 2026-09-25: урьд нь `sumOf` нь жагсаалтын БҮХ id-г нэмдэг байв. Цэгэн
 *    давхарга (`infra:53/55/57/59` ХТП/РП — `qtyField: null`) хэмжээгүй тул
 *    `q: null` буцааж нийлбэрийг бүхэлд нь `null` болгож «Инженерийн шугам —
 *    нийт» ба «Гэрээний багцын шугам» мөнхөд «…» дээр гацдаг байсан; талбай
 *    давхаргын м² (ДХТ, дулааны худаг, Багц 18-ын эх үүсвэр) нь «Үүнээс
 *    дулаан хангамж»-ийн МЕТР дээр нэмэгдэж км болон гардаг байв.
 * ⚠️ Хэмжээгүй давхаргыг «мэдэгдэхгүй» гэж тооцохгүй — ЖАГСААЛТААС хасна:
 *    тэдгээр нь уртад хамаарах хэмжилт огт биш.
 */
const isLenLayer = (id: string): boolean => {
  const L = LAYER_BY_ID[id];
  return L?.geom === 'line' && (L.qty?.unit === 'м' || L.qty?.unit === 'км');
};

/**
 * Давхаргын урт (м) — татагдаагүй/хэмжээгүй бол `null` (`Totals.q`-ийн дүрэм: null ≠ 0).
 * ⚠️ `км` нэгжтэй давхаргыг МЕТР болгоно — `km()` нь метр хүлээдэг.
 * ⚠️ ОБЪЕКТГҮЙ давхарга (`n === 0`) — SUM нь `null` ирдэг ч «мэдээлэлгүй» БИШ:
 *    объект байхгүй бол урт нь жинхэнэ 0 (хэмжилт). Эс бөгөөс хоосон ганц
 *    давхарга бүх км KPI-г «…» дээр гацаана.
 */
const lenOf = (t: Map<string, Totals>, id: string): number | null => {
  const r = t.get(id);
  if (!r) return null;
  if (r.q == null) return r.n === 0 ? 0 : null;
  return LAYER_BY_ID[id]?.qty?.unit === 'км' ? r.q * 1000 : r.q;
};

/** Давхаргын тоо — татагдаагүй бол 0 */
const cntOf = (t: Map<string, Totals>, id: string) => t.get(id)?.n ?? 0;

/**
 * БАГЦЫН НИЙЛБЭР — БҮГД ирсэн үед л тоо, эс бөгөөс `null`.
 *
 * ⚠️ `null` нь «хараахан мэдэгдэхгүй», 0 нь «хэмжилт тэг». Хоёрыг нэгтгэвэл
 * ачаалж байх зуур «0.0 км» гэж гарч, хэрэглэгч түүнийг бодит дүн гэж
 * уншина (порталын `null ≠ 0` дүрэм).
 */
/* ⚠️ ХООСОН жагсаалт → `null` (2026-09-23): багц хуваарилагдаагүй аккаунтад
   `ids = []` бөгөөд `reduce`-ийн эхлэл 0 нь «0.0 км» гэсэн худал хэмжилт
   гаргадаг байв. Харах давхаргагүй бол хэмжилт ч байхгүй — «—». */
const sumOf = (t: LiveTotals, ids: string[]): number | null =>
  ids.length === 0 ? null : ids.reduce<number | null>(
    (a, id) => {
      if (a == null) return null;
      /* ⚠️ Гишүүн нь `null` (SUM мэдээлэлгүй) бол нийлбэр ч мэдээлэлгүй — 0 гэж нэмэхгүй */
      const q = lenOf(t.map, id);
      return q == null ? null : a + q;
    },
    0,
  );

/** Багцын тоон нийлбэр — `sumOf`-ийн ижил дүрмээр */
const countOf = (t: LiveTotals, ids: string[]): number | null =>
  ids.length === 0 ? null : ids.reduce<number | null>(
    (a, id) => (a == null ? null : (t.map.has(id) ? a + cntOf(t.map, id) : null)),
    0,
  );

/** Хүлээж буй утгын тэмдэг — тоо биш тул `num` форматаас ГАДУУР */
const WAIT = "…";
/* ⚠️ Хоосон id жагсаалт нь хүлээлт БИШ — «—» (мэдээлэлгүй), «…» биш */
/* ⚠️ `settled` (2026-09-25) — бүх давхарга ирсэн (эсвэл унасан) хойно `null` нь
   хүлээлт БИШ, «мэдээлэлгүй» («—»). Урьд нь `…` мөнхөд үлдэж, явцын мөр
   алга болсон тул гацсан уу, ачаалж байна уу гэдэг нь ялгагдахгүй байв. */
const kmOrWait = (m: number | null, empty = false, settled = false) =>
  (empty ? '—' : m == null ? (settled ? '—' : WAIT) : km(m, 1));
const cntOrWait = (n: number | null, empty = false) => (empty ? '—' : n == null ? WAIT : num(n));



/**
 * ЖАГСААЛТЫН СОНГОЛТ — зурагт юу үлдэхийг ЭНЭ ГАНЦ төлөв шийднэ.
 *
 * ⚠️ Урьд нь бүлгийн гарчиг `setVisible`-ыг шууд хөнддөг байв — тэр нь
 * хэрэглэгчийн КАТАЛОГИЙН сонголт бөгөөд жагсаалт дарах бүрд бохирдож,
 * «яагаад миний асаасан давхарга унтарсан бэ» гэсэн асуулт төрүүлдэг
 * (`Gazar.mapVisible`-ийн ижил тэмдэглэл). Одоо сонголт нь ЗӨВХӨН ГАРАЛТ
 * дээр давхарлагдана — дахин дарахад каталогийн байдал бүрэн сэргэнэ.
 */
type Sel = { key: string; ids: string[] };

export function DedButets({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /**
   * Баруун баганын өргөн — чирж тохируулна, хөтөчид хадгалагдана.
   *
   * ⚠️ ЗҮҮН БАГАНАГҮЙ (2026-09-02, хэрэглэгчийн хүсэлт: «Одоогийн сүлжээ» хас).
   * Түлхүүрийг ӨӨРЧИЛСӨН (`dedButets2`) — хуучин түлхүүрт хадгалагдсан
   * `--side-l` нь одоо байхгүй баганад өргөн олгож, зураг нарийсгах байв.
   */
  const side = useSideResize('dedButets2');
  const [layerOpen, setLayerOpen] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const { setHighlight, refreshLayer } = useMap();

  /**
   * ЗАСВАРЫН ГОРИМ — «Мэдээлэл засах» товчоор асна.
   *
   * ⚠️ ГОРИМТОЙ БОЛГОСОН ШАЛТГААН нь «Газар чөлөөлөлт»-ийнхтэй ИЖИЛ: газрын
   *    зураг дээр товших нь энэ харагдацад ердийн үйлдэл (объект хармаар
   *    байх). Товшилт бүрд маягт нээвэл зүгээр л зураг харж байгаа хүнд саад
   *    болно. Горим асаалттай үед л товшилт маягт нээнэ.
   */
  const [editMode, setEditMode] = useState(false);
  /* ⚠️ `dropTotalsLater` нь callback-ийн deps-гүй байх ёстой (засвар бүрийн
     зам дээр дуудагддаг) тул горимыг ref-ээр уншина. */
  const editModeRef = useRef(false);
  editModeRef.current = editMode;
  /**
   * Маягт нээлттэй объект.
   *
   * ⚠️ `oid: null` нь ШИНЭ объект (зурсан геометртэй); тоо бол байгаа мөр.
   * Хоёр төлөв НЭГ талбарт байгаа нь санаатай: маягт нэг зэрэг ЗӨВХӨН НЭГ
   * объектод нээгдэнэ, хоёр талбар байвал хоёулаа дүүрэх төлөв үүснэ.
   */
  const [pick, setPick] = useState<
    { layerId: string; oid: number | null; geometry?: unknown } | null
  >(null);
  const [saved, setSaved] = useState('');
  /** Мэдэгдлийн төрөл — `err` нь улаан бөгөөд ӨӨРӨӨ арилахгүй (`toast`-ийн тайлбар) */
  const [savedKind, setSavedKind] = useState<'ok' | 'err'>('ok');
  /**
   * САМБАРЫН ДОТООД БАТАЛГААЖУУЛАЛТ — `window.confirm`-ийн оронд.
   *
   * ⚠️ 2026-09-23: `window.confirm`-ийг хөтөч «энэ хуудас дахин харилцах цонх
   * гаргахыг хориглох»-оор хаасан үед ҮРГЭЛЖ `false` буцаадаг тул засварын
   * горимоос гарах, хэлбэрийн засвар хаях, устгах, буцаах бүгд ЧИМЭЭГҮЙ
   * зогсдог байв (`onMapPick`-ийн 2026-09-16-ны ижил сургамж). Одоо асуулт
   * зургийн доод буланд мөр болж гарна; «Тийм» дарахад `onYes` үргэлжлүүлнэ.
   * ⚠️ `danger` — устгал шиг буцаагдахгүй үйлдэлд «Тийм» улаан.
   */
  const [confirmQ, setConfirmQ] = useState<
    { msg: string; onYes: () => void; danger?: boolean } | null
  >(null);

  /* ── ШИНЭЭР ЗУРЖ НЭМЭХ (ArcGIS Experience Builder-ийн editor хэв) ── */

  /** Аль давхаргад нэмэх вэ — зурахаас ӨМНӨ сонгоно (тэмплэйт сонгохтой адил) */
  const [addTo, setAddTo] = useState<string>(DED_BUTETS_LAYER_IDS[0]);
  /**
   * ТЭМПЛЭЙТИЙН САМБАР нээлттэй эсэх (2026-09-14, хэрэглэгч: «Experience
   * Builder-ийн edit widget шиг»).
   *
   * ⚠️ Урьд нь 74 давхаргыг НЭГ `<select>`-ээс сонгодог байв. Тэр жагсаалт нь
   * (1) бүлэглэлгүй — дулаан, ус, бохир, цахилгаан, холбоо нь холилдсон,
   * (2) ТЭМДЭГГҮЙ — «Багц 5.1 · Дулааны өгөх» ба «… буцах» хоёрын аль нь
   * тасархай болохыг зөвхөн зурагт очиж мэднэ, (3) хайлтгүй. Одоо EB-ийн
   * «feature template» самбар шиг: системээр бүлэглэсэн, тэмдэгтэй, хайлттай.
   */
  const [tplOpen, setTplOpen] = useState(false);
  const [tplQ, setTplQ] = useState("");
  /**
   * Тэмплэйт сонгогдож, ЗУРААЛТ ЭХЭЛСЭН — хэрэглэгч дүрсээ дуусгахыг хүлээж
   * байна. ⚠️ Энэ төлөвгүй бол самбар ХООСОН харагдаж, «дараа нь юу хийх вэ»
   * гэдэг нь ойлгомжгүй болно: зураг дээр юу ч сонгогдоогүй, маягт ч алга.
   */
  const [awaitDraw, setAwaitDraw] = useState(false);
  /** Товч дарах бүрд өснө — `MapCanvas` үүгээр зураалт эхлүүлнэ */
  const [drawToken, setDrawToken] = useState(0);
  /** Зурсан дүрсийг арилгах дохио */
  const [clearToken, setClearToken] = useState(0);

  /* ── ОЛОН ОБЪЕКТ СОНГОЖ НЭГ ДОР ЗАСАХ (2026-09-16) ── */

  /**
   * «Олноор сонгох» горим — хэрэглэгчийн хүсэлт: «нэг мэдээллийн олон
   * мөрийг select хийгээд нэг бөглөхөд бүгдэд нь бичигдэх, ArcGIS Pro-гийн
   * Calculate Field шиг, гэхдээ илүү амар».
   *
   * ⚠️ ДАН МАЯГТТАЙ ЗЭРЭГ АЖИЛЛАХГҮЙ: асаалттай үед объект товших нь маягт
   * НЭЭХГҮЙ, сонголтод нэмнэ/хасна. Хоёулаа зэрэг байвал нэг товшилт хоёр
   * зүйл хийж, аль нь болсныг хэрэглэгч ялгахгүй.
   */
  const [multi, setMulti] = useState(false);
  /**
   * Сонголт — НЭГ давхаргын объектууд (хэрэглэгчийн сонголт: давхарга бүр
   * өөр схемтэй тул нэг маягт нэг давхаргыг л зурна). `layerId` нь сонголт
   * хоосон байхад ч байна: тэгш өнцөгтөөр сонгоход АЛЬ давхаргаас авахыг
   * заана (самбарын жагсаалтаас солино; объект товшиход өөрөө дагана).
   */
  const [msel, setMsel] = useState<{ layerId: string; oids: number[] }>(
    () => ({ layerId: DED_BUTETS_LAYER_IDS[0], oids: [] }),
  );
  /** Сүүлийн сонголт — async then() дотор updater-гүйгээр унших (2026-09-21) */
  const mselRef = useRef(msel);
  mselRef.current = msel;
  /** Тэгш өнцөгт татаж байна — `onSketch` үүгээр «шинэ объект»-оос ялгана */
  const [rectDraw, setRectDraw] = useState(false);
  const [mselBusy, setMselBusy] = useState(false);
  /**
   * ХАДГАЛСНЫ МЭДЭГДЭЛ — олноор засах САМБАРТ (2026-09-16, хэрэглэгчийн хүсэлт
   * «хадгалагдсан гэсэн мэдэгдэл харагддаг байя»).
   *
   * ⚠️ Маягтын ДОТОР БИШ САМБАРТ: хадгалсны дараа сонголт цэвэрлэгддэг тул
   * маягт (`DedButetsBatch`) салдаг — түүний доторх мэдэгдэл тэр агшинд алга
   * болно. Самбар нь `multi` үнэн байх хугацаанд амьд тул мэдэгдэл үлдэнэ.
   *
   * Дараагийн сонголт эхлэхэд арилна.
   */
  const [mselOk, setMselOk] = useState('');

  /* ── ХЭЛБЭР (vertex) ЗАСАХ ── */

  /**
   * ⚠️ «АТРИБУТ / ХЭЛБЭР» ГЭСЭН ХОЁР ТАБ ХАСАГДСАН (2026-09-14).
   *
   * Тэднийг салгасан анхны шалтгаан нь ЗӨВХӨН зохиомжийнх байв: маягт нь
   * дэлгэцийн ТӨВД модаль цонх байсан тул vertex-ийн бариулуудыг бүрхэж,
   * чирэх хөдөлгөөн цонхны ард үлддэг байлаа. Маягт БАРУУН САМБАР болсноор
   * тэр саад арилсан: сонгосон объектын атрибут ба бариул ЗЭРЭГ харагдана —
   * яг Experience Builder-ийн edit widget шиг.
   *
   * Одоо урсгал нь: объект дарах → самбарт маягт → хүсвэл «Хэлбэр засах».
   * Горим сонгох алхам ОГТ байхгүй.
   */
  /** Хэлбэрийг нь засаж буй объект */
  const [reshape, setReshape] = useState<
    { layerId: string; oid: number; geometry: unknown } | null
  >(null);
  /** Чирсний дараах шинэ геометр — хадгалаагүй бол `null` */
  const [reshaped, setReshaped] = useState<unknown>(null);
  const [reshapeToken, setReshapeToken] = useState(0);
  const [geomBusy, setGeomBusy] = useState(false);
  /** Устгал явж байна — маягтын бүх товч түгжигдэнэ */
  const [delBusy, setDelBusy] = useState(false);
  /** Зураалтын нэг алхам буцаах дохио (`SketchViewModel.undo`) */
  const [sketchUndoToken, setSketchUndoToken] = useState(0);

  /* ── ҮЙЛДЭЛ БУЦААХ ── */

  /**
   * СҮҮЛИЙН БИЧИГДСЭН үйлдлийг буцаах мэдээлэл.
   *
   * ⚠️ ЗӨВХӨН НЭГ АЛХАМ (стек БИШ) — санаатай. Олон алхмын түүх нь
   * «буцаасан зүйлээ дахин буцаах» гэсэн хүлээлт төрүүлдэг ч ArcGIS-д
   * гүйлгээний түүх байхгүй тул алхам бүр нь ШИНЭ бичилт болно: хоёр
   * хэрэглэгч зэрэг ажиллаж байхад гүнзгий буцаалт нь бусдын засварыг
   * дараалан дарна. Нэг алхам нь «сая андуурлаа» гэдгийг л засна.
   *
   * ⚠️ Горимоос гармагц цэвэрлэгдэнэ — цонх нээгээд байгаа хүн л
   * хариуцлагатай, дараа орсон хүн өмнөхийн үйлдлийг буцааж болохгүй.
   */
  const [undoable, setUndoable] = useState<
    | { kind: 'add'; layerId: string; oid: number }
    | { kind: 'attr'; layerId: string; oid: number; attrs: Record<string, unknown> }
    | { kind: 'geom'; layerId: string; oid: number; geometry: unknown }
    /* Олон мөрийн засвар — мөр бүр ӨӨРИЙН хуучин утгатай (`DedButetsBatch`) */
    | { kind: 'batch'; layerId: string; rows: { oid: number; attrs: Record<string, unknown> }[] }
    | null
  >(null);
  const [undoBusy, setUndoBusy] = useState(false);

  /**
   * ЗУРГИЙН ДООД МЭДЭГДЭЛ — 4 секундын дараа өөрөө арилна.
   *
   * ⚠️ `setSaved` рүү ШУУД бичихгүй: амжилтын мэдэгдэл хугацаатай, харин
   * алдааных нь хугацаагүй үлддэг байв — хэрэглэгч дараагийн үйлдлээ хийхэд
   * хуучин алдаа зурагт өлгөөтэй хэвээр, аль үйлдлийнх нь болох нь мэдэгдэхгүй.
   */
  /* ⚠️ Таймерыг ref-д барина: цэвэрлэхгүй үлдээвэл хэрэглэгч 4 секунд дотор өөр
     харагдац руу шилжихэд салсан бүрэлдэхүүн дээр `setSaved` дуудагдана
     (2026-09-16). Мөн дараалсан toast хуучин таймераа тэглэнэ — эс тэгвээс
     эхнийх нь хугацаа дуусахад ХОЁР ДАХЬ мэдэгдэл эрт арилна. */
  const toastTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /**
   * ⚠️ НИЙЛБЭРИЙН КЭШИЙГ ЗАСВАРЫН ГОРИМД ХОЙШЛУУЛНА (2026-09-16, гүйцэтгэл).
   *
   * `dropTotalsCache()` нь 74 давхаргын статистикийг ДАХИН татдаг —
   * хэмжсэнээр 3.2 секунд, 12 слотын дараалал бүтэн дүүрнэ. Урьд нь энэ нь
   * ЗАСВАР БҮРИЙН дараа (шинэ объект, хэлбэр, атрибут, буцаалт) ажилладаг
   * байсан: 10 объект зурахад 740 дэмий хүсэлт болж, зурах/сонгох бүх
   * үйлдэл тэр дарааллын ард хүлээдэг байв.
   *
   * ⚠️ ЯАГААД ХОЙШЛУУЛЖ БОЛОХ ВЭ: KPI самбар засварын горимд НУУГДДАГ
   * (`{!editMode && …}`) тул тэр тоог тэр агшинд ХЭН Ч ХАРАХГҮЙ. Горимоос
   * гармагц нэг удаа хаяна.
   *
   * ⚠️ ГАНЦ ТОХИОЛДОЛ: хэрэглэгч засварын горимд «Давхарга» каталогийг
   * нээвэл тэнд тоо харагдана — тэр агшинд ШУУД цэвэрлэнэ (`flushTotals`),
   * эс бөгөөс хуучин тоо ил худал болно (порталын «дутуу дүн гаргахгүй» дүрэм).
   */
  const totalsStale = useRef(false);
  const dropTotalsLater = useCallback(() => {
    if (editModeRef.current) { totalsStale.current = true; return; }
    dropTotalsCache();
  }, []);
  const flushTotals = useCallback(() => {
    if (!totalsStale.current) return;
    totalsStale.current = false;
    dropTotalsCache();
  }, []);

  /**
   * ⚠️ `kind: 'err'` (2026-09-23) — алдаа УЛААН бөгөөд 4 секундэд арилахгүй:
   * урьд нь бүх мэдэгдэл ногоон байсан тул «Хадгалагдлаа» ба серверийн алдаа
   * хоёр ижил харагдаж, алдаа нь уншигдахаас өмнө алга болдог байв. Алдаа нь
   * дараагийн мэдэгдэл, ✕ товч, эсвэл горимоос гарахад арилна.
   */
  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setSaved(msg);
    setSavedKind(kind);
    window.clearTimeout(toastTimer.current);
    if (kind === 'ok') toastTimer.current = window.setTimeout(() => setSaved(''), 4000);
  }, []);

  /**
   * ХАДГАЛААГҮЙ VERTEX ЗАСВАРЫГ ХАЯХЫГ АСУУНА.
   *
   * ⚠️ Гурван зам дээр ЗААВАЛ дуудагдана: өөр объект дарах, «Атрибут» таб руу
   * шилжих, засварын горимоос гарах. Эдгээрийн аль нэг дээр асуухаа мартвал
   * чирсэн ажил ЧИМЭЭГҮЙ алга болно — vertex зөөх нь урт, нямбай ажил тул
   * дахин хийхэд хэдэн минут алдана.
   *
   * ⚠️ 2026-09-23: `run` — ҮРГЭЛЖЛҮҮЛЭХ ажил. Хаях зүйлгүй бол ШУУД ажиллаж
   * `true` буцаана; байвал самбарын асуулт (`confirmQ`) гарч `false` буцаана,
   * «Тийм» дарахад `run` тэр үед ажиллана. `window.confirm` шиг синхрон
   * хариулт байхгүй тул дуудагч тал үргэлжлэлээ функцээр өгнө.
   */
  const askDropReshape = useCallback((run: () => void): boolean => {
    if (reshaped == null) { run(); return true; }
    setConfirmQ({ msg: tr('Хадгалаагүй хэлбэрийн засвар байна. Хаях уу?'), onYes: run });
    return false;
  }, [reshaped]);

  /**
   * МАЯГТЫН ХАДГАЛААГҮЙ ТӨЛӨВ — `DedButetsEdit`-ийн талбарт бичсэн эсэх.
   *
   * ⚠️ 2026-09-25: маягтын `dirty` нь түүний ДОТООД ref тул эцэг тал харахгүй
   *    байсан — зураг дээр хоосон газар/өөр объект товших, «Хаах», «Шинэ
   *    объект», «Олноор сонгох» бүгд бөглөсөн талбар ба ЗУРСАН дүрсийг
   *    асуултгүй хаядаг байв. Маягтын бүх оролт (`FieldInput`) DOM-ын
   *    `input`/`select`-ийн `onChange`-оор явдаг тул боосон элементийн
   *    `onChange` (React-д bubble хийдэг) үүнийг найдвартай барина.
   * ⚠️ Объект солигдох (`pickKey`) бүрд ба амжилттай хадгалсны дараа тэглэнэ —
   *    маягт өөрийн `dirty`-г яг тэр агшинд тэглэдэг.
   */
  const formDirty = useRef(false);
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const pickKey = pick ? `${pick.layerId}:${pick.oid ?? 'new'}` : '';
  useEffect(() => { formDirty.current = false; }, [pickKey]);

  /**
   * ХАДГАЛААГҮЙ МАЯГТ/ДҮРС + VERTEX ЗАСВАРЫГ ХАЯХЫГ АСУУНА (2026-09-25).
   *
   * ⚠️ `askDropReshape`-ийн ӨРГӨТГӨЛ — маягтыг ГАДНААС хаадаг замуудад
   *    (зургийн товшилт, горимын товч, «Хаах»). ШИНЭ объект (`oid == null`)
   *    нь талбар бөглөөгүй ч ЗУРСАН геометртэй тул үргэлж асууна.
   * ⚠️ `closeEdit`-д ХЭРЭГЛЭХГҮЙ: тэр нь маягтын өөрийн «Хаах» (маягт өөрөө
   *    `dirty`-гээ асуудаг — давхар асуулт болно) ба хадгалсны дараах хаалт.
   */
  const askDropUnsaved = useCallback((run: () => void): boolean => {
    const pk = pickRef.current;
    const formLost = pk != null && (pk.oid == null || formDirty.current);
    if (!formLost) return askDropReshape(run);
    setConfirmQ({ msg: tr('Хадгалаагүй маягт эсвэл зурсан дүрс байна. Хаях уу?'), onYes: run });
    return false;
  }, [askDropReshape]);

  /**
   * ГЕОМЕТР ТАТАХ ДАРААЛЛЫН ТОКЕН.
   *
   * ⚠️ Хоёр объект дараалан дарахад хоёр `loadGeometry` зэрэг явна. Сүлжээний
   * хариу дараалал нь БАТАЛГААГҮЙ тул хамгаалалтгүй бол ЭХНИЙ товшилтын
   * хожуу ирсэн геометр нь хоёр дахийг дарж, хэрэглэгч БУРУУ объектын
   * vertex-ийг зөөнө (`MapCanvas.clickSeq`-ийн ижил сургамж).
   */
  const geomSeq = useRef(0);

  /**
   * ХЭЛБЭР ЗАСАХАД БЭЛТГЭСЭН ГЕОМЕТР — маягт нээгдэх агшинд урьдчилж татна.
   *
   * ⚠️ 2026-09-16 (гүйцэтгэл): «Хэлбэр засах» дарахад геометрийн REST хүсэлт
   * шинээр явж, бариул гарах хүртэл хүлээдэг байв. Хэрэглэгч маягтыг хэдэн
   * секунд харж байдаг тул тэр хугацаанд татчихвал дарах агшин нь агшин
   * зуурын болно. Нэг объектын геометр ~2–3 КБ тул атрибут л зассан ч
   * үрэгдэл ялихгүй.
   *
   * ⚠️ Хадгалсны дараа ЗААВАЛ хүчингүй болгоно — хуучин хэлбэр рүү буцаах
   * зам үүснэ.
   */
  const preGeom = useRef<{ key: string; p: Promise<unknown | null> } | null>(null);

  const { user, status: authStatus } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  useEffect(() => subscribeButetsAcl(() => setCapN((x) => x + 1)), []);
  /**
   * ⚠️ ЗАСАХ ЭРХ ТУСДАА (`caps` → `butets`). Дэд бүтцийг ХАРАХ нь түүний
   *    хэмжээг СОЛИХ эрх биш: `urt_m` нэг тоо засахад каталогийн багана,
   *    энэ хуудасны км, «Эрсдэлийн загвар»-ын хохирлын үнэлгээ бүгд дагана.
   *
   * ⚠️ БАГЦААР ХЯЗГААРЛАГДАНА (2026-09-23, `butetsAcl.ts`). `butets` эрх нь
   *    хуудсыг нээнэ, харин АЛЬ давхаргыг засахыг `butetsScope` заана:
   *    `null` = бүгд (super), `[]` = нэг ч үгүй (fail-closed — эрхтэй ч
   *    багц хуваарилаагүй бол товч огт гарахгүй). `canEditLayer` нь давхарга
   *    бүрийн шалгуур — товшилт, тэмплэйт, олноор сонгох жагсаалт бүгд үүгээр.
   */
  const scope = useMemo(
    () => (authStatus === 'off' ? null : butetsScope(user?.username)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, authStatus, capN],
  );
  const canEdit = useMemo(
    () => authStatus === 'off'
      || (hasCap(user?.username, 'butets') && (scope === null || scope.length > 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, authStatus, capN, scope],
  );
  const canEditLayer = useCallback(
    (id: string) => authStatus === 'off' || canEditButetsLayer(user?.username, id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, authStatus, capN],
  );
  /** Засаж болох давхаргууд — тэмплэйт ба олноор сонгох жагсаалтад */
  const editableIds = useMemo(
    () => DED_BUTETS_LAYER_IDS.filter((id) => canEditLayer(id)),
    [canEditLayer],
  );

  /**
   * ХАРАХ ХҮРЭЭ (2026-09-23, хэрэглэгч: «багц бүрд тусдаа аккаунт — тухайн
   * аккаунт бусад багцыг ХАРЖ, засах боломжгүй»). Багц хуваарилагдсан
   * аккаунтад зураг · каталог · багцын жагсаалт · KPI бүгд ЗӨВХӨН өөрийн
   * багцын давхаргаар.
   *
   * ⚠️ ЗӨВХӨН БАГЦЫН АККАУНТ хязгаарлагдана (`hasButetsRole` БА `scope`
   *    жагсаалт). `butetsScope` нь үүрэггүй хүнд ч `[]` буцаадаг тул
   *    `hasButetsRole`-гүйгээр шалгавал ердийн үзэгч бүрд хуудас ХООСОН болно.
   *    Super (`scope === null`) ба үзэгч урьдын адил бүгдийг харна.
   * ⚠️ FAIL-CLOSED: ямар ч багцад хамаарахгүй давхарга (`PACK_OF_LAYER`-т
   *    байхгүй) ч нуугдана — `canEditButetsLayer`-ийн «эзэнгүй давхарга»
   *    дүрэмтэй ижил. Каталогийн БУСАД бүлэг (зам, барилга — `TOTAL_IDS`-д
   *    байхгүй) контекст тул нуугдахгүй.
   * ⚠️ `hidden === null` = хязгааргүй; `Set` = нуух давхаргууд.
   */
  const hidden = useMemo<Set<string> | null>(() => {
    if (authStatus === 'off' || scope === null || !hasButetsRole(user?.username)) return null;
    return new Set(TOTAL_IDS.filter((id) => {
      const pk = PACK_OF_LAYER[id];
      return !pk || !scope.includes(pk);
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authStatus, capN, scope]);
  const allow = useCallback((id: string) => !hidden || !hidden.has(id), [hidden]);
  /** Энэ аккаунтад ХАРАГДАХ инженерийн давхаргууд */
  const viewIds = useMemo(() => DED_BUTETS_LAYER_IDS.filter(allow), [allow]);
  /**
   * Багц ХУВААРИЛАГДААГҮЙ — харах хүрээ хоосон, эсвэл засах эрхтэй ч хүрээ
   * `[]` (fail-closed). Баруун самбарт ил мэдэгдэл (`noScope`-ийн тайлбар доор).
   */
  const noScope = useMemo(
    () => (hidden !== null && viewIds.length === 0)
      || (authStatus !== 'off' && hasCap(user?.username, 'butets') && scope !== null && scope.length === 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hidden, viewIds, scope, user, authStatus, capN],
  );
  /** Харагдах багцууд — нэг ч давхарга нь нээлттэй бол багц гарна */
  const viewPacks = useMemo(
    () => (hidden ? INFRA_PACKS.filter((x) => x.layerIds.some(allow)) : INFRA_PACKS),
    [hidden, allow],
  );
  /* KPI-ийн id жагсаалтууд — мөн хүрээгээр (бусад багцын км нийлбэрт орохгүй) */
  const totalIds = useMemo(() => TOTAL_IDS.filter(allow), [allow]);
  /* ⚠️ км-ийн гурван KPI — ЗӨВХӨН урттай шугам давхарга (`isLenLayer`-ийн тайлбар) */
  const netIds = useMemo(() => NET_IDS.filter((id) => isLenLayer(id) && allow(id)), [allow]);
  const heatIds = useMemo(() => SYSTEMS[0].ids.filter((id) => isLenLayer(id) && allow(id)), [allow]);
  const pkgIds = useMemo(() => PKG_IDS.filter((id) => isLenLayer(id) && allow(id)), [allow]);
  const wellIds = useMemo(() => WELL_IDS.filter(allow), [allow]);
  /**
   * ⚠️ АНХДАГЧ ДАВХАРГА ХҮРЭЭНД БАЙХ ЁСТОЙ (2026-09-23). `msel.layerId` ба `addTo`
   *    нь `DED_BUTETS_LAYER_IDS[0]`-оор эхэлдэг — тэр нь хуваарилагдаагүй багцынх
   *    бол тэгш өнцөгт сонголт ЭРХГҮЙ давхаргаас объект татах байв. Хүрээ
   *    тодорхой болмогц эхний зөвшөөрөгдсөн давхарга руу шилжүүлнэ.
   */
  useEffect(() => {
    if (!editableIds.length) return;
    if (!editableIds.includes(msel.layerId)) setMsel({ layerId: editableIds[0], oids: [] });
    if (!editableIds.includes(addTo)) setAddTo(editableIds[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableIds]);

  /**
   * ЭНЭ ЦОНХНЫ СУУРЬ — ЗӨВХӨН ИНЖЕНЕРИЙН 16 ШУГАМ.
   *
   * ⚠️ 2026-09-02 (хэрэглэгчийн хүсэлт): контекстийн давхаргууд —
   * `INITIAL_MAP_LAYERS` (барилга `et:24`, зам `et:29`/`et:27`, дугуйн зам,
   * гүүр, ногоон байгууламж, мод, тоглоомын талбай) — ХАСАГДАВ. Тэдгээр нь
   * ТАЛБАЙ объект бөгөөд нарийн (1.7–2.6px) шугамын ДЭЭР хэвтдэг тул
   * сүлжээ өнгөт дэвсгэр дотор булагдаж, «дэд бүтцийн зураг» гэхээсээ илүү
   * ерөнхий төлөвлөгөө шиг уншигддаг байв.
   *
   * ⚠️ ХООСОН БАЙЖ БОЛНО (2026-09-23): `MapCanvas` нь сонголт ХООСОН үед
   * `BASE_MAP_IDS`-ийн 14 суурь давхаргыг асаадаг анхдагч зантай (`bare:
   * false`) — урьд нь «жагсаалт 16 элементтэй тул тэр салаа ажиллахгүй» гэж
   * найдаж байсан ч «Бүх давхаргыг унтраах» ба багц хуваарилагдаагүй аккаунт
   * (`viewIds = []`) хоёр дээр ажиллаж байв. Одоо `MapCanvas`-д `bare`
   * дамжуулдаг тул хоосон сонголт = хоосон зураг.
   *
   * ⚠️ Гэрээний багц (`pkg:*`) АНХНААСАА УНТРААЛТТАЙ: тэдгээр нь ЕТ-ийн
   * шугамтай ижил трасс дээр давхарлагдан зурагддаг тул хоёулаа зэрэг асвал
   * аль нь аль болох нь ялгагдахгүй. Баруун жагсаалтаас эсвэл каталогоос асна.
   *
   * ⚠️ Контекст хэрэгтэй бол «Давхарга» каталогоос гараар нэмнэ — суурь нь
   * зөвхөн ЭХНИЙ байдлыг заана, хориглохгүй.
   */
  /* ⚠️ Суурь нь ХҮРЭЭГЭЭР (`viewIds`) — багцын аккаунтад бусад багц анхнаасаа асахгүй */
  const base = useMemo(() => [...viewIds], [viewIds]);

  const [visible, setVisible] = useLayerPicks(base);
  const [layerSel, setLayerSel] = useState<string | null>(null);

  /** Жагсаалтаас сонгосон гэрээний багц (эсвэл юу ч биш) */
  const [sel, setSel] = useState<Sel | null>(null);

  /** Мөр дарах — ижлийг дахин дарвал сонголт арилна */

  const pickRow = useCallback((next: Sel) => {
    setSel((cur) => (cur && cur.key === next.key ? null : next));
  }, []);

  /* ⚠️ Сонголт солигдоход зураг тэр давхарга руу нисэнэ — олон км-ийн трасс
     дэлгэцээс гадуур байвал «юу ч гарсангүй» гэж уншигдана. */
  useZoomToFilter({ zone, layerId: sel?.ids[0] ?? null });

  /**
   * ЗАСВАРЫН ГОРИМД ЗӨВХӨН ИНЖЕНЕРИЙН ШУГАМ.
   *
   * ⚠️ Барилга (`et:24`), зам (`et:29`), ногоон байгууламж нь ТАЛБАЙ объект
   * бөгөөд шугамын ДЭЭР хэвтдэг тул ил үлдээвэл товшилт тэдний аль нэг дээр
   * буугаад маягт нээгдэхгүй — хэрэглэгч «засвар ажиллахгүй байна» гэж
   * дүгнэнэ (`Gazar.mapVisible`-ийн ижил сургамж).
   *
   * ⚠️ Гэрээний багц (`pkg:*`) ч ХАСАГДАНА: тэдгээр нь ЕТ-ийн шугамтай ижил
   * трасс дээр давхарладаг тул аль нь товшигдсоныг ялгах боломжгүй.
   */
  const mapVisible = useMemo(() => {
    if (editMode) return viewIds;
    /* ⚠️ Сонгосон багцын давхаргууд ЗӨВХӨНӨӨРӨӨ — суурьтай ижил зарчим
       (дээрх `base`-ийн тэмдэглэл). Контекст хэрэгтэй бол каталогоос.
       ⚠️ `allow` шүүлт (2026-09-23): каталогийн хадгалсан сонголт эсвэл
       багцын мөрөөр ч хүрээний гаднах давхарга зурагт гарахгүй. */
    if (sel) return sel.ids.filter(allow);
    return hidden ? visible.filter(allow) : visible;
  }, [editMode, sel, visible, viewIds, allow, hidden]);

  /**
   * ЦЭГЭН ДАВХАРГУУДЫГ ЖИЖИГРҮҮЛНЭ (хэрэглэгчийн хүсэлт, 2026-09-02).
   *
   * ⚠️ ЗӨВХӨН ЭНЭ ХАРАГДАЦАД (`layerStyle`) — `LayerDef.size`-ыг өөрчилвөл
   * «Ерөнхий төлөвлөгөө», дашбоард, «Гүйцэтгэл» бүгд дагаж жижигрэх байв.
   *
   * ⚠️ ЯАГААД ЭНД ЛЬ ТОМ ХАРАГДАЖ БАЙВ: суурь давхаргууд хасагдсаны дараа
   * зурагт зөвхөн 1.7–2.6px нарийн шугам үлдсэн тул 4.9px бохирын худаг
   * (`et:3` — олон мянган цэг) ба 6.3px ДХТ (`et:4`) нь сүлжээг дарж,
   * трассын чиглэл уншигдахгүй болсон.
   *
   * ⚠️ Утга нь ЭЦСИЙН диаметр (px) — `DOT_SCALE` дахин үржүүлэхгүй.
   *
   * ⚠️ 2026-09-11: ХООСОН БОЛОВ. Дээрх `et:3`/`et:4`/`pkg:147…156` нь
   * Test0911S руу шилжсэнээр каталогт БАЙХГҮЙ болсон id-ууд — үлдээвэл
   * зөвхөн төөрөгдөл. ХТП/РП-ийн шинэ цэгүүд (`infra:53/55/57/59`) ЭНД
   * ОРОХ ЁСГҮЙ: тэдгээр нь `MapCanvas`-ийн масштабт уягдсан renderer
   * (`scaledDot`) авдаг бөгөөд `layerStyle` дарлага түүнийг тогтмол хэмжээт
   * `dot()`-оор ДАРЖ БИЧИЖ масштабыг устгана. Бохирын худаг нь одоо
   * ТАЛБАЙ (`infra:1` г.м.) тул цэгийн хэмжээ хамаарахгүй.
   * Объектыг хадгалав — дараа өөр цэгэн давхарга жижигрүүлэх бол энд.
   */
  const dotStyle = useMemo<Record<string, { size?: number }>>(() => ({}), []);

  /** Каталогийн багана — зөвхөн жагсаалт нээлттэй үед татна (Irged-тэй ижил) */
  /* ⚠️ ХҮРЭЭГЭЭР (2026-09-24): багцын аккаунтад каталог нь бусад багцын мөрийг
     нуудаг (`allow`) атал нийлбэр нь БҮХ ~127 давхаргаас татагддаг байв —
     дэмий хүсэлт, мөн нуусан багцын тоо сүлжээгээр ил явна. */
  const catIds = useMemo(
    () => (hidden ? CATALOG_LAYER_IDS.filter(allow) : CATALOG_LAYER_IDS),
    [hidden, allow],
  );
  const catTotals = usePlanTotals(zone, layerOpen, catIds);

  /** Хоёр баганын урт ба тоо — ЭНЭ цонхны 30 орчим давхаргаар */
  /**
   * ⚠️ KPI нь ДЭВШИЛТТЭЙ хувилбараар (`usePlanTotalsLive`): 74 давхаргын
   * бүгд ирэхийг хүлээвэл 4.2 секунд хоосон зогсоно (хэмжилтийг
   * `totals.ts`-ийн тайлбараас үз). Одоо багц бүр бэлэн болмогц өөрийн
   * тоогоо гаргана.
   */
  const totals = usePlanTotalsLive(zone, true, totalIds);

  /** Тайлбарт багтаагүй давхаргын тоо («+N») */
  const legendHidden = useMemo(
    () => Math.max(0, mapVisible.filter((id) => LAYER_BY_ID[id]).length - 8),
    [mapVisible],
  );

  /**
   * Хэлбэр засахаас гарах — зурсан хуулбарыг арилгана.
   * ⚠️ `onMapPick`-ийн ӨМНӨ зарлагдсан байх ЁСТОЙ: тэр үүнийг хамаарлын
   * массивтаа нэрлэдэг бөгөөд `useCallback` нь hoist хийгддэггүй тул доор
   * байвал рендерийн үед `ReferenceError` өгнө.
   */
  const cancelReshape = useCallback(() => {
    setReshape(null);
    setReshaped(null);
    setClearToken((x) => x + 1);
  }, []);

  /**
   * ГАЗРЫН ЗУРАГ ДЭЭР ОБЪЕКТ ТОВШИХ.
   *
   * ⚠️ `useCallback` ЗААВАЛ: inline функц нь `memo(MapCanvas)`-ийн пропс
   *    өөрчлөгдсөн гэж үзүүлж, товшилт бүрд газрын зураг бүхэлдээ дахин
   *    баригдана.
   *
   * ⚠️ ХООСОН ГАЗАР товшиход `(null, null)` ирнэ — сонголтыг ЦЭВЭРЛЭНЭ.
   *
   * ⚠️ ЗӨВХӨН OID-г авна. `onPick`-ийн атрибут нь давхаргын `outFields`-д
   *    ачаалагдсанаар хязгаарлагдах тул маягт нь мөрөө ӨӨРӨӨ бүтнээр татна
   *    (`butetsEdit.loadRow`).
   */
  /**
   * ОЛОН СОНГОЛТЫГ ЗУРАГТ ТОДРУУЛНА — `OID IN (…)`.
   *
   * ⚠️ `setHighlight`-ийн `where` нь давхаргын OID нэрээр — давхарга бүрт
   * ижил байх албагүй тул `oidFieldOf`-оос уншина (`onMapPick`-ийн ижил дүрэм).
   */
  const showMsel = useCallback((layerId: string, oids: number[]) => {
    /* Шинэ сонголт эхэлмэгц өмнөх хадгалалтын мэдэгдэл арилна (`mselOk`) */
    setMselOk('');
    const oidField = oidFieldOf(layerId);
    /* Дан засвартай ЯГ ИЖИЛ харагдац (хэрэглэгчийн хүсэлт): сонгосон нь
       өөрийн өнгөөрөө, бусад нь бүдгэрнэ — нэмэлт гэрэлтүүлэггүй. */
    setHighlight(oids.length ? `${oidField} IN (${oids.join(',')})` : null, layerId);
  }, [setHighlight]);

  /** Сонголтыг цэвэрлэнэ — давхаргаа хадгална */
  const clearMsel = useCallback(() => {
    setMsel((m) => ({ layerId: m.layerId, oids: [] }));
    setMselOk('');
    setHighlight(null);
  }, [setHighlight]);

  const onMapPick = useCallback((a: Record<string, unknown> | null, id: string | null) => {
    if (!editMode) return;
    /* ⚠️ Сонголт солигдоход ХҮЛЭЭГДЭЖ БУЙ асуултыг хаяна (2026-09-24): устгах
       асуулт нээлттэй байхад өөр объект товшоод «Тийм» дарвал ӨМНӨХ объект
       устдаг байв (`onYes` нь хуучин `pick`-ийг хаасан). */
    setConfirmQ(null);
    /**
     * ОЛНООР СОНГОХ горим — товшилт нь маягт нээхгүй, сонголтод НЭМНЭ/ХАСНА.
     *
     * ⚠️ Хоосон газар товшихыг АЛГАСНА (сонголт цэвэрлэхгүй): олон объект
     * товшиж явахад нэг удаа зөрж дарахад бүх сонголт алга болвол ажил
     * дахин эхэлнэ. Цэвэрлэх нь самбарын товчоор.
     *
     * ⚠️ ӨӨР ДАВХАРГЫН объект — асууж байж шинэ сонголт эхэлнэ (нэг
     * давхаргаар хязгаарлагдана, `msel`-ийн тайлбар).
     */
    if (multi) {
      if (!a || !id || !DED_BUTETS_LAYER_IDS.includes(id)) return;
      /* ⚠️ Хуваарилагдаагүй багцын объект — сонголтод орохгүй (эрхийн хүрээ) */
      if (!canEditLayer(id)) { toast(tr('Энэ багцыг засах эрхгүй'), 'err'); return; }
      const oid = Number(a[oidFieldOf(id, a)]);
      if (!Number.isFinite(oid)) return;
      const o = Math.trunc(oid);
      /**
       * ⚠️ ӨӨР ДАВХАРГЫН объект — АСУУЛТГҮЙ шинэ сонголт эхэлнэ (Pro-гийн
       * «шинэ товшилт = шинэ сонголт» зан). 2026-09-16-ны засвар: урьд нь
       * `window.confirm` асуудаг байсан бөгөөд хөтөч «энэ хуудас дахин
       * харилцах цонх гаргахыг хориглох» гэж хаасан үед `confirm` үргэлж
       * `false` буцаан ӨӨР ДАВХАРГААС ЮУ Ч СОНГОГДОХГҮЙ болж байв (хэрэглэгч:
       * «5.1 дулааны буцах дээр болж байна, бусад дээр болохгүй»). Хаясан
       * сонголт нь бичигдээгүй түр төлөв тул алдагдах зүйл алга.
       */
      if (msel.oids.length && msel.layerId !== id) {
        setMsel({ layerId: id, oids: [o] });
        showMsel(id, [o]);
        return;
      }
      const oids = msel.oids.includes(o) ? msel.oids.filter((x) => x !== o) : [...msel.oids, o];
      setMsel({ layerId: id, oids });
      showMsel(id, oids);
      return;
    }
    if (!a || !id || !DED_BUTETS_LAYER_IDS.includes(id)) {
      /* ⚠️ 2026-09-21: ХЭЛБЭР ЗАСАЖ БАЙХАД хоосон газар товшвол мөн асууна —
         урьд нь `setPick(null)` шууд хийж самбар (хадгалах товч) алга болдог
         атал `reshape` төлөв ба vertex бариулууд зураг дээр үлдэж, гарах
         замгүй «гацдаг» байв. Хаяхгүй гэвэл сонголт ХЭВЭЭР. `reshape`
         идэвхгүй бол `cancelReshape`-ийг дуудахгүй — `clearToken` дэмий
         хөдөлж, шинэ объект зурах (`awaitDraw`) явцад sketch арилах эрсдэлтэй. */
      /* ⚠️ 2026-09-25: бөглөсөн маягт / зурсан шинэ дүрсийг ч асууна
         (`askDropUnsaved`). ШИНЭ объектын маягт хаагдвал зурсан улбар шар
         дүрсийг ЗААВАЛ арилгана (`clearToken`) — үлдвэл «нэмэгдчихсэн» мэт
         харагддаг байв. `pick` нь зураалт ДУУССАНЫ дараа л тавигддаг тул
         `awaitDraw` явцын sketch-ийг энэ нь хөндөхгүй. */
      const pk = pickRef.current;
      askDropUnsaved(() => {
        if (reshape) cancelReshape();
        else if (pk && pk.oid == null) setClearToken((x) => x + 1);
        setPick(null); setHighlight(null);
      });
      return;
    }
    /* ⚠️ Хуваарилагдаагүй багцын объект — маягт нээхгүй (эрхийн хүрээ, 2026-09-23) */
    if (!canEditLayer(id)) { toast(tr('Энэ багцыг засах эрхгүй'), 'err'); return; }
    /* ⚠️ Давхарга бүрийн OID нэр ижил байх албагүй — `oidFieldOf` (серверийн
       схем → атрибутын түлхүүр → бүртгэл) */
    const oidField = oidFieldOf(id, a);
    const oid = Number(a[oidField]);
    if (!Number.isFinite(oid)) { setPick(null); return; }
    /* Схемийг урьдчилж татна — дараагийн товшилтод серверийн OID нэр бэлэн */
    void loadLayerMeta(id).catch(() => {});

    /* ⚠️ Өөр объект руу шилжихээс ӨМНӨ хадгалаагүй vertex засварыг асууна —
       эс бөгөөс чирсэн ажил чимээгүй алга болно.
       ⚠️ 2026-09-25: бөглөсөн маягт / зурсан шинэ дүрсийг ч (`askDropUnsaved`).
       ЯГ ТЭР объектыг дахин товшвол маягт солигдохгүй (`layerId`/`oid` ижил —
       маягт дахин ачаалагдахгүй) тул зөвхөн vertex-ийг асууна. */
    const cur = pickRef.current;
    const same = cur != null && cur.layerId === id && cur.oid === oid;
    (same ? askDropReshape : askDropUnsaved)(() => {
      cancelReshape();
      setTplOpen(false);
      setAwaitDraw(false);
      setPick({ layerId: id, oid });
      setHighlight(`${oidField} = ${Math.trunc(oid)}`, id);
    });
  }, [editMode, multi, msel, showMsel, reshape, askDropReshape, askDropUnsaved, cancelReshape, setHighlight, canEditLayer, toast]);

  /**
   * САМБАРЫГ ХААХ — сонголт цэвэрлэгдэнэ.
   *
   * ⚠️ ХАДГАЛААГҮЙ VERTEX-ийг ЗААВАЛ асууна. Маягт ба хэлбэр засах нь одоо
   * НЭГ самбарт зэрэг амьдардаг тул «Хаах» нь хоёуланг нь хаана. Асуухгүй
   * бол чирсэн ажил чимээгүй алга болно — энэ нь таб байхад гардаггүй байсан
   * шинэ зам (тэр үед хэлбэр засах нь тусдаа горим байв).
   */
  /* ⚠️ 2026-09-21: `boolean` буцаана — хэрэглэгч «Cancel» дарж хаахаас
     татгалзвал `false`; `onDone` үүгээр маягт НЭЭЛТТЭЙ үлдсэнийг мэднэ. */
  const closeEdit = useCallback((): boolean => askDropReshape(() => {
    setConfirmQ(null); // ⚠️ хүлээгдэж буй устгах/буцаах асуулт сонголттойгоо хамт арилна
    setReshape(null);
    setReshaped(null);
    setPick(null);
    setHighlight(null);
    /* ⚠️ Зурсан түр дүрсийг ЗААВАЛ арилгана — маягтыг хаасан ч зурагт үлдвэл
       «нэмэгдчихсэн юм болов уу» гэж уншигдана. */
    setClearToken((x) => x + 1);
  }), [askDropReshape, setHighlight]);

  /** Vertex чирэх бүрд — хадгалаагүй шинэ хэлбэрийг санана */
  const onReshape = useCallback((g: __esri.Geometry | null) => {
    if (g) setReshaped(g.toJSON() as unknown);
  }, []);


  /**
   * СОНГОСОН ОБЪЕКТЫН ХЭЛБЭРИЙГ ЗАСАЖ ЭХЛЭХ.
   *
   * ⚠️ ГЕОМЕТРИЙГ ТУСАД НЬ ТАТНА. Товшилтын `onPick` нь зөвхөн АТРИБУТ
   * өгдөг (`MapCanvas.pickByQuery` нь `returnGeometry: false`). Мөн энэ нь
   * ЗӨВ: hitTest-ийн буцаах геометр нь дэлгэцийн нягтралаар ХЯЛБАРШУУЛСАН
   * байж болох бөгөөд түүнийг буцааж бичвэл vertex-үүд чимээгүй алдагдана.
   *
   * ⚠️ ЗӨВХӨН ДАРАХАД татна (сонгоход БИШ): объект бүрийг товших бүрд
   * геометр татвал зөвхөн атрибут харах хүнд ч хэдэн зуун килобайт ирнэ.
   *
   * ⚠️ ТОДРУУЛГЫГ УНТРААНА: `featureEffect` нь бусад объектыг бүдгэрүүлэхийн
   * зэрэгцээ сонгосон объектыг ч өнгө нэмж зурдаг тул vertex-ийн бариулууд
   * тодруулгын доор орж, аль нь бариул болох нь ялгагдахаа болино.
   */
  const startReshape = useCallback(() => {
    if (!pick || pick.oid == null) return;
    const { layerId, oid } = pick;
    const seq = ++geomSeq.current;
    setReshaped(null);
    setHighlight(null);
    void (async () => {
      try {
        /**
         * ⚠️ УРЬДЧИЛЖ ТАТСАН ГЕОМЕТРИЙГ ХЭРЭГЛЭНЭ (2026-09-16, гүйцэтгэл) —
         * маягт нээгдэх зуур доорх эффект аль хэдийн татсан байна, тиймээс
         * «Хэлбэр засах» дарахад бариулууд ШУУД гарна (урьд нь нэг бүтэн
         * REST хүсэлт хүлээдэг байв).
         *
         * ⚠️ ЗУРГИЙН ГРАФИКААС АВАХГҮЙ — `hitTest`-ийн буцаадаг геометр нь
         * тухайн масштабт ЕРӨНХИЙЛӨГДСӨН (generalized) байдаг тул түүнийг
         * буцааж бичвэл объектын нарийвчлал ЧИМЭЭГҮЙ мууднa. Үргэлж
         * үйлчилгээний бүтэн геометрийг авна.
         */
        const key = `${layerId}:${oid}`;
        const pre = preGeom.current?.key === key ? preGeom.current.p : null;
        const meta = await loadLayerMeta(layerId);
        /* Урьдчилсан татац `null` буцаавал (алдаа) жинхэнэ хүсэлтээр дахин
           оролдож, алдааны мессежийг ил гаргана. */
        const g = (pre ? await pre : null) ?? await loadGeometry(meta, oid);
        /* ⚠️ Хоцорсон хариу — шинэ сонголт аль хэдийн явж байна */
        if (seq !== geomSeq.current) return;
        if (!g) { toast(tr('Геометр олдсонгүй'), 'err'); return; }
        setReshape({ layerId, oid, geometry: g });
        setReshapeToken((x) => x + 1);
      } catch (e) {
        if (seq === geomSeq.current) toast(String((e as Error).message || e), 'err');
      }
    })();
  }, [pick, toast, setHighlight]);

  /**
   * ОБЪЕКТ УСТГАХ (2026-09-14 — Experience Builder-ийн edit widget-д байдаг
   * бөгөөд энд ДУТУУ байсан: андуурч нэмсэн мөрийг зөвхөн «Үйлдэл буцаах»
   * товч амьд байх зуур л арилгаж чаддаг байв, түүнээс хойш арга байхгүй).
   *
   * ⚠️ БУЦААХ АРГАГҮЙ. Эдгээр үйлчилгээнд хувилбарын түүх асаагүй тул
   * устгасан мөр бүрмөсөн алга болно. Тиймээс `undoable` руу ОГТ бичихгүй —
   * «Үйлдэл буцаах» товч гарч ирвэл буцаагдана гэсэн ХУДАЛ амлалт болно.
   * Оронд нь баталгаажуулалт дээр шууд хэлнэ.
   */
  const removeFeature = useCallback(() => {
    if (!pick || pick.oid == null) return;
    const { layerId, oid } = pick;
    /* ⚠️ Самбарын асуулт (`confirmQ`) — `window.confirm` хөтчид хаагдсан үед
       устгал чимээгүй зогсдог байв. Буцаагдахгүй тул `danger`. */
    setConfirmQ({
      /* ⚠️ Дугаарыг мэдээнд ЗААВАЛ — аль объект устахыг хэрэглэгч нүдээр батална */
      msg: tr('№{0} объектыг БҮРМӨСӨН устгана. Буцаах аргагүй. Үргэлжлүүлэх үү?', String(Math.trunc(oid))),
      danger: true,
      onYes: () => {
        void (async () => {
          setDelBusy(true);
          try {
            const meta = await loadLayerMeta(layerId);
            await deleteRow(meta, oid);
            refreshLayer(layerId);
            dropTotalsLater();
            /* ⚠️ Устгасны дараа сонголт ХООСОН — байхгүй мөрийн маягт нээлттэй
               үлдвэл дараагийн «Хадгалах» нь сервер дээр олдохгүй мөр рүү бичнэ. */
            setUndoable(null);
            closeEdit();
            toast(tr('Объект устгагдлаа'));
          } catch (e) {
            toast(String((e as Error).message || e), 'err');
          } finally {
            setDelBusy(false);
          }
        })();
      },
    });
  }, [pick, refreshLayer, toast, closeEdit, dropTotalsLater]);

  /**
   * ШИНЭ ХЭЛБЭРИЙГ БИЧНЭ.
   *
   * ⚠️ АТРИБУТЫГ ХАМТ ИЛГЭЭХГҮЙ (`saveGeometry`) — чирэх зуур өөр хүн тухайн
   * мөрийн талбарыг зассан байж болно.
   * ⚠️ Уртын нийлбэрийн кэшийг ЗААВАЛ хаяна: хэлбэр солигдоход
   * `Shape__Length` дагаж өөрчлөгдөх ч `urt_m` нь ХЭВЭЭР үлдэнэ — жагсаалт
   * дээрх км тэр хоёрын алины ч шинэ утгыг өөрөө мэдэхгүй.
   */
  const commitReshape = useCallback(async () => {
    if (!reshape || reshaped == null) return;
    setGeomBusy(true);
    try {
      const meta = await loadLayerMeta(reshape.layerId);
      await saveGeometry(meta, reshape.oid, reshaped);
      refreshLayer(reshape.layerId);
      dropTotalsLater();
      /* Урьдчилсан геометр хуучирлаа — дараагийн засвар шинээр татна */
      preGeom.current = null;
      /* ⚠️ Буцаах геометр нь ЗАСВАРААС ӨМНӨХ хуулбар (`reshape.geometry`) —
         үйлчилгээнээс дахин уншвал ШИНЭ хэлбэр л тэнд байна. */
      setUndoable({
        kind: 'geom',
        layerId: reshape.layerId,
        oid: reshape.oid,
        geometry: reshape.geometry,
      });
      toast(tr('Хэлбэр хадгалагдлаа'));
      /* ⚠️ Аль хэдийн бичигдсэн тул хадгалаагүй засвар БАЙХГҮЙ — шууд цэвэрлэнэ */
      setReshape(null);
      setReshaped(null);
      setClearToken((x) => x + 1);
    } catch (e) {
      toast(String((e as Error).message || e), 'err');
    } finally {
      setGeomBusy(false);
    }
  }, [reshape, reshaped, refreshLayer, toast, dropTotalsLater]);

  /**
   * СҮҮЛИЙН ҮЙЛДЛИЙГ БУЦААНА.
   *
   * ⚠️ ШИНЭЭР НЭМСЭН объектын буцаалт нь УСТГАЛ — эдгээр үйлчилгээнд
   * хувилбарын түүх асаагүй тул бүрмөсөн алга болно. Тиймээс ЗААВАЛ
   * баталгаажуулалт асууна (`tableWrite`-ийн дүрэм).
   */
  const undo = useCallback(() => {
    if (!undoable) return;
    const u = undoable;
    const run = async () => {
      setUndoBusy(true);
      try {
        const meta = await loadLayerMeta(u.layerId);
        if (u.kind === 'add') await deleteRow(meta, u.oid);
        else if (u.kind === 'attr') await applyAttrs(meta, u.oid, u.attrs);
        else if (u.kind === 'batch') await revertRows(meta, u.rows);
        else await saveGeometry(meta, u.oid, u.geometry);
        refreshLayer(u.layerId);
        dropTotalsLater();
        /* Буцаалт хэлбэрийг ч сэргээж болно — урьдчилсан геометр хуучирна */
        preGeom.current = null;
        setUndoable(null);
        toast(tr('Үйлдэл буцаагдлаа'));
      } catch (e) {
        toast(String((e as Error).message || e), 'err');
      } finally {
        setUndoBusy(false);
      }
    };
    /* ⚠️ Самбарын асуулт — `window.confirm` хаагдсан хөтчид буцаалт чимээгүй зогсдог байв */
    if (u.kind === 'add') {
      setConfirmQ({
        msg: tr('Сая нэмсэн №{0} объектыг УСТГАНА. Буцаах аргагүй. Үргэлжлүүлэх үү?', String(Math.trunc(u.oid))),
        danger: true,
        onYes: () => { void run(); },
      });
      return;
    }
    void run();
  }, [undoable, refreshLayer, toast, dropTotalsLater]);

  /**
   * ТЭМПЛЭЙТ СОНГОГДОВ — зураалт ШУУД эхэлнэ (EB-ийн edit widget-ийн зан).
   *
   * ⚠️ Сонголт ба зураалтыг хоёр товч болговол («давхаргаа сонго» → «зурж
   * нэмэх») нэмэлт алхам үүснэ. EB-д тэмплэйт дарах нь өөрөө «одоо зурна»
   * гэсэн үг — энд ч ижил.
   */
  const pickTemplate = useCallback((id: string) => {
    /**
     * ⚠️ СХЕМИЙГ УРЬДЧИЛЖ ТАТНА (2026-09-16, гүйцэтгэл). Хэрэглэгч тэмплэйт
     * дараад дүрсээ зурах хэдэн секундэд схем нь аль хэдийн ирсэн байна —
     * зурж дуусмагц маягт ШУУД нээгдэнэ. Урьд нь энэ агшинд «Ачаалж байна…»
     * гарч, давхаргын метадатаг хүлээдэг байв.
     *
     * ⚠️ `loadLayerMeta` нь модулийн кэштэй тул давхар хүсэлт явахгүй;
     * алдааг залгина — маягт нээгдэхдээ дахин оролдож, алдааг ил гаргана.
     */
    void loadLayerMeta(id).catch(() => {});
    setConfirmQ(null); // ⚠️ сонголт солигдоно — хүлээгдэж буй асуулт хуучирна
    setAddTo(id);
    setTplOpen(false);
    setAwaitDraw(true);
    setPick(null);
    /* Шинэ объект зурах нь олон сонголтыг орхино — нэг зэрэг хоёр горим байхгүй */
    setMulti(false);
    setRectDraw(false);
    setMsel((m) => ({ layerId: m.layerId, oids: [] }));
    setHighlight(null);
    setDrawToken((x) => x + 1);
  }, [setHighlight]);

  /** Зурах хэрэгслийн төрөл — сонгосон давхаргаас */
  const drawKind = useMemo(
    /* ⚠️ Тэгш өнцөгт сонголт явж байхад зурах хэрэгсэл нь `rectangle` —
       `drawToken` өсөх агшинд `MapCanvas` энэ утгыг уншина. */
    () => (rectDraw ? 'rectangle' as const : DRAW_OF[LAYER_BY_ID[addTo]?.geom ?? 'line'] ?? 'polyline'),
    [addTo, rectDraw],
  );

  /**
   * ТЭМПЛЭЙТИЙН ЖАГСААЛТ — системээр бүлэглэж, хайлтаар шүүнэ.
   *
   * ⚠️ БҮЛЭГ нь `SYSTEMS` (=`INFRA_SYSTEMS`) — зүүн баганын
   * бүлэглэлтэй ЯГ ижил. Тусдаа эрэмбэ зохиовол хэрэглэгч нэг хуудсан дээр
   * хоёр өөр дараалал харна.
   *
   * ⚠️ ХООСОН БҮЛЭГ ГАРГАХГҮЙ — хайлтад тохирохгүй систем нь гарчгаараа
   * үлдвэл «энд юу ч алга» гэсэн хоосон мөрүүд жагсаалтыг дүүргэнэ.
   *
   * ⚠️ Хайлт нь ОРЧУУЛСАН нэрээр — хэрэглэгч дэлгэц дээр харж байгаа
   * текстээ бичнэ, дотоод монгол түлхүүрийг биш.
   */
  const tplGroups = useMemo(() => {
    const needle = tplQ.trim().toLowerCase();
    return SYSTEMS.map((sys) => ({
      key: sys.key,
      title: sys.title,
      ids: sys.ids.filter((id) => {
        const L = LAYER_BY_ID[id];
        if (!L) return false;
        /* ⚠️ Эрхийн хүрээнээс гадуурх давхарга тэмплэйтэд гарахгүй (2026-09-23) */
        if (!editableIds.includes(id)) return false;
        return !needle || tr(L.title).toLowerCase().includes(needle);
      }),
    })).filter((g) => g.ids.length > 0);
  }, [tplQ, editableIds]);

  /**
   * ЗУРААЛТ ДУУСМАГЦ МАЯГТ НЭЭНЭ.
   *
   * ⚠️ `toJSON()` нь `spatialReference`-ийг ХАМТ өгнө. Зураг Web Mercator
   * (102100), үйлчилгээ UTM 48N (32648) тул SR-гүй илгээвэл сервер
   * координатыг өөрийн проекц гэж уншиж, объект дэлхийн өөр буланд үүснэ.
   *
   * ⚠️ `null` нь «цэвэрлэв» гэсэн дохио (`clearToken`) — маягт нээхгүй.
   */
  const onSketch = useCallback((g: __esri.Geometry | null) => {
    /* ⚠️ `null` нь ЗӨВХӨН «цэвэрлэв» (`clearToken`). Esc-ийн цуцлалт энд ИРДЭГГҮЙ
       байсан (2026-09-17-ны тайлбар худал байв) — одоо `onSketchCancel`-оор. */
    if (!g) { if (rectDraw) setRectDraw(false); return; }
    /**
     * ТЭГШ ӨНЦӨГТӨӨР СОНГОХ — дүрс нь объект БИШ, сонголтын хил.
     *
     * ⚠️ Зурсан тэгш өнцөгтийг ШУУД арилгана (`clearToken`): үлдээвэл
     * «шинэ объект зурчихав уу» гэсэн төөрөгдөл; сонголт нь тодруулгаар
     * харагдана. Дотор нь орсныг ОДООГИЙН сонголт дээр НЭМНЭ (давхардалгүй)
     * — Pro-гийн «Add to selection» зан; хасах бол цэвэрлээд дахин татна.
     */
    if (rectDraw) {
      setRectDraw(false);
      setClearToken((x) => x + 1);
      /* ⚠️ ЗӨВХӨН самбарын жагсаалтад сонгосон давхаргаас (хэрэглэгчийн шийдвэр,
         2026-09-16): бүх давхаргаас хайж «алийг нь?» гэж асуудаг хувилбарыг
         туршаад хаясан — давхаргаа аль хэдийн сонгосон хүнд нэмэлт алхам болж,
         73 давхаргын асуулга нь удаан байв. Давхаргаа эхлээд жагсаалтаас
         (эсвэл объект товшиж) сонгоно. */
      const layerId = msel.layerId;
      setMselBusy(true);
      loadLayerMeta(layerId)
        .then((meta) => queryOidsIn(meta, g.toJSON() as unknown))
        .then((found) => {
          /* ⚠️ 2026-09-21: `setMsel`-ийн updater ДОТОР `showMsel` (→ `setHighlight`)
             дуудаж болохгүй — React render дундуур өөр компонент шинэчилнэ
             (`Gazar.tsx` §pickFlt-ийн дүрэм). Одоогийн сонголтыг `mselRef`-ээс
             уншиж ГАДНА нь бодно; татаж байх зуур хэрэглэгч товшсон бол ref
             хамгийн сүүлийн төлөвтэй тул алдахгүй. */
          const m = mselRef.current;
          if (m.layerId !== layerId) return;
          const oids = [...new Set([...m.oids, ...found])];
          setMsel({ layerId, oids });
          showMsel(layerId, oids);
          if (!found.length) toast(tr('Тэгш өнцөгт дотор энэ давхаргын объект олдсонгүй'));
        })
        .catch((e) => toast(String((e as Error).message || e), 'err'))
        .finally(() => setMselBusy(false));
      return;
    }
    setAwaitDraw(false);
    setPick({ layerId: addTo, oid: null, geometry: g.toJSON() as unknown });
  }, [addTo, rectDraw, msel.layerId, showMsel, toast]);

  /**
   * ЗУРААЛТЫГ Esc-ЭЭР ЦУЦЛАВ (2026-09-25, `MapCanvas.onSketchCancel`).
   *
   * ⚠️ Урьд нь Esc-ийн дараа тэгш өнцөгт сонголт «Татахыг болих» хэвээр, шинэ
   *    объектын хүлээлтийн самбар (`awaitDraw`) зураалтгүй атал нээлттэй гацдаг
   *    байв — дараагийн товшилт нь зөвхөн горимыг унтраадаг байлаа.
   */
  const onSketchCancel = useCallback(() => {
    setRectDraw(false);
    setAwaitDraw(false);
  }, []);

  /**
   * ЗАСВАРЫН ГОРИМД ОРОХ — идэвхтэй тодруулга, сонголтыг цэвэрлэнэ.
   *
   * ⚠️ Тодруулга үлдвэл `featureEffect` нь бусад объектыг бүдгэрүүлж, тэдгээр
   * дээр товшиход ЮУ Ч БОЛОХГҮЙ (`Gazar.enterEdit`-ийн ижил анхааруулга).
   */
  const enterEdit = useCallback(() => {
    setHighlight(null);
    setPick(null);
    setSel(null);
    setLayerOpen(false);
    setOpOpen(false);
    setEditMode(true);
  }, [setHighlight]);

  const exitEdit = useCallback(() => {
    /* ⚠️ Чирсэн ажил, бөглөсөн маягт, зурсан шинэ дүрсийг хаяхаас өмнө асууна
       (`askDropUnsaved`-ийн тайлбар, 2026-09-25) */
    askDropUnsaved(() => {
      setEditMode(false);
      setConfirmQ(null);
      /* Алдааны мэдэгдэл горимтойгоо хамт арилна (`toast`-ийн тайлбар) */
      setSaved('');
      setTplOpen(false);
      setAwaitDraw(false);
      setPick(null);
      setReshape(null);
      setReshaped(null);
      setUndoable(null);
      /* Олон сонголт горимтойгоо хамт арилна — дараагийн нээлт цэвэр эхэлнэ */
      setMulti(false);
      setRectDraw(false);
      setMsel((m) => ({ layerId: m.layerId, oids: [] }));
      setMselOk('');
      setHighlight(null);
      setClearToken((x) => x + 1);
      /* ⚠️ Хойшлуулсан нийлбэрийг ЭНД нэг удаа хаяна (`dropTotalsLater`) */
      flushTotals();
    });
  }, [askDropUnsaved, setHighlight, flushTotals]);

  /**
   * Сонгогдсон объектын геометрийг урьдчилж татна (`preGeom`-ийн тайлбар).
   * ⚠️ ЗӨВХӨН БАЙГАА мөрөнд: шинэ объектын геометр сервер дээр байхгүй.
   */
  useEffect(() => {
    if (!editMode || !pick || pick.oid == null) { preGeom.current = null; return; }
    const { layerId } = pick;
    const oid = pick.oid;
    const key = `${layerId}:${oid}`;
    if (preGeom.current?.key === key) return;
    preGeom.current = {
      key,
      p: loadLayerMeta(layerId).then((m) => loadGeometry(m, oid)).catch(() => null),
    };
  }, [editMode, pick]);

  /**
   * СОНГОСОН ДАВХАРГА `Delete` дэмждэг эсэх — «Устгах» товчны `disabled`.
   * ⚠️ Схем ирээгүй байхад `false` (хаалттай) — Delete-гүй үйлчилгээнд товч
   *    нээлттэй гарч серверийн бүрхэг алдаагаар унадаг байв (2026-09-24).
   */
  const [canDel, setCanDel] = useState(false);
  useEffect(() => {
    if (!editMode || !pick || pick.oid == null) { setCanDel(false); return; }
    let alive = true;
    setCanDel(false);
    loadLayerMeta(pick.layerId)
      .then((m) => { if (alive) setCanDel(m.canDelete); })
      .catch(() => { if (alive) setCanDel(false); });
    return () => { alive = false; };
  }, [editMode, pick]);

  return (
    <div
      ref={side.hostRef}
      className={`${d.frame} ${editMode ? d.frameEdit : ''} ${side.hostClass}`}
      style={side.style}
    >
      <SplitGrip {...side.right} />

      {/* ══════════ ТӨВ — үзүүлэлт + газрын зураг ══════════ */}
      <main className={d.mapCol}>
        {!editMode && (
        <div className={d.kpi}>
          {/*
            * ⚠️ ХҮЛЭЭЛТИЙН БҮРХҮҮЛ (`Data`) ХАСАГДСАН (2026-09-14, хэрэглэгч:
            * «дата мэдээлэл хурдан хөнгөн уншилттай болгомоор байна»).
            *
            * Тэр нь 74 давхаргын СҮҮЛЧИЙНХ ирэх хүртэл дөрвөн үзүүлэлтийг
            * бүхэлд нь нуудаг байв — хэмжсэнээр 4.2 секунд. Одоо үзүүлэлт
            * бүр ӨӨРИЙН давхаргууд бэлэн болмогц гарна: дулаан хангамж (19
            * давхарга) хамгийн түрүүнд, нийт дүн хамгийн сүүлд.
            *
            * ⚠️ ДУТУУ НИЙЛБЭР ХЭЗЭЭ Ч ГАРАХГҮЙ — `sumOf` нь багцынхаа бүх
            * давхарга ирээгүй бол `null` буцаана. Дутуугаар бичвэл тоо
            * нүдэн дээр өсөж, аль нь эцсийн утга болох нь мэдэгдэхгүй.
            */}
          {/* ⚠️ Хоосон id жагсаалт (багц хуваарилагдаагүй) → «—», «0.0 км» биш
              (`sumOf`-ийн тайлбар, 2026-09-23) */}
          <Stats cols={4}>
            <Stat
              value={kmOrWait(sumOf(totals, netIds), netIds.length === 0, totals.done >= totals.total)}
              unit={tr('км')}
              label={tr('Инженерийн шугам — нийт')}
            />
            <Stat
              value={kmOrWait(sumOf(totals, heatIds), heatIds.length === 0, totals.done >= totals.total)}
              unit={tr('км')}
              label={tr('Үүнээс дулаан хангамж')}
            />
            <Stat
              value={kmOrWait(sumOf(totals, pkgIds), pkgIds.length === 0, totals.done >= totals.total)}
              unit={tr('км')}
              label={tr('Гэрээний багцын шугам')}
            />
            <Stat
              value={cntOrWait(countOf(totals, wellIds), wellIds.length === 0)}
              unit={tr('ш')}
              label={tr('Бохирын худаг')}
            />
          </Stats>
          {/* ⚠️ ЯВЦЫН мөр — бүрэн болмогц алга болно. Байхгүй бол «…» нь
              гацсан уу, ачаалж байна уу гэдэг нь ялгагдахгүй. */}
          {totals.done < totals.total && (
            <p className={d.kpiWait}>
              {tr('{0}/{1} давхарга', num(totals.done), num(totals.total))}
            </p>
          )}
          {totals.error && (
            <p className={d.kpiWait} role="alert">
              {tr('Тоо татагдсангүй: {0}', totals.error.message)}
              {' '}
              <button type="button" className={d.kpiRetry} onClick={retryTotals}>
                {tr('Дахин оролдох')}
              </button>
            </p>
          )}
          {/* ⚠️ ХЭСЭГЧИЛСЭН уналт (2026-09-23): зарим давхарга унавал тэдний
              багцын үзүүлэлт «…» дээр мөнхөд гацдаг байсан бөгөөд шалтгаан нь
              зөвхөн console-д. Одоо тоог ил хэлж, дахин татах товч өгнө. */}
          {!totals.error && totals.failed > 0 && totals.done >= totals.total && (
            <p className={d.kpiWait} role="alert">
              {tr('{0} давхарга татагдсангүй', num(totals.failed))}
              {' '}
              <button type="button" className={d.kpiRetry} onClick={retryTotals}>
                {tr('Дахин оролдох')}
              </button>
            </p>
          )}
        </div>
        )}

        <div className={d.mapBox}>
          <MapCanvas
            dim={dim}
            visible={mapVisible}
            opacity={opacity}
            zone={zone}
            layerStyle={dotStyle}
            uniform
            /* ⚠️ Зурах хэрэгсэл нь ЗӨВХӨН засварын горимд — эс бөгөөс ердийн
               үзэгч санамсаргүй дүрс зурж, «энэ юу вэ» гэсэн асуулт төрнө. */
            sketch={editMode}
            onSketch={onSketch}
            onSketchCancel={onSketchCancel}
            drawToken={drawToken}
            drawKind={drawKind}
            reshapeGeometry={reshape?.geometry}
            reshapeToken={reshapeToken}
            onReshape={onReshape}
            sketchUndoToken={sketchUndoToken}
            clearToken={clearToken}
            /* ⚠️ Засварын горимоос гадуур `undefined` (`noop` БИШ, 2026-09-23):
               `MapCanvas` нь сонголт авах хүнгүй үед товшилтоор атрибутын
               хайрцгийг (`MapTip`) тэр цэгт гаргана — hover-гүй мэдрэгчтэй
               дэлгэцэд атрибут уншигдах цорын ганц зам. */
            onPick={editMode ? onMapPick : undefined}
            /* ⚠️ `bare` (2026-09-23): «Бүх давхаргыг унтраах» эсвэл багц
               хуваарилагдаагүй аккаунт (`viewIds = []`) үед сонголт ХООСОН
               болдог бөгөөд анхдагч зан нь тэр агшинд 14 суурь давхаргыг
               (`BASE_MAP_IDS`) автоматаар асаадаг байв — «унтраасан» атал
               зураг дүүрэн. `Ersdel`-ийн ижил шийдэл. */
            bare
          />

          <MapTools
            dim={dim}
            setDim={setDim}
            layersOpen={layerOpen}
            /* ⚠️ Каталогт тоо ил гарна — хойшлуулсныг ЭНД шууд хаяна */
            onLayers={() => { flushTotals(); setLayerOpen((v) => !v); }}
            opacityOpen={opOpen}
            onOpacity={() => setOpOpen((v) => !v)}
            zone={zone}
            setZone={setZone}
          >
            {/* ⚠️ Эрхгүй хүнд ОГТ харагдахгүй — идэвхгүй товч нь «яагаад
                болохгүй байна» гэсэн асуулт төрүүлээд хариулахгүй
                (`Gazar`-ын ижил шийдэл). */}
            {canEdit && (
              <MapToolBtn
                icon="pen"
                on={editMode}
                disabled={dim !== '2d'}
                onClick={() => (editMode ? exitEdit() : enterEdit())}
                title={dim !== '2d'
                  ? tr('Засварыг зөвхөн 2D дээр хийнэ')
                  : tr('Зөвхөн инженерийн шугам үлдэж, объект дарахад атрибут засах цонх нээгдэнэ')}
              >
                {tr('Мэдээлэл засах')}
              </MapToolBtn>
            )}
            {/* ⚠️ 3D-д ШАЛТГААНЫГ ИЛ хэлнэ (2026-09-23): идэвхгүй товчны tooltip
                мэдрэгчтэй дэлгэцэд огт гардаггүй тул «яагаад дарагдахгүй
                байна» гэсэн асуулт хариултгүй үлддэг байв. */}
            {canEdit && dim !== '2d' && (
              <span className={d.editHint}>{tr('Зөвхөн 2D-д')}</span>
            )}
          </MapTools>

          {/*
            * ЗАСВАРЫН АЖЛЫН ЗУРВАС — «энэ бол тусдаа горим» гэдгийг хэлнэ.
            *
            * ⚠️ 2026-09-14: ЗӨВХӨН ГОРИМЫН удирдлага үлдэв (нэр, шинэ объект,
            * үйлдэл буцаах, гарах). Объектод хамаарах бүх зүйл — маягт,
            * хэлбэр засах, устгах — БАРУУН САМБАРТ шилжсэн. Урьд нь зурвас
            * хоёр үүргийг зэрэг гүйцэтгэж, сонгосон объектоос хамаарч товчнууд
            * нь гарч алга болдог тул байрлал нь тогтворгүй байв (Experience
            * Builder-ийн edit widget-д ч удирдлага дээр, объектын маягт
            * самбарт байдаг).
            */}
          {editMode && (
            <div className={d.editBar}>
              <span className={d.editTitle}>{tr('Дэд бүтэц засах')}</span>
              <button
                type="button"
                className={`${d.editAdd} ${tplOpen ? d.editAddOn : ''}`}
                aria-pressed={tplOpen}
                /* ⚠️ Нээлттэй маягтыг хаадаг тул `askDropUnsaved` (2026-09-25) */
                onClick={() => askDropUnsaved(() => {
                  cancelReshape();
                  setTplOpen((v) => !v);
                  setAwaitDraw(false);
                  setPick(null);
                  setMulti(false);
                  setRectDraw(false);
                  setMsel((m) => ({ layerId: m.layerId, oids: [] }));
                  setHighlight(null);
                })}
              >
                {tr('Шинэ объект')}
              </button>
              {/*
                * ОЛНООР СОНГОХ — нэг давхаргын олон объектыг сонгож нэг
                * маягтаар бүгдэд нь бичнэ (2026-09-16, `DedButetsBatch`).
                * ⚠️ Асаахад дан маягт, тэмплэйт, зураалт бүгд хаагдана —
                * нэг товшилт нэг л зүйл хийх ёстой (`multi`-ийн тайлбар).
                */}
              <button
                type="button"
                className={`${d.editAdd} ${multi ? d.editAddOn : ''}`}
                aria-pressed={multi}
                /* ⚠️ Нээлттэй маягтыг хаадаг тул `askDropUnsaved` (2026-09-25) */
                onClick={() => askDropUnsaved(() => {
                  cancelReshape();
                  const next = !multi;
                  setMulti(next);
                  setTplOpen(false);
                  setAwaitDraw(false);
                  setPick(null);
                  setRectDraw(false);
                  setMselOk('');
                  if (!next) setMsel((m) => ({ layerId: m.layerId, oids: [] }));
                  setHighlight(null);
                  setClearToken((x) => x + 1);
                })}
                title={tr('Олон объект сонгож, нэг маягтаар бүгдэд нь ижил утга бичнэ')}
              >
                {tr('Олноор сонгох')}
              </button>
              <span className={d.editHint}>
                {multi
                  ? (rectDraw
                    ? tr('Зурагт тэгш өнцөгт татна уу.')
                    : msel.oids.length
                      ? tr('{0} объект сонгосон. Баруун самбарт бөглөнө.', num(msel.oids.length))
                      : tr('Объектуудыг товшиж эсвэл тэгш өнцөгтөөр сонгоно.'))
                  : awaitDraw
                  ? tr('Зурагт дүрсээ зурна уу. Дуусгахдаа хоёр товшино.')
                  : tplOpen
                    ? tr('Нэмэх давхаргаа сонгоно уу.')
                    : pick
                      ? tr('Баруун самбарт засна.')
                      : tr('Объект дарж сонгоно.')}
              </span>
              <span className={d.spacer} />
              {/* ⚠️ ЗӨВХӨН СҮҮЛИЙН НЭГ үйлдэл (стек биш — `undoable`-ийн
                  тайлбарыг үз). Буцаамагц алга болно. */}
              {undoable && (
                <button
                  type="button"
                  className={d.editUndo}
                  onClick={undo}
                  /* ⚠️ Буцаах үйлдлийн давхарга хүрээнээс гарсан бол хаалттай (2026-09-23) */
                  disabled={undoBusy || !canEditLayer(undoable.layerId)}
                  title={undoable.kind === 'add'
                    ? tr('Сая нэмсэн объектыг устгана')
                    : undoable.kind === 'geom'
                      ? tr('Хэлбэрийг өмнөх байдалд нь сэргээнэ')
                      : undoable.kind === 'batch'
                        ? tr('{0} объектын талбарыг өмнөх утгаар нь сэргээнэ', num(undoable.rows.length))
                        : tr('Талбарын утгыг өмнөх байдалд нь сэргээнэ')}
                >
                  {undoBusy ? tr('Буцааж байна…') : tr('Үйлдэл буцаах')}
                </button>
              )}
              <button type="button" className={d.editClose} onClick={exitEdit}>
                {tr('Хаах')}
              </button>
            </div>
          )}

          {/*
            * ТЭМПЛЭЙТИЙН САМБАР — EB-ийн «Create features».
            *
            * ⚠️ Системээр БҮЛЭГЛЭНЭ: 74 давхарга нэг жагсаалтад орвол хайх нь
            * гүйлгэх ажил болно. ⚠️ ТЭМДЭГ нь зурагтай ИЖИЛ (`Swatch`) —
            * «Дулааны өгөх» ба «буцах» хоёрын аль нь тасархай болохыг
            * сонгохоосоо ӨМНӨ харна.
            */}
          {editMode && tplOpen && (
            <aside className={d.pane}>
              <div className={d.modalHead}>
                <span className={d.modalTitle}>{tr('Шинэ объект')}</span>
                <button type="button" className={d.close} onClick={() => setTplOpen(false)}
                  aria-label={tr('Хаах')}>✕</button>
              </div>
              <div className={d.tplWrap}>
                <input
                  className={d.input}
                  value={tplQ}
                  onChange={(e) => setTplQ(e.target.value)}
                  placeholder={tr('Давхарга хайх…')}
                  aria-label={tr('Давхарга хайх…')}
                />
                {tplGroups.length === 0 && (
                  <p className={d.modalMsg}>{tr('Олдсонгүй')}</p>
                )}
                {tplGroups.map((g) => (
                  <div key={g.key} className={d.tplGroup}>
                    <div className={d.tplHead}>{tr(g.title)}</div>
                    {g.ids.map((id) => {
                      const L = LAYER_BY_ID[id];
                      if (!L) return null;
                      return (
                        <button
                          key={id}
                          type="button"
                          className={d.tplRow}
                          onClick={() => pickTemplate(id)}
                        >
                          <Swatch L={L} />
                          <span className={d.tplName} title={tr(L.title)}>{tr(L.title)}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </aside>
          )}

          {/* ⚠️ ХҮЛЭЭЛТИЙН самбар — тэмплэйт сонгогдсон ч дүрс дуусаагүй.
              Энэ мөчид маягт ч, жагсаалт ч байхгүй тул самбар ХООСОН харагдаж,
              «эвдэрсэн юм болов уу» гэж уншигдах эрсдэлтэй. */}
          {editMode && awaitDraw && !pick && (
            <aside className={d.pane}>
              <div className={d.modalHead}>
                <span className={d.modalTitle}>
                  {tr(LAYER_BY_ID[addTo]?.title ?? '')}
                </span>
              </div>
              <p className={d.modalMsg}>
                {drawKind === 'point'
                  ? tr('Зурагт цэгээ тавина уу.')
                  : tr('Зурагт дүрсээ зурна уу. Дуусгахдаа хоёр товшино.')}
              </p>
              <div className={d.actions}>
                <span className={d.spacer} />
                <button type="button" className={d.btn}
                  onClick={() => { setAwaitDraw(false); setClearToken((x) => x + 1); }}>
                  {tr('Болих')}
                </button>
              </div>
            </aside>
          )}
          {/*
            * ОЛОН ОБЪЕКТ ЗАСАХ САМБАР — сонголтын удирдлага + нэг маягт.
            *
            * ⚠️ Давхаргын жагсаалт нь тэгш өнцөгтөөр сонгохын тулд: товшилтгүй
            * эхлэхэд аль давхаргаас авахыг заана. Сонголт байхад давхарга
            * солих нь сонголтоо хаяна — асууж байж солино.
            */}
          {editMode && multi && (
            <aside className={d.pane}>
              <div className={d.modalHead}>
                <span className={d.modalTitle}>{tr('Олноор засах')}</span>
                <span className={d.modalNo}>{tr('{0} ш', num(msel.oids.length))}</span>
                <button type="button" className={d.close} aria-label={tr('Хаах')}
                  onClick={() => {
                    setMulti(false); setRectDraw(false);
                    setMsel((m) => ({ layerId: m.layerId, oids: [] }));
                    setHighlight(null); setClearToken((x) => x + 1);
                  }}>✕</button>
              </div>
              <div className={d.mselBox}>
                <label className={d.f}>
                  <span className={d.fLabel}>{tr('Давхарга')}</span>
                  <select
                    className={d.input}
                    value={msel.layerId}
                    disabled={mselBusy}
                    /* ⚠️ Асуулгагүй солино — `window.confirm` хөтчид хаагдсан
                       үед сонголт мөнхөд түгжигдэж байв (`onMapPick`-ийн тайлбар).
                       Хаягдах сонголт нь бичигдээгүй түр төлөв. */
                    onChange={(e) => {
                      setMsel({ layerId: e.target.value, oids: [] });
                      setMselOk('');
                      setHighlight(null);
                    }}
                  >
                    {/* ⚠️ БАГЦААР бүлэглэнэ (2026-09-24, хэрэглэгч: «дулаан, ариутгах
                        татуурга гэж хуваахгүй, зөвхөн багцаар»). Гарчиг нь
                        давхаргын нэрийн « · »-ийн өмнөх хэсэг («Багц 10»),
                        мөр нь давхаргын ЯГ нэр (хэрэглэгч: «yag datanii neriig
                        ashigla») — таслахгүй. */}
                    {BUTETS_PACKS.map((p) => {
                      const ids = p.layerIds.filter((id) => editableIds.includes(id));
                      if (!ids.length) return null;
                      /* ⚠️ «Багц 6.1» нь цахилгаан ба холбоо ХОЁР багцад давхцана —
                         тэр үед багцын бүтэн нэрийг («Багц 6.1 · Холбоо») авна. */
                      const headOf = (x: typeof p) => (LAYER_BY_ID[x.layerIds[0]]?.title ?? x.name).split(' · ')[0];
                      const short = headOf(p);
                      const head = BUTETS_PACKS.some((q) => q !== p && headOf(q) === short) ? p.name : short;
                      return (
                        <optgroup key={p.key} label={head}>
                          {ids.map((id) => (
                            <option key={id} value={id}>{LAYER_BY_ID[id]?.title ?? id}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </label>
                <div className={d.mselRow}>
                  <button
                    type="button"
                    className={`${d.btn} ${rectDraw ? d.editAddOn : ''}`}
                    disabled={mselBusy}
                    aria-pressed={rectDraw}
                    onClick={() => {
                      if (rectDraw) { setRectDraw(false); setClearToken((x) => x + 1); return; }
                      setRectDraw(true);
                      /* ⚠️ `drawKind` нь `rectDraw`-аас гардаг (memo) — токеныг
                         ДАРААГИЙН рендерт өсгөж, `MapCanvas` шинэ төрлийг уншсан
                         байхад зураалт эхлүүлнэ. */
                      setTimeout(() => setDrawToken((x) => x + 1), 0);
                    }}
                    title={tr('Зурагт тэгш өнцөгт татаж, дотор нь орсон объектуудыг сонголтод нэмнэ')}
                  >
                    {rectDraw ? tr('Татахыг болих') : tr('Тэгш өнцөгтөөр сонгох')}
                  </button>
                  <button
                    type="button"
                    className={d.btn}
                    disabled={mselBusy || !msel.oids.length}
                    onClick={clearMsel}
                  >
                    {tr('Цэвэрлэх')}
                  </button>
                </div>
                {/* ⚠️ Хадгалсны мэдэгдэл — сонголт цэвэрлэгдсэн ч ҮЛДЭНЭ
                    (`mselOk`-ийн тайлбар). Дараагийн сонголт эхлэхэд арилна. */}
                {mselOk && <div className={d.formOk} role="status">{mselOk}</div>}
                <p className={d.fHint}>
                  {mselBusy
                    ? tr('Сонгож байна…')
                    : msel.oids.length
                      ? tr('{0} объект сонгосон. Товшиж нэмнэ/хасна.', num(msel.oids.length))
                      : tr('Зураг дээр объект товшино, эсвэл тэгш өнцөгт татна.')}
                </p>
              </div>
              {msel.oids.length > 0 && (
                <DedButetsBatch
                  /* ⚠️ `key` = давхарга (2026-09-25): өөр давхаргын объект товшиход
                     маягт ШИНЭЭР эхэлнэ. Урьд нь нэг инстанц үлдэж, өмнөх давхаргад
                     бичсэн утга ижил нэртэй талбараар шинэ давхаргад «өөрчилсөн»
                     болж орж ирээд (хуучин `base`-тай жишигдэн) бичигдэх эрсдэлтэй
                     байв. Нэг давхарга дотор объект нэмж/хасахад бичсэн нь хэвээр. */
                  key={msel.layerId}
                  layerId={msel.layerId}
                  oids={msel.oids}
                  canEdit={canEdit && canEditLayer(msel.layerId)}
                  /* ⚠️ ХЭСЭГЧИЛСЭН бичилт (2026-09-25): эхний багцууд сервер дээр
                     БИЧИГДСЭН ч дараагийнх унасан. Урьд нь `onDone` дуудагдахгүй тул
                     бичигдсэн мөрүүдэд давхарга дахин уншигдахгүй (зураг хуучин
                     өнгөөр), нийлбэрийн кэш хаягдахгүй, «Үйлдэл буцаах» ч байхгүй
                     байв. Сонголт ба маягт ХЭВЭЭР — «Хадгалах»-аар үлдсэнийг бичнэ. */
                  onPartial={(back) => {
                    const id = msel.layerId;
                    setUndoable(back ? { ...back, layerId: id } : null);
                    refreshLayer(id);
                    dropTotalsLater();
                  }}
                  onDone={(rows, fields, back) => {
                    const id = msel.layerId;
                    setUndoable(back ? { ...back, layerId: id } : null);
                    /* ⚠️ Дан маягттай ИЖИЛ: давхарга дахин уншуулж, уртын
                       нийлбэрийн кэшийг хаяна (`onDone`-ы тайлбар доор). */
                    if (rows > 0) { refreshLayer(id); dropTotalsLater(); }
                    toast(tr('{0} объектын {1} талбар хадгалагдлаа', num(rows), num(fields)));
                    /**
                     * ⚠️ ХАДГАЛСНЫ ДАРАА СОНГОЛТ ЦЭВЭРЛЭГДЭНЭ (2026-09-16).
                     *
                     * Хэрэглэгч: «эхний удаа асуудалгүй, 2 дахь удаагаа select
                     * хийх гэхээр болохгүй». Шалтгаан нь: сонголт ба тодруулга
                     * хадгалсны дараа ХЭВЭЭР үлддэг байсан тул дараагийн
                     * товшилт нь ҮЛДСЭН объект дээр бууж `msel.oids.includes(o)`
                     * салааны улмаас түүнийг сонголтоос ХАСдаг (нэг объект
                     * сонгосон байсан бол тоо 0 болж маягт бүхэлдээ алга
                     * болно) — «сонголт ажиллахгүй» гэж уншигдана. Тэгш өнцөгт
                     * нь мөн ижил объектууд дээр багц нэгдэж (`Set`) ямар ч
                     * өөрчлөлтгүй, мэдэгдэлгүй өнгөрдөг байв.
                     *
                     * Одоо хадгалсны дараа сонголт дуусна: дараагийн товшилт
                     * ҮРГЭЛЖ ШИНЭ сонголт эхлүүлнэ (ArcGIS Pro-гийн ижил зан).
                     */
                    if (rows > 0) {
                      setMsel((m) => ({ layerId: m.layerId, oids: [] }));
                      setHighlight(null);
                      setMselOk(tr('✓ Хадгалагдлаа — {0} объектын {1} талбар', num(rows), num(fields)));
                    }
                  }}
                />
              )}
            </aside>
          )}
          {/* ⚠️ `display: contents` боодол (2026-09-25) — зөвхөн маягтын `onChange`-ийг
              барина (`formDirty`-ийн тайлбар); хайрцаг үүсгэхгүй тул самбарын
              `position: absolute` нь `mapBox`-оос хэвээр хэмжигдэнэ. */}
          {pick && (
            <div style={{ display: 'contents' }} onChange={() => { formDirty.current = true; }}>
            <DedButetsEdit
              layerId={pick.layerId}
              oid={pick.oid}
              geometry={pick.geometry}
              canEdit={canEdit && canEditLayer(pick.layerId)}
              docked
              onCancel={closeEdit}
              /**
               * ГЕОМЕТРИЙН ҮЙЛДЛҮҮД — маягтын доор, НЭГ САМБАРТ.
               *
               * ⚠️ ЗӨВХӨН БАЙГАА мөрөнд. Шинэ объектын геометр нь зурагдсан
               * ч ХАДГАЛАГДААГҮЙ тул түүнийг «хэлбэр засах» нь хадгалах
               * зүйлгүй, «устгах» нь устгах зүйлгүй үйлдэл болно.
               */
              extra={pick.oid == null ? undefined : (
                <div className={d.geomBox}>
                  <span className={d.geomTitle}>{tr('Хэлбэр')}</span>
                  {reshape ? (
                    <>
                      <button
                        type="button"
                        className={d.editAdd}
                        onClick={() => { void commitReshape(); }}
                        /* ⚠️ Чирээгүй бол хаалттай: өөрчлөгдөөгүй геометрийг
                           буцааж бичих нь дэмий хүсэлт бөгөөд `editDate`-ийг
                           хуурамчаар шинэчилнэ. */
                        disabled={geomBusy || reshaped == null}
                      >
                        {geomBusy ? tr('Хадгалж байна…') : tr('Хэлбэр хадгалах')}
                      </button>
                      {/* ⚠️ ЗУРААЛТЫН алхам буцаах — «Үйлдэл буцаах»-аас ӨӨР:
                          энэ нь хадгалаагүй vertex-ийг, тэр нь БИЧИГДСЭН
                          засварыг сэргээнэ. */}
                      <button
                        type="button"
                        className={d.btn}
                        onClick={() => setSketchUndoToken((x) => x + 1)}
                        disabled={geomBusy}
                        title={tr('Зурсан сүүлийн алхмыг цуцлана')}
                      >
                        {tr('Алхам буцаах')}
                      </button>
                      <button
                        type="button"
                        className={d.btn}
                        onClick={() => askDropReshape(cancelReshape)}
                        disabled={geomBusy}
                      >
                        {tr('Болих')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={d.btn}
                      onClick={startReshape}
                      /* ⚠️ Давхаргын хүрээгээр (2026-09-23 аудит) — багц хасагдсан
                         ч нээлттэй үлдсэн маягтаас хэлбэр/устгал явахгүй */
                      disabled={!canEdit || !canEditLayer(pick.layerId) || geomBusy || delBusy}
                      title={tr('Цэгүүдийг чирж зөөнө. Шинэ цэг нэмэхдээ ирмэгийн дунд дарна.')}
                    >
                      {tr('Хэлбэр засах')}
                    </button>
                  )}
                  <span className={d.spacer} />
                  {/* ⚠️ УСТГАХ нь БУЦААГДАХГҮЙ (`removeFeature`-ийн тайлбар) —
                      тиймээс бусад товчноос өнгөөр ялгарна. */}
                  <button
                    type="button"
                    className={d.geomDel}
                    onClick={removeFeature}
                    disabled={!canEdit || !canDel || !canEditLayer(pick.layerId) || delBusy || geomBusy || reshape != null}
                    title={canDel ? undefined : tr('Энэ давхарга устгахыг зөвшөөрөхгүй байна')}
                  >
                    {delBusy ? tr('Устгаж байна…') : tr('Устгах')}
                  </button>
                </div>
              )}
              onDone={(n, back: UndoInfo | null) => {
                /* ⚠️ Бичигдсэн — маягт өөрийн `dirty`-г тэглэдэг, энд ч мөн */
                formDirty.current = false;
                const id = pick.layerId;
                const created = pick.oid == null;
                /* ⚠️ 2026-09-21: хадгалаагүй хэлбэрийн засвартай үед `closeEdit`
                   «Cancel»-аар зогсдог ч доорх алхмууд ЯВДАГ байв. Бичилт аль
                   хэдийн ХИЙГДСЭН тул давхаргыг дахин уншуулах, мэдэгдэх нь
                   хэвээр зөв; харин маягт нээлттэй үлдсэн тул түүний `before`-ыг
                   `DedButetsEdit` өөрөө дахин татна (тэнд `saved` тоолуур). */
                const closed = closeEdit();
                /* ⚠️ Буцаалтыг МАЯГТ бэлддэг: хуучин утгууд зөвхөн түүний
                   дотор амьдардаг бөгөөд хаагдмагц алга болно. Маягт нээлттэй
                   үлдвэл (`!closed`) буцаалтыг өгөхгүй — маягт дахин уншигдаж
                   «хуучин утга» нь шинэчлэгдэнэ, буцаалт нь дараагийн
                   хадгалалтын `before`-той зөрөх байсан. */
                setUndoable(closed && back ? { ...back, layerId: id } : null);
                /**
                 * ⚠️ ДАВХАРГЫГ ДАХИН УНШУУЛНА. FeatureLayer нь татсан объектоо
                 * клиент дээрээ кэшлэдэг бөгөөд бичилт нь SDK-аар биш ШУУД
                 * REST-ээр явсан тул зассан утга ХУУЧНААРАА үлдэнэ.
                 * ⚠️ Уртын нийлбэрийн кэш нь тусдаа (`totals.ts`-ийн Map) —
                 * түүнийг хаяхгүй бол зүүн баганын км хуучин утгаараа үлдэнэ.
                 */
                if (n > 0) { refreshLayer(id); dropTotalsLater(); }
                /* ⚠️ 0 нь АМЖИЛТГҮЙ биш — юу ч өөрчлөөгүй гэсэн үг. Хоёрыг нэг
                   мессежээр хэлбэл «хадгалагдсангүй» гэж уншигдана. */
                toast(created
                  ? tr('Шинэ объект нэмэгдлээ')
                  : n > 0
                    ? tr('{0} талбар хадгалагдлаа', num(n))
                    : tr('Өөрчлөлт байсангүй'));
              }}
            />
            </div>
          )}

          {/* ⚠️ Алдаа (`savedKind === 'err'`) улаан, ✕-ээр хаагдана — өөрөө арилахгүй */}
          {saved && (
            <p className={`${d.saved} ${savedKind === 'err' ? d.savedErr : ''}`}
              role={savedKind === 'err' ? 'alert' : 'status'}>
              {saved}
              {savedKind === 'err' && (
                <button type="button" className={d.savedClose} onClick={() => setSaved('')}
                  aria-label={tr('Хаах')}>✕</button>
              )}
            </p>
          )}

          {/* САМБАРЫН БАТАЛГААЖУУЛАЛТ — `confirmQ`-ийн тайлбар. Мэдэгдлийн
              дээр байрлана; «Тийм» үргэлжлүүлж, «Үгүй» юу ч хийхгүй. */}
          {confirmQ && (
            <div className={d.confirm} role="alertdialog" aria-live="assertive">
              <span className={d.confirmMsg}>{confirmQ.msg}</span>
              <button
                type="button"
                className={confirmQ.danger ? d.geomDel : d.primary}
                onClick={() => { const q = confirmQ; setConfirmQ(null); q.onYes(); }}
              >
                {tr('Тийм')}
              </button>
              <button type="button" className={d.btn} onClick={() => setConfirmQ(null)}>
                {tr('Үгүй')}
              </button>
            </div>
          )}

          {layerOpen && (
            <div className={`${o.catPanel} ${d.catPanel}`}>
              {/* ⚠️ `view="dedButets"` нь каталогийн «Инженерийн дэд бүтэц»
                  (`infra`, Test0911S-ийн 73 давхарга) бүлгийг ХАМГИЙН ДЭЭР
                  гаргана (`services.ts` §catalogGroups). */}
              <LayerCatalog
                view="dedButets"
                /* ⚠️ Бусад багцын давхарга каталогт ч гарахгүй (2026-09-23) */
                allow={hidden ? allow : undefined}
                totals={catTotals}
                visible={visible}
                setVisible={setVisible}
                selected={layerSel}
                onSelect={setLayerSel}
                onClose={() => setLayerOpen(false)}
                zone={zone}
                embedded
              />
            </div>
          )}

          {opOpen && (
            <OpacityPanel
              /* ⚠️ `mapVisible` (2026-09-23) — зурагт БОДИТ зурагдаж буй давхаргууд.
                 Урьд нь `visible` (каталогийн сонголт) өгдөг байсан тул багц
                 сонгосон/засварын горимд зурагт байхгүй давхаргын гулсуур гарч,
                 зурагт байгаа нь гардаггүй байв. */
              visible={mapVisible}
              opacity={opacity}
              setOpacity={setOpacity}
              onClose={() => setOpOpen(false)}
            />
          )}

          {/* Тайлбар — зурагт БОДИТ харагдаж буй давхаргууд (бусад цонхтой ижил) */}
          <div className={o.legend}>
            {mapVisible
              .map((id) => LAYER_BY_ID[id])
              .filter((L) => L != null)
              .slice(0, 8)
              .map((L) => (
                <span key={L.id} className={o.legendItem} title={L.title}>
                  <i style={{ background: L.hue }} />{L.title}
                </span>
              ))}
            {legendHidden > 0 && <span className={o.legendMore}>+{legendHidden}</span>}
          </div>
        </div>
      </main>

      {/* ══════════ БАРУУН — гэрээний багцын дэд бүтэц ══════════ */}
      {!editMode && (
      <div className={d.right}>
            <>
              {/* ⚠️ БАГЦ ХУВААРИЛАГДААГҮЙ аккаунт (2026-09-23): `hidden` нь бүх
                  давхаргыг нуусан (`viewIds = []`), эсвэл `butets` эрхтэй ч
                  `scope = []`. Урьд нь «0 багц» гэсэн хоосон жагсаалт, «0.0 км»
                  гарч — эвдэрсэн юм шиг уншигддаг байв. Шалтгааныг ил хэлнэ. */}
              {noScope && (
                <Note>
                  {tr('Танд багц хуваарилагдаагүй — админд хандана уу')}
                </Note>
              )}
              {/*
                * ⚠️ «Гүйцэтгэл» харагдацын «Дэд бүтэц» бүлэгтэй ЯГ ИЖИЛ хэлбэр
                * (`PkgProg.TsPackList`): нэг хураагддаг хэсэг, доор нь багц
                * бүр «N давхарга» гэсэн дэд мөртэй.
                *
                * ⚠️ 2026-09-14: УРТЫН БАГАНА БҮРЭН ХАСАГДСАН тул энэ жагсаалт
                * `totals`-аас ОГТ хамаарахгүй болов — `Data` боодол ч
                * хасагдав. Урьд нь «Урт тооцоолж байна…» гэж хүлээдэг байсан нь
                * одоо ЗӨВХӨН нэр харуулах жагсаалтыг ХОЙШЛУУЛАХ утгагүй хүлээлт
                * болох байв. Зүүн талын KPI-ууд нь өөрсдийн `Data`-тай тул
                * урт тооцоолол ТЭНД хэвээр.
                */}
              <Section
                title={tr('Дэд бүтэц')}
                note={tr('{0} багц · {1}', num(viewPacks.length), tr('зурагт харагдах давхарга'))}
                collapsible
              >
                <List>
                  {/* ⚠️ `viewPacks` — багцын аккаунтад зөвхөн өөрийн багц (2026-09-23) */}
                  {viewPacks.map((x) => {
                    /**
                     * ⚠️ ЗАДРАХ нь СОНГОЛТТОЙ НЭГ л төлөв (2026-09-11,
                     * хэрэглэгчийн хүсэлт). `pickRow` нь ижил түлхүүрийг
                     * дахин дарахад `null` болгодог тул «дарвал задарна,
                     * буцаад дарвал хаагдана» гэдэг нь ЗҮГЭЭР Л сонголтын
                     * toggle — тусад нь `open` төлөв хэрэггүй.
                     *
                     * ⚠️ ХОЁР ТӨЛӨВ БОЛГОХГҮЙ: задарсан ч сонгогдоогүй багц
                     * гарвал зурагт юу үлдэхийг жагсаалт нь ХУДАЛ хэлнэ
                     * (доорх `Note`-ыг үз — багц дарахад зурагт зөвхөн
                     * тэр багцын давхарга үлддэг).
                     */
                    const open = sel?.key === x.key;
                    return (
                      <Fragment key={x.key}>
                        <ListItem
                          title={tr(x.name)}
                          sub={x.layerIds.length
                            ? tr('{0} давхарга', num(x.layerIds.length))
                            : tr('зураггүй')}
                          /* ⚠️ УРТЫН УТГА ХАСАГДСАН (2026-09-14, хэрэглэгчийн
                             скриншот: «эдгээрийг хас»). Багцын мөр ба задарсан
                             давхаргын мөр ХОЁУЛАА км-гүй болов — жагсаалт нь
                             навигаци тул нэр нь л уншигдах ёстой. Тоо хэмжээ
                             давхарга дарахад доор задардаг өгөгдлийн хураангуйд
                             (`PackLayers.LayerFields`) байгаа. */
                          color="var(--c3)"
                          active={open}
                          onClick={() => pickRow({ key: x.key, ids: x.layerIds })}
                        />
                        {/* ⚠️ Задрах хэсэг нь ХУВААЛЦСАН `PackLayers` — «Багцын
                            гүйцэтгэл» хуудас ч ЯГ үүнийг хэрэглэнэ. */}
                        {open && <PackLayers layerIds={x.layerIds} />}
                      </Fragment>
                    );
                  })}
                </List>
              </Section>
              <Note>
                {tr('Гэрээний багц нь ЕТ-ийн шугамтай ижил трасс дээр давхарладаг тул анхнаасаа унтраалттай. Багц дарахад зурагт зөвхөн тэр багцын давхарга үлдэнэ.')}
              </Note>
            </>
      </div>
      )}
    </div>
  );
}
