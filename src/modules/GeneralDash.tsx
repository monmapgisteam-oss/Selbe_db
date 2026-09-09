'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { Section, Stats, Stat, Data, Empty, Bars, monotonePath, TIP_RULE } from '@/components/ui';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useAsync } from '@/lib/useAsync';
import { usePlanTotals, qtyText } from '@/lib/totals';
import { loadLandStatus } from '@/lib/land';
import { loadPkgProgress, latestPkgProgress } from '@/lib/live';
import { loadNegtgelFull } from '@/lib/negtgel';
/* ⚠️ Модулиас модуль руу импорт: «Багцын гүйцэтгэл» хуудасны ЯГ ТЭР
   тооцоог давтахгүй, ТҮҮНИЙГ дуудна (`Dashboard.tsx` ч ижлээр). */
import { loadFinData } from '@/modules/Finance';
import { aggregateMonths } from '@/modules/PkgProg';
import { overlapLeftParcels } from '@/lib/parcelOverlap';
import { loadPkgOverlaps } from '@/lib/pkgSaad';
import {
  /* ⚠️ `PKG_BY_FAMILY` нь ЗӨВХӨН «Ерөнхий төлөвлөгөө» картын шугам
     сүлжээний нийлбэр уртад хэрэглэгдэнэ — газар чөлөөлөлтийн давхцал нь
     2026-09-04-нд гэр бүлээс ДЭД БАГЦ руу шилжсэн. */
  PKG_BY_FAMILY, BUILDING, LAYER_BY_ID, PARCEL_LEFT, ZONE_FIELD, ZONE_NONE, type PkgFamily,
} from '@/lib/services';
import { queryStats, count } from '@/lib/query';
import { cat, mnt, num, pct } from '@/lib/format';
import {
  loadGdashCf, loadContractSum, loadHseNow, loadReasonOids, loadSubPkgLayers,
  loadCfPlan, cashflowCurve,
  chartTypeCost, chartSourceMerged, chartNoteAmount, xMatch,
  type XDim,
  grainOf, kpisOf, inPeriod, yearsOf, periodActive, activeSubPkgTypes,
  type Grain,
  NO_PERIOD, CONTRACTED,
  type CfRow, type Period, type SubBar, type SubPkg, type TimePoint,
} from '@/lib/gdash';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import g from './generalDash.module.css';

/**
 * ЕРӨНХИЙ ДАШБОАРД — ТӨСЛИЙН НЭГ ХУУДАС ДЭЭРХ ТОЙМ.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Жил · Улирал · Сар — БҮХ картад нэгэн зэрэг үйлчилнэ     │
 *   ├────────────┬──────────────────────────┬──────────────────┤
 *   │ САНХҮҮ     │ индикаторын зурвас       │ ХАБ              │
 *   │ 4 чарт     │ ГАЗРЫН ЗУРАГ (2D/3D/BIM) │ ГАЗАР ЧӨЛӨӨЛӨЛТ  │
 *   │            │ S-МУРУЙ                  │ ЕРӨНХИЙ ТӨЛӨВЛ.  │
 *   └────────────┴──────────────────────────┴──────────────────┘
 *
 * ⚠️ ЭНЭ НЬ «Төслийн дэлгэрэнгүй мэдээлэл» (`Dashboard.tsx`)-ЫГ ОРЛОХГҮЙ.
 * Тэр нь 9 дэд хэсэгт задардаг СУДЛАХ хэрэгсэл; энэ нь нэг дэлгэцэд багтдаг,
 * задрахгүй ТОЙМ. Хоёулаа `standalone` харагдац бөгөөд `MapCanvas`-аа
 * хуваалцана.
 *
 * ⚠️ ХУГАЦААНЫ ШҮҮЛТ нь ЗӨВХӨН cashflow-д тулгуурласан картуудад (зүүн 4 чарт,
 * S-муруй, индикатор) үйлчилнэ. ХАБ, газар чөлөөлөлт, ерөнхий төлөвлөгөө нь
 * ажлын төлөвлөгөөт хугацааны талбаргүй тул тэднийг хуурамчаар шүүхгүй —
 * картын толгойд «Бүх хугацаа» гэж ИЛ бичнэ.
 */
