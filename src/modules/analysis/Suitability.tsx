'use client';

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react';
import * as projection from '@arcgis/core/geometry/projection';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import type Polygon from '@arcgis/core/geometry/Polygon';

import {
  INDICATORS, SCORE_LEVELS, PARKING, PARKING_SOURCES, DENSITY_BY_TYPE,
  MAP_LAYERS, MAP_GROUPS, COST_GROUPS, CATEGORIES, NO_DATA_COLOR, levelOf,
  BUILD_COST_PER_M2, DEFAULT_ECON_SHARE, PROJECT_AREA_HA,
  profitScore, profitLabel,
  type Indicator, type ParkingOpt, type ParkingSource, type CategoryKey,
} from '@/lib/analysis/config';
import {
  loadAnalysisCached, computeEconomics, computeRaw, defaultGreenCats,
  type AnalysisData,
} from '@/lib/analysis/data';
import { loadCosts, type Costs } from '@/lib/analysis/costs';
import {
  urbanScore, scoreColor, scoreLabel, scoreIndicator, normFor, normText, passesNorm, clamp,
  type Part,
} from '@/lib/analysis/score';
import type { Dim } from '@/components/MapCanvas';
import { SuitMap, type MapRow } from './SuitMap';
import { SuitDetail } from './SuitDetail';
import s from './suitability.module.css';

/* ══════════════════ Форматлагчид (эх аппын адил) ══════════════════ */

const nf = (v: number | null | undefined, d = 0) =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('mn-MN', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Нэгж үнэ — товчлолгүй, бүтэн тоогоор (2,500,000,000 ₮) */
const unitMoney = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${nf(v)} ₮`;

/** Мөнгөн дүнг уншихад ойлгомжтой нэгжээр */
function money(v: number | null | undefined, d = 1) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v), sign = v < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}${nf(a / 1e9, d)} тэрбум₮`;
  if (a >= 1e6) return `${sign}${nf(a / 1e6, d)} сая₮`;
  if (a >= 1e3) return `${sign}${nf(a / 1e3, 0)} мянга₮`;
  return `${sign}${nf(a, 0)}₮`;
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Нормын шаардлагыг нэг мөрөнд — FAR/BCR нь бүсийн төрлөөр өөр */
function normLine(ind: Indicator): string {
  if (ind.byType) {
    const vals = Object.values(DENSITY_BY_TYPE).map((v) => v[ind.byType!]);
    const u = ind.unit ? ` ${ind.unit}` : '';
    return `бүсийн төрлөөр ≤ ${nf(Math.min(...vals), ind.decimals)} … ${nf(Math.max(...vals), ind.decimals)}${u}`;
  }
  return normText(ind, nf);
}

/**
 * ⚠️ `blend` нь НИЙЛМЭЛ үнэлгээ бөгөөд аппын НЭЭГДЭХ горим: хот төлөвлөлт ба
 * эдийн засаг хоёрын аль нэгийг дангаар нь харах нь дүгнэлтийг тал болгодог.
 * Тухайн талын дэлгэрэнгүй карт (жин, зогсоол / өртөг, гулсуур) нь ЗӨВХӨН тэр
 * табыг сонгоход нэмэгдэнэ.
 */
type Mode = 'blend' | 'urban' | 'indicator' | 'econ';
type Row = MapRow & { parts: Record<string, Part> };

/**
 * Эдийн засгийн оноо — АШГИЙН МАРЖААР.
 * Тэнцүү (0%) = Дунд · алдагдалтай = Муу · өндөр алдагдалтай = Маш муу ·
 * ашигтай = Сайн · өндөр ашигтай = Маш сайн.
 */
const econScore = (r: Row) => profitScore(r.econ?.margin);

/**
 * Нийлмэл оноо — хот төлөвлөлт × (100−e)% + эдийн засаг × e%.
 * ⚠️ Аль нэг нь өгөгдөлгүй бол нөгөөг нь БҮТНЭЭР авна: `?? 0` хийвэл мэдээлэл
 * дутуу бүс автоматаар хагас оноотой болж, «муу» мэт харагдана.
 */
function blendScore(r: Row, econShare: number): number | null {
  const u = r.urban;
  const e = econScore(r);
  if (u == null && e == null) return null;
  if (u == null) return e;
  if (e == null) return u;
  return u * (1 - econShare / 100) + e * (econShare / 100);
}

const valueOf = (r: Row, mode: Mode, ind: Indicator, econShare: number): number | null =>
  mode === 'blend' ? blendScore(r, econShare)
    : mode === 'urban' ? r.urban
      : mode === 'econ' ? econScore(r)
        : scoreIndicator(r.raw[ind.id] ?? null, normFor(ind, r.type));

/* ══════════════════ Хадгалагддаг төлөв ══════════════════ */

const COLLAPSE_KEY = 'selbe.collapsed';
const PANEL_KEY = 'selbe.panels';

const readSet = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]') as string[]); }
  catch { return new Set(); }
};

/* ══════════════════ Үндсэн компонент ══════════════════ */

export function Suitability({ dim }: { dim: Dim }) {
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
    </div>
  );
}

/* ══════════════════ Бүрхүүл + чирж өргөсгөх ══════════════════ */

const PANEL_MIN = 220, PANEL_MAX = 620;
const DEFAULTS = { '--left-w': '330px', '--right-w': '330px' } as const;

