'use client';

import { useCallback, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Icon } from '@/components/Icon';
import { Stats, Stat, Donut, Bars, Ring, Empty, Loading } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import {
  queryStats, queryGroup, groups, count, sum, avg, type Aoi, type Row,
} from '@/lib/query';
import { GAZAR_BUILDING, GAZAR_PARCEL, PARCEL_LEFT } from '@/lib/services';
import { num, text, shades, CAT_LIGHT, NO_DATA } from '@/lib/format';
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

/** `Tuluv` төлөв → өнгө ба нэр (нэгтгэсэн үйлчилгээний гол ангилал).
 *  ⚠️ envhub: ӨНГӨ = УТГА. «Бүрэн чөлөөлсөн» нь жинхэнэ САЙН төлөв тул
 *  var(--good), «Үлдсэн» нь барилгад саад буй муу төлөв тул var(--bad),
 *  завсрын «Цэвэрлэсэн» нь төвийг сахисан өгөгдлийн өнгө var(--data).
 *  Урьдын чимэглэлийн hex (#22c55e/#0ea5e9/#e11d48) хасагдсан. */
const STATUS_META = [
  { value: tr('Бүрэн чөлөөлсөн'), label: tr('Бүрэн чөлөөлсөн'), color: 'var(--good)' },
  { value: tr('Цэвэрлэсэн нэгж талбар'), label: tr('Цэвэрлэсэн'), color: 'var(--data)' },
  { value: tr('Үлдсэн нэгж талбар'), label: tr('Үлдсэн'), color: 'var(--bad)' },
] as const;

/**
 * ⚠️ Статус баганыг ХАТУУ 3-аар БИШ, өгөгдлөөс ШУУД угсарна. Эх сервист
 * мэдэгдэж буй 3-аас ГАДНА төлөв (жишээ нь «Гэрээлсэн») эсвэл хоосон утга гарч
 * ирвэл тэдгээр талбарууд «Нийт»-д тоологдоод график дээр АЛГА болж, баганы
 * нийлбэр нийт дүнд хүрэхгүй байв. Эдгээр map нь мэдэгдэж буй төлөвүүдэд тогтмол
 * нэр/өнгө/дараалал өгч, бусдыг нь автоматаар доор нэмнэ — баганууд «Нийт»-тэй
 * ҮРГЭЛЖ тэнцэнэ (шинэ/устсан төлөвт өөрөө зохицно). */
const STATUS_ORDER: string[] = STATUS_META.map((m) => m.value);
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_META.map((m) => [m.value, m.label]));
const STATUS_COLOR: Record<string, string> = Object.fromEntries(STATUS_META.map((m) => [m.value, m.color]));

/** Donut-ийн зүсмэгийн палитр — ГАНЦ өгөгдлийн өнгөний (Сэлбэ teal) сүүдэр */
/**
 * ⚠️ envhub: өгөгдлийн ГАНЦ өнгө (var(--data)). Урьд нь энэ харагдацын НОГООН
 * identity-ийн (CAT_LIGHT[3]) уусгалт байсныг --data-гийн эх болох Сэлбэ teal
 * (CAT_LIGHT[0]) руу шилжүүлэв — Dashboard-ын `shade(ACCENT…)`-тэй ижил хэв.
 * Зүсмэгүүд утга ялгаагүй тул нэг өнгөний сүүдрээр (зөвхөн Donut-д) зааглагдана;
 * Bars нь бүр ганц var(--data)-гаар зурагдана.
 */
const PALETTE = shades(CAT_LIGHT[0], 10);

/** м² → га */
const ha = (m2: number) => num(m2 / 10_000, 2);

/** ₮ дүнг унших боломжтой нэгжээр — үнэлгээ их дүнтэй тул их наяд хүртэл */
const money = (v: number): { v: string; unit: string } =>
  v >= 1e12 ? { v: num(v / 1e12, 2), unit: tr('их наяд ₮') }
    : v >= 1e9 ? { v: num(v / 1e9, 2), unit: tr('тэрбум ₮') }
      : v >= 1e6 ? { v: num(v / 1e6, 1), unit: tr('сая ₮') }
        : { v: num(v, 0), unit: '₮' };

/** Бүлэглэсэн мөрүүд → диаграмын зүсмэгүүд (өнгө автоматаар, тоо НЭГЖТЭЙ) */
function toItems(rows: Row[], field: string, valueKey: string, unit = tr('ш')) {
  return groups(rows, field, tr('Тодорхойгүй'), [valueKey]).map((grp, i) => ({
    key: grp.label || `#${i}`,
    label: grp.label,
    value: grp.values[valueKey] ?? 0,
    display: `${num(grp.values[valueKey] ?? 0)} ${unit}`,
    color: PALETTE[i % PALETTE.length],
  }));
}

