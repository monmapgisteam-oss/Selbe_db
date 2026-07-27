'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Icon } from '@/components/Icon';
import { Section, Stats, Stat, Donut, Bars, Data, Empty } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import {
  queryStats, queryGroup, groups, count, sum, avg, type Aoi, type Row,
} from '@/lib/query';
import { GAZAR_BUILDING, GAZAR_PARCEL } from '@/lib/services';
import { num } from '@/lib/format';
import o from './overview.module.css';
import g from './gazar.module.css';

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТ — газрын зураг дээр ПОЛИГОН зурж, тэр талбай доторх барилга
 * (`selbe_B`) ба кадастрын нэгж (`Selbe_parcel`)-ийг орон зайгаар шүүнэ.
 *
 *   ┌──────────────────────────┬──────────────────┐
 *   │  Толгойн үзүүлэлт (KPI)   │  Барилгын самбар │
 *   │  ГАЗРЫН ЗУРАГ + Полигон   │  Кадастрын самбар│
 *   └──────────────────────────┴──────────────────┘
 *
 * ⚠️ Полигон дотор орсныг featureEffect-ээр тодоор үлдээж, гаднахыг БҮДГЭРҮҮЛНЭ
 * (`setHighlight(null, ids, geometry)`). Дашбоардын тоо нь ЯГ ТЭР полигоныг
 * ArcGIS REST-ийн орон зайн шүүлтэд (`aoi`) дамжуулж татна — зураг ба тоо нэг
 * эх геометртэй.
 */

/** Газрын зурагт харагдах БҮХ давхарга — 2 өгөгдөл + 2 хил */
const VISIBLE_IDS = ['gazar:khil', 'gazar:bagts', 'gazar:parcel', 'gazar:building'];
/** Полигоноор ШҮҮГДЭХ давхаргууд — featureEffect (бүдгэрүүлэлт) зөвхөн эдгээрт.
 *  Хилийн давхаргууд оролцохгүй — лавлагаа тул үргэлж бүтэн харагдана. */
const FILTER_IDS = ['gazar:building', 'gazar:parcel'];

/** Диаграмын палитр — ангилал бүрд ялгарах өнгө */
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#7c3aed',
  '#ef4444', '#0891b2', '#d97706', '#64748b', '#db2777', '#65a30d',
];

/** ₮ дүнг унших боломжтой нэгжээр */
const money = (v: number): { v: string; unit: string } =>
  v >= 1e9 ? { v: num(v / 1e9, 2), unit: 'тэрбум ₮' }
    : v >= 1e6 ? { v: num(v / 1e6, 1), unit: 'сая ₮' }
      : { v: num(v, 0), unit: '₮' };

/** м² → га */
const ha = (m2: number) => num(m2 / 10_000, 2);

/** Бүлэглэсэн мөрүүд → диаграмын зүсмэгүүд (өнгө автоматаар) */
function toItems(rows: Row[], field: string, valueKey: string) {
  return groups(rows, field, 'Тодорхойгүй', [valueKey]).map((grp, i) => ({
    key: grp.label || `#${i}`,
    label: grp.label,
    value: grp.values[valueKey] ?? 0,
    color: PALETTE[i % PALETTE.length],
  }));
}

type GazarData = {
  b: { n: number; area: number; value: number; floors: number };
  bType: ReturnType<typeof toItems>;
  bMat: ReturnType<typeof toItems>;
  p: { n: number; area: number };
  pUse: ReturnType<typeof toItems>;
  pRight: ReturnType<typeof toItems>;
};

