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
import {
  urbanScore, scoreColor, scoreLabel, passesNorm,
} from '@/lib/analysis/score';
import type { Dim } from '@/components/MapCanvas';
import { SuitMap, type MapRow } from './SuitMap';
import { SuitDetail } from './SuitDetail';
import { nf, esc } from './suit/format';
import { valueOf, blendScore, type Mode, type Row } from './suit/model';
import { Shell, Card } from './suit/Layout';
import { LayerToggles } from './suit/LayerToggles';
import { BlendCard } from './suit/BlendCard';
import { CategoryPie, IndicatorPicker, Weights, Parking } from './suit/Urban';
import { EconSummary, EconTune } from './suit/Economics';
import { Ranking } from './suit/Ranking';
import s from './suitability.module.css';

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
  // ⚠️ Нээгдэх горим = НИЙЛМЭЛ үнэлгээ (хот төлөвлөлт + эдийн засаг)
  const [mode, setMode] = useState<Mode>('blend');
  /** Нийлмэл оноонд ЭДИЙН ЗАСГИЙН эзлэх хувь (үлдсэнийг хот төлөвлөлт авна) */
  const [econShare, setEconShare] = useState(DEFAULT_ECON_SHARE);
  const [indicators, setIndicators] = useState<Indicator[]>(() => INDICATORS.map((i) => ({ ...i })));
  const [activeIndicator, setActiveIndicator] = useState(INDICATORS[0].id);
  const [catFilter, setCatFilter] = useState<CategoryKey | null>(null);
  const [parking, setParking] = useState<ParkingOpt>({ ...PARKING });
  const [greenCats] = useState<Set<string>>(() => defaultGreenCats());
  const [selected, setSelected] = useState<string | null>(null);
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

  const ind = indicators.find((i) => i.id === activeIndicator) ?? indicators[0];
  const totalW = indicators.reduce((a, i) => a + i.weight, 0) || 1;

  /** Барилгын давамгайлах нэгж үнэ — гулсуурын анхны утга */
  const basePrice = useMemo(() => {
    const area = rows.reduce((a, r) => a + r.gfaSaleM2, 0);
    const value = rows.reduce((a, r) => a + r.salesValue, 0);
    return area > 0 ? value / area : 0;
  }, [rows]);

  const colorOf = useCallback(
    (r: MapRow) => scoreColor(valueOf(r as Row, mode, ind, econShare)),
    [mode, ind, econShare],
  );
  const shownAll = useCallback(() => true, []);

  /* ── Hover панелийн HTML (эх аппын адил мөрөөр) ── */
  const zoneTip = useCallback((r: MapRow) => {
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
      <div class="sub2">${esc(row.type)} · ${nf(row.polyHa, 2)} га · ${scoreLabel(score)}</div>
      <dl>
        ${dt('Оршин суугч', nf(row.residentPop))}
        ${dt('Өрх', nf(row.households))}
        ${dt('Барилга', nf(row.buildingCount))}
        ${dt('Норм хангасан', `<b style="color:${pass === total ? '#4ade80' : '#f87171'}">${pass} / ${total}</b>`)}
      </dl>
      ${failed.length ? `<div class="fails">${failed.map((f) =>
        `<div><span>✗ ${esc(f.name)}</span><em>${f.v}</em></div>`).join('')}</div>` : ''}`;
  }, [mode, ind, indicators, econShare]);

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
            <h1>Сэлбэ — Suitability Modeler</h1>
            <p>Хот төлөвлөлтийн үзүүлэлт + Санхүүгийн дүн шинжилгээ</p>
          </div>
        </div>
        <nav className={s.tabs}>
          {([
            ['blend', 'Ерөнхий'],
            ['urban', 'Хот төлөвлөлт'],
            ['indicator', 'Үзүүлэлт'],
            ['econ', 'Эдийн засаг'],
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
            {/* Нэмэлт давхарга — оноон будалт дээр контекст нэмнэ */}
            <Card id="layersCard" title="Давхарга нэмэх" collapsible startOff>
              <LayerToggles layerOn={layerOn} setLayerOn={setLayerOn} />
            </Card>

            {mode === 'indicator' && (
              <Card title="Хот төлөвлөлтийн тооцоолол">
                <CategoryPie
                  rows={rows}
                  indicators={indicators}
                  totalW={totalW}
                  filter={catFilter}
                  setFilter={setCatFilter}
                />
                <IndicatorPicker
                  rows={rows}
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
                <EconSummary rows={rows} costs={costs} perHa={perHa} buildCost={buildCost} />
              </Card>
            )}

            <Card
              title={mode === 'econ' ? 'Бүсийн эрэмбэ «Ашигт байдал»'
                : mode === 'indicator' ? `Бүсийн эрэмбэ «${ind.short}»`
                  : mode === 'blend' ? 'Бүсийн эрэмбэ «Нийлмэл»'
                    : 'Бүсийн эрэмбэ'}
              pill={`${rows.length} бүс`}
              grow
            >
              <Ranking
                rows={rows}
                mode={mode}
                ind={ind}
                econShare={econShare}
                selected={selected}
                onSelect={setSelected}
              />
            </Card>
          </>
        }
        map={
          <>
            <SuitMap
              dim={dim}
              rows={rows}
              colorOf={colorOf}
              shown={shownAll}
              selected={selected}
              onSelect={setSelected}
              layerOn={layerOn}
              zoneTip={zoneTip}
              buildingTip={buildingTip}
            />

            {/* 2D / 3D / BIM солих — газрын зураг дээр давхарлав.
                ⚠️ ArcGIS-ийн удирдлага (zoom, home) баруун ДЭЭД, масштаб баруун
                ДООД, дэлгэрэнгүй карт зүүн ДЭЭД буланд байдаг тул зүүн ДООД
                буланд байрлуулж мөргөлдөөнгүй болгов. */}
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
            {/* ⚠️ Нийлмэл горимд ЗӨВХӨН хуваарилалтын карт: хот төлөвлөлт болон
                эдийн засгийн нарийн тохиргоо нь тухайн табыг сонгоход нэмэгдэнэ. */}
            {mode === 'blend' && (
              <BlendCard
                rows={rows}
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
                rows={rows}
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
                <Parking rows={rows} parking={parking} setParking={setParking} indicators={indicators} />
              </Card>
            )}
          </>
        }
      />

      {/* Доод хүрээ — оноон түвшний тархалт (газрын зургийг тойрсон бүтэц) */}
      <SuitFooter rows={rows} econShare={econShare} />
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
