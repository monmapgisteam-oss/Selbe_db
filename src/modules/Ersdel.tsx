'use client';

/**
 * ЭРСДЭЛИЙН ЗАГВАР — IoT-ийн НЭГТГЭСЭН үр дүн (голын ус + агаарын бохирдол).
 *
 *   ┌──────────────┬──────────────────┬────────────────┐
 *   │ ГОРИМ        │   ГАЗРЫН ЗУРАГ    │  ҮР ДҮН        │
 *   │ · одоо       │   2D · 3D · BIM   │  · заалт эсвэл │
 *   │ · таамаглал  │   + аюулын муж    │  · хохирол     │
 *   └──────────────┴──────────────────┴────────────────┘
 *
 * ХОЁР ГОРИМ:
 *   1. ОДООГИЙН БАЙДАЛ — 12 харуулын сүүлийн заалт, 72 цагийн цуваа.
 *   2. ТААМАГЛАЛЫН ЗАГВАР — үер / агаарын бохирдол × 3 түвшин. «Шинжилгээ хийх»
 *      дарахад аюулын муж зурагдаж, ИДЭВХТЭЙ давхаргын өртсөн объект УЛААНААР
 *      тодорно.
 *
 * ⚠️ ЮУ НЬ БОДИТ, ЮУ НЬ ЖИШЭЭ:
 *
 *   БОДИТ · Харуулын БАЙРШИЛ (`Example_data` FeatureServer, 12 цэг)
 *         · ҮЕРИЙН ЗАГВАРЧЛАЛ — ОБЕГ-ын (NEMA) гидравлик тооцоо
 *           (`public/selbe-uyr.json`, эх нь `Selbe_FS_WaterDepth.crf`)
 *         · Өртсөн объект — идэвхтэй давхаргуудаас орон зайгаар шүүсэн
 *
 *   ЖИШЭЭ · Харуулын ЗААЛТ (усны түвшин, PM2.5 …) — тэр давхаргад утгын талбар
 *           байхгүй тул `ersdel.ts` загвараар үүсгэнэ
 *         · Агаарын бохирдлын хувилбарын параметр (инверси, салхи, сэвсгэр)
 *
 * Тиймээс дэлгэц дээр энэ ялгааг ҮРГЭЛЖ бичнэ — хэрэглэгч амьд хэмжилттэй
 * андуурч болохгүй.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools, MapToolBtn } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { Icon } from '@/components/Icon';
import { Bars, Empty, Loading, Note, Ring, Stat, Stats, Tabs, Trend } from '@/components/ui';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { usePlanTotals } from '@/lib/totals';
import { useAsync } from '@/lib/useAsync';
import { INITIAL_MAP_LAYERS, LAYER_BY_ID } from '@/lib/services';
import { blank, ha, mntAbbr, num, text } from '@/lib/format';
import {
  AIR_LEVELS, AQI_BAND, EXPOSURE, FLOOD_LEVELS, GRADE_COLOR, GRADE_LABEL, HAZARDS, KIND_LABEL,
  DAMAGE_RATE, LEVELS, SPAN_H, buildLive, gradeOf, hourOf, loadStations, scenarioNote,
  type HazardKey, type LevelKey, type Metric, type Station, type StationLive,
} from '@/lib/ersdel';
import {
  airBands, airExtent, damageOf, floodBands, floodExtent,
  type Band, type DamageRow,
} from '@/lib/ersdelGeom';
import {
  depthRisk, flowDeg, flowDir, loadFloodData, type FloodData,
} from '@/lib/uyr';
import { Overlay, type Pick } from './ersdel/Overlay';
import o from './gazarOv.module.css';
import e from './ersdel.module.css';

/**
 * ЭХЛЭХ ДАВХАРГА — ХООСОН (хэрэглэгчийн хүсэлт, 2026-08-25).
 *
 * Энэ харагдац нь ЗӨВХӨН ортофото дээр нээгдэнэ: аюулын муж (цэнхэр ус, шаргал
 * утаа) ба өртсөн объект (улаан) нь өнгөөр л уншигддаг тул доор нь план 2D-ийн
 * 14 өнгөт давхарга байвал тэдгээр нь булингартана.
 *
 * ⚠️ `MapCanvas`-ийн `bare` тугтай ХАМТ ажиллана: тэргүй бол суурь давхаргууд
 * «сонголт хоосон» гэсэн дүрмээр АВТОМАТААР асдаг (`BASE_MAP_IDS`).
 * ⚠️ Ортофотог `setOrtho(true)`-оор доор асаана — анхдагч суурь зураг нь
 * топографи.
 */
const INITIAL_IDS: string[] = [];

/**
 * ҮНЭЛГЭЭНИЙ ҮНДСЭН БАГЦ — зурагт НЭГ Ч давхарга асаагаагүй үед шинжилгээ юуг
 * тоолох вэ.
 *
 * ⚠️ Харагдац одоо хоосон эхэлдэг тул «идэвхтэй давхаргаар» гэсэн дүрэм
 * дангаараа бол шинжилгээ ҮРГЭЛЖ хоосон хариу өгнө. Тиймээс: идэвхтэй давхарга
 * БАЙВАЛ түүгээр, эс бөгөөс аппын стандарт эхлэлийн багцаар (барилга, зам,
 * явган зам, дугуйн зам, гүүр, ногоон, мод, тоглоом) тооцно. Аль замаар
 * тооцсоныг үр дүнгийн самбарт ИЛ бичнэ — хэрэглэгч тоо хаанаас гарсныг мэдэх
 * ёстой.
 */
const ASSESS_IDS: string[] = INITIAL_MAP_LAYERS;

