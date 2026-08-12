'use client';

import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Icon } from '@/components/Icon';
import { Stats, Stat, Donut, Bars, Ring, Empty, Loading } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import {
  queryStats, queryGroup, groups, count, sum, avg, type Aoi, type Row,
} from '@/lib/query';
import { GAZAR_BUILDING, GAZAR_PARCEL, PARCEL_LEFT, PARCEL_PROGRESS_HUES } from '@/lib/services';
import { num, text, shades } from '@/lib/format';
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

/** `Tuluv` төлөв → өнгө ба нэр (нэгтгэсэн үйлчилгээний гол ангилал) */
const STATUS_META = [
  { value: 'Бүрэн чөлөөлсөн', label: 'Бүрэн чөлөөлсөн', color: '#22c55e' },
  { value: 'Цэвэрлэсэн нэгж талбар', label: 'Цэвэрлэсэн', color: '#0ea5e9' },
  { value: 'Үлдсэн нэгж талбар', label: 'Үлдсэн', color: '#e11d48' },
] as const;

/** Диаграмын палитр — ангилал бүрд ялгарах өнгө (явцаас бусад талбарт) */
/**
 * ⚠️ НЭГ ӨНГӨНИЙ СҮҮДЭР — урьд нь 10 өөр солонгон өнгө байсныг хэрэглэгчийн
 * хүсэлтээр Газар чөлөөлөлт харагдацын ногоон акцентын уусгалт болгов. Барилгын
 * төрөл, газар ашиглалтын бүлгүүд өөр «утга»гүй, зөвхөн ялгах хэрэгцээтэй.
 * Явцын өнгө (`PARCEL_PROGRESS_HUES`) нь утга агуулсан тул хэвээр.
 */
const PALETTE = shades('#16a34a', 10);

/** м² → га */
const ha = (m2: number) => num(m2 / 10_000, 2);

/** ₮ дүнг унших боломжтой нэгжээр — үнэлгээ их дүнтэй тул их наяд хүртэл */
const money = (v: number): { v: string; unit: string } =>
  v >= 1e12 ? { v: num(v / 1e12, 2), unit: 'их наяд ₮' }
    : v >= 1e9 ? { v: num(v / 1e9, 2), unit: 'тэрбум ₮' }
      : v >= 1e6 ? { v: num(v / 1e6, 1), unit: 'сая ₮' }
        : { v: num(v, 0), unit: '₮' };

/** Бүлэглэсэн мөрүүд → диаграмын зүсмэгүүд (өнгө автоматаар, тоо НЭГЖТЭЙ) */
function toItems(rows: Row[], field: string, valueKey: string, unit = 'ш') {
  return groups(rows, field, 'Тодорхойгүй', [valueKey]).map((grp, i) => ({
    key: grp.label || `#${i}`,
    label: grp.label,
    value: grp.values[valueKey] ?? 0,
    display: `${num(grp.values[valueKey] ?? 0)} ${unit}`,
    color: PALETTE[i % PALETTE.length],
  }));
}

type StatusBars = { key: string; label: string; value: number; color: string }[];
type ReasonItems = {
  key: string; label: string; n: number; pct: number; area: number; color: string;
  /** Түүхий утгуудаас урьдчилан бүтээсэн WHERE — дарж зурагт шүүхэд */
  where: string;
}[];

/* ── Чарт дарж газрын зурагт шүүх (дашбоардтай ИЖИЛ механизм) ── */

type GFlt = { grp: string; key: string; label: string; where: string; only: string[] };