export function GeneralDash({
  dim, setDim, zone, setZone,
}: {
  dim: Dim;
  setDim: (d: Dim) => void;
  zone: string | null;
  setZone: (z: string | null) => void;
}) {
  const [period, setPeriod] = useState<Period>(NO_PERIOD);
  const [layerOpen, setLayerOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [layerSel, setLayerSel] = useState<string | null>(null);
  /**
   * ЗУРГИЙН УДИРДЛАГЫГ ХУРААХ — ХОЁР ТУСДАА (2026-09-04, хэрэглэгчийн хүсэлт:
   * «2D 3D товчийг ДЭЭШЭЭ хураа, давхарга ба тунгалагийг ЗҮҮН тийш хугална,
   * сум харагдана — яг header шиг»).
   *
   * ⚠️ Нэг товчоор ХОЁУЛАНГ нь хураадаг байсныг САЛГАВ: тэдгээр нь зургийн
   * өөр өөр буланд, өөр хэрэгцээтэй. 2D/3D/BIM-ийг ховор сольдог тул байнга
   * хураалттай байлгамаар; давхаргын жагсаалт эсрэгээрээ ажлын хэрэгсэл.
   *
   * ⚠️ Хураах товч нь ӨӨРӨӨ ХЭЗЭЭ Ч нуугдахгүй — эс бөгөөс буцааж нээх зам
   * үлдэхгүй. Тиймээс сум нь хураасан ч байрандаа үлдэж, чиглэлээ л сольдог.
   */
  /* ⚠️ АНХДАГЧААР ХУРААЛТТАЙ (2026-09-04, хэрэглэгчийн шийдвэр: «ингээд hide
     хийсэн, нээгээд харна, бусад үед hide»). Энэ дашбоардын зураг нь гурван
     баганын дунд, доор нь S-муруйтай тул талбай нь хомс — удирдлага нь
     хэрэгтэй агшинд нь л гарч ирнэ. */
  const [toolsOn, setToolsOn] = useState(false);
  const [dimsOn, setDimsOn] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  /**
   * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН ШҮҮЛТ — сонгосон шалтгааны нэгж талбарууд.
   *
   * ⚠️ ЗУМ ХАНГАЛТГҮЙ: «дүйцүүлсэн» дээр дарахад 3 талбар руу ойртдог ч бусад
   * 2,085 талбар нь дэлгэц дүүрэн хэвээр үлдэж, аль гурав нь болох нь
   * ялгагдахгүй байв (хэрэглэгчийн шүүмж, 2026-09-06). Тиймээс
   * `definitionExpression`-ээр бусдыг нь БҮРМӨСӨН хасна.
   */
  const [parcelWhere, setParcelWhere] = useState<string | null>(null);

  /**
   * ХАЖУУГИЙН ХОЁР БАГАНЫГ ЧИРЖ ӨРГӨСГӨНӨ — «Төслийн дэлгэрэнгүй мэдээлэл»,
   * «Багцын гүйцэтгэл» хоёртой ИЖИЛ механизм (`--side-l` / `--side-r`).
   *
   * ⚠️ Өргөнийг `localStorage`-д түлхүүрээрээ санана; давхар товшвол анхны
   * (дэлгэцийн хэмжээнээс хамаарсан) утгад буцна.
   */
  const side = useSideResize('gdash');

  /* Газрын зургийн API — дэд багц дарахад тэр давхарга руу ойртуулна */
  const map = useMap();

  /* Суурь давхарга — бүс ба ерөнхий төлөвлөгөөний барилга (дэлгэрэнгүй
     дашбоардтай ижил эхлэл). Каталогоос нэмсэн нь `useLayerPicks`-д үлдэнэ. */
  const base = useMemo(() => ['zone', 'et:24'], []);
  const [visible, setVisible] = useLayerPicks(base);

  const totals = usePlanTotals(zone, true);
  const cf = useAsync(loadGdashCf, []);
  /**
   * САРЫН ТӨЛӨВЛӨГӨӨ — S-муруйн нарийвчлал.
   *
   * ⚠️ ХООСОН байж БОЛНО (хүн хараахан бөглөөгүй) — тэр үед муруй хуучин
   * ЖИГД ТАРААХ аргаараа зурагдана. Тиймээс энэ ачаалалт унасан ч дашбоард
   * бүтэн ажиллах ёстой: алдааг ЗУРАХГҮЙ, зүгээр л хоосон жагсаалт болно.
   */
  /**
   * ЧАРТЫН ХӨНДЛӨН ШҮҮЛТ — БҮРХҮҮЛИЙН төлөв.
   *
   * ⚠️ ЭНД байх ёстой, `FinCharts` дотор БИШ: сонголт нь чартуудад ч,
   * ДЭЭД ТАЛЫН ИНДИКАТОРУУДАД ч үйлчилнэ. Урьд нь чартын дотор байсан тул
   * «Барилга угсралт»-ыг дарахад чартууд нарийсаж, атлаа «Нийт төсөв»
   * хэвээр үлдэж, хоёр зүйл зөрчилдөж харагддаг байв.
   */
  const [xs, setXs] = useState<{ dim: XDim; key: string } | null>(null);
  /**
   * БАРИЛГА УГСРАЛТЫН ОБЪЁМООР бодогдсон гүйцэтгэл — багц → % (0–100).
   *
   * ⚠️ «Гүйцэтгэл бөглөх» хэсгийн эх сурвалж. Барилга угсралтын ажилд
   * санхүүжсэн хувийг БИШ ҮҮНИЙГ авна (`chartTypeCount`-ийн тайлбарыг үз).
   * ⚠️ Ачаалагдаж дуустал ХООСОН — тэр үед чарт хуучин эх сурвалжаараа
   * зурагдана, алдаа заахгүй.
   */
  const pkgProg = useAsync(loadPkgProgress, []);
  const pkgPct = useMemo(() => {
    const m = new Map<string, number>();
    if (pkgProg.state !== 'ready') return m;
    for (const r of latestPkgProgress(pkgProg.data)) {
      /* ⚠️ `null` ≠ 0 — хэмжилтгүй багц газрын зурагт ч, чартад ч
         «бөглөөгүй» хэвээр үлдэх ёстой. */
      if (r.actual != null) m.set(r.key, r.actual);
    }
    return m;
  }, [pkgProg]);
  /**
   * ОРОН СУУЦНЫ ХОРООЛЛЫН БИЕТ ГҮЙЦЭТГЭЛ — «Багцын гүйцэтгэл» хуудасны
   * «бодит гүйцэтгэлийн хувь» ЯГ ТЭР тоо (2026-09-10, хэрэглэгчийн заавар).
   *
   * ⚠️ Багц бүрийг БЛОКИЙНХ НЬ ТООГООР жигнэсэн биет хувь; одоогийн сар
   * хүртэлх СҮҮЛИЙН хэмжилт. Ирээдүйн сарыг алгасана — хэмжигдээгүй сар
   * `null` буцаадаг тул тэдгээр нь дунджийг татахгүй.
   * ⚠️ Уначихвал бүхэл чарт унах ёсгүй: `null` үед мөр тус бүрийн
   * тооцоо (объём/санхүүжсэн) хэвээр ажиллана.
   */
  const finD = useAsync(loadFinData, []);
  const catPct = useMemo(() => {
    const m = new Map<string, number>();
    if (finD.state !== 'ready') return m;
    const now = new Date().toISOString().slice(0, 7);
    let last: number | null = null;
    for (const mo of aggregateMonths(finD.data)) {
      if (mo.label > now) continue;
      if (mo.phys != null) last = mo.phys;
    }
    if (last != null) m.set('ОРОН СУУЦНЫ ХОРООЛОЛ', last);
    return m;
  }, [finD]);

  const cfPlan = useAsync(loadCfPlan, []);
  /**
   * САРЫН МӨНГӨН ХУВААРИЛАЛТ — `Cashflow_dun`-ийн нийлбэр сараар.
   * ⚠️ Хугацааны шүүлт ба нарийвчлал нь бусад чарттай ИЖИЛ эхээс
   * (`period`, `grainOf`) — тусад нь тохируулбал хоёр зураг зөрнө.
   */
  /**
   * CASHFLOW-ИЙН S-МУРУЙ — багана нь сарын мөнгө, муруй нь хуримтлагдсан хувь.
   * ⚠️ Хуваарь нь БҮХ ажлын ХО дүн (`cashflowCurve`-ийн тайлбарыг үз).
   */
  const cfTotal = useMemo(
    () => (cf.state === 'ready' ? cf.data.reduce((a, r) => a + r.cost, 0) : 0),
    [cf],
  );
  const cfCurve = useMemo(
    () => cashflowCurve(cfPlan.data ?? [], cfTotal, grainOf(period), period),
    [cfPlan.data, cfTotal, period],
  );
  /* ⚠️ ТУСДАА сэлгүүр: хоёр чарт өөр өөр асуултад хариулдаг тул нэгийг
     хүснэгтээр харах нь нөгөөг ч сэлгэх ёсгүй. */
  const [cfMode, setCfMode] = useState<'chart' | 'table'>('chart');

  /**
   * ШҮҮЛТЭД БАГТСАН дэд багц → ажлын төрлүүд.
   *
   * ⚠️ Баруун баганын хоёр карт (`LandCard`-ын «Ажлын төрлөөр давхцаж буй»,
   * `SaadCard`) нь cashflow дээр тулгуурладаг тул хугацааны шүүлтийг ДАГАХ
   * ёстой. Урьд нь тэдгээр нь өөрсдийн кэшлэгдсэн бүтэн жагсаалтаас уншдаг
   * байсан тул шүүлт тавихад ч БҮГД харагдсаар байв (хэрэглэгчийн шүүмж,
   * 2026-09-06).
   *
   * ⚠️ Шүүлт идэвхгүй үед энэ нь БҮХ мөрөөс угсрагдана — өөрөөр хэлбэл
   * жагсаалт бүрэн хэвээр. Тусдаа «шүүлттэй юу» салаа хэрэггүй.
   */
  const active = useMemo(
    () => (cf.state === 'ready'
      ? activeSubPkgTypes(cf.data.filter((r) => inPeriod(r, period)))
      : null),
    [cf, period],
  );
  /**
   * СОНГОСОН ШАЛТГААН — БҮРХҮҮЛД (2026-09-07).
   *
   * ⚠️ Урьд нь `LandCard` дотор байсан тул «Саад — багцаар» карт түүнийг
   * ХАРАХГҮЙ байв. Хэрэглэгчийн шаардлага: «зөвшилцүх» дарахад ГУРВУУЛАА
   * дагана — газрын зураг тэр нэгж талбаруудаар шүүгдэнэ, саадын жагсаалт
   * зөвхөн ТЭР талбаруудтай огтлолцсон багцыг үзүүлнэ. Гурван байрлалд
   * тархсан төлөв нь нэг эх сурвалжтай байх ёстой.
   */
  const [reason, setReason] = useState<string | null>(null);
  const byReason = useAsync(loadReasonOids, []);
  /** Сонгосон шалтгаанд ногдох нэгж талбарын OID-ууд; `null` = сонгоогүй */
  const reasonOids = useMemo(
    () => (reason != null && byReason.state === 'ready'
      ? byReason.data.get(reason) ?? null
      : null),
    [reason, byReason],
  );

  /**
   * Шалтгаан сонгох — төлөв, газрын зураг, саадын жагсаалт ГУРВУУЛАА дагана.
   *
   * ⚠️ OID-оор (`FID IN (…)`) шүүнэ, шалтгааны ТЕКСТЭЭР биш: жагсаалтын шошго
   * нь `cleanReason`-оор цэвэрлэгдсэн (арын зай, төгсгөлийн «.» хасагдсан) тул
   * түүхий утгатай үргэлж таарахгүй — SQL нь чимээгүй 0 мөр буцаана.
   */
  /**
   * Шалтгааны өмнөх давхаргын сонголт — цуцлахад БУЦААНА.
   *
   * ⚠️ `useRef`: сэргээх утга нь рендерт нөлөөлөхгүй, зөвхөн дараагийн
   * үйлдэлд хэрэгтэй. Төлөв болговол давхаргын жагсаалт солигдох бүрд дэмий
   * дахин зурагдана.
   */
  const beforeReason = useRef<string[] | null>(null);
  /** «Тулгамдаж буй асуудал»-аас багц асаахын ӨМНӨХ давхаргын сонголт */
  const beforePkg = useRef<string[] | null>(null);
  /**
   * «Ажлын төрлөөр давхцаж буй»-г дарахаас ӨМНӨХ давхаргын төлөв.
   * ⚠️ Тайлахад ЯГ ТҮҮНИЙГ сэргээнэ — зөвхөн нэмсэн давхаргаа хасвал
   * хэрэглэгчийн өөрийн асаасан давхарга ч хамт унтарч болно.
   */
  const beforeType = useRef<string[] | null>(null);

  const pickReason = useCallback((k: string) => {
    const next = k === reason ? null : k;
    setReason(next);

    /* ⚠️ «Ажлын төрлөөр давхцаж буй»-гийн сонголт шалтгаанаас ХАМААРНА:
       шалтгаан солигдоход түүний мөрүүд өөр болох тул асаасан давхаргыг
       буцаана. Эс бөгөөс хуучин төрлийн давхарга шинэ шалтгааны дор
       хамааралгүй үлдэнэ. */
    if (beforeType.current) {
      setVisible(beforeType.current);
      beforeType.current = null;
    }

    /* ЦУЦЛАХ — шүүлт ба давхаргын сонголт хоёуланг нь буцаана */
    if (next == null) {
      setParcelWhere(null);
      if (beforeReason.current) {
        setVisible(beforeReason.current);
        beforeReason.current = null;
      }
      return;
    }

    const oids = byReason.state === 'ready' ? byReason.data.get(next) : null;
    if (!oids || oids.size === 0) { setParcelWhere(null); return; }

    /*
     * ⚠️ ХОЛБООГҮЙ ДАВХАРГЫГ НУУНА (2026-09-07, хэрэглэгчийн шаардлага).
     * Урьд нь нэгж талбар шүүгдэх боловч бүс, ерөнхий төлөвлөгөө, өмнө нь
     * асаасан багцын давхаргууд бүгд ил үлдэж, шүүгдсэн 3 талбар тэдний
     * дунд алга болдог байв. Одоо ЗӨВХӨН нэгж талбар үлдэж, хэрэглэгч
     * жагсаалтаас багц дарвал тэр давхарга НЭМЭГДЭНЭ.
     *
     * ⚠️ Өмнөх сонголтыг НЭГ Л УДАА тогтоож авна: шалтгаанаас шалтгаан руу
     * шилжихэд дахин бичвэл «зөвхөн нэгж талбар» гэсэн завсрын төлөв
     * сэргээх цэг болж хоцорно.
     */
    if (beforeReason.current == null) beforeReason.current = visible;
    /* ⚠️ Багцын сэргээх цэгийг ХҮЧИНГҮЙ болгоно: шалтгаан солигдоход тэр нь
       өөр шалтгааны давхаргын жагсаалт руу заасан хуучин утга болно. */
    beforePkg.current = null;
    setVisible([PARCEL_LAYER]);

    const where = `${PARCEL_LEFT.oid} IN (${[...oids].join(',')})`;
    setParcelWhere(where);
    map.zoomToWhere(PARCEL_LAYER, where);
  }, [byReason, map, reason, setVisible, visible]);

  /* ⚠️ Шүүлт ИДЭВХГҮЙ бол `null` — `SaadCard`-ийн `keys` тайлбарыг үз */
  const activeKeys = useMemo(
    () => (periodActive(period) && active ? new Set(active.keys()) : null),
    [period, active],
  );

  const contracts = useAsync(loadContractSum, []);
  /* ⚠️ Багцын нэгтгэлээс гүйцэтгэл татахаа БОЛИВ (2026-09-04): `Cashflow_0904`
     дээр `Guitsetgel_huwi` бүрэн бөглөгдсөн тул мөр бүр өөрийн хувьтай.
     Нэгтгэлээр холбоход 26 багцаас 2 нь л таардаг байв. */

  /**
   * Зураг дээр бүс дарахад ТУХАЙН бүс рүү шүүнэ — дэлгэрэнгүй дашбоардтай
   * ижил зан төлөв. ⚠️ `ZONE_NONE` («мэдээлэл байхгүй») нь бүс БИШ тул
   * сонголт болгохгүй: сонговол бүх карт хоосорч, буцаах товч нь өөрөө
   * харагдахгүй болно.
   */
  const pick = useCallback((attrs: Record<string, unknown> | null) => {
    if (!attrs) return;
    const zid = String(attrs[ZONE_FIELD] ?? '').trim();
    if (zid && zid !== ZONE_NONE.trim()) setZone(zid);
  }, [setZone]);

  return (
    <div className={g.shell}>
      {/*
        * ⚠️ ЧИРЭХ БАРИУЛ НЬ ЭНЭ ДОТОР, `shell`-д БИШ. `SplitGrip` нь
        * `top: 0; bottom: 0`-оор эцгийгээ БҮТНЭЭР дамнадаг тул бүрхүүлд
        * тавибал шүүлтийн зурвасны дээгүүр гарч, түүний товчнуудыг халхалж
        * байв. Гурван баганыг тусдаа торонд боосноор бариул зөвхөн багануудын
        * өндрийг эзэлнэ.
        */}
      <div
        ref={side.hostRef}
        className={`${g.body} ${side.hostClass}`}
        style={side.style}
      >
        <SplitGrip {...side.left} />
        <SplitGrip {...side.right} />

      <aside className={g.left}>
        <Data q={cf} minH={520}>
          {(rows) => <FinCharts rows={rows} period={period} xs={xs} setXs={setXs} pkgPct={pkgPct} catPct={catPct} />}
        </Data>
      </aside>

      <main className={g.center}>
        {/*
          * ⚠️ ШҮҮЛТ нь ИНДИКАТОРЫН ДЭЭР (2026-09-07, хэрэглэгчийн заавар).
          * Богино хугацаанд зургийн дээр байрлуулж үзээд буцав: тэнд гурван
          * бүлгийн бүх утга (6 жил + 4 улирал + 12 сар) багтахгүй, зургийн
          * өөрийн удирдлагатай ч давхцаж байлаа.
          */}
        <PeriodBar
          period={period}
          setPeriod={setPeriod}
          years={cf.state === 'ready' ? yearsOf(cf.data) : []}
        />
        <Data q={cf} minH={72}>
          {(rows) => (
            <KpiStrip
              rows={rows}
              period={period}
              /* ⚠️ Чартын сонголт — индикатор ч ТҮҮГЭЭР нарийсна */
              xs={xs}
              contracts={contracts.state === 'ready' ? contracts.data : null}
            />
          )}
        </Data>

        {/* ⚠️ Хураалтыг `data-*`-ААР дамжуулна: `MapTools` нь ХУВААЛЦСАН
            бүрэлдэхүүн бөгөөд хоёр хэсгээ нэг зэрэг зурдаг тул JSX-ээс
            тусад нь салгах боломжгүй. Глобал нэрсээр (§ЗУРГИЙН ДЭЭРХ
            ТОВЧНУУД) энэ харагдацад л нуугдана. */}
        <div className={g.hero} data-tools={toolsOn ? '1' : '0'} data-dims={dimsOn ? '1' : '0'}>
          <MapCanvas
            dim={dim}
            visible={visible}
            opacity={opacity}
            zone={zone}
            layerWhere={{ [PARCEL_LAYER]: parcelWhere }}
            uniform
            onPick={pick}
          />

          {/* Дээш хураах — 2D/3D/BIM зурвас (зургийн дээд төвд) */}
          <button
            type="button"
            aria-expanded={dimsOn}
            className={`${g.mapTab} ${g.dimsTab} ${dimsOn ? g.dimsTabOpen : ''}`}
            title={dimsOn ? tr('Харагдацын товч хураах') : tr('Харагдацын товч дэлгэх')}
            aria-label={dimsOn ? tr('Харагдацын товч хураах') : tr('Харагдацын товч дэлгэх')}
            onClick={() => setDimsOn((v) => !v)}
          >
            {dimsOn ? '▴' : '▾'}
          </button>

          {/* Зүүн тийш хугалах — давхарга · тунгалаг · бүс */}
          <button
            type="button"
            aria-expanded={toolsOn}
            className={`${g.mapTab} ${g.toolsTab} ${toolsOn ? g.toolsTabOpen : ''}`}
            title={toolsOn ? tr('Товчнуудыг хураах') : tr('Товчнуудыг харуулах')}
            aria-label={toolsOn ? tr('Товчнуудыг хураах') : tr('Товчнуудыг харуулах')}
            onClick={() => setToolsOn((v) => !v)}
          >
            {toolsOn ? '‹' : '›'}
          </button>

          <MapTools
            dim={dim}
            setDim={setDim}
            layersOpen={layerOpen}
            onLayers={() => setLayerOpen((v) => !v)}
            opacityOpen={opOpen}
            onOpacity={() => setOpOpen((v) => !v)}
            zone={zone}
            setZone={setZone}
          />
          {toolsOn && opOpen && (
            <OpacityPanel
              visible={visible}
              opacity={opacity}
              setOpacity={setOpacity}
              onClose={() => setOpOpen(false)}
            />
          )}
          {toolsOn && layerOpen && (
            <div className={g.catPanel}>
              <LayerCatalog
                view="plan"
                totals={totals}
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
        </div>

        <div className={g.curve}>
        {/*
          * CASHFLOW — САРЫН S-МУРУЙ.
          *
          * ⚠️ ХУУЧИН «Хөрөнгө оруулалтын гүйцэтгэл» муруй ЭНДЭЭС ХАСАГДСАН
          * (2026-09-10, хэрэглэгчийн заавар: «хуучин s curve delete, шинэ
          * s curve Cashflow шүү»). Тэр нь ажлын хугацааг сараар ЖИГД
          * тараадаг ТААМАГ байсан бол энэ нь хүний бөглөсөн БОДИТ
          * төлөвлөгөө — нэг дэлгэц дээр хоёр S-муруй байвал аль нь ч
          * итгэл төрүүлэхгүй.
          */}
        <Section
          title={tr('Cashflow — сарын хуваарилалт')}
          note={(
            <span className={g.tlTabs}>
              <button
                type="button"
                aria-pressed={cfMode === 'chart'}
                className={`${g.tlTab} ${cfMode === 'chart' ? g.tlTabOn : ''}`}
                onClick={() => setCfMode('chart')}
              >
                {tr('График')}
              </button>
              <button
                type="button"
                aria-pressed={cfMode === 'table'}
                className={`${g.tlTab} ${cfMode === 'table' ? g.tlTabOn : ''}`}
                onClick={() => setCfMode('table')}
              >
                {tr('Хүснэгт')}
              </button>
            </span>
          )}
        >
          <Data q={cfPlan} minH={190}>
            {() => (cfCurve.length === 0 ? (
              /* ⚠️ ТЭГ БАГАНА ЗУРАХГҮЙ — «мөнгө гарахгүй» гэсэн ХУДАЛ уншилт
                 болно. Хоосон бол шалтгаан ба зам нь хэлэгдэнэ. */
              <Empty
                label={tr('Сарын хуваарилалт бөглөгдөөгүй')}
                hint={tr('«Санхүүжилт → Cashflow хувиарлах» хэсгээс ажил бүрийн сарын хувийг оруулна уу.')}
              />
            ) : (
              /* ⚠️ «Хөрөнгө оруулалтын гүйцэтгэл»-ТЭЙ НЭГ бүрэлдэхүүн: зум,
                 hover, чарт/хүснэгт сэлгүүр бүхэлдээ ижил ажиллана. */
              <Timeline points={cfCurve} grain={grainOf(period)} total={cfTotal} mode={cfMode} />
            ))}
          </Data>
        </Section>
        </div>
      </main>

      <aside className={g.right}>
        {/* ⚠️ Давхаргыг ЭНД асаана: `visible` нь бүрхүүлийн төлөв бөгөөд
            карт нь түүнд шууд хүрэхгүй. Зурагт гаргаад л орхихгүй, түүн рүү
            ОЙРТУУЛНА — 42 давхаргын аль нэг нь дэлгэцийн гадна байвал
            «юу ч болсонгүй» гэж уншигдана. */}
        <HseCard />
        <LandCard
          active={active}
          reason={reason}
          byReason={byReason}
          onPickReason={pickReason}
          /* ⚠️ `null` = мөрийг дахин дарж ТАЙЛСАН — асаасан давхаргаа
             буцаана («Саад — багцаар»-тай ИЖИЛ зан). */
          onShowLayers={(ids) => {
            if (!ids) {
              if (beforeType.current) setVisible(beforeType.current);
              beforeType.current = null;
              return;
            }
            if (beforeType.current == null) beforeType.current = visible;
            setVisible((v) => [...new Set([...v, ...ids])]);
            if (ids[0]) map.zoomToLayer(ids[0]);
          }}
        />
        <SaadCard
          keys={activeKeys}
          /* ⚠️ Шалтгаан сонгогдмогц энэ карт ТҮҮГЭЭР нарийсна */
          oids={reasonOids}
          /* ⚠️ `null` = мөрийг дахин дарж ТАЙЛСАН — асаасан давхаргаа буцаана */
          onShowLayers={(ids) => {
            if (!ids) {
              if (beforePkg.current) setVisible(beforePkg.current);
              beforePkg.current = null;
              return;
            }
            if (beforePkg.current == null) beforePkg.current = visible;
            setVisible((v) => [...new Set([...v, ...ids])]);
            if (ids[0]) map.zoomToLayer(ids[0]);
          }}
        />
        <PlanCard totals={totals} />
      </aside>
      </div>
    </div>
  );
}

/* ══════════════════════ ХУГАЦААНЫ ШҮҮЛТ ══════════════════════ */

/** Шүүлтийн гурван хэмжээс — `Period`-ийн талбарын нэр */
type Dim3 = 'years' | 'quarters' | 'months';

const QUARTERS = [1, 2, 3, 4];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * ХУГАЦААНЫ ШҮҮЛТ — ArcGIS-ийн атрибут хүснэгтийн шүүлттэй ИЖИЛ хэлбэр
 * (2026-09-04, хэрэглэгчийн хүсэлт).
 *
 * ⚠️ Урьд нь 22 чип (6 жил + 4 улирал + 12 сар) нэг эгнээнд задгай байсан:
 * зурвас хоёр мөр болж, доорх картуудаас илүү зай эзэлж, «одоо юу сонгогдсон
 * байна» гэдэг нь 22 товчны дундаас олдохгүй байв. Одоо ГУРВАН унждаг товч —
 * сонгосон утга нь товчин дээрээ бичигдэнэ.
 *
 * ⚠️ Цэс нь `position: fixed`, байрлалыг товчны хэмжээнээс авна: зурвас нь
 * `overflow`-той эцгийн дотор байх тул `absolute` цэс тасарна.
 */
function PeriodBar({
  period, setPeriod, years,
}: {
  period: Period;
  setPeriod: (p: Period) => void;
  years: number[];
}) {
  /**
   * ⚠️ ОЛОН СОНГОЛТ (2026-09-04, хэрэглэгчийн хүсэлт). Хэмжээс тус бүр нь
   * ОЛОНЛОГ; хоосон = бүгд. Гурав нь хоорондоо БАЙ (AND) — «2026 · 1,2-р
   * улирал» гэвэл тэр хоёр улирлын аль нэгэнд нь хамаарах 2026 оны ажил.
   *
   * ⚠️ Улирал ба сарыг ХАРИЛЦАН УНТРААХАА БОЛИВ. Нэг сонголттой үед «2-р
   * улирал ба 11-р сар» нь ҮРГЭЛЖ хоосон байсан тул автоматаар цэвэрлэдэг
   * байв; олонлогтой үед «2-р улирал ба 4,5-р сар» гэх мэт УТГАТАЙ хослол
   * үүсдэг тул автоматаар устгах нь хэрэглэгчийн сонголтыг булаана.
   */
  const toggle = (k: Dim3, v: number) => {
    const cur = period[k];
    setPeriod({
      ...period,
      [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort((x, y) => x - y),
    });
  };

  /**
   * ⚠️ ШОШГО НЬ ЗӨВХӨН ТОО («6», БИШ «6-р сар»): нүд бүр нь бүлгийн нэрийн
   * («САР») дор зогсох тул нэгжийг давтах нь зурвасыг гурав дахин уртасгаад
   * мэдээлэл нэмэхгүй. Дэлгэрэнгүй нэр нь `title`-д үлдэнэ.
   */
  const CFG: Record<Dim3, { label: string; opts: number[]; text: (v: number) => string; full: (v: number) => string }> = {
    years: {
      label: tr('Жил'), opts: years, text: (v) => String(v), full: (v) => String(v),
    },
    quarters: {
      label: tr('Улирал'),
      opts: QUARTERS,
      text: (v) => String(v),
      full: (v) => tr('{0}-р улирал', String(v)),
    },
    months: {
      label: tr('Сар'),
      opts: MONTHS,
      text: (v) => String(v),
      full: (v) => tr('{0}-р сар', String(v)),
    },
  };

  /**
   * БҮЛЭГ — нэр, «Бүгд», дараа нь утга бүр өөрийн ШАХМАЛААР.
   *
   * ⚠️ ЦЭС БАЙХГҮЙ (2026-09-07, хэрэглэгчийн шийдвэр). Урьд нь гурван унждаг
   * цэс байсан: сонголт хийхийн тулд нээх → сонгох → хаах гэсэн гурван алхам
   * шаардагддаг бөгөөд ЯМАР утгууд байгааг нээхээс өмнө мэдэх аргагүй байв.
   * Бүх утга ил байвал сонголт НЭГ товшилт болно.
   *
   * ⚠️ «Бүгд» нь ЧАГТ шиг ажиллана: дарвал бүх утга сонгогдоно, дахин дарвал
   * тайлагдана (хоосон = бүгд гэсэн утга ижил).
   */
  const grp = (k: Dim3) => {
    const c = CFG[k];
    const sel = period[k];
    /*
     * ⚠️ ХОЁР ӨӨР ОЙЛГОЛТ (2026-09-07-ны алдааны засвар):
     *   · `allPicked` — БҮГД ил чагттай. Дарвал ТАЙЛНА.
     *   · `allOn`     — тэмдэглэгээ. Хоосон нь ч «бүгд»-ийг хамардаг тул тод.
     * Урьд нь хоёуланг `allOn`-оор шийддэг байсан тул ЭХНИЙ (хоосон) төлөвт
     * «Бүгд» дарахад цэвэрлэх салаа руу орж, нэг ч утга сонгогддоггүй байв.
     */
    const allPicked = c.opts.length > 0 && sel.length === c.opts.length;
    const allOn = sel.length === 0 || allPicked;
    return (
      <span key={k} className={g.fGrp}>
        <span className={g.fGrpLbl}>{c.label}</span>
        <button
          type="button"
          aria-pressed={allOn}
          className={`${g.fPill} ${allOn ? g.fPillOn : ''}`}
          onClick={() => setPeriod({ ...period, [k]: allPicked ? [] : [...c.opts] })}
        >
          {tr('Бүгд')}
        </button>
        {c.opts.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={sel.includes(v)}
            title={c.full(v)}
            className={`${g.fPill} ${sel.includes(v) ? g.fPillOn : ''}`}
            onClick={() => toggle(k, v)}
          >
            {c.text(v)}
          </button>
        ))}
      </span>
    );
  };

  return (
    <div className={g.filters}>
      {grp('years')}
      {grp('quarters')}
      {grp('months')}
      {/* ⚠️ ЦУЦЛАХ нь зурвасын ТӨГСГӨЛД, зөвхөн шүүлттэй үед — цэвэрлэх зүйлгүй
          үед байнга зогсох товч нь зай эзэлж, «юу цуцлах вэ» гэсэн асуулт
          төрүүлнэ. */}
      {periodActive(period) && (
        <button
          type="button"
          className={g.fClear}
          title={tr('Шүүлт цуцлах')}
          aria-label={tr('Шүүлт цуцлах')}
          onClick={() => setPeriod(NO_PERIOD)}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ══════════════════════ ЗУРГИЙН ДЭЭРХ ИНДИКАТОР ══════════════════════ */

function KpiStrip({
  rows, period, contracts, xs,
}: {
  rows: CfRow[];
  period: Period;
  contracts: Map<number, number> | null;
  /** Чартын хөндлөн сонголт — `null` бол шүүлтгүй */
  xs: { dim: XDim; key: string } | null;
}) {
  const land = useAsync(loadLandStatus, []);
  const landPct = land.state === 'ready' ? land.data.pct : null;

  /*
   * ⚠️ `landPct` нь ХАМААРАЛД ЗААВАЛ: «Гүйцэтгэлийн хувь» индикатор одоо
   * зургаан шатны жигнэсэн нийлбэр бөгөөд түүний нэг гишүүн нь газар
   * чөлөөлөлтийн явц. Хамааралд оруулаагүй бол газрын тоо ирэхэд индикатор
   * шинэчлэгдэхгүй, гурав дахин бага утга дээр гацна.
   */
  const k = useMemo(() => {
    /* ⚠️ ХУГАЦАА ба ЧАРТЫН сонголт ХОЁУЛАА — эс бөгөөс «Барилга угсралт»-ыг
       дарахад чарт нарийсаж, индикатор бүтэн үлдэж, хоёр тоо зөрчилдөнө. */
    const sel = rows.filter((r) => inPeriod(r, period) && (xs == null || xMatch(r, xs.dim, xs.key)));
    /*
     * НИЙТ ГЭРЭЭЛСЭН ДҮН — ЗӨВХӨН ГЭРЭЭЛЭГДСЭН мөрүүд (2026-09-08,
     * хэрэглэгчийн заавар: «буруу талбараас утга авсан байна»).
     *
     * ⚠️ `Geree_erh_dun` нь гэрээлэгдээгүй мөрүүдэд ч бөглөгдсөн байдаг тул
     * бүх мөрөөр нийлбэл 2,073 тэрбум гарч, бодит гэрээнээс 33 тэрбумаар
     * их болно. Гэрээ хийгдсэн эсэхийг «Хөрөнгө оруулалтын төрөл»
     * (`HO_dungiin_tailbar`) талбар л хэлдэг — түүний «Гэрээлсэн дүн» утга.
     * ⚠️ Ингэснээр индикатор нь «Төсөв, гэрээлсэн дүн» чарттай ЯГ таарна
     * (2,039.8 тэрбум) — урьд нь хоёр тоо зөрж, аль нь үнэн болох нь
     * ойлгомжгүй байв.
     */
    const csum = contracts
      ? sel.reduce((s, r) => (r.note === CONTRACTED ? s + (contracts.get(r.oid) ?? 0) : s), 0)
      : 0;
    return kpisOf(sel, csum, landPct);
  }, [rows, period, contracts, landPct, xs]);

  return (
    <div className={g.kpis}>
      {/* ⚠️ ЗУРГААУЛАА НЭГ ЭГНЭЭНД — `cols` нь дээд тал нь 4 тул баганын тоог
          `.kpis`-ийн CSS-ээс дарж бичнэ (`statsGrid` глобал нэрийн зориулалт
          яг энэ). Хоёр эгнээ болбол зурагнаас ~60px хулгайлна. */}
      <Stats cols={3}>
        {/* ⚠️ Индикаторт ТОВЧИЛСОН дүн: бүтэн 15 оронтой тоо нь нүдээ дүүргэж,
            зэргэлдээх шошготойгоо зөрдөг. Бүтэн дүн нь «Санхүүжилт» табын
            хүснэгтэд ба чартын hover цонхонд ХЭВЭЭР байгаа. */}
        {/* ⚠️ `accent` ХАСАГДСАН (2026-09-04): зургаагийн ганц нь өнгөт
            дэвсгэр, өнгөт тоотой байхад тэр нь «СОНГОГДСОН» гэж уншигдаж
            байв — үнэндээ энэ зурвас дарагддаггүй, сонголтгүй. Ялгаа
            хэрэгтэй бол дараалал нь өөрөө хангалттай: нийт төсөв эхэнд. */}
        <Stat icon="calc" value={mntShort(k.budget)} label={tr('Нийт төсөв')} />
        <Stat icon="file" value={contracts ? mntShort(k.contract) : '…'} label={tr('Нийт гэрээлсэн дүн')} />
        {/*
          * ⚠️ МӨНГӨН ДҮН ТҮР ХАСАГДСАН (2026-09-08, хэрэглэгчийн заавар:
          * «851.0 тэрбум ₮ — үүнийг IPC-ээс авна, одоохондоо hide хий»).
          *
          * Тэр тоо нь `төсөв × гүйцэтгэлийн хувь` гэсэн ДЕРИВАТИВ байсан —
          * бодитоор олгосон мөнгө БИШ. Гүйцэтгэлийн ТӨЛБӨРИЙН АКТ (IPC) нь
          * жинхэнэ олголтыг мэддэг бөгөөд бэлэн болмогц ЭНД холбогдоно;
          * `Kpi.progressAmount` тооцоо нь кодод ХЭВЭЭР (`gdash.ts`).
          *
          * ⚠️ Худал тоо харуулснаас ОГТ ХАРУУЛАХГҮЙ нь дээр: индикаторын
          * мөнгө нь захирамжийн олголттой (2.48 их наяд) эрс зөрдөг тул хүн
          * хоёрыг харьцуулаад аль нь ч үнэн биш гэж эргэлзэнэ.
          */}
        <Stat
          icon="chart"
          value={k.progress == null ? '—' : pct(k.progress)}
          label={tr('Гүйцэтгэлийн хувь')}
        />
        <Stat icon="layers" value={num(k.packages)} label={tr('Багц ажлын тоо')} />
        <Stat icon="grid" value={num(k.types)} label={tr('Нийт төрлийн тоо')} />
        <Stat icon="polygon" value={landPct == null ? '…' : pct(landPct)} label={tr('Газар чөлөөлөлт')} />
      </Stats>
    </div>
  );
}

/* ══════════════════════ ЗҮҮН — САНХҮҮГИЙН 4 ЧАРТ ══════════════════════ */

/**
 * ЧАРТЫН МӨР → `ui.tsx`-ийн `Bars`-ын мөр.
 *
 * ⚠️ 2026-09-04: энд ӨӨРИЙН гэсэн багана зурдаг `SubBars` байсныг ХАСАВ.
 * Тэр нь дэд цувааг багана дотор давхарлаж харуулдаг байсан ч порталын бусад
 * 18 харагдац бүгд `Bars`-ыг хэрэглэдэг тул ЗӨВХӨН энэ дэлгэц өөр хэлээр
 * ярьж байлаа (өөр өндөр, өөр фонт, өөр hover). Хэрэглэгчийн шаардлага:
 * «бусад button-ы чартуудтай ижил бол».
 *
 * ⚠️ ДЭД ЦУВАА АЛДАГДААГҮЙ, ЗҮГЭЭР Л ТЕКСТ БОЛСОН: `Bars` нь нэг мөрд нэг
 * утга зурдаг тул дэд утгыг `display`-д хувиар бичнэ («1.9 их наяд · 24%»).
 * Давхарласан зурвасаас илүү нарийн уншигдана — нүдээр хоёр уртыг жишихээс
 * тоо шууд харах нь баталгаатай.
 */
/**
 * ЧАРТЫН МӨР → `ui.tsx`-ийн `Bars`.
 *
 * ═══ НЭГ ДҮРЭМ, ЗУРГААН ЧАРТАД (2026-09-04, хэрэглэгчийн шийдвэр) ═══
 *
 *   МӨРӨН ДЭЭР — гүйлгэж уншихад хэрэгтэй ХАМГИЙН БАГА зүйл.
 *   HOVER ДЭЭР — тухайн мөрийг судлахад хэрэгтэй БҮТЭН задаргаа, цэгтэй
 *                мөрүүдээр.
 *
 * ⚠️ Урьд нь мөрөн дээр гурван тоо зэрэг байсан («76.4% · 1.92 их наяд ₮ ·
 * гүйцэтгэл 24%») тул ангиллын нэр шахагдаж хоёр мөр болж, жагсаалт
 * замбараагүй харагддаг байв. «нийтэд», «гүйцэтгэл» гэсэн үгс нь мөр бүрд
 * давтагдаж чимээ нэмдэг — тэдгээр нь hover дээр БҮТЭН ӨГҮҮЛБЭР болж
 * тодорхой болно.
 */

/**
 * ЧАРТЫН ДОТОРХ ШОШГЫГ ЭНГИЙН ҮСЭГТ буулгана (2026-09-04, хэрэглэгчийн
 * хүсэлт: «чарт дотор байгаа uppercase болиул, чартын нэр uppercase»).
 *
 * ⚠️ ТОМ ҮСЭГ НЬ ЗАГВАР БИШ, ӨГӨГДӨЛ. `Turul` талбарын утга үйлчилгээнд
 * «ОРОН СУУЦНЫ ХОРООЛЛЫН БАРИЛГАЖИЛТ» гэж БИЧИГДСЭН тул CSS-ийн
 * `text-transform` унтраагаад ч өөрчлөгдөхгүй — эндээс хөрвүүлнэ.
 *
 * ⚠️ ТОВЧЛОЛ ХЭВЭЭР: «ТЭЗҮ» → «Тэзү» болговол уншигдахаа болино. Доорх
 * олонлогт байгаа үг л том үсгээрээ үлдэнэ. Шинэ товчлол гарвал ЭНД нэм —
 * ерөнхий дүрмээр (урт, эгшиг) таах нь «ОРОН», «БУСАД» зэрэг ердийн үгийг
 * товчлол гэж андуурна.
 *
 * ⚠️ Зөвхөн БҮХЭЛДЭЭ том үсэгтэй мөрд үйлчилнэ — «Гэрээлсэн дүн» гэх мэт
 * аль хэдийн зөв бичигдсэн утгыг хөндөхгүй.
 */
const KEEP_UPPER = new Set(['ТЭЗҮ', 'ХАБ', 'ХАБЭА', 'НЗД', 'БОНУ', 'ХХК', 'IoT', 'QAQC', 'BIM']);

const nice = (v: string): string => {
  if (v !== v.toUpperCase()) return v;
  const out = v
    .split(' ')
    .map((w) => (KEEP_UPPER.has(w.replace(/[^A-Za-zЀ-ӿ]/g, '')) ? w : w.toLowerCase()))
    .join(' ');
  /* Эхний ҮСГИЙГ том болгоно (эхний үг товчлол бол аль хэдийн том) */
  const i = out.search(/[A-Za-zЀ-ӿ]/);
  return i < 0 ? out : out.slice(0, i) + out[i].toUpperCase() + out.slice(i + 1);
};

/**
 * Мөнгө — мөрөн дээр ТОЙМЛОСОН («29.0 тэрбум ₮»), бүтэн нь hover-т.
 *
 * ⚠️ `format.mnt`-ИЙГ ӨӨРЧИЛЖ БОЛОХГҮЙ. Тэр нь САНААТАЙ бүтэн бичдэг
 * («2,512,585,832,535 ₮») бөгөөд тэр файлд «товчлолыг бүү сэргээ» гэсэн
 * тэмдэглэл бий — портал даяар 7 газар бүтэн дүн шаарддаг. Тиймээс энэ
 * товчлол нь ЗӨВХӨН энэ дашбоардын чарт ба индикаторт үйлчилнэ.
 */
/**
 * ⚠️ ЭРЭМБЭ НЬ БАГАНЫ УРТААР, ИХЭЭС БАГА РУУ (2026-09-04, хэрэглэгчийн
 * хүсэлт).
 *
 * ⚠️ ТҮҮХИЙ УТГААР БИШ. Дэд цуваатай чартад багана нь мөрийн доторх
 * биелэлтийн ХУВИЙГ зурдаг (§БАГАНЫН УРТ) тул түүхий тоогоор эрэмбэлбэл
 * баганууд эмх замбараагүй харагдана: «51 ажил / 53%» нь «2 ажил / 100%»-аас
 * дээр зогсоод богино зурвастай байна. Нүд эрэмбийг ЗУРВАСААР уншдаг.
 *
 * ⚠️ ҮР ДАГАВАР: мөрийн баруун талын ТОО дараалалгүй харагдана (2 нь 51-ээс
 * дээр гарч болно). Санаатай — нэг жагсаалт хоёр эрэмбийг зэрэг илэрхийлэх
 * аргагүй.
 */
const byBar = <T extends { value: number }>(a: T[]): T[] =>
  a.slice().sort((x, y) => y.value - x.value);

const mntShort = (v: number): string => {
  if (!Number.isFinite(v) || v === 0) return '—';
  const a = Math.abs(v);
  /* ⚠️ НЭГЖ БҮТЭН ҮГЭЭР («их наяд», «тэрбум») — 2026-09-04-нд «их н.» гэж
     товчилж үзээд хэрэглэгч буцаав. Товчлогдох нь ЗӨВХӨН ТОО: 15 оронтой
     дүн нүдэнд багтдаггүй, харин нэгжийн үг нь уншигдах ёстой. */
  if (a >= 1e12) return tr('{0} их наяд ₮', num(v / 1e12, 2));
  if (a >= 1e9) return tr('{0} тэрбум ₮', num(v / 1e9, 1));
  if (a >= 1e6) return tr('{0} сая ₮', num(v / 1e6, 1));
  return mnt(v);
};

/** МӨНГӨН чарт — мөрөнд «хувь · тоймлосон дүн», hover-т бүтэн задаргаа */
const moneyBars = (
  items: SubBar[],
  subLabel?: { has: string; none: string },
  /**
   * ЭЗЛЭХ ХУВИЙН СУУРИЙН НЭР.
   *
   * ⚠️ Анхдагч нь «Нийт төсөв» — учир нь чартын мөрүүдийн нийлбэр нь яг
   * `Урьдчилсан төсөвт өртөг`-ийн нийлбэртэй тэнцдэг (төрөл, тайлбараар
   * бүлэглэсэн чартууд).
   *
   * ⚠️ ЭХ ҮҮСВЭРИЙН чартад ЭНЭ ҮНЭН БИШ: захирамжийн эх үүсвэрүүдийн нийлбэр
   * 2.46 их наяд бөгөөд нийт төсвөөс 55.4 тэрбумаар БАГА (захирамж бүх ажилд
   * бүрэн бүртгэгдээгүй). Тэнд «Нийт төсвийн 60.5%» гэж бичих нь худал —
   * жинхэнэ суурь нь эх үүсвэрүүдийн нийлбэр (2026-09-06-ны аудит).
   */
  base: string = tr('Нийт төсвийн'),
  /**
   * АЖЛЫН НИЙТ ТООГ hover-т бичих эсэх.
   *
   * ⚠️ «Захирамжийн эх үүсвэр» чартад ЗААВАЛ (тэр нь мөнгө ба тоо хоёр чартыг
   * нэгтгэсэн). «Төсөв, гэрээлсэн дүн»-д ХЭРЭГГҮЙ: тэнд нийт тоо нь дээрх
   * мөнгөн мөрүүдэд юу ч нэмэхгүй бөгөөд «Гэрээ хийсэн: 7 (88%)» өөрөө
   * суурийг нь агуулж байдаг (2026-09-07, хэрэглэгчийн заавар).
   */
  showCount = true,
) => {
  /*
   * ⚠️ ДҮНГҮЙ АНГИЛАЛ МӨНГӨН ЧАРТАД ГАРАХГҮЙ (2026-09-04, хэрэглэгчийн
   * шийдвэр). «Урьдчилсан төсөвт өртөг» нь хоосон мөрүүд «0.0% · —» гэсэн
   * хоосон зурвас болж хоёр мөр эзэлдэг байв — мөнгөний чартад тэдгээр нь
   * мэдээлэл ОГТ өгөхгүй.
   *
   * ⚠️ НУУСАН НЬ ЗАСАГДАХГҮЙ ГЭСЭН ҮГ БИШ: шүүлт нь өгөгдлөөс ХАМААРНА, тул
   * үйлчилгээнд дүн бөглөмөгц тэр ангилал ДАРААГИЙН ачаалалтад аяндаа
   * харагдана. Хатуу жагсаалтаар хассан бол чимээгүй мартагдана.
   *
   * ⚠️ ТООН чартад энэ шүүлт ХАМААРАХГҮЙ: тэнд 0 гэдэг «нэг ч ажил байхгүй»
   * гэсэн утга агуулж болох тул үзүүлэх нь зөв.
   */
  const shown = items.filter((i) => i.value > 0);
  const total = shown.reduce((x, y) => x + y.value, 0);
  return byBar(shown.map((i) => {
    const share = total > 0 ? pct((i.value / total) * 100, 1) : null;
    /* ⚠️ БҮТЭН ӨГҮҮЛБЭР: «Нийт дүнгийн 1.2%» гэсэн тасархай хэллэг нь юуны
       1.2% болохыг хэлдэггүй. Суурийг ЗААВАЛ нэрлэнэ — `base`-ийн тайлбарыг
       үз (чарт бүрийн суурь ижил БИШ). */
    const hint = [tr('{0} {1}-ийг эзэлж байна', base, share ?? '—')];
    /*
     * ⚠️ ТЭГ ДЭД УТГЫГ Ч ХАРУУЛНА (`> 0` БИШ). 2026-09-04-нд «Гадна тохижилт
     * 14 / 0 гэрээтэй» мөр нь дэд утгагүй гэж тооцогдож БҮТЭН өтгөн будагдаж,
     * «14/14 гэрээлсэн» мэт харагдаж байв — яг ЭСРЭГ утга. Тэр мөрд hover-т
     * тайлбар ч гардаггүй тул зөрчлөө шалгах ч аргагүй байлаа.
     * «Хэмжигдсэн бөгөөд тэг» ба «хэмжигдээгүй» хоёр ялгаатай: чартад дэд
     * цуваа зарлагдсан бол мөр БҮРД хамаарна.
     */
    /*
     * ⚠️ ТЭГ БОЛ БҮТЭН ӨГҮҮЛБЭР («Гүйцэтгэл огт бүртгэгдээгүй»), «…: 0 (0%)»
     * БИШ. Хоёр шалтгаан: (а) тэг нь тоо биш МЭДЭГДЭЛ — уншигч түүнийг
     * форматын үлдэгдэл гэж алгасах эрсдэлтэй; (б) 2026-09-04-нд «14 / 0»
     * мөр нь бүтэн будагдаж «14/14» мэт харагдсан тул тэг тохиолдол
     * ХАМГИЙН тодорхой бичигдэх шаардлагатай.
     */
    if (subLabel) {
      hint.push(i.sub > 0
        ? `${subLabel.has}: ${mntShort(i.sub)} (${i.value > 0 ? pct((i.sub / i.value) * 100, 0) : '—'})`
        : subLabel.none);
    }
    /*
     * ОЛГОСОН ДҮН — захирамжаар (2026-09-06, хэрэглэгчийн хүсэлт).
     *
     * ⚠️ Хувийн СУУРЬ нь ЭНЭ МӨРИЙН төсөв, нийт төсөв БИШ: «87 тэрбумаас
     * хэдийг олгосон» гэсэн асуулт нь мөрийн дотоод харьцаа. Дээрх мөр
     * («Нийт төсвийн …») нь гадаад харьцааг аль хэдийн хэлсэн — хоёуланг нь
     * нэг суурьтай бичвэл нэг нь илүүц болно.
     */
    /*
     * АЖЛЫН ТОО — нэгтгэсэн чартын хоёр дахь хэмжигдэхүүн (2026-09-06).
     *
     * ⚠️ Багана нь МӨНГӨӨР хэмжигдсэн хэвээр: эдгээр мөр нь тоог зөвхөн
     * ХЭЛНЭ, зурвасын уртад ОГТ нөлөөлөхгүй.
     */
    if (i.count != null) {
      const lines: string[] = [];
      if (showCount) lines.push(tr('{0} ажил', num(i.count)));
      if (i.countSub != null) {
        /*
         * ⚠️ ТЭГ ҮЕД ДАВХАРДДАГ БАЙВ (2026-09-07): мөнгөн дэд цуваа нь аль
         * хэдийн «Нэг ч гэрээ хийгдээгүй» гэж бичсэн байхад энэ блок тэрхүү
         * ЯГ ижил өгүүлбэрийг дахин нэмж, панелд хоёр удаа гардаг байлаа.
         * Гэрээтэй үед л ТООН утга гарна; тэг мэдэгдлийг зөвхөн мөнгөн дэд
         * цуваагүй чарт (жиш. «Захирамжийн эх үүсвэр») өөрөө хэлнэ.
         */
        if (i.countSub > 0) {
          lines.push(`${tr('Гэрээ хийсэн')}: ${num(i.countSub)} (${i.count > 0 ? pct((i.countSub / i.count) * 100, 0) : '—'})`);
        } else if (!subLabel) {
          lines.push(tr('Нэг ч гэрээ хийгдээгүй'));
        }
      }
      /* ⚠️ ЗУРААСЫГ ЗӨВХӨН агуулга байвал: хоосон заагаар панел дуусах нь
         «үргэлжлэл тасарсан» мэт уншигдана. */
      if (lines.length > 0) hint.push(TIP_RULE, ...lines);
    }
    /*
     * ГҮЙЦЭТГЭЛИЙН ХОЁР ХЭМЖҮҮР — «Гэрээлсэн байдал, бодит гүйцэтгэл»
     * чартаас НЭГТГЭГДСЭН (2026-09-10, хэрэглэгчийн заавар).
     *
     * ⚠️ ГЭРЭЭНЭЭС ТУСДАА бүлэгт (зураасны дараа): гэрээ бол ЭРХ,
     * гүйцэтгэл бол БИЕТ ажил. Нэг бүлэгт нийлбэл «17 гэрээнээс 19% нь
     * хийгдсэн» мэт буруу холбоо уншигдана.
     * ⚠️ `null` бол «хэмжигдээгүй» — 0% гэж бичихгүй.
     */
    if (i.perf !== undefined) {
      hint.push(TIP_RULE);
      hint.push(i.perf == null
        ? tr('Гүйцэтгэл хэмжигдээгүй')
        : `${tr('Бодит гүйцэтгэл')}: ${pct(i.perf, 1)}`);
      /* ⚠️ ИЖИЛ бол давхардуулж бичихгүй — нэг тоог хоёр нэрээр харуулбал
         хоёр өөр хэмжүүр мэт уншигдана. */
      if (i.fin != null && (i.perf == null || Math.abs(i.fin - i.perf) > 0.05)) {
        hint.push(`${tr('Санхүүжсэн гүйцэтгэл')}: ${pct(i.fin, 1)}`);
      }
    }
    return {
      key: i.key,
      label: nice(i.label),
      /*
       * ⚠️ БАГАНЫН УРТ = МӨРИЙН ДОТОРХ БИЕЛЭЛТИЙН ХУВЬ (дэд цуваатай үед).
       * «8 ажлаас 7 гэрээтэй» бол 87.5% дүүрнэ. Дуудагч тал `max={100}`
       * дамжуулна — эс бөгөөс тэнхлэг нь хамгийн их ХУВИАР хэмжигдэж,
       * 100%-тай мөр байхгүй үед бүх багана хиймлээр сунана.
       *
       * ⚠️ Дэд цуваагүй чартад урт нь УТГЫН ХЭМЖЭЭ хэвээр.
       */
      /* ⚠️ 100%-Д ХЯЗГААРЛАНА — дэд дүн эх дүнгээсээ давсан өгөгдөл ирвэл
         зурвас мөрөөсөө халин гарахаас сэргийлнэ. */
      value: subLabel
        ? (i.value > 0 ? Math.min(100, (i.sub / i.value) * 100) : 0)
        : i.value,
      /* ⚠️ ЗӨВХӨН дэд цуваатай чартад (тэнхлэг нь 0–100 хувь): мөнгөний
         тэнхлэг дээр хувийн тэмдэг тавибал хоёр өөр хэмжүүр нэг зурваст
         орж, аль нь алин болох нь мэдэгдэхгүй. */
      mark: subLabel ? i.fin : null,
      markColor: 'var(--warn)',
      /* Мөр: хувь эхэнд (харьцаа), тоймлосон дүн ард */
      display: share ? `${share} · ${mntShort(i.value)}` : mntShort(i.value),
      /* Hover: БҮТЭН төгрөг — `format.mnt` нь портал даяар бүтэн бичдэг */
      tipValue: mnt(i.value),
      hint,
    };
  }));
};

/**
 * ТООН чарт — мөрөнд зөвхөн тоо, hover-т нэгж, эзлэх хувь, дэд задаргаа.
 *
 * ⚠️ НЭГЖ ЗААВАЛ. Hover дээр ганцаар зогсох «22» гэсэн тоо нь юуны 22 болох
 * нь тайлбаргүй байв (2026-09-04, хэрэглэгчийн ажиглалт): цонхны толгойд
 * зөвхөн ангиллын нэр байдаг тул чартын гарчгийг харахгүйгээр уншигдахгүй.
 *
 * ⚠️ ХОЁР ХЭЛБЭР хэрэгтэй: `one` нь нэрлэхийн («22 ажил»), `many` нь
 * харьяалахын («Нийт ажлын 28.9%») — монгол хэлэнд нэг үгээр хоёуланг нь
 * зөв бичих боломжгүй.
 */
const countBars = (
  items: SubBar[],
  unit: { one: string; many: string },
  subLabel?: { has: string; none: string },
) => {
  const total = items.reduce((x, y) => x + y.value, 0);
  return byBar(items.map((i) => {
    const hint = [tr(
      'Нийт {0} {1}-ийг эзэлж байна', unit.many, total > 0 ? pct((i.value / total) * 100, 1) : '—',
    )];
    /* ⚠️ Тэг бол бүтэн өгүүлбэр — `moneyBars`-ийн тайлбарыг үз */
    if (subLabel) {
      hint.push(i.sub > 0
        ? `${subLabel.has}: ${num(i.sub)} (${i.value > 0 ? pct((i.sub / i.value) * 100, 0) : '—'})`
        : subLabel.none);
    }
    /*
     * БОДИТ ГҮЙЦЭТГЭЛ — cashflow-гийн `Guitsetgel_huwi`, өртгөөр жигнэсэн.
     *
     * ⚠️ ГЭРЭЭНЭЭС ТУСДАА бүлэгт (зураасны дараа): гэрээ бол ЭРХ, гүйцэтгэл бол
     * БИЕТ ажил. Нэг бүлэгт нийлбэл «17 гэрээнээс 19% нь хийгдсэн» мэт
     * буруу холбоо уншигдана.
     *
     * ⚠️ `null` бол «хэмжигдээгүй» — 0% гэж бичихгүй.
     */
    if (i.perf !== undefined) {
      hint.push(TIP_RULE);
      hint.push(i.perf == null
        ? tr('Гүйцэтгэл хэмжигдээгүй')
        : `${tr('Бодит гүйцэтгэл')}: ${pct(i.perf, 1)}`);
      /*
       * САНХҮҮЖСЭН ГҮЙЦЭТГЭЛ — ЗӨВХӨН `guitsetgel_huvi`-ийн жигнэсэн дундаж.
       *
       * ⚠️ ХОЁУЛАНГ НЬ харуулна: барилга угсралтад «бодит» нь объёмоор,
       * «санхүүжсэн» нь талбараас бодогддог тул хоёр тоо ЗӨРНӨ — тэр зөрүү нь
       * «мөнгө урьдчилж, ажил хоцорч байна уу» гэсэн асуултын хариу.
       * ⚠️ ИЖИЛ бол давхардуулж бичихгүй — нэг тоог хоёр нэрээр харуулбал
       * хоёр өөр хэмжүүр мэт уншигдана.
       */
      if (i.fin != null && (i.perf == null || Math.abs(i.fin - i.perf) > 0.05)) {
        hint.push(`${tr('Санхүүжсэн гүйцэтгэл')}: ${pct(i.fin, 1)}`);
      }
    }
    return {
      key: i.key,
      label: nice(i.label),
      /*
       * ⚠️ БАГАНЫН УРТ = МӨРИЙН ДОТОРХ БИЕЛЭЛТИЙН ХУВЬ (дэд цуваатай үед).
       * «8 ажлаас 7 гэрээтэй» бол 87.5% дүүрнэ. Дуудагч тал `max={100}`
       * дамжуулна — эс бөгөөс тэнхлэг нь хамгийн их ХУВИАР хэмжигдэж,
       * 100%-тай мөр байхгүй үед бүх багана хиймлээр сунана.
       *
       * ⚠️ Дэд цуваагүй чартад урт нь УТГЫН ХЭМЖЭЭ хэвээр.
       */
      value: subLabel ? (i.value > 0 ? (i.sub / i.value) * 100 : 0) : i.value,
      /* ⚠️ ЗӨВХӨН дэд цуваатай чартад (тэнхлэг нь 0–100 хувь): тооны
         тэнхлэг дээр хувийн тэмдэг тавибал хоёр өөр хэмжүүр нэг зурваст
         орж, аль нь алин болох нь мэдэгдэхгүй. */
      mark: subLabel ? i.fin : null,
      markColor: 'var(--warn)',
      display: num(i.value),
      tipValue: `${num(i.value)} ${unit.one}`,
      hint,
    };
  }));
};

/**
 * БҮХ ЧАРТ НЭГ ӨНГӨТЭЙ.
 *
 * ⚠️ Мөр бүр өөр өнгөтэй байх нь «ангилал бүр өөр зүйл» гэсэн утга дамжуулдаг
 * ч энд мөрүүд нь НЭГ хэмжигдэхүүний харьцуулалт тул өнгө мэдээлэл өгөхгүй,
 * зөвхөн шуугиан нэмнэ. Урт нь өөрөө харьцааг хэлнэ.
 */
const BAR_HUE = cat(0);

/**
 * «ТӨСЛИЙН ГҮЙЦЭТГЭЛ» ЧАРТЫН МӨРҮҮД — ЯГ ЭДГЭЭР зургаан үзүүлэлт.
 *
 * ⚠️ 2026-09-10-ны ЗАСВАР. Урьд нь 1.1 · 2.1 · 5.1 мэт кодуудыг авдаг байсан
 * нь ОРОН СУУЦНЫ БЭЛТГЭЛ ажил (ТЭЗҮ · зураг төсөл · тендер) байсан тул
 * «Орон сууцны барилга угсралт 99.5%» гэж ГАРЧ, барилга бараг дууссан мэт
 * ХУДАЛ уншигдаж байв. Бодит барилга угсралт нь модны 6-р хэсэгт.
 *
 * ⚠️ ХОЁР ЭХ СУРВАЛЖТАЙ:
 *   · `wbs`  — ажлын задаргааны (WBS) зангилааны код
 *   · `lvl3` — гэрээний 3-р түвшний бүлэг (`ajil_tuvshin3`), өртгөөр жигнэсэн
 *     `guitsetgel_huvi`. Гадна цахилгааны гүйцэтгэл модонд БАЙХГҮЙ тул
 *     гэрээнээс шууд авахаас өөр зам алга.
 *
 * ⚠️ ГҮН НЬ ЖИГД БИШ САНААТАЙ: эхний гурав нь төслийн ШАТ, сүүлийн гурав нь
 * барилга угсралтын АЖЛЫН ТӨРӨЛ. Модны нэг түвшнийг бүхэлд нь авбал
 * хэрэглэгчийн хардаг зураг гарахгүй.
 */
const WBS_CHART: { label: string; wbs?: string[]; lvl3?: string }[] = [
  { label: tr('ТЭЗҮ, зураг төсөл'), wbs: ['2'] },
  { label: tr('Сонгон шалгаруулалт'), wbs: ['5'] },
  { label: tr('Газар чөлөөлөлт'), wbs: ['3'] },
  /* ⚠️ 6.4.2 — БАРИЛГА УГСРАЛТ хэсгийн доторх гадна инженерийн шугам сүлжээ.
     1.2/2.2 нь түүний ЗУРАГ ТӨСӨЛ (92.5%) тул огт өөр зүйл. */
  { label: tr('Гадна инженерийн шугам сүлжээ'), wbs: ['6.4.2'] },
  /* ⚠️ Модонд харгалзах зангилаа БАЙХГҮЙ — гэрээний 3-р түвшнээс */
  { label: tr('Гадна цахилгаан хангамж'), lvl3: 'Гадна цахилгаан холбоо, дохиолол' },
  { label: tr('Орон сууцны барилга угсралт'), wbs: ['6.2.1'] },
];

function FinCharts({
  rows, period, xs, setXs, pkgPct, catPct,
}: {
  rows: CfRow[];
  period: Period;
  /** Багц → объёмоор бодогдсон гүйцэтгэл (`chartTypeCost`-ийн тайлбар) */
  pkgPct: Map<string, number>;
  /** Ангилал → ил дарах гүйцэтгэл (жиш. орон сууц — «Багцын гүйцэтгэл»-ээс) */
  catPct: Map<string, number>;
  /** ⚠️ Төлөв нь ЭЦЭГТ — индикаторт ч үйлчлэх ёстой (эцгийн тайлбарыг үз) */
  xs: { dim: XDim; key: string } | null;
  setXs: (v: { dim: XDim; key: string } | null
    | ((p: { dim: XDim; key: string } | null) => { dim: XDim; key: string } | null)) => void;
}) {
  const sel = useMemo(() => rows.filter((r) => inPeriod(r, period)), [rows, period]);

  /**
   * ХӨНДЛӨН ШҮҮЛТ — нэг чартын багана дарахад БУСАД чарт нарийсна.
   *
   * ⚠️ ӨӨРИЙГӨӨ ШҮҮХГҮЙ: сонгосон чарт нь бүх ангиллаа хадгалж, зөвхөн сонгосон
   * мөр нь ТОДОРНО. Эс бөгөөс тэр чарт нэг мөр болж хумигдаж, хажуугийн
   * ангиллуудтай харьцуулах боломж алга болно — сонголтоо тайлах ч бэрх.
   *
   * ⚠️ «Төрөл»-ийн ХОЁР чарт (мөнгө ба тоо) нэг хэмжээстэй тул хоёулаа
   * шүүгдэхгүй, хоёулаа тодорно.
   */
  const narrow = useMemo(
    () => (xs ? sel.filter((r) => xMatch(r, xs.dim, xs.key)) : sel),
    [sel, xs],
  );
  /* ⚠️ Хэмжээс бүрд УРЬДЧИЛАН тооцно, функцээр биш: рендер бүрт шинэ функц
     үүсэх нь `useMemo`-гийн хамаарлыг тогтворгүй болгодог. */
  const rType = xs && xs.dim !== 'type' ? narrow : sel;
  const rSrc = xs && xs.dim !== 'source' ? narrow : sel;
  const rNote = xs && xs.dim !== 'note' ? narrow : sel;
  /** Мөр дарах — дахин дарвал тайлагдана */
  const pickX = (dim: XDim) => (k: string) => setXs(
    (v) => (v && v.dim === dim && v.key === k ? null : { dim, key: k }),
  );
  const onX = (dim: XDim) => (xs && xs.dim === dim ? xs.key : null);

  /* ⚠️ НЭГ ЧАРТ (2026-09-10): багана нь МӨНГӨ, ажлын тоо ба гүйцэтгэлийн
     хоёр хэмжүүр нь hover-т. Урьд нь хоёр тусдаа чарт нэг ангиллыг хоёр
     өөр нэгжээр хэмжиж, нүд хооронд нь гүйдэг байв. */
  /**
   * ТӨСЛИЙН ГҮЙЦЭТГЭЛ — «Нэгтгэл гүйцэтгэл» табтай НЭГ эх сурвалж.
   *
   * ⚠️ Cashflow-гийн чартуудаас ТУСДАА хэмжүүр: тэдгээр нь МӨНГӨӨР
   * (гэрээ, захирамж) хэмждэг бол энэ нь ажлын задаргааны (WBS) ШАТУУДЫГ
   * тогтоосон жингээр (ТЭЗҮ 5 · зураг төсөл 10 · газар 3 · зөвшөөрөл 1 ·
   * сонгон шалгаруулалт 1 · барилга угсралт 79 · улсын комисс 1) хэмжинэ.
   * ⚠️ Хугацааны ба чартын шүүлтэд ОРОХГҮЙ: WBS нь гэрээний мөрөөс биш
   * ТӨСЛИЙН бүтцээс гардаг тул хэсэгчилж шүүх нь утгагүй.
   */

  const wbs = useAsync(loadNegtgelFull, []);
  const wbsBars = useMemo(() => {
    if (wbs.state !== 'ready') return [];
    const byCode = new Map(wbs.data.rows.map((r) => [r.code.trim(), r]));
    /** Гэрээний 3-р түвшний бүлгийн өртгөөр жигнэсэн гүйцэтгэл */
    const lvl3Pct = (name: string): number | null => {
      let base = 0;
      let top = 0;
      for (const r of rows) {
        if (r.lvl3 !== name || r.cost <= 0 || r.progress == null) continue;
        base += r.cost;
        top += (r.cost * r.progress) / 100;
      }
      /* ⚠️ ×100 — `top` нь ХУВИЙГ 100-д хуваасан жигнэлт тул харьцаа нь
         0–1 гарна. WBS салаа нь хувиар буцаадаг тул хоёр эх сурвалж НЭГ
         хэмжээст байх ёстой (2026-09-10-нд энэ үржүүлэгч дутсанаас цахилгаан
         5.4% байхын оронд 0.1% гэж гарч байв). */
      return base > 0 ? (top / base) * 100 : null;
    };
    return WBS_CHART
      .map((spec) => {
        if (spec.lvl3) {
          return { spec, base: null as number | null, pctVal: lvl3Pct(spec.lvl3) };
        }
        /*
         * ⚠️ ОЛОН КОДЫГ ТӨСӨЛД ЭЗЛЭХ ХУВИАР ЖИГНЭНЭ, энгийн дундаж БИШ.
         * ⚠️ Хэмжигдээгүй (`actPct == null`) зангилаа хуваарь, хүртвэр
         * ХОЁУЛАНД ч орохгүй — `null` ≠ 0.
         */
        let base = 0;
        let top = 0;
        for (const c2 of spec.wbs ?? []) {
          const r = byCode.get(c2);
          const k = r ? wbs.data.calc.get(r.oid) : null;
          if (!k || k.actPct == null || k.inProject == null) continue;
          base += k.inProject;
          top += k.inProject * k.actPct;
        }
        return { spec, base, pctVal: base > 0 ? top / base : null };
      })
      /* ⚠️ Хэмжигдээгүй мөр ЧАРТАД ГАРАХГҮЙ: 0%-ийн зурвас нь «эхэлсэн ч юу
         ч хийгээгүй» гэсэн ХУДАЛ мэдэгдэл болно. */
      .filter((x) => x.pctVal != null)
      .map((x) => ({
        key: x.spec.lvl3 ?? (x.spec.wbs ?? []).join('+'),
        label: x.spec.label,
        value: x.pctVal as number,
        display: pct(x.pctVal as number, 1),
        tipValue: pct(x.pctVal as number, 1),
        hint: [
          x.spec.lvl3
            /* ⚠️ ЭХ СУРВАЛЖИЙГ ЗААВАЛ хэлнэ: хоёр өөр аргаар бодогдсон тоо
               нэг чартад зэрэгцэж байгааг уншигч мэдэх ёстой. */
            ? `${tr('Эх сурвалж')}: ${tr('гэрээний гүйцэтгэл')} · ${x.spec.lvl3}`
            : `${tr('Задаргаа')}: ${(x.spec.wbs ?? []).join(' · ')}`,
          ...(x.base != null ? [`${tr('Төсөлд эзлэх')}: ${pct(x.base, 2)}`] : []),
        ],
      }));
  }, [wbs, rows]);

  const c1 = useMemo(() => chartTypeCost(rType, pkgPct, catPct), [rType, pkgPct, catPct]);
  const c3 = useMemo(() => chartSourceMerged(rSrc), [rSrc]);
  const c4 = useMemo(() => chartNoteAmount(rNote), [rNote]);

  return (
    <>
      <Section title={tr('Төсөв, гэрээлсэн дүн')}>
        {/* ⚠️ `max={100}` — дэд цуваатай тул тэнхлэг нь 0–100% (§БАГАНЫН УРТ) */}
        <Bars
          color={BAR_HUE}
          max={100}
          /* ⚠️ Дүүргэлт нь ГЭРЭЭЛСЭН хувиар — `chartTypeCost`-ийн тайлбарыг үз */
          items={moneyBars(
            c1,
            { has: tr('Гэрээлсэн дүн'), none: tr('Нэг ч гэрээ хийгдээгүй') },
            undefined,
            false,
          )}
          limit={8}
          selected={onX('type')}
          onSelect={pickX('type')}
        />
      </Section>

      {/*
        * ТӨСЛИЙН ГҮЙЦЭТГЭЛ — «Гэрээлсэн байдал, бодит гүйцэтгэл»-ийн ОРОНД
        * (2026-09-10, хэрэглэгчийн заавар). Тэр чартын агуулга нь
        * «Төсөв, гэрээлсэн дүн»-ий hover панель руу нэгдсэн.
        */}
      <Section title={tr('Төслийн гүйцэтгэл')}>
        <Data q={wbs} minH={150}>
          {() => (wbsBars.length === 0
            ? <Empty label={tr('Гүйцэтгэл хэмжигдээгүй')} />
            : (
              <Bars
                color={BAR_HUE}
                /* ⚠️ `max={100}` — тэнхлэг нь ХУВЬ. Үгүй бол хамгийн өндөр
                   шат 100% болж сунаж, бусад нь түүнтэй харьцуулагдана. */
                max={100}
                items={wbsBars}
              />
            ))}
        </Data>
      </Section>

      <Section title={tr('Захирамжийн эх үүсвэр')}>
        {/* ⚠️ СУУРЬ нь «нийт төсөв» БИШ — `moneyBars`-ийн `base`-ийн тайлбарыг үз */}
        <Bars
          color={BAR_HUE}
          items={moneyBars(c3, undefined, tr('Захирамжийн нийт дүнгийн'))}
          limit={8}
          selected={onX('source')}
          onSelect={pickX('source')}
        />
      </Section>

      <Section title={tr('Хөрөнгө оруулалтын төрөл')}>
        <Bars
          color={BAR_HUE}
          items={moneyBars(c4)}
          limit={8}
          selected={onX('note')}
          onSelect={pickX('note')}
        />
      </Section>
    </>
  );
}

/* ══════════════════════ S-МУРУЙ + ОЛГОСОН ДҮН ══════════════════════ */

/**
 * НЭГ ТЭНХЛЭГ, ХОЁР ХЭМЖИГДЭХҮҮН — багана нь МӨНГӨ, муруй нь ХУВЬ.
 *
 * ⚠️ ХОЁР ЧАРТЫГ НЭГТГЭВ (2026-09-04, хэрэглэгчийн хүсэлт). Тусад нь байхад
 * «2026-д олголт оргилдоо хүрч, ЯГ ТЭР ҮЕД муруй эгц өгссөн» гэсэн ХОЛБОО
 * нүднээс далд үлддэг байв — хоёр өөр хэвтээ тэнхлэгийг нүд өөрөө
 * зэрэгцүүлж чаддаггүй.
 *
 * ⚠️ ӨӨРСДӨӨ ЗУРСАН шалтгаан: `ui.tsx`-д багана (`Series`) ба муруй (`Trend`)
 * тус тусдаа бий ч ХОСЛУУЛСАН хувилбар байхгүй. Хамтын санд нэмбэл 20 гаруй
 * дуудагчийн API тэлнэ — энэ хэлбэр одоохондоо ганц дуудагчтай.
 *
 * ⚠️ ХОЁР ТЭНХЛЭГ, НЭГ ХУВААРЬТ ШАХАХГҮЙ: багана нь 0…max(мөнгө), муруй нь
 * 0…100%. Нэг хуваарьт оруулбал 2.5 их наяд ба 100 хоёрын харьцаанаас болж
 * муруй ёроолд наалдана.
 */
/**
 * ХУГАЦААНЫ ЧАРТ — багана нь МӨНГӨ, муруй нь ХУРИМТЛАГДСАН ХУВЬ.
 *
 * ⚠️ ЦЭГҮҮДИЙГ ГАДНААС авна (2026-09-10). Урьд нь `timeline()`-ыг өөрөө
 * дууддаг байсныг өөрчилсөн шалтгаан: cashflow-гийн сарын хуваарилалт мөн
 * ЯГ ИЖИЛ зан үйлтэй (зум · hover · чарт/хүснэгт сэлгүүр · тэнхлэг) байх
 * ёстой. Хуулбарлавал нэгийг нь засахад нөгөө нь хоцорно.
 */
function Timeline({
  points, grain, total, mode,
}: {
  points: TimePoint[];
  /** Тэнхлэгийн шошгын хэлбэрийг ЭНЭ шийднэ (жил · улирал · сар) */
  grain: Grain;
  /**
   * ХУВИЙН МӨНГӨН СУУРЬ — hover-т «64.3% ≈ энэ хэдэн төгрөг» гэж бичихэд.
   * ⚠️ Цэгүүдийг бодоход хэрэглэсэн ЯГ ТЭР суурь байх ёстой, эс бөгөөс
   * дэлгэц дээрх хувь ба мөнгө хоорондоо зөрнө.
   */
  total: number;
  /** `table` бол ижил өгөгдлийг ХҮСНЭГТЭЭР — чартын ард байгаа тоо */
  mode: 'chart' | 'table';
}) {
  const all = points;
  /**
   * ЗААСАН үе — hover, эсвэл заагаагүй үед СҮҮЛИЙНХ.
   *
   * ⚠️ ШОШГЫГ ХОЁР ТУСДАА ДАВХАРТ байрлуулна:
   *   · хувь → цэгийн ДЭЭР (муруйн давхар),
   *   · мөнгөн дүн → тэнхлэгийн шошгын ДООР (мөнгөний давхар).
   * Хоёулаа зурвасын дотор нэг өндөрт байвал давхарлаж уншигдахаа болино.
   */
  const [hov, setHov] = useState<number | null>(null);
  /**
   * ЗУМЫН ЦОНХ — [эхлэл, төгсгөл] индекс, эсвэл `null` = бүтэн.
   *
   * ⚠️ ARCGIS ДАШБОАРДЫН ЗАН (2026-09-07, хэрэглэгчийн хүсэлт): 66 сарыг нэг
   * зурвасд шахахад цэг тус бүрийн хувь уншигдахгүй. Зумын зурваснаас
   * хэсгийг сонгоод томруулна — шошго бүр өөрийн зайтай болно.
   */
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  /**
   * ХҮСНЭГТИЙН ЭРЭМБЭ — ArcGIS-ийн атрибут хүснэгттэй ижил зан.
   *
   * ⚠️ Анхдагч нь ҮЕ ӨСӨХ дараалал: атрибут хүснэгт нь эх дарааллаа хадгалдаг
   * бөгөөд хугацааны цуваанд тэр нь цаг хугацааны дараалал. Толгой дарж
   * баганаар эрэмбэлнэ, дахин дарвал эсрэгээр.
   */
  const [sort, setSort] = useState<{ c: 'label' | 'sub' | 'amount' | 'pct'; d: 1 | -1 }>(
    { c: 'label', d: 1 },
  );
  const barRef = useRef<HTMLDivElement | null>(null);

  const N = all.length;
  const lo = zoom ? Math.max(0, Math.min(zoom[0], N - 1)) : 0;
  const hi = zoom ? Math.max(lo, Math.min(zoom[1], N - 1)) : N - 1;
  const pts = zoom ? all.slice(lo, hi + 1) : all;

  /**
   * Чирэлт — «шинээр сонгох», «зөөх», «ирмэгээс сунгах» гурвыг НЭГ логикоор.
   *
   * ⚠️ `setPointerCapture` ЗААВАЛ: заагуур зурваснаас гарахад чирэлт
   * тасрахгүй байх цорын ганц арга (хулгана хурдан хөдлөхөд байнга гардаг).
   *
   * ⚠️ `barRef`-ийг ЭВЕНТИЙН ДОТОР л уншина, гадна нь тусад нь функц
   * гаргахгүй: `react-hooks/refs` дүрэм нь ref уншдаг функцийг рендерийн
   * үед дуудагдаж мэдэх гэж үзээд сэрэмжлүүлдэг. Энд уншилт нь заавал
   * заагуурын үйлдлийн дараа тул аюулгүй бөгөөд дүрэм ч чимээгүй.
   */
  const drag = (mode: 'new' | 'move' | 'lo' | 'hi') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const track = barRef.current;
    /** Заагуурын x → цэгийн индекс */
    const idxAt = (clientX: number): number => {
      if (!track || N < 2) return 0;
      const r = track.getBoundingClientRect();
      const t = (clientX - r.left) / Math.max(1, r.width);
      return Math.max(0, Math.min(N - 1, Math.round(t * (N - 1))));
    };
    const start = idxAt(e.clientX);
    const a0 = lo;
    const b0 = hi;

    const move = (ev: PointerEvent) => {
      const i = idxAt(ev.clientX);
      if (mode === 'new') setZoom([Math.min(start, i), Math.max(start, i)]);
      else if (mode === 'lo') setZoom([Math.min(i, b0), b0]);
      else if (mode === 'hi') setZoom([a0, Math.max(i, a0)]);
      else {
        /* Зөөх — өргөнөө ХАДГАЛНА, хоёр ирмэгт хүрч зогсоно */
        const w = b0 - a0;
        const d = i - start;
        const s = Math.max(0, Math.min(N - 1 - w, a0 + d));
        setZoom([s, s + w]);
      }
    };
    const up = () => {
      el.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (!all.length) return <Empty label={tr('Төлөвлөгөөт хугацаатай ажил олдсонгүй')} />;

  /*
   * ХҮСНЭГТ — ЧАРТЫН ЯГ ТЭР ӨГӨГДӨЛ.
   *
   * ⚠️ ЗУМЫГ ҮЛ ТООМСОРЛОНО (`all`, `pts` БИШ): зум нь зурган дээр шошго
   * багтаах арга, өгөгдлийн шүүлт БИШ. Хүснэгтэд мөр нуух шалтгаангүй —
   * гүйлгэх нь чартаас хамаагүй хямд.
   *
   * ⚠️ Мөнгө нь ЭНД БҮТЭН (`mnt`), товчлолгүй: хүснэгт нь яг тоо харах газар.
   */
  if (mode === 'table') {
    /* ⚠️ ХУУЛБАР дээр эрэмбэлнэ — `all` нь `useMemo`-гийн үр дүн тул
       байрандаа эрэмбэлбэл дараагийн рендерийн муруй эвдэрнэ. */
    /**
     * ОН ба ДЭД ҮЕ — ТУСДАА БАГАНА (2026-09-07, хэрэглэгчийн хүсэлт).
     *
     * ⚠️ Дэд багана нь НАРИЙВЧЛАЛААС хамаарна: жилээр шүүхэд он өөрөө бүтэн
     * үе тул нэмэлт багана УТГАГҮЙ (бүх нүд хоосон байх болно). Улирал/сараар
     * шүүхэд л гарна.
     */
    const subCol = grain === 'month' ? tr('Сар') : grain === 'quarter' ? tr('Улирал') : null;
    const subOf = (p: { key: string; label: string }) => (
      grain === 'month' ? p.key.slice(5)
        : grain === 'quarter' ? (p.label.split(' ')[1] ?? '')
          : ''
    );
    /* ⚠️ `sub` нь ОНГҮЙ эрэмбэлнэ — «бүх жилийн 6-р сарыг зэрэгцүүлэх» гэсэн
       асуултад хариулна. Он-оор эрэмбэлэх нь `label` баганад бий. */
    const sorted = [...all].sort((a, b) => (
      sort.c === 'label' ? a.key.localeCompare(b.key) * sort.d
        : sort.c === 'sub' ? subOf(a).localeCompare(subOf(b)) * sort.d
          : sort.c === 'amount' ? (a.amount - b.amount) * sort.d
            : (a.pct - b.pct) * sort.d
    ));
    const head = (c: 'label' | 'sub' | 'amount' | 'pct', label: string, right = false) => (
      <th className={right ? g.tlThNum : undefined} aria-sort={
        sort.c !== c ? 'none' : sort.d === 1 ? 'ascending' : 'descending'
      }>
        <button
          type="button"
          className={g.tlSort}
          onClick={() => setSort((v) => (v.c === c ? { c, d: v.d === 1 ? -1 : 1 } : { c, d: 1 }))}
        >
          {label}
          <i aria-hidden>{sort.c !== c ? '' : sort.d === 1 ? '▲' : '▼'}</i>
        </button>
      </th>
    );
    return (
      <div className={g.tlTblWrap}>
        <table className={g.tlTbl}>
          <thead>
            <tr>
              {/* ⚠️ Мөрийн дугаар — ArcGIS-ийн атрибут хүснэгтийн эхний багана.
                  Эрэмбэ солигдоход ч 1-ээс эхэлнэ: энэ нь ХАРАГДАЦЫН дугаар,
                  бичлэгийн ID БИШ. */}
              <th className={g.tlThIdx}>№</th>
              {head('label', tr('Он'))}
              {subCol && head('sub', subCol)}
              {head('amount', tr('Олгосон дүн'), true)}
              {head('pct', tr('Нийт хөрөнгөд эзлэх хувь'), true)}
              <th className={g.tlThNum}>{tr('Хуримтлагдсан дүн')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.key}>
                <td className={g.tlThIdx}>{i + 1}</td>
                <td>{p.key.slice(0, 4)}</td>
                {subCol && <td>{subOf(p)}</td>}
                <td className={g.tlNum}>{p.amount > 0 ? mnt(p.amount) : ''}</td>
                <td className={g.tlNum}>{pct(p.pct)}</td>
                <td className={g.tlNum}>{mnt(cumOf(p.pct))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const maxAmt = Math.max(1, ...pts.map((p) => p.amount));
  /**
   * ХУРИМТЛАГДСАН ХУВИЙН МӨНГӨН ЭКВИВАЛЕНТ (2026-09-08, хэрэглэгчийн хүсэлт:
   * «64.3% хүрэхэд хэдэн төгрөг зарцуулсан бэ»).
   *
   * ⚠️ Суурь нь хугацааны шүүлтээс ҮЛ ХАМААРНА. Муруй нь өөрөө нийт төсөвт
   * эзлэх хувь тул түүнийг шүүгдсэн дэд дүнгээр үржүүлбэл 100%-д хүрсэн ч
   * нийт төсвөөс бага тоо гарч, хоёр тоо хоорондоо зөрчилдөнө.
   * ⚠️ Хамрах хүрээ нь «Нийт төсөв» индикатортой ЯГ ИЖИЛ (`inTotal`, Excel-ийн
   * `=+I8+I21`) — нэг дэлгэц дээр хоёр өөр «нийт» байвал аль нь ч итгэл
   * төрүүлэхгүй. Хасагдсан мөрүүдийн хувь бүгд 0 тул муруйн ХЭЛБЭР
   * өөрчлөгдөхгүй, зөвхөн мөнгөн шошго нь эх файлтай таарна.
   */
  const budget = total;
  const cumOf = (p: number) => (budget * Math.max(0, Math.min(100, p))) / 100;
  const n = pts.length;
  const at = hov != null && hov < n ? hov : n - 1;
  const cur = pts[at];
  /**
   * НАЛУУ ТЭНХЛЭГ — 12-оос олон үе харагдаж байвал.
   *
   * ⚠️ Хэвтээ шошго нь баганын өргөнөөс («2026-06» ≈ 44px) урт болмогц
   * хөршүүдтэйгээ ХОЛИЛДДОГ. Налуулбал шошго бүр өөрийн диагональ зурваст
   * суух тул БҮГДИЙГ нь бичиж болно.
   *
   * ⚠️ Налуу үед мөнгөн дүнг тэнхлэгээс ХАСНА: хоёр налуу мөр бие биенийхээ
   * дундуур гарна. Тэр тоо уншилтын мөрөнд hover-оор гарсаар байна.
   */
  const tilt = n > 24;
  /**
   * ТЭНХЛЭГИЙН ШОШГО — ЗӨВХӨН ДОТООД хэсэг («06», «II»), он нь ДООРХ зурваст.
   *
   * ⚠️ «2026-06» гэж бүтнээр бичихэд нүд бүрд он ДАВТАГДАЖ, 66 нүдэнд 66
   * удаа «2026» бичигдэнэ — уншигдацад юу ч нэмэхгүй атлаа шошгыг нэг нүдэнд
   * багтахааргүй урт болгож, налуулахаас өөр арга үлдэхгүй болдог байв
   * (2026-09-07, хэрэглэгчийн заавар). Он нь тасархай заагийн ХООРОНД нэг л
   * удаа гарна.
   */
  const shortLbl = (p: { key: string; label: string }): string => (
    grain === 'year' ? p.label
      : grain === 'quarter' ? (p.label.split(' ')[1] ?? p.label)
        : p.key.slice(5)
  );
  /**
   * ОНЫ БҮЛГҮҮД — зэргэлдээ нүднүүдийг он тус бүрээр нэгтгэнэ.
   *
   * ⚠️ Өргөнийг НҮДНИЙ ТООГООР өгнө (`flex` биш): тасархай зааг нь
   * `(i+1)/n` хувиар байрладаг тул оны зурвасын ирмэг ЯГ тэр хувь дээр
   * тулах ёстой — эс бөгөөс он ба зааг хоёр зөрж, аль он аль хэсэгт
   * хамаарах нь бүдгэрнэ.
   */
  const yrs: { y: string; c: number }[] = [];
  for (const p of pts) {
    const y = p.key.slice(0, 4);
    const last = yrs[yrs.length - 1];
    if (last && last.y === y) last.c += 1;
    else yrs.push({ y, c: 1 });
  }
  /**
   * ХУВИЙН ШОШГО — ЦЭГ БҮРД (2026-09-07, хэрэглэгчийн хүсэлт «бүх шошгыг
   * харуул»).
   *
   * ⚠️ ДАВХАР ЭГНЭЭ: 10-аас олон цэг байвал сондгой индексийн шошго нь дээш
   * шилжинэ. Нэг эгнээнд бүгдийг бичвэл хөрш шошгууд шууд давхарлана —
   * зумаар нарийсгах хүртэл ч уншигдахгүй. Хоёр эгнээ нь боломжит зайг
   * хоёр дахин нэмнэ.
   */
  const twoRow = n > 10;

  /* ⚠️ Цэгийн х-байрлал нь баганын ТӨВД — эс бөгөөс муруй баганаас хазайна */
  const xOf = (i: number) => ((i + 0.5) / n) * 100;
  const path = monotonePath(pts.map((p, i) => ({
    x: xOf(i),
    y: 100 - Math.max(0, Math.min(100, p.pct)),
  })));
  /**
   * ⚠️ ХҮЛЭЭГДЭЖ БУЙ ӨӨРЧЛӨЛТ (2026-09-08, хэрэглэгчийн заавар): багана нь
   * ЗАХИРАМЖИЙН дүн БИШ, ГҮЙЦЭТГЭЛИЙН ТӨЛБӨРИЙН АКТ (IPC) байх ёстой —
   * «хэдийг батлав» БИШ «хэдийг бодитоор олгов». IPC-ийн өгөгдөл хараахан
   * бэлэн БИШ тул одоохондоо `Zahiramj_niit_dun` хэвээр; бэлэн болмогц
   * `timeline()`-ийн `money` эх сурвалжийг л сольно (`gdash.ts`).
   *
   * ⚠️ ОЛГОСОН ДҮН нь БОСОО БАГАНА (2026-09-07, хэрэглэгчийн шийдвэр). Богино
   * хугацаанд талбайн (area) хэлбэрээр туршигдаад буцав: талбай нь зэргэлдээ
   * үеүүдийг ХОЛБОЖ, тасралтгүй урсгал мэт уншуулдаг. Гэтэл олголт нь тасалгаат
   * үйл явдал — тухайн үед олгосон эсвэл огт олгоогүй. Багана тэр тасалгааг
   * шууд харуулна.
   *
   * ⚠️ ХУВААРЬ НЬ МУРУЙНААС ТУСДАА: багана нь 0…max(мөнгө), муруй нь 0…100%.
   */

  return (
    <div className={g.tl}>
      {/* Уншилтын мөр — заасан (эсвэл сүүлийн) үеийн хоёр тоо НЭГ газар */}
      <div className={g.tlHead}>
        <span className={g.tlHeadLbl}>{cur.label}</span>
        <b className={g.tlHeadPct}>{pct(cur.pct)}</b>
        {/* ⚠️ ХУРИМТЛАЛЫН мөнгө — тухайн үеийн олголт БИШ. «64.3%» гэдэг нь
            ямар хэмжээний хөрөнгө болохыг дангаараа хэлдэггүй. */}
        <span className={g.tlHeadAmt}>{mntShort(cumOf(cur.pct))}</span>
        {/* Тухайн үеийн олголт — хуримтлалаас ЗУРААСААР тусгаарлана */}
        <span className={g.tlHeadSub}>
          {cur.amount > 0 ? tr('үүнээс {0}', mntShort(cur.amount)) : tr('олголтгүй')}
        </span>
        {zoom && (
          <button type="button" className={g.tlReset} onClick={() => setZoom(null)}>
            {tr('Бүтэн харах')}
          </button>
        )}
      </div>

      {/*
        * ⚠️ ЗУРВАС · ТЭНХЛЭГ · ОНЫ МӨР ГУРВЫГ НЭГ БҮРХҮҮЛД (2026-09-07).
        * Заагийн тасархай зураас гурвуулангийн дундуур ТАСРАЛТГҮЙ явах ёстой.
        * Урьд нь зураас нь зурвасын дотор, оны мөрөнд нь тусдаа `border-left`
        * байсан тул дунд нь тэнхлэгийн мөр зүсэгдэж, зураас тасалддаг байв.
        */}
      <div className={g.tlMain}>
        {/*
          * ЖИЛИЙН ЗААГ — тасархай босоо зураас.
          *
          * ⚠️ ХАМГИЙН ЭХНИЙ хүүхэд: DOM дараалал нь давхаргын дараалал тул
          * багана, муруй, цэг гурвын БҮГДИЙН ард үлдэнэ. Заагийг дээр нь
          * тавибал 1px зураас нь цэгийг тасалж, чарт бүр бужигнана.
          *
          * ⚠️ Зөвхөн ЖИЛ солигдох заагт — улирал/сарын нарийвчлалд бүх нүдийг
          * зураасаар хуваавал тор болж, хэлбэр нь уншигдахаа болино.
          */}
        <div className={g.tlGrid} aria-hidden>
          {pts.map((p, i) => (
            i < n - 1 && p.key.slice(0, 4) !== pts[i + 1].key.slice(0, 4)
              ? <i key={p.key} className={g.tlYr} style={{ left: `${((i + 1) / n) * 100}%` }} />
              : null
          ))}
          {/*
            * ЗААГУУРЫН ЗУРААС — hover хийсэн ҮЕД гарна.
            *
            * ⚠️ ЖИЛИЙН ЗААГААС ӨӨР ӨНГӨӨР (муруйн өнгөөр): хоёулаа саарал
            * тасархай байвал «энэ бол оны зааг уу, миний зааж буй үе үү» гэдэг нь
            * ялгагдахгүй. Он хоорондын зураас хэвээрээ үлдэнэ.
            *
            * ⚠️ `hov` шалгана, `at` БИШ: `at` нь заагаагүй үед СҮҮЛИЙНХ рүү
            * унадаг тул зураас хулгана хүрээгүй байхад ч байнга гарна.
            */}
          {hov != null && hov < n && (
            <i className={g.tlCursor} style={{ left: `${xOf(hov)}%` }} />
          )}
        </div>

      <div className={g.tlPlot}>
        <div className={g.tlBars}>
          {pts.map((p, i) => (
            <div
              key={p.key}
              className={`${g.tlCol} ${i === at ? g.tlColOn : ''}`}
              onMouseEnter={() => setHov(i)}
              onMouseLeave={() => setHov((v) => (v === i ? null : v))}
            >
              <i className={g.tlBar} style={{ height: `${(p.amount / maxAmt) * 100}%` }}>
                {/* ⚠️ Дүн нь БАГАНЫ ДЭЭР (2026-09-07, хэрэглэгчийн заавар).
                    Тэнхлэгийн доор байхад аль дүн аль баганынх болох нь
                    нүдээр мөрдөх зайтай болж, оны шошготой ч хольцолдож
                    байв. Багана дээрээ бол холбоос нь шууд. */}
                {!tilt && p.amount > 0 && (
                  <b className={g.tlBarVal}>{mntShort(p.amount)}</b>
                )}
              </i>
            </div>
          ))}
        </div>

        <svg className={g.tlSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path className={g.tlLine} d={path} fill="none" vectorEffect="non-scaling-stroke" />
        </svg>

        {/*
          * Цэг — БҮГД хувийн шошготой. Заасан цэг томорно.
          *
          * ⚠️ ТУСДАА БҮРХҮҮЛД: `bottom: %` нь ХАМГИЙН ОЙРЫН байрлуулсан
          * өвгөөс тоологддог. Урьд нь тэр нь `.tlPlot` байсан бөгөөд түүний
          * өндөрт 20px padding НЭМЭГДДЭГ тул цэг бүр муруйнаасаа яг тэр
          * 20px-ээр ДЭЭГҮҮР зурагдаж, шошго нь бүр 29px тасардаг байв
          * (2026-09-06). Энэ бүрхүүл нь SVG-тэй ЯГ ижил `inset`-тэй.
          */}
        <div className={g.tlDots}>
          {pts.map((p, i) => (
            <span
              key={p.key}
              className={`${g.tlDot} ${i === at ? g.tlDotOn : ''}`}
              style={{
                left: `${((i + 0.5) / n) * 100}%`,
                bottom: `${Math.max(0, Math.min(100, p.pct))}%`,
              }}
            >
              <b className={twoRow && i % 2 === 1 ? g.tlDotUp : undefined}>{pct(p.pct)}</b>
            </span>
          ))}
        </div>
      </div>

      {/* ⚠️ Мөнгөн дүн ЗУРВАС ДОТОР биш ЭНД — муруйн хувийн шошготой нэг
          өндөрт таарч давхарлахаас сэргийлнэ. */}
      <div className={`${g.tlAxis} ${tilt ? g.tlAxisTilt : ''}`}>
        {pts.map((p, i) => (
          <span key={p.key} className={i === at ? g.tlAxisOn : undefined}>
            <b>{shortLbl(p)}</b>
          </span>
        ))}
      </div>

      {/* ОНЫ ЗУРВАС — тасархай заагийн хооронд нэг удаа */}
      {grain !== 'year' && (
        <div className={g.tlYrRow} aria-hidden>
          {yrs.map((v, i) => (
            <span key={`${v.y}-${i}`} style={{ width: `${(v.c / n) * 100}%` }}>{v.y}</span>
          ))}
        </div>
      )}
      </div>

      {/*
        * ЗУМЫН ЗУРВАС — ArcGIS дашбоардын хугацааны гулсуурын зан.
        *
        * ⚠️ ЗӨВХӨН 12-оос олон үед: цөөн үед зум нь ашиггүй бөгөөд зурвас нь
        * зөвхөн зай иддэг.
        *
        * ⚠️ Хоосон зайд чирэх = ШИНЭЭР сонгох; цонхон дотор чирэх = ЗӨӨХ;
        * ирмэг дээр чирэх = СУНГАХ. Гурвуулаа нэг `drag()` дотор — тусдаа
        * бичвэл ирмэгүүд хоорондоо солигдох (`lo > hi`) тохиолдол гарна.
        */}
      {N > 12 && (
        <div className={g.tlZoom} ref={barRef} onPointerDown={drag('new')}>
          <div
            className={g.tlZoomWin}
            style={{
              left: `${(lo / (N - 1)) * 100}%`,
              right: `${100 - (hi / (N - 1)) * 100}%`,
            }}
            onPointerDown={drag('move')}
          >
            <i className={g.tlZoomGrip} onPointerDown={drag('lo')} />
            <i className={`${g.tlZoomGrip} ${g.tlZoomGripR}`} onPointerDown={drag('hi')} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ БАРУУН — ГАЗАР ЧӨЛӨӨЛӨЛТ ══════════════════════ */

/**
 * ДЭД БАГЦ бүрд давхцаж буй ҮЛДСЭН нэгж талбарууд (ObjectID).
 *
 * ⚠️ ЗӨВХӨН ШААРДЛАГАТАЙ ҮЕД (`enabled`). 42 дэд багц × нэг орон зайн асуулга
 * = 42 хүсэлт; хуудас нээх бүрд явуулбал бусад картын өгөгдөл хойшилно
 * (`PkgProg.tsx`-д 131 хүсэлтийн улмаас яг ийм асуудал гарч, задаргаа нь
 * «Газар чөлөөлөлт» харагдац руу шилжсэн). Хэрэглэгч шалтгаан сонгосон
 * үед л эхэлнэ.
 *
 * ⚠️ `overlapLeftParcels` нь үр дүнгээ ӨӨРӨӨ кэшилдэг тул шалтгаан солих
 * бүрд сүлжээ дахин хөндөгдөхгүй.
 *
 * ⚠️ ТОО биш OID — шалтгаанаар нарийсгахад хоёр олонлогийг огтолно.
 */
function useOverlapBySubPkg(enabled: boolean) {
  const subs = useAsync<SubPkg[]>(loadSubPkgLayers, []);
  const [out, setOut] = useState<Map<string, number[]> | 'error' | null>(null);

  useEffect(() => {
    if (!enabled || subs.state !== 'ready') return;
    let alive = true;
    Promise.allSettled(
      subs.data.map(async (sp) => [
        sp.key,
        (await overlapLeftParcels(sp.layerIds.map((layerId) => ({ layerId, where: null })))).oids,
      ] as const),
    ).then((res) => {
      if (!alive) return;
      if (res.every((r) => r.status === 'rejected')) { setOut('error'); return; }
      const m = new Map<string, number[]>();
      for (const r of res) if (r.status === 'fulfilled' && r.value[1].length > 0) m.set(r.value[0], r.value[1]);
      setOut(m);
    });
    return () => { alive = false; };
  }, [enabled, subs]);

  return { subs, out };
}

/** Газар чөлөөлөлтийн нэгж талбарын давхарга — шалтгааны зум үүн дээр */
const PARCEL_LAYER = 'land:left';

function LandCard({
  onShowLayers,
  active,
  reason,
  byReason,
  onPickReason,
}: {
  /** `null` = сонголт ТАЙЛАГДСАН, өмнөх давхаргын төлөвийг сэргээ */
  onShowLayers: (ids: string[] | null) => void;
  /** Шүүлтэд багтсан дэд багц → ажлын төрлүүд; `null` = өгөгдөл хараахан алга */
  active: Map<string, string[]> | null;
  /**
   * СОНГОСОН ШАЛТГААН — БҮРХҮҮЛИЙН төлөв (2026-09-07).
   *
   * ⚠️ Энэ карт ӨӨРӨӨ БАРИХГҮЙ: сонголт нь газрын зураг ба «Саад — багцаар»
   * картад ч үйлчилдэг тул нэг эх сурвалж дээрээс тархах ёстой.
   */
  reason: string | null;
  byReason: ReturnType<typeof useAsync<Map<string, Set<number>>>>;
  onPickReason: (k: string) => void;
}) {
  const land = useAsync(loadLandStatus, []);
  const { subs, out: ov } = useOverlapBySubPkg(reason != null);

  /**
   * АЖЛЫН ТӨРӨЛ бүрд ТУХАЙН ШАЛТГААНТАЙ давхцсан талбарын тоо.
   *
   * ⚠️ Хоёр олонлогийн ОГТЛОЛЦОЛ: `ov` нь ОРОН ЗАЙН давхцал (аль талбар аль
   * дэд багцын давхаргатай), `byReason` нь АТРИБУТ (аль талбар яагаад
   * үлдсэн). Аль нэгийг дангаар нь ашиглавал асуултын хагаст л хариулна.
   *
   * ⚠️ ДАВХАРДЛЫГ ОЛОНЛОГООР АРИЛГАНА: нэг төрөлд олон дэд багц харьяалагдах
   * бөгөөд нэг нэгж талбар тэдгээрийн ХЭД ХЭДТЭЙ давхцаж болно. Тоог нь дүнгээр
   * нэмбэл нэг талбар олон удаа тоологдож, шалтгааны нийт тооноос ДАВНА.
   *
   * ⚠️ Огтлолцол нь ДЭД БАГЦЫН түвшинд тооцогдсон хэвээр (`ov`) — зөвхөн
   * ҮР ДҮНГ нь төрлөөр дахин хувааж байна. Тиймээс нэмэлт сүлжээний хүсэлт
   * ҮҮСЭХГҮЙ бөгөөд мөр дарахад асаах давхаргууд нь тэр төрлийн БҮХ дэд багцын
   * давхарга болно.
   */
  const rows = useMemo(() => {
    if (reason == null || ov == null || ov === 'error' || subs.state !== 'ready') return [];
    const want = byReason.state === 'ready' ? byReason.data.get(reason) : null;
    if (!want) return [];
    const acc = new Map<string, { oids: Set<number>; layers: Set<string> }>();
    for (const sp of subs.data) {
      /* ⚠️ ХУГАЦААНЫ ШҮҮЛТ: тухайн үед ажилгүй дэд багц ЖАГСААЛТААС ГАРНА */
      const types = active?.get(sp.key);
      if (!types || types.length === 0) continue;
      const hit = (ov.get(sp.key) ?? []).filter((o) => want.has(o));
      if (hit.length === 0) continue;
      for (const ty of types) {
        let a = acc.get(ty);
        if (!a) { a = { oids: new Set(), layers: new Set() }; acc.set(ty, a); }
        for (const o of hit) a.oids.add(o);
        for (const id of sp.layerIds) a.layers.add(id);
      }
    }
    return [...acc]
      .map(([ty, a]) => ({
        key: ty,
        label: nice(ty),
        layerIds: [...a.layers],
        value: a.oids.size,
        sub: 0,
      }))
      .sort((x, y) => y.value - x.value);
  }, [reason, ov, subs, byReason, active]);

  /**
   * СОНГОСОН АЖЛЫН ТӨРӨЛ — мөр тодруулах ба зургийн холбоос.
   *
   * ⚠️ Дахин дарвал ТАЙЛАГДАНА: давхарга унтарч, зураг өмнөх төлөв рүүгээ
   * буцна. Урьд нь зөвхөн асаадаг байсан тул хэдэн мөр дарсны дараа зураг
   * бүх давхаргаараа дүүрч, аль нь юу болох нь ойлгомжгүй болдог байв.
   */
  const [pick, setPick] = useState<string | null>(null);

  /*
   * ⚠️ Шалтгаан солигдвол төрлийн сонголт УТГАА АЛДДАГ (мөрүүд нь өөр болно).
   * `useEffect` БИШ, РЕНДЕРИЙН ҮЕД — React-ийн «пропоос хамаарсан төлөвийг
   * тохируулах» загвар. Эффектээр хийвэл нэг агшин хуучин сонголт тодорсон
   * хэвээр зурагдаад дараа нь арилж, мөр анивчина.
   * ⚠️ Зургийн давхаргыг ЭНД буцаахгүй (рендерийн үед гаж нөлөө хориотой) —
   * түүнийг эцгийн `pickReason` хийнэ.
   */
  const [prevReason, setPrevReason] = useState(reason);
  if (prevReason !== reason) {
    setPrevReason(reason);
    setPick(null);
  }

  /** Мөр дарах — асаах/тайлах */
  const show = (key: string) => {
    if (pick === key) {
      setPick(null);
      onShowLayers(null);
      return;
    }
    const r = rows.find((x) => x.key === key);
    if (!r) return;
    /* ⚠️ Өмнөх сонголтыг ЭХЛЭЭД буцаана — эс бөгөөс хоёр төрлийн давхарга
       зэрэг асаж, аль нь алины давхцал болох нь мэдэгдэхгүй. */
    if (pick != null) onShowLayers(null);
    setPick(key);
    onShowLayers(r.layerIds);
  };

  return (
    <Section title={tr('Газар чөлөөлөлт')}>
      <Data q={land} minH={220}>
        {(d) => (
          <>
            {/* ⚠️ «Чөлөөлөлтийн хувь» ЭНД БАЙХГҮЙ: тэр тоо зургийн дээрх
                индикаторын зурваст аль хэдийн бий — давхардал. */}
            <Stats cols={1}>
              <Stat value={num(d.remaining)} label={tr('Чөлөөгдөөгүй нэгж талбар')} accent />
            </Stats>

            <h4 className={g.sub}>{tr('Чөлөөгдөөгүй шалтгаанаар')}</h4>
            {d.reasons.length === 0
              ? <Empty label={tr('Шалтгаан бүртгэгдээгүй')} />
              : (
                <Bars
                  color={BAR_HUE}
                  selected={reason}
                  /* Дахин дарвал сонголт тайлагдана — цуцлах тусдаа товчгүй */
                  onSelect={onPickReason}
                  items={countBars(
                    d.reasons.map((r) => ({ key: r.label, label: r.label, value: r.n, sub: 0 })),
                    { one: tr('нэгж талбар'), many: tr('чөлөөгдөөгүй талбарын') },
                  )}
                />
              )}

            <h4 className={g.sub}>{tr('Ажлын төрлөөр давхцаж буй')}</h4>
            {/* ⚠️ Шалтгаан сонгоогүй үед ЮУ Ч БИЧИХГҮЙ — «Дээрээс шалтгаан
                сонгоно уу» гэсэн заавар хэрэглэгчийн шийдвэрээр хасагдав
                (2026-09-06). */}
            {reason == null ? null
              : ov == null || byReason.state === 'loading' ? (
              <p className={g.wait}>{tr('Давхцлыг тооцож байна…')}</p>
            ) : ov === 'error' || byReason.state === 'error' ? (
              <Empty label={tr('Давхцал тооцогдсонгүй')} />
            ) : rows.length === 0 ? (
              <Empty label={tr('Давхцал илрээгүй')} />
            ) : (
              <Bars
                color={BAR_HUE}
                /* Дарахад давхарга зурагт асаж, түүн рүү ойртоно; дахин
                   дарвал тайлагдаж, зураг өмнөх төлөв рүүгээ буцна. */
                selected={pick}
                onSelect={show}
                items={countBars(rows, { one: tr('нэгж талбар'), many: tr('давхцлын') })}
              />
            )}
          </>
        )}
      </Data>
    </Section>
  );
}

/* ══════════════════════ БАРУУН — СААД, БАГЦААР ══════════════════════ */

/**
 * БАГЦ БҮР ДЭЭР ДАВХЦАЖ БУЙ ҮЛДСЭН НЭГЖ ТАЛБАР.
 *
 * ⚠️ Ачаалагч нь «Газар чөлөөлөлт» харагдацтай ХУВААЛЦСАН (`@/lib/pkgSaad`) —
 * тэнд кэшлэгдсэн тул хоёр дахь харагдац НЭМЭЛТ хүсэлт үүсгэхгүй. Тусдаа
 * хуулбар бичвэл 55 багцын огтлолцол хоёр дахин явна.
 *
 * ⚠️ ХУГАЦААНЫ ШҮҮЛТЭД ОРОХГҮЙ: нэгж талбарт төлөвлөгөөт хугацааны талбар
 * байхгүй тул жил/улирлаар шүүвэл хуурамч тэг гарна ([[LandCard]]-тай нэг зарчим).
 *
 * ⚠️ ЗӨВХӨН СААДТАЙ багц — `loadPkgOverlaps` нь тэгүүдийг аль хэдийн шүүсэн.
 */
function SaadCard({
  onShowLayers,
  keys,
  oids,
}: {
  /** `null` = сонголт ТАЙЛАГДЛАА, давхаргыг өмнөх төлөвт нь буцаа */
  onShowLayers: (ids: string[] | null) => void;
  /**
   * ХУГАЦААНЫ ШҮҮЛТЭД багтсан багцын түлхүүрүүд. `null` = шүүлтгүй (бүгд).
   *
   * ⚠️ Шүүлт ИДЭВХГҮЙ үед `null` дамжина, БҮХ ТҮЛХҮҮРИЙН олонлог БИШ:
   * cashflow-д огт байхгүй багц (барилгын блокоос гарсан нэрс) байдаг тул
   * бүтэн олонлогоор шүүвэл тэдгээр нь шүүлтгүй үед ч чимээгүй алга болно.
   */
  keys: Set<string> | null;
  /**
   * СОНГОСОН ШАЛТГААНЫ нэгж талбарууд. `null` = шалтгаан сонгоогүй (бүгд).
   *
   * ⚠️ Сонгогдвол багц бүрийн давхцлыг ЭНЭ ОЛОНЛОГТОЙ ОГТЛОЛЦУУЛНА: «зөвшилцүх»
   * дарахад «зөвшилцүх шалтгаантай талбар аль багцад саад болж байна» гэсэн
   * асуултын хариу гарна. Огтлолцолгүй багц жагсаалтаас бүрмөсөн гарна —
   * тэр багцад энэ шалтгаанаар саад БАЙХГҮЙ гэсэн үг.
   */
  oids: Set<number> | null;
}) {
  const q = useAsync(loadPkgOverlaps, []);
  /**
   * СОНГОСОН БАГЦ — дахин дарвал ТАЙЛАГДАНА (2026-09-07, хэрэглэгчийн хүсэлт).
   *
   * ⚠️ Цуцлах ТУСДАА товч байхгүй: жагсаалтын мөр өөрөө сэлгүүр. «Чөлөөгдөөгүй
   * шалтгаанаар» картын зантай ижил — нэг картын дотор хоёр өөр цуцлах арга
   * байвал хэрэглэгч аль нь юуг цуцлахыг таамаглах хэрэгтэй болно.
   */
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => {
    if (q.state !== 'ready') return [];
    const byKey = keys ? q.data.filter((r) => keys.has(r.key)) : q.data;
    if (!oids) return byKey.map((r) => ({ ...r, hit: r.oids }));
    return byKey
      .map((r) => ({ ...r, hit: r.oids.filter((o) => oids.has(o)) }))
      .filter((r) => r.hit.length > 0)
      .sort((a, b) => b.hit.length - a.hit.length);
  }, [q, keys, oids]);
  /**
   * ХҮЧИНТЭЙ сонголт — жагсаалтад БАЙГАА эсэхээр шалгагдана.
   *
   * ⚠️ `useEffect`-ээр тэглэхгүй (react-hooks/set-state-in-effect): шалтгаан
   * эсвэл хугацаа солигдоход сонгосон багц шинэ жагсаалтад байхгүй байж болох
   * бөгөөд түүнийг ТООЦОЖ ГАРГАХ нь нэмэлт рендергүй, найдвартай.
   */
  const cur = sel != null && rows.some((r) => r.key === sel) ? sel : null;
  return (
    <Section
      title={tr('Тулгамдаж буй асуудал')}
      /* ⚠️ ЯЛГААТАЙ талбар — зурвасуудын НИЙЛБЭР БИШ. Нэг үлдсэн нэгж
         талбар хэд хэдэн багцын шугам/блоктой зэрэг огтлолцоно (амьдаар: 105
         талбарын 73 нь 2–7 багцад тоологдож, нийлбэр 244 болдог). `Gazar`
         харагдацад 2026-09-06-нд яг үүнийг зассан — энэ бол тэр кодын
         хуулбар тул ижил дүрэм үйлчилнэ. */
      note={rows.length > 0
        ? tr('{0} багц · {1} талбар',
            num(rows.length),
            num(new Set(rows.flatMap((r) => r.hit)).size))
        : undefined}
    >
      <Data q={q} minH={160}>
        {() => (rows.length === 0
          ? <Empty label={tr('Аль ч багц дээр давхцсан үлдсэн нэгж талбар алга.')} />
          : (
            <Bars
              color="var(--bad)"
              /* ⚠️ Эхний 8 — баруун багана нарийн; үлдсэнийг «дэлгэх» товчоор */
              limit={8}
              selected={cur}
              onSelect={(k) => {
                const next = k === cur ? null : k;
                setSel(next);
                const r = next != null ? rows.find((x) => x.key === next) : null;
                onShowLayers(r ? r.layerIds : null);
              }}
              items={rows.map((r) => ({
                key: r.key,
                label: nice(tr(r.name)),
                value: r.hit.length,
                display: tr('{0} талбар', num(r.hit.length)),
              }))}
            />
          ))}
      </Data>
    </Section>
  );
}

/* ══════════════════════ БАРУУН — ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨ ══════════════════════ */

/**
 * Хэмжээ авах давхаргууд — id ба картын шошго.
 *
 * ⚠️ Нэгжийг ГАРААР бичихгүй: `qtyText` нь давхаргын өөрийнх нь `qty.unit`-ыг
 * (м / км / м²) уншиж, жижиг утгыг ухаалаг нэгжид хөрвүүлдэг. Гараар «км» гэж
 * бичвэл метрээр хөтлөгддөг давхарга 1000 дахин буруу гарна.
 *
 * ⚠️ `LAYER_BY_ID`-д БАЙХГҮЙ id нь картаас чимээгүй унана — үйлчилгээ
 * солигдоход «0 км» гэсэн худал мөр үлдэхээс сэргийлнэ.
 */
const PLAN_QTY: { id: string; label: string }[] = [
  { id: 'road', label: tr('Нийт замын урт') },
  { id: 'et:15', label: tr('Инженерийн бэлтгэлийн урт') },
  { id: 'nogoon', label: tr('Ногоон байгууламж') },
];

/** Инженерийн шугам сүлжээ — гурван гэр бүлийн давхаргын нийлбэр урт */
const NET_FAMILIES: PkgFamily[] = ['net', 'pow', 'src'];

function PlanCard({ totals }: { totals: ReturnType<typeof usePlanTotals> }) {
  /**
   * ⚠️ «Баригдаж эхэлсэн» нь `BUILDING` давхаргын БҮХ обьект (113 блок): тэр
   * давхарга нь өөрөө барилга угсралт эхэлсэн блокуудын жагсаалт. Нийт
   * ТӨЛӨВЛӨГДСӨН барилга нь ерөнхий төлөвлөгөөний `et:24`-д — ӨӨР давхарга
   * тул хоёр тоог хольж болохгүй.
   */
  const started = useAsync(
    async () => Number((await queryStats(BUILDING.url, [count(BUILDING.oid, 'n')], '1=1')).n ?? 0),
    [],
  );

  return (
    <Section title={tr('Ерөнхий төлөвлөгөө')}>
      <Data q={totals} minH={200}>
        {(t) => {
          const cnt = (id: string) => t.get(id)?.n ?? null;
          const qty = (id: string) => {
            const d = LAYER_BY_ID[id];
            const q = t.get(id)?.q;
            return d && q != null ? qtyText(d, q) : null;
          };

          /* Шугам сүлжээний нийт урт — гэр бүлийн давхаргууд нь бүгд ижил
             нэгжтэй (метр) тул нийлбэр нь утгатай. Аль нэг нь дутвал
             нийлбэрт орохгүй — тоо БАГА гарна, ХУДАЛ гарахгүй. */
          const netIds = [...new Set(NET_FAMILIES.flatMap((f) => PKG_BY_FAMILY[f] ?? []))];
          const netM = netIds.reduce((s, id) => s + (t.get(id)?.q ?? 0), 0);

          const lines: { key: string; label: string; text: string }[] = [];
          for (const p of PLAN_QTY) {
            const text = qty(p.id);
            if (text) lines.push({ key: p.id, label: p.label, text });
          }
          if (netM > 0) {
            lines.push({
              key: 'net',
              label: tr('Инженерийн шугам сүлжээ'),
              text: tr('{0} км', num(netM / 1000, 1)),
            });
          }
          const zones = cnt('zone');
          if (zones != null) lines.push({ key: 'zone', label: tr('Хот төлөвлөлтийн бүс'), text: num(zones) });

          return (
            <>
              <Stats cols={2}>
                <Stat
                  value={cnt('et:24') == null ? '—' : num(cnt('et:24')!)}
                  label={tr('Нийт төлөвлөгдсөн барилга')}
                  accent
                />
                <Stat
                  value={started.state === 'ready' ? num(started.data) : '…'}
                  label={tr('Баригдаж эхэлсэн блок')}
                />
              </Stats>
              {lines.length > 0 && (
                <ul className={g.plain}>
                  {lines.map((l) => (
                    <li key={l.key}><span>{l.label}</span><b className="num">{l.text}</b></li>
                  ))}
                </ul>
              )}
            </>
          );
        }}
      </Data>
    </Section>
  );
}

/* ══════════════════════ БАРУУН — ХАБ ══════════════════════ */

function HseCard() {
  const hse = useAsync(loadHseNow, []);
  /**
   * ⚠️ Огноог ЗААВАЛ үзүүлнэ — маягт өдөр бүр бөглөгддөггүй тул «өнөөдрийн
   * байдлаар» гэдэг нь сүүлийн бүртгэлийн өдөр. Гэвч тайлбар бичихгүй, зөвхөн
   * ОГНОО — гарчгийн баруун талд (`note`) сууна: тоонуудын доор бүтэн
   * өгүүлбэр байснаа хэрэглэгч хассан (2026-09-06).
   */
  const stamp = hse.state === 'ready' ? hse.data?.date : null;
  return (
    <Section title={tr('ХАБ')} note={stamp || undefined}>
      <Data q={hse} minH={130}>
        {(d) => (d == null ? <Empty label={tr('Бүртгэл алга')} /> : (
          <Stats cols={3}>
            <Stat value={num(d.workers)} label={tr('Ажиллаж буй хүн')} accent />
            <Stat value={num(d.equipment)} label={tr('Техник хэрэгсэл')} />
            <Stat value={num(d.manHours)} label={tr('Хүн цаг')} />
          </Stats>
        ))}
      </Data>
    </Section>
  );
}

export default GeneralDash;
