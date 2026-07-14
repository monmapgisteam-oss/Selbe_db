'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import type Polygon from '@arcgis/core/geometry/Polygon';

import { Section, Stats, Stat, Rows, Bars, Empty, Loading } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { useMap, ESTIMATOR_BUILDING_HUE } from '@/components/MapCanvas';
import { queryStats, queryGroup, queryCount, count, sum, groups, type Aoi } from '@/lib/query';
import { CADASTRE, VALUATION, MODULES } from '@/lib/services';
import { num, ha, mnt } from '@/lib/format';
import s from './estimator.module.css';

const HUE = MODULES.find((m) => m.key === 'estimator')!.hue;
const P = CADASTRE.fields;
const V = VALUATION.fields;

type Result = {
  /** Зурсан талбайн геодезик хэмжээ (м²) */
  aoiM2: number;
  parcels: {
    n: number;
    m2: number;
    byRight: { label: string; n: number; m2: number }[];
    byUse: { label: string; n: number; m2: number }[];
  };
  buildings: {
    n: number;
    m2: number;
    total: number;
    perM2: number | null;
    rent: number;
    jobs: number;
    capacity: number;
    byType: { label: string; n: number; total: number }[];
  };
};

/**
 * Газрын үнэ тооцоолуур.
 *
 * Хэрэглэгч газрын зураг дээр талбай зурна → түүнтэй огтлолцох:
 *  · кадастрын нэгж талбар (`Selbe_parcel`, 43,041) — тоо, талбай, эрхийн төрөл, зориулалт
 *  · барилгын үнэлгээ (`selbe_B`, 36,586) — нийт үнэ, м² үнэ, түрээс, ажлын байр
 *
 * Хоёулаа AP1 серверт байна. Кадастрын давхаргын проекц нь wkid-гүй WKT (UTM 48N)
 * боловч сервер Веб Меркаторын AOI-г өөрөө хөрвүүлж чаддагийг шалгасан.
 */
