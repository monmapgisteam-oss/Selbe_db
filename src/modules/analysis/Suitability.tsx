'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as projection from '@arcgis/core/geometry/projection';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import type Polygon from '@arcgis/core/geometry/Polygon';

import {
  INDICATORS, PARKING, MAP_LAYERS, BUILD_COST_PER_M2, DEFAULT_ECON_SHARE,
  SCORE_LEVELS, levelOf,
  type Indicator, type ParkingOpt, type CategoryKey,
} from '@/lib/analysis/config';
import {
  loadAnalysisCached, computeEconomics, computeRaw, defaultGreenCats,
  type AnalysisData,
} from '@/lib/analysis/data';
import { loadCosts, type Costs } from '@/lib/analysis/costs';
import { ZONE_TYPES, ZONE_TYPE_EMPTY_HUE } from '@/lib/services';
import {
  urbanScore, scoreColor, scoreLabel, passesNorm,
} from '@/lib/analysis/score';
import type { Dim } from '@/components/MapCanvas';
import { SuitMap, type MapRow } from './SuitMap';
import { SuitDetail } from './SuitDetail';
import { nf, esc } from './suit/format';
import { valueOf, blendScore, type Mode, type Row } from './suit/model';
import { Shell, Card } from './suit/Layout';
import { Simulation } from './suit/SimulationPanel';
import { useSimClock } from './suit/Timeline';
import {
  simMetric, simRange, simNorm, simColor, simDef, peakVehicles,
  type SimKind, type PopBasis,
} from './suit/simulation';
import { loadRoadNetworkCached, assignLoads } from './suit/roadNet';
import type { Network } from './suit/traffic';
import type { TrafficStats } from './suit/TrafficOverlay';
import { SuitLayerCatalog } from './suit/LayerCatalog';
import { Icon } from '@/components/Icon';
import { BlendCard } from './suit/BlendCard';
import { CategoryPie, IndicatorPicker, Weights, Parking } from './suit/Urban';
import { EconSummary, EconTune } from './suit/Economics';
import { Ranking } from './suit/Ranking';
import s from './suitability.module.css';

/** «Ачаалал» симуляцад автоматаар асах давхарга — «Зам (талбай)» */
const ROAD_AREA_LAYER = 'et:29';

/* ══════════════════ Үндсэн компонент ══════════════════ */