function Shell({ left, map, right }: { left: ReactNode; map: ReactNode; right: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  // Хадгалсан өргөнийг сэргээх
  useEffect(() => {
    if (!shell.current) return;
    try {
      const saved = JSON.parse(localStorage.getItem(PANEL_KEY) || '{}') as Record<string, string>;
      for (const [k, v] of Object.entries(saved)) shell.current.style.setProperty(k, v);
    } catch { /* хадгалсан утга гэмтсэн бол анхныг нь ашиглана */ }
  }, []);

  const save = () => {
    if (!shell.current) return;
    const o: Record<string, string> = {};
    for (const k of Object.keys(DEFAULTS)) {
      const v = shell.current.style.getPropertyValue(k);
      if (v) o[k] = v;
    }
    try { localStorage.setItem(PANEL_KEY, JSON.stringify(o)); } catch { /* private mode */ }
  };

  const start = (cssVar: string, side: 'left' | 'right') => (e: ReactPointerEvent<HTMLDivElement>) => {
    const host = shell.current;
    if (!host) return;
    e.preventDefault();
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    setDragging(cssVar);

    const startX = e.clientX;
    const startW = parseFloat(getComputedStyle(host).getPropertyValue(cssVar))
      || parseFloat(DEFAULTS[cssVar as keyof typeof DEFAULTS]);

    // зүүн талбар: баруун тийш чирвэл өргөсөх; баруун талбар: эсрэгээр
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) * (side === 'left' ? 1 : -1);
      host.style.setProperty(cssVar, `${Math.round(clamp(startW + dx, PANEL_MIN, PANEL_MAX))}px`);
    };
    const up = () => {
      setDragging(null);
      bar.releasePointerCapture(e.pointerId);
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      save();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  };

  const reset = (cssVar: string) => () => {
    shell.current?.style.setProperty(cssVar, DEFAULTS[cssVar as keyof typeof DEFAULTS]);
    save();
  };

  return (
    <main ref={shell} className={s.shell}>
      <aside className={`${s.panel} ${s.left}`}>{left}</aside>
      <div
        className={`${s.resizer} ${dragging === '--left-w' ? s.resizerActive : ''}`}
        title="Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана"
        onPointerDown={start('--left-w', 'left')}
        onDoubleClick={reset('--left-w')}
      />
      {/* ⚠️ Чирэх үед зураг заагчийг барихгүй — эс бөгөөс ArcGIS чирэлтийг таслана.
          `position: relative` нь дэлгэрэнгүй картын байрлуулах эцэг. */}
      <div
        className={dragging ? s.noPointer : undefined}
        style={{ position: 'relative', minWidth: 0, minHeight: 0 }}
      >
        {map}
      </div>
      <div
        className={`${s.resizer} ${dragging === '--right-w' ? s.resizerActive : ''}`}
        title="Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана"
        onPointerDown={start('--right-w', 'right')}
        onDoubleClick={reset('--right-w')}
      />
      <aside className={`${s.panel} ${s.right}`}>{right}</aside>
    </main>
  );
}

/* ══════════════════ Карт (хураадаг) ══════════════════ */

function Card({
  title, children, pill, action, collapsible, grow, id, startOff,
}: {
  title: string;
  children: ReactNode;
  pill?: string;
  action?: ReactNode;
  collapsible?: boolean;
  grow?: boolean;
  id?: string;
  /** Анхнаасаа хураагдсан байх эсэх (хадгалсан сонголт үүнийг дарна) */
  startOff?: boolean;
}) {
  const key = id ?? title;
  const [off, setOff] = useState(!!startOff);

  // ⚠️ Зөвхөн эффект дотор: localStorage нь статик экспортын үед байхгүй.
  //    Хадгалсан жагсаалт байхгүй бол `startOff` хэвээр үлдэнэ.
  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === null) return;
    setOff(readSet().has(key));
  }, [key]);

  const toggle = () => {
    const next = !off;
    setOff(next);
    const set = readSet();
    if (next) set.add(key); else set.delete(key);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* private mode */ }
  };

  return (
    <section className={`${s.card} ${grow ? s.grow : ''} ${collapsible ? s.collapsible : ''} ${off ? s.collapsed : ''}`}>
      <h2 onClick={collapsible ? toggle : undefined}>
        {title}
        {pill && <span className={s.pill}>{pill}</span>}
        {action}
        {collapsible && <span className={s.caret}>▼</span>}
      </h2>
      <div className={s.body}>{children}</div>
    </section>
  );
}

/* ══════════════════ Давхаргын чагтууд ══════════════════ */

/**
 * Контекст давхаргыг оноон будалт дээр НЭМЖ харуулах.
 *
 * ⚠️ Бүсийн будалт нь ЭНЭ модулийн гол мессеж тул давхаргууд түүнийг дардаггүй
 * байх ёстой: барилга 0.30 тунгалаг, шугамууд нимгэн (0.75 px).
 */