/** SQL string literal — дан хашилтыг давхарлана */
const sq = (v: string) => v.replace(/'/g, "''");

/** Ангиллын нэр → WHERE («Тодорхойгүй» = хоосон/null) */
const eqOrNull = (field: string, label: string) =>
  label === 'Тодорхойгүй'
    ? `${field} IS NULL OR ${field} = ''`
    : `${field} = '${sq(label)}'`;

type GazarData = {
  /** `Tuluv` төлөвөөс: чөлөөлсөн (бүрэн+цэвэрлэсэн) ба үлдсэн */
  left: { n: number; area: number; cleared: number; cleaned: number; remaining: number; resolved: number };
  /** Төлөв бүрийн ТАЛБАЙ (га) — газрын зурагтай ижил өнгөөр */
  statusAreaBy: StatusBars;
  /** Үлдсэн талбарын ШАЛТГААН (явцын_мэдээ) — тоо/хувь/талбайг тус тусад нь */
  reasons: ReasonItems;
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
  /**
   * ⚠️ AOI-ийн ТҮҮХИЙ геометр — `pickFlt` (deps-гүй useCallback) дотор state
   * биш ref-ээс уншина. `setHighlight` нь тодруулгыг БҮРЭН орлуулдаг тул
   * геометргүй дуудвал полигоны орон зайн бүдгэрүүлэлт алга болж, самбарын тоо
   * полигоноор шүүгдсэн атал зураг бүх талбайг тодоор харуулна.
   */
  const aoiGeomRef = useRef<__esri.Geometry | null>(null);

  /** Sketch-ээс ирсэн геометр — бүдгэрүүлэлт ба REST шүүлтийг ЗЭРЭГ тохируулна */
  const onSketch = useCallback((geom: __esri.Geometry | null) => {
    setFlt(null); // полигон шүүлт тодруулгыг эзэмшинэ — чарт-шүүлтийг цэвэрлэнэ
    aoiGeomRef.current = geom;
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

  /**
   * Чарт-шүүлт — бар/зүсмэг дарахад холбогдох давхаргад тодруулга тавина.
   * Ижил мөрийг дахин дарвал арилна. Полигон (AOI) шүүлттэй ЗЭРЭГ биш —
   * сүүлд хийсэн үйлдэл нь тодруулгыг эзэмшинэ.
   */
  const [flt, setFlt] = useState<GFlt | null>(null);
  const fltRef = useRef<GFlt | null>(null);
  fltRef.current = flt;
  // ⚠️ setState-ийн updater ДОТОР setHighlight дуудаж болохгүй (React render
  //    дундуур өөр компонент шинэчилнэ) — тул ref-ээс уншиж ГАДНА нь дуудна.
  const pickFlt = useCallback((next: GFlt) => {
    const cur = fltRef.current;
    const val = cur && cur.grp === next.grp && cur.key === next.key ? null : next;
    setFlt(val);
    // ⚠️ AOI идэвхтэй бол геометрийг ҮРГЭЛЖ хамт дамжуулна: сонгоход SQL +
    //    орон зайн шүүлт AND-ээр хослоно (MapCanvas-ийн featureEffect тэгж
    //    хослуулдаг), цуцлахад полигоны бүдгэрүүлэлт сэргэнэ.
    const geom = aoiGeomRef.current ?? undefined;
    setHighlight(
      val ? val.where : null,
      val ? val.only : (geom ? FILTER_IDS : undefined),
      geom,
    );
  }, [setHighlight]);

  const clear = useCallback(() => {
    setClearToken((t) => t + 1);
    setAoi(null);
    aoiGeomRef.current = null; // ⚠️ хоцорсон геометр pickFlt-д дахин орох ёсгүй
    setFlt(null);
    setHighlight(null);
  }, [setHighlight]);

  const aoiKey = aoi ? JSON.stringify(aoi.geometry) : 'all';

  const q = useAsync<GazarData>(async () => {
    const area = aoi ?? undefined;
    const L = PARCEL_LEFT;
    const B = GAZAR_BUILDING;
    const P = GAZAR_PARCEL;
    const [lStat, lStatus, lReason, bStat, bType, bMat, pStat, pRight, pUse] = await Promise.all([
      queryStats(L.url, [count('OBJECTID', 'n'), sum(L.fields.area, 'area')], '1=1', area),
      // ТӨЛӨВ (Tuluv) бүрд ТОО ба ТАЛБАЙ — нэгтгэсэн үйлчилгээний гол ангилал
      queryGroup(L.url, L.fields.status, [count('OBJECTID', 'n'), sum(L.fields.area, 'a')], '1=1', area),
      // ҮЛДСЭН талбарын ШАЛТГААН — зөвхөн `Tuluv='Үлдсэн'`-т `явцын_мэдээ` бүрд тоо+талбай
      queryGroup(
        L.url, L.fields.progress, [count('OBJECTID', 'n'), sum(L.fields.area, 'a')],
        `${L.fields.status}='Үлдсэн нэгж талбар'`, area,
      ),
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
    // Төлөв бүрийн тоо/талбай — нэрийн арын зайг арилгаж жиших
    const st = (value: string) => {
      const r = lStatus.find((x) => text(x[L.fields.status]).trim() === value);
      return { n: Number(r?.n ?? 0), a: Number(r?.a ?? 0) };
    };
    const cleared = st('Бүрэн чөлөөлсөн');
    const cleaned = st('Цэвэрлэсэн нэгж талбар');
    const remaining = st('Үлдсэн нэгж талбар');
    const statusAreaBy: StatusBars = STATUS_META.map((m) => {
      const s = st(m.value);
      const ha2 = Math.round(s.a / 100) / 100;
      // Тоо ба нэгж (га) ХАМТ — «1,695 талбар · 78.08 га»
      return {
        key: m.value, label: m.label, value: ha2,
        display: `${num(s.n)} талбар · ${num(ha2, 2)} га`, color: m.color,
      };
    });
    // Шалтгааны нэрийг цэвэрлэж (арын зай, төгсгөлийн «.») нэгтгэнэ.
    // ⚠️ Түүхий утгуудыг мөн хадгална — дарж шүүхэд WHERE яг таарах ёстой.
    const rmap = new Map<string, { n: number; a: number; raws: Set<string> }>();
    for (const r of lReason) {
      const raw = String(r[L.fields.progress] ?? '');
      let k = text(r[L.fields.progress]).trim().replace(/\.$/, '').trim();
      if (!k || k === '—') k = 'Тодорхойгүй';
      const cur = rmap.get(k) ?? { n: 0, a: 0, raws: new Set<string>() };
      cur.n += Number(r.n ?? 0);
      cur.a += Number(r.a ?? 0);
      cur.raws.add(raw);
      rmap.set(k, cur);
    }
    const remN = remaining.n || 1;
    const reasons: ReasonItems = [...rmap.entries()]
      .sort((x, y) => y[1].n - x[1].n)
      .map(([label, v]) => {
        const eq = [...v.raws].filter((x) => x.trim() !== '')
          .map((x) => `${L.fields.progress} = '${sq(x)}'`);
        if (label === 'Тодорхойгүй') eq.push(`${L.fields.progress} IS NULL`, `${L.fields.progress} = ''`);
        return {
          key: label,
          label,
          n: v.n,
          pct: Math.round((v.n / remN) * 100),
          area: Math.round(v.a / 100) / 100,
          color: PARCEL_PROGRESS_HUES[label] ?? '#94a3b8',
          // Шалтгаан нь зөвхөн ҮЛДСЭН талбарт хамаатай тул төлөвөөр хамт хязгаарлана
          where: `${L.fields.status}='Үлдсэн нэгж талбар' AND (${eq.join(' OR ')})`,
        };
      });
    return {
      left: {
        n: Number(lStat.n ?? 0),
        area: Number(lStat.area ?? 0),
        cleared: cleared.n,
        cleaned: cleaned.n,
        remaining: remaining.n,
        resolved: cleared.n + cleaned.n,
      },
      statusAreaBy,
      reasons,
      b: {
        n: Number(bStat.n ?? 0), area: Number(bStat.area ?? 0),
        value: Number(bStat.val ?? 0), floors: Number(bStat.fl ?? 0),
        unitPrice: Number(bStat.up ?? 0),
      },
      bType: toItems(bType, B.fields.type, 'n', 'барилга'),
      bMat: toItems(bMat, B.fields.material, 'n', 'барилга'),
      p: { n: Number(pStat.n ?? 0), area: Number(pStat.area ?? 0) },
      pRight: toItems(pRight, P.fields.right, 'n', 'нэгж'),
      pUse: toItems(pUse, P.fields.landuse, 'n', 'нэгж'),
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
        {/* Баганын толгой — баруунтай ИЖИЛ загвар, ӨӨР өнгө (ногоон = чөлөөлөлт) */}
        <h3 className={g.colHd} style={{ '--tone': '#16a34a' } as CSSProperties}>
          Төслийн талбайн чөлөөлөх нэгж талбар
        </h3>
        <section className={`${g.panel} ${g.panelPrimary}`} aria-label="Төслийн талбайн чөлөөлөх нэгж талбар">
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>Газар чөлөөлөлт</h3>
            <span className={g.panelNote}>{d ? `${num(d.left.remaining)} үлдсэн` : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.left.n > 0, d && (
              <>
                <Stats cols={2}>
                  <Stat value={num(d.left.n)} unit="талбар" label="Нийт нэгж талбар" />
                  <Stat value={ha(d.left.area)} unit="га" label="Нийт талбай" />
                  <Stat value={num(d.left.cleared)} unit="талбар" label="Бүрэн чөлөөлсөн" />
                  <Stat value={num(d.left.remaining)} unit="талбар" label="Үлдсэн" />
                </Stats>
                <div className={g.ringBox}>
                  <Ring value={pct} size={148} width={14} color="#16a34a" label="чөлөөлсөн" />
                  <p className={g.ringNote}>
                    <b className="num">{d ? num(d.left.resolved) : ''}</b> /{' '}
                    <span className="num">{d ? num(d.left.n) : ''}</span> талбар
                    <span className={g.ringSub}>бүрэн чөлөөлсөн + цэвэрлэсэн</span>
                  </p>
                </div>
                <p className={g.subHead}>Талбай (га) төлөвөөр</p>
                <Bars
                  items={d.statusAreaBy}
                  limit={3}
                  selected={flt?.grp === 'status' ? flt.key : null}
                  onSelect={(k) => pickFlt({
                    grp: 'status', key: k, label: `Төлөв: ${k}`,
                    where: `${PARCEL_LEFT.fields.status} = '${sq(k)}'`, only: ['land:left'],
                  })}
                />
                {d.reasons.length > 0 && (() => {
                  const selReason = flt?.grp === 'reason' ? flt.key : null;
                  const pickReason = (k: string) => {
                    const r = d.reasons.find((x) => x.key === k);
                    if (r) pickFlt({ grp: 'reason', key: k, label: `Шалтгаан: ${k}`, where: r.where, only: ['land:left'] });
                  };
                  return (
                  <>
                    {/* ГУРВАН график ХЭВЭЭР (тоо / хувь / талбай) — мөр бүрийн
                        тэмдэглэгээнд нэгж ба тоо ХАМТ (хэрэглэгчийн хүсэлт). */}
                    <p className={g.subHead}>
                      Үлдсэн {num(d.left.remaining)} талбарын шалтгаан
                      <span className={g.subNote}> · тоогоор</span>
                    </p>
                    <Bars
                      limit={8}
                      selected={selReason}
                      onSelect={pickReason}
                      items={d.reasons.map((r) => ({
                        key: r.key, label: r.label, value: r.n,
                        display: `${num(r.n)} талбар · ${r.pct}%`, color: r.color,
                      }))}
                    />
                    <p className={g.subHead}>Шалтгаан<span className={g.subNote}> · хувиар</span></p>
                    <Bars
                      limit={8}
                      max={100}
                      selected={selReason}
                      onSelect={pickReason}
                      items={d.reasons.map((r) => ({
                        key: r.key, label: r.label, value: r.pct,
                        display: `${r.pct}% · ${num(r.n)} талбар`, color: r.color,
                      }))}
                    />
                    <p className={g.subHead}>Шалтгаан<span className={g.subNote}> · талбайгаар (га)</span></p>
                    <Bars
                      limit={8}
                      selected={selReason}
                      onSelect={pickReason}
                      items={[...d.reasons]
                        .sort((a, b) => b.area - a.area)
                        .map((r) => ({
                          key: r.key, label: r.label, value: r.area,
                          display: `${num(r.area, 2)} га · ${num(r.n)} талбар`, color: r.color,
                        }))}
                    />
                  </>
                  );
                })()}
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

        {/* Чарт-шүүлтийн чип — дашбоардтай ижил, ×-ээр цуцлана */}
        {flt && (
          <div className={o.chipBar}>
            <div className={o.filterChip}>
              <span className={o.filterLabel}>{flt.label}</span>
              <button type="button" className={o.filterClear} onClick={() => pickFlt(flt)} aria-label="Цуцлах">×</button>
            </div>
          </div>
        )}
      </main>

      {/* ── БАРУУН: Барилга + Кадастр (нэгтгэсэн багана) ── */}
      <div className={g.right}>
        {/* Баганын толгой — зүүнтэй ИЖИЛ загвар, ӨӨР өнгө (цэнхэр = гаднах орчин) */}
        <h3 className={g.colHd} style={{ '--tone': '#0ea5e9' } as CSSProperties}>
          Төслийн талбайгаас гаднах нэгж талбар, барилга
        </h3>
        <section className={`${g.panel} ${g.panelOuter}`} aria-label="Барилга">
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
                  <Donut
                    items={d.bType} size={112} width={17} center={num(d.b.n)} centerLabel="барилга" stack
                    selected={flt?.grp === 'bType' ? flt.key : null}
                    onSelect={(k) => pickFlt({
                      grp: 'bType', key: k, label: `Барилга: ${k}`,
                      where: eqOrNull(GAZAR_BUILDING.fields.type, k), only: ['gazar:building'],
                    })}
                  />
                )}
                {d.bMat.length > 0 && (
                  <>
                    <p className={g.subHead}>Материалаар</p>
                    <Bars
                      items={d.bMat} inline limit={5}
                      selected={flt?.grp === 'bMat' ? flt.key : null}
                      onSelect={(k) => pickFlt({
                        grp: 'bMat', key: k, label: `Материал: ${k}`,
                        where: eqOrNull(GAZAR_BUILDING.fields.material, k), only: ['gazar:building'],
                      })}
                    />
                  </>
                )}
              </>
            ))}
          </div>
        </section>

        <section className={`${g.panel} ${g.panelOuter}`} aria-label="Кадастрын нэгж">
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
                  <Donut
                    items={d.pRight} size={112} width={17} center={num(d.p.n)} centerLabel="нэгж" stack
                    selected={flt?.grp === 'pRight' ? flt.key : null}
                    onSelect={(k) => pickFlt({
                      grp: 'pRight', key: k, label: `Эрх: ${k}`,
                      where: eqOrNull(GAZAR_PARCEL.fields.right, k), only: ['gazar:parcel'],
                    })}
                  />
                )}
                {d.pUse.length > 0 && (
                  <>
                    <p className={g.subHead}>Зориулалтаар</p>
                    <Bars
                      items={d.pUse} inline limit={5}
                      selected={flt?.grp === 'pUse' ? flt.key : null}
                      onSelect={(k) => pickFlt({
                        grp: 'pUse', key: k, label: `Зориулалт: ${k}`,
                        where: eqOrNull(GAZAR_PARCEL.fields.landuse, k), only: ['gazar:parcel'],
                      })}
                    />
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
