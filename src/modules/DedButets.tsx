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
  dropTotalsCache, usePlanTotals, usePlanTotalsLive,
  type LiveTotals, type Totals,
} from '@/lib/totals';
import { PackLayers, Swatch } from '@/components/PackLayers';
import { List, ListItem, Note, Section, Stat, Stats } from '@/components/ui';
import {
  DED_BUTETS_LAYER_IDS, INFRA_SYSTEMS, LAYER_BY_ID, OID,
  PKG_FAMILY_BY_BAGTS,
} from '@/lib/services';
import { buildPacks, type Pack } from './Bagts';
import { km, num } from '@/lib/format';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import { DedButetsEdit, type UndoInfo } from './DedButetsEdit';
import {
  applyAttrs, deleteRow, loadGeometry, loadLayerMeta, saveGeometry,
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

/** Давхаргын урт (м) — татагдаагүй/хэмжээгүй бол 0 */
const lenOf = (t: Map<string, Totals>, id: string) => t.get(id)?.q ?? 0;

/** Давхаргын тоо — татагдаагүй бол 0 */
const cntOf = (t: Map<string, Totals>, id: string) => t.get(id)?.n ?? 0;

/**
 * БАГЦЫН НИЙЛБЭР — БҮГД ирсэн үед л тоо, эс бөгөөс `null`.
 *
 * ⚠️ `null` нь «хараахан мэдэгдэхгүй», 0 нь «хэмжилт тэг». Хоёрыг нэгтгэвэл
 * ачаалж байх зуур «0.0 км» гэж гарч, хэрэглэгч түүнийг бодит дүн гэж
 * уншина (порталын `null ≠ 0` дүрэм).
 */
const sumOf = (t: LiveTotals, ids: string[]): number | null =>
  ids.reduce<number | null>(
    (a, id) => (a == null ? null : (t.map.has(id) ? a + lenOf(t.map, id) : null)),
    0,
  );

/** Багцын тоон нийлбэр — `sumOf`-ийн ижил дүрмээр */
const countOf = (t: LiveTotals, ids: string[]): number | null =>
  ids.reduce<number | null>(
    (a, id) => (a == null ? null : (t.map.has(id) ? a + cntOf(t.map, id) : null)),
    0,
  );

/** Хүлээж буй утгын тэмдэг — тоо биш тул `num` форматаас ГАДУУР */
const WAIT = "…";
const kmOrWait = (m: number | null) => (m == null ? WAIT : km(m, 1));
const cntOrWait = (n: number | null) => (n == null ? WAIT : num(n));



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

  const toast = useCallback((msg: string) => {
    setSaved(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setSaved(''), 4000);
  }, []);

  /**
   * ХАДГАЛААГҮЙ VERTEX ЗАСВАРЫГ ХАЯХЫГ АСУУНА.
   *
   * ⚠️ Гурван зам дээр ЗААВАЛ дуудагдана: өөр объект дарах, «Атрибут» таб руу
   * шилжих, засварын горимоос гарах. Эдгээрийн аль нэг дээр асуухаа мартвал
   * чирсэн ажил ЧИМЭЭГҮЙ алга болно — vertex зөөх нь урт, нямбай ажил тул
   * дахин хийхэд хэдэн минут алдана.
   */
  const askDropReshape = useCallback(
    () => reshaped == null
      || window.confirm(tr('Хадгалаагүй хэлбэрийн засвар байна. Хаях уу?')),
    [reshaped],
  );

  /**
   * ГЕОМЕТР ТАТАХ ДАРААЛЛЫН ТОКЕН.
   *
   * ⚠️ Хоёр объект дараалан дарахад хоёр `loadGeometry` зэрэг явна. Сүлжээний
   * хариу дараалал нь БАТАЛГААГҮЙ тул хамгаалалтгүй бол ЭХНИЙ товшилтын
   * хожуу ирсэн геометр нь хоёр дахийг дарж, хэрэглэгч БУРУУ объектын
   * vertex-ийг зөөнө (`MapCanvas.clickSeq`-ийн ижил сургамж).
   */
  const geomSeq = useRef(0);

  const { user, status: authStatus } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  /**
   * ⚠️ ЗАСАХ ЭРХ ТУСДАА (`caps` → `butets`). Дэд бүтцийг ХАРАХ нь түүний
   *    хэмжээг СОЛИХ эрх биш: `urt_m` нэг тоо засахад каталогийн багана,
   *    энэ хуудасны км, «Эрсдэлийн загвар»-ын хохирлын үнэлгээ бүгд дагана.
   */
  const canEdit = useMemo(
    () => authStatus === 'off' || hasCap(user?.username, 'butets'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, authStatus, capN],
  );

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
   * ⚠️ ХООСОН БИШ БАЙХ НЬ ЧУХАЛ: `MapCanvas` нь сонголт ХООСОН үед
   * `BASE_MAP_IDS`-ийн 14 суурь давхаргыг БҮГДИЙГ асаадаг (`bare: false`).
   * Энэ жагсаалт 16 элементтэй тул тэр салаа хэзээ ч ажиллахгүй.
   *
   * ⚠️ Гэрээний багц (`pkg:*`) АНХНААСАА УНТРААЛТТАЙ: тэдгээр нь ЕТ-ийн
   * шугамтай ижил трасс дээр давхарлагдан зурагддаг тул хоёулаа зэрэг асвал
   * аль нь аль болох нь ялгагдахгүй. Баруун жагсаалтаас эсвэл каталогоос асна.
   *
   * ⚠️ Контекст хэрэгтэй бол «Давхарга» каталогоос гараар нэмнэ — суурь нь
   * зөвхөн ЭХНИЙ байдлыг заана, хориглохгүй.
   */
  const base = useMemo(() => [...DED_BUTETS_LAYER_IDS], []);

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
    if (editMode) return DED_BUTETS_LAYER_IDS;
    /* ⚠️ Сонгосон багцын давхаргууд ЗӨВХӨНӨӨРӨӨ — суурьтай ижил зарчим
       (дээрх `base`-ийн тэмдэглэл). Контекст хэрэгтэй бол каталогоос. */
    if (sel) return sel.ids;
    return visible;
  }, [editMode, sel, visible]);

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
  const catTotals = usePlanTotals(zone, layerOpen);

  /** Хоёр баганын урт ба тоо — ЭНЭ цонхны 30 орчим давхаргаар */
  /**
   * ⚠️ KPI нь ДЭВШИЛТТЭЙ хувилбараар (`usePlanTotalsLive`): 74 давхаргын
   * бүгд ирэхийг хүлээвэл 4.2 секунд хоосон зогсоно (хэмжилтийг
   * `totals.ts`-ийн тайлбараас үз). Одоо багц бүр бэлэн болмогц өөрийн
   * тоогоо гаргана.
   */
  const totals = usePlanTotalsLive(zone, true, TOTAL_IDS);

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
  const onMapPick = useCallback((a: Record<string, unknown> | null, id: string | null) => {
    if (!editMode) return;
    if (!a || !id || !DED_BUTETS_LAYER_IDS.includes(id)) {
      setPick(null); setHighlight(null); return;
    }
    /* ⚠️ Давхарга бүрийн OID нэр ижил байх албагүй — бүртгэлээс уншина */
    const oidField = LAYER_BY_ID[id]?.oid ?? OID;
    const oid = Number(a[oidField]);
    if (!Number.isFinite(oid)) { setPick(null); return; }

    /* ⚠️ Өөр объект руу шилжихээс ӨМНӨ хадгалаагүй vertex засварыг асууна —
       эс бөгөөс чирсэн ажил чимээгүй алга болно. */
    if (!askDropReshape()) return;
    cancelReshape();
    setTplOpen(false);
    setAwaitDraw(false);
    setPick({ layerId: id, oid });
    setHighlight(`${oidField} = ${Math.trunc(oid)}`, id);
  }, [editMode, askDropReshape, cancelReshape, setHighlight]);

  /**
   * САМБАРЫГ ХААХ — сонголт цэвэрлэгдэнэ.
   *
   * ⚠️ ХАДГАЛААГҮЙ VERTEX-ийг ЗААВАЛ асууна. Маягт ба хэлбэр засах нь одоо
   * НЭГ самбарт зэрэг амьдардаг тул «Хаах» нь хоёуланг нь хаана. Асуухгүй
   * бол чирсэн ажил чимээгүй алга болно — энэ нь таб байхад гардаггүй байсан
   * шинэ зам (тэр үед хэлбэр засах нь тусдаа горим байв).
   */
  const closeEdit = useCallback(() => {
    if (!askDropReshape()) return;
    setReshape(null);
    setReshaped(null);
    setPick(null);
    setHighlight(null);
    /* ⚠️ Зурсан түр дүрсийг ЗААВАЛ арилгана — маягтыг хаасан ч зурагт үлдвэл
       «нэмэгдчихсэн юм болов уу» гэж уншигдана. */
    setClearToken((x) => x + 1);
  }, [askDropReshape, setHighlight]);

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
        const meta = await loadLayerMeta(layerId);
        const g = await loadGeometry(meta, oid);
        /* ⚠️ Хоцорсон хариу — шинэ сонголт аль хэдийн явж байна */
        if (seq !== geomSeq.current) return;
        if (!g) { toast(tr('Геометр олдсонгүй')); return; }
        setReshape({ layerId, oid, geometry: g });
        setReshapeToken((x) => x + 1);
      } catch (e) {
        if (seq === geomSeq.current) toast(String((e as Error).message || e));
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
  const removeFeature = useCallback(async () => {
    if (!pick || pick.oid == null) return;
    const { layerId, oid } = pick;
    if (!window.confirm(tr('Энэ объектыг БҮРМӨСӨН устгана. Буцаах аргагүй. Үргэлжлүүлэх үү?'))) return;
    setDelBusy(true);
    try {
      const meta = await loadLayerMeta(layerId);
      await deleteRow(meta, oid);
      refreshLayer(layerId);
      dropTotalsCache();
      /* ⚠️ Устгасны дараа сонголт ХООСОН — байхгүй мөрийн маягт нээлттэй
         үлдвэл дараагийн «Хадгалах» нь сервер дээр олдохгүй мөр рүү бичнэ. */
      setUndoable(null);
      closeEdit();
      toast(tr('Объект устгагдлаа'));
    } catch (e) {
      toast(String((e as Error).message || e));
    } finally {
      setDelBusy(false);
    }
  }, [pick, refreshLayer, toast, closeEdit]);

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
      dropTotalsCache();
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
      toast(String((e as Error).message || e));
    } finally {
      setGeomBusy(false);
    }
  }, [reshape, reshaped, refreshLayer, toast]);

  /**
   * СҮҮЛИЙН ҮЙЛДЛИЙГ БУЦААНА.
   *
   * ⚠️ ШИНЭЭР НЭМСЭН объектын буцаалт нь УСТГАЛ — эдгээр үйлчилгээнд
   * хувилбарын түүх асаагүй тул бүрмөсөн алга болно. Тиймээс ЗААВАЛ
   * баталгаажуулалт асууна (`tableWrite`-ийн дүрэм).
   */
  const undo = useCallback(async () => {
    if (!undoable) return;
    if (undoable.kind === 'add'
      && !window.confirm(tr('Сая нэмсэн объектыг УСТГАНА. Буцаах аргагүй. Үргэлжлүүлэх үү?'))) {
      return;
    }
    setUndoBusy(true);
    try {
      const meta = await loadLayerMeta(undoable.layerId);
      if (undoable.kind === 'add') await deleteRow(meta, undoable.oid);
      else if (undoable.kind === 'attr') await applyAttrs(meta, undoable.oid, undoable.attrs);
      else await saveGeometry(meta, undoable.oid, undoable.geometry);
      refreshLayer(undoable.layerId);
      dropTotalsCache();
      setUndoable(null);
      toast(tr('Үйлдэл буцаагдлаа'));
    } catch (e) {
      toast(String((e as Error).message || e));
    } finally {
      setUndoBusy(false);
    }
  }, [undoable, refreshLayer, toast]);

  /**
   * ТЭМПЛЭЙТ СОНГОГДОВ — зураалт ШУУД эхэлнэ (EB-ийн edit widget-ийн зан).
   *
   * ⚠️ Сонголт ба зураалтыг хоёр товч болговол («давхаргаа сонго» → «зурж
   * нэмэх») нэмэлт алхам үүснэ. EB-д тэмплэйт дарах нь өөрөө «одоо зурна»
   * гэсэн үг — энд ч ижил.
   */
  const pickTemplate = useCallback((id: string) => {
    setAddTo(id);
    setTplOpen(false);
    setAwaitDraw(true);
    setPick(null);
    setHighlight(null);
    setDrawToken((x) => x + 1);
  }, [setHighlight]);

  /** Зурах хэрэгслийн төрөл — сонгосон давхаргаас */
  const drawKind = useMemo(
    () => DRAW_OF[LAYER_BY_ID[addTo]?.geom ?? 'line'] ?? 'polyline',
    [addTo],
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
        return !needle || tr(L.title).toLowerCase().includes(needle);
      }),
    })).filter((g) => g.ids.length > 0);
  }, [tplQ]);

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
    if (!g) return;
    setAwaitDraw(false);
    setPick({ layerId: addTo, oid: null, geometry: g.toJSON() as unknown });
  }, [addTo]);

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
    /* ⚠️ Чирсэн ажлыг хаяхаас өмнө асууна (`askDropReshape`-ийн тайлбар) */
    if (!askDropReshape()) return;
    setEditMode(false);
    setTplOpen(false);
    setAwaitDraw(false);
    setPick(null);
    setReshape(null);
    setReshaped(null);
    setUndoable(null);
    setHighlight(null);
    setClearToken((x) => x + 1);
  }, [askDropReshape, setHighlight]);

  const noop = useCallback(() => {}, []);

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
          <Stats cols={4}>
            <Stat
              value={kmOrWait(sumOf(totals, NET_IDS))}
              unit={tr('км')}
              label={tr('Инженерийн шугам — нийт')}
            />
            <Stat
              value={kmOrWait(sumOf(totals, SYSTEMS[0].ids))}
              unit={tr('км')}
              label={tr('Үүнээс дулаан хангамж')}
            />
            <Stat
              value={kmOrWait(sumOf(totals, PKG_IDS))}
              unit={tr('км')}
              label={tr('Гэрээний багцын шугам')}
            />
            <Stat
              value={cntOrWait(countOf(totals, WELL_IDS))}
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
            drawToken={drawToken}
            drawKind={drawKind}
            reshapeGeometry={reshape?.geometry}
            reshapeToken={reshapeToken}
            onReshape={onReshape}
            sketchUndoToken={sketchUndoToken}
            clearToken={clearToken}
            onPick={editMode ? onMapPick : noop}
          />

          <MapTools
            dim={dim}
            setDim={setDim}
            layersOpen={layerOpen}
            onLayers={() => setLayerOpen((v) => !v)}
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
                onClick={() => {
                  if (!askDropReshape()) return;
                  cancelReshape();
                  setTplOpen((v) => !v);
                  setAwaitDraw(false);
                  setPick(null);
                  setHighlight(null);
                }}
              >
                {tr('Шинэ объект')}
              </button>
              <span className={d.editHint}>
                {awaitDraw
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
                  onClick={() => { void undo(); }}
                  disabled={undoBusy}
                  title={undoable.kind === 'add'
                    ? tr('Сая нэмсэн объектыг устгана')
                    : undoable.kind === 'geom'
                      ? tr('Хэлбэрийг өмнөх байдалд нь сэргээнэ')
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
          {pick && (
            <DedButetsEdit
              layerId={pick.layerId}
              oid={pick.oid}
              geometry={pick.geometry}
              canEdit={canEdit}
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
                        onClick={() => { if (askDropReshape()) cancelReshape(); }}
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
                      disabled={!canEdit || geomBusy || delBusy}
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
                    onClick={() => { void removeFeature(); }}
                    disabled={!canEdit || delBusy || geomBusy || reshape != null}
                  >
                    {delBusy ? tr('Устгаж байна…') : tr('Устгах')}
                  </button>
                </div>
              )}
              onDone={(n, back: UndoInfo | null) => {
                const id = pick.layerId;
                const created = pick.oid == null;
                closeEdit();
                /* ⚠️ Буцаалтыг МАЯГТ бэлддэг: хуучин утгууд зөвхөн түүний
                   дотор амьдардаг бөгөөд хаагдмагц алга болно. */
                setUndoable(back ? { ...back, layerId: id } : null);
                /**
                 * ⚠️ ДАВХАРГЫГ ДАХИН УНШУУЛНА. FeatureLayer нь татсан объектоо
                 * клиент дээрээ кэшлэдэг бөгөөд бичилт нь SDK-аар биш ШУУД
                 * REST-ээр явсан тул зассан утга ХУУЧНААРАА үлдэнэ.
                 * ⚠️ Уртын нийлбэрийн кэш нь тусдаа (`totals.ts`-ийн Map) —
                 * түүнийг хаяхгүй бол зүүн баганын км хуучин утгаараа үлдэнэ.
                 */
                if (n > 0) { refreshLayer(id); dropTotalsCache(); }
                /* ⚠️ 0 нь АМЖИЛТГҮЙ биш — юу ч өөрчлөөгүй гэсэн үг. Хоёрыг нэг
                   мессежээр хэлбэл «хадгалагдсангүй» гэж уншигдана. */
                toast(created
                  ? tr('Шинэ объект нэмэгдлээ')
                  : n > 0
                    ? tr('{0} талбар хадгалагдлаа', num(n))
                    : tr('Өөрчлөлт байсангүй'));
              }}
            />
          )}

          {saved && <p className={d.saved} role="status">{saved}</p>}

          {layerOpen && (
            <div className={`${o.catPanel} ${d.catPanel}`}>
              {/* ⚠️ `view="dedButets"` нь каталогийн «Инженерийн дэд бүтэц»
                  (`infra`, Test0911S-ийн 73 давхарга) бүлгийг ХАМГИЙН ДЭЭР
                  гаргана (`services.ts` §catalogGroups). */}
              <LayerCatalog
                view="dedButets"
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
              visible={visible}
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
                note={tr('{0} багц · {1}', num(INFRA_PACKS.length), tr('зурагт харагдах давхарга'))}
                collapsible
              >
                <List>
                  {INFRA_PACKS.map((x) => {
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