export function Suitability({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /* ── Ачаалалт ── */
  const [data, setData] = useState<AnalysisData | null>(null);
  const [costs, setCosts] = useState<Costs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prog, setProg] = useState({ msg: 'Эхлүүлж байна…', pct: 0 });
  const [projected, setProjected] = useState(false);
  const geomRef = useRef(new Map<string, Polygon | null>());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await loadAnalysisCached((msg, pct) => { if (alive) setProg({ msg, pct: pct * 0.9 }); });
        if (!alive) return;

        // Дүрслэлийн геометрийг Web Mercator рүү (тооцоо нь UTM дээр хэвээр)
        await projection.load();
        const wm = SpatialReference.WebMercator;
        for (const z of d.zones) {
          geomRef.current.set(z.id, z.geometry ? (projection.project(z.geometry, wm) as Polygon) : null);
        }
        if (!alive) return;
        setData(d);
        setProjected(true);

        setProg({ msg: 'Дэд бүтцийн өртөг…', pct: 94 });
        const c = await loadCosts();
        if (!alive) return;
        setCosts(c);
        setProg({ msg: 'Бэлэн', pct: 100 });
      } catch (e: unknown) {
        console.error('[selbe] анализ:', e);
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { alive = false; };
  }, []);

  /* ── Загварын төлөв ── */
  // ⚠️ Нээгдэх горим = ХОТ ТӨЛӨВЛӨЛТ: «Ерөнхий» (blend) таб хасагдсан тул
  //    түүнээр нээвэл ямар ч табгүй хуудас гарна.
  const [mode, setMode] = useState<Mode>('urban');
  /** Нийлмэл оноонд ЭДИЙН ЗАСГИЙН эзлэх хувь (үлдсэнийг хот төлөвлөлт авна) */
  const [econShare, setEconShare] = useState(DEFAULT_ECON_SHARE);
  const [indicators, setIndicators] = useState<Indicator[]>(() => INDICATORS.map((i) => ({ ...i })));
  const [activeIndicator, setActiveIndicator] = useState(INDICATORS[0].id);
  const [catFilter, setCatFilter] = useState<CategoryKey | null>(null);
  /** Идэвхтэй симуляцын дэд төрөл — «Симуляц» табд ашиглана */
  const [simKind, setSimKind] = useState<SimKind>('density');
  /** Хүн амын төрөл — «Хүн амын төвлөрөл» симуляцад (оршин суугч ↔ хүчин чадал) */
  const [popBasis, setPopBasis] = useState<PopBasis>('resident');
  /** Трафик timeline-ийн цаг (замын симуляц + ирээдүйд газрын зургийн анимац) */
  const clock = useSimClock();
  const [parking, setParking] = useState<ParkingOpt>({ ...PARKING });
  const [greenCats] = useState<Set<string>>(() => defaultGreenCats());
  const [selected, setSelected] = useState<string | null>(null);
  /**
   * Бүсийн АНГИЛЛЫН шүүлт — унтраасан ангиллууд (`Angilal` → каноник `type`).
   * Хоосон = бүгд харагдана. Газрын зураг ба эрэмбэд ДИНАМИК үйлчилнэ.
   */
  const [catOff, setCatOff] = useState<Set<string>>(() => new Set());
  const [econOpt, setEconOpt] = useState<{ pricePerM2: number | null; perHa: number | null }>({
    pricePerM2: null, perHa: null,
  });
  /** 1 м² БАРИГДАХ жишиг өртөг — таамаг, гулсуураар тохируулна */
  const [buildCost, setBuildCost] = useState(BUILD_COST_PER_M2);

  /**
   * Контекст давхаргын ил байдал.
   * ⚠️ Карт нь ХУРААГДСАНААР эхэлнэ: анализын гол мессеж нь бүсийн ОНООНЫ
   * БУДАЛТ бөгөөд 27 давхаргын чагт задгай байвал зүүн талбарыг эзэлнэ.
   */
  const [layerOn, setLayerOn] = useState<Record<string, boolean>>(
    () => Object.fromEntries(MAP_LAYERS.map((l) => [l.key, l.on])),
  );
  /**
   * Давхаргын каталог нээлттэй эсэх — «Ерөнхий төлөвлөгөө» дээрх «Давхарга»
   * товчтой ижил зарчим. Хаалттай эхэлж, товч дарахад газрын зурагт хөвж гарна.
   */
  const [layerCatOpen, setLayerCatOpen] = useState(false);

  /* ── Тооцоо ── */
  const perHa = econOpt.perHa ?? costs?.perHa ?? 0;

  const rows = useMemo<Row[]>(() => {
    if (!data || !projected) return [];
    computeEconomics(data.zones, perHa, econOpt.pricePerM2, buildCost);
    computeRaw(data.zones, greenCats, parking);
    return data.zones.map((z) => {
      const u = urbanScore(z.raw, indicators, z.type);
      return { ...z, urban: u.score, parts: u.parts, displayGeom: geomRef.current.get(z.id) ?? null };
    });
  }, [data, projected, perHa, econOpt.pricePerM2, buildCost, greenCats, parking, indicators]);

  /**
   * ОНООЛОЛД орох бүсүүд — ногоон байгууламж, одоо байгаа барилгыг ХАСНА.
   * ⚠️ Газрын зурагт (`rows`) бүх бүс хэвээр (хассан нь саарал), харин эрэмбэ,
   * диаграм, дундаж, эдийн засаг зэрэг ТООЦОО зөвхөн `scoredRows`-оор явна.
   */
  const scoredRows = useMemo(() => rows.filter((r) => !r.excluded), [rows]);

  /** Бүсийн ангиллууд — нэр · тоо · өнгө (ZONE_TYPES дарааллаар). */
  const zoneCats = useMemo(() => {
    const cnt = new Map<string, number>();
    for (const r of rows) cnt.set(r.type, (cnt.get(r.type) ?? 0) + 1);
    const order = Object.keys(ZONE_TYPES);
    return [...cnt.keys()]
      .sort((a, b) => ((order.indexOf(a) + 1) || 99) - ((order.indexOf(b) + 1) || 99))
      .map((type) => ({ type, count: cnt.get(type) ?? 0, color: ZONE_TYPES[type] ?? ZONE_TYPE_EMPTY_HUE }));
  }, [rows]);

  /** Эрэмбэд орох бүс — оноолсон бүсээс ангиллын шүүлтээр (динамик). */
  const rankRows = useMemo(() => scoredRows.filter((r) => !catOff.has(r.type)), [scoredRows, catOff]);

  const ind = indicators.find((i) => i.id === activeIndicator) ?? indicators[0];
  const totalW = indicators.reduce((a, i) => a + i.weight, 0) || 1;

  /** Барилгын давамгайлах нэгж үнэ — гулсуурын анхны утга */
  const basePrice = useMemo(() => {
    const area = scoredRows.reduce((a, r) => a + r.gfaSaleM2, 0);
    const value = scoredRows.reduce((a, r) => a + r.salesValue, 0);
    return area > 0 ? value / area : 0;
  }, [scoredRows]);

  /** Симуляцын хэмжүүрийн хязгаар — нормчилол ба легендэд (харагдах бүсээр). */
  const simRng = useMemo(() => simRange(rows, simKind, popBasis), [rows, simKind, popBasis]);

  /* ── Замын ачаалал: сүлжээг ХЭРЭГТЭЙ болоход нь ачаална ── */
  const roadMode = mode === 'simulation' && simKind === 'road';
  /** Оргил цагт сүлжээнд зэрэг явах машин — бүсийн хүн амаас (гараар өгөөгүй) */
  const peakCars = useMemo(() => peakVehicles(scoredRows), [scoredRows]);
  const [roadNet, setRoadNet] = useState<Network | null>(null);
  const [roadErr, setRoadErr] = useState<string | null>(null);
  const [trafficStats, setTrafficStats] = useState<TrafficStats | null>(null);

  useEffect(() => {
    // ⚠️ 3.9 мянган хэрчмийг «Ачаалал» табыг НЭЭХЭД л татна — бусад горимд
    //    хэрэггүй траффик үүсгэхгүй. `loadRoadNetworkCached` нь дахин татахгүй.
    if (!roadMode || roadNet || !rows.length) return;
    let alive = true;
    loadRoadNetworkCached()
      .then((net) => {
        if (!alive) return;
        assignLoads(net, rows);
        setRoadNet(net);
      })
      .catch((e: unknown) => {
        console.error('[selbe] замын сүлжээ:', e);
        if (alive) setRoadErr(e instanceof Error ? e.message : String(e));
      });
    return () => { alive = false; };
  }, [roadMode, roadNet, rows]);

  /**
   * «Ачаалал» табд ЗАМЫН ТАЛБАЙГ автоматаар асаана — машин агентууд юун дээр
   * гүйж байгаа нь харагдахгүй бол симуляц утгагүй. Агентууд `et:5` тэнхлэгээр
   * явдаг тул `et:29` полигоны яг дундуур гүйж харагдана.
   * ⚠️ Табаас гарахад ЗӨВХӨН өөрсдөө асаасан бол унтраана — хэрэглэгч каталогоос
   * гараар асаасан байсныг таслах эрхгүй.
   */
  const layerOnRef = useRef(layerOn);
  layerOnRef.current = layerOn;
  useEffect(() => {
    if (!roadMode || layerOnRef.current[ROAD_AREA_LAYER]) return;
    setLayerOn((v) => ({ ...v, [ROAD_AREA_LAYER]: true }));
    return () => setLayerOn((v) => ({ ...v, [ROAD_AREA_LAYER]: false }));
  }, [roadMode]);

  const colorOf = useCallback(
    (r: MapRow) =>
      mode === 'simulation'
        ? simColor(simDef(simKind).ready ? simNorm(simMetric(r, simKind, popBasis).value, simRng) : null)
        : scoreColor(valueOf(r as Row, mode, ind, econShare)),
    [mode, ind, econShare, simKind, popBasis, simRng],
  );
  /** Бүс газрын зурагт харагдах эсэх — ангиллын шүүлтээр (унтраасан нь бүдгэрнэ) */
  const shown = useCallback((r: MapRow) => !catOff.has(r.type), [catOff]);

  /* ── Hover панелийн HTML (эх аппын адил мөрөөр) ── */
  const zoneTip = useCallback((r: MapRow) => {
    // Симуляцын горим — дулааны хэмжүүр (оноололын норм-шалгалтаас өөр)
    if (mode === 'simulation') {
      const def = simDef(simKind);
      const m = simMetric(r, simKind, popBasis);
      const t = def.ready ? simNorm(m.value, simRng) : null;
      const dt = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;
      return `
        <div class="t">
          <b>${esc(r.id)}</b>
          <span class="st" style="background:${simColor(t)};color:#1a1205">${t == null ? '—' : Math.round(t * 100)}</span>
        </div>
        <div class="sub2">${esc(r.type)} · ${nf(r.areaHa, 2)} га</div>
        <dl>
          ${dt(esc(def.label), m.text)}
          ${dt('Оршин суугч', nf(r.residentPop))}
          ${dt('Барилга', nf(r.buildingCount))}
        </dl>`;
    }
    const row = r as Row;
    const score = valueOf(row, mode, ind, econShare);
    let pass = 0, total = 0;
    const failed: { name: string; v: string }[] = [];
    for (const i of indicators) {
      const p = row.parts[i.id];
      if (!p || p.value == null) continue;
      total++;
      if (passesNorm(p.value, p.norm ?? i)) pass++;
      else failed.push({ name: i.short, v: nf(p.value, i.decimals) + (i.unit ? ` ${i.unit}` : '') });
    }
    const dt = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;
    return `
      <div class="t">
        <b>${esc(row.id)}</b>
        <span class="st" style="background:${scoreColor(score)}">${score == null ? '—' : Math.round(score)}</span>
      </div>
      <div class="sub2">${esc(row.type)} · ${nf(row.areaHa, 2)} га · ${scoreLabel(score)}</div>
      <dl>
        ${dt('Оршин суугч', nf(row.residentPop))}
        ${dt('Өрх', nf(row.households))}
        ${dt('Барилга', nf(row.buildingCount))}
        ${dt('Норм хангасан', `<b style="color:${pass === total ? '#4ade80' : '#f87171'}">${pass} / ${total}</b>`)}
      </dl>
      ${failed.length ? `<div class="fails">${failed.map((f) =>
        `<div><span>✗ ${esc(f.name)}</span><em>${f.v}</em></div>`).join('')}</div>` : ''}`;
  }, [mode, ind, indicators, econShare, simKind, popBasis, simRng]);

  const buildingTip = useCallback((a: Record<string, unknown>) => {
    const st = String(a.Barilga_ty ?? '').trim();
    const purpose = String(a['Зориулалт_m'] ?? '').trim() || 'Тодорхойгүй';
    const colors: Record<string, string> = {
      'Төлөвлөсөн': 'rgb(96,165,250)',
      'Баригдаж байгаа': 'rgb(251,146,60)',
      'Одоо байгаа': 'rgb(134,139,150)',
    };
    const pop = Number(a.Total_population ?? 0);
    const isRes = /орон сууц|house/i.test(purpose);
    const dt = (k: string, v: string | number | null) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
    return `
      <div class="t">
        <b>${esc(purpose)}</b>
        ${st ? `<span class="st" style="background:${colors[st] ?? 'rgb(203,213,225)'}">${esc(st)}</span>` : ''}
      </div>
      <dl>
        ${dt('Нийт талбай', `${nf(Number(a['Барилгын_нийт_талбай_m2'] ?? 0))} м²`)}
        ${dt('Давхар', Number(a['Давхрын_тоо_max'] ?? 0) || null)}
        ${dt('Өрх', Number(a.Urhiin_too ?? 0) ? nf(Number(a.Urhiin_too)) : null)}
        ${dt(isRes ? 'Оршин суугч' : 'Хүчин чадал', pop ? nf(pop) : null)}
        ${dt('Зогсоол', Number(a.Parking ?? 0) ? nf(Number(a.Parking)) : null)}
        ${dt('Бүс', esc(a.ZONE_ID ?? '—'))}
      </dl>`;
  }, []);

  const active = rows.find((r) => r.id === selected) ?? null;

  /* ── Ачаалж дуусаагүй ── */
  const ready = data != null && costs != null && projected;

  return (
    <div className={s.app}>
      {!ready && (
        <div className={s.loader}>
          <div className={s.loaderBox}>
            <div className={s.loaderTitle}>Сэлбэ дэд төв</div>
            <div className={s.loaderSub}>Тохиромжтой байдлын загварчлал</div>
            <div className={s.loaderBar}><span style={{ width: `${prog.pct}%` }} /></div>
            <div className={`${s.loaderMsg} ${error ? s.loaderErr : ''}`}>
              {error ? `Алдаа гарлаа: ${error}` : prog.msg}
            </div>
          </div>
        </div>
      )}

      <header className={s.topbar}>
        <div className={s.brand}>
          <span className={s.brandMark} />
          <div>
            <h1>Сэлбэ Хот төлөвлөлтийн үзүүлэлтүүд</h1>
          </div>
        </div>
        <nav className={s.tabs}>
          {/* ⚠️ «Ерөнхий» (blend) ба «Эдийн засаг» (econ) табууд ХАСАГДСАН.
              Тэдгээрийн `mode` салаанууд кодод үлдсэн — дахин нээх бол зөвхөн
              энэ жагсаалтад мөрөө нэмнэ. */}
          {([
            ['urban', 'Хот төлөвлөлт'],
            ['indicator', 'Үзүүлэлт'],
            ['simulation', 'Симуляц'],
          ] as const).map(
            ([k, label]) => (
              <button
                key={k}
                type="button"
                className={mode === k ? s.tabActive : undefined}
                onClick={() => setMode(k)}
              >
                {label}
              </button>
            ),
          )}
        </nav>
      </header>

      <Shell
        left={
          <>
            {/* ⚠️ Давхаргын жагсаалт нь зүүн rail-ийн картаас газрын зурган дээрх
                «Давхарга» товч + каталог руу шилжсэн («Ерөнхий төлөвлөгөө»-тэй
                ижил зарчим). Доорх `map` слот дахь `SuitLayerCatalog`-ыг үз. */}
            {/* ⚠️ «Симуляц» карт нь БАРУУН rail-д (доорх `right` слотыг үз) —
                зүүн талд эрэмбэ/ангилал үлдэнэ. */}
            {mode === 'indicator' && (
              <Card title="Хот төлөвлөлтийн тооцоолол">
                <CategoryPie
                  rows={scoredRows}
                  indicators={indicators}
                  totalW={totalW}
                  filter={catFilter}
                  setFilter={setCatFilter}
                />
                <IndicatorPicker
                  rows={scoredRows}
                  indicators={indicators}
                  active={activeIndicator}
                  setActive={setActiveIndicator}
                  totalW={totalW}
                  filter={catFilter}
                />
              </Card>
            )}

            {mode === 'econ' && costs && (
              <Card title="Дэд бүтцийн төсөвт өртөг">
                <EconSummary rows={scoredRows} costs={costs} perHa={perHa} buildCost={buildCost} />
              </Card>
            )}

            {/* Бүсийн ангилал — Angilal-аар шүүх (газрын зураг + эрэмбэ динамик) */}
            <Card id="zoneCat" title="Бүсийн ангилал" collapsible>
              <ZoneCatFilter cats={zoneCats} off={catOff} setOff={setCatOff} />
            </Card>

            {mode !== 'simulation' && (
            <Card
              title={mode === 'econ' ? 'Бүсийн эрэмбэ «Ашигт байдал»'
                : mode === 'indicator' ? `Бүсийн эрэмбэ «${ind.short}»`
                  : mode === 'blend' ? 'Бүсийн эрэмбэ «Нийлмэл»'
                    : 'Бүсийн эрэмбэ'}
              pill={`${rankRows.length} бүс`}
              grow
            >
              <Ranking
                rows={rankRows}
                mode={mode}
                ind={ind}
                econShare={econShare}
                selected={selected}
                onSelect={setSelected}
              />
            </Card>
            )}
          </>
        }
        map={
          <>
            <SuitMap
              dim={dim}
              rows={rows}
              colorOf={colorOf}
              shown={shown}
              selected={selected}
              onSelect={setSelected}
              layerOn={layerOn}
              zoneTip={zoneTip}
              buildingTip={buildingTip}
              traffic={roadMode && roadNet ? {
                net: roadNet,
                minuteRef: clock.minuteRef,
                playing: clock.playing,
                speed: clock.speed,
                maxCars: peakCars,
                onStats: setTrafficStats,
              } : undefined}
            />

            {/* Каталог — «Ерөнхий төлөвлөгөө»-тэй ижил ЗҮҮН талын БҮТЭН ӨНДӨР
                багана (голд хөвөхгүй). */}
            {layerCatOpen && (
              <div className={s.catPanel}>
                <SuitLayerCatalog
                  layerOn={layerOn}
                  setLayerOn={setLayerOn}
                  onClose={() => setLayerCatOpen(false)}
                />
              </div>
            )}

            {/* «Давхарга» товч + 2D/3D/BIM — НЭГ мөрөнд, зүүн доод буланд
                (Давхарга нь дим товчны ӨМНӨ, «Ерөнхий төлөвлөгөө»-тэй ижил).
                ⚠️ ArcGIS-ийн удирдлага (zoom баруун дээд, масштаб баруун доод,
                дэлгэрэнгүй карт зүүн дээд)-тай мөргөлдөхгүй зүүн доод буланд. */}
            <div className={s.mapControls}>
              <button
                type="button"
                aria-pressed={layerCatOpen}
                className={`${s.mapBtn} ${layerCatOpen ? s.mapBtnOn : ''}`}
                onClick={() => setLayerCatOpen((v) => !v)}
                title="Давхаргын жагсаалт"
              >
                <Icon name="layers" size={15} />
                Давхарга
              </button>

              <div className={s.mapDims} role="group" aria-label="Газрын зургийн харагдац">
                {(['2d', '3d', 'bim'] as Dim[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={dim === d}
                    className={`${s.dimBtn} ${dim === d ? s.dimOn : ''}`}
                    onClick={() => setDim(d)}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {active && (
              <SuitDetail
                key={active.id}
                r={active}
                indicators={indicators}
                mode={mode}
                activeIndicator={activeIndicator}
                parking={parking}
                perHa={perHa}
                onClose={() => setSelected(null)}
              />
            )}
          </>
        }
        right={
          <>
            {mode === 'simulation' && (
              <Simulation
                kind={simKind}
                setKind={setSimKind}
                popBasis={popBasis}
                setPopBasis={setPopBasis}
                clock={{
                  minute: clock.minute,
                  playing: clock.playing,
                  setPlaying: clock.setPlaying,
                  speed: clock.speed,
                  setSpeed: clock.setSpeed,
                  seek: clock.seek,
                }}
                road={{
                  edges: roadNet?.edges.length ?? null,
                  peak: peakCars,
                  error: roadErr,
                  stats: trafficStats,
                  flat: dim !== '2d',
                }}
                rows={rows.filter((r) => !catOff.has(r.type))}
                selected={selected}
                onSelect={setSelected}
              />
            )}

            {/* ⚠️ Нийлмэл горимд ЗӨВХӨН хуваарилалтын карт: хот төлөвлөлт болон
                эдийн засгийн нарийн тохиргоо нь тухайн табыг сонгоход нэмэгдэнэ. */}
            {mode === 'blend' && (
              <BlendCard
                rows={scoredRows}
                econShare={econShare}
                setEconShare={setEconShare}
                onPick={setMode}
              />
            )}

            {(mode === 'urban' || mode === 'indicator') && (
              <Card
                id="weights"
                title="Хот төлөвлөлтийн жин"
                collapsible
                action={
                  <button
                    type="button"
                    className={s.mini}
                    title="Анхны утга руу буцаах"
                    onClick={(e) => { e.stopPropagation(); setIndicators(INDICATORS.map((i) => ({ ...i }))); }}
                  >
                    Reset
                  </button>
                }
              >
                <p className={`${s.muted} ${s.small}`}>
                  Үзүүлэлт бүр <b>норм хангавал 100 оноо</b>, зөрчвөл 44-өөс дээшгүй оноо авна.
                  Жин нь нийлбэрээрээ 100% болж автоматаар нормчилогдоно.
                  Босго утгыг БНбД 30-01-24-өөс авсан бөгөөд доорх талбарт засварлаж болно.
                </p>
                <Weights indicators={indicators} setIndicators={setIndicators} totalW={totalW} />
              </Card>
            )}

            {mode === 'econ' && costs && (
              <EconTune
                rows={scoredRows}
                costs={costs}
                basePrice={basePrice}
                econOpt={econOpt}
                setEconOpt={setEconOpt}
                buildCost={buildCost}
                setBuildCost={setBuildCost}
                selected={selected}
                onSelect={setSelected}
              />
            )}

            {(mode === 'urban' || mode === 'indicator') && (
              <Card id="parking" title="Зогсоолын хэрэгцээ" collapsible>
                <Parking rows={scoredRows} parking={parking} setParking={setParking} indicators={indicators} />
              </Card>
            )}
          </>
        }
      />

      {/* Доод хүрээ — оноон түвшний тархалт (газрын зургийг тойрсон бүтэц) */}
      <SuitFooter rows={scoredRows} econShare={econShare} />
    </div>
  );
}

/* ══════════════════ Бүсийн ангиллын шүүлт ══════════════════ */

/**
 * `Angilal` (каноник `type`)-аар бүс шүүх. Унтраасан ангилал газрын зурагт
 * бүдгэрч, эрэмбээс хасагдана. Хассан ангилал (ногоон/одоо байгаа) ч энд гарна —
 * тэдгээрийг унтраавал газрын зургаас далдлана.
 */
function ZoneCatFilter({ cats, off, setOff }: {
  cats: { type: string; count: number; color: string }[];
  off: Set<string>;
  setOff: (s: Set<string>) => void;
}) {
  const toggle = (type: string) => {
    const n = new Set(off);
    if (n.has(type)) n.delete(type); else n.add(type);
    setOff(n);
  };
  const allOn = off.size === 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span className={`${s.muted} ${s.xsmall}`}>{cats.length} ангилал</span>
        <button
          type="button"
          className={s.mini}
          onClick={() => setOff(allOn ? new Set(cats.map((c) => c.type)) : new Set())}
        >
          {allOn ? 'Бүгдийг унтраах' : 'Бүгдийг асаах'}
        </button>
      </div>
      {cats.map((c) => {
        const on = !off.has(c.type);
        return (
          <button
            key={c.type}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(c.type)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)',
              background: on ? 'var(--panel-2)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--muted)', textAlign: 'left',
              transition: 'background .12s, opacity .12s',
            }}
          >
            <span style={{ width: 11, height: 11, borderRadius: 3, flex: 'none', background: c.color, opacity: on ? 1 : 0.35 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.type}</span>
            <b style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--muted)' }}>{c.count}</b>
            <span style={{ width: 14, textAlign: 'center', color: 'var(--accent)', fontSize: 12 }}>{on ? '✓' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════ Доод хүрээ: оноон тархалт ══════════════════ */

/**
 * ⚠️ Хот төлөвлөлт ба эдийн засгийн НИЙЛМЭЛ оноогоор — газрын зургийн будалт,
 * эрэмбэтэй ижил тэнхлэг. Хуваарилалт (econShare) өөрчлөгдөхөд шинэчлэгдэнэ.
 */
function SuitFooter({ rows, econShare }: { rows: Row[]; econShare: number }) {
  const scores = rows.map((r) => blendScore(r, econShare)).filter((x): x is number => x != null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const counts = SCORE_LEVELS.map((L, i) => ({
    L, n: rows.filter((r) => levelOf(blendScore(r, econShare)) === i).length,
  }));

  return (
    <footer className={s.appFoot}>
      <div className={s.footScore}>
        <b style={{ color: scoreColor(avg) }}>{avg == null ? '—' : Math.round(avg)}</b>
        <span>{rows.length} бүсийн дундаж · {scoreLabel(avg)}</span>
      </div>
      <div className={s.footLevels}>
        {counts.map(({ L, n }) => (
          <div key={L.label}>
            <i style={{ background: L.color }} />
            <span>{L.label}</span>
            <b>{n}</b>
          </div>
        ))}
      </div>
    </footer>
  );
}