type StatusBars = { key: string; label: string; value: number; color: string; where: string }[];
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
  /** ⚠️ area устсан — test_data [96]-д area_m2 талбар байхгүй */
  b: { n: number; value: number; floors: number; unitPrice: number };
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
      // ⚠️ area_m2 талбар test_data [96]-д устсан тул талбайн нийлбэр асуухгүй
      queryStats(B.url, [
        count(B.oid, 'n'), sum(B.fields.value, 'val'),
        avg(B.fields.floors, 'fl'), avg(B.fields.unitPrice, 'up'),
      ], '1=1', area),
      queryGroup(B.url, B.fields.type, [count(B.oid, 'n')], '1=1', area),
      queryGroup(B.url, B.fields.material, [count(B.oid, 'n')], '1=1', area),
      queryStats(P.url, [count(P.oid, 'n'), sum(P.fields.area, 'area')], '1=1', area),
      queryGroup(P.url, P.fields.right, [count(P.oid, 'n')], '1=1', area),
      queryGroup(P.url, P.fields.landuse, [count(P.oid, 'n')], '1=1', area),
    ]);
    // ТӨЛӨВ бүрийг ӨГӨГДЛӨӨС нэгтгэнэ (арын зай арилгаж, хоосон/null = «Тодорхойгүй»).
    // Хатуу 3 биш тул нэг ч талбар графикаас гээгдэхгүй — баганууд «Нийт»-тэй тэнцэнэ.
    const smap = new Map<string, { n: number; a: number; raws: Set<string> }>();
    for (const r of lStatus) {
      const raw = String(r[L.fields.status] ?? ''); // түүхий утга — WHERE-д яг таарна
      let k = text(r[L.fields.status]).trim();
      if (!k || k === '—') k = tr('Тодорхойгүй');
      const cur = smap.get(k) ?? { n: 0, a: 0, raws: new Set<string>() };
      cur.n += Number(r.n ?? 0);
      cur.a += Number(r.a ?? 0);
      if (raw.trim() !== '') cur.raws.add(raw);
      smap.set(k, cur);
    }
    const st = (value: string) => smap.get(value) ?? { n: 0, a: 0, raws: new Set<string>() };
    const cleared = st(tr('Бүрэн чөлөөлсөн'));
    const cleaned = st(tr('Цэвэрлэсэн нэгж талбар'));
    const remaining = st(tr('Үлдсэн нэгж талбар'));
    // Мэдэгдэж буй 3 төлөв ЭХЭНД (тогтмол өнгө/дараалал), бусад нь тоогоор нь араас.
    const statusAreaBy: StatusBars = [...smap.entries()]
      .sort((x, y) => {
        const ox = STATUS_ORDER.indexOf(x[0]);
        const oy = STATUS_ORDER.indexOf(y[0]);
        if (ox !== -1 || oy !== -1) return (ox === -1 ? 99 : ox) - (oy === -1 ? 99 : oy);
        return y[1].n - x[1].n;
      })
      .map(([value, s]) => {
        const ha2 = Math.round(s.a / 100) / 100;
        // ⚠️ Дарж шүүхэд WHERE-ийг ТҮҮХИЙ утгуудаас (шалтгааны шүүлттэй ижил) угсарна:
        //    түлхүүр нь арын зай арилгасан хувилбар тул `Tuluv = '<trim>'` нь зай-мэдрэг
        //    сан дээр таарахгүй байж болзошгүй. Тодорхойгүй = NULL/хоосон.
        const eq = [...s.raws].filter((x) => x.trim() !== '')
          .map((x) => `${L.fields.status} = '${sq(x)}'`);
        const where = value === 'Тодорхойгүй'
          ? `(${L.fields.status} IS NULL OR ${L.fields.status} = '')`
          : eq.length ? `(${eq.join(' OR ')})` : `${L.fields.status} = '${sq(value)}'`;
        // Тоо ба нэгж (га) ХАМТ — «1,703 талбар · 78.08 га»
        return {
          key: value,
          label: STATUS_LABEL[value] ?? value,
          value: ha2,
          display: tr('{0} талбар · {1} га', num(s.n), num(ha2, 2)),
          // Гэнэтийн шинэ төлөв — утга нь үл мэдэгдэх тул төвийг сахисан өгөгдлийн өнгө
          color: STATUS_COLOR[value] ?? (value === 'Тодорхойгүй' ? NO_DATA : 'var(--data)'),
          where,
        };
      });
    // Шалтгааны нэрийг цэвэрлэж (арын зай, төгсгөлийн «.») нэгтгэнэ.
    // ⚠️ Түүхий утгуудыг мөн хадгална — дарж шүүхэд WHERE яг таарах ёстой.
    const rmap = new Map<string, { n: number; a: number; raws: Set<string> }>();
    for (const r of lReason) {
      const raw = String(r[L.fields.progress] ?? '');
      let k = text(r[L.fields.progress]).trim().replace(/\.$/, '').trim();
      if (!k || k === '—') k = tr('Тодорхойгүй');
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
          // ⚠️ envhub: шалтгаанууд бүгд «үлдсэн» бүлгийн ДОТООД ангилал — сайн/муу
          //    утга заахгүй тул ганц өгөгдлийн өнгө; «Тодорхойгүй» нь саарал бэх.
          //    (Урьдын PARCEL_PROGRESS_HUES солонго нь чимэглэл болж байсан.)
          color: label === 'Тодорхойгүй' ? NO_DATA : 'var(--data)',
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
        n: Number(bStat.n ?? 0),
        value: Number(bStat.val ?? 0), floors: Number(bStat.fl ?? 0),
        unitPrice: Number(bStat.up ?? 0),
      },
      bType: toItems(bType, B.fields.type, 'n', tr('барилга')),
      bMat: toItems(bMat, B.fields.material, 'n', tr('барилга')),
      p: { n: Number(pStat.n ?? 0), area: Number(pStat.area ?? 0) },
      pRight: toItems(pRight, P.fields.right, 'n', tr('нэгж')),
      pUse: toItems(pUse, P.fields.landuse, 'n', tr('нэгж')),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aoiKey]);

  const d = q.state === 'ready' ? q.data : null;
  const err = q.state === 'error';
  const pct = d && d.left.n ? (d.left.resolved / d.left.n) * 100 : null;

  /** Панелийн агуулгыг ачаалал/алдаа/хоосонтой хамт зурна */
  const guard = (ready: boolean, body: React.ReactNode) =>
    d ? (ready ? body : <Empty label={tr('Мэдээлэл алга')} />)
      : err ? <Empty label={tr('Алдаа гарлаа')} /> : <Loading label={tr('Татаж байна…')} />;

  return (
    <div className={g.frame}>
      {/* ── ЗҮҮН: Чөлөөлөлт (үлдсэн нэгж талбар) — үзүүлэлт + явц бүгд энд ── */}
      <div className={g.left}>
        {/* Баганын толгой — envhub eyebrow: өнгөгүй; багана нь БАЙРЛАЛААРАА ялгарна */}
        <h3 className={g.colHd}>
          {tr('Төслийн талбайн чөлөөлөх нэгж талбар')}
        </h3>
        <section className={`${g.panel} ${g.panelPrimary}`} aria-label={tr('Төслийн талбайн чөлөөлөх нэгж талбар')}>
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>{tr('Газар чөлөөлөлт')}</h3>
            <span className={g.panelNote}>{d ? tr('{0} үлдсэн', num(d.left.remaining)) : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.left.n > 0, d && (
              <>
                <Stats cols={2}>
                  <Stat value={num(d.left.n)} unit={tr('талбар')} label={tr('Нийт нэгж талбар')} />
                  <Stat value={ha(d.left.area)} unit={tr('га')} label={tr('Нийт талбай')} />
                  <Stat value={num(d.left.cleared)} unit={tr('талбар')} label={tr('Бүрэн чөлөөлсөн')} />
                  <Stat value={num(d.left.remaining)} unit={tr('талбар')} label={tr('Үлдсэн')} />
                </Stats>
                <div className={g.ringBox}>
                  {/* «Чөлөөлсөн» — жинхэнэ САЙН төлөв тул var(--good) (нүүрний ижил цагирагтай нэг өнгө) */}
                  <Ring value={pct} size={148} width={14} color="var(--good)" label={tr('чөлөөлсөн')} />
                  <p className={g.ringNote}>
                    <b className="num">{d ? num(d.left.resolved) : ''}</b> /{' '}
                    <span className="num">{d ? num(d.left.n) : ''}</span> {tr('талбар')}
                    <span className={g.ringSub}>{tr('бүрэн чөлөөлсөн + цэвэрлэсэн')}</span>
                  </p>
                </div>
                <p className={g.subHead}>{tr('Талбай (га) төлөвөөр')}</p>
                {/* limit БАЙХГҮЙ — бүх төлөв харагдаж, баганы нийлбэр «Нийт»-тэй тэнцэнэ */}
                <Bars
                  items={d.statusAreaBy}
                  selected={flt?.grp === 'status' ? flt.key : null}
                  onSelect={(k) => {
                    // Шалтгааны шүүлттэй ижил — item-ийн урьдчилан угсарсан (түүхий утгат) WHERE-ийг авна
                    const it = d.statusAreaBy.find((x) => x.key === k);
                    if (it) pickFlt({ grp: 'status', key: k, label: tr('Төлөв: {0}', k), where: it.where, only: ['land:left'] });
                  }}
                />
                {d.reasons.length > 0 && (() => {
                  const selReason = flt?.grp === 'reason' ? flt.key : null;
                  const pickReason = (k: string) => {
                    const r = d.reasons.find((x) => x.key === k);
                    if (r) pickFlt({ grp: 'reason', key: k, label: tr('Шалтгаан: {0}', k), where: r.where, only: ['land:left'] });
                  };
                  return (
                  <>
                    {/* ГУРВАН график ХЭВЭЭР (тоо / хувь / талбай) — мөр бүрийн
                        тэмдэглэгээнд нэгж ба тоо ХАМТ (хэрэглэгчийн хүсэлт). */}
                    <p className={g.subHead}>
                      {tr('Үлдсэн')} {num(d.left.remaining)} {tr('талбарын шалтгаан')}
                      <span className={g.subNote}> {tr('· тоогоор')}</span>
                    </p>
                    <Bars
                      limit={8}
                      selected={selReason}
                      onSelect={pickReason}
                      items={d.reasons.map((r) => ({
                        key: r.key, label: r.label, value: r.n,
                        display: tr('{0} талбар · {1}%', num(r.n), r.pct), color: r.color,
                      }))}
                    />
                    <p className={g.subHead}>{tr('Шалтгаан')}<span className={g.subNote}> {tr('· хувиар')}</span></p>
                    <Bars
                      limit={8}
                      max={100}
                      selected={selReason}
                      onSelect={pickReason}
                      items={d.reasons.map((r) => ({
                        key: r.key, label: r.label, value: r.pct,
                        display: tr('{0}% · {1} талбар', r.pct, num(r.n)), color: r.color,
                      }))}
                    />
                    <p className={g.subHead}>{tr('Шалтгаан')}<span className={g.subNote}> {tr('· талбайгаар (га)')}</span></p>
                    <Bars
                      limit={8}
                      selected={selReason}
                      onSelect={pickReason}
                      items={[...d.reasons]
                        .sort((a, b) => b.area - a.area)
                        .map((r) => ({
                          key: r.key, label: r.label, value: r.area,
                          display: tr('{0} га · {1} талбар', num(r.area, 2), num(r.n)), color: r.color,
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
          <div className={g.dims} role="group" aria-label={tr('Газрын зургийн харагдац')}>
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
            title={dim !== '2d' ? tr('Полигоныг зөвхөн 2D дээр зурна') : tr('Газар дээр полигон зурах')}
          >
            <span className={g.drawIcon} aria-hidden><Icon name="polygon" size={15} /></span>
            {aoi ? tr('Дахин зурах') : tr('Полигон зурах')}
          </button>
          {aoi && (
            <button type="button" className={g.clearBtn} onClick={clear}>
              {tr('Цэвэрлэх')}
            </button>
          )}
        </div>

        <div className={`${g.scope} ${aoi ? g.scopeSel : ''}`}>
          <span className={g.scopeDot} aria-hidden />
          <span className={g.scopeText}>{aoi ? tr('Сонгосон талбай') : tr('Бүх талбай')}</span>
          <span className={g.scopeHint}>{aoi ? tr('полигоноор шүүсэн') : tr('полигон зурж шүүнэ')}</span>
        </div>

        {/* Чарт-шүүлтийн чип — дашбоардтай ижил, ×-ээр цуцлана */}
        {flt && (
          <div className={o.chipBar}>
            <div className={o.filterChip}>
              <span className={o.filterLabel}>{flt.label}</span>
              <button type="button" className={o.filterClear} onClick={() => pickFlt(flt)} aria-label={tr('Цуцлах')}>×</button>
            </div>
          </div>
        )}
      </main>

      {/* ── БАРУУН: Барилга + Кадастр (нэгтгэсэн багана) ── */}
      <div className={g.right}>
        {/* Баганын толгой — зүүнтэй ЯГ ижил envhub eyebrow (өнгөт identity байхгүй) */}
        <h3 className={g.colHd}>
          {tr('Төслийн талбайгаас гаднах нэгж талбар, барилга')}
        </h3>
        <section className={`${g.panel} ${g.panelOuter}`} aria-label={tr('Барилга')}>
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>{tr('Барилга')}</h3>
            <span className={g.panelNote}>{d ? tr('{0} барилга', num(d.b.n)) : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.b.n > 0, d && (
              <>
                {/* «Талбай» stat 2026-08-13-нд хасагдав — area_m2 талбар test_data-д алга */}
                <Stats cols={2}>
                  <Stat value={num(d.b.n)} unit={tr('барилга')} label={tr('Тоо')} />
                  <Stat value={money(d.b.value).v} unit={money(d.b.value).unit} label={tr('Нийт үнэлгээ')} />
                  <Stat value={d.b.floors ? num(d.b.floors, 1) : '—'} unit={tr('давхар')} label={tr('Дундаж өндөр')} />
                  <Stat value={d.b.unitPrice ? money(d.b.unitPrice).v : '—'} unit={d.b.unitPrice ? tr('{0}/м²', money(d.b.unitPrice).unit) : ''} label={tr('Дундаж м² үнэ')} />
                </Stats>
                {d.bType.length > 0 && (
                  <Donut
                    items={d.bType} size={112} width={17} center={num(d.b.n)} centerLabel={tr('барилга')} stack
                    selected={flt?.grp === 'bType' ? flt.key : null}
                    onSelect={(k) => pickFlt({
                      grp: 'bType', key: k, label: tr('Барилга: {0}', k),
                      where: eqOrNull(GAZAR_BUILDING.fields.type, k), only: ['gazar:building'],
                    })}
                  />
                )}
                {d.bMat.length > 0 && (
                  <>
                    <p className={g.subHead}>{tr('Материалаар')}</p>
                    {/* envhub: Bars нь ГАНЦ өгөгдлийн өнгөөр — ялгааг дараалал, хэмжээ өгнө */}
                    <Bars
                      items={d.bMat.map((x) => ({ ...x, color: 'var(--data)' }))} inline limit={5}
                      selected={flt?.grp === 'bMat' ? flt.key : null}
                      onSelect={(k) => pickFlt({
                        grp: 'bMat', key: k, label: tr('Материал: {0}', k),
                        where: eqOrNull(GAZAR_BUILDING.fields.material, k), only: ['gazar:building'],
                      })}
                    />
                  </>
                )}
              </>
            ))}
          </div>
        </section>

        <section className={`${g.panel} ${g.panelOuter}`} aria-label={tr('Кадастрын нэгж')}>
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>{tr('Кадастрын нэгж')}</h3>
            <span className={g.panelNote}>{d ? tr('{0} нэгж', num(d.p.n)) : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.p.n > 0, d && (
              <>
                <Stats cols={2}>
                  <Stat value={num(d.p.n)} unit={tr('нэгж')} label={tr('Нэгжийн тоо')} />
                  <Stat value={ha(d.p.area)} unit={tr('га')} label={tr('Талбай')} />
                </Stats>
                {d.pRight.length > 0 && (
                  <Donut
                    items={d.pRight} size={112} width={17} center={num(d.p.n)} centerLabel={tr('нэгж')} stack
                    selected={flt?.grp === 'pRight' ? flt.key : null}
                    onSelect={(k) => pickFlt({
                      grp: 'pRight', key: k, label: tr('Эрх: {0}', k),
                      where: eqOrNull(GAZAR_PARCEL.fields.right, k), only: ['gazar:parcel'],
                    })}
                  />
                )}
                {d.pUse.length > 0 && (
                  <>
                    <p className={g.subHead}>{tr('Зориулалтаар')}</p>
                    {/* envhub: Bars нь ГАНЦ өгөгдлийн өнгөөр — ялгааг дараалал, хэмжээ өгнө */}
                    <Bars
                      items={d.pUse.map((x) => ({ ...x, color: 'var(--data)' }))} inline limit={5}
                      selected={flt?.grp === 'pUse' ? flt.key : null}
                      onSelect={(k) => pickFlt({
                        grp: 'pUse', key: k, label: tr('Зориулалт: {0}', k),
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
