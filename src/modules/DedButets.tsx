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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools, MapToolBtn } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { dropTotalsCache, usePlanTotals, type Totals } from '@/lib/totals';
import { Data, List, ListItem, Note, Section, Stat, Stats } from '@/components/ui';
import {
  DED_BUTETS_LAYER_IDS, LAYER_BY_ID, OID,
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

/** Хэмжилтгүй мөрийн тэмдэг — орчуулга шаардахгүй тул `tr()`-гүй */
const DASH = '—';
import o from './dedButetsOv.module.css';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import d from './dedButets.module.css';

/* ══════════════════ ОДООГИЙН СҮЛЖЭЭ — ЕТ-ийн шугам ══════════════════ */

/**
 * Инженерийн систем бүр ба түүнд харьяалагдах ЕТ-ийн давхаргууд.
 *
 * ⚠️ 2026-09-02-оос ЖАГСААЛТ БОЛЖ ЗУРАГДАХАА БОЛЬСОН («Одоогийн сүлжээ»
 * багана хэрэглэгчийн хүсэлтээр хасагдав). Үлдсэн ХОЁР үүрэг нь:
 *   · толгойн «Үүнээс дулаан хангамж» үзүүлэлт (`SYSTEMS[0]`),
 *   · доорх dev-шалгуур — `DED_BUTETS_LAYER_IDS` бүрэн бүлэглэгдсэн эсэх.
 * Устгавал тэр хоёр чимээгүй алдагдана.
 *
 * ⚠️ Эдгээр яг тэр 14 давхарга нь «Эрсдэлийн загвар»-ын хохирлын үнэлгээнд
 * (`Ersdel.tsx` §ASSESS_IDS) ашиглагддагтай ИЖИЛ — үер/аюулын бүсэд өртөх
 * дэд бүтцийг тэндээс тоолдог. Энд нэмж/хасвал хоёр цонхны «дэд бүтэц» гэдэг
 * ойлголт сална.
 *
 * ⚠️ `et:18`, `et:19` нь ASSESS_IDS-д БАЙХГҮЙ (төлөвлөж буй цэвэр ус, хөрсний
 * ус шүүрүүлэх) — тэдгээр нь каталогийн `pkgNet` бүлэгт бий тул энд бүрэн
 * дүр зургийн төлөө нэмэгдсэн.
 */
const SYSTEMS: { key: string; title: string; hue: string; ids: string[] }[] = [
  {
    key: 'heat',
    title: tr('Дулаан хангамж'),
    hue: '#dc2626',
    ids: ['et:7', 'et:10', 'et:9', 'et:11', 'et:8'],
  },
  {
    key: 'water',
    title: tr('Цэвэр ус хангамж'),
    hue: '#0891b2',
    ids: ['et:4', 'et:18', 'et:23'],
  },
  {
    key: 'sewer',
    title: tr('Ариутгах татуурга, хөрсний ус'),
    hue: '#7c3aed',
    ids: ['et:17', 'et:16', 'et:3', 'et:19'],
  },
  {
    key: 'power',
    title: tr('Цахилгаан хангамж'),
    hue: '#f59e0b',
    ids: ['et:124', 'et:125', 'et:126', 'et:127'],
  },
];

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

/** Багцуудын БҮХ давхарга — нийлбэрийн хүсэлтэд */
const PKG_IDS = [...new Set(INFRA_PACKS.flatMap((x) => x.layerIds))];

/** Хоёр баганын нийлбэрийг НЭГ хүсэлтийн багцаар (`usePlanTotals`) */
const TOTAL_IDS = [...new Set([...NET_IDS, ...PKG_IDS])];

/* ══════════════════ Туслах ══════════════════ */

/** Давхаргын урт (м) — татагдаагүй/хэмжээгүй бол 0 */
const lenOf = (t: Map<string, Totals>, id: string) => t.get(id)?.q ?? 0;

/** Давхаргын тоо — татагдаагүй бол 0 */
const cntOf = (t: Map<string, Totals>, id: string) => t.get(id)?.n ?? 0;

/** Давхаргуудын нийт урт (м) */
const sumLen = (t: Map<string, Totals>, ids: string[]) =>
  ids.reduce((a, id) => a + lenOf(t, id), 0);

/**
 * Уртыг ЖАГСААЛТЫН УТГА болгоно.
 *
 * ⚠️ Уртгүй давхарга (цэгэн — бохирын худаг, ДХТ) нь «—» БИШ, ШИРХЭГ-ээр
 * бичигдэнэ: «0 км» гэвэл «хэмжилт алга» ба «урт нь тэг» хоёр нэг харагдана.
 */
const lenText = (t: Map<string, Totals>, ids: string[]): string => {
  const m = sumLen(t, ids);
  if (m > 0) return `${km(m, 1)} ${tr('км')}`;
  const n = ids.reduce((a, id) => a + cntOf(t, id), 0);
  return n > 0 ? tr('{0} ш', num(n)) : DASH;
};

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
  /** Товч дарах бүрд өснө — `MapCanvas` үүгээр зураалт эхлүүлнэ */
  const [drawToken, setDrawToken] = useState(0);
  /** Зурсан дүрсийг арилгах дохио */
  const [clearToken, setClearToken] = useState(0);

  /* ── ХЭЛБЭР (vertex) ЗАСАХ ── */

  /**
   * Засварын ДЭД ГОРИМ: атрибут уу, хэлбэр үү.
   *
   * ⚠️ ХОЁРЫГ САЛГАСАН ШАЛТГААН: нэг товшилт хоёр өөр үйлдэл хийж чадахгүй.
   * Хэрэв объект дарахад маягт ба vertex-ийн бариул ЗЭРЭГ гарвал маягт
   * бариулуудыг бүрхэж, чирэх гэсэн хөдөлгөөн модалын ард үлдэнэ.
   */
  const [geomMode, setGeomMode] = useState(false);
  /** Хэлбэрийг нь засаж буй объект */
  const [reshape, setReshape] = useState<
    { layerId: string; oid: number; geometry: unknown } | null
  >(null);
  /** Чирсний дараах шинэ геометр — хадгалаагүй бол `null` */
  const [reshaped, setReshaped] = useState<unknown>(null);
  const [reshapeToken, setReshapeToken] = useState(0);
  const [geomBusy, setGeomBusy] = useState(false);
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
  const toast = useCallback((msg: string) => {
    setSaved(msg);
    window.setTimeout(() => setSaved(''), 4000);
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
   */
  const dotStyle = useMemo(
    () => ({
      'et:3': { size: 2.6 },
      'et:4': { size: 4 },
      /* ХТП/РП-ийн цэгүүд — багц сонгоход л гарна, гэхдээ ижил хэмжүүрт */
      'pkg:147': { size: 4 },
      'pkg:149': { size: 4 },
      'pkg:153': { size: 4 },
      'pkg:156': { size: 4 },
    }),
    [],
  );

  /** Каталогийн багана — зөвхөн жагсаалт нээлттэй үед татна (Irged-тэй ижил) */
  const catTotals = usePlanTotals(zone, layerOpen);

  /** Хоёр баганын урт ба тоо — ЭНЭ цонхны 30 орчим давхаргаар */
  const totals = usePlanTotals(zone, true, TOTAL_IDS);

  /** Тайлбарт багтаагүй давхаргын тоо («+N») */
  const legendHidden = useMemo(
    () => Math.max(0, mapVisible.filter((id) => LAYER_BY_ID[id]).length - 8),
    [mapVisible],
  );

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

    if (geomMode) {
      /**
       * ХЭЛБЭР ЗАСАХ — геометрийг ТАТАЖ зурах давхаргад буулгана.
       *
       * ⚠️ Товшилтын `onPick` нь зөвхөн АТРИБУТ өгдөг (`MapCanvas`-ийн
       * `pickByQuery` нь `returnGeometry: false`) тул геометрийг тусад нь
       * авахаас өөр аргагүй. Мөн энэ нь ЗӨВ: hitTest-ийн буцаасан геометр
       * нь дэлгэцийн нягтралаар ХЯЛБАРШУУЛСАН байж болох бөгөөд түүнийг
       * буцааж бичвэл vertex-үүд чимээгүй алдагдана.
       */
      if (!askDropReshape()) return;
      const seq = ++geomSeq.current;
      setReshaped(null);
      setHighlight(null);
      void (async () => {
        try {
          const meta = await loadLayerMeta(id);
          const g = await loadGeometry(meta, oid);
          /* ⚠️ Хоцорсон хариу — шинэ товшилт аль хэдийн явж байна */
          if (seq !== geomSeq.current) return;
          if (!g) { toast(tr('Геометр олдсонгүй')); return; }
          setReshape({ layerId: id, oid, geometry: g });
          setReshapeToken((x) => x + 1);
        } catch (e) {
          if (seq === geomSeq.current) toast(String((e as Error).message || e));
        }
      })();
      return;
    }

    setPick({ layerId: id, oid });
    setHighlight(`${oidField} = ${Math.trunc(oid)}`, id);
  }, [editMode, geomMode, askDropReshape, toast, setHighlight]);

  const closeEdit = useCallback(() => {
    setPick(null);
    setHighlight(null);
    /* ⚠️ Зурсан түр дүрсийг ЗААВАЛ арилгана — маягтыг хаасан ч зурагт үлдвэл
       «нэмэгдчихсэн юм болов уу» гэж уншигдана. */
    setClearToken((x) => x + 1);
  }, [setHighlight]);

  /** Vertex чирэх бүрд — хадгалаагүй шинэ хэлбэрийг санана */
  const onReshape = useCallback((g: __esri.Geometry | null) => {
    if (g) setReshaped(g.toJSON() as unknown);
  }, []);

  /** Хэлбэр засахаас гарах — зурсан хуулбарыг арилгана */
  const cancelReshape = useCallback(() => {
    setReshape(null);
    setReshaped(null);
    setClearToken((x) => x + 1);
  }, []);

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

  /** «Зурж нэмэх» — сонгосон давхаргын геометрийн төрлөөр зураалт эхэлнэ */
  const startDraw = useCallback(() => {
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
    setGeomMode(false);
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
          <Data q={totals} loading={tr('Тооцоолж байна…')}>
            {(t) => {
              const netM = NET_IDS.reduce((a, id) => a + lenOf(t, id), 0);
              const pkgM = PKG_IDS.reduce((a, id) => a + lenOf(t, id), 0);
              const wells = cntOf(t, 'et:3');
              const heatM = SYSTEMS[0].ids.reduce((a, id) => a + lenOf(t, id), 0);
              return (
                <Stats cols={4}>
                  <Stat
                    value={km(netM, 1)}
                    unit={tr('км')}
                    label={tr('Инженерийн шугам — нийт')}
                  />
                  <Stat
                    value={km(heatM, 1)}
                    unit={tr('км')}
                    label={tr('Үүнээс дулаан хангамж')}
                  />
                  <Stat
                    value={km(pkgM, 1)}
                    unit={tr('км')}
                    label={tr('Гэрээний багцын шугам')}
                  />
                  <Stat
                    value={num(wells)}
                    unit={tr('ш')}
                    label={tr('Бохирын худаг')}
                  />
                </Stats>
              );
            }}
          </Data>
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
            * Хажуугийн багана, үзүүлэлтийн зурвас нь unmount болсон тул
            * зөвхөн зураг үлдэж, энэ зурвас нь гарчиг ба гарах замыг өгнө.
            */}
          {editMode && (
            <div className={d.editBar}>
              <span className={d.editTitle}>{tr('Дэд бүтэц засах')}</span>
              {/* ⚠️ ДЭД ГОРИМЫН СОЛИГЧ — товшилт нэг зэрэг ЗӨВХӨН нэг зүйл
                  хийнэ (дээрх `geomMode`-ийн тайлбарыг үз). */}
              <div className={d.editTabs} role="group" aria-label={tr('Юуг засах')}>
                <button
                  type="button"
                  className={`${d.editTab} ${geomMode ? '' : d.editTabOn}`}
                  aria-pressed={!geomMode}
                  onClick={() => {
                    if (!askDropReshape()) return;
                    setGeomMode(false);
                    cancelReshape();
                  }}
                >
                  {tr('Атрибут')}
                </button>
                <button
                  type="button"
                  className={`${d.editTab} ${geomMode ? d.editTabOn : ''}`}
                  aria-pressed={geomMode}
                  onClick={() => { setGeomMode(true); setPick(null); setHighlight(null); }}
                >
                  {tr('Хэлбэр')}
                </button>
              </div>
              <span className={d.editHint}>
                {geomMode
                  ? reshape
                    ? tr('Цэгүүдийг чирж зөөнө. Шинэ цэг нэмэхдээ ирмэгийн дунд дарна.')
                    : tr('Хэлбэрийг нь засах объектоо зураг дээр дарна уу.')
                  : tr('Байгаа объектыг дарж засна. Шинийг нэмэхдээ давхаргаа сонгоод «Зурж нэмэх».')}
              </span>
              {/* ⚠️ ДАВХАРГАА ЭХЛЭЭД сонгоно — ArcGIS Experience Builder-ийн
                  editor-ын «feature template» сонголттой ижил дараалал. Схем нь
                  давхарга бүрт өөр тул зурсны ДАРАА сонгуулбал бөглөсөн маягт
                  хүчингүй болох эрсдэлтэй.
                  ⚠️ «Нэмэх» хэрэгслүүд нь ЗӨВХӨН атрибутын горимд — хэлбэр
                  засаж байхад шинэ дүрс зурвал `SketchViewModel` нь идэвхтэй
                  `update`-ыг таслаж, чирсэн өөрчлөлт чимээгүй алдагдана. */}
              {!geomMode && (
                <>
                  <select
                    className={d.editSel}
                    value={addTo}
                    onChange={(e) => setAddTo(e.target.value)}
                    aria-label={tr('Аль давхаргад нэмэх')}
                  >
                    {DED_BUTETS_LAYER_IDS.map((id) => (
                      <option key={id} value={id}>{LAYER_BY_ID[id]?.title ?? id}</option>
                    ))}
                  </select>
                  <button type="button" className={d.editAdd} onClick={startDraw}>
                    {drawKind === 'point' ? tr('Цэг нэмэх') : tr('Зурж нэмэх')}
                  </button>
                </>
              )}
              {/* ⚠️ ЗУРААЛТЫН алхам буцаах — ЗӨВХӨН чирж байх үед. Доорх
                  «Үйлдэл буцаах»-аас ӨӨР: энэ нь хадгалаагүй vertex-ийг,
                  тэр нь БИЧИГДСЭН засварыг сэргээнэ. Хоёулаа зэрэг гарахгүй. */}
              {geomMode && reshape && (
                <button
                  type="button"
                  className={d.editClose}
                  onClick={() => setSketchUndoToken((x) => x + 1)}
                  disabled={geomBusy}
                  title={tr('Зурсан сүүлийн алхмыг цуцлана')}
                >
                  {tr('Алхам буцаах')}
                </button>
              )}
              {geomMode && reshape && (
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
                  <button
                    type="button"
                    className={d.editClose}
                    onClick={() => { if (askDropReshape()) cancelReshape(); }}
                    disabled={geomBusy}
                  >
                    {tr('Болих')}
                  </button>
                </>
              )}
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

          {pick && (
            <DedButetsEdit
              layerId={pick.layerId}
              oid={pick.oid}
              geometry={pick.geometry}
              canEdit={canEdit}
              onCancel={closeEdit}
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
              {/* ⚠️ `view="dedButets"` нь каталогийн «Гадна дулаан, ус,
                  ариутгах татуурга» (`pkgNet`) бүлгийг ХАМГИЙН ДЭЭР гаргана
                  (`services.ts` §catalogGroups). */}
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
        <Data q={totals} loading={tr('Урт тооцоолж байна…')}>
          {(t) => (
            <>
              {/*
                * ⚠️ «Гүйцэтгэл» харагдацын «Дэд бүтэц» бүлэгтэй ЯГ ИЖИЛ хэлбэр
                * (`PkgProg.TsPackList`): нэг хураагддаг хэсэг, доор нь багц
                * бүр «N давхарга» гэсэн дэд мөртэй. ЯЛГАА нь ЗӨВХӨН УТГАД —
                * тэнд биет явцын өгөгдөл байхгүй тул «—» гардаг бол энд
                * давхаргын УРТ бий.
                */}
              <Section
                title={tr('Дэд бүтэц')}
                note={tr('{0} багц · {1}', num(INFRA_PACKS.length), tr('зурагт харагдах давхарга'))}
                collapsible
              >
                <List>
                  {INFRA_PACKS.map((x) => (
                    <ListItem
                      key={x.key}
                      title={tr(x.name)}
                      sub={x.layerIds.length
                        ? tr('{0} давхарга', num(x.layerIds.length))
                        : tr('зураггүй')}
                      value={lenText(t, x.layerIds)}
                      color="var(--c3)"
                      active={sel?.key === x.key}
                      onClick={() => pickRow({ key: x.key, ids: x.layerIds })}
                    />
                  ))}
                </List>
              </Section>
              <Note>
                {tr('Гэрээний багц нь ЕТ-ийн шугамтай ижил трасс дээр давхарладаг тул анхнаасаа унтраалттай. Багц дарахад зурагт зөвхөн тэр багцын давхарга үлдэнэ.')}
              </Note>
            </>
          )}
        </Data>
      </div>
      )}
    </div>
  );
}