/** Хугацааны тэнхлэгийн богино шошго — «08-24 18:00» */
const axisLabel = (t: number): string => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:00`;
};

/** Зурган дээрх мэдээллийн хайрцгийн агуулга */
type Info = {
  title: string;
  sub?: string;
  /** Гарчгийн зүүн ирмэгийн өнгө — хохирол бол улаан */
  tone?: string;
  rows: { k: string; v: string; tone?: string }[];
  /** Нэг нүдний 12 алхмын түүх — гүн ба хурд (зөвхөн үерийн нүдэнд) */
  spark?: { depth: number[]; speed: number[] };
  /** Тэмдэглэгдэх алхам */
  sparkAt?: number;
};

/**
 * БЯЦХАН ГРАФИК — нэг нүдний цаг хугацааны хувьсал.
 *
 * ⚠️ `Trend` (ui.tsx) БИШ: тэр нь тэнхлэг, шошго, уншилтын мөртэй бүтэн график
 * бөгөөд 300px-ийн мэдээллийн хайрцагт багтахгүй. Энд зөвхөн «өссөн үү,
 * буурсан уу, одоо хаана байна» гэсэн ГУРВАН зүйл л хэрэгтэй.
 */
function Spark({
  vals, at, color, unit,
}: { vals: number[]; at: number; color: string; unit: string }) {
  const W = 250;
  const H = 34;
  const peak = Math.max(...vals, 0.0001);
  const n = vals.length;
  const xy = (v: number, i: number) => `${((i / (n - 1)) * W).toFixed(1)},${(H - (v / peak) * H).toFixed(1)}`;
  const pts = vals.map(xy).join(' ');
  const cx = ((at / (n - 1)) * W).toFixed(1);
  const cy = (H - (vals[at] / peak) * H).toFixed(1);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6}
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1={cx} y1={0} x2={cx} y2={H} stroke="var(--ink-3)" strokeWidth={1}
        strokeDasharray="3,2" vectorEffect="non-scaling-stroke" />
      <circle cx={cx} cy={cy} r={3} fill={color} />
      <title>{`${num(vals[at], 2)} ${unit} · дээд ${num(peak, 2)} ${unit}`}</title>
    </svg>
  );
}

/**
 * ТҮҮХИЙ атрибут → уншиж болох мөрүүд.
 *
 * ⚠️ Талбарын нэрийг ОРЧУУЛАХГҮЙ, ЯГ эх сурвалжийнхаар нь харуулна: давхарга
 * бүр өөр схемтэй (`Barilga_ty`, `ZONE_ID`, `urt_m` …) бөгөөд «эелдэг» нэр
 * зохиовол хэрэглэгч ямар талбар харж байгаагаа мэдэхгүй болно.
 *
 * ⚠️ Системийн талбаруудыг хасна (OID, GlobalID, Shape__*) — тэдгээр нь агуулга
 * биш, санд хадгалагдах дотоод дугаар.
 */
function attrRows(attrs: Record<string, unknown>): { k: string; v: string }[] {
  return Object.entries(attrs)
    .filter(([k, v]) => !/^(objectid|fid|globalid|shape__|shape_|se_anno)/i.test(k) && !blank(v))
    .slice(0, 12)
    .map(([k, v]) => ({
      k,
      v: typeof v === 'number'
        ? num(v, Number.isInteger(v) ? 0 : 2)
        : text(v),
    }));
}

/* ══════════════════════ Жижиг бүрэлдэхүүн ══════════════════════ */

/** Нэг хэмжигдэхүүний агшны нүд — утга, хэвийн хязгаар, үнэлгээ */
function Cell({ m }: { m: Metric }) {
  const g = gradeOf(m);
  return (
    <div className={e.metric} title={`${m.label}${m.unit ? ` (${m.unit})` : ''}\n${m.note}`}>
      <div className={e.metricHd}>
        <span className={e.metricName}>{m.label}</span>
        <span className={e.metricGrade} style={{ color: GRADE_COLOR[g] }}>{GRADE_LABEL[g]}</span>
      </div>
      <div className={`${e.metricVal} num`}>
        {num(m.latest, m.dp)}
        {m.unit && <span className={e.metricUnit}>{m.unit}</span>}
      </div>
      <div className={`${e.metricFoot} num`}>
        <span>{num(m.min, m.dp)} … {num(m.max, m.dp)}</span>
        <span>{tr('хязгаар')} {num(m.warn, m.dp)}</span>
      </div>
    </div>
  );
}

/** Харуулын жагсаалтын мөр — хамгийн муу үнэлгээгээр өнгө авна */
function StationRow({
  st, on, onPick,
}: { st: StationLive; on: boolean; onPick: () => void }) {
  // ⚠️ «Хамгийн муу» — нэг ч үзүүлэлт хэтэрсэн бол харуул бүхэлдээ улаан.
  //    Дундаж авбал нэг хортой үзүүлэлт долоон хэвийн утганд угаагдана.
  const bad = st.metrics.some((m) => gradeOf(m) === 'bad');
  const warn = st.metrics.some((m) => gradeOf(m) === 'warn');
  const g = bad ? 'bad' : warn ? 'warn' : 'ok';
  const key = st.kind === 'water' ? 'level' : 'pm25';
  const m = st.metrics.find((x) => x.key === key);
  return (
    <button
      type="button"
      className={`${e.stRow} ${on ? e.stRowOn : ''}`}
      onClick={onPick}
      aria-pressed={on}
    >
      <span className={e.stDot} style={{ background: GRADE_COLOR[g] }} aria-hidden />
      <span className={e.stName}>{st.name}</span>
      <span className={`${e.stVal} num`}>
        {m ? `${num(m.latest, m.dp)} ${m.unit}` : '—'}
      </span>
    </button>
  );
}

/* ══════════════════════ Үндсэн харагдац ══════════════════════ */

type Result = {
  hazard: HazardKey;
  level: LevelKey;
  bands: Band[];
  rows: DamageRow[];
  /** Шинжилгээнд орсон давхаргын тоо — «идэвхтэй давхарга» гэдгийг батална */
  layers: number;
  /** Идэвхтэй давхарга байгаагүй тул ҮНДСЭН БАГЦААР тооцов уу */
  fallback: boolean;
};

export function Ersdel({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  const side = useSideResize('ersdel');
  const { view, ortho, setOrtho } = useMap();

  /**
   * ОРТОФОТО-г энэ харагдацад АСААНА (хэрэглэгчийн хүсэлт).
   *
   * ⚠️ `ortho` нь `MapProvider`-ын НИЙТИЙН төлөв — бусад харагдац ч түүнийг
   * уншина. Тиймээс гарахдаа ОРСОН үеийн утгыг нь БУЦААНА: эс бөгөөс энэ
   * цонхоор нэг орсны дараа бүх харагдац ортофототой болж, хэрэглэгчийн
   * сонголт чимээгүй дарагдана.
   */
  const orthoWas = useRef(ortho);
  useEffect(() => {
    const was = orthoWas.current;
    setOrtho(true);
    return () => setOrtho(was);
  }, [setOrtho]);

  /* ── Газрын зургийн ерөнхий удирдлага (бусад харагдацтай ижил) ── */
  const [visible, setVisible] = useLayerPicks(INITIAL_IDS);
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const catTotals = usePlanTotals(zone, catOpen);

  /* ── Горим ба хувилбар ── */
  const [mode, setMode] = useState<'now' | 'model'>('now');
  const [hazard, setHazard] = useState<HazardKey>('flood');
  const [level, setLevel] = useState<LevelKey>(1);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  /**
   * ЗУРАГДАХ үеийн «одоо» — ЦАГААР бөөрөнхийлсөн (`hourOf`). Минут тутам
   * шинэчлэхгүй: цуваа нь цагийн алхамтай тул цаг солигдоход л өөрчлөгдөнө.
   */
  const [now, setNow] = useState(() => hourOf(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setNow(hourOf(Date.now())), 60_000);
    return () => clearInterval(id);
  }, []);

  /* ══════════ ҮЕРИЙН ЦАГ ХУГАЦААНЫ ЗАГВАРЧЛАЛ ══════════
   *
   * ⚠️ 18.9 МБ тул ЗӨВХӨН «Үер» хувилбар сонгогдоход л татна — хуудас
   *    нээгдэхэд БИШ. Нэг удаа татаад `uyr.ts` дотор кэшлэгдэнэ.
   */
  const [flood, setFlood] = useState<FloodData | null>(null);
  const [floodErr, setFloodErr] = useState<string | null>(null);
  const [slice, setSlice] = useState(0);
  const [playing, setPlaying] = useState(false);
  const wantFlood = mode === 'model' && hazard === 'flood';

  useEffect(() => {
    if (!wantFlood || flood) return;
    let alive = true;
    setFloodErr(null);
    loadFloodData()
      .then((d) => { if (alive) setFlood(d); })
      .catch((err: unknown) => {
        if (alive) setFloodErr(err instanceof Error ? err.message : String(err));
      });
    return () => { alive = false; };
  }, [wantFlood, flood]);

  /**
   * ⚠️ ТОГЛУУЛАЛТЫГ ЭНД удирдахГҮЙ. Урьд нь `setInterval`-ээр 900 мс тутам
   * зүсмэл сольдог байсан нь «12 өөр зураг» болж үсэрдэг байв — ус УРСАХГҮЙ.
   * Одоо `Overlay` нь `requestAnimationFrame`-ээр зүсмэл хоорондыг шингээж,
   * урсгалын долгион нэмж зурна; энд зөвхөн ЯВЦЫН заагчийг дагуулна.
   */

  const floodRef = useRef<FloodData | null>(null);
  floodRef.current = flood;
  const sliceRef = useRef(0);
  sliceRef.current = slice;

  const q = useAsync(loadStations, []);
  const stations: Station[] = q.state === 'ready' ? q.data : [];
  const live = useMemo(() => buildLive(stations, now), [stations, now]);
  const water = live.filter((s) => s.kind === 'water');
  const air = live.filter((s) => s.kind === 'air');

  /** Сонгосон харуул — сонгоогүй бол горимд тохирох эхнийх */
  const current: StationLive | null =
    live.find((s) => s.oid === sel) ?? live[0] ?? null;

  /**
   * ИДЭВХТЭЙ ДАВХАРГА — зурагт ЯГ ОДОО асаалттай, каталогийн мэддэг
   * (`LAYER_BY_ID`) объектын давхаргууд.
   *
   * ⚠️ `visible` (каталогийн чагт) БИШ, ЗУРГААС уншина: 2D-д суурь давхаргууд
   * (`BASE_MAP_IDS`) чагтгүйгээр ч асаалттай байдаг бөгөөд хэрэглэгчийн нүдээр
   * тэдгээр нь ч «идэвхтэй». Хэрэглэгч «миний идэвхтэй давхаргууд» гэж хэлэхэд
   * зөвхөн чагт тавьсныг нь ойлгодоггүй.
   */
  const activeIds = useCallback((): { ids: string[]; fallback: boolean } => {
    const map = view?.map;
    const out: string[] = [];
    map?.layers.forEach((l) => {
      if (!l.visible || !LAYER_BY_ID[l.id]) return;
      // Зөвхөн объектын давхарга — ортофото/меш/BIM-ээс объект тоолох боломжгүй
      if (typeof (l as { queryFeatures?: unknown }).queryFeatures !== 'function') return;
      out.push(l.id);
    });
    if (out.length) return { ids: out, fallback: false };
    /**
     * ⚠️ Нэг ч давхарга асаагүй (энэ харагдацын АНХДАГЧ төлөв) — үнэлгээний
     * үндсэн багцаар тооцно. Давхарга нь зурагт НУУГДМАЛ ч `map`-д баригдсан
     * байдаг тул `queryFeatures` хэвийн ажиллана.
     */
    return { ids: visible.length ? visible : ASSESS_IDS, fallback: true };
  }, [view, visible]);

  /* ── Шинжилгээ ── */

  const run = useCallback(async () => {
    if (!view) return;
    setBusy(true);
    setRunErr(null);
    try {
      const bands = hazard === 'flood' ? await floodBands(level) : airBands(stations, level);
      const extent = hazard === 'flood' ? await floodExtent(level) : airExtent(stations, level);
      if (!extent) throw new Error(tr('Аюулын мужийг байгуулж чадсангүй'));
      const { ids, fallback } = activeIds();
      const rows = await damageOf(view, ids, extent, level, hazard);
      setResult({ hazard, level, bands, rows, layers: ids.length, fallback });
      // Үр дүн рүү зөөлөн ойртоно — муж дэлгэцээс хальж болзошгүй
      if (!view.destroyed && extent.extent) {
        view.goTo(extent.extent.clone().expand(1.15), { animate: true, duration: 900 }).catch(() => {});
      }
    } catch (err) {
      setRunErr(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, [view, hazard, level, stations, activeIds]);

  /* ══════════ Зурган дээрх мэдээлэл — «дарж юу вэ гэдгийг мэдэх» ══════════
   *
   * ⚠️ ХОЁР ТУСДАА эх сурвалж, тусдаа нүд:
   *   · `hazInfo`  — `Overlay`-гийн даралт: улаан объект, аюулын муж, харуул.
   *   · `featInfo` — `MapCanvas`-ийн өөрийн даралт: каталогийн давхаргын объект.
   *
   * Нэг даралтад ХОЁУЛАА ажиллана (өөр өөр асуултад хариулна) бөгөөд аль нь
   * түрүүлж дуусахыг баталгаажуулах боломжгүй — `MapCanvas`-ийнх нь заримдаа
   * REST асуулга руу шилждэг тул удаан. Нэг нүдэнд бичвэл сүүлд ирсэн `null`
   * нь нөгөөгийнхөө олсон хариуг чимээгүй устгана. Тиймээс тусад нь хадгалж,
   * дэлгэцэд аюулынхыг НЬ ТЭРГҮҮНД тавина.
   */
  const [hazInfo, setHazInfo] = useState<Info | null>(null);
  const [featInfo, setFeatInfo] = useState<Info | null>(null);
  const info = hazInfo ?? featInfo;

  const clear = useCallback(() => {
    setResult(null);
    setRunErr(null);
    /* ⚠️ Мэдээллийн хайрцгийг ч хаана — эс бөгөөс устгасан үр дүнгийн мужийн
       гүн/агууламж зурган дээр үлдэж, «юу ч байхгүй атал тоо байна» болно. */
    setHazInfo(null);
    setFeatInfo(null);
  }, []);

  const liveRef = useRef(live);
  liveRef.current = live;
  const resultRef = useRef(result);
  resultRef.current = result;
  const viewRef = useRef(view);
  viewRef.current = view;
  const hazardRef = useRef(hazard);
  hazardRef.current = hazard;

  /** Мужийн утга — үерт гүн (м), агаарт агууламж (µg/м³) */
  const bandRow = useCallback((b: Band): { k: string; v: string } => (
    (resultRef.current?.hazard ?? hazardRef.current) === 'flood'
      ? { k: tr('Усны гүн'), v: tr('{0} м', num(b.value, 2)) }
      : { k: tr('PM2.5 агууламж'), v: tr('{0} µg/м³', num(b.value, 0)) }
  ), []);

  /** Аюулын даралт — харуул / өртсөн объект / муж */
  const onMapPick = useCallback(async (p: Pick) => {
    if (!p) { setHazInfo(null); return; }

    if (p.kind === 'station') {
      // Зурган дээрх цэгийг дарахад ЗҮҮН жагсаалтын сонголт ч дагана
      setSel(p.oid);
      const st = liveRef.current.find((x) => x.oid === p.oid);
      setHazInfo(st ? {
        title: st.name,
        sub: KIND_LABEL[st.kind],
        rows: st.metrics.slice(0, 6).map((m) => ({
          k: m.label,
          v: `${num(m.latest, m.dp)} ${m.unit}`.trim(),
          tone: GRADE_COLOR[gradeOf(m)],
        })),
      } : null);
      return;
    }

    if (p.kind === 'flood') {
      const fd = floodRef.current;
      if (!fd) { setHazInfo(null); return; }
      const s = sliceRef.current;
      const d = fd.depth(s, p.idx);
      const uu = fd.u(s, p.idx);
      const vv = fd.v(s, p.idx);
      const sp = Math.hypot(uu, vv);
      if (d < fd.meta.wetM) {
        setHazInfo({
          title: tr('Энэ цэгт ус ирээгүй'),
          sub: tr('{0}-р минут', num(fd.minuteAt(s), 1)),
          rows: [],
        });
        return;
      }
      const risk = depthRisk(d);
      setHazInfo({
        title: tr('Үерийн нүд'),
        sub: tr('{0}-р минут · {1} × {1} м', num(fd.minuteAt(s), 1), num(fd.meta.cellM, 1)),
        tone: 'var(--data)',
        rows: [
          { k: tr('Усны гүн'), v: tr('{0} м', num(d, 2)), tone: risk.color },
          { k: tr('Эрсдэл'), v: risk.label, tone: risk.color },
          { k: tr('Урсгалын хурд'), v: tr('{0} м/с', num(sp, 2)) },
          { k: tr('Урсгалын чиглэл'), v: `${flowDir(uu, vv)} · ${num(flowDeg(uu, vv), 0)}°` },
        ],
        /* Тухайн нүдний 12 алхмын түүх — бяцхан график */
        spark: fd.series(p.idx),
        sparkAt: s,
      });
      return;
    }

    if (p.kind === 'band') {
      setHazInfo({
        title: p.band.label,
        sub: tr('Аюулын муж'),
        rows: [
          bandRow(p.band),
          { k: tr('3D өндөр'), v: tr('{0} м', num(p.band.height, 1)) },
        ],
      });
      return;
    }

    /* Өртсөн объект — эх давхаргаас БҮТЭН атрибутыг татна */
    const def = LAYER_BY_ID[p.layerId];
    const head: Info = {
      title: def?.title ?? p.layerId,
      sub: tr('Өртсөн объект'),
      tone: 'var(--bad)',
      rows: p.band ? [bandRow(p.band)] : [],
    };
    setHazInfo(head);
    const fl = viewRef.current?.map?.findLayerById(p.layerId) as __esri.FeatureLayer | undefined;
    if (!fl || p.oid == null || typeof fl.queryFeatures !== 'function') return;
    try {
      const res = await fl.queryFeatures({
        objectIds: [p.oid], outFields: ['*'], returnGeometry: false,
      } as unknown as __esri.Query);
      const a = res.features[0]?.attributes as Record<string, unknown> | undefined;
      if (a) setHazInfo({ ...head, rows: [...head.rows, ...attrRows(a)] });
    } catch {
      // Атрибут татагдаагүй ч мужийн мэдээлэл нь дэлгэцэд үлдэнэ
    }
  }, [bandRow]);

  /**
   * Каталогийн давхаргын объектын даралт (`MapCanvas`).
   * ⚠️ Дамжуулах функц нь ТОГТВОРТОЙ байх ЁСТОЙ — `MapCanvas` нь memo() тул
   * render бүрд шинэ функц өгвөл 3000 мөрт компонент дэмий дахин зурагдана.
   */
  const featCb = useRef<(a: Record<string, unknown> | null, id: string | null) => void>(() => {});
  featCb.current = (attrs, layerId) => {
    if (!attrs || !layerId) { setFeatInfo(null); return; }
    setFeatInfo({
      title: LAYER_BY_ID[layerId]?.title ?? layerId,
      sub: tr('Давхаргын объект'),
      rows: attrRows(attrs),
    });
  };
  const onFeaturePick = useCallback(
    (a: Record<string, unknown> | null, id: string | null) => featCb.current(a, id),
    [],
  );

  /**
   * ⚠️ Горим/аюул/түвшин солиход хуучин үр дүнг АРИЛГАНА. Эс бөгөөс «2-р
   * түвшин» дараад зурагт 1-р түвшний улаан үлдэж, хэрэглэгч шинэ хариу
   * харлаа гэж эндүүрнэ.
   */
  const prev = useRef({ hazard, level, mode });
  useEffect(() => {
    const p = prev.current;
    if (p.hazard !== hazard || p.level !== level || p.mode !== mode) {
      prev.current = { hazard, level, mode };
      setResult(null);
      setRunErr(null);
      setHazInfo(null);
      setFeatInfo(null);
    }
  }, [hazard, level, mode]);

  /* ── Хохирлын нэгтгэл ── */
  const sum = useMemo(() => {
    const rows = result?.rows ?? [];
    return {
      n: rows.reduce((s, r) => s + r.n, 0),
      area: rows.reduce((s, r) => s + r.area, 0),
      length: rows.reduce((s, r) => s + r.length, 0),
      cost: rows.reduce((s, r) => s + r.cost, 0),
      /**
       * Өртөх оршин суугч — ⚠️ мөр бүрийн `people` нь ЗӨВХӨН барилгын ангиллаас
       * бодогддог (`ersdelGeom.ts`). Урьд нь энд БҮХ талбайн давхаргаас
       * (явган зам, ногоон…) тооцдог байсан нь хүний тоог хэдэн дахин
       * хөөрөгдөж байв.
       */
      people: rows.reduce((s, r) => s + r.people, 0),
    };
  }, [result]);

  /**
   * ШИНЖИЛГЭЭНИЙ БҮС нь ҮРГЭЛЖ зурагдана (хэрэглэгчийн хүсэлт, 2026-08-27).
   *
   * ⚠️ Түр хугацаанд үерийн үед нуусан байсан — «растер усыг өөрөө харуулж
   * байна» гэсэн үндэслэлээр. Гэвч тэгснээр «түвшин сонгоод Шинжилгээ дарахад»
   * ЯМАР ч муж гарахгүй болж, сонгосон түвшин зурган дээр огт мэдэгдэхгүй байв.
   * Бүс нь шинжилгээний ХИЛ — ямар талбайд ямар объект тоологдсоныг заана.
   *
   * ⚠️ Үерийн үед `Overlay` нь дүүргэлтийг НИМГЭН болгож, хүрээг ТОД болгоно
   * (доорх урсаж буй ус уншигдсан хэвээр) — `bandOnFlood` тугийг үз.
   */
  const bands = result?.bands ?? [];
  const overWater = result?.hazard === 'flood' && !!flood;

  return (
    <div ref={side.hostRef} className={`${e.frame} ${side.hostClass}`} style={side.style}>
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />

      {/* ═══════════ ЗҮҮН: горим ба хувилбар ═══════════ */}
      <div className={e.left}>
        <h3 className={e.colHd}>{tr('IoT-ийн нэгтгэсэн үр дүн')}</h3>

        <section className={e.panel}>
          <div className={e.panelBody}>
            <Tabs
              items={[
                { key: 'now', label: tr('Одоогийн байдал') },
                { key: 'model', label: tr('Таамаглалын загвар') },
              ]}
              value={mode}
              onChange={(k) => setMode(k as 'now' | 'model')}
            />
            {/* ⚠️ Энэ мөр НУУГДАХГҮЙ: заалт нь жишээ өгөгдөл гэдгийг хэрэглэгч
                ямар ч горимд, ямар ч үед харна. */}
            <Note>
              {tr('ҮЕРИЙН загварчлал нь ОБЕГ-ын гидравлик тооцооны БОДИТ үр дүн; харуулын байршил, өртсөн объект ч бодит. Харин харуулын ЗААЛТ ба АГААРЫН бохирдлын хувилбар нь жишээ өгөгдөл — амьд хэмжилт биш.')}
            </Note>
          </div>
        </section>

        {mode === 'now' ? (
          <>
            {/* ── Голын ус ── */}
            <section className={e.panel} aria-label={KIND_LABEL.water}>
              <header className={e.panelHd}>
                <h3 className={e.panelTitle}>
                  <Icon name="droplet" size={14} /> {tr('Голын ус')}
                </h3>
                <span className={e.panelNote}>{tr('{0} харуул', num(water.length))}</span>
              </header>
              <div className={e.panelBody}>
                {q.state === 'loading' ? <Loading label={tr('Харуул уншиж байна…')} />
                  : q.state === 'error' ? <Empty label={tr('Харуулын давхарга татагдсангүй')} />
                    : water.length === 0 ? <Empty label={tr('Усны харуул алга')} />
                      : (
                        <>
                          <Stats cols={2}>
                            <Stat
                              value={num(avgOf(water, 'level'), 2)} unit={tr('м')}
                              label={tr('Дундаж түвшин')}
                            />
                            <Stat
                              value={num(avgOf(water, 'flow'), 2)} unit={tr('м³/с')}
                              label={tr('Дундаж урсац')}
                            />
                            <Stat
                              value={num(avgOf(water, 'turb'), 0)} unit="NTU"
                              label={tr('Булингар')}
                            />
                            <Stat
                              value={num(avgOf(water, 'do'), 2)} unit={tr('мг/л')}
                              label={tr('Хүчилтөрөгч')}
                            />
                          </Stats>
                          <div className={e.stList}>
                            {water.map((st) => (
                              <StationRow
                                key={st.oid} st={st} on={current?.oid === st.oid}
                                onPick={() => setSel(st.oid)}
                              />
                            ))}
                          </div>
                        </>
                      )}
              </div>
            </section>

            {/* ── Агаарын чанар ── */}
            <section className={e.panel} aria-label={KIND_LABEL.air}>
              <header className={e.panelHd}>
                <h3 className={e.panelTitle}>
                  <Icon name="flame" size={14} /> {tr('Агаарын чанар')}
                </h3>
                <span className={e.panelNote}>{tr('{0} харуул', num(air.length))}</span>
              </header>
              <div className={e.panelBody}>
                {air.length === 0 ? <Empty label={tr('Агаарын харуул алга')} /> : (() => {
                  const aqi = Math.round(maxOf(air, 'aqi'));
                  const band = AQI_BAND(aqi);
                  return (
                    <>
                      <div className={e.ringBox}>
                        {/* ⚠️ АЧИ нь 0–500 хуваарьтай тул `Ring`-ийн хувийг
                            500-д харьцуулж бодов — тоо нь ӨӨРӨӨ доор гарна. */}
                        <Ring value={Math.min(100, (aqi / 500) * 100)} size={124} width={13}
                          color={band.color} label={tr('АЧИ')} decimals={0} />
                        <p className={e.ringNote}>
                          <b className="num">{num(aqi)}</b> <span>{band.label}</span>
                          <span className={e.ringSub}>
                            {tr('PM2.5 дундаж {0} µg/м³', num(avgOf(air, 'pm25'), 1))}
                          </span>
                        </p>
                      </div>
                      <div className={e.stList}>
                        {air.map((st) => (
                          <StationRow
                            key={st.oid} st={st} on={current?.oid === st.oid}
                            onPick={() => setSel(st.oid)}
                          />
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </section>
          </>
        ) : (
          <>
            {/* ── Аюулын төрөл ── */}
            <section className={e.panel} aria-label={tr('Аюулын төрөл')}>
              <header className={e.panelHd}>
                <h3 className={e.panelTitle}>{tr('1 · Аюулын төрөл')}</h3>
              </header>
              <div className={e.panelBody}>
                <div className={e.pickGrid}>
                  {HAZARDS.map((h) => (
                    <button
                      key={h.key}
                      type="button"
                      className={`${e.pick} ${hazard === h.key ? e.pickOn : ''}`}
                      onClick={() => setHazard(h.key)}
                      aria-pressed={hazard === h.key}
                      title={h.desc}
                    >
                      <Icon name={h.icon} size={18} />
                      <span className={e.pickTitle}>{h.title}</span>
                      <span className={e.pickDesc}>{h.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Түвшин ── */}
            <section className={e.panel} aria-label={tr('Аюулын түвшин')}>
              <header className={e.panelHd}>
                <h3 className={e.panelTitle}>{tr('2 · Аюулын түвшин')}</h3>
                {/* ⚠️ Дарааллыг ИЛ хэлнэ — «1» нь ихэвчлэн «хамгийн бага» гэж
                    ойлгогддог; энд ЭСРЭГ утгатай. */}
                <span className={e.panelNote}>{tr('1 = хамгийн хүнд')}</span>
              </header>
              <div className={e.panelBody}>
                <div className={e.lvGrid}>
                  {LEVELS.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      className={`${e.lv} ${level === l.key ? e.lvOn : ''}`}
                      style={{ ['--tone' as string]: l.color }}
                      onClick={() => setLevel(l.key)}
                      aria-pressed={level === l.key}
                    >
                      <span className={`${e.lvNo} num`}>{l.key}</span>
                      <span className={e.lvText}>{l.title}</span>
                    </button>
                  ))}
                </div>

                {/* Сонгосон хувилбарын БОДИТ параметр — таамгийг ил гаргана */}
                <p className={e.scenario}>{scenarioNote(hazard, level)}</p>
                {hazard === 'flood' ? (
                  <Stats cols={3}>
                    <Stat value={num(FLOOD_LEVELS[level].period)} unit={tr('жил')} label={tr('Давтагдал')} />
                    <Stat value={num(FLOOD_LEVELS[level].peak)} unit={tr('м³/с')} label={tr('Оргил урсац')} />
                    <Stat value={num(FLOOD_LEVELS[level].depth, 1)} unit={tr('м')} label={tr('Дундаж гүн')} />
                    <Stat value={num(FLOOD_LEVELS[level].rain)} unit={tr('мм')} label={tr('24ц хур')} />
                    <Stat value={num(FLOOD_LEVELS[level].reach)} unit={tr('м')} label={tr('Үерийн зурвас')} />
                    <Stat value={num(FLOOD_LEVELS[level].lead)} unit={tr('цаг')} label={tr('Сэрэмжлүүлэх')} />
                  </Stats>
                ) : (
                  <Stats cols={3}>
                    <Stat value={num(AIR_LEVELS[level].pm25)} unit="µg/м³" label="PM2.5" />
                    <Stat value={num(AIR_LEVELS[level].aqi)} unit="" label={tr('АЧИ')} />
                    <Stat value={num(AIR_LEVELS[level].inversion)} unit={tr('м')} label={tr('Инверси')} />
                    <Stat value={num(AIR_LEVELS[level].wind, 1)} unit={tr('м/с')} label={tr('Салхи')} />
                    <Stat value={num(AIR_LEVELS[level].plume)} unit={tr('м')} label={tr('Сэвсгэрийн урт')} />
                    <Stat value={num(AIR_LEVELS[level].hours)} unit={tr('цаг')} label={tr('Үргэлжлэх')} />
                  </Stats>
                )}
              </div>
            </section>

            {/* ── ЦАГ ХУГАЦАА — зөвхөн үерийн загварчлалд ──
                ⚠️ ArcGIS Flood Simulation нь усны тархалтын ЯВЦ гаргадаг тул
                зөвхөн нэг агшин харуулах нь загварчлалын гол утгыг алдагдуулна. */}
            {hazard === 'flood' && (
              <section className={e.panel} aria-label={tr('Цаг хугацаа')}>
                <header className={e.panelHd}>
                  <h3 className={e.panelTitle}>
                    <Icon name="waves" size={14} /> {tr('Усны тархалт')}
                  </h3>
                  <span className={e.panelNote}>
                    {flood ? tr('{0} алхам', num(flood.meta.slices)) : '…'}
                  </span>
                </header>
                <div className={e.panelBody}>
                  {floodErr ? (
                    <Note><span style={{ color: 'var(--bad-ink)' }}>{floodErr}</span></Note>
                  ) : !flood ? (
                    <Loading label={tr('Загварчлал уншиж байна… (19 МБ)')} />
                  ) : (
                    <>
                      <div className={e.timeRow}>
                        <button
                          type="button"
                          className={e.playBtn}
                          onClick={() => setPlaying((v) => !v)}
                          aria-pressed={playing}
                          aria-label={playing ? tr('Зогсоох') : tr('Тоглуулах')}
                        >
                          {playing ? '❚❚' : '▶'}
                        </button>
                        <input
                          type="range"
                          className={e.timeRange}
                          min={0}
                          max={flood.meta.slices - 1}
                          step={1}
                          value={slice}
                          onChange={(ev) => { setPlaying(false); setSlice(Number(ev.target.value)); }}
                          aria-label={tr('Хугацааны алхам')}
                        />
                        <span className={`${e.timeVal} num`}>
                          {tr('{0} мин', num(flood.minuteAt(slice), 1))}
                        </span>
                      </div>
                      {/* Тухайн агшны БОДИТ үзүүлэлт — эх 4096 тороос бодогдсон */}
                      <Stats cols={3}>
                        <Stat value={num(flood.meta.stats[slice].wetHa, 1)} unit={tr('га')}
                          label={tr('Усанд автсан')} accent />
                        <Stat value={num(flood.meta.stats[slice].peakM, 2)} unit={tr('м')}
                          label={tr('Дээд гүн')} />
                        <Stat value={num(flood.meta.stats[slice].maxSpeed, 1)} unit={tr('м/с')}
                          label={tr('Дээд хурд')} />
                      </Stats>
                      <p className={e.hint}>
                        {tr('Зурган дээр дарж тухайн нүдний гүн, урсгалын хурд, чиглэл, 12 алхмын түүхийг үзнэ.')}
                      </p>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* ── Шинжилгээ ── */}
            <section className={e.panel} aria-label={tr('Шинжилгээ')}>
              <header className={e.panelHd}>
                <h3 className={e.panelTitle}>{tr('3 · Шинжилгээ')}</h3>
              </header>
              <div className={e.panelBody}>
                <p className={e.hint}>
                  {tr('Зурагт ИДЭВХТЭЙ байгаа давхаргууд шинжилгээнд орно. Каталогоос давхарга нэмбэл дахин ажиллуулна.')}
                </p>
                <div className={e.runRow}>
                  <button
                    type="button"
                    className={e.runBtn}
                    onClick={run}
                    disabled={busy || !view || q.state !== 'ready'}
                  >
                    <Icon name="target" size={15} />
                    {busy ? tr('Тооцоолж байна…') : tr('Шинжилгээ хийх')}
                  </button>
                  {result && (
                    <button type="button" className={e.clearBtn} onClick={clear}>
                      <Icon name="reset" size={14} /> {tr('Цэвэрлэх')}
                    </button>
                  )}
                </div>
                {runErr && <Note><span style={{ color: 'var(--bad-ink)' }}>{runErr}</span></Note>}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ═══════════ ТӨВ: газрын зураг ═══════════ */}
      <main className={e.map}>
        <MapCanvas
          dim={dim}
          visible={visible}
          opacity={opacity}
          zone={zone}
          uniform
          /* ⚠️ ХООСОН эхлэл — суурь 14 давхарга автоматаар асахгүй (§INITIAL_IDS) */
          bare
          onPick={onFeaturePick}
        />

        {/* Аюулын муж · өртсөн объект · харуулын цэг — БҮГД график (2D/3D/BIM) */}
        <Overlay
          dim={dim}
          bands={bands}
          bandOnFlood={overWater}
          damage={result?.rows ?? []}
          stations={stations}
          selected={current?.oid ?? null}
          onPick={onMapPick}
          flood={wantFlood ? flood : null}
          floodSlice={slice}
          playing={playing}
          onSlice={setSlice}
        />

        <MapTools
          dim={dim}
          setDim={setDim}
          layersOpen={catOpen}
          onLayers={() => setCatOpen((v) => !v)}
          opacityOpen={opOpen}
          onOpacity={() => setOpOpen((v) => !v)}
          zone={zone}
          setZone={setZone}
        >
          {mode === 'model' && (
            <MapToolBtn icon="target" onClick={run} disabled={busy || !view}>
              {busy ? tr('Тооцоолж байна…') : tr('Шинжилгээ')}
            </MapToolBtn>
          )}
          {result && <MapToolBtn onClick={clear}>{tr('Цэвэрлэх')}</MapToolBtn>}
        </MapTools>

        {catOpen && (
          <div className={o.catPanel}>
            <LayerCatalog
              view="ersdel"
              totals={catTotals}
              visible={visible}
              setVisible={setVisible}
              selected={layerSel}
              onSelect={setLayerSel}
              onClose={() => setCatOpen(false)}
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

        {/* ── Тайлбар (легенд) — муж бүрийн өнгө ба ЮУГ хэлж буй ── */}
        {(bands.length > 0 || mode === 'now') && (
          <div className={e.legend}>
            {/* ⚠️ ҮЕРТ бүс тус бүрийн хайрцаг БИШ, тасралтгүй ШАТЛАЛ: растер нь
                гүнийг тасралтгүй өнгөөр зурдаг тул дөрвөн хайрцаг нь худал
                зэрэглэл харуулна. */}
            {result?.hazard === 'flood' && flood && (
              <span className={`${e.legItem} ${e.ramp}`}>
                <i className={e.rampBar} aria-hidden />
                {tr('Усны гүн')}
                <b className="num">{tr('0 … {0} м', num(flood.meta.peakDepthM, 1))}</b>
              </span>
            )}
            {bands.map((b) => (
              <span key={b.key} className={e.legItem}>
                <i className={e.legSwatch} style={{ background: b.hue }} aria-hidden />
                {b.label}
                {/* ⚠️ ТОО ЗААВАЛ: бүсийн нэр нь хоёр талдаа ЧАНАРЫН шошго
                    («Гүн ус», «Өндөр агууламж») бөгөөд ХЭД гэдгийг хэлэхгүй.
                    Нэгж нь аюулын төрлөөс хамаарна — үерт метр, агаарт µg/м³. */}
                <b className="num">
                  {result?.hazard === 'flood'
                    ? tr('{0} м', num(b.value, 2))
                    : tr('{0} µg/м³', num(b.value, 0))}
                </b>
              </span>
            ))}
            {result && result.rows.length > 0 && (
              <span className={e.legItem}>
                <i className={e.legSwatch} style={{ background: '#dc2626' }} aria-hidden />
                {tr('Өртсөн объект')}
                <b className="num">{num(sum.n)}</b>
              </span>
            )}
            {mode === 'now' && (
              <>
                <span className={e.legItem}>
                  <i className={`${e.legSwatch} ${e.legDot}`} style={{ background: '#0284c7' }} aria-hidden />
                  {tr('Усны харуул')}
                  <b className="num">{num(water.length)}</b>
                </span>
                <span className={e.legItem}>
                  <i className={`${e.legSwatch} ${e.legDia}`} style={{ background: '#ea580c' }} aria-hidden />
                  {tr('Агаарын харуул')}
                  <b className="num">{num(air.length)}</b>
                </span>
              </>
            )}
          </div>
        )}

        {/* Идэвхтэй хувилбарын чип — зурган дээр «юу харагдаж байна» гэдгийг хэлнэ */}
        {result && (
          <div className={e.chip}>
            <span className={e.chipDot} aria-hidden />
            <span className={e.chipText}>
              {HAZARDS.find((h) => h.key === result.hazard)?.title}
              {' · '}
              {LEVELS.find((l) => l.key === result.level)?.short}
            </span>
            <span className={e.chipSub}>{tr('{0} давхарга шинжлэв', num(result.layers))}</span>
          </div>
        )}

        {/* ── Дарсан зүйлийн МЭДЭЭЛЭЛ — зургийн баруун доод буланд ──
            ⚠️ Баруун баганад БИШ, зурган дээр: хэрэглэгчийн нүд дарсан цэг дээрээ
            байгаа бөгөөд 300px хол харах нь холбоог тасалдаг. Мөн баруун багана
            нь горимоос хамааран өөр агуулгатай (заалт / хохирол) тул түүнийг
            дарж бичих нь хоёр мэдээллийг зөрчилдүүлнэ. */}
        {info && (
          <aside className={e.info} aria-label={info.title}>
            <header className={e.infoHd} style={info.tone ? { ['--tone' as string]: info.tone } : undefined}>
              <span className={e.infoTitle}>{info.title}</span>
              <button
                type="button"
                className={e.infoClose}
                onClick={() => { setHazInfo(null); setFeatInfo(null); }}
                aria-label={tr('Хаах')}
              >
                ×
              </button>
            </header>
            {info.sub && <p className={e.infoSub}>{info.sub}</p>}
            {info.spark && info.sparkAt != null && (
              <div className={e.sparkBox}>
                <div className={e.sparkHd}>
                  <span>{tr('Гүний хувьсал')}</span>
                  <b className="num">{tr('дээд {0} м', num(Math.max(...info.spark.depth), 2))}</b>
                </div>
                <Spark vals={info.spark.depth} at={info.sparkAt} color="var(--data)" unit={tr('м')} />
                <div className={e.sparkHd}>
                  <span>{tr('Хурдны хувьсал')}</span>
                  <b className="num">{tr('дээд {0} м/с', num(Math.max(...info.spark.speed), 2))}</b>
                </div>
                <Spark vals={info.spark.speed} at={info.sparkAt} color="var(--warn-ink)" unit={tr('м/с')} />
              </div>
            )}
            {info.rows.length === 0 ? (
              <p className={e.infoSub}>{tr('Нэмэлт мэдээлэл алга')}</p>
            ) : (
              <dl className={e.infoRows}>
                {info.rows.map((r, i) => (
                  <div key={`${r.k}-${i}`} className={e.infoRow}>
                    <dt className={e.infoKey}>{r.k}</dt>
                    <dd className={`${e.infoVal} num`} style={r.tone ? { color: r.tone } : undefined}>{r.v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </aside>
        )}
      </main>

      {/* ═══════════ БАРУУН: үр дүн ═══════════ */}
      <div className={e.right}>
        {mode === 'now' ? (
          <>
            <h3 className={e.colHd}>{tr('Харуулын заалт')}</h3>
            {!current ? (
              <section className={e.panel}>
                <div className={e.panelBody}>
                  {q.state === 'loading' ? <Loading /> : <Empty label={tr('Харуул сонгоно уу')} />}
                </div>
              </section>
            ) : (
              <>
                <section className={e.panel}>
                  <header className={e.panelHd}>
                    <h3 className={e.panelTitle}>{current.name}</h3>
                    <span className={e.panelNote}>{KIND_LABEL[current.kind]}</span>
                  </header>
                  <div className={e.panelBody}>
                    <div className={e.grid}>
                      {current.metrics.map((m) => <Cell key={m.key} m={m} />)}
                    </div>
                  </div>
                </section>

                {/* Гол хоёр үзүүлэлтийн 72 цагийн цуваа */}
                {current.metrics
                  .filter((m) => (current.kind === 'water'
                    ? ['level', 'flow', 'turb'].includes(m.key)
                    : ['pm25', 'aqi', 'no2'].includes(m.key)))
                  .map((m) => (
                    <section key={m.key} className={e.panel}>
                      <header className={e.panelHd}>
                        <h3 className={e.panelTitle} title={m.note}>
                          {m.label}{m.unit ? `, ${m.unit}` : ''}
                        </h3>
                        <span className={e.panelNote}>{tr('{0} цаг', num(SPAN_H))}</span>
                      </header>
                      <div className={e.panelBody}>
                        <Trend
                          unit={m.unit}
                          height={132}
                          visible={10}
                          points={m.points.map((p) => ({ label: axisLabel(p.t), value: p.v }))}
                        />
                      </div>
                    </section>
                  ))}
              </>
            )}
          </>
        ) : (
          <>
            <h3 className={e.colHd}>{tr('Хохирлын урьдчилсан үнэлгээ')}</h3>
            {!result ? (
              <section className={e.panel}>
                <div className={e.panelBody}>
                  {busy ? <Loading label={tr('Орон зайн шинжилгээ явж байна…')} />
                    : <Empty label={tr('Хувилбар сонгоод «Шинжилгээ хийх» дарна уу')} />}
                </div>
              </section>
            ) : result.rows.length === 0 ? (
              <section className={e.panel}>
                <div className={e.panelBody}>
                  <Empty label={tr('Идэвхтэй давхаргаас өртсөн объект олдсонгүй')} />
                  <Note>
                    {tr('Каталогоос барилга, зам, инженерийн шугам зэрэг давхаргыг асаагаад дахин ажиллуулна уу.')}
                  </Note>
                </div>
              </section>
            ) : (
              <>
                <section className={`${e.panel} ${e.panelBad}`}>
                  <header className={e.panelHd}>
                    <h3 className={e.panelTitle}>{tr('Нэгтгэл')}</h3>
                    <span className={e.panelNote}>
                      {LEVELS.find((l) => l.key === result.level)?.short}
                    </span>
                  </header>
                  <div className={e.panelBody}>
                    <Stats cols={2}>
                      <Stat value={num(sum.n)} unit={tr('ш')} label={tr('Өртсөн объект')} accent />
                      <Stat value={ha(sum.area, 2)} unit={tr('га')} label={tr('Өртсөн талбай')} />
                      {sum.length > 0 && (
                        <Stat value={num(sum.length / 1000, 2)} unit={tr('км')} label={tr('Өртсөн шугам')} />
                      )}
                      {result.hazard === 'air' ? (
                        <Stat value={num(sum.people, 0)} unit={tr('хүн')} label={tr('Өртөх оршин суугч')} />
                      ) : (
                        <Stat value={num(result.layers)} unit={tr('давхарга')} label={tr('Шинжилсэн')} />
                      )}
                    </Stats>
                    <div className={e.costBox}>
                      <span className={e.costLabel}>
                        {result.hazard === 'air' ? tr('Эрүүл мэндийн зардлын таамаг') : tr('Сэргээн засварлалтын таамаг')}
                      </span>
                      <span className={`${e.costVal} num`}>{mntAbbr(sum.cost)}</span>
                    </div>
                    {result.hazard === 'flood' && (
                      /* ⚠️ ХОЁР ӨӨР зүйл нэг зурган дээр байгааг ил хэлнэ:
                         хохирол нь СОНГОСОН ТҮВШНИЙ зурвасаар бодогдоно, харин
                         доор урсаж буй ус нь ОБЕГ-ын загварчлалын бодит үр дүн.
                         Хэлэхгүй бол «яагаад ус зурвасаас гарч байна вэ?» гэсэн
                         зөрчил гарна. */
                      <Note>
                        {tr('Хохирол нь сонгосон түвшний үерийн зурвасаар (голын ирмэгээс {0} м) бодогдов. Доор урсаж буй ус нь ОБЕГ-ын загварчлалын тусдаа үр дүн — хоёулаа нэг зурган дээр харагдана.',
                          num(FLOOD_LEVELS[result.level].reach))}
                      </Note>
                    )}
                    {result.fallback && (
                      <Note>
                        {tr('Зурагт давхарга асаагаагүй тул үнэлгээний ҮНДСЭН БАГЦААР (барилга, зам, явган зам, дугуйн зам, гүүр, ногоон, мод, тоглоом) тооцов. Каталогоос давхарга асаавал ЗӨВХӨН тэдгээрээр тооцно.')}
                      </Note>
                    )}
                    <Note>
                      {result.hazard === 'air'
                        ? tr('Өртөлтөөр: ЗӨВХӨН барилгын талбайгаас — {0} м²-д 1 оршин суугч, хүн тутамд өдрийн {1} ₮ зардлын таамгаар. Эмнэлгийн бодит бүртгэлээс уншаагүй.',
                          num(EXPOSURE.m2PerPerson), num(EXPOSURE.costPerPersonDay))
                        : tr('Нэгж үнэлгээ нь объектын АНГИЛЛААС: барилга {0} {1} · хатуу хучилт {2} {3} · ногоон {4} {5} · мод {6} {7}. Гэрээний бодит үнээс уншаагүй — ТААМАГ.',
                          num(DAMAGE_RATE.building.rate), DAMAGE_RATE.building.unit,
                          num(DAMAGE_RATE.paved.rate), DAMAGE_RATE.paved.unit,
                          num(DAMAGE_RATE.green.rate), DAMAGE_RATE.green.unit,
                          num(DAMAGE_RATE.tree.rate), DAMAGE_RATE.tree.unit)}
                    </Note>
                  </div>
                </section>

                <section className={e.panel}>
                  <header className={e.panelHd}>
                    <h3 className={e.panelTitle}>{tr('Давхарга тус бүрээр')}</h3>
                    <span className={e.panelNote}>{tr('үнэлгээгээр эрэмбэлэв')}</span>
                  </header>
                  <div className={e.panelBody}>
                    <Bars
                      items={result.rows.map((r) => ({
                        key: r.layerId,
                        label: r.title,
                        value: r.n,
                        display: r.geom === 'area'
                          ? tr('{0} ш · {1} га', num(r.n), ha(r.area, 2))
                          : r.geom === 'line'
                            ? tr('{0} ш · {1} км', num(r.n), num(r.length / 1000, 2))
                            : tr('{0} ш', num(r.n)),
                      }))}
                    />
                    <table className={e.table}>
                      <thead>
                        <tr>
                          <th>{tr('Давхарга')}</th>
                          <th>{tr('Ангилал')}</th>
                          <th className={e.tRight}>{tr('Тоо')}</th>
                          <th className={e.tRight}>{tr('Хэмжээ')}</th>
                          <th className={e.tRight}>{tr('Үнэлгээ')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((r) => (
                          <tr key={r.layerId}>
                            <td>
                              {r.title}
                              {/* ⚠️ Тайрагдсаныг НУУХГҮЙ: тоо нь бүтэн ч зурагт
                                  зөвхөн эхний 1,200 объект улаанаар гарна. */}
                              {r.truncated && (
                                <span className={e.trunc} title={tr('Зурагт эхний 1,200 объект л улаанаар харагдана')}>
                                  {tr('зурагт тайрсан')}
                                </span>
                              )}
                            </td>
                            <td>{DAMAGE_RATE[r.cls].label}</td>
                            <td className={`${e.tRight} num`}>{num(r.n)}</td>
                            <td className={`${e.tRight} num`}>
                              {r.geom === 'area' ? tr('{0} га', ha(r.area, 2))
                                : r.geom === 'line' ? tr('{0} км', num(r.length / 1000, 2))
                                  : '—'}
                            </td>
                            <td className={`${e.tRight} num`}>{r.cost > 0 ? mntAbbr(r.cost) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════ Туслах ══════════════════════ */

/** Харуулуудын нэг үзүүлэлтийн ДУНДАЖ (сүүлийн заалтаар) */
function avgOf(list: StationLive[], key: string): number {
  const vals = list.map((s) => s.metrics.find((m) => m.key === key)?.latest).filter((v): v is number => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

/** Харуулуудын нэг үзүүлэлтийн ХАМГИЙН ИХ утга — АЧИ шиг «хамгийн муугаар» үнэлэх зүйлд */
function maxOf(list: StationLive[], key: string): number {
  const vals = list.map((s) => s.metrics.find((m) => m.key === key)?.latest).filter((v): v is number => v != null);
  return vals.length ? Math.max(...vals) : 0;
}