export function EstimatorPanel() {
  const { view, sketchLayer, setAoiFilter } = useMap();

  // Давхаргын хэмжээ — хатуу бичихгүй, үйлчилгээнээс тоолуулна
  const sizes = useAsync(
    async () => {
      const [parcels, buildings] = await Promise.all([
        queryCount(CADASTRE.url),
        queryCount(VALUATION.url),
      ]);
      return { parcels, buildings };
    },
    [],
  );

  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svmRef = useRef<SketchViewModel | null>(null);

  const filterRef = useRef(setAoiFilter);
  filterRef.current = setAoiFilter;

  // Модулиас гарахад шүүлтийг цуцлана — эс бөгөөс буцаж ирэхэд хуучин AOI-гийн
  // шүүлт үлдэж, зурсан талбай нь аль хэдийн арчигдсан байх байсан.
  useEffect(() => () => filterRef.current(null), []);

  const compute = useCallback(async (polygon: Polygon) => {
    setBusy(true);
    setError(null);

    // Зурсан талбайтай огтлолцоогүй нэгж талбар, барилгыг газрын зургаас нуана
    filterRef.current(polygon);

    try {
      const aoiM2 = Math.abs(geometryEngine.geodesicArea(polygon, 'square-meters'));
      const aoi: Aoi = { geometry: polygon.toJSON(), wkid: polygon.spatialReference.wkid ?? 102100 };

      const [pTot, pRight, pUse, bTot, bType] = await Promise.all([
        queryStats(CADASTRE.url, [count(CADASTRE.oid, 'n'), sum(P.area, 'm2')], '1=1', aoi),
        queryGroup(CADASTRE.url, P.right, [count(CADASTRE.oid, 'n'), sum(P.area, 'm2')], '1=1', aoi),
        queryGroup(CADASTRE.url, P.landuse, [count(CADASTRE.oid, 'n'), sum(P.area, 'm2')], '1=1', aoi),
        queryStats(
          VALUATION.url,
          [
            count(VALUATION.oid, 'n'),
            sum(V.area, 'm2'),
            sum(V.total, 'total'),
            sum(V.rent, 'rent'),
            sum(V.jobs, 'jobs'),
            sum(V.capacity, 'cap'),
          ],
          '1=1',
          aoi,
        ),
        queryGroup(VALUATION.url, V.type, [count(VALUATION.oid, 'n'), sum(V.total, 'total')], '1=1', aoi),
      ]);

      setResult({
        aoiM2,
        parcels: {
          n: Number(pTot.n ?? 0),
          m2: Number(pTot.m2 ?? 0),
          byRight: groups(pRight, P.right, 'Бүртгэгдээгүй', ['n', 'm2']).map((g) => ({
            label: g.label,
            n: g.values.n,
            m2: g.values.m2,
          })),
          byUse: groups(pUse, P.landuse, 'Бүртгэгдээгүй', ['m2', 'n'])
            .map((g) => ({ label: g.label, n: g.values.n, m2: g.values.m2 }))
            .slice(0, 8),
        },
        buildings: {
          n: Number(bTot.n ?? 0),
          m2: Number(bTot.m2 ?? 0),
          total: Number(bTot.total ?? 0),
          // ⚠️ `AVG(MKV_UNE)` бол барилга бүрийн м² үнийн ЖИНЛЭГДЭЭГҮЙ дундаж —
          //    40 м² лангуу 12,000 м² цамхагтай ижил жинтэй болно. AOI-ийн жинхэнэ
          //    м² үнэ = нийт үнэлгээ / нийт талбай.
          perM2: Number(bTot.m2 ?? 0) > 0 ? Number(bTot.total ?? 0) / Number(bTot.m2) : null,
          rent: Number(bTot.rent ?? 0),
          jobs: Number(bTot.jobs ?? 0),
          capacity: Number(bTot.cap ?? 0),
          byType: groups(bType, V.type, 'Тодорхойгүй', ['total', 'n']).map((g) => ({
            label: g.label,
            n: g.values.n,
            total: g.values.total,
          })),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, []);

  /* Зурах хэрэгсэл */
  useEffect(() => {
    if (!view || !sketchLayer) return;

    const svm = new SketchViewModel({
      view,
      layer: sketchLayer,
      defaultCreateOptions: { mode: 'click' },
      polygonSymbol: {
        type: 'simple-fill',
        color: [13, 148, 136, 0.16],
        outline: { color: [13, 148, 136], width: 2 },
      } as unknown as __esri.SimpleFillSymbol,
    });
    svmRef.current = svm;

    const h = svm.on('create', (e) => {
      if (e.state === 'complete') {
        setDrawing(false);
        compute(e.graphic.geometry as Polygon);
      }
    });
    const u = svm.on('update', (e) => {
      if (e.state === 'complete' && e.graphics[0]) {
        compute(e.graphics[0].geometry as Polygon);
      }
    });

    return () => {
      h.remove();
      u.remove();
      svm.destroy();
      svmRef.current = null;
    };
  }, [view, sketchLayer, compute]);

  const draw = () => {
    if (!svmRef.current || !sketchLayer) return;
    sketchLayer.removeAll();
    setAoiFilter(null); // шинээр зурж эхлэхэд бүх объект буцаж харагдана
    setResult(null);
    setError(null);
    setDrawing(true);
    svmRef.current.create('polygon');
  };

  const clear = () => {
    svmRef.current?.cancel();
    sketchLayer?.removeAll();
    setAoiFilter(null);
    setDrawing(false);
    setResult(null);
    setError(null);
  };

  return (
    <>
      <Section>
        <div className={s.tools}>
          <button
            type="button"
            className={`${s.tool} ${drawing ? s.toolOn : ''}`}
            onClick={draw}
            style={{ '--tone': HUE } as CSSProperties}
          >
            <Icon name="pen" size={16} />
            {drawing ? 'Талбай зурж байна…' : 'Талбай зурах'}
          </button>
          <button type="button" className={s.toolGhost} onClick={clear} disabled={!result && !drawing}>
            <Icon name="trash" size={16} />
            Цэвэрлэх
          </button>
        </div>
        <p className={s.hint}>
          Газрын зураг дээр дарж олон өнцөгт зурна. Давхар дарж дуусгана. Зурсан талбайтай огтлолцох
          нэгж талбар болон барилгын үнэлгээ автоматаар нэгтгэгдэнэ.
        </p>

        <ul className={s.legend}>
          <li>
            <span className={s.swatch} style={{ '--tone': HUE } as CSSProperties} />
            Нэгж талбар — <code>Selbe_parcel</code>
            {sizes.state === 'ready' && <b className="num"> · {num(sizes.data.parcels)}</b>}
          </li>
          <li>
            <span className={s.swatch} style={{ '--tone': ESTIMATOR_BUILDING_HUE } as CSSProperties} />
            Барилга (үнэлгээтэй) — <code>selbe_B</code>
            {sizes.state === 'ready' && <b className="num"> · {num(sizes.data.buildings)}</b>}
          </li>
        </ul>
        {sizes.state === 'ready' && (
          <p className={s.hint} style={{ marginTop: 8 }}>
            Хоёр давхарга нийт{' '}
            <b className="num">{num(sizes.data.parcels + sizes.data.buildings)}</b> полигонтой тул
            зөвхөн ойртоход зурагдана.
          </p>
        )}
      </Section>

      {busy && (
        <Section>
          <Loading label="Тооцоолж байна…" />
        </Section>
      )}

      {error && (
        <Section>
          <div className={s.error} role="alert">
            Тооцоолол амжилтгүй — {error}
          </div>
        </Section>
      )}

      {!busy && !error && !result && (
        <Section>
          <Empty label="Талбай зураад үр дүнг харна уу." />
        </Section>
      )}

      {!busy && result && <Results r={result} />}
    </>
  );
}

function Results({ r }: { r: Result }) {
  const { parcels, buildings } = r;

  return (
    <>
      <Section title="Зурсан талбай">
        <Stats cols={2}>
          <Stat value={ha(r.aoiM2, 2)} unit="га" label="Сонгосон талбай" color={HUE} accent />
          <Stat value={num(r.aoiM2)} unit="м²" label="Хэмжээ" color={HUE} />
        </Stats>
      </Section>

      <Section title="Барилгын үнэлгээ" note={`${num(buildings.n)} барилга`}>
        {buildings.n === 0 ? (
          <Empty label="Сонгосон талбайд үнэлгээтэй барилга алга." />
        ) : (
          <>
            <Stats cols={2}>
              <Stat value={mnt(buildings.total)} label="Нийт үнэлгээ" color={HUE} accent />
              <Stat value={mnt(buildings.rent)} label="Сарын түрээсийн нийлбэр" color={HUE} accent />
            </Stats>
            <div style={{ marginTop: 12 }}>
              <Rows
                items={[
                  { key: 'Барилгын тоо', value: <span className="num">{num(buildings.n)}</span> },
                  { key: 'Барилгын талбай', value: <span className="num">{num(buildings.m2)} м²</span> },
                  { key: '1 м²-ын дундаж үнэ', value: <span className="num">{mnt(buildings.perM2)}</span> },
                  { key: 'Ажлын байр', value: <span className="num">{num(buildings.jobs)}</span> },
                  { key: 'Багтаамж', value: <span className="num">{num(buildings.capacity)} хүн</span> },
                ]}
              />
            </div>

            {buildings.byType.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>
                  Ашиглалтын төрлөөр
                </div>
                <Bars
                  color={HUE}
                  items={buildings.byType.map((t) => ({
                    key: t.label,
                    label: `${t.label} · ${num(t.n)}`,
                    value: t.total,
                    display: mnt(t.total),
                  }))}
                />
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Кадастрын нэгж талбар" note={`${num(parcels.n)} талбар`}>
        {parcels.n === 0 ? (
          <Empty label="Сонгосон талбайд нэгж талбар алга." />
        ) : (
          <>
            <Stats cols={2}>
              <Stat value={num(parcels.n)} label="Нэгж талбар" color={HUE} />
              <Stat value={ha(parcels.m2, 2)} unit="га" label="Талбай" color={HUE} />
            </Stats>

            <div style={{ marginTop: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Эрхийн төрлөөр
              </div>
              <Bars
                color={HUE}
                items={parcels.byRight.map((rt) => ({
                  key: rt.label,
                  label: `${rt.label} · ${num(rt.n)}`,
                  value: rt.m2,
                  display: `${ha(rt.m2, 2)} га`,
                }))}
              />
            </div>

            {parcels.byUse.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>
                  Газрын зориулалтаар
                </div>
                <Bars
                  color={HUE}
                  items={parcels.byUse.map((u) => ({
                    key: u.label,
                    label: `${u.label} · ${num(u.n)}`,
                    value: u.m2,
                    display: `${ha(u.m2, 2)} га`,
                  }))}
                />
              </div>
            )}
          </>
        )}
      </Section>
    </>
  );
}
