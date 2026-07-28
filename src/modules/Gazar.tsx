'use client';

import { useCallback, useRef, useState } from 'react';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Icon } from '@/components/Icon';
import { Stats, Stat, Donut, Bars, Ring, Empty, Loading } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import {
  queryStats, queryGroup, groups, count, sum, avg, type Aoi, type Row,
} from '@/lib/query';
import { GAZAR_BUILDING, GAZAR_PARCEL, PARCEL_LEFT, PARCEL_PROGRESS_HUES } from '@/lib/services';
import { num, text } from '@/lib/format';
import o from './overview.module.css';
import g from './gazar.module.css';

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТ — газрын зураг ТӨВД, 2 талд нь багана:
 *
 *   ┌───────────┬──────────────────┬───────────────┐
 *   │ ЧӨЛӨӨЛӨЛТ  │   ГАЗРЫН ЗУРАГ    │  БАРИЛГА       │
 *   │ үзүүлэлт + │   + Полигон      │  ─────────────│
 *   │ явц (нэг   │                  │  КАДАСТР       │
 *   │ панелд)    │                  │  (нэгтгэсэн)   │
 *   └───────────┴──────────────────┴───────────────┘
 *
 * ⚠️ Полигон зурахад 3 service ижил талбайгаар шүүгдэнэ (`aoi`), гаднахыг
 * featureEffect-ээр бүдгэрүүлнэ. Полигонгүй үед service бүрийн нийт дүн.
 */

/** Газрын зурагт харагдах давхаргууд — чөлөөлөлт + барилга/кадастр.
 *  (Хилүүд `khil1`/`khil2` нь `ALWAYS_ON_IDS`-ээр автоматаар ил тул энд бичихгүй.) */
const VISIBLE_IDS = ['gazar:parcel', 'gazar:building', 'land:left'];
/** Полигоноор ШҮҮГДЭХ давхаргууд — featureEffect (бүдгэрүүлэлт) зөвхөн эдгээрт */
const FILTER_IDS = ['land:left', 'gazar:building', 'gazar:parcel'];

/** Чөлөөлөлт «шийдэгдсэн» гэж тооцох ангилал (гэрээлсэн + дүйцүүлсэн) */
const RESOLVED = ['гэрээлсэн', 'дүйцүүлсэн'];
/** Маргаантай / татгалзсан — эрсдэлтэй ангилал */
const DISPUTED = ['татгалзсан', 'маргаантай'];

/** Диаграмын палитр — ангилал бүрд ялгарах өнгө (явцаас бусад талбарт) */
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#7c3aed',
  '#ef4444', '#0891b2', '#d97706', '#64748b', '#db2777', '#65a30d',
];

/** м² → га */
const ha = (m2: number) => num(m2 / 10_000, 2);

/** ₮ дүнг унших боломжтой нэгжээр — үнэлгээ их дүнтэй тул их наяд хүртэл */
const money = (v: number): { v: string; unit: string } =>
  v >= 1e12 ? { v: num(v / 1e12, 2), unit: 'их наяд ₮' }
    : v >= 1e9 ? { v: num(v / 1e9, 2), unit: 'тэрбум ₮' }
      : v >= 1e6 ? { v: num(v / 1e6, 1), unit: 'сая ₮' }
        : { v: num(v, 0), unit: '₮' };

/** «гэрээлсэн.» ба «гэрээлсэн» нэг ангилал; хоосон → «Тодорхойгүй» */
const cleanProgress = (v: string) => {
  const s = v.trim().replace(/\.$/, '');
  return s === '' || s === '—' ? 'Тодорхойгүй' : s;
};

/** Бүлэглэсэн мөрүүд → диаграмын зүсмэгүүд (өнгө автоматаар) */
function toItems(rows: Row[], field: string, valueKey: string) {
  return groups(rows, field, 'Тодорхойгүй', [valueKey]).map((grp, i) => ({
    key: grp.label || `#${i}`,
    label: grp.label,
    value: grp.values[valueKey] ?? 0,
    color: PALETTE[i % PALETTE.length],
  }));
}

/** Явцын бүлгүүд → зүсмэг. «гэрээлсэн.»-г нэгтгэж, `PARCEL_PROGRESS_HUES`-аар өнгө.
 *  `valueKey` — тоолох хэмжигдэхүүн (`n` = тоо, `a` = талбай м²). */
function progressItems(rows: Row[], field: string, valueKey = 'n') {
  const by = new Map<string, number>();
  for (const r of rows) {
    const k = cleanProgress(text(r[field]));
    by.set(k, (by.get(k) ?? 0) + Number(r[valueKey] ?? 0));
  }
  return [...by.entries()]
    .map(([label, value]) => ({
      key: label, label, value,
      color: PARCEL_PROGRESS_HUES[label] ?? '#94a3b8',
    }))
    .sort((a, b) => b.value - a.value);
}