export function Gazar({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  const { setHighlight } = useMap();

  /** Зурсан полигоны орон зайн шүүлт (REST) — null бол хараахан зураагүй */
  const [aoi, setAoi] = useState<Aoi | null>(null);
  /** «Полигон зурах» товч дарахад нэмэгдэж, MapCanvas зурах горимыг эхлүүлнэ */
  const [drawToken, setDrawToken] = useState(0);
  /** «Цэвэрлэх» товч дарахад нэмэгдэж, зурагдсан полигоныг MapCanvas-д арилгуулна */
  const [clearToken, setClearToken] = useState(0);
  /** Дарж сонгосон объект (одоохондоо ашиглахгүй ч MapCanvas шаарддаг) */
  const pickRef = useRef<(a: Record<string, unknown> | null, id: string | null) => void>(() => {});

  /** Sketch-ээс ирсэн геометр — бүдгэрүүлэлт ба REST шүүлтийг ЗЭРЭГ тохируулна */
  const onSketch = useCallback((geom: __esri.Geometry | null) => {
    if (!geom) {
      setAoi(null);
      setHighlight(null);
      return;
    }
    const poly = geom as unknown as { rings: number[][][]; spatialReference?: { wkid?: number } };
    const wkid = poly.spatialReference?.wkid ?? 102100;
    setAoi({
      geometry: { rings: poly.rings, spatialReference: { wkid } },
      wkid,
      type: 'polygon',
      rel: 'intersects',
    });
    // Гаднахыг бүдгэрүүлнэ — зөвхөн gazar давхаргад
    setHighlight(null, FILTER_IDS, geom);
  }, [setHighlight]);

  const startDraw = useCallback(() => setDrawToken((t) => t + 1), []);

  const clear = useCallback(() => {
    setClearToken((t) => t + 1);
    setAoi(null);
    setHighlight(null);
  }, [setHighlight]);

  // Полигон зураагүй бол `undefined` → 2 service-ийн БҮХ өгөгдлийн нийлбэр;
  // зурсан бол тэр полигоноор орон зайгаар шүүнэ.
  const aoiKey = aoi ? JSON.stringify(aoi.geometry) : 'all';

  const q = useAsync<GazarData>(async () => {
    const area = aoi ?? undefined;
    const B = GAZAR_BUILDING;
    const P = GAZAR_PARCEL;
    const [bStat, bType, bMat, pStat, pUse, pRight] = await Promise.all([
      queryStats(B.url, [
        count(B.oid, 'n'), sum(B.fields.area, 'area'),
        sum(B.fields.value, 'val'), avg(B.fields.floors, 'fl'),
      ], '1=1', area),
      queryGroup(B.url, B.fields.type, [count(B.oid, 'n')], '1=1', area),
      queryGroup(B.url, B.fields.material, [count(B.oid, 'n')], '1=1', area),
      queryStats(P.url, [count(P.oid, 'n'), sum(P.fields.area, 'area')], '1=1', area),
      queryGroup(P.url, P.fields.landuse, [count(P.oid, 'n'), sum(P.fields.area, 'area')], '1=1', area),
      queryGroup(P.url, P.fields.right, [count(P.oid, 'n')], '1=1', area),
    ]);
    return {
      b: {
        n: Number(bStat.n ?? 0), area: Number(bStat.area ?? 0),
        value: Number(bStat.val ?? 0), floors: Number(bStat.fl ?? 0),
      },
      bType: toItems(bType, B.fields.type, 'n'),
      bMat: toItems(bMat, B.fields.material, 'n'),
      p: { n: Number(pStat.n ?? 0), area: Number(pStat.area ?? 0) },
      pUse: toItems(pUse, P.fields.landuse, 'n'),
      pRight: toItems(pRight, P.fields.right, 'n'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aoiKey]);

  /** Толгойн үзүүлэлт — өгөгдөл ирэхэд дүүрнэ */
  const tiles = useMemo(() => {
    const d = q.state === 'ready' ? q.data : null;
    const m = d ? money(d.b.value) : null;
    return [
      { v: d ? num(d.b.n) : '…', unit: 'барилга', label: 'Барилгын тоо' },
      { v: d ? ha(d.b.area) : '…', unit: 'га', label: 'Барилгын талбай' },
      { v: m ? m.v : '…', unit: m?.unit, label: 'Нийт үнэлгээ' },
      { v: d ? num(d.p.n) : '…', unit: 'нэгж', label: 'Кадастрын нэгж' },
      { v: d ? ha(d.p.area) : '…', unit: 'га', label: 'Кадастрын талбай' },
    ];
  }, [q]);

  return (
    <div className={g.shell}>
      <main className={`${o.center} ${g.center}`}>
        <div className={o.head}>
          {tiles.map((t) => (
            <div key={t.label} className={o.tile}>
              <span className={o.tileVal}>
                <b className="num">{t.v}</b>
                {t.unit && <i>{t.unit}</i>}
              </span>
              <span className={o.tileLabel}>{t.label}</span>
            </div>
          ))}
        </div>

        <div className={o.hero}>
          <MapCanvas
            dim={dim}
            visible={VISIBLE_IDS}
            zone={null}
            uniform
            sketch
            onSketch={onSketch}
            drawToken={drawToken}
            clearToken={clearToken}
            onPick={pickRef.current}
          />

          {/* Дээд удирдлагын зурвас — харагдац солих + полигон зурах ЗЭРЭГЦЭЭ */}
          <div className={g.topbar}>
            <div className={g.dims} role="group" aria-label="Газрын зургийн харагдац">
              {(['2d', '3d', 'bim'] as Dim[]).map((x) => (
                <button
                  key={x}
                  type="button"
                  aria-pressed={dim === x}
                  className={`${o.dimBtn} ${dim === x ? o.dimOn : ''}`}
                  onClick={() => setDim(x)}
                >
                  {x.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={g.drawBtn}
              onClick={startDraw}
              disabled={dim !== '2d'}
              title={dim !== '2d' ? 'Полигоныг зөвхөн 2D дээр зурна' : 'Газар дээр полигон зурах'}
            >
              <span className={g.drawIcon} aria-hidden><Icon name="polygon" size={15} /></span>
              {aoi ? 'Дахин зурах' : 'Полигон зурах'}
            </button>
            {aoi && (
              <button type="button" className={g.clearBtn} onClick={clear}>
                Цэвэрлэх
              </button>
            )}
            {dim !== '2d' && <span className={g.hint}>2D дээр зурна</span>}
          </div>
        </div>
      </main>

      <aside className={g.side} aria-label="Барилга ба кадастрын мэдээлэл">
        {/* Хамрах хүрээ — полигонгүй бол БҮХ талбай, зурсан бол сонгосон талбай */}
        <div className={`${g.scope} ${aoi ? g.scopeSel : ''}`}>
          <span className={g.scopeDot} aria-hidden />
          <span className={g.scopeText}>
            {aoi ? 'Сонгосон талбайн мэдээлэл' : 'Бүх талбайн мэдээлэл'}
          </span>
          <span className={g.scopeHint}>
            {aoi ? 'полигоноор шүүсэн' : 'полигон зурж шүүнэ'}
          </span>
        </div>

        <Data q={q} loading="Өгөгдлийг татаж байна…">
            {(d) => {
              const empty = d.b.n === 0 && d.p.n === 0;
              if (empty) return <Empty label="Энэ талбайд барилга, кадастрын нэгж алга." />;
              return (
                <>
                  <Section title="Барилга" note={`${num(d.b.n)} барилга`} tone="primary">
                    <Stats cols={2}>
                      <Stat value={ha(d.b.area)} unit="га" label="Талбай" />
                      <Stat value={d.b.floors ? num(d.b.floors, 1) : '—'} unit="давхар" label="Дундаж өндөр" />
                    </Stats>
                    {d.bType.length > 0 && (
                      <Donut items={d.bType} center={num(d.b.n)} centerLabel="барилга" stack />
                    )}
                    {d.bMat.length > 0 && (
                      <>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', margin: '2px 0 0' }}>
                          Материалаар
                        </p>
                        <Bars items={d.bMat} outlined legend limit={6} />
                      </>
                    )}
                  </Section>

                  <Section title="Кадастрын нэгж" note={`${num(d.p.n)} нэгж`}>
                    <Stats cols={2}>
                      <Stat value={ha(d.p.area)} unit="га" label="Талбай" />
                      <Stat value={num(d.p.n)} unit="нэгж" label="Нэгжийн тоо" />
                    </Stats>
                    {d.pRight.length > 0 && (
                      <Donut items={d.pRight} center={num(d.p.n)} centerLabel="нэгж" stack />
                    )}
                    {d.pUse.length > 0 && (
                      <>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', margin: '2px 0 0' }}>
                          Зориулалтаар
                        </p>
                        <Bars items={d.pUse} outlined legend limit={7} />
                      </>
                    )}
                  </Section>
                </>
              );
            }}
        </Data>
      </aside>
    </div>
  );
}