function LayerToggles({
  layerOn, setLayerOn,
}: {
  layerOn: Record<string, boolean>;
  setLayerOn: (v: Record<string, boolean>) => void;
}) {
  const groups = Object.keys(MAP_GROUPS)
    .map((key) => ({ key, label: MAP_GROUPS[key], items: MAP_LAYERS.filter((l) => l.group === key) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className={s.toggles}>
      {groups.map((g) => {
        const on = g.items.filter((l) => layerOn[l.key]).length;
        const allOff = on === 0;
        return (
          <div key={g.key}>
            <button
              type="button"
              className={s.lyrGrp}
              title={allOff ? 'Бүгдийг асаах' : 'Бүгдийг унтраах'}
              onClick={() => {
                const next = { ...layerOn };
                for (const l of g.items) next[l.key] = allOff;
                setLayerOn(next);
              }}
            >
              <span>{g.label}</span>
              <b>{on}/{g.items.length}</b>
            </button>

            {g.items.map((l) => (
              <label key={l.key} className={s.chk}>
                <input
                  type="checkbox"
                  checked={!!layerOn[l.key]}
                  onChange={() => setLayerOn({ ...layerOn, [l.key]: !layerOn[l.key] })}
                />
                <span
                  className={l.kind === 'line' ? 'swatch' : 'dot'}
                  style={{ background: `rgb(${l.color.join(',')})` }}
                />
                <span>{l.title}</span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════ Нийлмэл үнэлгээ ══════════════════ */

/**
 * ХОТ ТӨЛӨВЛӨЛТ ↔ ЭДИЙН ЗАСГИЙН хуваарилалт.
 *
 * ⚠️ Аппын НЭЭГДЭХ карт. Хоёр талын аль нэгийг дангаар нь харах нь дүгнэлтийг
 * тал болгодог: хамгийн ашигтай бүс нь хамгийн муу төлөвлөгдсөн байж болно.
 * Гулсуур нь 0 (зөвхөн хот төлөвлөлт) → 100 (зөвхөн эдийн засаг).
 */
function BlendCard({
  rows, econShare, setEconShare, onPick,
}: {
  rows: Row[];
  econShare: number;
  setEconShare: (v: number) => void;
  onPick: (m: Mode) => void;
}) {
  const avg = (f: (r: Row) => number | null) => {
    const v = rows.map(f).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const urban = avg((r) => r.urban);
  const econ = avg((r) => econScore(r));
  const blend = avg((r) => blendScore(r, econShare));

  const levels = SCORE_LEVELS.map((L, i) => ({
    L, n: rows.filter((r) => levelOf(blendScore(r, econShare)) === i).length,
  }));

  return (
    <section className={s.card}>
      <h2>Нийлмэл үнэлгээ</h2>

      <div className={s.blendLabels}>
        <span className={s.bUrban}>Хот төлөвлөлт <b>{100 - econShare}%</b></span>
        <span className={s.bFin}><b>{econShare}%</b> Эдийн засаг</span>
      </div>
      <input
        type="range"
        className={s.blendRange}
        min={0} max={100} step={5}
        value={econShare}
        aria-label="Хот төлөвлөлт ↔ эдийн засгийн хуваарилалт"
        onChange={(e) => setEconShare(Number(e.target.value))}
      />

      <div className={s.blendScores}>
        <button type="button" className={s.blendScore} onClick={() => onPick('urban')}>
          <span>Хот төлөвлөлт</span>
          <b style={{ color: scoreColor(urban) }}>{urban == null ? '—' : Math.round(urban)}</b>
        </button>
        <button type="button" className={s.blendScore} onClick={() => onPick('econ')}>
          <span>Эдийн засаг</span>
          <b style={{ color: scoreColor(econ) }}>{econ == null ? '—' : Math.round(econ)}</b>
        </button>
      </div>

      <div className={s.parkHead}>
        <div className={s.parkPct} style={{ color: scoreColor(blend) }}>
          {blend == null ? '—' : Math.round(blend)}
        </div>
        <div className={s.parkHeadTxt}>
          <b>{rows.length} бүсийн дундаж</b>
          <span>{scoreLabel(blend)} · газрын зураг, эрэмбэ энэ оноогоор</span>
        </div>
      </div>

      <div className={s.subLabel}>Түвшний тархалт</div>
      <div className={s.finSummary}>
        {levels.map(({ L, n }) => (
          <div key={L.label}>
            <span>{L.label}</span>
            <b style={{ color: L.color }}>{n}</b>
          </div>
        ))}
      </div>

      <p className={s.wSrc} style={{ marginTop: 10 }}>
        Дээд табаас «Хот төлөвлөлт» эсвэл «Эдийн засаг»-ийг сонгоход тухайн
        талын дэлгэрэнгүй тохиргоо (жин, босго, өртгийн гулсуур) нэмэгдэнэ.
      </p>
    </section>
  );
}

/* ══════════════════ Үндсэн 3 төрлийн дугуй диаграм ══════════════════ */

/**
 * Хот төлөвлөлтийн үзүүлэлтүүд 3 үндсэн төрөлд бүлэглэгдэнэ. Диаграм нь
 * тэдгээрийн ЖИНГИЙН эзлэх хувийг харуулж, тайлбарт нь тухайн төрлийн дундаж
 * ОНОО гарна.
 *
 * ⚠️ SVG дугуйг `stroke-dasharray`-аар зурна — олон `<path>` үүсгэхээс хямд
 * бөгөөд өнцөг тооцох тригонометр шаардахгүй.
 */
function CategoryPie({
  rows, indicators, totalW, filter, setFilter,
}: {
  rows: Row[];
  indicators: Indicator[];
  totalW: number;
  filter: CategoryKey | null;
  setFilter: (c: CategoryKey | null) => void;
}) {
  const size = 116, width = 20;
  const r = (size - width) / 2;
  const circ = 2 * Math.PI * r;

  const cats = CATEGORIES.map((c) => {
    const mine = indicators.filter((i) => i.cat === c.key);
    const weight = mine.reduce((a, i) => a + i.weight, 0);
    // Тухайн төрлийн дундаж оноо — бүх бүс, бүх гишүүн үзүүлэлтээр жигнэсэн
    let sum = 0, wsum = 0;
    for (const row of rows) {
      for (const i of mine) {
        const p = row.parts[i.id];
        if (p?.score == null || i.weight <= 0) continue;
        sum += p.score * i.weight;
        wsum += i.weight;
      }
    }
    return { ...c, weight, share: (weight / totalW) * 100, score: wsum ? sum / wsum : null };
  });

  let acc = 0;
  const slices = cats.map((c) => {
    const frac = totalW > 0 ? c.weight / totalW : 0;
    const offset = acc;
    acc += frac;
    return { ...c, frac, offset };
  });

  return (
    <div className={s.pieWrap}>
      <svg className={s.pie} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* −90° эргүүлж 12 цагаас эхлүүлнэ */}
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#101720" strokeWidth={width} />
          {slices.map((sl) => (
            <circle
              key={sl.key}
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke={sl.color}
              strokeWidth={filter === sl.key ? width + 4 : width}
              strokeOpacity={filter && filter !== sl.key ? 0.3 : 1}
              strokeDasharray={`${sl.frac * circ} ${circ}`}
              strokeDashoffset={-sl.offset * circ}
            >
              <title>{`${sl.label}: ${sl.share.toFixed(0)}%`}</title>
            </circle>
          ))}
        </g>
      </svg>

      <div className={s.pieLegend}>
        {cats.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`${s.pieItem} ${filter === c.key ? s.pieOn : ''}`}
            title={`${c.label} — дарж шүүнэ`}
            onClick={() => setFilter(filter === c.key ? null : c.key)}
          >
            <i style={{ background: c.color }} />
            <span>{c.short}</span>
            <b style={{ color: scoreColor(c.score) }}>{c.score == null ? '—' : Math.round(c.score)}</b>
            <em>{c.share.toFixed(0)}%</em>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════ Үзүүлэлт сонгох ══════════════════ */

function IndicatorPicker({
  rows, indicators, active, setActive, totalW, filter,
}: {
  rows: Row[];
  indicators: Indicator[];
  active: string;
  setActive: (id: string) => void;
  totalW: number;
  /** Дугуй диаграмаас сонгосон төрөл — `null` бол бүгд */
  filter: CategoryKey | null;
}) {
  const ind = indicators.find((i) => i.id === active) ?? indicators[0];
  const groups = CATEGORIES
    .filter((c) => !filter || c.key === filter)
    .map((c) => ({ c, items: indicators.filter((i) => i.cat === c.key) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <div className={s.indHead} style={{ marginTop: 10 }}>
        <span>Үзүүлэлт</span><span>Жин</span><span>Норм хангасан</span><span />
      </div>

      {groups.map(({ c, items }) => (
        <div key={c.key}>
          <div className={s.subLabel} style={{ color: c.color }}>{c.label}</div>
          <div className={s.indList}>
            {items.map((i) => {
              let pass = 0, total = 0;
              for (const r of rows) {
                const p = r.parts[i.id];
                if (!p || p.value == null) continue;
                total++;
                // ⚠️ «Норм хангасан» гэдэг нь ЯГ 100 оноо — хөвөгч тооны
                //    нарийвчлалыг бодож 99.9-ээр шалгана
                if ((p.score ?? 0) >= 99.9) pass++;
              }
              const pct = total ? (pass / total) * 100 : 0;
              return (
                <button
                  key={i.id}
                  type="button"
                  className={`${s.ind} ${i.id === active ? s.indOn : ''}`}
                  title={i.name}
                  onClick={() => setActive(i.id)}
                >
                  <span className="nm">{i.short}</span>
                  <span className="wt">{((i.weight / totalW) * 100).toFixed(0)}%</span>
                  <span className="cnt">{total ? `${pass}/${total}` : '—'}</span>
                  <span className="bar"><i style={{ width: `${pct}%`, background: scoreColor(pct) }} /></span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className={s.indNote}>
        <div className={s.wReq}>
          <b>Норм:</b> {normLine(ind)}
          <span className="wt">жин {((ind.weight / totalW) * 100).toFixed(0)}%</span>
        </div>
        <div className={s.wSrc}>{ind.norm}</div>
      </div>
    </>
  );
}

/* ══════════════════ Жингийн тохиргоо ══════════════════ */

function Weights({
  indicators, setIndicators, totalW,
}: {
  indicators: Indicator[];
  setIndicators: (v: Indicator[]) => void;
  totalW: number;
}) {
  const patch = (id: string, key: keyof Indicator, value: number) =>
    setIndicators(indicators.map((i) => (i.id === id ? { ...i, [key]: value } : i)));

  return (
    <div>
      {indicators.map((i) => {
        // Босго засварлах талбарууд — горимоос хамаарч өөр
        const fields: [keyof Indicator, string][] = i.mode === 'band'
          ? [['optMin', 'Нормын доод'], ['optMax', 'Нормын дээд'], ['hardMin', '0 оноо (доош)'], ['hardMax', '0 оноо (дээш)']]
          : i.mode === 'higher'
            ? [['target', 'Нормын доод'], ['hardMin', '0 оноо']]
            : [['best', 'Нормын дээд'], ['hardMax', '0 оноо']];

        return (
          <div key={i.id} className={s.wRow} style={{ opacity: i.weight === 0 ? 0.45 : 1 }}>
            <div className={s.wTop}>
              <span className="nm">{i.name}</span>
              <span className="pct">{((i.weight / totalW) * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range" className={s.wSlider} min={0} max={40} step={1}
              value={i.weight}
              aria-label={`${i.name} — жин`}
              onChange={(e) => patch(i.id, 'weight', Number(e.target.value))}
            />
            <div className={s.wReq}><b>Норм:</b> {normLine(i)}</div>
            <div className={s.wSrc}>{i.norm}</div>

            {i.byType ? (
              // FAR / BCR — бүсийн төрөл бүрд өөр дээд хязгаартай тул хүснэгтээр
              <div className={s.wTypes}>
                {Object.entries(DENSITY_BY_TYPE).map(([t, v]) => (
                  <div key={t}>
                    <span>{t}</span>
                    <b>≤ {nf(v[i.byType!], i.decimals)}{i.unit ? ` ${i.unit}` : ''}</b>
                  </div>
                ))}
              </div>
            ) : (
              <div className={s.wThr}>
                {fields.map(([key, label]) => (
                  <label key={String(key)}>
                    <span>{label}</span>
                    <input
                      type="number" step="any"
                      defaultValue={i[key] as number}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) patch(i.id, key, v);
                      }}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════ Зогсоол ══════════════════ */

function Parking({
  rows, parking, setParking, indicators,
}: {
  rows: Row[];
  parking: ParkingOpt;
  setParking: (p: ParkingOpt) => void;
  indicators: Indicator[];
}) {
  const supply = rows.reduce((a, r) => a + r.parkingSupply, 0);
  const need = rows.reduce((a, r) => a + (r.parkingNeed ?? 0), 0);
  const il = rows.reduce((a, r) => a + r.etIl, 0);
  const dald = rows.reduce((a, r) => a + r.etDald, 0);
  const gap = supply - need;
  const withNeed = rows.filter((r) => r.parkingGap != null);
  const short = withNeed.filter((r) => (r.parkingGap ?? 0) < 0).length;
  const pct = need > 0 ? (supply / need) * 100 : null;

  // Хангалтын өнгө нь газрын зураг, оноололтой ижил шатлалаас гарна
  const parkInd = indicators.find((i) => i.id === 'parking')!;
  const col = scoreColor(scoreIndicator(pct, parkInd));

  const hh = rows.reduce((a, r) => a + r.households, 0);
  const pop = rows.reduce((a, r) => a + r.population, 0);
  const formula = parking.source === 'households'
    ? `${nf(hh)} өрх × ${parking.perHousehold.toFixed(2)} зогсоол = <b>${nf(hh * parking.perHousehold)}</b>`
    : parking.source === 'population'
      ? `${nf(pop)} хүн × ${parking.per1000} ÷ 1000 = <b>${nf((pop * parking.per1000) / 1000)}</b>`
      : 'Эх өгөгдлийн <b>NORM_ZOGS</b> талбарын нийлбэр';

  return (
    <>
      <p className={`${s.muted} ${s.small}`}>
        <b>Байгаа зогсоол</b> = ил + далд (ET_NIIT) — өгөгдлөөс шууд.
        <b> Шаардлагатай зогсоол</b>-ыг доорх 3 аргын аль нэгээр бодож, хоёрыг нь харьцуулна.
      </p>

      <div className={s.subLabel}>Хэрэгцээг юугаар бодох вэ?</div>
      <div className={s.toggles}>
        {PARKING_SOURCES.map((src) => (
          <label key={src.key} className={s.chk}>
            <input
              type="radio" name="parkSrc"
              checked={parking.source === src.key}
              onChange={() => setParking({ ...parking, source: src.key as ParkingSource })}
            />
            <span>{src.label}</span>
          </label>
        ))}
      </div>

      {parking.source !== 'norm' && (
        <div className={s.sliderRow}>
          <label>
            <span>{parking.source === 'households' ? 'Нэг өрхөд ногдох зогсоол' : '1000 хүнд ногдох зогсоол'}</span>
            <span className="val">
              {parking.source === 'households' ? parking.perHousehold.toFixed(2) : parking.per1000}
            </span>
          </label>
          <input
            type="range"
            min={parking.source === 'households' ? 0.2 : 50}
            max={parking.source === 'households' ? 2 : 600}
            step={parking.source === 'households' ? 0.05 : 10}
            value={parking.source === 'households' ? parking.perHousehold : parking.per1000}
            aria-label="Зогсоолын коэффициент"
            onChange={(e) => setParking(parking.source === 'households'
              ? { ...parking, perHousehold: Number(e.target.value) }
              : { ...parking, per1000: Number(e.target.value) })}
          />
        </div>
      )}

      <div className={s.parkHead}>
        <div className={s.parkPct} style={{ color: col }}>
          {pct == null ? '—' : Math.round(pct)}<i>%</i>
        </div>
        <div className={s.parkHeadTxt}>
          <b>Хэрэгцээний хангалт</b>
          <span>Байгаа <b>{nf(supply)}</b> · шаардлагатай <b>{nf(need)}</b> зогсоол</span>
        </div>
      </div>

      <div className={s.parkBar} title="Байгаа зогсоол нь хэрэгцээний хэдэн хувийг хангаж байна">
        <span style={{ width: `${pct == null ? 0 : clamp(pct, 0, 100)}%`, background: col }} />
      </div>
      <div className={s.parkScale}><span>0%</span><span>Норм 100%</span></div>

      <div className={s.parkFormula}>
        Хэрэгцээ: <span dangerouslySetInnerHTML={{ __html: formula }} />
      </div>

      <div className={s.finSummary}>
        <div><span>Байгаа — ил / далд</span><b>{nf(il)} / {nf(dald)}</b></div>
        <div>
          <span>{gap >= 0 ? 'Илүүдэл' : 'Дутагдал'}</span>
          <b className={gap >= 0 ? s.pos : s.neg}>{gap >= 0 ? '+' : '−'}{nf(Math.abs(gap))}</b>
        </div>
        <div><span>Дутагдалтай бүс</span><b className={short ? s.neg : s.pos}>{short} / {withNeed.length}</b></div>
        <div><span>Хангалттай бүс</span><b className={s.pos}>{withNeed.length - short} / {withNeed.length}</b></div>
      </div>
    </>
  );
}

/* ══════════════════ Эдийн засаг — зүүн карт ══════════════════ */

function EconSummary({
  rows, costs, perHa, buildCost,
}: {
  rows: Row[];
  costs: Costs;
  perHa: number;
  buildCost: number;
}) {
  const revenue = rows.reduce((a, r) => a + (r.econ?.revenue ?? 0), 0);
  const revenueRes = rows.reduce((a, r) => a + (r.econ?.revenueRes ?? 0), 0);
  const zoneInfra = rows.reduce((a, r) => a + (r.econ?.infraCost ?? 0), 0);
  const zoneBuild = rows.reduce((a, r) => a + (r.econ?.buildCost ?? 0), 0);
  const zoneCost = zoneInfra + zoneBuild;
  const zoneArea = rows.reduce((a, r) => a + r.areaHa, 0);
  const profit = revenue - zoneCost;
  const share = revenue > 0 ? (zoneCost / revenue) * 100 : null;
  /**
   * ⚠️ «1 га-д зарцуулах төсөв» нь ДЭД БҮТЭЦ + БАРИЛГА хоёуланг агуулна.
   * Дэд бүтцийг төслийн 156 га-д, барилгыг бүсүүдийн талбайд хуваадаг тул
   * нийлбэрийг бүсүүдийн нийт талбайд хуваан ганц үзүүлэлт болгоно.
   */
  const spendPerHa = zoneArea > 0 ? zoneCost / zoneArea : 0;
  /** Зурвасуудын НЭГДСЭН хэмжээс — гурвыг харьцуулах боломжтой байлгана */
  const meterMax = Math.max(zoneCost, revenue, 1);
  /** Ашгийн маржа — ЭДИЙН ЗАСГИЙН ОНОО үүн дээр тогтоно */
  const margin = revenue > 0 ? (profit / revenue) * 100 : (zoneCost > 0 ? -Infinity : null);
  const col = scoreColor(profitScore(margin));

  const sorted = [...costs.layers].sort((a, b) => b.total - a.total);
  const max = sorted[0]?.total || 1;

  const byGroup: Record<string, number> = {};
  for (const l of costs.layers) byGroup[l.group] = (byGroup[l.group] ?? 0) + l.total;

  return (
    <>
      <div className={s.econHead}>
        <div className={s.econBig}>
          <span>Нийт зарцуулах төсөв</span>
          <b>{money(zoneCost)}</b>
        </div>
        <div className={s.econBig}>
          <span>1 га-д зарцуулах төсөв</span>
          <b>{money(spendPerHa)}<i> / га</i></b>
        </div>
      </div>
      <p className={`${s.muted} ${s.xsmall}`}>
        Зарцуулах төсөв = <b>дэд бүтэц</b> ({costs.layers.length} үйлчилгээ,{' '}
        {money(costs.total)} → {money(perHa)}/га × бүсийн талбай) +{' '}
        <b>барилга угсралт</b> (<b>Барилгын_нийт_талбай_m2</b> ×{' '}
        {money(buildCost, 2)}/м², «Одоо байгаа» хасагдсан).<br />
        Дэд бүтцийг төслийн <b>{nf(costs.projectHa)} га</b>-д хуваасан.
      </p>

      {/**
        * ГУРВАН ГОЛ ҮЗҮҮЛЭЛТ — индикатор хэлбэрээр.
        *
        * ⚠️ Зурвасууд БҮГД нэг хэмжээст (max(зардал, орлого)) тул урт нь
        * харьцуулах утгатай. Тус тусдаа 100%-д нормчилвол «зардал = орлого»
        * мэт харагдана.
        */}
      <div className={s.subLabel}>Гол үзүүлэлт</div>
      <EconMeter
        label="Нийт зардал"
        value={zoneCost}
        max={meterMax}
        color="#f87171"
        note={`дэд бүтэц ${money(zoneInfra)} + барилга ${money(zoneBuild)}`}
      />
      <EconMeter
        label="Борлуулалтын орлого"
        value={revenue}
        max={meterMax}
        color="#fbbf24"
        note={`үүнээс орон сууц ${money(revenueRes)}`}
      />
      <EconMeter
        label={profit >= 0 ? 'Ашиг' : 'Алдагдал'}
        value={profit}
        max={meterMax}
        color={col}
        note={margin == null || !Number.isFinite(margin)
          ? profitLabel(margin)
          : `ашгийн маржа ${nf(margin, 1)}% · ${profitLabel(margin)}`}
      />

      <div className={s.finSummary}>
        <div>
          <span>Эдийн засгийн оноо</span>
          <b style={{ color: col }}>
            {profitScore(margin) == null ? '—' : Math.round(profitScore(margin)!)}
          </b>
        </div>
        <div><span>Зардлын эзлэх хувь</span><b>{share == null ? '—' : `${nf(share, 1)}%`}</b></div>
        <div><span>Ашигтай бүс</span><b className={s.pos}>{rows.filter((r) => (r.econ?.profit ?? 0) > 0).length} / {rows.length}</b></div>
        <div><span>Бүсүүдийн талбай</span><b>{nf(zoneArea, 1)} га</b></div>
        <div><span>1 га-д зарцуулах</span><b>{money(spendPerHa)}</b></div>
      </div>

      <div className={s.subLabel}>Үйлчилгээ тус бүрийн өртөг</div>
      <div className={s.econChart}>
        {sorted.map((l) => {
          const g = COST_GROUPS[l.group];
          const pct = (l.total / (costs.total || 1)) * 100;
          const meta = l.qtyUnit === 'ш'
            ? `${nf(l.count)} ш × ${unitMoney(l.unitPrice)}`
            : !l.uniformPrice
              ? `${nf(l.qty)} ${l.qtyUnit} · нэгж үнэ хувьсах`
              : `${nf(l.qty, l.divisor === 1 ? 2 : 0)} ${l.qtyUnit} × ${unitMoney(l.unitPrice)}/${l.divisor === 1 ? l.qtyUnit : `${l.divisor}м`}`;
          return (
            <div key={l.id} className={s.econRow} title={`${l.label} — ${g.label}`}>
              <div className={s.econRowTop}>
                <i style={{ background: g.color }} />
                <span className="nm">{l.label}</span>
                <b>{money(l.total)}</b>
                <em>{nf(pct, 1)}%</em>
              </div>
              <div className={s.econBar}><i style={{ width: `${(l.total / max) * 100}%`, background: g.color }} /></div>
              <div className={s.econMeta}>{meta}</div>
            </div>
          );
        })}

        <div className={s.subLabel}>Салбараар</div>
        {Object.entries(byGroup).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
          <div key={k} className={s.econGrp}>
            <i style={{ background: COST_GROUPS[k].color }} />
            <span>{COST_GROUPS[k].label}</span>
            <b>{money(v)}</b>
            <em>{nf((v / (costs.total || 1)) * 100, 1)}%</em>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Эдийн засгийн нэг үзүүлэлт — индикатор мөр (нэр · дүн · зурвас · тайлбар).
 * ⚠️ Хот төлөвлөлтийн үзүүлэлттэй ИЖИЛ `.mRow` бүтэц: хэрэглэгч хоёр талыг
 * ижил хэлбэрээр уншина.
 */
function EconMeter({
  label, value, max, color, note,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  note: string;
}) {
  const w = Math.max(0, Math.min(100, (Math.abs(value) / max) * 100));
  return (
    <div className={s.mRow}>
      <div className={s.mTop}>
        <span className="nm">{label}</span>
        <span className="v" style={{ color }}>{money(value)}</span>
      </div>
      <div className={s.mBar}><i style={{ width: `${w}%`, background: color }} /></div>
      <div className={s.socMeta}>{note}</div>
    </div>
  );
}

/* ══════════════════ Эдийн засгийн загварчлал — баруун карт ══════════════════ */

function EconTune({
  rows, costs, basePrice, econOpt, setEconOpt, buildCost, setBuildCost, selected, onSelect,
}: {
  rows: Row[];
  costs: Costs;
  basePrice: number;
  econOpt: { pricePerM2: number | null; perHa: number | null };
  setEconOpt: (v: { pricePerM2: number | null; perHa: number | null }) => void;
  buildCost: number;
  setBuildCost: (v: number) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [pcOff, setPcOff] = useState(false);
  useEffect(() => { setPcOff(readSet().has('profitChart')); }, []);

  const price = econOpt.pricePerM2 ?? basePrice;
  const perHa = econOpt.perHa ?? costs.perHa;
  const changed = econOpt.pricePerM2 !== null;

  const cost = rows.reduce((a, r) => a + (r.econ?.cost ?? 0), 0);
  const rev = rows.reduce((a, r) => a + (r.econ?.revenue ?? 0), 0);
  const profit = rev - cost;

  const data = rows.filter((r) => r.econ).sort((a, b) => b.econ!.profit - a.econ!.profit);
  const maxAbs = Math.max(1, ...data.map((r) => Math.abs(r.econ!.profit)));
  const win = data.filter((r) => r.econ!.profit > 0);
  const totalWin = win.reduce((a, r) => a + r.econ!.profit, 0) || 1;
  const totalLoss = data.filter((r) => r.econ!.profit < 0).reduce((a, r) => a + r.econ!.profit, 0) || 1;

  const togglePc = () => {
    const next = !pcOff;
    setPcOff(next);
    const set = readSet();
    if (next) set.add('profitChart'); else set.delete('profitChart');
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* private mode */ }
  };

  return (
    <section className={`${s.card} ${s.collapsible} ${s.econTune} ${pcOff ? s.pcOff : ''}`}>
      <h2>
        Эдийн засгийн загварчлал
        <button
          type="button"
          className={s.mini}
          title="Өгөгдлийн анхны утга руу буцаах"
          onClick={() => { setEconOpt({ pricePerM2: null, perHa: null }); setBuildCost(BUILD_COST_PER_M2); }}
        >
          Reset
        </button>
      </h2>
      <div className={s.body}>
        <p className={`${s.muted} ${s.small}`}>
          Нэгж үнийг гулсуураар өөрчилж, бүсүүдийн ашиг хэрхэн хэлбэлзэхийг доор шууд харна.
        </p>

        {/* ⚠️ Барилгын өртөг нь эх өгөгдөлд БАЙХГҮЙ — зөвхөн энэ таамаг */}
        <div className={s.sliderRow}>
          <label>
            <span>1 м² баригдах жишиг өртөг</span>
            <span className="val">{nf(buildCost / 1e6, 2)} сая ₮/м²</span>
          </label>
          <input
            type="range" min={0} max={8} step={0.1}
            value={buildCost / 1e6}
            aria-label="1 м² баригдах жишиг өртөг"
            onChange={(e) => setBuildCost(Number(e.target.value) * 1e6)}
          />
          <div className={s.wSrc}>
            Эх өгөгдөлд барилгын өөрийн өртгийн талбар БАЙХГҮЙ — энэ нь таамаг.
            <b> Барилгын_нийт_талбай_m2</b> × энэ үнэ = барилгын зардал («Одоо
            байгаа» барилга ороогүй).
          </div>
        </div>

        <div className={s.sliderRow}>
          <label>
            <span>Орон сууцны 1 м² үнэ</span>
            <span className="val">{nf(price / 1e6, 1)} сая ₮/м²</span>
          </label>
          <input
            type="range" min={0} max={Math.max(10, Math.ceil((basePrice / 1e6) * 2))} step={0.1}
            value={price / 1e6}
            aria-label="Орон сууцны 1 м² үнэ"
            onChange={(e) => setEconOpt({ pricePerM2: Number(e.target.value) * 1e6, perHa })}
          />
        </div>

        <div className={s.sliderRow}>
          <label>
            <span>1 га-д зарцуулах төсөв</span>
            <span className="val">{nf(perHa / 1e9, 1)} тэрбум ₮/га</span>
          </label>
          <input
            type="range" min={0} max={Math.max(40, Math.ceil((costs.perHa / 1e9) * 1.5))} step={0.5}
            value={perHa / 1e9}
            aria-label="1 га-д зарцуулах төсөв"
            onChange={(e) => setEconOpt({ pricePerM2: price, perHa: Number(e.target.value) * 1e9 })}
          />
        </div>

        <div className={s.finSummary}>
          <div><span>Нийт зардал</span><b>{money(cost)}</b></div>
          <div><span>Нийт орлого</span><b>{money(rev)}</b></div>
          <div>
            <span>{profit >= 0 ? 'Ашиг' : 'Алдагдал'}</span>
            <b className={profit >= 0 ? s.pos : s.neg}>{money(profit)}</b>
          </div>
          <div>
            <span>Өгөгдлийн утга</span>
            <b className={changed ? s.neg : s.pos}>{changed ? 'өөрчилсөн' : 'хэвээр'}</b>
          </div>
        </div>

        <button type="button" className={`${s.subLabel} ${s.toggleLabel} ${pcOff ? s.toggleOff : ''}`} onClick={togglePc}>
          <span>Бүсүүдийн ашиг / алдагдал</span><i>▼</i>
        </button>

        <div className={s.pchart}>
          {data.map((r) => {
            const p = r.econ!.profit;
            const col = p >= 0 ? '#4ade80' : '#ef4444';
            const pct = p >= 0 ? (p / totalWin) * 100 : (p / totalLoss) * 100;
            return (
              <button
                key={r.id}
                type="button"
                className={`${s.econRow} ${selected === r.id ? s.econOn : ''}`}
                title={r.type}
                onClick={() => onSelect(selected === r.id ? null : r.id)}
              >
                <div className={s.econRowTop}>
                  <i style={{ background: col }} />
                  <span className="nm">{r.id}</span>
                  <b style={{ color: col }}>{money(p)}</b>
                  <em>{nf(pct, 1)}%</em>
                </div>
                <div className={s.econBar}><i style={{ width: `${(Math.abs(p) / maxAbs) * 100}%`, background: col }} /></div>
                <div className={s.econMeta}>
                  {nf(r.areaHa, 2)} га · зардал {money(r.econ!.cost)} · орлого {money(r.econ!.revenue)}
                </div>
              </button>
            );
          })}
          <div className={s.pchartLgd}>
            <span><b className={s.pos}>{win.length}</b> ашигтай</span>
            <span><b className={s.neg}>{data.length - win.length}</b> алдагдалтай</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════ Бүсийн эрэмбэ ══════════════════ */

function Ranking({
  rows, mode, ind, econShare, selected, onSelect,
}: {
  rows: Row[];
  mode: Mode;
  ind: Indicator;
  econShare: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  /**
   * ⚠️ Анхнаасаа зөвхөн «Муу» бүлэг нээлттэй — анхаарал шаардсан бүсийг шууд
   * харуулж, сайн үзүүлэлттэй бүсүүд жагсаалтыг дүүргэхгүй.
   */
  const [off, setOff] = useState<Set<number>>(
    () => new Set(SCORE_LEVELS.map((_, i) => i).filter((i) => SCORE_LEVELS[i].label !== 'Муу')),
  );

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (valueOf(b, mode, ind, econShare) ?? -1) - (valueOf(a, mode, ind, econShare) ?? -1)),
    [rows, mode, ind, econShare],
  );

  const perLevel = SCORE_LEVELS.map((_, i) => sorted.filter((r) => levelOf(valueOf(r, mode, ind, econShare)) === i).length);
  const noData = sorted.filter((r) => levelOf(valueOf(r, mode, ind, econShare)) < 0).length;

  const out: ReactNode[] = [];
  let last: number | null = null;

  sorted.forEach((r, i) => {
    const tot = valueOf(r, mode, ind, econShare);
    const lv = levelOf(tot);

    if (lv !== last) {
      last = lv;
      const L = SCORE_LEVELS[lv];
      const hidden = off.has(lv);
      out.push(
        <button
          key={`grp${lv}`}
          type="button"
          className={`${s.rankGrp} ${hidden ? s.grpOff : ''}`}
          title={hidden ? 'Дэлгэх' : 'Хураах'}
          onClick={() => {
            const next = new Set(off);
            if (next.has(lv)) next.delete(lv); else next.add(lv);
            setOff(next);
          }}
        >
          <i style={{ background: L ? L.color : NO_DATA_COLOR }} />
          <span>{L ? L.label : 'Өгөгдөлгүй'}</span>
          <em>{L ? `${L.min}–${Math.min(100, L.max)}` : ''}</em>
          <b>{lv < 0 ? noData : perLevel[lv]}</b>
          <u>▼</u>
        </button>,
      );
    }
    if (off.has(lv)) return;

    out.push(
      <button
        key={r.id}
        type="button"
        className={`${s.rankRow} ${selected === r.id ? s.rankSel : ''} ${/багц/i.test(r.id) ? s.bagts : ''}`}
        onClick={() => onSelect(selected === r.id ? null : r.id)}
      >
        <span className="rk">{i + 1}</span>
        <span className="nm">{r.id}<i>{r.type}</i></span>
        <span className="nm2">{r.raw.density == null ? '' : `${nf(r.raw.density)} хүн/га`}</span>
        <span className="tot" style={{ background: scoreColor(tot) }}>{tot == null ? '—' : Math.round(tot)}</span>
      </button>,
    );
  });

  return (
    <>
      <div className={s.rankHead}><span>#</span><span>Бүс</span><span>Нягтшил</span><span>Оноо</span></div>
      <div className={s.rankList}>{out}</div>
    </>
  );
}