type ProgItems = ReturnType<typeof progressItems>;

/** Явцын зүсмэгүүдээс заасан ангиллуудын нийлбэр тоо */
const tally = (items: ProgItems, labels: string[]) =>
  items.filter((x) => labels.includes(x.label)).reduce((s, x) => s + x.value, 0);

type GazarData = {
  left: { n: number; area: number; resolved: number; contracted: number; disputed: number };
  leftProgress: ProgItems;
  /** Явц бүрийн ТАЛБАЙ (га) — тоо биш хэмжээгээр харах өнцөг */
  leftAreaBy: ProgItems;
  b: { n: number; area: number; value: number; floors: number; unitPrice: number };
  bType: ReturnType<typeof toItems>;
  bMat: ReturnType<typeof toItems>;
  p: { n: number; area: number };
  pRight: ReturnType<typeof toItems>;
  pUse: ReturnType<typeof toItems>;
};

export function Gazar({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  const { setHighlight } = useMap();

  const [aoi, setAoi] = useState<Aoi | null>(null);
  const [drawToken, setDrawToken] = useState(0);
  const [clearToken, setClearToken] = useState(0);
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
    setHighlight(null, FILTER_IDS, geom);
  }, [setHighlight]);

  const startDraw = useCallback(() => setDrawToken((t) => t + 1), []);

  const clear = useCallback(() => {
    setClearToken((t) => t + 1);
    setAoi(null);
    setHighlight(null);
  }, [setHighlight]);

  const aoiKey = aoi ? JSON.stringify(aoi.geometry) : 'all';

  const q = useAsync<GazarData>(async () => {
    const area = aoi ?? undefined;
    const L = PARCEL_LEFT;
    const B = GAZAR_BUILDING;
    const P = GAZAR_PARCEL;
    const [lStat, lProg, bStat, bType, bMat, pStat, pRight, pUse] = await Promise.all([
      queryStats(L.url, [count('OBJECTID', 'n'), sum(L.fields.area, 'area')], '1=1', area),
      // Явц бүрд ТОО ба ТАЛБАЙ хоёуланг — donut нь тоогоор, bars нь га-гаар
      queryGroup(L.url, L.fields.progress, [count('OBJECTID', 'n'), sum(L.fields.area, 'a')], '1=1', area),
      queryStats(B.url, [
        count(B.oid, 'n'), sum(B.fields.area, 'area'), sum(B.fields.value, 'val'),
        avg(B.fields.floors, 'fl'), avg(B.fields.unitPrice, 'up'),
      ], '1=1', area),
      queryGroup(B.url, B.fields.type, [count(B.oid, 'n')], '1=1', area),
      queryGroup(B.url, B.fields.material, [count(B.oid, 'n')], '1=1', area),
      queryStats(P.url, [count(P.oid, 'n'), sum(P.fields.area, 'area')], '1=1', area),
      queryGroup(P.url, P.fields.right, [count(P.oid, 'n')], '1=1', area),
      queryGroup(P.url, P.fields.landuse, [count(P.oid, 'n')], '1=1', area),
    ]);
    const leftProgress = progressItems(lProg, L.fields.progress);
    // Талбайг га-руу шилжүүлж, жижиг үлдэгдлийг хаяхгүйгээр бүхэлд нь харуулна
    const leftAreaBy = progressItems(lProg, L.fields.progress, 'a')
      .map((x) => ({ ...x, value: Math.round(x.value / 100) / 100 })); // м² → га (2 орон)
    return {
      left: {
        n: Number(lStat.n ?? 0),
        area: Number(lStat.area ?? 0),
        resolved: tally(leftProgress, RESOLVED),
        contracted: tally(leftProgress, ['гэрээлсэн']),
        disputed: tally(leftProgress, DISPUTED),
      },
      leftProgress,
      leftAreaBy,
      b: {
        n: Number(bStat.n ?? 0), area: Number(bStat.area ?? 0),
        value: Number(bStat.val ?? 0), floors: Number(bStat.fl ?? 0),
        unitPrice: Number(bStat.up ?? 0),
      },
      bType: toItems(bType, B.fields.type, 'n'),
      bMat: toItems(bMat, B.fields.material, 'n'),
      p: { n: Number(pStat.n ?? 0), area: Number(pStat.area ?? 0) },
      pRight: toItems(pRight, P.fields.right, 'n'),
      pUse: toItems(pUse, P.fields.landuse, 'n'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aoiKey]);

  const d = q.state === 'ready' ? q.data : null;
  const err = q.state === 'error';
  const pct = d && d.left.n ? (d.left.resolved / d.left.n) * 100 : null;

  /** Панелийн агуулгыг ачаалал/алдаа/хоосонтой хамт зурна */
  const guard = (ready: boolean, body: React.ReactNode) =>
    d ? (ready ? body : <Empty label="Мэдээлэл алга" />)
      : err ? <Empty label="Алдаа гарлаа" /> : <Loading label="Татаж байна…" />;

  return (
    <div className={g.frame}>
      {/* ── ЗҮҮН: Чөлөөлөлт (үлдсэн нэгж талбар) — үзүүлэлт + явц бүгд энд ── */}
      <div className={g.left}>
        <section className={`${g.panel} ${g.panelPrimary}`} aria-label="Чөлөөлөлтийн явц">
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>Чөлөөлөлтийн явц</h3>
            <span className={g.panelNote}>{d ? `${num(d.left.n)} үлдсэн` : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.leftProgress.length > 0, d && (
              <>
                <Stats cols={2}>
                  <Stat value={num(d.left.n)} unit="талбар" label="Нийт нэгж талбар" />
                  <Stat value={ha(d.left.area)} unit="га" label="Нийт талбай" />
                  <Stat value={num(d.left.contracted)} unit="талбар" label="Гэрээ байгуулсан" />
                  <Stat value={num(d.left.disputed)} unit="талбар" label="Маргаантай/татгалзсан" />
                </Stats>
                <div className={g.ringBox}>
                  <Ring value={pct} size={148} width={14} color="#16a34a" label="шийдэгдсэн" />
                  <p className={g.ringNote}>
                    <b className="num">{d ? num(d.left.resolved) : ''}</b> /{' '}
                    <span className="num">{d ? num(d.left.n) : ''}</span> талбар
                    <span className={g.ringSub}>гэрээлсэн + дүйцүүлсэн</span>
                  </p>
                </div>
                {d.leftAreaBy.length > 0 && (
                  <>
                    <p className={g.subHead}>Талбай (га) явцаар</p>
                    <Bars items={d.leftAreaBy} inline limit={6} />
                  </>
                )}
              </>
            ))}
          </div>
        </section>
      </div>

      {/* ── ТӨВ: Газрын зураг + Полигон ── */}
      <main className={g.map}>
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
        </div>

        <div className={`${g.scope} ${aoi ? g.scopeSel : ''}`}>
          <span className={g.scopeDot} aria-hidden />
          <span className={g.scopeText}>{aoi ? 'Сонгосон талбай' : 'Бүх талбай'}</span>
          <span className={g.scopeHint}>{aoi ? 'полигоноор шүүсэн' : 'полигон зурж шүүнэ'}</span>
        </div>
      </main>

      {/* ── БАРУУН: Барилга + Кадастр (нэгтгэсэн багана) ── */}
      <div className={g.right}>
        <section className={g.panel} aria-label="Барилга">
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>Барилга</h3>
            <span className={g.panelNote}>{d ? `${num(d.b.n)} барилга` : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.b.n > 0, d && (
              <>
                <Stats cols={2}>
                  <Stat value={ha(d.b.area)} unit="га" label="Талбай" />
                  <Stat value={money(d.b.value).v} unit={money(d.b.value).unit} label="Нийт үнэлгээ" />
                  <Stat value={d.b.floors ? num(d.b.floors, 1) : '—'} unit="давхар" label="Дундаж өндөр" />
                  <Stat value={d.b.unitPrice ? money(d.b.unitPrice).v : '—'} unit={d.b.unitPrice ? `${money(d.b.unitPrice).unit}/м²` : ''} label="Дундаж м² үнэ" />
                </Stats>
                {d.bType.length > 0 && (
                  <Donut items={d.bType} size={112} width={17} center={num(d.b.n)} centerLabel="барилга" stack />
                )}
                {d.bMat.length > 0 && (
                  <>
                    <p className={g.subHead}>Материалаар</p>
                    <Bars items={d.bMat} inline limit={5} />
                  </>
                )}
              </>
            ))}
          </div>
        </section>

        <section className={g.panel} aria-label="Кадастрын нэгж">
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>Кадастрын нэгж</h3>
            <span className={g.panelNote}>{d ? `${num(d.p.n)} нэгж` : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.p.n > 0, d && (
              <>
                <Stats cols={2}>
                  <Stat value={num(d.p.n)} unit="нэгж" label="Нэгжийн тоо" />
                  <Stat value={ha(d.p.area)} unit="га" label="Талбай" />
                </Stats>
                {d.pRight.length > 0 && (
                  <Donut items={d.pRight} size={112} width={17} center={num(d.p.n)} centerLabel="нэгж" stack />
                )}
                {d.pUse.length > 0 && (
                  <>
                    <p className={g.subHead}>Зориулалтаар</p>
                    <Bars items={d.pUse} inline limit={5} />
                  </>
                )}
              </>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
