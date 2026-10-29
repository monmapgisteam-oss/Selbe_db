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
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSyncRef } from '@/lib/useSyncRef';
import { setNavDirty } from '@/lib/navGuard';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools, MapToolBtn } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { dropTotalsCache, missingQty, retryTotals, usePlanTotalsLive, type LiveTotals, type Totals } from '@/lib/totals';
import { PackLayers, Swatch } from '@/components/PackLayers';
import { List, ListItem, Note, Section, Stat, Stats, friendlyError, userError } from '@/components/ui';
import {
  DED_BUTETS_LAYER_IDS, INFRA_SYSTEMS, LAYER_BY_ID, OID,
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
import { CoordPopup } from './DedButetsCoord';
import { StatusBar, statusValsChanged, useStatusClasses, type ColorBy, type StatPick, type StatusPick } from './DedButetsStatus';
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
 */
const SYSTEMS = INFRA_SYSTEMS;

/**
 * Зүүн баганын БҮХ давхарга — нийлбэрийн хүсэлт ба зургийн суурьт.
 * `services.ts`-ийн `DED_BUTETS_LAYER_IDS` (`VIEWS.dedButets`-ийн эх) ба энэ
 * хоёр нэг `INFRA_TABLE`-аас гардаг тул зөрөх боломжгүй.
 */
const NET_IDS = SYSTEMS.flatMap((s) => s.ids);

/**
 * ДАВХАРГЫН ГЕОМЕТР → `SketchViewModel`-ийн хэрэгсэл.
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
 */
const INFRA_PACKS: Pack[] = buildPacks(null).filter((x) => {
  if (x.kind !== 'infra') return false;
  const fam = PKG_FAMILY_BY_BAGTS[x.key];
  return fam !== 'soc' && fam !== 'site';
});

/**
 * БОХИРЫН ХУДГИЙН давхаргууд — KPI-д.
 */
/* i18n-static 2026-09-30: хэл солиход ДАХИН БОДОГДОХГҮЙ — санаатай. Суффикс ба
   давхаргын нэр (getter) НЭГ агшинд, ижил хэлээр үнэлэгдэх тул ID-ийн олонлог
   хэлээс хамаарахгүй; `WELL_IDS` нь хэлээс үл хамаарах тогтмол. */
const WELL_SUFFIX = `· ${tr('Бохир худаг')}`;
const SEWER_WELL_EXTRA = ['infra:69'];
const WELL_IDS = DED_BUTETS_LAYER_IDS.filter((id) =>
  (LAYER_BY_ID[id]?.title ?? '').endsWith(WELL_SUFFIX) || SEWER_WELL_EXTRA.includes(id),
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
 */
const oidFieldOf = (id: string, a?: Record<string, unknown> | null): string =>
  cachedOidField(id)
  ?? (a ? Object.keys(a).find((k) => /^(objectid|fid)$/i.test(k)) : undefined)
  ?? LAYER_BY_ID[id]?.oid
  ?? OID;

/**
 * УРТААР ХЭМЖИГДЭХ ШУГАМ давхаргууд — км-ийн KPI-д ЗӨВХӨН эдгээр орно.
 */
const isLenLayer = (id: string): boolean => {
  const L = LAYER_BY_ID[id];
  return L?.geom === 'line' && (L.qty?.unit === 'м' || L.qty?.unit === 'км');
};

/**
 * Давхаргын урт (м) — татагдаагүй/хэмжээгүй бол `null` (`Totals.q`-ийн дүрэм: null ≠ 0).
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
 */
const sumOf = (t: LiveTotals, ids: string[]): number | null =>
  ids.length === 0 ? null : ids.reduce<number | null>(
    (a, id) => {
      if (a == null) return null;
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
const kmOrWait = (m: number | null, empty = false, settled = false) =>
  (empty ? '—' : m == null ? (settled ? '—' : WAIT) : km(m, 1));
const cntOrWait = (n: number | null, empty = false, settled = false) =>
  (empty ? '—' : n == null ? (settled ? '—' : WAIT) : num(n));



/**
 * ЖАГСААЛТЫН СОНГОЛТ — зурагт юу үлдэхийг ЭНЭ ГАНЦ төлөв шийднэ.
 */
type Sel = { key: string; ids: string[] };

export function DedButets({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /**
   * Баруун баганын өргөн — чирж тохируулна, хөтөчид хадгалагдана.
   */
  const { hostRef: sideHostRef, ...side } = useSideResize('dedButets2');
  const [layerOpen, setLayerOpen] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const { setHighlight, refreshLayer } = useMap();

  /**
   * ЗАСВАРЫН ГОРИМ — «Мэдээлэл засах» товчоор асна.
   */
  const [editMode, setEditMode] = useState(false);
  const editModeRef = useRef(false);
  useSyncRef(editModeRef, editMode);
  /**
   * Маягт нээлттэй объект.
   */
  const [pick, setPick] = useState<
    { layerId: string; oid: number | null; geometry?: unknown } | null
  >(null);
  const [saved, setSaved] = useState('');
  /** Мэдэгдлийн төрөл — `err` нь улаан бөгөөд ӨӨРӨӨ арилахгүй (`toast`-ийн тайлбар) */
  const [savedKind, setSavedKind] = useState<'ok' | 'err'>('ok');
  /**
   * САМБАРЫН ДОТООД БАТАЛГААЖУУЛАЛТ — `window.confirm`-ийн оронд.
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
   */
  const [tplOpen, setTplOpen] = useState(false);
  const [tplQ, setTplQ] = useState("");
  /**
   * Тэмплэйт сонгогдож, ЗУРААЛТ ЭХЭЛСЭН — хэрэглэгч дүрсээ дуусгахыг хүлээж
   * байна. Энэ төлөвгүй бол самбар ХООСОН харагдаж, «дараа нь юу хийх вэ»
   * гэдэг нь ойлгомжгүй болно: зураг дээр юу ч сонгогдоогүй, маягт ч алга.
   */
  const [awaitDraw, setAwaitDraw] = useState(false);
  /** Товч дарах бүрд өснө — `MapCanvas` үүгээр зураалт эхлүүлнэ */
  const [drawToken, setDrawToken] = useState(0);
  /** Зурсан дүрсийг арилгах дохио */
  const [clearToken, setClearToken] = useState(0);

  /**
   * КООРДИНАТААР ЦЭГ ТАВИХ (2026-10-14, хэрэглэгч: «баруун товшиход WGS / UTM 48-аар цэг тавьдаг»).
   *   · `coordPop` — баруун товшсон байрлал дахь координатын цонх (`DedButetsCoord`).
   *   · `vertex` — оруулсан цэгийг ЯВЖ БУЙ хулганы зураалтад vertex болгон нэмнэ (`MapCanvas.sketchVertex`).
   */
  const [coordPop, setCoordPop] = useState<{ at: { x: number; y: number } | null; start: { lat: number; lon: number } | null } | null>(null);
  const [vertex, setVertex] = useState<{ token: number; lat: number; lon: number } | null>(null);
  /** Сүүлд координатаар тавьсан цэг — цонхыг дараагийн удаа урьдчилан бөглөхөд */
  const lastCoord = useRef<{ lat: number; lon: number } | null>(null);

  /* ── ОЛОН ОБЪЕКТ СОНГОЖ НЭГ ДОР ЗАСАХ (2026-09-16) ── */

  /**
   * «Олноор сонгох» горим — хэрэглэгчийн хүсэлт: «нэг мэдээллийн олон
   * мөрийг select хийгээд нэг бөглөхөд бүгдэд нь бичигдэх, ArcGIS Pro-гийн
   * Calculate Field шиг, гэхдээ илүү амар».
   */
  const [multi, setMulti] = useState(false);
  const multiRef = useRef(false);
  useSyncRef(multiRef, multi);
  const dimRef = useRef(dim);
  useSyncRef(dimRef, dim);
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
  useSyncRef(mselRef, msel);
  /** Тэгш өнцөгт татаж байна — `onSketch` үүгээр «шинэ объект»-оос ялгана */
  const [rectDraw, setRectDraw] = useState(false);
  const [mselBusy, setMselBusy] = useState(false);
  /**
   * ХАДГАЛСНЫ МЭДЭГДЭЛ — олноор засах САМБАРТ (2026-09-16, хэрэглэгчийн хүсэлт
   * «хадгалагдсан гэсэн мэдэгдэл харагддаг байя»).
   *
   * Дараагийн сонголт эхлэхэд арилна.
   */
  const [mselOk, setMselOk] = useState('');

  /* ── ХЭЛБЭР (vertex) ЗАСАХ ── */

  /**
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
  const [geomRev, setGeomRev] = useState(0);
  /** Устгал явж байна — маягтын бүх товч түгжигдэнэ */
  const [delBusy, setDelBusy] = useState(false);
  /** Зураалтын нэг алхам буцаах дохио (`SketchViewModel.undo`) */
  const [sketchUndoToken, setSketchUndoToken] = useState(0);

  /* ── ҮЙЛДЭЛ БУЦААХ ── */

  /**
   * СҮҮЛИЙН БИЧИГДСЭН үйлдлийг буцаах мэдээлэл.
   */
  const [undoable, setUndoable] = useState<
    | { kind: 'add'; layerId: string; oid: number }
    | { kind: 'attr'; layerId: string; oid: number; attrs: Record<string, unknown>; wrote?: Record<string, unknown> }
    | { kind: 'geom'; layerId: string; oid: number; geometry: unknown }
    /* Олон мөрийн засвар — мөр бүр ӨӨРИЙН хуучин утгатай (`DedButetsBatch`) */
    | { kind: 'batch'; layerId: string; rows: { oid: number; attrs: Record<string, unknown>; wrote?: Record<string, unknown> }[] }
    | null
  >(null);
  const [undoBusy, setUndoBusy] = useState(false);
  /** Нээлттэй маягтыг ДАХИН АЧААЛАХ тоолуур (буцаалтын дараа, `key`) — 2026-09-30 */
  const [formRev, setFormRev] = useState(0);

  /**
   * ЗУРГИЙН ДООД МЭДЭГДЭЛ — 4 секундын дараа өөрөө арилна.
   */
  const toastTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /**
   * `dropTotalsCache` нь 74 давхаргын статистикийг ДАХИН татдаг —
   * хэмжсэнээр 3.2 секунд, 12 слотын дараалал бүтэн дүүрнэ. Урьд нь энэ нь
   * ЗАСВАР БҮРИЙН дараа (шинэ объект, хэлбэр, атрибут, буцаалт) ажилладаг
   * байсан: 10 объект зурахад 740 дэмий хүсэлт болж, зурах/сонгох бүх
   * үйлдэл тэр дарааллын ард хүлээдэг байв.
   */
  const totalsStale = useRef(false);
  const layerOpenRef = useRef(false);
  useSyncRef(layerOpenRef, layerOpen);
  const dropTotalsLater = useCallback(() => {
    if (editModeRef.current && !layerOpenRef.current) { totalsStale.current = true; return; }
    dropTotalsCache();
  }, []);
  useEffect(() => () => {
    if (totalsStale.current) { totalsStale.current = false; dropTotalsCache(); }
  }, []);
  const flushTotals = useCallback(() => {
    if (!totalsStale.current) return;
    totalsStale.current = false;
    dropTotalsCache();
  }, []);

  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setSaved(msg);
    setSavedKind(kind);
    window.clearTimeout(toastTimer.current);
    if (kind === 'ok') toastTimer.current = window.setTimeout(() => setSaved(''), 4000);
  }, []);

  /**
   * ХАДГАЛААГҮЙ VERTEX ЗАСВАРЫГ ХАЯХЫГ АСУУНА.
   */
  const askDropReshape = useCallback((run: () => void): boolean => {
    if (reshaped == null) { run(); return true; }
    setConfirmQ({ msg: tr('Хадгалаагүй хэлбэрийн засвар байна. Хаях уу?'), onYes: run });
    return false;
  }, [reshaped]);

  /**
   * МАЯГТЫН ХАДГАЛААГҮЙ ТӨЛӨВ — `DedButetsEdit`-ийн талбарт бичсэн эсэх.
   */
  const formDirty = useRef(false);
  const batchDirty = useRef(false);
  /** navGuard-ыг одоогийн төлөвөөр шинэчлэх (ref-үүд + доорх эффектийн төлөв) */
  const navSync = useRef<() => void>(() => {});
  const pickRef = useRef(pick);
  useSyncRef(pickRef, pick);
  const pickKey = pick ? `${pick.layerId}:${pick.oid ?? 'new'}` : '';
  useEffect(() => { formDirty.current = false; }, [pickKey]);
  useEffect(() => {
    navSync.current = () => setNavDirty(
      'butets',
      formDirty.current || batchDirty.current || (pick != null && pick.oid == null) || reshaped != null
        || (awaitDraw && pick == null),
      tr('Инженерийн дэд бүтэц'),
    );
    navSync.current();
  }, [pick, reshaped, awaitDraw]);
  useEffect(() => () => setNavDirty('butets', false), []);

  /**
   * ХАДГАЛААГҮЙ МАЯГТ/ДҮРС + VERTEX ЗАСВАРЫГ ХАЯХЫГ АСУУНА (2026-09-25).
   */
  const askDropUnsaved = useCallback((run: () => void): boolean => {
    const pk = pickRef.current;
    const formLost = (pk != null && (pk.oid == null || formDirty.current)) || batchDirty.current;
    if (!formLost) return askDropReshape(run);
    setConfirmQ({ msg: tr('Хадгалаагүй маягт эсвэл зурсан дүрс байна. Хаях уу?'), onYes: run });
    return false;
  }, [askDropReshape]);

  /**
   * ДУУСААГҮЙ ЗУРААЛТЫГ Ч АСУУНА — горимоос гарах · «Шинэ объект» · «Олноор сонгох»
   * (2026-10-01, «хэрэглэгч: бүгдийг зас»).
   */
  const awaitDrawRef = useRef(awaitDraw);
  useSyncRef(awaitDrawRef, awaitDraw);
  const askDropAll = useCallback((run: () => void): boolean => {
    if (awaitDrawRef.current && pickRef.current == null) {
      setConfirmQ({
        msg: tr('Зурж эхэлсэн дүрс дуусаагүй байна. Хаях уу?'),
        onYes: () => { setClearToken((x) => x + 1); run(); },
      });
      return false;
    }
    return askDropUnsaved(run);
  }, [askDropUnsaved]);

  /**
   * ГЕОМЕТР ТАТАХ ДАРААЛЛЫН ТОКЕН.
   */
  const geomSeq = useRef(0);

  /**
   * ХЭЛБЭР ЗАСАХАД БЭЛТГЭСЭН ГЕОМЕТР — маягт нээгдэх агшинд урьдчилж татна.
   */
  const preGeom = useRef<{ key: string; p: Promise<unknown | null> } | null>(null);

  const { user, status: authStatus } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  useEffect(() => subscribeButetsAcl(() => setCapN((x) => x + 1)), []);
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
  const netIds = useMemo(() => NET_IDS.filter((id) => isLenLayer(id) && allow(id)), [allow]);
  const heatIds = useMemo(() => SYSTEMS[0].ids.filter((id) => isLenLayer(id) && allow(id)), [allow]);
  const sysLen = useMemo(
    () => SYSTEMS.slice(1)
      .map((s) => ({ key: s.key, title: s.title, hue: s.hue, ids: s.ids.filter((id) => isLenLayer(id) && allow(id)) }))
      .filter((s) => s.ids.length > 0),
    [allow],
  );
  const wellIds = useMemo(() => WELL_IDS.filter(allow), [allow]);
  const [clampedIds, setClampedIds] = useState<string[] | null>(null);
  if (clampedIds !== editableIds) {
    setClampedIds(editableIds);
    if (editableIds.length) {
      if (!editableIds.includes(msel.layerId)) setMsel({ layerId: editableIds[0], oids: [] });
      if (!editableIds.includes(addTo)) setAddTo(editableIds[0]);
    }
  }

  /**
   * ЭНЭ ЦОНХНЫ СУУРЬ — ЗӨВХӨН ИНЖЕНЕРИЙН 16 ШУГАМ.
   */
  const base = useMemo(() => [...viewIds], [viewIds]);

  const [visible, setVisible] = useLayerPicks(base);
  const [layerSel, setLayerSel] = useState<string | null>(null);

  /** Жагсаалтаас сонгосон гэрээний багц (эсвэл юу ч биш) */
  const [sel, setSel] = useState<Sel | null>(null);

  /** Мөр дарах — ижлийг дахин дарвал сонголт арилна */

  const pickRow = useCallback((next: Sel) => {
    setSel((cur) => (cur && cur.key === next.key ? null : next));
  }, []);

  useZoomToFilter({ zone, layerId: sel ? (sel.ids.find(isLenLayer) ?? sel.ids[0] ?? null) : null });

  /**
   * ЗАСВАРЫН ГОРИМД ЗӨВХӨН ИНЖЕНЕРИЙН ШУГАМ.
   */
  const mapVisible = useMemo(() => {
    if (editMode) return viewIds;
    if (sel) return sel.ids.filter(allow);
    return hidden ? visible.filter(allow) : visible;
  }, [editMode, sel, visible, viewIds, allow, hidden]);

  /**
   * ЦЭГЭН ДАВХАРГУУДЫГ ЖИЖИГРҮҮЛНЭ (хэрэглэгчийн хүсэлт, 2026-09-02).
   */
  const dotStyle = useMemo<Record<string, { size?: number }>>(() => ({}), []);

  /**
   * МЭДЭЭЛЛИЙН ТӨЛӨВИЙН ШҮҮЛТҮҮР (2026-10-14, `DedButetsStatus`) — «Мэдээлэл» (бөглөсөн/дутуу)
   * ба «Өөрчлөлт» (өөрчлөгдсөн/ороогүй), «Төлөв» (дууссан/эхэлсэн … — давхаргын төлөвийн талбар).
   * Өнгө нь СҮҮЛД сонгосон шүүлтүүрийн төлөвөөр.
   */
  const [stFill, setStFill] = useState<StatusPick>('off');
  const [stEdit, setStEdit] = useState<StatPick>('off');
  const [stStat, setStStat] = useState<StatPick>('off');
  const [stBy, setStBy] = useState<ColorBy>('fill');
  const [stPerf, setStPerf] = useState(false);
  /* Шүүлтүүрийг унтраахад өнгө нь идэвхтэй үлдсэн өөр шүүлтүүрийнх рүү шилжинэ */
  const recolor = useCallback((next: { fill: StatusPick; edit: StatPick; stat: StatPick }, by: ColorBy, v: string) => {
    if (v !== 'off') { setStBy(by); return; }
    setStBy((cur) => (cur !== by ? cur
      : next.stat !== 'off' ? 'stat' : next.edit !== 'off' ? 'edit' : 'fill'));
  }, []);
  const onStFill = useCallback((v: StatusPick) => {
    setStFill(v); recolor({ fill: v, edit: stEdit, stat: stStat }, 'fill', v);
  }, [stEdit, stStat, recolor]);
  const onStEdit = useCallback((v: StatPick) => {
    setStEdit(v); recolor({ fill: stFill, edit: v, stat: stStat }, 'edit', v);
  }, [stFill, stStat, recolor]);
  const onStStat = useCallback((v: StatPick) => {
    setStStat(v); recolor({ fill: stFill, edit: stEdit, stat: v }, 'stat', v);
  }, [stFill, stEdit, recolor]);
  const stIds = useMemo(() => mapVisible.filter((id) => id in PACK_OF_LAYER), [mapVisible]);
  const st = useStatusClasses(stIds, stFill, stEdit, stStat, stBy, canEdit, stPerf);
  const mapStyle = useMemo(() => (st.style ? { ...dotStyle, ...st.style } : dotStyle), [dotStyle, st.style]);


  /** Хоёр баганын урт ба тоо — ЭНЭ цонхны 30 орчим давхаргаар */
  const kpiZoneless = useMemo(() => totalIds.every((id) => LAYER_BY_ID[id]?.noZone), [totalIds]);
  const totals = usePlanTotalsLive(zone, true, totalIds, { spatialZone: true });

  /** Тайлбарт багтаагүй давхаргын тоо («+N») */
  const legendHidden = useMemo(
    () => Math.max(0, mapVisible.filter((id) => LAYER_BY_ID[id]).length - 8),
    [mapVisible],
  );

  /**
   * Хэлбэр засахаас гарах — зурсан хуулбарыг арилгана.
   */
  const cancelReshape = useCallback(() => {
    setReshape(null);
    setReshaped(null);
    setClearToken((x) => x + 1);
  }, []);

  /**
   * ГАЗРЫН ЗУРАГ ДЭЭР ОБЪЕКТ ТОВШИХ.
   */
  /**
   * ОЛОН СОНГОЛТЫГ ЗУРАГТ ТОДРУУЛНА — `OID IN (…)`.
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
    setConfirmQ(null);
    /**
     * ОЛНООР СОНГОХ горим — товшилт нь маягт нээхгүй, сонголтод НЭМНЭ/ХАСНА.
     */
    if (multi) {
      if (!a || !id || !DED_BUTETS_LAYER_IDS.includes(id)) return;
      if (!canEditLayer(id)) { toast(tr('Энэ багцыг засах эрхгүй'), 'err'); return; }
      const oid = Number(a[oidFieldOf(id, a)]);
      if (!Number.isFinite(oid)) return;
      const o = Math.trunc(oid);
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
      const pk = pickRef.current;
      askDropUnsaved(() => {
        if (reshape) cancelReshape();
        else if (pk && pk.oid == null) setClearToken((x) => x + 1);
        setPick(null); setHighlight(null);
      });
      return;
    }
    if (!canEditLayer(id)) { toast(tr('Энэ багцыг засах эрхгүй'), 'err'); return; }
    const oidField = oidFieldOf(id, a);
    const oid = Number(a[oidField]);
    if (!Number.isFinite(oid)) { setPick(null); return; }
    /* Схемийг урьдчилж татна — дараагийн товшилтод серверийн OID нэр бэлэн */
    void loadLayerMeta(id).catch(() => {});

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
   */
  const closeEdit = useCallback((): boolean => askDropReshape(() => {
    setConfirmQ(null);
    setReshape(null);
    setReshaped(null);
    setPick(null);
    setHighlight(null);
    setClearToken((x) => x + 1);
  }), [askDropReshape, setHighlight]);

  /** Vertex чирэх бүрд — хадгалаагүй шинэ хэлбэрийг санана */
  const onReshape = useCallback((g: __esri.Geometry | null) => {
    if (g) setReshaped(g.toJSON() as unknown);
  }, []);


  /**
   * СОНГОСОН ОБЪЕКТЫН ХЭЛБЭРИЙГ ЗАСАЖ ЭХЛЭХ.
   */
  const startReshape = useCallback(() => {
    if (!pick || pick.oid == null) return;
    const { layerId, oid } = pick;
    const seq = ++geomSeq.current;
    setReshaped(null);
    setHighlight(null);
    void (async () => {
      try {
        const key = `${layerId}:${oid}`;
        const pre = preGeom.current?.key === key ? preGeom.current.p : null;
        const meta = await loadLayerMeta(layerId);
        /* Урьдчилсан татац `null` буцаавал (алдаа) жинхэнэ хүсэлтээр дахин
           оролдож, алдааны мессежийг ил гаргана. */
        const g = (pre ? await pre : null) ?? await loadGeometry(meta, oid);
        if (seq !== geomSeq.current) return;
        const pk = pickRef.current;
        if (!pk || pk.layerId !== layerId || pk.oid !== oid) return;
        if (!g) { toast(tr('Геометр олдсонгүй'), 'err'); return; }
        setReshape({ layerId, oid, geometry: g });
        setReshapeToken((x) => x + 1);
      } catch (e) {
        if (seq === geomSeq.current) toast(userError(e), 'err');
      }
    })();
  }, [pick, toast, setHighlight]);

  /**
   * ОБЪЕКТ УСТГАХ (2026-09-14 — Experience Builder-ийн edit widget-д байдаг
   * бөгөөд энд ДУТУУ байсан: андуурч нэмсэн мөрийг зөвхөн «Үйлдэл буцаах»
   * товч амьд байх зуур л арилгаж чаддаг байв, түүнээс хойш арга байхгүй).
   */
  const removeFeature = useCallback(() => {
    if (!pick || pick.oid == null) return;
    const { layerId, oid } = pick;
    setConfirmQ({
      msg: tr('№{0} объектыг БҮРМӨСӨН устгана. Буцаах аргагүй. Үргэлжлүүлэх үү?', String(Math.trunc(oid))),
      danger: true,
      onYes: () => {
        void (async () => {
          setDelBusy(true);
          try {
            const meta = await loadLayerMeta(layerId);
            await deleteRow(meta, oid);
            refreshLayer(layerId); statusValsChanged(layerId);
            dropTotalsLater();
            setUndoable(null);
            closeEdit();
            toast(tr('Объект устгагдлаа'));
          } catch (e) {
            toast(userError(e), 'err');
          } finally {
            setDelBusy(false);
          }
        })();
      },
    });
  }, [pick, refreshLayer, toast, closeEdit, dropTotalsLater]);

  /**
   * ШИНЭ ХЭЛБЭРИЙГ БИЧНЭ.
   */
  const commitReshape = useCallback(async () => {
    if (!reshape || reshaped == null) return;
    setGeomBusy(true);
    try {
      const meta = await loadLayerMeta(reshape.layerId);
      await saveGeometry(meta, reshape.oid, reshaped);
      refreshLayer(reshape.layerId); statusValsChanged(reshape.layerId);
      dropTotalsLater();
      setGeomRev((x) => x + 1);
      /* Урьдчилсан геометр хуучирлаа — дараагийн засвар шинээр татна */
      preGeom.current = null;
      setUndoable({
        kind: 'geom',
        layerId: reshape.layerId,
        oid: reshape.oid,
        geometry: reshape.geometry,
      });
      toast(tr('Хэлбэр хадгалагдлаа'));
      setReshape(null);
      setReshaped(null);
      setClearToken((x) => x + 1);
    } catch (e) {
      toast(userError(e), 'err');
    } finally {
      setGeomBusy(false);
    }
  }, [reshape, reshaped, refreshLayer, toast, dropTotalsLater]);

  /**
   * СҮҮЛИЙН ҮЙЛДЛИЙГ БУЦААНА.
   */
  const undo = useCallback(() => {
    if (!undoable) return;
    const u = undoable;
    const run = async () => {
      setUndoBusy(true);
      try {
        const meta = await loadLayerMeta(u.layerId);
        if (u.kind === 'add') await deleteRow(meta, u.oid);
        else if (u.kind === 'attr' && u.wrote) {
          const r = await revertRows(meta, [{ oid: u.oid, attrs: u.attrs, wrote: u.wrote }]);
          if (r.failed.length) {
            /* Алгассан (бусад зассан) бол дахин оролдох утгагүй — буцаалтыг арилгана; бусад алдаанд үлдээнэ */
            if (r.skipped?.length) setUndoable(null);
            toast(tr('Буцаагдсангүй: {0}', r.failed[0].msg), 'err');
            return;
          }
        }
        else if (u.kind === 'attr') await applyAttrs(meta, u.oid, u.attrs);
        else if (u.kind === 'batch') {
          const r = await revertRows(meta, u.rows);
          if (r.failed.length) {
            const skipped = new Set(r.skipped ?? []);
            const bad = new Set(r.failed.map((x) => x.oid).filter((o) => !skipped.has(o)));
            refreshLayer(u.layerId); statusValsChanged(u.layerId);
            dropTotalsLater();
            setUndoable(bad.size ? { ...u, rows: u.rows.filter((x) => bad.has(Math.trunc(x.oid))) } : null);
            toast(tr('{0}/{1} объект буцаагдсан, {2} объектод алдаа: {3}. «Үйлдэл буцаах»-аар дахин оролдоно уу.',
              num(r.done.length), num(u.rows.length), num(r.failed.length), r.failed[0].msg), 'err');
            return;
          }
        }
        else {
          await saveGeometry(meta, u.oid, u.geometry);
          setGeomRev((x) => x + 1);
        }
        refreshLayer(u.layerId); statusValsChanged(u.layerId);
        dropTotalsLater();
        /* Буцаалт хэлбэрийг ч сэргээж болно — урьдчилсан геометр хуучирна */
        preGeom.current = null;
        setUndoable(null);
        const pk = pickRef.current;
        const onForm = pk != null && pk.oid != null && pk.layerId === u.layerId
          && (u.kind === 'batch' ? u.rows.some((r) => r.oid === pk.oid) : u.oid === pk.oid);
        if (onForm && u.kind === 'add') {
          setReshape(null);
          setReshaped(null);
          setPick(null);
          setHighlight(null);
          setClearToken((x) => x + 1);
        } else if (onForm && (u.kind === 'attr' || u.kind === 'batch') && !formDirty.current) {
          /* Бичээгүй маягт — дахин ачаална (бичсэн утгыг хаяхгүй: тэр үед хэвээр) */
          setFormRev((x) => x + 1);
        }
        toast(tr('Үйлдэл буцаагдлаа'));
      } catch (e) {
        toast(userError(e), 'err');
      } finally {
        setUndoBusy(false);
      }
    };
    if (u.kind === 'add') {
      setConfirmQ({
        msg: tr('Сая нэмсэн №{0} объектыг УСТГАНА. Буцаах аргагүй. Үргэлжлүүлэх үү?', String(Math.trunc(u.oid))),
        danger: true,
        onYes: () => { void run(); },
      });
      return;
    }
    void run();
  }, [undoable, refreshLayer, toast, dropTotalsLater, setHighlight]);

  /**
   * ТЭМПЛЭЙТ СОНГОГДОВ — зураалт ШУУД эхэлнэ (EB-ийн edit widget-ийн зан).
   */
  const pickTemplate = useCallback((id: string) => {
    void loadLayerMeta(id).catch(() => {});
    setConfirmQ(null);
    setCoordPop(null);
    lastCoord.current = null;
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
    () => (rectDraw ? 'rectangle' as const : DRAW_OF[LAYER_BY_ID[addTo]?.geom ?? 'line'] ?? 'polyline'),
    [addTo, rectDraw],
  );

  /**
   * ТЭМПЛЭЙТИЙН ЖАГСААЛТ — системээр бүлэглэж, хайлтаар шүүнэ.
   */
  const tplGroups = useMemo(() => {
    const needle = tplQ.trim().toLowerCase();
    const sysIdx = new Map<string, number>();
    SYSTEMS.forEach((sys, i) => sys.ids.forEach((id) => sysIdx.set(id, i)));
    return BUTETS_PACKS.map((p) => ({
      key: p.key,
      title: p.name,
      ids: p.layerIds.filter((id) => {
        const L = LAYER_BY_ID[id];
        if (!L) return false;
        if (!editableIds.includes(id)) return false;
        return !needle || tr(L.title).toLowerCase().includes(needle);
      }).sort((a, b) => (sysIdx.get(a) ?? 99) - (sysIdx.get(b) ?? 99)),
    })).filter((g) => g.ids.length > 0);
  }, [tplQ, editableIds]);

  /**
   * ЗУРААЛТ ДУУСМАГЦ МАЯГТ НЭЭНЭ.
   */
  const onSketch = useCallback((g: __esri.Geometry | null) => {
    if (!g) { if (rectDraw) setRectDraw(false); return; }
    /**
     * ТЭГШ ӨНЦӨГТӨӨР СОНГОХ — дүрс нь объект БИШ, сонголтын хил.
     */
    if (rectDraw) {
      setRectDraw(false);
      setClearToken((x) => x + 1);
      const layerId = msel.layerId;
      setMselBusy(true);
      loadLayerMeta(layerId)
        .then((meta) => queryOidsIn(meta, g.toJSON() as unknown))
        .then((found) => {
          const m = mselRef.current;
          if (!editModeRef.current || !multiRef.current || m.layerId !== layerId || dimRef.current !== '2d') return;
          const oids = [...new Set([...m.oids, ...found])];
          setMsel({ layerId, oids });
          showMsel(layerId, oids);
          if (!found.length) toast(tr('Тэгш өнцөгт дотор энэ давхаргын объект олдсонгүй'));
        })
        .catch((e) => toast(userError(e), 'err'))
        .finally(() => setMselBusy(false));
      return;
    }
    setAwaitDraw(false);
    setPick({ layerId: addTo, oid: null, geometry: g.toJSON() as unknown });
  }, [addTo, rectDraw, msel.layerId, showMsel, toast]);

  /**
   * ЗУРААЛТЫГ Esc-ЭЭР ЦУЦЛАВ (2026-09-25, `MapCanvas.onSketchCancel`).
   */
  const onSketchCancel = useCallback(() => {
    setRectDraw(false);
    setAwaitDraw(false);
  }, []);

  /** Баруун товшилт — ЗӨВХӨН зурж буй үед (тэмплэйт сонгосон, маягт нээгдээгүй) */
  const onMapContext = useCallback((p: { lat: number; lon: number; clientX: number; clientY: number }) => {
    setCoordPop({ at: { x: p.clientX, y: p.clientY }, start: { lat: p.lat, lon: p.lon } });
  }, []);

  /** Координатын цэг зураалтад ОРООГҮЙ (SDK синтетик товшилтыг тооцоогүй) — хэрэглэгчид ил хэлнэ */
  const onSketchVertex = useCallback((ok: boolean) => {
    if (!ok) toast(tr('Координатаар цэг тавьж чадсангүй — зурагт товшиж тавина уу.'), 'err');
  }, [toast]);
  /** Координатын цонхны «Цэг тавих» — явж буй зураалтад vertex болгон нэмнэ */
  const onCoordPut = useCallback((p: { lat: number; lon: number }) => {
    setCoordPop(null);
    lastCoord.current = p;
    setVertex((v) => ({ token: (v?.token ?? 0) + 1, lat: p.lat, lon: p.lon }));
  }, []);

  /* Зураалт дуусах/цуцлагдахад координатын цонх хаагдана */
  useEffect(() => {
    if (awaitDraw) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- зураалтын горимоос гарахад координатын цонх хаагдана
    setCoordPop(null);
    lastCoord.current = null;
  }, [awaitDraw]);
  useEffect(() => {
    if (dim === '2d' || !editModeRef.current) return;
    setAwaitDraw(false);
    setRectDraw(false);
    setTplOpen(false);
    cancelReshape();
  }, [dim, cancelReshape]);

  /**
   * ЗАСВАРЫН ГОРИМД ОРОХ — идэвхтэй тодруулга, сонголтыг цэвэрлэнэ.
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
    askDropAll(() => {
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
      flushTotals();
    });
  }, [askDropAll, setHighlight, flushTotals]);

  /**
   * Сонгогдсон объектын геометрийг урьдчилж татна (`preGeom`-ийн тайлбар).
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
   */
  const [canDel, setCanDel] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      ref={sideHostRef}
      className={`${d.frame} ${editMode ? d.frameEdit : ''} ${side.hostClass}`}
      style={side.style}
    >
      <SplitGrip {...side.right} />

      {/* ══════════ ТӨВ — үзүүлэлт + газрын зураг ══════════ */}
      <main className={d.mapCol}>
        {!editMode && (
        <div className={d.kpi}>
          {/*
            * Тэр нь 74 давхаргын СҮҮЛЧИЙНХ ирэх хүртэл дөрвөн үзүүлэлтийг
            * бүхэлд нь нуудаг байв — хэмжсэнээр 4.2 секунд. Одоо үзүүлэлт
            * бүр ӨӨРИЙН давхаргууд бэлэн болмогц гарна: дулаан хангамж (19
            * давхарга) хамгийн түрүүнд, нийт дүн хамгийн сүүлд.
            */}
          <Stats cols={3}>
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
              value={cntOrWait(countOf(totals, wellIds), wellIds.length === 0, totals.done >= totals.total)}
              unit={tr('ш')}
              label={tr('Бохирын худаг')}
            />
          </Stats>
          {sysLen.length > 0 && (
            <p className={d.kpiSys}>
              {sysLen.map((s) => (
                <span key={s.key}>
                  <i style={{ background: s.hue }} aria-hidden />
                  {tr(s.title)} <b>{kmOrWait(sumOf(totals, s.ids), false, totals.done >= totals.total)}</b> {tr('км')}
                </span>
              ))}
            </p>
          )}
          {totals.done >= totals.total && ((m) => (m > 0 ? (
            <p className={d.kpiWait}>{tr('{0} объект уртгүй — км-д ороогүй', num(m))}</p>
          ) : null))(netIds.reduce((s, id) => s + (missingQty(totals.map.get(id)) ?? 0), 0))}
          {zone && kpiZoneless && (
            <p className={d.kpiWait}>{tr('Бүсийн хилээр шүүсэн — хилийг огтолсон шугам бүтнээрээ орно')}</p>
          )}
          {totals.done < totals.total && (
            <p className={d.kpiWait}>
              {tr('{0}/{1} давхарга', num(totals.done), num(totals.total))}
            </p>
          )}
          {totals.error && (
            <p className={d.kpiWait} role="alert">
              {tr('Тоо татагдсангүй: {0}', friendlyError(totals.error))}
              {' '}
              <button type="button" className={d.kpiRetry} onClick={retryTotals}>
                {tr('Дахин оролдох')}
              </button>
            </p>
          )}
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

        <div className={d.mapBox} data-map-host="">
          <MapCanvas
            dim={dim}
            visible={mapVisible}
            opacity={opacity}
            zone={zone}
            layerStyle={mapStyle}
            uniform
            sketch={editMode}
            onSketch={onSketch}
            onSketchCancel={onSketchCancel}
            onMapContext={editMode && awaitDraw && !pick && dim === '2d' ? onMapContext : undefined}
            sketchVertex={vertex}
            onSketchVertex={onSketchVertex}
            drawToken={drawToken}
            drawKind={drawKind}
            reshapeGeometry={reshape?.geometry}
            reshapeToken={reshapeToken}
            onReshape={onReshape}
            sketchUndoToken={sketchUndoToken}
            clearToken={clearToken}
            onPick={editMode ? onMapPick : undefined}
            bare
          />

          <MapTools
            dim={dim}
            setDim={setDim}
            layersOpen={layerOpen}
            onLayers={() => { flushTotals(); setLayerOpen((v) => !v); }}
            opacityOpen={opOpen}
            onOpacity={() => setOpOpen((v) => !v)}
            zone={zone}
            setZone={setZone}
          >
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
            {canEdit && dim !== '2d' && (
              <span className={d.editHint}>{tr('Зөвхөн 2D-д')}</span>
            )}
          </MapTools>

          {/*
            * ЗАСВАРЫН АЖЛЫН ЗУРВАС — «энэ бол тусдаа горим» гэдгийг хэлнэ.
            */}
          {editMode && (
            <div className={d.editBar}>
              <span className={d.editTitle}>{tr('Дэд бүтэц засах')}</span>
              <button
                type="button"
                className={`${d.editAdd} ${tplOpen ? d.editAddOn : ''}`}
                aria-pressed={tplOpen}
                disabled={dim !== '2d'}
                title={dim !== '2d' ? tr('Засварыг зөвхөн 2D дээр хийнэ') : undefined}
                onClick={() => askDropAll(() => {
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
                */}
              <button
                type="button"
                className={`${d.editAdd} ${multi ? d.editAddOn : ''}`}
                aria-pressed={multi}
                onClick={() => askDropAll(() => {
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
                disabled={dim !== '2d' && !multi}
                title={dim !== '2d' && !multi
                  ? tr('Засварыг зөвхөн 2D дээр хийнэ')
                  : tr('Олон объект сонгож, нэг маягтаар бүгдэд нь ижил утга бичнэ')}
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
              {undoable && (
                <button
                  type="button"
                  className={d.editUndo}
                  onClick={undo}
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
                  <details key={`${g.key}-${tplQ.trim() ? 'q' : ''}`} className={d.tplGroup} open={Boolean(tplQ.trim()) || tplGroups.length <= 2}>
                    <summary className={d.tplHead}>
                      <span>{g.title}</span>
                      <span className={d.tplCount}>{num(g.ids.length)}</span>
                    </summary>
                    {g.ids.map((id) => <TplRow key={id} id={id} onPick={pickTemplate} strip={g.title} />)}
                  </details>
                ))}
              </div>
            </aside>
          )}

          {editMode && awaitDraw && !pick && (
            <aside className={d.pane}>
              <div className={d.modalHead}>
                {LAYER_BY_ID[addTo] && <Swatch L={LAYER_BY_ID[addTo]} />}
                <span className={d.modalTitle}>
                  {tr(LAYER_BY_ID[addTo]?.title ?? '')}
                </span>
                <span className={d.geomBadge}>
                  {drawKind === 'point' ? tr('Цэг') : drawKind === 'polygon' ? tr('Талбай') : tr('Шугам')}
                </span>
              </div>
              <ol className={d.drawSteps}>
                {drawKind === 'point'
                  ? <li>{tr('Зурагт товшиж цэгээ тавина.')}</li>
                  : <>
                    <li>{tr('Зурагт товшиж цэг бүрээ тавина.')}</li>
                    <li>{tr('Дуусгахдаа сүүлийн цэг дээр хоёр товшино.')}</li>
                  </>}
                <li>{tr('Нарийн байршилтай цэгийг баруун товшиж WGS84 эсвэл UTM 48N координатаар тавина — дараа нь тэр цэгээс үргэлжлүүлж зурна.')}</li>
              </ol>
              <div className={d.actions}>
                {drawKind !== 'point' && (
                  <button type="button" className={d.btn} onClick={() => setSketchUndoToken((x) => x + 1)}>
                    {tr('Алхам буцаах')}
                  </button>
                )}
                <button type="button" className={d.btn} onClick={() => setCoordPop({ at: null, start: lastCoord.current })}>
                  {tr('Координатаар')}
                </button>
                <span className={d.spacer} />
                <button type="button" className={d.btn}
                  onClick={() => { setAwaitDraw(false); setClearToken((x) => x + 1); }}>
                  {tr('Болих')}
                </button>
              </div>
            </aside>
          )}
          {editMode && awaitDraw && !pick && coordPop && (
            <CoordPopup
              key={`${coordPop.start?.lat ?? ''},${coordPop.start?.lon ?? ''}|${coordPop.at?.x ?? ''},${coordPop.at?.y ?? ''}`}
              at={coordPop.at}
              start={coordPop.start}
              title={tr('Координатаар цэг тавих')}
              onPut={onCoordPut}
              onClose={() => setCoordPop(null)}
            />
          )}
          {/*
            * ОЛОН ОБЪЕКТ ЗАСАХ САМБАР — сонголтын удирдлага + нэг маягт.
            */}
          {editMode && multi && (
            <aside className={d.pane}>
              <div className={d.modalHead}>
                <span className={d.modalTitle}>{tr('Олноор засах')}</span>
                <span className={d.modalNo}>{tr('{0} ш', num(msel.oids.length))}</span>
                <button type="button" className={d.close} aria-label={tr('Хаах')}
                  onClick={() => askDropUnsaved(() => {
                    setMulti(false); setRectDraw(false);
                    setMsel((m) => ({ layerId: m.layerId, oids: [] }));
                    setHighlight(null); setClearToken((x) => x + 1);
                  })}>✕</button>
              </div>
              <div className={d.mselBox}>
                <label className={d.f}>
                  <span className={d.fLabel}>{tr('Давхарга')}</span>
                  <select
                    className={d.input}
                    value={msel.layerId}
                    disabled={mselBusy}
                    onChange={(e) => {
                      setMsel({ layerId: e.target.value, oids: [] });
                      setMselOk('');
                      setHighlight(null);
                    }}
                  >
                    {BUTETS_PACKS.map((p) => {
                      const ids = p.layerIds.filter((id) => editableIds.includes(id));
                      if (!ids.length) return null;
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
                    disabled={mselBusy || dim !== '2d'}
                    aria-pressed={rectDraw}
                    onClick={() => {
                      if (rectDraw) { setRectDraw(false); setClearToken((x) => x + 1); return; }
                      setRectDraw(true);
                      setTimeout(() => setDrawToken((x) => x + 1), 0);
                    }}
                    title={dim !== '2d'
                      ? tr('Засварыг зөвхөн 2D дээр хийнэ')
                      : tr('Зурагт тэгш өнцөгт татаж, дотор нь орсон объектуудыг сонголтод нэмнэ')}
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
                  key={msel.layerId}
                  layerId={msel.layerId}
                  oids={msel.oids}
                  onDirty={(v) => { batchDirty.current = v; navSync.current(); }}
                  canEdit={canEdit && canEditLayer(msel.layerId)}
                  onPartial={(back) => {
                    const id = msel.layerId;
                    setUndoable(back ? { ...back, layerId: id } : null);
                    refreshLayer(id); statusValsChanged(id);
                    dropTotalsLater();
                  }}
                  onDone={(rows, fields, back) => {
                    if (rows === 0) {
                      toast(tr('Нэг ч объект бичигдсэнгүй — сонголтоо шинэчлээд дахин оролдоно уу.'), 'err');
                      return;
                    }
                    const id = msel.layerId;
                    setUndoable(back ? { ...back, layerId: id } : null);
                    if (rows > 0) { refreshLayer(id); statusValsChanged(id); dropTotalsLater(); }
                    toast(tr('{0} объектын {1} талбар хадгалагдлаа', num(rows), num(fields)));
                    /**
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
          {pick && (
            <div style={{ display: 'contents' }} onChange={() => { formDirty.current = true; navSync.current(); }}>
            <DedButetsEdit
              key={formRev}
              layerId={pick.layerId}
              oid={pick.oid}
              geometry={pick.geometry}
              geomRev={geomRev}
              onDirty={() => { formDirty.current = true; navSync.current(); }}
              canEdit={canEdit && canEditLayer(pick.layerId)}
              docked
              onCancel={closeEdit}
              /**
               * ГЕОМЕТРИЙН ҮЙЛДЛҮҮД — маягтын доор, НЭГ САМБАРТ.
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
                        disabled={geomBusy || reshaped == null}
                      >
                        {geomBusy ? tr('Хадгалж байна…') : tr('Хэлбэр хадгалах')}
                      </button>
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
                      disabled={!canEdit || !canEditLayer(pick.layerId) || geomBusy || delBusy || dim !== '2d'}
                      title={dim !== '2d'
                        ? tr('Засварыг зөвхөн 2D дээр хийнэ')
                        : tr('Цэгүүдийг чирж зөөнө. Шинэ цэг нэмэхдээ ирмэгийн дунд дарна.')}
                    >
                      {tr('Хэлбэр засах')}
                    </button>
                  )}
                  <span className={d.spacer} />
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
                formDirty.current = false;
                navSync.current();
                const id = pick.layerId;
                const created = pick.oid == null;
                const closed = closeEdit();
                setUndoable(closed && back ? { ...back, layerId: id } : null);
                if (n > 0) { refreshLayer(id); statusValsChanged(id); dropTotalsLater(); }
                toast(created
                  ? tr('Шинэ объект нэмэгдлээ')
                  : n > 0
                    ? tr('{0} талбар хадгалагдлаа', num(n))
                    : tr('Өөрчлөлт байсангүй'));
              }}
            />
            </div>
          )}

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
            <div className={d.confirm} role="group" aria-live="assertive" aria-label={confirmQ.msg}>
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
              <LayerCatalog
                view="dedButets"
                allow={hidden ? allow : undefined}
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
              {noScope && (
                <Note>
                  {tr('Танд багц хуваарилагдаагүй — админд хандана уу')}
                </Note>
              )}
              {canEdit && (
                <StatusBar
                  inline
                  fill={stFill} edit={stEdit} stat={stStat} colorBy={stBy}
                  onFill={onStFill} onEdit={onStEdit} onStat={onStStat}
                  perf={stPerf} onPerf={setStPerf}
                  statOptions={st.statOptions} chgOptions={st.chgOptions}
                  noStat={st.noStat} noChg={st.noChg} pending={st.pending}
                />
              )}
              <Section
                title={tr('Дэд бүтэц')}
                note={tr('{0} багц · {1}', num(viewPacks.length), tr('зурагт харагдах давхарга'))}
                collapsible
              >
                <List>
                  {viewPacks.map((x) => {
                    const open = sel?.key === x.key;
                    return (
                      <Fragment key={x.key}>
                        <ListItem
                          title={tr(x.name)}
                          sub={x.layerIds.length
                            ? tr('{0} давхарга', num(x.layerIds.length))
                            : tr('зураггүй')}
                          color="var(--c3)"
                          active={open}
                          onClick={() => pickRow({ key: x.key, ids: x.layerIds })}
                        />
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

/**
 * ТЭМПЛЭЙТИЙН МӨР (2026-10-14) — тэмдэг · нэр · геометрийн төрөл (ArcGIS Map Viewer-ийн
 * «Create features»-ийн мөр). Тэмдэг нь зурагтай ИЖИЛ (`Swatch`).
 */
function TplRow({ id, onPick, strip }: {
  id: string; onPick: (id: string) => void;
  /** Бүлгийн (багцын) нэр — мөрийн нэрээс угтвар болгон хасна («Багц 5.1 · ДХТ» → «ДХТ») */
  strip?: string;
}) {
  const L = LAYER_BY_ID[id];
  if (!L) return null;
  const g = L.geom === 'point' ? tr('Цэг') : L.geom === 'area' ? tr('Талбай') : tr('Шугам');
  const full = tr(L.title);
  const short = strip && full.startsWith(strip) ? full.slice(strip.length).replace(/^[\s·—-]+/u, '') || full : full;
  return (
    <button type="button" className={d.tplRow} onClick={() => onPick(id)} title={`${full} · ${g}`}>
      <Swatch L={L} />
      <span className={d.tplName}>{short}</span>
      <span className={d.tplGeom}>{g}</span>
    </button>
  );
}
